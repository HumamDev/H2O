/* H2O Studio — Dock Tab: Attachments (Phase 2C-A, read-only DOM-derived)
 *
 * Phase 2C-A: Sixth real-data Dock tab. Renders an attachment list
 * derived ONLY from the current Studio reader DOM (#viewReader).
 * There is no persistent attachments store in Studio V1 — items are
 * scanned out of the rendered reader on each tab render.
 *
 * Read-only contract (V1):
 *   - Scans inside #viewReader only. If that element is absent the tab
 *     renders a "Open a saved chat reader" hint and does nothing else.
 *   - Detects images via `img[src]` and file-like links via `a[href]`
 *     matching a conservative file-extension allow-list.
 *   - Reads ONLY: src, href, alt, textContent, and nearest-ancestor
 *     data-message-id / data-turn-id attributes.
 *   - NEVER calls any feature store. NEVER mutates the reader DOM.
 *   - NEVER triggers a network fetch: no <img> is created (so the
 *     browser cannot re-fetch via the rendered tab), no <a> is
 *     rendered (so a stray click cannot navigate). Rows are text-only.
 *   - NEVER attaches download/open/copy/delete actions, no clipboard,
 *     no window.open, no XHR, no fetch, no MutationObserver, no
 *     polling, no setInterval. Single scan per render.
 *
 * Studio reader anchors (from studio.html:192 and studio.js:4512,
 * 4860, 4957, 5329, 5418):
 *   #viewReader.wbReader
 *     ├─ [data-testid="conversation-turn" | "conversation-turn-<n>"]
 *     │    └─ [data-message-author-role][data-message-id][data-turn-id]
 *     │         └─ .cgMsgBody
 *     │              └─ img[src], a[href], …
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:218 (DPANEL_RAIL_ITEMS[3]).
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

  /* Conservative allow-list of file-like extensions. Lowercased. */
  const FILE_EXTS = Object.freeze({
    pdf: 'PDF', png: 'PNG', jpg: 'JPG', jpeg: 'JPG', gif: 'GIF',
    webp: 'WEBP', svg: 'SVG', txt: 'TXT', md: 'MD',
    doc: 'DOC', docx: 'DOCX', xls: 'XLS', xlsx: 'XLSX',
    csv: 'CSV', zip: 'ZIP', json: 'JSON', ppt: 'PPT', pptx: 'PPTX',
  });

  /* Extensions that count as "image-ish" when seen as an <img src>. */
  const IMAGE_EXTS = Object.freeze({
    png: 1, jpg: 1, jpeg: 1, gif: 1, webp: 1, svg: 1, bmp: 1, ico: 1, avif: 1,
  });

  function truncate(s, max) {
    const str = String(s || '');
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trimEnd() + '…';
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* Best-effort URL-or-path parsing. Avoids `new URL()` for relative or
   * data: refs that may throw — falls back to plain string parsing. */
  function parseUrlBits(raw) {
    const url = String(raw == null ? '' : raw).trim();
    if (!url) return { url: '', basename: '', ext: '', scheme: '' };
    let scheme = '';
    const protoIdx = url.indexOf(':');
    if (protoIdx > 0 && /^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(url)) {
      scheme = url.slice(0, protoIdx).toLowerCase();
    }
    /* Strip query/hash for filename extraction. */
    let path = url;
    const qIdx = path.indexOf('?');
    if (qIdx >= 0) path = path.slice(0, qIdx);
    const hIdx = path.indexOf('#');
    if (hIdx >= 0) path = path.slice(0, hIdx);
    /* Last path segment. */
    const lastSlash = path.lastIndexOf('/');
    const basename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
    /* Extension. */
    let ext = '';
    const dot = basename.lastIndexOf('.');
    if (dot > 0 && dot < basename.length - 1) {
      ext = basename.slice(dot + 1).toLowerCase();
      if (ext.length > 8) ext = ''; /* implausibly long: ignore */
    }
    return { url: url, basename: basename, ext: ext, scheme: scheme };
  }

  /* Resolve nearest ancestor msg/turn ids. Bounded walk; safe on
   * detached nodes; never reaches outside the reader root. */
  function ancestorIds(el, readerRoot) {
    let msgId = '';
    let turnId = '';
    let node = el;
    while (node && node !== readerRoot && node.nodeType === 1) {
      if (!msgId && typeof node.getAttribute === 'function') {
        const m = node.getAttribute('data-message-id');
        if (m) msgId = m;
      }
      if (!turnId && typeof node.getAttribute === 'function') {
        const t = node.getAttribute('data-turn-id');
        if (t) turnId = t;
      }
      if (msgId && turnId) break;
      node = node.parentNode;
    }
    return { msgId: msgId, turnId: turnId };
  }

  function readerRootEl() {
    try {
      return document.getElementById('viewReader') || null;
    } catch (_) { return null; }
  }

  function safeQueryAll(root, sel) {
    try {
      const list = root.querySelectorAll(sel);
      return list ? Array.prototype.slice.call(list) : [];
    } catch (_) { return []; }
  }

  /* Single-pass scan. Returns a flat array of normalized records. */
  function scanReader(readerRoot) {
    const out = [];
    if (!readerRoot) return out;

    /* Images first. We READ existing src; we do not create <img>. */
    const imgs = safeQueryAll(readerRoot, 'img[src]');
    for (let i = 0; i < imgs.length; i += 1) {
      const node = imgs[i];
      const src = (node && typeof node.getAttribute === 'function')
        ? (node.getAttribute('src') || '')
        : '';
      if (!src) continue;
      const bits = parseUrlBits(src);
      const alt = (typeof node.getAttribute === 'function')
        ? (node.getAttribute('alt') || '').trim()
        : '';
      const ids = ancestorIds(node, readerRoot);
      out.push({
        kind: 'image',
        label: alt || bits.basename || bits.url,
        url: bits.url,
        ext: bits.ext,
        scheme: bits.scheme,
        msgId: ids.msgId,
        turnId: ids.turnId,
      });
    }

    /* File-ish links. We READ href + textContent; we do not create
     * <a>. Filter by allow-list extension OR image-ish extension. */
    const links = safeQueryAll(readerRoot, 'a[href]');
    for (let i = 0; i < links.length; i += 1) {
      const node = links[i];
      const href = (typeof node.getAttribute === 'function')
        ? (node.getAttribute('href') || '')
        : '';
      if (!href) continue;
      const bits = parseUrlBits(href);
      if (!bits.ext) continue;
      const isFile = Object.prototype.hasOwnProperty.call(FILE_EXTS, bits.ext);
      const isImage = Object.prototype.hasOwnProperty.call(IMAGE_EXTS, bits.ext);
      if (!isFile && !isImage) continue;
      const text = (typeof node.textContent === 'string') ? node.textContent.trim() : '';
      const ids = ancestorIds(node, readerRoot);
      out.push({
        kind: isImage ? 'image' : 'file',
        label: text || bits.basename || bits.url,
        url: bits.url,
        ext: bits.ext,
        scheme: bits.scheme,
        msgId: ids.msgId,
        turnId: ids.turnId,
      });
    }
    return out;
  }

  function renderError(container, msg) {
    try {
      clearChildren(container);
      const box = document.createElement('div');
      box.className = 'wbDockError';
      box.textContent = msg || 'Could not load Attachments.';
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

  function buildSummary(total, imageCount, fileCount) {
    const el = document.createElement('div');
    el.className = 'wbDockMeta';
    const parts = [];
    parts.push((total === 1) ? '1 attachment' : (total + ' attachments'));
    if (imageCount) parts.push(imageCount + ' image' + (imageCount === 1 ? '' : 's'));
    if (fileCount) parts.push(fileCount + ' file' + (fileCount === 1 ? '' : 's'));
    el.textContent = parts.join(' • ');
    return el;
  }

  function kindLabel(kind) {
    if (kind === 'image') return 'image';
    if (kind === 'file') return 'file';
    return kind || 'item';
  }

  function renderList(container, items) {
    clearChildren(container);

    let imageCount = 0;
    let fileCount = 0;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].kind === 'image') imageCount += 1;
      else if (items[i].kind === 'file') fileCount += 1;
    }
    container.appendChild(buildSummary(items.length, imageCount, fileCount));

    const list = document.createElement('ul');
    list.className = 'wbDockList';
    list.setAttribute('role', 'list');

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];

      const li = document.createElement('li');
      li.className = 'wbDockRow';
      const rowKey = (it.msgId ? (it.msgId + ':' + i) : ('idx:' + i));
      li.setAttribute('data-row-key', rowKey);

      const body = document.createElement('div');
      body.className = 'wbDockRowBody';

      const textEl = document.createElement('div');
      textEl.className = 'wbDockRowText';
      textEl.textContent = truncate(it.label || '(unnamed)', 240);
      body.appendChild(textEl);

      const metaParts = [];
      const k = kindLabel(it.kind);
      if (k) metaParts.push(k);
      if (it.ext) {
        const display = FILE_EXTS[it.ext] || it.ext.toUpperCase();
        metaParts.push(display);
      }
      if (it.msgId) metaParts.push('msg ' + truncate(it.msgId, 16));
      else if (it.turnId) metaParts.push('turn ' + truncate(it.turnId, 16));
      if (metaParts.length) {
        const metaEl = document.createElement('div');
        metaEl.className = 'wbDockMeta';
        metaEl.textContent = metaParts.join(' • ');
        body.appendChild(metaEl);
      }

      /* URL preview line (plain text — NOT an <a> element). Skip
       * cumbersome data: URIs entirely. */
      if (it.url && it.scheme !== 'data') {
        const urlEl = document.createElement('div');
        urlEl.className = 'wbDockMeta';
        urlEl.textContent = truncate(it.url, 240);
        body.appendChild(urlEl);
      }

      li.appendChild(body);
      list.appendChild(li);
    }
    container.appendChild(list);
  }

  dock.registerTab('attachments', {
    id: 'attachments',
    title: 'Attachments',
    icon: '📎',
    txt: 'A',
    color: '#345E9E',
    order: 40,
    disabled: false,
    phase: '2c-readonly-dom',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;

      const reader = readerRootEl();
      if (!reader) {
        renderEmpty(container, 'Open a saved chat reader to view attachments.');
        return;
      }

      try {
        const items = scanReader(reader);
        if (!items.length) {
          renderEmpty(container, 'No attachments found in this reader.');
        } else {
          renderList(container, items);
        }
      } catch (_) {
        renderError(container, 'Failed to render Attachments.');
      }

      /* Phase 2C-A: single scan per render. No MutationObserver, no
       * polling, no subscription. Re-rendering happens when the user
       * re-selects this tab (dock-shell handles that). */
      return function cleanup() { /* no resources to release */ };
    },
  });
})(globalThis);
