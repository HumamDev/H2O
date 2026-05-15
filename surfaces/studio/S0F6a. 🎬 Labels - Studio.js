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
  function labelCore() {
    try {
      const api = H2O.Library?.LabelProviderCore || null;
      return api && api.__phase === '5C' ? api : null;
    } catch {
      return null;
    }
  }

  let cachedCatalog = null;
  let cachedAt = 0;
  const TTL_MS = 30_000;
  const state = { normalizationDiagnostics: [] };

  function rememberNormalization(diag) {
    try {
      if (!diag) return;
      state.normalizationDiagnostics.push({ ...diag, t: Date.now() });
      if (state.normalizationDiagnostics.length > 20) state.normalizationDiagnostics.splice(0, state.normalizationDiagnostics.length - 20);
    } catch {}
  }

  function adaptLabelEntry(raw, normalized = null) {
    const src = raw && typeof raw === 'object' ? raw : { id: String(raw || ''), label: String(raw || '') };
    const label = normalized || {};
    const id = String(src.id || src.labelId || label.id || '').trim();
    const name = String(src.name || src.label || src.labelName || label.name || label.label || id).trim();
    const out = { ...src };
    if (id && !out.id) out.id = id;
    if (name && !out.name) out.name = name;
    if (name && !out.label) out.label = name;
    if (!out.type && !out.labelType && label.type) out.type = label.type;
    if (!out.color && label.color) out.color = label.color;
    return out;
  }

  function normalizeLabelEntry(raw) {
    const fallback = adaptLabelEntry(raw);
    const api = labelCore();
    if (!api?.normalizeLabel) return fallback;
    try {
      const normalized = api.normalizeLabel({
        ...fallback,
        id: fallback.id || fallback.labelId || fallback.name || fallback.label || '',
        label: fallback.label || fallback.name || fallback.labelName || fallback.id || fallback.labelId || '',
        type: fallback.type || fallback.labelType || 'custom',
      });
      if (!normalized?.id) {
        rememberNormalization({ code: 'invalid-label-entry', labelId: fallback.id || fallback.labelId || '' });
        return fallback;
      }
      return adaptLabelEntry(fallback, normalized);
    } catch (e) {
      err('normalizeLabelEntry', e);
      return fallback;
    }
  }

  function normalizeLabelList(list) {
    const rows = Array.isArray(list) ? list : [];
    const api = labelCore();
    if (!api?.normalizeLabelCatalog) return rows.slice();
    try {
      const catalog = api.normalizeLabelCatalog(rows);
      (catalog?.diagnostics || []).forEach((item) => rememberNormalization(item));
      if (Array.isArray(catalog?.labels) && catalog.labels.length === rows.length) {
        return rows.map((row, index) => adaptLabelEntry(row, catalog.labels[index]));
      }
    } catch (e) {
      err('normalizeLabelCatalog', e);
    }
    return rows.map((row) => normalizeLabelEntry(row));
  }

  function normalizeLabelQueryId(id) {
    const raw = String(id || '').trim();
    if (!raw) return '';
    const api = labelCore();
    if (!api?.validateLabelId) return raw;
    try {
      const valid = api.validateLabelId(raw);
      if (valid?.ok) return valid.labelId;
      rememberNormalization({ code: 'invalid-label-query', labelId: raw, reason: valid?.reason || 'invalid-label-id' });
      return raw;
    } catch (e) {
      err('normalizeLabelQueryId', e);
      return raw;
    }
  }

  async function listLabels({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cachedCatalog && (now - cachedAt) < TTL_MS) return cachedCatalog;
    const ws = getWorkspace();
    const list = ws ? await ws.getLabels({ fresh }) : [];
    cachedCatalog = normalizeLabelList(list);
    cachedAt = now;
    return cachedCatalog;
  }

  async function getLabelById(id) {
    const lid = normalizeLabelQueryId(id);
    if (!lid) return null;
    const list = await listLabels();
    const found = list.find((l) => String(l.id || l.labelId || '') === lid) || null;
    if (found) return found;
    const api = labelCore();
    if (api?.resolveLabelId) {
      try {
        const resolved = api.resolveLabelId(lid, list);
        if (resolved?.ok && resolved.labelId && resolved.labelId !== lid) {
          return list.find((l) => String(l.id || l.labelId || '') === resolved.labelId) || resolved.label || null;
        }
      } catch (e) {
        err('resolveLabelId', e);
      }
    }
    return null;
  }

  async function getChatsForLabel(labelId) {
    const idx = getIndex();
    if (!idx) return [];
    return idx.query({ label: normalizeLabelQueryId(labelId) });
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
        hasLabelCore: !!labelCore(),
        labelCorePhase: labelCore()?.__phase || '',
        normalizationDiagnostics: state.normalizationDiagnostics.slice(-8),
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
