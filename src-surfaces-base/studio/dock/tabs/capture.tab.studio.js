/* H2O Studio — Dock Tab Placeholder: Capture (Phase 2B, inert in V1)
 *
 * Phase 2B placeholder for Capture. Registers a tab with
 * H2O.Studio.dock under the id 'capture'. The render() function
 * writes static text only.
 *
 * Capture is INERT in Studio V1 per STUDIO_DOCK_PANEL_CONTRACT.md:
 *   - No live text selection (Studio reads snapshots, not live chat).
 *   - No item creation.
 *   - No conversion to Notes / Bookmarks / Context.
 *   - No archive/dismiss mutations.
 *
 * The Phase 2C iteration may read Capture items via
 * H2O.Studio.store.capture (read-only façade, Phase 1g) for display
 * only. Even then, no write surface is enabled in V1.
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

  dock.registerTab('capture', {
    id: 'capture',
    title: 'Capture',
    icon: '🧷',
    color: '#C05C95',
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
        p.textContent = 'Capture is read-only/inert in Studio V1. Live selection and conversion are not enabled.';
        container.appendChild(p);
      } catch (_) { /* swallow */ }
    },
  });
})(globalThis);
