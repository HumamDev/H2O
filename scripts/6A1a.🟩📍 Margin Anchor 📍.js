// ==UserScript==
// @h2o-id             6a1a.margin.anchor
// @name               6A1a.🟩📍 Margin Anchor 📍
// @namespace          H2O.Premium.CGX.margin.anchor
// @author             HumamDev
// @version            1.5.12
// @revision           006
// @build              260326-181500
// @description        Margin Anchor (H2O): left margin anchors with one visible primary symbol per line, context-aware status ownership, compact popup controls, connector workflow on a dedicated lane, square-bracket support, inline connector statements, hover info badges, a dedicated Connectors tab, and context-aware connector attachments.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * H2O Module Standard — Contract (v2.0) 💧✅  — STAGE 1 (Mechanics only) 🧱⚙️
   * ========================================================================= */

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
  const W = window;
  const D = document;

  /* [DEFINE][META] Identity (LOCKED first) */
  const TOK = 'MA'; // Margin Anchor → MA

  // ✅ CANONICAL IDs (contracts)
  const PID  = 'mrgnnchr'; // canonical: Disk + Brain shelf key
  const SkID = 'mrnc';     // canonical: Skin/UI hooks (cgxui-*)

  // 🏷️ Identifier prefix (constants only; NOT disk/brain/skin)
  const CID = 'manchor';   // Margin Anchor → MANCHOR (constant naming only)

  // labels only
  const MODTAG = 'MAnchor';
  const SUITE  = 'prm';
  const HOST   = 'cgx';

  // ✅ OPTIONAL ALIASES (readability only — NOT new identities)
  const DsID = PID;        // Disk alias (same exact value)
  const BrID = PID;        // Brain alias (same exact value)

  // for identifier names only
  const PID_UP  = PID.toUpperCase();
  const CID_UP  = CID.toUpperCase(); // "manchor" -> "MANCHOR"

  /* [DEFINE][META] Runtime vault (Brain shelf) */
  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  MOD_OBJ.meta = MOD_OBJ.meta || { tok: TOK, pid: PID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };
  MOD_OBJ.api  = MOD_OBJ.api  || {}; // ✅ public surface (versioned sub-APIs live here)

  /* [DEFINE][META] Optional ecosystem registries (MODE B: warn + keep first) */
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS 📄🔒💧 ───────────────────────────── */

  /* [DEFINE][STORE] Namespace prefixes (Disk + Events) */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;    // no trailing :
  const NS_EV   = `h2o.ev:${SUITE}:${HOST}:${DsID}`; // no trailing :

  /* [DEFINE][DOM] Attribute NAMES (real attribute strings) */
  const ATTR_MSG_ID      = 'data-message-id';
  const ATTR_CGXUI       = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';
  const ATTR_MANCHOR_SYMBOL_THEME = `data-${SkID}-symbol-theme`;
  const ATTR_MANCHOR_SYMBOL_BOXED = `data-${SkID}-symbol-boxed`;
  const ATTR_MANCHOR_SYMBOL_PAGE_SIZE = `data-${SkID}-symbol-page-size`;
  const ATTR_MANCHOR_GUTTER_GUIDE = `data-${SkID}-gutter-guide`;

  /* [STORE][MAnchor] Keys (versioned) — CID-based identifiers, DsID-based values */
  const KEY_MANCHOR_STATE_PINS_V1 = `${NS_DISK}:state:pins:v1`;
  const KEY_MANCHOR_SYMBOLS_V1    = `${NS_DISK}:symbols:v1`;
  const KEY_MANCHOR_SYMBOL_COLORS_V1 = `${NS_DISK}:symbols_colors:v1`;
  const KEY_MANCHOR_SYMBOL_THEME_V1 = `${NS_DISK}:cfg:symbol-theme:v1`;
  const KEY_MANCHOR_SYMBOL_LIBRARY_V1 = `${NS_DISK}:cfg:symbol-library:v1`;
  const KEY_MANCHOR_SYMBOL_VARIANTS_V1 = `${NS_DISK}:cfg:symbol-variants:v1`;
  const KEY_MANCHOR_SYMBOL_BOXED_V1 = `${NS_DISK}:cfg:symbol-boxed:v1`;
  const KEY_MANCHOR_SYMBOL_PAGE_SIZE_V1 = `${NS_DISK}:cfg:symbol-page-size:v1`;
  const KEY_MANCHOR_GUTTER_GUIDE_V1 = `${NS_DISK}:cfg:gutter-guide:v1`;

  /* [API][MAnchor] Events (topics) — CID-based identifiers, DsID-based values */
  const EV_MANCHOR_READY_V1       = `${NS_EV}:ready:v1`;
  const EV_MANCHOR_NOTE_TOGGLE_V1 = `${NS_EV}:note:toggle:v1`;
  const EV_MANCHOR_NOTE_CLOSE_V1  = `${NS_EV}:note:close:v1`;
  const EV_MANCHOR_NOTE_STATE_V1  = `${NS_EV}:note:state:v1`; // notes -> core (open/closed)
  const EV_MANCHOR_STORE_CHANGED_V1 = `${NS_EV}:store:changed:v1`;
  const EV_MANCHOR_SYMBOLS_CHANGED = 'evt:h2o:margin:symbols:changed';
  const EV_MANCHOR_SYMBOL_THEME_CHANGED_V1 = `${NS_EV}:symbol-theme:changed:v1`;

  /* [UI][MAnchor] UI tokens (values are SkID-based) */
  const UI_MANCHOR_GUTTER = `${SkID}-gutter`;
  const UI_MANCHOR_GUTLANE = `${SkID}-gutlane`;
  const UI_MANCHOR_MARKS  = `${SkID}-marks`;
  const UI_MANCHOR_PINGRP = `${SkID}-pingrp`;
  const UI_MANCHOR_PINDOT = `${SkID}-pindot`;
  const UI_MANCHOR_LABEL  = `${SkID}-label`;
  const UI_MANCHOR_SYMBOL_GLYPH = `${SkID}-sym-glyph`;
  const UI_MANCHOR_RANGE  = `${SkID}-range`;
  const UI_MANCHOR_RANGE_SVG = `${SkID}-range-svg`;
  const UI_MANCHOR_RANGE_CENTER = `${SkID}-range-center`;
  const UI_MANCHOR_RANGE_STATUS = `${SkID}-range-status`;
  const UI_MANCHOR_RANGE_STATEMENT = `${SkID}-range-statement`;
  const UI_MANCHOR_RANGE_NOTE = `${SkID}-range-note`;
  const UI_MANCHOR_RANGE_TIP = `${SkID}-range-tip`;
  const UI_MANCHOR_INLINE_EDITOR = `${SkID}-inline-editor`;

  /* [UI][MAnchor] Popup tokens */
  const UI_MANCHOR_POP_TOP    = `${SkID}-pop-top`;
  const UI_MANCHOR_POP_TOPROW = `${SkID}-pop-toprow`;
  const UI_MANCHOR_POP_ACTDOT = `${SkID}-pop-actdot`;
  const UI_MANCHOR_POP        = `${SkID}-pop`;

  const UI_MANCHOR_POP_TITLE  = `${SkID}-pop-title`;
  const UI_MANCHOR_POP_BACK   = `${SkID}-pop-back`;
  const UI_MANCHOR_POP_BTN    = `${SkID}-pop-btn`;
  const UI_MANCHOR_POP_DOT    = `${SkID}-pop-dot`;
  const UI_MANCHOR_POP_LBL    = `${SkID}-pop-lbl`;
  const UI_MANCHOR_POP_NOTE   = `${SkID}-pop-note`;
  const UI_MANCHOR_POP_ROW    = `${SkID}-pop-row`;
  const UI_MANCHOR_POP_SMALL  = `${SkID}-pop-small`;

  const UI_MANCHOR_POP_HUB     = `${SkID}-pop-hub`;
  const UI_MANCHOR_POP_CHIPS   = `${SkID}-pop-chips`;
  const UI_MANCHOR_POP_CHIP    = `${SkID}-pop-chip`;
  const UI_MANCHOR_POP_GROUP   = `${SkID}-pop-group`;
  const UI_MANCHOR_POP_SUM     = `${SkID}-pop-sum`;
  const UI_MANCHOR_POP_ITEM    = `${SkID}-pop-item`;
  const UI_MANCHOR_POP_ITEMTXT = `${SkID}-pop-itemtxt`;
  const UI_MANCHOR_POP_META    = `${SkID}-pop-meta`;
  const UI_MANCHOR_POP_ICONS   = `${SkID}-pop-icons`;
  const UI_MANCHOR_POP_ICON    = `${SkID}-pop-icon`;
  const UI_MANCHOR_POP_EDITOR  = `${SkID}-pop-editor`;
  const UI_MANCHOR_POP_FIELD   = `${SkID}-pop-field`;
  const UI_MANCHOR_POP_SWROW   = `${SkID}-pop-swrow`;
  const UI_MANCHOR_POP_HELP    = `${SkID}-pop-help`;
  const UI_MANCHOR_POP_PALETTE = `${SkID}-pop-palette`;
  const UI_MANCHOR_POP_SWATCH  = `${SkID}-pop-swatch`;
  const UI_MANCHOR_POP_LIST    = `${SkID}-pop-list`;
  const UI_MANCHOR_POP_SYMICON = `${SkID}-pop-symicon`;

  const UI_MANCHOR_POP_TABS     = `${SkID}-pop-tabs`;
