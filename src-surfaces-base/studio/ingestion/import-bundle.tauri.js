/* H2O Studio Ingestion — Full Bundle Importer (Desktop / Tauri)
 *
 * M2b-1 / M2b-2 / M2c-3 — Desktop-only dry-run + merge-mode importer for
 * the existing Studio full bundle JSON format
 * (schema "h2o.studio.fullBundle.v2"). Tolerates v1.
 *
 * Dry-run side (M2b-1): READ-ONLY. Parses the bundle, counts incoming
 * entities, compares against the SQLite stores + the chrome.storage.local
 * polyfill, and returns a dry-run plan whose top-level shape matches the
 * MV3 dryRunImportFullBundle handler so the existing #/migrate/import UI
 * works on Desktop without changes.
 *
 * Write side (M2b-2 + M2c-3): MERGE-ONLY. importBundle walks the bundle in
 * safe dependency order (catalogs first, then chats, then snapshots, then
 * folder/label/tag bindings, then opaque KV blobs) and persists through
 * the existing H2O.Studio.store.* SQLite-backed adapters. Each entity is
 * pre-checked via .get(id) and skipped if it already exists, so re-running
 * the same bundle on the same DB writes zero rows. Overwrite mode is
 * rejected at the top of importBundle — Desktop V1 stays append-only.
 * importFolderStateOnly is a lighter Phase-A entry point that runs only
 * importFolders + importFolderBindings against a folder-state payload.
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file
 * is a silent no-op and registers nothing; the existing MV3 dry-run /
 * import handlers continue to serve callArchive requests through
 * platform.messaging.
 *
 * Wire format covered:
 *   bundle = {
 *     schema: 'h2o.studio.fullBundle.v2',
 *     chatArchive: { chats:[{chatId, snapshots:[{snapshotId,...}]}],
 *                    catalogs:{ categories:[{id,...}], labels:[{id,...}] } },
 *     chromeStorageLocal: { [allowlistedKey]: value, ... },
 *     libraryKv: [{ key, value }, ...]
 *   }
 *
 * Allow/deny policy is mirrored from the MV3 handler so dry-run counts
 * match what the actual import does.
 *
 * Contracts:
 *   surfaces/studio/store/*.tauri.js (read via public APIs only)
 *   surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md
 */
