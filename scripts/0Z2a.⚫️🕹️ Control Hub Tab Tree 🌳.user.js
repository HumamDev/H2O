// ==UserScript==
// @h2o-id             0z2a.control.hub.tab.tree
// @name               0Z2a.⚫️🕹️ Control Hub Tab Tree 🌳
// @namespace          H2O.Premium.CGX.control.hub.tab.tree
// @author             HumamDev
// @version            0.5.11
// @revision           007
// @build              260304-102754
// @description        Configurable quick-tools overlay for the Control Hub launcher button.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  "use strict";

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});
  const CH = (H2O.CH = H2O.CH || {});
  const CHUB = (CH.cntrlhb = CH.cntrlhb || {});
  const TREE = (CHUB.tree = CHUB.tree || {});
  const KEY_CHUB_CFG_UI_V1 = "h2o:prm:cgx:cntrlhb:cfg:ui:v1";
  const TREE_CLOSE_OUTSIDE = "outside_click";
  const TREE_CLOSE_TOGGLE = "toggle_button";

  // Stable Control Hub selectors (new + legacy owner keys).
  const SEL_CONTROL_HUB_BTN = [
    '[data-cgxui="cnhb-topbtn"][data-cgxui-owner="cnhb"]',
    '[data-cgxui="cntrlhb-topbtn"][data-cgxui-owner="cntrlhb"]',
  ].join(",");

  // Placeholder nodes only (no real actions yet).
  // Keep ids stable for future hooks.
  const QUICK_NODES = Object.freeze([
    { id: "left2", label: "" },
    { id: "left1", label: "" },
    { id: "mid", label: "" },
    { id: "right1", label: "" },
  ]);

  const CFG = Object.freeze({
    zIndex: 999999,
    // ── Position / spacing controls (main knobs) ─────────────────────────────
    // Distance from Cockpit button bottom to tree anchor.
    cockpitGapY: -12,
    // Additional whole-overlay Y shift after anchoring (negative = up, positive = down).
    panelOffsetY: 0,
    // Minimum gap from top viewport/topbar safe area.
    topbarSafeGapY: 4,
    // Horizontal clamp margin from left/right viewport edges.
    panelClampMarginX: 6,
    // Legacy compatibility (fallback if cockpitGapY not set).
    dropGap: 0,
    // Move all node boxes up/down inside the tree (negative = up).
    nodeOffsetY: 8,

    sourceY: 2,
    trunkDropY: 5,
    childDropY: 20,
    childGapX: 78,
    nearCurveLiftY: 10,
    nearCurvePull: 0.42,
    nearCurveInPull: 0.16,
    nearCurveDropY: 7,
    farCurveLiftY: 8,
    farCurvePullOut: 0.52,
    farCurvePullIn: 0.22,
    farCurveDropY: 3,
    mergeT: 0.52,
    mergeTStep: -0.12,
    sidePadX: 42,
    bottomPadY: 3,
    // ── D-tab (shadow container) size controls ───────────────────────────────
    tabTopY: 15,
    // If tabTopY is null, top is derived from node top minus this padding.
    tabTopPadY: 11,
    // Legacy base horizontal padding around outer node edges.
    tabPadX: 16,
    // Explicit top width control (bigger => wider top side in X).
    tabTopPadX: 20,
    // Explicit bottom width control (negative => narrower bottom side).
    tabBottomPadX: 8,
    // Minimum horizontal margin from outer node edges to tab border.
    tabNodeClearanceX: 10,
    // Extra height below node bottoms (smaller value => shorter tab in Y).
    tabBottomPadY: 8,
    // Rounded corner radius for trapezoid path clip.
    tabCornerRadius: 14,
    tabRadius: 26,
    // Rounded-bottom shaping (legacy; kept for compatibility if needed later).
    tabBottomRadius: 18,
    tabBottomRoundH: 20,
    // Legacy widening amount (compat fallback when tabTopPadX not set).
    tabTopOutsetX: 20,
    // Legacy bottom inset (compat fallback when tabBottomPadX not set).
    tabBottomInsetX: 18,
    tabFillTopAlpha: 0.24,
    tabFillBottomAlpha: 0.38,
    tabBorderAlpha: 0.26,
    tabShadowAlpha: 0.30,
    tabGlowAlpha: 0.16,
    // Inner angled shade (inside the tab body).
    tabInnerShadowAngleDeg: 166,
    tabInnerShadowDarkAlpha: 0.5,
    tabInnerShadowMidAlpha: 0.12,
    tabInnerShadowBlurPx: 7,
    tabInnerShadowOpacity: 0.90,
    tabInsetTopAlpha: 0.16,
    tabInsetBottomAlpha: 0.28,
    tabBlurPx: 22,
    tabSaturate: 1.00,
    tabContrast: 0.84,
    // Panel texture (copied direction from Export/Prompt panels)
    panelTintTopAlpha: 0.00,
    panelTintBottomAlpha: 0.00,
    panelBgAAlpha: 0.045,
    panelBgBAlpha: 0.030,
    panelBorderAlpha: 0.12,
    panelRingAlpha: 0.10,
    panelShadowAlpha: 0.85,
    panelBlurPx: 14,
    panelSaturate: 1.05,
    panelContrast: 1.08,
    panelBrightness: 1.03,
    // ── Node/button size controls ─────────────────────────────────────────────
    nodeWidth: 64,
    nodeHeight: 30,
    nodeRadius: 11,
    // Node style keys (menu-item direction from Export/Prompt panels)
    nodeBaseRgb: "28,29,32",
    nodeBaseAlpha: 0.85,
    nodeGlassTopAlpha: 0.03,
    nodeGlassBottomAlpha: 0.00,
    nodeBorderRgb: "255,255,255",
    nodeBorderAlpha: 0.12,
    nodeInsetTopAlpha: 0.04,
    nodeInsetBottomAlpha: 0.00,
    nodeShadowAlpha: 0.30,
    nodeGlowAlpha: 0.00,
    nodeBlurPx: 10,
    nodeSaturate: 1.03,
    nodeContrast: 1.03,
    nodeBrightness: 1.00,
    // Hover style keys
    nodeHoverBaseRgb: "44,46,52",
    nodeHoverBaseAlpha: 0.92,
    nodeHoverGlassTopAlpha: 0.04,
    nodeHoverGlassBottomAlpha: 0.00,
    nodeHoverBorderAlpha: 0.18,
    nodeHoverShadowAlpha: 0.25,
    nodeHoverGlowAlpha: 0.00,
    // Legacy compatibility (use panelClampMarginX / topbarSafeGapY above)
    clampMargin: 6,
    drawMs: 340,
    nodeStartDelayMs: 170,
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
    tab: "h2o-chqt-tab",
    node: "h2o-chqt-node",
  });

  const NODE_ID_SET = new Set(["left2", "left1", "mid", "right1"]);

  const STATE = {
    hubBtn: null,
    root: null,
    wrap: null,
    tab: null,
    isOpen: false,
    openListenersAttached: false,
    syncQueued: false,
    repositionRaf: 0,
    observer: null,
    hubResizeObserver: null,
    settings: {
      closeBehavior: TREE_CLOSE_OUTSIDE,
    },
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

  function clamp(n, min, max) {
    if (!Number.isFinite(n)) return min;
    if (!Number.isFinite(min)) min = n;
    if (!Number.isFinite(max)) max = n;
    if (max < min) return min;
    return Math.min(max, Math.max(min, n));
  }

  function fmt(n) {
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
  }

  function normalizeCloseBehavior(raw) {
    return String(raw || "") === TREE_CLOSE_TOGGLE ? TREE_CLOSE_TOGGLE : TREE_CLOSE_OUTSIDE;
  }

  function loadStoredSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY_CHUB_CFG_UI_V1) || "{}") || {};
      STATE.settings.closeBehavior = normalizeCloseBehavior(raw.treeCloseBehavior);
    } catch {
      STATE.settings.closeBehavior = TREE_CLOSE_OUTSIDE;
    }
  }

  function applySetting(key, value) {
    switch (String(key || "")) {
      case "closeBehavior":
        STATE.settings.closeBehavior = normalizeCloseBehavior(value);
        break;
      default:
        return getConfig();
    }

    if (STATE.isOpen) onOpenViewportChange();
    return getConfig();
  }

  function getConfig() {
    return {
      closeBehavior: normalizeCloseBehavior(STATE.settings.closeBehavior),
    };
  }

  function roundedPolygonPath(points, radius) {
    if (!Array.isArray(points) || points.length < 3) return "";
    const rBase = Math.max(0, Number(radius) || 0);
    const n = points.length;
    let d = "";

    for (let i = 0; i < n; i += 1) {
      const prev = points[(i - 1 + n) % n];
      const curr = points[i];
      const next = points[(i + 1) % n];
      const vPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
      const vNext = { x: next.x - curr.x, y: next.y - curr.y };
      const lPrev = Math.hypot(vPrev.x, vPrev.y);
      const lNext = Math.hypot(vNext.x, vNext.y);
      if (lPrev < 0.001 || lNext < 0.001) continue;

      const uPrev = { x: vPrev.x / lPrev, y: vPrev.y / lPrev };
      const uNext = { x: vNext.x / lNext, y: vNext.y / lNext };
      const dot = clamp(uPrev.x * uNext.x + uPrev.y * uNext.y, -0.999, 0.999);
      const theta = Math.acos(dot);
      const tanHalf = Math.tan(theta / 2);
      const maxInset = Math.max(0, Math.min(lPrev, lNext) * 0.48);
      const inset = tanHalf > 0.0001 ? Math.min(rBase / tanHalf, maxInset) : 0;

      const inPt = { x: curr.x + uPrev.x * inset, y: curr.y + uPrev.y * inset };
      const outPt = { x: curr.x + uNext.x * inset, y: curr.y + uNext.y * inset };

      if (!d) d = `M ${fmt(inPt.x)} ${fmt(inPt.y)}`;
      else d += ` L ${fmt(inPt.x)} ${fmt(inPt.y)}`;
      d += ` Q ${fmt(curr.x)} ${fmt(curr.y)} ${fmt(outPt.x)} ${fmt(outPt.y)}`;
    }

    return d ? `${d} Z` : "";
  }

  function cubicPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    return {
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
    };
  }

  function buildLayout(nodes) {
    const list = Array.isArray(nodes)
      ? nodes.filter((n) => n && NODE_ID_SET.has(n.id))
      : [];
    if (!list.length) return null;

    const spread = Math.max(0, list.length - 1) * CFG.childGapX;
    const topPadX = Number.isFinite(CFG.tabTopPadX)
      ? CFG.tabTopPadX
      : (CFG.tabPadX + CFG.tabTopOutsetX);
    const bottomPadX = Number.isFinite(CFG.tabBottomPadX)
      ? CFG.tabBottomPadX
      : (CFG.tabPadX - CFG.tabBottomInsetX);
    const clearX = Math.max(0, Number.isFinite(CFG.tabNodeClearanceX) ? CFG.tabNodeClearanceX : 0);
    const outerPadX = Math.max(0, topPadX, bottomPadX, clearX);
    const requiredSpan = spread + CFG.nodeWidth + outerPadX * 2;
    const width = Math.max(260, spread + CFG.sidePadX * 2, requiredSpan);

    const cx = width / 2;
    const source = { x: cx, y: CFG.sourceY };
    const trunkEnd = { x: cx, y: source.y + CFG.trunkDropY };
    const nodeCenterY = trunkEnd.y + CFG.childDropY + CFG.nodeOffsetY;
    const nodeTopY = nodeCenterY - CFG.nodeHeight / 2;
    const baseHeight = nodeCenterY + Math.ceil(CFG.nodeHeight / 2) + CFG.bottomPadY;

    const points = new Map();
    const firstX = cx - spread / 2;
    list.forEach((n, i) => {
      points.set(n.id, { x: firstX + i * CFG.childGapX, y: nodeCenterY });
    });

    const endpoints = new Map();
    list.forEach((n) => {
      const p = points.get(n.id);
      if (p) endpoints.set(n.id, { x: p.x, y: p.y - CFG.nodeHeight / 2 });
    });

    const branches = [];
    branches.push({
      start: source,
      cp1: { x: source.x, y: source.y + CFG.trunkDropY * 0.45 },
      cp2: { x: trunkEnd.x, y: trunkEnd.y - CFG.trunkDropY * 0.15 },
      end: trunkEnd,
    });

    const leftNodes = list.filter((n) => (points.get(n.id)?.x ?? cx) < cx - 0.5);
    const rightNodes = list.filter((n) => (points.get(n.id)?.x ?? cx) > cx + 0.5);
    const centerNodes = list.filter((n) => {
      const x = points.get(n.id)?.x ?? cx;
      return Math.abs(x - cx) <= 0.5;
    });

    leftNodes.sort((a, b) => (points.get(b.id)?.x ?? 0) - (points.get(a.id)?.x ?? 0)); // near -> far
    rightNodes.sort((a, b) => (points.get(a.id)?.x ?? 0) - (points.get(b.id)?.x ?? 0)); // near -> far

    function addSideMergedBranches(sideNodes) {
      if (!sideNodes.length) return;
      const nearNode = sideNodes[0];
      const nearStart = endpoints.get(nearNode.id);
      if (!nearStart) return;

      const root = trunkEnd;
      const dxNear = root.x - nearStart.x;
      const nearCp1 = {
        x: nearStart.x + dxNear * CFG.nearCurvePull,
        y: nearStart.y - CFG.nearCurveLiftY,
      };
      const nearCp2 = {
        x: root.x - dxNear * CFG.nearCurveInPull,
        y: root.y + CFG.nearCurveDropY,
      };
      const nearBranch = { start: nearStart, cp1: nearCp1, cp2: nearCp2, end: root };

      const sideBranches = [];
      sideNodes.slice(1).forEach((n, idx) => {
        const farStart = endpoints.get(n.id);
        if (!farStart) return;

        const t = clamp(CFG.mergeT + idx * CFG.mergeTStep, 0.14, 0.86);
        const merge = cubicPoint(nearStart, nearCp1, nearCp2, root, t);
        const dxFar = merge.x - farStart.x;
        const farCp1 = {
          x: farStart.x + dxFar * CFG.farCurvePullOut,
          y: farStart.y - CFG.farCurveLiftY,
        };
        const farCp2 = {
          x: merge.x - dxFar * CFG.farCurvePullIn,
          y: merge.y + CFG.farCurveDropY,
        };
        sideBranches.push({ start: farStart, cp1: farCp1, cp2: farCp2, end: merge });
      });

      // Draw merged children first, then the near branch so the shared track stays visually continuous.
      branches.push(...sideBranches, nearBranch);
    }

    addSideMergedBranches(leftNodes);
    addSideMergedBranches(rightNodes);

    centerNodes.forEach((n) => {
      const start = endpoints.get(n.id);
      if (!start) return;
      branches.push({
        start,
        cp1: { x: start.x, y: start.y - CFG.nearCurveLiftY },
        cp2: { x: trunkEnd.x, y: trunkEnd.y + CFG.nearCurveDropY },
        end: trunkEnd,
      });
    });

    const xs = list.map((n) => points.get(n.id)?.x).filter((v) => Number.isFinite(v));
    const minX = xs.length ? Math.min(...xs) : cx;
    const maxX = xs.length ? Math.max(...xs) : cx;
    const nodeLeft = minX - CFG.nodeWidth / 2;
    const nodeRight = maxX + CFG.nodeWidth / 2;
    const tabTopLeftRaw = Math.min(nodeLeft - topPadX, nodeLeft - clearX);
    const tabTopRightRaw = Math.max(nodeRight + topPadX, nodeRight + clearX);
    const tabBottomLeftRaw = Math.min(nodeLeft - bottomPadX, nodeLeft - clearX);
    const tabBottomRightRaw = Math.max(nodeRight + bottomPadX, nodeRight + clearX);
    const tabTop = Number.isFinite(CFG.tabTopY)
      ? CFG.tabTopY
      : (nodeTopY - (Number.isFinite(CFG.tabTopPadY) ? CFG.tabTopPadY : 10));
    const tabBottom = nodeCenterY + CFG.nodeHeight / 2 + CFG.tabBottomPadY;
    const height = Math.max(baseHeight, tabBottom + Math.max(2, CFG.bottomPadY));
    const topLeft = clamp(tabTopLeftRaw, 0, width);
    const topRight = clamp(tabTopRightRaw, 0, width);
    const bottomLeft = clamp(tabBottomLeftRaw, 0, width);
    const bottomRight = clamp(tabBottomRightRaw, 0, width);
    const tabLeft = Math.min(topLeft, bottomLeft);
    const tabRight = Math.max(topRight, bottomRight);
    const tabWidth = Math.max(0, tabRight - tabLeft);
    const tabHeight = Math.max(0, tabBottom - tabTop);
    const topLeftPt = { x: topLeft, y: tabTop };
    const topRightPt = { x: topRight, y: tabTop };
    const bottomRightPt = { x: bottomRight, y: tabBottom };
    const bottomLeftPt = { x: bottomLeft, y: tabBottom };
    const tabPathData = roundedPolygonPath(
      [topLeftPt, topRightPt, bottomRightPt, bottomLeftPt],
      Number.isFinite(CFG.tabCornerRadius) ? CFG.tabCornerRadius : CFG.tabRadius
    );
    const tabClipPath = tabPathData ? `path("${tabPathData}")` : "";
    const tabPolygonClip = `polygon(${fmt(topLeft)}px ${fmt(tabTop)}px, ${fmt(topRight)}px ${fmt(tabTop)}px, ${fmt(bottomRight)}px ${fmt(tabBottom)}px, ${fmt(bottomLeft)}px ${fmt(tabBottom)}px)`;

    return {
      width,
      height,
      source,
      points,
      branches,
      nodes: list,
      tab: {
        left: tabLeft,
        top: tabTop,
        width: tabWidth,
        height: tabHeight,
        topLeftX: Math.max(0, topLeft - tabLeft),
        topRightX: Math.max(0, topRight - tabLeft),
        bottomLeftX: Math.max(0, bottomLeft - tabLeft),
        bottomRightX: Math.max(0, bottomRight - tabLeft),
        clipPath: tabClipPath,
        polygonClip: tabPolygonClip,
      },
    };
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
#${IDS.root} > .${CLS.wrap} > .${CLS.tab}{
  position: absolute;
  left: 0; top: 0;
  transform: translate(-50%, 0) scale(0.94);
  transform-origin: top center;
  border-radius: 14px;
  overflow: hidden;
  pointer-events: auto;
  isolation: auto;
  z-index: 1;
  background:
    radial-gradient(circle at 50% 0%, rgba(118,170,236,.08), rgba(118,170,236,0) 56%),
    radial-gradient(circle at 0% 0%, rgba(255,255,255,0.00), transparent 45%),
    radial-gradient(circle at 100% 100%, rgba(255,255,255,0.00), transparent 55%),
    linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.030));
  border: 1px solid rgba(255,255,255,.12);
  box-shadow:
    0 26px 80px rgba(0,0,0,.85),
    0 0 0 1px rgba(255,255,255,.10),
    inset 0 0 0 1px rgba(0,0,0,.25);
  backdrop-filter: blur(14px) saturate(1.05) contrast(1.08) brightness(1.03);
  -webkit-backdrop-filter: blur(14px) saturate(1.05) contrast(1.08) brightness(1.03);
  opacity: 0;
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.2,.9,.2,1);
  will-change: transform, opacity;
}
#${IDS.root} > .${CLS.wrap} > .${CLS.tab}::before{
  content: "";
  position: absolute;
  inset: 1px;
  pointer-events: none;
  z-index: 1;
  background: linear-gradient(
    ${CFG.tabInnerShadowAngleDeg}deg,
    rgba(8,14,24,${CFG.tabInnerShadowDarkAlpha}) 0%,
    rgba(12,20,32,${CFG.tabInnerShadowMidAlpha}) 44%,
    rgba(12,20,32,0) 76%
  );
  mix-blend-mode: multiply;
  opacity: ${CFG.tabInnerShadowOpacity};
  filter: blur(${CFG.tabInnerShadowBlurPx}px);
}
#${IDS.root}.${CLS.open} > .${CLS.wrap} > .${CLS.tab}{
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}