const UI_MANCHOR_POP_TAB      = `${SkID}-pop-tab`;
const UI_MANCHOR_POP_PANE     = `${SkID}-pop-pane`;
const UI_MANCHOR_POP_OVERVIEW = `${SkID}-pop-overview`;
const UI_MANCHOR_POP_KV       = `${SkID}-pop-kv`;
const UI_MANCHOR_POP_K        = `${SkID}-pop-k`;
const UI_MANCHOR_POP_V        = `${SkID}-pop-v`;

    const UI_MANCHOR_POP_SECTION  = `${SkID}-pop-section`;
  const UI_MANCHOR_POP_SECTITLE = `${SkID}-pop-sectitle`;
  const UI_MANCHOR_POP_INFO     = `${SkID}-pop-info`;
  const UI_STATE_SHINE          = 'shine';


  /* [UI][MAnchor] UI states */
  const UI_STATE_BOUND = 'bound';
  const UI_STATE_OPEN  = 'open';

  /* [CSS][MAnchor] Style id + vars (values are SkID-based) */
  const CSS_MANCHOR_STYLE_ID  = `cgxui-${SkID}-style`;
  const CSS_MANCHOR_VAR_COLOR = `--cgxui-${SkID}-color`;

  /* [DOM][MAnchor] Selectors registry */
  const SEL_MANCHOR_ASSISTANT  = '[data-message-author-role="assistant"]';
  const SEL_MANCHOR_TURN       = '[data-testid="conversation-turn"]';
  const SEL_MANCHOR_TURN_MSGID = `[${ATTR_MSG_ID}]`;

  const SEL_MANCHOR_CONTENT_MD    = '.markdown';
  const SEL_MANCHOR_CONTENT_PROSE = '.prose';

  const SEL_MANCHOR_POP          = `[${ATTR_CGXUI}="${UI_MANCHOR_POP}"]`;
  const SEL_MANCHOR_GUTTER_LAYER = `[${ATTR_CGXUI}="${UI_MANCHOR_GUTTER}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  const SEL_MANCHOR_MARKS_LAYER  = `[${ATTR_CGXUI}="${UI_MANCHOR_MARKS}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

  const SEL_MANCHOR_GUTTER_CHILD = `:scope > ${SEL_MANCHOR_GUTTER_LAYER}`;
  const SEL_MANCHOR_MARKS_CHILD  = `:scope > ${SEL_MANCHOR_MARKS_LAYER}`;
  /* [EV][SYS] DOM/Window event names (no raw strings in listeners) */
  const EV_DOC_MOUSEDOWN       = 'mousedown';
  const EV_DOC_AUXCLICK        = 'auxclick';
  const EV_DOC_KEYDOWN         = 'keydown';
  const EV_WIN_SCROLL          = 'scroll';
  const EV_WIN_RESIZE          = 'resize';
  const EV_DOM_CONTENT_LOADED  = 'DOMContentLoaded';
  const EV_CHUB_READY_V1       = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';


  /* [CFG][MAnchor] Config knobs */
  const CFG_MANCHOR = {
    AUTO_START: true,

    GUTTER_W_PX: 100,
    GUTTER_GAP_PX: 10,
    GUTTER_SHIFT_X_PX: -100,
    MARKS_SHIFT_X_PX: -100,
    GUTTER_Z: 8,

    PIN_Z: 9,
    PIN_SIZE_PX: 10,
    PIN_HIT_PX: 18,

    RANGE_BRACE_W_PX: 28,
    RANGE_BRACE_MIN_H_PX: 30,
    RANGE_BRACE_STROKE_PX: 2.35,
    RANGE_BRACE_TIP_SIZE_PX: 11,
    RANGE_BRACE_COLOR: '#cbd5e1',
    RANGE_BRACE_LANE_ID: 'range',
    STATEMENT_MAX_CHARS: 150,
    STATEMENT_WRAP_WORDS: 4,

    NOTE_DEFAULT_COLOR: '#ffd24a',
    NOTE_COLORS: ['#ffd24a', '#86efac', '#fda4af', '#93c5fd', '#c4b5fd', '#ffffff'],

    FP_RADIUS: 24,

    POPUP_Z: 999999,
    POPUP_GAP_PX: 10,
    GUTTER_MIDDLE_DELAY_MS: 260,
    GUTTER_DOUBLE_MIDDLE_MS: 280,
    GUTTER_DOUBLE_MIDDLE_SLOP_PX: 18,

    ENABLE_TAGS: true,
    ENABLE_LINKS: true,
    ENABLE_ASKQUOTE: true,

    REBUILD_THROTTLE_MS: 80,
    MAX_PINS_PER_MSG: 300
  };

  const MANCHOR_SYMBOL_THEME_DEFAULT = 'aviation';
  const MANCHOR_SYMBOL_THEMES = Object.freeze([
    Object.freeze({
      id: 'glass',
      title: 'Glass Jewel',
      subtitle: 'Polished translucent shell',
      preview: Object.freeze(['arrow', 'flag', 'bolt']),
    }),
    Object.freeze({
      id: 'aviation',
      title: 'Matte Aviation',
      subtitle: 'Dark titanium instrument chip',
      preview: Object.freeze(['arrow', 'flag', 'bolt']),
    }),
    Object.freeze({
      id: 'neon',
      title: 'Minimal Neon',
      subtitle: 'Sharp dark shell with cool glow',
      preview: Object.freeze(['arrow', 'flag', 'bolt']),
    }),
  ]);
  const MANCHOR_SYMBOL_BOX_MODES = Object.freeze([
    Object.freeze({
      id: 'boxed',
      title: 'Boxed',
      subtitle: 'Material shell on',
      boxed: true,
      preview: Object.freeze(['arrow', 'check', 'bolt']),
    }),
    Object.freeze({
      id: 'plain',
      title: 'No Box',
      subtitle: 'Icon-only rendering',
      boxed: false,
      preview: Object.freeze(['arrow', 'check', 'bolt']),
    }),
  ]);
  const MANCHOR_SYMBOL_PAGE_SIZE_DEFAULT = 'large';
  const MANCHOR_SYMBOL_PAGE_SIZES = Object.freeze([
    Object.freeze({
      id: 'compact',
      title: 'Compact',
      subtitle: 'Tighter page symbol',
      padAdjust: 0.8,
      preview: Object.freeze(['arrow', 'flag', 'bolt']),
    }),
    Object.freeze({
      id: 'standard',
      title: 'Standard',
      subtitle: 'Balanced live size',
      padAdjust: 1.55,
      preview: Object.freeze(['arrow', 'flag', 'bolt']),
    }),
    Object.freeze({
      id: 'large',
      title: 'Large',
      subtitle: 'Bigger icon in-page',
      padAdjust: 2.15,
      preview: Object.freeze(['arrow', 'flag', 'bolt']),
    }),
    Object.freeze({
      id: 'xlarge',
      title: 'XL',
      subtitle: 'Maximum live emphasis',
      padAdjust: 2.7,
      preview: Object.freeze(['arrow', 'flag', 'bolt']),
    }),
  ]);
  const MANCHOR_GUTTER_GUIDE_DEFAULT = 'off';
  const MANCHOR_GUTTER_GUIDES = Object.freeze([
    Object.freeze({
      id: 'off',
      title: 'Off',
      subtitle: 'Hide gutter dots',
    }),
    Object.freeze({
      id: 'mono',
      title: 'Dots',
      subtitle: 'Neutral gutter guides',
    }),
    Object.freeze({
      id: 'lanes',
      title: 'Lane Colors',
      subtitle: 'Color each gutter lane',
    }),
  ]);
    const MANCHOR_GUTTER_LANES = Object.freeze([
    // Defined natively from gutter RIGHT edge:
    // primary = 30% from right (closest to answer)
    // range   = 45% from right (dedicated brace lane)
    // external = 60% from right
    Object.freeze({ id: 'primary', right: '30%' }),
    Object.freeze({ id: 'range', right: '45%' }),
    Object.freeze({ id: 'external', right: '60%' }),
  ]);
  const MANCHOR_GUTTER_LANE_MAP = new Map(MANCHOR_GUTTER_LANES.map((lane) => [lane.id, lane]));
  const MANCHOR_SYMBOL_THEME_IDS = new Set(MANCHOR_SYMBOL_THEMES.map((item) => item.id));
  const MANCHOR_SYMBOL_CORE_IDS = Object.freeze(['pin', 'arrow', 'check', 'cross', 'flag', 'star', 'bolt']);
  const MANCHOR_SYMBOL_EXPANSION_IDS = Object.freeze(['note', 'question', 'bookmark', 'link', 'quote', 'lock', 'clock']);

  const MANCHOR_SYMBOL_LIBRARY_DEFAULT = Object.freeze(MANCHOR_SYMBOL_CORE_IDS.slice());
  const MANCHOR_SYMBOL_PREVIEW_COLORS = Object.freeze(['#38bdf8', '#f59e0b', '#a855f7']);
  const MANCHOR_SVG_VIEWBOX = '0 0 24 24';
  const SVG_STROKE = 'stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const SVG_STROKE_THIN = 'stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const SVG_FILL = 'fill="currentColor"';
  const MANCHOR_SYMBOLS = Object.freeze([
        Object.freeze({
      id: 'pin',
      title: 'Pin',
      group: 'core',
      defaultColor: '#22d3ee',
      legacySymbol: 'pin',
      legacyAliases: Object.freeze(['pin', '📍', 'marker']),
      variants: Object.freeze([
        Object.freeze({ id: 'pin_a', title: 'Classic locator', body: `<path ${SVG_FILL} d="M12 3.9c-2.8 0-5 2.2-5 5 0 1.8.9 3.4 2.3 4.3v6.9l2.7-1.8 2.7 1.8v-6.9c1.4-.9 2.3-2.5 2.3-4.3 0-2.8-2.2-5-5-5Z"/><circle ${SVG_FILL} cx="12" cy="8.9" r="1.7"/>` }),
        Object.freeze({ id: 'pin_b', title: 'Drop marker', body: `<path ${SVG_FILL} d="M12 4.1a4.7 4.7 0 0 0-4.7 4.7c0 1.7.9 3.2 2.1 4v7.1l2.6-1.8 2.6 1.8v-7.1a4.69 4.69 0 0 0 2.1-4A4.7 4.7 0 0 0 12 4.1Z"/><circle ${SVG_FILL} cx="12" cy="8.8" r="1.45"/>` }),
        Object.freeze({ id: 'pin_c', title: 'Needle pin', body: `<path ${SVG_STROKE_THIN} d="M12 4.9a4.2 4.2 0 0 1 4.2 4.2c0 1.5-.8 2.8-2 3.6V19l-2.2-1.5L9.8 19v-6.3a4.2 4.2 0 0 1-2-3.6A4.2 4.2 0 0 1 12 4.9Z"/><circle ${SVG_FILL} cx="12" cy="9" r="1.3"/>` }),
      ]),
    }),
        Object.freeze({
      id: 'note',
      title: 'Note',
      group: 'expansion',
      defaultColor: '#ffd24a',
      legacySymbol: 'note',
      legacyAliases: Object.freeze(['note', 'sticky', 'memo', '📝']),
      variants: Object.freeze([
        Object.freeze({ id: 'note_a', title: 'Sticky sheet', body: `<path ${SVG_FILL} d="M6.4 4.7h9.8l2.4 2.4v12.2H6.4z"/><path ${SVG_FILL} d="M16.2 4.7v2.8H19z"/><path ${SVG_STROKE_THIN} d="M8.7 10.1h7"/><path ${SVG_STROKE_THIN} d="M8.7 13h6.2"/><path ${SVG_STROKE_THIN} d="M8.7 15.9h4.7"/>` }),
        Object.freeze({ id: 'note_b', title: 'Folded memo', body: `<path ${SVG_FILL} d="M7.1 4.8h8.6l2.2 2.2v12.1H7.1z"/><path ${SVG_FILL} d="M15.7 4.8V7h2.2z"/><path ${SVG_STROKE_THIN} d="M9.1 10.1h6.1"/><path ${SVG_STROKE_THIN} d="M9.1 12.8h5.4"/><path ${SVG_STROKE_THIN} d="M9.1 15.5h4.1"/>` }),
        Object.freeze({ id: 'note_c', title: 'Pinned memo', body: `<rect ${SVG_FILL} x="6.6" y="5" width="10.8" height="13.6" rx="1.5"/><path ${SVG_FILL} d="M15.1 5v2.5h2.3z"/><path ${SVG_STROKE_THIN} d="M8.9 10.1h6.2"/><path ${SVG_STROKE_THIN} d="M8.9 12.9h5.4"/><path ${SVG_STROKE_THIN} d="M8.9 15.7h3.8"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'arrow',
      title: 'Arrow',
      group: 'core',
      defaultColor: '#38bdf8',
      legacySymbol: '➡︎',
      legacyAliases: Object.freeze(['➡︎', '➡', '→']),
      variants: Object.freeze([
        Object.freeze({ id: 'arrow_a', title: 'Beveled block', body: `<path ${SVG_FILL} d="M4.4 10.9h8.5V7.7l6.7 4.3-6.7 4.3v-3.2H4.4z"/>` }),
        Object.freeze({ id: 'arrow_b', title: 'Slim cockpit', body: `<path ${SVG_STROKE} d="M4.6 12h11.2"/><path ${SVG_STROKE} d="M11.9 7.4 18.4 12l-6.5 4.6"/>` }),
        Object.freeze({ id: 'arrow_c', title: 'Split-tail', body: `<path ${SVG_STROKE} d="M4.8 12h11.1"/><path ${SVG_STROKE} d="M12.6 8.2 18.2 12l-5.6 3.8"/><path ${SVG_STROKE_THIN} d="M4.9 12 7.9 9.3"/><path ${SVG_STROKE_THIN} d="M4.9 12 7.9 14.7"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'check',
      title: 'Check',
      group: 'core',
      defaultColor: '#22c55e',
      legacySymbol: '⩗',
      legacyAliases: Object.freeze(['⩗', '✓', '✔']),
      variants: Object.freeze([
        Object.freeze({ id: 'check_a', title: 'Precision tick', body: `<path ${SVG_STROKE} d="M5.7 12.7 9.3 16.2 18.6 7.6"/>` }),
        Object.freeze({ id: 'check_b', title: 'Inset approval', body: `<path ${SVG_STROKE} d="M6.4 12.8 9.4 15.8 13 12.2 17.6 7.8"/>` }),
        Object.freeze({ id: 'check_c', title: 'Angular verification', body: `<path ${SVG_STROKE} d="M5.6 13.2 9.1 16.4 12.1 13.5 18.4 7.4"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'cross',
      title: 'Cross',
      group: 'core',
      defaultColor: '#ef4444',
      legacySymbol: '✕',
      legacyAliases: Object.freeze(['✕', '✖', '×']),
      variants: Object.freeze([
        Object.freeze({ id: 'cross_a', title: 'Geometric cancel', body: `<path ${SVG_STROKE} d="m7 7 10 10"/><path ${SVG_STROKE} d="M17 7 7 17"/>` }),
        Object.freeze({ id: 'cross_b', title: 'Narrow diagonal', body: `<path ${SVG_STROKE_THIN} d="m8.1 6.9 7.8 10.2"/><path ${SVG_STROKE_THIN} d="M15.9 6.9 8.1 17.1"/>` }),
        Object.freeze({ id: 'cross_c', title: 'Split-cut', body: `<path ${SVG_STROKE} d="m7.2 7.2 3.8 3.8"/><path ${SVG_STROKE} d="m13 13 3.8 3.8"/><path ${SVG_STROKE} d="M16.8 7.2 13 11"/><path ${SVG_STROKE} d="M11 13 7.2 16.8"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'flag',
      title: 'Flag',
      group: 'core',
      defaultColor: '#f59e0b',
      legacySymbol: '⚑',
      legacyAliases: Object.freeze(['⚑']),
      variants: Object.freeze([
        Object.freeze({ id: 'flag_a', title: 'Compact pennant', body: `<path ${SVG_FILL} d="M5.4 4.2h1.7v15.6H5.4z"/><path ${SVG_FILL} d="M8.2 5.2h9.1l-2.3 3.1 2.3 3H8.2z"/>` }),
        Object.freeze({ id: 'flag_b', title: 'Locator flag', body: `<path ${SVG_FILL} d="M5.6 4h1.6v16H5.6z"/><path ${SVG_FILL} d="m8.4 5.2 8.9.1-3.2 3.7 3.2 3.7-8.9-.1z"/>` }),
        Object.freeze({ id: 'flag_c', title: 'Slim signal', body: `<path ${SVG_FILL} d="M5.8 4.1h1.5v15.8H5.8z"/><path ${SVG_FILL} d="M8.3 5h7.4l-1.9 2.7 1.9 2.7H8.3z"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'star',
      title: 'Star',
      group: 'core',
      defaultColor: '#facc15',
      legacySymbol: '★',
      legacyAliases: Object.freeze(['★']),
      variants: Object.freeze([
        Object.freeze({ id: 'star_a', title: 'Refined 5-point', body: `<path ${SVG_FILL} d="m12 3.8 2.4 4.9 5.5.8-4 4 1 5.5-4.9-2.5L7.1 19l1-5.5-4-4 5.5-.8z"/>` }),
        Object.freeze({ id: 'star_b', title: 'Premium spark', body: `<path ${SVG_STROKE} d="M12 4.5v5.2"/><path ${SVG_STROKE} d="M12 14.3v5.2"/><path ${SVG_STROKE} d="M4.5 12h5.2"/><path ${SVG_STROKE} d="M14.3 12h5.2"/><path ${SVG_STROKE_THIN} d="m6.9 6.9 3 3"/><path ${SVG_STROKE_THIN} d="m14.1 14.1 3 3"/><path ${SVG_STROKE_THIN} d="m17.1 6.9-3 3"/><path ${SVG_STROKE_THIN} d="m9.9 14.1-3 3"/>` }),
        Object.freeze({ id: 'star_c', title: 'Badge star', body: `<circle ${SVG_STROKE_THIN} cx="12" cy="12" r="6.8"/><path ${SVG_FILL} d="m12 7.8 1.3 2.6 2.9.4-2.1 2.1.5 2.8-2.6-1.4-2.6 1.4.5-2.8-2.1-2.1 2.9-.4z"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'bolt',
      title: 'Bolt',
      group: 'core',
      defaultColor: '#a855f7',
      legacySymbol: '⚡',
      legacyAliases: Object.freeze(['⚡']),
      variants: Object.freeze([
        Object.freeze({ id: 'bolt_a', title: 'Single-cut', body: `<path ${SVG_FILL} d="M13.8 3.8 6.9 12h4.6l-1.2 8.2L17.1 12h-4.6z"/>` }),
        Object.freeze({ id: 'bolt_b', title: 'Narrow energy', body: `<path ${SVG_FILL} d="M13.1 4.8 8.7 11.8h3.1L11 19.2l4.4-7h-3.1z"/>` }),
        Object.freeze({ id: 'bolt_c', title: 'Split flash', body: `<path ${SVG_FILL} d="M14.1 4.4 9 10.9h3.3L10 19.4l5-6.4h-3.3z"/><path ${SVG_FILL} d="M13.1 13.1 11.6 20l5-6.9z"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'question',
      title: 'Question',
      group: 'expansion',
      defaultColor: '#a78bfa',
      legacySymbol: '?',
      legacyAliases: Object.freeze(['?', 'question']),
      variants: Object.freeze([
        Object.freeze({ id: 'question_a', title: 'Hooked square-dot', body: `<path ${SVG_STROKE} d="M8.8 8.8c0-2 1.6-3.2 3.7-3.2 2.3 0 3.7 1.2 3.7 3.1 0 1.5-.8 2.5-2.4 3.4-1.4.8-2.2 1.6-2.2 3.3"/><rect ${SVG_FILL} x="10.9" y="16.7" width="2.4" height="2.4" rx=".35"/>` }),
        Object.freeze({ id: 'question_b', title: 'Upright narrow', body: `<path ${SVG_STROKE_THIN} d="M9.2 8.4c0-1.8 1.4-3 3.4-3 2 0 3.3 1.1 3.3 2.9 0 1.4-.7 2.2-2.1 3-1.2.7-2 1.5-2 3.1"/><circle ${SVG_FILL} cx="12" cy="18.1" r="1.2"/>` }),
        Object.freeze({ id: 'question_c', title: 'Framed inquiry', body: `<rect ${SVG_STROKE_THIN} x="5.2" y="4.8" width="13.6" height="14.4" rx="3.1"/><path ${SVG_STROKE_THIN} d="M9.3 9c0-1.6 1.2-2.7 3-2.7 1.9 0 3 1 3 2.6 0 1.2-.6 2-1.8 2.7-1.1.7-1.8 1.4-1.8 2.8"/><circle ${SVG_FILL} cx="12.1" cy="17.2" r="1"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'bookmark',
      title: 'Bookmark',
      group: 'expansion',
      defaultColor: '#fb7185',
      legacySymbol: 'bookmark',
      legacyAliases: Object.freeze(['bookmark']),
      variants: Object.freeze([
        Object.freeze({ id: 'bookmark_a', title: 'Tapered ribbon', body: `<path ${SVG_FILL} d="M8 4.8h8v13.6L12 15.7 8 18.4z"/>` }),
        Object.freeze({ id: 'bookmark_b', title: 'Inset notch', body: `<path ${SVG_STROKE_THIN} d="M8.2 5.1h7.6v13.1l-3.8-2.4-3.8 2.4z"/>` }),
        Object.freeze({ id: 'bookmark_c', title: 'Angular save tab', body: `<path ${SVG_FILL} d="M8.8 4.8h6.5l1 1.1v12.3L12 15.6l-4.2 2.6V5.9z"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'link',
      title: 'Link',
      group: 'expansion',
      defaultColor: '#22d3ee',
      legacySymbol: 'link',
      legacyAliases: Object.freeze(['link', '🔗']),
      variants: Object.freeze([
        Object.freeze({ id: 'link_a', title: 'Compact chain pair', body: `<path ${SVG_STROKE_THIN} d="m9.3 14.7-1.7 1.7a3.1 3.1 0 1 1-4.4-4.4l2.6-2.6a3.1 3.1 0 0 1 4.4 4.4l-.8.8"/><path ${SVG_STROKE_THIN} d="m14.7 9.3 1.7-1.7a3.1 3.1 0 1 1 4.4 4.4l-2.6 2.6a3.1 3.1 0 0 1-4.4-4.4l.8-.8"/><path ${SVG_STROKE_THIN} d="m9.5 14.5 5-5"/>` }),
        Object.freeze({ id: 'link_b', title: 'Flattened chain', body: `<path ${SVG_STROKE_THIN} d="m8.9 14.2-1.8 1.8a2.9 2.9 0 0 1-4.1-4.1l2.2-2.2a2.9 2.9 0 0 1 4.1 0"/><path ${SVG_STROKE_THIN} d="m15.1 9.8 1.8-1.8a2.9 2.9 0 1 1 4.1 4.1l-2.2 2.2a2.9 2.9 0 0 1-4.1 0"/><path ${SVG_STROKE_THIN} d="M9.2 14.8h5.6"/>` }),
        Object.freeze({ id: 'link_c', title: 'Technical bridge', body: `<path ${SVG_STROKE_THIN} d="m7.9 14.3-2 2a2.7 2.7 0 1 1-3.8-3.8l2.1-2.1a2.7 2.7 0 0 1 3.8 0"/><path ${SVG_STROKE_THIN} d="m16.1 9.7 2-2a2.7 2.7 0 1 1 3.8 3.8l-2.1 2.1a2.7 2.7 0 0 1-3.8 0"/><path ${SVG_STROKE_THIN} d="M9.2 12h5.6"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'quote',
      title: 'Quote',
      group: 'expansion',
      defaultColor: '#fbbf24',
      legacySymbol: 'quote',
      legacyAliases: Object.freeze(['quote']),
      variants: Object.freeze([
        Object.freeze({ id: 'quote_a', title: 'Twin quote marks', body: `<path ${SVG_FILL} d="M6.7 9.3c0-2 1.1-3.5 3.1-4.8L11 6c-1 .8-1.5 1.6-1.7 2.6h2v5.8H6.7zm6.8 0c0-2 1.1-3.5 3.1-4.8L17.8 6c-1 .8-1.5 1.6-1.7 2.6h2v5.8h-4.6z"/>` }),
        Object.freeze({ id: 'quote_b', title: 'Framed quote marks', body: `<rect ${SVG_STROKE_THIN} x="4.9" y="5.2" width="14.2" height="13.6" rx="3"/><path ${SVG_FILL} d="M7.9 10.2c0-1.4.8-2.6 2.1-3.5l.9 1.2c-.6.5-.9 1-.9 1.6h1.4v4H7.9zm5 0c0-1.4.8-2.6 2.1-3.5l.9 1.2c-.6.5-.9 1-.9 1.6h1.4v4h-3.5z"/>` }),
        Object.freeze({ id: 'quote_c', title: 'Offset quotation pair', body: `<path ${SVG_FILL} d="M7.2 9.2c0-1.7 1-3 2.6-4.1l1 1.3c-.8.6-1.2 1.2-1.3 2h1.7v5.1H7.2zm7 1.1c0-1.7 1-3 2.6-4.1l1 1.3c-.8.6-1.2 1.2-1.3 2h1.7v5.1h-4z"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'lock',
      title: 'Lock',
      group: 'expansion',
      defaultColor: '#cbd5e1',
      legacySymbol: 'lock',
      legacyAliases: Object.freeze(['lock']),
      variants: Object.freeze([
        Object.freeze({ id: 'lock_a', title: 'Flat-shackle', body: `<rect ${SVG_STROKE} x="6.7" y="10.8" width="10.6" height="8.3" rx="2.1"/><path ${SVG_STROKE} d="M8.8 10.8V8.5a3.2 3.2 0 0 1 6.4 0v2.3"/>` }),
        Object.freeze({ id: 'lock_b', title: 'Inset body', body: `<rect ${SVG_FILL} x="7" y="11" width="10" height="7.8" rx="1.9"/><path ${SVG_STROKE_THIN} d="M8.8 11V8.5a3.2 3.2 0 0 1 6.4 0V11"/><path ${SVG_STROKE_THIN} d="M12 14.1v1.9"/>` }),
        Object.freeze({ id: 'lock_c', title: 'Narrow security', body: `<rect ${SVG_STROKE_THIN} x="7.8" y="10.9" width="8.4" height="8.6" rx="1.9"/><path ${SVG_STROKE_THIN} d="M9.5 10.9V8.2a2.5 2.5 0 1 1 5 0v2.7"/><circle ${SVG_FILL} cx="12" cy="15" r="1.1"/>` }),
      ]),
    }),
    Object.freeze({
      id: 'clock',
      title: 'Clock',
      group: 'expansion',
      defaultColor: '#60a5fa',
      legacySymbol: 'clock',
      legacyAliases: Object.freeze(['clock']),
      variants: Object.freeze([
        Object.freeze({ id: 'clock_a', title: 'Minimal dial', body: `<circle ${SVG_STROKE_THIN} cx="12" cy="12" r="7.2"/><path ${SVG_STROKE_THIN} d="M12 12V8.4"/><path ${SVG_STROKE_THIN} d="m12 12 3 1.8"/>` }),
        Object.freeze({ id: 'clock_b', title: 'Ring clock', body: `<circle ${SVG_STROKE_THIN} cx="12" cy="12" r="7.8"/><circle ${SVG_STROKE_THIN} cx="12" cy="12" r="5.6"/><path ${SVG_STROKE_THIN} d="M12 12V8.9"/><path ${SVG_STROKE_THIN} d="m12 12 2.6 2.1"/>` }),
        Object.freeze({ id: 'clock_c', title: 'Cockpit timer', body: `<circle ${SVG_STROKE_THIN} cx="12" cy="12" r="7.6"/><path ${SVG_STROKE_THIN} d="M12 6.5v1.4"/><path ${SVG_STROKE_THIN} d="m12 12 3.4-.8"/><path ${SVG_STROKE_THIN} d="M12 12V8.8"/><circle ${SVG_FILL} cx="12" cy="12" r="1"/>` }),
      ]),
    }),
  ]);
  const MANCHOR_SYMBOL_MAP = new Map(MANCHOR_SYMBOLS.map((item) => [item.id, item]));
  const MANCHOR_SYMBOL_IDS = Object.freeze(MANCHOR_SYMBOLS.map((item) => item.id));
  const MANCHOR_SYMBOL_ID_SET = new Set(MANCHOR_SYMBOL_IDS);
  const MANCHOR_SYMBOL_LEGACY_MAP = (() => {
    const out = new Map();
    const norm = (value) => String(value || '').trim().replace(/[\uFE0E\uFE0F]/g, '');
    for (const def of MANCHOR_SYMBOLS) {
      out.set(norm(def.id), def.id);
      out.set(norm(def.legacySymbol), def.id);
      for (const alias of (def.legacyAliases || [])) out.set(norm(alias), def.id);
    }
    return out;
  })();

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */
  const UTIL_storage = {
    getStr(key, fallback = null) {
      try { return localStorage.getItem(String(key)) ?? fallback; } catch { return fallback; }
    },
    setStr(key, val) {
      try { localStorage.setItem(String(key), String(val)); return true; } catch { return false; }
    },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj) {
      try { localStorage.setItem(String(key), JSON.stringify(obj)); return true; } catch { return false; }
    }
  };

  function STORE_MA_isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }

  function UTIL_uid() {
    return (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);
  }

  function STORE_MA_normalizeStore(raw) {
    const out = {};
    if (!STORE_MA_isObj(raw)) return out;

    for (const [msgId, bucketsRaw] of Object.entries(raw)) {
      if (!msgId) continue;

      const bucketsArr = Array.isArray(bucketsRaw)
        ? bucketsRaw
        : (STORE_MA_isObj(bucketsRaw) ? Object.values(bucketsRaw) : []);

      const byOff = new Map();

      for (const b0 of bucketsArr) {
        if (!b0) continue;

        const a0 = STORE_MA_isObj(b0.a) ? b0.a : (STORE_MA_isObj(b0) ? b0 : {});
        const off = Number(a0.off ?? b0.off ?? 0);
        const fp  = String(a0.fp ?? b0.fp ?? '');

        if (!Number.isFinite(off)) continue;

        let itemsRaw = b0.items ?? a0.items ?? [];
        if (STORE_MA_isObj(itemsRaw)) itemsRaw = Object.values(itemsRaw);
        if (!Array.isArray(itemsRaw)) itemsRaw = [];

        const items = [];
        for (const it0 of itemsRaw) {
          if (!STORE_MA_isObj(it0)) continue;
          const id = String(it0.id ?? UTIL_uid());
          const type = String(it0.type ?? '');
          if (!type) continue;

          const data = STORE_MA_isObj(it0.data) ? it0.data : {};
          const ui = STORE_MA_isObj(it0.ui) ? it0.ui : {};
          const ts = Number(it0.ts ?? Date.now());

          items.push({ id, type, data, ui, ts });
        }

        const prev = byOff.get(off);
        if (!prev) {
          byOff.set(off, { a: { off, fp }, items: items.slice() });
        } else {
          const seen = new Set(prev.items.map(x => x.id));
          for (const it of items) {
            if (!seen.has(it.id)) { prev.items.push(it); seen.add(it.id); }
          }
        }
      }

      out[msgId] = Array.from(byOff.values()).sort((x, y) => x.a.off - y.a.off);
    }
    return out;
  }

  function UTIL_noteKey(msgId, off) {
    return `${msgId}:${off}`;
  }

  function UTIL_registryExtend(regObj, additions, label) {
    for (const [k, v] of Object.entries(additions || {})) {
      if (regObj[k] != null) {
        try { console.warn(`[H2O][${label}] registry collision: ${k}`); } catch {}
        continue;
      }
      regObj[k] = v;
    }
  }

  function UTIL_getContentRoot(msgEl) {
    return msgEl.querySelector?.(SEL_MANCHOR_CONTENT_MD)
      || msgEl.querySelector?.(SEL_MANCHOR_CONTENT_PROSE)
      || msgEl;
  }

  function UTIL_getMsgId(msgEl) {
    if (!msgEl) return '';

    const direct =
      (msgEl.getAttribute?.(ATTR_MSG_ID) || msgEl.dataset?.messageId || msgEl.id || '').trim();
    if (direct) return direct;

    const holder =
      msgEl.closest?.(SEL_MANCHOR_TURN_MSGID) ||
      msgEl.closest?.(`${SEL_MANCHOR_TURN} ${SEL_MANCHOR_TURN_MSGID}`) ||
      msgEl.closest?.(SEL_MANCHOR_TURN) ||
      null;

    return (holder?.getAttribute?.(ATTR_MSG_ID) || holder?.dataset?.messageId || holder?.id || '').trim() || '';
  }

  function UTIL_caretRangeAtPoint(x, y) {
    if (D.caretRangeFromPoint) return D.caretRangeFromPoint(x, y);
    if (D.caretPositionFromPoint) {
      const pos = D.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const r = D.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.setEnd(pos.offsetNode, pos.offset);
      return r;
    }
    return null;
  }

  function UTIL_getTextNodes(root) {
    const out = [];
    const walker = D.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n?.nodeValue) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_ACCEPT;

        if (p.closest?.(SEL_MANCHOR_POP)) return NodeFilter.FILTER_REJECT;
        if (p.closest?.(SEL_MANCHOR_GUTTER_LAYER)) return NodeFilter.FILTER_REJECT;
        if (p.closest?.(SEL_MANCHOR_MARKS_LAYER)) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function UTIL_getFullText(root) {
    return UTIL_getTextNodes(root).map(n => n.nodeValue).join('');
  }

  function UTIL_rangeToOffset(root, range) {
    const nodes = UTIL_getTextNodes(root);
    let acc = 0;
    for (const tn of nodes) {
      if (tn === range.startContainer) return acc + range.startOffset;
      acc += tn.nodeValue.length;
    }
    return acc;
  }

  function UTIL_offsetToRange(root, off) {
    const nodes = UTIL_getTextNodes(root);
    let acc = 0;
    for (const tn of nodes) {
      const len = tn.nodeValue.length;
      if (off <= acc + len) {
        const r = D.createRange();
        const inner = Math.max(0, off - acc);
        const at = Math.min(inner, len);
        r.setStart(tn, at);
        r.setEnd(tn, at);
        return r;
      }
      acc += len;
    }
    const r = D.createRange();
    r.selectNodeContents(root);
    r.collapse(false);
    return r;
  }

  function UTIL_makeFingerprint(root, off) {
    const text = UTIL_getFullText(root);
    if (!text) return '';
    const a = Math.max(0, off - CFG_MANCHOR.FP_RADIUS);
    const b = Math.min(text.length, off + CFG_MANCHOR.FP_RADIUS);
    return text.slice(a, b);
  }

  function UTIL_computeAnchorFromClick(msgEl, clientX, clientY) {
    const contentRoot = UTIL_getContentRoot(msgEl);
    const cr = contentRoot.getBoundingClientRect();

    const x = Math.round(Math.min(cr.left + 90, cr.left + cr.width * 0.35));
    const y = Math.round(clientY);

    const caret = UTIL_caretRangeAtPoint(x, y);
    if (!caret) return null;

    const off = UTIL_rangeToOffset(contentRoot, caret);
    const fp = UTIL_makeFingerprint(contentRoot, off);
    return { off, fp };
  }

  function UTIL_anchorToY(msgEl, a) {
    const contentRoot = UTIL_getContentRoot(msgEl);
    const text = UTIL_getFullText(contentRoot);
    const n = text.length;

    let off = Math.max(0, Math.min(a?.off || 0, n));
    let off2 = Math.min(off + 1, n);

    if (off2 === off && off > 0) { off2 = off; off = off - 1; }

    const r = D.createRange();
    const r1 = UTIL_offsetToRange(contentRoot, off);
    const r2 = UTIL_offsetToRange(contentRoot, off2);

    r.setStart(r1.startContainer, r1.startOffset);
    r.setEnd(r2.startContainer, r2.startOffset);

    const rects = r.getClientRects();
    const rr = (rects && rects[0]) ? rects[0] : r.getBoundingClientRect();
    const mr = msgEl.getBoundingClientRect();

    if (!rr || !mr) return 10;
    const raw = Math.round((rr.top - mr.top) + 1);
    const h = (msgEl.scrollHeight || mr.height || 0);
    return Math.max(6, Math.min(h - 6, raw));
  }

  function UTIL_clampNumber(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function VIEW_MA_getLaneMeta(laneId) {
    const wanted = String(laneId || '').trim();
    return MANCHOR_GUTTER_LANE_MAP.get(wanted) || MANCHOR_GUTTER_LANE_MAP.get(CFG_MANCHOR.RANGE_BRACE_LANE_ID) || MANCHOR_GUTTER_LANES[0] || { id: 'primary', right: '30%' };
  }

  function CORE_MA_normalizeRangeBraceLane(raw) {
    return VIEW_MA_getLaneMeta(raw).id;
  }

  function CORE_MA_isRangeBraceItem(it) {
    return !!(it && it.type === 'range-brace');
  }

  function CORE_MA_getRangeBraceItems(items) {
    return (Array.isArray(items) ? items : []).filter(CORE_MA_isRangeBraceItem);
  }

  function CORE_MA_normalizeConnectorShape(raw) {
    return String(raw || '').trim().toLowerCase() === 'bracket' ? 'bracket' : 'brace';
  }

  function CORE_MA_getConnectorShapeLabel(raw) {
    return CORE_MA_normalizeConnectorShape(raw) === 'bracket' ? 'Bracket' : 'Brace';
  }

  function CORE_MA_clipStatementText(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, Number(CFG_MANCHOR.STATEMENT_MAX_CHARS) || 150);
  }

  function CORE_MA_wrapWordsForDisplay(raw, perLine = CFG_MANCHOR.STATEMENT_WRAP_WORDS) {
    const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const step = Math.max(1, Number(perLine) || 4);
    const lines = [];
    for (let i = 0; i < words.length; i += step) lines.push(words.slice(i, i + step).join(' '));
    return lines.join('\n');
  }

  function CORE_MA_getConnectorStatementText(src) {
    const raw = String(src?.ui?.statement || src?.data?.statement || src?.statement || src?.tipText || '').trim();
    return CORE_MA_clipStatementText(raw);
  }

  function CORE_MA_getConnectorNoteText(src) {
    return String(src?.ui?.noteText || src?.data?.noteText || src?.noteText || '').trim();
  }

  function CORE_MA_getConnectorDisplayMode(src) {
    if (CORE_MA_getConnectorStatementText(src)) return 'statement';
    if (CORE_MA_getConnectorNoteText(src)) return 'note';
    if (CORE_MA_getBraceTipStatusMeta(src)?.txt) return 'status';
    return '';
  }

  function CORE_MA_setBraceCenterPayload(msgEl, brace, payload = {}) {
    if (!brace?.id) return false;
    const startAnchor = { off: Number(brace.startOff || 0), fp: '' };
    const nextShape = CORE_MA_normalizeConnectorShape(payload.shape || brace.shape || 'brace');
    const statement = CORE_MA_clipStatementText(payload.statement);
    const noteText = String(payload.noteText || '').trim();
    const state = String(payload.state || '').trim();
    const label = String(payload.label || '').trim();
    const color = String(payload.color || '').trim();
    return CORE_MA_updateItem(msgEl, startAnchor, brace.id, {
      data: {
        shape: nextShape,
        statement: statement || '',
        noteText: noteText || '',
        tipState: state || '',
        tipLabel: state === 'custom' ? label : '',
        tipColor: state === 'custom' ? color : '',
        tipText: '',
      },
      ui: {
        shape: nextShape,
        statement: statement || '',
        noteText: noteText || '',
        tipState: state || '',
        tipLabel: state === 'custom' ? label : '',
        tipColor: state === 'custom' ? color : '',
        tipText: '',
      },
    });
  }

  function CORE_MA_setBraceStatus(msgEl, brace, payload = {}) {
    return CORE_MA_setBraceCenterPayload(msgEl, brace, {
      shape: payload.shape || brace?.shape || 'brace',
      state: String(payload.state || '').trim(),
      label: String(payload.label || '').trim(),
      color: String(payload.color || '').trim(),
      statement: '',
      noteText: '',
    });
  }

  function CORE_MA_setBraceStatement(msgEl, brace, text) {
    return CORE_MA_setBraceCenterPayload(msgEl, brace, {
      shape: brace?.shape || 'brace',
      statement: CORE_MA_clipStatementText(text),
      noteText: '',
      state: '',
      label: '',
      color: '',
    });
  }

  function CORE_MA_setBraceNote(msgEl, brace, text) {
    return CORE_MA_setBraceCenterPayload(msgEl, brace, {
      shape: brace?.shape || 'brace',
      statement: '',
      noteText: String(text || '').trim(),
      state: '',
      label: '',
      color: '',
    });
  }

  function VIEW_MA_buildRangeBracePath(width, height) {
    const w = Math.max(16, Number(width) || 24);
    const h = Math.max(18, Number(height) || 48);
    const xOuter = +(w - 2).toFixed(2);
    const xStem = +(w * 0.36).toFixed(2);
    const xTip = 2.25;
    const y0 = 1;
    const y1 = +(h * 0.14).toFixed(2);
    const y2 = +(h * 0.36).toFixed(2);
    const y3 = +(h * 0.50).toFixed(2);
    const y4 = +(h * 0.64).toFixed(2);
    const y5 = +(h * 0.86).toFixed(2);
    const yh = +(h - 1).toFixed(2);
    const c1 = +(h * 0.06).toFixed(2);
    const c2 = +(h * 0.035).toFixed(2);
    return [
      `M ${xOuter} ${y0}`,
      `C ${xStem} ${y0}, ${xStem} ${y1}, ${xStem} ${y2}`,
      `C ${xStem} ${+(y2 + c1).toFixed(2)}, ${+(xTip + 4).toFixed(2)} ${+(y3 - c2).toFixed(2)}, ${xTip} ${y3}`,
      `C ${+(xTip + 4).toFixed(2)} ${+(y3 + c2).toFixed(2)}, ${xStem} ${+(y4 - c1).toFixed(2)}, ${xStem} ${y4}`,
      `C ${xStem} ${y5}, ${xStem} ${yh}, ${xOuter} ${yh}`,
    ].join(' ');
  }

  function VIEW_MA_buildRangeBracketPath(width, height) {
    const w = Math.max(16, Number(width) || 24);
    const h = Math.max(18, Number(height) || 48);
    const xOuter = +(w - 2).toFixed(2);
    const xInner = 2.25;
    const y0 = 1;
    const yh = +(h - 1).toFixed(2);
    return [
      `M ${xOuter} ${y0}`,
      `L ${xInner} ${y0}`,
      `L ${xInner} ${yh}`,
      `L ${xOuter} ${yh}`
    ].join(' ');
  }

  function VIEW_MA_buildRangeConnectorPath(shape, width, height) {
    return CORE_MA_normalizeConnectorShape(shape) === 'bracket'
      ? VIEW_MA_buildRangeBracketPath(width, height)
      : VIEW_MA_buildRangeBracePath(width, height);
  }

  function VIEW_MA_buildRangeBraceGeom(msgEl, startAnchor, endAnchor) {
    const msgH = Math.max(24, Math.round(msgEl?.scrollHeight || msgEl?.getBoundingClientRect?.().height || 0));
    const yStart = UTIL_anchorToY(msgEl, startAnchor);
    const yEnd = UTIL_anchorToY(msgEl, endAnchor);
    let top = Math.min(yStart, yEnd);
    let bottom = Math.max(yStart, yEnd);
    const minH = Math.max(18, Number(CFG_MANCHOR.RANGE_BRACE_MIN_H_PX) || 30);
    if ((bottom - top) < minH) {
      const mid = Math.round((yStart + yEnd) / 2);
      top = mid - Math.round(minH / 2);
      bottom = top + minH;
    }
    top = UTIL_clampNumber(top, 2, Math.max(2, msgH - minH - 2));
    bottom = UTIL_clampNumber(bottom, top + minH, Math.max(top + minH, msgH - 2));
    return {
      top,
      height: Math.max(minH, bottom - top),
      mid: Math.round((top + bottom) / 2),
    };
  }

  /* ───────────────────────────── 🟤 VERIFY/SAFETY — DIAG 📝🔓💧 ───────────────────────────── */
  MOD_OBJ.diag = MOD_OBJ.diag || {
    name: MODTAG,
    bootId: Math.random().toString(36).slice(2),
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 160,
    errMax: 30
  };
  const DIAG = MOD_OBJ.diag;

  // Normalize (fail-soft)
  try { if (!Array.isArray(DIAG.steps)) DIAG.steps = []; } catch {}
  try { if (!Array.isArray(DIAG.errors)) DIAG.errors = []; } catch {}
  try { if (!Number.isFinite(DIAG.bufMax)) DIAG.bufMax = 160; } catch {}
  try { if (!Number.isFinite(DIAG.errMax)) DIAG.errMax = 30; } catch {}

  function DIAG_step(msg) {
    try {
      DIAG.steps.push(String(msg));
      if (DIAG.steps.length > DIAG.bufMax) DIAG.steps.splice(0, DIAG.steps.length - DIAG.bufMax);
    } catch {}
  }
  function DIAG_error(err) {
    try {
      DIAG.errors.push(String(err && err.stack ? err.stack : err));
      if (DIAG.errors.length > DIAG.errMax) DIAG.errors.splice(0, DIAG.errors.length - DIAG.errMax);
    } catch {}
  }

/* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */
  const STATE = {
    booted: false,
    symbolTheme: MANCHOR_SYMBOL_THEME_DEFAULT,
    symbolBoxed: null,
    symbolPageSize: null,
    gutterGuideMode: null,
    enabledSymbols: null,
    symbolVariants: null,
    chPluginRegistered: false,
    disposers: [],
    repaintTimerByMsg: new Map(),
    origPosByMsg: new Map(),
    origOverflowByMsg: new Map(),
    popEl: null,
    obsResize: null,
    obsMut: null,

    muting: 0,
    refreshAllTimer: 0,
    roObserved: new WeakSet(),
    gutterMidTimer: 0,
    gutterMidAt: 0,
    gutterMidMsgId: '',
    gutterMidMsgEl: null,
    gutterMidPoint: { x: 0, y: 0 },
    rangeDraft: null,
    inlineEditorEl: null,

    // Core only (notes portal moved out)
    didLegacyScan: false
  };

  /* ───────────────────────────── 🟥 ENGINE — STORE + ITEMS 📝🔓💥 ───────────────────────────── */
  function STATE_loadStoreV1() {
    let store = UTIL_storage.getJSON(KEY_MANCHOR_STATE_PINS_V1, null);
    store = STORE_MA_normalizeStore(store);
    return store;
  }

  function STATE_saveStoreV1(store) {
    const safe = STORE_MA_normalizeStore(store || {});
    UTIL_storage.setJSON(KEY_MANCHOR_STATE_PINS_V1, safe);
    try {
      W.dispatchEvent(new CustomEvent(EV_MANCHOR_STORE_CHANGED_V1, {
        detail: { key: KEY_MANCHOR_STATE_PINS_V1 },
      }));
    } catch (_) {}
    return safe;
  }

  function VIEW_MA_symbolToken(raw) {
    return String(raw || '').trim().replace(/[\uFE0E\uFE0F]/g, '');
  }

  function VIEW_MA_getSymbolRegistry() {
    return MANCHOR_SYMBOLS.slice();
  }

  function VIEW_MA_getSymbolDef(symbolId) {
    const id = VIEW_MA_symbolToken(symbolId);
    return MANCHOR_SYMBOL_MAP.get(id) || null;
  }

  function VIEW_MA_resolveSymbolSemanticId(rawKey, rawSymbol = '') {
    const keyToken = VIEW_MA_symbolToken(rawKey).toLowerCase();
    if (keyToken && MANCHOR_SYMBOL_LEGACY_MAP.has(keyToken)) return MANCHOR_SYMBOL_LEGACY_MAP.get(keyToken) || '';

    const symToken = VIEW_MA_symbolToken(rawSymbol);
    if (symToken && MANCHOR_SYMBOL_LEGACY_MAP.has(symToken)) return MANCHOR_SYMBOL_LEGACY_MAP.get(symToken) || '';

    return '';
  }

  function VIEW_MA_getSymbolLegacyToken(symbolId) {
    const def = VIEW_MA_getSymbolDef(symbolId);
    return String(def?.legacySymbol || symbolId || '').trim();
  }

  function VIEW_MA_getSymbolVariantMeta(symbolId, variantId) {
    const def = VIEW_MA_getSymbolDef(symbolId);
    const variants = Array.isArray(def?.variants) ? def.variants : [];
    const rawId = VIEW_MA_symbolToken(variantId).toLowerCase();
    return variants.find((item) => item.id === rawId) || variants[0] || null;
  }

  function VIEW_MA_getDefaultSymbolVariantId(symbolId) {
    return VIEW_MA_getSymbolVariantMeta(symbolId, '')?.id || '';
  }

  function STATE_MA_normalizeSymbolTheme(raw) {
    const next = String(raw || '').trim().toLowerCase();
    return MANCHOR_SYMBOL_THEME_IDS.has(next) ? next : MANCHOR_SYMBOL_THEME_DEFAULT;
  }

  function STATE_MA_loadSymbolTheme() {
    return STATE_MA_normalizeSymbolTheme(UTIL_storage.getStr(KEY_MANCHOR_SYMBOL_THEME_V1, MANCHOR_SYMBOL_THEME_DEFAULT));
  }

  function STATE_MA_saveSymbolTheme(theme) {
    const next = STATE_MA_normalizeSymbolTheme(theme);
    UTIL_storage.setStr(KEY_MANCHOR_SYMBOL_THEME_V1, next);
    return next;
  }

  function STATE_MA_normalizeSymbolBoxed(raw) {
    if (raw === false || raw === 0 || raw === '0' || raw === 'false' || raw === 'off' || raw === 'plain' || raw === 'unboxed') return false;
    if (raw === true || raw === 1 || raw === '1' || raw === 'true' || raw === 'on' || raw === 'boxed') return true;
    return true;
  }

  function STATE_MA_loadSymbolBoxed() {
    return STATE_MA_normalizeSymbolBoxed(UTIL_storage.getJSON(KEY_MANCHOR_SYMBOL_BOXED_V1, true));
  }

  function STATE_MA_saveSymbolBoxed(value) {
    const next = STATE_MA_normalizeSymbolBoxed(value);
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOL_BOXED_V1, next);
    return next;
  }

  function STATE_MA_normalizeSymbolPageSize(raw) {
    const wanted = String(raw || '').trim().toLowerCase();
    return MANCHOR_SYMBOL_PAGE_SIZES.find((item) => item.id === wanted)?.id || MANCHOR_SYMBOL_PAGE_SIZE_DEFAULT;
  }

  function STATE_MA_loadSymbolPageSize() {
    return STATE_MA_normalizeSymbolPageSize(UTIL_storage.getStr(KEY_MANCHOR_SYMBOL_PAGE_SIZE_V1, MANCHOR_SYMBOL_PAGE_SIZE_DEFAULT));
  }

  function STATE_MA_saveSymbolPageSize(value) {
    const next = STATE_MA_normalizeSymbolPageSize(value);
    UTIL_storage.setStr(KEY_MANCHOR_SYMBOL_PAGE_SIZE_V1, next);
    return next;
  }

  function STATE_MA_normalizeGutterGuideMode(raw) {
    const wanted = String(raw || '').trim().toLowerCase();
    return MANCHOR_GUTTER_GUIDES.find((item) => item.id === wanted)?.id || MANCHOR_GUTTER_GUIDE_DEFAULT;
  }

  function STATE_MA_loadGutterGuideMode() {
    return STATE_MA_normalizeGutterGuideMode(UTIL_storage.getStr(KEY_MANCHOR_GUTTER_GUIDE_V1, MANCHOR_GUTTER_GUIDE_DEFAULT));
  }

  function STATE_MA_saveGutterGuideMode(value) {
    const next = STATE_MA_normalizeGutterGuideMode(value);
    UTIL_storage.setStr(KEY_MANCHOR_GUTTER_GUIDE_V1, next);
    return next;
  }

  function STATE_MA_normalizeEnabledSymbols(raw, fallback = MANCHOR_SYMBOL_LIBRARY_DEFAULT) {
    const source = Array.isArray(raw) ? raw : fallback;
    const wanted = new Set();
    for (const value of (Array.isArray(source) ? source : [])) {
      const id = VIEW_MA_resolveSymbolSemanticId(value, value);
      if (id) wanted.add(id);
    }
    const out = [];
    for (const id of MANCHOR_SYMBOL_IDS) {
      if (wanted.has(id)) out.push(id);
    }
    return out;
  }

  function STATE_MA_loadEnabledSymbols() {
    return STATE_MA_normalizeEnabledSymbols(UTIL_storage.getJSON(KEY_MANCHOR_SYMBOL_LIBRARY_V1, MANCHOR_SYMBOL_LIBRARY_DEFAULT), MANCHOR_SYMBOL_LIBRARY_DEFAULT);
  }

  function STATE_MA_saveEnabledSymbols(list) {
    const next = STATE_MA_normalizeEnabledSymbols(list, []);
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOL_LIBRARY_V1, next);
    return next;
  }

  function STATE_MA_normalizeSymbolVariants(raw) {
    const src = STORE_MA_isObj(raw) ? raw : {};
    const out = {};
    for (const def of MANCHOR_SYMBOLS) {
      const picked = VIEW_MA_getSymbolVariantMeta(def.id, src[def.id]);
      if (picked?.id) out[def.id] = picked.id;
    }
    return out;
  }

  function STATE_MA_loadSymbolVariants() {
    return STATE_MA_normalizeSymbolVariants(UTIL_storage.getJSON(KEY_MANCHOR_SYMBOL_VARIANTS_V1, null));
  }

  function STATE_MA_saveSymbolVariants(map) {
    const next = STATE_MA_normalizeSymbolVariants(map);
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOL_VARIANTS_V1, next);
    return next;
  }

  function STATE_MA_emitSymbolThemeChanged(theme) {
    const next = STATE_MA_normalizeSymbolTheme(theme);
    try {
      W.dispatchEvent(new CustomEvent(EV_MANCHOR_SYMBOL_THEME_CHANGED_V1, {
        detail: { theme: next },
      }));
      return true;
    } catch {
      return false;
    }
  }

  function VIEW_MA_getSymbolThemeMeta(theme) {
    const next = STATE_MA_normalizeSymbolTheme(theme);
    return MANCHOR_SYMBOL_THEMES.find((item) => item.id === next) || MANCHOR_SYMBOL_THEMES[1];
  }

  function VIEW_MA_getSymbolThemes() {
    return MANCHOR_SYMBOL_THEMES.slice();
  }

  function VIEW_MA_getSymbolPageSizeMeta(sizeId) {
    const next = STATE_MA_normalizeSymbolPageSize(sizeId);
    return MANCHOR_SYMBOL_PAGE_SIZES.find((item) => item.id === next)
      || MANCHOR_SYMBOL_PAGE_SIZES.find((item) => item.id === MANCHOR_SYMBOL_PAGE_SIZE_DEFAULT)
      || MANCHOR_SYMBOL_PAGE_SIZES[0];
  }

  function VIEW_MA_getSymbolPageSizes() {
    return MANCHOR_SYMBOL_PAGE_SIZES.slice();
  }

  function VIEW_MA_getGutterGuideMeta(mode) {
    const next = STATE_MA_normalizeGutterGuideMode(mode);
    return MANCHOR_GUTTER_GUIDES.find((item) => item.id === next)
      || MANCHOR_GUTTER_GUIDES.find((item) => item.id === MANCHOR_GUTTER_GUIDE_DEFAULT)
      || MANCHOR_GUTTER_GUIDES[0];
  }

  function VIEW_MA_getGutterGuideModes() {
    return MANCHOR_GUTTER_GUIDES.slice();
  }

  function CORE_MA_getEnabledSymbols() {
    if (!Array.isArray(STATE.enabledSymbols)) STATE.enabledSymbols = STATE_MA_loadEnabledSymbols();
    return Array.isArray(STATE.enabledSymbols) ? STATE.enabledSymbols.slice() : [];
  }

  function CORE_MA_setEnabledSymbols(list, opts = {}) {
    const prev = CORE_MA_getEnabledSymbols();
    const next = STATE_MA_saveEnabledSymbols(list);
    STATE.enabledSymbols = next.slice();
    const changed = !STATE_sameStringArray(prev, next) || opts.force === true;
    if (changed && opts.invalidate !== false) CHUB_MA_invalidate();
    if (changed && opts.refresh !== false) OBS_MA_scheduleRefreshAll();
    return next.slice();
  }

  function CORE_MA_getSymbolVariantMap() {
    if (!STORE_MA_isObj(STATE.symbolVariants)) STATE.symbolVariants = STATE_MA_loadSymbolVariants();
    return Object.assign({}, STATE.symbolVariants || {});
  }

  function CORE_MA_getSymbolVariant(symbolId) {
    const id = VIEW_MA_resolveSymbolSemanticId(symbolId, symbolId);
    if (!id) return '';
    const map = CORE_MA_getSymbolVariantMap();
    return VIEW_MA_getSymbolVariantMeta(id, map[id])?.id || VIEW_MA_getDefaultSymbolVariantId(id);
  }

  function CORE_MA_setSymbolVariant(symbolId, variantId, opts = {}) {
    const id = VIEW_MA_resolveSymbolSemanticId(symbolId, symbolId);
    const variant = VIEW_MA_getSymbolVariantMeta(id, variantId);
    if (!id || !variant?.id) return '';
    const prev = CORE_MA_getSymbolVariant(id);
    const map = CORE_MA_getSymbolVariantMap();
    map[id] = variant.id;
    STATE.symbolVariants = STATE_MA_saveSymbolVariants(map);
    const changed = (prev !== variant.id) || opts.force === true;
    if (changed && opts.invalidate !== false) CHUB_MA_invalidate();
    if (changed && opts.refresh !== false) OBS_MA_scheduleRefreshAll();
    return variant.id;
  }

  function VIEW_MA_getEnabledSymbolDefs(extraIds = []) {
    const wanted = new Set(CORE_MA_getEnabledSymbols());
    for (const raw of (Array.isArray(extraIds) ? extraIds : [])) {
      const id = VIEW_MA_resolveSymbolSemanticId(raw, raw);
      if (id) wanted.add(id);
    }
    return MANCHOR_SYMBOLS.filter((def) => wanted.has(def.id));
  }

  function VIEW_MA_buildSymbolViewModel(symbolId, color = '', variantId = '') {
    const resolvedId = VIEW_MA_resolveSymbolSemanticId(symbolId, symbolId) || 'question';
    const def = VIEW_MA_getSymbolDef(resolvedId) || VIEW_MA_getSymbolDef('question') || MANCHOR_SYMBOLS[0];
    const variant = VIEW_MA_getSymbolVariantMeta(def.id, variantId || CORE_MA_getSymbolVariant(def.id)) || def.variants?.[0] || null;
    const resolvedColor = String(color || def?.defaultColor || '#ffffff').trim() || (def?.defaultColor || '#ffffff');
    return {
      key: def?.id || resolvedId,
      color: resolvedColor,
      symbolId: def?.id || resolvedId,
      title: def?.title || resolvedId,
      legacySymbol: VIEW_MA_getSymbolLegacyToken(def?.id || resolvedId),
      variantId: variant?.id || '',
      variantTitle: variant?.title || '',
      svgBody: String(variant?.body || '').trim(),
      viewBox: String(variant?.viewBox || MANCHOR_SVG_VIEWBOX),
    };
  }

  function VIEW_MA_resolveSymbolViewModel(item) {
    const symbolId = VIEW_MA_resolveSymbolSemanticId(item?.data?.key, item?.data?.symbol) || 'question';
    const key = String(item?.data?.key || symbolId || '').trim() || symbolId;
    return Object.assign(
      {},
      VIEW_MA_buildSymbolViewModel(symbolId, String(item?.data?.color || item?.ui?.color || '').trim(), ''),
      { key }
    );
  }

  function VIEW_MA_normalizeSymbolSide(side) {
    return String(side || '').trim().toLowerCase() === 'right' ? 'right' : 'left';
  }

  function VIEW_MA_shouldFlipSymbol(symbolId, side) {
    return VIEW_MA_resolveSymbolSemanticId(symbolId, symbolId) === 'arrow' && VIEW_MA_normalizeSymbolSide(side) === 'right';
  }

  function UI_MA_createSymbolGlyphEl(vm, opts = {}) {
    const glyph = D.createElement('span');
    if (opts.uiToken) {
      glyph.setAttribute(ATTR_CGXUI, opts.uiToken);
      glyph.setAttribute(ATTR_CGXUI_OWNER, SkID);
    }
    if (opts.className) glyph.className = opts.className;

    glyph.dataset.symbolId = String(vm?.symbolId || '');
    glyph.dataset.symbolVariant = String(vm?.variantId || '');

    const side = VIEW_MA_normalizeSymbolSide(opts.side);
    glyph.dataset.symbolSide = side;
    if (VIEW_MA_shouldFlipSymbol(vm?.symbolId, side)) glyph.dataset.symbolFlip = '1';

    glyph.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${String(vm?.viewBox || MANCHOR_SVG_VIEWBOX)}" fill="none" aria-hidden="true" focusable="false">${String(vm?.svgBody || '').trim()}</svg>`;
    return glyph;
  }

  function UI_MA_createSymbolShellEl(vm, opts = {}) {
    const shell = D.createElement(opts.tagName || 'span');
    if (opts.uiToken) {
      shell.setAttribute(ATTR_CGXUI, opts.uiToken);
      shell.setAttribute(ATTR_CGXUI_OWNER, SkID);
    }
    if (opts.className) shell.className = opts.className;
    if (opts.title) {
      shell.title = opts.title;
      shell.setAttribute('aria-label', opts.title);
    }
    shell.style.setProperty(CSS_MANCHOR_VAR_COLOR, String(opts.color || vm?.color || '#ffffff'));
    if (opts.kind) shell.dataset.kind = String(opts.kind);
    shell.dataset.symbolId = String(vm?.symbolId || '');
    shell.appendChild(UI_MA_createSymbolGlyphEl(vm, {
      uiToken: opts.glyphToken,
      className: opts.glyphClassName,
      side: opts.side,
    }));
    return shell;
  }

  function UI_MA_applySymbolTheme(theme) {
    const next = STATE_MA_normalizeSymbolTheme(theme);
    STATE.symbolTheme = next;
    try { D.documentElement.setAttribute(ATTR_MANCHOR_SYMBOL_THEME, next); } catch {}
    return next;
  }

  function UI_MA_applySymbolBoxed(value) {
    const next = STATE_MA_normalizeSymbolBoxed(value);
    STATE.symbolBoxed = next;
    try { D.documentElement.setAttribute(ATTR_MANCHOR_SYMBOL_BOXED, next ? '1' : '0'); } catch {}
    return next;
  }

  function UI_MA_applySymbolPageSize(value) {
    const next = STATE_MA_normalizeSymbolPageSize(value);
    STATE.symbolPageSize = next;
    try { D.documentElement.setAttribute(ATTR_MANCHOR_SYMBOL_PAGE_SIZE, next); } catch {}
    return next;
  }

  function UI_MA_applyGutterGuideMode(value) {
    const next = STATE_MA_normalizeGutterGuideMode(value);
    STATE.gutterGuideMode = next;
    try { D.documentElement.setAttribute(ATTR_MANCHOR_GUTTER_GUIDE, next); } catch {}
    return next;
  }

  function CORE_MA_getSymbolTheme() {
    if (!STATE.symbolTheme) STATE.symbolTheme = STATE_MA_loadSymbolTheme();
    return STATE_MA_normalizeSymbolTheme(STATE.symbolTheme);
  }

  function CORE_MA_setSymbolTheme(theme, opts = {}) {
    const prev = CORE_MA_getSymbolTheme();
    const next = STATE_MA_saveSymbolTheme(theme);
    UI_MA_applySymbolTheme(next);
    const changed = (next !== prev) || opts.force === true;
    if (opts.emit !== false && changed) STATE_MA_emitSymbolThemeChanged(next);
    if (opts.refresh !== false && changed) OBS_MA_scheduleRefreshAll();
    return next;
  }

  function CORE_MA_getSymbolBoxed() {
    if (typeof STATE.symbolBoxed !== 'boolean') STATE.symbolBoxed = STATE_MA_loadSymbolBoxed();
    return !!STATE.symbolBoxed;
  }

  function CORE_MA_setSymbolBoxed(value, opts = {}) {
    const prev = CORE_MA_getSymbolBoxed();
    const next = STATE_MA_saveSymbolBoxed(value);
    UI_MA_applySymbolBoxed(next);
    const changed = (next !== prev) || opts.force === true;
    if (changed && opts.invalidate !== false) CHUB_MA_invalidate();
    if (changed && opts.refresh !== false) OBS_MA_scheduleRefreshAll();
    return next;
  }

  function CORE_MA_getSymbolPageSize() {
    if (!STATE.symbolPageSize) STATE.symbolPageSize = STATE_MA_loadSymbolPageSize();
    return STATE_MA_normalizeSymbolPageSize(STATE.symbolPageSize);
  }

  function CORE_MA_setSymbolPageSize(value, opts = {}) {
    const prev = CORE_MA_getSymbolPageSize();
    const next = STATE_MA_saveSymbolPageSize(value);
    UI_MA_applySymbolPageSize(next);
    const changed = (next !== prev) || opts.force === true;
    if (changed && opts.invalidate !== false) CHUB_MA_invalidate();
    if (changed && opts.refresh !== false) OBS_MA_scheduleRefreshAll();
    return next;
  }

  function CORE_MA_getGutterGuideMode() {
    if (!STATE.gutterGuideMode) STATE.gutterGuideMode = STATE_MA_loadGutterGuideMode();
    return STATE_MA_normalizeGutterGuideMode(STATE.gutterGuideMode);
  }

  function CORE_MA_setGutterGuideMode(value, opts = {}) {
    const prev = CORE_MA_getGutterGuideMode();
    const next = STATE_MA_saveGutterGuideMode(value);
    UI_MA_applyGutterGuideMode(next);
    const changed = (next !== prev) || opts.force === true;
    if (changed && opts.invalidate !== false) CHUB_MA_invalidate();
    if (changed && opts.refresh !== false) OBS_MA_scheduleRefreshAll();
    return next;
  }

  function CSS_MA_symbolShellBase(shellSel, glyphSel) {
    return `
      ${shellSel}{
        --ma-sym-size: 28px;
        --ma-sym-radius: 7px;
        --ma-sym-icon-pad: 4.6px;
        --ma-sym-shell-border: rgba(201,210,224,.18);
        --ma-sym-shell-bg:
          linear-gradient(180deg, rgba(55,63,74,.98), rgba(18,22,29,.96)),
          linear-gradient(135deg, rgba(255,255,255,.05), rgba(255,255,255,0));
        --ma-sym-shell-shadow:
          inset 0 1px 0 rgba(255,255,255,.13),
          inset 0 -1px 0 rgba(0,0,0,.38),
          0 11px 24px rgba(0,0,0,.38);
        --ma-sym-shell-highlight:
          linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.04) 42%, transparent 100%);
        --ma-sym-shell-glow:
          radial-gradient(circle at 50% 22%, color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 16%, rgba(255,255,255,.5)) 0%, transparent 70%);
        --ma-sym-shell-glow-opacity: .34;
        --ma-sym-shell-glow-blur: 11px;
        --ma-sym-backdrop: blur(12px) saturate(1.04);
        --ma-sym-shell-outline: inset 0 0 0 1px rgba(255,255,255,.04);
        --ma-sym-glyph-color: color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 80%, #e2e8f0 20%);
        display:grid;
        place-items:center;
        border-radius:var(--ma-sym-radius);
        border:1px solid var(--ma-sym-shell-border);
        background:var(--ma-sym-shell-bg);
        box-shadow:var(--ma-sym-shell-shadow), var(--ma-sym-shell-outline);
        backdrop-filter:var(--ma-sym-backdrop);
        -webkit-backdrop-filter:var(--ma-sym-backdrop);
        overflow:hidden;
        isolation:isolate;
        color:var(--ma-sym-glyph-color);
      }
      ${shellSel}::before{
        content:"";
        position:absolute;
        inset:1px;
        left:auto;
        top:auto;
        width:auto;
        height:auto;
        transform:none;
        border-radius:calc(var(--ma-sym-radius) - 1px);
        background:var(--ma-sym-shell-highlight);
        opacity:.95;
        z-index:0;
        pointer-events:none;
      }
      ${shellSel}::after{
        content:"";
        position:absolute;
        inset:-18%;
        left:auto;
        top:auto;
        width:auto;
        height:auto;
        transform:none;
        border-radius:calc(var(--ma-sym-radius) + 4px);
        background:var(--ma-sym-shell-glow);
        opacity:var(--ma-sym-shell-glow-opacity);
        filter:blur(var(--ma-sym-shell-glow-blur));
        z-index:0;
        pointer-events:none;
      }
      ${glyphSel}{
        position:relative;
        z-index:1;
        display:grid;
        place-items:center;
        width:100%;
        height:100%;
        padding:max(0px, calc(var(--ma-sym-icon-pad) - var(--ma-sym-icon-pad-adjust, 0px) - var(--ma-sym-page-icon-pad-adjust, 0px)));
        box-sizing:border-box;
        color:inherit;
        pointer-events:none;
      }
      ${glyphSel} > svg{
        display:block;
        width:100%;
        height:100%;
        overflow:visible;
      }
      ${glyphSel}[data-symbol-flip="1"] > svg{
        transform:scaleX(-1);
        transform-origin:50% 50%;
      }
    `;
  }

  function CSS_MA_symbolShellPageSizes(scopeForSize, shellSel) {
    const scoped = (sizeId) => {
      const scope = (typeof scopeForSize === 'function') ? scopeForSize(sizeId) : '';
      return scope ? `${scope} ${shellSel}` : shellSel;
    };

    return MANCHOR_SYMBOL_PAGE_SIZES.map((meta) => `
      ${scoped(meta.id)}{
        --ma-sym-page-icon-pad-adjust: ${meta.padAdjust}px;
      }
    `).join('\n');
  }

  function CSS_MA_gutterGuideDots(laneSel) {
    return `
      ${laneSel}{
        --ma-gutter-dot-color: rgba(255,255,255,.22);
        --ma-gutter-dot-opacity: 0;
        --ma-gutter-dot-shadow: none;
      }
      ${laneSel}::before{
        content:"";
        position:absolute;
        inset:4px 0;
        left:50%;
        width:4px;
        transform:translateX(-50%);
        background-image:radial-gradient(circle, var(--ma-gutter-dot-color) 0 1.15px, transparent 1.8px);
        background-size:4px 14px;
        background-repeat:repeat-y;
        background-position:center top;
        opacity:var(--ma-gutter-dot-opacity);
        filter:var(--ma-gutter-dot-shadow);
        pointer-events:none;
      }
    `;
  }

  function CSS_MA_gutterGuideModes(scopeForMode, laneSel) {
    const scoped = (mode) => {
      const scope = (typeof scopeForMode === 'function') ? scopeForMode(mode) : '';
      return scope ? `${scope} ${laneSel}` : laneSel;
    };

    return `
      ${scoped('off')}{
        --ma-gutter-dot-opacity: 0;
      }
      ${scoped('mono')}{
        --ma-gutter-dot-color: rgba(229,231,235,.24);
        --ma-gutter-dot-opacity: .78;
        --ma-gutter-dot-shadow: drop-shadow(0 0 5px rgba(255,255,255,.08));
      }
      ${scoped('lanes')}{
        --ma-gutter-dot-opacity: .92;
      }
      ${scoped('lanes')}[data-lane="primary"]{
        --ma-gutter-dot-color: rgba(96,165,250,.58);
        --ma-gutter-dot-shadow: drop-shadow(0 0 6px rgba(96,165,250,.18));
      }
      ${scoped('lanes')}[data-lane="range"]{
        --ma-gutter-dot-color: rgba(226,232,240,.56);
        --ma-gutter-dot-shadow: drop-shadow(0 0 6px rgba(226,232,240,.16));
      }
      ${scoped('lanes')}[data-lane="external"]{
        --ma-gutter-dot-color: rgba(251,191,36,.58);
        --ma-gutter-dot-shadow: drop-shadow(0 0 6px rgba(251,191,36,.16));
      }
    `;
  }

  function CSS_MA_symbolShellBoxMode(scopeForMode, shellSel) {
    const scoped = (boxed) => {
      const scope = (typeof scopeForMode === 'function') ? scopeForMode(boxed) : '';
      return scope ? `${scope} ${shellSel}` : shellSel;
    };

    return `
      ${scoped('0')}{
        --ma-sym-icon-pad-adjust: 1.9px;
        --ma-sym-shell-border: transparent;
        --ma-sym-shell-bg: transparent;
        --ma-sym-shell-shadow: none;
        --ma-sym-shell-highlight: none;
        --ma-sym-shell-glow: none;
        --ma-sym-shell-glow-opacity: 0;
        --ma-sym-shell-glow-blur: 0px;
        --ma-sym-backdrop: none;
        --ma-sym-shell-outline: none;
        border-color: transparent;
        background: transparent;
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      ${scoped('0')}::before,
      ${scoped('0')}::after{
        opacity:0;
      }
    `;
  }

  function CSS_MA_symbolShellThemes(scopeForTheme, shellSel) {
    const scoped = (theme) => {
      const scope = (typeof scopeForTheme === 'function') ? scopeForTheme(theme) : '';
      return scope ? `${scope} ${shellSel}` : shellSel;
    };

    return `
      ${scoped('glass')}{
        --ma-sym-size: 28px;
        --ma-sym-radius: 10px;
        --ma-sym-icon-pad: 4.2px;
        --ma-sym-shell-border: color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 24%, rgba(255,255,255,.52));
        --ma-sym-shell-bg:
          linear-gradient(180deg, color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 14%, rgba(255,255,255,.18)), rgba(255,255,255,.04)),
          linear-gradient(135deg, rgba(255,255,255,.18), color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 18%, rgba(17,24,39,.38)));
        --ma-sym-shell-shadow:
          inset 0 1px 0 rgba(255,255,255,.42),
          inset 0 -1px 0 rgba(255,255,255,.08),
          0 10px 24px rgba(0,0,0,.28),
          0 0 0 1px rgba(255,255,255,.06);
        --ma-sym-shell-highlight:
          linear-gradient(180deg, rgba(255,255,255,.44), rgba(255,255,255,.18) 34%, transparent 72%);
        --ma-sym-shell-glow:
          radial-gradient(circle at 50% 16%, color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 42%, #ffffff 58%) 0%, transparent 72%);
        --ma-sym-shell-glow-opacity: .74;
        --ma-sym-shell-glow-blur: 9px;
        --ma-sym-backdrop: blur(16px) saturate(1.24);
        --ma-sym-shell-outline: inset 0 0 0 1px rgba(255,255,255,.10);
        --ma-sym-glyph-color: color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 74%, #ffffff 26%);
      }
      ${scoped('aviation')}{
        --ma-sym-size: 27px;
        --ma-sym-radius: 6px;
        --ma-sym-icon-pad: 4.3px;
        --ma-sym-shell-border: rgba(201,210,224,.18);
        --ma-sym-shell-bg:
          linear-gradient(180deg, rgba(51,58,67,.98), rgba(15,18,24,.98)),
          linear-gradient(135deg, rgba(255,255,255,.05), rgba(255,255,255,0));
        --ma-sym-shell-shadow:
          inset 0 1px 0 rgba(255,255,255,.10),
          inset 0 -1px 0 rgba(0,0,0,.42),
          0 10px 22px rgba(0,0,0,.40);
        --ma-sym-shell-highlight:
          linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,.03) 36%, transparent 100%);
        --ma-sym-shell-glow:
          radial-gradient(circle at 50% 22%, color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 12%, rgba(255,255,255,.4)) 0%, transparent 70%);
        --ma-sym-shell-glow-opacity: .20;
        --ma-sym-shell-glow-blur: 11px;
        --ma-sym-backdrop: blur(12px) saturate(1.04);
        --ma-sym-shell-outline: inset 0 0 0 1px rgba(255,255,255,.03);
        --ma-sym-glyph-color: color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 80%, #e2e8f0 20%);
      }
      ${scoped('neon')}{
        --ma-sym-size: 26px;
        --ma-sym-radius: 5px;
        --ma-sym-icon-pad: 4px;
        --ma-sym-shell-border: color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 28%, rgba(148,163,184,.42));
        --ma-sym-shell-bg:
          linear-gradient(180deg, rgba(22,27,36,.98), rgba(8,10,16,.98)),
          linear-gradient(135deg, rgba(255,255,255,.04), rgba(255,255,255,0));
        --ma-sym-shell-shadow:
          inset 0 1px 0 rgba(255,255,255,.12),
          inset 0 0 0 1px rgba(255,255,255,.03),
          0 10px 26px rgba(0,0,0,.42),
          0 0 0 1px color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 12%, transparent);
        --ma-sym-shell-highlight:
          linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.05) 30%, transparent 72%);
        --ma-sym-shell-glow:
          radial-gradient(circle at 50% 24%, color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 54%, rgba(255,255,255,.62)) 0%, transparent 72%);
        --ma-sym-shell-glow-opacity: .58;
        --ma-sym-shell-glow-blur: 12px;
        --ma-sym-backdrop: blur(10px) saturate(1.12);
        --ma-sym-shell-outline: inset 0 0 0 1px color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 14%, rgba(255,255,255,.04));
        --ma-sym-glyph-color: color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 88%, #dbeafe 12%);
      }
    `;
  }

  function STATE_sameStringArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (String(a[i] || '') !== String(b[i] || '')) return false;
    }
    return true;
  }

  function STATE_collectSymbolEntriesForMsg(store, msgId) {
    const id = String(msgId || '').trim();
    if (!id || !STORE_MA_isObj(store)) return [];
    const buckets = Array.isArray(store[id]) ? store[id] : [];
    const out = [];
    for (const b of buckets) {
      const model = CORE_MA_getLineModel(Array.isArray(b?.items) ? b.items : []);
      if (!model.primarySymbolId) continue;
      out.push({
        symbolId: model.primarySymbolId,
        symbol: VIEW_MA_getSymbolLegacyToken(model.primarySymbolId),
        color: String(model.primaryColor || '').trim(),
      });
    }
    return out;
  }

  function STATE_collectSymbolsForMsg(store, msgId) {
    return STATE_collectSymbolEntriesForMsg(store, msgId).map((x) => x.symbol);
  }

  function STATE_collectSymbolColorsForMsg(store, msgId) {
    return STATE_collectSymbolEntriesForMsg(store, msgId).map((x) => x.color);
  }

  function STATE_emitSymbolsChanged(msgId, symbols, colors = []) {
    const answerId = String(msgId || '').trim();
    if (!answerId) return false;
    const detail = {
      answerId,
      symbols: (Array.isArray(symbols) ? symbols : []).map((s) => String(s || '').trim()).filter(Boolean),
      colors: (Array.isArray(colors) ? colors : []).map((c) => String(c || '').trim()),
    };
    try {
      W.dispatchEvent(new CustomEvent(EV_MANCHOR_SYMBOLS_CHANGED, { detail }));
      return true;
    } catch {
      return false;
    }
  }

  function STATE_syncSymbolsForMsg(store, msgId, opts = {}) {
    const id = String(msgId || '').trim();
    if (!id) return [];

    const safeStore = STORE_MA_isObj(store) ? store : STATE_loadStoreV1();
    const next = STATE_collectSymbolsForMsg(safeStore, id);
    const nextColors = STATE_collectSymbolColorsForMsg(safeStore, id);

    const rawMap = UTIL_storage.getJSON(KEY_MANCHOR_SYMBOLS_V1, null);
    const map = STORE_MA_isObj(rawMap) ? rawMap : {};
    const rawColorMap = UTIL_storage.getJSON(KEY_MANCHOR_SYMBOL_COLORS_V1, null);
    const colorMap = STORE_MA_isObj(rawColorMap) ? rawColorMap : {};
    const prev = Array.isArray(map[id]) ? map[id].map((s) => String(s || '').trim()).filter(Boolean) : [];
    const prevColors = Array.isArray(colorMap[id]) ? colorMap[id].map((c) => String(c || '').trim()) : [];
    const had = Object.prototype.hasOwnProperty.call(map, id) || Object.prototype.hasOwnProperty.call(colorMap, id);
    const changed = !STATE_sameStringArray(prev, next)
      || !STATE_sameStringArray(prevColors, nextColors)
      || (had && !next.length);
    if (!changed) return next;

    if (next.length) {
      map[id] = next;
      colorMap[id] = nextColors;
    } else {
      delete map[id];
      delete colorMap[id];
    }
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOLS_V1, map);
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOL_COLORS_V1, colorMap);

    if (opts.emit !== false) STATE_emitSymbolsChanged(id, next, nextColors);
    return next;
  }

  function STATE_rebuildSymbolsMapV1(storeIn = null) {
    const store = STORE_MA_isObj(storeIn) ? storeIn : STATE_loadStoreV1();
    const out = {};
    const outColors = {};
    for (const [msgId] of Object.entries(store || {})) {
      const symbols = STATE_collectSymbolsForMsg(store, msgId);
      if (!symbols.length) continue;
      out[msgId] = symbols;
      outColors[msgId] = STATE_collectSymbolColorsForMsg(store, msgId);
    }
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOLS_V1, out);
    UTIL_storage.setJSON(KEY_MANCHOR_SYMBOL_COLORS_V1, outColors);
    return out;
  }

  function STATE_getOrCreateBucket(store, msgId, a) {
    const arr = store[msgId] || [];
    let b = arr.find(x => x?.a?.off === a.off);
    if (!b) {
      b = { a: { off: a.off, fp: a.fp || '' }, items: [] };
      arr.push(b);
      store[msgId] = arr;
    }
    return b;
  }

  function STATE_getBucket(store, msgId, off) {
    const arr = store[msgId] || [];
    return arr.find(x => x?.a?.off === off) || null;
  }


  function CORE_MA_itemTs(it, fallback = 0) {
    const ts = Number(it?.ts);
    return Number.isFinite(ts) ? ts : fallback;
  }

  function CORE_MA_getNoteColor(noteIt) {
    return String(
      noteIt?.ui?.color
      || noteIt?.data?.color
      || CFG_MANCHOR.NOTE_DEFAULT_COLOR
      || '#ffd24a'
    ).trim();
  }

    function CORE_MA_ensureNoteItem(msgEl, a) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId || !a) return null;

    const store = STATE_loadStoreV1();
    const b = STATE_getOrCreateBucket(store, msgId, a);
    const items = Array.isArray(b.items) ? b.items : [];

    let note = null;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i];
      if (it && it.type === 'note') {
        note = it;
        break;
      }
    }
    if (note) return note;

    const color = String(CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a').trim() || '#ffd24a';
    note = {
      id: UTIL_uid(),
      type: 'note',
      ts: Date.now(),
      data: { text: '', color },
      ui: { color, statusHidden: false },
    };

    b.items = [...items, note];
    const saved = STATE_saveStoreV1(store);
    STATE_syncSymbolsForMsg(saved, msgId, { emit: true });
    OBS_MA_scheduleRepaint(msgEl);
    return note;
  }

  function CORE_MA_openNotePortalAtAnchor(msgEl, a, opts = {}) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId || !a) return null;

    const note = CORE_MA_ensureNoteItem(msgEl, a);
    if (!note) return null;

    const key = UTIL_noteKey(msgId, a.off);
    const forceOpen = opts.forceOpen !== false;
    const notes = CORE_MA_notesAPI();

    if (notes?.open && forceOpen) {
      try { notes.open({ key, msgEl, a, item: note }); } catch {}
    } else if (notes?.toggle) {
      try { notes.toggle({ key, msgEl, a, item: note, forceOpen }); } catch {}
    } else {
      try {
        D.dispatchEvent(new CustomEvent(EV_MANCHOR_NOTE_TOGGLE_V1, {
          detail: { key, msgId, off: a.off, msgEl, a, item: note, forceOpen }
        }));
      } catch {}
    }

    OBS_MA_scheduleRepaint(msgEl);
    return note;
  }

  function CORE_MA_getPrimarySymbolItem(items) {
    const syms = (Array.isArray(items) ? items : []).filter((it) => it && it.type === 'symbol');
    if (!syms.length) return null;
    syms.sort((a, b) => (CORE_MA_itemTs(a) - CORE_MA_itemTs(b)) || 0);
    return syms[syms.length - 1] || null;
  }

  function CORE_MA_getLatestStatusItem(items, opts = {}) {
    const includeSynthetic = opts.includeSynthetic !== false;
    const statuses = (Array.isArray(items) ? items : []).filter((it) => it && it.type === 'status' && String(it?.data?.state || '').trim());
    if (!statuses.length) return null;

    let latestReal = null;
    let latestAny = null;
    for (const st of statuses) {
      const state = String(st?.data?.state || '').trim();
      if (!latestAny || CORE_MA_itemTs(st) >= CORE_MA_itemTs(latestAny)) latestAny = st;
      if (state && state !== 'note') {
        if (!latestReal || CORE_MA_itemTs(st) >= CORE_MA_itemTs(latestReal)) latestReal = st;
      }
    }
    return latestReal || (includeSynthetic ? latestAny : null) || null;
  }

  function CORE_MA_getLineModel(items) {
    const list = Array.isArray(items) ? items : [];

    const explicitSymbolItem = CORE_MA_getPrimarySymbolItem(list);
    let noteItem = null;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const it = list[i];
      if (it && it.type === 'note') { noteItem = it; break; }
    }

    const realStatusItem = CORE_MA_getLatestStatusItem(list, { includeSynthetic: false });

    let primarySymbolItem = explicitSymbolItem || null;
    let primarySymbolId = VIEW_MA_resolveSymbolSemanticId(primarySymbolItem?.data?.key, primarySymbolItem?.data?.symbol) || '';
    let primaryColor = String(
      primarySymbolItem?.ui?.color
      || primarySymbolItem?.data?.color
      || VIEW_MA_getSymbolDef(primarySymbolId)?.defaultColor
      || ''
    ).trim();
    let primarySource = primarySymbolId ? 'symbol' : '';

    if (primarySymbolId === 'note') {
      primarySource = 'note';
      if (noteItem) primaryColor = CORE_MA_getNoteColor(noteItem);
      else if (!primaryColor) primaryColor = VIEW_MA_getSymbolDef('note')?.defaultColor || '#ffd24a';
    }

    if (!primarySymbolId && noteItem) {
      primarySymbolItem = null;
      primarySymbolId = 'note';
      primaryColor = CORE_MA_getNoteColor(noteItem);
      primarySource = 'note';
    } else if (!primarySymbolId && realStatusItem) {
      primarySymbolItem = null;
      primarySymbolId = 'pin';
      primaryColor = VIEW_MA_getSymbolDef('pin')?.defaultColor || '#22d3ee';
      primarySource = 'status';
    }

    const statusHidden = realStatusItem
      ? !!realStatusItem?.ui?.hidden
      : ((primarySource === 'note' && noteItem) ? !!noteItem?.ui?.statusHidden : false);

    return {
      explicitSymbolItem,
      primarySymbolItem,
      primarySymbolId,
      primaryColor,
      primarySource,
      noteItem,
      statusItem: realStatusItem || null,
      statusHidden,
    };
  }

  function CORE_MA_toggleStatusVisibility(msgEl, anchorOff) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return false;

    const store = STATE_loadStoreV1();
    const b = STATE_getBucket(store, msgId, anchorOff);
    if (!b || !Array.isArray(b.items)) return false;

    const model = CORE_MA_getLineModel(b.items);

    if (model.statusItem) {
      model.statusItem.ui = Object.assign({}, model.statusItem.ui || {}, {
        hidden: !model.statusItem?.ui?.hidden,
      });
      const saved = STATE_saveStoreV1(store);
      STATE_syncSymbolsForMsg(saved, msgId, { emit: true });
      OBS_MA_scheduleRepaint(msgEl);
      return true;
    }

    if (model.primarySymbolId === 'note' && model.noteItem) {
      model.noteItem.ui = Object.assign({}, model.noteItem.ui || {}, {
        statusHidden: !model.noteItem?.ui?.statusHidden,
      });
      const saved = STATE_saveStoreV1(store);
      STATE_syncSymbolsForMsg(saved, msgId, { emit: true });
      OBS_MA_scheduleRepaint(msgEl);
      return true;
    }

    return false;
  }

  function CORE_MA_addItem(msgEl, a, item) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId || !item) return;

    const store = STATE_loadStoreV1();
    const b = STATE_getOrCreateBucket(store, msgId, a);
    if (!Array.isArray(b.items)) b.items = [];

    const next = Object.assign({}, item);
    if (next.ts == null) next.ts = Date.now();

    if (next.type === 'symbol') {
      const symbolId = VIEW_MA_resolveSymbolSemanticId(next?.data?.key, next?.data?.symbol) || 'arrow';
      const def = VIEW_MA_getSymbolDef(symbolId) || VIEW_MA_getSymbolDef('arrow');
      const color = String(next?.ui?.color || next?.data?.color || def?.defaultColor || '#ffffff').trim() || (def?.defaultColor || '#ffffff');
      next.data = Object.assign({}, next.data || {}, {
        key: symbolId,
        symbol: VIEW_MA_getSymbolLegacyToken(symbolId),
        color,
      });
      next.ui = Object.assign({}, next.ui || {}, { color });
      b.items = b.items.filter((it) => !(it && it.type === 'symbol'));
      b.items.push(next);
    } else if (next.type === 'status') {
      const state = String(next?.data?.state || '').trim();
      if (!state || state === 'note') return;
      const label = String(next?.data?.label || next?.ui?.label || '').trim();
      const color = String(next?.ui?.color || next?.data?.color || '').trim();
      next.data = Object.assign({}, next.data || {}, {
        state,
        ...(state === 'custom' ? { label } : { label: '' }),
        ...(state === 'custom' && color ? { color } : {}),
      });
      next.ui = Object.assign({}, next.ui || {}, {
        hidden: !!next?.ui?.hidden,
        ...(state === 'custom' && color ? { color } : {}),
        ...(state === 'custom' && label ? { label } : {}),
      });
      b.items = b.items.filter((it) => !(it && it.type === 'status'));
      b.items.push(next);
    } else if (next.type === 'note') {
      const color = String(next?.ui?.color || next?.data?.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a').trim();
      next.data = Object.assign({}, next.data || {}, { color });
      next.ui = Object.assign({}, next.ui || {}, {
        color,
        statusHidden: !!next?.ui?.statusHidden,
      });
      b.items.push(next);
    } else {
      b.items.push(next);
    }

    if ((store[msgId] || []).length > CFG_MANCHOR.MAX_PINS_PER_MSG) {
      store[msgId] = store[msgId].slice(0, CFG_MANCHOR.MAX_PINS_PER_MSG);
    }

    const saved = STATE_saveStoreV1(store);
    STATE_syncSymbolsForMsg(saved, msgId, { emit: true });
    if (next?.type === 'note' || next?.type === 'status') CORE_MA_syncAutoNoteStatus(msgEl, a.off);
    OBS_MA_scheduleRepaint(msgEl);
  }


  function CORE_MA_upsertRangeBrace(msgEl, startAnchor, endAnchor, opts = {}) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId || !startAnchor || !endAnchor) return '';

    const startOffRaw = Number(startAnchor?.off);
    const endOffRaw = Number(endAnchor?.off);
    if (!Number.isFinite(startOffRaw) || !Number.isFinite(endOffRaw)) return '';

    const a1 = (startOffRaw <= endOffRaw) ? startAnchor : endAnchor;
    const a2 = (startOffRaw <= endOffRaw) ? endAnchor : startAnchor;
    const lane = CORE_MA_normalizeRangeBraceLane(opts.lane || opts.laneId || '');
    const color = String(opts.color || CFG_MANCHOR.RANGE_BRACE_COLOR || '#cbd5e1').trim() || '#cbd5e1';
    const shape = CORE_MA_normalizeConnectorShape(opts.shape || opts.connectorShape || 'brace');
    const statement = CORE_MA_clipStatementText(opts.statement || opts.tipText || '');
    const noteText = String(opts.noteText || '').trim();
    const state = String(opts.tipState || opts.state || '').trim();
    const label = String(opts.tipLabel || opts.label || '').trim();
    const tipColor = String(opts.tipColor || opts.color || '').trim();
    const itemId = String(opts.itemId || '').trim() || UTIL_uid();

    const store = STATE_loadStoreV1();
    const bucket = STATE_getOrCreateBucket(store, msgId, a1);
    if (!Array.isArray(bucket.items)) bucket.items = [];

    const next = {
      id: itemId,
      type: 'range-brace',
      ts: Date.now(),
      data: {
        startOff: Number(a1.off),
        startFp: String(a1.fp || ''),
        endOff: Number(a2.off),
        endFp: String(a2.fp || ''),
        lane,
        color,
        shape,
        statement: statement || '',
        noteText: noteText || '',
        tipState: state || '',
        tipLabel: state === 'custom' ? label : '',
        tipColor: state === 'custom' ? tipColor : '',
        tipText: '',
      },
      ui: {
        lane,
        color,
        shape,
        statement: statement || '',
        noteText: noteText || '',
        tipState: state || '',
        tipLabel: state === 'custom' ? label : '',
        tipColor: state === 'custom' ? tipColor : '',
        tipText: '',
      },
    };

    const idx = bucket.items.findIndex((it) => it && it.id === itemId);
    if (idx >= 0) bucket.items[idx] = next;
    else bucket.items.push(next);

    const saved = STATE_saveStoreV1(store);
    STATE_syncSymbolsForMsg(saved, msgId, { emit: true });
    OBS_MA_scheduleRepaint(msgEl);
    return itemId;
  }

  function CORE_MA_removeRangeBrace(msgEl, startOff, itemId) {
    if (!itemId) return false;
    CORE_MA_removeItem(msgEl, Number(startOff), String(itemId));
    return true;
  }

  function CORE_MA_listRangeBraces(msgEl) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return [];
    const store = STATE_loadStoreV1();
    const buckets = Array.isArray(store[msgId]) ? store[msgId] : [];
    const out = [];
    for (const bucket of buckets) {
      const braceItems = CORE_MA_getRangeBraceItems(bucket?.items);
      for (const it of braceItems) {
        out.push({
          id: String(it?.id || ''),
          startOff: Number(bucket?.a?.off ?? it?.data?.startOff ?? 0),
          endOff: Number(it?.data?.endOff ?? bucket?.a?.off ?? 0),
          lane: CORE_MA_normalizeRangeBraceLane(it?.ui?.lane || it?.data?.lane || ''),
          color: String(it?.ui?.color || it?.data?.color || CFG_MANCHOR.RANGE_BRACE_COLOR || '#cbd5e1').trim(),
          shape: CORE_MA_normalizeConnectorShape(it?.ui?.shape || it?.data?.shape || 'brace'),
          statement: CORE_MA_getConnectorStatementText(it),
          noteText: CORE_MA_getConnectorNoteText(it),
          tipText: String(it?.ui?.tipText || it?.data?.tipText || '').trim(),
          tipState: String(it?.ui?.tipState || it?.data?.tipState || '').trim(),
          tipLabel: String(it?.ui?.tipLabel || it?.data?.tipLabel || '').trim(),
          tipColor: String(it?.ui?.tipColor || it?.data?.tipColor || '').trim(),
        });
      }
    }
    return out.sort((a, b) => (a.startOff - b.startOff) || (a.endOff - b.endOff));
  }

  function CORE_MA_cloneAnchor(a) {
    const off = Number(a?.off);
    return {
      off: Number.isFinite(off) ? off : 0,
      fp: String(a?.fp || ''),
    };
  }

  function CORE_MA_getPendingRangeDraft() {
    return STORE_MA_isObj(STATE.rangeDraft) ? STATE.rangeDraft : null;
  }

  function CORE_MA_hasPendingRangeDraft() {
    return !!CORE_MA_getPendingRangeDraft();
  }

  function CORE_MA_clearPendingRangeDraft() {
    const prev = CORE_MA_getPendingRangeDraft();
    STATE.rangeDraft = null;
    if (prev?.msgEl instanceof HTMLElement) OBS_MA_scheduleRepaint(prev.msgEl);
    return prev;
  }

  function CORE_MA_beginPendingRangeDraft(msgEl, startAnchor, opts = {}) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId || !startAnchor) return null;

    const prev = CORE_MA_getPendingRangeDraft();
    STATE.rangeDraft = {
      msgId,
      msgEl,
      startAnchor: CORE_MA_cloneAnchor(startAnchor),
      lane: CORE_MA_normalizeRangeBraceLane(opts.lane || opts.laneId || CFG_MANCHOR.RANGE_BRACE_LANE_ID),
      color: String(opts.color || CFG_MANCHOR.RANGE_BRACE_COLOR || '#cbd5e1').trim() || '#cbd5e1',
      shape: CORE_MA_normalizeConnectorShape(opts.shape || opts.connectorShape || 'brace'),
      tipText: CORE_MA_clipStatementText(opts.tipText || opts.statement || ''),
      ts: Date.now(),
    };

    if (prev?.msgEl instanceof HTMLElement && prev.msgEl !== msgEl) OBS_MA_scheduleRepaint(prev.msgEl);
    if (msgEl instanceof HTMLElement) OBS_MA_scheduleRepaint(msgEl);
    return STATE.rangeDraft;
  }

  function CORE_MA_isPendingRangeStart(msgEl, anchor) {
    const draft = CORE_MA_getPendingRangeDraft();
    const msgId = UTIL_getMsgId(msgEl);
    const off = Number(anchor?.off);
    return !!(draft && msgId && draft.msgId === msgId && Number(draft?.startAnchor?.off) === off);
  }

  function CORE_MA_tryCompletePendingRange(msgEl, endAnchor, ui = {}) {
    const draft = CORE_MA_getPendingRangeDraft();
    if (!draft || !endAnchor) return false;

    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId || draft.msgId !== msgId) return false;

    const startOff = Number(draft?.startAnchor?.off);
    const endOff = Number(endAnchor?.off);
    if (!Number.isFinite(startOff) || !Number.isFinite(endOff) || startOff === endOff) return false;

    const itemId = CORE_MA_upsertRangeBrace(msgEl, draft.startAnchor, endAnchor, {
      lane: draft.lane,
      color: draft.color,
      shape: draft.shape || 'brace',
      statement: draft.tipText,
    });
    if (!itemId) return false;

    const prev = CORE_MA_clearPendingRangeDraft();
    if (prev?.msgEl instanceof HTMLElement && prev.msgEl !== msgEl) OBS_MA_scheduleRepaint(prev.msgEl);
    if (msgEl instanceof HTMLElement) OBS_MA_scheduleRepaint(msgEl);

    if (ui?.openMenu !== false) {
      W.requestAnimationFrame(() => {
        try {
          UI_MA_openMenu({
            msgEl,
            anchor: CORE_MA_cloneAnchor(endAnchor),
            clientX: Number(ui?.clientX) || 0,
            clientY: Number(ui?.clientY) || 0,
          });
        } catch {}
      });
    }

    return true;
  }

  function CORE_MA_patchItem(msgEl, a, itemId, patch, opts) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return false;

    const store = STATE_loadStoreV1();
    const b = STATE_getOrCreateBucket(store, msgId, a);
    const items = Array.isArray(b.items) ? b.items : [];
    const idx = items.findIndex((it) => it && it.id === itemId);
    if (idx < 0) return false;

    const it = Object.assign({}, items[idx]);
    const p = patch || {};
    if (p.data) it.data = Object.assign({}, it.data || {}, p.data);
    if (p.ui)   it.ui   = Object.assign({}, it.ui   || {}, p.ui);
    if (opts?.bumpTs !== false) it.ts = Date.now();
    else if (it.ts == null) it.ts = Date.now();

    if (it.type === 'symbol') {
      const symbolId = VIEW_MA_resolveSymbolSemanticId(it?.data?.key, it?.data?.symbol) || 'arrow';
      const def = VIEW_MA_getSymbolDef(symbolId) || VIEW_MA_getSymbolDef('arrow');
      const color = String(it?.ui?.color || it?.data?.color || def?.defaultColor || '#ffffff').trim() || (def?.defaultColor || '#ffffff');
      it.data = Object.assign({}, it.data || {}, {
        key: symbolId,
        symbol: VIEW_MA_getSymbolLegacyToken(symbolId),
        color,
      });
      it.ui = Object.assign({}, it.ui || {}, { color });
      b.items = items.filter((row, i) => !(row && row.type === 'symbol' && i !== idx));
      b.items[b.items.findIndex((row) => row && row.id === itemId)] = it;
    } else if (it.type === 'status') {
      const state = String(it?.data?.state || '').trim();
      if (!state || state === 'note') return false;
      const label = String(it?.data?.label || it?.ui?.label || '').trim();
      const color = String(it?.ui?.color || it?.data?.color || '').trim();
      it.data = Object.assign({}, it.data || {}, {
        state,
        ...(state === 'custom' ? { label } : { label: '' }),
        ...(state === 'custom' && color ? { color } : {}),
      });
      it.ui = Object.assign({}, it.ui || {}, {
        hidden: !!it?.ui?.hidden,
        ...(state === 'custom' && color ? { color } : {}),
        ...(state === 'custom' && label ? { label } : {}),
      });
      b.items = items.filter((row, i) => !(row && row.type === 'status' && i !== idx));
      b.items[b.items.findIndex((row) => row && row.id === itemId)] = it;
    } else if (it.type === 'note') {
      const color = String(it?.ui?.color || it?.data?.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a').trim();
      it.data = Object.assign({}, it.data || {}, { color });
      it.ui = Object.assign({}, it.ui || {}, {
        color,
        statusHidden: !!it?.ui?.statusHidden,
      });
      items[idx] = it;
      b.items = items;
    } else {
      items[idx] = it;
      b.items = items;
    }

    const saved = STATE_saveStoreV1(store);
    STATE_syncSymbolsForMsg(saved, msgId, { emit: true });
    if (it.type === 'note' || it.type === 'status') CORE_MA_syncAutoNoteStatus(msgEl, a.off);
    if (opts?.repaint !== false) OBS_MA_scheduleRepaint(msgEl);
    return true;
  }

  function CORE_MA_updateItem(msgEl, a, itemId, patch) {
    CORE_MA_patchItem(msgEl, a, itemId, patch, { repaint: true, bumpTs: true });
  }

  function CORE_MA_removeItem(msgEl, off, itemId) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return;

    const store = STATE_loadStoreV1();
    const b = STATE_getBucket(store, msgId, off);
    if (!b) return;

    const it0 = (b.items || []).find((it) => it && it.id === itemId);
    const t0 = it0?.type || '';

    b.items = (b.items || []).filter((it) => it?.id !== itemId);

    store[msgId] = (store[msgId] || []).filter((x) => (x.items || []).length > 0);
    if (!(store[msgId] || []).length) delete store[msgId];

    const saved = STATE_saveStoreV1(store);
    STATE_syncSymbolsForMsg(saved, msgId, { emit: true });

    if (t0 === 'note' || t0 === 'status') CORE_MA_syncAutoNoteStatus(msgEl, off);
    OBS_MA_scheduleRepaint(msgEl);
  }

  /** @helper Removes ALL status items from a given anchor line (one-status-per-line rule). */
  function CORE_MA_clearStatuses(msgEl, anchorOff) {
    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return 0;

    const store = STATE_loadStoreV1();
    const b = STATE_getBucket(store, msgId, anchorOff);
    if (!b || !Array.isArray(b.items)) return 0;

    const before = b.items.length;
    b.items = b.items.filter((it) => !(it && it.type === 'status'));
    const removed = before - b.items.length;

    if (!b.items.length) {
      store[msgId] = (store[msgId] || []).filter((x) => x && x !== b && (x.items || []).length);
      if (!(store[msgId] || []).length) delete store[msgId];
    }

    if (removed) {
      const saved = STATE_saveStoreV1(store);
      STATE_syncSymbolsForMsg(saved, msgId, { emit: true });
      OBS_MA_scheduleRepaint(msgEl);
    }
    return removed;
  }

/** @helper Auto-maintains a lightweight "note" status only when the line has notes and no real status. */
function CORE_MA_syncAutoNoteStatus(msgEl, anchorOff) {
  const msgId = UTIL_getMsgId(msgEl);
  if (!msgId) return 0;

  const store = STATE_loadStoreV1();
  const b = STATE_getBucket(store, msgId, anchorOff);
  if (!b || !Array.isArray(b.items)) return 0;

  const before = b.items.length;
  b.items = b.items.filter((it) => !(
    it &&
    it.type === 'status' &&
    String(it?.data?.state || '').trim() === 'note'
  ));
  const removed = before - b.items.length;

  if (!removed) return 0;

  if (!b.items.length) {
    store[msgId] = (store[msgId] || []).filter((x) => x && x !== b && (x.items || []).length);
    if (!(store[msgId] || []).length) delete store[msgId];
  }

  const saved = STATE_saveStoreV1(store);
  STATE_syncSymbolsForMsg(saved, msgId, { emit: true });
  OBS_MA_scheduleRepaint(msgEl);
  return removed;
}

  function DOM_MA_ensureGutterGuides(gutEl) {
    if (!(gutEl instanceof HTMLElement)) return;

    const want = new Set(MANCHOR_GUTTER_LANES.map((lane) => lane.id));
    const nodes = gutEl.querySelectorAll(
      `[${ATTR_CGXUI}="${UI_MANCHOR_GUTLANE}"][${ATTR_CGXUI_OWNER}="${SkID}"]`
    );

    for (const node of nodes) {
      const laneId = String(node?.dataset?.lane || '').trim();
      if (!want.has(laneId)) {
        try { node.remove(); } catch {}
      }
    }

    for (const lane of MANCHOR_GUTTER_LANES) {
      let node = gutEl.querySelector(`[${ATTR_CGXUI}="${UI_MANCHOR_GUTLANE}"][${ATTR_CGXUI_OWNER}="${SkID}"][data-lane="${lane.id}"]`);
      if (!node) {
        node = D.createElement('div');
        node.setAttribute(ATTR_CGXUI, UI_MANCHOR_GUTLANE);
        node.setAttribute(ATTR_CGXUI_OWNER, SkID);
        node.dataset.lane = lane.id;
        gutEl.appendChild(node);
      }
      node.style.left = '';
      node.style.right = String(lane.right || '0');
    }
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / MOUNT 📝🔓💥 ───────────────────────────── */
  function DOM_MA_ensureLayers(msgEl) {
    if (!msgEl) return { gut: null, marks: null };

    const prev = STATE.origPosByMsg.get(msgEl);
    if (prev == null) STATE.origPosByMsg.set(msgEl, msgEl.style.position || '');
    if (!msgEl.style.position || msgEl.style.position === 'static') msgEl.style.position = 'relative';

    const prevOv = STATE.origOverflowByMsg.get(msgEl);
    if (prevOv == null) STATE.origOverflowByMsg.set(msgEl, msgEl.style.overflow || '');
    if (msgEl.style.overflow !== 'visible') msgEl.style.overflow = 'visible';
    let gut = msgEl.querySelector(SEL_MANCHOR_GUTTER_CHILD);
    if (!gut) {
      gut = D.createElement('div');
      gut.setAttribute(ATTR_CGXUI, UI_MANCHOR_GUTTER);
      gut.setAttribute(ATTR_CGXUI_OWNER, SkID);
      msgEl.insertBefore(gut, msgEl.firstChild);
    }
    DOM_MA_ensureGutterGuides(gut);

    let marks = msgEl.querySelector(SEL_MANCHOR_MARKS_CHILD);
    if (!marks) {
      marks = D.createElement('div');
      marks.setAttribute(ATTR_CGXUI, UI_MANCHOR_MARKS);
      marks.setAttribute(ATTR_CGXUI_OWNER, SkID);
      msgEl.insertBefore(marks, msgEl.firstChild);
    }

    return { gut, marks };
  }

function CORE_MA_getStatusMeta(rawState, opts = {}) {
  const s = String(rawState || '').trim();
  const customLabel = String(opts?.label || '').trim();
  const customColor = String(opts?.color || '').trim();
  const map = {
    done:        { txt: 'DONE',        c: '#2bd576' },
    later:       { txt: 'READ LATER',  c: '#4aa8ff' },
    important:   { txt: 'IMPORTANT',   c: '#ff4a6e' },
    comeback:    { txt: 'COME BACK',   c: '#ffbf3c' },
    inprogress:  { txt: 'IN PROGRESS', c: '#60a5fa' },
    waiting:     { txt: 'WAITING',     c: '#fbbf24' },
    blocked:     { txt: 'BLOCKED',     c: '#f87171' },
    question:    { txt: 'QUESTION',    c: '#a78bfa' },
    answer:      { txt: 'ANSWER',      c: '#22d3ee' },
    revise:      { txt: 'REVISE',      c: '#ffffff' },
    notworking:  { txt: 'NOT WORKING', c: '#111827' },
    draft:       { txt: 'DRAFT',       c: '#94a3b8' },
  };
  const picked = (s === 'custom')
    ? (customLabel ? { txt: customLabel, c: (customColor || '#e5e7eb'), custom: true } : null)
    : (map[s] || (s ? { txt: String(s).toUpperCase(), c: '#e5e7eb' } : null));
  if (!picked) return null;
  return opts?.withState === false ? picked : { ...picked, state: s || (picked.custom ? 'custom' : '') };
}

function CORE_MA_getStatusItemMeta(item) {
  return CORE_MA_getStatusMeta(item?.data?.state || '', {
    label: item?.data?.label || item?.ui?.label || '',
    color: item?.ui?.color || item?.data?.color || '',
  });
}

function CORE_MA_getBraceTipStatusMeta(item) {
  return CORE_MA_getStatusMeta(item?.ui?.tipState || item?.data?.tipState || '', {
    label: item?.ui?.tipLabel || item?.data?.tipLabel || '',
    color: item?.ui?.tipColor || item?.data?.tipColor || '',
  });
}

function DOM_MA_statusInfo(items) {
  const model = CORE_MA_getLineModel(items);
  const st = model.statusItem;

  if (st) {
    const picked = CORE_MA_getStatusItemMeta(st);
    if (!picked) return null;
    return { ...picked, hidden: !!st?.ui?.hidden, itemId: st?.id || '' };
  }

  if (model.primarySymbolId === 'note') {
    const noteColor = model.noteItem
      ? CORE_MA_getNoteColor(model.noteItem)
      : (model.primaryColor || VIEW_MA_getSymbolDef('note')?.defaultColor || '#ffd24a');

    return {
      txt: 'NOTE',
      c: noteColor,
      state: 'note',
      hidden: !!model.statusHidden,
      itemId: model.noteItem?.id || '',
    };
  }

  return null;
}


  function CORE_MA_notesAPI() {
    // notes script attaches here: MOD_OBJ.api.notes = { isOpen, open, close, toggle, ensure, remove }
    return MOD_OBJ.api?.notes || null;
  }

  function CORE_MA_sectionBandsPaletteAPI() {
    return W.H2O?.SB?.sctnbnds?.api?.palette || null;
  }

  function DOM_MA_openMenuFromPoint(msgEl, clientX, clientY) {
    const a = UTIL_computeAnchorFromClick(msgEl, clientX, clientY);
    if (!a) return false;
    if (CORE_MA_tryCompletePendingRange(msgEl, a, { clientX, clientY, openMenu: true })) return true;
    UI_MA_openMenu({ msgEl, anchor: a, clientX, clientY });
    return true;
  }

  function DOM_MA_toggleSectionBandsFromGutter(msgEl, clientX, clientY) {
    const api = CORE_MA_sectionBandsPaletteAPI();
    const fn = api?.toggleFromMarginGutter;
    if (typeof fn !== 'function') return false;
    try { return fn({ msgEl, clientX, clientY }) !== false; } catch {}
    return false;
  }

  function DOM_MA_handleGutterMiddleGesture(msgEl, e) {
    if (!msgEl || !e || e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();

    const clientX = Number.isFinite(e.clientX) ? e.clientX : 0;
    const clientY = Number.isFinite(e.clientY) ? e.clientY : 0;
    const msgId = UTIL_getMsgId(msgEl);
    const now = performance.now();
    const sameMsg = (STATE.gutterMidMsgEl === msgEl) || (!!msgId && msgId === STATE.gutterMidMsgId);
    const dx = Math.abs(clientX - Number(STATE.gutterMidPoint?.x || 0));
    const dy = Math.abs(clientY - Number(STATE.gutterMidPoint?.y || 0));
    const isDouble =
      sameMsg &&
      (now - STATE.gutterMidAt) <= CFG_MANCHOR.GUTTER_DOUBLE_MIDDLE_MS &&
      dx <= CFG_MANCHOR.GUTTER_DOUBLE_MIDDLE_SLOP_PX &&
      dy <= CFG_MANCHOR.GUTTER_DOUBLE_MIDDLE_SLOP_PX;

    STATE.gutterMidAt = now;
    STATE.gutterMidMsgId = msgId;
    STATE.gutterMidMsgEl = msgEl;
    STATE.gutterMidPoint = { x: clientX, y: clientY };

    if (STATE.gutterMidTimer) {
      clearTimeout(STATE.gutterMidTimer);
      STATE.gutterMidTimer = 0;
    }

    if (isDouble) {
      UI_MA_hideMenu();
      if (!DOM_MA_toggleSectionBandsFromGutter(msgEl, clientX, clientY)) {
        DOM_MA_openMenuFromPoint(msgEl, clientX, clientY);
      }
      return;
    }

    // Delay single-middle long enough to disambiguate a same-gutter double-middle.
    STATE.gutterMidTimer = W.setTimeout(() => {
      STATE.gutterMidTimer = 0;
      DOM_MA_openMenuFromPoint(msgEl, clientX, clientY);
    }, CFG_MANCHOR.GUTTER_MIDDLE_DELAY_MS);
  }

  function DOM_MA_bindMiddleSurface(surfaceEl, msgEl) {
    if (!surfaceEl || !msgEl) return;
    const supportsAuxClick = ('onauxclick' in D);

    const suppressMiddleDown = (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const onMiddleActivate = (e) => DOM_MA_handleGutterMiddleGesture(msgEl, e);

    if (supportsAuxClick) {
      surfaceEl.addEventListener(EV_DOC_MOUSEDOWN, suppressMiddleDown, true);
      surfaceEl.addEventListener(EV_DOC_AUXCLICK, onMiddleActivate, true);
    } else {
      surfaceEl.addEventListener(EV_DOC_MOUSEDOWN, onMiddleActivate, true);
    }
  }

  function DOM_MA_syncLiveSymbolDirection(shellEl) {
    if (!(shellEl instanceof HTMLElement)) return;
    if (String(shellEl.dataset.symbolId || '') !== 'arrow') return;

    const glyph = shellEl.querySelector(`[${ATTR_CGXUI}="${UI_MANCHOR_SYMBOL_GLYPH}"][${ATTR_CGXUI_OWNER}="${SkID}"]`);
    if (!(glyph instanceof HTMLElement)) return;

    const rect = shellEl.getBoundingClientRect();
    const side = ((rect.left + rect.right) / 2) > (W.innerWidth / 2) ? 'right' : 'left';
    glyph.dataset.symbolSide = side;
    if (VIEW_MA_shouldFlipSymbol(shellEl.dataset.symbolId, side)) glyph.dataset.symbolFlip = '1';
    else delete glyph.dataset.symbolFlip;
  }

  function DOM_MA_syncLiveSymbolDirections(scopeEl) {
    if (!(scopeEl instanceof HTMLElement)) return;
    const list = scopeEl.querySelectorAll(`[${ATTR_CGXUI}="${UI_MANCHOR_PINDOT}"][${ATTR_CGXUI_OWNER}="${SkID}"][data-kind="symbol"]`);
    for (const node of list) DOM_MA_syncLiveSymbolDirection(node);
  }

  function DOM_MA_renderPins(msgEl) {
    const { marks } = DOM_MA_ensureLayers(msgEl);
    if (!marks) return;

    marks.textContent = '';

    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return;

    const store = STATE_loadStoreV1();
    const buckets = Array.isArray(store[msgId]) ? store[msgId] : [];
    const pendingDraft = CORE_MA_getPendingRangeDraft();
    const pendingForMsg = !!(pendingDraft && pendingDraft.msgId === msgId);
    if ((!Array.isArray(buckets) || !buckets.length) && !pendingForMsg) return;

    const braceFrag = D.createDocumentFragment();
    const pinFrag = D.createDocumentFragment();
    const keyFor = (off) => UTIL_noteKey(msgId, off);

    if (pendingForMsg) {
      const lane = VIEW_MA_getLaneMeta(pendingDraft?.lane || CFG_MANCHOR.RANGE_BRACE_LANE_ID);
      const color = String(pendingDraft?.color || CFG_MANCHOR.RANGE_BRACE_COLOR || '#cbd5e1').trim() || '#cbd5e1';
      const shape = CORE_MA_normalizeConnectorShape(pendingDraft?.shape || 'brace');
      const y = UTIL_anchorToY(msgEl, pendingDraft.startAnchor);
      const host = D.createElement('div');
      host.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE);
      host.setAttribute(ATTR_CGXUI_OWNER, SkID);
      host.dataset.pending = '1';
      host.dataset.lane = lane.id;
      host.style.top = `${Math.max(0, y - 10)}px`;
      host.style.height = `20px`;
      host.style.width = `${Math.max(18, Number(CFG_MANCHOR.RANGE_BRACE_W_PX) || 28)}px`;
      host.style.right = String(lane.right || '0');
      host.style.setProperty(CSS_MANCHOR_VAR_COLOR, color);

      const svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE_SVG);
      svg.setAttribute(ATTR_CGXUI_OWNER, SkID);
      svg.setAttribute('viewBox', `0 0 ${Math.max(18, Number(CFG_MANCHOR.RANGE_BRACE_W_PX) || 28)} 20`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const path = D.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', VIEW_MA_buildRangeConnectorPath(shape, Math.max(18, Number(CFG_MANCHOR.RANGE_BRACE_W_PX) || 28), 20));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', String(Number(CFG_MANCHOR.RANGE_BRACE_STROKE_PX) || 2.35));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
      host.appendChild(svg);
      const tip = D.createElement('div');
      tip.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE_TIP);
      tip.setAttribute(ATTR_CGXUI_OWNER, SkID);
      host.appendChild(tip);
      braceFrag.appendChild(host);
    }

    for (const b of buckets) {
      const items = Array.isArray(b?.items) ? b.items : [];
      if (!items.length) continue;

      const braceItems = CORE_MA_getRangeBraceItems(items);
      for (const braceIt of braceItems) {
        const startAnchor = {
          off: Number(b?.a?.off ?? braceIt?.data?.startOff ?? 0),
          fp: String(b?.a?.fp || braceIt?.data?.startFp || ''),
        };
        const endOff = Number(braceIt?.data?.endOff);
        if (!Number.isFinite(endOff)) continue;
        const endAnchor = { off: endOff, fp: String(braceIt?.data?.endFp || '') };
        const geom = VIEW_MA_buildRangeBraceGeom(msgEl, startAnchor, endAnchor);
        const lane = VIEW_MA_getLaneMeta(braceIt?.ui?.lane || braceIt?.data?.lane || CFG_MANCHOR.RANGE_BRACE_LANE_ID);
        const color = String(braceIt?.ui?.color || braceIt?.data?.color || CFG_MANCHOR.RANGE_BRACE_COLOR || '#cbd5e1').trim() || '#cbd5e1';
        const shape = CORE_MA_normalizeConnectorShape(braceIt?.ui?.shape || braceIt?.data?.shape || 'brace');
        const tipMeta = CORE_MA_getBraceTipStatusMeta(braceIt);
        const tipState = String(tipMeta?.state || braceIt?.ui?.tipState || braceIt?.data?.tipState || '').trim();
        const tipAccent = String(tipMeta?.c || color).trim() || color;
        const statementText = CORE_MA_getConnectorStatementText(braceIt);
        const noteText = CORE_MA_getConnectorNoteText(braceIt);
        const displayMode = statementText ? 'statement' : (noteText ? 'note' : (tipMeta?.txt ? 'status' : ''));
        const host = D.createElement('div');
        host.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE);
        host.setAttribute(ATTR_CGXUI_OWNER, SkID);
        host.dataset.itemId = String(braceIt?.id || '');
        host.dataset.lane = lane.id;
        host.dataset.shape = shape;
        host.style.top = `${geom.top}px`;
        host.style.height = `${geom.height}px`;
        host.style.width = `${Math.max(18, Number(CFG_MANCHOR.RANGE_BRACE_W_PX) || 28)}px`;
        host.style.right = String(lane.right || '0');
        host.style.setProperty(CSS_MANCHOR_VAR_COLOR, color);
        if (displayMode) host.dataset.contentMode = displayMode;

        const svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE_SVG);
        svg.setAttribute(ATTR_CGXUI_OWNER, SkID);
        svg.setAttribute('viewBox', `0 0 ${Math.max(18, Number(CFG_MANCHOR.RANGE_BRACE_W_PX) || 28)} ${geom.height}`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');

        const path = D.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', VIEW_MA_buildRangeConnectorPath(shape, Math.max(18, Number(CFG_MANCHOR.RANGE_BRACE_W_PX) || 28), geom.height));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', String(Number(CFG_MANCHOR.RANGE_BRACE_STROKE_PX) || 2.35));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        host.appendChild(svg);

        const openBraceMenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          UI_MA_openMenu({
            msgEl,
            anchor: startAnchor,
            clientX: Number(e.clientX) || 0,
            clientY: Number(e.clientY) || 0,
            focusBraceItemId: String(braceIt?.id || ''),
            focusBraceStartOff: Number(startAnchor?.off ?? 0),
          });
        };

        const center = D.createElement('div');
        center.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE_CENTER);
        center.setAttribute(ATTR_CGXUI_OWNER, SkID);
        center.dataset.shape = shape;

        if (displayMode === 'status' && tipMeta?.txt) {
          const statusEl = D.createElement('div');
          statusEl.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE_STATUS);
          statusEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
          statusEl.style.setProperty('--ma-range-status-accent', tipAccent);
          statusEl.textContent = tipMeta.txt;
          statusEl.title = `Connector status: ${tipMeta.txt}`;
          statusEl.addEventListener('click', openBraceMenu, true);
          center.appendChild(statusEl);
        } else if (displayMode === 'statement') {
          const statementEl = D.createElement('div');
          statementEl.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE_STATEMENT);
          statementEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
          statementEl.textContent = CORE_MA_wrapWordsForDisplay(statementText);
          statementEl.title = statementText;
          statementEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            UI_MA_openInlineStatementEditor({
              msgEl,
              brace: {
                id: String(braceIt?.id || ''),
                startOff: Number(startAnchor?.off ?? 0),
                shape,
                color,
                statement: statementText,
              },
              clientX: Number(e.clientX) || 0,
              clientY: Number(e.clientY) || 0,
            });
          }, true);
          center.appendChild(statementEl);
        } else if (displayMode === 'note') {
          const noteEl = D.createElement('div');
          noteEl.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE_NOTE);
          noteEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
          noteEl.textContent = noteText;
          noteEl.title = noteText;
          noteEl.addEventListener('click', openBraceMenu, true);
          center.appendChild(noteEl);
        }

        const tip = D.createElement('div');
        tip.setAttribute(ATTR_CGXUI, UI_MANCHOR_RANGE_TIP);
        tip.setAttribute(ATTR_CGXUI_OWNER, SkID);
        tip.title = `${CORE_MA_getConnectorShapeLabel(shape)} center`;
        tip.addEventListener('click', openBraceMenu, true);
        center.appendChild(tip);

        host.appendChild(center);

        braceFrag.appendChild(host);
      }

      const model = CORE_MA_getLineModel(items);
      const si = DOM_MA_statusInfo(items);
      const hasPrimary = !!model.primarySymbolId;
      const hasStatus = !!si;
      const statusVisible = !!(si && !si.hidden);
      const showStandaloneStatusPin = !!(statusVisible && model.primarySource === 'status' && !model.explicitSymbolItem && !model.noteItem);
      const noteIt = model.noteItem;
      const k = keyFor(b.a.off);

      if (!noteIt) {
        try {
          const notes = CORE_MA_notesAPI();
          notes?.remove?.(k);
        } catch {}
        try {
          D.dispatchEvent(new CustomEvent(EV_MANCHOR_NOTE_CLOSE_V1, { detail: { key: k } }));
        } catch {}
      }

      if (!hasPrimary && !showStandaloneStatusPin) continue;

      const y = UTIL_anchorToY(msgEl, b.a);

      const grp = D.createElement('div');
      grp.setAttribute(ATTR_CGXUI, UI_MANCHOR_PINGRP);
      grp.setAttribute(ATTR_CGXUI_OWNER, SkID);
      grp.toggleAttribute('data-has-status', hasStatus);
      grp.toggleAttribute('data-has-symbol', hasPrimary);
      grp.style.top = `${y}px`;
      grp.dataset.off = String(b.a.off);

      const openMenu = (e) => {
        if (e?.button != null && e.button !== 0) return;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        if (CORE_MA_tryCompletePendingRange(msgEl, b.a, {
          clientX: e?.clientX || 0,
          clientY: e?.clientY || 0,
          openMenu: true,
        })) return;
        UI_MA_openMenu({
          msgEl,
          anchor: b.a,
          clientX: e?.clientX || 0,
          clientY: e?.clientY || 0,
        });
      };

      grp.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target && e.target !== grp) return;
        openMenu(e);
      }, true);

      if (showStandaloneStatusPin && si?.txt) {
        const shost = D.createElement('div');
        shost.setAttribute(ATTR_CGXUI, UI_MANCHOR_PINDOT);
        shost.setAttribute(ATTR_CGXUI_OWNER, SkID);
        shost.dataset.kind = 'status';
        shost.dataset.labelOnly = '1';
        if (si.state) shost.dataset.state = si.state;
        shost.style.setProperty(CSS_MANCHOR_VAR_COLOR, si.c || '#ffffff');

        const lbl = D.createElement('div');
        lbl.setAttribute(ATTR_CGXUI, UI_MANCHOR_LABEL);
        lbl.setAttribute(ATTR_CGXUI_OWNER, SkID);
        lbl.textContent = si.txt;
        shost.appendChild(lbl);

        shost.addEventListener('pointerdown', openMenu, true);
        grp.appendChild(shost);
      }

      if (hasPrimary) {
        const symbolColor = (model.primarySource === 'status' && si?.c)
          ? si.c
          : (model.primaryColor || VIEW_MA_getSymbolDef(model.primarySymbolId)?.defaultColor || '#ffffff');

        const vm = VIEW_MA_buildSymbolViewModel(model.primarySymbolId, symbolColor, '');
        const sdot = D.createElement('div');
        sdot.setAttribute(ATTR_CGXUI, UI_MANCHOR_PINDOT);
        sdot.setAttribute(ATTR_CGXUI_OWNER, SkID);
        sdot.dataset.kind = 'symbol';
        sdot.dataset.symbolId = vm.symbolId;
        sdot.dataset.symbolKey = vm.key;
        sdot.style.setProperty(CSS_MANCHOR_VAR_COLOR, vm.color);
        sdot.title = vm.title || vm.symbolId;

        sdot.appendChild(UI_MA_createSymbolGlyphEl(vm, {
          uiToken: UI_MANCHOR_SYMBOL_GLYPH,
          side: 'left',
        }));

        sdot.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
        }, true);

        let clickTimer = 0;

        sdot.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (clickTimer) W.clearTimeout(clickTimer);
          clickTimer = W.setTimeout(() => {
            clickTimer = 0;
            CORE_MA_toggleStatusVisibility(msgEl, b.a.off);
          }, 220);
        }, true);

        sdot.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (clickTimer) {
            W.clearTimeout(clickTimer);
            clickTimer = 0;
          }

          if (vm.symbolId === 'note') {
            CORE_MA_openNotePortalAtAnchor(msgEl, b.a, { forceOpen: true });
          }
        }, true);

        grp.appendChild(sdot);
      }

      pinFrag.appendChild(grp);
      DOM_MA_syncLiveSymbolDirections(grp);
    }

    marks.appendChild(braceFrag);
    marks.appendChild(pinFrag);
  }

  function DOM_MA_bindGutter(msgEl) {
    const { gut } = DOM_MA_ensureLayers(msgEl);
    if (!gut) return;

    if (gut.getAttribute(ATTR_CGXUI_STATE) === UI_STATE_BOUND) return;
    gut.setAttribute(ATTR_CGXUI_STATE, UI_STATE_BOUND);
    DOM_MA_bindMiddleSurface(gut, msgEl);
  }

  function DOM_MA_bindMarks(msgEl) {
    const { marks } = DOM_MA_ensureLayers(msgEl);
    if (!marks) return;

    if (marks.getAttribute(ATTR_CGXUI_STATE) === UI_STATE_BOUND) return;
    marks.setAttribute(ATTR_CGXUI_STATE, UI_STATE_BOUND);
    DOM_MA_bindMiddleSurface(marks, msgEl);
  }


  function DOM_MA_attach(msgEl) {
    if (!msgEl) return;

    UI_MA_ensureStyle();
    DOM_MA_ensureLayers(msgEl);
    DOM_MA_bindGutter(msgEl);

    DOM_MA_bindMarks(msgEl);
    if (STATE.obsResize && !STATE.roObserved.has(msgEl)) {
      STATE.roObserved.add(msgEl);
      STATE.obsResize.observe(msgEl);
    }

    DOM_MA_renderPins(msgEl);
  }

  function DOM_MA_refreshAll() {
    UI_MA_ensureStyle();
    const list = D.querySelectorAll(SEL_MANCHOR_ASSISTANT);
    for (const el of list) DOM_MA_attach(el);
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES 📄🔓💧 ───────────────────────────── */
  const CSS_MA_TEXT = () => {
    const ATTR  = ATTR_CGXUI;
    const OWN   = ATTR_CGXUI_OWNER;
    const ASTATE = ATTR_CGXUI_STATE;
    const CFG   = CFG_MANCHOR;

    const GUTTER  = UI_MANCHOR_GUTTER;
    const GUTLANE = UI_MANCHOR_GUTLANE;
    const MARKS   = UI_MANCHOR_MARKS;

    const PINGRP  = UI_MANCHOR_PINGRP;
    const PINDOT  = UI_MANCHOR_PINDOT;
    const LABEL   = UI_MANCHOR_LABEL;

    const selScoped = (ui) => `[${ATTR}="${ui}"][${OWN}="${SkID}"]`;

    return `
      ${selScoped(GUTTER)}{
        position:absolute;
        top:0; left:0;
        width:${CFG.GUTTER_W_PX}px; height:100%;
        transform: translateX(${CFG.GUTTER_SHIFT_X_PX}px);
        pointer-events:auto;
        background: transparent;
        z-index:${CFG.GUTTER_Z};
        user-select:none;
      }
      ${selScoped(GUTLANE)}{
        position:absolute;
        top:0;
        bottom:0;
        width:10px;
        transform:translateX(50%);
        pointer-events:none;
      }
      ${CSS_MA_gutterGuideDots(selScoped(GUTLANE))}
      ${CSS_MA_gutterGuideModes((mode) => `:root[${ATTR_MANCHOR_GUTTER_GUIDE}="${mode}"]`, selScoped(GUTLANE))}

      ${selScoped(MARKS)}{
        position:absolute;
        top:0; left:0;
        width:${CFG.GUTTER_W_PX}px; height:100%;
        transform: translateX(${CFG.MARKS_SHIFT_X_PX}px);

        pointer-events:none;
        z-index:${CFG.PIN_Z};
        overflow: visible;
      }

      ${selScoped(PINGRP)}{
        position:absolute;
        left:0;
        width:100%;
        height:${CFG.PIN_HIT_PX}px;
        pointer-events:auto;
        z-index: 2;
      }

      ${selScoped(UI_MANCHOR_RANGE)}{
        position:absolute;
        top:0;
        width:${CFG.RANGE_BRACE_W_PX}px;
        pointer-events:none;
        transform: translateX(50%);
        color: var(${CSS_MANCHOR_VAR_COLOR});
        z-index: 0;
        filter: drop-shadow(0 0 8px color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 16%, transparent));
      }
      ${selScoped(UI_MANCHOR_RANGE_SVG)}{
        display:block;
        width:100%;
        height:100%;
        overflow:visible;
      }
      ${selScoped(UI_MANCHOR_RANGE_CENTER)}{
        position:absolute;
        left: 0;
        top: 50%;
        display:inline-flex;
        align-items:center;
        gap: 8px;
        transform: translate(-76%, -50%);
        pointer-events:none;
      }
      ${selScoped(UI_MANCHOR_RANGE)}[data-shape="bracket"] ${selScoped(UI_MANCHOR_RANGE_CENTER)}{
        transform: translate(-96%, -50%);
      }
      ${selScoped(UI_MANCHOR_RANGE_STATUS)},
      ${selScoped(UI_MANCHOR_RANGE_STATEMENT)},
      ${selScoped(UI_MANCHOR_RANGE_NOTE)},
      ${selScoped(UI_MANCHOR_RANGE_TIP)}{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        text-align:center;
        pointer-events:auto;
        cursor:pointer;
      }
      ${selScoped(UI_MANCHOR_RANGE_STATUS)}{
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: .2px;
        white-space: nowrap;
        border: 1px solid color-mix(in oklab, var(--ma-range-status-accent, var(${CSS_MANCHOR_VAR_COLOR})) 56%, rgba(255,255,255,.18));
        background: color-mix(in oklab, #0b0f14 76%, var(--ma-range-status-accent, var(${CSS_MANCHOR_VAR_COLOR})) 24%);
        color: color-mix(in oklab, var(--ma-range-status-accent, var(${CSS_MANCHOR_VAR_COLOR})) 82%, #f8fafc 18%);
        box-shadow: 0 8px 20px rgba(0,0,0,.28), 0 0 0 1px color-mix(in oklab, var(--ma-range-status-accent, var(${CSS_MANCHOR_VAR_COLOR})) 18%, transparent);
      }
      ${selScoped(UI_MANCHOR_RANGE_STATEMENT)},
      ${selScoped(UI_MANCHOR_RANGE_NOTE)}{
        max-width: 180px;
        padding: 6px 10px;
        border-radius: 12px;
        white-space: pre-wrap;
        line-height: 1.25;
        text-align: left;
        background: linear-gradient(180deg, rgba(12,15,20,.92), rgba(12,15,20,.84));
        color: #f8fafc;
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 8px 22px rgba(0,0,0,.30);
      }
      ${selScoped(UI_MANCHOR_RANGE_STATEMENT)}{
        font-size: 11px;
        font-weight: 600;
      }
      ${selScoped(UI_MANCHOR_RANGE_NOTE)}{
        font-size: 11px;
      }
      ${selScoped(UI_MANCHOR_RANGE_TIP)}{
        min-width: 12px;
        min-height: 12px;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 1px solid color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 62%, rgba(255,255,255,.18));
        background: color-mix(in oklab, #0b0f14 72%, var(${CSS_MANCHOR_VAR_COLOR}) 28%);
        box-shadow: 0 8px 20px rgba(0,0,0,.28), 0 0 0 1px color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 18%, transparent);
      }
      ${selScoped(UI_MANCHOR_RANGE_STATUS)}:hover,
      ${selScoped(UI_MANCHOR_RANGE_STATEMENT)}:hover,
      ${selScoped(UI_MANCHOR_RANGE_NOTE)}:hover,
      ${selScoped(UI_MANCHOR_RANGE_TIP)}:hover{
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(0,0,0,.34);
      }
      [${ATTR}="${UI_MANCHOR_INLINE_EDITOR}"][${OWN}="${SkID}"]{
        position:fixed;
        z-index:${CFG.POPUP_Z};
        width: 360px;
        max-width: calc(100vw - 24px);
        padding: 12px;
        border-radius: var(--ma-pop-radius, 14px);
        color: var(--ma-pop-text, #f4f6fb);
        background: linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.030));
        border: 1px solid var(--ma-pop-border, rgba(255,255,255,.12));
        box-shadow: 0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10);
        backdrop-filter: blur(14px) saturate(1.05) contrast(1.08) brightness(1.03);
        -webkit-backdrop-filter: blur(14px) saturate(1.05) contrast(1.08) brightness(1.03);
      }

      ${selScoped(PINDOT)}{
        position:absolute;
        top:0;
        width:${CFG.PIN_HIT_PX}px;
        height:${CFG.PIN_HIT_PX}px;
        border-radius:999px;
        pointer-events:auto;
        cursor:pointer;
        background: transparent;
        user-select:none;
        ${CSS_MANCHOR_VAR_COLOR}: #ffffff;
        left: 50%;
        transform: translateX(-50%);
      }

       /* One visible main body per spot: explicit symbol OR derived note OR fallback pin */
      /* defined natively from gutter RIGHT edge:
         primary = 30% from right */
      ${selScoped(PINDOT)}[data-kind="symbol"]{
        z-index: 5;
        --ma-sym-size: 28px;
        left: auto;
        right: 30%;
        top: -5px;
        width: var(--ma-sym-size);
        height: var(--ma-sym-size);
        transform: translateX(50%);
        pointer-events: auto;
      }
      ${CSS_MA_symbolShellBase(`${selScoped(PINDOT)}[data-kind="symbol"]`, selScoped(UI_MANCHOR_SYMBOL_GLYPH))}
      ${CSS_MA_symbolShellThemes((theme) => `:root[${ATTR_MANCHOR_SYMBOL_THEME}="${theme}"]`, `${selScoped(PINDOT)}[data-kind="symbol"]`)}
      ${CSS_MA_symbolShellBoxMode((boxed) => `:root[${ATTR_MANCHOR_SYMBOL_BOXED}="${boxed}"]`, `${selScoped(PINDOT)}[data-kind="symbol"]`)}
      ${CSS_MA_symbolShellPageSizes((sizeId) => `:root[${ATTR_MANCHOR_SYMBOL_PAGE_SIZE}="${sizeId}"]`, `${selScoped(PINDOT)}[data-kind="symbol"]`)}

      ${selScoped(PINDOT)}[data-kind="status"]{
        left: auto;
        right: 30%;
        top: 0;
        width: 1px;
        height: 1px;
        transform: translateX(50%);
        pointer-events: auto;
      }

       

      ${selScoped(PINDOT)}[data-kind="status"]::before,
      ${selScoped(PINDOT)}[data-kind="status"]::after{
        display:none;
      }

      ${selScoped(LABEL)}{
        position:absolute;
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
        padding: 7px 14px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .7px;
        text-transform: uppercase;
        border: 1px solid color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 54%, rgba(255,255,255,.12));
        background: color-mix(in oklab, #0b0f14 88%, transparent);
        color: var(${CSS_MANCHOR_VAR_COLOR});
        white-space: nowrap;
        box-shadow:
          0 12px 30px rgba(0,0,0,.35),
          inset 0 0 0 1px rgba(255,255,255,.03),
          0 0 0 1px color-mix(in oklab, var(${CSS_MANCHOR_VAR_COLOR}) 14%, transparent);
        pointer-events: auto;
        cursor: pointer;
      }
      ${selScoped(PINDOT)}[data-kind="status"][data-state="note"] ${selScoped(LABEL)}{
        border-radius: 999px;
      }

      /* Popup */
      [${ATTR}="${UI_MANCHOR_POP}"]{
        --ma-pop-text: var(--cgxui-prmn-text, #f4f6fb);
        --ma-pop-muted: var(--cgxui-prmn-muted, rgba(180,180,180,.5));
        --ma-pop-border: var(--cgxui-prmn-border, rgba(255,255,255,.12));
        --ma-pop-radius: var(--cgxui-prmn-radius, 14px);
        --ma-pop-accent: var(--cgxui-prmn-accent, #9ca3af);
        --ma-pop-card: var(--cgxui-prmn-card, rgba(28,29,32,0.85));
        --ma-pop-card-hover: color-mix(in srgb, var(--ma-pop-accent) 12%, var(--ma-pop-card));
        position:fixed;
        z-index:${CFG.POPUP_Z};
        max-height: calc(100vh - 24px);
        overflow: auto;
        width: 468px;
        max-width: calc(100vw - 24px);
        padding: 12px;
        border-radius: var(--ma-pop-radius);
        color: var(--ma-pop-text);
        background:
          radial-gradient(circle at 0% 0%, rgba(255,255,255,0.00), transparent 45%),
          radial-gradient(circle at 100% 100%, rgba(255,255,255,0.00), transparent 55%),
          linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.030));
        border: 1px solid var(--ma-pop-border);
        box-shadow: 0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10);
        filter: none !important;
        backdrop-filter: blur(14px) saturate(1.05) contrast(1.08) brightness(1.03);
        -webkit-backdrop-filter: blur(14px) saturate(1.05) contrast(1.08) brightness(1.03);
        font-size: 12px;
        line-height: 1.35;
        animation: cgxui-${SkID}-pop-in .18s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP}"]::-webkit-scrollbar{ width: 10px; }
      [${ATTR}="${UI_MANCHOR_POP}"]::-webkit-scrollbar-thumb{
        background: rgba(255,255,255,.14);
        border-radius: 999px;
        border: 2px solid transparent;
        background-clip: padding-box;
      }

      [${ATTR}="${UI_MANCHOR_POP_TITLE}"]{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--ma-pop-border);
      }
      [${ATTR}="${UI_MANCHOR_POP_TITLE}"] > div:first-child{
        min-width: 0;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: .02em;
        color: var(--ma-pop-text);
      }
      [${ATTR}="${UI_MANCHOR_POP_SMALL}"]{
        margin-top: 4px;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: .05em;
        text-transform: uppercase;
        color: var(--ma-pop-muted);
      }

      [${ATTR}="${UI_MANCHOR_POP_BACK}"]{
        appearance:none;
        border: 1px solid var(--ma-pop-border);
        background: rgba(255,255,255,0.02);
        color: var(--ma-pop-muted);
        border-radius: 999px;
        padding: 6px 10px;
        cursor:pointer;
        font: inherit;
        line-height: 1.1;
        transition: background .15s ease, border-color .15s ease, color .15s ease, transform .12s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP_BACK}"]:hover{
        transform: translateY(-1px);
        background: color-mix(in srgb, var(--ma-pop-accent) 12%, transparent);
        border-color: color-mix(in srgb, var(--ma-pop-accent) 35%, var(--ma-pop-border));
        color: var(--ma-pop-text);
      }
      [${ATTR}="${UI_MANCHOR_POP_BACK}"]:focus-visible{
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ma-pop-accent) 18%, transparent);
      }

      [${ATTR}="${UI_MANCHOR_POP_HUB}"]{
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      [${ATTR}="${UI_MANCHOR_POP_TOP}"]{
        display:flex;
        flex-direction:column;
        gap:8px;
      }
      [${ATTR}="${UI_MANCHOR_POP_TOPROW}"]{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
      }

      [${ATTR}="${UI_MANCHOR_POP_CHIP}"],
      [${ATTR}="${UI_MANCHOR_POP_TAB}"]{
        appearance:none;
        display:inline-flex;
        align-items:center;
        gap:8px;
        width:auto;
        min-width:0;
        border: 1px solid var(--ma-pop-border);
        background: rgba(255,255,255,0.02);
        color: var(--ma-pop-muted);
        border-radius: 999px;
        padding: 6px 10px;
        cursor:pointer;
        font: inherit;
        font-size: 11px;
        font-weight: 500;
        line-height: 1.1;
        transition: background .15s ease, transform .12s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease;
        white-space: nowrap;
        user-select:none;
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"]{
        --chipc: var(--ma-pop-accent);
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"] .cgxui-dot{
        width:8px;
        height:8px;
        border-radius:999px;
        box-shadow: 0 0 0 2px rgba(0,0,0,.26);
        opacity:.95;
        flex: 0 0 auto;
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"]:hover,
      [${ATTR}="${UI_MANCHOR_POP_TAB}"]:hover{
        transform: translateY(-1px);
        background: color-mix(in srgb, var(--ma-pop-accent) 10%, transparent);
        border-color: color-mix(in srgb, var(--ma-pop-accent) 26%, var(--ma-pop-border));
        color: var(--ma-pop-text);
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"][${ASTATE}="active"]{
        background: color-mix(in srgb, var(--chipc) 24%, rgba(255,255,255,.02));
        border-color: color-mix(in srgb, var(--chipc) 82%, var(--ma-pop-border));
        color: color-mix(in srgb, var(--chipc) 94%, #ffffff 6%);
        text-shadow: 0 0 10px color-mix(in srgb, var(--chipc) 28%, transparent);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--chipc) 34%, transparent),
          inset 0 0 0 1px color-mix(in srgb, var(--chipc) 16%, transparent),
          0 0 16px color-mix(in srgb, var(--chipc) 16%, transparent);
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"][data-chip-kind="symbol"]{
        min-width: 44px;
        min-height: 40px;
        padding: 6px;
        gap: 0;
        justify-content: center;
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"][data-chip-kind="symbol"] .cgxui-dot{
        display:none;
      }
      [${ATTR}="${UI_MANCHOR_POP_TAB}"][${ASTATE}="active"]{
        background: color-mix(in srgb, var(--ma-pop-accent) 14%, transparent);
        border-color: color-mix(in srgb, var(--ma-pop-accent) 60%, var(--ma-pop-border));
        color: var(--ma-pop-text);
      }
      [${ATTR}="${UI_MANCHOR_POP_CHIP}"]:focus-visible,
      [${ATTR}="${UI_MANCHOR_POP_TAB}"]:focus-visible{
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ma-pop-accent) 18%, transparent);
      }
      ${selScoped(UI_MANCHOR_POP_SYMICON)}{
        --ma-sym-size: 24px;
        --ma-sym-icon-pad: 4px;
        position:relative;
        width:var(--ma-sym-size);
        height:var(--ma-sym-size);
        flex:0 0 auto;
        pointer-events:none;
      }
      ${CSS_MA_symbolShellBase(selScoped(UI_MANCHOR_POP_SYMICON), selScoped(UI_MANCHOR_SYMBOL_GLYPH))}
      ${CSS_MA_symbolShellThemes((theme) => `:root[${ATTR_MANCHOR_SYMBOL_THEME}="${theme}"]`, selScoped(UI_MANCHOR_POP_SYMICON))}
      ${CSS_MA_symbolShellBoxMode((boxed) => `:root[${ATTR_MANCHOR_SYMBOL_BOXED}="${boxed}"]`, selScoped(UI_MANCHOR_POP_SYMICON))}

      [${ATTR}="${UI_MANCHOR_POP_EDITOR}"],
      [${ATTR}="${UI_MANCHOR_POP_SECTION}"],
      [${ATTR}="${UI_MANCHOR_POP_OVERVIEW}"],
      [${ATTR}="${UI_MANCHOR_POP_GROUP}"]{
        border: 1px solid var(--ma-pop-border);
        background: var(--ma-pop-card);
        border-radius: 12px;
      }
      [${ATTR}="${UI_MANCHOR_POP_EDITOR}"],
      [${ATTR}="${UI_MANCHOR_POP_SECTION}"],
      [${ATTR}="${UI_MANCHOR_POP_OVERVIEW}"]{
        padding: 10px;
      }
      [${ATTR}="${UI_MANCHOR_POP_HELP}"]{
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: .05em;
        text-transform: uppercase;
        color: var(--ma-pop-muted);
      }
      [${ATTR}="${UI_MANCHOR_POP_FIELD}"]{
        width: 100%;
        box-sizing: border-box;
        border-radius: 10px;
        border: 1px solid var(--ma-pop-border);
        background: linear-gradient(180deg, rgba(12,15,20,.84), rgba(12,15,20,.78));
        color: var(--ma-pop-text);
        padding: 9px 10px;
        outline: none;
        resize: vertical;
        min-height: 36px;
        font: inherit;
        line-height: 1.4;
        transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP_FIELD}"]::placeholder{
        color: var(--ma-pop-muted);
      }
      [${ATTR}="${UI_MANCHOR_POP_FIELD}"]:focus{
        border-color: color-mix(in srgb, var(--ma-pop-accent) 42%, var(--ma-pop-border));
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ma-pop-accent) 18%, transparent);
        background: linear-gradient(180deg, rgba(12,15,20,.9), rgba(12,15,20,.82));
      }

      [${ATTR}="${UI_MANCHOR_POP_PALETTE}"]{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
        margin-top: 10px;
      }
      [${ATTR}="${UI_MANCHOR_POP_SWATCH}"]{
        appearance:none;
        width: 26px;
        height: 26px;
        padding: 0;
        border-radius: 999px;
        border: 1px solid color-mix(in srgb, var(--c, #ffffff) 44%, var(--ma-pop-border));
        background:
          radial-gradient(circle at 35% 35%, rgba(255,255,255,.35), rgba(255,255,255,0) 52%),
          var(--c, #ffffff);
        cursor:pointer;
        transition: transform .12s ease, box-shadow .15s ease, border-color .15s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP_SWATCH}"]:hover{
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(0,0,0,.24);
      }
      [${ATTR}="${UI_MANCHOR_POP_SWATCH}"][${ASTATE}="active"]{
        box-shadow: 0 0 0 2px rgba(255,255,255,.18), 0 0 0 4px color-mix(in srgb, var(--c, #ffffff) 22%, transparent);
      }
      [${ATTR}="${UI_MANCHOR_POP_SWATCH}"]:focus-visible{
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--c, #ffffff) 20%, transparent);
      }

      [${ATTR}="${UI_MANCHOR_POP_ROW}"]{
        display:flex;
        gap:8px;
        margin-top:8px;
      }

      [${ATTR}="${UI_MANCHOR_POP_BTN}"]{
        appearance:none;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--ma-pop-border);
        background: var(--ma-pop-card);
        color: var(--ma-pop-text);
        cursor:pointer;
        flex: 1;
        font: inherit;
        line-height: 1.2;
        user-select:none;
        transition: transform .12s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP_BTN}"]:hover{
        transform: translateY(-1px);
        background: color-mix(in srgb, var(--c, var(--ma-pop-accent)) 12%, var(--ma-pop-card));
        border-color: color-mix(in srgb, var(--c, var(--ma-pop-accent)) 35%, var(--ma-pop-border));
        box-shadow: 0 6px 20px rgba(0,0,0,.25);
      }
      [${ATTR}="${UI_MANCHOR_POP_BTN}"]:focus-visible{
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--c, var(--ma-pop-accent)) 18%, transparent);
      }
      [${ATTR}="${UI_MANCHOR_POP_DOT}"]{
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--c, #fff) 78%, #0b0f14 22%);
        box-shadow: 0 0 0 2px rgba(0,0,0,.28);
      }
      [${ATTR}="${UI_MANCHOR_POP_LBL}"]{
        opacity:.96;
      }

      [${ATTR}="${UI_MANCHOR_POP_GROUP}"]{
        padding: 8px;
      }
      [${ATTR}="${UI_MANCHOR_POP_SUM}"]{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        cursor:pointer;
        user-select:none;
        list-style:none;
        padding: 0;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: .05em;
        text-transform: uppercase;
        color: var(--ma-pop-muted);
      }
      [${ATTR}="${UI_MANCHOR_POP_SUM}"]::-webkit-details-marker{ display:none; }
      [${ATTR}="${UI_MANCHOR_POP_SUM}"]::after{
        content: "▾";
        font-size: 12px;
        transition: transform .15s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP_GROUP}"]:not([open]) [${ATTR}="${UI_MANCHOR_POP_SUM}"]::after{
        transform: rotate(-90deg);
      }

      [${ATTR}="${UI_MANCHOR_POP_ITEM}"]{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 10px;
        margin-top: 8px;
        background: var(--ma-pop-card);
        border: 1px solid var(--ma-pop-border);
        transition: transform .12s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP_ITEM}"]:hover{
        transform: translateY(-1px);
        background: var(--ma-pop-card-hover);
        border-color: color-mix(in srgb, var(--ma-pop-accent) 35%, var(--ma-pop-border));
        box-shadow: 0 6px 20px rgba(0,0,0,.25);
      }
      [${ATTR}="${UI_MANCHOR_POP_ITEMTXT}"]{
        min-width: 0;
        flex: 1 1 auto;
      }
      [${ATTR}="${UI_MANCHOR_POP_ITEMTXT}"] > div:first-child{
        word-break: break-word;
      }
      [${ATTR}="${UI_MANCHOR_POP_META}"]{
        color: var(--ma-pop-muted);
        font-size: 11px;
        margin-top: 2px;
        white-space: nowrap;
      }

      [${ATTR}="${UI_MANCHOR_POP_ICONS}"]{
        display:flex;
        gap:8px;
        flex: 0 0 auto;
        align-items:center;
        padding-top: 2px;
      }
      [${ATTR}="${UI_MANCHOR_POP_ACTDOT}"]{
        appearance:none;
        width: 24px;
        height: 24px;
        padding: 0;
        border-radius: 999px;
        border: 1px solid var(--ma-pop-border);
        background: rgba(255,255,255,0.02);
        color: var(--c, #fff);
        cursor:pointer;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        transition: transform .14s ease, background .14s ease, border-color .14s ease, box-shadow .14s ease;
      }
      [${ATTR}="${UI_MANCHOR_POP_ACTDOT}"]::before{
        content:"";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        box-shadow: 0 0 0 1px rgba(255,255,255,.16);
      }
      [${ATTR}="${UI_MANCHOR_POP_ACTDOT}"]:hover{
        transform: translateY(-1px);
        background: color-mix(in srgb, var(--c, #fff) 12%, var(--ma-pop-card));
        border-color: color-mix(in srgb, var(--c, #fff) 35%, var(--ma-pop-border));
        box-shadow: 0 6px 16px rgba(0,0,0,.24);
      }
      [${ATTR}="${UI_MANCHOR_POP_ACTDOT}"]:focus-visible{
        outline: none;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--c, #fff) 18%, transparent);
      }

      /* Tabs */
      [${ATTR}="${UI_MANCHOR_POP_TABS}"]{
        display:flex;
        flex-wrap:wrap;
        gap:6px;
      }
      [${ATTR}="${UI_MANCHOR_POP_PANE}"]{
        display:flex;
        flex-direction:column;
        gap:10px;
      }

      /* Overview */
      [${ATTR}="${UI_MANCHOR_POP_KV}"]{
        display:flex;
        justify-content:space-between;
        gap:10px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--ma-pop-border);
        background: rgba(255,255,255,0.02);
        margin-top: 8px;
      }
      [${ATTR}="${UI_MANCHOR_POP_K}"]{
        color: var(--ma-pop-muted);
      }
      [${ATTR}="${UI_MANCHOR_POP_V}"]{
        color: var(--ma-pop-text);
        text-align:right;
        white-space: nowrap;
        overflow:hidden;
        text-overflow: ellipsis;
        max-width: 60%;
      }

      /* Section wrappers (Status / Attachments / Overview) */
      [${ATTR}="${UI_MANCHOR_POP_SECTITLE}"]{
        display:flex;
        align-items:center;
        gap:8px;
        padding: 0 0 8px;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: .05em;
        text-transform: uppercase;
        color: var(--ma-pop-muted);
      }
      [${ATTR}="${UI_MANCHOR_POP_SECTITLE}"] > span:first-child{
        min-width:0;
      }
      [${ATTR}="${UI_MANCHOR_POP_INFO}"]{
        position:relative;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        width:16px;
        height:16px;
        border-radius:999px;
        border:1px solid var(--ma-pop-border);
        background: rgba(255,255,255,0.03);
        color: var(--ma-pop-muted);
        font-size:10px;
        font-weight:700;
        line-height:1;
        text-transform:none;
        cursor:help;
        flex:0 0 auto;
      }
      [${ATTR}="${UI_MANCHOR_POP_INFO}"]::before{
        content:"i";
      }
      [${ATTR}="${UI_MANCHOR_POP_INFO}"]::after{
        content: attr(data-info);
        position:absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 240px;
        max-width: min(260px, calc(100vw - 48px));
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--ma-pop-border);
        background: linear-gradient(180deg, rgba(12,15,20,.96), rgba(12,15,20,.90));
        color: var(--ma-pop-text);
        box-shadow: 0 10px 28px rgba(0,0,0,.34);
        white-space: normal;
        line-height: 1.35;
        letter-spacing: 0;
        text-transform: none;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        z-index: 12;
      }
      [${ATTR}="${UI_MANCHOR_POP_INFO}"]:hover{
        color: var(--ma-pop-text);
        border-color: color-mix(in srgb, var(--ma-pop-accent) 35%, var(--ma-pop-border));
        background: color-mix(in srgb, var(--ma-pop-accent) 12%, transparent);
      }
      [${ATTR}="${UI_MANCHOR_POP_INFO}"]:hover::after{
        opacity: 1;
        visibility: visible;
      }


      @keyframes cgxui-${SkID}-pinshine{
        0%   { filter: brightness(1);   }
        40%  { filter: brightness(1.35);}
        100% { filter: brightness(1);   }
      }
      @keyframes cgxui-${SkID}-pop-in{
        from{
          opacity: 0;
          transform: translateY(8px);
        }
        to{
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Shine the pin group briefly (triggered after Jump) */
      [${ATTR}="${UI_MANCHOR_PINGRP}"][${OWN}="${SkID}"][${ASTATE}="${UI_STATE_SHINE}"] [${ATTR}="${UI_MANCHOR_PINDOT}"][${OWN}="${SkID}"]::before{
        animation: cgxui-${SkID}-pinshine 900ms ease-out 1;
        box-shadow: 0 0 0 1px rgba(255,255,255,.28),
                    0 0 22px rgba(96,165,250,.22),
                    0 14px 30px rgba(0,0,0,.45);
      }

    `;
  };

  function UI_MA_ensureStyle() {
    let style = D.getElementById(CSS_MANCHOR_STYLE_ID);
    if (!style) {
      style = D.createElement('style');
      style.id = CSS_MANCHOR_STYLE_ID;
      D.documentElement.appendChild(style);
      STATE.disposers.push(() => style.remove());
    }
    const txt = CSS_MA_TEXT();
    if (style.textContent !== txt) style.textContent = txt;
  }

  /* ───────────────────────────── 🟨 TIME — SCHEDULING / REACTIVITY 📝🔓💥 ───────────────────────────── */
  function SAFE_MA_withLocalMut(fn) {
    STATE.muting++;
    try { return fn(); } finally { STATE.muting--; }
  }

  function OBS_MA_scheduleRefreshAll() {
    if (STATE.refreshAllTimer) return;
    STATE.refreshAllTimer = setTimeout(() => {
      STATE.refreshAllTimer = 0;
      try { SAFE_MA_withLocalMut(() => DOM_MA_refreshAll()); } catch (e) { DIAG_error(e); }
    }, 120);
  }

  function OBS_MA_scheduleRepaint(msgEl) {
    const prev = STATE.repaintTimerByMsg.get(msgEl);
    if (prev) clearTimeout(prev);

    const id = setTimeout(() => {
      STATE.repaintTimerByMsg.delete(msgEl);
      try { DOM_MA_renderPins(msgEl); } catch (e) { DIAG_error(e); }
    }, CFG_MANCHOR.REBUILD_THROTTLE_MS);

    STATE.repaintTimerByMsg.set(msgEl, id);
  }

  function OBS_MA_onResize(entries) {
    for (const ent of entries || []) {
      if (ent?.target) OBS_MA_scheduleRepaint(ent.target);
    }
  }

  /* ───────────────────────────── ⚫️ LIFECYCLE — MENU + UI 📝🔓💥 ───────────────────────────── */
  function UI_MA_hideMenu() {
    if (STATE.popEl) STATE.popEl.remove();
    STATE.popEl = null;
  }

  function UI_MA_placePopup(popEl, x, y) {
    const pr = popEl.getBoundingClientRect();
    const px = Math.max(8, Math.min(x + CFG_MANCHOR.POPUP_GAP_PX, W.innerWidth - pr.width - 8));
    const py = Math.max(8, Math.min(y + CFG_MANCHOR.POPUP_GAP_PX, W.innerHeight - pr.height - 8));
    popEl.style.left = `${px}px`;
    popEl.style.top = `${py}px`;
  }

  function UI_MA_closeInlineEditor() {
    try { STATE.inlineEditorEl?.remove?.(); } catch {}
    STATE.inlineEditorEl = null;
  }

  function UI_MA_openInlineStatementEditor({ msgEl, brace, clientX = 0, clientY = 0 }) {
    if (!brace?.id) return;
    UI_MA_ensureStyle();
    UI_MA_closeInlineEditor();

    const wrap = D.createElement('div');
    wrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_INLINE_EDITOR);
    wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const help = D.createElement('div');
    help.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_HELP);
    help.setAttribute(ATTR_CGXUI_OWNER, SkID);
    help.textContent = `${CORE_MA_getConnectorShapeLabel(brace.shape)} statement`;
    wrap.appendChild(help);

    const area = D.createElement('textarea');
    area.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_FIELD);
    area.setAttribute(ATTR_CGXUI_OWNER, SkID);
    area.maxLength = Number(CFG_MANCHOR.STATEMENT_MAX_CHARS) || 150;
    area.placeholder = 'Write a statement…';
    area.value = String(brace.statement || '');
    wrap.appendChild(area);

    const meta = D.createElement('div');
    meta.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_META);
    meta.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const syncMeta = () => { meta.textContent = `${area.value.trim().length}/${Number(CFG_MANCHOR.STATEMENT_MAX_CHARS) || 150} chars • wraps every ${Number(CFG_MANCHOR.STATEMENT_WRAP_WORDS) || 4} words`; };
    syncMeta();
    area.addEventListener('input', syncMeta, true);
    wrap.appendChild(meta);

    const row = D.createElement('div');
    row.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ROW);
    row.setAttribute(ATTR_CGXUI_OWNER, SkID);
    row.appendChild(UI_MA_mkBtn('Save', brace.color || '#cbd5e1', () => {
      CORE_MA_setBraceStatement(msgEl, brace, area.value);
      UI_MA_closeInlineEditor();
    }));
    row.appendChild(UI_MA_mkBtn('Clear', '#fbbf24', () => {
      CORE_MA_setBraceStatement(msgEl, brace, '');
      UI_MA_closeInlineEditor();
    }));
    row.appendChild(UI_MA_mkBtn('Cancel', '#ffffff', UI_MA_closeInlineEditor));
    wrap.appendChild(row);

    D.body.appendChild(wrap);
    STATE.inlineEditorEl = wrap;
    UI_MA_placePopup(wrap, Number(clientX) || Math.round(W.innerWidth / 2), Number(clientY) || Math.round(W.innerHeight / 2));
    setTimeout(() => { try { area.focus(); area.select(); } catch {} }, 0);
  }

  function UI_MA_menuTitle(text, showBack, onBack, smallText = '') {
    const wrap = D.createElement('div');
    wrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TITLE);
    wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const head = D.createElement('div');
    const t = D.createElement('div');
    t.textContent = text;
    head.appendChild(t);

    if (smallText) {
      const s = D.createElement('div');
      s.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SMALL);
      s.setAttribute(ATTR_CGXUI_OWNER, SkID);
      s.textContent = smallText;
      head.appendChild(s);
    }

    wrap.appendChild(head);

    if (showBack) {
      const b = D.createElement('button');
      b.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_BACK);
      b.setAttribute(ATTR_CGXUI_OWNER, SkID);
      b.type = 'button';
      b.textContent = 'Back';
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onBack?.(); }, true);
      wrap.appendChild(b);
    }
    return wrap;
  }

  function UI_MA_mkBtn(label, color, onClick) {
    const btn = D.createElement('button');
    btn.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_BTN);
    btn.setAttribute(ATTR_CGXUI_OWNER, SkID);
    btn.type = 'button';
    btn.style.setProperty('--c', color || '#ffffff');

    const dot = D.createElement('span');
    dot.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_DOT);
    dot.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const lbl = D.createElement('span');
    lbl.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_LBL);
    lbl.setAttribute(ATTR_CGXUI_OWNER, SkID);
    lbl.textContent = label;

    btn.append(dot, lbl);
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }, true);
    return btn;
  }

  function UI_MA_mkChip(label, active, onClick, dotColor) {
    const chip = D.createElement('button');
    chip.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_CHIP);
    chip.setAttribute(ATTR_CGXUI_OWNER, SkID);
    chip.type = 'button';
    if (active) chip.setAttribute(ATTR_CGXUI_STATE, 'active');

    if (dotColor) {
      chip.style.setProperty('--chipc', dotColor);
      const dot = D.createElement('span');
      dot.className = 'cgxui-dot';
      dot.style.background = dotColor;
      chip.appendChild(dot);
    }

    const t = D.createElement('span');
    t.textContent = label;
    chip.appendChild(t);

    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { onClick && onClick(); } catch {}
    }, true);

    return chip;
  }

  function UI_MA_mkSymbolChip(def, active, onClick, opts = {}) {
    const chip = D.createElement('button');
    chip.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_CHIP);
    chip.setAttribute(ATTR_CGXUI_OWNER, SkID);
    chip.type = 'button';
    chip.dataset.chipKind = 'symbol';
    chip.style.setProperty('--chipc', String(opts.color || def?.defaultColor || '#ffffff'));
    chip.title = String(opts.title || def?.title || '');
    chip.setAttribute('aria-label', String(opts.title || def?.title || 'Symbol'));
    if (active) chip.setAttribute(ATTR_CGXUI_STATE, 'active');

    const vm = VIEW_MA_resolveSymbolViewModel({
      data: {
        key: def?.id,
        symbol: VIEW_MA_getSymbolLegacyToken(def?.id),
        color: opts.color || def?.defaultColor,
      },
      ui: { color: opts.color || def?.defaultColor },
    });

    chip.appendChild(UI_MA_createSymbolShellEl(vm, {
      uiToken: UI_MANCHOR_POP_SYMICON,
      glyphToken: UI_MANCHOR_SYMBOL_GLYPH,
      color: opts.color || def?.defaultColor,
      title: '',
      side: opts.side || 'left',
    }));

    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { onClick && onClick(); } catch {}
    }, true);

    return chip;
  }

  function UI_MA_mkActDot(color, title, onClick) {
    const b = D.createElement('button');
    b.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ACTDOT);
    b.setAttribute(ATTR_CGXUI_OWNER, SkID);
    b.type = 'button';
    b.setAttribute('aria-label', title || '');
    b.title = title || '';
    b.style.setProperty('--c', color || '#ffffff');

    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { onClick && onClick(); } catch {}
    }, true);

    return b;
  }

  function UI_MA_fmtTs(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const now = new Date();
      const sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');

      if (sameDay) return `${hh}:${mm}`;

      const yy = String(d.getFullYear());
      const mo = String(d.getMonth()+1).padStart(2,'0');
      const da = String(d.getDate()).padStart(2,'0');
      return `${yy}-${mo}-${da} ${hh}:${mm}`;
    } catch { return ''; }
  }

    function UI_MA_flashPin(msgEl, off) {
    try {
      const sel =
        `[${ATTR_CGXUI}="${UI_MANCHOR_PINGRP}"][${ATTR_CGXUI_OWNER}="${SkID}"][data-off="${String(off)}"]`;
      const grp = msgEl?.querySelector?.(sel);
      if (!grp) return;

      grp.setAttribute(ATTR_CGXUI_STATE, UI_STATE_SHINE);
      setTimeout(() => {
        try {
          if (grp.getAttribute(ATTR_CGXUI_STATE) === UI_STATE_SHINE) grp.removeAttribute(ATTR_CGXUI_STATE);
        } catch {}
      }, 950);
    } catch {}
  }


  function UI_MA_jumpToAnchor(msgEl, a) {
    try {
      const y = UTIL_anchorToY(msgEl, a);
      const r = msgEl.getBoundingClientRect();
      const top = W.scrollY + r.top + y - 140;
      W.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    } catch {}
  }

  function UI_MA_openMenu({ msgEl, anchor, clientX, clientY, focusBraceItemId = '', focusBraceStartOff = null }) {
    UI_MA_ensureStyle();
    UI_MA_hideMenu();

    const msgId = UTIL_getMsgId(msgEl);
    if (!msgId) return;

    const getPendingBrace = () => {
      const d = CORE_MA_getPendingRangeDraft();
      return (d && d.msgId === msgId) ? d : null;
    };

    let draft = null;
    let customStatusDraft = null;
    let focusedBraceItemIdLocal = String(focusBraceItemId || '').trim();
    let focusedBraceStartOffLocal = Number(focusBraceStartOff);

    const getFocusedBrace = () => {
      if (!focusedBraceItemIdLocal) return null;
      const found = CORE_MA_listRangeBraces(msgEl).find((br) => {
        if (String(br?.id || '') !== String(focusedBraceItemIdLocal || '')) return false;
        if (Number.isFinite(focusedBraceStartOffLocal)) return Number(br?.startOff) === Number(focusedBraceStartOffLocal);
        return true;
      }) || null;
      if (!found) {
        focusedBraceItemIdLocal = '';
        focusedBraceStartOffLocal = Number.NaN;
      }
      return found;
    };

    const focusBrace = (braceId, braceStartOff) => {
      focusedBraceItemIdLocal = String(braceId || '').trim();
      focusedBraceStartOffLocal = Number(braceStartOff);
    };

    const clearFocusedBrace = () => {
      focusedBraceItemIdLocal = '';
      focusedBraceStartOffLocal = Number.NaN;
    };

    let activeTab = 'actions'; // default
 // all | note | tag | link | quote | todo | file

const tabLabel = (t) => ({
  all: 'All',
  note: 'NOTES',
  tag: 'TAGS',
  link: 'LINKS',
  quote: 'QUOTES',
  todo: 'TODO',
  file: 'FILES'
}[t] || String(t).toUpperCase());

function setTab(t) {
  const allowedTabs = new Set([
    'actions',
    'overview',
    'note',
    'connectors',
    ...(CFG_MANCHOR.ENABLE_TAGS ? ['tag'] : []),
    ...(CFG_MANCHOR.ENABLE_LINKS ? ['link'] : []),
    ...(CFG_MANCHOR.ENABLE_ASKQUOTE ? ['quote'] : []),
    ...(CFG_MANCHOR.ENABLE_TODO ? ['todo'] : []),
    ...(CFG_MANCHOR.ENABLE_FILES ? ['file'] : []),
  ]);

  activeTab = allowedTabs.has(t) ? t : 'actions';
  renderHub();
}


function getSelTextWithinMsg() {
  try {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return '';
    const s = String(sel.toString() || '').trim();
    if (!s) return '';

    // only accept if selection is inside this message element
    const r = sel.getRangeAt(0);
    const common = r.commonAncestorContainer;
    const el = (common instanceof Element) ? common : common?.parentElement;
    if (!el || !msgEl.contains(el)) return '';

    return s.length > 600 ? (s.slice(0, 600) + '…') : s;
  } catch { return ''; }
}

    const popEl = D.createElement('div');
    popEl.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP);
    popEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
    STATE.popEl = popEl;
    D.body.appendChild(popEl);

    const load = () => {
      const store = STATE_loadStoreV1();
      const b = STATE_getOrCreateBucket(store, msgId, anchor);
      return { store, b, items: b.items || [] };
    };

    const getLatestStatus = (items) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it && it.type === 'status' && it.data && it.data.state) return it;
      }
      return null;
    };

    const getLatestNote = (items) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it && it.type === 'note') return it;
      }
      return null;
    };

