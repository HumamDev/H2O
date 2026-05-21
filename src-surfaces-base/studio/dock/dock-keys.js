/* H2O Studio — Dock Keys (Phase 0B)
 *
 * Studio-local mirror of native Dock-Panel-related storage keys and event
 * names. Passive: loading this file has no side effects beyond attaching
 *
 *   H2O.Studio.DockKeys        — frozen map of canonical key strings
 *   H2O.Studio.DockEvents      — frozen map of event-name strings
 *   H2O.Studio.DockKeyFor      — frozen map of read-only per-chat key builders
 *
 * No state, no DOM, no storage I/O. Future Studio Dock modules (Phase 1+)
 * read these constants and helpers; they do NOT import or rely on native
 * runtime files. If a value diverges from a native source-of-truth it must
 * be documented in src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md.
 *
 * Phase 0B explicitly does NOT create H2O.Studio.dock — that namespace is
 * introduced in Phase 1a (Studio Dock shell). To avoid prejudging that
 * shape, constants attach directly to H2O.Studio.* with capitalized
 * top-level names.
 *
 * Contracts:
 *   docs/architecture/studio-dock-panel-plan.md   (phased plan)
 *   docs/contracts/studio-dock-tab-registration.md (Phase 1a tab API)
 *   src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md
 *   src-surfaces-base/studio/dock/README.md       (coding pattern)
 *
 * Native sources mirrored (evidence captured at Phase 0A):
 *   panelState                ←→ src-runtime-base/3A1a.…Dock Panel.js:33,72
 *                                (PID 'dckpnl' + ':state:panel:v1' template;
 *                                literal-form duplicate at 3N2a.…Notes Tab.js:65)
 *   panelStateLegacy          ←→ src-runtime-base/3A1a.…Dock Panel.js:73
 *   highlightsCanonV3         ←→ src-runtime-base/3H1a.…Highlights Engine.js:75
 *                                (also S3H1a:75, store/highlights.js:50)
 *   bookmarksPerChatPrefix    ←→ src-runtime-base/3B1a.…Bookmarks Engine.js:26,42,145
 *                                (PID 'bkmrksngne')
 *   notesPerChatPrefix        ←→ src-runtime-base/3N1a.…Notes Engine.js:80,177
 *                                (PID 'ntsngn')
 *   scratchPerChatPrefix      ←→ src-runtime-base/3N1a.…Notes Engine.js:81,178
 *   navigatorPerChatPrefix    ←→ src-runtime-base/3V1a.…Navigator Engine.js:22,27,84
 *                                (PID 'nvgngn')
 *   contextMeta               ←→ src-runtime-base/3W1a.…Context Engine.js:37
 *   contextItemsPerChatPrefix ←→ src-runtime-base/3W1a.…Context Engine.js:38
 *   contextUiPerChatPrefix    ←→ src-runtime-base/3W1a.…Context Engine.js:39
 *   contextHistoryPerChatPrefix ←→ src-runtime-base/3W1a.…Context Engine.js:40
 *   capturePrefix             ←→ src-runtime-base/3X1a.…Capture Engine.js:20
 *   finderUiPerChatPrefix     ←→ src-runtime-base/3Y2a.…Finder.js:59
 *
 *   panelBgChanged            ←→ src-runtime-base/3A1a.…Dock Panel.js:79
 *   inlineHighlightsChanged   ←→ event name observed in native engines & S3H1a
 *   bookmarksChanged          ←→ event name observed in 3B1a/3B2a
 *   notesChanged              ←→ event name observed in 3N1a/3N2a
 *   navigatorChanged          ←→ event name observed in 3V1a/3V2a
 *   contextChanged            ←→ event name observed in 3W1a/3W2a
 *   captureChanged            ←→ event name observed in 3X1a/3X2a
 *   messageRemounted          ←→ event name observed across native runtime
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency guard — script may be re-included during dev hot reload. */
  if (H2O.Studio.DockKeys && H2O.Studio.DockEvents && H2O.Studio.DockKeyFor) {
    return;
  }

  /* ── Storage keys (canonical native string values, Studio-local copy) ── */
  const DockKeys = Object.freeze({
    panelState:                  'h2o:prm:cgx:dckpnl:state:panel:v1',
    panelStateLegacy:            'ho_hl_panel_state_v1',
    highlightsCanonV3:           'h2o:prm:cgx:nlnhghlghtr:state:inline_highlights:v3',
    bookmarksPerChatPrefix:      'h2o:prm:cgx:bkmrksngne:state:bookmarks_',
    notesPerChatPrefix:          'h2o:prm:cgx:ntsngn:store:notes:v1:',
    scratchPerChatPrefix:        'h2o:prm:cgx:ntsngn:store:scratch:v1:',
    navigatorPerChatPrefix:      'h2o:prm:cgx:nvgngn:state:navigator:v1:',
    contextMeta:                 'h2o:prm:cgx:ctxeng:meta:v1',
    contextItemsPerChatPrefix:   'h2o:prm:cgx:ctxeng:items:v1:',
    contextUiPerChatPrefix:      'h2o:prm:cgx:ctxeng:ui:v1:',
    contextHistoryPerChatPrefix: 'h2o:prm:cgx:ctxeng:history:v1:',
    capturePrefix:               'h2o:prm:cgx:capture',
    finderUiPerChatPrefix:       'h2o:prm:cgx:finder:ui:v1:',
  });

  /* ── Event names (canonical native event identifiers) ─────────────── */
  const DockEvents = Object.freeze({
    panelBgChanged:          'h2o.ev:prm:cgx:dckpnl:bg:changed:v1',
    inlineHighlightsChanged: 'h2o:inline:changed',
    bookmarksChanged:        'h2o:bookmarks:changed',
    notesChanged:            'h2o:notes:changed',
    navigatorChanged:        'h2o:navigator:changed',
    contextChanged:          'h2o:context:changed',
    captureChanged:          'h2o:capture:changed',
    messageRemounted:        'h2o:message:remounted',
  });

  /* ── Read-only per-chat key builders ───────────────────────────────────
   * Each helper only concatenates strings. No storage reads or writes.
   *
   * Fallback sentinels match the native engines verbatim so a missing
   * chatId produces the same key on Studio as on native:
   *   - 'unknown' is used by 3N1a, 3V1a, 3W1a (notes/scratch/navigator/context)
   *   - 'default' is used by 3Y2a (finder UI)
   *   - Bookmarks engine 3B1a:145 does not show an explicit fallback at
   *     that line; 'unknown' is chosen here as the safe default.
   */
  function safeId(chatId, fallback) {
    return String(chatId == null || chatId === '' ? fallback : chatId);
  }

  const DockKeyFor = Object.freeze({
    bookmarkKey:       function (chatId) { return DockKeys.bookmarksPerChatPrefix      + safeId(chatId, 'unknown') + ':v1'; },
    notesKey:          function (chatId) { return DockKeys.notesPerChatPrefix          + safeId(chatId, 'unknown'); },
    scratchKey:        function (chatId) { return DockKeys.scratchPerChatPrefix        + safeId(chatId, 'unknown'); },
    navigatorKey:      function (chatId) { return DockKeys.navigatorPerChatPrefix      + safeId(chatId, 'unknown'); },
    contextItemsKey:   function (chatId) { return DockKeys.contextItemsPerChatPrefix   + safeId(chatId, 'unknown'); },
    contextUiKey:      function (chatId) { return DockKeys.contextUiPerChatPrefix      + safeId(chatId, 'unknown'); },
    contextHistoryKey: function (chatId) { return DockKeys.contextHistoryPerChatPrefix + safeId(chatId, 'unknown'); },
    finderUiKey:       function (chatId) { return DockKeys.finderUiPerChatPrefix       + safeId(chatId, 'default'); },
  });

  /* ── Attach to globals (no side effects beyond these three names) ── */
  H2O.Studio.DockKeys = DockKeys;
  H2O.Studio.DockEvents = DockEvents;
  H2O.Studio.DockKeyFor = DockKeyFor;
})(globalThis);
