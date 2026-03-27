// @version 1.0.0
export function makeChromeLiveFolderBridgePageJs() {
  return `"use strict";
(() => {
  if (window.__H2O_EXT_FOLDER_BRIDGE_V1__) return;
  window.__H2O_EXT_FOLDER_BRIDGE_V1__ = true;

  const MSG_REQ = ${JSON.stringify("h2o-ext-folders:v1:req")};
  const MSG_RES = ${JSON.stringify("h2o-ext-folders:v1:res")};
  const DEFAULT_NS = ${JSON.stringify("h2o:prm:cgx:h2odata")};

  function normalizeNsDisk(raw) {
    const ns = String(raw || DEFAULT_NS).trim();
    return ns || DEFAULT_NS;
  }

  function normalizeChatId(raw) {
    return String(raw || "").trim();
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(String(key));
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(String(key), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function delKey(key) {
    try {
      localStorage.removeItem(String(key));
      return true;
    } catch {
      return false;
    }
  }

  function foldersApi() {
    const f = window.H2O && window.H2O.folders;
    return (f && typeof f === "object") ? f : null;
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

  function tryLoadFoldersFallback() {
    const keys = [
      "h2o:prm:cgx:fldrs:state:data:v1",
      "h2o:folders:v1",
      "h2o:prm:cgx:folders:v1",
      "H2O:folders:v1",
    ];
    for (const key of keys) {
      const value = readJson(key, null);
      if (Array.isArray(value)) return value;
      if (value && Array.isArray(value.folders)) return value.folders;
    }
    return [];
  }

  function getFoldersList() {
    const api = foldersApi();
    try {
      if (typeof (api && api.list) === "function") return normalizeFolderList(api.list());
      if (typeof (api && api.getAll) === "function") return normalizeFolderList(api.getAll());
      if (api && Array.isArray(api.folders)) return normalizeFolderList(api.folders);
    } catch {}
    return normalizeFolderList(tryLoadFoldersFallback());
  }

  function keyArchiveFolder(chatId, nsDisk) {
    return normalizeNsDisk(nsDisk) + ":archiveFolder:" + normalizeChatId(chatId) + ":v1";
  }

  function resolveFolderInfo(folderId) {
    const id = String(folderId || "").trim();
    if (!id) return { folderId: "", folderName: "" };
    const folders = getFoldersList();
    for (const folder of folders) {
      const fid = String(folder && (folder.id || folder.folderId) || "").trim();
      if (!fid || fid !== id) continue;
      return {
        folderId: id,
        folderName: String(folder && (folder.name || folder.title || id) || id).trim() || id,
      };
    }
    return { folderId: id, folderName: id };
  }

  function resolveFolderBinding(chatId, nsDisk) {
    const id = normalizeChatId(chatId);
    if (!id) return { folderId: "", folderName: "" };
    const raw = readJson(keyArchiveFolder(id, nsDisk), null);
    const folderId = String(raw && (raw.folderId || raw.id) || "").trim();
    if (!folderId) return { folderId: "", folderName: "" };
    const info = resolveFolderInfo(folderId);
    return { folderId, folderName: info.folderName || "" };
  }

  function setFolderBinding(chatId, folderIdRaw, nsDisk) {
    const id = normalizeChatId(chatId);
    if (!id) throw new Error("missing chatId");
    const folderId = String(folderIdRaw || "").trim();
    if (!folderId) {
      delKey(keyArchiveFolder(id, nsDisk));
      return { ok: true, chatId: id, folderId: "", folderName: "" };
    }
    const info = resolveFolderInfo(folderId);
    writeJson(keyArchiveFolder(id, nsDisk), {
      folderId: info.folderId,
      folderName: info.folderName,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, chatId: id, folderId: info.folderId, folderName: info.folderName };
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.type !== MSG_REQ) return;
    const id = String(data.id || "");
    const req = data.req && typeof data.req === "object" ? data.req : {};
    const op = String(req.op || "").trim();
    const payload = req.payload && typeof req.payload === "object" ? req.payload : {};
    const nsDisk = normalizeNsDisk(req.nsDisk);
    try {
      let result = null;
      if (op === "getFoldersList") {
        result = getFoldersList();
      } else if (op === "resolveFolderBindings") {
        const out = {};
        const ids = Array.isArray(payload.chatIds) ? payload.chatIds : [];
        for (const chatId of ids) {
          const cid = normalizeChatId(chatId);
          if (!cid) continue;
          out[cid] = resolveFolderBinding(cid, nsDisk);
        }
        result = out;
      } else if (op === "setFolderBinding") {
        result = setFolderBinding(payload.chatId, payload.folderId, nsDisk);
      } else {
        throw new Error("unsupported folders op: " + op);
      }
      window.postMessage({ type: MSG_RES, id, ok: true, result }, "*");
    } catch (error) {
      window.postMessage({
        type: MSG_RES,
        id,
        ok: false,
        error: String(error && (error.stack || error.message || error)),
      }, "*");
    }
  }, false);
})();
`;
}
