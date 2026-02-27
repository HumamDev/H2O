// ==UserScript==
// @h2o-id      0z1b.control.hub.quick.tree
// @name         0Z1.⚫️🌳 Control Hub Quick Tree
// @namespace    H2O.ChatGPT.POC
// @version      0.3.1
// @description  Double-click Control Hub button to open an animated tree-like quick tools overlay (empty buttons for now).
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // Stable Control Hub selectors (new + legacy owner keys).
  const SEL_CONTROL_HUB_BTN = [
    '[data-cgxui="cnhb-topbtn"][data-cgxui-owner="cnhb"]',
    '[data-cgxui="cntrlhb-topbtn"][data-cgxui-owner="cntrlhb"]',
  ].join(",");

  // Placeholder nodes only (no real actions yet).
  // Keep ids stable for future hooks.
  const QUICK_NODES = Object.freeze([
    { id: "left", label: "Left" },
    { id: "mid", label: "Middle" },
    { id: "right", label: "Right" },
  ]);

  const CFG = Object.freeze({
    zIndex: 999999,
    dropGap: 5,
    sourceY: 10,
    childDropY: 54,
    childGapX: 108,
    curveK1: 18,
    curveK2: 14,
    sidePadX: 52,
    bottomPadY: 14,
    nodeWidth: 60,
    nodeHeight: 32,
    nodeRadius: 12,
    clampMargin: 8,
    drawMs: 340,
    popMs: 220,
    staggerMs: 55,
    singleClickDelayMs: 280,
    closeOnOutsidePointer: true,
    closeOnEsc: true,
  });

  const IDS = Object.freeze({
    style: "h2o-chqt-style",
    root: "h2o-chqt-root",
  });

  const CLS = Object.freeze({
    open: "h2o-chqt-open",
    wrap: "h2o-chqt-wrap",
    panel: "h2o-chqt-panel",
    shell: "h2o-chqt-shell",
    branch: "h2o-chqt-branch",
    node: "h2o-chqt-node",
  });

  const SVG_NS = "http://www.w3.org/2000/svg";
  const NODE_ID_SET = new Set(["left", "mid", "right"]);
  const ATTR_EXPORT_HIDDEN = "data-h2o-chqt-export-hidden";
  const FORWARDED_CLICK_EVENTS = new WeakSet();
  const EXPORT_STYLE_BACKUP = new WeakMap();

  const STATE = {
    hubBtn: null,
    exportBtn: null,
    root: null,
    wrap: null,
    panel: null,
    isOpen: false,
    openListenersAttached: false,
    pendingClickTimer: 0,
    pendingClickPayload: null,
    syncQueued: false,
    repositionRaf: 0,
    suppressDblUntil: 0,
    observer: null,
    hubResizeObserver: null,
  };

  // ---------- utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style") Object.assign(n.style, v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, "");
      else if (v !== false && v != null) n.setAttribute(k, String(v));
    }
    for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function svgEl(tag, attrs = {}) {
    const n = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== false && v != null) n.setAttribute(k, String(v));
    }
    return n;
  }

  function findHubButton() {
    const nodes = document.querySelectorAll(SEL_CONTROL_HUB_BTN);
    for (const n of nodes) {
      if (n && n.isConnected) return n;
    }
    return null;
  }

  function eventHitsEl(event, targetEl) {
    if (!targetEl) return false;
    if (typeof event.composedPath === "function") {
      const path = event.composedPath();
      if (Array.isArray(path) && path.includes(targetEl)) return true;
    }
    const t = event.target;
    return !!(t && typeof targetEl.contains === "function" && targetEl.contains(t));
  }

  function clearPendingSingleClick() {
    if (STATE.pendingClickTimer) {
      clearTimeout(STATE.pendingClickTimer);
      STATE.pendingClickTimer = 0;
    }
    STATE.pendingClickPayload = null;
  }

  function normText(val) {
    return String(val || "").replace(/\s+/g, " ").trim();
  }

  function isCandidateEl(el, requireVisible = false) {
    if (!(el instanceof HTMLElement)) return false;
    if (!el.isConnected) return false;
    if (el.closest(`#${IDS.root}`)) return false;
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return false;
    if (requireVisible) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
    }
    return true;
  }

  function findExportButton() {
    // 1) aria-label/title contains "Export"
    const q1 = [
      'button[aria-label*="export" i]',
      'button[title*="export" i]',
      '[role="button"][aria-label*="export" i]',
      '[role="button"][title*="export" i]',
      '[aria-label*="export" i][tabindex]',
      '[title*="export" i][tabindex]',
    ].join(",");
    const byLabel = document.querySelectorAll(q1);
    for (const el of byLabel) {
      if (isCandidateEl(el)) return el;
    }

    // 2) around Cockpit Pro region: clickable text containing "Export"
    const hub = STATE.hubBtn || findHubButton();
    let cur = hub;
    for (let depth = 0; cur && depth < 4; depth += 1) {
      const candidates = cur.querySelectorAll("button,[role='button'],a,[tabindex]");
      for (const el of candidates) {
        if (!isCandidateEl(el)) continue;
        const txt = normText(el.textContent || el.innerText).toLowerCase();
        if (txt.includes("export")) return el;
      }
      cur = cur.parentElement;
    }

    // 3) fallback: visible controls with exact text "Export"
    const fallback = document.querySelectorAll("button,[role='button'],a,[tabindex]");
    for (const el of fallback) {
      if (!isCandidateEl(el, true)) continue;
      const txt = normText(el.textContent || el.innerText).toLowerCase();
      if (txt === "export") return el;
    }
    return null;
  }

  function softHideExportButton(btn) {
    if (!btn || !btn.isConnected) return;
    if (btn.getAttribute(ATTR_EXPORT_HIDDEN) === "1") return;
    if (!EXPORT_STYLE_BACKUP.has(btn)) {
      EXPORT_STYLE_BACKUP.set(btn, {
        visibility: btn.style.visibility,
        pointerEvents: btn.style.pointerEvents,
        opacity: btn.style.opacity,
      });
    }
    btn.style.visibility = "hidden";
    btn.style.pointerEvents = "none";
    btn.style.opacity = "0";
    btn.setAttribute(ATTR_EXPORT_HIDDEN, "1");
  }

  function unhideExportButton(btn) {
    if (!btn) return;
    const prev = EXPORT_STYLE_BACKUP.get(btn);
    if (prev) {
      btn.style.visibility = prev.visibility;
      btn.style.pointerEvents = prev.pointerEvents;
      btn.style.opacity = prev.opacity;
    } else {
      btn.style.removeProperty("visibility");
      btn.style.removeProperty("pointer-events");
      btn.style.removeProperty("opacity");
    }
    btn.removeAttribute(ATTR_EXPORT_HIDDEN);
  }

  function syncExportButton() {
    const next = findExportButton();
    if (next === STATE.exportBtn) {
      if (next) softHideExportButton(next);
      return;
    }

    if (STATE.exportBtn && STATE.exportBtn !== next) {
      unhideExportButton(STATE.exportBtn);
    }

    STATE.exportBtn = next;
    if (STATE.exportBtn) {
      softHideExportButton(STATE.exportBtn);
    }
  }

  function triggerExportFromRightNode() {
    let btn = STATE.exportBtn;
    if (!btn || !btn.isConnected) {
      syncExportButton();
      btn = STATE.exportBtn;
    }
    if (!btn || !btn.isConnected) {
      // Failsafe: if export cannot be resolved, unhide any tracked export button.
      if (STATE.exportBtn) unhideExportButton(STATE.exportBtn);
      return;
    }

    try {
      btn.click();
      return;
    } catch {}

    try {
      btn.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
      }));
    } catch {}
  }

  function clamp(n, min, max) {
    if (!Number.isFinite(n)) return min;
    if (!Number.isFinite(min)) min = n;
    if (!Number.isFinite(max)) max = n;
    if (max < min) return min;
    return Math.min(max, Math.max(min, n));
  }

  function buildLayout(nodes) {
    const list = Array.isArray(nodes)
      ? nodes.filter((n) => n && NODE_ID_SET.has(n.id))
      : [];
    if (!list.length) return null;

    const spread = Math.max(0, list.length - 1) * CFG.childGapX;
    const width = Math.max(260, spread + CFG.sidePadX * 2);

    const cx = width / 2;
    const source = { x: cx, y: CFG.sourceY };
    const childY = source.y + CFG.childDropY;
    const height = childY + Math.ceil(CFG.nodeHeight / 2) + CFG.bottomPadY;

    const points = new Map();
    const firstX = cx - spread / 2;
    list.forEach((n, i) => {
      points.set(n.id, { x: firstX + i * CFG.childGapX, y: childY });
    });

    const branches = [];
    list.forEach((n) => {
      const p = points.get(n.id);
      if (!p) return;
      const end = { x: p.x, y: p.y - CFG.nodeHeight / 2 };
      branches.push({
        start: source,
        cp1: { x: source.x, y: source.y + CFG.curveK1 },
        cp2: { x: end.x, y: end.y - CFG.curveK2 },
        end,
      });
    });

    return { width, height, source, points, branches, nodes: list };
  }

  function ensureStyles() {
    if ($(`#${IDS.style}`)) return;

    const css = `
#${IDS.root}{
  position: fixed;
  inset: 0;
  z-index: ${CFG.zIndex};
  pointer-events: none;
  visibility: hidden;
}
#${IDS.root}.${CLS.open}{
  visibility: visible;
}
#${IDS.root} .${CLS.wrap}{
  position: fixed;
  left: 0; top: 0;
  transform: translate(-9999px, -9999px);
}
#${IDS.root} .${CLS.panel}{
  position: absolute;
  left: 0; top: 0;
  transform: translate(-50%, 0) scale(0.94);
  transform-origin: top center;
  border-radius: 20px;
  overflow: visible;
  pointer-events: auto;
  opacity: 0;
  filter: drop-shadow(0 8px 24px rgba(0,0,0,.18));
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.2,.9,.2,1);
  will-change: transform, opacity;
}
#${IDS.root}.${CLS.open} .${CLS.panel}{
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}

#${IDS.root} .${CLS.shell}{
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 22px;
  background: radial-gradient(92% 74% at 50% 36%, rgba(20,34,52,.26), rgba(20,34,52,.08) 58%, rgba(20,34,52,0) 100%);
  border: 1px solid rgba(255,255,255,.025);
  box-shadow: 0 0 0 1px rgba(255,255,255,.015) inset;
  overflow: visible;
  isolation: isolate;
}

#${IDS.root} .${CLS.shell}::before{
  content: "";
  position: absolute;
  inset: -34px -46px -38px -46px;
  border-radius: 52px;
  pointer-events: none;
  background:
    radial-gradient(125% 95% at 50% 0%, rgba(128,190,255,.23), rgba(128,190,255,0) 58%),
    radial-gradient(95% 75% at 12% 74%, rgba(96,150,255,.13), rgba(96,150,255,0) 62%),
    radial-gradient(95% 75% at 88% 74%, rgba(112,176,255,.12), rgba(112,176,255,0) 62%),
    radial-gradient(86% 72% at 50% 44%, rgba(18,28,44,.46), rgba(18,28,44,.18) 60%, rgba(18,28,44,0) 100%);
  filter: blur(18px) saturate(1.08);
  opacity: .90;
  -webkit-mask-image: radial-gradient(120% 100% at 50% 38%, rgba(0,0,0,.98) 0%, rgba(0,0,0,.86) 46%, rgba(0,0,0,.36) 72%, transparent 100%);
  mask-image: radial-gradient(120% 100% at 50% 38%, rgba(0,0,0,.98) 0%, rgba(0,0,0,.86) 46%, rgba(0,0,0,.36) 72%, transparent 100%);
  z-index: 0;
}

#${IDS.root} .${CLS.shell}::after{
  content: "";
  position: absolute;
  inset: -8px -10px -10px -10px;
  border-radius: 30px;
  pointer-events: none;
  background: radial-gradient(85% 62% at 50% 16%, rgba(255,255,255,.09), rgba(255,255,255,0));
  opacity: .42;
  z-index: 0;
}

#${IDS.root} svg{
  position: absolute;
  inset: 0;
  display: block;
  overflow: visible;
  z-index: 1;
}

.${CLS.branch}{
  stroke: rgba(174,226,255,.6);
  stroke-width: 2.25;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: var(--h2o-chqt-len, 1);
  stroke-dashoffset: var(--h2o-chqt-len, 1);
  transition: stroke-dashoffset ${CFG.drawMs}ms cubic-bezier(.2,.85,.2,1);
}
#${IDS.root}.${CLS.open} .${CLS.branch}{
  stroke-dashoffset: 0;
}

.${CLS.node}{
  position: absolute;
  width: ${CFG.nodeWidth}px;
  height: ${CFG.nodeHeight}px;
  border-radius: ${CFG.nodeRadius}px;
  background: rgba(255,255,255,.10);
  border: 1px solid rgba(255,255,255,.20);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%) scale(.80);
  opacity: 0;
  transition:
    opacity 160ms ease,
    transform ${CFG.popMs}ms cubic-bezier(.2,.95,.2,1);
  transition-delay: var(--h2o-chqt-delay, 0ms);
  cursor: pointer;
  z-index: 2;
}

#${IDS.root}.${CLS.open} .${CLS.node}{
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.${CLS.node}::before{
  content:"";
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(210,240,255,.75);
  box-shadow: 0 0 16px rgba(140,210,255,.42);
  opacity: .95;
}

.${CLS.node}:hover{
  background: rgba(255,255,255,.18);
  border-color: rgba(255,255,255,.34);
}

.${CLS.node}:active{
  transform: translate(-50%, -50%) scale(.97);
}

.${CLS.node}:focus-visible{
  outline: 2px solid rgba(170,220,255,.65);
  outline-offset: 2px;
}
    `.trim();

    document.head.appendChild(el("style", { id: IDS.style }, [css]));
  }

  function ensureDOM() {
    ensureStyles();
    if (STATE.root && STATE.root.isConnected) return STATE.root;

    const layout = buildLayout(QUICK_NODES);
    if (!layout) return null;

    const root = el("div", { id: IDS.root, "aria-hidden": "true" });
    const wrap = el("div", { class: CLS.wrap });
    const panel = el("div", {
      class: CLS.panel,
      role: "dialog",
      "aria-label": "Control Hub Quick Tree",
      "aria-modal": "false",
    });
    panel.style.width = `${layout.width}px`;
    panel.style.height = `${layout.height}px`;

    const shell = el("div", { class: CLS.shell });
    const svg = svgEl("svg", {
      width: layout.width,
      height: layout.height,
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      "aria-hidden": "true",
      focusable: "false",
    });

    layout.branches.forEach((branch) => {
      const d = `M ${branch.start.x} ${branch.start.y} C ${branch.cp1.x} ${branch.cp1.y} ${branch.cp2.x} ${branch.cp2.y} ${branch.end.x} ${branch.end.y}`;
      const p = svgEl("path", { d, class: CLS.branch });
      svg.appendChild(p);
      let len = 1;
      try { len = Math.max(1, Math.ceil(p.getTotalLength())); } catch {}
      p.style.setProperty("--h2o-chqt-len", String(len));
    });

    shell.appendChild(svg);

    layout.nodes.forEach((node, index) => {
      const point = layout.points.get(node.id);
      if (!point) return;

      const btn = el("button", {
        class: CLS.node,
        type: "button",
        "data-h2o-qt-node": node.id,
        title: `${node.label} (placeholder)`,
        "aria-label": `${node.label} placeholder`,
      });
      btn.style.left = `${point.x}px`;
      btn.style.top = `${point.y}px`;
      btn.style.setProperty("--h2o-chqt-delay", `${80 + index * CFG.staggerMs}ms`);

      if (node.id === "right") {
        btn.title = "Export";
        btn.setAttribute("aria-label", "Export");
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          triggerExportFromRightNode();
        });
      } else {
        // Placeholder hook only. No real action yet.
        btn.addEventListener("click", (event) => event.preventDefault());
      }
      shell.appendChild(btn);
    });

    panel.appendChild(shell);
    wrap.appendChild(panel);
    root.appendChild(wrap);
    document.body.appendChild(root);

    STATE.root = root;
    STATE.wrap = wrap;
    STATE.panel = panel;

    return root;
  }

  function getAnchorCenter() {
    const btn = STATE.hubBtn;
    if (!btn || !btn.isConnected) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom + CFG.dropGap };
  }

  function positionTree() {
    if (!STATE.wrap || !STATE.panel) return false;
    const anchor = getAnchorCenter();
    if (!anchor) return false;

    let x = anchor.x;
    let y = anchor.y;
    const panelW = STATE.panel.offsetWidth || 0;
    const panelH = STATE.panel.offsetHeight || 0;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const m = CFG.clampMargin;

    if (panelW > 0 && vw > 0) {
      const minX = panelW / 2 + m;
      const maxX = vw - panelW / 2 - m;
      x = clamp(x, minX, maxX);
    }
    if (panelH > 0 && vh > 0) {
      const minY = m;
      const maxY = vh - panelH - m;
      y = clamp(y, minY, maxY);
    }

    STATE.wrap.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    return true;
  }

  function onOpenViewportChange() {
    if (!STATE.isOpen) return;
    if (STATE.repositionRaf) return;
    STATE.repositionRaf = requestAnimationFrame(() => {
      STATE.repositionRaf = 0;
      if (!STATE.isOpen) return;
      if (!positionTree()) closeTree();
    });
  }

  function onOpenPointerDown(event) {
    if (!CFG.closeOnOutsidePointer || !STATE.isOpen) return;
    if (eventHitsEl(event, STATE.panel)) return;
    if (eventHitsEl(event, STATE.hubBtn)) return;
    closeTree();
  }

  function onOpenKeyDown(event) {
    if (!CFG.closeOnEsc || !STATE.isOpen) return;
    if (event.key === "Escape") closeTree();
  }

  function attachOpenListeners() {
    if (STATE.openListenersAttached) return;
    document.addEventListener("pointerdown", onOpenPointerDown, true);
    document.addEventListener("keydown", onOpenKeyDown, true);
    document.addEventListener("scroll", onOpenViewportChange, true);
    window.addEventListener("scroll", onOpenViewportChange, { passive: true });
    window.addEventListener("resize", onOpenViewportChange, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("scroll", onOpenViewportChange, { passive: true });
      window.visualViewport.addEventListener("resize", onOpenViewportChange, { passive: true });
    }
    STATE.openListenersAttached = true;
  }

  function detachOpenListeners() {
    if (!STATE.openListenersAttached) return;
    document.removeEventListener("pointerdown", onOpenPointerDown, true);
    document.removeEventListener("keydown", onOpenKeyDown, true);
    document.removeEventListener("scroll", onOpenViewportChange, true);
    window.removeEventListener("scroll", onOpenViewportChange);
    window.removeEventListener("resize", onOpenViewportChange);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("scroll", onOpenViewportChange);
      window.visualViewport.removeEventListener("resize", onOpenViewportChange);
    }
    if (STATE.repositionRaf) {
      cancelAnimationFrame(STATE.repositionRaf);
      STATE.repositionRaf = 0;
    }
    STATE.openListenersAttached = false;
  }

  function openTree() {
    if (STATE.isOpen) return;
    if (!STATE.hubBtn || !STATE.hubBtn.isConnected) syncHubButton();
    if (!STATE.hubBtn) return;
    if (!ensureDOM()) return;

    if (!positionTree()) return;

    STATE.root.classList.add(CLS.open);
    STATE.root.setAttribute("aria-hidden", "false");
    STATE.isOpen = true;
    attachOpenListeners();
    onOpenViewportChange();
  }

  function closeTree() {
    if (!STATE.isOpen) return;
    STATE.isOpen = false;
    if (STATE.root) {
      STATE.root.classList.remove(CLS.open);
      STATE.root.setAttribute("aria-hidden", "true");
    }
    detachOpenListeners();
  }

  function toggleTree() {
    if (STATE.isOpen) closeTree();
    else openTree();
  }

  function queueForwardedSingleClick(event) {
    clearPendingSingleClick();
    STATE.pendingClickPayload = {
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    };
    STATE.pendingClickTimer = setTimeout(() => {
      STATE.pendingClickTimer = 0;
      if (!STATE.hubBtn || !STATE.hubBtn.isConnected) return;
      const p = STATE.pendingClickPayload || {};
      STATE.pendingClickPayload = null;
      const ev = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 1,
        view: window,
        ...p,
      });
      FORWARDED_CLICK_EVENTS.add(ev);
      STATE.hubBtn.dispatchEvent(ev);
    }, CFG.singleClickDelayMs);
  }

  function onHubClickCapture(event) {
    const btn = STATE.hubBtn;
    if (!btn || !btn.isConnected) return;
    if (FORWARDED_CLICK_EVENTS.has(event)) return;
    if (!eventHitsEl(event, btn)) return;
    if (!event.isTrusted) return;
    if (event.button !== 0) return;
    if (event.detail === 0) return; // keyboard/programmatic activation keeps normal behavior

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    if (event.detail >= 2) {
      clearPendingSingleClick();
      STATE.suppressDblUntil = performance.now() + 120;
      toggleTree();
      return;
    }
    queueForwardedSingleClick(event);
  }

  function onHubDblClickCapture(event) {
    const btn = STATE.hubBtn;
    if (!btn || !btn.isConnected) return;
    if (!eventHitsEl(event, btn)) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    clearPendingSingleClick();

    // Guard against duplicate toggle when click(detail>=2) already handled this dbl gesture.
    if (performance.now() < STATE.suppressDblUntil) return;
    toggleTree();
  }

  function syncHubButton() {
    const next = findHubButton();
    if (next === STATE.hubBtn) {
      if (STATE.isOpen) onOpenViewportChange();
      return;
    }

    STATE.hubBtn = next;
    clearPendingSingleClick();

    if (!STATE.hubResizeObserver && "ResizeObserver" in window) {
      STATE.hubResizeObserver = new ResizeObserver(() => {
        if (STATE.isOpen) onOpenViewportChange();
      });
    }
    if (STATE.hubResizeObserver) {
      STATE.hubResizeObserver.disconnect();
      if (STATE.hubBtn) STATE.hubResizeObserver.observe(STATE.hubBtn);
    }

    if (!STATE.hubBtn && STATE.isOpen) {
      closeTree();
      return;
    }
    if (STATE.isOpen) onOpenViewportChange();
  }

  function scheduleSyncUiRefs() {
    if (STATE.syncQueued) return;
    STATE.syncQueued = true;
    requestAnimationFrame(() => {
      STATE.syncQueued = false;
      syncHubButton();
      syncExportButton();
    });
  }

  function boot() {
    ensureStyles();
    syncHubButton();
    syncExportButton();
    document.addEventListener("click", onHubClickCapture, true);
    document.addEventListener("dblclick", onHubDblClickCapture, true);

    STATE.observer = new MutationObserver(() => {
      scheduleSyncUiRefs();
      if (STATE.isOpen) onOpenViewportChange();
    });
    STATE.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  boot();
})();
