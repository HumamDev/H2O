/* H2O Studio — Dock Tab Placeholder: Bookmarks (Phase 2B)
 *
 * Phase 2B placeholder. Registers a tab with H2O.Studio.dock under
 * the id 'bookmarks'. The render() function writes static text only —
 * it does NOT read H2O.Studio.store.bookmarks, does NOT mutate any
 * Bookmarks data, does NOT scroll the reader, and does NOT touch the
 * native runtime.
 *
 * Visual metadata mirrors src-runtime-base/3A1a.…Dock Panel.js:216
 * (DPANEL_RAIL_ITEMS[1]).
 *
 * Real Bookmarks rendering lands in Phase 2C, against
 * H2O.Studio.store.bookmarks (read-only façade landed in Phase 1d).
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

  dock.registerTab('bookmarks', {
    id: 'bookmarks',
    title: 'Bookmarks',
    icon: '⭐',
    txt: 'B',
    color: '#2C7A4A',
    order: 20,
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
        h.textContent = 'Bookmarks';
        const p = document.createElement('p');
        p.textContent = 'Read-only tab placeholder. Data rendering lands in Phase 2C.';
        box.appendChild(h);
        box.appendChild(p);
        container.appendChild(box);
      } catch (_) { /* swallow */ }
    },
  });
})(globalThis);
