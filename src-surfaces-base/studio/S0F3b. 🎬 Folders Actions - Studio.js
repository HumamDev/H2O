/* H2O Studio — Folders Actions (R4.4 — Desktop-first ownership)
 *
 * Studio-side WRITE API for the folders catalog AND its single-folder-
 * per-chat bindings. Completes the R4 catalog-write rationalization;
 * companion of S0F4b (Categories), S0F5b (Tags), S0F6b (Labels).
 *
 * Public API: H2O.Studio.actions.folders = {
 *   create({name, parentId, color, iconColor, source, meta}),
 *   rename(folderId, newName),
 *   update(folderId, patch),    // name/parentId/color/iconColor/meta passthrough
 *   remove(folderId),            // Desktop Phase 4A soft delete; also exposed as `delete`
 *   restore(folderIdOrTombstoneId),
 *   requestDelete(folderId),     // Chrome Phase 4C request-only review row, no mutation
 *   bindChat(chatId, folderId),
 *   unbindChat(chatId),          // single-folder-per-chat — no folderId needed
 *   getForChat(chatId),          // returns the single folder row or null
 *   listChats(folderId),         // returns chat rows in this folder
 *   diagnose(),
 * }
 *
 * Each mutation:
 *   1. Validates inputs (cleanString, non-empty checks).
 *   2. Calls the appropriate H2O.Studio.store.folders.* method, which
 *      writes synchronously to SQLite via plugin:sql.
 *   3. On success, dispatches the canonical refresh event
 *      `evt:h2o:library-index:refresh-request` with reason
 *      'folders-actions:<action>'. Same single-flight contract used by
 *      R4.1/R4.2/R4.3 actions modules.
 *   4. Returns a normalized result object {ok, action, status, ...}.
 *
 * Desktop mutation methods are Tauri-gated. On Chrome/MV3 this file
 * installs only the Phase 4C requestDelete/list/diagnostic helpers; it
 * does not expose remove/delete/apply and does not mutate folders.
 *
 * ── PRESERVED EXISTING BEHAVIOR ───────────────────────────────────────
 * S0F1b's `desktopSetFolderBinding` (which predates R4) continues to
 * work AND is the canonical entry point for the Studio UI's folder
 * picker. It will be REFACTORED to delegate into actions.folders so
 * the underlying SQLite write becomes consistent with R4.1/R4.2/R4.3.
 * The refactor preserves:
 *   - desktopSetFolderBinding's return shape ({ok, status, chatId,
 *     folderId, folderName} on success; folderWriteFailure(...) on
 *     failure with `desktop-bind-failed` / `desktop-store-unavailable`
 *     / `desktop-write-failed` etc. status codes)
 *   - the existing `folder-binding-changed` event dispatched by
 *     S0F1b's `emitUpdated` (downstream consumers — Sidebar Sections,
 *     Insights — continue to listen for this event)
 *   - `bustCaches` invalidation of S0F1b-local memoized state
 *   - explicit `getIndex().refresh('desktop-setFolderBinding')` —
 *     coalesces with the refresh event via S0F1c's single-flight
 *     guard
 *   - `recordWrite('folderBinding', ...)` diagnostic logging
 *
 * The new actions.folders module is THE place SQLite writes happen;
 * S0F1b becomes the place UI-facing concerns happen (folder name
 * lookup for display, cache invalidation, downstream event emit).
 *
 * ── CARDINALITY ───────────────────────────────────────────────────────
 * Single-folder-per-chat: `folder_bindings` has PRIMARY KEY (chat_id),
 * not composite. A chat is in AT MOST one folder. `bindChat` does
 * INSERT OR REPLACE so rebinding a chat to a new folder atomically
 * moves it (prior binding row is replaced). `unbindChat(chatId)` takes
 * only chatId because there's only one row to drop.
 *
 * ── SAFETY INVARIANTS ─────────────────────────────────────────────────
 *   - no schema change
 *   - no SQLite migration
 *   - no Native ChatGPT change
 *   - read facade S0F3a (H2O.folders) is unchanged
 *   - S0F1b.desktopSetFolderBinding's return shape is preserved
 *   - this module is purely additive on a sibling namespace
 *
 * Notes on store API mapping (verified against store/folders.tauri.js):
 *   - bindChat signature: store.bindChat(folderId, chatId, opts) —
 *     our public API uses (chatId, folderId) to match the "chat is the
 *     subject" convention used by Labels/Tags/Categories actions.
 *   - INSERT OR REPLACE on folder_bindings — chat already in folder A
 *     and you bindChat to folder B → row is replaced atomically.
 *   - unbindChat signature: store.unbindChat(folderId, chatId) — we
 *     wrap a `unbindChat(chatId)` that first calls listForChat to find
 *     the current folder (V1: at most 1), then unbinds it.
 *   - remove/delete routes through store.folders.softDeleteEmptyFolder
 *     for Desktop Phase 4A. The lower-level store.folders.remove hard
 *     primitive remains available but is not used by this action API.
 *
 * Contract: src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md
 *           docs/architecture/library-migration-plan.md (Phase 3)
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

  function detectChromeExtension() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.actions = H2O.Studio.actions || {};
  if (!detectTauri()) {
    installChromeFolderDeleteRequestActions();
    return;
  }
  if (H2O.Studio.actions.folders && H2O.Studio.actions.folders.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var PHASE          = 'R4.4-folders';
  var MAX_ERRORS     = 20;
  var REFRESH_EVENT  = 'evt:h2o:library-index:refresh-request';
  var FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';

  /* ── State (in-memory only) ──────────────────────────────────────── */
  var state = {
    installedAt: Date.now(),
    writesSinceBoot: 0,
    lastWriteAt: 0,
    lastWriteAction: '',
    lastWriteOk: null,
    lastAutoExportSchedule: null,
    lastFolderStateMirrorReconcile: null,
    errors: [],
  };

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeMeta(value) {
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  }

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function epochToIso(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '';
    try { return new Date(n).toISOString(); }
    catch (_) { return ''; }
  }

  function safeObject(value) {
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
  }

  function chromeFolderDeleteReviewStore() {
    try {
      return (H2O.Studio && H2O.Studio.store && H2O.Studio.store.tombstoneReviews) || null;
    } catch (_) {
      return null;
    }
  }

  function chromeRequestBlockers(result) {
    var rows = Array.isArray(result && result.blockers) ? result.blockers : [];
    return rows.map(function (entry) {
      if (typeof entry === 'string') return entry;
      return cleanString(entry && entry.code);
    }).filter(Boolean);
  }

  function chromeRequestResult(action, status, extra) {
    return Object.assign({
      ok: false,
      action: cleanString(action),
      status: cleanString(status),
      surface: 'chrome-studio',
      phase: 'phase4c-chrome-delete-request',
      noHardDelete: true,
      noChatDelete: true,
      desktopApplyRequired: true,
    }, extra || {});
  }

  async function chromeRequestDelete(folderInput, options) {
    var folderId = cleanString(folderInput && (folderInput.folderId || folderInput.id || folderInput.recordId) || folderInput);
    if (!folderId) {
      return chromeRequestResult('requestDelete', 'folder-identity-missing', {
        blockers: ['folder-identity-missing'],
      });
    }
    var reviewStore = chromeFolderDeleteReviewStore();
    if (!reviewStore || typeof reviewStore.requestFolderDelete !== 'function') {
      return chromeRequestResult('requestDelete', 'tombstone-review-store-unavailable', {
        folderId: folderId,
        blockers: ['tombstone-review-store-unavailable'],
      });
    }
    try {
      var result = await reviewStore.requestFolderDelete(folderInput, options || {});
      var ok = !!(result && result.ok);
      return chromeRequestResult('requestDelete', ok ? cleanString(result.status) || 'pending' : cleanString(result && result.status) || 'folder-delete-request-failed', {
        ok: ok,
        folderId: cleanString(result && result.folderId) || folderId,
        requestId: cleanString(result && result.requestId),
        reviewId: cleanString(result && result.reviewId),
        duplicate: !!(result && result.duplicate),
        blockers: chromeRequestBlockers(result),
        review: result && result.review || null,
        payload: result && result.payload || null,
      });
    } catch (e) {
      return chromeRequestResult('requestDelete', 'folder-delete-request-threw', {
        folderId: folderId,
        blockers: ['folder-delete-request-threw'],
        reason: String((e && e.message) || e),
      });
    }
  }

  async function chromeListDeleteRequests(filters) {
    var reviewStore = chromeFolderDeleteReviewStore();
    if (!reviewStore || typeof reviewStore.listFolderDeleteRequests !== 'function') return [];
    return reviewStore.listFolderDeleteRequests(filters || {});
  }

  async function chromeDiagnoseDeleteRequests(options) {
    var reviewStore = chromeFolderDeleteReviewStore();
    if (!reviewStore || typeof reviewStore.diagnoseFolderDeleteRequests !== 'function') {
      return chromeRequestResult('diagnoseDeleteRequests', 'tombstone-review-store-unavailable', {
        blockers: ['tombstone-review-store-unavailable'],
      });
    }
    return reviewStore.diagnoseFolderDeleteRequests(options || {});
  }

  function installChromeFolderDeleteRequestActions() {
    if (!detectChromeExtension()) return;
    H2O.Studio.actions = H2O.Studio.actions || {};
    var existing = H2O.Studio.actions.folders || {};
    if (existing.__installed && typeof existing.requestDelete === 'function') return;
    existing.__installed = true;
    existing.__version = '0.1.0-phase4c-request';
    existing.requestDelete = chromeRequestDelete;
    existing.listDeleteRequests = chromeListDeleteRequests;
    existing.diagnoseDeleteRequests = chromeDiagnoseDeleteRequests;
    if (typeof existing.diagnose !== 'function') existing.diagnose = chromeDiagnoseDeleteRequests;
    H2O.Studio.actions.folders = existing;
  }

  function pushError(op, err) {
    try {
      state.errors.push({
        at: Date.now(),
        op: cleanString(op),
        error: String(err && (err.message || err)),
      });
      if (state.errors.length > MAX_ERRORS) {
        state.errors.splice(0, state.errors.length - MAX_ERRORS);
      }
    } catch (_) { /* ignore */ }
  }

  function recordWrite(action, ok) {
    state.writesSinceBoot += 1;
    state.lastWriteAt = Date.now();
    state.lastWriteAction = cleanString(action);
    state.lastWriteOk = !!ok;
  }

  function dispatchRefresh(reason) {
    try {
      if (typeof global.dispatchEvent === 'function'
          && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(REFRESH_EVENT, {
          detail: { reason: 'folders-actions:' + cleanString(reason) },
        }));
      }
    } catch (e) { pushError('dispatchRefresh', e); }
  }

  function scheduleDesktopLatestExport(reason, folderId) {
    var cleanReason = cleanString(reason) || 'folder-metadata-change';
    try {
      var autoExport = H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.autoExport;
      if (!autoExport || typeof autoExport.schedule !== 'function') {
        state.lastAutoExportSchedule = {
          at: Date.now(),
          reason: cleanReason,
          folderId: cleanString(folderId),
          status: 'auto-export-unavailable',
        };
        return null;
      }
      var result = autoExport.schedule('folder-metadata:' + cleanReason);
      state.lastAutoExportSchedule = {
        at: Date.now(),
        reason: cleanReason,
        folderId: cleanString(folderId),
        status: cleanString(result && result.status),
        scheduled: !!(result && result.scheduled),
        enabled: !!(result && result.enabled),
      };
      return result;
    } catch (e) {
      state.lastAutoExportSchedule = {
        at: Date.now(),
        reason: cleanReason,
        folderId: cleanString(folderId),
        status: 'auto-export-schedule-error',
        error: String((e && e.message) || e),
      };
      pushError('scheduleDesktopLatestExport', e);
      return null;
    }
  }

  function getStore() {
    try {
      return (H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders) || null;
    } catch (_) { return null; }
  }

  function chromeStorageLocal() {
    try {
      var api = global['chrome'];
      return api && api.storage && api.storage.local
        ? api.storage.local
        : null;
    } catch (_) { return null; }
  }

  function chromeStorageGet(key) {
    return new Promise(function (resolve, reject) {
      var local = chromeStorageLocal();
      if (!local || typeof local.get !== 'function') {
        reject(new Error('storage-local-unavailable'));
        return;
      }
      try {
        local.get([key], function (items) {
          var api = global['chrome'];
          var runtimeError = api && api.runtime && api.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }
          resolve(items ? items[key] : undefined);
        });
      } catch (e) { reject(e); }
    });
  }

  function chromeStorageSet(items) {
    return new Promise(function (resolve, reject) {
      var local = chromeStorageLocal();
      if (!local || typeof local.set !== 'function') {
        reject(new Error('storage-local-unavailable'));
        return;
      }
      try {
        local.set(items, function () {
          var api = global['chrome'];
          var runtimeError = api && api.runtime && api.runtime.lastError;
          if (runtimeError) {
            reject(new Error(runtimeError.message || String(runtimeError)));
            return;
          }
          resolve(true);
        });
      } catch (e) { reject(e); }
    });
  }

  function folderRowId(row) {
    return cleanString(row && (row.folderId || row.id));
  }

  function folderRowMeta(row) {
    return safeObject(row && row.meta);
  }

  function folderRowColor(row) {
    var meta = folderRowMeta(row);
    return cleanString((row && (row.iconColor || row.color)) || meta.iconColor || meta.color || '');
  }

  function folderRowUpdatedAt(row) {
    var meta = folderRowMeta(row);
    var raw = (row && row.updatedAt) || meta.updatedAt || '';
    return typeof raw === 'number' ? epochToIso(raw) : cleanString(raw);
  }

  function projectFolderStateMirrorRow(rowInput, existingInput, patchInput, fallbackUpdatedAt) {
    var row = safeObject(rowInput);
    var existing = safeObject(existingInput);
    var patch = safeObject(patchInput);
    var folderId = cleanString(folderRowId(row) || folderRowId(existing));
    if (!folderId) return null;
    var rowMeta = folderRowMeta(row);
    var existingMeta = folderRowMeta(existing);
    var patchMeta = safeObject(patch.meta);
    var nextColor = Object.prototype.hasOwnProperty.call(patch, 'iconColor')
      ? cleanString(patch.iconColor)
      : Object.prototype.hasOwnProperty.call(patch, 'color')
        ? cleanString(patch.color)
        : folderRowColor(row);
    var updatedAt = cleanString(fallbackUpdatedAt || folderRowUpdatedAt(row) || patchMeta.updatedAt || existing.updatedAt || existingMeta.updatedAt || nowIso());
    var name = cleanString((row && row.name) || rowMeta.name || existing.name || existing.title || existingMeta.name || folderId);
    var meta = Object.assign({}, existingMeta, rowMeta, patchMeta, {
      color: nextColor,
      iconColor: nextColor,
      updatedAt: updatedAt,
      materializedUserFolder: true,
      trustedFolderDisplay: true,
      shownInNormalMode: true,
      source: cleanString(row.source || rowMeta.source || existing.source || existingMeta.source || 'desktop-sqlite'),
    });
    var out = Object.assign({}, existing, {
      id: folderId,
      folderId: folderId,
      name: name,
      title: name,
      source: cleanString(row.source || rowMeta.source || existing.source || existingMeta.source || 'desktop-sqlite'),
      stateSource: 'stored-folder-state',
      color: nextColor,
      iconColor: nextColor,
      updatedAt: updatedAt,
      meta: meta,
      userCreated: row.userCreated === true || rowMeta.userCreated === true || existing.userCreated === true || existingMeta.userCreated === true,
      materializedUserFolder: true,
      trustedFolderDisplay: true,
      shownInNormalMode: true,
    });
    var parentId = cleanString(row.parentId || rowMeta.parentId || existing.parentId || existingMeta.parentId || '');
    var kind = cleanString(row.sourceKind || row.kind || rowMeta.sourceKind || rowMeta.kind || existing.sourceKind || existing.kind || existingMeta.sourceKind || existingMeta.kind || 'desktop-sqlite');
    var icon = cleanString(row.icon || rowMeta.icon || rowMeta.iconKey || existing.icon || existingMeta.icon || existingMeta.iconKey || '');
    if (parentId) out.parentId = parentId;
    if (kind) {
      out.kind = kind;
      out.sourceKind = kind;
    }
    if (icon) out.icon = icon;
    if (Object.prototype.hasOwnProperty.call(row, 'sortOrder')) out.sortOrder = row.sortOrder;
    else if (Object.prototype.hasOwnProperty.call(existing, 'sortOrder')) out.sortOrder = existing.sortOrder;
    if (Object.prototype.hasOwnProperty.call(row, 'createdAt')) out.createdAt = row.createdAt;
    else if (Object.prototype.hasOwnProperty.call(existing, 'createdAt')) out.createdAt = existing.createdAt;
    return out;
  }

  async function reconcileFolderStateMirrorColor(folderIdInput, row, patch) {
    var folderId = cleanString(folderIdInput);
    var result = {
      ok: false,
      status: 'not-run',
      key: FOLDER_STATE_DATA_KEY,
      folderId: folderId,
      color: folderRowColor(row),
      at: Date.now(),
    };
    if (!folderId) {
      result.status = 'folder-id-required';
      state.lastFolderStateMirrorReconcile = result;
      return result;
    }
    try {
      var raw = await chromeStorageGet(FOLDER_STATE_DATA_KEY);
      var current = safeObject(raw);
      var folders = Array.isArray(current.folders) ? current.folders.slice() : [];
      var items = safeObject(current.items);
      var index = -1;
      for (var i = 0; i < folders.length; i += 1) {
        if (folderRowId(folders[i]) === folderId) {
          index = i;
          break;
        }
      }
      var updatedAt = nowIso();
      var existing = index >= 0 ? folders[index] : null;
      var nextRow = projectFolderStateMirrorRow(row, existing, patch, updatedAt);
      if (!nextRow) {
        result.status = 'row-project-failed';
        state.lastFolderStateMirrorReconcile = result;
        return result;
      }
      if (index >= 0) folders[index] = nextRow;
      else folders.push(nextRow);
      if (!Array.isArray(items[folderId])) items[folderId] = [];
      var nextState = Object.assign({}, current, {
        schemaVersion: Number(current.schemaVersion || current.version || 1) || 1,
        source: cleanString(current.source || current.exportedFrom || 'stored-folder-state') || 'stored-folder-state',
        updatedAt: updatedAt,
        folders: folders,
        items: items,
      });
      await chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState });
      result.ok = true;
      result.status = index >= 0 ? 'updated' : 'inserted';
      result.color = cleanString(nextRow.iconColor || nextRow.color || '');
      result.folderCount = folders.length;
      state.lastFolderStateMirrorReconcile = result;
      return result;
    } catch (e) {
      result.status = 'error';
      result.error = String((e && e.message) || e);
      state.lastFolderStateMirrorReconcile = result;
      pushError('reconcileFolderStateMirrorColor', e);
      return result;
    }
  }

  function baseResult(action, status, extra) {
    return Object.assign({
      ok: false,
      action: cleanString(action),
      status: cleanString(status),
      surface: 'studio',
      phase: PHASE,
    }, extra || {});
  }

  /* ── create({name, parentId, color, iconColor, source, meta}) ────── */
  /* Folders have both `color` AND `iconColor` columns (iconColor is the
   * display color for the sidebar icon; color is a legacy alias). The
   * store accepts both; we pass whichever the caller supplied. */
  async function create(input) {
    var opts = (input && typeof input === 'object') ? input : {};
    var name = cleanString(opts.name);
    if (!name) {
      recordWrite('create', false);
      return baseResult('create', 'name-required', { reason: 'name is required' });
    }
    var store = getStore();
    if (!store || typeof store.create !== 'function') {
      recordWrite('create', false);
      return baseResult('create', 'store-unavailable', {
        reason: 'H2O.Studio.store.folders.create unavailable',
      });
    }
    try {
      var source = cleanString(opts.source) || 'desktop-user-folder-create';
      var sourceKind = cleanString(opts.sourceKind) || source;
      var meta = Object.assign({}, safeMeta(opts.meta), {
        source: source,
        sourceKind: sourceKind,
        userCreated: true,
        materializedUserFolder: true,
        trustedFolderDisplay: true,
        shownInNormalMode: true,
        createdBy: 'desktop-studio',
        updatedAt: nowIso(),
      });
      var payload = {
        name: name,
        parentId: cleanString(opts.parentId),
        source: source,
        sourceKind: sourceKind,
        userCreated: true,
        materializedUserFolder: true,
        trustedFolderDisplay: true,
        shownInNormalMode: true,
        meta: meta,
      };
      var color = cleanString(opts.color);
      var iconColor = cleanString(opts.iconColor) || color;
      if (color)     payload.color = color;
      if (iconColor) payload.iconColor = iconColor;
      var row = await store.create(payload);
      recordWrite('create', true);
      dispatchRefresh('create');
      scheduleDesktopLatestExport('create', row && row.folderId);
      return baseResult('create', 'ok', {
        ok: true,
        folderId: row && row.folderId,
        name: row && row.name,
        color: row && (row.color || row.iconColor) || '',
        row: row,
      });
    } catch (e) {
      pushError('create', e);
      recordWrite('create', false);
      return baseResult('create', 'error', {
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── rename(folderId, newName) ───────────────────────────────────── */
  async function rename(folderIdInput, newNameInput) {
    var folderId = cleanString(folderIdInput);
    var newName  = cleanString(newNameInput);
    if (!folderId) {
      recordWrite('rename', false);
      return baseResult('rename', 'folder-id-required', { reason: 'folderId is required' });
    }
    if (!newName) {
      recordWrite('rename', false);
      return baseResult('rename', 'name-required', { folderId: folderId, reason: 'newName is required' });
    }
    var store = getStore();
    if (!store || typeof store.patch !== 'function') {
      recordWrite('rename', false);
      return baseResult('rename', 'store-unavailable', { folderId: folderId });
    }
    try {
      var existing = await store.get(folderId);
      if (!existing) {
        recordWrite('rename', false);
        return baseResult('rename', 'not-found', { folderId: folderId });
      }
      var renamedAt = nowIso();
      var row = await store.patch(folderId, {
        name: newName,
        meta: Object.assign({}, safeMeta(existing.meta), {
          name: newName,
          updatedAt: renamedAt,
          source: cleanString(existing.source || safeMeta(existing.meta).source || 'desktop-sqlite'),
          sourceKind: cleanString(existing.sourceKind || existing.kind || safeMeta(existing.meta).sourceKind || safeMeta(existing.meta).kind || 'desktop-sqlite'),
        }),
      });
      recordWrite('rename', true);
      dispatchRefresh('rename');
      scheduleDesktopLatestExport('rename', folderId);
      return baseResult('rename', 'ok', {
        ok: true,
        folderId: folderId,
        name: (row && row.name) || newName,
        row: row,
      });
    } catch (e) {
      pushError('rename', e);
      recordWrite('rename', false);
      return baseResult('rename', 'error', { folderId: folderId, reason: String((e && e.message) || e) });
    }
  }

  /* ── update(folderId, patch) — name/parentId/color/iconColor/meta ── */
  async function update(folderIdInput, patchInput) {
    var folderId = cleanString(folderIdInput);
    if (!folderId) {
      recordWrite('update', false);
      return baseResult('update', 'folder-id-required', { reason: 'folderId is required' });
    }
    var patch = (patchInput && typeof patchInput === 'object' && !Array.isArray(patchInput)) ? patchInput : null;
    if (!patch) {
      recordWrite('update', false);
      return baseResult('update', 'patch-required', { folderId: folderId, reason: 'patch object is required' });
    }
    /* Pre-filter to known fields. */
    var allowed = {};
    var touched = 0;
    if (typeof patch.name === 'string')      { allowed.name      = cleanString(patch.name); touched += 1; }
    if (typeof patch.parentId === 'string')  { allowed.parentId  = cleanString(patch.parentId); touched += 1; }
    if (typeof patch.color === 'string')     { allowed.color     = cleanString(patch.color); touched += 1; }
    if (typeof patch.iconColor === 'string') { allowed.iconColor = cleanString(patch.iconColor); touched += 1; }
    if (patch.meta !== undefined)            { allowed.meta      = safeMeta(patch.meta); touched += 1; }
    if (touched === 0) {
      recordWrite('update', false);
      return baseResult('update', 'no-supported-fields', {
        folderId: folderId,
        reason: 'patch must include at least one of {name, parentId, color, iconColor, meta}',
      });
    }
    if ('name' in allowed && !allowed.name) {
      recordWrite('update', false);
      return baseResult('update', 'name-required', { folderId: folderId, reason: 'name cannot be empty' });
    }
    var store = getStore();
    if (!store || typeof store.patch !== 'function') {
      recordWrite('update', false);
      return baseResult('update', 'store-unavailable', { folderId: folderId });
    }
    try {
      var existing = await store.get(folderId);
      if (!existing) {
        recordWrite('update', false);
        return baseResult('update', 'not-found', { folderId: folderId });
      }
      var hasColorPatch = Object.prototype.hasOwnProperty.call(allowed, 'color')
        || Object.prototype.hasOwnProperty.call(allowed, 'iconColor');
      if (hasColorPatch) {
        var updateAt = nowIso();
        var nextPatchColor = Object.prototype.hasOwnProperty.call(allowed, 'iconColor')
          ? cleanString(allowed.iconColor)
          : cleanString(allowed.color);
        allowed.meta = Object.assign({}, safeMeta(existing.meta), safeMeta(allowed.meta), {
          color: nextPatchColor,
          iconColor: nextPatchColor,
          updatedAt: updateAt,
        });
      }
      var row = await store.patch(folderId, allowed);
      var mirrorReconcile = hasColorPatch
        ? await reconcileFolderStateMirrorColor(folderId, row || Object.assign({}, existing, allowed), allowed)
        : null;
      recordWrite('update', true);
      dispatchRefresh('update');
      scheduleDesktopLatestExport('update', folderId);
      return baseResult('update', 'ok', {
        ok: true,
        folderId: folderId,
        row: row,
        appliedFields: Object.keys(allowed),
        folderStateMirror: mirrorReconcile,
      });
    } catch (e) {
      pushError('update', e);
      recordWrite('update', false);
      return baseResult('update', 'error', { folderId: folderId, reason: String((e && e.message) || e) });
    }
  }

  /* ── remove(folderId) ────────────────────────────────────────────── */
  /* Phase 4A/4B: action-level delete is Desktop-local soft
   * tombstone only. It does not call store.folders.remove(), does not
   * delete folder rows, does not delete chats, and does not schedule
   * Desktop→Chrome tombstone/delete propagation. */
  async function remove(folderIdInput) {
    var folderId = cleanString(folderIdInput);
    if (!folderId) {
      recordWrite('remove', false);
      return baseResult('remove', 'folder-id-required', { reason: 'folderId is required' });
    }
    var store = getStore();
    if (!store || typeof store.softDeleteEmptyFolder !== 'function') {
      recordWrite('remove', false);
      return baseResult('remove', 'store-unavailable', { folderId: folderId });
    }
    try {
      var result = await store.softDeleteEmptyFolder(folderId, {
        deleteReason: 'desktop-action-folder-soft-delete',
      });
      var ok = !!(result && result.ok);
      recordWrite('remove', ok);
      if (ok) dispatchRefresh('soft-delete');
      return baseResult('remove', ok ? 'ok' : cleanString(result && result.status) || 'not-removed', {
        ok: ok,
        folderId: folderId,
        tombstoneId: result && result.tombstoneId,
        affectedChatCount: Number(result && result.affectedChatCount) || 0,
        bindingUnboundCount: Number(result && result.bindingUnboundCount) || 0,
        bindingUnbindSkippedCount: Number(result && result.bindingUnbindSkippedCount) || 0,
        blockers: Array.isArray(result && result.blockers) ? result.blockers.slice() : [],
        noHardDelete: true,
        noChatDelete: true,
        crossPlatformSync: 'deferred',
        result: result,
      });
    } catch (e) {
      pushError('remove', e);
      recordWrite('remove', false);
      return baseResult('remove', 'error', { folderId: folderId, reason: String((e && e.message) || e) });
    }
  }

  /* ── restore(folderIdOrTombstoneId) ──────────────────────────────── */
  async function restore(folderOrTombstoneInput) {
    var target = cleanString(folderOrTombstoneInput && (folderOrTombstoneInput.tombstoneId || folderOrTombstoneInput.folderId || folderOrTombstoneInput.id || folderOrTombstoneInput));
    if (!target) {
      recordWrite('restore', false);
      return baseResult('restore', 'folder-id-required', { reason: 'folderId or tombstoneId is required' });
    }
    var store = getStore();
    if (!store || typeof store.restoreTombstonedFolder !== 'function') {
      recordWrite('restore', false);
      return baseResult('restore', 'store-unavailable', { target: target });
    }
    try {
      var result = await store.restoreTombstonedFolder(target);
      var ok = !!(result && result.ok);
      recordWrite('restore', ok);
      if (ok) dispatchRefresh('restore');
      return baseResult('restore', ok ? 'ok' : cleanString(result && result.status) || 'not-restored', {
        ok: ok,
        target: target,
        folderId: result && result.folderId,
        tombstoneId: result && result.tombstoneId,
        bindingRestoreAttemptedCount: Number(result && result.bindingRestoreAttemptedCount) || 0,
        bindingRestoredCount: Number(result && result.bindingRestoredCount) || 0,
        bindingSkippedCount: Number(result && result.bindingSkippedCount) || 0,
        restoreWarnings: Array.isArray(result && result.restoreWarnings) ? result.restoreWarnings.slice() : [],
        blockers: Array.isArray(result && result.blockers) ? result.blockers.slice() : [],
        noHardDelete: true,
        noChatDelete: true,
        crossPlatformSync: 'deferred',
        result: result,
      });
    } catch (e) {
      pushError('restore', e);
      recordWrite('restore', false);
      return baseResult('restore', 'error', { target: target, reason: String((e && e.message) || e) });
    }
  }

  /* ── bindChat(chatId, folderId) ──────────────────────────────────── */
  /* INSERT OR REPLACE — if the chat is already bound to a DIFFERENT
   * folder, that row is atomically replaced. The action layer reports
   * the previous folderId (if any) so callers can describe the move
   * accurately. Verifies the target folder exists before writing. */
  async function bindChat(chatIdInput, folderIdInput) {
    var chatId   = cleanString(chatIdInput);
    var folderId = cleanString(folderIdInput);
    if (!chatId) {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    if (!folderId) {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'folder-id-required', { chatId: chatId, reason: 'folderId is required (use unbindChat to clear)' });
    }
    var store = getStore();
    if (!store || typeof store.bindChat !== 'function') {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'store-unavailable', { chatId: chatId, folderId: folderId });
    }
    try {
      var existingFolder = await store.get(folderId);
      if (!existingFolder) {
        recordWrite('bindChat', false);
        return baseResult('bindChat', 'folder-not-found', {
          chatId: chatId, folderId: folderId,
        });
      }
      /* Capture the previous folder (if any) before INSERT OR REPLACE
       * blows it away — informational only; never an error. */
      var previousFolderId = '';
      try {
        var prior = (typeof store.listForChat === 'function') ? await store.listForChat(chatId) : [];
        var firstPrior = Array.isArray(prior) && prior.length > 0 ? prior[0] : null;
        previousFolderId = (firstPrior && firstPrior.folderId) || '';
      } catch (_) { /* best-effort */ }
      var ok = await store.bindChat(folderId, chatId, { assignedAt: Date.now() });
      recordWrite('bindChat', !!ok);
      if (ok) dispatchRefresh('bindChat');
      return baseResult('bindChat', ok ? 'ok' : 'error', {
        ok: !!ok,
        chatId: chatId,
        folderId: folderId,
        previousFolderId: previousFolderId,
        replaced: !!(previousFolderId && previousFolderId !== folderId),
      });
    } catch (e) {
      pushError('bindChat', e);
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'error', {
        chatId: chatId, folderId: folderId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── unbindChat(chatId) ──────────────────────────────────────────── */
  /* V1's folder_bindings PRIMARY KEY (chat_id) guarantees at most one
   * row per chat. We list defensively in case the schema relaxes that.
   * Returns wasBound=false if the chat had no folder; not an error. */
  async function unbindChat(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) {
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    var store = getStore();
    if (!store
        || typeof store.unbindChat !== 'function'
        || typeof store.listForChat !== 'function') {
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'store-unavailable', { chatId: chatId });
    }
    try {
      var bound = await store.listForChat(chatId);
      var rows = Array.isArray(bound) ? bound : [];
      if (rows.length === 0) {
        recordWrite('unbindChat', true);
        /* No state changed → don't fire refresh. */
        return baseResult('unbindChat', 'ok', {
          ok: true,
          chatId: chatId,
          previousFolderId: '',
          wasBound: false,
        });
      }
      var previousFolderId = '';
      for (var i = 0; i < rows.length; i += 1) {
        var fid = rows[i] && rows[i].folderId;
        if (!fid) continue;
        if (!previousFolderId) previousFolderId = fid;
        try { await store.unbindChat(fid, chatId); }
        catch (e) { pushError('unbindChat.row', e); }
      }
      recordWrite('unbindChat', true);
      dispatchRefresh('unbindChat');
      return baseResult('unbindChat', 'ok', {
        ok: true,
        chatId: chatId,
        previousFolderId: previousFolderId,
        wasBound: true,
      });
    } catch (e) {
      pushError('unbindChat', e);
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'error', {
        chatId: chatId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── getForChat(chatId) — read helper ────────────────────────────── */
  /* Returns the single folder row for the chat, or null if unbound.
   * Folder cardinality is 1 per chat in V1, so we return the first
   * (and typically only) row from listForChat. */
  async function getForChat(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) {
      return baseResult('getForChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    var store = getStore();
    if (!store || typeof store.listForChat !== 'function') {
      return baseResult('getForChat', 'store-unavailable', { chatId: chatId });
    }
    try {
      var rows = await store.listForChat(chatId);
      var first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
      return baseResult('getForChat', 'ok', {
        ok: true,
        chatId: chatId,
        folder: first || null,
        folderId: first ? (first.folderId || '') : '',
      });
    } catch (e) {
      pushError('getForChat', e);
      return baseResult('getForChat', 'error', {
        chatId: chatId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── listChats(folderId) — read helper ───────────────────────────── */
  async function listChats(folderIdInput) {
    var folderId = cleanString(folderIdInput);
    if (!folderId) {
      return baseResult('listChats', 'folder-id-required', { reason: 'folderId is required' });
    }
    var store = getStore();
    if (!store || typeof store.listChats !== 'function') {
      return baseResult('listChats', 'store-unavailable', { folderId: folderId });
    }
    try {
      var rows = await store.listChats(folderId);
      return baseResult('listChats', 'ok', {
        ok: true,
        folderId: folderId,
        chats: Array.isArray(rows) ? rows.slice() : [],
        count: Array.isArray(rows) ? rows.length : 0,
      });
    } catch (e) {
      pushError('listChats', e);
      return baseResult('listChats', 'error', {
        folderId: folderId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── Diagnostics ─────────────────────────────────────────────────── */
  function diagnose() {
    return {
      installed: true,
      phase: PHASE,
      installedAt: state.installedAt,
      installedAtIso: (function () { try { return new Date(state.installedAt).toISOString(); } catch (_) { return ''; } })(),
      writesSinceBoot: state.writesSinceBoot,
      lastWriteAt: state.lastWriteAt,
      lastWriteAction: state.lastWriteAction,
      lastWriteOk: state.lastWriteOk,
      lastAutoExportSchedule: state.lastAutoExportSchedule,
      lastFolderStateMirrorReconcile: state.lastFolderStateMirrorReconcile,
      storeAvailable: !!getStore(),
      refreshEvent: REFRESH_EVENT,
      cardinality: 'single-folder-per-chat',
      errors: state.errors.slice(),
    };
  }

  /* ── Public API ──────────────────────────────────────────────────── */
  H2O.Studio.actions.folders = {
    __installed: true,
    __version: '0.1.0',
    create:     create,
    rename:     rename,
    update:     update,
    remove:     remove,
    'delete':   remove,   /* alias */
    restore:    restore,
    restoreTombstonedFolder: restore,
    bindChat:   bindChat,
    unbindChat: unbindChat,
    getForChat: getForChat,
    listChats:  listChats,
    diagnose:   diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
