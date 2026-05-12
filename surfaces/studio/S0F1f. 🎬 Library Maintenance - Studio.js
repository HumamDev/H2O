// ==UserScript==
// @h2o-id             s0f1f.library_maintenance.studio
// @name               S0F1f. 🎬 Library Maintenance - Studio
// @namespace          H2O.Premium.CGX.library_maintenance.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000008
// @description        Studio Library Maintenance: diagnostics, store inspection, registry inspection, snapshot import/export, and repair routines. Exposes H2O.Library.Maintenance. In native this also wires the Command Bar Library group; in Studio (no Command Bar yet) it registers entries via the surface command-bar service so a future Studio Command Bar can read them.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1f Library Maintenance (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 60, errMax: 20 };
  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), e: String(e?.stack || e || '') });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  function getCore() { return H2O.LibraryCore || null; }
  function getStore() { return H2O.Library?.Store || null; }
  function getRegistry() { return H2O.ChatRegistry || null; }
  function getIndex() { return H2O.LibraryIndex || null; }
  function getWorkspace() { return H2O.LibraryWorkspace || null; }
  function getCmdBar() { return getCore()?.getService?.('command-bar') || null; }

  // ── Inspections (read-only) ────────────────────────────────────────────────
  async function inspectStore() {
    const store = getStore();
    if (!store) return { ok: false, reason: 'no-store' };
    try {
      const keys = await store.listKeys('h2o:');
      const estimate = await store.estimate();
      return {
        ok: true,
        backend: store.backend(),
        caps: store.caps(),
        keysCount: keys.length,
        keysSample: keys.slice(0, 30),
        estimate,
      };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }

  async function inspectRegistry() {
    const reg = getRegistry();
    if (!reg) return { ok: false, reason: 'no-registry' };
    try {
      const all = await reg.listAll();
      return {
        ok: true,
        diagnose: reg.diagnose(),
        size: all.length,
        sample: all.slice(0, 12),
      };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }

  function inspectIndex() {
    const idx = getIndex();
    if (!idx) return { ok: false, reason: 'no-index' };
    return { ok: true, diagnose: idx.diagnose(), counts: idx.counts() };
  }

  function inspectWorkspace() {
    const ws = getWorkspace();
    if (!ws) return { ok: false, reason: 'no-workspace' };
    return { ok: true, diagnose: ws.diagnose() };
  }

  function inspectCore() {
    const core = getCore();
    if (!core) return { ok: false, reason: 'no-core' };
    return {
      ok: true,
      diagnose: core.diagnose(),
      selfCheck: core.selfCheck(),
    };
  }

  // ── Snapshot import/export ─────────────────────────────────────────────────
  async function exportSnapshot() {
    const reg = getRegistry();
    const idx = getIndex();
    const store = getStore();
    return {
      version: 1,
      surface: 'studio',
      capturedAt: Date.now(),
      core: getCore()?.diagnose?.() || null,
      registry: reg ? { diag: reg.diagnose(), records: await reg.listAll() } : null,
      indexCounts: idx?.counts?.() || null,
      store: store ? {
        backend: store.backend(),
        caps: store.caps(),
        keys: await store.listKeys('h2o:prm:cgx:library:'),
      } : null,
    };
  }

  async function importSnapshot(snap) {
    if (!snap || typeof snap !== 'object') throw new Error('invalid snapshot');
    const reg = getRegistry();
    if (reg && Array.isArray(snap.registry?.records)) {
      await reg.upsertMany(snap.registry.records);
    }
    step('import.ok', `${snap.registry?.records?.length || 0} chats`);
    return { ok: true };
  }

  // ── Repair routines ────────────────────────────────────────────────────────
  async function rebuildIndex() {
    const idx = getIndex();
    if (!idx) return { ok: false, reason: 'no-index' };
    await idx.refresh('maintenance.rebuild');
    return { ok: true, counts: idx.counts() };
  }

  async function cleanupStaleRegistryEntries({ olderThanDays = 365 } = {}) {
    const reg = getRegistry();
    if (!reg) return { ok: false, reason: 'no-registry' };
    const all = await reg.listAll();
    const cutoff = Date.now() - olderThanDays * 86400_000;
    const stale = all.filter((c) => c.deleted && Number(c.deletedAt || 0) < cutoff);
    for (const c of stale) await reg.markDeleted(c.chatId).catch(() => {});
    return { ok: true, removed: stale.length };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  const Maintenance = {
    surface: 'studio',
    inspectStore, inspectRegistry, inspectIndex, inspectWorkspace, inspectCore,
    exportSnapshot, importSnapshot,
    rebuildIndex, cleanupStaleRegistryEntries,

    async diagnose() {
      return {
        surface: 'studio',
        store:     await inspectStore(),
        registry:  await inspectRegistry(),
        index:     inspectIndex(),
        workspace: inspectWorkspace(),
        core:      inspectCore(),
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  };

  H2O.Library.Maintenance = Maintenance;

  // Register a Command Bar group via the surface command-bar service so a future
  // Studio Command Bar can pick this up without code changes here.
  function registerCommandGroup() {
    const cb = getCmdBar();
    if (!cb || typeof cb.registerGroup !== 'function') return false;
    cb.registerGroup('library-maintenance', { label: 'Library Maintenance', icon: '🛠️' });
    cb.registerCommand('library-maintenance', { id: 'inspect-store',    label: 'Inspect Library Store',    fn: inspectStore });
    cb.registerCommand('library-maintenance', { id: 'inspect-registry', label: 'Inspect Chat Registry',    fn: inspectRegistry });
    cb.registerCommand('library-maintenance', { id: 'rebuild-index',    label: 'Rebuild Library Index',    fn: rebuildIndex });
    cb.registerCommand('library-maintenance', { id: 'export-snapshot',  label: 'Export Library Snapshot',  fn: exportSnapshot });
    cb.registerCommand('library-maintenance', { id: 'diagnose-all',     label: 'Diagnose Library',         fn: Maintenance.diagnose });
    step('cmd-bar-registered', 'library-maintenance');
    return true;
  }

  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-maintenance', Maintenance, { replace: true });
      core.registerService('library-maintenance', Maintenance, { replace: true });
      registerCommandGroup();
      step('register-on-core', 'library-maintenance');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }

  step('boot', 'studio-library-maintenance-ready');
})();