function openEditor(mode, item, extra = {}) {
  const value =
    mode === 'note'       ? (item?.data?.text || '') :
    mode === 'tag'        ? (item?.data?.name || '') :
    mode === 'link'       ? (item?.data?.url  || '') :
    mode === 'quote'      ? (item?.data?.text || '') :
    mode === 'todo'       ? (item?.data?.text || '') :
    mode === 'file'       ? (item?.data?.ref  || '') :
    mode === 'brace-note' ? (item?.data?.noteText || item?.noteText || '') : '';

  const color = (mode === 'note')
    ? (item?.ui?.color || item?.data?.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a')
    : null;

  const done = (mode === 'todo') ? !!item?.data?.done : false;

  if (mode === 'brace-note') {
    focusBrace(item?.id || extra?.braceItemId || '', Number(extra?.braceStartOff ?? item?.startOff ?? anchor?.off ?? 0));
  }

  const autoQuote = (mode === 'quote' && !value) ? getSelTextWithinMsg() : '';

  draft = {
    mode,
    itemId: item?.id || null,
    value: (autoQuote || value),
    color,
    done,
    braceStartOff: Number(extra?.braceStartOff ?? item?.startOff ?? anchor?.off ?? 0),
  };
  renderHub();
}

function saveEditor() {
  const mode = draft?.mode;
  const v = (draft?.value || '').trim();
  if (!mode) return;

  if (mode === 'note') {
    if (!v) { draft = null; return renderHub(); }
    const c = (draft.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a');
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { text: v }, ui: { color: c } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'note', data: { text: v, color: c }, ui: { color: c } });
  }

  if (mode === 'brace-note') {
    const brace = CORE_MA_listRangeBraces(msgEl).find((br) => String(br.id) === String(draft.itemId || '') && Number(br.startOff) === Number(draft.braceStartOff));
    if (brace) CORE_MA_setBraceNote(msgEl, brace, v);
  }

  if (mode === 'tag') {
    if (!v) { draft = null; return renderHub(); }
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { name: v } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'tag', data: { name: v }, ui: {} });
  }

  if (mode === 'link') {
    if (!v) { draft = null; return renderHub(); }
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { url: v } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'link', data: { url: v }, ui: {} });
  }

  if (mode === 'quote') {
    if (!v) { draft = null; return renderHub(); }
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { text: v } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'quote', data: { text: v }, ui: {} });
  }

  if (mode === 'todo') {
    if (!v) { draft = null; return renderHub(); }
    const done = !!draft.done;
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { text: v, done } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'todo', data: { text: v, done }, ui: {} });
  }

  if (mode === 'file') {
    if (!v) { draft = null; return renderHub(); }
    if (draft.itemId) CORE_MA_updateItem(msgEl, anchor, draft.itemId, { data: { ref: v } });
    else CORE_MA_addItem(msgEl, anchor, { id: UTIL_uid(), type: 'file', data: { ref: v }, ui: {} });
  }

  draft = null;
  renderHub();
}

