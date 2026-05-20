// shared/library/label-provider-core.js
//
// Phase 5C — canonical pure module for label catalog, binding, summary, count,
// and repair helpers. Used by both native and Studio through a self-publishing
// IIFE on `window.H2O.Library.LabelProviderCore`.
//
// IMPORTANT — runtime distribution:
//   This file is the canonical source; two runtime mirror files exist:
//
//     src-runtime-base/0F0h.⬛️🏷️ Label Provider Core 🏷️.js
//     surfaces/studio/S0F0h. 🎬 Label Provider Core - Studio.js
//
//   The IIFE bodies must remain byte-identical across all three files.
//   Headers may differ so the existing native and Studio loaders discover
//   the mirrors.
//
// What this module provides (all pure functions — no DOM, no localStorage,
// no chrome.storage, no IndexedDB, no archive calls, no events, no UI):
//
//   normalizeLabel, normalizeLabelCatalog, normalizeLabelBinding,
//   normalizeLabelType, normalizeLabelSummary, mergeLabelCatalog,
//   applyLabelBinding, removeLabelBinding, computeLabelCounts,
//   deriveLabelsForRecord, validateLabelId, resolveLabelId,
//   findOrphanLabelBindings, repairLabelState

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.Library.LabelProviderCore && H2O.Library.LabelProviderCore.__phase === '5C') return;

  const PHASE = '5C';
  const TYPE_ALIASES = Object.freeze({
    workflow: 'workflowStatus',
    workflowStatus: 'workflowStatus',
    status: 'workflowStatus',
    priority: 'priority',
    followUp: 'followUp',
    followup: 'followUp',
    action: 'action',
    actions: 'action',
    actionLabel: 'action',
    content: 'contentType',
    contentType: 'contentType',
    context: 'context',
    custom: 'custom',
  });
  const MULTI_TYPES = new Set(['followUp', 'action', 'contentType', 'context', 'custom']);

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

  function normalizeColor(value) {
    const raw = normalizeSafeString(value, 120);
    if (!raw) return '';
    if (/^#[0-9a-f]{3}$/i.test(raw) || /^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
    if (/^[a-z][a-z0-9_-]{0,40}$/i.test(raw)) return raw;
    if (/^var\(--[a-z0-9_-]{1,80}\)$/i.test(raw)) return raw;
    return '';
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

  function slugify(value) {
    const raw = trimString(value).toLowerCase();
    if (!raw) return '';
    return raw
      .normalize ? raw.normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128) : raw.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128);
  }

  function normalizeLabelType(type, opts = {}) {
    const raw = trimString(type || 'custom');
    const mapped = TYPE_ALIASES[raw] || TYPE_ALIASES[raw.replace(/[-_\s]+/g, '')] || raw;
    if (!mapped) return 'custom';
    if (/[\u0000-\u001f\u007f<>/\\]/.test(mapped)) {
      pushDiagnostic(opts, 'unsafe-label-type', { type: raw });
      return 'custom';
    }
    return mapped;
  }

  function validateLabelId(id, opts = {}) {
    const labelId = trimString(id);
    if (!labelId) return { ok: false, labelId: '', reason: 'empty-label-id' };
    const maxLength = Number.isFinite(Number(opts.maxLength)) ? Number(opts.maxLength) : 256;
    if (labelId.length > maxLength) return { ok: false, labelId, reason: 'label-id-too-long' };
    if (/[\u0000-\u001f\u007f<>]/.test(labelId)) return { ok: false, labelId, reason: 'unsafe-label-id' };
    if (/[\\/]/.test(labelId)) return { ok: false, labelId, reason: 'unsafe-label-id' };
    return { ok: true, labelId, reason: '' };
  }

  function normalizeStatus(value) {
    const raw = trimString(value || 'active').toLowerCase();
    if (raw === 'deprecated' || raw === 'replaced' || raw === 'retired' || raw === 'archived') return raw;
    return 'active';
  }

  function normalizeLabel(raw, opts = {}) {
    const src = isPlainObject(raw) ? raw : (typeof raw === 'string' ? { id: raw, label: raw } : {});
    const label = normalizeSafeString(src.label || src.name || src.title || src.id || src.labelId || '', 256);
    const idRaw = trimString(src.id || src.labelId || src.key || '') || slugify(label);
    const valid = validateLabelId(idRaw, opts);
    if (!valid.ok) {
      pushDiagnostic(opts, 'invalid-label', { labelId: idRaw, reason: valid.reason });
      return null;
    }
    const replacementRaw = trimString(src.replacementLabelId || src.replacementId || '');
    const replacementValid = replacementRaw ? validateLabelId(replacementRaw, opts) : { ok: false };
    if (replacementRaw && !replacementValid.ok) {
      pushDiagnostic(opts, 'invalid-label-replacement', {
        labelId: valid.labelId,
        replacementLabelId: replacementRaw,
        reason: replacementValid.reason,
      });
    }
    const type = normalizeLabelType(src.type || src.labelType || 'custom', opts);
    return {
      id: valid.labelId,
      label: label || valid.labelId,
      name: normalizeSafeString(src.name || src.label || label || valid.labelId, 256) || valid.labelId,
      type,
      color: normalizeColor(src.color || src.iconColor || src.accentColor || ''),
      icon: normalizeSafeString(src.icon || '', 120),
      sortOrder: Number.isFinite(Number(src.sortOrder)) ? Number(src.sortOrder) : 0,
      builtIn: src.builtIn === true || src.isBuiltIn === true,
      createdAt: normalizeTimestamp(src.createdAt, opts),
      updatedAt: normalizeTimestamp(src.updatedAt ?? src.createdAt, opts),
      status: normalizeStatus(src.status),
      replacementLabelId: replacementValid.ok ? replacementValid.labelId : '',
      aliases: uniqueStrings(src.aliases || src.alias || []),
    };
  }

  function rawLabelArray(input) {
    if (Array.isArray(input)) return input;
    if (!isPlainObject(input)) return [];
    if (Array.isArray(input.labels)) return input.labels;
    if (Array.isArray(input.items)) return input.items;
    if (isPlainObject(input.labels)) return Object.values(input.labels);
    const out = [];
    for (const [type, rows] of Object.entries(input)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) out.push({ ...(isPlainObject(row) ? row : {}), type: row?.type || type });
    }
    return out;
  }

  function normalizeLabelCatalog(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = isPlainObject(input) ? input : {};
    const labels = [];
    const byType = {};
    const seen = new Set();
    const raw = rawLabelArray(input);
    for (const item of raw) {
      const label = normalizeLabel(item, localOpts);
      if (!label) continue;
      if (seen.has(label.id)) {
        diagnostics.push({ code: 'duplicate-label-id', labelId: label.id });
        continue;
      }
      seen.add(label.id);
      labels.push(label);
      byType[label.type] = byType[label.type] || [];
      byType[label.type].push(label);
    }
    if (!Array.isArray(input) && !raw.length) {
      diagnostics.push({ code: input == null ? 'empty-label-catalog' : 'malformed-label-catalog' });
    }
    diagnostics.forEach((diag) => pushDiagnostic(opts, diag.code, diag));
    return {
      labels,
      byType,
      updatedAt: normalizeTimestamp(src.updatedAt || src.catalogUpdatedAt || '', opts),
      diagnostics,
    };
  }

  function catalogMap(catalog, opts = {}) {
    const normalized = normalizeLabelCatalog(catalog, opts);
    const byId = new Map();
    for (const label of normalized.labels) byId.set(label.id, label);
    return { normalized, byId };
  }

  function resolveLabelId(id, catalog, opts = {}) {
    const raw = trimString(id);
    const valid = validateLabelId(raw, opts);
    const diagnostics = [];
    if (!valid.ok) {
      diagnostics.push({ code: 'invalid-label-id', labelId: raw, reason: valid.reason });
      return { ok: false, inputLabelId: raw, labelId: '', label: null, replaced: false, chain: [], status: 'invalid', reason: valid.reason, diagnostics };
    }
    const { byId } = catalogMap(catalog, opts);
    let currentId = valid.labelId;
    const chain = [currentId];
    const visited = new Set();
    let replaced = false;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const label = byId.get(currentId) || null;
      if (!label) {
        diagnostics.push({ code: 'label-not-found', labelId: currentId });
        return { ok: false, inputLabelId: raw, labelId: currentId, label: null, replaced, chain, status: 'missing', reason: 'label-not-found', diagnostics };
      }
      if ((label.status === 'deprecated' || label.status === 'replaced' || label.status === 'retired') && label.replacementLabelId) {
        currentId = label.replacementLabelId;
        chain.push(currentId);
        replaced = true;
        continue;
      }
      return { ok: true, inputLabelId: raw, labelId: label.id, label, replaced, chain, status: label.status || 'active', reason: '', diagnostics };
    }
    diagnostics.push({ code: 'label-replacement-cycle', labelId: currentId });
    return { ok: false, inputLabelId: raw, labelId: currentId, label: null, replaced, chain, status: 'cycle', reason: 'label-replacement-cycle', diagnostics };
  }

  function normalizeLabelIds(values, opts = {}) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const id = isPlainObject(value)
        ? trimString(value.id || value.labelId || value.key || value.label || value.name || '')
        : trimString(value);
      const labelId = id || (isPlainObject(value) ? slugify(value.label || value.name || '') : '');
      const valid = validateLabelId(labelId, opts);
      if (!valid.ok) {
        if (labelId) pushDiagnostic(opts, 'invalid-label-id', { labelId, reason: valid.reason });
        continue;
      }
      if (seen.has(valid.labelId)) continue;
      seen.add(valid.labelId);
      out.push(valid.labelId);
    }
    return out;
  }

  function normalizeLabelSummary(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = isPlainObject(input) ? input : {};
    const workflowStatus = trimString(src.workflowStatus || src.workflowStatusLabelId || src.workflow || '');
    const priority = trimString(src.priority || src.priorityLabelId || '');
    const summary = {
      workflowStatus: validateLabelId(workflowStatus).ok ? workflowStatus : '',
      priority: validateLabelId(priority).ok ? priority : '',
      followUp: normalizeLabelIds(src.followUp || src.followUpLabelIds || [], localOpts),
      action: normalizeLabelIds(src.action || src.actionLabelIds || [], localOpts),
      contentType: normalizeLabelIds(src.contentType || src.contentTypeLabelIds || [], localOpts),
      context: normalizeLabelIds(src.context || src.contextLabelIds || [], localOpts),
      custom: normalizeLabelIds(src.custom || src.customLabelIds || [], localOpts),
      diagnostics,
    };
    summary.labelIds = uniqueStrings([
      summary.workflowStatus,
      summary.priority,
      ...summary.followUp,
      ...summary.action,
      ...summary.contentType,
      ...summary.context,
      ...summary.custom,
    ]);
    return summary;
  }

  function normalizeLabelBinding(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = isPlainObject(input) ? input : {};
    const chatId = normalizeSafeString(src.chatId || src.id || src.href || '', 512);
    const summary = normalizeLabelSummary(src.labels || src.summary || src, localOpts);
    const directIds = normalizeLabelIds(src.labelIds || src.labels || [], localOpts);
    const labelIds = uniqueStrings([...directIds, ...(summary.labelIds || [])]);
    if (!chatId) diagnostics.push({ code: 'missing-chat-id' });
    return {
      chatId,
      labelIds,
      labels: labelIds.slice(),
      summary,
      source: normalizeSafeString(src.source || '', 120),
      updatedAt: normalizeTimestamp(src.updatedAt || '', opts),
      diagnostics,
    };
  }

  function mergeLabelCatalog(existing, incoming, opts = {}) {
    const left = normalizeLabelCatalog(existing, opts).labels;
    const right = normalizeLabelCatalog(incoming, opts).labels;
    const byId = new Map();
    for (const label of left) byId.set(label.id, label);
    for (const label of right) byId.set(label.id, { ...(byId.get(label.id) || {}), ...label });
    return { labels: Array.from(byId.values()), byType: normalizeLabelCatalog(Array.from(byId.values()), opts).byType, updatedAt: normalizeTimestamp(opts.updatedAt || opts.nowIso || opts.now || '', opts), diagnostics: [] };
  }

  function normalizeBindingMap(stateOrBindings, opts = {}) {
    const src = isPlainObject(stateOrBindings) ? stateOrBindings : {};
    const raw = isPlainObject(src.bindings) ? src.bindings : (isPlainObject(src.chatLabels) ? src.chatLabels : src);
    const out = {};
    for (const [chatIdRaw, value] of Object.entries(isPlainObject(raw) ? raw : {})) {
      const chatId = normalizeSafeString(chatIdRaw, 512);
      if (!chatId) continue;
      const binding = normalizeLabelBinding({ chatId, ...(isPlainObject(value) ? value : { labelIds: value }) }, opts);
      out[chatId] = binding.labelIds;
    }
    return out;
  }

  function applyLabelBinding(recordOrState, bindingInput, opts = {}) {
    const state = isPlainObject(recordOrState) ? { ...recordOrState } : {};
    const binding = normalizeLabelBinding(bindingInput, opts);
    if (!binding.chatId) return { ok: false, status: 'missing-chat-id', state, binding, previous: [], changed: false, diagnostics: binding.diagnostics };
    const current = normalizeBindingMap(state, opts);
    const previous = current[binding.chatId] || [];
    const mode = trimString(opts.mode || opts.strategy || 'replace');
    const nextIds = mode === 'append'
      ? uniqueStrings([...previous, ...binding.labelIds])
      : binding.labelIds.slice();
    current[binding.chatId] = nextIds;
    state.bindings = current;
    return {
      ok: true,
      status: 'ok',
      state,
      binding: { ...binding, labelIds: nextIds, labels: nextIds.slice() },
      previous,
      changed: previous.join('\u001f') !== nextIds.join('\u001f'),
      diagnostics: binding.diagnostics,
    };
  }

  function removeLabelBinding(recordOrState, chatId, labelIds = null, opts = {}) {
    const state = isPlainObject(recordOrState) ? { ...recordOrState } : {};
    const key = normalizeSafeString(chatId, 512);
    const current = normalizeBindingMap(state, opts);
    const previous = current[key] || [];
    if (!key) return { ok: false, status: 'missing-chat-id', state, previous: [], changed: false, diagnostics: [] };
    if (labelIds == null) delete current[key];
    else {
      const remove = new Set(normalizeLabelIds(Array.isArray(labelIds) ? labelIds : [labelIds], opts));
      current[key] = previous.filter((labelId) => !remove.has(labelId));
      if (!current[key].length) delete current[key];
    }
    state.bindings = current;
    return { ok: true, status: 'ok', state, previous, changed: previous.join('\u001f') !== (current[key] || []).join('\u001f'), diagnostics: [] };
  }

  function deriveLabelsForRecord(record, opts = {}) {
    const src = isPlainObject(record) ? record : {};
    const values = [];
    values.push(...(Array.isArray(src.labelIds) ? src.labelIds : []));
    values.push(...(Array.isArray(src.labels) ? src.labels : []));
    values.push(...(Array.isArray(src.labelNames) ? src.labelNames : []));
    values.push(...(Array.isArray(src.organization?.labelIds) ? src.organization.labelIds : []));
    values.push(...(Array.isArray(src.snapshotMeta?.labelIds) ? src.snapshotMeta.labelIds : []));
    values.push(...(Array.isArray(src.meta?.labelIds) ? src.meta.labelIds : []));
    const summary = normalizeLabelSummary(src.labelSummary || src.snapshotMeta?.labels || src.meta?.labels || {}, opts);
    const labelIds = uniqueStrings([...normalizeLabelIds(values, opts), ...(summary.labelIds || [])]);
    return { labelIds, labels: labelIds.slice(), summary, source: labelIds.length ? 'record' : '' };
  }

  function computeLabelCounts(rows, opts = {}) {
    const byLabel = {};
    const byType = {};
    let total = 0;
    let unlabeled = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      const derived = deriveLabelsForRecord(row, opts);
      if (!derived.labelIds.length) {
        unlabeled += 1;
        continue;
      }
      for (const labelId of derived.labelIds) byLabel[labelId] = (byLabel[labelId] || 0) + 1;
      for (const type of ['workflowStatus', 'priority', 'followUp', 'action', 'contentType', 'context', 'custom']) {
        const values = type === 'workflowStatus' || type === 'priority'
          ? (derived.summary[type] ? [derived.summary[type]] : [])
          : (derived.summary[type] || []);
        for (const labelId of values) {
          byType[type] = byType[type] || {};
          byType[type][labelId] = (byType[type][labelId] || 0) + 1;
        }
      }
      total += 1;
    }
    return { byLabel, byType, total, unlabeled };
  }

  function findOrphanLabelBindings(rowsOrState, catalog, opts = {}) {
    const { byId } = catalogMap(catalog, opts);
    const out = [];
    const inspect = (chatId, labelIds) => {
      for (const labelId of labelIds) {
        if (!byId.has(labelId)) out.push({ chatId, labelId, reason: 'label-not-found' });
      }
    };
    if (Array.isArray(rowsOrState)) {
      for (const row of rowsOrState) inspect(normalizeSafeString(row?.chatId || row?.id || '', 512), deriveLabelsForRecord(row, opts).labelIds);
      return out;
    }
    const bindings = normalizeBindingMap(rowsOrState, opts);
    for (const [chatId, labelIds] of Object.entries(bindings)) inspect(chatId, labelIds);
    return out;
  }

  function repairLabelState(rowsOrState, catalog, opts = {}) {
    const repairIds = (ids) => {
      const next = [];
      const removed = [];
      const replacements = [];
      for (const labelId of normalizeLabelIds(ids, opts)) {
        const resolved = resolveLabelId(labelId, catalog, opts);
        if (resolved.ok) {
          if (resolved.labelId !== labelId) replacements.push({ fromLabelId: labelId, toLabelId: resolved.labelId });
          if (!next.includes(resolved.labelId)) next.push(resolved.labelId);
        } else {
          removed.push(labelId);
        }
      }
      return { next, removed, replacements };
    };

    if (Array.isArray(rowsOrState)) {
      const rows = rowsOrState.map((row) => {
        const derived = deriveLabelsForRecord(row, opts);
        const repaired = repairIds(derived.labelIds);
        return { ...(isPlainObject(row) ? row : {}), labelIds: repaired.next, labels: repaired.next.slice() };
      });
      return { rows, diagnostics: [], orphans: findOrphanLabelBindings(rowsOrState, catalog, opts) };
    }

    const state = isPlainObject(rowsOrState) ? { ...rowsOrState } : {};
    const bindings = normalizeBindingMap(state, opts);
    const nextBindings = {};
    const removed = [];
    const replacements = [];
    for (const [chatId, labelIds] of Object.entries(bindings)) {
      const repaired = repairIds(labelIds);
      if (repaired.next.length) nextBindings[chatId] = repaired.next;
      removed.push(...repaired.removed.map((labelId) => ({ chatId, labelId })));
      replacements.push(...repaired.replacements.map((item) => ({ chatId, ...item })));
    }
    state.bindings = nextBindings;
    return { state, removed, replacements, orphans: removed.slice(), diagnostics: [] };
  }

  const LabelProviderCore = Object.freeze({
    __phase: PHASE,
    normalizeLabel,
    normalizeLabelCatalog,
    normalizeLabelBinding,
    normalizeLabelType,
    normalizeLabelSummary,
    mergeLabelCatalog,
    applyLabelBinding,
    removeLabelBinding,
    computeLabelCounts,
    deriveLabelsForRecord,
    validateLabelId,
    resolveLabelId,
    findOrphanLabelBindings,
    repairLabelState,
  });

  H2O.Library.LabelProviderCore = LabelProviderCore;
})();
