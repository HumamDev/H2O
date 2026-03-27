// ==UserScript==
// @h2o-id             1d1a.code.line.numbers
// @name               1D1a.🔴💻 Code Line Numbers 💻
// @namespace          H2O.Premium.CGX.code.line.numbers
// @author             HumamDev
// @version            5.7.0
// @revision           001
// @build              260304-102754
// @description        1:1 alignment via measured line-step + baseline-lock. Premium gutter: removes left black strip by moving padding to code only. Per-line number color matches first visible token color (offset->textnode->span color). Hotkeys: Alt+↑/↓ shift, Alt+Shift+↑/↓ nudge, Alt+0 reset.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const DONE_ATTR      = 'data-h2o-ln-mlock';
  const HOST_CLASS     = 'h2o-ln-host';
  const GUTTER_CLASS   = 'h2o-ln-gutter';
  const NUM_CLASS      = 'h2o-ln-num';
  const CODEWRAP_CLASS = 'h2o-ln-codewrap';

  const LANG_OK = new Set(['js', 'javascript', 'jsx', 'mjs', 'cjs']);

  const LS_SHIFT_PREFIX = 'H2O:ln:shift:';
  const LS_NUDGE_PREFIX = 'H2O:ln:nudge:';

  const COLORIZE_NUMBERS   = true;
  const COLORIZE_MAX_LINES = 600;

  const layoutFn = new WeakMap(); // scrollEl -> fn
  let active = null;             // { scrollEl, key }


  // ───────────────────────── Styles 🎨 ─────────────────────────
