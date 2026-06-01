/* H2O Studio — Categories Actions (R4.1 — Desktop-first ownership)
 *
 * Studio-side WRITE API for the categories catalog. The Studio Library
 * UI calls these methods to mutate state directly in the Desktop SQLite
 * `categories` table (via H2O.Studio.store.categories), establishing
 * Desktop as the canonical writer for category state per the R4 plan.
 *
 * Public API: H2O.Studio.actions.categories = {
 *   create({name, parentId, source, meta}),
 *   rename(categoryId, newName),
 *   remove(categoryId),            // also exposed as `delete`
 *   assignChat(chatId, categoryId),
 *   clearChat(chatId),
 *   diagnose(),
 * }
 *
 * Each mutation:
 *   1. Validates inputs (cleanString, non-empty checks).
 *   2. Calls the appropriate H2O.Studio.store.categories.* method, which
 *      writes synchronously to SQLite via plugin:sql.
 *   3. On success, dispatches the canonical refresh event
 *      `evt:h2o:library-index:refresh-request` so H2O.LibraryIndex
 *      re-reads from SQLite (the handler at S0F1c:741 routes to
 *      runRefresh → refreshFromStores). No new event name; reusing the
 *      existing single-flight refresh contract from R3.
 *   4. Returns a normalized result object {ok, action, status, ...}.
 *
 * Tauri-gated at load. On MV3/web this file is a silent no-op and does
 * not register anything; H2O.Studio.actions.categories stays undefined,
 * which is the contract S0F1j checks before routing on the Desktop
 * branch (otherwise it falls through to the existing
 * `native-context-required` path).
 *
 * Safety invariants (R4.1 scope):
 *   - no schema change
 *   - no SQLite migration
 *   - no Native ChatGPT change
 *   - no labels / tags / folders work
 *   - read facade S0F4a (H2O.Categories) is unchanged
 *   - this module is purely additive on a sibling namespace
 *
 * Notes on store API mapping (verified against store/categories.tauri.js):
 *   - create({name, parentId, source, meta}): store auto-generates a
 *     fresh categoryId (cat_<uuid>); the row is returned with that ID.
 *   - rename: implemented via store.patch(id, {name}) which is the
 *     idiomatic update path on the entity store.
 *   - remove: store.remove already bulk-clears `chats.category_id` for
 *     every chat in this category BEFORE deleting the row, so callers
 *     don't need a separate clear-chats step.
 *   - assignChat: store.assignChat(categoryId, chatId) signature is
 *     (categoryId, chatId); we expose (chatId, categoryId) to match the
 *     "chat is the subject" convention of clearChat(chatId).
 *
 * Contract: src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md
 *           docs/architecture/library-migration-plan.md (Phase 4)
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
  if (H2O.Studio.actions.categories && H2O.Studio.actions.categories.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var PHASE          = 'R4.1-categories';
  var MAX_ERRORS     = 20;
  /* Reuses the existing single-flight refresh contract documented at
   * S0F1c.js:741 — runRefresh debounces internally so repeated dispatches
   * coalesce into one refresh. New API code should NEVER invent a new
   * event name for this; we reuse the canonical one. */
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

  /* Dispatch a refresh request so LibraryIndex re-reads from SQLite.
   * The handler at S0F1c:741 listens for this event name and routes
   * to runRefresh (single-flight; debounces internally). Wrapped in
   * try/catch because the test sandbox sometimes lacks CustomEvent. */
  function dispatchRefresh(reason) {
    try {
      if (typeof global.dispatchEvent === 'function'
          && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(REFRESH_EVENT, {
          detail: { reason: 'categories-actions:' + cleanString(reason) },
        }));
      }
    } catch (e) { pushError('dispatchRefresh', e); }
  }

  function getStore() {
    try {
      return (H2O.Studio && H2O.Studio.store && H2O.Studio.store.categories) || null;
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

  /* ── create({name, parentId, source, meta}) ──────────────────────── */
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
        reason: 'H2O.Studio.store.categories.create unavailable',
      });
    }
    try {
      var row = await store.create({
        name: name,
        parentId: cleanString(opts.parentId),
        source: cleanString(opts.source) || 'studio-actions',
        meta: safeMeta(opts.meta),
      });
      recordWrite('create', true);
      dispatchRefresh('create');
      return baseResult('create', 'ok', {
        ok: true,
        categoryId: row && row.categoryId,
        name: row && row.name,
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

  /* ── rename(categoryId, newName) ──────────────────────────────────── */
  async function rename(categoryIdInput, newNameInput) {
    var categoryId = cleanString(categoryIdInput);
    var newName    = cleanString(newNameInput);
    if (!categoryId) {
      recordWrite('rename', false);
      return baseResult('rename', 'category-id-required', { reason: 'categoryId is required' });
    }
    if (!newName) {
      recordWrite('rename', false);
      return baseResult('rename', 'name-required', { categoryId: categoryId, reason: 'newName is required' });
    }
    var store = getStore();
    if (!store || typeof store.patch !== 'function') {
      recordWrite('rename', false);
      return baseResult('rename', 'store-unavailable', { categoryId: categoryId });
    }
    try {
      var existing = await store.get(categoryId);
      if (!existing) {
        recordWrite('rename', false);
        return baseResult('rename', 'not-found', { categoryId: categoryId });
      }
      var row = await store.patch(categoryId, { name: newName });
      recordWrite('rename', true);
      dispatchRefresh('rename');
      return baseResult('rename', 'ok', {
        ok: true,
        categoryId: categoryId,
        name: (row && row.name) || newName,
        row: row,
      });
    } catch (e) {
      pushError('rename', e);
      recordWrite('rename', false);
      return baseResult('rename', 'error', { categoryId: categoryId, reason: String((e && e.message) || e) });
    }
  }

  /* ── remove(categoryId) ───────────────────────────────────────────── */
  /* store.categories.remove already bulk-clears chats.category_id for
   * all chats currently in this category BEFORE deleting the row, so we
   * simply delegate; no separate clear-chats orchestration is needed. */
  async function remove(categoryIdInput) {
    var categoryId = cleanString(categoryIdInput);
    if (!categoryId) {
      recordWrite('remove', false);
      return baseResult('remove', 'category-id-required', { reason: 'categoryId is required' });
    }
    var store = getStore();
    if (!store || typeof store.remove !== 'function') {
      recordWrite('remove', false);
      return baseResult('remove', 'store-unavailable', { categoryId: categoryId });
    }
    try {
      var existing = await store.get(categoryId);
      if (!existing) {
        recordWrite('remove', false);
        return baseResult('remove', 'not-found', { categoryId: categoryId });
      }
      var ok = await store.remove(categoryId);
      recordWrite('remove', !!ok);
      if (ok) dispatchRefresh('remove');
      return baseResult('remove', ok ? 'ok' : 'not-removed', {
        ok: !!ok,
        categoryId: categoryId,
      });
    } catch (e) {
      pushError('remove', e);
      recordWrite('remove', false);
      return baseResult('remove', 'error', { categoryId: categoryId, reason: String((e && e.message) || e) });
    }
  }

  /* ── assignChat(chatId, categoryId) ───────────────────────────────── */
  /* Public signature is (chatId, categoryId); the underlying store
   * method takes (categoryId, chatId). We verify the category exists
   * before writing so we never create a dangling FK in chats.category_id.
   * The chat row need not exist beforehand — but if it doesn't, store
   * returns ok=false (UPDATE matches zero rows) and we report
   * 'chat-not-found' to the caller. */
  async function assignChat(chatIdInput, categoryIdInput) {
    var chatId     = cleanString(chatIdInput);
    var categoryId = cleanString(categoryIdInput);
    if (!chatId) {
      recordWrite('assignChat', false);
      return baseResult('assignChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    if (!categoryId) {
      recordWrite('assignChat', false);
      return baseResult('assignChat', 'category-id-required', {
        chatId: chatId,
        reason: 'categoryId is required (use clearChat to unassign)',
      });
    }
    var store = getStore();
    if (!store || typeof store.assignChat !== 'function') {
      recordWrite('assignChat', false);
      return baseResult('assignChat', 'store-unavailable', { chatId: chatId, categoryId: categoryId });
    }
    try {
      var existingCat = await store.get(categoryId);
      if (!existingCat) {
        recordWrite('assignChat', false);
        return baseResult('assignChat', 'category-not-found', {
          chatId: chatId, categoryId: categoryId,
        });
      }
      var ok = await store.assignChat(categoryId, chatId);
      recordWrite('assignChat', !!ok);
      if (ok) dispatchRefresh('assignChat');
      return baseResult('assignChat', ok ? 'ok' : 'chat-not-found', {
        ok: !!ok,
        chatId: chatId,
        categoryId: categoryId,
      });
    } catch (e) {
      pushError('assignChat', e);
      recordWrite('assignChat', false);
      return baseResult('assignChat', 'error', {
        chatId: chatId, categoryId: categoryId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── clearChat(chatId) ────────────────────────────────────────────── */
  /* store.clearChat returns true when a row was actually updated (chat
   * existed AND had a category assigned). false means "nothing to do" —
   * either the chat doesn't exist or had no category. Both are non-
   * error outcomes; we report ok=true with wasAssigned reflecting which
   * branch ran. */
  async function clearChat(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) {
      recordWrite('clearChat', false);
      return baseResult('clearChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    var store = getStore();
    if (!store || typeof store.clearChat !== 'function') {
      recordWrite('clearChat', false);
      return baseResult('clearChat', 'store-unavailable', { chatId: chatId });
    }
    try {
      var wasAssigned = await store.clearChat(chatId);
      recordWrite('clearChat', true);
      if (wasAssigned) dispatchRefresh('clearChat');
      return baseResult('clearChat', 'ok', {
        ok: true,
        chatId: chatId,
        wasAssigned: !!wasAssigned,
      });
    } catch (e) {
      pushError('clearChat', e);
      recordWrite('clearChat', false);
      return baseResult('clearChat', 'error', {
        chatId: chatId, reason: String((e && e.message) || e),
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
      errors: state.errors.slice(),
    };
  }

  /* ── Public API ──────────────────────────────────────────────────── */
  H2O.Studio.actions.categories = {
    __installed: true,
    __version: '0.1.0',
    create:     create,
    rename:     rename,
    remove:     remove,
    'delete':   remove,   /* alias */
    assignChat: assignChat,
    clearChat:  clearChat,
    diagnose:   diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
