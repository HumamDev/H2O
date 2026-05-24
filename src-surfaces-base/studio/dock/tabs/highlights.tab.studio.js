/* H2O Studio — Dock Tab: Highlights (Phase 2C-H, read-only rendering)
 *
 * Phase 2C-H: First real-data Dock tab. Renders highlight items from
 * H2O.Studio.store.highlights as a read-only flat list.
 *
 * Read-only contract (V1):
 *   - Reads via H2O.Studio.store.highlights.getAll() (sync, live cache).
 *   - Subscribes via H2O.Studio.store.highlights.subscribe(fn) for live
 *     refresh; the returned cleanup function is handed back to dock-shell
 *     via the render() return value (dock-shell:374-377, 414-417 honor
 *     this contract — it runs on tab switch and on unmount).
 *   - Never calls update / setForAnswer / removeForAnswer / saveNow /
 *     setCurrentColor or any other write API.
 *   - Never mutates the live cache object returned by getAll().
 *   - Never scrolls the reader, never touches the native runtime.
 *
 * Wire format mirrored from native 3H1a (Highlights Engine):
 *   blob.itemsByAnswer[answerId] = Item[]
 *   Item = { id, color, anchors: { xpath, textPos, textQuote }, ts, pairNo }
 *   text snippet lives at  item.anchors.textQuote.exact   (3H1a:2754-2755)
 *   color is a name token ('gold'/'red'/'blue'/...), not a hex string.
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:215 (DPANEL_RAIL_ITEMS[0]).
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

  /* Color-name → hex swatch map. Mirrors native palette
   * (3H1a CFG_PALETTE_DEFAULTS:129-136). If a stored item uses a name
   * outside this map we fall back to a neutral swatch — never throw. */
  const COLOR_HEX = Object.freeze({
    blue:   '#3B82F6',
    red:    '#FF4C4C',
    green:  '#22C55E',
    gold:   '#FFD54F',
    sky:    '#7DD3FC',
    pink:   '#F472B6',
    purple: '#A855F7',
    orange: '#FF914D',
  });
  const NEUTRAL_SWATCH = '#888888';

  function isPlainObject(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }

  /* Defensively flatten the store blob into an ordered display list.
   * Tolerates: missing itemsByAnswer, non-array values, items without
   * id/color/text/ts. Newest first by ts (descending). Never mutates
   * the source. */
  function flattenItems(blob) {
    const out = [];
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
        const text = String(exact || '').replace(/\s+/g, ' ').trim();
        const id = it.id != null ? String(it.id) : '';
        const color = it.color != null ? String(it.color) : '';
        const ts = (typeof it.ts === 'number' && isFinite(it.ts)) ? it.ts : 0;
        out.push({
          key: aId + ':' + (id || j),
          answerId: aId,
          id: id,
          color: color,
          text: text,
          ts: ts,
        });
      }
    }
    out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return out;
  }

  function formatTs(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString();
    } catch (_) { return ''; }
  }

  function truncate(s, max) {
    const str = String(s || '');
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trimEnd() + '…';
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderError(container, msg) {
    try {
      clearChildren(container);
      const box = document.createElement('div');
      box.className = 'wbDockError';
      box.textContent = msg || 'Could not load Highlights.';
      container.appendChild(box);
    } catch (_) { /* swallow */ }
  }

  function renderEmpty(container) {
    clearChildren(container);
    const box = document.createElement('div');
    box.className = 'wbDockEmpty';
    box.textContent = 'No highlights found for this chat yet.';
    container.appendChild(box);
  }

  function renderList(container, items) {
    clearChildren(container);
    const list = document.createElement('ul');
    list.className = 'wbDockList';
    list.setAttribute('role', 'list');
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      const li = document.createElement('li');
      li.className = 'wbDockRow';
      li.setAttribute('data-row-key', it.key);

      const swatch = document.createElement('span');
      swatch.className = 'wbDockSwatch';
      swatch.setAttribute('aria-hidden', 'true');
      const hex = COLOR_HEX[it.color] || NEUTRAL_SWATCH;
      swatch.style.setProperty('--wb-dock-swatch-color', hex);
      if (it.color) swatch.title = it.color;

      const body = document.createElement('div');
      body.className = 'wbDockRowBody';

      const textEl = document.createElement('div');
      textEl.className = 'wbDockRowText';
      textEl.textContent = it.text ? truncate(it.text, 240) : '(no text captured)';

      const meta = document.createElement('div');
      meta.className = 'wbDockMeta';
      const parts = [];
      if (it.color) parts.push(it.color);
      if (it.answerId) parts.push('msg ' + truncate(it.answerId, 16));
      const tsStr = formatTs(it.ts);
      if (tsStr) parts.push(tsStr);
      meta.textContent = parts.join(' • ');

      body.appendChild(textEl);
      if (parts.length) body.appendChild(meta);
      li.appendChild(swatch);
      li.appendChild(body);
      list.appendChild(li);
    }
    container.appendChild(list);
  }

  dock.registerTab('highlights', {
    id: 'highlights',
    title: 'Highlights',
    icon: '🌈',
    txt: 'H',
    color: '#C7A106',
    order: 10,
    disabled: false,
    phase: '2c-read-only',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;

      const store = H2O.Studio && H2O.Studio.store;
      const hlStore = store && store.highlights;
      if (!hlStore || typeof hlStore.getAll !== 'function') {
        renderError(container, 'Highlights store is unavailable.');
        return;
      }

      function paint() {
        try {
          const blob = hlStore.getAll();
          const items = flattenItems(blob);
          if (!items.length) {
            renderEmpty(container);
          } else {
            renderList(container, items);
          }
        } catch (e) {
          renderError(container, 'Failed to render Highlights.');
        }
      }

      paint();

      let unsub = null;
      if (typeof hlStore.subscribe === 'function') {
        try {
          unsub = hlStore.subscribe(function (/* evt */) { paint(); });
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
