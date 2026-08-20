// ==H2O Module==
// @h2o-id             7a1a.prompt.manager
// @name               7A1a.⬜️✍️ Prompt Manager ✍️
// @namespace          H2O.Premium.CGX.prompt.manager
// @author             HumamDev
// @version            3.1.4
// @revision           001
// @build              260304-102754
// @description        Prompt Manager (Simple + Settings/Edit), Quick Replies tray, History capture, ▲▼ reorder — Contract v2.0 Stage-1 compliant.
// @match              https://chatgpt.com/*
// @run-at             document-end
// @grant              none
// ==/H2O Module==
//
// NOTE: the former `@require` of sortablejs was removed. `@require` is a
// userscript directive; the extension loader parses it only to derive
// `/alias/` load-order hints and never fetches it, so `window.Sortable` was
// never defined at runtime. Reordering is served by the ▲/▼ controls, which
// are keyboard-reachable and need no third-party dependency.

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
  const W = window;
  const D = document;

  // ✅ Identity (LOCKED first)
  const TOK = 'PM';                 // Prompt Manager
  const PID = 'prmptmngr';          // canonical (lowercase consonant-only)
  const BrID = PID;                 // default
  const DsID = PID;                 // default
  const CID = 'pmanager';           // identifiers only
  const SkID = 'prmn';              // Skin/UI hooks (Prompt->pr, Manager->mn)

  // ✅ Version — single source of truth.
  // Must stay byte-identical to the `@version` metadata line above; a comment
  // cannot interpolate a constant, so the pairing is asserted by
  // tools/validation/prompt-manager/validate-prompt-manager-source-invariants.mjs.
  const MOD_VERSION = '3.1.4';

  // Labels only
  const MODTAG = 'PMgr';
  const MODICON = '✍️';
  const EMOJI_HDR = 'OFF';
  const SUITE = 'prm';
  const HOST = 'cgx';

  // Derived (identifiers only)
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  /* [DEFINE][DOM] Real attribute-name constants (ATTR_) */
  const ATTR_CGXUI = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';
  const ATTR_CGXUI_THEME = 'data-cgxui-theme'; // owned theme token (host-theme authority)
  const ATTR_ROLE = 'data-message-author-role';

  /* [DEFINE][STORE] Namespaces (boundary-only) */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`; // no trailing ":"

  /* [DEFINE][EV] Canonical events */
  const EV_PM_READY_V1 = 'evt:h2o:promptmgr:ready';
  const EV_PM_CHANGED_V1 = 'evt:h2o:promptmgr:changed';
  const EV_EXPORT_RUN = 'evt:h2o:export:run';
  const EV_INPUT_DOCK_READY = 'evt:h2o:inputdock:ready';
  // Legacy bridge (kept for older consumers, including Control Hub bridge code)
  const EV_PM_READY_LEGACY_V1 = 'evt:h2o:pm:ready:v1';
  const EV_PM_CHANGED_LEGACY_V1 = 'evt:h2o:pm:changed:v1';

  /* [STATE][EV] ready emitted guard */
  let PM_READY_EMITTED = false;


  /* [DEFINE][UI] UI tokens (SkID-based values) */
  const UI_PM_WRAP = `${SkID}-wrap`;
  const UI_PM_BTNBOX = `${SkID}-btnbox`;
  const UI_PM_EXPORT_BTN = `${SkID}-export-btn`;
  const UI_PM_BTN = `${SkID}-btn`;
  const UI_PM_PANEL = `${SkID}-panel`;
  const UI_PM_OVERLAY = `${SkID}-overlay`;

  const UI_PM_MODE_SIMPLE = `${SkID}-mode-simple`;
  const UI_PM_MODE_EDIT = `${SkID}-mode-edit`;

  // Distinct per-mode search identifiers. Both panes previously shared one
  // token, so `querySelector` bound only the first (Simple) input and the Edit
  // search box was inert while the Edit list was filtered by the Simple value.
  const UI_PM_SEARCH_SIMPLE = `${SkID}-search-simple`;
  const UI_PM_SEARCH_EDIT = `${SkID}-search-edit`;

  const UI_PM_AUTOSEND_SIMPLE = `${SkID}-autosend-simple`;
  const UI_PM_AUTOSEND_EDIT = `${SkID}-autosend-edit`;

  const UI_PM_LIST_SIMPLE = `${SkID}-list-simple`;
  const UI_PM_LIST_EDIT = `${SkID}-list-edit`;


  /* [DEFINE][UI][2A] Status line + in-panel editor.
   * One status surface for the whole panel, and one editor that replaces the
   * Edit-pane list region. Both live inside the existing panel: no modal, no
   * second floating layer, no new overlay. */
  const UI_PM_STATUS = `${SkID}-status`;

  const UI_PM_EDITOR = `${SkID}-editor`;
  const UI_PM_ED_HEADING = `${SkID}-ed-heading`;
  const UI_PM_ED_TITLE_ROW = `${SkID}-ed-title-row`;
  const UI_PM_ED_TITLE = `${SkID}-ed-title`;
  const UI_PM_ED_TYPE_ROW = `${SkID}-ed-type-row`;
  const UI_PM_ED_TYPE_PROMPT = `${SkID}-ed-type-prompt`;
  const UI_PM_ED_TYPE_APPEND = `${SkID}-ed-type-append`;
  const UI_PM_ED_FAV = `${SkID}-ed-fav`;
  const UI_PM_ED_BODY = `${SkID}-ed-body`;
  const UI_PM_ED_SAVE = `${SkID}-ed-save`;
  const UI_PM_ED_CANCEL = `${SkID}-ed-cancel`;
  const UI_PM_ED_DELETE = `${SkID}-ed-delete`;
  const UI_PM_ED_DISCARD = `${SkID}-ed-discard`;
  const UI_PM_ED_DISCARD_YES = `${SkID}-ed-discard-yes`;
  const UI_PM_ED_DISCARD_NO = `${SkID}-ed-discard-no`;
  const UI_PM_NEW_BTN = `${SkID}-new-btn`;

  /* [DEFINE][UI][2C] Portability controls.
   *
   * Export/Import sit in the Edit-pane management row beside "New prompt", and
   * the import confirmation is an inline strip in that same row. No modal, no
   * second overlay and no native dialog: Phase 2A retired the last alert() in
   * this module and nothing here reintroduces one.
   *
   * UI_PM_EXPORT_BTN above is the unrelated per-chat transcript export button
   * (owner `xpch`); the library export deliberately carries its own token so a
   * selector can never bind the wrong control. */
  const UI_PM_PORT_ROW = `${SkID}-port-row`;
  const UI_PM_EXPORT_LIB = `${SkID}-export-lib`;
  const UI_PM_IMPORT_BTN = `${SkID}-import-btn`;
  const UI_PM_IMPORT_FILE = `${SkID}-import-file`;
  const UI_PM_IMPORT_BOX = `${SkID}-import-box`;
  const UI_PM_IMPORT_SUMMARY = `${SkID}-import-summary`;
  const UI_PM_IMPORT_MERGE = `${SkID}-import-merge`;
  const UI_PM_IMPORT_REPLACE = `${SkID}-import-replace`;
  const UI_PM_IMPORT_CANCEL = `${SkID}-import-cancel`;

  const UI_PM_SETTINGS = `${SkID}-settings`;
  const UI_PM_BACK = `${SkID}-back`;
  const UI_PM_CLOSE_SIMPLE = `${SkID}-close-simple`;
  const UI_PM_CLOSE_EDIT = `${SkID}-close-edit`;

  const UI_PM_FILTER_ROW = `${SkID}-filter-row`;
  const UI_PM_FILTER_ALL = `${SkID}-filter-all`;
  const UI_PM_FILTER_PROMPTS = `${SkID}-filter-prompts`;
  const UI_PM_FILTER_APPEND = `${SkID}-filter-append`;
  const UI_PM_FILTER_FAVORITES = `${SkID}-filter-favorites`;
  const UI_PM_FILTER_QUICK = `${SkID}-filter-quick`;
  const UI_PM_FILTER_HISTORY = `${SkID}-filter-history`;
  const UI_PM_FILTER_DRAFTS = `${SkID}-filter-drafts`;
  const UI_PM_FILTER_PASTED = `${SkID}-filter-pasted`;

  const UI_PM_EDIT_FILTER_ROW = `${SkID}-edit-filter-row`;
  const UI_PM_EDIT_FILTER_ALL = `${SkID}-edit-filter-all`;
  const UI_PM_EDIT_FILTER_PROMPTS = `${SkID}-edit-filter-prompts`;
  const UI_PM_EDIT_FILTER_APPEND = `${SkID}-edit-filter-append`;
  const UI_PM_EDIT_FILTER_FAVORITES = `${SkID}-edit-filter-favorites`;
  const UI_PM_EDIT_FILTER_QUICK = `${SkID}-edit-filter-quick`;
  const UI_PM_EDIT_FILTER_HISTORY = `${SkID}-edit-filter-history`;
  const UI_PM_EDIT_FILTER_DRAFTS = `${SkID}-edit-filter-drafts`;
  const UI_PM_EDIT_FILTER_PASTED = `${SkID}-edit-filter-pasted`;

  const UI_PM_QUICK_TRAY = `${SkID}-quick-tray`;
  const UI_PM_QUICK_MODE_DOT = `${SkID}-quick-mode-dot`;

  const UI_PM_TOOLTIP = `${SkID}-tooltip`;
  const LEGACY_XPCH_PROMPT_EXPORT_SEL = '[data-cgxui-owner="xpch"][data-cgxui="xpch-prompt-export-btn"]';

  const DOCK_PM = Object.freeze({
    REG_TOP: `${SkID}-dock-top`,
    STATE_DOCK: 'dock',
  });

  // state classes (shared across render + public API)
  const UI_PM_CLS_OPEN = `cgxui-${SkID}--panel-open`;
  const UI_PM_CLS_OVSHOW = `cgxui-${SkID}--overlay-show`;
  const UI_PM_CLS_QSHOW = `cgxui-${SkID}--quick-show`;
  const UI_PM_CLS_DOT_SHOW = `cgxui-${SkID}--dot-show`;

  /* [DEFINE][CSS] style id */
  const CSS_PM_STYLE_ID = `cgxui-${SkID}-style`;

  /* [DEFINE][A11Y] Stable panel id and accessible name.
   *
   * The id is fixed rather than generated: the single-root architecture means
   * exactly one panel exists at a time, a generated id would change on every
   * remount and break the trigger's aria-controls reference, and a stable value
   * is what a disclosure relationship needs.
   *
   * The name is an aria-label because the panel has no visible heading to point
   * aria-labelledby at. Inventing a hidden heading purely to satisfy the
   * relationship would add markup nobody sees for no additional benefit. */
  const A11Y_PM_PANEL_ID = `cgxui-${SkID}-panel`;
  const A11Y_PM_PANEL_LABEL = 'Prompt Manager';

  /* [DEFINE][CFG] knobs */
  const CFG_PM = {
    PANEL_MAX_H: 0.62, // vh
    PANEL_W_MAX: 580,
    PANEL_W_VW: 90,
    FLOAT_TOP_GAP_Y: 25,
    FLOAT_LEFT_INSET_X_FALLBACK: 5,
    ANCHOR_MAX_VH: 0.9,
    ANCHOR_MIN_PX: 280,
    ANCHOR_MAX_PX: 1200,
    FLOAT_MIN_TOP_SAFE_Y: 52,
    CLICK_DELAY_MS: 220,
    EXPORT_BTN_LABEL: 'Export',
    EXPORT_BTN_TITLE: 'Export this chat',
    EXPORT_MODE_FULL: 'full',
    EXPORT_MODE_MINIMAL: 'minimal',
    CHAT_PATH_RE: /\/c\/([a-z0-9-]+)/i,
    CHAT_TITLE_SUFFIX_RE: /\s*[-|]\s*ChatGPT.*$/i,
    CHAT_TITLE_PREFIX: 'Chat',
    CHAT_TITLE_FALLBACK: 'Chat',
    SEND_CLICK_DELAY_MS: 20,
    QUICK_TRAY_SHOW_ON_BOOT: true,
    HISTORY_MAX: 50,
    HISTORY_BYTE_CAP: 80_000,
    DRAFTS_MAX: 50,
    DRAFTS_BYTE_CAP: 60_000,
    PASTED_MAX: 50,
    PASTED_BYTE_CAP: 80_000,
    TOOLTIP_PAD: 12,
    // 🎨 Aurora Glass panel skin (tweak freely)
    GLASS_TEXT: '#f4f6fb',
    GLASS_TINT_A: 'rgba(255,255,255,0.00)',
    GLASS_TINT_B: 'rgba(255,255,255,0.00)',
    GLASS_BG_A: 'rgba(255,255,255,0.045)',
    GLASS_BG_B: 'rgba(255,255,255,0.030)',
    GLASS_BLUR_PX: 14,
    GLASS_SAT: 1.05,
    GLASS_SHADOW: '0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10)',
    GLASS_CONTRAST: 1.08,
    GLASS_BRIGHT: 1.03,
    PANEL_Z: 9999,
  };

  const VIEW_PM = Object.freeze({
    CHAT_PATH_RE: /^(?:\/c\/|\/g\/[^/]+\/c\/)/i,
    SEARCH_SEL: [
      '[role="dialog"] input[placeholder*="Search chats" i]',
      'input[placeholder*="Search chats" i]',
      '[role="dialog"] input[type="search"]',
    ].join(', '),
  });

  /* [DEFINE][KEY] Disk keys */
  const KEY_PM_STATE_PROMPTS_V1 = `${NS_DISK}:state:prompts:v1`;
  const KEY_PM_CFG_AUTOSEND_V1 = `${NS_DISK}:cfg:auto_send:v1`;
  const KEY_PM_STATE_LAST_USED_V1 = `${NS_DISK}:state:last_used_id:v1`;
  const KEY_PM_STATE_QUICK_V1 = `${NS_DISK}:state:quick_replies:v1`;
  const KEY_PM_STATE_HISTORY_V1 = `${NS_DISK}:state:history:v1`;
  const KEY_PM_STATE_DRAFTS_V1 = `${NS_DISK}:state:drafts:v1`;
  const KEY_PM_STATE_PASTED_V1 = `${NS_DISK}:state:pasted:v1`;
  const KEY_PM_UI_MODE_V1 = `${NS_DISK}:ui:mode:v1`;
  // One-time seed marker: `{ prompts:boolean, quickReplies:boolean }`. A flag is
  // set only after that collection's seed write actually succeeded. Once set, an
  // absent primary key resolves to [] instead of resurrecting the defaults.
  const KEY_PM_STATE_SEEDED_V1 = `${NS_DISK}:state:seeded:v1`;
  const KEY_PM_MIG_KEYS_V1 = `${NS_DISK}:migrate:pm_keys:v1`;
  const KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1 = `${NS_DISK}:migrate:pm_drafts_from_history:v1`;
  /* [2C] Pre-import backup of the two portable collections. Exactly ONE latest
   * snapshot, never a log: an unbounded backup history would consume the very
   * quota whose exhaustion produces the write failures this key exists to
   * survive. It holds Prompts and Quick Replies only — never a capture store. */
  const KEY_PM_STATE_IMPORT_BACKUP_V1 = `${NS_DISK}:state:import_backup:v1`;

  /* [DEFINE][MIG] legacy keys (read+remove once) */
  const KEY_LEG_PROMPTS = 'ho:pm:prompts';
  const KEY_LEG_AUTOSEND = 'ho:pm:autoSend';
  const KEY_LEG_LAST_USED = 'ho:pm:lastUsedId';
  const KEY_LEG_QUICK = 'ho:pm:quickReplies';
  const KEY_LEG_HISTORY = 'ho:pm:history';
  const KEY_LEG_MODE = 'ho:pm:mode';

  /* ───────────────────────────── ⬛️ DEFINE — Runtime Vault (Brain) 📄🔒💧 ───────────────────────────── */
  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));
  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP, modtag: MODTAG, suite: SUITE, host: HOST,
  };
  MOD_OBJ.api = MOD_OBJ.api || {};

  /* [DIAG] bounded flight recorder */
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;
  /* [DIAG] durable failure counters (data-safety signals; no UI in this phase) */
  DIAG.counters = DIAG.counters || { writeFailures: 0, corruptReads: 0, seeds: 0 };

  /* ───────────────────────────── 🟦 SHAPE — Contracts / Types 📄🔒💧 ───────────────────────────── */
  // Prompt item:
  // { id, title, body, favorite, type: 'prompt'|'append', createdAt, updatedAt }
  // Quick item:
  // { id, text, order, createdAt, updatedAt }
  // History item:
  // { id, text, createdAt, source?: 'send' }
  // Draft item:
  // { id, text, createdAt }
  // Pasted item:
  // { id, text, createdAt }

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */

  /* [STORE] Write-failure kinds.
   *
   * A boolean `false` told every caller the same thing whatever went wrong, so
   * the user got one generic sentence for four unrelated conditions. These kinds
   * are INTERNAL: each classifies a single write attempt and travels with that
   * attempt's own result object. There is deliberately no module-level "last
   * error" field — a nested or later write would make such a field describe the
   * wrong attempt, which is exactly the staleness this design avoids. */
  const PM_WRITE_OK = 'ok';
  const PM_WRITE_QUOTA = 'quota';
  const PM_WRITE_BLOCKED = 'blocked';
  const PM_WRITE_SERIALIZATION = 'serialization';
  const PM_WRITE_UNKNOWN = 'unknown';

  /* Classify a setItem exception. Fails closed: only an exception actually
   * carrying the recognised quota or blocked signature is labelled as such, and
   * anything else stays UNKNOWN rather than being guessed at. Legacy numeric
   * codes are accepted alongside the modern DOMException names because the name
   * is absent on some engines (22 = QuotaExceededError,
   * 1014 = NS_ERROR_DOM_QUOTA_REACHED). */
  const UTIL_classifyWriteError = (e) => {
    const name = String((e && e.name) || '');
    const code = Number(e && e.code);
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return PM_WRITE_QUOTA;
    if (code === 22 || code === 1014) return PM_WRITE_QUOTA;
    if (name === 'SecurityError' || name === 'InvalidAccessError' || name === 'InvalidStateError') {
      return PM_WRITE_BLOCKED;
    }
    return PM_WRITE_UNKNOWN;
  };

  const UTIL_writeOk = () => ({ ok: true, kind: PM_WRITE_OK, error: null });
  const UTIL_writeFail = (kind, error) => ({ ok: false, kind, error: error || null });

  const UTIL_storage = {
    getStr(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setStr(key, val) { try { localStorage.setItem(key, String(val)); return true; } catch { return false; } },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    /* [STORE] Classified write. Serialization and the storage write are two
     * separate try blocks ON PURPOSE: a single catch around both cannot tell a
     * value that could not be encoded from a store that could not accept it,
     * and that distinction is the whole point of this path. When serialization
     * fails no setItem is attempted at all, so the stored bytes are untouched.
     *
     * JSON.stringify returns undefined (without throwing) for undefined and for
     * a lone function, so the string check is a real serialization failure and
     * not defensive padding. */
    setJSONResult(key, obj) {
      let text;
      try {
        text = JSON.stringify(obj);
      } catch (e) {
        return UTIL_writeFail(PM_WRITE_SERIALIZATION, e);
      }
      if (typeof text !== 'string') {
        return UTIL_writeFail(PM_WRITE_SERIALIZATION, new Error('value is not serializable'));
      }
      try {
        localStorage.setItem(key, text);
        return UTIL_writeOk();
      } catch (e) {
        return UTIL_writeFail(UTIL_classifyWriteError(e), e);
      }
    },
    /* Boolean spelling retained so every existing caller and its pinned
     * contract are unchanged; it is now a thin projection of setJSONResult. */
    setJSON(key, obj) { return UTIL_storage.setJSONResult(key, obj).ok; },
    del(key) { try { localStorage.removeItem(key); return true; } catch { return false; } },

    /* [STORE] Raw read that distinguishes "absent" from "present but malformed".
     *
     * getJSON() above collapses both into its `fallback`, which is what let a
     * single unparseable value be treated as a first run — and overwritten with
     * seed data. This path is additive: getJSON()'s contract is unchanged for
     * its existing callers.
     *
     * Absence is defined strictly as `getItem() === null`. ANY returned string
     * counts as present — including the empty string, which is a real stored
     * value that JSON.parse rejects. Treating '' as absent would let a truncated
     * or cleared-to-empty write be re-seeded over, which is exactly the class of
     * data loss this path exists to prevent.
     *
     * Returns { ok, present, raw }:
     *   ok:false              → the storage read itself threw (blocked/unavailable)
     *   ok:true present:false → key genuinely absent (getItem returned null)
     *   ok:true present:true  → `raw` is the exact stored string, byte-for-byte
     */
    readRaw(key) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return { ok: true, present: false, raw: null, err: null };
        return { ok: true, present: true, raw, err: null };
      } catch (e) {
        return { ok: false, present: false, raw: null, err: e };
      }
    },

    /* [STORE] Bounded key listing — used only to look for an existing quarantine
     * copy. Returns [] and reports diagnostically if enumeration is unavailable. */
    keys() {
      try {
        const out = [];
        const n = Number(localStorage.length) || 0;
        for (let i = 0; i < n; i += 1) {
          const k = localStorage.key(i);
          if (typeof k === 'string') out.push(k);
        }
        return out;
      } catch {
        return null; // null = enumeration failed (distinct from "no keys")
      }
    },
  };

  const UTIL_now = () => Date.now();

  const UTIL_diagStep = (msg, extra) => {
    try {
      const it = { t: Math.round(performance.now() - DIAG.t0), msg: String(msg || '') };
      if (extra !== undefined) it.x = (typeof extra === 'string') ? extra.slice(0, 240) : undefined;
      DIAG.steps.push(it);
      if (DIAG.steps.length > DIAG.bufMax) DIAG.steps.splice(0, DIAG.steps.length - DIAG.bufMax);
    } catch {}
  };
  const UTIL_diagErr = (where, err) => {
    try {
      const it = { t: Math.round(performance.now() - DIAG.t0), where: String(where || ''), err: String(err?.stack || err || '') };
      DIAG.errors.push(it);
      if (DIAG.errors.length > DIAG.errMax) DIAG.errors.splice(0, DIAG.errors.length - DIAG.errMax);
    } catch {}
  };

  const UTIL_escapeHtml = (str = '') =>
    String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

  /* [UTIL] Small stable hash (FNV-1a, 32-bit, hex).
   * Deterministic across runs and processes — no clock, no randomness — so a
   * value derived from it can be recomputed identically on a later boot. Used
   * only to compress text into a migration identity, never for security. */
  const UTIL_hash32 = (input) => {
    const s = String(input ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };

  const UTIL_cryptoId = () => {
    try {
      if (W.crypto?.randomUUID) return W.crypto.randomUUID();
      const a = new Uint8Array(16);
      W.crypto.getRandomValues(a);
      return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return `pm_${Math.random().toString(16).slice(2)}_${Date.now()}`;
    }
  };

  const UTIL_event = {
    emit(type, detail) {
      try { W.dispatchEvent(new CustomEvent(type, { detail })); } catch {}
    },
  };

  const UTIL_emitPmChanged = (detail) => {
    UTIL_event.emit(EV_PM_CHANGED_V1, detail);
    UTIL_event.emit(EV_PM_CHANGED_LEGACY_V1, detail);
  };

  const UTIL_getChatId = () => {
    const fromCore = String(W.H2O?.util?.getChatId?.() || '').trim();
    if (fromCore) return fromCore;
    const m = String(W.location?.pathname || '').match(CFG_PM.CHAT_PATH_RE);
    return m ? String(m[1] || '').trim() : '';
  };

  const UTIL_getChatTitle = (chatId = '') => {
    const heading = D.querySelector('main h1, [data-testid="conversation-title"], [data-testid="chat-title"]');
    const text = String(heading?.textContent || '').trim();
    if (text) return text;
    const raw = String(D.title || '').trim();
    const stripped = raw.replace(CFG_PM.CHAT_TITLE_SUFFIX_RE, '').trim();
    if (stripped) return stripped;
    return chatId ? `${CFG_PM.CHAT_TITLE_PREFIX} ${chatId}` : CFG_PM.CHAT_TITLE_FALLBACK;
  };

  const UTIL_emitExportRun = (modeRaw, shiftKey = false) => {
    const mode = (String(modeRaw || '').toLowerCase() === CFG_PM.EXPORT_MODE_MINIMAL || !!shiftKey)
      ? CFG_PM.EXPORT_MODE_MINIMAL
      : CFG_PM.EXPORT_MODE_FULL;
    const chatId = UTIL_getChatId();
    const title = UTIL_getChatTitle(chatId);
    UTIL_event.emit(EV_EXPORT_RUN, { chatId, title, ts: Date.now(), mode });
  };

  /* ───────────────────────────── 🔴 STATE — Registries / Caches 📄🔓💧 ───────────────────────────── */
  const STATE_PM = {
    booted: false,
    // Set when a read was malformed or a write failed. Diagnostics-only in this
    // phase; the user-facing banner is a later phase.
    dataError: false,
    ui: {
      root: null,
      panel: null,
      overlay: null,
      tooltip: null,
      pmClickTimer: 0,
      dockMode: false,
      dockBridgeWired: false,
      dockRegActive: false,
      quickSendMode: false,
      // Canonical search query. Neither DOM input owns the query; both mirror it.
      searchQuery: '',
      simpleTypeFilter: 'all', // all|prompt|append|favorites|quick|history|draft|pasted
      editCategory: 'all',     // all|prompt|append|favorites|quick|history|draft|pasted
      /* [2A] In-panel editor. One controller drives two field shapes:
       * kind 'prompt' (title/body/type/favorite) and kind 'quick' (text only).
       * `initial` is the pristine draft used for dirty comparison; `draft` is
       * the live one. `deleteArmed` drives the inline two-step delete. */
      editor: {
        open: false,
        kind: 'prompt',   // prompt|quick
        mode: 'create',   // create|edit
        id: null,
        initial: null,
        draft: null,
        dirty: false,
        deleteArmed: false,
        discardArmed: false,
      },
      editorDeleteTimer: 0,
      statusTimer: 0,
      /* [2C] Import confirmation. `pending` holds a FULLY VALIDATED envelope and
       * nothing else: a file that failed validation never reaches this slot, so
       * the Merge/Replace controls can only ever act on accepted data. Memory
       * only — a pending import is deliberately not persisted, so a reload
       * cannot resurrect a confirmation the user never completed. */
      /* [2C-closure] `recoveryRequired` latches when a failed rollback left
       * storage in a state the module could not decode. While it is set, every
       * further portability mutation fails closed rather than acting on an
       * in-memory pair it cannot vouch for. Memory only, so a reload clears it
       * — which is exactly the recovery the message asks for. */
      /* [2C-closure-2] `readSeq` is the single read-generation authority for
       * file selection. Every FileReader completion carries the token it was
       * started with and must match the CURRENT value before it may touch
       * pending, feedback or the preview. Without it, two selections in flight
       * race: the slower read completes last and silently replaces the file the
       * user actually chose. Memory only, never persisted. */
      port: { pending: null, recoveryRequired: false, readSeq: 0 },
      /* [2B] One owned timer for the debounced search rerender. The canonical
       * query itself is never debounced — only the expensive re-render is. */
      searchRenderTimer: 0,
      /* [2A-fix F] Feedback authority. The status line used to live only in the
       * DOM, so a self-heal remount silently destroyed a persistent error and
       * the user was left with no record of a failed write. State owns the
       * message now; the DOM mirrors it. Memory only — deliberately NOT a
       * storage key, so nothing survives a page reload. */
      feedback: { message: '', kind: '' },
    },
    data: {
      prompts: [],
      quick: [],
    },
    historyCapture: {
      form: null,
      sendBtn: null,
      unbindForm: null,
      unbindSendBtn: null,
    },
    clean: {
      fns: [],
      obs: [],
      timers: new Set(),    // one-shot timeout ids; self-removing when they fire
      intervals: new Set(), // interval ids; owned until explicitly cleared
      nodes: [],
    },
  };

  const CLEAN_addFn = (fn) => { if (typeof fn === 'function') STATE_PM.clean.fns.push(fn); };
  const CLEAN_addNode = (n) => { if (n) STATE_PM.clean.nodes.push(n); };
  const CLEAN_addObs = (o) => { if (o) STATE_PM.clean.obs.push(o); };

  /* [CLEAN] Owned timer helpers.
   * One-shot ids drop out of the Set as soon as they fire (or when cleared), so
   * the bookkeeping cannot grow without bound. Interval ids stay owned until
   * cleared or disposed. */
  const CLEAN_setTimeout = (fn, ms) => {
    let id = 0;
    id = W.setTimeout(() => {
      STATE_PM.clean.timers.delete(id);
      SAFE_try('CLEAN_setTimeout.cb', fn, null);
    }, ms);
    if (id) STATE_PM.clean.timers.add(id);
    return id;
  };
  const CLEAN_clearTimeout = (id) => {
    if (!id) return;
    STATE_PM.clean.timers.delete(id);
    try { W.clearTimeout(id); } catch {}
  };
  const CLEAN_setInterval = (fn, ms) => {
    const id = W.setInterval(fn, ms);
    if (id) STATE_PM.clean.intervals.add(id);
    return id;
  };
  const CLEAN_clearInterval = (id) => {
    if (!id) return;
    STATE_PM.clean.intervals.delete(id);
    try { W.clearInterval(id); } catch {}
  };

  let PM_BOOT_RETRY_TIMER = 0;
  let PM_SELF_HEAL_TIMER = 0;
  let PM_SELF_HEAL_OBS = null;
  let PM_THEME_OBS = null;
  let PM_FORCE_RECOVER = false;
  let PM_LAYOUT_RAF = 0;

  /* ───────────────────────────── 🟫 VERIFY/SAFETY — Guards 📝🔓💧 ───────────────────────────── */
  const SAFE_try = (where, fn, fallback) => {
    try { return fn(); } catch (e) { UTIL_diagErr(where, e); return fallback; }
  };

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO Adapters 📝🔓💥 ───────────────────────────── */
  /* [SEL] registry (no ad-hoc selector strings elsewhere) */
  const SEL_PM = {
    HOST_FORM: 'form[data-type="unified-composer"], form.group\\/composer, form[data-testid="composer"], form[action*="conversation"]',
    HOST_EDITABLE: [
      '#prompt-textarea',
      'form[data-type="unified-composer"] [contenteditable="true"]',
      'form.group\\/composer [contenteditable="true"]',
      'form[data-testid="composer"] [contenteditable="true"]',
      'form[action*="conversation"] [contenteditable="true"]',
    ].join(', '),
    HOST_TEXTAREA: 'form[data-testid="composer"] textarea, form[action*="conversation"] textarea',
    HOST_SEND_BTN: 'form[data-type="unified-composer"] button[data-testid="send-button"], form.group\\/composer button[data-testid="send-button"], form[data-testid="composer"] button[data-testid="send-button"], form[action*="conversation"] button[data-testid="send-button"]',
    HOST_ANY_FORM_BTN: 'form[data-type="unified-composer"] button, form.group\\/composer button, form[data-testid="composer"] button, form[action*="conversation"] button',

    HOST_MESSAGE_GROUP: `[${ATTR_ROLE}="assistant"],[${ATTR_ROLE}="user"]`,

    // owned UI (scoped by owner in helpers)
    UI_WRAP: () => `[${ATTR_CGXUI}="${UI_PM_WRAP}"][${ATTR_CGXUI_OWNER}="${SkID}"]`,
    UI_TOOLTIP: () => `[${ATTR_CGXUI}="${UI_PM_TOOLTIP}"][${ATTR_CGXUI_OWNER}="${SkID}"]`,
  };

  const DOM_q = (sel, root = D) => root.querySelector(sel);
  const DOM_qa = (sel, root = D) => Array.from(root.querySelectorAll(sel));

  const DOM_isVisible = (el) => {
    if (!el) return false;
    try {
      if (!D.contains(el)) return false;
      const cs = W.getComputedStyle?.(el);
      if (cs) {
        if (cs.display === 'none') return false;
        if (cs.visibility === 'hidden') return false;
        const op = Number.parseFloat(cs.opacity || '1');
        if (Number.isFinite(op) && op <= 0.02) return false;
      }
      const r = el.getBoundingClientRect?.();
      if (!r) return false;
      if (r.width <= 0 || r.height <= 0) return false;
      return true;
    } catch {
      return false;
    }
  };

  const VIEW_PM_isChatPath = () => VIEW_PM.CHAT_PATH_RE.test(String(W.location?.pathname || '').trim());

  const VIEW_PM_isSearchPanelOpen = () => {
    const cands = DOM_qa(VIEW_PM.SEARCH_SEL);
    if (!cands.length) return false;
    for (const el of cands) {
      if (!DOM_isVisible(el)) continue;
      const ph = String(el.getAttribute?.('placeholder') || '').toLowerCase();
      if (ph.includes('search chats')) return true;
      if (el.closest?.('[role="dialog"]')) return true;
    }
    return false;
  };

  const VIEW_PM_shouldShow = () => VIEW_PM_isChatPath() && !VIEW_PM_isSearchPanelOpen();

  const DOM_setStateToken = (el, token, on) => {
    if (!el || !token) return;
    const t = String(token).trim();
    if (!t) return;
    const raw = String(el.getAttribute?.(ATTR_CGXUI_STATE) || '').trim();
    const set = new Set(raw ? raw.split(/\s+/g) : []);
    if (on) set.add(t);
    else set.delete(t);
    if (set.size) el.setAttribute(ATTR_CGXUI_STATE, Array.from(set).join(' '));
    else el.removeAttribute(ATTR_CGXUI_STATE);
  };

  const DOM_scoreBottomLaneRect = (r) => {
    if (!r) return 0;
    const vh = Math.max(1, Number(W.innerHeight) || 0);
    const bottom = Number(r.bottom);
    let score = 0;
    if (Number.isFinite(bottom)) {
      if (bottom >= (vh * 0.45)) score += 2;
      if (bottom <= (vh + 24)) score += 1;
      const distFromBottom = Math.abs(vh - bottom);
      score += Math.max(0, 420 - distFromBottom) / 70;
    }
    return score;
  };

  const DOM_pickEditableInForm = (form) => {
    if (!form) return null;
    const cands = Array.from(form.querySelectorAll('#prompt-textarea, textarea, div[contenteditable="true"], [contenteditable="true"]'));
    if (!cands.length) return null;

    let best = null;
    let bestScore = -1;
    for (const el of cands) {
      if (!el) continue;
      let score = 0;
      if (el.id === 'prompt-textarea') score += 12;
      if (String(el.getAttribute?.('contenteditable') || '').toLowerCase() === 'true') score += 3;
      if (el.tagName === 'TEXTAREA') score += 2;
      if (DOM_isVisible(el)) score += 4;
      try { score += DOM_scoreBottomLaneRect(el.getBoundingClientRect()); } catch {}

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  };

  const DOM_getForm = () => {
    const promptTa = D.getElementById?.('prompt-textarea');
    const promptForm = promptTa?.closest?.('form') || null;
    if (promptForm && DOM_isVisible(promptForm)) return promptForm;

    const forms = DOM_qa(SEL_PM.HOST_FORM);
    if (!forms.length) return null;

    let best = null;
    let bestScore = -1;
    for (const f of forms) {
      if (!f) continue;

      const isComposer = !!f.matches?.('form[data-testid="composer"]');
      const isUnified = !!f.matches?.('form[data-type="unified-composer"], form.group\\/composer');
      const isConvo = !!f.matches?.('form[action*="conversation"]');
      const hasPrompt = !!f.querySelector?.('#prompt-textarea');
      const hasSend = !!f.querySelector?.('button[data-testid="send-button"], button[aria-label*="Send" i]');
      const hasInput = !!DOM_pickEditableInForm(f);

      if (!(isUnified || isComposer || isConvo || hasPrompt || hasSend || hasInput)) continue;

      let score = 0;
      if (isUnified) score += 13;
      if (isComposer) score += 12;
      if (hasPrompt) score += 10;
      if (isConvo) score += 8;
      if (hasSend) score += 6;
      if (hasInput) score += 4;
      if (DOM_isVisible(f)) score += 3;
      try { score += DOM_scoreBottomLaneRect(f.getBoundingClientRect()); } catch {}

      if (score > bestScore) {
        best = f;
        bestScore = score;
      }
    }

    if (best && bestScore >= 8) return best;

    // Fallback: visible input host form if direct selectors miss.
    const fallbackInput = (
      D.getElementById?.('prompt-textarea') ||
      DOM_qa(SEL_PM.HOST_EDITABLE).find((el) => DOM_isVisible(el)) ||
      DOM_qa(SEL_PM.HOST_TEXTAREA).find((el) => DOM_isVisible(el)) ||
      null
    );
    const inputForm = fallbackInput?.closest?.('form') || null;
    if (inputForm && DOM_isVisible(inputForm)) return inputForm;

    // Last fallback: visible bottom-lane form with a send button.
    let tail = null;
    let tailScore = -Infinity;
    const tailForms = DOM_qa('form');
    for (const f of tailForms) {
      if (!DOM_isVisible(f)) continue;
      if (!f.querySelector?.('button[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="send" i]')) continue;
      let score = 6;
      const hasInput = !!DOM_pickEditableInForm(f);
      if (hasInput) score += 3;
      try { score += DOM_scoreBottomLaneRect(f.getBoundingClientRect()); } catch {}
      if (score >= tailScore) {
        tail = f;
        tailScore = score;
      }
    }
    return tail || null;
  };

  const DOM_pickComposerSurface = (inputHint = null) => {
    const cands = DOM_qa('[data-composer-surface="true"]');
    if (!cands.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const el of cands) {
      if (!DOM_isVisible(el)) continue;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width <= 0 || r.height <= 0) continue;

      let score = 0;
      if (r.width >= 300) score += 2;
      if (el.closest?.(SEL_PM.HOST_FORM)) score += 6;
      if (inputHint && el.contains?.(inputHint)) score += 18;
      score += DOM_scoreBottomLaneRect(r);

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    return best;
  };
  const DOM_getEditableInput = () => {
    const form = DOM_getForm();
    if (form) {
      const picked = DOM_pickEditableInForm(form);
      if (picked) return picked;
    }
    return null;
  };

  const DOM_getSendButton = () => {
    const form = DOM_getForm();
    if (!form) return null;
    let btn = form.querySelector('button[data-testid="send-button"]');
    if (btn) return btn;
    const all = DOM_qa('button', form);
    const found = all.find(b => String(b.getAttribute('aria-label') || '').toLowerCase().includes('send'));
    return found || null;
  };

  const DOM_isSendButton = (btn) => {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    const tid = String(btn.getAttribute('data-testid') || '').toLowerCase();
    if (tid === 'send-button') return true;
    const aria = String(btn.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('send')) return true;
    return false;
  };

  const DOM_unionRect = (rects) => {
    const xs = [], ys = [], x2 = [], y2 = [];
    for (const r of (rects || [])) {
      if (!r) continue;
      if (!isFinite(r.left) || !isFinite(r.top) || !isFinite(r.right) || !isFinite(r.bottom)) continue;
      if (r.width === 0 && r.height === 0) continue;
      xs.push(r.left); ys.push(r.top); x2.push(r.right); y2.push(r.bottom);
    }
    if (!xs.length) return null;
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...x2);
    const bottom = Math.max(...y2);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };

  const DOM_clampAnchorRect = (r) => {
    if (!r) return null;
    const left = Number(r.left);
    const top = Number(r.top);
    const right = Number(r.right);
    const bottom = Number(r.bottom);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
      return r;
    }

    const width = Math.max(0, Number(r.width) || (right - left));
    const rawHeight = Math.max(0, bottom - top);
    const maxAnchorHeight = Math.max(
      CFG_PM.ANCHOR_MIN_PX,
      Math.min(CFG_PM.ANCHOR_MAX_PX, Math.round(W.innerHeight * CFG_PM.ANCHOR_MAX_VH))
    );

    if (rawHeight <= maxAnchorHeight + 1) {
      return { left, top, right, bottom, width, height: rawHeight };
    }

    const clampedTop = Math.max(0, bottom - maxAnchorHeight);
    return {
      left,
      top: clampedTop,
      right,
      bottom,
      width,
      height: Math.max(0, bottom - clampedTop),
    };
  };

  const DOM_getComposerAnchorRect = () => {
    const form = DOM_getForm();
    const input = DOM_getEditableInput();
    const bestSurface = DOM_pickComposerSurface(input || null);
    const surface =
      bestSurface ||
      input?.closest?.('[data-composer-surface="true"]') ||
      form?.querySelector?.('[data-composer-surface="true"]') ||
      form?.closest?.('[data-composer-surface="true"]') ||
      null;

    if (surface && DOM_isVisible(surface)) {
      const rSurface = surface.getBoundingClientRect?.();
      if (rSurface && rSurface.width > 0 && rSurface.height > 0) return rSurface;
    }

    const rForm = (form && DOM_isVisible(form)) ? form.getBoundingClientRect() : null;
    const rInput = (input && DOM_isVisible(input)) ? input.getBoundingClientRect() : null;
    const sendBtn =
      form?.querySelector?.('button[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="send" i]') ||
      null;
    const rSend = (sendBtn && DOM_isVisible(sendBtn)) ? sendBtn.getBoundingClientRect() : null;

    return DOM_clampAnchorRect(DOM_unionRect([rForm, rInput, rSend]) || rInput || rForm || rSend || null);
  };

  const DOM_getMirroredNavRightInset = (anchorRect) => {
    const fallback = CFG_PM.FLOAT_LEFT_INSET_X_FALLBACK;
    if (!anchorRect) return fallback;
    try {
      const navRef =
        D.querySelector('[data-cgxui-owner="nvcn"][data-cgxui="nvcn-nav-wheel-mask"]') ||
        D.querySelector('.cgxui-nav-wheel-mask[data-cgxui-owner="nvcn"]') ||
        D.querySelector('[data-cgxui-owner="nvcn"][data-cgxui="nvcn-nav-box"]') ||
        D.querySelector('.cgxui-nav-box[data-cgxui-owner="nvcn"]');
      if (!navRef) return fallback;

      const navRect = navRef.getBoundingClientRect?.();
      if (!navRect || navRect.width <= 0 || navRect.height <= 0) return fallback;

      const inset = Math.round((anchorRect.right || 0) - navRect.right);
      if (!Number.isFinite(inset)) return fallback;
      return Math.max(-40, Math.min(60, inset));
    } catch {
      return fallback;
    }
  };

  const DOM_getInputText = () => {
    const el = DOM_getEditableInput();
    if (!el) return '';
    const isCE = el.getAttribute && el.getAttribute('contenteditable') === 'true';
    return (isCE ? el.innerText : el.value) || '';
  };

  const DOM_setInputText = (text, opts) => {
    const el = DOM_getEditableInput();
    if (!el) return false;
    const isCE = el.getAttribute && el.getAttribute('contenteditable') === 'true';

    const append = !!opts?.append;
    const autoSend = !!opts?.autoSend;

    const doSet = () => {
      el.focus();
      if (isCE) {
        const current = el.innerText || '';
        if (append) {
          const trimmed = current.replace(/\s+$/, '');
          if (!trimmed) el.innerText = text;
          else el.innerText = current + (current.endsWith('\n') ? '' : '\n') + text;
        } else {
          el.innerText = text;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const current = el.value || '';
        if (append) {
          const trimmed = current.replace(/\s+$/, '');
          if (!trimmed) el.value = text;
          else el.value = current + (current.endsWith('\n') ? '' : '\n') + text;
        } else {
          el.value = text;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };

    doSet();

    if (autoSend) {
      CLEAN_setTimeout(() => {
        SAFE_try('DOM_setInputText.autoSend', () => DOM_getSendButton()?.click(), null);
      }, CFG_PM.SEND_CLICK_DELAY_MS);
    }

    return true;
  };

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES (pure) 📄🔓💧 ───────────────────────────── */
  const CSS_PM_TEXT = () => {
    const selScoped = (ui) => `[${ATTR_CGXUI}="${ui}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

    const WRAP = selScoped(UI_PM_WRAP);
    const BTNBOX = selScoped(UI_PM_BTNBOX);
    const EXPORT_BTN = selScoped(UI_PM_EXPORT_BTN);
    const BTN = selScoped(UI_PM_BTN);
    const PANEL = selScoped(UI_PM_PANEL);
    const OVERLAY = selScoped(UI_PM_OVERLAY);
    const TOOLTIP = selScoped(UI_PM_TOOLTIP);
    const QUICK_TRAY = selScoped(UI_PM_QUICK_TRAY);
    const QUICK_DOT = selScoped(UI_PM_QUICK_MODE_DOT);

    // internal-only classes (scoped)
    const CLS_ITEM = `.cgxui-${SkID}--item`;
    const CLS_MOVED = `.cgxui-${SkID}--moved`;
    const CLS_TOP = `.cgxui-${SkID}--top`;
    const CLS_LIST = `.cgxui-${SkID}--list`;
    const CLS_INPUT = `.cgxui-${SkID}--input`;
    const CLS_BTN = `.cgxui-${SkID}--btn`;
    const CLS_CHIP = `.cgxui-${SkID}--chip`;
    const CLS_CHIP_ACTIVE = `.cgxui-${SkID}--chip-active`;
    const CLS_STAR = `.cgxui-${SkID}--star`;
    const CLS_STAR_ACTIVE = `.cgxui-${SkID}--star-active`;
    const CLS_PREV = `.cgxui-${SkID}--prev`;
    const CLS_TITLE = `.cgxui-${SkID}--title`;
    const CLS_TITLE_LEFT = `.cgxui-${SkID}--title-left`;
    const CLS_ACTIONS = `.cgxui-${SkID}--actions`;
    const CLS_MOVE_BTNS = `.cgxui-${SkID}--movebtns`;
    const CLS_MOVE = `.cgxui-${SkID}--move`;

    // [2A] card foundation + status + editor
    const CLS_BADGE = `.cgxui-${SkID}--badge`;
    const CLS_BADGE_APPEND = `.cgxui-${SkID}--badge-append`;
    const CLS_PREV_CLAMP = `.cgxui-${SkID}--prev-clamp`;
    const CLS_STATUS_SHOW = `.cgxui-${SkID}--status-show`;
    const CLS_STATUS_ERR = `.cgxui-${SkID}--status-err`;
    const CLS_EDITOR_OPEN = `.cgxui-${SkID}--editor-open`;
    const CLS_ED_ROW = `.cgxui-${SkID}--ed-row`;
    const CLS_ED_HEAD = `.cgxui-${SkID}--ed-head`;
    const CLS_ED_SEG = `.cgxui-${SkID}--ed-seg`;
    const CLS_ED_DANGER = `.cgxui-${SkID}--ed-danger`;
    const STATUS = selScoped(UI_PM_STATUS);
    const EDITOR = selScoped(UI_PM_EDITOR);

    const CLS_OVERLAY_SHOW = `.cgxui-${SkID}--overlay-show`;
    const CLS_PANEL_OPEN = `.cgxui-${SkID}--panel-open`;
    const CLS_QUICK_SHOW = `.cgxui-${SkID}--quick-show`;
    const CLS_DOT_SHOW = `.cgxui-${SkID}--dot-show`;
    const CLS_DOT_SEND = `.cgxui-${SkID}--dot-send`;

    /* Theme variable block, emitted once per theme.
     * Authority order: the owned `data-cgxui-theme` token (stamped from
     * ChatGPT's own root class) wins; `prefers-color-scheme` is the fallback
     * used only while the host theme cannot be determined. The token selector
     * targets `[data-cgxui-owner]` rather than the wrap specifically so that
     * owned nodes mounted outside the wrap — the tooltip lives on <body> — also
     * resolve against the host theme. */
    const OWNED = `[${ATTR_CGXUI_OWNER}="${SkID}"]`;
    const VARS_DARK = `
  --cgxui-${SkID}-bg: rgba(18, 18, 18, 0.94);
  --cgxui-${SkID}-border: rgba(255,255,255,.08);
  --cgxui-${SkID}-text: ${CFG_PM.GLASS_TEXT};
  --cgxui-${SkID}-muted: rgba(180, 180, 180, 0.5);
  --cgxui-${SkID}-card: rgba(28, 29, 32, 0.85);
  --cgxui-${SkID}-input: rgba(24, 25, 28, 0.85);
  --cgxui-${SkID}-btn: rgba(38, 39, 45, .78);
  --cgxui-${SkID}-btn-hover: rgba(48, 50, 57, .82);
  --cgxui-${SkID}-accent: #9ca3af;
  --cgxui-${SkID}-shadow: 0 12px 40px rgba(0,0,0,.35);
  --cgxui-${SkID}-radius: 14px;`;
    const VARS_LIGHT = `
  --cgxui-${SkID}-bg: rgba(255,255,255,.86);
  --cgxui-${SkID}-border: rgba(0,0,0,.08);
  --cgxui-${SkID}-text: #111827;
  --cgxui-${SkID}-muted: #4b5563;
  --cgxui-${SkID}-card: rgba(249, 250, 251, .92);
  --cgxui-${SkID}-input: rgba(243, 244, 246, .92);
  --cgxui-${SkID}-btn: rgba(243, 244, 246, .96);
  --cgxui-${SkID}-btn-hover: rgba(229, 231, 235, .98);
  --cgxui-${SkID}-accent: #0ea5e9;
  --cgxui-${SkID}-shadow: 0 12px 40px rgba(0,0,0,.15);
  --cgxui-${SkID}-radius: 14px;`;

    return `
:root{${VARS_DARK}
}
@media (prefers-color-scheme: light){
  :root{${VARS_LIGHT}
  }
}
${OWNED}[${ATTR_CGXUI_THEME}="dark"]{${VARS_DARK}
}
${OWNED}[${ATTR_CGXUI_THEME}="light"]{${VARS_LIGHT}
}

${WRAP}{
  position: fixed;
  left: -9999px;
  top: -9999px;
  width: 0;
  height: 0;
  display: block;
  margin: 0;
  z-index: ${CFG_PM.PANEL_Z};
}
${WRAP}[${ATTR_CGXUI_STATE}~="${DOCK_PM.STATE_DOCK}"]{
  position: relative;
  left: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  width: auto;
  height: auto;
  z-index: auto;
  display: inline-block;
  margin: 0;
}

${BTNBOX}{
  position: absolute;
  top: 0;
  left: 0;
  z-index: ${CFG_PM.PANEL_Z};
  display: flex;
  align-items: center;
  gap: 6px;
}
${WRAP}[${ATTR_CGXUI_STATE}~="${DOCK_PM.STATE_DOCK}"] ${BTNBOX}{
  position: relative;
  top: auto;
  left: auto;
}

${BTN},
${EXPORT_BTN}{
  width: auto;
  min-width: 50px;
  max-width: none;
  height: 20px;
  min-height: 20px;
  max-height: 20px;
  flex: 0 0 auto;
  flex-shrink: 0;
  align-self: center;
  padding: 0 6px;
  line-height: 20px;
  border-radius: 8px;
  border: none;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.2px;
  background: linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.10)), var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-text);
  opacity: 0.75;
  box-shadow: inset 0 0 1px rgba(255,255,255,0.05), 0 2px 5px rgba(0,0,0,0.30);
  cursor: pointer;
  transition: all 0.2s ease;
}
${BTN}:hover,
${EXPORT_BTN}:hover{
  opacity: 1;
  filter: brightness(1.08);
  box-shadow: 0 0 6px 2px rgba(255,255,255,0.08), 0 2px 4px rgba(0,0,0,0.25);
}
${BTN}:active,
${EXPORT_BTN}:active{ transform: scale(0.98); }

${OVERLAY}{
  position: fixed;
  inset: 0;
  backdrop-filter: blur(3px);
  background: rgba(0,0,0,.05);
  opacity: 0;
  pointer-events: none;
  transition: opacity .25s ease;
  z-index: 9998;
}
${OVERLAY}${CLS_OVERLAY_SHOW}{
  opacity: 1;
  pointer-events: auto;
}

${PANEL}{
  position: absolute;
  left: 0;
  bottom: 46px;
  width: min(${CFG_PM.PANEL_W_MAX}px, ${CFG_PM.PANEL_W_VW}vw);
  color: var(--cgxui-${SkID}-text);
  background:
    radial-gradient(circle at 0% 0%, ${CFG_PM.GLASS_TINT_A}, transparent 45%),
    radial-gradient(circle at 100% 100%, ${CFG_PM.GLASS_TINT_B}, transparent 55%),
    linear-gradient(135deg, ${CFG_PM.GLASS_BG_A}, ${CFG_PM.GLASS_BG_B});
  border: 1px solid rgba(255,255,255,.12);
  border-radius: var(--cgxui-${SkID}-radius);
  box-shadow: ${CFG_PM.GLASS_SHADOW};
  filter:none !important;
  backdrop-filter: blur(${CFG_PM.GLASS_BLUR_PX}px) saturate(${CFG_PM.GLASS_SAT}) contrast(${CFG_PM.GLASS_CONTRAST}) brightness(${CFG_PM.GLASS_BRIGHT});
  -webkit-backdrop-filter: blur(${CFG_PM.GLASS_BLUR_PX}px) saturate(${CFG_PM.GLASS_SAT}) contrast(${CFG_PM.GLASS_CONTRAST}) brightness(${CFG_PM.GLASS_BRIGHT});
  padding: 12px;
  max-height: ${Math.round(CFG_PM.PANEL_MAX_H * 100)}vh;
  overflow: auto;
  opacity: 0;
  transform: translateY(10px);
  pointer-events: none;
  /* Closed panels must not hold focusable controls in the tab order. The inert
     attribute is applied from script; visibility:hidden is the fallback for
     engines without inert support and is what actually removes the subtree
     from sequential focus navigation. Both are driven by UI_PM_applyPanelState
     so they cannot disagree with the open class. */
  visibility: hidden;
  /* visibility flips only AFTER the fade-out finishes, so adding it does not
     cut the existing close animation; on open it flips immediately. */
  transition: opacity .22s ease, transform .22s ease, visibility 0s linear .22s;
  z-index: ${CFG_PM.PANEL_Z};
}
${PANEL}${CLS_PANEL_OPEN}{
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  visibility: visible;
  transition: opacity .22s ease, transform .22s ease, visibility 0s linear 0s;
}
${WRAP}[${ATTR_CGXUI_STATE}~="${DOCK_PM.STATE_DOCK}"] ${PANEL}{
  left: 0;
  top: calc(100% + 10px);
  bottom: auto;
}
${PANEL}::-webkit-scrollbar{ width: 10px; }
${PANEL}::-webkit-scrollbar-thumb{
  background: rgba(255,255,255,.14);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

${CLS_TOP}{
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 8px;
  margin-bottom: 10px;
}
${CLS_INPUT}{
  font-size: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,.12);
  background: var(--cgxui-${SkID}-input);
  color: var(--cgxui-${SkID}-text);
  outline: none;
  transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
}
${CLS_INPUT}::placeholder{ color: var(--cgxui-${SkID}-muted); }
${CLS_INPUT}:focus{
  border-color: color-mix(in srgb, var(--cgxui-${SkID}-accent) 45%, var(--cgxui-${SkID}-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cgxui-${SkID}-accent) 25%, transparent);
}

${CLS_BTN}{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.2px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.12);
  background: var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-text);
  cursor: pointer;
  transition: background .2s ease, transform .06s ease, box-shadow .2s ease;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
}
${CLS_BTN}:hover{ background: var(--cgxui-${SkID}-btn-hover); }
${CLS_BTN}:active{ transform: translateY(1px) scale(.99); }

${CLS_LIST}{ display: grid; gap: 10px; }
${CLS_ITEM}{
  border: 1px solid rgba(255,255,255,.12);
  background: var(--cgxui-${SkID}-card);
  border-radius: 10px;
  padding: 6px 10px;
  transition: transform .12s ease, box-shadow .2s ease, border-color .2s ease, background .2s ease;
}
${CLS_ITEM}:hover{
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0,0,0,.25);
  border-color: color-mix(in srgb, var(--cgxui-${SkID}-accent) 35%, var(--cgxui-${SkID}-border));
}

${CLS_TITLE}{ font-weight: 700; font-size: 12px; letter-spacing: .2px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
${CLS_TITLE_LEFT}{ display:inline-flex; align-items:center; gap:6px; }
${CLS_PREV}{
  font-size: 10px;
  opacity: .9;
  margin-top: 6px;
  white-space: pre-wrap;
  line-height: 1.4;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 8px;
}

${CLS_STAR}{
  cursor:pointer;
  margin-right:6px;
  font-size:14px;
  user-select:none;
  transition: color .2s ease;
  /* [2A] Now a real <button>: strip the UA chrome but keep it focusable. */
  background: transparent;
  border: 0;
  padding: 0 2px;
  line-height: 1;
  color: inherit;
}
${CLS_STAR}${CLS_STAR_ACTIVE}{ color: #fbbf24; }
${CLS_STAR}:focus-visible{
  outline: 2px solid var(--cgxui-${SkID}-accent);
  outline-offset: 2px;
  border-radius: 4px;
}

/* [2A] Prompt/Append type badge. */
${CLS_BADGE}{
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .3px;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--cgxui-${SkID}-border);
  opacity: .85;
  white-space: nowrap;
  flex: 0 0 auto;
}
${CLS_BADGE}${CLS_BADGE_APPEND}{
  border-color: var(--cgxui-${SkID}-accent);
  color: var(--cgxui-${SkID}-accent);
}

/* [2A] Two-line body preview. The stored body is never truncated — this clamps
 * presentation only, and the existing tooltip remains the path to full text. */
${CLS_PREV}${CLS_PREV_CLAMP}{
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* Fallback for engines without -webkit-line-clamp: cap the height instead. */
  max-height: 2.8em;
}

/* [2A] One status surface for the whole panel. */
${STATUS}{
  display: none;
  font-size: 11px;
  padding: 6px 10px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px solid var(--cgxui-${SkID}-border);
  background: var(--cgxui-${SkID}-btn);
}
${STATUS}${CLS_STATUS_SHOW}{ display: block; }
${STATUS}${CLS_STATUS_ERR}{
  border-color: #ef4444;
  color: #ef4444;
  font-weight: 700;
}

/* [2A] In-panel editor. Replaces the Edit-pane list region; it is not a modal,
 * not an overlay, and not a second floating layer. */
${EDITOR}{ display: none; gap: 8px; }
${EDITOR}${CLS_EDITOR_OPEN}{ display: grid; }
${EDITOR} textarea${CLS_INPUT}{ min-height: 168px; resize: vertical; white-space: pre-wrap; }
${CLS_ED_ROW}{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
${CLS_ED_HEAD}{ font-weight:700; font-size:12px; letter-spacing:.2px; }
${CLS_ED_SEG}{
  display:inline-flex; border:1px solid var(--cgxui-${SkID}-border); border-radius:8px; overflow:hidden;
}
${CLS_ED_SEG} button{
  background: transparent; border:0; color: inherit; font-size:11px; padding:4px 10px; cursor:pointer;
}
${CLS_ED_SEG} button[aria-pressed="true"]{
  background: var(--cgxui-${SkID}-accent); color:#fff; font-weight:700;
}
${CLS_ED_DANGER}{ border-color:#ef4444 !important; color:#ef4444 !important; }

${CLS_ACTIONS}{
  display:flex !important;
  flex-direction:row !important;
  flex-wrap:wrap;
  justify-content:flex-start;
  align-items:center;
  gap: 8px;
  margin-top: 6px;
  padding: 4px 0;
}

${CLS_CHIP}{
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,0.02);
  color: var(--cgxui-${SkID}-muted);
  font-size: 10px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
${CLS_CHIP}${CLS_CHIP_ACTIVE}{
  background: color-mix(in srgb, var(--cgxui-${SkID}-accent) 14%, transparent);
  border-color: color-mix(in srgb, var(--cgxui-${SkID}-accent) 60%, var(--cgxui-${SkID}-border));
  color: var(--cgxui-${SkID}-text);
}

${CLS_MOVE_BTNS}{ display:inline-flex; align-items:center; gap:6px; }
${CLS_MOVE}{
  width: 22px;
  height: 20px;
  line-height: 18px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,.12);
  background: var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-muted);
  font-size: 12px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
  transition: background .2s ease, transform .06s ease, color .2s ease;
}
${CLS_MOVE}:hover{ background: var(--cgxui-${SkID}-btn-hover); color: var(--cgxui-${SkID}-text); transform: scale(1.05); }
${CLS_MOVE}:active{ transform: translateY(1px); }

${CLS_ITEM}${CLS_MOVED}{
  animation: cgxui_${SkID}_flash .6s ease-out;
}
@keyframes cgxui_${SkID}_flash{
  0%{ background-color: rgba(125,211,252,.1); box-shadow: 0 0 0 0 rgba(125,211,252,.5); }
  100%{ background-color: transparent; box-shadow: 0 0 0 16px rgba(125,211,252,0); }
}

/* Quick tray */
${QUICK_TRAY}{
  display: none;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  padding: 0;
  overflow-x: auto;
}
${QUICK_TRAY}${CLS_QUICK_SHOW}{ display:flex; }

${QUICK_TRAY} button{
  height: 20px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,0.08), rgba(0,0,0,0.03)), var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-text);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.52;
  box-shadow: inset 0 0 1px rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.25);
  transition: transform .12s ease, box-shadow .12s ease, background .12s ease, opacity .12s ease;
}
${QUICK_TRAY} button:hover{ transform: translateY(-1px); opacity: 0.76; box-shadow: 0 0 4px rgba(255,255,255,0.10), 0 2px 4px rgba(0,0,0,0.28); }

${QUICK_DOT}{
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,.12);
  background: linear-gradient(145deg, rgba(255,255,255,0.03), rgba(0,0,0,0.10)), var(--cgxui-${SkID}-btn);
  color: var(--cgxui-${SkID}-text);
  font-size: 9px;
  line-height: 1;
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: 2px;
  box-shadow: inset 0 0 1px rgba(255,255,255,0.05), 0 2px 4px rgba(0,0,0,0.25);
  transition: box-shadow .15s ease, border-color .15s ease, transform .10s ease, filter .15s ease;
}
${QUICK_DOT}${CLS_DOT_SHOW}{ display:flex; }
${QUICK_DOT}${CLS_DOT_SEND}{
  border-color: color-mix(in srgb, var(--cgxui-${SkID}-accent) 60%, var(--cgxui-${SkID}-border));
  box-shadow: 0 0 4px rgba(250,204,21,0.8), 0 2px 6px rgba(0,0,0,0.35);
  transform: translateY(-1px);
}

/* Tooltip */
${TOOLTIP}{
  position: fixed;
  z-index: 99999;
  max-width: 400px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--cgxui-${SkID}-card);
  border: 1px solid rgba(255,255,255,.12);
  color: var(--cgxui-${SkID}-text);
  box-shadow: var(--cgxui-${SkID}-shadow);
  font-size: 12px;
  line-height: 1.4;
  display: none;
  white-space: pre-wrap;
}
${TOOLTIP} .cgxui-${SkID}--tip-title{
  font-weight: 600;
  margin-bottom: 4px;
  opacity: .9;
}

@media (prefers-reduced-motion: reduce){
  ${PANEL}, ${OVERLAY}, ${CLS_ITEM}, ${CLS_BTN}, ${CLS_INPUT}{ transition: none; }
}
`.trim();
  };

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS INJECTOR 📝🔓💥 ───────────────────────────── */
  const UI_ensureStyle = () => SAFE_try('UI_ensureStyle', () => {
    let st = D.getElementById(CSS_PM_STYLE_ID);
    const css = CSS_PM_TEXT();
    if (!st) {
      st = D.createElement('style');
      st.id = CSS_PM_STYLE_ID;
      st.setAttribute(ATTR_CGXUI, `${SkID}-style`);
      st.setAttribute(ATTR_CGXUI_OWNER, SkID);
      st.textContent = css;
      D.documentElement.appendChild(st);
      CLEAN_addNode(st);
    } else {
      if (st.textContent !== css) st.textContent = css;
    }
  }, null);

  /* ───────────────────────────── 🟥 ENGINE — Domain Logic 📝🔓💥 ───────────────────────────── */

  /* [ENGINE][ORDER] Slot-preserving movement within the visible subsequence.
   *
   * Pure. Never mutates `list` or any record in it; returns a NEW array, or
   * `null` for "no change" (which callers must treat as a no-op — not as an
   * empty list). Being pure is what lets the caller persist first and commit to
   * in-memory state only on success.
   *
   * The rule: the visible items exchange positions only among the array slots
   * they already occupy. Every filtered-out record keeps its exact absolute
   * index, so reordering under an active search or category filter can no
   * longer relocate hidden prompts.
   *
   *   Global  [A, B, C, D, E]
   *   Visible [B, D]            (a filter is hiding A, C, E)
   *   Move D up ->  [A, D, C, B, E]      (slots 1 and 3 swap; 0/2/4 untouched)
   *
   * Returns null for: unknown/!visible id, first-visible up, last-visible down,
   * fewer than two visible items, and any malformed or duplicated visible-id
   * sequence — a corrupt input is rejected rather than applied.
   */
  const ENGINE_PM_reorderVisible = (list, visibleIdsRaw, id, dir) => {
    if (!Array.isArray(list) || !Array.isArray(visibleIdsRaw)) return null;

    const moveId = (typeof id === 'string') ? id : '';
    const step = (dir === 'up') ? -1 : (dir === 'down') ? 1 : 0;
    if (!moveId || !step) return null;

    // Reject a malformed/duplicated visible sequence outright.
    const visible = [];
    const seen = new Set();
    for (const raw of visibleIdsRaw) {
      if (typeof raw !== 'string' || !raw) return null;
      if (seen.has(raw)) return null;
      seen.add(raw);
      visible.push(raw);
    }
    if (visible.length < 2) return null;

    // Each visible id must resolve to exactly one record; otherwise the rendered
    // view is stale relative to the array and we must not rewrite slots.
    const slots = [];
    for (let i = 0; i < list.length; i += 1) {
      const rid = list[i]?.id;
      if (typeof rid === 'string' && seen.has(rid)) slots.push(i);
    }
    if (slots.length !== visible.length) return null;

    const from = visible.indexOf(moveId);
    if (from === -1) return null;
    const to = from + step;
    if (to < 0 || to >= visible.length) return null;

    const ordered = visible.slice();
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);

    const byId = new Map();
    for (const slot of slots) byId.set(list[slot].id, list[slot]);

    const next = list.slice();
    slots.forEach((slot, k) => { next[slot] = byId.get(ordered[k]); });
    return next;
  };

  /* ───────────────────────────── ✍️ PHASE 2A — pure editor/conversion helpers 📄🔒💧 ─────────────────────────────
   * Deliberately pure: no DOM, no storage, no clock reads except the caller's
   * supplied `now`. Validators drive these directly, so editor rules are proved
   * without a browser. None of them writes — every persistence path still goes
   * through the Phase 1 truthful commit helpers. */

  /* Canonical conversion-body normalization. CRLF and bare CR become LF, outer
   * whitespace is trimmed, and case / internal spacing / internal line breaks
   * are preserved exactly. This is the ONLY definition of "same body" used by
   * conversion de-duplication. */
  const ENGINE_PM_normalizeConvBody = (text) =>
    String(text == null ? '' : text).replace(/\r\n?/g, '\n').trim();

  const PM_CONV_TITLE_MAX = 50;

  /* Conversion title from an already-normalized body: first non-empty line,
   * trimmed, capped, with a single ellipsis when it was actually cut. Falls
   * back to the caller's label when no meaningful line exists. Manually authored
   * titles never pass through here. */
  const ENGINE_PM_convTitle = (normBody, fallbackTitle) => {
    const line = String(normBody || '')
      .split('\n')
      .map(s => s.trim())
      .find(s => s.length > 0);
    if (!line) return String(fallbackTitle || 'Untitled');
    /* [2A-fix C] Truncate by CODE POINT, not by UTF-16 unit. `slice` at a fixed
     * unit index can cut an astral character (emoji) in half and emit a lone
     * surrogate, which renders as U+FFFD. Array.from iterates code points, so a
     * character crossing the boundary is either kept whole or dropped whole.
     * Grapheme clustering (Intl.Segmenter) is deliberately out of scope here. */
    const chars = Array.from(line);
    return (chars.length > PM_CONV_TITLE_MAX)
      ? `${chars.slice(0, PM_CONV_TITLE_MAX).join('')}…`
      : line;
  };

  /* A conversion duplicate requires BOTH the same normalized body AND the same
   * type. Case differences stay distinct; Prompt and Append stay distinct even
   * when the text matches. Titles are never duplication authority. */
  const ENGINE_PM_findConvDuplicate = (list, normBody, type) => {
    if (!Array.isArray(list)) return null;
    const wantType = (type === 'append') ? 'append' : 'prompt';
    for (const p of list) {
      if (!p || typeof p !== 'object') continue;
      if (((p.type === 'append') ? 'append' : 'prompt') !== wantType) continue;
      if (ENGINE_PM_normalizeConvBody(p.body) === normBody) return p;
    }
    return null;
  };

  /* Duplicate record construction. Copies body/type/favorite only — Phase 2A
   * introduces no usage or auto-send metadata, so there is none to carry. */
  const ENGINE_PM_buildDuplicate = (src, newId, now) => ({
    id: String(newId),
    title: `${String(src && src.title != null ? src.title : '')} (copy)`,
    body: String(src && src.body != null ? src.body : ''),
    favorite: !!(src && src.favorite),
    type: (src && src.type === 'append') ? 'append' : 'prompt',
    createdAt: now,
    updatedAt: now,
  });

  /* Insert `rec` immediately after the record carrying `afterId`. Every other
   * absolute slot is preserved, so manual ordering stays authoritative. */
  const ENGINE_PM_insertAfterId = (list, afterId, rec) => {
    const arr = Array.isArray(list) ? list.slice() : [];
    const i = arr.findIndex(p => p && p.id === afterId);
    if (i === -1) { arr.push(rec); return arr; }
    arr.splice(i + 1, 0, rec);
    return arr;
  };

  /* Editor validation. Titles validate trimmed; bodies validate trimmed but are
   * STORED with internal formatting intact, so multiline round-trips exactly. */
  const EDITOR_PM_validate = (kind, draft) => {
    const d = draft || {};
    if (kind === 'quick') {
      if (!String(d.text == null ? '' : d.text).trim()) {
        return { ok: false, error: 'Enter quick reply text' };
      }
      return { ok: true, error: '' };
    }
    if (!String(d.title == null ? '' : d.title).trim()) return { ok: false, error: 'Enter a title' };
    if (!String(d.body == null ? '' : d.body).trim()) return { ok: false, error: 'Enter a body' };
    return { ok: true, error: '' };
  };

  /* ───────────────────────────── 🔎 RETRIEVAL — deterministic ranking 📝🔓💥 ─────────────────────────────
   * [2B] Search used to be a substring filter that returned records in manual
   * order, duplicated in the Simple and Edit renderers. Two copies of a
   * selection rule drift; and a library of any size makes "the thing I use"
   * hard to reach. This block is the single source for BOTH renderers.
   *
   * Everything here is pure: it reads a list and returns a view. It never
   * mutates the authoritative array, never mutates a record, and never writes
   * storage. Integer arithmetic only — no floating-point scores, so an order
   * is reproducible across calls and across machines.
   *
   * Ranking applies to SAVED PROMPT RECORDS ONLY. History, Drafts, Pasted and
   * Quick keep the substring behaviour their own renderers already implement;
   * their occurrence-addressed markup is a Phase 1 safety contract. */

  const PM_RANK_TITLE_EXACT = 1000;
  const PM_RANK_TITLE_PREFIX = 800;
  const PM_RANK_TITLE_WORD = 600;
  const PM_RANK_TITLE_INCLUDES = 400;
  const PM_RANK_BODY_WORD = 200;
  const PM_RANK_BODY_INCLUDES = 100;
  const PM_RANK_NO_MATCH = 0;

  const PM_RANK_FAVORITE_BOOST = 150;
  const PM_RANK_RECENT_7D_BOOST = 60;
  const PM_RANK_RECENT_30D_BOOST = 30;
  const PM_RANK_USE_UNIT = 5;
  const PM_RANK_USE_CAP = 10;          // → maximum usage boost 50

  const PM_DAY_MS = 86400000;
  const PM_RANK_WINDOW_7D = 7 * PM_DAY_MS;
  const PM_RANK_WINDOW_30D = 30 * PM_DAY_MS;

  /* Optional usage metadata. Absent is the normal case for every record written
   * before 2B, so absence must read as zero rather than as corruption. */
  const ENGINE_PM_normUsageTs = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const ENGINE_PM_normUseCount = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    if (!Number.isInteger(n)) return 0;
    return n >= 0 ? n : 0;
  };

  /* A query is user text, so it reaches RegExp only escaped. `c++`, `a.b`,
   * `(x)` and friends must match literally instead of throwing or matching
   * something the user never typed. */
  const ENGINE_PM_escapeRegex = (s) => String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* Word-boundary containment. Both sides are already lowercased by the caller.
   * A query that cannot express a boundary (punctuation-only, say) simply
   * reports false and the plain `includes` tiers still apply. */
  const ENGINE_PM_hasWordBoundary = (hayLower, qLower) => {
    if (!hayLower || !qLower) return false;
    return SAFE_try('ENGINE_PM_hasWordBoundary', () => {
      const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${ENGINE_PM_escapeRegex(qLower)}`, 'u');
      return re.test(hayLower);
    }, false);
  };

  /* Highest matching tier only — tiers never stack. 0 means "exclude". */
  const ENGINE_PM_rankBase = (rec, qLower) => {
    const title = String(rec && rec.title != null ? rec.title : '').toLowerCase();
    const body = String(rec && rec.body != null ? rec.body : '').toLowerCase();
    if (title === qLower) return PM_RANK_TITLE_EXACT;
    if (title.startsWith(qLower)) return PM_RANK_TITLE_PREFIX;
    if (ENGINE_PM_hasWordBoundary(title, qLower)) return PM_RANK_TITLE_WORD;
    if (title.includes(qLower)) return PM_RANK_TITLE_INCLUDES;
    if (ENGINE_PM_hasWordBoundary(body, qLower)) return PM_RANK_BODY_WORD;
    if (body.includes(qLower)) return PM_RANK_BODY_INCLUDES;
    return PM_RANK_NO_MATCH;
  };

  /* Recency is a single bucket: the 7-day and 30-day boosts never stack. */
  const ENGINE_PM_recencyBoost = (lastUsedAt, now) => {
    const t = ENGINE_PM_normUsageTs(lastUsedAt);
    if (t <= 0) return 0;
    const age = Number(now) - t;
    if (!Number.isFinite(age) || age < 0) return 0;
    if (age <= PM_RANK_WINDOW_7D) return PM_RANK_RECENT_7D_BOOST;
    if (age <= PM_RANK_WINDOW_30D) return PM_RANK_RECENT_30D_BOOST;
    return 0;
  };

  const ENGINE_PM_usageBoost = (useCount) =>
    Math.min(ENGINE_PM_normUseCount(useCount), PM_RANK_USE_CAP) * PM_RANK_USE_UNIT;

  /* Rank a list against a query.
   *
   * Empty query is NOT a degenerate search: it is the library view, and it is
   * ordered by favourites-then-manual-position ONLY. Letting recency or use
   * count reorder an unsearched library makes it feel like it moves on its own,
   * so those signals are deliberately not consulted here.
   *
   * Returns view entries { prompt, originalIndex, score }; the input array and
   * its records are never touched. */
  const ENGINE_PM_rankPrompts = (list, query, now) => {
    const arr = Array.isArray(list) ? list : [];
    const entries = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!p || typeof p !== 'object') continue;
      entries.push({ prompt: p, originalIndex: i, score: 0 });
    }

    const q = String(query == null ? '' : query).trim().toLowerCase();

    if (!q) {
      // Favourites pinned above the rest; manual order preserved inside each group.
      return entries.slice().sort((a, b) => {
        const fa = a.prompt.favorite ? 1 : 0, fb = b.prompt.favorite ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return a.originalIndex - b.originalIndex;
      });
    }

    const scored = [];
    for (const e of entries) {
      const base = ENGINE_PM_rankBase(e.prompt, q);
      if (base === PM_RANK_NO_MATCH) continue;      // non-matches are excluded
      const score = base
        + (e.prompt.favorite ? PM_RANK_FAVORITE_BOOST : 0)
        + ENGINE_PM_recencyBoost(e.prompt.lastUsedAt, now)
        + ENGINE_PM_usageBoost(e.prompt.useCount);
      scored.push({ prompt: e.prompt, originalIndex: e.originalIndex, score });
    }

    /* Tie-break chain, in order. The final original-index key is mandatory: it
     * is what keeps the Phase 7 manual order authoritative whenever every
     * ranking signal ties, and it makes the total order deterministic. */
    return scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const fa = a.prompt.favorite ? 1 : 0, fb = b.prompt.favorite ? 1 : 0;
      if (fa !== fb) return fb - fa;
      const la = ENGINE_PM_normUsageTs(a.prompt.lastUsedAt), lb = ENGINE_PM_normUsageTs(b.prompt.lastUsedAt);
      if (la !== lb) return lb - la;
      const ua = ENGINE_PM_normUseCount(a.prompt.useCount), ub = ENGINE_PM_normUseCount(b.prompt.useCount);
      if (ua !== ub) return ub - ua;
      return a.originalIndex - b.originalIndex;
    });
  };

  /* The one selection path both renderers use: category filter → favourites
   * filter → ranking. Simple and Edit cannot disagree about what a query
   * returns, because there is nothing left to disagree with. */
  const ENGINE_PM_selectPromptView = (list, category, query, now) => {
    const arr = Array.isArray(list) ? list : [];
    const cat = String(category || 'all');
    const filtered = arr.filter(p => {
      if (!p || typeof p !== 'object') return false;
      const t = p.type === 'append' ? 'append' : 'prompt';
      if (cat === 'prompt' && t !== 'prompt') return false;
      if (cat === 'append' && t !== 'append') return false;
      if (cat === 'favorites' && !p.favorite) return false;
      return true;
    });
    // Rank against the FILTERED list so originalIndex indexes the rendered view,
    // while relative manual order inside the filter is preserved.
    return ENGINE_PM_rankPrompts(filtered, query, now);
  };

  /* [2B-fix2] A manual move is only allowed when performing it actually MOVES
   * the card the user pressed.
   *
   * The first closure asked "is the current view the manual order?" and, if so,
   * allowed the move. That was insufficient, and the failure is subtle: a view
   * can equal manual order BEFORE the move, pass, and then have ranking put the
   * card straight back where it was. Storage changes; the screen does not.
   *
   *   manual [A*, B, C]   view [A, B, C]        (A is favourite, already first)
   *   A down -> candidate [B, A*, C]            <- persistent order CHANGED
   *   rerank             -> [A, B, C]           <- favourites-first puts A back
   *
   * The user sees nothing move and reasonably concludes nothing happened, while
   * their manual order has silently been rewritten. The same thing happens under
   * a search whose ranking happens to agree with manual order.
   *
   * So the authority is the PROPOSED MOVE, not the current view. For one
   * specific (target, direction):
   *
   *   1. expected  - the rendered order with the target moved one visible slot
   *   2. candidate - ENGINE_PM_reorderVisible on the real list (helper unchanged)
   *   3. reranked  - ENGINE_PM_selectPromptView over that candidate (unchanged)
   *   4. allow only when reranked is EXACTLY expected
   *
   * Nothing is inferred from query presence, from favourite flags, or from score
   * arithmetic: the decision is made by running the real ranker over the real
   * candidate and looking at the answer. Up and down are asked separately,
   * because one can be honest while the other is a no-op.
   *
   * Pure: reorderVisible and selectPromptView both build new arrays, so no input
   * is mutated and nothing is written. Fails closed on anything it cannot trust. */
  const ENGINE_PM_canMovePromptView = (list, category, query, now, renderedIds, targetId, direction) => {
    const arr = Array.isArray(list) ? list : [];
    const ids = (Array.isArray(renderedIds) ? renderedIds : []).filter(v => typeof v === 'string' && v);
    const dir = (direction === 'up' || direction === 'down') ? direction : null;
    if (!dir || typeof targetId !== 'string' || !targetId) return false;
    if (ids.length < 2) return false;                      // nothing to swap with

    // Fail closed on a view we cannot trust: a repeated id, or one that does not
    // resolve to exactly one record (stale DOM, ghost card, duplicate record).
    if (new Set(ids).size !== ids.length) return false;
    for (const id of ids) {
      let seen = 0;
      for (const p of arr) { if (p && typeof p === 'object' && p.id === id) seen++; }
      if (seen !== 1) return false;
    }

    const at = ids.indexOf(targetId);
    if (at === -1) return false;
    const swapWith = (dir === 'up') ? at - 1 : at + 1;
    if (swapWith < 0 || swapWith >= ids.length) return false;   // already at the edge

    // 1. what the user is asking to see
    const expected = ids.slice();
    expected[at] = ids[swapWith];
    expected[swapWith] = ids[at];

    // 2. what the approved Phase-1 helper would actually persist
    const candidate = ENGINE_PM_reorderVisible(arr, ids, targetId, dir);
    if (!candidate) return false;

    // 3. what the shipped ranker would then render
    const reranked = ENGINE_PM_selectPromptView(candidate, category, query, now).map(v => v.prompt.id);

    // 4. allow only if the move is visible, exactly as requested
    if (reranked.length !== expected.length) return false;
    for (let i = 0; i < expected.length; i++) {
      if (reranked[i] !== expected[i]) return false;
    }
    return true;
  };

  /* [2B-perf] Batch move availability — the production authority.
   *
   * ENGINE_PM_canMovePromptView above remains the DEFINITION of correct: build
   * the candidate with the real reorder helper, rerank it with the real ranker,
   * and demand the rendered result be exactly the requested move. It is kept,
   * unchanged, as the correctness oracle the validators compare against.
   *
   * It just cannot be the thing rendering calls. Asking it per button meant
   * N cards × 2 directions × (full-array scan + full reorder + full rerank) on
   * every keystroke-debounced re-render — quadratic in the library for a row of
   * arrow buttons.
   *
   * The optimisation rests on one fact about manual reorder: swapping two rows
   * changes ONLY their positions in the array. Title, body, type, favourite,
   * lastUsedAt and useCount are untouched, so every ranking key ABOVE the final
   * original-index tie-break is unchanged for every record. Two adjacent rendered
   * rows can therefore exchange places after a swap if and only if the ranker
   * separates them by index alone — i.e. they tie on score, favourite, recency
   * and use count. Any stronger signal would re-impose the old order and the move
   * would be invisible, which is exactly what the oracle rejects.
   *
   * That tie is not re-derived here: the pair is handed to the REAL
   * ENGINE_PM_rankPrompts in both input orders. If the ranker returns [A,B] for
   * [A,B] and [B,A] for [B,A], it is following input position and nothing else.
   * No score arithmetic is copied, so the answer cannot drift from the ranker.
   *
   * Cost: one full-view validation and rank, plus N-1 two-record ranks. The
   * verdict for a pair serves both row i "down" and row i+1 "up".
   *
   * Output is occurrence-aligned — one entry per rendered slot, in render order —
   * so the renderer can walk cards positionally instead of querying by id, and a
   * duplicated id fails the whole view closed rather than silently addressing the
   * first matching card twice. Pure: nothing is mutated, nothing is written. */
  const ENGINE_PM_computeMoveAvailability = (list, category, query, now, renderedIds) => {
    const ids = Array.isArray(renderedIds) ? renderedIds : null;
    if (!Array.isArray(list) || !ids) return [];
    const n = ids.length;
    if (n === 0) return [];

    // Every refusal returns the same shape with movement denied everywhere, so a
    // caller can apply the result without needing to know why it failed.
    const denied = () => ids.map(id => ({ id: (typeof id === 'string' ? id : null), up: false, down: false }));

    for (const id of ids) { if (typeof id !== 'string' || !id) return denied(); }
    if (new Set(ids).size !== n) return denied();          // duplicate rendered ids

    // ONE pass over the authoritative array builds both the count and the lookup.
    const byId = new Map();
    const seen = new Map();
    for (const rec of list) {
      if (!rec || typeof rec !== 'object') continue;
      const id = rec.id;
      if (typeof id !== 'string' || !id) continue;
      seen.set(id, (seen.get(id) || 0) + 1);
      if (!byId.has(id)) byId.set(id, rec);
    }
    for (const id of ids) { if (seen.get(id) !== 1) return denied(); }   // ghost or duplicated record

    // The DOM must be showing what the ranker currently produces. Checked once,
    // not once per button — this is what makes a stale view fail closed cheaply.
    const current = ENGINE_PM_selectPromptView(list, category, query, now);
    if (current.length !== n) return denied();
    for (let i = 0; i < n; i++) { if (current[i].prompt.id !== ids[i]) return denied(); }

    const out = ids.map(id => ({ id, up: false, down: false }));
    for (let i = 0; i + 1 < n; i++) {
      const a = byId.get(ids[i]);
      const b = byId.get(ids[i + 1]);
      const fwd = ENGINE_PM_rankPrompts([a, b], query, now);
      const rev = ENGINE_PM_rankPrompts([b, a], query, now);
      const followsInputOrder =
        fwd.length === 2 && rev.length === 2 &&
        fwd[0].prompt === a && fwd[1].prompt === b &&
        rev[0].prompt === b && rev[1].prompt === a;
      if (followsInputOrder) { out[i].down = true; out[i + 1].up = true; }
    }
    return out;
  };

  /* Shown on the disabled ▲▼ controls and, if a move is somehow still attempted,
   * on the status line. Deliberately not an error: nothing failed, the action is
   * simply not meaningful in a ranked view. */
  const PM_MSG_RANKED_NO_REORDER = 'Manual order unavailable while results are ranked';

  /* [2B] Usage metadata write. Pure: returns a candidate list, commits nothing.
   *
   * `updatedAt` is deliberately NOT touched. That field means "the user edited
   * this prompt", and using a prompt is not editing it — conflating the two
   * would make every insertion look like an authoring change. */
  const ENGINE_PM_touchPromptUsage = (list, id, now) => {
    const arr = Array.isArray(list) ? list : [];
    if (id == null || id === '') return arr.slice();
    return arr.map(p => {
      if (!p || p.id !== id) return p;
      return {
        ...p,
        lastUsedAt: ENGINE_PM_normUsageTs(now),
        useCount: ENGINE_PM_normUseCount(p.useCount) + 1,
      };
    });
  };

  /* [2A-fix E] Stale-target existence check.
   *
   * An editor opened on an id outlives the record it edits: another surface, a
   * migration, or a second panel can remove it while the editor sits open. The
   * previous `list.map(x => x.id === id ? {...} : x)` then matched NOTHING, the
   * unchanged list committed successfully, and the editor closed reporting
   * "Saved" — a mutation that never happened. Delete had the identical hole via
   * `filter`. This is the single truth source both paths consult first.
   *
   * Scope is deliberately narrow: it answers "does at least one record with
   * this id still exist", nothing more. Duplicate-ID policy and
   * "target changed under the same id" remain out of Phase 2A. */
  const EDITOR_PM_hasTarget = (list, id) => {
    if (!Array.isArray(list) || id == null || id === '') return false;
    return list.some(x => x && x.id === id);
  };

  /* Shown when an edit/delete target has vanished from authoritative state.
   * Persistent (error kind), because the user's typed work is still on screen
   * and the failure must not scroll away under a 2.5-second timeout. */
  const PM_MSG_TARGET_GONE = 'Item no longer exists';

  /* [STORE] Classified write-failure messages.
   *
   * Every one states the same two facts first — the change was NOT saved, and
   * the existing library is untouched — because the commit path guarantees both
   * and because that is what the user actually needs to know. The cause is named
   * only when the exception genuinely supports it; UNKNOWN says only that
   * storage failed.
   *
   * Deliberately absent: any remaining-capacity claim. The browser does not
   * expose localStorage headroom, so "N MB left" or "N% full" would be invented.
   * Export is offered as a safety step, not promised to succeed — portability
   * stays bounded by its own size limit. */
  /* The word "saved" is avoided on purpose. A failure line containing it reads
   * ambiguously beside the success line "Saved", and an existing editor gate
   * asserts a failure message never matches /saved/i. "Could not save" carries
   * the same meaning without the collision. */
  const PM_MSG_WRITE_QUOTA = 'Could not save — site storage is full. Your library is unchanged. Export Library, then remove entries you no longer need.';
  const PM_MSG_WRITE_BLOCKED = 'Could not save — browser storage is unavailable or blocked for this site. Your library is unchanged.';
  const PM_MSG_WRITE_SERIALIZATION = 'Could not save — this change could not be encoded for storage. Your library is unchanged.';
  const PM_MSG_WRITE_UNKNOWN = 'Could not save — storage write failed. Your library is unchanged.';

  const PM_MSG_writeFailure = (kind) => {
    if (kind === PM_WRITE_QUOTA) return PM_MSG_WRITE_QUOTA;
    if (kind === PM_WRITE_BLOCKED) return PM_MSG_WRITE_BLOCKED;
    if (kind === PM_WRITE_SERIALIZATION) return PM_MSG_WRITE_SERIALIZATION;
    return PM_MSG_WRITE_UNKNOWN;
  };

  /* Dirty comparison against the pristine draft. Field-wise rather than
   * serialized so key order can never produce a phantom dirty state. */
  const EDITOR_PM_isDirty = (kind, initial, draft) => {
    const a = initial || {}, b = draft || {};
    const s = (v) => String(v == null ? '' : v);
    if (kind === 'quick') return s(a.text) !== s(b.text);
    return s(a.title) !== s(b.title)
      || s(a.body) !== s(b.body)
      || ((a.type === 'append') ? 'append' : 'prompt') !== ((b.type === 'append') ? 'append' : 'prompt')
      || !!a.favorite !== !!b.favorite;
  };

  /* [ENGINE][MIGRATE] Draft migration identity.
   *
   * Exactly ONE authoritative identity per source record — the record's ID.
   *
   *   valid non-empty id  → that id IS the identity. Two records with different
   *                         valid ids are DISTINCT even when their text and
   *                         timestamps match; text must never override ids.
   *   no valid id         → a deterministic id derived from normalized text,
   *                         normalized createdAt, and the occurrence ordinal
   *                         among idless source drafts sharing that same
   *                         text+timestamp.
   *
   * The ordinal is what lets two genuinely separate idless records with
   * identical text AND timestamp both survive. The derived id contains no clock
   * reading and no randomness, so a retry recomputes it exactly and recognises
   * the copy made by the previous attempt.
   *
   * The earlier model attached a universal `tx:<text>` key to every record and
   * deduplicated on ANY key match, which silently collapsed distinct drafts
   * that merely shared text. That model is gone. */
  /* [ENGINE][MIGRATE] Reserved createdAt for migrated drafts whose source row
   * carried no usable timestamp.
   *
   * A migrated record must be recognisable on a later retry by comparing its
   * stored fields to the source row. Storing UTIL_now() for a missing timestamp
   * made that impossible — the value differed every attempt — so the retry test
   * used to skip the timestamp comparison whenever the source timestamp was 0.
   * That bypass meant an UNRELATED draft sitting on the generated id with the
   * same text was accepted as the retry copy, and the source row was then
   * dropped from History without ever being preserved.
   *
   * This sentinel closes that hole. It is deterministic, survives JSON
   * round-tripping, and is truthy, so loadDrafts()'s
   * `Number(d?.createdAt) || UTIL_now()` normalization leaves it intact rather
   * than replacing it with the current time. It is RESERVED: no real capture
   * path ever produces a negative createdAt. */
  const PM_MIG_UNKNOWN_CREATED_AT = -1;

  const ENGINE_PM_normDraftText = (v) => String(v ?? '').trim();
  /* Finite-only normalization. `Number(v) || 0` accepted Infinity because
   * Infinity is truthy, and a record stored with `createdAt: Infinity`
   * JSON-serializes to `null`. A retry then re-normalized that null to 0,
   * resolved it to the sentinel, failed to match the stored value, and created
   * a duplicate under the next suffix. Anything non-finite — Infinity,
   * -Infinity, NaN, non-numeric strings, absent/null/empty — normalizes to 0,
   * which the caller resolves to PM_MIG_UNKNOWN_CREATED_AT. Finite values,
   * including decimals, pass through unchanged. */
  const ENGINE_PM_normDraftTs = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const ENGINE_PM_validRecordId = (rec) => {
    const id = (typeof rec?.id === 'string') ? rec.id.trim() : '';
    return id || '';
  };
  // Identity material: timestamp, ordinal, text length and a hash of the text.
  // Length + hash together keep ordinary same-timestamp records apart; the
  // ordinal separates true duplicates of the same text at the same timestamp.
  const ENGINE_PM_migratedDraftId = (text, createdAt, ordinal) => {
    const t = ENGINE_PM_normDraftText(text);
    const ts = ENGINE_PM_normDraftTs(createdAt);
    const n = Number(ordinal) || 0;
    return `pmmig_${ts}_${n}_${t.length}_${UTIL_hash32(t)}`;
  };

  /* [ENGINE][STORE] Bound on quarantine candidate probing. Exhausting it is a
   * diagnostic no-op, never an overwrite. */
  const PM_QUARANTINE_MAX_CANDIDATES = 50;

  /* [ENGINE][STORE] Classified array read. */
  const PM_READ_ABSENT = 'absent';
  const PM_READ_CORRUPT = 'corrupt';
  const PM_READ_VALID = 'valid';

  const ENGINE_PM_readArray = (key) => {
    const rd = UTIL_storage.readRaw(key);
    if (!rd.ok) return { kind: PM_READ_CORRUPT, raw: null, value: [], err: rd.err };
    if (!rd.present) return { kind: PM_READ_ABSENT, raw: null, value: [], err: null };
    let parsed;
    try { parsed = JSON.parse(rd.raw); }
    catch (e) { return { kind: PM_READ_CORRUPT, raw: rd.raw, value: [], err: e }; }
    if (!Array.isArray(parsed)) {
      return { kind: PM_READ_CORRUPT, raw: rd.raw, value: [], err: new Error('stored value is not an array') };
    }
    return { kind: PM_READ_VALID, raw: rd.raw, value: parsed, err: null };
  };

  /* [ENGINE][STORE] Quarantine a malformed value.
   *
   * NEVER touches the primary key: the original bytes stay exactly where they
   * are, so a bad read is recoverable by hand.
   *
   * Deduplicated. A corrupt value is re-read on every boot, so writing a new
   * `<key>.corrupt.<ts>` each time would multiply the same payload across the
   * namespace and consume the very quota that produces write failures. If an
   * existing quarantine entry for this primary key already holds byte-identical
   * data, it is reused and nothing is written.
   *
   * A lookup or copy failure is diagnostic only — the primary key is never
   * modified on any path through this function.
   */
  const ENGINE_PM_quarantine = (key, raw, err) => {
    DIAG.counters.corruptReads += 1;
    STATE_PM.dataError = true;
    UTIL_diagErr(`ENGINE_PM.corruptRead:${key}`, err || 'malformed stored value');
    if (typeof raw !== 'string') return false;

    const prefix = `${key}.corrupt.`;

    // Reuse an existing byte-identical copy if one is already on disk.
    const allKeys = UTIL_storage.keys();
    if (allKeys === null) {
      UTIL_diagErr('ENGINE_PM.quarantineScan', `could not enumerate keys for ${prefix}`);
    } else {
      for (const k of allKeys) {
        if (!k.startsWith(prefix)) continue;
        if (UTIL_storage.getStr(k, null) === raw) return true; // already quarantined
      }
    }

    /* Explicit candidate selection. The key is timestamped to the millisecond,
     * so two DISTINCT corrupt payloads quarantined inside the same millisecond
     * resolve to the same base key. Reaching this point already proves no
     * byte-identical copy exists, so any occupied candidate holds DIFFERENT
     * bytes and must never be written over.
     *
     * Each candidate is generated, then read, and is used only when that read
     * both succeeds and reports present:false. setStr() is never called on an
     * occupied — or unprovable — candidate. An earlier bounded loop tested the
     * candidate before incrementing and so could fall out of the loop still
     * holding the occupied final suffix; selection now proves freedom first.
     *
     * If the bounded space is exhausted, nothing is written: no existing
     * quarantine entry changes and the primary key is untouched. */
    const base = `${prefix}${UTIL_now()}`; // one reading; all candidates share it
    let qKey = '';
    for (let n = 1; n <= PM_QUARANTINE_MAX_CANDIDATES; n += 1) {
      const candidate = (n === 1) ? base : `${base}.${n}`;
      const probe = UTIL_storage.readRaw(candidate);
      if (!probe.ok) {
        UTIL_diagErr('ENGINE_PM.quarantineProbe',
          `could not read candidate ${candidate}; refusing to write unproven slot`);
        return false;
      }
      if (!probe.present) { qKey = candidate; break; }
    }

    if (!qKey) {
      UTIL_diagErr('ENGINE_PM.quarantineExhausted',
        `no free quarantine slot for ${key} after ${PM_QUARANTINE_MAX_CANDIDATES} candidates; `
        + 'nothing written, existing copies and the primary key are untouched');
      return false;
    }

    const ok = UTIL_storage.setStr(qKey, raw);
    if (!ok) UTIL_diagErr('ENGINE_PM.quarantineFailed', `could not write ${qKey}`);
    return ok;
  };

  /* [ENGINE][STORE] Shared strict reader for the three capture stores.
   *
   * History, Drafts and Pasted previously read through
   * `UTIL_storage.getJSON(key, [])`, which collapses "key absent", "malformed
   * JSON" and "parsed non-array" into the same empty array. Automatic capture
   * then wrote a fresh one-item collection straight over the malformed bytes.
   *
   * Returns { ok, list }:
   *   { ok:true,  list:[]    } key genuinely absent
   *   { ok:true,  list:[...] } valid array (caller applies compatible normalization)
   *   { ok:false, list:[]    } malformed JSON or parsed non-array
   *
   * On corrupt input the primary key is left byte-identical, the approved
   * deduplicated quarantine mechanism runs (which sets dataError and records
   * diagnostics), and failure is reported. The quarantine implementation itself
   * is untouched. */
  /* [ENGINE][CAPTURE] Exact occurrence snapshot for a capture record.
   *
   * Identity for a rendered card is the WHOLE record, not its id: ids are not
   * unique across History/Drafts/Pasted, so an id-only check let a different
   * record occupy the rendered index and pass verification. Normalized through
   * the same helpers the stores use, so a snapshot round-trips exactly. */
  const ENGINE_PM_captureSnapshot = (rec) => ({
    id: String(rec?.id ?? ''),
    text: ENGINE_PM_normDraftText(rec?.text),
    createdAt: ENGINE_PM_normDraftTs(rec?.createdAt),
    source: String(rec?.source ?? '').toLowerCase(),
  });

  /* [ENGINE][CAPTURE] Verify a rendered card against the CURRENT full
   * collection. Pure, and shared by all three capture stores.
   *
   * Returns the live record only when the recorded index still holds a record
   * matching the complete rendered snapshot — id, normalized text, normalized
   * finite createdAt and source — and (when supplied) the expected source.
   * Otherwise null, and the caller must abort and rerender rather than guess.
   *
   * Comparison is on the exact normalized fields. No hash is used as the
   * comparison authority: earlier audits proved 32-bit collisions are real.
   * When two records are byte-equivalent across these fields either occurrence
   * is semantically equivalent, and the verified index still guarantees that a
   * deletion removes exactly one of them. */
  const ENGINE_PM_verifyCaptureOccurrence = (list, fullIndex, snapshot, expectedSource) => {
    if (!Array.isArray(list)) return null;
    if (!snapshot || typeof snapshot !== 'object') return null;

    const i = Number(fullIndex);
    if (!Number.isInteger(i) || i < 0 || i >= list.length) return null;

    const rec = list[i];
    if (!rec) return null;

    const cur = ENGINE_PM_captureSnapshot(rec);
    const want = ENGINE_PM_captureSnapshot(snapshot);

    if (expectedSource && cur.source !== String(expectedSource).toLowerCase()) return null;
    if (cur.id !== want.id) return null;
    if (cur.text !== want.text) return null;
    if (cur.createdAt !== want.createdAt) return null;
    if (cur.source !== want.source) return null;
    return rec;
  };

  /* Parse a snapshot serialized into a card's data attribute. */
  const ENGINE_PM_parseSnapshot = (raw) => {
    try {
      const o = JSON.parse(String(raw ?? ''));
      return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null;
    } catch { return null; }
  };

  const ENGINE_PM_readCaptureStore = (key) => {
    const rd = ENGINE_PM_readArray(key);
    if (rd.kind === PM_READ_CORRUPT) {
      ENGINE_PM_quarantine(key, rd.raw, rd.err);
      return { ok: false, list: [] };
    }
    return { ok: true, list: rd.value };
  };

  /* [ENGINE][STORE] Record a failed write uniformly.
   *
   * The counter and dataError semantics are unchanged. The diagnostic line now
   * carries the classified KIND only — never the payload, the stored value or
   * the raw exception text — so a diagnostic dump can never leak Prompt or
   * Quick Reply content that a user wrote. */
  const ENGINE_PM_noteWriteFailure = (where, kind) => {
    DIAG.counters.writeFailures += 1;
    STATE_PM.dataError = true;
    const k = String(kind || PM_WRITE_UNKNOWN);
    UTIL_diagErr(where, `localStorage write failed (${k})`);
    return false;
  };

  /* Persist a candidate list under one key and return the CLASSIFIED result of
   * that single attempt. Callers that only need a boolean keep using the
   * existing persist, save and commit spellings; callers that must explain the
   * failure to the user take the result object instead. */
  const ENGINE_PM_persistListResult = (where, key, list) => SAFE_try(where, () => {
    const next = Array.isArray(list) ? list : [];
    const res = UTIL_storage.setJSONResult(key, next);
    if (!res.ok) ENGINE_PM_noteWriteFailure(where, res.kind);
    return res;
  }, UTIL_writeFail(PM_WRITE_UNKNOWN, null));

  const ENGINE_PM = {
    /* [MIGRATE] Legacy `ho:pm:*` keys → namespaced keys. Non-destructive.
     *
     * Presence is `getItem(key) !== null`, so '' counts as PRESENT. The previous
     * implementation treated '' as absent and copied a legacy value over it,
     * destroying the one artefact the safe loader would otherwise quarantine.
     * It also deleted the legacy key unconditionally — including when the
     * destination write had failed — losing the only remaining copy.
     *
     * Per pair, exactly one terminal state is acceptable:
     *   destination present            → never overwritten; legacy RETAINED as a
     *                                    recovery copy (safer than deleting it,
     *                                    and explicitly permitted)
     *   destination + legacy absent    → nothing to copy
     *   destination absent, legacy present → write, read back, require byte
     *                                    equality, and only then delete legacy
     *
     * Any failure leaves the legacy key untouched and the marker unset, so the
     * next boot retries. Returns true only when every pair reached a terminal
     * state AND the marker was persisted. */
    migrateKeysOnce() {
      return SAFE_try('ENGINE_PM.migrateKeysOnce', () => {
        if (UTIL_storage.getStr(KEY_PM_MIG_KEYS_V1, '0') === '1') return true;

        const pairs = [
          [KEY_PM_STATE_PROMPTS_V1, KEY_LEG_PROMPTS],
          [KEY_PM_CFG_AUTOSEND_V1, KEY_LEG_AUTOSEND],
          [KEY_PM_STATE_LAST_USED_V1, KEY_LEG_LAST_USED],
          [KEY_PM_STATE_QUICK_V1, KEY_LEG_QUICK],
          [KEY_PM_STATE_HISTORY_V1, KEY_LEG_HISTORY],
          [KEY_PM_UI_MODE_V1, KEY_LEG_MODE],
        ];

        let allTerminal = true;

        for (const [kNew, kOld] of pairs) {
          const dst = UTIL_storage.readRaw(kNew);
          if (!dst.ok) {
            STATE_PM.dataError = true;
            UTIL_diagErr('ENGINE_PM.migrateKeysOnce.readDest', `unreadable destination ${kNew}`);
            allTerminal = false;
            continue;
          }

          // Destination present — including '' and any malformed string. Never
          // overwritten, and a differing legacy value is never deleted.
          if (dst.present) continue;

          const src = UTIL_storage.readRaw(kOld);
          if (!src.ok) {
            STATE_PM.dataError = true;
            UTIL_diagErr('ENGINE_PM.migrateKeysOnce.readLegacy', `unreadable legacy ${kOld}`);
            allTerminal = false;
            continue;
          }
          if (!src.present) continue; // nothing to copy — terminal

          // Verified copy: write → read back → require byte equality.
          if (!UTIL_storage.setStr(kNew, src.raw)) {
            ENGINE_PM_noteWriteFailure(`ENGINE_PM.migrateKeysOnce.write:${kNew}`);
            allTerminal = false;
            continue; // legacy untouched
          }
          const back = UTIL_storage.readRaw(kNew);
          if (!back.ok || !back.present || back.raw !== src.raw) {
            STATE_PM.dataError = true;
            UTIL_diagErr('ENGINE_PM.migrateKeysOnce.verify',
              `read-back mismatch for ${kNew}; legacy ${kOld} retained`);
            allTerminal = false;
            continue; // legacy untouched
          }

          UTIL_storage.del(kOld); // only after verified persistence
        }

        if (!allTerminal) return false; // marker stays unset → retry next boot

        if (!UTIL_storage.setStr(KEY_PM_MIG_KEYS_V1, '1')) {
          ENGINE_PM_noteWriteFailure('ENGINE_PM.migrateKeysOnce.marker');
          return false; // source data already safe; retry is harmless
        }
        return true;
      }, false);
    },

    /* [MIGRATE] Move `source:'draft'` rows out of History into Drafts.
     *
     * Lossless and retry-safe. The previous implementation wrote Drafts and the
     * filtered History without checking either result, then set the marker
     * unconditionally — so a failed Drafts write still stripped those rows from
     * History and declared the migration done, destroying them. It also read
     * History through getJSON(..., []), which turns a malformed value into an
     * empty array and would then persist that emptiness over the real bytes.
     *
     * Ordering (each step gated on the previous one):
     *   1. read History and Drafts WITHOUT modifying either; fail closed if
     *      either is present-but-malformed
     *   2. compute the candidate Drafts and the candidate filtered History
     *   3. persist Drafts first
     *   4. persist filtered History only if Drafts succeeded
     *   5. write the marker only if BOTH writes succeeded
     *
     * Any failure returns false with the marker unset. A retry cannot duplicate
     * already-copied rows because candidates are deduplicated against whatever
     * Drafts currently holds. */
    migrateDraftsFromHistoryOnce() {
      return SAFE_try('ENGINE_PM.migrateDraftsFromHistoryOnce', () => {
        if (UTIL_storage.getStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '0') === '1') return true;

        // 1. Fail closed on malformed source data — never rewrite it to [].
        const histRd = ENGINE_PM_readArray(KEY_PM_STATE_HISTORY_V1);
        if (histRd.kind === PM_READ_CORRUPT) {
          STATE_PM.dataError = true;
          UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.history',
            'History is present but malformed — migration deferred, bytes untouched');
          return false;
        }
        const draftRd = ENGINE_PM_readArray(KEY_PM_STATE_DRAFTS_V1);
        if (draftRd.kind === PM_READ_CORRUPT) {
          STATE_PM.dataError = true;
          UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.drafts',
            'Drafts is present but malformed — migration deferred, bytes untouched');
          return false;
        }

        const hist = histRd.value;
        const drafts = draftRd.value.slice();

        /* Retry-safe dedup keyed on the ONE authoritative identity: the record
         * id. Existing drafts contribute their valid ids; a source row supplies
         * either its own valid id or a deterministic derived one. Text is never
         * an identity on its own, so distinct records that merely share text are
         * preserved.
         *
         * Note: an existing draft carrying no valid id cannot be matched by
         * identity. Such rows are never removed — they are simply not dedup
         * targets. (Only a migration left half-finished by the pre-correction
         * code could produce one, since that path assigned random ids.) */
        // id -> record, so a candidate collision can be inspected rather than
        // merely detected. Records without a valid id are not dedup targets.
        const existingById = new Map();
        for (const d of drafts) {
          const id = ENGINE_PM_validRecordId(d);
          if (id) existingById.set(id, d);
        }

        /* Bound on deterministic collision suffixes. DRAFTS_MAX + 1 exceeds the
         * number of records the store can hold, so exhausting it means the
         * candidate space is genuinely unusable rather than merely crowded. */
        const MAX_ID_CANDIDATES = (Number(CFG_PM.DRAFTS_MAX) || 50) + 1;

        // 2. Build both candidates.
        const keep = [];
        /* ONE monotonic ordinal across every idless draft row, in source order.
         * A bucket-local ordinal restarted at 0 for each distinct text, so two
         * different rows of equal length whose text hashes collided derived the
         * SAME id and the second was silently dropped as "already migrated"
         * (e.g. '7QjG3tiYE8' and 'KNjz6XA4ov' both hash to 5f9d7f26). The global
         * ordinal makes row uniqueness structural; the hash is now only
         * descriptive material. It advances for EVERY idless row, migrated or
         * not, so a retry over the byte-identical source assigns identical
         * ordinals. */
        let idlessOrdinal = 0;
        let handled = 0;
        let identityExhausted = '';
        let validIdCollision = '';

        for (const it of hist) {
          const source = String(it?.source || '').toLowerCase();
          const text = ENGINE_PM_normDraftText(it?.text);
          if (!text) continue; // unchanged: empty rows were already dropped
          if (source === 'draft') {
            handled += 1;

            /* Two distinct timestamps, deliberately:
             *   sourceTs — the normalized source value (0 when missing). Feeds
             *              the generated id, so the id format and the global
             *              ordinal are unchanged.
             *   storedTs — what the migrated record actually carries. A missing
             *              timestamp becomes the reserved sentinel instead of
             *              UTIL_now(), so the stored value is DETERMINISTIC and
             *              a later retry can compare against it. The migration
             *              never reads the clock for either record shape. */
            const sourceTs = ENGINE_PM_normDraftTs(it?.createdAt);
            const storedTs = (sourceTs !== 0) ? sourceTs : PM_MIG_UNKNOWN_CREATED_AT;

            /* Content comparator, shared by both identity paths. An occupant is
             * the already-migrated copy of THIS row only when its normalized
             * text and its deterministic stored timestamp both match. */
            const isRetryCopy = (rec) => {
              if (!rec) return false;
              if (ENGINE_PM_normDraftText(rec.text) !== text) return false;
              if (ENGINE_PM_normDraftTs(rec.createdAt) !== storedTs) return false;
              return true;
            };

            /* A valid source id stays authoritative — but an existing record
             * already holding that id is no longer accepted blindly. Accepting
             * it discarded the source row whenever the two differed. A valid id
             * is never silently suffixed in this phase: on a genuine collision
             * the migration fails closed and both stores are preserved intact
             * for the owner to resolve. */
            const ownId = ENGINE_PM_validRecordId(it);
            if (ownId) {
              const occupant = existingById.get(ownId);
              if (occupant) {
                if (isRetryCopy(occupant)) continue; // idempotent retry
                validIdCollision = ownId;
                break; // fail closed, before any collection is written
              }
              const ownRec = { id: ownId, text, createdAt: storedTs };
              existingById.set(ownId, ownRec);
              drafts.push(ownRec);
              continue;
            }

            /* Idless row: derive a deterministic base, then resolve collisions
             * against records that already occupy that id.
             *
             * An occupied candidate counts as a retry copy ONLY when its
             * content matches this source row — text AND timestamp, always.
             * The former `ts !== 0` bypass skipped the timestamp check for a
             * source row with no usable timestamp, which let an UNRELATED
             * record with the same text be accepted as the retry copy and the
             * source row silently dropped. Comparing against storedTs makes the
             * check total: a genuine retry copy carries the sentinel, anything
             * else does not and is skipped over to a deterministic suffix. */
            const ordinal = idlessOrdinal;
            idlessOrdinal += 1;
            const base = ENGINE_PM_migratedDraftId(text, sourceTs, ordinal);

            let chosen = '';
            let alreadyMigrated = false;
            for (let n = 1; n <= MAX_ID_CANDIDATES; n += 1) {
              const candidate = (n === 1) ? base : `${base}.${n}`;
              const occupant = existingById.get(candidate);
              if (!occupant) { chosen = candidate; break; }  // proven unused
              if (isRetryCopy(occupant)) { alreadyMigrated = true; break; }
              // occupied by a DIFFERENT record — keep looking
            }

            if (alreadyMigrated) continue;
            if (!chosen) {
              identityExhausted = base;
              break; // fail closed, before any collection is written
            }

            const rec = { id: chosen, text, createdAt: storedTs };
            existingById.set(chosen, rec);
            drafts.push(rec);
            continue;
          }
          keep.push(it);
        }

        if (validIdCollision) {
          STATE_PM.dataError = true;
          UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.validIdCollision',
            `draft id ${validIdCollision} is already held by a record with different content; `
            + 'nothing written, History and Drafts left byte-identical, migration deferred');
          return false;
        }

        if (identityExhausted) {
          STATE_PM.dataError = true;
          UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.identityExhausted',
            `no free draft id after ${MAX_ID_CANDIDATES} candidates from ${identityExhausted}; `
            + 'nothing written, History and Drafts left byte-identical, migration deferred');
          return false;
        }

        // Nothing to move and nothing to drop → no writes, just record completion.
        const historyUnchanged = (handled === 0 && keep.length === hist.length);
        const draftsUnchanged = (drafts.length === draftRd.value.length);

        let nextDrafts = drafts;
        if (nextDrafts.length > CFG_PM.DRAFTS_MAX) {
          nextDrafts = nextDrafts.slice(nextDrafts.length - CFG_PM.DRAFTS_MAX);
        }

        // 3. Drafts FIRST. On failure History is left byte-for-byte untouched.
        if (!(draftsUnchanged && historyUnchanged)) {
          if (!ENGINE_PM.saveDrafts(nextDrafts)) {
            UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.saveDrafts',
              'Drafts write failed — History left untouched, migration deferred');
            return false;
          }

          // 4. Filtered History only after Drafts is safely stored. If this
          //    fails the original History survives; the retry dedups.
          if (!historyUnchanged && !ENGINE_PM.saveHistory(keep)) {
            UTIL_diagErr('ENGINE_PM.migrateDraftsFromHistoryOnce.saveHistory',
              'History write failed after Drafts succeeded — original History retained, '
              + 'migration deferred; retry is idempotent');
            return false;
          }
        }

        // 5. Marker only once both collections are safe.
        if (!UTIL_storage.setStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '1')) {
          ENGINE_PM_noteWriteFailure('ENGINE_PM.migrateDraftsFromHistoryOnce.marker');
          return false; // migrated data is already safe; retry is idempotent
        }
        return true;
      }, false);
    },

    defaultPromptsSeed() {
      const now = UTIL_now();
      return [
        { id: UTIL_cryptoId(), title: 'G: (grammar only)', body: 'G:', favorite: true, type: 'append', createdAt: now, updatedAt: now },
        { id: UTIL_cryptoId(), title: 'Deep Dive', body: 'Give a structured deep dive on this topic…', favorite: false, type: 'prompt', createdAt: now, updatedAt: now },
      ];
    },

    /* [SEED] One-time seed state, independent per collection. */
    loadSeedState() {
      return SAFE_try('ENGINE_PM.loadSeedState', () => {
        const raw = UTIL_storage.getJSON(KEY_PM_STATE_SEEDED_V1, null);
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        return { prompts: o.prompts === true, quickReplies: o.quickReplies === true };
      }, { prompts: false, quickReplies: false });
    },
    markSeeded(field) {
      return SAFE_try('ENGINE_PM.markSeeded', () => {
        const cur = ENGINE_PM.loadSeedState();
        cur[field] = true;
        if (!UTIL_storage.setJSON(KEY_PM_STATE_SEEDED_V1, cur)) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.markSeeded');
        }
        return true;
      }, false);
    },

    loadPrompts() {
      return SAFE_try('ENGINE_PM.loadPrompts', () => {
        const rd = ENGINE_PM_readArray(KEY_PM_STATE_PROMPTS_V1);

        // Malformed: preserve the original bytes, quarantine a copy, hand back
        // an empty list. The primary key is never written on this path.
        if (rd.kind === PM_READ_CORRUPT) {
          ENGINE_PM_quarantine(KEY_PM_STATE_PROMPTS_V1, rd.raw, rd.err);
          return [];
        }

        // Absent: seed at most once, ever.
        if (rd.kind === PM_READ_ABSENT) {
          if (ENGINE_PM.loadSeedState().prompts) return [];
          const seeded = ENGINE_PM.defaultPromptsSeed();
          if (!UTIL_storage.setJSON(KEY_PM_STATE_PROMPTS_V1, seeded)) {
            ENGINE_PM_noteWriteFailure('ENGINE_PM.loadPrompts.seedWrite');
            return []; // never report a seed that was not persisted
          }
          DIAG.counters.seeds += 1;
          ENGINE_PM.markSeeded('prompts');
          return seeded;
        }

        // Valid — including a legitimately empty list, which is never reseeded.
        const arr = rd.value;
        let changed = false;
        for (const p of arr) {
          if (!p || typeof p !== 'object') continue;
          if (!p.type) { p.type = 'prompt'; changed = true; }
          if (!p.createdAt) { p.createdAt = UTIL_now(); changed = true; }
          if (!p.updatedAt) { p.updatedAt = UTIL_now(); changed = true; }
          /* [2B] Optional usage metadata. ABSENT is left absent on purpose: the
           * reader normalizes absence to 0, so writing the fields onto every
           * legacy record would be a mass rewrite with no behavioural gain and
           * no schema-version story. A field that is PRESENT but invalid is a
           * different matter — Infinity/NaN/negatives are repaired here, exactly
           * like a missing `type`, so they can never reach storage or scoring. */
          if (p.lastUsedAt !== undefined) {
            const nt = ENGINE_PM_normUsageTs(p.lastUsedAt);
            if (nt !== p.lastUsedAt) { p.lastUsedAt = nt; changed = true; }
          }
          if (p.useCount !== undefined) {
            const nc = ENGINE_PM_normUseCount(p.useCount);
            if (nc !== p.useCount) { p.useCount = nc; changed = true; }
          }
        }
        if (changed && !UTIL_storage.setJSON(KEY_PM_STATE_PROMPTS_V1, arr)) {
          ENGINE_PM_noteWriteFailure('ENGINE_PM.loadPrompts.normalizeWrite');
        }
        return arr;
      }, []);
    },

    /* [STORE] Raw persistence — writes bytes only.
     * Never adopts state and never emits. Kept separate from the commit path so
     * that state adoption always precedes event publication. */
    persistPromptsResult(list) {
      return ENGINE_PM_persistListResult('ENGINE_PM.persistPrompts', KEY_PM_STATE_PROMPTS_V1, list);
    },
    persistQuickResult(list) {
      return ENGINE_PM_persistListResult('ENGINE_PM.persistQuick', KEY_PM_STATE_QUICK_V1, list);
    },
    persistPrompts(list) {
      return ENGINE_PM.persistPromptsResult(list).ok;
    },
    persistQuick(list) {
      return ENGINE_PM.persistQuickResult(list).ok;
    },

    /* [STORE] Commit — the single ordering that callers and listeners rely on:
     *
     *   1. persist the candidate
     *   2. adopt it as the authoritative in-memory array
     *   3. emit canonical + legacy changed events
     *   4. report success
     *
     * A synchronous `changed` listener therefore always observes the NEW array
     * on STATE_PM.data.*, never the array it is replacing. A failed write stops
     * at step 1: nothing is adopted and no event is emitted, so the previous
     * authoritative state survives untouched (callers build candidates without
     * mutating the live array or its records, so this holds by construction).
     *
     * savePrompts/saveQuick are the public spelling of this same commit; they
     * are NOT raw writes. Use persist* when bytes-only is genuinely intended. */
    savePromptsResult(list) {
      return SAFE_try('ENGINE_PM.savePrompts', () => {
        const next = Array.isArray(list) ? list : [];
        const res = ENGINE_PM.persistPromptsResult(next);
        if (!res.ok) return res;                   // nothing adopted, nothing emitted
        STATE_PM.data.prompts = next;              // adopt BEFORE publishing
        UTIL_emitPmChanged({ what: 'prompts' });
        return res;
      }, UTIL_writeFail(PM_WRITE_UNKNOWN, null));
    },
    savePrompts(list) {
      return ENGINE_PM.savePromptsResult(list).ok;
    },
    /* commit*Result carries the classified failure to the UI so the user can be
     * told WHY. commit* keeps the boolean contract every existing caller and
     * pinned invariant already relies on. A non-array candidate never reaches
     * storage, so it is an UNKNOWN refusal rather than a storage condition. */
    commitPromptsResult(nextList) {
      if (!Array.isArray(nextList)) return UTIL_writeFail(PM_WRITE_UNKNOWN, null);
      return ENGINE_PM.savePromptsResult(nextList);
    },
    commitQuickResult(nextList) {
      if (!Array.isArray(nextList)) return UTIL_writeFail(PM_WRITE_UNKNOWN, null);
      return ENGINE_PM.saveQuickResult(nextList);
    },
    commitPrompts(nextList) {
      return ENGINE_PM.commitPromptsResult(nextList).ok;
    },
    commitQuick(nextList) {
      return ENGINE_PM.commitQuickResult(nextList).ok;
    },

    getAutoSend() {
      return UTIL_storage.getStr(KEY_PM_CFG_AUTOSEND_V1, '0') === '1';
    },
    setAutoSend(on) {
      UTIL_storage.setStr(KEY_PM_CFG_AUTOSEND_V1, on ? '1' : '0');
      UTIL_emitPmChanged({ what: 'autosend', on: !!on });
    },

    /* True once migrateDraftsFromHistoryOnce() has safely copied every
     * draft-source row into Drafts. Until then those rows are the ONLY copy. */
    draftsMigrationComplete() {
      return UTIL_storage.getStr(KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1, '0') === '1';
    },

    /* Loads the FULL History collection.
     *
     * While the drafts migration is incomplete, `source: 'draft'` rows are the
     * only copy of that text anywhere. This routine used to drop them, flag the
     * collection changed and write the filtered array straight back — so a
     * single ordinary read after a safely deferred migration destroyed exactly
     * the data the deferral was protecting. Now they are carried through
     * VERBATIM (not even re-id'd or re-timestamped) so the migration's
     * deterministic identity derivation stays stable across attempts, and so any
     * normalization write still contains them.
     *
     * Callers that display sent history must filter `source: 'draft'` for
     * DISPLAY ONLY — the returned collection is what save paths write back, and
     * dropping rows from it is what caused the loss. */
    /* Strict read: { ok, list }. ok === false means the caller must NOT treat
     * `list` as authoritative — either the stored value was corrupt (list is
     * empty, primary bytes preserved and quarantined) or a required
     * normalization write failed. Mutations must abort on !ok; UI reads may
     * still render `list`. */
    loadHistoryStrict() {
      return SAFE_try('ENGINE_PM.loadHistoryStrict', () => {
        const rd = ENGINE_PM_readCaptureStore(KEY_PM_STATE_HISTORY_V1);
        if (!rd.ok) return { ok: false, list: [] };
        const arr = rd.list;
        const migDone = ENGINE_PM.draftsMigrationComplete();
        let changed = false;
        const out = [];
        for (const h of arr) {
          const text = String(h?.text || '').trim();
          if (!text) { changed = true; continue; }
          const source = String(h?.source || '').toLowerCase();
          if (source === 'draft') {
            // Migration complete ⇒ the Drafts copy is proven, so a stale row is
            // cleanup. Incomplete ⇒ preserve verbatim; this is the only copy.
            if (migDone) { changed = true; continue; }
            out.push(h);
            continue;
          }
          const id = String(h?.id || UTIL_cryptoId());
          // Finite-only normalization: a non-finite value would otherwise
          // serialize to null on the normalization write.
          const createdAt = ENGINE_PM_normDraftTs(h?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt, source: 'send' });
          if (h?.id !== id || h?.createdAt !== createdAt || h?.source !== 'send' || h?.text !== text) changed = true;
        }

        /* Retention trimming drops the OLDEST entry. While the migration is
         * incomplete a pending draft must never be the one dropped, so trimming
         * removes the oldest non-draft row instead and stops if only pending
         * drafts remain. */
        const dropOldest = () => {
          if (migDone) { out.shift(); return true; }
          const i = out.findIndex(r => String(r?.source || '').toLowerCase() !== 'draft');
          if (i === -1) return false;
          out.splice(i, 1);
          return true;
        };

        while (out.length > CFG_PM.HISTORY_MAX) {
          if (!dropOldest()) break;
          changed = true;
        }
        // Byte-level cap: trim oldest entries until serialised size is within budget
        let byteLen = JSON.stringify(out).length;
        while (byteLen > CFG_PM.HISTORY_BYTE_CAP && out.length > 1) {
          if (!dropOldest()) break;
          changed = true;
          byteLen = JSON.stringify(out).length;
        }
        // Normalization must go through the truthful save function; a failed
        // write means the normalized shape is NOT authoritative.
        if (changed && !ENGINE_PM.saveHistory(out)) return { ok: false, list: out };
        return { ok: true, list: out };
      }, { ok: false, list: [] });
    },

    // UI/back-compat view. Callers that mutate must use loadHistoryStrict().
    loadHistory() { return ENGINE_PM.loadHistoryStrict().list; },

    /* Visible sent entries paired with their FULL-collection index.
     *
     * Cards must be addressed by occurrence, not by id alone: a hidden pending
     * draft can carry the same id as a visible sent row, and two sent rows can
     * share an id, so an id-only lookup can resolve — or delete — the wrong
     * record. Each entry is { item, fullIndex } against the full collection. */
    sentHistoryEntries() {
      const list = ENGINE_PM.loadHistory();
      const out = [];
      list.forEach((item, fullIndex) => {
        if (String(item?.source || '').toLowerCase() === 'send') {
          out.push({ item, fullIndex, snapshot: ENGINE_PM_captureSnapshot(item) });
        }
      });
      return out;
    },

    /* Occurrence entries for a capture collection. Derived from the FULL
     * normalized collection BEFORE any sort or filter, so each entry keeps its
     * original full index; sorting/filtering the entries afterwards cannot
     * disturb it. Used by Drafts and Pasted, which are id-addressed today and
     * can legitimately hold two rows sharing an id. */
    captureEntries(list) {
      const out = [];
      (Array.isArray(list) ? list : []).forEach((item, fullIndex) => {
        out.push({ item, fullIndex, snapshot: ENGINE_PM_captureSnapshot(item) });
      });
      return out;
    },

    /* Sent-only view of History, for rendering. Display-only: never write this
     * back, or pending drafts are lost. */
    loadHistorySent() {
      return ENGINE_PM.loadHistory().filter(
        (h) => String(h?.source || '').toLowerCase() !== 'draft',
      );
    },
    saveHistory(list) {
      return SAFE_try('ENGINE_PM.saveHistory', () => {
        if (!UTIL_storage.setJSON(KEY_PM_STATE_HISTORY_V1, Array.isArray(list) ? list : [])) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.saveHistory');
        }
        return true;
      }, false);
    },
    // Returns true when the store ends in the intended state — including the
    // deliberate empty/duplicate skips. False means a write was attempted and
    // failed.
    pushHistory(text) {
      return SAFE_try('ENGINE_PM.pushHistory', () => {
        const clean = String(text || '').trim();
        if (!clean) return true;

        // Strict read: a corrupt (or unpersistable) collection must abort the
        // capture, never be replaced by a fresh one-item array.
        const rd = ENGINE_PM.loadHistoryStrict();
        if (!rd.ok) {
          UTIL_diagErr('ENGINE_PM.pushHistory.strictRead',
            'History is not authoritative — capture aborted, primary bytes preserved');
          return false;
        }
        // Full collection — pending drafts included, so this save preserves them.
        let hist = rd.list;

        /* Dedup against the most recent SENT record. The final element is not
         * necessarily a sent one: while the drafts migration is deferred a
         * pending draft can sit at the tail, and comparing against it would
         * both miss a real duplicate and let a draft's text suppress a genuine
         * send. */
        let lastSent = null;
        for (let i = hist.length - 1; i >= 0; i -= 1) {
          if (String(hist[i]?.source || '').toLowerCase() === 'send') { lastSent = hist[i]; break; }
        }
        if (lastSent && lastSent.text === clean) return true;

        hist.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now(), source: 'send' });
        // Trim the oldest SENT rows only; a pending draft is the only copy.
        if (hist.length > CFG_PM.HISTORY_MAX) {
          const keepDrafts = !ENGINE_PM.draftsMigrationComplete();
          while (hist.length > CFG_PM.HISTORY_MAX) {
            const i = keepDrafts
              ? hist.findIndex(r => String(r?.source || '').toLowerCase() !== 'draft')
              : 0;
            if (i === -1) break;
            hist.splice(i, 1);
          }
        }

        const ok = ENGINE_PM.saveHistory(hist);
        if (ok) UTIL_diagStep(`[HIST][${MODTAG}] capture`, `send:${clean.length}`);
        return ok;
      }, false);
    },

    /* Strict read: { ok, list }. See loadHistoryStrict for the contract. */
    loadDraftsStrict() {
      return SAFE_try('ENGINE_PM.loadDraftsStrict', () => {
        const rd = ENGINE_PM_readCaptureStore(KEY_PM_STATE_DRAFTS_V1);
        if (!rd.ok) return { ok: false, list: [] };
        let changed = false;
        const out = [];
        for (const d of rd.list) {
          const text = String(d?.text || '').trim();
          if (!text) { changed = true; continue; }
          const id = String(d?.id || UTIL_cryptoId());
          // Finite-only: the reserved sentinel (-1) is finite and survives;
          // a non-finite value would otherwise serialize to null.
          const createdAt = ENGINE_PM_normDraftTs(d?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt });
          if (d?.id !== id || d?.createdAt !== createdAt || d?.text !== text) changed = true;
        }
        if (out.length > CFG_PM.DRAFTS_MAX) {
          changed = true;
          out.splice(0, out.length - CFG_PM.DRAFTS_MAX);
        }
        let byteLen = JSON.stringify(out).length;
        while (byteLen > CFG_PM.DRAFTS_BYTE_CAP && out.length > 1) {
          out.shift(); changed = true;
          byteLen = JSON.stringify(out).length;
        }
        if (changed && !ENGINE_PM.saveDrafts(out)) return { ok: false, list: out };
        return { ok: true, list: out };
      }, { ok: false, list: [] });
    },
    // UI/back-compat view. Callers that mutate must use loadDraftsStrict().
    loadDrafts() { return ENGINE_PM.loadDraftsStrict().list; },
    saveDrafts(list) {
      return SAFE_try('ENGINE_PM.saveDrafts', () => {
        if (!UTIL_storage.setJSON(KEY_PM_STATE_DRAFTS_V1, Array.isArray(list) ? list : [])) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.saveDrafts');
        }
        return true;
      }, false);
    },
    pushDraft(text) {
      return SAFE_try('ENGINE_PM.pushDraft', () => {
        const clean = String(text || '').trim();
        if (!clean) return true;
        const rd = ENGINE_PM.loadDraftsStrict();
        if (!rd.ok) {
          UTIL_diagErr('ENGINE_PM.pushDraft.strictRead',
            'Drafts is not authoritative — capture aborted, primary bytes preserved');
          return false;
        }
        let drafts = rd.list;
        const last = drafts[drafts.length - 1];
        if (last && last.text === clean) return true;
        drafts.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now() });
        if (drafts.length > CFG_PM.DRAFTS_MAX) drafts = drafts.slice(drafts.length - CFG_PM.DRAFTS_MAX);
        const ok = ENGINE_PM.saveDrafts(drafts);
        if (ok) UTIL_diagStep(`[DRF][${MODTAG}] capture`, `${clean.length}`);
        return ok;
      }, false);
    },

    /* Strict read: { ok, list }. See loadHistoryStrict for the contract. */
    loadPastedStrict() {
      return SAFE_try('ENGINE_PM.loadPastedStrict', () => {
        const rd = ENGINE_PM_readCaptureStore(KEY_PM_STATE_PASTED_V1);
        if (!rd.ok) return { ok: false, list: [] };
        let changed = false;
        const out = [];
        for (const p of rd.list) {
          const text = String(p?.text || '').trim();
          if (!text) { changed = true; continue; }
          const id = String(p?.id || UTIL_cryptoId());
          const createdAt = ENGINE_PM_normDraftTs(p?.createdAt) || UTIL_now();
          out.push({ id, text, createdAt });
          if (p?.id !== id || p?.createdAt !== createdAt || p?.text !== text) changed = true;
        }
        if (out.length > CFG_PM.PASTED_MAX) {
          changed = true;
          out.splice(0, out.length - CFG_PM.PASTED_MAX);
        }
        let byteLen = JSON.stringify(out).length;
        while (byteLen > CFG_PM.PASTED_BYTE_CAP && out.length > 1) {
          out.shift(); changed = true;
          byteLen = JSON.stringify(out).length;
        }
        if (changed && !ENGINE_PM.savePasted(out)) return { ok: false, list: out };
        return { ok: true, list: out };
      }, { ok: false, list: [] });
    },
    // UI/back-compat view. Callers that mutate must use loadPastedStrict().
    loadPasted() { return ENGINE_PM.loadPastedStrict().list; },
    savePasted(list) {
      return SAFE_try('ENGINE_PM.savePasted', () => {
        if (!UTIL_storage.setJSON(KEY_PM_STATE_PASTED_V1, Array.isArray(list) ? list : [])) {
          return ENGINE_PM_noteWriteFailure('ENGINE_PM.savePasted');
        }
        return true;
      }, false);
    },
    pushPasted(text) {
      return SAFE_try('ENGINE_PM.pushPasted', () => {
        const clean = String(text || '').trim();
        if (!clean) return true;
        const rd = ENGINE_PM.loadPastedStrict();
        if (!rd.ok) {
          UTIL_diagErr('ENGINE_PM.pushPasted.strictRead',
            'Pasted is not authoritative — capture aborted, primary bytes preserved');
          return false;
        }
        let pasted = rd.list;
        const last = pasted[pasted.length - 1];
        if (last && last.text === clean) return true;
        pasted.push({ id: UTIL_cryptoId(), text: clean, createdAt: UTIL_now() });
        if (pasted.length > CFG_PM.PASTED_MAX) pasted = pasted.slice(pasted.length - CFG_PM.PASTED_MAX);
        const ok = ENGINE_PM.savePasted(pasted);
        if (ok) UTIL_diagStep(`[PST][${MODTAG}] capture`, `${clean.length}`);
        return ok;
      }, false);
    },

    defaultQuickSeed() {
      const now = UTIL_now();
      return ['Yes', 'No', 'Continue', 'Next'].map((text, idx) => ({
        id: UTIL_cryptoId(), text, order: idx, createdAt: now, updatedAt: now,
      }));
    },

    loadQuick() {
      return SAFE_try('ENGINE_PM.loadQuick', () => {
        const rd = ENGINE_PM_readArray(KEY_PM_STATE_QUICK_V1);

        if (rd.kind === PM_READ_CORRUPT) {
          ENGINE_PM_quarantine(KEY_PM_STATE_QUICK_V1, rd.raw, rd.err);
          return [];
        }

        if (rd.kind === PM_READ_ABSENT) {
          if (ENGINE_PM.loadSeedState().quickReplies) return [];
          const seeded = ENGINE_PM.defaultQuickSeed();
          if (!UTIL_storage.setJSON(KEY_PM_STATE_QUICK_V1, seeded)) {
            ENGINE_PM_noteWriteFailure('ENGINE_PM.loadQuick.seedWrite');
            return [];
          }
          DIAG.counters.seeds += 1;
          ENGINE_PM.markSeeded('quickReplies');
          return seeded;
        }

        const arr = rd.value;
        arr.forEach((q, idx) => { if (q && typeof q.order !== 'number') q.order = idx; });
        return arr.sort((a, b) => (a?.order || 0) - (b?.order || 0));
      }, []);
    },
    // Commit: persist → adopt → emit (see the ordering note on savePrompts).
    saveQuickResult(list) {
      return SAFE_try('ENGINE_PM.saveQuick', () => {
        const next = Array.isArray(list) ? list : [];
        const res = ENGINE_PM.persistQuickResult(next);
        if (!res.ok) return res;                   // nothing adopted, nothing emitted
        STATE_PM.data.quick = next;                // adopt BEFORE publishing
        UTIL_emitPmChanged({ what: 'quick' });
        return res;
      }, UTIL_writeFail(PM_WRITE_UNKNOWN, null));
    },
    saveQuick(list) {
      return ENGINE_PM.saveQuickResult(list).ok;
    },

    getUiMode() { return UTIL_storage.getStr(KEY_PM_UI_MODE_V1, 'simple') || 'simple'; },
    setUiMode(m) { UTIL_storage.setStr(KEY_PM_UI_MODE_V1, (m === 'edit') ? 'edit' : 'simple'); },
  };

  /* ───────────────────────────── 📦 PORTABILITY — export / import 📝🔓💥 ─────────────────────────────
   * [2C] Moves a user's OWN Prompt and Quick Reply libraries between browsers.
   *
   * The portable surface is exactly those two collections. History, Drafts and
   * Pasted are automatic captures of whatever happened to be in the composer;
   * they are not authored content, they can hold anything the user ever typed,
   * and shipping them inside a file the user hands to someone else would turn a
   * convenience feature into a disclosure. The quarantine copies, the seed
   * marker, the migration markers, Auto-send, the UI mode and every search or
   * filter value are equally excluded: none of them are content, and several of
   * them describe THIS browser rather than the library.
   *
   * Everything in this block is pure. It reads arrays and returns new arrays,
   * never mutates an input record or array, never touches storage and never
   * reads the DOM. The storage orchestration lives in PORT_PM below, so the
   * shape validators exercise is byte-for-byte the shape the UI writes.
   */

  const PORT_PM_KIND = 'h2o-prompt-manager-portability';
  const PORT_PM_VERSION = 1;
  const PORT_PM_BACKUP_KIND = 'h2o-prompt-manager-import-backup';
  const PORT_PM_BACKUP_VERSION = 1;

  /* Resource bounds. 5 MiB is roughly two orders of magnitude above a large
   * hand-authored library and still small enough that parsing it cannot lock
   * the panel; the record cap stops a syntactically tiny file from expanding
   * into a list no renderer can draw. Both are checked BEFORE JSON.parse. */
  const PORT_PM_MAX_BYTES = 5 * 1024 * 1024;
  const PORT_PM_MAX_RECORDS = 5000;

  /* Object-URL revocation delay. The download is handed to the browser during
   * click dispatch, but revoking in the same tick is documented as racy, so the
   * revoke is deferred through the module's OWNED timer. A cleanup function is
   * registered as well and both paths are idempotent, so disposal during that
   * window still revokes exactly once. */
  const PORT_PM_REVOKE_MS = 1000;

  const PM_MSG_PORT_INVALID = 'Invalid Prompt Manager file';
  const PM_MSG_PORT_VERSION = 'Unsupported import version';
  const PM_MSG_PORT_DUP_PROMPT = 'Duplicate Prompt ID in import';
  const PM_MSG_PORT_DUP_QUICK = 'Duplicate Quick Reply ID in import';
  const PM_MSG_PORT_TOO_LARGE = 'Import file too large';
  const PM_MSG_PORT_WRITE = 'Storage write failed';
  const PM_MSG_PORT_BACKUP = 'Import backup failed';
  const PM_MSG_PORT_ROLLBACK = 'Import rollback failed';
  const PM_MSG_PORT_EXPORT = 'Export failed';
  /* [2C-closure] Export is all-or-nothing, so a library that cannot be
   * represented losslessly gets its own refusal messages. None of them names a
   * title, a body, a reply or any other record content. */
  const PM_MSG_PORT_EXPORT_PROMPTS = 'Cannot export invalid Prompt library';
  const PM_MSG_PORT_EXPORT_QUICK = 'Cannot export invalid Quick Reply library';
  const PM_MSG_PORT_EXPORT_DUP_PROMPT = 'Duplicate Prompt ID prevents export';
  const PM_MSG_PORT_EXPORT_DUP_QUICK = 'Duplicate Quick Reply ID prevents export';
  /* [2C-closure] A rollback that could not restore the exact pre-import bytes
   * leaves storage in a state only the bytes themselves describe. */
  const PM_MSG_PORT_RECOVERY = 'Prompt Manager data is out of sync — reload the page before importing again';
  /* [2C-closure-3] The live primary store is not in a state portability may act
   * on. Names the collection, never any record content. */
  const PM_MSG_PORT_STORE_PROMPTS = 'Stored Prompt data is unreadable — portability is unavailable';
  const PM_MSG_PORT_STORE_QUICK = 'Stored Quick Reply data is unreadable — portability is unavailable';
  /* [2C-closure-4] A healthy primary can still be a DIFFERENT authority from
   * the collection currently rendered in memory (for example, after another
   * tab writes it). Portability never chooses between those authorities. */
  const PM_MSG_PORT_CHANGED_PROMPTS = 'Prompt library changed — reload before portability';
  const PM_MSG_PORT_CHANGED_QUICK = 'Quick Reply library changed — reload before portability';
  /* [2C-closure-3] A file the module could write but could never import back. */
  const PM_MSG_PORT_EXPORT_TOO_LARGE = 'Library too large to export';

  /* The complete key set for each shape. Anything else is rejected on import
   * rather than ignored: silently dropping an unknown key would accept a file
   * carrying History rows or a capture store beside the two portable
   * collections and report it as a clean import. A future schema addition
   * travels with a version bump, which is exactly what the version gate is for. */
  const PORT_PM_ENVELOPE_KEYS = Object.freeze(['kind', 'version', 'exportedAt', 'prompts', 'quickReplies']);
  const PORT_PM_PROMPT_KEYS = Object.freeze(['id', 'title', 'body', 'type', 'favorite', 'createdAt', 'updatedAt', 'lastUsedAt', 'useCount']);
  const PORT_PM_QUICK_KEYS = Object.freeze(['id', 'text', 'order', 'createdAt', 'updatedAt']);

  const PORT_PM_isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  const PORT_PM_onlyKnownKeys = (obj, allowed) => {
    for (const k of Object.keys(obj)) { if (!allowed.includes(k)) return false; }
    return true;
  };

  const PORT_PM_hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  /* [2C-closure-2] Canonical portability identity.
   *
   * The first implementation TRIMMED, which quietly broke the very rule this
   * surface is built on: a stored id of " spaced " exported as "spaced", and
   * the strict importer accepted " spaced " and adopted "spaced". That is a
   * repair, not a validation, and it is not lossless — two records whose ids
   * differ only by padding collapse into one identity.
   *
   * An id is canonical for portability ONLY when it is a non-empty string that
   * already equals its own trimmed form. Anything else is refused; nothing is
   * trimmed, rewritten or regenerated, and a valid id is returned EXACTLY as
   * stored. Internal spaces are ordinary characters: "my prompt" is canonical.
   *
   * This strictness is scoped to Phase-2C portability. The Phase-1 tolerant
   * storage readers keep their own contract untouched — they must still be able
   * to load a library that portability would refuse to move. */
  const PORT_PM_isCanonicalId = (v) => (
    typeof v === 'string' && v.length > 0 && v === v.trim()
  );

  const PORT_PM_recordId = (rec) => (
    (PORT_PM_isPlainObject(rec) && PORT_PM_isCanonicalId(rec.id)) ? rec.id : ''
  );

  const PORT_PM_finiteNumber = (v) => (typeof v === 'number' && Number.isFinite(v));

  /* ── Export projection ──────────────────────────────────────────────────────
   * [2C-closure] Export is ALL-OR-NOTHING.
   *
   * The first implementation skipped records with an unusable id and later
   * repeats of an id already emitted, then reported "Exported" either way.
   * Independent review proved that a five-record library could produce a
   * one-record file with a success message — the portability feature quietly
   * failing to be portable. Skipping is gone. A library that cannot be
   * represented losslessly is refused, loudly, before any file exists.
   *
   * The projection therefore carries values through UNCHANGED and lets the
   * module's own strict import validator decide whether the result is
   * representable. Coercing here would only move the loss: a record stored with
   * `favorite: 1` or `createdAt: "yesterday"` would silently become a different
   * record in the file. Ids are not trimmed either: PORT_PM_recordId requires a
   * canonical id and returns it exactly as stored, so identity is preserved
   * rather than repaired (see the canonical-id authority above).
   *
   * Optional 2B usage fields are carried ONLY when the record actually has
   * them. Absence is meaningful: the reader normalizes an absent
   * lastUsedAt/useCount to 0, so materializing them would hand back a file that
   * rewrites every legacy record on import for no behavioural gain. */
  const PORT_PM_exportPrompt = (rec, id) => {
    const out = {
      id,
      title: rec.title,
      body: rec.body,
      type: rec.type,
      favorite: rec.favorite,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    };
    if (rec.lastUsedAt !== undefined) out.lastUsedAt = rec.lastUsedAt;
    if (rec.useCount !== undefined) out.useCount = rec.useCount;
    return out;
  };

  const PORT_PM_exportQuick = (rec, id) => ({
    id,
    text: rec.text,
    order: rec.order,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  });

  /* Project a live collection, or refuse.
   *
   * Returns { ok:true, list } only when EVERY source record produced exactly
   * one export record that the strict importer accepts. The ORIGINAL source
   * record is validated first. This is essential: validating only a selected
   * projection would let an unknown own key disappear before the strict gate
   * could see it, making both an export and a pre-import backup incomplete.
   *
   * The validated canonical record is the output authority. The historical
   * projector is still exercised and must round-trip to that exact canonical
   * value, which proves it carries every currently declared field; it is never
   * allowed to sanitize the source. The first record that
   * cannot be represented — and the first id collision — returns { ok:false }
   * with the caller's collection-specific message. Nothing is skipped, nothing
   * is renamed, nothing is deduplicated, and no id is ever generated.
   *
   * `list.length === out.length` on success is guaranteed by construction: the
   * loop either pushes one record per source record or returns a failure. The
   * cardinality is asserted again at the envelope level so the guarantee is
   * checked rather than assumed. */
  const PORT_PM_projectList = (list, project, validate, invalidError, duplicateError) => {
    if (!Array.isArray(list)) return { ok: false, error: invalidError, list: [] };
    const out = [];
    const seen = new Set();
    for (const rec of list) {
      const canonical = validate(rec);
      if (!canonical) return { ok: false, error: invalidError, list: [] };
      const id = canonical.id;
      if (seen.has(id)) return { ok: false, error: duplicateError, list: [] };
      const projected = validate(project(canonical, id));
      if (!projected || JSON.stringify(projected) !== JSON.stringify(canonical)) {
        return { ok: false, error: invalidError, list: [] };
      }
      seen.add(id);
      out.push(canonical);
    }
    return { ok: true, error: '', list: out };
  };

  /* Build the portability envelope, or refuse.
   *
   * Returns { ok:true, envelope } or { ok:false, error }. Callers must not
   * assume an envelope exists: a refused export creates no Blob, no object URL
   * and no download, and reports the error persistently. */
  const PORT_PM_buildExportEnvelope = (prompts, quick, now) => {
    const fail = (error) => ({ ok: false, error, envelope: null });

    /* [2C-closure-2] A non-array collection is NOT an empty library.
     *
     * The previous line here was `Array.isArray(prompts) ? prompts : []`, which
     * turned a corrupt or wrongly-typed collection into a successful export of
     * zero records — the same class of silent loss this phase already removed
     * from the record projection, one level up. The inputs are handed to the
     * projection untouched and it refuses anything that is not an array; the
     * legitimately empty library `[]` still exports successfully. */
    const p = PORT_PM_projectList(prompts, PORT_PM_exportPrompt, PORT_PM_validateImportPrompt,
      PM_MSG_PORT_EXPORT_PROMPTS, PM_MSG_PORT_EXPORT_DUP_PROMPT);
    if (!p.ok) return fail(p.error);

    const q = PORT_PM_projectList(quick, PORT_PM_exportQuick, PORT_PM_validateImportQuick,
      PM_MSG_PORT_EXPORT_QUICK, PM_MSG_PORT_EXPORT_DUP_QUICK);
    if (!q.ok) return fail(q.error);

    /* Cardinality is the whole point of this closure: one exported record per
     * source record, in both collections, or no file at all. Both sides are
     * proven arrays by this point, so the comparison is meaningful. */
    if (p.list.length !== prompts.length) return fail(PM_MSG_PORT_EXPORT_PROMPTS);
    if (q.list.length !== quick.length) return fail(PM_MSG_PORT_EXPORT_QUICK);

    const envelope = {
      kind: PORT_PM_KIND,
      version: PORT_PM_VERSION,
      exportedAt: ENGINE_PM_normDraftTs(now),
      prompts: p.list,
      quickReplies: q.list,
    };

    /* Final self-check through the REAL importer. Anything this module exports
     * must be something this module can import, and the cheapest way to keep
     * that true is to run the shipped gate rather than to reason about it. */
    const selfCheck = PORT_PM_validateImportEnvelope(envelope);
    if (!selfCheck.ok) return fail(selfCheck.error || PM_MSG_PORT_EXPORT);

    return { ok: true, error: '', envelope };
  };

  const PORT_PM_serializeExport = (envelope) => JSON.stringify(envelope);

  /* Deterministic filename from the envelope's own timestamp. */
  const PORT_PM_exportFilename = (now) => {
    const t = ENGINE_PM_normDraftTs(now);
    const d = new Date(t);
    let stamp = '0000-00-00';
    if (Number.isFinite(d.getTime())) {
      const p2 = (n) => String(n).padStart(2, '0');
      stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    }
    return `h2o-prompt-manager-${stamp}.json`;
  };

  /* ── Strict import validation ───────────────────────────────────────────────
   * Deliberately stricter than the tolerant runtime readers. Those repair a
   * store the user cannot otherwise reach; this one inspects a file that
   * arrived from outside and has no claim to be repaired into validity. A
   * required field must be present with the right type, an optional field must
   * be absent or valid, and an unknown field rejects the record.
   *
   * Returns a FRESH normalized record, so an accepted import never adopts the
   * parsed object the caller handed in. */
  const PORT_PM_validateImportPrompt = (rec) => {
    if (!PORT_PM_isPlainObject(rec)) return null;
    if (!PORT_PM_onlyKnownKeys(rec, PORT_PM_PROMPT_KEYS)) return null;
    const id = PORT_PM_recordId(rec);
    if (!id) return null;
    if (typeof rec.title !== 'string') return null;
    if (typeof rec.body !== 'string') return null;
    if (rec.type !== 'prompt' && rec.type !== 'append') return null;
    if (typeof rec.favorite !== 'boolean') return null;
    if (!PORT_PM_finiteNumber(rec.createdAt)) return null;
    if (!PORT_PM_finiteNumber(rec.updatedAt)) return null;

    const out = {
      id,
      title: rec.title,
      body: rec.body,
      type: rec.type,
      favorite: rec.favorite,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    };
    /* Optional 2B usage metadata. Present means it must already satisfy the 2B
     * normalizers exactly — a value that would be repaired is a malformed
     * value, and import does not repair. Absent stays absent. */
    if (PORT_PM_hasOwn(rec, 'lastUsedAt')) {
      if (!PORT_PM_finiteNumber(rec.lastUsedAt)) return null;
      if (ENGINE_PM_normUsageTs(rec.lastUsedAt) !== rec.lastUsedAt) return null;
      out.lastUsedAt = rec.lastUsedAt;
    }
    if (PORT_PM_hasOwn(rec, 'useCount')) {
      if (!PORT_PM_finiteNumber(rec.useCount)) return null;
      if (ENGINE_PM_normUseCount(rec.useCount) !== rec.useCount) return null;
      out.useCount = rec.useCount;
    }
    return out;
  };

  const PORT_PM_validateImportQuick = (rec) => {
    if (!PORT_PM_isPlainObject(rec)) return null;
    if (!PORT_PM_onlyKnownKeys(rec, PORT_PM_QUICK_KEYS)) return null;
    const id = PORT_PM_recordId(rec);
    if (!id) return null;
    if (typeof rec.text !== 'string') return null;
    if (!PORT_PM_finiteNumber(rec.order)) return null;
    if (!PORT_PM_finiteNumber(rec.createdAt)) return null;
    if (!PORT_PM_finiteNumber(rec.updatedAt)) return null;
    return {
      id,
      text: rec.text,
      order: rec.order,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
    };
  };

  /* Whole-file validation. All-or-nothing by construction: the first failure
   * returns an error and no candidate is ever produced, so a caller cannot
   * write a partially accepted file. */
  const PORT_PM_validateImportEnvelope = (parsed) => {
    const fail = (error) => ({ ok: false, error, envelope: null });

    if (!PORT_PM_isPlainObject(parsed)) return fail(PM_MSG_PORT_INVALID);
    if (!PORT_PM_onlyKnownKeys(parsed, PORT_PM_ENVELOPE_KEYS)) return fail(PM_MSG_PORT_INVALID);
    if (parsed.kind !== PORT_PM_KIND) return fail(PM_MSG_PORT_INVALID);
    if (parsed.version !== PORT_PM_VERSION) return fail(PM_MSG_PORT_VERSION);
    if (!PORT_PM_finiteNumber(parsed.exportedAt)) return fail(PM_MSG_PORT_INVALID);
    if (!Array.isArray(parsed.prompts)) return fail(PM_MSG_PORT_INVALID);
    if (!Array.isArray(parsed.quickReplies)) return fail(PM_MSG_PORT_INVALID);
    if (parsed.prompts.length > PORT_PM_MAX_RECORDS) return fail(PM_MSG_PORT_TOO_LARGE);
    if (parsed.quickReplies.length > PORT_PM_MAX_RECORDS) return fail(PM_MSG_PORT_TOO_LARGE);

    const prompts = [];
    const seenPrompt = new Set();
    for (const raw of parsed.prompts) {
      const rec = PORT_PM_validateImportPrompt(raw);
      if (!rec) return fail(PM_MSG_PORT_INVALID);
      if (seenPrompt.has(rec.id)) return fail(PM_MSG_PORT_DUP_PROMPT);
      seenPrompt.add(rec.id);
      prompts.push(rec);
    }

    const quickReplies = [];
    const seenQuick = new Set();
    for (const raw of parsed.quickReplies) {
      const rec = PORT_PM_validateImportQuick(raw);
      if (!rec) return fail(PM_MSG_PORT_INVALID);
      if (seenQuick.has(rec.id)) return fail(PM_MSG_PORT_DUP_QUICK);
      seenQuick.add(rec.id);
      quickReplies.push(rec);
    }

    return {
      ok: true,
      error: '',
      envelope: {
        kind: parsed.kind,
        version: parsed.version,
        exportedAt: parsed.exportedAt,
        prompts,
        quickReplies,
      },
    };
  };

  /* Byte bound on the raw text. The authoritative pre-parse gate is the file's
   * own reported size; this is the second, parser-side guard so the bound holds
   * on every path into validation. A JS string never has FEWER UTF-8 bytes than
   * it has code units, so a length over the cap is proof of an oversized
   * payload without walking the string. */
  const PORT_PM_overSizeLimit = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n)) return true; // unknown size fails closed
    return n > PORT_PM_MAX_BYTES;
  };

  const PORT_PM_parseImportText = (text) => {
    const s = String(text == null ? '' : text);
    /* [2C-closure-3] Real UTF-8 bytes, not String.length. The previous code-unit
     * check let a payload of multi-byte characters pass a bound it actually
     * exceeded, and it could not agree with the export-side gate. An
     * undeterminable size fails closed. */
    const bytes = PORT_PM_utf8Bytes(s);
    if (bytes === null || bytes > PORT_PM_MAX_BYTES) {
      return { ok: false, error: PM_MSG_PORT_TOO_LARGE, envelope: null };
    }
    if (!s.trim()) return { ok: false, error: PM_MSG_PORT_INVALID, envelope: null };
    let parsed;
    try { parsed = JSON.parse(s); }
    catch { return { ok: false, error: PM_MSG_PORT_INVALID, envelope: null }; }
    return PORT_PM_validateImportEnvelope(parsed);
  };

  /* ── Merge ──────────────────────────────────────────────────────────────────
   * The record id is the identity authority, so an imported record whose id is
   * already present UPDATES that record IN PLACE, at the position the local
   * array already gives it. Manual order is a Phase-1 contract and a user's
   * arrangement of their own library survives a re-import unchanged; imported
   * records that are genuinely new append in the order the file lists them.
   *
   * Neither input array nor any input record is mutated: the result is a new
   * array holding the untouched local records plus the fresh, already-validated
   * imported records. */
  const PORT_PM_mergeById = (localList, importedList) => {
    const out = Array.isArray(localList) ? localList.slice() : [];
    const imported = Array.isArray(importedList) ? importedList : [];

    const indexById = new Map();
    for (let i = 0; i < out.length; i += 1) {
      const id = PORT_PM_recordId(out[i]);
      if (id && !indexById.has(id)) indexById.set(id, i);
    }

    let added = 0;
    let updated = 0;
    for (const rec of imported) {
      const id = PORT_PM_recordId(rec);
      if (!id) continue; // unreachable for validated input; never guessed at
      const at = indexById.get(id);
      if (at === undefined) {
        indexById.set(id, out.length);
        out.push(rec);
        added += 1;
      } else {
        out[at] = rec;
        updated += 1;
      }
    }
    return { list: out, added, updated };
  };

  /* Prompts and Quick Replies both carry stable ids (Quick has done so since
   * its seed shape), so one identity rule serves both. The two names exist so
   * the contract is explicit at each call site rather than implied. */
  const PORT_PM_mergePromptRecords = (localList, importedList) => PORT_PM_mergeById(localList, importedList);
  const PORT_PM_mergeQuickRecords = (localList, importedList) => PORT_PM_mergeById(localList, importedList);

  /* [2C-closure-3] Quick Replies carry `order`, and it is a REAL runtime
   * authority: ENGINE_PM.loadQuick() sorts by it and every Quick renderer draws
   * that sorted list. Importing a record wholesale therefore imports its
   * foreign `order` too, which silently undid the sequence the merge had just
   * computed — local [A:0, B:1, C:2] with an imported B:99 produced the correct
   * candidate array [A, B, C] and then rendered [A, C, B] after the very first
   * reload.
   *
   * The final candidate SEQUENCE is the portability ordering contract, and
   * `order` is merely how that sequence is persisted. Re-derive it from the
   * chosen sequence so the two can never disagree.
   *
   * Returns NEW records: no local or imported input object is mutated, and
   * nothing but `order` differs from the record the merge policy selected.
   * Scoped to Phase-2C candidate construction — loadQuick and the renderers are
   * untouched. */
  const PORT_PM_sequenceQuick = (list) => {
    const src = Array.isArray(list) ? list : [];
    const out = [];
    for (let i = 0; i < src.length; i += 1) {
      const rec = src[i];
      out.push(PORT_PM_isPlainObject(rec) ? { ...rec, order: i } : rec);
    }
    return out;
  };

  /* Candidate builder. Produces the complete replacement arrays for BOTH live
   * stores plus the summary the preview renders. Pure: nothing here adopts
   * state, writes storage or touches a capture store. */
  const PORT_PM_buildImportCandidates = (mode, local, envelope) => {
    const env = PORT_PM_isPlainObject(envelope) ? envelope : { prompts: [], quickReplies: [] };
    const impPrompts = Array.isArray(env.prompts) ? env.prompts : [];
    const impQuick = Array.isArray(env.quickReplies) ? env.quickReplies : [];
    const localPrompts = Array.isArray(local && local.prompts) ? local.prompts : [];
    const localQuick = Array.isArray(local && local.quick) ? local.quick : [];

    if (mode === 'replace') {
      return {
        mode: 'replace',
        prompts: impPrompts.slice(),
        quick: PORT_PM_sequenceQuick(impQuick),
        summary: {
          prompts: impPrompts.length,
          quickReplies: impQuick.length,
          promptsAdded: 0, promptsUpdated: 0,
          quickAdded: 0, quickUpdated: 0,
        },
      };
    }

    const mp = PORT_PM_mergePromptRecords(localPrompts, impPrompts);
    const mq = PORT_PM_mergeQuickRecords(localQuick, impQuick);
    return {
      mode: 'merge',
      prompts: mp.list,
      quick: PORT_PM_sequenceQuick(mq.list),
      summary: {
        prompts: impPrompts.length,
        quickReplies: impQuick.length,
        promptsAdded: mp.added, promptsUpdated: mp.updated,
        quickAdded: mq.added, quickUpdated: mq.updated,
      },
    };
  };

  /* Pre-import backup envelope — the same two collections, its own kind and
   * version so it can never be mistaken for a portability file.
   *
   * [2C-closure] It uses the SAME all-or-nothing projection as export and
   * returns the same { ok, envelope | error } shape. A backup that quietly
   * omitted records would be exactly the defect this closure removes from
   * export, hiding in the one artefact whose whole job is to be complete. If a
   * faithful backup cannot be built, the caller must abort BEFORE writing
   * anything: the module promised a pre-import snapshot, and overwriting a
   * library it cannot snapshot is not a trade it is allowed to make. */
  const PORT_PM_buildBackupEnvelope = (prompts, quick, now) => {
    const p = PORT_PM_projectList(prompts, PORT_PM_exportPrompt, PORT_PM_validateImportPrompt,
      PM_MSG_PORT_EXPORT_PROMPTS, PM_MSG_PORT_EXPORT_DUP_PROMPT);
    if (!p.ok) return { ok: false, error: p.error, envelope: null };

    const q = PORT_PM_projectList(quick, PORT_PM_exportQuick, PORT_PM_validateImportQuick,
      PM_MSG_PORT_EXPORT_QUICK, PM_MSG_PORT_EXPORT_DUP_QUICK);
    if (!q.ok) return { ok: false, error: q.error, envelope: null };

    return {
      ok: true,
      error: '',
      envelope: {
        kind: PORT_PM_BACKUP_KIND,
        version: PORT_PM_BACKUP_VERSION,
        savedAt: ENGINE_PM_normDraftTs(now),
        prompts: p.list,
        quickReplies: q.list,
      },
    };
  };

  /* [2C-closure] Exact raw equality between a captured snapshot and a freshly
   * read state. Raw bytes and absence only — never a normalized parse, because
   * two different byte strings can parse to equal-looking arrays and a rollback
   * that "looks right" is not a rollback. */
  const PORT_PM_rawEquals = (snap, cur) => {
    if (!snap || !snap.ok || !cur || !cur.ok) return false;
    if (!snap.present && !cur.present) return true;
    if (snap.present && cur.present) return cur.raw === snap.raw;
    return false;
  };

  /* [2C-closure] Read-only decode of whatever actually survived in a live key.
   *
   * Used ONLY on the degraded path, where the module must resynchronize itself
   * to the bytes that really remain. Deliberately NOT ENGINE_PM.loadPrompts /
   * loadQuick: those are recovery readers that may seed, migrate, normalize and
   * write back, or quarantine — every one of which would mutate storage while
   * the module is trying to find out what storage contains.
   *
   * Absence resolves to an empty list because that is already this module's
   * in-memory contract for an absent key (ENGINE_PM_readArray returns [] for
   * PM_READ_ABSENT); the key itself is NOT created. Anything undecodable fails
   * closed: no list is invented. */
  /* [2C-closure-3/4] Read-only authority check on the two LIVE primary stores.
   *
   * Phase 1 deliberately preserves malformed primary bytes and hands the UI an
   * empty list, so `STATE_PM.data` alone cannot tell a genuinely empty library
   * apart from a corrupt store the tolerant reader represented as []. Trusting
   * it produced two real failures: a corrupt Prompt primary exported as a
   * successful empty file, and an import overwrote that same corrupt primary
   * while recording an empty "backup".
   *
   * Uses ENGINE_PM_readArray, the classified reader, and NOTHING else: no
   * quarantine, no seeding, no migration, no normalization, no write, no
   * delete. Portability must never rely on a quarantine copy as its backup.
   *
   * Unsafe when either primary is unreadable, malformed, present-but-not-an-
   * array, or not strictly representable by the Phase-2C schema. Health alone
   * is not authority: a valid primary is canonicalized and compared with the
   * strict canonical collection represented by memory. An absent key is the
   * canonical empty collection and is safe only when memory is the same.
   *
   * Prompt sequence is compared exactly because its manual array order is the
   * authority. Quick records are sorted on COPIES by the same `order` rule used
   * by ENGINE_PM.loadQuick before comparison; physical JSON array order is not
   * a second Quick authority. No source array or record is mutated.
   *
   * Deliberately NOT gated on STATE_PM.dataError: that flag can be set by a
   * History, Drafts or Pasted problem which says nothing about these two. */
  const PORT_PM_checkLiveStoreAuthority = (memPrompts, memQuick) => {
    const inspect = (key, mem, project, validate, invalidError, duplicateError,
      storeError, changedError, logicalSequence) => {
      const rd = ENGINE_PM_readArray(key);
      if (rd.kind === PM_READ_CORRUPT) return { ok: false, error: storeError };
      const persisted = (rd.kind === PM_READ_ABSENT) ? [] : rd.value;
      const live = PORT_PM_projectList(persisted, project, validate, invalidError, duplicateError);
      const memory = PORT_PM_projectList(mem, project, validate, invalidError, duplicateError);
      if (!live.ok || !memory.ok) return { ok: false, error: storeError };
      const liveLogical = logicalSequence(live.list);
      const memoryLogical = logicalSequence(memory.list);
      if (JSON.stringify(liveLogical) !== JSON.stringify(memoryLogical)) {
        return { ok: false, error: changedError };
      }
      return { ok: true, error: '' };
    };

    const promptSequence = (list) => list.slice();
    const quickSequence = (list) => list.slice()
      .sort((a, b) => (a?.order || 0) - (b?.order || 0));

    const p = inspect(KEY_PM_STATE_PROMPTS_V1, memPrompts,
      PORT_PM_exportPrompt, PORT_PM_validateImportPrompt,
      PM_MSG_PORT_EXPORT_PROMPTS, PM_MSG_PORT_EXPORT_DUP_PROMPT,
      PM_MSG_PORT_STORE_PROMPTS, PM_MSG_PORT_CHANGED_PROMPTS, promptSequence);
    if (!p.ok) return p;
    const q = inspect(KEY_PM_STATE_QUICK_V1, memQuick,
      PORT_PM_exportQuick, PORT_PM_validateImportQuick,
      PM_MSG_PORT_EXPORT_QUICK, PM_MSG_PORT_EXPORT_DUP_QUICK,
      PM_MSG_PORT_STORE_QUICK, PM_MSG_PORT_CHANGED_QUICK, quickSequence);
    if (!q.ok) return q;
    return { ok: true, error: '' };
  };

  /* [2C-closure-3] Byte-exact UTF-8 length.
   *
   * `String.length` counts UTF-16 code units, so a library of emoji or CJK text
   * can be well under the cap by length and far over it in bytes — and the
   * module could therefore write a file its own importer rejects as too large.
   * Returns null when the size cannot be determined, and every caller treats
   * null as over-limit. */
  const PORT_PM_utf8Bytes = (text) => {
    try {
      if (typeof TextEncoder !== 'function') return null;
      return new TextEncoder().encode(String(text == null ? '' : text)).length;
    } catch { return null; }
  };

  const PORT_PM_decodeRawList = (snap) => {
    if (!snap || !snap.ok) return { ok: false, list: [] };
    if (!snap.present) return { ok: true, list: [] };
    let parsed;
    try { parsed = JSON.parse(snap.raw); }
    catch { return { ok: false, list: [] }; }
    if (!Array.isArray(parsed)) return { ok: false, list: [] };
    return { ok: true, list: parsed };
  };

  /* Restore one live key to the EXACT bytes it held before the import.
   *
   * Raw bytes, not a re-serialized parse: the tolerant loaders normalize legacy
   * records in memory, so writing `JSON.stringify(parsedOldValue)` back would
   * quietly rewrite records the failed import never touched. Absence is
   * restored as absence — removing the key, never writing "[]" — because an
   * absent Prompts key with the seed marker unset means something different
   * from an empty array. */
  const PORT_PM_restoreRaw = (key, snap) => {
    if (!snap || !snap.ok) return false;

    /* A key whose write FAILED still holds its original bytes, so restoring it
     * would be a pointless rewrite — and one that must fail for exactly the
     * reason the import did, turning a clean abort into a false "rollback
     * failed". Compare first and treat an already-correct key as restored. */
    const cur = UTIL_storage.readRaw(key);
    if (cur.ok) {
      if (!snap.present && !cur.present) return true;
      if (snap.present && cur.present && cur.raw === snap.raw) return true;
    }

    if (!snap.present) return UTIL_storage.del(key);
    return UTIL_storage.setStr(key, snap.raw);
  };

  /* ───────────────────────────── 🧪 TEST HOOK (flag-gated, off in production) ─────────────────────────────
   * Exposes the real storage engine and the real ordering helper so validators
   * exercise production code instead of a copy. The flag must be set on the
   * window BEFORE this module is evaluated; in a normal page nothing is defined
   * here, nothing is observed, and no behaviour changes. The six-method public
   * API is untouched either way. */
  /* ───────────────────────────── 💬 FEEDBACK — one status surface 📝🔓💥 ─────────────────────────────
   * A single `role="status" aria-live="polite"` line in the panel. Success and
   * info clear themselves after a short delay through the module's OWNED timer
   * helper, so disposal cancels them like every other timer here. Errors do NOT
   * auto-clear: a storage write failure must stay on screen until the user does
   * something else, otherwise Phase 1's truthful failure reporting would be
   * quietly undone by a 2.5-second timeout. */
  const PM_STATUS_CLEAR_MS = 2500;
  /* [2B] Typing rerender debounce. Long enough to coalesce a burst of
   * keystrokes, short enough that the list still feels immediate. */
  const PM_SEARCH_RENDER_MS = 80;

  /* [STORE] The single reporting path for a refused Prompt/Quick write.
   *
   * Every user-facing persistence caller routes its classified result here
   * instead of repeating a literal, so the four kinds can never drift apart
   * between call sites and no path can quietly say nothing. `res` is the result
   * of THAT attempt — no module-level error state is consulted. */
  const FEEDBACK_PM_writeFailure = (res, root) => FEEDBACK_PM.say(
    PM_MSG_writeFailure(res && res.kind), 'error', root,
  );

  const FEEDBACK_PM = {
    el(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return root ? DOM_q(UI_PM.selOwned(UI_PM_STATUS), root) : null;
    },

    clearTimer() {
      if (STATE_PM.ui.statusTimer) {
        CLEAN_clearTimeout(STATE_PM.ui.statusTimer);
        STATE_PM.ui.statusTimer = 0;
      }
    },

    say(message, kind = 'info', root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return SAFE_try('FEEDBACK_PM.say', () => {
        // A new message always supersedes any pending auto-clear.
        FEEDBACK_PM.clearTimer();
        const text = String(message == null ? '' : message);
        /* [2A-fix F] State first, DOM second. A write failure raised while the
         * root is missing or mid-remount must still be recorded, otherwise the
         * one case that most needs a persistent error is the case that loses
         * it. Return value keeps its old meaning: "was the DOM updated". */
        STATE_PM.ui.feedback = { message: text, kind: (kind === 'error') ? 'error' : String(kind || 'info') };
        if (kind !== 'error') {
          STATE_PM.ui.statusTimer = CLEAN_setTimeout(() => {
            STATE_PM.ui.statusTimer = 0;
            FEEDBACK_PM.hide(root);
          }, PM_STATUS_CLEAR_MS);
        }
        const el = FEEDBACK_PM.el(root);
        if (!el) return false;
        el.textContent = text;
        el.classList.add(`cgxui-${SkID}--status-show`);
        el.classList.toggle(`cgxui-${SkID}--status-err`, kind === 'error');
        return true;
      }, false);
    },

    hide(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return SAFE_try('FEEDBACK_PM.hide', () => {
        /* [2A-fix D] A manual hide must also cancel any pending auto-clear, or
         * an owned timer survives pointing at a surface that is already empty. */
        FEEDBACK_PM.clearTimer();
        /* [2A-fix F] hide() is a dismissal, so it clears the authority as well
         * as the DOM — including a persistent error. Anything else and a
         * dismissed failure would reappear at the next remount. */
        STATE_PM.ui.feedback = { message: '', kind: '' };
        const el = FEEDBACK_PM.el(root);
        if (!el) return false;
        el.textContent = '';
        el.classList.remove(`cgxui-${SkID}--status-show`);
        el.classList.remove(`cgxui-${SkID}--status-err`);
        return true;
      }, false);
    },

    /* [2A-fix F] Drop feedback that was only ever meant to be temporary.
     * Called on disposal/root recovery: an info/success line whose auto-clear
     * timer was just drained must not be resurrected onto the new root, while a
     * persistent error must survive untouched. Creates no timer. */
    clearTransient() {
      const fb = STATE_PM.ui.feedback;
      if (!fb || fb.kind === 'error') return false;
      if (!fb.message && !fb.kind) return false;
      STATE_PM.ui.feedback = { message: '', kind: '' };
      return true;
    },

    /* [2A-fix F] Re-apply a surviving persistent error to a freshly mounted
     * status node. This is NOT a user action: it must not clear the authority,
     * and it must not start an auto-clear timer — an error stays until the user
     * does something that replaces or dismisses it. */
    restore(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return SAFE_try('FEEDBACK_PM.restore', () => {
        FEEDBACK_PM.clearTransient();
        const fb = STATE_PM.ui.feedback;
        if (!fb || fb.kind !== 'error' || !fb.message) return false;
        const el = FEEDBACK_PM.el(root);
        if (!el) return false;
        el.textContent = String(fb.message);
        el.classList.add(`cgxui-${SkID}--status-show`);
        el.classList.add(`cgxui-${SkID}--status-err`);
        return true;
      }, false);
    },
  };

  /* [2B-perf] Apply move availability to the rendered controls.
   *
   * ONE batch computation for the whole view, then a positional walk over the
   * rendered cards. Cards are matched by render position rather than by
   * `data-id` lookup: with a duplicated id the batch authority already denies
   * everything, and an id query would otherwise keep finding the first card.
   *
   * Post-render and idempotent — it only sets `disabled`, `aria-disabled` and a
   * title, so the shared Phase-2A card builder keeps its bytes. Buttons stay in
   * the DOM: a control that vanishes as you type is more confusing than one that
   * explains why it is unavailable. */
  const RENDER_PM_applyReorderAvailability = (listEl, items, category, query, now) => {
    return SAFE_try('RENDER_PM_applyReorderAvailability', () => {
      if (!listEl) return false;
      const viewIds = (Array.isArray(items) ? items : [])
        .map(p => (p && typeof p === 'object') ? p.id : null);

      const availability = ENGINE_PM_computeMoveAvailability(
        STATE_PM.data.prompts, category, query, now, viewIds);

      const setState = (btn, can) => {
        if (!btn) return;
        btn.disabled = !can;
        btn.setAttribute('aria-disabled', can ? 'false' : 'true');
        if (can) btn.removeAttribute('title');
        else btn.setAttribute('title', PM_MSG_RANKED_NO_REORDER);
      };

      const cards = Array.from(listEl.children || []);
      let anyEnabled = false;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card || !card.querySelector) continue;
        const slot = availability[i] || { up: false, down: false };
        setState(card.querySelector(`.cgxui-${SkID}--move[data-act="up"]`), !!slot.up);
        setState(card.querySelector(`.cgxui-${SkID}--move[data-act="down"]`), !!slot.down);
        anyEnabled = anyEnabled || !!slot.up || !!slot.down;
      }
      return anyEnabled;
    }, false);
  };

  /* [2B] Honest empty copy for the Prompt list.
   *
   * The old text said "No prompts yet. Open Settings to add." even when the
   * library was full and a query had simply matched nothing — telling the user
   * their prompts do not exist while they are looking at a search box. The two
   * cases are now distinguished, and the instruction to go add one is only
   * shown when there genuinely is nothing to find. */
  const RENDER_PM_promptEmptyHtml = (list, query, category) => {
    const arr = Array.isArray(list) ? list : [];
    const anyPrompts = arr.some(p => p && typeof p === 'object');
    const q = String(query == null ? '' : query).trim();
    const centred = (text) => `<div class="cgxui-${SkID}--prev" style="text-align:center">${UTIL_escapeHtml(text)}</div>`;
    if (!anyPrompts) return centred('No prompts yet.');
    if (q) return centred('No matches.');
    if (String(category) === 'favorites') return centred('No favourites yet.');
    return centred('No matches.');
  };

  /* ───────────────────────────── 🗂️ PROMPT CARD — one builder, two modes 📝🔓💥 ─────────────────────────────
   * Simple and Edit previously carried independent copies of this markup, so
   * every card change had to be written twice. This is the single source for
   * PROMPT cards only — History/Drafts/Pasted cards keep their own occurrence-
   * addressed markup untouched, because their `data-*idx`/`data-*snap` contract
   * is a Phase 1 safety guarantee.
   *
   * Every attribute existing handlers rely on is preserved: `data-id` on the
   * card, the star class for the favourite hit-test, `data-act` on row actions
   * and `.--move` for the ordering controls. */
  const RENDER_PM_promptCard = (p, { mode = 'simple' } = {}) => {
    const isAppend = (p.type === 'append');
    const typeLabel = isAppend ? 'Append' : 'Prompt';
    const fav = !!p.favorite;
    const star = `<button type="button" class="cgxui-${SkID}--star ${fav ? `cgxui-${SkID}--star-active` : ''}" data-act="favorite" aria-pressed="${fav ? 'true' : 'false'}" aria-label="${fav ? 'Unfavourite' : 'Favourite'} ${UTIL_escapeHtml(p.title)}" title="Favorite">${fav ? '★' : '☆'}</button>`;
    const badge = `<span class="cgxui-${SkID}--badge ${isAppend ? `cgxui-${SkID}--badge-append` : ''}">${typeLabel}</span>`;
    const body = `<div class="cgxui-${SkID}--prev cgxui-${SkID}--prev-clamp">${UTIL_escapeHtml(p.body)}</div>`;

    if (mode === 'edit') {
      return `
            <div class="cgxui-${SkID}--item" data-id="${UTIL_escapeHtml(p.id)}">
              <div class="cgxui-${SkID}--title">
                <span class="cgxui-${SkID}--title-left">
                  ${star}
                  <span>${UTIL_escapeHtml(p.title)}</span>
                  ${badge}
                </span>
                <span class="cgxui-${SkID}--movebtns">
                  <button type="button" class="cgxui-${SkID}--move" data-act="up">▲</button>
                  <button type="button" class="cgxui-${SkID}--move" data-act="down">▼</button>
                </span>
              </div>
              ${body}
              <div class="cgxui-${SkID}--actions">
                <button type="button" class="cgxui-${SkID}--btn" data-act="insert">Insert</button>
                <button type="button" class="cgxui-${SkID}--btn" data-act="append">Append</button>
                <button type="button" class="cgxui-${SkID}--btn" data-act="edit">Edit</button>
                <button type="button" class="cgxui-${SkID}--btn" data-act="duplicate">Duplicate</button>
                <button type="button" class="cgxui-${SkID}--btn" data-act="delete">Delete</button>
              </div>
            </div>
          `.trim();
    }

    return `
          <div class="cgxui-${SkID}--item" data-id="${UTIL_escapeHtml(p.id)}">
            <div class="cgxui-${SkID}--title">
              <span class="cgxui-${SkID}--title-left">
                ${star}
                <span>${UTIL_escapeHtml(p.title)}</span>
                ${badge}
              </span>
            </div>
            ${body}
          </div>
        `.trim();
  };

  /* Shared tooltip binding for PROMPT cards only. Capture-surface cards are
   * deliberately excluded — their binding stays with their own renderer. */
  const RENDER_PM_bindPromptTooltips = (list, items) => {
    SAFE_try('RENDER_PM.bindPromptTooltips', () => {
      if (!list || !Array.isArray(items)) return;
      for (const p of items) {
        const el = list.querySelector(`.cgxui-${SkID}--item[data-id="${CSS.escape(p.id)}"]`);
        if (!el) continue;
        el.addEventListener('mouseenter', (e) => UI_PM.tooltipShow(e, p.title, p.body));
        el.addEventListener('mousemove', (e) => UI_PM.tooltipMove(e));
        el.addEventListener('mouseleave', () => UI_PM.tooltipHide());
      }
    }, null);
  };

  /* ───────────────────────────── ✍️ EDITOR — one controller, two field shapes 📝🔓💥 ─────────────────────────────
   * Replaces every native prompt()/confirm()/alert() the module used to rely on.
   * It lives inside the existing panel and swaps the Edit-pane list region for a
   * form; there is no modal, no overlay and no second floating layer, so the
   * panel's Phase 1 lifecycle, inert handling and theme authority are untouched.
   *
   * Persistence rule inherited from Phase 1 and never relaxed: every write goes
   * through commitPrompts/commitQuick, and a `false` return keeps the editor
   * open with the user's typed values intact. The UI must never imply a save
   * that did not happen. */
  const PM_DELETE_ARM_MS = 4000;

  const EDITOR_PM = {
    st() { return STATE_PM.ui.editor; },
    isOpen() { return !!STATE_PM.ui.editor.open; },

    els(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      if (!root) return null;
      const g = (t) => DOM_q(UI_PM.selOwned(t), root);
      return {
        box: g(UI_PM_EDITOR), heading: g(UI_PM_ED_HEADING),
        titleRow: g(UI_PM_ED_TITLE_ROW), title: g(UI_PM_ED_TITLE),
        typeRow: g(UI_PM_ED_TYPE_ROW), tPrompt: g(UI_PM_ED_TYPE_PROMPT), tAppend: g(UI_PM_ED_TYPE_APPEND),
        fav: g(UI_PM_ED_FAV), body: g(UI_PM_ED_BODY),
        save: g(UI_PM_ED_SAVE), cancel: g(UI_PM_ED_CANCEL), del: g(UI_PM_ED_DELETE),
        discard: g(UI_PM_ED_DISCARD),
        list: g(UI_PM_LIST_EDIT), filters: g(UI_PM_EDIT_FILTER_ROW), newBtn: g(UI_PM_NEW_BTN),
        /* [2C] The portability row follows the same rule as `newBtn`: it is a
         * management control, so it is hidden while the editor owns the pane. */
        portRow: g(UI_PM_PORT_ROW), portBox: g(UI_PM_IMPORT_BOX),
      };
    },

    /* Live field values. Titles/quick text are stored trimmed; bodies keep their
     * internal formatting so multiline round-trips byte-for-byte. */
    readDraft(root) {
      const e = EDITOR_PM.els(root);
      const st = EDITOR_PM.st();
      if (!e) return st.draft;
      if (st.kind === 'quick') return { text: String(e.body ? e.body.value : '') };
      return {
        title: String(e.title ? e.title.value : ''),
        body: String(e.body ? e.body.value : ''),
        type: st.draft && st.draft.type === 'append' ? 'append' : 'prompt',
        favorite: !!(st.draft && st.draft.favorite),
      };
    },

    refreshDirty(root) {
      const st = EDITOR_PM.st();
      st.draft = EDITOR_PM.readDraft(root);
      st.dirty = EDITOR_PM_isDirty(st.kind, st.initial, st.draft);
      return st.dirty;
    },

    /* Push editor state into the DOM. */
    sync(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return SAFE_try('EDITOR_PM.sync', () => {
        const e = EDITOR_PM.els(root); const st = EDITOR_PM.st();
        if (!e || !e.box) return false;
        const isQuick = st.kind === 'quick';

        e.box.classList.toggle(`cgxui-${SkID}--editor-open`, !!st.open);
        if (e.list) e.list.style.display = st.open ? 'none' : '';
        if (e.filters) e.filters.style.display = st.open ? 'none' : '';
        if (e.newBtn) e.newBtn.style.display = st.open ? 'none' : '';
        /* [2C] Export/Import and any staged import confirmation are hidden with
         * the rest of the management row while the editor is open, so the pane
         * has exactly one active surface. The pending import itself is untouched
         * — closing the editor brings the confirmation back unchanged. */
        if (e.portRow) e.portRow.style.display = st.open ? 'none' : '';
        if (e.portBox && st.open) e.portBox.style.display = 'none';
        if (!st.open) { PORT_PM.sync(root); return true; }

        if (e.heading) {
          e.heading.textContent = isQuick
            ? (st.mode === 'create' ? 'Create quick reply' : 'Edit quick reply')
            : (st.mode === 'create' ? 'Create prompt' : 'Edit prompt');
        }
        // Quick replies carry no title, no type and no favourite.
        if (e.titleRow) e.titleRow.style.display = isQuick ? 'none' : '';
        if (e.typeRow) e.typeRow.style.display = isQuick ? 'none' : '';

        if (isQuick) {
          if (e.body && e.body.value !== String(st.draft.text || '')) e.body.value = String(st.draft.text || '');
          if (e.body) e.body.setAttribute('aria-label', 'Quick reply text');
        } else {
          if (e.title && e.title.value !== String(st.draft.title || '')) e.title.value = String(st.draft.title || '');
          if (e.body && e.body.value !== String(st.draft.body || '')) e.body.value = String(st.draft.body || '');
          if (e.body) e.body.setAttribute('aria-label', 'Prompt body');
          const isAppend = st.draft.type === 'append';
          if (e.tPrompt) e.tPrompt.setAttribute('aria-pressed', isAppend ? 'false' : 'true');
          if (e.tAppend) e.tAppend.setAttribute('aria-pressed', isAppend ? 'true' : 'false');
          if (e.fav) {
            e.fav.setAttribute('aria-pressed', st.draft.favorite ? 'true' : 'false');
            e.fav.textContent = st.draft.favorite ? '★ Favourite' : '☆ Favourite';
          }
        }

        if (e.del) e.del.style.display = (st.mode === 'edit') ? '' : 'none';
        if (e.del) e.del.textContent = st.deleteArmed ? 'Confirm delete?' : 'Delete';
        if (e.del) e.del.classList.toggle(`cgxui-${SkID}--ed-danger`, true);
        if (e.discard) e.discard.style.display = st.discardArmed ? '' : 'none';
        return true;
      }, false);
    },

    open(root, { kind = 'prompt', mode = 'create', id = null, type = 'prompt' } = {}) {
      return SAFE_try('EDITOR_PM.open', () => {
        const st = EDITOR_PM.st();
        EDITOR_PM.disarmDelete();
        let initial;
        if (kind === 'quick') {
          const rec = (mode === 'edit') ? (STATE_PM.data.quick || []).find(x => x && x.id === id) : null;
          if (mode === 'edit' && !rec) return false;
          initial = { text: rec ? String(rec.text || '') : '' };
        } else {
          const rec = (mode === 'edit') ? (STATE_PM.data.prompts || []).find(x => x && x.id === id) : null;
          if (mode === 'edit' && !rec) return false;
          initial = rec
            ? { title: String(rec.title || ''), body: String(rec.body || ''), type: (rec.type === 'append') ? 'append' : 'prompt', favorite: !!rec.favorite }
            : { title: '', body: '', type: (type === 'append') ? 'append' : 'prompt', favorite: false };
        }
        st.open = true; st.kind = kind; st.mode = mode; st.id = id;
        st.initial = initial;
        st.draft = JSON.parse(JSON.stringify(initial));
        st.dirty = false; st.discardArmed = false;
        EDITOR_PM.sync(root);
        FEEDBACK_PM.hide(root);
        const e = EDITOR_PM.els(root);
        try { (kind === 'quick' ? e.body : e.title)?.focus?.(); } catch {}
        return true;
      }, false);
    },

    close(root) {
      const st = EDITOR_PM.st();
      EDITOR_PM.disarmDelete();
      st.open = false; st.id = null; st.initial = null; st.draft = null;
      st.dirty = false; st.discardArmed = false;
      EDITOR_PM.sync(root);
      /* [2A-fix D] Editor-scoped feedback (e.g. a validation error) must not
       * outlive the editor. Callers that follow with 'Saved'/'Deleted' simply
       * overwrite this cleared state. */
      FEEDBACK_PM.hide(root);
      return true;
    },

    /* [2A-fix A] Mode authority for the Edit → Simple Back action.
     *   editor closed → true  (Back may proceed)
     *   clean editor  → close, then true
     *   dirty editor  → arm the inline discard strip and return FALSE, so the
     *                   caller must NOT switch mode; otherwise the editor would
     *                   be hidden while still open and Escape would act on it. */
    requestBack(root) {
      const st = EDITOR_PM.st();
      if (!st.open) return true;
      return EDITOR_PM.cancel(root);
    },

    /* [2A-fix B] Transient confirmation state must never survive a remount. The
     * unsaved draft itself does survive — losing typed work to a self-heal would
     * be worse than the stale-arm it prevents. */
    resetTransient() {
      EDITOR_PM.disarmDelete();
      const st = EDITOR_PM.st();
      st.deleteArmed = false;
      st.discardArmed = false;
      STATE_PM.ui.editorDeleteTimer = 0;
    },

    /* [2A-fix B] Re-apply editor state to a freshly mounted or reopened root.
     * When the editor is open, Edit mode is made authoritative BEFORE syncing so
     * the editor can never be left hidden behind the Simple list. */
    restore(root) {
      return SAFE_try('EDITOR_PM.restore', () => {
        const st = EDITOR_PM.st();
        EDITOR_PM.resetTransient();
        if (!st.open) { EDITOR_PM.sync(root); return false; }
        ENGINE_PM.setUiMode('edit');
        RENDER_PM.setMode(root, 'edit');
        EDITOR_PM.sync(root);
        return true;
      }, false);
    },

    /* Focus the field the current shape actually edits. */
    focusPrimary(root) {
      return SAFE_try('EDITOR_PM.focusPrimary', () => {
        const e = EDITOR_PM.els(root); const st = EDITOR_PM.st();
        if (!e || !st.open) return false;
        (st.kind === 'quick' ? e.body : e.title)?.focus?.();
        return true;
      }, false);
    },

    /* Cancel: clean editors close at once; dirty editors arm the inline discard
     * strip instead of calling confirm(). */
    cancel(root) {
      const st = EDITOR_PM.st();
      if (!st.open) return false;
      EDITOR_PM.refreshDirty(root);
      if (!st.dirty) { EDITOR_PM.close(root); return true; }
      st.discardArmed = true;
      EDITOR_PM.sync(root);
      return false;
    },

    keepEditing(root) {
      EDITOR_PM.st().discardArmed = false;
      EDITOR_PM.sync(root);
      return true;
    },

    disarmDelete() {
      if (STATE_PM.ui.editorDeleteTimer) {
        CLEAN_clearTimeout(STATE_PM.ui.editorDeleteTimer);
        STATE_PM.ui.editorDeleteTimer = 0;
      }
      EDITOR_PM.st().deleteArmed = false;
    },

    /* Two-step delete. The arm expires through the module's owned timer helper,
     * so disposal cancels it with every other timer. */
    armDelete(root) {
      const st = EDITOR_PM.st();
      st.deleteArmed = true;
      EDITOR_PM.sync(root);
      if (STATE_PM.ui.editorDeleteTimer) CLEAN_clearTimeout(STATE_PM.ui.editorDeleteTimer);
      STATE_PM.ui.editorDeleteTimer = CLEAN_setTimeout(() => {
        STATE_PM.ui.editorDeleteTimer = 0;
        st.deleteArmed = false;
        EDITOR_PM.sync(root);
      }, PM_DELETE_ARM_MS);
      return true;
    },

    save(root) {
      return SAFE_try('EDITOR_PM.save', () => {
        const st = EDITOR_PM.st();
        if (!st.open) return false;
        st.draft = EDITOR_PM.readDraft(root);

        const v = EDITOR_PM_validate(st.kind, st.draft);
        if (!v.ok) { FEEDBACK_PM.say(v.error, 'error', root); return false; }

        const now = UTIL_now();

        if (st.kind === 'quick') {
          const text = String(st.draft.text || '').trim();
          const list = STATE_PM.data.quick || [];
          /* [2A-fix E] The target must still exist in AUTHORITATIVE state. With
           * zero matches the map below is an identity transform, the commit
           * succeeds on an unchanged list, and the editor reports a save that
           * changed nothing. Fail truthfully instead: no commit, editor stays
           * open, every typed field preserved. Never recreate or append. */
          if (st.mode === 'edit' && !EDITOR_PM_hasTarget(list, st.id)) {
            FEEDBACK_PM.say(PM_MSG_TARGET_GONE, 'error', root);
            return false;
          }
          const next = (st.mode === 'create')
            ? list.concat([{ id: UTIL_cryptoId(), text, order: list.length, createdAt: now, updatedAt: now }])
            : list.map(x => (x && x.id === st.id) ? { ...x, text, updatedAt: now } : x);
          // Truthful persistence: a failed commit keeps the editor and the values.
          const wq = ENGINE_PM.commitQuickResult(next);
          if (!wq.ok) { FEEDBACK_PM_writeFailure(wq, root); return false; }
          EDITOR_PM.close(root);
          RENDER_PM.renderEdit(root, SEARCH_PM.get());
          RENDER_PM.renderQuickTray(root);
          FEEDBACK_PM.say('Saved', 'info', root);
          return true;
        }

        const title = String(st.draft.title || '').trim();
        const body = String(st.draft.body || '');
        const type = (st.draft.type === 'append') ? 'append' : 'prompt';
        const favorite = !!st.draft.favorite;
        const list = STATE_PM.data.prompts || [];
        /* [2A-fix E] Same stale-target guard as Quick, applied independently. */
        if (st.mode === 'edit' && !EDITOR_PM_hasTarget(list, st.id)) {
          FEEDBACK_PM.say(PM_MSG_TARGET_GONE, 'error', root);
          return false;
        }
        const next = (st.mode === 'create')
          ? list.concat([{ id: UTIL_cryptoId(), title, body, favorite, type, createdAt: now, updatedAt: now }])
          : list.map(x => (x && x.id === st.id) ? { ...x, title, body, favorite, type, updatedAt: now } : x);
        const wp = ENGINE_PM.commitPromptsResult(next);
        if (!wp.ok) { FEEDBACK_PM_writeFailure(wp, root); return false; }
        EDITOR_PM.close(root);
        UI_PM_renderBoth(root);
        FEEDBACK_PM.say('Saved', 'info', root);
        return true;
      }, false);
    },

    confirmDelete(root) {
      return SAFE_try('EDITOR_PM.confirmDelete', () => {
        const st = EDITOR_PM.st();
        if (!st.open || st.mode !== 'edit' || !st.id) return false;

        if (st.kind === 'quick') {
          const list = STATE_PM.data.quick || [];
          /* [2A-fix E] A vanished target makes the filter below a no-op, so the
           * unchanged list would commit and the editor would announce
           * "Deleted". Disarm the confirmation, keep the editor, say so. */
          if (!EDITOR_PM_hasTarget(list, st.id)) {
            EDITOR_PM.disarmDelete();
            /* refreshDirty before sync: sync() writes st.draft back into the
             * fields, so without re-reading them first the guard would revert
             * whatever the user had typed. */
            EDITOR_PM.refreshDirty(root);
            EDITOR_PM.sync(root);
            FEEDBACK_PM.say(PM_MSG_TARGET_GONE, 'error', root);
            return false;
          }
          const next = list
            .filter(q => q && q.id !== st.id)
            .map((q, i) => ({ ...q, order: i }));
          const wq = ENGINE_PM.commitQuickResult(next);
          if (!wq.ok) { FEEDBACK_PM_writeFailure(wq, root); return false; }
          EDITOR_PM.close(root);
          RENDER_PM.renderEdit(root, SEARCH_PM.get());
          RENDER_PM.renderQuickTray(root);
          FEEDBACK_PM.say('Deleted', 'info', root);
          return true;
        }

        const plist = STATE_PM.data.prompts || [];
        /* [2A-fix E] Same stale-target guard as Quick, applied independently. */
        if (!EDITOR_PM_hasTarget(plist, st.id)) {
          EDITOR_PM.disarmDelete();
          EDITOR_PM.refreshDirty(root);
          EDITOR_PM.sync(root);
          FEEDBACK_PM.say(PM_MSG_TARGET_GONE, 'error', root);
          return false;
        }
        const next = plist.filter(x => x && x.id !== st.id);
        const wp = ENGINE_PM.commitPromptsResult(next);
        if (!wp.ok) { FEEDBACK_PM_writeFailure(wp, root); return false; }
        EDITOR_PM.close(root);
        UI_PM_renderBoth(root);
        FEEDBACK_PM.say('Deleted', 'info', root);
        return true;
      }, false);
    },
  };

  /* ───────────────────────────── 📦 PORTABILITY — controller 📝🔓💥 ─────────────────────────────
   * [2C] The storage side of portability. Everything shape-related lives in the
   * pure block above; this object owns the DOM controls, the file handling and
   * the one write sequence that must be all-or-nothing across TWO live stores.
   */
  const PORT_PM = {
    st() { return STATE_PM.ui.port; },
    isPending() { return !!STATE_PM.ui.port.pending; },

    els(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      if (!root) return null;
      const g = (t) => DOM_q(UI_PM.selOwned(t), root);
      return {
        row: g(UI_PM_PORT_ROW),
        exportBtn: g(UI_PM_EXPORT_LIB),
        importBtn: g(UI_PM_IMPORT_BTN),
        file: g(UI_PM_IMPORT_FILE),
        box: g(UI_PM_IMPORT_BOX),
        summary: g(UI_PM_IMPORT_SUMMARY),
        merge: g(UI_PM_IMPORT_MERGE),
        replace: g(UI_PM_IMPORT_REPLACE),
        cancel: g(UI_PM_IMPORT_CANCEL),
      };
    },

    /* Preview text. Built with textContent by the caller, never innerHTML: an
     * imported title containing markup is data and must render as the
     * characters the user typed. */
    summaryLines(envelope) {
      const merged = PORT_PM_buildImportCandidates('merge', STATE_PM.data, envelope);
      const s = merged.summary;
      return [
        `Prompts: ${s.prompts}`,
        `Quick Replies: ${s.quickReplies}`,
        `Merge — new: ${s.promptsAdded + s.quickAdded}, updated by ID: ${s.promptsUpdated + s.quickUpdated}`,
        'Replace — replaces the current Prompt and Quick libraries with this file.',
      ].join('\n');
    },

    sync(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return SAFE_try('PORT_PM.sync', () => {
        const e = PORT_PM.els(root);
        if (!e) return false;
        const st = PORT_PM.st();
        const pending = st.pending;
        if (e.box) e.box.style.display = pending ? '' : 'none';
        if (e.summary) e.summary.textContent = pending ? PORT_PM.summaryLines(pending.envelope) : '';
        /* [2C-closure-2] Once storage is known to be out of sync, the two
         * portability mutations are impossible, so the controls stop inviting
         * them. Cancel stays live so a stale confirmation can still be
         * dismissed, and nothing else in the panel is disabled. */
        const blocked = !!st.recoveryRequired;
        if (e.importBtn) {
          e.importBtn.disabled = blocked;
          e.importBtn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
        }
        if (e.exportBtn) {
          e.exportBtn.disabled = blocked;
          e.exportBtn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
        }
        if (e.merge) e.merge.disabled = blocked;
        if (e.replace) e.replace.disabled = blocked;
        return true;
      }, false);
    },

    clearPending(root) {
      /* [2C-closure-2] Clearing also RETIRES the current read generation, so an
       * older reader that completes afterwards — after a Cancel, or after a
       * successful import — cannot recreate a pending confirmation behind the
       * user's back. */
      PORT_PM.nextRead();
      PORT_PM.st().pending = null;
      const e = PORT_PM.els(root);
      // Clearing the input lets the SAME file be chosen again; without it a
      // second pick of an unchanged path fires no `change` event at all.
      if (e && e.file) { try { e.file.value = ''; } catch { /* non-fatal */ } }
      PORT_PM.sync(root);
      return true;
    },

    /* Export. Reads the authoritative in-memory collections, builds the
     * canonical envelope and hands the browser a file. No storage key is read
     * for it and none is written: exporting can never change the library.
     *
     * [2C-closure] All-or-nothing. The envelope is built FIRST and the build
     * can refuse; a refusal returns before any Blob, object URL, anchor or
     * click exists, so a rejected export has no download side effect at all
     * and never reports "Exported". */
    exportLibrary(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return SAFE_try('PORT_PM.exportLibrary', () => {
        /* [2C-closure-2] Fail closed while storage is known to be out of sync.
         *
         * The undecodable degraded path deliberately leaves in-memory authority
         * untouched precisely BECAUSE its relationship to the surviving bytes
         * cannot be proven. Writing that state to a file and calling it
         * "Exported" would hand the user a portability artefact the module
         * itself cannot vouch for. Portability only: browsing, editing and
         * every other Prompt Manager function stay available. */
        if (PORT_PM.st().recoveryRequired) {
          FEEDBACK_PM.say(PM_MSG_PORT_RECOVERY, 'error', root);
          return false;
        }
        /* [2C-closure-3] The in-memory library is only as trustworthy as the
         * bytes behind it. A corrupt primary that the tolerant reader showed as
         * [] must not be written out as a successful empty portability file. */
        const live = PORT_PM_checkLiveStoreAuthority(STATE_PM.data.prompts, STATE_PM.data.quick);
        if (!live.ok) {
          FEEDBACK_PM.say(live.error, 'error', root);
          return false;
        }
        const built = PORT_PM_buildExportEnvelope(STATE_PM.data.prompts, STATE_PM.data.quick, UTIL_now());
        if (!built.ok) {
          FEEDBACK_PM.say(built.error || PM_MSG_PORT_EXPORT, 'error', root);
          return false;
        }
        const envelope = built.envelope;
        const text = PORT_PM_serializeExport(envelope);
        /* [2C-closure-3] A file this module cannot import back is not a
         * successful export. Measured in real UTF-8 bytes, against the same cap
         * the importer enforces, BEFORE any Blob or object URL exists. */
        const bytes = PORT_PM_utf8Bytes(text);
        if (bytes === null || bytes > PORT_PM_MAX_BYTES) {
          FEEDBACK_PM.say(PM_MSG_PORT_EXPORT_TOO_LARGE, 'error', root);
          return false;
        }
        if (!PORT_PM_download(PORT_PM_exportFilename(envelope.exportedAt), text)) {
          FEEDBACK_PM.say(PM_MSG_PORT_EXPORT, 'error', root);
          return false;
        }
        FEEDBACK_PM.say('Exported', 'info', root);
        return true;
      }, false);
    },

    /* Stage a file. Reaching `pending` requires the WHOLE file to validate, so
     * selecting a file can never mutate storage and a rejected file leaves the
     * confirmation strip closed with a persistent error on the status line. */
    /* [2C-closure-2] Every selection takes the next read generation, and every
     * asynchronous completion must still hold it. A reader whose token is stale
     * returns having changed nothing at all: not pending, not the feedback
     * line, not the preview, and certainly not storage. Aborting the older
     * reader would be an optimization; the token is the correctness. */
    nextRead() {
      const st = PORT_PM.st();
      st.readSeq = (Number(st.readSeq) || 0) + 1;
      return st.readSeq;
    },
    isCurrentRead(token) { return PORT_PM.st().readSeq === token; },

    beginImport(root, file) {
      return SAFE_try('PORT_PM.beginImport', () => {
        /* A new selection supersedes everything in flight FIRST: the old
         * confirmation must not keep looking active while the new file is still
         * being read, and a Merge/Replace click in that window must find no
         * pending import to act on. */
        const token = PORT_PM.nextRead();
        PORT_PM.st().pending = null;
        PORT_PM.sync(root);

        // [2C-closure] Fail closed while storage is known to be out of sync.
        if (PORT_PM.st().recoveryRequired) {
          FEEDBACK_PM.say(PM_MSG_PORT_RECOVERY, 'error', root);
          return false;
        }
        /* [2C-closure-3] Refuse before any FileReader work when the live
         * Prompt/Quick authority is already known to be unusable. Re-checked at
         * Apply, because storage can change while a file is pending. */
        const liveNow = PORT_PM_checkLiveStoreAuthority(STATE_PM.data.prompts, STATE_PM.data.quick);
        if (!liveNow.ok) {
          FEEDBACK_PM.say(liveNow.error, 'error', root);
          return false;
        }
        if (!file) return false;

        if (PORT_PM_overSizeLimit(file.size)) {
          FEEDBACK_PM.say(PM_MSG_PORT_TOO_LARGE, 'error', root);
          return false;
        }

        const reader = new FileReader();
        reader.onerror = () => {
          SAFE_try('PORT_PM.beginImport.readError', () => {
            if (!PORT_PM.isCurrentRead(token)) return false; // superseded: silent
            FEEDBACK_PM.say(PM_MSG_PORT_INVALID, 'error', root);
            PORT_PM.sync(root);
            return true;
          }, false);
        };
        reader.onload = () => {
          SAFE_try('PORT_PM.beginImport.parsed', () => {
            if (!PORT_PM.isCurrentRead(token)) return false; // superseded: silent
            /* Re-checked here as well as at selection time: the latch can be set
             * by a failed import that ran while this read was outstanding. */
            if (PORT_PM.st().recoveryRequired) return false;
            const res = PORT_PM_parseImportText(reader.result);
            if (!PORT_PM.isCurrentRead(token)) return false; // superseded during parse
            if (!res.ok) {
              FEEDBACK_PM.say(res.error, 'error', root);
              PORT_PM.sync(root);
              return false;
            }
            PORT_PM.st().pending = { envelope: res.envelope };
            FEEDBACK_PM.hide(root);
            PORT_PM.sync(root);
            return true;
          }, false);
        };
        reader.readAsText(file);
        return true;
      }, false);
    },

    /* Cancel: no storage change of any kind, pending state cleared, file input
     * released, Edit view restored. */
    cancelImport(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      /* [2C-closure-2] Cancel ALWAYS retires the current read generation, even
       * when no confirmation is showing. A file selected a moment ago may still
       * be reading, and a cancel that only cleared the visible state would let
       * that read arrive afterwards and stage an import the user just declined.
       * The return value still reports whether a confirmation was dismissed,
       * and the message is only shown when one actually was. */
      const wasPending = PORT_PM.isPending();
      PORT_PM.clearPending(root);
      if (!wasPending) return false;
      FEEDBACK_PM.say('Import cancelled', 'info', root);
      return true;
    },

    /* Apply an accepted import.
     *
     * Two live stores mean a naive "write Prompts, then write Quick" can leave
     * the library half-imported when the second write fails. The visible
     * contract here is that after this returns, the pair is EITHER the exact
     * old state OR the complete new state — never one of each:
     *
     *   1. capture the exact raw bytes (or proven absence) of both live keys
     *   2. persist the pre-import backup; a failure here aborts before any
     *      live byte is written
     *   3. write both live stores as BYTES ONLY (persist*, not commit*), so
     *      nothing is adopted and no `changed` event is published yet
     *   4. on any write failure, restore BOTH keys to their captured raw bytes
     *      and report truthfully — in-memory authority was never touched, so it
     *      already holds the pre-import state
     *   5. only when both byte writes succeeded, adopt the candidates and emit
     *
     * A rollback that itself fails is reported with its own distinct message:
     * at that point storage is genuinely inconsistent and saying "Storage write
     * failed" would understate it. */
    applyImport(root = (STATE_PM.ui.root || UI_PM.getRoot()), mode = 'merge') {
      return SAFE_try('PORT_PM.applyImport', () => {
        const pending = PORT_PM.st().pending;
        if (!pending) return false;
        /* [2C-closure] A previous failed rollback left storage in a state this
         * module could not read. Mutating it again would build candidates from
         * an in-memory pair with no proven relationship to the bytes. */
        if (PORT_PM.st().recoveryRequired) {
          FEEDBACK_PM.say(PM_MSG_PORT_RECOVERY, 'error', root);
          return false;
        }
        const wantMode = (mode === 'replace') ? 'replace' : 'merge';

        /* [2C-closure-3] MANDATORY re-check. The file was validated some time
         * ago and storage can have changed since: another tab, a quota event or
         * a corrupt write can leave a primary the module must not overwrite.
         * This runs BEFORE candidates, before the backup and before any live
         * write, so an unsafe store costs nothing. */
        const liveAtApply = PORT_PM_checkLiveStoreAuthority(STATE_PM.data.prompts, STATE_PM.data.quick);
        if (!liveAtApply.ok) {
          FEEDBACK_PM.say(liveAtApply.error, 'error', root);
          return false;
        }

        const candidates = PORT_PM_buildImportCandidates(wantMode, STATE_PM.data, pending.envelope);

        // 1. exact pre-import raw state for both live keys.
        const beforePrompts = UTIL_storage.readRaw(KEY_PM_STATE_PROMPTS_V1);
        const beforeQuick = UTIL_storage.readRaw(KEY_PM_STATE_QUICK_V1);
        if (!beforePrompts.ok || !beforeQuick.ok) {
          // Without a provable pre-state there is no rollback to offer, so the
          // safe move is to write nothing at all.
          ENGINE_PM_noteWriteFailure('PORT_PM.applyImport.readPreState');
          FEEDBACK_PM.say(PM_MSG_PORT_WRITE, 'error', root);
          return false;
        }

        /* 2. backup before any live write.
         *
         * [2C-closure] The backup uses the same all-or-nothing projection as
         * export, so it can refuse. A library that cannot be snapshotted
         * faithfully aborts the import here — before a single live byte —
         * rather than being overwritten with no complete record of what it was. */
        const backupBuilt = PORT_PM_buildBackupEnvelope(STATE_PM.data.prompts, STATE_PM.data.quick, UTIL_now());
        if (!backupBuilt.ok) {
          FEEDBACK_PM.say(backupBuilt.error || PM_MSG_PORT_BACKUP, 'error', root);
          return false;
        }
        if (!UTIL_storage.setJSON(KEY_PM_STATE_IMPORT_BACKUP_V1, backupBuilt.envelope)) {
          ENGINE_PM_noteWriteFailure('PORT_PM.applyImport.backup');
          FEEDBACK_PM.say(PM_MSG_PORT_BACKUP, 'error', root);
          return false;
        }

        /* [2C-closure] Rollback is judged by the BYTES, not by what the setters
         * returned. A storage layer can write and still throw, and the first
         * implementation believed the return value: it reported "Import
         * rollback failed" for a store whose bytes were in fact correct.
         *
         * Both keys are restored best-effort, then both are RE-READ and
         * compared against their original raw snapshots. Success means the
         * persisted state is exactly the pre-import state — whatever any
         * intermediate setter claimed along the way. */
        const rollback = () => {
          PORT_PM_restoreRaw(KEY_PM_STATE_PROMPTS_V1, beforePrompts);
          PORT_PM_restoreRaw(KEY_PM_STATE_QUICK_V1, beforeQuick);
          const nowPrompts = UTIL_storage.readRaw(KEY_PM_STATE_PROMPTS_V1);
          const nowQuick = UTIL_storage.readRaw(KEY_PM_STATE_QUICK_V1);
          const ok = PORT_PM_rawEquals(beforePrompts, nowPrompts)
            && PORT_PM_rawEquals(beforeQuick, nowQuick);
          if (!ok) ENGINE_PM_noteWriteFailure('PORT_PM.applyImport.rollback');
          return { ok, nowPrompts, nowQuick };
        };

        /* [2C-closure] A rollback that did not restore both keys leaves storage
         * describing itself. In-memory authority must not keep pretending the
         * old pair survived, so it is resynchronized to whatever ACTUALLY
         * persists — read through the pure decoder, never through a recovery
         * loader that could seed, migrate, rewrite or quarantine.
         *
         * Nothing is written on this path. If either surviving value cannot be
         * decoded safely, no list is invented: the module marks itself
         * recovery-required, keeps the persistent error, and refuses further
         * portability mutations until the page is reloaded. */
        const reconcileDegraded = (rb) => {
          const dp = PORT_PM_decodeRawList(rb.nowPrompts);
          const dq = PORT_PM_decodeRawList(rb.nowQuick);
          if (!dp.ok || !dq.ok) {
            PORT_PM.st().recoveryRequired = true;
            UTIL_diagErr('PORT_PM.applyImport.degradedUndecodable',
              'surviving Prompt/Quick bytes could not be decoded; in-memory authority left untouched');
            FEEDBACK_PM.say(PM_MSG_PORT_RECOVERY, 'error', root);
            return false;
          }
          STATE_PM.data.prompts = dp.list;
          STATE_PM.data.quick = dq.list;
          /* The in-memory pair genuinely changed, so consumers are told through
           * the established changed-event authority. This is NOT an import
           * success signal — no 'Imported' message is shown, no usage metadata
           * moves and no updatedAt is touched. */
          UTIL_emitPmChanged({ what: 'prompts' });
          UTIL_emitPmChanged({ what: 'quick' });
          UI_PM_renderBoth(root);
          if (root) RENDER_PM.renderQuickTray(root);
          FEEDBACK_PM.say(PM_MSG_PORT_ROLLBACK, 'error', root);
          return false;
        };

        // 3+4. bytes only, with a byte-verified paired rollback on either failure.
        if (!ENGINE_PM.persistPrompts(candidates.prompts)) {
          const rb = rollback();
          if (rb.ok) { FEEDBACK_PM.say(PM_MSG_PORT_WRITE, 'error', root); return false; }
          return reconcileDegraded(rb);
        }
        if (!ENGINE_PM.persistQuick(candidates.quick)) {
          const rb = rollback();
          if (rb.ok) { FEEDBACK_PM.say(PM_MSG_PORT_WRITE, 'error', root); return false; }
          return reconcileDegraded(rb);
        }

        // 5. both stores are on disk — adopt, then publish.
        STATE_PM.data.prompts = candidates.prompts;
        STATE_PM.data.quick = candidates.quick;
        UTIL_emitPmChanged({ what: 'prompts' });
        UTIL_emitPmChanged({ what: 'quick' });

        PORT_PM.clearPending(root);
        UI_PM_renderBoth(root);
        if (root) RENDER_PM.renderQuickTray(root);
        FEEDBACK_PM.say(wantMode === 'replace' ? 'Imported — replaced' : 'Imported — merged', 'info', root);
        return true;
      }, false);
    },
  };

  /* Hand a serialized envelope to the browser as a download.
   *
   * The object URL is revoked on a short OWNED timer rather than in the same
   * tick, and a cleanup function is registered so disposal inside that window
   * revokes it too. Both routes run through the same idempotent closure, so the
   * URL is released exactly once on every path. */
  function PORT_PM_download(filename, text) {
    return SAFE_try('PORT_PM.download', () => {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      let revoked = false;
      const revoke = () => {
        if (revoked) return;
        revoked = true;
        try { URL.revokeObjectURL(url); } catch { /* already gone */ }
      };
      CLEAN_addFn(revoke);
      try {
        const a = D.createElement('a');
        a.href = url;
        a.download = filename;
        a.rel = 'noopener';
        a.style.display = 'none';
        (D.body || D.documentElement).appendChild(a);
        a.click();
        a.remove();
      } catch (e) {
        revoke();
        throw e;
      }
      CLEAN_setTimeout(revoke, PORT_PM_REVOKE_MS);
      return true;
    }, false);
  }

  if (W.__H2O_PM_TEST__ === true) {
    MOD_OBJ.__test = Object.freeze({
      version: MOD_VERSION,
      engine: ENGINE_PM,
      state: STATE_PM,
      diag: DIAG,
      storage: UTIL_storage,
      reorderVisible: ENGINE_PM_reorderVisible,
      readArray: ENGINE_PM_readArray,
      hash32: UTIL_hash32,
      migratedDraftId: ENGINE_PM_migratedDraftId,
      quarantineMaxCandidates: PM_QUARANTINE_MAX_CANDIDATES,
      migUnknownCreatedAt: PM_MIG_UNKNOWN_CREATED_AT,
      normDraftTs: ENGINE_PM_normDraftTs,
      normDraftText: ENGINE_PM_normDraftText,
      verifyCaptureOccurrence: ENGINE_PM_verifyCaptureOccurrence,
      /* [2A] Editor/conversion helpers. Pure functions plus the live editor
       * controller, so validators exercise production logic rather than a copy.
       * Nothing here widens the six-method public API. */
      normalizeConvBody: ENGINE_PM_normalizeConvBody,
      convTitle: ENGINE_PM_convTitle,
      findConvDuplicate: ENGINE_PM_findConvDuplicate,
      buildDuplicate: ENGINE_PM_buildDuplicate,
      insertAfterId: ENGINE_PM_insertAfterId,
      editorValidate: EDITOR_PM_validate,
      editorIsDirty: EDITOR_PM_isDirty,
      editorHasTarget: EDITOR_PM_hasTarget,
      msgTargetGone: PM_MSG_TARGET_GONE,
      /* [2B] Retrieval helpers. Pure functions only — the validators drive the
       * shipped ranking rather than a copy of it. Still no widening of the
       * six-method public API. */
      rankPrompts: ENGINE_PM_rankPrompts,
      selectPromptView: ENGINE_PM_selectPromptView,
      rankBase: ENGINE_PM_rankBase,
      hasWordBoundary: ENGINE_PM_hasWordBoundary,
      escapeRegex: ENGINE_PM_escapeRegex,
      normUsageTs: ENGINE_PM_normUsageTs,
      normUseCount: ENGINE_PM_normUseCount,
      touchPromptUsage: ENGINE_PM_touchPromptUsage,
      /* The exact simulation stays exposed as the correctness ORACLE the
       * validators compare the optimized authority against. Production renders
       * and clicks go through computeMoveAvailability. */
      canMovePromptView: ENGINE_PM_canMovePromptView,
      computeMoveAvailability: ENGINE_PM_computeMoveAvailability,
      applyReorderAvailability: RENDER_PM_applyReorderAvailability,
      msgRankedNoReorder: PM_MSG_RANKED_NO_REORDER,
      recencyBoost: ENGINE_PM_recencyBoost,
      usageBoost: ENGINE_PM_usageBoost,
      promptEmptyHtml: RENDER_PM_promptEmptyHtml,
      searchRenderMs: PM_SEARCH_RENDER_MS,
      rank: Object.freeze({
        titleExact: PM_RANK_TITLE_EXACT, titlePrefix: PM_RANK_TITLE_PREFIX,
        titleWord: PM_RANK_TITLE_WORD, titleIncludes: PM_RANK_TITLE_INCLUDES,
        bodyWord: PM_RANK_BODY_WORD, bodyIncludes: PM_RANK_BODY_INCLUDES,
        noMatch: PM_RANK_NO_MATCH, favorite: PM_RANK_FAVORITE_BOOST,
        recent7d: PM_RANK_RECENT_7D_BOOST, recent30d: PM_RANK_RECENT_30D_BOOST,
        useUnit: PM_RANK_USE_UNIT, useCap: PM_RANK_USE_CAP,
        day: PM_DAY_MS,
      }),
      editor: EDITOR_PM,
      feedback: FEEDBACK_PM,
      /* [2C] Portability. The pure shape helpers plus the live controller, so
       * validators drive the shipped export/import rather than a copy of it.
       * Deliberately NOT a widening of the six-method public API, and no raw
       * localStorage contents are exposed here — the storage engine already
       * reachable through `engine`/`storage` remains the only such surface. */
      portability: Object.freeze({
        kind: PORT_PM_KIND,
        version: PORT_PM_VERSION,
        backupKind: PORT_PM_BACKUP_KIND,
        backupVersion: PORT_PM_BACKUP_VERSION,
        maxBytes: PORT_PM_MAX_BYTES,
        maxRecords: PORT_PM_MAX_RECORDS,
        envelopeKeys: PORT_PM_ENVELOPE_KEYS,
        promptKeys: PORT_PM_PROMPT_KEYS,
        quickKeys: PORT_PM_QUICK_KEYS,
        buildExportEnvelope: PORT_PM_buildExportEnvelope,
        serializeExport: PORT_PM_serializeExport,
        exportFilename: PORT_PM_exportFilename,
        validateImportEnvelope: PORT_PM_validateImportEnvelope,
        validateImportPrompt: PORT_PM_validateImportPrompt,
        validateImportQuick: PORT_PM_validateImportQuick,
        parseImportText: PORT_PM_parseImportText,
        overSizeLimit: PORT_PM_overSizeLimit,
        mergePromptRecords: PORT_PM_mergePromptRecords,
        mergeQuickRecords: PORT_PM_mergeQuickRecords,
        buildImportCandidates: PORT_PM_buildImportCandidates,
        buildBackupEnvelope: PORT_PM_buildBackupEnvelope,
        restoreRaw: PORT_PM_restoreRaw,
        /* [2C-closure] Lossless-export and degraded-rollback primitives. */
        projectList: PORT_PM_projectList,
        exportPrompt: PORT_PM_exportPrompt,
        exportQuick: PORT_PM_exportQuick,
        /* [2C-closure-3] Quick sequencing, live-store preflight, UTF-8 bytes. */
        sequenceQuick: PORT_PM_sequenceQuick,
        checkLiveStoreAuthority: PORT_PM_checkLiveStoreAuthority,
        utf8Bytes: PORT_PM_utf8Bytes,
        /* [2C-closure-2] Canonical identity + read-generation authorities. */
        isCanonicalId: PORT_PM_isCanonicalId,
        recordId: PORT_PM_recordId,
        rawEquals: PORT_PM_rawEquals,
        decodeRawList: PORT_PM_decodeRawList,
        controller: PORT_PM,
        messages: Object.freeze({
          invalid: PM_MSG_PORT_INVALID,
          version: PM_MSG_PORT_VERSION,
          duplicatePrompt: PM_MSG_PORT_DUP_PROMPT,
          duplicateQuick: PM_MSG_PORT_DUP_QUICK,
          tooLarge: PM_MSG_PORT_TOO_LARGE,
          write: PM_MSG_PORT_WRITE,
          backup: PM_MSG_PORT_BACKUP,
          rollback: PM_MSG_PORT_ROLLBACK,
          exportFailed: PM_MSG_PORT_EXPORT,
          /* Spelled `exportInvalid*` on purpose: `exportPrompts` /
           * `importPrompts` are prohibited identifiers (a pre-2C invariant
           * guards against a second, divergent export implementation), and a
           * message key must not be what trips that guard. */
          exportInvalidPrompts: PM_MSG_PORT_EXPORT_PROMPTS,
          exportInvalidQuick: PM_MSG_PORT_EXPORT_QUICK,
          exportDupPrompt: PM_MSG_PORT_EXPORT_DUP_PROMPT,
          exportDupQuick: PM_MSG_PORT_EXPORT_DUP_QUICK,
          recovery: PM_MSG_PORT_RECOVERY,
          storePrompts: PM_MSG_PORT_STORE_PROMPTS,
          storeQuick: PM_MSG_PORT_STORE_QUICK,
          changedPrompts: PM_MSG_PORT_CHANGED_PROMPTS,
          changedQuick: PM_MSG_PORT_CHANGED_QUICK,
          exportTooLarge: PM_MSG_PORT_EXPORT_TOO_LARGE,
        }),
      }),
      promptCard: RENDER_PM_promptCard,
      convTitleMax: PM_CONV_TITLE_MAX,
      deleteArmMs: PM_DELETE_ARM_MS,
      statusClearMs: PM_STATUS_CLEAR_MS,
      readKinds: Object.freeze({ absent: PM_READ_ABSENT, corrupt: PM_READ_CORRUPT, valid: PM_READ_VALID }),
      /* Write-failure surface, mirroring readKinds above. Exposes the kind
       * vocabulary and the kind->message mapping so validators can drive the
       * shipped classifier and the shipped copy rather than a transcription.
       * Internal test surface only — the six-method public API is unchanged. */
      writeKinds: Object.freeze({
        ok: PM_WRITE_OK, quota: PM_WRITE_QUOTA, blocked: PM_WRITE_BLOCKED,
        serialization: PM_WRITE_SERIALIZATION, unknown: PM_WRITE_UNKNOWN,
      }),
      writeMessage: PM_MSG_writeFailure,
      classifyWriteError: UTIL_classifyWriteError,
      keys: Object.freeze({
        prompts: KEY_PM_STATE_PROMPTS_V1,
        quick: KEY_PM_STATE_QUICK_V1,
        importBackup: KEY_PM_STATE_IMPORT_BACKUP_V1,
        seeded: KEY_PM_STATE_SEEDED_V1,
        history: KEY_PM_STATE_HISTORY_V1,
        drafts: KEY_PM_STATE_DRAFTS_V1,
        pasted: KEY_PM_STATE_PASTED_V1,
        autoSend: KEY_PM_CFG_AUTOSEND_V1,
        uiMode: KEY_PM_UI_MODE_V1,
        migKeys: KEY_PM_MIG_KEYS_V1,
        migDrafts: KEY_PM_MIG_DRAFTS_FROM_HISTORY_V1,
      }),
      // Legacy key names, so migration tests drive the real pairs rather than
      // hard-coding strings that could drift from the production list.
      legacyKeys: Object.freeze({
        prompts: KEY_LEG_PROMPTS,
        autoSend: KEY_LEG_AUTOSEND,
        lastUsed: KEY_LEG_LAST_USED,
        quick: KEY_LEG_QUICK,
        history: KEY_LEG_HISTORY,
        mode: KEY_LEG_MODE,
      }),
      events: Object.freeze({
        ready: EV_PM_READY_V1,
        changed: EV_PM_CHANGED_V1,
        readyLegacy: EV_PM_READY_LEGACY_V1,
        changedLegacy: EV_PM_CHANGED_LEGACY_V1,
      }),
    });
  }

  /* ───────────────────────────── 🟨 TIME — Reactivity / Scheduling 📝🔓💥 ───────────────────────────── */
  const TIME_PM = {
    resetHistoryCapture() {
      SAFE_try('TIME_PM.resetHistoryCapture', () => {
        const hc = STATE_PM.historyCapture;
        if (!hc) return;
        if (typeof hc.unbindForm === 'function') { try { hc.unbindForm(); } catch {} }
        if (typeof hc.unbindSendBtn === 'function') { try { hc.unbindSendBtn(); } catch {} }
        hc.unbindForm = null;
        hc.unbindSendBtn = null;
        hc.form = null;
        hc.sendBtn = null;
      }, null);
    },

    ensureHistoryCapture() {
      SAFE_try('TIME_PM.ensureHistoryCapture', () => {
        const hc = STATE_PM.historyCapture;
        if (!hc) return;
        const captureHistory = () => {
          const txt = DOM_getInputText();
          ENGINE_PM.pushHistory(txt);
        };

        const form = DOM_getForm();
        if (!form) {
          TIME_PM.resetHistoryCapture();
          return;
        }

        if (hc.form !== form) {
          if (typeof hc.unbindForm === 'function') { try { hc.unbindForm(); } catch {} }
          const onSubmit = () => captureHistory();
          const onClick = (e) => {
            const btn = e?.target?.closest?.('button');
            if (!btn || !form.contains(btn)) return;
            if (!DOM_isSendButton(btn)) return;
            captureHistory();
          };
          const onKeyDown = (e) => {
            if (e?.key !== 'Enter') return;
            if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
            const activeInput = DOM_pickEditableInForm(form);
            if (!activeInput) return;
            const t = e.target;
            if (!t) return;
            const inActiveInput = (t === activeInput) || !!activeInput.contains?.(t);
            if (!inActiveInput) return;
            captureHistory();
          };
          form.addEventListener('submit', onSubmit, true);
          form.addEventListener('click', onClick, true);
          form.addEventListener('keydown', onKeyDown, true);
          hc.unbindForm = () => {
            form.removeEventListener('submit', onSubmit, true);
            form.removeEventListener('click', onClick, true);
            form.removeEventListener('keydown', onKeyDown, true);
          };
          hc.form = form;
          UTIL_diagStep(`[HIST][${MODTAG}] rebind`, 'form');
        }

        const btn = DOM_getSendButton();
        if (hc.sendBtn !== btn) {
          if (typeof hc.unbindSendBtn === 'function') { try { hc.unbindSendBtn(); } catch {} }
          if (btn) {
            const onBtnClick = () => captureHistory();
            btn.addEventListener('click', onBtnClick, true);
            hc.unbindSendBtn = () => btn.removeEventListener('click', onBtnClick, true);
          } else {
            hc.unbindSendBtn = null;
          }
          hc.sendBtn = btn || null;
          UTIL_diagStep(`[HIST][${MODTAG}] rebind`, btn ? 'sendBtn' : 'sendBtn:none');
        }
      }, null);
    },

    attachDraftCaptureOnClose() {
      SAFE_try('TIME_PM.attachDraftCaptureOnClose', () => {
        const onClose = () => {
          const txt = DOM_getInputText();
          ENGINE_PM.pushDraft(txt);
        };
        W.addEventListener('beforeunload', onClose, true);
        W.addEventListener('pagehide', onClose, true);
        CLEAN_addFn(() => W.removeEventListener('beforeunload', onClose, true));
        CLEAN_addFn(() => W.removeEventListener('pagehide', onClose, true));
      }, null);
    },

    attachPastedCapture() {
      SAFE_try('TIME_PM.attachPastedCapture', () => {
        const onPaste = (e) => {
          const input = DOM_getEditableInput();
          if (!input) return;
          const t = e?.target;
          const inInput = !!t && ((t === input) || !!input.contains?.(t));
          if (!inInput) return;

          let raw = '';
          try {
            raw = String(e?.clipboardData?.getData('text/plain') || e?.clipboardData?.getData('text') || '');
          } catch {}
          if (String(raw || '').trim()) ENGINE_PM.pushPasted(raw);

          // No fallback by design. The former post-paste read captured the WHOLE
          // composer — including text typed before the paste — whenever the
          // clipboard carried no text/plain (image, file, some rich sources).
          // A paste with no plain text has no pasted text to record.
        };

        D.addEventListener('paste', onPaste, true);
        CLEAN_addFn(() => D.removeEventListener('paste', onPaste, true));
      }, null);
    },

    attachEscClose(getPanelOpen, closePanel) {
      const onKey = (e) => {
        if (e.key !== 'Escape' || !getPanelOpen()) return;
        /* [2A] While the editor is open Escape means "cancel the editor", never
         * "close the panel". A dirty editor arms the inline discard strip
         * instead of discarding silently. */
        if (EDITOR_PM.isOpen()) {
          e.stopPropagation();
          EDITOR_PM.cancel(STATE_PM.ui.root || UI_PM.getRoot());
          return;
        }
        /* [2C] A staged import is a confirmation the user has not answered yet.
         * Escape answers it with "no" — it cancels the import and writes
         * nothing — rather than closing the panel out from under it. */
        if (PORT_PM.isPending()) {
          e.stopPropagation();
          PORT_PM.cancelImport(STATE_PM.ui.root || UI_PM.getRoot());
          return;
        }
        closePanel();
      };
      D.addEventListener('keydown', onKey);
      CLEAN_addFn(() => D.removeEventListener('keydown', onKey));
    },
  };

  /* ───────────────────────────── 🟦 SURFACE — Events / Public API (spec-only) 📄🔒💧 ───────────────────────────── */
  // Public guarantees:
  // - window events: EV_PM_READY_V1, EV_PM_CHANGED_V1
  // - lifecycle entrypoints exist (boot/dispose) via MOD_OBJ.port if needed in future (not required now)

  /* ───────────────────────────── 🟧 BOUNDARIES — UI Mount / DOM Ops 📝🔓💥 ───────────────────────────── */
  const UI_PM = {
    selOwned(ui) { return `[${ATTR_CGXUI}="${ui}"][${ATTR_CGXUI_OWNER}="${SkID}"]`; },

    getRoot() { return DOM_q(UI_PM.selOwned(UI_PM_WRAP)); },

    ensureTooltip() {
      return SAFE_try('UI_PM.ensureTooltip', () => {
        let tip = DOM_q(UI_PM.selOwned(UI_PM_TOOLTIP));
        if (tip) return tip;

        tip = D.createElement('div');
        tip.setAttribute(ATTR_CGXUI, UI_PM_TOOLTIP);
        tip.setAttribute(ATTR_CGXUI_OWNER, SkID);
        tip.innerHTML = `<div class="cgxui-${SkID}--tip-title"></div><div class="cgxui-${SkID}--tip-body"></div>`;
        // The tooltip is created lazily, on first hover — long after boot and
        // after the theme observer's initial sweep. Stamp the host theme now, or
        // it renders with the media-query fallback until the next root-class
        // mutation (which may never come in a stable session).
        UI_PM_applyThemeToEl(tip);
        D.body.appendChild(tip);
        CLEAN_addNode(tip);
        return tip;
      }, null);
    },

    tooltipShow(e, title, body) {
      SAFE_try('UI_PM.tooltipShow', () => {
        const tip = STATE_PM.ui.tooltip || UI_PM.ensureTooltip();
        if (!tip) return;
        STATE_PM.ui.tooltip = tip;
        const t = tip.querySelector(`.cgxui-${SkID}--tip-title`);
        const b = tip.querySelector(`.cgxui-${SkID}--tip-body`);
        if (t) t.textContent = String(title || '');
        if (b) b.textContent = String(body || '');
        tip.style.display = 'block';
        UI_PM.tooltipMove(e);
      }, null);
    },
    tooltipMove(e) {
      SAFE_try('UI_PM.tooltipMove', () => {
        const tip = STATE_PM.ui.tooltip;
        if (!tip) return;
        const pad = CFG_PM.TOOLTIP_PAD;
        tip.style.left = `${(e?.clientX || 0) + pad}px`;
        tip.style.top = `${(e?.clientY || 0) + pad}px`;
      }, null);
    },
    tooltipHide() {
      SAFE_try('UI_PM.tooltipHide', () => {
        const tip = STATE_PM.ui.tooltip;
        if (!tip) return;
        tip.style.display = 'none';
      }, null);
    },

    ensureUI() {
      return SAFE_try('UI_PM.ensureUI', () => {
        try { D.querySelector(LEGACY_XPCH_PROMPT_EXPORT_SEL)?.remove?.(); } catch {}
        /* Route eligibility is the mount boundary, and it is checked before the
         * form. The composer also exists on `/g/<id>/project`, so form presence
         * alone must never authorise a mount — that is exactly how the chat-only
         * controls used to leak onto the Project surface. Callers must read a
         * null here together with VIEW_PM_isChatPath(): off a chat route this is
         * a deliberate refusal, not a mount failure to be retried. */
        if (!VIEW_PM_isChatPath()) return null;
        const form = DOM_getForm();
        if (!form) return null;

        const existing = UI_PM.getRoot();
        if (existing) return existing;

        const wrap = D.createElement('div');
        wrap.setAttribute(ATTR_CGXUI, UI_PM_WRAP);
        wrap.setAttribute(ATTR_CGXUI_OWNER, SkID);

        wrap.innerHTML = `
          <div ${ATTR_CGXUI}="${UI_PM_BTNBOX}" ${ATTR_CGXUI_OWNER}="${SkID}">
            <button type="button" ${ATTR_CGXUI}="${UI_PM_EXPORT_BTN}" ${ATTR_CGXUI_OWNER}="${SkID}" title="${CFG_PM.EXPORT_BTN_TITLE}">${CFG_PM.EXPORT_BTN_LABEL}</button>
            <button type="button" ${ATTR_CGXUI}="${UI_PM_BTN}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-controls="${A11Y_PM_PANEL_ID}" aria-expanded="false">Prompts</button>
            <div ${ATTR_CGXUI}="${UI_PM_QUICK_TRAY}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true"></div>
            <button type="button" ${ATTR_CGXUI}="${UI_PM_QUICK_MODE_DOT}" ${ATTR_CGXUI_OWNER}="${SkID}" title="Quick replies: append only">•</button>
          </div>

          <div ${ATTR_CGXUI}="${UI_PM_OVERLAY}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true"></div>

          <div id="${A11Y_PM_PANEL_ID}" role="region" aria-label="${A11Y_PM_PANEL_LABEL}" ${ATTR_CGXUI}="${UI_PM_PANEL}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true" inert>
            <div class="cgxui-${SkID}--status" ${ATTR_CGXUI}="${UI_PM_STATUS}" ${ATTR_CGXUI_OWNER}="${SkID}" role="status" aria-live="polite"></div>

            <div ${ATTR_CGXUI}="${UI_PM_MODE_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}">
              <div class="cgxui-${SkID}--top">
                <input class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_SEARCH_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="Search prompts…" />
                <label class="cgxui-${SkID}--btn" title="Auto-send after insert">
                  <input type="checkbox" ${ATTR_CGXUI}="${UI_PM_AUTOSEND_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}" style="margin-right:6px">Auto-send
                </label>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_SETTINGS}" ${ATTR_CGXUI_OWNER}="${SkID}">Settings</button>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_CLOSE_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}">Close</button>
              </div>

              <div ${ATTR_CGXUI}="${UI_PM_FILTER_ROW}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:flex; gap:6px; margin:4px 0 10px;">
                <button type="button" class="cgxui-${SkID}--chip cgxui-${SkID}--chip-active" ${ATTR_CGXUI}="${UI_PM_FILTER_ALL}" ${ATTR_CGXUI_OWNER}="${SkID}">All</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_PROMPTS}" ${ATTR_CGXUI_OWNER}="${SkID}">Prompts</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_APPEND}" ${ATTR_CGXUI_OWNER}="${SkID}">Append</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_FAVORITES}" ${ATTR_CGXUI_OWNER}="${SkID}">★ Favorites</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_QUICK}" ${ATTR_CGXUI_OWNER}="${SkID}">Quick</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_HISTORY}" ${ATTR_CGXUI_OWNER}="${SkID}">History</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_DRAFTS}" ${ATTR_CGXUI_OWNER}="${SkID}">Drafts</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_FILTER_PASTED}" ${ATTR_CGXUI_OWNER}="${SkID}">Pasted</button>
              </div>

              <div class="cgxui-${SkID}--list" ${ATTR_CGXUI}="${UI_PM_LIST_SIMPLE}" ${ATTR_CGXUI_OWNER}="${SkID}"></div>
            </div>

            <div ${ATTR_CGXUI}="${UI_PM_MODE_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:none">
              <div class="cgxui-${SkID}--top">
                <input class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_SEARCH_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="Search prompts…" />
                <label class="cgxui-${SkID}--btn" title="Auto-send after insert">
                  <input type="checkbox" ${ATTR_CGXUI}="${UI_PM_AUTOSEND_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}" style="margin-right:6px">Auto-send
                </label>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_BACK}" ${ATTR_CGXUI_OWNER}="${SkID}">Back</button>
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_CLOSE_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}">Close</button>
              </div>

              <div ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_ROW}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:flex; gap:6px; margin-bottom:8px;">
                <button type="button" class="cgxui-${SkID}--chip cgxui-${SkID}--chip-active" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_ALL}" ${ATTR_CGXUI_OWNER}="${SkID}">All</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_PROMPTS}" ${ATTR_CGXUI_OWNER}="${SkID}">Prompts</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_APPEND}" ${ATTR_CGXUI_OWNER}="${SkID}">Append</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_FAVORITES}" ${ATTR_CGXUI_OWNER}="${SkID}">★ Favorites</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_QUICK}" ${ATTR_CGXUI_OWNER}="${SkID}">Quick</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_HISTORY}" ${ATTR_CGXUI_OWNER}="${SkID}">History</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_DRAFTS}" ${ATTR_CGXUI_OWNER}="${SkID}">Drafts</button>
                <button type="button" class="cgxui-${SkID}--chip" ${ATTR_CGXUI}="${UI_PM_EDIT_FILTER_PASTED}" ${ATTR_CGXUI_OWNER}="${SkID}">Pasted</button>
              </div>

              <div class="cgxui-${SkID}--list" ${ATTR_CGXUI}="${UI_PM_LIST_EDIT}" ${ATTR_CGXUI_OWNER}="${SkID}"></div>

              <div class="cgxui-${SkID}--editor" ${ATTR_CGXUI}="${UI_PM_EDITOR}" ${ATTR_CGXUI_OWNER}="${SkID}">
                <div class="cgxui-${SkID}--ed-head" ${ATTR_CGXUI}="${UI_PM_ED_HEADING}" ${ATTR_CGXUI_OWNER}="${SkID}">Create prompt</div>

                <div class="cgxui-${SkID}--ed-row" ${ATTR_CGXUI}="${UI_PM_ED_TITLE_ROW}" ${ATTR_CGXUI_OWNER}="${SkID}">
                  <input class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_ED_TITLE}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="Title" aria-label="Prompt title" style="flex:1 1 auto" />
                </div>

                <div class="cgxui-${SkID}--ed-row" ${ATTR_CGXUI}="${UI_PM_ED_TYPE_ROW}" ${ATTR_CGXUI_OWNER}="${SkID}">
                  <span class="cgxui-${SkID}--ed-seg" role="group" aria-label="Prompt type">
                    <button type="button" ${ATTR_CGXUI}="${UI_PM_ED_TYPE_PROMPT}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-pressed="true">Prompt</button>
                    <button type="button" ${ATTR_CGXUI}="${UI_PM_ED_TYPE_APPEND}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-pressed="false">Append</button>
                  </span>
                  <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_ED_FAV}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-pressed="false" aria-label="Favourite">☆ Favourite</button>
                </div>

                <textarea class="cgxui-${SkID}--input" ${ATTR_CGXUI}="${UI_PM_ED_BODY}" ${ATTR_CGXUI_OWNER}="${SkID}" placeholder="Body…" aria-label="Prompt body"></textarea>

                <div class="cgxui-${SkID}--ed-row" ${ATTR_CGXUI}="${UI_PM_ED_DISCARD}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:none">
                  <span style="font-size:11px">Discard changes?</span>
                  <button type="button" class="cgxui-${SkID}--btn cgxui-${SkID}--ed-danger" ${ATTR_CGXUI}="${UI_PM_ED_DISCARD_YES}" ${ATTR_CGXUI_OWNER}="${SkID}">Discard</button>
                  <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_ED_DISCARD_NO}" ${ATTR_CGXUI_OWNER}="${SkID}">Keep editing</button>
                </div>

                <div class="cgxui-${SkID}--ed-row">
                  <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_ED_SAVE}" ${ATTR_CGXUI_OWNER}="${SkID}">Save</button>
                  <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_ED_CANCEL}" ${ATTR_CGXUI_OWNER}="${SkID}">Cancel</button>
                  <span style="flex:1 1 auto"></span>
                  <button type="button" class="cgxui-${SkID}--btn cgxui-${SkID}--ed-danger" ${ATTR_CGXUI}="${UI_PM_ED_DELETE}" ${ATTR_CGXUI_OWNER}="${SkID}">Delete</button>
                </div>
              </div>

              <div style="border-top:1px solid var(--cgxui-${SkID}-border); margin-top:10px; padding-top:10px; display:grid; gap:6px;">
                <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_NEW_BTN}" ${ATTR_CGXUI_OWNER}="${SkID}">New prompt</button>

                <div ${ATTR_CGXUI}="${UI_PM_PORT_ROW}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:flex; gap:6px;">
                  <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_EXPORT_LIB}" ${ATTR_CGXUI_OWNER}="${SkID}" title="Download Prompts and Quick Replies as a JSON file">Export library</button>
                  <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_IMPORT_BTN}" ${ATTR_CGXUI_OWNER}="${SkID}" title="Load Prompts and Quick Replies from a JSON file">Import library</button>
                  <input type="file" accept="application/json,.json" ${ATTR_CGXUI}="${UI_PM_IMPORT_FILE}" ${ATTR_CGXUI_OWNER}="${SkID}" aria-hidden="true" tabindex="-1" style="display:none" />
                </div>

                <div ${ATTR_CGXUI}="${UI_PM_IMPORT_BOX}" ${ATTR_CGXUI_OWNER}="${SkID}" style="display:none">
                  <div ${ATTR_CGXUI}="${UI_PM_IMPORT_SUMMARY}" ${ATTR_CGXUI_OWNER}="${SkID}" style="font-size:11px; white-space:pre-line; margin-bottom:6px;"></div>
                  <div style="display:flex; gap:6px;">
                    <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_IMPORT_MERGE}" ${ATTR_CGXUI_OWNER}="${SkID}">Merge</button>
                    <button type="button" class="cgxui-${SkID}--btn cgxui-${SkID}--ed-danger" ${ATTR_CGXUI}="${UI_PM_IMPORT_REPLACE}" ${ATTR_CGXUI_OWNER}="${SkID}">Replace</button>
                    <button type="button" class="cgxui-${SkID}--btn" ${ATTR_CGXUI}="${UI_PM_IMPORT_CANCEL}" ${ATTR_CGXUI_OWNER}="${SkID}">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `.trim();

        // Mount in body as a floating layer so composer re-renders do not remount/move us.
        (D.body || D.documentElement).appendChild(wrap);
        CLEAN_addNode(wrap);
        return wrap;
      }, null);
    },
  };

  /* ───────────────────────────── 🎨 THEME — Host-theme authority 📝🔓💥 ─────────────────────────────
   * ChatGPT's theme is a class on <html>; the OS `prefers-color-scheme` can
   * disagree with it. Read the host, stamp an owned token on our own nodes, and
   * let the CSS token block win over the media-query fallback. */
  /* Authority rule:
   *   root classList has 'dark'          → 'dark'
   *   root classList exists, no 'dark'   → 'light'
   *   root classList unavailable         → '' (media-query fallback)
   *
   * Light is deliberately the DEFAULT once the host root is readable, rather
   * than requiring an explicit 'light' class. Nothing in this repository or in
   * any live capture proves ChatGPT always marks light mode with a class, and
   * requiring one would silently drop us back to `prefers-color-scheme` — the
   * exact OS-vs-page mismatch this authority exists to remove. Only a genuinely
   * unreadable root (no documentElement/classList) falls back. */
  const UI_PM_detectHostTheme = () => SAFE_try('UI_PM.detectHostTheme', () => {
    const cl = D.documentElement?.classList;
    if (!cl || typeof cl.contains !== 'function') return '';
    return cl.contains('dark') ? 'dark' : 'light';
  }, '');

  /* Applies the CURRENT host theme to exactly one owned element. Deliberately
   * flat — no call back into UI_PM_applyTheme — so newly created owned nodes
   * (the lazily mounted tooltip) can be stamped at creation time without any
   * recursion between the two helpers. */
  const UI_PM_applyThemeToEl = (el, themeArg) => SAFE_try('UI_PM.applyThemeToEl', () => {
    if (!el || typeof el.setAttribute !== 'function') return '';
    const theme = (themeArg === undefined) ? UI_PM_detectHostTheme() : themeArg;
    if (theme) el.setAttribute(ATTR_CGXUI_THEME, theme);
    else el.removeAttribute?.(ATTR_CGXUI_THEME);
    return theme;
  }, '');

  const UI_PM_applyTheme = () => SAFE_try('UI_PM.applyTheme', () => {
    const theme = UI_PM_detectHostTheme();
    // Stamp every owned root: the wrap, and the tooltip which lives on <body>.
    // Detected once and passed down, so one sweep cannot straddle a theme flip.
    const targets = [
      STATE_PM.ui.root || UI_PM.getRoot(),
      STATE_PM.ui.tooltip || DOM_q(SEL_PM.UI_TOOLTIP()),
    ];
    for (const el of targets) {
      if (!el) continue;
      UI_PM_applyThemeToEl(el, theme);
    }
    return theme;
  }, '');

  const UI_PM_installThemeObserver = () => SAFE_try('UI_PM.installThemeObserver', () => {
    if (PM_THEME_OBS) return;
    const rootEl = D.documentElement;
    if (!rootEl || typeof MutationObserver !== 'function') return;
    UI_PM_applyTheme();
    PM_THEME_OBS = new MutationObserver(() => { UI_PM_applyTheme(); });
    try { PM_THEME_OBS.observe(rootEl, { attributes: true, attributeFilter: ['class'] }); } catch {}
    CLEAN_addObs(PM_THEME_OBS);
    CLEAN_addFn(() => {
      try { PM_THEME_OBS?.disconnect?.(); } catch {}
      PM_THEME_OBS = null;
    });
  }, null);

  /* ───────────────────────────── 🪟 PANEL STATE — single authority 📝🔓💥 ─────────────────────────────
   * One function owns open class, visibility, inert and aria-hidden together so
   * they can never disagree. Public API methods call these directly rather than
   * synthesising a button click through the 220 ms human click timer. */
  const UI_PM_panelNodes = () => {
    const root = STATE_PM.ui.root || UI_PM.getRoot();
    if (!root) return { root: null, panel: null, overlay: null };
    const panel = (STATE_PM.ui.panel && D.contains(STATE_PM.ui.panel))
      ? STATE_PM.ui.panel
      : DOM_q(UI_PM.selOwned(UI_PM_PANEL), root);
    const overlay = (STATE_PM.ui.overlay && D.contains(STATE_PM.ui.overlay))
      ? STATE_PM.ui.overlay
      : DOM_q(UI_PM.selOwned(UI_PM_OVERLAY), root);
    return { root, panel, overlay };
  };

  const UI_PM_isPanelOpen = () => {
    const { panel } = UI_PM_panelNodes();
    return !!panel?.classList?.contains(UI_PM_CLS_OPEN);
  };

  /* Applies `open` and returns the resulting open-state. */
  const UI_PM_applyPanelState = (open) => SAFE_try('UI_PM.applyPanelState', () => {
    const { root, panel, overlay } = UI_PM_panelNodes();
    if (!panel) return false;
    const on = !!open;
    panel.classList.toggle(UI_PM_CLS_OPEN, on);
    panel.setAttribute('aria-hidden', on ? 'false' : 'true');
    // inert must be cleared before any focus attempt, and set whenever closed.
    if (on) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
    overlay?.classList?.toggle?.(UI_PM_CLS_OVSHOW, on);
    /* [A11Y] aria-expanded is synchronised HERE, in the one function that
     * already owns the open class, aria-hidden, inert and the overlay, so the
     * disclosure state cannot drift from the visual state. Doing it at the call
     * sites would mean nine places to keep in agreement — including the route
     * suppression path, which closes the panel without going through
     * UI_PM_closePanel and would otherwise leave the trigger claiming the panel
     * is still open. */
    const trigger = root ? DOM_q(UI_PM.selOwned(UI_PM_BTN), root) : null;
    trigger?.setAttribute?.('aria-expanded', on ? 'true' : 'false');
    /* [A11Y] Any close drops the captured origin. UI_PM_closePanel has already
     * taken its local copy before calling in, so an explicit close still
     * restores; a route-suppressed close simply forgets, which prevents both a
     * stale restoration later and a retained reference to a detached node. */
    if (!on) PM_FOCUS_ORIGIN = null;
    return on;
  }, false);

  /* [A11Y] Focus-restoration authority.
   *
   * A module-scope reference, never a selector and never persisted: the element
   * that owned focus immediately before the panel opened. It is INTERNAL — not
   * on the public API, not in storage, not in diagnostics.
   *
   * Captured only on a real CLOSED -> OPEN transition, so re-opening an already
   * open panel, focusSearch() on an open panel, a re-render, or the editor
   * taking focus afterwards can never overwrite the legitimate origin. */
  let PM_FOCUS_ORIGIN = null;

  /* The smallest truthful focusability guard for PM's actual controls — not an
   * attempt at the full HTML algorithm. Anything uncertain is rejected, because
   * declining to restore is always safer than focusing the wrong thing. */
  const A11Y_PM_canFocus = (el, panel) => SAFE_try('A11Y_PM.canFocus', () => {
    if (!el || typeof el.focus !== 'function') return false;
    if (el === D.body || el === D.documentElement) return false;
    if (!D.contains(el)) return false;                       // detached
    if (panel && (el === panel || panel.contains?.(el))) return false; // inside the panel being hidden
    if (el.disabled === true) return false;
    for (let cur = el; cur; cur = cur.parentElement) {
      if (cur.hasAttribute?.('inert')) return false;
      if (cur.getAttribute?.('aria-hidden') === 'true') return false;
    }
    return DOM_isVisible(el);
  }, false);

  const PM_DOCK_getApi = () => W.H2O?.InputDock?.api || null;

  const PM_DOCK_enable = (root, api) => {
    if (!root || !api || typeof api.register !== 'function') return false;
    DOM_setStateToken(root, DOCK_PM.STATE_DOCK, true);
    STATE_PM.ui.dockMode = true;
    root.style.left = 'auto';
    root.style.top = 'auto';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    const ok = !!api.register({
      id: DOCK_PM.REG_TOP,
      slot: 'top',
      el: root,
      mode: 'move',
      pin: 'prepend',
      order: 220,
    });
    STATE_PM.ui.dockRegActive = ok;
    if (!ok) {
      DOM_setStateToken(root, DOCK_PM.STATE_DOCK, false);
      STATE_PM.ui.dockMode = false;
    }
    return ok;
  };

  const PM_DOCK_disable = (root, apiRaw) => {
    const api = apiRaw || PM_DOCK_getApi();
    if (api && typeof api.unregister === 'function') {
      SAFE_try('PM_DOCK.disable.unregister', () => api.unregister(DOCK_PM.REG_TOP), null);
    }
    if (root) {
      DOM_setStateToken(root, DOCK_PM.STATE_DOCK, false);
    }
    STATE_PM.ui.dockMode = false;
    STATE_PM.ui.dockRegActive = false;
  };

  const PM_DOCK_sync = (root = (STATE_PM.ui.root || UI_PM.getRoot())) => {
    if (!root) return false;
    if (!VIEW_PM_shouldShow()) {
      PM_DOCK_disable(root);
      root.style.display = 'none';
      return false;
    }
    root.style.display = '';
    const api = PM_DOCK_getApi();
    const canDock = !!(
      api &&
      typeof api.ready === 'function' &&
      typeof api.register === 'function' &&
      typeof api.unregister === 'function' &&
      api.ready()
    );
    if (!canDock) {
      if (STATE_PM.ui.dockMode || STATE_PM.ui.dockRegActive) PM_DOCK_disable(root, api);
      return false;
    }
    try {
      const topSlot = api.getSlot?.('top');
      if (
        STATE_PM.ui.dockMode &&
        STATE_PM.ui.dockRegActive &&
        topSlot &&
        root.parentElement === topSlot
      ) return true;
    } catch {}
    const ok = PM_DOCK_enable(root, api);
    if (!ok) {
      PM_DOCK_disable(root, api);
      return false;
    }
    return true;
  };

  const PM_DOCK_installBridge = () => {
    if (STATE_PM.ui.dockBridgeWired) return;
    STATE_PM.ui.dockBridgeWired = true;

    const syncSoon = () => {
      W.requestAnimationFrame(() => {
        if (!STATE_PM.booted) return;
        const root = STATE_PM.ui.root || UI_PM.getRoot();
        const ok = PM_DOCK_sync(root);
        if (!ok && root) UI_PM_scheduleFloatingLayout(root);
      });
    };

    W.addEventListener(EV_INPUT_DOCK_READY, syncSoon, { passive: true });
    W.addEventListener('popstate', syncSoon, { passive: true });
    W.addEventListener('pageshow', syncSoon, { passive: true });
    CLEAN_addFn(() => W.removeEventListener(EV_INPUT_DOCK_READY, syncSoon));
    CLEAN_addFn(() => W.removeEventListener('popstate', syncSoon));
    CLEAN_addFn(() => W.removeEventListener('pageshow', syncSoon));

    let tries = 0;
    let warmTimer = 0;
    warmTimer = CLEAN_setInterval(() => {
      if (!STATE_PM.booted) {
        CLEAN_clearInterval(warmTimer);
        return;
      }
      tries += 1;
      const root = STATE_PM.ui.root || UI_PM.getRoot();
      const ok = PM_DOCK_sync(root);
      if (!ok && root) UI_PM_scheduleFloatingLayout(root);
      if (ok || tries >= 80) CLEAN_clearInterval(warmTimer);
    }, 250);
    CLEAN_addFn(() => CLEAN_clearInterval(warmTimer));
  };

  function UI_PM_placeFloatingRoot(root) {
    SAFE_try('UI_PM.placeFloatingRoot', () => {
      if (!root || !D.contains(root)) return;
      if (!VIEW_PM_shouldShow()) {
        root.style.display = 'none';
        UI_PM_applyPanelState(false);
        return;
      }
      root.style.display = '';
      const btnBox = DOM_q(UI_PM.selOwned(UI_PM_BTNBOX), root);
      if (!btnBox) return;
      if (STATE_PM.ui.dockMode) {
        btnBox.style.display = 'flex';
        root.style.left = 'auto';
        root.style.top = 'auto';
        root.style.right = 'auto';
        root.style.bottom = 'auto';
        return;
      }

      const anchor = DOM_getComposerAnchorRect();
      if (!anchor || anchor.width <= 0 || anchor.height <= 0) {
        btnBox.style.display = 'none';
        return;
      }
      if (anchor.bottom <= 0 || anchor.top >= W.innerHeight) {
        btnBox.style.display = 'none';
        return;
      }

      btnBox.style.display = 'flex';

      const vvTop = W.visualViewport?.offsetTop || 0;
      const vvLeft = W.visualViewport?.offsetLeft || 0;

      const desiredTop = Math.round(anchor.top + vvTop - CFG_PM.FLOAT_TOP_GAP_Y);
      const mirroredLeftInset = DOM_getMirroredNavRightInset(anchor);
      const desiredLeft = Math.round(anchor.left + vvLeft + mirroredLeftInset);

      const bw = Math.max(50, btnBox.getBoundingClientRect().width || 0);
      const left = Math.min(Math.max(6, desiredLeft), Math.max(6, W.innerWidth - bw - 6));
      const safeTop = Math.max(6, vvTop + CFG_PM.FLOAT_MIN_TOP_SAFE_Y);
      const top = Math.max(safeTop, desiredTop);

      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }, null);
  }

  function UI_PM_scheduleFloatingLayout(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
    if (!root) return;
    if (STATE_PM.ui.dockMode) return;
    if (PM_LAYOUT_RAF) return;
    PM_LAYOUT_RAF = W.requestAnimationFrame(() => {
      PM_LAYOUT_RAF = 0;
      UI_PM_placeFloatingRoot(root);
    });
  }

  /* ───────────────────────────── 🟥 ENGINE — UI Rendering 📝🔓💥 ───────────────────────────── */
  const RENDER_PM = {
    setMode(root, mode) {
      SAFE_try('RENDER_PM.setMode', () => {
        const m = (mode === 'edit') ? 'edit' : 'simple';
        ENGINE_PM.setUiMode(m);

        const simple = DOM_q(UI_PM.selOwned(UI_PM_MODE_SIMPLE), root);
        const edit = DOM_q(UI_PM.selOwned(UI_PM_MODE_EDIT), root);
        if (simple) simple.style.display = (m === 'simple') ? 'block' : 'none';
        if (edit) edit.style.display = (m === 'edit') ? 'block' : 'none';
      }, null);
    },

    flashMoved(el) {
      SAFE_try('RENDER_PM.flashMoved', () => {
        if (!el) return;
        el.classList.remove(`cgxui-${SkID}--moved`);
        void el.offsetWidth;
        el.classList.add(`cgxui-${SkID}--moved`);
      }, null);
    },

    setSimpleFilter(root, type) {
      STATE_PM.ui.simpleTypeFilter = type;
      const map = [
        [UI_PM_FILTER_ALL, 'all'],
        [UI_PM_FILTER_PROMPTS, 'prompt'],
        [UI_PM_FILTER_APPEND, 'append'],
        [UI_PM_FILTER_FAVORITES, 'favorites'],
        [UI_PM_FILTER_QUICK, 'quick'],
        [UI_PM_FILTER_HISTORY, 'history'],
        [UI_PM_FILTER_DRAFTS, 'draft'],
        [UI_PM_FILTER_PASTED, 'pasted'],
      ];
      for (const [ui, t] of map) {
        const b = DOM_q(UI_PM.selOwned(ui), root);
        if (b) b.classList.toggle(`cgxui-${SkID}--chip-active`, t === type);
      }
    },

    setEditCategory(root, type) {
      STATE_PM.ui.editCategory = type;
      const map = [
        [UI_PM_EDIT_FILTER_ALL, 'all'],
        [UI_PM_EDIT_FILTER_PROMPTS, 'prompt'],
        [UI_PM_EDIT_FILTER_APPEND, 'append'],
        [UI_PM_EDIT_FILTER_FAVORITES, 'favorites'],
        [UI_PM_EDIT_FILTER_QUICK, 'quick'],
        [UI_PM_EDIT_FILTER_HISTORY, 'history'],
        [UI_PM_EDIT_FILTER_DRAFTS, 'draft'],
        [UI_PM_EDIT_FILTER_PASTED, 'pasted'],
      ];
      for (const [ui, t] of map) {
        const b = DOM_q(UI_PM.selOwned(ui), root);
        if (b) b.classList.toggle(`cgxui-${SkID}--chip-active`, t === type);
      }
    },

    renderQuickTray(root) {
      SAFE_try('RENDER_PM.renderQuickTray', () => {
        const tray = DOM_q(UI_PM.selOwned(UI_PM_QUICK_TRAY), root);
        if (!tray) return;

        const items = (STATE_PM.data.quick || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        tray.innerHTML = items.map(q => `
          <button type="button" ${ATTR_CGXUI}="${SkID}-quick-bubble" ${ATTR_CGXUI_OWNER}="${SkID}" data-id="${UTIL_escapeHtml(q.id)}">
            ${UTIL_escapeHtml(q.text)}
          </button>
        `.trim()).join('');
      }, null);
    },

    renderSimple(root, filter) {
      SAFE_try('RENDER_PM.renderSimple', () => {
        const list = DOM_q(UI_PM.selOwned(UI_PM_LIST_SIMPLE), root);
        if (!list) return;

        const q = String(filter || '').trim().toLowerCase();
        const mode = STATE_PM.ui.simpleTypeFilter;

        // Quick
        if (mode === 'quick') {
          const items = (STATE_PM.data.quick || [])
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter(it => !q || String(it.text || '').toLowerCase().includes(q));

          if (items.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No quick replies yet. Open Settings → Quick to add.</div>`;
            return;
          }

          list.innerHTML = items.map(it => `
            <div class="cgxui-${SkID}--item" data-qid="${UTIL_escapeHtml(it.id)}">
              <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(it.text)}</span></div>
            </div>
          `.trim()).join('');
          return;
        }

        // History
        if (mode === 'history') {
          // Display-only sent view, addressed by OCCURRENCE. Each card carries
          // its verified full-collection index alongside the id, because ids are
          // not unique: a hidden pending draft — or another sent row — can share
          // one, and an id-only lookup would resolve the wrong record.
          const history = ENGINE_PM.sentHistoryEntries()
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          if (history.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No history yet. Send a message and it will appear here.</div>`;
            return;
          }

          list.innerHTML = history.map(({ item: h, fullIndex, snapshot }) => {
            const t = String(h.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-hid="${UTIL_escapeHtml(h.id)}" data-hidx="${UTIL_escapeHtml(String(fullIndex))}" data-hsnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                <div class="cgxui-${SkID}--actions">
                  <button type="button" class="cgxui-${SkID}--btn" data-hact="insert">Insert</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-hact="prompt">+Prompt</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-hact="append">+Append</button>
                </div>
              </div>
            `.trim();
          }).join('');
          return;
        }

        // Drafts
        if (mode === 'draft') {
          // Occurrence entries derived from the FULL collection BEFORE sorting or
          // filtering, so each card keeps its original full index and exact snapshot.
          const drafts = ENGINE_PM.captureEntries(ENGINE_PM.loadDrafts())
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          if (drafts.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No drafts yet. Unsent text is saved when you close or reload the page.</div>`;
            return;
          }

          list.innerHTML = drafts.map(({ item: d, fullIndex, snapshot }) => {
            const t = String(d.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-did="${UTIL_escapeHtml(d.id)}" data-didx="${UTIL_escapeHtml(String(fullIndex))}" data-dsnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                <div class="cgxui-${SkID}--actions">
                  <button type="button" class="cgxui-${SkID}--btn" data-dact="insert">Insert</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-dact="prompt">+Prompt</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-dact="append">+Append</button>
                </div>
              </div>
            `.trim();
          }).join('');
          return;
        }

        // Pasted
        if (mode === 'pasted') {
          // Occurrence entries derived from the FULL collection BEFORE sorting or
          // filtering, so each card keeps its original full index and exact snapshot.
          const pasted = ENGINE_PM.captureEntries(ENGINE_PM.loadPasted())
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          if (pasted.length === 0) {
            list.innerHTML = `<div class="cgxui-${SkID}--prev" style="text-align:center">No pasted text yet. Paste in the input bar and it will appear here.</div>`;
            return;
          }

          list.innerHTML = pasted.map(({ item: p, fullIndex, snapshot }) => {
            const t = String(p.text || '');
            const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
            return `
              <div class="cgxui-${SkID}--item" data-pstid="${UTIL_escapeHtml(p.id)}" data-pidx="${UTIL_escapeHtml(String(fullIndex))}" data-psnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                <div class="cgxui-${SkID}--actions">
                  <button type="button" class="cgxui-${SkID}--btn" data-pact="insert">Insert</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-pact="prompt">+Prompt</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-pact="append">+Append</button>
                </div>
              </div>
            `.trim();
          }).join('');
          return;
        }

        // Prompts/Append/Favorites/All — [2B] one shared selection+ranking path
        const view = ENGINE_PM_selectPromptView(STATE_PM.data.prompts, mode, q, UTIL_now());
        const items = view.map(v => v.prompt);

        if (items.length === 0) {
          list.innerHTML = RENDER_PM_promptEmptyHtml(STATE_PM.data.prompts, q, mode);
          return;
        }

        list.innerHTML = items.map(p => RENDER_PM_promptCard(p, { mode: 'simple' })).join('');
        RENDER_PM_bindPromptTooltips(list, items);
      }, null);
    },

    renderEdit(root, filter) {
      SAFE_try('RENDER_PM.renderEdit', () => {
        const list = DOM_q(UI_PM.selOwned(UI_PM_LIST_EDIT), root);
        const newBtn = DOM_q(UI_PM.selOwned(UI_PM_NEW_BTN), root);
        if (!list) return;

        /* [2A] The old inline add-form is gone; creation now runs through
         * EDITOR_PM. This only sets the affordance for the active category. */
        const setNewBtn = (label, enabled) => {
          if (!newBtn) return;
          newBtn.textContent = label;
          newBtn.disabled = !enabled;
          newBtn.title = enabled ? label : 'Recorded automatically — no manual add';
        };

        const q = String(filter || '').trim().toLowerCase();
        const cat = STATE_PM.ui.editCategory;

        // Quick manage
        if (cat === 'quick') {
          const items = (STATE_PM.data.quick || [])
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter(it => !q || String(it.text || '').toLowerCase().includes(q));

          list.innerHTML = (items.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No quick replies yet. Add one below.</div>`
            : items.map(it => `
              <div class="cgxui-${SkID}--item" data-qid="${UTIL_escapeHtml(it.id)}">
                <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(it.text)}</span></div>
                <div class="cgxui-${SkID}--actions">
                  <button type="button" class="cgxui-${SkID}--btn" data-qact="edit">Edit</button>
                  <button type="button" class="cgxui-${SkID}--btn" data-qact="delete">Delete</button>
                </div>
              </div>
            `.trim()).join('');

          setNewBtn('New quick reply', true);
          return;
        }

        // History manage
        if (cat === 'history') {
          // Display-only sent view, addressed by OCCURRENCE (see renderSimple).
          const history = ENGINE_PM.sentHistoryEntries()
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          list.innerHTML = (history.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No history yet. Messages you send will appear here automatically.</div>`
            : history.map(({ item: h, fullIndex, snapshot }) => {
              const t = String(h.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-hid="${UTIL_escapeHtml(h.id)}" data-hidx="${UTIL_escapeHtml(String(fullIndex))}" data-hsnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                  <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                  <div class="cgxui-${SkID}--actions">
                    <button type="button" class="cgxui-${SkID}--btn" data-hact="insert">Insert</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-hact="prompt">+Prompt</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-hact="append">+Append</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-hact="delete">Delete</button>
                  </div>
                </div>
              `.trim();
            }).join('');

          setNewBtn('New prompt', false);
          return;
        }

        // Drafts manage
        if (cat === 'draft') {
          // Occurrence entries derived from the FULL collection BEFORE sorting or
          // filtering, so each card keeps its original full index and exact snapshot.
          const drafts = ENGINE_PM.captureEntries(ENGINE_PM.loadDrafts())
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          list.innerHTML = (drafts.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No drafts yet. Unsent text is saved when you close or reload the page.</div>`
            : drafts.map(({ item: d, fullIndex, snapshot }) => {
              const t = String(d.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-did="${UTIL_escapeHtml(d.id)}" data-didx="${UTIL_escapeHtml(String(fullIndex))}" data-dsnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                  <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                  <div class="cgxui-${SkID}--actions">
                    <button type="button" class="cgxui-${SkID}--btn" data-dact="insert">Insert</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-dact="prompt">+Prompt</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-dact="append">+Append</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-dact="delete">Delete</button>
                  </div>
                </div>
              `.trim();
            }).join('');

          setNewBtn('New prompt', false);
          return;
        }

        // Pasted manage
        if (cat === 'pasted') {
          // Occurrence entries derived from the FULL collection BEFORE sorting or
          // filtering, so each card keeps its original full index and exact snapshot.
          const pasted = ENGINE_PM.captureEntries(ENGINE_PM.loadPasted())
            .slice()
            .sort((a, b) => (b.item.createdAt || 0) - (a.item.createdAt || 0))
            .filter(e => !q || String(e.item.text || '').toLowerCase().includes(q));

          list.innerHTML = (pasted.length === 0)
            ? `<div class="cgxui-${SkID}--prev" style="text-align:center">No pasted text yet. Paste in the input bar and it will appear here.</div>`
            : pasted.map(({ item: p, fullIndex, snapshot }) => {
              const t = String(p.text || '');
              const preview = (t.length > 120) ? (t.slice(0, 120) + '…') : t;
              return `
                <div class="cgxui-${SkID}--item" data-pstid="${UTIL_escapeHtml(p.id)}" data-pidx="${UTIL_escapeHtml(String(fullIndex))}" data-psnap="${UTIL_escapeHtml(JSON.stringify(snapshot))}">
                  <div class="cgxui-${SkID}--title"><span>${UTIL_escapeHtml(preview)}</span></div>
                  <div class="cgxui-${SkID}--actions">
                    <button type="button" class="cgxui-${SkID}--btn" data-pact="insert">Insert</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-pact="prompt">+Prompt</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-pact="append">+Append</button>
                    <button type="button" class="cgxui-${SkID}--btn" data-pact="delete">Delete</button>
                  </div>
                </div>
              `.trim();
            }).join('');

          setNewBtn('New prompt', false);
          return;
        }

        // Prompts/Append/Favorites/All — [2B] identical selection to Simple
        const view = ENGINE_PM_selectPromptView(STATE_PM.data.prompts, cat, q, UTIL_now());
        const items = view.map(v => v.prompt);

        list.innerHTML = (items.length === 0)
          ? RENDER_PM_promptEmptyHtml(STATE_PM.data.prompts, q, cat)
          : items.map(p => RENDER_PM_promptCard(p, { mode: 'edit' })).join('');

        /* [2B-fix] Manual reorder only makes sense while the rendered sequence IS
         * the manual sequence. This is a POST-RENDER control-state pass on purpose:
         * the shared Phase-2A card builder stays byte-identical, and the buttons
         * stay in the DOM (disabled, with an explanation) rather than disappearing
         * and shifting the card layout under the user. */
        RENDER_PM_applyReorderAvailability(list, items, cat, q, UTIL_now());

        setNewBtn('New prompt', true);
        RENDER_PM_bindPromptTooltips(list, items);
      }, null);
    },
  };

  /* ───────────────────────────── 🔎 SEARCH — canonical query 📝🔓💥 ─────────────────────────────
   * Neither DOM input owns the query. Both mirror STATE_PM.ui.searchQuery, so
   * switching modes can never leave one pane filtered by a value the visible
   * box does not show. */
  const SEARCH_PM = {
    get() { return String(STATE_PM.ui.searchQuery || ''); },

    inputFor(mode, root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      if (!root) return null;
      const token = (mode === 'edit') ? UI_PM_SEARCH_EDIT : UI_PM_SEARCH_SIMPLE;
      return DOM_q(UI_PM.selOwned(token), root);
    },

    activeInput(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      return SEARCH_PM.inputFor(ENGINE_PM.getUiMode(), root);
    },

    /* Push the canonical value into both inputs. `except` skips the element the
     * user is typing in so the caret is never disturbed. */
    /* [2B] Debounced rerender. set() above stays synchronous, so both boxes
     * mirror the canonical query on the very keystroke that produced it; only
     * the expensive list rebuild waits. ONE owned timer: a newer keystroke
     * cancels the pending render rather than queueing a second one, so timers
     * cannot accumulate and disposal drains the single outstanding entry.
     * Programmatic paths (mode switch, filter chip) still render synchronously. */
    cancelRender() {
      if (STATE_PM.ui.searchRenderTimer) {
        CLEAN_clearTimeout(STATE_PM.ui.searchRenderTimer);
        STATE_PM.ui.searchRenderTimer = 0;
      }
    },
    scheduleRender(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
      SEARCH_PM.cancelRender();
      STATE_PM.ui.searchRenderTimer = CLEAN_setTimeout(() => {
        STATE_PM.ui.searchRenderTimer = 0;
        UI_PM_renderBoth(root);
      }, PM_SEARCH_RENDER_MS);
      return true;
    },

    syncInputs(root = (STATE_PM.ui.root || UI_PM.getRoot()), except = null) {
      SAFE_try('SEARCH_PM.syncInputs', () => {
        if (!root) return;
        const value = SEARCH_PM.get();
        for (const token of [UI_PM_SEARCH_SIMPLE, UI_PM_SEARCH_EDIT]) {
          const el = DOM_q(UI_PM.selOwned(token), root);
          if (!el || el === except) continue;
          if (el.value !== value) el.value = value;
        }
      }, null);
    },

    set(value, root = (STATE_PM.ui.root || UI_PM.getRoot()), except = null) {
      STATE_PM.ui.searchQuery = String(value == null ? '' : value);
      SEARCH_PM.syncInputs(root, except);
      return STATE_PM.ui.searchQuery;
    },
  };

  /* ───────────────────────────── 🪟 PANEL — open/close (module scope) 📝🔓💥 ─────────────────────────────
   * Defined here (not inside boot) so the public API can drive real state
   * synchronously instead of synthesising a click. */
  function UI_PM_renderBoth(root = (STATE_PM.ui.root || UI_PM.getRoot())) {
    if (!root) return;
    const q = SEARCH_PM.get();
    RENDER_PM.renderSimple(root, q);
    RENDER_PM.renderEdit(root, q);
  }

  function UI_PM_openPanel(opts) {
    const root = STATE_PM.ui.root || UI_PM.getRoot();
    if (!root) return false;
    const { panel } = UI_PM_panelNodes();
    if (!panel) return false;

    /* [A11Y] Capture the focus origin BEFORE the opening lifecycle moves focus,
     * and only on a genuine CLOSED -> OPEN transition. Re-opening an already
     * open panel must not overwrite the origin with something the panel itself
     * focused. */
    if (!UI_PM_isPanelOpen()) {
      PM_FOCUS_ORIGIN = SAFE_try('A11Y_PM.captureOrigin', () => D.activeElement || null, null);
    }

    // State first: inert/visibility must be lifted before rendering or focusing.
    UI_PM_applyPanelState(true);

    const mode = ENGINE_PM.getUiMode();
    RENDER_PM.setMode(root, mode);
    SEARCH_PM.syncInputs(root);
    UI_PM_renderBoth(root);

    /* [2A-fix B] If an editor was open when the panel closed, restore it rather
     * than presenting the list. restore() makes Edit mode authoritative first,
     * so the editor can never be left hidden behind the Simple list. */
    const editorRestored = EDITOR_PM.restore(root);
    /* [2A-fix F] After the status node exists and the editor has been restored,
     * re-apply any persistent error. Order matters: restore() is a recovery
     * step, not a user action, so it leaves the authority alone — only
     * EDITOR_PM.open() and an explicit hide() are allowed to clear it. */
    FEEDBACK_PM.restore(root);

    if (opts?.focus !== false) {
      SAFE_try('UI_PM.openPanel.focus', () => {
        if (editorRestored) { EDITOR_PM.focusPrimary(root); return; }
        SEARCH_PM.activeInput(root)?.focus?.();
      }, null);
    }
    return UI_PM_isPanelOpen();
  }

  /* [A11Y] Explicit, user-directed close: Escape, the Close buttons, the
   * overlay click, and the public close/toggle. This is the ONLY path that
   * restores focus.
   *
   * Route-driven suppression calls UI_PM_applyPanelState(false) directly and
   * therefore never reaches this function — which is the whole point. Restoring
   * focus during a chat -> Project navigation would either focus a control that
   * is disappearing with the old route or steal focus from the surface the user
   * just navigated to. The existing split between closePanel() and
   * applyPanelState(false) already draws that boundary, so no restoreFocus
   * option is needed. */
  function UI_PM_closePanel() {
    const { panel } = UI_PM_panelNodes();
    if (!panel) return false;
    const origin = PM_FOCUS_ORIGIN;
    PM_FOCUS_ORIGIN = null;          // cleared before restoring: one use, never stale
    UI_PM_applyPanelState(false);
    const closed = !UI_PM_isPanelOpen();
    if (closed) A11Y_PM_restoreFocus(origin, panel);
    return closed;
  }

  /* Restore to the captured origin when it is still safe, else the PM trigger,
   * else nothing. The composer is deliberately NOT a fallback: focusing it
   * would move the caret and change what the user is editing. */
  const A11Y_PM_restoreFocus = (origin, panel) => SAFE_try('A11Y_PM.restoreFocus', () => {
    if (A11Y_PM_canFocus(origin, panel)) { origin.focus(); return true; }
    const root = STATE_PM.ui.root || UI_PM.getRoot();
    const trigger = root ? DOM_q(UI_PM.selOwned(UI_PM_BTN), root) : null;
    if (A11Y_PM_canFocus(trigger, panel)) { trigger.focus(); return true; }
    return false;
  }, false);

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING 📝🔓💥 ───────────────────────────── */
  function CORE_PM_scheduleBootRetry(delayMs = 240) {
    if (STATE_PM.booted) return;
    if (PM_BOOT_RETRY_TIMER) return;
    const wait = Math.max(80, Number(delayMs) || 240);
    PM_BOOT_RETRY_TIMER = CLEAN_setTimeout(() => {
      PM_BOOT_RETRY_TIMER = 0;
      if (!STATE_PM.booted) CORE_PM_boot();
    }, wait);
  }

  function CORE_PM_scheduleSelfHeal(delayMs = 120) {
    if (PM_SELF_HEAL_TIMER) return;
    const wait = Math.max(0, Number(delayMs) || 0);
    PM_SELF_HEAL_TIMER = CLEAN_setTimeout(() => {
      PM_SELF_HEAL_TIMER = 0;
      const hasRoot = !!UI_PM.getRoot();
      const hasForm = !!DOM_getForm();
      const root = STATE_PM.ui.root || UI_PM.getRoot();
      if (root) {
        PM_DOCK_sync(root);
        UI_PM_scheduleFloatingLayout(root);
      }
      if (STATE_PM.booted) TIME_PM.ensureHistoryCapture();

      if (!STATE_PM.booted) {
        if (PM_FORCE_RECOVER || !PM_READY_EMITTED) {
          if (hasForm) CORE_PM_boot();
          else CORE_PM_scheduleBootRetry(260);
        }
        return;
      }

      /* Remount recovery is route-gated for the same reason the mount is. A
       * booted Prompt Manager legitimately has no root while off a chat route,
       * so without VIEW_PM_isChatPath() here every Project-surface DOM mutation
       * would drive an endless dispose -> boot -> no-root loop. */
      if (!hasRoot && VIEW_PM_isChatPath()) {
        PM_FORCE_RECOVER = true;
        CORE_PM_dispose();
        STATE_PM.booted = false;
        if (hasForm) CORE_PM_boot();
        else CORE_PM_scheduleBootRetry(260);
      }
    }, wait);
  }

  function CORE_PM_installSelfHealObserver() {
    if (PM_SELF_HEAL_OBS) return;

    const start = () => {
      if (PM_SELF_HEAL_OBS) return;
      PM_SELF_HEAL_OBS = new MutationObserver(() => { CORE_PM_scheduleSelfHeal(120); });
      try {
        PM_SELF_HEAL_OBS.observe(D.body || D.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden'],
        });
      } catch {}
    };

    if (D.body) start();
    else D.addEventListener('DOMContentLoaded', start, { once: true });

    W.addEventListener('pageshow', () => { CORE_PM_scheduleSelfHeal(40); }, { passive: true });
  }

  /* ── Non-UI boot tail ──────────────────────────────────────────────────────
   * Composer capture wiring plus the one-shot ready emission. None of it reads
   * or needs the Prompt Manager root, and none of it is chat-only: the capture
   * hooks bind to the host composer (which exists on Project surfaces too, and
   * submitting there produces a real prompt), while the ready payload is how the
   * Control Hub tab obtains the public API. Both boot paths therefore run this —
   * the mounted one and the route-withheld one — so that suppressing the chat
   * controls never degrades product-wide Prompt Manager services. */
  function CORE_PM_finishBoot() {
    TIME_PM.ensureHistoryCapture();
    TIME_PM.attachDraftCaptureOnClose();
    TIME_PM.attachPastedCapture();

    if (!PM_READY_EMITTED) {
      PM_READY_EMITTED = true;
      const detail = { tok: TOK, pid: PID, skid: SkID, v: MOD_VERSION, api: MOD_OBJ.api };
      UTIL_event.emit(EV_PM_READY_V1, detail);
      UTIL_event.emit(EV_PM_READY_LEGACY_V1, detail);
    }
    PM_FORCE_RECOVER = false;
    CORE_PM_scheduleSelfHeal(80);
  }

  /* ── Route invalidation ────────────────────────────────────────────────────
   * Runs synchronously inside the patched history.pushState/replaceState, so a
   * mounted root is hidden, closed and made inert before the SPA router returns
   * — no frame in which the chat-only controls survive on a Project surface.
   * Both calls are existing hide-only paths and neither touches storage.
   * Ordering is load-bearing: PM_DOCK_sync must run first because it clears
   * dockMode via PM_DOCK_disable, and UI_PM_scheduleFloatingLayout early-returns
   * while dockMode is set. UI_PM_placeFloatingRoot is then called directly
   * rather than through the scheduler, whose requestAnimationFrame would defer
   * the teardown past the very frame this exists to close. */
  function CORE_PM_invalidateRoute() {
    SAFE_try('CORE_PM.invalidateRoute', () => {
      if (VIEW_PM_isChatPath()) {
        /* Entering a chat route: hand remounting to the existing self-heal path
         * rather than duplicating mount logic on the navigation edge. */
        CORE_PM_scheduleSelfHeal(0);
        return;
      }
      const root = STATE_PM.ui.root || UI_PM.getRoot();
      if (!root) return;
      PM_DOCK_sync(root);
      UI_PM_placeFloatingRoot(root);
    }, null);
  }

  /* Installed once per document, not once per module evaluation. 7A1a carries no
   * re-entry guard and already reuses its window-owned MOD_OBJ across
   * evaluations, and the loader ships H2O.loader.guard() precisely because a
   * script body can run twice; a module-local flag would therefore reset and
   * bind a second listener. The sentinel follows the established convention
   * (W.__H2O_MM_HISTORY_PATCHED__, window.__h2o_interface_history_hooked).
   * The handler dispatches through MOD_OBJ.core — the same window-owned object
   * the newest evaluation rebinds — so the surviving listener can never hold a
   * stale closure over a superseded module scope.
   *
   * These listeners are deliberately NOT registered in CLEAN_: they must outlive
   * CORE_PM_dispose(), exactly like the module-scope self-heal observer. The
   * handler is a no-op when no root exists, so surviving teardown is harmless. */
  function PM_ROUTE_installInvalidation() {
    if (W.__H2O_PM_ROUTE_WIRED__) return;
    W.__H2O_PM_ROUTE_WIRED__ = true;

    const onRoute = () => {
      try { MOD_OBJ.core?.invalidateRoute?.(); } catch {}
    };

    /* Authority: 9A1a Interface Kernel wraps pushState/replaceState and fires
     * this synchronously after the real call, so location.pathname is already
     * the new path. It installs unconditionally at module scope and is
     * independent of MiniMap. The rest are supplemental and must never be
     * required — H2O.surface only learns about pushState via MiniMap's optional
     * route:changed, which is why it cannot be the authority. */
    W.addEventListener('ho:navigate', onRoute, { passive: true });
    W.addEventListener('evt:h2o:route:changed', onRoute, { passive: true });
    W.addEventListener('h2o:route:changed', onRoute, { passive: true });
    W.addEventListener('popstate', onRoute, { passive: true });
    W.addEventListener('pageshow', onRoute, { passive: true });
    SAFE_try('PM_ROUTE.surfaceSubscribe', () => {
      const onChange = W.H2O?.surface?.onChange;
      if (typeof onChange === 'function') onChange(onRoute);
    }, null);
  }

  function CORE_PM_boot() {
    if (STATE_PM.booted) return;
    STATE_PM.booted = true;

    SAFE_try('CORE_PM_boot', () => {
      UTIL_diagStep(`[BOOT][${MODTAG}] start`);

      // migrate (boot-time allowed)
      //
      // Both routines fail closed: on any problem they leave every source value
      // byte-for-byte intact and leave their marker unset, so the next boot
      // retries. A safe deferral must NOT block the UI from mounting — but it
      // must not be silent either, so the failure stays visible in dataError and
      // in the diagnostics rather than being swallowed here. No cleanup, no
      // fallback write, and no reseed is triggered by a deferral.
      const migKeysOk = ENGINE_PM.migrateKeysOnce();
      const migDraftsOk = ENGINE_PM.migrateDraftsFromHistoryOnce();
      if (!migKeysOk || !migDraftsOk) {
        STATE_PM.dataError = true;
        UTIL_diagStep(`[BOOT][${MODTAG}] migration deferred`,
          `keys:${migKeysOk ? 'ok' : 'deferred'} drafts:${migDraftsOk ? 'ok' : 'deferred'}`);
      }

      // load data
      STATE_PM.data.prompts = ENGINE_PM.loadPrompts();
      STATE_PM.data.quick = ENGINE_PM.loadQuick();

      // css
      UI_ensureStyle();

      // mount
      const root = UI_PM.ensureUI();
      STATE_PM.ui.root = root;
      if (!root) {
        /* Two different null roots, and conflating them is a defect. Off a chat
         * route the refusal is deliberate and permanent until navigation, so the
         * boot must stay latched and must NOT arm a recovery retry — un-latching
         * here would re-run the migrations and the data load every 260 ms for as
         * long as the user stays on a Project surface. The non-UI tail still runs
         * so composer capture stays bound and ready is still emitted; the route
         * listener remounts when a chat route is entered. */
        if (!VIEW_PM_isChatPath()) {
          UTIL_diagStep(`[BOOT][${MODTAG}] core ready; UI withheld (non-chat route)`);
          CORE_PM_finishBoot();
          return;
        }
        UTIL_diagStep(`[BOOT][${MODTAG}] no root (form missing?)`);
        STATE_PM.booted = false;
        PM_FORCE_RECOVER = true;
        CORE_PM_scheduleBootRetry(260);
        return;
      }
      PM_DOCK_installBridge();
      PM_DOCK_sync(root);

      // cache nodes
      const panel = DOM_q(UI_PM.selOwned(UI_PM_PANEL), root);
      const overlay = DOM_q(UI_PM.selOwned(UI_PM_OVERLAY), root);
      // Published so the module-scope panel authority (and therefore the public
      // API) can act without re-querying or synthesising a click.
      STATE_PM.ui.panel = panel;
      STATE_PM.ui.overlay = overlay;
      const exportBtn = DOM_q(UI_PM.selOwned(UI_PM_EXPORT_BTN), root);
      const btn = DOM_q(UI_PM.selOwned(UI_PM_BTN), root);
      const searchSimple = DOM_q(UI_PM.selOwned(UI_PM_SEARCH_SIMPLE), root);
      const searchEdit = DOM_q(UI_PM.selOwned(UI_PM_SEARCH_EDIT), root);
      const autoSimple = DOM_q(UI_PM.selOwned(UI_PM_AUTOSEND_SIMPLE), root);
      const autoEdit = DOM_q(UI_PM.selOwned(UI_PM_AUTOSEND_EDIT), root);
      const dot = DOM_q(UI_PM.selOwned(UI_PM_QUICK_MODE_DOT), root);
      const tray = DOM_q(UI_PM.selOwned(UI_PM_QUICK_TRAY), root);

      // Closed-state invariants applied up front, before anything can focus.
      UI_PM_applyPanelState(false);
      UI_PM_installThemeObserver();

      let resizeBurstTimer = 0;
      let resizeBurstUntil = 0;

      const onLayout = () => UI_PM_scheduleFloatingLayout(root);
      const onResizeBurst = () => {
        resizeBurstUntil = performance.now() + 1100;
        onLayout();
        if (resizeBurstTimer) return;
        resizeBurstTimer = CLEAN_setInterval(() => {
          if (performance.now() > resizeBurstUntil) {
            CLEAN_clearInterval(resizeBurstTimer);
            resizeBurstTimer = 0;
            return;
          }
          onLayout();
        }, 70);
      };

      W.addEventListener('resize', onLayout, { passive: true });
      W.addEventListener('scroll', onLayout, { passive: true });
      W.addEventListener('resize', onResizeBurst, { passive: true });
      W.addEventListener('popstate', onLayout, { passive: true });
      W.addEventListener('hashchange', onLayout, { passive: true });
      W.addEventListener('pageshow', onLayout, { passive: true });
      CLEAN_addFn(() => W.removeEventListener('resize', onLayout));
      CLEAN_addFn(() => W.removeEventListener('scroll', onLayout));
      CLEAN_addFn(() => W.removeEventListener('resize', onResizeBurst));
      CLEAN_addFn(() => W.removeEventListener('popstate', onLayout));
      CLEAN_addFn(() => W.removeEventListener('hashchange', onLayout));
      CLEAN_addFn(() => W.removeEventListener('pageshow', onLayout));
      CLEAN_addFn(() => {
        if (resizeBurstTimer) {
          CLEAN_clearInterval(resizeBurstTimer);
          resizeBurstTimer = 0;
        }
      });
      if (W.visualViewport) {
        W.visualViewport.addEventListener('resize', onLayout, { passive: true });
        W.visualViewport.addEventListener('scroll', onLayout, { passive: true });
        W.visualViewport.addEventListener('resize', onResizeBurst, { passive: true });
        CLEAN_addFn(() => W.visualViewport?.removeEventListener?.('resize', onLayout));
        CLEAN_addFn(() => W.visualViewport?.removeEventListener?.('scroll', onLayout));
        CLEAN_addFn(() => W.visualViewport?.removeEventListener?.('resize', onResizeBurst));
      }

      // Composer geometry follow (single bounded owner): the composer form
      // resizes when text wraps or when ChatGPT swaps its DOM — no window
      // resize fires for that, which left these fixed-position buttons at
      // stale coordinates (visible shake/drift on refresh/reflow). One
      // ResizeObserver, re-targeted whenever the form identity changes,
      // funnels into the same rAF-debounced layout. When ChatGPT replaces
      // the form, the dying observer fires a final time (size → 0), which
      // re-runs layout → re-acquires the new form → re-targets the RO.
      let composerRo = null;
      let composerRoTarget = null;
      const ensureComposerRo = () => {
        if (typeof ResizeObserver !== 'function') return;
        const form = SAFE_try('UI_PM.composerRoForm', () => DOM_getForm(), null);
        if (form === composerRoTarget) return;
        try { composerRo?.disconnect?.(); } catch {}
        composerRo = null;
        composerRoTarget = form || null;
        if (!form) return;
        composerRo = new ResizeObserver(() => {
          onLayout();
          W.requestAnimationFrame(ensureComposerRo);
        });
        try { composerRo.observe(form); } catch {}
      };
      const onLayoutWithRo = () => { ensureComposerRo(); onLayout(); };
      W.addEventListener('resize', onLayoutWithRo, { passive: true });
      CLEAN_addFn(() => W.removeEventListener('resize', onLayoutWithRo));
      CLEAN_addFn(() => { try { composerRo?.disconnect?.(); } catch {} composerRo = null; composerRoTarget = null; });
      ensureComposerRo();

      UI_PM_scheduleFloatingLayout(root);

      // Human-facing wrappers over the single module-scope authority, so the
      // click path and the public API can never diverge.
      const getPanelOpen = () => UI_PM_isPanelOpen();
      const openPanel = () => UI_PM_openPanel();
      const closePanel = () => UI_PM_closePanel();

      // ESC
      TIME_PM.attachEscClose(getPanelOpen, closePanel);

      // Overlay click closes
      if (overlay) {
        const onOv = () => closePanel();
        overlay.addEventListener('click', onOv);
        CLEAN_addFn(() => overlay.removeEventListener('click', onOv));
      }

      // Main button click (single) + dblclick (quick tray)
      if (exportBtn) {
        const onExport = (e) => {
          e.preventDefault();
          e.stopPropagation();
          UTIL_emitExportRun(CFG_PM.EXPORT_MODE_FULL, !!e?.shiftKey);
        };
        exportBtn.addEventListener('click', onExport);
        CLEAN_addFn(() => exportBtn.removeEventListener('click', onExport));
      }

      if (btn) {
        // Human click keeps the existing single/double-click disambiguation.
        const onClick = () => {
          if (STATE_PM.ui.pmClickTimer) return;
          STATE_PM.ui.pmClickTimer = CLEAN_setTimeout(() => {
            STATE_PM.ui.pmClickTimer = 0;
            getPanelOpen() ? closePanel() : openPanel();
          }, CFG_PM.CLICK_DELAY_MS);
        };
        const onDbl = (e) => {
          e.preventDefault();
          if (STATE_PM.ui.pmClickTimer) {
            CLEAN_clearTimeout(STATE_PM.ui.pmClickTimer);
            STATE_PM.ui.pmClickTimer = 0;
          }
          // toggle quick tray visibility
          if (!tray || !dot) return;
          const show = !tray.classList.contains(UI_PM_CLS_QSHOW);
          tray.classList.toggle(UI_PM_CLS_QSHOW, show);
          tray.setAttribute('aria-hidden', show ? 'false' : 'true');
          dot.classList.toggle(UI_PM_CLS_DOT_SHOW, show);
          UI_PM_scheduleFloatingLayout(root);

          if (show) RENDER_PM.renderQuickTray(root);
        };

        btn.addEventListener('click', onClick);
        btn.addEventListener('dblclick', onDbl);
        CLEAN_addFn(() => btn.removeEventListener('click', onClick));
        CLEAN_addFn(() => btn.removeEventListener('dblclick', onDbl));
      }

      // Search inputs — both panes write to the one canonical query.
      const bindSearch = (el) => {
        if (!el) return;
        const onInput = () => {
          SEARCH_PM.set(el.value, root, el); // mirror into the other pane — synchronous
          SEARCH_PM.scheduleRender(root);    // [2B] only the rerender is debounced
        };
        el.addEventListener('input', onInput);
        CLEAN_addFn(() => el.removeEventListener('input', onInput));
      };
      bindSearch(searchSimple);
      bindSearch(searchEdit);

      // Auto-send toggles sync
      const syncAuto = () => {
        const v = ENGINE_PM.getAutoSend();
        if (autoSimple) autoSimple.checked = v;
        if (autoEdit) autoEdit.checked = v;
      };
      syncAuto();

      if (autoSimple) {
        const onCh = () => { ENGINE_PM.setAutoSend(!!autoSimple.checked); syncAuto(); };
        autoSimple.addEventListener('change', onCh);
        CLEAN_addFn(() => autoSimple.removeEventListener('change', onCh));
      }
      if (autoEdit) {
        const onCh = () => { ENGINE_PM.setAutoSend(!!autoEdit.checked); syncAuto(); };
        autoEdit.addEventListener('change', onCh);
        CLEAN_addFn(() => autoEdit.removeEventListener('change', onCh));
      }

      // Filters (simple)
      const bindFilter = (ui, type) => {
        const b = DOM_q(UI_PM.selOwned(ui), root);
        if (!b) return;
        const on = () => { RENDER_PM.setSimpleFilter(root, type); RENDER_PM.renderSimple(root, SEARCH_PM.get()); };
        b.addEventListener('click', on);
        CLEAN_addFn(() => b.removeEventListener('click', on));
      };
      bindFilter(UI_PM_FILTER_ALL, 'all');
      bindFilter(UI_PM_FILTER_PROMPTS, 'prompt');
      bindFilter(UI_PM_FILTER_APPEND, 'append');
      bindFilter(UI_PM_FILTER_FAVORITES, 'favorites');
      bindFilter(UI_PM_FILTER_QUICK, 'quick');
      bindFilter(UI_PM_FILTER_HISTORY, 'history');
      bindFilter(UI_PM_FILTER_DRAFTS, 'draft');
      bindFilter(UI_PM_FILTER_PASTED, 'pasted');

      // Filters (edit)
      const bindEditFilter = (ui, type) => {
        const b = DOM_q(UI_PM.selOwned(ui), root);
        if (!b) return;
        const on = () => { RENDER_PM.setEditCategory(root, type); RENDER_PM.renderEdit(root, SEARCH_PM.get()); };
        b.addEventListener('click', on);
        CLEAN_addFn(() => b.removeEventListener('click', on));
      };
      bindEditFilter(UI_PM_EDIT_FILTER_ALL, 'all');
      bindEditFilter(UI_PM_EDIT_FILTER_PROMPTS, 'prompt');
      bindEditFilter(UI_PM_EDIT_FILTER_APPEND, 'append');
      bindEditFilter(UI_PM_EDIT_FILTER_FAVORITES, 'favorites');
      bindEditFilter(UI_PM_EDIT_FILTER_QUICK, 'quick');
      bindEditFilter(UI_PM_EDIT_FILTER_HISTORY, 'history');
      bindEditFilter(UI_PM_EDIT_FILTER_DRAFTS, 'draft');
      bindEditFilter(UI_PM_EDIT_FILTER_PASTED, 'pasted');

      // Mode buttons
      const btnSettings = DOM_q(UI_PM.selOwned(UI_PM_SETTINGS), root);
      const btnBack = DOM_q(UI_PM.selOwned(UI_PM_BACK), root);
      const btnCloseSimple = DOM_q(UI_PM.selOwned(UI_PM_CLOSE_SIMPLE), root);
      const btnCloseEdit = DOM_q(UI_PM.selOwned(UI_PM_CLOSE_EDIT), root);

      if (btnSettings) {
        const on = () => {
          RENDER_PM.setMode(root, 'edit');
          SEARCH_PM.syncInputs(root); // the Edit box must show the query it filters by
          RENDER_PM.renderEdit(root, SEARCH_PM.get());
        };
        btnSettings.addEventListener('click', on);
        CLEAN_addFn(() => btnSettings.removeEventListener('click', on));
      }
      if (btnBack) {
        const on = () => {
          /* [2A-fix A] An open editor owns this action. A dirty editor denies the
           * mode switch and arms the inline discard strip instead of being
           * silently hidden while still open. */
          if (!EDITOR_PM.requestBack(root)) return;
          RENDER_PM.setMode(root, 'simple');
          SEARCH_PM.syncInputs(root);
          RENDER_PM.renderSimple(root, SEARCH_PM.get());
        };
        btnBack.addEventListener('click', on);
        CLEAN_addFn(() => btnBack.removeEventListener('click', on));
      }
      if (btnCloseSimple) {
        const on = () => closePanel();
        btnCloseSimple.addEventListener('click', on);
        CLEAN_addFn(() => btnCloseSimple.removeEventListener('click', on));
      }
      if (btnCloseEdit) {
        const on = () => closePanel();
        btnCloseEdit.addEventListener('click', on);
        CLEAN_addFn(() => btnCloseEdit.removeEventListener('click', on));
      }

      // Quick dot: click = send mode. (The dblclick reorder mode went with the
      // Sortable removal; ▲▼ in Settings covers ordering.)
      if (dot) {
        const onClick = () => {
          STATE_PM.ui.quickSendMode = !STATE_PM.ui.quickSendMode;
          dot.classList.toggle(`cgxui-${SkID}--dot-send`, STATE_PM.ui.quickSendMode);
          dot.title = STATE_PM.ui.quickSendMode ? 'Quick replies: send immediately' : 'Quick replies: append only';
        };
        dot.addEventListener('click', onClick);
        CLEAN_addFn(() => dot.removeEventListener('click', onClick));
      }

      /* Convert a captured item into a saved prompt.
       * One shared implementation: the candidate is built without touching the
       * live array, persisted, and adopted only on success. */
      /* [2A] Still the ONE conversion path for History/Drafts/Pasted. Now it
       * refuses to create a second copy of something already saved, and derives
       * a readable title from the first non-empty line.
       *
       * Returns { ok, created, duplicate } so callers can report truthfully:
       * "already saved" is a success with created=false, NOT an error. */
      const convertToPrompt = (text, act, fallbackTitle) => {
        const type = (act === 'append') ? 'append' : 'prompt';
        const body = ENGINE_PM_normalizeConvBody(text);
        if (!body) return { ok: false, created: false, duplicate: false };

        const dup = ENGINE_PM_findConvDuplicate(STATE_PM.data.prompts, body, type);
        if (dup) return { ok: true, created: false, duplicate: true };

        const now = UTIL_now();
        const next = (STATE_PM.data.prompts || []).concat([{
          id: UTIL_cryptoId(),
          title: ENGINE_PM_convTitle(body, fallbackTitle),
          body,
          favorite: false,
          type,
          createdAt: now,
          updatedAt: now,
        }]);
        const w = ENGINE_PM.commitPromptsResult(next);
        return { ok: w.ok, created: w.ok, duplicate: false, write: w };
      };

      /* Report a conversion outcome on the shared status line. */
      const reportConversion = (res) => {
        if (!res || !res.ok) { FEEDBACK_PM_writeFailure(res && res.write, root); return; }
        FEEDBACK_PM.say(res.duplicate ? 'Already saved' : 'Saved', 'info', root);
      };

      /* [2B] Record a USE, not an edit.
       *
       * Called only after the composer insertion actually succeeded, and never
       * on edit/duplicate/favourite/create/convert/reorder. Clones just the one
       * entry, so the live record is never mutated, and deliberately leaves
       * updatedAt alone — that field is authoring metadata.
       *
       * Truthfulness: the insertion has ALREADY happened by the time this runs.
       * If the metadata write fails we say so persistently and stop; we do not
       * re-insert, do not undo the insertion, and do not pretend the counter
       * moved. commitPrompts adopts nothing on failure, so the authoritative
       * in-memory list keeps its previous, accurate usage values. */
      const commitPromptUsage = (id) => {
        const next = ENGINE_PM_touchPromptUsage(STATE_PM.data.prompts, id, UTIL_now());
        const wu = ENGINE_PM.commitPromptsResult(next);
        if (!wu.ok) {
          FEEDBACK_PM_writeFailure(wu, root);
          return false;
        }
        return true;
      };

      /* Toggle favourite via a cloned record, then re-render on success only. */
      const toggleFavorite = (id) => {
        const list = STATE_PM.data.prompts || [];
        if (!list.some(p => p && p.id === id)) return false;
        const now = UTIL_now();
        const next = list.map(p => (p && p.id === id) ? { ...p, favorite: !p.favorite, updatedAt: now } : p);
        const wf = ENGINE_PM.commitPromptsResult(next);
        if (!wf.ok) {
          /* [2A-fix] Report only a genuine write failure. An unknown id returned
           * false above without ever attempting a commit, so it stays silent.
           * The visible favourite state is unchanged because the re-render below
           * is skipped — persistence semantics are untouched. */
          FEEDBACK_PM_writeFailure(wf, root);
          return false;
        }
        UI_PM_renderBoth(root);
        return true;
      };

      // Click handling: Simple list
      const listSimple = DOM_q(UI_PM.selOwned(UI_PM_LIST_SIMPLE), root);
      if (listSimple) {
        const on = (e) => {
          const filter = STATE_PM.ui.simpleTypeFilter;

          // History actions
          if (filter === 'history') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const hidx = card.getAttribute('data-hidx');
            const hsnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-hsnap'));
            // Re-read and verify the EXACT rendered occurrence. Matching the id
            // alone let a different sent record occupy the index and pass.
            const hist = ENGINE_PM.loadHistory();
            const item = ENGINE_PM_verifyCaptureOccurrence(hist, hidx, hsnap, 'send');
            if (!item) { RENDER_PM.renderSimple(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-hact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              reportConversion(convertToPrompt(item.text, act, 'From history'));
              return;
            }
            return;
          }

          // Draft actions
          if (filter === 'draft') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const didx = card.getAttribute('data-didx');
            const dsnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-dsnap'));
            // Two Drafts rows may share an id, so resolve the exact occurrence.
            const drafts = ENGINE_PM.loadDrafts();
            const item = ENGINE_PM_verifyCaptureOccurrence(drafts, didx, dsnap);
            if (!item) { RENDER_PM.renderSimple(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-dact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              reportConversion(convertToPrompt(item.text, act, 'From draft'));
              return;
            }
            return;
          }

          // Pasted actions
          if (filter === 'pasted') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const pidx = card.getAttribute('data-pidx');
            const psnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-psnap'));
            // Two Pasted rows may share an id, so resolve the exact occurrence.
            const pasted = ENGINE_PM.loadPasted();
            const item = ENGINE_PM_verifyCaptureOccurrence(pasted, pidx, psnap);
            if (!item) { RENDER_PM.renderSimple(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-pact') || 'row';
            if (act === 'insert' || act === 'row') {
              DOM_setInputText(item.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
              return;
            }
            if (act === 'prompt' || act === 'append') {
              reportConversion(convertToPrompt(item.text, act, 'From pasted'));
              return;
            }
            return;
          }

          // Quick insert
          if (filter === 'quick') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const qid = card.getAttribute('data-qid');
            const q = STATE_PM.data.quick.find(x => x.id === qid);
            if (!q) return;
            DOM_setInputText(q.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
            return;
          }

          // Favorite toggle
          const starBtn = e.target.closest(`.cgxui-${SkID}--star`);
          if (starBtn) {
            // Favourite must never also trigger card insertion.
            e.stopPropagation();
            const card = starBtn.closest(`.cgxui-${SkID}--item`);
            toggleFavorite(card?.getAttribute('data-id'));
            return;
          }

          // Insert prompt
          const card = e.target.closest(`.cgxui-${SkID}--item`);
          if (!card) return;
          const id = card.getAttribute('data-id');
          const p = STATE_PM.data.prompts.find(x => x.id === id);
          if (!p) return;
          const isAppend = (p.type === 'append');
          const okIns = DOM_setInputText(p.body, { append: isAppend, autoSend: ENGINE_PM.getAutoSend() });
          // [2A] Feedback only — insertion semantics and Auto-send are unchanged.
          FEEDBACK_PM.say(okIns === false ? 'Insert failed' : 'Inserted', okIns === false ? 'error' : 'info', root);
          if (okIns === false) return;                      // [2B] a failed insert is not a use
          const usageOk = commitPromptUsage(id);
          if (ENGINE_PM.getAutoSend()) { closePanel(); return; }
          // [2B] The panel stays open, so reflect the new usage in the ranking.
          if (usageOk) UI_PM_renderBoth(root);
        };

        listSimple.addEventListener('click', on);
        CLEAN_addFn(() => listSimple.removeEventListener('click', on));
      }

      // Click handling: Edit list
      const listEdit = DOM_q(UI_PM.selOwned(UI_PM_LIST_EDIT), root);
      if (listEdit) {
        const on = (e) => {
          const cat = STATE_PM.ui.editCategory;

          // History manage
          if (cat === 'history') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const hidx = card.getAttribute('data-hidx');
            const hsnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-hsnap'));
            // Strict read: a corrupt collection must not be rewritten.
            const rd = ENGINE_PM.loadHistoryStrict();
            if (!rd.ok) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }
            const hist = rd.list;
            // Verify the EXACT rendered occurrence against the CURRENT collection.
            const item = ENGINE_PM_verifyCaptureOccurrence(hist, hidx, hsnap, 'send');
            if (!item) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-hact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              reportConversion(convertToPrompt(item.text, act, 'From history'));
              return;
            }
            if (act === 'delete') {
              /* Remove exactly ONE verified sent occurrence. The former
               * `hist.filter(h => h.id !== hid)` removed EVERY record sharing
               * that id — including a hidden pending draft, and including a
               * second sent row the user did not select. */
              const next = hist.slice();
              next.splice(Number(hidx), 1);
              if (ENGINE_PM.saveHistory(next)) RENDER_PM.renderEdit(root, SEARCH_PM.get());
              return;
            }
            return;
          }

          // Drafts manage
          if (cat === 'draft') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const didx = card.getAttribute('data-didx');
            const dsnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-dsnap'));
            // Strict read: a corrupt collection must not be rewritten by delete.
            const rdD = ENGINE_PM.loadDraftsStrict();
            if (!rdD.ok) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }
            const drafts = rdD.list;
            const item = ENGINE_PM_verifyCaptureOccurrence(drafts, didx, dsnap);
            if (!item) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-dact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              reportConversion(convertToPrompt(item.text, act, 'From draft'));
              return;
            }
            if (act === 'delete') {
              // Remove exactly ONE verified occurrence. Filtering by id would
              // delete every Drafts row sharing that id.
              const next = drafts.slice();
              next.splice(Number(didx), 1);
              if (ENGINE_PM.saveDrafts(next)) RENDER_PM.renderEdit(root, SEARCH_PM.get());
              return;
            }
            return;
          }

          // Pasted manage
          if (cat === 'pasted') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const pidx = card.getAttribute('data-pidx');
            const psnap = ENGINE_PM_parseSnapshot(card.getAttribute('data-psnap'));
            // Strict read: a corrupt collection must not be rewritten by delete.
            const rdP = ENGINE_PM.loadPastedStrict();
            if (!rdP.ok) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }
            const pasted = rdP.list;
            const item = ENGINE_PM_verifyCaptureOccurrence(pasted, pidx, psnap);
            if (!item) { RENDER_PM.renderEdit(root, SEARCH_PM.get()); return; }

            const act = e.target.getAttribute('data-pact') || '';
            if (act === 'insert') { DOM_setInputText(item.text, { append: false, autoSend: false }); return; }
            if (act === 'prompt' || act === 'append') {
              reportConversion(convertToPrompt(item.text, act, 'From pasted'));
              return;
            }
            if (act === 'delete') {
              // Remove exactly ONE verified occurrence. Filtering by id would
              // delete every Pasted row sharing that id.
              const next = pasted.slice();
              next.splice(Number(pidx), 1);
              if (ENGINE_PM.savePasted(next)) RENDER_PM.renderEdit(root, SEARCH_PM.get());
              return;
            }
            return;
          }

          // Quick manage
          if (cat === 'quick') {
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            if (!card) return;
            const qid = card.getAttribute('data-qid');
            const act = e.target.getAttribute('data-qact');
            if (!qid || !act) return;

            const idx = STATE_PM.data.quick.findIndex(q => q.id === qid);
            if (idx === -1) return;

            /* [2A] Both paths now open the shared editor: delete goes through the
             * editor's inline two-step confirmation, edit through its form. */
            if (act === 'delete' || act === 'edit') {
              EDITOR_PM.open(root, { kind: 'quick', mode: 'edit', id: qid });
              if (act === 'delete') EDITOR_PM.armDelete(root);
              return;
            }
            return;
          }

          // Move ▲▼ — slot-preserving within the visible subsequence.
          // The rendered order is the source of truth for what "adjacent" means;
          // filtered-out prompts keep their absolute index untouched.
          const moveBtn = e.target.closest(`.cgxui-${SkID}--move`);
          if (moveBtn) {
            e.stopPropagation();
            const card = e.target.closest(`.cgxui-${SkID}--item`);
            const id = card?.getAttribute('data-id');
            const dir = moveBtn.getAttribute('data-act');
            if (!id || !dir) return;

            const visibleIds = Array.from(listEdit.children)
              .map(el => el.getAttribute?.('data-id'))
              .filter(v => typeof v === 'string' && v);

            /* [2B-perf] Ask the SAME batch authority the renderer used, for the
             * clicked OCCURRENCE and direction, immediately before mutating. A
             * disabled button normally cannot be clicked, but this also covers
             * stale DOM, a synthetic dispatch, and the window between render and
             * click in which favouriting or a keystroke can re-rank the view.
             * Resolving by rendered position rather than by id means a duplicated
             * id cannot smuggle the wrong row through. Nothing is committed and
             * nothing flashes: the move simply does not happen. */
            const slotIndex = Array.from(listEdit.children).indexOf(card);
            const availability = ENGINE_PM_computeMoveAvailability(
              STATE_PM.data.prompts, STATE_PM.ui.editCategory, SEARCH_PM.get(),
              UTIL_now(), visibleIds);
            const slot = (slotIndex >= 0) ? availability[slotIndex] : null;
            if (!slot || slot.id !== id || !slot[dir]) {
              FEEDBACK_PM.say(PM_MSG_RANKED_NO_REORDER, 'info', root);
              return;
            }

            const next = ENGINE_PM_reorderVisible(STATE_PM.data.prompts, visibleIds, id, dir);
            if (!next) return;                          // boundary / rejected input → no-op
            /* [2-storage] Persist before adopting. A refused write used to
             * return here in silence, which made the arrow look dead; it now
             * reports the same classified failure as every sibling path.
             * Order and focus are untouched because nothing was adopted. */
            const wr = ENGINE_PM.commitPromptsResult(next);
            if (!wr.ok) { FEEDBACK_PM_writeFailure(wr, root); return; }

            UI_PM_renderBoth(root);
            const movedEl = listEdit.querySelector(`.cgxui-${SkID}--item[data-id="${CSS.escape(id)}"]`);
            RENDER_PM.flashMoved(movedEl);
            return;
          }

          // Favorite
          const starBtn = e.target.closest(`.cgxui-${SkID}--star`);
          if (starBtn) {
            // Favourite must never also trigger card insertion.
            e.stopPropagation();
            const card = starBtn.closest(`.cgxui-${SkID}--item`);
            toggleFavorite(card?.getAttribute('data-id'));
            return;
          }

          // Other actions
          const card = e.target.closest(`.cgxui-${SkID}--item`);
          if (!card) return;
          const id = card.getAttribute('data-id');
          const p = STATE_PM.data.prompts.find(x => x.id === id);
          if (!p) return;

          const act = e.target.getAttribute('data-act');
          if (!act) return;

          if (act === 'insert' || act === 'append') {
            const okIns = DOM_setInputText(p.body, { append: act === 'append', autoSend: ENGINE_PM.getAutoSend() });
            FEEDBACK_PM.say(okIns === false ? 'Insert failed' : 'Inserted', okIns === false ? 'error' : 'info', root);
            if (okIns === false) return;                    // [2B] a failed insert is not a use
            const usageOk = commitPromptUsage(id);
            if (ENGINE_PM.getAutoSend()) { closePanel(); return; }
            if (usageOk) UI_PM_renderBoth(root);
            return;
          }

          /* [2A] Delete and Edit both open the in-panel editor. Delete arrives
           * pre-armed so the inline two-step confirmation is the only gate. */
          if (act === 'delete' || act === 'edit') {
            EDITOR_PM.open(root, { kind: 'prompt', mode: 'edit', id: p.id });
            if (act === 'delete') EDITOR_PM.armDelete(root);
            return;
          }

          if (act === 'duplicate') {
            const now = UTIL_now();
            const copy = ENGINE_PM_buildDuplicate(p, UTIL_cryptoId(), now);
            const next = ENGINE_PM_insertAfterId(STATE_PM.data.prompts, p.id, copy);
            // Persist before adopting: a failed commit must leave no phantom.
            const wd = ENGINE_PM.commitPromptsResult(next);
            if (!wd.ok) { FEEDBACK_PM_writeFailure(wd, root); return; }
            UI_PM_renderBoth(root);
            FEEDBACK_PM.say('Duplicated', 'info', root);
            return;
          }
        };

        listEdit.addEventListener('click', on);
        CLEAN_addFn(() => listEdit.removeEventListener('click', on));
      }

      /* [2A] Create routes through EDITOR_PM. The former inline add-form and its
       * two alert() validations are gone; validation now renders in the editor. */
      const newBtn = DOM_q(UI_PM.selOwned(UI_PM_NEW_BTN), root);
      if (newBtn) {
        const on = () => {
          const cat = STATE_PM.ui.editCategory;
          if (cat === 'history' || cat === 'draft' || cat === 'pasted') return;
          EDITOR_PM.open(root, {
            kind: (cat === 'quick') ? 'quick' : 'prompt',
            mode: 'create',
            type: (cat === 'append') ? 'append' : 'prompt',
          });
        };
        newBtn.addEventListener('click', on);
        CLEAN_addFn(() => newBtn.removeEventListener('click', on));
      }

      /* [2C] Portability controls. Every listener is registered through
       * CLEAN_addFn, exactly like the Phase 1 and Phase 2A listeners, so
       * dispose() tears them down with the rest. */
      {
        const p = PORT_PM.els(root);
        const bindPort = (el, ev, fn) => {
          if (!el) return;
          el.addEventListener(ev, fn);
          CLEAN_addFn(() => el.removeEventListener(ev, fn));
        };

        bindPort(p && p.exportBtn, 'click', () => { PORT_PM.exportLibrary(root); });

        /* The visually hidden file input is the picker; the visible button only
         * opens it. Clearing the value first means re-picking the same file
         * still fires `change`. */
        bindPort(p && p.importBtn, 'click', () => {
          // [2C-closure-2] Never open a picker for an operation already known
          // to be impossible; report why instead.
          if (PORT_PM.st().recoveryRequired) {
            FEEDBACK_PM.say(PM_MSG_PORT_RECOVERY, 'error', root);
            return;
          }
          if (!p.file) return;
          try { p.file.value = ''; } catch { /* non-fatal */ }
          p.file.click();
        });
        bindPort(p && p.file, 'change', () => {
          const f = (p.file && p.file.files) ? p.file.files[0] : null;
          if (f) PORT_PM.beginImport(root, f);
        });

        bindPort(p && p.merge, 'click', () => { PORT_PM.applyImport(root, 'merge'); });
        bindPort(p && p.replace, 'click', () => { PORT_PM.applyImport(root, 'replace'); });
        bindPort(p && p.cancel, 'click', () => { PORT_PM.cancelImport(root); });

        // Reflect any state left over from a previous mount.
        PORT_PM.sync(root);
      }

      /* [2A] Editor controls. Every listener is registered through CLEAN_addFn so
       * dispose() tears them down exactly like the Phase 1 listeners. */
      {
        const ed = EDITOR_PM.els(root);
        const bind = (el, ev, fn) => {
          if (!el) return;
          el.addEventListener(ev, fn);
          CLEAN_addFn(() => el.removeEventListener(ev, fn));
        };
        const markDirty = () => { EDITOR_PM.refreshDirty(root); };

        bind(ed && ed.title, 'input', markDirty);
        bind(ed && ed.body, 'input', markDirty);

        bind(ed && ed.tPrompt, 'click', () => {
          const st = EDITOR_PM.st(); if (!st.open || st.kind === 'quick') return;
          st.draft = EDITOR_PM.readDraft(root); st.draft.type = 'prompt';
          EDITOR_PM.sync(root); EDITOR_PM.refreshDirty(root);
        });
        bind(ed && ed.tAppend, 'click', () => {
          const st = EDITOR_PM.st(); if (!st.open || st.kind === 'quick') return;
          st.draft = EDITOR_PM.readDraft(root); st.draft.type = 'append';
          EDITOR_PM.sync(root); EDITOR_PM.refreshDirty(root);
        });
        bind(ed && ed.fav, 'click', () => {
          const st = EDITOR_PM.st(); if (!st.open || st.kind === 'quick') return;
          const cur = !!st.draft.favorite;
          st.draft = EDITOR_PM.readDraft(root); st.draft.favorite = !cur;
          EDITOR_PM.sync(root); EDITOR_PM.refreshDirty(root);
        });

        bind(ed && ed.save, 'click', () => { EDITOR_PM.save(root); });
        bind(ed && ed.cancel, 'click', () => { EDITOR_PM.cancel(root); });
        bind(ed && ed.del, 'click', () => {
          const st = EDITOR_PM.st();
          if (!st.deleteArmed) { EDITOR_PM.armDelete(root); return; }
          EDITOR_PM.confirmDelete(root);
        });

        const discardYes = DOM_q(UI_PM.selOwned(UI_PM_ED_DISCARD_YES), root);
        const discardNo = DOM_q(UI_PM.selOwned(UI_PM_ED_DISCARD_NO), root);
        bind(discardYes, 'click', () => { EDITOR_PM.close(root); });
        bind(discardNo, 'click', () => { EDITOR_PM.keepEditing(root); });

        /* Cmd/Ctrl+Enter saves. A bare Enter inside the textarea stays a newline
         * so a multiline body can never be submitted by accident. */
        const onKey = (e) => {
          if (!EDITOR_PM.isOpen()) return;
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            EDITOR_PM.save(root);
          }
        };
        bind(ed && ed.title, 'keydown', onKey);
        bind(ed && ed.body, 'keydown', onKey);
      }

      // Quick tray click: insert quick bubble
      if (tray) {
        const on = (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          const id = b.getAttribute('data-id');
          const q = STATE_PM.data.quick.find(x => x.id === id);
          if (!q) return;
          DOM_setInputText(q.text, { append: !STATE_PM.ui.quickSendMode, autoSend: STATE_PM.ui.quickSendMode });
        };
        tray.addEventListener('click', on);
        CLEAN_addFn(() => tray.removeEventListener('click', on));
      }

      // initial mode + render
      RENDER_PM.setMode(root, ENGINE_PM.getUiMode());
      RENDER_PM.setSimpleFilter(root, 'all');
      RENDER_PM.setEditCategory(root, 'all');
      SEARCH_PM.set('', root);
      UI_PM_renderBoth(root);
      /* [2A-fix B] A self-heal remount creates a NEW root that renders closed.
       * Re-apply the surviving editor state so an unsaved draft is visibly
       * restored instead of existing only in memory behind the list. */
      EDITOR_PM.restore(root);
      /* [2A-fix F] The new root's status node is empty; a persistent error that
       * outlived the old root is written back onto it here, after the editor so
       * nothing in editor restoration can undo it. */
      FEEDBACK_PM.restore(root);
      RENDER_PM.renderQuickTray(root);
      if (tray && dot && CFG_PM.QUICK_TRAY_SHOW_ON_BOOT) {
        tray.classList.add(UI_PM_CLS_QSHOW);
        tray.setAttribute('aria-hidden', 'false');
        dot.classList.add(UI_PM_CLS_DOT_SHOW);
        UI_PM_scheduleFloatingLayout(root);
      }

      CORE_PM_finishBoot();
      UTIL_diagStep(`[BOOT][${MODTAG}] ready`);
    }, null);
  }

  /* ───────────────────────────── ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝🔓💥 ───────────────────────────── */
  function CORE_PM_dispose() {
    SAFE_try('CORE_PM_dispose', () => {
      if (!STATE_PM.booted) return;
      STATE_PM.booted = false;
      PM_DOCK_disable(STATE_PM.ui.root || UI_PM.getRoot());

      TIME_PM.resetHistoryCapture();

      // observers
      for (const o of STATE_PM.clean.obs.splice(0)) {
        SAFE_try('dispose.obs', () => o?.disconnect?.(), null);
      }
      PM_THEME_OBS = null;

      // timers — one-shots and intervals are owned separately and both drained
      for (const t of Array.from(STATE_PM.clean.timers)) {
        SAFE_try('dispose.timer', () => W.clearTimeout(t), null);
      }
      STATE_PM.clean.timers.clear();
      for (const iv of Array.from(STATE_PM.clean.intervals)) {
        SAFE_try('dispose.interval', () => W.clearInterval(iv), null);
      }
      STATE_PM.clean.intervals.clear();
      if (PM_BOOT_RETRY_TIMER) {
        SAFE_try('dispose.bootRetryTimer', () => W.clearTimeout(PM_BOOT_RETRY_TIMER), null);
        PM_BOOT_RETRY_TIMER = 0;
      }
      if (PM_SELF_HEAL_TIMER) {
        SAFE_try('dispose.selfHealTimer', () => W.clearTimeout(PM_SELF_HEAL_TIMER), null);
        PM_SELF_HEAL_TIMER = 0;
      }
      if (PM_LAYOUT_RAF) {
        SAFE_try('dispose.layoutRaf', () => W.cancelAnimationFrame(PM_LAYOUT_RAF), null);
        PM_LAYOUT_RAF = 0;
      }
      /* [2A-fix B] Drop transient editor confirmation state. The owned timer set
       * has just been drained, so a surviving deleteArmed/discardArmed flag or a
       * stale timer id would arm a confirmation nothing can any longer cancel.
       * The unsaved draft deliberately survives; restore() reapplies it. */
      SAFE_try('dispose.editorTransient', () => EDITOR_PM.resetTransient(), null);
      /* [2A-fix F] Same reasoning for the status line: the auto-clear timer has
       * just been drained, so drop transient info/success and zero the dead
       * timer id. A persistent error is deliberately kept — restore() writes it
       * back onto the replacement root. No new timer is created. */
      SAFE_try('dispose.feedbackTransient', () => {
        STATE_PM.ui.statusTimer = 0;
        FEEDBACK_PM.clearTransient();
      }, null);

      // listeners
      for (const fn of STATE_PM.clean.fns.splice(0)) {
        SAFE_try('dispose.fn', () => fn(), null);
      }

      // nodes
      for (const n of STATE_PM.clean.nodes.splice(0)) {
        SAFE_try('dispose.node', () => n?.remove?.(), null);
      }

      // reset refs
      STATE_PM.ui.root = null;
      STATE_PM.ui.panel = null;
      STATE_PM.ui.overlay = null;
      STATE_PM.ui.tooltip = null;
      STATE_PM.ui.pmClickTimer = 0;
      STATE_PM.ui.dockMode = false;
      STATE_PM.ui.dockBridgeWired = false;
      STATE_PM.ui.dockRegActive = false;

      UTIL_diagStep(`[DISPOSE][${MODTAG}] done`);
    }, null);
  }

  /* ───────────────────────────── ⚫️ BOOTSTRAP (no top-level DOM mutation beyond calling boot) ───────────────────────────── */
  // Contract allows boot call here because side-effects are inside CORE_PM_boot().
  //
  // Lifecycle is published on the window-owned module object BEFORE the permanent
  // route listener is installed, so that listener's lazy MOD_OBJ.core lookup can
  // never miss — and so a later re-evaluation of this file rebinds these entries
  // to its own scope while the already-installed listener keeps working.
  MOD_OBJ.core = MOD_OBJ.core || {};
  MOD_OBJ.core.boot = CORE_PM_boot;
  MOD_OBJ.core.dispose = CORE_PM_dispose;
  MOD_OBJ.core.invalidateRoute = CORE_PM_invalidateRoute;

  CORE_PM_installSelfHealObserver();
  PM_ROUTE_installInvalidation();
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', CORE_PM_boot, { once: true });
  else CORE_PM_boot();

  /* [API][PUBLIC] External API (for Control Hub + other modules) */
  function API_PM_findRoot() {
    return UI_PM.getRoot?.() || DOM_q(UI_PM.selOwned(UI_PM_WRAP));
  }

  function API_PM_findPanel(root) {
    const r = root || API_PM_findRoot();
    if (!r) return null;
    return r.querySelector(UI_PM.selOwned(UI_PM_PANEL));
  }

  function API_PM_findToggleBtn(root) {
    const r = root || API_PM_findRoot();
    if (!r) return null;
    return r.querySelector(UI_PM.selOwned(UI_PM_BTN));
  }

  function API_PM_findOverlay(root) {
    const r = root || API_PM_findRoot();
    if (!r) return null;
    return r.querySelector(UI_PM.selOwned(UI_PM_OVERLAY));
  }

  /* Panel-state methods act synchronously on real state. They deliberately do
   * NOT route through btn.click(): the human click path defers by
   * CFG_PM.CLICK_DELAY_MS to disambiguate double-click, which made these
   * methods return before anything happened and made two rapid calls collapse
   * into one.
   *
   * Return contract (unchanged for consumers, now actually truthful):
   *   open()   → true iff the panel is open afterwards
   *   close()  → true iff the panel is closed afterwards
   *   toggle() → the resulting open-state (true = now open) */
  function API_PM_isOpen() {
    return UI_PM_isPanelOpen();
  }

  function API_PM_open() {
    const root = API_PM_findRoot();
    if (!root) return false;
    if (API_PM_isOpen()) return true;
    UI_PM_openPanel();
    return API_PM_isOpen();
  }

  function API_PM_close() {
    const root = API_PM_findRoot();
    if (!root) return false;
    if (!API_PM_isOpen()) return true;
    UI_PM_closePanel();
    return !API_PM_isOpen();
  }

  function API_PM_toggle() {
    const root = API_PM_findRoot();
    if (!root) return false;
    if (API_PM_isOpen()) UI_PM_closePanel();
    else UI_PM_openPanel();
    return API_PM_isOpen();
  }

  function API_PM_focusSearch() {
    const root = API_PM_findRoot();
    if (!root) return false;
    // Open without stealing focus, then focus the input for the CURRENT mode —
    // focusing the Simple input while the Edit pane is shown is a silent no-op.
    if (!API_PM_isOpen()) UI_PM_openPanel({ focus: false });
    if (!API_PM_isOpen()) return false;
    const el = SEARCH_PM.activeInput(root);
    if (!el || typeof el.focus !== 'function') return false;
    el.focus();
    return D.activeElement === el;
  }

  // Optional: Quick Tray (if present)
  function API_PM_toggleQuickTray() {
    const root = API_PM_findRoot();
    if (!root) return false;
    const tray = root.querySelector(UI_PM.selOwned(UI_PM_QUICK_TRAY));
    if (!tray) return false;

    const btn = API_PM_findToggleBtn(root);
    if (btn) {
      try {
        btn.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
        return true;
      } catch {}
    }

    const dot = root.querySelector(UI_PM.selOwned(UI_PM_QUICK_MODE_DOT));
    const next = !tray.classList.contains(UI_PM_CLS_QSHOW);
    tray.classList.toggle(UI_PM_CLS_QSHOW, next);
    tray.setAttribute('aria-hidden', next ? 'false' : 'true');
    dot?.classList?.toggle?.(UI_PM_CLS_DOT_SHOW, next);
    return true;
  }

  // Publish stable API
  MOD_OBJ.api.open = API_PM_open;
  MOD_OBJ.api.close = API_PM_close;
  MOD_OBJ.api.toggle = API_PM_toggle;
  MOD_OBJ.api.isOpen = API_PM_isOpen;
  MOD_OBJ.api.focusSearch = API_PM_focusSearch;
  MOD_OBJ.api.toggleQuickTray = API_PM_toggleQuickTray;

  // Legacy-friendly alias for external consumers (no overwrite)
  W.H2O = W.H2O || {};
  W.H2O.PromptManager = W.H2O.PromptManager || {};
  Object.assign(W.H2O.PromptManager, MOD_OBJ.api);

})();
