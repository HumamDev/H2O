// ==H2O Module==
// @h2o-id             0f1j.library_actions
// @name               0F1j.⬛️🗂️ Library Actions 🎯🗂️
// @namespace          H2O.Premium.CGX.library_actions
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260512-000010
// @description        Native Library Actions: business-logic surface for Add to Library / Save to Folder / Open original ChatGPT chat. Wraps H2O.ChatRegistry (light link) and H2O.folders.saveAndBindToFolder + H2O.folders.captureCurrentChatForFolder (heavy capture, Unfiled supported) without duplicating their behavior. Phase 2 of the Add-to-Library / Save-to-Folder rollout — adds NO UI, NO menu items, NO renames. Strictly additive: callable from DevTools and from later phases (native menu, command bar).
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ 0F1j Library Actions (native)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  /* ── R4.6.0 — Native Library UI deprecation flag plumbing ───────────
   * 0F1j is the CAPTURE business-logic module (addToLibrary,
   * saveToFolder, openLinkedChat). Its functions are NEVER gated by
   * any deprecation flag. This block exposes a diagnose entry so the
   * R4.6 validator can confirm the module participates in the
   * deprecation namespace WITH gatedSurfaces:[] — i.e., nothing here
   * is a deprecation candidate. See r4.6-native-deprecation-plan.md.
   */
  const H2O_R46_FLAG_WORKSPACE_UI    = 'library.nativeWorkspaceUi';
  const H2O_R46_FLAG_ORGANIZATION_UI = 'library.nativeOrganizationUi';
  const H2O_R46_FLAG_CAPTURE_ONLY    = 'library.nativeCaptureOnlyMode';
  function isNativeWorkspaceUiEnabled() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(H2O_R46_FLAG_WORKSPACE_UI, true) !== false;
      }
    } catch (_) { /* swallow */ }
    return true;
  }
  function isNativeOrganizationUiEnabled() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(H2O_R46_FLAG_ORGANIZATION_UI, true) !== false;
      }
    } catch (_) { /* swallow */ }
    return true;
  }
  function isNativeCaptureOnlyMode() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return !!flags.get(H2O_R46_FLAG_CAPTURE_ONLY, false);
      }
    } catch (_) { /* swallow */ }
    return false;
  }
  (function registerR46Diagnose() {
    try {
      W.H2O = W.H2O || {};
      W.H2O.deprecation = W.H2O.deprecation || {};
      W.H2O.deprecation.native = W.H2O.deprecation.native || {};
      W.H2O.deprecation.native['0F1j'] = function () {
        return {
          moduleId: '0F1j',
          phase: 'R4.6.0-plumbing',
          flags: {
            'library.nativeWorkspaceUi':     isNativeWorkspaceUiEnabled(),
            'library.nativeOrganizationUi':  isNativeOrganizationUiEnabled(),
            'library.nativeCaptureOnlyMode': isNativeCaptureOnlyMode(),
          },
          gatedSurfaces: [],   /* CAPTURE — never a deprecation candidate */
          unconditionalSurfaces: [
            'addToLibrary',
            'saveToFolder',
            'openLinkedChat',
          ],
        };
      };
    } catch (_) { /* swallow */ }
  })();

  const VERSION = '1.0.0';
  const SURFACE = 'native';
  const TAG = '[H2O.LibraryActions]';

  // ── Bounded buffers for diagnose() ────────────────────────────────────────
  const ERR_MAX = 20;
  const diag = {
    t0: performance.now(),
    counts: {
      addCalls: 0,
      saveCalls: 0,
      openCalls: 0,
      alreadyLinkedHits: 0,
      errors: 0,
    },
    lastAdd: null,
    lastSave: null,
    lastOpen: null,
    errors: [],
    core: {
      usedFor: {
        target: 0,
        result: 0,
        patch: 0,
        plan: 0,
        openTarget: 0,
      },
      lastTarget: null,
      lastResult: null,
      lastPatch: null,
      lastPlan: null,
      lastOpenTarget: null,
      errors: [],
    },
  };

  function pushError(stage, e) {
    diag.counts.errors += 1;
    try {
      diag.errors.push({
        t: Math.round(performance.now() - diag.t0),
        stage: String(stage || ''),
        e: String(e?.stack || e?.message || e || ''),
      });
      if (diag.errors.length > ERR_MAX) diag.errors.splice(0, diag.errors.length - ERR_MAX);
    } catch {}
  }

  // ── Capability probes ────────────────────────────────────────────────────
  function hasChatRegistry() {
    const r = H2O.ChatRegistry;
    return !!(r && typeof r.upsertRecord === 'function' && typeof r.getRecord === 'function');
  }
  function hasFolders() {
    const f = H2O.folders;
    return !!(f && typeof f.saveAndBindToFolder === 'function');
  }
  function hasFoldersCapture() {
    const f = H2O.folders;
    return !!(f && typeof f.captureCurrentChatForFolder === 'function');
  }
  function hasArchiveBoot() {
    const a = H2O.archiveBoot;
    return !!(a && typeof a.captureNow === 'function');
  }

  // ── Shared action core bridge (pure helpers only) ─────────────────────────
  function actionsCore() {
    const ActionsCore = H2O.LibraryActionsCore || H2O.Library?.ActionsCore || H2O.Library?.LibraryActionsCore || null;
    return ActionsCore && typeof ActionsCore === 'object' ? ActionsCore : null;
  }
  function corePhase() {
    const c = actionsCore();
    return trimString(c?.__phase) || '';
  }
  function pushCoreError(stage, e) {
    try {
      diag.core.errors.push({
        t: Math.round(performance.now() - diag.t0),
        stage: String(stage || ''),
        e: String(e?.message || e || ''),
      });
      if (diag.core.errors.length > ERR_MAX) diag.core.errors.splice(0, diag.core.errors.length - ERR_MAX);
    } catch {}
  }
  function summarizeCoreValue(value) {
    if (!value || typeof value !== 'object') return value || null;
    return {
      ok: value.ok === true,
      phase: trimString(value.phase),
      action: trimString(value.action),
      status: trimString(value.status),
      reason: trimString(value.reason),
      chatId: trimString(value.chatId || value.target?.chatId || value.plan?.chatId || value.patch?.chatId),
      folderId: trimString(value.folderId || value.target?.folderId || value.plan?.folderId),
      url: trimString(value.url),
    };
  }
  function noteCoreUse(kind, value) {
    if (!diag.core.usedFor || !Object.prototype.hasOwnProperty.call(diag.core.usedFor, kind)) return;
    diag.core.usedFor[kind] += 1;
    const summarized = summarizeCoreValue(value);
    if (kind === 'target') diag.core.lastTarget = summarized;
    else if (kind === 'result') diag.core.lastResult = summarized;
    else if (kind === 'patch') diag.core.lastPatch = summarized;
    else if (kind === 'plan') diag.core.lastPlan = summarized;
    else if (kind === 'openTarget') diag.core.lastOpenTarget = summarized;
  }
  function tryCore(kind, method, args, fallback = null) {
    const c = actionsCore();
    if (!c || typeof c[method] !== 'function') return fallback;
    try {
      const out = c[method](...(Array.isArray(args) ? args : []));
      noteCoreUse(kind, out);
      return out;
    } catch (e) {
      pushCoreError(`${method}:${kind}`, e);
      return fallback;
    }
  }

  // ── Identity & URL helpers ───────────────────────────────────────────────
  function trimString(v) { return typeof v === 'string' ? v.trim() : ''; }

  function activeHref() {
    try {
      const h = String(W.location?.href || '');
      // Only accept chatgpt.com chat URLs — never leak random page hrefs.
      if (/^https?:\/\/chatgpt\.com\//i.test(h)) return h;
    } catch {}
    return '';
  }

  /**
   * Resolve a {chatId, href, normalizedHref} triple from arbitrary user input.
   * Prefers explicit chatId, then parses href, then falls back to the active
   * chatgpt.com URL. Returns nulls when nothing can be derived.
   */
  function resolveIdentity({ chatId = '', href = '' } = {}) {
    const reg = H2O.ChatRegistry;
    const parse = reg && typeof reg.parseChatIdFromHref === 'function' ? reg.parseChatIdFromHref : null;
    const norm  = reg && typeof reg.normalizeHref === 'function' ? reg.normalizeHref : null;

    let cid = trimString(chatId);
    let usedHref = trimString(href);
    if (!cid && usedHref && parse) cid = parse(usedHref) || '';
    if (!cid) {
      const pageHref = activeHref();
      if (pageHref) {
        const parsed = parse ? (parse(pageHref) || '') : '';
        if (parsed) { cid = parsed; usedHref = pageHref; }
      }
    }
    if (!cid) {
      const empty = { chatId: '', href: '', normalizedHref: '' };
      tryCore('target', 'normalizeActionTarget', [{ chatId: '', href: usedHref }, { source: 'library-actions:resolve-identity' }]);
      return empty;
    }

    if (!usedHref) usedHref = `https://chatgpt.com/c/${cid}`;
    const nh = norm ? (norm(usedHref) || `/c/${cid}`) : `/c/${cid}`;
    const ident = { chatId: cid, href: usedHref, normalizedHref: nh };
    tryCore('target', 'normalizeActionTarget', [ident, { source: 'library-actions:resolve-identity' }]);
    return ident;
  }

  function isGenericTitle(value) {
    const title = trimString(value);
    if (!title) return true;
    if (/^(new chat|untitled|untitled chat|chatgpt|chat|imported chat|linked chat|link)$/i.test(title)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(title)) return true;
    return false;
  }

  function currentChatTitleState() {
    try {
      const api = W.H2O && W.H2O.ChatTitle;
      if (api && typeof api.getState === 'function') return api.getState() || null;
    } catch {}
    return null;
  }

  function resolveTitle(explicitTitle) {
    const state = currentChatTitleState() || {};
    const candidates = [
      explicitTitle,
      state.baseTitle,
      state.title,
      state.currentTitle,
      state.displayTitle,
      state.sourceTitle,
      state.pageTitle,
      state.originalTitle,
    ];
    try {
      candidates.push(D.title || '');
    } catch {}
    for (const candidate of candidates) {
      const title = trimString(candidate);
      if (title && !isGenericTitle(title)) return title;
    }
    for (const candidate of candidates) {
      const title = trimString(candidate);
      if (title) return title;
    }
    return 'Untitled chat';
  }

  function titleMetadataPatch(title, source) {
    const cleanTitle = trimString(title);
    const titleSource = isGenericTitle(cleanTitle) ? 'derived' : 'title';
    return {
      title: cleanTitle,
      titleSource,
      displayTitle: cleanTitle,
      sourceTitle: cleanTitle,
      pageTitle: cleanTitle,
      originalTitle: cleanTitle,
      meta: {
        displayTitle: cleanTitle,
        sourceTitle: cleanTitle,
        pageTitle: cleanTitle,
        originalTitle: cleanTitle,
        titleSource,
        titleCapturedFrom: source,
      },
    };
  }

  /**
   * Build a full chatgpt.com URL from any of the three href variants.
   * Returns '' when no useful source URL exists (imported-only records).
   */
  function urlFromRecord(record) {
    if (!record || typeof record !== 'object') return '';
    const lsh = trimString(record.linkSourceHref);
    if (lsh) return lsh;
    const h = trimString(record.href);
    if (h) return h;
    const nh = trimString(record.normalizedHref);
    if (nh) {
      if (/^https?:/i.test(nh)) return nh;
      const path = nh.startsWith('/') ? nh : `/${nh}`;
      return `https://chatgpt.com${path}`;
    }
    return '';
  }

  const D = (typeof document !== 'undefined') ? document : null;

  function normalizeForDiag(action, out) {
    tryCore('result', 'normalizeActionResult', [out, { action }]);
    return out;
  }

  function buildAddPatchWithCore(ident, args, source, title) {
    tryCore('patch', 'buildAddToLibraryPatch', [{
      chatId: ident.chatId,
      href: ident.href,
      normalizedHref: ident.normalizedHref,
      ...titleMetadataPatch(title, source),
      source,
      project: args.project,
    }, { source, titleSource: 'title' }]);

    // Preserve the pre-7C native patch exactly; core is used only as a pure
    // planner and all behavior-sensitive provenance fields are restored here.
    const patch = {
      chatId: ident.chatId,
      href: ident.href,
      normalizedHref: ident.normalizedHref,
      ...titleMetadataPatch(title, source),
      state: { isLinked: true },
      linkedFrom: source,
      linkSourceHref: ident.href,
    };

    const project = (args.project && typeof args.project === 'object') ? args.project : null;
    if (project && (project.projectId || project.projectName)) {
      patch.project = {
        projectId: trimString(project.projectId),
        projectName: trimString(project.projectName),
      };
    }
    return patch;
  }

  function buildSaveRegistryPatchWithCore(ident, args, source, title) {
    const fid = trimString(args.folderId);
    tryCore('plan', 'buildSaveToFolderPlan', [{
      chatId: ident.chatId,
      href: ident.href,
      normalizedHref: ident.normalizedHref,
      folderId: fid,
      source,
    }, { source, folderId: fid }]);

    // Preserve the native registry stamp shape from the pre-core facade.
    return {
      chatId: ident.chatId,
      href: ident.href,
      normalizedHref: ident.normalizedHref,
      ...titleMetadataPatch(title, source),
      organization: { folderId: fid },
      state: { isSaved: true, isLinked: true },
      linkedFrom: 'save-to-folder',
      linkSourceHref: ident.href,
    };
  }

  function resolveOpenUrlWithCore(record, target) {
    const legacyUrl = urlFromRecord(record);
    const planned = tryCore('openTarget', 'resolveOpenLinkedTarget', [record || {}, { target }]);
    if (planned && planned.ok === true && trimString(planned.url) === legacyUrl) return planned.url;
    return legacyUrl;
  }

  // ── addToLibrary ─────────────────────────────────────────────────────────
  async function addToLibrary(args = {}) {
    diag.counts.addCalls += 1;
    const source = trimString(args.source) || 'add-to-library';
    try {
      if (!hasChatRegistry()) {
        const out = { ok: false, error: 'chat-registry-unavailable' };
        diag.lastAdd = out;
        return normalizeForDiag('addToLibrary', out);
      }

      const ident = resolveIdentity({ chatId: args.chatId, href: args.href });
      if (!ident.chatId) {
        const out = { ok: false, error: 'missing-chat-identity' };
        diag.lastAdd = out;
        return normalizeForDiag('addToLibrary', out);
      }

      // Idempotency: if the record is already linked, return early with the
      // existing record. The Phase 1 sticky-merge would also produce a no-op,
      // but short-circuiting here keeps `alreadyLinked` honest and avoids
      // emitting a redundant chat-registry:changed event.
      const prev = H2O.ChatRegistry.getRecord(ident.chatId);
      const title = resolveTitle(args.title);
      if (prev && prev.state && prev.state.isLinked === true) {
        diag.counts.alreadyLinkedHits += 1;
        const record = H2O.ChatRegistry.upsertRecord(buildAddPatchWithCore(ident, args, source, title), { source });
        const out = { ok: true, alreadyLinked: true, chatId: ident.chatId, record: record || prev };
        diag.lastAdd = out;
        return normalizeForDiag('addToLibrary', out);
      }

      const patch = buildAddPatchWithCore(ident, args, source, title);

      const record = H2O.ChatRegistry.upsertRecord(patch, { source });
      const out = { ok: true, alreadyLinked: false, chatId: ident.chatId, record };
      diag.lastAdd = out;
      return normalizeForDiag('addToLibrary', out);
    } catch (e) {
      pushError('addToLibrary', e);
      const out = { ok: false, error: String(e?.message || e || 'unknown') };
      diag.lastAdd = out;
      return normalizeForDiag('addToLibrary', out);
    }
  }

  // ── saveToFolder ─────────────────────────────────────────────────────────
  async function saveToFolder(args = {}) {
    diag.counts.saveCalls += 1;
    const source = trimString(args.source) || 'save-to-folder';
    try {
      const ident = resolveIdentity({ chatId: args.chatId, href: args.href });
      if (!ident.chatId) {
        const out = { ok: false, error: 'missing-chat-identity', chatId: '', folderId: trimString(args.folderId) };
        diag.lastSave = out;
        return normalizeForDiag('saveToFolder', out);
      }

      const fid = trimString(args.folderId); // '' means Unfiled
      let captureResult = null;
      let bindResult = null;
      let snapshotId = '';

      if (fid) {
        // Heavy path: existing folders flow captures transcript + binds.
        if (!hasFolders()) {
          const out = { ok: false, chatId: ident.chatId, folderId: fid, error: 'folders-unavailable' };
          diag.lastSave = out;
          return normalizeForDiag('saveToFolder', out);
        }
        bindResult = await H2O.folders.saveAndBindToFolder({
          chatId: ident.chatId,
          href: ident.href,
          folderId: fid,
          source,
        });
        if (!bindResult || bindResult.ok === false) {
          const err = trimString(bindResult?.reason) || trimString(bindResult?.status) || 'save-and-bind-failed';
          const out = { ok: false, chatId: ident.chatId, folderId: fid, error: err, details: bindResult };
          diag.lastSave = out;
          return normalizeForDiag('saveToFolder', out);
        }
        snapshotId = trimString(bindResult?.capture?.snapshotId)
          || trimString(bindResult?.capture?.snapshot?.snapshotId);
      } else {
        // Unfiled path: capture transcript only, no folder bind. Falls back
        // through captureCurrentChatForFolder (folders) → archiveBoot directly.
        if (hasFoldersCapture()) {
          captureResult = await H2O.folders.captureCurrentChatForFolder(ident.chatId, { source });
        } else if (hasArchiveBoot()) {
          // Last-resort defensive path — folders module not ready but archive is.
          try {
            const cap = await H2O.archiveBoot.captureNow(ident.chatId, { href: ident.href, source });
            captureResult = { ok: cap && cap.ok !== false, status: cap?.status || '', chatId: ident.chatId, capture: cap };
          } catch (e) {
            pushError('saveToFolder:archiveBoot.captureNow', e);
            captureResult = { ok: false, status: 'capture-threw', chatId: ident.chatId };
          }
        } else {
          const out = { ok: false, chatId: ident.chatId, folderId: '', error: 'capture-unavailable' };
          diag.lastSave = out;
          return normalizeForDiag('saveToFolder', out);
        }
        if (!captureResult || captureResult.ok === false) {
          const err = trimString(captureResult?.status) || 'capture-failed';
          const out = { ok: false, chatId: ident.chatId, folderId: '', error: err, details: captureResult };
          diag.lastSave = out;
          return normalizeForDiag('saveToFolder', out);
        }
        snapshotId = trimString(captureResult?.capture?.snapshotId)
          || trimString(captureResult?.capture?.snapshot?.snapshotId);
        // Best-effort: clear any prior folder binding so the chat lands as Unfiled.
        if (H2O.folders && typeof H2O.folders.setBinding === 'function') {
          try { H2O.folders.setBinding(ident.chatId, '', { source, reason: 'unfiled-after-capture' }); } catch (e) { pushError('saveToFolder:setBinding-clear', e); }
        }
      }

      // After a successful save, stamp ChatRegistry with the canonical state
      // and provenance. The Phase 1 invariant in 0F1g mergeRecord already
      // forces state.isLinked=true when isSaved=true && chatId — we set both
      // explicitly here so the linkedFrom='save-to-folder' provenance is
      // captured (otherwise the merge fallback would record 'backfill:saved').
      let record = null;
      try {
        if (hasChatRegistry()) {
          const title = resolveTitle(args.title
            || bindResult?.capture?.title
            || bindResult?.capture?.snapshot?.title
            || captureResult?.capture?.title
            || captureResult?.capture?.snapshot?.title
            || captureResult?.title);
          record = H2O.ChatRegistry.upsertRecord(buildSaveRegistryPatchWithCore(ident, args, source, title), { source });
        }
      } catch (e) {
        pushError('saveToFolder:registry-stamp', e);
      }

      const out = {
        ok: true,
        chatId: ident.chatId,
        folderId: fid,
        snapshotId,
        record,
        details: bindResult || captureResult || null,
      };
      diag.lastSave = out;
      return normalizeForDiag('saveToFolder', out);
    } catch (e) {
      pushError('saveToFolder', e);
      const out = { ok: false, chatId: trimString(args.chatId), folderId: trimString(args.folderId), error: String(e?.message || e || 'unknown') };
      diag.lastSave = out;
      return normalizeForDiag('saveToFolder', out);
    }
  }

  // ── openLinkedChat ───────────────────────────────────────────────────────
  function openLinkedChat(chatIdOrRecord, opts = {}) {
    diag.counts.openCalls += 1;
    const target = (opts && trimString(opts.target)) || '_blank';
    try {
      let record = null;
      if (chatIdOrRecord && typeof chatIdOrRecord === 'object') {
        record = chatIdOrRecord;
      } else if (typeof chatIdOrRecord === 'string' && chatIdOrRecord.trim()) {
        const id = chatIdOrRecord.trim();
        if (hasChatRegistry()) record = H2O.ChatRegistry.getRecord(id);
      }
      const url = resolveOpenUrlWithCore(record, target);
      if (!url) {
        const out = false;
        diag.lastOpen = { ok: false, reason: 'no-url' };
        normalizeForDiag('openLinkedChat', diag.lastOpen);
        return out;
      }
      W.open(url, target, 'noopener');
      diag.lastOpen = { ok: true, url, target };
      normalizeForDiag('openLinkedChat', diag.lastOpen);
      return true;
    } catch (e) {
      pushError('openLinkedChat', e);
      diag.lastOpen = { ok: false, reason: 'threw' };
      normalizeForDiag('openLinkedChat', diag.lastOpen);
      return false;
    }
  }

  // ── diagnose ─────────────────────────────────────────────────────────────
  function diagnose() {
    return {
      surface: SURFACE,
      version: VERSION,
      counts: { ...diag.counts },
      lastAdd: diag.lastAdd,
      lastSave: diag.lastSave,
      lastOpen: diag.lastOpen,
      errors: diag.errors.slice(-Math.min(10, ERR_MAX)),
      hasChatRegistry: hasChatRegistry(),
      hasFolders: hasFolders(),
      hasArchiveBoot: hasArchiveBoot(),
      coreAvailable: !!actionsCore(),
      corePhase: corePhase(),
      coreUsedFor: { ...diag.core.usedFor },
      coreLast: {
        target: diag.core.lastTarget,
        result: diag.core.lastResult,
        patch: diag.core.lastPatch,
        plan: diag.core.lastPlan,
        openTarget: diag.core.lastOpenTarget,
      },
      coreErrors: diag.core.errors.slice(-Math.min(10, ERR_MAX)),
    };
  }

  // ── Public surface ───────────────────────────────────────────────────────
  const LibraryActions = {
    surface: SURFACE,
    version: VERSION,
    addToLibrary,
    saveToFolder,
    openLinkedChat,
    diagnose,
  };

  H2O.LibraryActions = LibraryActions;
  H2O.Library.Actions = LibraryActions; // convenience namespace

  // ── Boot: register with LibraryCore when ready ───────────────────────────
  function registerOnCore() {
    const core = H2O.LibraryCore;
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-actions', LibraryActions, { replace: true });
      core.registerService('library-actions', LibraryActions, { replace: true });
      return true;
    } catch (e) { pushError('register-on-core', e); return false; }
  }

  if (!registerOnCore()) {
    // The existing Library Core ready event used by other 0F1* modules.
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }

  try {
    console.log(`${TAG} v${VERSION} ready — chatRegistry=${hasChatRegistry()} folders=${hasFolders()} archive=${hasArchiveBoot()}`);
  } catch {}
})();
