/* H2O Studio — Dock Tab Placeholder: Finder (Phase 2B)
 *
 * Phase 2B placeholder. Registers a tab with H2O.Studio.dock under
 * the id 'finder' (the canonical Studio id). The native rail uses
 * 'slot8' as the rail view-id pointing at the same Finder tab
 * (src-runtime-base/3A1a.…Dock Panel.js:222); Studio routes directly
 * via 'finder' and mirrors only the visible metadata (title, color,
 * txt).
 *
 * Native Finder has no own engine — it composes Highlights /
 * Bookmarks / Notes reads into a single search list scoped to the
 * current chat. Studio's Phase 2C+ iteration may compose the existing
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
    txt: 'F',
    color: '#3FA7D6',
    order: 80,
    disabled: false,
    phase: '2b-placeholder',
    readonly: true,
    render: function (container, ctx) {
      if (!container || typeof container.appendChild !== 'function') return;
      if (typeof document === 'undefined') return;
      try {
        container.textContent = '';
        const box = document.createElement('div');
        box.className = 'wbDockPlaceholder';
        const h = document.createElement('strong');
        h.textContent = 'Finder';
        const p = document.createElement('p');
        p.textContent = 'Finder search across Dock feature stores lands later.';
        box.appendChild(h);
        box.appendChild(p);
        container.appendChild(box);
      } catch (_) { /* swallow */ }
    },
  });
})(globalThis);
