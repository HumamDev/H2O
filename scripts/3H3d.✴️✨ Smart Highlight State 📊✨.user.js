// ==UserScript==
// @name         3H3d.✴️✨ Smart Highlight State 📊✨
// @namespace    H2O.Premium.CGX.smart-highlight.state
// @author       HumamDev
// @version      0.2.0
// @description  Smart Highlight state, persistence, freshness, overrides.
// @match        https://chatgpt.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const ROOT = window;
  const DOC = document;

  const H2O = ROOT.H2O = ROOT.H2O || {};
  H2O.mods = H2O.mods || {};

  const MOD_ID = 'smartHighlight';
  const SH = H2O.mods[MOD_ID] = H2O.mods[MOD_ID] || {};

  SH.meta = SH.meta || {
    id: MOD_ID,
    version: '0.2.0',
    build: '260314-state'
  };

  SH.ready = SH.ready || {
    state: false,
    parser: false,
    engine: false,
    ui: false
  };

  SH.const = SH.const || {};
  SH.util = SH.util || {};
  SH.debug = SH.debug || {};

  const C = SH.const;

  C.KEY = C.KEY || {
    RUNS: 'h2o.sh.runs',
    OVERRIDES: 'h2o.sh.overrides',
    SETTINGS: 'h2o.sh.settings'
  };

  C.EV = C.EV || {
    READY: 'h2o:sh:ready',
    STATE_SAVE: 'h2o:sh:state-save',
    STATE_CLEAR: 'h2o:sh:state-clear',
    INVALIDATE: 'h2o:sh:invalidate',
    OVERRIDE: 'h2o:sh:override'
  };

  SH.debug.enabled = SH.debug.enabled ?? false;

  SH.util.emit = SH.util.emit || function emit(name, detail = {}) {
    DOC.dispatchEvent(new CustomEvent(name, { detail }));
  };

  SH.util.log = SH.util.log || function log(...args) {
    if (!SH.debug.enabled) return;
    console.log('[H2O][SH]', ...args);
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      SH.util.log('readJSON failed', key, err);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      SH.util.log('writeJSON failed', key, err);
      return false;
    }
  }

  function getRuns() {
    return readJSON(C.KEY.RUNS, {});
  }

  function setRuns(allRuns) {
    return writeJSON(C.KEY.RUNS, allRuns);
  }

  function getOverridesAll() {
    return readJSON(C.KEY.OVERRIDES, {});
  }

  function setOverridesAll(allOverrides) {
    return writeJSON(C.KEY.OVERRIDES, allOverrides);
  }

  function getSettings() {
    return readJSON(C.KEY.SETTINGS, {
      mode: 'direct',
      strictness: 'balanced',
      palette: 'yellow',
      autoRestore: true
    });
  }

  function setSettings(next) {
    const merged = { ...getSettings(), ...(next || {}) };
    writeJSON(C.KEY.SETTINGS, merged);
    return merged;
  }

  function getRun(answerId) {
    if (!answerId) return null;
    const runs = getRuns();
    return runs[answerId] || null;
  }

  function setRun(answerId, runData) {
    if (!answerId || !runData) return null;
    const runs = getRuns();
    runs[answerId] = runData;
    setRuns(runs);
    SH.util.emit(C.EV.STATE_SAVE, { answerId, runData });
    return runData;
  }

  function clearRun(answerId) {
    if (!answerId) return false;
    const runs = getRuns();
    if (!(answerId in runs)) return false;
    delete runs[answerId];
    setRuns(runs);
    SH.util.emit(C.EV.STATE_CLEAR, { answerId });
    return true;
  }

  function clearAllRuns() {
    return setRuns({});
  }

  function baseOverrides() {
    return {
      promoted: [],
      demoted: [],
      cleared: [],
      locked: []
    };
  }

  function getOverrides(answerId) {
    if (!answerId) return baseOverrides();
    const all = getOverridesAll();
    return { ...baseOverrides(), ...(all[answerId] || {}) };
  }

  function setOverrides(answerId, overrides) {
    if (!answerId) return null;
    const all = getOverridesAll();
    all[answerId] = { ...baseOverrides(), ...(overrides || {}) };
    setOverridesAll(all);
    return all[answerId];
  }

  function clearOverrides(answerId) {
    if (!answerId) return false;
    const all = getOverridesAll();
    if (!(answerId in all)) return false;
    delete all[answerId];
    setOverridesAll(all);
    return true;
  }

  function listAddUnique(list, value) {
    return Array.from(new Set([...(list || []), value]));
  }

  function listRemove(list, value) {
    return (list || []).filter(item => item !== value);
  }

  function patchOverride(answerId, patch) {
    if (!answerId || !patch?.chunkId || !patch?.action) return null;

    const next = getOverrides(answerId);
    const { action, chunkId } = patch;

    if (action === 'promote') next.promoted = listAddUnique(next.promoted, chunkId);
    if (action === 'demote') next.demoted = listAddUnique(next.demoted, chunkId);
    if (action === 'clear') next.cleared = listAddUnique(next.cleared, chunkId);
    if (action === 'lock') next.locked = listAddUnique(next.locked, chunkId);

    if (action === 'unlock') next.locked = listRemove(next.locked, chunkId);

    if (action === 'reset') {
      next.promoted = listRemove(next.promoted, chunkId);
      next.demoted = listRemove(next.demoted, chunkId);
      next.cleared = listRemove(next.cleared, chunkId);
      next.locked = listRemove(next.locked, chunkId);
    }

    setOverrides(answerId, next);
    SH.util.emit(C.EV.OVERRIDE, { answerId, patch, overrides: next });
    return next;
  }

  function isFresh(answerId, answerHash, promptHash) {
    const run = getRun(answerId);
    if (!run) return false;
    return run.answerHash === answerHash && run.promptHash === promptHash;
  }

  function invalidate(answerId) {
    const okRun = clearRun(answerId);
    SH.util.emit(C.EV.INVALIDATE, { answerId });
    return okRun;
  }

  function invalidateIfStale(answerId, answerHash, promptHash) {
    const run = getRun(answerId);
    if (!run) return false;

    const stale = run.answerHash !== answerHash || run.promptHash !== promptHash;
    if (!stale) return false;

    invalidate(answerId);
    return true;
  }

  function exportAll() {
    return {
      runs: getRuns(),
      overrides: getOverridesAll(),
      settings: getSettings()
    };
  }

  function importAll(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.runs) setRuns(payload.runs);
    if (payload.overrides) setOverridesAll(payload.overrides);
    if (payload.settings) setSettings(payload.settings);
    return true;
  }

  SH.state = {
    version: '0.2.0',
    getRun,
    setRun,
    clearRun,
    clearAllRuns,
    getOverrides,
    setOverrides,
    clearOverrides,
    patchOverride,
    getSettings,
    setSettings,
    isFresh,
    invalidate,
    invalidateIfStale,
    exportAll,
    importAll
  };

  SH.debug.snapshot = SH.debug.snapshot || function snapshot() {
    return {
      meta: SH.meta,
      ready: SH.ready,
      storage: {
        runsCount: Object.keys(getRuns()).length,
        overrideCount: Object.keys(getOverridesAll()).length
      }
    };
  };

  SH.ready.state = true;
  SH.util.emit(C.EV.READY, { module: 'state' });
})();