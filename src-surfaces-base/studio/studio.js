// @version 2.5.7
"use strict";

const W = window; // used by 0D3e studioHost bridge

const MSG_ARCHIVE = "h2o-ext-archive:v1";
const LIST_ROW_OPS = ["listWorkbenchRows"];
const CHAT_ID_OPS = ["listAllChatIds", "listChatIds"];
const FOLDER_LIST_OPS = ["getFoldersList"];
const FOLDER_BINDING_OPS = ["resolveFolderBindings"];
const FOLDER_SET_OPS = ["setFolderBinding"];
const LABEL_CATALOG_OPS = ["getLabelsCatalog"];
const CATEGORY_CATALOG_OPS = ["getCategoriesCatalog"];
const CATEGORY_SET_OPS = ["setSnapshotCategory"];
const CATEGORY_RECLASSIFY_OPS = ["reclassifySnapshotCategory"];
const FOLDER_FILTER_NONE = "__none__";
const UI_PREFS_KEY = "h2o:archiveWorkbench:ui:vNext";
const EDIT_OVERRIDES_KEY = "h2o:archiveWorkbench:editOverrides:v1";
const CHAT_TITLE_STATE_KEY_PREFIX = "h2o:prm:cgx:library:chat-title:state:v1:";
const CHAT_TITLE_BOOT_KEY_PREFIX = "h2o:prm:cgx:library:chat-title:boot-cache:v1:";
const LEGACY_CHAT_TITLE_BOOT_KEY_PREFIX = "h2o:chat-title:boot-cache:v1:";
const INTERFACE_META_MIRROR_KEY_PREFIX = "h2o:prm:cgx:library:interface-meta:v1:";
const INTERFACE_META_KEY = "ho:chat-meta-v1";
const HEAT_OVERRIDE_KEY_PREFIX = "ho:chat-heat-override:";
const PIN_KEY_PREFIX = "ho:chat-pin:";
const ROW_TINT_KEY_PREFIX = "ho:chat-row-idx:";
const LIBRARY_SYNC_BROADCAST_KEY = "h2o:library:cross-surface:broadcast:v1";
const FOLDER_STATE_DATA_KEY = "h2o:prm:cgx:fldrs:state:data:v1";
const FOLDER_CLEANUP_AUDIT_KEY = "h2o:studio:folder-cleanup-audit:v1";
const FOLDER_MIRROR_REFRESH_AUDIT_KEY = "h2o:studio:folder-mirror-refresh-audit:v1";
const FOLDER_CLEANUP_CONFIRM_TEXT = "DELETE EMPTY CHROME FOLDERS";
const FOLDER_DUPLICATE_CLEANUP_CONFIRM_TEXT = "DELETE EMPTY DUPLICATE FOLDERS";
const FOLDER_DESKTOP_CLEANUP_CONFIRM_TEXT = "DELETE EMPTY DESKTOP FOLDERS";
const FOLDER_DESKTOP_MIRROR_REFRESH_CONFIRM_TEXT = "REFRESH DESKTOP FOLDER MIRROR";
const FOLDER_DESKTOP_ORPHAN_BINDING_CHAT_ID = "f5d1-test-chat-001";
const FOLDER_DESKTOP_ORPHAN_BINDING_FOLDER_ID = "f5d1-test-folder-b";
const FOLDER_DESKTOP_FINAL_F5D_FOLDER_ID = "f5d1-test-folder-b";
const FOLDER_DESKTOP_ORPHAN_BINDING_CONFIRM_TEXT = "REMOVE ORPHAN DESKTOP BINDING";
const FOLDER_LOCAL_REVIEW_EXPLANATION = "These folders exist locally but are not in your native ChatGPT folder catalog. Read-only — no cleanup performed.";
const FOLDER_LOCAL_REVIEW_BADGE_ORDER = ["extra", "test", "conflict", "desktop-only", "chrome-only", "review-required"];
const FOLDER_DESKTOP_MIRROR_CANONICAL_ROWS = Object.freeze([
  Object.freeze({ folderId: "f_7050f49d3f341819dba53d547", name: "Study" }),
  Object.freeze({ folderId: "f_5d9431084707f19dba53d548", name: "Case" }),
  Object.freeze({ folderId: "f_0606ea698948f19dba53d548", name: "Dev" }),
  Object.freeze({ folderId: "f_e301f3506938c19dbac0e304", name: "Code" }),
  Object.freeze({ folderId: "f_3bf15f43b835d19dbac0fb13", name: "Tech" }),
  Object.freeze({ folderId: "f_2bb1037f88b2719dbac10c22", name: "English" }),
]);
const FOLDER_DESKTOP_MIRROR_REFRESH_STATE = {
  path: "",
  pastedJson: "",
  confirmation: "",
  preview: null,
  status: "",
};
const FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE = {
  selected: false,
  confirmation: "",
  preview: null,
  status: "",
};
const HEAT_LEVELS = new Set(["auto", "hot", "warm", "off"]);
const INTERFACE_COLORS = [
  { name: "gold", value: "rgba(212,175,55,1)" },
  { name: "red", value: "rgba(179,58,58,1)" },
  { name: "blue", value: "rgba(70,100,200,1)" },
  { name: "green", value: "rgba(60,150,90,1)" },
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  rowsCache: null,
  folderCatalog: [],
  folderLocalReview: [],
  labelCatalog: [],
  categoryCatalog: [],
  folderBindingsByChat: {},
  selectedSnapshotId: "",
  selectedChatId: "",
  lastView: "saved",
  lastFolderId: "",
  lastFetchDiag: null,
  currentReaderSnapshot: null,
  sidebarExpanded: true,
  density: "cozy",
  layout: "focused",
  lastTagFilter: "",
  renderToken: 0,
  titleStateByChat: {},
  interfaceMetaByChat: {},
};

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function localReviewBadgeValues(item = {}){
  const values = new Set((Array.isArray(item.badges) ? item.badges : [])
    .map((badge) => String(badge || "").trim().toLowerCase())
    .filter(Boolean));
  if (item.isExtra) values.add("extra");
  if (item.isTestCandidate) values.add("test");
  if (item.isConflict) values.add("conflict");
  const bucket = String(item.reviewBucket || "").trim().toLowerCase();
  if (bucket) values.add(bucket);
  values.add("review-required");
  return FOLDER_LOCAL_REVIEW_BADGE_ORDER.filter((badge) => values.has(badge));
}

function localReviewBadgesHtml(item = {}){
  const badges = localReviewBadgeValues(item);
  if (!badges.length) return "";
  return `<span class="wbFolderLocalReviewBadges" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;min-width:0">${badges.map((badge) => (
    `<span class="wbFolderLocalReviewBadge wbFolderLocalReviewBadge--${esc(badge)}" title="${esc(badge)}" style="display:inline-flex;align-items:center;max-width:100%;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:1px 5px;font-size:9.5px;line-height:1.25;color:rgba(255,255,255,.68);background:rgba(255,255,255,.045);text-transform:none;letter-spacing:0">${esc(badge)}</span>`
  )).join("")}</span>`;
}

function studioHostUnmount(reason = "studio:unmount") {
  try { W.H2O?.studioHost?.unmount?.(reason); } catch {}
}

function resolveSnapshotTurnCreateTime(snap, turn, idx0){
  const meta = snap?.meta && typeof snap.meta === "object" ? snap.meta : {};
  const i1 = idx0 + 1;

  const directCandidates = [
    turn?.createTime,
    turn?.create_time,
    turn?.ts,
    turn?.timestamp,
    turn?.messageCreateTime,
    turn?.message_create_time
  ];

  for (const v of directCandidates){
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const maps = [
    meta.turnTimestamps,
    meta.turnCreateTimes,
    meta.messageTimestamps,
    meta.messageCreateTimes,
    meta.timestamps
  ];

  for (const map of maps){
    if (!map || typeof map !== "object") continue;
    const candidates = [
      map[String(turn?.turnIdx || i1)],
      map[i1],
      map[idx0]
    ];
    for (const v of candidates){
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }

  return 0;
}

function stampReplayTurnMeta(host, frame, createTime, turnNo){
  const ct = Number(createTime || 0);
  const tn = Number(turnNo || 0);

  if (tn > 0){
    try { host?.setAttribute("data-h2o-turn-no", String(tn)); } catch {}
    try { frame?.setAttribute("data-h2o-turn-no", String(tn)); } catch {}
  }

  if (ct > 0){
    try { host?.setAttribute("data-h2o-create-time", String(ct)); } catch {}
    try { frame?.setAttribute("data-h2o-create-time", String(ct)); } catch {}
  }
}


// ─── Edit-override persistence ────────────────────────────────────────────────
// Stores user edits keyed by `${snapshotId}:${turnIdx}` in localStorage.
// Extension-page localStorage is isolated to the extension origin, so these
// overrides persist across Studio sessions but never leak to chatgpt.com.

function editOverrideKey(snapshotId, turnIdx){
  return `${EDIT_OVERRIDES_KEY}:${snapshotId}:${String(turnIdx)}`;
}

function getEditOverride(snapshotId, turnIdx){
  try { return localStorage.getItem(editOverrideKey(snapshotId, turnIdx)) ?? null; } catch { return null; }
}

function setEditOverride(snapshotId, turnIdx, text){
  try { localStorage.setItem(editOverrideKey(snapshotId, turnIdx), String(text)); return true; } catch { return false; }
}

function deleteEditOverridesForSnapshot(snapshotId){
  try {
    const prefix = `${EDIT_OVERRIDES_KEY}:${snapshotId}:`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  } catch {}
}

// Persists an edit into the extension-stored snapshot so exported bundles
// reflect what the user sees. Fire-and-forget; localStorage override remains
// the authoritative source for the current Studio session.
function persistEditToExtensionSnapshot(snapshotId, turnIdx, newText){
  const snap = state.currentReaderSnapshot;
  if (!snap || String(snap.snapshotId || "") !== String(snapshotId || "")) return;
  const messages = Array.isArray(snap.messages) ? snap.messages : [];
  const targetOrder = Number(turnIdx) - 1; // turnIdx is 1-based over all turns
  const nowStr = new Date().toISOString();
  const editedMessages = messages.map((msg) => {
    if (Number(msg.order) !== targetOrder) return { ...msg };
    const originalText = msg.originalText !== undefined ? msg.originalText : String(msg.text || "");
    return { ...msg, text: newText, editedAt: nowStr, originalText };
  });
  // Keep in-memory snapshot current so subsequent edits in this session build on the
  // correct state (each edit would otherwise use the original captured text as base).
  state.currentReaderSnapshot = { ...snap, messages: editedMessages };
  const meta = {
    ...(snap.meta && typeof snap.meta === "object" ? snap.meta : {}),
    updatedAt: nowStr,
  };
  callArchive("captureSnapshot", {
    chatId: String(snap.chatId || ""),
    messages: editedMessages,
    meta,
  }).catch(() => {});
}

// ─── Delete-confirm state ─────────────────────────────────────────────────────
// Two-click pattern: first click arms the icon, second click within the
// timeout executes the delete.

const DELETE_ICON_HTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h12M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l.8 9.1a.6.6 0 0 0 .6.9h7.2a.6.6 0 0 0 .6-.9L13 4"/></svg>`;
const INFO_ICON_HTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.8"/><path d="M8 7.3v3.6M8 5.1h.01"/></svg>`;
const PIN_ICON_HTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.7 1.9 4.4 4.4-1.6 1.6-2.1-.6-2.5 2.5.4 2.5-1 1-2.6-2.6-2.8 2.8-.7-.7 2.8-2.8-2.6-2.6 1-1 2.5.4 2.5-2.5-.6-2.1 1.6-1.6Z"/></svg>`;

const deleteConfirm = {
  chatId: "",
  snapshotId: "",
  articleEl: null,
  timer: null,
};

let titlePaletteEl = null;

function armDeleteConfirm(chatId, snapshotId, articleEl, btnEl){
  clearDeleteConfirm();
  deleteConfirm.chatId = chatId;
  deleteConfirm.snapshotId = snapshotId;
  deleteConfirm.articleEl = articleEl;
  articleEl.classList.add("wbHistoryRow--deleting");
  btnEl.innerHTML = DELETE_ICON_HTML;
  btnEl.setAttribute("aria-label", "Click again to delete this chat from Studio");
  btnEl.setAttribute("title", "Click again to delete");
  btnEl.classList.add("wbDeleteBtn--armed");
  deleteConfirm.timer = setTimeout(() => clearDeleteConfirm(), 3000);
}

function clearDeleteConfirm(){
  clearTimeout(deleteConfirm.timer);
  const el = deleteConfirm.articleEl;
  if (el){
    el.classList.remove("wbHistoryRow--deleting");
    const btn = el.querySelector(".wbDeleteBtn");
    if (btn){
      btn.innerHTML = DELETE_ICON_HTML;
      btn.classList.remove("wbDeleteBtn--armed");
      btn.setAttribute("aria-label", "Delete this chat from Studio");
      btn.setAttribute("title", "Delete from Studio");
    }
  }
  deleteConfirm.chatId = "";
  deleteConfirm.snapshotId = "";
  deleteConfirm.articleEl = null;
  deleteConfirm.timer = null;
}

async function executeDeleteChat(chatId, snapshotId, articleEl){
  clearDeleteConfirm();
  articleEl.classList.add("wbHistoryRow--removing");

  try {
    // Attempt canonical deleteAllSnapshots op first, fall back to deleteSnapshot.
    let deleted = false;
    try {
      await callArchive("deleteAllSnapshots", { chatId });
      deleted = true;
    } catch {
      try { await callArchive("deleteSnapshot", { snapshotId, chatId }); deleted = true; } catch {}
    }

    // Always remove edit overrides for this snapshot locally
    deleteEditOverridesForSnapshot(snapshotId);

    // Remove from rows cache
    if (Array.isArray(state.rowsCache)){
      state.rowsCache = state.rowsCache.filter((r) => r.chatId !== chatId);
    }

    // Animate out then remove the DOM row
    await new Promise((res) => setTimeout(res, 260));
    articleEl.remove();

    // If the deleted chat was open in the reader, navigate back to list
    if (state.selectedChatId === chatId || state.currentReaderSnapshot?.chatId === chatId){
      state.selectedSnapshotId = "";
      state.selectedChatId = "";
      state.currentReaderSnapshot = null;
      location.hash = "#/saved";
    } else {
      // Refresh counts in sidebar
      const route = parseHash();
      renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);
      renderSidebarChatList(state.rowsCache || [], route.view, state.lastFolderId);
      syncSelectionControls();
    }
  } catch (err){
    articleEl.classList.remove("wbHistoryRow--removing");
    console.warn("[Studio] Delete failed:", err);
  }
}

// ─── Turn edit UI ─────────────────────────────────────────────────────────────

function extractTurnPlaintext(frameEl){
  // Walk the frame element and extract readable text, preserving code blocks
  // with newlines so the edit textarea is usable.
  try {
    const clone = frameEl.cloneNode(true);
    // Replace code blocks with fenced markdown so edits round-trip sensibly
    clone.querySelectorAll("pre code, pre").forEach((pre) => {
      const lang = pre.className?.match(/language-(\S+)/)?.[1] || "";
      const text = pre.textContent || "";
      const placeholder = document.createTextNode(`\n\`\`\`${lang}\n${text}\n\`\`\`\n`);
      pre.replaceWith(placeholder);
    });
    return (clone.textContent || "").trim();
  } catch {
    return (frameEl.textContent || "").trim();
  }
}

function mountEditTextarea(hostEl, snapshotId, turnIdx, originalText, onSave, onCancel){
  hostEl.innerHTML = "";
  hostEl.classList.add("wbTurn--editing");

  const wrap = document.createElement("div");
  wrap.className = "wbEditWrap";

  const textarea = document.createElement("textarea");
  textarea.className = "wbEditTextarea";
  textarea.value = originalText;
  textarea.rows = Math.min(Math.max(originalText.split("\n").length + 2, 4), 28);
  textarea.setAttribute("spellcheck", "true");
  textarea.setAttribute("autocomplete", "off");

  const actions = document.createElement("div");
  actions.className = "wbEditActions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "wbBtn wbBtnPrimary wbEditSaveBtn";
  saveBtn.textContent = "Save edit";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "wbBtn wbEditCancelBtn";
  cancelBtn.textContent = "Cancel";

  actions.append(saveBtn, cancelBtn);
  wrap.append(textarea, actions);
  hostEl.appendChild(wrap);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

  saveBtn.addEventListener("click", () => {
    const newText = textarea.value;
    setEditOverride(snapshotId, turnIdx, newText);
    persistEditToExtensionSnapshot(snapshotId, turnIdx, newText);
    onSave(newText);
  });
  cancelBtn.addEventListener("click", () => {
    onCancel();
  });

  // Ctrl/Cmd+Enter saves
  textarea.addEventListener("keydown", (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter"){
      ev.preventDefault();
      saveBtn.click();
    }
    if (ev.key === "Escape"){
      ev.preventDefault();
      cancelBtn.click();
    }
  });

  return { textarea, saveBtn, cancelBtn };
}

function normalizeText(s){
  return String(s || "").replace(/\s+/g, " ").trim();
}

function normalizeRole(raw){
  return String(raw || "").trim().toLowerCase() === "user" ? "user" : "assistant";
}

function normalizeArchiveView(raw){
  const view = String(raw || "").trim().toLowerCase();
  if (view === "pinned") return "pinned";
  if (view === "archive") return "archive";
  /* Phase K-1 — Linked Chats view. Records with state.isLinked && !state.isSaved
   * (registered via Add-to-Library but never captured as a snapshot) carry
   * view: 'linked' end-to-end through Library Index, the row normalizers,
   * filterRows, and renderRow. The visible tab pill is the responsibility
   * of a separate Library Insights touch — studio.js owns only the hash
   * route + list + reader placeholder for #/linked. */
  if (view === "linked") return "linked";
  return "saved";
}

function normalizeFolderFilter(raw){
  return String(raw || "").trim();
}

function normalizeDensity(raw){
  return String(raw || "").trim().toLowerCase() === "compact" ? "compact" : "cozy";
}

function normalizeLayout(raw){
  return String(raw || "").trim().toLowerCase() === "wide" ? "wide" : "focused";
}

function uniqStrings(arr){
  return [...new Set((Array.isArray(arr) ? arr : []).map((v) => String(v || "").trim()).filter(Boolean))];
}

function countAssistantTurns(messages){
  return (Array.isArray(messages) ? messages : []).reduce((n, row) => n + (normalizeRole(row?.role) === "assistant" ? 1 : 0), 0);
}

function pluralize(count, singular, plural = `${singular}s`){
  return `${count} ${count === 1 ? singular : plural}`;
}

function fmtDate(iso){
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(String(iso)));
  } catch {
    return "";
  }
}

function fmtDateCompact(iso){
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(String(iso)));
  } catch {
    return "";
  }
}

function toTimestampMs(value){
  if (value == null || value === "") return 0;
  if (value instanceof Date) {
    const n = value.getTime();
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
  }
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 10_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function timestampToIso(value){
  const ms = toTimestampMs(value);
  if (!ms) return "";
  try { return new Date(ms).toISOString(); } catch { return ""; }
}

function firstTimestamp(...values){
  for (const value of values){
    const iso = timestampToIso(value);
    if (iso) return iso;
  }
  return "";
}

function fmtDateMeta(value){
  const ms = toTimestampMs(value);
  if (!ms) return "";
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString(undefined, { month: "short" });
  const yy = d.getFullYear();
  return `${dd} ${mon} ${yy}`;
}

function toWholeCount(value, fallback = 0){
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

function toRowTintIndex(value, fallback = -1){
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const idx = Math.floor(n);
  return idx >= 0 && idx < INTERFACE_COLORS.length ? idx : -1;
}

function normalizeHeatLevel(value){
  const level = String(value || "").trim().toLowerCase();
  return HEAT_LEVELS.has(level) ? level : "auto";
}

function readLocalJson(key, fallback = null){
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function decodeSharedRecord(value){
  if (value == null) return null;
  if (typeof value === "object") return value;
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("\x00LZb64:")) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function hasChromeStorage(){
  try {
    return !!(W.chrome && W.chrome.storage && W.chrome.storage.local && typeof W.chrome.storage.local.get === "function");
  } catch {
    return false;
  }
}

// Persisted across sessions so the toolbar icon (background's openOrFocusStudio)
// can restore the user to their last route. Distinct from LAST_LIST_HASH_KEY,
// which is sessionStorage-scoped and tracks the most recent non-reader hash for
// the topbar Close button within a single tab.
const STUDIO_LAST_HASH_KEY = "h2o:studio:lastHash";

function persistStudioLastHash(hash){
  try {
    if (!hasChromeStorage() || !W.chrome?.storage?.local?.set) return;
    const value = String(hash || "").trim();
    if (!value || !value.startsWith("#")) return;
    W.chrome.storage.local.set({ [STUDIO_LAST_HASH_KEY]: value }, () => {
      void W.chrome.runtime?.lastError;
    });
  } catch {}
}

// Presence heartbeat — written on boot, hashchange, visibilitychange, and once
// every 10s while the tab exists. The background SW reads this on
// chrome.runtime.onInstalled / onStartup to decide whether to auto-restore
// the Studio tab after the user reloads the extension from chrome://extensions
// (which invalidates the page context). A fresh lastSeenAt within ~3 min is
// the signal "Studio was alive recently — bring it back".
//
// The presence record is intentionally small: open + lastHash + lastSeenAt +
// runtimeId. We never write open:false on unload (page-teardown can't run
// async chrome.storage reliably); staleness of lastSeenAt is the safer
// freshness signal.
const STUDIO_PRESENCE_KEY = "h2o:studio:presence:v1";
const STUDIO_PRESENCE_HEARTBEAT_MS = 10 * 1000;

function persistStudioPresence(){
  try {
    if (!hasChromeStorage() || !W.chrome?.storage?.local?.set) return;
    const rec = {
      open: true,
      lastHash: String(location.hash || "#/saved"),
      lastSeenAt: Date.now(),
      runtimeId: (W.chrome && W.chrome.runtime && W.chrome.runtime.id) || "",
    };
    W.chrome.storage.local.set({ [STUDIO_PRESENCE_KEY]: rec }, () => {
      void W.chrome.runtime?.lastError;
    });
  } catch {}
}

function chromeStorageGet(keys){
  if (!hasChromeStorage()) return Promise.resolve({});
  return new Promise((resolve) => {
    try {
      W.chrome.storage.local.get(keys, (result) => resolve(result || {}));
    } catch {
      resolve({});
    }
  });
}

function chromeStorageSet(obj){
  if (!hasChromeStorage()) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      W.chrome.storage.local.set(obj || {}, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

function chromeStorageRemove(keys){
  if (!hasChromeStorage()) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      W.chrome.storage.local.remove(keys, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

async function readSharedRecord(key, chromeValues = null){
  const k = String(key || "");
  if (!k) return null;

  const fromChrome = chromeValues && Object.prototype.hasOwnProperty.call(chromeValues, k)
    ? decodeSharedRecord(chromeValues[k])
    : null;
  if (fromChrome) return fromChrome;

  try {
    const store = W.H2O?.Library?.Store;
    if (store && typeof store.get === "function") {
      const fromStore = decodeSharedRecord(await store.get(k));
      if (fromStore) return fromStore;
    }
  } catch {}

  return decodeSharedRecord(readLocalJson(k, null));
}

async function writeSharedRecord(key, value){
  const k = String(key || "");
  if (!k) return false;
  const record = value && typeof value === "object" ? value : {};
  try { localStorage.setItem(k, JSON.stringify(record)); } catch {}

  const jobs = [chromeStorageSet({ [k]: record })];
  try {
    const store = W.H2O?.Library?.Store;
    if (store && typeof store.set === "function") jobs.push(store.set(k, record).catch(() => false));
  } catch {}
  await Promise.allSettled(jobs);
  return true;
}

function broadcastStudioMeta(reason, payload){
  const body = {
    ts: Date.now(),
    surface: "studio",
    reason: String(reason || "studio-interface-meta"),
    payload: payload && typeof payload === "object" ? payload : null,
  };
  try { W.H2O?.Library?.Sync?.broadcast?.(body.reason, body.payload); } catch {}
  chromeStorageSet({ [LIBRARY_SYNC_BROADCAST_KEY]: body }).catch(() => {});
  try {
    W.dispatchEvent(new CustomEvent("evt:h2o:library:cross-surface-sync", {
      detail: { reasons: [body.reason], t: body.ts, surface: "studio" },
    }));
  } catch {}
}

function normalizeTitleStatePayload(record){
  const src = record && typeof record === "object" && record.state && typeof record.state === "object"
    ? record.state
    : record;
  if (!src || typeof src !== "object") return null;
  const chatId = String(src.chatId || "").trim();
  const baseTitle = String(src.baseTitle || src.title || "").trim();
  const emoji = String(src.emoji || "").trim();
  const displayTitle = String(src.displayTitle || src.documentTitle || "").trim();
  if (!baseTitle && !emoji && !displayTitle) return null;
  return {
    chatId,
    baseTitle,
    emoji,
    displayTitle,
    updatedAt: toTimestampMs(src.updatedAt || src.emojiUpdatedAt || 0),
  };
}

function composeTitleFromState(titleState, fallbackTitle){
  const fallback = String(fallbackTitle || "").trim();
  const stateObj = normalizeTitleStatePayload(titleState);
  if (!stateObj) return fallback;
  const baseTitle = stateObj.baseTitle || fallback;
  const displayTitle = stateObj.displayTitle;
  const emoji = stateObj.emoji;
  if (displayTitle) return displayTitle;
  if (emoji && baseTitle && !baseTitle.startsWith(`${emoji} `)) return `${emoji} ${baseTitle}`;
  return baseTitle || fallback;
}

function emojiList(line){
  return String(line || "").trim().split(/\s+/).filter(Boolean);
}

const STUDIO_EMOJI_GROUPS = Object.freeze([
  Object.freeze({ label: "Smileys & Emotion", emojis: emojiList(`
    😀 😃 😄 😁 😆 😅 😂 🤣 🥲 🥹 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚
    😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖
    😫 😩 🥺 😢 😭 😮‍💨 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🫣
    🤗 🫡 🤔 🫢 🤭 🤫 🤥 😶 😐 😑 😬 🫨 🫠 🙄 😯 😦 😧 😮 😲 🥱
    😴 🤤 😪 😵 😵‍💫 🫥 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹
    👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾
  `) }),
  Object.freeze({ label: "Work & Objects", emojis: emojiList(`
    💬 🗨️ 🧠 💻 🖥️ ⌨️ 🖱️ ⚙️ 🛠️ 🔧 🧰 💡 📌 📍 🧭 🗺️ 🧩 📦
    📁 📂 🗂️ 📝 📄 📑 📜 🧾 📚 📖 🔖 📎 ✉️ 📧 📤 📥 🔍 🔎 📊
  `) }),
  Object.freeze({ label: "People & Roles", emojis: emojiList(`
    👨‍💻 👩‍💻 🧑‍💻 👨‍🎓 👩‍🎓 🧑‍🎓 👨‍🏫 👩‍🏫 🧑‍🏫 👨‍🔬 👩‍🔬 🧑‍🔬
    👨‍⚕️ 👩‍⚕️ 🧑‍⚕️ 👨‍⚖️ 👩‍⚖️ 🧑‍⚖️ 👨‍🔧 👩‍🔧 🧑‍🔧 👨‍🚀 👩‍🚀 🧑‍🚀
  `) }),
  Object.freeze({ label: "Symbols & Flags", emojis: emojiList(`
    ⭐ ✨ ⚡ 🔥 ✅ ❗ ⚠️ 🔁 🔒 🔓 ❤️ 💙 💚 💛 🧡 💜 🖤 🤍
    🔶 🔷 🔺 🔻 ⬆️ ⬇️ ⬅️ ➡️ 🇵🇸 🇩🇪 🇦🇹 🇪🇺 🇬🇧 🇺🇸 🇨🇦 🇨🇭
  `) }),
]);

const STUDIO_EMOJI_POOL = Object.freeze(Array.from(new Set(STUDIO_EMOJI_GROUPS.flatMap((group) => group.emojis || []))));

function splitTitleEmoji(raw){
  const title = String(raw || "").trim();
  if (!title) return { baseTitle: "", emoji: "" };
  let parts = [];
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    parts = Array.from(segmenter.segment(title), (entry) => entry.segment);
  } catch {
    parts = Array.from(title);
  }
  const isEmoji = (value) => (
    /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u.test(String(value || "")) ||
    /[\u2600-\u27BF]/u.test(String(value || ""))
  );
  const first = parts[0] || "";
  const last = parts[parts.length - 1] || "";
  const emoji = isEmoji(first) ? first : (isEmoji(last) ? last : "");
  if (!emoji) return { baseTitle: title, emoji: "" };
  if (emoji === first) parts.shift();
  else parts.pop();
  const baseTitle = parts.join("").trim();
  return { baseTitle: baseTitle || title, emoji };
}

function displayTitleWithEmoji(baseTitle, emoji){
  const base = String(baseTitle || "").trim();
  const e = String(emoji || "").trim();
  if (!base) return e;
  if (!e) return base;
  return base.startsWith(`${e} `) ? base : `${e} ${base}`;
}

function messageTimestamp(message){
  return toTimestampMs(
    message?.createdAt ??
    message?.createTime ??
    message?.create_time ??
    message?.timestamp ??
    message?.ts ??
    message?.messageCreateTime ??
    message?.message_create_time
  );
}

function earliestMessageTimestamp(messages){
  let min = 0;
  for (const msg of Array.isArray(messages) ? messages : []){
    const ms = messageTimestamp(msg);
    if (!ms) continue;
    min = min ? Math.min(min, ms) : ms;
  }
  return min;
}

function latestMessageTimestamp(messages){
  let max = 0;
  for (const msg of Array.isArray(messages) ? messages : []){
    const ms = messageTimestamp(msg);
    if (!ms) continue;
    max = Math.max(max, ms);
  }
  return max;
}

function resolveOriginalChatCreatedAt(row, meta, messages){
  const messageFirst = earliestMessageTimestamp(messages);
  return firstTimestamp(
    row?.chatCreatedAt,
    row?.conversationCreatedAt,
    row?.originalCreatedAt,
    row?.originCreatedAt,
    row?.firstMessageCreatedAt,
    row?.createdAtOriginal,
    meta?.chatCreatedAt,
    meta?.conversationCreatedAt,
    meta?.originalCreatedAt,
    meta?.originCreatedAt,
    meta?.firstMessageCreatedAt,
    meta?.createdAt,
    meta?.createTime,
    meta?.create_time,
    messageFirst,
    meta?.updatedAt,
    row?.updatedAt,
    row?.createdAt
  );
}

function resolveLastTurnAt(row, meta, messages){
  const messageLast = latestMessageTimestamp(messages);
  return firstTimestamp(
    row?.lastTurnAt,
    row?.lastTurnCreatedAt,
    row?.lastMessageCreatedAt,
    row?.lastActivityAt,
    row?.conversationUpdatedAt,
    meta?.lastTurnAt,
    meta?.lastTurnCreatedAt,
    meta?.lastMessageCreatedAt,
    meta?.lastActivityAt,
    meta?.conversationUpdatedAt,
    messageLast,
    row?.updatedAt,
    meta?.updatedAt,
    row?.studioAddedAt,
    row?.createdAt
  );
}

function resolveStudioAddedAt(row, meta){
  return firstTimestamp(
    row?.studioAddedAt,
    row?.addedAt,
    row?.capturedAt,
    row?.createdAt,
    meta?.studioAddedAt,
    meta?.addedAt,
    meta?.capturedAt
  );
}

function computeHeatLevel(row){
  const override = normalizeHeatLevel(row?.heatOverride);
  if (override !== "auto") return override;
  const meta = row?.interfaceMeta && typeof row.interfaceMeta === "object" ? row.interfaceMeta : {};
  const lastActivity = Math.max(
    toTimestampMs(meta.updatedAt),
    toTimestampMs(row?.updatedAt),
    toTimestampMs(row?.originalCreatedAt),
    toTimestampMs(row?.studioAddedAt)
  );
  if (!lastActivity) return "off";
  const ageHrs = (Date.now() - lastActivity) / 36e5;
  if (ageHrs <= 24) return "hot";
  if (ageHrs <= 24 * 7) return "warm";
  return "off";
}

function readUiPrefs(){
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : {};
    state.sidebarExpanded = prefs?.sidebarExpanded !== false;
    state.density = normalizeDensity(prefs?.density);
    state.layout = normalizeLayout(prefs?.layout);
  } catch {
    state.sidebarExpanded = true;
    state.density = "cozy";
    state.layout = "focused";
  }
}

function writeUiPrefs(){
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
      sidebarExpanded: state.sidebarExpanded,
      density: state.density,
      layout: state.layout,
    }));
  } catch {}
}

// Phase 2B: adaptive wide-mode for the saved-chat reader. Phase 1 armed the
// CSS variable --wb-thread-wide (54rem) but no JS toggled body[data-layout].
// We respect the existing user-explicit preference (`state.layout`) — toggling
// to "wide" via toggleLayout() always wins everywhere — and ONLY upgrade the
// default "focused" preference to "wide" while the user is on the reader
// route at viewports ≥ 1280px. The original CSS variable mapping is
// preserved: focused → --wb-thread-w (48rem), wide → --wb-thread-wide (54rem).
const ADAPTIVE_READER_LAYOUT_QUERY = "(min-width: 1280px)";
let adaptiveReaderLayoutMq = null;

function computeEffectiveLayout(){
  if (state.layout === "wide") return "wide"; // user-explicit; never undo
  const isReaderRoute = !!state.currentReaderSnapshot;
  if (isReaderRoute && adaptiveReaderLayoutMq && adaptiveReaderLayoutMq.matches) return "wide";
  return state.layout || "focused";
}

function applyAdaptiveReaderLayoutMarker(){
  const effective = computeEffectiveLayout();
  document.body.dataset.layout = effective;
  if (effective === "wide" && state.layout !== "wide") {
    document.body.dataset.readerLayoutAuto = "wide";
  } else if (document.body.dataset.readerLayoutAuto) {
    delete document.body.dataset.readerLayoutAuto;
  }
}

function installAdaptiveReaderLayout(){
  if (state.adaptiveReaderLayoutInstalled) return;
  state.adaptiveReaderLayoutInstalled = true;

  try {
    adaptiveReaderLayoutMq = window.matchMedia(ADAPTIVE_READER_LAYOUT_QUERY);
  } catch { adaptiveReaderLayoutMq = null; }

  const onChange = () => applyAdaptiveReaderLayoutMarker();
  if (adaptiveReaderLayoutMq) {
    if (typeof adaptiveReaderLayoutMq.addEventListener === "function") {
      adaptiveReaderLayoutMq.addEventListener("change", onChange);
    } else if (typeof adaptiveReaderLayoutMq.addListener === "function") {
      // Safari < 14 legacy MediaQueryList API.
      adaptiveReaderLayoutMq.addListener(onChange);
    }
  }
  // Resize covers width changes the matchMedia query crosses-over, plus the
  // gradual changes a user makes by dragging the window edge. Passive so we
  // never block the layout thread.
  window.addEventListener("resize", onChange, { passive: true });
}

function applyUiState(){
  installAdaptiveReaderLayout();
  document.body.dataset.sidebar = state.sidebarExpanded ? "open" : "closed";
  document.body.dataset.density = state.density;
  applyAdaptiveReaderLayoutMarker();
  document.body.dataset.route = state.currentReaderSnapshot ? "reader" : "list";

  const sidebarOpen = !!state.sidebarExpanded;
  const sidebarButtons = ["#sidebarCollapseBtn", "#railSidebarBtn"];
  sidebarButtons.forEach((selector) => {
    const btn = $(selector);
    if (!btn) return;
    btn.setAttribute("aria-expanded", sidebarOpen ? "true" : "false");
  });
  $(".wbRail")?.setAttribute("aria-hidden", sidebarOpen ? "true" : "false");
  $("#studioSidebar")?.setAttribute("aria-hidden", sidebarOpen ? "false" : "true");
  const collapseBtn = $("#sidebarCollapseBtn");
  if (collapseBtn) collapseBtn.tabIndex = sidebarOpen ? 0 : -1;
  const railBtn = $("#railSidebarBtn");
  if (railBtn) railBtn.tabIndex = sidebarOpen ? -1 : 0;

}

function setRouteMeta(eyebrow, title, summary){
  const eyebrowEl = $("#routeEyebrow");
  const titleEl = $("#routeTitle");
  const summaryEl = $("#routeSummary");
  if (eyebrowEl) eyebrowEl.textContent = String(eyebrow || "");
  if (titleEl) titleEl.textContent = String(title || "");
  if (summaryEl) summaryEl.textContent = String(summary || "");
}

// ── Transport seam ──────────────────────────────────────────────────────────
// Archive requests route through H2O.Studio.platform.messaging.send — the
// required boundary for the future Tauri port. The envelope is preserved
// exactly so the service-worker receiver (bg.js) continues to dispatch by
// type unchanged. The 'archive' target is informational today (MV3 routes
// by envelope.type) and becomes the Tauri command name at port time.
// Falls back to direct chrome.runtime.sendMessage if the platform adapter
// is unavailable. See surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md.
function getPlatformMessaging(){
  const p = W.H2O && W.H2O.Studio && W.H2O.Studio.platform && W.H2O.Studio.platform.messaging;
  if (!p || typeof p.send !== 'function') return null;
  const env = W.H2O && W.H2O.Studio && W.H2O.Studio.platform && W.H2O.Studio.platform.env;
  if (env && env.adapter === 'fallback') return null;
  return p;
}

// ── Desktop reader (M2a-3i) ─────────────────────────────────────────────────
// On Tauri Studio Desktop, saved snapshots live in the SQLite-backed
// H2O.Studio.store.snapshots. callArchive's "loadSnapshot" op is the single
// funnel renderReader → buildReaderDOM uses; we intercept just that op and
// project SQLite output into the canonical snapshot shape the existing
// reader path already consumes. All other archive ops fall through to the
// MV3 platform-messaging path unchanged — Save-to-Folder / Add-to-Library
// ingestion plumbing is a separate roadmap item (M2b).
function STUDIO_isTauri(){
  try {
    return !!(W.H2O && W.H2O.Studio && W.H2O.Studio.platform
      && W.H2O.Studio.platform.env && W.H2O.Studio.platform.env.isTauri === true);
  } catch { return false; }
}

/* Phase H — Tauri V2 invoke resolver. Mirrors the same probe used by
 * platform.tauri.js and sync/folder-sync.tauri.js so studio.js can call
 * tauri-plugin-dialog directly from the Settings UI without taking a
 * dependency on the platform adapter (which has no MV3 file-picker
 * counterpart). Returns a bound invoke(...) or null when not running
 * inside a Tauri WebView. Probe order matches Tauri V2 → V1 fallback. */
function STUDIO_getTauriInvoke(){
  try {
    const internals = W.__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === "function") return internals.invoke.bind(internals);
  } catch (_) { /* ignore */ }
  try {
    const tauri = W.__TAURI__;
    if (tauri && tauri.core && typeof tauri.core.invoke === "function") return tauri.core.invoke.bind(tauri.core);
    if (tauri && typeof tauri.invoke === "function") return tauri.invoke.bind(tauri);
  } catch (_) { /* ignore */ }
  return null;
}

// Pure mapper: { snapshot, turns } from store.snapshots.get → canonical
// snapshot shape produced by S0D3a's canonicalSnapshot. Only includes
// meta.richTurns when at least one turn has non-empty outerHtml, so HTML-less
// captures still fall through to buildCanonicalConversation (text rendering).
// Note: outerHtml → outerHTML (case flip) is the reader's contract.
function projectSqliteSnapshotToCanonical(input){
  if (!input || typeof input !== 'object') return null;
  const snap = input.snapshot;
  const turns = Array.isArray(input.turns) ? input.turns : [];
  if (!snap || typeof snap !== 'object' || !snap.snapshotId) return null;

  const capturedAtMs = (typeof snap.capturedAt === 'number' && snap.capturedAt > 0) ? snap.capturedAt : 0;
  let createdAt = '';
  if (capturedAtMs > 0) {
    try { createdAt = new Date(capturedAtMs).toISOString(); }
    catch { createdAt = ''; }
  }

  const messages = turns.map((t, idx) => ({
    role: (t && t.role) || 'assistant',
    text: (t && t.text) || '',
    order: (t && typeof t.turnIdx === 'number') ? t.turnIdx : idx,
    createdAt: capturedAtMs || 0,
  }));

  const richTurns = turns
    .filter((t) => t && typeof t.outerHtml === 'string' && t.outerHtml.length > 0)
    .map((t, idx) => Object.assign(
      { turnIdx: (typeof t.turnIdx === 'number') ? t.turnIdx : idx,
        role: t.role || 'assistant',
        outerHTML: t.outerHtml },
      (t.meta && typeof t.meta === 'object' && !Array.isArray(t.meta)) ? t.meta : {}
    ));

  // Spread snapshot.meta (catch-all) first so any pre-captured fields
  // (folderId, folderName, projectId, originSource, …) survive intact;
  // overlay derived fields on top.
  const metaBase = (snap.meta && typeof snap.meta === 'object' && !Array.isArray(snap.meta)) ? snap.meta : {};
  const meta = Object.assign({}, metaBase);
  if (snap.title && !meta.title) meta.title = snap.title;
  if (richTurns.length > 0) meta.richTurns = richTurns;
  if (typeof snap.messageCount === 'number' && meta.messageCount == null) {
    meta.messageCount = snap.messageCount;
  }

  return {
    snapshotId: snap.snapshotId,
    chatId: snap.chatId || '',
    title: snap.title || meta.title || '',
    createdAt,
    schemaVersion: 1,
    messageCount: Number(snap.messageCount || messages.length || 0),
    digest: snap.digest || '',
    messages,
    meta,
  };
}

async function loadSnapshotFromStoresDesktop(snapshotId){
  const id = String(snapshotId || '').trim();
  if (!id) return null;
  const snapStore = W.H2O && W.H2O.Studio && W.H2O.Studio.store && W.H2O.Studio.store.snapshots;
  if (!snapStore || typeof snapStore.get !== 'function') return null;
  try {
    const raw = await snapStore.get(id);
    if (!raw) return null;
    return projectSqliteSnapshotToCanonical(raw);
  } catch (e) {
    try { console.warn('[H2O.Studio] loadSnapshotFromStoresDesktop failed', e); } catch {}
    return null;
  }
}

async function callArchive(op, payload = {}, nsDisk){
  // Desktop (Tauri): route reader's loadSnapshot op to the SQLite store and
  // project to the canonical shape. The list ops have no archive bridge yet
  // on Desktop V1 — short-circuit them to empty arrays so renderList runs
  // its normal empty-state path instead of throwing "archive unavailable"
  // and leaving the sidebar stuck on the static "Loading folder bindings…"
  // / "Loading chats…" HTML defaults. Future enhancement (M2a-3j) will
  // project actual workbench rows from store.snapshots. Every other op
  // falls through to the MV3 platform-messaging path unchanged.
  if (STUDIO_isTauri()) {
    if (op === 'loadSnapshot') return loadSnapshotFromStoresDesktop(payload && payload.snapshotId);
    if (op === 'listWorkbenchRows') return [];
    if (op === 'listAllChatIds') return [];
    if (op === 'listChatIds') return [];
    // Route full-bundle import/export ops through the Desktop ingestion
    // modules so the existing #/migrate UI works against SQLite without
    // changing Chrome's archive import/export implementation.
    if (op === 'exportFullBundle') {
      const fn = W.H2O?.Studio?.ingestion?.exportFullBundle;
      if (typeof fn !== 'function') {
        return Promise.reject(new Error('Desktop export module not loaded'));
      }
      return fn(payload || {});
    }
    if (op === 'dryRunImportFullBundle') {
      const fn = W.H2O?.Studio?.ingestion?.dryRunImportBundle;
      if (typeof fn !== 'function') {
        return Promise.reject(new Error('Desktop ingestion module not loaded'));
      }
      return fn(payload && payload.bundle);
    }
    if (op === 'importFullBundle') {
      const fn = W.H2O?.Studio?.ingestion?.importBundle;
      if (typeof fn !== 'function') {
        return Promise.reject(new Error('Desktop ingestion module not loaded'));
      }
      return fn(payload && payload.bundle, payload && payload.mode);
    }
  }
  const message = { type: MSG_ARCHIVE, req: { op, payload, nsDisk } };
  const pm = getPlatformMessaging();
  const res = pm
    ? await pm.send('archive', message)
    : await chrome.runtime.sendMessage(message);
  if (!res?.ok) throw new Error(res?.error || `Archive op failed: ${op}`);
  return res.result;
}

async function tryArchiveOp(op, payload = {}, nsDisk){
  try {
    return { ok: true, op, result: await callArchive(op, payload, nsDisk) };
  } catch (error){
    return { ok: false, op, error };
  }
}

async function tryArchiveOps(ops, payload = {}, nsDisk){
  let last = null;
  for (const op of (ops || [])){
    const attempt = await tryArchiveOp(op, payload, nsDisk);
    if (attempt.ok) return attempt;
    last = attempt.error;
  }
  return { ok: false, error: last };
}

function parseHash(){
  const hash = String(location.hash || "");
  if (!hash && history.state?.h2oStudioReader){
    const activeSnapshotId = String(state.currentReaderSnapshot?.snapshotId || state.selectedSnapshotId || "").trim();
    if (activeSnapshotId) return { name: "read", snapshotId: activeSnapshotId };
  }

  const raw = (hash || "#/saved").replace(/^#/, "");
  const [pathRaw, searchRaw = ""] = raw.split("?");
  const parts = pathRaw.split("/").filter(Boolean);
  if (parts[0] === "read") return { name: "read", snapshotId: decodeURIComponent(parts[1] || "") };
  // The Library overlay (S0F1d Library Insights) owns #/library/* routes.
  // Surface them through parseHash with a distinct `name`, so renderRoute can
  // skip studio.js's list/reader render path AND avoid the listHash reset in
  // renderList — which previously rewrote the URL back to #/saved the moment
  // the user clicked the sidebar Library button.
  if (parts[0] === "library") {
    let view = "dashboard";
    try { view = decodeURIComponent(parts[1] || "dashboard"); } catch { view = parts[1] || "dashboard"; }
    let id = "";
    try { id = decodeURIComponent(parts.slice(2).join("/")); } catch { id = parts.slice(2).join("/"); }
    return { name: "library", view, id };
  }
  // v2 full-bundle migration routes (export from old extension, import into new).
  // Two leaf actions: "export" (download bundle JSON) and "import" (file picker
  // + dry-run + auto-backup + confirm). Owned by renderMigrateRoute below.
  if (parts[0] === "migrate") {
    const action = String(parts[1] || "").toLowerCase();
    if (action === "export" || action === "import") return { name: "migrate", action };
  }
  // Settings page — sidebar entry-point that exposes #/migrate/* through
  // user-facing cards. Owned by renderSettingsRoute below.
  if (parts[0] === "settings") return { name: "settings" };
  const search = new URLSearchParams(searchRaw);
  return {
    name: "list",
    view: normalizeArchiveView(parts[0] || "saved"),
    folderId: normalizeFolderFilter(search.get("folder") || ""),
    chatId: String(search.get("chat") || "").trim(),
    snapshotId: String(search.get("snapshot") || "").trim(),
  };
}

function buildListHash(view, folderId = ""){
  const params = new URLSearchParams();
  const folder = normalizeFolderFilter(folderId);
  if (folder) params.set("folder", folder);
  const suffix = params.toString();
  return `#/${normalizeArchiveView(view)}${suffix ? `?${suffix}` : ""}`;
}

function viewLabel(view){
  const next = normalizeArchiveView(view);
  if (next === "pinned") return "Pinned";
  if (next === "archive") return "Archive";
  if (next === "linked") return "Linked";
  return "Saved";
}

function viewCopy(view){
  const next = normalizeArchiveView(view);
  if (next === "pinned") return "Pinned snapshots";
  if (next === "archive") return "Archived conversations";
  if (next === "linked") return "Linked Chats";
  return "Saved chats";
}

function buildEmptyListState(view, folderId, query){
  const scope = [];
  const folderLabel = folderId === FOLDER_FILTER_NONE
    ? "Unfiled"
    : (folderId ? resolveFolderName(folderId) : "");
  if (folderLabel) scope.push(`inside ${folderLabel}`);
  if (query) scope.push(`matching "${query}"`);
  const scopeText = scope.length ? ` ${scope.join(" ")}` : "";
  /* Phase K-1 — Linked Chats has a distinct discoverability story:
   * the user populates it via Add-to-Library on chatgpt.com, not via
   * capture/refresh. Match the copy to that flow. */
  const normalized = normalizeArchiveView(view);
  if (normalized === "linked") {
    return `
      <div class="wbState">
        <div><strong>No linked chats yet${esc(scopeText)}.</strong></div>
        <div style="margin-top:8px;">Use Add-to-Library on chatgpt.com to register a chat link here.</div>
      </div>
    `;
  }
  return `
    <div class="wbState">
      <div><strong>No ${esc(viewCopy(view).toLowerCase())}${esc(scopeText)}.</strong></div>
      <div style="margin-top:8px;">Capture a conversation from chatgpt.com with the archive tools, then refresh Studio.</div>
    </div>
  `;
}

function buildListErrorState(error){
  const msg = normalizeText(error?.message || error || "Unknown Studio error");
  return `
    <div class="wbState wbState--error">
      <div><strong>Studio cannot list snapshots yet.</strong></div>
      <div style="margin-top:8px;">${esc(msg)}</div>
      <div style="margin-top:8px;">The extension archive bridge is still the source of truth for this page.</div>
    </div>
  `;
}

function normalizeSafeMarkdownHref(rawHref){
  const href = String(rawHref || "").trim();
  if (!href || /[\u0000-\u001F\u007F\s]/.test(href)) return "";

  try {
    const parsed = new URL(href);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") return href;
  } catch {}

  return "";
}

// Inline markdown → HTML. Handles links, bold, italic, inline code, plain text.
// All plain-text segments are HTML-escaped via esc(). Handles orphaned markers
// gracefully — an unmatched ` or * is consumed as literal text.
function renderInlineMarkdown(text){
  let s = String(text || "");
  let out = "";
  while (s.length > 0){
    // Inline code: `code`
    if (s[0] === "`"){
      const end = s.indexOf("`", 1);
      if (end > 0){
        out += `<code>${esc(s.slice(1, end))}</code>`;
        s = s.slice(end + 1);
        continue;
      }
    }
    // Image: ![alt](https://example.com/x.png). Must be dispatched BEFORE the
    // link branch so the leading "!" doesn't get consumed as plain text.
    // Unsafe / malformed URLs fall back to consuming a literal "!" and
    // re-entering the loop; the link branch then handles the remaining
    // "[alt](url)" (escaping or linking as appropriate). Phase 2A: pre-2026-05
    // the renderer silently skipped past `![` so markdown images were dropped.
    if (s[0] === "!" && s[1] === "["){
      const labelEnd = s.indexOf("]", 2);
      if (labelEnd > 1 && s[labelEnd + 1] === "("){
        const hrefEnd = s.indexOf(")", labelEnd + 2);
        if (hrefEnd > labelEnd + 2){
          const alt = s.slice(2, labelEnd);
          const rawHref = s.slice(labelEnd + 2, hrefEnd);
          const href = normalizeSafeMarkdownHref(rawHref);
          if (href){
            out += `<img src="${esc(href)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
            s = s.slice(hrefEnd + 1);
            continue;
          }
        }
      }
      // Malformed or unsafe URL: emit literal "!" and let the link branch
      // (next iteration) handle the remaining "[alt](url)" as a normal link
      // if the URL parses, or escape it as literal text if not.
      out += esc("!");
      s = s.slice(1);
      continue;
    }
    // Link: [label](https://example.com). Unsafe hrefs stay literal text.
    if (s[0] === "["){
      const labelEnd = s.indexOf("]");
      if (labelEnd > 0 && s[labelEnd + 1] === "("){
        const hrefEnd = s.indexOf(")", labelEnd + 2);
        if (hrefEnd > labelEnd + 2){
          const label = s.slice(1, labelEnd);
          const rawHref = s.slice(labelEnd + 2, hrefEnd);
          const href = normalizeSafeMarkdownHref(rawHref);
          if (href){
            out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${renderInlineMarkdown(label)}</a>`;
            s = s.slice(hrefEnd + 1);
            continue;
          }
        }
      }
      out += esc("[");
      s = s.slice(1);
      continue;
    }
    // Bold: **text** — check before single * to avoid false matches
    if (s.startsWith("**")){
      const end = s.indexOf("**", 2);
      if (end > 2){
        out += `<strong>${renderInlineMarkdown(s.slice(2, end))}</strong>`;
        s = s.slice(end + 2);
        continue;
      }
    }
    // Italic: *text* (single asterisk, not a double)
    if (s[0] === "*" && s[1] !== "*"){
      const end = s.indexOf("*", 1);
      if (end > 1){
        out += `<em>${renderInlineMarkdown(s.slice(1, end))}</em>`;
        s = s.slice(end + 1);
        continue;
      }
    }
    // Italic: _text_ (underscore style)
    if (s[0] === "_" && s[1] !== "_"){
      const end = s.indexOf("_", 1);
      if (end > 1){
        out += `<em>${renderInlineMarkdown(s.slice(1, end))}</em>`;
        s = s.slice(end + 1);
        continue;
      }
    }
    // Plain text — consume up to the next potential marker character. If the
    // next marker is `[` preceded by `!`, stop one character BEFORE the `!`
    // so the image branch (which dispatches on `s[0] === "!" && s[1] === "["`)
    // gets a chance next iteration. Phase 2A: pre-2026-05 the scanner did the
    // opposite — it advanced PAST `![` to suppress image parsing entirely,
    // which silently dropped every markdown image in canonical saved chats.
    const nextMarker = s.search(/[`*_\[]/);
    if (nextMarker > 0){
      const isImageStart = s[nextMarker] === "[" && s[nextMarker - 1] === "!";
      const end = isImageStart ? nextMarker - 1 : nextMarker;
      out += esc(s.slice(0, end));
      s = s.slice(end);
    } else {
      out += esc(s); // no more markers, consume the rest
      break;
    }
  }
  return out;
}

function countMarkdownIndent(line){
  let count = 0;
  for (const ch of String(line || "")){
    if (ch === " ") count += 1;
    else if (ch === "\t") count += 4;
    else break;
  }
  return count;
}

function parseMarkdownListLine(line){
  const match = String(line || "").match(/^([ \t]*)([-*+]|\d+\.)[ \t]+(.+)$/);
  if (!match) return null;
  return {
    indent: countMarkdownIndent(match[1]),
    type: /^\d+\.$/.test(match[2]) ? "ol" : "ul",
    text: match[3],
  };
}

function renderMarkdownList(lines, start, baseIndent, listType){
  const tag = listType === "ol" ? "ol" : "ul";
  const items = [];
  let i = start;

  while (i < lines.length){
    const row = parseMarkdownListLine(lines[i]);
    if (!row || row.indent !== baseIndent || row.type !== listType) break;

    const parts = [renderInlineMarkdown(row.text)];
    i++;

    while (i < lines.length){
      if (String(lines[i] || "").trim() === "") break;

      const child = parseMarkdownListLine(lines[i]);
      if (!child || child.indent <= baseIndent) break;

      const nested = renderMarkdownList(lines, i, child.indent, child.type);
      parts.push(nested.html);
      i = nested.next;
    }

    items.push(`<li>${parts.join("")}</li>`);
  }

  return { html: `<${tag}>${items.join("")}</${tag}>`, next: i };
}

function splitMarkdownTableRow(line){
  let src = String(line || "").trim();
  if (!src.includes("|")) return [];
  if (src.startsWith("|")) src = src.slice(1);
  if (src.endsWith("|")) src = src.slice(0, -1);

  const cells = [];
  let cell = "";
  for (let i = 0; i < src.length; i += 1){
    const ch = src[i];
    if (ch === "\\" && src[i + 1] === "|"){
      cell += "|";
      i++;
      continue;
    }
    if (ch === "|"){
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function parseMarkdownTableAlign(cell){
  const marker = String(cell || "").replace(/\s+/g, "");
  if (!/^:?-{3,}:?$/.test(marker)) return null;
  if (marker.startsWith(":") && marker.endsWith(":")) return "center";
  if (marker.endsWith(":")) return "right";
  if (marker.startsWith(":")) return "left";
  return "";
}

function parseMarkdownTableStart(lines, start){
  if (start + 1 >= lines.length) return null;
  const header = splitMarkdownTableRow(lines[start]);
  const delimiter = splitMarkdownTableRow(lines[start + 1]);
  if (header.length < 2 || delimiter.length !== header.length) return null;

  const aligns = delimiter.map(parseMarkdownTableAlign);
  if (aligns.some((align) => align === null)) return null;
  return { header, aligns };
}

function renderMarkdownTable(lines, start){
  const parsed = parseMarkdownTableStart(lines, start);
  if (!parsed) return null;

  const { header, aligns } = parsed;
  const columnCount = header.length;
  let i = start + 2;
  const bodyRows = [];

  while (i < lines.length){
    if (String(lines[i] || "").trim() === "") break;
    const cells = splitMarkdownTableRow(lines[i]);
    if (cells.length < 2) break;
    bodyRows.push(cells.slice(0, columnCount));
    i++;
  }

  const alignAttr = (idx) => aligns[idx] ? ` style="text-align:${aligns[idx]}"` : "";
  const renderCell = (tag, value, idx) => (
    `<${tag}${alignAttr(idx)}>${renderInlineMarkdown(value || "")}</${tag}>`
  );
  const head = `<thead><tr>${header.map((cell, idx) => renderCell("th", cell, idx)).join("")}</tr></thead>`;
  const body = `<tbody>${bodyRows.map((row) => {
    const cells = Array.from({ length: columnCount }, (_, idx) => row[idx] || "");
    return `<tr>${cells.map((cell, idx) => renderCell("td", cell, idx)).join("")}</tr>`;
  }).join("")}</tbody>`;

  return { html: `<table>${head}${body}</table>`, next: i };
}

// Full markdown → HTML for archive message text.
// Handles: fenced code blocks, headings (h1–h3), horizontal rules, blockquotes,
// tables, nested unordered/ordered lists, paragraphs, and inline formatting.
// Stays close to the Mobile Studio renderer while adding Browser quote support.
function renderTextAsChatGPTBlocks(text){
  const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length){
    const line = lines[i];

    // Fenced code block (``` or ~~~)
    const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)/);
    if (fenceMatch){
      const fence = fenceMatch[1];
      const lang = fenceMatch[2].trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)){
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      const langBadge = lang ? `<div class="wbCodeLang">${esc(lang)}</div>` : "";
      out.push(`<div class="wbCodeBlock">${langBadge}<pre><code>${esc(codeLines.join("\n"))}</code></pre></div>`);
      continue;
    }

    // ATX heading (# ## ###)
    const headingMatch = line.match(/^(#{1,3})[ \t]+(.+?)[ \t]*$/);
    if (headingMatch){
      const level = Math.min(headingMatch[1].length, 3);
      out.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule (--- *** ___ as standalone line)
    if (/^[-*_]{3,}\s*$/.test(line.trim())){
      out.push(`<hr>`);
      i++;
      continue;
    }

    const table = renderMarkdownTable(lines, i);
    if (table){
      out.push(table.html);
      i = table.next;
      continue;
    }

    // Blockquote (> quote). Reuse this renderer for quoted markdown content.
    if (/^[ \t]{0,3}>[ \t]?/.test(line)){
      const quoteLines = [];
      while (i < lines.length && /^[ \t]{0,3}>[ \t]?/.test(lines[i])){
        quoteLines.push(lines[i].replace(/^[ \t]{0,3}>[ \t]?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderTextAsChatGPTBlocks(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    const listRow = parseMarkdownListLine(line);
    if (listRow){
      const list = renderMarkdownList(lines, i, listRow.indent, listRow.type);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // Blank line
    if (line.trim() === ""){
      i++;
      continue;
    }

    // Paragraph — collect lines until a blank line or a block-level element starts
    const paraLines = [];
    while (i < lines.length){
      const l = lines[i];
      if (l.trim() === "") break;
      if (/^(`{3,}|~{3,})/.test(l)) break;
      if (/^#{1,3}[ \t]/.test(l)) break;
      if (/^[-*_]{3,}\s*$/.test(l.trim())) break;
      if (parseMarkdownTableStart(lines, i)) break;
      if (/^[ \t]{0,3}>[ \t]?/.test(l)) break;
      if (parseMarkdownListLine(l)) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0){
      out.push(`<p>${renderInlineMarkdown(paraLines.join(" "))}</p>`);
    }
  }

  return out.join("") || `<p></p>`;
}

function isConversationTurnNode(node){
  if (!(node instanceof Element)) return false;
  const testid = String(node.getAttribute("data-testid") || "").trim();
  return testid === "conversation-turn" || testid.startsWith("conversation-turn-");
}

function findConversationTurnElement(root){
  if (!root) return null;
  const direct = [...(root.children || [])].find((node) => isConversationTurnNode(node));
  if (direct) return direct;
  return root.querySelector?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]') || null;
}

function findRoleHostInTurn(turnEl, preferredRole = ""){
  if (!(turnEl instanceof Element)) return null;
  const preferred = normalizeRole(preferredRole || "");
  if (preferredRole){
    const exact = turnEl.querySelector?.(`[data-message-author-role="${preferred}"]`) || null;
    if (exact) return exact;
  }
  return turnEl.querySelector?.("[data-message-author-role]") || null;
}

function inferTurnRole(turnEl, fallbackRole = "assistant"){
  const roleHost = findRoleHostInTurn(turnEl, fallbackRole);
  const raw =
    roleHost?.getAttribute?.("data-message-author-role") ||
    turnEl?.getAttribute?.("data-turn") ||
    fallbackRole;
  return normalizeRole(raw);
}

function extractPlaintextFromHtml(htmlRaw){
  const html = String(htmlRaw || "").trim();
  if (!html) return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return normalizeText(tpl.content.textContent || "");
}

const STALE_REPLAY_SUBTREE_SELECTORS = [
  ".h2o-cold-layer",
  '[data-h2o-cold-layer="1"]',
  '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mnmp-panel"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mnmp-minimap"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mnmp-col"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mm-root"][data-cgxui-owner="mnmp"]',
  '[data-cgxui="mm-minimap"][data-cgxui-owner="mnmp"]',
  ".cgxui-mm-root",
  ".cgxui-mm-minimap",
  ".cgxui-mm-col",
  ".cgxui-mm-wrap",
  ".cgxui-mm-btn",
  ".cgxui-mm-qbtn",
  ".cgxui-mm-dotrow",
  ".cgxui-mm-count",
  ".cgxui-mm-toggle",
  ".cgxui-mm-aux",
  ".cgxui-mm-counter",
  ".cgxui-mnmp-root",
  ".cgxui-mnmp-minimap",
  ".cgxui-mnmp-col",
  ".cgxui-mnmp-wrap",
  ".cgxui-mnmp-btn",
  ".cgxui-mnmp-qbtn",
  ".cgxui-mnmp-dotrow",
  ".cgxui-mnmp-count",
  ".cgxui-mnmp-toggle",
  ".cgxui-mnmp-aux",
  ".cgxui-mnmp-counter",
  '[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]',
  ".cgxui-atns-answer-title",
  ".cgxui-atns-answer-title-text",
  ".cgxui-atns-answer-title-label",
  ".cgxui-atns-answer-title-badge",
  ".cgxui-atns-answer-title-icon",
  '[data-cgxui-qts-bar][data-cgxui-owner="qts"]',
  '[data-cgxui-qts-inline][data-cgxui-owner="qts"]',
  '[data-cgxui-ats-bar][data-cgxui-owner="ats"]',
  '[data-cgxui-ats-inline][data-cgxui-owner="ats"]',
  '[data-cgxui="qbig-num"][data-cgxui-owner="qbig"]',
  '[data-cgxui="ansn-abig"][data-cgxui-owner="ansn"]',
  '[data-cgxui="mrnc-marks"][data-cgxui-owner="mrnc"]',
  '[data-cgxui="mrnc-gutter"][data-cgxui-owner="mrnc"]',
  '[data-cgxui="mrnc-gutlane"][data-cgxui-owner="mrnc"]',
  ".cgxui-qts-ts",
  ".cgxui-ats-ts",
  ".chatgpt-timestamp",
  ".cgxui-qbig-number",
  ".cgxui-ansn-big-number",
  ".cgxui-qswr-quoteBox",
  ".cgxui-qswr-toggle",
  ".cgxui-qswr-toggle-top",
  ".cgxui-qswr-toggle-row",
  '[aria-label="Response actions"][role="group"]',
  '[aria-label="Your message actions"][role="group"]'
];

const REPLAY_UNWRAP_SELECTORS = [
  ".cgxui-qswr",
  '[data-cgxui="scbn-band"][data-cgxui-owner="scbn"]'
];

const STRIP_REPLAY_ATTRS = new Set([
  "data-ho-ignore",
  "data-cgxui-at-hidden",
  "data-cgxui-chat-geometry",
  "data-cgxui-chat-page-divider",
  "data-cgxui-chat-page-hidden",
  "data-cgxui-chat-page-no-answer",
  "data-cgxui-chat-page-no-answer-question-hidden",
  "data-cgxui-chat-page-question-hidden",
  "data-cgxui-chat-page-title-item",
  "data-cgxui-chat-page-title-list",
  "data-cgxui-chat-page-title-state",
  "data-cgxui-chat-page-title-wrapper",
  "data-cgxui-page-dividers",
  "data-cgxui-page-label-style",
  "data-h2o-archive-cold",
  "data-h2o-archive-msg-idx",
  "data-h2o-archive-pending",
  "data-h2o-cold",
  "data-h2o-cold-idx",
  "data-h2o-cold-turn-idx",
  "data-h2o-cold-layer"
]);

const STRIP_REPLAY_ATTR_PATTERNS = [
  /^data-h2o-x1n-sig$/i,
  /^data-h2o-x1n-csig$/i,
  /^data-h2o-qbg-sig$/i,
  /^data-h2o-x1bg-sig$/i,
  /^data-h2o-qbig-sig-num$/i,
  /^data-h2o-qbig-sig-pos$/i,
  /^data-h2o-qbig-hostfb$/i,
  /^data-cgxui-[^-]+-pre$/i,
  /^data-cgxui-[^-]+-bound$/i,
  /^data-cgxui-[^-]+-done$/i,
  /^data-cgxui-[^-]+-sig(?:-.+)?$/i
];

function shouldStripReplayAttr(el, attrName){
  const name = String(attrName || "").toLowerCase();
  if (!name) return false;
  if (STRIP_REPLAY_ATTRS.has(name)) return true;
  if (STRIP_REPLAY_ATTR_PATTERNS.some((re) => re.test(name))) return true;
  if (name === "data-ho-qwrap-done"){
    const hasPreservedQwrap =
      !!el?.querySelector?.(".cgxui-qswr, [data-h2o-qwrap-id], [data-ho-qwrap-id]");
    return !hasPreservedQwrap;
  }
  return false;
}

function unwrapReplayNode(node){
  if (!(node instanceof Element)) return;
  const parent = node.parentNode;
  if (!parent) return;
  while (node.firstChild){
    parent.insertBefore(node.firstChild, node);
  }
  node.remove();
}

function scrubReplayNode(root){
  if (!(root instanceof Element)) return;

  root.querySelectorAll(STALE_REPLAY_SUBTREE_SELECTORS.join(",")).forEach((node) => {
    try { node.remove(); } catch {}
  });
  root.querySelectorAll(REPLAY_UNWRAP_SELECTORS.join(",")).forEach((node) => {
    try { unwrapReplayNode(node); } catch {}
  });

  const all = [root, ...root.querySelectorAll("*")];
  all.forEach((el) => {
    for (const attr of [...el.attributes]){
      const name = String(attr.name || "").toLowerCase();
      if (name.startsWith("on")){
        try { el.removeAttribute(attr.name); } catch {}
        continue;
      }
      if ((name === "href" || name === "src") && /^\s*javascript:/i.test(String(attr.value || ""))){
        try { el.removeAttribute(attr.name); } catch {}
        continue;
      }
      if (shouldStripReplayAttr(el, attr.name)){
        try { el.removeAttribute(attr.name); } catch {}
      }
    }

    if (el.tagName === "A"){
      try {
        const href = el.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)){
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noreferrer noopener");
        }
      } catch {}
    }
  });
}

// Captured chatgpt.com turn HTML contains <svg><use href="/cdn/assets/sprites-core-*.svg#id"/></svg>
// references to ChatGPT's hashed sprite bundle. In the Studio document the absolute path
// resolves against the chrome-extension://<id>/ origin, which doesn't host /cdn/, producing
// repeated ERR_FILE_NOT_FOUND every time a reader mounts. We never need ChatGPT's UI sprites
// inside the Studio reader (they're chrome icons, not message content), so the safest fix is
// to neutralize the <use> reference at sanitization time. The empty <svg> wrapper stays so
// layout doesn't shift.
function neutralizeExternalUseHrefs(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  try {
    // Plain `href` (modern) and namespaced `xlink:href` (legacy).
    root.querySelectorAll("use[href], use[*|href]").forEach((useEl) => {
      try {
        const href = useEl.getAttribute("href") || useEl.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
        // Treat anything that points outside the current document fragment as unsafe in
        // the Studio context: absolute URLs, root-relative paths, and CDN-style hashed
        // sprite references all fail because the extension origin doesn't serve them.
        if (/^(https?:)?\/\//i.test(href) || href.startsWith("/") || /sprites-core-/i.test(href)) {
          useEl.remove();
        }
      } catch {}
    });
  } catch {}
}

function sanitizeRichTurnElement(htmlRaw){
  const html = String(htmlRaw || "").trim();
  if (!html) return null;

  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  tpl.content.querySelectorAll("script,link,iframe,object,embed,style").forEach((bad) => {
    try { bad.remove(); } catch {}
  });
  neutralizeExternalUseHrefs(tpl.content);

  const turnEl = findConversationTurnElement(tpl.content);
  if (!turnEl) return null;

  const cleanTurn = turnEl.cloneNode(true);
  scrubReplayNode(cleanTurn);
  // Defensive pass: scrubReplayNode might leave or rebuild <use> elements, so strip
  // any remaining cross-origin references once more on the cloned tree.
  neutralizeExternalUseHrefs(cleanTurn);
  return cleanTurn;
}

function normalizeRichTurns(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < src.length; i += 1){
    const row = src[i] && typeof src[i] === "object" ? src[i] : {};
    const turnIdx = Math.max(1, Math.floor(Number(row.turnIdx ?? row.idx ?? (i + 1)) || (i + 1)));
    const role = normalizeRole(row.role || row.author || "assistant");
    const outerHTML = String(row.outerHTML || row.html || "").trim();
    if (!outerHTML) continue;

    const item = { turnIdx, role, outerHTML };

    const createTime = Number(row.createTime ?? row.create_time ?? 0);
    const userCreateTime = Number(row.userCreateTime ?? row.user_create_time ?? 0);
    const assistantCreateTime = Number(row.assistantCreateTime ?? row.assistant_create_time ?? 0);
    const userMessageId = String(row.userMessageId || row.user_message_id || "").trim();
    const assistantMessageId = String(row.assistantMessageId || row.assistant_message_id || "").trim();

    if (Number.isFinite(createTime) && createTime > 0) item.createTime = createTime;
    if (Number.isFinite(userCreateTime) && userCreateTime > 0) item.userCreateTime = userCreateTime;
    if (Number.isFinite(assistantCreateTime) && assistantCreateTime > 0) item.assistantCreateTime = assistantCreateTime;
    if (userMessageId) item.userMessageId = userMessageId;
    if (assistantMessageId) item.assistantMessageId = assistantMessageId;
    if (row.messageTimes && typeof row.messageTimes === "object") item.messageTimes = { ...row.messageTimes };

    out.push(item);
  }
  out.sort((a, b) => Number(a.turnIdx) - Number(b.turnIdx));
  return out;
}

function normalizeTurnHighlights(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < src.length; i += 1){
    const row = src[i] && typeof src[i] === "object" ? src[i] : {};
    const turnIdx = Math.max(1, Math.floor(Number(row.turnIdx ?? row.answerIndex ?? (i + 1)) || (i + 1)));
    const colors = uniqStrings(row.colors || row.highlightColors || row.values || []);
    if (!colors.length) continue;
    out.push({ turnIdx, colors });
  }
  out.sort((a, b) => Number(a.turnIdx) - Number(b.turnIdx));
  return out;
}

function normalizeMiniMapDotColor(raw){
  const color = String(raw || "").trim();
  const lower = color.toLowerCase();
  const aliases = {
    gold: "#f7d34a",
    yellow: "#f7d34a",
    blue: "#66b5ff",
    pink: "#ff79c6",
    green: "#35c759",
    purple: "#a78bfa",
    orange: "#fb923c",
    red: "#f87171",
  };
  for (const [token, value] of Object.entries(aliases)){
    if (lower === token || lower.includes(token)) return value;
  }
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (/^(?:rgb|hsl)a?\([^)]+\)$/i.test(color)) return color;
  if (/^[a-z-]{3,32}$/i.test(lower)) return lower;
  return "";
}

const STUDIO_MM_COLOR_ORDER = ["blue", "red", "green", "gold", "sky", "pink", "purple", "orange"];

function normalizeMiniMapColorToken(raw){
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("gold") || value.includes("yellow") || value === "#ffd700" || value === "#f7d34a") return "gold";
  if (value.includes("blue") || value === "#66b5ff" || value === "#3a8bff") return "blue";
  if (value.includes("red") || value === "#f87171" || value === "#ff4a4a") return "red";
  if (value.includes("green") || value === "#35c759" || value === "#31d158") return "green";
  if (value.includes("purple") || value === "#a78bfa" || value === "#a36bff") return "purple";
  if (value.includes("pink") || value === "#ff79c6" || value === "#ff71c6") return "pink";
  if (value.includes("orange") || value === "#fb923c" || value === "#ffa63a") return "orange";
  if (value.includes("sky") || value === "#4cd3ff") return "sky";
  return "";
}

function resolveMiniMapTone(colors){
  const list = uniqStrings(colors || []);
  for (const color of list){
    const token = normalizeMiniMapColorToken(color);
    if (token) return token;
  }
  return "";
}

function buildExcerptFromMessages(messages){
  const firstAssistant = (messages || []).find((row) => normalizeRole(row?.role) === "assistant" && row?.text);
  const first = firstAssistant || (messages || [])[0];
  return normalizeText(first?.text || "").slice(0, 240);
}

function buildCanonicalMessage(role, text, meta = {}){
  const wrap = document.createElement("div");
  wrap.className = `cgMsg cgMsg--${role}`;
  wrap.setAttribute("data-message-author-role", role);
  if (meta.messageId) wrap.setAttribute("data-message-id", String(meta.messageId));
  if (meta.turnId) wrap.setAttribute("data-turn-id", String(meta.turnId));
  if (meta.dir) wrap.setAttribute("dir", String(meta.dir));

  const bodyEl = document.createElement("div");
  bodyEl.className = "cgMsgBody";
  bodyEl.innerHTML = renderTextAsChatGPTBlocks(text);

  wrap.appendChild(bodyEl);

  if (meta.answerIdx && role === "assistant"){
    wrap.dataset.turnIdx = String(meta.answerIdx);
  }
  return wrap;
}

function buildCanonicalTurn(role, text, meta = {}){
  const turn = document.createElement("section");
  turn.className = `cgTurn cgTurn--${role} wbTurn wbTurn--fallback wbTurn--${role}`;
  turn.setAttribute("data-testid", meta.turnNo > 0 ? `conversation-turn-${meta.turnNo}` : "conversation-turn");
  turn.setAttribute("data-turn", role);

  const messageEl = buildCanonicalMessage(role, text, meta);
  if (role === "assistant" && meta.answerIdx > 0){
    turn.dataset.turnIdx = String(meta.answerIdx);
  }
  stampReplayTurnMeta(turn, messageEl, meta.createTime, meta.turnNo);
  turn.appendChild(messageEl);
  return { turn, messageEl };
}

function decorateReplayTurn(turnEl, messageEl, role, meta = {}){
  if (!(turnEl instanceof Element) || !(messageEl instanceof Element)) return;

  turnEl.classList.add("cgTurn", `cgTurn--${role}`, "wbTurn", "wbTurn--rich", `wbTurn--${role}`);
  if (!isConversationTurnNode(turnEl)){
    turnEl.setAttribute("data-testid", meta.turnNo > 0 ? `conversation-turn-${meta.turnNo}` : "conversation-turn");
  }
  if (!turnEl.getAttribute("data-turn")) turnEl.setAttribute("data-turn", role);
  if (role === "assistant" && meta.answerIdx > 0){
    turnEl.dataset.turnIdx = String(meta.answerIdx);
    try { messageEl.dataset.turnIdx = String(meta.answerIdx); } catch {}
  }
  if (meta.messageId && !messageEl.getAttribute("data-message-id")){
    messageEl.setAttribute("data-message-id", String(meta.messageId));
  }
  if (meta.turnId && !messageEl.getAttribute("data-turn-id")){
    messageEl.setAttribute("data-turn-id", String(meta.turnId));
  }
  stampReplayTurnMeta(turnEl, messageEl, meta.createTime, meta.turnNo);
}

function captureMessageRenderState(messageEl){
  if (!(messageEl instanceof Element)) return null;
  return {
    className: messageEl.className,
    innerHTML: messageEl.innerHTML,
    role: String(messageEl.getAttribute("data-message-author-role") || ""),
  };
}

function restoreMessageRenderState(messageEl, snapshot){
  if (!(messageEl instanceof Element) || !snapshot) return;
  if (typeof snapshot.className === "string") messageEl.className = snapshot.className;
  if (typeof snapshot.innerHTML === "string") messageEl.innerHTML = snapshot.innerHTML;
  if (snapshot.role) messageEl.setAttribute("data-message-author-role", snapshot.role);
}

function applyEditedMessageBody(messageEl, role, text){
  if (!(messageEl instanceof Element)) return;
  messageEl.innerHTML = "";
  messageEl.setAttribute("data-message-author-role", role);
  messageEl.classList.add("cgMsg", `cgMsg--${role}`, "cgMsg--edited");

  const bodyEl = document.createElement("div");
  bodyEl.className = "cgMsgBody";
  bodyEl.innerHTML = renderTextAsChatGPTBlocks(text);
  messageEl.appendChild(bodyEl);
}

function attachAssistantEditButton(turnEl, messageEl, snapshotId, editKey){
  if (!(turnEl instanceof Element) || !(messageEl instanceof Element)) return;

  const sid = String(snapshotId || "");
  try { turnEl.querySelector(":scope > .wbEditBtn")?.remove(); } catch {}

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "wbEditBtn";
  editBtn.setAttribute("aria-label", "Edit this answer");
  editBtn.setAttribute("title", "Edit answer (saved locally)");
  editBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5Z"/></svg>`;

  editBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (turnEl.classList.contains("wbTurn--editing")) return;

    const visibleState = captureMessageRenderState(messageEl);
    const currentText = extractTurnPlaintext(messageEl);

    turnEl.classList.add("wbTurn--editing");
    mountEditTextarea(
      messageEl,
      sid,
      editKey,
      currentText,
      (newText) => {
        turnEl.classList.remove("wbTurn--editing");
        turnEl.classList.add("wbTurn--edited");
        applyEditedMessageBody(messageEl, "assistant", newText);

        try {
          W.H2O?.obs?.withSuppressed?.("studio:edit-save", () => {}, { flush: true });
          W.H2O?.index?.refresh?.("studio:edit-save");
        } catch {}
      },
      () => {
        turnEl.classList.remove("wbTurn--editing");
        restoreMessageRenderState(messageEl, visibleState);

        try {
          W.H2O?.obs?.withSuppressed?.("studio:edit-cancel", () => {}, { flush: true });
          W.H2O?.index?.refresh?.("studio:edit-cancel");
        } catch {}
      }
    );
  });

  turnEl.appendChild(editBtn);
}

function buildCanonicalConversation(container, snap){
  const messages = Array.isArray(snap?.messages) ? snap.messages : [];
  const assistantTurns = [];
  let answerIdx = 0;
  let turnNo = 0;

  for (const row of messages){
    const role = normalizeRole(row?.role);
    const text = String(row?.text || "");
    turnNo += 1;

    const rowCreateTime = resolveSnapshotTurnCreateTime(snap, row, turnNo - 1);
    const nextAnswerIdx = role === "assistant" ? (answerIdx + 1) : 0;
    const { turn, messageEl } = buildCanonicalTurn(role, text, {
      turnNo,
      answerIdx: nextAnswerIdx,
      createTime: rowCreateTime,
      messageId: row?.messageId || row?.id || "",
      turnId: row?.turnId || "",
      dir: row?.dir || "",
    });
    if (role === "assistant"){
      answerIdx = nextAnswerIdx;
      attachAssistantEditButton(turn, messageEl, snap?.snapshotId || "", turnNo);
      assistantTurns.push(turn);
    }
    container.appendChild(turn);
  }

  return assistantTurns;
}

function mountRichTurns(container, richTurns, snapshotId, snap){
  const sid = String(snapshotId || "");
  const normalized = normalizeRichTurns(richTurns);
  const assistantHosts = [];
  let assistantIdx = 0;

  for (let i = 0; i < normalized.length; i += 1){
    const turn = normalized[i];
    const turnNo = Number(turn.turnIdx || (i + 1)) || (i + 1);
    const createTime = resolveSnapshotTurnCreateTime(snap, turn, i);
    let host = sanitizeRichTurnElement(turn.outerHTML);
    let role = normalizeRole(turn.role);
    let messageEl = host ? findRoleHostInTurn(host, role) : null;

    if (host && messageEl){
      role = inferTurnRole(host, role);
    } else {
      const fallback = buildCanonicalTurn(role, extractPlaintextFromHtml(turn.outerHTML), {
        turnNo,
        answerIdx: role === "assistant" ? (assistantIdx + 1) : 0,
        createTime,
        messageId: role === "assistant" ? turn.assistantMessageId : turn.userMessageId,
      });
      host = fallback.turn;
      messageEl = fallback.messageEl;
    }

    if (!(host instanceof Element) || !(messageEl instanceof Element)) continue;

    const answerIdx = role === "assistant" ? (assistantIdx + 1) : 0;
    decorateReplayTurn(host, messageEl, role, {
      turnNo,
      answerIdx,
      createTime,
      messageId: role === "assistant" ? turn.assistantMessageId : turn.userMessageId,
    });

    const override = sid ? getEditOverride(sid, turn.turnIdx) : null;
    if (override !== null && role === "assistant"){
      host.classList.add("wbTurn--edited");
      applyEditedMessageBody(messageEl, role, override);
    }

    if (role === "assistant"){
      assistantIdx = answerIdx;
      attachAssistantEditButton(host, messageEl, sid, turn.turnIdx);
      assistantHosts.push(host);
    }

    container.appendChild(host);
  }

  return assistantHosts;
}

function appendMiniMapDots(btn, colors){
  const palette = uniqStrings(colors).slice(0, 4);
  if (!palette.length) return;
  btn.classList.add("has-dots");
  const dots = document.createElement("span");
  dots.className = "cgMMDots";
  for (const color of palette){
    const dot = document.createElement("span");
    dot.className = "cgMMDot";
    const safeColor = normalizeMiniMapDotColor(color);
    if (safeColor) dot.style.background = safeColor;
    dot.title = String(color || "");
    dots.appendChild(dot);
  }
  btn.appendChild(dots);
}

function buildMiniMap(mm, turnEls, turnHighlightsRaw = [], scrollEl = null){
  const items = (Array.isArray(turnEls) ? turnEls : []).filter(Boolean);
  const highlightRows = normalizeTurnHighlights(turnHighlightsRaw);
  const highlightMap = new Map(highlightRows.map((row) => [Number(row.turnIdx), row.colors.slice()]));
  mm.textContent = "";
  mm.hidden = items.length === 0;
  if (!items.length) return;

  const chrome = document.createElement("div");
  chrome.className = "cgMMChrome";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "cgMMToggle";
  toggle.setAttribute("aria-expanded", "true");

  const pagePill = document.createElement("div");
  pagePill.className = "cgMMPagePill";

  const list = document.createElement("div");
  list.className = "cgMMList";

  const dial = document.createElement("button");
  dial.type = "button";
  dial.className = "cgMMDial";
  dial.title = "Toggle navigation colors";
  dial.innerHTML = '<span class="cgMMDialDot"></span>';

  const colorNav = document.createElement("div");
  colorNav.className = "cgMMColorNav is-open";

  chrome.appendChild(toggle);
  chrome.appendChild(pagePill);
  chrome.appendChild(list);
  chrome.appendChild(dial);
  chrome.appendChild(colorNav);
  mm.appendChild(chrome);

  const host = scrollEl || document.querySelector(".wbMain") || document.querySelector(".cgScroll") || null;
  const pairs = [];
  const colorTargets = new Map();
  const colorState = new Map();
  let rafId = 0;
  let activeIndex = 0;
  let collapsed = false;

  function jumpToIndex(nextIndex){
    const pair = pairs[nextIndex];
    if (!pair) return;
    pair.turnEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    try {
      pair.turnEl.animate(
        [{ backgroundColor: "rgba(255,215,0,.10)" }, { backgroundColor: "" }],
        { duration: 560 }
      );
    } catch {}
  }

  function refreshColorLabels(){
    colorNav.querySelectorAll(".cgMMColorBtn").forEach((btn) => {
      const token = String(btn.dataset.color || "");
      const targets = colorTargets.get(token) || [];
      const stateEntry = colorState.get(token) || { current: 0 };
      const total = targets.length;
      const current = total ? Math.max(1, Math.min(total, Number(stateEntry.current || 1))) : 0;
      btn.textContent = total ? `${current}/${total}` : "0/0";
      btn.hidden = total === 0;
    });
  }

  function setActiveByIndex(nextIndex){
    activeIndex = Math.max(0, Math.min(pairs.length - 1, Number(nextIndex || 0)));
    pairs.forEach((pair, idx) => {
      const active = idx === activeIndex;
      pair.button.classList.toggle("active", active);
      pair.button.setAttribute("aria-current", active ? "true" : "false");
      if (active) {
        try { pair.button.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {}
      }
    });
    toggle.textContent = `${activeIndex + 1}/${pairs.length}`;
    pagePill.textContent = `PAGE ${Math.max(1, Math.ceil((activeIndex + 1) / 25))}`;
    toggle.title = `Answer ${activeIndex + 1} of ${pairs.length}`;
  }

  function syncActive(){
    rafId = 0;
    if (!pairs.length) return;
    const hostRect = host?.getBoundingClientRect?.() || null;
    const probeY = hostRect ? (hostRect.top + Math.min(hostRect.height * 0.28, 180)) : (window.innerHeight * 0.33);
    let bestIndex = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    pairs.forEach((pair, idx) => {
      const rect = pair.turnEl?.getBoundingClientRect?.();
      if (!rect) return;
      const mid = rect.top + (rect.height * 0.5);
      const dist = Math.abs(mid - probeY);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = idx;
      }
    });
    setActiveByIndex(bestIndex);
  }

  function queueSync(){
    if (rafId) return;
    rafId = requestAnimationFrame(syncActive);
  }

  items.forEach((turnEl, index) => {
    const answerIndex = index + 1;
    const turnIdx = Math.max(1, Math.floor(Number(turnEl?.dataset?.turnIdx || answerIndex) || answerIndex));
    const colors = highlightMap.get(answerIndex) || highlightMap.get(turnIdx) || [];
    const tone = resolveMiniMapTone(colors);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgMMBtn";
    button.dataset.index = String(answerIndex);
    if (tone) button.dataset.tone = tone;
    button.title = `Answer ${answerIndex}/${items.length}`;

    const num = document.createElement("span");
    num.className = "cgMMIndex";
    num.textContent = String(answerIndex);
    button.appendChild(num);
    appendMiniMapDots(button, colors);

    button.addEventListener("click", () => {
      setActiveByIndex(index);
      jumpToIndex(index);
      refreshColorLabels();
    });

    list.appendChild(button);
    pairs.push({ button, turnEl, turnIdx, colors, tone });

    uniqStrings(colors).forEach((color) => {
      const token = normalizeMiniMapColorToken(color);
      if (!token) return;
      const next = colorTargets.get(token) || [];
      next.push(index);
      colorTargets.set(token, next);
    });
  });

  STUDIO_MM_COLOR_ORDER.forEach((token) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cgMMColorBtn";
    btn.dataset.color = token;
    btn.dataset.tone = token;
    btn.title = `${token} navigation`;
    btn.addEventListener("click", () => {
      const targets = colorTargets.get(token) || [];
      if (!targets.length) return;
      const entry = colorState.get(token) || { current: 0 };
      entry.current = ((Number(entry.current || 0)) % targets.length) + 1;
      colorState.set(token, entry);
      const targetIndex = targets[entry.current - 1] ?? targets[0] ?? 0;
      setActiveByIndex(targetIndex);
      jumpToIndex(targetIndex);
      refreshColorLabels();
    });
    colorNav.appendChild(btn);
  });

  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    chrome.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  dial.addEventListener("click", () => {
    colorNav.classList.toggle("is-open");
    chrome.classList.toggle("nav-open", colorNav.classList.contains("is-open"));
  });

  host?.addEventListener("scroll", queueSync, { passive: true });
  list.addEventListener("scroll", refreshColorLabels, { passive: true });
  window.addEventListener("resize", queueSync, { passive: true });
  setActiveByIndex(0);
  refreshColorLabels();
  queueSync();
}

function normalizeOriginSource(raw){
  const value = String(raw || "").trim().toLowerCase();
  if (value === "mobile") return "mobile";
  if (value === "browser") return "browser";
  return "unknown";
}

function normalizeProjectRef(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const id = String(row.id || row.projectId || "").trim();
  if (!id) return null;
  const name = String(row.name || row.projectName || id).trim() || id;
  return { id, name };
}

function normalizeCategoryAssignment(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const primaryCategoryId = String(row.primaryCategoryId || row.primary || "").trim();
  if (!primaryCategoryId) return null;
  const secondaryCategoryId = String(row.secondaryCategoryId || row.secondary || "").trim() || null;
  if (secondaryCategoryId && secondaryCategoryId === primaryCategoryId) return null;
  const sourceRaw = String(row.source || "").trim().toLowerCase();
  const source = sourceRaw === "user" || sourceRaw === "manual_override" ? "user" : (sourceRaw === "system" || sourceRaw === "auto" ? "system" : "");
  if (!source) return null;
  if (source === "user") {
    return {
      primaryCategoryId,
      secondaryCategoryId,
      source,
      algorithmVersion: null,
      classifiedAt: null,
      overriddenAt: String(row.overriddenAt || row.classifiedAt || "").trim() || null,
      confidence: null,
    };
  }
  const algorithmVersion = String(row.algorithmVersion || "").trim();
  const classifiedAt = String(row.classifiedAt || "").trim();
  if (!algorithmVersion || !classifiedAt) return null;
  return {
    primaryCategoryId,
    secondaryCategoryId,
    source,
    algorithmVersion,
    classifiedAt,
    overriddenAt: null,
    confidence: Number.isFinite(Number(row.confidence)) ? Math.max(0, Math.min(1, Number(row.confidence))) : null,
  };
}

function normalizeStringArray(raw){
  return uniqStrings(Array.isArray(raw) ? raw : []);
}

function normalizeLabelAssignments(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  return {
    workflowStatusLabelId: String(row.workflowStatusLabelId || "").trim(),
    priorityLabelId: String(row.priorityLabelId || "").trim(),
    actionLabelIds: normalizeStringArray(row.actionLabelIds),
    contextLabelIds: normalizeStringArray(row.contextLabelIds),
    customLabelIds: normalizeStringArray(row.customLabelIds),
  };
}

function normalizeLabelRecord(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const id = String(row.id || "").trim();
  if (!id) return null;
  const rawType = String(row.type || "").trim();
  const type = ["workflow_status", "priority", "action", "context", "custom"].includes(rawType) ? rawType : "custom";
  return {
    id,
    name: String(row.name || row.title || id).trim() || id,
    type,
    color: String(row.color || "").trim(),
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.floor(Number(row.sortOrder)) : 0,
    createdAt: String(row.createdAt || "").trim(),
  };
}

function normalizeCategoryCatalogRecord(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const id = String(row.id || "").trim();
  if (!id) return null;
  const statusRaw = String(row.status || "").trim().toLowerCase();
  const status = ["active", "deprecated", "retired"].includes(statusRaw) ? statusRaw : "active";
  return {
    id,
    name: String(row.name || row.title || id).trim() || id,
    description: String(row.description || "").trim() || undefined,
    color: String(row.color || "").trim() || undefined,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Math.floor(Number(row.sortOrder)) : 0,
    createdAt: String(row.createdAt || "").trim(),
    updatedAt: String(row.updatedAt || "").trim() || undefined,
    status,
    replacementCategoryId: String(row.replacementCategoryId || "").trim() || null,
    aliases: normalizeStringArray(row.aliases),
  };
}

function normalizeCategoryCatalog(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src){
    const category = normalizeCategoryCatalogRecord(item);
    if (!category || seen.has(category.id)) continue;
    seen.add(category.id);
    out.push(category);
  }
  out.sort((a, b) => (
    Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.name || a.id).localeCompare(String(b.name || b.id))
    || String(a.id).localeCompare(String(b.id))
  ));
  return out;
}

function normalizeLabelCatalog(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src){
    const label = normalizeLabelRecord(item);
    if (!label || seen.has(label.id)) continue;
    seen.add(label.id);
    out.push(label);
  }
  out.sort((a, b) => (
    String(a.type || "").localeCompare(String(b.type || ""))
    || Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
    || String(a.name || a.id).localeCompare(String(b.name || b.id))
    || String(a.id).localeCompare(String(b.id))
  ));
  return out;
}

function resolveLabelName(labelId){
  const id = String(labelId || "").trim();
  if (!id) return "";
  const found = (state.labelCatalog || []).find((row) => row.id === id);
  return String(found?.name || "").trim();
}

function labelSearchTokens(labels){
  const ids = [
    labels?.workflowStatusLabelId,
    labels?.priorityLabelId,
    ...(labels?.actionLabelIds || []),
    ...(labels?.contextLabelIds || []),
    ...(labels?.customLabelIds || []),
  ].map((id) => String(id || "").trim()).filter(Boolean);
  const names = ids.map(resolveLabelName).filter(Boolean);
  return [...ids, ...names];
}

function normalizeKeywords(raw){
  return normalizeStringArray(raw);
}

function normalizeTags(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src){
    const tag = String(item || "").trim().toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function normalizeFolderRecord(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const id = String(row.id || row.folderId || "").trim();
  const name = String(row.name || row.title || id).trim() || id;
  const createdAt = String(row.createdAt || "").trim();
  const updatedAt = String(row.updatedAt || "").trim();
  const kind = String(row.kind || "").trim().toLowerCase() === "project_backed" ? "project_backed" : "local";
  const projectRef = normalizeProjectRef(row.projectRef);
  const iconColor = normalizeSidebarIconColor(row.iconColor || row.color || row.folderColor || row.accentColor || row.appearance?.color || "");
  const folder = { id, name, createdAt, updatedAt, kind, projectRef };
  if (iconColor) folder.iconColor = iconColor;
  const displayCountLabel = String(row.displayCountLabel || "").trim();
  if (displayCountLabel) folder.displayCountLabel = displayCountLabel;
  const badges = Array.isArray(row.badges) ? row.badges.map((badge) => String(badge || "").trim()).filter(Boolean) : [];
  if (badges.length) folder.badges = badges;
  ["canonicalCount", "knownCount", "savedCount", "linkedCount", "orphanCount", "localBindingCount"].forEach((key) => {
    if (row[key] != null) folder[key] = Number(row[key] || 0) || 0;
  });
  ["isCanonical", "isExtra", "isTestCandidate", "isConflict"].forEach((key) => {
    if (row[key] === true) folder[key] = true;
  });
  if (row.reviewBucket) folder.reviewBucket = String(row.reviewBucket || "").trim();
  if (row.source) folder.source = String(row.source || "").trim();
  return folder;
}

function normalizeWorkbenchRow(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const messages = Array.isArray(row.messages) ? row.messages : [];
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const snapshotId = String(row.snapshotId || meta.snapshotId || "").trim();
  const chatId = String(row.chatId || meta.chatId || "").trim();
  /* Phase K-1 — Linked rows (view: 'linked') are accepted without
   * snapshotId. Saved rows still require both ids. The view value
   * comes from projectLibraryIndexRowToWorkbenchInput; any other
   * caller-provided shape without a view defaults to saved-rules. */
  const rowView = String(row.view || meta.view || "").trim().toLowerCase();
  const isLinkedRow = rowView === "linked";
  if (!chatId) return null;
  if (!snapshotId && !isLinkedRow) return null;

  const title = String(row.title || meta.title || chatId).trim() || chatId;
  const excerpt = String(row.excerpt || meta.excerpt || buildExcerptFromMessages(messages)).trim();
  const createdAt = String(row.createdAt || row.updatedAt || meta.updatedAt || "").trim();
  const updatedAt = String(row.updatedAt || meta.updatedAt || createdAt).trim();
  const originalCreatedAt = resolveOriginalChatCreatedAt(row, meta, messages);
  const studioAddedAt = resolveStudioAddedAt(row, meta) || createdAt;
  const lastTurnAt = resolveLastTurnAt(row, meta, messages) || updatedAt;
  const messageCount = Number(row.messageCount || messages.length || meta.messageCount || 0);
  const answerCount = Number(row.answerCount || meta.answerCount || meta.answers || countAssistantTurns(messages));
  const pinned = !!(row.pinned ?? meta.pinned);
  const archived = !!(row.archived ?? meta.archived ?? (String(meta.state || "").trim().toLowerCase() === "archived"));
  const folderId = String(row.folderId || meta.folderId || meta.folder || "").trim();
  const folderName = String(row.folderName || meta.folderName || "").trim();
  const folderIconColor = normalizeSidebarIconColor(row.folderIconColor || meta.folderIconColor || row.folderColor || meta.folderColor || "");
  const tags = normalizeTags(row.tags ?? meta.tags);
  const originSource = normalizeOriginSource(row.originSource ?? meta.originSource);
  const originProjectRef = normalizeProjectRef(row.originProjectRef ?? meta.originProjectRef);
  const category = normalizeCategoryAssignment(row.category ?? meta.category);
  const labels = normalizeLabelAssignments(row.labels ?? meta.labels);
  const keywords = normalizeKeywords(row.keywords ?? meta.keywords);

  return {
    snapshotId,
    chatId,
    /* Phase K-1 — view tier ('saved' | 'linked'). Defaults to 'saved'
     * for legacy callers; only set to 'linked' when explicitly tagged
     * by projectLibraryIndexRowToWorkbenchInput. */
    view: isLinkedRow ? "linked" : "saved",
    title,
    excerpt,
    createdAt,
    updatedAt,
    originalCreatedAt,
    studioAddedAt,
    lastTurnAt,
    messageCount: Number.isFinite(messageCount) ? Math.max(0, Math.floor(messageCount)) : 0,
    answerCount: Number.isFinite(answerCount) ? Math.max(0, Math.floor(answerCount)) : 0,
    pinned,
    archived,
    folderId,
    folderName,
    folderIconColor,
    tags,
    originSource,
    originProjectRef,
    category,
    labels,
    keywords,
    /* Phase K-1 — linked-chat provenance fields. Empty strings on
     * saved rows; populated on linked rows from the Library Index
     * projection. */
    href: String(row.href || meta.href || ""),
    linkedAt: String(row.linkedAt || meta.linkedAt || ""),
    linkedFrom: String(row.linkedFrom || meta.linkedFrom || ""),
  };
}

async function readTitleStateForChat(chatId, chromeValues = null){
  const id = String(chatId || "").trim();
  if (!id) return null;
  const stateKey = `${CHAT_TITLE_STATE_KEY_PREFIX}${id}`;
  const bootKey = `${CHAT_TITLE_BOOT_KEY_PREFIX}${id}`;
  const legacyBootKey = `${LEGACY_CHAT_TITLE_BOOT_KEY_PREFIX}${id}`;

  const direct = normalizeTitleStatePayload(await readSharedRecord(stateKey, chromeValues));
  if (direct) return direct;

  const boot = normalizeTitleStatePayload(await readSharedRecord(bootKey, chromeValues));
  if (boot) return boot;

  let legacyBootRaw = null;
  try { legacyBootRaw = localStorage.getItem(legacyBootKey); } catch {}
  const legacyBoot = normalizeTitleStatePayload(decodeSharedRecord(legacyBootRaw));
  if (legacyBoot) return legacyBoot;

  return null;
}

async function readInterfaceMetaForChat(chatId, chromeValues = null, legacyMetaStore = {}){
  const id = String(chatId || "").trim();
  if (!id) return {};

  const mirrorKey = `${INTERFACE_META_MIRROR_KEY_PREFIX}${id}`;
  const mirror = await readSharedRecord(mirrorKey, chromeValues);
  const legacy = legacyMetaStore && typeof legacyMetaStore === "object" ? legacyMetaStore[id] : null;
  const heatKey = `${HEAT_OVERRIDE_KEY_PREFIX}${id}`;
  const pinKey = `${PIN_KEY_PREFIX}${id}`;
  const rowKey = `${ROW_TINT_KEY_PREFIX}${id}`;

  const chromeHeat = chromeValues && Object.prototype.hasOwnProperty.call(chromeValues, heatKey)
    ? chromeValues[heatKey]
    : null;
  const chromePin = chromeValues && Object.prototype.hasOwnProperty.call(chromeValues, pinKey)
    ? chromeValues[pinKey]
    : null;
  const chromeRow = chromeValues && Object.prototype.hasOwnProperty.call(chromeValues, rowKey)
    ? chromeValues[rowKey]
    : null;

  let localHeat = "";
  let localPinned = false;
  let localRow = -1;
  try { localHeat = localStorage.getItem(heatKey) || ""; } catch {}
  try { localPinned = localStorage.getItem(pinKey) === "1"; } catch {}
  try { localRow = Number.parseInt(localStorage.getItem(rowKey) || "-1", 10); } catch {}

  return {
    ...(legacy && typeof legacy === "object" ? legacy : {}),
    ...(mirror && typeof mirror === "object" ? mirror : {}),
    heatOverride: normalizeHeatLevel((mirror && mirror.heatOverride) || chromeHeat || localHeat || "auto"),
    pinned: !!((mirror && mirror.pinned) || chromePin === "1" || chromePin === true || localPinned),
    rowTint: toRowTintIndex((mirror && mirror.rowTint) ?? chromeRow ?? localRow, -1),
  };
}

async function enrichRowsWithNativeInterfaceData(rows){
  const baseRows = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
  const ids = uniqStrings(baseRows.map((row) => row.chatId));
  if (!ids.length) return baseRows;

  const sharedKeys = ids.flatMap((id) => [
    `${CHAT_TITLE_STATE_KEY_PREFIX}${id}`,
    `${CHAT_TITLE_BOOT_KEY_PREFIX}${id}`,
    `${INTERFACE_META_MIRROR_KEY_PREFIX}${id}`,
    `${HEAT_OVERRIDE_KEY_PREFIX}${id}`,
    `${PIN_KEY_PREFIX}${id}`,
    `${ROW_TINT_KEY_PREFIX}${id}`,
  ]);
  const chromeValues = await chromeStorageGet(sharedKeys).catch(() => ({}));
  const legacyMetaStore = readLocalJson(INTERFACE_META_KEY, {}) || {};

  const out = await Promise.all(baseRows.map(async (row) => {
    const titleState = await readTitleStateForChat(row.chatId, chromeValues);
    const interfaceMeta = await readInterfaceMetaForChat(row.chatId, chromeValues, legacyMetaStore);
    const title = composeTitleFromState(titleState, row.title);
    const originalCreatedAt = firstTimestamp(interfaceMeta.createdAt, row.originalCreatedAt);
    const answerCount = toWholeCount(interfaceMeta.answers ?? interfaceMeta.answerCount, row.answerCount || 0);
    const heatOverride = normalizeHeatLevel(interfaceMeta.heatOverride);
    const pinned = !!(row.pinned || interfaceMeta.pinned);

    state.titleStateByChat[row.chatId] = titleState || {};
    state.interfaceMetaByChat[row.chatId] = interfaceMeta || {};

    const next = {
      ...row,
      title,
      titleState: titleState || null,
      interfaceMeta,
      originalCreatedAt: originalCreatedAt || row.originalCreatedAt,
      answerCount,
      heatOverride,
      rowTint: toRowTintIndex(interfaceMeta.rowTint, -1),
      pinned,
    };
    next.heatLevel = computeHeatLevel(next);
    return next;
  }));

  return out;
}

async function buildRowsFromChatIds(chatIds){
  const rows = [];
  const ids = uniqStrings(chatIds);
  const maxWorkers = 6;
  let index = 0;

  async function worker(){
    while (index < ids.length){
      const current = ids[index];
      index += 1;

      const [latest, snapshots] = await Promise.all([
        callArchive("loadLatestSnapshot", { chatId: current }).catch(() => null),
        callArchive("listSnapshots", { chatId: current }).catch(() => []),
      ]);

      if (!latest) continue;
      const pinned = Array.isArray(snapshots) && snapshots.some((row) => !!row?.pinned);
      const normalized = normalizeWorkbenchRow({
        ...latest,
        pinned,
        archived: latest?.archived ?? latest?.meta?.archived ?? (String(latest?.meta?.state || "").trim().toLowerCase() === "archived"),
      });
      if (normalized) rows.push(normalized);
    }
  }

  await Promise.all(Array.from({ length: Math.min(maxWorkers, ids.length) }, worker));
  return rows;
}

// ── Desktop reader / list (M2a-3j) ──────────────────────────────────────────
// On Tauri Studio Desktop, the workbench list is sourced from
// H2O.LibraryIndex (which already reads from store.chats + folder/label/
// tag/category binding stores via M2a-3g). This pure mapper translates a
// LibraryIndex compact row into the raw shape that normalizeWorkbenchRow
// accepts. Saved rows must carry snapshotId; linked-only rows
// (view === 'linked', state.isLinked && !state.isSaved) are passed
// through with snapshotId === '' — Phase K-1 widens the previous
// snapshot-required guard so the Linked Chats view (#/linked) can
// render Add-to-Library records without a captured transcript.
function projectLibraryIndexRowToWorkbenchInput(liRow){
  if (!liRow || typeof liRow !== 'object') return null;
  const chatId = String(liRow.chatId || '').trim();
  const snapshotId = String(liRow.snapshotId || '').trim();
  const liView = String(liRow.view || '').toLowerCase();
  const isLinkedRow = liView === 'linked';
  /* Saved rows still require snapshotId; linked-only rows do not. */
  if (!chatId) return null;
  if (!snapshotId && !isLinkedRow) return null;

  // LI carries timestamps as epoch ms (capturedAt, updatedAt);
  // normalizeWorkbenchRow expects ISO strings. Same conversion edge as
  // M2a-3i's projectSqliteSnapshotToCanonical.
  function toIso(epochMs){
    if (!epochMs || typeof epochMs !== 'number' || epochMs <= 0) return '';
    try { return new Date(epochMs).toISOString(); }
    catch { return ''; }
  }
  const updatedAtIso = toIso(liRow.updatedAt);
  const capturedAtIso = toIso(liRow.capturedAt);

  const labelNames = Array.isArray(liRow.labels) ? liRow.labels : [];
  const tagNames   = Array.isArray(liRow.tags)   ? liRow.tags   : [];

  return {
    snapshotId: snapshotId || '',
    chatId,
    view: isLinkedRow ? 'linked' : 'saved',
    title: liRow.title || '',
    createdAt: capturedAtIso || updatedAtIso || '',
    updatedAt: updatedAtIso || '',
    messageCount: Number(liRow.messageCount || 0),
    answerCount: Number(liRow.answerCount || 0),
    pinned: !!liRow.pinned,
    archived: !!liRow.archived,
    folderId: liRow.folderId || '',
    folderName: liRow.folderName || '',
    tags: tagNames.slice(),
    labels: labelNames.map((name) => ({ id: name, name, label: name })),
    category: (liRow.categoryId || liRow.categoryName)
      ? { id: liRow.categoryId || '', name: liRow.categoryName || '', label: liRow.categoryName || liRow.categoryId || '' }
      : null,
    keywords: [],
    /* Phase K-1 — propagate linked-chat provenance so the row renderer
     * can surface "Open original" + Linked-from metadata without re-
     * reading the Chat Registry. Empty strings on saved rows. */
    href: String(liRow.href || liRow.normalizedHref || ''),
    linkedAt: typeof liRow.linkedAt === 'number' ? toIso(liRow.linkedAt) : String(liRow.linkedAt || ''),
    linkedFrom: String(liRow.linkedFrom || ''),
    meta: {
      title: liRow.title || '',
      folderId: liRow.folderId || '',
      folderName: liRow.folderName || '',
      messageCount: Number(liRow.messageCount || 0),
      updatedAt: updatedAtIso || '',
    },
  };
}

function hasLibraryIndexRowsApi(){
  const raw = W.H2O?.LibraryIndex?.getAll;
  return typeof raw === "function"
    || Array.isArray(raw)
    || !!(raw && typeof raw.length === "number");
}

function readLibraryIndexRows(){
  const idx = W.H2O?.LibraryIndex;
  const raw = idx?.getAll;
  try {
    const rows = typeof raw === "function" ? raw.call(idx) : raw;
    if (Array.isArray(rows)) return rows.slice();
    if (rows && typeof rows.length === "number") return Array.from(rows);
  } catch {}
  return [];
}

function readLinkedWorkbenchRowsFromLibraryIndex(){
  return readLibraryIndexRows()
    .filter((row) => String(row?.view || "").toLowerCase() === "linked")
    .map(projectLibraryIndexRowToWorkbenchInput)
    .filter(Boolean)
    .map(normalizeWorkbenchRow)
    .filter(Boolean);
}

function mergeLinkedLibraryIndexRows(baseRows){
  const out = Array.isArray(baseRows) ? baseRows.slice() : [];
  const seenChatIds = new Set();
  for (const row of out){
    const chatId = String(row?.chatId || "").trim();
    if (chatId) seenChatIds.add(chatId);
  }
  for (const row of readLinkedWorkbenchRowsFromLibraryIndex()){
    const chatId = String(row?.chatId || "").trim();
    if (!chatId || seenChatIds.has(chatId)) continue;
    out.push(row);
    seenChatIds.add(chatId);
  }
  return out;
}

async function fetchWorkbenchRows(force = false){
  if (!force && Array.isArray(state.rowsCache)) return state.rowsCache.slice();

  state.lastFetchDiag = { source: "", directOk: false, idsOk: false, errors: [] };

  // Desktop (Tauri) — M2a-3j: project saved-snapshot rows from
  // H2O.LibraryIndex (already wired to SQLite stores via M2a-3g) instead
  // of going through the MV3 archive bridge. normalizeWorkbenchRow's
  // snapshotId guard naturally drops linked-only chats; the callArchive
  // interceptors below stay as a defensive fallback if LibraryIndex
  // happens to be unavailable. On failure here we fall through to the
  // archive path (which on Desktop returns [] via the M2a-3i sidebar
  // interceptors), preserving the empty-state UI rather than throwing.
  if (STUDIO_isTauri() && hasLibraryIndexRowsApi()) {
    try {
      const liRows = readLibraryIndexRows();
      const raw = liRows.map(projectLibraryIndexRowToWorkbenchInput).filter(Boolean);
      state.rowsCache = raw.map(normalizeWorkbenchRow).filter(Boolean);
      state.lastFetchDiag = { source: 'desktop-library-index', directOk: true, idsOk: false, errors: [] };
      return state.rowsCache.slice();
    } catch (e) {
      state.lastFetchDiag = { source: 'desktop-library-index', directOk: false, idsOk: false, errors: [String(e?.message || e)] };
      // Fall through to the (empty-result) archive path as safety net.
    }
  }

  const direct = await tryArchiveOps(LIST_ROW_OPS, {});
  if (direct.ok && Array.isArray(direct.result)){
    state.lastFetchDiag = { source: direct.op, directOk: true, idsOk: false, errors: [] };
    state.rowsCache = mergeLinkedLibraryIndexRows(direct.result.map(normalizeWorkbenchRow).filter(Boolean));
    return state.rowsCache.slice();
  }

  const directErr = direct.error?.message || "";
  const idsAttempt = await tryArchiveOps(CHAT_ID_OPS, {});
  if (idsAttempt.ok && Array.isArray(idsAttempt.result)){
    state.lastFetchDiag = { source: idsAttempt.op, directOk: false, idsOk: true, errors: directErr ? [directErr] : [] };
    state.rowsCache = mergeLinkedLibraryIndexRows(await buildRowsFromChatIds(idsAttempt.result));
    return state.rowsCache.slice();
  }

  const errors = [directErr, idsAttempt.error?.message || ""].filter(Boolean);
  const linkedRows = readLinkedWorkbenchRowsFromLibraryIndex();
  if (linkedRows.length){
    state.lastFetchDiag = { source: "library-index-linked", directOk: false, idsOk: false, errors };
    state.rowsCache = linkedRows;
    return state.rowsCache.slice();
  }
  state.lastFetchDiag = { source: "", directOk: false, idsOk: false, errors };
  throw new Error(errors.join(" · ") || "Studio listing is unavailable because the archive background does not expose a list operation yet.");
}

function normalizeFolderCatalog(raw){
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of src){
    const folder = normalizeFolderRecord(row);
    if (!folder.id || seen.has(folder.id)) continue;
    out.push(folder);
    seen.add(folder.id);
  }
  return out;
}

function normalizeSidebarIconColor(raw){
  const value = String(raw || "").trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : "";
}

function mergeFolderCatalogs(...lists){
  const out = [];
  const seen = new Set();
  for (const raw of lists){
    for (const item of normalizeFolderCatalog(raw)){
      if (seen.has(item.id)){
        const existing = out.find((row) => row.id === item.id);
        if (existing && (!existing.name || existing.name === existing.id) && item.name) {
          existing.name = item.name;
        }
        if (existing && !existing.iconColor && item.iconColor) {
          existing.iconColor = item.iconColor;
        }
        if (existing && !existing.displayCountLabel && item.displayCountLabel) {
          existing.displayCountLabel = item.displayCountLabel;
        }
        ["canonicalCount", "knownCount", "savedCount", "linkedCount", "orphanCount", "localBindingCount"].forEach((key) => {
          if (existing && existing[key] == null && item[key] != null) existing[key] = item[key];
        });
        if (existing && Array.isArray(item.badges) && item.badges.length) {
          existing.badges = Array.from(new Set([...(existing.badges || []), ...item.badges]));
        }
        ["isCanonical", "isExtra", "isTestCandidate", "isConflict"].forEach((key) => {
          if (existing && item[key] === true) existing[key] = true;
        });
        continue;
      }
      out.push({ ...item });
      seen.add(item.id);
    }
  }
  return out;
}

function deriveFolderCatalogFromRows(rows){
  const derived = [];
  const seen = new Set();
  for (const row of (Array.isArray(rows) ? rows : [])){
    const folderId = String(row?.folderId || "").trim();
    if (!folderId || seen.has(folderId)) continue;
    derived.push({
      id: folderId,
      name: String(row?.folderName || folderId).trim() || folderId,
      createdAt: "",
      updatedAt: "",
      kind: "local",
      projectRef: null,
      iconColor: normalizeSidebarIconColor(row?.folderIconColor || ""),
    });
    seen.add(folderId);
  }
  derived.sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
  return derived;
}

function normalizeFolderBinding(raw){
  const src = raw && typeof raw === "object" ? raw : {};
  const binding = {
    folderId: String(src.folderId || src.id || "").trim(),
    folderName: String(src.folderName || src.name || src.title || "").trim(),
  };
  const source = String(src.folderBindingSource || "").trim().toLowerCase();
  if (source === "auto" || source === "user") binding.folderBindingSource = source;
  return binding;
}

function normalizeFolderBindingMap(raw){
  const out = new Map();
  if (Array.isArray(raw)){
    for (const row of raw){
      const chatId = String(row?.chatId || "").trim();
      if (!chatId) continue;
      out.set(chatId, normalizeFolderBinding(row));
    }
    return out;
  }
  if (!raw || typeof raw !== "object") return out;
  for (const [chatId, value] of Object.entries(raw)){
    const id = String(chatId || "").trim();
    if (!id) continue;
    out.set(id, normalizeFolderBinding(value));
  }
  return out;
}

function resolveFolderName(folderId){
  const id = String(folderId || "").trim();
  if (!id) return "";
  const fromCatalog = state.folderCatalog.find((row) => row.id === id);
  if (fromCatalog?.name) return fromCatalog.name;
  const fromRows = (state.rowsCache || []).find((row) => String(row.folderId || "").trim() === id);
  if (fromRows?.folderName) return fromRows.folderName;
  return id;
}

function getSelectedRow(){
  const sid = String(state.selectedSnapshotId || state.currentReaderSnapshot?.snapshotId || "").trim();
  if (!sid) return null;
  return (state.rowsCache || []).find((row) => row.snapshotId === sid) || null;
}

function getSelectedFolderId(){
  const row = getSelectedRow();
  if (row) return String(row.folderId || "").trim();
  return String(state.currentReaderSnapshot?.meta?.folderId || "").trim();
}

function rememberFolderBindings(map){
  for (const [chatId, binding] of map.entries()){
    state.folderBindingsByChat[chatId] = normalizeFolderBinding(binding);
  }
}

// ── Library Workspace facade integration ──────────────────────────────────────
// Prefer H2O.LibraryWorkspace (canonical model facade from S0F1b) when it has
// already booted. The facade memoises results, dedups in-flight calls, and
// emits library-workspace:updated when state changes (so we can re-render
// without polling). If the facade isn't ready yet we fall back to the original
// direct archive bridge call — identical behavior to pre-migration, so this is
// a strict opportunistic upgrade with zero regression risk.
function getLibraryWorkspace(){
  try { return W.H2O?.LibraryWorkspace || null; } catch { return null; }
}

function mapFolderParityRowsToCatalog(rows){
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const folderId = String(row?.folderId || row?.id || "").trim();
    if (!folderId) return null;
    return {
      id: folderId,
      folderId,
      name: String(row?.name || folderId).trim() || folderId,
      createdAt: "",
      updatedAt: "",
      kind: "local",
      projectRef: null,
      iconColor: normalizeSidebarIconColor(row?.iconColor || row?.color || ""),
      source: String(row?.source || "folder-parity-display-model").trim(),
      displayCountLabel: String(row?.displayCountLabel || "").trim(),
      canonicalCount: Number(row?.canonicalCount || 0) || 0,
      knownCount: Number(row?.knownCount || 0) || 0,
      savedCount: Number(row?.savedCount || 0) || 0,
      linkedCount: Number(row?.linkedCount || 0) || 0,
      orphanCount: Number(row?.orphanCount || 0) || 0,
      localBindingCount: Number(row?.localBindingCount || 0) || 0,
      badges: Array.isArray(row?.badges) ? row.badges.map((badge) => String(badge || "").trim()).filter(Boolean) : [],
      isCanonical: row?.isCanonical === true,
      isExtra: row?.isExtra === true,
      isTestCandidate: row?.isTestCandidate === true,
      isConflict: row?.isConflict === true,
      reviewBucket: String(row?.reviewBucket || "").trim(),
    };
  }).filter(Boolean);
}

async function fetchFolderParityCatalog(force = false){
  // Kept for back-compat with any non-renderer consumer that still wants the
  // union. The canonical sidebar path uses fetchFolderParityPartition.
  const api = W.H2O?.Library?.FolderParity;
  if (typeof api?.getDisplayModel !== "function") return [];
  const model = await api.getDisplayModel({ fresh: !!force });
  const rows = mapFolderParityRowsToCatalog(model?.rows || []);
  return rows.length ? rows : [];
}

async function fetchFolderParityPartition(force = false){
  const api = W.H2O?.Library?.FolderParity;
  if (typeof api?.getDisplayModel !== "function") {
    return { canonical: [], review: [], fallbackUsed: false };
  }
  const model = await api.getDisplayModel({ fresh: !!force });
  return {
    canonical: mapFolderParityRowsToCatalog(model?.canonicalRows || []),
    review: mapFolderParityRowsToCatalog(model?.localReviewRows || []),
    fallbackUsed: !!model?.fallbackUsed,
  };
}

async function fetchFolderCatalog(force = false){
  const cachedCatalog = Array.isArray(state.folderCatalog) ? state.folderCatalog : [];
  const cachedReview = Array.isArray(state.folderLocalReview) ? state.folderLocalReview : [];
  if (!force && cachedCatalog.length){
    return { canonical: cachedCatalog.slice(), review: cachedReview.slice() };
  }
  try {
    const partition = await fetchFolderParityPartition(force);
    state.folderCatalog = normalizeFolderCatalog(partition.canonical);
    state.folderLocalReview = normalizeFolderCatalog(partition.review);
    return {
      canonical: Array.isArray(state.folderCatalog) ? state.folderCatalog.slice() : [],
      review: Array.isArray(state.folderLocalReview) ? state.folderLocalReview.slice() : [],
    };
  } catch { /* FolderParity is the sole canonical source per P8a contract. No
                ws.getFolders or archive-ops fallback — FolderParity's internal
                KNOWN_NATIVE_CANONICAL_FOLDERS provides the cold-boot fallback. */ }
  return { canonical: cachedCatalog.slice(), review: cachedReview.slice() };
}

async function fetchLabelCatalog(force = false){
  if (!force && Array.isArray(state.labelCatalog) && state.labelCatalog.length) return state.labelCatalog.slice();
  const ws = getLibraryWorkspace();
  if (ws?.getLabels){
    try {
      const list = await ws.getLabels({ fresh: !!force });
      if (Array.isArray(list)){
        state.labelCatalog = normalizeLabelCatalog(list);
        return Array.isArray(state.labelCatalog) ? state.labelCatalog.slice() : [];
      }
    } catch { /* fall through to archive bridge */ }
  }
  const attempt = await tryArchiveOps(LABEL_CATALOG_OPS, {});
  if (attempt.ok){
    state.labelCatalog = normalizeLabelCatalog(attempt.result);
  }
  return Array.isArray(state.labelCatalog) ? state.labelCatalog.slice() : [];
}

async function fetchCategoryCatalog(force = false){
  if (!force && Array.isArray(state.categoryCatalog) && state.categoryCatalog.length) return state.categoryCatalog.slice();
  const ws = getLibraryWorkspace();
  if (ws?.getCategories){
    try {
      const list = await ws.getCategories({ fresh: !!force });
      if (Array.isArray(list)){
        state.categoryCatalog = normalizeCategoryCatalog(list);
        return Array.isArray(state.categoryCatalog) ? state.categoryCatalog.slice() : [];
      }
    } catch { /* fall through to archive bridge */ }
  }
  const attempt = await tryArchiveOps(CATEGORY_CATALOG_OPS, {});
  if (attempt.ok){
    state.categoryCatalog = normalizeCategoryCatalog(attempt.result);
  }
  return Array.isArray(state.categoryCatalog) ? state.categoryCatalog.slice() : [];
}

// One-time subscription: when Library Workspace cache busts (folder binding
// change, category change, cross-surface sync), drop our local catalog caches
// so the next fetch picks up the canonical model. This is fire-and-forget — if
// Workspace isn't ready, we wire the listener once it emits its ready event.
(function wireLibraryWorkspaceSubscription(){
  function attach(){
    const ws = getLibraryWorkspace();
    if (!ws || typeof ws.subscribe !== 'function') return false;
    ws.subscribe((evt) => {
      const reason = String(evt?.reason || '');
      // Only bust on changes that actually affect catalogs (not on every
      // route-change/index-tick).
      if (['folder-binding-changed','category-changed','index-updated','cache-bust','cross-surface-sync'].includes(reason)){
        state.folderCatalog = [];
        state.folderLocalReview = [];
        state.categoryCatalog = [];
        state.labelCatalog = [];
      }
    });
    return true;
  }
  if (!attach()){
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => { attach(); }, { once: true });
  }
  // Also listen for Library Sync's cross-surface-sync event independently so
  // we catch native-originated changes even if the Workspace facade is slow.
  const handleCatalogBroadcast = () => {
    state.folderCatalog = [];
    state.folderLocalReview = [];
    state.categoryCatalog = [];
    state.labelCatalog = [];
    renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);
    renderFolderAssignmentControl();
  };
  W.addEventListener('evt:h2o:library:cross-surface-sync', handleCatalogBroadcast);
  W.addEventListener('evt:h2o:folders:changed', handleCatalogBroadcast);
  W.addEventListener('evt:h2o:labels:changed', handleCatalogBroadcast);
})();

function resolveCategoryRecord(categoryId){
  const id = String(categoryId || "").trim();
  if (!id) return null;
  return (state.categoryCatalog || []).find((row) => row.id === id) || null;
}

function resolveCategoryName(categoryId){
  const id = String(categoryId || "").trim();
  if (!id) return "Uncategorized";
  return String(resolveCategoryRecord(id)?.name || "Uncategorized");
}

function updateRowCategory(snapshotId, category){
  const sid = String(snapshotId || "").trim();
  if (!sid) return;
  const normalized = normalizeCategoryAssignment(category);
  if (Array.isArray(state.rowsCache)){
    state.rowsCache = state.rowsCache.map((row) => (
      row.snapshotId === sid ? { ...row, category: normalized } : row
    ));
  }
  if (state.currentReaderSnapshot?.snapshotId === sid) {
    const meta = state.currentReaderSnapshot.meta && typeof state.currentReaderSnapshot.meta === "object"
      ? state.currentReaderSnapshot.meta
      : {};
    state.currentReaderSnapshot.meta = {
      ...meta,
      category: normalized,
    };
  }
}

function applySnapshotCategoryUpdate(snap){
  if (!snap || typeof snap !== "object") return;
  const sid = String(snap.snapshotId || "").trim();
  if (!sid) return;
  const meta = snap.meta && typeof snap.meta === "object" ? snap.meta : {};
  updateRowCategory(sid, meta.category);
  if (state.currentReaderSnapshot?.snapshotId === sid) {
    state.currentReaderSnapshot = {
      ...state.currentReaderSnapshot,
      ...snap,
      meta: {
        ...(state.currentReaderSnapshot.meta && typeof state.currentReaderSnapshot.meta === "object" ? state.currentReaderSnapshot.meta : {}),
        ...meta,
      },
    };
  }
}

async function resolveFolderBindingsForChatIds(chatIds){
  const ids = uniqStrings(chatIds);
  if (!ids.length) return new Map();

  const attempt = await tryArchiveOps(FOLDER_BINDING_OPS, { chatIds: ids });
  if (!attempt.ok) {
    const fallback = new Map();
    for (const chatId of ids){
      if (!Object.prototype.hasOwnProperty.call(state.folderBindingsByChat, chatId)) continue;
      fallback.set(chatId, normalizeFolderBinding(state.folderBindingsByChat[chatId]));
    }
    return fallback;
  }

  const map = normalizeFolderBindingMap(attempt.result);
  rememberFolderBindings(map);
  return map;
}

function mergeRowFolderData(row, bindingMap){
  const next = { ...row };
  const hasBinding = bindingMap.has(next.chatId);
  const binding = hasBinding ? normalizeFolderBinding(bindingMap.get(next.chatId)) : null;

  if (binding){
    next.folderId = binding.folderId;
    next.folderName = binding.folderId
      ? (binding.folderName || resolveFolderName(binding.folderId) || binding.folderId)
      : "";
  } else if (next.folderId) {
    next.folderName = String(next.folderName || resolveFolderName(next.folderId) || next.folderId).trim();
  } else {
    next.folderName = "";
  }

  return next;
}

async function enrichRowsWithFolderData(rows, force = false){
  const baseRows = await enrichRowsWithNativeInterfaceData(rows);
  const [, bindingMap] = await Promise.all([
    fetchFolderCatalog(force).catch(() => ({ canonical: [], review: [] })),
    resolveFolderBindingsForChatIds(baseRows.map((row) => row.chatId)).catch(() => new Map()),
  ]);
  // fetchFolderCatalog already wrote state.folderCatalog (canonical) and
  // state.folderLocalReview (review). Row-derived folders no longer pollute
  // the canonical sidebar per P8a contract.
  const merged = baseRows.map((row) => mergeRowFolderData(row, bindingMap));
  state.rowsCache = merged.slice();
  return merged;
}

function matchesView(row, view){
  if (!row) return false;
  const next = normalizeArchiveView(view);
  if (next === "pinned") return !!row.pinned;
  if (next === "archive") return !!row.archived;
  /* Phase K-1 — Linked view: only rows projected as linked-only by
   * Library Index (state.isLinked && !state.isSaved). Saved rows
   * (even if they also carry linked metadata) belong in #/saved by
   * the precedence rule documented in normalizeLinkedOnlyProjection. */
  if (next === "linked") return String(row.view || "").toLowerCase() === "linked";
  /* Saved view: explicitly exclude linked-only rows so a chat without
   * a snapshot does not surface alongside Saved snapshots. */
  if (next === "saved") return !row.archived && String(row.view || "").toLowerCase() !== "linked";
  return true;
}

function matchesFolder(row, folderId){
  const filterId = normalizeFolderFilter(folderId);
  if (!filterId) return true;
  const rowFolderId = String(row?.folderId || "").trim();
  if (filterId === FOLDER_FILTER_NONE) return !rowFolderId;
  return rowFolderId === filterId;
}

function filterRows(rows, view, query, folderId = "", tagFilter = ""){
  const q = normalizeText(query).toLowerCase();
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!matchesView(row, view)) return false;
    if (!matchesFolder(row, folderId)) return false;
    if (tagFilter && !(Array.isArray(row.tags) ? row.tags : []).includes(tagFilter)) return false;

    if (!q) return true;
    const labels = row?.labels || {};
    /* Phase K-1 — Linked rows carry href + linkedFrom (canonical URL +
     * provenance source). Include both in the search haystack so the
     * Linked Chats view can be filtered by URL or origin. Empty for
     * Saved rows, so the only change for non-linked rows is two extra
     * empty tokens — no behavioral difference. */
    const haystack = [
      row.title,
      row.excerpt,
      row.chatId,
      row.folderId,
      row.folderName,
      row.originSource,
      row.href || "",
      row.linkedFrom || "",
      row?.category?.primaryCategoryId,
      row?.category?.secondaryCategoryId,
      ...labelSearchTokens(labels),
      ...(row.tags || []),
      ...(row.keywords || []),
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });

  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });
  return filtered;
}

function setActiveNav(view){
  const next = normalizeArchiveView(view);
  state.lastView = next;
  $$(".wbNavItem[data-view]").forEach((node) => {
    node.classList.toggle("active", String(node.dataset.view || "") === next);
  });
}

function setActiveFolder(folderId){
  const selected = normalizeFolderFilter(folderId);
  state.lastFolderId = selected;
  $$(".wbFolderItem[data-folder-id]").forEach((node) => {
    node.classList.toggle("active", String(node.dataset.folderId || "") === selected);
  });
}

function buildFilterPill(label, accent = false){
  return `<span class="wbFilterPill${accent ? " wbFilterPill--accent" : ""}">${esc(label)}</span>`;
}

function renderListHeader(allRows, filteredRows, view, folderId, query){
  const totalForView = (Array.isArray(allRows) ? allRows : []).filter((row) => matchesView(row, view)).length;
  const folderLabel = folderId === FOLDER_FILTER_NONE
    ? "Unfiled"
    : (folderId ? resolveFolderName(folderId) : "All folders");

  const title = viewCopy(view);
  let subtitle = `${pluralize(filteredRows.length, "chat")} shown`;
  if (totalForView !== filteredRows.length) subtitle += ` of ${pluralize(totalForView, "chat")}`;
  if (folderId) subtitle += ` in ${folderLabel}`;
  if (query) subtitle += ` matching "${query}"`;

  const pills = [
    buildFilterPill(viewLabel(view), true),
  ];
  if (folderId) pills.push(buildFilterPill(folderLabel, true));
  if (query) pills.push(buildFilterPill(`Search: ${query}`));
  pills.push(buildFilterPill(`${filteredRows.length} shown`));

  const titleEl = $("#listTitle");
  const subtitleEl = $("#listSubtitle");
  const filterEl = $("#listFilters");
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (filterEl) filterEl.innerHTML = pills.join("");

  setRouteMeta("Studio", folderId ? `${title} / ${folderLabel}` : title, subtitle);
}

function collectFolderSidebarItems(rows, view, mode = "canonical"){
  const base = (Array.isArray(rows) ? rows : []).filter((row) => matchesView(row, view));
  let unfiledCount = 0;
  for (const row of base){
    const folderId = String(row?.folderId || "").trim();
    if (!folderId) unfiledCount += 1;
  }

  // Canonical mode reads state.folderCatalog (canonical-only per P8a contract).
  // Review mode reads state.folderLocalReview. Neither merges row-derived
  // folders — extras only appear if FolderParity recognises them as Local Review.
  const sourceCatalog = mode === "review"
    ? (Array.isArray(state.folderLocalReview) ? state.folderLocalReview : [])
    : (Array.isArray(state.folderCatalog) ? state.folderCatalog : []);
  const out = mode === "canonical"
    ? [{ folderId: "", label: "All folders", count: base.length, kind: "all" }]
    : [];
  for (const folder of sourceCatalog){
    const canonicalCount = Number(folder.canonicalCount || 0) || 0;
    const knownCount = Number(folder.knownCount || 0) || 0;
    const localBindingCount = Number(folder.localBindingCount || 0) || 0;
    const nativeMembershipCount = Number(folder.nativeMembershipCount ?? canonicalCount) || 0;
    out.push({
      folderId: folder.id,
      label: folder.name || folder.id,
      // P8a contract §8: primary count is native membership, never max'd with
      // local binding counts. displayCountLabel ("<n> native · <m> known")
      // drives the visible UI; numeric count only gates the is-empty class.
      count: nativeMembershipCount,
      displayCountLabel: String(folder.displayCountLabel || "").trim(),
      canonicalCount,
      nativeMembershipCount,
      knownCount,
      knownStudioCount: Number(folder.knownStudioCount ?? knownCount) || 0,
      savedCount: Number(folder.savedCount || 0) || 0,
      linkedCount: Number(folder.linkedCount || 0) || 0,
      orphanCount: Number(folder.orphanCount || 0) || 0,
      localBindingCount,
      badges: Array.isArray(folder.badges) ? folder.badges.slice() : [],
      isCanonical: folder.isCanonical === true,
      isExtra: folder.isExtra === true,
      isTestCandidate: folder.isTestCandidate === true,
      isConflict: folder.isConflict === true,
      reviewBucket: folder.reviewBucket || null,
      kind: "folder",
      folderKind: folder.kind || "local",
      iconColor: normalizeSidebarIconColor(folder.iconColor || ""),
    });
  }
  if (mode === "canonical" && (unfiledCount || state.lastFolderId === FOLDER_FILTER_NONE)) {
    out.push({ folderId: FOLDER_FILTER_NONE, label: "Unfiled", count: unfiledCount, kind: "utility" });
  }
  return out;
}

const SIDEBAR_FOLDER_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>
`;

function renderFolderSidebarRow(view, item, opts){
  const appearance = item.kind === "folder"
    ? W.H2O?.Library?.SidebarSections?.getRowAppearance?.({
      kind: "folders",
      id: item.folderId,
      folderId: item.folderId,
      name: item.label,
      color: item.iconColor || "",
      iconColor: item.iconColor || "",
      isCanonical: item.isCanonical === true,
    })
    : null;
  if (appearance?.hidden) return null;
  const displayLabel = String(appearance?.name || item.label || "").trim() || item.folderId || "";
  const folderIconSvg = appearance?.iconSvg || SIDEBAR_FOLDER_ICON_SVG;
  const link = document.createElement("a");
  link.className = "wbFolderItem";
  if (opts && opts.review) link.classList.add("wbFolderItem--review");
  const countText = String(item.displayCountLabel || "").trim() || String(item.count || 0);
  const hasDetailedCount = !!String(item.displayCountLabel || "").trim();
  if (!item.count && !hasDetailedCount) link.classList.add("is-empty");
  if (item.folderKind === "project_backed") link.classList.add("is-project-backed");
  link.href = buildListHash(view, item.folderId);
  link.dataset.folderId = String(item.folderId || "");
  if (hasDetailedCount) link.dataset.countLabel = countText;
  if (Array.isArray(item.badges) && item.badges.length) link.dataset.badges = item.badges.join(",");
  if (item.canonicalCount != null) link.dataset.canonicalCount = String(item.canonicalCount);
  if (item.knownCount != null) link.dataset.knownCount = String(item.knownCount);
  if (item.localBindingCount != null) link.dataset.localBindingCount = String(item.localBindingCount);
  if (item.reviewBucket) link.dataset.reviewBucket = String(item.reviewBucket);
  const iconColor = normalizeSidebarIconColor(appearance?.color || item.iconColor || "");
  if (iconColor) {
    link.dataset.color = iconColor;
    link.style.setProperty("--wb-sidebar-item-color", iconColor);
  }
  const reviewBadgesHtml = opts && opts.review ? localReviewBadgesHtml(item) : "";
  const folderMenuHtml = item.kind === "folder" && !(opts && opts.review)
    ? `<button class="wbFolderMenuBtn" type="button" aria-label="More options for ${esc(displayLabel)}" aria-haspopup="menu" aria-expanded="false" title="More options for ${esc(displayLabel)}">...</button>`
    : `<span class="wbFolderMenuSlot" aria-hidden="true"></span>`;
  link.innerHTML = `
    <span class="wbFolderIcon" aria-hidden="true">${folderIconSvg}</span>
    <span class="wbFolderLabel"${reviewBadgesHtml ? ' style="display:flex;flex-direction:column;gap:0;min-width:0;white-space:normal;line-height:1.25"' : ""}>
      <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(displayLabel)}</span>
      ${reviewBadgesHtml}
    </span>
    <span class="wbFolderCount${hasDetailedCount ? " wbFolderCount--folderParity" : ""}">${esc(countText)}</span>
    ${folderMenuHtml}
  `;
  const menuBtn = link.querySelector(".wbFolderMenuBtn");
  if (menuBtn) {
    menuBtn.addEventListener("pointerdown", (event) => event.stopPropagation());
    menuBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const api = W.H2O?.Library?.SidebarSections;
      if (typeof api?.openRowMenu === "function") {
        api.openRowMenu(menuBtn, {
          kind: "folders",
          id: item.folderId,
          folderId: item.folderId,
          name: displayLabel,
          count: item.count || 0,
          color: iconColor,
          iconKey: appearance?.icon || "folder",
          folderKind: item.folderKind || item.kind || "",
          isCanonical: item.isCanonical === true,
        });
      }
    });
  }
  return link;
}

function renderFolderSidebar(rows, view, selectedFolderId){
  const host = $("#folderList");
  if (!host) return;
  const items = collectFolderSidebarItems(rows, view, "canonical");
  const reviewItems = collectFolderSidebarItems(rows, view, "review");
  host.innerHTML = "";

  const folderEntries = items.filter((item) => item.kind === "folder");
  const reviewEntries = reviewItems.filter((item) => item.kind === "folder");
  if (items.length <= 1 && !folderEntries.length && !reviewEntries.length){
    host.innerHTML = `<div class="wbSideEmpty">Canonical folder catalog unavailable. Open chatgpt.com to broadcast folders.</div>`;
    setActiveFolder("");
    return;
  }

  const projectItems = items.filter((item) => item.kind === "folder" && item.folderKind === "project_backed");
  const localItems = items.filter((item) => item.kind === "folder" && item.folderKind !== "project_backed");
  const utilityItems = items.filter((item) => item.kind !== "folder");
  const orderedItems = [...utilityItems.slice(0, 1), ...projectItems, ...localItems, ...utilityItems.slice(1)];

  orderedItems.forEach((item) => {
    if (projectItems.length && localItems.length && item === localItems[0]){
      const divider = document.createElement("hr");
      divider.className = "wbFolderDivider";
      host.appendChild(divider);
    }
    const link = renderFolderSidebarRow(view, item, { review: false });
    if (link) host.appendChild(link);
  });

  if (reviewEntries.length > 0) {
    const persistKey = "h2o:prm:cgx:studio-sidebar:local-review:expanded:v1";
    let expandedPref = false;
    try { expandedPref = W.localStorage.getItem(persistKey) === "1"; } catch {}
    const details = document.createElement("details");
    details.className = "wbFolderLocalReview";
    details.open = expandedPref;
    const summary = document.createElement("summary");
    summary.className = "wbFolderLocalReviewSummary";
    summary.textContent = `Local Review · ${reviewEntries.length}`;
    summary.style.cssText = "cursor:pointer;padding:6px 10px;margin-top:6px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.04em;text-transform:uppercase;border-top:1px solid rgba(255,255,255,.06)";
    details.appendChild(summary);
    const explanation = document.createElement("div");
    explanation.className = "wbFolderLocalReviewExplanation";
    explanation.textContent = FOLDER_LOCAL_REVIEW_EXPLANATION;
    explanation.style.cssText = "padding:0 10px 4px;color:rgba(255,255,255,.56);font-size:10.5px;line-height:1.35";
    details.appendChild(explanation);
    const reviewHost = document.createElement("div");
    reviewHost.className = "wbFolderLocalReviewList";
    reviewHost.style.cssText = "opacity:0.84;padding-top:4px";
    reviewEntries.forEach((item) => {
      const link = renderFolderSidebarRow(view, item, { review: true });
      if (link) reviewHost.appendChild(link);
    });
    details.appendChild(reviewHost);
    details.addEventListener("toggle", () => {
      try { W.localStorage.setItem(persistKey, details.open ? "1" : "0"); } catch {}
    });
    host.appendChild(details);
  }

  setActiveFolder(selectedFolderId);
}

function getActiveSnapshotId(){
  return String(state.currentReaderSnapshot?.snapshotId || state.selectedSnapshotId || "").trim();
}

function setActiveSidebarChat(snapshotId = ""){
  const activeSnapshotId = String(snapshotId || getActiveSnapshotId()).trim();
  $$(".wbSidebarChatItem[data-snapshot-id]").forEach((node) => {
    node.classList.toggle("active", String(node.dataset.snapshotId || "").trim() === activeSnapshotId);
  });
}

function setSidebarChatLoading(view, folderId = ""){
  const host = $("#sidebarChatList");
  const labelEl = $("#sidebarChatsLabel");
  const metaEl = $("#sidebarChatsMeta");
  if (!(host && labelEl && metaEl)) return;

  const folderLabel = folderId === FOLDER_FILTER_NONE
    ? "Unfiled"
    : (folderId ? resolveFolderName(folderId) : "");
  labelEl.textContent = folderLabel || viewCopy(view);
  metaEl.textContent = "Loading…";
  host.innerHTML = `<div class="wbSideEmpty">Loading chats…</div>`;
}

function renderSidebarChatList(rows, view, folderId = "", query = ""){
  const host = $("#sidebarChatList");
  const labelEl = $("#sidebarChatsLabel");
  const metaEl = $("#sidebarChatsMeta");
  if (!(host && labelEl && metaEl)) return;

  const folderLabel = folderId === FOLDER_FILTER_NONE
    ? "Unfiled"
    : (folderId ? resolveFolderName(folderId) : "");
  labelEl.textContent = folderLabel || viewCopy(view);
  metaEl.textContent = [
    pluralize((Array.isArray(rows) ? rows : []).length, "chat"),
    query ? "Filtered" : "",
  ].filter(Boolean).join(" · ");

  host.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length){
    host.innerHTML = `<div class="wbSideEmpty">No chats match the current archive view.</div>`;
    setActiveSidebarChat("");
    return;
  }

  const activeSnapshotId = getActiveSnapshotId();
  const frag = document.createDocumentFragment();
  list.slice(0, 30).forEach((row) => {
    const link = document.createElement("a");
    link.className = "wbSidebarChatItem";
    /* Phase K-1 — linked rows have no snapshotId. Point the sidebar
     * link to the Linked Chats list (#/linked) so a click doesn't
     * trigger #/read/<empty> (which has no handler). */
    const sidebarRowIsLinked = String(row?.view || "").toLowerCase() === "linked";
    if (sidebarRowIsLinked) {
      link.href = buildListHash("linked", state.lastFolderId || "");
      link.classList.add("wbSidebarChatItem--linked");
    } else {
      link.href = `#/read/${encodeURIComponent(row.snapshotId)}`;
    }
    link.dataset.snapshotId = String(row.snapshotId || "");
    link.dataset.chatId = row.chatId;
    if (!sidebarRowIsLinked && row.snapshotId === activeSnapshotId) link.classList.add("active");

    const meta = rowMetaParts(row).join(" · ");

    link.innerHTML = `
      <span class="wbSidebarChatTitle">${esc(row.title)}</span>
      <span class="wbSidebarChatMeta">${esc(meta)}</span>
    `;

    frag.appendChild(link);
  });

  host.appendChild(frag);
  setActiveSidebarChat(activeSnapshotId);
}

function refreshSidebarChatList(view = state.lastView, folderId = state.lastFolderId){
  const query = $("#q")?.value || "";
  const rows = filterRows(state.rowsCache || [], view, query, folderId, state.lastTagFilter);
  renderSidebarChatList(rows, view, folderId, query);
}

function updateRowFolderBinding(chatId, folderData){
  const id = String(chatId || "").trim();
  if (!id) return;
  const binding = normalizeFolderBinding(folderData);
  state.folderBindingsByChat[id] = binding;

  if (Array.isArray(state.rowsCache)){
    state.rowsCache = state.rowsCache.map((row) => {
      if (row.chatId !== id) return row;
      return {
        ...row,
        folderId: binding.folderId,
        folderName: binding.folderId
          ? (binding.folderName || resolveFolderName(binding.folderId) || binding.folderId)
          : "",
      };
    });
  }

  if (state.currentReaderSnapshot?.chatId === id) {
    const meta = state.currentReaderSnapshot.meta && typeof state.currentReaderSnapshot.meta === "object"
      ? state.currentReaderSnapshot.meta
      : {};
    state.currentReaderSnapshot.meta = {
      ...meta,
      folderId: binding.folderId,
      folderName: binding.folderId
        ? (binding.folderName || resolveFolderName(binding.folderId) || binding.folderId)
        : "",
    };
  }
}

function renderFolderAssignmentControl(){
  const wrap = $("#folderAssignWrap");
  const select = $("#folderAssignSelect");
  if (!(wrap && select)) return;

  const selectedChatId = String(state.selectedChatId || state.currentReaderSnapshot?.chatId || "").trim();
  // P8a contract §2: assignment dropdown shows canonical folders only.
  // Local Review extras are inspect-only; existing non-canonical bindings are
  // preserved because the writer only fires on user-driven select change.
  const catalog = Array.isArray(state.folderCatalog) ? state.folderCatalog : [];
  const currentFolderId = getSelectedFolderId();

  if (!selectedChatId || (!catalog.length && !currentFolderId)) {
    wrap.hidden = true;
    select.innerHTML = "";
    return;
  }

  const options = [{ value: "", label: "Unfiled" }, ...catalog.map((item) => ({
    value: String(item.id || ""),
    label: String(item.name || item.id || ""),
  }))];

  select.innerHTML = options.map((item) => (
    `<option value="${esc(item.value)}">${esc(item.label)}</option>`
  )).join("");

  const hasCurrent = options.some((item) => item.value === currentFolderId);
  select.value = hasCurrent ? currentFolderId : "";
  wrap.hidden = false;
}

function getSelectedWorkbenchRow(){
  const sid = String(state.selectedSnapshotId || state.currentReaderSnapshot?.snapshotId || "").trim();
  if (!sid || !Array.isArray(state.rowsCache)) return null;
  return state.rowsCache.find((row) => String(row?.snapshotId || "").trim() === sid) || null;
}

function syncSelectionControls(){
  renderFolderAssignmentControl();
  renderCategoryInspector();
}

function selectRow(row, articleEl){
  state.selectedSnapshotId = String(row?.snapshotId || "").trim();
  state.selectedChatId = String(row?.chatId || "").trim();

  $$(".wbHistoryRow.is-selected").forEach((node) => node.classList.remove("is-selected"));
  if (articleEl) articleEl.classList.add("is-selected");
  setActiveSidebarChat(state.selectedSnapshotId);
  syncSelectionControls();
}

function rowMetaParts(row){
  const folder = String(row?.folderName || row?.folderId || "Unfiled").trim();
  const answers = pluralize(toWholeCount(row?.answerCount, 0), "answer");
  const created = fmtDateMeta(row?.originalCreatedAt);
  const added = fmtDateMeta(row?.studioAddedAt || row?.createdAt);
  const lastTurn = fmtDateMeta(row?.lastTurnAt || row?.updatedAt);
  return [
    folder,
    answers,
    created ? `Created ${created}` : "Created unknown",
    added ? `Added ${added}` : "Added to Studio",
    lastTurn ? `Last turn ${lastTurn}` : "Last turn unknown",
  ];
}

function heatLabel(level){
  const normalized = normalizeHeatLevel(level);
  if (normalized === "hot") return "Hot";
  if (normalized === "warm") return "Warm";
  if (normalized === "off") return "Off";
  return "Auto";
}

function closeRowPopovers(exceptEl = null){
  $$(".wbRowPopover").forEach((node) => {
    if (exceptEl && node === exceptEl) return;
    node.remove();
  });
  if (!exceptEl) {
    try { W.H2O?.StudioAutoEmojiTitle?.closePalette?.(); } catch {}
  }
  if (!exceptEl && titlePaletteEl) {
    titlePaletteEl.remove();
    titlePaletteEl = null;
  }
  $$(".wbRowTools [aria-expanded='true']").forEach((node) => {
    node.setAttribute("aria-expanded", "false");
  });
}

function updateCachedRow(chatId, patch){
  const id = String(chatId || "").trim();
  if (!id || !Array.isArray(state.rowsCache)) return null;
  let updated = null;
  state.rowsCache = state.rowsCache.map((row) => {
    if (row.chatId !== id) return row;
    updated = { ...row, ...(patch || {}) };
    updated.heatLevel = computeHeatLevel(updated);
    return updated;
  });
  return updated;
}

async function persistInterfaceMetaPatch(chatId, patch, reason = "studio-interface-meta"){
  const id = String(chatId || "").trim();
  if (!id) return {};
  const existing = state.interfaceMetaByChat[id] && typeof state.interfaceMetaByChat[id] === "object"
    ? state.interfaceMetaByChat[id]
    : {};
  const next = {
    ...existing,
    ...(patch && typeof patch === "object" ? patch : {}),
    chatId: id,
    updatedAt: Date.now(),
  };
  state.interfaceMetaByChat[id] = next;
  await writeSharedRecord(`${INTERFACE_META_MIRROR_KEY_PREFIX}${id}`, next);
  broadcastStudioMeta(reason, { chatId: id, meta: next });
  return next;
}

async function persistHeatOverride(chatId, level){
  const id = String(chatId || "").trim();
  const next = normalizeHeatLevel(level);
  if (!id) return;
  const key = `${HEAT_OVERRIDE_KEY_PREFIX}${id}`;
  try {
    if (next === "auto") localStorage.removeItem(key);
    else localStorage.setItem(key, next);
  } catch {}
  if (next === "auto") await chromeStorageRemove([key]).catch(() => false);
  else await chromeStorageSet({ [key]: next }).catch(() => false);
  await persistInterfaceMetaPatch(id, { heatOverride: next }, "studio-heat-override");
}

async function persistPin(chatId, pinned){
  const id = String(chatId || "").trim();
  if (!id) return;
  const key = `${PIN_KEY_PREFIX}${id}`;
  try {
    if (pinned) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {}
  if (pinned) await chromeStorageSet({ [key]: "1" }).catch(() => false);
  else await chromeStorageRemove([key]).catch(() => false);
  await persistInterfaceMetaPatch(id, { pinned: !!pinned }, "studio-pin");
}

async function persistRowTint(chatId, idx){
  const id = String(chatId || "").trim();
  const next = toRowTintIndex(idx, -1);
  if (!id) return;
  const key = `${ROW_TINT_KEY_PREFIX}${id}`;
  try {
    if (next < 0) localStorage.removeItem(key);
    else localStorage.setItem(key, String(next));
  } catch {}
  if (next < 0) await chromeStorageRemove([key]).catch(() => false);
  else await chromeStorageSet({ [key]: String(next) }).catch(() => false);
  await persistInterfaceMetaPatch(id, { rowTint: next }, "studio-row-tint");
}

async function persistChatTitleState(row, emoji){
  const chatId = String(row?.chatId || "").trim();
  if (!chatId) return null;
  const split = splitTitleEmoji(row?.titleState?.baseTitle || row?.title || "");
  const baseTitle = String(row?.titleState?.baseTitle || split.baseTitle || row?.title || chatId).trim();
  const nextEmoji = String(emoji || "").trim();
  const now = Date.now();
  const payload = {
    version: "1.0.0",
    chatId,
    baseTitle,
    source: "studio-title-palette",
    priority: 100,
    confidence: 1,
    emoji: nextEmoji,
    emojiSource: "user-picker-native-rename",
    emojiPriority: 100,
    emojiConfidence: 1,
    updatedAt: now,
    emojiUpdatedAt: now,
  };
  const displayTitle = displayTitleWithEmoji(baseTitle, nextEmoji);
  const titleState = { ...payload, displayTitle };
  await writeSharedRecord(`${CHAT_TITLE_STATE_KEY_PREFIX}${chatId}`, payload);
  state.titleStateByChat[chatId] = titleState;
  broadcastStudioMeta("studio-title-palette", { chatId, titleState });
  return titleState;
}

function syncRowTools(article, row){
  if (!article || !row) return;
  const heatLevel = row.heatLevel || computeHeatLevel(row);
  article.dataset.heatLevel = heatLevel;
  article.classList.toggle("is-pinned", !!row.pinned);
  INTERFACE_COLORS.forEach((color) => article.classList.remove(`wb-row-${color.name}`));
  const rowTint = toRowTintIndex(row?.rowTint, -1);
  if (rowTint >= 0) article.classList.add(`wb-row-${INTERFACE_COLORS[rowTint].name}`);

  const pinBtn = article.querySelector(".wbRowIconBtn--pin");
  if (pinBtn){
    pinBtn.classList.toggle("is-on", !!row.pinned);
    pinBtn.setAttribute("aria-pressed", row.pinned ? "true" : "false");
    pinBtn.setAttribute("title", row.pinned ? "Unpin chat" : "Pin chat");
  }

  const heatBtn = article.querySelector(".wbHeatPill");
  if (heatBtn){
    heatBtn.className = `wbHeatPill wbHeatPill--${heatLevel}`;
    heatBtn.textContent = "";
    heatBtn.setAttribute("aria-label", `Heat: ${heatLabel(heatLevel)}`);
    heatBtn.setAttribute("title", `Heat: ${heatLabel(heatLevel)}`);
  }
}

function buildInfoPopover(row){
  const meta = row?.interfaceMeta && typeof row.interfaceMeta === "object" ? row.interfaceMeta : {};
  const items = [
    ["Created in ChatGPT", fmtDateMeta(row?.originalCreatedAt) || "Unknown"],
    ["Answers", String(toWholeCount(row?.answerCount, 0))],
    ["Folder", String(row?.folderName || row?.folderId || "Unfiled")],
    ["Added to Studio", fmtDateMeta(row?.studioAddedAt || row?.createdAt) || "Unknown"],
    ["Heat", heatLabel(row?.heatLevel || computeHeatLevel(row))],
    ["Pinned", row?.pinned ? "Yes" : "No"],
  ];
  const preview = [
    meta.firstQ ? `<div class="wbRowPopoverPreview"><b>First Q</b><span>${esc(meta.firstQ)}</span></div>` : "",
    meta.lastA ? `<div class="wbRowPopoverPreview"><b>Last A</b><span>${esc(meta.lastA)}</span></div>` : "",
  ].filter(Boolean).join("");
  return `
    <div class="wbRowPopoverHead">
      <div class="wbRowPopoverTitle">${esc(row?.title || "Chat info")}</div>
    </div>
    <div class="wbRowPopoverGrid">
      ${items.map(([label, value]) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join("")}
    </div>
    ${preview}
  `;
}

function openInfoPopover(row, article, anchor){
  closeRowPopovers();
  const pop = document.createElement("div");
  pop.className = "wbRowPopover wbRowPopover--info";
  pop.setAttribute("role", "dialog");
  pop.innerHTML = buildInfoPopover(row);
  article.appendChild(pop);
  anchor?.setAttribute("aria-expanded", "true");
}

function stopPaletteEvent(ev){
  ev?.preventDefault?.();
  ev?.stopPropagation?.();
}

function refreshTitlePaletteMeta(palette, row){
  if (!palette || !row) return;
  const heat = normalizeHeatLevel(row.heatOverride);
  const rowTint = toRowTintIndex(row.rowTint, -1);
  palette.querySelectorAll(".ho-swatch.heat").forEach((sw) => {
    sw.classList.toggle("ho-meta-selected", sw.dataset.level === heat);
  });
  palette.querySelectorAll(".ho-swatch.row").forEach((sw) => {
    sw.classList.toggle("ho-meta-selected", Number(sw.dataset.idx) === rowTint);
  });
}

function applyTitlePaletteMetaChoice(target, row, article, palette){
  if (!target || !row) return;
  const mode = String(target.dataset.mode || "");
  if (mode === "heat") {
    const nextOverride = normalizeHeatLevel(target.dataset.level || "auto");
    row.interfaceMeta = {
      ...(row.interfaceMeta && typeof row.interfaceMeta === "object" ? row.interfaceMeta : {}),
      heatOverride: nextOverride,
    };
    row.heatOverride = nextOverride;
    row.heatLevel = computeHeatLevel(row);
    updateCachedRow(row.chatId, {
      interfaceMeta: row.interfaceMeta,
      heatOverride: nextOverride,
      heatLevel: row.heatLevel,
    });
    syncRowTools(article, row);
    refreshTitlePaletteMeta(palette, row);
    persistHeatOverride(row.chatId, nextOverride).catch(console.warn);
    return;
  }

  if (mode === "row") {
    const idx = Number.parseInt(target.dataset.idx || "-1", 10);
    const current = toRowTintIndex(row.rowTint, -1);
    const next = current === idx ? -1 : toRowTintIndex(idx, -1);
    row.interfaceMeta = {
      ...(row.interfaceMeta && typeof row.interfaceMeta === "object" ? row.interfaceMeta : {}),
      rowTint: next,
    };
    row.rowTint = next;
    updateCachedRow(row.chatId, { interfaceMeta: row.interfaceMeta, rowTint: next });
    syncRowTools(article, row);
    refreshTitlePaletteMeta(palette, row);
    persistRowTint(row.chatId, next).catch(console.warn);
  }
}

function buildTitleMetaPalette(row, article){
  const palette = document.createElement("div");
  palette.className = "ho-palette ho-emoji-meta-palette show";
  palette.dataset.chatid = row.chatId;

  const heatRow = document.createElement("div");
  heatRow.className = "ho-palette-row ho-emoji-heat-row";
  [
    ["auto", "A"],
    ["hot", "H"],
    ["warm", "W"],
    ["off", "O"],
  ].forEach(([level, label]) => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "ho-swatch heat";
    sw.textContent = label;
    sw.title = `Heat: ${level}`;
    sw.setAttribute("aria-label", `Heat: ${level}`);
    sw.dataset.mode = "heat";
    sw.dataset.level = level;
    heatRow.appendChild(sw);
  });

  const divider = document.createElement("span");
  divider.className = "ho-emoji-meta-divider";
  divider.setAttribute("aria-hidden", "true");

  const rowRow = document.createElement("div");
  rowRow.className = "ho-palette-row ho-emoji-row-tint-row";
  INTERFACE_COLORS.forEach((color, idx) => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "ho-swatch row";
    sw.style.backgroundColor = String(color.value || "").replace(/,1\)/, ",0.5)");
    sw.title = `Row: ${color.name}`;
    sw.setAttribute("aria-label", `Row: ${color.name}`);
    sw.dataset.mode = "row";
    sw.dataset.idx = String(idx);
    rowRow.appendChild(sw);
  });

  let choosingMeta = false;
  const chooseMeta = (ev) => {
    const sw = ev.target?.closest?.(".ho-swatch");
    if (!sw) return;
    stopPaletteEvent(ev);
    if (choosingMeta) return;
    choosingMeta = true;
    applyTitlePaletteMetaChoice(sw, row, article, palette);
    setTimeout(() => { choosingMeta = false; }, 120);
  };
  palette.addEventListener("pointerdown", chooseMeta, true);
  palette.addEventListener("mousedown", chooseMeta, true);
  palette.addEventListener("click", chooseMeta, true);
  palette.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    chooseMeta(ev);
  }, true);

  palette.appendChild(heatRow);
  palette.appendChild(divider);
  palette.appendChild(rowRow);
  refreshTitlePaletteMeta(palette, row);
  return palette;
}

function renderTitlePaletteSections(grid, sections, selectedEmoji, selectEmoji){
  grid.innerHTML = "";
  const seen = new Set();
  for (const section of sections){
    const list = Array.from(new Set(section.emojis || [])).filter((emoji) => emoji && !seen.has(emoji));
    if (!list.length) continue;

    const wrap = document.createElement("section");
    wrap.className = "ho-emoji-section";

    const label = document.createElement("div");
    label.className = "ho-emoji-section-title";
    label.textContent = section.label || "Icons";

    const cells = document.createElement("div");
    cells.className = "ho-emoji-section-grid";

    list.forEach((emoji) => {
      seen.add(emoji);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ho-emoji-btn";
      if (selectedEmoji && emoji === selectedEmoji) b.classList.add("ho-emoji-selected");
      b.textContent = emoji;
      b.setAttribute("aria-label", `Use ${emoji}`);
      b.addEventListener("pointerdown", (ev) => selectEmoji(emoji, ev), true);
      b.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        selectEmoji(emoji, ev);
      }, true);
      cells.appendChild(b);
    });

    wrap.appendChild(label);
    wrap.appendChild(cells);
    grid.appendChild(wrap);
  }
}

function searchEmojiSections(query){
  const q = String(query || "").trim().toLowerCase();
  if (!q) return STUDIO_EMOJI_GROUPS;
  const sections = STUDIO_EMOJI_GROUPS.map((section) => {
    const label = String(section.label || "").toLowerCase();
    const emojis = (section.emojis || []).filter((emoji) => String(emoji || "").includes(q));
    if (label.includes(q) || q.includes(label.split(" ")[0])) return { label: section.label, emojis: section.emojis };
    return { label: section.label, emojis };
  }).filter((section) => section.emojis && section.emojis.length);
  if (sections.length) return sections;
  return [{ label: "Results", emojis: STUDIO_EMOJI_POOL.slice(0, 96) }];
}

function openTitlePalette(row, article, anchor){
  const paletteApi = W.H2O?.StudioAutoEmojiTitle;
  if (paletteApi && typeof paletteApi.openPalette === "function") {
    closeRowPopovers();
    paletteApi.openPalette({
      row,
      article,
      anchor,
      callbacks: {
        persistTitleState: persistChatTitleState,
        applyTitleState(titleState){
          if (!titleState) return;
          row.titleState = titleState;
          row.title = titleState.displayTitle || composeTitleFromState(titleState, row.title);
          updateCachedRow(row.chatId, { title: row.title, titleState });
          const titleEl = article?.querySelector?.(".wbTitle");
          if (titleEl) titleEl.textContent = row.title;
          refreshSidebarChatList();
        },
        applyMetaChoice(target, palette){
          applyTitlePaletteMetaChoice(target, row, article, palette);
        },
      },
    });
    return;
  }

  closeRowPopovers();
  const gutter = 12;
  const pickerWidth = Math.min(398, Math.max(292, window.innerWidth - (gutter * 2)));
  const pickerHeight = Math.min(462, Math.max(300, window.innerHeight - (gutter * 2)));
  const rect = anchor?.getBoundingClientRect?.() || article?.getBoundingClientRect?.() || { left: gutter, bottom: gutter };
  const left = Math.max(gutter, Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - gutter));
  const top = Math.max(gutter, Math.min(rect.bottom + 8, window.innerHeight - pickerHeight - gutter));
  const split = splitTitleEmoji(row?.titleState?.displayTitle || row?.title || "");
  const selectedEmoji = String(row?.titleState?.emoji || split.emoji || "").trim();

  const picker = document.createElement("div");
  titlePaletteEl = picker;
  picker.className = "ho-emoji-picker";
  picker.setAttribute("data-cgxui-owner", "auto-title-palette");
  picker.setAttribute("data-h2o-glass", "panel");
  picker.setAttribute("data-h2o-skin-surface", "sand-glass");
  picker.style.setProperty("--ho-picker-w", `${pickerWidth}px`);
  picker.style.setProperty("--ho-picker-max-h", `${pickerHeight}px`);
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;

  const topbar = document.createElement("div");
  topbar.className = "ho-emoji-picker-top";

  const title = document.createElement("div");
  title.className = "ho-emoji-picker-title";
  const icon = document.createElement("span");
  icon.className = "ho-title-panel-icon";
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 7.5h8.75a3.25 3.25 0 0 1 0 6.5H9.2"/><path d="M6.5 7.5 4 5m2.5 2.5L4 10"/><path d="M17.5 16.5 20 19m-2.5-2.5L20 14"/><path d="M8 14.25h5.6"/></svg>';
  icon.setAttribute("aria-hidden", "true");
  const titleText = document.createElement("span");
  titleText.textContent = "Title Palette";
  title.appendChild(icon);
  title.appendChild(titleText);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "ho-emoji-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close emoji picker");
  close.addEventListener("pointerdown", (ev) => {
    stopPaletteEvent(ev);
    closeRowPopovers();
  }, true);

  topbar.appendChild(title);
  topbar.appendChild(close);

  const input = document.createElement("input");
  input.placeholder = "Search emoji, symbols, food, travel, flags";
  input.setAttribute("aria-label", "Search emoji");

  const search = document.createElement("div");
  search.className = "ho-emoji-search";
  search.appendChild(input);

  const grid = document.createElement("div");
  grid.className = "ho-emoji-grid";

  const metaPalette = buildTitleMetaPalette(row, article);

  const selectEmoji = (emoji, ev) => {
    stopPaletteEvent(ev);
    persistChatTitleState(row, emoji).then((titleState) => {
      if (!titleState) return;
      row.titleState = titleState;
      row.title = titleState.displayTitle || composeTitleFromState(titleState, row.title);
      updateCachedRow(row.chatId, { title: row.title, titleState });
      const titleEl = article.querySelector(".wbTitle");
      if (titleEl) titleEl.textContent = row.title;
      closeRowPopovers();
    }).catch(console.warn);
  };

  renderTitlePaletteSections(grid, STUDIO_EMOJI_GROUPS, selectedEmoji, selectEmoji);
  input.addEventListener("input", () => {
    renderTitlePaletteSections(grid, searchEmojiSections(input.value), selectedEmoji, selectEmoji);
  });

  picker.addEventListener("pointerdown", (ev) => ev.stopPropagation(), true);
  picker.addEventListener("click", (ev) => ev.stopPropagation(), true);
  picker.appendChild(topbar);
  picker.appendChild(search);
  if (metaPalette) picker.appendChild(metaPalette);
  picker.appendChild(grid);
  document.body.appendChild(picker);
  anchor?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => input.focus());
}

function renderRow(row, isSelected = false, activeView = "", activeFolderId = ""){
  const article = document.createElement("article");
  article.className = "wbHistoryRow";
  /* Phase K-1 — linked rows have no snapshotId. Use "" rather than
   * the string "undefined" so downstream lookups stay clean. */
  const rowIsLinked = String(row?.view || "").toLowerCase() === "linked";
  article.dataset.snapshotId = String(row.snapshotId || "");
  article.dataset.chatId = row.chatId;
  if (rowIsLinked) article.classList.add("wbHistoryRow--linked");
  if (isSelected) article.classList.add("is-selected");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "wbRowMain";

  const suppressArchive = (activeView === "archive");

  const sourceLabel = row.originSource === "mobile"
    ? "Mobile"
    : (row.originSource === "browser" ? "Browser" : "");
  const visibleTags = Array.isArray(row.tags) ? row.tags.slice(0, 2) : [];
  const hiddenTagCount = Math.max(0, (Array.isArray(row.tags) ? row.tags.length : 0) - visibleTags.length);
  const badgeHtml = [
    (row.archived && !suppressArchive) ? `<span class="wbBadge wbBadge--archive">Archived</span>` : "",
    sourceLabel ? `<span class="wbBadge wbBadge--source">${esc(sourceLabel)}</span>` : "",
    ...visibleTags.map((tag) => `<span class="wbBadge wbBadge--tag" data-tag="${esc(tag)}" role="button" tabindex="0" aria-label="Filter by tag: ${esc(tag)}">${esc(tag)}</span>`),
    hiddenTagCount > 0 ? `<span class="wbBadge wbBadge--tag-more">+${hiddenTagCount}</span>` : "",
  ].filter(Boolean).join("");
  const metaParts = rowMetaParts(row);
  const heatLevel = row.heatLevel || computeHeatLevel(row);

  button.innerHTML = `
    <div class="wbRowTitleLine">
      <div class="wbTitle">${esc(row.title)}</div>
    </div>
    <div class="wbMeta">
      ${metaParts.map((part) => `<span>${esc(part)}</span>`).join("")}
    </div>
  `;

  const tools = document.createElement("div");
  tools.className = "wbRowTools";
  tools.innerHTML = `
    <button type="button" class="wbRowIconBtn wbRowIconBtn--info" aria-label="Show chat info" aria-expanded="false" title="Chat info">${INFO_ICON_HTML}</button>
    <button type="button" class="wbRowIconBtn wbRowIconBtn--pin${row.pinned ? " is-on" : ""}" aria-label="${row.pinned ? "Unpin chat" : "Pin chat"}" aria-pressed="${row.pinned ? "true" : "false"}" title="${row.pinned ? "Unpin chat" : "Pin chat"}">${PIN_ICON_HTML}</button>
    <button type="button" class="wbHeatPill wbHeatPill--${esc(heatLevel)}" aria-label="Heat: ${esc(heatLabel(heatLevel))}" aria-expanded="false" title="Heat: ${esc(heatLabel(heatLevel))}"></button>
  `;

  // Delete button uses the same compact icon rail as the native row controls.
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "wbDeleteBtn";
  deleteBtn.setAttribute("aria-label", "Delete this chat from Studio");
  deleteBtn.setAttribute("title", "Delete from Studio");
  deleteBtn.innerHTML = DELETE_ICON_HTML;

  deleteBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (deleteConfirm.chatId === row.chatId){
      // Second click — execute
      executeDeleteChat(row.chatId, row.snapshotId, article).catch(console.warn);
    } else {
      // First click — arm confirm
      clearDeleteConfirm();
      armDeleteConfirm(row.chatId, row.snapshotId, article, deleteBtn);
    }
  });
  tools.appendChild(deleteBtn);

  article.appendChild(button);
  article.appendChild(tools);
  if (badgeHtml){
    const badgesEl = document.createElement("div");
    badgesEl.className = "wbBadges";
    badgesEl.innerHTML = badgeHtml;
    article.appendChild(badgesEl);
  }
  article.addEventListener("pointerenter", () => selectRow(row, article));
  article.addEventListener("focusin", () => selectRow(row, article));
  article.addEventListener("pointerleave", () => {
    // Disarm confirm if mouse leaves the row without confirming
    if (deleteConfirm.chatId === row.chatId) clearDeleteConfirm();
  });
  tools.addEventListener("pointerdown", (ev) => ev.stopPropagation(), true);
  tools.addEventListener("click", (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    const infoBtn = target?.closest(".wbRowIconBtn--info");
    const pinBtn = target?.closest(".wbRowIconBtn--pin");
    const heatBtn = target?.closest(".wbHeatPill");
    if (!infoBtn && !pinBtn && !heatBtn) return;
    ev.preventDefault();
    ev.stopPropagation();

    if (infoBtn){
      openInfoPopover(row, article, infoBtn);
      return;
    }

    if (heatBtn){
      openTitlePalette(row, article, heatBtn);
      return;
    }

    if (pinBtn){
      const nextPinned = !row.pinned;
      row.pinned = nextPinned;
      row.interfaceMeta = {
        ...(row.interfaceMeta && typeof row.interfaceMeta === "object" ? row.interfaceMeta : {}),
        pinned: nextPinned,
      };
      updateCachedRow(row.chatId, { pinned: nextPinned, interfaceMeta: row.interfaceMeta });
      syncRowTools(article, row);
      persistPin(row.chatId, nextPinned).catch(console.warn);
      callArchive("pinSnapshot", { chatId: row.chatId, snapshotId: row.snapshotId, pinned: nextPinned }).catch(console.warn);
      if (activeView === "pinned" && !nextPinned) renderList(activeView, activeFolderId).catch(console.warn);
    }
  });
  button.addEventListener("click", () => {
    selectRow(row, article);
    /* Phase K-1 — linked rows have no snapshot to read. Render the
     * placeholder reader pane inline (no URL change) instead of
     * routing to #/read/<empty>. */
    if (rowIsLinked) {
      renderLinkedReaderPlaceholder(row);
      return;
    }
    location.hash = `#/read/${encodeURIComponent(row.snapshotId)}`;
  });
  syncRowTools(article, row);

  return article;
}

/* Phase K-1 — Linked-chat reader placeholder. Replaces the snapshot
 * reader for rows with view: 'linked' (no captured transcript). Shows
 * title + linked-at + linked-from + the original URL, plus three
 * action buttons:
 *   - Open original: routes through H2O.Studio.platform.openUrl ->
 *     plugin:shell|open. Falls back to window.open in MV3.
 *   - Save to Folder: invokes H2O.Library.actions.saveToFolder if the
 *     canonical action surface is present (S0F0j). Hidden otherwise.
 *   - Back to Linked: returns to the list view at #/linked.
 * No URL change is performed when this pane is shown — the hash
 * remains #/linked so a page reload returns the user to the list. */
function renderLinkedReaderPlaceholder(row){
  const readerEl = document.getElementById("viewReader");
  const listPanel = document.getElementById("viewListPanel");
  if (!readerEl) return;
  if (listPanel) listPanel.hidden = true;
  readerEl.hidden = false;

  const title = String(row?.title || row?.chatId || "Linked chat");
  const href = String(row?.href || "").trim();
  const linkedAtRaw = String(row?.linkedAt || "").trim();
  const linkedAtFmt = linkedAtRaw ? (fmtDateMeta(linkedAtRaw) || linkedAtRaw) : "";
  const linkedFrom = String(row?.linkedFrom || "").trim();
  const folder = String(row?.folderName || row?.folderId || "").trim();

  const actions = (W.H2O && W.H2O.Library && W.H2O.Library.actions) || null;
  const saveToFolderAvailable = !!(actions && typeof actions.saveToFolder === "function");

  readerEl.innerHTML = `
    <section class="wbLinkedReader" style="padding:24px 28px;max-width:760px;margin:0 auto">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;margin-bottom:6px">Linked chat</div>
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;line-height:1.3">${esc(title)}</h2>
      <div style="display:grid;grid-template-columns:max-content 1fr;gap:6px 14px;font-size:13px;margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">
        ${href ? `<div style="opacity:.55">URL</div><div><a href="${esc(href)}" class="wbLinkedReader-hrefLink" style="color:inherit;text-decoration:underline;word-break:break-all">${esc(href)}</a></div>` : ""}
        ${linkedAtFmt ? `<div style="opacity:.55">Linked at</div><div>${esc(linkedAtFmt)}</div>` : ""}
        ${linkedFrom ? `<div style="opacity:.55">Linked from</div><div>${esc(linkedFrom)}</div>` : ""}
        ${folder ? `<div style="opacity:.55">Folder</div><div>${esc(folder)}</div>` : ""}
        <div style="opacity:.55">Chat ID</div><div>${esc(row?.chatId || "")}</div>
      </div>
      <div style="padding:14px 16px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.02);margin:0 0 16px;font-size:13px;line-height:1.55;opacity:.85">
        Linked chat — no snapshot saved. The conversation lives at the URL above on chatgpt.com.
        Open the original to view it, or capture a snapshot by using Save to Folder on chatgpt.com.
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button id="wbLinkedReader-openOriginal" type="button"
          ${href ? "" : "disabled"}
          style="padding:8px 16px;border-radius:6px;cursor:${href ? "pointer" : "not-allowed"};background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;font-weight:600">Open original</button>
        ${saveToFolderAvailable ? `<button id="wbLinkedReader-saveToFolder" type="button"
          style="padding:8px 16px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit">Save to Folder</button>` : ""}
        <button id="wbLinkedReader-back" type="button"
          style="padding:8px 16px;border-radius:6px;cursor:pointer;background:transparent;border:1px solid rgba(255,255,255,.08);color:inherit;font:inherit;opacity:.75">Back to Linked Chats</button>
      </div>
      <div id="wbLinkedReader-status" style="margin-top:12px;font-size:12px;opacity:.7;min-height:16px"></div>
    </section>
  `;

  const statusEl = readerEl.querySelector("#wbLinkedReader-status");
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = String(msg || ""); };

  /* Open original — prefer platform.openUrl (Tauri shell|open in
   * Desktop, in-tab navigation in MV3); fall back to window.open. */
  const openBtn = readerEl.querySelector("#wbLinkedReader-openOriginal");
  const hrefLink = readerEl.querySelector(".wbLinkedReader-hrefLink");
  const openOriginal = (ev) => {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (!href) return;
    setStatus("Opening original…");
    const platform = (W.H2O && W.H2O.Studio && W.H2O.Studio.platform) || null;
    if (platform && typeof platform.openUrl === "function") {
      platform.openUrl(href).then(() => setStatus("")).catch((err) => {
        setStatus("Open failed: " + String((err && (err.message || err)) || err));
      });
      return;
    }
    try { window.open(href, "_blank", "noopener"); setStatus(""); }
    catch (err) { setStatus("Open failed: " + String(err)); }
  };
  if (openBtn) openBtn.addEventListener("click", openOriginal);
  if (hrefLink) hrefLink.addEventListener("click", openOriginal);

  /* Save to Folder — only wired when the canonical action is present.
   * No-op stub if absent (button is hidden by the template). */
  const saveBtn = readerEl.querySelector("#wbLinkedReader-saveToFolder");
  if (saveBtn && saveToFolderAvailable) {
    saveBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setStatus("Requesting Save to Folder…");
      try {
        const result = await actions.saveToFolder({ chatId: row.chatId });
        if (result && result.ok === false) {
          setStatus("Save to Folder failed: " + String(result.error || result.reason || "unknown"));
        } else {
          setStatus("Save to Folder requested. The chat will appear under Saved on the next refresh.");
        }
      } catch (err) {
        setStatus("Save to Folder failed: " + String((err && (err.message || err)) || err));
      }
    });
  }

  /* Back — re-enter the Linked list. renderList unhides the list
   * panel and re-hides the reader pane. */
  const backBtn = readerEl.querySelector("#wbLinkedReader-back");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      const folderId = state.lastFolderId || "";
      if (location.hash.startsWith("#/linked")) {
        renderList("linked", folderId).catch(console.warn);
      } else {
        location.hash = buildListHash("linked", folderId);
      }
    });
  }

  setRouteMeta("Studio", "Linked chat", title);
  try { document.body.dataset.route = "reader"; } catch (_) { /* ignore */ }
  /* Phase 1a Studio Ribbon — narrow, explicit setContext call. The linked
   * placeholder is reached via in-page row click (Phase K-1) without a URL
   * change, so renderRoute does NOT fire for this transition and the
   * try/finally tail in renderRoute cannot pick it up. Do not add other
   * call sites in this file; this is the only routing quirk that bypasses
   * renderRoute. */
  try {
    const __ribbon = W?.H2O?.Studio?.ribbon;
    if (__ribbon && typeof __ribbon.setContext === 'function') {
      __ribbon.setContext({
        route: 'linked',
        chatType: 'indexed',
        snapshotId: null,
        chatId: row && row.chatId ? String(row.chatId) : null,
        /* Phase 1b — title and source URL for Copy title / Open original
         * actions on linked-reader. Both come from the row record. */
        title: row && (row.title || row.chatId) ? String(row.title || row.chatId) : null,
        originalUrl: row && row.href ? String(row.href) : null,
        readOnly: false,
      });
    }
  } catch (_) { /* swallow */ }
}

function buildReaderDOM(snap){
  const meta = snap?.meta && typeof snap.meta === "object" ? snap.meta : {};
  const title = String(meta.title || snap?.chatId || "Saved chat");

  const root = document.createElement("div");
  root.className = "cgFrame";
  root.dataset.chatTitle = title;
  root.dataset.chatId = String(snap?.chatId || meta.chatId || "");
  root.dataset.projectId = String(meta.projectId || "");
  root.innerHTML = `
    <div class="cgBody">
      <div class="cgThread">
        <div class="cgScroll" data-testid="conversation-turns"></div>
      </div>
    </div>
  `;

  const sc = root.querySelector(".cgScroll");
  sc.classList.add("wbReaderScroll");
  const scrollRoot = sc;
  const richTurns = normalizeRichTurns(meta.richTurns);
  let assistantTurnEls = [];

  if (richTurns.length){
    sc.classList.add("wbRichRoot");
    sc.classList.add("is-rich");
    assistantTurnEls = mountRichTurns(sc, richTurns, snap.snapshotId, snap);
  }

  if (!assistantTurnEls.length){
    sc.classList.add("wbRichRoot"); // semantic markdown CSS applies to canonical renders too
    sc.classList.remove("is-rich"); // is-rich stays false — signals DOM-rich vs text-rich
    assistantTurnEls = buildCanonicalConversation(sc, snap);
  }

  try {
    if (typeof W.H2O?.studioHost?.mount === "function") {
      W.H2O.studioHost.mount({
        readerRoot: root,
        turnsEl: sc,
        scrollEl: scrollRoot,
        snapshot: snap,
        assistantTurnEls
      });
    }
  } catch {}

  /* Phase 2a — edit-overlay foundation hook (Phase 2b — now also
   * applies ops to DOM via the extended applier, and publishes
   * hasOverlay to the ribbon context). */
  try {
    const __sid = String(snap?.snapshotId || "");
    const __store = W.H2O?.Studio?.store?.editOverlay;
    const __applier = W.H2O?.Studio?.overlay?.applyOverlay;
    if (__sid && __store && typeof __store.get === "function" && typeof __applier === "function") {
      Promise.resolve(__store.get(__sid)).then((__overlay) => {
        try { __applier(root, snap, __overlay || null); }
        catch (_) { /* applier never throws, but defensive catch anyway */ }
        /* Phase 2b — publish hasOverlay to the ribbon context so the
         * Format buttons can read it from ctx (in addition to the per-
         * action isEnabled checks that look at chatType + selection).
         * Phase 2d — also publish undoCount / redoCount so the Home tab
         * Undo/Redo buttons enable correctly on initial reader load. */
        try {
          const __ribbon = W?.H2O?.Studio?.ribbon;
          if (__ribbon && typeof __ribbon.setContext === 'function') {
            const __ctx = __ribbon.getContext();
            const __hasOps = !!(__overlay && Array.isArray(__overlay.ops) && __overlay.ops.length > 0);
            const __undo = (__overlay && Array.isArray(__overlay.undoStack)) ? __overlay.undoStack.length : 0;
            const __redo = (__overlay && Array.isArray(__overlay.redoStack)) ? __overlay.redoStack.length : 0;
            __ribbon.setContext(Object.assign({}, __ctx, {
              hasOverlay: __hasOps,
              undoCount: __undo,
              redoCount: __redo,
            }));
          }
        } catch (_) { /* swallow */ }
      }, () => { /* swallow get rejection — reader continues without overlay */ });
    }
  } catch (_) { /* swallow — overlay must never break the reader */ }

  /* Phase 2b — message-level selection click handler. Saved-reader only
   * (gated by the chatType check in the ribbon shell). Adds an outline
   * class to the clicked turn and pushes selectedMessageId +
   * selectedTurnIdx into the ribbon context. The handler ignores clicks
   * on interactive descendants so the legacy text-edit flow keeps
   * working unchanged. Never throws. */
  try {
    if (sc && typeof sc.addEventListener === 'function' && String(snap?.snapshotId || '')) {
      sc.addEventListener('click', function (ev) {
        try {
          const target = ev.target;
          if (!target || typeof target.closest !== 'function') return;
          /* Skip clicks on the legacy edit UI and any interactive
           * descendants — clicking those should not steal focus from
           * the ribbon-selection state. */
          if (target.closest('.wbEditBtn, .wbEditWrap, .wbEditTextarea, button, a, input, select, textarea, [contenteditable="true"]')) return;
          const turn = target.closest('[data-turn]');
          if (!turn || !sc.contains(turn)) return;
          const allTurns = Array.prototype.slice.call(sc.querySelectorAll('[data-turn]'));
          const turnIdx = allTurns.indexOf(turn) + 1; /* 1-based */
          if (turnIdx <= 0) return;
          const messageId = String(turn.getAttribute('data-message-id') || '');
          /* Move the visible outline */
          for (let i = 0; i < allTurns.length; i += 1) {
            try { allTurns[i].classList.remove('is-ribbon-selected'); } catch (_) {}
          }
          turn.classList.add('is-ribbon-selected');
          /* Push to ribbon context — additive merge preserves existing
           * route/title/etc context fields populated by renderRoute. */
          const ribbon = W?.H2O?.Studio?.ribbon;
          if (ribbon && typeof ribbon.setContext === 'function') {
            const ctx = ribbon.getContext();
            ribbon.setContext(Object.assign({}, ctx, {
              selectedMessageId: messageId || null,
              selectedTurnIdx: turnIdx,
            }));
          }
        } catch (_) { /* swallow — selection must never break the reader */ }
      });
    }
  } catch (_) { /* swallow */ }

  return root;
}

function renderReaderRouteMeta(snap){
  const meta = snap?.meta && typeof snap.meta === "object" ? snap.meta : {};
  const title = String(meta.title || snap?.chatId || "Saved chat");
  const answerCount = Number(meta.answerCount || countAssistantTurns(snap?.messages));
  const summary = [
    fmtDate(snap?.createdAt || meta.updatedAt || ""),
    pluralize(answerCount, "answer"),
    meta.folderId ? `Folder: ${meta.folderName || resolveFolderName(meta.folderId) || meta.folderId}` : "",
  ].filter(Boolean).join(" · ");
  setRouteMeta("Studio", title, "");
}

function renderCategoryInspector(snap = state.currentReaderSnapshot){
  const wrap = $("#categoryAssignWrap");
  if (!wrap) return;

  const selectedRow = getSelectedWorkbenchRow();
  const selectedSnapshotId = String(
    snap?.snapshotId
    || state.currentReaderSnapshot?.snapshotId
    || selectedRow?.snapshotId
    || state.selectedSnapshotId
    || ""
  ).trim();
  if (!selectedSnapshotId) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }

  const meta = snap?.meta && typeof snap.meta === "object"
    ? snap.meta
    : (state.currentReaderSnapshot?.meta && typeof state.currentReaderSnapshot.meta === "object"
      ? state.currentReaderSnapshot.meta
      : {});
  const category = normalizeCategoryAssignment(meta.category ?? selectedRow?.category);
  const catalog = (state.categoryCatalog || []).filter((row) => row.status === "active");
  const primaryId = String(category?.primaryCategoryId || "");
  const secondaryId = String(category?.secondaryCategoryId || "");
  const source = String(category?.source || "");
  const primaryName = resolveCategoryName(primaryId);
  const secondaryName = secondaryId ? resolveCategoryName(secondaryId) : "";
  const confidence = Number(category?.confidence);
  const confidenceText = category?.source === "system" && Number.isFinite(confidence)
    ? `${Math.round(confidence * 100)}%`
    : "";
  const sourceLabel = source === "user"
    ? "Manual"
    : (primaryId || confidenceText || secondaryName ? "System" : "Category");

  if (!catalog.length && !primaryId) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }

  const options = [
    { value: "", label: primaryId ? "Uncategorized" : "Select category" },
    ...catalog.map((row) => ({
      value: String(row.id || ""),
      label: String(row.name || row.id || ""),
    })),
  ];
  if (primaryId && !options.some((item) => item.value === primaryId)) {
    options.push({ value: primaryId, label: primaryName });
  }

  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="wbCategoryMeta"${secondaryName ? ` title="Secondary category: ${esc(secondaryName)}"` : ""}>
      <span class="wbCategorySource">${esc(sourceLabel)}</span>
      ${confidenceText ? `<span class="wbCategoryConfidence">${esc(confidenceText)}</span>` : ""}
    </div>
    <label class="wbSelectWrap wbSelectWrap--topbar wbSelectWrap--category">
      <span class="wbSelectLabel">Category</span>
      <select id="categoryAssignSelect" class="wbSelect" aria-label="Assign selected chat to category">
        ${options.map((row) => (
          `<option value="${esc(row.value)}"${row.value === primaryId ? " selected" : ""}>${esc(row.label)}</option>`
        )).join("")}
      </select>
    </label>
    ${source === "user" ? `<button class="wbBtn wbBtn--topbar" id="restoreCategoryBtn" type="button">Restore system</button>` : ""}
    <button class="wbBtn wbBtn--topbar" id="reclassifyCategoryBtn" type="button">Reclassify</button>
  `;
}

async function renderList(view, folderId = "", opts = {}){
  const token = ++state.renderToken;
  const nextView = normalizeArchiveView(view);
  const selectedFolderId = normalizeFolderFilter(folderId);
  const query = $("#q")?.value || "";
  const listPanel = $("#viewListPanel");
  const listEl = $("#viewList");
  const readerEl = $("#viewReader");

  state.currentReaderSnapshot = null;
  state.lastView = nextView;
  state.lastFolderId = selectedFolderId;
  applyUiState();
  setActiveNav(nextView);

  const listHash = buildListHash(nextView, selectedFolderId);
  studioHostUnmount("studio:list");
  if (location.hash !== listHash){
    try {
      history.replaceState(
        Object.assign({}, history.state || {}, { h2oStudioReader: false }),
        "",
        listHash
      );
    } catch {
      location.hash = listHash;
    }
  }
  if (readerEl) readerEl.hidden = true;
  if (listPanel) listPanel.hidden = false;
  if (listEl) listEl.innerHTML = `<div class="wbState">Loading ${esc(viewCopy(nextView).toLowerCase())}…</div>`;
  setSidebarChatLoading(nextView, selectedFolderId);
  setRouteMeta("Studio", viewCopy(nextView), "Loading archive state");

  try {
    const fetched = await fetchWorkbenchRows(!!opts.force);
    if (token !== state.renderToken) return;
    const [allRows] = await Promise.all([
      enrichRowsWithFolderData(fetched, !!opts.force),
      fetchLabelCatalog(!!opts.force).catch(() => []),
      fetchCategoryCatalog(!!opts.force).catch(() => []),
    ]);
    if (token !== state.renderToken) return;

    renderFolderSidebar(allRows, nextView, selectedFolderId);
    const rows = filterRows(allRows, nextView, query, selectedFolderId, state.lastTagFilter);
    renderSidebarChatList(rows, nextView, selectedFolderId, query);
    renderListHeader(allRows, rows, nextView, selectedFolderId, query);

    if (!rows.length){
      if (listEl) listEl.innerHTML = buildEmptyListState(nextView, selectedFolderId, query);
      state.selectedSnapshotId = "";
      state.selectedChatId = "";
      setActiveSidebarChat("");
      syncSelectionControls();
      return;
    }

    if (listEl) listEl.innerHTML = "";
    let selectedRow = null;
    let selectedEl = null;
    const preferredSnapshotId = String(opts.snapshotId || "").trim();
    const preferredChatId = String(opts.chatId || "").trim();
    const currentSelectedSnapshotId = String(state.selectedSnapshotId || "").trim();

    const frag = document.createDocumentFragment();
    rows.forEach((row, index) => {
      const isSelected = preferredSnapshotId
        ? preferredSnapshotId === row.snapshotId
        : preferredChatId
          ? preferredChatId === row.chatId
          : currentSelectedSnapshotId
            ? currentSelectedSnapshotId === row.snapshotId
            : index === 0;
      const el = renderRow(row, isSelected, nextView, selectedFolderId);
      frag.appendChild(el);
      if (isSelected && !selectedRow) {
        selectedRow = row;
        selectedEl = el;
      }
    });
    listEl?.appendChild(frag);

    if (!selectedRow) {
      selectedRow = rows[0];
      selectedEl = listEl?.querySelector(".wbHistoryRow") || null;
    }
    if (selectedRow) selectRow(selectedRow, selectedEl);
  } catch (error){
    renderFolderSidebar(state.rowsCache || [], nextView, selectedFolderId);
    refreshSidebarChatList(nextView, selectedFolderId);
    renderListHeader(state.rowsCache || [], [], nextView, selectedFolderId, query);
    if (listEl) listEl.innerHTML = buildListErrorState(error);
    state.selectedSnapshotId = "";
    state.selectedChatId = "";
    setActiveSidebarChat("");
    syncSelectionControls();
  }
}

async function renderReader(snapshotId){
  const token = ++state.renderToken;
  const sid = String(snapshotId || "").trim();
  const listPanel = $("#viewListPanel");
  const readerEl = $("#viewReader");

  if (listPanel) listPanel.hidden = true;
  if (readerEl) readerEl.hidden = false;
  if (readerEl) readerEl.innerHTML = `<div class="wbState">Loading reader…</div>`;
  setRouteMeta("Studio", "Saved chat", "Loading snapshot");

  try {
    const snap = await callArchive("loadSnapshot", { snapshotId: sid });
    if (token !== state.renderToken) return;
    if (!snap){
      if (readerEl) readerEl.innerHTML = `<div class="wbState">Snapshot not found.</div>`;
      state.selectedSnapshotId = "";
      state.selectedChatId = "";
      state.currentReaderSnapshot = null;
      syncSelectionControls();
      return;
    }

    state.currentReaderSnapshot = snap;
    state.selectedSnapshotId = String(snap.snapshotId || "").trim();
    state.selectedChatId = String(snap.chatId || "").trim();

    if (!Array.isArray(state.rowsCache)) {
      try {
        const rows = await fetchWorkbenchRows(false);
        if (token !== state.renderToken) return;
        await enrichRowsWithFolderData(rows, false);
      } catch {}
    }
    renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);

    await Promise.all([
      fetchFolderCatalog(false).catch(() => ({ canonical: [], review: [] })),
      fetchLabelCatalog(false).catch(() => []),
      fetchCategoryCatalog(false).catch(() => []),
    ]);
    const bindings = await resolveFolderBindingsForChatIds([snap.chatId]).catch(() => new Map());
    if (token !== state.renderToken) return;
    if (bindings.has(snap.chatId)) {
      const binding = normalizeFolderBinding(bindings.get(snap.chatId));
      const meta = snap.meta && typeof snap.meta === "object" ? snap.meta : {};
      snap.meta = {
        ...meta,
        folderId: binding.folderId,
        folderName: binding.folderId
          ? (binding.folderName || resolveFolderName(binding.folderId) || binding.folderId)
          : "",
      };
      updateRowFolderBinding(snap.chatId, snap.meta);
    }
    renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);
    refreshSidebarChatList(state.lastView, state.lastFolderId);

    if (readerEl) {
      readerEl.innerHTML = "";
      readerEl.appendChild(buildReaderDOM(snap));
    }
    renderReaderRouteMeta(snap);
    setActiveSidebarChat(state.selectedSnapshotId);
    syncSelectionControls();
    applyUiState();
  } catch (error){
    if (token !== state.renderToken) return;
    if (readerEl) {
      readerEl.innerHTML = `<div class="wbState wbState--error">${esc(error?.message || "Failed to load snapshot.")}</div>`;
    }
    state.selectedSnapshotId = "";
    state.selectedChatId = "";
    state.currentReaderSnapshot = null;
    setActiveSidebarChat("");
    syncSelectionControls();
  }
}

// ── Library Workspace mutation integration ─────────────────────────────────
// Opportunistically route folder / category / reclassify mutations through
// H2O.LibraryWorkspace when it's booted, so the Workspace cache busts, the
// Library Index refreshes, Insights re-renders, and S0F1h Library Sync
// broadcasts the change to other surfaces. If the facade isn't ready, fall
// back to the original tryArchiveOps path so behavior never regresses.
async function workspaceFolderBinding(chatId, folderId){
  const ws = getLibraryWorkspace();
  if (!ws?.setFolderBinding) return null;
  try {
    const result = await ws.setFolderBinding(chatId, folderId, { source: "user" });
    return { ok: true, result };
  } catch (error){
    return { ok: false, error };
  }
}
async function workspaceCategoryAssign(snapshotId, chatId, primaryCategoryId){
  const ws = getLibraryWorkspace();
  if (!ws?.setSnapshotCategory) return null;
  try {
    const result = await ws.setSnapshotCategory(snapshotId, chatId, primaryCategoryId);
    return { ok: true, result };
  } catch (error){
    return { ok: false, error };
  }
}
async function workspaceCategoryReclassify(snapshotId){
  const ws = getLibraryWorkspace();
  if (!ws?.reclassifySnapshotCategory) return null;
  try {
    const result = await ws.reclassifySnapshotCategory(snapshotId);
    return { ok: true, result };
  } catch (error){
    return { ok: false, error };
  }
}

async function handleFolderAssignChange(){
  const select = $("#folderAssignSelect");
  const chatId = String(state.selectedChatId || state.currentReaderSnapshot?.chatId || "").trim();
  if (!(select && chatId)) return;

  const nextFolderId = normalizeFolderFilter(select.value);
  select.disabled = true;
  try {
    // Prefer the Workspace facade; it shares the same archive bridge but also
    // busts the Library catalog cache and emits 'folder-binding-changed'.
    let attempt = await workspaceFolderBinding(chatId, nextFolderId);
    if (!attempt || !attempt.ok){
      attempt = await tryArchiveOps(FOLDER_SET_OPS, { chatId, folderId: nextFolderId, folderBindingSource: "user" });
    }
    if (!attempt.ok) throw attempt.error || new Error("Folder update failed");

    const binding = normalizeFolderBinding(attempt.result);
    updateRowFolderBinding(chatId, binding);
    renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId);
    renderFolderAssignmentControl();

    const route = parseHash();
    if (route.name === "list") {
      await renderList(route.view, route.folderId, {
        chatId,
        snapshotId: state.selectedSnapshotId,
      });
      return;
    }

    refreshSidebarChatList(state.lastView, state.lastFolderId);
    renderReaderRouteMeta(state.currentReaderSnapshot || {});
    syncSelectionControls();
  } catch (error){
    renderFolderAssignmentControl();
    window.alert(String(error?.message || error || "Failed to update folder binding."));
  } finally {
    if (select) select.disabled = false;
  }
}

async function handleCategoryAssignChange(){
  const select = $("#categoryAssignSelect");
  const snapshotId = String(state.currentReaderSnapshot?.snapshotId || state.selectedSnapshotId || "").trim();
  const primaryCategoryId = String(select?.value || "").trim();
  if (!(select && snapshotId && primaryCategoryId)) return;

  const chatId = String(state.currentReaderSnapshot?.chatId || state.selectedChatId || "").trim();

  select.disabled = true;
  try {
    let attempt = await workspaceCategoryAssign(snapshotId, chatId, primaryCategoryId);
    if (!attempt || !attempt.ok){
      attempt = await tryArchiveOps(CATEGORY_SET_OPS, { snapshotId, primaryCategoryId });
    }
    if (!attempt.ok) throw attempt.error || new Error("Category update failed");
    applySnapshotCategoryUpdate(attempt.result);
    renderCategoryInspector();
    refreshSidebarChatList(state.lastView, state.lastFolderId);
  } catch (error){
    renderCategoryInspector();
    window.alert(String(error?.message || error || "Failed to update category."));
  } finally {
    if (select) select.disabled = false;
  }
}

async function handleCategoryReclassify(){
  const snapshotId = String(state.currentReaderSnapshot?.snapshotId || state.selectedSnapshotId || "").trim();
  if (!snapshotId) return;
  const buttons = ["#restoreCategoryBtn", "#reclassifyCategoryBtn"].map((selector) => $(selector)).filter(Boolean);
  buttons.forEach((btn) => { btn.disabled = true; });
  try {
    let attempt = await workspaceCategoryReclassify(snapshotId);
    if (!attempt || !attempt.ok){
      attempt = await tryArchiveOps(CATEGORY_RECLASSIFY_OPS, { snapshotId });
    }
    if (!attempt.ok) throw attempt.error || new Error("Category reclassify failed");
    applySnapshotCategoryUpdate(attempt.result);
    renderCategoryInspector();
    refreshSidebarChatList(state.lastView, state.lastFolderId);
  } catch (error){
    renderCategoryInspector();
    window.alert(String(error?.message || error || "Failed to reclassify category."));
  }
}

function setSidebarExpanded(expanded){
  state.sidebarExpanded = !!expanded;
  writeUiPrefs();
  applyUiState();
}

function openSidebar(){
  setSidebarExpanded(true);
}

function closeSidebar(){
  setSidebarExpanded(false);
}

function toggleDensity(){
  state.density = state.density === "compact" ? "cozy" : "compact";
  writeUiPrefs();
  applyUiState();
}

function toggleLayout(){
  state.layout = state.layout === "wide" ? "focused" : "wide";
  writeUiPrefs();
  applyUiState();
}

function focusSearch(){
  // v2.8: the visible #q input was removed from the sidebar header in favour
  // of a "Search chats" nav row that routes into the Library Explorer (which
  // exposes its own page-level search input). Keep this helper as a no-op-
  // friendly entry point so any callers (keyboard shortcuts, etc.) still work.
  const q = $("#q");
  if (q && typeof q.focus === "function" && !q.hidden) { q.focus(); return; }
  if (location.hash !== "#/library/explorer") location.hash = "#/library/explorer";
  // Defer one frame so S0F1d has a chance to mount the Explorer page header.
  requestAnimationFrame(() => {
    const pageSearch = document.querySelector(".wbLibraryPageSearchInput");
    if (pageSearch && typeof pageSearch.focus === "function") pageSearch.focus();
  });
}

async function renderRoute(opts = {}){
  /* Phase 1a Studio Ribbon — capture the resolved route here so the
   * try/finally tail can sync ribbon context exactly once regardless of
   * which branch returned early. Initialised null in case parseHash throws. */
  let __ribbonRoute = null;
  try {
  const route = parseHash();
  __ribbonRoute = route;
  // Hide the migration / settings panels by default on every route change;
  // their respective renderers un-hide as needed. This avoids adding cleanup
  // calls inside every other render path.
  if (route.name !== "migrate") {
    const migratePanel = document.getElementById("viewMigratePanel");
    if (migratePanel) migratePanel.hidden = true;
  }
  if (route.name !== "settings") {
    const settingsPanel = document.getElementById("viewSettingsPanel");
    if (settingsPanel) settingsPanel.hidden = true;
  }
  // Sidebar Settings highlight — active on /settings AND on /migrate/* since
  // those are reached from inside Settings. Doesn't touch any other nav item's
  // active state (Library, folders, etc. manage their own).
  try {
    const settingsNav = document.getElementById("wbStudioNavSettings");
    if (settingsNav) {
      const isSettingsScope = route.name === "settings" || route.name === "migrate";
      settingsNav.classList.toggle("active", isSettingsScope);
      if (isSettingsScope) settingsNav.setAttribute("aria-current", "page");
      else settingsNav.removeAttribute("aria-current");
    }
  } catch {}
  if (route.name === "library") {
    // Library overlay is owned by S0F1d Library Insights and toggled by S0Z1f's
    // route subscriber. studio.js does NOT render the list/reader on Library
    // routes — the overlay covers the stage. Bailing out here is the single
    // critical fix that prevents renderList from history.replaceState'ing the
    // hash back to "#/saved" the moment the Library button is clicked. The
    // topbar meta still gets refreshed below so the eyebrow doesn't keep
    // showing the previous list view's text once the overlay opens.
    const LIBRARY_TAB_LABELS = {
      dashboard: "Dashboard",
      analytics: "Analytics",
      explorer:  "Explorer",
      recents:   "Recents",
      saved:     "Saved",
      organize:  "Organize",
      detail:    "Detail",
    };
    const view = String(route.view || "dashboard").toLowerCase();
    const label = LIBRARY_TAB_LABELS[view] || (view ? view[0].toUpperCase() + view.slice(1) : "Dashboard");
    setRouteMeta("Library", label, "Library workspace · folders · labels · categories · projects · tags");
    return;
  }
  if (route.name === "read") {
    await renderReader(route.snapshotId);
    return;
  }
  if (route.name === "migrate") {
    renderMigrateRoute(route.action);
    return;
  }
  if (route.name === "settings") {
    renderSettingsRoute();
    return;
  }
  await renderList(route.view, route.folderId, {
    ...opts,
    chatId: route.chatId,
    snapshotId: route.snapshotId,
  });
  } finally {
    /* Phase 1a Studio Ribbon — single guarded context sync. Runs after
     * every branch (read / library / migrate / settings / list) regardless
     * of which one returned early. The ribbon hides itself when chatType
     * resolves to null (Library / Settings / Migrate / list / snapshot
     * load failure) and shows itself when chatType resolves to 'saved'
     * (opened snapshot reader). The linked-reader placeholder has its own
     * narrow setContext call inside renderLinkedReaderPlaceholder() — it
     * is reached without a URL change so renderRoute does not fire for it.
     * Reads state.currentReaderSnapshot which renderReader has already
     * settled by the time await returns. */
    try {
      const __ribbon = W?.H2O?.Studio?.ribbon;
      if (__ribbon && typeof __ribbon.setContext === 'function') {
        const __r = __ribbonRoute;
        const __isRead = !!(__r && __r.name === 'read');
        const __snap = __isRead ? state.currentReaderSnapshot : null;
        const __hasSnap = !!(__snap && typeof __snap === 'object' && __snap.snapshotId);
        const __meta = (__hasSnap && __snap.meta && typeof __snap.meta === 'object') ? __snap.meta : null;
        const __title = __hasSnap ? String((__meta && __meta.title) || __snap.chatId || '') : null;
        __ribbon.setContext({
          route: __r && __r.name ? String(__r.name) : null,
          chatType: (__isRead && __hasSnap) ? 'saved' : null,
          snapshotId: __hasSnap ? String(__snap.snapshotId || '') : null,
          chatId: __hasSnap ? String(__snap.chatId || '') : null,
          /* Phase 1b — title for Copy title action. Saved snapshots have
           * no source URL field; originalUrl stays null. */
          title: __title || null,
          originalUrl: null,
          readOnly: false,
        });
      }
    } catch (_) { /* swallow — ribbon sync must never break routing */ }
  }
}

// ─── Migration UI (full-bundle export / import) ────────────────────────────
// Owned by the two #/migrate/* routes added in parseHash. Renders directly
// into .wbMain by hiding the list + reader panels and inserting a single
// migration panel. No new HTML/CSS needed — uses inline styles so the panel
// works without studio.css edits and is trivially removable.

function migrateOverlayEnsure(){
  const main = document.querySelector(".wbMain");
  if (!main) return null;
  let panel = document.getElementById("viewMigratePanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "viewMigratePanel";
    panel.className = "wbPanel wbPanel--migrate";
    panel.style.padding = "20px 24px";
    panel.style.maxWidth = "720px";
    panel.style.margin = "0 auto";
    panel.style.fontSize = "14px";
    panel.style.lineHeight = "1.5";
    main.appendChild(panel);
  }
  return panel;
}

function migrateRouteHideOtherPanels(){
  const listPanel = $("#viewListPanel");
  const readerEl = $("#viewReader");
  if (listPanel) listPanel.hidden = true;
  if (readerEl) readerEl.hidden = true;
}

function migrateDownloadJson(filename, obj){
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = String(filename || "h2o-studio-bundle.json");
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { document.body.removeChild(a); } catch {} try { URL.revokeObjectURL(url); } catch {} }, 200);
}

// Studio talks to the SW directly through callArchive (it's the established
// transport seam). archiveBoot lives in S0D3a which is NOT loaded by the
// Studio surface (only S0D3e Transcript Studio Host is), so the migration UI
// invokes the SW ops directly here — same envelope as exportBundle /
// importBundle, just routing to exportFullBundle / importFullBundle.
function migrateGetArchiveBoot(){
  return {
    exportFullBundle: (opts = {}) => callArchive("exportFullBundle", opts || {}),
    dryRunImportFullBundle: ({ bundle } = {}) => callArchive("dryRunImportFullBundle", { bundle }),
    importFullBundle: ({ bundle, mode = "merge" } = {}) =>
      callArchive("importFullBundle", { bundle, mode: String(mode || "merge") }),
  };
}

function migrateExtensionLabel(){
  try {
    const id = chrome?.runtime?.id || "(unknown id)";
    const name = chrome?.runtime?.getManifest?.().name || "(unknown name)";
    const version = chrome?.runtime?.getManifest?.().version || "";
    return { id, name, version, label: `${name} · ${id}${version ? " · v" + version : ""}` };
  } catch {
    return { id: "", name: "", version: "", label: "(extension info unavailable)" };
  }
}

function migrateBuildTimestamp(){
  // ISO 8601 with seconds, safe for filenames.
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
}

// ─── Settings UI ──────────────────────────────────────────────────────────
// Sidebar entry-point that surfaces the existing #/migrate/* routes through a
// user-facing page. NO migration backend logic lives here — the buttons are
// just navigation links to routes that already work. Storage diagnostics show
// the active extension's identity (the same info that resolves the "data
// disappeared after switching builds" class of bug) plus a cheap saved-chat
// count via the existing listAllChatIds bridge op.

function settingsOverlayEnsure(){
  const main = document.querySelector(".wbMain");
  if (!main) return null;
  let panel = document.getElementById("viewSettingsPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "viewSettingsPanel";
    panel.className = "wbPanel wbPanel--settings";
    panel.style.padding = "20px 24px";
    panel.style.maxWidth = "880px";
    panel.style.margin = "0 auto";
    panel.style.fontSize = "14px";
    panel.style.lineHeight = "1.55";
    /* Settings scroll fix. With the Local Sync section now carrying
     * Phase E/H folder-state import controls + extended status grid,
     * Settings content can exceed the viewport. Bound the panel to
     * viewport height (minus a small safe margin for surrounding
     * chrome) and let it scroll vertically inside its own box.
     * box-sizing:border-box keeps the existing padding inside the
     * max-height calc. overscroll-behavior:contain stops scroll
     * chaining into the parent (.wbMain) when the user reaches the
     * top/bottom. Works identically in Desktop/Tauri and MV3 Studio
     * Launcher — no platform-specific branching. */
    panel.style.maxHeight = "calc(100vh - 40px)";
    panel.style.overflowY = "auto";
    panel.style.overscrollBehavior = "contain";
    panel.style.boxSizing = "border-box";
    main.appendChild(panel);
  }
  return panel;
}

function settingsHideOtherPanels(){
  const listPanel = $("#viewListPanel");
  const readerEl = $("#viewReader");
  const migratePanel = document.getElementById("viewMigratePanel");
  if (listPanel) listPanel.hidden = true;
  if (readerEl) readerEl.hidden = true;
  if (migratePanel) migratePanel.hidden = true;
}

function renderSettingsRoute(){
  settingsHideOtherPanels();
  setRouteMeta("Settings", "Studio Settings", "Studio configuration · data & migration · storage diagnostics");
  const panel = settingsOverlayEnsure();
  if (!panel) return;
  panel.hidden = false;

  // Idempotency: same guard as renderMigrateRoute (focus / visibilitychange
  // re-enters renderRoute and would otherwise wipe the panel on every
  // window-focus event).
  if (panel.dataset.settingsRendered === "1" && panel.firstChild) {
    refreshSettingsDiagnostics(panel);
    return;
  }
  panel.dataset.settingsRendered = "1";
  panel.innerHTML = "";

  const meta = migrateExtensionLabel();
  const cardStyle = "display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)";
  const sectionTitleStyle = "margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.65";
  const btnStyle = "padding:8px 14px;border-radius:6px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:inherit;font:inherit;text-decoration:none;display:inline-block";

  panel.innerHTML = `
    <h2 style="margin:0 0 4px;font-size:22px;font-weight:600">Studio Settings</h2>
    <div style="margin:0 0 24px;opacity:.7;font-size:12px">Studio configuration, data tools, and diagnostics.</div>

    <h3 style="${sectionTitleStyle}">Data &amp; Migration</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:0 0 28px">
      <div style="${cardStyle}">
        <div style="font-weight:600">Export Studio Bundle</div>
        <div style="opacity:.7;font-size:12px;flex:1">Download a full JSON bundle of your chats, snapshots, folders, labels, categories, projects, highlights, library KV, and UI prefs. Auth tokens are never exported.</div>
        <a href="#/migrate/export" style="${btnStyle}">Open Export</a>
      </div>
      <div style="${cardStyle}">
        <div style="font-weight:600">Import Studio Bundle</div>
        <div style="opacity:.7;font-size:12px;flex:1">Apply a previously exported bundle to this extension. The flow auto-backs-up current data and dry-runs before any write. Merge mode never overwrites existing records.</div>
        <a href="#/migrate/import" style="${btnStyle}">Open Import</a>
      </div>
      <div style="${cardStyle}">
        <div style="font-weight:600">Backup Current Studio Data</div>
        <div style="opacity:.7;font-size:12px;flex:1">Generate a snapshot of <em>this</em> extension's Studio data right now. Same operation as Export — pair it with Import to migrate across extension IDs or restore from a known-good state.</div>
        <a href="#/migrate/export" style="${btnStyle}">Open Backup</a>
      </div>
    </div>

    <h3 style="${sectionTitleStyle}">Local Sync</h3>
    <div id="wbSettingsSyncBox" style="${cardStyle};margin:0 0 28px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div id="wbSettingsSyncTitle" style="font-weight:600">Desktop to Chrome Sync</div>
          <div id="wbSettingsSyncSummary" style="opacity:.7;font-size:12px">Reading sync status…</div>
        </div>
        <button id="wbSettingsSyncRefresh" type="button" style="${btnStyle}">Refresh Status</button>
      </div>
      <div id="wbSettingsSyncStatus" style="display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace"></div>
      <div id="wbSettingsSyncDesktopControls" style="display:none;gap:8px;flex-wrap:wrap">
        <button id="wbSettingsSyncExportLatest" type="button" style="${btnStyle}">Write latest.json</button>
        <button id="wbSettingsSyncEnableDesktopAuto" type="button" style="${btnStyle}">Enable Auto Export</button>
        <button id="wbSettingsSyncDisableDesktopAuto" type="button" style="${btnStyle}">Disable Auto Export</button>
      </div>
      <div id="wbSettingsSyncFolderStateImport" style="display:none;flex-direction:column;gap:8px;padding-top:10px;margin-top:4px;border-top:1px solid rgba(255,255,255,.06)">
        <div style="font-size:12px;opacity:.7;line-height:1.4">
          Import a manually captured Chrome/Studio folder-state JSON file. Routes through
          <code>H2O.Studio.sync.importFromFile()</code>; folder-only payloads take the
          <code>importFolderStateOnly</code> fast path. Read-only on the source file; no Chrome
          write-back, no daemon, no bidirectional sync.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="wbSettingsSyncFolderStatePath" type="text" spellcheck="false" autocomplete="off"
                 value="/Users/hobayda/H2O Studio Sync/real-folder-state.json"
                 placeholder="/absolute/path/to/folder-state.json"
                 style="flex:1;min-width:240px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px" />
          <button id="wbSettingsSyncFolderStatePickBtn" type="button" style="${btnStyle}" title="Open native file picker to select a folder-state JSON">Choose file…</button>
          <button id="wbSettingsSyncFolderStateImportBtn" type="button" style="${btnStyle}">Import folder-state</button>
        </div>
      </div>
      <div id="wbSettingsSyncChromeControls" style="display:none;gap:8px;flex-wrap:wrap">
        <button id="wbSettingsSyncConnectFolder" type="button" style="${btnStyle}">Connect Folder</button>
        <button id="wbSettingsSyncDisconnectFolder" type="button" style="${btnStyle}">Disconnect</button>
        <button id="wbSettingsSyncNow" type="button" style="${btnStyle}">Sync Now</button>
        <button id="wbSettingsSyncEnableChromeAuto" type="button" style="${btnStyle}">Enable Auto Sync</button>
        <button id="wbSettingsSyncDisableChromeAuto" type="button" style="${btnStyle}">Disable Auto Sync</button>
      </div>
      <pre id="wbSettingsSyncLog" style="white-space:pre-wrap;background:rgba(0,0,0,.18);padding:10px;border-radius:6px;max-height:160px;overflow:auto;font-size:12px;line-height:1.45;margin:0" hidden></pre>
    </div>

    <h3 style="${sectionTitleStyle}">Folder Parity</h3>
    <div id="wbSettingsFolderParityBox" style="${cardStyle};margin:0 0 28px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <div style="font-weight:600">Folder Parity</div>
          <div id="wbSettingsFolderParitySummary" style="opacity:.7;font-size:12px">Reading read-only folder parity diagnostics…</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="wbSettingsFolderParityRefresh" type="button" style="${btnStyle}">Refresh diagnostics</button>
          <button id="wbSettingsFolderParityCopy" type="button" style="${btnStyle}">Copy report JSON</button>
        </div>
      </div>
      <div id="wbSettingsFolderParityStatus" style="display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace"></div>
      <div id="wbSettingsFolderParityLists" style="display:flex;flex-direction:column;gap:6px;font-size:13px"></div>
      <div id="wbSettingsFolderParityWarn" style="font-size:12px;opacity:.72">Read-only. No cleanup performed. Cleanup requires reviewed approval.</div>
      <div id="wbSettingsFolderMirrorRefresh" style="${STUDIO_isTauri() ? "display:flex" : "display:none"};flex-direction:column;gap:8px;padding:10px;margin-top:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:8px">
        <div>
          <div style="font-weight:600">Refresh Desktop folder mirror</div>
          <div id="wbSettingsFolderMirrorRefreshSummary" style="opacity:.72;font-size:12px">Refreshes only this Desktop mirror key from a reviewed folder-state JSON. Desktop SQLite folders and bindings are not changed.</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="wbSettingsFolderMirrorRefreshPath" type="text" spellcheck="false" autocomplete="off"
                 value="${esc(FOLDER_DESKTOP_MIRROR_REFRESH_STATE.path || "")}"
                 placeholder="/absolute/path/to/folder-state.json"
                 style="flex:1;min-width:240px;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px" />
          <button id="wbSettingsFolderMirrorRefreshPick" type="button" style="${btnStyle}">Choose file...</button>
        </div>
        <textarea id="wbSettingsFolderMirrorRefreshJson" spellcheck="false" autocomplete="off"
                  placeholder="Or paste raw Native/Chrome folder-state JSON here"
                  style="min-height:76px;resize:vertical;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px">${esc(FOLDER_DESKTOP_MIRROR_REFRESH_STATE.pastedJson || "")}</textarea>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button id="wbSettingsFolderMirrorRefreshPreview" type="button" style="${btnStyle}">Preview Desktop mirror refresh</button>
          <button id="wbSettingsFolderMirrorRefreshCopyPlan" type="button" style="${btnStyle}">Copy refresh plan JSON</button>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px">
          <span style="opacity:.72">Type <code>${esc(FOLDER_DESKTOP_MIRROR_REFRESH_CONFIRM_TEXT)}</code> to enable mirror refresh.</span>
          <input id="wbSettingsFolderMirrorRefreshConfirm" type="text" autocomplete="off" spellcheck="false"
                 value="${esc(FOLDER_DESKTOP_MIRROR_REFRESH_STATE.confirmation || "")}"
                 style="padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px" />
        </label>
        <button id="wbSettingsFolderMirrorRefreshRun" type="button" style="${btnStyle}" disabled>Refresh Desktop folder mirror</button>
        <div id="wbSettingsFolderMirrorRefreshStatus" style="font-size:12px;opacity:.72">${esc(FOLDER_DESKTOP_MIRROR_REFRESH_STATE.status || "Desktop mirror only. Native, Chrome, folders, and folder_bindings are not changed.")}</div>
        <pre id="wbSettingsFolderMirrorRefreshPreviewOut" style="white-space:pre-wrap;background:rgba(0,0,0,.18);padding:10px;border-radius:6px;max-height:180px;overflow:auto;font-size:12px;line-height:1.45;margin:0" hidden></pre>
      </div>
      <div id="wbSettingsFolderCleanupReview" style="display:flex;flex-direction:column;gap:10px;padding-top:12px;margin-top:4px;border-top:1px solid rgba(255,255,255,.08)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-weight:600">Cleanup Candidate Review</div>
            <div id="wbSettingsFolderCleanupReviewSummary" style="opacity:.7;font-size:12px">Review-only. No cleanup performed.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="wbSettingsFolderCleanupReviewRefresh" type="button" style="${btnStyle}">Refresh review</button>
            <button id="wbSettingsFolderCleanupReviewCopy" type="button" style="${btnStyle}">Copy cleanup plan JSON</button>
          </div>
        </div>
        <div id="wbSettingsFolderCleanupReviewChips" style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px"></div>
        <div id="wbSettingsFolderCleanupReviewGroups" style="display:flex;flex-direction:column;gap:8px;font-size:13px"></div>
        <div id="wbSettingsFolderCleanupDeleteBox" style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
          <div>
            <div style="font-weight:600">Safe Empty Chrome Mirror Cleanup</div>
            <div id="wbSettingsFolderCleanupDeleteSummary" style="opacity:.72;font-size:12px">Chrome mirror only. Native folders and Desktop SQLite are not modified.</div>
          </div>
          <div id="wbSettingsFolderCleanupDeleteList" style="display:flex;flex-direction:column;gap:6px;font-size:13px"></div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button id="wbSettingsFolderCleanupPreview" type="button" style="${btnStyle}">Preview deletion JSON</button>
            <button id="wbSettingsFolderCleanupCopyDeletePlan" type="button" style="${btnStyle}">Copy deletion plan JSON</button>
          </div>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px">
            <span style="opacity:.72">Type <code>${esc("DELETE EMPTY CHROME FOLDERS")}</code> to enable deletion.</span>
            <input id="wbSettingsFolderCleanupConfirm" type="text" autocomplete="off" spellcheck="false" style="padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px" />
          </label>
          <button id="wbSettingsFolderCleanupDeleteSelected" type="button" style="${btnStyle}" disabled>Delete selected safe empty folders</button>
          <pre id="wbSettingsFolderCleanupDeletePreview" style="white-space:pre-wrap;background:rgba(0,0,0,.18);padding:10px;border-radius:6px;max-height:180px;overflow:auto;font-size:12px;line-height:1.45;margin:0" hidden></pre>
        </div>
        <div id="wbSettingsFolderConflictReview" style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-weight:600">Same-name Conflict Resolution</div>
              <div id="wbSettingsFolderConflictSummary" style="opacity:.72;font-size:12px">Review-only. No merge or deletion performed.</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button id="wbSettingsFolderConflictRefresh" type="button" style="${btnStyle}">Refresh conflict review</button>
              <button id="wbSettingsFolderConflictCopy" type="button" style="${btnStyle}">Copy conflict plan JSON</button>
            </div>
          </div>
          <div id="wbSettingsFolderConflictGroups" style="display:flex;flex-direction:column;gap:8px;font-size:13px"></div>
          <div id="wbSettingsFolderConflictDeleteBox" style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
            <div>
              <div style="font-weight:600">Delete Empty Duplicate Conflicts</div>
              <div id="wbSettingsFolderConflictDeleteSummary" style="opacity:.72;font-size:12px">Chrome mirror only. Canonical folders, Desktop SQLite, and native folder-state are not modified.</div>
            </div>
            <div id="wbSettingsFolderConflictDeleteList" style="display:flex;flex-direction:column;gap:6px;font-size:13px"></div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <button id="wbSettingsFolderConflictPreviewDelete" type="button" style="${btnStyle}">Preview conflict deletion JSON</button>
              <button id="wbSettingsFolderConflictCopyDeletePlan" type="button" style="${btnStyle}">Copy conflict deletion plan JSON</button>
            </div>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12px">
              <span style="opacity:.72">Type <code>${esc("DELETE EMPTY DUPLICATE FOLDERS")}</code> to enable duplicate deletion.</span>
              <input id="wbSettingsFolderConflictDeleteConfirm" type="text" autocomplete="off" spellcheck="false" style="padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px" />
            </label>
            <button id="wbSettingsFolderConflictDeleteSelected" type="button" style="${btnStyle}" disabled>Delete selected empty duplicate folders</button>
            <pre id="wbSettingsFolderConflictDeletePreview" style="white-space:pre-wrap;background:rgba(0,0,0,.18);padding:10px;border-radius:6px;max-height:180px;overflow:auto;font-size:12px;line-height:1.45;margin:0" hidden></pre>
          </div>
        </div>
        <div id="wbSettingsFolderDesktopReview" style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-weight:600">Desktop Cleanup Review</div>
              <div id="wbSettingsFolderDesktopReviewSummary" style="opacity:.72;font-size:12px">Review-only. No Desktop cleanup performed.</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button id="wbSettingsFolderDesktopReviewRefresh" type="button" style="${btnStyle}">Refresh Desktop review</button>
              <button id="wbSettingsFolderDesktopReviewCopy" type="button" style="${btnStyle}">Copy Desktop cleanup report JSON</button>
            </div>
          </div>
          <div id="wbSettingsFolderDesktopReviewChips" style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px"></div>
          <div id="wbSettingsFolderDesktopReviewGroups" style="display:flex;flex-direction:column;gap:8px;font-size:13px"></div>
          <div id="wbSettingsFolderDesktopDeleteBox" style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
            <div>
              <div style="font-weight:600">Delete Empty Desktop Folders</div>
              <div id="wbSettingsFolderDesktopDeleteSummary" style="opacity:.72;font-size:12px">Desktop SQLite only. Chrome mirror, native folder-state, and sync folder are not modified.</div>
            </div>
            <div id="wbSettingsFolderDesktopDeleteList" style="display:flex;flex-direction:column;gap:6px;font-size:13px"></div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <button id="wbSettingsFolderDesktopPreviewDelete" type="button" style="${btnStyle}">Preview Desktop deletion JSON</button>
              <button id="wbSettingsFolderDesktopCopyDeletePlan" type="button" style="${btnStyle}">Copy Desktop deletion plan JSON</button>
            </div>
            <label style="display:flex;flex-direction:column;gap:4px;font-size:12px">
              <span style="opacity:.72">Type <code>${esc(FOLDER_DESKTOP_CLEANUP_CONFIRM_TEXT)}</code> to enable Desktop deletion.</span>
              <input id="wbSettingsFolderDesktopDeleteConfirm" type="text" autocomplete="off" spellcheck="false" style="padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px" />
            </label>
            <button id="wbSettingsFolderDesktopDeleteSelected" type="button" style="${btnStyle}" disabled>Delete selected empty Desktop folders</button>
            <pre id="wbSettingsFolderDesktopDeletePreview" style="white-space:pre-wrap;background:rgba(0,0,0,.18);padding:10px;border-radius:6px;max-height:180px;overflow:auto;font-size:12px;line-height:1.45;margin:0" hidden></pre>
          </div>
          <div id="wbSettingsFolderDesktopOrphanBindingBox" style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div>
                <div style="font-weight:600">Orphan Desktop Binding Review</div>
                <div id="wbSettingsFolderDesktopOrphanBindingSummary" style="opacity:.72;font-size:12px">Review-only. No binding removed.</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button id="wbSettingsFolderDesktopOrphanBindingRefresh" type="button" style="${btnStyle}">Refresh orphan binding review</button>
                <button id="wbSettingsFolderDesktopOrphanBindingCopy" type="button" style="${btnStyle}">Copy orphan binding report JSON</button>
              </div>
            </div>
            <div id="wbSettingsFolderDesktopOrphanBindingBody" style="display:flex;flex-direction:column;gap:8px;font-size:13px"></div>
            <div id="wbSettingsFolderDesktopOrphanBindingRemoveBox" style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
              <div>
                <div style="font-weight:600">Remove Orphan Desktop Binding</div>
                <div id="wbSettingsFolderDesktopOrphanBindingRemoveSummary" style="opacity:.72;font-size:12px">Desktop SQLite binding only. The folder row, Chrome mirror, native folder-state, and sync folder are not modified.</div>
              </div>
              <div id="wbSettingsFolderDesktopOrphanBindingRemoveList" style="display:flex;flex-direction:column;gap:6px;font-size:13px"></div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button id="wbSettingsFolderDesktopOrphanBindingPreviewRemove" type="button" style="${btnStyle}">Preview orphan binding removal JSON</button>
                <button id="wbSettingsFolderDesktopOrphanBindingCopyRemovePlan" type="button" style="${btnStyle}">Copy orphan binding removal plan JSON</button>
              </div>
              <label style="display:flex;flex-direction:column;gap:4px;font-size:12px">
                <span style="opacity:.72">Type <code>${esc(FOLDER_DESKTOP_ORPHAN_BINDING_CONFIRM_TEXT)}</code> to enable binding removal.</span>
                <input id="wbSettingsFolderDesktopOrphanBindingRemoveConfirm" type="text" autocomplete="off" spellcheck="false" style="padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit;font:inherit;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px" />
              </label>
              <button id="wbSettingsFolderDesktopOrphanBindingRemoveSelected" type="button" style="${btnStyle}" disabled>Remove selected orphan binding</button>
              <pre id="wbSettingsFolderDesktopOrphanBindingRemovePreview" style="white-space:pre-wrap;background:rgba(0,0,0,.18);padding:10px;border-radius:6px;max-height:180px;overflow:auto;font-size:12px;line-height:1.45;margin:0" hidden></pre>
            </div>
          </div>
        </div>
      </div>
      <pre id="wbSettingsFolderParityLog" style="white-space:pre-wrap;background:rgba(0,0,0,.18);padding:10px;border-radius:6px;max-height:160px;overflow:auto;font-size:12px;line-height:1.45;margin:0" hidden></pre>
    </div>

    <h3 style="${sectionTitleStyle}">Storage Diagnostics</h3>
    <div id="wbSettingsDiagBox" style="${cardStyle}">
      <div style="display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">
        <div style="opacity:.6">Extension ID</div>           <div id="wbSettingsDiagId">${esc(meta.id || "(unavailable)")}</div>
        <div style="opacity:.6">Extension name</div>         <div id="wbSettingsDiagName">${esc(meta.name || "(unavailable)")}</div>
        <div style="opacity:.6">Version</div>                <div id="wbSettingsDiagVersion">${esc(meta.version || "(unavailable)")}</div>
        <div style="opacity:.6">Saved chats</div>            <div id="wbSettingsDiagChats">(loading…)</div>
        <div style="opacity:.6">Build channel</div>          <div id="wbSettingsDiagBuild">(loading…)</div>
      </div>
      <div id="wbSettingsDiagWarn" style="margin-top:8px;font-size:12px;opacity:.75" hidden></div>
    </div>
    <div style="margin-top:8px;font-size:12px;opacity:.6">
      Tip: each Chrome extension ID has its own isolated <code>chrome.storage.local</code> and IndexedDB. If your data ever disappears after rebuilding from a new path, it's almost certainly still alive under the previous extension ID — use Import on the old extension's bundle to restore.
    </div>
  `;

  bindSettingsSyncControls(panel);
  refreshSettingsDiagnostics(panel);

  /* Phase I — restore the last-picked folder-state import path if one
   * was persisted in a prior session. Fire-and-forget: the template
   * already pre-fills the input with the runbook example path, so a
   * cold cache or storage failure simply keeps that default. Read
   * happens once per panel build (the renderSettingsRoute first-render
   * branch); subsequent refreshes do not re-read so a user's in-flight
   * edits are never clobbered by focus/visibility re-entries. */
  STUDIO_settingsReadFolderStateLastPath().then((stored) => {
    if (!stored) return;
    const input = panel.querySelector("#wbSettingsSyncFolderStatePath");
    if (input) input.value = stored;
  }).catch(() => { /* ignore */ });
}

async function refreshSettingsDiagnostics(panel){
  if (!panel) return;
  const meta = migrateExtensionLabel();
  const elId = panel.querySelector("#wbSettingsDiagId");
  const elName = panel.querySelector("#wbSettingsDiagName");
  const elVer = panel.querySelector("#wbSettingsDiagVersion");
  const elChats = panel.querySelector("#wbSettingsDiagChats");
  const elBuild = panel.querySelector("#wbSettingsDiagBuild");
  const elWarn = panel.querySelector("#wbSettingsDiagWarn");
  if (elId) elId.textContent = meta.id || "(unavailable)";
  if (elName) elName.textContent = meta.name || "(unavailable)";
  if (elVer) elVer.textContent = meta.version || "(unavailable)";

  // Build channel inferred from manifest name. Cheap heuristic; aligns with
  // the names emitted by chrome-live-build-context.mjs.
  let channel = "unknown";
  const nm = String(meta.name || "");
  if (/Cockpit Pro/i.test(nm)) channel = "production (chrome-ext-prod)";
  else if (/Dev Controls/i.test(nm)) channel = "dev-controls";
  else if (/Lean/i.test(nm)) channel = "dev-lean";
  if (elBuild) elBuild.textContent = channel;

  if (elChats) {
    try {
      const rows = await callArchive("listAllChatIds", {});
      const count = Array.isArray(rows) ? rows.length : 0;
      elChats.textContent = String(count);
      if (elWarn && count === 0) {
        elWarn.hidden = false;
        elWarn.textContent = "This extension has zero saved chats. If you expect chats here, check whether another extension (different ID) holds them — see the tip above and use Import.";
      } else if (elWarn) {
        elWarn.hidden = true;
        elWarn.textContent = "";
      }
    } catch (err) {
      elChats.textContent = "(unavailable)";
      if (elWarn) {
        elWarn.hidden = false;
        elWarn.textContent = "Storage probe failed: " + String(err && (err.message || err));
      }
    }
  }
  refreshSettingsSync(panel).catch((err) => {
    const log = panel.querySelector("#wbSettingsSyncLog");
    if (log) {
      log.hidden = false;
      log.textContent = "Sync status refresh failed.\n" + String(err && (err.stack || err.message || err));
    }
  });
  refreshSettingsFolderParity(panel).catch((err) => {
    settingsFolderParityLog(panel, "Folder parity diagnostics failed.\n" + String(err && (err.stack || err.message || err)));
  });
}

function settingsFormatBytes(value){
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function settingsIsoOrBlank(value){
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    try { return new Date(value).toLocaleString(); }
    catch { return String(value); }
  }
  const raw = String(value || "").trim();
  if (!raw) return "";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return raw;
  try { return new Date(ms).toLocaleString(); }
  catch { return raw; }
}

function settingsSyncRowsHtml(rows){
  return rows.map(([label, value]) => `
    <div style="opacity:.6">${esc(label)}</div>
    <div>${esc(value == null || value === "" ? "—" : value)}</div>
  `).join("");
}

function settingsFolderParityLog(panel, message){
  const log = panel && panel.querySelector("#wbSettingsFolderParityLog");
  if (!log) return;
  log.hidden = false;
  log.textContent = String(message || "");
}

function settingsFolderParityNames(items, emptyLabel = "none"){
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return `<span style="opacity:.65">${esc(emptyLabel)}</span>`;
  return arr.map((item) => {
    const name = String(item?.name || item?.normalizedName || item || "").trim() || "(unnamed)";
    const ids = Array.isArray(item?.ids) ? item.ids : (item?.id || item?.folderId ? [item.id || item.folderId] : []);
    const suffix = ids.length ? ` <span style="opacity:.55">(${esc(ids.join(", "))})</span>` : "";
    return `<span>${esc(name)}${suffix}</span>`;
  }).join(", ");
}

function settingsFolderParityChecksHtml(selfCheck){
  const checks = Array.isArray(selfCheck?.checks) ? selfCheck.checks : [];
  const attention = checks.filter((check) => {
    const sev = String(check?.severity || "");
    return !check?.ok || sev === "warning" || sev === "review-required" || sev === "error";
  });
  if (!attention.length) return `<span style="opacity:.65">none</span>`;
  return attention.map((check) => {
    const severity = String(check?.severity || "warning");
    const id = String(check?.id || "");
    const message = String(check?.message || "");
    return `
      <div style="display:grid;grid-template-columns:max-content 1fr;gap:6px 8px;align-items:start">
        <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;opacity:.75">${esc(severity)}</span>
        <span><strong>${esc(id)}</strong>: ${esc(message)}</span>
      </div>
    `;
  }).join("");
}

function settingsFolderCleanupNumber(value){
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function settingsFolderCleanupRowBindingCount(row){
  return Math.max(
    settingsFolderCleanupNumber(row?.bindingCount),
    settingsFolderCleanupNumber(row?.localBindingCount)
  );
}

function settingsFolderCleanupIsF5DReviewCandidate(row){
  const src = row && typeof row === "object" ? row : {};
  const parts = [
    src.folderId,
    src.id,
    src.name,
    src.normalizedName,
  ].map((value) => String(value || ""));
  return parts.some((value) => /f5d/i.test(value));
}

function settingsFolderCleanupReviewCandidate(row, classification, opts = {}){
  const src = row && typeof row === "object" ? row : {};
  const folderId = String(src.folderId || src.id || opts.folderId || "").trim();
  const name = String(src.name || opts.name || folderId || "Folder review item").trim();
  const knownCount = settingsFolderCleanupNumber(src.knownCount);
  const localBindingCount = settingsFolderCleanupRowBindingCount(src);
  const bindingCount = Math.max(localBindingCount, knownCount);
  const canonicalCount = settingsFolderCleanupNumber(src.canonicalCount);
  const orphanCount = settingsFolderCleanupNumber(src.orphanCount || opts.orphanCount);
  const warnings = Array.isArray(opts.warnings) ? opts.warnings.slice() : [];
  const badges = Array.isArray(src.badges) ? src.badges.map((badge) => String(badge || "").trim()).filter(Boolean) : [];
  const isCanonical = !!src.isCanonical || !!opts.isCanonical;
  const isConflict = !!src.isConflict || classification === "same-name-conflict";
  const isTestCandidate = !!src.isTestCandidate;
  const isExtra = !!src.isExtra;
  const nativePresence = isCanonical || !!opts.nativePresence;

  if (isCanonical) warnings.push("Protected canonical folder. Never a cleanup candidate.");
  if (isConflict) warnings.push("Same-name/different-ID conflict. Review-only; no automatic merge.");
  if (bindingCount > 0 && !isCanonical) warnings.push("Folder has local bindings or known rows. Review-only.");
  if (orphanCount > 0) warnings.push("Native memberships are not represented by known Studio rows.");
  if (settingsFolderCleanupIsF5DReviewCandidate(src)) {
    warnings.push("Desktop/F5D review required.");
    warnings.push("Not eligible for Chrome mirror P7b deletion.");
  }

  let proposedAction = "Review only. No P7a mutation is available.";
  let riskLevel = "review";
  let requiresApproval = true;
  if (classification === "safe-empty") {
    proposedAction = "Future P7b candidate only after explicit preview and typed approval.";
    riskLevel = "low-review-required";
  } else if (classification === "orphan-membership") {
    proposedAction = "Review membership coverage. Not a folder removal candidate.";
    riskLevel = "review-required";
  } else if (classification === "canonical-protected") {
    proposedAction = "Preserve canonical folder.";
    riskLevel = "protected";
    requiresApproval = false;
  } else if (classification === "bound-review") {
    proposedAction = "Inspect bindings before any future action.";
    riskLevel = "high-review-required";
  } else if (classification === "same-name-conflict") {
    proposedAction = "Resolve only through a future conflict review plan.";
    riskLevel = "high-review-required";
  }

  return {
    folderId,
    name,
    normalizedName: String(src.normalizedName || name).trim().toLowerCase(),
    classification,
    surface: String(opts.surface || src.surface || ""),
    isCanonical,
    isExtra,
    isTestCandidate,
    isConflict,
    bindingCount,
    canonicalCount,
    knownCount,
    localBindingCount,
    savedCount: settingsFolderCleanupNumber(src.savedCount),
    linkedCount: settingsFolderCleanupNumber(src.linkedCount),
    orphanCount,
    badges,
    nativePresence,
    proposedAction,
    riskLevel,
    requiresApproval,
    reversible: false,
    warnings: Array.from(new Set(warnings.filter(Boolean))),
  };
}

function settingsFolderCleanupBuildReviewPlan(selfCheck, displayModel){
  const rows = Array.isArray(displayModel?.rows) ? displayModel.rows : [];
  const surface = String(selfCheck?.surface || displayModel?.surface || "");
  const rowCandidate = (row, classification, opts = {}) => settingsFolderCleanupReviewCandidate(row, classification, { ...opts, surface });
  const isSafeEmpty = (row) => {
    const bindingCount = settingsFolderCleanupRowBindingCount(row);
    const knownCount = settingsFolderCleanupNumber(row?.knownCount);
    return !row?.isCanonical
      && (!!row?.isExtra || !!row?.isTestCandidate)
      && !row?.isConflict
      && !settingsFolderCleanupIsF5DReviewCandidate(row)
      && bindingCount === 0
      && knownCount === 0;
  };
  const safeEmptyCandidates = rows
    .filter(isSafeEmpty)
    .map((row) => rowCandidate(row, "safe-empty", { nativePresence: false }));
  const sameNameConflicts = rows
    .filter((row) => !row?.isCanonical && !!row?.isConflict)
    .map((row) => rowCandidate(row, "same-name-conflict", { nativePresence: false }));
  const boundReviewCandidates = rows
    .filter((row) => {
      const bindingCount = settingsFolderCleanupRowBindingCount(row);
      const knownCount = settingsFolderCleanupNumber(row?.knownCount);
      return !row?.isCanonical
        && (!!row?.isExtra || !!row?.isTestCandidate)
        && !row?.isConflict
        && (bindingCount > 0 || knownCount > 0 || settingsFolderCleanupIsF5DReviewCandidate(row));
    })
    .map((row) => rowCandidate(row, "bound-review", { nativePresence: false }));
  const orphanRows = rows
    .filter((row) => !!row?.isCanonical && settingsFolderCleanupNumber(row?.orphanCount) > 0)
    .map((row) => rowCandidate(row, "orphan-membership", {
      isCanonical: true,
      nativePresence: true,
      orphanCount: settingsFolderCleanupNumber(row?.orphanCount),
    }));
  const orphanCheck = (Array.isArray(selfCheck?.checks) ? selfCheck.checks : [])
    .find((check) => String(check?.id || "") === "folder.binding.orphan");
  const orphanCount = settingsFolderCleanupNumber(selfCheck?.summary?.orphanMembershipCount || orphanCheck?.details?.orphanMembershipCount);
  const orphanMemberships = orphanRows.length || orphanCount === 0
    ? orphanRows
    : [settingsFolderCleanupReviewCandidate({
      name: "Canonical orphan memberships",
      orphanCount,
      knownCount: settingsFolderCleanupNumber(orphanCheck?.details?.knownStudioRowTotal),
    }, "orphan-membership", {
      surface,
      orphanCount,
      nativePresence: true,
      warnings: ["Aggregate self-check item. It is not a folder deletion candidate."],
    })];
  const canonicalProtected = rows
    .filter((row) => !!row?.isCanonical)
    .map((row) => rowCandidate(row, "canonical-protected", { isCanonical: true, nativePresence: true }));

  const groups = {
    safeEmptyCandidates,
    sameNameConflicts,
    boundReviewCandidates,
    orphanMemberships,
    canonicalProtected,
  };
  return {
    readOnly: true,
    noMutation: true,
    generatedAt: new Date().toISOString(),
    surface,
    selfCheckSummary: selfCheck?.summary || null,
    selfCheckSeverity: selfCheck?.severity || "",
    counts: {
      safeEmpty: safeEmptyCandidates.length,
      conflicts: sameNameConflicts.length,
      boundReview: boundReviewCandidates.length,
      orphanMemberships: orphanMemberships.length,
      canonicalProtected: canonicalProtected.length,
    },
    groups,
    safetyRules: [
      "P7a is review-only.",
      "No folder cleanup is performed.",
      "No Chrome storage, SQLite, or native folder-state writes are performed.",
      "Canonical f_* folders are protected.",
      "Conflicts and bound folders are review-only.",
      "Desktop/F5D test folders are review-only in P7b.",
    ],
  };
}

async function settingsFolderCleanupLoadReviewInputs(){
  const parity = W.H2O?.Library?.FolderParity;
  if (!parity || typeof parity.selfCheck !== "function" || typeof parity.getDisplayModel !== "function") {
    throw new Error("FolderParity review APIs unavailable");
  }
  const selfCheck = await parity.selfCheck({ fresh: true });
  const displayModel = await parity.getDisplayModel({ fresh: true });
  return {
    selfCheck,
    displayModel,
    plan: settingsFolderCleanupBuildReviewPlan(selfCheck, displayModel),
  };
}

function settingsFolderCleanupIsChromeSurface(){
  return hasChromeStorage() && !STUDIO_isTauri();
}

function settingsFolderCleanupChromeGetStrict(keys){
  if (!settingsFolderCleanupIsChromeSurface()) return Promise.reject(new Error("Chrome storage unavailable for folder cleanup."));
  return new Promise((resolve, reject) => {
    try {
      W.chrome.storage.local.get(keys, (result) => {
        const lastError = W.chrome?.runtime?.lastError;
        if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
        resolve(result || {});
      });
    } catch (err) {
      reject(err);
    }
  });
}

function settingsFolderCleanupChromeSetStrict(obj){
  if (!settingsFolderCleanupIsChromeSurface()) return Promise.reject(new Error("Chrome storage unavailable for folder cleanup."));
  return new Promise((resolve, reject) => {
    try {
      W.chrome.storage.local.set(obj || {}, () => {
        const lastError = W.chrome?.runtime?.lastError;
        if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
        resolve(true);
      });
    } catch (err) {
      reject(err);
    }
  });
}

function settingsFolderCleanupClone(value){
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function settingsFolderCleanupSelectedIds(panel){
  const boxes = Array.from(panel?.querySelectorAll?.("#wbSettingsFolderCleanupDeleteList input[data-folder-id]") || []);
  return boxes
    .filter((box) => !!box.checked)
    .map((box) => String(box.dataset.folderId || "").trim())
    .filter(Boolean);
}

function settingsFolderCleanupFolderStateSummary(stateObj){
  const src = stateObj && typeof stateObj === "object" ? stateObj : {};
  const folders = Array.isArray(src.folders) ? src.folders : [];
  const items = src.items && typeof src.items === "object" && !Array.isArray(src.items) ? src.items : {};
  const bindingCount = Object.values(items).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0);
  return {
    key: FOLDER_STATE_DATA_KEY,
    folderCount: folders.length,
    itemBucketCount: Object.keys(items).length,
    bindingCount,
  };
}

function settingsFolderMirrorStableStringify(value){
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(settingsFolderMirrorStableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${settingsFolderMirrorStableStringify(value[key])}`).join(",")}}`;
}

async function settingsFolderMirrorChecksum(value){
  const text = settingsFolderMirrorStableStringify(value);
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await W.crypto.subtle.digest("SHA-256", bytes);
    return "sha256:" + Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
}

function settingsFolderMirrorDecodeText(raw){
  if (typeof raw === "string") return raw;
  if (raw instanceof ArrayBuffer) return new TextDecoder("utf-8").decode(new Uint8Array(raw));
  if (ArrayBuffer.isView(raw)) return new TextDecoder("utf-8").decode(raw);
  if (Array.isArray(raw)) return new TextDecoder("utf-8").decode(new Uint8Array(raw));
  throw new Error("Unsupported file read result.");
}

async function settingsFolderMirrorReadTextFile(path){
  const invoke = STUDIO_getTauriInvoke();
  if (!invoke) throw new Error("Tauri file read unavailable.");
  try {
    return settingsFolderMirrorDecodeText(await invoke("plugin:fs|read_text_file", { path }));
  } catch (textErr) {
    try {
      return settingsFolderMirrorDecodeText(await invoke("plugin:fs|read_file", { path }));
    } catch (bytesErr) {
      throw new Error(String(textErr && (textErr.message || textErr)) + " / fallback read_file failed: " + String(bytesErr && (bytesErr.message || bytesErr)));
    }
  }
}

function settingsFolderMirrorFolderId(row){
  return String(row?.id || row?.folderId || "").trim();
}

function settingsFolderMirrorFolderName(row, fallback = ""){
  return String(row?.name || row?.title || fallback || "").trim();
}

function settingsFolderMirrorNormalizeState(raw, sourceKind){
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    sourceKind: String(sourceKind || "folder-state"),
    schemaVersion: Number(src.schemaVersion || src.version || 1) || 1,
    exportedFrom: String(src.exportedFrom || src.source || "").trim(),
    exportedAt: String(src.exportedAt || src.updatedAt || "").trim(),
    folders: Array.isArray(src.folders) ? src.folders.slice() : null,
    items: src.items && typeof src.items === "object" && !Array.isArray(src.items) ? src.items : null,
  };
}

function settingsFolderMirrorExtractState(payload){
  const raw = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  if (!raw) return { ok: false, error: "Folder-state JSON must be an object." };
  const csl = raw.chromeStorageLocal && typeof raw.chromeStorageLocal === "object" && !Array.isArray(raw.chromeStorageLocal)
    ? raw.chromeStorageLocal
    : null;
  if (csl && csl[FOLDER_STATE_DATA_KEY] && typeof csl[FOLDER_STATE_DATA_KEY] === "object") {
    return { ok: true, state: settingsFolderMirrorNormalizeState(csl[FOLDER_STATE_DATA_KEY], "chromeStorageLocal-wrapper") };
  }
  if (raw.folderState && typeof raw.folderState === "object" && !Array.isArray(raw.folderState)) {
    return { ok: true, state: settingsFolderMirrorNormalizeState(raw.folderState, "folderState-wrapper") };
  }
  if (raw.payload?.folderState && typeof raw.payload.folderState === "object" && !Array.isArray(raw.payload.folderState)) {
    return { ok: true, state: settingsFolderMirrorNormalizeState(raw.payload.folderState, "payload.folderState-wrapper") };
  }
  if (raw.value?.folderState && typeof raw.value.folderState === "object" && !Array.isArray(raw.value.folderState)) {
    return { ok: true, state: settingsFolderMirrorNormalizeState(raw.value.folderState, "value.folderState-wrapper") };
  }
  if (Array.isArray(raw.folders) || (raw.items && typeof raw.items === "object" && !Array.isArray(raw.items))) {
    return { ok: true, state: settingsFolderMirrorNormalizeState(raw, "raw-folder-state") };
  }
  return { ok: false, error: "Unrecognized folder-state shape." };
}

function settingsFolderMirrorSourceSummary(state){
  const folders = Array.isArray(state?.folders) ? state.folders : [];
  const items = state?.items && typeof state.items === "object" && !Array.isArray(state.items) ? state.items : {};
  return {
    sourceKind: state?.sourceKind || "",
    exportedAt: state?.exportedAt || "",
    exportedFrom: state?.exportedFrom || "",
    folderCount: folders.length,
    bindingCount: Object.values(items).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0),
    canonicalFolderCount: folders.filter((row) => FOLDER_DESKTOP_MIRROR_CANONICAL_ROWS.some((known) => known.folderId === settingsFolderMirrorFolderId(row))).length,
  };
}

function settingsFolderMirrorProjectCanonicalState(sourceState, opts = {}){
  const blockers = [];
  if (!Array.isArray(sourceState?.folders)) blockers.push("Source folders[] is missing or malformed.");
  if (!sourceState?.items || typeof sourceState.items !== "object" || Array.isArray(sourceState.items)) blockers.push("Source items object is missing or malformed.");
  if (blockers.length) return { ok: false, error: blockers.join(" "), blockers };
  const refreshedAt = String(opts?.refreshedAt || "").trim() || new Date().toISOString();

  const folders = sourceState.folders;
  const items = sourceState.items;
  const byId = new Map();
  folders.forEach((row) => {
    const id = settingsFolderMirrorFolderId(row);
    if (id && !byId.has(id)) byId.set(id, row);
  });
  const missing = FOLDER_DESKTOP_MIRROR_CANONICAL_ROWS.filter((known) => !byId.has(known.folderId));
  if (missing.length) blockers.push("Missing canonical folder row(s): " + missing.map((row) => row.name).join(", "));

  const projectedFolders = [];
  const projectedItems = {};
  FOLDER_DESKTOP_MIRROR_CANONICAL_ROWS.forEach((known, index) => {
    const row = byId.get(known.folderId);
    if (!row) return;
    const copy = settingsFolderCleanupClone(row) || {};
    copy.id = known.folderId;
    copy.name = settingsFolderMirrorFolderName(copy, known.name) || known.name;
    if (!Number.isFinite(Number(copy.sortOrder)) && !Number.isFinite(Number(copy.sort_order))) copy.sortOrder = index + 1;
    projectedFolders.push(copy);
    const bucket = items[known.folderId];
    if (bucket != null && !Array.isArray(bucket)) {
      blockers.push(`Items bucket for ${known.name} is not an array.`);
      projectedItems[known.folderId] = [];
      return;
    }
    projectedItems[known.folderId] = Array.from(new Set((Array.isArray(bucket) ? bucket : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)));
  });

  if (blockers.length) return { ok: false, error: blockers.join(" "), blockers };
  return {
    ok: true,
    ignoredFolderCount: Math.max(0, folders.length - projectedFolders.length),
    state: {
      schemaVersion: Number(sourceState.schemaVersion || 1) || 1,
      exportedFrom: sourceState.exportedFrom || sourceState.sourceKind || "desktop-folder-mirror-refresh",
      exportedAt: sourceState.exportedAt || refreshedAt,
      refreshedAt,
      folders: projectedFolders,
      items: projectedItems,
    },
  };
}

function settingsFolderMirrorSummary(stateObj){
  const src = stateObj && typeof stateObj === "object" ? stateObj : {};
  const folders = Array.isArray(src.folders) ? src.folders : [];
  const items = src.items && typeof src.items === "object" && !Array.isArray(src.items) ? src.items : {};
  const perFolder = FOLDER_DESKTOP_MIRROR_CANONICAL_ROWS.map((known) => ({
    folderId: known.folderId,
    name: known.name,
    membershipCount: Array.isArray(items[known.folderId]) ? items[known.folderId].length : 0,
  }));
  return {
    key: FOLDER_STATE_DATA_KEY,
    folderCount: folders.length,
    itemBucketCount: Object.keys(items).length,
    bindingCount: Object.values(items).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0),
    studyBucketCount: perFolder.find((row) => row.folderId === "f_7050f49d3f341819dba53d547")?.membershipCount || 0,
    exportedAt: src.exportedAt || "",
    refreshedAt: src.refreshedAt || "",
    perFolder,
  };
}

async function settingsFolderMirrorReadSourceFromPanel(panel){
  const pasted = String(panel?.querySelector?.("#wbSettingsFolderMirrorRefreshJson")?.value || "").trim();
  const path = String(panel?.querySelector?.("#wbSettingsFolderMirrorRefreshPath")?.value || "").trim();
  FOLDER_DESKTOP_MIRROR_REFRESH_STATE.pastedJson = pasted;
  FOLDER_DESKTOP_MIRROR_REFRESH_STATE.path = path;
  const text = pasted || (path ? await settingsFolderMirrorReadTextFile(path) : "");
  if (!text) throw new Error("Paste folder-state JSON or choose a source file.");
  let payload;
  try { payload = JSON.parse(text); }
  catch (err) { throw new Error("Folder-state JSON parse failed: " + String(err && (err.message || err))); }
  const extracted = settingsFolderMirrorExtractState(payload);
  if (!extracted.ok) throw new Error(extracted.error || "Folder-state extraction failed.");
  return {
    sourceKind: pasted ? "pasted-json:" + extracted.state.sourceKind : "file:" + extracted.state.sourceKind,
    sourcePath: pasted ? "" : path,
    sourceState: extracted.state,
  };
}

async function settingsFolderMirrorBuildPreview(panel, opts = {}){
  if (!STUDIO_isTauri()) return { ok: false, error: "Desktop folder mirror refresh is only available in Desktop Studio." };
  const generatedAt = String(opts?.generatedAt || opts?.refreshedAt || "").trim() || new Date().toISOString();
  const source = await settingsFolderMirrorReadSourceFromPanel(panel);
  const projection = settingsFolderMirrorProjectCanonicalState(source.sourceState, { refreshedAt: generatedAt });
  if (!projection.ok) return { ok: false, error: projection.error || "Canonical projection failed.", blockers: projection.blockers || [] };
  const values = await settingsFolderDesktopStorageGetStrict([FOLDER_STATE_DATA_KEY]);
  const beforeState = settingsFolderCleanupClone(values?.[FOLDER_STATE_DATA_KEY] || {});
  const afterState = projection.state;
  const beforeSummary = settingsFolderMirrorSummary(beforeState);
  const afterSummary = settingsFolderMirrorSummary(afterState);
  const beforeChecksum = await settingsFolderMirrorChecksum(beforeState || {});
  const afterChecksum = await settingsFolderMirrorChecksum(afterState);
  const preview = {
    readOnly: false,
    noMutationUntilRefresh: true,
    generatedAt,
    refreshTimestamp: generatedAt,
    surface: "desktop-studio",
    action: "refresh-desktop-folder-state-mirror",
    targetKey: FOLDER_STATE_DATA_KEY,
    sourceKind: source.sourceKind,
    sourcePath: source.sourcePath,
    sourceSummary: settingsFolderMirrorSourceSummary(source.sourceState),
    importedRows: afterSummary.perFolder.map((row) => ({ folderId: row.folderId, name: row.name })),
    ignoredSourceFolderCount: projection.ignoredFolderCount,
    beforeSummary,
    afterSummary,
    perFolderMembershipCounts: FOLDER_DESKTOP_MIRROR_CANONICAL_ROWS.map((known) => ({
      folderId: known.folderId,
      name: known.name,
      before: beforeSummary.perFolder.find((row) => row.folderId === known.folderId)?.membershipCount || 0,
      after: afterSummary.perFolder.find((row) => row.folderId === known.folderId)?.membershipCount || 0,
    })),
    beforeChecksum,
    afterChecksum,
    confirmationText: FOLDER_DESKTOP_MIRROR_REFRESH_CONFIRM_TEXT,
    warnings: [
      "Desktop SQLite folders and folder_bindings are not changed.",
      "Native ChatGPT folder-state is not modified.",
      "Chrome storage is not modified.",
      "Only the Desktop mirror key is refreshed.",
    ],
  };
  return { ok: true, preview, beforeState, afterState };
}

function settingsFolderMirrorSetPreview(panel, preview){
  panel.__h2oFolderMirrorRefreshPreview = preview || null;
  FOLDER_DESKTOP_MIRROR_REFRESH_STATE.preview = preview || null;
  const pre = panel?.querySelector?.("#wbSettingsFolderMirrorRefreshPreviewOut");
  if (pre) {
    pre.hidden = !preview;
    pre.textContent = preview ? JSON.stringify(preview, null, 2) : "";
  }
}

function settingsFolderMirrorSetStatus(panel, message){
  const text = String(message || "");
  FOLDER_DESKTOP_MIRROR_REFRESH_STATE.status = text;
  const status = panel?.querySelector?.("#wbSettingsFolderMirrorRefreshStatus");
  if (status) status.textContent = text;
}

function settingsFolderMirrorUpdateControls(panel){
  const sourceAvailable = !!String(panel?.querySelector?.("#wbSettingsFolderMirrorRefreshJson")?.value || panel?.querySelector?.("#wbSettingsFolderMirrorRefreshPath")?.value || "").trim();
  const confirmation = String(panel?.querySelector?.("#wbSettingsFolderMirrorRefreshConfirm")?.value || "");
  FOLDER_DESKTOP_MIRROR_REFRESH_STATE.confirmation = confirmation;
  const preview = panel?.__h2oFolderMirrorRefreshPreview || FOLDER_DESKTOP_MIRROR_REFRESH_STATE.preview;
  const previewBtn = panel?.querySelector?.("#wbSettingsFolderMirrorRefreshPreview");
  const copyBtn = panel?.querySelector?.("#wbSettingsFolderMirrorRefreshCopyPlan");
  const runBtn = panel?.querySelector?.("#wbSettingsFolderMirrorRefreshRun");
  if (previewBtn) previewBtn.disabled = !STUDIO_isTauri() || !sourceAvailable;
  if (copyBtn) copyBtn.disabled = !preview;
  if (runBtn) runBtn.disabled = !STUDIO_isTauri() || !preview || confirmation !== FOLDER_DESKTOP_MIRROR_REFRESH_CONFIRM_TEXT;
}

async function settingsFolderMirrorAppendAudit(entry){
  const auditId = String(entry?.auditId || `folder-mirror-refresh:${Date.now()}:${Math.random().toString(36).slice(2)}`);
  const nextEntry = { ...(entry || {}), auditId };
  const values = await settingsFolderDesktopStorageGetStrict([FOLDER_MIRROR_REFRESH_AUDIT_KEY]);
  const existing = Array.isArray(values?.[FOLDER_MIRROR_REFRESH_AUDIT_KEY]) ? values[FOLDER_MIRROR_REFRESH_AUDIT_KEY] : [];
  const next = existing.concat([nextEntry]).slice(-50);
  await settingsFolderDesktopStorageSetStrict({ [FOLDER_MIRROR_REFRESH_AUDIT_KEY]: next });
  const verifyValues = await settingsFolderDesktopStorageGetStrict([FOLDER_MIRROR_REFRESH_AUDIT_KEY]);
  const verify = Array.isArray(verifyValues?.[FOLDER_MIRROR_REFRESH_AUDIT_KEY]) ? verifyValues[FOLDER_MIRROR_REFRESH_AUDIT_KEY] : [];
  if (!verify.some((item) => item?.auditId === auditId)) {
    throw new Error("Desktop mirror refresh audit write verification failed.");
  }
  return { length: verify.length, auditId };
}

async function previewSettingsFolderMirrorRefresh(panel){
  let result;
  try {
    result = await settingsFolderMirrorBuildPreview(panel);
  } catch (err) {
    result = { ok: false, error: String(err && (err.stack || err.message || err)) };
  }
  if (!result.ok) {
    settingsFolderMirrorSetPreview(panel, null);
    settingsFolderParityLog(panel, "Desktop mirror refresh preview blocked.\n" + String(result.error || "Unknown guard failure"));
    settingsFolderMirrorUpdateControls(panel);
    return result;
  }
  settingsFolderMirrorSetPreview(panel, result.preview);
  const message = `Preview ready. Study ${result.preview.perFolderMembershipCounts.find((row) => row.name === "Study")?.before ?? 0} -> ${result.preview.perFolderMembershipCounts.find((row) => row.name === "Study")?.after ?? 0}. Desktop SQLite folders and folder_bindings are not changed.`;
  settingsFolderMirrorSetStatus(panel, message);
  settingsFolderMirrorUpdateControls(panel);
  return result;
}

async function copySettingsFolderMirrorRefreshPlan(panel){
  let preview = panel?.__h2oFolderMirrorRefreshPreview || FOLDER_DESKTOP_MIRROR_REFRESH_STATE.preview;
  if (!preview) {
    const result = await previewSettingsFolderMirrorRefresh(panel);
    preview = result?.preview || null;
  }
  if (!preview) return;
  const text = JSON.stringify(preview, null, 2);
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Desktop mirror refresh plan JSON copied to clipboard.");
      return;
    } catch (err) {
      console.info("H2O_DESKTOP_FOLDER_MIRROR_REFRESH_PLAN", preview);
      settingsFolderParityLog(panel, "Clipboard copy failed; Desktop mirror refresh plan printed to console.\n" + String(err && (err.message || err)));
      return;
    }
  }
  console.info("H2O_DESKTOP_FOLDER_MIRROR_REFRESH_PLAN", preview);
  settingsFolderParityLog(panel, "Clipboard unavailable; Desktop mirror refresh plan printed to console as H2O_DESKTOP_FOLDER_MIRROR_REFRESH_PLAN.");
}

async function refreshDesktopFolderMirror(panel){
  const confirmation = String(panel?.querySelector?.("#wbSettingsFolderMirrorRefreshConfirm")?.value || "");
  if (confirmation !== FOLDER_DESKTOP_MIRROR_REFRESH_CONFIRM_TEXT) {
    settingsFolderMirrorSetStatus(panel, "Desktop mirror refresh blocked. Confirmation text does not match.");
    settingsFolderParityLog(panel, "Desktop mirror refresh blocked. Confirmation text does not match.");
    return;
  }
  const existingPreview = panel?.__h2oFolderMirrorRefreshPreview || FOLDER_DESKTOP_MIRROR_REFRESH_STATE.preview;
  if (!existingPreview) {
    settingsFolderMirrorSetStatus(panel, "Desktop mirror refresh blocked. Generate a fresh refresh preview first.");
    settingsFolderParityLog(panel, "Desktop mirror refresh blocked. Generate a fresh refresh preview first.");
    return;
  }
  settingsFolderMirrorSetStatus(panel, "Refreshing Desktop folder mirror: revalidating preview...");
  let fresh;
  try {
    fresh = await settingsFolderMirrorBuildPreview(panel, {
      generatedAt: existingPreview.refreshTimestamp || existingPreview.generatedAt,
    });
  } catch (err) {
    settingsFolderMirrorSetStatus(panel, "Desktop mirror refresh aborted before mutation.");
    settingsFolderParityLog(panel, "Desktop mirror refresh aborted before mutation.\n" + String(err && (err.stack || err.message || err)));
    return;
  }
  if (!fresh.ok) {
    settingsFolderMirrorSetStatus(panel, "Desktop mirror refresh aborted before mutation.");
    settingsFolderParityLog(panel, "Desktop mirror refresh aborted before mutation.\n" + String(fresh.error || "Guard failed"));
    return;
  }
  if (fresh.preview.afterChecksum !== existingPreview.afterChecksum || fresh.preview.beforeChecksum !== existingPreview.beforeChecksum) {
    settingsFolderMirrorSetPreview(panel, fresh.preview);
    settingsFolderMirrorUpdateControls(panel);
    settingsFolderMirrorSetStatus(panel, "Desktop mirror refresh aborted. Source or Desktop mirror changed since preview; review the new preview before refreshing.");
    settingsFolderParityLog(panel, "Desktop mirror refresh aborted. Source or Desktop mirror changed since preview; review the new preview before refreshing.");
    return;
  }
  const pending = {
    timestamp: new Date().toISOString(),
    surface: "desktop-studio",
    action: "refresh-desktop-folder-state-mirror",
    targetKey: FOLDER_STATE_DATA_KEY,
    sourceKind: fresh.preview.sourceKind,
    beforeSummary: fresh.preview.beforeSummary,
    afterSummary: fresh.preview.afterSummary,
    beforeChecksum: fresh.preview.beforeChecksum,
    afterChecksum: fresh.preview.afterChecksum,
    beforeSnapshot: settingsFolderCleanupClone(fresh.beforeState),
    result: "pending",
    errors: [],
  };
  try {
    settingsFolderMirrorSetStatus(panel, "Refreshing Desktop folder mirror: writing pending audit...");
    await settingsFolderMirrorAppendAudit(pending);
  } catch (auditErr) {
    settingsFolderMirrorSetStatus(panel, "Desktop mirror refresh aborted before mutation. Mirror refresh audit could not be written.");
    settingsFolderParityLog(panel, "Desktop mirror refresh aborted before mutation. Mirror refresh audit could not be written.\n" + String(auditErr && (auditErr.stack || auditErr.message || auditErr)));
    return;
  }
  try {
    settingsFolderMirrorSetStatus(panel, "Refreshing Desktop folder mirror: writing mirror key...");
    await settingsFolderDesktopStorageSetStrict({ [FOLDER_STATE_DATA_KEY]: fresh.afterState });
    const afterValues = await settingsFolderDesktopStorageGetStrict([FOLDER_STATE_DATA_KEY]);
    const verifiedChecksum = await settingsFolderMirrorChecksum(afterValues?.[FOLDER_STATE_DATA_KEY] || {});
    if (verifiedChecksum !== fresh.preview.afterChecksum) {
      throw new Error(`Desktop mirror write verification failed. Expected ${fresh.preview.afterChecksum}; got ${verifiedChecksum}.`);
    }
    const afterSummary = settingsFolderMirrorSummary(afterValues?.[FOLDER_STATE_DATA_KEY] || {});
    settingsFolderMirrorSetStatus(panel, "Refreshing Desktop folder mirror: writing result audit...");
    await settingsFolderMirrorAppendAudit({
      timestamp: new Date().toISOString(),
      surface: "desktop-studio",
      action: "refresh-desktop-folder-state-mirror",
      targetKey: FOLDER_STATE_DATA_KEY,
      sourceKind: fresh.preview.sourceKind,
      beforeSummary: fresh.preview.beforeSummary,
      afterSummary,
      beforeChecksum: fresh.preview.beforeChecksum,
      afterChecksum: await settingsFolderMirrorChecksum(afterValues?.[FOLDER_STATE_DATA_KEY] || {}),
      result: "ok",
      errors: [],
    });
    try { W.H2O?.LibraryWorkspace?._bustCaches?.("desktop-folder-mirror-refresh"); } catch {}
    try { state.folderCatalog = []; state.folderLocalReview = []; await fetchFolderCatalog(true); renderFolderSidebar(state.rowsCache || [], state.lastView, state.lastFolderId); } catch {}
    settingsFolderMirrorSetPreview(panel, null);
    const message = `Desktop folder mirror refreshed. Study is now ${afterSummary.studyBucketCount}. Desktop SQLite folders and folder_bindings were not changed.`;
    settingsFolderMirrorSetStatus(panel, message);
    settingsFolderParityLog(panel, "Desktop folder mirror refreshed. Desktop SQLite folders, folder_bindings, native state, and Chrome storage were not modified.");
    await refreshSettingsFolderParity(panel);
    await refreshSettingsFolderDesktopReview(panel);
  } catch (err) {
    try {
      await settingsFolderMirrorAppendAudit({
        timestamp: new Date().toISOString(),
        surface: "desktop-studio",
        action: "refresh-desktop-folder-state-mirror",
        targetKey: FOLDER_STATE_DATA_KEY,
        sourceKind: fresh.preview.sourceKind,
        beforeSummary: fresh.preview.beforeSummary,
        afterSummary: fresh.preview.afterSummary,
        beforeChecksum: fresh.preview.beforeChecksum,
        afterChecksum: fresh.preview.afterChecksum,
        result: "failed",
        errors: [String(err && (err.stack || err.message || err))],
      });
    } catch (_) { /* best-effort result audit after pending entry */ }
    settingsFolderMirrorSetStatus(panel, "Desktop mirror refresh failed after pending audit.");
    settingsFolderParityLog(panel, "Desktop mirror refresh failed after pending audit.\n" + String(err && (err.stack || err.message || err)));
  }
}

async function settingsFolderCleanupReadChromeMirror(){
  if (!settingsFolderCleanupIsChromeSurface()) {
    throw new Error("Chrome mirror cleanup is only available in Studio Launcher / MV3.");
  }
  const values = await settingsFolderCleanupChromeGetStrict([FOLDER_STATE_DATA_KEY]);
  const raw = values && values[FOLDER_STATE_DATA_KEY];
  const stateObj = settingsFolderCleanupClone(raw);
  if (!stateObj || typeof stateObj !== "object" || Array.isArray(stateObj)) {
    throw new Error("Chrome folder mirror is missing or malformed.");
  }
  if (!Array.isArray(stateObj.folders)) {
    throw new Error("Chrome folder mirror has no folders[] array.");
  }
  if (!stateObj.items || typeof stateObj.items !== "object" || Array.isArray(stateObj.items)) {
    stateObj.items = {};
  }
  return {
    state: stateObj,
    folders: stateObj.folders,
    items: stateObj.items,
    summary: settingsFolderCleanupFolderStateSummary(stateObj),
  };
}

function settingsFolderCleanupValidateDeletionSelection(selectedIds, reviewPlan, mirror){
  const ids = Array.from(new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!settingsFolderCleanupIsChromeSurface()) {
    return { ok: false, error: "Chrome mirror cleanup is unavailable on this surface.", candidates: [], selectedFolderIds: ids };
  }
  if (!ids.length) return { ok: false, error: "Select at least one safe empty candidate.", candidates: [], selectedFolderIds: ids };
  const safeRows = Array.isArray(reviewPlan?.groups?.safeEmptyCandidates) ? reviewPlan.groups.safeEmptyCandidates : [];
  const safeById = new Map(safeRows.map((row) => [String(row.folderId || "").trim(), row]));
  const folders = Array.isArray(mirror?.folders) ? mirror.folders : [];
  const folderById = new Map(folders.map((folder) => [String(folder?.id || folder?.folderId || "").trim(), folder]));
  const items = mirror?.items && typeof mirror.items === "object" ? mirror.items : {};
  const candidates = [];
  for (const folderId of ids) {
    if (settingsFolderCleanupIsF5DReviewCandidate({ folderId })) {
      return { ok: false, error: `${folderId} is a Desktop/F5D review folder and is not eligible for Chrome mirror P7b deletion.`, candidates, selectedFolderIds: ids };
    }
    const candidate = safeById.get(folderId);
    if (!candidate) return { ok: false, error: `${folderId} is not in the current safe empty candidate group.`, candidates, selectedFolderIds: ids };
    if (settingsFolderCleanupIsF5DReviewCandidate(candidate)) {
      return { ok: false, error: `${folderId} is a Desktop/F5D review folder and is not eligible for Chrome mirror P7b deletion.`, candidates, selectedFolderIds: ids };
    }
    if (/^f_/.test(folderId)) return { ok: false, error: `${folderId} looks like a canonical native folder and cannot be deleted.`, candidates, selectedFolderIds: ids };
    if (folderId === "fld-case" || folderId === "fld-english") return { ok: false, error: `${folderId} is a same-name conflict and cannot be deleted in P7b.`, candidates, selectedFolderIds: ids };
    if (candidate.isCanonical) return { ok: false, error: `${folderId} is canonical and cannot be deleted.`, candidates, selectedFolderIds: ids };
    if (candidate.nativePresence) return { ok: false, error: `${folderId} is native-present and cannot be deleted.`, candidates, selectedFolderIds: ids };
    if (candidate.isConflict) return { ok: false, error: `${folderId} is a conflict and cannot be deleted in P7b.`, candidates, selectedFolderIds: ids };
    if (settingsFolderCleanupNumber(candidate.bindingCount) > 0
      || settingsFolderCleanupNumber(candidate.knownCount) > 0
      || settingsFolderCleanupNumber(candidate.localBindingCount) > 0) {
      return { ok: false, error: `${folderId} has bindings or known rows and cannot be deleted.`, candidates, selectedFolderIds: ids };
    }
    if (!folderById.has(folderId)) return { ok: false, error: `${folderId} is not present in the Chrome mirror folders[].`, candidates, selectedFolderIds: ids };
    const bucket = items[folderId];
    if (Array.isArray(bucket) && bucket.length > 0) {
      return { ok: false, error: `${folderId} has non-empty mirror items and cannot be deleted.`, candidates, selectedFolderIds: ids };
    }
    if (bucket != null && !Array.isArray(bucket)) {
      return { ok: false, error: `${folderId} has malformed mirror items and cannot be deleted safely.`, candidates, selectedFolderIds: ids };
    }
    candidates.push({
      folderId,
      name: candidate.name,
      normalizedName: candidate.normalizedName,
      badges: candidate.badges || [],
      nativePresence: !!candidate.nativePresence,
      bindingCount: settingsFolderCleanupNumber(candidate.bindingCount),
      knownCount: settingsFolderCleanupNumber(candidate.knownCount),
      localBindingCount: settingsFolderCleanupNumber(candidate.localBindingCount),
      riskLevel: candidate.riskLevel || "low-review-required",
      eligibilityReason: "Empty local extra/test folder in Chrome mirror; no native presence, conflict, bindings, known rows, or mirror items.",
    });
  }
  return { ok: true, candidates, selectedFolderIds: ids };
}

function settingsFolderCleanupBuildDeletionPreview(selectedIds, reviewPlan, mirror){
  const validation = settingsFolderCleanupValidateDeletionSelection(selectedIds, reviewPlan, mirror);
  if (!validation.ok) return { ok: false, error: validation.error, selectedFolderIds: validation.selectedFolderIds || [] };
  const beforeSummary = settingsFolderCleanupFolderStateSummary(mirror.state);
  return {
    ok: true,
    readOnly: false,
    noMutation: true,
    mutation: "preview-only",
    generatedAt: new Date().toISOString(),
    surface: "chrome-studio",
    action: "delete-empty-chrome-mirror-folders",
    key: FOLDER_STATE_DATA_KEY,
    selectedFolderIds: validation.selectedFolderIds,
    selectedFolders: validation.candidates,
    beforeFolderCount: beforeSummary.folderCount,
    predictedAfterFolderCount: beforeSummary.folderCount - validation.selectedFolderIds.length,
    beforeFolderStateSummary: beforeSummary,
    confirmationText: FOLDER_CLEANUP_CONFIRM_TEXT,
  };
}

async function settingsFolderCleanupAppendAudit(entry){
  const values = await settingsFolderCleanupChromeGetStrict([FOLDER_CLEANUP_AUDIT_KEY]);
  const existing = Array.isArray(values?.[FOLDER_CLEANUP_AUDIT_KEY]) ? values[FOLDER_CLEANUP_AUDIT_KEY] : [];
  const next = existing.concat([entry]).slice(-50);
  await settingsFolderCleanupChromeSetStrict({ [FOLDER_CLEANUP_AUDIT_KEY]: next });
  return next.length;
}

function settingsFolderCleanupBuildNextState(mirror, folderIds){
  const ids = new Set((Array.isArray(folderIds) ? folderIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  const before = settingsFolderCleanupClone(mirror.state);
  const next = {
    ...before,
    folders: (Array.isArray(before.folders) ? before.folders : []).filter((folder) => {
      const id = String(folder?.id || folder?.folderId || "").trim();
      return !ids.has(id);
    }),
    items: { ...(before.items && typeof before.items === "object" && !Array.isArray(before.items) ? before.items : {}) },
  };
  for (const id of ids) {
    const bucket = next.items[id];
    if (bucket == null || (Array.isArray(bucket) && bucket.length === 0)) delete next.items[id];
  }
  return next;
}

function settingsFolderCleanupChip(label, value){
  return `<span style="display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);border-radius:999px;padding:4px 8px"><strong>${esc(label)}</strong><span>${esc(value)}</span></span>`;
}

function settingsFolderCleanupBadgesHtml(candidate){
  const badges = Array.isArray(candidate?.badges) ? candidate.badges : [];
  const withClass = [candidate?.classification, ...badges].filter(Boolean);
  if (!withClass.length) return "";
  return withClass.map((badge) => `<span style="display:inline-flex;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);border-radius:999px;padding:2px 6px;font-size:11px">${esc(badge)}</span>`).join(" ");
}

function settingsFolderCleanupCandidateHtml(candidate){
  const warnings = Array.isArray(candidate?.warnings) ? candidate.warnings : [];
  return `
    <div style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <strong>${esc(candidate?.name || "(unnamed)")}</strong>
        <span>${settingsFolderCleanupBadgesHtml(candidate)}</span>
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.72">${esc(candidate?.folderId || "(no folder id)")}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:4px 12px;font-size:12px">
        <span>native ${esc(candidate?.canonicalCount ?? 0)}</span>
        <span>known ${esc(candidate?.knownCount ?? 0)}</span>
        <span>local bindings ${esc(candidate?.localBindingCount ?? candidate?.bindingCount ?? 0)}</span>
        <span>orphan ${esc(candidate?.orphanCount ?? 0)}</span>
      </div>
      <div style="font-size:12px"><strong>Review:</strong> ${esc(candidate?.proposedAction || "Review only.")}</div>
      <div style="font-size:12px"><strong>Risk:</strong> ${esc(candidate?.riskLevel || "review")}</div>
      ${warnings.length ? `<div style="font-size:12px;opacity:.78"><strong>Why:</strong> ${esc(warnings.join(" "))}</div>` : ""}
    </div>
  `;
}

function settingsFolderCleanupGroupHtml(title, candidates, emptyText){
  const rows = Array.isArray(candidates) ? candidates : [];
  return `
    <details open style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:rgba(255,255,255,.025)">
      <summary style="cursor:pointer;font-weight:600">${esc(title)} <span style="opacity:.65">(${rows.length})</span></summary>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
        ${rows.length ? rows.map(settingsFolderCleanupCandidateHtml).join("") : `<div style="opacity:.65;font-size:12px">${esc(emptyText || "No candidates.")}</div>`}
      </div>
    </details>
  `;
}

function settingsFolderCleanupRenderPlan(panel, plan){
  const summary = panel?.querySelector("#wbSettingsFolderCleanupReviewSummary");
  const chips = panel?.querySelector("#wbSettingsFolderCleanupReviewChips");
  const groups = panel?.querySelector("#wbSettingsFolderCleanupReviewGroups");
  const copyBtn = panel?.querySelector("#wbSettingsFolderCleanupReviewCopy");
  if (summary) {
    summary.textContent = `Review-only cleanup plan generated. Severity: ${plan?.selfCheckSeverity || "unknown"}. No cleanup performed.`;
  }
  if (chips) {
    chips.innerHTML = [
      settingsFolderCleanupChip("safe empty", plan?.counts?.safeEmpty || 0),
      settingsFolderCleanupChip("conflicts", plan?.counts?.conflicts || 0),
      settingsFolderCleanupChip("bound review", plan?.counts?.boundReview || 0),
      settingsFolderCleanupChip("orphan memberships", plan?.counts?.orphanMemberships || 0),
    ].join("");
  }
  if (groups) {
    groups.innerHTML = [
      settingsFolderCleanupGroupHtml("Safe empty candidates", plan?.groups?.safeEmptyCandidates, "No empty extra/test candidates are currently safe for a future reviewed cleanup."),
      settingsFolderCleanupGroupHtml("Same-name conflicts", plan?.groups?.sameNameConflicts, "No same-name conflicts detected."),
      settingsFolderCleanupGroupHtml("Bound review candidates", plan?.groups?.boundReviewCandidates, "No bound extra/test candidates detected."),
      settingsFolderCleanupGroupHtml("Orphan memberships", plan?.groups?.orphanMemberships, "No orphan native memberships detected."),
    ].join("");
  }
  if (copyBtn) copyBtn.disabled = false;
  settingsFolderCleanupRenderDeletePanel(panel, plan);
}

function settingsFolderCleanupRenderDeletePanel(panel, plan){
  const summary = panel?.querySelector("#wbSettingsFolderCleanupDeleteSummary");
  const list = panel?.querySelector("#wbSettingsFolderCleanupDeleteList");
  const previewEl = panel?.querySelector("#wbSettingsFolderCleanupDeletePreview");
  const copyBtn = panel?.querySelector("#wbSettingsFolderCleanupCopyDeletePlan");
  const candidates = Array.isArray(plan?.groups?.safeEmptyCandidates) ? plan.groups.safeEmptyCandidates : [];
  const chromeSurface = settingsFolderCleanupIsChromeSurface();
  const previousSelected = new Set(Array.isArray(panel?.__h2oFolderCleanupDeleteSelectedIds) ? panel.__h2oFolderCleanupDeleteSelectedIds : []);

  panel.__h2oFolderCleanupDeletionPreview = null;
  if (previewEl) {
    previewEl.hidden = true;
    previewEl.textContent = "";
  }
  if (copyBtn) copyBtn.disabled = true;
  if (summary) {
    summary.textContent = chromeSurface
      ? "Chrome mirror only. Native folders and Desktop SQLite are not modified. F5D/Desktop test folders are review-only in this phase."
      : "Chrome mirror cleanup is only available in Studio Launcher. Desktop cleanup is separate and not performed.";
  }
  if (list) {
    if (!chromeSurface) {
      list.innerHTML = `<div style="opacity:.72;font-size:12px">Unavailable on this surface. No SQLite writes are performed.</div>`;
    } else if (!candidates.length) {
      list.innerHTML = `<div style="opacity:.72;font-size:12px">No currently eligible safe empty Chrome mirror candidates.</div>`;
    } else {
      list.innerHTML = candidates.map((candidate) => {
        const id = String(candidate.folderId || "").trim();
        const checked = previousSelected.has(id) ? " checked" : "";
        return `
          <label style="display:grid;grid-template-columns:max-content 1fr;gap:8px;align-items:start;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:rgba(255,255,255,.025)">
            <input type="checkbox" data-folder-id="${esc(id)}"${checked} />
            <span style="display:flex;flex-direction:column;gap:3px">
              <strong>${esc(candidate.name || id)}</strong>
              <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.72">${esc(id)}</span>
              <span style="font-size:12px;opacity:.76">${esc(candidate.knownCount || 0)} known · ${esc(candidate.localBindingCount || 0)} local bindings · Chrome mirror only</span>
            </span>
          </label>
        `;
      }).join("");
    }
  }
  settingsFolderCleanupUpdateDeleteControls(panel);
}

function settingsFolderConflictNormalizeName(row){
  const src = row && typeof row === "object" ? row : {};
  return String(src.normalizedName || src.name || "").trim().toLowerCase();
}

function settingsFolderConflictBucketSummary(mirror, folderId){
  const id = String(folderId || "").trim();
  const items = mirror?.items && typeof mirror.items === "object" ? mirror.items : null;
  if (!items || !id) return { state: "unavailable", count: 0, bindings: [] };
  if (!Object.prototype.hasOwnProperty.call(items, id)) return { state: "missing", count: 0, bindings: [] };
  const bucket = items[id];
  if (Array.isArray(bucket)) {
    return {
      state: "array",
      count: bucket.length,
      bindings: settingsFolderCleanupClone(bucket) || [],
    };
  }
  return { state: "malformed", count: 0, bindings: [] };
}

function settingsFolderConflictFolderFromRow(row, role, mirror){
  const src = row && typeof row === "object" ? row : {};
  const folderId = String(src.folderId || src.id || "").trim();
  const bucket = settingsFolderConflictBucketSummary(mirror, folderId);
  const badges = Array.isArray(src.badges) ? src.badges.slice() : [];
  if (role === "canonical" && !badges.includes("canonical")) badges.push("canonical");
  if (role === "duplicate") {
    if (!badges.includes("extra")) badges.push("extra");
    if (!badges.includes("conflict")) badges.push("conflict");
    if (!badges.includes("review")) badges.push("review");
  }
  return {
    folderId,
    name: String(src.name || folderId || "Folder").trim(),
    canonicalCount: settingsFolderCleanupNumber(src.canonicalCount),
    knownCount: settingsFolderCleanupNumber(src.knownCount),
    localBindingCount: Math.max(settingsFolderCleanupRowBindingCount(src), bucket.count),
    nativePresence: !!src.isCanonical,
    bindings: bucket.bindings,
    bucketState: bucket.state,
    bucketCount: bucket.count,
    isExtra: !!src.isExtra,
    isConflict: !!src.isConflict,
    isTestCandidate: !!src.isTestCandidate,
    badges,
    riskLevel: role === "canonical" ? "protected" : "high-review-required",
    proposedAction: role === "canonical"
      ? "Preserve canonical folder."
      : "Review-only. Keep both until bindings and intent are confirmed.",
    warnings: role === "canonical"
      ? ["Canonical native folder. Not a conflict cleanup target."]
      : ["Same-name/different-ID conflict.", "No merge/delete/move performed."],
  };
}

function settingsFolderConflictBuildPlan(selfCheck, displayModel, mirror = null, mirrorWarning = ""){
  const rows = Array.isArray(displayModel?.rows) ? displayModel.rows : [];
  const surface = String(selfCheck?.surface || displayModel?.surface || "");
  const groups = new Map();
  for (const row of rows) {
    const normalizedName = settingsFolderConflictNormalizeName(row);
    if (!normalizedName) continue;
    if (!groups.has(normalizedName)) groups.set(normalizedName, []);
    groups.get(normalizedName).push(row);
  }

  const conflicts = [];
  for (const [normalizedName, groupRows] of groups.entries()) {
    const canonicalRows = groupRows.filter((row) => !!row?.isCanonical);
    const duplicateRows = groupRows.filter((row) => !row?.isCanonical && (!!row?.isConflict || canonicalRows.length > 0));
    if (!canonicalRows.length || !duplicateRows.length) continue;
    const canonicalRow = canonicalRows[0];
    conflicts.push({
      normalizedName,
      canonicalFolder: settingsFolderConflictFolderFromRow(canonicalRow, "canonical", mirror),
      duplicateFolders: duplicateRows.map((row) => settingsFolderConflictFolderFromRow(row, "duplicate", mirror)),
      proposedResolution: "keep-both-until-reviewed",
      allowedActions: ["keep-both", "copy-conflict-plan"],
      blockedActions: [
        "delete-duplicate",
        "merge-duplicate-into-canonical",
        "move-bindings-to-canonical",
        "merge-metadata-to-canonical",
      ],
      requiresApproval: true,
    });
  }

  conflicts.sort((a, b) => String(a.normalizedName).localeCompare(String(b.normalizedName)));
  return {
    readOnly: true,
    noMutation: true,
    generatedAt: new Date().toISOString(),
    surface,
    conflictCount: conflicts.length,
    mirrorAvailable: !!mirror,
    mirrorWarning: String(mirrorWarning || ""),
    conflicts,
    safetyRules: [
      "P7c-a is review-only.",
      "No merge/delete/move is performed.",
      "No Chrome storage, SQLite, or native folder-state writes are performed.",
      "Canonical f_* folders are protected.",
      "Same-name conflicts require explicit future approval before any action.",
    ],
    futurePhases: [
      "P7c-b may later remove an empty duplicate only after explicit confirmation and audit.",
      "P7c-c may later reassign bindings only after exact binding review and audit.",
      "P7d handles Desktop cleanup separately.",
    ],
  };
}

function settingsFolderConflictFolderHtml(folder, label){
  const bindings = Array.isArray(folder?.bindings) ? folder.bindings : [];
  const bindingSample = bindings.length
    ? `<div style="font-size:12px;opacity:.72"><strong>Binding sample:</strong> ${esc(bindings.slice(0, 3).map((item) => typeof item === "string" ? item : JSON.stringify(item)).join(", "))}${bindings.length > 3 ? "…" : ""}</div>`
    : "";
  return `
    <div style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <strong>${esc(label)}: ${esc(folder?.name || "(unnamed)")}</strong>
        <span>${settingsFolderCleanupBadgesHtml(folder)}</span>
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.72">${esc(folder?.folderId || "(no folder id)")}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:4px 12px;font-size:12px">
        <span>native ${esc(folder?.canonicalCount ?? 0)}</span>
        <span>known ${esc(folder?.knownCount ?? 0)}</span>
        <span>local bindings ${esc(folder?.localBindingCount ?? 0)}</span>
        <span>bucket ${esc(folder?.bucketState || "unavailable")} (${esc(folder?.bucketCount ?? 0)})</span>
      </div>
      <div style="font-size:12px"><strong>Review:</strong> ${esc(folder?.proposedAction || "Review only.")}</div>
      <div style="font-size:12px"><strong>Risk:</strong> ${esc(folder?.riskLevel || "review")}</div>
      ${Array.isArray(folder?.warnings) && folder.warnings.length ? `<div style="font-size:12px;opacity:.78"><strong>Why:</strong> ${esc(folder.warnings.join(" "))}</div>` : ""}
      ${bindingSample}
    </div>
  `;
}

function settingsFolderConflictHtml(conflict){
  const duplicateRows = Array.isArray(conflict?.duplicateFolders) ? conflict.duplicateFolders : [];
  return `
    <details open style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:rgba(255,255,255,.025)">
      <summary style="cursor:pointer;font-weight:600">${esc(conflict?.normalizedName || "folder")} <span style="opacity:.65">(${duplicateRows.length} duplicate${duplicateRows.length === 1 ? "" : "s"})</span></summary>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
        <div style="font-size:12px;opacity:.76">Recommendation: Review-only. Keep both until bindings and intent are confirmed. No merge/delete/move performed.</div>
        ${settingsFolderConflictFolderHtml(conflict?.canonicalFolder, "Canonical")}
        ${duplicateRows.map((folder) => settingsFolderConflictFolderHtml(folder, "Duplicate")).join("")}
      </div>
    </details>
  `;
}

function settingsFolderConflictRenderPlan(panel, plan){
  const summary = panel?.querySelector("#wbSettingsFolderConflictSummary");
  const groups = panel?.querySelector("#wbSettingsFolderConflictGroups");
  const copyBtn = panel?.querySelector("#wbSettingsFolderConflictCopy");
  const conflicts = Array.isArray(plan?.conflicts) ? plan.conflicts : [];
  if (summary) {
    const mirrorText = plan?.mirrorWarning ? ` Mirror buckets unavailable: ${plan.mirrorWarning}` : "";
    summary.textContent = `${conflicts.length} same-name conflict group${conflicts.length === 1 ? "" : "s"}. Review-only. No merge or deletion performed.${mirrorText}`;
  }
  if (groups) {
    groups.innerHTML = conflicts.length
      ? conflicts.map(settingsFolderConflictHtml).join("")
      : `<div style="opacity:.72;font-size:12px">No same-name folder conflicts detected.</div>`;
  }
  if (copyBtn) copyBtn.disabled = false;
  settingsFolderConflictRenderDeletePanel(panel, plan);
}

async function settingsFolderConflictLoadInputs(seed = null){
  const parity = W.H2O?.Library?.FolderParity;
  if (!parity || typeof parity.selfCheck !== "function" || typeof parity.getDisplayModel !== "function") {
    throw new Error("FolderParity conflict review APIs unavailable");
  }
  const selfCheck = seed?.selfCheck || await parity.selfCheck({ fresh: true });
  const displayModel = seed?.displayModel || await parity.getDisplayModel({ fresh: true });
  let mirror = null;
  let mirrorWarning = "";
  if (settingsFolderCleanupIsChromeSurface()) {
    try { mirror = await settingsFolderCleanupReadChromeMirror(); }
    catch (err) { mirrorWarning = String(err && (err.message || err)); }
  }
  return {
    selfCheck,
    displayModel,
    mirror,
    plan: settingsFolderConflictBuildPlan(selfCheck, displayModel, mirror, mirrorWarning),
  };
}

async function refreshSettingsFolderConflictReview(panel, seed = null){
  if (!panel) return null;
  const summary = panel.querySelector("#wbSettingsFolderConflictSummary");
  const copyBtn = panel.querySelector("#wbSettingsFolderConflictCopy");
  if (summary) summary.textContent = "Refreshing same-name conflict review…";
  if (copyBtn) copyBtn.disabled = true;
  const loaded = await settingsFolderConflictLoadInputs(seed);
  panel.__h2oFolderConflictReviewPlan = loaded.plan;
  settingsFolderConflictRenderPlan(panel, loaded.plan);
  return loaded.plan;
}

async function copySettingsFolderConflictPlan(panel){
  if (!panel) return;
  let plan = panel.__h2oFolderConflictReviewPlan;
  if (!plan) plan = await refreshSettingsFolderConflictReview(panel);
  const text = JSON.stringify(plan || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Folder conflict review plan JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; conflict review plan printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_FOLDER_CONFLICT_REVIEW_PLAN", plan); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; folder conflict review plan printed to console as H2O_FOLDER_CONFLICT_REVIEW_PLAN.");
}

function settingsFolderConflictDeletionRows(plan){
  const conflicts = Array.isArray(plan?.conflicts) ? plan.conflicts : [];
  const rows = [];
  for (const conflict of conflicts) {
    const canonical = conflict?.canonicalFolder || null;
    const duplicates = Array.isArray(conflict?.duplicateFolders) ? conflict.duplicateFolders : [];
    for (const duplicate of duplicates) {
      rows.push({
        ...duplicate,
        normalizedName: String(conflict?.normalizedName || duplicate?.normalizedName || duplicate?.name || "").trim().toLowerCase(),
        canonicalFolderId: String(canonical?.folderId || "").trim(),
        canonicalFolderName: String(canonical?.name || "").trim(),
        canonicalFolder: canonical,
      });
    }
  }
  return rows;
}

function settingsFolderConflictDeletionBlockers(row, mirror = null){
  const candidate = row && typeof row === "object" ? row : {};
  const folderId = String(candidate.folderId || "").trim();
  const blockers = [];
  if (!folderId) blockers.push("missing duplicate folder ID");
  if (!candidate.canonicalFolderId) blockers.push("missing canonical counterpart");
  if (candidate.isCanonical) blockers.push("duplicate marked canonical");
  if (/^f_/.test(folderId)) blockers.push("duplicate has canonical native ID prefix");
  if (candidate.nativePresence) blockers.push("duplicate native-present");
  if (settingsFolderCleanupIsF5DReviewCandidate(candidate)) blockers.push("F5D/Desktop review item");
  if (settingsFolderCleanupNumber(candidate.knownCount) > 0) blockers.push("known rows present");
  if (settingsFolderCleanupNumber(candidate.localBindingCount) > 0) blockers.push("local bindings present");
  if (!mirror) blockers.push("Chrome mirror unavailable");
  if (mirror) {
    const folders = Array.isArray(mirror.folders) ? mirror.folders : [];
    const folderExists = folders.some((folder) => String(folder?.id || folder?.folderId || "").trim() === folderId);
    if (!folderExists) blockers.push("duplicate not present in Chrome mirror folders[]");
    const items = mirror.items && typeof mirror.items === "object" ? mirror.items : {};
    const bucket = items[folderId];
    if (Array.isArray(bucket) && bucket.length > 0) blockers.push("items bucket non-empty");
    if (bucket != null && !Array.isArray(bucket)) blockers.push("items bucket malformed");
  }
  return blockers;
}

function settingsFolderConflictEligibleDeletionRows(plan, mirror = null){
  return settingsFolderConflictDeletionRows(plan)
    .map((row) => ({
      ...row,
      deletionBlockers: settingsFolderConflictDeletionBlockers(row, mirror),
    }))
    .filter((row) => row.deletionBlockers.length === 0);
}

function settingsFolderConflictLooksEmptyDuplicate(row){
  const candidate = row && typeof row === "object" ? row : {};
  const folderId = String(candidate.folderId || "").trim();
  if (!folderId || !candidate.canonicalFolderId) return false;
  if (candidate.isCanonical || /^f_/.test(folderId) || candidate.nativePresence) return false;
  if (settingsFolderCleanupIsF5DReviewCandidate(candidate)) return false;
  if (settingsFolderCleanupNumber(candidate.knownCount) > 0) return false;
  if (settingsFolderCleanupNumber(candidate.localBindingCount) > 0) return false;
  return candidate.bucketState === "missing"
    || (candidate.bucketState === "array" && settingsFolderCleanupNumber(candidate.bucketCount) === 0);
}

function settingsFolderConflictSelectedIds(panel){
  const boxes = Array.from(panel?.querySelectorAll?.("#wbSettingsFolderConflictDeleteList input[data-folder-id]") || []);
  return boxes
    .filter((box) => !!box.checked)
    .map((box) => String(box.dataset.folderId || "").trim())
    .filter(Boolean);
}

function settingsFolderConflictRenderDeletePanel(panel, plan){
  const summary = panel?.querySelector("#wbSettingsFolderConflictDeleteSummary");
  const list = panel?.querySelector("#wbSettingsFolderConflictDeleteList");
  const previewEl = panel?.querySelector("#wbSettingsFolderConflictDeletePreview");
  const copyBtn = panel?.querySelector("#wbSettingsFolderConflictCopyDeletePlan");
  const chromeSurface = settingsFolderCleanupIsChromeSurface();
  const mirrorUnavailable = !!plan?.mirrorWarning || !plan?.mirrorAvailable;
  const candidates = chromeSurface && !mirrorUnavailable
    ? settingsFolderConflictDeletionRows(plan).filter(settingsFolderConflictLooksEmptyDuplicate)
    : [];
  const previousSelected = new Set(Array.isArray(panel?.__h2oFolderConflictDeleteSelectedIds) ? panel.__h2oFolderConflictDeleteSelectedIds : []);

  panel.__h2oFolderConflictDeletionPreview = null;
  if (previewEl) {
    previewEl.hidden = true;
    previewEl.textContent = "";
  }
  if (copyBtn) copyBtn.disabled = true;
  if (summary) {
    summary.textContent = chromeSurface
      ? "Chrome mirror only. Canonical folders, Desktop SQLite, and native folder-state are not modified."
      : "Duplicate conflict cleanup is only available in Studio Launcher. Desktop cleanup is separate and not performed.";
  }
  if (list) {
    if (!chromeSurface) {
      list.innerHTML = `<div style="opacity:.72;font-size:12px">Unavailable on this surface. No SQLite writes are performed.</div>`;
    } else if (mirrorUnavailable) {
      list.innerHTML = `<div style="opacity:.72;font-size:12px">Chrome mirror buckets are unavailable, so duplicate deletion is disabled.</div>`;
    } else if (!candidates.length) {
      list.innerHTML = `<div style="opacity:.72;font-size:12px">No empty duplicate conflict folders are currently eligible for deletion.</div>`;
    } else {
      list.innerHTML = candidates.map((candidate) => {
        const id = String(candidate.folderId || "").trim();
        const checked = previousSelected.has(id) ? " checked" : "";
        return `
          <label style="display:grid;grid-template-columns:max-content 1fr;gap:8px;align-items:start;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:rgba(255,255,255,.025)">
            <input type="checkbox" data-folder-id="${esc(id)}"${checked} />
            <span style="display:flex;flex-direction:column;gap:3px">
              <strong>${esc(candidate.name || id)}</strong>
              <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.72">${esc(id)}</span>
              <span style="font-size:12px;opacity:.76">Canonical counterpart ${esc(candidate.canonicalFolderId || "missing")} · ${esc(candidate.knownCount || 0)} known · ${esc(candidate.localBindingCount || 0)} local bindings</span>
            </span>
          </label>
        `;
      }).join("");
    }
  }
  settingsFolderConflictUpdateDeleteControls(panel);
}

function settingsFolderConflictValidateDeletionSelection(selectedIds, plan, mirror){
  const ids = Array.from(new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!settingsFolderCleanupIsChromeSurface()) {
    return { ok: false, error: "Duplicate conflict cleanup is unavailable on this surface.", candidates: [], selectedDuplicateFolderIds: ids };
  }
  if (!ids.length) return { ok: false, error: "Select at least one empty duplicate conflict folder.", candidates: [], selectedDuplicateFolderIds: ids };
  const duplicateRows = settingsFolderConflictDeletionRows(plan);
  const byId = new Map(duplicateRows.map((row) => [String(row.folderId || "").trim(), row]));
  const candidates = [];
  for (const folderId of ids) {
    const candidate = byId.get(folderId);
    if (!candidate) return { ok: false, error: `${folderId} is not in the current same-name conflict model.`, candidates, selectedDuplicateFolderIds: ids };
    const blockers = settingsFolderConflictDeletionBlockers(candidate, mirror);
    if (blockers.length) {
      return { ok: false, error: `${folderId} is not eligible: ${blockers.join(", ")}.`, candidates, selectedDuplicateFolderIds: ids };
    }
    candidates.push({
      folderId,
      name: candidate.name,
      normalizedName: candidate.normalizedName,
      canonicalFolderId: candidate.canonicalFolderId,
      canonicalFolderName: candidate.canonicalFolderName,
      bucketState: candidate.bucketState,
      bucketCount: settingsFolderCleanupNumber(candidate.bucketCount),
      knownCount: settingsFolderCleanupNumber(candidate.knownCount),
      localBindingCount: settingsFolderCleanupNumber(candidate.localBindingCount),
      nativePresence: !!candidate.nativePresence,
      riskLevel: candidate.riskLevel || "high-review-required",
      eligibilityReason: "Empty non-canonical same-name duplicate in Chrome mirror; canonical counterpart exists and no native presence, known rows, local bindings, F5D marker, or mirror items were found.",
    });
  }
  return { ok: true, candidates, selectedDuplicateFolderIds: ids };
}

function settingsFolderConflictBuildDeletionPreview(selectedIds, plan, mirror){
  const validation = settingsFolderConflictValidateDeletionSelection(selectedIds, plan, mirror);
  if (!validation.ok) return { ok: false, error: validation.error, selectedDuplicateFolderIds: validation.selectedDuplicateFolderIds || [] };
  const beforeSummary = settingsFolderCleanupFolderStateSummary(mirror.state);
  return {
    ok: true,
    readOnly: false,
    noMutation: true,
    mutation: "preview-only",
    generatedAt: new Date().toISOString(),
    surface: "chrome-studio",
    action: "delete-empty-duplicate-conflict-folders",
    key: FOLDER_STATE_DATA_KEY,
    selectedDuplicateFolderIds: validation.selectedDuplicateFolderIds,
    canonicalCounterpartIds: Array.from(new Set(validation.candidates.map((row) => row.canonicalFolderId).filter(Boolean))),
    selectedDuplicates: validation.candidates,
    beforeFolderCount: beforeSummary.folderCount,
    predictedAfterFolderCount: beforeSummary.folderCount - validation.selectedDuplicateFolderIds.length,
    beforeFolderStateSummary: beforeSummary,
    confirmationText: FOLDER_DUPLICATE_CLEANUP_CONFIRM_TEXT,
  };
}

function settingsFolderConflictUpdateDeleteControls(panel){
  const chromeSurface = settingsFolderCleanupIsChromeSurface();
  const selectedIds = settingsFolderConflictSelectedIds(panel);
  panel.__h2oFolderConflictDeleteSelectedIds = selectedIds;
  const preview = panel?.__h2oFolderConflictDeletionPreview;
  const previewBtn = panel?.querySelector("#wbSettingsFolderConflictPreviewDelete");
  const copyBtn = panel?.querySelector("#wbSettingsFolderConflictCopyDeletePlan");
  const confirmInput = panel?.querySelector("#wbSettingsFolderConflictDeleteConfirm");
  const deleteBtn = panel?.querySelector("#wbSettingsFolderConflictDeleteSelected");
  const confirmationOk = String(confirmInput?.value || "") === FOLDER_DUPLICATE_CLEANUP_CONFIRM_TEXT;
  const selectedMatchesPreview = !!preview?.ok
    && JSON.stringify((preview.selectedDuplicateFolderIds || []).slice().sort()) === JSON.stringify(selectedIds.slice().sort());
  if (previewBtn) previewBtn.disabled = !chromeSurface || selectedIds.length === 0;
  if (copyBtn) copyBtn.disabled = !preview?.ok;
  if (deleteBtn) deleteBtn.disabled = !chromeSurface || !selectedMatchesPreview || !confirmationOk;
}

async function previewSettingsFolderConflictDeletion(panel){
  if (!panel) return null;
  const previewEl = panel.querySelector("#wbSettingsFolderConflictDeletePreview");
  const selectedIds = settingsFolderConflictSelectedIds(panel);
  const loaded = await settingsFolderConflictLoadInputs();
  if (!loaded.mirror) throw new Error(loaded.plan?.mirrorWarning || "Chrome mirror unavailable.");
  const preview = settingsFolderConflictBuildDeletionPreview(selectedIds, loaded.plan, loaded.mirror);
  panel.__h2oFolderConflictReviewPlan = loaded.plan;
  panel.__h2oFolderConflictDeletionPreview = preview.ok ? preview : null;
  if (previewEl) {
    previewEl.hidden = false;
    previewEl.textContent = JSON.stringify(preview, null, 2);
  }
  if (!preview.ok) settingsFolderParityLog(panel, "Folder conflict deletion preview blocked.\n" + String(preview.error || "Unknown guard failure"));
  settingsFolderConflictUpdateDeleteControls(panel);
  return preview;
}

async function copySettingsFolderConflictDeletionPlan(panel){
  if (!panel) return;
  let preview = panel.__h2oFolderConflictDeletionPreview;
  if (!preview) preview = await previewSettingsFolderConflictDeletion(panel);
  const text = JSON.stringify(preview || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Folder conflict deletion plan JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; conflict deletion plan printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_FOLDER_CONFLICT_DELETE_PLAN", preview); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; folder conflict deletion plan printed to console as H2O_FOLDER_CONFLICT_DELETE_PLAN.");
}

async function deleteSelectedEmptyDuplicateConflictFolders(panel){
  if (!panel) return;
  const previewEl = panel.querySelector("#wbSettingsFolderConflictDeletePreview");
  const confirmValue = String(panel.querySelector("#wbSettingsFolderConflictDeleteConfirm")?.value || "");
  if (confirmValue !== FOLDER_DUPLICATE_CLEANUP_CONFIRM_TEXT) {
    settingsFolderParityLog(panel, "Duplicate deletion blocked. Confirmation text does not match.");
    settingsFolderConflictUpdateDeleteControls(panel);
    return;
  }
  const selectedIds = settingsFolderConflictSelectedIds(panel);
  const existingPreview = panel.__h2oFolderConflictDeletionPreview;
  const previewMatchesSelection = !!existingPreview?.ok
    && JSON.stringify((existingPreview.selectedDuplicateFolderIds || []).slice().sort()) === JSON.stringify(selectedIds.slice().sort());
  if (!previewMatchesSelection) {
    settingsFolderParityLog(panel, "Duplicate deletion blocked. Generate a fresh deletion preview for the selected folders first.");
    settingsFolderConflictUpdateDeleteControls(panel);
    return;
  }

  const loaded = await settingsFolderConflictLoadInputs();
  if (!loaded.mirror) throw new Error(loaded.plan?.mirrorWarning || "Chrome mirror unavailable.");
  const validation = settingsFolderConflictValidateDeletionSelection(selectedIds, loaded.plan, loaded.mirror);
  if (!validation.ok) {
    settingsFolderParityLog(panel, "Duplicate deletion aborted before mutation.\n" + String(validation.error || "Guard failed"));
    settingsFolderConflictUpdateDeleteControls(panel);
    return;
  }

  const beforeSummary = settingsFolderCleanupFolderStateSummary(loaded.mirror.state);
  const canonicalCounterpartIds = Array.from(new Set(validation.candidates.map((row) => row.canonicalFolderId).filter(Boolean)));
  const pendingAudit = {
    timestamp: new Date().toISOString(),
    surface: "chrome-studio",
    action: "delete-empty-duplicate-conflict-folders",
    selectedDuplicateFolderIds: validation.selectedDuplicateFolderIds,
    canonicalCounterpartIds,
    beforeSelfCheck: loaded.selfCheck,
    beforeConflictModel: loaded.plan,
    beforeFolderStateSummary: beforeSummary,
    beforeFolderStateSnapshot: settingsFolderCleanupClone(loaded.mirror.state),
    result: "pending",
    errors: [],
  };

  await settingsFolderCleanupAppendAudit(pendingAudit);

  let resultAudit = {
    ...pendingAudit,
    timestamp: new Date().toISOString(),
    beforeFolderStateSnapshot: null,
  };
  try {
    const nextState = settingsFolderCleanupBuildNextState(loaded.mirror, validation.selectedDuplicateFolderIds);
    await settingsFolderCleanupChromeSetStrict({ [FOLDER_STATE_DATA_KEY]: nextState });
    try { W.H2O?.LibraryWorkspace?._bustCaches?.("folder-conflict-delete-empty-duplicates"); } catch {}
    try { await W.H2O?.LibraryIndex?.refresh?.("folder-conflict-delete-empty-duplicates"); } catch {}

    const afterLoaded = await settingsFolderConflictLoadInputs();
    resultAudit = {
      ...resultAudit,
      result: "ok",
      afterSelfCheck: afterLoaded.selfCheck,
      afterFolderStateSummary: afterLoaded.mirror ? settingsFolderCleanupFolderStateSummary(afterLoaded.mirror.state) : null,
      errors: [],
    };
    try { await settingsFolderCleanupAppendAudit(resultAudit); }
    catch (auditErr) {
      resultAudit.errors = ["Result audit append failed: " + String(auditErr && (auditErr.message || auditErr))];
    }
    const result = {
      ok: true,
      action: "delete-empty-duplicate-conflict-folders",
      selectedDuplicateFolderIds: validation.selectedDuplicateFolderIds,
      canonicalCounterpartIds,
      beforeFolderStateSummary: beforeSummary,
      afterFolderStateSummary: resultAudit.afterFolderStateSummary,
      auditWarning: resultAudit.errors[0] || "",
      auditKey: FOLDER_CLEANUP_AUDIT_KEY,
    };
    if (previewEl) {
      previewEl.hidden = false;
      previewEl.textContent = JSON.stringify(result, null, 2);
    }
    settingsFolderParityLog(panel, "Selected empty duplicate conflict folder(s) deleted. Canonical folders, native folder-state, and Desktop SQLite were not modified.");
    panel.__h2oFolderConflictDeletionPreview = null;
    panel.__h2oFolderConflictDeleteSelectedIds = [];
    const input = panel.querySelector("#wbSettingsFolderConflictDeleteConfirm");
    if (input) input.value = "";
    await refreshSettingsFolderParity(panel);
    const refreshedPreviewEl = panel.querySelector("#wbSettingsFolderConflictDeletePreview");
    if (refreshedPreviewEl) {
      refreshedPreviewEl.hidden = false;
      refreshedPreviewEl.textContent = JSON.stringify(result, null, 2);
    }
  } catch (err) {
    resultAudit = {
      ...resultAudit,
      result: "failed",
      afterSelfCheck: null,
      afterFolderStateSummary: null,
      errors: [String(err && (err.stack || err.message || err))],
    };
    try { await settingsFolderCleanupAppendAudit(resultAudit); } catch {}
    settingsFolderParityLog(panel, "Duplicate deletion failed after pending audit.\n" + String(err && (err.stack || err.message || err)));
    throw err;
  } finally {
    settingsFolderConflictUpdateDeleteControls(panel);
  }
}

function settingsFolderDesktopFolderIdOf(row){
  return String(row?.folderId || row?.id || row?.folder_id || "").trim();
}

function settingsFolderDesktopNameOf(row){
  const id = settingsFolderDesktopFolderIdOf(row);
  return String(row?.name || row?.title || row?.label || id || "Folder").trim();
}

function settingsFolderDesktopNormalizeFolder(row){
  const src = row && typeof row === "object" ? row : {};
  const folderId = settingsFolderDesktopFolderIdOf(src);
  if (!folderId) return null;
  return {
    folderId,
    id: folderId,
    name: settingsFolderDesktopNameOf(src),
    source: String(src.source || src.originSource || "").trim(),
    color: String(src.color || src.iconColor || "").trim(),
    sortOrder: settingsFolderCleanupNumber(src.sortOrder ?? src.sort_order),
    createdAt: src.createdAt ?? src.created_at ?? null,
    updatedAt: src.updatedAt ?? src.updated_at ?? null,
    raw: settingsFolderCleanupClone(src),
  };
}

async function settingsFolderDesktopCallMaybe(obj, names, ...args){
  const list = Array.isArray(names) ? names : [];
  for (const name of list) {
    if (typeof obj?.[name] !== "function") continue;
    try {
      return { method: name, ok: true, value: await obj[name](...args) };
    } catch (err) {
      return { method: name, ok: false, error: String(err && (err.stack || err.message || err)) };
    }
  }
  return { method: null, ok: false, error: "no method available" };
}

async function settingsFolderDesktopSqlSelect(query, values = []){
  if (!STUDIO_isTauri()) {
    return { ok: false, error: "not desktop runtime", rows: [] };
  }
  const invoke = STUDIO_getTauriInvoke();
  if (typeof invoke !== "function") {
    return { ok: false, error: "Tauri invoke unavailable", rows: [] };
  }
  try {
    const rows = await invoke("plugin:sql|select", {
      db: "sqlite:studio-v1.db",
      query: String(query || ""),
      values: Array.isArray(values) ? values : [],
    });
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    return { ok: false, error: String(err && (err.stack || err.message || err)), rows: [] };
  }
}

async function settingsFolderDesktopListFolders(){
  const foldersStore = W.H2O?.Studio?.store?.folders;
  const viaStore = await settingsFolderDesktopCallMaybe(foldersStore, ["list", "getAll", "listFolders"]);
  if (viaStore.ok && Array.isArray(viaStore.value)) {
    return {
      source: `store.folders.${viaStore.method}`,
      folders: viaStore.value.map(settingsFolderDesktopNormalizeFolder).filter(Boolean),
      warnings: [],
    };
  }
  const sql = await settingsFolderDesktopSqlSelect(
    "SELECT id, name, source, color, sort_order, created_at, updated_at, meta_json FROM folders ORDER BY id",
    []
  );
  if (sql.ok) {
    return {
      source: "sqlite-readonly",
      folders: sql.rows.map(settingsFolderDesktopNormalizeFolder).filter(Boolean),
      warnings: viaStore.error && viaStore.error !== "no method available" ? [`Store folder list failed: ${viaStore.error}`] : [],
    };
  }
  return {
    source: "unavailable",
    folders: [],
    warnings: [
      viaStore.error ? `Store folder list unavailable: ${viaStore.error}` : "Store folder list unavailable.",
      sql.error ? `SQLite folder list unavailable: ${sql.error}` : "SQLite folder list unavailable.",
    ],
  };
}

function settingsFolderDesktopNormalizeBinding(row, folderId = ""){
  const src = row && typeof row === "object" ? row : {};
  const chatId = String(src.chatId || src.chat_id || src.id || "").trim();
  const fid = String(src.folderId || src.folder_id || folderId || "").trim();
  if (!chatId || !fid) return null;
  return {
    chatId,
    folderId: fid,
    assignedAt: src.assignedAt ?? src.assigned_at ?? null,
    raw: settingsFolderCleanupClone(src),
  };
}

async function settingsFolderDesktopBindingsForFolder(folderId){
  const id = String(folderId || "").trim();
  if (!id) return { source: "missing-folder-id", bindings: [], warnings: ["Missing folder ID."] };
  const foldersStore = W.H2O?.Studio?.store?.folders;
  const direct = await settingsFolderDesktopCallMaybe(foldersStore, [
    "listBindings",
    "getBindings",
    "listFolderBindings",
    "bindingsForFolder",
    "getFolderBindings",
  ], id);
  if (direct.ok && Array.isArray(direct.value)) {
    return {
      source: `store.folders.${direct.method}`,
      bindings: direct.value.map((row) => settingsFolderDesktopNormalizeBinding(row, id)).filter(Boolean),
      warnings: [],
    };
  }
  const sql = await settingsFolderDesktopSqlSelect(
    "SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE folder_id = ? ORDER BY assigned_at DESC",
    [id]
  );
  if (sql.ok) {
    return {
      source: "sqlite-readonly",
      bindings: sql.rows.map((row) => settingsFolderDesktopNormalizeBinding(row, id)).filter(Boolean),
      warnings: direct.error && direct.error !== "no method available" ? [`Store binding read failed: ${direct.error}`] : [],
    };
  }
  const listChats = await settingsFolderDesktopCallMaybe(foldersStore, ["listChats"], id);
  if (listChats.ok && Array.isArray(listChats.value)) {
    return {
      source: "store.folders.listChats",
      bindings: listChats.value.map((chat) => settingsFolderDesktopNormalizeBinding({
        chatId: chat?.id || chat?.chatId || chat?.sourceId || chat?.source_id,
        folderId: id,
      }, id)).filter(Boolean),
      warnings: [
        "Binding source hydrated known chats only; orphan bindings may be hidden.",
        sql.error ? `SQLite binding read unavailable: ${sql.error}` : "",
      ].filter(Boolean),
    };
  }
  return {
    source: "unavailable",
    bindings: [],
    warnings: [
      direct.error ? `Store binding API unavailable: ${direct.error}` : "Store binding API unavailable.",
      sql.error ? `SQLite binding read unavailable: ${sql.error}` : "SQLite binding read unavailable.",
      listChats.error ? `Known-chat fallback unavailable: ${listChats.error}` : "",
    ].filter(Boolean),
  };
}

function settingsFolderDesktopNormalizeKnownChat(row){
  const src = row && typeof row === "object" ? row : {};
  const id = String(src.id || src.chatId || src.source_id || src.sourceId || "").trim();
  if (!id) return null;
  return {
    id,
    sourceId: String(src.sourceId || src.source_id || "").trim(),
    title: String(src.title || "").trim(),
    folderId: String(src.folderId || src.folder_id || "").trim(),
    isSaved: !!(src.isSaved ?? src.is_saved),
    isLinked: !!(src.isLinked ?? src.is_linked),
    href: String(src.href || "").trim(),
  };
}

async function settingsFolderDesktopKnownRowsForBindings(bindings){
  const chatsStore = W.H2O?.Studio?.store?.chats;
  const out = [];
  for (const binding of Array.isArray(bindings) ? bindings : []) {
    const chatId = String(binding?.chatId || "").trim();
    if (!chatId) continue;
    let known = null;
    if (typeof chatsStore?.get === "function") {
      try { known = settingsFolderDesktopNormalizeKnownChat(await chatsStore.get(chatId)); }
      catch { known = null; }
    }
    if (!known) {
      const sql = await settingsFolderDesktopSqlSelect(
        "SELECT id, source_id, title, folder_id, is_saved, is_linked, href, normalized_href FROM chats WHERE id = ? OR source_id = ? LIMIT 1",
        [chatId, chatId]
      );
      if (sql.ok && sql.rows[0]) known = settingsFolderDesktopNormalizeKnownChat(sql.rows[0]);
    }
    out.push({
      chatId,
      folderId: binding.folderId,
      assignedAt: binding.assignedAt ?? null,
      known: !!known,
      chat: known,
    });
  }
  return out;
}

function settingsFolderDesktopRegistryFolderMatches(folderId){
  const id = String(folderId || "").trim();
  if (!id) return [];
  let rows = [];
  try { rows = W.H2O?.LibraryIndex?.getAll?.() || []; } catch { rows = []; }
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const values = [
      row?.folderId,
      row?.folder_id,
      row?.sourceId,
      row?.source_id,
      row?.id,
      row?.chatId,
      row?.snapshotId,
    ].map((value) => String(value || "").trim());
    return values.includes(id);
  }).slice(0, 8).map((row) => ({
    chatId: String(row?.chatId || "").trim(),
    sourceId: String(row?.sourceId || row?.source_id || "").trim(),
    snapshotId: String(row?.snapshotId || row?.id || "").trim(),
    title: String(row?.title || "").trim(),
    folderId: String(row?.folderId || row?.folder_id || "").trim(),
    view: String(row?.view || "").trim(),
  }));
}

async function settingsFolderDesktopDependenciesForFolder(folderId){
  const id = String(folderId || "").trim();
  if (!id) {
    return {
      folderRows: [],
      chatsByFolder: [],
      snapshotsByChatId: [],
      libraryRows: [],
      warnings: ["Missing folder ID."],
    };
  }
  const [folderResult, chatsResult, snapshotsResult] = await Promise.all([
    settingsFolderDesktopSqlSelect(
      "SELECT id, name, source, color, sort_order, created_at, updated_at, meta_json FROM folders WHERE id = ?",
      [id]
    ),
    settingsFolderDesktopSqlSelect(
      "SELECT id, source_id, title, folder_id, is_saved, is_linked, href, normalized_href FROM chats WHERE folder_id = ?",
      [id]
    ),
    settingsFolderDesktopSqlSelect(
      "SELECT id, chat_id, title FROM snapshots WHERE chat_id = ? LIMIT 10",
      [id]
    ),
  ]);
  const warnings = [];
  if (!folderResult.ok) warnings.push(`Folder row preflight failed: ${folderResult.error || "unknown error"}`);
  if (!chatsResult.ok) warnings.push(`Chat dependency preflight failed: ${chatsResult.error || "unknown error"}`);
  if (!snapshotsResult.ok) warnings.push(`Snapshot dependency preflight failed: ${snapshotsResult.error || "unknown error"}`);
  return {
    folderRows: settingsFolderDesktopSqlOkRows(folderResult).map(settingsFolderDesktopNormalizeFolder).filter(Boolean),
    chatsByFolder: settingsFolderDesktopSqlOkRows(chatsResult).map(settingsFolderDesktopNormalizeKnownChat).filter(Boolean),
    snapshotsByChatId: settingsFolderDesktopSqlOkRows(snapshotsResult).map((row) => ({
      id: String(row?.id || "").trim(),
      chatId: String(row?.chat_id || row?.chatId || "").trim(),
      title: String(row?.title || "").trim(),
    })),
    libraryRows: settingsFolderDesktopRegistryFolderMatches(id),
    warnings,
  };
}

async function settingsFolderDesktopLoadFacts(){
  if (!STUDIO_isTauri()) {
    return {
      available: false,
      surface: "chrome-studio",
      source: "not-desktop",
      folders: [],
      f5dFolders: [],
      bindingsByFolder: {},
      knownRowsByFolder: {},
      dependenciesByFolder: {},
      warnings: ["Desktop SQLite review is available only in Desktop Studio."],
      diagnose: null,
      storeMethods: [],
      deleteMethodsAvailable: [],
    };
  }
  const foldersStore = W.H2O?.Studio?.store?.folders;
  const listResult = await settingsFolderDesktopListFolders();
  const f5dFolders = listResult.folders.filter(settingsFolderCleanupIsF5DReviewCandidate);
  const bindingsByFolder = {};
  const knownRowsByFolder = {};
  const dependenciesByFolder = {};
  const warnings = listResult.warnings.slice();
  for (const folder of f5dFolders) {
    const bindingResult = await settingsFolderDesktopBindingsForFolder(folder.folderId);
    bindingsByFolder[folder.folderId] = bindingResult.bindings;
    if (bindingResult.warnings.length) {
      warnings.push(...bindingResult.warnings.map((msg) => `${folder.folderId}: ${msg}`));
    }
    knownRowsByFolder[folder.folderId] = await settingsFolderDesktopKnownRowsForBindings(bindingResult.bindings);
    dependenciesByFolder[folder.folderId] = await settingsFolderDesktopDependenciesForFolder(folder.folderId);
    if (dependenciesByFolder[folder.folderId].warnings.length) {
      warnings.push(...dependenciesByFolder[folder.folderId].warnings.map((msg) => `${folder.folderId}: ${msg}`));
    }
  }
  let diagnose = null;
  try { diagnose = typeof foldersStore?.diagnose === "function" ? await foldersStore.diagnose() : null; } catch {}
  const storeMethods = Object.keys(foldersStore || {}).filter((key) => typeof foldersStore[key] === "function").sort();
  return {
    available: true,
    surface: "desktop-studio",
    source: listResult.source,
    folders: listResult.folders,
    f5dFolders,
    bindingsByFolder,
    knownRowsByFolder,
    dependenciesByFolder,
    warnings: Array.from(new Set(warnings.filter(Boolean))),
    diagnose,
    storeMethods,
    deleteMethodsAvailable: storeMethods.filter((key) => /delete|remove/i.test(key)),
  };
}

function settingsFolderDesktopReadChromeStorage(keys){
  if (!hasChromeStorage()) return Promise.resolve({ ok: false, values: {}, error: "chrome.storage.local unavailable" });
  return new Promise((resolve) => {
    try {
      W.chrome.storage.local.get(keys, (result) => {
        const lastError = W.chrome?.runtime?.lastError;
        if (lastError) {
          resolve({ ok: false, values: {}, error: String(lastError.message || lastError) });
          return;
        }
        resolve({ ok: true, values: result || {}, error: "" });
      });
    } catch (err) {
      resolve({ ok: false, values: {}, error: String(err && (err.stack || err.message || err)) });
    }
  });
}

async function settingsFolderDesktopLoadChromeFacts(){
  const storage = await settingsFolderDesktopReadChromeStorage([FOLDER_STATE_DATA_KEY, FOLDER_CLEANUP_AUDIT_KEY]);
  if (!storage.ok) {
    return {
      available: false,
      source: "unavailable",
      state: null,
      f5dFolders: [],
      auditTail: [],
      warnings: [storage.error],
      summary: null,
    };
  }
  const stateObj = storage.values?.[FOLDER_STATE_DATA_KEY] || {};
  const state = stateObj && typeof stateObj === "object" && !Array.isArray(stateObj) ? stateObj : {};
  const folders = Array.isArray(state.folders) ? state.folders : [];
  const items = state.items && typeof state.items === "object" && !Array.isArray(state.items) ? state.items : {};
  const f5dFolders = folders.filter(settingsFolderCleanupIsF5DReviewCandidate).map((folder) => {
    const id = String(folder?.id || folder?.folderId || "").trim();
    const bucket = items[id];
    const bucketExists = Object.prototype.hasOwnProperty.call(items, id);
    return {
      folderId: id,
      id,
      name: settingsFolderDesktopNameOf(folder),
      raw: settingsFolderCleanupClone(folder),
      bucketExists,
      bucketIsArray: Array.isArray(bucket),
      bucketCount: Array.isArray(bucket) ? bucket.length : 0,
      bucket: Array.isArray(bucket) ? settingsFolderCleanupClone(bucket) : (bucket == null ? null : settingsFolderCleanupClone(bucket)),
    };
  }).filter((folder) => !!folder.folderId);
  const auditRaw = storage.values?.[FOLDER_CLEANUP_AUDIT_KEY];
  const auditTail = Array.isArray(auditRaw) ? auditRaw.slice(-10).map((entry) => ({
    timestamp: entry?.timestamp || "",
    action: entry?.action || "",
    surface: entry?.surface || "",
    result: entry?.result || "",
    selectedFolderIds: entry?.selectedFolderIds || entry?.selectedDuplicateFolderIds || [],
  })) : auditRaw;
  return {
    available: true,
    source: STUDIO_isTauri() ? "desktop-storage-shim" : "chrome.storage.local",
    state,
    f5dFolders,
    auditTail,
    warnings: [],
    summary: settingsFolderCleanupFolderStateSummary(state),
  };
}

function settingsFolderDesktopSurfaceBadges(candidate){
  const badges = [];
  if (candidate?.existsInDesktopSqlite) badges.push("Desktop SQLite");
  if (candidate?.existsInChromeMirror) badges.push("Chrome mirror");
  if (candidate?.surface === "cross-surface") badges.push("cross-surface");
  if (candidate?.bindingCount > 0) badges.push("bound");
  if (candidate?.orphanBindingCount > 0) badges.push("orphan");
  badges.push("review");
  return badges;
}

function settingsFolderDesktopBuildCandidate({ folderId, name, desktopFolder = null, chromeFolder = null, displayRow = null, desktopFacts = null }){
  const id = String(folderId || "").trim();
  const bindings = Array.isArray(desktopFacts?.bindingsByFolder?.[id]) ? desktopFacts.bindingsByFolder[id] : [];
  const knownChatRows = Array.isArray(desktopFacts?.knownRowsByFolder?.[id]) ? desktopFacts.knownRowsByFolder[id] : [];
  const dependencies = desktopFacts?.dependenciesByFolder?.[id] || {};
  const folderRows = Array.isArray(dependencies.folderRows) ? dependencies.folderRows : (desktopFolder ? [desktopFolder] : []);
  const chatsByFolder = Array.isArray(dependencies.chatsByFolder) ? dependencies.chatsByFolder : [];
  const snapshotsByChatId = Array.isArray(dependencies.snapshotsByChatId) ? dependencies.snapshotsByChatId : [];
  const libraryRows = Array.isArray(dependencies.libraryRows) ? dependencies.libraryRows : [];
  const dependencyCount = chatsByFolder.length + snapshotsByChatId.length + libraryRows.length;
  const orphanBindings = knownChatRows.filter((row) => row && row.known === false);
  const existsInDesktopSqlite = !!desktopFolder;
  const existsInChromeMirror = !!chromeFolder;
  const existsInNative = !!displayRow?.isCanonical;
  const bindingCount = bindings.length;
  const blockers = [];
  const warnings = [];
  if (id !== FOLDER_DESKTOP_FINAL_F5D_FOLDER_ID) blockers.push("P7d-d only targets f5d1-test-folder-b");
  if (existsInDesktopSqlite && folderRows.length !== 1) blockers.push(`Desktop folder row count is ${folderRows.length}`);
  if (existsInNative) blockers.push("native/canonical folder");
  if (bindingCount > 0) blockers.push("Desktop SQLite binding exists");
  if (orphanBindings.length > 0) blockers.push("binding does not resolve to a known chat row");
  if (chatsByFolder.length > 0) blockers.push("chat rows reference this folder");
  if (snapshotsByChatId.length > 0) blockers.push("snapshot rows reference this folder id");
  if (libraryRows.length > 0) blockers.push("LibraryIndex rows reference this folder");
  if (existsInChromeMirror) warnings.push("Also present in Chrome mirror; Desktop cleanup does not remove Chrome mirror rows.");
  if (!existsInDesktopSqlite && !existsInChromeMirror) blockers.push("folder not found in Desktop or Chrome facts");
  if (settingsFolderCleanupIsF5DReviewCandidate({ folderId: id, name })) {
    warnings.push("F5D/Desktop test folder. Desktop mutation requires P7d-b guards, typed confirmation, and audit.");
  }
  if (id === "f5d1-test-folder-b" && bindingCount > 0) {
    warnings.push("Known bound review candidate: f5d1-test-chat-001 has been observed on this folder.");
  }
  const surface = existsInDesktopSqlite && existsInChromeMirror
    ? "cross-surface"
    : (existsInDesktopSqlite ? "desktop" : "chrome-studio");
  const store = existsInDesktopSqlite ? "sqlite" : "chrome-storage";
  const className = bindingCount > 0
    ? "desktop-bound-review-candidate"
    : (existsInDesktopSqlite && existsInChromeMirror
      ? "cross-surface-candidate"
      : (existsInDesktopSqlite ? "desktop-empty-test-candidate" : "chrome-only-extra-candidate"));
  const futureEligible = !existsInNative
    && existsInDesktopSqlite
    && id === FOLDER_DESKTOP_FINAL_F5D_FOLDER_ID
    && folderRows.length === 1
    && bindingCount === 0
    && knownChatRows.length === 0
    && dependencyCount === 0;
  return {
    folderId: id,
    name: String(name || desktopFolder?.name || chromeFolder?.name || id).trim() || id,
    normalizedName: String(displayRow?.normalizedName || name || id).trim().toLowerCase(),
    classification: className,
    surface,
    store,
    storeBadges: settingsFolderDesktopSurfaceBadges({
      existsInDesktopSqlite,
      existsInChromeMirror,
      surface,
      bindingCount,
      orphanBindingCount: orphanBindings.length,
    }),
    existsInNative,
    existsInChromeMirror,
    existsInDesktopSqlite,
    bindingCount,
    bindings,
    knownChatRows,
    dependencyCount,
    folderRows,
    chatsByFolder,
    snapshotsByChatId,
    libraryRows,
    chromeBucket: chromeFolder ? {
      bucketExists: !!chromeFolder.bucketExists,
      bucketIsArray: !!chromeFolder.bucketIsArray,
      bucketCount: settingsFolderCleanupNumber(chromeFolder.bucketCount),
      bucket: chromeFolder.bucket,
    } : null,
    proposedAction: bindingCount > 0
      ? "Review exact binding before any future Desktop action."
      : "P7d-d Desktop deletion is allowed only for f5d1-test-folder-b after explicit preview, typed confirmation, fresh revalidation, and audit.",
    riskLevel: bindingCount > 0 || orphanBindings.length > 0 ? "high-review-required" : "review-required",
    requiresApproval: true,
    warnings,
    deletionEligible: false,
    futureDeletionEligible: futureEligible,
    blockers: Array.from(new Set([
      ...blockers,
      ...(futureEligible ? [] : ["not eligible for a future empty Desktop action until blockers are resolved"]),
    ].filter(Boolean))),
  };
}

function settingsFolderDesktopBuildReviewReport(selfCheck, displayModel, desktopFacts, chromeFacts){
  const displayRows = Array.isArray(displayModel?.rows) ? displayModel.rows : [];
  const displayById = new Map(displayRows.map((row) => [String(row?.folderId || row?.id || "").trim(), row]));
  const desktopById = new Map((Array.isArray(desktopFacts?.f5dFolders) ? desktopFacts.f5dFolders : []).map((folder) => [folder.folderId, folder]));
  const chromeById = new Map((Array.isArray(chromeFacts?.f5dFolders) ? chromeFacts.f5dFolders : []).map((folder) => [folder.folderId, folder]));
  const ids = Array.from(new Set([...desktopById.keys(), ...chromeById.keys()])).filter(Boolean).sort();
  const allCandidates = ids.map((id) => settingsFolderDesktopBuildCandidate({
    folderId: id,
    name: desktopById.get(id)?.name || chromeById.get(id)?.name || id,
    desktopFolder: desktopById.get(id) || null,
    chromeFolder: chromeById.get(id) || null,
    displayRow: displayById.get(id) || null,
    desktopFacts,
  }));
  const desktopCandidates = allCandidates.filter((row) => row.existsInDesktopSqlite);
  const chromeCandidates = allCandidates.filter((row) => row.existsInChromeMirror);
  const crossSurfaceCandidates = allCandidates.filter((row) => row.existsInDesktopSqlite && row.existsInChromeMirror);
  const boundReviewCandidates = allCandidates.filter((row) => row.bindingCount > 0);
  const orphanBindings = [];
  for (const candidate of allCandidates) {
    const rows = Array.isArray(candidate.knownChatRows) ? candidate.knownChatRows : [];
    for (const row of rows) {
      if (row && row.known === false) {
        orphanBindings.push({
          folderId: candidate.folderId,
          name: candidate.name,
          chatId: row.chatId,
          binding: `${row.chatId} -> ${row.folderId}`,
          surface: "desktop",
          store: "sqlite",
          riskLevel: "high-review-required",
          proposedAction: "Review orphan binding before any future folder action.",
          blockers: ["Binding exists in Desktop SQLite but no matching chat row was found."],
        });
      }
    }
  }
  return {
    readOnly: true,
    noMutation: true,
    generatedAt: new Date().toISOString(),
    surface: STUDIO_isTauri() ? "desktop-studio" : "chrome-studio",
    selfCheckSummary: selfCheck?.summary || null,
    desktopAvailable: !!desktopFacts?.available,
    chromeMirrorAvailable: !!chromeFacts?.available,
    desktopSource: desktopFacts?.source || "",
    chromeSource: chromeFacts?.source || "",
    counts: {
      desktopCandidates: desktopCandidates.length,
      chromeCandidates: chromeCandidates.length,
      crossSurface: crossSurfaceCandidates.length,
      boundReview: boundReviewCandidates.length,
      orphanBindings: orphanBindings.length,
    },
    desktopCandidates,
    chromeCandidates,
    crossSurfaceCandidates,
    boundReviewCandidates,
    orphanBindings,
    diagnostics: {
      desktopWarnings: desktopFacts?.warnings || [],
      chromeWarnings: chromeFacts?.warnings || [],
      desktopDiagnose: desktopFacts?.diagnose || null,
      desktopStoreMethods: desktopFacts?.storeMethods || [],
      desktopDeleteMethodsAvailable: desktopFacts?.deleteMethodsAvailable || [],
      chromeFolderStateSummary: chromeFacts?.summary || null,
      chromeAuditTail: chromeFacts?.auditTail || [],
    },
    safetyRules: [
      "Desktop review refresh is read-only.",
      "Desktop deletion is available only in the Delete Empty Desktop Folders subsection after preview, typed confirmation, fresh revalidation, and audit.",
      "No Chrome storage writes are performed.",
      "No native ChatGPT folder-state mutation is performed.",
      "Chrome and Desktop cleanup must remain separate future actions.",
      "Folders with bindings are never candidates for empty-folder cleanup.",
    ],
    futurePhases: [
      "P7d-c may later review bound test folder bindings.",
      "P7d-d may later compare Chrome/Desktop consistency after Desktop review.",
    ],
  };
}

function settingsFolderDesktopTargetOrphanBinding(){
  return {
    chatId: FOLDER_DESKTOP_ORPHAN_BINDING_CHAT_ID,
    folderId: FOLDER_DESKTOP_ORPHAN_BINDING_FOLDER_ID,
  };
}

function settingsFolderDesktopSqlOkRows(result){
  return result?.ok && Array.isArray(result.rows) ? result.rows : [];
}

function settingsFolderDesktopRegistryMatches(chatId){
  const id = String(chatId || "").trim();
  if (!id) return [];
  let rows = [];
  try { rows = W.H2O?.LibraryIndex?.getAll?.() || []; } catch { rows = []; }
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const values = [
      row?.chatId,
      row?.sourceId,
      row?.source_id,
      row?.id,
      row?.snapshotId,
      row?.href,
    ].map((value) => String(value || "").trim());
    return values.includes(id);
  }).slice(0, 8).map((row) => ({
    chatId: String(row?.chatId || "").trim(),
    sourceId: String(row?.sourceId || row?.source_id || "").trim(),
    snapshotId: String(row?.snapshotId || row?.id || "").trim(),
    title: String(row?.title || "").trim(),
    folderId: String(row?.folderId || row?.folder_id || "").trim(),
    view: String(row?.view || "").trim(),
  }));
}

async function settingsFolderDesktopLoadOrphanBindingReview(seed = null){
  const target = settingsFolderDesktopTargetOrphanBinding();
  const foldersStore = W.H2O?.Studio?.store?.folders;
  const storeMethods = Object.keys(foldersStore || {}).filter((key) => typeof foldersStore[key] === "function").sort();
  const selfCheck = seed?.selfCheck || (typeof W.H2O?.Library?.FolderParity?.selfCheck === "function"
    ? await W.H2O.Library.FolderParity.selfCheck({ fresh: true })
    : null);

  if (!STUDIO_isTauri()) {
    const review = {
      ...target,
      folderName: "",
      bindingExists: false,
      chatExistsById: false,
      chatExistsBySourceId: false,
      knownChatRows: [],
      folderExists: false,
      otherBindingsForFolder: [],
      classification: "not-eligible",
      classifications: ["not-eligible"],
      proposedAction: "Open Desktop Studio to review Desktop SQLite folder bindings.",
      riskLevel: "unavailable",
      requiresApproval: true,
      blockers: ["Desktop runtime required."],
      warnings: ["Review-only. No binding removed.", "Folder deletion is blocked until this binding is reviewed."],
    };
    return settingsFolderDesktopOrphanBindingReport(review, selfCheck, { storeMethods });
  }

  const [bindingResult, folderResult, chatByIdResult, chatBySourceIdResult, folderBindingsResult, chatBindingsResult] = await Promise.all([
    settingsFolderDesktopSqlSelect(
      "SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE chat_id = ? AND folder_id = ? ORDER BY assigned_at DESC",
      [target.chatId, target.folderId]
    ),
    settingsFolderDesktopSqlSelect(
      "SELECT id, name, source, color, sort_order, created_at, updated_at, meta_json FROM folders WHERE id = ? LIMIT 1",
      [target.folderId]
    ),
    settingsFolderDesktopSqlSelect(
      "SELECT id, source_id, title, folder_id, is_saved, is_linked, href, normalized_href FROM chats WHERE id = ? LIMIT 1",
      [target.chatId]
    ),
    settingsFolderDesktopSqlSelect(
      "SELECT id, source_id, title, folder_id, is_saved, is_linked, href, normalized_href FROM chats WHERE source_id = ? LIMIT 1",
      [target.chatId]
    ),
    settingsFolderDesktopSqlSelect(
      "SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE folder_id = ? ORDER BY assigned_at DESC",
      [target.folderId]
    ),
    settingsFolderDesktopSqlSelect(
      "SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE chat_id = ? ORDER BY assigned_at DESC",
      [target.chatId]
    ),
  ]);
  let snapshotsResult = await settingsFolderDesktopSqlSelect(
    "SELECT * FROM snapshots WHERE chat_id = ? OR source_id = ? OR id = ? LIMIT 5",
    [target.chatId, target.chatId, target.chatId]
  );
  if (!snapshotsResult.ok) {
    snapshotsResult = await settingsFolderDesktopSqlSelect(
      "SELECT * FROM snapshots WHERE chat_id = ? LIMIT 5",
      [target.chatId]
    );
  }

  const bindingRows = settingsFolderDesktopSqlOkRows(bindingResult).map((row) => settingsFolderDesktopNormalizeBinding(row, target.folderId)).filter(Boolean);
  const folderRows = settingsFolderDesktopSqlOkRows(folderResult).map(settingsFolderDesktopNormalizeFolder).filter(Boolean);
  const chatByIdRows = settingsFolderDesktopSqlOkRows(chatByIdResult).map(settingsFolderDesktopNormalizeKnownChat).filter(Boolean);
  const chatBySourceIdRows = settingsFolderDesktopSqlOkRows(chatBySourceIdResult).map(settingsFolderDesktopNormalizeKnownChat).filter(Boolean);
  const snapshotRows = settingsFolderDesktopSqlOkRows(snapshotsResult).map((row) => ({
    id: String(row?.id || row?.snapshot_id || "").trim(),
    chatId: String(row?.chat_id || row?.chatId || "").trim(),
    sourceId: String(row?.source_id || row?.sourceId || "").trim(),
    title: String(row?.title || "").trim(),
  }));
  const registryRows = settingsFolderDesktopRegistryMatches(target.chatId);
  const otherBindings = settingsFolderDesktopSqlOkRows(folderBindingsResult)
    .map((row) => settingsFolderDesktopNormalizeBinding(row, target.folderId))
    .filter(Boolean);
  const chatBindings = settingsFolderDesktopSqlOkRows(chatBindingsResult)
    .map((row) => settingsFolderDesktopNormalizeBinding(row, target.folderId))
    .filter(Boolean);

  const bindingExists = bindingRows.length > 0;
  const folderExists = folderRows.length > 0;
  const chatExistsById = chatByIdRows.length > 0;
  const chatExistsBySourceId = chatBySourceIdRows.length > 0;
  const hasSnapshotOrRegistryMatch = snapshotRows.length > 0 || registryRows.length > 0;
  const knownChatRows = [
    ...chatByIdRows.map((row) => ({ source: "chats.id", known: true, chat: row })),
    ...chatBySourceIdRows.map((row) => ({ source: "chats.source_id", known: true, chat: row })),
    ...snapshotRows.map((row) => ({ source: "snapshots", known: true, chat: row })),
    ...registryRows.map((row) => ({ source: "LibraryIndex", known: true, chat: row })),
  ];
  const warnings = ["Review-only. No binding removed.", "Folder deletion is blocked until this binding is reviewed."];
  const blockers = [];
  const classifications = [];
  let classification = "not-eligible";
  let proposedAction = "No action available until the binding state can be trusted.";
  let riskLevel = "review-required";
  const sqlErrors = [bindingResult, folderResult, chatByIdResult, chatBySourceIdResult, folderBindingsResult, chatBindingsResult, snapshotsResult]
    .filter((result) => result && result.ok === false)
    .map((result) => result.error)
    .filter(Boolean);

  if (!bindingExists) {
    classification = "not-eligible";
    blockers.push("Target binding row was not found.");
  } else if (bindingRows.length !== 1) {
    classification = "ambiguous-binding";
    classifications.push(classification);
    blockers.push(`Target binding row count is ${bindingRows.length}.`);
    proposedAction = "Rerun review and do not remove until the exact binding is singular.";
  } else if (!folderExists) {
    classification = "orphan-binding-folder-missing";
    classifications.push(classification);
    riskLevel = "high-review-required";
    proposedAction = "Review the missing folder before any binding change.";
  } else if (chatExistsById || chatExistsBySourceId || hasSnapshotOrRegistryMatch) {
    classification = "valid-binding";
    classifications.push(classification);
    blockers.push("Chat resolves to an existing row or registry/snapshot match.");
    proposedAction = "Keep binding unless a future review proves it should move or be removed.";
  } else if (chatBindings.some((row) => String(row?.folderId || "").trim() !== target.folderId)) {
    classification = "ambiguous-binding";
    classifications.push(classification);
    blockers.push("Target chat has another folder binding.");
    proposedAction = "Do not remove until same-chat binding state is reviewed.";
  } else if (sqlErrors.length) {
    classification = "ambiguous-binding";
    classifications.push(classification);
    blockers.push("One or more read-only lookups failed.");
    proposedAction = "Rerun review after lookup errors are resolved.";
  } else {
    classification = "orphan-binding-chat-missing";
    classifications.push(classification);
    proposedAction = "Future P7d-c-b may remove only this exact binding after typed confirmation and audit.";
  }
  if (/f5d/i.test(`${target.chatId} ${target.folderId} ${folderRows[0]?.name || ""}`) && bindingExists && !knownChatRows.length) {
    classifications.push("test-binding-candidate");
    warnings.push("F5D/test binding candidate. Review before any removal.");
  }
  if (!classifications.length) classifications.push(classification);

  const review = {
    chatId: target.chatId,
    folderId: target.folderId,
    folderName: folderRows[0]?.name || target.folderId,
    bindingExists,
    chatExistsById,
    chatExistsBySourceId,
    knownChatRows,
    folderExists,
    otherBindingsForFolder: otherBindings,
    classification,
    classifications: Array.from(new Set(classifications)),
    proposedAction,
    riskLevel,
    requiresApproval: true,
    blockers: Array.from(new Set(blockers.filter(Boolean))),
    warnings: Array.from(new Set(warnings.filter(Boolean))),
    lookupResults: {
      exactBinding: { ok: !!bindingResult.ok, rows: bindingRows, error: bindingResult.error || "" },
      folder: { ok: !!folderResult.ok, rows: folderRows, error: folderResult.error || "" },
      chatsById: { ok: !!chatByIdResult.ok, rows: chatByIdRows, error: chatByIdResult.error || "" },
      chatsBySourceId: { ok: !!chatBySourceIdResult.ok, rows: chatBySourceIdRows, error: chatBySourceIdResult.error || "" },
      snapshots: { ok: !!snapshotsResult.ok, rows: snapshotRows, error: snapshotsResult.error || "" },
      registryRows,
      folderBindings: { ok: !!folderBindingsResult.ok, rows: otherBindings, error: folderBindingsResult.error || "" },
      chatBindings: { ok: !!chatBindingsResult.ok, rows: chatBindings, error: chatBindingsResult.error || "" },
    },
    storeApi: {
      storeMethods,
      hasUnbindChat: typeof foldersStore?.unbindChat === "function",
      futureMutationMethod: "H2O.Studio.store.folders.unbindChat(folderId, chatId)",
    },
  };
  return settingsFolderDesktopOrphanBindingReport(review, selfCheck, { storeMethods });
}

function settingsFolderDesktopOrphanBindingReport(review, selfCheck, extra = {}){
  return {
    readOnly: true,
    noMutation: true,
    generatedAt: new Date().toISOString(),
    surface: STUDIO_isTauri() ? "desktop-studio" : "chrome-studio",
    selfCheck: selfCheck || null,
    review,
    selfCheckSummary: selfCheck?.summary || null,
    diagnostics: {
      storeMethods: extra.storeMethods || [],
    },
    safetyRules: [
      "P7d-c-a is review-only.",
      "No Desktop SQLite writes are performed.",
      "No binding is removed.",
      "No folder is deleted.",
      "No Chrome storage, sync folder, or native folder-state mutation is performed.",
    ],
    futurePhases: [
      "P7d-c-b may later remove this exact orphan binding with typed confirmation and audit.",
      "P7d-d may later delete the now-empty folder after binding removal, as a separate action.",
    ],
  };
}

async function settingsFolderDesktopLoadReviewInputs(seed = null){
  const parity = W.H2O?.Library?.FolderParity;
  const selfCheck = seed?.selfCheck || (typeof parity?.selfCheck === "function" ? await parity.selfCheck({ fresh: true }) : null);
  const displayModel = seed?.displayModel || (typeof parity?.getDisplayModel === "function" ? await parity.getDisplayModel({ fresh: true }) : { rows: [], canonicalRows: [], localReviewRows: [] });
  const desktopFacts = await settingsFolderDesktopLoadFacts();
  const chromeFacts = await settingsFolderDesktopLoadChromeFacts();
  return {
    selfCheck,
    displayModel,
    desktopFacts,
    chromeFacts,
    report: settingsFolderDesktopBuildReviewReport(selfCheck, displayModel, desktopFacts, chromeFacts),
  };
}

function settingsFolderDesktopBindingHtml(candidate){
  const bindings = Array.isArray(candidate?.bindings) ? candidate.bindings : [];
  if (!bindings.length) return `<div style="font-size:12px;opacity:.72"><strong>Bindings:</strong> none</div>`;
  const knownRows = Array.isArray(candidate?.knownChatRows) ? candidate.knownChatRows : [];
  return `
    <div style="display:flex;flex-direction:column;gap:3px;font-size:12px">
      <strong>Bindings:</strong>
      ${bindings.map((binding) => {
        const known = knownRows.find((row) => row?.chatId === binding.chatId);
        const resolution = known?.known ? `known chat${known.chat?.title ? `: ${known.chat.title}` : ""}` : "no matching chat row";
        return `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace">${esc(binding.chatId)} -&gt; ${esc(binding.folderId)} <span style="opacity:.68">(${esc(resolution)})</span></span>`;
      }).join("")}
    </div>
  `;
}

function settingsFolderDesktopCandidateHtml(candidate){
  const blockers = Array.isArray(candidate?.blockers) ? candidate.blockers : [];
  const warnings = Array.isArray(candidate?.warnings) ? candidate.warnings : [];
  const chromeBucket = candidate?.chromeBucket;
  const bucketText = chromeBucket
    ? `${chromeBucket.bucketExists ? "present" : "missing"} · ${chromeBucket.bucketIsArray ? "array" : "not-array"} · ${chromeBucket.bucketCount || 0} item(s)`
    : "not present";
  const badges = Array.isArray(candidate?.storeBadges) ? candidate.storeBadges : [];
  return `
    <div style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <strong>${esc(candidate?.name || "(unnamed)")}</strong>
        <span>${settingsFolderCleanupBadgesHtml({ badges, classification: candidate?.classification })}</span>
      </div>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.72">${esc(candidate?.folderId || "(no folder id)")}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:4px 12px;font-size:12px">
        <span>surface ${esc(candidate?.surface || "unknown")}</span>
        <span>store ${esc(candidate?.store || "unknown")}</span>
        <span>Desktop ${candidate?.existsInDesktopSqlite ? "yes" : "no"}</span>
        <span>Chrome ${candidate?.existsInChromeMirror ? "yes" : "no"}</span>
        <span>native ${candidate?.existsInNative ? "yes" : "no"}</span>
        <span>bindings ${esc(candidate?.bindingCount || 0)}</span>
      </div>
      <div style="font-size:12px"><strong>Chrome bucket:</strong> ${esc(bucketText)}</div>
      ${settingsFolderDesktopBindingHtml(candidate)}
      <div style="font-size:12px"><strong>Review:</strong> ${esc(candidate?.proposedAction || "Review only.")}</div>
      <div style="font-size:12px"><strong>Risk:</strong> ${esc(candidate?.riskLevel || "review")}</div>
      <div style="font-size:12px"><strong>P7d-b empty-folder eligibility:</strong> ${candidate?.futureDeletionEligible ? "possible after guards" : "not eligible"}</div>
      ${warnings.length ? `<div style="font-size:12px;opacity:.78"><strong>Warnings:</strong> ${esc(warnings.join(" "))}</div>` : ""}
      ${blockers.length ? `<div style="font-size:12px;opacity:.78"><strong>Blockers:</strong> ${esc(blockers.join(" "))}</div>` : ""}
    </div>
  `;
}

function settingsFolderDesktopGroupHtml(title, candidates, emptyText){
  const rows = Array.isArray(candidates) ? candidates : [];
  return `
    <details open style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:rgba(255,255,255,.025)">
      <summary style="cursor:pointer;font-weight:600">${esc(title)} <span style="opacity:.65">(${rows.length})</span></summary>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
        ${rows.length ? rows.map(settingsFolderDesktopCandidateHtml).join("") : `<div style="opacity:.65;font-size:12px">${esc(emptyText || "No candidates.")}</div>`}
      </div>
    </details>
  `;
}

function settingsFolderDesktopOrphanHtml(item){
  const blockers = Array.isArray(item?.blockers) ? item.blockers : [];
  return `
    <div style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px">
      <strong>${esc(item?.binding || "orphan binding")}</strong>
      <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.72">${esc(item?.folderId || "")}</div>
      <div style="font-size:12px"><strong>Review:</strong> ${esc(item?.proposedAction || "Review only.")}</div>
      <div style="font-size:12px"><strong>Risk:</strong> ${esc(item?.riskLevel || "review")}</div>
      ${blockers.length ? `<div style="font-size:12px;opacity:.78"><strong>Blockers:</strong> ${esc(blockers.join(" "))}</div>` : ""}
    </div>
  `;
}

function settingsFolderDesktopOrphanBindingRow(label, value){
  return `<span style="display:flex;gap:6px;min-width:0"><strong>${esc(label)}:</strong> <span style="min-width:0;word-break:break-word">${esc(value)}</span></span>`;
}

function settingsFolderDesktopOrphanBindingRenderLookup(title, rows, emptyText){
  const list = Array.isArray(rows) ? rows : [];
  return `
    <details style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:rgba(255,255,255,.025)">
      <summary style="cursor:pointer;font-weight:600">${esc(title)} <span style="opacity:.65">(${list.length})</span></summary>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:8px;font-size:12px">
        ${list.length ? list.map((row) => `<code style="white-space:pre-wrap;word-break:break-word">${esc(JSON.stringify(row))}</code>`).join("") : `<span style="opacity:.65">${esc(emptyText || "No rows.")}</span>`}
      </div>
    </details>
  `;
}

function settingsFolderDesktopOrphanBindingRemovalBlockers(report){
  const target = settingsFolderDesktopTargetOrphanBinding();
  const review = report?.review || {};
  const lookups = review.lookupResults || {};
  const exactRows = Array.isArray(lookups.exactBinding?.rows) ? lookups.exactBinding.rows : [];
  const folderRows = Array.isArray(lookups.folder?.rows) ? lookups.folder.rows : [];
  const snapshotRows = Array.isArray(lookups.snapshots?.rows) ? lookups.snapshots.rows : [];
  const registryRows = Array.isArray(lookups.registryRows) ? lookups.registryRows : [];
  const chatBindings = Array.isArray(lookups.chatBindings?.rows) ? lookups.chatBindings.rows : [];
  const knownRows = Array.isArray(review.knownChatRows) ? review.knownChatRows : [];
  const blockers = [];
  if (!STUDIO_isTauri()) blockers.push("Desktop runtime required.");
  if (!review.storeApi?.hasUnbindChat) blockers.push("H2O.Studio.store.folders.unbindChat unavailable.");
  if (String(review.chatId || "") !== target.chatId || String(review.folderId || "") !== target.folderId) blockers.push("review target does not match exact binding.");
  if (exactRows.length !== 1) blockers.push(`exact binding row count is ${exactRows.length}.`);
  if (folderRows.length !== 1) blockers.push(`folder row count is ${folderRows.length}.`);
  if (review.chatExistsById) blockers.push("chat resolves by chats.id.");
  if (review.chatExistsBySourceId) blockers.push("chat resolves by chats.source_id.");
  if (snapshotRows.length) blockers.push("chat resolves in snapshots.");
  if (registryRows.length) blockers.push("chat resolves in LibraryIndex.");
  if (knownRows.some((row) => row && row.known)) blockers.push("known chat row exists.");
  if (!/f5d/i.test(`${review.chatId || ""} ${review.folderId || ""} ${review.folderName || ""}`)) blockers.push("target is not an F5D/test binding.");
  if (chatBindings.some((row) => String(row?.folderId || "").trim() !== target.folderId)) blockers.push("same chat has another folder binding.");
  if (review.classification !== "orphan-binding-chat-missing") blockers.push(`classification is ${review.classification || "unknown"}.`);
  return Array.from(new Set(blockers.filter(Boolean)));
}

function settingsFolderDesktopOrphanBindingTargetSelection(){
  return {
    chatId: FOLDER_DESKTOP_ORPHAN_BINDING_CHAT_ID,
    folderId: FOLDER_DESKTOP_ORPHAN_BINDING_FOLDER_ID,
  };
}

function settingsFolderDesktopOrphanBindingSelected(panel){
  const box = panel?.querySelector?.("#wbSettingsFolderDesktopOrphanBindingRemoveList input[data-chat-id][data-folder-id]");
  if (box) {
    if (!box.checked) return null;
    return {
      chatId: String(box.dataset.chatId || "").trim(),
      folderId: String(box.dataset.folderId || "").trim(),
    };
  }
  return FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.selected
    ? settingsFolderDesktopOrphanBindingTargetSelection()
    : null;
}

function settingsFolderDesktopOrphanBindingRemovalRowHtml(report){
  const target = settingsFolderDesktopTargetOrphanBinding();
  const review = report?.review || {};
  const blockers = settingsFolderDesktopOrphanBindingRemovalBlockers(report);
  const eligible = blockers.length === 0;
  const checked = eligible && !!FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.selected;
  const badges = settingsFolderCleanupBadgesHtml({ badges: ["Desktop SQLite", "orphan", "review"], classification: eligible ? "orphan-removal-eligible" : "review-required" });
  return `
    <label style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:flex-start;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);border-radius:8px;padding:8px">
      <input type="checkbox" data-chat-id="${esc(target.chatId)}" data-folder-id="${esc(target.folderId)}" ${checked ? "checked" : ""} ${eligible ? "" : "disabled"} />
      <span style="display:flex;flex-direction:column;gap:4px;min-width:0">
        <span style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <strong>${esc(target.chatId)} -&gt; ${esc(target.folderId)}</strong>
          <span>${badges}</span>
        </span>
        <span style="font-size:12px;opacity:.78">Folder: ${esc(review.folderName || target.folderId)}</span>
        <span style="font-size:12px;opacity:.72">Target API: <code>H2O.Studio.store.folders.unbindChat("${esc(target.folderId)}", "${esc(target.chatId)}")</code></span>
        ${blockers.length ? `<span style="font-size:12px;opacity:.78"><strong>Blocked:</strong> ${esc(blockers.join(" "))}</span>` : `<span style="font-size:12px;opacity:.78">Eligible only for exact binding removal. The folder row is not modified.</span>`}
      </span>
    </label>
  `;
}

function settingsFolderDesktopRenderOrphanBindingRemovalPanel(panel, report){
  const summary = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveSummary");
  const list = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveList");
  const previewEl = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingRemovePreview");
  const confirmInput = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveConfirm");
  const blockers = settingsFolderDesktopOrphanBindingRemovalBlockers(report);
  const eligible = blockers.length === 0;
  if (!eligible) {
    FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview = null;
  }
  if (summary) {
    const status = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.status ? ` ${FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.status}` : "";
    summary.textContent = STUDIO_isTauri()
      ? (blockers.length
        ? `Desktop SQLite binding only. Removal blocked: ${blockers.join(" ")}${status}`
        : `Desktop SQLite binding only. Exact orphan binding is selectable. The folder row, Chrome mirror, native folder-state, and sync folder are not modified.${status}`)
      : "Orphan binding removal is only available in Desktop Studio.";
  }
  if (list) list.innerHTML = settingsFolderDesktopOrphanBindingRemovalRowHtml(report);
  if (confirmInput && confirmInput.value !== FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation) {
    confirmInput.value = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation;
  }
  panel.__h2oFolderDesktopOrphanBindingRemovalPreview = eligible ? FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview : null;
  if (previewEl) {
    if (panel.__h2oFolderDesktopOrphanBindingRemovalPreview) {
      previewEl.hidden = false;
      previewEl.textContent = JSON.stringify(panel.__h2oFolderDesktopOrphanBindingRemovalPreview, null, 2);
    } else {
      previewEl.hidden = true;
      previewEl.textContent = "";
    }
  }
  settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
}

function settingsFolderDesktopValidateOrphanBindingRemovalSelection(selected, report){
  const target = settingsFolderDesktopTargetOrphanBinding();
  const binding = selected && typeof selected === "object" ? {
    chatId: String(selected.chatId || "").trim(),
    folderId: String(selected.folderId || "").trim(),
  } : null;
  if (!binding) return { ok: false, error: "Select the exact orphan Desktop binding.", selectedBindings: [] };
  if (binding.chatId !== target.chatId || binding.folderId !== target.folderId) {
    return { ok: false, error: "Selected binding does not match the exact P7d-c-b target.", selectedBindings: [binding] };
  }
  const blockers = settingsFolderDesktopOrphanBindingRemovalBlockers(report);
  if (blockers.length) return { ok: false, error: `Selected binding failed removal guards: ${blockers.join("; ")}`, selectedBindings: [binding] };
  return { ok: true, selectedBindings: [binding], review: report?.review || null };
}

function settingsFolderDesktopBuildOrphanBindingRemovalPreview(selected, report){
  const validation = settingsFolderDesktopValidateOrphanBindingRemovalSelection(selected, report);
  if (!validation.ok) return { ok: false, error: validation.error, selectedBindings: validation.selectedBindings || [] };
  const review = validation.review || {};
  const lookups = review.lookupResults || {};
  const folderBindings = Array.isArray(lookups.folderBindings?.rows) ? lookups.folderBindings.rows : [];
  return {
    ok: true,
    readOnly: false,
    noMutation: true,
    mutation: "preview-only",
    generatedAt: new Date().toISOString(),
    surface: "desktop-studio",
    action: "remove-orphan-desktop-folder-binding",
    selectedBindings: validation.selectedBindings,
    folderRow: settingsFolderCleanupClone((lookups.folder?.rows || [])[0] || null),
    exactBindingRows: settingsFolderCleanupClone(lookups.exactBinding?.rows || []),
    chatLookupResults: {
      chatsById: settingsFolderCleanupClone(lookups.chatsById?.rows || []),
      chatsBySourceId: settingsFolderCleanupClone(lookups.chatsBySourceId?.rows || []),
      snapshots: settingsFolderCleanupClone(lookups.snapshots?.rows || []),
      libraryIndex: settingsFolderCleanupClone(lookups.registryRows || []),
    },
    beforeBindingCountForFolder: folderBindings.length,
    predictedAfterBindingCountForFolder: Math.max(0, folderBindings.length - 1),
    targetApi: `H2O.Studio.store.folders.unbindChat("${FOLDER_DESKTOP_ORPHAN_BINDING_FOLDER_ID}", "${FOLDER_DESKTOP_ORPHAN_BINDING_CHAT_ID}")`,
    confirmationText: FOLDER_DESKTOP_ORPHAN_BINDING_CONFIRM_TEXT,
    folderRowNote: "The folder row is not deleted in P7d-c-b.",
    chromeMirrorNote: "Chrome mirror cleanup is separate and not performed.",
    nativeStateNote: "Native ChatGPT folder-state is not modified.",
  };
}

function settingsFolderDesktopResolveUnbindMethod(){
  const foldersStore = W.H2O?.Studio?.store?.folders;
  if (typeof foldersStore?.unbindChat === "function") return { method: "unbindChat", fn: foldersStore.unbindChat.bind(foldersStore) };
  return { method: "", fn: null };
}

function settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel){
  const selected = settingsFolderDesktopOrphanBindingSelected(panel);
  FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.selected = !!selected;
  panel.__h2oFolderDesktopOrphanBindingSelected = selected;
  const preview = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview || panel?.__h2oFolderDesktopOrphanBindingRemovalPreview;
  const previewBtn = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingPreviewRemove");
  const copyBtn = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingCopyRemovePlan");
  const confirmInput = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveConfirm");
  const removeBtn = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveSelected");
  if (confirmInput && confirmInput.value !== FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation) {
    confirmInput.value = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation;
  }
  const confirmationOk = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation === FOLDER_DESKTOP_ORPHAN_BINDING_CONFIRM_TEXT;
  const selectedMatchesPreview = !!preview?.ok
    && !!selected
    && (preview.selectedBindings || []).length === 1
    && preview.selectedBindings[0]?.chatId === selected.chatId
    && preview.selectedBindings[0]?.folderId === selected.folderId;
  if (previewBtn) previewBtn.disabled = !STUDIO_isTauri() || !selected;
  if (copyBtn) copyBtn.disabled = !preview?.ok;
  if (removeBtn) removeBtn.disabled = !STUDIO_isTauri() || !selectedMatchesPreview || !confirmationOk;
}

function settingsFolderDesktopRenderOrphanBindingReport(panel, report){
  const summary = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingSummary");
  const body = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingBody");
  const copyBtn = panel?.querySelector("#wbSettingsFolderDesktopOrphanBindingCopy");
  const review = report?.review || {};
  if (summary) {
    const classes = Array.isArray(review.classifications) && review.classifications.length
      ? review.classifications.join(", ")
      : (review.classification || "unknown");
    summary.textContent = `Review-only. No binding removed. Classification: ${classes}.`;
  }
  if (body) {
    const lookups = review.lookupResults || {};
    const blockers = Array.isArray(review.blockers) ? review.blockers : [];
    const warnings = Array.isArray(review.warnings) ? review.warnings : [];
    body.innerHTML = `
      <div style="border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <strong>${esc(review.chatId || FOLDER_DESKTOP_ORPHAN_BINDING_CHAT_ID)} -&gt; ${esc(review.folderId || FOLDER_DESKTOP_ORPHAN_BINDING_FOLDER_ID)}</strong>
          <span>${settingsFolderCleanupBadgesHtml({ badges: ["Desktop SQLite", "orphan", "review"], classification: review.classification || "review" })}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:5px 12px;font-size:12px">
          ${settingsFolderDesktopOrphanBindingRow("folder", `${review.folderName || ""} (${review.folderId || ""})`)}
          ${settingsFolderDesktopOrphanBindingRow("binding exists", review.bindingExists ? "yes" : "no")}
          ${settingsFolderDesktopOrphanBindingRow("folder exists", review.folderExists ? "yes" : "no")}
          ${settingsFolderDesktopOrphanBindingRow("chat by id", review.chatExistsById ? "found" : "missing")}
          ${settingsFolderDesktopOrphanBindingRow("chat by source_id", review.chatExistsBySourceId ? "found" : "missing")}
          ${settingsFolderDesktopOrphanBindingRow("other folder bindings", String((review.otherBindingsForFolder || []).length))}
          ${settingsFolderDesktopOrphanBindingRow("risk", review.riskLevel || "review")}
          ${settingsFolderDesktopOrphanBindingRow("future API", review.storeApi?.hasUnbindChat ? review.storeApi.futureMutationMethod : "unbindChat unavailable")}
        </div>
        <div style="font-size:12px"><strong>Proposed future action:</strong> ${esc(review.proposedAction || "Review only.")}</div>
        ${warnings.length ? `<div style="font-size:12px;opacity:.78"><strong>Warnings:</strong> ${esc(warnings.join(" "))}</div>` : ""}
        ${blockers.length ? `<div style="font-size:12px;opacity:.78"><strong>Blockers:</strong> ${esc(blockers.join(" "))}</div>` : ""}
        <div style="font-size:12px;opacity:.72">P7d-c-b may later remove this exact binding with typed confirmation and audit. P7d-c-a does not call unbindChat.</div>
      </div>
      ${settingsFolderDesktopOrphanBindingRenderLookup("Exact binding row", lookups.exactBinding?.rows, "Binding row not found.")}
      ${settingsFolderDesktopOrphanBindingRenderLookup("Folder row", lookups.folder?.rows, "Folder row not found.")}
      ${settingsFolderDesktopOrphanBindingRenderLookup("Chat lookup by id", lookups.chatsById?.rows, "No chats.id match.")}
      ${settingsFolderDesktopOrphanBindingRenderLookup("Chat lookup by source_id", lookups.chatsBySourceId?.rows, "No chats.source_id match.")}
      ${settingsFolderDesktopOrphanBindingRenderLookup("Snapshot lookup", lookups.snapshots?.rows, "No snapshot rows found or snapshots unavailable.")}
      ${settingsFolderDesktopOrphanBindingRenderLookup("LibraryIndex lookup", lookups.registryRows, "No LibraryIndex rows found.")}
      ${settingsFolderDesktopOrphanBindingRenderLookup("All bindings for folder", lookups.folderBindings?.rows, "No folder bindings found.")}
      ${settingsFolderDesktopOrphanBindingRenderLookup("All bindings for chat", lookups.chatBindings?.rows, "No chat bindings found.")}
    `;
  }
  if (copyBtn) copyBtn.disabled = false;
  settingsFolderDesktopRenderOrphanBindingRemovalPanel(panel, report);
}

function settingsFolderDesktopRenderReport(panel, report){
  const summary = panel?.querySelector("#wbSettingsFolderDesktopReviewSummary");
  const chips = panel?.querySelector("#wbSettingsFolderDesktopReviewChips");
  const groups = panel?.querySelector("#wbSettingsFolderDesktopReviewGroups");
  const copyBtn = panel?.querySelector("#wbSettingsFolderDesktopReviewCopy");
  if (summary) {
    summary.textContent = `Review-only. Desktop ${report?.desktopAvailable ? "available" : "unavailable"} · Chrome mirror ${report?.chromeMirrorAvailable ? "available" : "unavailable"}. No Desktop cleanup performed.`;
  }
  if (chips) {
    chips.innerHTML = [
      settingsFolderCleanupChip("Desktop F5D", report?.counts?.desktopCandidates || 0),
      settingsFolderCleanupChip("Chrome F5D", report?.counts?.chromeCandidates || 0),
      settingsFolderCleanupChip("cross-surface", report?.counts?.crossSurface || 0),
      settingsFolderCleanupChip("bound review", report?.counts?.boundReview || 0),
      settingsFolderCleanupChip("orphan bindings", report?.counts?.orphanBindings || 0),
    ].join("");
  }
  if (groups) {
    const diagnostics = report?.diagnostics || {};
    const warnings = [...(diagnostics.desktopWarnings || []), ...(diagnostics.chromeWarnings || [])].filter(Boolean);
    groups.innerHTML = [
      warnings.length ? `<div style="font-size:12px;opacity:.78"><strong>Read warnings:</strong> ${esc(warnings.join(" "))}</div>` : "",
      settingsFolderDesktopGroupHtml("Desktop F5D candidates", report?.desktopCandidates, "No Desktop F5D candidates detected on this surface."),
      settingsFolderDesktopGroupHtml("Chrome mirror F5D candidates", report?.chromeCandidates, "No Chrome mirror F5D candidates detected."),
      settingsFolderDesktopGroupHtml("Cross-surface candidates", report?.crossSurfaceCandidates, "No F5D folders are present in both Desktop and Chrome mirror facts."),
      settingsFolderDesktopGroupHtml("Bound review candidates", report?.boundReviewCandidates, "No bound F5D review candidates detected."),
      `
        <details open style="border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:rgba(255,255,255,.025)">
          <summary style="cursor:pointer;font-weight:600">Orphan bindings <span style="opacity:.65">(${(report?.orphanBindings || []).length})</span></summary>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
            ${(report?.orphanBindings || []).length
              ? report.orphanBindings.map(settingsFolderDesktopOrphanHtml).join("")
              : `<div style="opacity:.65;font-size:12px">No F5D orphan bindings detected.</div>`}
          </div>
        </details>
      `,
    ].join("");
  }
  if (copyBtn) copyBtn.disabled = false;
  settingsFolderDesktopRenderDeletePanel(panel, report);
}

function settingsFolderDesktopDeleteBlockers(candidate){
  const folderId = String(candidate?.folderId || "").trim();
  const blockers = [];
  const knownChatRows = Array.isArray(candidate?.knownChatRows) ? candidate.knownChatRows : [];
  const folderRows = Array.isArray(candidate?.folderRows) ? candidate.folderRows : [];
  const chatsByFolder = Array.isArray(candidate?.chatsByFolder) ? candidate.chatsByFolder : [];
  const snapshotsByChatId = Array.isArray(candidate?.snapshotsByChatId) ? candidate.snapshotsByChatId : [];
  const libraryRows = Array.isArray(candidate?.libraryRows) ? candidate.libraryRows : [];
  if (!STUDIO_isTauri()) blockers.push("Desktop runtime required.");
  if (!folderId) blockers.push("missing folder ID");
  if (folderId !== FOLDER_DESKTOP_FINAL_F5D_FOLDER_ID) blockers.push("P7d-d only allows f5d1-test-folder-b");
  if (!candidate?.existsInDesktopSqlite) blockers.push("not present in Desktop SQLite");
  if (!settingsFolderCleanupIsF5DReviewCandidate(candidate)) blockers.push("not in Desktop/F5D review set");
  if (/^f_/.test(folderId)) blockers.push("canonical native folder ID prefix");
  if (candidate?.existsInNative) blockers.push("native-present folder");
  if (folderRows.length !== 1) blockers.push(`Desktop folder row count is ${folderRows.length}`);
  if (settingsFolderCleanupNumber(candidate?.bindingCount) !== 0) blockers.push("Desktop SQLite bindings exist");
  if (knownChatRows.some((row) => row && row.known)) blockers.push("known chat row depends on this folder");
  if (chatsByFolder.length > 0) blockers.push("chats.folder_id references this folder");
  if (snapshotsByChatId.length > 0) blockers.push("snapshots.chat_id references this folder id");
  if (libraryRows.length > 0) blockers.push("LibraryIndex references this folder");
  const remove = settingsFolderDesktopResolveRemoveMethod();
  if (typeof remove.fn !== "function") blockers.push("Desktop folder remove API unavailable");
  if (folderId === FOLDER_DESKTOP_FINAL_F5D_FOLDER_ID && settingsFolderCleanupNumber(candidate?.bindingCount) > 0) {
    blockers.push("known bound F5D review folder");
  }
  return Array.from(new Set(blockers.filter(Boolean)));
}

function settingsFolderDesktopEligibleDeleteRows(report){
  const rows = Array.isArray(report?.desktopCandidates) ? report.desktopCandidates : [];
  return rows.filter((candidate) => settingsFolderDesktopDeleteBlockers(candidate).length === 0);
}

function settingsFolderDesktopSelectedDeleteIds(panel){
  const boxes = Array.from(panel?.querySelectorAll?.("#wbSettingsFolderDesktopDeleteList input[data-folder-id]") || []);
  return boxes
    .filter((box) => !!box.checked)
    .map((box) => String(box.dataset.folderId || "").trim())
    .filter(Boolean);
}

function settingsFolderDesktopDeleteRowHtml(candidate){
  const badges = settingsFolderCleanupBadgesHtml({
    badges: candidate?.storeBadges || ["Desktop SQLite"],
    classification: "desktop-empty-delete-eligible",
  });
  const chromeNote = candidate?.existsInChromeMirror
    ? "Chrome mirror row also exists; Chrome cleanup is separate and not performed."
    : "No Chrome mirror row detected.";
  return `
    <label style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:flex-start;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.035);border-radius:8px;padding:8px">
      <input type="checkbox" data-folder-id="${esc(candidate?.folderId || "")}" />
      <span style="display:flex;flex-direction:column;gap:4px;min-width:0">
        <span style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <strong>${esc(candidate?.name || "(unnamed)")}</strong>
          <span>${badges}</span>
        </span>
        <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.72">${esc(candidate?.folderId || "")}</span>
        <span style="font-size:12px;opacity:.78">Desktop bindings ${esc(candidate?.bindingCount || 0)} · chat rows ${(candidate?.chatsByFolder || []).length} · snapshots ${(candidate?.snapshotsByChatId || []).length} · LibraryIndex ${(candidate?.libraryRows || []).length}</span>
        <span style="font-size:12px;opacity:.78">native ${candidate?.existsInNative ? "yes" : "no"} · folder rows ${(candidate?.folderRows || []).length}</span>
        <span style="font-size:12px;opacity:.72">${esc(chromeNote)}</span>
      </span>
    </label>
  `;
}

function settingsFolderDesktopRenderDeletePanel(panel, report){
  const summary = panel?.querySelector("#wbSettingsFolderDesktopDeleteSummary");
  const list = panel?.querySelector("#wbSettingsFolderDesktopDeleteList");
  const previewEl = panel?.querySelector("#wbSettingsFolderDesktopDeletePreview");
  const eligible = settingsFolderDesktopEligibleDeleteRows(report);
  if (summary) {
    summary.textContent = STUDIO_isTauri()
      ? `Desktop SQLite only. ${eligible.length} final F5D folder(s) selectable. Chrome mirror, native folder-state, and sync folder are not modified.`
      : "Desktop empty folder cleanup is only available in Desktop Studio. Chrome mirror cleanup is separate and not performed.";
  }
  if (list) {
    list.innerHTML = eligible.length
      ? eligible.map(settingsFolderDesktopDeleteRowHtml).join("")
      : `<div style="opacity:.65;font-size:12px">${STUDIO_isTauri() ? "No zero-binding Desktop F5D folders are eligible for deletion." : "Unavailable outside Desktop Studio."}</div>`;
  }
  if (previewEl && !panel?.__h2oFolderDesktopDeletionPreview) {
    previewEl.hidden = true;
    previewEl.textContent = "";
  }
  settingsFolderDesktopUpdateDeleteControls(panel);
}

function settingsFolderDesktopValidateDeleteSelection(selectedIds, report){
  const ids = Array.from(new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!STUDIO_isTauri()) return { ok: false, error: "Desktop folder cleanup is only available in Desktop Studio.", selectedFolderIds: ids, candidates: [] };
  if (!ids.length) return { ok: false, error: "Select f5d1-test-folder-b.", selectedFolderIds: ids, candidates: [] };
  if (ids.length !== 1 || ids[0] !== FOLDER_DESKTOP_FINAL_F5D_FOLDER_ID) {
    return { ok: false, error: "P7d-d can delete only f5d1-test-folder-b.", selectedFolderIds: ids, candidates: [] };
  }
  const eligibleById = new Map(settingsFolderDesktopEligibleDeleteRows(report).map((row) => [String(row.folderId || "").trim(), row]));
  const candidates = [];
  for (const folderId of ids) {
    const candidate = eligibleById.get(folderId);
    if (!candidate) return { ok: false, error: `${folderId} is not currently eligible for Desktop empty-folder deletion.`, selectedFolderIds: ids, candidates };
    const blockers = settingsFolderDesktopDeleteBlockers(candidate);
    if (blockers.length) return { ok: false, error: `${folderId} failed Desktop deletion guards: ${blockers.join("; ")}`, selectedFolderIds: ids, candidates };
    candidates.push({
      folderId,
      name: candidate.name,
      bindingCount: settingsFolderCleanupNumber(candidate.bindingCount),
      knownChatRows: settingsFolderCleanupClone(candidate.knownChatRows || []),
      nativePresence: !!candidate.existsInNative,
      existsInChromeMirror: !!candidate.existsInChromeMirror,
      folderRows: settingsFolderCleanupClone(candidate.folderRows || []),
      chatsByFolder: settingsFolderCleanupClone(candidate.chatsByFolder || []),
      snapshotsByChatId: settingsFolderCleanupClone(candidate.snapshotsByChatId || []),
      libraryRows: settingsFolderCleanupClone(candidate.libraryRows || []),
      riskLevel: "low-review-required",
      eligibilityReason: "f5d1-test-folder-b exists exactly once, has zero SQLite bindings, no chat/snapshot/LibraryIndex dependencies, and is native-absent.",
    });
  }
  return { ok: true, selectedFolderIds: ids, candidates };
}

function settingsFolderDesktopSummaryFromFacts(facts){
  const folders = Array.isArray(facts?.folders) ? facts.folders : [];
  const f5dFolders = Array.isArray(facts?.f5dFolders) ? facts.f5dFolders : [];
  const bindingsByFolder = facts?.bindingsByFolder && typeof facts.bindingsByFolder === "object" ? facts.bindingsByFolder : {};
  const bindingCount = Object.values(bindingsByFolder).reduce((sum, values) => sum + (Array.isArray(values) ? values.length : 0), 0);
  return {
    surface: facts?.surface || (STUDIO_isTauri() ? "desktop-studio" : "chrome-studio"),
    source: facts?.source || "",
    folderCount: folders.length,
    f5dFolderCount: f5dFolders.length,
    f5dBindingCount: bindingCount,
  };
}

function settingsFolderDesktopBuildDeletePreview(selectedIds, loaded){
  const validation = settingsFolderDesktopValidateDeleteSelection(selectedIds, loaded?.report);
  if (!validation.ok) return { ok: false, error: validation.error, selectedFolderIds: validation.selectedFolderIds || [] };
  const beforeSummary = settingsFolderDesktopSummaryFromFacts(loaded?.desktopFacts);
  const remove = settingsFolderDesktopResolveRemoveMethod();
  return {
    ok: true,
    readOnly: false,
    noMutation: true,
    mutation: "preview-only",
    generatedAt: new Date().toISOString(),
    surface: "desktop-studio",
    action: "delete-empty-desktop-folders",
    targetStore: "Desktop SQLite",
    targetApi: remove.method
      ? `H2O.Studio.store.folders.${remove.method}("${FOLDER_DESKTOP_FINAL_F5D_FOLDER_ID}")`
      : `H2O.Studio.store.folders.remove("${FOLDER_DESKTOP_FINAL_F5D_FOLDER_ID}")`,
    selectedFolderIds: validation.selectedFolderIds,
    selectedFolders: validation.candidates,
    targetFolder: validation.candidates[0] || null,
    folderRow: validation.candidates[0]?.folderRows?.[0] || null,
    bindingCount: settingsFolderCleanupNumber(validation.candidates[0]?.bindingCount),
    chatDependencyCount: (validation.candidates[0]?.chatsByFolder || []).length,
    snapshotDependencyCount: (validation.candidates[0]?.snapshotsByChatId || []).length,
    libraryIndexDependencyCount: (validation.candidates[0]?.libraryRows || []).length,
    beforeDesktopFolderCount: beforeSummary.folderCount,
    predictedAfterDesktopFolderCount: Math.max(0, beforeSummary.folderCount - validation.selectedFolderIds.length),
    beforeDesktopFoldersSummary: beforeSummary,
    confirmationText: FOLDER_DESKTOP_CLEANUP_CONFIRM_TEXT,
    chromeMirrorNote: "Chrome mirror cleanup is separate and not performed.",
    nativeStateNote: "Native ChatGPT folder-state is not modified.",
  };
}

function settingsFolderDesktopStorageGetStrict(keys){
  if (!STUDIO_isTauri()) return Promise.reject(new Error("Desktop cleanup audit is available only in Desktop Studio."));
  if (!hasChromeStorage()) return Promise.reject(new Error("Desktop storage shim unavailable for cleanup audit."));
  return new Promise((resolve, reject) => {
    try {
      W.chrome.storage.local.get(keys, (result) => {
        const lastError = W.chrome?.runtime?.lastError;
        if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
        resolve(result || {});
      });
    } catch (err) {
      reject(err);
    }
  });
}

function settingsFolderDesktopStorageSetStrict(obj){
  if (!STUDIO_isTauri()) return Promise.reject(new Error("Desktop cleanup audit is available only in Desktop Studio."));
  if (!hasChromeStorage()) return Promise.reject(new Error("Desktop storage shim unavailable for cleanup audit."));
  return new Promise((resolve, reject) => {
    try {
      W.chrome.storage.local.set(obj || {}, () => {
        const lastError = W.chrome?.runtime?.lastError;
        if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
        resolve(true);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function settingsFolderDesktopAppendAudit(entry){
  const values = await settingsFolderDesktopStorageGetStrict([FOLDER_CLEANUP_AUDIT_KEY]);
  const existing = Array.isArray(values?.[FOLDER_CLEANUP_AUDIT_KEY]) ? values[FOLDER_CLEANUP_AUDIT_KEY] : [];
  const next = existing.concat([entry]).slice(-50);
  await settingsFolderDesktopStorageSetStrict({ [FOLDER_CLEANUP_AUDIT_KEY]: next });
  return next.length;
}

function settingsFolderDesktopResolveRemoveMethod(){
  const foldersStore = W.H2O?.Studio?.store?.folders;
  if (typeof foldersStore?.remove === "function") return { method: "remove", fn: foldersStore.remove.bind(foldersStore) };
  if (typeof foldersStore?.delete === "function") return { method: "delete", fn: foldersStore.delete.bind(foldersStore) };
  return { method: "", fn: null };
}

function settingsFolderDesktopUpdateDeleteControls(panel){
  const selectedIds = settingsFolderDesktopSelectedDeleteIds(panel);
  panel.__h2oFolderDesktopDeleteSelectedIds = selectedIds;
  const preview = panel?.__h2oFolderDesktopDeletionPreview;
  const previewBtn = panel?.querySelector("#wbSettingsFolderDesktopPreviewDelete");
  const copyBtn = panel?.querySelector("#wbSettingsFolderDesktopCopyDeletePlan");
  const confirmInput = panel?.querySelector("#wbSettingsFolderDesktopDeleteConfirm");
  const deleteBtn = panel?.querySelector("#wbSettingsFolderDesktopDeleteSelected");
  const confirmationOk = String(confirmInput?.value || "") === FOLDER_DESKTOP_CLEANUP_CONFIRM_TEXT;
  const selectedMatchesPreview = !!preview?.ok
    && JSON.stringify((preview.selectedFolderIds || []).slice().sort()) === JSON.stringify(selectedIds.slice().sort());
  if (previewBtn) previewBtn.disabled = !STUDIO_isTauri() || selectedIds.length === 0;
  if (copyBtn) copyBtn.disabled = !preview?.ok;
  if (deleteBtn) deleteBtn.disabled = !STUDIO_isTauri() || !selectedMatchesPreview || !confirmationOk;
}

async function refreshSettingsFolderDesktopReview(panel, seed = null){
  if (!panel) return null;
  const summary = panel.querySelector("#wbSettingsFolderDesktopReviewSummary");
  const copyBtn = panel.querySelector("#wbSettingsFolderDesktopReviewCopy");
  if (summary) summary.textContent = "Refreshing read-only Desktop cleanup review…";
  if (copyBtn) copyBtn.disabled = true;
  const loaded = await settingsFolderDesktopLoadReviewInputs(seed);
  panel.__h2oFolderDesktopReviewReport = loaded.report;
  settingsFolderDesktopRenderReport(panel, loaded.report);
  refreshSettingsFolderDesktopOrphanBindingReview(panel, { selfCheck: loaded.selfCheck })
    .catch((err) => settingsFolderParityLog(panel, "Orphan binding review failed.\n" + String(err && (err.stack || err.message || err))));
  return loaded.report;
}

async function copySettingsFolderDesktopReviewReport(panel){
  if (!panel) return;
  let report = panel.__h2oFolderDesktopReviewReport;
  if (!report) report = await refreshSettingsFolderDesktopReview(panel);
  const text = JSON.stringify(report || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Desktop cleanup review report JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; Desktop cleanup review report printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_DESKTOP_FOLDER_CLEANUP_REVIEW_REPORT", report); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; Desktop cleanup review report printed to console as H2O_DESKTOP_FOLDER_CLEANUP_REVIEW_REPORT.");
}

async function refreshSettingsFolderDesktopOrphanBindingReview(panel, seed = null){
  if (!panel) return null;
  const summary = panel.querySelector("#wbSettingsFolderDesktopOrphanBindingSummary");
  const copyBtn = panel.querySelector("#wbSettingsFolderDesktopOrphanBindingCopy");
  if (summary) summary.textContent = "Refreshing read-only orphan binding review…";
  if (copyBtn) copyBtn.disabled = true;
  const report = await settingsFolderDesktopLoadOrphanBindingReview(seed);
  if (settingsFolderDesktopOrphanBindingRemovalBlockers(report).length) {
    FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview = null;
  }
  panel.__h2oFolderDesktopOrphanBindingReport = report;
  settingsFolderDesktopRenderOrphanBindingReport(panel, report);
  return report;
}

async function copySettingsFolderDesktopOrphanBindingReport(panel){
  if (!panel) return;
  let report = panel.__h2oFolderDesktopOrphanBindingReport;
  if (!report) report = await refreshSettingsFolderDesktopOrphanBindingReview(panel);
  const text = JSON.stringify(report || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Orphan Desktop binding review report JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; orphan binding report printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_ORPHAN_BINDING_REVIEW_REPORT", report); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; orphan binding report printed to console as H2O_ORPHAN_BINDING_REVIEW_REPORT.");
}

async function previewSettingsFolderDesktopOrphanBindingRemoval(panel){
  if (!panel) return null;
  const selected = settingsFolderDesktopOrphanBindingSelected(panel);
  const report = await settingsFolderDesktopLoadOrphanBindingReview();
  const preview = settingsFolderDesktopBuildOrphanBindingRemovalPreview(selected, report);
  FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.selected = !!selected;
  FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview = preview.ok ? preview : null;
  FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.status = preview.ok ? "Removal preview is ready." : "Removal preview is blocked.";
  panel.__h2oFolderDesktopOrphanBindingReport = report;
  panel.__h2oFolderDesktopOrphanBindingRemovalPreview = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview;
  settingsFolderDesktopRenderOrphanBindingReport(panel, report);
  if (selected) {
    const box = Array.from(panel.querySelectorAll("#wbSettingsFolderDesktopOrphanBindingRemoveList input[data-chat-id][data-folder-id]") || [])
      .find((input) => String(input.dataset.chatId || "").trim() === selected.chatId && String(input.dataset.folderId || "").trim() === selected.folderId);
    if (box) box.checked = true;
  }
  const previewEl = panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemovePreview");
  if (previewEl) {
    previewEl.hidden = false;
    previewEl.textContent = JSON.stringify(preview, null, 2);
  }
  if (!preview.ok) settingsFolderParityLog(panel, "Orphan binding removal preview blocked.\n" + String(preview.error || "Unknown guard failure"));
  settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
  return preview;
}

async function copySettingsFolderDesktopOrphanBindingRemovalPlan(panel){
  if (!panel) return;
  let preview = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview || panel.__h2oFolderDesktopOrphanBindingRemovalPreview;
  if (!preview) preview = await previewSettingsFolderDesktopOrphanBindingRemoval(panel);
  const text = JSON.stringify(preview || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Orphan binding removal plan JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; orphan binding removal plan printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_ORPHAN_BINDING_REMOVE_PLAN", preview); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; orphan binding removal plan printed to console as H2O_ORPHAN_BINDING_REMOVE_PLAN.");
}

async function removeSelectedOrphanDesktopBinding(panel){
  if (!panel) return;
  const previewEl = panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemovePreview");
  const confirmInput = panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveConfirm");
  if (confirmInput) FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation = String(confirmInput.value || "");
  const confirmValue = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation;
  if (confirmValue !== FOLDER_DESKTOP_ORPHAN_BINDING_CONFIRM_TEXT) {
    settingsFolderParityLog(panel, "Orphan binding removal blocked. Confirmation text does not match.");
    settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
    return;
  }
  const selected = settingsFolderDesktopOrphanBindingSelected(panel);
  const existingPreview = FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview || panel.__h2oFolderDesktopOrphanBindingRemovalPreview;
  const previewMatchesSelection = !!existingPreview?.ok
    && !!selected
    && (existingPreview.selectedBindings || []).length === 1
    && existingPreview.selectedBindings[0]?.chatId === selected.chatId
    && existingPreview.selectedBindings[0]?.folderId === selected.folderId;
  if (!previewMatchesSelection) {
    settingsFolderParityLog(panel, "Orphan binding removal blocked. Generate a fresh removal preview for the selected binding first.");
    settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
    return;
  }

  const beforeReport = await settingsFolderDesktopLoadOrphanBindingReview();
  const validation = settingsFolderDesktopValidateOrphanBindingRemovalSelection(selected, beforeReport);
  if (!validation.ok) {
    settingsFolderParityLog(panel, "Orphan binding removal aborted before mutation.\n" + String(validation.error || "Guard failed"));
    settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
    return;
  }
  const unbind = settingsFolderDesktopResolveUnbindMethod();
  if (typeof unbind.fn !== "function") {
    settingsFolderParityLog(panel, "Orphan binding removal aborted before mutation. H2O.Studio.store.folders.unbindChat is unavailable.");
    settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
    return;
  }

  const lookups = beforeReport.review?.lookupResults || {};
  const pendingAudit = {
    timestamp: new Date().toISOString(),
    surface: "desktop-studio",
    action: "remove-orphan-desktop-folder-binding",
    selectedBindings: validation.selectedBindings,
    beforeSelfCheck: beforeReport.selfCheck || null,
    beforeBindingRows: settingsFolderCleanupClone(lookups.exactBinding?.rows || []),
    beforeFolderRows: settingsFolderCleanupClone(lookups.folder?.rows || []),
    beforeChatLookup: {
      chatsById: settingsFolderCleanupClone(lookups.chatsById?.rows || []),
      chatsBySourceId: settingsFolderCleanupClone(lookups.chatsBySourceId?.rows || []),
      snapshots: settingsFolderCleanupClone(lookups.snapshots?.rows || []),
      libraryIndex: settingsFolderCleanupClone(lookups.registryRows || []),
      chatBindings: settingsFolderCleanupClone(lookups.chatBindings?.rows || []),
      folderBindings: settingsFolderCleanupClone(lookups.folderBindings?.rows || []),
    },
    result: "pending",
    errors: [],
  };

  try {
    await settingsFolderDesktopAppendAudit(pendingAudit);
  } catch (auditErr) {
    settingsFolderParityLog(panel, "Orphan binding removal aborted before mutation. Cleanup audit could not be written.\n" + String(auditErr && (auditErr.stack || auditErr.message || auditErr)));
    settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
    return;
  }

  let resultAudit = {
    ...pendingAudit,
    timestamp: new Date().toISOString(),
    beforeChatLookup: null,
  };
  try {
    const target = settingsFolderDesktopTargetOrphanBinding();
    const ok = await unbind.fn(target.folderId, target.chatId);
    if (!ok) throw new Error(`store.folders.${unbind.method} returned false for ${target.folderId}/${target.chatId}`);
    try { W.H2O?.LibraryWorkspace?._bustCaches?.("folder-desktop-remove-orphan-binding"); } catch {}
    try { await W.H2O?.LibraryIndex?.refresh?.("folder-desktop-remove-orphan-binding"); } catch {}
    const afterReport = await settingsFolderDesktopLoadOrphanBindingReview();
    resultAudit = {
      ...resultAudit,
      result: "ok",
      afterSelfCheck: afterReport.selfCheck || null,
      afterBindingRows: settingsFolderCleanupClone(afterReport.review?.lookupResults?.exactBinding?.rows || []),
      errors: [],
    };
    try { await settingsFolderDesktopAppendAudit(resultAudit); }
    catch (auditErr) {
      resultAudit.errors = ["Result audit append failed: " + String(auditErr && (auditErr.message || auditErr))];
    }
    const result = {
      ok: true,
      action: "remove-orphan-desktop-folder-binding",
      selectedBindings: validation.selectedBindings,
      beforeBindingRows: pendingAudit.beforeBindingRows,
      afterBindingRows: resultAudit.afterBindingRows,
      folderStillExists: !!afterReport.review?.folderExists,
      auditWarning: resultAudit.errors[0] || "",
      auditKey: FOLDER_CLEANUP_AUDIT_KEY,
      folderRowNote: "The folder row was not deleted.",
      chromeMirrorNote: "Chrome mirror cleanup is separate and was not performed.",
      nativeStateNote: "Native ChatGPT folder-state was not modified.",
    };
    if (previewEl) {
      previewEl.hidden = false;
      previewEl.textContent = JSON.stringify(result, null, 2);
    }
    settingsFolderParityLog(panel, "Selected orphan Desktop binding removed. Folder row, Chrome mirror, native folder-state, and sync folder were not modified.");
    FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.selected = false;
    FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation = "";
    FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview = null;
    FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.status = "Binding removal completed.";
    panel.__h2oFolderDesktopOrphanBindingRemovalPreview = null;
    panel.__h2oFolderDesktopOrphanBindingSelected = null;
    if (confirmInput) confirmInput.value = "";
    await refreshSettingsFolderParity(panel);
    const refreshedPreviewEl = panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemovePreview");
    if (refreshedPreviewEl) {
      refreshedPreviewEl.hidden = false;
      refreshedPreviewEl.textContent = JSON.stringify(result, null, 2);
    }
  } catch (err) {
    resultAudit = {
      ...resultAudit,
      result: "failed",
      afterSelfCheck: null,
      afterBindingRows: null,
      errors: [String(err && (err.stack || err.message || err))],
    };
    try { await settingsFolderDesktopAppendAudit(resultAudit); } catch {}
    settingsFolderParityLog(panel, "Orphan binding removal failed after pending audit.\n" + String(err && (err.stack || err.message || err)));
    throw err;
  } finally {
    settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
  }
}

async function previewSettingsFolderDesktopDeletion(panel){
  if (!panel) return null;
  const previewEl = panel.querySelector("#wbSettingsFolderDesktopDeletePreview");
  const selectedIds = settingsFolderDesktopSelectedDeleteIds(panel);
  const loaded = await settingsFolderDesktopLoadReviewInputs();
  const preview = settingsFolderDesktopBuildDeletePreview(selectedIds, loaded);
  panel.__h2oFolderDesktopReviewReport = loaded.report;
  panel.__h2oFolderDesktopDeletionPreview = preview.ok ? preview : null;
  settingsFolderDesktopRenderReport(panel, loaded.report);
  const selectedSet = new Set(selectedIds);
  Array.from(panel.querySelectorAll("#wbSettingsFolderDesktopDeleteList input[data-folder-id]") || [])
    .forEach((box) => { box.checked = selectedSet.has(String(box.dataset.folderId || "").trim()); });
  if (previewEl) {
    previewEl.hidden = false;
    previewEl.textContent = JSON.stringify(preview, null, 2);
  }
  if (!preview.ok) settingsFolderParityLog(panel, "Desktop deletion preview blocked.\n" + String(preview.error || "Unknown guard failure"));
  settingsFolderDesktopUpdateDeleteControls(panel);
  return preview;
}

async function copySettingsFolderDesktopDeletionPlan(panel){
  if (!panel) return;
  let preview = panel.__h2oFolderDesktopDeletionPreview;
  if (!preview) preview = await previewSettingsFolderDesktopDeletion(panel);
  const text = JSON.stringify(preview || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Desktop deletion plan JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; Desktop deletion plan printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_DESKTOP_FOLDER_DELETE_PLAN", preview); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; Desktop deletion plan printed to console as H2O_DESKTOP_FOLDER_DELETE_PLAN.");
}

async function deleteSelectedEmptyDesktopFolders(panel){
  if (!panel) return;
  const previewEl = panel.querySelector("#wbSettingsFolderDesktopDeletePreview");
  const confirmValue = String(panel.querySelector("#wbSettingsFolderDesktopDeleteConfirm")?.value || "");
  if (confirmValue !== FOLDER_DESKTOP_CLEANUP_CONFIRM_TEXT) {
    settingsFolderParityLog(panel, "Desktop deletion blocked. Confirmation text does not match.");
    settingsFolderDesktopUpdateDeleteControls(panel);
    return;
  }
  const selectedIds = settingsFolderDesktopSelectedDeleteIds(panel);
  const existingPreview = panel.__h2oFolderDesktopDeletionPreview;
  const previewMatchesSelection = !!existingPreview?.ok
    && JSON.stringify((existingPreview.selectedFolderIds || []).slice().sort()) === JSON.stringify(selectedIds.slice().sort());
  if (!previewMatchesSelection) {
    settingsFolderParityLog(panel, "Desktop deletion blocked. Generate a fresh Desktop deletion preview for the selected folders first.");
    settingsFolderDesktopUpdateDeleteControls(panel);
    return;
  }

  const loaded = await settingsFolderDesktopLoadReviewInputs();
  const validation = settingsFolderDesktopValidateDeleteSelection(selectedIds, loaded.report);
  if (!validation.ok) {
    settingsFolderParityLog(panel, "Desktop deletion aborted before mutation.\n" + String(validation.error || "Guard failed"));
    settingsFolderDesktopUpdateDeleteControls(panel);
    return;
  }
  const remove = settingsFolderDesktopResolveRemoveMethod();
  if (typeof remove.fn !== "function") {
    settingsFolderParityLog(panel, "Desktop deletion aborted before mutation. H2O.Studio.store.folders.remove/delete is unavailable.");
    settingsFolderDesktopUpdateDeleteControls(panel);
    return;
  }

  const beforeSummary = settingsFolderDesktopSummaryFromFacts(loaded.desktopFacts);
  const pendingAudit = {
    timestamp: new Date().toISOString(),
    surface: "desktop-studio",
    action: "delete-empty-desktop-folders",
    selectedFolderIds: validation.selectedFolderIds,
    selectedFolders: validation.candidates,
    beforeSelfCheck: loaded.selfCheck,
    beforeDesktopFolders: settingsFolderCleanupClone(loaded.desktopFacts?.f5dFolders || []),
    beforeDesktopBindings: settingsFolderCleanupClone(loaded.desktopFacts?.bindingsByFolder || {}),
    beforeCandidateModel: settingsFolderCleanupClone(loaded.report),
    result: "pending",
    afterSelfCheck: null,
    afterDesktopFolders: null,
    afterDesktopBindings: null,
    errors: [],
  };

  try {
    await settingsFolderDesktopAppendAudit(pendingAudit);
  } catch (auditErr) {
    settingsFolderParityLog(panel, "Desktop deletion aborted before mutation. Cleanup audit could not be written.\n" + String(auditErr && (auditErr.stack || auditErr.message || auditErr)));
    settingsFolderDesktopUpdateDeleteControls(panel);
    return;
  }

  let resultAudit = {
    ...pendingAudit,
    timestamp: new Date().toISOString(),
    beforeCandidateModel: null,
    beforeDesktopFoldersSummary: beforeSummary,
  };
  try {
    const removed = [];
    for (const folderId of validation.selectedFolderIds) {
      const ok = await remove.fn(folderId);
      if (!ok) throw new Error(`store.folders.${remove.method} returned false for ${folderId}`);
      removed.push(folderId);
    }
    try { W.H2O?.LibraryWorkspace?._bustCaches?.("folder-desktop-delete-empty-f5d-folders"); } catch {}
    try { await W.H2O?.LibraryIndex?.refresh?.("folder-desktop-delete-empty-f5d-folders"); } catch {}
    const afterLoaded = await settingsFolderDesktopLoadReviewInputs();
    resultAudit = {
      ...resultAudit,
      result: "ok",
      removedFolderIds: removed,
      afterSelfCheck: afterLoaded.selfCheck,
      afterDesktopFolders: settingsFolderCleanupClone(afterLoaded.desktopFacts?.f5dFolders || []),
      afterDesktopBindings: settingsFolderCleanupClone(afterLoaded.desktopFacts?.bindingsByFolder || {}),
      afterDesktopFoldersSummary: settingsFolderDesktopSummaryFromFacts(afterLoaded.desktopFacts),
      errors: [],
    };
    try { await settingsFolderDesktopAppendAudit(resultAudit); }
    catch (auditErr) {
      resultAudit.errors = ["Result audit append failed: " + String(auditErr && (auditErr.message || auditErr))];
    }
    const result = {
      ok: true,
      action: "delete-empty-desktop-folders",
      selectedFolderIds: validation.selectedFolderIds,
      removedFolderIds: removed,
      beforeDesktopFoldersSummary: beforeSummary,
      afterDesktopFoldersSummary: resultAudit.afterDesktopFoldersSummary,
      auditWarning: resultAudit.errors[0] || "",
      auditKey: FOLDER_CLEANUP_AUDIT_KEY,
      chromeMirrorNote: "Chrome mirror cleanup is separate and was not performed.",
      nativeStateNote: "Native ChatGPT folder-state was not modified.",
    };
    if (previewEl) {
      previewEl.hidden = false;
      previewEl.textContent = JSON.stringify(result, null, 2);
    }
    settingsFolderParityLog(panel, "Selected empty Desktop F5D folder(s) deleted. Chrome mirror, native folder-state, and sync folder were not modified.");
    panel.__h2oFolderDesktopDeletionPreview = null;
    panel.__h2oFolderDesktopDeleteSelectedIds = [];
    const input = panel.querySelector("#wbSettingsFolderDesktopDeleteConfirm");
    if (input) input.value = "";
    await refreshSettingsFolderParity(panel);
    const refreshedPreviewEl = panel.querySelector("#wbSettingsFolderDesktopDeletePreview");
    if (refreshedPreviewEl) {
      refreshedPreviewEl.hidden = false;
      refreshedPreviewEl.textContent = JSON.stringify(result, null, 2);
    }
  } catch (err) {
    resultAudit = {
      ...resultAudit,
      result: "failed",
      afterSelfCheck: null,
      afterDesktopFolders: null,
      afterDesktopBindings: null,
      errors: [String(err && (err.stack || err.message || err))],
    };
    try { await settingsFolderDesktopAppendAudit(resultAudit); } catch {}
    settingsFolderParityLog(panel, "Desktop deletion failed after pending audit.\n" + String(err && (err.stack || err.message || err)));
    throw err;
  } finally {
    settingsFolderDesktopUpdateDeleteControls(panel);
  }
}

function settingsFolderCleanupUpdateDeleteControls(panel){
  const chromeSurface = settingsFolderCleanupIsChromeSurface();
  const selectedIds = settingsFolderCleanupSelectedIds(panel);
  panel.__h2oFolderCleanupDeleteSelectedIds = selectedIds;
  const preview = panel?.__h2oFolderCleanupDeletionPreview;
  const previewBtn = panel?.querySelector("#wbSettingsFolderCleanupPreview");
  const copyBtn = panel?.querySelector("#wbSettingsFolderCleanupCopyDeletePlan");
  const confirmInput = panel?.querySelector("#wbSettingsFolderCleanupConfirm");
  const deleteBtn = panel?.querySelector("#wbSettingsFolderCleanupDeleteSelected");
  const confirmationOk = String(confirmInput?.value || "") === FOLDER_CLEANUP_CONFIRM_TEXT;
  const selectedMatchesPreview = !!preview?.ok
    && JSON.stringify((preview.selectedFolderIds || []).slice().sort()) === JSON.stringify(selectedIds.slice().sort());
  if (previewBtn) previewBtn.disabled = !chromeSurface || selectedIds.length === 0;
  if (copyBtn) copyBtn.disabled = !preview?.ok;
  if (deleteBtn) deleteBtn.disabled = !chromeSurface || !selectedMatchesPreview || !confirmationOk;
}

async function refreshSettingsFolderCleanupReview(panel, seed = null){
  if (!panel) return null;
  const summary = panel.querySelector("#wbSettingsFolderCleanupReviewSummary");
  const copyBtn = panel.querySelector("#wbSettingsFolderCleanupReviewCopy");
  const parity = W.H2O?.Library?.FolderParity;
  if (!parity || typeof parity.selfCheck !== "function" || typeof parity.getDisplayModel !== "function") {
    if (summary) summary.textContent = "Cleanup Candidate Review unavailable.";
    if (copyBtn) copyBtn.disabled = true;
    return null;
  }
  if (summary) summary.textContent = "Refreshing review-only cleanup candidates…";
  if (copyBtn) copyBtn.disabled = true;
  const loaded = seed?.selfCheck
    ? { selfCheck: seed.selfCheck, displayModel: await parity.getDisplayModel({ fresh: true }) }
    : await settingsFolderCleanupLoadReviewInputs();
  const plan = loaded.plan || settingsFolderCleanupBuildReviewPlan(loaded.selfCheck, loaded.displayModel);
  panel.__h2oFolderCleanupReviewPlan = plan;
  settingsFolderCleanupRenderPlan(panel, plan);
  await refreshSettingsFolderConflictReview(panel, {
    selfCheck: loaded.selfCheck,
    displayModel: loaded.displayModel,
  }).catch((err) => settingsFolderParityLog(panel, "Folder conflict review failed.\n" + String(err && (err.stack || err.message || err))));
  await refreshSettingsFolderDesktopReview(panel, {
    selfCheck: loaded.selfCheck,
    displayModel: loaded.displayModel,
  }).catch((err) => settingsFolderParityLog(panel, "Desktop cleanup review failed.\n" + String(err && (err.stack || err.message || err))));
  return plan;
}

async function refreshSettingsFolderParity(panel){
  if (!panel) return;
  const summary = panel.querySelector("#wbSettingsFolderParitySummary");
  const statusEl = panel.querySelector("#wbSettingsFolderParityStatus");
  const listsEl = panel.querySelector("#wbSettingsFolderParityLists");
  const warnEl = panel.querySelector("#wbSettingsFolderParityWarn");
  const copyBtn = panel.querySelector("#wbSettingsFolderParityCopy");
  const parity = W.H2O?.Library?.FolderParity;
  if (!parity || typeof parity.diagnose !== "function") {
    if (summary) summary.textContent = "Folder parity diagnostics unavailable.";
    if (statusEl) statusEl.innerHTML = settingsSyncRowsHtml([["Status", "unavailable"]]);
    if (copyBtn) copyBtn.disabled = true;
    return;
  }

  if (summary) summary.textContent = "Refreshing read-only folder parity diagnostics…";
  if (copyBtn) copyBtn.disabled = true;
  const report = await parity.diagnose({ fresh: true });
  const selfCheck = typeof parity.selfCheck === "function"
    ? await parity.selfCheck({ report })
    : null;
  panel.__h2oFolderParityReport = { selfCheck, diagnostics: report };

  const rows = [
    ["Surface", report.surface || ""],
    ["Self-check severity", selfCheck?.severity || report.riskLevel || ""],
    ["Self-check ok", selfCheck ? String(!!selfCheck.ok) : "unavailable"],
    ["Risk", report.riskLevel || ""],
    ["Native canonical folders", report.canonicalFolderCount],
    ["Local mirror folders", report.localFolderCount],
    ["Canonical memberships", report.canonicalBindingCount],
    ["Local bindings", report.localBindingCount],
    ["Known Studio rows", report.knownStudioRowTotal],
    ["Orphan memberships", report.orphanBindingCount],
    ["Canonical source", report.canonicalSource || ""],
  ];
  if (statusEl) statusEl.innerHTML = settingsSyncRowsHtml(rows);
  if (summary) {
    const severity = String(selfCheck?.severity || report.riskLevel || "");
    summary.textContent = severity === "ok"
      ? "Folder parity self-check passed. No cleanup performed."
      : `Folder parity self-check: ${severity || "unknown"}. No cleanup performed.`;
  }
  if (listsEl) {
    listsEl.innerHTML = `
      <div><strong>Checks needing attention:</strong> ${settingsFolderParityChecksHtml(selfCheck)}</div>
      <div><strong>Duplicate groups:</strong> ${settingsFolderParityNames(report.duplicateGroups)}</div>
      <div><strong>Test folder candidates:</strong> ${settingsFolderParityNames(report.testFolderCandidates)}</div>
      <div><strong>Missing canonical folders:</strong> ${settingsFolderParityNames(report.missingCanonicalFolders)}</div>
      <div><strong>Extra local folders:</strong> ${settingsFolderParityNames(report.extraLocalFolders)}</div>
      <div><strong>Recommended next step:</strong> ${esc(selfCheck?.recommendedNextStep || report.recommendedNextStep || "")}</div>
    `;
  }
  if (warnEl) {
    const warnings = Array.isArray(report.warnings) ? report.warnings : [];
    warnEl.textContent = warnings[0] || "Read-only. No cleanup performed. Cleanup requires reviewed approval.";
  }
  if (copyBtn) copyBtn.disabled = false;
  await refreshSettingsFolderCleanupReview(panel, { selfCheck, report });
}

async function copySettingsFolderParityReport(panel){
  if (!panel) return;
  let report = panel.__h2oFolderParityReport;
  if (!report) {
    await refreshSettingsFolderParity(panel);
    report = panel.__h2oFolderParityReport;
  }
  const text = JSON.stringify(report || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Folder parity report JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; report printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_FOLDER_PARITY_REPORT", report); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; folder parity report printed to console as H2O_FOLDER_PARITY_REPORT.");
}

async function copySettingsFolderCleanupReviewPlan(panel){
  if (!panel) return;
  let plan = panel.__h2oFolderCleanupReviewPlan;
  if (!plan) plan = await refreshSettingsFolderCleanupReview(panel);
  const text = JSON.stringify(plan || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Folder cleanup review plan JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; cleanup review plan printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_FOLDER_CLEANUP_REVIEW_PLAN", plan); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; cleanup review plan printed to console as H2O_FOLDER_CLEANUP_REVIEW_PLAN.");
}

async function previewSettingsFolderCleanupDeletion(panel){
  if (!panel) return null;
  const previewEl = panel.querySelector("#wbSettingsFolderCleanupDeletePreview");
  const selectedIds = settingsFolderCleanupSelectedIds(panel);
  const loaded = await settingsFolderCleanupLoadReviewInputs();
  const mirror = await settingsFolderCleanupReadChromeMirror();
  const preview = settingsFolderCleanupBuildDeletionPreview(selectedIds, loaded.plan, mirror);
  panel.__h2oFolderCleanupReviewPlan = loaded.plan;
  panel.__h2oFolderCleanupDeletionPreview = preview.ok ? preview : null;
  if (previewEl) {
    previewEl.hidden = false;
    previewEl.textContent = JSON.stringify(preview, null, 2);
  }
  if (!preview.ok) settingsFolderParityLog(panel, "Folder cleanup preview blocked.\n" + String(preview.error || "Unknown guard failure"));
  settingsFolderCleanupUpdateDeleteControls(panel);
  return preview;
}

async function copySettingsFolderCleanupDeletionPlan(panel){
  if (!panel) return;
  let preview = panel.__h2oFolderCleanupDeletionPreview;
  if (!preview) preview = await previewSettingsFolderCleanupDeletion(panel);
  const text = JSON.stringify(preview || {}, null, 2);
  try {
    if (W.navigator?.clipboard?.writeText) {
      await W.navigator.clipboard.writeText(text);
      settingsFolderParityLog(panel, "Folder cleanup deletion plan JSON copied to clipboard.");
      return;
    }
  } catch (err) {
    settingsFolderParityLog(panel, "Clipboard copy failed; deletion plan printed to console.\n" + String(err && (err.message || err)));
  }
  try { console.log("H2O_FOLDER_CLEANUP_DELETE_PLAN", preview); } catch {}
  settingsFolderParityLog(panel, "Clipboard unavailable; deletion plan printed to console as H2O_FOLDER_CLEANUP_DELETE_PLAN.");
}

async function deleteSelectedSafeChromeMirrorFolders(panel){
  if (!panel) return;
  const previewEl = panel.querySelector("#wbSettingsFolderCleanupDeletePreview");
  const confirmValue = String(panel.querySelector("#wbSettingsFolderCleanupConfirm")?.value || "");
  if (confirmValue !== FOLDER_CLEANUP_CONFIRM_TEXT) {
    settingsFolderParityLog(panel, "Deletion blocked. Confirmation text does not match.");
    settingsFolderCleanupUpdateDeleteControls(panel);
    return;
  }
  const selectedIds = settingsFolderCleanupSelectedIds(panel);
  const existingPreview = panel.__h2oFolderCleanupDeletionPreview;
  const previewMatchesSelection = !!existingPreview?.ok
    && JSON.stringify((existingPreview.selectedFolderIds || []).slice().sort()) === JSON.stringify(selectedIds.slice().sort());
  if (!previewMatchesSelection) {
    settingsFolderParityLog(panel, "Deletion blocked. Generate a fresh deletion preview for the selected folders first.");
    settingsFolderCleanupUpdateDeleteControls(panel);
    return;
  }
  const loaded = await settingsFolderCleanupLoadReviewInputs();
  const mirror = await settingsFolderCleanupReadChromeMirror();
  const validation = settingsFolderCleanupValidateDeletionSelection(selectedIds, loaded.plan, mirror);
  if (!validation.ok) {
    settingsFolderParityLog(panel, "Deletion aborted before mutation.\n" + String(validation.error || "Guard failed"));
    settingsFolderCleanupUpdateDeleteControls(panel);
    return;
  }

  const beforeSummary = settingsFolderCleanupFolderStateSummary(mirror.state);
  const pendingAudit = {
    timestamp: new Date().toISOString(),
    surface: "chrome-studio",
    action: "delete-empty-chrome-mirror-folders",
    selectedFolderIds: validation.selectedFolderIds,
    selectedFolders: validation.candidates,
    beforeSelfCheck: loaded.selfCheck,
    beforeFolderStateSummary: beforeSummary,
    beforeFolderStateSnapshot: settingsFolderCleanupClone(mirror.state),
    result: "pending",
    afterSelfCheck: null,
    afterFolderStateSummary: null,
    errors: [],
  };

  await settingsFolderCleanupAppendAudit(pendingAudit);

  let resultAudit = {
    ...pendingAudit,
    timestamp: new Date().toISOString(),
    beforeFolderStateSnapshot: null,
  };
  try {
    const nextState = settingsFolderCleanupBuildNextState(mirror, validation.selectedFolderIds);
    await settingsFolderCleanupChromeSetStrict({ [FOLDER_STATE_DATA_KEY]: nextState });
    try { W.H2O?.LibraryWorkspace?._bustCaches?.("folder-cleanup-delete-empty-chrome-mirror-folders"); } catch {}
    try { await W.H2O?.LibraryIndex?.refresh?.("folder-cleanup-delete-empty-chrome-mirror-folders"); } catch {}
    const afterLoaded = await settingsFolderCleanupLoadReviewInputs();
    const afterMirror = await settingsFolderCleanupReadChromeMirror();
    resultAudit = {
      ...resultAudit,
      result: "ok",
      afterSelfCheck: afterLoaded.selfCheck,
      afterFolderStateSummary: settingsFolderCleanupFolderStateSummary(afterMirror.state),
      errors: [],
    };
    try { await settingsFolderCleanupAppendAudit(resultAudit); }
    catch (auditErr) {
      resultAudit.errors = ["Result audit append failed: " + String(auditErr && (auditErr.message || auditErr))];
    }
    const result = {
      ok: true,
      action: "delete-empty-chrome-mirror-folders",
      selectedFolderIds: validation.selectedFolderIds,
      beforeFolderStateSummary: beforeSummary,
      afterFolderStateSummary: resultAudit.afterFolderStateSummary,
      auditWarning: resultAudit.errors[0] || "",
      auditKey: FOLDER_CLEANUP_AUDIT_KEY,
    };
    if (previewEl) {
      previewEl.hidden = false;
      previewEl.textContent = JSON.stringify(result, null, 2);
    }
    settingsFolderParityLog(panel, "Selected safe empty Chrome mirror folder(s) deleted. Native folders and Desktop SQLite were not modified.");
    panel.__h2oFolderCleanupDeletionPreview = null;
    panel.__h2oFolderCleanupDeleteSelectedIds = [];
    const input = panel.querySelector("#wbSettingsFolderCleanupConfirm");
    if (input) input.value = "";
    await refreshSettingsFolderParity(panel);
    const refreshedPreviewEl = panel.querySelector("#wbSettingsFolderCleanupDeletePreview");
    if (refreshedPreviewEl) {
      refreshedPreviewEl.hidden = false;
      refreshedPreviewEl.textContent = JSON.stringify(result, null, 2);
    }
  } catch (err) {
    resultAudit = {
      ...resultAudit,
      result: "failed",
      afterSelfCheck: null,
      afterFolderStateSummary: null,
      errors: [String(err && (err.stack || err.message || err))],
    };
    try { await settingsFolderCleanupAppendAudit(resultAudit); } catch {}
    settingsFolderParityLog(panel, "Deletion failed after pending audit.\n" + String(err && (err.stack || err.message || err)));
    throw err;
  } finally {
    settingsFolderCleanupUpdateDeleteControls(panel);
  }
}

function settingsSyncLog(panel, message){
  const log = panel && panel.querySelector("#wbSettingsSyncLog");
  if (!log) return;
  log.hidden = false;
  log.textContent = String(message || "");
}

/* Phase I — persist the last-picked folder-state JSON path so the
 * import input does not always default to the runbook example path.
 * Storage backend: chrome.storage.local (callback API; shimmed onto
 * localStorage in Tauri via platform.tauri.js, so the same key works
 * in MV3 and Desktop without branching). Self-contained dedicated
 * key — does NOT touch the folder-sync config schema. Read happens
 * once at Settings panel first-render; writes happen on successful
 * picker selection and on Import-folder-state click (best-effort
 * persistence so a typed path is remembered too). All operations
 * are best-effort: any storage failure is swallowed and the UI
 * falls back to the template default. */
const STUDIO_SETTINGS_FOLDER_STATE_LAST_PATH_KEY = "h2o:studio:settings:folder-state-import:last-path:v1";

function STUDIO_settingsReadFolderStateLastPath(){
  return new Promise((resolve) => {
    try {
      if (!W.chrome || !W.chrome.storage || !W.chrome.storage.local) { resolve(""); return; }
      W.chrome.storage.local.get([STUDIO_SETTINGS_FOLDER_STATE_LAST_PATH_KEY], (items) => {
        try {
          const raw = items && items[STUDIO_SETTINGS_FOLDER_STATE_LAST_PATH_KEY];
          resolve(typeof raw === "string" ? raw : "");
        } catch (_) { resolve(""); }
      });
    } catch (_) { resolve(""); }
  });
}

function STUDIO_settingsWriteFolderStateLastPath(path){
  return new Promise((resolve) => {
    try {
      const trimmed = String(path || "").trim();
      if (!trimmed) { resolve(); return; }
      if (!W.chrome || !W.chrome.storage || !W.chrome.storage.local) { resolve(); return; }
      const obj = {}; obj[STUDIO_SETTINGS_FOLDER_STATE_LAST_PATH_KEY] = trimmed;
      W.chrome.storage.local.set(obj, () => resolve());
    } catch (_) { resolve(); }
  });
}

function settingsSummarizeResult(result){
  if (!result || typeof result !== "object") return String(result ?? "");
  const lines = [
    `ok: ${!!result.ok}`,
    `status: ${result.status || "(none)"}`,
  ];
  if (result.path) lines.push(`path: ${result.path}`);
  if (result.bytes) lines.push(`bytes: ${result.bytes}${settingsFormatBytes(result.bytes) ? ` (${settingsFormatBytes(result.bytes)})` : ""}`);
  if (result.chatCount != null) lines.push(`chats: ${result.chatCount}`);
  if (result.snapshotCount != null) lines.push(`snapshots: ${result.snapshotCount}`);
  if (result.turnCount != null) lines.push(`turns: ${result.turnCount}`);
  if (result.importedChats != null) lines.push(`importedChats: ${result.importedChats}`);
  if (result.importedSnapshots != null) lines.push(`importedSnapshots: ${result.importedSnapshots}`);
  if (result.skipped != null) lines.push(`skipped: ${result.skipped}`);
  if (result.rowsAfter != null) lines.push(`rowsAfter: ${result.rowsAfter}`);
  /* Phase E — folder-state import wrapper fields (importFromFile return).
   * All additive: any non-folder-state caller of this summarizer simply
   * lacks these fields and the branches are skipped. */
  if (result.routedVia) lines.push(`routedVia: ${result.routedVia}`);
  if (result.orphanFolderBindings != null) lines.push(`orphan folder bindings: ${result.orphanFolderBindings}`);
  if (result.result && typeof result.result === "object") {
    const inner = result.result;
    if (inner.written && typeof inner.written === "object") {
      if (inner.written.folders != null) lines.push(`folders written: ${inner.written.folders}`);
      if (inner.written.folderBindings != null) lines.push(`folder bindings written: ${inner.written.folderBindings}`);
    }
    if (Array.isArray(inner.warnings)) lines.push(`warnings: ${inner.warnings.length}`);
    if (Array.isArray(inner.errors))   lines.push(`errors: ${inner.errors.length}`);
    if (inner.fallbackKvUpdated != null) lines.push(`fallbackKvUpdated: ${!!inner.fallbackKvUpdated}`);
  }
  const ledgerEntry = result.ledgerEntry;
  if (ledgerEntry && typeof ledgerEntry === "object") {
    if (ledgerEntry.filename)   lines.push(`filename: ${ledgerEntry.filename}`);
    if (ledgerEntry.path)       lines.push(`path: ${ledgerEntry.path}`);
    if (ledgerEntry.sizeBytes) {
      const fmt = settingsFormatBytes(ledgerEntry.sizeBytes);
      lines.push(`size: ${ledgerEntry.sizeBytes}${fmt ? ` (${fmt})` : ""}`);
    }
    if (ledgerEntry.importedAt) lines.push(`imported at: ${settingsIsoOrBlank(ledgerEntry.importedAt)}`);
    if (ledgerEntry.fingerprint) lines.push(`fingerprint: ${String(ledgerEntry.fingerprint).slice(0, 16)}…`);
  }
  /* Orphan-binding sample. Attached by the folder-state import handler
   * from H2O.Studio.sync.diagnose().state.lastImportOrphanBindingSample.
   * Capped at 3 entries by the caller; sample objects preserve their
   * original { kind, folderId, chatId? } shape from import-bundle. */
  if (Array.isArray(result.orphanSample) && result.orphanSample.length > 0) {
    const totalOrphans = (result.orphanFolderBindings != null) ? result.orphanFolderBindings : result.orphanSample.length;
    lines.push(`orphan sample (first ${result.orphanSample.length} of ${totalOrphans}):`);
    for (const o of result.orphanSample) {
      const folderId = String((o && o.folderId) || "");
      const chatId   = String((o && o.chatId)   || "");
      const fShort = folderId ? folderId.slice(0, 18) + (folderId.length > 18 ? "…" : "") : "(none)";
      const cShort = chatId   ? chatId.slice(0, 18)   + (chatId.length   > 18 ? "…" : "") : "(none)";
      lines.push(`  - folder=${fShort} chat=${cShort}`);
    }
  }
  if (result.error || result.reason) lines.push(`error: ${result.error || result.reason}`);
  return lines.join("\n");
}

async function refreshSettingsSync(panel){
  if (!panel) return;
  const isDesktop = STUDIO_isTauri();
  const title = panel.querySelector("#wbSettingsSyncTitle");
  const summary = panel.querySelector("#wbSettingsSyncSummary");
  const statusEl = panel.querySelector("#wbSettingsSyncStatus");
  const desktopControls = panel.querySelector("#wbSettingsSyncDesktopControls");
  const chromeControls = panel.querySelector("#wbSettingsSyncChromeControls");
  /* Phase E — Desktop-only folder-state import sub-section. */
  const folderStateBox = panel.querySelector("#wbSettingsSyncFolderStateImport");

  if (desktopControls) desktopControls.style.display = isDesktop ? "flex" : "none";
  if (chromeControls) chromeControls.style.display = isDesktop ? "none" : "flex";
  if (folderStateBox) folderStateBox.style.display = isDesktop ? "flex" : "none";

  if (isDesktop) {
    if (title) title.textContent = "Desktop Sync Export";
    if (summary) summary.textContent = "Write the latest Studio bundle and control the existing opt-in Desktop auto-export.";
    const ingestion = W.H2O?.Studio?.ingestion || {};
    const sync = W.H2O?.Studio?.sync || null;
    const autoExport = sync && sync.autoExport || null;
    const exportDiag = typeof ingestion.diagnose === "function" ? (ingestion.diagnose() || {}) : {};
    const autoDiag = autoExport && typeof autoExport.diagnose === "function" ? (autoExport.diagnose() || {}) : {};
    const last = autoDiag.lastResult || exportDiag.lastSyncExport || {};
    /* Phase E — pull the last import's routedVia from the ledger (last
     * entry is always most recent — append-only with MAX cap), and the
     * orphan-binding state from sync.diagnose() (Phase D). Both wrapped
     * defensively so the status grid never crashes the settings refresh. */
    let lastImportEntry = null;
    try {
      if (sync && typeof sync.getLedger === "function") {
        const ledger = await sync.getLedger();
        if (ledger && Array.isArray(ledger.entries) && ledger.entries.length > 0) {
          lastImportEntry = ledger.entries[ledger.entries.length - 1];
        }
      }
    } catch (_) { /* ignore — diagnostic surface, never throw */ }
    let lastOrphanBindings = null;
    let lastOrphanBindingsAt = null;
    try {
      if (sync && typeof sync.diagnose === "function") {
        const d = sync.diagnose() || {};
        const st = (d && d.state) || {};
        lastOrphanBindings   = st.lastImportOrphanBindings;
        lastOrphanBindingsAt = st.lastImportOrphanBindingsAt;
      }
    } catch (_) { /* ignore */ }
    const rows = [
      ["Runtime", "Desktop/Tauri"],
      ["Manual latest export", typeof ingestion.exportLatestSyncBundle === "function" ? "available" : "unavailable"],
      ["Auto export", autoDiag.enabled ? "enabled" : "disabled"],
      ["Pending", autoDiag.pending ? "yes" : "no"],
      ["Last status", autoDiag.lastExportStatus || last.status || ""],
      ["Last time", settingsIsoOrBlank(autoDiag.lastExportAt || last.exportedAt || "")],
      ["Last path", autoDiag.lastExportPath || last.path || ""],
      ["Last bytes", settingsFormatBytes(autoDiag.lastExportBytes || last.bytes || 0)],
      /* Phase E — most-recent folder-state import diagnostics. */
      ["Last import route",   (lastImportEntry && lastImportEntry.routedVia) || ""],
      ["Last orphan bindings", (lastOrphanBindings != null) ? String(lastOrphanBindings) : ""],
      ["Last import time",    settingsIsoOrBlank(lastOrphanBindingsAt || (lastImportEntry && lastImportEntry.importedAt) || "")],
    ];
    if (statusEl) statusEl.innerHTML = settingsSyncRowsHtml(rows);
    const exportBtn = panel.querySelector("#wbSettingsSyncExportLatest");
    const enableBtn = panel.querySelector("#wbSettingsSyncEnableDesktopAuto");
    const disableBtn = panel.querySelector("#wbSettingsSyncDisableDesktopAuto");
    const folderStateBtn = panel.querySelector("#wbSettingsSyncFolderStateImportBtn");
    /* Phase J — defensive capability gate for the Choose-file button.
     * The surrounding sub-section is already hidden when STUDIO_isTauri()
     * is false, but the button can still be reachable if Tauri reports
     * isTauri=true while the invoke surface is mid-initialization (see
     * feedback_tauri_webview_boot_race). Probe STUDIO_getTauriInvoke()
     * as a capability check only — no plugin call, no logging — and
     * disable the button when invoke is unavailable. The path input and
     * Import button stay usable so a manually-typed path can still
     * route through H2O.Studio.sync.importFromFile. */
    const folderStatePickBtn = panel.querySelector("#wbSettingsSyncFolderStatePickBtn");
    if (exportBtn) exportBtn.disabled = typeof ingestion.exportLatestSyncBundle !== "function";
    if (enableBtn) enableBtn.disabled = !(autoExport && typeof autoExport.enable === "function") || !!autoDiag.enabled;
    if (disableBtn) disableBtn.disabled = !(autoExport && typeof autoExport.disable === "function") || !autoDiag.enabled;
    if (folderStateBtn) folderStateBtn.disabled = !(sync && typeof sync.importFromFile === "function");
    if (folderStatePickBtn) folderStatePickBtn.disabled = !STUDIO_getTauriInvoke();
    return;
  }

  if (title) title.textContent = "Chrome Sync Folder";
  if (summary) summary.textContent = "Connect the local sync folder, run manual Sync Now, and control existing safe auto-sync triggers.";
  const folder = W.H2O?.Studio?.sync?.folder || null;
  const diag = folder && typeof folder.diagnose === "function"
    ? (folder.diagnose() || {})
    : (folder && typeof folder.status === "function" ? (folder.status() || {}) : {});
  const rowsAfter = W.H2O?.LibraryIndex?.getAll?.()?.length;
  const counts = W.H2O?.LibraryIndex?.counts?.();
  const rows = [
    ["Runtime", "Chrome/MV3"],
    ["Folder API", folder ? "available" : "unavailable"],
    ["Connected", diag.connected ? "yes" : "no"],
    ["Folder", diag.folderName || ""],
    ["Permission", diag.permission || ""],
    ["Auto sync", diag.autoSyncEnabled ? "enabled" : "disabled"],
    ["Last sync", diag.lastSyncStatus || ""],
    ["Last auto sync", diag.lastAutoSyncStatus || ""],
    ["Last error", diag.lastSyncError || diag.lastAutoSyncError || ""],
    ["Rows", rowsAfter != null ? String(rowsAfter) : ""],
    ["Saved count", counts && counts.views ? String(counts.views.saved || 0) : ""],
  ];
  if (statusEl) statusEl.innerHTML = settingsSyncRowsHtml(rows);
  const connectBtn = panel.querySelector("#wbSettingsSyncConnectFolder");
  const disconnectBtn = panel.querySelector("#wbSettingsSyncDisconnectFolder");
  const syncNowBtn = panel.querySelector("#wbSettingsSyncNow");
  const enableBtn = panel.querySelector("#wbSettingsSyncEnableChromeAuto");
  const disableBtn = panel.querySelector("#wbSettingsSyncDisableChromeAuto");
  if (connectBtn) connectBtn.disabled = !(folder && typeof folder.connectFolder === "function");
  if (disconnectBtn) disconnectBtn.disabled = !(folder && typeof folder.disconnectFolder === "function" && diag.connected);
  if (syncNowBtn) syncNowBtn.disabled = !(folder && typeof folder.syncNow === "function" && diag.connected);
  if (enableBtn) enableBtn.disabled = !(folder && typeof folder.enableAutoSync === "function") || !!diag.autoSyncEnabled;
  if (disableBtn) disableBtn.disabled = !(folder && typeof folder.disableAutoSync === "function") || !diag.autoSyncEnabled;
}

function bindSettingsSyncControls(panel){
  if (!panel || panel.dataset.syncControlsBound === "1") return;
  panel.dataset.syncControlsBound = "1";

  const run = async (label, fn) => {
    settingsSyncLog(panel, `${label}…`);
    try {
      const result = await fn();
      settingsSyncLog(panel, settingsSummarizeResult(result));
      await refreshSettingsSync(panel);
    } catch (err) {
      settingsSyncLog(panel, `${label} failed.\n${String(err && (err.stack || err.message || err))}`);
      await refreshSettingsSync(panel);
    }
  };

  panel.querySelector("#wbSettingsSyncRefresh")?.addEventListener("click", () => {
    refreshSettingsSync(panel).catch((err) => settingsSyncLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderParityRefresh")?.addEventListener("click", () => {
    refreshSettingsFolderParity(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderParityCopy")?.addEventListener("click", () => {
    copySettingsFolderParityReport(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderMirrorRefreshPick")?.addEventListener("click", async () => {
    const invoke = STUDIO_getTauriInvoke();
    if (!invoke) {
      settingsFolderParityLog(panel, "Choose file unavailable: Tauri invoke not present.");
      return;
    }
    try {
      const picked = await invoke("plugin:dialog|open", {
        options: {
          multiple: false,
          directory: false,
          filters: [{ name: "JSON folder-state", extensions: ["json"] }],
        },
      });
      if (picked == null) return;
      const pathStr = (typeof picked === "string") ? picked
        : (picked && typeof picked.path === "string") ? picked.path
        : "";
      if (!pathStr) {
        settingsFolderParityLog(panel, "Choose file: unexpected picker response shape: " + JSON.stringify(picked).slice(0, 200));
        return;
      }
      const input = panel.querySelector("#wbSettingsFolderMirrorRefreshPath");
      if (input) input.value = pathStr;
      FOLDER_DESKTOP_MIRROR_REFRESH_STATE.path = pathStr;
      settingsFolderMirrorSetPreview(panel, null);
      settingsFolderMirrorUpdateControls(panel);
    } catch (err) {
      settingsFolderParityLog(panel, "Choose file failed.\n" + String(err && (err.stack || err.message || err)));
    }
  });

  panel.querySelector("#wbSettingsFolderMirrorRefreshPath")?.addEventListener("input", () => {
    FOLDER_DESKTOP_MIRROR_REFRESH_STATE.path = String(panel.querySelector("#wbSettingsFolderMirrorRefreshPath")?.value || "");
    settingsFolderMirrorSetPreview(panel, null);
    settingsFolderMirrorUpdateControls(panel);
  });

  panel.querySelector("#wbSettingsFolderMirrorRefreshJson")?.addEventListener("input", () => {
    FOLDER_DESKTOP_MIRROR_REFRESH_STATE.pastedJson = String(panel.querySelector("#wbSettingsFolderMirrorRefreshJson")?.value || "");
    settingsFolderMirrorSetPreview(panel, null);
    settingsFolderMirrorUpdateControls(panel);
  });

  panel.querySelector("#wbSettingsFolderMirrorRefreshConfirm")?.addEventListener("input", () => {
    FOLDER_DESKTOP_MIRROR_REFRESH_STATE.confirmation = String(panel.querySelector("#wbSettingsFolderMirrorRefreshConfirm")?.value || "");
    settingsFolderMirrorUpdateControls(panel);
  });

  panel.querySelector("#wbSettingsFolderMirrorRefreshPreview")?.addEventListener("click", () => {
    previewSettingsFolderMirrorRefresh(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderMirrorRefreshCopyPlan")?.addEventListener("click", () => {
    copySettingsFolderMirrorRefreshPlan(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderMirrorRefreshRun")?.addEventListener("click", () => {
    refreshDesktopFolderMirror(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });
  settingsFolderMirrorUpdateControls(panel);

  panel.querySelector("#wbSettingsFolderCleanupReviewRefresh")?.addEventListener("click", () => {
    refreshSettingsFolderCleanupReview(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderCleanupReviewCopy")?.addEventListener("click", () => {
    copySettingsFolderCleanupReviewPlan(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderConflictRefresh")?.addEventListener("click", () => {
    refreshSettingsFolderConflictReview(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderConflictCopy")?.addEventListener("click", () => {
    copySettingsFolderConflictPlan(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopReviewRefresh")?.addEventListener("click", () => {
    refreshSettingsFolderDesktopReview(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopReviewCopy")?.addEventListener("click", () => {
    copySettingsFolderDesktopReviewReport(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRefresh")?.addEventListener("click", () => {
    refreshSettingsFolderDesktopOrphanBindingReview(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopOrphanBindingCopy")?.addEventListener("click", () => {
    copySettingsFolderDesktopOrphanBindingReport(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveList")?.addEventListener("change", () => {
    const selected = settingsFolderDesktopOrphanBindingSelected(panel);
    const wasSelected = !!FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.selected;
    FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.selected = !!selected;
    if (!selected || wasSelected !== !!selected) {
      FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview = null;
      panel.__h2oFolderDesktopOrphanBindingRemovalPreview = null;
    }
    const previewEl = panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemovePreview");
    if (previewEl && !FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.preview) {
      previewEl.hidden = true;
      previewEl.textContent = "";
    }
    settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
  });

  panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveConfirm")?.addEventListener("input", () => {
    FOLDER_DESKTOP_ORPHAN_BINDING_REMOVE_STATE.confirmation = String(panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveConfirm")?.value || "");
    settingsFolderDesktopUpdateOrphanBindingRemovalControls(panel);
  });

  panel.querySelector("#wbSettingsFolderDesktopOrphanBindingPreviewRemove")?.addEventListener("click", () => {
    previewSettingsFolderDesktopOrphanBindingRemoval(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopOrphanBindingCopyRemovePlan")?.addEventListener("click", () => {
    copySettingsFolderDesktopOrphanBindingRemovalPlan(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopOrphanBindingRemoveSelected")?.addEventListener("click", () => {
    removeSelectedOrphanDesktopBinding(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopDeleteList")?.addEventListener("change", () => {
    panel.__h2oFolderDesktopDeletionPreview = null;
    const previewEl = panel.querySelector("#wbSettingsFolderDesktopDeletePreview");
    if (previewEl) {
      previewEl.hidden = true;
      previewEl.textContent = "";
    }
    settingsFolderDesktopUpdateDeleteControls(panel);
  });

  panel.querySelector("#wbSettingsFolderDesktopDeleteConfirm")?.addEventListener("input", () => {
    settingsFolderDesktopUpdateDeleteControls(panel);
  });

  panel.querySelector("#wbSettingsFolderDesktopPreviewDelete")?.addEventListener("click", () => {
    previewSettingsFolderDesktopDeletion(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopCopyDeletePlan")?.addEventListener("click", () => {
    copySettingsFolderDesktopDeletionPlan(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderDesktopDeleteSelected")?.addEventListener("click", () => {
    deleteSelectedEmptyDesktopFolders(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderConflictDeleteList")?.addEventListener("change", () => {
    panel.__h2oFolderConflictDeletionPreview = null;
    const previewEl = panel.querySelector("#wbSettingsFolderConflictDeletePreview");
    if (previewEl) {
      previewEl.hidden = true;
      previewEl.textContent = "";
    }
    settingsFolderConflictUpdateDeleteControls(panel);
  });

  panel.querySelector("#wbSettingsFolderConflictDeleteConfirm")?.addEventListener("input", () => {
    settingsFolderConflictUpdateDeleteControls(panel);
  });

  panel.querySelector("#wbSettingsFolderConflictPreviewDelete")?.addEventListener("click", () => {
    previewSettingsFolderConflictDeletion(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderConflictCopyDeletePlan")?.addEventListener("click", () => {
    copySettingsFolderConflictDeletionPlan(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderConflictDeleteSelected")?.addEventListener("click", () => {
    deleteSelectedEmptyDuplicateConflictFolders(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderCleanupDeleteList")?.addEventListener("change", () => {
    panel.__h2oFolderCleanupDeletionPreview = null;
    const previewEl = panel.querySelector("#wbSettingsFolderCleanupDeletePreview");
    if (previewEl) {
      previewEl.hidden = true;
      previewEl.textContent = "";
    }
    settingsFolderCleanupUpdateDeleteControls(panel);
  });

  panel.querySelector("#wbSettingsFolderCleanupConfirm")?.addEventListener("input", () => {
    settingsFolderCleanupUpdateDeleteControls(panel);
  });

  panel.querySelector("#wbSettingsFolderCleanupPreview")?.addEventListener("click", () => {
    previewSettingsFolderCleanupDeletion(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderCleanupCopyDeletePlan")?.addEventListener("click", () => {
    copySettingsFolderCleanupDeletionPlan(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsFolderCleanupDeleteSelected")?.addEventListener("click", () => {
    deleteSelectedSafeChromeMirrorFolders(panel).catch((err) => settingsFolderParityLog(panel, String(err && (err.stack || err.message || err))));
  });

  panel.querySelector("#wbSettingsSyncExportLatest")?.addEventListener("click", () => run("Writing latest sync bundle", async () => {
    const fn = W.H2O?.Studio?.ingestion?.exportLatestSyncBundle;
    if (typeof fn !== "function") throw new Error("exportLatestSyncBundle unavailable");
    return fn({ reason: "settings-ui" });
  }));

  panel.querySelector("#wbSettingsSyncEnableDesktopAuto")?.addEventListener("click", () => run("Enabling Desktop auto-export", async () => {
    const fn = W.H2O?.Studio?.sync?.autoExport?.enable;
    if (typeof fn !== "function") throw new Error("autoExport.enable unavailable");
    return fn();
  }));

  panel.querySelector("#wbSettingsSyncDisableDesktopAuto")?.addEventListener("click", () => run("Disabling Desktop auto-export", async () => {
    const fn = W.H2O?.Studio?.sync?.autoExport?.disable;
    if (typeof fn !== "function") throw new Error("autoExport.disable unavailable");
    return fn();
  }));

  panel.querySelector("#wbSettingsSyncConnectFolder")?.addEventListener("click", () => run("Connecting sync folder", async () => {
    const fn = W.H2O?.Studio?.sync?.folder?.connectFolder;
    if (typeof fn !== "function") throw new Error("folder.connectFolder unavailable");
    return fn();
  }));

  panel.querySelector("#wbSettingsSyncDisconnectFolder")?.addEventListener("click", () => run("Disconnecting sync folder", async () => {
    const fn = W.H2O?.Studio?.sync?.folder?.disconnectFolder;
    if (typeof fn !== "function") throw new Error("folder.disconnectFolder unavailable");
    return fn();
  }));

  panel.querySelector("#wbSettingsSyncNow")?.addEventListener("click", () => run("Running Sync Now", async () => {
    const fn = W.H2O?.Studio?.sync?.folder?.syncNow;
    if (typeof fn !== "function") throw new Error("folder.syncNow unavailable");
    return fn({ reason: "settings-ui" });
  }));

  panel.querySelector("#wbSettingsSyncEnableChromeAuto")?.addEventListener("click", () => run("Enabling Chrome auto-sync", async () => {
    const fn = W.H2O?.Studio?.sync?.folder?.enableAutoSync;
    if (typeof fn !== "function") throw new Error("folder.enableAutoSync unavailable");
    return fn();
  }));

  panel.querySelector("#wbSettingsSyncDisableChromeAuto")?.addEventListener("click", () => run("Disabling Chrome auto-sync", async () => {
    const fn = W.H2O?.Studio?.sync?.folder?.disableAutoSync;
    if (typeof fn !== "function") throw new Error("folder.disableAutoSync unavailable");
    return fn();
  }));

  /* Phase H — native file picker. Calls tauri-plugin-dialog's open
   * command (capability: dialog:allow-open). Select-only: the picker
   * returns an absolute path; we write it into the existing path input
   * and stop. No auto-import — the user still must click Import
   * folder-state below. Intentionally outside the run() helper because
   * there is no result to summarize and refreshing the status grid
   * after a select-only operation is wasted work. Errors and
   * unexpected-shape responses are written to the existing sync log. */
  panel.querySelector("#wbSettingsSyncFolderStatePickBtn")?.addEventListener("click", async () => {
    const invoke = STUDIO_getTauriInvoke();
    if (!invoke) {
      settingsSyncLog(panel, "Choose file unavailable: Tauri invoke not present (non-Desktop runtime?).");
      return;
    }
    try {
      const picked = await invoke("plugin:dialog|open", {
        options: {
          multiple: false,
          directory: false,
          filters: [{ name: "JSON folder-state", extensions: ["json"] }],
        },
      });
      if (picked == null) {
        /* User cancelled the OS picker — leave the path input as-is.
         * Silent; no log noise. */
        return;
      }
      /* Tauri V2 dialog returns string for single-file selection in
       * current builds; future builds may wrap it as { path, name }.
       * Probe both shapes. Anything else is logged as unexpected. */
      const pathStr = (typeof picked === "string") ? picked
                    : (picked && typeof picked.path === "string") ? picked.path
                    : "";
      if (!pathStr) {
        settingsSyncLog(panel, "Choose file: unexpected picker response shape: " + JSON.stringify(picked).slice(0, 200));
        return;
      }
      const input = panel.querySelector("#wbSettingsSyncFolderStatePath");
      if (input) input.value = pathStr;
      /* Phase I — persist the picked path so the next Settings render
       * pre-fills the input with this value instead of the hardcoded
       * runbook default. Only persisted on successful pick (we already
       * returned early on cancel and on unexpected-shape). Errors are
       * swallowed inside the helper. */
      STUDIO_settingsWriteFolderStateLastPath(pathStr);
    } catch (err) {
      settingsSyncLog(panel, "Choose file failed.\n" + String((err && (err.message || err)) || err));
    }
  });

  /* Phase E — manual folder-state JSON import. Routes through the
   * already-proven H2O.Studio.sync.importFromFile() (Phase B); attaches
   * the orphan-binding sample from diagnose() (Phase D) to the result
   * so settingsSummarizeResult renders it inline. The Phase H picker
   * above only writes to the path input; this Import handler runs the
   * actual import on explicit click. */
  panel.querySelector("#wbSettingsSyncFolderStateImportBtn")?.addEventListener("click", () => run("Importing folder-state JSON", async () => {
    const sync = W.H2O?.Studio?.sync;
    if (!sync || typeof sync.importFromFile !== "function") {
      throw new Error("H2O.Studio.sync.importFromFile unavailable");
    }
    const input = panel.querySelector("#wbSettingsSyncFolderStatePath");
    const path = String((input && input.value) || "").trim();
    if (!path) throw new Error("Path required — paste an absolute path to the folder-state JSON file.");
    /* Phase I — best-effort persistence on import attempt so a
     * manually-typed (not-picked) path is also remembered for the next
     * Settings render. Fire-and-forget; storage failures don't block
     * the import. Writes happen before the import call so the value is
     * captured even if the import then fails (e.g. read-failed). */
    STUDIO_settingsWriteFolderStateLastPath(path);
    const result = await sync.importFromFile(path);
    /* Read Phase D state so the log can show a small orphan sample
     * alongside the wrapper summary. Diagnose is sync; never throws. */
    try {
      if (result && typeof result === "object" && typeof sync.diagnose === "function") {
        const d = sync.diagnose() || {};
        const st = (d && d.state) || {};
        const sample = Array.isArray(st.lastImportOrphanBindingSample) ? st.lastImportOrphanBindingSample : [];
        /* Cap at 3 for the inline log; the full sample (up to 5) remains
         * accessible via H2O.Studio.sync.diagnose() in DevTools. */
        result.orphanSample = sample.slice(0, 3);
      }
    } catch (_) { /* ignore — diagnostic enrichment, never blocks the return */ }
    return result;
  }));
}

function renderMigrateRoute(actionRaw){
  const action = String(actionRaw || "").toLowerCase();
  migrateRouteHideOtherPanels();
  setRouteMeta("Migrate", action === "export" ? "Export Bundle" : "Import Bundle",
    "Move all Studio data between extension IDs · Phase 2 migration");
  const panel = migrateOverlayEnsure();
  if (!panel) return;
  panel.hidden = false;
  // Idempotency guard: renderRoute fires on hashchange AND on every window
  // focus / visibilitychange (refreshFromForeground). Opening the OS file
  // picker steals focus, so when the user picks a file the Studio window
  // re-focuses and renderRoute runs again — re-entering this function. Without
  // this guard, we would wipe the file <input> element and its change
  // listener (plus the closure that holds `parsedBundle`) BEFORE the browser
  // delivers the change event. The user's pick would vanish silently.
  // Solution: track the currently rendered action on the panel itself; bail
  // out early when re-entering for the same action. The DOM + closures stay
  // intact so the file picker's change event lands on the live listener.
  if (panel.dataset.migrateActiveAction === action && panel.firstChild) {
    return;
  }
  panel.dataset.migrateActiveAction = action;
  panel.innerHTML = "";

  const meta = migrateExtensionLabel();
  const header = document.createElement("div");
  header.innerHTML = `
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:600">Studio Migration · ${esc(action === "export" ? "Export" : "Import")}</h2>
    <div style="margin:0 0 16px;opacity:.75;font-size:12px">Active extension: <code style="background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px">${esc(meta.label)}</code></div>
    <p style="margin:0 0 18px;opacity:.85">${
      action === "export"
        ? "Generate a full Studio bundle (chats, snapshots, folders, projects, labels, categories, highlights, library KV, UI prefs). Auth tokens are <strong>not</strong> exported. Run this on the <em>source</em> extension."
        : "Apply a previously exported Studio bundle to <strong>this</strong> extension. The flow is: pick file → dry-run → auto-backup current data → confirm import. Existing prod data is never overwritten in merge mode."
    }</p>
  `;
  panel.appendChild(header);

  if (action === "export") renderMigrateExport(panel);
  else renderMigrateImport(panel);
}

function renderMigrateExport(panel){
  const log = document.createElement("pre");
  log.style.cssText = "white-space:pre-wrap;background:rgba(0,0,0,.18);padding:12px;border-radius:6px;max-height:280px;overflow:auto;font-size:12px;line-height:1.45;margin:12px 0";
  log.textContent = "Ready.";

  const btn = document.createElement("button");
  btn.className = "wbBtn";
  btn.textContent = "Export Full Studio Bundle";
  btn.style.cssText = "padding:8px 16px;font-weight:600;cursor:pointer";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    log.textContent = "Exporting… (reading chat archive, chrome.storage.local, library-kv)";
    try {
      const ab = migrateGetArchiveBoot();
      const t0 = performance.now();
      const bundle = await ab.exportFullBundle({});
      const ms = Math.round(performance.now() - t0);
      const summary = bundle && bundle.summary ? bundle.summary : {};
      log.textContent = [
        `Exported in ${ms}ms.`,
        `  schema:             ${bundle?.schema || "(missing)"}`,
        `  exportedAt:         ${bundle?.exportedAt || "(missing)"}`,
        `  fromExtensionId:    ${bundle?.exportedFromExtensionId || "(missing)"}`,
        `  fromExtensionName:  ${bundle?.exportedFromExtensionName || "(missing)"}`,
        `  chats:              ${summary.chatCount || 0}`,
        `  snapshots:          ${summary.snapshotCount || 0}`,
        `  categories:         ${summary.categoryCount || 0}`,
        `  labels:             ${summary.labelCount || 0}`,
        `  chromeStorage keys: ${summary.chromeStorageKeyCount || 0}`,
        `  libraryKv keys:     ${summary.libraryKvKeyCount || 0}`,
        ``,
        `Downloading…`,
      ].join("\n");
      const filename = `h2o-studio-full-bundle__${(bundle?.exportedFromExtensionId || "unknown").slice(0,8)}__${migrateBuildTimestamp()}.json`;
      migrateDownloadJson(filename, bundle);
      log.textContent += `\nSaved as ${filename}`;
    } catch (err) {
      log.textContent = "Export FAILED.\n" + String(err && (err.stack || err.message || err));
    } finally {
      btn.disabled = false;
    }
  });

  panel.appendChild(btn);
  panel.appendChild(log);
}

function renderMigrateImport(panel){
  let parsedBundle = null;
  let bundleFilename = "";
  let dryRun = null;
  let backupSaved = false;

  const log = document.createElement("pre");
  log.style.cssText = "white-space:pre-wrap;background:rgba(0,0,0,.18);padding:12px;border-radius:6px;max-height:360px;overflow:auto;font-size:12px;line-height:1.45;margin:12px 0";
  log.textContent = "Step 1: pick a bundle file.";

  const fileWrap = document.createElement("div");
  fileWrap.style.cssText = "display:flex;gap:8px;align-items:center;margin:8px 0";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileWrap.appendChild(fileInput);
  panel.appendChild(fileWrap);

  const btnDry = document.createElement("button");
  btnDry.className = "wbBtn";
  btnDry.textContent = "2. Dry-run validate";
  btnDry.disabled = true;
  btnDry.style.cssText = "margin:0 8px 0 0;padding:8px 16px;cursor:pointer";

  const btnBackup = document.createElement("button");
  btnBackup.className = "wbBtn";
  btnBackup.textContent = "3. Backup current data (auto-download)";
  btnBackup.disabled = true;
  btnBackup.style.cssText = "margin:0 8px 0 0;padding:8px 16px;cursor:pointer";

  const btnImport = document.createElement("button");
  btnImport.className = "wbBtn";
  btnImport.textContent = "4. Confirm import (merge mode)";
  btnImport.disabled = true;
  btnImport.style.cssText = "padding:8px 16px;font-weight:600;cursor:pointer;background:rgba(13,148,136,.18);border-color:rgba(13,148,136,.6)";

  panel.appendChild(btnDry);
  panel.appendChild(btnBackup);
  panel.appendChild(btnImport);
  panel.appendChild(log);

  const onFilePicked = async (ev) => {
    // Diagnostic: log to console too so any silent-failure case surfaces in
    // DevTools regardless of whether the UI log is intact.
    try { console.log("[H2O/Migrate] file change event fired", { hasFiles: !!(fileInput.files && fileInput.files.length) }); } catch {}
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      log.textContent = "No file picked (file input cleared or selection cancelled).";
      return;
    }
    log.textContent = `File selected: ${file.name} (${(file.size || 0).toLocaleString()} bytes). Parsing…`;
    bundleFilename = file.name;
    parsedBundle = null;
    dryRun = null;
    backupSaved = false;
    btnDry.disabled = true;
    btnBackup.disabled = true;
    btnImport.disabled = true;
    try {
      const text = await file.text();
      let obj;
      try {
        obj = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`JSON parse failed: ${parseErr && (parseErr.message || parseErr)}`);
      }
      const schema = String(obj && obj.schema || "(missing)");
      if (schema !== "h2o.studio.fullBundle.v2" && schema !== "h2o.chatArchive.bundle.v1") {
        throw new Error(`Unrecognized bundle schema: ${schema}. Expected "h2o.studio.fullBundle.v2" or "h2o.chatArchive.bundle.v1".`);
      }
      parsedBundle = obj;
      const summary = obj.summary || {};
      log.textContent = [
        `File parsed successfully.`,
        ``,
        `  filename:           ${file.name}`,
        `  bytes:              ${(file.size || 0).toLocaleString()}`,
        `  schema:             ${schema}`,
        `  exportedAt:         ${obj.exportedAt || "(missing)"}`,
        `  fromExtensionId:    ${obj.exportedFromExtensionId || "(legacy v1 bundle — no extension id)"}`,
        `  fromExtensionName:  ${obj.exportedFromExtensionName || "(legacy v1 bundle — no name)"}`,
        `  fromVersion:        ${obj.exportedFromVersion || "(missing)"}`,
        ``,
        `Summary (as stored in bundle):`,
        `  chats:              ${summary.chatCount ?? "(not summarized)"}`,
        `  snapshots:          ${summary.snapshotCount ?? "(not summarized)"}`,
        `  categories:         ${summary.categoryCount ?? "(not summarized)"}`,
        `  labels:             ${summary.labelCount ?? "(not summarized)"}`,
        `  chromeStorage keys: ${summary.chromeStorageKeyCount ?? "(not summarized)"}`,
        `  libraryKv keys:     ${summary.libraryKvKeyCount ?? "(not summarized)"}`,
        ``,
        `Step 2 is now available. Click "Dry-run validate" — nothing will be written.`,
      ].join("\n");
      btnDry.disabled = false;
      try { console.log("[H2O/Migrate] bundle accepted; dry-run enabled"); } catch {}
    } catch (err) {
      parsedBundle = null;
      const msg = String(err && (err.stack || err.message || err));
      log.textContent = `Bundle rejected.\n${msg}\n\nTry a different file. (No data was written; this is the file-select step.)`;
      try { console.warn("[H2O/Migrate] bundle parse/validate failed", err); } catch {}
    }
  };
  fileInput.addEventListener("change", onFilePicked);
  // Defense in depth for some Chromium edge cases where re-picking the same
  // filename doesn't refire "change" — also listen to "input".
  fileInput.addEventListener("input", onFilePicked);

  btnDry.addEventListener("click", async () => {
    if (!parsedBundle) return;
    btnDry.disabled = true;
    log.textContent = "Running dry-run on this extension's storage… (no writes)";
    try {
      const ab = migrateGetArchiveBoot();
      dryRun = await ab.dryRunImportFullBundle({ bundle: parsedBundle });
      const p = dryRun.plan || {};
      log.textContent = [
        `Dry-run report (NO WRITES PERFORMED):`,
        ``,
        `Chats:`,
        `  incoming chats:        ${p.chats?.incoming || 0}`,
        `  incoming snapshots:    ${p.chats?.incomingSnapshots || 0}`,
        `  will import:           ${p.chats?.willImport || 0}`,
        `  will skip (duplicate): ${p.chats?.willSkipDuplicates || 0}`,
        ``,
        `chrome.storage.local:`,
        `  incoming keys:         ${p.chromeStorageLocal?.incoming || 0}`,
        `  will import:           ${p.chromeStorageLocal?.willImport || 0}`,
        `  will skip (duplicate): ${p.chromeStorageLocal?.willSkipDuplicates || 0}`,
        `  denied by policy:      ${p.chromeStorageLocal?.deniedByPolicy || 0}  (auth/dev-only keys)`,
        ``,
        `library-kv (IndexedDB):`,
        `  incoming keys:         ${p.libraryKv?.incoming || 0}`,
        `  will import:           ${p.libraryKv?.willImport || 0}`,
        `  will skip (duplicate): ${p.libraryKv?.willSkipDuplicates || 0}`,
        `  denied by policy:      ${p.libraryKv?.deniedByPolicy || 0}`,
        ``,
        `Sample IDs (first 10):`,
        `  new chats:    ${(dryRun.sample?.newChatIds || []).join(", ") || "(none)"}`,
        `  dup chats:    ${(dryRun.sample?.dupChatIds || []).join(", ") || "(none)"}`,
        ``,
        `Step 3: click "Backup current data" before confirming the import.`,
      ].join("\n");
      btnBackup.disabled = false;
    } catch (err) {
      log.textContent = "Dry-run FAILED.\n" + String(err && (err.stack || err.message || err));
      btnDry.disabled = false;
    }
  });

  btnBackup.addEventListener("click", async () => {
    btnBackup.disabled = true;
    log.textContent += "\n\nGenerating pre-import backup of THIS extension…";
    try {
      const ab = migrateGetArchiveBoot();
      const bundle = await ab.exportFullBundle({});
      const filename = `h2o-studio-PROD-pre-import-backup__${(bundle?.exportedFromExtensionId || "unknown").slice(0,8)}__${migrateBuildTimestamp()}.json`;
      migrateDownloadJson(filename, bundle);
      backupSaved = true;
      log.textContent += `\nBackup saved as ${filename}.`;
      log.textContent += `\n\nStep 4: click "Confirm import" to merge incoming data.`;
      log.textContent += `\n(Existing records in this extension are preserved; only NEW chats/keys are written.)`;
      btnImport.disabled = false;
    } catch (err) {
      log.textContent += "\nBackup FAILED — refusing to proceed with import.\n" + String(err && (err.stack || err.message || err));
      btnBackup.disabled = false;
    }
  });

  btnImport.addEventListener("click", async () => {
    if (!parsedBundle || !backupSaved) return;
    if (!confirm("Apply this bundle to the current extension in MERGE mode?\n\nExisting records are preserved. Only new chats/keys will be added.\n\nThis cannot be undone except by restoring the backup file you just downloaded.")) {
      return;
    }
    btnImport.disabled = true;
    log.textContent += "\n\nImporting… (merge mode)";
    try {
      const ab = migrateGetArchiveBoot();
      const t0 = performance.now();
      const result = await ab.importFullBundle({ bundle: parsedBundle, mode: "merge" });
      const ms = Math.round(performance.now() - t0);
      log.textContent += [
        ``,
        `Import complete in ${ms}ms.`,
        ``,
        `Chats:                ${result.chats?.importedChats || 0} imported, ${result.chats?.importedSnapshots || 0} snapshots`,
        `chrome.storage.local: ${result.chromeStorageLocal?.written || 0} written, ${result.chromeStorageLocal?.skipped || 0} skipped`,
        `library-kv:           ${result.libraryKv?.written || 0} written, ${result.libraryKv?.skipped || 0} skipped${result.libraryKv?.errors?.length ? `, ${result.libraryKv.errors.length} errors` : ""}`,
        ``,
        `Reload the Studio tab (or navigate to #/library/explorer) to see the imported data.`,
      ].join("\n");
      // Notify the rest of Studio so live views refresh.
      try { W.dispatchEvent(new CustomEvent("evt:h2o:data:backup:imported", { detail: { source: "migrate-import", result } })); } catch {}
    } catch (err) {
      log.textContent += "\nImport FAILED.\n" + String(err && (err.stack || err.message || err));
      btnImport.disabled = false;
    }
  });
}

// ── Desktop list auto-refresh (M2a-3j) ──────────────────────────────────────
// On Tauri, the workbench list is sourced from H2O.LibraryIndex (via
// fetchWorkbenchRows). LibraryIndex itself auto-refreshes from store
// subscribers (M2a-3g), so any SQLite write (ingestion, chat upsert,
// folder bind, etc.) triggers a LibraryIndex update. We listen for those
// updates and invalidate state.rowsCache + re-render the current route so
// the Desktop UI reflects the new data without a manual refresh.
//
// Debounced 200 ms so multi-write batches coalesce into one re-render.
function subscribeLibraryIndexToWorkbenchCache(){
  if (!STUDIO_isTauri()) return;
  const li = W.H2O && W.H2O.LibraryIndex;
  if (!li || typeof li.subscribe !== 'function') return;
  let pendingTimer = null;
  try {
    li.subscribe(() => {
      if (pendingTimer) return;
      pendingTimer = W.setTimeout(() => {
        pendingTimer = null;
        state.rowsCache = null;
        // renderRoute dispatches to renderList (list/saved/pinned/archive/
        // folder) or renderReader (read) based on the current hash —
        // safe to call unconditionally. Other routes (library, settings,
        // migrate) ignore rowsCache; the invalidation alone is enough for
        // them on next navigation.
        renderRoute().catch(console.error);
      }, 200);
    });
  } catch (e) {
    try { console.warn('[H2O.Studio] subscribeLibraryIndexToWorkbenchCache failed', e); } catch {}
  }
}

function boot(){
  readUiPrefs();
  applyUiState();

  $("#refreshBtn")?.addEventListener("click", () => {
    state.rowsCache = null;
    state.folderCatalog = [];
    state.folderLocalReview = [];
    state.folderBindingsByChat = {};
    renderRoute({ force: true }).catch(console.error);
  });

  $("#sidebarCollapseBtn")?.addEventListener("click", closeSidebar);
  $("#railSidebarBtn")?.addEventListener("click", openSidebar);
  $("#folderAssignSelect")?.addEventListener("change", () => {
    handleFolderAssignChange().catch(console.error);
  });
  $("#categoryAssignWrap")?.addEventListener("change", (ev) => {
    if (ev.target?.id === "categoryAssignSelect") {
      handleCategoryAssignChange().catch(console.error);
    }
  });
  $("#categoryAssignWrap")?.addEventListener("click", (ev) => {
    const target = ev.target?.closest?.("#restoreCategoryBtn, #reclassifyCategoryBtn");
    if (!target) return;
    handleCategoryReclassify().catch(console.error);
  });

  $("#q")?.addEventListener("input", () => {
    const route = parseHash();
    if (route.name === "list") renderList(route.view, route.folderId).catch(console.error);
  });

  document.addEventListener("click", (ev) => {
    const target = ev.target instanceof HTMLElement ? ev.target : null;
    if (target?.closest(".wbRowPopover, .wbRowTools, .ho-emoji-picker")) return;
    closeRowPopovers();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeRowPopovers();
  });

  let nativeMetaRefreshTimer = 0;
  const scheduleNativeMetaRefresh = () => {
    clearTimeout(nativeMetaRefreshTimer);
    nativeMetaRefreshTimer = setTimeout(() => {
      state.rowsCache = null;
      renderRoute({ force: true }).catch(console.error);
    }, 250);
  };
  const nativeMetaPrefixes = [
    CHAT_TITLE_STATE_KEY_PREFIX,
    CHAT_TITLE_BOOT_KEY_PREFIX,
    INTERFACE_META_MIRROR_KEY_PREFIX,
    HEAT_OVERRIDE_KEY_PREFIX,
    PIN_KEY_PREFIX,
    ROW_TINT_KEY_PREFIX,
  ];
  if (hasChromeStorage() && W.chrome?.storage?.onChanged?.addListener) {
    try {
      W.chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        const keys = Object.keys(changes || {});
        if (keys.some((key) => nativeMetaPrefixes.some((prefix) => key.startsWith(prefix)))) {
          scheduleNativeMetaRefresh();
        }
      });
    } catch {}
  }
  [
    "h2o:chat-title:changed",
    "h2o:chat-title:emoji-updated",
    "evt:h2o:chat-title:changed",
    "evt:h2o:chat-title:emoji-updated",
    "evt:h2o:library:cross-surface-sync",
    "evt:h2o:library-index:updated",
    "h2o:library-index:updated",
  ].forEach((eventName) => {
    window.addEventListener(eventName, scheduleNativeMetaRefresh);
  });

  // v2.8: top-of-sidebar "Search chats" row → route into the Library Explorer
  // and focus its own page-level search input. The Explorer header mounts
  // asynchronously after the hash change, so we poll briefly (≤ 800ms) for
  // the input before giving up rather than racing it on the first frame.
  $("#wbStudioNavSearch")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (location.hash !== "#/library/explorer") location.hash = "#/library/explorer";
    const deadline = Date.now() + 800;
    const tryFocus = () => {
      const pageSearch = document.querySelector(".wbLibraryPageSearchInput");
      if (pageSearch && typeof pageSearch.focus === "function") { pageSearch.focus(); return; }
      if (Date.now() < deadline) setTimeout(tryFocus, 60);
    };
    requestAnimationFrame(tryFocus);
  });

  $("#viewList")?.addEventListener("click", (ev) => {
    const tagEl = ev.target.closest(".wbBadge--tag[data-tag]");
    if (!tagEl) return;
    ev.stopPropagation();
    const tag = String(tagEl.dataset.tag || "").trim();
    if (!tag) return;
    state.lastTagFilter = (state.lastTagFilter === tag) ? "" : tag;
    const route = parseHash();
    if (route.name === "list") renderList(route.view, route.folderId).catch(console.error);
  });

  // Hashchange listener with "last list-ish hash" capture. We remember the most
  // recent non-reader hash in sessionStorage so the topbar Close button can return
  // the user to wherever they came from (Library page, Saved, Pinned, Archive, …)
  // instead of always falling back to #/saved.
  const LAST_LIST_HASH_KEY = "h2o:studio:lastListHash:v1";
  function captureLastListHash(hash){
    const h = String(hash || "").trim();
    if (!h || h.startsWith("#/read/")) return;
    try { sessionStorage.setItem(LAST_LIST_HASH_KEY, h); } catch {}
  }
  function readLastListHash(){
    try { return sessionStorage.getItem(LAST_LIST_HASH_KEY) || ""; } catch { return ""; }
  }
  window.addEventListener("hashchange", (ev) => {
    try {
      const oldUrl = ev?.oldURL || "";
      if (oldUrl) captureLastListHash(new URL(oldUrl).hash || "");
    } catch {}
    persistStudioLastHash(location.hash);
    persistStudioPresence();
    renderRoute().catch(console.error);
  });

  // Wire the topbar Close button. Previously it had a label-update path in
  // applyUiState but no click handler — clicking it did nothing. Now: if the
  // user is in the reader, return to the previous list/library route (or fall
  // back to #/saved); if they're already on a list/library route, close the
  // window (Studio is a separate tab/window so this collapses cleanly).
  $("#closeBtn")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    const route = parseHash();
    if (route.name === "read") {
      const target = readLastListHash();
      // Guard against returning to the same read hash (defensive — shouldn't
      // happen because we only capture non-read hashes, but cheap to check).
      const safe = (target && !target.startsWith("#/read/")) ? target : "#/saved";
      if (location.hash === safe) {
        // Already at the target hash — trigger a render anyway so the reader
        // closes visually.
        renderRoute({ force: true }).catch(console.error);
      } else {
        location.hash = safe;
      }
      return;
    }
    // Not in the reader → close the Studio window. Some Chrome contexts block
    // window.close() on tabs the user opened directly; falling back to a
    // navigation to the empty hash keeps the page in a sane state.
    try { window.close(); } catch {}
  });

  const refreshFromForeground = () => {
    state.rowsCache = null;
    renderRoute({ force: true }).catch(console.error);
  };
  window.addEventListener("focus", refreshFromForeground);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      persistStudioPresence();
      refreshFromForeground();
    }
  });

  // Seed the capture so the very first reader-open from a fresh tab also
  // has something to return to.
  captureLastListHash(location.hash);

  if (!location.hash) location.hash = "#/saved";
  persistStudioLastHash(location.hash);
  persistStudioPresence();
  // Heartbeat keeps presence fresh so the SW can tell "Studio was alive in
  // the last ~10s" vs "Studio has been closed for hours". The interval is
  // unconditional — cheap (one chrome.storage.local.set / 10s) and survives
  // tab hidden/visible cycles. If the tab is closed, the interval dies with it.
  try { W.setInterval(() => persistStudioPresence(), STUDIO_PRESENCE_HEARTBEAT_MS); } catch {}
  renderRoute().catch(console.error);

  // Desktop (Tauri) only: the webview emits focus / visibilitychange /
  // hashchange in close succession during startup. Each event triggers
  // a new renderRoute which bumps state.renderToken, and every
  // in-flight renderList silently bails at its post-await token checks
  // before reaching renderFolderSidebar([]) / renderSidebarChatList([]).
  // The result is that the sidebar's static "Loading folder bindings…"
  // / "Loading chats…" HTML placeholders never get replaced until the
  // user manually triggers another renderRoute. A single deferred
  // renderRoute scheduled after the startup flurry settles is a
  // defensive empty-state completion pass: by then fetchWorkbenchRows
  // returns the cached [] instantly (via the callArchive interceptors)
  // and renderList runs end-to-end. Cheap; safe to double-render the
  // empty state. MV3 is unaffected — this whole block is gated on Tauri.
  if (STUDIO_isTauri()) {
    // M2a-3j: subscribe to LibraryIndex updates so SQLite-driven changes
    // (ingestion, edits, etc.) invalidate the workbench cache and
    // re-render the current route. Idempotent — subscribers are
    // deduplicated by LibraryIndex.subscribe.
    subscribeLibraryIndexToWorkbenchCache();
    setTimeout(() => {
      renderRoute({ force: true }).catch(console.error);
    }, 600);
  }
}

boot();

/* ─── Phase 1b → Phase 2e — Studio Ribbon read-only bridge ─────────────────
 * Async accessor exposed to the Studio Ribbon's "Copy clean transcript"
 * action. Serializes the canonical messages of the currently-open saved
 * snapshot, optionally decorated with the per-snapshot edit overlay
 * (headings, callouts, sections, etc.).
 *
 * Phase 2e contract — returns Promise<{
 *   text: string,
 *   overlayIncluded: boolean,
 *   overlaySkipped: boolean,
 *   reason?: string,
 * }>:
 *   - text                — the transcript string (raw on missing inputs).
 *   - overlayIncluded     — true only when overlay decorations actually
 *                           landed in the output (active ops were emitted
 *                           OR structure markers were inserted).
 *   - overlaySkipped      — true when includeOverlay was requested but
 *                           the overlay path was bypassed for a safe
 *                           fallback reason (drift, serializer missing).
 *   - reason              — short string explaining a skip:
 *                           'drift-detected', 'no-overlay',
 *                           'serializer-unavailable', 'store-unavailable',
 *                           'reducer-unavailable', 'serializer-error'.
 *
 * Options:
 *   - includeOverlay      default true. Pass false for byte-identical
 *                         Phase 1b output.
 *   - includeToc          default false. When true and there is at
 *                         least one section, a "## Contents" block is
 *                         emitted at the top.
 *   - collapsedMode       default 'include-marked'. Other values:
 *                         'include-silent', 'omit' (see serializer doc).
 *
 * Guarantees:
 *   - Never throws — wraps the entire body in try/catch and returns a
 *     well-formed object on any failure.
 *   - Returns { text: '', overlayIncluded: false, overlaySkipped: false }
 *     for missing snapshot or empty messages.
 *   - Returns raw text with overlayIncluded:false, overlaySkipped:false
 *     when includeOverlay is explicitly false.
 *   - Returns raw text with overlayIncluded:false, overlaySkipped:true,
 *     reason:'drift-detected' when the overlay's baseDigest no longer
 *     matches the snapshot.
 *   - Never mutates snap.messages or the overlay record.
 *
 * Raw fallback parity: when includeOverlay is false (or any safe
 * fallback fires), output is byte-identical to Phase 1b:
 *     User:\n<text>\n\nA:\n<text>\n\nSystem:\n<text>
 *   with empty turns skipped and unknown roles dropped.
 */
function __ribbonBridge_getCleanTranscript(opts){
  return Promise.resolve().then(function () {
    const options = (opts && typeof opts === 'object') ? opts : {};
    const includeOverlay = options.includeOverlay !== false; /* default true */
    const includeToc = options.includeToc === true;          /* default false */
    const collapsedMode = (options.collapsedMode === 'include-silent' || options.collapsedMode === 'omit')
      ? options.collapsedMode
      : 'include-marked';

    const snap = state && state.currentReaderSnapshot;
    if (!snap || typeof snap !== 'object') {
      return { text: '', overlayIncluded: false, overlaySkipped: false };
    }

    const serializer = W.H2O?.Studio?.overlaySerializer;
    /* ── Raw mode short-circuit. Stays usable even when the Phase 2e
     * serializer module didn't load (e.g., user is on an older Studio
     * build), since includeOverlay:false bypasses the serializer. */
    function rawResult(reasonIfAny) {
      try {
        const messages = Array.isArray(snap.messages) ? snap.messages : [];
        const out = [];
        for (let i = 0; i < messages.length; i += 1) {
          const msg = messages[i];
          if (!msg || typeof msg !== 'object') continue;
          const text = String(msg.text == null ? '' : msg.text).trim();
          if (!text) continue;
          const role = String(msg.role || '').toLowerCase();
          let label;
          if (role === 'user') label = 'User:';
          else if (role === 'assistant') label = 'A:';
          else if (role === 'system') label = 'System:';
          else continue;
          out.push(label + '\n' + text);
        }
        const txt = out.join('\n\n');
        const obj = { text: txt, overlayIncluded: false, overlaySkipped: !!reasonIfAny };
        if (reasonIfAny) obj.reason = String(reasonIfAny);
        return obj;
      } catch (_) {
        const obj = { text: '', overlayIncluded: false, overlaySkipped: !!reasonIfAny };
        if (reasonIfAny) obj.reason = String(reasonIfAny);
        return obj;
      }
    }

    if (!includeOverlay) {
      return rawResult(null);
    }
    if (!serializer || typeof serializer.serialize !== 'function') {
      return rawResult('serializer-unavailable');
    }

    /* ── Overlay mode — fetch overlay record, drift-check, serialize. */
    const sid = String(snap.snapshotId || '');
    if (!sid) {
      /* Snapshot has no id (shouldn't happen for saved chats but be safe).
       * Serializer can still produce overlay-aware text against a null
       * overlay (which it'll treat as raw with overlayIncluded:false). */
      const r0 = serializer.serialize(snap, null, { includeOverlay: true, includeToc: includeToc, collapsedMode: collapsedMode });
      return {
        text: String(r0 && r0.text || ''),
        overlayIncluded: false,
        overlaySkipped: false,
      };
    }

    const ov = W.H2O?.Studio?.overlay;
    const ovStore = W.H2O?.Studio?.store?.editOverlay;
    if (!ovStore || typeof ovStore.get !== 'function') {
      return rawResult('store-unavailable');
    }

    return Promise.resolve(ovStore.get(sid)).then(function (overlay) {
      if (!overlay) {
        /* No overlay record — serializer would just emit raw. Short-
         * circuit so the call still resolves with the well-formed
         * shape and no spurious overlaySkipped flag. */
        const r1 = serializer.serialize(snap, null, { includeOverlay: true, includeToc: includeToc, collapsedMode: collapsedMode });
        return {
          text: String(r1 && r1.text || ''),
          overlayIncluded: false,
          overlaySkipped: false,
        };
      }

      /* Drift check — mirrors applyOverlayOp/undo/redo behaviour. On
       * drift, fall back to raw text and flag overlaySkipped. */
      if (ov && typeof ov.computeBaseDigest === 'function' && overlay.baseDigest) {
        let currentDigest = '';
        try { currentDigest = ov.computeBaseDigest(snap); }
        catch (_) { currentDigest = ''; }
        if (currentDigest && overlay.baseDigest !== currentDigest) {
          return rawResult('drift-detected');
        }
      }

      let result = null;
      try {
        result = serializer.serialize(snap, overlay, {
          includeOverlay: true,
          includeToc: includeToc,
          collapsedMode: collapsedMode,
        });
      } catch (_) {
        return rawResult('serializer-error');
      }
      if (!result || typeof result !== 'object') {
        return rawResult('serializer-error');
      }
      if (result.reason === 'serializer-error') {
        return rawResult('serializer-error');
      }
      const applied = Number(result.opsApplied) > 0 || result.structureApplied === true || result.tocIncluded === true;
      return {
        text: String(result.text || ''),
        overlayIncluded: !!applied,
        overlaySkipped: false,
      };
    }, function () {
      return rawResult('store-unavailable');
    });
  }).catch(function () {
    /* Last-resort floor — should be unreachable since every internal
     * path catches. Resolves rather than rejects, matching the
     * "never throws" contract. */
    return { text: '', overlayIncluded: false, overlaySkipped: false };
  });
}

/* ─── Phase 3a — Markdown export helpers + bridge method ──────────────────
 * Pure helpers (no DOM, no I/O) used by __ribbonBridge_exportMarkdown
 * to compose the .md file contents and produce a filesystem-safe
 * filename. Both are exported on RibbonBridge as well so smoke harnesses
 * + future export variants (.json / .csv) can reuse them. */

/* Sanitize a chat title into a filesystem-safe stem.
 *   - Replaces Windows-reserved chars (/\:*?"<>|) + control chars with '-'.
 *   - Collapses runs of '-' to a single '-'.
 *   - Trims leading/trailing '-' and whitespace.
 *   - Truncates to 80 chars (safe for cross-OS path limits).
 *   - Prefixes the Windows reserved device names (CON, PRN, AUX, NUL, COM1-9,
 *     LPT1-9) with '_' so the result is valid on Windows even though the
 *     extension is appended.
 *   - Returns '' for empty / unsalvageable input; caller picks a fallback. */
function __ribbonBridge_sanitizeFilenameStem(title){
  try {
    var raw = String(title == null ? '' : title);
    /* Strip control chars (0x00-0x1F + 0x7F) and Windows-reserved punct. */
    var cleaned = raw.replace(/[ -<>:"/\\|?*]/g, '-');
    /* Collapse whitespace runs to single spaces, then spaces to '-'. */
    cleaned = cleaned.replace(/\s+/g, ' ').trim().replace(/ /g, '-');
    /* Collapse runs of '-' to single '-'. */
    cleaned = cleaned.replace(/-{2,}/g, '-');
    /* Trim leading/trailing '-'. */
    cleaned = cleaned.replace(/^-+|-+$/g, '');
    if (!cleaned) return '';
    /* Truncate to 80 chars (re-trim trailing '-' after truncation). */
    if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).replace(/-+$/, '');
    /* Windows reserved device names — prefix with '_' to make safe. */
    var reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reserved.test(cleaned)) cleaned = '_' + cleaned;
    return cleaned;
  } catch (_) { return ''; }
}

/* Build the Markdown filename: "{stem}__{YYYY-MM-DD}.md". The date is
 * derived from snap.capturedAt's ISO date prefix if available, else
 * today's date. Empty stem falls back to "chat-{chatId8}" or
 * "studio-transcript". Always returns a string ending in ".md". */
function __ribbonBridge_buildMarkdownFilename(snap){
  try {
    var stem = __ribbonBridge_sanitizeFilenameStem(snap && snap.title);
    if (!stem) {
      var cid = String((snap && snap.chatId) || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (cid) stem = 'chat-' + cid.slice(0, 8);
      else stem = 'studio-transcript';
    }
    var date = '';
    var raw = (snap && snap.capturedAt) ? String(snap.capturedAt) : '';
    if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      date = raw.slice(0, 10);
    } else {
      var d = new Date();
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      date = y + '-' + m + '-' + dd;
    }
    return stem + '__' + date + '.md';
  } catch (_) { return 'studio-transcript.md'; }
}

/* Build the Markdown file header block:
 *
 *   # {title}
 *
 *   _Captured: {YYYY-MM-DD}_
 *   _Source: {originalUrl}_         (only when originalUrl provided)
 *   _Chat ID: {chatId}_             (only when chatId provided)
 *
 *   ---
 *
 * Each metadata line ends with two trailing spaces so Markdown
 * preserves the line break inside the same paragraph. Returns a
 * string ending with "\n\n" so the serializer body can be appended
 * directly. */
function __ribbonBridge_buildMarkdownHeader(snap, originalUrl){
  try {
    var lines = [];
    var title = String((snap && snap.title) || '').trim();
    lines.push('# ' + (title || 'Studio transcript'));
    lines.push('');
    var metaLines = [];
    /* Date from capturedAt ISO prefix; fall back to today. */
    var raw = (snap && snap.capturedAt) ? String(snap.capturedAt) : '';
    var date;
    if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) date = raw.slice(0, 10);
    else {
      var d = new Date();
      date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    metaLines.push('_Captured: ' + date + '_');
    var src = String(originalUrl == null ? '' : originalUrl).trim();
    if (src) metaLines.push('_Source: ' + src + '_');
    var chatId = String((snap && snap.chatId) || '').trim();
    if (chatId) metaLines.push('_Chat ID: ' + chatId + '_');
    /* Two trailing spaces preserve the visual line break within a
     * single Markdown paragraph (Markdown line-break syntax). */
    lines.push(metaLines.join('  \n'));
    lines.push('');
    lines.push('---');
    lines.push('');
    return lines.join('\n') + '\n';
  } catch (_) {
    return '# Studio transcript\n\n---\n\n';
  }
}

/* Phase 3a — export the current saved snapshot as a Markdown .md file.
 * Composes the file = header block + Phase 2e serializer output, then
 * writes via platform.files.exportBlob. When platform.files is
 * unavailable, falls back to an inline Blob + <a download> dance so the
 * feature still works in degraded environments.
 *
 * Returns Promise<{
 *   ok: boolean,
 *   reason?: 'no-snapshot' | 'no-content' | 'cancelled' | 'export-failed' | 'error',
 *   filename?: string,
 *   bytes?: number,
 *   path?: string,                   (Tauri native save path when applicable)
 *   overlayIncluded?: boolean,
 *   overlaySkipped?: boolean,
 *   overlayReason?: string,
 *   fallback?: 'blob-anchor' | 'platform-files',
 * }>. Never throws. */
function __ribbonBridge_exportMarkdown(opts){
  return Promise.resolve().then(function () {
    const options = (opts && typeof opts === 'object') ? opts : {};
    const includeOverlay = options.includeOverlay !== false;
    const includeToc = options.includeToc === true;
    const collapsedMode = (options.collapsedMode === 'include-silent' || options.collapsedMode === 'omit')
      ? options.collapsedMode
      : 'include-marked';

    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) {
      return { ok: false, reason: 'no-snapshot' };
    }

    /* Reuse Phase 2e: getCleanTranscript handles overlay fetch + drift
     * fallback + active-set filter. We just consume its result. */
    return Promise.resolve(__ribbonBridge_getCleanTranscript({
      includeOverlay: includeOverlay,
      includeToc: includeToc,
      collapsedMode: collapsedMode,
    })).then(function (tr) {
      const safeTr = (tr && typeof tr === 'object') ? tr : { text: '', overlayIncluded: false, overlaySkipped: false };
      const body = String(safeTr.text || '');
      if (!body.trim()) {
        return { ok: false, reason: 'no-content' };
      }

      /* Resolve originalUrl from the ribbon context (only present for
       * indexed chats — saved chats omit it from the header). */
      let originalUrl = '';
      try {
        const ribbon = W.H2O?.Studio?.ribbon;
        const ctx = (ribbon && typeof ribbon.getContext === 'function') ? ribbon.getContext() : null;
        if (ctx && typeof ctx.originalUrl === 'string') originalUrl = ctx.originalUrl;
      } catch (_) { originalUrl = ''; }

      const filename = __ribbonBridge_buildMarkdownFilename(snap);
      const header = __ribbonBridge_buildMarkdownHeader(snap, originalUrl);
      const content = header + body + '\n';

      let blob;
      try {
        blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      } catch (e) {
        return { ok: false, reason: 'error', error: String((e && e.message) || e || '') };
      }
      const bytes = blob.size;

      function inlineBlobAnchor() {
        return new Promise(function (resolve) {
          try {
            if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
              return resolve({ ok: false, reason: 'export-failed', error: 'URL.createObjectURL unavailable' });
            }
            if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
              return resolve({ ok: false, reason: 'export-failed', error: 'document unavailable' });
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            try {
              document.body.appendChild(a);
              a.click();
            } catch (e) {
              try { URL.revokeObjectURL(url); } catch (_) {}
              return resolve({ ok: false, reason: 'export-failed', error: String((e && e.message) || e || '') });
            }
            setTimeout(function () {
              try { document.body.removeChild(a); } catch (_) {}
              try { URL.revokeObjectURL(url); } catch (_) {}
            }, 200);
            resolve({ ok: true, filename: filename, bytes: bytes, fallback: 'blob-anchor' });
          } catch (e) {
            resolve({ ok: false, reason: 'error', error: String((e && e.message) || e || '') });
          }
        });
      }

      const files = W.H2O?.Studio?.platform?.files;
      const canExportViaPlatform = !!(files && files.available && typeof files.exportBlob === 'function');
      const writePromise = canExportViaPlatform
        ? Promise.resolve(files.exportBlob({ suggestedName: filename, blob: blob }))
            .then(undefined, function (err) {
              /* platform.files rejected — fall back to inline blob+anchor
               * so the user still gets a file. Log for diagnostics. */
              try { console.warn('[RibbonBridge.exportMarkdown] platform.files.exportBlob rejected; falling back', err); }
              catch (_) {}
              return inlineBlobAnchor();
            })
        : inlineBlobAnchor();

      return writePromise.then(function (res) {
        const r = (res && typeof res === 'object') ? res : {};
        if (r.ok === false && r.reason === 'cancelled') {
          /* User dismissed the Tauri save dialog. Informational, not
           * an error. */
          return { ok: false, reason: 'cancelled' };
        }
        if (r.ok === false) {
          return { ok: false, reason: r.reason || 'export-failed', error: String(r.error || '') };
        }
        return {
          ok: true,
          filename: filename,
          bytes: bytes,
          path: r.path,
          overlayIncluded: !!safeTr.overlayIncluded,
          overlaySkipped: !!safeTr.overlaySkipped,
          overlayReason: safeTr.reason,
          fallback: r.fallback || (canExportViaPlatform ? undefined : 'blob-anchor'),
        };
      });
    });
  }).catch(function (err) {
    return { ok: false, reason: 'error', error: String((err && err.message) || err || '') };
  });
}

/* ─── Phase 3c-B — DOCX export bridge + helpers ───────────────────────────
 * Composes the Phase 3c-A pure DOCX writer (H2O.Studio.overlayDocxWriter)
 * with H2O.Studio.platform.files.exportBlob and the inline Blob+anchor
 * fallback. Mirrors the Phase 3a Markdown bridge shape line-for-line so
 * the ribbon handler reads exactly the same fields.
 *
 * Tauri binary safety: the Phase 3c-B platform.tauri.js update detects
 * non-text MIME types and routes through plugin:fs|write_file (binary)
 * instead of plugin:fs|write_text_file (text). The DOCX MIME
 * (application/vnd.openxml...) triggers the binary path; if the fs plugin
 * doesn't have write_file allow-listed in capabilities, the existing
 * fallback chain catches the rejection and uses Blob+anchor download
 * (loses native save dialog on desktop but the file still saves). */

/* Suggested filename: {sanitized-title}__{YYYY-MM-DD}.docx. Reuses Phase
 * 3a's filename sanitizer + builder; just swaps .md for .docx. */
function __ribbonBridge_buildDocxFilename(snap){
  try {
    const md = __ribbonBridge_buildMarkdownFilename(snap);
    if (typeof md === 'string' && md.endsWith('.md')) return md.slice(0, -3) + '.docx';
    return String(md || 'studio-transcript') + '.docx';
  } catch (_) { return 'studio-transcript.docx'; }
}

/* Phase 3c-B — export the current saved snapshot as a Word .docx file.
 * Composes overlayDocxWriter.build() output with platform.files.exportBlob.
 * Drift fallback: when the overlay record's baseDigest doesn't match
 * snap.messages, the writer is called with overlay:null (raw mode) and
 * the result is flagged overlaySkipped:true, overlayReason:'drift-detected'.
 * The user still gets a valid .docx, just without the overlay decorations.
 *
 * Returns Promise<{
 *   ok: boolean,
 *   reason?: 'no-snapshot' | 'no-content' | 'cancelled' | 'export-failed' |
 *            'writer-unavailable' | 'error',
 *   filename?: string,
 *   bytes?: number,
 *   path?: string,                  (Tauri native save path when applicable)
 *   overlayIncluded?: boolean,
 *   overlaySkipped?: boolean,
 *   overlayReason?: string,
 *   fallback?: 'blob-anchor',
 * }>. Never throws. */
function __ribbonBridge_exportDocx(opts){
  return Promise.resolve().then(function () {
    const options = (opts && typeof opts === 'object') ? opts : {};
    const includeOverlay = options.includeOverlay !== false;
    const includeToc = options.includeToc === true;
    const collapsedMode = (options.collapsedMode === 'include-silent' || options.collapsedMode === 'omit')
      ? options.collapsedMode
      : 'include-marked';

    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) {
      return { ok: false, reason: 'no-snapshot' };
    }

    const writer = W.H2O?.Studio?.overlayDocxWriter;
    if (!writer || typeof writer.build !== 'function') {
      return { ok: false, reason: 'writer-unavailable' };
    }
    try {
      if (typeof writer.selfCheck === 'function' && writer.selfCheck().ok === false) {
        return { ok: false, reason: 'writer-unavailable', error: 'overlayDocxWriter.selfCheck not ok' };
      }
    } catch (_) { /* swallow — selfCheck is advisory */ }

    /* Resolve overlay record + drift detection. Mirrors the Phase 3a
     * exportMarkdown / Phase 2e getCleanTranscript pattern. */
    const sid = String(snap.snapshotId);
    const ov = W.H2O?.Studio?.overlay;
    const ovStore = W.H2O?.Studio?.store?.editOverlay;

    function resolveOverlay() {
      if (!includeOverlay) return Promise.resolve({ overlay: null, overlaySkipped: false, overlayReason: undefined });
      if (!ovStore || typeof ovStore.get !== 'function') {
        return Promise.resolve({ overlay: null, overlaySkipped: false, overlayReason: undefined });
      }
      return Promise.resolve(ovStore.get(sid)).then(function (overlay) {
        if (!overlay) return { overlay: null, overlaySkipped: false, overlayReason: undefined };
        if (ov && typeof ov.computeBaseDigest === 'function' && overlay.baseDigest) {
          let currentDigest = '';
          try { currentDigest = ov.computeBaseDigest(snap); } catch (_) { currentDigest = ''; }
          if (currentDigest && overlay.baseDigest !== currentDigest) {
            return { overlay: null, overlaySkipped: true, overlayReason: 'drift-detected' };
          }
        }
        return { overlay: overlay, overlaySkipped: false, overlayReason: undefined };
      }, function () {
        return { overlay: null, overlaySkipped: false, overlayReason: undefined };
      });
    }

    /* Resolve originalUrl from the ribbon context (only present for
     * indexed chats — saved chats omit it from the header). */
    function readOriginalUrl() {
      try {
        const ribbon = W.H2O?.Studio?.ribbon;
        const ctx = (ribbon && typeof ribbon.getContext === 'function') ? ribbon.getContext() : null;
        if (ctx && typeof ctx.originalUrl === 'string') return ctx.originalUrl;
      } catch (_) {}
      return '';
    }

    return resolveOverlay().then(function (resolved) {
      const originalUrl = readOriginalUrl();
      const headerMeta = {
        title: snap.title,
        capturedDate: (snap.capturedAt ? String(snap.capturedAt).slice(0, 10) : ''),
      };
      if (originalUrl) headerMeta.originalUrl = originalUrl;
      if (snap.chatId) headerMeta.chatId = snap.chatId;

      let built;
      try {
        built = writer.build({
          snap: snap,
          overlay: resolved.overlay,
          headerMeta: headerMeta,
          opts: {
            includeOverlay: includeOverlay && resolved.overlay !== null,
            includeToc: includeToc,
            collapsedMode: collapsedMode,
          },
        });
      } catch (e) {
        return { ok: false, reason: 'export-failed', error: String((e && e.message) || e || '') };
      }
      if (!built || !built.bytes || built.bytes.length === 0) {
        return { ok: false, reason: 'no-content' };
      }
      if (built.reason === 'writer-error') {
        /* Writer fell back to its minimal-DOCX recovery. Surface as an
         * export-failed so the user knows something went wrong even
         * though bytes were produced. */
        return { ok: false, reason: 'export-failed', error: 'writer-error: minimal DOCX returned' };
      }

      const blob = built.blob;
      const filename = __ribbonBridge_buildDocxFilename(snap);
      const overlayIncluded = !!(built.opsApplied > 0 || built.structureApplied === true || built.tocIncluded === true);

      function inlineBlobAnchor() {
        return new Promise(function (resolve) {
          try {
            if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
              return resolve({ ok: false, reason: 'export-failed', error: 'URL.createObjectURL unavailable' });
            }
            if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
              return resolve({ ok: false, reason: 'export-failed', error: 'document unavailable' });
            }
            if (!blob) {
              return resolve({ ok: false, reason: 'export-failed', error: 'blob unavailable' });
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            try {
              document.body.appendChild(a);
              a.click();
            } catch (e) {
              try { URL.revokeObjectURL(url); } catch (_) {}
              return resolve({ ok: false, reason: 'export-failed', error: String((e && e.message) || e || '') });
            }
            setTimeout(function () {
              try { document.body.removeChild(a); } catch (_) {}
              try { URL.revokeObjectURL(url); } catch (_) {}
            }, 200);
            resolve({ ok: true, filename: filename, bytes: built.size, fallback: 'blob-anchor' });
          } catch (e) {
            resolve({ ok: false, reason: 'error', error: String((e && e.message) || e || '') });
          }
        });
      }

      const files = W.H2O?.Studio?.platform?.files;
      const canExportViaPlatform = !!(files && files.available && typeof files.exportBlob === 'function' && blob);
      const writePromise = canExportViaPlatform
        ? Promise.resolve(files.exportBlob({ suggestedName: filename, blob: blob }))
            .then(undefined, function (err) {
              try { console.warn('[RibbonBridge.exportDocx] platform.files.exportBlob rejected; falling back', err); }
              catch (_) {}
              return inlineBlobAnchor();
            })
        : inlineBlobAnchor();

      return writePromise.then(function (res) {
        const r = (res && typeof res === 'object') ? res : {};
        if (r.ok === false && r.reason === 'cancelled') {
          return { ok: false, reason: 'cancelled' };
        }
        if (r.ok === false) {
          return { ok: false, reason: r.reason || 'export-failed', error: String(r.error || '') };
        }
        return {
          ok: true,
          filename: filename,
          bytes: built.size,
          path: r.path,
          overlayIncluded: overlayIncluded,
          overlaySkipped: resolved.overlaySkipped,
          overlayReason: resolved.overlayReason,
          fallback: r.fallback || (canExportViaPlatform ? undefined : 'blob-anchor'),
        };
      });
    });
  }).catch(function (err) {
    return { ok: false, reason: 'error', error: String((err && err.message) || err || '') };
  });
}

/* ─── Phase 3b — PDF / print view helpers + bridge method ──────────────────
 * Strategy A: window.print() over the live reader DOM. The browser's
 * print dialog offers "Save as PDF" as a destination on every modern OS
 * (Chrome, Edge, Firefox, Safari, Tauri webview). Studio injects a
 * temporary <header data-print-header> before .cgFrame, swaps
 * document.title for a sensible PDF filename, calls window.print(), and
 * unwinds. No JS PDF library, no Tauri plugin, no platform.files change.
 *
 * Cancellation limitation: window.print() is synchronous from JS and
 * returns no signal indicating whether the user saved a file or
 * dismissed the dialog. The bridge resolves ok:true for "we opened the
 * dialog"; the ribbon status string explains. Same constraint every
 * web-based print-to-PDF flow has. */

/* Build the print-only header element with title + date + optional
 * source + optional chat ID. Pure (constructs and returns a node; no
 * DOM mutation outside the returned element). Reused by the smoke. */
function __ribbonBridge_buildPrintHeaderEl(snap, originalUrl){
  try {
    const header = document.createElement('header');
    header.setAttribute('data-print-header', 'true');

    const titleEl = document.createElement('h1');
    titleEl.textContent = String((snap && snap.title) || 'Studio transcript');
    header.appendChild(titleEl);

    const meta = document.createElement('div');
    meta.className = 'wbPrintHeaderMeta';

    /* Date from capturedAt ISO prefix; fall back to today's local date. */
    let date;
    const raw = (snap && snap.capturedAt) ? String(snap.capturedAt) : '';
    if (raw && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      date = raw.slice(0, 10);
    } else {
      const d = new Date();
      date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    const dateSpan = document.createElement('span');
    dateSpan.textContent = 'Captured: ' + date;
    meta.appendChild(dateSpan);

    const src = String(originalUrl == null ? '' : originalUrl).trim();
    if (src) {
      const srcSpan = document.createElement('span');
      srcSpan.textContent = 'Source: ' + src;
      meta.appendChild(srcSpan);
    }
    const chatId = String((snap && snap.chatId) || '').trim();
    if (chatId) {
      const chatSpan = document.createElement('span');
      chatSpan.textContent = 'Chat ID: ' + chatId;
      meta.appendChild(chatSpan);
    }
    header.appendChild(meta);
    return header;
  } catch (_) {
    /* Last-resort minimal node so callers can still print. */
    try {
      const fallback = document.createElement('header');
      fallback.setAttribute('data-print-header', 'true');
      const h = document.createElement('h1');
      h.textContent = 'Studio transcript';
      fallback.appendChild(h);
      return fallback;
    } catch (_) { return null; }
  }
}

/* Suggested filename hint (the browser's save-as-PDF dialog ignores
 * this and uses document.title — we set that to a useful string below).
 * Kept for the bridge result + status messages. Reuses the Phase 3a
 * Markdown filename sanitizer; just swaps .md for .pdf. */
function __ribbonBridge_buildPdfFilename(snap){
  try {
    const md = __ribbonBridge_buildMarkdownFilename(snap);
    if (typeof md === 'string' && md.endsWith('.md')) return md.slice(0, -3) + '.pdf';
    return String(md || 'studio-transcript') + '.pdf';
  } catch (_) { return 'studio-transcript.pdf'; }
}

/* Coalesce concurrent print calls — only one print in flight at a time
 * (otherwise the document.title stash/restore can race). */
let __ribbonBridge_printInFlight = false;

/* Phase 3b — open the browser print dialog over the live reader DOM.
 * The CSS in studio.css (@media print block) hides Studio chrome and
 * keeps overlay decorations + the print-only header visible. The user
 * picks the destination (printer or Save as PDF) from the OS dialog.
 *
 * Returns Promise<{
 *   ok: boolean,
 *   reason?: 'no-snapshot' | 'no-content' | 'reader-unavailable' |
 *            'print-unavailable' | 'print-in-progress' | 'error',
 *   filename?: string,              suggested PDF filename
 *   overlayIncluded?: boolean,      mirrors getCleanTranscript shape
 *   overlaySkipped?: boolean,       true if drift detected
 *   overlayReason?: string,         'drift-detected' when applicable
 * }>. Never throws. */
function __ribbonBridge_openPrintView(opts){
  return Promise.resolve().then(function () {
    const options = (opts && typeof opts === 'object') ? opts : {};
    const includeHeader = options.includeHeader !== false; /* default true */

    if (__ribbonBridge_printInFlight) {
      return { ok: false, reason: 'print-in-progress' };
    }

    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) {
      return { ok: false, reason: 'no-snapshot' };
    }

    /* Locate the reader DOM. Phase 2/3 conventions: #viewReader > .cgFrame */
    let frame = null;
    try {
      const readerEl = document.getElementById('viewReader');
      frame = readerEl && readerEl.querySelector('.cgFrame');
    } catch (_) { frame = null; }
    if (!frame) {
      return { ok: false, reason: 'reader-unavailable' };
    }

    if (typeof window === 'undefined' || typeof window.print !== 'function') {
      return { ok: false, reason: 'print-unavailable' };
    }

    /* Compute drift status diagnostically. We do NOT refuse on drift —
     * the user pressed print and expects a render. We just surface the
     * fact via overlaySkipped so the ribbon status can flag it. */
    let overlaySkipped = false;
    let overlayReason;
    let overlayIncluded = false;
    try {
      const ov = W.H2O?.Studio?.overlay;
      const ovStore = W.H2O?.Studio?.store?.editOverlay;
      if (ov && typeof ov.computeBaseDigest === 'function' && ovStore && typeof ovStore.get === 'function') {
        /* Synchronous best-effort: read the cached overlay if available
         * (editOverlay caches after first get/upsert). For our purposes
         * the diagnostic is advisory; not awaiting keeps the bridge
         * snappy and avoids racing with the print dialog opening. */
        try {
          const maybe = ovStore.get(String(snap.snapshotId));
          if (maybe && typeof maybe.then === 'function') {
            /* Async path — we can't await before print() without delaying
             * the dialog; just leave the flags at defaults. */
          } else if (maybe) {
            const currentDigest = ov.computeBaseDigest(snap);
            if (maybe.baseDigest && maybe.baseDigest !== currentDigest) {
              overlaySkipped = true;
              overlayReason = 'drift-detected';
            } else if (Array.isArray(maybe.undoStack) && maybe.undoStack.length > 0) {
              overlayIncluded = true;
            }
          }
        } catch (_) { /* swallow — diagnostic only */ }
      }
    } catch (_) { /* swallow */ }

    /* Resolve originalUrl from the ribbon context for the header line. */
    let originalUrl = '';
    try {
      const ribbon = W.H2O?.Studio?.ribbon;
      const ctx = (ribbon && typeof ribbon.getContext === 'function') ? ribbon.getContext() : null;
      if (ctx && typeof ctx.originalUrl === 'string') originalUrl = ctx.originalUrl;
    } catch (_) { originalUrl = ''; }

    const filename = __ribbonBridge_buildPdfFilename(snap);
    const titleForPdf = String((snap && snap.title) || 'Studio transcript') + ' — Studio';

    /* Stash state for restoration in finally. */
    let injectedHeader = null;
    let previousTitle = '';
    __ribbonBridge_printInFlight = true;

    try {
      previousTitle = document.title;
      try { document.title = titleForPdf; } catch (_) { /* swallow */ }

      if (includeHeader) {
        injectedHeader = __ribbonBridge_buildPrintHeaderEl(snap, originalUrl);
        if (injectedHeader) {
          try { frame.insertBefore(injectedHeader, frame.firstChild || null); }
          catch (_) { injectedHeader = null; /* couldn't inject; print anyway */ }
        }
      }

      /* Call into the browser print dialog. Synchronous from JS. */
      try {
        window.print();
      } catch (printErr) {
        return { ok: false, reason: 'error', error: String((printErr && printErr.message) || printErr || '') };
      }

      return {
        ok: true,
        filename: filename,
        overlayIncluded: overlayIncluded,
        overlaySkipped: overlaySkipped,
        overlayReason: overlayReason,
      };
    } finally {
      /* Always restore — even if window.print threw or we returned
       * early. The injected header is short-lived and must not leak
       * into the live reader. */
      if (injectedHeader && injectedHeader.parentNode) {
        try { injectedHeader.parentNode.removeChild(injectedHeader); }
        catch (_) { /* swallow */ }
      }
      try {
        if (previousTitle != null) document.title = previousTitle;
      } catch (_) { /* swallow */ }
      __ribbonBridge_printInFlight = false;
    }
  }).catch(function (err) {
    /* Last-resort floor — guarantees the never-throw contract even if
     * the synchronous body above somehow rejected before the finally
     * ran. The finally above runs first in normal flow so this is
     * primarily a paranoia net. */
    __ribbonBridge_printInFlight = false;
    return { ok: false, reason: 'error', error: String((err && err.message) || err || '') };
  });
}

/* Phase 2a — narrow read-only accessor for the per-snapshot edit
 * overlay. Returns a Promise resolving to the EditOverlay record or
 * null. Never throws. */
function __ribbonBridge_getOverlay(snapshotId){
  try {
    const sid = String(snapshotId == null ? '' : snapshotId);
    if (!sid) return Promise.resolve(null);
    const ovStore = W.H2O && W.H2O.Studio && W.H2O.Studio.store && W.H2O.Studio.store.editOverlay;
    if (!ovStore || typeof ovStore.get !== 'function') return Promise.resolve(null);
    const r = ovStore.get(sid);
    return (r && typeof r.then === 'function') ? r : Promise.resolve(r || null);
  } catch (_) { return Promise.resolve(null); }
}

/* Phase 2b — pure-read accessor: compute the current visual state of a
 * specific message in the open snapshot's overlay. Returns a Promise
 * that resolves to a default-shape state object when no overlay exists
 * or no snapshot is open; returns the computed state otherwise. Used
 * by ribbon action handlers to decide whether to apply or toggle off.
 * Never throws. */
function __ribbonBridge_getMessageStateForTurn(turnIdx){
  const empty = { heading: null, quote: false, code: false, callout: null, cleanSpacing: false };
  try {
    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) return Promise.resolve(empty);
    const ovStore = W.H2O?.Studio?.store?.editOverlay;
    const ov = W.H2O?.Studio?.overlay;
    if (!ovStore || !ov || typeof ov.computeMessageState !== 'function') return Promise.resolve(empty);
    return Promise.resolve(ovStore.get(String(snap.snapshotId))).then(function (overlay) {
      if (!overlay) return empty;
      try { return ov.computeMessageState(overlay, Number(turnIdx)); }
      catch (_) { return empty; }
    }, function () { return empty; });
  } catch (_) { return Promise.resolve(empty); }
}

/* Phase 2c-A — pure-read accessor: compute the current structure state
 * (sections + page dividers + TOC slot) for the open snapshot's overlay.
 * Used by ribbon action handlers to decide auto-numbering for new
 * sections, to look up "is selected turn inside a section" for the
 * Split / Collapse enable rules, and (in Phase 2c-B) to toggle TOC.
 * Returns default-shape object when no overlay/snapshot. Never throws. */
function __ribbonBridge_getStructureState(){
  const empty = { sections: [], dividers: [], toc: { position: null } };
  try {
    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) return Promise.resolve(empty);
    const ovStore = W.H2O?.Studio?.store?.editOverlay;
    const ov = W.H2O?.Studio?.overlay;
    if (!ovStore || !ov || typeof ov.computeStructureState !== 'function') return Promise.resolve(empty);
    return Promise.resolve(ovStore.get(String(snap.snapshotId))).then(function (overlay) {
      if (!overlay) return empty;
      try { return ov.computeStructureState(overlay); }
      catch (_) { return empty; }
    }, function () { return empty; });
  } catch (_) { return Promise.resolve(empty); }
}

/* Phase 2b — orchestrates a single overlay op: load-or-create overlay,
 * drift-check against current snapshot, append op (pure helper),
 * upsert to store, and re-apply to live reader DOM. Returns
 * Promise<{ ok, reason?, overlay?, outcome?, error? }>. Never throws.
 * Never mutates snap.messages. */
function __ribbonBridge_applyOverlayOp(opSpec){
  return Promise.resolve().then(function () {
    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) {
      return { ok: false, reason: 'no-snapshot' };
    }
    const ov = W.H2O?.Studio?.overlay;
    const ovStore = W.H2O?.Studio?.store?.editOverlay;
    if (!ov || typeof ov.computeBaseDigest !== 'function' || typeof ov.appendOp !== 'function' || typeof ov.applyOverlay !== 'function') {
      return { ok: false, reason: 'overlay-unavailable' };
    }
    if (!ovStore || typeof ovStore.get !== 'function' || typeof ovStore.upsert !== 'function') {
      return { ok: false, reason: 'store-unavailable' };
    }
    const sid = String(snap.snapshotId);
    return Promise.resolve(ovStore.get(sid)).then(function (existing) {
      let overlay = existing;
      if (!overlay) {
        try { overlay = ov.createEmpty({ snapshot: snap }); }
        catch (_) { overlay = null; }
        if (!overlay) return { ok: false, reason: 'create-empty-failed' };
      }
      /* Drift check — refuse to mutate an overlay that no longer
       * matches the current snapshot. The applier ALSO refuses to
       * render on drift, but we check here first so we don't persist
       * a new op against a stale baseDigest. */
      const currentDigest = ov.computeBaseDigest(snap);
      if (overlay.baseDigest && overlay.baseDigest !== currentDigest) {
        return { ok: false, reason: 'drift-detected', overlay: overlay, currentDigest: currentDigest };
      }
      /* Append op (pure) */
      const next = ov.appendOp(overlay, opSpec);
      if (!next) return { ok: false, reason: 'append-failed' };
      /* Persist */
      return Promise.resolve(ovStore.upsert(next)).then(function (saved) {
        /* Re-apply to the live reader DOM */
        let outcome = null;
        try {
          const readerEl = document.getElementById('viewReader');
          const frame = readerEl && readerEl.querySelector('.cgFrame');
          if (frame) outcome = ov.applyOverlay(frame, snap, saved);
        } catch (_) { /* swallow — apply failure does not invalidate the persisted op */ }
        /* Publish hasOverlay = true now.
         * Phase 2d — also republish undoCount / redoCount so the Home
         * tab Undo/Redo buttons immediately reflect the new stack
         * shape after each forward op (and after the redoStack clear
         * that appendOp performs). */
        try {
          const ribbon = W.H2O?.Studio?.ribbon;
          if (ribbon && typeof ribbon.setContext === 'function') {
            const ctx = ribbon.getContext();
            const hasOps = !!(saved && Array.isArray(saved.ops) && saved.ops.length > 0);
            const undoN = (saved && Array.isArray(saved.undoStack)) ? saved.undoStack.length : 0;
            const redoN = (saved && Array.isArray(saved.redoStack)) ? saved.redoStack.length : 0;
            ribbon.setContext(Object.assign({}, ctx, {
              hasOverlay: hasOps,
              undoCount: undoN,
              redoCount: redoN,
            }));
          }
        } catch (_) { /* swallow */ }
        return { ok: true, overlay: saved, outcome: outcome };
      }, function (err) {
        return { ok: false, reason: 'upsert-failed', error: String((err && err.message) || err || '') };
      });
    }, function (err) {
      return { ok: false, reason: 'get-failed', error: String((err && err.message) || err || '') };
    });
  }).catch(function (err) {
    return { ok: false, reason: 'error', error: String((err && err.message) || err || '') };
  });
}

/* Phase 2d — shared helper that re-applies an overlay record to the live
 * reader DOM and republishes hasOverlay/undoCount/redoCount to the
 * ribbon context. Used by RibbonBridge.undo / RibbonBridge.redo after
 * each stack manipulation. Never throws. */
function __ribbonBridge_publishAndRender(snap, saved){
  let outcome = null;
  try {
    const ov = W.H2O?.Studio?.overlay;
    const readerEl = document.getElementById('viewReader');
    const frame = readerEl && readerEl.querySelector('.cgFrame');
    if (frame && ov && typeof ov.applyOverlay === 'function') {
      outcome = ov.applyOverlay(frame, snap, saved);
    }
  } catch (_) { /* swallow — apply failure does not invalidate the persisted stack change */ }
  try {
    const ribbon = W.H2O?.Studio?.ribbon;
    if (ribbon && typeof ribbon.setContext === 'function') {
      const ctx = ribbon.getContext();
      const hasOps = !!(saved && Array.isArray(saved.ops) && saved.ops.length > 0);
      const undoN = (saved && Array.isArray(saved.undoStack)) ? saved.undoStack.length : 0;
      const redoN = (saved && Array.isArray(saved.redoStack)) ? saved.redoStack.length : 0;
      ribbon.setContext(Object.assign({}, ctx, {
        hasOverlay: hasOps,
        undoCount: undoN,
        redoCount: redoN,
      }));
    }
  } catch (_) { /* swallow */ }
  return outcome;
}

/* Phase 2d — derive a short human label from an op (for status feedback
 * like "Undone: H2", "Redone: Section"). Returns null when the op has no
 * recognisable shape. Synchronous, never throws. Labels are advisory
 * only — no i18n. */
function __ribbonBridge_labelForOp(op){
  try {
    if (!op || typeof op !== 'object') return null;
    const type = String(op.type || '');
    const payload = (op.payload && typeof op.payload === 'object') ? op.payload : {};
    switch (type) {
      case 'heading': {
        const lvl = Number(payload.level);
        if (lvl === 1 || lvl === 2 || lvl === 3) return 'H' + lvl;
        return 'Heading';
      }
      case 'quote':         return 'Quote';
      case 'code':
      case 'code-block':    return 'Code block';
      case 'callout':       return 'Callout';
      case 'clean-spacing': return 'Clean spacing';
      case 'add-section':
      case 'split-section': return 'Section';
      case 'collapse-section': return payload.collapsed ? 'Collapse' : 'Expand';
      case 'page-divider':  return 'Divider';
      case 'toc':           return payload.position ? 'TOC on' : 'TOC off';
      default:              return type || null;
    }
  } catch (_) { return null; }
}

/* Phase 2d — undo the most recent active op on the current snapshot's
 * overlay. Uses the reducer-filter active-set model: ops are NOT deleted
 * from overlay.ops; instead the op id is moved from undoStack to
 * redoStack and the reducer simply stops applying it. Drift-checks
 * against the current snapshot baseDigest with the same logic
 * applyOverlayOp uses — refuses safely on drift without mutating the
 * stacks. Returns Promise<{ ok, reason?, overlay?, outcome?,
 * undoCount?, redoCount?, label? }>. Never throws. */
function __ribbonBridge_undo(){
  return Promise.resolve().then(function () {
    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) return { ok: false, reason: 'no-snapshot' };
    const ov = W.H2O?.Studio?.overlay;
    const ovStore = W.H2O?.Studio?.store?.editOverlay;
    if (!ov || typeof ov.computeBaseDigest !== 'function' || typeof ov.popUndo !== 'function') {
      return { ok: false, reason: 'overlay-unavailable' };
    }
    if (!ovStore || typeof ovStore.get !== 'function' || typeof ovStore.upsert !== 'function') {
      return { ok: false, reason: 'store-unavailable' };
    }
    const sid = String(snap.snapshotId);
    return Promise.resolve(ovStore.get(sid)).then(function (existing) {
      if (!existing) return { ok: false, reason: 'no-overlay' };
      const undo = Array.isArray(existing.undoStack) ? existing.undoStack : [];
      if (undo.length === 0) return { ok: false, reason: 'no-undo', undoCount: 0, redoCount: Array.isArray(existing.redoStack) ? existing.redoStack.length : 0 };
      /* Drift check — same precedent as applyOverlayOp. Refuses safely
       * without mutating either stack. */
      const currentDigest = ov.computeBaseDigest(snap);
      if (existing.baseDigest && existing.baseDigest !== currentDigest) {
        return { ok: false, reason: 'drift-detected', overlay: existing, currentDigest: currentDigest };
      }
      /* Identify the op that's about to be undone (for the label). */
      const undoneOpId = undo[undo.length - 1];
      const ops = Array.isArray(existing.ops) ? existing.ops : [];
      let undoneOp = null;
      for (let i = ops.length - 1; i >= 0; i -= 1) {
        if (ops[i] && String(ops[i].id) === String(undoneOpId)) { undoneOp = ops[i]; break; }
      }
      const next = ov.popUndo(existing);
      if (!next) return { ok: false, reason: 'pop-undo-failed' };
      return Promise.resolve(ovStore.upsert(next)).then(function (saved) {
        const outcome = __ribbonBridge_publishAndRender(snap, saved);
        return {
          ok: true,
          overlay: saved,
          outcome: outcome,
          undoCount: (saved && Array.isArray(saved.undoStack)) ? saved.undoStack.length : 0,
          redoCount: (saved && Array.isArray(saved.redoStack)) ? saved.redoStack.length : 0,
          label: __ribbonBridge_labelForOp(undoneOp),
        };
      }, function (err) {
        return { ok: false, reason: 'upsert-failed', error: String((err && err.message) || err || '') };
      });
    }, function (err) {
      return { ok: false, reason: 'get-failed', error: String((err && err.message) || err || '') };
    });
  }).catch(function (err) {
    return { ok: false, reason: 'error', error: String((err && err.message) || err || '') };
  });
}

/* Phase 2d — redo the most recently-undone op on the current snapshot's
 * overlay. Mirror of __ribbonBridge_undo: moves an id from redoStack
 * back onto undoStack, re-renders, republishes counts. Drift-checks
 * identically. Never throws. */
function __ribbonBridge_redo(){
  return Promise.resolve().then(function () {
    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) return { ok: false, reason: 'no-snapshot' };
    const ov = W.H2O?.Studio?.overlay;
    const ovStore = W.H2O?.Studio?.store?.editOverlay;
    if (!ov || typeof ov.computeBaseDigest !== 'function' || typeof ov.popRedo !== 'function') {
      return { ok: false, reason: 'overlay-unavailable' };
    }
    if (!ovStore || typeof ovStore.get !== 'function' || typeof ovStore.upsert !== 'function') {
      return { ok: false, reason: 'store-unavailable' };
    }
    const sid = String(snap.snapshotId);
    return Promise.resolve(ovStore.get(sid)).then(function (existing) {
      if (!existing) return { ok: false, reason: 'no-overlay' };
      const redo = Array.isArray(existing.redoStack) ? existing.redoStack : [];
      if (redo.length === 0) return { ok: false, reason: 'no-redo', undoCount: Array.isArray(existing.undoStack) ? existing.undoStack.length : 0, redoCount: 0 };
      const currentDigest = ov.computeBaseDigest(snap);
      if (existing.baseDigest && existing.baseDigest !== currentDigest) {
        return { ok: false, reason: 'drift-detected', overlay: existing, currentDigest: currentDigest };
      }
      const redoneOpId = redo[redo.length - 1];
      const ops = Array.isArray(existing.ops) ? existing.ops : [];
      let redoneOp = null;
      for (let i = ops.length - 1; i >= 0; i -= 1) {
        if (ops[i] && String(ops[i].id) === String(redoneOpId)) { redoneOp = ops[i]; break; }
      }
      const next = ov.popRedo(existing);
      if (!next) return { ok: false, reason: 'pop-redo-failed' };
      return Promise.resolve(ovStore.upsert(next)).then(function (saved) {
        const outcome = __ribbonBridge_publishAndRender(snap, saved);
        return {
          ok: true,
          overlay: saved,
          outcome: outcome,
          undoCount: (saved && Array.isArray(saved.undoStack)) ? saved.undoStack.length : 0,
          redoCount: (saved && Array.isArray(saved.redoStack)) ? saved.redoStack.length : 0,
          label: __ribbonBridge_labelForOp(redoneOp),
        };
      }, function (err) {
        return { ok: false, reason: 'upsert-failed', error: String((err && err.message) || err || '') };
      });
    }, function (err) {
      return { ok: false, reason: 'get-failed', error: String((err && err.message) || err || '') };
    });
  }).catch(function (err) {
    return { ok: false, reason: 'error', error: String((err && err.message) || err || '') };
  });
}

/* Phase 2d — pure-read accessor for the Home tab Undo/Redo enable
 * rules. Returns Promise<{ undoCount, redoCount, lastUndoLabel?,
 * lastRedoLabel? }>. Empty stacks → 0/0 with no label fields. Never
 * throws. Treats missing undoStack as 0 (the active-set migration only
 * applies to the renderer; history counts always reflect the actual
 * arrays). */
function __ribbonBridge_getHistoryState(){
  const empty = { undoCount: 0, redoCount: 0 };
  try {
    const snap = state && state.currentReaderSnapshot;
    if (!snap || !snap.snapshotId) return Promise.resolve(empty);
    const ovStore = W.H2O?.Studio?.store?.editOverlay;
    if (!ovStore || typeof ovStore.get !== 'function') return Promise.resolve(empty);
    return Promise.resolve(ovStore.get(String(snap.snapshotId))).then(function (overlay) {
      if (!overlay) return empty;
      const undo = Array.isArray(overlay.undoStack) ? overlay.undoStack : [];
      const redo = Array.isArray(overlay.redoStack) ? overlay.redoStack : [];
      const ops = Array.isArray(overlay.ops) ? overlay.ops : [];
      const out = { undoCount: undo.length, redoCount: redo.length };
      if (undo.length > 0) {
        const topUndoId = String(undo[undo.length - 1]);
        for (let i = ops.length - 1; i >= 0; i -= 1) {
          if (ops[i] && String(ops[i].id) === topUndoId) {
            const lbl = __ribbonBridge_labelForOp(ops[i]);
            if (lbl) out.lastUndoLabel = lbl;
            break;
          }
        }
      }
      if (redo.length > 0) {
        const topRedoId = String(redo[redo.length - 1]);
        for (let j = ops.length - 1; j >= 0; j -= 1) {
          if (ops[j] && String(ops[j].id) === topRedoId) {
            const lbl2 = __ribbonBridge_labelForOp(ops[j]);
            if (lbl2) out.lastRedoLabel = lbl2;
            break;
          }
        }
      }
      return out;
    }, function () { return empty; });
  } catch (_) { return Promise.resolve(empty); }
}

try {
  W.H2O = W.H2O || {};
  W.H2O.Studio = W.H2O.Studio || {};
  if (!W.H2O.Studio.RibbonBridge || !W.H2O.Studio.RibbonBridge.__installed) {
    W.H2O.Studio.RibbonBridge = {
      __installed: true,
      version: '0.1.0-phase-3c-b',
      getCleanTranscript: __ribbonBridge_getCleanTranscript,
      getOverlay: __ribbonBridge_getOverlay,
      getMessageStateForTurn: __ribbonBridge_getMessageStateForTurn,
      getStructureState: __ribbonBridge_getStructureState,
      applyOverlayOp: __ribbonBridge_applyOverlayOp,
      undo: __ribbonBridge_undo,
      redo: __ribbonBridge_redo,
      getHistoryState: __ribbonBridge_getHistoryState,
      /* Phase 3a — Markdown export. */
      exportMarkdown: __ribbonBridge_exportMarkdown,
      _sanitizeFilenameStem: __ribbonBridge_sanitizeFilenameStem,
      _buildMarkdownFilename: __ribbonBridge_buildMarkdownFilename,
      _buildMarkdownHeader: __ribbonBridge_buildMarkdownHeader,
      /* Phase 3b — PDF / print view. */
      openPrintView: __ribbonBridge_openPrintView,
      _buildPrintHeaderEl: __ribbonBridge_buildPrintHeaderEl,
      _buildPdfFilename: __ribbonBridge_buildPdfFilename,
      /* Phase 3c-B — DOCX export. */
      exportDocx: __ribbonBridge_exportDocx,
      _buildDocxFilename: __ribbonBridge_buildDocxFilename,
    };
  } else {
    /* Idempotent additive upgrade. */
    if (!W.H2O.Studio.RibbonBridge.getOverlay) W.H2O.Studio.RibbonBridge.getOverlay = __ribbonBridge_getOverlay;
    if (!W.H2O.Studio.RibbonBridge.getMessageStateForTurn) W.H2O.Studio.RibbonBridge.getMessageStateForTurn = __ribbonBridge_getMessageStateForTurn;
    if (!W.H2O.Studio.RibbonBridge.getStructureState) W.H2O.Studio.RibbonBridge.getStructureState = __ribbonBridge_getStructureState;
    if (!W.H2O.Studio.RibbonBridge.applyOverlayOp) W.H2O.Studio.RibbonBridge.applyOverlayOp = __ribbonBridge_applyOverlayOp;
    /* Phase 2d — undo/redo/getHistoryState additive upgrade. */
    if (!W.H2O.Studio.RibbonBridge.undo) W.H2O.Studio.RibbonBridge.undo = __ribbonBridge_undo;
    if (!W.H2O.Studio.RibbonBridge.redo) W.H2O.Studio.RibbonBridge.redo = __ribbonBridge_redo;
    if (!W.H2O.Studio.RibbonBridge.getHistoryState) W.H2O.Studio.RibbonBridge.getHistoryState = __ribbonBridge_getHistoryState;
    /* Phase 2e — getCleanTranscript shape changed from sync string to
     * async object. Reinstall the function reference even when an
     * older RibbonBridge is already installed, so hot-reloads pick up
     * the new contract instead of holding the Phase 1b sync version. */
    W.H2O.Studio.RibbonBridge.getCleanTranscript = __ribbonBridge_getCleanTranscript;
    /* Phase 3a — Markdown export. Reinstall reference on hot reload. */
    W.H2O.Studio.RibbonBridge.exportMarkdown = __ribbonBridge_exportMarkdown;
    if (!W.H2O.Studio.RibbonBridge._sanitizeFilenameStem) W.H2O.Studio.RibbonBridge._sanitizeFilenameStem = __ribbonBridge_sanitizeFilenameStem;
    if (!W.H2O.Studio.RibbonBridge._buildMarkdownFilename) W.H2O.Studio.RibbonBridge._buildMarkdownFilename = __ribbonBridge_buildMarkdownFilename;
    if (!W.H2O.Studio.RibbonBridge._buildMarkdownHeader) W.H2O.Studio.RibbonBridge._buildMarkdownHeader = __ribbonBridge_buildMarkdownHeader;
    /* Phase 3b — PDF / print view. Reinstall reference on hot reload. */
    W.H2O.Studio.RibbonBridge.openPrintView = __ribbonBridge_openPrintView;
    if (!W.H2O.Studio.RibbonBridge._buildPrintHeaderEl) W.H2O.Studio.RibbonBridge._buildPrintHeaderEl = __ribbonBridge_buildPrintHeaderEl;
    if (!W.H2O.Studio.RibbonBridge._buildPdfFilename) W.H2O.Studio.RibbonBridge._buildPdfFilename = __ribbonBridge_buildPdfFilename;
    /* Phase 3c-B — DOCX export. Reinstall reference on hot reload. */
    W.H2O.Studio.RibbonBridge.exportDocx = __ribbonBridge_exportDocx;
    if (!W.H2O.Studio.RibbonBridge._buildDocxFilename) W.H2O.Studio.RibbonBridge._buildDocxFilename = __ribbonBridge_buildDocxFilename;
    W.H2O.Studio.RibbonBridge.version = '0.1.0-phase-3c-b';
  }
} catch (_) { /* swallow */ }
