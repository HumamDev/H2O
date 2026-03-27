// @version 1.0.0
export function makeChromeLiveBackgroundJs({ DEV_TAG, CHAT_MATCH, DEV_HAS_CONTROLS }) {
  return `const TAG = ${JSON.stringify(DEV_TAG)};
const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
const MSG_HTTP = "h2o-ext-live:http";
const MSG_PAGE_DISABLE_ONCE = "h2o-ext-live:page-disable-once";
const MSG_PAGE_SET_LINK = "h2o-ext-live:page-set-link";
const MSG_ARCHIVE = "h2o-ext-archive:v1";
const MSG_FOLDERS = "h2o-ext-folders:v1";
const CHAT_MATCH = ${JSON.stringify(CHAT_MATCH)};
const ARCHIVE_WORKBENCH_ENABLED = ${JSON.stringify(DEV_HAS_CONTROLS)};
const PAGE_DISABLE_ONCE_MAX_AGE_MS = 10 * 60 * 1000;
const DEV_SET_SLOTS = [1, 2, 3, 4, 5, 6];
const STORAGE_TOGGLE_SETS_KEY = "h2oExtDevToggleSetsV1";
const CHAT_SET_BINDINGS_KEY = "h2oExtDevChatSetBindingsV1";
const CHAT_SET_BYPASS_KEY = "h2oExtDevChatSetBypassV1";
const GLOBAL_DEFAULT_SET_KEY = "h2oExtDevGlobalDefaultSetV1";

const MODE_LIVE_FIRST = "live_first";
const MODE_ARCHIVE_FIRST = "archive_first";
const MODE_ARCHIVE_ONLY = "archive_only";
const DEFAULT_NS_DISK = "h2o:prm:cgx:h2odata";
const RETENTION_KEEP_LATEST = 30;
const CHUNK_SIZE = 100;

const DB_NAME = "h2o_chat_archive";
const DB_VERSION = 1;
const STORE_SNAPSHOTS = "snapshots";
const STORE_CHUNKS = "chunks";
const ARCHIVE_RUNTIME_OPS = Object.freeze([
  "ping",
  "getBootMode",
  "setBootMode",
  "getMigratedFlag",
  "setMigratedFlag",
  "getChatIndex",
  "setChatIndex",
  "captureSnapshot",
  "loadLatestSnapshot",
  "loadSnapshot",
  "listSnapshots",
  "listAllChatIds",
  "listChatIds",
  "listWorkbenchRows",
  "getFoldersList",
  "resolveFolderBindings",
  "setFolderBinding",
  "pinSnapshot",
  "deleteSnapshot",
  "applyRetention",
  "openWorkbench",
  "exportBundle",
  "importBundle",
]);

function normHeaders(h) {
  if (!h || typeof h !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (v == null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeChatId(raw) {
  return String(raw || "").trim();
}

function normalizeMode(raw) {
  const m = String(raw || "").trim().toLowerCase();
  if (m === MODE_ARCHIVE_FIRST) return MODE_ARCHIVE_FIRST;
  if (m === MODE_ARCHIVE_ONLY) return MODE_ARCHIVE_ONLY;
  return MODE_LIVE_FIRST;
}

function normalizeNsDisk(raw) {
  const ns = String(raw || "").trim();
  return ns || DEFAULT_NS_DISK;
}

function modeKey(nsDisk, chatId) {
  return normalizeNsDisk(nsDisk) + ":chatBootMode:" + String(chatId || "");
}

function indexKey(nsDisk, chatId) {
  return normalizeNsDisk(nsDisk) + ":chatIndex:" + String(chatId || "");
}

function migratedKey(nsDisk, chatId) {
  return normalizeNsDisk(nsDisk) + ":chatMigrated:" + String(chatId || "") + ":v1";
}

function legacyModeKey(chatId) {
  return "h2o:chatBootMode:" + String(chatId || "");
}

function legacyIndexKey(chatId) {
  return "h2o:chatIndex:" + String(chatId || "");
}

function legacyMigratedKey(chatId) {
  return "h2o:chatMigrated:" + String(chatId || "") + ":v1";
}

function uniqStringList(list) {
  const seen = new Set();
  const out = [];
  const src = Array.isArray(list) ? list : [];
  for (const item of src) {
    const v = String(item || "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function normalizeRetentionPolicy(raw) {
  const n = Number(raw && raw.keepLatest);
  const keepLatest = Number.isFinite(n) ? Math.max(1, Math.min(1000, Math.floor(n))) : RETENTION_KEEP_LATEST;
  return { keepLatest };
}

function makeDefaultChatIndex() {
  return {
    lastSnapshotId: "",
    lastCapturedAt: "",
    pinnedSnapshotIds: [],
    retentionPolicy: { keepLatest: RETENTION_KEEP_LATEST },
    lastDigest: "",
  };
}

function normalizeChatIndex(raw) {
  const base = makeDefaultChatIndex();
  const obj = raw && typeof raw === "object" ? raw : {};
  return {
    lastSnapshotId: String(obj.lastSnapshotId || ""),
    lastCapturedAt: String(obj.lastCapturedAt || ""),
    pinnedSnapshotIds: uniqStringList(obj.pinnedSnapshotIds),
    retentionPolicy: normalizeRetentionPolicy(obj.retentionPolicy),
    lastDigest: String(obj.lastDigest || ""),
  };
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (res) => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        resolve(res || {});
      });
    } catch (e) {
      reject(e);
    }
  });
}

function storageSet(items) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(items || {}, () => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        resolve(true);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(keys, () => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        resolve(true);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function storageSessionArea() {
  try {
    if (chrome.storage && chrome.storage.session) return chrome.storage.session;
  } catch {}
  return chrome.storage.local;
}

function storageSessionGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      storageSessionArea().get(keys, (res) => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        resolve(res || {});
      });
    } catch (e) {
      reject(e);
    }
  });
}

function storageSessionSet(items) {
  return new Promise((resolve, reject) => {
    try {
      storageSessionArea().set(items || {}, () => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        resolve(true);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function storageSessionRemove(keys) {
  return new Promise((resolve, reject) => {
    try {
      storageSessionArea().remove(keys, () => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        resolve(true);
      });
    } catch (e) {
      reject(e);
    }
  });
}

function normalizeTabId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function normalizeSetSlot(raw) {
  const n = Number(raw);
  return DEV_SET_SLOTS.includes(n) ? n : 0;
}

function pageDisableOnceKey(tabIdRaw) {
  const tabId = normalizeTabId(tabIdRaw);
  return tabId ? ("h2oExtDevPageDisableOnceTab:" + String(tabId)) : "";
}

function pageSetLinkKey(tabIdRaw) {
  const tabId = normalizeTabId(tabIdRaw);
  return tabId ? ("h2oExtDevPageSetLinkTab:" + String(tabId)) : "";
}

function previewSetOnceKey(tabIdRaw) {
  const tabId = normalizeTabId(tabIdRaw);
  return tabId ? ("h2oExtDevPreviewSetOnceTab:" + String(tabId)) : "";
}

function chatSetBindingsStorageKey() {
  return CHAT_SET_BINDINGS_KEY;
}

function globalDefaultSetStorageKey() {
  return GLOBAL_DEFAULT_SET_KEY;
}

function chatSetBypassStorageKey() {
  return CHAT_SET_BYPASS_KEY;
}

function normalizePageDisableOnceRecord(raw) {
  if (raw === true) return { armedAt: 0 };
  const armedAt = Number(raw && raw.armedAt);
  return {
    armedAt: Number.isFinite(armedAt) && armedAt > 0 ? Math.floor(armedAt) : 0,
  };
}

function normalizeChatUrlKey(rawUrl) {
  const raw = String(rawUrl || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const origin = String(u.origin || "").trim();
    if (!origin) return "";
    const parts = String(u.pathname || "/")
      .split("/")
      .filter(Boolean)
      .map((part) => String(part || "").trim())
      .filter(Boolean);
    const cIdx = parts.lastIndexOf("c");
    let pathParts = parts;
    if (cIdx >= 0 && parts[cIdx + 1]) {
      pathParts = parts.slice(0, cIdx + 2);
    }
    const pathname = "/" + pathParts.join("/");
    return origin + (pathname === "/" ? "" : pathname.replace(/\\/+$/, ""));
  } catch {}
  return "";
}

function normalizeChatSetBindings(raw) {
  const out = {};
  const src = raw && typeof raw === "object" ? raw : {};
  for (const [k, v] of Object.entries(src)) {
    const key = String(k || "").trim();
    const slot = normalizeSetSlot(v);
    if (!key || !slot) continue;
    out[key] = slot;
  }
  return out;
}

function normalizeChatSetBypassMap(raw) {
  const out = {};
  const src = raw && typeof raw === "object" ? raw : {};
  for (const [k, v] of Object.entries(src)) {
    const key = String(k || "").trim();
    if (!key || v !== true) continue;
    out[key] = true;
  }
  return out;
}

function normalizeToggleSets(rawSets) {
  const out = {};
  const src = rawSets && typeof rawSets === "object" ? rawSets : {};
  for (const [slot, rawRec] of Object.entries(src)) {
    const slotNum = normalizeSetSlot(slot);
    if (!slotNum || !rawRec || typeof rawRec !== "object") continue;
    const maybeMap = rawRec && typeof rawRec.map === "object" ? rawRec.map : rawRec;
    if (!maybeMap || typeof maybeMap !== "object") continue;
    out[String(slotNum)] = { map: maybeMap };
  }
  return out;
}

async function hasSavedSetSlot(slotRaw) {
  const slot = normalizeSetSlot(slotRaw);
  if (!slot) return false;
  const res = await storageGet([STORAGE_TOGGLE_SETS_KEY]);
  const sets = normalizeToggleSets(res && res[STORAGE_TOGGLE_SETS_KEY]);
  return !!sets[String(slot)];
}

async function getChatBindingsMap() {
  const key = chatSetBindingsStorageKey();
  const res = await storageGet([key]);
  return normalizeChatSetBindings(res && res[key]);
}

async function setChatBindingsMap(mapRaw) {
  const key = chatSetBindingsStorageKey();
  const map = normalizeChatSetBindings(mapRaw);
  await storageSet({ [key]: map });
  return map;
}

async function getChatSetBypassMap() {
  const key = chatSetBypassStorageKey();
  const res = await storageGet([key]);
  return normalizeChatSetBypassMap(res && res[key]);
}

async function setChatSetBypassMap(mapRaw) {
  const key = chatSetBypassStorageKey();
  const map = normalizeChatSetBypassMap(mapRaw);
  await storageSet({ [key]: map });
  return map;
}

async function getChatBypassByUrl(urlRaw) {
  const urlKey = normalizeChatUrlKey(urlRaw);
  if (!urlKey) return false;
  const map = await getChatSetBypassMap();
  return map[urlKey] === true;
}

async function setChatBypassByUrl(urlRaw) {
  const urlKey = normalizeChatUrlKey(urlRaw);
  if (!urlKey) throw new Error("missing chat url");
  const map = await getChatSetBypassMap();
  map[urlKey] = true;
  await setChatSetBypassMap(map);
  return { ok: true, urlKey, enabled: true };
}

async function clearChatBypassByUrl(urlRaw) {
  const urlKey = normalizeChatUrlKey(urlRaw);
  if (!urlKey) return { ok: true, urlKey: "", enabled: false };
  const map = await getChatSetBypassMap();
  if (Object.prototype.hasOwnProperty.call(map, urlKey)) {
    delete map[urlKey];
    await setChatSetBypassMap(map);
  }
  return { ok: true, urlKey, enabled: false };
}

async function getChatBindingByUrl(urlRaw) {
  const urlKey = normalizeChatUrlKey(urlRaw);
  if (!urlKey) return 0;
  const map = await getChatBindingsMap();
  return normalizeSetSlot(map[urlKey]);
}

async function setChatBindingByUrl(urlRaw, slotRaw) {
  const urlKey = normalizeChatUrlKey(urlRaw);
  const slot = normalizeSetSlot(slotRaw);
  if (!urlKey) throw new Error("missing chat url");
  if (!slot) throw new Error("missing slot");
  const map = await getChatBindingsMap();
  map[urlKey] = slot;
  await setChatBindingsMap(map);
  return { ok: true, urlKey, slot };
}

async function clearChatBindingByUrl(urlRaw) {
  const urlKey = normalizeChatUrlKey(urlRaw);
  if (!urlKey) return { ok: true, urlKey: "", slot: 0 };
  const map = await getChatBindingsMap();
  if (Object.prototype.hasOwnProperty.call(map, urlKey)) {
    delete map[urlKey];
    await setChatBindingsMap(map);
  }
  return { ok: true, urlKey, slot: 0 };
}

async function getGlobalDefaultSet() {
  const key = globalDefaultSetStorageKey();
  const res = await storageGet([key]);
  return normalizeSetSlot(res && res[key]);
}

async function setGlobalDefaultSet(slotRaw) {
  const slot = normalizeSetSlot(slotRaw);
  if (!slot) throw new Error("missing slot");
  await storageSet({ [globalDefaultSetStorageKey()]: slot });
  return { ok: true, slot };
}

async function clearGlobalDefaultSet() {
  await storageRemove([globalDefaultSetStorageKey()]);
  return { ok: true, slot: 0 };
}

async function getPreviewSetOnce(tabIdRaw) {
  const key = previewSetOnceKey(tabIdRaw);
  if (!key) return 0;
  const res = await storageSessionGet([key]);
  return normalizeSetSlot(res && res[key]);
}

async function armPreviewSetOnce(tabIdRaw, slotRaw) {
  const tabId = normalizeTabId(tabIdRaw);
  const slot = normalizeSetSlot(slotRaw);
  if (!tabId) throw new Error("missing tabId");
  if (!slot) throw new Error("missing slot");
  await storageSessionSet({ [previewSetOnceKey(tabId)]: slot });
  return { ok: true, tabId, slot };
}

async function clearPreviewSetOnce(tabIdRaw) {
  const key = previewSetOnceKey(tabIdRaw);
  if (!key) return false;
  await storageSessionRemove([key]);
  return true;
}

async function consumePreviewSetOnce(tabIdRaw) {
  const key = previewSetOnceKey(tabIdRaw);
  if (!key) return 0;
  const res = await storageSessionGet([key]);
  const slot = normalizeSetSlot(res && res[key]);
  if (slot) await storageSessionRemove([key]);
  return slot;
}

async function clearSlotReferences(slotRaw, opts = null) {
  const slot = normalizeSetSlot(slotRaw);
  const tabId = normalizeTabId(opts && opts.tabId);
  let removedChatBindings = 0;
  let clearedGlobalDefault = false;
  let clearedPreviewOnce = false;
  if (!slot) {
    return { ok: true, slot: 0, removedChatBindings, clearedGlobalDefault, clearedPreviewOnce };
  }

  const bindings = await getChatBindingsMap();
  let bindingsChanged = false;
  for (const [urlKey, boundSlot] of Object.entries(bindings)) {
    if (normalizeSetSlot(boundSlot) !== slot) continue;
    delete bindings[urlKey];
    removedChatBindings += 1;
    bindingsChanged = true;
  }
  if (bindingsChanged) await setChatBindingsMap(bindings);

  if (normalizeSetSlot(await getGlobalDefaultSet()) === slot) {
    await clearGlobalDefaultSet();
    clearedGlobalDefault = true;
  }

  if (tabId && normalizeSetSlot(await getPreviewSetOnce(tabId)) === slot) {
    await clearPreviewSetOnce(tabId);
    clearedPreviewOnce = true;
  }

  return { ok: true, slot, removedChatBindings, clearedGlobalDefault, clearedPreviewOnce };
}

async function resolveSetState({ tabId: tabIdRaw, url: urlRaw, consumePreview = false } = {}) {
  const tabId = normalizeTabId(tabIdRaw);
  const url = String(urlRaw || "").trim();
  const urlKey = normalizeChatUrlKey(url);
  let previewPendingSlot = tabId
    ? (consumePreview ? await consumePreviewSetOnce(tabId) : await getPreviewSetOnce(tabId))
    : 0;
  if (previewPendingSlot && !(await hasSavedSetSlot(previewPendingSlot))) {
    if (tabId) await clearPreviewSetOnce(tabId);
    previewPendingSlot = 0;
  }

  let chatBindingSlot = urlKey ? await getChatBindingByUrl(urlKey) : 0;
  if (chatBindingSlot && !(await hasSavedSetSlot(chatBindingSlot))) {
    if (urlKey) await clearChatBindingByUrl(urlKey);
    chatBindingSlot = 0;
  }

  const chatBypassEnabled = urlKey ? await getChatBypassByUrl(urlKey) : false;

  let globalDefaultSlot = await getGlobalDefaultSet();
  if (globalDefaultSlot && !(await hasSavedSetSlot(globalDefaultSlot))) {
    await clearGlobalDefaultSet();
    globalDefaultSlot = 0;
  }

  let slot = 0;
  let source = "global-toggles";
  if (previewPendingSlot) {
    slot = previewPendingSlot;
    source = "preview";
  } else if (chatBypassEnabled) {
    slot = 0;
    source = "all-off";
  } else if (chatBindingSlot) {
    slot = chatBindingSlot;
    source = "chat";
  } else if (globalDefaultSlot) {
    slot = globalDefaultSlot;
    source = "global-set";
  }

  return {
    ok: true,
    tabId,
    url,
    urlKey,
    slot,
    source,
    resolvedSetSlot: slot,
    resolvedSource: source,
    chatBindingSlot,
    chatBypassEnabled,
    globalDefaultSlot,
    previewPendingSlot,
  };
}

async function armPageDisableOnce(tabIdRaw) {
  const tabId = normalizeTabId(tabIdRaw);
  if (!tabId) throw new Error("missing tabId");
  const key = pageDisableOnceKey(tabId);
  await storageSessionSet({
    [key]: {
      armedAt: Date.now(),
    },
  });
  return { ok: true, tabId };
}

async function clearPageDisableOnce(tabIdRaw) {
  const key = pageDisableOnceKey(tabIdRaw);
  if (!key) return false;
  await storageSessionRemove([key]);
  return true;
}

async function consumePageDisableOnce(tabIdRaw) {
  const key = pageDisableOnceKey(tabIdRaw);
  if (!key) return false;
  const res = await storageSessionGet([key]);
  if (!Object.prototype.hasOwnProperty.call(res || {}, key)) return false;
  const rec = normalizePageDisableOnceRecord(res[key]);
  await storageSessionRemove([key]);
  const age = rec.armedAt > 0 ? Math.max(0, Date.now() - rec.armedAt) : 0;
  return !(rec.armedAt > 0 && age > PAGE_DISABLE_ONCE_MAX_AGE_MS);
}

async function getPageSetLink(tabIdRaw, urlRaw = "") {
  const resolved = await resolveSetState({ tabId: tabIdRaw, url: urlRaw, consumePreview: false });
  return normalizeSetSlot(resolved && resolved.slot);
}

async function setPageSetLink(tabIdRaw, slotRaw, urlRaw = "") {
  const tabId = normalizeTabId(tabIdRaw);
  const slot = normalizeSetSlot(slotRaw);
  if (!tabId) throw new Error("missing tabId");
  if (!slot) throw new Error("missing slot");
  const result = await setChatBindingByUrl(urlRaw, slot);
  return { ok: true, tabId, slot, urlKey: result.urlKey };
}

async function clearPageSetLink(tabIdRaw, urlRaw = "") {
  const tabId = normalizeTabId(tabIdRaw);
  const key = pageSetLinkKey(tabId);
  if (key) {
    try { await storageSessionRemove([key]); } catch {}
  }
  const result = await clearChatBindingByUrl(urlRaw);
  return { ok: true, tabId, slot: 0, urlKey: result.urlKey };
}

async function migrateStorageKey(newKey, legacyKey, normalizeFn = null) {
  const keys = [newKey, legacyKey];
  const res = await storageGet(keys);
  if (Object.prototype.hasOwnProperty.call(res || {}, newKey) && res[newKey] != null) {
    return res[newKey];
  }
  if (!Object.prototype.hasOwnProperty.call(res || {}, legacyKey)) return undefined;
  if (res[legacyKey] == null) return undefined;
  const migrated = (typeof normalizeFn === "function") ? normalizeFn(res[legacyKey]) : res[legacyKey];
  await storageSet({ [newKey]: migrated });
  try { await storageRemove([legacyKey]); } catch {}
  return migrated;
}

async function getBootMode(chatId, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) return MODE_LIVE_FIRST;
  const k = modeKey(nsDisk, id);
  const legacy = legacyModeKey(id);
  const migrated = await migrateStorageKey(k, legacy, normalizeMode);
  if (migrated != null) return normalizeMode(migrated);
  const res = await storageGet([k]);
  return normalizeMode(res[k]);
}

async function setBootMode(chatId, mode, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) throw new Error("missing chatId");
  const m = normalizeMode(mode);
  await storageSet({ [modeKey(nsDisk, id)]: m });
  try { await storageRemove([legacyModeKey(id)]); } catch {}
  return m;
}

async function getMigratedFlag(chatId, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) return false;
  const k = migratedKey(nsDisk, id);
  const legacy = legacyMigratedKey(id);
  const migrated = await migrateStorageKey(k, legacy, (v) => !!v);
  if (migrated != null) return !!migrated;
  const res = await storageGet([k]);
  return !!res[k];
}

async function setMigratedFlag(chatId, migrated = true, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) throw new Error("missing chatId");
  const k = migratedKey(nsDisk, id);
  await storageSet({ [k]: !!migrated });
  try { await storageRemove([legacyMigratedKey(id)]); } catch {}
  return !!migrated;
}

async function getChatIndex(chatId, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) return makeDefaultChatIndex();
  const k = indexKey(nsDisk, id);
  const legacy = legacyIndexKey(id);
  const migrated = await migrateStorageKey(k, legacy, normalizeChatIndex);
  if (migrated != null) return normalizeChatIndex(migrated);
  const res = await storageGet([k]);
  return normalizeChatIndex(res[k]);
}

async function setChatIndex(chatId, nextIndex, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) throw new Error("missing chatId");
  const k = indexKey(nsDisk, id);
  const norm = normalizeChatIndex(nextIndex);
  await storageSet({ [k]: norm });
  try { await storageRemove([legacyIndexKey(id)]); } catch {}
  return norm;
}

function normalizeMessageRole(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "user") return "user";
  if (v === "assistant") return "assistant";
  return "assistant";
}

function normalizeMessages(messages) {
  const src = Array.isArray(messages) ? messages : [];
  const out = [];
  for (let i = 0; i < src.length; i += 1) {
    const m = src[i] && typeof src[i] === "object" ? src[i] : {};
    const orderRaw = Number(m.order);
    const createdAtRaw = Number(m.createdAt);
    out.push({
      role: normalizeMessageRole(m.role),
      text: String(m.text || ""),
      order: Number.isFinite(orderRaw) ? Math.floor(orderRaw) : i,
      createdAt: Number.isFinite(createdAtRaw) ? createdAtRaw : null,
    });
  }
  out.sort((a, b) => a.order - b.order);
  for (let i = 0; i < out.length; i += 1) {
    out[i].order = i;
  }
  return out;
}

function canonicalMessagesJson(messages) {
  const norm = normalizeMessages(messages);
  const rows = norm.map((m) => ({
    role: m.role,
    text: m.text,
    order: m.order,
    createdAt: m.createdAt == null ? null : m.createdAt,
  }));
  return JSON.stringify(rows);
}

async function sha256Hex(text) {
  const raw = String(text || "");
  try {
    const enc = new TextEncoder();
    const buf = enc.encode(raw);
    const dig = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(dig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0;
    for (let i = 0; i < raw.length; i += 1) h = ((h << 5) - h) + raw.charCodeAt(i), h |= 0;
    return "weak:" + String(Math.abs(h));
  }
}

function makeSnapshotId() {
  return "snap_" + String(Date.now()) + "_" + Math.random().toString(36).slice(2, 10);
}

function makeChunkId(snapshotId, idx) {
  return String(snapshotId || "") + ":chunk:" + String(idx);
}

let dbPromise = null;

function openArchiveDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      let snapshots = null;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        snapshots = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "snapshotId" });
      } else {
        snapshots = req.transaction.objectStore(STORE_SNAPSHOTS);
      }
      if (snapshots && !snapshots.indexNames.contains("chatId")) snapshots.createIndex("chatId", "chatId", { unique: false });
      if (snapshots && !snapshots.indexNames.contains("createdAt")) snapshots.createIndex("createdAt", "createdAt", { unique: false });
      if (snapshots && !snapshots.indexNames.contains("chatId_createdAt")) snapshots.createIndex("chatId_createdAt", ["chatId", "createdAt"], { unique: false });

      let chunks = null;
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        chunks = db.createObjectStore(STORE_CHUNKS, { keyPath: "chunkId" });
      } else {
        chunks = req.transaction.objectStore(STORE_CHUNKS);
      }
      if (chunks && !chunks.indexNames.contains("snapshotId")) chunks.createIndex("snapshotId", "snapshotId", { unique: false });
      if (chunks && !chunks.indexNames.contains("snapshotId_idx")) chunks.createIndex("snapshotId_idx", ["snapshotId", "idx"], { unique: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

async function listSnapshotHeadersByChat(chatId) {
  const id = normalizeChatId(chatId);
  if (!id) return [];
  const db = await openArchiveDb();
  const tx = db.transaction([STORE_SNAPSHOTS], "readonly");
  const store = tx.objectStore(STORE_SNAPSHOTS);
  const idx = store.index("chatId");
  const rows = await reqAsPromise(idx.getAll(id));
  await txDone(tx);
  const list = Array.isArray(rows) ? rows.slice() : [];
  list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return list;
}

async function listAllSnapshotHeaders() {
  const db = await openArchiveDb();
  const tx = db.transaction([STORE_SNAPSHOTS], "readonly");
  const rows = await reqAsPromise(tx.objectStore(STORE_SNAPSHOTS).getAll());
  await txDone(tx);
  return Array.isArray(rows) ? rows : [];
}

async function loadSnapshotById(snapshotId) {
  const sid = String(snapshotId || "").trim();
  if (!sid) return null;
  const db = await openArchiveDb();
  const tx = db.transaction([STORE_SNAPSHOTS, STORE_CHUNKS], "readonly");
  const snapStore = tx.objectStore(STORE_SNAPSHOTS);
  const chunkStore = tx.objectStore(STORE_CHUNKS);
  const header = await reqAsPromise(snapStore.get(sid));
  if (!header) {
    await txDone(tx);
    return null;
  }
  const chunks = await reqAsPromise(chunkStore.index("snapshotId").getAll(sid));
  await txDone(tx);
  const ordered = (Array.isArray(chunks) ? chunks : []).slice().sort((a, b) => Number(a.idx || 0) - Number(b.idx || 0));
  const messages = [];
  for (const chunk of ordered) {
    const rows = Array.isArray(chunk.messages) ? chunk.messages : [];
    for (const row of rows) messages.push(row);
  }
  return { header, messages };
}

async function removeSnapshotAndChunks(snapshotId) {
  const sid = String(snapshotId || "").trim();
  if (!sid) return false;
  const db = await openArchiveDb();
  const tx = db.transaction([STORE_SNAPSHOTS, STORE_CHUNKS], "readwrite");
  const snapStore = tx.objectStore(STORE_SNAPSHOTS);
  const chunkStore = tx.objectStore(STORE_CHUNKS);
  const idx = chunkStore.index("snapshotId");
  await new Promise((resolve, reject) => {
    const cursorReq = idx.openCursor(IDBKeyRange.only(sid));
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (!c) return resolve(true);
      c.delete();
      c.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error || new Error("chunk cursor failed"));
  });
  snapStore.delete(sid);
  await txDone(tx);
  return true;
}

async function pruneOrphanChunks() {
  const db = await openArchiveDb();
  const tx = db.transaction([STORE_SNAPSHOTS, STORE_CHUNKS], "readwrite");
  const snapStore = tx.objectStore(STORE_SNAPSHOTS);
  const chunkStore = tx.objectStore(STORE_CHUNKS);
  const validSnapshotIds = new Set();

  await new Promise((resolve, reject) => {
    const req = snapStore.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(true);
      validSnapshotIds.add(String(c.value && c.value.snapshotId || ""));
      c.continue();
    };
    req.onerror = () => reject(req.error || new Error("snapshot cursor failed"));
  });

  await new Promise((resolve, reject) => {
    const req = chunkStore.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(true);
      const sid = String(c.value && c.value.snapshotId || "");
      if (!validSnapshotIds.has(sid)) c.delete();
      c.continue();
    };
    req.onerror = () => reject(req.error || new Error("chunk cursor failed"));
  });
  await txDone(tx);
  return true;
}

function chunkMessages(messages) {
  const out = [];
  const rows = Array.isArray(messages) ? messages : [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    out.push(rows.slice(i, i + CHUNK_SIZE));
  }
  return out;
}

const chatQueue = new Map();

function withChatLock(chatId, fn) {
  const id = normalizeChatId(chatId) || "__global__";
  const prev = chatQueue.get(id) || Promise.resolve();
  const next = prev.then(() => fn());
  const safe = next.catch(() => {});
  chatQueue.set(id, safe);
  return next.finally(() => {
    if (chatQueue.get(id) === safe) chatQueue.delete(id);
  });
}

async function captureSnapshotInternal(chatId, messages, meta = {}, opts = {}, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) throw new Error("missing chatId");
  const ns = normalizeNsDisk(nsDisk);
  return withChatLock(id, async () => {
    const norm = normalizeMessages(messages);
    const canonical = canonicalMessagesJson(norm);
    const digest = await sha256Hex(canonical);
    const index = await getChatIndex(id, ns);
    const forceNew = !!opts.forceNew;
    if (!forceNew && digest && digest === index.lastDigest) {
      return {
        ok: true,
        deduped: true,
        snapshotId: String(index.lastSnapshotId || ""),
        messageCount: norm.length,
        digest,
      };
    }

    const snapshotId = String(opts.snapshotId || makeSnapshotId());
    const createdAt = String(opts.createdAt || nowIso());
    const groups = chunkMessages(norm);
    const chunkIds = [];

    const db = await openArchiveDb();
    const tx = db.transaction([STORE_CHUNKS, STORE_SNAPSHOTS], "readwrite");
    const chunkStore = tx.objectStore(STORE_CHUNKS);
    const snapStore = tx.objectStore(STORE_SNAPSHOTS);

    for (let i = 0; i < groups.length; i += 1) {
      const chunkId = makeChunkId(snapshotId, i);
      chunkIds.push(chunkId);
      chunkStore.put({
        chunkId,
        snapshotId,
        idx: i,
        messages: groups[i],
      });
    }

    snapStore.put({
      snapshotId,
      chatId: id,
      createdAt,
      schemaVersion: 1,
      messageCount: norm.length,
      digest,
      chunkIds,
      meta: meta && typeof meta === "object" ? meta : {},
    });
    await txDone(tx);

    const nextIndex = normalizeChatIndex({
      ...index,
      lastSnapshotId: snapshotId,
      lastCapturedAt: createdAt,
      lastDigest: digest,
    });
    await setChatIndex(id, nextIndex, ns);
    await applyRetention(id, ns);

    return {
      ok: true,
      deduped: false,
      snapshotId,
      messageCount: norm.length,
      digest,
      createdAt,
    };
  });
}

async function clearChatSnapshots(chatId, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) return 0;
  const ns = normalizeNsDisk(nsDisk);
  return withChatLock(id, async () => {
    const headers = await listSnapshotHeadersByChat(id);
    for (const h of headers) {
      await removeSnapshotAndChunks(h.snapshotId);
    }
    await setChatIndex(id, makeDefaultChatIndex(), ns);
    return headers.length;
  });
}

async function applyRetention(chatId, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) throw new Error("missing chatId");
  const ns = normalizeNsDisk(nsDisk);
  return withChatLock(id, async () => {
    const index = await getChatIndex(id, ns);
    const keepLatest = Number(index.retentionPolicy && index.retentionPolicy.keepLatest || RETENTION_KEEP_LATEST);
    const pinned = new Set(uniqStringList(index.pinnedSnapshotIds));
    const headers = await listSnapshotHeadersByChat(id);

    const keepSet = new Set();
    let nonPinnedCount = 0;
    for (const h of headers) {
      const sid = String(h.snapshotId || "");
      if (!sid) continue;
      if (pinned.has(sid)) {
        keepSet.add(sid);
        continue;
      }
      if (nonPinnedCount < keepLatest) {
        keepSet.add(sid);
        nonPinnedCount += 1;
      }
    }

    let deleted = 0;
    for (const h of headers) {
      const sid = String(h.snapshotId || "");
      if (!sid || keepSet.has(sid)) continue;
      await removeSnapshotAndChunks(sid);
      deleted += 1;
    }

    if (deleted > 0) await pruneOrphanChunks();

    const after = await listSnapshotHeadersByChat(id);
    const validPinned = uniqStringList(index.pinnedSnapshotIds).filter((sid) => after.some((h) => String(h.snapshotId || "") === sid));
    const first = after[0] || null;
    const next = normalizeChatIndex({
      ...index,
      pinnedSnapshotIds: validPinned,
      lastSnapshotId: first ? String(first.snapshotId || "") : "",
      lastCapturedAt: first ? String(first.createdAt || "") : "",
      lastDigest: first ? String(first.digest || "") : "",
    });
    await setChatIndex(id, next, ns);
    return { ok: true, deleted, kept: after.length };
  });
}

async function listSnapshots(chatId, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) throw new Error("missing chatId");
  const ns = normalizeNsDisk(nsDisk);
  const [headers, index] = await Promise.all([
    listSnapshotHeadersByChat(id),
    getChatIndex(id, ns),
  ]);
  const pinned = new Set(uniqStringList(index.pinnedSnapshotIds));
  return headers.map((h) => ({
    snapshotId: String(h.snapshotId || ""),
    chatId: String(h.chatId || ""),
    createdAt: String(h.createdAt || ""),
    schemaVersion: Number(h.schemaVersion || 1),
    messageCount: Number(h.messageCount || 0),
    digest: String(h.digest || ""),
    chunkIds: Array.isArray(h.chunkIds) ? h.chunkIds.slice() : [],
    pinned: pinned.has(String(h.snapshotId || "")),
  }));
}

async function loadLatestSnapshot(chatId, _nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) throw new Error("missing chatId");
  const list = await listSnapshotHeadersByChat(id);
  if (!list.length) return null;
  const loaded = await loadSnapshotById(list[0].snapshotId);
  if (!loaded) return null;
  return {
    snapshotId: loaded.header.snapshotId,
    chatId: loaded.header.chatId,
    createdAt: loaded.header.createdAt,
    schemaVersion: loaded.header.schemaVersion || 1,
    messageCount: loaded.header.messageCount || loaded.messages.length,
    digest: loaded.header.digest || "",
    messages: loaded.messages,
    meta: loaded.header.meta || {},
  };
}

async function pinSnapshot(chatId, snapshotId, pinned = true, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  const sid = String(snapshotId || "").trim();
  if (!id || !sid) throw new Error("missing chatId/snapshotId");
  const ns = normalizeNsDisk(nsDisk);
  return withChatLock(id, async () => {
    const idx = await getChatIndex(id, ns);
    const set = new Set(uniqStringList(idx.pinnedSnapshotIds));
    if (pinned) set.add(sid);
    else set.delete(sid);
    idx.pinnedSnapshotIds = Array.from(set);
    const next = await setChatIndex(id, idx, ns);
    return { ok: true, pinned: next.pinnedSnapshotIds.slice() };
  });
}

async function deleteSnapshot(chatId, snapshotId, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  const sid = String(snapshotId || "").trim();
  if (!id || !sid) throw new Error("missing chatId/snapshotId");
  const ns = normalizeNsDisk(nsDisk);
  return withChatLock(id, async () => {
    await removeSnapshotAndChunks(sid);
    const idx = await getChatIndex(id, ns);
    idx.pinnedSnapshotIds = uniqStringList(idx.pinnedSnapshotIds).filter((v) => v !== sid);
    const headers = await listSnapshotHeadersByChat(id);
    const first = headers[0] || null;
    idx.lastSnapshotId = first ? String(first.snapshotId || "") : "";
    idx.lastCapturedAt = first ? String(first.createdAt || "") : "";
    idx.lastDigest = first ? String(first.digest || "") : "";
    await setChatIndex(id, idx, ns);
    await pruneOrphanChunks();
    return { ok: true, remaining: headers.length };
  });
}

async function listAllChatIds(nsDisk = DEFAULT_NS_DISK) {
  const headers = await listAllSnapshotHeaders();
  const ids = new Set();
  for (const h of headers) {
    const id = normalizeChatId(h && h.chatId);
    if (id) ids.add(id);
  }
  const allLocal = await storageGet(null);
  const nsPrefix = normalizeNsDisk(nsDisk) + ":";
  for (const k of Object.keys(allLocal || {})) {
    if (k.startsWith(nsPrefix + "chatIndex:")) ids.add(normalizeChatId(k.slice((nsPrefix + "chatIndex:").length)));
    if (k.startsWith(nsPrefix + "chatBootMode:")) ids.add(normalizeChatId(k.slice((nsPrefix + "chatBootMode:").length)));
    if (k.startsWith("h2o:chatIndex:")) ids.add(normalizeChatId(k.slice("h2o:chatIndex:".length)));
    if (k.startsWith("h2o:chatBootMode:")) ids.add(normalizeChatId(k.slice("h2o:chatBootMode:".length)));
  }
  return Array.from(ids).filter(Boolean).sort();
}

function workbenchHeaderSortKey(header) {
  const meta = header && header.meta && typeof header.meta === "object" ? header.meta : {};
  return String(meta.updatedAt || header && header.createdAt || "");
}

function buildWorkbenchRowFromHeader(header, chatIndex = null) {
  const row = header && typeof header === "object" ? header : null;
  if (!row) return null;

  const snapshotId = String(row.snapshotId || "").trim();
  const chatId = normalizeChatId(row.chatId);
  if (!snapshotId || !chatId) return null;

  const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
  const pinnedSet = new Set(uniqStringList(chatIndex && chatIndex.pinnedSnapshotIds));
  const messageCountRaw = Number(meta.messageCount);
  const headerCountRaw = Number(row.messageCount);
  const answerCountRaw = Number(meta.answerCount);

  return {
    snapshotId,
    chatId,
    createdAt: String(row.createdAt || ""),
    updatedAt: String(meta.updatedAt || row.createdAt || ""),
    title: String(meta.title || chatId),
    excerpt: String(meta.excerpt || ""),
    messageCount: Number.isFinite(messageCountRaw) ? Math.max(0, Math.floor(messageCountRaw)) : (Number.isFinite(headerCountRaw) ? Math.max(0, Math.floor(headerCountRaw)) : 0),
    answerCount: Number.isFinite(answerCountRaw) ? Math.max(0, Math.floor(answerCountRaw)) : 0,
    pinned: pinnedSet.has(snapshotId),
    archived: meta.archived === true || String(meta.state || "").trim().toLowerCase() === "archived",
    folderId: String(meta.folderId || meta.folder || ""),
    folderName: String(meta.folderName || ""),
    tags: uniqStringList(meta.tags),
  };
}

async function listWorkbenchRows(nsDisk = DEFAULT_NS_DISK) {
  const ns = normalizeNsDisk(nsDisk);
  const headers = await listAllSnapshotHeaders();
  const latestByChat = new Map();

  for (const header of headers) {
    const chatId = normalizeChatId(header && header.chatId);
    if (!chatId) continue;
    const prev = latestByChat.get(chatId);
    if (!prev || workbenchHeaderSortKey(header).localeCompare(workbenchHeaderSortKey(prev)) > 0) {
      latestByChat.set(chatId, header);
    }
  }

  const chatIds = Array.from(latestByChat.keys());
  const indexes = await Promise.all(chatIds.map((chatId) => getChatIndex(chatId, ns)));
  const rows = [];

  for (let i = 0; i < chatIds.length; i += 1) {
    const row = buildWorkbenchRowFromHeader(latestByChat.get(chatIds[i]), indexes[i]);
    if (row) rows.push(row);
  }

  rows.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });
  return rows;
}

function normalizeFolderEntry(raw) {
  const id = String(raw && (raw.id || raw.folderId) || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(raw && (raw.name || raw.title || id) || id).trim() || id,
    createdAt: String(raw && raw.createdAt || "").trim(),
  };
}

function normalizeFolderList(raw) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const row of src) {
    const item = normalizeFolderEntry(row);
    if (!item || seen.has(item.id)) continue;
    out.push(item);
    seen.add(item.id);
  }
  return out;
}

function normalizeFolderBinding(raw) {
  return {
    folderId: String(raw && (raw.folderId || raw.id) || "").trim(),
    folderName: String(raw && (raw.folderName || raw.name || raw.title) || "").trim(),
  };
}

function folderCatalogCacheKey(nsDisk = DEFAULT_NS_DISK) {
  return normalizeNsDisk(nsDisk) + ":folderCatalogCache:v1";
}

function folderBindingCacheKey(chatId, nsDisk = DEFAULT_NS_DISK) {
  return normalizeNsDisk(nsDisk) + ":folderBindingCache:" + normalizeChatId(chatId) + ":v1";
}

async function readFolderCatalogCache(nsDisk = DEFAULT_NS_DISK) {
  const key = folderCatalogCacheKey(nsDisk);
  const res = await storageGet([key]);
  const row = res && res[key];
  return normalizeFolderList(row && typeof row === "object" && Array.isArray(row.folders) ? row.folders : row);
}

async function writeFolderCatalogCache(folders, nsDisk = DEFAULT_NS_DISK) {
  const key = folderCatalogCacheKey(nsDisk);
  await storageSet({
    [key]: {
      folders: normalizeFolderList(folders),
      updatedAt: nowIso(),
    },
  });
}

async function readFolderBindingCache(chatIds, nsDisk = DEFAULT_NS_DISK) {
  const ids = uniqStringList(chatIds).map((id) => normalizeChatId(id)).filter(Boolean);
  if (!ids.length) return { map: {}, count: 0 };

  const keys = ids.map((id) => folderBindingCacheKey(id, nsDisk));
  const res = await storageGet(keys);
  const map = {};
  let count = 0;
  for (const id of ids) {
    const key = folderBindingCacheKey(id, nsDisk);
    if (!res || !Object.prototype.hasOwnProperty.call(res, key)) continue;
    map[id] = normalizeFolderBinding(res[key]);
    count += 1;
  }
  return { map, count };
}

async function writeFolderBindingCache(chatId, binding, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) return;
  const key = folderBindingCacheKey(id, nsDisk);
  await storageSet({
    [key]: {
      ...normalizeFolderBinding(binding),
      updatedAt: nowIso(),
    },
  });
}

async function queryFolderBridge(op, payload = {}, nsDisk = DEFAULT_NS_DISK) {
  const tabs = await new Promise((resolve, reject) => {
    chrome.tabs.query({ url: [CHAT_MATCH] }, (rows) => {
      const le = chrome.runtime.lastError;
      if (le) return reject(new Error(String(le.message || le)));
      resolve(Array.isArray(rows) ? rows : []);
    });
  });

  const sorted = tabs.slice().sort((a, b) => Number(!!b.active) - Number(!!a.active));
  let lastError = null;

  for (const tab of sorted) {
    const tabId = Number(tab && tab.id || 0);
    if (!tabId) continue;

    try {
      const result = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, {
          type: MSG_FOLDERS,
          req: { op, payload, nsDisk },
        }, (resp) => {
          const le = chrome.runtime.lastError;
          if (le) return reject(new Error(String(le.message || le)));
          if (!resp || resp.ok === false) {
            return reject(new Error(String(resp && resp.error || "folder bridge failed")));
          }
          resolve(resp.result);
        });
      });
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("open a ChatGPT tab to access folders");
}

async function getFoldersListBridge(nsDisk = DEFAULT_NS_DISK) {
  try {
    const list = normalizeFolderList(await queryFolderBridge("getFoldersList", {}, nsDisk));
    await writeFolderCatalogCache(list, nsDisk);
    return list;
  } catch (error) {
    const cached = await readFolderCatalogCache(nsDisk);
    if (cached.length) return cached;
    throw error;
  }
}

async function resolveFolderBindingsBridge(chatIds, nsDisk = DEFAULT_NS_DISK) {
  const ids = uniqStringList(chatIds).map((id) => normalizeChatId(id)).filter(Boolean);
  if (!ids.length) return {};

  try {
    const raw = await queryFolderBridge("resolveFolderBindings", { chatIds: ids }, nsDisk);
    const out = {};
    for (const id of ids) {
      out[id] = normalizeFolderBinding(raw && raw[id]);
      await writeFolderBindingCache(id, out[id], nsDisk);
    }
    return out;
  } catch (error) {
    const cached = await readFolderBindingCache(ids, nsDisk);
    if (cached.count > 0) return cached.map;
    throw error;
  }
}

async function setFolderBindingBridge(chatId, folderId, nsDisk = DEFAULT_NS_DISK) {
  const id = normalizeChatId(chatId);
  if (!id) throw new Error("missing chatId");
  const result = normalizeFolderBinding(await queryFolderBridge("setFolderBinding", {
    chatId: id,
    folderId: String(folderId || ""),
  }, nsDisk));
  await writeFolderBindingCache(id, result, nsDisk);
  return result;
}

function normalizeWorkbenchRoute(routeRaw) {
  const raw = String(routeRaw || "").trim();
  if (!raw) return "#/saved";
  if (raw.startsWith("#")) return raw;
  return "#" + (raw.startsWith("/") ? raw : ("/" + raw));
}

async function openWorkbench(routeRaw = "/saved") {
  if (!ARCHIVE_WORKBENCH_ENABLED) {
    throw new Error("archive workbench is hosted only by H2O Dev Controls");
  }
  const url = chrome.runtime.getURL("surfaces/studio/studio.html") + normalizeWorkbenchRoute(routeRaw);
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.create({ url }, (tab) => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        resolve({
          ok: true,
          tabId: Number(tab && tab.id || 0),
          url,
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function exportBundle(scope, chatId, nsDisk = DEFAULT_NS_DISK) {
  const ns = normalizeNsDisk(nsDisk);
  const mode = String(scope || "chat").trim().toLowerCase();
  let chatIds = [];
  if (mode === "chat") {
    const id = normalizeChatId(chatId);
    if (!id) throw new Error("missing chatId");
    chatIds = [id];
  } else if (mode === "all") {
    chatIds = await listAllChatIds(ns);
  } else {
    throw new Error("invalid scope");
  }

  const chats = [];
  for (const id of chatIds) {
    const bootMode = await getBootMode(id, ns);
    const chatIndex = await getChatIndex(id, ns);
    const headers = await listSnapshotHeadersByChat(id);
    const snapshots = [];
    for (const h of headers) {
      const full = await loadSnapshotById(h.snapshotId);
      if (!full) continue;
      snapshots.push({
        snapshotId: String(h.snapshotId || ""),
        createdAt: String(h.createdAt || ""),
        schemaVersion: Number(h.schemaVersion || 1),
        messageCount: Number(h.messageCount || 0),
        digest: String(h.digest || ""),
        meta: h.meta && typeof h.meta === "object" ? h.meta : {},
        messages: Array.isArray(full.messages) ? full.messages : [],
      });
    }
    chats.push({
      chatId: id,
      bootMode,
      chatIndex,
      migrated: await getMigratedFlag(id, ns),
      snapshots,
    });
  }

  return {
    schema: "h2o.chatArchive.bundle.v1",
    exportedAt: nowIso(),
    scope: mode,
    chatCount: chats.length,
    chats,
  };
}

async function importBundle(bundle, modeRaw = "merge", nsDisk = DEFAULT_NS_DISK) {
  const ns = normalizeNsDisk(nsDisk);
  const mode = String(modeRaw || "merge").trim().toLowerCase() === "overwrite" ? "overwrite" : "merge";
  const src = bundle && typeof bundle === "object" ? bundle : null;
  if (!src || src.schema !== "h2o.chatArchive.bundle.v1" || !Array.isArray(src.chats)) {
    throw new Error("invalid bundle");
  }

  let importedChats = 0;
  let importedSnapshots = 0;
  for (const chat of src.chats) {
    const chatId = normalizeChatId(chat && chat.chatId);
    if (!chatId) continue;

    await withChatLock(chatId, async () => {
      if (mode === "overwrite") {
        await clearChatSnapshots(chatId, ns);
      }

      if (chat && Object.prototype.hasOwnProperty.call(chat, "bootMode")) {
        await setBootMode(chatId, chat.bootMode, ns);
      }

      const snaps = Array.isArray(chat && chat.snapshots) ? chat.snapshots.slice() : [];
      snaps.sort((a, b) => String(a && a.createdAt || "").localeCompare(String(b && b.createdAt || "")));
      for (const snap of snaps) {
        const messages = Array.isArray(snap && snap.messages) ? snap.messages : [];
        await captureSnapshotInternal(
          chatId,
          messages,
          snap && typeof snap.meta === "object" ? snap.meta : {},
          {
            forceNew: true,
            snapshotId: String(snap && snap.snapshotId || "") || undefined,
            createdAt: String(snap && snap.createdAt || "") || undefined,
          },
          ns,
        );
        importedSnapshots += 1;
      }

      const idx = await getChatIndex(chatId, ns);
      if (chat && chat.chatIndex && typeof chat.chatIndex === "object") {
        const wantedPinned = uniqStringList(chat.chatIndex.pinnedSnapshotIds);
        if (wantedPinned.length) idx.pinnedSnapshotIds = wantedPinned;
        if (chat.chatIndex.retentionPolicy) idx.retentionPolicy = normalizeRetentionPolicy(chat.chatIndex.retentionPolicy);
      }
      await setChatIndex(chatId, idx, ns);
      await applyRetention(chatId, ns);

      if (chat && Object.prototype.hasOwnProperty.call(chat, "migrated")) {
        await setMigratedFlag(chatId, !!chat.migrated, ns);
      }
      importedChats += 1;
    });
  }
  return { ok: true, mode, importedChats, importedSnapshots };
}

async function httpRequest(req) {
  const method = String(req?.method || "GET").toUpperCase();
  const url = String(req?.url || "");
  if (!url) return { ok: false, status: 0, error: "missing url" };

  const timeoutRaw = Number(req?.timeoutMs || 20000);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(1000, Math.min(120000, timeoutRaw)) : 20000;
  const headers = normHeaders(req?.headers);
  const hasBody = Object.prototype.hasOwnProperty.call(req || {}, "body");
  const body = hasBody && req.body != null ? String(req.body) : undefined;

  const ac = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ac ? setTimeout(() => { try { ac.abort(); } catch {} }, timeoutMs) : 0;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "follow",
      signal: ac ? ac.signal : undefined,
    });
    const text = await res.text();
    return {
      ok: true,
      status: Number(res.status || 0),
      statusText: String(res.statusText || ""),
      responseText: String(text || ""),
      finalUrl: String(res.url || url),
      responseURL: String(res.url || url),
      method,
      url,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: String(err && (err.stack || err.message || err)),
      method,
      url,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function handleArchiveMessage(msg) {
  const req = msg && msg.req && typeof msg.req === "object" ? msg.req : {};
  const op = String(req.op || "").trim();
  const payload = req.payload && typeof req.payload === "object" ? req.payload : {};
  const nsDisk = normalizeNsDisk(payload.nsDisk || req.nsDisk);

  if (op === "ping") {
    return {
      ok: true,
      result: {
        ok: true,
        source: "sw",
        db: DB_NAME,
        version: DB_VERSION,
        supportedOps: ARCHIVE_RUNTIME_OPS.slice(),
      },
    };
  }
  if (op === "getBootMode") {
    return { ok: true, result: { mode: await getBootMode(payload.chatId, nsDisk) } };
  }
  if (op === "setBootMode") {
    return { ok: true, result: { mode: await setBootMode(payload.chatId, payload.mode, nsDisk) } };
  }
  if (op === "getMigratedFlag") {
    return { ok: true, result: { migrated: await getMigratedFlag(payload.chatId, nsDisk) } };
  }
  if (op === "setMigratedFlag") {
    return { ok: true, result: { migrated: await setMigratedFlag(payload.chatId, payload.migrated !== false, nsDisk) } };
  }
  if (op === "getChatIndex") {
    return { ok: true, result: { chatIndex: await getChatIndex(payload.chatId, nsDisk) } };
  }
  if (op === "setChatIndex") {
    return { ok: true, result: { chatIndex: await setChatIndex(payload.chatId, payload.chatIndex, nsDisk) } };
  }
  if (op === "captureSnapshot") {
    const res = await captureSnapshotInternal(payload.chatId, payload.messages, payload.meta, {}, nsDisk);
    return { ok: true, result: res };
  }
  if (op === "loadLatestSnapshot") {
    return { ok: true, result: await loadLatestSnapshot(payload.chatId, nsDisk) };
  }
  if (op === "loadSnapshot") {
    const loaded = await loadSnapshotById(payload.snapshotId);
    if (!loaded) return { ok: true, result: null };
    return {
      ok: true,
      result: {
        snapshotId: loaded.header.snapshotId,
        chatId: loaded.header.chatId,
        createdAt: loaded.header.createdAt,
        schemaVersion: loaded.header.schemaVersion || 1,
        messageCount: loaded.header.messageCount || loaded.messages.length,
        digest: loaded.header.digest || "",
        messages: loaded.messages,
        meta: loaded.header.meta || {},
      },
    };
  }
  if (op === "listSnapshots") {
    return { ok: true, result: await listSnapshots(payload.chatId, nsDisk) };
  }
  if (op === "listAllChatIds" || op === "listChatIds") {
    return { ok: true, result: await listAllChatIds(nsDisk) };
  }
  if (op === "listWorkbenchRows") {
    return { ok: true, result: await listWorkbenchRows(nsDisk) };
  }
  if (op === "getFoldersList") {
    return { ok: true, result: await getFoldersListBridge(nsDisk) };
  }
  if (op === "resolveFolderBindings") {
    return { ok: true, result: await resolveFolderBindingsBridge(payload.chatIds, nsDisk) };
  }
  if (op === "setFolderBinding") {
    return { ok: true, result: await setFolderBindingBridge(payload.chatId, payload.folderId, nsDisk) };
  }
  if (op === "pinSnapshot") {
    return { ok: true, result: await pinSnapshot(payload.chatId, payload.snapshotId, payload.pinned !== false, nsDisk) };
  }
  if (op === "deleteSnapshot") {
    return { ok: true, result: await deleteSnapshot(payload.chatId, payload.snapshotId, nsDisk) };
  }
  if (op === "applyRetention") {
    return { ok: true, result: await applyRetention(payload.chatId, nsDisk) };
  }
  if (op === "openWorkbench") {
    return { ok: true, result: await openWorkbench(payload.route) };
  }
  if (op === "exportBundle") {
    return { ok: true, result: await exportBundle(payload.scope, payload.chatId, nsDisk) };
  }
  if (op === "importBundle") {
    return { ok: true, result: await importBundle(payload.bundle, payload.mode, nsDisk) };
  }

  return { ok: false, error: "unsupported op" };
}

async function handleExternalArchiveMessage(msg) {
  const req = msg && typeof msg.req === "object" ? msg.req : {};
  const op = String(req.op || "").trim();
  const payload = req.payload && typeof req.payload === "object" ? req.payload : {};
  const nsDisk = normalizeNsDisk(payload.nsDisk || req.nsDisk);

  if (op === "ping") {
    return {
      ok: true,
      result: {
        ok: true,
        source: "sw",
        external: true,
        supportedOps: ["ping", "exportBundle"],
      },
    };
  }

  if (op === "exportBundle") {
    return {
      ok: true,
      result: await exportBundle(payload.scope || "all", payload.chatId, nsDisk),
    };
  }

  return { ok: false, error: "unsupported external op" };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === MSG_PAGE_DISABLE_ONCE) {
    (async () => {
      try {
        const op = String(msg.op || "").trim().toLowerCase();
        if (op === "arm") {
          sendResponse(await armPageDisableOnce(msg.tabId));
          return;
        }
        if (op === "clear") {
          const tabId = normalizeTabId(msg.tabId) || normalizeTabId(sender && sender.tab && sender.tab.id);
          await clearPageDisableOnce(tabId);
          sendResponse({ ok: true, tabId });
          return;
        }
        if (op === "consume") {
          const tabId = normalizeTabId(sender && sender.tab && sender.tab.id) || normalizeTabId(msg.tabId);
          const armed = await consumePageDisableOnce(tabId);
          sendResponse({ ok: true, tabId, armed });
          return;
        }
        sendResponse({ ok: false, error: "unsupported page-disable op" });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && (e.stack || e.message || e)) });
      }
    })();
    return true;
  }

  if (msg.type === MSG_PAGE_SET_LINK) {
    (async () => {
      try {
        const op = String(msg.op || "").trim().toLowerCase();
        const tabId = normalizeTabId(msg.tabId) || normalizeTabId(sender && sender.tab && sender.tab.id);
        const url = String(msg.url || (sender && sender.tab && sender.tab.url) || "");
        if (op === "resolve" || op === "resolve-consume") {
          sendResponse(await resolveSetState({ tabId, url, consumePreview: op === "resolve-consume" }));
          return;
        }
        if (op === "get-chat-binding") {
          const slot = await getChatBindingByUrl(url);
          sendResponse({ ok: true, tabId, url, urlKey: normalizeChatUrlKey(url), slot });
          return;
        }
        if (op === "set-chat-binding") {
          sendResponse({ ok: true, tabId, ...(await setChatBindingByUrl(url, msg.slot)) });
          return;
        }
        if (op === "clear-chat-binding") {
          sendResponse({ ok: true, tabId, ...(await clearChatBindingByUrl(url)) });
          return;
        }
        if (op === "get-chat-bypass") {
          const enabled = await getChatBypassByUrl(url);
          sendResponse({ ok: true, tabId, url, urlKey: normalizeChatUrlKey(url), enabled });
          return;
        }
        if (op === "set-chat-bypass") {
          sendResponse({ ok: true, tabId, ...(await setChatBypassByUrl(url)) });
          return;
        }
        if (op === "clear-chat-bypass") {
          sendResponse({ ok: true, tabId, ...(await clearChatBypassByUrl(url)) });
          return;
        }
        if (op === "get-global-default") {
          const slot = await getGlobalDefaultSet();
          sendResponse({ ok: true, slot });
          return;
        }
        if (op === "set-global-default") {
          sendResponse(await setGlobalDefaultSet(msg.slot));
          return;
        }
        if (op === "clear-global-default") {
          sendResponse(await clearGlobalDefaultSet());
          return;
        }
        if (op === "arm-preview-once") {
          sendResponse(await armPreviewSetOnce(tabId, msg.slot));
          return;
        }
        if (op === "clear-preview-once") {
          await clearPreviewSetOnce(tabId);
          sendResponse({ ok: true, tabId, slot: 0 });
          return;
        }
        if (op === "clear-slot-references") {
          sendResponse(await clearSlotReferences(msg.slot, { tabId, url }));
          return;
        }
        if (op === "get") {
          const resolved = await resolveSetState({ tabId, url, consumePreview: false });
          sendResponse({ ok: true, tabId, slot: resolved.slot, source: resolved.source, url, urlKey: resolved.urlKey });
          return;
        }
        if (op === "set") {
          sendResponse(await setPageSetLink(tabId, msg.slot, url));
          return;
        }
        if (op === "clear") {
          sendResponse(await clearPageSetLink(tabId, url));
          return;
        }
        sendResponse({ ok: false, error: "unsupported page-set op" });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && (e.stack || e.message || e)) });
      }
    })();
    return true;
  }

  if (msg.type === MSG_FETCH_TEXT && typeof msg.url === "string") {
    (async () => {
      const r = await httpRequest({
        method: "GET",
        url: String(msg.url),
        timeoutMs: 15000,
      });
      if (!r.ok) {
        sendResponse({
          ok: false,
          status: Number(r.status || 0),
          error: String(r.error || "request failed"),
          url: String(msg.url),
        });
        return;
      }
      sendResponse({
        ok: Number(r.status || 0) >= 200 && Number(r.status || 0) < 300,
        status: Number(r.status || 0),
        text: String(r.responseText || ""),
        url: String(msg.url),
      });
    })();
    return true;
  }

  if (msg.type === MSG_HTTP && msg.req && typeof msg.req.url === "string") {
    (async () => {
      const r = await httpRequest(msg.req);
      sendResponse(r);
    })();
    return true;
  }

  if (msg.type === MSG_ARCHIVE && msg.req && typeof msg.req.op === "string") {
    (async () => {
      try {
        const out = await handleArchiveMessage(msg);
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: String(e && (e.stack || e.message || e)) });
      }
    })();
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== MSG_ARCHIVE || !msg.req || typeof msg.req.op !== "string") return;
  (async () => {
    try {
      sendResponse(await handleExternalArchiveMessage(msg));
    } catch (e) {
      sendResponse({ ok: false, error: String(e && (e.stack || e.message || e)) });
    }
  })();
  return true;
});

if (chrome.tabs && chrome.tabs.onRemoved && typeof chrome.tabs.onRemoved.addListener === "function") {
  chrome.tabs.onRemoved.addListener((tabId) => {
    clearPageDisableOnce(tabId).catch(() => {});
    clearPreviewSetOnce(tabId).catch(() => {});
    clearPageSetLink(tabId).catch(() => {});
  });
}

const HIGHLIGHT_CONTEXT_MENU_POPUP_ID = "h2o-highlight-popup";
const HIGHLIGHT_CONTEXT_MENU_QUICK_ID = "h2o-highlight-quick";
const HIGHLIGHT_CONTEXT_MENU_COLORS = Object.freeze([
  { id: "gold", title: "Gold" },
  { id: "blue", title: "Blue" },
  { id: "red", title: "Red" },
  { id: "green", title: "Green" },
  { id: "sky", title: "Sky" },
  { id: "pink", title: "Pink" },
  { id: "purple", title: "Purple" },
  { id: "orange", title: "Orange" }
]);

function ensureHighlightContextMenu() {
  if (!chrome.contextMenus || typeof chrome.contextMenus.create !== "function") return;
  try {
    chrome.contextMenus.removeAll(() => {
      const removeErr = chrome.runtime?.lastError;
      if (removeErr) {
        console.warn(TAG, "context menu reset failed", removeErr.message || String(removeErr));
      }

      chrome.contextMenus.create({
        id: HIGHLIGHT_CONTEXT_MENU_POPUP_ID,
        title: "Highlight...",
        contexts: ["selection"],
        documentUrlPatterns: [CHAT_MATCH]
      }, () => {
        const createErr = chrome.runtime?.lastError;
        if (createErr) {
          console.warn(TAG, "context menu create failed", createErr.message || String(createErr));
        }
      });

      chrome.contextMenus.create({
        id: HIGHLIGHT_CONTEXT_MENU_QUICK_ID,
        title: "Highlight Color",
        contexts: ["selection"],
        documentUrlPatterns: [CHAT_MATCH]
      }, () => {
        const createErr = chrome.runtime?.lastError;
        if (createErr) {
          console.warn(TAG, "context menu create failed", createErr.message || String(createErr));
        }
      });

      for (const item of HIGHLIGHT_CONTEXT_MENU_COLORS) {
        chrome.contextMenus.create({
          id: HIGHLIGHT_CONTEXT_MENU_QUICK_ID + ":" + item.id,
          parentId: HIGHLIGHT_CONTEXT_MENU_QUICK_ID,
          title: item.title,
          contexts: ["selection"],
          documentUrlPatterns: [CHAT_MATCH]
        }, () => {
          const createErr = chrome.runtime?.lastError;
          if (createErr) {
            console.warn(TAG, "context menu create failed", createErr.message || String(createErr));
          }
        });
      }
    });
  } catch (err) {
    console.warn(TAG, "ensureHighlightContextMenu failed", err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureHighlightContextMenu();
});

if (chrome.runtime.onStartup && typeof chrome.runtime.onStartup.addListener === "function") {
  chrome.runtime.onStartup.addListener(() => {
    ensureHighlightContextMenu();
  });
}

ensureHighlightContextMenu();

function sendHighlightTrigger(tabId, payload = {}) {
  if (!chrome.tabs || typeof chrome.tabs.sendMessage !== "function") return;
  const id = Number(tabId);
  if (!Number.isFinite(id) || id <= 0) return;
  try {
    chrome.tabs.sendMessage(id, { type: "h2o-highlight-trigger", ...payload }, () => {
      const sendErr = chrome.runtime?.lastError;
      if (sendErr) {
        console.warn(TAG, "highlight trigger failed", sendErr.message || String(sendErr));
      }
    });
  } catch (err) {
    console.warn(TAG, "highlight trigger failed", err);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;

  if (info.menuItemId === HIGHLIGHT_CONTEXT_MENU_POPUP_ID) {
    sendHighlightTrigger(tab.id, { action: "popup" });
    return;
  }

  const quickPrefix = HIGHLIGHT_CONTEXT_MENU_QUICK_ID + ":";
  if (typeof info.menuItemId === "string" && info.menuItemId.startsWith(quickPrefix)) {
    const color = info.menuItemId.slice(quickPrefix.length).trim().toLowerCase();
    if (!color) return;
    sendHighlightTrigger(tab.id, { action: "apply", color });
  }
});

console.log(TAG, "background ready");
`;
}
