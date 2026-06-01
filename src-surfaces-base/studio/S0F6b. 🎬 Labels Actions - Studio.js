/* H2O Studio — Labels Actions (R4.2 — Desktop-first ownership)
 *
 * Studio-side WRITE API for the labels catalog AND its many-to-many
 * chat bindings. Establishes Desktop as the canonical writer for label
 * state per the R4 plan; companion of S0F4b (Categories Actions).
 *
 * Public API: H2O.Studio.actions.labels = {
 *   create({name, color, source, meta}),
 *   rename(labelId, newName),
 *   update(labelId, patch),       // name / color / meta passthrough
 *   remove(labelId),              // also exposed as `delete`
 *   bindChat(chatId, labelId),
 *   unbindChat(chatId, labelId),
 *   replaceForChat(chatId, labelIds),
 *   listForChat(chatId),
 *   diagnose(),
 * }
 *
 * Each mutation:
 *   1. Validates inputs (cleanString, non-empty checks, array shape).
 *   2. Calls the appropriate H2O.Studio.store.labels.* method, which
 *      writes synchronously to SQLite via plugin:sql.
 *   3. On success, dispatches the canonical refresh event
 *      `evt:h2o:library-index:refresh-request` so H2O.LibraryIndex
 *      re-reads from SQLite (same contract S0F4b uses; same single-
 *      flight debounce in S0F1c).
 *   4. Returns a normalized result object {ok, action, status, ...}.
 *
 * Tauri-gated at load. On MV3/web this file is a silent no-op and does
 * not register anything; H2O.Studio.actions.labels stays undefined,
 * which is the contract S0F1j checks before routing on the Desktop
 * branch (otherwise it falls through to the existing
 * `native-context-required` path).
 *
 * Differences from S0F4b (Categories):
 *   - Labels are many-to-many via `label_bindings` (composite PK
 *     chat_id+label_id). API surface adds bindChat / unbindChat /
 *     replaceForChat / listForChat alongside the catalog CRUD.
 *   - bindChat is IDEMPOTENT — the underlying SQL uses INSERT OR
 *     IGNORE, so re-binding an existing (chat_id, label_id) pair is
 *     a no-op at the SQL level. We still dispatch refresh after every
 *     successful invocation (the store's bindChat returns true on
 *     SQL success regardless of whether a new row was inserted) —
 *     this keeps the contract simple: "every mutation API call that
 *     completes successfully dispatches refresh exactly once."
 *   - replaceForChat does a full-replacement DELETE+INSERT batch in
 *     the store; the input array is deduped on the store side. Empty
 *     array clears all labels for the chat.
 *   - Labels carry a `color` field; `update(id, {name, color, meta})`
 *     supports updating any subset.
 *
 * Safety invariants (R4.2 scope):
 *   - no schema change
 *   - no SQLite migration
 *   - no Native ChatGPT change
 *   - no tags / folders work
 *   - read facade S0F6a (H2O.Labels) is unchanged
 *   - this module is purely additive on a sibling namespace
 *
 * Notes on store API mapping (verified against store/labels.tauri.js):
 *   - create: store.create auto-generates a fresh labelId (lbl_<uuid>)
 *     and returns the row.
 *   - update / rename: store.patch(id, partial) routes through
 *     upsertCore which respects partial-update semantics.
 *   - remove: store.remove deletes from `label_bindings` first (where
 *     label_id = ?), then deletes the labels row. No separate clear
 *     step is needed.
 *   - bindChat signature: store.bindChat(labelId, chatId, opts) —
 *     our public API uses (chatId, labelId) to match the "chat is the
 *     subject" convention.
 *   - replaceForChat signature: store.replaceForChat(chatId, labelIds,
 *     opts) — already chat-first, matches our public API.
 *
 * Contract: src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md
 *           docs/architecture/library-migration-plan.md (Phase 5)
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
  if (H2O.Studio.actions.labels && H2O.Studio.actions.labels.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var PHASE          = 'R4.2-labels';
  var MAX_ERRORS     = 20;
  /* Reuses the same canonical refresh contract S0F4b uses; handler at
   * S0F1c.js:741 debounces internally. */
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
          detail: { reason: 'labels-actions:' + cleanString(reason) },
        }));
      }
    } catch (e) { pushError('dispatchRefresh', e); }
  }

  function getStore() {
    try {
      return (H2O.Studio && H2O.Studio.store && H2O.Studio.store.labels) || null;
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

  /* ── create({name, color, source, meta}) ─────────────────────────── */
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
        reason: 'H2O.Studio.store.labels.create unavailable',
      });
    }
    try {
      var row = await store.create({
        name: name,
        color: cleanString(opts.color),
        source: cleanString(opts.source) || 'studio-actions',
        meta: safeMeta(opts.meta),
      });
      recordWrite('create', true);
      dispatchRefresh('create');
      return baseResult('create', 'ok', {
        ok: true,
        labelId: row && row.labelId,
        name: row && row.name,
        color: row && row.color,
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

  /* ── rename(labelId, newName) ─────────────────────────────────────── */
  async function rename(labelIdInput, newNameInput) {
    var labelId = cleanString(labelIdInput);
    var newName = cleanString(newNameInput);
    if (!labelId) {
      recordWrite('rename', false);
      return baseResult('rename', 'label-id-required', { reason: 'labelId is required' });
    }
    if (!newName) {
      recordWrite('rename', false);
      return baseResult('rename', 'name-required', { labelId: labelId, reason: 'newName is required' });
    }
    var store = getStore();
    if (!store || typeof store.patch !== 'function') {
      recordWrite('rename', false);
      return baseResult('rename', 'store-unavailable', { labelId: labelId });
    }
    try {
      var existing = await store.get(labelId);
      if (!existing) {
        recordWrite('rename', false);
        return baseResult('rename', 'not-found', { labelId: labelId });
      }
      var row = await store.patch(labelId, { name: newName });
      recordWrite('rename', true);
      dispatchRefresh('rename');
      return baseResult('rename', 'ok', {
        ok: true,
        labelId: labelId,
        name: (row && row.name) || newName,
        row: row,
      });
    } catch (e) {
      pushError('rename', e);
      recordWrite('rename', false);
      return baseResult('rename', 'error', { labelId: labelId, reason: String((e && e.message) || e) });
    }
  }

  /* ── update(labelId, patch) — name / color / meta supported ──────── */
  /* The store.patch path filters unknown fields and routes known
   * columns through upsertCore. Color and meta are both supported on
   * the labels table. Empty-string color is treated as "clear color";
   * passing a non-empty string sets it. Meta is merged at the store
   * layer (existing meta keys remain unless overwritten). */
  async function update(labelIdInput, patchInput) {
    var labelId = cleanString(labelIdInput);
    if (!labelId) {
      recordWrite('update', false);
      return baseResult('update', 'label-id-required', { reason: 'labelId is required' });
    }
    var patch = (patchInput && typeof patchInput === 'object' && !Array.isArray(patchInput)) ? patchInput : null;
    if (!patch) {
      recordWrite('update', false);
      return baseResult('update', 'patch-required', { labelId: labelId, reason: 'patch object is required' });
    }
    /* Pre-filter to known fields; never pass through arbitrary keys
     * that could collide with sentinel store fields. */
    var allowed = {};
    var touched = 0;
    if (typeof patch.name === 'string') { allowed.name = cleanString(patch.name); touched += 1; }
    if (typeof patch.color === 'string') { allowed.color = cleanString(patch.color); touched += 1; }
    if (patch.meta !== undefined) { allowed.meta = safeMeta(patch.meta); touched += 1; }
    if (touched === 0) {
      recordWrite('update', false);
      return baseResult('update', 'no-supported-fields', {
        labelId: labelId,
        reason: 'patch must include at least one of {name, color, meta}',
      });
    }
    if ('name' in allowed && !allowed.name) {
      recordWrite('update', false);
      return baseResult('update', 'name-required', { labelId: labelId, reason: 'name cannot be empty' });
    }
    var store = getStore();
    if (!store || typeof store.patch !== 'function') {
      recordWrite('update', false);
      return baseResult('update', 'store-unavailable', { labelId: labelId });
    }
    try {
      var existing = await store.get(labelId);
      if (!existing) {
        recordWrite('update', false);
        return baseResult('update', 'not-found', { labelId: labelId });
      }
      var row = await store.patch(labelId, allowed);
      recordWrite('update', true);
      dispatchRefresh('update');
      return baseResult('update', 'ok', {
        ok: true,
        labelId: labelId,
        row: row,
        appliedFields: Object.keys(allowed),
      });
    } catch (e) {
      pushError('update', e);
      recordWrite('update', false);
      return baseResult('update', 'error', { labelId: labelId, reason: String((e && e.message) || e) });
    }
  }

  /* ── remove(labelId) ──────────────────────────────────────────────── */
  /* store.labels.remove already DELETEs from label_bindings before
   * deleting the labels row, so all (chat_id, label_id) bindings for
   * this label are cleaned up. We rely on that cascade — no separate
   * orchestration is needed here. */
  async function remove(labelIdInput) {
    var labelId = cleanString(labelIdInput);
    if (!labelId) {
      recordWrite('remove', false);
      return baseResult('remove', 'label-id-required', { reason: 'labelId is required' });
    }
    var store = getStore();
    if (!store || typeof store.remove !== 'function') {
      recordWrite('remove', false);
      return baseResult('remove', 'store-unavailable', { labelId: labelId });
    }
    try {
      var existing = await store.get(labelId);
      if (!existing) {
        recordWrite('remove', false);
        return baseResult('remove', 'not-found', { labelId: labelId });
      }
      var ok = await store.remove(labelId);
      recordWrite('remove', !!ok);
      if (ok) dispatchRefresh('remove');
      return baseResult('remove', ok ? 'ok' : 'not-removed', {
        ok: !!ok,
        labelId: labelId,
      });
    } catch (e) {
      pushError('remove', e);
      recordWrite('remove', false);
      return baseResult('remove', 'error', { labelId: labelId, reason: String((e && e.message) || e) });
    }
  }

  /* ── bindChat(chatId, labelId) ────────────────────────────────────── */
  /* Idempotent at the SQL level (INSERT OR IGNORE on composite PK).
   * Re-binding an existing (chat_id, label_id) pair preserves the
   * original assigned_at — see store.labels.bindChat docstring. We
   * verify the label exists before writing so we never create a
   * dangling label_id in label_bindings. The chat does NOT need to
   * exist in `chats` first (label_bindings has no FK constraint to
   * chats); orphan chat_ids in label_bindings are tolerated and will
   * resolve once the chat row arrives via R3 import. */
  async function bindChat(chatIdInput, labelIdInput) {
    var chatId  = cleanString(chatIdInput);
    var labelId = cleanString(labelIdInput);
    if (!chatId) {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    if (!labelId) {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'label-id-required', { chatId: chatId, reason: 'labelId is required' });
    }
    var store = getStore();
    if (!store || typeof store.bindChat !== 'function') {
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'store-unavailable', { chatId: chatId, labelId: labelId });
    }
    try {
      var existingLabel = await store.get(labelId);
      if (!existingLabel) {
        recordWrite('bindChat', false);
        return baseResult('bindChat', 'label-not-found', {
          chatId: chatId, labelId: labelId,
        });
      }
      var ok = await store.bindChat(labelId, chatId, {});
      recordWrite('bindChat', !!ok);
      if (ok) dispatchRefresh('bindChat');
      return baseResult('bindChat', ok ? 'ok' : 'error', {
        ok: !!ok,
        chatId: chatId,
        labelId: labelId,
      });
    } catch (e) {
      pushError('bindChat', e);
      recordWrite('bindChat', false);
      return baseResult('bindChat', 'error', {
        chatId: chatId, labelId: labelId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── unbindChat(chatId, labelId) ──────────────────────────────────── */
  /* store.unbindChat returns true iff a row was actually deleted. We
   * dispatch refresh only on actual deletion to keep the event bus
   * quiet for no-op unbinds. */
  async function unbindChat(chatIdInput, labelIdInput) {
    var chatId  = cleanString(chatIdInput);
    var labelId = cleanString(labelIdInput);
    if (!chatId) {
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    if (!labelId) {
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'label-id-required', { chatId: chatId, reason: 'labelId is required' });
    }
    var store = getStore();
    if (!store || typeof store.unbindChat !== 'function') {
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'store-unavailable', { chatId: chatId, labelId: labelId });
    }
    try {
      var wasBound = await store.unbindChat(labelId, chatId);
      recordWrite('unbindChat', true);
      if (wasBound) dispatchRefresh('unbindChat');
      return baseResult('unbindChat', 'ok', {
        ok: true,
        chatId: chatId,
        labelId: labelId,
        wasBound: !!wasBound,
      });
    } catch (e) {
      pushError('unbindChat', e);
      recordWrite('unbindChat', false);
      return baseResult('unbindChat', 'error', {
        chatId: chatId, labelId: labelId,
        reason: String((e && e.message) || e),
      });
    }
  }

  /* ── replaceForChat(chatId, labelIds[]) ──────────────────────────── */
  /* Full replacement: drops all existing bindings for the chat, then
   * inserts the new set. Empty array clears all labels. Duplicates in
   * the input array are deduped on the store side. */
  async function replaceForChat(chatIdInput, labelIdsInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) {
      recordWrite('replaceForChat', false);
      return baseResult('replaceForChat', 'chat-id-required', { reason: 'chatId is required' });
    }
    if (!Array.isArray(labelIdsInput)) {
      recordWrite('replaceForChat', false);
      return baseResult('replaceForChat', 'labels-array-required', {
        chatId: chatId,
        reason: 'labelIds must be an array (pass [] to clear)',
      });
    }
    /* Pre-clean each labelId, drop empties, and dedup. The store also
     * dedupes on its side (via INSERT OR IGNORE on composite PK), but
     * deduping here gives us an accurate `count` in the returned
     * result and a chance to surface validation issues clearly. The
     * resulting `labelIds` array is the same set the store will see
     * after its own dedup pass. */
    var labelIds = [];
    var seen = Object.create(null);
    for (var i = 0; i < labelIdsInput.length; i += 1) {
      var v = cleanString(labelIdsInput[i]);
      if (v && !seen[v]) { seen[v] = true; labelIds.push(v); }
    }
    var store = getStore();
    if (!store || typeof store.replaceForChat !== 'function') {
      recordWrite('replaceForChat', false);
      return baseResult('replaceForChat', 'store-unavailable', { chatId: chatId });
    }
    try {
      var ok = await store.replaceForChat(chatId, labelIds, {});
      recordWrite('replaceForChat', !!ok);
      if (ok) dispatchRefresh('replaceForChat');
      return baseResult('replaceForChat', ok ? 'ok' : 'error', {
        ok: !!ok,
        chatId: chatId,
        labelIds: labelIds.slice(),
        count: labelIds.length,
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
        labels: Array.isArray(rows) ? rows.slice() : [],
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
      errors: state.errors.slice(),
    };
  }

  /* ── Public API ──────────────────────────────────────────────────── */
  H2O.Studio.actions.labels = {
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
