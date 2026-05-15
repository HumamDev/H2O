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

  function normalizeHexColor(raw) {
    const value = String(raw || "").trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : "";
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
    const out = {
      id,
      name: String(raw && (raw.name || raw.title || id) || id).trim() || id,
      createdAt: String(raw && raw.createdAt || "").trim(),
    };
    const iconColor = normalizeHexColor(raw && (raw.iconColor || raw.color || raw.folderColor || raw.accentColor || raw.appearance && raw.appearance.color));
    if (iconColor) out.iconColor = iconColor;
    return out;
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

  function setFolderIconColor(folderIdRaw, colorRaw) {
    const folderId = String(folderIdRaw || "").trim();
    if (!folderId) throw new Error("missing folderId");
    const color = normalizeHexColor(colorRaw || "");
    const api = foldersApi();
    try {
      if (api && typeof api.setFolderIconColor === "function") {
        const res = api.setFolderIconColor(folderId, color);
        return { ok: !res || res.ok !== false, folderId, iconColor: color };
      }
    } catch {}

    const keys = [
      "h2o:prm:cgx:fldrs:state:data:v1",
      "h2o:folders:data:v1",
      "h2o:folders:v1",
      "h2o:prm:cgx:folders:v1",
      "H2O:folders:v1",
    ];
    let changed = false;
    for (const key of keys) {
      const value = readJson(key, null);
      const folders = Array.isArray(value) ? value : (value && Array.isArray(value.folders) ? value.folders : null);
      if (!folders) continue;
      let hit = false;
      const nextFolders = folders.map((row) => {
        const id = String(row && (row.id || row.folderId) || "").trim();
        if (id !== folderId || !row || typeof row !== "object") return row;
        hit = true;
        const next = { ...row, updatedAt: new Date().toISOString() };
        if (color) next.iconColor = color;
        else delete next.iconColor;
        return next;
      });
      if (!hit) continue;
      const nextValue = Array.isArray(value) ? nextFolders : { ...value, folders: nextFolders, updatedAt: new Date().toISOString() };
      changed = writeJson(key, nextValue) || changed;
    }
    if (changed) {
      try {
        window.dispatchEvent(new CustomEvent("evt:h2o:folders:changed", {
          detail: { action: "folder-appearance", folderId, iconColor: color, source: "ext-folder-bridge", ts: Date.now() },
        }));
      } catch {}
    }
    return { ok: changed, folderId, iconColor: color };
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
    const api = foldersApi();
    try {
      if (api && typeof api.getBinding === "function") {
        const res = api.getBinding(id);
        const folderId = String(res && (res.folderId || res.id) || "").trim();
        if (folderId) {
          const info = resolveFolderInfo(folderId);
          return {
            folderId,
            folderName: String(res && (res.folderName || res.name) || info.folderName || folderId).trim() || folderId,
          };
        }
      }
    } catch {}
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
    const api = foldersApi();
    if (api && typeof api.setBinding === "function") {
      const res = api.setBinding(id, folderId);
      if (res && res.ok === false) {
        return {
          ok: false,
          chatId: id,
          folderId: String(res.folderId || ""),
          folderName: String(res.folderName || ""),
          status: String(res.status || res.reason || "rejected"),
          reason: String(res.reason || res.status || "rejected"),
        };
      }
      const info = folderId ? resolveFolderInfo(folderId) : { folderId: "", folderName: "" };
      const effectiveId = String(res && (res.folderId || res.id) || info.folderId || "").trim();
      const effectiveName = String(res && (res.folderName || res.name) || info.folderName || effectiveId).trim();
      if (effectiveId) {
        writeJson(keyArchiveFolder(id, nsDisk), {
          folderId: effectiveId,
          folderName: effectiveName,
          updatedAt: new Date().toISOString(),
        });
      } else {
        delKey(keyArchiveFolder(id, nsDisk));
      }
      return {
        ok: !res || res.ok !== false,
        chatId: id,
        folderId: effectiveId,
        folderName: effectiveName,
        status: String(res && res.status || "ok"),
      };
    }
    if (!folderId) {
      delKey(keyArchiveFolder(id, nsDisk));
      try {
        const upsert = window.H2O && window.H2O.archiveBoot && typeof window.H2O.archiveBoot.upsertLatestSnapshotMeta === "function"
          ? window.H2O.archiveBoot.upsertLatestSnapshotMeta.bind(window.H2O.archiveBoot)
          : null;
        if (upsert) Promise.resolve(upsert(id, { folderId: "", folderName: "" }, { source: "ext-folder-bridge" })).catch(() => {});
      } catch {}
      return { ok: true, chatId: id, folderId: "", folderName: "" };
    }
    const info = resolveFolderInfo(folderId);
    writeJson(keyArchiveFolder(id, nsDisk), {
      folderId: info.folderId,
      folderName: info.folderName,
      updatedAt: new Date().toISOString(),
    });
    try {
      const upsert = window.H2O && window.H2O.archiveBoot && typeof window.H2O.archiveBoot.upsertLatestSnapshotMeta === "function"
        ? window.H2O.archiveBoot.upsertLatestSnapshotMeta.bind(window.H2O.archiveBoot)
        : null;
      if (upsert) Promise.resolve(upsert(id, { folderId: info.folderId, folderName: info.folderName }, { source: "ext-folder-bridge" })).catch(() => {});
    } catch {}
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
      } else if (op === "setFolderIconColor") {
        result = setFolderIconColor(payload.folderId, payload.iconColor || payload.color || "");
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
