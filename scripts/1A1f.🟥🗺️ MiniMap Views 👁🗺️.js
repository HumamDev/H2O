// ==UserScript==
// @h2o-id             1a1f.minimap.views
// @name               1A1f.🟥🗺️ MiniMap Views 👁🗺️
// @namespace          H2O.Premium.CGX.minimap.views
// @author             HumamDev
// @version            12.7.0
// @revision           002
// @build              260320-000001
// @description        MiniMap Views: registry + mode persistence + view-changed event scaffold
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const TOPW = W.top || W;

  const VIEWS_VER = '12.7.0';
  const EVT_VIEW_CHANGED = 'evt:h2o:minimap:view-changed';
  const KEY_VIEW_MODE_SUFFIX = 'ui:view-mode:v1';

  const MODE_CLASSIC = 'classic';
  const MODE_QA = 'qa';
  const MODE_BRANCHES = 'branches';

  const VIEW_REGISTRY = Object.freeze([
    Object.freeze({ id: MODE_CLASSIC,  label: 'Classic',  enabled: true }),
    Object.freeze({ id: MODE_QA,       label: 'Q + A',    enabled: true }),
    Object.freeze({ id: MODE_BRANCHES, label: 'Branches', enabled: false }),
  ]);

  function getSharedRefs() {
    try { return TOPW.H2O_MM_SHARED?.get?.() || null; } catch { return null; }
  }

  function storageApi() {
    const sh = getSharedRefs();
    try { return sh?.util?.storage || null; } catch { return null; }
  }

  function nsDisk() {
    const sh = getSharedRefs();
    try {
      const ns = sh?.util?.ns;
      if (ns && typeof ns.disk === 'function') return String(ns.disk('prm', 'cgx', 'mnmp'));
    } catch {}
    return String(sh?.NS_DISK || 'h2o:prm:cgx:mnmp');
  }

  function keyViewMode() {
    return `${nsDisk()}:${KEY_VIEW_MODE_SUFFIX}`;
  }

  function readStoredRaw(key) {
    const k = String(key || '').trim();
    if (!k) return null;
    const storage = storageApi();
    if (storage && typeof storage.getStr === 'function') {
      return storage.getStr(k, null);
    }
    try { return localStorage.getItem(k); } catch { return null; }
  }

  function writeStoredRaw(key, val) {
    const k = String(key || '').trim();
    if (!k) return false;
    const out = String(val ?? '');
    const storage = storageApi();
    if (storage && typeof storage.setStr === 'function') {
      return !!storage.setStr(k, out);
    }
    try {
      localStorage.setItem(k, out);
      return true;
    } catch {
      return false;
    }
  }

  function registry() {
    return VIEW_REGISTRY.map((item) => ({
      id: String(item.id || ''),
      label: String(item.label || ''),
      enabled: item.enabled === true,
    }));
  }

  function normalizeMode(mode) {
    const value = String(mode || '').trim().toLowerCase();
    const list = VIEW_REGISTRY;
    const found = list.find((item) => String(item.id || '').toLowerCase() === value);
    if (found && found.enabled === true) return String(found.id || MODE_CLASSIC);
    const firstEnabled = list.find((item) => item.enabled === true && String(item.id || '').trim());
    if (firstEnabled) return String(firstEnabled.id || MODE_CLASSIC);
    return MODE_CLASSIC;
  }

  function isClassicMode(mode) {
    return normalizeMode(mode) === MODE_CLASSIC;
  }

  function isQaMode(mode) {
    return normalizeMode(mode) === MODE_QA;
  }

  function isBranchesMode(mode) {
    return normalizeMode(mode) === MODE_BRANCHES;
  }

  function getMode() {
    return normalizeMode(readStoredRaw(keyViewMode()));
  }

  function setMode(mode, opts = {}) {
    const prevMode = getMode();
    const nextMode = normalizeMode(mode);
    writeStoredRaw(keyViewMode(), nextMode);
    if (nextMode !== prevMode) {
      const detail = {
        mode: nextMode,
        prevMode,
        source: String(opts?.source || 'views'),
      };
      try { W.dispatchEvent(new CustomEvent(EVT_VIEW_CHANGED, { detail })); } catch {}
    }
    return nextMode;
  }

  function deriveTurns(mode, coreTurns) {
    void mode;
    return Array.isArray(coreTurns) ? coreTurns : [];
  }

  function decorateBtn(mode, btn, turn) {
    void mode;
    void turn;
    return btn || null;
  }

  function defaultBindings(mode) {
    void mode;
    return null;
  }

  const VIEWS_API = {
    ver: VIEWS_VER,
    owner: 'views',
    eventName: EVT_VIEW_CHANGED,
    keySuffix: KEY_VIEW_MODE_SUFFIX,
    modes: Object.freeze({
      CLASSIC: MODE_CLASSIC,
      QA: MODE_QA,
      BRANCHES: MODE_BRANCHES,
    }),
    nsDisk,
    keyViewMode,
    registry,
    normalizeMode,
    isClassicMode,
    isQaMode,
    isBranchesMode,
    getMode,
    setMode,
    deriveTurns,
    decorateBtn,
    defaultBindings,
  };

  function installApi() {
    try {
      const sh = TOPW.H2O_MM_SHARED?.get?.();
      if (sh) {
        sh.api = (sh.api && typeof sh.api === 'object') ? sh.api : {};
        sh.api.views = VIEWS_API;
      }
    } catch {}
  }

  installApi();
  try { TOPW.H2O_MM_VIEWS_PLUGIN = true; } catch {}
  try { TOPW.H2O_MM_VIEWS_VER = VIEWS_VER; } catch {}
  try { TOPW.H2O_MM_VIEWS_READY = true; } catch {}
})();