.${CLS.node}{
  position: absolute;
  width: ${CFG.nodeWidth}px;
  height: ${CFG.nodeHeight}px;
  border-radius: ${CFG.nodeRadius}px;
  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,${CFG.nodeGlassTopAlpha}) 0%,
      rgba(255,255,255,${CFG.nodeGlassBottomAlpha}) 100%
    ),
    rgba(${CFG.nodeBaseRgb},${CFG.nodeBaseAlpha});
  border: 1px solid rgba(${CFG.nodeBorderRgb},${CFG.nodeBorderAlpha});
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,${CFG.nodeInsetTopAlpha}),
    inset 0 -1px 0 rgba(255,255,255,${CFG.nodeInsetBottomAlpha}),
    0 8px 16px rgba(8,14,24,${CFG.nodeShadowAlpha}),
    0 0 14px rgba(146,192,244,${CFG.nodeGlowAlpha});
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translate(-50%, -50%) scale(.80);
  opacity: 0;
  transition:
    opacity 160ms ease,
    transform ${CFG.popMs}ms cubic-bezier(.2,.95,.2,1);
  transition-delay: 0ms;
  cursor: pointer;
  z-index: 2;
  color: rgba(224,243,255,.9);
  font-size: 12px;
  font-weight: 580;
  line-height: 1;
  letter-spacing: .16px;
  text-shadow: 0 1px 2px rgba(0,0,0,.24);
}

