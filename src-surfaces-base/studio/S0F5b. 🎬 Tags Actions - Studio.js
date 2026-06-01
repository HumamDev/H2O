/* H2O Studio — Tags Actions (R4.3 — Desktop-first ownership)
 *
 * Studio-side WRITE API for the tags catalog AND its many-to-many
 * chat bindings. Establishes Desktop as the canonical writer for tag
 * CATALOG state per the R4 plan; companion of S0F4b (Categories) and
 * S0F6b (Labels Actions).
 *
 * ── EXPLICIT BOUNDARY ─────────────────────────────────────────────────
 * Turn-level tag EXTRACTION stays Native (0F5a). That code reads
 * chatgpt.com turn DOM to derive keyword candidates and is, per
 * docs/architecture/library-migration-plan.md and
 * STUDIO_CAPTURE_BOUNDARY.md, "Native-only (forever)".
 *
 * This module deliberately:
 *   - does NOT touch DOM
 *   - does NOT read or observe chatgpt.com page state
 *   - does NOT auto-derive tags from turn text
 *   - does NOT call into 0F5a's extraction pipeline
 *   - manages CATALOG (create / rename / update / remove) and
 *     BINDINGS (bindChat / unbindChat / replaceForChat / listForChat)
 *     for tag IDs the caller has already chosen — typically because
 *     the user clicked a tag pill in Studio UI, or because Native
 *     0F5a previously derived the tag and propagated it via R3 mirror.
 *
 * Public API: H2O.Studio.actions.tags = {
 *   create({name, autoDerived, source, meta}),
 *   rename(tagId, newName),
 *   update(tagId, patch),         // name / autoDerived / meta passthrough
 *   remove(tagId),                // also exposed as `delete`
 *   bindChat(chatId, tagId),
 *   unbindChat(chatId, tagId),
 *   replaceForChat(chatId, tagIds),
 *   listForChat(chatId),
 *   diagnose(),
 * }
 *
 * Each mutation:
 *   1. Validates inputs (cleanString, non-empty checks, array shape).
 *   2. Calls the appropriate H2O.Studio.store.tags.* method, which
 *      writes synchronously to SQLite via plugin:sql.
 *   3. On success, dispatches the canonical refresh event
 *      `evt:h2o:library-index:refresh-request` so H2O.LibraryIndex
 *      re-reads from SQLite (same contract S0F4b / S0F6b use).
 *   4. Returns a normalized result object {ok, action, status, ...}.
 *
 * Tauri-gated at load. On MV3/web this file is a silent no-op and does
 * not register anything; H2O.Studio.actions.tags stays undefined,
 * which is the contract S0F1j checks before routing on the Desktop
 * branch (otherwise it falls through to the existing
 * `native-context-required` path).
 *
 * Differences from S0F6b (Labels):
 *   - Tags carry `autoDerived` (boolean: was this tag created by
 *     Native's turn-level extraction, or by an explicit user action?).
 *     Categories had no analog; Labels had `color` (string). The
 *     `update` patch accepts `autoDerived` as a tri-state replacement.
 *   - Tags table has NO `updated_at` column (per Migration v3 in
 *     src-tauri/src/lib.rs). The underlying store.tags.patch path is
 *     already aware and doesn't stamp it; we don't need a workaround
 *     here.
 *   - Everything else (composite-PK bindings via `tag_bindings`,
 *     INSERT-OR-IGNORE idempotency on bindChat, DELETE+INSERT
 *     replaceForChat, cascade-delete on remove) is identical to
 *     labels.
 *
 * Safety invariants (R4.3 scope):
 *   - no schema change
 *   - no SQLite migration
 *   - no Native ChatGPT change
 *   - no DOM / no MutationObserver / no chatgpt.com page-state read
 *   - no tag auto-extraction logic — 0F5a continues to own that
 *   - read facade S0F5a (H2O.Tags) is unchanged
 *   - this module is purely additive on a sibling namespace
 *
 * Notes on store API mapping (verified against store/tags.tauri.js):
 *   - create: store.create auto-generates a fresh tagId (tag_<uuid>)
 *     and returns the row.
 *   - update / rename: store.patch(id, partial) routes through
 *     upsertCore which respects partial-update semantics for tags
 *     (no updated_at stamping; bool columns INTEGER 0/1).
 *   - remove: store.remove deletes from `tag_bindings` first, then
 *     deletes the tags row. No separate clear step is needed.
 *   - bindChat signature: store.bindChat(tagId, chatId, opts) —
 *     our public API uses (chatId, tagId) to match the "chat is the
 *     subject" convention used by Labels/Categories actions.
 *   - replaceForChat signature: store.replaceForChat(chatId, tagIds,
 *     opts) — already chat-first, matches our public API; the store
 *     also dedupes internally via Set+seen tracking.
 *
 * Contract: src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md
 *           docs/architecture/library-migration-plan.md (Phase 5;
 *           turn-level extraction explicitly stays Native)
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
  if (H2O.Studio.actions.tags && H2O.Studio.actions.tags.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var PHASE          = 'R4.3-tags';
  var MAX_ERRORS     = 20;
  /* Reuses the same canonical refresh contract as S0F4b / S0F6b. */
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

  function dispatchRefresh(reason) {
    try {
      if (typeof global.dispatchEvent === 'function'
          && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(REFRESH_EVENT, {
          detail: { reason: 'tags-actions:' + cleanString(reason) },
        }));
      }
    } catch (e) { pushError('dispatchRefresh', e); }
  }

  function getStore() {
    try {
      return (H2O.Studio && H2O.Studio.store && H2O.Studio.store.tags) || null;
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

  /* ── create({name, autoDerived, source, meta}) ───────────────────── */
  /* autoDerived defaults to false. The store column is INTEGER 0/1
   * but the JS layer expects/returns a boolean; the entity store
   * handles the conversion in patchToCols (BOOL_COLS map). */
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
        reason: 'H2O.Studio.store.tags.create unavailable',
      });
    }
    try {
      var row = await store.create({
        name: name,
        autoDerived: opts.autoDerived === true,   /* explicit boolean coercion */
        meta: Object.assign(
          { source: cleanString(opts.source) || 'studio-actions' },
          safeMeta(opts.meta)
        ),
      });
      recordWrite('create', true);
      dispatchRefresh('create');
      return baseResult('create', 'ok', {
        ok: true,
        tagId: row && row.tagId,
        name: row && row.name,
        autoDerived: !!(row && row.autoDerived),
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

  /* ── rename(tagId, newName) ──────────────────────────────────────── */
  async function rename(tagIdInput, newNameInput) {
    var tagId   = cleanString(tagIdInput);
    var newName = cleanString(newNameInput);
    if (!tagId) {
      recordWrite('rename', false);
      return baseResult('rename', 'tag-id-required', { reason: 'tagId is required' });
    }
    if (!newName) {
      recordWrite('rename', false);
      return baseResult('rename', 'name-required', { tagId: tagId, reason: 'newName is required' });
    }
    var store = getStore();
    if (!store || typeof store.patch !== 'function') {
      recordWrite('rename', false);
      return baseResult('rename', 'store-unavailable', { tagId: tagId });
    }
    try {
      var existing = await store.get(tagId);
      if (!existing) {
        recordWrite('rename', false);
        return baseResult('rename', 'not-found', { tagId: tagId });
      }
      var row = await store.patch(tagId, { name: newName });
      recordWrite('rename', true);
      dispatchRefresh('rename');
      return baseResult('rename', 'ok', {
        ok: true,
        tagId: tagId,
        name: (row && row.name) || newName,
        row: row,
      });
    } catch (e) {
      pushError('rename', e);
      recordWrite('rename', false);
      return baseResult('rename', 'error', { tagId: tagId, reason: String((e && e.message) || e) });
    }
  }

  /* ── update(tagId, patch) — name / autoDerived / meta supported ─── */
  /* The store.patch path filters unknown fields and routes known
   * columns through upsertCore. autoDerived is boolean (BOOL_COLS map
   * stores INTEGER 0/1). Empty-string name is rejected. autoDerived
   * accepts true/false; undefined leaves the existing value alone. */
  async function update(tagIdInput, patchInput) {
    var tagId = cleanString(tagIdInput);
    if (!tagId) {
      recordWrite('update', false);
      return baseResult('update', 'tag-id-required', { reason: 'tagId is required' });
    }
    var patch = (patchInput && typeof patchInput === 'object' && !Array.isArray(patchInput)) ? patchInput : null;
    if (!patch) {
      recordWrite('update', false);
      return baseResult('update', 'patch-required', { tagId: tagId, reason: 'patch object is required' });
    }
    /* Pre-filter to known fields; never pass through arbitrary keys
     * that could collide with sentinel store fields. */
    var allowed = {};
    var touched = 0;
    if (typeof patch.name === 'string') { allowed.name = cleanString(patch.name); touched += 1; }
    if (typeof patch.autoDerived === 'boolean') { allowed.autoDerived = patch.autoDerived; touched += 1; }
    if (patch.meta !== undefined) { allowed.meta = safeMeta(patch.meta); touched += 1; }
    if (touched === 0) {
      recordWrite('update', false);
      return baseResult('update', 'no-supported-fields', {
        tagId: tagId,
        reason: 'patch must include at least one of {name, autoDerived, meta}',
      });
    }
    if ('name' in allowed && !allowed.name) {
      recordWrite('update', false);
      return baseResult('update', 'name-required', { tagId: tagId, reason: 'name cannot be empty' });
    }
    var store = getStore();
    if (!store || typeof store.patch !== 'function') {
      recordWrite('update', false);
      return baseResult('update', 'store-unavailable', { tagId: tagId });
    }
    try {
      var existing = await store.get(tagId);
      if (!existing) {
        recordWrite('update', false);
        return baseResult('update', 'not-found', { tagId: tagId });
      }
      var row = await store.patch(tagId, allowed);
      recordWrite('update', true);
      dispatchRefresh('update');
      return baseResult('update', 'ok', {
        ok: true,
        tagId: tagId,
        row: row,
        appliedFields: Object.keys(allowed),
      });
    } catch (e) {
      pushError('update', e);
      recordWrite('update', false);
      return baseResult('update', 'error', { tagId: tagId, reason: String((e && e.message) || e) });
    }
  }

  /* ── remove(tagId) ───────────────────────────────────────────────── */
  /* store.tags.remove already DELETEs from tag_bindings before
   * deleting the tags row, so all (chat_id, tag_id) bindings for
   * this tag are cleaned up. We rely on that cascade — no separate
   * orchestration is needed here. */
  async function remove(tagIdInput) {
    var tagId = cleanString(tagIdInput);
    if (!tagId) {
      recordWrite('remove', false);
      return baseResult('remove', 'tag-id-required', { reason: 'tagId is required' });
    }
    var store = getStore();
    if (!store || typeof store.remove !== 'function') {
      recordWrite('remove', false);
      return baseResult('remove', 'store-unavailable', { tagId: tagId });
    }
    try {
      var existing = await store.get(tagId);
      if (!existing) {
        recordWrite('remove', false);
        return baseResult('remove', 'not-found', { tagId: tagId });
      }
      var ok = await store.remove(tagId);
      recordWrite('remove', !!ok);
      if (ok) dispatchRefresh('remove');
      return baseResult('remove', ok ? 'ok' : 'not-removed', {
        ok: !!ok,
        tagId: tagId,
      });
    } catch (e) {
      pushError('remove', e);
      recordWrite('remove', false);
      return baseResult('remove', 'error', { tagId: tagId, reason: String((e && e.message) || e) });
    }
  }

  /* ── bindChat(chatId, tagId) ─────────────────────────────────────── */
  /* Idempotent at the SQL level (INSERT OR IGNORE on composite PK).
   * Re-binding an existing (chat_id, tag_id) pair preserves the
   * original assigned_at — see store.tags.bindChat docstring. We
   * verify the tag exists before writing so we never create a
   * dangling tag_id in tag_bindings. The chat does NOT need to
   * exist in `chats` first (tag_bindings has no FK constraint to
   * chats); orphan chat_ids in tag_bindings are tolerated and will
   * resolve once the chat row arrives via R3 import. */
  async function bindChat(chatIdInput, tagIdInput) {
    var chatId = cleanString(chatIdInput);
    var tagId  = cleanString(tagIdInput);
    if (!chatId) {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    if (!tagId) {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'tag-id-required', { chatId: chatId, reason: 'tagId is required' });
    }
    var store = getStore();
    if (!store || typeof store.bindChat !== 'function') {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'store-unavailable', { chatId: chatId, tagId: tagId });
    }
    try {
      var existingTag = await store.get(tagId);
      if (!existingTag) {
        recordWrite('bindChat', false);
        return baseResult('bindChat', 'tag-not-found', {
          chatId: chatId, tagId: tagId,
        });
      }
      var ok = await store.bindChat(tagId, chatId, {});
      recordWrite('bindChat', !!ok);
      if (ok) dispatchRefresh('bindChat');
      return baseResult('bindChat', ok ? 'ok' : 'error', {
        ok: !!ok,
        chatId: chatId,
        tagId: tagId,
      });
    } catch (e) {
      pushError('bindChat', e);
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'error', {
        chatId: chatId, tagId: tagId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── unbindChat(chatId, tagId) ───────────────────────────────────── */
  /* store.unbindChat returns true iff a row was actually deleted. We
   * dispatch refresh only on actual deletion to keep the event bus
   * quiet for no-op unbinds. */
  async function unbindChat(chatIdInput, tagIdInput) {
    var chatId = cleanString(chatIdInput);
    var tagId  = cleanString(tagIdInput);
    if (!chatId) {
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    if (!tagId) {
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'tag-id-required', { chatId: chatId, reason: 'tagId is required' });
    }
    var store = getStore();
    if (!store || typeof store.unbindChat !== 'function') {
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'store-unavailable', { chatId: chatId, tagId: tagId });
    }
    try {
      var wasBound = await store.unbindChat(tagId, chatId);
      recordWrite('unbindChat', true);
      if (wasBound) dispatchRefresh('unbindChat');
      return baseResult('unbindChat', 'ok', {
        ok: true,
        chatId: chatId,
        tagId: tagId,
        wasBound: !!wasBound,
      });
    } catch (e) {
      pushError('unbindChat', e);
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'error', {
        chatId: chatId, tagId: tagId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── replaceForChat(chatId, tagIds[]) ────────────────────────────── */
  /* Full replacement: drops all existing bindings for the chat, then
   * inserts the new set. Empty array clears all tags. Duplicates in
   * the input array are deduped on both layers (here AND store side). */
  async function replaceForChat(chatIdInput, tagIdsInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) {
      recordWrite('replaceForChat', false);
      return baseResult('replaceForChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    if (!Array.isArray(tagIdsInput)) {
      recordWrite('replaceForChat', false);
      return baseResult('replaceForChat', 'tags-array-required', {
        chatId: chatId,
        reason: 'tagIds must be an array (pass [] to clear)',
      });
    }
    /* Pre-clean each tagId, drop empties, and dedup. The store also
     * dedupes on its side, but deduping here gives us an accurate
     * `count` in the returned result. */
    var tagIds = [];
    var seen = Object.create(null);
    for (var i = 0; i < tagIdsInput.length; i += 1) {
      var v = cleanString(tagIdsInput[i]);
      if (v && !seen[v]) { seen[v] = true; tagIds.push(v); }
    }
    var store = getStore();
    if (!store || typeof store.replaceForChat !== 'function') {
      recordWrite('replaceForChat', false);
      return baseResult('replaceForChat', 'store-unavailable', { chatId: chatId });
    }
    try {
      var ok = await store.replaceForChat(chatId, tagIds, {});
      recordWrite('replaceForChat', !!ok);
      if (ok) dispatchRefresh('replaceForChat');
      return baseResult('replaceForChat', ok ? 'ok' : 'error', {
        ok: !!ok,
        chatId: chatId,
        tagIds: tagIds.slice(),
        count: tagIds.length,
      });
    } catch (e) {
      pushError('replaceForChat', e);
      recordWrite('replaceForChat', false);
      return baseResult('replaceForChat', 'error', {
        chatId: chatId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── listForChat(chatId) — read helper for UI / callers ──────────── */
  async function listForChat(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) {
      return baseResult('listForChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    var store = getStore();
    if (!store || typeof store.listForChat !== 'function') {
      return baseResult('listForChat', 'store-unavailable', { chatId: chatId });
    }
    try {
      var rows = await store.listForChat(chatId);
      return baseResult('listForChat', 'ok', {
        ok: true,
        chatId: chatId,
        tags: Array.isArray(rows) ? rows.slice() : [],
        count: Array.isArray(rows) ? rows.length : 0,
      });
    } catch (e) {
      pushError('listForChat', e);
      return baseResult('listForChat', 'error', {
        chatId: chatId,
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
      /* Explicit boundary marker so validators and runtime callers
       * can confirm this module has no DOM / extraction surface. */
      domAccess: false,
      observesChatGptDom: false,
      tagExtraction: false,
      errors: state.errors.slice(),
    };
  }

  /* ── Public API ──────────────────────────────────────────────────── */
  H2O.Studio.actions.tags = {
    __installed: true,
    __version: '0.1.0',
    create:         create,
    rename:         rename,
    update:         update,
    remove:         remove,
    'delete':       remove,   /* alias */
    bindChat:       bindChat,
    unbindChat:     unbindChat,
    replaceForChat: replaceForChat,
    listForChat:    listForChat,
    diagnose:       diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
