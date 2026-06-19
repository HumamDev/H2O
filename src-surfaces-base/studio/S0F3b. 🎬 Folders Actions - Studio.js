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
 *   remove(folderId),            // also exposed as `delete`
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
 * Tauri-gated at load. On MV3/web this file is a silent no-op and does
 * not register anything; H2O.Studio.actions.folders stays undefined.
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
 *   - remove cascades binding cleanup via store.folders.remove.
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
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.actions = H2O.Studio.actions || {};
  if (H2O.Studio.actions.folders && H2O.Studio.actions.folders.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var PHASE          = 'R4.4-folders';
  var MAX_ERRORS     = 20;
  var REFRESH_EVENT  = 'evt:h2o:library-index:refresh-request';

  /* ── State (in-memory only) ──────────────────────────────────────── */
  var state = {
    installedAt: Date.now(),
    writesSinceBoot: 0,
    lastWriteAt: 0,
    lastWriteAction: '',
    lastWriteOk: null,
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

  function getStore() {
    try {
      return (H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders) || null;
    } catch (_) { return null; }
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
      var meta = Object.assign({}, safeMeta(opts.meta), {
        source: source,
        userCreated: true,
        materializedUserFolder: true,
        trustedFolderDisplay: true,
        createdBy: 'desktop-studio',
        updatedAt: nowIso(),
      });
      var payload = {
        name: name,
        parentId: cleanString(opts.parentId),
        source: source,
        meta: meta,
      };
      var color = cleanString(opts.color);
      var iconColor = cleanString(opts.iconColor) || color;
      if (color)     payload.color = color;
      if (iconColor) payload.iconColor = iconColor;
      var row = await store.create(payload);
      recordWrite('create', true);
      dispatchRefresh('create');
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
      var row = await store.patch(folderId, { name: newName });
      recordWrite('rename', true);
      dispatchRefresh('rename');
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
      var row = await store.patch(folderId, allowed);
      recordWrite('update', true);
      dispatchRefresh('update');
      return baseResult('update', 'ok', {
        ok: true,
        folderId: folderId,
        row: row,
        appliedFields: Object.keys(allowed),
      });
    } catch (e) {
      pushError('update', e);
      recordWrite('update', false);
      return baseResult('update', 'error', { folderId: folderId, reason: String((e && e.message) || e) });
    }
  }

  /* ── remove(folderId) ────────────────────────────────────────────── */
  /* store.folders.remove deletes folder_bindings rows referencing this
   * folder before deleting the folders row. Cascade is handled. */
  async function remove(folderIdInput) {
    var folderId = cleanString(folderIdInput);
    if (!folderId) {
      recordWrite('remove', false);
      return baseResult('remove', 'folder-id-required', { reason: 'folderId is required' });
    }
    var store = getStore();
    if (!store || typeof store.remove !== 'function') {
      recordWrite('remove', false);
      return baseResult('remove', 'store-unavailable', { folderId: folderId });
    }
    try {
      var existing = await store.get(folderId);
      if (!existing) {
        recordWrite('remove', false);
        return baseResult('remove', 'not-found', { folderId: folderId });
      }
      var ok = await store.remove(folderId);
      recordWrite('remove', !!ok);
      if (ok) dispatchRefresh('remove');
      return baseResult('remove', ok ? 'ok' : 'not-removed', {
        ok: !!ok,
        folderId: folderId,
      });
    } catch (e) {
      pushError('remove', e);
      recordWrite('remove', false);
      return baseResult('remove', 'error', { folderId: folderId, reason: String((e && e.message) || e) });
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
    bindChat:   bindChat,
    unbindChat: unbindChat,
    getForChat: getForChat,
    listChats:  listChats,
    diagnose:   diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
