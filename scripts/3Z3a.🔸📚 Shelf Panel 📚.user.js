// ==UserScript==
// @h2o-id             3Z3a.shelf.panel
// @name               3Z3a.🔶📚 Shelf Panel 📚
// @namespace          H2O.Premium.CGX.shelf.panel
// @author             HumamDev
// @version            0.3.0
// @revision           001
// @build              260310-000000
// @description        Shelf body renderer for H2O Workspace. Consumes the shared Workspace Dock from 3X1a and renders Domain Packs + Modules.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const D = W.document;
  const H2O = (W.H2O = W.H2O || {});

  const SHELL_ROOT_ID = 'cgxui-wsdk-root';
  const SHELL_OWNER = 'wsdk';
  const ATTR_OWNER = 'data-cgxui-owner';
  const ATTR_UI = 'data-cgxui';
  const CSS_ID = 'cgxui-shlfb-style';
  const SkID = 'shlfb';

  const SEL = Object.freeze({
    root: `#${SHELL_ROOT_ID}[${ATTR_OWNER}="${SHELL_OWNER}"][${ATTR_UI}="root"]`,
    body: `[${ATTR_OWNER}="${SHELL_OWNER}"][${ATTR_UI}="body"]`,
    title: `[${ATTR_OWNER}="${SHELL_OWNER}"][${ATTR_UI}="title"]`,
  });

  const STR = Object.freeze({
    paneShelf: 'shelf',
    title: 'Shelf',
    emptyNoCore: 'Workspace Core not loaded.',
    emptyNoShell: 'Workspace Dock not loaded.',
    emptyNoPacks: 'No Domain Packs registered yet.',
      emptyNoModules: 'No modules for this pack yet.',
      emptyNoSuggestions: 'No strong recommendations yet.',
      suggestionsTitle: 'Recommended now',      suggested: 'Suggested',        recommendedShort: 'recommended',
        usedRecently: 'Used recently',      neverUsed: 'Never used',
      capsuleWaiting: 'Capsule waiting',
      needsClaims: 'Needs claims',
      manualTool: 'Manual precision tool',
      ready: 'Ready',
      lastUsed: 'Last used',
      outputs: 'Outputs',
        capsules: 'Capsules',
        capsuleSingular: 'capsule',
        capsulePlural: 'capsules',
        searchPh: 'Search packs or modules…',  });

  const CFG = Object.freeze({
    waitMaxMs: 10000,
    debounceMs: 120,
    observerSubtree: true,
  });

  const S = {
    booted: false,
    api: null,
    root: null,
    body: null,
    titleEl: null,
    mo: null,
    rerenderT: 0,
    uiState: { q: '', selectedPackId: '', collapsedModules: Object.create(null), openModuleByPack: Object.create(null) },
    handlers: { workspace: [] },
  };

  function q(sel, root = D) { return root.querySelector(sel); }
  function safe(fn, fallback = null) { try { return fn(); } catch { return fallback; } }
  function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function debounce(fn, ms = CFG.debounceMs) {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  async function waitForWorkspaceApi(maxMs = CFG.waitMaxMs) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      (function tick() {
        const api = W.H2O?.Workspace || null;
        const ok = !!(api && typeof api.getRightState === 'function' && typeof api.listPacks === 'function' && typeof api.listModules === 'function');
        if (ok) return resolve(api);
        if (Date.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  async function waitForDock(maxMs = CFG.waitMaxMs) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      (function tick() {
        const root = q(SEL.root);
        const body = root ? q(SEL.body, root) : null;
        if (root && body) return resolve({ root, body, titleEl: q(SEL.title, root) });
        if (Date.now() - t0 > maxMs) return resolve(null);
        requestAnimationFrame(tick);
      })();
    });
  }

  function ensureStylesOnce() {
    if (D.getElementById(CSS_ID)) return;
    const s = D.createElement('style');
    s.id = CSS_ID;
    s.textContent = `
      .cgxui-${SkID}-bar{ display:flex; flex-direction:column; gap:10px; margin-bottom:12px; }
      .cgxui-${SkID}-search{ width:100%; height:34px; border-radius:10px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.90); padding:0 10px; outline:none; }
      .cgxui-${SkID}-search::placeholder{ color:rgba(255,255,255,0.62); }
      .cgxui-${SkID}-packbar,.cgxui-${SkID}-mod-meta{ display:flex; flex-wrap:wrap; gap:6px; }
      .cgxui-${SkID}-chip,.cgxui-${SkID}-tag{ display:inline-flex; align-items:center; gap:6px; padding:5px 9px; border-radius:999px; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.90); }
      .cgxui-${SkID}-chip.is-active{ background:rgba(35,214,180,0.16); border-color:rgba(35,214,180,0.36); }
      .cgxui-${SkID}-sec{ margin-top:14px; }
      .cgxui-${SkID}-sec-hd{ display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
      .cgxui-${SkID}-sec-ttl{ font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",Arial; letter-spacing:.24px; color:rgba(255,255,255,0.88); text-transform:uppercase; }
      .cgxui-${SkID}-muted{ color:rgba(255,255,255,0.62); }
      .cgxui-${SkID}-packs{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .cgxui-${SkID}-pack,.cgxui-${SkID}-mod{ border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.05); border-radius:14px; padding:10px; }

      .cgxui-${SkID}-mod.is-open{
        border-color: rgba(120,170,255,0.24);
        box-shadow:
          0 0 0 1px rgba(120,170,255,0.10) inset,
          0 8px 24px rgba(0,0,0,0.14);
      }

      .cgxui-${SkID}-mod.is-open .cgxui-${SkID}-mod-head{
        background: rgba(120,170,255,0.05);
      }

      .cgxui-${SkID}-mod.is-open .cgxui-${SkID}-mod-name{
        color: rgba(255,255,255,0.98);
      }

      .cgxui-${SkID}-mod.is-open:has(.cgxui-${SkID}-status.is-suggested-1),
      .cgxui-${SkID}-mod.is-open:has(.cgxui-${SkID}-status.is-suggested-2),
      .cgxui-${SkID}-mod.is-open:has(.cgxui-${SkID}-status.is-suggested-3){
        border-color: rgba(35,214,180,0.26);
        box-shadow:
          0 0 0 1px rgba(35,214,180,0.10) inset,
          0 8px 24px rgba(0,0,0,0.14);
      }
      .cgxui-${SkID}-pack{ cursor:pointer; transition:background .18s ease, border-color .18s ease, transform .12s ease; }
      .cgxui-${SkID}-pack:hover{ background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.16); transform:translateY(-1px); }
      .cgxui-${SkID}-pack.is-selected{ border-color:rgba(35,214,180,0.34); background:rgba(35,214,180,0.10); }
      .cgxui-${SkID}-pack-top,.cgxui-${SkID}-mod-top{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .cgxui-${SkID}-pack-ttl,.cgxui-${SkID}-mod-name{ font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(255,255,255,0.90); }
      .cgxui-${SkID}-mod-name{
        display:block;
        min-width:0;
        font:700 13px/1.12 system-ui,-apple-system,"Segoe UI",Arial;
        letter-spacing:0.01em;
      }
      .cgxui-${SkID}-pack-sub{ font:11px/1.35 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(255,255,255,0.62); min-height:30px; margin-top:8px; }
      .cgxui-${SkID}-pack-ft{ margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .cgxui-${SkID}-pack-metrics{
        margin-top:6px;
        display:flex;
        flex-wrap:wrap;
        gap:6px;
      }

      .cgxui-${SkID}-pack-metric{
        font:10px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.78);
        padding:3px 7px;
        border-radius:999px;
        background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,0.08);
      }

      .cgxui-${SkID}-pack-metric.is-suggested{
        color:rgba(220,255,246,0.94);
        background:rgba(35,214,180,0.12);
        border-color:rgba(35,214,180,0.22);
      }

      .cgxui-${SkID}-pack-metric.is-capsule{
        color:rgba(255,236,190,0.96);
        background:rgba(255,195,92,0.12);
        border-color:rgba(255,195,92,0.22);
      }
      .cgxui-${SkID}-pack-ico{ width:28px; height:28px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.08); font-size:15px; }
      .cgxui-${SkID}-mini{ font:10px/1.2 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(255,255,255,0.62); }
      .cgxui-${SkID}-act,.cgxui-${SkID}-pin{ height:26px; padding:0 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.90); cursor:pointer; }
      .cgxui-${SkID}-act.is-on{ background:rgba(35,214,180,0.18); border-color:rgba(35,214,180,0.36); }
      .cgxui-${SkID}-pin.is-on{ background:rgba(255,212,96,0.18); border-color:rgba(255,212,96,0.34); }
      .cgxui-${SkID}-mods{ display:flex; flex-direction:column; gap:8px; }

      .cgxui-${SkID}-mod-body{
        margin-top:8px;
        overflow:hidden;
        max-height:420px;
        opacity:1;
        transform:translateY(0);
        transition:
          max-height .26s cubic-bezier(.22,.8,.22,1),
          opacity .18s ease,
          transform .18s ease,
          margin-top .18s ease;
        will-change:max-height, opacity, transform;
      }

      .cgxui-${SkID}-mod.is-collapsed .cgxui-${SkID}-mod-body{
        max-height:0;
        opacity:0;
        transform:translateY(-4px);
        margin-top:0;
        pointer-events:none;
      }

      .cgxui-${SkID}-mod-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:8px;
        cursor:pointer;
        border-radius:12px;
        transition:background .16s ease, box-shadow .16s ease;
      }

      .cgxui-${SkID}-mod-head:hover{
        background:rgba(255,255,255,0.04);
        box-shadow:0 0 0 1px rgba(255,255,255,0.04) inset;
      }

      .cgxui-${SkID}-mod-head:hover .cgxui-${SkID}-mod-name{
        color:rgba(255,255,255,0.96);
      }

      .cgxui-${SkID}-mod:has(.cgxui-${SkID}-status.is-suggested-1) .cgxui-${SkID}-mod-head:hover,
      .cgxui-${SkID}-mod:has(.cgxui-${SkID}-status.is-suggested-2) .cgxui-${SkID}-mod-head:hover,
      .cgxui-${SkID}-mod:has(.cgxui-${SkID}-status.is-suggested-3) .cgxui-${SkID}-mod-head:hover{
        background:rgba(114,132,255,0.08);
        box-shadow:0 0 0 1px rgba(114,132,255,0.10) inset;
      }

      .cgxui-${SkID}-mod-left{
        display:flex;
        flex-direction:column;
        gap:0;
        min-width:0;
        flex:1;
      }

      .cgxui-${SkID}-mod-title-row{
        display:flex;
        align-items:flex-start;
        gap:8px;
        min-width:0;
      }

      .cgxui-${SkID}-mod-title-stack{
        display:flex;
        flex-direction:column;
        gap:6px;
        min-width:0;
        flex:1;
      }

      .cgxui-${SkID}-mod-status-row{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
        align-items:center;
      }

      .cgxui-${SkID}-mod-actions{
        display:flex;
        gap:6px;
        align-items:center;
        flex-shrink:0;
        padding-top:2px;
      }

      .cgxui-${SkID}-status{
        font:9px/1.15 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.86);
        padding:3px 8px;
        border-radius:999px;
        background:rgba(255,255,255,0.06);
        border:1px solid rgba(255,255,255,0.10);
      }

      .cgxui-${SkID}-status.is-suggested{
        color:rgba(231,238,255,0.96);
        background:rgba(114,132,255,0.14);
        border-color:rgba(114,132,255,0.24);
      }

      .cgxui-${SkID}-status.is-suggested-1{
        color:rgba(242,246,255,0.98);
        background:rgba(114,132,255,0.28);
        border-color:rgba(114,132,255,0.42);
        box-shadow:0 0 0 1px rgba(114,132,255,0.12) inset;
      }

      .cgxui-${SkID}-status.is-suggested-2{
        color:rgba(236,242,255,0.96);
        background:rgba(114,132,255,0.20);
        border-color:rgba(114,132,255,0.32);
      }

      .cgxui-${SkID}-status.is-suggested-3{
        color:rgba(228,236,255,0.92);
        background:rgba(114,132,255,0.12);
        border-color:rgba(114,132,255,0.22);
      }

      .cgxui-${SkID}-status.is-warning{
        color:rgba(255,232,184,0.98);
        background:rgba(255,195,92,0.16);
        border-color:rgba(255,195,92,0.30);
      }

      .cgxui-${SkID}-status.is-warning-capsule{
        color:rgba(255,239,196,0.99);
        background:rgba(255,195,92,0.24);
        border-color:rgba(255,195,92,0.40);
        box-shadow:0 0 0 1px rgba(255,195,92,0.10) inset;
      }

      .cgxui-${SkID}-status.is-warning-blocked{
        color:rgba(255,228,184,0.98);
        background:rgba(255,160,92,0.20);
        border-color:rgba(255,160,92,0.34);
        box-shadow:0 0 0 1px rgba(255,160,92,0.10) inset;
      }

      .cgxui-${SkID}-status.is-used{
        color:rgba(221,229,240,0.92);
        background:rgba(132,148,168,0.12);
        border-color:rgba(132,148,168,0.22);
      }

      .cgxui-${SkID}-status.is-never{
        color:rgba(255,255,255,0.76);
        background:rgba(255,255,255,0.04);
        border-color:rgba(255,255,255,0.08);
      }

      .cgxui-${SkID}-status.is-manual{
        color:rgba(224,212,255,0.92);
        background:rgba(166,123,255,0.10);
        border-color:rgba(166,123,255,0.18);
      }

      .cgxui-${SkID}-status.is-ready{
        color:rgba(214,255,232,0.92);
        background:rgba(76,201,140,0.10);
        border-color:rgba(76,201,140,0.18);
      }

      .cgxui-${SkID}-substate{
        font:10px/1.3 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.56);
      }

      .cgxui-${SkID}-badge-row{
        margin-top:6px;
        display:flex;
        flex-wrap:wrap;
        gap:6px;
      }

      .cgxui-${SkID}-badge{
        font:10px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.78);
        padding:3px 6px;
        border-radius:999px;
        background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,0.08);
      }

      .cgxui-${SkID}-badge.is-primary{
        color:rgba(220,255,246,0.92);
        background:rgba(35,214,180,0.14);
        border-color:rgba(35,214,180,0.24);
      }

      .cgxui-${SkID}-badge.is-secondary{
        color:rgba(255,255,255,0.72);
        background:rgba(255,255,255,0.04);
        border-color:rgba(255,255,255,0.06);
      }



      .cgxui-${SkID}-chev{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:16px;
        min-width:16px;
        height:16px;
        font:700 11px/1 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(255,255,255,0.46);
        transition:transform .16s ease, color .16s ease;
        user-select:none;
      }

      .cgxui-${SkID}-mod:hover .cgxui-${SkID}-chev{
        color:rgba(255,255,255,0.72);
      }

      .cgxui-${SkID}-mod.is-collapsed .cgxui-${SkID}-chev{
        transform:rotate(0deg);
      }

      .cgxui-${SkID}-mod:not(.is-collapsed) .cgxui-${SkID}-chev{
        transform:rotate(90deg);
      }

      .cgxui-${SkID}-summary-strip{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
      }

      .cgxui-${SkID}-summary-chip{
        font:10px/1.2 system-ui,-apple-system,"Segoe UI",Arial;
        color:rgba(220,255,246,0.92);
        padding:4px 8px;
        border-radius:999px;
        background:rgba(35,214,180,0.10);
        border:1px solid rgba(35,214,180,0.18);
      }

      .cgxui-${SkID}-sugs{ display:flex; flex-direction:column; gap:8px; }
      .cgxui-${SkID}-sug{ border:1px solid rgba(35,214,180,0.18); background:rgba(35,214,180,0.07); border-radius:14px; padding:10px; }
      .cgxui-${SkID}-sug-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
      .cgxui-${SkID}-sug-name{ font:700 12px/1.2 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(220,255,246,0.96); }
      .cgxui-${SkID}-sug-score{ font:10px/1.2 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(220,255,246,0.82); padding:3px 6px; border-radius:999px; background:rgba(35,214,180,0.18); border:1px solid rgba(35,214,180,0.24); }
      .cgxui-${SkID}-sug-body{ margin-top:6px; font:11px/1.4 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(255,255,255,0.78); }
      .cgxui-${SkID}-sug-next{ margin-top:6px; font:11px/1.4 system-ui,-apple-system,"Segoe UI",Arial; color:rgba(255,255,255,0.62); }
      .cgxui-${SkID}-empty{ padding:14px 12px; border-radius:12px; border:1px dashed rgba(255,255,255,0.12); background:rgba(255,255,255,0.03); color:rgba(255,255,255,0.62); }
    `;
    D.documentElement.appendChild(s);
  }

  function attachDockRefs() {
    const root = q(SEL.root);
    const body = root ? q(SEL.body, root) : null;
    const titleEl = root ? q(SEL.title, root) : null;
    S.root = root || null;
    S.body = body || null;
    S.titleEl = titleEl || null;
    return !!(S.root && S.body);
  }

  function observeDock() {
    if (S.mo || typeof MutationObserver !== 'function') return;
    S.mo = new MutationObserver(() => {
      const hadBody = !!S.body;
      const ok = attachDockRefs();
      if (!hadBody && ok) rerender();
    });
    S.mo.observe(D.documentElement, { childList: true, subtree: CFG.observerSubtree });
  }

  function isShelfPane() {
    const rs = safe(() => S.api?.getRightState?.(), null) || { pane: STR.paneShelf };
    return String(rs.pane || '') === STR.paneShelf;
  }

  function getShelfUiState() {
    const coreUi = safe(() => S.api?.getContract?.()?.state?.shelfUi?.(), null) || {};
    return {
      q: S.uiState.q || coreUi.q || '',
      selectedPackId: S.uiState.selectedPackId || coreUi.selectedPackId || safe(() => S.api?.getChatProfile?.()?.prefs?.primaryPackId, '') || '',
      collapsedModules: {
        ...((coreUi.collapsedModules && typeof coreUi.collapsedModules === 'object') ? coreUi.collapsedModules : {}),
        ...((S.uiState.collapsedModules && typeof S.uiState.collapsedModules === 'object') ? S.uiState.collapsedModules : {}),
      },
      openModuleByPack: {
        ...((coreUi.openModuleByPack && typeof coreUi.openModuleByPack === 'object') ? coreUi.openModuleByPack : {}),
        ...((S.uiState.openModuleByPack && typeof S.uiState.openModuleByPack === 'object') ? S.uiState.openModuleByPack : {}),
      },
    };
  }

  function saveShelfUiPatch(patch) {
    S.uiState = {
      ...S.uiState,
      ...(patch || {}),
      collapsedModules: {
        ...(S.uiState.collapsedModules || {}),
        ...((patch && patch.collapsedModules) || {}),
      },
      openModuleByPack: {
        ...(S.uiState.openModuleByPack || {}),
        ...((patch && patch.openModuleByPack) || {}),
      },
    };

    safe(() => S.api?.saveShelfUi?.({
      q: S.uiState.q || '',
      selectedPackId: S.uiState.selectedPackId || '',
      collapsedModules: { ...(S.uiState.collapsedModules || {}) },
      openModuleByPack: { ...(S.uiState.openModuleByPack || {}) },
    }));
    const profile = safe(() => S.api?.getChatProfile?.(), null);
    if (profile && patch && Object.prototype.hasOwnProperty.call(patch, 'selectedPackId')) {
      safe(() => S.api?.saveChatProfile?.({ prefs: { ...(profile.prefs || {}), primaryPackId: patch.selectedPackId || '' } }));
    }
  }

  function renderEmpty(html) {
    if (!S.body) return;
    if (S.titleEl) S.titleEl.textContent = STR.title;
    S.body.innerHTML = `<div class="cgxui-${SkID}-empty">${html}</div>`;
  }

  function pickSelectedPack(packs, uiState) {
    const arr = Array.isArray(packs) ? packs : [];
    if (!arr.length) return '';
    const ids = new Set(arr.map(x => String(x?.id || '')));
    if (uiState.selectedPackId && ids.has(uiState.selectedPackId)) return uiState.selectedPackId;
    const profile = safe(() => S.api?.getChatProfile?.(), null);
    const primary = String(profile?.prefs?.primaryPackId || '');
    if (primary && ids.has(primary)) return primary;
    const active = Array.isArray(profile?.activePackIds) ? profile.activePackIds : [];
    const firstActive = active.find(id => ids.has(String(id)));
    if (firstActive) return String(firstActive);
    return String(arr[0]?.id || '');
  }

  function renderActivePackBar(packs, activePacks, selectedPackId) {
    const host = q('[data-shlfb="active-packbar"]', S.body);
    if (!host) return;
    const activeList = (packs || []).filter(p => activePacks.has(String(p?.id || '')));
    if (!activeList.length) {
      host.innerHTML = `<div class="cgxui-${SkID}-muted">No active packs for this chat.</div>`;
      return;
    }
    host.innerHTML = activeList.map((p) => {
      const id = String(p?.id || '');
      const cls = `cgxui-${SkID}-chip${id === selectedPackId ? ' is-active' : ''}`;
      return `<button class="${cls}" type="button" data-pack-chip="${escHtml(id)}">${escHtml(p?.icon || '📦')} ${escHtml(p?.title || id)}</button>`;
    }).join('');
  }

  function renderSuggestions(suggestions) {
    const host = q('[data-shlfb="suggestions"]', S.body);
    if (!host) return;

    const arr = Array.isArray(suggestions) ? suggestions : [];
    if (!arr.length) {
      host.innerHTML = `<div class="cgxui-${SkID}-empty">${escHtml(STR.emptyNoSuggestions)}</div>`;
      return;
    }

    host.innerHTML = arr.map((item) => {
      const id = String(item?.moduleId || '');
      const title = String(item?.title || id);
      const icon = String(item?.icon || '🧩');
      const score = Number(item?.score || 0);
      const reason = String(item?.reason || '').trim();
      const nextAction = String(item?.nextAction || '').trim();

      return `
        <div class="cgxui-${SkID}-sug" data-suggest-card="${escHtml(id)}">
          <div class="cgxui-${SkID}-sug-top">
            <div class="cgxui-${SkID}-sug-name">${escHtml(icon)} ${escHtml(title)}</div>
            <div style="display:flex; gap:6px; align-items:center;">
              <span class="cgxui-${SkID}-sug-score">${escHtml(score.toFixed(2))}</span>
              <button class="cgxui-${SkID}-act is-on" type="button" data-suggest-run="${escHtml(id)}">Run</button>
            </div>
          </div>
          ${reason ? `<div class="cgxui-${SkID}-sug-body">${escHtml(reason)}</div>` : ''}
          ${nextAction ? `<div class="cgxui-${SkID}-sug-next">Next: ${escHtml(nextAction)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function getCapsuleCountLabel(n) {
    const count = Number(n || 0);
    return count === 1 ? STR.capsuleSingular : STR.capsulePlural;
  }

  function getPackMetrics(pack, suggestions) {
    const packId = String(pack?.id || '');
    if (!packId) {
      return { suggestedCount: 0, capsuleCount: 0 };
    }

    const sugg = Array.isArray(suggestions) ? suggestions : [];
    const suggestedCount = sugg.filter(x => String(x?.packId || '') === packId).length;

    const arts = safe(() => S.api?.listArtifacts?.({}), []) || [];
    const modules = safe(() => S.api?.listModules?.(), []) || [];
    const moduleIds = new Set(
      modules
        .filter(m => String(m?.packId || '') === packId)
        .map(m => String(m?.id || ''))
        .filter(Boolean)
    );

    const capsuleCount = arts.filter(a =>
      String(a?.type || '') === 'prompt_capsule' &&
      String(a?.status || '') === 'ready' &&
      moduleIds.has(String(a?.moduleId || ''))
    ).length;

    return { suggestedCount, capsuleCount };
  }

  function renderPackCards(packs, activePacks, selectedPackId, suggestions) {
    const host = q('[data-shlfb="packs"]', S.body);
    if (!host) return;
    if (!packs.length) {
      host.innerHTML = `<div class="cgxui-${SkID}-empty">${escHtml(STR.emptyNoPacks)}</div>`;
      return;
    }
    host.innerHTML = packs.map((p) => {
      const id = String(p?.id || '');
      const isSelected = id === selectedPackId;
      const isActive = activePacks.has(id);
      const cls = `cgxui-${SkID}-pack${isSelected ? ' is-selected' : ''}`;
      const desc = String(p?.description || '').trim() || 'No description yet.';
      const moduleCount = Array.isArray(p?.moduleIds) ? p.moduleIds.length : 0;
      const btnCls = `cgxui-${SkID}-act${isActive ? ' is-on' : ''}`;
      const metrics = getPackMetrics(p, suggestions);
      return `
        <div class="${cls}" data-pack-card="${escHtml(id)}">
          <div class="cgxui-${SkID}-pack-top"><div style="display:flex; align-items:center; gap:8px;"><div class="cgxui-${SkID}-pack-ico">${escHtml(p?.icon || '📦')}</div><div class="cgxui-${SkID}-pack-ttl">${escHtml(p?.title || id)}</div></div></div>
          <div class="cgxui-${SkID}-pack-sub">${escHtml(desc)}</div>
          <div class="cgxui-${SkID}-pack-metrics">
            ${metrics.suggestedCount > 0 ? `<span class="cgxui-${SkID}-pack-metric is-suggested">${escHtml(`${metrics.suggestedCount} ${STR.recommendedShort}`)}</span>` : ''}
            ${metrics.capsuleCount > 0 ? `<span class="cgxui-${SkID}-pack-metric is-capsule">${escHtml(`${metrics.capsuleCount} ${getCapsuleCountLabel(metrics.capsuleCount)}`)}</span>` : ''}
          </div>
          <div class="cgxui-${SkID}-pack-ft"><div class="cgxui-${SkID}-mini">${moduleCount} modules</div><button class="${btnCls}" type="button" data-pack-toggle="${escHtml(id)}">${isActive ? 'Active' : 'Enable'}</button></div>
        </div>
      `;
    }).join('');
  }

  function sortPackModules(modules, selectedPackId, suggestions) {
    const arr = Array.isArray(modules) ? modules.slice() : [];
    const suggRank = new Map((Array.isArray(suggestions) ? suggestions : []).map((x, i) => [String(x?.moduleId || ''), i + 1]));

    if (String(selectedPackId || '') === 'legal') {
      const order = [
        'legal.timeline',
        'legal.claim_sweep',
        'legal.contradiction_pairer',
        'legal.actor_sweep',
        'legal.claim_log',
        'legal.actor_map',
      ];
      const idx = new Map(order.map((x, i) => [x, i]));
      return arr.sort((a, b) => {
        const ai = idx.has(a?.id) ? idx.get(a.id) : 999;
        const bi = idx.has(b?.id) ? idx.get(b.id) : 999;
        if (ai !== bi) return ai - bi;

        const ar = suggRank.has(a?.id) ? suggRank.get(a.id) : 999;
        const br = suggRank.has(b?.id) ? suggRank.get(b.id) : 999;
        if (ar !== br) return ar - br;

        return String(a?.title || a?.id || '').localeCompare(String(b?.title || b?.id || ''));
      });
    }

    return arr.sort((a, b) => {
      const ar = suggRank.has(a?.id) ? suggRank.get(a.id) : 999;
      const br = suggRank.has(b?.id) ? suggRank.get(b.id) : 999;
      if (ar !== br) return ar - br;
      return String(a?.title || a?.id || '').localeCompare(String(b?.title || b?.id || ''));
    });
  }

  function getModuleSuggestedRank(mod, suggestions) {
    const id = String(mod?.id || '');
    const idx = (Array.isArray(suggestions) ? suggestions : []).findIndex(x => String(x?.moduleId || '') === id);
    return idx >= 0 ? idx + 1 : 0;
  }

  function getModuleSuggestionScore(mod, suggestions) {
    const id = String(mod?.id || '');
    const hit = (Array.isArray(suggestions) ? suggestions : []).find(x => String(x?.moduleId || '') === id);
    const n = Number(hit?.score || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function getSuggestedRankClass(rank) {
    const n = Number(rank || 0);
    if (n === 1) return 'is-suggested-1';
    if (n === 2) return 'is-suggested-2';
    if (n === 3) return 'is-suggested-3';
    return 'is-suggested';
  }

  function getUsageStatusClass(usage) {
    const label = String(usage?.label || '');
    const kind = String(usage?.kind || '');

    if (label === STR.capsuleWaiting) return 'is-warning-capsule';
    if (label === STR.needsClaims) return 'is-warning-blocked';
    if (label === STR.usedRecently) return 'is-used';
    if (label === STR.neverUsed) return 'is-never';
    if (label === STR.manualTool) return 'is-manual';
    if (label === STR.ready) return 'is-ready';
    if (kind === 'warning') return 'is-warning';
    return '';
  }

  function getModuleModeBadge(mod) {
    const mode = String(mod?.mode || '').trim().toLowerCase();
    if (mode === 'observer') return '👀 Observer';
    if (mode === 'extractor') return '🧲 Extractor';
    if (mode === 'bridge') return '💬 Bridge';
    if (mode === 'refiner') return '🛠️ Refiner';
    return '🧩 Module';
  }

  function getModulePermissionBadges(mod) {
    const c = (mod?.capabilities && typeof mod.capabilities === 'object') ? mod.capabilities : {};
    const out = [];
    if (c.readTurns) out.push('Turns');
    if (c.readSelection) out.push('Selection');
    if (c.readArtifacts) out.push('Artifacts');
    if (c.readAttachments) out.push('Attachments');
    if (c.writeArtifacts) out.push('Write');
    if (c.draftPromptCapsules || c.emitSuggestions) out.push('Prompt');
    if (c.insertPromptIntoComposer) out.push('Composer');
    return out.slice(0, 6);
  }

  function getModuleOutputTriggerBadges(mod) {
    const out = [];
    if (Array.isArray(mod?.outputs)) out.push(...mod.outputs.slice(0, 2));
    if (Array.isArray(mod?.triggers)) out.push(...mod.triggers.slice(0, 2));
    return out.filter(Boolean);
  }

  function getModuleUsageState(mod) {
    const id = String(mod?.id || '');
    const arts = safe(() => S.api?.listArtifacts?.({}), []) || [];
    const modArts = arts.filter(x => String(x?.moduleId || '') === id);
    const readyCapsules = modArts.filter(x => String(x?.type || '') === 'prompt_capsule' && String(x?.status || '') === 'ready');

    if (readyCapsules.length) return { label: STR.capsuleWaiting, kind: 'warning' };

    if (id === 'legal.contradiction_pairer') {
      const claimCount = arts.filter(x => String(x?.type || '') === 'legal_claim' && String(x?.status || '') !== 'archived').length;
      if (claimCount < 2) return { label: STR.needsClaims, kind: 'warning' };
    }

    if (id === 'legal.claim_log' || id === 'legal.actor_map') {
      return { label: STR.manualTool, kind: 'normal' };
    }

    if (modArts.length > 0) {
      return { label: STR.usedRecently, kind: 'normal' };
    }

    return { label: STR.neverUsed, kind: 'normal' };
  }

  function getModuleLastUsedTs(mod) {
    const id = String(mod?.id || '');
    const arts = safe(() => S.api?.listArtifacts?.({}), []) || [];
    const modArts = arts.filter(x => String(x?.moduleId || '') === id);

    let latest = 0;
    for (const a of modArts) {
      const ts = Number(a?.updatedAt || a?.createdAt || 0);
      if (ts > latest) latest = ts;
    }
    return latest || 0;
  }

  function formatRelativeUsed(ts) {
    const n = Number(ts || 0);
    if (!n) return '';

    const diff = Math.max(0, Date.now() - n);
    const sec = Math.floor(diff / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);

    if (sec < 60) return 'just now';
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (day < 7) return `${day}d ago`;

    try {
      return new Date(n).toLocaleDateString([], {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
      });
    } catch (_) {
      return '';
    }
  }

  function getModuleOutputStats(mod) {
    const id = String(mod?.id || '');
    const arts = safe(() => S.api?.listArtifacts?.({}), []) || [];
    const modArts = arts.filter(x => String(x?.moduleId || '') === id);
    const activeArts = modArts.filter(x => String(x?.status || '') !== 'archived');
    const readyCapsules = activeArts.filter(x => String(x?.type || '') === 'prompt_capsule' && String(x?.status || '') === 'ready');

    return {
      total: modArts.length,
      active: activeArts.length,
      readyCapsules: readyCapsules.length,
    };
  }

  function formatModuleOutputSubstate(mod) {
    const stats = getModuleOutputStats(mod);
    const parts = [];

    if (stats.active > 0) parts.push(`${STR.outputs}: ${stats.active}`);
    if (stats.readyCapsules > 0) parts.push(`${STR.capsules}: ${stats.readyCapsules}`);

    return parts.join(' · ');
  }

    function getDefaultOpenModuleId(modules, suggestions) {
    const arr = Array.isArray(modules) ? modules : [];

    const suggested = arr.find(m => getModuleSuggestedRank(m, suggestions) === 1);
    if (suggested?.id) return String(suggested.id);

    const capsule = arr.find(m => getModuleUsageState(m).label === STR.capsuleWaiting);
    if (capsule?.id) return String(capsule.id);

    const used = arr.find(m => getModuleUsageState(m).label === STR.usedRecently);
    if (used?.id) return String(used.id);

    return '';
  }

function shouldModuleStartCollapsed(mod, suggestions, uiState, selectedPackId, defaultOpenId) {
  const id = String(mod?.id || '');
  const packId = String(selectedPackId || '');
  const rememberedOpenId = String(uiState?.openModuleByPack?.[packId] || '');

  const forced = uiState?.collapsedModules?.[id];
  if (typeof forced === 'boolean') return forced;

  if (rememberedOpenId) {
    return rememberedOpenId !== id;
  }

  if (defaultOpenId) {
    return String(defaultOpenId) !== id;
  }

  return true;
}

  function toggleModuleCollapsed(id, modules = [], selectedPackId = '') {
    const ui = getShelfUiState();
    const sid = String(id || '');
    const packId = String(selectedPackId || ui?.selectedPackId || '');
    if (!sid) return;
  
    const curCollapsed = !!ui?.collapsedModules?.[sid];
    const nextCollapsed = {};
    const nextOpenByPack = { ...(ui?.openModuleByPack || {}) };
  
    // If currently open -> collapse it and clear remembered open module for this pack.
    if (!curCollapsed) {
      nextCollapsed[sid] = true;
      if (packId) nextOpenByPack[packId] = '';
    } else {
      // Accordion mode: open only this one, collapse all others in current pack.
      for (const m of (Array.isArray(modules) ? modules : [])) {
        const mid = String(m?.id || '');
        if (!mid) continue;
        nextCollapsed[mid] = mid !== sid;
      }
      if (packId) nextOpenByPack[packId] = sid;
    }
  
    saveShelfUiPatch({
      collapsedModules: nextCollapsed,
      openModuleByPack: nextOpenByPack,
    });
    rerender();
  }  function renderSuggestionSummary(suggestions) {
    const arr = (Array.isArray(suggestions) ? suggestions : []).slice(0, 3);
    if (!arr.length) return '';
    return `
      <section class="cgxui-${SkID}-sec">
        <div class="cgxui-${SkID}-summary-strip">
          ${arr.map((x, i) => `<span class="cgxui-${SkID}-summary-chip">${escHtml(`${STR.suggested} #${i + 1}: ${String(x?.title || x?.moduleId || '')}`)}</span>`).join('')}
        </div>
      </section>
    `;
  }

  function renderModuleCards(modules, pinned, suggestions, uiState, selectedPackId, defaultOpenId) {
    const host = q('[data-shlfb="modules"]', S.body);
    if (!host) return;
    if (!modules.length) {
      host.innerHTML = `<div class="cgxui-${SkID}-empty">${escHtml(STR.emptyNoModules)}</div>`;
      return;
    }
    host.innerHTML = modules.map((m) => {
      const id = String(m?.id || '');
      const isPinned = pinned.has(id);
      const rank = getModuleSuggestedRank(m, suggestions);
      const usage = getModuleUsageState(m);
      const collapsed = shouldModuleStartCollapsed(m, suggestions, uiState, selectedPackId, defaultOpenId);
      const modeBadge = getModuleModeBadge(m);
      const permBadges = getModulePermissionBadges(m);
      const ioBadges = getModuleOutputTriggerBadges(m);
      const lastUsedTs = getModuleLastUsedTs(m);
      const lastUsedText = formatRelativeUsed(lastUsedTs);
      const outputSubstate = formatModuleOutputSubstate(m);
      const metaParts = [];
      if (lastUsedText) metaParts.push(`${STR.lastUsed}: ${lastUsedText}`);
      if (outputSubstate) metaParts.push(outputSubstate);
      return `
        <div class="cgxui-${SkID}-mod ${collapsed ? 'is-collapsed' : 'is-open'}" data-module-card="${escHtml(id)}">
          <div class="cgxui-${SkID}-mod-head" data-module-toggle="${escHtml(id)}">
            <div class="cgxui-${SkID}-mod-left">
              <div class="cgxui-${SkID}-mod-title-row">
                <span class="cgxui-${SkID}-chev" aria-hidden="true">▸</span>
                <div class="cgxui-${SkID}-mod-title-stack">
                  <div class="cgxui-${SkID}-mod-name">${escHtml(m?.icon || '🧩')} ${escHtml(m?.title || id)}</div>
                  <div class="cgxui-${SkID}-mod-status-row">
                    ${rank ? `<span class="cgxui-${SkID}-status ${getSuggestedRankClass(rank)}" title="Suggested rank #${escHtml(String(rank))} · recommendation score ${escHtml(String(getModuleSuggestionScore(m, suggestions).toFixed(2)))}">${escHtml(`${STR.suggested} #${rank}`)}</span>` : ''}
                    <span class="cgxui-${SkID}-status ${getUsageStatusClass(usage)}">${escHtml(usage.label)}</span>
                  </div>
                  ${metaParts.length ? `<div class="cgxui-${SkID}-substate">${escHtml(metaParts.join(' · '))}</div>` : ''}
                </div>
              </div>
            </div>

            <div class="cgxui-${SkID}-mod-actions">
              <button class="cgxui-${SkID}-pin${isPinned ? ' is-on' : ''}" type="button" data-module-pin="${escHtml(id)}" title="Pin module">${isPinned ? '★' : '☆'}</button>
              <button class="cgxui-${SkID}-act is-on" type="button" data-module-run="${escHtml(id)}" title="Run module">Run</button>
            </div>
          </div>

          <div class="cgxui-${SkID}-mod-body">
            <div class="cgxui-${SkID}-badge-row">
              <span class="cgxui-${SkID}-badge is-primary">${escHtml(modeBadge)}</span>
              ${permBadges.map(x => `<span class="cgxui-${SkID}-badge is-primary">${escHtml(x)}</span>`).join('')}
            </div>

            <div class="cgxui-${SkID}-muted" style="margin-top:8px;">${escHtml(String(m?.description || '').trim() || 'No description yet.')}</div>

            <div class="cgxui-${SkID}-badge-row">
              ${ioBadges.map(x => `<span class="cgxui-${SkID}-badge is-secondary">${escHtml(x)}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderShelf() {
    if (!S.api) return renderEmpty(STR.emptyNoCore);
    if (!S.root || !S.body) return renderEmpty(STR.emptyNoShell);
    if (!isShelfPane()) return;
    if (S.titleEl) S.titleEl.textContent = STR.title;

    const packs = safe(() => S.api.listPacks?.(), []) || [];
    const modules = safe(() => S.api.listModules?.(), []) || [];
    const profile = safe(() => S.api.getChatProfile?.(), {}) || {};
    const suggestions = safe(() => S.api.suggestModulesForChat?.(), []) || [];
    const pinned = new Set(safe(() => S.api.listPinnedModules?.(), []) || []);
    const activePacks = new Set(Array.isArray(profile.activePackIds) ? profile.activePackIds : []);
    const uiState = getShelfUiState();
    const selectedPackId = pickSelectedPack(packs, uiState);
    S.currentSelectedPackId = String(selectedPackId || '');
    if (selectedPackId !== uiState.selectedPackId) saveShelfUiPatch({ selectedPackId });
    const searchQ = norm(uiState.q);
    const filteredPacks = packs.filter((p) => !searchQ || norm([p?.title, p?.description, ...(Array.isArray(p?.tags) ? p.tags : [])].join(' ')).includes(searchQ));
    const selectedPack = packs.find(p => String(p?.id || '') === String(selectedPackId || '')) || null;
    const packModulesRaw = modules.filter(m => String(m?.packId || '') === String(selectedPackId || ''));
    const packModulesFiltered = searchQ
      ? packModulesRaw.filter((m) => norm([m?.title, m?.description, ...(Array.isArray(m?.outputs) ? m.outputs : []), ...(Array.isArray(m?.triggers) ? m.triggers : [])].join(' ')).includes(searchQ))
      : packModulesRaw;
    const packModules = sortPackModules(packModulesFiltered, selectedPackId, suggestions);
    S.currentPackModules = Array.isArray(packModules) ? packModules.slice() : [];
    const defaultOpenId = getDefaultOpenModuleId(packModules, suggestions);

    S.body.innerHTML = `
      <div class="cgxui-${SkID}-bar">
        <input class="cgxui-${SkID}-search" data-shlfb="search" type="text" placeholder="${escHtml(STR.searchPh)}" value="${escHtml(uiState.q || '')}">
        <div class="cgxui-${SkID}-packbar" data-shlfb="active-packbar"></div>
      </div>

      ${renderSuggestionSummary(suggestions)}

      <section class="cgxui-${SkID}-sec">
        <div class="cgxui-${SkID}-sec-hd">
          <div class="cgxui-${SkID}-sec-ttl">Domain Packs</div>
          <div class="cgxui-${SkID}-muted">${filteredPacks.length}</div>
        </div>
        <div class="cgxui-${SkID}-packs" data-shlfb="packs"></div>
      </section>

      <section class="cgxui-${SkID}-sec">
        <div class="cgxui-${SkID}-sec-hd">
          <div class="cgxui-${SkID}-sec-ttl">Modules${selectedPack ? ` · ${escHtml(selectedPack.title || selectedPack.id)}` : ''}</div>
          <div class="cgxui-${SkID}-muted">${packModules.length}</div>
        </div>
        <div class="cgxui-${SkID}-mods" data-shlfb="modules"></div>
      </section>
    `;
    renderActivePackBar(packs, activePacks, selectedPackId);
    renderPackCards(filteredPacks, activePacks, selectedPackId, suggestions);
    renderModuleCards(packModules, pinned, suggestions, uiState, selectedPackId, defaultOpenId);
    wireBody();
  }

  function wireBody() {
    if (!S.body) return;
    const searchEl = q('[data-shlfb="search"]', S.body);
    if (searchEl && !searchEl.__h2oShelfBound) {
      searchEl.__h2oShelfBound = 1;
      const onInput = debounce((e) => { saveShelfUiPatch({ q: String(e?.target?.value || '') }); rerender(); });
      searchEl.addEventListener('input', onInput);
    }
    if (!S.body.__h2oShelfClickBound) {
      S.body.__h2oShelfClickBound = 1;
      S.body.addEventListener('click', (e) => {
        const sugRun = e.target.closest('[data-suggest-run]');
        if (sugRun) {
          e.preventDefault();
          e.stopPropagation();
          const id = String(sugRun.getAttribute('data-suggest-run') || '');
          if (!id) return;

          safe(async () => {
            const out = await S.api?.runModule?.(id, { mode: 'manual', source: 'suggestion' });
            if (out?.ok) {
              S.api?.openDrawer?.();
              S.api?.setRightMode?.('drawer');
            }
          });

          return;
        }
        const moduleToggle = e.target.closest('[data-module-toggle]');
        const runBtn = e.target.closest('[data-module-run]');
        const pinBtn = e.target.closest('[data-module-pin]');

        if (moduleToggle && !runBtn && !pinBtn) {
          e.preventDefault();
          e.stopPropagation();
          const id = String(moduleToggle.getAttribute('data-module-toggle') || '');
          if (id) toggleModuleCollapsed(id, S.currentPackModules || [], S.currentSelectedPackId || '');
          return;
        }
        const chip = e.target.closest('[data-pack-chip]');
        if (chip) { const id = String(chip.getAttribute('data-pack-chip') || ''); if (id) { saveShelfUiPatch({ selectedPackId: id }); rerender(); } return; }
        const card = e.target.closest('[data-pack-card]');
        if (card && !e.target.closest('[data-pack-toggle]')) { const id = String(card.getAttribute('data-pack-card') || ''); if (id) { saveShelfUiPatch({ selectedPackId: id }); rerender(); } return; }
        const toggle = e.target.closest('[data-pack-toggle]');
        if (toggle) {
          e.preventDefault(); e.stopPropagation();
          const id = String(toggle.getAttribute('data-pack-toggle') || ''); if (!id) return;
          const profile = safe(() => S.api?.getChatProfile?.(), {}) || {};
          const active = new Set(Array.isArray(profile.activePackIds) ? profile.activePackIds : []);
          if (active.has(id)) safe(() => S.api?.deactivatePack?.(id)); else safe(() => S.api?.activatePack?.(id));
          saveShelfUiPatch({ selectedPackId: id }); rerender(); return;
        }
        const pin = e.target.closest('[data-module-pin]');
        if (pin) {
          e.preventDefault(); e.stopPropagation();
          const id = String(pin.getAttribute('data-module-pin') || ''); if (!id) return;
          const pinned = new Set(safe(() => S.api?.listPinnedModules?.(), []) || []);
          if (pinned.has(id)) safe(() => S.api?.unpinModule?.(id)); else safe(() => S.api?.pinModule?.(id));
          rerender(); return;
        }
        const run = e.target.closest('[data-module-run]');
        if (run) {
          e.preventDefault(); e.stopPropagation();
          const id = String(run.getAttribute('data-module-run') || ''); if (!id) return;
          safe(async () => {
            const out = await S.api?.runModule?.(id, { mode: 'manual' });
            if (out?.ok) { S.api?.openDrawer?.(); S.api?.setRightMode?.('drawer'); }
          });
        }
      }, true);
    }
  }

  function rerender() {
    clearTimeout(S.rerenderT);
    S.rerenderT = setTimeout(() => {
      attachDockRefs();
      if (!S.api) return renderEmpty(STR.emptyNoCore);
      if (!S.root || !S.body) return renderEmpty(STR.emptyNoShell);
      if (!isShelfPane()) return;
      renderShelf();
    }, 0);
  }

  function bindWorkspaceEventsOnce() {
    ['h2o:wrkspc:ready','h2o:wrkspc:packs:changed','h2o:wrkspc:modules:changed','h2o:wrkspc:chat_profile:changed','h2o:wrkspc:right_shell:changed'].forEach((ev) => {
      const fn = () => rerender();
      W.addEventListener(ev, fn);
      S.handlers.workspace.push({ ev, fn });
    });
  }

  H2O.ShelfPanel = H2O.ShelfPanel || {};
  H2O.ShelfPanel.ready = () => !!S.booted;
  H2O.ShelfPanel.rerender = () => rerender();
  H2O.ShelfPanel.getSharedDock = () => ({ root: S.root, body: S.body });

  async function boot() {
    if (S.booted) return;
    S.booted = true;
    S.api = await waitForWorkspaceApi();
    ensureStylesOnce();
    const dock = await waitForDock();
    if (dock) { S.root = dock.root; S.body = dock.body; S.titleEl = dock.titleEl; }
    bindWorkspaceEventsOnce();
    observeDock();
    rerender();
  }

  boot();
})();
