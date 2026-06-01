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
      setLabelsCalls: 0,
      addLabelCalls: 0,
      removeLabelCalls: 0,
      setTagsCalls: 0,
      addTagCalls: 0,
      removeTagCalls: 0,
      setFolderCalls: 0,
      unsupportedCalls: 0,
      opened: 0,
      errors: 0,
    },
    lastAdd: null,
    lastSave: null,
    lastOpen: null,
    lastSetCategory: null,
    lastSetLabels: null,
    lastAddLabel: null,
    lastRemoveLabel: null,
    lastSetTags: null,
    lastAddTag: null,
    lastRemoveTag: null,
    lastSetFolder: null,
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

  /* R4.2 — Labels facade methods. Same Desktop/MV3 routing pattern as
   * setCategory; routes through H2O.Studio.actions.labels.* which
   * wraps store.labels with refresh-event dispatch. Three methods:
   *
   *   setLabels(target, {labelIds})    — full replacement (drops all
   *                                       existing, inserts the new set;
   *                                       empty array clears all labels)
   *   addLabel(target, {labelId})      — idempotent single-label add
   *                                       (no-op if already bound)
   *   removeLabel(target, {labelId})   — single-label remove (returns
   *                                       wasBound flag for diagnostics)
   *
   * All three return native-context-required on MV3 to preserve the
   * existing Chrome workflow. None of the three depend on a chats row
   * existing first — label_bindings has no FK to chats so orphan
   * bindings (chats not yet imported) are tolerated and resolve once
   * the chat arrives via R3 import. */
  async function setLabels(target = {}, options = {}) {
    diag.counts.setLabelsCalls += 1;
    const source = firstString(options.source, 'studio:set-labels');
    const desktop = LA_isTauri();
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const chatId = trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId);
      const labelIds = Array.isArray(options.labelIds) ? options.labelIds : null;

      if (!desktop) {
        diag.counts.unsupportedCalls += 1;
        const out = baseResult('setLabels', 'native-context-required', {
          ok: false,
          reason: 'Studio facade does not write labels on MV3 in R4.2; use Native UI on chatgpt.com.',
          targetSource: targetInfo.source,
          chatId,
          labelIds,
          supportedInStudio: false,
        });
        diag.lastSetLabels = out;
        return normalizeResultForDiag('setLabels', out);
      }

      const actions = H2O.Studio?.actions?.labels;
      if (!actions || typeof actions.replaceForChat !== 'function') {
        const out = baseResult('setLabels', 'actions-unavailable', {
          ok: false,
          reason: 'H2O.Studio.actions.labels not loaded — verify S0F6b is in the bundle',
          chatId,
          labelIds,
        });
        diag.lastSetLabels = out;
        return normalizeResultForDiag('setLabels', out);
      }
      if (!chatId) {
        const out = baseResult('setLabels', 'chat-id-required', { ok: false, chatId });
        diag.lastSetLabels = out;
        return normalizeResultForDiag('setLabels', out);
      }
      if (labelIds === null) {
        const out = baseResult('setLabels', 'labels-array-required', {
          ok: false, chatId,
          reason: 'options.labelIds must be an array (pass [] to clear)',
        });
        diag.lastSetLabels = out;
        return normalizeResultForDiag('setLabels', out);
      }

      const actionResult = await actions.replaceForChat(chatId, labelIds);
      const out = baseResult('setLabels',
        actionResult && actionResult.status ? actionResult.status : (actionResult && actionResult.ok ? 'ok' : 'error'),
        {
          ok: !!(actionResult && actionResult.ok),
          chatId,
          labelIds: (actionResult && actionResult.labelIds) || [],
          count: (actionResult && actionResult.count) || 0,
          targetSource: targetInfo.source,
          actionResult,
          source,
          supportedInStudio: true,
        });
      diag.lastSetLabels = out;
      return normalizeResultForDiag('setLabels', out);
    } catch (e) {
      pushError('setLabels', e);
      const out = baseResult('setLabels', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastSetLabels = out;
      return normalizeResultForDiag('setLabels', out);
    }
  }

  async function addLabel(target = {}, options = {}) {
    diag.counts.addLabelCalls += 1;
    const source = firstString(options.source, 'studio:add-label');
    const desktop = LA_isTauri();
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const chatId = trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId);
      const labelId = trimString(options.labelId);

      if (!desktop) {
        diag.counts.unsupportedCalls += 1;
        const out = baseResult('addLabel', 'native-context-required', {
          ok: false,
          reason: 'Studio facade does not write labels on MV3 in R4.2; use Native UI on chatgpt.com.',
          targetSource: targetInfo.source,
          chatId, labelId,
          supportedInStudio: false,
        });
        diag.lastAddLabel = out;
        return normalizeResultForDiag('addLabel', out);
      }

      const actions = H2O.Studio?.actions?.labels;
      if (!actions || typeof actions.bindChat !== 'function') {
        const out = baseResult('addLabel', 'actions-unavailable', {
          ok: false,
          reason: 'H2O.Studio.actions.labels not loaded — verify S0F6b is in the bundle',
          chatId, labelId,
        });
        diag.lastAddLabel = out;
        return normalizeResultForDiag('addLabel', out);
      }
      if (!chatId) {
        const out = baseResult('addLabel', 'chat-id-required', { ok: false, chatId, labelId });
        diag.lastAddLabel = out;
        return normalizeResultForDiag('addLabel', out);
      }
      if (!labelId) {
        const out = baseResult('addLabel', 'label-id-required', { ok: false, chatId, labelId });
        diag.lastAddLabel = out;
        return normalizeResultForDiag('addLabel', out);
      }

      const actionResult = await actions.bindChat(chatId, labelId);
      const out = baseResult('addLabel',
        actionResult && actionResult.status ? actionResult.status : (actionResult && actionResult.ok ? 'ok' : 'error'),
        {
          ok: !!(actionResult && actionResult.ok),
          chatId, labelId,
          targetSource: targetInfo.source,
          actionResult,
          source,
          supportedInStudio: true,
        });
      diag.lastAddLabel = out;
      return normalizeResultForDiag('addLabel', out);
    } catch (e) {
      pushError('addLabel', e);
      const out = baseResult('addLabel', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastAddLabel = out;
      return normalizeResultForDiag('addLabel', out);
    }
  }

  async function removeLabel(target = {}, options = {}) {
    diag.counts.removeLabelCalls += 1;
    const source = firstString(options.source, 'studio:remove-label');
    const desktop = LA_isTauri();
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const chatId = trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId);
      const labelId = trimString(options.labelId);

      if (!desktop) {
        diag.counts.unsupportedCalls += 1;
        const out = baseResult('removeLabel', 'native-context-required', {
          ok: false,
          reason: 'Studio facade does not write labels on MV3 in R4.2; use Native UI on chatgpt.com.',
          targetSource: targetInfo.source,
          chatId, labelId,
          supportedInStudio: false,
        });
        diag.lastRemoveLabel = out;
        return normalizeResultForDiag('removeLabel', out);
      }

      const actions = H2O.Studio?.actions?.labels;
      if (!actions || typeof actions.unbindChat !== 'function') {
        const out = baseResult('removeLabel', 'actions-unavailable', {
          ok: false,
          reason: 'H2O.Studio.actions.labels not loaded — verify S0F6b is in the bundle',
          chatId, labelId,
        });
        diag.lastRemoveLabel = out;
        return normalizeResultForDiag('removeLabel', out);
      }
      if (!chatId) {
        const out = baseResult('removeLabel', 'chat-id-required', { ok: false, chatId, labelId });
        diag.lastRemoveLabel = out;
        return normalizeResultForDiag('removeLabel', out);
      }
      if (!labelId) {
        const out = baseResult('removeLabel', 'label-id-required', { ok: false, chatId, labelId });
        diag.lastRemoveLabel = out;
        return normalizeResultForDiag('removeLabel', out);
      }

      const actionResult = await actions.unbindChat(chatId, labelId);
      const out = baseResult('removeLabel',
        actionResult && actionResult.status ? actionResult.status : (actionResult && actionResult.ok ? 'ok' : 'error'),
        {
          ok: !!(actionResult && actionResult.ok),
          chatId, labelId,
          wasBound: !!(actionResult && actionResult.wasBound),
          targetSource: targetInfo.source,
          actionResult,
          source,
          supportedInStudio: true,
        });
      diag.lastRemoveLabel = out;
      return normalizeResultForDiag('removeLabel', out);
    } catch (e) {
      pushError('removeLabel', e);
      const out = baseResult('removeLabel', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastRemoveLabel = out;
      return normalizeResultForDiag('removeLabel', out);
    }
  }

  /* R4.3 — Tags facade methods. Same Desktop/MV3 routing pattern as
   * setLabels / addLabel / removeLabel from R4.2; routes through
   * H2O.Studio.actions.tags.* which wraps store.tags with
   * refresh-event dispatch. Three methods:
   *
   *   setTags(target, {tagIds})        — full replacement (drops all
   *                                      existing, inserts the new set;
   *                                      empty array clears all tags)
   *   addTag(target, {tagId})          — idempotent single-tag add
   *                                      (no-op if already bound)
   *   removeTag(target, {tagId})       — single-tag remove (returns
   *                                      wasBound flag for diagnostics)
   *
   * Boundary: this facade routes ONLY explicit user-chosen tag IDs;
   * Native 0F5a's turn-level tag EXTRACTION continues to derive tags
   * from chatgpt.com DOM and is NOT invoked from here. The Studio
   * actions module S0F5b deliberately has no DOM surface.
   *
   * MV3 path returns native-context-required to preserve the existing
   * Chrome workflow. */
  async function setTags(target = {}, options = {}) {
    diag.counts.setTagsCalls += 1;
    const source = firstString(options.source, 'studio:set-tags');
    const desktop = LA_isTauri();
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const chatId = trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId);
      const tagIds = Array.isArray(options.tagIds) ? options.tagIds : null;

      if (!desktop) {
        diag.counts.unsupportedCalls += 1;
        const out = baseResult('setTags', 'native-context-required', {
          ok: false,
          reason: 'Studio facade does not write tags on MV3 in R4.3; use Native UI on chatgpt.com.',
          targetSource: targetInfo.source,
          chatId,
          tagIds,
          supportedInStudio: false,
        });
        diag.lastSetTags = out;
        return normalizeResultForDiag('setTags', out);
      }

      const actions = H2O.Studio?.actions?.tags;
      if (!actions || typeof actions.replaceForChat !== 'function') {
        const out = baseResult('setTags', 'actions-unavailable', {
          ok: false,
          reason: 'H2O.Studio.actions.tags not loaded — verify S0F5b is in the bundle',
          chatId,
          tagIds,
        });
        diag.lastSetTags = out;
        return normalizeResultForDiag('setTags', out);
      }
      if (!chatId) {
        const out = baseResult('setTags', 'chat-id-required', { ok: false, chatId });
        diag.lastSetTags = out;
        return normalizeResultForDiag('setTags', out);
      }
      if (tagIds === null) {
        const out = baseResult('setTags', 'tags-array-required', {
          ok: false, chatId,
          reason: 'options.tagIds must be an array (pass [] to clear)',
        });
        diag.lastSetTags = out;
        return normalizeResultForDiag('setTags', out);
      }

      const actionResult = await actions.replaceForChat(chatId, tagIds);
      const out = baseResult('setTags',
        actionResult && actionResult.status ? actionResult.status : (actionResult && actionResult.ok ? 'ok' : 'error'),
        {
          ok: !!(actionResult && actionResult.ok),
          chatId,
          tagIds: (actionResult && actionResult.tagIds) || [],
          count: (actionResult && actionResult.count) || 0,
          targetSource: targetInfo.source,
          actionResult,
          source,
          supportedInStudio: true,
        });
      diag.lastSetTags = out;
      return normalizeResultForDiag('setTags', out);
    } catch (e) {
      pushError('setTags', e);
      const out = baseResult('setTags', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastSetTags = out;
      return normalizeResultForDiag('setTags', out);
    }
  }

  async function addTag(target = {}, options = {}) {
    diag.counts.addTagCalls += 1;
    const source = firstString(options.source, 'studio:add-tag');
    const desktop = LA_isTauri();
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const chatId = trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId);
      const tagId = trimString(options.tagId);

      if (!desktop) {
        diag.counts.unsupportedCalls += 1;
        const out = baseResult('addTag', 'native-context-required', {
          ok: false,
          reason: 'Studio facade does not write tags on MV3 in R4.3; use Native UI on chatgpt.com.',
          targetSource: targetInfo.source,
          chatId, tagId,
          supportedInStudio: false,
        });
        diag.lastAddTag = out;
        return normalizeResultForDiag('addTag', out);
      }

      const actions = H2O.Studio?.actions?.tags;
      if (!actions || typeof actions.bindChat !== 'function') {
        const out = baseResult('addTag', 'actions-unavailable', {
          ok: false,
          reason: 'H2O.Studio.actions.tags not loaded — verify S0F5b is in the bundle',
          chatId, tagId,
        });
        diag.lastAddTag = out;
        return normalizeResultForDiag('addTag', out);
      }
      if (!chatId) {
        const out = baseResult('addTag', 'chat-id-required', { ok: false, chatId, tagId });
        diag.lastAddTag = out;
        return normalizeResultForDiag('addTag', out);
      }
      if (!tagId) {
        const out = baseResult('addTag', 'tag-id-required', { ok: false, chatId, tagId });
        diag.lastAddTag = out;
        return normalizeResultForDiag('addTag', out);
      }

      const actionResult = await actions.bindChat(chatId, tagId);
      const out = baseResult('addTag',
        actionResult && actionResult.status ? actionResult.status : (actionResult && actionResult.ok ? 'ok' : 'error'),
        {
          ok: !!(actionResult && actionResult.ok),
          chatId, tagId,
          targetSource: targetInfo.source,
          actionResult,
          source,
          supportedInStudio: true,
        });
      diag.lastAddTag = out;
      return normalizeResultForDiag('addTag', out);
    } catch (e) {
      pushError('addTag', e);
      const out = baseResult('addTag', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastAddTag = out;
      return normalizeResultForDiag('addTag', out);
    }
  }

  async function removeTag(target = {}, options = {}) {
    diag.counts.removeTagCalls += 1;
    const source = firstString(options.source, 'studio:remove-tag');
    const desktop = LA_isTauri();
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const chatId = trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId);
      const tagId = trimString(options.tagId);

      if (!desktop) {
        diag.counts.unsupportedCalls += 1;
        const out = baseResult('removeTag', 'native-context-required', {
          ok: false,
          reason: 'Studio facade does not write tags on MV3 in R4.3; use Native UI on chatgpt.com.',
          targetSource: targetInfo.source,
          chatId, tagId,
          supportedInStudio: false,
        });
        diag.lastRemoveTag = out;
        return normalizeResultForDiag('removeTag', out);
      }

      const actions = H2O.Studio?.actions?.tags;
      if (!actions || typeof actions.unbindChat !== 'function') {
        const out = baseResult('removeTag', 'actions-unavailable', {
          ok: false,
          reason: 'H2O.Studio.actions.tags not loaded — verify S0F5b is in the bundle',
          chatId, tagId,
        });
        diag.lastRemoveTag = out;
        return normalizeResultForDiag('removeTag', out);
      }
      if (!chatId) {
        const out = baseResult('removeTag', 'chat-id-required', { ok: false, chatId, tagId });
        diag.lastRemoveTag = out;
        return normalizeResultForDiag('removeTag', out);
      }
      if (!tagId) {
        const out = baseResult('removeTag', 'tag-id-required', { ok: false, chatId, tagId });
        diag.lastRemoveTag = out;
        return normalizeResultForDiag('removeTag', out);
      }

      const actionResult = await actions.unbindChat(chatId, tagId);
      const out = baseResult('removeTag',
        actionResult && actionResult.status ? actionResult.status : (actionResult && actionResult.ok ? 'ok' : 'error'),
        {
          ok: !!(actionResult && actionResult.ok),
          chatId, tagId,
          wasBound: !!(actionResult && actionResult.wasBound),
          targetSource: targetInfo.source,
          actionResult,
          source,
          supportedInStudio: true,
        });
      diag.lastRemoveTag = out;
      return normalizeResultForDiag('removeTag', out);
    } catch (e) {
      pushError('removeTag', e);
      const out = baseResult('removeTag', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastRemoveTag = out;
      return normalizeResultForDiag('removeTag', out);
    }
  }

  /* R4.4 — Folders facade method. Single setter (folderId: '' clears)
   * because folders are 1:1 per chat (folder_bindings PRIMARY KEY is
   * chat_id alone, not composite).
   *
   * Important interop note: setFolder is the NEW Studio-internal entry
   * point that R4.4 introduces, but the existing
   * S0F1b.desktopSetFolderBinding remains the PRIMARY caller of
   * actions.folders today (refactored in R4.4 to delegate there).
   * setFolder is exposed on LibraryActions for symmetry with R4.1
   * setCategory / R4.2 setLabels / R4.3 setTags. Studio UI code may
   * call either; they end up at the same SQLite write path. */
  async function setFolder(target = {}, options = {}) {
    diag.counts.setFolderCalls += 1;
    const source = firstString(options.source, 'studio:set-folder');
    const desktop = LA_isTauri();
    try {
      const targetInfo = normalizeTarget(target, { ...options, source });
      const chatId = trimString(targetInfo.normalized?.chatId || targetInfo.target?.chatId);
      const folderId = trimString(options.folderId);

      /* MV3 / web — preserve native-context-required pattern. */
      if (!desktop) {
        diag.counts.unsupportedCalls += 1;
        const out = baseResult('setFolder', 'native-context-required', {
          ok: false,
          reason: 'Studio facade does not write folder state on MV3 in R4.4; use Native UI on chatgpt.com.',
          targetSource: targetInfo.source,
          chatId,
          folderId,
          supportedInStudio: false,
        });
        diag.lastSetFolder = out;
        return normalizeResultForDiag('setFolder', out);
      }

      /* Desktop path: route to actions.folders.{bindChat | unbindChat}. */
      const actions = H2O.Studio?.actions?.folders;
      if (!actions || (typeof actions.bindChat !== 'function' || typeof actions.unbindChat !== 'function')) {
        const out = baseResult('setFolder', 'actions-unavailable', {
          ok: false,
          reason: 'H2O.Studio.actions.folders not loaded — verify S0F3b is in the bundle',
          chatId,
          folderId,
        });
        diag.lastSetFolder = out;
        return normalizeResultForDiag('setFolder', out);
      }
      if (!chatId) {
        const out = baseResult('setFolder', 'chat-id-required', { ok: false, chatId, folderId });
        diag.lastSetFolder = out;
        return normalizeResultForDiag('setFolder', out);
      }

      const actionResult = folderId
        ? await actions.bindChat(chatId, folderId)
        : await actions.unbindChat(chatId);
      const status = actionResult && actionResult.status ? actionResult.status : (actionResult && actionResult.ok ? 'ok' : 'error');
      const out = baseResult('setFolder', status, {
        ok: !!(actionResult && actionResult.ok),
        chatId,
        folderId,
        targetSource: targetInfo.source,
        actionResult,
        source,
        supportedInStudio: true,
      });
      diag.lastSetFolder = out;
      return normalizeResultForDiag('setFolder', out);
    } catch (e) {
      pushError('setFolder', e);
      const out = baseResult('setFolder', 'library-actions-error', {
        ok: false,
        reason: String(e?.message || e || 'unknown'),
      });
      diag.lastSetFolder = out;
      return normalizeResultForDiag('setFolder', out);
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
        /* R4.2 — labels facade methods; same platform-conditional
         * pattern (Desktop + actions.labels loaded ⇒ true). */
        setLabels:   LA_isTauri() && !!H2O.Studio?.actions?.labels,
        addLabel:    LA_isTauri() && !!H2O.Studio?.actions?.labels,
        removeLabel: LA_isTauri() && !!H2O.Studio?.actions?.labels,
        /* R4.3 — tags facade methods; same platform-conditional
         * pattern. Note this is CATALOG/BINDING management only;
         * turn-level extraction still lives in Native 0F5a. */
        setTags:     LA_isTauri() && !!H2O.Studio?.actions?.tags,
        addTag:      LA_isTauri() && !!H2O.Studio?.actions?.tags,
        removeTag:   LA_isTauri() && !!H2O.Studio?.actions?.tags,
        /* R4.4 — folders facade method (single setter; folderId: ''
         * means clear). S0F1b.desktopSetFolderBinding remains the
         * primary path used by the Studio UI; setFolder is the new
         * symmetric entry point for callers that prefer the actions
         * facade. */
        setFolder:   LA_isTauri() && !!H2O.Studio?.actions?.folders,
      },
      unsupportedActions: {
        addToLibrary: 'native-context-required',
        saveToFolder: 'native-context-required',
        ...(LA_isTauri() && H2O.Studio?.actions?.categories
          ? {}
          : { setCategory: LA_isTauri() ? 'actions-unavailable' : 'native-context-required' }),
        ...(LA_isTauri() && H2O.Studio?.actions?.labels
          ? {}
          : {
              setLabels:   LA_isTauri() ? 'actions-unavailable' : 'native-context-required',
              addLabel:    LA_isTauri() ? 'actions-unavailable' : 'native-context-required',
              removeLabel: LA_isTauri() ? 'actions-unavailable' : 'native-context-required',
            }),
        ...(LA_isTauri() && H2O.Studio?.actions?.tags
          ? {}
          : {
              setTags:   LA_isTauri() ? 'actions-unavailable' : 'native-context-required',
              addTag:    LA_isTauri() ? 'actions-unavailable' : 'native-context-required',
              removeTag: LA_isTauri() ? 'actions-unavailable' : 'native-context-required',
            }),
        ...(LA_isTauri() && H2O.Studio?.actions?.folders
          ? {}
          : { setFolder: LA_isTauri() ? 'actions-unavailable' : 'native-context-required' }),
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
    setLabels,
    addLabel,
    removeLabel,
    setTags,
    addTag,
    removeTag,
    setFolder,
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
