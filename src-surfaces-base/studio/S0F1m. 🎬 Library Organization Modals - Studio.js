/* H2O Studio — Library Organization Modals (R4.5.1.a — Folders only)
 *
 * Desktop-first user-facing entry point for catalog CRUD. R4.5.1.a is
 * the first slice of R4.5 and covers FOLDERS ONLY — categories, labels,
 * tags get their own editors in R4.5.2 / R4.5.3.
 *
 * Public API: H2O.Studio.OrganizationModals = {
 *   __installed: true,
 *   __version: '0.1.0',
 *   openFolderEditor(options): Promise<result>,
 *   close(): void,
 *   diagnose(): object,
 * }
 *
 * openFolderEditor modes:
 *   - 'create'  → create a new folder
 *   - 'rename'  → rename an existing folder
 *   - 'color'   → update the folder color / iconColor
 *   - 'delete'  → remove a folder (with window.confirm guard)
 *
 * options shape:
 *   {
 *     mode:        'create' | 'rename' | 'color' | 'delete'   (required)
 *     folderId?:   string                                     (required for rename/color/delete)
 *     name?:       string         (optional — if absent, prompt() is used)
 *     color?:      string         (optional — if absent, prompt() is used)
 *     iconColor?:  string         (optional — defaults to `color` for color mode)
 *     parentId?:   string         (optional — for create mode)
 *     skipPrompts?: boolean       (optional — for tests; when true, missing
 *                                  inputs fail with 'input-required' instead
 *                                  of opening prompt()/confirm())
 *     skipConfirm?: boolean       (optional — for tests; skips delete confirm)
 *     anchorEl?:   Element        (optional — caller's anchor; reserved for
 *                                  future inline-panel UI; ignored in V1)
 *     source?:     string         (optional — passthrough to actions.folders.create)
 *     meta?:       object         (optional — passthrough)
 *   }
 *
 * Result shape:
 *   {
 *     ok:          boolean
 *     mode:        same as input mode
 *     status:      'ok' | 'cancelled' | 'input-required' | <action-status>
 *     folderId?:   string
 *     name?:       string
 *     color?:      string
 *     result?:     full result from H2O.Studio.actions.folders.<action>
 *     reason?:     string
 *   }
 *
 * Each successful mutation propagates through the canonical refresh chain
 * because H2O.Studio.actions.folders.* itself dispatches the
 * `evt:h2o:library-index:refresh-request` event with reason
 * 'folders-actions:<action>'. This module deliberately does NOT dispatch
 * its own refresh event — staying single-source-of-truth.
 *
 * V1 UI strategy:
 *   - Inputs (name, color) prompted via window.prompt() when not supplied.
 *   - Delete confirmation via window.confirm() showing folder name and
 *     bound-chat count (best-effort via actions.folders.listChats).
 *   - No DOM-mounted modal in V1; future slices can layer one on top by
 *     overriding state.uiHooks at boot time.
 *
 * Tauri-gated at load. On MV3/web this file is a silent no-op and does
 * not register anything; H2O.Studio.OrganizationModals stays undefined.
 *
 * ── PRESERVED EXISTING BEHAVIOR ───────────────────────────────────────
 * Does NOT modify any S0F1b / S0F1d / S0Z1g render path. Only S0Z1g's
 * folder-create button gets a Desktop-conditional re-wiring that calls
 * openFolderEditor BEFORE the existing MV3 openFolderCreatePanel; on
 * MV3 the existing canonical-folder-create path is unchanged.
 *
 * Boundary:
 *   - No DOM access to ChatGPT (no chatgpt.com observers; pure Studio).
 *   - No Native folder API calls (no H2O.folders.create / .rename / etc.).
 *   - No direct SQLite / no plugin:sql invocation.
 *
 * Contract: src-surfaces-base/studio/STUDIO_STORAGE_CONTRACT.md
 *           docs/architecture/library-migration-plan.md (R4.5)
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
  if (H2O.Studio.OrganizationModals && H2O.Studio.OrganizationModals.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var PHASE         = 'R4.5.1.a-folders-modal';
  var MAX_ERRORS    = 20;
  var SUPPORTED_MODES = ['create', 'rename', 'color', 'delete'];

  /* ── State (in-memory only) ──────────────────────────────────────── */
  var state = {
    installedAt: Date.now(),
    opensSinceBoot: 0,
    lastOpenAt: 0,
    lastMode: '',
    lastStatus: '',
    lastFolderId: '',
    activeMode: null,            /* the in-flight mode (for close()) */
    errors: [],
  };

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function cleanString(value) {
    return String(value == null ? '' : value).trim();
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

  function recordOpen(mode, status, folderId) {
    state.opensSinceBoot += 1;
    state.lastOpenAt = Date.now();
    state.lastMode = cleanString(mode);
    state.lastStatus = cleanString(status);
    state.lastFolderId = cleanString(folderId);
  }

  function getActions() {
    try {
      return (H2O.Studio && H2O.Studio.actions && H2O.Studio.actions.folders) || null;
    } catch (_) { return null; }
  }

  function baseResult(mode, status, extra) {
    return Object.assign({
      ok: false,
      mode: cleanString(mode),
      status: cleanString(status),
      surface: 'studio',
      phase: PHASE,
    }, extra || {});
  }

  /* Prompt wrappers — sandbox-friendly. Look up at CALL time, not at
   * load time, so test runners can install mocks after module load. */
  function safePrompt(message, defaultValue) {
    try {
      if (typeof global.prompt === 'function') {
        var result = global.prompt(message, defaultValue == null ? '' : String(defaultValue));
        return (result == null) ? null : String(result);
      }
    } catch (_) { /* swallow */ }
    return null;
  }

  function safeConfirm(message) {
    try {
      if (typeof global.confirm === 'function') {
        return !!global.confirm(message);
      }
    } catch (_) { /* swallow */ }
    return false;
  }

  /* Best-effort bound-chat count for delete confirm. Fails gracefully —
   * if listChats is unavailable or rejects, we still proceed with the
   * confirm using just the folder name. */
  async function loadBoundCount(folderId) {
    try {
      var actions = getActions();
      if (!actions || typeof actions.listChats !== 'function') return null;
      var res = await actions.listChats(folderId);
      if (res && typeof res.count === 'number') return res.count;
      if (res && Array.isArray(res.chats)) return res.chats.length;
    } catch (e) { pushError('loadBoundCount', e); }
    return null;
  }

  async function loadFolderName(folderId) {
    try {
      var store = (H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders) || null;
      if (store && typeof store.get === 'function') {
        var row = await store.get(folderId);
        if (row && row.name) return String(row.name);
      }
    } catch (e) { pushError('loadFolderName', e); }
    return '';
  }

  /* ── Mode handlers ────────────────────────────────────────────────── */

  async function handleCreate(opts) {
    var actions = getActions();
    if (!actions || typeof actions.create !== 'function') {
      return baseResult('create', 'actions-unavailable', {
        reason: 'H2O.Studio.actions.folders.create unavailable',
      });
    }
    var name = cleanString(opts.name);
    if (!name) {
      if (opts.skipPrompts) {
        return baseResult('create', 'input-required', { reason: 'name is required' });
      }
      var typed = safePrompt('New folder name:', '');
      name = cleanString(typed);
      if (!name) {
        return baseResult('create', 'cancelled', { reason: 'user cancelled or empty name' });
      }
    }
    var payload = { name: name };
    if (opts.parentId)  payload.parentId  = cleanString(opts.parentId);
    if (opts.color)     payload.color     = cleanString(opts.color);
    if (opts.iconColor) payload.iconColor = cleanString(opts.iconColor);
    if (opts.source)    payload.source    = cleanString(opts.source);
    if (opts.meta)      payload.meta      = opts.meta;
    try {
      var res = await actions.create(payload);
      return baseResult('create', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        folderId: res && res.folderId,
        name: res && res.name,
        color: res && (res.color || ''),
        result: res,
      });
    } catch (e) {
      pushError('create', e);
      return baseResult('create', 'error', { reason: String((e && e.message) || e) });
    }
  }

  async function handleRename(opts) {
    var actions = getActions();
    if (!actions || typeof actions.rename !== 'function') {
      return baseResult('rename', 'actions-unavailable', {
        reason: 'H2O.Studio.actions.folders.rename unavailable',
      });
    }
    var folderId = cleanString(opts.folderId);
    if (!folderId) {
      return baseResult('rename', 'input-required', { reason: 'folderId is required' });
    }
    var newName = cleanString(opts.name);
    if (!newName) {
      if (opts.skipPrompts) {
        return baseResult('rename', 'input-required', { folderId: folderId, reason: 'name is required' });
      }
      var current = await loadFolderName(folderId);
      var typed = safePrompt('Rename folder' + (current ? ' "' + current + '"' : '') + ':', current);
      newName = cleanString(typed);
      if (!newName) {
        return baseResult('rename', 'cancelled', { folderId: folderId, reason: 'user cancelled or empty name' });
      }
    }
    try {
      var res = await actions.rename(folderId, newName);
      return baseResult('rename', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        folderId: folderId,
        name: res && res.name,
        result: res,
      });
    } catch (e) {
      pushError('rename', e);
      return baseResult('rename', 'error', { folderId: folderId, reason: String((e && e.message) || e) });
    }
  }

  async function handleColor(opts) {
    var actions = getActions();
    if (!actions || typeof actions.update !== 'function') {
      return baseResult('color', 'actions-unavailable', {
        reason: 'H2O.Studio.actions.folders.update unavailable',
      });
    }
    var folderId = cleanString(opts.folderId);
    if (!folderId) {
      return baseResult('color', 'input-required', { reason: 'folderId is required' });
    }
    var color = cleanString(opts.color);
    if (!color) {
      if (opts.skipPrompts) {
        return baseResult('color', 'input-required', { folderId: folderId, reason: 'color is required' });
      }
      var typed = safePrompt('Folder color (hex, e.g. #6aa9ff):', '#6aa9ff');
      color = cleanString(typed);
      if (!color) {
        return baseResult('color', 'cancelled', { folderId: folderId, reason: 'user cancelled or empty color' });
      }
    }
    var iconColor = cleanString(opts.iconColor) || color;
    var patch = { color: color, iconColor: iconColor };
    try {
      var res = await actions.update(folderId, patch);
      return baseResult('color', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        folderId: folderId,
        color: color,
        iconColor: iconColor,
        result: res,
      });
    } catch (e) {
      pushError('color', e);
      return baseResult('color', 'error', { folderId: folderId, reason: String((e && e.message) || e) });
    }
  }

  async function handleDelete(opts) {
    var actions = getActions();
    var removeFn = actions && (actions.remove || actions['delete']);
    if (!actions || typeof removeFn !== 'function') {
      return baseResult('delete', 'actions-unavailable', {
        reason: 'H2O.Studio.actions.folders.remove unavailable',
      });
    }
    var folderId = cleanString(opts.folderId);
    if (!folderId) {
      return baseResult('delete', 'input-required', { reason: 'folderId is required' });
    }
    var confirmed = !!opts.skipConfirm;
    if (!confirmed) {
      /* Best-effort enrich the confirm message with name + bound count. */
      var name = await loadFolderName(folderId);
      var count = await loadBoundCount(folderId);
      var msg = 'Delete folder';
      if (name) msg += ' "' + name + '"';
      msg += '?';
      if (typeof count === 'number') {
        if (count === 0)      msg += '\n\nNo chats are bound to this folder.';
        else if (count === 1) msg += '\n\nThis will unbind 1 chat from this folder.';
        else                  msg += '\n\nThis will unbind ' + count + ' chats from this folder.';
      }
      confirmed = safeConfirm(msg);
      if (!confirmed) {
        return baseResult('delete', 'cancelled', { folderId: folderId, reason: 'user cancelled' });
      }
    }
    try {
      var res = await removeFn(folderId);
      return baseResult('delete', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        folderId: folderId,
        result: res,
      });
    } catch (e) {
      pushError('delete', e);
      return baseResult('delete', 'error', { folderId: folderId, reason: String((e && e.message) || e) });
    }
  }

  /* ── Public: openFolderEditor ─────────────────────────────────────── */
  async function openFolderEditor(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    var mode = cleanString(opts.mode);
    if (SUPPORTED_MODES.indexOf(mode) === -1) {
      var bad = baseResult(mode || 'unknown', 'unsupported-mode', {
        reason: 'mode must be one of: ' + SUPPORTED_MODES.join(', '),
        supportedModes: SUPPORTED_MODES.slice(),
      });
      recordOpen(mode, bad.status, opts.folderId);
      return bad;
    }
    state.activeMode = mode;
    var result;
    try {
      if      (mode === 'create') result = await handleCreate(opts);
      else if (mode === 'rename') result = await handleRename(opts);
      else if (mode === 'color')  result = await handleColor(opts);
      else if (mode === 'delete') result = await handleDelete(opts);
      else result = baseResult(mode, 'unsupported-mode', { reason: 'unreachable' });
    } catch (e) {
      pushError('openFolderEditor:' + mode, e);
      result = baseResult(mode, 'error', { reason: String((e && e.message) || e) });
    }
    state.activeMode = null;
    recordOpen(mode, result.status, result.folderId || opts.folderId);
    return result;
  }

  /* ── Public: close ────────────────────────────────────────────────── */
  /* V1 UI is browser prompt/confirm — modal nature is inherent and there
   * is no DOM-mounted panel to dismiss. close() is therefore a no-op
   * marker that resets the active-mode tracker for future inline UI. */
  function close() {
    state.activeMode = null;
  }

  /* ── Public: diagnose ─────────────────────────────────────────────── */
  function diagnose() {
    return {
      installed: true,
      phase: PHASE,
      installedAt: state.installedAt,
      installedAtIso: (function () { try { return new Date(state.installedAt).toISOString(); } catch (_) { return ''; } })(),
      opensSinceBoot: state.opensSinceBoot,
      lastOpenAt: state.lastOpenAt,
      lastMode: state.lastMode,
      lastStatus: state.lastStatus,
      lastFolderId: state.lastFolderId,
      activeMode: state.activeMode,
      supportedModes: SUPPORTED_MODES.slice(),
      actionsAvailable: !!getActions(),
      uiStrategy: 'prompt+confirm-v1',
      domAccess: false,
      observesChatGptDom: false,
      errors: state.errors.slice(),
    };
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  H2O.Studio.OrganizationModals = {
    __installed: true,
    __version: '0.1.0',
    openFolderEditor: openFolderEditor,
    close: close,
    diagnose: diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
