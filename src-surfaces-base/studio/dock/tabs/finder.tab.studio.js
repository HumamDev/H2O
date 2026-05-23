/* H2O Studio — Dock Tab Placeholder: Finder (Phase 2B, optional)
 *
 * Phase 2B placeholder. Registers a tab with H2O.Studio.dock under
 * the id 'finder'. The render() function writes static text only.
 *
 * Native Finder has no own engine — it composes Highlights /
 * Bookmarks / Notes reads into a single search list scoped to the
 * current chat. Studio's Phase 2C iteration may compose the existing
 * read-only stores (highlights / bookmarks / notes) the same way.
 * Phase 2B does no composition, no search, no rendering of real data.
 *
 * Contracts:
 *   docs/contracts/studio-dock-tab-registration.md
 *   src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md
 *   src-surfaces-base/studio/dock/README.md
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  const dock = H2O.Studio.dock;
  if (!dock || typeof dock.registerTab !== 'function') return;

  dock.registerTab('finder', {
    id: 'finder',
    title: 'Finder',
    icon: '🔎',
    color: '#3FA7D6',
    disabled: false,
    phase: '2b-placeholder',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;
      try {
        while (container.firstChild) container.removeChild(container.firstChild);
        const p = document.createElement('div');
        p.className = 'wbDockPlaceholder';
        p.textContent = 'Read-only tab placeholder. Data rendering lands in Phase 2C.';
        container.appendChild(p);
      } catch (_) { /* swallow */ }
    },
  });
})(globalThis);