function renderEditor() {
  if (!draft) return null;

  const box = D.createElement('div');
  box.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_EDITOR);
  box.setAttribute(ATTR_CGXUI_OWNER, SkID);

  const help = D.createElement('div');
  help.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_HELP);
  help.setAttribute(ATTR_CGXUI_OWNER, SkID);
  help.textContent =
    draft.mode === 'note'       ? '📝 Note' :
    draft.mode === 'brace-note' ? '🧷 Connector note' :
    draft.mode === 'tag'        ? '🏷️ Tag' :
    draft.mode === 'link'       ? '🔗 Link' :
    draft.mode === 'quote'      ? '❝ Quote' :
    draft.mode === 'todo'       ? '☑️ Todo' :
    '📎 File';
  box.appendChild(help);

  const wantsArea = (draft.mode === 'note' || draft.mode === 'quote' || draft.mode === 'brace-note');
  const input = wantsArea ? D.createElement('textarea') : D.createElement('input');
  input.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_FIELD);
  input.setAttribute(ATTR_CGXUI_OWNER, SkID);
  if (input.tagName === 'INPUT') input.type = 'text';

  input.value = draft.value || '';
  input.placeholder =
    draft.mode === 'note'       ? 'Write a sticky note…' :
    draft.mode === 'brace-note' ? 'Write a connector note…' :
    draft.mode === 'tag'        ? 'Tag name…' :
    draft.mode === 'link'       ? 'Link URL…' :
    draft.mode === 'quote'      ? 'Paste or edit the quote…' :
    draft.mode === 'todo'       ? 'Todo text…' :
    'File ref (name / URL / path)…';

  input.addEventListener('input', () => { draft.value = input.value; }, true);
  box.appendChild(input);

  if (draft.mode === 'todo') {
    const row = D.createElement('div');
    row.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ROW);
    row.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const tgl = UI_MA_mkBtn(draft.done ? 'Mark as NOT done' : 'Mark as DONE', draft.done ? '#fbbf24' : '#22c55e', () => {
      draft.done = !draft.done;
      renderHub();
    });
    row.appendChild(tgl);
    box.appendChild(row);
  }

  if (draft.mode === 'note') {
    const pal = D.createElement('div');
    pal.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_PALETTE);
    pal.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const activeC = (draft.color || CFG_MANCHOR.NOTE_DEFAULT_COLOR || '#ffd24a');
    for (const c of (CFG_MANCHOR.NOTE_COLORS || [])) {
      const sw = D.createElement('button');
      sw.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SWATCH);
      sw.setAttribute(ATTR_CGXUI_OWNER, SkID);
      sw.type = 'button';
      sw.style.setProperty('--c', c);
      sw.setAttribute(ATTR_CGXUI_STATE, (c === activeC) ? 'active' : 'idle');
      sw.title = c;
      sw.addEventListener('click', () => { draft.color = c; renderHub(); }, true);
      pal.appendChild(sw);
    }
    box.appendChild(pal);
  }

  const row2 = D.createElement('div');
  row2.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ROW);
  row2.setAttribute(ATTR_CGXUI_OWNER, SkID);
  row2.appendChild(UI_MA_mkBtn('Save', '#6ee7b7', saveEditor));
  row2.appendChild(UI_MA_mkBtn('Cancel', '#ffffff', () => { draft = null; renderHub(); }));
  box.appendChild(row2);

  setTimeout(() => { try { input.focus(); } catch {} }, 0);
  return box;
}

