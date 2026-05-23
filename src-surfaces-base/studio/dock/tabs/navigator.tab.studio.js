/* H2O Studio — Dock Tab Placeholder: Navigator (Phase 2B)
 *
 * Phase 2B placeholder. Registers a tab with H2O.Studio.dock under
 * the id 'navigator'. The render() function writes static text only —
 * it does NOT read H2O.Studio.store.navigator, does NOT mutate any
 * Navigator data, does NOT scroll the reader, and does NOT touch
 * pin/alias/collapse state. No DOM-derived outline is generated.
 *
 * Real Navigator rendering lands in Phase 2C, against
 * H2O.Studio.store.navigator (read-only façade landed in Phase 1f).
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

  dock.registerTab('navigator', {
    id: 'navigator',
    title: 'Navigator',
    icon: '🧭',
    color: '#D47A38',
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
