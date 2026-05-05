// ==UserScript==
// @h2o-id             0z1a.control.hub
// @name               0Z1a.⬛️🕹️ Control Hub 🕹️
// @namespace          H2O.Premium.CGX.control.hub
// @author             HumamDev
// @version            4.1.0
// @revision           002
// @build              260425-000003
// @description        Liquid-glass cockpit to toggle MiniMap, Highlighter, Library Workspace, and other H2O feature controls. Uses window.h2oConfig.features.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==


/* 🔑 MODULE KEYS INVENTORY (Values)

   Storage (Disk) — KEY_:
     - KEY_CHUB_CFG_UI_V1      = "h2o:prm:cgx:cntrlhb:cfg:ui:v1"
     - KEY_CHUB_FEATCAT_V1     = "h2o:prm:cgx:cntrlhb:state:featcat:v1"
     - KEY_CHUB_MIG_HUB_V1     = "h2o:prm:cgx:cntrlhb:migrate:hub:v1"
     - KEY_CHUB_STATE_HUB_V1   = "h2o:prm:cgx:cntrlhb:state:hub:v1"
     - KEY_LEGACY_HO_HUB_V2    = "ho:controlhub:v2"

   Events (Topics) — EV_:
     - EV_CHUB_CHANGED_V1      = "h2o.ev:prm:cgx:cntrlhb:changed:v1"
     - EV_CHUB_NAV_CANON       = "evt:h2o:navigate"
     - EV_CHUB_NAV_LEG         = "ho:navigate"
     - EV_CHUB_READY_V1        = "h2o.ev:prm:cgx:cntrlhb:ready:v1"
     - EV_PM_READY_V1          = "evt:h2o:pm:ready:v1"
     - EV_SECTION_BANDS_AUTO   = "h2o:section-bands:auto-mode"

   Selectors — SEL_:
     - SEL_CHUB_BACKDROP       = "[data-cgxui=\"cnhb-backdrop\"][data-cgxui-owner=\"cnhb\"]"
     - SEL_CHUB_BODY           = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"] .cgxui-cnhb-body"
     - SEL_CHUB_DETAIL         = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"] .cgxui-cnhb-detail"
     - SEL_CHUB_DOCK           = "[data-cgxui=\"cnhb-dock\"][data-cgxui-owner=\"cnhb\"]"
     - SEL_CHUB_FNAME          = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"] .cgxui-cnhb-fn"
     - SEL_CHUB_FSUB           = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"] .cgxui-cnhb-fs"
     - SEL_CHUB_LIST           = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"] .cgxui-cnhb-list"
     - SEL_CHUB_PANEL          = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"]"
     - SEL_CHUB_PILL           = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"] .cgxui-cnhb-pill"
     - SEL_CHUB_TABS           = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"] .cgxui-cnhb-tabs"
     - SEL_CHUB_TOPBTN         = "[data-cgxui=\"cnhb-topbtn\"][data-cgxui-owner=\"cnhb\"]"
     - SEL_CHUB_XBTN           = "[data-cgxui=\"cnhb-panel\"][data-cgxui-owner=\"cnhb\"] .cgxui-cnhb-x"

   UI Hooks — UI_:
     - UI_CHUB_BACKDROP        = "cnhb-backdrop"
     - UI_CHUB_BTN             = "cnhb-topbtn"
     - UI_CHUB_DOCK            = "cnhb-dock"
     - UI_CHUB_PANEL           = "cnhb-panel"
     - UI_CHUB_TOPBTN          = "cnhb-topbtn"

   CSS IDs — CSS_:
     - CSS_CHUB_STYLE_ID       = "cgxui-cnhb-style"

   DOM Attributes — ATTR_:
     - ATTR_CGXUI              = "data-cgxui"
     - ATTR_CGXUI_KEY          = "data-cgxui-key"
     - ATTR_CGXUI_MODE         = "data-cgxui-mode"
     - ATTR_CGXUI_ORDER        = "data-cgxui-order"
     - ATTR_CGXUI_OWNER        = "data-cgxui-owner"
     - ATTR_CGXUI_STATE        = "data-cgxui-state"
     - ATTR_CHUB_ART           = "data-h2o-chub-artifact"
     - ATTR_ROLE               = "role"
     - ATTR_TESTID             = "data-testid"

  Config — CFG_:
     - CFG_CH                  = "(non-string; see code)"
   Runtime State — STATE_:
     - STATE_CH                = "(non-string; see code)"

   Dynamic Key Patterns — (generated surfaces; highest coupling):
     - NS_DISK (storage namespace)      = "h2o:prm:cgx:cntrlhb"
     - NS_EV (event namespace)          = "h2o.ev:prm:cgx:cntrlhb"
     - KEY_* (disk schema pattern)      = "h2o:prm:cgx:cntrlhb:<domain>:<name>:v<major>"
     - EV_* (topic schema pattern)      = "h2o.ev:prm:cgx:cntrlhb:<topic>:v<major>"
     - Owned selector pattern           = "[data-cgxui=\"<ui>\"][data-cgxui-owner=\"cnhb\"]"
     - Scoped class prefix              = "cgxui-cnhb"
     - Plugin style id pattern          = "cgxui-cnhb-plugin-<canonical>"
*/