function renderHub() {
  const { items } = load();
  const lineModel = CORE_MA_getLineModel(items);
  const focusedBrace = getFocusedBrace();
  const latestStatus = focusedBrace
    ? {
        data: {
          state: String(focusedBrace.tipState || '').trim(),
          label: String(focusedBrace.tipLabel || '').trim(),
          color: String(focusedBrace.tipColor || '').trim(),
        },
        ui: { color: String(focusedBrace.tipColor || '').trim() },
      }
    : lineModel.statusItem;
  const latestStatusMeta = focusedBrace
    ? CORE_MA_getStatusMeta(focusedBrace.tipState || '', {
        label: focusedBrace.tipLabel || '',
        color: focusedBrace.tipColor || '',
      })
    : CORE_MA_getStatusItemMeta(latestStatus);
  const latestState = String(latestStatusMeta?.state || latestStatus?.data?.state || '').trim() || null;
  const latestCustomLabel = String(
    focusedBrace
      ? (focusedBrace.tipLabel || '')
      : (latestStatus?.data?.label || latestStatus?.ui?.label || '')
  ).trim();
  const latestCustomColor = String(
    focusedBrace
      ? (focusedBrace.tipColor || '')
      : (latestStatus?.ui?.color || latestStatus?.data?.color || '')
  ).trim();
  const currentPrimaryId = lineModel.primarySymbolId || null;
  const pendingBrace = getPendingBrace();
  const pendingBraceOnThisAnchor = !!(pendingBrace && Number(pendingBrace?.startAnchor?.off) === Number(anchor?.off));
  const allBraces = CORE_MA_listRangeBraces(msgEl);
  const bracesHere = allBraces.filter((br) => Number(br?.startOff) === Number(anchor?.off) || Number(br?.endOff) === Number(anchor?.off));

  const byType = (t) => items.filter(it => it && it.type === t);
  const connectorFocusMeta = focusedBrace
    ? `${CORE_MA_getConnectorShapeLabel(focusedBrace.shape)} ${focusedBrace.startOff} → ${focusedBrace.endOff}`
    : 'No connector focused';

  const tabLabel = (k) => (
    k === 'actions'    ? 'Actions' :
    k === 'overview'   ? 'Overview' :
    k === 'note'       ? 'Notes' :
    k === 'connectors' ? 'Connectors' :
    k === 'tag'        ? 'Tags' :
    k === 'link'       ? 'Links' :
    k === 'quote'      ? 'Quotes' :
    k === 'todo'       ? 'Todo' :
    'Files'
  );

  const allowedTabs = new Set([
    'actions',
    'overview',
    'note',
    ...(CFG_MANCHOR.ENABLE_TAGS ? ['tag'] : []),
    ...(CFG_MANCHOR.ENABLE_LINKS ? ['link'] : []),
    ...(CFG_MANCHOR.ENABLE_ASKQUOTE ? ['quote'] : []),
    ...(CFG_MANCHOR.ENABLE_TODO ? ['todo'] : []),
    ...(CFG_MANCHOR.ENABLE_FILES ? ['file'] : []),
  ]);
  if (!allowedTabs.has(activeTab)) activeTab = 'actions';

  popEl.textContent = '';
  const baseMeta = `Anchor ${anchor?.off ?? 0} | ${items.length} item${items.length === 1 ? '' : 's'}`;
  const titleMeta = baseMeta;
  popEl.appendChild(UI_MA_menuTitle('Margin Anchor', false, null, titleMeta));
  const hub = D.createElement('div');
  hub.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_HUB);
  hub.setAttribute(ATTR_CGXUI_OWNER, SkID);
  popEl.appendChild(hub);

  const mkSection = (title, child, infoText = '') => {
    const sec = D.createElement('div');
    sec.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTION);
    sec.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const st = D.createElement('div');
    st.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTITLE);
    st.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const label = D.createElement('span');
    label.textContent = title;
    st.appendChild(label);
    if (infoText) {
      const info = D.createElement('span');
      info.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_INFO);
      info.setAttribute(ATTR_CGXUI_OWNER, SkID);
      info.dataset.info = infoText;
      info.title = infoText;
      st.appendChild(info);
    }
    sec.appendChild(st);
    if (child) sec.appendChild(child);
    return sec;
  };

  const applyLineStatus = (payload) => {
    const state = String(payload?.state || '').trim();
    if (!state) { CORE_MA_clearStatuses(msgEl, anchor.off); return; }
    CORE_MA_addItem(msgEl, anchor, {
      id: UTIL_uid(),
      type: 'status',
      data: { state, label: String(payload?.label || '').trim(), color: String(payload?.color || '').trim() },
      ui: { hidden: false, color: String(payload?.color || '').trim(), label: String(payload?.label || '').trim() },
      ts: Date.now(),
    });
  };

  const applyConnectorStatus = (brace, payload) => {
    if (!brace?.id) return;
    CORE_MA_setBraceStatus(msgEl, brace, payload);
  };

  const openCustomStatusEditor = () => {
    customStatusDraft = {
      label: latestState === 'custom' ? latestCustomLabel : '',
      color: latestState === 'custom' ? (latestCustomColor || '#e5e7eb') : '#e5e7eb',
    };
    renderHub();
  };

  const saveCustomStatus = () => {
    const label = String(customStatusDraft?.label || '').trim();
    const color = String(customStatusDraft?.color || '').trim() || '#e5e7eb';
    if (focusedBrace) applyConnectorStatus(focusedBrace, label ? { state: 'custom', label, color } : { state: '', label: '', color: '' });
    else applyLineStatus(label ? { state: 'custom', label, color } : { state: '', label: '', color: '' });
    customStatusDraft = null;
    renderHub();
  };

  const rowStatus = D.createElement('div');
  rowStatus.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  rowStatus.setAttribute(ATTR_CGXUI_OWNER, SkID);

  const toggleStatus = (state) => {
    if (state === 'custom') { openCustomStatusEditor(); return; }
    if (focusedBrace) {
      const cur = String(focusedBrace.tipState || '').trim() || null;
      applyConnectorStatus(focusedBrace, (cur === state) ? { state: '', label: '', color: '' } : { state, label: '', color: '' });
    } else {
      const model = CORE_MA_getLineModel(load().items);
      const cur = String(model.statusItem?.data?.state || '').trim() || null;
      if (cur === state) CORE_MA_clearStatuses(msgEl, anchor.off);
      else applyLineStatus({ state, label: '', color: '' });
    }
    customStatusDraft = null;
    renderHub();
  };

  [['Done','done','#2bd576'],['Draft','draft','#94a3b8'],['In progress','inprogress','#60a5fa'],['Waiting','waiting','#fbbf24'],['Read later','later','#4aa8ff'],['Come back','comeback','#ffbf3c'],['Question','question','#a78bfa'],['Answer','answer','#22d3ee'],['Revise','revise','#ffffff'],['Important','important','#ff4a6e'],['Blocked','blocked','#f87171'],['Not Working','notworking','#111827'],['Customize','custom',latestCustomColor || '#e5e7eb']].forEach(([lbl,state,color]) => {
    rowStatus.appendChild(UI_MA_mkChip(lbl, latestState === state, () => toggleStatus(state), color));
  });
  const statusWrap = D.createElement('div');
  statusWrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  statusWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
  statusWrap.appendChild(rowStatus);

  if (customStatusDraft) {
    const customWrap = D.createElement('div');
    customWrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_EDITOR);
    customWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const help = D.createElement('div');
    help.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_HELP);
    help.setAttribute(ATTR_CGXUI_OWNER, SkID);
    help.textContent = 'Customize status';
    customWrap.appendChild(help);
    const txt = D.createElement('input');
    txt.type = 'text';
    txt.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_FIELD);
    txt.setAttribute(ATTR_CGXUI_OWNER, SkID);
    txt.placeholder = 'Custom status text…';
    txt.value = String(customStatusDraft.label || '');
    txt.addEventListener('input', () => { customStatusDraft.label = txt.value; }, true);
    customWrap.appendChild(txt);
    const row = D.createElement('div');
    row.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ROW);
    row.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const colorField = D.createElement('input');
    colorField.type = 'color';
    colorField.value = String(customStatusDraft.color || '#e5e7eb');
    colorField.addEventListener('input', () => { customStatusDraft.color = colorField.value; }, true);
    row.appendChild(colorField);
    row.appendChild(UI_MA_mkBtn('Save custom', customStatusDraft.color || '#e5e7eb', saveCustomStatus));
    row.appendChild(UI_MA_mkBtn('Cancel', '#ffffff', () => { customStatusDraft = null; renderHub(); }));
    customWrap.appendChild(row);
    statusWrap.appendChild(customWrap);
    setTimeout(() => { try { txt.focus(); } catch {} }, 0);
  }

  const symbolDefs = VIEW_MA_getEnabledSymbolDefs(Array.from(new Set([
    ...MANCHOR_SYMBOL_CORE_IDS,
    ...MANCHOR_SYMBOL_EXPANSION_IDS,
    ...(currentPrimaryId ? [currentPrimaryId] : []),
  ])));

  const toggleSymbol = (def) => {
    const { items } = load();
    const model = CORE_MA_getLineModel(items);
    const explicitPrimary = CORE_MA_getPrimarySymbolItem(items);
    const explicitId = VIEW_MA_resolveSymbolSemanticId(explicitPrimary?.data?.key, explicitPrimary?.data?.symbol) || '';
    if (def.id === 'note') {
      if (explicitPrimary) CORE_MA_removeItem(msgEl, anchor.off, explicitPrimary.id);
      CORE_MA_ensureNoteItem(msgEl, anchor);
      renderHub();
      OBS_MA_scheduleRepaint(msgEl);
      return;
    }
    if (explicitPrimary && explicitId === def.id && model.primarySymbolId === def.id) {
      CORE_MA_removeItem(msgEl, anchor.off, explicitPrimary.id);
      renderHub();
      OBS_MA_scheduleRepaint(msgEl);
      return;
    }
    CORE_MA_addItem(msgEl, anchor, {
      id: UTIL_uid(),
      type: 'symbol',
      data: { key: def.id, symbol: VIEW_MA_getSymbolLegacyToken(def.id), color: def.defaultColor || '#ffffff' },
      ui: { color: def.defaultColor || '#ffffff' },
      ts: Date.now(),
    });
    renderHub();
    OBS_MA_scheduleRepaint(msgEl);
  };

  const rowSyms = D.createElement('div');
  rowSyms.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  rowSyms.setAttribute(ATTR_CGXUI_OWNER, SkID);
  for (const def of symbolDefs) {
    const active = currentPrimaryId === def.id;
    rowSyms.appendChild(UI_MA_mkSymbolChip(def, active, () => toggleSymbol(def), {
      color: def.id === 'note' && lineModel.noteItem ? CORE_MA_getNoteColor(lineModel.noteItem) : def.defaultColor,
      side: 'left',
      title: def.title,
    }));
  }
  const symWrap = D.createElement('div');
  symWrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  symWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
  symWrap.appendChild(rowSyms);

  const startConnectorFromHere = (shape) => {
    CORE_MA_beginPendingRangeDraft(msgEl, anchor, { lane: CFG_MANCHOR.RANGE_BRACE_LANE_ID, shape });
    UI_MA_hideMenu();
  };
  const cancelPendingBrace = () => { CORE_MA_clearPendingRangeDraft(); renderHub(); };

  const connectorWrap = D.createElement('div');
  connectorWrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  connectorWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
  const connectorRow = D.createElement('div');
  connectorRow.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  connectorRow.setAttribute(ATTR_CGXUI_OWNER, SkID);
  if (!pendingBrace) {
    connectorRow.appendChild(UI_MA_mkChip('Brace', pendingBraceOnThisAnchor && CORE_MA_normalizeConnectorShape(pendingBrace?.shape || '') === 'brace', () => startConnectorFromHere('brace'), '#cbd5e1'));
    connectorRow.appendChild(UI_MA_mkChip('Bracket', pendingBraceOnThisAnchor && CORE_MA_normalizeConnectorShape(pendingBrace?.shape || '') === 'bracket', () => startConnectorFromHere('bracket'), '#cbd5e1'));
  } else if (pendingBraceOnThisAnchor) {
    connectorRow.appendChild(UI_MA_mkChip('Cancel connector', false, cancelPendingBrace, '#f87171'));
  } else {
    connectorRow.appendChild(UI_MA_mkChip('Brace', false, () => startConnectorFromHere('brace'), '#cbd5e1'));
    connectorRow.appendChild(UI_MA_mkChip('Bracket', false, () => startConnectorFromHere('bracket'), '#cbd5e1'));
    connectorRow.appendChild(UI_MA_mkChip('Cancel', false, cancelPendingBrace, '#f87171'));
  }
  connectorWrap.appendChild(connectorRow);

  const rowAdd = D.createElement('div');
  rowAdd.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  rowAdd.setAttribute(ATTR_CGXUI_OWNER, SkID);
  rowAdd.appendChild(UI_MA_mkChip('+ Note', false, () => {
    if (focusedBrace) { openEditor('brace-note', focusedBrace, { braceStartOff: focusedBrace.startOff, braceItemId: focusedBrace.id }); return; }
    spawnStickyNoteNow();
  }, '#ffffff'));
  rowAdd.appendChild(UI_MA_mkChip('+ Statement', false, () => {
    if (!focusedBrace) return;
    UI_MA_hideMenu();
    UI_MA_openInlineStatementEditor({ msgEl, brace: focusedBrace, clientX, clientY });
  }, '#ffffff'));
  if (CFG_MANCHOR.ENABLE_TAGS) rowAdd.appendChild(UI_MA_mkChip('+ Tag', false, () => openEditor('tag'), '#ffffff'));
  if (CFG_MANCHOR.ENABLE_LINKS) rowAdd.appendChild(UI_MA_mkChip('+ Link', false, () => openEditor('link'), '#ffffff'));
  if (CFG_MANCHOR.ENABLE_ASKQUOTE) rowAdd.appendChild(UI_MA_mkChip('+ Quote', false, () => openEditor('quote'), '#ffffff'));
  if (CFG_MANCHOR.ENABLE_TODO) rowAdd.appendChild(UI_MA_mkChip('+ Todo', false, () => openEditor('todo'), '#ffffff'));
  if (CFG_MANCHOR.ENABLE_FILES) rowAdd.appendChild(UI_MA_mkChip('+ File', false, () => openEditor('file'), '#ffffff'));
  const attWrap = D.createElement('div');
  attWrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TOPROW);
  attWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
  attWrap.appendChild(rowAdd);
  const symbolInfoText = 'Choose the main line symbol. Only one primary symbol shows per line. Note creates a sticky-note owner on the line.';
  const connectorInfoText = pendingBrace
    ? (pendingBraceOnThisAnchor
        ? `${CORE_MA_getConnectorShapeLabel(pendingBrace.shape)} is armed on this line. Click the second line in the same answer, or cancel to stop.`
        : `${CORE_MA_getConnectorShapeLabel(pendingBrace.shape)} is armed at anchor ${pendingBrace?.startAnchor?.off ?? 0}. Clicking Brace or Bracket here restarts from this line.`)
    : 'Arm the current line as the start of a connector. Then click a second line in the same answer to complete it. Connector details live in the Connectors tab.';
  const statusInfoText = focusedBrace
    ? `Status is editing the focused connector only. It clears connector statement/note automatically and renders to the left of the center tip. ${connectorFocusMeta}.`
    : 'Status edits the standalone line status only. Standalone line status is the only status that renders as a gutter pin.';
  const attachmentInfoText = focusedBrace
    ? 'Attachments are owner-aware. Statement is a short on-screen sentence. Note is longer. A connector can show only one center attachment at a time: status, statement, or note.'
    : 'Without a focused connector, Note stays a normal sticky note on the line. Statement belongs to a focused connector only.';

  const buildPane = () => {
    const pane = D.createElement('div');
    pane.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_PANE);
    pane.setAttribute(ATTR_CGXUI_OWNER, SkID);
    return pane;
  };
  const buildActionsPane = () => {
    const pane = buildPane();
    pane.appendChild(mkSection('Symbol', symWrap, symbolInfoText));
    pane.appendChild(mkSection('Connector', connectorWrap, connectorInfoText));
    pane.appendChild(mkSection('Status', statusWrap, statusInfoText));
    pane.appendChild(mkSection('Attachment', attWrap, attachmentInfoText));
    if (draft) {
      const ed = renderEditor();
      if (ed) pane.appendChild(ed);
    }
    return pane;
  };

  const tabs = D.createElement('div');
  tabs.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TABS);
  tabs.setAttribute(ATTR_CGXUI_OWNER, SkID);
  const tabDefs = [
    { k: 'actions', ok: true },
    { k: 'overview', ok: true },
    { k: 'note', ok: true },
    { k: 'connectors', ok: true },
    { k: 'tag', ok: !!CFG_MANCHOR.ENABLE_TAGS },
    { k: 'link', ok: !!CFG_MANCHOR.ENABLE_LINKS },
    { k: 'quote', ok: !!CFG_MANCHOR.ENABLE_ASKQUOTE },
    { k: 'todo', ok: !!CFG_MANCHOR.ENABLE_TODO },
    { k: 'file', ok: !!CFG_MANCHOR.ENABLE_FILES }
  ].filter(x => x.ok);
  for (const t of tabDefs) {
    const b = D.createElement('button');
    b.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_TAB);
    b.setAttribute(ATTR_CGXUI_OWNER, SkID);
    b.type = 'button';
    if (activeTab === t.k) b.setAttribute(ATTR_CGXUI_STATE, 'active');
    const cnt = (t.k === 'actions' || t.k === 'overview') ? '' : t.k === 'note' ? byType('note').length : t.k === 'connectors' ? bracesHere.length : t.k === 'tag' ? byType('tag').length : t.k === 'link' ? byType('link').length : t.k === 'quote' ? byType('quote').length : t.k === 'todo' ? byType('todo').length : byType('file').length;
    b.textContent = (t.k === 'actions' || t.k === 'overview') ? tabLabel(t.k) : `${tabLabel(t.k)} (${cnt})`;
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setTab(t.k); }, true);
    tabs.appendChild(b);
  }

  const mkItem = (it, main, meta, canEdit, onEdit) => mkItemRow(it, main, meta, canEdit, onEdit);
  const renderConnectorsPane = () => {
    const pane = buildPane();
    const wrap = D.createElement('div');
    wrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTION);
    wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const st = D.createElement('div');
    st.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTITLE);
    st.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const label = D.createElement('span');
    label.textContent = 'Connectors';
    st.appendChild(label);
    const info = D.createElement('span');
    info.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_INFO);
    info.setAttribute(ATTR_CGXUI_OWNER, SkID);
    info.dataset.info = 'This tab shows connectors that touch the current anchor line. Use the action dots to focus, jump, or delete.';
    info.title = info.dataset.info;
    st.appendChild(info);
    wrap.appendChild(st);

    const ov = D.createElement('div');
    ov.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_OVERVIEW);
    ov.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const mkKV = (k, v) => { const kv = D.createElement('div'); kv.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_KV); kv.setAttribute(ATTR_CGXUI_OWNER, SkID); const kk = D.createElement('div'); kk.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_K); kk.setAttribute(ATTR_CGXUI_OWNER, SkID); kk.textContent = k; const vv = D.createElement('div'); vv.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_V); vv.setAttribute(ATTR_CGXUI_OWNER, SkID); vv.textContent = v; kv.append(kk, vv); return kv; };
    ov.appendChild(mkKV('Touching this line', String(bracesHere.length)));
    ov.appendChild(mkKV('Focused connector', connectorFocusMeta));
    ov.appendChild(mkKV('Pending connector', pendingBrace ? `${CORE_MA_getConnectorShapeLabel(pendingBrace.shape)} @ ${pendingBrace?.startAnchor?.off ?? 0}` : '—'));
    wrap.appendChild(ov);

    if (bracesHere.length) {
      const connectorList = D.createElement('div');
      connectorList.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_LIST);
      connectorList.setAttribute(ATTR_CGXUI_OWNER, SkID);
      for (const br of bracesHere) {
        const row = D.createElement('div');
        row.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ITEM);
        row.setAttribute(ATTR_CGXUI_OWNER, SkID);
        const txt = D.createElement('div');
        txt.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ITEMTXT);
        txt.setAttribute(ATTR_CGXUI_OWNER, SkID);
        const main = D.createElement('div');
        main.textContent = `${CORE_MA_getConnectorShapeLabel(br.shape)} ${br.startOff} → ${br.endOff}`;
        txt.appendChild(main);
        const meta = D.createElement('div');
        meta.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_META);
        meta.setAttribute(ATTR_CGXUI_OWNER, SkID);
        const bits = [`Lane: ${br.lane}`];
        const brStatus = CORE_MA_getBraceTipStatusMeta(br)?.txt;
        if (brStatus) bits.push(`Status: ${brStatus}`);
        if (br.statement) bits.push(`Statement: ${br.statement.slice(0, 42)}${br.statement.length > 42 ? '…' : ''}`);
        if (br.noteText) bits.push(`Note: ${br.noteText.slice(0, 42)}${br.noteText.length > 42 ? '…' : ''}`);
        meta.textContent = bits.join(' • ');
        txt.appendChild(meta);
        const icons = D.createElement('div');
        icons.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_ICONS);
        icons.setAttribute(ATTR_CGXUI_OWNER, SkID);
        const otherOff = Number(br.startOff) === Number(anchor?.off) ? Number(br.endOff) : Number(br.startOff);
        icons.appendChild(UI_MA_mkActDot('#22c55e', 'Focus connector', () => { focusBrace(br.id, br.startOff); draft = null; renderHub(); }));
        icons.appendChild(UI_MA_mkActDot('#3b82f6', 'Jump to other end', () => { UI_MA_hideMenu(); UI_MA_jumpToAnchor(msgEl, { off: otherOff, fp: '' }); setTimeout(() => UI_MA_flashPin(msgEl, otherOff), 220); }));
        icons.appendChild(UI_MA_mkActDot('#ef4444', 'Delete connector', () => { CORE_MA_removeRangeBrace(msgEl, br.startOff, br.id); if (String(focusedBraceItemIdLocal) === String(br.id)) clearFocusedBrace(); renderHub(); }));
        row.append(txt, icons);
        connectorList.appendChild(row);
      }
      wrap.appendChild(connectorList);
    } else {
      const empty = D.createElement('div');
      empty.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_META);
      empty.setAttribute(ATTR_CGXUI_OWNER, SkID);
      empty.textContent = 'No connectors touch this line yet.';
      wrap.appendChild(empty);
    }

    pane.appendChild(wrap);
    return pane;
  };
  const renderListFor = (type) => {
    const arr = byType(type);
    return mkGroup(tabLabel(type), arr, (it) => {
      if (type === 'note') { const txt = (it.data?.text || '').trim(); const one = txt.length > 56 ? (txt.slice(0, 56) + '…') : txt; return mkItem(it, one || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('note', it)); }
      if (type === 'tag') { const nm = `#${(it.data?.name || '').trim() || 'tag'}`; return mkItem(it, nm, UI_MA_fmtTs(it.ts), true, () => openEditor('tag', it)); }
      if (type === 'link') { const url = (it.data?.url || '').trim(); const one = url.length > 56 ? (url.slice(0, 56) + '…') : url; return mkItem(it, one || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('link', it)); }
      if (type === 'quote') { const q = (it.data?.text || '').trim(); const one = q.length > 56 ? (q.slice(0, 56) + '…') : q; return mkItem(it, one || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('quote', it)); }
      if (type === 'todo') { const t = (it.data?.text || '').trim(); const one = t.length > 56 ? (t.slice(0, 56) + '…') : t; const done = !!it.data?.done; const label = done ? `✅ ${one}` : `⬜ ${one}`; return mkItem(it, label || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('todo', it)); }
      const ref = (it.data?.ref || '').trim(); const one = ref.length > 56 ? (ref.slice(0, 56) + '…') : ref; return mkItem(it, one || '—', UI_MA_fmtTs(it.ts), true, () => openEditor('file', it));
    }, true);
  };

  if (activeTab === 'actions') {
    hub.appendChild(buildActionsPane());
  } else if (activeTab === 'overview') {
    const wrap = D.createElement('div');
    wrap.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTION);
    wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const st = D.createElement('div');
    st.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_SECTITLE);
    st.setAttribute(ATTR_CGXUI_OWNER, SkID);
    st.textContent = 'Overview';
    wrap.appendChild(st);
    const ov = D.createElement('div');
    ov.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_OVERVIEW);
    ov.setAttribute(ATTR_CGXUI_OWNER, SkID);
    const mkKV = (k, v) => { const kv = D.createElement('div'); kv.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_KV); kv.setAttribute(ATTR_CGXUI_OWNER, SkID); const kk = D.createElement('div'); kk.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_K); kk.setAttribute(ATTR_CGXUI_OWNER, SkID); kk.textContent = k; const vv = D.createElement('div'); vv.setAttribute(ATTR_CGXUI, UI_MANCHOR_POP_V); vv.setAttribute(ATTR_CGXUI_OWNER, SkID); vv.textContent = v; kv.append(kk, vv); return kv; };
    ov.appendChild(mkKV('Msg ID', msgId));
    ov.appendChild(mkKV('Anchor off', String(anchor?.off ?? '0')));
    ov.appendChild(mkKV('Items', String(items.length)));
    ov.appendChild(mkKV('Connectors in message', String(allBraces.length)));
    ov.appendChild(mkKV('Connectors touching this line', String(bracesHere.length)));
    ov.appendChild(mkKV('Focused connector', connectorFocusMeta));
    ov.appendChild(mkKV('Notes / Tags / Links', `${byType('note').length} / ${byType('tag').length} / ${byType('link').length}`));
    ov.appendChild(mkKV('Quotes / Todo / Files', `${byType('quote').length} / ${byType('todo').length} / ${byType('file').length}`));
    ov.appendChild(mkKV('Latest status', latestState ? String(latestState) : '—'));
    wrap.appendChild(ov);
    const pane = buildPane();
    pane.appendChild(wrap);
    hub.appendChild(pane);
  } else if (activeTab === 'connectors') {
    hub.appendChild(renderConnectorsPane());
  } else {
    const pane = buildPane();
    if (draft?.mode === activeTab) { const ed = renderEditor(); if (ed) pane.appendChild(ed); }
    pane.appendChild(renderListFor(activeTab));
    hub.appendChild(pane);
  }

  hub.appendChild(tabs);
  UI_MA_placePopup(popEl, clientX, clientY);
  requestAnimationFrame(() => UI_MA_placePopup(popEl, clientX, clientY));
  requestAnimationFrame(() => UI_MA_placePopup(popEl, clientX, clientY));
}

