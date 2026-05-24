/* H2O Studio — Dock Tab: Navigator (Phase 2C-V, read-only rendering)
 *
 * Phase 2C-V: Fifth real-data Dock tab. Renders the per-chat Navigator
 * state from H2O.Studio.store.navigator as three read-only sections:
 * Pinned / Aliases / Collapsed. Scoped to the active reader's chat id.
 *
 * Read-only contract (V1):
 *   - Reads via H2O.Studio.store.navigator.getState(chatId) +
 *     listPinned(chatId) + listAliases(chatId) + listCollapsed(chatId)
 *     (all sync; lazy-fetch behind cache; first read may return empties
 *     then notify via subscribe()).
 *   - Subscribes via H2O.Studio.store.navigator.subscribe(fn) for live
 *     refresh; returns the unsubscribe to dock-shell via the render()
 *     return value (shell honors this at renderActiveView:cleanup and
 *     unmount:activeRenderCleanup).
 *   - Never calls set / update / remove / saveNow or any other write
 *     API. Never mutates the arrays/maps returned by the store.
 *   - Never scrolls the reader, never jumps to a turn, never derives a
 *     turn outline from DOM. No pin/unpin/alias/rename/collapse/expand
 *     editing in this phase.
 *
 * Native blob shape mirrored from src-runtime-base/3V1a (Navigator
 * Engine, store façade docstring at navigator.js:19-26):
 *   {
 *     pins:      Array<{ turnId: string, kind: 'question'|'answer', answerId?: string }>,
 *     aliases:   { [turnId | 'turnId::a:answerId']: string },
 *     collapsed: { [turnId]: boolean }
 *   }
 *
 * Notes on shape:
 *   - Pin entries preserve native shape verbatim. `kind: 'answer'`
 *     entries carry an `answerId` so the rendered row can show it.
 *   - Alias keys may include `::a:<answerId>` to disambiguate per-
 *     answer aliases. This tab preserves the raw key verbatim in the
 *     row's data attribute and additionally surfaces the parsed
 *     answer-id in the meta line when present.
 *   - The native engine may store `collapsed[turnId] = false` after a
 *     toggle. The store's listCollapsed() already filters to truthy
 *     values, so this tab just renders whatever the list returns.
 *
 * Chat-id fallback:
 *   The store façade mirrors native's 'unknown' fallback. This tab
 *   does NOT invent IDs — if ctx provides no chatId/externalId/
 *   snapshotId, the tab renders the linked-chat empty state instead.
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:219 (DPANEL_RAIL_ITEMS[4]).
 *
 * Contracts:
 *   docs/contracts/studio-dock-tab-registration.md
 *   src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md
 *   src-surfaces-base/studio/dock/README.md
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  const dock = H2O.Studio.dock;
  if (!dock || typeof dock.registerTab !== 'function') return;

  /* Per-answer alias keys use this delimiter (see navigator.js:24). We
   * neither generate nor mutate them here — only parse for display. */
  const ALIAS_ANSWER_DELIM = '::a:';

  function resolveChatId(ctx) {
    if (!ctx || typeof ctx !== 'object') return '';
    const candidates = [ctx.chatId, ctx.externalId, ctx.snapshotId];
    for (let i = 0; i < candidates.length; i += 1) {
      const v = candidates[i];
      if (typeof v === 'string' && v) return v;
    }
    return '';
  }

  function truncate(s, max) {
    const str = String(s || '');
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trimEnd() + '…';
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function normalizeArray(v) {
    return Array.isArray(v) ? v : [];
  }

  /* Split a raw alias key into { turnId, answerId | null }. Preserves
   * the raw key for display fallback / debugging. */
  function parseAliasKey(rawKey) {
    const key = String(rawKey == null ? '' : rawKey);
    const idx = key.indexOf(ALIAS_ANSWER_DELIM);
    if (idx < 0) return { turnId: key, answerId: null, raw: key };
    return {
      turnId: key.slice(0, idx),
      answerId: key.slice(idx + ALIAS_ANSWER_DELIM.length),
      raw: key,
    };
  }

  function renderError(container, msg) {
    try {
      clearChildren(container);
      const box = document.createElement('div');
      box.className = 'wbDockError';
      box.textContent = msg || 'Could not load Navigator.';
      container.appendChild(box);
    } catch (_) { /* swallow */ }
  }

  function renderEmpty(container, text) {
    clearChildren(container);
    const box = document.createElement('div');
    box.className = 'wbDockEmpty';
    box.textContent = text;
    container.appendChild(box);
  }

  function buildSummary(pinnedLen, aliasLen, collapsedLen) {
    const el = document.createElement('div');
    el.className = 'wbDockMeta';
    el.textContent = pinnedLen + ' pinned • ' + aliasLen + ' aliases • ' + collapsedLen + ' collapsed';
    return el;
  }

  function buildSectionHeader(title, count) {
    const el = document.createElement('div');
    el.className = 'wbDockRowText';
    el.textContent = count > 0 ? (title + ' (' + count + ')') : title;
    return el;
  }

  function buildEmptyRow(text) {
    const li = document.createElement('li');
    li.className = 'wbDockRow';
    const body = document.createElement('div');
    body.className = 'wbDockRowBody';
    const meta = document.createElement('div');
    meta.className = 'wbDockMeta';
    meta.textContent = text;
    body.appendChild(meta);
    li.appendChild(body);
    return li;
  }

  function buildPinRow(entry, i) {
    const li = document.createElement('li');
    li.className = 'wbDockRow';
    const rowKey = String((entry && entry.turnId) || i);
    li.setAttribute('data-row-key', rowKey);

    const body = document.createElement('div');
    body.className = 'wbDockRowBody';

    const turnId = (entry && typeof entry.turnId === 'string') ? entry.turnId : '';
    const kind = (entry && typeof entry.kind === 'string') ? entry.kind : '';
    const answerId = (entry && typeof entry.answerId === 'string') ? entry.answerId : '';

    const textEl = document.createElement('div');
    textEl.className = 'wbDockRowText';
    textEl.textContent = turnId ? ('turn ' + truncate(turnId, 24)) : '(unknown turn)';
    body.appendChild(textEl);

    const metaParts = [];
    if (kind) metaParts.push(kind);
    if (answerId) metaParts.push('answer ' + truncate(answerId, 24));
    if (metaParts.length) {
      const metaEl = document.createElement('div');
      metaEl.className = 'wbDockMeta';
      metaEl.textContent = metaParts.join(' • ');
      body.appendChild(metaEl);
    }

    li.appendChild(body);
    return li;
  }

  function buildAliasRow(entry, i) {
    const li = document.createElement('li');
    li.className = 'wbDockRow';
    const rowKey = (entry && entry.key) ? String(entry.key) : String(i);
    li.setAttribute('data-row-key', rowKey);

    const body = document.createElement('div');
    body.className = 'wbDockRowBody';

    const parsed = parseAliasKey(entry && entry.key);
    const value = (entry && typeof entry.value === 'string') ? entry.value : '';

    const textEl = document.createElement('div');
    textEl.className = 'wbDockRowText';
    textEl.textContent = value ? truncate(value, 240) : '(empty alias)';
    body.appendChild(textEl);

    const metaParts = [];
    if (parsed.turnId) metaParts.push('turn ' + truncate(parsed.turnId, 24));
    if (parsed.answerId) metaParts.push('answer ' + truncate(parsed.answerId, 24));
    if (metaParts.length) {
      const metaEl = document.createElement('div');
      metaEl.className = 'wbDockMeta';
      metaEl.textContent = metaParts.join(' • ');
      body.appendChild(metaEl);
    }

    li.appendChild(body);
    return li;
  }

  function buildCollapsedRow(entry, i) {
    const li = document.createElement('li');
    li.className = 'wbDockRow';
    const turnId = (entry && typeof entry.turnId === 'string') ? entry.turnId : '';
    const rowKey = turnId || String(i);
    li.setAttribute('data-row-key', rowKey);

    const body = document.createElement('div');
    body.className = 'wbDockRowBody';

    const textEl = document.createElement('div');
    textEl.className = 'wbDockRowText';
    textEl.textContent = turnId ? ('turn ' + truncate(turnId, 24)) : '(unknown turn)';
    body.appendChild(textEl);

    li.appendChild(body);
    return li;
  }

  function buildSection(title, items, rowBuilder, emptyText) {
    const header = buildSectionHeader(title, items.length);
    const list = document.createElement('ul');
    list.className = 'wbDockList';
    list.setAttribute('role', 'list');
    if (!items.length) {
      list.appendChild(buildEmptyRow(emptyText));
    } else {
      for (let i = 0; i < items.length; i += 1) {
        list.appendChild(rowBuilder(items[i], i));
      }
    }
    return { header: header, list: list };
  }

  function renderSections(container, pinned, aliases, collapsed) {
    clearChildren(container);

    container.appendChild(buildSummary(pinned.length, aliases.length, collapsed.length));

    const pinSec = buildSection('Pinned', pinned, buildPinRow, 'No pinned turns.');
    container.appendChild(pinSec.header);
    container.appendChild(pinSec.list);

    const aliasSec = buildSection('Aliases', aliases, buildAliasRow, 'No aliases.');
    container.appendChild(aliasSec.header);
    container.appendChild(aliasSec.list);

    const collSec = buildSection('Collapsed', collapsed, buildCollapsedRow, 'No collapsed turns.');
    container.appendChild(collSec.header);
    container.appendChild(collSec.list);
  }

  dock.registerTab('navigator', {
    id: 'navigator',
    title: 'Navigator',
    icon: '🧭',
    txt: 'V',
    color: '#D47A38',
    order: 50,
    disabled: false,
    phase: '2c-read-only',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;

      const store = H2O.Studio && H2O.Studio.store;
      const nvStore = store && store.navigator;
      if (!nvStore || typeof nvStore.getState !== 'function') {
        renderError(container, 'Navigator store is unavailable.');
        return;
      }

      const chatId = resolveChatId(ctx);
      if (!chatId) {
        renderEmpty(container, 'Open a linked chat/snapshot to view navigator state.');
        return;
      }

      function paint() {
        try {
          const state = nvStore.getState(chatId);
          const pinned = typeof nvStore.listPinned === 'function'
            ? normalizeArray(nvStore.listPinned(chatId))
            : [];
          const aliases = typeof nvStore.listAliases === 'function'
            ? normalizeArray(nvStore.listAliases(chatId))
            : [];
          const collapsed = typeof nvStore.listCollapsed === 'function'
            ? normalizeArray(nvStore.listCollapsed(chatId))
            : [];

          const totallyEmpty = !pinned.length && !aliases.length && !collapsed.length
            && !(state && state.found);
          if (totallyEmpty) {
            renderEmpty(container, 'No navigator state found for this chat yet.');
          } else {
            renderSections(container, pinned, aliases, collapsed);
          }
        } catch (_) {
          renderError(container, 'Failed to render Navigator.');
        }
      }

      paint();

      let unsub = null;
      if (typeof nvStore.subscribe === 'function') {
        try {
          unsub = nvStore.subscribe(function (evt) {
            /* The store filters non-navigator keys already. Drop events
             * for other chats so unrelated changes don't repaint. */
            if (evt && typeof evt === 'object' && evt.chatId && evt.chatId !== chatId) return;
            paint();
          });
        } catch (_) { unsub = null; }
      }

      return function cleanup() {
        if (typeof unsub === 'function') {
          try { unsub(); } catch (_) { /* swallow */ }
          unsub = null;
        }
      };
    },
  });
})(globalThis);