(() => {
  'use strict';

  try {

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */

  const W = window;
  const D = document;

  // ✅ LOCKED identity (Control Hub)
  const TOK  = 'CH';
  const PID  = 'cntrlhb';
  const BrID = PID;
  const DsID = PID;
  const CID  = 'chub';
  const SkID = 'cnhb';

  const MODTAG = 'CtrlHub';
  const MODICON = '🕹️';
  const EMOJI_HDR = 'ON';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  // H2O vault
  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP, modtag: MODTAG, suite: SUITE, host: HOST,
  };

  // DIAG (bounded)
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;

  // optional ecosystem registries (MODE B: warn + keep first)
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS 📄🔒💧 ───────────────────────────── */

const CFG_CH = {
  /* ===================== 🎛️ Control Hub — TUNING KEYS =====================
   * Change values below to tune size, scrolling, colors, and blur.
   * Keys marked with 👈 are the ones you'll tweak most often.
   * ====================================================================== */
  BACKDROP_Z: 2147483659,
  PANEL_Z: 2147483679,

  // ── Size / Layout tuning (UI) ─────────────────────────────
  PANEL_TOP_PCT: 50,          // % : vertical anchor of panel (44→50 centers it)
    PANEL_W_VW: 72,             // vw: width cap (was 68vw)
  PANEL_MAX_H_VH: 92,         // vh: overall panel max height (was 70vh)
  PANEL_MAX_H_PX: 900,        // px: overall panel max height cap (was 620px)

  MAIN_MAX_H_VH: 88,          // vh: inner grid max height (keep <= PANEL_MAX_H_VH)
  LIST_PAD_RIGHT_PX: 12,      // px: right padding so scrollbar doesn’t overlay content 👈

  // ── Width / Height fine tuning (advanced) ─────────────────
  PANEL_W_PX: 900,            // px: hard width cap before vw applies 👈            // px: hard width cap before vw applies 👈
  PANEL_MIN_W_PX: 540,        // px: minimum usable width on small screens
  PANEL_LEFT_PCT: 50,         // % : horizontal anchor (usually keep 50)
  BACKDROP_BLUR_PX: 2,       // px: background blur when hub is open 👈

  // ── Hub background tuning ─────────────────────────────────
  HUB_BG_A: 'rgba(255,255,255,0.04)',    // base gradient A 👈
  HUB_BG_B: 'rgba(255,255,255,0.04)',    // base gradient B 👈
  HUB_TINT_A: 'rgba(255,255,255,0.04)', // top-left tint 👈
  HUB_TINT_B: 'rgba(255,255,255,0.04)', // bottom-right tint 👈

  // ── Self-heal / recovery ──────────────────────────────────
  BUTTON_REPAIR_MS: 900,
};


  const EV_SECTION_BANDS_AUTO = 'h2o:section-bands:auto-mode';
  const FEATURE_KEY_SECTION_BANDS = 'sectionBands';
  const KEY_SECTION_BANDS_BINDINGS_V1 = 'h2o:prm:cgx:sctnbnds:cfg:bindings:v1';
  const KEY_SECTION_BANDS_PALETTE_V1 = 'h2o:prm:cgx:sctnbnds:cfg:palette:v1';
  const CHUB_SB_PALETTE_DEFAULTS = Object.freeze([
    Object.freeze({ key: 'olive',  label: 'Color 1', hex: '#78866b' }),
    Object.freeze({ key: 'gold',   label: 'Color 2', hex: '#ebc86e' }),
    Object.freeze({ key: 'red',    label: 'Color 3', hex: '#cd5a5a' }),
    Object.freeze({ key: 'blue',   label: 'Color 4', hex: '#5c91c8' }),
    Object.freeze({ key: 'purple', label: 'Color 5', hex: '#9273c8' }),
  ]);
  const CHUB_SB_APPLY_START_DEFAULT = 'default';
  const CHUB_SB_APPLY_START_MODES = Object.freeze([
    ['default', 'Default Color'],
    ['same_last', 'Same As Last Used'],
    ['next_after_last', 'Next After Last Used'],
  ]);

  // ATTR_ (real attribute-name strings)
  const ATTR_TESTID     = 'data-testid';
  const ATTR_ROLE       = 'role';
  const ATTR_CGXUI      = 'data-cgxui';
  const ATTR_CGXUI_OWNER= 'data-cgxui-owner';
  const ATTR_CGXUI_STATE= 'data-cgxui-state';
  const ATTR_CGXUI_KEY  = 'data-cgxui-key';
  const ATTR_CGXUI_MODE = 'data-cgxui-mode';
  const ATTR_CGXUI_ORDER= 'data-cgxui-order';
  const ATTR_CHUB_ART   = 'data-h2o-chub-artifact';

  // Namespaces (boundary-only)
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;    // no trailing ":"
  const NS_EV   = `h2o.ev:${SUITE}:${HOST}:${DsID}`; // no trailing ":"

  // Disk keys (contract-compliant)
  const KEY_CHUB_STATE_HUB_V1 = `${NS_DISK}:state:hub:v1`;
  const KEY_CHUB_CFG_UI_V1    = `${NS_DISK}:cfg:ui:v1`;
  const KEY_CHUB_MIG_HUB_V1   = `${NS_DISK}:migrate:hub:v1`;
  const KEY_CHUB_FEATCAT_V1   = `${NS_DISK}:state:featcat:v1`;
  const KEY_CHUB_TAB_VIS_V1   = `${NS_DISK}:state:tab-visibility:v1`;
  const KEY_CHUB_CHAT_PERFORMANCE_SUBTAB_V1 = `${NS_DISK}:state:chat-performance:subtab:v1`;
  const KEY_CHUB_CHAT_NAVIGATION_SUBTAB_V1 = `${NS_DISK}:state:chat-navigation:subtab:v1`;
  const KEY_CHUB_MARKUP_SUBTAB_V1 = `${NS_DISK}:state:markup:subtab:v1`;
  const KEY_CHUB_ANNOTATIONS_SUBTAB_V1 = `${NS_DISK}:state:annotations:subtab:v1`;
  const KEY_CHUB_WORKSPACE_SUBTAB_V1 = `${NS_DISK}:state:workspace:subtab:v1`;
  const KEY_CHUB_INTERFACE_SUBTAB_V1 = `${NS_DISK}:state:interface:subtab:v1`;
  const KEY_CHUB_CONTROL_SUBTAB_V1 = `${NS_DISK}:state:control:subtab:v1`;
  const KEY_CHUB_LIBRARY_SUBTAB_V1 = `${NS_DISK}:state:library:subtab:v1`;
  const KEY_CHUB_LIBRARY_SIDEBAR_LAYOUT_V1 = 'h2o:prm:cgx:library-workspace:sidebar-layout:v1';
  const KEY_CHUB_MAIN_TAB_ORDER_V1 = `${NS_DISK}:state:main-tab-order:v1`;
  const KEY_CHUB_ACCENT_V1 = `${NS_DISK}:state:accent:v1`;
  const KEY_CHUB_BUTTON_ACCENT_V1 = `${NS_DISK}:state:accent:buttons:v1`;
  const KEY_CHUB_NAV_ACCENT_V1 = `${NS_DISK}:state:accent:navigation:v1`;
  const KEY_CHUB_SURFACE_ACCENT_V1 = `${NS_DISK}:state:accent:surface:v1`;

  const FEATURE_KEY_ACCOUNT = 'account';
  const FEATURE_KEY_CONTROL = 'control';
  const FEATURE_KEY_CONTROL_HUB = 'controlHub';
  const FEATURE_KEY_COMMAND_BAR = 'commandBar';
  const FEATURE_KEY_ACTION_PANEL = 'actionPanel';
  const FEATURE_KEY_CHAT_PERFORMANCE = 'chatPerformance';
  const FEATURE_KEY_CHAT_NAVIGATION = 'chatNavigation';
  const FEATURE_KEY_CHAT_ANSWERS = 'chatAnswers';
  const FEATURE_KEY_MARKUP = 'markup';
  const FEATURE_KEY_ANNOTATIONS = 'annotations';
  const FEATURE_KEY_NOTES = 'notes';
  const FEATURE_KEY_PROMPT_MANAGER = 'promptManager';
  const FEATURE_KEY_WORKSPACE = 'workspace';
  const FEATURE_KEY_WORKSPACE_SHELF = 'workspaceShelf';
  const FEATURE_KEY_WORKSPACE_DRAWER = 'workspaceDrawer';
  const FEATURE_KEY_DATA_BACKUP = 'dataBackup';
  const FEATURE_KEY_EXPORT = 'export';
  const FEATURE_KEY_STUDIO = 'studio';
  const FEATURE_KEY_LIBRARY = 'library';
  const FEATURE_KEY_LIBRARY_PROJECTS = 'projects';
  const FEATURE_KEY_LIBRARY_CATEGORIES = 'categories';
  const FEATURE_KEY_LIBRARY_LABELS = 'labels';
  const FEATURE_KEY_LIBRARY_TAGS = 'tags';
  const FEATURE_KEY_INTERFACE = 'interface';
  const FEATURE_KEY_THEMES = 'themes';

  // Legacy disk key (read-only migration)
  const KEY_LEGACY_HO_HUB_V2 = 'ho:controlhub:v2';

  // EV_ (defined; not required to be emitted in Stage 1)
  const EV_CHUB_READY_V1   = `${NS_EV}:ready:v1`;
  const EV_CHUB_CHANGED_V1 = `${NS_EV}:changed:v1`;
  const EV_CHUB_NAV_LEG    = 'ho:navigate';
  const EV_CHUB_NAV_CANON  = 'evt:h2o:navigate';
  const EV_CHUB_OPEN_REQ   = 'h2o-ext:control-hub-open:req';
  const EV_CHUB_OPEN_RES   = 'h2o-ext:control-hub-open:res';
  const EV_PM_READY_V1      = 'evt:h2o:pm:ready:v1';

  // UI tokens (SkID-based values)
  const UI_CHUB_TOPBTN   = `${SkID}-topbtn`;
  const UI_CHUB_BACKDROP = `${SkID}-backdrop`;
  const UI_CHUB_PANEL    = `${SkID}-panel`;
  const UI_CHUB_DOCK     = `${SkID}-dock`;
  const UI_CHUB_BTN      = UI_CHUB_TOPBTN; // plugin/compat alias

  // CSS ids (cgxui- namespace)
  const CSS_CHUB_STYLE_ID    = `cgxui-${SkID}-style`;

  // Light class prefix (owned only; cgxui namespace)
  const CLS = `cgxui-${SkID}`;

  // Modes + meta
  const MODES = ['default', 'focus', 'review', 'performance'];

  // Feature categories (left rail filter)
  const CAT_ALL = 'all';
  const CAT_NAV = 'nav';
  const CAT_MARK = 'mark';
  const CAT_SAVE = 'save';
  const CAT_PERF = 'perf';

  const FEATURE_CATS = [
    { id: CAT_ALL,  label: 'All' },
    { id: CAT_NAV,  label: 'Navigate' },
    { id: CAT_MARK, label: 'Mark & Read' },
    { id: CAT_SAVE, label: 'Save & Sync' },
    { id: CAT_PERF, label: 'Performance & Look' },
  ];

		const FEATURE_META = [
    { key:FEATURE_KEY_ACCOUNT, label:'Account', icon:'👤',
      subtitle:'Cockpit Pro account and service identity.',
      description:{
        default:'Review H2O identity state and open onboarding.',
        focus:'Account identity actions are bridge-owned; storage linking lives under Data > Connect.',
        review:'Use onboarding for account setup and Data > Connect for storage links.',
        performance:'Identity state is read from the H2O Identity facade.',
      }},
    { key:FEATURE_KEY_CONTROL, label:'Control', icon:'🎛️',
      subtitle:'Control Hub, Command Bar, and Action Panel settings grouped together.',
      description:{
        default:'Tune the Control Hub itself, plus the launcher-tab placement for Command Bar and Action Panel from one place.',
        focus:'Keep the control surfaces predictable while choosing which edge each launcher tab should live on.',
        review:'Switch between Control Hub, Command Bar, and Action Panel settings without leaving the same control workspace.',
        performance:'Group control-surface settings together so system tuning stays separate from feature workflows.',
      }},
    { key:FEATURE_KEY_CONTROL_HUB, label:'Control Hub', icon:'🕹️',
      subtitle:'Launcher gestures, Tab Tree behavior, and cockpit sizing.',
      description:{
        default:'Choose which Cockpit gestures open the hub and Tab Tree, then tune the panel size.',
        focus:'Keep launcher behavior predictable while preserving a roomy detail pane for focused sessions.',
        review:'Set up a stable quick-tools flow and a wider right pane for review-heavy controls.',
        performance:'Tune the panel footprint and keep the right pane scrollable instead of cramming controls.',
      },
      hidden:true,
      toggleHidden:true},
    { key:FEATURE_KEY_COMMAND_BAR, label:'Command Bar', icon:'⌨️',
      subtitle:'System-control surface settings for the Command Bar launcher tab.',
      description:{
        default:'Choose where the Command Bar launcher tab appears: on the page edge or on the sidebar edge.',
        focus:'Keep the Command Bar reachable from the side that best fits your current workspace layout.',
        review:'Move the Command Bar launcher without changing what the Command Bar itself is for.',
        performance:'Keep system-control access predictable while leaving the rest of the Command Bar untouched.',
      },
      hidden:true},
    { key:FEATURE_KEY_ACTION_PANEL, label:'Action Panel', icon:'🎛️',
      subtitle:'User-facing feature action shelf settings for the Action Panel launcher tab.',
      description:{
        default:'Choose where the Action Panel launcher tab appears: on the page edge or on the sidebar edge.',
        focus:'Place the Action Panel where daily feature-use actions are easiest to reach.',
        review:'Move the Action Panel launcher without mixing it into the Command Bar workflow.',
        performance:'Keep feature-action access predictable while preserving the Action Panel role as a user-facing shelf.',
      },
      hidden:true},
    { key:FEATURE_KEY_CHAT_NAVIGATION, label:'Chat Navigation', icon:'🧭',
      subtitle:'Mini Map + answer/question navigation controls.',
      description:{
        default:'Group Mini Map, answer navigation, and question controls into one navigation workspace.',
        focus:'Keep answer and question jumping together while staying inside one hub section.',
        review:'Switch between Mini Map scanning, answer bindings, and question tools without leaving navigation.',
        performance:'Keep navigation controls consolidated so long-chat tuning stays predictable.',
      }},
    { key:'minimap',           label:'Mini Map',           icon:'🗺️',
      subtitle:'Sidebar MiniMap + answer map + nav buttons.',
      description:{default:'Balanced navigation.', focus:'Emphasize current answer.', review:'Scan long chats fast.', performance:'Fewer effects for speed.'},
      hidden:true},
    { key:FEATURE_KEY_CHAT_ANSWERS, label:'Chat Answers', icon:'❗️',
      subtitle:'Answer-turn navigation bindings from the Mini Map stack.',
      description:{
        default:'Focus answer-jump bindings and turn interactions without leaving the navigation area.',
        focus:'Keep answer click behavior tight while reviewing long assistant replies.',
        review:'Tune how answer turns react while scanning dense chats.',
        performance:'Adjust answer-turn bindings without opening the full Mini Map control stack.',
      },
      hidden:true},
    { key:'questions',         label:'Chat Questions',     icon:'❓',
      subtitle:'Question bubble tools (QWrap, etc).',
      description:{default:'Control question UI behaviors (quote bubble position).', focus:'Keep questions compact and readable.', review:'Make quoted context easier to scan.', performance:'Minimal DOM changes for speed.'},
      hidden:true},
    { key:FEATURE_KEY_MARKUP, label:'Markup', icon:'🖌️',
      subtitle:'Highlighting + section band controls in one place.',
      description:{
        default:'Keep the main reading markup tools together under one tab.',
        focus:'Switch between inline highlights and section bands without leaving the markup area.',
        review:'Tune marking tools side by side while reviewing long answers.',
        performance:'Consolidate markup controls so the hub stays organized while features stay unchanged.',
      }},
    { key:'inlineHighlighter', label:'Highlighter',        icon:'🖌️',
      subtitle:'Sentence-level highlights and inline tools.',
      description:{default:'Standard palette + shortcuts.', focus:'Stronger emphasis colors.', review:'Mark summary sentences.', performance:'Minimal DOM / animations.'},
      hidden:true},
    { key:'sectionBands',      label:'Section Bands',      icon:'🧱',
      subtitle:'Colored bands grouping answer sections.',
      description:{default:'Soft, readable bands.', focus:'High-contrast focus blocks.', review:'Clear big-chunk separation.', performance:'Subtle, low-cost bands.'},
      hidden:true},
    { key:FEATURE_KEY_ANNOTATIONS, label:'Annotations', icon:'📍',
      subtitle:'Margin anchors + notes surfaces grouped together.',
      description:{
        default:'Keep anchor marks and notes tools inside one annotations workspace.',
        focus:'Switch between margin anchors and notes without hunting across separate hub areas.',
        review:'Use anchors and notes together while reviewing longer chats.',
        performance:'Keep annotation tools grouped while the underlying features stay unchanged.',
      }},
    { key:'marginAnchor',      label:'Margin Anchor',      icon:'📍',
      subtitle:'Left-margin pins, notes, and status dots.',
      description:{default:'Quickly jump to any margin pin.', focus:'Surface active notes and anchors.', review:'Keep reference marks visible during longer reads.', performance:'Keep anchors lightweight.'},
      hidden:true},
    { key:FEATURE_KEY_NOTES, label:'Notes', icon:'🗒️',
      subtitle:'Open and refresh the Dock Notes surface from Control Hub.',
      description:{
        default:'Launch the existing Notes tab from Dock Panel and keep note actions nearby.',
        focus:'Jump into Notes quickly while staying in the annotations area.',
        review:'Open Notes and refresh side notes without leaving the review flow.',
        performance:'Bridge into the current Notes surface instead of duplicating another notes system.',
      },
      hidden:true},
    { key:FEATURE_KEY_PROMPT_MANAGER, label:'Prompt Manager', icon:'✍️',
      subtitle:'Prompt library, search, tray, and quick prompt actions.',
      description:{
        default:'Open Prompt Manager, focus its search, and control the quick prompt tray from one place.',
        focus:'Keep prompt lookup close without digging through the composer area.',
        review:'Jump between saved prompts and quick tray tools while reviewing long chats.',
        performance:'Use prompt tooling directly without keeping extra panels open longer than needed.',
      }},
    { key:'dockPanel',         label:'Chat Dock',          icon:'🎖️',
      subtitle:'Docked sidebar with tabs + side-panel controls.',
      description:{
        default:'Dock context, tabs, and side-panel controls.',
        focus:'Lean dock layouts with minimal side-panel clutter.',
        review:'Highlight nav tabs while keeping the side panel tidy.',
        performance:'Lazy tab rendering and light side-panel updates.',
      }},
    { key:FEATURE_KEY_WORKSPACE, label:'Workspace', icon:'🧱',
      subtitle:'Shelf and Drawer controls for the right-side workspace.',
      description:{
        default:'Control Shelf and Drawer behavior from one workspace tab.',
        focus:'Keep the active workspace pane easy to switch while you stay in the current chat.',
        review:'Move between Shelf and Drawer without hunting for shell buttons.',
        performance:'Choose the lighter workspace presentation mode when the chat UI feels crowded.',
      }},
    { key:FEATURE_KEY_WORKSPACE_SHELF, label:'Shelf', icon:'📚',
      subtitle:'Open and configure the Shelf workspace pane.',
      description:{default:'Open the Shelf and adjust how the workspace shell is presented.', focus:'Keep saved context visible in the Shelf.', review:'Return to the Shelf quickly while checking artifacts.', performance:'Use the lightest shell mode for Shelf work.'},
      hidden:true},
    { key:FEATURE_KEY_WORKSPACE_DRAWER, label:'Drawer', icon:'🧰',
      subtitle:'Open and configure the Drawer workspace pane.',
      description:{default:'Open the Drawer and adjust how the workspace shell is presented.', focus:'Keep artifact editing one click away.', review:'Use the Drawer while inspecting notes and prompt capsules.', performance:'Switch Drawer presentation without overloading the viewport.'},
      hidden:true},
    { key:FEATURE_KEY_DATA_BACKUP, label:'Data & Backup', icon:'🗄️',
      subtitle:'Sync, backup, archive, and restore utilities.',
      description:{
        default:'Work with sync, backups, archives, and restore surfaces from one data tab.',
        focus:'Keep capture and restore tools close while reviewing sensitive chats.',
        review:'Bundle long-chat preservation tools together before exporting or filing.',
        performance:'Use the storage surfaces without scattering archive actions across the hub.',
      },
      toggleHidden:true},
    { key:'data',              label:'Data',                icon:'🗄️',
      subtitle:'Store, backup, and archive utilities.',
      description:{default:'Browse and export H2O Data backups.', focus:'Keep the latest snapshot close while reviewing.', review:'Snapshot long chats for later reference.', performance:'Lightweight exports that stay out of the way.'},
      hidden:true},
    { key:FEATURE_KEY_EXPORT,  label:'Export',             icon:'📀',
      subtitle:'Markdown / HTML / package export controls.',
      description:{
        default:'Keep export defaults and output behavior in one dedicated export tab.',
        focus:'Preset export settings before capturing focused review bundles.',
        review:'Prepare clean handoff exports without mixing them into backup tools.',
        performance:'Use the smallest export path that still preserves what you need.',
      },
      toggleHidden:true},
    { key:'saveExport',        label:'Export Chat',        icon:'📀',
      subtitle:'Save to Markdown / HTML / OneNote.',
      description:{default:'Standard exports.', focus:'Export selected focus items.', review:'Bundle summaries.', performance:'Fast/minimal processing.'},
      hidden:true},
    { key:FEATURE_KEY_STUDIO,  label:'Studio',             icon:'🧪',
      subtitle:'Workbench / Studio entry points for saved snapshots.',
      description:{
        default:'Open the saved-chat studio, snapshot reader, and workbench surfaces.',
        focus:'Jump straight into captured material while keeping the live chat uncluttered.',
        review:'Inspect saved chat snapshots and workbench rows from one studio tab.',
        performance:'Use reader and workbench surfaces only when you need them, not all the time.',
      },
      toggleHidden:true},
    { key:FEATURE_KEY_LIBRARY, label:'Library',            icon:'🗂️',
      subtitle:'Browse, organize, and retrieve chats through folders.',
      description:{
        default:'Keep folder-based library organization in its own tab instead of mixing it into raw data tools.',
        focus:'Bring project folders closer while you stay on the active thread.',
        review:'Use library organization to locate and regroup chats quickly.',
        performance:'Keep retrieval tools separate from backup flows so the hub stays easier to scan.',
      }},
    { key:FEATURE_KEY_LIBRARY_PROJECTS, label:'Projects', icon:'📁',
      subtitle:'Native project sidebar behavior.',
      description:{default:'Reference native Projects behavior from the Library tab.', focus:'Keep native project controls visible beside folder and category settings.', review:'Use this as the Library baseline while tuning adjacent sidebar sections.', performance:'No extra runtime controls are added here.'},
      hidden:true},
    { key:'folders',           label:'Folders',            icon:'🗂️',
      subtitle:'Project / folder list tweaks.',
      description:{default:'Tweak folder spacing & colors.', focus:'Focus on active projects.', review:'Highlight project grouping.', performance:'Minimal DOM work.'},
      hidden:true},
    { key:FEATURE_KEY_LIBRARY_CATEGORIES, label:'Categories', icon:'🏷️',
      subtitle:'Category sidebar open behavior.',
      description:{default:'Choose how category rows open from the native sidebar.', focus:'Open category lists in the least distracting surface for the current workflow.', review:'Switch between page and panel browsing for category chat groups.', performance:'Use a lighter panel surface when a full page view is unnecessary.'},
      hidden:true},
    { key:FEATURE_KEY_LIBRARY_LABELS, label:'Labels', icon:'🔖',
      subtitle:'Label sidebar counters, previews, and section-open behavior.',
      description:{default:'Tune the Labels sidebar section so it matches the rest of the Library surfaces.', focus:'Keep label browsing compact while deciding whether labels open inline, in-page, or in-panel.', review:'Switch between count-heavy scanning and cleaner preview flows without leaving the Library tab.', performance:'Keep Labels lightweight by choosing the smallest surface and section-open behavior that still fits the task.'},
      hidden:true},
    { key:FEATURE_KEY_LIBRARY_TAGS, label:'Tags', icon:'#️⃣',
      subtitle:'Current-chat tag mode and tag surface controls.',
      description:{default:'Switch current-chat tagging between manual and automatic modes from the Library tab.', focus:'Keep tag mode close to Categories while working on the active chat.', review:'Change tagging behavior without opening the Categories page first.', performance:'Use a lightweight toggle for current-chat tag mode.'},
      hidden:true},
    { key:FEATURE_KEY_CHAT_PERFORMANCE, label:'Performance', icon:'⚡️',
      subtitle:'Unmounting and pagination tools for long chats.',
      description:{
        default:'Tune unmounting and pagination windowing from one place.',
        focus:'Switch between unmounting and pagination controls without leaving the performance area.',
        review:'Keep long threads manageable with either remounting or page windowing.',
        performance:'Centralized controls for keeping heavy chats responsive.',
      }},
    { key:'chatMechanisms',   label:'Mechanisms',   icon:'🔀',
      subtitle:'Route title and page divider gestures between legacy and engine-backed behavior.',
      description:{
        default:'Choose whether title and page-divider gestures keep using their legacy handlers or route into the new engines.',
        focus:'Keep gesture behavior explicit while combining it with global chat optimization only when needed.',
        review:'Switch between legacy and engine-backed gesture handling without mixing it into unrelated controls.',
        performance:'Keep gesture routing and global optimizers together in one Performance workspace without widening Control Hub core.',
      },
      hidden:true},
    { key:'unmountMessages',   label:'Unmounting',   icon:'⛰️',
      subtitle:'Soft virtual-scrolling for long chats.',
      description:{default:'Unmount far-away messages.', focus:'Keep scroll light for focus mode.', review:'Re-mount when needed.', performance:'Keeps DOM small.'},
      hidden:true},
    { key:'paginationWindowing', label:'Pagination Windowing', icon:'🪟',
      subtitle:'Page long chats into answer windows.',
      description:{default:'Split long threads into page-sized answer windows.', focus:'Keep attention on one window at a time.', review:'Jump across large answer sets quickly.', performance:'Window the thread before DOM weight spikes.'},
      hidden:true},
    { key:FEATURE_KEY_INTERFACE, label:'Interface', icon:'🖥️',
      subtitle:'Chat list styling plus title helper surfaces.',
      description:{
        default:'Keep interface styling and title helpers under one interface tab.',
        focus:'Switch between chat-list indicators and title helpers without leaving interface controls.',
        review:'Use interface sub-tabs to tune labels and sidebar cues separately.',
        performance:'Keep lightweight interface helpers grouped so UI tuning stays predictable.',
      }},
    { key:'interfaceEnhancer', label:'Interface Enhancer', icon:'🖥️',
      subtitle:'Sidebar + project list color dots.',
      description:{default:'Heatmap-style indicators for chats.', focus:'Spot recent chats faster.', review:'Quick color toggles near chat links.', performance:'Small DOM footprint.'},
      hidden:true},
    { key:'titles',            label:'Titles',             icon:'🏷️',
      subtitle:'Title helpers for answers + chats.',
      description:{default:'Sync titles with MiniMap + cards.', focus:'Keep labels legible.', review:'Badge + tooltip helpers.', performance:'Lightweight updates.'},
      hidden:true},
    { key:'numbers',           label:'Numbers',            icon:'🧮',
      subtitle:'Answer + question number surfaces.',
      description:{default:'Tune answer and question number overlays from one place.', focus:'Keep large number helpers readable without leaving interface controls.', review:'Adjust fade, offset, and size for title/number helpers while scanning long chats.', performance:'Keep number overlays legible while controlling how strong their visual footprint is.'},
      hidden:true},
    { key:FEATURE_KEY_THEMES,  label:'Themes',             icon:'🎨',
      subtitle:'Color themes and layout tweaks.',
      description:{
        default:'Open the themes surface and keep theme defaults together in one tab.',
        focus:'Use theme controls to keep reading contrast consistent.',
        review:'Adjust long-session colors without mixing them into unrelated interface tools.',
        performance:'Simplify theme changes when you want the lightest UI setup.',
      }},
    { key:'themesPanel',       label:'Themes Panel',       icon:'🎨',
      subtitle:'Color themes and layout tweaks.',
      description:{default:'Normal dark theme controls.', focus:'Focus-friendly contrast.', review:'Long-reading colors.', performance:'Simplified theme.'},
      hidden:true},
	  ];

  function CHUB_MAIN_TAB_defaultOrder(){
    return FEATURE_META
      .filter((meta) => !meta.hidden)
      .map((meta) => FEATURE_getCanonicalKey(meta.key))
      .filter((key, idx, arr) => key && arr.indexOf(key) === idx);
  }

  function CHUB_MAIN_TAB_normalize(raw){
    const defaults = CHUB_MAIN_TAB_defaultOrder();
    const input = Array.isArray(raw) ? raw.map((key) => FEATURE_getCanonicalKey(key)).filter(Boolean) : [];
    const seen = new Set();
    const out = [];

    for (const key of input){
      if (!defaults.includes(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    for (const key of defaults){
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  }

  function CHUB_MAIN_TAB_load(){
    return CHUB_MAIN_TAB_normalize(UTIL_storage.getJSON(KEY_CHUB_MAIN_TAB_ORDER_V1, null));
  }

  function CHUB_MAIN_TAB_save(next){
    const normalized = CHUB_MAIN_TAB_normalize(next);
    UTIL_storage.setJSON(KEY_CHUB_MAIN_TAB_ORDER_V1, normalized);
    return normalized;
  }

  function CHUB_MAIN_TAB_getOrder(){
    return CHUB_MAIN_TAB_save(CHUB_MAIN_TAB_load());
  }

  function CHUB_MAIN_TAB_getMetaList(category = CAT_ALL){
    const byKey = new Map(FEATURE_META.filter((meta) => !meta.hidden).map((meta) => [FEATURE_getCanonicalKey(meta.key), meta]));
    return CHUB_MAIN_TAB_getOrder()
      .map((key) => byKey.get(key))
      .filter((meta) => !!meta)
      .filter((meta) => category === CAT_ALL || CAT_forFeatureKey(FEATURE_getCanonicalKey(meta.key)) === category);
  }

  function CHUB_MAIN_TAB_move(key, delta){
    const canonical = FEATURE_getCanonicalKey(key);
    const order = CHUB_MAIN_TAB_getOrder().slice();
    const idx = order.indexOf(canonical);
    if (idx < 0) return order;
    const nextIdx = Math.max(0, Math.min(order.length - 1, idx + Number(delta || 0)));
    if (idx === nextIdx) return order;
    const [item] = order.splice(idx, 1);
    order.splice(nextIdx, 0, item);
    return CHUB_MAIN_TAB_save(order);
  }

  function CHUB_MAIN_TAB_reset(){
    return CHUB_MAIN_TAB_save(CHUB_MAIN_TAB_defaultOrder());
  }

  function CHUB_MAIN_TAB_renderEditor(panel){
    const root = D.createElement('div');
    root.className = `${CLS}-tabOrderEditor`;

    const hint = D.createElement('div');
    hint.className = `${CLS}-ctrlHint ${CLS}-tabOrderHint`;
    hint.textContent = 'Reorder the main feature tabs shown in the left list. This changes list order only and stays saved on this device.';
    root.appendChild(hint);

    const list = D.createElement('div');
    list.className = `${CLS}-tabOrderList`;
    root.appendChild(list);

    const actionRow = D.createElement('div');
    actionRow.className = `${CLS}-sbPaletteActions`;

    const resetBtn = D.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = `${CLS}-actionBtn`;
    resetBtn.textContent = 'Reset Default Order';

    const status = D.createElement('span');
    status.className = `${CLS}-ctrlActionStatus`;
    status.style.textAlign = 'left';
    status.style.minWidth = '0';

    const renderRows = () => {
      list.textContent = '';
      const order = CHUB_MAIN_TAB_getOrder();
      const metas = CHUB_MAIN_TAB_getMetaList(CAT_ALL);

      metas.forEach((meta, idx) => {
        const canonicalKey = FEATURE_getCanonicalKey(meta.key);
        const row = D.createElement('div');
        row.className = `${CLS}-tabOrderRow`;
        row.setAttribute(ATTR_CGXUI_KEY, canonicalKey);
        row.setAttribute(ATTR_CGXUI_ORDER, String(idx + 1));

        const left = D.createElement('div');
        left.className = `${CLS}-tabOrderLeft`;

        const index = D.createElement('span');
        index.className = `${CLS}-tabOrderIndex`;
        index.textContent = String(idx + 1);

        const icon = D.createElement('span');
        icon.className = `${CLS}-tabOrderIcon`;
        icon.textContent = meta.icon || '•';

        const textWrap = D.createElement('div');
        textWrap.className = `${CLS}-tabOrderText`;

        const title = D.createElement('div');
        title.className = `${CLS}-tabOrderTitle`;
        title.textContent = meta.label || canonicalKey;

        const sub = D.createElement('div');
        sub.className = `${CLS}-tabOrderSub`;
        sub.textContent = meta.subtitle || '';

        textWrap.append(title, sub);
        left.append(index, icon, textWrap);

        const right = D.createElement('div');
        right.className = `${CLS}-tabOrderMoves`;

        const makeMoveBtn = (txt, moveDelta, titleText, disabled) => {
          const btn = D.createElement('button');
          btn.type = 'button';
          btn.className = `${CLS}-tabOrderMoveBtn`;
          btn.textContent = txt;
          btn.title = titleText;
          btn.disabled = !!disabled;
          btn.addEventListener('click', (evt) => {
            evt.preventDefault();
            CHUB_MAIN_TAB_move(canonicalKey, moveDelta);
            status.textContent = 'Tab order updated.';
            renderRows();
            CORE_CH_invalidate();
          }, true);
          return btn;
        };

        right.append(
          makeMoveBtn('↑', -1, `Move ${meta.label} up`, idx === 0),
          makeMoveBtn('↓', 1, `Move ${meta.label} down`, idx === order.length - 1),
        );

        row.append(left, right);
        list.appendChild(row);
      });
    };

    resetBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      CHUB_MAIN_TAB_reset();
      status.textContent = 'Default order restored.';
      renderRows();
      CORE_CH_invalidate();
    }, true);

    renderRows();
    actionRow.append(resetBtn, status);
    root.appendChild(actionRow);
    return root;
  }

  const CHUB_TRIGGER_OPTIONS = Object.freeze([
    ['left_click', 'Click'],
    ['middle_click', 'Middle Click'],
    ['right_click', 'Right Click'],
    ['left_double', 'Double Click'],
    ['middle_double', 'Double Middle Click'],
    ['right_double', 'Double Right Click'],
    ['none', 'Disabled'],
  ]);

  const CHUB_TRIGGER_VALUES = Object.freeze(CHUB_TRIGGER_OPTIONS.map(([value]) => value));
  const CHUB_TREE_VISIBILITY_OPTIONS = Object.freeze([
    ['toggle_button', 'Stay Visible Until Button Click'],
    ['outside_click', 'Disappear When Clicking Outside'],
  ]);
  const CHUB_REOPEN_TARGET_OPTIONS = Object.freeze([
    ['last_opened', 'Last Tab That Was Opened'],
    ['first_feature', 'First Tab In Feature List'],
    ['control', 'Control Tab'],
  ]);
  const CHUB_UI_LIMITS = Object.freeze({
    panelWidthPx: Object.freeze([560, 1400]),
    panelMaxHeightPx: Object.freeze([480, 1100]),
    listWidthPx: Object.freeze([160, 360]),
    detailMinWidthPx: Object.freeze([250, 760]),
  });
  const CHUB_UI_DEFAULTS = Object.freeze({
    hubOpenTrigger: 'left_click',
    treeOpenTrigger: 'left_double',
    treeCloseBehavior: 'outside_click',
    hubReopenTarget: 'last_opened',
    panelWidthPx: CFG_CH.PANEL_W_PX,
    panelMaxHeightPx: CFG_CH.PANEL_MAX_H_PX,
    listWidthPx: 230,
    detailMinWidthPx: 520,
  });
  const CHUB_TOPBTN_GESTURE_DELAY_MS = 280;
  const CHUB_TOPBTN_BOUND_MARK = '__h2oChubTopBtnBoundV2__';
  const CHUB_RESIZE_MIN_HEIGHT_PX = 460;
  const CHUB_RESIZE_HANDLE_THICKNESS_PX = 14;
  const CHUB_RESIZE_CORNER_SIZE_PX = 26;
  const CHUB_RESIZE_BOUND_MARK = '__h2oChubResizeBoundV4__';
  const CHUB_RESIZE_HANDLE_BOUND_MARK = '__h2oResizeHandleBoundV4__';
  const CHUB_STATE_SCOPE_HUB = '__hub__';
  const CHUB_STATE_LAST_MAIN_TAB_KEY = 'lastMainTabKey';

  function CHUB_SB_bindingsApi(){
    return W.H2O?.SB?.sctnbnds?.api?.bindings || null;
  }

  function CHUB_SB_paletteApi(){
    return W.H2O?.SB?.sctnbnds?.api?.paletteConfig || null;
  }

  function CHUB_SB_readBindingsStore(){
    try { return JSON.parse(localStorage.getItem(KEY_SECTION_BANDS_BINDINGS_V1) || '{}') || {}; } catch { return {}; }
  }

  function CHUB_SB_writeBindingsStore(next){
    try { localStorage.setItem(KEY_SECTION_BANDS_BINDINGS_V1, JSON.stringify(next || {})); } catch {}
  }

  function CHUB_SB_getBinding(key, fallback){
    const api = CHUB_SB_bindingsApi();
    if (api && typeof api.getBinding === 'function') {
      const live = api.getBinding(key);
      if (live != null) return live;
    }
    const raw = CHUB_SB_readBindingsStore();
    return String(raw?.[key] ?? fallback ?? 'none');
  }

  function CHUB_SB_setBinding(key, value){
    const api = CHUB_SB_bindingsApi();
    if (api && typeof api.setBinding === 'function') {
      api.setBinding(key, value);
      return;
    }
    const raw = CHUB_SB_readBindingsStore();
    raw[key] = value;
    CHUB_SB_writeBindingsStore(raw);
  }

  function CHUB_SB_normalizeHexColor(raw, fallback = null){
    const base = String(raw || '').trim().replace(/^#/, '');
    const expanded = /^[\da-f]{3}$/i.test(base)
      ? base.split('').map((ch) => ch + ch).join('')
      : base;
    if (!/^[\da-f]{6}$/i.test(expanded)) return fallback;
    return `#${expanded.toLowerCase()}`;
  }

  function CHUB_SB_normalizePaletteConfig(raw){
    const colors = CHUB_SB_PALETTE_DEFAULTS.map((fallback, idx) => {
      const incoming = Array.isArray(raw?.colors) ? raw.colors[idx] : null;
      return {
        key: fallback.key,
        label: `Color ${idx + 1}`,
        hex: CHUB_SB_normalizeHexColor(incoming?.hex, fallback.hex),
      };
    });
    const keys = colors.map((color) => color.key);
    const defaultKey = keys.includes(raw?.defaultKey) ? raw.defaultKey : CHUB_SB_PALETTE_DEFAULTS[0].key;
    const applyStartMode = CHUB_SB_APPLY_START_MODES.some(([value]) => value === raw?.applyStartMode)
      ? raw.applyStartMode
      : CHUB_SB_APPLY_START_DEFAULT;
    const lastUsedKey = keys.includes(raw?.lastUsedKey) ? raw.lastUsedKey : null;
    return { colors, defaultKey, applyStartMode, lastUsedKey };
  }

  function CHUB_SB_readPaletteStore(){
    try {
      return CHUB_SB_normalizePaletteConfig(JSON.parse(localStorage.getItem(KEY_SECTION_BANDS_PALETTE_V1) || '{}') || {});
    } catch {
      return CHUB_SB_normalizePaletteConfig(null);
    }
  }

  function CHUB_SB_writePaletteStore(next){
    try { localStorage.setItem(KEY_SECTION_BANDS_PALETTE_V1, JSON.stringify(CHUB_SB_normalizePaletteConfig(next))); } catch {}
  }

  function CHUB_SB_getPaletteConfig(){
    const api = CHUB_SB_paletteApi();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_SB_normalizePaletteConfig(api.getConfig()); } catch {}
    }
    return CHUB_SB_readPaletteStore();
  }

  function CHUB_SB_setPaletteConfig(next){
    const api = CHUB_SB_paletteApi();
    if (api && typeof api.setConfig === 'function') {
      try { return CHUB_SB_normalizePaletteConfig(api.setConfig(next || {})); } catch {}
    }
    const current = CHUB_SB_readPaletteStore();
    const merged = CHUB_SB_normalizePaletteConfig({
      colors: Array.isArray(next?.colors) ? next.colors : current.colors,
      defaultKey: next?.defaultKey ?? current.defaultKey,
      applyStartMode: next?.applyStartMode ?? current.applyStartMode,
      lastUsedKey: next?.lastUsedKey ?? current.lastUsedKey,
    });
    CHUB_SB_writePaletteStore(merged);
    return merged;
  }

  function CHUB_SB_resetPaletteConfig(){
    const api = CHUB_SB_paletteApi();
    if (api && typeof api.resetConfig === 'function') {
      try { return CHUB_SB_normalizePaletteConfig(api.resetConfig()); } catch {}
    }
    const reset = CHUB_SB_normalizePaletteConfig(null);
    CHUB_SB_writePaletteStore(reset);
    return reset;
  }

  function CHUB_SB_defaultColorOpts(){
    const cfg = CHUB_SB_getPaletteConfig();
    return cfg.colors.map((color, idx) => [
      color.key,
      `Color ${idx + 1} (${String(color.hex || '').toUpperCase()})`,
    ]);
  }

  function CHUB_SB_applyStartOpts(){
    return CHUB_SB_APPLY_START_MODES.slice();
  }

  function CHUB_SB_popupMouseOpts(){
    return [
      ['left_click','Left click'],
      ['middle_click','Middle click'],
      ['right_click','Right click'],
      ['left_double','Double-left'],
      ['middle_double','Double-middle'],
      ['right_double','Double-right'],
      ['none','None'],
    ];
  }

  function CHUB_SB_applyKeyOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['meta_1','Cmd+1'],
      ['meta_h','Cmd+H'],
      ['ctrl_1','Ctrl+1'],
      ['ctrl_h','Ctrl+H'],
      ['meta_or_ctrl_1','Cmd/Ctrl+1'],
      ['meta_or_ctrl_h','Cmd/Ctrl+H'],
      ['none','None'],
    ];
  }

  function CHUB_SB_clearKeyOpts(){
    return [
      ['meta_z','Cmd+Z'],
      ['ctrl_z','Ctrl+Z'],
      ['meta_or_ctrl_z','Cmd/Ctrl+Z'],
      ['escape','Escape'],
      ['none','None'],
    ];
  }

  function CHUB_SB_repeatOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['enter_backspace','Enter / Backspace'],
      ['arrow_lr','Arrow Left / Right'],
      ['arrow_ud','Arrow Up / Down'],
      ['none','None'],
    ];
  }

  function CHUB_SB_modeOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['arrow_lr','Arrow Left / Right'],
      ['arrow_ud','Arrow Up / Down'],
      ['meta_x','Cmd+X'],
      ['ctrl_x','Ctrl+X'],
      ['meta_or_ctrl_x','Cmd/Ctrl+X'],
      ['meta_v','Cmd+V'],
      ['ctrl_v','Ctrl+V'],
      ['meta_or_ctrl_v','Cmd/Ctrl+V'],
      ['none','None'],
    ];
  }

  function CHUB_SB_patternPickOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['meta_x','Cmd+X'],
      ['ctrl_x','Ctrl+X'],
      ['meta_or_ctrl_x','Cmd/Ctrl+X'],
      ['meta_v','Cmd+V'],
      ['ctrl_v','Ctrl+V'],
      ['meta_or_ctrl_v','Cmd/Ctrl+V'],
      ['escape','Escape'],
      ['none','None'],
    ];
  }

  function CHUB_SB_patternRotateOpts(){
    return [
      ['space','Space'],
      ['enter','Enter'],
      ['enter_backspace','Enter / Backspace'],
      ['arrow_lr','Arrow Left / Right'],
      ['arrow_ud','Arrow Up / Down'],
      ['meta_x','Cmd+X'],
      ['ctrl_x','Ctrl+X'],
      ['meta_or_ctrl_x','Cmd/Ctrl+X'],
      ['escape','Escape'],
      ['none','None'],
    ];
  }

  function CHUB_SB_refreshSectionBandControls(panel){
    if (!panel || STATE_CH.curKey !== FEATURE_KEY_SECTION_BANDS) return;
    ENGINE_renderControls(panel);
  }

  function CHUB_SB_movePaletteColor(colors, fromIdx, toIdx){
    const list = Array.isArray(colors) ? colors.slice() : [];
    if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length || fromIdx === toIdx) return list;
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    return list.map((color, idx) => ({
      key: CHUB_SB_PALETTE_DEFAULTS[idx]?.key || color?.key || `color_${idx + 1}`,
      label: `Color ${idx + 1}`,
      hex: CHUB_SB_normalizeHexColor(color?.hex, CHUB_SB_PALETTE_DEFAULTS[idx]?.hex || '#888888'),
    }));
  }

  function CHUB_SB_renderPaletteEditor({ panel }){
    const cfg = CHUB_SB_getPaletteConfig();
    const root = D.createElement('div');
    root.className = `${CLS}-sbPaletteEditor`;

    const tip = D.createElement('div');
    tip.className = `${CLS}-ctrlHint ${CLS}-sbPaletteHint`;
    tip.textContent = 'Edit the 5 loop colors here. Existing section bands update when you apply.';
    root.appendChild(tip);

    let draftColors = cfg.colors.map((color, idx) => ({
      key: CHUB_SB_PALETTE_DEFAULTS[idx]?.key || color?.key || `color_${idx + 1}`,
      label: `Color ${idx + 1}`,
      hex: CHUB_SB_normalizeHexColor(color?.hex, CHUB_SB_PALETTE_DEFAULTS[idx]?.hex || '#888888'),
    }));

    const list = D.createElement('div');
    list.className = `${CLS}-sbPaletteList`;
    root.appendChild(list);

    const actionRow = D.createElement('div');
    actionRow.className = `${CLS}-sbPaletteActions`;

    const applyBtn = D.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = `${CLS}-actionBtn primary`;
    applyBtn.textContent = 'Apply';

    const resetBtn = D.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = `${CLS}-actionBtn`;
    resetBtn.textContent = 'Reset';

    const status = D.createElement('span');
    status.className = `${CLS}-ctrlActionStatus`;
    status.style.textAlign = 'left';
    status.style.minWidth = '0';
    status.textContent = '';

    const renderRows = () => {
      list.textContent = '';

      draftColors.forEach((color, idx) => {
        const row = D.createElement('div');
        row.className = `${CLS}-sbPaletteRow`;

        const lead = D.createElement('div');
        lead.className = `${CLS}-sbPaletteLead`;

        const index = D.createElement('span');
        index.className = `${CLS}-sbPaletteIndex`;
        index.textContent = String(idx + 1);

        const picker = D.createElement('input');
        picker.type = 'color';
        picker.className = `${CLS}-sbPalettePickerHidden`;
        picker.value = CHUB_SB_normalizeHexColor(color.hex, CHUB_SB_PALETTE_DEFAULTS[idx]?.hex || '#888888');

        const swatch = D.createElement('button');
        swatch.type = 'button';
        swatch.className = `${CLS}-sbPaletteSwatch`;
        swatch.title = `Pick Color ${idx + 1}`;
        swatch.style.background = picker.value;

        const code = D.createElement('input');
        code.type = 'text';
        code.value = String(picker.value || '').toUpperCase();
        code.maxLength = 7;
        code.spellcheck = false;
        code.autocomplete = 'off';
        code.className = `${CLS}-select2 ${CLS}-sbPaletteHex`;

        const pos = D.createElement('select');
        pos.className = `${CLS}-select2 ${CLS}-sbPalettePos`;
        for (let slot = 1; slot <= CHUB_SB_PALETTE_DEFAULTS.length; slot++) {
          const opt = D.createElement('option');
          opt.value = String(slot - 1);
          opt.textContent = String(slot);
          pos.appendChild(opt);
        }
        pos.value = String(idx);

        const tail = D.createElement('div');
        tail.className = `${CLS}-sbPaletteTail`;

        const moveWrap = D.createElement('div');
        moveWrap.className = `${CLS}-sbPaletteMoves`;

        const mkMoveBtn = (txt, title, disabled, onClick) => {
          const btn = D.createElement('button');
          btn.type = 'button';
          btn.className = `${CLS}-sbPaletteMoveBtn`;
          btn.textContent = txt;
          btn.title = title;
          btn.disabled = disabled;
          btn.addEventListener('click', onClick, true);
          return btn;
        };

        const moveLeftBtn = mkMoveBtn('←', 'Move earlier in the loop', idx === 0, () => {
          draftColors = CHUB_SB_movePaletteColor(draftColors, idx, idx - 1);
          renderRows();
        });
        const moveRightBtn = mkMoveBtn('→', 'Move later in the loop', idx === (draftColors.length - 1), () => {
          draftColors = CHUB_SB_movePaletteColor(draftColors, idx, idx + 1);
          renderRows();
        });

        swatch.addEventListener('click', (evt) => {
          evt.preventDefault();
          picker.click();
        }, true);

        picker.addEventListener('input', () => {
          const nextHex = CHUB_SB_normalizeHexColor(picker.value, draftColors[idx]?.hex || picker.value);
          draftColors[idx] = Object.assign({}, draftColors[idx], { hex: nextHex });
          swatch.style.background = nextHex;
          code.value = String(nextHex || '').toUpperCase();
        }, true);

        code.addEventListener('input', () => {
          const normalized = CHUB_SB_normalizeHexColor(code.value, null);
          if (!normalized) return;
          draftColors[idx] = Object.assign({}, draftColors[idx], { hex: normalized });
          picker.value = normalized;
          swatch.style.background = normalized;
        }, true);

        code.addEventListener('blur', () => {
          const normalized = CHUB_SB_normalizeHexColor(code.value, draftColors[idx]?.hex || picker.value);
          draftColors[idx] = Object.assign({}, draftColors[idx], { hex: normalized });
          picker.value = normalized;
          swatch.style.background = normalized;
          code.value = String(normalized || '').toUpperCase();
        }, true);

        pos.addEventListener('change', () => {
          draftColors = CHUB_SB_movePaletteColor(draftColors, idx, parseInt(pos.value, 10));
          renderRows();
        }, true);

        lead.append(index, swatch, picker);
        moveWrap.append(moveLeftBtn, moveRightBtn);
        tail.append(pos, moveWrap);
        row.append(lead, code, tail);
        list.appendChild(row);
      });
    };

    applyBtn.addEventListener('click', () => {
      const colors = draftColors.map((color, idx) => ({
        key: CHUB_SB_PALETTE_DEFAULTS[idx]?.key || color?.key || `color_${idx + 1}`,
        label: `Color ${idx + 1}`,
        hex: CHUB_SB_normalizeHexColor(color?.hex, CHUB_SB_PALETTE_DEFAULTS[idx]?.hex || '#888888'),
      }));
      CHUB_SB_setPaletteConfig({ colors });
      status.textContent = 'Palette updated.';
      CHUB_SB_refreshSectionBandControls(panel);
    }, true);

    resetBtn.addEventListener('click', () => {
      CHUB_SB_resetPaletteConfig();
      status.textContent = 'Palette reset.';
      CHUB_SB_refreshSectionBandControls(panel);
    }, true);

    renderRows();
    actionRow.append(applyBtn, resetBtn, status);
    root.appendChild(actionRow);
    return root;
  }

  const KEY_INLINE_HL_CFG_UI_V1 = 'h2o:prm:cgx:nlnhghlghtr:cfg:ui:v1';
  const CHUB_HL_PALETTE_DEFAULTS = Object.freeze([
    Object.freeze({ title: 'blue',   label: 'Blue',   group: 'primary',   pair: 'sky',    color: '#3B82F6' }),
    Object.freeze({ title: 'red',    label: 'Red',    group: 'primary',   pair: 'pink',   color: '#FF4C4C' }),
    Object.freeze({ title: 'green',  label: 'Green',  group: 'primary',   pair: 'purple', color: '#22C55E' }),
    Object.freeze({ title: 'gold',   label: 'Gold',   group: 'primary',   pair: 'orange', color: '#FFD54F' }),
    Object.freeze({ title: 'sky',    label: 'Sky',    group: 'secondary', pair: 'blue',   color: '#7DD3FC' }),
    Object.freeze({ title: 'pink',   label: 'Pink',   group: 'secondary', pair: 'red',    color: '#F472B6' }),
    Object.freeze({ title: 'purple', label: 'Purple', group: 'secondary', pair: 'green',  color: '#A855F7' }),
    Object.freeze({ title: 'orange', label: 'Orange', group: 'secondary', pair: 'gold',   color: '#FF914D' }),
  ]);
  const CHUB_HL_DEFAULTS = Object.freeze({
    applyShortcut: 'meta_or_ctrl_1',
    clearShortcut: 'meta_or_ctrl_z',
    popupTrigger: 'middle_click',
    shortcutColorMode: 'current_color',
    defaultColor: 'gold',
  });
  const CHUB_HL_APPLY_SHORTCUTS = Object.freeze(['meta_or_ctrl_1', 'meta_1', 'ctrl_1', 'meta_or_ctrl_shift_1', 'none']);
  const CHUB_HL_CLEAR_SHORTCUTS = Object.freeze(['meta_or_ctrl_z', 'meta_z', 'ctrl_z', 'escape', 'backspace', 'delete', 'none']);
  const CHUB_HL_POPUP_TRIGGERS = Object.freeze(['hover', 'click', 'middle_click', 'right_click', 'none']);
  const CHUB_HL_START_MODES = Object.freeze(['default_color', 'first_primary', 'current_color', 'next_primary', 'paired_secondary', 'random']);

  function CHUB_HL_api() {
    return W.H2O?.HE?.nlnhghlghtr?.api || W.H2OInline || null;
  }

  function CHUB_HL_normalizeHexColor(raw, fallback = null) {
    const base = String(raw || '').trim().replace(/^#/, '');
    const expanded = /^[\da-f]{3}$/i.test(base)
      ? base.split('').map((ch) => ch + ch).join('')
      : base;
    if (!/^[\da-f]{6}$/i.test(expanded)) return fallback;
    return `#${expanded.toLowerCase()}`;
  }

  function CHUB_HL_findPaletteEntry(rawPalette, title, idx) {
    if (!Array.isArray(rawPalette)) return null;
    const byTitle = rawPalette.find((entry) => String(entry?.title || entry?.key || '').trim().toLowerCase() === title);
    if (byTitle) return byTitle;
    return rawPalette[idx] || null;
  }

  function CHUB_HL_normalizeConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const palette = CHUB_HL_PALETTE_DEFAULTS.map((fallback, idx) => {
      const incoming = CHUB_HL_findPaletteEntry(src.palette, fallback.title, idx);
      return {
        title: fallback.title,
        label: fallback.label,
        group: fallback.group,
        pair: fallback.pair,
        color: CHUB_HL_normalizeHexColor(incoming?.color || incoming?.hex, fallback.color),
      };
    });
    const names = palette.map((entry) => entry.title);
    return {
      applyShortcut: CHUB_HL_APPLY_SHORTCUTS.includes(src.applyShortcut) ? src.applyShortcut : CHUB_HL_DEFAULTS.applyShortcut,
      clearShortcut: CHUB_HL_CLEAR_SHORTCUTS.includes(src.clearShortcut) ? src.clearShortcut : CHUB_HL_DEFAULTS.clearShortcut,
      popupTrigger: CHUB_HL_POPUP_TRIGGERS.includes(src.popupTrigger) ? src.popupTrigger : CHUB_HL_DEFAULTS.popupTrigger,
      shortcutColorMode: CHUB_HL_START_MODES.includes(src.shortcutColorMode) ? src.shortcutColorMode : CHUB_HL_DEFAULTS.shortcutColorMode,
      defaultColor: names.includes(String(src.defaultColor || '').trim().toLowerCase()) ? String(src.defaultColor).trim().toLowerCase() : CHUB_HL_DEFAULTS.defaultColor,
      palette,
    };
  }

  function CHUB_HL_readStore() {
    try {
      return CHUB_HL_normalizeConfig(JSON.parse(localStorage.getItem(KEY_INLINE_HL_CFG_UI_V1) || '{}') || {});
    } catch {
      return CHUB_HL_normalizeConfig(null);
    }
  }

  function CHUB_HL_writeStore(next) {
    try { localStorage.setItem(KEY_INLINE_HL_CFG_UI_V1, JSON.stringify(CHUB_HL_normalizeConfig(next))); } catch {}
  }

  function CHUB_HL_getConfig() {
    const api = CHUB_HL_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_HL_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_HL_readStore();
  }

  function CHUB_HL_applySetting(key, value) {
    const api = CHUB_HL_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_HL_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_HL_normalizeConfig({ ...CHUB_HL_readStore(), [key]: value });
    CHUB_HL_writeStore(merged);
    return merged;
  }

  function CHUB_HL_getPaletteConfig() {
    const api = CHUB_HL_api();
    const paletteApi = api?.paletteConfig || null;
    if (paletteApi && typeof paletteApi.getConfig === 'function') {
      try {
        const current = CHUB_HL_getConfig();
        return CHUB_HL_normalizeConfig({ ...current, ...paletteApi.getConfig() });
      } catch {}
    }
    return CHUB_HL_readStore();
  }

  function CHUB_HL_setPaletteConfig(next) {
    const api = CHUB_HL_api();
    const paletteApi = api?.paletteConfig || null;
    if (paletteApi && typeof paletteApi.setConfig === 'function') {
      try {
        const current = CHUB_HL_getConfig();
        return CHUB_HL_normalizeConfig({ ...current, ...paletteApi.setConfig(next || {}) });
      } catch {}
    }
    const current = CHUB_HL_readStore();
    const merged = CHUB_HL_normalizeConfig({
      ...current,
      defaultColor: next?.defaultColor ?? current.defaultColor,
      palette: Array.isArray(next?.palette) ? next.palette : current.palette,
    });
    CHUB_HL_writeStore(merged);
    return merged;
  }

  function CHUB_HL_resetPaletteConfig() {
    const api = CHUB_HL_api();
    const paletteApi = api?.paletteConfig || null;
    if (paletteApi && typeof paletteApi.resetConfig === 'function') {
      try {
        const current = CHUB_HL_getConfig();
        return CHUB_HL_normalizeConfig({ ...current, ...paletteApi.resetConfig() });
      } catch {}
    }
    const current = CHUB_HL_readStore();
    const reset = CHUB_HL_normalizeConfig({
      ...current,
      palette: CHUB_HL_PALETTE_DEFAULTS.map((entry) => ({ title: entry.title, color: entry.color })),
      defaultColor: CHUB_HL_DEFAULTS.defaultColor,
    });
    CHUB_HL_writeStore(reset);
    return reset;
  }

  function CHUB_HL_applyKeyOpts() {
    return [
      ['meta_or_ctrl_1', 'Cmd/Ctrl+1'],
      ['meta_1', 'Cmd+1'],
      ['ctrl_1', 'Ctrl+1'],
      ['meta_or_ctrl_shift_1', 'Cmd/Ctrl+Shift+1'],
      ['none', 'None'],
    ];
  }

  function CHUB_HL_clearKeyOpts() {
    return [
      ['meta_or_ctrl_z', 'Cmd/Ctrl+Z'],
      ['meta_z', 'Cmd+Z'],
      ['ctrl_z', 'Ctrl+Z'],
      ['escape', 'Escape'],
      ['backspace', 'Backspace'],
      ['delete', 'Delete'],
      ['none', 'None'],
    ];
  }

  function CHUB_HL_popupTriggerOpts() {
    return [
      ['hover', 'Hover'],
      ['click', 'Mouse click'],
      ['middle_click', 'Middle click'],
      ['right_click', 'Right click'],
      ['none', 'None'],
    ];
  }

  function CHUB_HL_startColorOpts() {
    return [
      ['default_color', 'Default Color'],
      ['first_primary', 'First Primary Color'],
      ['current_color', 'Last Used Color'],
      ['next_primary', 'Next Primary After Last Used'],
      ['paired_secondary', 'Matching Secondary To Last Used'],
      ['random', 'Random Color'],
    ];
  }

  function CHUB_HL_defaultColorOpts() {
    return CHUB_HL_getPaletteConfig().palette.map((entry) => [
      entry.title,
      `${entry.label} (${String(entry.color || '').toUpperCase()})`,
    ]);
  }

  function CHUB_HL_clearCurrentChat() {
    const api = CHUB_HL_api();
    if (api && typeof api.clearCurrentChat === 'function') {
      return Promise.resolve(api.clearCurrentChat());
    }
    return Promise.resolve({ message: 'Highlighter module unavailable.' });
  }

  function CHUB_HL_renderPaletteEditor() {
    const cfg = CHUB_HL_getPaletteConfig();
    const root = D.createElement('div');
    root.className = `${CLS}-sbPaletteEditor ${CLS}-hlPaletteEditor`;

    const tip = D.createElement('div');
    tip.className = `${CLS}-ctrlHint ${CLS}-sbPaletteHint`;
    tip.textContent = 'Primary colors are the main loop. Secondary colors are the paired alternates. Set each color with the picker or by typing a hex code.';
    root.appendChild(tip);

    const list = D.createElement('div');
    list.className = `${CLS}-sbPaletteList`;
    root.appendChild(list);

    const actionRow = D.createElement('div');
    actionRow.className = `${CLS}-sbPaletteActions`;

    const applyBtn = D.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = `${CLS}-actionBtn primary`;
    applyBtn.textContent = 'Apply';

    const resetBtn = D.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = `${CLS}-actionBtn`;
    resetBtn.textContent = 'Reset';

    const status = D.createElement('span');
    status.className = `${CLS}-ctrlActionStatus`;
    status.style.textAlign = 'left';
    status.style.minWidth = '0';

    let draft = cfg.palette.map((entry) => ({
      title: entry.title,
      label: entry.label,
      group: entry.group,
      pair: entry.pair,
      color: CHUB_HL_normalizeHexColor(entry.color, '#888888'),
    }));

    const renderRows = () => {
      list.textContent = '';
      [['primary', 'Primary Colors'], ['secondary', 'Secondary Colors']].forEach(([groupKey, groupLabel]) => {
        const title = D.createElement('div');
        title.className = `${CLS}-hlPaletteGroupTitle`;
        title.textContent = groupLabel;
        list.appendChild(title);

        draft.filter((entry) => entry.group === groupKey).forEach((entry) => {
          const row = D.createElement('div');
          row.className = `${CLS}-sbPaletteRow`;

          const lead = D.createElement('div');
          lead.className = `${CLS}-sbPaletteLead`;

          const picker = D.createElement('input');
          picker.type = 'color';
          picker.className = `${CLS}-hlPalettePicker`;
          picker.value = entry.color;
          picker.title = `Pick ${entry.label}`;

          const label = D.createElement('span');
          label.className = `${CLS}-hlPaletteLabel`;
          label.textContent = entry.label;

          const code = D.createElement('input');
          code.type = 'text';
          code.value = String(entry.color || '').toUpperCase();
          code.maxLength = 7;
          code.spellcheck = false;
          code.autocomplete = 'off';
          code.className = `${CLS}-select2 ${CLS}-sbPaletteHex`;

          const setColor = (raw, fallback) => {
            const nextHex = CHUB_HL_normalizeHexColor(raw, fallback);
            entry.color = nextHex;
            picker.value = nextHex;
            code.value = String(nextHex || '').toUpperCase();
          };

          picker.addEventListener('input', () => setColor(picker.value, entry.color), true);
          code.addEventListener('input', () => {
            const normalized = CHUB_HL_normalizeHexColor(code.value, null);
            if (normalized) setColor(normalized, entry.color);
          }, true);
          code.addEventListener('blur', () => setColor(code.value, entry.color), true);

          lead.append(picker, label);
          row.append(lead, code);
          list.appendChild(row);
        });
      });
    };

    applyBtn.addEventListener('click', () => {
      draft = CHUB_HL_setPaletteConfig({ palette: draft }).palette.map((entry) => ({
        title: entry.title,
        label: entry.label,
        group: entry.group,
        pair: entry.pair,
        color: entry.color,
      }));
      renderRows();
      status.textContent = 'Palette updated.';
    }, true);

    resetBtn.addEventListener('click', () => {
      draft = CHUB_HL_resetPaletteConfig().palette.map((entry) => ({
        title: entry.title,
        label: entry.label,
        group: entry.group,
        pair: entry.pair,
        color: entry.color,
      }));
      renderRows();
      status.textContent = 'Palette reset.';
    }, true);

    renderRows();
    actionRow.append(applyBtn, resetBtn, status);
    root.appendChild(actionRow);
    return root;
  }

  function CHUB_NOTES_dockApi() {
    return CHUB_DOCK_api();
  }

  function CHUB_NOTES_notesApi() {
    return W.H2ONotes || W.HoNotes || null;
  }

  function CHUB_NOTES_emitChanged() {
    try { W.dispatchEvent(new Event('h2o:notes:changed')); } catch {}
    try { W.dispatchEvent(new Event('h2o-notes:changed')); } catch {}
  }

  function CHUB_NOTES_openPanel(reason = 'control-hub:notes:open') {
    const api = CHUB_NOTES_dockApi();
    if (!api) return { message: 'Dock Panel is unavailable.' };

    SAFE_call(`notes.open:${reason}`, () => {
      api.ensurePanel?.();
      api.open?.();
      api.setView?.('notes');
      api.requestRender?.();
    });
    return { message: 'Notes tab opened.' };
  }

  function CHUB_NOTES_refreshPanel(reason = 'control-hub:notes:refresh') {
    const api = CHUB_NOTES_dockApi();
    if (!api) return { message: 'Dock Panel is unavailable.' };

    SAFE_call(`notes.refresh:${reason}`, () => {
      api.setView?.('notes');
      api.requestRender?.();
    });
    return { message: 'Notes refreshed.' };
  }

  function CHUB_NOTES_clearScratch() {
    const api = CHUB_NOTES_notesApi();
    if (!api?.scratchSet) return { message: 'Notes Engine is unavailable.' };

    SAFE_call('notes.clearScratch', () => api.scratchSet(''));
    CHUB_NOTES_emitChanged();
    CHUB_NOTES_refreshPanel('control-hub:notes:clear-scratch');
    return { message: 'Scratchpad cleared.' };
  }

  function CHUB_invalidateSoon() {
    try { W.setTimeout(() => CORE_CH_invalidate(), 0); } catch {}
  }

  function CHUB_renderInfoList(items) {
    const rows = Array.isArray(items) ? items.filter((item) => item && item.value != null && String(item.value).trim() !== '') : [];
    const root = D.createElement('div');
    root.className = `${CLS}-infoList`;
    if (!rows.length) return root;

    for (const item of rows) {
      const row = D.createElement('div');
      row.className = `${CLS}-infoLine`;

      const key = D.createElement('span');
      key.className = `${CLS}-infoKey`;
      key.textContent = item.label || 'Info';

      const value = D.createElement('span');
      value.className = `${CLS}-infoVal`;
      value.textContent = String(item.value || '');

      row.append(key, value);
      root.appendChild(row);
    }
    return root;
  }

  const CHUB_THEME_SETTINGS_KEY_V2 = 'h2o:prm:cgx:thmspnl:ui:settings:v2';
  const CHUB_THEME_SETTINGS_KEY_LEGACY = 'ho:gpthemeSettings';
  const CHUB_THEME_SETTINGS_EVENT = 'evt:h2o:themes:settings_changed';
  const CHUB_VIS_STYLE_ID = `cgxui-${SkID}-tab-visibility-style`;
  const CHUB_VIS_CLASS_PREFIX = `cgxui-${SkID}-hide-`;
  const CHUB_THEME_DEFAULTS = Object.freeze({
    enabled: true,
    mode: 'dark',
    accentLight: '270, 80%, 75%',
    accentDark: '265, 70%, 62%',
    accentUserBubble: false,
    fontFamily: 'system',
    fontSize: 16,
    lineHeight: 28,
    letterSpace: 0,
    chatWidth: 48,
    promptWidth: 48,
    chatFullWidth: false,
    syncPromptWidth: true,
    hideHeader: false,
    hideFooter: false,
    expandChatbox: false,
    bubblesUser: true,
    bubblesGpt: true,
    scrollAlign: 'right',
  });


  const KEY_ANSN_CFG_UI_V1 = 'h2o:prm:cgx:ansn:cfg:ui:v1';
  const KEY_ATS_CFG_UI_V1 = 'h2o:prm:cgx:answrts:cfg:ui:v1';
  const KEY_AT_CFG_UI_V1 = 'h2o:prm:cgx:tnswrttl:cfg:ui:v1';

  function CHUB_ANSN_api() {
    return W.H2O?.AnsNums?.api || null;
  }

  function CHUB_ANSN_normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const clamp = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    const legacyFadeStrength = clamp(src.rightFadeStrength, 0.0, 1.0, 0.65);
    const legacyFadeStartPct = 68 - (50 * legacyFadeStrength);
    const legacyFadeEndOpacity = clamp(src.rightFadeEndOpacity, 0.0, 1.0, 0.0);
    return {
      normalOpacity: clamp(src.normalOpacity, 0.02, 0.35, 0.12),
      normalLeftPx: clamp(src.normalLeftPx, -260, -20, -140),
      normalScale: clamp(src.normalScale, 0.55, 1.35, 1.0),
      normalRightFadeStartPct: clamp(src.normalRightFadeStartPct, 20, 100, legacyFadeStartPct),
      normalRightFadeEndOpacity: clamp(src.normalRightFadeEndOpacity, 0.0, 1.0, legacyFadeEndOpacity),
      collapsedOpacity: clamp(src.collapsedOpacity, 0.02, 0.35, 0.09),
      collapsedScale: clamp(src.collapsedScale, 0.2, 1.1, 0.42),
      collapsedLeftPx: clamp(src.collapsedLeftPx, -260, -20, -132),
      collapsedRightFadeStartPct: clamp(src.collapsedRightFadeStartPct, 20, 100, legacyFadeStartPct),
      collapsedRightFadeEndOpacity: clamp(src.collapsedRightFadeEndOpacity, 0.0, 1.0, legacyFadeEndOpacity),
    };
  }

  function CHUB_ANSN_readStore() {
    try { return CHUB_ANSN_normalizeConfig(JSON.parse(localStorage.getItem(KEY_ANSN_CFG_UI_V1) || '{}') || {}); } catch { return CHUB_ANSN_normalizeConfig(null); }
  }

  function CHUB_ANSN_writeStore(next) {
    const cfg = CHUB_ANSN_normalizeConfig(next);
    try { localStorage.setItem(KEY_ANSN_CFG_UI_V1, JSON.stringify(cfg)); } catch {}
    return cfg;
  }

  function CHUB_ANSN_getConfig() {
    const api = CHUB_ANSN_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_ANSN_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_ANSN_readStore();
  }

  function CHUB_ANSN_applySetting(key, value) {
    const api = CHUB_ANSN_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_ANSN_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_ANSN_normalizeConfig({ ...CHUB_ANSN_readStore(), [key]: value });
    CHUB_ANSN_writeStore(merged);
    return merged;
  }

  function CHUB_ANSN_rescan() {
    return SAFE_call('answerNumbers.rescan', () => CHUB_ANSN_api()?.rescan?.());
  }

  const KEY_QN_CFG_UI_V1 = 'h2o:prm:cgx:qbig:cfg:ui:v1';

  function CHUB_QN_api() {
    return W.H2O?.QN?.qbigindex?.api || null;
  }

  function CHUB_QN_normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const clamp = (v, min, max, fallback) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    return {
      opacity: clamp(src.opacity, 0.02, 0.35, 0.12),
      leftOffsetPx: clamp(src.leftOffsetPx, 0, 120, 14),
      scale: clamp(src.scale, 0.35, 1.35, 0.75),
      rightFadeStartPct: clamp(src.rightFadeStartPct, 20, 100, 60),
      rightFadeEndOpacity: clamp(src.rightFadeEndOpacity, 0.0, 1.0, 0.18),
    };
  }

  function CHUB_QN_readStore() {
    try { return CHUB_QN_normalizeConfig(JSON.parse(localStorage.getItem(KEY_QN_CFG_UI_V1) || '{}') || {}); } catch { return CHUB_QN_normalizeConfig(null); }
  }

  function CHUB_QN_writeStore(next) {
    const cfg = CHUB_QN_normalizeConfig(next);
    try { localStorage.setItem(KEY_QN_CFG_UI_V1, JSON.stringify(cfg)); } catch {}
    return cfg;
  }

  function CHUB_QN_getConfig() {
    const api = CHUB_QN_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_QN_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_QN_readStore();
  }

  function CHUB_QN_applySetting(key, value) {
    const api = CHUB_QN_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_QN_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_QN_normalizeConfig({ ...CHUB_QN_readStore(), [key]: value });
    CHUB_QN_writeStore(merged);
    return merged;
  }

  function CHUB_QN_rescan() {
    return SAFE_call('questionNumbers.rescan', () => CHUB_QN_api()?.rescan?.());
  }

  function CHUB_ATS_api() {
    return W.H2O?.AT?.answrts?.api || null;
  }

  function CHUB_ATS_normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const mode = String(src.collapsedHoverMode || 'under').trim().toLowerCase();
    return {
      collapsedHoverMode: ['under', 'tooltip', 'title-right'].includes(mode) ? mode : 'under',
    };
  }

  function CHUB_ATS_readStore() {
    try { return CHUB_ATS_normalizeConfig(JSON.parse(localStorage.getItem(KEY_ATS_CFG_UI_V1) || '{}') || {}); } catch { return CHUB_ATS_normalizeConfig(null); }
  }

  function CHUB_ATS_writeStore(next) {
    const cfg = CHUB_ATS_normalizeConfig(next);
    try { localStorage.setItem(KEY_ATS_CFG_UI_V1, JSON.stringify(cfg)); } catch {}
    return cfg;
  }

  function CHUB_ATS_getConfig() {
    const api = CHUB_ATS_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_ATS_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_ATS_readStore();
  }

  function CHUB_ATS_applySetting(key, value) {
    const api = CHUB_ATS_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_ATS_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_ATS_normalizeConfig({ ...CHUB_ATS_readStore(), [key]: value });
    CHUB_ATS_writeStore(merged);
    return merged;
  }

  function CHUB_ATS_hoverModeOpts() {
    return [
      ['under', 'Under Title Bar'],
      ['tooltip', 'Hover Info Box'],
      ['title-right', 'Right Side Of Title Bar'],
    ];
  }

  function CHUB_AT_api() {
    return W.H2O?.AT?.tnswrttl?.api || null;
  }

  function CHUB_AT_normalizeConfig(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const mode = String(src.collapsedTextMode || 'adaptive').trim().toLowerCase();
    return {
      collapsedTextMode: ['adaptive', 'consistent'].includes(mode) ? mode : 'adaptive',
    };
  }

  function CHUB_AT_readStore() {
    try { return CHUB_AT_normalizeConfig(JSON.parse(localStorage.getItem(KEY_AT_CFG_UI_V1) || '{}') || {}); } catch { return CHUB_AT_normalizeConfig(null); }
  }

  function CHUB_AT_writeStore(next) {
    const cfg = CHUB_AT_normalizeConfig(next);
    try { localStorage.setItem(KEY_AT_CFG_UI_V1, JSON.stringify(cfg)); } catch {}
    return cfg;
  }

  function CHUB_AT_getConfig() {
    const api = CHUB_AT_api();
    if (api && typeof api.getConfig === 'function') {
      try { return CHUB_AT_normalizeConfig(api.getConfig()); } catch {}
    }
    return CHUB_AT_readStore();
  }

  function CHUB_AT_applySetting(key, value) {
    const api = CHUB_AT_api();
    if (api && typeof api.applySetting === 'function') {
      try { return CHUB_AT_normalizeConfig(api.applySetting(key, value)); } catch {}
    }
    const merged = CHUB_AT_normalizeConfig({ ...CHUB_AT_readStore(), [key]: value });
    CHUB_AT_writeStore(merged);
    return merged;
  }

  function CHUB_AT_collapsedTextModeOpts() {
    return [
      ['adaptive', 'Adaptive (Flip Black/White)'],
      ['consistent', 'Consistent (Same Color)'],
    ];
  }

  function CHUB_DOCK_api() {
    return W.H2O?.DP?.dckpnl?.api || null;
  }

  function CHUB_EDGE_dataNs() {
    return String(W.H2O?.data?.ready?.ns?.NS_DISK || 'h2o:prm:cgx:h2odata');
  }

  function CHUB_EDGE_normalizePlacement(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'sidebar-edge' || value === 'sidebar' || value === 'left') return 'sidebar-edge';
    return 'page-right';
  }

  function CHUB_EDGE_getStored(key) {
    return CHUB_EDGE_normalizePlacement(UTIL_storage.getStr(key, 'page-right'));
  }

  function CHUB_EDGE_setStored(key, value) {
    const next = CHUB_EDGE_normalizePlacement(value);
    try { UTIL_storage.setStr(key, next); } catch {}
    return next;
  }

  function CHUB_CB_tabPlacementKey() {
    return `${CHUB_EDGE_dataNs()}:commandbar:tab-placement:v1`;
  }

  function CHUB_SAP_tabPlacementKey() {
    return `${CHUB_EDGE_dataNs()}:side-actions-panel:tab-placement:v1`;
  }

  function CHUB_CB_api() {
    return W.H2O?.commandBar || null;
  }

  function CHUB_SAP_api() {
    return W.H2O?.sideActionsPanel || null;
  }

  function CHUB_CB_getTabPlacement() {
    const api = CHUB_CB_api();
    if (api?.getTabPlacement) {
      try { return CHUB_EDGE_normalizePlacement(api.getTabPlacement()); } catch {}
    }
    return CHUB_EDGE_getStored(CHUB_CB_tabPlacementKey());
  }

  function CHUB_CB_setTabPlacement(value) {
    const next = CHUB_EDGE_normalizePlacement(value);
    const api = CHUB_CB_api();
    if (api?.setTabPlacement) {
      try { api.setTabPlacement(next); } catch {}
    }
    return CHUB_EDGE_setStored(CHUB_CB_tabPlacementKey(), next);
  }

  function CHUB_SAP_getTabPlacement() {
    const api = CHUB_SAP_api();
    if (api?.getTabPlacement) {
      try { return CHUB_EDGE_normalizePlacement(api.getTabPlacement()); } catch {}
    }
    return CHUB_EDGE_getStored(CHUB_SAP_tabPlacementKey());
  }

  function CHUB_SAP_setTabPlacement(value) {
    const next = CHUB_EDGE_normalizePlacement(value);
    const api = CHUB_SAP_api();
    if (api?.setTabPlacement) {
      try { api.setTabPlacement(next); } catch {}
    }
    return CHUB_EDGE_setStored(CHUB_SAP_tabPlacementKey(), next);
  }

  function CHUB_EDGE_tabPlacementOpts() {
    return [
      ['page-right', 'Right Edge of Page'],
      ['sidebar-edge', 'Right Edge of Sidebar'],
    ];
  }

  function CHUB_SYNC_api() {
    return W.H2O?.sync || W.H2O?.data?.sync || null;
  }

  function CHUB_ACCOUNT_getStatus() {
    return SAFE_call('account.getStatus', () => CHUB_SYNC_api()?.getStatus?.()) || null;
  }

  function CHUB_ACCOUNT_getLiveCfg() {
    return SAFE_call('account.getLiveCfg', () => CHUB_SYNC_api()?.live?.getCfg?.()) || null;
  }

  function CHUB_ACCOUNT_setLiveCfg(patch) {
    const api = CHUB_SYNC_api();
    if (!api?.live?.setCfg) return null;
    const current = CHUB_ACCOUNT_getLiveCfg() || {};
    const next = { ...current, ...(patch || {}) };
    SAFE_call('account.setLiveCfg', () => api.live.setCfg(next));
    CHUB_invalidateSoon();
    return next;
  }

  function CHUB_ACCOUNT_setLiveEnabled(on) {
    return CHUB_ACCOUNT_setLiveCfg({ enabled: !!on });
  }

  function CHUB_ACCOUNT_linkAction() {
    const api = CHUB_SYNC_api();
    if (!api?.webdav?.setCreds) return { message: 'Sync account tools are unavailable.' };

    const status = CHUB_ACCOUNT_getStatus();
    const webdav = status?.webdav || {};
    const currentUrl = String(webdav.url || '');
    const currentRoot = String(webdav.root || 'H2O');
    const currentUser = String(webdav.username || '');

    const url = prompt('Cloud URL / WebDAV server', currentUrl);
    if (url == null) return { message: 'Cancelled.' };
    const root = prompt('Root folder', currentRoot || 'H2O');
    if (root == null) return { message: 'Cancelled.' };
    const username = prompt('Username / account email', currentUser);
    if (username == null) return { message: 'Cancelled.' };

    const passwordHelp = webdav.hasPassword
      ? 'Password / app password\n\nLeave blank to keep the current password.'
      : 'Password / app password';
    const password = prompt(passwordHelp, '');
    if (password == null) return { message: 'Cancelled.' };

    const rememberPassword = confirm('Remember password on this device?\n\nOK = remember it\nCancel = session only');
    const ok = SAFE_call('account.setCreds', () => api.webdav.setCreds({
      url,
      root,
      username,
      password,
      rememberPassword,
    }));
    if (!ok) return { message: 'Could not save account credentials.' };
    CHUB_invalidateSoon();
    return { ok: true, message: rememberPassword ? 'Account linked and remembered.' : 'Account linked for this session.' };
  }

  async function CHUB_ACCOUNT_testAction() {
    const api = CHUB_SYNC_api();
    if (!api?.webdav?.test) return { message: 'Sync test is unavailable.' };
    const res = await api.webdav.test();
    CHUB_invalidateSoon();
    if (res?.ok) return { ok: true, message: 'Account link verified.' };
    return { message: String(res?.message || res?.error || 'Account test failed.') };
  }

  function CHUB_ACCOUNT_unlinkAction() {
    const api = CHUB_SYNC_api();
    if (!api?.webdav?.clearCreds) return { message: 'Sync account tools are unavailable.' };
    SAFE_call('account.clearCreds', () => api.webdav.clearCreds());
    CHUB_invalidateSoon();
    return { ok: true, message: 'Account unlinked.' };
  }

  function CHUB_PM_api() {
    return MOD_OBJ.state?.pmApi || W.H2O?.PromptManager || null;
  }

  function CHUB_PM_openAction() {
    const ok = SAFE_call('promptManager.open', () => CHUB_PM_api()?.open?.());
    CHUB_invalidateSoon();
    return { message: ok ? 'Prompt Manager opened.' : 'Prompt Manager is unavailable.' };
  }

  function CHUB_PM_closeAction() {
    const ok = SAFE_call('promptManager.close', () => CHUB_PM_api()?.close?.());
    CHUB_invalidateSoon();
    return { message: ok ? 'Prompt Manager closed.' : 'Prompt Manager is unavailable.' };
  }

  function CHUB_PM_focusSearchAction() {
    const ok = SAFE_call('promptManager.focusSearch', () => CHUB_PM_api()?.focusSearch?.());
    CHUB_invalidateSoon();
    return { message: ok ? 'Prompt search focused.' : 'Prompt search is unavailable.' };
  }

  function CHUB_PM_toggleQuickTrayAction() {
    const ok = SAFE_call('promptManager.toggleQuickTray', () => CHUB_PM_api()?.toggleQuickTray?.());
    CHUB_invalidateSoon();
    return { message: ok ? 'Quick tray toggled.' : 'Quick tray is unavailable.' };
  }

  function CHUB_PM_renderStatus() {
    const api = CHUB_PM_api();
    const isOpen = !!SAFE_call('promptManager.isOpen', () => api?.isOpen?.());
    return CHUB_renderInfoList([
      { label: 'Ready', value: api ? 'Yes' : 'No' },
      { label: 'Panel', value: isOpen ? 'Open' : 'Closed' },
    ]);
  }

  function CHUB_WS_api() {
    return W.H2O?.Workspace || null;
  }

  function CHUB_WS_getState() {
    return SAFE_call('workspace.getState', () => CHUB_WS_api()?.getRightState?.()) || { open: false, pane: 'shelf', dockMode: 'overlay' };
  }

  function CHUB_WS_openShelfAction() {
    const ok = SAFE_call('workspace.openShelf', () => CHUB_WS_api()?.openShelf?.());
    CHUB_invalidateSoon();
    return { message: ok ? 'Shelf opened.' : 'Workspace Shelf is unavailable.' };
  }

  function CHUB_WS_openDrawerAction() {
    const ok = SAFE_call('workspace.openDrawer', () => CHUB_WS_api()?.openDrawer?.());
    CHUB_invalidateSoon();
    return { message: ok ? 'Drawer opened.' : 'Workspace Drawer is unavailable.' };
  }

  function CHUB_WS_closeAction() {
    const ok = SAFE_call('workspace.close', () => CHUB_WS_api()?.closeRightShell?.());
    CHUB_invalidateSoon();
    return { message: ok ? 'Workspace closed.' : 'Workspace shell is unavailable.' };
  }

  function CHUB_WS_renderStatus() {
    const state = CHUB_WS_getState();
    return CHUB_renderInfoList([
      { label: 'Open', value: state.open ? 'Yes' : 'No' },
      { label: 'Pane', value: String(state.pane || 'shelf') },
      { label: 'Mode', value: String(state.dockMode || 'overlay') },
    ]);
  }

  function CHUB_STUDIO_api() {
    return W.H2O?.archiveBoot || null;
  }

  function CHUB_STUDIO_legacyApi() {
    return W.H2O?.archive || null;
  }

  function CHUB_STUDIO_chatId() {
    return String(W.H2O?.util?.getChatId?.() || '');
  }


  async function CHUB_STUDIO_openLatestSnapshot() {
    const api = CHUB_STUDIO_api();
    if (!api?.openWorkbench) return { ok: false, message: 'Studio workbench is unavailable.' };

    const chatId = CHUB_STUDIO_chatId();
    let snapshotId = '';
    if (api?.loadLatestSnapshot && chatId) {
      try {
        const latest = await api.loadLatestSnapshot(chatId);
        snapshotId = String(latest?.snapshotId || '').trim();
      } catch {}
    }

    const route = snapshotId ? `/read/${encodeURIComponent(snapshotId)}` : '/saved';
    SAFE_call('studio.openLatestSnapshot', () => api.openWorkbench(route));
    return {
      ok: true,
      snapshotId,
      message: snapshotId ? 'Latest snapshot opened in Studio.' : 'Studio opened.'
    };
  }

  function CHUB_STUDIO_openWorkbenchAction() {
    const api = CHUB_STUDIO_api();
    if (!api?.openWorkbench) return { message: 'Studio workbench is unavailable.' };
    SAFE_call('studio.openWorkbench', () => api.openWorkbench());
    return { ok: true, message: 'Studio opened.' };
  }

  function CHUB_STUDIO_openSavedChatsAction() {
    const api = CHUB_STUDIO_api();
    if (!api?.openSavedChats) return { message: 'Saved chats are unavailable.' };
    SAFE_call('studio.openSavedChats', () => api.openSavedChats({}));
    return { ok: true, message: 'Saved chats opened.' };
  }

  async function CHUB_STUDIO_openReaderAction() {
    const api = CHUB_STUDIO_api();
    if (!api?.openWorkbench) return { message: 'Studio workbench is unavailable.' };
    return CHUB_STUDIO_openLatestSnapshot();
  }

  async function CHUB_STUDIO_captureAction() {
    const api = CHUB_STUDIO_api();
    if (!api?.captureNow) return { message: 'Capture is unavailable.' };
    const res = await api.captureNow(CHUB_STUDIO_chatId());
    CHUB_invalidateSoon();
    if (res?.ok === false) return { message: String(res?.message || res?.error || 'Capture failed.') };
    return { ok: true, message: res?.deduped ? 'No new changes to capture.' : 'Snapshot captured.' };
  }

  function CHUB_STUDIO_renderStatus() {
    const api = CHUB_STUDIO_api();
    const latest = SAFE_call('studio.getLatest', () => CHUB_STUDIO_legacyApi()?.getLatest?.()) || null;
    return CHUB_renderInfoList([
      { label: 'Ready', value: api ? 'Yes' : 'No' },
      { label: 'Workbench', value: api?.isExtensionBacked?.() ? 'Extension-backed' : 'Local / fallback' },
      { label: 'Latest Snapshot', value: latest?.capturedAt ? new Date(latest.capturedAt).toLocaleString('en-US') : 'None yet' },
    ]);
  }

  const CHUB_FOLDERS_SEL_ROOT = '[data-cgxui="flsc-root"][data-cgxui-owner="flsc"]';

  function CHUB_FOLDERS_root() {
    return D.querySelector(CHUB_FOLDERS_SEL_ROOT);
  }

  function CHUB_FOLDERS_headerButton() {
    return CHUB_FOLDERS_root()?.querySelector(':scope > button') || null;
  }

  function CHUB_FOLDERS_findActionByText(text) {
    const root = CHUB_FOLDERS_root();
    if (!root) return null;
    const target = String(text || '').trim().toLowerCase();
    return Array.from(root.querySelectorAll('button, a, div')).find((el) => String(el.textContent || '').trim().toLowerCase() === target) || null;
  }

  function CHUB_FOLDERS_focusAction() {
    const root = CHUB_FOLDERS_root();
    if (!root) return { message: 'Folders section not found.' };
    SAFE_call('folders.focus', () => root.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return { ok: true, message: 'Folders section focused.' };
  }

  function CHUB_FOLDERS_setExpanded(open) {
    const btn = CHUB_FOLDERS_headerButton();
    if (!btn) return { message: 'Folders section not found.' };
    const isOpen = btn.getAttribute('aria-expanded') !== 'false';
    if (isOpen !== !!open) SAFE_call(`folders.setExpanded:${open ? 'open' : 'close'}`, () => btn.click());
    CHUB_invalidateSoon();
    return { ok: true, message: open ? 'Folders expanded.' : 'Folders collapsed.' };
  }

  function CHUB_FOLDERS_newFolderAction() {
    const expand = CHUB_FOLDERS_setExpanded(true);
    if (expand?.ok === false) return expand;
    const btn = CHUB_FOLDERS_findActionByText('New folder');
    if (!btn) return { message: 'New folder control not found.' };
    SAFE_call('folders.newFolder', () => btn.click());
    return { ok: true, message: 'New folder dialog opened.' };
  }

  function CHUB_FOLDERS_renderStatus() {
    const root = CHUB_FOLDERS_root();
    const headerBtn = CHUB_FOLDERS_headerButton();
    const count = root ? root.querySelectorAll('[data-cgxui-state="folder-group"]').length : 0;
    const expanded = headerBtn ? (headerBtn.getAttribute('aria-expanded') !== 'false') : false;
    return CHUB_renderInfoList([
      { label: 'Visible', value: root ? 'Yes' : 'No' },
      { label: 'Expanded', value: root ? (expanded ? 'Yes' : 'No') : '' },
      { label: 'Folders', value: root ? String(count) : '' },
    ]);
  }

  function CHUB_CATEGORIES_openModeOpts() {
    return [['page', 'Page'], ['panel', 'Panel']];
  }

  function CHUB_LIBRARY_moreOpenModeOpts() {
    return [['page', 'Page'], ['dropdown', 'Dropdown']];
  }

  function CHUB_LIBRARY_inlinePreviewOpts() {
    return [['enabled', 'Enabled'], ['disabled', 'Disabled']];
  }

  function CHUB_FOLDERS_getOpenMode() {
    const mode = SAFE_call('folders.getOpenMode', () => W.H2O?.folders?.getFolderOpenMode?.()) || 'panel';
    return String(mode || '').toLowerCase() === 'page' ? 'page' : 'panel';
  }

  function CHUB_FOLDERS_setOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'page' ? 'page' : 'panel';
    SAFE_call('folders.setOpenMode', () => W.H2O?.folders?.setFolderOpenMode?.(next));
    return next;
  }

  function CHUB_CATEGORIES_getOpenMode() {
    const mode = SAFE_call('categories.getOpenMode', () => W.H2O?.folders?.getCategoryOpenMode?.()) || 'page';
    return String(mode || '').toLowerCase() === 'panel' ? 'panel' : 'page';
  }

  function CHUB_CATEGORIES_setOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'panel' ? 'panel' : 'page';
    SAFE_call('categories.setOpenMode', () => W.H2O?.folders?.setCategoryOpenMode?.(next));
    return next;
  }

  function CHUB_FOLDERS_getMoreOpenMode() {
    const mode = SAFE_call('folders.getMoreOpenMode', () => W.H2O?.folders?.getFolderMoreOpenMode?.()) || 'page';
    return String(mode || '').toLowerCase() === 'dropdown' ? 'dropdown' : 'page';
  }

  function CHUB_FOLDERS_setMoreOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'dropdown' ? 'dropdown' : 'page';
    SAFE_call('folders.setMoreOpenMode', () => W.H2O?.folders?.setFolderMoreOpenMode?.(next));
    return next;
  }

  function CHUB_CATEGORIES_getMoreOpenMode() {
    const mode = SAFE_call('categories.getMoreOpenMode', () => W.H2O?.folders?.getCategoryMoreOpenMode?.()) || 'page';
    return String(mode || '').toLowerCase() === 'dropdown' ? 'dropdown' : 'page';
  }

  function CHUB_CATEGORIES_setMoreOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'dropdown' ? 'dropdown' : 'page';
    SAFE_call('categories.setMoreOpenMode', () => W.H2O?.folders?.setCategoryMoreOpenMode?.(next));
    return next;
  }

  function CHUB_PROJECTS_getMoreOpenMode() {
    const mode = SAFE_call('projects.getMoreOpenMode', () => W.H2O?.folders?.getProjectMoreOpenMode?.()) || 'dropdown';
    return String(mode || '').toLowerCase() === 'page' ? 'page' : 'dropdown';
  }

  function CHUB_PROJECTS_setMoreOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'page' ? 'page' : 'dropdown';
    SAFE_call('projects.setMoreOpenMode', () => W.H2O?.folders?.setProjectMoreOpenMode?.(next));
    return next;
  }

  function CHUB_FOLDERS_getInlinePreviewOnOpen() {
    const enabled = SAFE_call('folders.getInlinePreviewOnOpen', () => W.H2O?.folders?.getFolderInlinePreviewOnOpen?.());
    return enabled === false ? 'disabled' : 'enabled';
  }

  function CHUB_FOLDERS_setInlinePreviewOnOpen(value) {
    const next = String(value || '').toLowerCase() === 'disabled' ? 'disabled' : 'enabled';
    SAFE_call('folders.setInlinePreviewOnOpen', () => W.H2O?.folders?.setFolderInlinePreviewOnOpen?.(next === 'enabled'));
    return next;
  }

  function CHUB_CATEGORIES_getInlinePreviewOnOpen() {
    const enabled = SAFE_call('categories.getInlinePreviewOnOpen', () => W.H2O?.folders?.getCategoryInlinePreviewOnOpen?.());
    return enabled === false ? 'disabled' : 'enabled';
  }

  function CHUB_CATEGORIES_setInlinePreviewOnOpen(value) {
    const next = String(value || '').toLowerCase() === 'disabled' ? 'disabled' : 'enabled';
    SAFE_call('categories.setInlinePreviewOnOpen', () => W.H2O?.folders?.setCategoryInlinePreviewOnOpen?.(next === 'enabled'));
    return next;
  }

  function CHUB_PROJECTS_getInlinePreviewOnOpen() {
    const enabled = SAFE_call('projects.getInlinePreviewOnOpen', () => W.H2O?.folders?.getProjectInlinePreviewOnOpen?.());
    return enabled === false ? 'disabled' : 'enabled';
  }

  function CHUB_PROJECTS_setInlinePreviewOnOpen(value) {
    const next = String(value || '').toLowerCase() === 'disabled' ? 'disabled' : 'enabled';
    SAFE_call('projects.setInlinePreviewOnOpen', () => W.H2O?.folders?.setProjectInlinePreviewOnOpen?.(next === 'enabled'));
    return next;
  }

  function CHUB_FOLDERS_getShowCounts() {
    return SAFE_call('folders.getShowFolderCounts', () => W.H2O?.folders?.getShowFolderCounts?.()) !== false;
  }

  function CHUB_FOLDERS_setShowCounts(value) {
    SAFE_call('folders.setShowFolderCounts', () => W.H2O?.folders?.setShowFolderCounts?.(value !== false));
    return value !== false;
  }

  function CHUB_CATEGORIES_getShowCounts() {
    return SAFE_call('categories.getShowCategoryCounts', () => W.H2O?.folders?.getShowCategoryCounts?.()) !== false;
  }

  function CHUB_CATEGORIES_setShowCounts(value) {
    SAFE_call('categories.setShowCategoryCounts', () => W.H2O?.folders?.setShowCategoryCounts?.(value !== false));
    return value !== false;
  }

  const CHUB_LABELS_SEL_ROOT = '[data-cgxui="lbsc-root"][data-cgxui-owner="lbsc"]';

  function CHUB_LABELS_owner() {
    return W.H2O?.Labels
      || W.H2O?.LibraryCore?.getOwner?.('labels')
      || W.H2O?.LibraryCore?.getService?.('labels')
      || null;
  }

  function CHUB_LABELS_root() {
    return D.querySelector(CHUB_LABELS_SEL_ROOT);
  }

  function CHUB_LABELS_headerButton() {
    return CHUB_LABELS_root()?.querySelector(':scope > button') || null;
  }

  function CHUB_LABELS_focusAction() {
    const root = CHUB_LABELS_root();
    if (!root) return { message: 'Labels section not found.' };
    SAFE_call('labels.focus', () => root.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return { ok: true, message: 'Labels section focused.' };
  }

  function CHUB_LABELS_setExpanded(open) {
    const owner = CHUB_LABELS_owner();
    if (owner?.setSectionExpanded) {
      SAFE_call(`labels.setExpanded:${open ? 'open' : 'close'}`, () => owner.setSectionExpanded(open === true));
      CHUB_invalidateSoon();
      return { ok: true, message: open ? 'Labels expanded.' : 'Labels collapsed.' };
    }
    const btn = CHUB_LABELS_headerButton();
    if (!btn) return { message: 'Labels section not found.' };
    const isOpen = btn.getAttribute('aria-expanded') !== 'false';
    if (isOpen !== !!open) SAFE_call(`labels.headerClick:${open ? 'open' : 'close'}`, () => btn.click());
    CHUB_invalidateSoon();
    return { ok: true, message: open ? 'Labels expanded.' : 'Labels collapsed.' };
  }

  function CHUB_LABELS_renderStatus() {
    const root = CHUB_LABELS_root();
    const headerBtn = CHUB_LABELS_headerButton();
    const owner = CHUB_LABELS_owner();
    const count = owner?.listTypes ? Number((owner.listTypes() || []).length) : 0;
    const expanded = headerBtn ? (headerBtn.getAttribute('aria-expanded') !== 'false') : false;
    return CHUB_renderInfoList([
      { label: 'Visible', value: root ? 'Yes' : 'No' },
      { label: 'Expanded', value: root ? (expanded ? 'Yes' : 'No') : '' },
      { label: 'Label Types', value: root ? String(count) : '' },
    ]);
  }

  function CHUB_LABELS_getShowCounts() {
    return SAFE_call('labels.getShowCounts', () => CHUB_LABELS_owner()?.getShowCounts?.()) !== false;
  }

  function CHUB_LABELS_setShowCounts(value) {
    SAFE_call('labels.setShowCounts', () => CHUB_LABELS_owner()?.setShowCounts?.(value !== false));
    return value !== false;
  }

  function CHUB_LABELS_getOpenMode() {
    const mode = SAFE_call('labels.getOpenMode', () => CHUB_LABELS_owner()?.getOpenMode?.()) || 'page';
    return String(mode || '').toLowerCase() === 'panel' ? 'panel' : 'page';
  }

  function CHUB_LABELS_setOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'panel' ? 'panel' : 'page';
    SAFE_call('labels.setOpenMode', () => CHUB_LABELS_owner()?.setOpenMode?.(next));
    return next;
  }

  function CHUB_LABELS_getInlinePreviewOnOpen() {
    const enabled = SAFE_call('labels.getInlinePreviewOnOpen', () => CHUB_LABELS_owner()?.getInlinePreviewOnOpen?.());
    return enabled === true ? 'enabled' : 'disabled';
  }

  function CHUB_LABELS_setInlinePreviewOnOpen(value) {
    const next = String(value || '').toLowerCase() === 'enabled' ? 'enabled' : 'disabled';
    SAFE_call('labels.setInlinePreviewOnOpen', () => CHUB_LABELS_owner()?.setInlinePreviewOnOpen?.(next === 'enabled'));
    return next;
  }

  function CHUB_LABELS_typeExpandModeOpts() {
    return [
      ['all-open', 'All Expanded'],
      ['all-closed', 'All Collapsed'],
      ['remember', 'Remember Last Time'],
    ];
  }

  function CHUB_LABELS_getTypeExpandMode() {
    const mode = SAFE_call('labels.getTypeExpandMode', () => CHUB_LABELS_owner()?.getTypeExpandMode?.()) || 'remember';
    if (String(mode || '').toLowerCase() === 'all-open') return 'all-open';
    if (String(mode || '').toLowerCase() === 'all-closed') return 'all-closed';
    return 'remember';
  }

  function CHUB_LABELS_setTypeExpandMode(mode) {
    const next = CHUB_LABELS_typeExpandModeOpts().some(([value]) => value === mode) ? mode : 'remember';
    SAFE_call('labels.setTypeExpandMode', () => CHUB_LABELS_owner()?.setTypeExpandMode?.(next));
    return next;
  }

  function CHUB_LABELS_isTypeVisible(typeKey) {
    return SAFE_call(`labels.isTypeVisible:${typeKey}`, () => CHUB_LABELS_owner()?.isTypeVisible?.(typeKey)) !== false;
  }

  function CHUB_LABELS_setTypeVisible(typeKey, value) {
    SAFE_call(`labels.setTypeVisible:${typeKey}`, () => CHUB_LABELS_owner()?.setTypeVisible?.(typeKey, value !== false));
    return value !== false;
  }


  function CHUB_TAGS_owner() {
    return W.H2O?.Tags || W.H2O?.TG?.tags || W.H2O?.LibraryCore?.getOwner?.('tags') || W.H2O?.LibraryCore?.getService?.('tags') || null;
  }

  function CHUB_TAGS_getCurrentChatId() {
    try {
      const live = String(W.H2O?.archiveBoot?.getCurrentChatId?.() || W.H2O?.util?.getChatId?.() || '').trim();
      if (live) return live;
    } catch {}
    return '';
  }

  function CHUB_TAGS_getMode() {
    const chatId = CHUB_TAGS_getCurrentChatId();
    const owner = CHUB_TAGS_owner();
    if (!chatId || !owner?.getChatMode) return 'manual';
    try { return String(owner.getChatMode(chatId) || 'manual'); } catch { return 'manual'; }
  }

  function CHUB_TAGS_setMode(mode) {
    const chatId = CHUB_TAGS_getCurrentChatId();
    const owner = CHUB_TAGS_owner();
    if (!chatId || !owner?.setChatMode) return 'manual';
    try { return String(owner.setChatMode(chatId, mode) || 'manual'); } catch { return 'manual'; }
  }

  function CHUB_TAGS_modeOpts() {
    return [
      ['manual', 'Manual'],
      ['suggestion', 'Suggestion'],
      ['auto', 'Automatic'],
    ];
  }

  function CHUB_TAGS_renderStatus() {
    const chatId = CHUB_TAGS_getCurrentChatId();
    const owner = CHUB_TAGS_owner();
    const tagCount = chatId && owner?.getChatTagCatalog ? Number((owner.getChatTagCatalog(chatId) || []).length) : 0;
    return CHUB_renderInfoList([
      { label:'Current Chat', value: chatId || 'No active chat remembered' },
      { label:'Mode', value: CHUB_TAGS_getMode() },
      { label:'Tags', value: chatId ? String(tagCount) : '' },
    ]);
  }

  const CHUB_LW_SECTIONS = Object.freeze([
    { id: 'library', label: 'Library' },
    { id: 'labels', label: 'Labels' },
    { id: 'folders', label: 'Folders' },
    { id: 'categories', label: 'Categories' },
    { id: 'projects', label: 'Projects' },
    { id: 'recents', label: 'Recents', native: true },
  ]);

  function CHUB_LW_owner() {
    return W.H2O?.LibraryWorkspace
      || W.H2O?.LibraryCore?.getOwner?.('library-workspace')
      || W.H2O?.LibraryCore?.getService?.('library-workspace')
      || null;
  }

  function CHUB_LW_defaultLayout() {
    const sections = {};
    CHUB_LW_SECTIONS.forEach((section, idx) => { sections[section.id] = { visible: true, order: (idx + 1) * 10 }; });
    return { sections, updatedAt: 0 };
  }

  function CHUB_LW_normalizeLayout(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const inSections = src.sections && typeof src.sections === 'object' ? src.sections : {};
    const out = CHUB_LW_defaultLayout();
    CHUB_LW_SECTIONS.forEach((section, idx) => {
      const row = inSections[section.id] && typeof inSections[section.id] === 'object' ? inSections[section.id] : {};
      const n = Number(row.order);
      out.sections[section.id] = {
        visible: row.visible !== false,
        order: Number.isFinite(n) ? n : (idx + 1) * 10,
      };
    });
    out.updatedAt = Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : 0;
    CHUB_LW_orderIds(out).forEach((id, idx) => { out.sections[id].order = (idx + 1) * 10; });
    return out;
  }

  function CHUB_LW_orderIds(layoutRaw = null) {
    const layout = layoutRaw && layoutRaw.sections ? layoutRaw : CHUB_LW_normalizeLayout(layoutRaw);
    return CHUB_LW_SECTIONS.slice().sort((a, b) => {
      const ao = Number(layout.sections?.[a.id]?.order);
      const bo = Number(layout.sections?.[b.id]?.order);
      return ((Number.isFinite(ao) ? ao : 999) - (Number.isFinite(bo) ? bo : 999));
    }).map((section) => section.id);
  }

  function CHUB_LW_getLayout() {
    const owner = CHUB_LW_owner();
    if (owner?.getSidebarLayout) {
      try { return CHUB_LW_normalizeLayout(owner.getSidebarLayout()); } catch {}
    }
    return CHUB_LW_normalizeLayout(UTIL_storage.getJSON(KEY_CHUB_LIBRARY_SIDEBAR_LAYOUT_V1, null));
  }

  function CHUB_LW_writeLayoutFallback(layout) {
    const next = CHUB_LW_normalizeLayout({ ...(layout || {}), updatedAt: Date.now() });
    UTIL_storage.setJSON(KEY_CHUB_LIBRARY_SIDEBAR_LAYOUT_V1, next);
    return next;
  }

  function CHUB_LW_setSectionVisible(sectionId, visible) {
    const id = String(sectionId || '').trim();
    const owner = CHUB_LW_owner();
    if (owner?.setSidebarSectionVisible) {
      try { const next = owner.setSidebarSectionVisible(id, visible !== false); CHUB_invalidateSoon(); return CHUB_LW_normalizeLayout(next); } catch {}
    }
    const layout = CHUB_LW_getLayout();
    if (layout.sections[id]) layout.sections[id].visible = visible !== false;
    const next = CHUB_LW_writeLayoutFallback(layout);
    CHUB_invalidateSoon();
    return next;
  }

  function CHUB_LW_moveSection(sectionId, direction) {
    const id = String(sectionId || '').trim();
    const owner = CHUB_LW_owner();
    if (owner?.moveSidebarSection) {
      try { const next = owner.moveSidebarSection(id, direction); CHUB_invalidateSoon(); return CHUB_LW_normalizeLayout(next); } catch {}
    }
    const order = CHUB_LW_orderIds(CHUB_LW_getLayout());
    const idx = order.indexOf(id);
    if (idx < 0) return CHUB_LW_getLayout();
    const delta = String(direction || '').toLowerCase() === 'down' ? 1 : -1;
    const nextIdx = Math.max(0, Math.min(order.length - 1, idx + delta));
    if (nextIdx !== idx) { const [item] = order.splice(idx, 1); order.splice(nextIdx, 0, item); }
    return CHUB_LW_setOrder(order);
  }

  function CHUB_LW_setOrder(sectionIds) {
    const owner = CHUB_LW_owner();
    if (owner?.setSidebarOrder) {
      try { const next = owner.setSidebarOrder(sectionIds); CHUB_invalidateSoon(); return CHUB_LW_normalizeLayout(next); } catch {}
    }
    const layout = CHUB_LW_getLayout();
    const ids = Array.isArray(sectionIds) ? sectionIds.filter((id) => layout.sections[id]) : CHUB_LW_orderIds(layout);
    ids.forEach((id, idx) => { layout.sections[id].order = (idx + 1) * 10; });
    const next = CHUB_LW_writeLayoutFallback(layout);
    CHUB_invalidateSoon();
    return next;
  }

  function CHUB_LW_resetLayout() {
    const owner = CHUB_LW_owner();
    if (owner?.resetSidebarLayout) {
      try { const next = owner.resetSidebarLayout(); CHUB_invalidateSoon(); return CHUB_LW_normalizeLayout(next); } catch {}
    }
    const next = CHUB_LW_writeLayoutFallback(CHUB_LW_defaultLayout());
    CHUB_invalidateSoon();
    return next;
  }

  function CHUB_LW_applyLayoutAction() {
    const owner = CHUB_LW_owner();
    const ok = SAFE_call('libraryWorkspace.applySidebarLayout', () => owner?.applySidebarLayout?.('control-hub'));
    CHUB_invalidateSoon();
    return { message: ok ? 'Sidebar layout applied.' : 'Saved. Library Workspace will apply it when available.' };
  }

  function CHUB_LW_openAction() {
    const ok = SAFE_call('libraryWorkspace.open', () => CHUB_LW_owner()?.openWorkspace?.({ source: 'control-hub' }));
    CHUB_invalidateSoon();
    return { message: ok ? 'Library opened.' : 'Library Workspace is unavailable.' };
  }

  function CHUB_LW_refreshAction() {
    const ok = SAFE_call('libraryWorkspace.refresh', () => CHUB_LW_owner()?.refresh?.('control-hub'));
    CHUB_invalidateSoon();
    return { message: ok ? 'Library refreshed.' : 'Library Workspace is unavailable.' };
  }

  function CHUB_LW_resetUiAction() {
    const ok = SAFE_call('libraryWorkspace.resetUi', () => CHUB_LW_owner()?.resetWorkspaceUiPrefs?.());
    CHUB_invalidateSoon();
    return { message: ok ? 'Library UI preferences reset.' : 'Library Workspace is unavailable.' };
  }

  function CHUB_LW_getLibraryButtonVisible() {
    return CHUB_LW_getLayout().sections?.library?.visible !== false;
  }

  function CHUB_LW_setLibraryButtonVisible(value) {
    CHUB_LW_setSectionVisible('library', value !== false);
    return value !== false;
  }

  function CHUB_LW_renderStatus() {
    const owner = CHUB_LW_owner();
    const check = SAFE_call('libraryWorkspace.selfCheck', () => owner?.selfCheck?.()) || {};
    const layout = CHUB_LW_getLayout();
    return CHUB_renderInfoList([
      { label: 'Workspace API', value: owner ? 'Ready' : 'Missing' },
      { label: 'Sidebar Row', value: check.sidebarRowExists ? 'Visible' : 'Not found' },
      { label: 'Page Mounted', value: check.pageMounted ? 'Yes' : 'No' },
      { label: 'Route', value: check.registeredRoute ? 'Registered' : 'Not registered' },
      { label: 'Order', value: CHUB_LW_orderIds(layout).join(' → ') },
      { label: 'Storage', value: KEY_CHUB_LIBRARY_SIDEBAR_LAYOUT_V1 },
    ]);
  }

  function CHUB_LW_renderDiagnostics() {
    const owner = CHUB_LW_owner();
    const core = W.H2O?.LibraryCore || null;
    const check = SAFE_call('libraryWorkspace.selfCheck', () => owner?.selfCheck?.()) || null;
    const routes = core?.listRoutes ? core.listRoutes().join(', ') : '';
    const owners = core?.listOwners ? core.listOwners().join(', ') : '';
    const services = core?.listServices ? core.listServices().join(', ') : '';
    return CHUB_renderInfoList([
      { label: 'Owners', value: owners },
      { label: 'Services', value: services },
      { label: 'Routes', value: routes },
      { label: 'SelfCheck', value: check ? JSON.stringify({ ok: check.ok, sidebarRowCount: check.sidebarRowCount, pageMounted: check.pageMounted }) : 'Unavailable' },
    ]);
  }

  function CHUB_LW_renderSidebarLayoutEditor() {
    const root = D.createElement('div');
    root.className = `${CLS}-tabOrderEditor ${CLS}-libraryLayoutEditor`;

    const hint = D.createElement('div');
    hint.className = `${CLS}-ctrlHint ${CLS}-tabOrderHint`;
    hint.textContent = 'Show, hide, and reorder the Library-related sidebar sections. Control Hub edits settings; Library Workspace applies the actual sidebar layout.';
    root.appendChild(hint);

    const list = D.createElement('div');
    list.className = `${CLS}-tabOrderList`;
    root.appendChild(list);

    const actionRow = D.createElement('div');
    actionRow.className = `${CLS}-sbPaletteActions`;
    const resetBtn = D.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = `${CLS}-actionBtn`;
    resetBtn.textContent = 'Reset Default Order';
    const showAllBtn = D.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = `${CLS}-actionBtn`;
    showAllBtn.textContent = 'Show All';
    const applyBtn = D.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = `${CLS}-actionBtn primary`;
    applyBtn.textContent = 'Apply Now';
    const status = D.createElement('span');
    status.className = `${CLS}-ctrlActionStatus`;
    status.style.textAlign = 'left';
    status.style.minWidth = '0';

    const renderRows = () => {
      list.textContent = '';
      const layout = CHUB_LW_getLayout();
      const order = CHUB_LW_orderIds(layout);
      order.forEach((id, idx) => {
        const meta = CHUB_LW_SECTIONS.find((section) => section.id === id) || { id, label: id };
        const cfg = layout.sections[id] || { visible: true, order: (idx + 1) * 10 };
        const row = D.createElement('div');
        row.className = `${CLS}-tabOrderRow`;
        row.setAttribute(ATTR_CGXUI_KEY, id);
        row.setAttribute(ATTR_CGXUI_ORDER, String(idx + 1));

        const left = D.createElement('div');
        left.className = `${CLS}-tabOrderLeft`;
        const index = D.createElement('span');
        index.className = `${CLS}-tabOrderIndex`;
        index.textContent = String(idx + 1);
        const sw = D.createElement('button');
        sw.type = 'button';
        sw.className = `${CLS}-miniSwitch`;
        sw.innerHTML = '<i></i>';
        sw.setAttribute(ATTR_CGXUI_STATE, cfg.visible !== false ? 'on' : 'off');
        sw.title = cfg.visible !== false ? 'Hide section' : 'Show section';
        const textWrap = D.createElement('div');
        textWrap.className = `${CLS}-tabOrderText`;
        const title = D.createElement('div');
        title.className = `${CLS}-tabOrderTitle`;
        title.textContent = meta.label;
        const sub = D.createElement('div');
        sub.className = `${CLS}-tabOrderSub`;
        sub.textContent = meta.native ? 'Native / best-effort' : 'H2O-owned section';
        textWrap.append(title, sub);
        left.append(index, sw, textWrap);

        const right = D.createElement('div');
        right.className = `${CLS}-tabOrderMoves`;
        const makeMoveBtn = (txt, direction, disabled) => {
          const btn = D.createElement('button');
          btn.type = 'button';
          btn.className = `${CLS}-tabOrderMoveBtn`;
          btn.textContent = txt;
          btn.disabled = !!disabled;
          btn.addEventListener('click', (evt) => {
            evt.preventDefault();
            CHUB_LW_moveSection(id, direction);
            status.textContent = 'Sidebar order updated.';
            renderRows();
          }, true);
          return btn;
        };
        right.append(makeMoveBtn('↑', 'up', idx === 0), makeMoveBtn('↓', 'down', idx === order.length - 1));

        sw.addEventListener('click', (evt) => {
          evt.preventDefault();
          const nextVisible = sw.getAttribute(ATTR_CGXUI_STATE) !== 'on';
          CHUB_LW_setSectionVisible(id, nextVisible);
          status.textContent = `${meta.label} ${nextVisible ? 'shown' : 'hidden'}.`;
          renderRows();
        }, true);

        row.append(left, right);
        list.appendChild(row);
      });
    };

    resetBtn.addEventListener('click', (evt) => { evt.preventDefault(); CHUB_LW_resetLayout(); status.textContent = 'Default sidebar layout restored.'; renderRows(); }, true);
    showAllBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      CHUB_LW_SECTIONS.forEach((section) => CHUB_LW_setSectionVisible(section.id, true));
      status.textContent = 'All sections shown.';
      renderRows();
    }, true);
    applyBtn.addEventListener('click', (evt) => { evt.preventDefault(); const res = CHUB_LW_applyLayoutAction(); status.textContent = res.message || 'Applied.'; renderRows(); }, true);

    renderRows();
    actionRow.append(resetBtn, showAllBtn, applyBtn, status);
    root.appendChild(actionRow);
    return root;
  }

  function CHUB_THEME_loadSettings() {
    const diskObj = UTIL_storage.getJSON(CHUB_THEME_SETTINGS_KEY_V2, null);
    if (diskObj && typeof diskObj === 'object') return { ...CHUB_THEME_DEFAULTS, ...diskObj };
    const legacyObj = UTIL_storage.getJSON(CHUB_THEME_SETTINGS_KEY_LEGACY, null);
    if (legacyObj && typeof legacyObj === 'object') return { ...CHUB_THEME_DEFAULTS, ...legacyObj };
    return { ...CHUB_THEME_DEFAULTS };
  }

  function CHUB_THEME_applySettings(settings) {
    const S = { ...CHUB_THEME_DEFAULTS, ...(settings || {}) };
    const rootStyle = D.documentElement?.style;
    if (!D.body || !rootStyle) return S;

    if (!S.enabled) {
      D.body.removeAttribute('data-ho-theme-enabled');
      D.documentElement.removeAttribute('data-ho-mode');
      rootStyle.removeProperty('--ho-accent-light-hsl');
      rootStyle.removeProperty('--ho-accent-dark-hsl');
      rootStyle.removeProperty('--ho-font-size');
      rootStyle.removeProperty('--ho-line-height');
      rootStyle.removeProperty('--ho-letter-space');
      rootStyle.removeProperty('--ho-chat-width-rem');
      rootStyle.removeProperty('--ho-prompt-width-rem');
      D.body.removeAttribute('data-ho-font');
      return S;
    }

    D.body.setAttribute('data-ho-theme-enabled', 'true');
    D.documentElement.setAttribute('data-ho-mode', String(S.mode || 'dark'));
    rootStyle.setProperty('--ho-accent-light-hsl', String(S.accentLight || CHUB_THEME_DEFAULTS.accentLight));
    rootStyle.setProperty('--ho-accent-dark-hsl', String(S.accentDark || CHUB_THEME_DEFAULTS.accentDark));

    let fontFlag = String(S.fontFamily || 'system');
    if (!['system', 'inter', 'mono'].includes(fontFlag)) fontFlag = 'system';
    D.body.setAttribute('data-ho-font', fontFlag);

    rootStyle.setProperty('--ho-font-size', `${Number(S.fontSize || CHUB_THEME_DEFAULTS.fontSize)}px`);
    rootStyle.setProperty('--ho-line-height', `${Number(S.lineHeight || CHUB_THEME_DEFAULTS.lineHeight)}px`);
    rootStyle.setProperty('--ho-letter-space', `${Number(S.letterSpace || CHUB_THEME_DEFAULTS.letterSpace)}px`);
    rootStyle.setProperty('--ho-chat-width-rem', `${Number(S.chatWidth || CHUB_THEME_DEFAULTS.chatWidth)}rem`);
    rootStyle.setProperty('--ho-prompt-width-rem', `${Number(S.promptWidth || CHUB_THEME_DEFAULTS.promptWidth)}rem`);

    D.body.setAttribute('data-ho-chat-full', String(!!S.chatFullWidth));
    D.body.setAttribute('data-ho-sync-prompt', String(!!S.syncPromptWidth));
    D.body.setAttribute('data-ho-hide-header', String(!!S.hideHeader));
    D.body.setAttribute('data-ho-hide-footer', String(!!S.hideFooter));
    D.body.setAttribute('data-ho-expand-chatbox', String(!!S.expandChatbox));
    D.body.setAttribute('data-ho-bubble-user', String(S.bubblesUser !== false));
    D.body.setAttribute('data-ho-bubble-gpt', String(S.bubblesGpt !== false));
    D.body.setAttribute('data-ho-accent-user-bubble', String(!!S.accentUserBubble));
    return S;
  }

  function CHUB_ACCENT_normalize(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'orange') return 'orange';
    if (value === 'logo-blue' || value === 'logoblue' || value === 'logo_blue') return 'logo-blue';
    return 'default';
  }

  function CHUB_SURFACE_ACCENT_normalize(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'logo-blue' || value === 'logoblue' || value === 'logo_blue') return 'logo-blue';
    return 'default';
  }

  function CHUB_BUTTON_ACCENT_opts() {
    return [
      ['default', 'Default Gold'],
      ['orange', 'Orange'],
      ['logo-blue', 'Logo Blue'],
    ];
  }

  function CHUB_NAV_ACCENT_opts() {
    return [
      ['default', 'Default Mixed'],
      ['orange', 'Orange'],
      ['logo-blue', 'Logo Blue'],
    ];
  }

  function CHUB_SURFACE_ACCENT_opts() {
    return [
      ['default', 'Default Dark'],
      ['logo-blue', 'Logo Blue'],
    ];
  }

  function CHUB_ACCENT_getLegacy() {
    return CHUB_ACCENT_normalize(UTIL_storage.getStr(KEY_CHUB_ACCENT_V1, 'default'));
  }

  function CHUB_BUTTON_ACCENT_get() {
    const raw = UTIL_storage.getStr(KEY_CHUB_BUTTON_ACCENT_V1, null);
    return raw == null ? CHUB_ACCENT_getLegacy() : CHUB_ACCENT_normalize(raw);
  }

  function CHUB_NAV_ACCENT_get() {
    const raw = UTIL_storage.getStr(KEY_CHUB_NAV_ACCENT_V1, null);
    return raw == null ? CHUB_ACCENT_getLegacy() : CHUB_ACCENT_normalize(raw);
  }

  function CHUB_SURFACE_ACCENT_get() {
    const raw = UTIL_storage.getStr(KEY_CHUB_SURFACE_ACCENT_V1, null);
    if (raw != null) return CHUB_SURFACE_ACCENT_normalize(raw);
    return CHUB_ACCENT_getLegacy() === 'logo-blue' ? 'logo-blue' : 'default';
  }

  function CHUB_ACCENT_setRootAttr(name, value) {
    if (!D.documentElement) return value;
    if (value === 'default') D.documentElement.removeAttribute(name);
    else D.documentElement.setAttribute(name, value);
    return value;
  }

  function CHUB_ACCENT_apply() {
    const buttons = CHUB_BUTTON_ACCENT_get();
    const navigation = CHUB_NAV_ACCENT_get();
    const surface = CHUB_SURFACE_ACCENT_get();
    if (D.documentElement) D.documentElement.removeAttribute('data-h2o-chub-accent');
    CHUB_ACCENT_setRootAttr('data-h2o-chub-button-accent', buttons);
    CHUB_ACCENT_setRootAttr('data-h2o-chub-nav-accent', navigation);
    CHUB_ACCENT_setRootAttr('data-h2o-chub-surface-accent', surface);
    return { buttons, navigation, surface };
  }

  function CHUB_BUTTON_ACCENT_set(value) {
    const next = CHUB_ACCENT_normalize(value);
    try { UTIL_storage.setStr(KEY_CHUB_BUTTON_ACCENT_V1, next); } catch {}
    CHUB_ACCENT_apply();
    CHUB_invalidateSoon();
    return next;
  }

  function CHUB_NAV_ACCENT_set(value) {
    const next = CHUB_ACCENT_normalize(value);
    try { UTIL_storage.setStr(KEY_CHUB_NAV_ACCENT_V1, next); } catch {}
    CHUB_ACCENT_apply();
    CHUB_invalidateSoon();
    return next;
  }

  function CHUB_SURFACE_ACCENT_set(value) {
    const next = CHUB_SURFACE_ACCENT_normalize(value);
    try { UTIL_storage.setStr(KEY_CHUB_SURFACE_ACCENT_V1, next); } catch {}
    CHUB_ACCENT_apply();
    CHUB_invalidateSoon();
    return next;
  }

  const CHUB_VISIBILITY = Object.freeze({
    [FEATURE_KEY_CHAT_NAVIGATION]: Object.freeze({
      selectors: [
        '[data-cgxui-owner="mnmp"]',
        '[data-cgxui-owner="nvcn"]',
      ],
      hideCss: `
__ROOT__ .cgxui-qswr-toggle,
__ROOT__ .cgxui-qswr-toggle-top,
__ROOT__ .cgxui-qswr-toggle-row,
__ROOT__ .cgxui-qswr-quoteBox{
  display:none !important;
}
__ROOT__ .cgxui-qswr{
  background:transparent !important;
  border:0 !important;
  box-shadow:none !important;
  padding:0 !important;
  margin:0 !important;
  max-width:none !important;
  backdrop-filter:none !important;
  -webkit-backdrop-filter:none !important;
}
__ROOT__ .cgxui-qswr::after,
__ROOT__ .cgxui-qswr-quoteTitle::after{
  content:none !important;
  display:none !important;
}
__ROOT__ .cgxui-qswr-text{
  display:block !important;
  max-height:none !important;
  overflow:visible !important;
  -webkit-line-clamp:unset !important;
  mask-image:none !important;
}
__ROOT__ .cgxui-qswr-bubble,
__ROOT__ .cgxui-qswr-bubble-short{
  max-width:none !important;
}
`,
    }),
    [FEATURE_KEY_MARKUP]: Object.freeze({
      selectors: [
        '[data-cgxui-owner="scbn"]',
      ],
      hideCss: `
__ROOT__ .cgxui-inhl-hl-tools,
__ROOT__ .cgxui-inhl-hl-swatches,
__ROOT__ .cgxui-inhl-hl-swatch{
  display:none !important;
}
__ROOT__ .cgxui-inhl-inline-hl,
__ROOT__ mark.cgxui-inhl-inline-hl{
  background:transparent !important;
  color:inherit !important;
  border:0 !important;
  box-shadow:none !important;
  outline:none !important;
  text-decoration:none !important;
  padding:0 !important;
  border-radius:0 !important;
  filter:none !important;
}
`,
    }),
    [FEATURE_KEY_ANNOTATIONS]: Object.freeze({
      selectors: [
        '[data-cgxui-owner="mrnc"]',
      ],
    }),
    [FEATURE_KEY_PROMPT_MANAGER]: Object.freeze({
      selectors: [
        '[data-cgxui-owner="prmn"]',
      ],
    }),
    dockPanel: Object.freeze({
      selectors: [
        '[data-cgxui-owner="dcpn"]',
      ],
    }),
    [FEATURE_KEY_WORKSPACE]: Object.freeze({
      selectors: [
        '#cgxui-wsdk-root',
        '[data-cgxui-owner="wsdk"]',
      ],
      hideCss: `
__ROOT__ body{
  transform:none !important;
}
`,
    }),
    [FEATURE_KEY_DATA_BACKUP]: Object.freeze({
      selectors: [
        '.h2o-cold-layer',
        '.h2o-archive-native-detached-bin',
      ],
    }),
    [FEATURE_KEY_EXPORT]: Object.freeze({
      selectors: [
        '[data-cgxui-owner="xpch"]',
        '[data-cgxui-owner="prmn"][data-cgxui="prmn-export-btn"]',
        '[data-cgxui-owner="nvcn"][data-cgxui="nvcn-export-btn"]',
        '.cgxui-xpch-export-btn',
        '.cgxui-xpch-export-wrap',
      ],
    }),
    [FEATURE_KEY_STUDIO]: Object.freeze({
      selectors: [
        '.h2o-archive-reader',
        '.h2o-archive-saved',
      ],
    }),
    [FEATURE_KEY_LIBRARY]: Object.freeze({
      selectors: [
        '[data-cgxui-owner="flsc"]',
      ],
    }),
    [FEATURE_KEY_CHAT_PERFORMANCE]: Object.freeze({
      selectors: [
        '.cgxui-pgnw-sentinel',
        '.cgxui-pgnw-page-divider',
      ],
    }),
    [FEATURE_KEY_INTERFACE]: Object.freeze({
      hideCss: `
__ROOT__ .ho-colorbtn,
__ROOT__ .ho-palette,
__ROOT__ .ho-meta-row,
__ROOT__ .ho-meta-actions-right,
__ROOT__ .ho-meta-action,
__ROOT__ #ho-preview-tip,
__ROOT__ .ho-tab-title-under-input,
__ROOT__ .ho-sidebar-ring{
  display:none !important;
}
__ROOT__ a.ho-has-colorbtn,
__ROOT__ .ho-main-row,
__ROOT__ nav a.ho-project-row,
__ROOT__ :where(nav, aside) .ho-seeall{
  background:none !important;
  background-color:transparent !important;
  box-shadow:none !important;
  border-color:transparent !important;
  filter:none !important;
  backdrop-filter:none !important;
  -webkit-backdrop-filter:none !important;
}
__ROOT__ a.ho-has-colorbtn::before,
__ROOT__ a.ho-has-colorbtn::after,
__ROOT__ .ho-main-row::before,
__ROOT__ .ho-main-row::after,
__ROOT__ nav a.ho-project-row::before,
__ROOT__ nav a.ho-project-row::after,
__ROOT__ :where(nav, aside) .ho-seeall::before,
__ROOT__ :where(nav, aside) .ho-seeall::after{
  content:none !important;
  display:none !important;
}
`,
    }),
    [FEATURE_KEY_THEMES]: Object.freeze({
      selectors: [
        '[data-cgxui-owner="thpn"]',
      ],
      applyHidden(hidden) {
        const saved = CHUB_THEME_loadSettings();
        CHUB_THEME_applySettings(hidden ? { ...saved, enabled: false } : saved);
      },
    }),
  });

  function CHUB_VIS_loadState() {
    return UTIL_storage.getJSON(KEY_CHUB_TAB_VIS_V1, {}) || {};
  }

  function CHUB_VIS_saveState(next) {
    UTIL_storage.setJSON(KEY_CHUB_TAB_VIS_V1, next || {});
  }

  function CHUB_VIS_getKey(key) {
    return FEATURE_getHubKey(FEATURE_getCanonicalKey(key));
  }

  function CHUB_VIS_getEntry(key) {
    return CHUB_VISIBILITY[CHUB_VIS_getKey(key)] || null;
  }

  function CHUB_VIS_slug(key) {
    return String(CHUB_VIS_getKey(key) || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  function CHUB_VIS_className(key) {
    return `${CHUB_VIS_CLASS_PREFIX}${CHUB_VIS_slug(key)}`;
  }

  function CHUB_VIS_buildCss() {
    const blocks = [];
    for (const [key, entry] of Object.entries(CHUB_VISIBILITY)) {
      const root = `html.${CHUB_VIS_className(key)}`;
      const selectors = Array.isArray(entry?.selectors) ? entry.selectors.filter(Boolean) : [];
      if (selectors.length) {
        blocks.push(`${selectors.map((sel) => `${root} ${sel}`).join(',\n')}{display:none !important;}`);
      }
      if (entry?.hideCss) {
        blocks.push(String(entry.hideCss).split('__ROOT__').join(root));
      }
    }
    return blocks.join('\n\n');
  }

  function CHUB_VIS_ensureStyle() {
    let style = D.getElementById(CHUB_VIS_STYLE_ID);
    const cssText = CHUB_VIS_buildCss();
    if (!style) {
      style = D.createElement('style');
      style.id = CHUB_VIS_STYLE_ID;
      style.setAttribute(ATTR_CGXUI_OWNER, SkID);
      D.documentElement.appendChild(style);
    }
    if (style.textContent !== cssText) style.textContent = cssText;
    return style;
  }

  function CHUB_VIS_hasToggle(key) {
    return !!CHUB_VIS_getEntry(key);
  }

  function CHUB_VIS_getLabel(key) {
    const hubKey = CHUB_VIS_getKey(key);
    const meta = FEATURE_META.find((item) => FEATURE_getCanonicalKey(item.key) === hubKey) || null;
    return meta?.label || hubKey || 'surface';
  }

  function CHUB_VIS_isVisible(key) {
    if (!CHUB_VIS_hasToggle(key)) return true;
    const state = CHUB_VIS_loadState();
    return state[CHUB_VIS_getKey(key)] !== false;
  }

  function CHUB_VIS_applyKey(key) {
    const hubKey = CHUB_VIS_getKey(key);
    const entry = CHUB_VIS_getEntry(hubKey);
    if (!entry) return true;
    CHUB_VIS_ensureStyle();
    const hidden = !CHUB_VIS_isVisible(hubKey);
    try { D.documentElement.classList.toggle(CHUB_VIS_className(hubKey), hidden); } catch {}
    if (typeof entry.applyHidden === 'function') {
      SAFE_call(`tabVisibility.applyHidden:${hubKey}:${hidden ? 'hide' : 'show'}`, () => entry.applyHidden(hidden));
    }
    return !hidden;
  }

  function CHUB_VIS_applyAll() {
    CHUB_VIS_ensureStyle();
    Object.keys(CHUB_VISIBILITY).forEach((key) => CHUB_VIS_applyKey(key));
  }

  function CHUB_VIS_scheduleReapply(delays = [0, 400, 1200, 2400]) {
    const timers = [];
    for (const delay of Array.isArray(delays) ? delays : []) {
      const t = SAFE_call(`tabVisibility.schedule:${delay}`, () => W.setTimeout(() => CHUB_VIS_applyAll(), Math.max(0, Number(delay || 0))));
      if (t != null) timers.push(t);
    }
    return timers;
  }

  function CHUB_VIS_setVisible(key, on) {
    const hubKey = CHUB_VIS_getKey(key);
    if (!CHUB_VIS_getEntry(hubKey)) return false;
    const state = CHUB_VIS_loadState();
    state[hubKey] = !!on;
    CHUB_VIS_saveState(state);
    CHUB_VIS_applyKey(hubKey);
    CHUB_invalidateSoon();
    return true;
  }

			const FEATURE_CONTROLS = {

    [FEATURE_KEY_PROMPT_MANAGER]: [
      {
        type:'custom',
        key:'promptManagerStatus',
        label:'Status',
        group:'Prompt Manager',
        render() { return CHUB_PM_renderStatus(); },
      },
      {
        type:'action',
        key:'promptManagerPanel',
        label:'Panel',
        group:'Prompt Manager',
        statusText:'',
        buttons:[
          { label:'Open', primary:true, action: () => CHUB_PM_openAction() },
          { label:'Focus Search', action: () => CHUB_PM_focusSearchAction() },
          { label:'Close', action: () => CHUB_PM_closeAction() },
        ],
      },
      {
        type:'action',
        key:'promptManagerQuickTray',
        label:'Quick Tray',
        group:'Quick Tools',
        statusText:'',
        buttons:[
          { label:'Toggle Quick Tray', primary:true, action: () => CHUB_PM_toggleQuickTrayAction() },
        ],
      },
    ],

    inlineHighlighter: [
      {
        type:'select',
        key:'hlApplyShortcut',
        label:'Apply Highlight',
        group:'Shortcuts',
        help:'When text is selected, this shortcut applies a highlight using the configured start-color rule.',
        def:'meta_or_ctrl_1',
        opts: CHUB_HL_applyKeyOpts,
        getLive() { return CHUB_HL_getConfig().applyShortcut || 'meta_or_ctrl_1'; },
        setLive(v) { CHUB_HL_applySetting('applyShortcut', v); },
      },
      {
        type:'select',
        key:'hlClearShortcut',
        label:'Remove Highlight',
        group:'Shortcuts',
        help:'Removes highlights in the current text selection, or the last clicked/active highlight.',
        def:'meta_or_ctrl_z',
        opts: CHUB_HL_clearKeyOpts,
        getLive() { return CHUB_HL_getConfig().clearShortcut || 'meta_or_ctrl_z'; },
        setLive(v) { CHUB_HL_applySetting('clearShortcut', v); },
      },
      {
        type:'select',
        key:'hlPopupTrigger',
        label:'Popup On Highlight',
        group:'Popup',
        help:'Choose how the color popup opens when you interact with already-highlighted text.',
        def:'middle_click',
        opts: CHUB_HL_popupTriggerOpts,
        getLive() { return CHUB_HL_getConfig().popupTrigger || 'middle_click'; },
        setLive(v) { CHUB_HL_applySetting('popupTrigger', v); },
      },
      {
        type:'select',
        key:'hlShortcutColorMode',
        label:'Key Start Color',
        group:'Colors',
        help:'Controls which color the keyboard apply shortcut uses before you manually pick from the popup.',
        def:'current_color',
        opts: CHUB_HL_startColorOpts,
        getLive() { return CHUB_HL_getConfig().shortcutColorMode || 'current_color'; },
        setLive(v) { CHUB_HL_applySetting('shortcutColorMode', v); },
      },
      {
        type:'select',
        key:'hlDefaultColor',
        label:'Default Color',
        group:'Colors',
        help:'Used as the default starting color and as the fallback when the last-used color is unavailable.',
        def:'gold',
        opts: CHUB_HL_defaultColorOpts,
        getLive() { return CHUB_HL_getPaletteConfig().defaultColor || 'gold'; },
        setLive(v) { CHUB_HL_applySetting('defaultColor', v); },
      },
      {
        type:'custom',
        key:'hlPaletteEditor',
        label:'Palette Colors',
        group:'Colors',
        help:'Edit the four primary colors and their four secondary partner colors.',
        stackBelowLabel: true,
        render() { return CHUB_HL_renderPaletteEditor(); },
      },
      {
        type:'action',
        key:'hlClearCurrentChat',
        label:'Current Chat',
        group:'Actions',
        help:'Removes every inline highlight stored for the chat you have open right now.',
        statusText:'',
        buttons: [
          {
            label:'Clear All Highlights',
            primary:true,
            action: async () => {
              if (!W.confirm('Remove all highlights from the current chat?')) return { message: 'Canceled.' };
              return CHUB_HL_clearCurrentChat();
            },
            successText:'Highlights cleared.',
            errorText:'Failed to clear highlights.',
          },
        ],
      },
    ],

    sectionBands: [
      {
        type:'select',
        key:'sbPopupMouse',
        label:'Popup Mouse',
        group:'Popup / Mouse',
        help:'Only opens on the left side of assistant sections, never elsewhere on the page.',
        def:'middle_double',
        opts: CHUB_SB_popupMouseOpts(),
        getLive() { return CHUB_SB_getBinding('popupMouse', 'middle_double'); },
        setLive(v) { CHUB_SB_setBinding('popupMouse', v); },
      },
      {
        type:'select',
        key:'sbDefaultColor',
        label:'Default Color',
        group:'Colors / Palette',
        help:'This is the first color in the loop and the default starting color.',
        def:'olive',
        opts: CHUB_SB_defaultColorOpts,
        getLive() { return CHUB_SB_getPaletteConfig().defaultKey || 'olive'; },
        setLive(v) { CHUB_SB_setPaletteConfig({ defaultKey: v }); },
      },
      {
        type:'select',
        key:'sbApplyStartMode',
        label:'Key Start Color',
        group:'Colors / Palette',
        help:'When Apply Color is used on an uncolored section, choose how the first color is picked.',
        def:'default',
        opts: CHUB_SB_applyStartOpts,
        getLive() { return CHUB_SB_getPaletteConfig().applyStartMode || 'default'; },
        setLive(v) { CHUB_SB_setPaletteConfig({ applyStartMode: v }); },
      },
      {
        type:'custom',
        key:'sbPaletteColors',
        label:'Palette Colors',
        group:'Colors / Palette',
        help:'Use the picker or type a hex code for each loop color.',
        stackBelowLabel: true,
        render(ctx) { return CHUB_SB_renderPaletteEditor(ctx); },
      },
      {
        type:'select',
        key:'sbApplyColor',
        label:'Apply Color',
        group:'Colors / Apply',
        help:'Keyboard shortcuts only act over hovered or selected assistant sections.',
        def:'space',
        opts: CHUB_SB_applyKeyOpts(),
        getLive() { return CHUB_SB_getBinding('applyColor', 'space'); },
        setLive(v) { CHUB_SB_setBinding('applyColor', v); },
      },
      {
        type:'select',
        key:'sbClearColor',
        label:'Clear Color',
        group:'Colors / Clear',
        def:'meta_or_ctrl_z',
        opts: CHUB_SB_clearKeyOpts(),
        getLive() { return CHUB_SB_getBinding('clearColor', 'meta_or_ctrl_z'); },
        setLive(v) { CHUB_SB_setBinding('clearColor', v); },
      },
      {
        type:'select',
        key:'sbRotateColor',
        label:'Rotate Colors',
        group:'Colors / Edit',
        def:'none',
        opts: CHUB_SB_repeatOpts(),
        getLive() { return CHUB_SB_getBinding('rotateColor', 'none'); },
        setLive(v) { CHUB_SB_setBinding('rotateColor', v); },
      },
      {
        type:'select',
        key:'sbIntensity',
        label:'Increase Intensity',
        group:'Colors / Edit',
        def:'arrow_ud',
        opts: CHUB_SB_repeatOpts(),
        getLive() { return CHUB_SB_getBinding('intensity', 'arrow_ud'); },
        setLive(v) { CHUB_SB_setBinding('intensity', v); },
      },
      {
        type:'select',
        key:'sbMode',
        label:'Fill / Frame',
        group:'Colors / Edit',
        def:'enter',
        opts: CHUB_SB_modeOpts(),
        getLive() { return CHUB_SB_getBinding('mode', 'enter'); },
        setLive(v) { CHUB_SB_setBinding('mode', v); },
      },
      {
        type:'select',
        key:'sbPatternPick',
        label:'Choose Pattern',
        group:'Patterns',
        def:'meta_or_ctrl_x',
        opts: CHUB_SB_patternPickOpts(),
        getLive() { return CHUB_SB_getBinding('choosePattern', 'meta_or_ctrl_x'); },
        setLive(v) { CHUB_SB_setBinding('choosePattern', v); },
      },
      {
        type:'select',
        key:'sbPatternRotate',
        label:'Rotate Pattern',
        group:'Patterns',
        def:'arrow_lr',
        opts: CHUB_SB_patternRotateOpts(),
        getLive() { return CHUB_SB_getBinding('rotatePattern', 'arrow_lr'); },
        setLive(v) { CHUB_SB_setBinding('rotatePattern', v); },
      },
    ],

    sidePanel: [
      { type:'select', key:'spPos', label:'Position', def:'right', opts:[ ['right','Right'],['left','Left'] ]},
      { type:'range', key:'spWidth', label:'Panel width', def:260, min:220, max:400, step:10, unit:'px' },
    ],

    [FEATURE_KEY_WORKSPACE_SHELF]: [
      {
        type:'custom',
        key:'workspaceShelfStatus',
        label:'Status',
        group:'Shelf',
        render() { return CHUB_WS_renderStatus(); },
      },
      {
        type:'action',
        key:'workspaceShelfActions',
        label:'Shelf',
        group:'Shelf',
        statusText:'',
        buttons:[
          { label:'Open Shelf', primary:true, action: () => CHUB_WS_openShelfAction() },
          { label:'Close', action: () => CHUB_WS_closeAction() },
        ],
      },
      {
        type:'select',
        key:'workspaceShelfDockMode',
        label:'Presentation',
        group:'Shell Mode',
        def:'overlay',
        opts:[ ['overlay','Overlay'], ['dock','Dock'] ],
        getLive() { return String(CHUB_WS_getState().dockMode || 'overlay'); },
        setLive(v) { SAFE_call('workspace.setDockMode', () => CHUB_WS_api()?.setDockMode?.(v)); CHUB_invalidateSoon(); },
      },
    ],

    [FEATURE_KEY_WORKSPACE_DRAWER]: [
      {
        type:'custom',
        key:'workspaceDrawerStatus',
        label:'Status',
        group:'Drawer',
        render() { return CHUB_WS_renderStatus(); },
      },
      {
        type:'action',
        key:'workspaceDrawerActions',
        label:'Drawer',
        group:'Drawer',
        statusText:'',
        buttons:[
          { label:'Open Drawer', primary:true, action: () => CHUB_WS_openDrawerAction() },
          { label:'Close', action: () => CHUB_WS_closeAction() },
        ],
      },
      {
        type:'select',
        key:'workspaceDrawerDockMode',
        label:'Presentation',
        group:'Shell Mode',
        def:'overlay',
        opts:[ ['overlay','Overlay'], ['dock','Dock'] ],
        getLive() { return String(CHUB_WS_getState().dockMode || 'overlay'); },
        setLive(v) { SAFE_call('workspace.setDockMode', () => CHUB_WS_api()?.setDockMode?.(v)); CHUB_invalidateSoon(); },
      },
    ],

    [FEATURE_KEY_NOTES]: [
      {
        type: 'action',
        key: 'notesLaunch',
        label: 'Notes Panel',
        group: 'Launch',
        statusText: '',
        buttons: [
          {
            label: 'Open Notes',
            primary: true,
            action: () => CHUB_NOTES_openPanel(),
            successText: 'Opened.',
            errorText: 'Open failed.',
          },
          {
            label: 'Refresh',
            action: () => CHUB_NOTES_refreshPanel(),
            successText: 'Refreshed.',
            errorText: 'Refresh failed.',
          },
        ],
      },
      {
        type: 'action',
        key: 'notesScratch',
        label: 'Scratchpad',
        group: 'Notes',
        statusText: '',
        buttons: [
          {
            label: 'Clear Scratch',
            primary: true,
            action: () => CHUB_NOTES_clearScratch(),
            successText: 'Cleared.',
            errorText: 'Scratch unavailable.',
          },
        ],
      },
      { type:'select', key:'spPos', label:'Dock Position', group:'Dock Layout', def:'right', opts:[ ['right','Right'],['left','Left'] ]},
      { type:'range', key:'spWidth', label:'Dock Width', group:'Dock Layout', def:260, min:220, max:400, step:10, unit:'px' },
    ],

    [FEATURE_KEY_STUDIO]: [
      {
        type:'custom',
        key:'studioStatus',
        label:'Status',
        group:'Studio',
        render() { return CHUB_STUDIO_renderStatus(); },
      },
      {
        type:'action',
        key:'studioOpeners',
        label:'Studio Surfaces',
        group:'Studio',
        statusText:'',
        buttons:[
          { label:'Open Studio', primary:true, action: () => CHUB_STUDIO_openWorkbenchAction() },
          { label:'Saved Chats', action: () => CHUB_STUDIO_openSavedChatsAction() },
          { label:'Latest Snapshot', action: () => CHUB_STUDIO_openReaderAction() },
        ],
      },
      {
        type:'action',
        key:'studioCapture',
        label:'Snapshots',
        group:'Snapshots',
        statusText:'',
        buttons:[
          { label:'Capture Current Chat', primary:true, action: () => CHUB_STUDIO_captureAction() },
        ],
      },
    ],

    [FEATURE_KEY_LIBRARY]: [
      {
        type:'custom',
        key:'libraryWorkspaceStatus',
        label:'Status',
        group:'Workspace',
        render() { return CHUB_LW_renderStatus(); },
      },
      {
        type:'toggle',
        key:'librarySidebarButtonVisible',
        label:'Show Library Button',
        group:'Workspace',
        help:'Show or hide the top-level Library button in the ChatGPT sidebar.',
        def:true,
        getLive() { return CHUB_LW_getLibraryButtonVisible(); },
        setLive(v) { return CHUB_LW_setLibraryButtonVisible(v); },
      },
      {
        type:'action',
        key:'libraryWorkspaceActions',
        label:'Library Workspace',
        group:'Workspace',
        statusText:'',
        buttons:[
          { label:'Open Library', primary:true, action: () => CHUB_LW_openAction() },
          { label:'Refresh', action: () => CHUB_LW_refreshAction() },
          { label:'Reset UI Prefs', action: () => CHUB_LW_resetUiAction() },
        ],
      },
      {
        type:'custom',
        key:'librarySidebarLayout',
        label:'Sidebar Sections',
        group:'Sidebar Layout',
        help:'Control which Library-related sections appear in the sidebar and the order they use.',
        stackBelowLabel:true,
        render() { return CHUB_LW_renderSidebarLayoutEditor(); },
      },
      {
        type:'custom',
        key:'libraryDiagnostics',
        label:'Diagnostics',
        group:'Diagnostics',
        render() { return CHUB_LW_renderDiagnostics(); },
      },
    ],

    projects: [      {
        type:'custom',
        key:'projectsLibraryStatus',
        label:'Projects',
        group:'Projects',
        render() {
          return CHUB_renderInfoList([
            { label:'Source', value:'Native ChatGPT Projects' },
            { label:'Library role', value:'Reference section' },
          ]);
        },
      },
      {
        type:'select',
        key:'projectInlinePreviewOnOpen',
        label:'Inline Preview on Open',
        group:'Projects',
        help:'Allow native project rows to open their inline chat preview, or send project toggle opens directly to the project surface.',
        def:'enabled',
        opts: CHUB_LIBRARY_inlinePreviewOpts,
        getLive() { return CHUB_PROJECTS_getInlinePreviewOnOpen(); },
        setLive(v) { CHUB_PROJECTS_setInlinePreviewOnOpen(v); },
      },
      {
        type:'select',
        key:'projectMoreOpenMode',
        label:'More Open Mode',
        group:'Projects',
        help:'Choose whether the native Projects More row opens the H2O projects page or keeps the native dropdown behavior.',
        def:'dropdown',
        opts: CHUB_LIBRARY_moreOpenModeOpts,
        getLive() { return CHUB_PROJECTS_getMoreOpenMode(); },
        setLive(v) { CHUB_PROJECTS_setMoreOpenMode(v); },
      },
    ],

    folders: [
      {
        type:'custom',
        key:'foldersStatus',
        label:'Status',
        group:'Folders',
        render() { return CHUB_FOLDERS_renderStatus(); },
      },
      {
        type:'toggle',
        key:'showFolderCounts',
        label:'Show Folder Counters',
        group:'Folders',
        help:'Show or hide the chat-count number displayed at the end of folder rows.',
        def:true,
        getLive() { return CHUB_FOLDERS_getShowCounts(); },
        setLive(v) { CHUB_FOLDERS_setShowCounts(v); },
      },
      {
        type:'select',
        key:'folderOpenMode',
        label:'Folder Open Mode',
        group:'Folders',
        help:'Choose whether folder rows open the full folder page view or a lighter internal panel.',
        def:'panel',
        opts: CHUB_CATEGORIES_openModeOpts,
        getLive() { return CHUB_FOLDERS_getOpenMode(); },
        setLive(v) { CHUB_FOLDERS_setOpenMode(v); },
      },
      {
        type:'select',
        key:'folderInlinePreviewOnOpen',
        label:'Inline Preview on Open',
        group:'Folders',
        help:'Allow folder rows to expand their top chat preview in the sidebar, or send row opens directly to the configured folder surface.',
        def:'enabled',
        opts: CHUB_LIBRARY_inlinePreviewOpts,
        getLive() { return CHUB_FOLDERS_getInlinePreviewOnOpen(); },
        setLive(v) { CHUB_FOLDERS_setInlinePreviewOnOpen(v); },
      },
      {
        type:'select',
        key:'folderMoreOpenMode',
        label:'More Open Mode',
        group:'Folders',
        help:'Choose whether the top-level More row opens hidden folders in a page or a dropdown.',
        def:'page',
        opts: CHUB_LIBRARY_moreOpenModeOpts,
        getLive() { return CHUB_FOLDERS_getMoreOpenMode(); },
        setLive(v) { CHUB_FOLDERS_setMoreOpenMode(v); },
      },
      {
        type:'action',
        key:'foldersActions',
        label:'Folders',
        group:'Folders',
        statusText:'',
        buttons:[
          { label:'Focus Sidebar', primary:true, action: () => CHUB_FOLDERS_focusAction() },
          { label:'Expand', action: () => CHUB_FOLDERS_setExpanded(true) },
          { label:'Collapse', action: () => CHUB_FOLDERS_setExpanded(false) },
          { label:'New Folder', action: () => CHUB_FOLDERS_newFolderAction() },
        ],
      },
    ],

    categories: [
      {
        type:'toggle',
        key:'showCategoryCounts',
        label:'Show Category Counters',
        group:'Categories',
        help:'Show or hide the chat-count number displayed at the end of category rows.',
        def:true,
        getLive() { return CHUB_CATEGORIES_getShowCounts(); },
        setLive(v) { CHUB_CATEGORIES_setShowCounts(v); },
      },
      {
        type:'select',
        key:'categoryOpenMode',
        label:'Category Open Mode',
        group:'Categories',
        help:'Choose whether category rows open the full category page view or a lighter internal panel.',
        def:'page',
        opts: CHUB_CATEGORIES_openModeOpts,
        getLive() { return CHUB_CATEGORIES_getOpenMode(); },
        setLive(v) { CHUB_CATEGORIES_setOpenMode(v); },
      },
      {
        type:'select',
        key:'categoryInlinePreviewOnOpen',
        label:'Inline Preview on Open',
        group:'Categories',
        help:'Allow category rows to expand their top chat preview in the sidebar, or send row opens directly to the configured category surface.',
        def:'enabled',
        opts: CHUB_LIBRARY_inlinePreviewOpts,
        getLive() { return CHUB_CATEGORIES_getInlinePreviewOnOpen(); },
        setLive(v) { CHUB_CATEGORIES_setInlinePreviewOnOpen(v); },
      },
      {
        type:'select',
        key:'categoryMoreOpenMode',
        label:'More Open Mode',
        group:'Categories',
        help:'Choose whether the top-level More row opens hidden categories in a page or a dropdown.',
        def:'page',
        opts: CHUB_LIBRARY_moreOpenModeOpts,
        getLive() { return CHUB_CATEGORIES_getMoreOpenMode(); },
        setLive(v) { CHUB_CATEGORIES_setMoreOpenMode(v); },
      },
    ],

    labels: [
      {
        type:'custom',
        key:'labelsStatus',
        label:'Status',
        group:'Labels',
        render() { return CHUB_LABELS_renderStatus(); },
      },
      {
        type:'toggle',
        key:'showLabelCounts',
        label:'Show Label Counters',
        group:'Labels',
        help:'Show or hide the chat-count number displayed at the end of label rows.',
        def:true,
        getLive() { return CHUB_LABELS_getShowCounts(); },
        setLive(v) { CHUB_LABELS_setShowCounts(v); },
      },
      {
        type:'select',
        key:'labelOpenMode',
        label:'Open Mode',
        group:'Labels',
        help:'Choose whether label rows open the full in-shell Labels page or a lighter floating panel.',
        def:'page',
        opts: CHUB_CATEGORIES_openModeOpts,
        getLive() { return CHUB_LABELS_getOpenMode(); },
        setLive(v) { CHUB_LABELS_setOpenMode(v); },
      },
      {
        type:'select',
        key:'labelInlinePreviewOnOpen',
        label:'Inline Preview on Open',
        group:'Labels',
        help:'Allow label rows to toggle their top matching chats inline in the sidebar, or open directly into the configured Labels surface.',
        def:'disabled',
        opts: CHUB_LIBRARY_inlinePreviewOpts,
        getLive() { return CHUB_LABELS_getInlinePreviewOnOpen(); },
        setLive(v) { CHUB_LABELS_setInlinePreviewOnOpen(v); },
      },
      {
        type:'select',
        key:'labelTypeExpandMode',
        label:'Subsection Open State',
        group:'Labels',
        help:'Choose whether Workflow, Priority, and the other Labels subsections open expanded, collapsed, or remember their previous state whenever the Labels section opens.',
        def:'remember',
        opts: CHUB_LABELS_typeExpandModeOpts,
        getLive() { return CHUB_LABELS_getTypeExpandMode(); },
        setLive(v) { CHUB_LABELS_setTypeExpandMode(v); },
      },
      {
        type:'toggle',
        key:'labelSectionWorkflow',
        label:'Show Workflow Section',
        group:'Labels',
        help:'Show or hide the Workflow subsection in the Labels sidebar section.',
        def:true,
        getLive() { return CHUB_LABELS_isTypeVisible('workflowStatus'); },
        setLive(v) { CHUB_LABELS_setTypeVisible('workflowStatus', v); },
      },
      {
        type:'toggle',
        key:'labelSectionPriority',
        label:'Show Priority Section',
        group:'Labels',
        help:'Show or hide the Priority subsection in the Labels sidebar section.',
        def:true,
        getLive() { return CHUB_LABELS_isTypeVisible('priority'); },
        setLive(v) { CHUB_LABELS_setTypeVisible('priority', v); },
      },
      {
        type:'toggle',
        key:'labelSectionFollowUp',
        label:'Show Follow-up Section',
        group:'Labels',
        help:'Show or hide the Follow-up subsection in the Labels sidebar section.',
        def:true,
        getLive() { return CHUB_LABELS_isTypeVisible('followUp'); },
        setLive(v) { CHUB_LABELS_setTypeVisible('followUp', v); },
      },
      {
        type:'toggle',
        key:'labelSectionContentType',
        label:'Show Content Type Section',
        group:'Labels',
        help:'Show or hide the Content Type subsection in the Labels sidebar section.',
        def:true,
        getLive() { return CHUB_LABELS_isTypeVisible('contentType'); },
        setLive(v) { CHUB_LABELS_setTypeVisible('contentType', v); },
      },
      {
        type:'toggle',
        key:'labelSectionContext',
        label:'Show Context Section',
        group:'Labels',
        help:'Show or hide the Context subsection in the Labels sidebar section.',
        def:true,
        getLive() { return CHUB_LABELS_isTypeVisible('context'); },
        setLive(v) { CHUB_LABELS_setTypeVisible('context', v); },
      },
      {
        type:'toggle',
        key:'labelSectionCustom',
        label:'Show Custom Section',
        group:'Labels',
        help:'Show or hide the Custom subsection in the Labels sidebar section.',
        def:true,
        getLive() { return CHUB_LABELS_isTypeVisible('custom'); },
        setLive(v) { CHUB_LABELS_setTypeVisible('custom', v); },
      },
      {
        type:'action',
        key:'labelsActions',
        label:'Labels',
        group:'Labels',
        statusText:'',
        buttons:[
          { label:'Focus Sidebar', primary:true, action: () => CHUB_LABELS_focusAction() },
          { label:'Expand', action: () => CHUB_LABELS_setExpanded(true) },
          { label:'Collapse', action: () => CHUB_LABELS_setExpanded(false) },
        ],
      },
    ],


    tags: [
      {
        type:'custom',
        key:'tagsLibraryStatus',
        label:'Tags',
        group:'Tags',
        render() { return CHUB_TAGS_renderStatus(); },
      },
      {
        type:'select',
        key:'currentChatTagMode',
        label:'Current Chat Tag Mode',
        group:'Tags',
        help:'Switch the active chat between manual tagging and automatic tagging.',
        def:'manual',
        opts: CHUB_TAGS_modeOpts,
        getLive() { return CHUB_TAGS_getMode(); },
        setLive(v) { return CHUB_TAGS_setMode(v); },
      },
    ],

    interfaceEnhancer: [
      {
        type:'custom',
        key:'interfaceState',
        label:'Interface Enhancer',
        group:'Visibility',
        render() {
          const canToggle = CHUB_VIS_hasToggle(FEATURE_KEY_INTERFACE);
          return CHUB_renderInfoList([
            { label:'State', value: canToggle ? (CHUB_VIS_isVisible(FEATURE_KEY_INTERFACE) ? 'Visible' : 'Hidden') : 'Managed externally' },
            { label:'Hint', value: canToggle ? 'Use the row switch to show or hide Interface surfaces on the page.' : 'This helper does not publish a safe page-visibility surface yet.' },
          ]);
        },
      },
    ],

    titles: [
      {
        type:'custom',
        key:'titlesState',
        label:'Titles',
        group:'Visibility',
        render() {
          const canToggle = CHUB_VIS_hasToggle(FEATURE_KEY_INTERFACE);
          return CHUB_renderInfoList([
            { label:'State', value: canToggle ? (CHUB_VIS_isVisible(FEATURE_KEY_INTERFACE) ? 'Visible' : 'Hidden') : 'Managed externally' },
            { label:'Hint', value: canToggle ? 'Use the row switch to show or hide the active title helper surface.' : 'Title helpers stay managed by their standalone scripts for now.' },
          ]);
        },
      },
      {
        type:'select',
        key:'atCollapsedTextMode',
        label:'Collapsed Title Text Color',
        group:'Titles',
        help:'Choose whether collapsed title text adapts per wash color or stays consistent across all collapsed title bars.',
        def:'adaptive',
        opts: CHUB_AT_collapsedTextModeOpts,
        getLive() { return CHUB_AT_getConfig().collapsedTextMode || 'adaptive'; },
        setLive(v) { CHUB_AT_applySetting('collapsedTextMode', v); },
      },
      {
        type:'select',
        key:'atsCollapsedHoverMode',
        label:'Collapsed Hover Timestamp',
        group:'Timestamps',
        help:'When a title bar is collapsed, choose how the timestamp appears while hovering the title bar.',
        def:'under',
        opts: CHUB_ATS_hoverModeOpts,
        getLive() { return CHUB_ATS_getConfig().collapsedHoverMode || 'under'; },
        setLive(v) { CHUB_ATS_applySetting('collapsedHoverMode', v); },
      },
    ],

    numbers: [
      {
        type:'range',
        key:'ansnNormalOpacity',
        label:'Big Number Fade',
        group:'Answers Before Collapse',
        help:'Controls how faded the expanded answer numbers look.',
        def:0.12,
        min:0.02,
        max:0.35,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_ANSN_getConfig().normalOpacity || 0.12); },
        setLive(v) { CHUB_ANSN_applySetting('normalOpacity', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnNormalLeftPx',
        label:'Big Number Left Offset',
        group:'Answers Before Collapse',
        help:'Moves the expanded answer number farther left or closer to the answer block.',
        def:-140,
        min:-260,
        max:-20,
        step:2,
        unit:'px',
        getLive() { return Number(CHUB_ANSN_getConfig().normalLeftPx || -140); },
        setLive(v) { CHUB_ANSN_applySetting('normalLeftPx', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnNormalScale',
        label:'Big Number Size',
        group:'Answers Before Collapse',
        help:'Scales the expanded answer number without changing the answer content itself.',
        def:1.00,
        min:0.55,
        max:1.35,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_ANSN_getConfig().normalScale || 1); },
        setLive(v) { CHUB_ANSN_applySetting('normalScale', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnNormalRightFadeStartPct',
        label:'Right Fade Cutoff',
        group:'Answers Before Collapse',
        help:'Moves where the right-side fade starts. Higher starts the fade later and keeps more of multi-digit values visible.',
        def:56,
        min:20,
        max:100,
        step:1,
        unit:'%',
        getLive() { return Number(CHUB_ANSN_getConfig().normalRightFadeStartPct || 56); },
        setLive(v) { CHUB_ANSN_applySetting('normalRightFadeStartPct', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnNormalRightFadeEndOpacity',
        label:'Right Fade End Opacity',
        group:'Answers Before Collapse',
        help:'Sets how visible the far-right edge remains after the fade.',
        def:0.12,
        min:0.00,
        max:1.00,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_ANSN_getConfig().normalRightFadeEndOpacity || 0.12); },
        setLive(v) { CHUB_ANSN_applySetting('normalRightFadeEndOpacity', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnCollapsedOpacity',
        label:'Big Number Fade',
        group:'Answers After Collapse',
        help:'Controls how faded the collapsed answer numbers look.',
        def:0.09,
        min:0.02,
        max:0.35,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_ANSN_getConfig().collapsedOpacity || 0.09); },
        setLive(v) { CHUB_ANSN_applySetting('collapsedOpacity', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnCollapsedLeftPx',
        label:'Big Number Left Offset',
        group:'Answers After Collapse',
        help:'Moves the collapsed answer number farther left or closer to the title list.',
        def:-132,
        min:-260,
        max:-20,
        step:2,
        unit:'px',
        getLive() { return Number(CHUB_ANSN_getConfig().collapsedLeftPx || -132); },
        setLive(v) { CHUB_ANSN_applySetting('collapsedLeftPx', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnCollapsedScale',
        label:'Big Number Size',
        group:'Answers After Collapse',
        help:'Adjusts how large the answer number remains after the title bar is collapsed.',
        def:0.42,
        min:0.20,
        max:1.10,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_ANSN_getConfig().collapsedScale || 0.42); },
        setLive(v) { CHUB_ANSN_applySetting('collapsedScale', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnCollapsedRightFadeStartPct',
        label:'Right Fade Cutoff',
        group:'Answers After Collapse',
        help:'Moves where the right-side fade starts for collapsed answer numbers.',
        def:70,
        min:20,
        max:100,
        step:1,
        unit:'%',
        getLive() { return Number(CHUB_ANSN_getConfig().collapsedRightFadeStartPct || 70); },
        setLive(v) { CHUB_ANSN_applySetting('collapsedRightFadeStartPct', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'ansnCollapsedRightFadeEndOpacity',
        label:'Right Fade End Opacity',
        group:'Answers After Collapse',
        help:'Sets how visible the far-right edge remains for collapsed answer numbers.',
        def:0.18,
        min:0.00,
        max:1.00,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_ANSN_getConfig().collapsedRightFadeEndOpacity || 0.18); },
        setLive(v) { CHUB_ANSN_applySetting('collapsedRightFadeEndOpacity', v); CHUB_ANSN_rescan(); },
      },
      {
        type:'range',
        key:'qnOpacity',
        label:'Big Number Fade',
        group:'Questions',
        help:'Controls how faded the question numbers look.',
        def:0.12,
        min:0.02,
        max:0.35,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_QN_getConfig().opacity || 0.12); },
        setLive(v) { CHUB_QN_applySetting('opacity', v); CHUB_QN_rescan(); },
      },
      {
        type:'range',
        key:'qnLeftOffsetPx',
        label:'Big Number Left Offset',
        group:'Questions',
        help:'Moves the question number farther left from the question bubble or closer to it.',
        def:14,
        min:0,
        max:120,
        step:1,
        unit:'px',
        getLive() { return Number(CHUB_QN_getConfig().leftOffsetPx || 14); },
        setLive(v) { CHUB_QN_applySetting('leftOffsetPx', v); CHUB_QN_rescan(); },
      },
      {
        type:'range',
        key:'qnScale',
        label:'Big Number Size',
        group:'Questions',
        help:'Scales the question number without changing the question bubble itself.',
        def:0.75,
        min:0.35,
        max:1.35,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_QN_getConfig().scale || 0.75); },
        setLive(v) { CHUB_QN_applySetting('scale', v); CHUB_QN_rescan(); },
      },
      {
        type:'range',
        key:'qnRightFadeStartPct',
        label:'Right Fade Cutoff',
        group:'Questions',
        help:'Moves where the right-side fade starts for question numbers.',
        def:60,
        min:20,
        max:100,
        step:1,
        unit:'%',
        getLive() { return Number(CHUB_QN_getConfig().rightFadeStartPct || 60); },
        setLive(v) { CHUB_QN_applySetting('rightFadeStartPct', v); CHUB_QN_rescan(); },
      },
      {
        type:'range',
        key:'qnRightFadeEndOpacity',
        label:'Right Fade End Opacity',
        group:'Questions',
        help:'Sets how visible the far-right edge remains for question numbers.',
        def:0.18,
        min:0.00,
        max:1.00,
        step:0.01,
        unit:'',
        getLive() { return Number(CHUB_QN_getConfig().rightFadeEndOpacity || 0.18); },
        setLive(v) { CHUB_QN_applySetting('rightFadeEndOpacity', v); CHUB_QN_rescan(); },
      },
    ],

    themesPanel: [
      {
        type:'select',
        key:'chubButtonAccent',
        label:'Button Accent',
        group:'Control Hub Colors',
        help:'Changes the Control Hub action buttons and on-state switches.',
        def:'default',
        opts: CHUB_BUTTON_ACCENT_opts,
        getLive() { return CHUB_BUTTON_ACCENT_get(); },
        setLive(v) { return CHUB_BUTTON_ACCENT_set(v); },
      },
      {
        type:'select',
        key:'chubNavAccent',
        label:'Tab/List Accent',
        group:'Control Hub Colors',
        help:'Changes main tabs, feature list selection, category rail, and subtabs.',
        def:'default',
        opts: CHUB_NAV_ACCENT_opts,
        getLive() { return CHUB_NAV_ACCENT_get(); },
        setLive(v) { return CHUB_NAV_ACCENT_set(v); },
      },
      {
        type:'select',
        key:'chubSurfaceAccent',
        label:'Detail Background',
        group:'Control Hub Colors',
        help:'Changes the Control Hub panel and right detail column background.',
        def:'default',
        opts: CHUB_SURFACE_ACCENT_opts,
        getLive() { return CHUB_SURFACE_ACCENT_get(); },
        setLive(v) { return CHUB_SURFACE_ACCENT_set(v); },
      },
      { type:'select', key:'thPreset', label:'Preset', group:'Themes Panel', def:'system', opts:[ ['system','System'], ['darkMatte','Dark Matte'], ['neon','Neon'] ]},
    ],

    saveExport: [
      { type:'select', key:'svFormat', label:'Default format', def:'markdown', opts:[ ['markdown','Markdown'], ['html','HTML'], ['onenote','OneNote (future)'] ]},
      { type:'toggle', key:'svAutoDl', label:'Auto-download', def:false },
    ],

    commandBar: [
      {
        type:'select',
        key:'cbTabPlacement',
        label:'Launcher Tab Side',
        group:'Launcher Tab',
        help:'Choose whether the Command Bar tab lives on the right edge of the page or on the right edge of the sidebar.',
        def:'page-right',
        opts: CHUB_EDGE_tabPlacementOpts,
        getLive() { return CHUB_CB_getTabPlacement(); },
        setLive(v) { CHUB_CB_setTabPlacement(v); },
      },
    ],

    actionPanel: [
      {
        type:'select',
        key:'sapTabPlacement',
        label:'Launcher Tab Side',
        group:'Launcher Tab',
        help:'Choose whether the Action Panel tab lives on the right edge of the page or on the right edge of the sidebar.',
        def:'page-right',
        opts: CHUB_EDGE_tabPlacementOpts,
        getLive() { return CHUB_SAP_getTabPlacement(); },
        setLive(v) { CHUB_SAP_setTabPlacement(v); },
      },
    ],

    controlHub: [
      {
        type: 'select',
        key: 'hubOpenTrigger',
        label: 'Open Control Hub',
        group: 'Launcher / Gestures',
        help: 'Choose which Cockpit button gesture toggles the main Control Hub panel.',
        def: CHUB_UI_DEFAULTS.hubOpenTrigger,
        opts: CHUB_UI_triggerOpts,
        getLive() { return CHUB_UI_get('hubOpenTrigger'); },
        setLive(v) { CHUB_UI_set('hubOpenTrigger', v); },
      },
      {
        type: 'select',
        key: 'treeOpenTrigger',
        label: 'Open Tab Tree',
        group: 'Launcher / Gestures',
        help: 'If this matches the hub trigger, the Control Hub opens first and the Tab Tree uses the same gesture once the hub is already open.',
        def: CHUB_UI_DEFAULTS.treeOpenTrigger,
        opts: CHUB_UI_triggerOpts,
        getLive() { return CHUB_UI_get('treeOpenTrigger'); },
        setLive(v) { CHUB_UI_set('treeOpenTrigger', v); },
      },
      {
        type: 'select',
        key: 'treeCloseBehavior',
        label: 'Tab Tree Visibility',
        group: 'Tab Tree',
        help: 'Keep the Tab Tree up until you toggle it from the Cockpit button again, or let outside clicks dismiss it.',
        def: CHUB_UI_DEFAULTS.treeCloseBehavior,
        opts: CHUB_UI_treeVisibilityOpts,
        getLive() { return CHUB_UI_get('treeCloseBehavior'); },
        setLive(v) { CHUB_UI_set('treeCloseBehavior', v); },
      },
      {
        type: 'select',
        key: 'hubReopenTarget',
        label: 'When Hub Opens Again',
        group: 'Open Behavior',
        help: 'Choose whether reopening Control Hub shows the last opened main feature tab, the first visible tab in the feature list, or the Control tab.',
        def: CHUB_UI_DEFAULTS.hubReopenTarget,
        opts: CHUB_UI_reopenTargetOpts,
        getLive() { return CHUB_UI_get('hubReopenTarget'); },
        setLive(v) { CHUB_UI_set('hubReopenTarget', v); },
      },
      {
        type: 'range',
        key: 'panelWidthPx',
        label: 'Panel Width',
        group: 'Size / Layout',
        help: 'Overall width cap for the Control Hub shell.',
        def: CHUB_UI_DEFAULTS.panelWidthPx,
        min: CHUB_UI_LIMITS.panelWidthPx[0],
        max: CHUB_UI_LIMITS.panelWidthPx[1],
        step: 10,
        unit: 'px',
        getLive() { return CHUB_UI_get('panelWidthPx'); },
        setLive(v) { CHUB_UI_set('panelWidthPx', v); },
      },
      {
        type: 'range',
        key: 'panelMaxHeightPx',
        label: 'Panel Height',
        group: 'Size / Layout',
        help: 'Maximum height for the Control Hub shell before the inner areas scroll.',
        def: CHUB_UI_DEFAULTS.panelMaxHeightPx,
        min: CHUB_UI_LIMITS.panelMaxHeightPx[0],
        max: CHUB_UI_LIMITS.panelMaxHeightPx[1],
        step: 10,
        unit: 'px',
        getLive() { return CHUB_UI_get('panelMaxHeightPx'); },
        setLive(v) { CHUB_UI_set('panelMaxHeightPx', v); },
      },
      {
        type: 'range',
        key: 'listWidthPx',
        label: 'Feature List Width',
        group: 'Size / Layout',
        help: 'Width of the left feature list column.',
        def: CHUB_UI_DEFAULTS.listWidthPx,
        min: CHUB_UI_LIMITS.listWidthPx[0],
        max: CHUB_UI_LIMITS.listWidthPx[1],
        step: 10,
        unit: 'px',
        getLive() { return CHUB_UI_get('listWidthPx'); },
        setLive(v) { CHUB_UI_set('listWidthPx', v); },
      },
      {
        type: 'range',
        key: 'detailMinWidthPx',
        label: 'Right Pane Min Width',
        group: 'Size / Layout',
        help: 'When the window gets narrower than this, the right pane scrolls horizontally instead of squeezing the controls.',
        def: CHUB_UI_DEFAULTS.detailMinWidthPx,
        min: CHUB_UI_LIMITS.detailMinWidthPx[0],
        max: CHUB_UI_LIMITS.detailMinWidthPx[1],
        step: 10,
        unit: 'px',
        getLive() { return CHUB_UI_get('detailMinWidthPx'); },
        setLive(v) { CHUB_UI_set('detailMinWidthPx', v); },
      },
      {
        type: 'custom',
        key: 'mainTabOrderEditor',
        label: 'Main Tab Order',
        group: 'Feature List',
        help: 'Change the order of the main feature tabs shown in the left Control Hub list.',
        stackBelowLabel: true,
        render({ panel }) { return CHUB_MAIN_TAB_renderEditor(panel); },
      },
    ],


    questions: [
      {
        type: 'select',
        key: 'qwrap_quote_mode',
        label: 'Quote Bubble Position',
        def: 'inside',
        opts: [['inside','Inside (default)'], ['outside','Outside (above)']],
        getLive() { return (W.H2O_QWRAP?.getQuoteMode?.() || 'inside'); },
        setLive(v) { W.H2O_QWRAP?.setQuoteMode?.(v); },
      },
    ],
  };

	  const FEATURE_ALIASES = {
	    sidePanel: 'dockPanel',
	  };

	  const FEATURE_CHAT_NAVIGATION_SUBTABS = Object.freeze([
	    'minimap',
	    FEATURE_KEY_CHAT_ANSWERS,
	    'questions',
	  ]);

	  const FEATURE_ANNOTATIONS_SUBTABS = Object.freeze([
	    'marginAnchor',
	    FEATURE_KEY_NOTES,
	  ]);

	  const FEATURE_MARKUP_SUBTABS = Object.freeze([
	    'inlineHighlighter',
	    FEATURE_KEY_SECTION_BANDS,
	  ]);

	  const FEATURE_WORKSPACE_SUBTABS = Object.freeze([
	    FEATURE_KEY_WORKSPACE_SHELF,
	    FEATURE_KEY_WORKSPACE_DRAWER,
	  ]);	  const FEATURE_INTERFACE_SUBTABS = Object.freeze([
	    'interfaceEnhancer',
	    'titles',
	    'numbers',
	  ]);

	  const FEATURE_CHAT_PERFORMANCE_SUBTABS = Object.freeze([
	    'chatMechanisms',
	    'unmountMessages',
	    'paginationWindowing',
	  ]);

		  const FEATURE_CONTROL_SUBTABS = Object.freeze([
		    FEATURE_KEY_CONTROL_HUB,
		    FEATURE_KEY_COMMAND_BAR,
		    FEATURE_KEY_ACTION_PANEL,
		  ]);

		  const FEATURE_LIBRARY_SUBTABS = Object.freeze([
		    FEATURE_KEY_LIBRARY,
		    FEATURE_KEY_LIBRARY_PROJECTS,
		    'folders',
		    FEATURE_KEY_LIBRARY_CATEGORIES,
		    FEATURE_KEY_LIBRARY_LABELS,
		    FEATURE_KEY_LIBRARY_TAGS,
		  ]);

	  function CAT_forFeatureKey(featureKey){
	    const k = FEATURE_getCanonicalKey(featureKey);
	    // Navigate
	    if (k === FEATURE_KEY_CHAT_NAVIGATION || k === FEATURE_KEY_ANNOTATIONS || k === 'minimap' || k === FEATURE_KEY_CHAT_ANSWERS || k === 'questions' || k === 'marginAnchor' || k === FEATURE_KEY_NOTES || k === 'dockPanel') return CAT_NAV;
	    // Mark & Read
	    if (k === FEATURE_KEY_MARKUP || k === FEATURE_KEY_PROMPT_MANAGER || k === FEATURE_KEY_INTERFACE || k === 'inlineHighlighter' || k === 'sectionBands' || k === 'interfaceEnhancer' || k === 'titles' || k === 'numbers') return CAT_MARK;
	    // Save & Sync
    if (k === FEATURE_KEY_ACCOUNT || k === FEATURE_KEY_WORKSPACE || k === FEATURE_KEY_WORKSPACE_SHELF || k === FEATURE_KEY_WORKSPACE_DRAWER || k === FEATURE_KEY_DATA_BACKUP || k === FEATURE_KEY_EXPORT || k === FEATURE_KEY_STUDIO || k === FEATURE_KEY_LIBRARY || k === 'saveExport' || k === 'data' || k === FEATURE_KEY_LIBRARY_PROJECTS || k === 'folders' || k === FEATURE_KEY_LIBRARY_CATEGORIES || k === FEATURE_KEY_LIBRARY_LABELS || k === FEATURE_KEY_LIBRARY_TAGS) return CAT_SAVE;
	    // Performance & Look
	    if (k === FEATURE_KEY_CONTROL || k === FEATURE_KEY_CONTROL_HUB || k === FEATURE_KEY_COMMAND_BAR || k === FEATURE_KEY_ACTION_PANEL || k === FEATURE_KEY_CHAT_PERFORMANCE || k === FEATURE_KEY_THEMES || k === 'chatMechanisms' || k === 'unmountMessages' || k === 'paginationWindowing' || k === 'themesPanel') return CAT_PERF;
	    return CAT_ALL;
	  }

  function CAT_setCurrent(id){
    const next = FEATURE_CATS.some(x => x.id === id) ? id : CAT_ALL;
    STATE_CH.curCat = next;
    try { UTIL_storage.setStr(KEY_CHUB_FEATCAT_V1, next); } catch {}
  }

  function CAT_loadCurrent(){
    const raw = UTIL_storage.getStr(KEY_CHUB_FEATCAT_V1, CAT_ALL);
    return FEATURE_CATS.some(x => x.id === raw) ? raw : CAT_ALL;
  }

	  function FEATURE_getCanonicalKey(key){
	    if (!key) return '';
	    return FEATURE_ALIASES[key] || key;
	  }

	  function FEATURE_getHubKey(key){
	    const canonical = FEATURE_getCanonicalKey(key);
	    if (FEATURE_CONTROL_SUBTABS.includes(canonical)) return FEATURE_KEY_CONTROL;
    if (FEATURE_CHAT_PERFORMANCE_SUBTABS.includes(canonical)) return FEATURE_KEY_CHAT_PERFORMANCE;
	    if (FEATURE_CHAT_NAVIGATION_SUBTABS.includes(canonical)) return FEATURE_KEY_CHAT_NAVIGATION;
	    if (FEATURE_ANNOTATIONS_SUBTABS.includes(canonical)) return FEATURE_KEY_ANNOTATIONS;
		    if (FEATURE_MARKUP_SUBTABS.includes(canonical)) return FEATURE_KEY_MARKUP;
		    if (FEATURE_WORKSPACE_SUBTABS.includes(canonical)) return FEATURE_KEY_WORKSPACE;
		    if (FEATURE_INTERFACE_SUBTABS.includes(canonical)) return FEATURE_KEY_INTERFACE;
		    if (FEATURE_LIBRARY_SUBTABS.includes(canonical)) return FEATURE_KEY_LIBRARY;
		    if (canonical === 'data') return FEATURE_KEY_DATA_BACKUP;
		    if (canonical === 'saveExport') return FEATURE_KEY_EXPORT;
		    if (canonical === 'themesPanel') return FEATURE_KEY_THEMES;
		    return canonical;
		  }

	  function FEATURE_getDetailKey(key){
	    const canonical = FEATURE_getCanonicalKey(key);
	    if (canonical === FEATURE_KEY_CONTROL) return CHUB_CONTROL_getActiveFeatureKey();
    if (canonical === FEATURE_KEY_CHAT_PERFORMANCE) return CHUB_CHAT_PERF_getActiveFeatureKey();
	    if (canonical === FEATURE_KEY_CHAT_NAVIGATION) return CHUB_CHAT_NAV_getActiveFeatureKey();
	    if (canonical === FEATURE_KEY_ANNOTATIONS) return CHUB_ANNOTATIONS_getActiveFeatureKey();
	    if (canonical === FEATURE_KEY_MARKUP) return CHUB_MARKUP_getActiveFeatureKey();
		    if (canonical === FEATURE_KEY_WORKSPACE) return CHUB_WORKSPACE_getActiveFeatureKey();
		    if (canonical === FEATURE_KEY_INTERFACE) return CHUB_INTERFACE_getActiveFeatureKey();
		    if (canonical === FEATURE_KEY_LIBRARY) return CHUB_LIBRARY_getActiveFeatureKey();
		    if (canonical === FEATURE_KEY_DATA_BACKUP) return 'data';
		    if (canonical === FEATURE_KEY_EXPORT) return 'saveExport';
		    if (canonical === FEATURE_KEY_THEMES) return 'themesPanel';
		    return canonical;
		  }

	  function FEATURE_getConfigKey(key){
	    const detailKey = FEATURE_getDetailKey(key);
	    if (detailKey === FEATURE_KEY_CHAT_ANSWERS) return 'minimap';
    if (detailKey === FEATURE_KEY_COMMAND_BAR) return FEATURE_KEY_COMMAND_BAR;
    if (detailKey === FEATURE_KEY_ACTION_PANEL) return FEATURE_KEY_ACTION_PANEL;
	    if (detailKey === FEATURE_KEY_NOTES) return 'dockPanel';
	    if (detailKey === FEATURE_KEY_WORKSPACE_SHELF || detailKey === FEATURE_KEY_WORKSPACE_DRAWER) return FEATURE_KEY_WORKSPACE;
	    return detailKey;
	  }

	  function FEATURE_getActiveMeta(key){
	    const detailKey = FEATURE_getDetailKey(key);
	    return FEATURE_META.find((meta) => meta.key === detailKey) || null;
	  }

	  function FEATURE_hasSubtabs(key){
	    const canonical = FEATURE_getCanonicalKey(key);
	    return canonical === FEATURE_KEY_CONTROL
      || canonical === FEATURE_KEY_CHAT_PERFORMANCE
	      || canonical === FEATURE_KEY_CHAT_NAVIGATION
	      || canonical === FEATURE_KEY_ANNOTATIONS
		      || canonical === FEATURE_KEY_MARKUP
		      || canonical === FEATURE_KEY_WORKSPACE
		      || canonical === FEATURE_KEY_INTERFACE
		      || canonical === FEATURE_KEY_LIBRARY;
		  }

  function FEATURE_getAliasControlDefs(targetKey){
    const defs = [];
    if (!targetKey) return defs;
    for (const [alias, dest] of Object.entries(FEATURE_ALIASES)){
      if (dest !== targetKey) continue;
      const aliasDefs = FEATURE_CONTROLS?.[alias];
      if (Array.isArray(aliasDefs) && aliasDefs.length) defs.push(...aliasDefs);
    }
    return defs;
  }

  function FEATURE_collectControlsForKey(canonical){
    const baseDefs = FEATURE_CONTROLS?.[canonical];
    const aliasDefs = FEATURE_getAliasControlDefs(canonical);
    const plugDefs  = PLUG_getControlsForKey(canonical);
    if ((!Array.isArray(baseDefs) || !baseDefs.length) && (!Array.isArray(aliasDefs) || !aliasDefs.length) && (!Array.isArray(plugDefs) || !plugDefs.length)) return [];
    return [
      ...(Array.isArray(baseDefs) ? baseDefs : []),
      ...(Array.isArray(aliasDefs) ? aliasDefs : []),
      ...(Array.isArray(plugDefs) ? plugDefs : []),
    ];
  }

	  function FEATURE_getControlsForKey(key){
	    const resolved = FEATURE_getDetailKey(key);
	    return FEATURE_collectControlsForKey(resolved);
	  }

  /* ───────────────────────────── 🌲 SEL — SELECTOR REGISTRY 📄🔒💧 ───────────────────────────── */

  // Owned nodes (prefer data-cgxui + owner)
  const SEL_CHUB_TOPBTN   = `[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  const SEL_CHUB_BACKDROP = `[${ATTR_CGXUI}="${UI_CHUB_BACKDROP}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  const SEL_CHUB_PANEL    = `[${ATTR_CGXUI}="${UI_CHUB_PANEL}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  const SEL_CHUB_DOCK     = `[${ATTR_CGXUI}="${UI_CHUB_DOCK}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

  // Inside panel selectors (scoped by owned panel root)
  const SEL_CHUB_XBTN       = `${SEL_CHUB_PANEL} .${CLS}-x`;
  const SEL_CHUB_TABS       = `${SEL_CHUB_PANEL} .${CLS}-tabs`;
  const SEL_CHUB_LIST       = `${SEL_CHUB_PANEL} .${CLS}-list`;
  const SEL_CHUB_DETAIL     = `${SEL_CHUB_PANEL} .${CLS}-detail`;

  const SEL_CHUB_PILL       = `${SEL_CHUB_PANEL} .${CLS}-pill`;
  const SEL_CHUB_FNAME      = `${SEL_CHUB_PANEL} .${CLS}-fn`;
  const SEL_CHUB_FSUB       = `${SEL_CHUB_PANEL} .${CLS}-fs`;
  const SEL_CHUB_BODY       = `${SEL_CHUB_PANEL} .${CLS}-body`;

  // Legacy/host buttons (read-only selection; not owned)

  /* ───────────────────────────── 🧊 GLASSY / FROSTED FLOATING PANEL (ADD) ─────────────────────────────
   * Purpose:
   *  - Create ONE glassy palette-like container (hidden by default)
   *  - Provide tiny show()/hide() helpers (display + opacity fade)
   * Notes:
   *  - No swatches, no logic. Just the panel + helpers.
   *  - Styling matches your spec exactly (rgba + blur + border + shadow).
   */

  /** @glassy */
  function CHUB_createGlassyPanel() {
    const ID = `cgxui-${SkID}-glassy-palette`;
    let el = D.getElementById(ID);
    if (el) return el;

    el = D.createElement('div');
    el.id = ID;

    // Optional: keep it "owned" for debugging / cleanup consistency
    el.setAttribute(ATTR_CGXUI, `${SkID}-glassy-palette`);
    el.setAttribute(ATTR_CGXUI_OWNER, SkID);

    // ✅ EXACT glassy styling
    el.style.position = 'fixed';
    el.style.zIndex = '999999';
    el.style.display = 'none';
    el.style.opacity = '0';
    el.style.width = '115px';
    el.style.height = '65px';
    el.style.boxSizing = 'border-box';
    el.style.borderRadius = '12px';
    el.style.background = 'rgba(255,255,255,0.04)';
    el.style.backdropFilter = 'blur(8px)';
    el.style.webkitBackdropFilter = 'blur(8px)';
    el.style.border = '1px solid rgba(255,255,255,0.06)';
    el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
    el.style.transition = 'opacity 0.15s ease';

    D.body.appendChild(el);
    return el;
  }

  /** @glassy */
  function CHUB_glassyShow(x, y) {
    const el = CHUB_createGlassyPanel();
    if (Number.isFinite(x)) el.style.left = `${Math.round(x)}px`;
    if (Number.isFinite(y)) el.style.top  = `${Math.round(y)}px`;

    el.style.display = 'flex';
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    return el;
  }

  /** @glassy */
  function CHUB_glassyHide() {
    const el = CHUB_createGlassyPanel();
    el.style.opacity = '0';
    W.setTimeout(() => { el.style.display = 'none'; }, 160);
    return el;
  }

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */

  const UTIL_storage = {
    getStr(key, fallback=null){ try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setStr(key, val){ try { localStorage.setItem(key, String(val)); return true; } catch { return false; } },
    getJSON(key, fallback=null){
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj){ try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; } },
    del(key){ try { localStorage.removeItem(key); return true; } catch { return false; } },
  };

  function UTIL_clampNum(raw, min, max, fallback=min){
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function CHUB_UI_triggerOpts(){
    return CHUB_TRIGGER_OPTIONS.slice();
  }

  function CHUB_UI_treeVisibilityOpts(){
    return CHUB_TREE_VISIBILITY_OPTIONS.slice();
  }

  function CHUB_UI_reopenTargetOpts(){
    return CHUB_REOPEN_TARGET_OPTIONS.slice();
  }

  function CHUB_UI_normalizeTrigger(raw, fallback){
    const next = String(raw || fallback || '').trim();
    return CHUB_TRIGGER_VALUES.includes(next) ? next : fallback;
  }

  function CHUB_UI_normalizeCloseBehavior(raw){
    return String(raw || '') === 'toggle_button' ? 'toggle_button' : 'outside_click';
  }

  function CHUB_UI_normalizeReopenTarget(raw){
    const next = String(raw || '').trim();
    return CHUB_REOPEN_TARGET_OPTIONS.some(([value]) => value === next) ? next : CHUB_UI_DEFAULTS.hubReopenTarget;
  }

  function CHUB_UI_normalize(raw){
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      ...CHUB_UI_DEFAULTS,
      hubOpenTrigger: CHUB_UI_normalizeTrigger(src.hubOpenTrigger, CHUB_UI_DEFAULTS.hubOpenTrigger),
      treeOpenTrigger: CHUB_UI_normalizeTrigger(src.treeOpenTrigger, CHUB_UI_DEFAULTS.treeOpenTrigger),
      treeCloseBehavior: CHUB_UI_normalizeCloseBehavior(src.treeCloseBehavior),
      hubReopenTarget: CHUB_UI_normalizeReopenTarget(src.hubReopenTarget),
      panelWidthPx: UTIL_clampNum(src.panelWidthPx, CHUB_UI_LIMITS.panelWidthPx[0], CHUB_UI_LIMITS.panelWidthPx[1], CHUB_UI_DEFAULTS.panelWidthPx),
      panelMaxHeightPx: UTIL_clampNum(src.panelMaxHeightPx, CHUB_UI_LIMITS.panelMaxHeightPx[0], CHUB_UI_LIMITS.panelMaxHeightPx[1], CHUB_UI_DEFAULTS.panelMaxHeightPx),
      listWidthPx: UTIL_clampNum(src.listWidthPx, CHUB_UI_LIMITS.listWidthPx[0], CHUB_UI_LIMITS.listWidthPx[1], CHUB_UI_DEFAULTS.listWidthPx),
      detailMinWidthPx: UTIL_clampNum(src.detailMinWidthPx, CHUB_UI_LIMITS.detailMinWidthPx[0], CHUB_UI_LIMITS.detailMinWidthPx[1], CHUB_UI_DEFAULTS.detailMinWidthPx),
    };
  }

  function CHUB_UI_load(){
    return CHUB_UI_normalize(UTIL_storage.getJSON(KEY_CHUB_CFG_UI_V1, {}) || {});
  }

  function CHUB_UI_getConfig(){
    STATE_CH.uiCfg = CHUB_UI_normalize(STATE_CH.uiCfg || CHUB_UI_load());
    return { ...STATE_CH.uiCfg };
  }

  function CHUB_UI_get(key){
    return CHUB_UI_getConfig()?.[key];
  }

  function CHUB_UI_save(next){
    const normalized = CHUB_UI_normalize(next);
    STATE_CH.uiCfg = normalized;
    UTIL_storage.setJSON(KEY_CHUB_CFG_UI_V1, normalized);
    return normalized;
  }

  function CHUB_UI_applyRuntime(changedKey=''){
    CSS_CH_ensureStyle();
    CHUB_TREE_applySetting('closeBehavior', CHUB_UI_get('treeCloseBehavior'));
    if (changedKey) UTIL_emit(EV_CHUB_CHANGED_V1, { action: 'ui-setting', key: changedKey, value: CHUB_UI_get(changedKey) });
  }

  function CHUB_UI_set(key, value){
    const next = CHUB_UI_save({ ...CHUB_UI_getConfig(), [key]: value });
    CHUB_UI_applyRuntime(key);
    return next?.[key];
  }

  function UTIL_capPush(arr, item, max){
    try {
      arr.push(item);
      if (arr.length > max) arr.splice(0, arr.length - max);
    } catch {}
  }
  function DIAG_step(msg, extra){
    UTIL_capPush(DIAG.steps, { t: Math.round(performance.now() - DIAG.t0), msg, extra: extra ? String(extra) : undefined }, DIAG.bufMax);
  }
  function DIAG_err(msg, err){
    UTIL_capPush(DIAG.errors, { t: Math.round(performance.now() - DIAG.t0), msg, err: String(err?.stack || err || '') }, DIAG.errMax);
  }

  function UTIL_q(sel, root=D){ try { return root.querySelector(sel); } catch { return null; } }
  function UTIL_qAll(sel, root=D){ try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } }

  function UTIL_isFn(x){ return typeof x === 'function'; }

  function UTIL_emit(topic, detail){
    try { W.dispatchEvent(new CustomEvent(topic, { detail })); } catch {}
  }

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE_CH = MOD_OBJ.state = MOD_OBJ.state || {
    booted: false,
    _booting: false,
    curMode: 'default',
    curKey: FEATURE_KEY_CONTROL,
    curCat: CAT_ALL,
    cleanups: [],
    sectionBandsBtn: null,
    sectionBandsBtnListener: null,
    plugins: new Map(),
    buttonRepairTimer: null,
    uiCfg: null,
    topBtnGestureTimers: Object.create(null),
    panelResizeSize: null,
  };
  STATE_CH.plugins = STATE_CH.plugins || new Map();
  STATE_CH.topBtnGestureTimers = STATE_CH.topBtnGestureTimers || Object.create(null);

  function CLEAN_add(fn){
    if (!UTIL_isFn(fn)) return;
    STATE_CH.cleanups.push(fn);
  }
  function CLEAN_runAll(){
    const list = STATE_CH.cleanups.splice(0);
    for (let i = list.length - 1; i >= 0; i--){
      try { list[i](); } catch (e) { DIAG_err('dispose cleanup failed', e); }
    }
  }

  /* ───────────────────────────── 🟤 VERIFY/SAFETY — GUARDS 📝🔓💧 ───────────────────────────── */

  function SAFE_call(label, fn){
    try { return fn(); } catch (e) { DIAG_err(label, e); return undefined; }
  }
  /* ───────────────────────────── 🔌 PLUGINS — REGISTRY / HOOKS ───────────────────────────── */

  function PLUG_skin(){
    return {
      SkID,
      CLS,
      ATTR_CGXUI,
      ATTR_CGXUI_OWNER,
      UI_CHUB_PANEL,
      UI_CHUB_BTN,
      panelSel: SEL_CHUB_PANEL,
      bodySel: `.${CLS}-body`,
    };
  }

  function PLUG_get(key){
    const canonical = FEATURE_getCanonicalKey(key);
    return STATE_CH.plugins.get(canonical) || null;
  }

  function PLUG_register(spec){
    if (!spec || !spec.key) return false;
    const canonical = FEATURE_getCanonicalKey(spec.key);
    STATE_CH.plugins.set(canonical, spec);

    const cssText = (typeof spec.cssText === 'function') ? spec.cssText(PLUG_skin()) : spec.cssText;
    if (cssText && typeof cssText === 'string') {
      const styleId = `cgxui-${SkID}-plugin-${canonical}`;
      let styleEl = D.getElementById(styleId);
      if (!styleEl) {
        styleEl = D.createElement('style');
        styleEl.id = styleId;
        styleEl.setAttribute(ATTR_CGXUI_OWNER, SkID);
        D.head.appendChild(styleEl);
        CLEAN_add(() => { try { styleEl.remove(); } catch {} });
      }
      if (styleEl.textContent !== cssText) styleEl.textContent = cssText;
    }

    return true;
  }

  function PLUG_unregister(key){
    const canonical = FEATURE_getCanonicalKey(key);
    STATE_CH.plugins.delete(canonical);
    const styleId = `cgxui-${SkID}-plugin-${canonical}`;
    const s = D.getElementById(styleId);
    if (s) try { s.remove(); } catch {}
    return true;
  }

  function PLUG_getControlsForKey(key){
    const p = PLUG_get(key);
    if (!p) return [];
    const fn = p.getControls || p.controls;
    if (!fn) return [];
    return SAFE_call(`plugin.getControls:${String(p.key || key)}`, () => {
      const out = (typeof fn === 'function') ? fn({ key, mode: STATE_CH.curMode, skin: PLUG_skin() }) : fn;
      return Array.isArray(out) ? out : [];
    }) || [];
  }

  function PLUG_runDetailHook(key, panel){
    const p = PLUG_get(key);
    const fn = p?.detailHook || p?.renderDetail || null;
    if (!fn) return;
    SAFE_call(`plugin.detailHook:${String(p.key || key)}`, () => fn({ key, panel, mode: STATE_CH.curMode, skin: PLUG_skin() }));
  }

  function PLUG_afterAction(key, panel){
    const p = PLUG_get(key);
    const fn = p?.afterAction || null;
    if (!fn) return;
    SAFE_call(`plugin.afterAction:${String(p.key || key)}`, () => fn({ key, panel, mode: STATE_CH.curMode, skin: PLUG_skin() }));
  }

  function CORE_CH_invalidate(){
    const panel = UTIL_q(SEL_CHUB_PANEL);
    if (!panel) return;
    const visible = panel.getAttribute('aria-hidden') !== 'true' && !panel.hasAttribute('hidden');
    if (!visible) return;
    ENGINE_renderTabs(panel);
    ENGINE_renderList(panel);
    ENGINE_renderDetail(panel);
    ENGINE_renderControls(panel);
  }

  function ENGINE_parseActionMessage(result, fallback=''){
    if (!result) return fallback || '';
    if (typeof result === 'string') return result;
    if (typeof result === 'object') {
      if (result.msg) return result.msg;
      if (result.message) return result.message;
      if (result.text) return result.text;
      if (result.error) return String(result.error);
    }
    return fallback || '';
  }

  function SAFE_features(){
    if (!W.h2oConfig && !W.hoConfig) {
      const base = {};
      W.h2oConfig = base;
      W.hoConfig = base;
    } else if (!W.h2oConfig) {
      W.h2oConfig = W.hoConfig;
    } else if (!W.hoConfig) {
      W.hoConfig = W.h2oConfig;
    }

    const host = W.h2oConfig;
    const features = host.features || W.hoConfig.features || {};
    host.features = features;
    W.hoConfig.features = features;

    return features;
  }

	  function SAFE_getCfg(key){
	    const F = SAFE_features();
	    const resolvedKey = FEATURE_getConfigKey(key);
	    return F?.[resolvedKey] || null;
	  }

  function SAFE_setMode(key, mode){
    const c = SAFE_getCfg(key);
    if (c && typeof c.setMode === 'function') SAFE_call('feature.setMode()', () => c.setMode(mode));
  }

	  function SAFE_getDesc(key, mode){
	    const canonicalKey = FEATURE_getCanonicalKey(key);
	    const resolvedKey = FEATURE_getDetailKey(key);
	    const c = SAFE_getCfg(key);
	    if (resolvedKey !== FEATURE_KEY_CHAT_ANSWERS && resolvedKey !== FEATURE_KEY_NOTES && c && typeof c.getSummary === 'function') {
	      const t = SAFE_call('feature.getSummary()', () => c.getSummary(mode));
	      if (t) return String(t);
	    }
	    const meta = (canonicalKey !== resolvedKey && !FEATURE_hasSubtabs(canonicalKey))
	      ? (FEATURE_META.find(x => x.key === canonicalKey) || FEATURE_META.find(x => x.key === resolvedKey))
	      : (FEATURE_META.find(x => x.key === resolvedKey) || FEATURE_META.find(x => x.key === canonicalKey));
	    return (meta?.description?.[mode]) || '';
	  }

	  function CHUB_mountFeatureSubtabs(panel, {
	    keys = [],
	    getSubtabMeta = () => null,
	    getActiveKey = () => '',
	    setActiveKey = () => '',
	  } = {}) {
	    if (!panel) return;
	    const body = UTIL_q(`.${CLS}-body`, panel);
	    if (!body) return;

	    let bar = UTIL_q(`.${CLS}-hub-subtabs`, panel);
	    if (!bar) {
	      bar = D.createElement('div');
	      bar.className = `${CLS}-hub-subtabs`;
	      bar.setAttribute(ATTR_CHUB_ART, '1');
	      body.appendChild(bar);
	    }

	    bar.textContent = '';
	    const activeKey = getActiveKey();
	    for (const key of keys) {
	      const meta = getSubtabMeta(key);
	      if (!meta) continue;

	      const btn = D.createElement('button');
	      btn.type = 'button';
	      btn.className = `${CLS}-hub-subtab`;
	      btn.setAttribute('data-subtab', key);
	      btn.setAttribute('aria-pressed', key === activeKey ? 'true' : 'false');
	      btn.title = meta.label;

	      const icon = D.createElement('span');
	      icon.className = `${CLS}-hub-subtab-icon`;
	      icon.textContent = meta.icon || '•';

	      const title = D.createElement('span');
	      title.className = `${CLS}-hub-subtab-title`;
	      title.textContent = meta.label;

	      btn.append(icon, title);
	      btn.addEventListener('click', (event) => {
	        event.preventDefault();
	        event.stopPropagation();
	        if (key === getActiveKey()) return;
	        setActiveKey(key);
	        CORE_CH_invalidate();
	      }, true);

	      bar.appendChild(btn);
	    }
	  }

  function CHUB_CONTROL_getSubtabMeta(key) {
    if (!key) return null;
    return FEATURE_META.find((meta) => meta.key === key) || null;
  }

  function CHUB_CONTROL_getSubtab() {
    const fallback = FEATURE_CONTROL_SUBTABS[0];
    const raw = UTIL_storage.getStr(KEY_CHUB_CONTROL_SUBTAB_V1, fallback);
    return FEATURE_CONTROL_SUBTABS.includes(raw) ? raw : fallback;
  }

  function CHUB_CONTROL_setSubtab(key) {
    const next = FEATURE_CONTROL_SUBTABS.includes(key) ? key : FEATURE_CONTROL_SUBTABS[0];
    try { UTIL_storage.setStr(KEY_CHUB_CONTROL_SUBTAB_V1, next); } catch {}
    return next;
  }

  function CHUB_CONTROL_getActiveFeatureKey() {
    return CHUB_CONTROL_getSubtab();
  }

  function CHUB_CONTROL_getActiveMeta() {
    return CHUB_CONTROL_getSubtabMeta(CHUB_CONTROL_getActiveFeatureKey());
  }

  function CHUB_CONTROL_mountSubtabs(panel) {
    CHUB_mountFeatureSubtabs(panel, {
      keys: FEATURE_CONTROL_SUBTABS,
      getSubtabMeta: CHUB_CONTROL_getSubtabMeta,
      getActiveKey: CHUB_CONTROL_getActiveFeatureKey,
      setActiveKey: CHUB_CONTROL_setSubtab,
    });
  }

  function CHUB_CHAT_PERF_getSubtabMeta(key) {
    if (!key) return null;
    return FEATURE_META.find((meta) => meta.key === key) || null;
  }

  function CHUB_CHAT_PERF_getSubtab() {
    const fallback = FEATURE_CHAT_PERFORMANCE_SUBTABS[0];
    const raw = UTIL_storage.getStr(KEY_CHUB_CHAT_PERFORMANCE_SUBTAB_V1, fallback);
    return FEATURE_CHAT_PERFORMANCE_SUBTABS.includes(raw) ? raw : fallback;
  }

  function CHUB_CHAT_PERF_setSubtab(key) {
    const next = FEATURE_CHAT_PERFORMANCE_SUBTABS.includes(key) ? key : FEATURE_CHAT_PERFORMANCE_SUBTABS[0];
    try { UTIL_storage.setStr(KEY_CHUB_CHAT_PERFORMANCE_SUBTAB_V1, next); } catch {}
    return next;
  }

  function CHUB_CHAT_PERF_getActiveFeatureKey() {
    return CHUB_CHAT_PERF_getSubtab();
  }

	  function CHUB_CHAT_PERF_getActiveMeta() {
	    return CHUB_CHAT_PERF_getSubtabMeta(CHUB_CHAT_PERF_getActiveFeatureKey());
	  }

	  function CHUB_CHAT_PERF_mountSubtabs(panel) {
	    CHUB_mountFeatureSubtabs(panel, {
	      keys: FEATURE_CHAT_PERFORMANCE_SUBTABS,
	      getSubtabMeta: CHUB_CHAT_PERF_getSubtabMeta,
	      getActiveKey: CHUB_CHAT_PERF_getActiveFeatureKey,
	      setActiveKey: CHUB_CHAT_PERF_setSubtab,
	    });
	  }

	  function CHUB_CHAT_NAV_getSubtabMeta(key) {
	    if (!key) return null;
	    return FEATURE_META.find((meta) => meta.key === key) || null;
	  }

	  function CHUB_CHAT_NAV_getSubtab() {
	    const fallback = FEATURE_CHAT_NAVIGATION_SUBTABS[0];
	    const raw = UTIL_storage.getStr(KEY_CHUB_CHAT_NAVIGATION_SUBTAB_V1, fallback);
	    return FEATURE_CHAT_NAVIGATION_SUBTABS.includes(raw) ? raw : fallback;
	  }

	  function CHUB_CHAT_NAV_setSubtab(key) {
	    const next = FEATURE_CHAT_NAVIGATION_SUBTABS.includes(key) ? key : FEATURE_CHAT_NAVIGATION_SUBTABS[0];
	    try { UTIL_storage.setStr(KEY_CHUB_CHAT_NAVIGATION_SUBTAB_V1, next); } catch {}
	    return next;
	  }

	  function CHUB_CHAT_NAV_getActiveFeatureKey() {
	    return CHUB_CHAT_NAV_getSubtab();
	  }

	  function CHUB_CHAT_NAV_getActiveMeta() {
	    return CHUB_CHAT_NAV_getSubtabMeta(CHUB_CHAT_NAV_getActiveFeatureKey());
	  }

	  function CHUB_CHAT_NAV_mountSubtabs(panel) {
	    CHUB_mountFeatureSubtabs(panel, {
	      keys: FEATURE_CHAT_NAVIGATION_SUBTABS,
	      getSubtabMeta: CHUB_CHAT_NAV_getSubtabMeta,
	      getActiveKey: CHUB_CHAT_NAV_getActiveFeatureKey,
	      setActiveKey: CHUB_CHAT_NAV_setSubtab,
	    });
	  }

	  function CHUB_ANNOTATIONS_getSubtabMeta(key) {
	    if (!key) return null;
	    return FEATURE_META.find((meta) => meta.key === key) || null;
	  }

	  function CHUB_ANNOTATIONS_getSubtab() {
	    const fallback = FEATURE_ANNOTATIONS_SUBTABS[0];
	    const raw = UTIL_storage.getStr(KEY_CHUB_ANNOTATIONS_SUBTAB_V1, fallback);
	    return FEATURE_ANNOTATIONS_SUBTABS.includes(raw) ? raw : fallback;
	  }

	  function CHUB_ANNOTATIONS_setSubtab(key) {
	    const next = FEATURE_ANNOTATIONS_SUBTABS.includes(key) ? key : FEATURE_ANNOTATIONS_SUBTABS[0];
	    try { UTIL_storage.setStr(KEY_CHUB_ANNOTATIONS_SUBTAB_V1, next); } catch {}
	    return next;
	  }

	  function CHUB_ANNOTATIONS_getActiveFeatureKey() {
	    return CHUB_ANNOTATIONS_getSubtab();
	  }

	  function CHUB_ANNOTATIONS_getActiveMeta() {
	    return CHUB_ANNOTATIONS_getSubtabMeta(CHUB_ANNOTATIONS_getActiveFeatureKey());
	  }

	  function CHUB_ANNOTATIONS_mountSubtabs(panel) {
	    CHUB_mountFeatureSubtabs(panel, {
	      keys: FEATURE_ANNOTATIONS_SUBTABS,
	      getSubtabMeta: CHUB_ANNOTATIONS_getSubtabMeta,
	      getActiveKey: CHUB_ANNOTATIONS_getActiveFeatureKey,
	      setActiveKey: CHUB_ANNOTATIONS_setSubtab,
	    });
	  }

	  function CHUB_MARKUP_getSubtabMeta(key) {
	    if (!key) return null;
	    return FEATURE_META.find((meta) => meta.key === key) || null;
	  }

	  function CHUB_MARKUP_getSubtab() {
	    const fallback = FEATURE_MARKUP_SUBTABS[0];
	    const raw = UTIL_storage.getStr(KEY_CHUB_MARKUP_SUBTAB_V1, fallback);
	    return FEATURE_MARKUP_SUBTABS.includes(raw) ? raw : fallback;
	  }

	  function CHUB_MARKUP_setSubtab(key) {
	    const next = FEATURE_MARKUP_SUBTABS.includes(key) ? key : FEATURE_MARKUP_SUBTABS[0];
	    try { UTIL_storage.setStr(KEY_CHUB_MARKUP_SUBTAB_V1, next); } catch {}
	    return next;
	  }

	  function CHUB_MARKUP_getActiveFeatureKey() {
	    return CHUB_MARKUP_getSubtab();
	  }

	  function CHUB_MARKUP_getActiveMeta() {
	    return CHUB_MARKUP_getSubtabMeta(CHUB_MARKUP_getActiveFeatureKey());
	  }

	  function CHUB_MARKUP_mountSubtabs(panel) {
	    CHUB_mountFeatureSubtabs(panel, {
	      keys: FEATURE_MARKUP_SUBTABS,
	      getSubtabMeta: CHUB_MARKUP_getSubtabMeta,
	      getActiveKey: CHUB_MARKUP_getActiveFeatureKey,
	      setActiveKey: CHUB_MARKUP_setSubtab,
	    });
	  }

	  function CHUB_WORKSPACE_getSubtabMeta(key) {
	    if (!key) return null;
	    return FEATURE_META.find((meta) => meta.key === key) || null;
	  }

	  function CHUB_WORKSPACE_getSubtab() {
	    const fallback = FEATURE_WORKSPACE_SUBTABS[0];
	    const raw = UTIL_storage.getStr(KEY_CHUB_WORKSPACE_SUBTAB_V1, fallback);
	    return FEATURE_WORKSPACE_SUBTABS.includes(raw) ? raw : fallback;
	  }

	  function CHUB_WORKSPACE_setSubtab(key) {
	    const next = FEATURE_WORKSPACE_SUBTABS.includes(key) ? key : FEATURE_WORKSPACE_SUBTABS[0];
	    try { UTIL_storage.setStr(KEY_CHUB_WORKSPACE_SUBTAB_V1, next); } catch {}
	    return next;
	  }

	  function CHUB_WORKSPACE_getActiveFeatureKey() {
	    return CHUB_WORKSPACE_getSubtab();
	  }

	  function CHUB_WORKSPACE_getActiveMeta() {
	    return CHUB_WORKSPACE_getSubtabMeta(CHUB_WORKSPACE_getActiveFeatureKey());
	  }

		  function CHUB_WORKSPACE_mountSubtabs(panel) {
		    CHUB_mountFeatureSubtabs(panel, {
		      keys: FEATURE_WORKSPACE_SUBTABS,
		      getSubtabMeta: CHUB_WORKSPACE_getSubtabMeta,
		      getActiveKey: CHUB_WORKSPACE_getActiveFeatureKey,
		      setActiveKey: CHUB_WORKSPACE_setSubtab,
		    });
		  }

		  function CHUB_LIBRARY_getSubtabMeta(key) {
		    if (!key) return null;
		    return FEATURE_META.find((meta) => meta.key === key) || null;
		  }

		  function CHUB_LIBRARY_getSubtab() {
		    const fallback = FEATURE_LIBRARY_SUBTABS[0];
		    const raw = UTIL_storage.getStr(KEY_CHUB_LIBRARY_SUBTAB_V1, fallback);
		    return FEATURE_LIBRARY_SUBTABS.includes(raw) ? raw : fallback;
		  }

		  function CHUB_LIBRARY_setSubtab(key) {
		    const next = FEATURE_LIBRARY_SUBTABS.includes(key) ? key : FEATURE_LIBRARY_SUBTABS[0];
		    try { UTIL_storage.setStr(KEY_CHUB_LIBRARY_SUBTAB_V1, next); } catch {}
		    return next;
		  }

		  function CHUB_LIBRARY_getActiveFeatureKey() {
		    return CHUB_LIBRARY_getSubtab();
		  }

		  function CHUB_LIBRARY_getActiveMeta() {
		    return CHUB_LIBRARY_getSubtabMeta(CHUB_LIBRARY_getActiveFeatureKey());
		  }

		  function CHUB_LIBRARY_mountSubtabs(panel) {
		    CHUB_mountFeatureSubtabs(panel, {
		      keys: FEATURE_LIBRARY_SUBTABS,
		      getSubtabMeta: CHUB_LIBRARY_getSubtabMeta,
		      getActiveKey: CHUB_LIBRARY_getActiveFeatureKey,
		      setActiveKey: CHUB_LIBRARY_setSubtab,
		    });
		  }

		  function CHUB_INTERFACE_getSubtabMeta(key) {
	    if (!key) return null;
	    return FEATURE_META.find((meta) => meta.key === key) || null;
	  }

	  function CHUB_INTERFACE_getSubtab() {
	    const fallback = FEATURE_INTERFACE_SUBTABS[0];
	    const raw = UTIL_storage.getStr(KEY_CHUB_INTERFACE_SUBTAB_V1, fallback);
	    return FEATURE_INTERFACE_SUBTABS.includes(raw) ? raw : fallback;
	  }

	  function CHUB_INTERFACE_setSubtab(key) {
	    const next = FEATURE_INTERFACE_SUBTABS.includes(key) ? key : FEATURE_INTERFACE_SUBTABS[0];
	    try { UTIL_storage.setStr(KEY_CHUB_INTERFACE_SUBTAB_V1, next); } catch {}
	    return next;
	  }

	  function CHUB_INTERFACE_getActiveFeatureKey() {
	    return CHUB_INTERFACE_getSubtab();
	  }

	  function CHUB_INTERFACE_getActiveMeta() {
	    return CHUB_INTERFACE_getSubtabMeta(CHUB_INTERFACE_getActiveFeatureKey());
	  }

	  function CHUB_INTERFACE_mountSubtabs(panel) {
	    CHUB_mountFeatureSubtabs(panel, {
	      keys: FEATURE_INTERFACE_SUBTABS,
	      getSubtabMeta: CHUB_INTERFACE_getSubtabMeta,
	      getActiveKey: CHUB_INTERFACE_getActiveFeatureKey,
	      setActiveKey: CHUB_INTERFACE_setSubtab,
	    });
	  }

	  function CHUB_UM_api() {
	    return W.H2O?.UM?.nmntmssgs?.api || null;
	  }

  function CHUB_UM_getSetting(key, fallback) {
    const api = CHUB_UM_api();
    const cfg = SAFE_call('unmount.getConfig', () => api?.getConfig?.()) || null;
    if (!cfg || typeof cfg !== 'object') return fallback;

    switch (String(key || '')) {
      case 'umEnabled': return cfg.enabled !== false;
      case 'umMinMessages': return Number(cfg.minMsgsForUnmount) || fallback;
      case 'umMarginPx': return Number(cfg.unmountMarginPx) || fallback;
      case 'umRestoreMode': return String(cfg.restoreMode || fallback || 'both');
      case 'umIntervalSec': return Math.round((Number(cfg.intervalMs) || 0) / 1000) || fallback;
      case 'umMountProtectMs': return Number(cfg.mountProtectMs) || fallback;
      case 'umKeepQuoteCache': return cfg.keepQuoteCache !== false;
      case 'umKeepRevisionMeta': return cfg.keepRevisionMeta !== false;
      default: return fallback;
    }
  }

  function CHUB_UM_setSetting(key, val) {
    const api = CHUB_UM_api();
    const changed = SAFE_call('unmount.applySetting', () => api?.applySetting?.(key, val));
    return !!changed;
  }

  function CHUB_UM_runPass(reason = 'control-hub') {
    const api = CHUB_UM_api();
    const ok = !!SAFE_call('unmount.runPass', () => api?.runPass?.(reason));
    return { message: ok ? 'Pass completed.' : 'Unmount module unavailable.' };
  }

  function CHUB_UM_remountAll(reason = 'control-hub') {
    const api = CHUB_UM_api();
    const count = Number(SAFE_call('unmount.remountAll', () => api?.remountAll?.(reason)) || 0);
    return { message: count > 0 ? `Remounted ${count} turn(s).` : 'No collapsed turns were found.' };
  }

  function CHUB_PW_api() {
    return W.H2O_Pagination || null;
  }

  function CHUB_PW_getConfig() {
    return SAFE_call('pagination.getConfig', () => CHUB_PW_api()?.getConfig?.()) || null;
  }

  function CHUB_PW_getPageInfo() {
    return SAFE_call('pagination.getPageInfo', () => CHUB_PW_api()?.getPageInfo?.()) || null;
  }

  function CHUB_PW_pageLabel(info) {
    const model = info && typeof info === 'object' ? info : CHUB_PW_getPageInfo();
    if (!model || typeof model !== 'object') return 'Page info unavailable.';
    const pageIndex = Number(model.pageIndex) || 0;
    const pageCount = Math.max(1, Number(model.pageCount) || 1);
    const totalAnswers = Math.max(0, Number(model.totalAnswers) || 0);
    return `Page ${pageIndex + 1}/${pageCount} • ${totalAnswers} answers`;
  }

  function CHUB_PW_getSetting(key, fallback) {
    const cfg = CHUB_PW_getConfig();
    if (!cfg || typeof cfg !== 'object') return fallback;

    switch (String(key || '')) {
      case 'pwEnabled': return cfg.enabled !== false;
      case 'pwPageSize': return Number(cfg.pageSize) || fallback;
      case 'pwBufferAnswers': return Number(cfg.bufferAnswers) || fallback;
      case 'pwShortcutsEnabled': return cfg.shortcutsEnabled !== false;
      case 'pwAutoLoadSentinel': return !!cfg.autoLoadSentinel;
      case 'pwStyleMode': return String(cfg.styleMode || fallback || 'normal');
      case 'pwSwapMode': return String(cfg.swapMode || fallback || 'root');
      case 'pwDebug': return !!cfg.debug;
      default: return fallback;
    }
  }

  function CHUB_PW_setSetting(key, val) {
    const api = CHUB_PW_api();
    const changed = SAFE_call('pagination.applySetting', () => api?.applySetting?.(key, val));
    return !!changed;
  }

  function CHUB_PW_go(direction) {
    const api = CHUB_PW_api();
    if (!api) return { message: 'Pagination module unavailable.' };
    const infoBefore = CHUB_PW_getPageInfo();
    const handlers = {
      first: () => api.goFirst?.('control-hub:first'),
      older: () => api.goOlder?.('control-hub:older'),
      newer: () => api.goNewer?.('control-hub:newer'),
      last: () => api.goLast?.('control-hub:last'),
    };
    const run = handlers[String(direction || '')];
    const ok = !!SAFE_call(`pagination.go:${String(direction || '')}`, () => run?.());
    if (!ok) {
      const enabled = CHUB_PW_getSetting('pwEnabled', true);
      return { message: enabled ? 'No page change.' : 'Pagination is disabled.' };
    }
    return { message: CHUB_PW_pageLabel(infoBefore) === CHUB_PW_pageLabel() ? 'Already there.' : CHUB_PW_pageLabel() };
  }

  function CHUB_PW_rebuild(reason = 'control-hub:rebuild') {
    const api = CHUB_PW_api();
    const ok = !!SAFE_call('pagination.rebuild', () => api?.rebuildIndex?.(reason));
    return { message: ok ? CHUB_PW_pageLabel() : 'Pagination rebuild failed or is unavailable.' };
  }

  function CHUB_TREE_api() {
    return W.H2O?.CH?.cntrlhb?.tree?.api || null;
  }

  function CHUB_TREE_isOpen() {
    return !!SAFE_call('tree.isOpen', () => CHUB_TREE_api()?.isOpen?.());
  }

  function CHUB_TREE_toggle(reason = 'control-hub') {
    return !!SAFE_call('tree.toggle', () => CHUB_TREE_api()?.toggle?.(reason));
  }

  function CHUB_TREE_close(reason = 'control-hub') {
    return !!SAFE_call('tree.close', () => CHUB_TREE_api()?.close?.(reason));
  }

  function CHUB_TREE_applySetting(key, value) {
    return SAFE_call(`tree.applySetting:${String(key || '')}`, () => CHUB_TREE_api()?.applySetting?.(key, value));
  }

  // Hub state I/O (new key)
  function STORE_loadHub(){
    return UTIL_storage.getJSON(KEY_CHUB_STATE_HUB_V1, {}) || {};
  }
  function STORE_saveHub(st){
    UTIL_storage.setJSON(KEY_CHUB_STATE_HUB_V1, st || {});
  }
  function STORE_getOpt(featureKey, optKey, defVal){
    const st = STORE_loadHub();
    return (st?.[featureKey] && Object.prototype.hasOwnProperty.call(st[featureKey], optKey)) ? st[featureKey][optKey] : defVal;
  }
  function STORE_setOpt(featureKey, optKey, val){
    const st = STORE_loadHub();
    st[featureKey] = st[featureKey] || {};
    st[featureKey][optKey] = val;
    STORE_saveHub(st);

    const c = SAFE_getCfg(featureKey);
    if (c && typeof c.applySetting === 'function') SAFE_call('feature.applySetting()', () => c.applySetting(optKey, val));

    UTIL_emit(EV_CHUB_CHANGED_V1, { featureKey, optKey, val });
  }

  function CHUB_STATE_getLastMainTab(){
    const raw = STORE_getOpt(CHUB_STATE_SCOPE_HUB, CHUB_STATE_LAST_MAIN_TAB_KEY, FEATURE_KEY_CONTROL);
    return FEATURE_getHubKey(FEATURE_getCanonicalKey(raw)) || FEATURE_KEY_CONTROL;
  }

  function CHUB_STATE_setLastMainTab(key){
    const canonical = FEATURE_getHubKey(FEATURE_getCanonicalKey(key));
    if (!canonical) return FEATURE_KEY_CONTROL;
    STORE_setOpt(CHUB_STATE_SCOPE_HUB, CHUB_STATE_LAST_MAIN_TAB_KEY, canonical);
    return canonical;
  }

  // Disk migration (legacy → new) (read-only legacy, write new)
  function MIG_CH_migrateHubOnce(){
    if (UTIL_storage.getStr(KEY_CHUB_MIG_HUB_V1, null) === '1') return;

    const already = UTIL_storage.getJSON(KEY_CHUB_STATE_HUB_V1, null);
    if (already && typeof already === 'object' && Object.keys(already).length) {
      try { UTIL_storage.setStr(KEY_CHUB_MIG_HUB_V1, '1'); } catch {}
      return;
    }

    const legacy = UTIL_storage.getJSON(KEY_LEGACY_HO_HUB_V2, null);
    if (!legacy || typeof legacy !== 'object') {
      try { UTIL_storage.setStr(KEY_CHUB_MIG_HUB_V1, '1'); } catch {}
      return;
    }

    // write into new namespace (no legacy writes)
    UTIL_storage.setJSON(KEY_CHUB_STATE_HUB_V1, legacy);
    DIAG_step('migrated legacy hub state', KEY_LEGACY_HO_HUB_V2);
    try { UTIL_storage.del(KEY_LEGACY_HO_HUB_V2); } catch {}
    try { UTIL_storage.setStr(KEY_CHUB_MIG_HUB_V1, '1'); } catch {}
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / MOUNT 📝🔓💥 ───────────────────────────── */

  function CHUB_RESIZE_getLimits(){
    const ui = CHUB_UI_getConfig();
    const panelMinWidthPx = Math.min(CFG_CH.PANEL_MIN_W_PX, Number(ui?.panelWidthPx || CFG_CH.PANEL_W_PX));
    return {
      minWidth: Math.max(420, Math.round(panelMinWidthPx || 540)),
      minHeight: CHUB_RESIZE_MIN_HEIGHT_PX,
      maxWidth: Math.max(420, Math.round(W.innerWidth - 24)),
      maxHeight: Math.max(CHUB_RESIZE_MIN_HEIGHT_PX, Math.round(W.innerHeight - 24)),
    };
  }

  function CHUB_RESIZE_clampSize(size){
    const limits = CHUB_RESIZE_getLimits();
    const src = (size && typeof size === 'object') ? size : {};
    return {
      width: Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(Number(src.width) || limits.minWidth))),
      height: Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(Number(src.height) || limits.minHeight))),
    };
  }

  function CHUB_RESIZE_clampBox(box){
    const limits = CHUB_RESIZE_getLimits();
    const width = Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(Number(box?.width) || limits.minWidth)));
    const height = Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(Number(box?.height) || limits.minHeight)));
    const maxLeft = Math.max(12, W.innerWidth - width - 12);
    const maxTop = Math.max(12, W.innerHeight - height - 12);
    return {
      left: Math.min(maxLeft, Math.max(12, Math.round(Number(box?.left) || 12))),
      top: Math.min(maxTop, Math.max(12, Math.round(Number(box?.top) || 12))),
      width,
      height,
    };
  }

  function CHUB_RESIZE_applyCenteredSize(panel){
    if (!panel) return;
    const saved = STATE_CH.panelResizeSize;
    if (!saved) {
      panel.style.removeProperty('width');
      panel.style.removeProperty('height');
      panel.style.removeProperty('left');
      panel.style.removeProperty('top');
      panel.style.removeProperty('transform');
      return;
    }
    const size = CHUB_RESIZE_clampSize(saved);
    STATE_CH.panelResizeSize = size;
    panel.style.left = `${CFG_CH.PANEL_LEFT_PCT}%`;
    panel.style.top = `${CFG_CH.PANEL_TOP_PCT}%`;
    panel.style.transform = 'translate(-50%,-50%)';
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
  }

  function CHUB_RESIZE_commitBox(panel, box){
    if (!panel) return null;
    const next = CHUB_RESIZE_clampBox(box);
    panel.style.left = `${next.left}px`;
    panel.style.top = `${next.top}px`;
    panel.style.transform = 'none';
    panel.style.width = `${next.width}px`;
    panel.style.height = `${next.height}px`;
    STATE_CH.panelResizeSize = { width: next.width, height: next.height };
    return next;
  }

  function CHUB_RESIZE_getPoint(event){
    return {
      x: Number(event?.clientX) || 0,
      y: Number(event?.clientY) || 0,
    };
  }

  function CHUB_RESIZE_start(panel, mode, event){
    if (!panel || !event) return;
    if (typeof event.button === 'number' && event.button !== 0) return;
    if ('isPrimary' in event && event.isPrimary === false) return;

    const rect = panel.getBoundingClientRect();
    const startBox = CHUB_RESIZE_commitBox(panel, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }) || { left: rect.left, top: rect.top, width: rect.width, height: rect.height };

    const startPt = CHUB_RESIZE_getPoint(event);
    const pointerId = (typeof event.pointerId === 'number') ? event.pointerId : null;
    const target = event.currentTarget;
    panel.setAttribute('data-cgxui-resizing', 'true');

    if (pointerId != null) {
      try { target?.setPointerCapture?.(pointerId); } catch {}
    }

    const applyMove = (moveEvt) => {
      if (pointerId != null && typeof moveEvt.pointerId === 'number' && moveEvt.pointerId !== pointerId) return;
      moveEvt.preventDefault?.();
      const pt = CHUB_RESIZE_getPoint(moveEvt);
      const dx = pt.x - startPt.x;
      const dy = pt.y - startPt.y;
      CHUB_RESIZE_commitBox(panel, {
        left: startBox.left,
        top: startBox.top,
        width: startBox.width + (mode.includes('x') ? dx : 0),
        height: startBox.height + (mode.includes('y') ? dy : 0),
      });
    };

    const cleanup = () => {
      panel.removeAttribute('data-cgxui-resizing');
      W.removeEventListener('pointermove', onPointerMove, true);
      W.removeEventListener('pointerup', onPointerStop, true);
      W.removeEventListener('pointercancel', onPointerStop, true);
      W.removeEventListener('mousemove', onMouseMove, true);
      W.removeEventListener('mouseup', onMouseStop, true);
      try { if (pointerId != null) target?.releasePointerCapture?.(pointerId); } catch {}
    };

    const onPointerMove = (moveEvt) => applyMove(moveEvt);
    const onPointerStop = (endEvt) => {
      if (pointerId != null && typeof endEvt.pointerId === 'number' && endEvt.pointerId !== pointerId) return;
      cleanup();
    };
    const onMouseMove = (moveEvt) => applyMove(moveEvt);
    const onMouseStop = () => cleanup();

    W.addEventListener('pointermove', onPointerMove, true);
    W.addEventListener('pointerup', onPointerStop, true);
    W.addEventListener('pointercancel', onPointerStop, true);
    W.addEventListener('mousemove', onMouseMove, true);
    W.addEventListener('mouseup', onMouseStop, true);
  }

  function CHUB_RESIZE_bindHandle(panel, el, mode){
    if (!panel || !el || el[CHUB_RESIZE_HANDLE_BOUND_MARK]) return el;
    const start = (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      CHUB_RESIZE_start(panel, mode, evt);
    };
    el.addEventListener('pointerdown', start, true);
    el.addEventListener('mousedown', start, true);
    el[CHUB_RESIZE_HANDLE_BOUND_MARK] = true;
    return el;
  }

  function CHUB_RESIZE_ensureHandles(panel){
    if (!panel) return panel;
    try {
      panel.querySelectorAll(`:scope > .${CLS}-resizeHandle`).forEach((el) => el.remove());
    } catch {}
    panel.removeAttribute('data-cgxui-resizing');
    return panel;
  }

  function CHUB_RESIZE_reflowOpenPanel(){
    const panel = UTIL_q(SEL_CHUB_PANEL);
    if (!panel || panel.hasAttribute('hidden')) return;
    CHUB_RESIZE_applyCenteredSize(panel);
  }

  function DOM_ensureBackdrop(){
    let b = UTIL_q(SEL_CHUB_BACKDROP);
    if (b) return b;

    b = D.createElement('div');
    b.setAttribute(ATTR_CGXUI, UI_CHUB_BACKDROP);
    b.setAttribute(ATTR_CGXUI_OWNER, SkID);
    b.setAttribute('hidden', 'true');
    D.body.appendChild(b);

    b.addEventListener('click', () => CORE_CH_hidePanel(), true);

    return b;
  }

  function DOM_buildPanel(){
    let p = UTIL_q(SEL_CHUB_PANEL);
    if (p) {
      CHUB_RESIZE_ensureHandles(p);
      return p;
    }

    p = D.createElement('div');
    p.setAttribute(ATTR_CGXUI, UI_CHUB_PANEL);
    p.setAttribute(ATTR_CGXUI_OWNER, SkID);
    p.setAttribute('hidden', 'true');

    p.innerHTML = `
      <div class="${CLS}-header">
        <div class="${CLS}-title">Control Hub <small>Cockpit</small></div>
        <button class="${CLS}-x" type="button" aria-label="Close">✕</button>
      </div>

      <div class="${CLS}-toprow">
        <div class="${CLS}-tabs"></div>
      </div>

      <div class="${CLS}-main">
        <div class="${CLS}-catrail"></div>
        <div class="${CLS}-list"></div>
        <div class="${CLS}-detail">
          <div class="${CLS}-detailInner">
            <div class="${CLS}-pill"></div>
            <div class="${CLS}-fl">FEATURE</div>
            <div class="${CLS}-fn"></div>
            <div class="${CLS}-fs"></div>
            <div class="${CLS}-body"></div>
          </div>
        </div>
      </div>

      <div class="${CLS}-footer">
        <span>Tabs: each feature has its own controls.</span>
        <span>Highlighter keys and palette are configurable in the Highlighter tab.</span>
      </div>
    `;

    D.body.appendChild(p);
    CHUB_RESIZE_ensureHandles(p);

    const x = UTIL_q(SEL_CHUB_XBTN);
    if (x) x.addEventListener('click', () => CORE_CH_hidePanel(), true);

    return p;
  }

  function CHUB_topBtnButtonName(button){
    if (button === 0) return 'left';
    if (button === 1) return 'middle';
    if (button === 2) return 'right';
    return '';
  }

  function CHUB_topBtnTrigger(buttonName, isDouble=false){
    if (!buttonName) return 'none';
    return `${buttonName}_${isDouble ? 'double' : 'click'}`;
  }

  function CHUB_topBtnUsesButton(trigger, buttonName){
    return String(trigger || '').startsWith(`${buttonName}_`);
  }

  function CHUB_topBtnDelaySingle(buttonName){
    if (!buttonName) return false;
    const doubleTrigger = CHUB_topBtnTrigger(buttonName, true);
    const cfg = CHUB_UI_getConfig();
    return cfg.hubOpenTrigger === doubleTrigger || cfg.treeOpenTrigger === doubleTrigger;
  }

  function CHUB_topBtnClearGestureTimer(buttonName){
    if (!buttonName) return;
    const timer = STATE_CH.topBtnGestureTimers?.[buttonName];
    if (!timer) return;
    try { W.clearTimeout(timer); } catch {}
    delete STATE_CH.topBtnGestureTimers[buttonName];
  }

  function CHUB_topBtnClearAllGestureTimers(){
    for (const buttonName of Object.keys(STATE_CH.topBtnGestureTimers || {})) {
      CHUB_topBtnClearGestureTimer(buttonName);
    }
  }

  function CORE_CH_isPanelOpen(){
    const p = UTIL_q(SEL_CHUB_PANEL);
    return !!(p && !p.hasAttribute('hidden') && p.getAttribute('aria-hidden') !== 'true');
  }

  function CORE_CH_togglePanel(){
    if (CORE_CH_isPanelOpen()) CORE_CH_hidePanel();
    else CORE_CH_showPanel();
  }

  function CHUB_topBtnRouteTrigger(trigger){
    const cfg = CHUB_UI_getConfig();
    const panelOpen = CORE_CH_isPanelOpen();
    const treeOpen = CHUB_TREE_isOpen();
    const hubMatch = cfg.hubOpenTrigger === trigger;
    const treeMatch = cfg.treeOpenTrigger === trigger;

    if (treeOpen && treeMatch && cfg.treeCloseBehavior === 'toggle_button') {
      CHUB_TREE_close('button-toggle');
      return true;
    }

    if (treeMatch && hubMatch) {
      if (panelOpen) CHUB_TREE_toggle('shared-trigger');
      else CORE_CH_showPanel();
      return true;
    }

    if (treeMatch) {
      CHUB_TREE_toggle('button-trigger');
      return true;
    }

    if (hubMatch) {
      CORE_CH_togglePanel();
      return true;
    }

    return false;
  }

  function CHUB_topBtnHandlePointerUp(event){
    if (!event?.isTrusted) return;
    const buttonName = CHUB_topBtnButtonName(event.button);
    if (!buttonName) return;

    const cfg = CHUB_UI_getConfig();
    const usesButton = CHUB_topBtnUsesButton(cfg.hubOpenTrigger, buttonName) || CHUB_topBtnUsesButton(cfg.treeOpenTrigger, buttonName);
    if (!usesButton) return;

    event.preventDefault();
    event.stopPropagation();

    if (!CHUB_topBtnDelaySingle(buttonName)) {
      CHUB_topBtnRouteTrigger(CHUB_topBtnTrigger(buttonName, false));
      return;
    }

    const pending = STATE_CH.topBtnGestureTimers?.[buttonName] || 0;
    if (pending) {
      CHUB_topBtnClearGestureTimer(buttonName);
      CHUB_topBtnRouteTrigger(CHUB_topBtnTrigger(buttonName, true));
      return;
    }

    STATE_CH.topBtnGestureTimers[buttonName] = W.setTimeout(() => {
      CHUB_topBtnClearGestureTimer(buttonName);
      CHUB_topBtnRouteTrigger(CHUB_topBtnTrigger(buttonName, false));
    }, CHUB_TOPBTN_GESTURE_DELAY_MS);
  }

  function CHUB_topBtnHandleContextMenu(event){
    if (!event?.isTrusted) return;
    const cfg = CHUB_UI_getConfig();
    if (!CHUB_topBtnUsesButton(cfg.hubOpenTrigger, 'right') && !CHUB_topBtnUsesButton(cfg.treeOpenTrigger, 'right')) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function CHUB_topBtnHandleKeyboardClick(event){
    if (!event?.isTrusted || event.detail > 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (!CHUB_topBtnRouteTrigger(CHUB_topBtnTrigger('left', false))) CORE_CH_togglePanel();
  }

  function DOM_bindTopButton(btn){
    if (!btn || btn[CHUB_TOPBTN_BOUND_MARK]) return btn;
    btn.addEventListener('pointerup', CHUB_topBtnHandlePointerUp, true);
    btn.addEventListener('contextmenu', CHUB_topBtnHandleContextMenu, true);
    btn.addEventListener('click', CHUB_topBtnHandleKeyboardClick, true);
    btn[CHUB_TOPBTN_BOUND_MARK] = true;
    return btn;
  }

  function DOM_createTopButton(){
    const existing = UTIL_q(SEL_CHUB_TOPBTN);
    if (existing) return DOM_bindTopButton(existing);

    const btn = D.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ATTR_CGXUI, UI_CHUB_TOPBTN);
    btn.setAttribute(ATTR_CGXUI_OWNER, SkID);
    btn.className = `${CLS}-topbtn`;
    btn.innerHTML = `<span>Cockpit Pro</span>`;                           // 👈 Host's existing premium button (or just a fun label if not present)
    return DOM_bindTopButton(btn);
  }

  // Dock + mount location (owned)
  function DOM_placeTopButton(){
    const dock = DOM_ensureDock();
    if (!dock) return false;

    const btn = DOM_createTopButton();
    if (btn.parentElement === dock) return true;
    dock.appendChild(btn);
    return true;
  }

  function DOM_ensureDock(){
    let dock = UTIL_q(SEL_CHUB_DOCK);
    if (dock) return dock;

    dock = D.createElement('div');
    dock.setAttribute(ATTR_CGXUI, UI_CHUB_DOCK);
    dock.setAttribute(ATTR_CGXUI_OWNER, SkID);
    D.body.appendChild(dock);

    return dock;
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES 📄🔓💧 ───────────────────────────── */

  function CSS_CH_TEXT(){
    const selScoped = (ui) => `[${ATTR_CGXUI}="${ui}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
    const P  = selScoped(UI_CHUB_PANEL);
    const B  = selScoped(UI_CHUB_BACKDROP);
    const DK = selScoped(UI_CHUB_DOCK);
    const ui = CHUB_UI_getConfig();
    const panelMinWidthPx = Math.min(CFG_CH.PANEL_MIN_W_PX, ui.panelWidthPx);
    const listMinWidthPx = Math.min(CHUB_UI_LIMITS.listWidthPx[0], ui.listWidthPx);
    return `
/* ${MODICON} ${MODTAG} — UI (owned only) */

${B}{
  position:fixed; inset:0; z-index:${CFG_CH.BACKDROP_Z};
  background: radial-gradient(60% 50% at 50% 10%, rgba(0,0,0,.15), rgba(0,0,0,.25));  /* 👈 page darkness .35 & .75*/
  backdrop-filter: blur(${CFG_CH.BACKDROP_BLUR_PX}px);                              /* 👈 */
  -webkit-backdrop-filter: blur(${CFG_CH.BACKDROP_BLUR_PX}px);                      /* 👈 */
  pointer-events:auto;
  isolation:isolate;
  will-change:opacity, backdrop-filter;
}
${B}[hidden]{ display:none !important; }

${P}{
  /* ── Hub panel geometry (CFG_CH) ────────────────────────── */
  position:fixed;
  left:${CFG_CH.PANEL_LEFT_PCT}%;               /* 👈 */
  top:${CFG_CH.PANEL_TOP_PCT}%;                /* 👈 */
  transform:translate(-50%,-50%);
  width:min(${ui.panelWidthPx}px, ${CFG_CH.PANEL_W_VW}vw, calc(100vw - 24px)); /* 👈 */
  min-width:min(${panelMinWidthPx}px, calc(100vw - 24px));         /* 👈 */
  max-width:calc(100vw - 24px);
  max-height:calc(100vh - 24px);
  min-height:min(${CHUB_RESIZE_MIN_HEIGHT_PX}px, calc(100vh - 24px));
  height:min(${CFG_CH.PANEL_MAX_H_VH}vh, ${ui.panelMaxHeightPx}px, calc(100vh - 24px)); /* 👈 fixed size */
  resize:both;

  /* Layout: keep header/toprow/footer fixed; main scrolls inside */
  display:flex;
  flex-direction:column;
  min-height:0;

  padding:16px 18px 14px;
  border-radius:22px;
  overflow:hidden;

  color:#f4f6fb;
  z-index:${CFG_CH.PANEL_Z};
  background:
    radial-gradient(circle at 0% 0%, ${CFG_CH.HUB_TINT_A}, transparent 45%), /* 👈 */
    radial-gradient(circle at 100% 100%, ${CFG_CH.HUB_TINT_B}, transparent 55%), /* 👈 */
    linear-gradient(135deg, ${CFG_CH.HUB_BG_A}, ${CFG_CH.HUB_BG_B}); /* 👈 */
  box-shadow: 0 26px 80px rgba(0,0,0,.90), 0 0 0 1px rgba(255,255,255,.05);
  filter:none !important;

  /* backdrop-filter:none; */

  backdrop-filter: blur(14px) saturate(1.2);               /* 👈👈👈 🪞 Make the Control Hub panel itself more “glassy / blurry”  */
-webkit-backdrop-filter: blur(14px) saturate(1.2);

  isolation:isolate;
  transform-style:preserve-3d;
  pointer-events:auto;
  will-change:transform, opacity;
}
${P}[hidden]{ display:none !important; }
${P}::-webkit-resizer{
  background:
    linear-gradient(135deg, transparent 0 50%, rgba(255,255,255,.30) 50% 58%, transparent 58% 66%, rgba(255,255,255,.20) 66% 74%, transparent 74% 100%);
}

${P}::before{
  content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  border:1px solid rgba(255,255,255,0.10);
  box-shadow:
    0 0 0 1px rgba(15,23,42,0.65) inset,
    0 0 28px rgba(15,23,42,0.75),
    0 0 60px rgba(0,0,0,0.85);
  background:
    radial-gradient(60% 70% at 0% 0%, rgba(255,255,255,.18), transparent 45%),
    radial-gradient(40% 40% at 100% 100%, rgba(255,255,255,.08), transparent 55%);
  mix-blend-mode: screen; opacity:.9;
}

/* Header */
${P} .${CLS}-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
${P} .${CLS}-title{font-size:14px;font-weight:600;letter-spacing:.02em}
${P} .${CLS}-title small{opacity:.8;font-weight:400;margin-left:4px}
${P} .${CLS}-x{border:none;background:rgba(255,255,255,.12);color:#fff;width:22px;height:22px;border-radius:999px;display:inline-grid;place-items:center;cursor:pointer;box-shadow:0 4px 10px rgba(0,0,0,.55)}
${P} .${CLS}-x:hover{background:rgba(255,255,255,.18)}

${DK}{
  position:fixed;
  top:0;
  right:16px;

  /* Make dock behave like a topbar strip */
  height:48px;                 /* 👈 if it’s still low, try 44px */
  display:inline-flex;
  align-items:center;          /* 👈 vertical centering */
  justify-content:flex-end;
  gap:6px;

  z-index:${CFG_CH.PANEL_Z};
  pointer-events:none;
  box-sizing:border-box;
}
${DK} > *{pointer-events:auto;}

${DK} > button{
  pointer-events:auto;
}

/* Mode tabs + per-feature ON/OFF */
${P} .${CLS}-toprow{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px}
${P} .${CLS}-tabs{display:flex;gap:8px}
${P} .${CLS}-tab{padding:4px 18px;border-radius:999px;border:none;cursor:pointer;font-size:12px;
  background:rgba(6,10,18,.78);color:rgba(238,242,252,.88);
  box-shadow:0 0 0 1px rgba(255,255,255,.05), inset 0 4px 12px rgba(0,0,0,.55);
  transition:.18s}
${P} .${CLS}-tab:hover{transform:translateY(-0.5px);box-shadow:0 0 0 1px rgba(255,255,255,.20), inset 0 8px 20px rgba(0,0,0,.75)}
${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"]{
  background:radial-gradient(circle at 50% 0%, #ffdf89, #b87d1c);
  color:#222;
  box-shadow:0 0 0 1px rgba(255,248,235,.9), 0 6px 18px rgba(0,0,0,.9)
}

/* Main grid */
${P} .${CLS}-main{
display:grid;
grid-template-columns:32px minmax(${listMinWidthPx}px, ${ui.listWidthPx}px) minmax(0, 1fr);
gap:18px;
margin-top:6px;

flex:1 1 auto;                                   /* 👈 */
min-height:0;                                    /* 👈 */
max-height:min(${CFG_CH.MAIN_MAX_H_VH}vh, 100%);  /* 👈 */
align-items:stretch;
overflow:hidden;

}

/* Left list */

/* Category rail (vertical filter) */
${P} .${CLS}-catrail{
  display:flex;
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  gap:8px;
  padding:4px 0;
  height:100%;
  min-height:0;
  overflow:hidden;
}
${P} .${CLS}-catbtn{
  width:32px;
  height:92px;
  border:none;
  border-radius:10px;
  cursor:pointer;
  background:linear-gradient(135deg, rgba(8,8,12,0.72), rgba(3,3,6,0.92));
  box-shadow:none;
  color:rgba(238,242,252,.82);
  display:flex;
  align-items:center;
  justify-content:center;
  padding:0;
  transition:.16s;
}
${P} .${CLS}-catbtn:hover{
  transform:translateY(-.5px);
  background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
  box-shadow:none;
}
${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"]{
  background:linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,.05));
  color:#ffffff;
  box-shadow:none;
}
${P} .${CLS}-catlbl{
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size:11px;
  letter-spacing:.04em;
  line-height:1;
  user-select:none;
  opacity:.95;
}
${P} .${CLS}-list{
  display:flex;
  flex-direction:column;
  gap:8px;
  height:100%;
  max-height:100%;
  min-height: 0;
  overflow-y:auto;
  padding-right:${CFG_CH.LIST_PAD_RIGHT_PX}px;                        /* 👈👈👈 */
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.4) transparent;

padding-top: 2px;
padding-left: 2px;

}
${P} .${CLS}-list::-webkit-scrollbar{width:6px}
${P} .${CLS}-list::-webkit-scrollbar-thumb{
  background:rgba(255,255,255,.35);
  border-radius:3px;
}
${P} .${CLS}-item{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  padding:7px 10px;border-radius:13px;cursor:pointer;font-size:12px;
  background:
    radial-gradient(circle at 0% 0%, rgba(255,255,255,.08), transparent 45%),
    linear-gradient(135deg, rgba(6,10,20,.94), rgba(6,6,16,.97));
  box-shadow:none;
  transition:.16s
}
${P} .${CLS}-item:hover{
  transform:translateY(-.3px);
  background:
    radial-gradient(circle at 0% 0%, rgba(255,255,255,.10), transparent 45%),
    linear-gradient(135deg, rgba(10,14,28,.96), rgba(8,10,20,.98));
}
${P} .${CLS}-item[${ATTR_CGXUI_STATE}="active"]{
  background:
    radial-gradient(circle at 18% 0%, rgba(255,255,255,.18), transparent 42%),
    linear-gradient(135deg, rgba(86,128,255,.34), rgba(10,14,28,.97));
  box-shadow:none;
}
${P} .${CLS}-item-left{display:flex;align-items:center;gap:8px;min-width:0}
${P} .${CLS}-ico{width:22px;height:22px;border-radius:11px;display:grid;place-items:center;font-size:14px;
  background:radial-gradient(circle at 30% 20%, rgba(255,255,255,.9), rgba(200,200,220,.2))}
${P} .${CLS}-mainlbl{font-weight:500}
${P} .${CLS}-sublbl{font-size:10px;opacity:.65}

${P} .${CLS}-item-switch{
  flex:0 0 auto; position:relative; width:34px; height:18px; border-radius:999px;
  border:1px solid rgba(255,255,255,.28);
  background:rgba(255,255,255,.10);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.35);
  cursor:pointer; padding:0; outline:none; opacity:.95;
}
${P} .${CLS}-item-switch>i{
  position:absolute; top:1px; left:2px; width:14px; height:14px; border-radius:50%;
  background:radial-gradient(circle at 30% 20%, #fff, #cfd3e6);
  box-shadow:0 1px 3px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.55);
  transition:transform .16s ease;
}
${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#ffd966,#ffb347);
  border-color:rgba(255,255,255,.75);
  box-shadow:0 0 0 1px rgba(255,255,255,.55), 0 0 10px rgba(255,205,90,.55);
}
${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"]>i{transform:translateX(16px)}

/* Right details */
${P} .${CLS}-detail{
  position:relative; border-radius:16px;
  background: radial-gradient(circle at 0% 0%, rgba(255,255,255,.08), transparent 45%),
             linear-gradient(135deg, rgba(6,10,20,.94), rgba(6,6,16,.97));
  box-shadow:0 0 0 1px rgba(255,255,255,.06), 0 10px 32px rgba(0,0,0,.80);
  min-height:0;
  height:100%;
  max-height:100%;
  min-width:0;
  overflow:auto;
  scrollbar-gutter: stable both-edges; /* 👈 keep scrollbar from overlaying content */
}
${P} .${CLS}-detailInner{
  position:relative;
  min-width:max(100%, ${ui.detailMinWidthPx}px);
  min-height:100%;
  padding:10px 14px 12px;
  box-sizing:border-box;
}
${P} .${CLS}-pill{position:absolute;right:10px;top:10px;font-size:11px;padding:3px 10px;border-radius:999px;background:rgba(255,255,255,.09);
  box-shadow:0 0 0 1px rgba(255,255,255,.20), 0 3px 8px rgba(0,0,0,.75)}
${P} .${CLS}-fl{font-size:10px;letter-spacing:.16em;opacity:.72;text-transform:uppercase}
${P} .${CLS}-fn{margin-top:4px;font-size:15px;font-weight:600}
${P} .${CLS}-fs{margin-top:2px;font-size:11px;opacity:.82}
${P} .${CLS}-body{margin-top:10px;font-size:12px;line-height:1.45;opacity:.95}
${P} .${CLS}-hub-subtabs{
  display:flex;
  flex-wrap:nowrap;
  gap:8px;
  margin-top:12px;
  width:max-content;
  min-width:100%;
}
${P} .${CLS}-hub-subtab{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:7px 12px;
  border-radius:11px;
  border:1px solid rgba(255,255,255,.12);
  background:linear-gradient(135deg, rgba(255,255,255,.05), rgba(255,255,255,.02));
  color:rgba(244,246,251,.92);
  cursor:pointer;
  transition:background .18s ease, border-color .18s ease, transform .18s ease;
}
${P} .${CLS}-hub-subtab:hover{
  transform:translateY(-0.5px);
  background:linear-gradient(135deg, rgba(255,255,255,.11), rgba(255,255,255,.04));
  border-color:rgba(255,255,255,.22);
}
${P} .${CLS}-hub-subtab[aria-pressed="true"]{
  background:linear-gradient(135deg, rgba(255,217,102,.26), rgba(90,140,255,.20));
  border-color:rgba(255,255,255,.34);
  box-shadow:0 0 0 1px rgba(255,255,255,.14) inset;
}
${P} .${CLS}-hub-subtab-icon{
  width:18px;
  height:18px;
  border-radius:999px;
  display:grid;
  place-items:center;
  font-size:12px;
  background:radial-gradient(circle at 30% 20%, rgba(255,255,255,.92), rgba(255,255,255,.10));
}
${P} .${CLS}-hub-subtab-title{
  font-size:11px;
  letter-spacing:.02em;
  white-space:nowrap;
}

${P} .${CLS}-theme-action{
  margin-top:12px;
  display:flex;
  justify-content:flex-start;
}
${P} .${CLS}-themeBtn{
  padding:0 16px;
  height:34px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.25);
  background:rgba(255,255,255,.04);
  color:#f4f6fb;
  font-size:13px;
  letter-spacing:.1em;
  text-transform:uppercase;
  cursor:pointer;
  transition:background .2s ease, border-color .2s ease;
}
${P} .${CLS}-themeBtn:not(:disabled):hover{
  background:rgba(255,255,255,.08);
  border-color:rgba(255,255,255,.5);
}
${P} .${CLS}-themeBtn:disabled{
  opacity:.65;
  cursor:not-allowed;
}

/* Footer */
${P} .${CLS}-footer{display:flex;justify-content:space-between;margin-top:10px;font-size:10px;opacity:.8}

/* Controls area */
${P} .${CLS}-controls{
  margin-top:10px;
  padding-top:10px;
  border-top:1px solid rgba(255,255,255,.08);
  width:100%;
  min-width:100%;
  box-sizing:border-box;
}
${P} .${CLS}-ctrlrow{
  display:flex;
  align-items:flex-start;
  justify-content:flex-start;
  gap:10px;
  margin:8px 0;
  width:100%;
  min-width:0;
}
/* ✅ Action rows: stack label + help above buttons to avoid cramped word-wrapping */
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action{flex-direction:column; align-items:stretch; justify-content:flex-start; gap:8px}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlLabGroup{max-width:none; min-width:0; width:100%}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlui{min-width:0; width:100%}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlAction{width:100%}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlActionBtns{flex-wrap:wrap; justify-content:flex-start; gap:10px}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-action .${CLS}-ctrlActionStatus{min-width:0; flex:1}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-custom-below{
  flex-direction:column;
  align-items:stretch;
  justify-content:flex-start;
  gap:8px;
}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-custom-below .${CLS}-ctrlLabGroup{
  max-width:none;
  min-width:0;
  width:100%;
}
${P} .${CLS}-ctrlCustomSlot{
  display:block;
  width:100%;
  min-width:0;
  margin-top:8px;
}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-range{flex-direction:column; align-items:stretch; justify-content:flex-start; gap:8px}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-range .${CLS}-ctrlLabGroup{max-width:none; min-width:0; width:100%}
${P} .${CLS}-ctrlrow.${CLS}-ctrlrow-range .${CLS}-ctrlui{min-width:0; width:100%; justify-content:flex-start}
${P} .${CLS}-ctrllab{font-size:12px; opacity:.9}
${P} .${CLS}-ctrlui{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  min-width:220px;
  max-width:100%;
  flex:0 0 auto;
  flex-wrap:wrap;
}
${P} .${CLS}-select2{
  font-size:12px; color:#f4f6fb;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);
  padding:5px 8px; border-radius:10px; outline:none;
  max-width:min(100%, 280px);
}
${P} .${CLS}-group-title{
  font-size:10px;
  letter-spacing:.08em;
  text-transform:uppercase;
  opacity:.65;
  margin-top:18px;
  margin-bottom:4px;
}
${P} .${CLS}-rangebox{
  display:flex;
  flex-direction:column;
  align-items:stretch;
  gap:6px;
  width:100%;
  min-width:0;
}
${P} .${CLS}-rangebox input[type="range"]{
  flex:0 0 auto;
  width:100%;
  min-width:140px;
  max-width:100%;
}
${P} .${CLS}-rangeval{
  font-size:12px;
  opacity:.75;
  min-width:0;
  width:100%;
  text-align:right;
  flex:0 0 auto;
}
${P} .${CLS}-ctrlLabGroup{
  display:flex;
  flex:1 1 240px;
  flex-direction:column;
  gap:3px;
  min-width:0;
  max-width:280px;
}
${P} .${CLS}-ctrlHint{font-size:11px; opacity:.65; color:rgba(255,255,255,.78)}
${P} .${CLS}-ctrlAction{display:flex; align-items:center; gap:12px; flex-wrap:wrap}
${P} .${CLS}-ctrlActionBtns{display:flex; gap:8px; flex-wrap:wrap}
${P} .${CLS}-actionBtn{padding:7px 14px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:linear-gradient(135deg, rgba(255,217,102,.98), rgba(244,123,30,.98)); color:#131313; font-size:12px; cursor:pointer; transition:.18s; box-shadow:0 10px 26px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.28)}
${P} .${CLS}-actionBtn.primary{background:linear-gradient(135deg, rgba(255,245,192,.98), rgba(245,156,26,.98)); font-weight:650}
${P} .${CLS}-actionBtn:disabled{opacity:.45; cursor:not-allowed; box-shadow:none}
${P} .${CLS}-ctrlActionStatus{font-size:11px; opacity:.7; min-width:140px; text-align:right}
${P} .${CLS}-infoList{
  display:grid;
  gap:8px;
  width:min(100%, 560px);
  max-width:100%;
}
${P} .${CLS}-infoLine{
  display:grid;
  grid-template-columns:120px minmax(0, 1fr);
  gap:10px;
  align-items:start;
  padding:8px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
}
${P} .${CLS}-infoKey{
  font-size:11px;
  letter-spacing:.08em;
  text-transform:uppercase;
  opacity:.64;
}
${P} .${CLS}-infoVal{
  font-size:12px;
  line-height:1.45;
  color:rgba(255,255,255,.92);
  word-break:break-word;
}
${P} .${CLS}-sbPaletteEditor{
  display:grid;
  gap:10px;
  width:min(100%, 560px);
  max-width:100%;
}
${P} .${CLS}-sbPaletteHint{max-width:680px}
${P} .${CLS}-sbPaletteList{display:grid; gap:10px}
${P} .${CLS}-sbPaletteRow{
  display:grid;
  grid-template-columns:92px minmax(0, 1fr) auto;
  gap:8px;
  align-items:center;
  padding:8px 10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04), 0 8px 20px rgba(0,0,0,.16);
}
${P} .${CLS}-sbPaletteLead{display:flex; align-items:center; gap:8px; min-width:0}
${P} .${CLS}-sbPaletteIndex{
  width:24px;
  height:24px;
  border-radius:999px;
  display:grid;
  place-items:center;
  font-size:10px;
  font-weight:700;
  color:rgba(255,255,255,.96);
  background:linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.06));
  border:1px solid rgba(255,255,255,.14);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
}
${P} .${CLS}-sbPaletteSwatch{
  width:38px;
  height:38px;
  padding:0;
  border-radius:11px;
  border:1px solid rgba(255,255,255,.16);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18), 0 6px 16px rgba(0,0,0,.18);
  cursor:pointer;
  transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease;
}
${P} .${CLS}-sbPaletteSwatch:hover{
  transform:translateY(-1px);
  border-color:rgba(255,255,255,.26);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.24), 0 9px 18px rgba(0,0,0,.22);
}
${P} .${CLS}-sbPalettePickerHidden{
  position:absolute;
  width:0;
  height:0;
  opacity:0;
  pointer-events:none;
}
${P} .${CLS}-sbPaletteHex{width:100%; min-width:0}
${P} .${CLS}-sbPaletteTail{display:flex; align-items:center; gap:8px; justify-content:flex-end}
${P} .${CLS}-sbPalettePos{
  width:72px;
  min-width:72px;
  text-align:center;
}
${P} .${CLS}-sbPaletteMoves{display:flex; align-items:center; justify-content:flex-end; gap:8px}
${P} .${CLS}-sbPaletteMoveBtn{
  width:28px;
  height:28px;
  border-radius:9px;
  border:1px solid rgba(255,255,255,.12);
  background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
  color:#f4f6fb;
  font-size:14px;
  line-height:1;
  cursor:pointer;
  transition:transform .18s ease, border-color .18s ease, background .18s ease;
}
${P} .${CLS}-sbPaletteMoveBtn:hover:not(:disabled){
  transform:translateY(-1px);
  border-color:rgba(255,255,255,.24);
  background:linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.06));
}
${P} .${CLS}-sbPaletteMoveBtn:disabled{opacity:.38; cursor:not-allowed}
${P} .${CLS}-sbPaletteActions{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
}
${P} .${CLS}-hlPaletteEditor .${CLS}-sbPaletteRow{
  grid-template-columns:minmax(160px, 220px) minmax(0, 1fr);
}
${P} .${CLS}-hlPalettePicker{
  width:42px;
  height:38px;
  padding:0;
  border-radius:11px;
  border:1px solid rgba(255,255,255,.16);
  background:transparent;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18), 0 6px 16px rgba(0,0,0,.18);
  cursor:pointer;
}
${P} .${CLS}-hlPalettePicker::-webkit-color-swatch-wrapper{
  padding:0;
  border-radius:10px;
}
${P} .${CLS}-hlPalettePicker::-webkit-color-swatch{
  border:none;
  border-radius:10px;
}
${P} .${CLS}-hlPaletteGroupTitle{
  font-size:11px;
  letter-spacing:.06em;
  text-transform:uppercase;
  opacity:.78;
  margin-top:4px;
}
${P} .${CLS}-hlPaletteLabel{
  font-size:12px;
  font-weight:600;
  color:rgba(255,255,255,.92);
}
${P} .${CLS}-tabOrderEditor{
  display:grid;
  gap:10px;
  width:min(100%, 620px);
  max-width:100%;
}
${P} .${CLS}-tabOrderList{
  display:grid;
  gap:10px;
}
${P} .${CLS}-tabOrderRow{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:9px 11px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:linear-gradient(135deg, rgba(255,255,255,.06), rgba(255,255,255,.03));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04), 0 8px 20px rgba(0,0,0,.16);
}
${P} .${CLS}-tabOrderLeft{
  display:flex;
  align-items:center;
  gap:10px;
  min-width:0;
  flex:1 1 auto;
}
${P} .${CLS}-tabOrderIndex{
  width:24px;
  height:24px;
  border-radius:999px;
  display:grid;
  place-items:center;
  font-size:10px;
  font-weight:700;
  color:rgba(255,255,255,.96);
  background:linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.06));
  border:1px solid rgba(255,255,255,.14);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
}
${P} .${CLS}-tabOrderIcon{
  width:30px;
  height:30px;
  border-radius:12px;
  display:grid;
  place-items:center;
  font-size:15px;
  background:radial-gradient(circle at 30% 20%, rgba(255,255,255,.92), rgba(255,255,255,.10));
}
${P} .${CLS}-tabOrderText{
  min-width:0;
  display:flex;
  flex-direction:column;
  gap:2px;
}
${P} .${CLS}-tabOrderTitle{
  font-size:12px;
  font-weight:600;
  color:rgba(255,255,255,.94);
}
${P} .${CLS}-tabOrderSub{
  font-size:11px;
  line-height:1.35;
  color:rgba(255,255,255,.68);
}
${P} .${CLS}-tabOrderMoves{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8px;
  flex:0 0 auto;
}
${P} .${CLS}-tabOrderMoveBtn{
  width:30px;
  height:30px;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.12);
  background:linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
  color:#f4f6fb;
  font-size:14px;
  line-height:1;
  cursor:pointer;
  transition:transform .18s ease, border-color .18s ease, background .18s ease;
}
${P} .${CLS}-tabOrderMoveBtn:hover:not(:disabled){
  transform:translateY(-1px);
  border-color:rgba(255,255,255,.24);
  background:linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.06));
}
${P} .${CLS}-tabOrderMoveBtn:disabled{
  opacity:.38;
  cursor:not-allowed;
}
@media (max-width: 760px){
${P} .${CLS}-sbPaletteRow{
  grid-template-columns:1fr;
}
${P} .${CLS}-sbPaletteTail{
  justify-content:flex-start;
}
${P} .${CLS}-sbPaletteMoves{
  justify-content:flex-start;
}
}
${P} .${CLS}-miniSwitch{
  position:relative; width:34px; height:18px; border-radius:999px;
  border:1px solid rgba(255,255,255,.25);
  background:rgba(255,255,255,.10);
  cursor:pointer;
}
${P} .${CLS}-miniSwitch>i{
  position:absolute; top:1px; left:2px; width:14px; height:14px; border-radius:50%;
  background:radial-gradient(circle at 30% 20%, #fff, #d0d0e0);
  transition:transform .16s;
  box-shadow:0 1px 3px rgba(0,0,0,.55);
}
${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#ffd966,#ffb347);
  border-color:rgba(255,255,255,.7);
}
${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"]>i{transform:translateX(15px)}

${P} .${CLS}-band-toggle-row{margin-top:8px}
${P} .${CLS}-band-toggle{
  border:1px solid rgba(255,255,255,.25);
  border-radius:999px;
  padding:6px 16px;
  min-width: 150px;
  font-size:12px;
  letter-spacing:.04em;
  background:rgba(255,255,255,.06);
  color:#fefefe;
  cursor:pointer;
  transition:all .18s ease;
  box-shadow:0 2px 6px rgba(0,0,0,.35);
}
${P} .${CLS}-band-toggle[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#ffd966,#ffb347);
  border-color:rgba(255,215,0,.9);
  color:#2d1605;
  box-shadow:0 10px 24px rgba(255,200,80,.45);
}
${P} .${CLS}-band-toggle:disabled{
  opacity:.65;
  filter:grayscale(.15);
  cursor:not-allowed;
}

html[data-h2o-chub-button-accent="orange"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-button-accent="orange"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-button-accent="orange"] ${P} .${CLS}-band-toggle[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#ffb24a,#f97316 68%,#d95b0a);
  border-color:rgba(255,194,128,.92);
  box-shadow:0 0 0 1px rgba(255,236,214,.50), 0 0 14px rgba(249,115,22,.48);
}
html[data-h2o-chub-button-accent="orange"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-button-accent="orange"] ${P} .${CLS}-actionBtn.primary{
  background:linear-gradient(135deg, rgba(255,210,140,.98), rgba(249,115,22,.98));
  color:#1f1005;
  box-shadow:0 10px 26px rgba(249,115,22,.24), inset 0 1px 0 rgba(255,255,255,.30);
}

html[data-h2o-chub-button-accent="logo-blue"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-button-accent="logo-blue"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-button-accent="logo-blue"] ${P} .${CLS}-band-toggle[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#28e4df,#078bd5 70%,#075ba8);
  border-color:rgba(165,241,255,.80);
  box-shadow:0 0 0 1px rgba(185,247,255,.45), 0 0 14px rgba(0,154,220,.42);
}
html[data-h2o-chub-button-accent="logo-blue"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-button-accent="logo-blue"] ${P} .${CLS}-actionBtn.primary{
  background:linear-gradient(135deg, rgba(63,239,232,.98), rgba(7,139,213,.98) 66%, rgba(6,72,143,.98));
  color:#f5fdff;
  box-shadow:0 10px 26px rgba(0,142,220,.24), inset 0 1px 0 rgba(255,255,255,.24);
}

html[data-h2o-chub-nav-accent="orange"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"]{
  background:radial-gradient(circle at 50% 0%, #ffd08a, #f97316 70%, #b9470c);
  color:#231005;
  box-shadow:0 0 0 1px rgba(255,232,202,.92), 0 8px 22px rgba(249,115,22,.32);
}
html[data-h2o-chub-nav-accent="orange"] ${P} .${CLS}-item:hover{
  background:
    radial-gradient(circle at 0% 0%, rgba(255,165,64,.14), transparent 45%),
    linear-gradient(135deg, rgba(18,14,12,.96), rgba(9,9,17,.98));
}
html[data-h2o-chub-nav-accent="orange"] ${P} .${CLS}-item[${ATTR_CGXUI_STATE}="active"]{
  background:
    radial-gradient(circle at 12% 0%, rgba(255,185,94,.30), transparent 44%),
    linear-gradient(135deg, rgba(210,90,12,.34), rgba(14,12,20,.98));
  box-shadow:0 0 0 1px rgba(255,196,128,.16) inset;
}
html[data-h2o-chub-nav-accent="orange"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-nav-accent="orange"] ${P} .${CLS}-hub-subtab[aria-pressed="true"]{
  background:linear-gradient(135deg, rgba(255,165,64,.30), rgba(249,115,22,.22));
  border-color:rgba(255,196,128,.46);
  box-shadow:0 0 0 1px rgba(255,220,185,.16) inset;
  color:#fff7ed;
}

html[data-h2o-chub-nav-accent="logo-blue"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"]{
  background:radial-gradient(circle at 35% 0%, #52f0e7, #078bd5 58%, #06488f);
  color:#031524;
  box-shadow:0 0 0 1px rgba(179,243,255,.86), 0 8px 24px rgba(0,145,220,.34);
}
html[data-h2o-chub-nav-accent="logo-blue"] ${P} .${CLS}-item{
  background:
    radial-gradient(circle at 0% 0%, rgba(38,231,224,.10), transparent 45%),
    linear-gradient(135deg, rgba(5,24,43,.96), rgba(3,8,22,.98));
  border-color:rgba(85,178,230,.10);
}
html[data-h2o-chub-nav-accent="logo-blue"] ${P} .${CLS}-item:hover{
  background:
    radial-gradient(circle at 0% 0%, rgba(38,231,224,.16), transparent 45%),
    linear-gradient(135deg, rgba(6,35,60,.98), rgba(3,12,30,.99));
}
html[data-h2o-chub-nav-accent="logo-blue"] ${P} .${CLS}-item[${ATTR_CGXUI_STATE}="active"]{
  background:
    radial-gradient(circle at 12% 0%, rgba(41,238,228,.30), transparent 44%),
    linear-gradient(135deg, rgba(0,133,208,.42), rgba(3,17,40,.98));
  box-shadow:0 0 0 1px rgba(112,217,255,.18) inset;
}
html[data-h2o-chub-nav-accent="logo-blue"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-nav-accent="logo-blue"] ${P} .${CLS}-hub-subtab[aria-pressed="true"]{
  background:linear-gradient(135deg, rgba(35,230,220,.24), rgba(0,112,210,.24));
  border-color:rgba(116,216,255,.42);
  color:#f4fbff;
}

html[data-h2o-chub-surface-accent="logo-blue"] ${P}{
  background:
    radial-gradient(circle at 0% 0%, rgba(31,229,223,.16), transparent 45%),
    radial-gradient(circle at 100% 100%, rgba(0,88,170,.22), transparent 55%),
    linear-gradient(135deg, rgba(4,20,36,.97), rgba(1,7,19,.99));
}
html[data-h2o-chub-surface-accent="logo-blue"] ${P}::before{
  background:
    radial-gradient(60% 70% at 0% 0%, rgba(104,226,255,.17), transparent 45%),
    radial-gradient(42% 44% at 100% 100%, rgba(0,120,220,.14), transparent 56%);
}
html[data-h2o-chub-surface-accent="logo-blue"] ${P} .${CLS}-detail{
  background:
    radial-gradient(circle at 8% 0%, rgba(35,230,220,.14), transparent 42%),
    radial-gradient(circle at 98% 62%, rgba(0,128,220,.18), transparent 48%),
    linear-gradient(135deg, rgba(3,18,34,.98), rgba(1,7,19,.985));
  box-shadow:0 0 0 1px rgba(86,170,226,.16), 0 14px 38px rgba(0,0,0,.82);
}

${P} .${CLS}-detailInner > .${CLS}-body,
${P} .${CLS}-detailInner > .${CLS}-controls,
${P} .${CLS}-detailInner > .${CLS}-theme-action,
${P} .${CLS}-detailInner > .${CLS}-hub-subtabs{
  min-width:max(100%, ${ui.detailMinWidthPx - 28}px);
}

/* Topbar Control button (owned) */
[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"].${CLS}-topbtn{
  display:flex; align-items:center; justify-content:center; gap:4px;
  padding:0 10px; min-height:32px; height:32px;
  border-radius:8px; box-sizing:border-box; border:none; outline:none;
  background: rgba(255,255,255,0.035);
  box-shadow: inset 0 0 2px rgba(255,255,255,0.03), 0 2px 4px rgba(0,0,0,0.2);
  font-weight:500; font-size:13px; line-height:1;
  color: rgba(255,255,255,0.4);
  letter-spacing:0.2px;
  text-shadow:0 0 2px rgba(0,0,0,0.2);
  cursor:pointer;
  white-space:nowrap;
  background-clip:padding-box;
  transition: all 0.15s ease, transform 0.15s ease;

  /* placement — shifted right ~40px to align with the chat content center.
     The sidebar (~60px) on the left means 50vw is the viewport center but the
     chat area center sits further right; this offset corrects for that. */
  position:fixed;
  top:10px;
  left:calc(50% + 25px);
  transform:translateX(-50%);
  z-index:${CFG_CH.PANEL_Z};
}

[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"].${CLS}-topbtn:hover{
  filter: brightness(1.15);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.07), 0 3px 6px rgba(255,215,0,0.2);
}

[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"].${CLS}-topbtn:active{
  filter: brightness(1.25);
  color: rgba(255,255,255,0.85);
  box-shadow: inset 0 0 3px rgba(255,255,255,0.10), 0 3px 8px rgba(255,215,0,0.35);
}

[${ATTR_CGXUI}="${UI_CHUB_TOPBTN}"][${ATTR_CGXUI_OWNER}="${SkID}"].${CLS}-topbtn span{
  pointer-events:none;
  line-height:1;
}

${DK}{
    position:fixed;
    top:12px;
    right:16px;
    display:inline-flex;
    gap:4px;
    z-index:${CFG_CH.PANEL_Z};
  }
  ${DK} > button{
    pointer-events:auto;
  }

  /* Dock spacing (owned dock only) */


/* DataTab plugin CSS is injected by the Data Tab module */


/* Hide scrollbars but keep scrolling */
${P} .${CLS}-list,
${P} .${CLS}-detail{
  scrollbar-width: none;        /* Firefox */
  -ms-overflow-style: none;     /* old Edge/IE */
}

${P} .${CLS}-list::-webkit-scrollbar,
${P} .${CLS}-detail::-webkit-scrollbar{
  width: 0 !important;
  height: 0 !important;
}

`;
  }

  function CSS_CH_ensureStyle(){
    let s = D.getElementById(CSS_CHUB_STYLE_ID);
    const txt = CSS_CH_TEXT();

    if (!s) {
      s = D.createElement('style');
      s.id = CSS_CHUB_STYLE_ID;
      s.setAttribute(ATTR_CGXUI_OWNER, SkID);
      D.head.appendChild(s);
      CLEAN_add(() => { try { s.remove(); } catch {} });
    }
    if (s.textContent !== txt) s.textContent = txt;
  }

  /* ───────────────────────────── 🟥 ENGINE — RENDER / UI LOGIC 📝🔓💥 ───────────────────────────── */

  function HO_sectionBandsApi(){
    const mod = W.H2O?.SB?.sctnbnds?.api;
    if (!mod) return null;
    return mod.autoMode || mod;
  }

  function HO_sectionBandsAutoMode(){
    const api = HO_sectionBandsApi();
    if (!api) return null;
    if (typeof api.isAutoModeOn === 'function') return !!api.isAutoModeOn();
    return null;
  }

  function ENGINE_isSectionBandsActive(){
    return FEATURE_getDetailKey(STATE_CH.curKey) === FEATURE_KEY_SECTION_BANDS;
  }

  function HO_toggleSectionBandsAutoMode(){
    const api = HO_sectionBandsApi();
    if (!api) return;
    if (typeof api.toggleAutoMode === 'function') {
      api.toggleAutoMode();
    } else if (typeof api.setAutoMode === 'function') {
      api.setAutoMode(!HO_sectionBandsAutoMode());
    }
  }

  function ENGINE_updateSectionBandsButtonState(){
    const btn = STATE_CH.sectionBandsBtn;
    if (!btn) return;
    const state = HO_sectionBandsAutoMode();
    if (state === null) {
      btn.disabled = true;
      btn.removeAttribute(ATTR_CGXUI_STATE);
      btn.textContent = 'Bands: Loading…';
      return;
    }
    btn.disabled = false;
    btn.setAttribute(ATTR_CGXUI_STATE, state ? 'on' : 'off');
    btn.textContent = state ? 'Bands: ◉' : 'Bands: ◎';
  }

  function ENGINE_renderTabs(panel){
    const el = UTIL_q(`.${CLS}-tabs`, panel);
    if (!el) return;
    el.innerHTML = '';

    for (const m of MODES){
      const b = D.createElement('button');
      b.className = `${CLS}-tab`;
      b.setAttribute(ATTR_CGXUI_MODE, m);
      b.setAttribute(ATTR_CGXUI_STATE, m === STATE_CH.curMode ? 'active' : 'idle');
      b.textContent = m[0].toUpperCase() + m.slice(1);

      b.addEventListener('click', () => {
        if (STATE_CH.curMode === m) return;
        STATE_CH.curMode = m;

        // update active visuals
        UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-tab`).forEach(t => {
          const tm = t.getAttribute(ATTR_CGXUI_MODE) || '';
          t.setAttribute(ATTR_CGXUI_STATE, tm === STATE_CH.curMode ? 'active' : 'idle');
        });

        SAFE_setMode(STATE_CH.curKey, STATE_CH.curMode);
        ENGINE_renderDetail(panel);
      }, true);

      el.appendChild(b);
    }
  }


  function ENGINE_renderCategories(panel){
    const rail = UTIL_q(`.${CLS}-catrail`, panel);
    if (!rail) return;

    // lazy-load current category (disk) once per panel-show
    if (!STATE_CH.curCat) STATE_CH.curCat = CAT_ALL;

    rail.innerHTML = '';
    for (const c of FEATURE_CATS){
      const b = D.createElement('button');
      b.type = 'button';
      b.className = `${CLS}-catbtn`;
      b.setAttribute(ATTR_CGXUI_KEY, c.id);
      b.setAttribute(ATTR_CGXUI_STATE, c.id === STATE_CH.curCat ? 'active' : 'idle');

      const lbl = D.createElement('div');
      lbl.className = `${CLS}-catlbl`;
      lbl.textContent = c.label;

      b.appendChild(lbl);

      b.addEventListener('click', () => {
        if (STATE_CH.curCat === c.id) return;
        CAT_setCurrent(c.id);

        // update visuals
        UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-catbtn`).forEach(x => {
          const k = x.getAttribute(ATTR_CGXUI_KEY);
          x.setAttribute(ATTR_CGXUI_STATE, k === STATE_CH.curCat ? 'active' : 'idle');
        });

        ENGINE_renderList(panel);

        // if current feature is now hidden by filter, pick first visible
        const visibleKeys = CHUB_MAIN_TAB_getMetaList(STATE_CH.curCat).map((meta) => FEATURE_getCanonicalKey(meta.key));

        if (STATE_CH.curCat !== CAT_ALL && !visibleKeys.includes(STATE_CH.curKey)) {
          STATE_CH.curKey = visibleKeys[0] || STATE_CH.curKey;
          ENGINE_renderDetail(panel);
        } else {
          // keep active row highlight correct
          UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-item`).forEach(x => {
            const k = x.getAttribute(ATTR_CGXUI_KEY);
            x.setAttribute(ATTR_CGXUI_STATE, k === STATE_CH.curKey ? 'active' : 'idle');
          });
        }
      }, true);

      rail.appendChild(b);
    }
  }

  function ENGINE_renderList(panel){
    const list = UTIL_q(`.${CLS}-list`, panel);
    if (!list) return;
    list.innerHTML = '';

    const currentActive = FEATURE_getHubKey(STATE_CH.curKey);

    const curCat = STATE_CH.curCat || CAT_ALL;
    if (STATE_CH.curKey !== currentActive) STATE_CH.curKey = currentActive;

    for (const meta of CHUB_MAIN_TAB_getMetaList(curCat)){
      const canonicalKey = FEATURE_getCanonicalKey(meta.key);

      const row = D.createElement('div');
      row.className = `${CLS}-item`;
      row.setAttribute(ATTR_CGXUI_KEY, canonicalKey);
      row.setAttribute(ATTR_CGXUI_STATE, canonicalKey === STATE_CH.curKey ? 'active' : 'idle');

      const left = D.createElement('div');
      left.className = `${CLS}-item-left`;

      const ico = D.createElement('div');
      ico.className = `${CLS}-ico`;
      ico.textContent = meta.icon || '•';

      const labels = D.createElement('div');
      labels.style.display = 'flex';
      labels.style.flexDirection = 'column';
      labels.style.minWidth = '0';

      const a = D.createElement('div');
      a.className = `${CLS}-mainlbl`;
      a.textContent = meta.label;

      const b = D.createElement('div');
      b.className = `${CLS}-sublbl`;
      b.textContent = meta.subtitle;

      labels.append(a, b);
      left.append(ico, labels);

	      // per-tab page-visibility switch
	      let sw = null;
	      if (CHUB_VIS_hasToggle(canonicalKey)) {
	        sw = D.createElement('button');
	        sw.type = 'button';
	        sw.className = `${CLS}-item-switch`;
		        const switchLabel = CHUB_VIS_getLabel(canonicalKey);
		        sw.setAttribute('aria-label', `Toggle ${switchLabel} visibility`);
		        sw.title = `Toggle ${switchLabel} visibility`;
		        sw.innerHTML = '<i></i>';
		        sw.setAttribute(ATTR_CGXUI_STATE, CHUB_VIS_isVisible(canonicalKey) ? 'on' : 'off');

	        sw.addEventListener('click', (e) => {
	          e.preventDefault();
          e.stopPropagation();

	          const now = sw.getAttribute(ATTR_CGXUI_STATE) !== 'on';
	          sw.setAttribute(ATTR_CGXUI_STATE, now ? 'on' : 'off');
		          CHUB_VIS_setVisible(canonicalKey, now);

		        }, true);
	      }

      row.addEventListener('click', () => {
        if (STATE_CH.curKey === canonicalKey) return;
        STATE_CH.curKey = canonicalKey;
        CHUB_STATE_setLastMainTab(STATE_CH.curKey);

        UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-item`).forEach(x => {
          const k = x.getAttribute(ATTR_CGXUI_KEY);
          x.setAttribute(ATTR_CGXUI_STATE, k === STATE_CH.curKey ? 'active' : 'idle');
        });

        SAFE_setMode(STATE_CH.curKey, STATE_CH.curMode);
        ENGINE_renderDetail(panel);
      }, true);

      row.append(left);
      if (sw) row.append(sw);
      list.appendChild(row);
    }
  }

	  function ENGINE_renderControls(panel){
	    // remove old controls
	    UTIL_qAll(`${SEL_CHUB_PANEL} .${CLS}-controls`).forEach(x => { try { x.remove(); } catch {} });

	    const canonicalKey = FEATURE_getHubKey(STATE_CH.curKey);
	    if (canonicalKey !== STATE_CH.curKey) STATE_CH.curKey = canonicalKey;
	    const detailKey = FEATURE_getDetailKey(canonicalKey);
	    const controlStoreKey = FEATURE_getConfigKey(canonicalKey);
	    const defs = FEATURE_getControlsForKey(canonicalKey);
	    if (!Array.isArray(defs) || defs.length === 0) {
      const wrap = D.createElement('div');
      wrap.className = `${CLS}-controls`;

      const row = D.createElement('div');
      row.className = `${CLS}-row`;

      const msg = D.createElement('div');
      msg.style.opacity = '0.75';
      msg.style.fontSize = '12px';
      msg.textContent = 'No controls for this tab (plugin/module missing).';

      row.appendChild(msg);
      wrap.appendChild(row);

      const body = UTIL_q(`.${CLS}-body`, panel);
      if (body) body.insertAdjacentElement('afterend', wrap);
      else panel.appendChild(wrap);
      return;
    }

    const wrap = D.createElement('div');
    wrap.className = `${CLS}-controls`;

    const getValue = (def) => (typeof def.getLive === 'function') ? def.getLive() : STORE_getOpt(controlStoreKey, def.key, def.def);
    const applyValue = (def, v) => {
      if (typeof def.setLive === 'function') def.setLive(v);
      else STORE_setOpt(controlStoreKey, def.key, v);
    };

    const appendSectionBandsAutoRow = () => {
      const row = D.createElement('div');
      row.className = `${CLS}-ctrlrow ${CLS}-band-toggle-row`;

      const lab = D.createElement('div');
      lab.className = `${CLS}-ctrllab`;
      lab.textContent = 'Bands auto-mode';

      const right = D.createElement('div');
      right.className = `${CLS}-ctrlui`;

      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = `${CLS}-band-toggle`;
      btn.setAttribute('aria-label', 'Toggle section bands auto-mode');
      btn.addEventListener('click', () => {
        HO_toggleSectionBandsAutoMode();
      }, true);

      right.appendChild(btn);
      row.append(lab, right);
      wrap.appendChild(row);

      STATE_CH.sectionBandsBtn = btn;
      ENGINE_updateSectionBandsButtonState();
    };

    if (ENGINE_isSectionBandsActive()) appendSectionBandsAutoRow();
    else STATE_CH.sectionBandsBtn = null;

    let currentGroup = null;
    for (const def of defs){
      const groupLabel = def.group || null;
      if (groupLabel && groupLabel !== currentGroup){
        const title = D.createElement('div');
        title.className = `${CLS}-group-title`;
        title.textContent = groupLabel;
        wrap.appendChild(title);
        currentGroup = groupLabel;
      } else if (!groupLabel){
        currentGroup = null;
      }

      const row = D.createElement('div');
      const usesStackBelowLabel = def.type === 'custom' && !!def.stackBelowLabel;
      const customSlot = usesStackBelowLabel ? D.createElement('div') : null;
      // ✅ Action rows need a different layout to prevent label “word stacking”
      // when the right side (buttons) is wider than the panel.
      row.className = `${CLS}-ctrlrow${(def.type === 'action' || def.type === 'custom') ? ` ${CLS}-ctrlrow-action` : ''}${def.type === 'range' ? ` ${CLS}-ctrlrow-range` : ''}${usesStackBelowLabel ? ` ${CLS}-ctrlrow-custom-below` : ''}`;

      const labGroup = D.createElement('div');
      labGroup.className = `${CLS}-ctrlLabGroup`;

      const lab = D.createElement('div');
      lab.className = `${CLS}-ctrllab`;
      lab.textContent = def.label ?? def.key ?? '';
      labGroup.appendChild(lab);

      if (def.help){
        const hint = D.createElement('div');
        hint.className = `${CLS}-ctrlHint`;
        hint.textContent = def.help;
        labGroup.appendChild(hint);
      }

      if (customSlot) {
        customSlot.className = `${CLS}-ctrlCustomSlot`;
        labGroup.appendChild(customSlot);
      }

      const right = D.createElement('div');
      right.className = `${CLS}-ctrlui`;
      if (usesStackBelowLabel) row.append(labGroup);
      else row.append(labGroup, right);

      const curVal = getValue(def);

      if (def.type === 'toggle'){
        const sw = D.createElement('button');
        sw.type = 'button';
        sw.className = `${CLS}-miniSwitch`;
        sw.innerHTML = '<i></i>';
        sw.setAttribute(ATTR_CGXUI_STATE, curVal ? 'on' : 'off');

        sw.addEventListener('click', () => {
          const now = sw.getAttribute(ATTR_CGXUI_STATE) !== 'on';
          sw.setAttribute(ATTR_CGXUI_STATE, now ? 'on' : 'off');
          applyValue(def, now);
        }, true);

        right.appendChild(sw);
      }
      else if (def.type === 'select'){
        const sel = D.createElement('select');
        sel.className = `${CLS}-select2`;

        const opts = (typeof def.opts === 'function') ? def.opts() : (def.opts || []);
        opts.forEach(([v, t]) => {
          const o = D.createElement('option');
          o.value = v;
          o.textContent = t;
          sel.appendChild(o);
        });

        sel.value = (curVal ?? def.def ?? (opts?.[0]?.[0] ?? ''));
        sel.addEventListener('change', () => applyValue(def, sel.value), true);
        right.appendChild(sel);
      }
      else if (def.type === 'range'){
        const box = D.createElement('div');
        box.className = `${CLS}-rangebox`;

        const inp = D.createElement('input');
        inp.type = 'range';
        inp.min = def.min;
        inp.max = def.max;
        inp.step = def.step;
        inp.dataset.featureKey = controlStoreKey;
        inp.dataset.optionKey = def.key;

        const initial = (curVal ?? def.def ?? def.min ?? 0);
        inp.value = String(initial);

        const val = D.createElement('span');
        val.className = `${CLS}-rangeval`;

        const fmt = (x) => def.unit ? `${x}${def.unit}` : (Number(def.max) <= 1 ? (+x).toFixed(2) : String(x));
        val.textContent = fmt(inp.value);

        inp.addEventListener('input', () => {
          val.textContent = fmt(inp.value);
          const out = (Number(def.max) <= 1) ? parseFloat(inp.value) : parseInt(inp.value, 10);
          applyValue(def, out);
        }, true);

        box.append(inp, val);
        right.appendChild(box);
      }

      else if (def.type === 'action'){
        const actionWrap = D.createElement('div');
        actionWrap.className = `${CLS}-ctrlAction`;

        const btnGroup = D.createElement('div');
        btnGroup.className = `${CLS}-ctrlActionBtns`;

        const status = D.createElement('span');
        status.className = `${CLS}-ctrlActionStatus`;
        status.textContent = def.statusText || '';

        const buttons = (Array.isArray(def.buttons) && def.buttons.length)
          ? def.buttons
          : [{
              label: def.buttonLabel || def.label || 'Run',
              action: def.action,
              primary: true,
            }];

        buttons.forEach((btnDef) => {
          const btn = D.createElement('button');
          btn.type = 'button';
          btn.className = `${CLS}-actionBtn${btnDef.primary ? ' primary' : ''}`;
          btn.textContent = btnDef.label || 'Run';
          if (btnDef.disabled) btn.disabled = true;

          btn.addEventListener('click', async (evt) => {
            evt.preventDefault();
            const handler = btnDef.action || def.action;
            if (typeof handler !== 'function') {
              status.textContent = 'No handler.';
              return;
            }
            btn.disabled = true;
            status.textContent = btnDef.statusLoading || 'Working…';
            try {
              const result = await Promise.resolve(handler());
              const msg = ENGINE_parseActionMessage(result, btnDef.successText || def.successText || '');
              status.textContent = msg || '';
            } catch (error) {
              status.textContent = btnDef.errorText || error?.message || 'Failed';
            } finally {
              btn.disabled = false;
            }
	            PLUG_afterAction(detailKey, panel);
	          }, true);

          btnGroup.appendChild(btn);
        });

        actionWrap.append(btnGroup, status);

        // Extra custom UI for this action (optional)
        if (typeof def.render === 'function') {
          try {
            const extra = def.render({ panel, wrap, row, right, actionWrap, status });
            if (extra) actionWrap.appendChild(extra);
          } catch (e) {
            console.warn('[ControlHub] action render failed', e);
          }
        }
        right.appendChild(actionWrap);
      }
      else if (def.type === 'custom'){
        try {
	          const custom = def.render?.({ panel, wrap, row, right, labGroup, controlStoreKey, canonicalKey: detailKey, hubKey: canonicalKey });
	          if (custom) {
	            if (usesStackBelowLabel) customSlot?.appendChild(custom);
	            else right.appendChild(custom);
          }
        } catch (e) {
          console.warn('[ControlHub] custom render failed', e);
        }
      }

      wrap.appendChild(row);
    }

    const body = UTIL_q(`.${CLS}-body`, panel);
    if (body) body.insertAdjacentElement('afterend', wrap);
    else panel.appendChild(wrap);
  }


  function PLUG_clearFeatureArtifacts(panel){
    // Removes per-feature plugin UI that is meant to exist only while a tab is active.
    // Plugins should mark such nodes with [data-h2o-chub-artifact="1"].
    try {
      panel.querySelectorAll(`[${ATTR_CHUB_ART}="1"]`).forEach(n => { try { n.remove(); } catch {} });
    } catch {}
  }

	function ENGINE_renderDetail(panel){
		    const canonicalKey = FEATURE_getHubKey(STATE_CH.curKey);
		    if (canonicalKey !== STATE_CH.curKey) STATE_CH.curKey = canonicalKey;

		    PLUG_clearFeatureArtifacts(panel);
		    const meta = FEATURE_META.find(f => f.key === canonicalKey) || FEATURE_META[0];
		    const activeMeta = FEATURE_hasSubtabs(canonicalKey) ? FEATURE_getActiveMeta(canonicalKey) : null;
		    const detailKey = FEATURE_getDetailKey(canonicalKey);
		    const pill = UTIL_q(`.${CLS}-pill`, panel);
		    const fn   = UTIL_q(`.${CLS}-fn`, panel);
		    const fs   = UTIL_q(`.${CLS}-fs`, panel);
	    // NOTE: keep detail rendering stable (panel-scoped queries only)

	    if (pill) pill.textContent = `Hub Mode: ${STATE_CH.curMode[0].toUpperCase() + STATE_CH.curMode.slice(1)}`;
	    if (fn) fn.textContent = meta.label;
	    if (fs) fs.textContent = FEATURE_hasSubtabs(canonicalKey)
	      ? `Sub-tab: ${activeMeta?.label || meta.label}`
	      : meta.subtitle;

		    const bd = UTIL_q(`.${CLS}-body`, panel);
		    if (bd) bd.textContent = SAFE_getDesc(canonicalKey, STATE_CH.curMode);
		    if (canonicalKey === FEATURE_KEY_CONTROL) CHUB_CONTROL_mountSubtabs(panel);
	    else if (canonicalKey === FEATURE_KEY_CHAT_PERFORMANCE) CHUB_CHAT_PERF_mountSubtabs(panel);
		    else if (canonicalKey === FEATURE_KEY_CHAT_NAVIGATION) CHUB_CHAT_NAV_mountSubtabs(panel);
		    else if (canonicalKey === FEATURE_KEY_ANNOTATIONS) CHUB_ANNOTATIONS_mountSubtabs(panel);
		    else if (canonicalKey === FEATURE_KEY_MARKUP) CHUB_MARKUP_mountSubtabs(panel);
		    else if (canonicalKey === FEATURE_KEY_WORKSPACE) CHUB_WORKSPACE_mountSubtabs(panel);
		    else if (canonicalKey === FEATURE_KEY_LIBRARY) CHUB_LIBRARY_mountSubtabs(panel);
		    else if (canonicalKey === FEATURE_KEY_INTERFACE) CHUB_INTERFACE_mountSubtabs(panel);

	    const existingDataSummary = UTIL_q(`.${CLS}-data-summary`, panel);
	    if (existingDataSummary) {
	      try { existingDataSummary.remove(); } catch {}
	    }
	    PLUG_runDetailHook(detailKey, panel);

    const existingThemeAction = UTIL_q(`.${CLS}-theme-action`, panel);
    if (existingThemeAction) {
      try { existingThemeAction.remove(); } catch {}
    }

	    if (detailKey === 'themesPanel') {
      const action = D.createElement('div');
      action.className = `${CLS}-theme-action`;
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.className = `${CLS}-themeBtn`;
      btn.textContent = 'Open Themes Panel';

      let retry = 0;
      const checkReady = () => {
        // ✅ Themes Panel module path adapter:
        //    - legacy: H2O.TP.themes.api.open
        //    - current: H2O.TP.thmspnl.api.open  (Themes Panel v2.1.5+)
        const api = W.H2O?.TP?.thmspnl?.api || W.H2O?.TP?.themes?.api;
        const ready = !!(api?.open);
        btn.disabled = !ready;
        btn.title = ready ? 'Launch the themes customization panel' : 'Themes panel is loading…';
        if (!ready && retry < 6) {
          retry += 1;
          W.setTimeout(checkReady, 600);
        }
      };
      checkReady();

      btn.addEventListener('click', () => {
        SAFE_call('open-theme-panel', () => {
          (W.H2O?.TP?.thmspnl?.api || W.H2O?.TP?.themes?.api)?.open?.();
          CORE_CH_hidePanel();
        });
      }, true);
      action.appendChild(btn);

      if (bd) bd.insertAdjacentElement('afterend', action);
      else panel.appendChild(action);
    }

    ENGINE_renderControls(panel);
  }

  function ENGINE_renderAll(panel){
    ENGINE_renderTabs(panel);
    ENGINE_renderCategories(panel);
    ENGINE_renderList(panel);
    ENGINE_renderDetail(panel);
  }

  /* ───────────────────────────── 🟨 TIME — SCHEDULING / OBSERVERS 📝🔓💥 ───────────────────────────── */

  /* ───────────────────────────── 🟦 SURFACE — API (definitions only) 📄🔒💧 ───────────────────────────── */

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / STARTUP 📝🔓💥 ───────────────────────────── */

	  function CORE_CH_showPanel(){
	    const b = DOM_ensureBackdrop();
	    const p = DOM_buildPanel();

    CHUB_RESIZE_ensureHandles(p);
    CHUB_topBtnClearAllGestureTimers();
    CHUB_TREE_close('hub-show');

    if (b && b.parentElement) b.parentElement.appendChild(b);
    if (p && p.parentElement) p.parentElement.appendChild(p);

	    b.removeAttribute('hidden');
	    p.removeAttribute('hidden');
    CHUB_RESIZE_applyCenteredSize(p);

	    STATE_CH.curCat = CAT_loadCurrent();
	    const reopenTarget = CHUB_UI_get('hubReopenTarget') || CHUB_UI_DEFAULTS.hubReopenTarget;
	    const currentHubKey = FEATURE_getHubKey(STATE_CH.curKey);
	    const storedLastHubKey = CHUB_STATE_getLastMainTab();
	    let desiredHubKey = currentHubKey || FEATURE_KEY_CONTROL;

	    if (reopenTarget === 'control') desiredHubKey = FEATURE_KEY_CONTROL;
	    else if (reopenTarget === 'first_feature') desiredHubKey = '';
	    else desiredHubKey = storedLastHubKey || currentHubKey || FEATURE_KEY_CONTROL;

	    if (desiredHubKey && STATE_CH.curCat !== CAT_ALL && CAT_forFeatureKey(desiredHubKey) !== STATE_CH.curCat) {
	      STATE_CH.curCat = CAT_forFeatureKey(desiredHubKey) || CAT_ALL;
	    }

	    let visibleKeys = CHUB_MAIN_TAB_getMetaList(STATE_CH.curCat).map((meta) => FEATURE_getCanonicalKey(meta.key));
	    if (!visibleKeys.length) {
	      STATE_CH.curCat = CAT_ALL;
	      visibleKeys = CHUB_MAIN_TAB_getMetaList(STATE_CH.curCat).map((meta) => FEATURE_getCanonicalKey(meta.key));
	    }

	    if (reopenTarget === 'first_feature') STATE_CH.curKey = visibleKeys[0] || FEATURE_KEY_CONTROL;
	    else if (desiredHubKey && visibleKeys.includes(desiredHubKey)) STATE_CH.curKey = desiredHubKey;
	    else STATE_CH.curKey = visibleKeys[0] || FEATURE_KEY_CONTROL;

	    CHUB_STATE_setLastMainTab(STATE_CH.curKey);
	    ENGINE_renderAll(p);

    UTIL_emit(EV_CHUB_CHANGED_V1, { action: 'show' });
  }

  function CORE_CH_hidePanel(){
    const b = UTIL_q(SEL_CHUB_BACKDROP);
    const p = UTIL_q(SEL_CHUB_PANEL);
    CHUB_topBtnClearAllGestureTimers();
    CHUB_TREE_close('hub-hide');
    if (b) b.setAttribute('hidden', 'true');
    if (p) p.setAttribute('hidden', 'true');

    UTIL_emit(EV_CHUB_CHANGED_V1, { action: 'hide' });
  }

  function CHUB_handleExternalOpenRequest(event){
    if (!event || event.source !== W) return;
    const data = event.data;
    if (!data || data.type !== EV_CHUB_OPEN_REQ) return;
    const reqId = String(data.id || '');
    try {
      CORE_CH_showPanel();
      W.postMessage({ type: EV_CHUB_OPEN_RES, id: reqId, ok: true, opened: true }, '*');
    } catch (error) {
      W.postMessage({
        type: EV_CHUB_OPEN_RES,
        id: reqId,
        ok: false,
        opened: false,
        error: String(error && (error.stack || error.message || error)),
      }, '*');
    }
  }

  function CORE_CH_boot(){
    // If we already booted AND the launcher exists, do nothing.
    const hasBtn = !!UTIL_q(SEL_CHUB_TOPBTN);
    if (STATE_CH.booted && hasBtn) return;

    // Repair: older v3.4.2 could set booted=true then crash before creating the launcher.
    if (STATE_CH.booted && !hasBtn) {
      DIAG_step('boot-repair', 'booted=true but launcher missing');
      SAFE_call('boot-repair.cleanups', () => CLEAN_runAll());
      STATE_CH.booted = false;
    }

    if (STATE_CH._booting) return;
    STATE_CH._booting = true;

    try {
      DIAG_step('boot', `${TOK}/${PID}`);

      // migrate old disk state once (defensive)
      SAFE_call('migrateHubOnce', () => MIG_CH_migrateHubOnce());

      SAFE_call('loadUiConfig', () => { STATE_CH.uiCfg = CHUB_UI_load(); });

      // css (defensive)
      SAFE_call('ensureStyle', () => CSS_CH_ensureStyle());
      SAFE_call('applyAccentSkin', () => CHUB_ACCENT_apply());
      SAFE_call('bindResizeReflow', () => {
        const onViewportResize = () => CHUB_RESIZE_reflowOpenPanel();
        W.addEventListener('resize', onViewportResize, true);
        CLEAN_add(() => W.removeEventListener('resize', onViewportResize, true));
      });
      SAFE_call('applyUiRuntime', () => CHUB_UI_applyRuntime());
      SAFE_call('applyTabVisibility', () => CHUB_VIS_applyAll());
      const tabVisTimers = CHUB_VIS_scheduleReapply();
      CLEAN_add(() => {
        for (const timer of tabVisTimers) {
          try { W.clearTimeout(timer); } catch {}
        }
      });

      // ensure launcher (topbar/fixed fallback)
      DOM_placeTopButton();

      // self-heal: if another module or host rerender drops our launcher, restore it.
      if (!STATE_CH.buttonRepairTimer) {
        STATE_CH.buttonRepairTimer = W.setInterval(() => {
          SAFE_call('button-repair.tick', () => {
            if (!STATE_CH.booted) return;
            const dock = UTIL_q(SEL_CHUB_DOCK);
            const btn = UTIL_q(SEL_CHUB_TOPBTN);
            if (!dock || !btn || btn.parentElement !== dock) DOM_placeTopButton();
          });
        }, CFG_CH.BUTTON_REPAIR_MS);
        CLEAN_add(() => {
          if (STATE_CH.buttonRepairTimer) {
            try { W.clearInterval(STATE_CH.buttonRepairTimer); } catch {}
            STATE_CH.buttonRepairTimer = null;
          }
        });
      }

      // re-bind listener cleanly (avoid duplicates on repair boots)
      if (STATE_CH.sectionBandsBtnListener) {
        try { W.removeEventListener(EV_SECTION_BANDS_AUTO, STATE_CH.sectionBandsBtnListener, true); } catch {}
        STATE_CH.sectionBandsBtnListener = null;
      }

      const bandAutoSync = () => ENGINE_updateSectionBandsButtonState();
      STATE_CH.sectionBandsBtnListener = bandAutoSync;
      W.addEventListener(EV_SECTION_BANDS_AUTO, bandAutoSync, true);
      CLEAN_add(() => { try { W.removeEventListener(EV_SECTION_BANDS_AUTO, bandAutoSync, true); } catch {} });

      if (!STATE_CH.themeVisListener) {
        STATE_CH.themeVisListener = () => CHUB_VIS_applyKey(FEATURE_KEY_THEMES);
      }
      W.addEventListener(CHUB_THEME_SETTINGS_EVENT, STATE_CH.themeVisListener, true);
      CLEAN_add(() => { try { W.removeEventListener(CHUB_THEME_SETTINGS_EVENT, STATE_CH.themeVisListener, true); } catch {} });

      if (!STATE_CH.externalOpenBridgeListener) {
        STATE_CH.externalOpenBridgeListener = (event) => CHUB_handleExternalOpenRequest(event);
      }
      W.addEventListener('message', STATE_CH.externalOpenBridgeListener, true);
      CLEAN_add(() => {
        try { W.removeEventListener('message', STATE_CH.externalOpenBridgeListener, true); } catch {}
      });

      UTIL_emit(EV_CHUB_READY_V1, { tok: TOK, pid: PID, skid: SkID });

      // expose minimal internal api (not a promised stable port; internal use)
      MOD_OBJ.api = MOD_OBJ.api || {};
      MOD_OBJ.api.show = CORE_CH_showPanel;
      MOD_OBJ.api.hide = CORE_CH_hidePanel;
      MOD_OBJ.api.toggle = CORE_CH_togglePanel;
      MOD_OBJ.api.isOpen = CORE_CH_isPanelOpen;
      MOD_OBJ.api.dispose = CORE_CH_dispose;
      MOD_OBJ.api.registerPlugin = PLUG_register;
      MOD_OBJ.api.unregisterPlugin = PLUG_unregister;
      MOD_OBJ.api.getSkin = PLUG_skin;
      MOD_OBJ.api.invalidate = CORE_CH_invalidate;
      MOD_OBJ.api.getUiConfig = CHUB_UI_getConfig;
      MOD_OBJ.api.getUiSetting = CHUB_UI_get;
      MOD_OBJ.api.applyUiSetting = CHUB_UI_set;

      CLEAN_add(() => {
        try { if (MOD_OBJ.api) delete MOD_OBJ.api; } catch {}
      });

      STATE_CH.booted = true;
    } catch (e) {
      DIAG_err('boot failed', e);
      STATE_CH.booted = false;
    } finally {
      STATE_CH._booting = false;
    }
  }


  /* ───────────────────────────── ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝🔓💥 ───────────────────────────── */

  function CORE_CH_dispose(){
    if (!STATE_CH.booted) return;
    STATE_CH.booted = false;

    DIAG_step('dispose');

    // timers
    CHUB_topBtnClearAllGestureTimers();

    // hide/remove owned UI
    SAFE_call('hidePanel', () => CORE_CH_hidePanel());
    const p = UTIL_q(SEL_CHUB_PANEL);
    const b = UTIL_q(SEL_CHUB_BACKDROP);
    const btn = UTIL_q(SEL_CHUB_TOPBTN);
    const dock = UTIL_q(SEL_CHUB_DOCK);

    if (p) try { p.remove(); } catch {}
    if (b) try { b.remove(); } catch {}
    if (btn) try { btn.remove(); } catch {}
    if (dock) try { dock.remove(); } catch {}

    if (STATE_CH.buttonRepairTimer) {
      try { W.clearInterval(STATE_CH.buttonRepairTimer); } catch {}
      STATE_CH.buttonRepairTimer = null;
    }

    CLEAN_runAll();
  }


    // [BRIDGE] Prompt Manager (v3.1.1+) ready handshake (defensive)
    try {
      if (!MOD_OBJ.state) MOD_OBJ.state = {};
      if (!MOD_OBJ.state._pmReadyHooked) {
        MOD_OBJ.state._pmReadyHooked = true;
        W.addEventListener(EV_PM_READY_V1, (e) => {
          try {
            MOD_OBJ.state.pm = e?.detail || null;
            MOD_OBJ.state.pmApi = e?.detail?.api || null;
          } catch {}
        });
      }
    } catch {}


  // Boot now (document-idle). Defensive: wait for DOM if needed.
  const bootNow = () => SAFE_call('boot-top', () => CORE_CH_boot());
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', bootNow, { once: true });
  else bootNow();

  } catch (e) {
    try { console.error('[H2O ControlHub] ❌ top-level crash', e); } catch {}
  }

})();
