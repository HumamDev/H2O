/* H2O Studio — Dock Tab Placeholder: Attachments (Phase 2B)
 *
 * Phase 2B placeholder. Registers a tab with H2O.Studio.dock under
 * the id 'attachments'. The render() function writes static text only.
 *
 * Visual metadata mirrors src-runtime-base/3A1a.…Dock Panel.js:218
 * (DPANEL_RAIL_ITEMS[3]).
 *
 * Native Attachments has no engine — it is purely DOM-discovered from
 * the reader (images, file-cards). Studio's Phase 2C iteration will
 * scan the reader replay DOM via the centralized selectors contract,
 * NOT by re-implementing native scanning. Phase 2B does no DOM
 * scanning and no rendering of real attachment data.
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

  dock.registerTab('attachments', {
    id: 'attachments',
    title: 'Attachments',
    icon: '📎',
    txt: 'A',
    color: '#345E9E',
    order: 40,
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
        h.textContent = 'Attachments';
        const p = document.createElement('p');
        p.textContent = 'Attachments are derived from the Studio reader DOM. DOM scanning lands later.';
        box.appendChild(h);
        box.appendChild(p);
        container.appendChild(box);
      } catch (_) { /* swallow */ }
    },
  });
})(globalThis);
