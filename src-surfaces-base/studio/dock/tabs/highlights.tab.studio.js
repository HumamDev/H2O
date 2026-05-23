/* H2O Studio — Dock Tab Placeholder: Highlights (Phase 2B)
 *
 * Phase 2B placeholder. Registers a tab with H2O.Studio.dock under
 * the id 'highlights'. The render() function writes static text into
 * the provided container — it does NOT read any feature store, does
 * NOT mutate any feature data, does NOT scroll the reader, and does
 * NOT touch the native runtime.
 *
 * Visual metadata (title / color / txt / order) mirrors the native
 * Dock rail item declared in
 * src-runtime-base/3A1a.…Dock Panel.js:215 (DPANEL_RAIL_ITEMS[0]).
 *
 * Real Highlights-data rendering lands in Phase 2C against
 * H2O.Studio.store.highlights (already in HEAD since Phase A1).
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

  dock.registerTab('highlights', {
    id: 'highlights',
    title: 'Highlights',
    icon: '🌈',
    txt: 'H',
    color: '#C7A106',
    order: 10,
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
        h.textContent = 'Highlights';
        const p = document.createElement('p');
        p.textContent = 'Read-only tab placeholder. Data rendering lands in Phase 2C.';
        box.appendChild(h);
        box.appendChild(p);
        container.appendChild(box);
      } catch (_) { /* swallow */ }
    },
  });
})(globalThis);
