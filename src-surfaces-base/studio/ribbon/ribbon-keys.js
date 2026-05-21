/* H2O Studio — Ribbon Keys (Phase 1a)
 *
 * Frozen constants for the Studio Ribbon:
 *
 *   H2O.Studio.RibbonKeys      — storage key strings (Studio-local, h2o:studio:*)
 *   H2O.Studio.RibbonEvents    — event-name strings (evt:h2o:studio:ribbon:*)
 *   H2O.Studio.RibbonTabIds    — frozen list + map of default tab ids
 *   H2O.Studio.RibbonChatTypes — frozen list + map of chatType constants
 *
 * Passive: loading this file has no side effects beyond attaching those four
 * frozen objects. No state, no DOM, no storage I/O.
 *
 * Loads before ribbon-shell.studio.js. Both feature code (S0Y1a) and the shell
 * read constants from here.
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency guard — script may be re-included during dev hot reload. */
  if (H2O.Studio.RibbonKeys && H2O.Studio.RibbonEvents && H2O.Studio.RibbonTabIds && H2O.Studio.RibbonChatTypes) {
    return;
  }

  /* ── Storage keys (Studio-local only; prefs store enforces prefix) ── */
  const RibbonKeys = Object.freeze({
    activeTab: 'h2o:studio:ribbon:active-tab:v1',
    collapsed: 'h2o:studio:ribbon:collapsed:v1',
  });

  /* ── Event names (Studio-local; canonical evt:h2o:studio:* shape) ── */
  const RibbonEvents = Object.freeze({
    ready:            'evt:h2o:studio:ribbon:ready',
    contextChanged:   'evt:h2o:studio:ribbon:context-changed',
    tabChanged:       'evt:h2o:studio:ribbon:tab-changed',
    actionInvoked:    'evt:h2o:studio:ribbon:action-invoked',
    collapsedChanged: 'evt:h2o:studio:ribbon:collapsed-changed',
    tabRegistered:    'evt:h2o:studio:ribbon:tab-registered',
  });

  /* ── Default tab ids (the surface module S0Y1a registers these) ──── */
  const RibbonTabIdList = Object.freeze([
    'home',
    'format',
    'structure',
    'ai-tools',
    'metadata',
    'view',
    'export',
  ]);

  const RibbonTabIds = Object.freeze({
    home:      'home',
    format:    'format',
    structure: 'structure',
    aiTools:   'ai-tools',
    metadata:  'metadata',
    view:      'view',
    export:    'export',
    list:      RibbonTabIdList,
  });

  /* ── Chat-type constants ──────────────────────────────────────────── */
  const RibbonChatTypeList = Object.freeze([
    'saved',
    'indexed',
    'imported', /* reserved — no current discriminator */
    'readonly', /* reserved — no current discriminator */
  ]);

  const RibbonChatTypes = Object.freeze({
    saved:    'saved',
    indexed:  'indexed',
    imported: 'imported',
    readonly: 'readonly',
    list:     RibbonChatTypeList,
  });

  /* ── Attach to globals ────────────────────────────────────────────── */
  H2O.Studio.RibbonKeys = RibbonKeys;
  H2O.Studio.RibbonEvents = RibbonEvents;
  H2O.Studio.RibbonTabIds = RibbonTabIds;
  H2O.Studio.RibbonChatTypes = RibbonChatTypes;
})(globalThis);
