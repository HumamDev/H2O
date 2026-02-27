// ==UserScript==
// @h2o-id      9e.keep.projects.open
// @name         9e.🟤🧷 Keep Projects Open
// @namespace    H2O.ChatGPT.Sidebar
// @version      2.0.3
// @description  Forces the Sidebar "Projects" section to stay expanded (auto-reopens after rerenders). Contract v2 Stage 1 mechanics (boot/dispose, vault+diag, no side-effect top-level).
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── 0) Identity (LOCKED — Stage 1) ───────────────────────────── */
  const TOK  = 'KP';
  const PID  = 'kpprjcts';
  const CID  = 'kprojects'; // identifiers-only (CID_UP)
  const SkID = 'kppr';      // ui-hook strings only (unused here)

  const MODTAG    = 'KProjects';
  const MODICON   = '🧷';
  const EMOJI_HDR = '🟤';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const BrID = PID;
  const DsID = PID;

  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  /* ───────────────────────────── 1) Brain Vault (bounded) ───────────────────────────── */
  const W = window;
  const D = document;

  W.H2O = W.H2O || {};
  W.H2O[TOK] = W.H2O[TOK] || {};
  const VAULT = (W.H2O[TOK][BrID] = W.H2O[TOK][BrID] || { diag: {}, state: {}, api: {} });

  const DIAG  = (VAULT.diag  = VAULT.diag  || {});
  const STATE = (VAULT.state = VAULT.state || {});

  /* ───────────────────────────── 2) Constants (no raw strings) ───────────────────────────── */
  const CFG_KPROJECTS = {
    debug: false,
    fastIntervalMs: 700,
    slowIntervalMs: 4500,
    fastPhaseMs: 30000,
  };

  const SEL_KPROJECTS_SIDEBAR_ROOT = 'nav, aside, [data-testid*="sidebar"], [class*="sidebar"]';
  const SEL_KPROJECTS_CLICKABLES   = 'button, [role="button"], a';
  const TXT_KPROJECTS_PROJECTS     = 'projects';

  const EV_KPROJECTS_CORE_READY = 'h2o:core:ready';

  /* ───────────────────────────── 3) Utils ───────────────────────────── */
  /** @helper */ const UTIL_KPROJECTS_norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  /** @helper */ const UTIL_KPROJECTS_log  = (...a) => CFG_KPROJECTS.debug && console.log(`[${MODTAG}]`, ...a);

  /** @helper */
  function UTIL_KPROJECTS_inSidebar(el) {
    return !!el?.closest?.(SEL_KPROJECTS_SIDEBAR_ROOT);
  }

  /** @helper */
  function UTIL_KPROJECTS_findSidebarRoot() {
    return (
      D.querySelector('nav') ||
      D.querySelector('aside') ||
      D.querySelector('[data-testid*="sidebar"]') ||
      D.querySelector('[class*="sidebar"]') ||
      D.documentElement
    );
  }

  /* ───────────────────────────── 4) Core Logic ───────────────────────────── */
  /** @critical */
  function CORE_KPROJECTS_findProjectsToggle() {
    const candidates = Array.from(D.querySelectorAll(SEL_KPROJECTS_CLICKABLES))
      .filter(UTIL_KPROJECTS_inSidebar)
      .filter((el) => UTIL_KPROJECTS_norm(el.innerText || el.textContent) === TXT_KPROJECTS_PROJECTS);

    if (!candidates.length) return null;

    const withAria =
      candidates.find((el) => el.hasAttribute?.('aria-expanded')) ||
      candidates.find((el) => el.closest?.('[aria-expanded]')) ||
      candidates[0];

    return withAria?.hasAttribute?.('aria-expanded')
      ? withAria
      : (withAria?.closest?.('[aria-expanded]') || withAria);
  }

  /** @critical */
  function CORE_KPROJECTS_isExpanded(btn) {
    const ae = btn?.getAttribute?.('aria-expanded');
    if (ae === 'true') return true;
    if (ae === 'false') return false;

    const root = btn?.parentElement;
    const next = root?.nextElementSibling;

    const looksVisible = (el) => {
      if (!el) return false;
      const st = getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && el.offsetHeight > 0;
    };

    if (looksVisible(next) && next.querySelector?.('a, button, li, [role="link"]')) return true;
    if (looksVisible(root?.querySelector?.('ul')) && root.querySelector?.('li')) return true;

    return false;
  }

  /** @critical */
  function CORE_KPROJECTS_ensureProjectsOpen() {
    const btn = CORE_KPROJECTS_findProjectsToggle();
    if (!btn) return UTIL_KPROJECTS_log('Projects toggle not found (yet).');

    if (!CORE_KPROJECTS_isExpanded(btn)) {
      UTIL_KPROJECTS_log('Expanding Projects…');
      btn.click();
      DIAG.lastClickAt = Date.now();
    } else {
      UTIL_KPROJECTS_log('Projects already open.');
    }

    DIAG.lastEnsureAt = Date.now();
  }

  /* ───────────────────────────── 5) Lifecycle (boot/dispose, idempotent) ───────────────────────────── */
  /** @core */
  function CORE_KPROJECTS_dispose() {
    try { STATE._mo?.disconnect?.(); } catch {}
    STATE._mo = null;

    if (STATE._interval) {
      clearInterval(STATE._interval);
      STATE._interval = null;
    }

    if (STATE._waitTimer) {
      clearTimeout(STATE._waitTimer);
      STATE._waitTimer = null;
    }

    try { W.removeEventListener('popstate', STATE._onNav, true); } catch {}
    try { W.removeEventListener('hashchange', STATE._onNav, true); } catch {}
    try { D.removeEventListener('visibilitychange', STATE._onVis, true); } catch {}
    try { W.removeEventListener(EV_KPROJECTS_CORE_READY, STATE._onCoreReady, true); } catch {}

    STATE._onNav = null;
    STATE._onVis = null;
    STATE._onCoreReady = null;

    STATE.booted = false;
    DIAG.disposedAt = Date.now();
  }

  /** @core */
  function CORE_KPROJECTS_boot() {
    if (STATE.booted) return;
    STATE.booted = true;

    DIAG.bootedAt = Date.now();
    DIAG.pid = PID;
    DIAG.tok = TOK;

    const start = () => {
      // 1) Run immediately
      CORE_KPROJECTS_ensureProjectsOpen();

      // 2) Interval: fast phase then slow
      const fastEnd = Date.now() + CFG_KPROJECTS.fastPhaseMs;

      const tick = () => {
        CORE_KPROJECTS_ensureProjectsOpen();
        if (Date.now() > fastEnd && STATE._phase !== 'slow') {
          STATE._phase = 'slow';
          if (STATE._interval) clearInterval(STATE._interval);
          STATE._interval = setInterval(tick, CFG_KPROJECTS.slowIntervalMs);
        }
      };

      STATE._phase = 'fast';
      STATE._interval = setInterval(tick, CFG_KPROJECTS.fastIntervalMs);

      // 3) MutationObserver: watch sidebar-ish root
      const root = UTIL_KPROJECTS_findSidebarRoot();
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.addedNodes?.length || m.removedNodes?.length) {
            CORE_KPROJECTS_ensureProjectsOpen();
            break;
          }
        }
      });
      mo.observe(root, { childList: true, subtree: true });
      STATE._mo = mo;

      // 4) Navigation + focus checks
      STATE._onNav = () => CORE_KPROJECTS_ensureProjectsOpen();
      STATE._onVis = () => { if (!D.hidden) CORE_KPROJECTS_ensureProjectsOpen(); };

      W.addEventListener('popstate', STATE._onNav, true);
      W.addEventListener('hashchange', STATE._onNav, true);
      D.addEventListener('visibilitychange', STATE._onVis, true);

      DIAG.startedAt = Date.now();
    };

    // Wait for body (safety)
    const waitBody = () => {
      if (D.body) return start();
      STATE._waitTimer = setTimeout(waitBody, 50);
    };
    waitBody();

    // Optional: re-enforce once when Core signals ready
    STATE._onCoreReady = () => CORE_KPROJECTS_ensureProjectsOpen();
    W.addEventListener(EV_KPROJECTS_CORE_READY, STATE._onCoreReady, true);

    // Public API (minimal)
    VAULT.api = {
      ensure: CORE_KPROJECTS_ensureProjectsOpen,
      dispose: CORE_KPROJECTS_dispose,
      boot: CORE_KPROJECTS_boot,
      diag: DIAG,
    };
  }

  /* ───────────────────────────── 6) No top-level side effects ───────────────────────────── */
  CORE_KPROJECTS_boot();
})();
