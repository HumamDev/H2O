// ==H2O Module==
// @h2o-id             0f1b.library_workspace
// @name               0F1b.⬛️🗂️ Library Workspace 🗂️
// @namespace          H2O.Premium.CGX.library_workspace
// @author             HumamDev
// @version            1.4.0
// @revision           013
// @build              260601-000001
// @description        Library Workspace retired Native UI compatibility stub. Keeps diagnostics and no-op public APIs; Native Library button/page/renderers moved to retired-features/native-library-ui/0F1b-library-workspace/.
// @match       https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /*
   * R4.7.5 — Native Library Workspace UI retired.
   *
   * The original Library sidebar button, /library page, deprecation
   * banner, body/CSS gates, route/page renderer, sidebar layout, and
   * Insights delegation were moved to:
   *   retired-features/native-library-ui/0F1b-library-workspace/library-workspace-ui.js
   *
   * This live module intentionally keeps only diagnostics and no-op
   * compatibility methods for callers that probe H2O.LibraryWorkspace.
   * Capture/save/link modules, 0F1k flags, 0F5a extraction, 0D3 and 3X
   * capture files, 0F3a folders, and Studio surfaces are not touched.
   */

  const W = window;
  const H2O = (W.H2O = W.H2O || {});

  const H2O_R46_FLAG_WORKSPACE_UI    = 'library.nativeWorkspaceUi';
  const H2O_R46_FLAG_ORGANIZATION_UI = 'library.nativeOrganizationUi';
  const H2O_R46_FLAG_CAPTURE_ONLY    = 'library.nativeCaptureOnlyMode';

  function isNativeWorkspaceUiEnabled() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(H2O_R46_FLAG_WORKSPACE_UI, true) !== false;
      }
    } catch (_) { /* swallow */ }
    return true;
  }

  function isNativeOrganizationUiEnabled() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(H2O_R46_FLAG_ORGANIZATION_UI, true) !== false;
      }
    } catch (_) { /* swallow */ }
    return true;
  }

  function isNativeCaptureOnlyMode() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return !!flags.get(H2O_R46_FLAG_CAPTURE_ONLY, false);
      }
    } catch (_) { /* swallow */ }
    return false;
  }

  function retiredResult(method, reason = 'api') {
    return {
      ok: false,
      retired: true,
      moduleId: '0F1b',
      phase: 'R4.7.5-native-workspace-ui-retired',
      method: String(method || ''),
      reason: String(reason || ''),
      archive: 'retired-features/native-library-ui/0F1b-library-workspace/library-workspace-ui.js',
      replacement: 'Desktop Studio Library',
    };
  }

  function registerR46Diagnose() {
    try {
      W.H2O = W.H2O || {};
      W.H2O.deprecation = W.H2O.deprecation || {};
      W.H2O.deprecation.native = W.H2O.deprecation.native || {};
      W.H2O.deprecation.native['0F1b'] = function () {
        return {
          moduleId: '0F1b',
          phase: 'R4.7.5-retired',
          flags: {
            'library.nativeWorkspaceUi':     isNativeWorkspaceUiEnabled(),
            'library.nativeOrganizationUi':  isNativeOrganizationUiEnabled(),
            'library.nativeCaptureOnlyMode': isNativeCaptureOnlyMode(),
          },
          gatedSurfaces: [],
          retiredSurfaces: [
            'LibraryButton',
            'WorkspacePage',
            'WorkspaceRoute',
            'WorkspaceCssGate',
            'DeprecationBanner',
            'InsightsDelegation',
          ],
          unconditionalSurfaces: ['diagnostics', 'compatibilityApi'],
          archive: 'retired-features/native-library-ui/0F1b-library-workspace/library-workspace-ui.js',
        };
      };
    } catch (_) { /* swallow */ }
  }

  registerR46Diagnose();

  const MOD = (H2O.LibraryWorkspace = H2O.LibraryWorkspace || {});
  MOD.meta = {
    owner: '0F1b.library_workspace',
    label: 'Library Workspace',
    phase: 'R4.7.5-native-workspace-ui-retired',
    retired: true,
    archive: 'retired-features/native-library-ui/0F1b-library-workspace/library-workspace-ui.js',
    replacement: 'Desktop Studio Library',
  };

  const state = (MOD.state = MOD.state || {
    booted: false,
    retired: true,
    lastRefreshReason: '',
    lastRefreshAt: 0,
  });

  function refresh(reason = 'api') {
    state.lastRefreshReason = String(reason || '');
    state.lastRefreshAt = Date.now();
    return retiredResult('refresh', reason);
  }

  function selfCheck() {
    return {
      ok: true,
      retired: true,
      moduleId: '0F1b',
      phase: 'R4.7.5-native-workspace-ui-retired',
      hasNativeWorkspaceUi: false,
      hasLibraryButtonUi: false,
      hasWorkspacePageUi: false,
      hasDeprecationBannerUi: false,
      registeredOwner: !!H2O.LibraryCore?.getOwner?.('library-workspace'),
      registeredService: !!H2O.LibraryCore?.getService?.('library-workspace'),
      flags: {
        'library.nativeWorkspaceUi': isNativeWorkspaceUiEnabled(),
        'library.nativeOrganizationUi': isNativeOrganizationUiEnabled(),
        'library.nativeCaptureOnlyMode': isNativeCaptureOnlyMode(),
      },
      state: { ...state },
      archive: MOD.meta.archive,
      replacement: MOD.meta.replacement,
    };
  }

  const owner = {
    phase: MOD.meta.phase,
    retired: true,
    openWorkspace(opts = {}) { return Promise.resolve(retiredResult('openWorkspace', opts.reason || opts.source || 'api')); },
    closeWorkspace(opts = {}) { return retiredResult('closeWorkspace', opts.reason || 'api'); },
    prepareNativeChatNavigation(_href = '', reason = 'api') { return retiredResult('prepareNativeChatNavigation', reason); },
    openNativeChat(_href = '', opts = {}) { return Promise.resolve(retiredResult('openNativeChat', opts.reason || 'api')); },
    refresh,
    buildModel(reason = 'api') { return Promise.resolve(retiredResult('buildModel', reason)); },
    getModel() { return null; },
    ensureInjected(reason = 'api') { return retiredResult('ensureInjected', reason); },
    ensureSidebarPrepaint(reason = 'api') { return retiredResult('ensureSidebarPrepaint', reason); },
    ensureTopLibraryButton(reason = 'api') { return retiredResult('ensureTopLibraryButton', reason); },
    ensureRailLibraryButton(reason = 'api') { return retiredResult('ensureRailLibraryButton', reason); },
    syncLibrarySidebarActiveState(reason = 'api') { return retiredResult('syncLibrarySidebarActiveState', reason); },
    syncTopLibraryButtonActiveState(reason = 'api') { return retiredResult('syncTopLibraryButtonActiveState', reason); },
    syncRailLibraryButtonActiveState(reason = 'api') { return retiredResult('syncRailLibraryButtonActiveState', reason); },
    getSidebarLayout() { return { retired: true, sections: {} }; },
    setSidebarSectionVisible(_sectionId, _visible) { return retiredResult('setSidebarSectionVisible', 'api'); },
    moveSidebarSection(_sectionId, _direction) { return retiredResult('moveSidebarSection', 'api'); },
    setSidebarOrder(_sectionIds) { return retiredResult('setSidebarOrder', 'api'); },
    resetSidebarLayout() { return retiredResult('resetSidebarLayout', 'api'); },
    applySidebarLayout(reason = 'api') { return retiredResult('applySidebarLayout', reason); },
    getSidebarLayoutDiagnostics() { return { retired: true, sections: [] }; },
    resetWorkspaceUiPrefs() { return retiredResult('resetWorkspaceUiPrefs', 'api'); },
    selfCheck,
  };

  Object.keys(owner).forEach((key) => {
    if (typeof owner[key] === 'function') MOD[key] = (...args) => owner[key](...args);
  });
  MOD.owner = owner;
  MOD.selfCheck = selfCheck;
  MOD.ui = MOD.ui || {};
  ['ensureInjected', 'ensureSidebarPrepaint', 'ensureTopLibraryButton', 'ensureRailLibraryButton', 'syncTopLibraryButtonActiveState', 'syncRailLibraryButtonActiveState', 'applySidebarLayout'].forEach((key) => {
    MOD.ui[key] = (...args) => owner[key](...args);
  });

  function registerWithCore(reason = 'boot') {
    try {
      const core = H2O.LibraryCore;
      if (!core) return false;
      core.registerOwner?.('library-workspace', owner, { replace: true });
      core.registerService?.('library-workspace', owner, { replace: true });
      state.booted = true;
      state.registeredAt = Date.now();
      state.registerReason = String(reason || '');
      return true;
    } catch (error) {
      state.lastRegisterError = String(error && error.message ? error.message : error);
      return false;
    }
  }

  if (!registerWithCore('boot')) {
    try { W.setTimeout(() => registerWithCore('late'), 900); } catch (_) { /* swallow */ }
  }
})();
