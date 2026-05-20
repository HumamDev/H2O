// shared/library/folder-provider-core.js
//
// Phase 3B — canonical pure module for folder catalog + folder binding
// normalization and update helpers. Used by both native and Studio through
// a self-publishing IIFE on `window.H2O.Library.FolderProviderCore`.
//
// IMPORTANT — runtime distribution:
//   This file is the canonical source; two runtime mirror files exist:
//
//     src-runtime-base/0F0e.⬛️🗂️ Folder Provider Core 🗂️.js
//     surfaces/studio/S0F0e. 🎬 Folder Provider Core - Studio.js
//
//   The IIFE bodies must remain byte-identical across all three files.
//   Headers may differ so the existing native and Studio loaders discover
//   the mirrors.
//
// What this module provides (all pure functions — no DOM, no localStorage,
// no chrome.storage, no IndexedDB, no archive calls, no events, no UI):
//
//   normalizeFolder, normalizeFolderCatalog, normalizeFolderBinding,
//   normalizeFolderState, migrateLegacyFolderState, dedupeFolders,
//   validateFolderId, deriveFolderDisplayName, getFolderById, getBinding,
//   applyFolderBinding, removeFolderBinding, computeFolderCounts,
//   listFolderItems, normalizeBindingKey, bindingKeyCandidates,
//   findOrphanBindings, repairFolderState

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.Library.FolderProviderCore && H2O.Library.FolderProviderCore.__phase === '3B') return;

  const PHASE = '3B';
  const DEFAULT_ORIGIN = 'https://chatgpt.com';

  function ensureString(value) {
    return (typeof value === 'string') ? value : (value == null ? '' : String(value));
  }

  function trimString(value) {
    return ensureString(value).trim();
  }

  function uniqueStrings(values) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const v = trimString(value);
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  function pushDiagnostic(opts, code, detail = {}) {
    if (!opts || !Array.isArray(opts.diagnostics)) return;
    opts.diagnostics.push({ code: String(code || 'diagnostic'), ...detail });
  }

  function safeDecode(value) {
    const raw = ensureString(value);
    try { return decodeURIComponent(raw); } catch { return raw; }
  }

  function safeEncode(value) {
    return encodeURIComponent(ensureString(value));
  }

  function normalizeHexColor(value) {
    const raw = trimString(value);
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toUpperCase() : '';
  }

  function normalizeTimestamp(value, opts = {}) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = trimString(value);
    if (raw) return raw;
    if (Object.prototype.hasOwnProperty.call(opts, 'nowIso')) return opts.nowIso;
    if (Object.prototype.hasOwnProperty.call(opts, 'now')) return opts.now;
    return '';
  }

  function parseChatIdFromHref(input) {
    const raw = trimString(input);
    if (!raw) return '';
    const parsePath = (path) => {
      const match = String(path || '').match(/(?:^|\/)c\/([^/?#]+)/);
      return match ? safeDecode(match[1]) : '';
    };
    if (/^https?:\/\//i.test(raw)) {
      try {
        if (typeof URL !== 'undefined') return parsePath(new URL(raw).pathname || '');
      } catch {}
      const withoutOrigin = raw.replace(/^https?:\/\/[^/]+/i, '');
      return parsePath(withoutOrigin);
    }
    return parsePath(raw);
  }

  function normalizeBindingKey(chatIdOrHref, opts = {}) {
    const raw = trimString(chatIdOrHref);
    const diagnostics = [];
    const addDiag = (code, detail = {}) => diagnostics.push({ code, ...detail });
    if (!raw) {
      addDiag('missing-binding-key');
      return { raw: '', chatId: '', href: '', canonical: '', candidates: [], diagnostics };
    }

    let chatId = parseChatIdFromHref(raw);
    if (!chatId && !raw.startsWith('/') && !/^https?:\/\//i.test(raw)) chatId = raw;

    const origin = trimString(opts.origin) || DEFAULT_ORIGIN;
    const href = chatId ? `/c/${safeEncode(chatId)}` : raw;
    const candidates = [];
    const add = (value) => {
      const v = trimString(value);
      if (!v || candidates.includes(v)) return;
      candidates.push(v);
    };

    add(raw);
    add(safeDecode(raw));
    if (chatId) {
      const encoded = safeEncode(chatId);
      add(chatId);
      add(`/c/${chatId}`);
      add(`/c/${encoded}`);
      add(`${origin.replace(/\/+$/, '')}/c/${encoded}`);
      add(`${origin.replace(/\/+$/, '')}/c/${chatId}`);
    }
    add(href);

    return {
      raw,
      chatId: trimString(chatId),
      href,
      canonical: href,
      candidates,
      diagnostics,
    };
  }

  function bindingKeyCandidates(chatIdOrHref, opts = {}) {
    return normalizeBindingKey(chatIdOrHref, opts).candidates.slice();
  }

  function equivalentBindingKeys(a, b, opts = {}) {
    const left = normalizeBindingKey(a, opts);
    const right = normalizeBindingKey(b, opts);
    if (left.chatId && right.chatId && left.chatId === right.chatId) return true;
    if (left.canonical && right.canonical && left.canonical === right.canonical) return true;
    const rset = new Set(right.candidates);
    return left.candidates.some((candidate) => rset.has(candidate));
  }

  function validateFolderId(folderId, opts = {}) {
    const id = trimString(folderId);
    if (!id) return { ok: false, folderId: '', reason: 'empty-folder-id' };
    const maxLength = Number.isFinite(Number(opts.maxLength)) ? Number(opts.maxLength) : 256;
    if (id.length > maxLength) return { ok: false, folderId: id, reason: 'folder-id-too-long' };
    if (/[\u0000-\u001f\u007f<>]/.test(id)) return { ok: false, folderId: id, reason: 'unsafe-folder-id' };
    if (/[\\/]/.test(id)) return { ok: false, folderId: id, reason: 'unsafe-folder-id' };
    return { ok: true, folderId: id, reason: '' };
  }

  function normalizeProjectRef(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const id = trimString(src.id || src.projectId || src.nativeProjectId || '');
    if (!id) return null;
    return {
      id,
      name: trimString(src.name || src.projectName || src.title || id) || id,
    };
  }

  function normalizeFolder(raw, opts = {}) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const id = trimString(src.id || src.folderId || '');
    const valid = validateFolderId(id, opts);
    if (!valid.ok) {
      pushDiagnostic(opts, 'invalid-folder', { folderId: id, reason: valid.reason });
      return null;
    }

    const name = trimString(src.name || src.title || src.folderName || id) || id;
    const kindRaw = trimString(src.kind || '').toLowerCase();
    const out = {
      id,
      name,
      kind: kindRaw === 'project_backed' ? 'project_backed' : 'local',
      projectRef: normalizeProjectRef(src.projectRef),
      createdAt: normalizeTimestamp(src.createdAt, opts),
      updatedAt: normalizeTimestamp(src.updatedAt ?? src.createdAt, opts),
    };

    const iconColor = normalizeHexColor(src.iconColor || src.color || src.folderColor || src.accentColor);
    if (iconColor) out.iconColor = iconColor;

    const parentId = trimString(src.parentId || '');
    if (parentId) out.parentId = parentId;
    const icon = trimString(src.icon || '');
    if (icon) out.icon = icon;
    if (typeof src.position === 'number' && Number.isFinite(src.position)) out.position = src.position;
    if (typeof src.sortOrder === 'number' && Number.isFinite(src.sortOrder)) out.sortOrder = src.sortOrder;
    if (typeof src.isArchived === 'boolean') out.isArchived = src.isArchived;
    const source = trimString(src.source || '');
    if (source) out.source = source;
    if (typeof src.schemaVersion === 'number' && Number.isFinite(src.schemaVersion)) out.schemaVersion = src.schemaVersion;

    return out;
  }

  function dedupeFolders(folders, opts = {}) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(folders) ? folders : []) {
      const folder = normalizeFolder(raw, opts);
      if (!folder) continue;
      if (seen.has(folder.id)) {
        pushDiagnostic(opts, 'duplicate-folder-id', { folderId: folder.id });
        continue;
      }
      seen.add(folder.id);
      out.push(folder);
    }
    return out;
  }

  function normalizeFolderCatalog(rawFolders, opts = {}) {
    return dedupeFolders(rawFolders, opts);
  }

  function canonicalItemKey(value, opts = {}) {
    const key = normalizeBindingKey(value, opts);
    return key.canonical || key.raw;
  }

  function normalizeItemsMap(itemsRaw, opts = {}) {
    const src = (itemsRaw && typeof itemsRaw === 'object' && !Array.isArray(itemsRaw)) ? itemsRaw : {};
    const out = {};
    for (const folderIdRaw of Object.keys(src)) {
      const folderId = trimString(folderIdRaw);
      if (!folderId) {
        pushDiagnostic(opts, 'empty-items-folder-id');
        continue;
      }
      out[folderId] = uniqueStrings((Array.isArray(src[folderIdRaw]) ? src[folderIdRaw] : [])
        .map((value) => canonicalItemKey(value, opts)));
    }
    return out;
  }

  function migrateLegacyFolderState(rawLegacy, opts = {}) {
    const src = (rawLegacy && typeof rawLegacy === 'object') ? rawLegacy : {};
    if (Array.isArray(src.folders) && src.items && typeof src.items === 'object') {
      return normalizeFolderState(src, opts);
    }

    const folders = normalizeFolderCatalog(Array.isArray(src.folders) ? src.folders : [], opts);
    const items = {};
    for (const folder of folders) items[folder.id] = [];

    const chatToFolders = (src.chatToFolders && typeof src.chatToFolders === 'object') ? src.chatToFolders : {};
    for (const chatKey of Object.keys(chatToFolders)) {
      const canonical = canonicalItemKey(chatKey, opts);
      const folderIds = Array.isArray(chatToFolders[chatKey]) ? chatToFolders[chatKey] : [chatToFolders[chatKey]];
      for (const folderIdRaw of folderIds) {
        const folderId = trimString(folderIdRaw);
        if (!folderId) continue;
        if (!items[folderId]) items[folderId] = [];
        items[folderId].push(canonical);
        items[folderId] = uniqueStrings(items[folderId]);
      }
    }

    return normalizeFolderState({ folders, items }, opts);
  }

  function normalizeFolderState(rawState, opts = {}) {
    const diagnostics = Array.isArray(opts.diagnostics) ? opts.diagnostics : [];
    const childOpts = { ...opts, diagnostics };
    const src = (rawState && typeof rawState === 'object') ? rawState : null;
    if (!src) {
      diagnostics.push({ code: 'malformed-folder-state', reason: 'not-object' });
      return { folders: [], items: {}, diagnostics };
    }
    if (!src.items && src.chatToFolders && typeof src.chatToFolders === 'object') {
      return migrateLegacyFolderState(src, childOpts);
    }

    const folders = normalizeFolderCatalog(Array.isArray(src.folders) ? src.folders : [], childOpts);
    const items = normalizeItemsMap(src.items, childOpts);
    for (const folder of folders) {
      if (!Array.isArray(items[folder.id])) items[folder.id] = [];
    }

    const folderIds = new Set(folders.map((folder) => folder.id));
    for (const folderId of Object.keys(items)) {
      if (!folderIds.has(folderId)) {
        diagnostics.push({ code: 'orphan-folder-items', folderId, count: items[folderId].length });
      }
    }

    return { folders, items, diagnostics };
  }

  function normalizeFolderBinding(raw, opts = {}) {
    const src = (raw && typeof raw === 'object') ? raw : { chatId: raw };
    const folderId = trimString(src.folderId || src.id || '');
    const key = normalizeBindingKey(src.chatId || src.href || src.key || src.chatIdOrHref || '', opts);
    return {
      chatId: key.chatId,
      href: key.href,
      key: key.canonical,
      raw: key.raw,
      candidates: key.candidates,
      folderId,
      folderName: trimString(src.folderName || src.name || ''),
      pinned: !!src.pinned,
      position: Number.isFinite(Number(src.position)) ? Number(src.position) : 0,
      boundAt: normalizeTimestamp(src.boundAt || src.createdAt || src.updatedAt, opts),
      source: trimString(src.source || ''),
      schemaVersion: Number.isFinite(Number(src.schemaVersion)) ? Number(src.schemaVersion) : 1,
    };
  }

  function deriveFolderDisplayName(folder, opts = {}) {
    const raw = folder && typeof folder === 'object' ? folder : {};
    const id = trimString(raw.id || raw.folderId || '');
    return trimString(raw.name || raw.title || raw.folderName || opts.fallback || id) || id;
  }

  function getFolderById(state, folderId) {
    const id = trimString(folderId);
    if (!id) return null;
    const normalized = normalizeFolderState(state);
    return normalized.folders.find((folder) => folder.id === id) || null;
  }

  function listFolderItems(state, folderId, opts = {}) {
    const id = trimString(folderId);
    if (!id) return [];
    const normalized = normalizeFolderState(state, opts);
    return Array.isArray(normalized.items[id]) ? normalized.items[id].slice() : [];
  }

  function getBinding(state, chatIdOrHref, opts = {}) {
    const normalized = normalizeFolderState(state, opts);
    const key = normalizeBindingKey(chatIdOrHref, opts);
    if (!key.raw && !key.canonical) {
      return { folderId: '', folderName: '', chatId: '', href: '', key: '' };
    }

    for (const folder of normalized.folders) {
      const arr = Array.isArray(normalized.items[folder.id]) ? normalized.items[folder.id] : [];
      const match = arr.find((value) => equivalentBindingKeys(value, key.raw || key.canonical, opts));
      if (match) {
        return {
          folderId: folder.id,
          folderName: deriveFolderDisplayName(folder),
          chatId: key.chatId,
          href: key.href,
          key: match,
        };
      }
    }
    return { folderId: '', folderName: '', chatId: key.chatId, href: key.href, key: '' };
  }

  function applyFolderBinding(state, chatIdOrHref, folderId, opts = {}) {
    const normalized = normalizeFolderState(state, opts);
    const key = normalizeBindingKey(chatIdOrHref, opts);
    const fid = trimString(folderId);
    const previous = getBinding(normalized, key.raw || key.canonical, opts);
    const next = {
      folders: normalized.folders.map((folder) => ({ ...folder })),
      items: {},
      diagnostics: normalized.diagnostics.slice(),
    };

    if (!key.raw && !key.canonical) {
      next.items = { ...normalized.items };
      return {
        ok: false,
        status: 'missing-binding-key',
        state: next,
        previous,
        binding: { folderId: '', folderName: '', chatId: '', href: '', key: '' },
        changed: false,
        affectedChatKeys: [],
        diagnostics: next.diagnostics,
      };
    }

    if (typeof opts.canAssign === 'function' && fid) {
      const allowed = opts.canAssign({ chatId: key.chatId, href: key.href, folderId: fid, key });
      if (!allowed) {
        next.items = { ...normalized.items };
        return {
          ok: false,
          status: 'assignment-rejected',
          state: next,
          previous,
          binding: previous,
          changed: false,
          affectedChatKeys: [key.canonical || key.raw],
          diagnostics: next.diagnostics,
        };
      }
    }

    for (const existingFid of Object.keys(normalized.items)) {
      next.items[existingFid] = (Array.isArray(normalized.items[existingFid]) ? normalized.items[existingFid] : [])
        .filter((value) => !equivalentBindingKeys(value, key.raw || key.canonical, opts));
    }
    for (const folder of next.folders) {
      if (!Array.isArray(next.items[folder.id])) next.items[folder.id] = [];
    }

    const folder = fid ? next.folders.find((item) => item.id === fid) : null;
    let status = 'ok';
    if (fid && folder) {
      next.items[fid] = uniqueStrings([...(next.items[fid] || []), key.canonical || key.raw]);
    } else if (fid) {
      status = 'folder-not-found';
      next.diagnostics.push({ code: 'folder-not-found', folderId: fid });
    }

    const binding = getBinding(next, key.raw || key.canonical, opts);
    const changed = previous.folderId !== binding.folderId || previous.folderName !== binding.folderName;
    return {
      ok: true,
      status,
      state: next,
      previous,
      binding,
      changed,
      affectedChatKeys: [key.canonical || key.raw],
      diagnostics: next.diagnostics,
    };
  }

  function removeFolderBinding(state, chatIdOrHref, opts = {}) {
    return applyFolderBinding(state, chatIdOrHref, '', opts);
  }

  function computeFolderCounts(state, opts = {}) {
    const normalized = normalizeFolderState(state, opts);
    const byFolder = {};
    let total = 0;
    for (const folder of normalized.folders) {
      const count = uniqueStrings(normalized.items[folder.id] || []).length;
      byFolder[folder.id] = count;
      total += count;
    }
    const orphaned = {};
    for (const orphan of findOrphanBindings(normalized, opts)) orphaned[orphan.folderId] = orphan.count;
    return { byFolder, total, orphaned };
  }

  function findOrphanBindings(state, opts = {}) {
    const normalized = normalizeFolderState(state, opts);
    const folderIds = new Set(normalized.folders.map((folder) => folder.id));
    return Object.keys(normalized.items)
      .filter((folderId) => !folderIds.has(folderId))
      .map((folderId) => {
        const items = uniqueStrings(normalized.items[folderId] || []);
        return { folderId, items, count: items.length, chatKeys: items.slice() };
      });
  }

  function repairFolderState(state, opts = {}) {
    const normalized = normalizeFolderState(state, opts);
    const folderIds = new Set(normalized.folders.map((folder) => folder.id));
    const repaired = {
      folders: normalized.folders.map((folder) => ({ ...folder })),
      items: {},
      diagnostics: normalized.diagnostics.slice(),
    };
    const affected = [];
    for (const folder of repaired.folders) {
      repaired.items[folder.id] = uniqueStrings(normalized.items[folder.id] || []);
    }
    for (const orphan of findOrphanBindings(normalized, opts)) {
      if (!folderIds.has(orphan.folderId)) affected.push(...orphan.chatKeys);
    }
    return {
      state: repaired,
      diagnostics: repaired.diagnostics,
      orphanBindings: findOrphanBindings(normalized, opts),
      affectedChatKeys: uniqueStrings(affected),
    };
  }

  const FolderProviderCore = Object.freeze({
    __phase: PHASE,
    normalizeFolder,
    normalizeFolderCatalog,
    normalizeFolderBinding,
    normalizeFolderState,
    migrateLegacyFolderState,
    dedupeFolders,
    validateFolderId,
    deriveFolderDisplayName,
    getFolderById,
    getBinding,
    applyFolderBinding,
    removeFolderBinding,
    computeFolderCounts,
    listFolderItems,
    normalizeBindingKey,
    bindingKeyCandidates,
    findOrphanBindings,
    repairFolderState,
  });

  H2O.Library.FolderProviderCore = FolderProviderCore;
})();