if (focusBraceItemId) {
  const focusBr = getFocusedBrace();
  if (focusBr) focusBrace(focusBr.id, focusBr.startOff);
}

// ✅ Keep this call at the end of UI_MA_openMenu
renderHub();
}

  function CHUB_MA_api() {
    return W.H2O?.CH?.cntrlhb?.api || null;
  }

  function CHUB_MA_invalidate() {
    try { CHUB_MA_api()?.invalidate?.(); } catch {}
  }

  function CHUB_MA_makeSymbolToken(def, CLS, opts = {}) {
    const vm = VIEW_MA_buildSymbolViewModel(def?.id, opts.color || def?.defaultColor, opts.variantId || '');
    return UI_MA_createSymbolShellEl(vm, {
      className: `${CLS}-maSymbolToken ${opts.tokenClassName || ''}`.trim(),
      glyphClassName: `${CLS}-maSymbolGlyph`,
      color: opts.color || def?.defaultColor,
      title: opts.title || def?.title || '',
      side: opts.side || 'left',
    });
  }

  function CHUB_MA_makeEmptyState(CLS, text) {
    const el = D.createElement('div');
    el.className = `${CLS}-maEmpty`;
    el.textContent = text;
    return el;
  }

function CHUB_MA_createSectionHeader(CLS, title, helpText, currentValueText) {
    const header = D.createElement('div');
    header.className = `${CLS}-ma-section-header`;

    const titleLine = D.createElement('div');
    titleLine.className = `${CLS}-ma-section-titleline`;

    const titleEl = D.createElement('span');
    titleEl.textContent = title;
    titleLine.appendChild(titleEl);

    if (helpText) {
      const infoIcon = D.createElement('span');
      infoIcon.className = `${CLS}-ma-info-icon`;
      infoIcon.textContent = 'ⓘ';
      infoIcon.title = helpText;
      titleLine.appendChild(infoIcon);
    }

    header.appendChild(titleLine);

    if (currentValueText) {
      const currentValue = D.createElement('div');
      currentValue.className = `${CLS}-ma-current-value`;
      currentValue.textContent = currentValueText;
      header.appendChild(currentValue);
    }

    return header;
  }

