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

function applyUiState(){
  document.body.dataset.sidebar = state.sidebarExpanded ? "open" : "closed";
  document.body.dataset.density = state.density;
  document.body.dataset.layout = state.layout;
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
  return "Saved";
}

function viewCopy(view){
  const next = normalizeArchiveView(view);
  if (next === "pinned") return "Pinned snapshots";
  if (next === "archive") return "Archived conversations";
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
    // Plain text — consume up to the next potential marker character
    const nextMarker = s.search(/[`*_\[]/);
    if (nextMarker > 0){
      const skipImageMarker = s[nextMarker] === "[" && s[nextMarker - 1] === "!";
      const end = skipImageMarker ? nextMarker + 1 : nextMarker;
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
  return folder;
}

function normalizeWorkbenchRow(raw){
  const row = raw && typeof raw === "object" ? raw : {};
  const messages = Array.isArray(row.messages) ? row.messages : [];
  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const snapshotId = String(row.snapshotId || meta.snapshotId || "").trim();
  const chatId = String(row.chatId || meta.chatId || "").trim();
  if (!snapshotId || !chatId) return null;

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
// accepts. Linked-only chats (Add-to-Library without snapshot) have
// snapshotId === null and are filtered by normalizeWorkbenchRow's guard,
// so this V1 surface shows saved snapshots only. A separate "linked
// chats" view is a future stage.
function projectLibraryIndexRowToWorkbenchInput(liRow){
  if (!liRow || typeof liRow !== 'object') return null;
  const chatId = String(liRow.chatId || '').trim();
  const snapshotId = String(liRow.snapshotId || '').trim();
  if (!chatId || !snapshotId) return null;

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
    snapshotId,
    chatId,
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
    meta: {
      title: liRow.title || '',
      folderId: liRow.folderId || '',
      folderName: liRow.folderName || '',
      messageCount: Number(liRow.messageCount || 0),
      updatedAt: updatedAtIso || '',
    },
  };
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
  if (STUDIO_isTauri() && W.H2O?.LibraryIndex && typeof W.H2O.LibraryIndex.getAll === 'function') {
    try {
      const liRows = W.H2O.LibraryIndex.getAll() || [];
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
    state.rowsCache = direct.result.map(normalizeWorkbenchRow).filter(Boolean);
    return state.rowsCache.slice();
  }

  const directErr = direct.error?.message || "";
  const idsAttempt = await tryArchiveOps(CHAT_ID_OPS, {});
  if (idsAttempt.ok && Array.isArray(idsAttempt.result)){
    state.lastFetchDiag = { source: idsAttempt.op, directOk: false, idsOk: true, errors: directErr ? [directErr] : [] };
    state.rowsCache = await buildRowsFromChatIds(idsAttempt.result);
    return state.rowsCache.slice();
  }

  const errors = [directErr, idsAttempt.error?.message || ""].filter(Boolean);
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

async function fetchFolderCatalog(force = false){
  if (!force && Array.isArray(state.folderCatalog) && state.folderCatalog.length) return state.folderCatalog.slice();
  const ws = getLibraryWorkspace();
  if (ws?.getFolders){
    try {
      const list = await ws.getFolders({ fresh: !!force });
      if (Array.isArray(list)){
        state.folderCatalog = normalizeFolderCatalog(list);
        return Array.isArray(state.folderCatalog) ? state.folderCatalog.slice() : [];
      }
    } catch { /* fall through to archive bridge */ }
  }
  const attempt = await tryArchiveOps(FOLDER_LIST_OPS, {});
  if (attempt.ok){
    state.folderCatalog = normalizeFolderCatalog(attempt.result);
  }
  return Array.isArray(state.folderCatalog) ? state.folderCatalog.slice() : [];
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
  const fallbackCatalog = deriveFolderCatalogFromRows(baseRows);
  const [catalog, bindingMap] = await Promise.all([
    fetchFolderCatalog(force).catch(() => []),
    resolveFolderBindingsForChatIds(baseRows.map((row) => row.chatId)).catch(() => new Map()),
  ]);

  state.folderCatalog = mergeFolderCatalogs(catalog, fallbackCatalog);
  const merged = baseRows.map((row) => mergeRowFolderData(row, bindingMap));
  state.rowsCache = merged.slice();
  return merged;
}

function matchesView(row, view){
  if (!row) return false;
  const next = normalizeArchiveView(view);
  if (next === "pinned") return !!row.pinned;
  if (next === "archive") return !!row.archived;
  if (next === "saved") return !row.archived;
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
    const haystack = [
      row.title,
      row.excerpt,
      row.chatId,
      row.folderId,
      row.folderName,
      row.originSource,
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

function collectFolderSidebarItems(rows, view){
  const base = (Array.isArray(rows) ? rows : []).filter((row) => matchesView(row, view));
  const counts = new Map();
  let unfiledCount = 0;
  for (const row of base){
    const folderId = String(row?.folderId || "").trim();
    if (!folderId) {
      unfiledCount += 1;
      continue;
    }
    counts.set(folderId, (counts.get(folderId) || 0) + 1);
  }

  const catalog = mergeFolderCatalogs(state.folderCatalog, deriveFolderCatalogFromRows(base));
  const out = [{ folderId: "", label: "All folders", count: base.length, kind: "all" }];
  for (const folder of catalog){
    out.push({
      folderId: folder.id,
      label: folder.name || folder.id,
      count: counts.get(folder.id) || 0,
      kind: "folder",
      folderKind: folder.kind || "local",
      iconColor: normalizeSidebarIconColor(folder.iconColor || ""),
    });
  }
  if (unfiledCount || state.lastFolderId === FOLDER_FILTER_NONE) {
    out.push({ folderId: FOLDER_FILTER_NONE, label: "Unfiled", count: unfiledCount, kind: "utility" });
  }
  return out;
}

const SIDEBAR_FOLDER_ICON_SVG = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>
`;

function renderFolderSidebar(rows, view, selectedFolderId){
  const host = $("#folderList");
  if (!host) return;
  const items = collectFolderSidebarItems(rows, view);
  host.innerHTML = "";

  const folderEntries = items.filter((item) => item.kind === "folder");
  if (items.length <= 1 && !folderEntries.length){
    host.innerHTML = `<div class="wbSideEmpty">No saved folder contract found yet. Capture or assign a chat to a folder from chatgpt.com.</div>`;
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
    const appearance = item.kind === "folder"
      ? W.H2O?.Library?.SidebarSections?.getRowAppearance?.({
        kind: "folders",
        id: item.folderId,
        folderId: item.folderId,
        name: item.label,
        color: item.iconColor || "",
      })
      : null;
    if (appearance?.hidden) return;
    const displayLabel = String(appearance?.name || item.label || "").trim() || item.folderId || "";
    const folderIconSvg = appearance?.iconSvg || SIDEBAR_FOLDER_ICON_SVG;
    const link = document.createElement("a");
    link.className = "wbFolderItem";
    if (!item.count) link.classList.add("is-empty");
    if (item.folderKind === "project_backed") link.classList.add("is-project-backed");
    link.href = buildListHash(view, item.folderId);
    link.dataset.folderId = String(item.folderId || "");
    const iconColor = normalizeSidebarIconColor(appearance?.color || item.iconColor || "");
    if (iconColor) {
      link.dataset.color = iconColor;
      link.style.setProperty("--wb-sidebar-item-color", iconColor);
    }
    const folderMenuHtml = item.kind === "folder"
      ? `<button class="wbFolderMenuBtn" type="button" aria-label="More options for ${esc(displayLabel)}" aria-haspopup="menu" aria-expanded="false" title="More options for ${esc(displayLabel)}">...</button>`
      : `<span class="wbFolderMenuSlot" aria-hidden="true"></span>`;
    link.innerHTML = `
      <span class="wbFolderIcon" aria-hidden="true">${folderIconSvg}</span>
      <span class="wbFolderLabel">${esc(displayLabel)}</span>
      <span class="wbFolderCount">${esc(String(item.count || 0))}</span>
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
          });
        }
      });
    }
    host.appendChild(link);
  });

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
    link.href = `#/read/${encodeURIComponent(row.snapshotId)}`;
    link.dataset.snapshotId = row.snapshotId;
    link.dataset.chatId = row.chatId;
    if (row.snapshotId === activeSnapshotId) link.classList.add("active");

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
  const catalog = mergeFolderCatalogs(state.folderCatalog, deriveFolderCatalogFromRows(state.rowsCache || []));
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
  article.dataset.snapshotId = row.snapshotId;
  article.dataset.chatId = row.chatId;
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
    location.hash = `#/read/${encodeURIComponent(row.snapshotId)}`;
  });
  syncRowTools(article, row);

  return article;
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
      fetchFolderCatalog(false).catch(() => []),
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
  const route = parseHash();
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

  refreshSettingsDiagnostics(panel);
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
  ["h2o:chat-title:changed", "h2o:chat-title:emoji-updated", "evt:h2o:chat-title:changed", "evt:h2o:chat-title:emoji-updated", "evt:h2o:library:cross-surface-sync"].forEach((eventName) => {
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
