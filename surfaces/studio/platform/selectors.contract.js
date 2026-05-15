/* H2O Studio Platform — Selectors Contract
 *
 * Single source of truth for the ChatGPT-compatible data-attribute selectors
 * used by Studio's reader and decoration engines (MiniMap, Highlights, Wash,
 * Quote Tracker, Answer Numbers, Timestamps, etc.).
 *
 * Studio's replay DOM is shaped with these attributes for visual parity with
 * the live ChatGPT page. Centralizing the constants means that if ChatGPT
 * renames an attribute, the change is made here in one place — feature code
 * never embeds literal selector strings.
 *
 * See: surfaces/studio/STUDIO_CAPTURE_BOUNDARY.md — "Visual parity, not DOM
 * coupling".
 *
 * NOTE (intentional): this patch establishes the contract; existing literal
 * selectors in S1A1b, S1A2a, S2Z1a, S3H1a etc. are not yet migrated. New
 * code uses these constants; existing literals are paid down opportunistically.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  if (H2O.Studio.SELECTORS && H2O.Studio.SELECTORS.__installed) {
    return;
  }

  /* CSS attribute escaping: minimal, sufficient for ChatGPT-style IDs.
   * Quotes the value to handle ids with non-trivial characters safely. */
  function escAttr(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  var ATTR = {
    ROLE: 'data-message-author-role',
    MESSAGE_ID: 'data-message-id',
    TURN_ID: 'data-turn-id',
    TESTID: 'data-testid',
    /* Legacy / alternate attribute names some pages have used. */
    ROLE_LEGACY_AUTHOR: 'data-author-role',
    ROLE_LEGACY_ROLE: 'data-role',
    /* H2O-internal attributes layered onto the replay DOM. */
    CGXUI: 'data-cgxui',
    CGXUI_UID: 'data-cgxui-uid',
    CGXUI_UNMOUNTED: 'data-cgxui-unmounted',
  };

  var TESTIDS = {
    CONVERSATION_TURN: 'conversation-turn',
    CONVERSATION_TURNS: 'conversation-turns',
    COPY_TURN_ACTION: 'copy-turn-action-button',
  };

  var ROLES = { ASSISTANT: 'assistant', USER: 'user', SYSTEM: 'system', TOOL: 'tool' };

  /* Pre-composed selector strings for the most common feature-code queries. */
  var SEL = {
    /* Role-scoped turns. */
    assistantTurn: '[' + ATTR.ROLE + '="' + ROLES.ASSISTANT + '"]',
    userTurn: '[' + ATTR.ROLE + '="' + ROLES.USER + '"]',
    anyTurn: '[' + ATTR.ROLE + ']',
    assistantOrUser: '[' + ATTR.ROLE + '="' + ROLES.ASSISTANT + '"], [' + ATTR.ROLE + '="' + ROLES.USER + '"]',
    /* Testid-anchored containers. */
    conversationTurn: '[' + ATTR.TESTID + '="' + TESTIDS.CONVERSATION_TURN + '"]',
    conversationTurns: '[' + ATTR.TESTID + '="' + TESTIDS.CONVERSATION_TURNS + '"]',
    copyTurnAction: '[' + ATTR.TESTID + '="' + TESTIDS.COPY_TURN_ACTION + '"]',
    /* Loose turn-host union that also matches `conversation-turn-<n>` testids
     * via a prefix-match clause. Use when discovering turn hosts where the
     * testid may be either exact `conversation-turn` or numbered. Repeated
     * verbatim in MiniMap Core/Engine and Turn Title Bar. */
    conversationTurnLoose:
      '[' + ATTR.TESTID + '="' + TESTIDS.CONVERSATION_TURN + '"], ' +
      '[' + ATTR.TESTID + '^="' + TESTIDS.CONVERSATION_TURN + '-"]',
    /* Broad "any turn marker" used when discovering message hosts; matches the
     * union historically used by MiniMap Core (S1A1b:1012). */
    anyMessageHost:
      '[' + ATTR.ROLE + '], ' +
      '[' + ATTR.ROLE_LEGACY_AUTHOR + '], ' +
      '[' + ATTR.ROLE_LEGACY_ROLE + '], ' +
      '[' + ATTR.MESSAGE_ID + '], ' +
      '[' + ATTR.TURN_ID + ']',
  };

  /* Functional selectors that need a value. Always return safely-escaped
   * attribute selectors — never interpolate untrusted strings into raw CSS. */
  var BY = {
    messageId: function (id) { return '[' + ATTR.MESSAGE_ID + '="' + escAttr(id) + '"]'; },
    turnId: function (id) { return '[' + ATTR.TURN_ID + '="' + escAttr(id) + '"]'; },
    cgxuiUid: function (uid) { return '[' + ATTR.CGXUI_UID + '="' + escAttr(uid) + '"]'; },
    role: function (role) { return '[' + ATTR.ROLE + '="' + escAttr(role) + '"]'; },
    testid: function (id) { return '[' + ATTR.TESTID + '="' + escAttr(id) + '"]'; },
  };

  H2O.Studio.SELECTORS = {
    __installed: true,
    __version: '0.1.0',
    ATTR: ATTR,
    TESTIDS: TESTIDS,
    ROLES: ROLES,
    sel: SEL,
    by: BY,
    /* Helper: returns true if `el` is a recognizable message host. Used
     * sparingly — most feature code should still query with sel.* directly. */
    isMessageHost: function (el) {
      if (!el || el.nodeType !== 1) return false;
      return !!(
        el.getAttribute(ATTR.ROLE) ||
        el.getAttribute(ATTR.ROLE_LEGACY_AUTHOR) ||
        el.getAttribute(ATTR.ROLE_LEGACY_ROLE) ||
        el.getAttribute(ATTR.MESSAGE_ID) ||
        el.getAttribute(ATTR.TURN_ID)
      );
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
