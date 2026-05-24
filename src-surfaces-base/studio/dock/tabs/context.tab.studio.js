/* H2O Studio — Dock Tab Placeholder: Context (Phase 2B)
 *
 * Phase 2B placeholder. Registers a tab with H2O.Studio.dock under
 * the id 'context'. The render() function writes static text only —
 * it does NOT read H2O.Studio.store.context, does NOT mutate any
 * Context data, and does NOT touch the native runtime.
 *
 * Visual metadata mirrors src-runtime-base/3A1a.…Dock Panel.js:220
 * (DPANEL_RAIL_ITEMS[5]).
 *
 * Real Context rendering lands in Phase 2C, against
 * H2O.Studio.store.context (read-only façade landed in Phase 1c).
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

  dock.registerTab('context', {
    id: 'context',
    title: 'Context',
    icon: '🧠',
    txt: 'C',
    color: '#6740A8',
    order: 60,
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
        h.textContent = 'Context';
        const p = document.createElement('p');
        p.textContent = 'Read-only tab placeholder. Data rendering lands in Phase 2C.';
        box.appendChild(h);
        box.appendChild(p);
        container.appendChild(box);
      } catch (_) { /* swallow */ }
    },
  });
})(globalThis);
