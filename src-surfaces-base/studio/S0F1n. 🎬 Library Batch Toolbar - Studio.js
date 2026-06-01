/* H2O Studio — Library Batch Toolbar (R4.5.4)
 *
 * Desktop-first multi-select organization workflow. Composes existing
 * single-item primitives (H2O.LibraryActions.*) into batch operations
 * over N selected chats. Does NOT introduce a new write path, a new
 * schema, or a new refresh event — purely an orchestration layer.
 *
 * Public API: H2O.Studio.BatchToolbar = {
 *   __installed: true,
 *   __version: '0.1.0',
 *   selection: {
 *     add(chatId): boolean,         // true = newly added
 *     remove(chatId): boolean,      // true = was present
 *     clear(): number,              // returns previous size
 *     has(chatId): boolean,
 *     size(): number,
 *     all(): string[]               // snapshot of current chatIds
 *   },
 *   enable(): boolean,              // mounts toolbar + click delegation; idempotent
 *   disable(): boolean,             // unmounts toolbar + delegation; clears selection
 *   isEnabled(): boolean,
 *   diagnose(): object
 * }
 *
 * Operations the toolbar performs (user-triggered, single per click):
 *   - "Set Folder" — prompts for folderId → Promise.all over selection
 *     calling H2O.LibraryActions.setFolder(target, {folderId})
 *   - "Set Category" — prompts for categoryId → setCategory(target, {categoryId})
 *   - "Add Label" — prompts for labelId → addLabel(target, {labelId})
 *   - "Add Tag" — prompts for tagId → addTag(target, {tagId})
 *   - "Clear Selection" — selection.clear()
 *
 * ── Refresh strategy ────────────────────────────────────────────────
 * Each H2O.LibraryActions.* method dispatches its own
 * 'evt:h2o:library-index:refresh-request' when it succeeds. The
 * LibraryIndex (S0F1c) listener calls runRefresh() → refreshFromStores()
 * which guards on `state.refreshInFlight` (S0F1c:526). When the toolbar
 * fans out N parallel actions via Promise.all, the dispatches arrive
 * during the same microtask tick window — the FIRST one starts a
 * refresh; subsequent dispatches hit the in-flight guard and share that
 * single in-flight Promise. Net effect: N parallel batch dispatches
 * collapse to ~1 actual refresh.
 *
 * AFTER Promise.all settles, this module ALSO dispatches ONE explicit
 * 'evt:h2o:library-index:refresh-request' with reason
 * 'batch-toolbar:<op>:<count>' so:
 *   (a) observers can correlate the batch with its refresh
 *   (b) if the per-action dispatches happened to slip past the in-flight
 *       guard window (rare race), the final dispatch guarantees the
 *       refreshed state is read
 *
 * This means the WORST case is 2 refreshes (one mid-batch, one at end),
 * and the BEST case is 1 refresh (in-flight guard absorbs everything
 * including our final dispatch). Either way, dramatically better than
 * N refreshes.
 *
 * ── Selection model ────────────────────────────────────────────────
 * Pure JS Set keyed by chatId. Survives until disable() or selection.clear().
 * Does NOT persist across page reloads (intentional V1 — operator
 * confirms each batch in the moment).
 *
 * Click handlers on Explorer rows ([data-chatId] anchors with class
 * wbChatRow) are installed via document-level event delegation when
 * enable() is called:
 *   - PLAIN click (no modifier) → existing navigation behavior, NO
 *     selection change. (Preserves backward compat.)
 *   - Cmd/Ctrl+click → toggle selection; preventDefault + stopPropagation
 *     so the row does NOT navigate
 *   - Shift+click → range select from lastAnchor to this row; uses
 *     DOM-order traversal of visible .wbChatRow[data-chatId] elements
 *   - Click on injected checkbox element → toggle selection
 *
 * The "checkbox column" is rendered via DOM injection (a small
 * MutationObserver that watches for new wbChatRow elements and
 * prepends a visual checkbox indicator). Clicks on the checkbox
 * toggle selection via the same delegation path. NO modification to
 * S0F1d's ChatRow renderer.
 *
 * ── Boundaries ──────────────────────────────────────────────────────
 * Tauri-gated at load (silent no-op on MV3).
 *   - No direct SQLite / no plugin:sql.
 *   - No Native H2O.* mutation calls (only H2O.LibraryActions facade).
 *   - No ChatGPT DOM observation (no chatgpt.com, no MutationObserver
 *     on conversation-turn or any extraction patterns).
 *   - No new refresh event names (uses canonical refresh-request).
 *
 * Contract: docs/architecture/library-migration-plan.md (R4.5.4)
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
  if (H2O.Studio.BatchToolbar && H2O.Studio.BatchToolbar.__installed) return;

  /* ── Constants ────────────────────────────────────────────────────── */
  var PHASE          = 'R4.5.4-batch-toolbar';
  var MAX_ERRORS     = 20;
  var REFRESH_EVENT  = 'evt:h2o:library-index:refresh-request';
  /* Chat-row selector matches the Explorer page rendering from S0F1d's
   * ChatRow() function: <a class="wbChatRow" data-chatId="..."> */
  var ROW_SELECTOR    = '.wbChatRow[data-chatId]';
  var CHECKBOX_ATTR   = 'data-h2o-batch-checkbox';
  var ROW_PREPPED_ATTR = 'data-h2o-batch-prepped';
  var SELECTED_CLASS  = 'is-h2o-batch-selected';
  var TOOLBAR_ID      = 'h2o-batch-toolbar-root';

  /* ── State (in-memory only) ──────────────────────────────────────── */
  var state = {
    installedAt: Date.now(),
    enabled: false,
    selection: Object.create(null),  /* chatId → true; cheap presence test */
    selectionCount: 0,
    lastAnchor: '',                  /* chatId — basis for shift-range */
    toolbarEl: null,
    clickHandler: null,
    observer: null,
    opsSinceBoot: 0,
    lastOp: '',
    lastOpStatus: '',
    lastOpAt: 0,
    lastOpCount: 0,
    refreshesDispatched: 0,
    /* R4.5.4 review fix #1 — adversarial reviewer flagged that two rapid
     * back-to-back action-button clicks could let the second batch's
     * final refresh dispatch fire BEFORE the first batch's per-chat
     * writes settle (out-of-order refresh dispatch). This guard
     * serializes handleAction calls: while true, button clicks are
     * rejected with status 'op-in-progress'. */
    opInProgress: false,
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

  function getLibraryActions() {
    try {
      return (global.H2O && global.H2O.LibraryActions) || null;
    } catch (_) { return null; }
  }

  function safePrompt(message, defaultValue) {
    try {
      if (typeof global.prompt === 'function') {
        var result = global.prompt(message, defaultValue == null ? '' : String(defaultValue));
        return (result == null) ? null : String(result);
      }
    } catch (_) { /* swallow */ }
    return null;
  }

  function dispatchBatchRefresh(reason) {
    try {
      if (typeof global.dispatchEvent === 'function'
          && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(REFRESH_EVENT, {
          detail: { reason: 'batch-toolbar:' + cleanString(reason) },
        }));
        state.refreshesDispatched += 1;
      }
    } catch (e) { pushError('dispatchBatchRefresh', e); }
  }

  /* ── Selection state ──────────────────────────────────────────────── */
  function selectionAdd(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) return false;
    if (state.selection[chatId]) return false;
    state.selection[chatId] = true;
    state.selectionCount += 1;
    state.lastAnchor = chatId;
    onSelectionChanged();
    return true;
  }
  function selectionRemove(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    if (!chatId) return false;
    if (!state.selection[chatId]) return false;
    delete state.selection[chatId];
    state.selectionCount -= 1;
    /* R4.5.4 review fix #2 — adversarial reviewer flagged that removing
     * the row that lastAnchor points to leaves a stale anchor pointing
     * at a no-longer-selected row. Future Shift+click would fall back to
     * plain-add (the DOM lookup misses), which is correct but confusing.
     * Clear lastAnchor when the anchor itself is removed. */
    if (state.lastAnchor === chatId) state.lastAnchor = '';
    onSelectionChanged();
    return true;
  }
  function selectionClear() {
    var prev = state.selectionCount;
    if (prev === 0) return 0;
    state.selection = Object.create(null);
    state.selectionCount = 0;
    state.lastAnchor = '';
    onSelectionChanged();
    return prev;
  }
  function selectionHas(chatIdInput) {
    var chatId = cleanString(chatIdInput);
    return !!chatId && !!state.selection[chatId];
  }
  function selectionSize() { return state.selectionCount; }
  function selectionAll() { return Object.keys(state.selection); }

  /* Range-select helper — selects every chat row between lastAnchor and
   * the clicked chatId in DOM order. If lastAnchor is not currently in
   * the DOM (e.g. anchor row scrolled off), behaves as plain toggle. */
  function selectionRange(toChatId) {
    var doc = (global.document) || null;
    if (!doc || !state.lastAnchor) {
      selectionAdd(toChatId);
      return;
    }
    var anchor = state.lastAnchor;
    var rows = doc.querySelectorAll(ROW_SELECTOR);
    if (!rows || !rows.length) {
      selectionAdd(toChatId);
      return;
    }
    var anchorIdx = -1, toIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].getAttribute('data-chatId');
      if (id === anchor) anchorIdx = i;
      if (id === toChatId) toIdx = i;
    }
    if (anchorIdx < 0 || toIdx < 0) {
      selectionAdd(toChatId);
      return;
    }
    var lo = Math.min(anchorIdx, toIdx);
    var hi = Math.max(anchorIdx, toIdx);
    for (var j = lo; j <= hi; j++) {
      var rid = rows[j].getAttribute('data-chatId');
      if (rid && !state.selection[rid]) {
        state.selection[rid] = true;
        state.selectionCount += 1;
      }
    }
    /* Note: we do NOT update lastAnchor here — the original anchor stays
     * sticky so the user can extend the range further with another Shift+click. */
    onSelectionChanged();
  }

  /* ── Selection-change UI sync ─────────────────────────────────────── */
  function onSelectionChanged() {
    try { updateRowVisualState(); } catch (e) { pushError('updateRowVisualState', e); }
    try { updateToolbarDisplay(); } catch (e) { pushError('updateToolbarDisplay', e); }
  }

  function updateRowVisualState() {
    var doc = (global.document) || null;
    if (!doc) return;
    var rows = doc.querySelectorAll(ROW_SELECTOR);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var id = row.getAttribute('data-chatId');
      var selected = !!(id && state.selection[id]);
      if (selected) row.classList.add(SELECTED_CLASS);
      else          row.classList.remove(SELECTED_CLASS);
      /* Update the injected checkbox glyph if present. */
      var cb = row.querySelector('[' + CHECKBOX_ATTR + '="1"]');
      if (cb) cb.textContent = selected ? '☑' : '☐';
    }
  }

  /* ── Toolbar DOM ──────────────────────────────────────────────────── */
  function makeButton(label, opName) {
    var doc = (global.document) || null;
    if (!doc) return null;
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'wbBatchToolbarBtn';
    btn.setAttribute('data-h2o-batch-op', opName);
    btn.textContent = label;
    btn.style.cssText = 'padding:6px 12px;margin:0 4px;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:rgba(255,255,255,.04);color:rgba(255,255,255,.92);font:500 12px/1 ui-sans-serif,system-ui;cursor:pointer';
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      handleAction(opName).catch(function (e) { pushError('handleAction:' + opName, e); });
    });
    return btn;
  }

  function createToolbar() {
    var doc = (global.document) || null;
    if (!doc) return null;
    var root = doc.createElement('div');
    root.id = TOOLBAR_ID;
    root.setAttribute('data-h2o-batch-toolbar', '1');
    root.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9000;display:none;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(24,28,38,.94);backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.45);color:rgba(255,255,255,.92);font:500 12px/1.2 ui-sans-serif,system-ui';
    var count = doc.createElement('span');
    count.setAttribute('data-h2o-batch-count', '1');
    count.style.cssText = 'margin-right:8px;font:600 12px/1 ui-sans-serif,system-ui';
    count.textContent = '0 chats selected';
    root.appendChild(count);
    root.appendChild(makeButton('Set Folder', 'setFolder'));
    root.appendChild(makeButton('Set Category', 'setCategory'));
    root.appendChild(makeButton('Add Label', 'addLabel'));
    root.appendChild(makeButton('Add Tag', 'addTag'));
    var sep = doc.createElement('span');
    sep.style.cssText = 'width:1px;height:18px;background:rgba(255,255,255,.16);margin:0 4px';
    root.appendChild(sep);
    var clearBtn = makeButton('Clear Selection', 'clear');
    if (clearBtn) clearBtn.style.borderColor = 'rgba(255,180,180,.28)';
    root.appendChild(clearBtn);
    return root;
  }

  function mountToolbar() {
    var doc = (global.document) || null;
    if (!doc || state.toolbarEl) return;
    var el = createToolbar();
    if (!el) return;
    state.toolbarEl = el;
    (doc.body || doc.documentElement).appendChild(el);
  }

  function unmountToolbar() {
    if (state.toolbarEl && state.toolbarEl.parentNode) {
      try { state.toolbarEl.parentNode.removeChild(state.toolbarEl); } catch (_) { /* swallow */ }
    }
    state.toolbarEl = null;
  }

  function updateToolbarDisplay() {
    if (!state.toolbarEl) return;
    var size = state.selectionCount;
    var countEl = state.toolbarEl.querySelector('[data-h2o-batch-count="1"]');
    if (countEl) {
      countEl.textContent = size === 1 ? '1 chat selected' : (size + ' chats selected');
    }
    state.toolbarEl.style.display = size > 0 ? 'flex' : 'none';
  }

  /* ── Checkbox injection (MutationObserver-driven) ─────────────────── */
  function injectCheckboxForRow(row) {
    var doc = (global.document) || null;
    if (!doc || !row) return;
    if (row.getAttribute(ROW_PREPPED_ATTR) === '1') return;
    var chatId = row.getAttribute('data-chatId');
    if (!chatId) return;
    var cb = doc.createElement('span');
    cb.className = 'wbBatchCheckbox';
    cb.setAttribute(CHECKBOX_ATTR, '1');
    cb.setAttribute('data-h2o-chat-id', chatId);
    cb.setAttribute('role', 'checkbox');
    cb.setAttribute('aria-checked', state.selection[chatId] ? 'true' : 'false');
    cb.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-right:6px;flex:0 0 18px;border:1px solid rgba(255,255,255,.18);border-radius:4px;background:rgba(255,255,255,.04);color:rgba(255,255,255,.85);font:600 12px/1 ui-sans-serif,system-ui;cursor:pointer;user-select:none';
    cb.textContent = state.selection[chatId] ? '☑' : '☐';
    /* Insert as first child of the anchor so it appears at the start of
     * the row (the "checkbox column" the spec asked for). */
    row.insertBefore(cb, row.firstChild);
    row.setAttribute(ROW_PREPPED_ATTR, '1');
    if (state.selection[chatId]) row.classList.add(SELECTED_CLASS);
  }

  function injectCheckboxesIntoAllRows() {
    var doc = (global.document) || null;
    if (!doc) return;
    var rows = doc.querySelectorAll(ROW_SELECTOR);
    for (var i = 0; i < rows.length; i++) injectCheckboxForRow(rows[i]);
  }

  function removeAllInjectedCheckboxes() {
    var doc = (global.document) || null;
    if (!doc) return;
    var rows = doc.querySelectorAll(ROW_SELECTOR + '[' + ROW_PREPPED_ATTR + '="1"]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cb = row.querySelector('[' + CHECKBOX_ATTR + '="1"]');
      if (cb && cb.parentNode) cb.parentNode.removeChild(cb);
      row.removeAttribute(ROW_PREPPED_ATTR);
      row.classList.remove(SELECTED_CLASS);
    }
  }

  function startCheckboxObserver() {
    if (state.observer) return;
    var doc = (global.document) || null;
    if (!doc || typeof global.MutationObserver !== 'function') return;
    /* IMPORTANT: this observer watches the STUDIO body for newly-rendered
     * chat rows. It is NOT pointed at chatgpt.com. The selector is
     * the Studio-internal .wbChatRow class. No ChatGPT DOM is touched. */
    state.observer = new global.MutationObserver(function () {
      try { injectCheckboxesIntoAllRows(); } catch (e) { pushError('observer.inject', e); }
    });
    state.observer.observe(doc.body || doc.documentElement, {
      childList: true, subtree: true,
    });
    /* Initial pass for rows already in the DOM. */
    injectCheckboxesIntoAllRows();
  }

  function stopCheckboxObserver() {
    if (state.observer) {
      try { state.observer.disconnect(); } catch (_) { /* swallow */ }
    }
    state.observer = null;
    removeAllInjectedCheckboxes();
  }

  /* ── Click delegation ─────────────────────────────────────────────── */
  function findChatRowAncestor(target) {
    if (!target) return null;
    var doc = (global.document) || null;
    if (!doc) return null;
    var el = target;
    while (el && el !== doc.body) {
      if (el.matches && el.matches(ROW_SELECTOR)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function handleRowClick(ev) {
    if (!state.enabled) return;
    var target = ev.target;
    if (!target) return;
    /* Click directly on injected checkbox — always toggle selection. */
    var cb = target.closest ? target.closest('[' + CHECKBOX_ATTR + '="1"]') : null;
    if (cb) {
      var cbId = cb.getAttribute('data-h2o-chat-id');
      ev.preventDefault();
      ev.stopPropagation();
      if (state.selection[cbId]) selectionRemove(cbId);
      else                       selectionAdd(cbId);
      return;
    }
    /* Modifier-clicks on chat rows. Plain click stays default (existing
     * row navigation). */
    var row = findChatRowAncestor(target);
    if (!row) return;
    var chatId = row.getAttribute('data-chatId');
    if (!chatId) return;
    if (ev.shiftKey) {
      ev.preventDefault();
      ev.stopPropagation();
      selectionRange(chatId);
      return;
    }
    if (ev.metaKey || ev.ctrlKey) {
      ev.preventDefault();
      ev.stopPropagation();
      if (state.selection[chatId]) selectionRemove(chatId);
      else                         selectionAdd(chatId);
      return;
    }
    /* Plain click — leave default (row navigates). Update lastAnchor so
     * subsequent Shift+click has a basis. */
    state.lastAnchor = chatId;
  }

  function installRowClickDelegation() {
    if (state.clickHandler) return;
    var doc = (global.document) || null;
    if (!doc) return;
    state.clickHandler = handleRowClick;
    /* Use capture phase so we get the event before the row's own anchor
     * navigation handlers (we only preventDefault when modifiers fire). */
    doc.addEventListener('click', state.clickHandler, true);
  }

  function uninstallRowClickDelegation() {
    if (!state.clickHandler) return;
    var doc = (global.document) || null;
    if (doc) {
      try { doc.removeEventListener('click', state.clickHandler, true); } catch (_) { /* swallow */ }
    }
    state.clickHandler = null;
  }

  /* ── Action execution ─────────────────────────────────────────────── */
  async function handleAction(opName) {
    var op = cleanString(opName);
    if (op === 'clear') {
      var prev = selectionClear();
      state.lastOp = 'clear';
      state.lastOpStatus = 'ok';
      state.lastOpAt = Date.now();
      state.lastOpCount = prev;
      state.opsSinceBoot += 1;
      return { ok: true, op: 'clear', cleared: prev };
    }
    /* R4.5.4 review fix #1 — reject concurrent batch ops to keep the
     * final-refresh dispatches scoped to their own batch. Without this,
     * two rapid back-to-back button clicks could cause the second
     * batch's final refresh to fire before the first batch's per-chat
     * writes settle, violating the "one refresh after Promise.all
     * settles" contract per operation. */
    if (state.opInProgress) {
      state.lastOp = op;
      state.lastOpStatus = 'op-in-progress';
      state.lastOpAt = Date.now();
      state.opsSinceBoot += 1;
      return { ok: false, op: op, status: 'op-in-progress' };
    }
    var ids = selectionAll();
    if (ids.length === 0) {
      state.lastOp = op;
      state.lastOpStatus = 'no-selection';
      state.lastOpAt = Date.now();
      state.opsSinceBoot += 1;
      return { ok: false, op: op, status: 'no-selection' };
    }
    var actions = getLibraryActions();
    if (!actions) {
      state.lastOp = op;
      state.lastOpStatus = 'library-actions-unavailable';
      state.lastOpAt = Date.now();
      state.opsSinceBoot += 1;
      return { ok: false, op: op, status: 'library-actions-unavailable' };
    }
    var promptText, optionKey, optionsBase, fnName;
    if (op === 'setFolder')        { promptText = 'Folder ID (empty to clear):';   optionKey = 'folderId';   fnName = 'setFolder'; }
    else if (op === 'setCategory') { promptText = 'Category ID (empty to clear):'; optionKey = 'categoryId'; fnName = 'setCategory'; }
    else if (op === 'addLabel')    { promptText = 'Label ID to add:';              optionKey = 'labelId';    fnName = 'addLabel'; }
    else if (op === 'addTag')      { promptText = 'Tag ID to add:';                optionKey = 'tagId';      fnName = 'addTag'; }
    else {
      state.lastOp = op;
      state.lastOpStatus = 'unsupported-op';
      state.lastOpAt = Date.now();
      state.opsSinceBoot += 1;
      return { ok: false, op: op, status: 'unsupported-op' };
    }
    var typed = safePrompt(promptText + '\n\n' + ids.length + ' chats selected.', '');
    if (typed === null) {
      state.lastOp = op;
      state.lastOpStatus = 'cancelled';
      state.lastOpAt = Date.now();
      state.opsSinceBoot += 1;
      return { ok: false, op: op, status: 'cancelled' };
    }
    var targetValue = cleanString(typed);
    if (typeof actions[fnName] !== 'function') {
      state.lastOp = op;
      state.lastOpStatus = 'facade-method-missing';
      state.lastOpAt = Date.now();
      state.opsSinceBoot += 1;
      return { ok: false, op: op, status: 'facade-method-missing' };
    }
    optionsBase = { source: 'batch-toolbar' };
    optionsBase[optionKey] = targetValue;
    /* Set the in-progress guard. We use try/finally below to guarantee
     * it gets cleared even if Promise.all somehow throws (it shouldn't
     * — each per-chat call is wrapped in .catch — but the guard pattern
     * stays robust). */
    state.opInProgress = true;
    var results, okCount = 0, errCount = 0, finalStatus = 'ok';
    try {
      /* Fan-out via Promise.all. Each call returns its own result; we
       * tolerate per-chat failures and report aggregate. */
      results = await Promise.all(ids.map(function (chatId) {
        var target = { chatId: chatId };
        try {
          var p = actions[fnName](target, optionsBase);
          return Promise.resolve(p).then(function (r) {
            return { ok: !!(r && r.ok), chatId: chatId, result: r };
          }).catch(function (e) {
            pushError(op + ':per-chat', e);
            return { ok: false, chatId: chatId, error: String((e && e.message) || e) };
          });
        } catch (e) {
          pushError(op + ':sync', e);
          return Promise.resolve({ ok: false, chatId: chatId, error: String((e && e.message) || e) });
        }
      }));
      /* AFTER all fan-out resolves, dispatch ONE explicit refresh with
       * batch-toolbar reason. Even if all per-action refreshes collapsed
       * via the S0F1c in-flight guard, this final dispatch guarantees
       * the LibraryIndex re-reads after the last write. */
      dispatchBatchRefresh(op + ':' + ids.length);
      for (var i = 0; i < results.length; i++) {
        if (results[i].ok) okCount += 1;
        else errCount += 1;
      }
      finalStatus = errCount === 0 ? 'ok' : (okCount === 0 ? 'all-failed' : 'partial');
    } finally {
      /* Release the guard so the next batch op can run. */
      state.opInProgress = false;
    }
    state.lastOp = op;
    state.lastOpStatus = finalStatus;
    state.lastOpAt = Date.now();
    state.lastOpCount = ids.length;
    state.opsSinceBoot += 1;
    return {
      ok: errCount === 0,
      op: op,
      status: state.lastOpStatus,
      count: ids.length,
      okCount: okCount,
      errCount: errCount,
      results: results,
    };
  }

  /* ── Public: enable / disable ─────────────────────────────────────── */
  function enable() {
    if (state.enabled) return false;
    state.enabled = true;
    try { mountToolbar(); } catch (e) { pushError('enable:mountToolbar', e); }
    try { installRowClickDelegation(); } catch (e) { pushError('enable:installRowClickDelegation', e); }
    try { startCheckboxObserver(); } catch (e) { pushError('enable:startCheckboxObserver', e); }
    updateToolbarDisplay();
    return true;
  }
  function disable() {
    if (!state.enabled) return false;
    state.enabled = false;
    try { stopCheckboxObserver(); } catch (e) { pushError('disable:stopCheckboxObserver', e); }
    try { uninstallRowClickDelegation(); } catch (e) { pushError('disable:uninstallRowClickDelegation', e); }
    try { unmountToolbar(); } catch (e) { pushError('disable:unmountToolbar', e); }
    selectionClear();
    return true;
  }
  function isEnabled() { return state.enabled; }

  /* ── Public: diagnose ─────────────────────────────────────────────── */
  function diagnose() {
    return {
      installed: true,
      phase: PHASE,
      installedAt: state.installedAt,
      installedAtIso: (function () { try { return new Date(state.installedAt).toISOString(); } catch (_) { return ''; } })(),
      enabled: state.enabled,
      selectionSize: state.selectionCount,
      selection: selectionAll(),
      lastAnchor: state.lastAnchor,
      opsSinceBoot: state.opsSinceBoot,
      lastOp: state.lastOp,
      lastOpStatus: state.lastOpStatus,
      lastOpCount: state.lastOpCount,
      lastOpAt: state.lastOpAt,
      refreshesDispatched: state.refreshesDispatched,
      refreshEvent: REFRESH_EVENT,
      refreshStrategy: 'natural-collapse-via-S0F1c-in-flight-guard + one-final-batch-toolbar-refresh',
      opInProgress: state.opInProgress,
      rowSelector: ROW_SELECTOR,
      libraryActionsAvailable: !!getLibraryActions(),
      domAccess: false,           /* No ChatGPT DOM observation. */
      observesChatGptDom: false,  /* Studio-internal .wbChatRow only. */
      tagExtraction: false,       /* No extraction; toolbar is catalog ops only. */
      errors: state.errors.slice(),
    };
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  H2O.Studio.BatchToolbar = {
    __installed: true,
    __version: '0.1.0',
    selection: {
      add:    selectionAdd,
      remove: selectionRemove,
      clear:  selectionClear,
      has:    selectionHas,
      size:   selectionSize,
      all:    selectionAll,
    },
    enable:    enable,
    disable:   disable,
    isEnabled: isEnabled,
    diagnose:  diagnose,
  };
})(typeof window !== 'undefined' ? window : globalThis);
