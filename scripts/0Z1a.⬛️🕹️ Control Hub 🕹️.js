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
  HEADER_TO_MODE_GAP_PX: 18,   // px: space between "Control Hub Cockpit" title row and mode pills 👈
  USER_PILL_W_PX: 140,        // px: user pill card width 👈
  USER_PILL_H_PX: 35,         // px: user pill card height 👈
  USER_PILL_X_OFFSET_PX: 80,   // px: negative moves pill left, positive moves it right 👈

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
  const KEY_CHUB_CONTROL_SUBTAB_V1 = `${NS_DISK}:state:control:subtab:v1`;
  const KEY_CHUB_LIBRARY_SUBTAB_V1 = `${NS_DISK}:state:library:subtab:v1`;
  const KEY_CHUB_MAIN_TAB_ORDER_V1 = `${NS_DISK}:state:main-tab-order:v1`;

  const FEATURE_KEY_ACCOUNT = 'account';
  const FEATURE_KEY_CONTROL = 'control';
  const FEATURE_KEY_CONTROL_HUB = 'controlHub';
  const FEATURE_KEY_COMMAND_BAR = 'commandBar';
  const FEATURE_KEY_ACTION_PANEL = 'actionPanel';
  const FEATURE_KEY_CHAT_PERFORMANCE = 'chatPerformance';
  const FEATURE_KEY_CHAT_NAVIGATION = 'chatNavigation';
  const FEATURE_KEY_CHAT_ANSWERS = 'chatAnswers';
  const FEATURE_KEY_ANNOTATIONS = 'annotations';
  const FEATURE_KEY_NOTES = 'notes';
  const FEATURE_KEY_PROMPT_MANAGER = 'promptManager';
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
  const EV_ACCOUNT_OPEN_PROFILE = 'h2o.ev:prm:cgx:cntrlhb:account:open-profile:v1';

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
    { key:FEATURE_KEY_ANNOTATIONS, label:'Annotations', icon:'📍',
      subtitle:'Margin anchors + notes surfaces grouped together.',
      description:{
        default:'Keep anchor marks and notes tools inside one annotations workspace.',
        focus:'Switch between margin anchors and notes without hunting across separate hub areas.',
        review:'Use anchors and notes together while reviewing longer chats.',
        performance:'Keep annotation tools grouped while the underlying features stay unchanged.',
      },
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
    { key:FEATURE_KEY_THEMES,  label:'Appearance',         icon:'🎨',
      subtitle:'Visual theme, Control Hub accents, and surface tuning.',
      description:{
        default:'Tune visual themes, Control Hub accent colors, and panel surfaces from one Appearance tab.',
        focus:'Keep reading contrast and Control Hub surfaces aligned for focused sessions.',
        review:'Adjust long-session colors and Control Hub accents without leaving appearance controls.',
        performance:'Keep visual tuning grouped while the theme engine and Control Hub shell stay unchanged.',
      }},
	  ];

  function FEATURE_mergePluginMainMeta(baseList, pluginMeta){
    const list = Array.isArray(baseList) ? baseList.slice() : [];
    const meta = pluginMeta && typeof pluginMeta === 'object' ? pluginMeta : null;
    const key = FEATURE_getCanonicalKey(meta?.key);
    if (!key) return list;

    const existingIdx = list.findIndex((item) => FEATURE_getCanonicalKey(item?.key) === key);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...meta, key };
      return list;
    }

    const beforeKey = FEATURE_getCanonicalKey(meta.insertBefore || meta.before || '');
    const afterKey = FEATURE_getCanonicalKey(meta.insertAfter || meta.after || '');
    let insertIdx = -1;
    if (beforeKey) insertIdx = list.findIndex((item) => FEATURE_getCanonicalKey(item?.key) === beforeKey);
    if (insertIdx < 0 && afterKey) {
      const afterIdx = list.findIndex((item) => FEATURE_getCanonicalKey(item?.key) === afterKey);
      if (afterIdx >= 0) insertIdx = afterIdx + 1;
    }

    if (insertIdx >= 0) list.splice(insertIdx, 0, meta);
    else list.push(meta);
    return list;
  }

  function FEATURE_getMainMetaList(){
    let list = FEATURE_META.slice();
    for (const meta of PLUG_getMainMetaList()) list = FEATURE_mergePluginMainMeta(list, meta);
    return list;
  }

  function FEATURE_findMeta(key){
    const canonical = FEATURE_getCanonicalKey(key);
    if (!canonical) return null;
    return FEATURE_getMainMetaList().find((meta) => FEATURE_getCanonicalKey(meta?.key) === canonical)
      || PLUG_getSubtabMetaByKey(canonical)
      || FEATURE_META.find((meta) => FEATURE_getCanonicalKey(meta?.key) === canonical)
      || null;
  }

  function CHUB_MAIN_TAB_defaultOrder(){
    return FEATURE_getMainMetaList()
      .filter((meta) => !meta.hidden)
      .map((meta) => FEATURE_getCanonicalKey(meta.key))
      .filter((key, idx, arr) => key && arr.indexOf(key) === idx);
  }

  function CHUB_MAIN_TAB_normalize(raw, { preserveUnknown = true } = {}){
    const defaults = CHUB_MAIN_TAB_defaultOrder();
    const defaultIndex = new Map(defaults.map((key, idx) => [key, idx]));
    const input = Array.isArray(raw) ? raw.map((key) => FEATURE_getCanonicalKey(key)).filter(Boolean) : [];
    const seen = new Set();
    const out = [];

    for (const key of input){
      if (seen.has(key)) continue;
      if (!defaults.includes(key) && !preserveUnknown) continue;
      seen.add(key);
      out.push(key);
    }
    for (const key of defaults){
      if (seen.has(key)) continue;
      seen.add(key);
      const pos = defaultIndex.get(key);
      let insertIdx = -1;
      for (let i = 0; i < out.length; i += 1) {
        const otherPos = defaultIndex.get(out[i]);
        if (Number.isFinite(otherPos) && otherPos > pos) {
          insertIdx = i;
          break;
        }
      }
      if (insertIdx >= 0) out.splice(insertIdx, 0, key);
      else out.push(key);
    }
    return out;
  }

  function CHUB_MAIN_TAB_load(){
    return CHUB_MAIN_TAB_normalize(UTIL_storage.getJSON(KEY_CHUB_MAIN_TAB_ORDER_V1, null));
  }

  function CHUB_MAIN_TAB_save(next, opts){
    const normalized = CHUB_MAIN_TAB_normalize(next, opts);
    UTIL_storage.setJSON(KEY_CHUB_MAIN_TAB_ORDER_V1, normalized);
    return normalized;
  }

  function CHUB_MAIN_TAB_getOrder(){
    return CHUB_MAIN_TAB_save(CHUB_MAIN_TAB_load());
  }

  function CHUB_MAIN_TAB_getMetaList(category = CAT_ALL){
    const byKey = new Map(FEATURE_getMainMetaList().filter((meta) => !meta.hidden).map((meta) => [FEATURE_getCanonicalKey(meta.key), meta]));
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
    return CHUB_MAIN_TAB_save(CHUB_MAIN_TAB_defaultOrder(), { preserveUnknown: false });
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

  const CHUB_VIS_STYLE_ID = `cgxui-${SkID}-tab-visibility-style`;
  const CHUB_VIS_CLASS_PREFIX = `cgxui-${SkID}-hide-`;

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
    [FEATURE_KEY_DATA_BACKUP]: Object.freeze({
      selectors: [
        '.h2o-cold-layer',
        '.h2o-archive-native-detached-bin',
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

  function CHUB_VIS_getPluginEntries() {
    const out = {};
    try {
      const plugins = STATE_CH?.plugins;
      if (!plugins || typeof plugins.forEach !== 'function') return out;
      plugins.forEach((spec, key) => {
        const raw = spec?.visibility;
        if (!raw) return;
        let entry = null;
        try { entry = (typeof raw === 'function') ? raw({ key, mode: STATE_CH.curMode, skin: PLUG_skin() }) : raw; } catch {}
        if (!entry || typeof entry !== 'object') return;
        out[FEATURE_getHubKey(key)] = entry;
      });
    } catch {}
    return out;
  }

  function CHUB_VIS_getEntries() {
    return { ...CHUB_VISIBILITY, ...CHUB_VIS_getPluginEntries() };
  }

  function CHUB_VIS_getEntry(key) {
    return CHUB_VIS_getEntries()[CHUB_VIS_getKey(key)] || null;
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
    for (const [key, entry] of Object.entries(CHUB_VIS_getEntries())) {
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
    const meta = FEATURE_findMeta(hubKey);
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
    Object.keys(CHUB_VIS_getEntries()).forEach((key) => CHUB_VIS_applyKey(key));
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

  function CHUB_LIBRARY_getSubtabs(){
    const plugKeys = PLUG_getSubtabsForKey(FEATURE_KEY_LIBRARY);
    return plugKeys.length ? plugKeys : FEATURE_LIBRARY_SUBTABS;
  }

	  function CAT_forFeatureKey(featureKey){
	    const k = FEATURE_getCanonicalKey(featureKey);
	    const plugCat = PLUG_getCategoryForKey(k);
	    if (plugCat) return plugCat;
	    // Navigate
	    if (k === FEATURE_KEY_CHAT_NAVIGATION || k === FEATURE_KEY_ANNOTATIONS || k === 'minimap' || k === FEATURE_KEY_CHAT_ANSWERS || k === 'questions' || k === 'marginAnchor' || k === FEATURE_KEY_NOTES || k === 'dockPanel') return CAT_NAV;
	    // Mark & Read
	    if (k === FEATURE_KEY_PROMPT_MANAGER || k === FEATURE_KEY_INTERFACE || k === 'interfaceEnhancer' || k === 'titles' || k === 'numbers') return CAT_MARK;
	    // Save & Sync
    if (k === FEATURE_KEY_ACCOUNT || k === FEATURE_KEY_DATA_BACKUP || k === FEATURE_KEY_EXPORT || k === FEATURE_KEY_STUDIO || k === FEATURE_KEY_LIBRARY || k === 'saveExport' || k === 'data' || k === FEATURE_KEY_LIBRARY_PROJECTS || k === 'folders' || k === FEATURE_KEY_LIBRARY_CATEGORIES || k === FEATURE_KEY_LIBRARY_LABELS || k === FEATURE_KEY_LIBRARY_TAGS) return CAT_SAVE;
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
		    if (CHUB_LIBRARY_getSubtabs().includes(canonical)) return FEATURE_KEY_LIBRARY;
		    {
		      const pluginParent = PLUG_getSubtabParentKey(canonical);
		      if (pluginParent) return pluginParent;
		    }
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
		    if (canonical === FEATURE_KEY_LIBRARY) return CHUB_LIBRARY_getActiveFeatureKey();
		    if (PLUG_getSubtabsForKey(canonical).length) return CHUB_PLUGIN_getActiveFeatureKey(canonical);
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
	    return detailKey;
	  }

	  function FEATURE_getActiveMeta(key){
	    const detailKey = FEATURE_getDetailKey(key);
	    return FEATURE_findMeta(detailKey);
	  }

	  function FEATURE_hasSubtabs(key){
	    const canonical = FEATURE_getCanonicalKey(key);
	    return canonical === FEATURE_KEY_CONTROL
      || canonical === FEATURE_KEY_CHAT_PERFORMANCE
	      || canonical === FEATURE_KEY_CHAT_NAVIGATION
		      || canonical === FEATURE_KEY_LIBRARY
		      || PLUG_getSubtabsForKey(canonical).length > 0;
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
    const keyedPlugDefs = PLUG_getControlsByKeyForKey(canonical);
    const plugDefs  = PLUG_getControlsForKey(canonical);
    if ((!Array.isArray(baseDefs) || !baseDefs.length) && (!Array.isArray(aliasDefs) || !aliasDefs.length) && (!Array.isArray(keyedPlugDefs) || !keyedPlugDefs.length) && (!Array.isArray(plugDefs) || !plugDefs.length)) return [];
    return [
      ...(Array.isArray(baseDefs) ? baseDefs : []),
      ...(Array.isArray(aliasDefs) ? aliasDefs : []),
      ...(Array.isArray(keyedPlugDefs) ? keyedPlugDefs : []),
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
    plugins: new Map(),
    pluginControlContributors: [],
    buttonRepairTimer: null,
    uiCfg: null,
    topBtnGestureTimers: Object.create(null),
    panelResizeSize: null,
    userPillBound: false,
    userPillUnsub: null,
  };
  STATE_CH.plugins = STATE_CH.plugins || new Map();
  STATE_CH.pluginControlContributors = Array.isArray(STATE_CH.pluginControlContributors) ? STATE_CH.pluginControlContributors : [];
  STATE_CH.topBtnGestureTimers = STATE_CH.topBtnGestureTimers || Object.create(null);
  STATE_CH.userPillBound = !!STATE_CH.userPillBound;
  STATE_CH.userPillUnsub = UTIL_isFn(STATE_CH.userPillUnsub) ? STATE_CH.userPillUnsub : null;

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

  const CHUB_USER_FALLBACK_NAME = 'Local User';
  const CHUB_USER_FALLBACK_INITIALS = 'LU';
  const CHUB_USER_AVATAR_DEFAULT =
    'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #3b3935 0%, #24252a 48%, #101217 100%)';
  const CHUB_USER_AVATAR_GRADIENTS = Object.freeze({
    violet: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #6d47d6 0%, #47208f 52%, #1f123f 100%)',
    blue: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #2f6dd9 0%, #1b459c 52%, #102247 100%)',
    cyan: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #078da4 0%, #0a5f74 52%, #103542 100%)',
    green: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #0e8f69 0%, #0a644d 52%, #0b352d 100%)',
    amber: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.11), transparent 42%), linear-gradient(140deg, #c47913 0%, #864916 54%, #352011 100%)',
    pink: 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #c83882 0%, #842052 54%, #351426 100%)',
    '#7c3aed': 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #6d47d6 0%, #47208f 52%, #1f123f 100%)',
    '#2563eb': 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #2f6dd9 0%, #1b459c 52%, #102247 100%)',
    '#0891b2': 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #078da4 0%, #0a5f74 52%, #103542 100%)',
    '#059669': 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #0e8f69 0%, #0a644d 52%, #0b352d 100%)',
    '#d97706': 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.11), transparent 42%), linear-gradient(140deg, #c47913 0%, #864916 54%, #352011 100%)',
    '#db2777': 'radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%), linear-gradient(140deg, #c83882 0%, #842052 54%, #351426 100%)',
  });

  function CHUB_USER_identityApi(){
    return W.H2O?.Identity || null;
  }

  function CHUB_USER_getProfile(){
    const api = CHUB_USER_identityApi();
    if (!api) return null;

    const direct = SAFE_call('userPill.getProfile', () => api.getProfile?.()) || null;
    if (direct && typeof direct === 'object') return direct;

    const snap = SAFE_call('userPill.getSnapshot', () => api.getSnapshot?.()) || null;
    const profile = snap?.profile || null;
    return profile && typeof profile === 'object' ? profile : null;
  }

  function CHUB_USER_displayName(profile){
    const clean = String(profile?.displayName || '').trim().replace(/\s+/g, ' ').slice(0, 64);
    return clean || CHUB_USER_FALLBACK_NAME;
  }

  function CHUB_USER_initialsFrom(name){
    const clean = String(name || '').trim().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return CHUB_USER_FALLBACK_INITIALS;

    const parts = clean.split(' ').filter(Boolean);
    const chars = parts.length > 1
      ? [Array.from(parts[0])[0], Array.from(parts[1])[0]]
      : Array.from(parts[0] || '').slice(0, 2);
    const initials = chars.filter(Boolean).join('').toUpperCase().slice(0, 2);
    return initials || CHUB_USER_FALLBACK_INITIALS;
  }

  function CHUB_USER_avatarGradient(token){
    const key = String(token || '').trim().toLowerCase();
    return CHUB_USER_AVATAR_GRADIENTS[key] || CHUB_USER_AVATAR_DEFAULT;
  }

  function CHUB_USER_ensurePill(panel){
    if (!panel) return null;
    const row = UTIL_q(`.${CLS}-toprow`, panel);
    if (!row) return null;

    let pill = UTIL_q(`.${CLS}-userpill`, row);
    if (pill && pill.tagName !== 'BUTTON') {
      try { pill.remove(); } catch {}
      pill = null;
    }
    if (!pill) {
      pill = D.createElement('button');
      pill.type = 'button';
      pill.className = `${CLS}-userpill`;
      pill.setAttribute('aria-label', 'Open profile settings');
      pill.setAttribute(ATTR_CGXUI_STATE, 'local');
      pill.title = 'Open profile';

      const avatar = D.createElement('span');
      avatar.className = `${CLS}-useravatar`;
      avatar.setAttribute('aria-hidden', 'true');

      const avatarText = D.createElement('span');
      avatarText.className = `${CLS}-useravatarText`;
      avatarText.textContent = CHUB_USER_FALLBACK_INITIALS;
      avatar.appendChild(avatarText);

      const name = D.createElement('span');
      name.className = `${CLS}-username`;
      name.textContent = CHUB_USER_FALLBACK_NAME;

      pill.append(avatar, name);
      row.appendChild(pill);
    }
    const avatar = UTIL_q(`.${CLS}-useravatar`, pill);
    if (avatar && !UTIL_q(`.${CLS}-useravatarText`, avatar)) {
      const current = String(avatar.textContent || CHUB_USER_FALLBACK_INITIALS);
      avatar.textContent = '';
      const avatarText = D.createElement('span');
      avatarText.className = `${CLS}-useravatarText`;
      avatarText.textContent = current.trim() || CHUB_USER_FALLBACK_INITIALS;
      avatar.appendChild(avatarText);
    }
    if (!pill.__h2oChubUserPillClickBound) {
      pill.addEventListener('click', CHUB_USER_openProfileTab, true);
      pill.__h2oChubUserPillClickBound = true;
    }
    return pill;
  }

  function CHUB_USER_updatePill(panel = UTIL_q(SEL_CHUB_PANEL)){
    const pill = CHUB_USER_ensurePill(panel);
    if (!pill) return;

    const profile = CHUB_USER_getProfile();
    const displayName = CHUB_USER_displayName(profile);
    const initials = profile ? CHUB_USER_initialsFrom(displayName) : CHUB_USER_FALLBACK_INITIALS;
    const avatar = UTIL_q(`.${CLS}-useravatar`, pill);
    const avatarText = UTIL_q(`.${CLS}-useravatarText`, pill);
    const name = UTIL_q(`.${CLS}-username`, pill);

    pill.setAttribute(ATTR_CGXUI_STATE, profile ? 'profile' : 'local');
    if (avatar) {
      avatar.style.removeProperty('background');
      avatar.style.setProperty('--h2o-chub-user-avatar-fill', CHUB_USER_avatarGradient(profile?.avatarColor));
    }
    if (avatarText) avatarText.textContent = initials;
    if (name) name.textContent = displayName;
  }

  function CHUB_USER_openProfileTab(event){
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const panel = UTIL_q(SEL_CHUB_PANEL) || DOM_buildPanel();
    STATE_CH.curCat = CAT_forFeatureKey(FEATURE_KEY_ACCOUNT) || CAT_ALL;
    STATE_CH.curKey = FEATURE_KEY_ACCOUNT;
    CHUB_STATE_setLastMainTab(FEATURE_KEY_ACCOUNT);
    UTIL_emit(EV_ACCOUNT_OPEN_PROFILE, { source: 'control-hub-user-pill' });
    if (panel) ENGINE_renderAll(panel);
  }

  function CHUB_USER_bindIdentity(){
    if (STATE_CH.userPillBound) return;
    STATE_CH.userPillBound = true;

    const refresh = () => CHUB_USER_updatePill();
    const subscribe = () => {
      if (STATE_CH.userPillUnsub) return;
      const api = CHUB_USER_identityApi();
      if (UTIL_isFn(api?.onChange)) {
        const unsub = SAFE_call('userPill.onChange', () => api.onChange(refresh));
        if (UTIL_isFn(unsub)) STATE_CH.userPillUnsub = unsub;
      }
      refresh();
    };
    const onReady = () => subscribe();
    const onChanged = () => refresh();

    subscribe();
    W.addEventListener('h2o:identity:ready', onReady, true);
    W.addEventListener('h2o:identity:changed', onChanged, true);

    CLEAN_add(() => {
      try { W.removeEventListener('h2o:identity:ready', onReady, true); } catch {}
      try { W.removeEventListener('h2o:identity:changed', onChanged, true); } catch {}
      if (STATE_CH.userPillUnsub) {
        try { STATE_CH.userPillUnsub(); } catch {}
        STATE_CH.userPillUnsub = null;
      }
      STATE_CH.userPillBound = false;
    });
  }
  /* ───────────────────────────── 🔌 PLUGINS — REGISTRY / HOOKS ───────────────────────────── */

  function PLUG_skin(){
    return {
      SkID,
      CLS,
      ATTR_CGXUI,
      ATTR_CGXUI_OWNER,
      ATTR_CGXUI_STATE,
      ATTR_CGXUI_KEY,
      ATTR_CGXUI_ORDER,
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

  function PLUG_resolveMeta(spec, key){
    if (!spec) return null;
    const raw = spec.meta || spec.featureMeta || spec.tabMeta || null;
    const meta = SAFE_call(`plugin.meta:${String(spec.key || key)}`, () => {
      return (typeof raw === 'function') ? raw({ key, mode: STATE_CH.curMode, skin: PLUG_skin() }) : raw;
    });
    if (!meta || typeof meta !== 'object') return null;
    return { ...meta, key: FEATURE_getCanonicalKey(meta.key || spec.key || key) };
  }

  function PLUG_getMainMetaList(){
    const out = [];
    try {
      STATE_CH.plugins.forEach((spec, key) => {
        const meta = PLUG_resolveMeta(spec, key);
        if (meta) out.push(meta);
      });
    } catch {}
    return out;
  }

  function PLUG_getSubtabsForKey(key){
    const p = PLUG_get(key);
    const src = p?.subtabs || p?.subTabs || null;
    if (!src) return [];
    return SAFE_call(`plugin.subtabs:${String(p.key || key)}`, () => {
      const out = (typeof src === 'function') ? src({ key, mode: STATE_CH.curMode, skin: PLUG_skin() }) : src;
      if (!Array.isArray(out)) return [];
      return out
        .map((item) => (typeof item === 'string' ? item : item?.key))
        .map((subKey) => FEATURE_getCanonicalKey(subKey))
        .filter(Boolean);
    }) || [];
  }

  function PLUG_getSubtabMetaForKey(parentKey, subtabKey){
    const p = PLUG_get(parentKey);
    const src = p?.subtabs || p?.subTabs || null;
    if (!src) return null;
    return SAFE_call(`plugin.subtabMeta:${String(p.key || parentKey)}:${String(subtabKey)}`, () => {
      const out = (typeof src === 'function') ? src({ key: parentKey, mode: STATE_CH.curMode, skin: PLUG_skin() }) : src;
      if (!Array.isArray(out)) return null;
      const canonical = FEATURE_getCanonicalKey(subtabKey);
      const item = out.find((row) => row && typeof row === 'object' && FEATURE_getCanonicalKey(row.key) === canonical);
      return item || null;
    }) || null;
  }

  function PLUG_getSubtabMetaByKey(subtabKey){
    const canonical = FEATURE_getCanonicalKey(subtabKey);
    if (!canonical) return null;
    let found = null;
    try {
      STATE_CH.plugins.forEach((spec, key) => {
        if (found) return;
        const meta = PLUG_getSubtabMetaForKey(key, canonical);
        if (meta) found = meta;
      });
    } catch {}
    return found;
  }

  function PLUG_getSubtabParentKey(subtabKey){
    const canonical = FEATURE_getCanonicalKey(subtabKey);
    if (!canonical) return '';
    let parent = '';
    try {
      STATE_CH.plugins.forEach((_spec, key) => {
        if (parent) return;
        if (PLUG_getSubtabsForKey(key).includes(canonical)) parent = FEATURE_getCanonicalKey(key);
      });
    } catch {}
    return parent;
  }

  function PLUG_getCategoryForKey(key){
    const canonical = FEATURE_getCanonicalKey(key);
    if (!canonical) return '';
    const parent = PLUG_get(canonical) ? canonical : PLUG_getSubtabParentKey(canonical);
    const spec = PLUG_get(parent || canonical);
    if (!spec) return '';
    const raw = spec.category || spec.cat || PLUG_resolveMeta(spec, parent || canonical)?.category || '';
    return typeof raw === 'function'
      ? (SAFE_call(`plugin.category:${String(spec.key || parent || canonical)}`, () => raw({ key: canonical, parentKey: parent, mode: STATE_CH.curMode, skin: PLUG_skin() })) || '')
      : String(raw || '');
  }

  function PLUG_setControlsByKey(ownerKey, spec){
    const canonical = FEATURE_getCanonicalKey(ownerKey);
    const list = Array.isArray(STATE_CH.pluginControlContributors) ? STATE_CH.pluginControlContributors : [];
    STATE_CH.pluginControlContributors = list.filter((entry) => FEATURE_getCanonicalKey(entry?.key) !== canonical);

    const controlsByKey = spec?.controlsByKey;
    if (!controlsByKey || typeof controlsByKey !== 'object' || Array.isArray(controlsByKey)) return;
    STATE_CH.pluginControlContributors.push({ key: canonical, controlsByKey });
  }

  function PLUG_getControlsByKeyForKey(key){
    const canonical = FEATURE_getCanonicalKey(key);
    if (!canonical) return [];
    const out = [];
    const contributors = Array.isArray(STATE_CH.pluginControlContributors) ? STATE_CH.pluginControlContributors : [];

    for (const entry of contributors) {
      const controlsByKey = entry?.controlsByKey;
      if (!controlsByKey || typeof controlsByKey !== 'object' || Array.isArray(controlsByKey)) continue;
      const src = controlsByKey[canonical];
      if (!src) continue;
      const defs = SAFE_call(`plugin.controlsByKey:${String(entry.key || '')}:${canonical}`, () => {
        const resolved = (typeof src === 'function') ? src({ key: canonical, mode: STATE_CH.curMode, skin: PLUG_skin() }) : src;
        return Array.isArray(resolved) ? resolved : [];
      }) || [];
      if (Array.isArray(defs) && defs.length) out.push(...defs);
    }

    return out;
  }

  function CHUB_PLUGIN_getSubtabs(parentKey){
    return PLUG_getSubtabsForKey(parentKey);
  }

  function CHUB_PLUGIN_getSubtabMeta(parentKey, subtabKey){
    return PLUG_getSubtabMetaForKey(parentKey, subtabKey) || FEATURE_findMeta(subtabKey);
  }

  function CHUB_PLUGIN_getSubtabStorageKey(parentKey){
    const canonical = FEATURE_getCanonicalKey(parentKey);
    const spec = PLUG_get(canonical);
    return String(spec?.subtabStorageKey || spec?.subTabStorageKey || `${NS_DISK}:state:${canonical}:subtab:v1`);
  }

  function CHUB_PLUGIN_getSubtab(parentKey){
    const subtabs = CHUB_PLUGIN_getSubtabs(parentKey);
    const fallback = subtabs[0] || '';
    if (!fallback) return '';
    const raw = UTIL_storage.getStr(CHUB_PLUGIN_getSubtabStorageKey(parentKey), fallback);
    return subtabs.includes(raw) ? raw : fallback;
  }

  function CHUB_PLUGIN_setSubtab(parentKey, key){
    const subtabs = CHUB_PLUGIN_getSubtabs(parentKey);
    const next = subtabs.includes(key) ? key : (subtabs[0] || '');
    if (!next) return '';
    try { UTIL_storage.setStr(CHUB_PLUGIN_getSubtabStorageKey(parentKey), next); } catch {}
    return next;
  }

  function CHUB_PLUGIN_getActiveFeatureKey(parentKey){
    return CHUB_PLUGIN_getSubtab(parentKey);
  }

  function CHUB_PLUGIN_getActiveMeta(parentKey){
    return CHUB_PLUGIN_getSubtabMeta(parentKey, CHUB_PLUGIN_getActiveFeatureKey(parentKey));
  }

  function CHUB_PLUGIN_mountSubtabs(panel, parentKey){
    CHUB_mountFeatureSubtabs(panel, {
      keys: CHUB_PLUGIN_getSubtabs(parentKey),
      getSubtabMeta: (key) => CHUB_PLUGIN_getSubtabMeta(parentKey, key),
      getActiveKey: () => CHUB_PLUGIN_getActiveFeatureKey(parentKey),
      setActiveKey: (key) => CHUB_PLUGIN_setSubtab(parentKey, key),
    });
  }

  function PLUG_register(spec){
    if (!spec || !spec.key) return false;
    const canonical = FEATURE_getCanonicalKey(spec.key);
    STATE_CH.plugins.set(canonical, spec);
    PLUG_setControlsByKey(canonical, spec);

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

    if (spec.visibility) SAFE_call(`plugin.visibility:${canonical}`, () => CHUB_VIS_applyAll());
    if (spec.subtabs || spec.subTabs || spec.meta || spec.controlsByKey) CHUB_invalidateSoon();
    return true;
  }

  function PLUG_unregister(key){
    const canonical = FEATURE_getCanonicalKey(key);
    STATE_CH.plugins.delete(canonical);
    STATE_CH.pluginControlContributors = (Array.isArray(STATE_CH.pluginControlContributors) ? STATE_CH.pluginControlContributors : [])
      .filter((entry) => FEATURE_getCanonicalKey(entry?.key) !== canonical);
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
	      ? (FEATURE_findMeta(canonicalKey) || FEATURE_findMeta(resolvedKey))
	      : (FEATURE_findMeta(resolvedKey) || FEATURE_findMeta(canonicalKey));
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
    return FEATURE_findMeta(key);
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
    return FEATURE_findMeta(key);
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
	    return FEATURE_findMeta(key);
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

		  function CHUB_LIBRARY_getSubtabMeta(key) {
		    if (!key) return null;
		    return PLUG_getSubtabMetaForKey(FEATURE_KEY_LIBRARY, key) || FEATURE_findMeta(key);
		  }

		  function CHUB_LIBRARY_getSubtab() {
		    const subtabs = CHUB_LIBRARY_getSubtabs();
		    const fallback = subtabs[0] || FEATURE_KEY_LIBRARY;
		    const raw = UTIL_storage.getStr(KEY_CHUB_LIBRARY_SUBTAB_V1, fallback);
		    return subtabs.includes(raw) ? raw : fallback;
		  }

		  function CHUB_LIBRARY_setSubtab(key) {
		    const subtabs = CHUB_LIBRARY_getSubtabs();
		    const next = subtabs.includes(key) ? key : (subtabs[0] || FEATURE_KEY_LIBRARY);
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
		      keys: CHUB_LIBRARY_getSubtabs(),
		      getSubtabMeta: CHUB_LIBRARY_getSubtabMeta,
		      getActiveKey: CHUB_LIBRARY_getActiveFeatureKey,
		      setActiveKey: CHUB_LIBRARY_setSubtab,
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
      CHUB_USER_ensurePill(p);
      CHUB_USER_updatePill(p);
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
        <button class="${CLS}-userpill" type="button" aria-label="Open profile settings" title="Open profile" ${ATTR_CGXUI_STATE}="local">
          <span class="${CLS}-useravatar" aria-hidden="true"><span class="${CLS}-useravatarText">LU</span></span>
          <span class="${CLS}-username">Local User</span>
        </button>
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
    CHUB_USER_ensurePill(p);
    CHUB_USER_updatePill(p);

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
  --h2o-chub-control-accent-rgb: 255, 217, 102;
  --h2o-chub-control-accent-deep-rgb: 184, 125, 28;
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
${P} .${CLS}-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:${CFG_CH.HEADER_TO_MODE_GAP_PX}px}
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
${P} .${CLS}-tabs{display:flex;gap:8px;min-width:0;flex:0 1 auto}
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
${P} .${CLS}-userpill{
  --h2o-chub-userpill-w:${CFG_CH.USER_PILL_W_PX}px;
  --h2o-chub-userpill-h:${CFG_CH.USER_PILL_H_PX}px;
  --h2o-chub-userpill-x:${CFG_CH.USER_PILL_X_OFFSET_PX}px;
  margin-left:auto;
  margin-right:clamp(18px, 7vw, 86px);
  height:var(--h2o-chub-userpill-h);
  width:var(--h2o-chub-userpill-w);
  min-width:42px;
  max-width:var(--h2o-chub-userpill-w);
  flex:0 1 var(--h2o-chub-userpill-w);
  display:inline-flex;
  align-items:center;
  gap:7px;
  padding:2px 10px 2px 2px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.13);
  background:
    radial-gradient(circle at 18% 0%, rgba(255,255,255,.18), transparent 40%),
    linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.038));
  box-shadow:
    0 8px 18px rgba(0,0,0,.28),
    inset 0 1px 0 rgba(255,255,255,.18),
    inset 0 -1px 0 rgba(0,0,0,.26);
  box-sizing:border-box;
  overflow:hidden;
  appearance:none;
  -webkit-appearance:none;
  cursor:pointer;
  pointer-events:auto;
  user-select:none;
  transform:translateX(var(--h2o-chub-userpill-x));
  transition:background .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease;
}
${P} .${CLS}-userpill:hover{
  border-color:rgba(255,255,255,.22);
  background:
    radial-gradient(circle at 18% 0%, rgba(255,255,255,.22), transparent 40%),
    linear-gradient(135deg, rgba(255,255,255,.15), rgba(255,255,255,.052));
  box-shadow:
    0 10px 22px rgba(0,0,0,.32),
    inset 0 1px 0 rgba(255,255,255,.22),
    inset 0 -1px 0 rgba(0,0,0,.26);
}
${P} .${CLS}-userpill:active{transform:translateX(var(--h2o-chub-userpill-x)) translateY(0.5px)}
${P} .${CLS}-userpill:focus-visible{outline:2px solid rgba(var(--h2o-chub-control-accent-rgb), .42);outline-offset:2px}
${P} .${CLS}-userpill[${ATTR_CGXUI_STATE}="local"]{opacity:.86}
${P} .${CLS}-useravatar{
  --h2o-chub-user-avatar-fill:
    radial-gradient(circle at 34% 28%, rgba(255,255,255,.10), transparent 42%),
    linear-gradient(140deg, #3b3935 0%, #24252a 48%, #101217 100%);
  position:relative;
  isolation:isolate;
  width:31px;
  height:31px;
  flex:0 0 31px;
  border-radius:999px;
  display:inline-grid;
  place-items:center;
  overflow:hidden;
  color:#fff3dd;
  font-size:11.25px;
  font-weight:830;
  line-height:1;
  letter-spacing:0;
  background:
    linear-gradient(145deg, rgba(205,162,86,.62), rgba(84,61,32,.58) 52%, rgba(22,19,16,.76));
  box-shadow:
    0 0 0 1px rgba(255,229,178,.13) inset,
    0 0 0 1px rgba(0,0,0,.34),
    0 4px 9px rgba(0,0,0,.30);
  text-shadow:0 1px 1px rgba(0,0,0,.68);
}
${P} .${CLS}-useravatar::before{
  content:"";
  position:absolute;
  inset:1px;
  border-radius:inherit;
  background:var(--h2o-chub-user-avatar-fill);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.055),
    inset 0 -6px 10px rgba(0,0,0,.22);
  z-index:0;
}
${P} .${CLS}-useravatar::after{
  content:"";
  position:absolute;
  inset:1px;
  border-radius:inherit;
  background:
    radial-gradient(circle at 72% 82%, rgba(0,0,0,.24), transparent 48%),
    linear-gradient(145deg, rgba(255,255,255,.055), transparent 44%);
  opacity:.78;
  z-index:1;
  pointer-events:none;
}
${P} .${CLS}-useravatarText{
  position:relative;
  z-index:2;
  display:block;
  line-height:1;
}
${P} .${CLS}-username{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:rgba(247,248,252,.92);
  font-size:11.5px;
  font-weight:620;
  letter-spacing:0;
  line-height:1;
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
    radial-gradient(circle at 10% 0%, rgba(var(--h2o-chub-control-accent-rgb), .34), transparent 42%),
    linear-gradient(135deg,
      rgba(var(--h2o-chub-control-accent-rgb), .20),
      rgba(var(--h2o-chub-control-accent-deep-rgb), .24) 48%,
      rgba(8,10,18,.98));
  box-shadow:
    0 0 0 1px rgba(var(--h2o-chub-control-accent-rgb), .18) inset,
    0 10px 22px rgba(0,0,0,.20);
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
${P} .${CLS}-sbPaletteActions{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
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

html[data-h2o-chub-control-accent="orange"] ${P}{
  --h2o-chub-control-accent-rgb: 249, 115, 22;
  --h2o-chub-control-accent-deep-rgb: 142, 54, 10;
}
html[data-h2o-chub-control-accent="orange"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="orange"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#ffb24a,#f97316 68%,#d95b0a);
  border-color:rgba(255,194,128,.92);
  box-shadow:0 0 0 1px rgba(255,236,214,.50), 0 0 14px rgba(249,115,22,.48);
}
html[data-h2o-chub-control-accent="orange"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-control-accent="orange"] ${P} .${CLS}-actionBtn.primary{
  background:linear-gradient(135deg, rgba(255,210,140,.98), rgba(249,115,22,.98));
  color:#1f1005;
  box-shadow:0 10px 26px rgba(249,115,22,.24), inset 0 1px 0 rgba(255,255,255,.30);
}
html[data-h2o-chub-control-accent="orange"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"]{
  background:radial-gradient(circle at 50% 0%, #ffd08a, #f97316 70%, #b9470c);
  color:#231005;
  box-shadow:0 0 0 1px rgba(255,232,202,.92), 0 8px 22px rgba(249,115,22,.32);
}
html[data-h2o-chub-control-accent="orange"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="orange"] ${P} .${CLS}-hub-subtab[aria-pressed="true"]{
  background:linear-gradient(135deg, rgba(255,165,64,.30), rgba(249,115,22,.22));
  border-color:rgba(255,196,128,.46);
  box-shadow:0 0 0 1px rgba(255,220,185,.16) inset;
  color:#fff7ed;
}

html[data-h2o-chub-control-accent="logo-blue"] ${P}{
  --h2o-chub-control-accent-rgb: 40, 228, 223;
  --h2o-chub-control-accent-deep-rgb: 7, 91, 168;
}
html[data-h2o-chub-control-accent="logo-blue"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="logo-blue"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"]{
  background:linear-gradient(135deg,#28e4df,#078bd5 70%,#075ba8);
  border-color:rgba(165,241,255,.80);
  box-shadow:0 0 0 1px rgba(185,247,255,.45), 0 0 14px rgba(0,154,220,.42);
}
html[data-h2o-chub-control-accent="logo-blue"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-control-accent="logo-blue"] ${P} .${CLS}-actionBtn.primary{
  background:linear-gradient(135deg, rgba(63,239,232,.98), rgba(7,139,213,.98) 66%, rgba(6,72,143,.98));
  color:#f5fdff;
  box-shadow:0 10px 26px rgba(0,142,220,.24), inset 0 1px 0 rgba(255,255,255,.24);
}
html[data-h2o-chub-control-accent="logo-blue"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"]{
  background:radial-gradient(circle at 35% 0%, #52f0e7, #078bd5 58%, #06488f);
  color:#031524;
  box-shadow:0 0 0 1px rgba(179,243,255,.86), 0 8px 24px rgba(0,145,220,.34);
}
html[data-h2o-chub-control-accent="logo-blue"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="logo-blue"] ${P} .${CLS}-hub-subtab[aria-pressed="true"]{
  background:linear-gradient(135deg, rgba(35,230,220,.24), rgba(0,112,210,.24));
  border-color:rgba(116,216,255,.42);
  color:#f4fbff;
}

html[data-h2o-chub-control-accent="dark"] ${P}{
  --h2o-chub-control-accent-rgb: 142, 137, 127;
  --h2o-chub-control-accent-deep-rgb: 58, 57, 53;
  --h2o-chub-control-accent-button-bg: linear-gradient(135deg, rgba(98,96,90,.92), rgba(51,51,48,.94));
  --h2o-chub-control-accent-fill-bg: linear-gradient(135deg, rgba(142,137,127,.18), rgba(58,57,53,.22));
  --h2o-chub-control-accent-hover-bg: linear-gradient(135deg, rgba(142,137,127,.10), rgba(255,255,255,.028));
  --h2o-chub-control-accent-border: rgba(194,187,174,.22);
  --h2o-chub-control-accent-text: #ece8df;
  --h2o-chub-control-accent-button-text: #f0ece5;
  --h2o-chub-control-accent-shadow: 0 0 0 1px rgba(210,202,188,.08), 0 8px 18px rgba(0,0,0,.22);
}
html[data-h2o-chub-control-accent="soft-gold"] ${P}{
  --h2o-chub-control-accent-rgb: 196, 153, 78;
  --h2o-chub-control-accent-deep-rgb: 112, 82, 36;
  --h2o-chub-control-accent-button-bg: linear-gradient(135deg, rgba(211,172,102,.90), rgba(148,111,58,.90));
  --h2o-chub-control-accent-fill-bg: linear-gradient(135deg, rgba(196,153,78,.23), rgba(112,82,36,.18));
  --h2o-chub-control-accent-hover-bg: linear-gradient(135deg, rgba(196,153,78,.13), rgba(255,255,255,.032));
  --h2o-chub-control-accent-border: rgba(226,196,132,.32);
  --h2o-chub-control-accent-text: #f3eee2;
  --h2o-chub-control-accent-button-text: #241b0f;
  --h2o-chub-control-accent-shadow: 0 0 0 1px rgba(232,205,145,.12), 0 8px 18px rgba(0,0,0,.21);
}
html[data-h2o-chub-control-accent="soft-amber"] ${P}{
  --h2o-chub-control-accent-rgb: 198, 119, 84;
  --h2o-chub-control-accent-deep-rgb: 116, 72, 54;
  --h2o-chub-control-accent-button-bg: linear-gradient(135deg, rgba(214,150,107,.92), rgba(152,92,68,.90));
  --h2o-chub-control-accent-fill-bg: linear-gradient(135deg, rgba(198,119,84,.24), rgba(116,72,54,.18));
  --h2o-chub-control-accent-hover-bg: linear-gradient(135deg, rgba(198,119,84,.14), rgba(255,255,255,.035));
  --h2o-chub-control-accent-border: rgba(230,170,130,.34);
  --h2o-chub-control-accent-text: #f4eee8;
  --h2o-chub-control-accent-button-text: #261812;
  --h2o-chub-control-accent-shadow: 0 0 0 1px rgba(235,188,150,.14), 0 8px 18px rgba(0,0,0,.22);
}
html[data-h2o-chub-control-accent="deep-blue"] ${P}{
  --h2o-chub-control-accent-rgb: 102, 132, 166;
  --h2o-chub-control-accent-deep-rgb: 43, 63, 92;
  --h2o-chub-control-accent-button-bg: linear-gradient(135deg, rgba(116,145,178,.90), rgba(59,80,112,.92));
  --h2o-chub-control-accent-fill-bg: linear-gradient(135deg, rgba(102,132,166,.23), rgba(43,63,92,.20));
  --h2o-chub-control-accent-hover-bg: linear-gradient(135deg, rgba(102,132,166,.13), rgba(255,255,255,.032));
  --h2o-chub-control-accent-border: rgba(150,178,210,.30);
  --h2o-chub-control-accent-text: #edf3f8;
  --h2o-chub-control-accent-button-text: #101923;
  --h2o-chub-control-accent-shadow: 0 0 0 1px rgba(160,188,220,.13), 0 8px 18px rgba(0,0,0,.22);
}
html[data-h2o-chub-control-accent="neutral-glow"] ${P}{
  --h2o-chub-control-accent-rgb: 174, 168, 154;
  --h2o-chub-control-accent-deep-rgb: 83, 80, 74;
  --h2o-chub-control-accent-button-bg: linear-gradient(135deg, rgba(188,181,166,.90), rgba(111,107,98,.90));
  --h2o-chub-control-accent-fill-bg: linear-gradient(135deg, rgba(174,168,154,.20), rgba(83,80,74,.18));
  --h2o-chub-control-accent-hover-bg: linear-gradient(135deg, rgba(174,168,154,.11), rgba(255,255,255,.030));
  --h2o-chub-control-accent-border: rgba(208,202,188,.26);
  --h2o-chub-control-accent-text: #eeeeea;
  --h2o-chub-control-accent-button-text: #1d1c19;
  --h2o-chub-control-accent-shadow: 0 0 0 1px rgba(220,214,198,.11), 0 8px 18px rgba(0,0,0,.20);
}
html[data-h2o-chub-control-accent="quiet-gradient"] ${P}{
  --h2o-chub-control-accent-rgb: 145, 132, 164;
  --h2o-chub-control-accent-deep-rgb: 67, 83, 111;
  --h2o-chub-control-accent-button-bg: linear-gradient(135deg, rgba(156,143,174,.88), rgba(82,103,132,.90));
  --h2o-chub-control-accent-fill-bg: linear-gradient(135deg, rgba(145,132,164,.20), rgba(67,83,111,.20));
  --h2o-chub-control-accent-hover-bg: linear-gradient(135deg, rgba(145,132,164,.11), rgba(67,83,111,.08));
  --h2o-chub-control-accent-border: rgba(184,174,205,.26);
  --h2o-chub-control-accent-text: #f0eef5;
  --h2o-chub-control-accent-button-text: #171820;
  --h2o-chub-control-accent-shadow: 0 0 0 1px rgba(194,184,214,.11), 0 8px 18px rgba(0,0,0,.21);
}
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-item-switch[${ATTR_CGXUI_STATE}="on"],
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-miniSwitch[${ATTR_CGXUI_STATE}="on"]{
  background:var(--h2o-chub-control-accent-button-bg);
  border-color:var(--h2o-chub-control-accent-border);
  box-shadow:var(--h2o-chub-control-accent-shadow);
}
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-actionBtn.primary,
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-actionBtn.primary,
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-actionBtn.primary,
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-actionBtn.primary,
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-actionBtn.primary,
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-actionBtn,
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-actionBtn.primary{
  background:var(--h2o-chub-control-accent-button-bg);
  border-color:var(--h2o-chub-control-accent-border);
  color:var(--h2o-chub-control-accent-button-text);
  box-shadow:var(--h2o-chub-control-accent-shadow), inset 0 1px 0 rgba(255,255,255,.16);
}
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-actionBtn:hover:not(:disabled),
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-actionBtn:hover:not(:disabled),
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-actionBtn:hover:not(:disabled),
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-actionBtn:hover:not(:disabled),
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-actionBtn:hover:not(:disabled),
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-actionBtn:hover:not(:disabled){
  filter:brightness(1.025) saturate(1.02);
}
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-tab[${ATTR_CGXUI_STATE}="active"]{
  background:var(--h2o-chub-control-accent-fill-bg);
  color:var(--h2o-chub-control-accent-text);
  box-shadow:0 0 0 1px var(--h2o-chub-control-accent-border), 0 8px 18px rgba(0,0,0,.20);
}
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-tab:hover:not([${ATTR_CGXUI_STATE}="active"]),
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-tab:hover:not([${ATTR_CGXUI_STATE}="active"]),
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-tab:hover:not([${ATTR_CGXUI_STATE}="active"]),
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-tab:hover:not([${ATTR_CGXUI_STATE}="active"]),
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-tab:hover:not([${ATTR_CGXUI_STATE}="active"]),
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-tab:hover:not([${ATTR_CGXUI_STATE}="active"]){
  box-shadow:0 0 0 1px var(--h2o-chub-control-accent-border), inset 0 8px 20px rgba(0,0,0,.58);
}
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-hub-subtab[aria-pressed="true"],
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-hub-subtab[aria-pressed="true"],
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-hub-subtab[aria-pressed="true"],
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-hub-subtab[aria-pressed="true"],
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-hub-subtab[aria-pressed="true"],
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-catbtn[${ATTR_CGXUI_STATE}="active"],
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-hub-subtab[aria-pressed="true"]{
  background:var(--h2o-chub-control-accent-fill-bg);
  border-color:var(--h2o-chub-control-accent-border);
  color:var(--h2o-chub-control-accent-text);
  box-shadow:0 0 0 1px rgba(var(--h2o-chub-control-accent-rgb), .10) inset;
}
html[data-h2o-chub-control-accent="dark"] ${P} .${CLS}-hub-subtab:hover:not([aria-pressed="true"]),
html[data-h2o-chub-control-accent="soft-gold"] ${P} .${CLS}-hub-subtab:hover:not([aria-pressed="true"]),
html[data-h2o-chub-control-accent="soft-amber"] ${P} .${CLS}-hub-subtab:hover:not([aria-pressed="true"]),
html[data-h2o-chub-control-accent="deep-blue"] ${P} .${CLS}-hub-subtab:hover:not([aria-pressed="true"]),
html[data-h2o-chub-control-accent="neutral-glow"] ${P} .${CLS}-hub-subtab:hover:not([aria-pressed="true"]),
html[data-h2o-chub-control-accent="quiet-gradient"] ${P} .${CLS}-hub-subtab:hover:not([aria-pressed="true"]){
  background:var(--h2o-chub-control-accent-hover-bg);
  border-color:var(--h2o-chub-control-accent-border);
}

html[data-h2o-chub-panel-bg="logo-blue"] ${P}{
  background:
    radial-gradient(circle at 0% 0%, rgba(31,229,223,.16), transparent 45%),
    radial-gradient(circle at 100% 100%, rgba(0,88,170,.22), transparent 55%),
    linear-gradient(135deg, rgba(4,20,36,.97), rgba(1,7,19,.99));
}
html[data-h2o-chub-panel-bg="logo-blue"] ${P}::before{
  background:
    radial-gradient(60% 70% at 0% 0%, rgba(104,226,255,.17), transparent 45%),
    radial-gradient(42% 44% at 100% 100%, rgba(0,120,220,.14), transparent 56%);
}
html[data-h2o-chub-panel-bg="dark"] ${P}{
  background:
    radial-gradient(circle at 0% 0%, rgba(255,255,255,.055), transparent 45%),
    radial-gradient(circle at 100% 100%, rgba(110,105,95,.08), transparent 55%),
    linear-gradient(135deg, rgba(20,20,19,.97), rgba(9,9,10,.99));
}
html[data-h2o-chub-panel-bg="dark"] ${P}::before{
  background:
    radial-gradient(60% 70% at 0% 0%, rgba(255,255,255,.10), transparent 45%),
    radial-gradient(42% 44% at 100% 100%, rgba(130,124,110,.07), transparent 56%);
}
html[data-h2o-chub-panel-bg="cockpit-ember"] ${P}{
  background:
    radial-gradient(circle at 4% 2%, rgba(217,119,87,.14), transparent 44%),
    radial-gradient(circle at 100% 100%, rgba(91,123,201,.13), transparent 56%),
    linear-gradient(135deg, rgba(27,27,25,.98), rgba(11,12,16,.99));
}
html[data-h2o-chub-panel-bg="cockpit-ember"] ${P}::before{
  background:
    radial-gradient(60% 70% at 0% 0%, rgba(217,119,87,.10), transparent 48%),
    radial-gradient(48% 48% at 100% 100%, rgba(138,170,214,.10), transparent 58%);
}

html[data-h2o-chub-pane-bg="logo-blue"] ${P} .${CLS}-tab:not([${ATTR_CGXUI_STATE}="active"]){
  background:linear-gradient(135deg, rgba(4,26,46,.86), rgba(2,8,22,.96));
  box-shadow:0 0 0 1px rgba(73,175,235,.12), inset 0 4px 12px rgba(0,0,0,.50);
}
html[data-h2o-chub-pane-bg="logo-blue"] ${P} .${CLS}-catbtn:not([${ATTR_CGXUI_STATE}="active"]){
  background:linear-gradient(135deg, rgba(6,45,60,.72), rgba(3,12,30,.94));
  box-shadow:none;
}
html[data-h2o-chub-pane-bg="logo-blue"] ${P} .${CLS}-catbtn:not([${ATTR_CGXUI_STATE}="active"]):hover{
  background:linear-gradient(135deg, rgba(15,91,111,.74), rgba(4,21,42,.96));
}
html[data-h2o-chub-pane-bg="logo-blue"] ${P} .${CLS}-item:not([${ATTR_CGXUI_STATE}="active"]){
  background:
    radial-gradient(circle at 0% 0%, rgba(38,231,224,.10), transparent 45%),
    linear-gradient(135deg, rgba(5,24,43,.96), rgba(3,8,22,.98));
  border-color:rgba(85,178,230,.10);
}
html[data-h2o-chub-pane-bg="logo-blue"] ${P} .${CLS}-item:not([${ATTR_CGXUI_STATE}="active"]):hover{
  background:
    radial-gradient(circle at 0% 0%, rgba(38,231,224,.16), transparent 45%),
    linear-gradient(135deg, rgba(6,35,60,.98), rgba(3,12,30,.99));
}
html[data-h2o-chub-pane-bg="logo-blue"] ${P} .${CLS}-detail{
  background:
    radial-gradient(circle at 8% 0%, rgba(35,230,220,.14), transparent 42%),
    radial-gradient(circle at 98% 62%, rgba(0,128,220,.18), transparent 48%),
    linear-gradient(135deg, rgba(3,18,34,.98), rgba(1,7,19,.985));
  box-shadow:0 0 0 1px rgba(86,170,226,.16), 0 14px 38px rgba(0,0,0,.82);
}
html[data-h2o-chub-pane-bg="sand-glass"] ${P} .${CLS}-tab:not([${ATTR_CGXUI_STATE}="active"]){
  background:linear-gradient(135deg, rgba(70,68,60,.74), rgba(12,13,18,.90));
  box-shadow:0 0 0 1px rgba(255,235,195,.10), inset 0 4px 12px rgba(0,0,0,.42);
}
html[data-h2o-chub-pane-bg="sand-glass"] ${P} .${CLS}-catbtn:not([${ATTR_CGXUI_STATE}="active"]){
  background:linear-gradient(135deg, rgba(70,68,60,.64), rgba(12,13,18,.90));
  box-shadow:none;
}
html[data-h2o-chub-pane-bg="sand-glass"] ${P} .${CLS}-catbtn:not([${ATTR_CGXUI_STATE}="active"]):hover{
  background:linear-gradient(135deg, rgba(95,88,72,.72), rgba(18,18,22,.92));
}
html[data-h2o-chub-pane-bg="sand-glass"] ${P} .${CLS}-item:not([${ATTR_CGXUI_STATE}="active"]){
  background:
    radial-gradient(circle at 0% 0%, rgba(255,238,200,.08), transparent 45%),
    linear-gradient(135deg, rgba(30,30,34,.94), rgba(8,8,16,.97));
  border-color:rgba(255,235,195,.08);
}
html[data-h2o-chub-pane-bg="sand-glass"] ${P} .${CLS}-item:not([${ATTR_CGXUI_STATE}="active"]):hover{
  background:
    radial-gradient(circle at 0% 0%, rgba(255,238,200,.12), transparent 45%),
    linear-gradient(135deg, rgba(38,37,38,.96), rgba(12,12,18,.98));
}
html[data-h2o-chub-pane-bg="sand-glass"] ${P} .${CLS}-detail{
  background:
    radial-gradient(circle at 0% 0%, rgba(255,238,200,.10), transparent 44%),
    radial-gradient(circle at 100% 100%, rgba(190,160,95,.08), transparent 54%),
    linear-gradient(135deg, rgba(20,20,24,.96), rgba(7,7,14,.98));
  box-shadow:0 0 0 1px rgba(255,235,195,.09), 0 14px 38px rgba(0,0,0,.80);
}
html[data-h2o-chub-pane-bg="cockpit-ember"] ${P} .${CLS}-tab:not([${ATTR_CGXUI_STATE}="active"]){
  background:linear-gradient(135deg, rgba(38,38,36,.82), rgba(12,13,17,.94));
  box-shadow:0 0 0 1px rgba(138,170,214,.10), inset 0 4px 12px rgba(0,0,0,.44);
}
html[data-h2o-chub-pane-bg="cockpit-ember"] ${P} .${CLS}-catbtn:not([${ATTR_CGXUI_STATE}="active"]){
  background:linear-gradient(135deg, rgba(38,38,36,.76), rgba(12,13,17,.92));
  box-shadow:none;
}
html[data-h2o-chub-pane-bg="cockpit-ember"] ${P} .${CLS}-catbtn:not([${ATTR_CGXUI_STATE}="active"]):hover{
  background:linear-gradient(135deg, rgba(45,45,42,.82), rgba(18,20,25,.94));
}
html[data-h2o-chub-pane-bg="cockpit-ember"] ${P} .${CLS}-item:not([${ATTR_CGXUI_STATE}="active"]){
  background:
    radial-gradient(circle at 0% 0%, rgba(217,119,87,.075), transparent 44%),
    linear-gradient(135deg, rgba(30,30,28,.96), rgba(7,8,14,.98));
  border-color:rgba(138,170,214,.085);
}
html[data-h2o-chub-pane-bg="cockpit-ember"] ${P} .${CLS}-item:not([${ATTR_CGXUI_STATE}="active"]):hover{
  background:
    radial-gradient(circle at 0% 0%, rgba(217,119,87,.11), transparent 44%),
    linear-gradient(135deg, rgba(38,38,35,.97), rgba(11,12,17,.99));
}
html[data-h2o-chub-pane-bg="cockpit-ember"] ${P} .${CLS}-detail{
  background:
    radial-gradient(circle at 0% 0%, rgba(217,119,87,.10), transparent 44%),
    radial-gradient(circle at 100% 100%, rgba(91,123,201,.12), transparent 54%),
    linear-gradient(135deg, rgba(27,27,25,.97), rgba(8,9,14,.985));
  box-shadow:0 0 0 1px rgba(138,170,214,.10), 0 14px 38px rgba(0,0,0,.80);
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

  function CHUB_DETAIL_resetHorizontalScroll(panel){
    const detail = UTIL_q(`.${CLS}-detail`, panel);
    if (!detail) return;
    try { detail.scrollLeft = 0; } catch {}
    try {
      W.requestAnimationFrame(() => {
        try { detail.scrollLeft = 0; } catch {}
      });
    } catch {}
  }

	function ENGINE_renderDetail(panel){
		    const canonicalKey = FEATURE_getHubKey(STATE_CH.curKey);
		    if (canonicalKey !== STATE_CH.curKey) STATE_CH.curKey = canonicalKey;

		    PLUG_clearFeatureArtifacts(panel);
	    CHUB_DETAIL_resetHorizontalScroll(panel);
		    const meta = FEATURE_findMeta(canonicalKey) || FEATURE_META[0];
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
		    else if (canonicalKey === FEATURE_KEY_LIBRARY) CHUB_LIBRARY_mountSubtabs(panel);
		    else if (PLUG_getSubtabsForKey(canonicalKey).length) CHUB_PLUGIN_mountSubtabs(panel, canonicalKey);

	    const existingDataSummary = UTIL_q(`.${CLS}-data-summary`, panel);
	    if (existingDataSummary) {
	      try { existingDataSummary.remove(); } catch {}
	    }
	    PLUG_runDetailHook(detailKey, panel);

    ENGINE_renderControls(panel);
    CHUB_DETAIL_resetHorizontalScroll(panel);
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
      SAFE_call('bindUserPillIdentity', () => CHUB_USER_bindIdentity());

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


  // Boot now (document-idle). Defensive: wait for DOM if needed.
  const bootNow = () => SAFE_call('boot-top', () => CORE_CH_boot());
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', bootNow, { once: true });
  else bootNow();

  } catch (e) {
    try { console.error('[H2O ControlHub] ❌ top-level crash', e); } catch {}
  }

})();
