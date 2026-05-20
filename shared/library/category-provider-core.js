// shared/library/category-provider-core.js
//
// Phase 4B — canonical pure module for category catalog, category assignment,
// override, candidate, and count normalization helpers. Used by both native and
// Studio through a self-publishing IIFE on `window.H2O.Library.CategoryProviderCore`.
//
// IMPORTANT — runtime distribution:
//   This file is the canonical source; two runtime mirror files exist:
//
//     src-runtime-base/0F0f.⬛️🗂️ Category Provider Core 🗂️.js
//     surfaces/studio/S0F0f. 🎬 Category Provider Core - Studio.js
//
//   The IIFE bodies must remain byte-identical across all three files.
//   Headers may differ so the existing native and Studio loaders discover
//   the mirrors.
//
// What this module provides (all pure functions — no DOM, no localStorage,
// no chrome.storage, no IndexedDB, no archive calls, no events, no UI):
//
//   normalizeCategory, normalizeCategoryCatalog, normalizeCategoryOverride,
//   normalizeCategoryCandidate, normalizeSnapshotCategory, validateCategoryId,
//   resolveCategoryId, mergeCategoryCatalog, applyCategoryOverride,
//   removeCategoryOverride, rankCategoryCandidates, computeCategoryCounts,
//   deriveCategoryForRecord, classifyRecordCategory,
//   findOrphanCategoryAssignments, repairCategoryState

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.Library.CategoryProviderCore && H2O.Library.CategoryProviderCore.__phase === '4B') return;

  const PHASE = '4B';

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

  function normalizeConfidence(value) {
    if (value == null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(1, n));
  }

  function normalizeTimestamp(value, opts = {}) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = trimString(value);
    if (raw) return raw;
    if (Object.prototype.hasOwnProperty.call(opts, 'nowIso')) return opts.nowIso;
    if (Object.prototype.hasOwnProperty.call(opts, 'now')) return opts.now;
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

  function validateCategoryId(id, opts = {}) {
    const categoryId = trimString(id);
    if (!categoryId) return { ok: false, categoryId: '', reason: 'empty-category-id' };
    const maxLength = Number.isFinite(Number(opts.maxLength)) ? Number(opts.maxLength) : 256;
    if (categoryId.length > maxLength) return { ok: false, categoryId, reason: 'category-id-too-long' };
    if (/[\u0000-\u001f\u007f<>]/.test(categoryId)) return { ok: false, categoryId, reason: 'unsafe-category-id' };
    if (/[\\/]/.test(categoryId)) return { ok: false, categoryId, reason: 'unsafe-category-id' };
    return { ok: true, categoryId, reason: '' };
  }

  function normalizeStatus(value) {
    const raw = trimString(value || 'active').toLowerCase();
    if (raw === 'deprecated' || raw === 'replaced' || raw === 'retired' || raw === 'archived') return raw;
    return 'active';
  }

  function normalizeCategory(raw, opts = {}) {
    const src = isPlainObject(raw) ? raw : {};
    const id = trimString(src.id || src.categoryId || '');
    const valid = validateCategoryId(id, opts);
    if (!valid.ok) {
      pushDiagnostic(opts, 'invalid-category', { categoryId: id, reason: valid.reason });
      return null;
    }

    const replacementRaw = trimString(src.replacementCategoryId || src.replacementId || '');
    const replacementValid = replacementRaw ? validateCategoryId(replacementRaw, opts) : { ok: false };
    if (replacementRaw && !replacementValid.ok) {
      pushDiagnostic(opts, 'invalid-category-replacement', {
        categoryId: id,
        replacementCategoryId: replacementRaw,
        reason: replacementValid.reason,
      });
    }

    const out = {
      id,
      name: normalizeSafeString(src.name || src.title || src.categoryName || id, 256) || id,
      description: normalizeSafeString(src.description || src.summary || '', 2000),
      color: normalizeColor(src.color || src.iconColor || src.accentColor || ''),
      sortOrder: Number.isFinite(Number(src.sortOrder)) ? Number(src.sortOrder) : 0,
      createdAt: normalizeTimestamp(src.createdAt, opts),
      updatedAt: normalizeTimestamp(src.updatedAt ?? src.createdAt, opts),
      status: normalizeStatus(src.status),
      replacementCategoryId: replacementValid.ok ? replacementValid.categoryId : '',
      aliases: uniqueStrings(src.aliases || src.alias || []),
      custom: src.custom === true || src.isCustom === true,
    };

    if (src.source) out.source = normalizeSafeString(src.source, 120);
    if (src.icon) out.icon = normalizeSafeString(src.icon, 120);
    if (src.metadata && isPlainObject(src.metadata)) out.metadata = { ...src.metadata };
    return out;
  }

  function normalizeCategoryCatalog(input, opts = {}) {
    const diagnostics = [];
    const localOpts = { ...opts, diagnostics };
    const src = Array.isArray(input)
      ? { categories: input }
      : (isPlainObject(input) ? input : {});
    if (!Array.isArray(src.categories) && !Array.isArray(input)) {
      if (input == null) diagnostics.push({ code: 'empty-category-catalog' });
      else diagnostics.push({ code: 'malformed-category-catalog' });
    }

    const out = [];
    const seen = new Set();
    const rawCategories = Array.isArray(src.categories)
      ? src.categories
      : (Array.isArray(src.items) ? src.items : []);
    for (const raw of rawCategories) {
      const category = normalizeCategory(raw, localOpts);
      if (!category) continue;
      if (seen.has(category.id)) {
        diagnostics.push({ code: 'duplicate-category-id', categoryId: category.id });
        continue;
      }
      seen.add(category.id);
      out.push(category);
    }

    diagnostics.forEach((diag) => pushDiagnostic(opts, diag.code, diag));
    return {
      categories: out,
      updatedAt: normalizeTimestamp(src.updatedAt || src.catalogUpdatedAt || '', opts),
      diagnostics,
    };
  }

  function catalogMap(catalog, opts = {}) {
    const normalized = normalizeCategoryCatalog(catalog, opts);
    const byId = new Map();
    for (const category of normalized.categories) byId.set(category.id, category);
    return { normalized, byId };
  }

  function hasCatalogEntries(catalog) {
    if (Array.isArray(catalog)) return catalog.length > 0;
    if (!isPlainObject(catalog)) return false;
    if (Array.isArray(catalog.categories)) return catalog.categories.length > 0;
    if (Array.isArray(catalog.items)) return catalog.items.length > 0;
    return false;
  }

  function resolveCategoryId(id, catalog, opts = {}) {
    const raw = trimString(id);
    const valid = validateCategoryId(raw, opts);
    const diagnostics = [];
    if (!valid.ok) {
      diagnostics.push({ code: 'invalid-category-id', categoryId: raw, reason: valid.reason });
      return {
        ok: false,
        inputCategoryId: raw,
        categoryId: '',
        category: null,
        replaced: false,
        chain: [],
        status: 'invalid',
        reason: valid.reason,
        diagnostics,
      };
    }

    const { byId } = catalogMap(catalog, opts);
    let currentId = valid.categoryId;
    const chain = [currentId];
    const visited = new Set();
    let replaced = false;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const category = byId.get(currentId) || null;
      if (!category) {
        diagnostics.push({ code: 'category-not-found', categoryId: currentId });
        return {
          ok: false,
          inputCategoryId: raw,
          categoryId: currentId,
          category: null,
          replaced,
          chain,
          status: 'missing',
          reason: 'category-not-found',
          diagnostics,
        };
      }
      if ((category.status === 'deprecated' || category.status === 'replaced') && category.replacementCategoryId) {
        const nextId = category.replacementCategoryId;
        if (visited.has(nextId)) break;
        replaced = true;
        currentId = nextId;
        chain.push(currentId);
        continue;
      }
      return {
        ok: true,
        inputCategoryId: raw,
        categoryId: category.id,
        category,
        replaced,
        chain,
        status: category.status,
        reason: '',
        diagnostics,
      };
    }

    diagnostics.push({ code: 'category-replacement-cycle', categoryId: currentId });
    return {
      ok: false,
      inputCategoryId: raw,
      categoryId: currentId,
      category: byId.get(currentId) || null,
      replaced,
      chain,
      status: 'cycle',
      reason: 'category-replacement-cycle',
      diagnostics,
    };
  }

  function mergeCategoryCatalog(existing, incoming, opts = {}) {
    const left = normalizeCategoryCatalog(existing, opts);
    const right = normalizeCategoryCatalog(incoming, opts);
    const preferIncoming = opts.preferIncoming !== false;
    const byId = new Map();
    const order = [];
    for (const category of left.categories) {
      byId.set(category.id, category);
      order.push(category.id);
    }
    for (const category of right.categories) {
      if (!byId.has(category.id)) order.push(category.id);
      byId.set(category.id, preferIncoming ? category : byId.get(category.id));
    }
    return {
      categories: order.map((id) => byId.get(id)).filter(Boolean),
      updatedAt: normalizeTimestamp(right.updatedAt || left.updatedAt || '', opts),
      diagnostics: [...left.diagnostics, ...right.diagnostics],
    };
  }

  function normalizeSnapshotCategory(input, opts = {}) {
    const src = isPlainObject(input) ? input : {};
    const diagnostics = [];
    const primaryRaw = trimString(src.primaryCategoryId || src.categoryId || src.primary || src.id || '');
    const secondaryRaw = trimString(src.secondaryCategoryId || src.secondary || '');
    const resolve = (categoryId, field) => {
      if (!categoryId) return '';
      const catalog = opts.catalog || opts.categories || [];
      if (!hasCatalogEntries(catalog)) {
        const valid = validateCategoryId(categoryId, opts);
        if (valid.ok) return valid.categoryId;
        diagnostics.push({ code: 'invalid-snapshot-category', field, categoryId, reason: valid.reason });
        return '';
      }
      const resolved = resolveCategoryId(categoryId, catalog, opts);
      diagnostics.push(...resolved.diagnostics);
      if (!resolved.ok) {
        diagnostics.push({ code: 'invalid-snapshot-category', field, categoryId, reason: resolved.reason });
        return '';
      }
      return resolved.categoryId;
    };

    const source = normalizeSafeString(src.source || src.categorySource || (src.overriddenAt ? 'user' : ''), 120);
    return {
      primaryCategoryId: resolve(primaryRaw, 'primaryCategoryId'),
      secondaryCategoryId: resolve(secondaryRaw, 'secondaryCategoryId'),
      source,
      algorithmVersion: normalizeSafeString(src.algorithmVersion || src.modelVersion || '', 120),
      classifiedAt: normalizeTimestamp(src.classifiedAt || '', opts),
      overriddenAt: normalizeTimestamp(src.overriddenAt || '', opts),
      confidence: normalizeConfidence(src.confidence),
      diagnostics,
    };
  }

  function chatKeyFromRecord(record) {
    const src = isPlainObject(record) ? record : {};
    const direct = trimString(src.chatId || src.conversationId || src.id || '');
    if (direct) return direct;
    const href = trimString(src.href || src.url || '');
    const match = href.match(/(?:^|\/)c\/([^/?#]+)/);
    if (!match) return href;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }

  function normalizeCategoryOverride(input, opts = {}) {
    const src = isPlainObject(input) ? input : {};
    const chatId = trimString(src.chatId || src.conversationId || src.id || '');
    const href = trimString(src.href || src.url || '');
    const categoryRaw = trimString(src.categoryId || src.primaryCategoryId || src.category || '');
    const diagnostics = [];
    let categoryId = '';
    if (categoryRaw) {
      const catalog = opts.catalog || opts.categories || [];
      if (hasCatalogEntries(catalog)) {
        const resolved = resolveCategoryId(categoryRaw, catalog, opts);
        diagnostics.push(...resolved.diagnostics);
        if (resolved.ok) categoryId = resolved.categoryId;
        else diagnostics.push({ code: 'invalid-category-override', categoryId: categoryRaw, reason: resolved.reason });
      } else {
        const valid = validateCategoryId(categoryRaw, opts);
        if (valid.ok) categoryId = valid.categoryId;
        else diagnostics.push({ code: 'invalid-category-override', categoryId: categoryRaw, reason: valid.reason });
      }
    }
    if (!chatId && !href) diagnostics.push({ code: 'missing-override-chat-id' });

    return {
      chatId,
      href,
      categoryId,
      source: normalizeSafeString(src.source || 'user', 120) || 'user',
      confidence: normalizeConfidence(src.confidence),
      overriddenAt: normalizeTimestamp(src.overriddenAt || src.updatedAt || '', opts),
      diagnostics,
    };
  }

  function normalizeOverrideMap(overrides, opts = {}) {
    const out = {};
    if (Array.isArray(overrides)) {
      for (const raw of overrides) {
        const override = normalizeCategoryOverride(raw, opts);
        const key = override.chatId || override.href;
        if (key) out[key] = override;
      }
      return out;
    }
    const src = isPlainObject(overrides) ? overrides : {};
    for (const key of Object.keys(src)) {
      const value = isPlainObject(src[key]) ? src[key] : { categoryId: src[key] };
      const override = normalizeCategoryOverride({ chatId: key, ...value }, opts);
      const normalizedKey = override.chatId || override.href || key;
      if (normalizedKey) out[normalizedKey] = override;
    }
    return out;
  }

  function normalizeCategoryCandidate(input, opts = {}) {
    const src = isPlainObject(input) ? input : {};
    const name = normalizeSafeString(src.name || src.title || src.label || '', 256);
    const id = trimString(src.id || src.candidateId || src.categoryId || (name ? name.toLowerCase().replace(/[^a-z0-9_-]+/gi, '-') : ''));
    const valid = id ? validateCategoryId(id, opts) : { ok: false, categoryId: '', reason: 'empty-category-id' };
    if (!valid.ok) {
      pushDiagnostic(opts, 'invalid-category-candidate', { candidateId: id, reason: valid.reason });
      return null;
    }
    const out = {
      id: valid.categoryId,
      name: name || valid.categoryId,
      score: finiteNumber(src.score, 0),
      confidence: normalizeConfidence(src.confidence) ?? 0,
      status: normalizeSafeString(src.status || 'candidate', 80) || 'candidate',
      source: normalizeSafeString(src.source || '', 120),
      createdAt: normalizeTimestamp(src.createdAt || '', opts),
      updatedAt: normalizeTimestamp(src.updatedAt || src.decidedAt || '', opts),
    };
    if (src.createdCategoryId) out.createdCategoryId = trimString(src.createdCategoryId);
    if (src.mergedIntoCategoryId) out.mergedIntoCategoryId = trimString(src.mergedIntoCategoryId);
    if (src.sourceSignals && isPlainObject(src.sourceSignals)) out.sourceSignals = { ...src.sourceSignals };
    if (Array.isArray(src.sampleChatIds)) out.sampleChatIds = uniqueStrings(src.sampleChatIds);
    if (Array.isArray(src.sampleTitles)) out.sampleTitles = uniqueStrings(src.sampleTitles);
    return out;
  }

  function rankCategoryCandidates(candidates, opts = {}) {
    const normalized = [];
    const localOpts = { ...opts, diagnostics: [] };
    for (const raw of Array.isArray(candidates) ? candidates : []) {
      const candidate = normalizeCategoryCandidate(raw, localOpts);
      if (candidate) normalized.push(candidate);
    }
    return normalized.sort((a, b) => (
      (b.score - a.score)
      || (b.confidence - a.confidence)
      || a.name.localeCompare(b.name)
      || a.id.localeCompare(b.id)
    ));
  }

  function findOverrideForRecord(record, opts = {}) {
    const src = isPlainObject(record) ? record : {};
    const direct = src.categoryOverride || src.overrideCategory || src.categoryOverrideMeta;
    if (direct) {
      const override = normalizeCategoryOverride({ chatId: chatKeyFromRecord(src), ...direct }, opts);
      if (override.categoryId) return override;
    }
    const key = chatKeyFromRecord(src);
    const overrides = normalizeOverrideMap(opts.overrides || opts.categoryOverrides || {}, opts);
    return overrides[key] || null;
  }

  function snapshotCategorySource(record) {
    const src = isPlainObject(record) ? record : {};
    if (isPlainObject(src.category)) return src.category;
    if (isPlainObject(src.snapshotCategory)) return src.snapshotCategory;
    if (isPlainObject(src.snapshotMeta?.category)) return src.snapshotMeta.category;
    if (isPlainObject(src.meta?.category)) return src.meta.category;
    if (isPlainObject(src.snapshot?.meta?.category)) return src.snapshot.meta.category;
    if (isPlainObject(src.archive?.snapshot?.meta?.category)) return src.archive.snapshot.meta.category;
    if (src.primaryCategoryId || src.categoryId) {
      return {
        primaryCategoryId: src.primaryCategoryId || src.categoryId,
        secondaryCategoryId: src.secondaryCategoryId || '',
        source: src.categorySource || src.source || '',
        confidence: src.categoryConfidence ?? src.confidence,
        classifiedAt: src.classifiedAt || '',
        overriddenAt: src.overriddenAt || '',
      };
    }
    return null;
  }

  function categoryResult(categoryId, source, opts = {}, extra = {}) {
    const catalog = opts.catalog || opts.categories || [];
    const resolved = categoryId && hasCatalogEntries(catalog) ? resolveCategoryId(categoryId, catalog, opts) : null;
    const finalId = resolved && resolved.ok ? resolved.categoryId : trimString(categoryId);
    return {
      categoryId: finalId,
      primaryCategoryId: finalId,
      secondaryCategoryId: trimString(extra.secondaryCategoryId || ''),
      source: normalizeSafeString(source || extra.source || '', 120),
      confidence: normalizeConfidence(extra.confidence),
      algorithmVersion: normalizeSafeString(extra.algorithmVersion || '', 120),
      classifiedAt: normalizeTimestamp(extra.classifiedAt || '', opts),
      overriddenAt: normalizeTimestamp(extra.overriddenAt || '', opts),
      category: resolved && resolved.ok ? resolved.category : null,
      replaced: !!(resolved && resolved.replaced),
      reason: finalId ? '' : 'uncategorized',
      diagnostics: resolved ? resolved.diagnostics.slice() : [],
    };
  }

  function deriveCategoryForRecord(record, opts = {}) {
    const src = isPlainObject(record) ? record : {};
    const override = findOverrideForRecord(src, opts);
    if (override && override.categoryId) {
      return categoryResult(override.categoryId, override.source || 'user', opts, {
        confidence: override.confidence,
        overriddenAt: override.overriddenAt,
      });
    }

    const snapshotRaw = snapshotCategorySource(src);
    if (snapshotRaw) {
      const snapshot = normalizeSnapshotCategory(snapshotRaw, opts);
      if (snapshot.primaryCategoryId) return categoryResult(snapshot.primaryCategoryId, snapshot.source || 'system', opts, snapshot);
    }

    const organizationId = trimString(src.organization?.categoryId || src.organization?.primaryCategoryId || src.registry?.organization?.categoryId || '');
    if (organizationId) return categoryResult(organizationId, 'registry', opts);

    return categoryResult('', '', opts);
  }

  function classifyRecordCategory(record, catalog, opts = {}) {
    const derived = deriveCategoryForRecord(record, { ...opts, catalog });
    if (derived.categoryId) return derived;
    const text = [
      record?.title,
      record?.preview,
      record?.firstQ,
      record?.firstA,
      Array.isArray(record?.tags) ? record.tags.join(' ') : '',
      Array.isArray(record?.labels) ? record.labels.join(' ') : '',
    ].map((value) => trimString(value).toLowerCase()).filter(Boolean).join(' ');
    const normalizedCatalog = normalizeCategoryCatalog(catalog, opts).categories;
    for (const category of normalizedCatalog) {
      const terms = [category.name, ...category.aliases].map((value) => trimString(value).toLowerCase()).filter(Boolean);
      if (terms.some((term) => term && text.includes(term))) {
        return categoryResult(category.id, 'heuristic', { ...opts, catalog }, { confidence: 0.5, algorithmVersion: 'category-provider-core:4B' });
      }
    }
    const ranked = rankCategoryCandidates(opts.candidates || []);
    const first = ranked.find((candidate) => candidate.createdCategoryId || candidate.mergedIntoCategoryId || candidate.categoryId);
    if (first) return categoryResult(first.createdCategoryId || first.mergedIntoCategoryId || first.categoryId, 'candidate', { ...opts, catalog }, { confidence: first.confidence });
    return categoryResult('', '', { ...opts, catalog });
  }

  function applyCategoryOverride(recordOrCategoryState, overrideInput, opts = {}) {
    const state = isPlainObject(recordOrCategoryState) ? { ...recordOrCategoryState } : {};
    const override = normalizeCategoryOverride(overrideInput, opts);
    const key = override.chatId || override.href;
    const previousOverrides = normalizeOverrideMap(state.overrides || state.categoryOverrides || {}, opts);
    if (!key) {
      return { ok: false, status: 'missing-chat-id', state, override, previous: null, changed: false, diagnostics: override.diagnostics };
    }
    if (!override.categoryId) {
      return { ok: false, status: 'missing-category-id', state, override, previous: previousOverrides[key] || null, changed: false, diagnostics: override.diagnostics };
    }
    const nextOverrides = { ...previousOverrides, [key]: override };
    state.overrides = nextOverrides;
    return {
      ok: true,
      status: 'ok',
      state,
      override,
      previous: previousOverrides[key] || null,
      changed: !previousOverrides[key] || previousOverrides[key].categoryId !== override.categoryId,
      diagnostics: override.diagnostics,
    };
  }

  function removeCategoryOverride(recordOrCategoryState, chatId, opts = {}) {
    const state = isPlainObject(recordOrCategoryState) ? { ...recordOrCategoryState } : {};
    const key = trimString(chatId);
    const previousOverrides = normalizeOverrideMap(state.overrides || state.categoryOverrides || {}, opts);
    const previous = previousOverrides[key] || null;
    const nextOverrides = { ...previousOverrides };
    delete nextOverrides[key];
    state.overrides = nextOverrides;
    return { ok: !!key, status: key ? 'ok' : 'missing-chat-id', state, previous, changed: !!previous, diagnostics: [] };
  }

  function computeCategoryCounts(rows, opts = {}) {
    const byCategory = {};
    let total = 0;
    let uncategorized = 0;
    for (const row of Array.isArray(rows) ? rows : []) {
      const derived = deriveCategoryForRecord(row, opts);
      if (!derived.categoryId) {
        uncategorized += 1;
        continue;
      }
      byCategory[derived.categoryId] = (byCategory[derived.categoryId] || 0) + 1;
      total += 1;
    }
    return { byCategory, total, uncategorized };
  }

  function findOrphanCategoryAssignments(rows, catalog, opts = {}) {
    const { byId } = catalogMap(catalog, opts);
    const out = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const derived = deriveCategoryForRecord(row, { ...opts, catalog: [] });
      if (!derived.categoryId) continue;
      if (!byId.has(derived.categoryId)) {
        out.push({
          chatId: chatKeyFromRecord(row),
          categoryId: derived.categoryId,
          source: derived.source,
          reason: 'category-not-found',
        });
      }
    }
    return out;
  }

  function setRowCategory(row, nextCategoryId) {
    const out = isPlainObject(row) ? { ...row } : {};
    if (isPlainObject(out.category)) out.category = { ...out.category, primaryCategoryId: nextCategoryId };
    else if (isPlainObject(out.snapshotMeta?.category)) out.snapshotMeta = { ...out.snapshotMeta, category: { ...out.snapshotMeta.category, primaryCategoryId: nextCategoryId } };
    else if (isPlainObject(out.meta?.category)) out.meta = { ...out.meta, category: { ...out.meta.category, primaryCategoryId: nextCategoryId } };
    else out.categoryId = nextCategoryId;
    return out;
  }

  function repairCategoryState(rows, catalog, opts = {}) {
    const inputRows = Array.isArray(rows) ? rows : [];
    const repairedRows = [];
    const replacements = [];
    const orphans = [];
    for (const row of inputRows) {
      const derived = deriveCategoryForRecord(row, { ...opts, catalog: [] });
      if (!derived.categoryId) {
        repairedRows.push(isPlainObject(row) ? { ...row } : row);
        continue;
      }
      const resolved = resolveCategoryId(derived.categoryId, catalog, opts);
      if (resolved.ok && resolved.categoryId !== derived.categoryId) {
        repairedRows.push(setRowCategory(row, resolved.categoryId));
        replacements.push({ chatId: chatKeyFromRecord(row), fromCategoryId: derived.categoryId, toCategoryId: resolved.categoryId });
        continue;
      }
      if (!resolved.ok) {
        orphans.push({ chatId: chatKeyFromRecord(row), categoryId: derived.categoryId, reason: resolved.reason });
      }
      repairedRows.push(isPlainObject(row) ? { ...row } : row);
    }
    return { rows: repairedRows, replacements, orphans, diagnostics: [] };
  }

  const CategoryProviderCore = Object.freeze({
    __phase: PHASE,
    normalizeCategory,
    normalizeCategoryCatalog,
    normalizeCategoryOverride,
    normalizeCategoryCandidate,
    normalizeSnapshotCategory,
    validateCategoryId,
    resolveCategoryId,
    mergeCategoryCatalog,
    applyCategoryOverride,
    removeCategoryOverride,
    rankCategoryCandidates,
    computeCategoryCounts,
    deriveCategoryForRecord,
    classifyRecordCategory,
    findOrphanCategoryAssignments,
    repairCategoryState,
  });

  H2O.Library.CategoryProviderCore = CategoryProviderCore;
})();
