/* H2O Studio — Dock Tab: Capture Box (Phase 2C-P, read-only / inert in V1)
 *
 * Phase 2C-P: Seventh real-data Dock tab. Renders the per-chat Capture
 * items from H2O.Studio.store.capture as a read-only flat list. Per
 * STUDIO_DOCK_PANEL_CONTRACT.md, Capture remains INERT in Studio V1:
 * Studio reads the items the native Capture Engine wrote but does NOT
 * surface any mutation, conversion, archiving, or live-selection path.
 *
 * Read-only contract (V1):
 *   - Reads via H2O.Studio.store.capture.getBundle(chatId)  (sync,
 *     lazy-fetch behind cache; first read may return null for either
 *     sub-key and notify via subscribe() when the platform fetch
 *     resolves).
 *   - Subscribes via H2O.Studio.store.capture.subscribe(fn) for live
 *     refresh; returns the unsubscribe to dock-shell via the render()
 *     return value (shell honors this at renderActiveView:cleanup and
 *     unmount:activeRenderCleanup).
 *   - Never calls set / update / remove / saveNow / convert / archive /
 *     dismiss / review / create / any other write API. Never mutates
 *     the items array or store/ui blobs returned by the store.
 *   - Never opens a window, never copies to clipboard, never fetches,
 *     never starts a MutationObserver / interval, never installs a
 *     selection handler, never scrolls the reader, never touches the
 *     native runtime.
 *   - No buttons / actions that imply capture / conversion / delete /
 *     archive / dismiss / open / copy / download.
 *   - The inert-V1 notice is rendered first on every render, regardless
 *     of whether there are items, so the user always sees that Studio
 *     does NOT mutate Capture.
 *
 * Native item shape mirrored from src-runtime-base/3X1a (Capture
 * Engine; store façade docstring at capture.js:35-51):
 *   {
 *     id:               string,           // 'cap-…'
 *     chatId:           string,
 *     kind:             string,           // default 'text'
 *     text:             string,
 *     title:            string,
 *     source:           { msgId?, role?, … },
 *     routeSuggestion:  string,
 *     status:           string,           // 'new'|'reviewed'|'archived'|'converted'|…
 *     tags:             string[],
 *     pinned:           boolean,
 *     createdAt:        number,
 *     updatedAt:        number,
 *     reviewedAt:       number,
 *     convertedTo:      any | null,
 *     dismissed:        boolean,
 *   }
 *
 * Chat-id fallback:
 *   The store façade mirrors native's 'unknown' fallback. This tab does
 *   NOT invent IDs — if ctx provides no chatId/externalId/snapshotId,
 *   the tab renders the linked-chat empty state (after the inert
 *   notice).
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:221 (DPANEL_RAIL_ITEMS[6]).
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

  const INERT_NOTICE = 'Capture is read-only/inert in Studio V1. Live selection and conversion are not enabled.';

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

  function normalizeItems(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length; i += 1) {
      const x = arr[i];
      if (x && typeof x === 'object') out.push(x);
    }
    return out;
  }

  /* Pinned first, then newest-by-updatedAt descending (fallback
   * createdAt). Stable on ties. */
  function sortForDisplay(items) {
    const indexed = items.map(function (e, i) { return { e: e, i: i }; });
    indexed.sort(function (a, b) {
      const ap = a.e && a.e.pinned ? 1 : 0;
      const bp = b.e && b.e.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = (a.e && typeof a.e.updatedAt === 'number' && isFinite(a.e.updatedAt) && a.e.updatedAt > 0)
        ? a.e.updatedAt
        : (typeof a.e.createdAt === 'number' && isFinite(a.e.createdAt) ? a.e.createdAt : 0);
      const bt = (b.e && typeof b.e.updatedAt === 'number' && isFinite(b.e.updatedAt) && b.e.updatedAt > 0)
        ? b.e.updatedAt
        : (typeof b.e.createdAt === 'number' && isFinite(b.e.createdAt) ? b.e.createdAt : 0);
      if (at !== bt) return bt - at;
      return a.i - b.i;
    });
    return indexed.map(function (x) { return x.e; });
  }

  function deriveTitle(item) {
    const t = normalizeText(item.title);
    if (t) return t;
    const head = normalizeText(firstLine(item.text));
    return head || '(untitled capture)';
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
    const role = typeof src.role === 'string' ? src.role.trim() : '';
    const msgId = typeof src.msgId === 'string' ? src.msgId.trim() : '';
    if (msgId && role) return role + ' msg ' + truncate(msgId, 16);
    if (msgId) return 'msg ' + truncate(msgId, 16);
    if (role) return role;
    return '';
  }

  /* ── DOM builders (all read-only; no <a>/<img>/<button>) ──────────── */
  function buildInertNotice() {
    const el = document.createElement('div');
    el.className = 'wbDockEmpty';
    el.setAttribute('data-capture-notice', 'inert-v1');
    el.textContent = INERT_NOTICE;
    return el;
  }

  function buildLinkedChatHint() {
    const el = document.createElement('div');
    el.className = 'wbDockEmpty';
    el.textContent = 'Open a linked chat/snapshot to view captured items.';
    return el;
  }

  function buildEmptyState() {
    const el = document.createElement('div');
    el.className = 'wbDockEmpty';
    el.textContent = 'No captured items found for this chat yet.';
    return el;
  }

  function buildErrorState(msg) {
    const el = document.createElement('div');
    el.className = 'wbDockError';
    el.textContent = msg || 'Could not load Capture.';
    return el;
  }

  function buildSummary(total, reviewedCount, convertedCount) {
    const parts = [];
    parts.push(total === 1 ? '1 captured' : (total + ' captured'));
    if (reviewedCount) parts.push(reviewedCount + ' reviewed');
    if (convertedCount) parts.push(convertedCount + ' converted');
    const el = document.createElement('div');
    el.className = 'wbDockMeta';
    el.textContent = parts.join(' • ');
    return el;
  }

  function buildItemRow(item, i) {
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
    const kind = typeof item.kind === 'string' ? item.kind.trim() : '';
    if (kind) metaParts.push(kind);
    const status = typeof item.status === 'string' ? item.status.trim() : '';
    if (status) metaParts.push('status: ' + status);
    const route = typeof item.routeSuggestion === 'string' ? item.routeSuggestion.trim() : '';
    if (route) metaParts.push('route: ' + truncate(route, 32));
    const srcLabel = deriveSourceLabel(item);
    if (srcLabel) metaParts.push(srcLabel);
    if (item.id) metaParts.push('id ' + truncate(String(item.id), 16));
    if (item.pinned) metaParts.push('pinned');
    if (item.dismissed) metaParts.push('dismissed');
    if (Array.isArray(item.tags) && item.tags.length) {
      const tagStr = item.tags
        .filter(function (t) { return typeof t === 'string' && t.trim(); })
        .map(function (t) { return '#' + t.trim(); })
        .join(' ');
      if (tagStr) metaParts.push(truncate(tagStr, 80));
    }
    const tsRaw = (typeof item.updatedAt === 'number' && isFinite(item.updatedAt) && item.updatedAt > 0)
      ? item.updatedAt
      : item.createdAt;
    const tsStr = formatTs(tsRaw);
    if (tsStr) metaParts.push(tsStr);
    if (metaParts.length) {
      const metaEl = document.createElement('div');
      metaEl.className = 'wbDockMeta';
      metaEl.textContent = metaParts.join(' • ');
      body.appendChild(metaEl);
    }

    /* Read-only conversion/review provenance. NEVER an action — pure
     * metadata describing what the native engine already did. */
    if (item.reviewedAt) {
      const rEl = document.createElement('div');
      rEl.className = 'wbDockMeta';
      const rs = formatTs(item.reviewedAt);
      rEl.textContent = rs ? ('reviewed at ' + rs) : 'reviewed';
      body.appendChild(rEl);
    }
    if (item.convertedTo != null) {
      const cEl = document.createElement('div');
      cEl.className = 'wbDockMeta';
      let conv = '';
      if (typeof item.convertedTo === 'string') {
        conv = item.convertedTo;
      } else if (typeof item.convertedTo === 'object') {
        const kind = (item.convertedTo.kind && String(item.convertedTo.kind)) || '';
        const id = (item.convertedTo.id && String(item.convertedTo.id)) || '';
        conv = (kind && id) ? (kind + ' ' + truncate(id, 16)) : (kind || id);
      }
      cEl.textContent = 'converted → ' + (conv || '(unknown target)');
      body.appendChild(cEl);
    }

    li.appendChild(body);
    return li;
  }

  function renderList(container, items) {
    let reviewedCount = 0;
    let convertedCount = 0;
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (it && it.status === 'reviewed') reviewedCount += 1;
      if (it && (it.status === 'converted' || it.convertedTo != null)) convertedCount += 1;
    }
    container.appendChild(buildSummary(items.length, reviewedCount, convertedCount));

    const list = document.createElement('ul');
    list.className = 'wbDockList';
    list.setAttribute('role', 'list');

    const sorted = sortForDisplay(items);
    for (let i = 0; i < sorted.length; i += 1) {
      list.appendChild(buildItemRow(sorted[i], i));
    }
    container.appendChild(list);
  }

  dock.registerTab('capture', {
    id: 'capture',
    title: 'Capture Box',
    icon: '🧷',
    txt: 'P',
    color: '#C05C95',
    order: 70,
    disabled: false,
    phase: '2c-read-only-inert',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;

      const store = H2O.Studio && H2O.Studio.store;
      const cpStore = store && store.capture;

      function paint() {
        try {
          clearChildren(container);
          /* Inert/V1 notice always first, on every render. */
          container.appendChild(buildInertNotice());

          if (!cpStore || typeof cpStore.getBundle !== 'function') {
            container.appendChild(buildErrorState('Capture store is unavailable.'));
            return;
          }
          const chatId = resolveChatId(ctx);
          if (!chatId) {
            container.appendChild(buildLinkedChatHint());
            return;
          }
          const bundle = cpStore.getBundle(chatId);
          const items = normalizeItems(bundle && bundle.items);
          if (!items.length) {
            container.appendChild(buildEmptyState());
          } else {
            renderList(container, items);
          }
        } catch (_) {
          try {
            clearChildren(container);
            container.appendChild(buildInertNotice());
            container.appendChild(buildErrorState('Failed to render Capture.'));
          } catch (__) { /* swallow */ }
        }
      }

      paint();

      let unsub = null;
      const chatId = resolveChatId(ctx);
      if (chatId && cpStore && typeof cpStore.subscribe === 'function') {
        try {
          unsub = cpStore.subscribe(function (evt) {
            /* Pre-filtered to Capture keys by the store. Drop events for
             * other chats so unrelated changes don't repaint. */
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
