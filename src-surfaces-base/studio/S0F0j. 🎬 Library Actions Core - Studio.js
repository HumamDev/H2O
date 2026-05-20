// S0F0j. 🎬 Library Actions Core - Studio.js
// Phase 7B Studio mirror for shared/library/library-actions-core.js.
// The IIFE body must remain byte-identical to the shared canonical file and
// src-runtime-base/0F0j.⬛️🎯 Library Actions Core 🎯.js.

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.LibraryActionsCore && H2O.LibraryActionsCore.__phase === '7B') return;

  const PHASE = '7B';
  const VERSION = '1.0.0';
  const DEFAULT_ORIGIN = 'https://chatgpt.com';
  const ACTIONS = Object.freeze({
    ADD_TO_LIBRARY: 'addToLibrary',
    SAVE_TO_FOLDER: 'saveToFolder',
    OPEN_LINKED_CHAT: 'openLinkedChat',
  });

  function ensureString(value) {
    return (typeof value === 'string') ? value : (value == null ? '' : String(value));
  }

  function trimString(value) {
    return ensureString(value).trim();
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function firstString(...values) {
    for (const value of values) {
      const out = trimString(value);
      if (out) return out;
    }
    return '';
  }

  function normalizeSource(value, fallback = 'library-actions') {
    const raw = trimString(value) || fallback;
    return raw.replace(/\s+/g, '-').toLowerCase();
  }

  function normalizeOrigin(value) {
    const raw = trimString(value) || DEFAULT_ORIGIN;
    return raw.replace(/\/+$/, '') || DEFAULT_ORIGIN;
  }

  function parseChatIdFromHref(input) {
    const raw = trimString(input);
    if (!raw) return '';
    const match = raw.match(/\/c\/([A-Za-z0-9._:-]+)/);
    return match ? match[1] : '';
  }

  function normalizeChatId(input) {
    const raw = trimString(input);
    if (!raw) return '';
    const fromHref = parseChatIdFromHref(raw);
    if (fromHref) return fromHref;
    return raw.replace(/^chat:/i, '').trim();
  }

  function isImportedId(value) {
    return /^imported[-_:]/i.test(trimString(value));
  }

  function normalizeHref(input) {
    const raw = trimString(input);
    if (!raw) return '';
    let path = raw;
    try {
      if (/^https?:\/\//i.test(raw)) {
        const url = new URL(raw);
        path = url.pathname || '';
      }
    } catch {}
    const id = parseChatIdFromHref(path) || parseChatIdFromHref(raw);
    if (id && !isImportedId(id)) return `/c/${id}`;
    return path.split('#')[0].split('?')[0];
  }

  function hrefForChatId(chatId, options = {}) {
    const id = normalizeChatId(chatId);
    if (!id || isImportedId(id)) return '';
    return `${normalizeOrigin(options.origin)}/c/${id}`;
  }

  function absoluteUrlFromParts({ href = '', normalizedHref = '', chatId = '' } = {}, options = {}) {
    const explicit = trimString(href);
    if (/^https?:\/\//i.test(explicit)) return explicit;
    const normalized = trimString(normalizedHref) || normalizeHref(explicit);
    if (/^https?:\/\//i.test(normalized)) return normalized;
    if (normalized) {
      const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
      return `${normalizeOrigin(options.origin)}${path}`;
    }
    return hrefForChatId(chatId, options);
  }

  function normalizeProject(project) {
    if (!isPlainObject(project)) return null;
    const projectId = firstString(project.projectId, project.id);
    const projectName = firstString(project.projectName, project.name, project.title);
    if (!projectId && !projectName) return null;
    return { projectId, projectName };
  }

  function normalizeActionTarget(target = {}, options = {}) {
    const input = isPlainObject(target) ? target : {};
    const fromString = (typeof target === 'string') ? trimString(target) : '';
    const source = normalizeSource(firstString(options.source, input.source, input.linkedFrom, input.provenance));

    let chatId = firstString(options.chatId, input.chatId, input.id, input.conversationId, input.chat_id);
    let href = firstString(
      options.href,
      input.href,
      input.url,
      input.linkSourceHref,
      input.sourceHref,
      input.originalHref,
    );
    let normalizedHref = firstString(options.normalizedHref, input.normalizedHref);

    if (fromString) {
      if (/^https?:\/\//i.test(fromString) || fromString.includes('/c/')) {
        href = href || fromString;
      } else {
        chatId = chatId || fromString;
      }
    }

    if (!chatId) chatId = normalizeChatId(href || normalizedHref);
    else chatId = normalizeChatId(chatId);

    if (!normalizedHref) normalizedHref = normalizeHref(href) || (chatId && !isImportedId(chatId) ? `/c/${chatId}` : '');
    if (!href && chatId && !isImportedId(chatId)) href = hrefForChatId(chatId, options);

    const folder = isPlainObject(input.folder) ? input.folder : {};
    const folderId = firstString(options.folderId, input.folderId, input.folder_id, folder.folderId, folder.id);
    const folderName = firstString(options.folderName, input.folderName, folder.name, folder.title);
    const title = firstString(options.title, input.title, input.name, input.label);
    const titleSource = normalizeSource(firstString(options.titleSource, input.titleSource, source), source);
    const targetKind = firstString(options.targetKind, input.targetKind, input.kind, 'chat');
    const project = normalizeProject(options.project) || normalizeProject(input.project);

    const missing = [];
    if (!chatId) missing.push('chatId');
    if (!href && !normalizedHref) missing.push('href');

    const out = {
      ok: missing.length === 0 || (!!chatId && missing.length === 1 && missing[0] === 'href'),
      phase: PHASE,
      targetKind,
      source,
      chatId,
      href,
      normalizedHref,
      title,
      titleSource,
      folderId,
      folderName,
      project,
      snapshotId: firstString(options.snapshotId, input.snapshotId, input.snapshot_id),
      missing,
      status: missing.length ? 'target-normalized-with-gaps' : 'target-normalized',
      behaviorChanged: false,
      writesEnabled: false,
      navigationEnabled: false,
    };
    if (isPlainObject(input.state)) out.state = { ...input.state };
    return Object.freeze(out);
  }

  function failure(action, status, reason, detail = {}) {
    return Object.freeze({
      ok: false,
      phase: PHASE,
      action,
      status,
      reason,
      behaviorChanged: false,
      writesEnabled: false,
      recordsWritten: 0,
      navigationEnabled: false,
      ...detail,
    });
  }

  function buildAddToLibraryPatch(target = {}, options = {}) {
    const normalized = normalizeActionTarget(target, { ...options, source: firstString(options.source, 'add-to-library') });
    if (!normalized.chatId) {
      return failure(ACTIONS.ADD_TO_LIBRARY, 'missing-chat-identity', 'A chatId is required to plan addToLibrary.', { target: normalized });
    }
    const patch = {
      chatId: normalized.chatId,
      href: normalized.href,
      normalizedHref: normalized.normalizedHref,
      title: normalized.title || 'Untitled chat',
      titleSource: normalized.titleSource || normalized.source,
      state: { isLinked: true },
      linkedFrom: normalized.source || 'add-to-library',
      linkSourceHref: normalized.href,
    };
    if (normalized.project) patch.project = { ...normalized.project };
    return Object.freeze({
      ok: true,
      phase: PHASE,
      action: ACTIONS.ADD_TO_LIBRARY,
      status: 'add-to-library-patch-ready',
      target: normalized,
      patch,
      behaviorChanged: false,
      writesEnabled: false,
      recordsWritten: 0,
      navigationEnabled: false,
    });
  }

  function buildSaveToFolderPlan(target = {}, options = {}) {
    const normalized = normalizeActionTarget(target, { ...options, source: firstString(options.source, 'save-to-folder') });
    if (!normalized.chatId) {
      return failure(ACTIONS.SAVE_TO_FOLDER, 'missing-chat-identity', 'A chatId is required to plan saveToFolder.', { target: normalized });
    }
    const folderId = trimString(options.folderId) || normalized.folderId;
    const isUnfiled = !folderId;
    const registryPatch = {
      chatId: normalized.chatId,
      href: normalized.href,
      normalizedHref: normalized.normalizedHref,
      state: { isSaved: true, isLinked: true },
      linkedFrom: 'save-to-folder',
      linkSourceHref: normalized.href,
    };
    return Object.freeze({
      ok: true,
      phase: PHASE,
      action: ACTIONS.SAVE_TO_FOLDER,
      status: 'save-to-folder-plan-ready',
      target: normalized,
      plan: {
        chatId: normalized.chatId,
        href: normalized.href,
        normalizedHref: normalized.normalizedHref,
        folderId,
        folderName: normalized.folderName,
        isUnfiled,
        captureRequired: true,
        folderBindingRequired: !isUnfiled,
        registryStampRequired: true,
        nativeExecutionRequired: true,
        studioExecutionRequired: 'surface-owned',
      },
      registryPatch,
      behaviorChanged: false,
      writesEnabled: false,
      recordsWritten: 0,
      navigationEnabled: false,
    });
  }

  function resolveOpenLinkedTarget(target = {}, options = {}) {
    const normalized = normalizeActionTarget(target, { ...options, source: firstString(options.source, 'open-linked-chat') });
    const url = absoluteUrlFromParts(normalized, options);
    if (!url) {
      return failure(ACTIONS.OPEN_LINKED_CHAT, 'open-linked-target-missing', 'No linked ChatGPT URL can be resolved.', { target: normalized });
    }
    return Object.freeze({
      ok: true,
      phase: PHASE,
      action: ACTIONS.OPEN_LINKED_CHAT,
      status: 'open-linked-target-ready',
      target: normalized,
      url,
      windowTarget: firstString(options.windowTarget, options.target, '_blank'),
      rel: 'noopener',
      behaviorChanged: false,
      writesEnabled: false,
      recordsWritten: 0,
      navigationEnabled: false,
      liveNavigationExecuted: false,
    });
  }

  function normalizeActionResult(result = {}, options = {}) {
    const raw = isPlainObject(result) ? result : { value: result };
    const action = firstString(options.action, raw.action, 'library-action');
    const ok = raw.ok === true;
    const reason = firstString(raw.reason, raw.error, options.reason);
    const status = firstString(raw.status, ok ? `${action}-ok` : `${action}-failed`);
    return Object.freeze({
      ...raw,
      ok,
      phase: firstString(raw.phase, options.phase, PHASE),
      action,
      status,
      reason,
      behaviorChanged: raw.behaviorChanged === true ? true : false,
      writesEnabled: raw.writesEnabled === true ? true : false,
      recordsWritten: Number.isFinite(raw.recordsWritten) ? raw.recordsWritten : 0,
      navigationEnabled: raw.navigationEnabled === true ? true : false,
    });
  }

  function diagnose() {
    return Object.freeze({
      ok: true,
      phase: PHASE,
      version: VERSION,
      module: 'LibraryActionsCore',
      namespace: 'H2O.LibraryActionsCore',
      mirrors: [
        'shared/library/library-actions-core.js',
        'src-runtime-base/0F0j.⬛️🎯 Library Actions Core 🎯.js',
        'src-surfaces-base/studio/S0F0j. 🎬 Library Actions Core - Studio.js',
      ],
      api: [
        'normalizeActionTarget',
        'buildAddToLibraryPatch',
        'buildSaveToFolderPlan',
        'resolveOpenLinkedTarget',
        'normalizeActionResult',
        'diagnose',
      ],
      pure: true,
      sideEffects: {
        dom: false,
        localStorage: false,
        indexedDB: false,
        archive: false,
        chromeRuntime: false,
        events: false,
        writes: false,
        navigation: false,
      },
      consumersWired: false,
      behaviorChanged: false,
      canonicalReadsEnabled: false,
      dualReadExecutionEnabled: false,
      dualWriteEnabled: false,
    });
  }

  const LibraryActionsCore = Object.freeze({
    __phase: PHASE,
    version: VERSION,
    ACTIONS,
    normalizeActionTarget,
    buildAddToLibraryPatch,
    buildSaveToFolderPlan,
    resolveOpenLinkedTarget,
    normalizeActionResult,
    diagnose,
  });

  H2O.LibraryActionsCore = LibraryActionsCore;
  H2O.Library.LibraryActionsCore = LibraryActionsCore;
  H2O.Library.ActionsCore = LibraryActionsCore;
})();
