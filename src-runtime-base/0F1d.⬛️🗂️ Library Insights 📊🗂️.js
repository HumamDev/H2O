// ==H2O Module==
// @h2o-id             0f1d.library_insights
// @name               0F1d.⬛️🗂️ Library Insights 📊🗂️
// @namespace          H2O.Premium.CGX.library_insights
// @author             HumamDev
// @version            1.1.0
// @revision           002
// @build              260601-000001
// @description        Library Insights retired Native UI compatibility stub. Original Explorer + Analytics renderer moved to retired-features/native-library-ui/0F1d-library-insights/.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /*
   * R4.7.5 — 0F1d Library Insights retired in full.
   *
   * The original Explorer + Analytics rendering module was moved to:
   *   retired-features/native-library-ui/0F1d-library-insights/0F1d-original.js
   *
   * Live code intentionally exposes no renderExplorer/renderAnalytics
   * API and installs no styles. This stub only keeps a diagnostic
   * marker and no-op refresh for callers that probe H2O.LibraryInsights.
   */

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  const MOD = (H2O.LibraryInsights = H2O.LibraryInsights || {});

  H2O.LibraryInsightsBootDiag = {
    ok: true,
    retired: true,
    status: 'R4.7.5-native-library-insights-retired',
    ts: Date.now(),
    archive: 'retired-features/native-library-ui/0F1d-library-insights/0F1d-original.js',
  };

  MOD.meta = {
    owner: '0F1d.library_insights',
    label: 'Library Insights',
    phase: 'R4.7.5-native-library-insights-retired',
    retired: true,
    archive: 'retired-features/native-library-ui/0F1d-library-insights/0F1d-original.js',
    replacement: 'Desktop Studio S0F1d Library Insights',
  };

  const state = (MOD.state = MOD.state || {
    booted: true,
    retired: true,
    lastRefreshReason: '',
    lastRefreshAt: 0,
  });

  function retiredResult(method, reason = 'api') {
    return {
      ok: false,
      retired: true,
      moduleId: '0F1d',
      phase: MOD.meta.phase,
      method: String(method || ''),
      reason: String(reason || ''),
      archive: MOD.meta.archive,
      replacement: MOD.meta.replacement,
    };
  }

  function refresh(reason = 'api') {
    state.lastRefreshReason = String(reason || '');
    state.lastRefreshAt = Date.now();
    return retiredResult('refresh', reason);
  }

  function selfCheck() {
    return {
      ok: true,
      retired: true,
      moduleId: '0F1d',
      phase: MOD.meta.phase,
      hasExplorerRenderer: false,
      hasAnalyticsRenderer: false,
      hasNativeStyles: false,
      registeredOwner: !!H2O.LibraryCore?.getOwner?.('library-insights'),
      registeredService: !!H2O.LibraryCore?.getService?.('library-insights'),
      state: { ...state },
      bootDiag: H2O.LibraryInsightsBootDiag,
      archive: MOD.meta.archive,
      replacement: MOD.meta.replacement,
    };
  }

  const owner = {
    phase: MOD.meta.phase,
    retired: true,
    refresh,
    selfCheck,
  };

  MOD.owner = owner;
  MOD.refresh = refresh;
  MOD.selfCheck = selfCheck;

  function registerWithCore(reason = 'boot') {
    try {
      const core = H2O.LibraryCore;
      if (!core) return false;
      core.registerOwner?.('library-insights', owner, { replace: true });
      core.registerService?.('library-insights', owner, { replace: true });
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
