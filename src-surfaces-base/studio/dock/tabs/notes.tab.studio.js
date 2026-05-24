/* H2O Studio — Dock Tab: Notes (Phase 2C-N, read-only rendering)
 *
 * Phase 2C-N: Fourth real-data Dock tab. Renders notes entries and an
 * optional scratchpad preview from H2O.Studio.store.notes as a read-only
 * flat list, scoped to the active reader's chat id.
 *
 * Read-only contract (V1):
 *   - Reads via H2O.Studio.store.notes.getBundle(chatId)  (sync, lazy-
 *     fetch behind cache; first read may return null then notify via
 *     subscribe()).
 *   - Subscribes via H2O.Studio.store.notes.subscribe(fn) for live
 *     refresh; the returned unsubscribe is handed back to dock-shell
 *     via the render() return value (shell honors this at
 *     renderActiveView:cleanup and unmount:activeRenderCleanup).
 *   - Never calls set / update / remove / saveNow / pin / unpin or any
 *     other write API.
 *   - Never mutates the entries array or scratch string returned by
 *     the store.
 *   - Never scrolls the reader, never touches the native runtime.
 *   - No note creation / deletion / editing / pinning in this phase.
 *   - No editing UI at all: no textarea, no input field, no save button.
 *   - No conflict-resolution UI. No bodyVersions handling.
 *
 * Native note shape mirrored from src-runtime-base/3N1a (Notes Engine,
 * lines 246-254):
 *   {
 *     id:        string,
 *     title:     string,
 *     text:      string,
 *     tags:      string[],
 *     pinned:    boolean,
 *     createdAt: number,
 *     updatedAt: number,
 *     source:    { ... } | null
 *   }
 *
 * Scratchpad shape: plain string, no JSON wrapping (notes.js:30).
 *
 * Chat-id fallback:
 *   The store façade mirrors native's 'unknown' fallback. This tab does
 *   NOT invent IDs — if ctx provides no chatId/externalId/snapshotId,
 *   the tab renders the linked-chat empty state instead.
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:217 (DPANEL_RAIL_ITEMS[2]).
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

  function normalizeEntries(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length; i += 1) {
      const x = arr[i];
      if (x && typeof x === 'object') out.push(x);
    }
    return out;
  }

  function normalizeScratch(v) {
    if (typeof v !== 'string') return '';
    return v;
  }

  /* Pinned first, then most-recently-updated descending (fallback to
   * createdAt), preserving store order on ties. */
  function sortForDisplay(entries) {
    const indexed = entries.map(function (e, i) { return { e: e, i: i }; });
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

  function deriveTitle(note) {
    const t = normalizeText(note.title);
    if (t) return t;
    const head = normalizeText(firstLine(note.text));
    return head || '(untitled note)';
  }

  function deriveSnippet(note) {
    const t = normalizeText(note.text);
    if (!t) return '';
    if (note.title && normalizeText(note.title) === t) return '';
    return t;
  }

  function deriveSourceLabel(note) {
    const src = note && note.source;
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
      box.textContent = msg || 'Could not load Notes.';
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

  function buildSummary(notesLen, hasScratch) {
    const parts = [];
    parts.push(notesLen === 1 ? '1 note' : notesLen + ' notes');
    if (hasScratch) parts.push('scratchpad');
    const el = document.createElement('div');
    el.className = 'wbDockMeta';
    el.textContent = parts.join(' • ');
    return el;
  }

  /* Read-only scratchpad preview. Truncates to a short preview only. No
   * textarea, no input, no contenteditable, no save controls. */
  function buildScratchSection(scratch) {
    const wrap = document.createElement('div');
    wrap.className = 'wbDockRow';
    wrap.setAttribute('data-row-key', '__scratch');

    const body = document.createElement('div');
    body.className = 'wbDockRowBody';

    const titleEl = document.createElement('div');
    titleEl.className = 'wbDockRowText';
    titleEl.textContent = 'Scratchpad';
    body.appendChild(titleEl);

    const previewEl = document.createElement('div');
    previewEl.className = 'wbDockMeta';
    previewEl.textContent = truncate(normalizeText(scratch), 320);
    body.appendChild(previewEl);

    wrap.appendChild(body);
    return wrap;
  }

  function renderList(container, entries, scratch) {
    clearChildren(container);

    const scratchStr = normalizeScratch(scratch);
    const hasScratch = scratchStr.trim().length > 0;

    container.appendChild(buildSummary(entries.length, hasScratch));

    if (hasScratch) {
      container.appendChild(buildScratchSection(scratchStr));
    }

    if (!entries.length) {
      /* Scratch shown, but no notes — add a small note line so the user
       * knows the list itself is empty. */
      if (!hasScratch) return;
      const note = document.createElement('div');
      note.className = 'wbDockEmpty';
      note.textContent = 'No notes found for this chat yet.';
      container.appendChild(note);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'wbDockList';
    list.setAttribute('role', 'list');

    const sorted = sortForDisplay(entries);
    for (let i = 0; i < sorted.length; i += 1) {
      const note = sorted[i];

      const li = document.createElement('li');
      li.className = 'wbDockRow';
      const rowKey = String(note.id || i);
      li.setAttribute('data-row-key', rowKey);

      const body = document.createElement('div');
      body.className = 'wbDockRowBody';

      const titleEl = document.createElement('div');
      titleEl.className = 'wbDockRowText';
      titleEl.textContent = truncate(deriveTitle(note), 240);
      body.appendChild(titleEl);

      const snippet = deriveSnippet(note);
      if (snippet) {
        const snipEl = document.createElement('div');
        snipEl.className = 'wbDockMeta';
        snipEl.textContent = truncate(snippet, 320);
        body.appendChild(snipEl);
      }

      const metaParts = [];
      const srcLabel = deriveSourceLabel(note);
      if (srcLabel) metaParts.push(srcLabel);
      if (note.id) metaParts.push('id ' + truncate(String(note.id), 16));
      if (note.pinned) metaParts.push('pinned');
      if (Array.isArray(note.tags) && note.tags.length) {
        const tagStr = note.tags
          .filter(function (t) { return typeof t === 'string' && t.trim(); })
          .map(function (t) { return '#' + t.trim(); })
          .join(' ');
        if (tagStr) metaParts.push(truncate(tagStr, 80));
      }
      const tsRaw = (typeof note.updatedAt === 'number' && isFinite(note.updatedAt) && note.updatedAt > 0)
        ? note.updatedAt
        : note.createdAt;
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

  dock.registerTab('notes', {
    id: 'notes',
    title: 'Notes',
    icon: '🗒️',
    txt: 'N',
    color: '#A83A3A',
    order: 30,
    disabled: false,
    phase: '2c-read-only',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;

      const store = H2O.Studio && H2O.Studio.store;
      const ntStore = store && store.notes;
      if (!ntStore || typeof ntStore.getBundle !== 'function') {
        renderError(container, 'Notes store is unavailable.');
        return;
      }

      const chatId = resolveChatId(ctx);
      if (!chatId) {
        renderEmpty(container, 'Open a linked chat/snapshot to view notes.');
        return;
      }

      function paint() {
        try {
          const bundle = ntStore.getBundle(chatId);
          const entries = normalizeEntries(bundle && bundle.entries);
          const scratch = normalizeScratch(bundle && bundle.scratch);
          if (!entries.length && !scratch.trim()) {
            renderEmpty(container, 'No notes found for this chat yet.');
          } else {
            renderList(container, entries, scratch);
          }
        } catch (_) {
          renderError(container, 'Failed to render Notes.');
        }
      }

      paint();

      let unsub = null;
      if (typeof ntStore.subscribe === 'function') {
        try {
          unsub = ntStore.subscribe(function (evt) {
            /* The store filters non-notes/scratch keys already. Drop
             * events for other chats so unrelated changes don't repaint.
             * Both 'notes' and 'scratch' kinds fire here. */
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
