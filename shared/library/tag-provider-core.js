// shared/library/tag-provider-core.js
//
// Phase 5B — canonical pure module for tag catalog, binding, occurrence,
// auto-pool, tag/category link, count, and repair helpers. Used by both native
// and Studio through a self-publishing IIFE on
// `window.H2O.Library.TagProviderCore`.
//
// IMPORTANT — runtime distribution:
//   This file is the canonical source; two runtime mirror files exist:
//
//     src-runtime-base/0F0g.⬛️🗂️ Tag Provider Core 🗂️.js
//     src-surfaces-base/studio/S0F0g. 🎬 Tag Provider Core - Studio.js
//
//   The IIFE bodies must remain byte-identical across all three files.
//   Headers may differ so the existing native and Studio loaders discover
//   the mirrors.
//
// What this module provides (all pure functions — no DOM, no localStorage,
// no chrome.storage, no IndexedDB, no archive calls, no events, no UI):
//
//   normalizeTag, normalizeTagCatalog, normalizeTagBinding,
//   normalizeTurnTagBinding, normalizeTagOccurrence,
//   normalizeTagOccurrenceIndex, normalizeTagAutoPool,
//   normalizeTagCategoryLink, mergeTagCatalog, mergeTagOccurrenceIndex,
//   applyTagBinding, removeTagBinding, computeTagCounts,
//   deriveTagsForRecord, rankTagSuggestions, validateTagId, resolveTagId,
//   findOrphanTagBindings, repairTagState

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.Library.TagProviderCore && H2O.Library.TagProviderCore.__phase === '5B') return;

  const PHASE = '5B';

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

  function normalizeConfidence(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1, n));
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

  function validateTagId(id, opts = {}) {
    const tagId = trimString(id);
    if (!tagId) return { ok: false, tagId: '', reason: 'empty-tag-id' };
    const maxLength = Number.isFinite(Number(opts.maxLength)) ? Number(opts.maxLength) : 256;
    if (tagId.length > maxLength) return { ok: false, tagId, reason: 'tag-id-too-long' };
    if (/[\u0000-\u001f\u007f<>]/.test(tagId)) return { ok: false, tagId, reason: 'unsafe-tag-id' };
    if (/[\\/]/.test(tagId)) return { ok: false, tagId, reason: 'unsafe-tag-id' };
    return { ok: true, tagId, reason: '' };
  }

  function normalizeStatus(value) {
    const raw = trimString(value || 'active').toLowerCase();
    if (raw === 'deprecated' || raw === 'replaced' || raw === 'retired' || raw === 'archived' || raw === 'blocked') return raw;
    return 'active';
  }

  function rawTagArray(input) {
    if (Array.isArray(input)) return input;
    if (!isPlainObject(input)) return [];
    const tags = input.tags || input.items || input.catalog || input.tagCatalog;
    if (Array.isArray(tags)) return tags;
    if (isPlainObject(tags)) return Object.values(tags);
    return [];
  }

  function normalizeTag(raw, opts = {}) {
    const src = isPlainObject(raw) ? raw : (typeof raw === 'string' ? { id: raw, label: raw } : {});
    const label = normalizeSafeString(src.label || src.name || src.title || src.tag || src.id || src.tagId || '', 256);
    const rawId = trimString(src.id || src.tagId || src.key || src.slug || '') || slugify(label);
    const valid = validateTagId(rawId, opts);
    if (!valid.ok) {
      pushDiagnostic(opts, 'invalid-tag', { tagId: rawId, reason: valid.reason });
      return null;
    }

    const replacementRaw = trimString(src.replacementTagId || src.replacementId || '');
    const replacementValid = replacementRaw ? validateTagId(replacementRaw, opts) : { ok: false };
    if (replacementRaw && !replacementValid.ok) {
      pushDiagnostic(opts, 'invalid-tag-replacement', {
        tagId: valid.tagId,
        replacementTagId: replacementRaw,
        reason: replacementValid.reason,
      });
    }

    const out = {
      id: valid.tagId,
      label: label || valid.tagId,
      name: normalizeSafeString(src.name || src.label || label || valid.tagId, 256) || valid.tagId,
      color: normalizeColor(src.color || src.iconColor || src.accentColor || ''),
      source: normalizeSafeString(src.source || '', 120),
      createdAt: normalizeTimestamp(src.createdAt, opts),
      updatedAt: normalizeTimestamp(src.updatedAt ?? src.createdAt, opts),
      status: normalizeStatus(src.status),
      replacementTagId: replacementValid.ok ? replacementValid.tagId : '',
      aliases: uniqueStrings(src.aliases || src.alias || []),
      categoryIds: uniqueStrings(src.categoryIds || src.categories || []),
      usageCount: Math.max(0, finiteNumber(src.usageCount ?? src.count ?? src.frequency, 0)),
    };

    const score = normalizeConfidence(src.score);
    if (score != null) out.score = score;
    const confidence = normalizeConfidence(src.confidence);
    if (confidence != null) out.confidence = confidence;
    if (src.custom === true || src.isCustom === true) out.custom = true;
    if (isPlainObject(src.metadata)) out.metadata = { ...src.metadata };
    return out;
  }

  function normalizeTagCatalog(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = isPlainObject(input) ? input : {};
    const out = [];
    const seen = new Set();
    for (const raw of rawTagArray(input)) {
      const tag = normalizeTag(raw, localOpts);
      if (!tag) continue;
      if (seen.has(tag.id)) {
        diagnostics.push({ code: 'duplicate-tag-id', tagId: tag.id });
        continue;
      }
      seen.add(tag.id);
      out.push(tag);
    }
    if (!Array.isArray(input) && !rawTagArray(input).length) {
      diagnostics.push({ code: input == null ? 'empty-tag-catalog' : 'malformed-tag-catalog' });
    }
    diagnostics.forEach((diag) => pushDiagnostic(opts, diag.code, diag));
    return {
      tags: out,
      updatedAt: normalizeTimestamp(src.updatedAt || src.catalogUpdatedAt || '', opts),
      diagnostics,
    };
  }

  function catalogMap(catalog, opts = {}) {
    const normalized = normalizeTagCatalog(catalog, opts);
    const byId = new Map();
    for (const tag of normalized.tags) byId.set(tag.id, tag);
    return { normalized, byId };
  }

  function resolveTagId(id, catalog, opts = {}) {
    const raw = trimString(id);
    const valid = validateTagId(raw, opts);
    const diagnostics = [];
    if (!valid.ok) {
      diagnostics.push({ code: 'invalid-tag-id', tagId: raw, reason: valid.reason });
      return { ok: false, inputTagId: raw, tagId: '', tag: null, replaced: false, chain: [], status: 'invalid', reason: valid.reason, diagnostics };
    }

    const { byId } = catalogMap(catalog, opts);
    let currentId = valid.tagId;
    const chain = [currentId];
    const visited = new Set();
    let replaced = false;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const tag = byId.get(currentId) || null;
      if (!tag) {
        diagnostics.push({ code: 'tag-not-found', tagId: currentId });
        return { ok: false, inputTagId: raw, tagId: currentId, tag: null, replaced, chain, status: 'missing', reason: 'tag-not-found', diagnostics };
      }
      if ((tag.status === 'deprecated' || tag.status === 'replaced' || tag.status === 'retired') && tag.replacementTagId) {
        currentId = tag.replacementTagId;
        chain.push(currentId);
        replaced = true;
        continue;
      }
      return { ok: true, inputTagId: raw, tagId: tag.id, tag, replaced, chain, status: tag.status || 'active', reason: '', diagnostics };
    }
    diagnostics.push({ code: 'tag-replacement-cycle', tagId: currentId });
    return { ok: false, inputTagId: raw, tagId: currentId, tag: null, replaced, chain, status: 'cycle', reason: 'tag-replacement-cycle', diagnostics };
  }

  function normalizeTagIds(values, opts = {}) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
      const id = isPlainObject(value)
        ? trimString(value.id || value.tagId || value.key || value.label || value.name || '')
        : trimString(value);
      const tagId = id || (isPlainObject(value) ? slugify(value.label || value.name || '') : '');
      const valid = validateTagId(tagId, opts);
      if (!valid.ok) {
        if (tagId) pushDiagnostic(opts, 'invalid-tag-id', { tagId, reason: valid.reason });
        continue;
      }
      if (seen.has(valid.tagId)) continue;
      seen.add(valid.tagId);
      out.push(valid.tagId);
    }
    return out;
  }

  function normalizeTagBinding(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = isPlainObject(input) ? input : {};
    const chatId = normalizeSafeString(src.chatId || src.id || src.href || '', 512);
    const tagIds = normalizeTagIds(src.tagIds || src.tags || src.items || [], localOpts);
    if (!chatId) diagnostics.push({ code: 'missing-chat-id' });
    return {
      chatId,
      tagIds,
      scope: 'chat',
      source: normalizeSafeString(src.source || '', 120),
      updatedAt: normalizeTimestamp(src.updatedAt || '', opts),
      diagnostics,
    };
  }

  function normalizeTurnTagBinding(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = isPlainObject(input) ? input : {};
    const chatId = normalizeSafeString(src.chatId || '', 512);
    const turnId = normalizeSafeString(src.turnId || src.answerId || src.turnKey || '', 512);
    const tagIds = normalizeTagIds(src.tagIds || src.tags || src.added || [], localOpts);
    if (!chatId) diagnostics.push({ code: 'missing-chat-id' });
    if (!turnId) diagnostics.push({ code: 'missing-turn-id' });
    return {
      chatId,
      turnId,
      answerId: normalizeSafeString(src.answerId || '', 512),
      tagIds,
      scope: 'turn',
      source: normalizeSafeString(src.source || '', 120),
      updatedAt: normalizeTimestamp(src.updatedAt || '', opts),
      diagnostics,
    };
  }

  function normalizeTagOccurrence(input, opts = {}) {
    const diagnostics = [];
    const src = isPlainObject(input) ? input : {};
    const tagIdRaw = trimString(src.tagId || src.id || src.phraseKey || src.phrase || src.term || '');
    const valid = validateTagId(tagIdRaw || slugify(src.phrase || src.term || ''), opts);
    if (!valid.ok) diagnostics.push({ code: 'invalid-tag-id', tagId: tagIdRaw, reason: valid.reason });
    const chatId = normalizeSafeString(src.chatId || '', 512);
    const turnId = normalizeSafeString(src.turnId || src.answerId || src.turnKey || '', 512);
    if (!chatId) diagnostics.push({ code: 'missing-chat-id' });
    if (!turnId) diagnostics.push({ code: 'missing-turn-id' });
    return {
      tagId: valid.ok ? valid.tagId : '',
      chatId,
      turnId,
      answerId: normalizeSafeString(src.answerId || '', 512),
      phrase: normalizeSafeString(src.phrase || src.term || src.label || tagIdRaw, 256),
      count: Math.max(0, finiteNumber(src.count, 1)),
      score: Math.max(0, finiteNumber(src.score ?? src.weight, 0)),
      firstSeen: normalizeTimestamp(src.firstSeen || '', opts),
      lastSeen: normalizeTimestamp(src.lastSeen || src.updatedAt || '', opts),
      diagnostics,
    };
  }

  function normalizePhraseOccurrenceMap(input, opts = {}) {
    const out = [];
    const phrases = isPlainObject(input?.phrases) ? input.phrases : {};
    const chatId = normalizeSafeString(input?.chatId || '', 512);
    for (const [key, raw] of Object.entries(phrases)) {
      const row = isPlainObject(raw) ? raw : {};
      const turnIds = uniqueStrings(row.turnIds || row.turns || []);
      if (!turnIds.length) {
        out.push(normalizeTagOccurrence({ ...row, chatId, turnId: key, tagId: key, phrase: row.phrase || key }, opts));
        continue;
      }
      for (const turnId of turnIds) {
        out.push(normalizeTagOccurrence({ ...row, chatId, turnId, tagId: key, phrase: row.phrase || key }, opts));
      }
    }
    return out;
  }

  function normalizeTagOccurrenceIndex(input, opts = {}) {
    const diagnostics = [];
    const src = isPlainObject(input) ? input : {};
    let occurrences = [];
    if (Array.isArray(src.occurrences)) occurrences = src.occurrences.map((item) => normalizeTagOccurrence(item, opts));
    else if (Array.isArray(input)) occurrences = input.map((item) => normalizeTagOccurrence(item, opts));
    else occurrences = normalizePhraseOccurrenceMap(src, opts);

    const byTag = {};
    const phrases = {};
    for (const occ of occurrences) {
      if (occ.diagnostics?.length) diagnostics.push(...occ.diagnostics);
      if (!occ.tagId) continue;
      byTag[occ.tagId] = byTag[occ.tagId] || [];
      byTag[occ.tagId].push(occ);
      phrases[occ.tagId] = phrases[occ.tagId] || { phrase: occ.phrase || occ.tagId, turnIds: [], count: 0 };
      if (occ.turnId && !phrases[occ.tagId].turnIds.includes(occ.turnId)) phrases[occ.tagId].turnIds.push(occ.turnId);
      phrases[occ.tagId].count += occ.count || 0;
    }

    return {
      version: finiteNumber(src.version, 1),
      chatId: normalizeSafeString(src.chatId || '', 512),
      algoVersion: normalizeSafeString(src.algoVersion || '', 120),
      occurrences,
      byTag,
      phrases,
      updatedAt: normalizeTimestamp(src.updatedAt || src.updatedAtIso || '', opts),
      diagnostics,
    };
  }

  function normalizeTagAutoPool(input, opts = {}) {
    const diagnostics = [];
    const src = isPlainObject(input) ? input : {};
    const suggestions = [];
    const raw = Array.isArray(src.suggestions)
      ? src.suggestions
      : (Array.isArray(src.tags) ? src.tags : []);
    for (const item of raw) {
      const tag = normalizeTag(item, opts);
      if (tag) suggestions.push(tag);
    }
    if (isPlainObject(src.phrases)) {
      for (const [key, value] of Object.entries(src.phrases)) {
        const row = isPlainObject(value) ? value : {};
        const tag = normalizeTag({
          id: key,
          label: row.phrase || row.label || key,
          score: row.score,
          confidence: row.confidence,
          count: row.totalCount || row.count,
          frequency: row.chatCount,
          status: row.status,
        }, opts);
        if (tag) suggestions.push(tag);
      }
    }
    const ranked = rankTagSuggestions(suggestions, opts);
    return {
      version: finiteNumber(src.version, 1),
      algoVersion: normalizeSafeString(src.algoVersion || '', 120),
      suggestions: ranked,
      phrases: Object.fromEntries(ranked.map((tag) => [tag.id, {
        phrase: tag.label,
        totalCount: tag.usageCount || 0,
        score: tag.score || 0,
        status: tag.status || 'active',
      }])),
      updatedAt: normalizeTimestamp(src.updatedAt || src.updatedAtIso || '', opts),
      diagnostics,
    };
  }

  function normalizeTagCategoryLink(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = isPlainObject(input) ? input : {};
    const tag = normalizeTag(src.tag || src, localOpts);
    const categoryIds = uniqueStrings(src.categoryIds || src.categories || []);
    if (!tag) diagnostics.push({ code: 'invalid-tag-category-link' });
    return {
      tagId: tag?.id || '',
      label: tag?.label || normalizeSafeString(src.label || src.name || '', 256),
      color: tag?.color || normalizeColor(src.color || ''),
      categoryIds,
      updatedAt: normalizeTimestamp(src.updatedAt || '', opts),
      diagnostics,
    };
  }

  function mergeTagCatalog(existing, incoming, opts = {}) {
    const left = normalizeTagCatalog(existing, opts).tags;
    const right = normalizeTagCatalog(incoming, opts).tags;
    const byId = new Map();
    for (const tag of left) byId.set(tag.id, tag);
    for (const tag of right) byId.set(tag.id, { ...(byId.get(tag.id) || {}), ...tag });
    return { tags: Array.from(byId.values()), updatedAt: normalizeTimestamp(opts.updatedAt || opts.nowIso || opts.now || '', opts), diagnostics: [] };
  }

  function mergeTagOccurrenceIndex(existing, incoming, opts = {}) {
    const left = normalizeTagOccurrenceIndex(existing, opts);
    const right = normalizeTagOccurrenceIndex(incoming, opts);
    const keyFor = (occ) => [occ.chatId, occ.turnId, occ.tagId, occ.phrase].join('\u001f');
    const byKey = new Map();
    for (const occ of left.occurrences) byKey.set(keyFor(occ), occ);
    for (const occ of right.occurrences) byKey.set(keyFor(occ), { ...(byKey.get(keyFor(occ)) || {}), ...occ });
    return normalizeTagOccurrenceIndex({ occurrences: Array.from(byKey.values()), updatedAt: opts.updatedAt || right.updatedAt || left.updatedAt }, opts);
  }

  function normalizeBindingMap(stateOrBindings, opts = {}) {
    const src = isPlainObject(stateOrBindings) ? stateOrBindings : {};
    const raw = isPlainObject(src.bindings) ? src.bindings : (isPlainObject(src.chatTags) ? src.chatTags : src);
    const out = {};
    for (const [chatIdRaw, value] of Object.entries(isPlainObject(raw) ? raw : {})) {
      const chatId = normalizeSafeString(chatIdRaw, 512);
      if (!chatId) continue;
      const tagIds = normalizeTagIds(Array.isArray(value) ? value : (value?.tagIds || value?.tags || []), opts);
      out[chatId] = tagIds;
    }
    return out;
  }

  function applyTagBinding(recordOrState, bindingInput, opts = {}) {
    const state = isPlainObject(recordOrState) ? { ...recordOrState } : {};
    const binding = normalizeTagBinding(bindingInput, opts);
    if (!binding.chatId) return { ok: false, status: 'missing-chat-id', state, binding, previous: [], changed: false, diagnostics: binding.diagnostics };
    const current = normalizeBindingMap(state, opts);
    const previous = current[binding.chatId] || [];
    const mode = trimString(opts.mode || opts.strategy || 'replace');
    const nextIds = mode === 'append'
      ? uniqueStrings([...previous, ...binding.tagIds])
      : binding.tagIds.slice();
    current[binding.chatId] = nextIds;
    state.bindings = current;
    return {
      ok: true,
      status: 'ok',
      state,
      binding: { ...binding, tagIds: nextIds },
      previous,
      changed: previous.join('\u001f') !== nextIds.join('\u001f'),
      diagnostics: binding.diagnostics,
    };
  }

  function removeTagBinding(recordOrState, chatId, tagIds = null, opts = {}) {
    const state = isPlainObject(recordOrState) ? { ...recordOrState } : {};
    const key = normalizeSafeString(chatId, 512);
    const current = normalizeBindingMap(state, opts);
    const previous = current[key] || [];
    if (!key) return { ok: false, status: 'missing-chat-id', state, previous: [], changed: false, diagnostics: [] };
    if (tagIds == null) delete current[key];
    else {
      const remove = new Set(normalizeTagIds(Array.isArray(tagIds) ? tagIds : [tagIds], opts));
      current[key] = previous.filter((tagId) => !remove.has(tagId));
      if (!current[key].length) delete current[key];
    }
    state.bindings = current;
    return { ok: true, status: 'ok', state, previous, changed: previous.join('\u001f') !== (current[key] || []).join('\u001f'), diagnostics: [] };
  }

  function deriveTagsForRecord(record, opts = {}) {
    const src = isPlainObject(record) ? record : {};
    const values = [];
    values.push(...(Array.isArray(src.tagIds) ? src.tagIds : []));
    values.push(...(Array.isArray(src.tags) ? src.tags : []));
    values.push(...(Array.isArray(src.tagNames) ? src.tagNames : []));
    values.push(...(Array.isArray(src.organization?.tagIds) ? src.organization.tagIds : []));
    values.push(...(Array.isArray(src.snapshotMeta?.tags) ? src.snapshotMeta.tags : []));
    values.push(...(Array.isArray(src.meta?.tags) ? src.meta.tags : []));
    const tagIds = normalizeTagIds(values, opts);
    return { tagIds, tags: tagIds.slice(), source: tagIds.length ? 'record' : '' };
  }

  function computeTagCounts(rows, opts = {}) {
    const byTag = {};
    let total = 0;
    let untagged = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      const tagIds = deriveTagsForRecord(row, opts).tagIds;
      if (!tagIds.length) {
        untagged += 1;
        continue;
      }
      for (const tagId of tagIds) byTag[tagId] = (byTag[tagId] || 0) + 1;
      total += 1;
    }
    return { byTag, total, untagged };
  }

  function rankTagSuggestions(candidates, opts = {}) {
    const byId = new Map();
    for (const raw of Array.isArray(candidates) ? candidates : []) {
      const tag = normalizeTag(raw, opts);
      if (!tag) continue;
      const existing = byId.get(tag.id);
      if (!existing) {
        byId.set(tag.id, tag);
        continue;
      }
      byId.set(tag.id, {
        ...existing,
        ...tag,
        usageCount: Math.max(existing.usageCount || 0, tag.usageCount || 0),
        score: Math.max(existing.score || 0, tag.score || 0),
        confidence: Math.max(existing.confidence || 0, tag.confidence || 0),
      });
    }
    return Array.from(byId.values()).sort((a, b) => {
      const scoreA = finiteNumber(a.score, 0);
      const scoreB = finiteNumber(b.score, 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      const confA = finiteNumber(a.confidence, 0);
      const confB = finiteNumber(b.confidence, 0);
      if (confB !== confA) return confB - confA;
      const freqA = finiteNumber(a.usageCount, 0);
      const freqB = finiteNumber(b.usageCount, 0);
      if (freqB !== freqA) return freqB - freqA;
      return String(a.label || a.id).localeCompare(String(b.label || b.id));
    });
  }

  function findOrphanTagBindings(rowsOrState, catalog, opts = {}) {
    const { byId } = catalogMap(catalog, opts);
    const out = [];
    const inspect = (chatId, tagIds) => {
      for (const tagId of tagIds) {
        if (!byId.has(tagId)) out.push({ chatId, tagId, reason: 'tag-not-found' });
      }
    };
    if (Array.isArray(rowsOrState)) {
      for (const row of rowsOrState) inspect(normalizeSafeString(row?.chatId || row?.id || '', 512), deriveTagsForRecord(row, opts).tagIds);
      return out;
    }
    const bindings = normalizeBindingMap(rowsOrState, opts);
    for (const [chatId, tagIds] of Object.entries(bindings)) inspect(chatId, tagIds);
    return out;
  }

  function repairTagState(rowsOrState, catalog, opts = {}) {
    const repairIds = (ids) => {
      const next = [];
      const removed = [];
      const replacements = [];
      for (const tagId of normalizeTagIds(ids, opts)) {
        const resolved = resolveTagId(tagId, catalog, opts);
        if (resolved.ok) {
          if (resolved.tagId !== tagId) replacements.push({ fromTagId: tagId, toTagId: resolved.tagId });
          if (!next.includes(resolved.tagId)) next.push(resolved.tagId);
        } else {
          removed.push(tagId);
        }
      }
      return { next, removed, replacements };
    };

    if (Array.isArray(rowsOrState)) {
      const rows = rowsOrState.map((row) => {
        const derived = deriveTagsForRecord(row, opts);
        const repaired = repairIds(derived.tagIds);
        return { ...(isPlainObject(row) ? row : {}), tagIds: repaired.next, tags: repaired.next.slice() };
      });
      return { rows, diagnostics: [], orphans: findOrphanTagBindings(rowsOrState, catalog, opts) };
    }

    const state = isPlainObject(rowsOrState) ? { ...rowsOrState } : {};
    const bindings = normalizeBindingMap(state, opts);
    const nextBindings = {};
    const removed = [];
    const replacements = [];
    for (const [chatId, tagIds] of Object.entries(bindings)) {
      const repaired = repairIds(tagIds);
      if (repaired.next.length) nextBindings[chatId] = repaired.next;
      removed.push(...repaired.removed.map((tagId) => ({ chatId, tagId })));
      replacements.push(...repaired.replacements.map((item) => ({ chatId, ...item })));
    }
    state.bindings = nextBindings;
    return { state, removed, replacements, orphans: removed.slice(), diagnostics: [] };
  }

  const TagProviderCore = Object.freeze({
    __phase: PHASE,
    normalizeTag,
    normalizeTagCatalog,
    normalizeTagBinding,
    normalizeTurnTagBinding,
    normalizeTagOccurrence,
    normalizeTagOccurrenceIndex,
    normalizeTagAutoPool,
    normalizeTagCategoryLink,
    mergeTagCatalog,
    mergeTagOccurrenceIndex,
    applyTagBinding,
    removeTagBinding,
    computeTagCounts,
    deriveTagsForRecord,
    rankTagSuggestions,
    validateTagId,
    resolveTagId,
    findOrphanTagBindings,
    repairTagState,
  });

  H2O.Library.TagProviderCore = TagProviderCore;
})();