#${IDS.root}.${CLS.open} .${CLS.node}{
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
  transition-delay: var(--h2o-chqt-delay, 0ms);
}

.${CLS.node}:hover{
  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,${CFG.nodeHoverGlassTopAlpha}) 0%,
      rgba(255,255,255,${CFG.nodeHoverGlassBottomAlpha}) 100%
    ),
    rgba(${CFG.nodeHoverBaseRgb},${CFG.nodeHoverBaseAlpha});
  border-color: rgba(${CFG.nodeBorderRgb},${CFG.nodeHoverBorderAlpha});
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,${CFG.nodeInsetTopAlpha}),
    inset 0 -1px 0 rgba(255,255,255,${CFG.nodeInsetBottomAlpha}),
    0 10px 18px rgba(8,14,24,${CFG.nodeHoverShadowAlpha}),
    0 0 18px rgba(160,208,255,${CFG.nodeHoverGlowAlpha});
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
    const tab = el("div", {
      class: CLS.tab,
      role: "dialog",
      "aria-label": "Control Hub Quick Tree",
      "aria-modal": "false",
    });
    tab.style.width = `${layout.width}px`;
    tab.style.height = `${layout.height}px`;
    if (layout.tab.clipPath) {
      tab.style.clipPath = layout.tab.clipPath;
      tab.style.webkitClipPath = layout.tab.clipPath;
    }
    if (!tab.style.clipPath && layout.tab.polygonClip) {
      tab.style.clipPath = layout.tab.polygonClip;
      tab.style.webkitClipPath = layout.tab.polygonClip;
    }

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
      btn.style.setProperty("--h2o-chqt-delay", `${CFG.nodeStartDelayMs + index * CFG.staggerMs}ms`);
      if (node.label) btn.textContent = node.label;

      // Placeholder hook only. No real action yet.
      btn.addEventListener("click", (event) => event.preventDefault());
      tab.appendChild(btn);
    });

    wrap.appendChild(tab);
    root.appendChild(wrap);
    document.body.appendChild(root);

    STATE.root = root;
    STATE.wrap = wrap;
    STATE.tab = tab;

    return root;
  }

  function getAnchorCenter() {
    const btn = STATE.hubBtn;
    if (!btn || !btn.isConnected) return null;
    const r = btn.getBoundingClientRect();
    const gapY = Number.isFinite(CFG.cockpitGapY) ? CFG.cockpitGapY : CFG.dropGap;
    return { x: r.left + r.width / 2, y: r.bottom + gapY };
  }

  function positionTree() {
    if (!STATE.wrap || !STATE.tab) return false;
    const anchor = getAnchorCenter();
    if (!anchor) return false;

    let x = anchor.x;
    const safeTop = Number.isFinite(CFG.topbarSafeGapY) ? CFG.topbarSafeGapY : CFG.clampMargin;
    const panelOffsetY = Number.isFinite(CFG.panelOffsetY) ? CFG.panelOffsetY : 0;
    let y = Math.max(safeTop, anchor.y + panelOffsetY);
    const tabW = STATE.tab.offsetWidth || 0;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const m = Number.isFinite(CFG.panelClampMarginX) ? CFG.panelClampMarginX : CFG.clampMargin;

    if (tabW > 0 && vw > 0) {
      const minX = tabW / 2 + m;
      const maxX = vw - tabW / 2 - m;
      x = clamp(x, minX, maxX);
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
    if (STATE.settings.closeBehavior !== TREE_CLOSE_OUTSIDE || !STATE.isOpen) return;
    if (eventHitsEl(event, STATE.tab)) return;
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
    if (STATE.isOpen) return true;
    if (!STATE.hubBtn || !STATE.hubBtn.isConnected) syncHubButton();
    if (!STATE.hubBtn) return false;
    if (!ensureDOM()) return false;

    if (!positionTree()) return false;

    STATE.root.classList.add(CLS.open);
    STATE.root.setAttribute("aria-hidden", "false");
    STATE.isOpen = true;
    attachOpenListeners();
    onOpenViewportChange();
    return true;
  }

  function closeTree() {
    if (!STATE.isOpen) return false;
    STATE.isOpen = false;
    if (STATE.root) {
      STATE.root.classList.remove(CLS.open);
      STATE.root.setAttribute("aria-hidden", "true");
    }
    detachOpenListeners();
    return true;
  }

  function toggleTree() {
    return STATE.isOpen ? closeTree() : openTree();
  }

  function exposeApi() {
    TREE.api = TREE.api || {};
    TREE.api.open = openTree;
    TREE.api.close = closeTree;
    TREE.api.toggle = toggleTree;
    TREE.api.isOpen = () => !!STATE.isOpen;
    TREE.api.getConfig = getConfig;
    TREE.api.applySetting = applySetting;
  }

  function syncHubButton() {
    const next = findHubButton();
    if (next === STATE.hubBtn) {
      if (STATE.isOpen) onOpenViewportChange();
      return;
    }

    STATE.hubBtn = next;

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
    });
  }

  function boot() {
    loadStoredSettings();
    ensureStyles();
    syncHubButton();
    exposeApi();

    STATE.observer = new MutationObserver(() => {
      scheduleSyncUiRefs();
      if (STATE.isOpen) onOpenViewportChange();
    });
    STATE.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  boot();
})();
