/* H2O Studio — Saved Chat Archive Importer / Recovery (Desktop, Phase H.4)
 *
 * Chat Saving Architecture Phase H.4. The FIRST import/recovery action for a
 * written `.h2ochat` package. It is a focused, Desktop-only, SIBLING of the
 * read-only Archive Inspector (the inspector stays read-only; this module owns
 * the single, verification-gated write). Two-step, no silent overwrite:
 *
 *   1. dryRunImportPackage({ packagePath })   — NON-MUTATING. Reuses the
 *      read-only inspector for verification, then reads existing store state to
 *      decide one of:
 *        import-ready / already-imported / conflict-chat-id /
 *        conflict-snapshot-id / corrupted / unsupported-version / rejected.
 *      It performs only reads (inspect + store.get/listByChat); it never writes.
 *
 *   2. importVerifiedPackage({ packagePath, mode }) — EXPLICIT operator action.
 *      Allowed only when the dry-run is `import-ready` (writes a new recovered
 *      chat + snapshot) or `already-imported` (a documented NO-OP). Default mode
 *      `import-as-new` recovers the package as a BRAND-NEW chat + snapshot with a
 *      freshly generated id and recorded provenance — it NEVER reuses the
 *      package's original chatId/snapshotId, so it is structurally incapable of
 *      overwriting existing rows. The `restore` / `relink` mode (re-linking onto
 *      the original ids) is DEFERRED — too risky for H.4.
 *
 * No-overwrite guarantee (by construction):
 *   - chats are written via store.chats.upsert with a FRESH recovered id (the
 *     id does not exist → INSERT, never UPDATE).
 *   - snapshots are written via store.snapshots.create with NO snapshotId in the
 *     patch → the store generates a fresh id → INSERT, never UPDATE.
 *   - the overwrite-by-id snapshot store primitive is NEVER called.
 *   - the package's original ids are written only into provenance metadata.
 *
 * Boundaries (H.4):
 *   - Desktop/Tauri only. On Chrome the stores + inspector are absent, so the
 *     card is disabled with an "available in Desktop Studio only" message.
 *   - Writes ONLY through the Desktop store adapters (store.chats /
 *     store.snapshots). No raw SQL, no package write/overwrite, no fs write.
 *   - Reads ONLY packages already inside archive/packages (scoped path guard);
 *     reads manifest.json + snapshot.json. NEVER reads or executes chat.html.
 *   - No scanner / materializer / writer / projector / CAS change. No
 *     watcher/poller/daemon. No Chrome runtime, no sync/WebDAV/cloud/native.
 *   - Export / share of packages is NOT implemented here (deferred).
 *
 * Public API (H2O.Studio.archiveImporter):
 *   isDesktopCapable() -> boolean
 *   dryRunImportPackage({ packagePath }) -> Promise<dry-run decision>
 *   importVerifiedPackage({ packagePath, mode }) -> Promise<import result>
 *   buildTurnsFromPackageSnapshot(snapshotJson) -> [turns]   (pure)
 *   renderArchiveImporterCard(container, options)
 *   mountArchiveImporterCard(healthContainer, options)
 *
 * Contracts: release-evidence/2026-06-24/saved-chat-archive-phase-h0-recovery-import-export-contract.md
 *            release-evidence/2026-06-24/saved-chat-archive-phase-h4-verification-gated-import-recovery.md
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  if (H2O.Studio.archiveImporter && H2O.Studio.archiveImporter.__installed) return;

  var MODULE_VERSION = '0.1.0-phase-h-4';
  var APP_LOCAL_DATA = 15;                 /* Tauri BaseDirectory.AppLocalData */
  var PACKAGE_ROOT = 'archive/packages';
  var DEFAULT_MODE = 'import-as-new';
  var RECOVERED_TITLE_PREFIX = 'Recovered: ';
  var SNAPSHOT_READ_CAP = 8 * 1024 * 1024; /* snapshot.json read cap (8 MiB) */

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }

  function cleanString(v) { return String(v == null ? '' : v).trim(); }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function safeObject(v) { return isObject(v) ? v : {}; }
  function asArray(v) { return Array.isArray(v) ? v : []; }
  function isFiniteNumber(v) { return typeof v === 'number' && isFinite(v); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function getInspector() {
    var ins = H2O.Studio && H2O.Studio.archiveInspector;
    return (ins && typeof ins.inspectPackage === 'function') ? ins : null;
  }
  function getStores() { return (H2O.Studio && H2O.Studio.store) || {}; }
  function getSnapshotsStore() {
    var s = getStores().snapshots;
    return (s && typeof s.create === 'function' && typeof s.get === 'function'
      && typeof s.listByChat === 'function') ? s : null;
  }
  function getChatsStore() {
    var c = getStores().chats;
    return (c && typeof c.upsert === 'function' && typeof c.get === 'function') ? c : null;
  }
  function isDesktopCapable() {
    return detectTauri() && !!getInspector() && !!getSnapshotsStore() && !!getChatsStore();
  }

  function getInvoke() {
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

  function joinPath() {
    var parts = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var part = cleanString(arguments[i]).replace(/^\/+|\/+$/g, '');
      if (part) parts.push(part);
    }
    return parts.join('/');
  }

  function packageDirNameForPath(packagePath) {
    var p = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    var idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
    return idx >= 0 ? p.slice(idx + 1) : p;
  }

  /* Safety scope: only operate on packages already inside archive/packages,
   * ending in .h2ochat. No arbitrary file paths. */
  function packagePathIsScoped(packagePath) {
    var p = cleanString(packagePath).replace(/[\/\\]+$/g, '');
    return p.indexOf(PACKAGE_ROOT + '/') === 0 && /\.h2ochat$/.test(packageDirNameForPath(p));
  }

  function decodeToText(value) {
    if (typeof value === 'string') return value;
    var bytes = value;
    if (value && value.data && (Array.isArray(value.data) || value.data instanceof Uint8Array)) bytes = value.data;
    try {
      var arr = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(asArray(bytes));
      if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(arr);
      var out = ''; for (var i = 0; i < arr.length; i += 1) out += String.fromCharCode(arr[i]);
      return out;
    } catch (_) { return ''; }
  }

  /* Read a package-relative text file via the existing bounded archive fs scope
   * (baseDir AppLocalData; path under archive/packages). Read-only. Used to read
   * snapshot.json (the recovery payload). Never reads chat.html. */
  function readPackageTextFile(packagePath, leaf) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for fs read_file'));
    if (!packagePathIsScoped(packagePath)) return Promise.reject(new Error('package path not scoped to ' + PACKAGE_ROOT));
    var rel = joinPath(packagePath, leaf);
    return Promise.resolve(invoke('plugin:fs|read_file', { path: rel, options: { baseDir: APP_LOCAL_DATA } }))
      .then(decodeToText);
  }

  function safeParseJson(text) {
    try { var v = JSON.parse(text); return isObject(v) ? v : null; } catch (_) { return null; }
  }

  function readPackageSnapshotJson(packagePath) {
    return readPackageTextFile(packagePath, 'snapshot.json')
      .then(function (t) { return safeParseJson(String(t || '').slice(0, SNAPSHOT_READ_CAP)); }, function () { return null; });
  }

  /* ── Pure mapping: package snapshot.json messages -> store snapshot turns ────
   * The `.h2ochat` projection carries a portable content model
   * (role / contentText / turnIndex / content parts), NOT the store's rich
   * outerHtml. Recovery preserves text + role + order faithfully and keeps the
   * original content parts + author/id/parentId/createdAt in turn meta. The
   * original rendered outerHtml is not present in the package, so it is left
   * empty (a documented, lossy-but-safe text recovery). Shape matches
   * store.snapshots.create({ turns: [] }). */
  function buildTurnsFromPackageSnapshot(snapshotJson) {
    var snap = safeObject(snapshotJson);
    var messages = asArray(snap.messages);
    return messages.map(function (msgRaw, i) {
      var msg = safeObject(msgRaw);
      var turnIdx = isFiniteNumber(msg.turnIndex) ? Math.floor(msg.turnIndex) : i;
      var role = cleanString(msg.role) || cleanString(msg.author) || 'assistant';
      var text = (typeof msg.contentText === 'string') ? msg.contentText : '';
      var meta = {};
      if (msg.id != null) meta.sourceMessageId = cleanString(msg.id);
      if (msg.parentId != null) meta.parentId = cleanString(msg.parentId);
      if (msg.author != null) meta.author = cleanString(msg.author);
      if (msg.createdAt != null) meta.createdAt = cleanString(msg.createdAt);
      if (msg.content != null) meta.content = msg.content;       /* portable content parts */
      if (Array.isArray(msg.assetRefs) && msg.assetRefs.length) meta.assetRefs = msg.assetRefs;
      if (isObject(msg.metadata)) meta.messageMetadata = msg.metadata;
      return { turnIdx: turnIdx, role: role, text: text, outerHtml: '', meta: meta };
    });
  }

  function packageIdentity(inspection, snapshotJson) {
    var ins = safeObject(inspection);
    var id = safeObject(ins.identity);
    var snap = safeObject(snapshotJson);
    return {
      chatId: cleanString(id.chatId) || cleanString(snap.chatId),
      snapshotId: cleanString(id.snapshotId) || cleanString(snap.snapshotId),
      title: cleanString(snap.title) || cleanString(id.title),
      contentHash: cleanString(id.contentHash),
      digest: cleanString(safeObject(snap.metadata).digest),
      capturedAt: cleanString(snap.capturedAt),
      messageCount: asArray(snap.messages).length || (isFiniteNumber(id.messageCount) ? id.messageCount : 0),
      schemaVersion: id.schemaVersion == null ? null : id.schemaVersion,
      payloadVersion: id.payloadVersion == null ? null : id.payloadVersion,
    };
  }

  /* Map the inspector status into a non-verified dry-run decision. verified ->
   * null (continue to store-state checks). */
  function nonVerifiedDecision(inspectStatus) {
    var s = cleanString(inspectStatus);
    if (s === 'verified') return null;
    if (s === 'unsupported-version') return 'unsupported-version';
    if (s === 'missing-files' || s === 'hash-mismatch' || s === 'corrupted') return 'corrupted';
    return 'rejected'; /* read-error or unknown */
  }

  function dryRunResult(packagePath, decision, identity, store, reason, inspectStatus) {
    return {
      ok: decision === 'import-ready' || decision === 'already-imported',
      decision: decision,
      status: decision,
      packagePath: cleanString(packagePath) || null,
      packageDirName: packagePath ? packageDirNameForPath(packagePath) : null,
      mutated: false,
      identity: identity || { chatId: '', snapshotId: '', title: '', contentHash: '', digest: '', capturedAt: '', messageCount: 0, schemaVersion: null, payloadVersion: null },
      store: store || { snapshotExists: false, chatExists: false, digestMatches: false, existingSnapshotId: '', existingChatId: '' },
      reason: reason || '',
      inspectStatus: cleanString(inspectStatus),
    };
  }

  /* ── Step 1: NON-MUTATING dry run ───────────────────────────────────────────
   * Reuses the read-only inspector for verification, then reads existing store
   * state (snapshots.get by the package's snapshotId; chats.get / listByChat by
   * the package's chatId) to decide. Performs NO write of any kind. */
  function dryRunImportPackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    if (!packagePath) return Promise.resolve(dryRunResult(null, 'rejected', null, null, 'no package path', ''));
    if (!isDesktopCapable()) return Promise.resolve(dryRunResult(packagePath, 'rejected', null, null, 'desktop-only', ''));
    if (!packagePathIsScoped(packagePath)) return Promise.resolve(dryRunResult(packagePath, 'rejected', null, null, 'path-not-scoped', ''));

    var inspector = getInspector();
    var snapStore = getSnapshotsStore();
    var chatStore = getChatsStore();
    var inspection = null;
    var snapshotJson = null;

    return Promise.resolve()
      .then(function () { return inspector.inspectPackage({ packagePath: packagePath }); })
      .then(function (res) { inspection = safeObject(res); })
      .then(function () { return readPackageSnapshotJson(packagePath); })
      .then(function (json) { snapshotJson = json; })
      .then(function () {
        var inspectStatus = cleanString(inspection.status);
        var identity = packageIdentity(inspection, snapshotJson);
        var early = nonVerifiedDecision(inspectStatus);
        if (early) return dryRunResult(packagePath, early, identity, null, 'inspector status: ' + inspectStatus, inspectStatus);
        /* verified — inspect existing store state (reads only) */
        return Promise.resolve(snapStore.get(identity.snapshotId)).catch(function () { return null; })
          .then(function (existingCombined) {
            var existingSnap = safeObject(existingCombined).snapshot;
            if (existingSnap && cleanString(existingSnap.id)) {
              var storeDigest = cleanString(existingSnap.digest) || cleanString(safeObject(existingSnap.meta).digest);
              var digestMatches = !!identity.digest && !!storeDigest && storeDigest === identity.digest;
              /* unknown digest on either side -> trust the strong snapshotId key (no-op, never a write) */
              var sameContent = digestMatches || !identity.digest || !storeDigest;
              var store = { snapshotExists: true, chatExists: true, digestMatches: digestMatches, existingSnapshotId: cleanString(existingSnap.id), existingChatId: cleanString(existingSnap.chatId) };
              if (sameContent) return dryRunResult(packagePath, 'already-imported', identity, store, 'snapshotId already present in store', inspectStatus);
              return dryRunResult(packagePath, 'conflict-snapshot-id', identity, store, 'snapshotId present with a different content digest; will not overwrite', inspectStatus);
            }
            /* snapshot absent — is the chat already present? */
            return Promise.all([
              Promise.resolve(chatStore.get(identity.chatId)).catch(function () { return null; }),
              Promise.resolve(snapStore.listByChat(identity.chatId)).catch(function () { return []; }),
            ]).then(function (pair) {
              var existingChat = pair[0];
              var snapsForChat = asArray(pair[1]);
              var chatExists = !!(existingChat && cleanString(safeObject(existingChat).id)) || snapsForChat.length > 0;
              var store = { snapshotExists: false, chatExists: chatExists, digestMatches: false, existingSnapshotId: '', existingChatId: chatExists ? identity.chatId : '' };
              if (chatExists) return dryRunResult(packagePath, 'conflict-chat-id', identity, store, 'chatId already present; will not modify the existing chat. Import-as-new under a fresh recovered chat is deferred.', inspectStatus);
              return dryRunResult(packagePath, 'import-ready', identity, store, 'verified and not present in store', inspectStatus);
            });
          });
      })
      .catch(function (err) {
        return dryRunResult(packagePath, 'rejected', null, null, String((err && err.message) || err || 'dry-run threw'), '');
      });
  }

  /* Fresh, collision-checked recovered chat id. NEVER derived from the package's
   * original ids, so an import can never overwrite an existing chat/snapshot. */
  function generateRecoveredChatId() {
    var rnd = '';
    try { if (global.crypto && typeof global.crypto.randomUUID === 'function') rnd = global.crypto.randomUUID(); } catch (_) { /* ignore */ }
    if (!rnd) rnd = 'r' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    return 'recovered_' + rnd;
  }
  function ensureFreshRecoveredChatId(chatStore) {
    var attempt = 0;
    function tryOnce() {
      var id = generateRecoveredChatId();
      return Promise.resolve(chatStore.get(id)).catch(function () { return null; })
        .then(function (existing) {
          if (!existing || !cleanString(safeObject(existing).id)) return id;
          attempt += 1;
          if (attempt >= 5) return null;
          return tryOnce();
        });
    }
    return tryOnce();
  }

  function importResult(packagePath, status, decision, recovered, reason) {
    return {
      ok: status === 'imported' || status === 'already-imported',
      status: status,
      decision: cleanString(decision),
      packagePath: cleanString(packagePath) || null,
      recovered: recovered || null,
      reason: reason || '',
    };
  }

  /* ── Step 2: EXPLICIT, verification-gated import ─────────────────────────────
   * Allowed only when the dry-run is import-ready (writes a new recovered chat +
   * snapshot) or already-imported (a NO-OP). Default mode import-as-new never
   * reuses the package's original ids (no overwrite). restore/relink deferred. */
  function importVerifiedPackage(options) {
    var opts = safeObject(options);
    var packagePath = cleanString(opts.packagePath);
    var mode = cleanString(opts.mode) || DEFAULT_MODE;
    if (!packagePath) return Promise.resolve(importResult(null, 'rejected', '', null, 'no package path'));
    if (!isDesktopCapable()) return Promise.resolve(importResult(packagePath, 'rejected', '', null, 'desktop-only'));
    /* restore / relink onto the package's original ids is deferred (too risky for H.4). */
    if (mode === 'restore' || mode === 'relink') {
      return Promise.resolve(importResult(packagePath, 'rejected', '', null, 'restore-relink-deferred'));
    }
    if (mode !== DEFAULT_MODE) {
      return Promise.resolve(importResult(packagePath, 'rejected', '', null, 'unsupported-mode: ' + mode));
    }

    var snapStore = getSnapshotsStore();
    var chatStore = getChatsStore();

    return dryRunImportPackage({ packagePath: packagePath }).then(function (dry) {
      var decision = cleanString(dry.decision);
      /* documented safe no-op: the snapshot is already in the store. */
      if (decision === 'already-imported') {
        return importResult(packagePath, 'already-imported', decision, {
          newChatId: '', newSnapshotId: '',
          originalChatId: dry.identity.chatId, originalSnapshotId: dry.identity.snapshotId,
        }, 'snapshot already present in store; no write performed');
      }
      /* hard gate: only import-ready proceeds to a write. */
      if (decision !== 'import-ready') {
        var status = (decision === 'conflict-chat-id' || decision === 'conflict-snapshot-id') ? 'conflict' : 'rejected';
        return importResult(packagePath, status, decision, null, dry.reason || ('not import-ready: ' + decision));
      }

      var identity = safeObject(dry.identity);
      var snapshotJson = null;
      /* re-verify at write time (double gate) + read the recovery payload. */
      return Promise.resolve(getInspector().inspectPackage({ packagePath: packagePath })).then(function (reInspect) {
        if (cleanString(safeObject(reInspect).status) !== 'verified') {
          return importResult(packagePath, 'rejected', decision, null, 'package no longer verified at write time');
        }
        return readPackageSnapshotJson(packagePath).then(function (json) {
          snapshotJson = json;
          var turns = buildTurnsFromPackageSnapshot(snapshotJson);
          if (!turns.length) {
            /* no partial / empty import */
            return importResult(packagePath, 'rejected', decision, null, 'no turns to import (empty payload; refusing partial import)');
          }
          var title = cleanString(identity.title) || cleanString(safeObject(snapshotJson).title) || 'Recovered chat';
          var recoveredTitle = RECOVERED_TITLE_PREFIX + title;
          var provenance = {
            recoveredFromPackage: true,
            source: 'h2ochat-package-recovery',
            importer: 'archive-importer-h4',
            mode: DEFAULT_MODE,
            originalChatId: identity.chatId,
            originalSnapshotId: identity.snapshotId,
            contentHash: identity.contentHash,
            digest: identity.digest,
            packagePath: packagePath,
            packageDirName: packageDirNameForPath(packagePath),
            originalCapturedAt: identity.capturedAt,
            recoveredAt: new Date().toISOString(),
          };

          return ensureFreshRecoveredChatId(chatStore).then(function (freshChatId) {
            if (!freshChatId) return importResult(packagePath, 'rejected', decision, null, 'could not allocate a fresh recovered chat id');
            /* hard no-overwrite assertion: never reuse the package's original ids. */
            if (freshChatId === identity.chatId || freshChatId === identity.snapshotId) {
              return importResult(packagePath, 'rejected', decision, null, 'refusing to reuse original id');
            }

            /* (a) recovered chat — fresh id => INSERT (never UPDATE). */
            var chatPatch = {
              chatId: freshChatId,
              title: recoveredTitle,
              isSaved: true,
              isLinked: false,
              meta: { recovered: provenance },
            };
            return Promise.resolve(chatStore.upsert(chatPatch)).then(function () {
              /* (b) recovered snapshot — NO snapshotId in the patch => the store
               * generates a fresh id => INSERT (never an update). The
               * overwrite-by-id store primitive is intentionally never used. */
              var snapPatch = {
                chatId: freshChatId,
                title: recoveredTitle,
                messageCount: turns.length,
                turns: turns,
                meta: { recovered: provenance },
              };
              return Promise.resolve(snapStore.create(snapPatch)).then(function (combined) {
                var newSnapshotId = cleanString(safeObject(safeObject(combined).snapshot).id);
                return importResult(packagePath, 'imported', decision, {
                  newChatId: freshChatId,
                  newSnapshotId: newSnapshotId,
                  originalChatId: identity.chatId,
                  originalSnapshotId: identity.snapshotId,
                  messageCount: turns.length,
                }, 'recovered as a new chat + snapshot');
              });
            });
          });
        });
      });
    }).catch(function (err) {
      return importResult(packagePath, 'rejected', '', null, String((err && err.message) || err || 'import threw'));
    });
  }

  /* ── UI: adjacent recovery card (Desktop-only, explicit, no global button) ── */

  var TEXT = {
    title: 'Recover Saved Chat Archive Package',
    eyebrow: 'Import / recovery · Desktop only · verification-gated',
    intro: 'Dry-run, then explicitly import a verified .h2ochat package as a NEW recovered chat + snapshot. No overwrite: existing chats/snapshots are never modified. Restore/relink onto original ids is deferred.',
    unavailable: 'This import/recovery action is available in Desktop Studio only.',
    loadButton: 'Load packages',
    loadingList: 'Loading packages…',
    noPackages: 'No saved chat packages found in the archive.',
    selectPlaceholder: 'Select a package…',
    dryRunButton: 'Dry-run',
    dryRunBusy: 'Checking…',
    importButton: 'Import (recover as new)',
    importBusy: 'Importing…',
    pickFirst: 'Load and select a package first.',
    importHint: 'Import is enabled only after a dry-run returns import-ready.',
  };

  var STATUS_PRESENTATION = {
    'verified': { tone: 'ok', label: 'Verified' },
    'import-ready': { tone: 'ok', label: 'Import-ready', note: 'Verified and not present in the store. Safe to import as a new recovered chat + snapshot.' },
    'already-imported': { tone: 'neutral', label: 'Already imported', note: 'This snapshot is already in the store. Import is a no-op; nothing is written or overwritten.' },
    'conflict-chat-id': { tone: 'warn', label: 'Conflict (chat exists)', note: 'A chat with this id already exists. The existing chat will not be modified; import is blocked.' },
    'conflict-snapshot-id': { tone: 'warn', label: 'Conflict (snapshot id)', note: 'A snapshot with this id exists with different content. It will not be overwritten; import is blocked.' },
    'conflict': { tone: 'warn', label: 'Conflict', note: 'Existing state conflicts with this package. Nothing was modified.' },
    'corrupted': { tone: 'block', label: 'Corrupted', note: 'The package failed verification. It is not safe to import.' },
    'unsupported-version': { tone: 'warn', label: 'Unsupported version', note: 'The package schema/payload version is outside the supported range.' },
    'imported': { tone: 'ok', label: 'Imported', note: 'Recovered as a NEW chat + snapshot with provenance. No existing row was overwritten.' },
    'rejected': { tone: 'block', label: 'Rejected', note: 'Import was refused.' },
  };

  var PILL_TONES = {
    ok: 'background:rgba(46,160,67,.18);color:#3fb950;border:1px solid rgba(46,160,67,.35)',
    warn: 'background:rgba(210,153,34,.18);color:#d29922;border:1px solid rgba(210,153,34,.35)',
    block: 'background:rgba(248,81,73,.16);color:#f85149;border:1px solid rgba(248,81,73,.35)',
    neutral: 'background:rgba(255,255,255,.06);color:inherit;border:1px solid rgba(255,255,255,.14)',
  };

  function pillHtml(label, tone) {
    var style = PILL_TONES[tone] || PILL_TONES.neutral;
    return '<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;' + style + '">' + escapeHtml(label) + '</span>';
  }

  function listPackagesViaInspector() {
    var ins = getInspector();
    if (!ins || typeof ins.listPackages !== 'function') return Promise.resolve([]);
    return Promise.resolve(ins.listPackages({})).then(function (rows) { return asArray(rows); }, function () { return []; });
  }

  function renderArchiveImporterCard(container, options) {
    if (!container || typeof container !== 'object') return null;
    if (typeof document === 'undefined') return null;
    var opts = options || {};
    var dryRun = (typeof opts.dryRunImportPackage === 'function') ? opts.dryRunImportPackage : dryRunImportPackage;
    var doImport = (typeof opts.importVerifiedPackage === 'function') ? opts.importVerifiedPackage : importVerifiedPackage;
    var listFn = (typeof opts.listPackages === 'function') ? opts.listPackages : listPackagesViaInspector;
    var desktop = (typeof opts.isDesktop === 'boolean') ? opts.isDesktop : isDesktopCapable();

    var card = {
      desktop: desktop, busy: false, listBusy: false, listLoaded: false,
      options: [], packagePath: '', lastDry: null, lastImport: null,
    };

    function canImport() {
      return !!card.lastDry && card.lastDry.packagePath === card.packagePath
        && (card.lastDry.decision === 'import-ready' || card.lastDry.decision === 'already-imported');
    }

    function syncPathFromSelect() {
      var sel = container.querySelector('[data-archive-importer-select="1"]');
      if (sel && typeof sel.value === 'string') card.packagePath = sel.value.trim();
    }

    function optionsHtml() {
      if (!card.desktop) return '';
      var rows = asArray(card.options);
      var hint = '';
      if (card.listBusy) hint = '<div style="opacity:.6;font-size:12px;margin-top:6px">' + escapeHtml(TEXT.loadingList) + '</div>';
      else if (card.listLoaded && !rows.length) hint = '<div style="opacity:.6;font-size:12px;margin-top:6px">' + escapeHtml(TEXT.noPackages) + '</div>';
      var select = '';
      if (rows.length) {
        select = '<select data-archive-importer-select="1" style="margin-top:6px;width:100%;padding:7px;border-radius:6px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.14);color:inherit;font:inherit">'
          + '<option value="">' + escapeHtml(TEXT.selectPlaceholder) + '</option>';
        rows.forEach(function (row) {
          var r = safeObject(row);
          var label = cleanString(r.packageDirName) + (cleanString(r.status) ? '  [' + cleanString(r.status) + ']' : '');
          select += '<option value="' + escapeHtml(cleanString(r.packagePath)) + '"' + (cleanString(r.packagePath) === card.packagePath ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
        });
        select += '</select>';
      }
      return hint + select;
    }

    function identityRow(key, value) {
      if (!cleanString(value)) return '';
      return '<div style="display:flex;gap:8px;font-size:12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;word-break:break-all;user-select:text">'
        + '<span style="opacity:.55;min-width:120px">' + escapeHtml(key) + '</span><span>' + escapeHtml(value) + '</span></div>';
    }

    function decisionBlockHtml(result, kind) {
      if (!result) return '';
      var status = cleanString(result.status) || cleanString(result.decision);
      var preset = STATUS_PRESENTATION[status] || { tone: 'neutral', label: status, note: '' };
      var id = safeObject(result.identity);
      var rec = safeObject(result.recovered);
      var idHtml = ''
        + identityRow('package', result.packageDirName || packageDirNameForPath(result.packagePath))
        + identityRow('chatId', id.chatId || rec.originalChatId)
        + identityRow('snapshotId', id.snapshotId || rec.originalSnapshotId)
        + identityRow('title', id.title)
        + identityRow('contentHash', id.contentHash)
        + identityRow('recovered chatId', rec.newChatId)
        + identityRow('recovered snapshotId', rec.newSnapshotId);
      return '<div data-archive-importer-' + kind + '="1" data-archive-importer-status="' + escapeHtml(status) + '" style="margin-top:10px;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px;background:rgba(255,255,255,.025)">'
        + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + pillHtml(preset.label, preset.tone) + '<span style="opacity:.6;font-size:12px">' + escapeHtml(kind === 'dry' ? 'dry-run' : 'import') + ' · ' + escapeHtml(status) + '</span></div>'
        + (preset.note ? '<div style="opacity:.78;font-size:12px;margin-top:5px">' + escapeHtml(preset.note) + '</div>' : '')
        + (cleanString(result.reason) ? '<div style="opacity:.6;font-size:11px;margin-top:4px">' + escapeHtml(result.reason) + '</div>' : '')
        + '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">' + idHtml + '</div>'
        + '</div>';
    }

    function render() {
      var disabledLoad = (!card.desktop || card.listBusy || card.busy) ? ' disabled' : '';
      var disabledDry = (!card.desktop || card.busy || card.listBusy) ? ' disabled' : '';
      var importEnabled = card.desktop && !card.busy && !card.listBusy && canImport();
      var disabledImport = importEnabled ? '' : ' disabled';
      var loadStyle = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;' + (disabledLoad ? 'opacity:.5;cursor:default;' : '');
      var dryStyle = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);color:inherit;font:inherit;' + (disabledDry ? 'opacity:.5;cursor:default;' : '');
      var importStyle = 'padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(46,160,67,.16);border:1px solid rgba(46,160,67,.4);color:inherit;font:inherit;' + (importEnabled ? '' : 'opacity:.45;cursor:default;');
      var bodyHtml;
      if (!card.desktop) {
        bodyHtml = '<div style="opacity:.7;font-size:12px;margin-top:8px">' + escapeHtml(TEXT.unavailable) + '</div>';
      } else {
        bodyHtml = ''
          + optionsHtml()
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">'
          + '<button type="button" data-archive-importer-dry="1" style="' + dryStyle + '"' + disabledDry + '>' + escapeHtml(card.busy === 'dry' ? TEXT.dryRunBusy : TEXT.dryRunButton) + '</button>'
          + '<button type="button" data-archive-importer-import="1" style="' + importStyle + '"' + disabledImport + '>' + escapeHtml(card.busy === 'import' ? TEXT.importBusy : TEXT.importButton) + '</button>'
          + '<button type="button" data-archive-importer-load="1" style="' + loadStyle + '"' + disabledLoad + '>' + escapeHtml(TEXT.loadButton) + '</button>'
          + '</div>'
          + '<div style="opacity:.55;font-size:11px;margin-top:6px">' + escapeHtml(TEXT.importHint) + '</div>'
          + decisionBlockHtml(card.lastDry, 'dry')
          + decisionBlockHtml(card.lastImport, 'import');
      }
      container.innerHTML = ''
        + '<section data-archive-importer-card="1" style="border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:12px;background:rgba(255,255,255,.02)">'
        + '<div style="font-size:11px;letter-spacing:.04em;text-transform:uppercase;opacity:.6">' + escapeHtml(TEXT.eyebrow) + '</div>'
        + '<div style="font-weight:600;margin-top:2px">' + escapeHtml(TEXT.title) + '</div>'
        + '<div style="opacity:.7;font-size:12px;margin-top:4px">' + escapeHtml(TEXT.intro) + '</div>'
        + bodyHtml
        + '</section>';

      var dryBtn = container.querySelector('[data-archive-importer-dry="1"]');
      if (dryBtn && card.desktop && !card.busy && !card.listBusy) dryBtn.addEventListener('click', doDryRun, { once: true });
      var importBtn = container.querySelector('[data-archive-importer-import="1"]');
      if (importBtn && importEnabled) importBtn.addEventListener('click', doImportClick, { once: true });
      var loadBtn = container.querySelector('[data-archive-importer-load="1"]');
      if (loadBtn && card.desktop && !card.listBusy && !card.busy) loadBtn.addEventListener('click', doLoad, { once: true });
      var sel = container.querySelector('[data-archive-importer-select="1"]');
      if (sel) sel.addEventListener('change', function (ev) {
        var t = ev && ev.target;
        card.packagePath = (t && typeof t.value === 'string') ? t.value.trim() : '';
        card.lastDry = null; card.lastImport = null; /* selecting a new package clears the gate */
        render();
      });
    }

    function doLoad() {
      if (card.listBusy || card.busy || !card.desktop) return;
      card.listBusy = true; render();
      Promise.resolve(listFn({})).then(function (rows) {
        card.listBusy = false; card.listLoaded = true; card.options = asArray(rows); render();
      }, function () { card.listBusy = false; card.listLoaded = true; card.options = []; render(); });
    }

    function doDryRun() {
      if (card.busy || !card.desktop) return;
      syncPathFromSelect();
      if (!card.packagePath) { card.lastDry = dryRunResult(null, 'rejected', null, null, 'select a package first', ''); render(); return; }
      card.busy = 'dry'; card.lastDry = null; card.lastImport = null; render();
      Promise.resolve(dryRun({ packagePath: card.packagePath })).then(function (res) {
        card.busy = false; card.lastDry = (res && typeof res === 'object') ? res : dryRunResult(card.packagePath, 'rejected', null, null, 'no result', ''); render();
      }, function (err) {
        card.busy = false; card.lastDry = dryRunResult(card.packagePath, 'rejected', null, null, String((err && err.message) || err || 'dry-run threw'), ''); render();
      });
    }

    function doImportClick() {
      if (card.busy || !card.desktop || !canImport()) return;
      syncPathFromSelect();
      card.busy = 'import'; card.lastImport = null; render();
      Promise.resolve(doImport({ packagePath: card.packagePath, mode: DEFAULT_MODE })).then(function (res) {
        card.busy = false; card.lastImport = (res && typeof res === 'object') ? res : importResult(card.packagePath, 'rejected', '', null, 'no result'); render();
      }, function (err) {
        card.busy = false; card.lastImport = importResult(card.packagePath, 'rejected', '', null, String((err && err.message) || err || 'import threw')); render();
      });
    }

    render();
    return { getState: function () { return card; }, dryRun: doDryRun, doImport: doImportClick, load: doLoad };
  }

  /* Mount the importer card as a SIBLING below the read-only Archive Health /
   * Inspector cards, so health re-renders never wipe it. Idempotent. */
  function mountArchiveImporterCard(healthContainer, options) {
    if (typeof document === 'undefined') return null;
    if (!healthContainer || typeof healthContainer !== 'object') return null;
    var parent = healthContainer.parentNode;
    if (!parent || typeof parent.insertBefore !== 'function') return null;
    var box = (typeof parent.querySelector === 'function') ? parent.querySelector('[data-archive-importer-mount="1"]') : null;
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-archive-importer-mount', '1');
      box.style.marginTop = '12px';
      parent.appendChild(box);
    }
    return renderArchiveImporterCard(box, options || {});
  }

  H2O.Studio.archiveImporter = {
    __installed: true,
    __version: MODULE_VERSION,
    detectTauri: detectTauri,
    isDesktopCapable: isDesktopCapable,
    dryRunImportPackage: dryRunImportPackage,
    importVerifiedPackage: importVerifiedPackage,
    buildTurnsFromPackageSnapshot: buildTurnsFromPackageSnapshot,
    renderArchiveImporterCard: renderArchiveImporterCard,
    mountArchiveImporterCard: mountArchiveImporterCard,
  };
})(typeof window !== 'undefined' ? window : globalThis);