(function (global) {
  'use strict';

  /* ── Tauri detection — bail otherwise ─────────────────────────────── */
  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.ingestion && H2O.Studio.ingestion.__installed) return;

  /* ── Allow / deny policy (mirrored from MV3 handler) ──────────────── */
  var STORAGE_DENY_PREFIXES = ['h2oIdentity', 'h2oExtDev'];
  var STORAGE_DENY_EXACT    = ['h2o:library:cross-surface:broadcast', 'h2o:studio:lastHash'];
  var STORAGE_ALLOW_PREFIXES = [
    'h2o:archiveWorkbench:',
    'h2o:prm:cgx:fldrs:',
    'h2o:prm:cgx:nlnhghlghtr:',
    'h2o:prm:cgx:library:',
    'h2o:prm:cgx:ansn:',
    'h2o:prm:cgx:mnmp:',
    'ho:chat-',
    'ho:chat-meta-',
  ];
  var KV_ALLOW_PREFIX = 'h2o:prm:cgx:library:';
  var FOLDER_STATE_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  var DB_URL = 'sqlite:studio-v1.db';
  var BULK_MIGRATION_IDENTITY = 'f15.bulk-migration';

  function isAllowedStorageKey(key) {
    var k = String(key || '');
    if (!k) return false;
    for (var i = 0; i < STORAGE_DENY_EXACT.length; i += 1) {
      if (k === STORAGE_DENY_EXACT[i]) return false;
    }
    for (var j = 0; j < STORAGE_DENY_PREFIXES.length; j += 1) {
      if (k.indexOf(STORAGE_DENY_PREFIXES[j]) === 0) return false;
    }
    for (var n = 0; n < STORAGE_ALLOW_PREFIXES.length; n += 1) {
      if (k.indexOf(STORAGE_ALLOW_PREFIXES[n]) === 0) return true;
    }
    return false;
  }
  function isAllowedKvKey(key) {
    var k = String(key || '');
    return !!k && k.indexOf(KV_ALLOW_PREFIX) === 0;
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function numericCount(value) {
    var n = Number(value);
    return isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  }

  function looksLikeOpaqueTitle(value, id) {
    var text = cleanString(value);
    var chatId = cleanString(id);
    if (!text) return true;
    if (chatId && text === chatId) return true;
    if (/^(imported chat|linked chat|untitled chat|link|chatgpt)$/i.test(text)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
    if (/^[0-9a-f][0-9a-f-]{23,}$/i.test(text)) return true;
    if (/^(imported|chat|conversation)[-_:][a-z0-9-]{12,}$/i.test(text)) return true;
    return false;
  }

  function friendlyShellTitle(values, id, fallback) {
    var list = Array.isArray(values) ? values : [values];
    for (var i = 0; i < list.length; i += 1) {
      var title = cleanString(list[i]);
      if (title && !looksLikeOpaqueTitle(title, id)) return title;
    }
    return cleanString(fallback) || 'Imported chat';
  }

  function safeMeta(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  /* ── chrome.storage.local helper (Promise-based) ──────────────────── */
  function chromeStorageGet(keys) {
    return new Promise(function (resolve) {
      try {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local) {
          resolve({}); return;
        }
        var arr = Array.isArray(keys) ? keys : [keys];
        if (arr.length === 0) { resolve({}); return; }
        global.chrome.storage.local.get(arr, function (items) { resolve(items || {}); });
      } catch (_) { resolve({}); }
    });
  }

  /* ── Bundle parsing + schema validation ───────────────────────────── */
  function parseBundle(input) {
    var raw = input;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); }
      catch (e) { return { bundle: null, error: 'Invalid JSON: ' + (e && e.message || e) }; }
    }
    if (!raw || typeof raw !== 'object') {
      return { bundle: null, error: 'Bundle is not an object' };
    }
    var schema = String(raw.schema || '').trim();
    var sourceVersion = null;
    if (schema === 'h2o.studio.fullBundle.v2') sourceVersion = 'v2';
    else if (schema === 'h2o.studio.fullBundle.v1') sourceVersion = 'v1';
    else if (raw.chatArchive && typeof raw.chatArchive === 'object') sourceVersion = 'v1'; /* tolerant */
    else return { bundle: null, error: 'Unrecognized bundle schema: ' + (schema || '(missing)') };
    return { bundle: raw, sourceVersion: sourceVersion };
  }

  /* ── Dry-run: count incoming, compare against SQLite stores ──────── */
  async function dryRunImportBundle(bundleInput) {
    var parsed = parseBundle(bundleInput);
    if (!parsed.bundle) {
      return {
        schema: 'h2o.studio.fullBundle.v2', mode: 'dry-run', ok: false,
        error: parsed.error,
        plan: null, sample: null, warnings: [], errors: [{ kind: 'parse', error: parsed.error }],
      };
    }
    var bundle = parsed.bundle;
    var sourceVersion = parsed.sourceVersion;

    var stores = (H2O.Studio && H2O.Studio.store) || {};
    var chatsStore     = stores.chats;
    var snapshotsStore = stores.snapshots;
    var categoriesStore= stores.categories;
    var labelsStore    = stores.labels;
    var foldersStore   = stores.folders;

    var warnings = [];
    var errors = [];

    /* ── Chats + nested snapshots ──────────────────────────────────── */
    var chats = (bundle.chatArchive && Array.isArray(bundle.chatArchive.chats))
      ? bundle.chatArchive.chats : [];
    var newChatIds = [], dupChatIds = [];
    var incomingSnapshots = 0, newSnapshots = 0, dupSnapshots = 0;
    var newSnapshotIds = [], dupSnapshotIds = [];

    for (var ci = 0; ci < chats.length; ci += 1) {
      var chat = chats[ci];
      var cid = String((chat && chat.chatId) || '').trim();
      if (!cid) { errors.push({ kind: 'chat', err: 'missing chatId at index ' + ci }); continue; }
      var existing = null;
      if (chatsStore && typeof chatsStore.get === 'function') {
        try { existing = await chatsStore.get(cid); } catch (e) { errors.push({ kind: 'chat.get', err: String(e && e.message || e) }); }
      }
      if (existing) dupChatIds.push(cid); else newChatIds.push(cid);

      var snaps = (chat && Array.isArray(chat.snapshots)) ? chat.snapshots : [];
      incomingSnapshots += snaps.length;
      for (var si = 0; si < snaps.length; si += 1) {
        var snap = snaps[si];
        var sid = String((snap && snap.snapshotId) || '').trim();
        if (!sid) { warnings.push({ kind: 'snapshot', warn: 'missing snapshotId for chat ' + cid }); continue; }
        var existingSnap = null;
        if (snapshotsStore && typeof snapshotsStore.get === 'function') {
          try { existingSnap = await snapshotsStore.get(sid); }
          catch (e) { errors.push({ kind: 'snapshot.get', err: String(e && e.message || e) }); }
        }
        if (existingSnap) { dupSnapshots += 1; dupSnapshotIds.push(sid); }
        else              { newSnapshots += 1; newSnapshotIds.push(sid); }
      }
    }

    /* ── Catalogs: categories + labels ─────────────────────────────── */
    var cats = (bundle.chatArchive && bundle.chatArchive.catalogs
                && Array.isArray(bundle.chatArchive.catalogs.categories))
      ? bundle.chatArchive.catalogs.categories : [];
    var newCategoryIds = [], dupCategoryIds = [];
    for (var ki = 0; ki < cats.length; ki += 1) {
      var catRow = cats[ki];
      var catId = String((catRow && (catRow.id || catRow.categoryId)) || '').trim();
      if (!catId) { warnings.push({ kind: 'category', warn: 'missing id at index ' + ki }); continue; }
      var existCat = null;
      if (categoriesStore && typeof categoriesStore.get === 'function') {
        try { existCat = await categoriesStore.get(catId); }
        catch (e) { errors.push({ kind: 'category.get', err: String(e && e.message || e) }); }
      }
      if (existCat) dupCategoryIds.push(catId); else newCategoryIds.push(catId);
    }

    var lbls = (bundle.chatArchive && bundle.chatArchive.catalogs
                && Array.isArray(bundle.chatArchive.catalogs.labels))
      ? bundle.chatArchive.catalogs.labels : [];
    var newLabelIds = [], dupLabelIds = [];
    for (var li = 0; li < lbls.length; li += 1) {
      var lblRow = lbls[li];
      var lblId = String((lblRow && (lblRow.id || lblRow.labelId)) || '').trim();
      if (!lblId) { warnings.push({ kind: 'label', warn: 'missing id at index ' + li }); continue; }
      var existLbl = null;
      if (labelsStore && typeof labelsStore.get === 'function') {
        try { existLbl = await labelsStore.get(lblId); }
        catch (e) { errors.push({ kind: 'label.get', err: String(e && e.message || e) }); }
      }
      if (existLbl) dupLabelIds.push(lblId); else newLabelIds.push(lblId);
    }

    /* ── Folders (best-effort, parsed from chromeStorageLocal) ───── */
    var newFolderIds = [], dupFolderIds = [];
    var folderParseSrc = null;
    try {
      var fldData = bundle.chromeStorageLocal && bundle.chromeStorageLocal[FOLDER_STATE_KEY];
      if (fldData && Array.isArray(fldData.folders)) {
        folderParseSrc = 'chromeStorageLocal';
        for (var fi = 0; fi < fldData.folders.length; fi += 1) {
          var fRow = fldData.folders[fi];
          var fid = String((fRow && fRow.id) || '').trim();
          if (!fid) continue;
          var existFolder = null;
          if (foldersStore && typeof foldersStore.get === 'function') {
            try { existFolder = await foldersStore.get(fid); }
            catch (e) { errors.push({ kind: 'folder.get', err: String(e && e.message || e) }); }
          }
          if (existFolder) dupFolderIds.push(fid); else newFolderIds.push(fid);
        }
      }
    } catch (e) { warnings.push({ kind: 'folder.parse', warn: String(e && e.message || e) }); }

    /* ── chromeStorageLocal: allowed / denied / new / dup ─────────── */
    var csl = (bundle.chromeStorageLocal && typeof bundle.chromeStorageLocal === 'object')
      ? bundle.chromeStorageLocal : {};
    var cslKeys = Object.keys(csl);
    var allowedCslKeys = []; var deniedCslKeys = [];
    for (var ai = 0; ai < cslKeys.length; ai += 1) {
      if (isAllowedStorageKey(cslKeys[ai])) allowedCslKeys.push(cslKeys[ai]);
      else deniedCslKeys.push(cslKeys[ai]);
    }
    var existingCsl = await chromeStorageGet(allowedCslKeys);
    var newCslKeys = []; var dupCslKeys = [];
    for (var bi = 0; bi < allowedCslKeys.length; bi += 1) {
      var ck = allowedCslKeys[bi];
      if (Object.prototype.hasOwnProperty.call(existingCsl, ck)) dupCslKeys.push(ck);
      else newCslKeys.push(ck);
    }

    /* ── libraryKv: same allow/check via shim ─────────────────────── */
    var kvEntries = Array.isArray(bundle.libraryKv) ? bundle.libraryKv : [];
    var allowedKvKeys = []; var deniedKvKeys = [];
    for (var di = 0; di < kvEntries.length; di += 1) {
      var entry = kvEntries[di];
      var ek = entry && entry.key;
      if (isAllowedKvKey(ek)) allowedKvKeys.push(String(ek));
      else deniedKvKeys.push(String(ek || ''));
    }
    var existingKv = await chromeStorageGet(allowedKvKeys);
    var newKvKeys = []; var dupKvKeys = [];
    for (var ei = 0; ei < allowedKvKeys.length; ei += 1) {
      var kk = allowedKvKeys[ei];
      if (Object.prototype.hasOwnProperty.call(existingKv, kk)) dupKvKeys.push(kk);
      else newKvKeys.push(kk);
    }

    /* ── Return the dry-run plan ───────────────────────────────────── */
    return {
      schema: 'h2o.studio.fullBundle.v2',
      mode: 'dry-run',
      ok: errors.length === 0,
      sourceVersion: sourceVersion,
      destinationVersion: 'v1-sqlite',
      destinationBackend: 'sqlite',
      plan: {
        chats: {
          incoming: chats.length,
          incomingSnapshots: incomingSnapshots,
          willImport: newChatIds.length,
          willSkipDuplicates: dupChatIds.length,
        },
        snapshots: {
          incoming: incomingSnapshots,
          willImport: newSnapshots,
          willSkipDuplicates: dupSnapshots,
        },
        categories: {
          incoming: cats.length,
          willImport: newCategoryIds.length,
          willSkipDuplicates: dupCategoryIds.length,
        },
        labels: {
          incoming: lbls.length,
          willImport: newLabelIds.length,
          willSkipDuplicates: dupLabelIds.length,
        },
        folders: {
          incoming: newFolderIds.length + dupFolderIds.length,
          willImport: newFolderIds.length,
          willSkipDuplicates: dupFolderIds.length,
          source: folderParseSrc,
        },
        chromeStorageLocal: {
          incoming: cslKeys.length,
          willImport: newCslKeys.length,
          willSkipDuplicates: dupCslKeys.length,
          deniedByPolicy: deniedCslKeys.length,
        },
        libraryKv: {
          incoming: kvEntries.length,
          willImport: newKvKeys.length,
          willSkipDuplicates: dupKvKeys.length,
          deniedByPolicy: deniedKvKeys.length,
        },
      },
      sample: {
        newChatIds:        newChatIds.slice(0, 10),
        dupChatIds:        dupChatIds.slice(0, 10),
        newSnapshotIds:    newSnapshotIds.slice(0, 10),
        dupSnapshotIds:    dupSnapshotIds.slice(0, 10),
        newCategoryIds:    newCategoryIds.slice(0, 10),
        dupCategoryIds:    dupCategoryIds.slice(0, 10),
        newLabelIds:       newLabelIds.slice(0, 10),
        dupLabelIds:       dupLabelIds.slice(0, 10),
        newFolderIds:      newFolderIds.slice(0, 10),
        dupFolderIds:      dupFolderIds.slice(0, 10),
        storageKeysToWrite:  newCslKeys.slice(0, 10),
        storageKeysSkipped:  dupCslKeys.slice(0, 10),
        storageKeysDenied:   deniedCslKeys.slice(0, 10),
        kvKeysToWrite:       newKvKeys.slice(0, 10),
        kvKeysSkipped:       dupKvKeys.slice(0, 10),
        kvKeysDenied:        deniedKvKeys.slice(0, 10),
      },
      warnings: warnings,
      errors: errors,
    };
  }

  /* ── M2b-2 Write side: merge-mode importer ───────────────────────── */
  /* Merge semantics: pre-check existence of each entity via the store's
   * .get(id); if it exists, increment skipped[entity]; otherwise call the
   * store's upsert/create/bindChat. Rerunning the same bundle on the same
   * DB writes zero rows. Overwrite mode is rejected at the top of
   * importBundle — Desktop V1 stays append-only. */

  function chromeStorageSet(items) {
    return new Promise(function (resolve, reject) {
      try {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local) {
          reject(new Error('chrome.storage.local unavailable'));
          return;
        }
        global.chrome.storage.local.set(items, function () {
          var lastErr = global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastErr) reject(new Error(String(lastErr.message || lastErr)));
          else resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  function getTauriInvoke() {
    try {
      var internals = global.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    } catch (_) { /* ignore */ }
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
      if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    } catch (_) { /* ignore */ }
    return null;
  }

  function readRowsAffected(result) {
    if (Array.isArray(result)) return Number(result[0]) || 0;
    if (result && typeof result === 'object') {
      if (result.rowsAffected != null) return Number(result.rowsAffected) || 0;
      if (result.rows_affected != null) return Number(result.rows_affected) || 0;
      if (result.affected != null) return Number(result.affected) || 0;
    }
    if (typeof result === 'number') return result;
    return 0;
  }

  async function sqliteExecute(query, values) {
    var invoke = getTauriInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable');
    return invoke('plugin:sql|execute', { db: DB_URL, query: query, values: values || [] });
  }

  async function authorizedBulkMigrationExecute(query, values, reason) {
    var sync = H2O.Desktop && H2O.Desktop.Sync;
    var executeAuthorizedSqlite = sync && sync.executeAuthorizedSqlite;
    if (typeof executeAuthorizedSqlite !== 'function') return null;
    return await executeAuthorizedSqlite({
      identity: BULK_MIGRATION_IDENTITY,
      bulkMigrationEnabled: true,
      reason: reason || 'f19.chrome-desktop-minimal-row',
      statements: [{ query: query, values: values || [] }]
    });
  }

  function isoToEpochMs(input) {
    if (input == null) return 0;
    if (typeof input === 'number' && isFinite(input) && input > 0) return input;
    if (typeof input !== 'string' || !input) return 0;
    try {
      var t = new Date(input).getTime();
      return (typeof t === 'number' && isFinite(t)) ? t : 0;
    } catch { return 0; }
  }

  function isF19MinimalLibraryIndexChat(chat) {
    var chatIndex = (chat && chat.chatIndex && typeof chat.chatIndex === 'object') ? chat.chatIndex : {};
    return chatIndex.f19MinimalLibraryIndexRow === true && !(Array.isArray(chat && chat.snapshots) && chat.snapshots.length > 0);
  }

  function classifyImportError(e) {
    var msg = String((e && e.message) || e || '').toLowerCase();
    if (!msg) return 'import-error';
    if (msg.indexOf('f15-store-write-protected:chats.category_id') !== -1) return 'category-cache-write-protected';
    if (msg.indexOf('no such function: h2o_writer_identity') !== -1) return 'minimal-row-sql-writer-identity-missing';
    if (msg.indexOf('no such column') !== -1 || msg.indexOf('has no column named') !== -1) return 'minimal-row-sql-column-mismatch';
    if (msg.indexOf('minimal-row-materialize: chatid required') !== -1) return 'minimal-row-required-field-missing';
    if (msg.indexOf('minimal-row-materialize: insert ignored') !== -1) return 'minimal-row-invalid-state';
    if (msg.indexOf('sqlite-authorized-query-failed') !== -1) return 'minimal-row-sql-execute-failed';
    if (msg.indexOf('sqlite-authorized-execute-failed') !== -1) return 'minimal-row-sql-execute-failed';
    if (msg.indexOf('sqlite-db-unavailable') !== -1 || msg.indexOf('sqlite-db-acquire-failed') !== -1) return 'minimal-row-store-unavailable';
    if (msg.indexOf('category') !== -1 && (msg.indexOf('constraint') !== -1 || msg.indexOf('trigger') !== -1)) return 'category-reference-rejected';
    if (msg.indexOf('unique') !== -1 || msg.indexOf('constraint') !== -1) return 'sqlite-constraint';
    if (msg.indexOf('not null') !== -1) return 'sqlite-not-null';
    if (msg.indexOf('chatid required') !== -1 || msg.indexOf('chatid') !== -1) return 'chat-id-invalid';
    if (msg.indexOf('tauri invoke') !== -1 || msg.indexOf('plugin:sql') !== -1) return 'sqlite-unavailable';
    return 'import-error';
  }

  function classifyMinimalRowError(e) {
    var code = classifyImportError(e);
    if (code !== 'import-error') return code;
    var primary = e && e.primaryImportError ? classifyImportError(e.primaryImportError) : 'import-error';
    if (primary !== 'import-error') return primary;
    return 'minimal-row-sql-execute-failed';
  }

  /* Build SQLite turn rows from a bundle snapshot. Zips snapshot.messages[]
   * (text/role/order) with snapshot.meta.richTurns[] (outerHTML per turnIdx).
   * Returns shape matching store.snapshots.create({turns:[]}). */
  function buildTurnsFromSnapshot(snapshot) {
    var messages = (snapshot && Array.isArray(snapshot.messages)) ? snapshot.messages : [];
    var richTurns = (snapshot && snapshot.meta && Array.isArray(snapshot.meta.richTurns))
      ? snapshot.meta.richTurns : [];
    var richByIdx = Object.create(null);
    for (var i = 0; i < richTurns.length; i += 1) {
      var rt = richTurns[i];
      if (!rt) continue;
      var idx = (typeof rt.turnIdx === 'number') ? rt.turnIdx : i;
      richByIdx[idx] = rt;
    }
    /* If messages[] is empty but richTurns[] has entries, fall back to
     * richTurns as the message source (some legacy snapshots only carry
     * richTurns). */
    if (messages.length === 0 && richTurns.length > 0) {
      return richTurns.map(function (rt, i) {
        var idx = (typeof rt.turnIdx === 'number') ? rt.turnIdx : i;
        return {
          turnIdx: idx,
          role: rt.role || 'assistant',
          text: '',
          outerHtml: rt.outerHTML || rt.html || '',
          meta: pickRichExtras(rt),
        };
      });
    }
    return messages.map(function (msg, i) {
      var turnIdx = (msg && typeof msg.order === 'number') ? msg.order : i;
      var rich = richByIdx[turnIdx] || null;
      var outerHtml = '';
      if (rich) {
        if (typeof rich.outerHTML === 'string' && rich.outerHTML) outerHtml = rich.outerHTML;
        else if (typeof rich.html === 'string' && rich.html) outerHtml = rich.html;
      }
      return {
        turnIdx: turnIdx,
        role: (msg && msg.role) || 'assistant',
        text: (msg && msg.text) || '',
        outerHtml: outerHtml,
        meta: rich ? pickRichExtras(rich) : {},
      };
    });
  }
  function pickRichExtras(rt) {
    var out = {};
    var keep = ['createTime', 'userCreateTime', 'assistantCreateTime',
                'userMessageId', 'assistantMessageId', 'messageTimes'];
    for (var i = 0; i < keep.length; i += 1) {
      var k = keep[i];
      if (rt[k] !== undefined) out[k] = rt[k];
    }
    return out;
  }

  function snapshotHasPayloadContent(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (Array.isArray(snapshot.messages) && snapshot.messages.length > 0) return true;
    var meta = snapshot.meta && typeof snapshot.meta === 'object' ? snapshot.meta : {};
    return Array.isArray(meta.richTurns) && meta.richTurns.length > 0;
  }

  function snapshotCombinedPayloadTurnCount(existing) {
    var turns = Array.isArray(existing && existing.turns) ? existing.turns : [];
    var count = 0;
    for (var i = 0; i < turns.length; i += 1) {
      var turn = turns[i] || {};
      if (cleanString(turn.text) || cleanString(turn.outerHtml)) count += 1;
    }
    return count;
  }

  function shouldRepairExistingSnapshotPayload(existing, incomingTurns) {
    var incomingCount = Array.isArray(incomingTurns) ? incomingTurns.length : 0;
    if (incomingCount <= 0) return false;
    return snapshotCombinedPayloadTurnCount(existing) < incomingCount;
  }

  /* Derive the chats-table patch from a bundle chat + its (sorted-desc)
   * snapshots. Mirrors the chat-row fields M2a-3h's writeToChatsStore writes,
   * plus title/href/saved/linked/snapshot provenance. */
  function deriveChatPatchFromBundle(chat, snapshotsSortedDesc) {
    var chatId = String((chat && chat.chatId) || '').trim();
    var chatIndex = (chat && chat.chatIndex && typeof chat.chatIndex === 'object') ? chat.chatIndex : {};
    var indexState = (chatIndex.state && typeof chatIndex.state === 'object') ? chatIndex.state : {};
    var indexOrg = (chatIndex.organization && typeof chatIndex.organization === 'object') ? chatIndex.organization : {};
    var chatMeta = (chat && chat.meta && typeof chat.meta === 'object') ? chat.meta : {};
    var chatSource = (chat && chat.source && typeof chat.source === 'object') ? chat.source : {};
    var payloadSnapshots = snapshotsSortedDesc.filter(snapshotHasPayloadContent);
    var hasSnapshots = payloadSnapshots.length > 0;
    var latest = hasSnapshots ? payloadSnapshots[0] : null;
    var latestMeta = (latest && latest.meta && typeof latest.meta === 'object') ? latest.meta : {};
    var indexSnapshotId = cleanString(chatIndex.lastSnapshotId || chatIndex.snapshotId || chatIndex.snapshot_id || chatIndex.latestSnapshotId || chat && (chat.lastSnapshotId || chat.snapshotId || chat.latestSnapshotId));
    var indexMessageCount = numericCount(chatIndex.messageCount || chat && chat.messageCount);
    var indexTurnCount = numericCount(chatIndex.turnCount || chat && chat.turnCount);
    var indexUserTurnCount = numericCount(chatIndex.userTurnCount || chat && chat.userTurnCount);
    var indexAssistantTurnCount = numericCount(chatIndex.assistantTurnCount || chat && chat.assistantTurnCount);
    var indexAnswerCount = numericCount(chatIndex.answerCount || chat && chat.answerCount);
    var indexFolderId = cleanString(indexOrg.folderId || indexOrg.folder_id || chat && (chat.folderId || chat.folder_id));
    var indexHasTranscriptEvidence = !!indexSnapshotId
      || indexMessageCount > 0
      || indexTurnCount > 0
      || indexUserTurnCount > 0
      || indexAssistantTurnCount > 0;
    var missingSnapshotPayload = indexHasTranscriptEvidence && !hasSnapshots;
    var indexSnapshotCount = indexSnapshotId
      ? Math.max(numericCount(chatIndex.snapshotCount || chat && chat.snapshotCount), 1)
      : (indexHasTranscriptEvidence ? numericCount(chatIndex.snapshotCount || chat && chat.snapshotCount) : 0);
    var effectiveSnapshotId = missingSnapshotPayload ? '' : indexSnapshotId;
    var effectiveSnapshotCount = missingSnapshotPayload ? 0 : indexSnapshotCount;
    var effectiveMessageCount = missingSnapshotPayload ? 0 : indexMessageCount;
    var effectiveTurnCount = missingSnapshotPayload ? 0 : indexTurnCount;
    var effectiveUserTurnCount = missingSnapshotPayload ? 0 : indexUserTurnCount;
    var effectiveAssistantTurnCount = missingSnapshotPayload ? 0 : indexAssistantTurnCount;
    var effectiveAnswerCount = missingSnapshotPayload ? 0 : indexAnswerCount;

    var title = friendlyShellTitle([
      latestMeta.title,
      latestMeta.displayTitle,
      latestMeta.sourceTitle,
      latestMeta.pageTitle,
      latestMeta.chatTitle,
      latestMeta.originalTitle,
      chatIndex.title,
      chatIndex.displayTitle,
      chatIndex.sourceTitle,
      chatIndex.pageTitle,
      chatIndex.chatTitle,
      chatIndex.originalTitle,
      chatIndex.name,
      chat && chat.title,
      chat && chat.displayTitle,
      chat && chat.sourceTitle,
      chat && chat.pageTitle,
      chat && chat.chatTitle,
      chat && chat.originalTitle,
      chat && chat.name,
      chatMeta.title,
      chatMeta.displayTitle,
      chatMeta.sourceTitle,
      chatMeta.pageTitle,
      chatMeta.chatTitle,
      chatMeta.originalTitle,
      chatSource.title,
      chatSource.displayTitle,
      chatSource.sourceTitle,
      chatSource.pageTitle,
      chatSource.chatTitle,
      chatSource.originalTitle,
      chatIndex.filename,
      chatIndex.sourceLabel,
      chat && chat.filename,
      chat && chat.sourceLabel,
      chatSource.filename,
      chatSource.label,
    ], chatId, indexState.isLinked && !indexState.isSaved ? 'Link' : 'Imported chat');
    var href = chatIndex.href || ('https://chatgpt.com/c/' + chatId);
    var isSaved = hasSnapshots || (!missingSnapshotPayload && (!!indexState.isSaved || (indexHasTranscriptEvidence && cleanString(chatIndex.displayView || chatIndex.view).toLowerCase() === 'saved')));
    var isLinked = hasSnapshots || !!indexState.isLinked || (!!href && missingSnapshotPayload);
    var isMinimalLibraryIndexRow = isF19MinimalLibraryIndexChat(chat);

    /* Preserve chatIndex fields that don't have dedicated columns. */
    var chatIndexMeta = {};
    Object.keys(chatIndex).forEach(function (k) {
      if (k === 'title' || k === 'href' || k === 'state' || k === 'organization'
          || k === 'linkSourceHref' || k === 'linkedFrom' || k === 'linkedAt') return;
      chatIndexMeta[k] = chatIndex[k];
    });

    return {
      chatId: chatId,
      title: title,
      displayTitle: title,
      sourceTitle: title,
      pageTitle: title,
      chatTitle: title,
      originalTitle: title,
      href: href,
      normalizedHref: chatIndex.normalizedHref || href,
      isSaved: isSaved,
      isLinked: isLinked,
      isPinned: !!indexState.isPinned,
      isArchived: !!indexState.isArchived,
      isDeleted: !!indexState.isDeleted,
      snapshotCount: hasSnapshots ? payloadSnapshots.length : effectiveSnapshotCount,
      lastSnapshotId: latest ? (latest.snapshotId || null) : (effectiveSnapshotId || null),
      messageCount: effectiveMessageCount,
      turnCount: effectiveTurnCount,
      userTurnCount: effectiveUserTurnCount,
      assistantTurnCount: effectiveAssistantTurnCount,
      answerCount: effectiveAnswerCount,
      lastCapturedAt: latest ? isoToEpochMs(latest.createdAt) : 0,
      folderId: indexFolderId,
      categoryId: indexOrg.categoryId || '',
      linkSourceHref: chatIndex.linkSourceHref || '',
      linkedFrom: chatIndex.linkedFrom || '',
      linkedAt: isoToEpochMs(chatIndex.linkedAt),
      meta: {
        importedFrom: 'h2o.studio.fullBundle.v2',
        importedAt: Date.now(),
        displayTitle: title,
        sourceTitle: title,
        pageTitle: title,
        chatTitle: title,
        originalTitle: title,
        snapshotId: latest ? (latest.snapshotId || null) : (effectiveSnapshotId || null),
        lastSnapshotId: latest ? (latest.snapshotId || null) : (effectiveSnapshotId || null),
        snapshotCount: hasSnapshots ? payloadSnapshots.length : effectiveSnapshotCount,
        messageCount: effectiveMessageCount,
        turnCount: effectiveTurnCount,
        userTurnCount: effectiveUserTurnCount,
        assistantTurnCount: effectiveAssistantTurnCount,
        answerCount: effectiveAnswerCount,
        folderId: indexFolderId,
        sourceSnapshotId: indexSnapshotId,
        sourceSnapshotCount: indexSnapshotCount,
        sourceMessageCount: indexMessageCount,
        sourceTurnCount: indexTurnCount,
        sourceUserTurnCount: indexUserTurnCount,
        sourceAssistantTurnCount: indexAssistantTurnCount,
        sourceAnswerCount: indexAnswerCount,
        sourceIsSaved: !!indexState.isSaved,
        f19SnapshotPayloadMissing: missingSnapshotPayload,
        f19ChromeDesktopMinimalRow: isMinimalLibraryIndexRow,
        chatIndexMeta: chatIndexMeta,
      },
    };
  }

  function prepareMinimalLibraryIndexPatch(patch, chat, snapshotsSortedDesc, result) {
    if (!isF19MinimalLibraryIndexChat(chat)) return patch;
    var next = Object.assign({}, patch);
    var meta = safeMeta(next.meta);
    meta.f19ChromeDesktopMinimalRow = true;
    meta.f19MinimalSnapshotCount = Array.isArray(snapshotsSortedDesc) ? snapshotsSortedDesc.length : 0;
    next.meta = meta;
    /* Minimal rows are row-state shells, not transcript imports. Avoid
     * writing nullable snapshot/category cache columns that are not needed
     * to materialize parity and that are protected by F15 settlement rules. */
    if (!next.lastSnapshotId) delete next.lastSnapshotId;
    if (!next.lastCapturedAt) delete next.lastCapturedAt;
    if (!next.categoryId) {
      delete next.categoryId;
    } else {
      meta.deferredCategoryId = next.categoryId;
      delete next.categoryId;
      result.warnings.push({ kind: 'chrome-minimal-row-category-deferred' });
    }
    return next;
  }

  function existingCount(existing, field) {
    var meta = safeMeta(existing && existing.meta);
    return Math.max(numericCount(existing && existing[field]), numericCount(meta[field]));
  }

  function prepareExistingChatEvidencePatch(existing, patch) {
    var chatId = cleanString(patch && patch.chatId);
    if (!chatId || !existing || !patch) return null;
    var next = { chatId: chatId };
    var changed = false;
    function maybeSetString(field) {
      var incoming = cleanString(patch[field]);
      if (!incoming) return;
      if (!cleanString(existing[field])) {
        next[field] = incoming;
        changed = true;
      }
    }
    function maybeSetMax(field) {
      var incoming = numericCount(patch[field]);
      if (incoming > existingCount(existing, field)) {
        next[field] = incoming;
        changed = true;
      }
    }
    maybeSetString('lastSnapshotId');
    maybeSetString('folderId');
    maybeSetMax('snapshotCount');
    maybeSetMax('messageCount');
    maybeSetMax('turnCount');
    maybeSetMax('userTurnCount');
    maybeSetMax('assistantTurnCount');
    maybeSetMax('answerCount');
    if (patch.isSaved === true && existing.isSaved !== true) {
      next.isSaved = true;
      changed = true;
    }
    if (patch.isLinked === true && existing.isLinked !== true) {
      next.isLinked = true;
      changed = true;
    }
    if (!changed) return null;
    next.meta = Object.assign({}, safeMeta(patch.meta), {
      f19ChromeDesktopEvidenceMerged: true,
      f19ChromeDesktopEvidenceMergedAt: Date.now()
    });
    return next;
  }

  function safeJson(value) {
    try { return JSON.stringify(value == null ? {} : value); }
    catch (_) { return '{}'; }
  }

  async function materializeMinimalLibraryIndexRow(chatStore, patch) {
    var chatId = cleanString(patch && patch.chatId);
    if (!chatId) throw new Error('minimal-row-materialize: chatId required');
    var now = Date.now();
    var meta = safeMeta(patch && patch.meta);
    meta.f19ChromeDesktopMaterializedShell = true;
    var columns = [
      'id',
      'title',
      'created_at',
      'updated_at',
      'message_count',
      'is_pinned',
      'is_archived',
      'is_deleted',
      'is_saved',
      'is_linked',
      'href',
      'normalized_href',
      'folder_id',
      'user_turn_count',
      'assistant_turn_count',
      'last_snapshot_id',
      'snapshot_count',
      'link_source_href',
      'linked_from',
      'linked_at',
      'meta_json'
    ];
    var href = cleanString(patch && (patch.href || patch.normalizedHref)) || ('https://chatgpt.com/c/' + chatId);
    var values = [
      chatId,
      friendlyShellTitle([
        patch && patch.title,
        patch && patch.displayTitle,
        patch && patch.sourceTitle,
        patch && patch.pageTitle,
        patch && patch.chatTitle,
        patch && patch.originalTitle,
        meta.displayTitle,
        meta.sourceTitle,
        meta.pageTitle,
        meta.chatTitle,
        meta.originalTitle,
      ], chatId, 'Imported chat'),
      now,
      now,
      numericCount(patch && patch.messageCount),
      patch && patch.isPinned ? 1 : 0,
      patch && patch.isArchived ? 1 : 0,
      patch && patch.isDeleted ? 1 : 0,
      patch && patch.isSaved ? 1 : 0,
      patch && patch.isLinked ? 1 : 0,
      href,
      cleanString(patch && patch.normalizedHref) || href,
      cleanString(patch && patch.folderId),
      numericCount(patch && patch.userTurnCount),
      numericCount(patch && patch.assistantTurnCount),
      cleanString(patch && patch.lastSnapshotId) || null,
      numericCount(patch && patch.snapshotCount),
      cleanString(patch && patch.linkSourceHref),
      cleanString(patch && patch.linkedFrom),
      Number((patch && patch.linkedAt) || 0) || 0,
      safeJson(meta)
    ];
    var placeholders = columns.map(function () { return '?'; }).join(', ');
    var query = 'INSERT OR IGNORE INTO chats (' + columns.join(', ') + ') VALUES (' + placeholders + ')';
    var result = await authorizedBulkMigrationExecute(query, values, 'f19.chrome-desktop-minimal-row');
    if (!result) result = await sqliteExecute(query, values);
    if (result && result.ok === false) {
      var blockers = Array.isArray(result.blockers) ? result.blockers.join(',') : 'authorized-sqlite-blocked';
      throw new Error(blockers || 'authorized-sqlite-blocked');
    }
    if (chatStore && typeof chatStore.reload === 'function') {
      try { await chatStore.reload(); } catch (_) { /* ignore */ }
    }
    if (readRowsAffected(result) > 0) return { status: 'inserted' };
    var existing = chatStore && typeof chatStore.get === 'function' ? await chatStore.get(chatId) : null;
    if (existing) return { status: 'existing' };
    throw new Error('minimal-row-materialize: insert ignored without existing row');
  }

  function emptySample() {
    return {
      writtenChatIds:        [], skippedChatIds:        [],
      writtenSnapshotIds:    [], skippedSnapshotIds:    [],
      writtenCategoryIds:    [], writtenLabelIds:       [],
      writtenFolderIds:      [], writtenFolderBindings: [],
      /* M2c-3 — first 10 "chatId:labelId" / "chatId:tagId" tuples */
      writtenLabelBindings:  [], writtenTagBindings:    [],
      storageKeysWritten:    [], kvKeysWritten:         [],
    };
  }
  function emptyWritten() {
    return { chats: 0, snapshots: 0, categories: 0, labels: 0,
      folders: 0, folderBindings: 0,
      /* M2c-3 */ labelBindings: 0, tagBindings: 0, tagsAutoCreated: 0,
      chromeStorageLocalKeys: 0, libraryKvKeys: 0 };
  }
  function emptySkipped() {
    return { chats: 0, snapshots: 0, categories: 0, labels: 0, folders: 0,
      /* M2c-3 */ labelBindings: 0, tagBindings: 0,
      chromeStorageLocalKeysExisting: 0, libraryKvKeysExisting: 0,
      deniedByPolicy: { chromeStorageLocal: 0, libraryKv: 0 } };
  }
  function emptyChromeMinimalRows() {
    return { total: 0, attempted: 0, materialized: 0, existing: 0, failed: 0 };
  }
  function chromeMinimalRows(result) {
    if (!result.chromeMinimalRows || typeof result.chromeMinimalRows !== 'object') {
      result.chromeMinimalRows = emptyChromeMinimalRows();
    }
    return result.chromeMinimalRows;
  }

  function wantsLibraryBulkMigration(options) {
    return !(options && typeof options === 'object' && options.disableLibraryBulkMigration === true);
  }
  function allowsLibraryShimFallback(options) {
    return !(options && typeof options === 'object' && options.allowLibraryShimFallback === false);
  }
  function shouldSkipExistingFolderMetadata(options) {
    return !!(options && typeof options === 'object' && options.skipExistingFolderMetadata === true);
  }
  function libraryBulkApi() {
    return H2O.Desktop && H2O.Desktop.Sync && H2O.Desktop.Sync.executeLibraryBulkMigration;
  }
  function importBatchIdFor(bundle, options) {
    var opts = (options && typeof options === 'object') ? options : {};
    return cleanString(opts.importBatchId || bundle.exportId || bundle.bundleId || bundle.sourceSyncPeerId || '');
  }
  function collectAutoTagCandidates(bundle) {
    var chats = (bundle.chatArchive && Array.isArray(bundle.chatArchive.chats))
      ? bundle.chatArchive.chats : [];
    var byId = Object.create(null);
    chats.forEach(function (chat) {
      var org = chat && chat.chatIndex && chat.chatIndex.organization;
      if (org && Array.isArray(org.tags)) {
        org.tags.forEach(function (tag) {
          var id = cleanString(tag && tag.id);
          var name = cleanString(tag && (tag.name || tag.label));
          if (id && name && !byId[id]) byId[id] = name;
        });
      }
      if (Array.isArray(chat && chat.tags)) {
        chat.tags.forEach(function (tag) {
          var id = cleanString(tag && tag.id);
          var name = cleanString(tag && (tag.name || tag.label));
          if (id && name && !byId[id]) byId[id] = name;
        });
      }
    });
    return Object.keys(byId).map(function (id) {
      return { tagId: id, name: byId[id], autoDerived: false, meta: { importedFrom: 'h2o.studio.fullBundle.v2' } };
    });
  }

  async function importLibraryCatalogsBulk(bundle, stores, result, options) {
    if (!wantsLibraryBulkMigration(options)) return false;
    var executeBulk = libraryBulkApi();
    if (typeof executeBulk !== 'function') {
      if (allowsLibraryShimFallback(options)) return false;
      result.errors.push({ kind: 'library-bulk-migration', phase: 'catalogs', error: 'library bulk migration unavailable; shim fallback disabled' });
      return true;
    }

    var cats = (bundle.chatArchive && bundle.chatArchive.catalogs
                && Array.isArray(bundle.chatArchive.catalogs.categories))
      ? bundle.chatArchive.catalogs.categories : [];
    var lbls = (bundle.chatArchive && bundle.chatArchive.catalogs
                && Array.isArray(bundle.chatArchive.catalogs.labels))
      ? bundle.chatArchive.catalogs.labels : [];
    var autoTags = collectAutoTagCandidates(bundle);
    var categories = [];
    var labels = [];
    var tags = [];
    var categoryIds = [];
    var labelIds = [];

    for (var ci = 0; ci < cats.length; ci += 1) {
      var catRow = cats[ci];
      var catId = cleanString(catRow && (catRow.id || catRow.categoryId));
      if (!catId) { result.warnings.push({ kind: 'category', warn: 'missing id at index ' + ci }); continue; }
      try {
        var existingCat = stores.categories && typeof stores.categories.get === 'function' ? await stores.categories.get(catId) : null;
        if (existingCat) { result.skipped.categories += 1; continue; }
        categories.push({
          categoryId: catId,
          name: catRow.name || catId,
          parentId: catRow.parentId || catRow.parent_id || '',
          source: catRow.source || 'imported',
          meta: safeMeta(catRow.meta)
        });
        categoryIds.push(catId);
      } catch (e) {
        result.errors.push({ kind: 'category.get', id: catId, error: String(e && e.message || e) });
      }
    }

    for (var li = 0; li < lbls.length; li += 1) {
      var lblRow = lbls[li];
      var labelId = cleanString(lblRow && (lblRow.id || lblRow.labelId));
      if (!labelId) { result.warnings.push({ kind: 'label', warn: 'missing id at index ' + li }); continue; }
      try {
        var existingLabel = stores.labels && typeof stores.labels.get === 'function' ? await stores.labels.get(labelId) : null;
        if (existingLabel) { result.skipped.labels += 1; continue; }
        labels.push({
          labelId: labelId,
          name: lblRow.name || labelId,
          color: lblRow.color || '',
          source: lblRow.source || 'imported',
          meta: safeMeta(lblRow.meta)
        });
        labelIds.push(labelId);
      } catch (e2) {
        result.errors.push({ kind: 'label.get', id: labelId, error: String(e2 && e2.message || e2) });
      }
    }

    for (var ti = 0; ti < autoTags.length; ti += 1) {
      var tag = autoTags[ti];
      try {
        var existingTag = stores.tags && typeof stores.tags.get === 'function' ? await stores.tags.get(tag.tagId) : null;
        if (!existingTag) tags.push(tag);
      } catch (e3) {
        result.errors.push({ kind: 'tag.get', tagId: tag.tagId, error: String(e3 && e3.message || e3) });
      }
    }

    if (!categories.length && !labels.length && !tags.length) return true;
    var bulk = await executeBulk({
      phase: 'catalogs',
      importBatchId: importBatchIdFor(bundle, options),
      categories: categories,
      labels: labels,
      tags: tags,
      maxChunkSize: (options && options.maxLibraryBulkChunkSize) || 100
    });
    result.libraryBulkMigration = result.libraryBulkMigration || [];
    result.libraryBulkMigration.push({
      phase: 'catalogs',
      ok: bulk && bulk.ok === true,
      status: bulk && bulk.status,
      counts: bulk && bulk.counts,
      blockers: bulk && bulk.blockers,
      warnings: bulk && bulk.warnings
    });
    if (!bulk || bulk.ok !== true) {
      result.errors.push({ kind: 'library-bulk-migration', phase: 'catalogs', error: 'bulk catalog migration failed' });
      return true;
    }
    result.written.categories += categories.length;
    result.written.labels += labels.length;
    result.written.tagsAutoCreated += tags.length;
    categoryIds.slice(0, Math.max(0, 10 - result.sample.writtenCategoryIds.length)).forEach(function (id) {
      result.sample.writtenCategoryIds.push(id);
    });
    labelIds.slice(0, Math.max(0, 10 - result.sample.writtenLabelIds.length)).forEach(function (id) {
      result.sample.writtenLabelIds.push(id);
    });
    if (stores.categories && typeof stores.categories.reload === 'function') { try { await stores.categories.reload(); } catch (_) { /* ignore */ } }
    if (stores.labels && typeof stores.labels.reload === 'function') { try { await stores.labels.reload(); } catch (_) { /* ignore */ } }
    if (stores.tags && typeof stores.tags.reload === 'function') { try { await stores.tags.reload(); } catch (_) { /* ignore */ } }
    return true;
  }

  async function importCategories(bundle, stores, result) {
    var cats = (bundle.chatArchive && bundle.chatArchive.catalogs
                && Array.isArray(bundle.chatArchive.catalogs.categories))
      ? bundle.chatArchive.catalogs.categories : [];
    var catStore = stores.categories;
    if (!catStore || typeof catStore.upsert !== 'function') {
      if (cats.length > 0) result.warnings.push({ kind: 'categories', warn: 'store.categories unavailable' });
      return;
    }
    for (var i = 0; i < cats.length; i += 1) {
      var row = cats[i];
      var id = String((row && (row.id || row.categoryId)) || '').trim();
      if (!id) { result.warnings.push({ kind: 'category', warn: 'missing id at index ' + i }); continue; }
      try {
        var existing = await catStore.get(id);
        if (existing) { result.skipped.categories += 1; continue; }
        await catStore.upsert({
          categoryId: id,
          name: row.name || id,
          parentId: row.parentId || row.parent_id || '',
          source: row.source || 'imported',
          meta: (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {},
        });
        result.written.categories += 1;
        if (result.sample.writtenCategoryIds.length < 10) result.sample.writtenCategoryIds.push(id);
      } catch (e) {
        result.errors.push({ kind: 'category', id: id, error: String(e && e.message || e) });
      }
    }
  }

  async function importLabels(bundle, stores, result) {
    var lbls = (bundle.chatArchive && bundle.chatArchive.catalogs
                && Array.isArray(bundle.chatArchive.catalogs.labels))
      ? bundle.chatArchive.catalogs.labels : [];
    var lblStore = stores.labels;
    if (!lblStore || typeof lblStore.upsert !== 'function') {
      if (lbls.length > 0) result.warnings.push({ kind: 'labels', warn: 'store.labels unavailable' });
      return;
    }
    for (var i = 0; i < lbls.length; i += 1) {
      var row = lbls[i];
      var id = String((row && (row.id || row.labelId)) || '').trim();
      if (!id) { result.warnings.push({ kind: 'label', warn: 'missing id at index ' + i }); continue; }
      try {
        var existing = await lblStore.get(id);
        if (existing) { result.skipped.labels += 1; continue; }
        await lblStore.upsert({
          labelId: id,
          name: row.name || id,
          color: row.color || '',
          source: row.source || 'imported',
          meta: (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {},
        });
        result.written.labels += 1;
        if (result.sample.writtenLabelIds.length < 10) result.sample.writtenLabelIds.push(id);
      } catch (e) {
        result.errors.push({ kind: 'label', id: id, error: String(e && e.message || e) });
      }
    }
  }

  async function importFolders(bundle, stores, result, options) {
    var fldData = bundle.chromeStorageLocal && bundle.chromeStorageLocal[FOLDER_STATE_KEY];
    if (!fldData || !Array.isArray(fldData.folders)) return;
    var folderStore = stores.folders;
    if (!folderStore || typeof folderStore.upsert !== 'function') {
      result.warnings.push({ kind: 'folders', warn: 'store.folders unavailable' });
      return;
    }
    for (var i = 0; i < fldData.folders.length; i += 1) {
      var row = fldData.folders[i];
      var id = cleanString(row && (row.id || row.folderId));
      if (!id) { result.warnings.push({ kind: 'folder', warn: 'missing id at index ' + i }); continue; }
      try {
        var existing = await folderStore.get(id);
        if (existing && shouldSkipExistingFolderMetadata(options)) {
          result.skipped.folders += 1;
          continue;
        }
        var incomingMeta = safeMeta(row && row.meta);
        var existingMeta = safeMeta(existing && existing.meta);
        var color = cleanString((row && (row.color || row.iconColor)) || (existing && existing.color) || existingMeta.color || existingMeta.iconColor);
        var icon = cleanString((row && row.icon) || incomingMeta.icon || incomingMeta.iconKey || existingMeta.icon || existingMeta.iconKey);
        var patchMeta = Object.assign({}, existingMeta, incomingMeta, {
          source: cleanString((row && row.source) || incomingMeta.source || (existing && existing.source) || existingMeta.source || 'imported'),
        });
        if (color) {
          patchMeta.color = color;
          patchMeta.iconColor = color;
        }
        if (icon) patchMeta.icon = icon;
        await folderStore.upsert({
          folderId: id,
          name: cleanString((row && (row.name || row.title)) || (existing && existing.name) || id) || id,
          parentId: cleanString((row && (row.parentId || row.parent_id)) || (existing && existing.parentId)),
          color: color,
          source: cleanString((row && row.source) || (existing && existing.source) || 'imported') || 'imported',
          sortOrder: (typeof (row && row.sortOrder) === 'number') ? row.sortOrder
                    : (typeof (row && row.sort_order) === 'number') ? row.sort_order
                    : (typeof (existing && existing.sortOrder) === 'number') ? existing.sortOrder : 0,
          iconColor: color,
          icon: icon,
          meta: patchMeta,
        });
        result.written.folders += 1;
        if (result.sample.writtenFolderIds.length < 10) result.sample.writtenFolderIds.push(id);
      } catch (e) {
        result.errors.push({ kind: 'folder', id: id, error: String(e && e.message || e) });
      }
    }
  }

  /* chatStateIndex tracks per-chat outcome ('imported' | 'skipped') so that
   * importSnapshots / importFolderBindings know whether the binding target
   * exists. 'skipped' means the chat row was already present — bindings to
   * it are still valid. */
  async function importChats(bundle, stores, result, chatStateIndex, suppressCategoryId) {
    var chats = (bundle.chatArchive && Array.isArray(bundle.chatArchive.chats))
      ? bundle.chatArchive.chats : [];
    var chatStore = stores.chats;
    if (!chatStore || typeof chatStore.upsert !== 'function') {
      if (chats.length > 0) result.warnings.push({ kind: 'chats', warn: 'store.chats unavailable' });
      return;
    }
    for (var i = 0; i < chats.length; i += 1) {
      var chat = chats[i];
      var chatId = String((chat && chat.chatId) || '').trim();
      var isMinimalRow = isF19MinimalLibraryIndexChat(chat);
      var minimalSummary = null;
      if (isMinimalRow) {
        minimalSummary = chromeMinimalRows(result);
        minimalSummary.total += 1;
        minimalSummary.attempted += 1;
      }
      if (!chatId) {
        if (minimalSummary) minimalSummary.failed += 1;
        result.errors.push({ kind: isMinimalRow ? 'chrome-minimal-row-import' : 'chat', code: 'missing-chat-id', error: 'missing chatId at index ' + i });
        continue;
      }
      try {
        var snapshots = Array.isArray(chat.snapshots) ? chat.snapshots.slice() : [];
        snapshots.sort(function (a, b) { return isoToEpochMs(b && b.createdAt) - isoToEpochMs(a && a.createdAt); });
        var patch = deriveChatPatchFromBundle(chat, snapshots);
        patch = prepareMinimalLibraryIndexPatch(patch, chat, snapshots, result);
        if (suppressCategoryId === true) {
          delete patch.categoryId;
        }
        var existing = await chatStore.get(chatId);
        if (existing) {
          var evidencePatch = prepareExistingChatEvidencePatch(existing, patch);
          if (evidencePatch) {
            await chatStore.upsert(evidencePatch);
            result.written.chats += 1;
            result.warnings.push({ kind: 'chrome-desktop-existing-chat-evidence-merged' });
            if (result.sample.writtenChatIds.length < 10) result.sample.writtenChatIds.push(chatId);
          } else {
            result.skipped.chats += 1;
            if (result.sample.skippedChatIds.length < 10) result.sample.skippedChatIds.push(chatId);
          }
          chatStateIndex[chatId] = 'skipped';
          if (minimalSummary) minimalSummary.existing += 1;
          continue;
        }
        try {
          await chatStore.upsert(patch);
          result.written.chats += 1;
          chatStateIndex[chatId] = 'imported';
          if (minimalSummary) {
            minimalSummary.materialized += 1;
            result.warnings.push({ kind: 'chrome-minimal-row-materialized-via-store-upsert' });
          }
          if (result.sample.writtenChatIds.length < 10) result.sample.writtenChatIds.push(chatId);
        } catch (primaryError) {
          if (!isMinimalRow) throw primaryError;
          try {
            var materialized = await materializeMinimalLibraryIndexRow(chatStore, patch);
            if (materialized.status === 'inserted') {
              result.written.chats += 1;
              chatStateIndex[chatId] = 'imported';
              if (minimalSummary) minimalSummary.materialized += 1;
              if (result.sample.writtenChatIds.length < 10) result.sample.writtenChatIds.push(chatId);
              result.warnings.push({ kind: 'chrome-minimal-row-materialized-via-shell-insert' });
            } else {
              result.skipped.chats += 1;
              chatStateIndex[chatId] = 'skipped';
              if (minimalSummary) minimalSummary.existing += 1;
              if (result.sample.skippedChatIds.length < 10) result.sample.skippedChatIds.push(chatId);
              result.warnings.push({ kind: 'chrome-minimal-row-materialize-existing' });
            }
          } catch (fallbackError) {
            fallbackError.primaryImportError = primaryError;
            throw fallbackError;
          }
        }
      } catch (e) {
        if (minimalSummary) minimalSummary.failed += 1;
        result.errors.push({
          kind: isMinimalRow ? 'chrome-minimal-row-import' : 'chat',
          code: isMinimalRow ? classifyMinimalRowError(e) : classifyImportError(e),
          primaryCode: e && e.primaryImportError ? classifyImportError(e.primaryImportError) : '',
          id: chatId,
          error: String(e && e.message || e)
        });
      }
    }
  }

  async function importSnapshots(bundle, stores, result, chatStateIndex) {
    var chats = (bundle.chatArchive && Array.isArray(bundle.chatArchive.chats))
      ? bundle.chatArchive.chats : [];
    var snapStore = stores.snapshots;
    if (!snapStore || typeof snapStore.create !== 'function') {
      var total = 0;
      chats.forEach(function (c) { total += (c && Array.isArray(c.snapshots)) ? c.snapshots.length : 0; });
      if (total > 0) result.warnings.push({ kind: 'snapshots', warn: 'store.snapshots unavailable' });
      return;
    }
    for (var i = 0; i < chats.length; i += 1) {
      var chat = chats[i];
      var chatId = String((chat && chat.chatId) || '').trim();
      if (!chatId) continue;
      var chatState = chatStateIndex[chatId];
      if (chatState !== 'imported' && chatState !== 'skipped') {
        /* chat write must have failed; skip its snapshots so we don't
         * orphan them against a missing chat row */
        continue;
      }
      var snapshots = (chat && Array.isArray(chat.snapshots)) ? chat.snapshots : [];
      for (var j = 0; j < snapshots.length; j += 1) {
        var snap = snapshots[j];
        var snapshotId = String((snap && snap.snapshotId) || '').trim();
        if (!snapshotId) {
          result.warnings.push({ kind: 'snapshot', warn: 'missing snapshotId for chat ' + chatId });
          continue;
        }
        if (!snapshotHasPayloadContent(snap)) {
          result.warnings.push({ kind: 'snapshot', warn: 'snapshot payload missing for chat ' + chatId });
          continue;
        }
        try {
          var turns = buildTurnsFromSnapshot(snap);
          var existing = await snapStore.get(snapshotId);
          if (existing) {
            if (shouldRepairExistingSnapshotPayload(existing, turns) && typeof snapStore.upsert === 'function') {
              var repairMeta = (snap && snap.meta && typeof snap.meta === 'object') ? snap.meta : {};
              var repairMetaCopy = {};
              Object.keys(repairMeta).forEach(function (k) { if (k !== 'richTurns') repairMetaCopy[k] = repairMeta[k]; });
              var repairCapturedMs = isoToEpochMs(snap && snap.createdAt) || Date.now();
              var repairSnapshotIdStr = String(snapshotId);
              await snapStore.upsert({
                snapshotId: snapshotId,
                chatId: chatId,
                title: repairMetaCopy.title || '',
                capturedAt: repairCapturedMs,
                turns: turns,
                meta: repairMetaCopy,
                digest: (snap && snap.digest) || '',
                messageCount: Number((snap && snap.messageCount) || turns.length || 0),
                pinned: !!repairMetaCopy.pinned,
                legacy: repairSnapshotIdStr.indexOf('legacy:') === 0,
              });
              result.written.snapshots += 1;
              result.warnings.push({ kind: 'snapshot-store-payload-repaired' });
              if (result.sample.writtenSnapshotIds.length < 10) result.sample.writtenSnapshotIds.push(snapshotId);
              continue;
            }
            result.skipped.snapshots += 1;
            if (result.sample.skippedSnapshotIds.length < 10) result.sample.skippedSnapshotIds.push(snapshotId);
            continue;
          }
          /* Strip richTurns out of meta since their content moved into turn rows. */
          var srcMeta = (snap && snap.meta && typeof snap.meta === 'object') ? snap.meta : {};
          var meta = {};
          Object.keys(srcMeta).forEach(function (k) { if (k !== 'richTurns') meta[k] = srcMeta[k]; });
          var capturedMs = isoToEpochMs(snap && snap.createdAt) || Date.now();
          var snapshotIdStr = String(snapshotId);
          await snapStore.create({
            snapshotId: snapshotId,
            chatId: chatId,
            title: meta.title || '',
            capturedAt: capturedMs,
            turns: turns,
            meta: meta,
            digest: (snap && snap.digest) || '',
            messageCount: Number((snap && snap.messageCount) || turns.length || 0),
            pinned: !!meta.pinned,
            legacy: snapshotIdStr.indexOf('legacy:') === 0,
          });
          result.written.snapshots += 1;
          if (result.sample.writtenSnapshotIds.length < 10) result.sample.writtenSnapshotIds.push(snapshotId);
        } catch (e) {
          result.errors.push({ kind: 'snapshot', id: snapshotId, error: String(e && e.message || e) });
        }
      }
    }
  }

  async function importFolderBindings(bundle, stores, result, chatStateIndex) {
    var fldData = bundle.chromeStorageLocal && bundle.chromeStorageLocal[FOLDER_STATE_KEY];
    var mergedItems = Object.create(null);
    function addBinding(folderIdInput, chatIdInput) {
      var folderId = cleanString(folderIdInput);
      var chatId = cleanString(chatIdInput);
      if (!folderId || !chatId) return;
      if (!mergedItems[folderId]) mergedItems[folderId] = [];
      if (mergedItems[folderId].indexOf(chatId) === -1) mergedItems[folderId].push(chatId);
    }
    if (fldData && fldData.items && typeof fldData.items === 'object' && !Array.isArray(fldData.items)) {
      Object.keys(fldData.items).forEach(function (folderId) {
        var chatIds = Array.isArray(fldData.items[folderId]) ? fldData.items[folderId] : [];
        chatIds.forEach(function (chatId) { addBinding(folderId, chatId); });
      });
    }
    var chats = bundle.chatArchive && Array.isArray(bundle.chatArchive.chats)
      ? bundle.chatArchive.chats : [];
    chats.forEach(function (chat) {
      var index = chat && chat.chatIndex && typeof chat.chatIndex === 'object' ? chat.chatIndex : {};
      var org = index.organization && typeof index.organization === 'object' && !Array.isArray(index.organization)
        ? index.organization : {};
      addBinding(org.folderId || org.folder_id || chat && (chat.folderId || chat.folder_id),
        (chat && chat.chatId) || index.chatId || index.id);
    });
    if (Object.keys(mergedItems).length === 0) return;
    var folderStore = stores.folders;
    if (!folderStore || typeof folderStore.bindChat !== 'function') {
      result.warnings.push({ kind: 'folder-bindings', warn: 'store.folders.bindChat unavailable' });
      return;
    }
    var folderIds = Object.keys(mergedItems);
    for (var fi = 0; fi < folderIds.length; fi += 1) {
      var folderId = String(folderIds[fi] || '').trim();
      if (!folderId) continue;
      var folderExists = false;
      try { folderExists = !!(await folderStore.get(folderId)); }
      catch (e) { result.errors.push({ kind: 'folder.get', id: folderId, error: String(e && e.message || e) }); continue; }
      if (!folderExists) {
        result.warnings.push({ kind: 'orphan-folder-binding', folderId: folderId });
        continue;
      }
      var chatIds = Array.isArray(mergedItems[folderId]) ? mergedItems[folderId] : [];
      for (var ci = 0; ci < chatIds.length; ci += 1) {
        var chatId = String(chatIds[ci] || '').trim();
        if (!chatId) continue;
        var inIndex = chatStateIndex[chatId];
        var chatExists = inIndex === 'imported' || inIndex === 'skipped';
        if (!chatExists) {
          /* Defensive: chat not in bundle but maybe pre-existing on Desktop */
          try {
            var ex = stores.chats && typeof stores.chats.get === 'function'
              ? await stores.chats.get(chatId) : null;
            if (!ex) {
              result.warnings.push({ kind: 'orphan-folder-binding', folderId: folderId, chatId: chatId });
              continue;
            }
          } catch (_) {
            result.warnings.push({ kind: 'orphan-folder-binding', folderId: folderId, chatId: chatId });
            continue;
          }
        }
        try {
          var bindOk = await folderStore.bindChat(folderId, chatId, { assignedAt: Date.now() });
          if (bindOk) {
            result.written.folderBindings += 1;
            if (result.sample.writtenFolderBindings.length < 10) {
              result.sample.writtenFolderBindings.push(folderId + ':' + chatId);
            }
          }
        } catch (e) {
          result.errors.push({ kind: 'folder-binding', folderId: folderId, chatId: chatId, error: String(e && e.message || e) });
        }
      }
    }
  }

  /* ── M2c-3: per-chat label/tag binding imports ───────────────────── */
  /* Tolerant parser for the MV3 label-bindings KV blob.
   *   Wrapped:  { bindings: { [chatId]: string[] } }
   *   Wrapped+versioned: { schemaVersion, bindings: { [chatId]: string[] } }
   *   Flat:     { [chatId]: string[] }   (only if every top-level value
   *             is an array of strings — defensive against mistaking
   *             a richer object for a binding map)
   * Returns null if the value is unrecognized. */
  function parseLabelBindingsMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.bindings && typeof value.bindings === 'object' && !Array.isArray(value.bindings)) {
      return value.bindings;
    }
    var keys = Object.keys(value);
    if (keys.length === 0) return {};
    for (var i = 0; i < keys.length; i += 1) {
      var v = value[keys[i]];
      if (!Array.isArray(v)) return null;
      for (var j = 0; j < v.length; j += 1) {
        if (typeof v[j] !== 'string') return null;
      }
    }
    return value;
  }

  /* Walk bundle.libraryKv[] for the label-bindings KV blob and write
   * canonical label_bindings rows via store.labels.bindChat. Idempotent:
   * pre-checks store.labels.listForChat(chatId) once per chat and skips
   * already-bound (chatId, labelId) pairs. Orphan chat / orphan label IDs
   * produce warnings but never abort. The label-bindings KV blob ALSO
   * passes through opaque via importLibraryKvBlobs — that's intentional
   * (legacy consumers reading the raw key still work). */
  async function importLabelBindings(bundle, stores, result, chatStateIndex) {
    var kvEntries = Array.isArray(bundle.libraryKv) ? bundle.libraryKv : [];
    var entry = null;
    for (var i = 0; i < kvEntries.length; i += 1) {
      if (kvEntries[i] && kvEntries[i].key === 'h2o:prm:cgx:library:labels:bindings:v1') {
        entry = kvEntries[i];
        break;
      }
    }
    if (!entry) return;
    var map = parseLabelBindingsMap(entry.value);
    if (!map) {
      result.warnings.push({ kind: 'label-bindings-shape-unrecognized', key: entry.key });
      return;
    }
    var chatStore = stores.chats;
    var lblStore = stores.labels;
    if (!lblStore || typeof lblStore.bindChat !== 'function') {
      result.warnings.push({ kind: 'label-bindings', warn: 'store.labels.bindChat unavailable' });
      return;
    }
    var chatIds = Object.keys(map);
    for (var ci = 0; ci < chatIds.length; ci += 1) {
      var chatId = String(chatIds[ci] || '').trim();
      if (!chatId) continue;
      var labelIds = Array.isArray(map[chatId]) ? map[chatId] : [];
      if (labelIds.length === 0) continue;
      /* Verify chat exists: in chatStateIndex (just-imported or
       * already-present-and-skipped), or via a direct get for chats
       * that pre-existed before this import session. */
      var chatStateOk = chatStateIndex[chatId] === 'imported' || chatStateIndex[chatId] === 'skipped';
      if (!chatStateOk) {
        try {
          var existChat = (chatStore && typeof chatStore.get === 'function') ? await chatStore.get(chatId) : null;
          if (!existChat) {
            result.warnings.push({ kind: 'orphan-label-binding', chatId: chatId });
            continue;
          }
        } catch (_) {
          result.warnings.push({ kind: 'orphan-label-binding', chatId: chatId });
          continue;
        }
      }
      /* Pre-fetch existing bindings once per chat; mutate the Set as we
       * insert so multiple bundle entries for the same chat dedupe within
       * the same import run. */
      var existingSet = Object.create(null);
      try {
        var existingBindings = (typeof lblStore.listForChat === 'function') ? await lblStore.listForChat(chatId) : [];
        (existingBindings || []).forEach(function (l) { if (l && l.labelId) existingSet[l.labelId] = true; });
      } catch (e) {
        result.errors.push({ kind: 'label.listForChat', chatId: chatId, error: String((e && e.message) || e) });
        continue;
      }
      for (var li = 0; li < labelIds.length; li += 1) {
        var labelId = String(labelIds[li] || '').trim();
        if (!labelId) continue;
        var lblRow = null;
        try { lblRow = await lblStore.get(labelId); }
        catch (e) {
          result.errors.push({ kind: 'label.get', labelId: labelId, error: String((e && e.message) || e) });
          continue;
        }
        if (!lblRow) {
          result.warnings.push({ kind: 'orphan-label-id', chatId: chatId, labelId: labelId });
          continue;
        }
        if (existingSet[labelId]) {
          result.skipped.labelBindings += 1;
          continue;
        }
        try {
          await lblStore.bindChat(labelId, chatId, { assignedAt: Date.now() });
          existingSet[labelId] = true;
          result.written.labelBindings += 1;
          if (result.sample.writtenLabelBindings.length < 10) {
            result.sample.writtenLabelBindings.push(chatId + ':' + labelId);
          }
        } catch (e) {
          result.errors.push({ kind: 'label-binding', chatId: chatId, labelId: labelId, error: String((e && e.message) || e) });
        }
      }
    }
  }

  /* MV3 has no dedicated tag-bindings KV blob — tag bindings live on each
   * chat record at chatIndex.organization.tagIds (or .tags[].id). Walk
   * bundle.chatArchive.chats[] and write canonical tag_bindings rows.
   *
   * Tag catalog gap: V1 bundle has no canonical tags catalog. If a tagId
   * has no matching store.tags row, we try to auto-create from chat.tags[]
   * `{id, name}` fallback; if no name info is available, the binding is
   * skipped with an orphan-tag-id warning. */
  async function importTagBindings(bundle, stores, result, chatStateIndex) {
    var chats = (bundle.chatArchive && Array.isArray(bundle.chatArchive.chats))
      ? bundle.chatArchive.chats : [];
    var chatStore = stores.chats;
    var tagStore = stores.tags;
    if (!tagStore || typeof tagStore.bindChat !== 'function') {
      var anyTags = chats.some(function (c) {
        var o = c && c.chatIndex && c.chatIndex.organization;
        return o && ((Array.isArray(o.tagIds) && o.tagIds.length > 0)
                  || (Array.isArray(o.tags) && o.tags.length > 0));
      });
      if (anyTags) result.warnings.push({ kind: 'tag-bindings', warn: 'store.tags.bindChat unavailable' });
      return;
    }
    for (var i = 0; i < chats.length; i += 1) {
      var chat = chats[i];
      var chatId = String((chat && chat.chatId) || '').trim();
      if (!chatId) continue;
      var org = (chat && chat.chatIndex && chat.chatIndex.organization && typeof chat.chatIndex.organization === 'object')
        ? chat.chatIndex.organization : null;
      if (!org) continue;
      var tagIds = [];
      if (Array.isArray(org.tagIds)) {
        org.tagIds.forEach(function (t) { var s = String(t || '').trim(); if (s) tagIds.push(s); });
      }
      if (Array.isArray(org.tags)) {
        org.tags.forEach(function (t) { var s = String((t && t.id) || '').trim(); if (s) tagIds.push(s); });
      }
      if (tagIds.length === 0) continue;
      var chatStateOk = chatStateIndex[chatId] === 'imported' || chatStateIndex[chatId] === 'skipped';
      if (!chatStateOk) {
        try {
          var existChat2 = (chatStore && typeof chatStore.get === 'function') ? await chatStore.get(chatId) : null;
          if (!existChat2) { result.warnings.push({ kind: 'orphan-tag-binding', chatId: chatId }); continue; }
        } catch (_) {
          result.warnings.push({ kind: 'orphan-tag-binding', chatId: chatId }); continue;
        }
      }
      /* Build a fallback name lookup from chat.tags[] for auto-create. */
      var nameByTagId = Object.create(null);
      if (Array.isArray(chat.tags)) {
        chat.tags.forEach(function (t) {
          if (t && typeof t === 'object') {
            var id = String(t.id || '').trim();
            var name = String((t.name || t.label) || '').trim();
            if (id && name) nameByTagId[id] = name;
          }
        });
      }
      var existingSet2 = Object.create(null);
      try {
        var existingTags = (typeof tagStore.listForChat === 'function') ? await tagStore.listForChat(chatId) : [];
        (existingTags || []).forEach(function (t) { if (t && t.tagId) existingSet2[t.tagId] = true; });
      } catch (e) {
        result.errors.push({ kind: 'tag.listForChat', chatId: chatId, error: String((e && e.message) || e) });
        continue;
      }
      var seenInBundle = Object.create(null);
      for (var ti = 0; ti < tagIds.length; ti += 1) {
        var tagId = tagIds[ti];
        if (seenInBundle[tagId]) continue;
        seenInBundle[tagId] = true;
        var tagRow = null;
        try { tagRow = await tagStore.get(tagId); }
        catch (e) {
          result.errors.push({ kind: 'tag.get', tagId: tagId, error: String((e && e.message) || e) });
          continue;
        }
        if (!tagRow) {
          var fallbackName = nameByTagId[tagId];
          if (fallbackName) {
            try {
              await tagStore.upsert({
                tagId: tagId,
                name: fallbackName,
                autoDerived: false,
                meta: { importedFrom: 'h2o.studio.fullBundle.v2' },
              });
              result.written.tagsAutoCreated += 1;
            } catch (e) {
              result.errors.push({ kind: 'tag.upsert', tagId: tagId, error: String((e && e.message) || e) });
              continue;
            }
          } else {
            result.warnings.push({ kind: 'orphan-tag-id', chatId: chatId, tagId: tagId });
            continue;
          }
        }
        if (existingSet2[tagId]) {
          result.skipped.tagBindings += 1;
          continue;
        }
        try {
          await tagStore.bindChat(tagId, chatId, { assignedAt: Date.now() });
          existingSet2[tagId] = true;
          result.written.tagBindings += 1;
          if (result.sample.writtenTagBindings.length < 10) {
            result.sample.writtenTagBindings.push(chatId + ':' + tagId);
          }
        } catch (e) {
          result.errors.push({ kind: 'tag-binding', chatId: chatId, tagId: tagId, error: String((e && e.message) || e) });
        }
      }
    }
  }

  async function importLibraryBindingsBulk(bundle, stores, result, chatStateIndex, options) {
    if (!wantsLibraryBulkMigration(options)) return false;
    var executeBulk = libraryBulkApi();
    if (typeof executeBulk !== 'function') {
      if (allowsLibraryShimFallback(options)) return false;
      result.errors.push({ kind: 'library-bulk-migration', phase: 'bindings', error: 'library bulk migration unavailable; shim fallback disabled' });
      return true;
    }
    var chats = (bundle.chatArchive && Array.isArray(bundle.chatArchive.chats))
      ? bundle.chatArchive.chats : [];
    var chatStore = stores.chats;
    var lblStore = stores.labels;
    var tagStore = stores.tags;
    var catStore = stores.categories;
    var chatCategories = [];
    var labelBindings = [];
    var tagBindings = [];
    var labelSamples = [];
    var tagSamples = [];

    async function chatExists(chatId, warningKind) {
      if (chatStateIndex[chatId] === 'imported' || chatStateIndex[chatId] === 'skipped') return true;
      try {
        return !!(chatStore && typeof chatStore.get === 'function' ? await chatStore.get(chatId) : null);
      } catch (_) {
        result.warnings.push({ kind: warningKind, chatId: chatId });
        return false;
      }
    }

    for (var ci = 0; ci < chats.length; ci += 1) {
      var chat = chats[ci];
      var chatId = cleanString(chat && chat.chatId);
      if (!chatId) continue;
      var org = chat && chat.chatIndex && chat.chatIndex.organization;
      var categoryId = cleanString(org && org.categoryId);
      if (categoryId) {
        try {
          var category = catStore && typeof catStore.get === 'function' ? await catStore.get(categoryId) : null;
          var chatRow = chatStore && typeof chatStore.get === 'function' ? await chatStore.get(chatId) : null;
          if (!category) result.warnings.push({ kind: 'orphan-category-id', chatId: chatId, categoryId: categoryId });
          else if (!chatRow) result.warnings.push({ kind: 'orphan-category-binding', chatId: chatId, categoryId: categoryId });
          else if (cleanString(chatRow.categoryId) !== categoryId) chatCategories.push({ chatId: chatId, categoryId: categoryId, assignedAt: Date.now() });
        } catch (e) {
          result.errors.push({ kind: 'category-binding', chatId: chatId, categoryId: categoryId, error: String(e && e.message || e) });
        }
      }
    }

    var labelEntry = null;
    var kvEntries = Array.isArray(bundle.libraryKv) ? bundle.libraryKv : [];
    for (var ei = 0; ei < kvEntries.length; ei += 1) {
      if (kvEntries[ei] && kvEntries[ei].key === 'h2o:prm:cgx:library:labels:bindings:v1') {
        labelEntry = kvEntries[ei];
        break;
      }
    }
    if (labelEntry) {
      var labelMap = parseLabelBindingsMap(labelEntry.value);
      if (!labelMap) result.warnings.push({ kind: 'label-bindings-shape-unrecognized', key: labelEntry.key });
      else {
        var labelChatIds = Object.keys(labelMap);
        for (var lci = 0; lci < labelChatIds.length; lci += 1) {
          var labelChatId = cleanString(labelChatIds[lci]);
          if (!labelChatId || !(await chatExists(labelChatId, 'orphan-label-binding'))) continue;
          var existingLabels = Object.create(null);
          try {
            var rows = lblStore && typeof lblStore.listForChat === 'function' ? await lblStore.listForChat(labelChatId) : [];
            (rows || []).forEach(function (row) { if (row && row.labelId) existingLabels[row.labelId] = true; });
          } catch (e2) {
            result.errors.push({ kind: 'label.listForChat', chatId: labelChatId, error: String((e2 && e2.message) || e2) });
            continue;
          }
          var labelIds = Array.isArray(labelMap[labelChatId]) ? labelMap[labelChatId] : [];
          for (var li = 0; li < labelIds.length; li += 1) {
            var labelId = cleanString(labelIds[li]);
            if (!labelId || existingLabels[labelId]) {
              if (labelId && existingLabels[labelId]) result.skipped.labelBindings += 1;
              continue;
            }
            try {
              var label = lblStore && typeof lblStore.get === 'function' ? await lblStore.get(labelId) : null;
              if (!label) { result.warnings.push({ kind: 'orphan-label-id', chatId: labelChatId, labelId: labelId }); continue; }
              labelBindings.push({ chatId: labelChatId, labelId: labelId, assignedAt: Date.now() });
              existingLabels[labelId] = true;
              labelSamples.push(labelChatId + ':' + labelId);
            } catch (e3) {
              result.errors.push({ kind: 'label.get', labelId: labelId, error: String((e3 && e3.message) || e3) });
            }
          }
        }
      }
    }

    for (var cti = 0; cti < chats.length; cti += 1) {
      var tagChat = chats[cti];
      var tagChatId = cleanString(tagChat && tagChat.chatId);
      if (!tagChatId) continue;
      var tagOrg = tagChat && tagChat.chatIndex && tagChat.chatIndex.organization;
      if (!tagOrg) continue;
      var tagIds = [];
      if (Array.isArray(tagOrg.tagIds)) {
        tagOrg.tagIds.forEach(function (tagId) { var s = cleanString(tagId); if (s && tagIds.indexOf(s) === -1) tagIds.push(s); });
      }
      if (Array.isArray(tagOrg.tags)) {
        tagOrg.tags.forEach(function (tag) { var s = cleanString(tag && tag.id); if (s && tagIds.indexOf(s) === -1) tagIds.push(s); });
      }
      if (!tagIds.length || !(await chatExists(tagChatId, 'orphan-tag-binding'))) continue;
      var existingTags = Object.create(null);
      try {
        var tagRows = tagStore && typeof tagStore.listForChat === 'function' ? await tagStore.listForChat(tagChatId) : [];
        (tagRows || []).forEach(function (row) { if (row && row.tagId) existingTags[row.tagId] = true; });
      } catch (e4) {
        result.errors.push({ kind: 'tag.listForChat', chatId: tagChatId, error: String((e4 && e4.message) || e4) });
        continue;
      }
      for (var ti = 0; ti < tagIds.length; ti += 1) {
        var tagId = tagIds[ti];
        if (existingTags[tagId]) { result.skipped.tagBindings += 1; continue; }
        try {
          var tagRow = tagStore && typeof tagStore.get === 'function' ? await tagStore.get(tagId) : null;
          if (!tagRow) { result.warnings.push({ kind: 'orphan-tag-id', chatId: tagChatId, tagId: tagId }); continue; }
          tagBindings.push({ chatId: tagChatId, tagId: tagId, assignedAt: Date.now() });
          existingTags[tagId] = true;
          tagSamples.push(tagChatId + ':' + tagId);
        } catch (e5) {
          result.errors.push({ kind: 'tag.get', tagId: tagId, error: String((e5 && e5.message) || e5) });
        }
      }
    }

    if (!chatCategories.length && !labelBindings.length && !tagBindings.length) return true;
    var bulk = await executeBulk({
      phase: 'bindings',
      importBatchId: importBatchIdFor(bundle, options),
      chatCategories: chatCategories,
      labelBindings: labelBindings,
      tagBindings: tagBindings,
      maxChunkSize: (options && options.maxLibraryBulkChunkSize) || 100
    });
    result.libraryBulkMigration = result.libraryBulkMigration || [];
    result.libraryBulkMigration.push({
      phase: 'bindings',
      ok: bulk && bulk.ok === true,
      status: bulk && bulk.status,
      counts: bulk && bulk.counts,
      blockers: bulk && bulk.blockers,
      warnings: bulk && bulk.warnings
    });
    if (!bulk || bulk.ok !== true) {
      result.errors.push({ kind: 'library-bulk-migration', phase: 'bindings', error: 'bulk binding migration failed' });
      return true;
    }
    result.written.labelBindings += labelBindings.length;
    result.written.tagBindings += tagBindings.length;
    labelSamples.slice(0, Math.max(0, 10 - result.sample.writtenLabelBindings.length)).forEach(function (sample) {
      result.sample.writtenLabelBindings.push(sample);
    });
    tagSamples.slice(0, Math.max(0, 10 - result.sample.writtenTagBindings.length)).forEach(function (sample) {
      result.sample.writtenTagBindings.push(sample);
    });
    if (stores.chats && typeof stores.chats.reload === 'function') { try { await stores.chats.reload(); } catch (_) { /* ignore */ } }
    if (stores.labels && typeof stores.labels.reload === 'function') { try { await stores.labels.reload(); } catch (_) { /* ignore */ } }
    if (stores.tags && typeof stores.tags.reload === 'function') { try { await stores.tags.reload(); } catch (_) { /* ignore */ } }
    if (stores.categories && typeof stores.categories.reload === 'function') { try { await stores.categories.reload(); } catch (_) { /* ignore */ } }
    return true;
  }

  async function importChromeStorageBlobs(bundle, result) {
    var csl = (bundle.chromeStorageLocal && typeof bundle.chromeStorageLocal === 'object')
      ? bundle.chromeStorageLocal : {};
    var allKeys = Object.keys(csl);
    var allowed = [];
    for (var i = 0; i < allKeys.length; i += 1) {
      var k = allKeys[i];
      if (isAllowedStorageKey(k)) allowed.push(k);
      else result.skipped.deniedByPolicy.chromeStorageLocal += 1;
    }
    if (allowed.length === 0) return;
    var existing = await chromeStorageGet(allowed);
    for (var j = 0; j < allowed.length; j += 1) {
      var key = allowed[j];
      if (Object.prototype.hasOwnProperty.call(existing, key)) {
        result.skipped.chromeStorageLocalKeysExisting += 1;
        continue;
      }
      try {
        var item = {};
        item[key] = csl[key];
        await chromeStorageSet(item);
        result.written.chromeStorageLocalKeys += 1;
        if (result.sample.storageKeysWritten.length < 10) result.sample.storageKeysWritten.push(key);
      } catch (e) {
        result.errors.push({ kind: 'chromeStorageLocal', key: key, error: String(e && e.message || e) });
      }
    }
  }

  async function importLibraryKvBlobs(bundle, result) {
    var entries = Array.isArray(bundle.libraryKv) ? bundle.libraryKv : [];
    var allowed = []; var allowedKeys = [];
    for (var i = 0; i < entries.length; i += 1) {
      var entry = entries[i];
      var key = entry && entry.key;
      if (isAllowedKvKey(key)) { allowed.push(entry); allowedKeys.push(String(key)); }
      else result.skipped.deniedByPolicy.libraryKv += 1;
    }
    if (allowed.length === 0) return;
    var existing = await chromeStorageGet(allowedKeys);
    for (var j = 0; j < allowed.length; j += 1) {
      var entry2 = allowed[j];
      var key2 = String(entry2.key);
      if (Object.prototype.hasOwnProperty.call(existing, key2)) {
        result.skipped.libraryKvKeysExisting += 1;
        continue;
      }
      try {
        var item2 = {};
        item2[key2] = entry2.value;
        await chromeStorageSet(item2);
        result.written.libraryKvKeys += 1;
        if (result.sample.kvKeysWritten.length < 10) result.sample.kvKeysWritten.push(key2);
      } catch (e) {
        result.errors.push({ kind: 'libraryKv', key: key2, error: String(e && e.message || e) });
      }
    }
  }

  function shouldIngestTombstoneReviews(options) {
    return !!(options && typeof options === 'object' && options.ingestTombstoneReviews === true);
  }
  function shouldDryRunTombstoneReviews(options) {
    return !!(options && typeof options === 'object' && options.tombstoneReviewDryRun === true);
  }

  function tombstoneReviewIngestUnavailable(code, dryRun) {
    return {
      attempted: true,
      dryRun: dryRun === true,
      ok: false,
      found: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      selfOriginatedIgnored: 0,
      malformed: 0,
      unsupported: 0,
      failed: 0,
      warnings: [{ code: code || 'tombstone-review-ingest-unavailable' }],
    };
  }

  function normalizeTombstoneReviewWarnings(warnings) {
    var counts = Object.create(null);
    var out = [];
    if (!Array.isArray(warnings)) return out;
    for (var i = 0; i < warnings.length; i += 1) {
      var code = cleanString(warnings[i] && warnings[i].code) || 'warning';
      counts[code] = Number(counts[code] || 0) + Number((warnings[i] && warnings[i].count) || 1);
    }
    Object.keys(counts).sort().forEach(function (code) {
      out.push({ code: code, count: counts[code] });
    });
    return out;
  }

  function normalizeTombstoneReviewIngest(raw, dryRun) {
    if (!raw || typeof raw !== 'object') return tombstoneReviewIngestUnavailable(null, dryRun);
    return {
      attempted: true,
      dryRun: dryRun === true,
      ok: raw.ok !== false,
      found: Number(raw.found || 0),
      inserted: Number(raw.inserted || 0),
      updated: Number(raw.updated || 0),
      skipped: Number(raw.skipped || 0),
      selfOriginatedIgnored: Number(raw.selfOriginatedIgnored || 0),
      malformed: Number(raw.malformed || 0),
      unsupported: Number(raw.unsupported || 0),
      failed: Number(raw.failed || 0),
      warnings: normalizeTombstoneReviewWarnings(raw.warnings),
    };
  }

  async function attachTombstoneReviewIngest(result, bundle, requestedMode, options) {
    if (!shouldIngestTombstoneReviews(options)) return result;
    var dryRun = shouldDryRunTombstoneReviews(options);
    if (!bundle || typeof bundle !== 'object') {
      result.tombstoneReviewIngest = tombstoneReviewIngestUnavailable(null, dryRun);
      return result;
    }
    var reviews = H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstoneReviews;
    if (!reviews || typeof reviews.ingestBundleTombstones !== 'function') {
      result.tombstoneReviewIngest = tombstoneReviewIngestUnavailable(null, dryRun);
      return result;
    }
    try {
      var ingest = await reviews.ingestBundleTombstones(bundle, {
        source: 'desktop-import-bundle',
        dryRun: dryRun,
        allowSelfOrigin: false,
        importMode: requestedMode,
        bundleExportId: bundle.exportId,
        bundleSourceSyncPeerId: bundle.sourceSyncPeerId,
      });
      result.tombstoneReviewIngest = normalizeTombstoneReviewIngest(ingest, dryRun);
    } catch (_) {
      result.tombstoneReviewIngest = tombstoneReviewIngestUnavailable(null, dryRun);
    }
    return result;
  }

  async function importBundle(bundleInput, mode, options) {
    var requestedMode = String(mode || 'merge');
    /* Desktop V1 is append-only: overwrite/replace is intentionally
     * rejected to prevent accidental data loss across an MV3-bundle
     * re-import. Merge stays the only mode the migrate UI exposes too. */
    if (requestedMode !== 'merge') {
      return attachTombstoneReviewIngest({
        schema: 'h2o.studio.fullBundle.v2',
        mode: 'rejected',
        ok: false,
        requestedMode: requestedMode,
        error: 'overwrite mode not supported in Desktop V1',
      }, null, requestedMode, options);
    }

    var startedAt = new Date().toISOString();
    var startedAtMs = Date.now();
    var sample = emptySample();
    var written = emptyWritten();
    var skipped = emptySkipped();
    var warnings = [];
    var errors = [];

    var parsed = parseBundle(bundleInput);
    if (!parsed.bundle) {
      return attachTombstoneReviewIngest({
        schema: 'h2o.studio.fullBundle.v2',
        mode: 'merge',
        ok: false,
        sourceVersion: null,
        destinationVersion: 'v1-sqlite',
        destinationBackend: 'sqlite',
        startedAt: startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - startedAtMs,
        written: written, skipped: skipped,
        warnings: warnings,
        errors: [{ kind: 'parse', error: parsed.error }],
        sample: sample,
      }, null, requestedMode, options);
    }

    var bundle = parsed.bundle;
    var sourceVersion = parsed.sourceVersion;
    var stores = (H2O.Studio && H2O.Studio.store) || {};
    var result = {
      schema: 'h2o.studio.fullBundle.v2',
      mode: 'merge',
      ok: true,
      sourceVersion: sourceVersion,
      destinationVersion: 'v1-sqlite',
      destinationBackend: 'sqlite',
      startedAt: startedAt,
      completedAt: '',
      durationMs: 0,
      written: written,
      skipped: skipped,
      warnings: warnings,
      errors: errors,
      sample: sample,
    };

    var chatStateIndex = Object.create(null);

    try {
      /* Order matters: catalogs first (no FK deps), then chats (chats may
       * reference categoryId), then snapshots (need their chat row), then
       * folder bindings (need both folder and chat), then opaque kv blobs. */
      var libraryCatalogsHandled = await importLibraryCatalogsBulk(bundle, stores, result, options);
      if (!libraryCatalogsHandled) {
        await importCategories(bundle, stores, result);
        await importLabels(bundle, stores, result);
      }
      await importFolders(bundle, stores, result, options);
      await importChats(bundle, stores, result, chatStateIndex, libraryCatalogsHandled && wantsLibraryBulkMigration(options));
      await importSnapshots(bundle, stores, result, chatStateIndex);
      await importFolderBindings(bundle, stores, result, chatStateIndex);
      /* M2c-3: per-chat label/tag bindings. Label bindings come from a
       * canonical KV blob; tag bindings come from each chat record's
       * chatIndex.organization.tagIds (MV3 has no separate tag-bindings
       * KV). Both need chats + their parent catalogs to already be
       * written, hence this slot after importFolderBindings. */
      var libraryBindingsHandled = await importLibraryBindingsBulk(bundle, stores, result, chatStateIndex, options);
      if (!libraryBindingsHandled) {
        await importLabelBindings(bundle, stores, result, chatStateIndex);
        await importTagBindings(bundle, stores, result, chatStateIndex);
      }
      await importChromeStorageBlobs(bundle, result);
      await importLibraryKvBlobs(bundle, result);
    } catch (e) {
      result.errors.push({ kind: 'fatal', error: String(e && e.message || e) });
    }

    result.ok = result.errors.length === 0;
    result.completedAt = new Date().toISOString();
    result.durationMs = Date.now() - startedAtMs;
    return attachTombstoneReviewIngest(result, bundle, requestedMode, options);
  }

  /* ── Folder-state-only import (Phase A) ──────────────────────────────
   *
   * Lighter entry point over the existing importFolders + importFolderBindings
   * private helpers. Lets callers (e.g. a future folder-sync watcher) apply
   * just the folder catalog + bindings section without constructing a full
   * fullBundle.v2 envelope.
   *
   * Accepts three input shapes:
   *   (a) raw folder-state          { folders:[...], items:{folderId:chatId[]} }
   *   (b) chromeStorageLocal wrapper { chromeStorageLocal: { [FOLDER_STATE_KEY]: <raw> } }
   *   (c) full bundle               { schema, chatArchive, chromeStorageLocal: { [FOLDER_STATE_KEY]: <raw> }, ... }
   *
   * Persists through the existing Desktop folder store adapters via the
   * existing importFolders + importFolderBindings code paths — no new
   * write logic, no SQLite schema change, no chat/snapshot/catalog touch.
   *
   * Optionally mirrors the normalized folder-state back into the existing
   * fallback key h2o:prm:cgx:fldrs:state:data:v1 via the chrome.storage.local
   * shim, so the Desktop exporter's fallback-source ordering finds the same
   * data on the next re-export. The mirror is best-effort — if the shim
   * isn't available the SQLite write to folders/folder_bindings still
   * happened, and fallbackKvUpdated reports false.
   *
   * Safety invariants (all reused from the existing import path):
   *   - ID-primary, non-deleting merge (folders by folderId; bindings by
   *     PRIMARY KEY (chat_id) so a chat re-binding to its current folder is
   *     idempotent).
   *   - Same-name / different-id folders kept as two distinct rows.
   *   - Empty folders preserved: catalog row written even when items list
   *     is empty.
   *   - Visual metadata (color, iconColor, icon) merged via existing
   *     importFolders rules.
   *   - No chats/snapshots/labels/tags/categories/library-kv touched —
   *     the stub bundle's chatArchive.chats[] is empty so none of those
   *     code paths execute.
   *   - Tauri-gated by the outer IIFE: this function is unreachable on
   *     MV3/web.
   *   - No Chrome write-back, no bidirectional sync, no archive DB
   *     schema change. */

  function normalizeFolderStatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, source: '', state: null, error: 'invalid-payload' };
    }
    /* Shape (c): a full bundle with chromeStorageLocal section. */
    if (payload.chromeStorageLocal && typeof payload.chromeStorageLocal === 'object'
        && !Array.isArray(payload.chromeStorageLocal)) {
      var nested = payload.chromeStorageLocal[FOLDER_STATE_KEY];
      if (nested && typeof nested === 'object') {
        var sourceLabel = payload.schema && typeof payload.schema === 'string'
          ? 'full-bundle:' + payload.schema
          : 'chromeStorageLocal-wrapper';
        return {
          ok: true,
          source: sourceLabel,
          state: {
            schemaVersion: Number(nested.schemaVersion || nested.version || 1) || 1,
            exportedFrom: cleanString(nested.exportedFrom || nested.source || ''),
            exportedAt: cleanString(nested.exportedAt || nested.updatedAt || ''),
            folders: Array.isArray(nested.folders) ? nested.folders.slice() : [],
            items: (nested.items && typeof nested.items === 'object' && !Array.isArray(nested.items))
              ? nested.items
              : {},
          },
        };
      }
    }
    /* Shape (a): raw folder-state object. */
    if (Array.isArray(payload.folders) || (payload.items && typeof payload.items === 'object' && !Array.isArray(payload.items))) {
      return {
        ok: true,
        source: 'raw-folder-state',
        state: {
          schemaVersion: Number(payload.schemaVersion || payload.version || 1) || 1,
          exportedFrom: cleanString(payload.exportedFrom || payload.source || ''),
          exportedAt: cleanString(payload.exportedAt || payload.updatedAt || ''),
          folders: Array.isArray(payload.folders) ? payload.folders.slice() : [],
          items: (payload.items && typeof payload.items === 'object' && !Array.isArray(payload.items))
            ? payload.items
            : {},
        },
      };
    }
    return { ok: false, source: '', state: null, error: 'unrecognized-folder-state-shape' };
  }

  async function importFolderStateOnly(payload, options) {
    var startedAt = new Date().toISOString();
    var startedAtMs = Date.now();
    var opts = (options && typeof options === 'object') ? options : {};
    var mirrorToChromeStorage = opts.mirrorToChromeStorage !== false; /* default: true */

    var sample = emptySample();
    var written = emptyWritten();
    var skipped = emptySkipped();
    var warnings = [];
    var errors = [];

    var parsed = normalizeFolderStatePayload(payload);
    if (!parsed.ok) {
      return {
        schema: 'h2o.studio.fullBundle.v2',
        mode: 'merge',
        source: 'folder-state-only',
        ok: false,
        destinationVersion: 'v1-sqlite',
        destinationBackend: 'sqlite',
        startedAt: startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtMs,
        written: written,
        skipped: skipped,
        warnings: warnings,
        errors: [{ kind: 'parse', error: parsed.error || 'invalid-folder-state-payload' }],
        sample: sample,
        fallbackKvUpdated: false,
      };
    }

    var folderState = parsed.state;
    /* Build a stub bundle wrapper so we can reuse the existing
     * importFolders + importFolderBindings code paths byte-for-byte.
     * chatArchive.chats is intentionally empty: importFolderBindings's
     * chatStateIndex lookup falls through to its defensive
     * stores.chats.get(chatId) check, which preserves pre-existing
     * bindings without orphaning anything. */
    var stubBundle = {
      schema: 'h2o.studio.fullBundle.v2',
      chromeStorageLocal: {},
      chatArchive: { schema: 'h2o.chatArchive.bundle.v1', chats: [] },
    };
    stubBundle.chromeStorageLocal[FOLDER_STATE_KEY] = folderState;

    var stores = (H2O.Studio && H2O.Studio.store) || {};
    var result = {
      schema: 'h2o.studio.fullBundle.v2',
      mode: 'merge',
      source: 'folder-state-only',
      ok: true,
      payloadSource: parsed.source,
      destinationVersion: 'v1-sqlite',
      destinationBackend: 'sqlite',
      startedAt: startedAt,
      completedAt: '',
      durationMs: 0,
      written: written,
      skipped: skipped,
      warnings: warnings,
      errors: errors,
      sample: sample,
      fallbackKvUpdated: false,
    };

    /* Empty per-chat state index — importFolderBindings will fall through
     * to stores.chats.get(chatId) for any chatId not in the index, and
     * record an orphan-folder-binding warning if the chat row truly
     * doesn't exist. No chat data is written. */
    var emptyChatStateIndex = Object.create(null);

    try {
      await importFolders(stubBundle, stores, result);
      await importFolderBindings(stubBundle, stores, result, emptyChatStateIndex);
    } catch (e) {
      result.errors.push({ kind: 'fatal', error: String((e && e.message) || e) });
    }

    /* Best-effort mirror back into the fallback key so the Desktop
     * exporter's source-ordering fallback (#2 chrome.storage.local) finds
     * the same data on the next re-export. SQLite writes above are the
     * canonical truth; this mirror is for round-trip durability only. */
    if (mirrorToChromeStorage) {
      try {
        var mirrorPayload = {};
        mirrorPayload[FOLDER_STATE_KEY] = {
          schemaVersion: folderState.schemaVersion,
          exportedFrom: cleanString(folderState.exportedFrom || 'folder-state-only-import') || 'folder-state-only-import',
          exportedAt: cleanString(folderState.exportedAt) || new Date().toISOString(),
          folders: folderState.folders,
          items: folderState.items,
        };
        await chromeStorageSet(mirrorPayload);
        result.fallbackKvUpdated = true;
      } catch (e) {
        result.warnings.push({ kind: 'fallback-kv-mirror', warn: String((e && e.message) || e) });
        result.fallbackKvUpdated = false;
      }
    }

    result.ok = result.errors.length === 0;
    result.completedAt = new Date().toISOString();
    result.durationMs = Date.now() - startedAtMs;
    return result;
  }

  /* ── Diagnostics ─────────────────────────────────────────────────── */
  function diagnose() {
    var stores = (H2O.Studio && H2O.Studio.store) || {};
    return {
      installed: true,
      backend: 'sqlite',
      stage: 'M2c-3',
      writeSide: 'merge-only',
      storesAvailable: {
        chats:      !!(stores.chats      && typeof stores.chats.get      === 'function'),
        snapshots:  !!(stores.snapshots  && typeof stores.snapshots.get  === 'function'),
        categories: !!(stores.categories && typeof stores.categories.get === 'function'),
        labels:     !!(stores.labels     && typeof stores.labels.get     === 'function'),
        tags:       !!(stores.tags       && typeof stores.tags.get       === 'function'),
        folders:    !!(stores.folders    && typeof stores.folders.get    === 'function'),
      },
    };
  }

  /* ── Register ────────────────────────────────────────────────────── */
  H2O.Studio.ingestion = {
    __installed: true,
    __version: '0.1.0',
    dryRunImportBundle: dryRunImportBundle,
    importBundle: importBundle,
    importFolderStateOnly: importFolderStateOnly,
    diagnose: diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
