/* H2O Studio — Library Organization Modals (R4.5.1.a / R4.5.2 / R4.5.3)
 *
 * Desktop-first user-facing entry point for catalog CRUD. Grows one
 * target at a time:
 *   - R4.5.1.a — folders                (DONE)
 *   - R4.5.2   — categories             (DONE)
 *   - R4.5.3   — labels + tags          (THIS SLICE)
 *
 * Public API: H2O.Studio.OrganizationModals = {
 *   __installed: true,
 *   __version: '0.3.0',
 *   openFolderEditor(options):   Promise<result>,
 *   openCategoryEditor(options): Promise<result>,    // R4.5.2
 *   openLabelEditor(options):    Promise<result>,    // R4.5.3
 *   openTagEditor(options):      Promise<result>,    // R4.5.3
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
 * openCategoryEditor modes:
 *   - 'create'  → create a new category
 *   - 'rename'  → rename an existing category
 *   - 'delete'  → remove a category (with window.confirm guard; the
 *                 confirm message includes the category name and the
 *                 number of chats currently assigned to it, best-effort
 *                 via LibraryIndex.facets().byCategory)
 *   No 'color' mode — categories have no color column in V1.
 *
 * openLabelEditor modes (R4.5.3):
 *   - 'create'  → create a new label
 *   - 'rename'  → rename an existing label
 *   - 'color'   → update the label color (labels carry a color column)
 *   - 'delete'  → remove a label (with window.confirm guard; the
 *                 confirm message includes the label name and the
 *                 number of chats bound to it via label_bindings,
 *                 best-effort via LibraryIndex.facets().byLabel)
 *
 * openTagEditor modes (R4.5.3):
 *   - 'create'  → create a new tag (catalog only — no extraction)
 *   - 'rename'  → rename an existing tag
 *   - 'delete'  → remove a tag (with window.confirm guard; the confirm
 *                 message includes the tag name and the number of chats
 *                 bound to it via tag_bindings, best-effort via
 *                 LibraryIndex.facets().byTag)
 *   NO 'color' mode (tags have no color column).
 *   NO 'extract' / 'derive' / 'scan' modes — turn-level extraction
 *   stays in Native 0F5a. R4.3's hard boundary is preserved:
 *     - SUPPORTED_TAG_MODES contains no extraction-related entry
 *     - no DOM access anywhere in this module
 *     - diagnose() reports tagExtraction:false AND
 *       targets.tags.observesChatGptDom:false
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
 * R4.5.1.a (folders): S0Z1g's folder-create button gets a Desktop-
 *   conditional re-wiring that calls openFolderEditor BEFORE the
 *   existing MV3 openFolderCreatePanel; on MV3 the existing canonical-
 *   folder-create path is unchanged.
 * R4.5.2 (categories): S0Z1g's per-row promptRenameItem / deleteMenuItem
 *   get a Desktop-conditional branch (for `kind === 'categories'`) that
 *   routes through openCategoryEditor BEFORE the existing
 *   H2O.archiveBoot.renameCategory / getChatListSvc().renameCategory /
 *   H2O.archiveBoot.deleteCategory / getChatListSvc().deleteCategory
 *   fallback ladder. On MV3 the existing ladder runs unchanged.
 *   A new categories-section create button (ensureCategoryCreateButton)
 *   is added with no MV3 fallback (gracefully absent off-Desktop).
 *
 * Boundary:
 *   - No DOM access to ChatGPT (no chatgpt.com observers; pure Studio).
 *   - No Native folder/category APIs (no H2O.folders.* / H2O.archiveBoot.*
 *     mutation methods invoked from the Desktop branch).
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
  /* PHASE bumps with each R4.5.x slice that extends this module so
   * diagnose() identifies which UI capabilities are live. */
  var PHASE         = 'R4.5.3-folders+categories+labels+tags-modal';
  var MAX_ERRORS    = 20;
  var SUPPORTED_MODES = ['create', 'rename', 'color', 'delete'];
  /* Categories have no color attribute — color editing is folder-only. */
  var SUPPORTED_CATEGORY_MODES = ['create', 'rename', 'delete'];
  /* Labels carry a color column — full 4 modes like folders. */
  var SUPPORTED_LABEL_MODES    = ['create', 'rename', 'color', 'delete'];
  /* Tags have NO color and NO extraction UI — turn-level extraction
   * stays in Native 0F5a. R4.3's hard boundary is enforced here:
   * - no extraction mode in the supported list
   * - no DOM scanning anywhere in this module
   * - diagnose() reports tagExtraction:false so callers can assert. */
  var SUPPORTED_TAG_MODES      = ['create', 'rename', 'delete'];

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
    var explicitColor = Object.prototype.hasOwnProperty.call(opts, 'color')
      || Object.prototype.hasOwnProperty.call(opts, 'iconColor');
    var color = cleanString(opts.color);
    if (!color && !explicitColor) {
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

  /* ── Category helpers (R4.5.2) ────────────────────────────────────── */

  function getCategoryActions() {
    try {
      return (H2O.Studio && H2O.Studio.actions && H2O.Studio.actions.categories) || null;
    } catch (_) { return null; }
  }

  /* Best-effort look-up of the category name via the categories store.
   * Pattern mirrors loadFolderName — fails gracefully. */
  async function loadCategoryName(categoryId) {
    try {
      var store = (H2O.Studio && H2O.Studio.store && H2O.Studio.store.categories) || null;
      if (store && typeof store.get === 'function') {
        var row = await store.get(categoryId);
        if (row && (row.name || row.label)) return String(row.name || row.label);
      }
    } catch (e) { pushError('loadCategoryName', e); }
    return '';
  }

  /* Categories bind via chats.category_id (no separate binding table).
   * Best-effort count via the LibraryIndex facets; null when unavailable. */
  async function loadCategoryBoundCount(categoryId) {
    try {
      var idx = (H2O.Studio && H2O.Studio.LibraryIndex) || (global.H2O && global.H2O.LibraryIndex) || null;
      if (idx && typeof idx.facets === 'function') {
        var facets = idx.facets();
        var byCat = facets && facets.byCategory;
        if (byCat && Array.isArray(byCat[categoryId])) return byCat[categoryId].length;
      }
    } catch (e) { pushError('loadCategoryBoundCount', e); }
    return null;
  }

  /* ── Category mode handlers ───────────────────────────────────────── */

  async function handleCategoryCreate(opts) {
    var actions = getCategoryActions();
    if (!actions || typeof actions.create !== 'function') {
      return baseResult('create', 'actions-unavailable', {
        target: 'categories',
        reason: 'H2O.Studio.actions.categories.create unavailable',
      });
    }
    var name = cleanString(opts.name);
    if (!name) {
      if (opts.skipPrompts) {
        return baseResult('create', 'input-required', { target: 'categories', reason: 'name is required' });
      }
      var typed = safePrompt('New category name:', '');
      name = cleanString(typed);
      if (!name) {
        return baseResult('create', 'cancelled', { target: 'categories', reason: 'user cancelled or empty name' });
      }
    }
    var payload = { name: name };
    if (opts.source) payload.source = cleanString(opts.source);
    if (opts.meta)   payload.meta   = opts.meta;
    try {
      var res = await actions.create(payload);
      return baseResult('create', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'categories',
        categoryId: res && res.categoryId,
        name: res && res.name,
        result: res,
      });
    } catch (e) {
      pushError('category:create', e);
      return baseResult('create', 'error', { target: 'categories', reason: String((e && e.message) || e) });
    }
  }

  async function handleCategoryRename(opts) {
    var actions = getCategoryActions();
    if (!actions || typeof actions.rename !== 'function') {
      return baseResult('rename', 'actions-unavailable', {
        target: 'categories',
        reason: 'H2O.Studio.actions.categories.rename unavailable',
      });
    }
    var categoryId = cleanString(opts.categoryId);
    if (!categoryId) {
      return baseResult('rename', 'input-required', { target: 'categories', reason: 'categoryId is required' });
    }
    var newName = cleanString(opts.name);
    if (!newName) {
      if (opts.skipPrompts) {
        return baseResult('rename', 'input-required', { target: 'categories', categoryId: categoryId, reason: 'name is required' });
      }
      var current = await loadCategoryName(categoryId);
      var typed = safePrompt('Rename category' + (current ? ' "' + current + '"' : '') + ':', current);
      newName = cleanString(typed);
      if (!newName) {
        return baseResult('rename', 'cancelled', { target: 'categories', categoryId: categoryId, reason: 'user cancelled or empty name' });
      }
    }
    try {
      var res = await actions.rename(categoryId, newName);
      return baseResult('rename', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'categories',
        categoryId: categoryId,
        name: res && res.name,
        result: res,
      });
    } catch (e) {
      pushError('category:rename', e);
      return baseResult('rename', 'error', { target: 'categories', categoryId: categoryId, reason: String((e && e.message) || e) });
    }
  }

  async function handleCategoryDelete(opts) {
    var actions = getCategoryActions();
    var removeFn = actions && (actions.remove || actions['delete']);
    if (!actions || typeof removeFn !== 'function') {
      return baseResult('delete', 'actions-unavailable', {
        target: 'categories',
        reason: 'H2O.Studio.actions.categories.remove unavailable',
      });
    }
    var categoryId = cleanString(opts.categoryId);
    if (!categoryId) {
      return baseResult('delete', 'input-required', { target: 'categories', reason: 'categoryId is required' });
    }
    var confirmed = !!opts.skipConfirm;
    if (!confirmed) {
      var name  = await loadCategoryName(categoryId);
      var count = await loadCategoryBoundCount(categoryId);
      var msg = 'Delete category';
      if (name) msg += ' "' + name + '"';
      msg += '?';
      if (typeof count === 'number') {
        if (count === 0)      msg += '\n\nNo chats are assigned to this category.';
        else if (count === 1) msg += '\n\nThis will clear the category from 1 chat.';
        else                  msg += '\n\nThis will clear the category from ' + count + ' chats.';
      }
      confirmed = safeConfirm(msg);
      if (!confirmed) {
        return baseResult('delete', 'cancelled', { target: 'categories', categoryId: categoryId, reason: 'user cancelled' });
      }
    }
    try {
      var res = await removeFn(categoryId);
      return baseResult('delete', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'categories',
        categoryId: categoryId,
        result: res,
      });
    } catch (e) {
      pushError('category:delete', e);
      return baseResult('delete', 'error', { target: 'categories', categoryId: categoryId, reason: String((e && e.message) || e) });
    }
  }

  /* ── Label helpers (R4.5.3) ───────────────────────────────────────── */

  function getLabelActions() {
    try {
      return (H2O.Studio && H2O.Studio.actions && H2O.Studio.actions.labels) || null;
    } catch (_) { return null; }
  }

  async function loadLabelName(labelId) {
    try {
      var store = (H2O.Studio && H2O.Studio.store && H2O.Studio.store.labels) || null;
      if (store && typeof store.get === 'function') {
        var row = await store.get(labelId);
        if (row && (row.name || row.label)) return String(row.name || row.label);
      }
    } catch (e) { pushError('loadLabelName', e); }
    return '';
  }

  /* Labels bind many-to-many via label_bindings; best-effort count
   * via the LibraryIndex.facets().byLabel facet (already populated by
   * S0Z1g.renderLabels). Null if unavailable. */
  async function loadLabelBoundCount(labelId) {
    try {
      var idx = (H2O.Studio && H2O.Studio.LibraryIndex) || (global.H2O && global.H2O.LibraryIndex) || null;
      if (idx && typeof idx.facets === 'function') {
        var facets = idx.facets();
        var byLabel = facets && facets.byLabel;
        if (byLabel && Array.isArray(byLabel[labelId])) return byLabel[labelId].length;
      }
    } catch (e) { pushError('loadLabelBoundCount', e); }
    return null;
  }

  /* ── Tag helpers (R4.5.3) ─────────────────────────────────────────── */

  function getTagActions() {
    try {
      return (H2O.Studio && H2O.Studio.actions && H2O.Studio.actions.tags) || null;
    } catch (_) { return null; }
  }

  async function loadTagName(tagId) {
    try {
      var store = (H2O.Studio && H2O.Studio.store && H2O.Studio.store.tags) || null;
      if (store && typeof store.get === 'function') {
        var row = await store.get(tagId);
        if (row && (row.name || row.label || row.tag)) return String(row.name || row.label || row.tag);
      }
    } catch (e) { pushError('loadTagName', e); }
    return '';
  }

  async function loadTagBoundCount(tagId) {
    try {
      var idx = (H2O.Studio && H2O.Studio.LibraryIndex) || (global.H2O && global.H2O.LibraryIndex) || null;
      if (idx && typeof idx.facets === 'function') {
        var facets = idx.facets();
        var byTag = facets && facets.byTag;
        if (byTag && Array.isArray(byTag[tagId])) return byTag[tagId].length;
      }
    } catch (e) { pushError('loadTagBoundCount', e); }
    return null;
  }

  /* ── Label mode handlers ──────────────────────────────────────────── */

  async function handleLabelCreate(opts) {
    var actions = getLabelActions();
    if (!actions || typeof actions.create !== 'function') {
      return baseResult('create', 'actions-unavailable', {
        target: 'labels',
        reason: 'H2O.Studio.actions.labels.create unavailable',
      });
    }
    var name = cleanString(opts.name);
    if (!name) {
      if (opts.skipPrompts) {
        return baseResult('create', 'input-required', { target: 'labels', reason: 'name is required' });
      }
      var typed = safePrompt('New label name:', '');
      name = cleanString(typed);
      if (!name) {
        return baseResult('create', 'cancelled', { target: 'labels', reason: 'user cancelled or empty name' });
      }
    }
    var payload = { name: name };
    if (opts.color) payload.color = cleanString(opts.color);
    if (opts.source) payload.source = cleanString(opts.source);
    if (opts.meta)   payload.meta   = opts.meta;
    try {
      var res = await actions.create(payload);
      return baseResult('create', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'labels',
        labelId: res && res.labelId,
        name: res && res.name,
        color: res && (res.color || ''),
        result: res,
      });
    } catch (e) {
      pushError('label:create', e);
      return baseResult('create', 'error', { target: 'labels', reason: String((e && e.message) || e) });
    }
  }

  async function handleLabelRename(opts) {
    var actions = getLabelActions();
    if (!actions || typeof actions.rename !== 'function') {
      return baseResult('rename', 'actions-unavailable', {
        target: 'labels',
        reason: 'H2O.Studio.actions.labels.rename unavailable',
      });
    }
    var labelId = cleanString(opts.labelId);
    if (!labelId) {
      return baseResult('rename', 'input-required', { target: 'labels', reason: 'labelId is required' });
    }
    var newName = cleanString(opts.name);
    if (!newName) {
      if (opts.skipPrompts) {
        return baseResult('rename', 'input-required', { target: 'labels', labelId: labelId, reason: 'name is required' });
      }
      var current = await loadLabelName(labelId);
      var typed = safePrompt('Rename label' + (current ? ' "' + current + '"' : '') + ':', current);
      newName = cleanString(typed);
      if (!newName) {
        return baseResult('rename', 'cancelled', { target: 'labels', labelId: labelId, reason: 'user cancelled or empty name' });
      }
    }
    try {
      var res = await actions.rename(labelId, newName);
      return baseResult('rename', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'labels',
        labelId: labelId,
        name: res && res.name,
        result: res,
      });
    } catch (e) {
      pushError('label:rename', e);
      return baseResult('rename', 'error', { target: 'labels', labelId: labelId, reason: String((e && e.message) || e) });
    }
  }

  async function handleLabelColor(opts) {
    var actions = getLabelActions();
    if (!actions || typeof actions.update !== 'function') {
      return baseResult('color', 'actions-unavailable', {
        target: 'labels',
        reason: 'H2O.Studio.actions.labels.update unavailable',
      });
    }
    var labelId = cleanString(opts.labelId);
    if (!labelId) {
      return baseResult('color', 'input-required', { target: 'labels', reason: 'labelId is required' });
    }
    var color = cleanString(opts.color);
    if (!color) {
      if (opts.skipPrompts) {
        return baseResult('color', 'input-required', { target: 'labels', labelId: labelId, reason: 'color is required' });
      }
      var typed = safePrompt('Label color (hex, e.g. #6aa9ff):', '#6aa9ff');
      color = cleanString(typed);
      if (!color) {
        return baseResult('color', 'cancelled', { target: 'labels', labelId: labelId, reason: 'user cancelled or empty color' });
      }
    }
    try {
      var res = await actions.update(labelId, { color: color });
      return baseResult('color', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'labels',
        labelId: labelId,
        color: color,
        result: res,
      });
    } catch (e) {
      pushError('label:color', e);
      return baseResult('color', 'error', { target: 'labels', labelId: labelId, reason: String((e && e.message) || e) });
    }
  }

  async function handleLabelDelete(opts) {
    var actions = getLabelActions();
    var removeFn = actions && (actions.remove || actions['delete']);
    if (!actions || typeof removeFn !== 'function') {
      return baseResult('delete', 'actions-unavailable', {
        target: 'labels',
        reason: 'H2O.Studio.actions.labels.remove unavailable',
      });
    }
    var labelId = cleanString(opts.labelId);
    if (!labelId) {
      return baseResult('delete', 'input-required', { target: 'labels', reason: 'labelId is required' });
    }
    var confirmed = !!opts.skipConfirm;
    if (!confirmed) {
      var name  = await loadLabelName(labelId);
      var count = await loadLabelBoundCount(labelId);
      var msg = 'Delete label';
      if (name) msg += ' "' + name + '"';
      msg += '?';
      if (typeof count === 'number') {
        if (count === 0)      msg += '\n\nNo chats currently use this label.';
        else if (count === 1) msg += '\n\nThis will unbind the label from 1 chat.';
        else                  msg += '\n\nThis will unbind the label from ' + count + ' chats.';
      }
      confirmed = safeConfirm(msg);
      if (!confirmed) {
        return baseResult('delete', 'cancelled', { target: 'labels', labelId: labelId, reason: 'user cancelled' });
      }
    }
    try {
      var res = await removeFn(labelId);
      return baseResult('delete', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'labels',
        labelId: labelId,
        result: res,
      });
    } catch (e) {
      pushError('label:delete', e);
      return baseResult('delete', 'error', { target: 'labels', labelId: labelId, reason: String((e && e.message) || e) });
    }
  }

  /* ── Tag mode handlers ────────────────────────────────────────────── */
  /* HARD BOUNDARY: no DOM scanning, no extraction, no chatgpt.com
   * observation anywhere below. Tags created here are catalog rows
   * only — turn-level extraction continues to flow from Native 0F5a.
   * R4.3 wrote the original boundary; R4.5.3 preserves it. */

  async function handleTagCreate(opts) {
    var actions = getTagActions();
    if (!actions || typeof actions.create !== 'function') {
      return baseResult('create', 'actions-unavailable', {
        target: 'tags',
        reason: 'H2O.Studio.actions.tags.create unavailable',
      });
    }
    var name = cleanString(opts.name);
    if (!name) {
      if (opts.skipPrompts) {
        return baseResult('create', 'input-required', { target: 'tags', reason: 'name is required' });
      }
      var typed = safePrompt('New tag name:', '');
      name = cleanString(typed);
      if (!name) {
        return baseResult('create', 'cancelled', { target: 'tags', reason: 'user cancelled or empty name' });
      }
    }
    /* No autoDerived passthrough — Studio-authored tags are operator
     * tags by definition; auto-derived tags come from Native 0F5a. */
    var payload = { name: name };
    if (opts.source) payload.source = cleanString(opts.source);
    if (opts.meta)   payload.meta   = opts.meta;
    try {
      var res = await actions.create(payload);
      return baseResult('create', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'tags',
        tagId: res && res.tagId,
        name: res && res.name,
        result: res,
      });
    } catch (e) {
      pushError('tag:create', e);
      return baseResult('create', 'error', { target: 'tags', reason: String((e && e.message) || e) });
    }
  }

  async function handleTagRename(opts) {
    var actions = getTagActions();
    if (!actions || typeof actions.rename !== 'function') {
      return baseResult('rename', 'actions-unavailable', {
        target: 'tags',
        reason: 'H2O.Studio.actions.tags.rename unavailable',
      });
    }
    var tagId = cleanString(opts.tagId);
    if (!tagId) {
      return baseResult('rename', 'input-required', { target: 'tags', reason: 'tagId is required' });
    }
    var newName = cleanString(opts.name);
    if (!newName) {
      if (opts.skipPrompts) {
        return baseResult('rename', 'input-required', { target: 'tags', tagId: tagId, reason: 'name is required' });
      }
      var current = await loadTagName(tagId);
      var typed = safePrompt('Rename tag' + (current ? ' "' + current + '"' : '') + ':', current);
      newName = cleanString(typed);
      if (!newName) {
        return baseResult('rename', 'cancelled', { target: 'tags', tagId: tagId, reason: 'user cancelled or empty name' });
      }
    }
    try {
      var res = await actions.rename(tagId, newName);
      return baseResult('rename', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'tags',
        tagId: tagId,
        name: res && res.name,
        result: res,
      });
    } catch (e) {
      pushError('tag:rename', e);
      return baseResult('rename', 'error', { target: 'tags', tagId: tagId, reason: String((e && e.message) || e) });
    }
  }

  async function handleTagDelete(opts) {
    var actions = getTagActions();
    var removeFn = actions && (actions.remove || actions['delete']);
    if (!actions || typeof removeFn !== 'function') {
      return baseResult('delete', 'actions-unavailable', {
        target: 'tags',
        reason: 'H2O.Studio.actions.tags.remove unavailable',
      });
    }
    var tagId = cleanString(opts.tagId);
    if (!tagId) {
      return baseResult('delete', 'input-required', { target: 'tags', reason: 'tagId is required' });
    }
    var confirmed = !!opts.skipConfirm;
    if (!confirmed) {
      var name  = await loadTagName(tagId);
      var count = await loadTagBoundCount(tagId);
      var msg = 'Delete tag';
      if (name) msg += ' "' + name + '"';
      msg += '?';
      if (typeof count === 'number') {
        if (count === 0)      msg += '\n\nNo chats currently use this tag.';
        else if (count === 1) msg += '\n\nThis will unbind the tag from 1 chat.';
        else                  msg += '\n\nThis will unbind the tag from ' + count + ' chats.';
      }
      confirmed = safeConfirm(msg);
      if (!confirmed) {
        return baseResult('delete', 'cancelled', { target: 'tags', tagId: tagId, reason: 'user cancelled' });
      }
    }
    try {
      var res = await removeFn(tagId);
      return baseResult('delete', (res && res.status) || (res && res.ok ? 'ok' : 'error'), {
        ok: !!(res && res.ok),
        target: 'tags',
        tagId: tagId,
        result: res,
      });
    } catch (e) {
      pushError('tag:delete', e);
      return baseResult('delete', 'error', { target: 'tags', tagId: tagId, reason: String((e && e.message) || e) });
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

  /* ── Public: openCategoryEditor (R4.5.2) ──────────────────────────── */
  /* Categories share the prompt+confirm V1 UI strategy with folders.
   * No color mode — categories have no color column in V1; appearance
   * comes from chats.category_id + display prefs handled elsewhere. */
  async function openCategoryEditor(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    var mode = cleanString(opts.mode);
    if (SUPPORTED_CATEGORY_MODES.indexOf(mode) === -1) {
      var bad = baseResult(mode || 'unknown', 'unsupported-mode', {
        target: 'categories',
        reason: 'mode must be one of: ' + SUPPORTED_CATEGORY_MODES.join(', '),
        supportedModes: SUPPORTED_CATEGORY_MODES.slice(),
      });
      recordOpen('category:' + mode, bad.status, opts.categoryId);
      return bad;
    }
    state.activeMode = 'category:' + mode;
    var result;
    try {
      if      (mode === 'create') result = await handleCategoryCreate(opts);
      else if (mode === 'rename') result = await handleCategoryRename(opts);
      else if (mode === 'delete') result = await handleCategoryDelete(opts);
      else result = baseResult(mode, 'unsupported-mode', { target: 'categories', reason: 'unreachable' });
    } catch (e) {
      pushError('openCategoryEditor:' + mode, e);
      result = baseResult(mode, 'error', { target: 'categories', reason: String((e && e.message) || e) });
    }
    state.activeMode = null;
    recordOpen('category:' + mode, result.status, result.categoryId || opts.categoryId);
    return result;
  }

  /* ── Public: openLabelEditor (R4.5.3) ─────────────────────────────── */
  /* Labels carry a color column — 4 modes like folders. */
  async function openLabelEditor(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    var mode = cleanString(opts.mode);
    if (SUPPORTED_LABEL_MODES.indexOf(mode) === -1) {
      var bad = baseResult(mode || 'unknown', 'unsupported-mode', {
        target: 'labels',
        reason: 'mode must be one of: ' + SUPPORTED_LABEL_MODES.join(', '),
        supportedModes: SUPPORTED_LABEL_MODES.slice(),
      });
      recordOpen('label:' + mode, bad.status, opts.labelId);
      return bad;
    }
    state.activeMode = 'label:' + mode;
    var result;
    try {
      if      (mode === 'create') result = await handleLabelCreate(opts);
      else if (mode === 'rename') result = await handleLabelRename(opts);
      else if (mode === 'color')  result = await handleLabelColor(opts);
      else if (mode === 'delete') result = await handleLabelDelete(opts);
      else result = baseResult(mode, 'unsupported-mode', { target: 'labels', reason: 'unreachable' });
    } catch (e) {
      pushError('openLabelEditor:' + mode, e);
      result = baseResult(mode, 'error', { target: 'labels', reason: String((e && e.message) || e) });
    }
    state.activeMode = null;
    recordOpen('label:' + mode, result.status, result.labelId || opts.labelId);
    return result;
  }

  /* ── Public: openTagEditor (R4.5.3) ───────────────────────────────── */
  /* Tag CATALOG management only. NO extraction mode, NO DOM scanning.
   * Turn-level tag derivation continues to run inside Native 0F5a. */
  async function openTagEditor(options) {
    var opts = (options && typeof options === 'object') ? options : {};
    var mode = cleanString(opts.mode);
    if (SUPPORTED_TAG_MODES.indexOf(mode) === -1) {
      var bad = baseResult(mode || 'unknown', 'unsupported-mode', {
        target: 'tags',
        reason: 'mode must be one of: ' + SUPPORTED_TAG_MODES.join(', '),
        supportedModes: SUPPORTED_TAG_MODES.slice(),
      });
      recordOpen('tag:' + mode, bad.status, opts.tagId);
      return bad;
    }
    state.activeMode = 'tag:' + mode;
    var result;
    try {
      if      (mode === 'create') result = await handleTagCreate(opts);
      else if (mode === 'rename') result = await handleTagRename(opts);
      else if (mode === 'delete') result = await handleTagDelete(opts);
      else result = baseResult(mode, 'unsupported-mode', { target: 'tags', reason: 'unreachable' });
    } catch (e) {
      pushError('openTagEditor:' + mode, e);
      result = baseResult(mode, 'error', { target: 'tags', reason: String((e && e.message) || e) });
    }
    state.activeMode = null;
    recordOpen('tag:' + mode, result.status, result.tagId || opts.tagId);
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
      /* R4.5.2 / R4.5.3 — per-target capability flags so callers can
       * verify which UI surfaces are wired before invoking them. */
      targets: {
        folders: {
          actionsAvailable: !!getActions(),
          supportedModes: SUPPORTED_MODES.slice(),
        },
        categories: {
          actionsAvailable: !!getCategoryActions(),
          supportedModes: SUPPORTED_CATEGORY_MODES.slice(),
        },
        labels: {
          actionsAvailable: !!getLabelActions(),
          supportedModes: SUPPORTED_LABEL_MODES.slice(),
        },
        tags: {
          actionsAvailable: !!getTagActions(),
          supportedModes: SUPPORTED_TAG_MODES.slice(),
          /* R4.3 boundary inherited: extraction stays in Native 0F5a. */
          extraction: false,
          observesChatGptDom: false,
        },
      },
      actionsAvailable: !!getActions(),
      uiStrategy: 'prompt+confirm-v1',
      domAccess: false,
      observesChatGptDom: false,
      /* R4.5.3 — top-level marker that no tag extraction code runs in
       * this module. Mirrors the diagnose pattern used by S0F5b. */
      tagExtraction: false,
      errors: state.errors.slice(),
    };
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  H2O.Studio.OrganizationModals = {
    __installed: true,
    __version: '0.3.0',
    openFolderEditor:   openFolderEditor,
    openCategoryEditor: openCategoryEditor,
    openLabelEditor:    openLabelEditor,
    openTagEditor:      openTagEditor,
    close:              close,
    diagnose:           diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