const GUTTER_BG_DARK  = 'rgba(0,0,0,0.55)'; // try 0.35 → 0.75
const GUTTER_BG_LIGHT = 'rgba(0,0,0,0.20)'; // try 0.10 → 0.35
const EMPTY_LINE_NUM_COLOR_DARK  = 'rgba(160,160,160,0.55)'; // matte gray
const EMPTY_LINE_NUM_COLOR_LIGHT = 'rgba(120,120,120,0.55)'; // matte gray (light mode)


  const style = document.createElement('style');

  style.textContent = `
    .${HOST_CLASS}{
      display:flex;
      align-items:flex-start;
      width:100%;
      min-width:100%;
    }

    .${GUTTER_CLASS}{
      user-select:none;
      text-align:right;
      border-right:1px solid rgba(255,255,255,0.10);

  // background:rgba(255,255,255,0.035);   // 👈 CHANGE THIS (dark mode)
  // background:rgba(0,0,0,0.028);       // 👈 CHANGE THIS (light mode)

  background:${GUTTER_BG_DARK};

 // background:${GUTTER_BG_LIGHT};


      opacity:0.92;

      position:sticky;
      left:0;
      z-index:2;

      padding:0 10px 0 12px;
      margin:0;
      pointer-events:none;

      will-change: transform;
    }

    .${NUM_CLASS}{
      display:block;
      padding:0; margin:0;
      white-space:nowrap;
    }

    .${CODEWRAP_CLASS}{
      flex:1 1 auto;
      min-width:0;
    }

    .${CODEWRAP_CLASS} > code{
      display:block;
      white-space:pre !important;
      overflow-wrap:normal !important;
      word-break:normal !important;
    }

    @media (prefers-color-scheme: light){
      .${GUTTER_CLASS}{
        border-right:1px solid rgba(0,0,0,0.10);
        background:rgba(0,0,0,0.028);
        opacity:0.92;
      }
    }
  `;
  document.head.appendChild(style);

  // ───────────────────────── Utils 🧠 ─────────────────────────
  function chatId() {
    const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : 'nochat';
  }

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  function normText(s) {
    return String(s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function cleanLine(s) {
    return String(s ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
  }

  function detectLang(codeEl) {
    const cls = (codeEl.className || '').toLowerCase();
    const m = cls.match(/language-([a-z0-9_+-]+)/i);
    if (m?.[1]) return m[1].toLowerCase();
    const dl = (codeEl.getAttribute('data-language') || '').toLowerCase();
    return dl || '';
  }

  function getBlockKey(codeText) {
    const head = codeText.slice(0, 5000);
    return `${chatId()}:${fnv1a(head)}`;
  }

  function readInt(k, def = 0) {
    const v = localStorage.getItem(k);
    const n = v == null ? def : parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  }

  function writeInt(k, n) {
    if (!n) localStorage.removeItem(k);
    else localStorage.setItem(k, String(n));
  }

  function totalLines(lines) {
    if (lines.length > 1 && lines[lines.length - 1] === '') return lines.length - 1;
    return Math.max(1, lines.length);
  }

  function firstNonEmptyIndex(lines, from = 0) {
    let i = Math.max(0, from);
    while (i < lines.length && cleanLine(lines[i]) === '') i++;
    return i;
  }

  function isPureLabelLine(s) {
    const t = String(s ?? '').trim();
    return /^[a-zA-Z][a-zA-Z0-9+.#-]{0,19}$/.test(t);
  }

  function looksLikeCodeLine(s) {
    const t = String(s ?? '').trim();
    if (!t) return false;
    return /^\/\/|^\/\*|^\*|^;|^\(|^\{|^\[|^<|^import\b|^export\b|^const\b|^let\b|^var\b|^function\b|^class\b|^if\b|^for\b|^while\b|^return\b|^try\b|^catch\b|^switch\b|^async\b|^await\b/.test(t);
  }

  function getHeaderLanguageLabel(codeEl) {
    let root = codeEl.parentElement;
    for (let depth = 0; depth < 10 && root; depth++, root = root.parentElement) {
      const btn = Array.from(root.querySelectorAll('button')).find(b => {
        const tx = (b.textContent || '').trim().toLowerCase();
        const al = (b.getAttribute('aria-label') || '').trim().toLowerCase();
        return tx === 'copy code' || al.includes('copy code');
      });
      if (!btn) continue;

      const row = btn.closest('div') || btn.parentElement || root;
      const candidates = Array.from(row.querySelectorAll('*'))
        .filter(el => el !== btn && !el.closest('button'))
        .map(el => (el.textContent || '').trim())
        .filter(t => t && t.length <= 24 && !/copy/i.test(t));

      return candidates[0] || '';
    }
    return '';
  }

  function computeAutoStartIndex(linesArr, headerLabelText) {
    const n0 = firstNonEmptyIndex(linesArr, 0);
    if (n0 >= linesArr.length) return 0;

    const hdr = cleanLine(headerLabelText);
    const first = cleanLine(linesArr[n0]);

    let autoStart = n0;

    if (hdr && isPureLabelLine(linesArr[n0])) {
      const hdrOK =
        (hdr === first) ||
        (hdr === 'javascript' && (first === 'js' || first === 'javascript')) ||
        (hdr === 'js' && (first === 'js' || first === 'javascript'));

      const next = firstNonEmptyIndex(linesArr, n0 + 1);
      const nextLine = next < linesArr.length ? linesArr[next] : '';

      if (hdrOK && looksLikeCodeLine(nextLine)) autoStart = next;
    }

    return Math.min(autoStart, Math.max(0, totalLines(linesArr) - 1));
  }

  // ✅ ChatGPT scroll box wrapper (reliable in your HTML: overflow-y-auto p-4)
  function getScrollContainer(codeEl) {
    return codeEl.closest('div.overflow-y-auto') || null;
  }

  // Text nodes index (offset -> node)
  function buildTextNodesIndex(codeEl) {
    const nodes = [];
    const tw = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT, null);
    let n, total = 0;
    while ((n = tw.nextNode())) {
      const len = n.nodeValue?.length ?? 0;
      if (!len) continue;
      nodes.push({ node: n, start: total, end: total + len });
      total += len;
    }
    return { nodes, total };
  }

  function nodeAtOffset(index, offset) {
    offset = Math.max(0, Math.min(offset, index.total));
    for (const it of index.nodes) {
      if (offset >= it.start && offset < it.end) return { node: it.node, off: offset - it.start };
    }
    const last = index.nodes[index.nodes.length - 1];
    if (last) return { node: last.node, off: (last.node.nodeValue?.length ?? 0) };
    return null;
  }

  function topForOffset(codeEl, index, offset) {
    const pos = nodeAtOffset(index, offset);
    if (!pos) return null;
    const r = document.createRange();
    try {
      r.setStart(pos.node, pos.off);
      r.setEnd(pos.node, Math.min(pos.off + 1, pos.node.nodeValue?.length ?? 0));
    } catch { return null; }

    const rects = r.getClientRects();
    const rect = rects && rects[0] ? rects[0] : r.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.top) || rect.height <= 0) return null;
    return rect.top;
  }

  function computeLineStartOffsets(text, linesTotal) {
    const starts = new Array(linesTotal);
    let line = 0;
    starts[line++] = 0;
    for (let i = 0; i < text.length && line < linesTotal; i++) {
      if (text[i] === '\n') starts[line++] = i + 1;
    }
    return starts;
  }

  function findFirstVisibleCharOffset(raw) {
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch !== '\n' && ch !== '\r') return i;
    }
    return 0;
  }

  function findSecondLineCharOffset(raw) {
    const nl = raw.indexOf('\n');
    if (nl < 0) return null;
    for (let i = nl + 1; i < raw.length; i++) {
      const ch = raw[i];
      if (ch !== '\n' && ch !== '\r') return i;
    }
    return nl + 1;
  }

  function buildNumbersDOM(gutter, linesTotal, startIndex, lineH, digits) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < linesTotal; i++) {
      const s = document.createElement('span');
      s.className = NUM_CLASS;

      s.textContent = (i < startIndex) ? '' : String(i - startIndex + 1);

      s.style.minWidth = `${digits}ch`;
      s.style.lineHeight = `${lineH}px`;
      s.style.height = `${lineH}px`;

      frag.appendChild(s);
    }
    gutter.textContent = '';
    gutter.appendChild(frag);
  }

  function applyToCode(codeEl) {
    if (!codeEl || !(codeEl instanceof HTMLElement)) return;

    const lang = detectLang(codeEl);
    if (!LANG_OK.has(lang)) return;

    const scrollEl = getScrollContainer(codeEl);
    if (!scrollEl) return;
    if (scrollEl.hasAttribute(DONE_ATTR)) return;

    scrollEl.setAttribute(DONE_ATTR, '1');

    // ✅ Premium look: remove LEFT padding black strip, but keep code padding
    const csScroll = getComputedStyle(scrollEl);
    const padL = parseFloat(csScroll.paddingLeft) || 0;
    if (!scrollEl.dataset.h2oPadL) {
      scrollEl.dataset.h2oPadL = String(padL);
      // Only kill left padding so gutter starts at the true left edge
      scrollEl.style.paddingLeft = '0px';
    }

    // Build host inside scrollEl and move code into it
    const host = document.createElement('div');
    host.className = HOST_CLASS;

    const gutter = document.createElement('div');
    gutter.className = GUTTER_CLASS;
    gutter.setAttribute('aria-hidden', 'true');

    const codeWrap = document.createElement('div');
    codeWrap.className = CODEWRAP_CLASS;
    // Put old padding back on the code side only (so text keeps its “nice inset”)
    codeWrap.style.paddingLeft = `${padL}px`;

    scrollEl.insertBefore(host, codeEl);
    host.appendChild(gutter);
    host.appendChild(codeWrap);
    codeWrap.appendChild(codeEl);

    host.addEventListener('mouseenter', () => {
      const raw = normText(codeEl.textContent);
      active = { scrollEl, key: getBlockKey(raw) };
    });
    host.addEventListener('mouseleave', () => {
      if (active?.scrollEl === scrollEl) active = null;
    });

    const layout = () => {
      const raw = normText(codeEl.textContent);
      const linesArr = raw.split('\n');
      const linesTotal = totalLines(linesArr);

      const blockKey = getBlockKey(raw);
      const shiftKey = `${LS_SHIFT_PREFIX}${blockKey}`;
      const nudgeKey = `${LS_NUDGE_PREFIX}${blockKey}`;
      const shift = readInt(shiftKey, 0);
      const nudgePx = readInt(nudgeKey, 0);

      const headerLabel = getHeaderLanguageLabel(codeEl);
      const autoStart = computeAutoStartIndex(linesArr, headerLabel);
      const startIndex = Math.min(Math.max(0, autoStart + shift), Math.max(0, linesTotal - 1));

      // Match code typography
      const cs = getComputedStyle(codeEl);
      gutter.style.fontFamily = cs.fontFamily;
      gutter.style.fontSize = cs.fontSize;
      gutter.style.fontWeight = cs.fontWeight;
      gutter.style.letterSpacing = cs.letterSpacing;

      // Measure real line-step (px)
      const idx = buildTextNodesIndex(codeEl);
      const off1 = findFirstVisibleCharOffset(raw);
      const off2 = findSecondLineCharOffset(raw);

      const y1 = topForOffset(codeEl, idx, off1);
      const y2 = (off2 == null) ? null : topForOffset(codeEl, idx, off2);

      let lineH = null;
      if (y1 != null && y2 != null) {
        const step = y2 - y1;
        if (Number.isFinite(step) && step > 6 && step < 80) lineH = step;
      }
      if (!lineH) {
        const fs = parseFloat(cs.fontSize) || 13;
        lineH = parseFloat(cs.lineHeight);
        if (!Number.isFinite(lineH) || lineH <= 0) lineH = Math.round(fs * 1.5);
      }
      gutter.style.lineHeight = `${lineH}px`;

      // Width by digits
      const maxNum = Math.max(1, linesTotal - startIndex);
      const digits = String(maxNum).length;
      gutter.style.minWidth = `${digits + 3}ch`;

      // Render numbers
      const renderKey = `R|${linesTotal}|${startIndex}|${Math.round(lineH)}`;
      if (gutter.dataset.h2oKey !== renderKey) {
        buildNumbersDOM(gutter, linesTotal, startIndex, lineH, digits);
        gutter.dataset.h2oKey = renderKey;
      }

      // ✅ Baseline lock
      gutter.style.transform = '';
      const gutTop = gutter.getBoundingClientRect().top;
      const baseShift = (y1 != null) ? (y1 - gutTop) : 0;
      const totalShift = baseShift + nudgePx;
      gutter.style.transform = totalShift ? `translateY(${totalShift}px)` : '';

      // ✅ True token color per line (reliable)
      if (COLORIZE_NUMBERS && linesTotal <= COLORIZE_MAX_LINES) {
        const starts = computeLineStartOffsets(raw, linesTotal);
        const kids = gutter.children;

        for (let i = 0; i < kids.length; i++) {
          // blank or hidden line numbers => just inherit base
          if (i < startIndex) {
            kids[i].style.color = '';
            continue;
          }

          const line = linesArr[i] ?? '';

const j = line.search(/[^\s]/); // first non-space
if (j < 0) {
  const isLight = matchMedia('(prefers-color-scheme: light)').matches;
  kids[i].style.color = isLight ? EMPTY_LINE_NUM_COLOR_LIGHT : EMPTY_LINE_NUM_COLOR_DARK;
  continue;
}


          const off = (starts[i] ?? 0) + j;
          const pos = nodeAtOffset(idx, off);
          const el = pos?.node?.parentElement;

          // Use token span color when possible, fallback to code color
          kids[i].style.color = el ? getComputedStyle(el).color : getComputedStyle(codeEl).color;
        }
      }

      if (active?.scrollEl === scrollEl) active.key = blockKey;
    };

    layoutFn.set(scrollEl, layout);

    const ro = new ResizeObserver(() => requestAnimationFrame(layout));
    ro.observe(scrollEl);

    const mo = new MutationObserver(() => requestAnimationFrame(layout));
    mo.observe(codeEl, { characterData: true, childList: true, subtree: true });

    layout();
  }

  // ───────────────────────── Hotkeys 🎹 ─────────────────────────
  window.addEventListener('keydown', (e) => {
    if (!active || !e.altKey) return;
    const key = active.key;
    if (!key) return;

    const shiftKey = `${LS_SHIFT_PREFIX}${key}`;
    const nudgeKey = `${LS_NUDGE_PREFIX}${key}`;

    const rerun = () => {
      const f = layoutFn.get(active.scrollEl);
      f && requestAnimationFrame(f);
    };

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (e.shiftKey) writeInt(nudgeKey, readInt(nudgeKey, 0) + 1);
      else writeInt(shiftKey, readInt(shiftKey, 0) + 1);
      rerun();
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.shiftKey) writeInt(nudgeKey, readInt(nudgeKey, 0) - 1);
      else writeInt(shiftKey, readInt(shiftKey, 0) - 1);
      rerun();
    }

    if (e.key === '0') {
      e.preventDefault();
      writeInt(shiftKey, 0);
      writeInt(nudgeKey, 0);
      rerun();
    }
  }, true);

  // ───────────────────────── Scan + Observe 👀 ─────────────────────────
  function scan(root = document) {
    root.querySelectorAll('code').forEach(applyToCode);
  }

  scan();

  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches?.('code')) applyToCode(n);
        else scan(n);
      }
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

})();
