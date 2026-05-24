/* H2O Studio — Dock Tab: Finder (Phase 2C-F, read-only search)
 *
 * Phase 2C-F: Eighth and final Phase 2C real-data Dock tab. Provides a
 * local, in-memory, read-only search across the persisted-store sources
 * already wired in Phases 2C-H/B/C/N/V/P:
 *
 *   - Highlights  via H2O.Studio.store.highlights.getAll()
 *   - Bookmarks   via H2O.Studio.store.bookmarks.list(chatId)
 *   - Context     via H2O.Studio.store.context.getBundle(chatId)
 *   - Notes       via H2O.Studio.store.notes.getBundle(chatId)  (+ scratch)
 *   - Navigator   via H2O.Studio.store.navigator.listPinned/Aliases/Collapsed(chatId)
 *   - Capture     via H2O.Studio.store.capture.getBundle(chatId)
 *
 * Attachments search is intentionally NOT included in this phase to
 * avoid duplicating the Attachments tab's DOM scanner; users still
 * search attachments via the Attachments tab.
 *
 * Read-only contract (V1):
 *   - Aggregates source rows by READING from the six stores above.
 *   - Never calls set / update / remove / saveNow / convert / archive
 *     / dismiss / review / any other write API. Never mutates the
 *     arrays / blobs / strings returned by the stores.
 *   - Subscribes via each store's subscribe(fn) for live refresh; the
 *     returned cleanup function unsubscribes ALL subscriptions.
 *   - Renders a `<input type="search">` for the query — this is a
 *     LOCAL input. The query is held in a JS variable only; it is
 *     NEVER written to localStorage / sessionStorage / chrome.storage
 *     / H2O.Studio.store.prefs / any other persistence.
 *   - Renders text-only rows. NO `<a>`, `<img>`, `<button>`. No
 *     click-to-open / click-to-scroll / click-to-copy. No window.open,
 *     no clipboard, no fetch, no XHR, no MutationObserver, no
 *     setInterval, no scrollTo, no scrollIntoView.
 *
 * Chat-id fallback:
 *   Studio does NOT invent IDs. If ctx provides no chatId/externalId/
 *   snapshotId, the tab renders the linked-chat hint (above the search
 *   input) and skips aggregation/subscription entirely.
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:222 (DPANEL_RAIL_ITEMS[7]).
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

  /* Stable source labels. The order here governs default presentation
   * order (same as the native Dock rail H/B/N/V/X/P sequence). */
  const SOURCE_HIGHLIGHTS = 'Highlights';
  const SOURCE_BOOKMARKS  = 'Bookmarks';
  const SOURCE_CONTEXT    = 'Context';
  const SOURCE_NOTES      = 'Notes';
  const SOURCE_NAVIGATOR  = 'Navigator';
  const SOURCE_CAPTURE    = 'Capture';
  const SOURCE_ORDER = Object.freeze({
    Highlights: 1,
    Bookmarks:  2,
    Notes:      3,
    Navigator:  4,
    Context:    5,
    Capture:    6,
  });

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
  function normalizeText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function truncate(s, max) {
    const str = String(s || '');
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trimEnd() + '…';
  }
  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }
  function isPlainObject(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const p = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  }
  function asArray(v) {
    if (Array.isArray(v)) return v;
    return [];
  }

  /* ── Source row builders (read-only, defensive) ───────────────────── */
  function buildHighlightRows(store) {
    const out = [];
    if (!store || typeof store.getAll !== 'function') return out;
    let blob;
    try { blob = store.getAll(); } catch (_) { return out; }
    if (!isPlainObject(blob)) return out;
    const iba = isPlainObject(blob.itemsByAnswer) ? blob.itemsByAnswer : null;
    if (!iba) return out;
    const aIds = Object.keys(iba);
    for (let i = 0; i < aIds.length; i += 1) {
      const aId = aIds[i];
      const list = iba[aId];
      if (!Array.isArray(list)) continue;
      for (let j = 0; j < list.length; j += 1) {
        const it = list[j];
        if (!it || typeof it !== 'object') continue;
        const tq = it.anchors && it.anchors.textQuote;
        const exact = tq && typeof tq.exact === 'string' ? tq.exact : '';
        const text = normalizeText(exact);
        const color = it.color != null ? String(it.color) : '';
        const id = it.id != null ? String(it.id) : '';
        const meta = [];
        if (color) meta.push(color);
        if (aId) meta.push('msg ' + truncate(aId, 16));
        if (id) meta.push('id ' + truncate(id, 16));
        out.push({
          source: SOURCE_HIGHLIGHTS,
          kind: 'highlight',
          title: text || '(no text)',
          text: '',
          meta: meta,
          rankText: [text, color, aId, id].join(' ').toLowerCase(),
        });
      }
    }
    return out;
  }

  function buildBookmarkRows(store, chatId) {
    const out = [];
    if (!store || typeof store.list !== 'function') return out;
    let entries;
    try { entries = store.list(chatId); } catch (_) { return out; }
    if (!Array.isArray(entries)) return out;
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      if (!e || typeof e !== 'object') continue;
      const title = normalizeText(e.title) || normalizeText(firstLine(e.snapText)) || '(untitled bookmark)';
      const text = normalizeText(e.snapText);
      const meta = [];
      const idLabel = e.msgId || e.primaryAId || '';
      if (idLabel) meta.push('msg ' + truncate(String(idLabel), 16));
      if (typeof e.pairNo === 'number' && isFinite(e.pairNo)) meta.push('pair ' + e.pairNo);
      out.push({
        source: SOURCE_BOOKMARKS,
        kind: 'bookmark',
        title: title,
        text: text,
        meta: meta,
        rankText: [title, text, String(e.msgId || ''), String(e.primaryAId || ''), String(e.pairNo || '')].join(' ').toLowerCase(),
      });
    }
    return out;
  }

  function buildContextRows(store, chatId) {
    const out = [];
    if (!store || typeof store.getBundle !== 'function') return out;
    let bundle;
    try { bundle = store.getBundle(chatId); } catch (_) { return out; }
    const items = asArray(bundle && bundle.items);
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (!it || typeof it !== 'object') continue;
      const title = normalizeText(it.title) || normalizeText(firstLine(it.text)) || '(untitled context item)';
      const text = normalizeText(it.text);
      const tags = Array.isArray(it.tags) ? it.tags.filter(function (t) { return typeof t === 'string' && t.trim(); }) : [];
      const src = it.source || {};
      const meta = [];
      if (src && src.kind) meta.push(String(src.kind));
      if (it.id) meta.push('id ' + truncate(String(it.id), 16));
      if (it.pinned) meta.push('pinned');
      if (tags.length) meta.push(tags.map(function (t) { return '#' + t.trim(); }).join(' '));
      out.push({
        source: SOURCE_CONTEXT,
        kind: 'context',
        title: title,
        text: text,
        meta: meta,
        rankText: [title, text, tags.join(' '), String(src.kind || ''), String(src.id || '')].join(' ').toLowerCase(),
      });
    }
    return out;
  }

  function buildNotesRows(store, chatId) {
    const out = [];
    if (!store || typeof store.getBundle !== 'function') return out;
    let bundle;
    try { bundle = store.getBundle(chatId); } catch (_) { return out; }
    const entries = asArray(bundle && bundle.entries);
    for (let i = 0; i < entries.length; i += 1) {
      const n = entries[i];
      if (!n || typeof n !== 'object') continue;
      const title = normalizeText(n.title) || normalizeText(firstLine(n.text)) || '(untitled note)';
      const text = normalizeText(n.text);
      const tags = Array.isArray(n.tags) ? n.tags.filter(function (t) { return typeof t === 'string' && t.trim(); }) : [];
      const src = n.source || {};
      const meta = [];
      if (src && src.kind) meta.push(String(src.kind));
      if (n.id) meta.push('id ' + truncate(String(n.id), 16));
      if (n.pinned) meta.push('pinned');
      if (tags.length) meta.push(tags.map(function (t) { return '#' + t.trim(); }).join(' '));
      out.push({
        source: SOURCE_NOTES,
        kind: 'note',
        title: title,
        text: text,
        meta: meta,
        rankText: [title, text, tags.join(' '), String(src.kind || ''), String(src.id || '')].join(' ').toLowerCase(),
      });
    }
    const scratch = (bundle && typeof bundle.scratch === 'string') ? bundle.scratch : '';
    const scratchTrim = scratch.trim();
    if (scratchTrim) {
      const scratchText = normalizeText(scratch);
      out.push({
        source: SOURCE_NOTES,
        kind: 'scratchpad',
        title: 'Scratchpad',
        text: scratchText,
        meta: ['scratchpad'],
        rankText: ('scratchpad ' + scratchText).toLowerCase(),
      });
    }
    return out;
  }

  function buildNavigatorRows(store, chatId) {
    const out = [];
    if (!store) return out;
    if (typeof store.listPinned === 'function') {
      let pins;
      try { pins = store.listPinned(chatId); } catch (_) { pins = []; }
      const arr = asArray(pins);
      for (let i = 0; i < arr.length; i += 1) {
        const p = arr[i];
        if (!p || typeof p !== 'object') continue;
        const turnId = p.turnId ? String(p.turnId) : '';
        const kind = p.kind ? String(p.kind) : '';
        const answerId = p.answerId ? String(p.answerId) : '';
        const meta = [];
        if (kind) meta.push(kind);
        if (answerId) meta.push('answer ' + truncate(answerId, 24));
        out.push({
          source: SOURCE_NAVIGATOR,
          kind: 'pin',
          title: turnId ? ('pin: turn ' + truncate(turnId, 24)) : 'pin: (unknown turn)',
          text: '',
          meta: meta,
          rankText: ['pin', turnId, kind, answerId].join(' ').toLowerCase(),
        });
      }
    }
    if (typeof store.listAliases === 'function') {
      let aliases;
      try { aliases = store.listAliases(chatId); } catch (_) { aliases = []; }
      const arr = asArray(aliases);
      for (let i = 0; i < arr.length; i += 1) {
        const a = arr[i];
        if (!a || typeof a !== 'object') continue;
        const key = a.key ? String(a.key) : '';
        const value = a.value ? String(a.value) : '';
        out.push({
          source: SOURCE_NAVIGATOR,
          kind: 'alias',
          title: 'alias: ' + (value ? truncate(value, 240) : '(empty)'),
          text: '',
          meta: key ? ['key ' + truncate(key, 32)] : [],
          rankText: ['alias', key, value].join(' ').toLowerCase(),
        });
      }
    }
    if (typeof store.listCollapsed === 'function') {
      let collapsed;
      try { collapsed = store.listCollapsed(chatId); } catch (_) { collapsed = []; }
      const arr = asArray(collapsed);
      for (let i = 0; i < arr.length; i += 1) {
        const c = arr[i];
        if (!c || typeof c !== 'object') continue;
        const turnId = c.turnId ? String(c.turnId) : '';
        out.push({
          source: SOURCE_NAVIGATOR,
          kind: 'collapsed',
          title: turnId ? ('collapsed: turn ' + truncate(turnId, 24)) : 'collapsed: (unknown turn)',
          text: '',
          meta: [],
          rankText: ('collapsed ' + turnId).toLowerCase(),
        });
      }
    }
    return out;
  }

  function buildCaptureRows(store, chatId) {
    const out = [];
    if (!store || typeof store.getBundle !== 'function') return out;
    let bundle;
    try { bundle = store.getBundle(chatId); } catch (_) { return out; }
    const items = asArray(bundle && bundle.items);
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (!it || typeof it !== 'object') continue;
      const title = normalizeText(it.title) || normalizeText(firstLine(it.text)) || '(untitled capture)';
      const text = normalizeText(it.text);
      const tags = Array.isArray(it.tags) ? it.tags.filter(function (t) { return typeof t === 'string' && t.trim(); }) : [];
      const src = it.source || {};
      const meta = [];
      if (it.kind) meta.push(String(it.kind));
      if (it.status) meta.push('status: ' + String(it.status));
      if (it.routeSuggestion) meta.push('route: ' + truncate(String(it.routeSuggestion), 32));
      if (it.id) meta.push('id ' + truncate(String(it.id), 16));
      if (it.pinned) meta.push('pinned');
      if (it.dismissed) meta.push('dismissed');
      if (tags.length) meta.push(tags.map(function (t) { return '#' + t.trim(); }).join(' '));
      let convStr = '';
      if (it.convertedTo != null) {
        if (typeof it.convertedTo === 'string') convStr = it.convertedTo;
        else if (typeof it.convertedTo === 'object') {
          const ck = it.convertedTo.kind ? String(it.convertedTo.kind) : '';
          const cid = it.convertedTo.id ? String(it.convertedTo.id) : '';
          convStr = (ck && cid) ? (ck + ' ' + cid) : (ck || cid);
        }
      }
      out.push({
        source: SOURCE_CAPTURE,
        kind: 'capture',
        title: title,
        text: text,
        meta: meta,
        rankText: [title, text, String(it.kind || ''), String(it.status || ''), String(it.routeSuggestion || ''), tags.join(' '), String(src.kind || ''), String(src.id || ''), convStr].join(' ').toLowerCase(),
      });
    }
    return out;
  }

  function aggregateRows(stores, chatId) {
    const all = [];
    Array.prototype.push.apply(all, buildHighlightRows(stores.highlights));
    Array.prototype.push.apply(all, buildBookmarkRows(stores.bookmarks, chatId));
    Array.prototype.push.apply(all, buildContextRows(stores.context, chatId));
    Array.prototype.push.apply(all, buildNotesRows(stores.notes, chatId));
    Array.prototype.push.apply(all, buildNavigatorRows(stores.navigator, chatId));
    Array.prototype.push.apply(all, buildCaptureRows(stores.capture, chatId));
    return all;
  }

  function filterRows(rows, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const out = [];
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].rankText.indexOf(q) >= 0) out.push(rows[i]);
    }
    out.sort(function (a, b) {
      const ao = SOURCE_ORDER[a.source] || 99;
      const bo = SOURCE_ORDER[b.source] || 99;
      return ao - bo;
    });
    return out;
  }

  /* ── DOM builders (read-only) ─────────────────────────────────────── */
  function buildStatus(text, cls) {
    const el = document.createElement('div');
    el.className = cls || 'wbDockEmpty';
    el.textContent = text;
    return el;
  }

  function buildSearchInput(initialValue, onInput) {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-finder-search', '1');
    /* Inline styles only; we deliberately avoid editing the externally-
     * modified studio.css to keep this commit isolated. The classes
     * `.wbDockMeta` etc. supply the rest of the look-and-feel. */
    wrap.style.setProperty('padding', '6px 0 8px 0');
    const input = document.createElement('input');
    input.setAttribute('type', 'search');
    input.setAttribute('placeholder', 'Search Highlights, Bookmarks, Notes, Navigator, Context, Capture…');
    input.setAttribute('aria-label', 'Search Dock data');
    input.setAttribute('data-finder-input', '1');
    input.value = String(initialValue || '');
    input.style.setProperty('width', '100%');
    input.style.setProperty('box-sizing', 'border-box');
    input.style.setProperty('padding', '6px 8px');
    input.style.setProperty('border-radius', '4px');
    input.style.setProperty('border', '1px solid var(--wb-border, #444)');
    input.style.setProperty('background', 'transparent');
    input.style.setProperty('color', 'inherit');
    input.style.setProperty('font', 'inherit');
    if (typeof input.addEventListener === 'function') {
      input.addEventListener('input', function () { onInput(input.value); });
    }
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  function buildSourceLabel(text) {
    const el = document.createElement('span');
    el.setAttribute('data-finder-source', '1');
    el.style.setProperty('font-weight', '600');
    el.style.setProperty('font-size', '11px');
    el.style.setProperty('text-transform', 'uppercase');
    el.style.setProperty('letter-spacing', '0.04em');
    el.style.setProperty('margin-right', '6px');
    el.style.setProperty('opacity', '0.8');
    el.textContent = text;
    return el;
  }

  function buildResultRow(row, idx) {
    const li = document.createElement('li');
    li.className = 'wbDockRow';
    li.setAttribute('data-row-key', row.source + ':' + idx);

    const body = document.createElement('div');
    body.className = 'wbDockRowBody';

    const titleEl = document.createElement('div');
    titleEl.className = 'wbDockRowText';
    /* Source label sits inline before the title text. */
    titleEl.appendChild(buildSourceLabel(row.source));
    const titleText = document.createElement('span');
    titleText.textContent = truncate(row.title || '(untitled)', 240);
    titleEl.appendChild(titleText);
    body.appendChild(titleEl);

    if (row.text && normalizeText(row.text) && normalizeText(row.text) !== normalizeText(row.title)) {
      const snipEl = document.createElement('div');
      snipEl.className = 'wbDockMeta';
      snipEl.textContent = truncate(row.text, 320);
      body.appendChild(snipEl);
    }

    if (Array.isArray(row.meta) && row.meta.length) {
      const metaEl = document.createElement('div');
      metaEl.className = 'wbDockMeta';
      metaEl.textContent = row.meta.join(' • ');
      body.appendChild(metaEl);
    }

    li.appendChild(body);
    return li;
  }

  function buildResultList(filtered) {
    const list = document.createElement('ul');
    list.className = 'wbDockList';
    list.setAttribute('role', 'list');
    for (let i = 0; i < filtered.length; i += 1) {
      list.appendChild(buildResultRow(filtered[i], i));
    }
    return list;
  }

  function buildSummary(filteredLen, totalLen, query) {
    const el = document.createElement('div');
    el.className = 'wbDockMeta';
    if (!String(query || '').trim()) {
      el.textContent = totalLen + ' items indexed (live, in-memory)';
    } else {
      el.textContent = filteredLen + ' result' + (filteredLen === 1 ? '' : 's') + ' of ' + totalLen + ' indexed';
    }
    return el;
  }

  function buildFooter() {
    const el = document.createElement('div');
    el.className = 'wbDockMeta';
    el.style.setProperty('margin-top', '8px');
    el.style.setProperty('opacity', '0.7');
    el.textContent = 'Attachments search lands later — use the Attachments tab for now.';
    return el;
  }

  dock.registerTab('finder', {
    id: 'finder',
    title: 'Finder',
    icon: '🔎',
    txt: 'F',
    color: '#3FA7D6',
    order: 80,
    disabled: false,
    phase: '2c-read-only-search',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;

      const store = H2O.Studio && H2O.Studio.store;
      const stores = {
        highlights: store && store.highlights,
        bookmarks:  store && store.bookmarks,
        context:    store && store.context,
        notes:      store && store.notes,
        navigator:  store && store.navigator,
        capture:    store && store.capture,
      };

      const chatId = resolveChatId(ctx);

      /* Local-only state. Query is a JS variable — NEVER persisted. */
      let query = '';
      let cachedRows = null;
      const unsubs = [];

      function rebuildCache() { cachedRows = aggregateRows(stores, chatId); }

      function repaintResults(resultsHost, summaryHost) {
        if (cachedRows == null) rebuildCache();
        const rows = cachedRows || [];
        clearChildren(summaryHost);
        summaryHost.appendChild(buildSummary(
          query.trim() ? filterRows(rows, query).length : rows.length,
          rows.length,
          query
        ));
        clearChildren(resultsHost);
        if (!chatId) return;  /* nothing to filter without a chatId */
        const q = query.trim();
        if (!q) {
          resultsHost.appendChild(buildStatus('Type to search Dock data.'));
          return;
        }
        const filtered = filterRows(rows, query);
        if (!filtered.length) {
          resultsHost.appendChild(buildStatus('No Finder results.'));
          return;
        }
        resultsHost.appendChild(buildResultList(filtered));
      }

      function paint() {
        try {
          clearChildren(container);

          if (!chatId) {
            container.appendChild(buildStatus('Open a linked chat/snapshot to search Dock data.'));
            return;
          }

          const searchUI = buildSearchInput(query, function (next) {
            query = String(next || '');
            repaintResults(resultsHost, summaryHost);
          });
          container.appendChild(searchUI.wrap);

          const summaryHost = document.createElement('div');
          container.appendChild(summaryHost);
          const resultsHost = document.createElement('div');
          container.appendChild(resultsHost);
          container.appendChild(buildFooter());

          rebuildCache();
          repaintResults(resultsHost, summaryHost);
        } catch (_) {
          try {
            clearChildren(container);
            container.appendChild(buildStatus('Failed to render Finder.', 'wbDockError'));
          } catch (__) { /* swallow */ }
        }
      }

      paint();

      /* Subscribe to all available stores. On any change we rebuild the
       * cache and repaint. We only subscribe when a chatId is present;
       * otherwise the linked-chat hint is shown and there is nothing
       * to refresh. */
      if (chatId) {
        const subTargets = [stores.highlights, stores.bookmarks, stores.context,
                            stores.notes, stores.navigator, stores.capture];
        for (let i = 0; i < subTargets.length; i += 1) {
          const s = subTargets[i];
          if (!s || typeof s.subscribe !== 'function') continue;
          try {
            const off = s.subscribe(function () {
              /* Full repaint via the container's current children: we
               * just call paint() again. This rebuilds the cache and
               * preserves the current `query` variable verbatim. */
              paint();
            });
            if (typeof off === 'function') unsubs.push(off);
          } catch (_) { /* swallow individual failures */ }
        }
      }

      return function cleanup() {
        for (let i = 0; i < unsubs.length; i += 1) {
          try { unsubs[i](); } catch (_) { /* swallow */ }
        }
        unsubs.length = 0;
      };
    },
  });
})(globalThis);