function CHUB_MA_buildCompactPreviewStrip(skin, opts = {}) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const symbols = opts.forceSymbols || CORE_MA_getEnabledSymbols();
    const defs = symbols.map((id) => VIEW_MA_getSymbolDef(id)).filter(Boolean);

    if (!defs.length && !opts.forceSymbols) return new DocumentFragment();

    const strip = D.createElement('div');
    strip.className = `${CLS}-ma-preview-strip`;

    const tokens = D.createElement('div');
    tokens.className = `${CLS}-ma-preview-tokens`;

    const oldTheme = D.documentElement.getAttribute(ATTR_MANCHOR_SYMBOL_THEME);
    const oldBoxed = D.documentElement.getAttribute(ATTR_MANCHOR_SYMBOL_BOXED);

    if (opts.useTheme) D.documentElement.setAttribute(ATTR_MANCHOR_SYMBOL_THEME, opts.useTheme);
    if (typeof opts.useBoxed === 'boolean') {
      D.documentElement.setAttribute(ATTR_MANCHOR_SYMBOL_BOXED, opts.useBoxed ? '1' : '0');
    }

    for (const [i, def] of defs.entries()) {
      tokens.appendChild(CHUB_MA_makeSymbolToken(def, CLS, {
        tokenClassName: `${CLS}-ma-preview-token`,
        color: MANCHOR_SYMBOL_PREVIEW_COLORS[i % MANCHOR_SYMBOL_PREVIEW_COLORS.length],
        title: def.title,
      }));
    }

    if (opts.useTheme) {
      if (oldTheme) D.documentElement.setAttribute(ATTR_MANCHOR_SYMBOL_THEME, oldTheme);
      else D.documentElement.removeAttribute(ATTR_MANCHOR_SYMBOL_THEME);
    }
    if (typeof opts.useBoxed === 'boolean') {
      if (oldBoxed) D.documentElement.setAttribute(ATTR_MANCHOR_SYMBOL_BOXED, oldBoxed);
      else D.documentElement.removeAttribute(ATTR_MANCHOR_SYMBOL_BOXED);
    }

    strip.appendChild(tokens);
    return strip;
  }


  function CHUB_MA_buildPageSizePreviewStrip(skin, sizeId) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const meta = VIEW_MA_getSymbolPageSizeMeta(sizeId);
    const strip = D.createElement('div');
    strip.className = `${CLS}-ma-preview-strip ${CLS}-ma-page-size-preview-host`;
    strip.dataset.pageSize = meta.id;
    strip.style.setProperty('--ma-preview-page-icon-pad-adjust', `${meta.padAdjust || 0}px`);

    const tokens = D.createElement('div');
    tokens.className = `${CLS}-ma-preview-tokens`;
    for (const [index, symbolId] of (meta.preview || []).entries()) {
      const def = VIEW_MA_getSymbolDef(symbolId);
      if (!def) continue;
      tokens.appendChild(CHUB_MA_makeSymbolToken(def, CLS, {
        tokenClassName: `${CLS}-maPageSizePreviewToken`,
        color: MANCHOR_SYMBOL_PREVIEW_COLORS[index % MANCHOR_SYMBOL_PREVIEW_COLORS.length],
        title: def.title,
      }));
    }
    strip.appendChild(tokens);
    return strip;
  }

  function CHUB_MA_buildGutterGuidePreviewStrip(skin, modeId) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const meta = VIEW_MA_getGutterGuideMeta(modeId);
    const strip = D.createElement('div');
    strip.className = `${CLS}-ma-preview-strip ${CLS}-ma-guide-preview-host`;
    strip.dataset.guideMode = meta.id;

    const preview = D.createElement('div');
    preview.className = `${CLS}-maGuidePreview`;
    preview.setAttribute('aria-hidden', 'true');
    for (const lane of MANCHOR_GUTTER_LANES) {
      const dotLane = D.createElement('span');
      dotLane.className = `${CLS}-maGuidePreviewLane`;
      dotLane.dataset.lane = lane.id;
      preview.appendChild(dotLane);
    }

    strip.appendChild(preview);
    return strip;
  }

  function CHUB_MA_buildThemePicker(skin) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const container = D.createElement('div');
    container.className = `${CLS}-ma-compact-section`;

    const currentThemeId = CORE_MA_getSymbolTheme();
    const currentThemeMeta = VIEW_MA_getSymbolThemeMeta(currentThemeId);
    const themes = VIEW_MA_getSymbolThemes();

    const header = CHUB_MA_createSectionHeader(
      CLS,
      'Symbol Style',
      'Select the visual theme for anchor symbols.',
      `Active: ${currentThemeMeta.title}`,
    );

    const chipsContainer = D.createElement('div');
    chipsContainer.className = `${CLS}-ma-chips-container`;

    for (const theme of themes) {
      const chip = D.createElement('button');
      chip.type = 'button';
      chip.className = `${CLS}-ma-chip`;
      chip.textContent = theme.title;
      chip.title = theme.subtitle;
      if (theme.id === currentThemeId) chip.classList.add('active');
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (theme.id === CORE_MA_getSymbolTheme()) return;
        CORE_MA_setSymbolTheme(theme.id);
      }, true);
      chipsContainer.appendChild(chip);
    }

    const preview = CHUB_MA_buildCompactPreviewStrip(skin, {
      useTheme: currentThemeId,
      useBoxed: CORE_MA_getSymbolBoxed(),
      forceSymbols: ['arrow', 'flag', 'bolt'],
    });

    container.append(header, chipsContainer, preview);
    return container;
  }

  function CHUB_MA_buildBoxModePicker(skin) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const container = D.createElement('div');
    container.className = `${CLS}-ma-compact-section`;

    const isBoxed = CORE_MA_getSymbolBoxed();
    const boxModes = MANCHOR_SYMBOL_BOX_MODES;

    const header = CHUB_MA_createSectionHeader(
      CLS,
      'Symbol Framing',
      'Choose whether symbols are enclosed in a shell or appear as plain icons.',
      `Shell: ${isBoxed ? 'Boxed' : 'No Box'}`,
    );

    const chipsContainer = D.createElement('div');
    chipsContainer.className = `${CLS}-ma-chips-container`;

    for (const mode of boxModes) {
      const chip = D.createElement('button');
      chip.type = 'button';
      chip.className = `${CLS}-ma-chip`;
      chip.textContent = mode.title;
      chip.title = mode.subtitle;
      if (mode.boxed === isBoxed) chip.classList.add('active');
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (mode.boxed === CORE_MA_getSymbolBoxed()) return;
        CORE_MA_setSymbolBoxed(mode.boxed);
      }, true);
      chipsContainer.appendChild(chip);
    }

    const preview = CHUB_MA_buildCompactPreviewStrip(skin, {
      useTheme: CORE_MA_getSymbolTheme(),
      useBoxed: isBoxed,
      forceSymbols: ['arrow', 'check', 'bolt'],
    });

    container.append(header, chipsContainer, preview);
    return container;
  }

  function CHUB_MA_buildPageSizePicker(skin) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const container = D.createElement('div');
    container.className = `${CLS}-ma-compact-section`;

    const currentSizeId = CORE_MA_getSymbolPageSize();
    const currentMeta = VIEW_MA_getSymbolPageSizeMeta(currentSizeId);

    const header = CHUB_MA_createSectionHeader(
      CLS,
      'In-Page Symbol Size',
      'Choose how large symbols render in the page gutter.',
      `Current live size: ${currentMeta.title}`,
    );

    const chipsContainer = D.createElement('div');
    chipsContainer.className = `${CLS}-ma-chips-container`;

    for (const meta of VIEW_MA_getSymbolPageSizes()) {
      const chip = D.createElement('button');
      chip.type = 'button';
      chip.className = `${CLS}-ma-chip`;
      chip.textContent = meta.title;
      chip.title = meta.subtitle;
      if (meta.id === currentSizeId) chip.classList.add('active');
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (meta.id === CORE_MA_getSymbolPageSize()) return;
        CORE_MA_setSymbolPageSize(meta.id);
      }, true);
      chipsContainer.appendChild(chip);
    }

    const preview = CHUB_MA_buildPageSizePreviewStrip(skin, currentSizeId);

    container.append(header, chipsContainer, preview);
    return container;
  }

  function CHUB_MA_buildGutterGuidePicker(skin) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const container = D.createElement('div');
    container.className = `${CLS}-ma-compact-section`;

    const currentModeId = CORE_MA_getGutterGuideMode();
    const currentMeta = VIEW_MA_getGutterGuideMeta(currentModeId);

    const header = CHUB_MA_createSectionHeader(
      CLS,
      'Gutter Guide',
      'Controls the visibility and style of the gutter guide lanes.',
      `Current gutter guide: ${currentMeta.title}`,
    );

    const chipsContainer = D.createElement('div');
    chipsContainer.className = `${CLS}-ma-chips-container`;

    for (const meta of VIEW_MA_getGutterGuideModes()) {
      const chip = D.createElement('button');
      chip.type = 'button';
      chip.className = `${CLS}-ma-chip`;
      chip.textContent = meta.title;
      chip.title = meta.subtitle;
      if (meta.id === currentModeId) chip.classList.add('active');
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (meta.id === CORE_MA_getGutterGuideMode()) return;
        CORE_MA_setGutterGuideMode(meta.id);
      }, true);
      chipsContainer.appendChild(chip);
    }

    const preview = CHUB_MA_buildGutterGuidePreviewStrip(skin, currentModeId);

    container.append(header, chipsContainer, preview);
    return container;
  }

  function CHUB_MA_buildLibraryPicker(skin) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const container = D.createElement('div');
    container.className = `${CLS}-ma-compact-section`;

    const header = CHUB_MA_createSectionHeader(
      CLS,
      'Symbol Library',
      'Toggle which symbols are available in the Margin Anchor popup. Existing pins still render even if a symbol is toggled off here.',
    );

    const grid = D.createElement('div');
    grid.className = `${CLS}-ma-lib-grid`;

    const enabled = new Set(CORE_MA_getEnabledSymbols());
    for (const def of MANCHOR_SYMBOLS) {
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = `${CLS}-ma-lib-toggle`;
      btn.title = `${def.title} (${enabled.has(def.id) ? 'Enabled' : 'Disabled'})`;
      if (enabled.has(def.id)) btn.classList.add('active');

      btn.appendChild(CHUB_MA_makeSymbolToken(def, CLS, {
        tokenClassName: `${CLS}-ma-lib-token`,
        color: def.defaultColor,
      }));

      const label = D.createElement('div');
      label.className = `${CLS}-ma-lib-label`;
      label.textContent = def.title;

      btn.append(label);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wanted = new Set(CORE_MA_getEnabledSymbols());
        if (wanted.has(def.id)) wanted.delete(def.id);
        else wanted.add(def.id);
        CORE_MA_setEnabledSymbols(Array.from(wanted));
      }, true);

      grid.appendChild(btn);
    }

    container.append(header, grid);
    return container;
  }

  function CHUB_MA_buildVariantPicker(skin) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const container = D.createElement('div');
    container.className = `${CLS}-ma-compact-section`;

    const header = CHUB_MA_createSectionHeader(
      CLS,
      'Symbol Variants',
      'Select the default appearance for each enabled symbol.',
    );
    container.appendChild(header);

    const defs = VIEW_MA_getEnabledSymbolDefs();
    if (!defs.length) {
      container.appendChild(CHUB_MA_makeEmptyState(CLS, 'No enabled symbols. Turn on a symbol in Symbol Library first.'));
      return container;
    }

    const list = D.createElement('div');
    list.className = `${CLS}-ma-var-list`;

    for (const def of defs) {
      const activeVariant = CORE_MA_getSymbolVariant(def.id);
      const row = D.createElement('div');
      row.className = `${CLS}-ma-var-row`;

      const left = D.createElement('div');
      left.className = `${CLS}-ma-var-left`;

      const preview = CHUB_MA_makeSymbolToken(def, CLS, {
        tokenClassName: `${CLS}-ma-var-token-preview`,
        color: def.defaultColor,
        variantId: activeVariant,
        title: def.title,
      });

      const label = D.createElement('label');
      label.className = `${CLS}-ma-var-label`;
      label.textContent = def.title;
      label.htmlFor = `ma-variant-select-${def.id}`;

      left.append(preview, label);

      const select = D.createElement('select');
      select.className = `${CLS}-ma-var-select`;
      select.id = `ma-variant-select-${def.id}`;

      for (const variant of def.variants) {
        const option = D.createElement('option');
        option.value = variant.id;
        option.textContent = variant.title;
        if (variant.id === activeVariant) option.selected = true;
        select.appendChild(option);
      }

      select.addEventListener('change', (e) => {
        CORE_MA_setSymbolVariant(def.id, e.target.value);
      });

      row.append(left, select);
      list.appendChild(row);
    }

    container.appendChild(list);
    return container;
  }

  function CHUB_MA_buildPreviewStrip(skin) {
    const CLS = String(skin?.CLS || 'cgxui-chub');
    const defs = VIEW_MA_getEnabledSymbolDefs();
    if (!defs.length) return CHUB_MA_makeEmptyState(CLS, 'Preview hidden until at least one symbol is enabled.');

    const strip = D.createElement('div');
    strip.className = `${CLS}-maPreviewStrip`;
    for (const def of defs) {
      const chip = D.createElement('div');
      chip.className = `${CLS}-maPreviewChip`;
      chip.appendChild(CHUB_MA_makeSymbolToken(def, CLS, {
        tokenClassName: `${CLS}-maPreviewToken`,
        color: def.defaultColor,
        title: def.title,
      }));

      const label = D.createElement('span');
      label.className = `${CLS}-maPreviewLabel`;
      label.textContent = def.title;

      chip.append(label);
      strip.appendChild(chip);
    }
    return strip;
  }

  function CHUB_MA_cssText({ panelSel, CLS }) {
    const P = panelSel;
    const tokenSel = `${P} .${CLS}-maSymbolToken`;
    const glyphSel = `${P} .${CLS}-maSymbolGlyph`;
    const themePreviewTokenSel = `.${CLS}-maThemePreviewToken`;
    const modePreviewTokenSel = `.${CLS}-maModePreviewToken`;
    const pageSizePreviewTokenSel = `.${CLS}-maPageSizePreviewToken`;
    const guidePreviewLaneSel = `.${CLS}-maGuidePreviewLane`;

    return `
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-custom-below{
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  gap:8px;
}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-custom-below > .${CLS}-ctrlLabGroup{
  max-width:none;
  min-width:0;
  width:100%;
}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-custom-below > :not(.${CLS}-ctrlLabGroup){
  min-width:0;
  width:100%;
}
${P} .${CLS}-ma-compact-section{
  display:flex;
  flex-direction:column;
  gap:12px;
}
${P} .${CLS}-ma-section-header{
  display:flex;
  flex-direction:column;
  gap:4px;
}
${P} .${CLS}-ma-section-titleline{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:11px;
  font-weight:600;
  color:rgba(203,213,225,.88);
  letter-spacing:.08em;
  text-transform:uppercase;
}
${P} .${CLS}-ma-info-icon{
  font-family:sans-serif;
  font-size:12px;
  color:rgba(148,163,184,.95);
  cursor:help;
  border-radius:999px;
  width:16px;
  height:16px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.05);
  user-select:none;
}
${P} .${CLS}-ma-info-icon:hover{
  color:rgba(255,255,255,.96);
  background:rgba(255,255,255,.10);
}
${P} .${CLS}-ma-current-value{
  font-size:12px;
  color:rgba(148,163,184,.95);
  padding-left:2px;
}
${P} .${CLS}-ma-chips-container{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
${P} .${CLS}-ma-chip{
  appearance:none;
  font-size:12px;
  font-weight:600;
  color:rgba(226,232,240,.92);
  background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.14);
  border-radius:999px;
  padding:5px 12px;
  cursor:pointer;
  transition:background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease;
}
${P} .${CLS}-ma-chip:hover{
  background:rgba(255,255,255,.10);
  border-color:rgba(255,255,255,.24);
  color:rgba(255,255,255,.98);
  transform:translateY(-1px);
}
${P} .${CLS}-ma-chip.active{
  background:linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.08));
  border-color:rgba(255,255,255,.34);
  color:#fff;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.18);
}
${P} .${CLS}-ma-preview-strip{
  display:flex;
  align-items:center;
  min-height:44px;
  padding:8px 10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(135deg, rgba(255,255,255,.05), rgba(255,255,255,.025));
}
${P} .${CLS}-ma-preview-tokens{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:10px;
}
${P} .${CLS}-ma-preview-token{
  --ma-preview-size:22px;
  min-width:var(--ma-preview-size);
  min-height:var(--ma-preview-size);
}
${P} .${CLS}-ma-lib-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill, 88px);
  justify-content:start;
  gap:8px;
}

${P} .${CLS}-ma-lib-toggle{
  appearance:none;
  min-width:88px;
  width:88px;
  min-height:74px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:6px;
  padding:8px 6px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(255,255,255,.04);
  color:rgba(226,232,240,.92);
  cursor:pointer;
  transition:transform .18s ease, background .18s ease, border-color .18s ease, box-shadow .18s ease;
}

${P} .${CLS}-ma-lib-toggle:hover{
  transform:translateY(-1px);
  background:rgba(255,255,255,.07);
  border-color:rgba(255,255,255,.22);
}
${P} .${CLS}-ma-lib-toggle.active{
  background:linear-gradient(135deg, rgba(255,255,255,.13), rgba(255,255,255,.06));
  border-color:rgba(255,255,255,.30);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.16);
}
${P} .${CLS}-ma-lib-token{
  --ma-lib-size:20px;
  min-width:var(--ma-lib-size);
  min-height:var(--ma-lib-size);
}

${P} .${CLS}-ma-lib-label{
  font-size:10.5px;
  line-height:1.15;
  text-align:center;
}

${P} .${CLS}-ma-var-list{
  display:flex;
  flex-direction:column;
  gap:8px;
}
${P} .${CLS}-ma-var-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) minmax(132px, 180px);
  align-items:center;
  gap:10px;
}

${P} .${CLS}-ma-var-label{
  font-size:12px;
  color:rgba(226,232,240,.92);
}

${P} .${CLS}-ma-var-select{
  width:100%;
  min-width:0;
  padding:6px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  color:rgba(255,255,255,.96);
  font-size:11px;
}

${P} .${CLS}-ma-var-select:focus-visible{
  outline:none;
  border-color:rgba(255,255,255,.30);
  box-shadow:0 0 0 3px rgba(255,255,255,.08);
}

${P} .${CLS}-ma-page-size-preview-host,
${P} .${CLS}-ma-guide-preview-host{
  justify-content:flex-start;
}
${P} .${CLS}-ma-page-size-preview-host{
  --ma-preview-page-icon-pad-adjust: 0px;
}
${P} .${CLS}-ma-var-left{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
}
${P} .${CLS}-ma-var-token-preview{
  --ma-sym-size:20px;
  --ma-sym-icon-pad:3.6px;
  min-width:20px;
  min-height:20px;
}
${P} .${CLS}-ma-var-select option{
  font-size:11px;
}
${P} .${CLS}-maThemeGrid{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(170px, 1fr));
  gap:10px;
  width:min(100%, 640px);
  max-width:100%;
}
${P} .${CLS}-maModeGrid{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(170px, 1fr));
  gap:10px;
  width:min(100%, 460px);
  max-width:100%;
}
${P} .${CLS}-maPageSizeGrid{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));
  gap:10px;
  width:min(100%, 640px);
  max-width:100%;
}
${P} .${CLS}-maGuideGrid{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));
  gap:10px;
  width:min(100%, 640px);
  max-width:100%;
}
${P} .${CLS}-maThemeCard,
${P} .${CLS}-maModeBtn,
${P} .${CLS}-maPageSizeCard,
${P} .${CLS}-maGuideCard,
${P} .${CLS}-maLibBtn,
${P} .${CLS}-maVarBtn{
  appearance:none;
  color:rgba(255,255,255,.94);
  cursor:pointer;
}
${P} .${CLS}-maThemeCard,
${P} .${CLS}-maModeBtn,
${P} .${CLS}-maPageSizeCard,
${P} .${CLS}-maGuideCard{
  position:relative;
  min-width:0;
  display:grid;
  gap:10px;
  padding:12px;
  border-radius:16px;
  border:1px solid rgba(255,255,255,.12);
  background:linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 10px 28px rgba(0,0,0,.18);
  text-align:left;
  transition:transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
}
${P} .${CLS}-maThemeCard:hover,
${P} .${CLS}-maModeBtn:hover,
${P} .${CLS}-maPageSizeCard:hover,
${P} .${CLS}-maGuideCard:hover,
${P} .${CLS}-maLibBtn:hover,
${P} .${CLS}-maVarBtn:hover{
  transform:translateY(-1px);
}
${P} .${CLS}-maThemeCard:focus-visible,
${P} .${CLS}-maModeBtn:focus-visible,
${P} .${CLS}-maPageSizeCard:focus-visible,
${P} .${CLS}-maGuideCard:focus-visible,
${P} .${CLS}-maLibBtn:focus-visible,
${P} .${CLS}-maVarBtn:focus-visible{
  outline:none;
  box-shadow:
    0 0 0 1px rgba(255,244,202,.34),
    0 0 0 4px rgba(255,217,102,.14),
    inset 0 1px 0 rgba(255,255,255,.08),
    0 14px 30px rgba(0,0,0,.24);
}
${P} .${CLS}-maThemeCard[aria-pressed="true"],
${P} .${CLS}-maModeBtn[aria-pressed="true"],
${P} .${CLS}-maPageSizeCard[aria-pressed="true"],
${P} .${CLS}-maGuideCard[aria-pressed="true"]{
  border-color:rgba(255,217,102,.58);
  background:linear-gradient(135deg, rgba(255,214,102,.18), rgba(255,255,255,.05));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.12),
    0 0 0 1px rgba(255,217,102,.08),
    0 16px 34px rgba(0,0,0,.26);
}
${P} .${CLS}-maThemeHead,
${P} .${CLS}-maModeHead,
${P} .${CLS}-maPageSizeHead,
${P} .${CLS}-maGuideHead,
${P} .${CLS}-maLibLabelWrap,
${P} .${CLS}-maVarLabelWrap{
  display:grid;
  gap:4px;
  min-width:0;
}
${P} .${CLS}-maThemeName,
${P} .${CLS}-maModeName,
${P} .${CLS}-maPageSizeName,
${P} .${CLS}-maGuideName,
${P} .${CLS}-maLibLabel,
${P} .${CLS}-maVarLabel{
  font-size:12px;
  line-height:1.2;
  font-weight:650;
  color:rgba(255,255,255,.94);
}
${P} .${CLS}-maThemeMeta,
${P} .${CLS}-maModeMeta,
${P} .${CLS}-maPageSizeMeta,
${P} .${CLS}-maGuideMeta,
${P} .${CLS}-maLibMeta,
${P} .${CLS}-maVarMeta,
${P} .${CLS}-maPreviewLabel,
${P} .${CLS}-maEmpty{
  font-size:11px;
  line-height:1.35;
  color:rgba(255,255,255,.72);
}
${P} .${CLS}-maThemeCard[aria-pressed="true"] .${CLS}-maThemeName{
  color:#fff7db;
}
${P} .${CLS}-maThemeCard[aria-pressed="true"] .${CLS}-maThemeMeta{
  color:rgba(255,244,220,.82);
}
${P} .${CLS}-maModeBtn[aria-pressed="true"] .${CLS}-maModeName{
  color:#fff7db;
}
${P} .${CLS}-maModeBtn[aria-pressed="true"] .${CLS}-maModeMeta{
  color:rgba(255,244,220,.82);
}
${P} .${CLS}-maPageSizeCard[aria-pressed="true"] .${CLS}-maPageSizeName{
  color:#fff7db;
}
${P} .${CLS}-maPageSizeCard[aria-pressed="true"] .${CLS}-maPageSizeMeta{
  color:rgba(255,244,220,.82);
}
${P} .${CLS}-maGuideCard[aria-pressed="true"] .${CLS}-maGuideName{
  color:#fff7db;
}
${P} .${CLS}-maGuideCard[aria-pressed="true"] .${CLS}-maGuideMeta{
  color:rgba(255,244,220,.82);
}
${P} .${CLS}-maThemePreview,
${P} .${CLS}-maModePreview,
${P} .${CLS}-maPageSizePreview,
${P} .${CLS}-maGuidePreview,
${P} .${CLS}-maPreviewStrip{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  min-width:0;
}
${P} .${CLS}-maLibGrid{
  display:grid;
  grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));
  gap:10px;
  width:min(100%, 680px);
  max-width:100%;
}
${P} .${CLS}-maLibBtn{
  display:grid;
  grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  min-width:0;
  width:100%;
  padding:10px 12px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.12);
  background:linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
  text-align:left;
  transition:transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
}
${P} .${CLS}-maLibBtn[data-group="expansion"]{
  background:linear-gradient(135deg, rgba(124,58,237,.08), rgba(255,255,255,.03));
}
${P} .${CLS}-maLibBtn[aria-pressed="true"]{
  border-color:rgba(255,217,102,.42);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08), 0 12px 28px rgba(0,0,0,.18);
}
${P} .${CLS}-maBadge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width:34px;
  padding:4px 8px;
  border-radius:999px;
  font-size:10px;
  font-weight:700;
  letter-spacing:.04em;
  text-transform:uppercase;
  color:rgba(255,255,255,.84);
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
}
${P} .${CLS}-maLibBtn[aria-pressed="true"] .${CLS}-maBadge{
  color:#1b1306;
  border-color:rgba(255,223,132,.66);
  background:linear-gradient(135deg, rgba(255,237,180,.98), rgba(247,188,71,.98));
}
${P} .${CLS}-maVarList{
  display:grid;
  gap:10px;
  width:min(100%, 720px);
  max-width:100%;
}
${P} .${CLS}-maVarRow{
  display:grid;
  grid-template-columns:minmax(96px, 120px) minmax(0, 1fr);
  gap:10px;
  align-items:start;
  padding:10px 12px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
}
${P} .${CLS}-maVarOptions{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  min-width:0;
}
${P} .${CLS}-maVarBtn{
  display:grid;
  justify-items:center;
  gap:6px;
  min-width:66px;
  padding:8px 8px 7px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.04);
  transition:transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease;
}
${P} .${CLS}-maVarBtn[aria-pressed="true"]{
  border-color:rgba(255,217,102,.42);
  background:linear-gradient(135deg, rgba(255,214,102,.13), rgba(255,255,255,.05));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08), 0 10px 24px rgba(0,0,0,.18);
}
${P} .${CLS}-maVarBtnLabel{
  font-size:10px;
  font-weight:700;
  letter-spacing:.08em;
  text-transform:uppercase;
  color:rgba(255,255,255,.78);
}
${P} .${CLS}-maPreviewChip{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:6px 9px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
}
${tokenSel}{
  --ma-sym-size: 24px;
  --ma-sym-icon-pad: 4px;
  position:relative;
  flex:0 0 auto;
  width:var(--ma-sym-size);
  height:var(--ma-sym-size);
  pointer-events:none;
}
${P} .${CLS}-maThemePreviewToken{
  --ma-sym-size: 26px;
  --ma-sym-icon-pad: 4px;
}
${P} .${CLS}-maModePreviewToken{
  --ma-sym-size: 24px;
  --ma-sym-icon-pad: 4px;
}
${P} .${CLS}-maPageSizePreviewToken{
  --ma-sym-size: 24px;
  --ma-sym-icon-pad: 4px;
  --ma-sym-page-icon-pad-adjust: var(--ma-preview-page-icon-pad-adjust, 0px);
}
${P} .${CLS}-maGuidePreview{
  min-height:44px;
  padding:0 2px;
}
${P} .${CLS}-maGuidePreviewLane{
  position:relative;
  width:14px;
  height:42px;
  flex:0 0 auto;
}
${P} .${CLS}-maLibToken{
  --ma-sym-size: 24px;
}
${P} .${CLS}-maVarToken{
  --ma-sym-size: 22px;
  --ma-sym-icon-pad: 3.8px;
}
${P} .${CLS}-maPreviewToken{
  --ma-sym-size: 24px;
}
${CSS_MA_symbolShellBase(tokenSel, glyphSel)}
${CSS_MA_symbolShellThemes((theme) => `:root[${ATTR_MANCHOR_SYMBOL_THEME}="${theme}"]`, tokenSel)}
${CSS_MA_symbolShellBoxMode((boxed) => `:root[${ATTR_MANCHOR_SYMBOL_BOXED}="${boxed}"]`, tokenSel)}
${CSS_MA_symbolShellThemes((theme) => `${P} .${CLS}-maThemeCard[data-theme="${theme}"]`, themePreviewTokenSel)}
${CSS_MA_symbolShellBoxMode((boxed) => `${P} .${CLS}-maModeBtn[data-boxed="${boxed}"]`, modePreviewTokenSel)}
${CSS_MA_symbolShellPageSizes((sizeId) => `${P} .${CLS}-ma-page-size-preview-host[data-page-size="${sizeId}"]`, pageSizePreviewTokenSel)}
${CSS_MA_gutterGuideDots(guidePreviewLaneSel)}
${CSS_MA_gutterGuideModes((mode) => `${P} .${CLS}-ma-guide-preview-host[data-guide-mode="${mode}"]`, guidePreviewLaneSel)}
@media (max-width: 760px){
${P} .${CLS}-maThemeGrid,
${P} .${CLS}-maModeGrid,
${P} .${CLS}-maPageSizeGrid,
${P} .${CLS}-maGuideGrid{
  grid-template-columns:1fr;
}
${P} .${CLS}-ma-lib-grid{
  grid-template-columns:repeat(auto-fill, 88px);
}

${P} .${CLS}-maVarRow{
  grid-template-columns:1fr;
}
}
    `;
  }

  function CHUB_MA_getControls(skin) {
    const activeThemeName = VIEW_MA_getSymbolThemeMeta(CORE_MA_getSymbolTheme()).title;
    const activeBoxMode = CORE_MA_getSymbolBoxed() ? 'Boxed' : 'No box';
    const activePageSizeName = VIEW_MA_getSymbolPageSizeMeta(CORE_MA_getSymbolPageSize()).title;
    const activeGutterGuideName = VIEW_MA_getGutterGuideMeta(CORE_MA_getGutterGuideMode()).title;
    return [
      {
        type: 'custom',
        key: 'maSymbolTheme',
        label: 'Symbol Style',
        help: `Active theme: ${activeThemeName}.`,
        group: 'Display',
        stackBelowLabel: true,
        render: () => CHUB_MA_buildThemePicker(skin),
      },
      {
        type: 'custom',
        key: 'maSymbolBoxMode',
        label: 'Symbol Framing',
        help: `Current shell: ${activeBoxMode}.`,
        group: 'Display',
        stackBelowLabel: true,
        render: () => CHUB_MA_buildBoxModePicker(skin),
      },
      {
        type: 'custom',
        key: 'maSymbolPageSize',
        label: 'In-Page Symbol Size',
        help: `Current live size: ${activePageSizeName}. Applies only to symbols rendered in the page gutter.`,
        group: 'Display',
        stackBelowLabel: true,
        render: () => CHUB_MA_buildPageSizePicker(skin),
      },
      {
        type: 'custom',
        key: 'maGutterGuideMode',
        label: 'Gutter Guide',
        help: `Current gutter dots: ${activeGutterGuideName}.`,
        group: 'Display',
        stackBelowLabel: true,
        render: () => CHUB_MA_buildGutterGuidePicker(skin),
      },
      {
        type: 'custom',
        key: 'maSymbolLibrary',
        label: 'Symbol Library',
        help: 'Choose which symbols appear in the Margin Anchor popup. Existing pins still render even if a symbol is toggled off here.',
        group: 'Symbols',
        stackBelowLabel: true,
        render: () => CHUB_MA_buildLibraryPicker(skin),
      },
      {
        type: 'custom',
        key: 'maSymbolVariants',
        label: 'Symbol Variants',
        help: 'One global SVG variant per symbol meaning.',
        group: 'Symbols',
        stackBelowLabel: true,
        render: () => CHUB_MA_buildVariantPicker(skin),
      },
      {
        type: 'custom',
        key: 'maSymbolPreview',
        label: 'Preview Strip',
        help: `Current theme and active variants. Theme: ${activeThemeName}.`,
        group: 'Symbols',
        stackBelowLabel: true,
        render: () => CHUB_MA_buildPreviewStrip(skin),
      }
    ];
  }

  function CHUB_MA_registerPlugin() {
    if (STATE.chPluginRegistered) return true;
    const api = CHUB_MA_api();
    if (!api?.registerPlugin) return false;

    try {
      api.registerPlugin({
        key: 'marginAnchor',
        cssText: CHUB_MA_cssText,
        getControls({ skin }) {
          return CHUB_MA_getControls(skin);
        },
      });
      STATE.chPluginRegistered = true;
      api.invalidate?.();
      return true;
    } catch {
      return false;
    }
  }

  function CHUB_MA_unregisterPlugin() {
    if (!STATE.chPluginRegistered) return false;
    try { CHUB_MA_api()?.unregisterPlugin?.('marginAnchor'); } catch {}
    STATE.chPluginRegistered = false;
    return true;
  }

  function CHUB_MA_bootPlugin() {
    if (CHUB_MA_registerPlugin()) return true;

    const onReady = () => {
      if (!CHUB_MA_registerPlugin()) return;
      try { W.removeEventListener(EV_CHUB_READY_V1, onReady, true); } catch {}
    };
    W.addEventListener(EV_CHUB_READY_V1, onReady, true);
    STATE.disposers.push(() => {
      try { W.removeEventListener(EV_CHUB_READY_V1, onReady, true); } catch {}
    });

    let tries = 0;
    const timer = W.setInterval(() => {
      tries += 1;
      if (!CHUB_MA_registerPlugin() && tries <= 80) return;
      try { W.clearInterval(timer); } catch {}
    }, 250);
    STATE.disposers.push(() => {
      try { W.clearInterval(timer); } catch {}
    });

    return false;
  }

