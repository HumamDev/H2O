/* R4.7.4 — Retired Native Projects Sidebar UI (from 0F2a)
 *
 * This file is an ARCHIVE of the Native ChatGPT projects sidebar UI
 * that was physically removed from
 *   src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js
 * in commit _<R4.7.4 commit hash; populated post-commit>_.
 *
 * The functions below reference variables that are scope-bound to
 * the 0F2a IIFE (`W`, `D`, `H2O`, `STATE`, `CLEAN`, `err`, `step`,
 * `owner`, `getProjectMoreOpenMode`, `getProjectInlinePreviewOnOpen`,
 * `CFG_MORE_OPEN_MODE_PAGE`, `UI_PROJECT_TITLE_STYLE_ID`,
 * `UI_PROJECT_TITLE_ROW_CLASS`, `DOM_findProjectsH2`,
 * `DOM_findProjectsSection`, `DOM_getProjectsMoreRow`,
 * `DOM_isH2OOwnedNode`, `isNativeOrganizationUiEnabled`).
 *
 * This file is NOT loaded by any runtime — it is purely archival.
 * It is not syntactically self-contained; pasting it back into
 * 0F2a's IIFE scope (at the recorded line ranges in
 * extracted-from-0F2a.md) restores the original code.
 *
 * Why retired:
 *   The Native ChatGPT Library sidebar projects-row decoration was
 *   hidden by R4.6.x deprecation flags (default-flipped in R4.6.4)
 *   and replaced by Desktop Studio's S0Z1g library sidebar (shipped
 *   in R4.5.x). After soak proved the Native UI was dormant, R4.7.4
 *   physically removes the now-dead UI code. The PROJECTS DATA flow
 *   (fetch interception, cache, reconcile, harvest, dropdown
 *   scraping) STAYS in 0F2a — downstream modules + Studio depend
 *   on the projects data layer.
 *
 * Replacement:
 *   - Projects sidebar row decoration → Desktop Studio's S0Z1g
 *     projects section (renders its own row UI inside Studio)
 *   - The `.ho-project-row` class + decoration CSS → no
 *     replacement; the Native row decoration was Native-only chrome
 *
 * Boundary preserved (the entire DATA layer stays in 0F2a):
 *   - PROJECTS_fetchAllProjects, PROJECTS_fetchNativePage,
 *     PROJECTS_fetchAllProjectsFromSource (fetch)
 *   - PROJECTS_readStore, PROJECTS_writeStore, PROJECTS_emitChanged,
 *     PROJECTS_emptyStore, PROJECTS_normalizeStore (cache/store)
 *   - PROJECTS_reconcileStoreSnapshot, PROJECTS_reconcileDropdownRows,
 *     PROJECTS_applyRowsToStore, PROJECTS_loadRows (reconcile)
 *   - PROJECTS_recordNativeSidebarPayload,
 *     PROJECTS_autoharvestNativeDropdown (harvest)
 *   - PROJECTS_eventTargetsMoreRow, PROJECTS_suppressNativeMoreEvent,
 *     PROJECTS_openMorePageFromEvent (sidebar more-button
 *     interception — this is data-harvest plumbing; the workspace
 *     viewer that handles `more` is workspace UI, R4.7.5 scope)
 *   - OBS_hookProjectsNativeFetchCaptureOnce (fetch interception)
 *   - OBS_hookProjectsMorePageOverrideOnce (document-level
 *     more-button override)
 *   - OBS_hookProjectsCanonicalStoreOnce (mutation-observer
 *     canonical store keeper)
 *   - UI_openProjectsViewer + workspace UI (`UI_appendInShellProjectRow`,
 *     `UI_appendInShellProjectRows`, `UI_handleProjectsManualRefresh`,
 *     `UI_setProjectsRefreshButtonState`, `UI_syncProjectsRefreshButtons`,
 *     `UI_wireProjectsPageScrollGuard`) — R4.7.5 scope (workspace
 *     viewer retirement)
 *   - 0F5a tag extraction untouched
 *   - 0D3* / 3X* capture modules untouched
 *
 * Rollback:
 *   See ../README.md and ../notes/rollback-procedures.md.
 *   Either git revert the R4.7.4 commit, or paste each block below
 *   back into 0F2a at the line ranges recorded in
 *   extracted-from-0F2a.md.
 */

