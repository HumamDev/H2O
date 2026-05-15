// ==UserScript==
// @h2o-id             s0f3a.folders.studio
// @name               S0F3a. 🎬 Folders - Studio
// @namespace          H2O.Premium.CGX.folders.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000009
// @description        Studio Folders facade. Exposes H2O.folders.* with the surface-agnostic subset used by Library Workspace, Insights, and studio.js. Backed by the chat-list service (archive bridge) — no native sidebar inject, no history wrapping. Studio routes (#/library/folder/<id>) replace native query-flag routes.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F3a Folders (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 15 };
  const step = (s, o = '') => {
    try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {}
  };
  const err = (s, e) => {
    try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {}
  };

  function getCore() { return H2O.LibraryCore || null; }
  function getWorkspace() { return H2O.LibraryWorkspace || null; }
  function getIndex() { return H2O.LibraryIndex || null; }
  function folderCore() {
    try {
      const core = H2O.Library?.FolderProviderCore || null;
      return core && core.__phase === '3B' ? core : null;
    } catch {
      return null;
    }
  }

  let cachedFolders = null;
  let cachedAt = 0;
  let lastFolderDiagnostics = [];
  let lastWrite = null;
  const TTL_MS = 30_000;

  function mergeNormalizedFolder(raw, normalized) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const folder = normalized && typeof normalized === 'object' ? normalized : {};
    const id = String(folder.id || src.id || src.folderId || '').trim();
    const name = String(folder.name || src.name || src.title || id).trim() || id;
    return {
      ...src,
      ...folder,
      id,
      folderId: String(src.folderId || id).trim() || id,
      name,
    };
  }

  function normalizeFolderList(rawList) {
    const list = Array.isArray(rawList) ? rawList : [];
    const core = folderCore();
    lastFolderDiagnostics = [];
    if (!core || typeof core.normalizeFolderCatalog !== 'function') return list.slice();
    try {
      const diagnostics = [];
      const normalized = core.normalizeFolderCatalog(list, { diagnostics });
      lastFolderDiagnostics = diagnostics;
      const firstRawById = new Map();
      for (const row of list) {
        const id = String(row?.id || row?.folderId || '').trim();
        if (id && !firstRawById.has(id)) firstRawById.set(id, row);
      }
      return normalized.map((folder) => mergeNormalizedFolder(firstRawById.get(folder.id), folder));
    } catch (e) {
      err('normalizeFolderList', e);
      return list.slice();
    }
  }

  function normalizeFolderId(folderId) {
    return String(folderId || '').trim();
  }

  function normalizeBindingChatId(chatIdOrHref) {
    const raw = String(chatIdOrHref || '').trim();
    if (!raw) return { ok: false, chatId: '', raw: '', status: 'missing-chat-id' };

    const core = folderCore();
    if (core && typeof core.normalizeBindingKey === 'function') {
      const key = core.normalizeBindingKey(raw);
      const chatId = String(key?.chatId || '').trim();
      if (chatId) return { ok: true, chatId, raw, status: 'ok' };
      return { ok: false, chatId: '', raw, status: 'invalid-chat-id' };
    }

    try {
      const path = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : raw;
      const match = String(path || '').match(/(?:^|\/)c\/([^/?#]+)/);
      if (match) return { ok: true, chatId: decodeURIComponent(match[1]), raw, status: 'ok' };
    } catch {}

    if (!raw.startsWith('/') && !/^https?:\/\//i.test(raw)) {
      return { ok: true, chatId: raw, raw, status: 'ok' };
    }
    return { ok: false, chatId: '', raw, status: 'invalid-chat-id' };
  }

  function validateFolderIdForWrite(folderId) {
    const id = normalizeFolderId(folderId);
    if (!id) return { ok: true, folderId: '', status: 'ok' };
    const core = folderCore();
    if (core && typeof core.validateFolderId === 'function') {
      const res = core.validateFolderId(id);
      if (res?.ok) return { ok: true, folderId: String(res.folderId || id), status: 'ok' };
      return { ok: false, folderId: id, status: String(res?.reason || 'invalid-folder-id') };
    }
    if (/[\u0000-\u001f\u007f<>]/.test(id)) return { ok: false, folderId: id, status: 'invalid-folder-id' };
    return { ok: true, folderId: id, status: 'ok' };
  }

  function recordWrite(payload) {
    lastWrite = { ...(payload || {}), t: Date.now() };
    step('setBinding', `${lastWrite.status || ''}:${lastWrite.chatId || ''}:${lastWrite.folderId || ''}`);
  }

  function emitFoldersChanged(detail) {
    try {
      W.dispatchEvent(new CustomEvent('evt:h2o:folders:changed', {
        detail: { ...(detail || {}), surface: 'studio', t: Date.now() },
      }));
    } catch {}
  }

  function validationResult(status, chatId, folderId) {
    const result = {
      ok: false,
      status: String(status || 'invalid-folder-binding'),
      reason: String(status || 'invalid-folder-binding'),
      chatId: String(chatId || ''),
      folderId: String(folderId || ''),
      folderName: '',
    };
    recordWrite(result);
    return result;
  }

  function isBridgeTransportError(error) {
    const msg = String(error?.stack || error?.message || error || '');
    return /Could not establish connection|Receiving end does not exist|folder bridge|open a ChatGPT tab to access folders/i.test(msg);
  }

  async function listFolders({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cachedFolders && (now - cachedAt) < TTL_MS) return cachedFolders;
    const ws = getWorkspace();
    const list = ws ? await ws.getFolders({ fresh }) : [];
    cachedFolders = normalizeFolderList(list);
    cachedAt = now;
    return cachedFolders;
  }

  async function getFolderById(folderId) {
    const id = normalizeFolderId(folderId);
    if (!id) return null;
    const list = await listFolders();
    const core = folderCore();
    if (core && typeof core.getFolderById === 'function') {
      const normalized = core.getFolderById({ folders: list, items: {} }, id);
      if (normalized) {
        return list.find((f) => String(f.id || f.folderId || '') === String(normalized.id || id)) || normalized;
      }
      return null;
    }
    return list.find((f) => String(f.id || f.folderId || '') === id) || null;
  }

  async function getChatsInFolder(folderId) {
    const idx = getIndex();
    if (!idx) return [];
    return idx.query({ folderId: normalizeFolderId(folderId) });
  }

  async function setBinding(chatId, folderId, opts = {}) {
    const normalizedChat = normalizeBindingChatId(chatId);
    const normalizedFolder = validateFolderIdForWrite(folderId);

    if (!normalizedChat.ok) {
      return validationResult(normalizedChat.status, normalizedChat.chatId, normalizedFolder.folderId);
    }
    if (!normalizedFolder.ok) {
      return validationResult(normalizedFolder.status, normalizedChat.chatId, normalizedFolder.folderId);
    }

    const ws = getWorkspace();
    if (!ws) throw new Error('library-workspace unavailable');

    try {
      const result = await ws.setFolderBinding(normalizedChat.chatId, normalizedFolder.folderId, opts || {});
      if (result?.ok === false) {
        recordWrite({
          ok: false,
          status: String(result.status || result.reason || 'rejected'),
          chatId: normalizedChat.chatId,
          folderId: String(result.folderId || ''),
          folderName: String(result.folderName || ''),
          result,
        });
        return result;
      }
      cachedFolders = null;
      cachedAt = 0;
      try { await listFolders({ fresh: true }); } catch (e) { err('setBinding.refreshFolders', e); }
      try { await getIndex()?.refresh?.('folder-binding-changed'); } catch (e) { err('setBinding.refreshIndex', e); }
      recordWrite({
        ok: result?.ok !== false,
        status: String(result?.status || 'ok'),
        chatId: normalizedChat.chatId,
        folderId: String(result?.folderId || normalizedFolder.folderId || ''),
        folderName: String(result?.folderName || ''),
        result,
      });
      emitFoldersChanged({
        action: normalizedFolder.folderId ? 'set-binding' : 'clear-binding',
        source: String(opts?.source || 'studio-folders-api'),
        chatId: normalizedChat.chatId,
        folderId: String(result?.folderId || normalizedFolder.folderId || ''),
        folderName: String(result?.folderName || ''),
      });
      return result;
    } catch (e) {
      if (isBridgeTransportError(e)) {
        const result = {
          ok: false,
          status: 'folder-bridge-unavailable',
          reason: String(e?.message || e || 'folder bridge unavailable'),
          chatId: normalizedChat.chatId,
          folderId: '',
          folderName: '',
        };
        recordWrite({ ...result, error: String(e?.stack || e) });
        err('setBinding.bridge', e);
        return result;
      }
      recordWrite({
        ok: false,
        status: 'error',
        chatId: normalizedChat.chatId,
        folderId: normalizedFolder.folderId,
        error: String(e?.stack || e),
      });
      err('setBinding', e);
      throw e;
    }
  }

  function buildRouteHash(folderId) {
    return getCore()?.getService?.('route')?.buildLibraryHash?.('folder', folderId) || '';
  }

  const Folders = {
    surface: 'studio',
    listFolders,
    getFolderById,
    getChatsInFolder,
    setBinding,
    buildRouteHash,
    async refresh() { return listFolders({ fresh: true }); },
    diagnose() {
      return {
        surface: 'studio',
        cached: !!cachedFolders,
        cachedCount: cachedFolders ? cachedFolders.length : 0,
        cachedAt,
        hasWorkspace: !!getWorkspace(),
        hasIndex: !!getIndex(),
        hasFolderCore: !!folderCore(),
        folderCorePhase: folderCore()?.__phase || '',
        normalizationDiagnostics: lastFolderDiagnostics.slice(-10),
        lastWrite,
        steps: diag.steps.slice(-10),
        errors: diag.errors.slice(-5),
      };
    },
  };

  // Expose to match the native H2O.folders namespace shape.
  H2O.folders = H2O.folders || Folders;
  // Always expose the Studio facade under H2O.Library.Folders so studio.js + Library modules can find it cleanly.
  H2O.Library = H2O.Library || {};
  H2O.Library.Folders = Folders;

  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('folders', Folders, { replace: true });
      core.registerService('folders', Folders, { replace: true });
      // Register Studio folder route handler
      core.registerRoute('folder', async (route) => {
        const id = String(route?.id || '').trim();
        step('route:folder', id);
        return true;
      }, { replace: true });
      core.registerRoute('folders', async () => { step('route:folders'); return true; }, { replace: true });
      step('register-on-core', 'folders');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }

  step('boot', 'studio-folders-ready');
})();
