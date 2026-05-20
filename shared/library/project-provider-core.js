// shared/library/project-provider-core.js
//
// Phase 6B — canonical pure module for project catalog, cache, binding, count,
// and repair helpers. Used by both native and Studio through a self-publishing
// IIFE on `window.H2O.Library.ProjectProviderCore`.
//
// IMPORTANT — runtime distribution:
//   This file is the canonical source; two runtime mirror files exist:
//
//     src-runtime-base/0F0i.⬛️🗂️ Project Provider Core 🗂️.js
//     src-surfaces-base/studio/S0F0i. 🎬 Project Provider Core - Studio.js
//
//   The IIFE bodies must remain byte-identical across all three files.
//   Headers may differ so the existing native and Studio loaders discover
//   the mirrors.
//
// What this module provides (all pure functions — no DOM, no localStorage,
// no chrome.storage, no IndexedDB, no archive calls, no network/fetch,
// no events, no UI):
//
//   normalizeProject, normalizeProjectCatalog, normalizeProjectCache,
//   normalizeProjectRef, normalizeProjectBinding, mergeProjectCatalog,
//   mergeProjectCache, applyProjectBinding, removeProjectBinding,
//   computeProjectCounts, deriveProjectForRecord, validateProjectId,
//   resolveProjectId, findOrphanProjectBindings, repairProjectState

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.Library.ProjectProviderCore && H2O.Library.ProjectProviderCore.__phase === '6B') return;

  const PHASE = '6B';
  const CACHE_VERSION = 2;

  function ensureString(value) {
    return (typeof value === 'string') ? value : (value == null ? '' : String(value));
  }

  function trimString(value) {
    return ensureString(value).trim();
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function finiteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizeTimestamp(value, opts = {}) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = trimString(value);
    if (raw) return raw;
    if (Object.prototype.hasOwnProperty.call(opts, 'nowIso')) return opts.nowIso;
    if (Object.prototype.hasOwnProperty.call(opts, 'now')) return opts.now;
    return '';
  }

  function normalizeSafeString(value, maxLength = 512) {
    const raw = trimString(value);
    if (!raw) return '';
    if (/[\u0000-\u001f\u007f]/.test(raw)) return '';
    return raw.length > maxLength ? raw.slice(0, maxLength) : raw;
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

  function normalizeProjectHref(value) {
    const raw = normalizeSafeString(value, 2048);
    if (!raw) return '';
    try {
      const url = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(raw, 'https://chatgpt.com');
      const path = trimString(url.pathname);
      if (/\/g\/[^/]+\/project(?:$|[?#])?/i.test(path)) return path;
    } catch {}
    return raw;
  }

  function projectIdFromHref(value) {
    const href = normalizeProjectHref(value);
    if (!href) return '';
    const m = href.match(/\/g\/([^/?#]+)\/project(?:$|[?#])?/i);
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }

  function validateProjectId(id, opts = {}) {
    const projectId = trimString(id);
    if (!projectId) return { ok: false, projectId: '', reason: 'empty-project-id' };
    const maxLength = Number.isFinite(Number(opts.maxLength)) ? Number(opts.maxLength) : 256;
    if (projectId.length > maxLength) return { ok: false, projectId, reason: 'project-id-too-long' };
    if (/[\u0000-\u001f\u007f<>]/.test(projectId)) return { ok: false, projectId, reason: 'unsafe-project-id' };
    if (/[\\/]/.test(projectId)) return { ok: false, projectId, reason: 'unsafe-project-id' };
    return { ok: true, projectId, reason: '' };
  }

  function normalizeStatus(value) {
    const raw = trimString(value || 'active').toLowerCase();
    if (raw === 'deprecated' || raw === 'replaced' || raw === 'retired' || raw === 'archived' || raw === 'deleted') return raw;
    return 'active';
  }

  function normalizeProjectRef(raw, opts = {}) {
    const src = isPlainObject(raw) ? raw : {};
    const nested = isPlainObject(src.originProjectRef) ? src.originProjectRef : null;
    const from = nested || src;
    const href = normalizeProjectHref(from.nativeProjectHref || from.href || from.url || from.projectHref || '');
    const idRaw = trimString(from.projectId || from.id || from.gizmoId || from.gizmo_id || projectIdFromHref(href));
    const valid = validateProjectId(idRaw, opts);
    if (!valid.ok) {
      if (idRaw) pushDiagnostic(opts, 'invalid-project-ref', { projectId: idRaw, reason: valid.reason });
      return null;
    }
    const name = normalizeSafeString(from.projectName || from.name || from.title || valid.projectId, 256) || valid.projectId;
    return {
      projectId: valid.projectId,
      projectName: name,
      id: valid.projectId,
      name,
      nativeProjectHref: href || (valid.projectId ? `/g/${encodeURIComponent(valid.projectId)}/project` : ''),
    };
  }

  function normalizeProject(raw, opts = {}) {
    const src = isPlainObject(raw) ? raw : (typeof raw === 'string' ? { id: raw, name: raw } : {});
    const ref = normalizeProjectRef(src, opts);
    if (!ref) {
      const rawId = trimString(src.id || src.projectId || src.gizmoId || src.gizmo_id || '');
      if (rawId) pushDiagnostic(opts, 'invalid-project', { projectId: rawId });
      return null;
    }
    const replacementRaw = trimString(src.replacementProjectId || src.replacementId || '');
    const replacementValid = replacementRaw ? validateProjectId(replacementRaw, opts) : { ok: false };
    if (replacementRaw && !replacementValid.ok) {
      pushDiagnostic(opts, 'invalid-project-replacement', {
        projectId: ref.projectId,
        replacementProjectId: replacementRaw,
        reason: replacementValid.reason,
      });
    }
    const chatIds = uniqueStrings(src.chatIds || src.chats || []);
    const count = Number.isFinite(Number(src.count)) ? Math.max(0, Number(src.count)) : chatIds.length;
    return {
      id: ref.projectId,
      projectId: ref.projectId,
      name: ref.projectName,
      title: normalizeSafeString(src.title || src.name || src.projectName || ref.projectName, 256) || ref.projectName,
      projectName: ref.projectName,
      href: normalizeProjectHref(src.href || src.url || ref.nativeProjectHref),
      nativeProjectHref: normalizeProjectHref(src.nativeProjectHref || src.href || ref.nativeProjectHref),
      iconHtml: ensureString(src.iconHtml || ''),
      index: Number.isFinite(Number(src.index)) ? Number(src.index) : 0,
      source: normalizeSafeString(src.source || '', 120),
      count,
      chatIds,
      protected: src.protected === true || src.isProtected === true,
      cachedAt: normalizeTimestamp(src.cachedAt || src.updatedAt || src.lastSeenAt || '', opts),
      status: normalizeStatus(src.status),
      replacementProjectId: replacementValid.ok ? replacementValid.projectId : '',
      schemaVersion: Number.isFinite(Number(src.schemaVersion)) ? Number(src.schemaVersion) : 1,
    };
  }

  function rawProjectArray(input) {
    if (Array.isArray(input)) return input;
    if (!isPlainObject(input)) return [];
    if (Array.isArray(input.projects)) return input.projects;
    if (Array.isArray(input.rows)) return input.rows;
    if (Array.isArray(input.bestRows)) return input.bestRows;
    if (Array.isArray(input.items)) return input.items;
    if (isPlainObject(input.byProject)) {
      return Object.entries(input.byProject).map(([id, chatIds]) => ({
        id,
        projectId: id,
        name: id,
        chatIds: Array.isArray(chatIds) ? chatIds : [],
        count: Array.isArray(chatIds) ? chatIds.length : finiteNumber(chatIds, 0),
        source: 'studio-facet',
      }));
    }
    return [];
  }

  function normalizeProjectCatalog(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = isPlainObject(input) ? input : {};
    const projects = [];
    const seen = new Set();
    const raw = rawProjectArray(input);
    for (const item of raw) {
      const project = normalizeProject(item, localOpts);
      if (!project) continue;
      if (seen.has(project.projectId)) {
        diagnostics.push({ code: 'duplicate-project-id', projectId: project.projectId });
        continue;
      }
      seen.add(project.projectId);
      projects.push(project);
    }
    if (!Array.isArray(input) && !raw.length) {
      diagnostics.push({ code: input == null ? 'empty-project-catalog' : 'malformed-project-catalog' });
    }
    diagnostics.forEach((diag) => pushDiagnostic(opts, diag.code, diag));
    return {
      projects,
      updatedAt: normalizeTimestamp(src.updatedAt || src.catalogUpdatedAt || src.cachedAt || '', opts),
      diagnostics,
    };
  }

  function catalogMap(catalog, opts = {}) {
    const normalized = normalizeProjectCatalog(catalog, opts);
    const byId = new Map();
    for (const project of normalized.projects) byId.set(project.projectId, project);
    return { normalized, byId };
  }

  function resolveProjectId(id, catalog, opts = {}) {
    const raw = trimString(id);
    const valid = validateProjectId(raw, opts);
    const diagnostics = [];
    if (!valid.ok) {
      diagnostics.push({ code: 'invalid-project-id', projectId: raw, reason: valid.reason });
      return { ok: false, inputProjectId: raw, projectId: '', project: null, replaced: false, chain: [], status: 'invalid', reason: valid.reason, diagnostics };
    }
    const { byId } = catalogMap(catalog, opts);
    let currentId = valid.projectId;
    const chain = [currentId];
    const visited = new Set();
    let replaced = false;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const project = byId.get(currentId) || null;
      if (!project) {
        diagnostics.push({ code: 'project-not-found', projectId: currentId });
        return { ok: false, inputProjectId: raw, projectId: currentId, project: null, replaced, chain, status: 'missing', reason: 'project-not-found', diagnostics };
      }
      if ((project.status === 'deprecated' || project.status === 'replaced' || project.status === 'retired' || project.status === 'deleted') && project.replacementProjectId) {
        currentId = project.replacementProjectId;
        chain.push(currentId);
        replaced = true;
        continue;
      }
      return { ok: true, inputProjectId: raw, projectId: currentId, project, replaced, chain, status: project.status, reason: '', diagnostics };
    }
    diagnostics.push({ code: 'project-replacement-cycle', projectId: currentId || raw });
    return { ok: false, inputProjectId: raw, projectId: currentId || raw, project: null, replaced, chain, status: 'cycle', reason: 'project-replacement-cycle', diagnostics };
  }

  function mergeProjectCatalog(existing, incoming, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const result = [];
    const byId = new Map();
    for (const project of normalizeProjectCatalog(existing, localOpts).projects) {
      byId.set(project.projectId, project);
      result.push(project);
    }
    for (const project of normalizeProjectCatalog(incoming, localOpts).projects) {
      const index = result.findIndex((item) => item.projectId === project.projectId);
      if (index >= 0) {
        result[index] = { ...result[index], ...project, projectId: result[index].projectId, id: result[index].projectId };
      } else {
        result.push(project);
      }
      byId.set(project.projectId, project);
    }
    diagnostics.forEach((diag) => pushDiagnostic(opts, diag.code, diag));
    return { projects: result, updatedAt: normalizeTimestamp((isPlainObject(incoming) && incoming.updatedAt) || (isPlainObject(existing) && existing.updatedAt) || '', opts), diagnostics };
  }

  function rowsSignature(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => `${row.projectId || row.id || ''}\u0001${row.title || row.name || ''}\u0001${row.href || ''}`).join('\u0002');
  }

  function normalizeProjectCache(raw, opts = {}) {
    const src = isPlainObject(raw) ? raw : (Array.isArray(raw) ? { rows: raw, source: 'legacy-row-cache' } : {});
    const rowCatalog = normalizeProjectCatalog(src.rows || [], opts);
    const rows = rowCatalog.projects.map((p, index) => ({ ...p, index: Number.isFinite(Number(p.index)) ? p.index : index }));
    const bestCatalog = normalizeProjectCatalog(src.bestRows || rows, opts);
    const bestRows = bestCatalog.projects.map((p, index) => ({ ...p, index: Number.isFinite(Number(p.index)) ? p.index : index }));
    const knownProjectIds = uniqueStrings([
      ...(Array.isArray(src.knownProjectIds) ? src.knownProjectIds : []),
      ...bestRows.map((row) => row.projectId),
      ...rows.map((row) => row.projectId),
    ]);
    return {
      version: Number.isFinite(Number(src.version)) ? Number(src.version) : CACHE_VERSION,
      source: normalizeSafeString(src.source || 'unknown', 120),
      rows,
      bestRows,
      complete: src.complete === true,
      lastSuccessAt: finiteNumber(src.lastSuccessAt, 0),
      lastAttemptAt: finiteNumber(src.lastAttemptAt, 0),
      pageCount: finiteNumber(src.pageCount, 0),
      itemCount: finiteNumber(src.itemCount, rows.length),
      nextCursor: normalizeSafeString(src.nextCursor || '', 512),
      signature: trimString(src.signature) || rowsSignature(rows),
      error: normalizeSafeString(src.error || '', 1024),
      orderSource: normalizeSafeString(src.orderSource || src.source || '', 120),
      lastReconciledAt: finiteNumber(src.lastReconciledAt, 0),
      bestSignature: trimString(src.bestSignature) || rowsSignature(bestRows),
      bestSource: normalizeSafeString(src.bestSource || src.orderSource || src.source || '', 120),
      bestSourceRank: finiteNumber(src.bestSourceRank, 0),
      bestRowCount: finiteNumber(src.bestRowCount, bestRows.length),
      bestAt: finiteNumber(src.bestAt, 0),
      bestComplete: src.bestComplete === true,
      knownProjectIds,
      lastRicherNativeAt: finiteNumber(src.lastRicherNativeAt, 0),
      sources: isPlainObject(src.sources) ? { ...src.sources } : {},
      diagnostics: [...rowCatalog.diagnostics, ...bestCatalog.diagnostics],
    };
  }

  function mergeProjectCache(existing, incoming, opts = {}) {
    const a = normalizeProjectCache(existing, opts);
    const b = normalizeProjectCache(incoming, opts);
    const mergedRows = mergeProjectCatalog(a.rows, b.rows, opts).projects;
    const mergedBest = mergeProjectCatalog(a.bestRows, b.bestRows, opts).projects;
    return normalizeProjectCache({
      ...a,
      ...b,
      rows: mergedRows,
      bestRows: mergedBest.length >= mergedRows.length ? mergedBest : mergedRows,
      knownProjectIds: uniqueStrings([...a.knownProjectIds, ...b.knownProjectIds, ...mergedRows.map((row) => row.projectId), ...mergedBest.map((row) => row.projectId)]),
      sources: { ...(a.sources || {}), ...(b.sources || {}) },
    }, opts);
  }

  function normalizeProjectBinding(input, opts = {}) {
    const src = isPlainObject(input) ? input : {};
    const chatId = normalizeSafeString(src.chatId || src.id || src.href || src.normalizedHref || '', 512);
    const ref = normalizeProjectRef(src, opts);
    if (!chatId) pushDiagnostic(opts, 'missing-chat-id');
    if (!ref) pushDiagnostic(opts, 'missing-project-id', { chatId });
    return {
      chatId,
      projectId: ref?.projectId || '',
      projectName: ref?.projectName || '',
      nativeProjectHref: ref?.nativeProjectHref || '',
      source: normalizeSafeString(src.source || '', 120),
    };
  }

  function normalizeBindingMap(state, opts = {}) {
    const src = isPlainObject(state) ? state : {};
    const raw = isPlainObject(src.bindings) ? src.bindings : (isPlainObject(src.items) ? src.items : {});
    const out = {};
    for (const [chatKey, value] of Object.entries(raw)) {
      const chatId = normalizeSafeString(chatKey, 512);
      if (!chatId) continue;
      const binding = isPlainObject(value)
        ? normalizeProjectBinding({ chatId, ...value }, opts)
        : normalizeProjectBinding({ chatId, projectId: value }, opts);
      if (binding.projectId) out[chatId] = binding;
    }
    return out;
  }

  function applyProjectBinding(state, bindingRaw, opts = {}) {
    const binding = normalizeProjectBinding(bindingRaw, opts);
    if (!binding.chatId) return { ok: false, status: 'missing-chat-id', reason: 'missing-chat-id', state: isPlainObject(state) ? { ...state } : {}, binding };
    if (!binding.projectId) return { ok: false, status: 'missing-project-id', reason: 'missing-project-id', state: isPlainObject(state) ? { ...state } : {}, binding };
    const next = isPlainObject(state) ? { ...state } : {};
    const bindings = normalizeBindingMap(next, opts);
    bindings[binding.chatId] = binding;
    next.bindings = bindings;
    return { ok: true, status: 'ok', state: next, binding };
  }

  function removeProjectBinding(state, chatIdRaw, opts = {}) {
    const chatId = normalizeSafeString(chatIdRaw, 512);
    const next = isPlainObject(state) ? { ...state } : {};
    const bindings = normalizeBindingMap(next, opts);
    const previous = chatId ? bindings[chatId] || null : null;
    if (chatId) delete bindings[chatId];
    next.bindings = bindings;
    return { ok: !!chatId, status: chatId ? 'ok' : 'missing-chat-id', state: next, chatId, previous };
  }

  function deriveProjectForRecord(record, opts = {}) {
    const src = isPlainObject(record) ? record : {};
    const candidates = [
      { source: 'top-level', value: { projectId: src.projectId, projectName: src.projectName, nativeProjectHref: src.nativeProjectHref } },
      { source: 'nested-project', value: src.project },
      { source: 'raw-origin-project-ref', value: src.raw?.originProjectRef },
      { source: 'origin-project-ref', value: src.originProjectRef },
      { source: 'snapshot-origin-project-ref', value: src.snapshotMeta?.originProjectRef || src.meta?.originProjectRef },
    ];
    for (const candidate of candidates) {
      const ref = normalizeProjectRef(candidate.value, opts);
      if (ref) return { ...ref, source: candidate.source };
    }
    return { projectId: '', projectName: '', id: '', name: '', nativeProjectHref: '', source: '' };
  }

  function computeProjectCounts(rows, opts = {}) {
    const byProject = {};
    const chatIdsByProject = {};
    let unassigned = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      const project = deriveProjectForRecord(row, opts);
      if (!project.projectId) {
        unassigned += 1;
        continue;
      }
      byProject[project.projectId] = Number(byProject[project.projectId] || 0) + 1;
      const chatId = normalizeSafeString(row?.chatId || row?.id || '', 512);
      if (chatId) {
        chatIdsByProject[project.projectId] = chatIdsByProject[project.projectId] || [];
        if (!chatIdsByProject[project.projectId].includes(chatId)) chatIdsByProject[project.projectId].push(chatId);
      }
    }
    return { byProject, chatIdsByProject, unassigned, total: Array.isArray(rows) ? rows.length : 0 };
  }

  function findOrphanProjectBindings(rowsOrState, catalog, opts = {}) {
    const { byId } = catalogMap(catalog, opts);
    const out = [];
    const inspect = (chatId, projectId) => {
      if (projectId && !byId.has(projectId)) out.push({ chatId, projectId, reason: 'project-not-found' });
    };
    if (Array.isArray(rowsOrState)) {
      for (const row of rowsOrState) {
        const project = deriveProjectForRecord(row, opts);
        inspect(normalizeSafeString(row?.chatId || row?.id || '', 512), project.projectId);
      }
      return out;
    }
    const bindings = normalizeBindingMap(rowsOrState, opts);
    for (const [chatId, binding] of Object.entries(bindings)) inspect(chatId, binding.projectId);
    return out;
  }

  function repairProjectState(rowsOrState, catalog, opts = {}) {
    const repairProject = (projectId) => {
      const resolved = resolveProjectId(projectId, catalog, opts);
      if (resolved.ok) {
        return {
          projectId: resolved.projectId,
          removed: null,
          replacement: resolved.projectId !== projectId ? { fromProjectId: projectId, toProjectId: resolved.projectId } : null,
        };
      }
      return { projectId: '', removed: projectId, replacement: null };
    };

    if (Array.isArray(rowsOrState)) {
      const rows = rowsOrState.map((row) => {
        const src = isPlainObject(row) ? row : {};
        const project = deriveProjectForRecord(src, opts);
        const repaired = repairProject(project.projectId);
        return { ...src, projectId: repaired.projectId, projectName: repaired.projectId ? (resolveProjectId(repaired.projectId, catalog, opts).project?.projectName || src.projectName || '') : '' };
      });
      return { rows, orphans: findOrphanProjectBindings(rowsOrState, catalog, opts), diagnostics: [] };
    }

    const state = isPlainObject(rowsOrState) ? { ...rowsOrState } : {};
    const bindings = normalizeBindingMap(state, opts);
    const nextBindings = {};
    const removed = [];
    const replacements = [];
    for (const [chatId, binding] of Object.entries(bindings)) {
      const repaired = repairProject(binding.projectId);
      if (repaired.projectId) nextBindings[chatId] = { ...binding, projectId: repaired.projectId };
      if (repaired.removed) removed.push({ chatId, projectId: repaired.removed });
      if (repaired.replacement) replacements.push({ chatId, ...repaired.replacement });
    }
    state.bindings = nextBindings;
    return { state, removed, replacements, orphans: removed.slice(), diagnostics: [] };
  }

  const ProjectProviderCore = Object.freeze({
    __phase: PHASE,
    normalizeProject,
    normalizeProjectCatalog,
    normalizeProjectCache,
    normalizeProjectRef,
    normalizeProjectBinding,
    mergeProjectCatalog,
    mergeProjectCache,
    applyProjectBinding,
    removeProjectBinding,
    computeProjectCounts,
    deriveProjectForRecord,
    validateProjectId,
    resolveProjectId,
    findOrphanProjectBindings,
    repairProjectState,
  });

  H2O.Library.ProjectProviderCore = ProjectProviderCore;
})();