/* ⚫️ LIFECYCLE — INIT / WIRING 📝🔓💥 ───────────────────────────── */
  function CORE_MA_boot() {
    if (STATE.booted) return;
    STATE.booted = true;

    DIAG_step('boot');

    try {
      UTIL_registryExtend(H2O.KEYS, {
        [`${PID_UP}_STATE_PINS_V1`]: KEY_MANCHOR_STATE_PINS_V1,
        [`${PID_UP}_SYMBOLS_V1`]: KEY_MANCHOR_SYMBOLS_V1,
        [`${PID_UP}_SYMBOL_COLORS_V1`]: KEY_MANCHOR_SYMBOL_COLORS_V1,
        [`${PID_UP}_SYMBOL_THEME_V1`]: KEY_MANCHOR_SYMBOL_THEME_V1,
        [`${PID_UP}_SYMBOL_LIBRARY_V1`]: KEY_MANCHOR_SYMBOL_LIBRARY_V1,
        [`${PID_UP}_SYMBOL_VARIANTS_V1`]: KEY_MANCHOR_SYMBOL_VARIANTS_V1,
        [`${PID_UP}_SYMBOL_BOXED_V1`]: KEY_MANCHOR_SYMBOL_BOXED_V1,
        [`${PID_UP}_SYMBOL_PAGE_SIZE_V1`]: KEY_MANCHOR_SYMBOL_PAGE_SIZE_V1,
        [`${PID_UP}_GUTTER_GUIDE_V1`]: KEY_MANCHOR_GUTTER_GUIDE_V1
      }, `${MODTAG}/KEYS`);
      UTIL_registryExtend(H2O.SEL,  { [`${PID_UP}_ASSISTANT`]: SEL_MANCHOR_ASSISTANT }, `${MODTAG}/SEL`);
      UTIL_registryExtend(H2O.UI,   { [`${PID_UP}_SkID`]: SkID }, `${MODTAG}/UI`);
      UTIL_registryExtend(H2O.EV,   {
        [`${PID_UP}_READY_V1`]: EV_MANCHOR_READY_V1,
        [`${PID_UP}_NOTE_TOGGLE_V1`]: EV_MANCHOR_NOTE_TOGGLE_V1,
        [`${PID_UP}_NOTE_CLOSE_V1`]: EV_MANCHOR_NOTE_CLOSE_V1,
        [`${PID_UP}_NOTE_STATE_V1`]: EV_MANCHOR_NOTE_STATE_V1,
        [`${PID_UP}_SYMBOLS_CHANGED`]: EV_MANCHOR_SYMBOLS_CHANGED,
        [`${PID_UP}_SYMBOL_THEME_CHANGED_V1`]: EV_MANCHOR_SYMBOL_THEME_CHANGED_V1
      }, `${MODTAG}/EV`);

      UI_MA_applySymbolTheme(STATE_MA_loadSymbolTheme());
      UI_MA_applySymbolBoxed(STATE_MA_loadSymbolBoxed());
      UI_MA_applySymbolPageSize(STATE_MA_loadSymbolPageSize());
      UI_MA_applyGutterGuideMode(STATE_MA_loadGutterGuideMode());
      STATE.enabledSymbols = STATE_MA_loadEnabledSymbols();
      STATE.symbolVariants = STATE_MA_loadSymbolVariants();
      UI_MA_ensureStyle();
      STATE_rebuildSymbolsMapV1();

      // Listen for note state updates (notes script -> core) so pins can reflect "open" glow quickly.
      const onNoteState = (ev) => {
        try {
          const d = ev?.detail || {};
          const msgEl = d.msgEl;
          if (msgEl instanceof HTMLElement) OBS_MA_scheduleRepaint(msgEl);
          else OBS_MA_scheduleRefreshAll();
        } catch {}
      };
      D.addEventListener(EV_MANCHOR_NOTE_STATE_V1, onNoteState, true);
      STATE.disposers.push(() => { try { D.removeEventListener(EV_MANCHOR_NOTE_STATE_V1, onNoteState, true); } catch {} });

      const onSymbolThemeChanged = () => {
        CHUB_MA_invalidate();
      };
      W.addEventListener(EV_MANCHOR_SYMBOL_THEME_CHANGED_V1, onSymbolThemeChanged, true);
      STATE.disposers.push(() => { try { W.removeEventListener(EV_MANCHOR_SYMBOL_THEME_CHANGED_V1, onSymbolThemeChanged, true); } catch {} });

      STATE.obsResize = new ResizeObserver((entries) => {
        try { OBS_MA_onResize(entries); } catch (e) { DIAG_error(e); }
      });

      DOM_MA_refreshAll();

      let STATE_scrollRaf = 0;
      const OBS_MA_onScroll = () => {
        if (STATE_scrollRaf) return;
        STATE_scrollRaf = requestAnimationFrame(() => {
          STATE_scrollRaf = 0;
          OBS_MA_scheduleRefreshAll('scroll');
          // Notes script will also reposition portals on scroll; this is okay.
        });
      };
      W.addEventListener(EV_WIN_SCROLL, OBS_MA_onScroll, { passive: true });
      STATE.disposers.push(() => {
        try { W.removeEventListener(EV_WIN_SCROLL, OBS_MA_onScroll); } catch {}
      });

      STATE.obsMut = new MutationObserver((muts) => {
        if (STATE.muting) return;

        let need = false;

        for (const m of muts || []) {
          if (m.type !== 'childList') continue;

          for (const n of m.addedNodes || []) {
            if (!(n instanceof HTMLElement)) continue;
            if (n.closest?.(`[${ATTR_CGXUI_OWNER}="${SkID}"]`)) continue;

            if (n.matches?.(SEL_MANCHOR_ASSISTANT) || n.querySelector?.(SEL_MANCHOR_ASSISTANT)) {
              need = true;
              break;
            }
          }
          if (need) break;
        }

        if (need) OBS_MA_scheduleRefreshAll();
      });
      STATE.obsMut.observe(D.documentElement, { childList: true, subtree: true });

      const onMouseDown = (e) => {
  if (!STATE.popEl) return;
  const t = e && e.target;
  // Don't immediately close on the same click that opened the popup (pins / gutter are outside popEl).
  if (t && (t.closest?.(SEL_MANCHOR_GUTTER_LAYER) || t.closest?.(SEL_MANCHOR_MARKS_LAYER))) return;
  if (STATE.popEl.contains(t)) return;
  UI_MA_hideMenu();
};
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          UI_MA_hideMenu();
          CORE_MA_clearPendingRangeDraft();
        }
      };

      D.addEventListener(EV_DOC_MOUSEDOWN, onMouseDown, true);
      D.addEventListener(EV_DOC_KEYDOWN, onKeyDown, true);

      STATE.disposers.push(() => D.removeEventListener(EV_DOC_MOUSEDOWN, onMouseDown, true));
      STATE.disposers.push(() => D.removeEventListener(EV_DOC_KEYDOWN, onKeyDown, true));

      const onResize = () => {
        const els = D.querySelectorAll(SEL_MANCHOR_ASSISTANT);
        for (const el of els) OBS_MA_scheduleRepaint(el);
      };
      W.addEventListener(EV_WIN_RESIZE, onResize, { passive: true });
      STATE.disposers.push(() => W.removeEventListener(EV_WIN_RESIZE, onResize));

      STATE.disposers.push(() => { try { STATE.obsMut?.disconnect(); } catch {} });
      STATE.disposers.push(() => { try { STATE.obsResize?.disconnect(); } catch {} });

      STATE.disposers.push(() => {
        if (STATE.refreshAllTimer) clearTimeout(STATE.refreshAllTimer);
        STATE.refreshAllTimer = 0;
        if (STATE.gutterMidTimer) clearTimeout(STATE.gutterMidTimer);
        STATE.gutterMidTimer = 0;

        for (const t of STATE.repaintTimerByMsg.values()) clearTimeout(t);
        STATE.repaintTimerByMsg.clear();
      });

      CHUB_MA_bootPlugin();

      // ✅ Publish Core API surface for other scripts (Sticky Notes Portal)
      MOD_OBJ.api.core = MOD_OBJ.api.core || {};
      Object.assign(MOD_OBJ.api.core, {
        v: '1.0.0',
        TOK, PID, SkID, BrID, DsID, MODTAG,
        cfg: CFG_MANCHOR,
        keys: {
          KEY_MANCHOR_STATE_PINS_V1,
          KEY_MANCHOR_SYMBOLS_V1,
          KEY_MANCHOR_SYMBOL_COLORS_V1,
          KEY_MANCHOR_SYMBOL_THEME_V1,
          KEY_MANCHOR_SYMBOL_LIBRARY_V1,
          KEY_MANCHOR_SYMBOL_VARIANTS_V1,
          KEY_MANCHOR_SYMBOL_BOXED_V1,
          KEY_MANCHOR_SYMBOL_PAGE_SIZE_V1,
          KEY_MANCHOR_GUTTER_GUIDE_V1
        },
        ev: {
          EV_MANCHOR_READY_V1,
          EV_MANCHOR_NOTE_TOGGLE_V1,
          EV_MANCHOR_NOTE_CLOSE_V1,
          EV_MANCHOR_NOTE_STATE_V1,
          EV_MANCHOR_SYMBOLS_CHANGED,
          EV_MANCHOR_SYMBOL_THEME_CHANGED_V1
        },
        sel: { SEL_MANCHOR_ASSISTANT },

        util: {
          uid: UTIL_uid,
          getMsgId: UTIL_getMsgId,
          getContentRoot: UTIL_getContentRoot,
          anchorToY: UTIL_anchorToY,
          noteKey: UTIL_noteKey,
          getLaneMeta: VIEW_MA_getLaneMeta
        },

        store: {
          loadV1: STATE_loadStoreV1,
          saveV1: STATE_saveStoreV1
        },

        items: {
          addItem: CORE_MA_addItem,
          updateItem: CORE_MA_updateItem,
          removeItem: CORE_MA_removeItem
        },

        ranges: {
          upsertBrace: CORE_MA_upsertRangeBrace,
          removeBrace: CORE_MA_removeRangeBrace,
          listBraces: CORE_MA_listRangeBraces,
          beginDraft: CORE_MA_beginPendingRangeDraft,
          clearDraft: CORE_MA_clearPendingRangeDraft,
          getDraft: CORE_MA_getPendingRangeDraft,
          getLaneMeta: VIEW_MA_getLaneMeta
        },

        theme: {
          getSymbolTheme: CORE_MA_getSymbolTheme,
          setSymbolTheme: CORE_MA_setSymbolTheme,
          getSymbolThemes: VIEW_MA_getSymbolThemes,
          getSymbolThemeMeta: VIEW_MA_getSymbolThemeMeta
        },

        symbols: {
          getRegistry: VIEW_MA_getSymbolRegistry,
          resolveSemanticId: VIEW_MA_resolveSymbolSemanticId,
          getBoxed: CORE_MA_getSymbolBoxed,
          setBoxed: CORE_MA_setSymbolBoxed,
          getPageSize: CORE_MA_getSymbolPageSize,
          setPageSize: CORE_MA_setSymbolPageSize,
          getPageSizes: VIEW_MA_getSymbolPageSizes,
          getPageSizeMeta: VIEW_MA_getSymbolPageSizeMeta,
          getEnabled: CORE_MA_getEnabledSymbols,
          setEnabled: CORE_MA_setEnabledSymbols,
          getVariantMap: CORE_MA_getSymbolVariantMap,
          getVariant: CORE_MA_getSymbolVariant,
          setVariant: CORE_MA_setSymbolVariant,
          buildViewModel: VIEW_MA_buildSymbolViewModel
        },

        ui: {
          getGutterGuideMode: CORE_MA_getGutterGuideMode,
          setGutterGuideMode: CORE_MA_setGutterGuideMode,
          getGutterGuideModes: VIEW_MA_getGutterGuideModes,
          scheduleRepaint: OBS_MA_scheduleRepaint,
          scheduleRefreshAll: OBS_MA_scheduleRefreshAll
        }
      });

      // Fire READY event (notes script can wait on this)
      try { D.dispatchEvent(new CustomEvent(EV_MANCHOR_READY_V1, { detail: { tok: TOK, pid: PID, skid: SkID } })); } catch {}

      DIAG_step('boot:ok');
    } catch (e) {
      DIAG_error(e);
      try { console.error(`[H2O][${MODTAG}] boot crashed (fail-soft).`, e); } catch {}
    }
  }

  function CORE_MA_dispose() {
    try {
      UI_MA_hideMenu();
      CHUB_MA_unregisterPlugin();

      for (const fn of STATE.disposers.splice(0)) {
        try { fn?.(); } catch {}
      }

      const msgs = D.querySelectorAll(SEL_MANCHOR_ASSISTANT);
      for (const msgEl of msgs) {
        try {
          msgEl.querySelector(SEL_MANCHOR_GUTTER_CHILD)?.remove();
          msgEl.querySelector(SEL_MANCHOR_MARKS_CHILD)?.remove();

          if (STATE.origPosByMsg.has(msgEl)) {
            msgEl.style.position = STATE.origPosByMsg.get(msgEl) || '';
            STATE.origPosByMsg.delete(msgEl);
            msgEl.style.overflow = STATE.origOverflowByMsg.get(msgEl) || '';
            STATE.origOverflowByMsg.delete(msgEl);
          }
        } catch {}
      }

      D.getElementById(CSS_MANCHOR_STYLE_ID)?.remove();
      try { D.documentElement.removeAttribute(ATTR_MANCHOR_SYMBOL_THEME); } catch {}
      try { D.documentElement.removeAttribute(ATTR_MANCHOR_SYMBOL_BOXED); } catch {}
      try { D.documentElement.removeAttribute(ATTR_MANCHOR_SYMBOL_PAGE_SIZE); } catch {}
      try { D.documentElement.removeAttribute(ATTR_MANCHOR_GUTTER_GUIDE); } catch {}

      STATE.symbolBoxed = null;
      STATE.symbolPageSize = null;
      STATE.gutterGuideMode = null;
      STATE.enabledSymbols = null;
      STATE.symbolVariants = null;
      STATE.booted = false;
      DIAG_step('dispose:ok');
    } catch (e) {
      DIAG_error(e);
    }
  }

  MOD_OBJ.boot = MOD_OBJ.boot || CORE_MA_boot;
  MOD_OBJ.dispose = MOD_OBJ.dispose || CORE_MA_dispose;

  function CORE_MA_autostart() {
    if (!CFG_MANCHOR.AUTO_START) return;
    if (D.readyState === 'loading') {
      D.addEventListener(EV_DOM_CONTENT_LOADED, CORE_MA_boot, { once: true });
    } else {
      CORE_MA_boot();
    }
  }

  CORE_MA_autostart();

})();
