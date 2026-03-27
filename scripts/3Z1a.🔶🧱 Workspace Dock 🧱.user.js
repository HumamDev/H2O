// ==UserScript==
// @h2o-id             3Z1a.workspace.dock
// @name               3Z1a.🔶🧱 Workspace Dock 🧱
// @namespace          H2O.Premium.CGX.workspace.dock
// @author             HumamDev
// @version            0.9.2
// @revision           001
// @build              260310-000000
// @description        Shared right-side Workspace Dock for H2O Workspace. Owns open/close, edge launcher, dock/overlay mode, and the shared body host for Shelf + Drawer panels.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W.document;
  const H2O = (W.H2O = W.H2O || {});

  const ROOT_ID = 'cgxui-wsdk-root';
  const CSS_ID = 'cgxui-wsdk-style';
  const SkID = 'wsdk';

  const ATTR_OWNER = 'data-cgxui-owner';
  const ATTR_UI = 'data-cgxui';
  const ATTR_STATE = 'data-cgxui-state';
  const ATTR_PANE = 'data-cgxui-pane';
  const ATTR_MODE = 'data-cgxui-mode';
  const ATTR_EDGE = 'data-cgxui-edge';
  const PAGE_PUSH_ATTR = 'data-cgxui-wsdk-push';

  const SEL = Object.freeze({
    root: `#${ROOT_ID}[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="root"]`,
    edge: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="edge"]`,
    edgeHot: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="edge-hot"]`,
    edgeRail: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="edge-rail"]`,
    edgeBtnShelf: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="edge-shelf"]`,
    edgeBtnDrawer: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="edge-drawer"]`,
    headBtnShelf: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="head-shelf"]`,
    headBtnDrawer: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="head-drawer"]`,
    pane: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="pane"]`,
    body: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="body"]`,
    title: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="title"]`,
    close: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="close"]`,
    modeDock: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="mode-dock"]`,
    modeOverlay: `[${ATTR_OWNER}="${SkID}"][${ATTR_UI}="mode-overlay"]`,
  });

  const STR = Object.freeze({
    paneShelf: 'shelf',
    paneDrawer: 'drawer',
    modeDock: 'dock',
    modeOverlay: 'overlay',
    titleShelf: 'Shelf',
    titleDrawer: 'Drawer',
    titleFallback: 'Workspace Dock',
    placeholder: 'Workspace Dock mounted. Shelf and Drawer panels can render here.',
  });

  const CFG = Object.freeze({
    waitMaxMs: 10000,
    edgeHideDelayMs: 220,
    paneWidth: 380,
    zIndex: 2147483646,
  });

  const S = {
    booted: false,
    api: null,
    root: null,
    body: null,
    edgeHideT: 0,
    localState: {
      open: false,
      pane: STR.paneShelf,
      dockMode: STR.modeOverlay,
    },
    handlers: {
      onDocClick: null,
      onKeydown: null,
      onWsChanged: [],
    },
  };

  function q(sel, root = D) { return root.querySelector(sel); }
  function safe(fn, fallback = null) { try { return fn(); } catch { return fallback; } }

  async function waitForWorkspaceApi(maxMs = CFG.waitMaxMs) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = W.H2O?.Workspace || null;
        const ok = !!(api && typeof api.getRightState === 'function' && typeof api.openShelf === 'function');
        if (ok) return resolve(api);
        if (Date.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  function getState() {
    const rs = safe(() => S.api?.getRightState?.(), null);
    if (rs && typeof rs === 'object') {
      return {
        open: !!rs.open,
        pane: rs.pane === STR.paneDrawer ? STR.paneDrawer : STR.paneShelf,
        dockMode: rs.dockMode === STR.modeDock ? STR.modeDock : STR.modeOverlay,
      };
    }
    return { ...S.localState };
  }

  function setState(partial) {
    const next = { ...getState(), ...(partial || {}) };
    if (S.api && typeof S.api.getRightState === 'function') {
      if ('dockMode' in next && typeof S.api.setDockMode === 'function') {
        S.api.setDockMode(next.dockMode);
      }
      if ('open' in next && !next.open && typeof S.api.closeRightShell === 'function') {
        S.api.closeRightShell();
      } else if (next.open && next.pane === STR.paneDrawer && typeof S.api.openDrawer === 'function') {
        S.api.openDrawer();
      } else if (next.open && next.pane === STR.paneShelf && typeof S.api.openShelf === 'function') {
        S.api.openShelf();
      }
      if (next.open && typeof S.api.setRightMode === 'function') {
        S.api.setRightMode(next.pane);
      }
      syncFromState();
      return getState();
    }
    S.localState = next;
    syncFromState();
    return next;
  }

  function ensureStylesOnce() {
    if (D.getElementById(CSS_ID)) return;
    const s = D.createElement('style');
    s.id = CSS_ID;
    s.textContent = `
      :root{
        --cgx-wsdk-z:${CFG.zIndex};
        --cgx-wsdk-pane-w:${CFG.paneWidth}px;
        --cgx-wsdk-gap:12px;
        --cgx-wsdk-radius:16px;
        --cgx-wsdk-blur:14px;
        --cgx-wsdk-edge-strip-w:12px;
        --cgx-wsdk-edge-h:132px;
        --cgx-wsdk-btn-w:28px;
        --cgx-wsdk-btn-h:58px;
        --cgx-wsdk-shadow:0 18px 42px rgba(0,0,0,0.52);
        --cgx-wsdk-border:rgba(255,255,255,0.10);
        --cgx-wsdk-bg:rgba(20,20,20,0.78);
        --cgx-wsdk-text:rgba(255,255,255,0.90);
        --cgx-wsdk-muted:rgba(255,255,255,0.62);
      }
      ${SEL.root}{ position:fixed; inset:0; z-index:var(--cgx-wsdk-z); pointer-events:none; isolation:isolate; }
      html[${PAGE_PUSH_ATTR}="1"] body{ transform:translateX(calc(-1 * var(--cgx-wsdk-pane-w))); }
      body{ transition:transform 420ms cubic-bezier(0.16,1,0.3,1); }
      ${SEL.edge}{ pointer-events:auto; position:fixed; right:0; top:0; width:var(--cgx-wsdk-edge-strip-w); height:100vh; }
      ${SEL.edgeRail}{ position:fixed; top:50%; right:0; transform:translateY(-50%); width:calc(var(--cgx-wsdk-btn-w) + 8px); height:var(--cgx-wsdk-edge-h); pointer-events:none; }
      ${SEL.edgeHot}{ position:fixed; top:50%; right:0; transform:translateY(-50%); width:22px; height:calc(var(--cgx-wsdk-edge-h) + 20px); pointer-events:auto; }
      .cgxui-${SkID}-edge-stack{ position:absolute; top:50%; right:-40px; transform:translateY(-50%); display:flex; flex-direction:column; gap:6px; transition:right 520ms cubic-bezier(0.16,1,0.3,1), opacity 360ms ease; opacity:0; pointer-events:none; }
      ${SEL.root}[${ATTR_EDGE}="1"][${ATTR_STATE}="closed"] .cgxui-${SkID}-edge-stack{ right:-14px; opacity:1; pointer-events:auto; }
      ${SEL.root}[${ATTR_EDGE}="2"][${ATTR_STATE}="closed"] .cgxui-${SkID}-edge-stack{ right:0; opacity:1; pointer-events:auto; }
      ${SEL.root}[${ATTR_STATE}="open"] .cgxui-${SkID}-edge-stack{ right:-44px; opacity:0; pointer-events:none; }
      .cgxui-${SkID}-edge-btn{ width:var(--cgx-wsdk-btn-w); height:var(--cgx-wsdk-btn-h); display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.18); border-top-left-radius:12px; border-bottom-left-radius:12px; border-top-right-radius:0; border-bottom-right-radius:0; cursor:pointer; user-select:none; color:rgba(255,255,255,0.88); background:radial-gradient(circle at 30% 24%, rgba(42,240,198,0.18), transparent 62%), linear-gradient(180deg, rgba(39,32,37,0.95), rgba(27,22,27,0.96)); box-shadow:0 12px 28px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.12); transition:transform .18s ease, filter .18s ease, box-shadow .18s ease, opacity .18s ease; }
      .cgxui-${SkID}-edge-btn:hover{ filter:saturate(1.12); box-shadow:0 16px 32px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(44,223,186,0.32); }
      .cgxui-${SkID}-edge-btn[aria-pressed="true"]{ color:rgba(219,255,246,0.98); box-shadow:0 16px 32px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(44,223,186,0.42); }
      ${SEL.pane}{ position:fixed; top:var(--cgx-wsdk-gap); right:var(--cgx-wsdk-gap); width:var(--cgx-wsdk-pane-w); height:calc(100vh - (var(--cgx-wsdk-gap) * 2)); border-radius:var(--cgx-wsdk-radius); background:var(--cgx-wsdk-bg); backdrop-filter:blur(var(--cgx-wsdk-blur)) saturate(1.12); -webkit-backdrop-filter:blur(var(--cgx-wsdk-blur)) saturate(1.12); border:1px solid var(--cgx-wsdk-border); box-shadow:var(--cgx-wsdk-shadow); overflow:hidden; display:flex; flex-direction:column; pointer-events:auto; transform:translateX(calc(var(--cgx-wsdk-pane-w) + 48px)); opacity:0; transition:transform 420ms cubic-bezier(0.16,1,0.3,1), opacity 340ms ease; }
      ${SEL.root}[${ATTR_STATE}="open"] ${SEL.pane}{ transform:translateX(0); opacity:1; }
      ${SEL.root}[${ATTR_MODE}="dock"] ${SEL.pane}{ top:0; right:0; height:100vh; border-radius:0; border-right:0; }
      .cgxui-${SkID}-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.10); }
      .cgxui-${SkID}-head-main{ display:flex; align-items:center; gap:8px; min-width:0; flex:1 1 auto; }
      .cgxui-${SkID}-ttl{ min-width:0; font:700 13px/1.2 system-ui,-apple-system,"Segoe UI",Arial; letter-spacing:.2px; color:var(--cgx-wsdk-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .cgxui-${SkID}-pane-switch{ display:inline-flex; align-items:center; gap:4px; padding:3px; border-radius:999px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.05); box-shadow:inset 0 1px 0 rgba(255,255,255,0.06); }
      .cgxui-${SkID}-pane-btn{ min-width:54px; height:26px; padding:0 10px; border-radius:999px; border:1px solid transparent; background:transparent; color:var(--cgx-wsdk-muted); font:600 11px/1 system-ui,-apple-system,"Segoe UI",Arial; cursor:pointer; transition:background .18s ease, border-color .18s ease, color .18s ease, transform .14s ease; }
      .cgxui-${SkID}-pane-btn:hover{ color:var(--cgx-wsdk-text); background:rgba(255,255,255,0.06); }
      .cgxui-${SkID}-pane-btn[aria-pressed="true"]{ background:rgba(35,214,180,0.18); border-color:rgba(35,214,180,0.36); color:rgba(208,255,244,0.98); box-shadow:inset 0 1px 0 rgba(255,255,255,0.10); }
      .cgxui-${SkID}-actions{ display:flex; gap:6px; align-items:center; flex:0 0 auto; }
      .cgxui-${SkID}-icon-btn{ width:28px; height:28px; padding:0; border-radius:9px; border:1px solid rgba(255,255,255,0.14); background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.90); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; transition:background .18s ease, border-color .18s ease, transform .14s ease; }
      .cgxui-${SkID}-icon-btn:hover{ background:rgba(255,255,255,0.14); }
      .cgxui-${SkID}-icon-btn[aria-pressed="true"]{ background:rgba(35,214,180,0.18); border-color:rgba(35,214,180,0.45); color:rgba(208,255,244,0.98); }
      ${SEL.body}{ flex:1; min-height:0; overflow:auto; padding:12px; color:var(--cgx-wsdk-text); font:12px/1.35 system-ui,-apple-system,"Segoe UI",Arial; }
      .cgxui-${SkID}-empty{ padding:14px 12px; border-radius:12px; border:1px dashed rgba(255,255,255,0.12); background:rgba(255,255,255,0.03); color:var(--cgx-wsdk-muted); }
      @media (prefers-reduced-motion: reduce){ ${SEL.pane}, .cgxui-${SkID}-edge-stack, body { transition:none; } }
    `;
    D.documentElement.appendChild(s);
  }

  function ensureUI() {
    let root = D.getElementById(ROOT_ID);
    if (root) return root;
    ensureStylesOnce();
    root = D.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute(ATTR_OWNER, SkID);
    root.setAttribute(ATTR_UI, 'root');
    root.setAttribute(ATTR_STATE, 'closed');
    root.setAttribute(ATTR_PANE, STR.paneShelf);
    root.setAttribute(ATTR_MODE, STR.modeOverlay);
    root.setAttribute(ATTR_EDGE, '0');

    const edge = D.createElement('div');
    edge.setAttribute(ATTR_OWNER, SkID);
    edge.setAttribute(ATTR_UI, 'edge');
    edge.setAttribute('aria-hidden', 'true');

    const edgeHot = D.createElement('div');
    edgeHot.setAttribute(ATTR_OWNER, SkID);
    edgeHot.setAttribute(ATTR_UI, 'edge-hot');
    edgeHot.setAttribute('aria-hidden', 'true');

    const edgeRail = D.createElement('div');
    edgeRail.setAttribute(ATTR_OWNER, SkID);
    edgeRail.setAttribute(ATTR_UI, 'edge-rail');
    edgeRail.innerHTML = `
      <div class="cgxui-${SkID}-edge-stack">
        <button class="cgxui-${SkID}-edge-btn" ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="edge-shelf" type="button" title="Open Shelf" aria-label="Open Shelf" aria-pressed="true">S</button>
        <button class="cgxui-${SkID}-edge-btn" ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="edge-drawer" type="button" title="Open Drawer" aria-label="Open Drawer" aria-pressed="false">D</button>
      </div>
    `;

    const pane = D.createElement('aside');
    pane.setAttribute(ATTR_OWNER, SkID);
    pane.setAttribute(ATTR_UI, 'pane');
    pane.innerHTML = `
      <div class="cgxui-${SkID}-head">
        <div class="cgxui-${SkID}-head-main">
          <div class="cgxui-${SkID}-ttl" ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="title">${STR.titleFallback}</div>
          <div class="cgxui-${SkID}-pane-switch" role="group" aria-label="Workspace panels">
            <button class="cgxui-${SkID}-pane-btn" ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="head-shelf" type="button" title="Show Shelf" aria-label="Show Shelf" aria-pressed="true">Shelf</button>
            <button class="cgxui-${SkID}-pane-btn" ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="head-drawer" type="button" title="Show Drawer" aria-label="Show Drawer" aria-pressed="false">Drawer</button>
          </div>
        </div>
        <div class="cgxui-${SkID}-actions">
          <button class="cgxui-${SkID}-icon-btn" ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="mode-dock" type="button" title="Push mode" aria-label="Push mode">P</button>
          <button class="cgxui-${SkID}-icon-btn" ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="mode-overlay" type="button" title="Overlay mode" aria-label="Overlay mode">O</button>
          <button class="cgxui-${SkID}-icon-btn" ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="close" type="button" title="Close" aria-label="Close">×</button>
        </div>
      </div>
      <div ${ATTR_OWNER}="${SkID}" ${ATTR_UI}="body"><div class="cgxui-${SkID}-empty">${STR.placeholder}</div></div>
    `;

    root.appendChild(edge);
    root.appendChild(edgeHot);
    root.appendChild(edgeRail);
    root.appendChild(pane);
    D.documentElement.appendChild(root);

    S.root = root;
    S.body = q(SEL.body, root);
    wireRoot(root);
    return root;
  }

  function syncFromState() {
    const root = S.root || ensureUI();
    const titleEl = q(SEL.title, root);
    const btnShelf = q(SEL.edgeBtnShelf, root);
    const btnDrawer = q(SEL.edgeBtnDrawer, root);
    const btnHeadShelf = q(SEL.headBtnShelf, root);
    const btnHeadDrawer = q(SEL.headBtnDrawer, root);
    const btnDock = q(SEL.modeDock, root);
    const btnOverlay = q(SEL.modeOverlay, root);
    const rs = getState();

    root.setAttribute(ATTR_STATE, rs.open ? 'open' : 'closed');
    root.setAttribute(ATTR_PANE, rs.pane);
    root.setAttribute(ATTR_MODE, rs.dockMode);
    if (rs.open) root.setAttribute(ATTR_EDGE, '2');

    if (titleEl) titleEl.textContent = rs.pane === STR.paneDrawer ? STR.titleDrawer : STR.titleShelf;
    if (btnShelf) btnShelf.setAttribute('aria-pressed', rs.pane !== STR.paneDrawer ? 'true' : 'false');
    if (btnDrawer) btnDrawer.setAttribute('aria-pressed', rs.pane === STR.paneDrawer ? 'true' : 'false');
    if (btnHeadShelf) btnHeadShelf.setAttribute('aria-pressed', rs.pane !== STR.paneDrawer ? 'true' : 'false');
    if (btnHeadDrawer) btnHeadDrawer.setAttribute('aria-pressed', rs.pane === STR.paneDrawer ? 'true' : 'false');
    if (btnDock) btnDock.setAttribute('aria-pressed', rs.dockMode === STR.modeDock ? 'true' : 'false');
    if (btnOverlay) btnOverlay.setAttribute('aria-pressed', rs.dockMode === STR.modeOverlay ? 'true' : 'false');

    if (rs.open && rs.dockMode === STR.modeDock) D.documentElement.setAttribute(PAGE_PUSH_ATTR, '1');
    else D.documentElement.removeAttribute(PAGE_PUSH_ATTR);
  }

  function wireRoot(root) {
    const edge = q(SEL.edge, root);
    const edgeHot = q(SEL.edgeHot, root);
    const edgeShelf = q(SEL.edgeBtnShelf, root);
    const edgeDrawer = q(SEL.edgeBtnDrawer, root);
    const btnHeadShelf = q(SEL.headBtnShelf, root);
    const btnHeadDrawer = q(SEL.headBtnDrawer, root);
    const btnClose = q(SEL.close, root);
    const btnDock = q(SEL.modeDock, root);
    const btnOverlay = q(SEL.modeOverlay, root);
    const pane = q(SEL.pane, root);

    const clearHide = () => { if (S.edgeHideT) { clearTimeout(S.edgeHideT); S.edgeHideT = 0; } };
    const applyEdgeFromHover = () => {
      if (root.getAttribute(ATTR_STATE) === 'open') { root.setAttribute(ATTR_EDGE, '2'); return; }
      if (edgeHot.matches(':hover') || pane.matches(':hover') || edgeShelf.matches(':hover') || edgeDrawer.matches(':hover')) { root.setAttribute(ATTR_EDGE, '2'); return; }
      if (edge.matches(':hover')) { root.setAttribute(ATTR_EDGE, '1'); return; }
      root.setAttribute(ATTR_EDGE, '0');
    };
    const showPeek = () => { if (root.getAttribute(ATTR_STATE) === 'open') return; clearHide(); if (root.getAttribute(ATTR_EDGE) !== '2') root.setAttribute(ATTR_EDGE, '1'); };
    const showFull = () => { clearHide(); root.setAttribute(ATTR_EDGE, '2'); };
    const hideSoon = () => { if (root.getAttribute(ATTR_STATE) === 'open') return; clearHide(); S.edgeHideT = setTimeout(applyEdgeFromHover, CFG.edgeHideDelayMs); };

    edge.addEventListener('pointerenter', showPeek);
    edge.addEventListener('pointerleave', hideSoon);
    edgeHot.addEventListener('pointerenter', showFull);
    edgeHot.addEventListener('pointerleave', hideSoon);
    edgeShelf.addEventListener('pointerenter', showFull);
    edgeShelf.addEventListener('pointerleave', hideSoon);
    edgeDrawer.addEventListener('pointerenter', showFull);
    edgeDrawer.addEventListener('pointerleave', hideSoon);
    pane.addEventListener('pointerenter', showFull);
    pane.addEventListener('pointerleave', hideSoon);

    const openShelf = (e) => { e.preventDefault(); e.stopPropagation(); setState({ open: true, pane: STR.paneShelf }); };
    const openDrawer = (e) => { e.preventDefault(); e.stopPropagation(); setState({ open: true, pane: STR.paneDrawer }); };

    edgeShelf.addEventListener('click', openShelf);
    edgeDrawer.addEventListener('click', openDrawer);
    btnHeadShelf?.addEventListener('click', openShelf);
    btnHeadDrawer?.addEventListener('click', openDrawer);
    btnClose.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setState({ open: false }); });
    btnDock.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setState({ dockMode: STR.modeDock }); });
    btnOverlay.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setState({ dockMode: STR.modeOverlay }); });

    if (!S.handlers.onDocClick) {
      S.handlers.onDocClick = (e) => {
        if (root.getAttribute(ATTR_STATE) !== 'open') return;
        if (pane.contains(e.target) || edgeShelf.contains(e.target) || edgeDrawer.contains(e.target)) return;
        setState({ open: false });
      };
      D.addEventListener('click', S.handlers.onDocClick, true);
    }
    if (!S.handlers.onKeydown) {
      S.handlers.onKeydown = (e) => {
        if (e.key !== 'Escape') return;
        if (root.getAttribute(ATTR_STATE) !== 'open') return;
        setState({ open: false });
      };
      D.addEventListener('keydown', S.handlers.onKeydown, true);
    }
  }

  function bindWorkspaceEventsOnce() {
    ['h2o:wrkspc:ready', 'h2o:wrkspc:right_shell:changed'].forEach((ev) => {
      const fn = () => syncFromState();
      W.addEventListener(ev, fn);
      S.handlers.onWsChanged.push({ ev, fn });
    });
  }

  H2O.WorkspaceDock = H2O.WorkspaceDock || {};
  H2O.WorkspaceDock.ready = () => !!S.booted;
  H2O.WorkspaceDock.getRoot = () => S.root || ensureUI();
  H2O.WorkspaceDock.getBody = () => q(SEL.body, S.root || ensureUI());
  H2O.WorkspaceDock.rerender = () => syncFromState();

  async function boot() {
    if (S.booted) return;
    S.booted = true;
    S.api = await waitForWorkspaceApi();
    ensureUI();
    bindWorkspaceEventsOnce();
    syncFromState();
  }

  boot();
})();
