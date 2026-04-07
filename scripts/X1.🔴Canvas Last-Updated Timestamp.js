// ==UserScript==
// @h2o-id             x1.canvas.last.updated.timestamp
// @name               X1.🔴Canvas Last-Updated Timestamp
// @namespace          H2O.Premium.CGX.canvas.last.updated.timestamp
// @author             HumamDev
// @version            2.0
// @revision           001
// @build              260304-102754
// @description        Shows a centered "Last updated" timestamp at the top of the right-side canvas and keeps it in sync on edits
// @match              https://chatgpt.com/*
// @grant              none
// @run-at             document-idle
// ==/UserScript==

(() => {
  'use strict';

  const DEBUG = true;
  const log = (...a) => DEBUG && console.log('[canvas-ts]', ...a);

  // Small helpers
  const nowStamp = () =>
    new Date().toLocaleString(undefined, { hour12: false });

  const setRel = el => {
    const s = getComputedStyle(el);
    if (s.position === 'static') el.style.position = 'relative';
  };

  // Inject the timestamp pill into a header container
  function injectTimestamp(header, titleText) {
    if (!header || !titleText) return;

    // Avoid duplicate
    if (header.querySelector('.ho-canvas-timestamp')) return;

    setRel(header);

    const ts = document.createElement('div');
    ts.className = 'ho-canvas-timestamp';
    ts.style.cssText = `
      position:absolute;
      left:50%;
      transform:translateX(-50%);
      top:6px;
      font-size:12px;
      color:#9aa1a8;
      pointer-events:none;
      z-index:10;
      font-style:italic;
      white-space:nowrap;
      opacity:0.9;
    `;

    const key = 'canvas-ts-' + titleText;
    let stamp = localStorage.getItem(key);
    if (!stamp) {
      stamp = nowStamp();
      localStorage.setItem(key, stamp);
    }
    ts.textContent = `Last updated: ${stamp}`;
    header.appendChild(ts);
    log('Injected timestamp for', titleText);
  }

  // Update localStorage + visible pill
  function bumpTimestamp(header, titleText) {
    if (!header || !titleText) return;
    const key = 'canvas-ts-' + titleText;
    const stamp = nowStamp();
    localStorage.setItem(key, stamp);
    const pill = header.querySelector('.ho-canvas-timestamp');
    if (pill) pill.textContent = `Last updated: ${stamp}`;
    log('Bumped timestamp for', titleText, stamp);
  }

  // Try to find the right-side canvas header + title robustly
  function findCanvasHeader() {
    // 1) Obvious: a header area that contains an H3 title + action icons (svgs)
    const candidates = Array.from(
      document.querySelectorAll(
        'div:has(> h3), header:has(> h3), [role="toolbar"]:has(h3)'
      )
    ).filter(box => {
      // Likely on the right half (canvas panel)
      const r = box.getBoundingClientRect();
      return r.width > 300 && r.left > window.innerWidth / 2 - 40;
    });

    // Prefer one that has some action icons on the right (svgs/buttons)
    let header =
      candidates.find(c => c.querySelector('svg,button,[role="button"]')) ||
      candidates[0];

    if (!header) return null;

    // Title element
    const h3 = header.querySelector('h3');
    const titleText = h3?.textContent?.trim() || '';

    if (!titleText) return null;

    return { header, titleText };
  }

  // Find the canvas content root for change tracking
  function findCanvasContentRoot(header) {
    // The editor area is usually just below the header
    // Walk down a bit to find either:
    // - rich doc: [contenteditable="true"]
    // - monaco: .monaco-editor or textarea[aria-label*="Editor"]
    let root = header.parentElement;
    for (let i = 0; i < 4 && root; i++) root = root.nextElementSibling || root;

    // Wider fallback search in the right half of the screen
    const rightSide = document.elementFromPoint(
      window.innerWidth - 10,
      100
    )?.closest('div');

    const searchScopes = [root, header.parentElement, rightSide, document.body];

    for (const scope of searchScopes) {
      if (!scope) continue;
      const rich = scope.querySelector('[contenteditable="true"]');
      if (rich) return rich;

      const monaco =
        scope.querySelector('.monaco-editor') ||
        scope.querySelector('textarea[aria-label*="Editor"], [role="textbox"]');
      if (monaco) return monaco;
    }
    return null;
  }

  // Attach listeners/observer to detect edits and bump the timestamp
  function attachChangeWatch(contentRoot, header, titleText) {
    if (!contentRoot || contentRoot.__hoTsWatch) return;
    contentRoot.__hoTsWatch = true;

    // Rich text edits
    contentRoot.addEventListener('input', () =>
      bumpTimestamp(header, titleText)
    );

    // Key presses (Monaco / generic)
    contentRoot.addEventListener('keyup', e => {
      // Ignore pure navigation to reduce noise; still OK to just bump
      bumpTimestamp(header, titleText);
    });

    // MutationObserver for async content updates/autosave
    const mo = new MutationObserver(() => bumpTimestamp(header, titleText));
    mo.observe(contentRoot, { childList: true, subtree: true, characterData: true });

    // Also listen to Cmd/Ctrl+S just in case
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        bumpTimestamp(header, titleText);
      }
    });

    log('Change watch attached');
  }

  // Main: watch DOM for canvas headers, inject + track
  function bootstrap() {
    // Re-scan periodically in case the panel re-renders
    setInterval(() => {
      const ctx = findCanvasHeader();
      if (!ctx) return;

      const { header, titleText } = ctx;
      injectTimestamp(header, titleText);

      const contentRoot = findCanvasContentRoot(header);
      if (contentRoot) attachChangeWatch(contentRoot, header, titleText);
    }, 800);

    // Also observe for faster reactions
    const obs = new MutationObserver(() => {
      const ctx = findCanvasHeader();
      if (!ctx) return;
      const { header, titleText } = ctx;
      injectTimestamp(header, titleText);
      const contentRoot = findCanvasContentRoot(header);
      if (contentRoot) attachChangeWatch(contentRoot, header, titleText);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // Quick manual refresh: Alt+L → bump timestamp for visible canvas
  window.addEventListener('keydown', e => {
    if (e.altKey && e.key.toLowerCase() === 'l') {
      const ctx = findCanvasHeader();
      if (ctx) bumpTimestamp(ctx.header, ctx.titleText);
    }
  });

  bootstrap();
})();
