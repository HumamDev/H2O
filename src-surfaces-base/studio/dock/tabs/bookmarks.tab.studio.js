/* H2O Studio — Dock Tab: Bookmarks (Phase 2C-B, read-only rendering)
 *
 * Phase 2C-B: Second real-data Dock tab. Renders bookmark entries from
 * H2O.Studio.store.bookmarks as a read-only flat list, scoped to the
 * active reader's chat id.
 *
 * Read-only contract (V1):
 *   - Reads via H2O.Studio.store.bookmarks.list(chatId)  (sync, lazy-fetch
 *     behind cache; first read may return [] then notify via subscribe()).
 *   - Subscribes via H2O.Studio.store.bookmarks.subscribe(fn) for live
 *     refresh; the returned unsubscribe is handed back to dock-shell via
 *     the render() return value (shell honors this at
 *     renderActiveView:cleanup and unmount:activeRenderCleanup).
 *   - Never calls set / update / remove / saveNow or any other write API.
 *   - Never mutates the entries array returned by list().
 *   - Never scrolls the reader, never touches the native runtime.
 *   - No bookmark creation / deletion / editing / toggling in this phase.
 *
 * Native blob shape mirrored from src-runtime-base/3B1a (Bookmarks Engine):
 *   Array<{
 *     msgId:       string,
 *     primaryAId?: string,
 *     pairNo?:     number,
 *     snapText?:   string,
 *     title?:      string,
 *     turnNo?:     number,
 *     role?:       string,
 *     createdAt?:  number,
 *   }>
 *
 * Chat-id fallback:
 *   The store façade already mirrors native's STR.chatUnknown = 'unknown'
 *   fallback (see src-surfaces-base/studio/store/bookmarks.js:13-15).
 *   This tab does NOT invent IDs — if ctx provides no chatId/externalId/
 *   snapshotId, the tab renders the linked-chat empty state instead.
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:216 (DPANEL_RAIL_ITEMS[1]).
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

  function truncate(s, max) {
    const str = String(s || '');
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trimEnd() + '…';
  }

  function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
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

  function deriveTitle(entry) {
    if (entry.title && String(entry.title).trim()) {
      return normalizeText(entry.title);
    }
    const head = normalizeText(firstLine(entry.snapText));
    return head || '(untitled bookmark)';
  }

  function deriveSnippet(entry) {
    const txt = normalizeText(entry.snapText);
    if (!txt) return '';
    const head = normalizeText(firstLine(entry.snapText));
    /* If title already shows the first line, prefer the rest as snippet. */
    if (entry.title && String(entry.title).trim()) return txt;
    if (txt === head) return '';
    return txt;
  }

  /* Stable display sort: newest first.
   *   1. createdAt descending if present
   *   2. pairNo descending if present
   *   3. preserve store order */
  function sortForDisplay(entries) {
    const indexed = entries.map(function (e, i) { return { e: e, i: i }; });
    indexed.sort(function (a, b) {
      const ac = (a.e && typeof a.e.createdAt === 'number' && isFinite(a.e.createdAt)) ? a.e.createdAt : null;
      const bc = (b.e && typeof b.e.createdAt === 'number' && isFinite(b.e.createdAt)) ? b.e.createdAt : null;
      if (ac != null && bc != null && ac !== bc) return bc - ac;
      const ap = (a.e && typeof a.e.pairNo === 'number' && isFinite(a.e.pairNo)) ? a.e.pairNo : null;
      const bp = (b.e && typeof b.e.pairNo === 'number' && isFinite(b.e.pairNo)) ? b.e.pairNo : null;
      if (ap != null && bp != null && ap !== bp) return bp - ap;
      return a.i - b.i;
    });
    return indexed.map(function (x) { return x.e; });
  }

  function renderError(container, msg) {
    try {
      clearChildren(container);
      const box = document.createElement('div');
      box.className = 'wbDockError';
      box.textContent = msg || 'Could not load Bookmarks.';
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

  function renderList(container, entries) {
    clearChildren(container);
    const list = document.createElement('ul');
    list.className = 'wbDockList';
    list.setAttribute('role', 'list');

    const sorted = sortForDisplay(entries);
    for (let i = 0; i < sorted.length; i += 1) {
      const entry = sorted[i];
      if (!entry || typeof entry !== 'object') continue;

      const li = document.createElement('li');
      li.className = 'wbDockRow';
      const rowKey = String(entry.msgId || entry.primaryAId || i);
      li.setAttribute('data-row-key', rowKey);

      const body = document.createElement('div');
      body.className = 'wbDockRowBody';

      const titleEl = document.createElement('div');
      titleEl.className = 'wbDockRowText';
      titleEl.textContent = truncate(deriveTitle(entry), 240);
      body.appendChild(titleEl);

      const snippet = deriveSnippet(entry);
      if (snippet) {
        const snipEl = document.createElement('div');
        snipEl.className = 'wbDockMeta';
        snipEl.textContent = truncate(snippet, 320);
        body.appendChild(snipEl);
      }

      const metaParts = [];
      const idLabel = entry.msgId || entry.primaryAId || '';
      if (idLabel) metaParts.push('msg ' + truncate(String(idLabel), 16));
      if (typeof entry.pairNo === 'number' && isFinite(entry.pairNo)) {
        metaParts.push('pair ' + entry.pairNo);
      }
      const ts = formatTs(entry.createdAt);
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

  dock.registerTab('bookmarks', {
    id: 'bookmarks',
    title: 'Bookmarks',
    icon: '⭐',
    txt: 'B',
    color: '#2C7A4A',
    order: 20,
    disabled: false,
    phase: '2c-read-only',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;

      const store = H2O.Studio && H2O.Studio.store;
      const bkStore = store && store.bookmarks;
      if (!bkStore || typeof bkStore.list !== 'function') {
        renderError(container, 'Bookmarks store is unavailable.');
        return;
      }

      const chatId = resolveChatId(ctx);
      if (!chatId) {
        renderEmpty(container, 'Open a linked chat/snapshot to view bookmarks.');
        return;
      }

      function paint() {
        try {
          const entries = bkStore.list(chatId);
          const arr = Array.isArray(entries) ? entries : [];
          if (!arr.length) {
            renderEmpty(container, 'No bookmarks found for this chat yet.');
          } else {
            renderList(container, arr);
          }
        } catch (_) {
          renderError(container, 'Failed to render Bookmarks.');
        }
      }

      paint();

      let unsub = null;
      if (typeof bkStore.subscribe === 'function') {
        try {
          unsub = bkStore.subscribe(function (evt) {
            /* Filter to the current chat. The store already filters out
             * non-bookmark keys; here we additionally drop notifications
             * for other chats so we don't repaint on unrelated changes. */
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
