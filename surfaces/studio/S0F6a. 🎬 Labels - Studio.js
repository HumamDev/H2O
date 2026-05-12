// ==UserScript==
// @h2o-id             s0f6a.labels.studio
// @name               S0F6a. 🎬 Labels - Studio
// @namespace          H2O.Premium.CGX.labels.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000012
// @description        Studio Labels facade. Exposes H2O.Labels.* / H2O.Library.Labels with the surface-agnostic subset used by Library Workspace, Insights, and studio.js. Reads the labels catalog via the chat-list service (archive bridge). No native sidebar inject.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F6a Labels (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 40, errMax: 15 };
  const step = (s, o = '') => { try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {} };
  const err = (s, e) => { try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {} };

  function getCore() { return H2O.LibraryCore || null; }
  function getWorkspace() { return H2O.LibraryWorkspace || null; }
  function getIndex() { return H2O.LibraryIndex || null; }

  let cachedCatalog = null;
  let cachedAt = 0;
  const TTL_MS = 30_000;

  async function listLabels({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cachedCatalog && (now - cachedAt) < TTL_MS) return cachedCatalog;
    const ws = getWorkspace();
    const list = ws ? await ws.getLabels({ fresh }) : [];
    cachedCatalog = Array.isArray(list) ? list.slice() : [];
    cachedAt = now;
    return cachedCatalog;
  }

  async function getLabelById(id) {
    const lid = String(id || '').trim();
    if (!lid) return null;
    const list = await listLabels();
    return list.find((l) => String(l.id || l.labelId || '') === lid) || null;
  }

  async function getChatsForLabel(labelId) {
    const idx = getIndex();
    if (!idx) return [];
    return idx.query({ label: String(labelId || '') });
  }

  const Labels = {
    surface: 'studio',
    listLabels,
    getLabelById,
    getChatsForLabel,
    async refresh() { return listLabels({ fresh: true }); },
    diagnose() {
      return {
        surface: 'studio',
        cachedCount: cachedCatalog ? cachedCatalog.length : 0,
        cachedAt,
        hasWorkspace: !!getWorkspace(),
        steps: diag.steps.slice(-10),
        errors: diag.errors.slice(-5),
      };
    },
  };

  H2O.Labels = H2O.Labels || Labels;
  H2O.Library.Labels = Labels;

  function registerOnCore() {
    const core = getCore();
    if (!core) return false;
    try {
      core.registerOwner('labels', Labels, { replace: true });
      core.registerService('labels', Labels, { replace: true });
      core.registerRoute('label',  async (route) => { step('route:label', route?.id || ''); return true; }, { replace: true });
      core.registerRoute('labels', async () => { step('route:labels'); return true; }, { replace: true });
      step('register-on-core', 'labels');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }
  if (!registerOnCore()) W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });

  step('boot', 'studio-labels-ready');
})();
