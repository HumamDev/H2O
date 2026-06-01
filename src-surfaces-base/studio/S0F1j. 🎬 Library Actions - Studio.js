// ==UserScript==
// @h2o-id             s0f1j.library_actions.studio
// @name               S0F1j. 🎬 Library Actions - Studio
// @namespace          H2O.Premium.CGX.library_actions.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260520-000001
// @description        Phase 7D - Studio LibraryActions facade. Publishes H2O.LibraryActions for Studio command consumers, delegates pure target/result planning to LibraryActionsCore, supports Studio-safe open-linked-chat, and keeps native-only add/save capture paths explicitly unsupported.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1j Library Actions (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const PHASE = '7D';
  const VERSION = '1.0.0';
  const SURFACE = 'studio';
  const TAG = '[H2O.LibraryActions(Studio)]';
  const ERR_MAX = 20;

  const diag = {
    t0: performance.now(),
    counts: {
      addCalls: 0,
      saveCalls: 0,
      openCalls: 0,
      setCategoryCalls: 0,
      unsupportedCalls: 0,
      opened: 0,
      errors: 0,
    },
    lastAdd: null,
    lastSave: null,
    lastOpen: null,
    lastSetCategory: null,
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

  function trimString(value) {
    return typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim());
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function firstString(...values) {
    for (const value of values) {
      const out = trimString(value);
      if (out) return out;
    }
    return '';
  }

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

  function actionsCore() {
    const ActionsCore = H2O.LibraryActionsCore || H2O.Library?.ActionsCore || H2O.Library?.LibraryActionsCore || null;
    return ActionsCore && typeof ActionsCore === 'object' ? ActionsCore : null;
  }

  function corePhase() {
    const core = actionsCore();
    return trimString(core?.__phase) || '';
  }

  function getRegistry() {
    return H2O.ChatRegistry || H2O.Library?.ChatRegistry || null;
  }

  function getIndex() {
    return H2O.LibraryIndex || H2O.Library?.Index || null;
  }

  function getWorkspace() {
    return H2O.LibraryWorkspace || H2O.Library?.Workspace || null;
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
    const core = actionsCore();
    if (!core || typeof core[method] !== 'function') return fallback;
    try {
      const out = core[method](...(Array.isArray(args) ? args : []));
      noteCoreUse(kind, out);
      return out;
    } catch (e) {
      pushCoreError(`${method}:${kind}`, e);
      return fallback;
    }
  }

  function normalizeResultForDiag(action, result) {
    tryCore('result', 'normalizeActionResult', [result, { action, phase: PHASE }]);
    return result;
  }

  function registryRecord(chatId) {
    const id = trimString(chatId);
    const registry = getRegistry();
    if (!id || !registry || typeof registry.getRecord !== 'function') return null;
    try { return registry.getRecord(id) || null; }
    catch (e) { pushError('registry.getRecord', e); return null; }
  }

  function indexRow(chatId) {
    const id = trimString(chatId);
    const index = getIndex();
    if (!id || !index || typeof index.getByChatId !== 'function') return null;
    try { return index.getByChatId(id) || null; }
    catch (e) { pushError('index.getByChatId', e); return null; }
  }

  function mergeRawRecord(record) {
    if (!isObject(record)) return {};
    const raw = isObject(record.raw) ? record.raw : {};
    return { ...raw, ...record };
  }

  function isUrlLike(value) {
    const raw = trimString(value);
    return /^https?:\/\//i.test(raw) || raw.includes('/c/');
  }

  function expandTarget(target, options = {}) {
    if (typeof target === 'string') {
      const raw = trimString(target);
      if (!raw) return { source: 'empty', target: {} };
      if (isUrlLike(raw)) return { source: 'direct-url', target: { href: raw } };
      const record = registryRecord(raw);
      if (record) {
        const mergedRecord = mergeRawRecord(record);
        if (hasExplicitSourceUrl(mergedRecord)) return { source: 'chat-registry', target: mergedRecord };
        const row = indexRow(raw);
        if (row) return { source: 'chat-registry+library-index', target: { ...mergeRawRecord(row), ...mergedRecord } };
        return { source: 'chat-registry', target: mergedRecord };
      }
      const row = indexRow(raw);
      if (row) return { source: 'library-index', target: mergeRawRecord(row) };
      return { source: 'chat-id-unresolved', target: { chatId: raw } };
    }
    if (isObject(target)) {
      const merged = mergeRawRecord(target);
      const id = firstString(options.chatId, merged.chatId, merged.id, merged.conversationId);
      if (id && !firstString(merged.linkSourceHref, merged.href, merged.normalizedHref)) {
        const record = registryRecord(id);
        if (record) {
          const mergedRecord = { ...mergeRawRecord(record), ...merged };
          if (hasExplicitSourceUrl(mergedRecord)) return { source: 'object+chat-registry', target: mergedRecord };
          const row = indexRow(id);
          if (row) return { source: 'object+chat-registry+library-index', target: { ...mergeRawRecord(row), ...mergedRecord } };
          return { source: 'object+chat-registry', target: mergedRecord };
        }
        const row = indexRow(id);
        if (row) return { source: 'object+library-index', target: { ...mergeRawRecord(row), ...merged } };
      }
      return { source: 'object', target: merged };
    }
    return { source: 'unknown', target: {} };
  }

  function normalizeTarget(target, options = {}) {
    const expanded = expandTarget(target, options);
    const normalized = tryCore('target', 'normalizeActionTarget', [
      expanded.target,
      { ...options, source: firstString(options.source, `studio:${expanded.source}`) },
    ]);
    return {
      ...expanded,
      normalized: normalized && typeof normalized === 'object' ? normalized : null,
    };
  }

  function sourceUrlFromTarget(target) {
    if (!isObject(target)) return '';
    const raw = firstString(target.linkSourceHref, target.href, target.normalizedHref);
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return `https://chatgpt.com${raw}`;
    if (/^c\//i.test(raw)) return `https://chatgpt.com/${raw}`;
    return '';
  }

  function hasExplicitSourceUrl(target) {
    return !!firstString(target?.linkSourceHref, target?.href, target?.normalizedHref);
  }

  function baseResult(action, status, extra = {}) {
    return {
      ok: extra.ok === true,
      phase: PHASE,
      surface: SURFACE,
      action,
      status,
      behaviorChanged: false,
      recordsWritten: 0,
      canonicalReadEnabled: false,
      dualReadExecutionEnabled: false,
      dualWriteEnabled: false,
      nativeCaptureExecuted: false,
      nativeWriteExecuted: false,
      ...extra,
    };
  }

  async function addToLibrary(target = {}, options = {}) {
    diag.counts.addCalls += 1;
    const source = firstString(options.source, 'studio:add-to-library');
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const plan = tryCore('patch', 'buildAddToLibraryPatch', [targetInfo.target, { ...options, source }]);
      diag.counts.unsupportedCalls += 1;
      const out = baseResult('addToLibrary', 'native-context-required', {
        ok: false,
        reason: 'Studio cannot perform native ChatGPT capture/link writes in Phase 7D.',
        targetSource: targetInfo.source,
        chatId: trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId),
        planned: plan?.ok === true,
        supportedInStudio: false,
      });
      diag.lastAdd = out;
      return normalizeResultForDiag('addToLibrary', out);
    } catch (e) {
      pushError('addToLibrary', e);
      const out = baseResult('addToLibrary', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastAdd = out;
      return normalizeResultForDiag('addToLibrary', out);
    }
  }

  async function saveToFolder(target = {}, options = {}) {
    diag.counts.saveCalls += 1;
    const source = firstString(options.source, 'studio:save-to-folder');
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const plan = tryCore('plan', 'buildSaveToFolderPlan', [targetInfo.target, { ...options, source }]);
      diag.counts.unsupportedCalls += 1;
      const out = baseResult('saveToFolder', 'native-context-required', {
        ok: false,
        reason: 'Studio facade does not trigger native transcript capture or folder writes in Phase 7D.',
        targetSource: targetInfo.source,
        chatId: trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId),
        folderId: trimString(options.folderId || targetInfo.normalized?.folderId || targetInfo.target?.folderId),
        planned: plan?.ok === true,
        supportedInStudio: false,
      });
      diag.lastSave = out;
      return normalizeResultForDiag('saveToFolder', out);
    } catch (e) {
      pushError('saveToFolder', e);
      const out = baseResult('saveToFolder', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastSave = out;
      return normalizeResultForDiag('saveToFolder', out);
    }
  }

  /* R4.1 — Tauri detection used only by setCategory routing.
   * Local helper (same pattern as the .tauri.js modules) to avoid
   * importing the platform adapter for a one-line check. */
  function LA_isTauri() {
    try {
      if (typeof globalThis.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof globalThis.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }

  /* R4.1 — setCategory(target, options).
   *
   * The first action in the R4 series where Studio becomes a canonical
   * writer rather than a native-context-required facade. On Desktop,
   * routes through H2O.Studio.actions.categories.{assignChat, clearChat}
   * which write to SQLite via store.categories and dispatch the
   * canonical LibraryIndex refresh request event. On MV3 / web, returns
   * native-context-required exactly like addToLibrary/saveToFolder so
   * the existing Chrome workflow is unchanged.
   *
   * options.categoryId — empty string or absent means "clear assignment"
   *   (delegates to actions.categories.clearChat). Non-empty means
   *   assign (delegates to actions.categories.assignChat). The action
   *   module verifies the category exists; result.status surfaces the
   *   specific reason if not. */
  async function setCategory(target = {}, options = {}) {
    diag.counts.setCategoryCalls += 1;
    const source = firstString(options.source, 'studio:set-category');
    const desktop = LA_isTauri();
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const chatId = trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId);
      const categoryId = trimString(options.categoryId);

      /* MV3 / web — preserve native-context-required pattern. */
      if (!desktop) {
        diag.counts.unsupportedCalls += 1;
        const out = baseResult('setCategory', 'native-context-required', {
          ok: false,
          reason: 'Studio facade does not write category state on MV3 in R4.1; use Native UI on chatgpt.com.',
          targetSource: targetInfo.source,
          chatId,
          categoryId,
          supportedInStudio: false,
        });
        diag.lastSetCategory = out;
        return normalizeResultForDiag('setCategory', out);
      }

      /* Desktop path: route to actions.categories.* */
      const actions = H2O.Studio?.actions?.categories;
      if (!actions || (typeof actions.assignChat !== 'function' || typeof actions.clearChat !== 'function')) {
        const out = baseResult('setCategory', 'actions-unavailable', {
          ok: false,
          reason: 'H2O.Studio.actions.categories not loaded — verify S0F4b is in the bundle',
          chatId,
          categoryId,
        });
        diag.lastSetCategory = out;
        return normalizeResultForDiag('setCategory', out);
      }
      if (!chatId) {
        const out = baseResult('setCategory', 'chat-id-required', { ok: false, chatId, categoryId });
        diag.lastSetCategory = out;
        return normalizeResultForDiag('setCategory', out);
      }

      const actionResult = categoryId
        ? await actions.assignChat(chatId, categoryId)
        : await actions.clearChat(chatId);
      const status = actionResult && actionResult.status ? actionResult.status : (actionResult && actionResult.ok ? 'ok' : 'error');
      const out = baseResult('setCategory', status, {
        ok: !!(actionResult && actionResult.ok),
        chatId,
        categoryId,
        targetSource: targetInfo.source,
        actionResult,
        source,
        supportedInStudio: true,
      });
      diag.lastSetCategory = out;
      return normalizeResultForDiag('setCategory', out);
    } catch (e) {
      pushError('setCategory', e);
      const out = baseResult('setCategory', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastSetCategory = out;
      return normalizeResultForDiag('setCategory', out);
    }
  }

  function resolveOpenPlan(target = {}, options = {}) {
    const windowTarget = firstString(options.target, options.windowTarget, '_blank');
    const targetInfo = normalizeTarget(target, { ...options, source: firstString(options.source, 'studio:open-linked-chat') });
    const planned = tryCore('openTarget', 'resolveOpenLinkedTarget', [
      targetInfo.target,
      { ...options, target: windowTarget, windowTarget },
    ]);
    const explicitUrl = hasExplicitSourceUrl(targetInfo.target);
    const legacyUrl = sourceUrlFromTarget(targetInfo.target);
    const plannedUrl = trimString(planned?.url);
    const url = explicitUrl ? (legacyUrl || plannedUrl) : '';
    return { targetInfo, planned, windowTarget, url };
  }

  function openLinkedChat(target = {}, options = {}) {
    diag.counts.openCalls += 1;
    try {
      const plan = resolveOpenPlan(target, options);
      const chatId = trimString(plan.targetInfo.normalized?.chatId || plan.targetInfo.target?.chatId);
      if (!plan.url) {
        const status = plan.targetInfo.source === 'chat-id-unresolved'
          ? 'linked-chat-record-missing'
          : 'open-linked-target-missing';
        const out = baseResult('openLinkedChat', status, {
          ok: false,
          reason: 'No linked ChatGPT URL is available for this Studio target.',
          targetSource: plan.targetInfo.source,
          chatId,
          navigationEnabled: false,
          liveNavigationExecuted: false,
        });
        diag.lastOpen = out;
        return normalizeResultForDiag('openLinkedChat', out);
      }

      W.open(plan.url, plan.windowTarget, 'noopener');
      diag.counts.opened += 1;
      const out = baseResult('openLinkedChat', 'opened-linked-chat', {
        ok: true,
        targetSource: plan.targetInfo.source,
        chatId,
        url: plan.url,
        target: plan.windowTarget,
        navigationEnabled: true,
        liveNavigationExecuted: true,
      });
      diag.lastOpen = out;
      return normalizeResultForDiag('openLinkedChat', out);
    } catch (e) {
      pushError('openLinkedChat', e);
      const out = baseResult('openLinkedChat', 'open-linked-chat-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
        navigationEnabled: false,
        liveNavigationExecuted: false,
      });
      diag.lastOpen = out;
      return normalizeResultForDiag('openLinkedChat', out);
    }
  }

  function diagnose() {
    return {
      ok: true,
      phase: PHASE,
      surface: SURFACE,
      version: VERSION,
      counts: { ...diag.counts },
      lastAdd: diag.lastAdd,
      lastSave: diag.lastSave,
      lastOpen: diag.lastOpen,
      errors: diag.errors.slice(-Math.min(10, ERR_MAX)),
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
      supportedActions: {
        openLinkedChat: true,
        addToLibrary: false,
        saveToFolder: false,
        /* R4.1 — setCategory is platform-conditional: true on Desktop
         * when actions.categories is loaded; native-context-required
         * on MV3. Reflect that here rather than a static bool. */
        setCategory: LA_isTauri() && !!H2O.Studio?.actions?.categories,
      },
      unsupportedActions: {
        addToLibrary: 'native-context-required',
        saveToFolder: 'native-context-required',
        ...(LA_isTauri() && H2O.Studio?.actions?.categories
          ? {}
          : { setCategory: LA_isTauri() ? 'actions-unavailable' : 'native-context-required' }),
      },
      dependencies: {
        core: !!actionsCore(),
        chatRegistry: !!getRegistry(),
        libraryIndex: !!getIndex(),
        workspace: !!getWorkspace(),
      },
      behaviorChanged: false,
      canonicalReadEnabled: false,
      dualReadExecutionEnabled: false,
      dualWriteEnabled: false,
    };
  }

  const LibraryActions = {
    surface: SURFACE,
    phase: PHASE,
    version: VERSION,
    addToLibrary,
    saveToFolder,
    setCategory,
    openLinkedChat,
    diagnose,
  };

  H2O.LibraryActions = LibraryActions;
  H2O.Library.Actions = LibraryActions;

  function registerOnCore() {
    const core = H2O.LibraryCore;
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-actions', LibraryActions, { replace: true });
      core.registerService('library-actions', LibraryActions, { replace: true });
      return true;
    } catch (e) {
      pushError('register-on-core', e);
      return false;
    }
  }

  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
    W.setTimeout(registerOnCore, 250);
  }

  try {
    console.log(`${TAG} v${VERSION} ready - core=${!!actionsCore()} registry=${!!getRegistry()} index=${!!getIndex()}`);
  } catch {}
})();
