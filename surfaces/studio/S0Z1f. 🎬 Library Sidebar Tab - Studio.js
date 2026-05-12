// ==UserScript==
// @h2o-id             s0z1f.library_sidebar_tab.studio
// @name               S0Z1f. 🎬 Library Sidebar Tab - Studio
// @namespace          H2O.Premium.CGX.library_sidebar_tab.studio
// @author             HumamDev
// @version            1.2.0
// @revision           003
// @build              260511-000030
// @description        Studio Library sidebar entry v1.2: a SINGLE "Library" nav item (no sub-navigation, no badges, no inline actions). Clicking opens the full Library page (#/library/dashboard); Dashboard / Explorer / Analytics live as tabs inside the page, not in the sidebar. Matches Studio's wbNavItem style so it sits cleanly next to the existing Saved / Pinned / Archive items.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0Z1f Library Sidebar Tab v1.2 (Studio)', Date.now());

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  // Default landing route for the Library page. Dashboard is the canonical
  // overview view; users can switch to Explorer/Analytics from page-level tabs.
  const LIBRARY_DEFAULT_HASH = '#/library/dashboard';

  // The injected DOM lives inside a section we own. We re-use the previous
  // SECTION_ID so any leftover instance from v1.1 is replaced cleanly.
  const SECTION_ID = 'wbLibrarySection';

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 40, errMax: 15 };
  const step = (s, o = '') => { try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {} };
  const err = (s, e) => { try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {} };

  function getCore()     { return H2O.LibraryCore || null; }
  function getSidebar()  { return getCore()?.getService?.('native-sidebar') || null; }
  function getRoute()    { return getCore()?.getService?.('route') || null; }
  function getInsights() { return H2O.LibraryInsights || null; }
  function getPageHost() { return getCore()?.getService?.('page-host') || null; }

  function makeEl(tag, attrs = {}, children) {
    const node = D.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = String(v);
      else if (k === 'html') node.innerHTML = String(v);
      else if (k === 'text') node.textContent = String(v);
      else node.setAttribute(k, String(v));
    }
    if (children != null) for (const c of (Array.isArray(children) ? children : [children])) {
      if (c == null || c === false) continue;
      if (c instanceof Node) node.appendChild(c);
      else node.appendChild(D.createTextNode(String(c)));
    }
    return node;
  }

  // ── Build (idempotent) ────────────────────────────────────────────────────
  function buildSection() {
    // If an older (v1.1) section is in the DOM, scrub it so we don't end up
    // with two Library blocks. The id is the same, so getElementById finds it.
    const existing = D.getElementById(SECTION_ID);
    if (existing) {
      // Replace its contents rather than the section node so any references
      // (e.g. observers) stay valid. We rebuild from scratch each boot.
      try { existing.innerHTML = ''; existing.className = 'wbSidebarSection wbSidebarSection--libraryLink'; }
      catch (e) { err('reset.existing', e); }
    }

    const sidebar = getSidebar();
    if (!sidebar) return null;
    const root = sidebar.getRoot();
    if (!root) return null;

    const sec = existing || makeEl('section', {
      id: SECTION_ID,
      class: 'wbSidebarSection wbSidebarSection--libraryLink',
    });

    // A single nav-style anchor. No subtitle, no badge — kept minimal to match
    // the native ChatGPT sidebar Library entry. The wbSidebarNav wrapper exists
    // only so .wbNavItem inherits the shared grid/gap rules. The leading folder
    // icon comes from the .wbSidebarNav .wbNavItem::before background.
    const nav = makeEl('nav', {
      class: 'wbSidebarNav',
      'aria-label': 'Library',
    });
    const link = makeEl('a', {
      class: 'wbNavItem wbNavItem--library',
      href: LIBRARY_DEFAULT_HASH,
      'data-view': 'library',
      'aria-label': 'Open Library',
      title: 'Open Library',
    }, [
      makeEl('span', { class: 'wbNavGlyph' }, 'Library'),
    ]);
    nav.appendChild(link);
    sec.appendChild(nav);

    // Insertion order: pin Library to the very top of the nav block so it
    // sits above the Search chats row (which lives inside .wbSidebarTopNav).
    // Falls back to "above Folders" if the top-nav block is absent (older
    // HTML snapshots).
    if (!sec.isConnected) {
      const topNav = root.querySelector('.wbSidebarTopNav');
      if (topNav && topNav.parentElement === root) {
        root.insertBefore(sec, topNav);
      } else {
        const folderSec = sidebar.getFolderSection?.();
        if (folderSec && folderSec.parentElement === root) {
          root.insertBefore(sec, folderSec);
        } else {
          const folderHost = sidebar.getFolderHost?.();
          const ancestor = folderHost?.closest?.('.wbSidebarSection');
          if (ancestor && ancestor.parentElement === root) root.insertBefore(sec, ancestor);
          else root.appendChild(sec);
        }
      }
    }
    step('section.built');
    return sec;
  }

  // ── Active-state mirror (matches existing Saved/Pinned/Archive convention) ──
  // The base Studio sidebar uses the .active class on .wbNavItem; we follow it.
  function updateActiveFromRoute() {
    const route = getRoute()?.current?.();
    const sec = D.getElementById(SECTION_ID);
    if (!sec) return;
    const link = sec.querySelector('.wbNavItem--library');
    if (!link) return;
    link.classList.toggle('active', route?.name === 'library');
  }

  // ── Overlay visibility (route → show/hide Library page) ───────────────────
  function applyRouteVisibility() {
    const route = getRoute()?.current?.();
    const isLib = route?.name === 'library';
    const insights = getInsights();
    if (isLib) {
      if (insights?.show) insights.show();
      else getPageHost()?.showLibraryRegion?.(true);
    } else {
      if (insights?.hide) insights.hide();
      else getPageHost()?.showLibraryRegion?.(false);
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function boot() {
    if (!buildSection()) { W.requestAnimationFrame(boot); return; }
    updateActiveFromRoute();
    applyRouteVisibility();

    const routeSvc = getRoute();
    if (routeSvc?.on) {
      routeSvc.on(() => {
        updateActiveFromRoute();
        applyRouteVisibility();
      });
    }
    step('boot.ok');
  }

  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-sidebar-tab', { surface: 'studio', version: '1.2.0' }, { replace: true });
      step('register-on-core', 'library-sidebar-tab');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', () => { registerOnCore(); boot(); }, { once: true });
  } else {
    registerOnCore();
    boot();
  }

  step('boot', 'studio-library-sidebar-tab-v1.2-ready');

  H2O.Library.SidebarTab = {
    surface: 'studio',
    refresh: () => H2O.LibraryIndex?.refresh?.('sidebar-tab.api'),
    defaultHash: LIBRARY_DEFAULT_HASH,
    diagnose() {
      return {
        surface: 'studio',
        version: '1.2.0',
        sectionExists: !!D.getElementById(SECTION_ID),
        defaultHash: LIBRARY_DEFAULT_HASH,
        steps: diag.steps.slice(-10),
        errors: diag.errors.slice(-8),
      };
    },
  };
})();