/* ─────────────────────────────────────────────────────────────────────
 * Block 1 of 4 — R4.6.3 per-element org gate (pre-R4.7.4 lines 112-166)
 * Self-contained gate plumbing: a single selector array, a sync
 * function, an installer, and a boot IIFE. No external callers.
 * The gate is no longer needed because the UI it gated is itself
 * retired.
 * ─────────────────────────────────────────────────────────────────── */

  /* ── R4.6.3 — Per-element gate (cascade-proof, see 0F4a for pattern) ─
   * fetchInterception / projectsCache / projectsReconcile remain
   * unconditional — Native projects DATA flow continues regardless
   * of gate state. */
  const R46_ORG_SELECTORS = ['.ho-project-row'];
  function syncR46OrgElements() {
    try {
      const D = W.document;
      if (!D) return;
      const hide = !isNativeOrganizationUiEnabled();
      for (const sel of R46_ORG_SELECTORS) {
        D.querySelectorAll(sel).forEach((el) => {
          if (!el || el.nodeType !== 1) return;
          if (hide) {
            el.setAttribute('data-h2o-r46-hidden', 'org-ui');
            try { el.style.setProperty('display', 'none', 'important'); } catch (_) {}
          } else if (el.getAttribute('data-h2o-r46-hidden') === 'org-ui') {
            el.removeAttribute('data-h2o-r46-hidden');
            try { el.style.removeProperty('display'); } catch (_) {}
          }
        });
      }
    } catch (_) { /* swallow */ }
  }
  function installR46OrgCssGate() {
    try {
      const D = W.document;
      if (!D) return;
      const SHARED_STYLE_ID = 'h2o-r46-hidden-attr-css';
      if (!D.getElementById(SHARED_STYLE_ID)) {
        const style = D.createElement('style');
        style.id = SHARED_STYLE_ID;
        style.textContent =
          '[data-h2o-r46-hidden="org-ui"],[data-h2o-r46-hidden="workspace-ui"]'
        + '{display:none !important;}';
        (D.head || D.documentElement).appendChild(style);
      }
      syncR46OrgElements();
      if (typeof W.setInterval === 'function') {
        W.setInterval(syncR46OrgElements, 1000);
      }
      if (typeof W.MutationObserver === 'function' && D.body) {
        const obs = new W.MutationObserver(function () { syncR46OrgElements(); });
        obs.observe(D.body, { childList: true, subtree: true });
      }
    } catch (_) { /* swallow */ }
  }
  (function bootR46OrgCssGate() {
    try {
      const D = W.document;
      if (!D) return;
      if (D.readyState !== 'loading') installR46OrgCssGate();
      else D.addEventListener('DOMContentLoaded', installR46OrgCssGate, { once: true });
    } catch (_) { /* swallow */ }
  })();

