// ==UserScript==
// @h2o-id             s0x1b.library_commands.studio
// @name               S0X1b. 🎬 Library Commands (Command Bar 🔌 Plugin) - Studio
// @namespace          H2O.Premium.CGX.library_commands.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000050
// @description        Studio Command Bar plugin: registers Library-related command groups (Workspace, Index, Sync, Registry, Navigation, System) on the surface command-bar service so ⌘K exposes the full Library control palette. Strictly additive — does not change any module's behaviour; each command calls the public diagnose / refresh / mutate / navigate APIs that already exist.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0X1b Library Commands (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 15 };
  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  // ── Service accessors ──────────────────────────────────────────────────────
  function getCore()       { return H2O.LibraryCore || null; }
  function getCmdBar()     { return getCore()?.getService?.('command-bar') || null; }
  function getWorkspace()  { return H2O.LibraryWorkspace || null; }
  function getIndex()      { return H2O.LibraryIndex || null; }
  function getInsights()   { return H2O.LibraryInsights || null; }
  function getSync()       { return H2O.Library?.Sync || null; }
  function getRegistry()   { return H2O.ChatRegistry || null; }
  function getMaintenance(){ return H2O.Library?.Maintenance || null; }
  function getCommandBar() { return H2O.CommandBar || null; }

  // ── Helpers ────────────────────────────────────────────────────────────────
  // Nav commands close the palette after dispatch so the user actually sees the
  // destination. Diagnostic commands keep it open so the operator can chain.
  function closePalette() {
    try { getCommandBar()?.close?.(); } catch {}
  }
  function logResult(label, result) {
    try { console.log(`%c[H2O Library · ${label}]`, 'color:#7ab6ff;font-weight:600', result); } catch {}
    return result;
  }
  function nav(viewKey) {
    return () => {
      W.location.hash = `#/library/${viewKey}`;
      closePalette();
      return { hash: W.location.hash };
    };
  }

  // ── Command registration ───────────────────────────────────────────────────
  // Every registration is idempotent (Studio's command-bar service `registerGroup`
  // overwrites existing groups, and `registerCommand` appends — we guard with
  // an internal seen-flag to avoid double-appending across hot-reloads).
  const REGISTERED_FLAG = '__h2oLibraryCommandsRegistered';

  function registerAll() {
    const cb = getCmdBar();
    if (!cb || typeof cb.registerGroup !== 'function') return false;
    if (cb[REGISTERED_FLAG]) {
      step('register-all', 'already-registered');
      return true;
    }

    // ── Group: Library Workspace ─────────────────────────────────────────────
    cb.registerGroup('library-workspace', { label: 'Library Workspace', icon: '🧱' });
    cb.registerCommand('library-workspace', {
      id: 'refresh-all',
      label: 'Refresh all Library data',
      hint: 'Forces fresh fetch of folders, labels, categories from archive',
      fn: async () => {
        const ws = getWorkspace();
        if (!ws) throw new Error('Library Workspace not ready');
        const [folders, labels, categories] = await Promise.all([
          ws.getFolders({ fresh: true }).catch(() => []),
          ws.getLabels({ fresh: true }).catch(() => []),
          ws.getCategories({ fresh: true }).catch(() => []),
        ]);
        return logResult('Workspace · refresh-all', {
          folders: folders.length, labels: labels.length, categories: categories.length,
        });
      },
    });
    cb.registerCommand('library-workspace', {
      id: 'bust-caches',
      label: 'Bust Workspace caches',
      hint: 'Drops folder/label/category caches; next read refetches',
      fn: async () => {
        const ws = getWorkspace();
        if (!ws?._bustCaches) throw new Error('Workspace cache invalidation unavailable');
        ws._bustCaches('command-bar');
        return logResult('Workspace · bust-caches', { ok: true });
      },
    });
    cb.registerCommand('library-workspace', {
      id: 'diagnose',
      label: 'Diagnose Workspace',
      hint: 'Service health, cache state, subscriber count',
      fn: async () => {
        const ws = getWorkspace();
        if (!ws) throw new Error('Library Workspace not ready');
        return logResult('Workspace · diagnose', ws.diagnose());
      },
    });

    // ── Group: Library Index ─────────────────────────────────────────────────
    cb.registerGroup('library-index', { label: 'Library Index', icon: '🧮' });
    cb.registerCommand('library-index', {
      id: 'rebuild',
      label: 'Rebuild Library Index',
      hint: 'Re-scans the archive bridge and rebuilds facets',
      fn: async () => {
        const idx = getIndex();
        if (!idx) throw new Error('Library Index not ready');
        const before = idx.diagnose().rows;
        await idx.refresh('command-bar.rebuild');
        const after = idx.diagnose().rows;
        return logResult('Index · rebuild', { rowsBefore: before, rowsAfter: after });
      },
    });
    cb.registerCommand('library-index', {
      id: 'counts',
      label: 'Show Index counts',
      hint: 'Total, by view, by folder, by category, by label, by tag, by project',
      fn: async () => {
        const idx = getIndex();
        if (!idx) throw new Error('Library Index not ready');
        return logResult('Index · counts', idx.counts());
      },
    });
    cb.registerCommand('library-index', {
      id: 'diagnose',
      label: 'Diagnose Index',
      hint: 'Source, last scan reason, store backend, error log',
      fn: async () => {
        const idx = getIndex();
        if (!idx) throw new Error('Library Index not ready');
        return logResult('Index · diagnose', idx.diagnose());
      },
    });

    // ── Group: Library Sync (cross-surface bridge) ───────────────────────────
    cb.registerGroup('library-sync', { label: 'Library Sync', icon: '🛰' });
    cb.registerCommand('library-sync', {
      id: 'broadcast',
      label: 'Broadcast to native',
      hint: 'Forces a one-shot cross-surface ping (Studio → chatgpt.com tab)',
      fn: async () => {
        const sync = getSync();
        if (!sync) throw new Error('Library Sync not ready');
        if (sync.pingStudio) sync.pingStudio('command-bar.manual');
        else sync.broadcast?.('command-bar.manual');
        return logResult('Sync · broadcast', { sent: true, ts: Date.now() });
      },
    });
    cb.registerCommand('library-sync', {
      id: 'diagnose',
      label: 'Diagnose Sync',
      hint: 'Watch state, last inbound/outbound, broadcast keys',
      fn: async () => {
        const sync = getSync();
        if (!sync) throw new Error('Library Sync not ready');
        return logResult('Sync · diagnose', sync.diagnose());
      },
    });

    // ── Group: Chat Registry ─────────────────────────────────────────────────
    cb.registerGroup('library-registry', { label: 'Chat Registry', icon: '🧾' });
    cb.registerCommand('library-registry', {
      id: 'diagnose',
      label: 'Diagnose Chat Registry',
      hint: 'Loaded chats, active vs deleted, store backend',
      fn: async () => {
        const reg = getRegistry();
        if (!reg) throw new Error('Chat Registry not ready');
        return logResult('Registry · diagnose', reg.diagnose());
      },
    });
    cb.registerCommand('library-registry', {
      id: 'list-all',
      label: 'List all registered chats',
      hint: 'Returns the full registry array (logged to console)',
      fn: async () => {
        const reg = getRegistry();
        if (!reg) throw new Error('Chat Registry not ready');
        const all = await reg.listAll();
        return logResult('Registry · listAll', { count: all.length, sample: all.slice(0, 8) });
      },
    });

    // ── Group: Library Actions (Add to Library / Save to Folder / open) ──────
    // Thin wrappers over H2O.LibraryActions so the same business logic is
    // reachable from the Command Bar, the native menu (Phase 3), and any
    // future Studio row action. Each command degrades to a console warning
    // if H2O.LibraryActions is not yet registered (e.g. before 0F1j boots).
    cb.registerGroup('library-actions', { label: 'Library Actions', icon: '🎯' });
    const getActions = () => H2O.LibraryActions || null;
    cb.registerCommand('library-actions', {
      id: 'diagnose',
      label: 'Diagnose Library Actions',
      hint: 'Counts, last add/save/open, errors',
      fn: () => {
        const a = getActions();
        if (!a) { try { console.warn('[H2O.LibraryActions] not yet loaded'); } catch {} return null; }
        const out = a.diagnose?.();
        try { console.info('[H2O.LibraryActions] diagnose →', out); } catch {}
        return out;
      },
    });
    cb.registerCommand('library-actions', {
      id: 'open-linked-chat',
      label: 'Open original ChatGPT chat for current Library row',
      hint: 'Studio-side: requires a focused Library row',
      fn: () => {
        const a = getActions();
        if (!a) return null;
        // Best-effort: use the focused/active row in the Library page if any,
        // otherwise fall back to the route id (e.g. /library/folder/<id>
        // does not carry a chatId, so this is a no-op in that case).
        const active = document.querySelector('.wbChatRow[data-chat-id]:focus, .wbChatRow[data-chat-id]:hover')
                    || document.querySelector('.wbChatRow[data-chat-id]');
        const chatId = active?.dataset?.chatId || '';
        if (!chatId) {
          try { console.info('[H2O.LibraryActions] open-linked-chat: no chat row available'); } catch {}
          return false;
        }
        return a.openLinkedChat?.(chatId);
      },
    });
    // Note: addToLibrary / saveToFolder are inherently native-side actions
    // (they require the chatgpt.com archive bridge to capture transcripts).
    // We expose only diagnose + openLinkedChat here on the Studio Command
    // Bar; native-side users have the explicit menu items for the write
    // paths. A Studio→native RPC for the write paths is deliberately
    // deferred per the Phase 2 contract.

    // ── Group: Navigation (jump to a Library page tab) ───────────────────────
    cb.registerGroup('library-navigation', { label: 'Open Library Page', icon: '🧭' });
    cb.registerCommand('library-navigation', { id: 'dashboard', label: 'Open Dashboard',  hint: '#/library/dashboard',  fn: nav('dashboard') });
    cb.registerCommand('library-navigation', { id: 'analytics', label: 'Open Analytics',  hint: '#/library/analytics',  fn: nav('analytics') });
    cb.registerCommand('library-navigation', { id: 'explorer',  label: 'Open Explorer',   hint: '#/library/explorer',   fn: nav('explorer') });
    cb.registerCommand('library-navigation', { id: 'recents',   label: 'Open Recents',    hint: '#/library/recents',    fn: nav('recents') });
    cb.registerCommand('library-navigation', { id: 'saved',     label: 'Open Saved',      hint: '#/library/saved',      fn: nav('saved') });
    cb.registerCommand('library-navigation', { id: 'organize',  label: 'Open Organize',   hint: '#/library/organize',   fn: nav('organize') });
    cb.registerCommand('library-navigation', {
      id: 'back-to-list',
      label: 'Back to Saved list',
      hint: '#/saved (leaves the Library page)',
      fn: () => { W.location.hash = '#/saved'; closePalette(); return { hash: W.location.hash }; },
    });

    // ── Group: Library System (Core / surfaces / overall health) ─────────────
    cb.registerGroup('library-system', { label: 'Library System', icon: '🔬' });
    cb.registerCommand('library-system', {
      id: 'selfcheck',
      label: 'Run Library selfCheck',
      hint: 'Required-service health gate on Library Core',
      fn: async () => {
        const core = getCore();
        if (!core?.selfCheck) throw new Error('Library Core not ready');
        return logResult('System · selfCheck', core.selfCheck());
      },
    });
    cb.registerCommand('library-system', {
      id: 'list-owners',
      label: 'List Library owners',
      hint: 'Every module that registered on Library Core',
      fn: async () => {
        const core = getCore();
        if (!core?.listOwners) throw new Error('Library Core not ready');
        const owners = core.listOwners();
        return logResult('System · listOwners', { count: owners.length, owners });
      },
    });
    cb.registerCommand('library-system', {
      id: 'list-services',
      label: 'List Library services',
      hint: 'Surface services (ui-shell, page-host, route, chat-list, …) + module services',
      fn: async () => {
        const core = getCore();
        if (!core?.listServices) throw new Error('Library Core not ready');
        const services = core.listServices();
        return logResult('System · listServices', { count: services.length, services });
      },
    });
    cb.registerCommand('library-system', {
      id: 'list-surfaces',
      label: 'List registered surfaces',
      hint: 'Which surfaces (native / studio / …) Library Core knows about',
      fn: async () => {
        const core = getCore();
        if (!core?.listSurfaces) throw new Error('Library Core not ready');
        return logResult('System · listSurfaces', {
          current: core.getCurrentSurface?.(),
          surfaces: core.listSurfaces(),
        });
      },
    });
    cb.registerCommand('library-system', {
      id: 'diagnose-all',
      label: 'Diagnose everything (composite report)',
      hint: 'Runs Maintenance.diagnose() — all modules in one object',
      fn: async () => {
        const m = getMaintenance();
        if (!m?.diagnose) throw new Error('Library Maintenance not ready');
        return logResult('System · diagnose-all', await m.diagnose());
      },
    });

    cb[REGISTERED_FLAG] = true;
    step('register-all', 'ok');
    return true;
  }

  // ── Public API + diagnose ──────────────────────────────────────────────────
  const Plugin = {
    surface: 'studio',
    version: '1.0.0',
    refresh: registerAll,
    diagnose() {
      const cb = getCmdBar();
      return {
        surface: 'studio',
        version: '1.0.0',
        cmdBarPresent: !!cb,
        registered: !!(cb && cb[REGISTERED_FLAG]),
        groups: cb?.listGroups?.() || [],
        steps: diag.steps.slice(-10),
        errors: diag.errors.slice(-5),
      };
    },
  };
  H2O.Library.CommandsPlugin = Plugin;

  // ── Boot ──────────────────────────────────────────────────────────────────
  // Try immediately; if the command-bar service isn't ready yet (S0X1a hadn't
  // booted), wait for Library Ready and retry. Idempotent.
  if (!registerAll()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerAll(), { once: true });
    // Also retry after a short tick in case Library Ready already fired but
    // S0X1a registered the command-bar service slightly after.
    W.setTimeout(registerAll, 250);
  }

  step('boot', 'studio-library-commands-ready');
})();
