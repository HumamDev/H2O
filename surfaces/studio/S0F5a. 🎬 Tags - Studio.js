// ==UserScript==
// @h2o-id             s0f5a.tags.studio
// @name               S0F5a. 🎬 Tags - Studio
// @namespace          H2O.Premium.CGX.tags.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000011
// @description        Studio Tags facade. Derives tag pools from Library Index (which is fed by the chat-list service). Exposes counts, listing, and chat lookup by tag. Persists user tag prefs to Library Store under a Studio-isolated key.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F5a Tags (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const PREFS_KEY = 'h2o:prm:cgx:library:tags:studio:prefs:v1';
  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 40, errMax: 15 };
  const step = (s, o = '') => { try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {} };
  const err = (s, e) => { try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {} };

  function getCore() { return H2O.LibraryCore || null; }
  function getIndex() { return H2O.LibraryIndex || null; }
  function getStore() { return H2O.Library?.Store || null; }

  function loadPrefs() {
    try { return JSON.parse(W.localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { return {}; }
  }
  function savePrefs(p) {
    try { W.localStorage.setItem(PREFS_KEY, JSON.stringify(p || {})); } catch (e) { err('savePrefs', e); }
  }

  const prefs = loadPrefs();

  function listTags() {
    const idx = getIndex();
    if (!idx) return [];
    const f = idx.facets();
    return Object.entries(f.byTag || {})
      .map(([id, chatIds]) => ({ id, chatIds: chatIds.slice(), count: chatIds.length }))
      .sort((a, b) => b.count - a.count);
  }

  function getChatsByTag(tagId) {
    const idx = getIndex();
    if (!idx) return [];
    return idx.query({ tag: String(tagId || '') });
  }

  const Tags = {
    surface: 'studio',
    listTags,
    getChatsByTag,
    prefs: () => ({ ...prefs }),
    setPrefs(patch) { Object.assign(prefs, patch || {}); savePrefs(prefs); },
    diagnose() {
      return {
        surface: 'studio',
        hasIndex: !!getIndex(),
        storeBackend: getStore()?.backend?.() || null,
        prefsKey: PREFS_KEY,
        prefs: { ...prefs },
        topTags: listTags().slice(0, 12),
        steps: diag.steps.slice(-10),
        errors: diag.errors.slice(-5),
      };
    },
  };

  H2O.Tags = H2O.Tags || Tags;
  H2O.Library.Tags = Tags;

  function registerOnCore() {
    const core = getCore();
    if (!core) return false;
    try {
      core.registerOwner('tags', Tags, { replace: true });
      core.registerService('tags', Tags, { replace: true });
      core.registerRoute('tag',  async (route) => { step('route:tag', route?.id || ''); return true; }, { replace: true });
      core.registerRoute('tags', async () => { step('route:tags'); return true; }, { replace: true });
      step('register-on-core', 'tags');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }
  if (!registerOnCore()) W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });

  step('boot', 'studio-tags-ready');
})();