/* ─────────────────────────────────────────────────────────────────────
 * Block 2 of 4 — UI_installProjectTitleContainerStyle (pre-R4.7.4
 *                                                      lines 2145-2237)
 * Injects the `<style>` element with id UI_PROJECT_TITLE_STYLE_ID
 * (`h2o-project-title-container-style-v1`) that carries the
 * `.ho-project-row` decoration rules (padding, rounded corners,
 * inset shadows, hover/active styles, scroll-cover gradients).
 * Only caller was UI_markProjectTitleRows (also retired).
 * ─────────────────────────────────────────────────────────────────── */

  function UI_installProjectTitleContainerStyle() {
    if (D.getElementById(UI_PROJECT_TITLE_STYLE_ID)) return;
    const style = D.createElement('style');
    style.id = UI_PROJECT_TITLE_STYLE_ID;
    style.textContent = `
:where(nav, aside) .${UI_PROJECT_TITLE_ROW_CLASS} {
  width: calc(100% - 3px) !important;
  box-sizing: border-box !important;
  padding: 8px 12px !important;
  margin-top: 4px !important;
  margin-bottom: 4px !important;
  margin-left: 3px !important;
  margin-right: 0 !important;
  transform: translateX(2px) !important;
  position: relative !important;
  border-radius: 10px !important;
  background: rgba(0,0,0,0.18) !important;
  background-color: rgba(0,0,0,0.18) !important;
  z-index: 0 !important;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.07),
    inset 0 1px 0 rgba(255,255,255,0.04),
    0 3px 10px rgba(0,0,0,0.32) !important;
  transition: background .15s ease, box-shadow .15s ease;
}
:where(nav, aside) .${UI_PROJECT_TITLE_ROW_CLASS}::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  border-radius: inherit !important;
  pointer-events: none !important;
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.045),
    rgba(255,255,255,0.012) 40%,
    rgba(0,0,0,0) 100%
  ) !important;
  opacity: 0.75 !important;
}
:where(nav, aside) .${UI_PROJECT_TITLE_ROW_CLASS}:hover {
  background: rgba(0,0,0,0.12) !important;
  background-color: rgba(0,0,0,0.12) !important;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.11),
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 5px 14px rgba(0,0,0,0.42) !important;
}
:where(nav, aside) .${UI_PROJECT_TITLE_ROW_CLASS}[aria-current="page"],
:where(nav, aside) .${UI_PROJECT_TITLE_ROW_CLASS}.active,
:where(nav, aside) .${UI_PROJECT_TITLE_ROW_CLASS}[data-active] {
  border-radius: 12px !important;
  background: rgba(0,0,0,0.12) !important;
  background-color: rgba(0,0,0,0.12) !important;
  box-shadow:
    inset 0 0 0 1.5px rgba(255,255,255,0.22),
    0 0 0 1px rgba(0,0,0,0.65),
    0 6px 16px rgba(0,0,0,0.44) !important;
}
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > .sticky,
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > [class*="sidebar-section-first-margin-top"] {
  isolation: isolate !important;
  background: var(--sidebar-surface-primary, var(--bg-primary, #202123)) !important;
  background-color: var(--sidebar-surface-primary, var(--bg-primary, #202123)) !important;
}
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > .sticky:first-child {
  z-index: 120 !important;
}
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > [class*="sidebar-section-first-margin-top"] {
  z-index: 110 !important;
}
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > [class*="sidebar-section-first-margin-top"]::after {
  content: "" !important;
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  bottom: -14px !important;
  height: 14px !important;
  pointer-events: none !important;
  background: linear-gradient(
    to bottom,
    var(--sidebar-surface-primary, var(--bg-primary, #202123)) 0%,
    color-mix(in srgb, var(--sidebar-surface-primary, #202123) 72%, transparent) 58%,
    transparent 100%
  ) !important;
  z-index: 1 !important;
}
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) a.ho-has-colorbtn-side,
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) .${UI_PROJECT_TITLE_ROW_CLASS} {
  z-index: 0 !important;
}
`;
    (D.head || D.documentElement).appendChild(style);
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 3 of 4 — UI_markProjectTitleRows (pre-R4.7.4 lines 2239-2249)
 * Scans the projects sidebar section, adds the
 * `.ho-project-row` class to native project anchors (a/href*="/g/"/
 * project), and strips the class from any element that no longer
 * matches the project-anchor pattern. Calls
 * UI_installProjectTitleContainerStyle to make sure the decoration
 * CSS is present. Only caller was UI_applyProjectsNativeControls.
 * ─────────────────────────────────────────────────────────────────── */

  function UI_markProjectTitleRows(projectsSection = DOM_findProjectsSection(DOM_findProjectsH2())) {
    UI_installProjectTitleContainerStyle();
    if (!(projectsSection instanceof HTMLElement)) return 0;
    projectsSection.querySelectorAll(`.${UI_PROJECT_TITLE_ROW_CLASS}`).forEach((row) => {
      if (!row.matches?.('a[href*="/g/"][href$="/project"]')) row.classList.remove(UI_PROJECT_TITLE_ROW_CLASS);
    });
    const rows = [...projectsSection.querySelectorAll('a.__menu-item[href*="/g/"][href$="/project"],a[data-sidebar-item="true"][href*="/g/"][href$="/project"]')]
      .filter((row) => !DOM_isH2OOwnedNode(row));
    rows.forEach((row) => row.classList.add(UI_PROJECT_TITLE_ROW_CLASS));
    return rows.length;
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 4 of 4 — UI_applyProjectsNativeControls (pre-R4.7.4 lines
 *                                                  2251-2295)
 * The sidebar UI orchestrator:
 *   1. Calls UI_markProjectTitleRows to apply the `.ho-project-row`
 *      class to native project anchors.
 *   2. Wires per-row click/pointer event interception on the
 *      `More` row so clicks open the H2O Projects viewer (or
 *      suppress native behavior).
 *   3. Wires a delegated "Show chats"/"Hide chats" inline-preview
 *      interceptor on the projects section.
 *
 * 0F2a retains a no-op stub because:
 *   - The MOD.applyNativeControls API forwards to it.
 *   - PROJECTS_boot + OBS_hookProjectsCanonicalStoreOnce call it
 *     on mutations / late-init.
 *
 * The MORE-BUTTON document-level interception (the only behaviorally
 * meaningful piece for the harvest data path) is independently
 * installed by OBS_hookProjectsMorePageOverrideOnce (still active
 * in 0F2a) using PROJECTS_eventTargetsMoreRow +
 * PROJECTS_suppressNativeMoreEvent + PROJECTS_openMorePageFromEvent
 * — those functions stay live.
 * ─────────────────────────────────────────────────────────────────── */

  function UI_applyProjectsNativeControls(projectsSection = DOM_findProjectsSection(DOM_findProjectsH2())) {
    UI_markProjectTitleRows(projectsSection);
    if (!projectsSection) return;

    const moreRow = DOM_getProjectsMoreRow(projectsSection);
    if (moreRow && !moreRow.__h2oProjectsMoreBound) {
      const openProjectsPage = (e) => {
        if (STATE.projectsNativeHarvesting) return;
        if (getProjectMoreOpenMode() !== CFG_MORE_OPEN_MODE_PAGE) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        owner.openViewer(null).catch((error) => err('projectsMorePage', error));
      };
      const stopNativeProjectsMore = (e) => {
        if (STATE.projectsNativeHarvesting) return;
        if (getProjectMoreOpenMode() !== CFG_MORE_OPEN_MODE_PAGE) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
      };
      moreRow.addEventListener('pointerdown', stopNativeProjectsMore, true);
      moreRow.addEventListener('mousedown', stopNativeProjectsMore, true);
      moreRow.addEventListener('mouseup', stopNativeProjectsMore, true);
      moreRow.addEventListener('click', openProjectsPage, true);
      moreRow.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openProjectsPage(e);
      }, true);
      moreRow.__h2oProjectsMoreBound = true;
    }

    if (projectsSection.__h2oProjectInlineBound) return;
    projectsSection.addEventListener('click', (e) => {
      if (getProjectInlinePreviewOnOpen()) return;
      const toggle = e.target?.closest?.('button[aria-label="Show chats"],button[aria-label="Hide chats"]');
      if (!toggle || !projectsSection.contains(toggle)) return;
      const row = toggle.closest('a.__menu-item[href*="/g/"][href$="/project"]');
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      W.setTimeout(() => row.click(), 0);
    }, true);
    projectsSection.__h2oProjectInlineBound = true;
  }
