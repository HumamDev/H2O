/* H2O Studio — Dock Tab: Context (Phase 2C-C, read-only rendering)
 *
 * Phase 2C-C: Third real-data Dock tab. Renders context items from
 * H2O.Studio.store.context as a read-only flat list, scoped to the
 * active reader's chat id.
 *
 * Read-only contract (V1):
 *   - Reads via H2O.Studio.store.context.getBundle(chatId)  (sync, lazy-
 *     fetch behind cache; first read may return nulls then notify via
 *     subscribe()).
 *   - Subscribes via H2O.Studio.store.context.subscribe(fn) for live
 *     refresh; returns the unsubscribe to dock-shell via the render()
 *     return value (shell honors this at renderActiveView:cleanup and
 *     unmount:activeRenderCleanup).
 *   - Never calls set / update / remove / saveNow / insert / promote /
 *     demote or any other write API.
 *   - Never mutates the items array returned by the store.
 *   - Never scrolls the reader, never touches the native runtime.
 *   - No item creation / deletion / editing / promotion / insertion in
 *     this phase.
 *
 * Native item shape mirrored from src-runtime-base/3W1a (Context Engine,
 * ITEM_fromStore at line 463-482):
 *   {
 *     id:        string,
 *     title:     string,
 *     text:      string,
 *     tags:      string[],
 *     profile:   string,
 *     active:    boolean,    // default true
 *     pinned:    boolean,    // default false
 *     order:     number,     // manual sort key
 *     scope:     string,
 *     createdAt: number,
 *     updatedAt: number,
 *     source:    { kind: 'notes'|'highlights'|'bookmarks'|..., id: string, ... }
 *   }
 *
 * Chat-id fallback:
 *   The store façade already mirrors native's 'unknown' fallback. This
 *   tab does NOT invent IDs — if ctx provides no chatId/externalId/
 *   snapshotId, the tab renders the linked-chat empty state instead.
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:220 (DPANEL_RAIL_ITEMS[5]).
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

  function resolveChatId(ctx) {
    if (!ctx || typeof ctx !== 'object') return '';
    const candidates = [ctx.chatId, ctx.externalId, ctx.snapshotId];
    for (let i = 0; i < candidates.length; i += 1) {
      const v = candidates[i];
      if (typeof v === 'string' && v) return v;
    }
    return '';
  }

  function firstLine(s) {
    const str = String(s || '');
    const nl = str.indexOf('\n');
    return nl < 0 ? str : str.slice(0, nl);
  }

  function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function truncate(s, max) {
    const str = String(s || '');
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trimEnd() + '…';
  }

  function formatTs(ts) {
    if (typeof ts !== 'number' || !isFinite(ts) || ts <= 0) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch (_) { return ''; }
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* Items may be stored as Array | null | undefined | non-array. Always
   * return an Array. Filter out entries that aren't plain objects. */
  function normalizeItems(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (let i = 0; i < raw.length; i += 1) {
      const x = raw[i];
      if (x && typeof x === 'object') out.push(x);
    }
    return out;
  }

  /* Manual sort by `order` ascending, mirroring native ITEM_sort's
   * default. Stable: preserves store order on ties / missing `order`. */
  function sortForDisplay(items) {
    const indexed = items.map(function (e, i) { return { e: e, i: i }; });
    indexed.sort(function (a, b) {
      const ao = (a.e && typeof a.e.order === 'number' && isFinite(a.e.order)) ? a.e.order : Infinity;
      const bo = (b.e && typeof b.e.order === 'number' && isFinite(b.e.order)) ? b.e.order : Infinity;
      if (ao !== bo) return ao - bo;
      return a.i - b.i;
    });
    return indexed.map(function (x) { return x.e; });
  }

  function deriveTitle(item) {
    const t = normalizeText(item.title);
    if (t) return t;
    const head = normalizeText(firstLine(item.text));
    return head || '(untitled context item)';
  }

  function deriveSnippet(item) {
    const t = normalizeText(item.text);
    if (!t) return '';
    if (item.title && normalizeText(item.title) === t) return '';
    return t;
  }

  function deriveSourceLabel(item) {
    const src = item && item.source;
    if (!src || typeof src !== 'object') return '';
    const kind = typeof src.kind === 'string' ? src.kind.trim() : '';
    if (!kind) return '';
    const id = typeof src.id === 'string' ? src.id.trim() : '';
    return id ? (kind + ' ' + truncate(id, 16)) : kind;
  }

  function renderError(container, msg) {
    try {
      clearChildren(container);
      const box = document.createElement('div');
      box.className = 'wbDockError';
      box.textContent = msg || 'Could not load Context.';
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

  /* Optional top-of-list summary line (item / history counts). Rendered
   * inside its own div so it sits above the list. */
  function buildSummary(itemsLen, historyLen) {
    const parts = [];
    parts.push(itemsLen === 1 ? '1 item' : itemsLen + ' items');
    if (historyLen > 0) {
      parts.push(historyLen === 1 ? '1 history entry' : historyLen + ' history entries');
    }
    const el = document.createElement('div');
    el.className = 'wbDockMeta';
    el.textContent = parts.join(' • ');
    return el;
  }

  function renderList(container, items, historyLen) {
    clearChildren(container);

    container.appendChild(buildSummary(items.length, historyLen));

    const list = document.createElement('ul');
    list.className = 'wbDockList';
    list.setAttribute('role', 'list');

    const sorted = sortForDisplay(items);
    for (let i = 0; i < sorted.length; i += 1) {
      const item = sorted[i];

      const li = document.createElement('li');
      li.className = 'wbDockRow';
      const rowKey = String(item.id || i);
      li.setAttribute('data-row-key', rowKey);

      const body = document.createElement('div');
      body.className = 'wbDockRowBody';

      const titleEl = document.createElement('div');
      titleEl.className = 'wbDockRowText';
      titleEl.textContent = truncate(deriveTitle(item), 240);
      body.appendChild(titleEl);

      const snippet = deriveSnippet(item);
      if (snippet) {
        const snipEl = document.createElement('div');
        snipEl.className = 'wbDockMeta';
        snipEl.textContent = truncate(snippet, 320);
        body.appendChild(snipEl);
      }

      const metaParts = [];
      const srcLabel = deriveSourceLabel(item);
      if (srcLabel) metaParts.push(srcLabel);
      if (item.id) metaParts.push('id ' + truncate(String(item.id), 16));
      if (item.pinned) metaParts.push('pinned');
      if (item.active === false) metaParts.push('inactive');
      const tsRaw = (typeof item.updatedAt === 'number' && isFinite(item.updatedAt) && item.updatedAt > 0)
        ? item.updatedAt
        : item.createdAt;
      const ts = formatTs(tsRaw);
      if (ts) metaParts.push(ts);
      if (metaParts.length) {
        const metaEl = document.createElement('div');
        metaEl.className = 'wbDockMeta';
        metaEl.textContent = metaParts.join(' • ');
        body.appendChild(metaEl);
      }

      li.appendChild(body);
      list.appendChild(li);
    }
    container.appendChild(list);
  }

  dock.registerTab('context', {
    id: 'context',
    title: 'Context',
    icon: '🧠',
    txt: 'C',
    color: '#6740A8',
    order: 60,
    disabled: false,
    phase: '2c-read-only',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;

      const store = H2O.Studio && H2O.Studio.store;
      const cxStore = store && store.context;
      if (!cxStore || typeof cxStore.getBundle !== 'function') {
        renderError(container, 'Context store is unavailable.');
        return;
      }

      const chatId = resolveChatId(ctx);
      if (!chatId) {
        renderEmpty(container, 'Open a linked chat/snapshot to view context.');
        return;
      }

      function paint() {
        try {
          const bundle = cxStore.getBundle(chatId);
          const items = normalizeItems(bundle && bundle.items);
          const historyLen = Array.isArray(bundle && bundle.history) ? bundle.history.length : 0;
          if (!items.length) {
            renderEmpty(container, 'No context items found for this chat yet.');
          } else {
            renderList(container, items, historyLen);
          }
        } catch (_) {
          renderError(container, 'Failed to render Context.');
        }
      }

      paint();

      let unsub = null;
      if (typeof cxStore.subscribe === 'function') {
        try {
          unsub = cxStore.subscribe(function (evt) {
            /* Filter to the current chat. Meta-key events have no
             * chatId (singleton) — accept those too so a meta update
             * also triggers a repaint. */
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
