// shared/library/library-index-core.js
//
// Phase 2B — canonical pure module for Library Index row normalization,
// merge, dedupe, view derivation, facet computation, count computation,
// filter, sort, and date bucketing. Used by both:
//
//   native: src-runtime-base/0F1c.⬛️🗂️ Library Index 🧮🗂️.js
//   Studio: src-surfaces-base/studio/S0F1c. 🎬 Library Index - Studio.js
//
// through a self-publishing IIFE on `window.H2O.Library.LibraryIndexCore`.
//
// IMPORTANT — runtime distribution:
//   Same triplicate pattern as Phase 2A's chat-registry-core. This file is
//   the canonical source; two byte-identical mirror files exist:
//
//     src-runtime-base/0F0d.⬛️🧬 Library Index Core 🧬.js                   (native bundle)
//     src-surfaces-base/studio/S0F0d. 🎬 Library Index Core - Studio.js     (Studio HTML)
//
//   If you edit this file, copy the new body into both mirrors. Phase 3 will
//   introduce a shared/ loader pipeline that removes this triplicate.
//
// What this module provides (all pure functions — no DOM, no localStorage,
// no chrome.storage, no IndexedDB, no events, no side effects):
//
//   Identity / href (delegates to RegistryCore where available):
//     parseChatIdFromHref, normalizeChatId, normalizeHref, isImportedId, hrefForChatId
//
//   String / date helpers:
//     normText, slug, trimString, dateMs, isoOrEmpty, pickNewerDate, pickOlderDate,
//     uniqueStrings, toNonNegativeInt, firstCount
//
//   Source rank / merge (native shape):
//     SOURCE_RANK, sourceRank, normalizeSource, mergeSourceArrays, bestSource,
//     sourceHintsForRow
//
//   Title / confidence / batch:
//     chooseBetterTitle (LibraryIndex variant: longer/more-descriptive),
//     higherConfidence, mergeBatchHistory, REGISTRY_BATCH_HISTORY_LIMIT
//
//   Turn count derivation:
//     deriveTurnCounts
//
//   Row normalization + merge (NATIVE shape):
//     normalizeChatRow(row, source, extra)  → canonical native row
//     mergeChatRecord(prev, next)           → merged native row
//     mergeObjectsById, normalizeCategoryList, collectTagFacets
//
//   Row normalization (STUDIO shape):
//     normalizeRowStudio(raw)                  → canonical Studio row
//     normalizeLinkedOnlyProjection(rec)       → Studio linked-only row
//                                                (input: Phase 1 ChatRegistry record)
//
//   View derivation (alignment):
//     deriveViewFromBooleans({isSaved,isLinked,isImported,isRecent}) → 'saved'|'linked'|'imported'|'recents'
//
//   Dedupe:
//     getRowDedupeKey(row)                  → chatId|normalizedHref|snapshotId
//
//   Facets / counts:
//     bumpFacet, facetRowsFromMap, buildFacets(chats, model?)   → native facet shape
//     buildFacetsStudio(rows)                                   → Studio facet shape
//     countsFromFacetsStudio(facets, total)                     → Studio count shape
//     canonicalHeadlineCounts(rows)                             → active headline count shape
//     canonicalActiveRows(rows)                                 → active non-archived/non-deleted rows
//     canonicalExplorerRows(rows, filters)                      → active/archive filtered + sorted rows
//     canonicalRecentRows(rows, limit)                          → deterministic active recent rows
//     canonicalSavedRecentRows(rows, limit)                     → deterministic active saved transcript rows
//     buildCounts(model)                                        → native count shape
//
//   Filter / sort / bucketing:
//     matchesOne, filterChats, sortChats, compareDateDesc, readDateField,
//     bucketKey, isoWeekKey, bucketLabel
//
// Phase 2B does not change row shapes. Native rows keep their native shape;
// Studio rows keep their Studio shape. Both surfaces preserve their public
// `H2O.LibraryIndex.*` API.

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.Library.LibraryIndexCore && H2O.Library.LibraryIndexCore.__phase === '2B') return;

  const PHASE = '2B';
  const REGISTRY_BATCH_HISTORY_LIMIT = 10;

  // Delegates: when Phase 2A's RegistryCore is present, use it for identity
  // helpers so native + Studio + RegistryCore all agree on canonical forms.
  function rc() { return H2O.Library?.RegistryCore || null; }

  // ── Primitive string / date helpers ───────────────────────────────────────
  function ensureString(v) { return (typeof v === 'string') ? v : (v == null ? '' : String(v)); }
  function trimString(v) { return ensureString(v).trim(); }

  // Index-specific normalization: trim, collapse non-breaking spaces and
  // internal whitespace runs. Different from RegistryCore.trimString which
  // only trims; both surfaces' index code expects this stricter form.
  function normText(raw) {
    return ensureString(raw).replace(/ /g, ' ').trim().replace(/\s+/g, ' ');
  }
  function slug(raw) {
    return normText(raw).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
  }
  function uniqueStrings(rows) {
    const out = [];
    const seen = new Set();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const value = normText(row);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out;
  }
  function toNonNegativeInt(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.trunc(n);
  }
  function firstCount(src, keys = []) {
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(src || {}, key)) continue;
      const n = toNonNegativeInt(src?.[key], -1);
      if (n >= 0) return n;
    }
    return 0;
  }
  function dateMs(value) {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n < 100000000000 ? n * 1000 : n;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function isoOrEmpty(value) {
    const ms = dateMs(value);
    if (!ms) return '';
    try { return new Date(ms).toISOString(); } catch { return ''; }
  }
  function pickNewerDate(a, b) {
    const ma = dateMs(a), mb = dateMs(b);
    if (!ma) return b || '';
    if (!mb) return a || '';
    return ma >= mb ? a : b;
  }
  function pickOlderDate(a, b) {
    const ma = dateMs(a), mb = dateMs(b);
    if (!ma) return b || '';
    if (!mb) return a || '';
    return ma <= mb ? a : b;
  }

  // ── Identity / href (delegate to RegistryCore when available) ────────────
  function parseChatIdFromHref(input) {
    const c = rc();
    if (c) return c.parseChatIdFromHref(input);
    const m = ensureString(input).match(/\/c\/([A-Za-z0-9._:-]+)/);
    return m ? m[1] : '';
  }
  function normalizeChatId(input) {
    const c = rc();
    if (c) return c.normalizeChatId(input);
    const v = ensureString(input).trim();
    if (!v) return '';
    const fromHref = parseChatIdFromHref(v);
    return fromHref || v.replace(/^chat:/i, '').trim();
  }
  function normalizeHref(input) {
    const c = rc();
    if (c) return c.normalizeHref(input);
    return ensureString(input).trim();
  }
  function isImportedId(id) {
    const c = rc();
    if (c) return c.isImportedId(id);
    return /^imported[-_:]/i.test(ensureString(id).trim());
  }
  function hrefForChatId(chatId) {
    const id = normalizeChatId(chatId);
    if (!id || /^imported[-_:]/i.test(id)) return '';
    return `/c/${encodeURIComponent(id)}`;
  }

  // ── Source rank / merge ──────────────────────────────────────────────────
  const SOURCE_RANK = Object.freeze({
    archive: 100,
    saved: 96,
    imported: 92,
    categories: 82,
    labels: 80,
    folders: 78,
    tags: 74,
    projects: 64,
    recents: 58,
    indexed: 54,
    'labels-binding': 50,
    unknown: 10,
  });
  function sourceRank(source) {
    const key = ensureString(source).trim().toLowerCase();
    return SOURCE_RANK[key] || SOURCE_RANK.unknown;
  }
  function normalizeSource(source) {
    const s = ensureString(source).trim().toLowerCase();
    if (!s) return 'unknown';
    if (/archive|workbench|snapshot|capture|saved/.test(s)) return 'archive';
    if (/import/.test(s)) return 'imported';
    if (/recent|recents|native/.test(s)) return 'recents';
    if (/\bindexed?\b|\bindex\b|registry|discover/.test(s)) return 'indexed';
    if (/label/.test(s)) return s === 'labels-binding' ? 'labels-binding' : 'labels';
    if (/categor/.test(s)) return 'categories';
    if (/folder/.test(s)) return 'folders';
    if (/project/.test(s)) return 'projects';
    if (/tag/.test(s)) return 'tags';
    return s;
  }
  function mergeSourceArrays(a, b) {
    const out = [];
    const seen = new Set();
    const ax = Array.isArray(a) ? a : ensureString(a).split('+');
    const bx = Array.isArray(b) ? b : ensureString(b).split('+');
    [...ax, ...bx].forEach((source) => {
      const src = normalizeSource(source);
      if (!src || src === 'unknown' || seen.has(src)) return;
      seen.add(src);
      out.push(src);
    });
    if (out.includes('indexed') && out.some((src) => src && src !== 'indexed')) {
      return out.filter((src) => src !== 'indexed').sort((x, y) => sourceRank(y) - sourceRank(x) || x.localeCompare(y));
    }
    return out.sort((x, y) => sourceRank(y) - sourceRank(x) || x.localeCompare(y));
  }
  function bestSource(sources) {
    const rows = mergeSourceArrays(sources);
    return rows[0] || 'unknown';
  }
  function sourceHintsForRow(src = {}, explicitSource = '') {
    const hints = [];
    const push = (value) => {
      if (Array.isArray(value)) { value.forEach(push); return; }
      const raw = normText(value);
      if (!raw) return;
      String(raw).split('+').forEach((part) => {
        const v = normText(part);
        if (v) hints.push(v);
      });
    };
    push(src.originSources);
    push(src.sources);
    push(src.originSource);
    push(src.origin);
    push(src.source);
    push(explicitSource);
    if (src.isRecent === true || src.isRecentHint === true || src.recent === true || src.nativeRecentsSource || src.nativeRecentsMode) push('recents');
    if (src.isSaved === true || src.isSavedHint === true || src.saved === true) push('archive');
    if (src.isImported === true || src.isImportedHint === true) push('imported');
    return mergeSourceArrays(hints);
  }

  // ── Title / confidence / batch ──────────────────────────────────────────
  // LibraryIndex's title heuristic differs from RegistryCore's — here we
  // prefer the longer, more-descriptive title (registry version uses source
  // rank). Both are pure; both are exported.
  function chooseBetterTitle(a, b, fallback = '') {
    const aa = normText(a);
    const bb = normText(b);
    if (!aa) return bb || fallback || '';
    if (!bb) return aa;
    if (/^[a-z0-9-]{8,}$/i.test(aa) && !/^[a-z0-9-]{8,}$/i.test(bb)) return bb;
    return aa.length >= bb.length ? aa : bb;
  }
  function higherConfidence(a = 'low', b = 'low') {
    const rank = { low: 1, medium: 2, high: 3 };
    return (rank[b] || 1) > (rank[a] || 1) ? b : a;
  }
  function mergeBatchHistory(prev, next) {
    const out = [];
    const seen = new Set();
    const push = (s) => {
      const v = normText(s);
      if (!v || seen.has(v)) return;
      seen.add(v);
      out.push(v);
    };
    (Array.isArray(next) ? next : []).forEach(push);
    (Array.isArray(prev) ? prev : []).forEach(push);
    return out.slice(0, REGISTRY_BATCH_HISTORY_LIMIT);
  }

  function deriveTurnCounts(src = {}) {
    const answerCount = firstCount(src, ['answerCount', 'assistantTurnCount', 'assistantTurns', 'answers', 'responseCount']);
    const userTurnCount = firstCount(src, ['userTurnCount', 'userTurns', 'questionCount', 'questions', 'promptCount']);
    const directTurnCount = firstCount(src, ['turnCount', 'turns', 'qaTurnCount', 'conversationTurnCount']);
    const messageCount = firstCount(src, ['messageCount', 'messagesCount', 'message_count']);
    const turnCount = directTurnCount || Math.max(answerCount, userTurnCount) || (messageCount ? Math.ceil(messageCount / 2) : 0);
    return { turnCount, answerCount, userTurnCount };
  }

  function mergeObjectsById(a = [], b = [], idKeys = ['id'], labelKeys = ['label', 'name', 'title']) {
    const map = new Map();
    const put = (raw) => {
      const src = raw && typeof raw === 'object' ? raw : { label: raw };
      const id = normText(idKeys.map((k) => src[k]).find(Boolean) || slug(labelKeys.map((k) => src[k]).find(Boolean) || ''));
      const label = normText(labelKeys.map((k) => src[k]).find(Boolean) || id);
      if (!id && !label) return;
      const key = (id || label).toLowerCase();
      const prev = map.get(key) || {};
      map.set(key, { ...prev, ...src, id: id || prev.id || slug(label), label: label || prev.label || id });
    };
    (Array.isArray(a) ? a : []).forEach(put);
    (Array.isArray(b) ? b : []).forEach(put);
    return Array.from(map.values());
  }

  function compareDateDesc(a, b, field = 'createdAt') {
    const da = dateMs(readDateField(a, field));
    const db = dateMs(readDateField(b, field));
    if (da !== db) return db - da;
    return 0;
  }
  function readDateField(row, field = 'createdAt') {
    const f = ensureString(field) || 'createdAt';
    if (f === 'best' || f === 'sortAt') return row?.sortAt || row?.lastInteractionAt || row?.lastMessageAt || row?.updatedAt || row?.savedAt || row?.lastSeenAt || row?.createdAt || row?.observedAt || '';
    if (f === 'savedRecent') return row?.sortAt || row?.capturedAt || row?.lastCapturedAt || row?.snapshotCapturedAt || row?.savedAt || row?.createdAt || row?.lastMessageAt || row?.lastInteractionAt || row?.updatedAt || row?.lastSeenAt || row?.observedAt || '';
    if (f === 'lastInteractionAt') return row?.lastInteractionAt || row?.lastMessageAt || row?.updatedAt || row?.lastSeenAt || '';
    return row?.[f] || row?.dates?.[f] || '';
  }

  // ── Native row normalization ────────────────────────────────────────────
  function normalizeChatRow(row, source = '', extra = {}) {
    const src = row && typeof row === 'object' ? row : {};
    const sourceHints = sourceHintsForRow(src, source);
    const normalizedSource = sourceHints[0] || normalizeSource(source || src.source || src.origin || src.originSource || '');
    const href = normText(src.href || src.url || src.path || src.link || '');
    const chatId = normalizeChatId(src.chatId || src.conversationId || src.id || parseChatIdFromHref(href));
    const title = normText(src.title || src.name || src.label || src.excerpt || src.summary || src.chatTitle || chatId || href || 'Untitled chat').slice(0, 220);
    const createdAt = isoOrEmpty(src.createdAt || src.createTime || src.create_time || src.created || '');
    const updatedAt = isoOrEmpty(src.updatedAt || src.lastActivityAt || src.updateTime || src.update_time || src.modifiedAt || src.savedAt || src.capturedAt || '');
    const lastInteractionAt = isoOrEmpty(src.lastInteractionAt || src.lastMessageAt || src.lastTurnAt || src.lastActivityAt || src.updateTime || src.update_time || src.updatedAt || '');
    const savedAt = isoOrEmpty(src.savedAt || src.capturedAt || src.snapshotCapturedAt || src.archivedAt || '');
    const lastSeenAt = isoOrEmpty(src.lastSeenAt || src.lastViewedAt || '');
    const observedAt = isoOrEmpty(extra.observedAt || '');
    const counts = deriveTurnCounts(src);
    const id = chatId || href || `title:${slug(title)}`;
    const isSaved = sourceHints.some((s) => s === 'archive' || s === 'saved' || s === 'imported') || !!src.snapshotId || !!src.capturedAt || src.isSavedHint === true;
    const isRecent = sourceHints.includes('recents') || src.isRecentHint === true || src.isRecent === true;
    return {
      id,
      chatId,
      title,
      href: href || hrefForChatId(chatId),
      sources: sourceHints.length ? sourceHints : (normalizedSource === 'unknown' ? [] : [normalizedSource]),
      source: normalizedSource,
      isSaved,
      isRecent,
      isImported: sourceHints.includes('imported') || /^imported[-_:]/i.test(chatId) || src.isImportedHint === true,
      isArchived: src.archived === true || src.isArchived === true || src.is_archived === true,
      isPinned: src.pinned === true || src.isPinned === true || !!src.pinned_time,
      createdAt,
      updatedAt,
      lastInteractionAt,
      turnCount: counts.turnCount,
      answerCount: counts.answerCount,
      userTurnCount: counts.userTurnCount,
      savedAt,
      lastSeenAt,
      observedAt,
      sortAt: pickNewerDate(lastInteractionAt, pickNewerDate(updatedAt, pickNewerDate(savedAt, pickNewerDate(lastSeenAt, observedAt)))),
      nativeOrder: Number.isFinite(Number(src.nativeOrder ?? extra.nativeOrder)) ? Number(src.nativeOrder ?? extra.nativeOrder) : null,
      nativeRecentsMode: normText(src.nativeRecentsMode || extra.nativeRecentsMode || ''),
      nativeRecentsSource: normText(src.nativeRecentsSource || extra.nativeRecentsSource || ''),
      folderIds: [],
      folderNames: [],
      labels: [],
      labelIds: [],
      labelNames: [],
      categories: [],
      categoryIds: [],
      categoryNames: [],
      projectId: normText(src.projectId || src.nativeProjectId || src.gizmoId || src.gizmo_id || src.gizmo?.id || src.project?.id || ''),
      projectName: normText(src.projectName || src.nativeProjectName || src.gizmoName || src.gizmo_name || src.gizmo?.title || src.gizmo?.name || src.gizmo?.display?.name || src.project?.title || src.project?.name || ''),
      tags: [],
      tagIds: [],
      tagNames: [],
      keywords: uniqueStrings(Array.isArray(src.keywords) ? src.keywords : []),
      confidence: isSaved ? 'high' : isRecent ? 'medium' : 'low',
      evidence: normalizedSource === 'unknown' ? [] : [{ source: normalizedSource, at: Date.now() }],
      firstSeenAt: isoOrEmpty(src.firstSeenAt || ''),
      scanBatchId: normText(src.scanBatchId || ''),
      visibleInLastScan: !!src.visibleInLastScan,
      batchHistory: Array.isArray(src.batchHistory)
        ? uniqueStrings(src.batchHistory.map((s) => normText(s))).slice(0, REGISTRY_BATCH_HISTORY_LIMIT)
        : [],
    };
  }

  function mergeChatRecord(prevRaw, nextRaw) {
    const prev = prevRaw && typeof prevRaw === 'object' ? prevRaw : {};
    const next = nextRaw && typeof nextRaw === 'object' ? nextRaw : {};
    const sources = mergeSourceArrays(prev.sources || prev.source, next.sources || next.source);
    const merged = {
      ...prev,
      ...next,
      id: prev.id || next.id,
      chatId: prev.chatId || next.chatId || '',
      href: prev.href || next.href || '',
      title: chooseBetterTitle(prev.title, next.title, prev.id || next.id),
      sources,
      source: bestSource(sources),
      isSaved: !!(prev.isSaved || next.isSaved),
      isRecent: !!(prev.isRecent || next.isRecent),
      isImported: !!(prev.isImported || next.isImported),
      isArchived: !!(prev.isArchived || next.isArchived),
      isPinned: !!(prev.isPinned || next.isPinned),
      createdAt: pickOlderDate(prev.createdAt, next.createdAt),
      updatedAt: pickNewerDate(prev.updatedAt, next.updatedAt),
      lastInteractionAt: pickNewerDate(prev.lastInteractionAt || prev.lastMessageAt, next.lastInteractionAt || next.lastMessageAt),
      turnCount: Math.max(toNonNegativeInt(prev.turnCount), toNonNegativeInt(next.turnCount), toNonNegativeInt(prev.answerCount), toNonNegativeInt(next.answerCount), toNonNegativeInt(prev.userTurnCount), toNonNegativeInt(next.userTurnCount)),
      answerCount: Math.max(toNonNegativeInt(prev.answerCount), toNonNegativeInt(next.answerCount)),
      userTurnCount: Math.max(toNonNegativeInt(prev.userTurnCount), toNonNegativeInt(next.userTurnCount)),
      savedAt: pickNewerDate(prev.savedAt, next.savedAt),
      lastSeenAt: pickNewerDate(prev.lastSeenAt, next.lastSeenAt),
      observedAt: pickNewerDate(prev.observedAt, next.observedAt),
      nativeRecentsMode: prev.nativeRecentsMode || next.nativeRecentsMode || '',
      nativeRecentsSource: prev.nativeRecentsSource || next.nativeRecentsSource || '',
      folderIds: uniqueStrings([...(prev.folderIds || []), ...(next.folderIds || [])]),
      folderNames: uniqueStrings([...(prev.folderNames || []), ...(next.folderNames || [])]),
      labels: mergeObjectsById(prev.labels, next.labels, ['key', 'id'], ['label', 'name']),
      categories: mergeObjectsById(prev.categories, next.categories, ['id'], ['name', 'label']),
      tags: mergeObjectsById(prev.tags, next.tags, ['id'], ['label', 'name']),
      keywords: uniqueStrings([...(prev.keywords || []), ...(next.keywords || [])]),
      evidence: [...(Array.isArray(prev.evidence) ? prev.evidence : []), ...(Array.isArray(next.evidence) ? next.evidence : [])].slice(-12),
      confidence: higherConfidence(prev.confidence, next.confidence),
    };
    merged.labelIds = uniqueStrings(merged.labels.map((item) => item.key || item.id || item.label));
    merged.labelNames = uniqueStrings(merged.labels.map((item) => item.label || item.name || item.id));
    merged.categoryIds = uniqueStrings(merged.categories.map((item) => item.id || item.label || item.name));
    merged.categoryNames = uniqueStrings(merged.categories.map((item) => item.name || item.label || item.id));
    merged.tagIds = uniqueStrings(merged.tags.map((item) => item.id || item.label || item.name));
    merged.tagNames = uniqueStrings(merged.tags.map((item) => item.label || item.name || item.id));
    merged.projectId = prev.projectId || next.projectId || '';
    merged.projectName = prev.projectName || next.projectName || '';
    merged.sortAt = pickNewerDate(merged.lastInteractionAt, pickNewerDate(merged.updatedAt, pickNewerDate(merged.savedAt, pickNewerDate(merged.lastSeenAt, merged.observedAt))));
    // Phase 2 durability merges. firstSeenAt: oldest wins. scanBatchId /
    // visibleInLastScan / batchHistory: only overwrite when `next` carries
    // a non-empty scanBatchId (otherwise raw rows from model build would
    // silently reset durability state).
    merged.firstSeenAt = pickOlderDate(prev.firstSeenAt, next.firstSeenAt);
    const nextHasBatchContext = (typeof next.scanBatchId === 'string' && next.scanBatchId.length > 0);
    if (nextHasBatchContext) {
      merged.scanBatchId = next.scanBatchId;
      merged.visibleInLastScan = !!next.visibleInLastScan;
      merged.batchHistory = mergeBatchHistory(prev.batchHistory, next.batchHistory);
    } else {
      merged.scanBatchId = (typeof prev.scanBatchId === 'string') ? prev.scanBatchId : '';
      merged.visibleInLastScan = !!prev.visibleInLastScan;
      merged.batchHistory = Array.isArray(prev.batchHistory)
        ? prev.batchHistory.slice(0, REGISTRY_BATCH_HISTORY_LIMIT)
        : [];
    }
    return merged;
  }

  // ── Studio row normalization ───────────────────────────────────────────
  // Studio's row shape is narrower than native's; archive workbench rows
  // and registry projections both flow through this normalizer.
  function normalizeRowStudio(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const chatId = ensureString(raw.chatId || raw.id).trim();
    if (!chatId) return null;

    const catObj = (raw.category && typeof raw.category === 'object') ? raw.category : null;
    const categoryId = ensureString(
      raw.categoryId
      || catObj?.primaryCategoryId
      || raw.primaryCategoryId
      || catObj?.categoryId
      || catObj?.id
      || ''
    ).trim();
    const categoryName = ensureString(
      raw.categoryName
      || catObj?.primaryCategoryName
      || catObj?.name
      || catObj?.label
      || ''
    ).trim();

    const snapshotId = ensureString(
      raw.snapshotId
      || raw.snapId
      || raw.snapshot_id
      || raw.snapshot?.id
      || raw.snapshot?.snapshotId
      || raw.meta?.snapshotId
      || ''
    ).trim();

    const rawState = (raw.state && typeof raw.state === 'object') ? raw.state : null;

    return {
      chatId,
      snapshotId,
      title: ensureString(raw.title || raw.name || raw.chatTitle).trim(),
      projectId: ensureString(raw.projectId).trim(),
      folderId: ensureString(raw.folderId || raw.folder).trim(),
      folderName: ensureString(raw.folderName).trim(),
      categoryId,
      categoryName,
      view: ensureString(raw.view || (typeof raw.state === 'string' ? raw.state : '') || 'saved').toLowerCase(),
      tags: Array.isArray(raw.tags) ? raw.tags.slice() : [],
      labels: Array.isArray(raw.labels) ? raw.labels.slice() : [],
      snapshotCount: Number(raw.snapshotCount || raw.snapshots?.length || 1),
      capturedAt: ensureString(raw.capturedAt || raw.updatedAt || raw.lastUpdated),
      updatedAt: ensureString(raw.updatedAt || raw.capturedAt),
      messageCount: Number(raw.messageCount || raw.turns || 0),
      pinned: !!raw.pinned,
      archived: !!raw.archived,
      state: rawState
        ? {
            isLinked:   !!rawState.isLinked,
            isSaved:    !!rawState.isSaved,
            isPinned:   !!rawState.isPinned,
            isArchived: !!rawState.isArchived,
            isImported: !!rawState.isImported,
            isDeleted:  !!rawState.isDeleted,
            syncState:  ensureString(rawState.syncState),
          }
        : {},
      linkedAt:        ensureString(raw.linkedAt),
      linkedFrom:      ensureString(raw.linkedFrom),
      linkSourceHref:  ensureString(raw.linkSourceHref),
      href:            ensureString(raw.href || raw.normalizedHref),
      normalizedHref:  ensureString(raw.normalizedHref),
      raw,
    };
  }

  // Phase 1 ChatRegistry record → Studio linked-only row.
  // Strict filter: only records that are linked AND not saved AND not deleted
  // flow through. Saved records would dedup-collide via chatId with the
  // archive source. Imported-only records (no chatId) are excluded.
  function normalizeLinkedOnlyProjection(rec) {
    if (!rec || typeof rec !== 'object') return null;
    const chatId = ensureString(rec.chatId).trim();
    if (!chatId) return null;
    const st = (rec.state && typeof rec.state === 'object') ? rec.state : null;
    if (!st || !st.isLinked || st.isDeleted) return null;
    const isSaved = !!st.isSaved;
    const href = ensureString(rec.href || rec.normalizedHref).trim();
    return normalizeRowStudio({
      chatId,
      title: ensureString(rec.title).trim(),
      projectId: ensureString(rec.project?.projectId),
      folderId: ensureString(rec.organization?.folderId),
      view: isSaved ? 'saved' : 'linked',
      tags: [],
      labels: [],
      updatedAt: ensureString(rec.updatedAt || rec.lastSeenAt || rec.firstSeenAt),
      capturedAt: '',
      state: {
        isLinked: true,
        isSaved,
        isPinned: !!st.isPinned,
        isArchived: !!st.isArchived,
        isImported: !!st.isImported,
        isDeleted: false,
      },
      linkedAt: ensureString(rec.linkedAt),
      linkedFrom: ensureString(rec.linkedFrom),
      linkSourceHref: ensureString(rec.linkSourceHref),
      href,
      normalizedHref: ensureString(rec.normalizedHref),
    });
  }

  // ── View derivation (alignment helper) ─────────────────────────────────
  function deriveViewFromBooleans({ isSaved = false, isLinked = false, isImported = false, isRecent = false } = {}) {
    if (isImported && isSaved) return 'imported';
    if (isSaved) return 'saved';
    if (isLinked) return 'linked';
    if (isRecent) return 'recents';
    return 'recents';
  }

  // ── Open-target resolution (Native Save-to-Folder + linked rows) ────────
  // Resolves the URL a row should open. Preference order is strict:
  //   normalizedHref → href → linkSourceHref → /c/<chatId>
  // NEVER returns folderId — a folder binding is metadata, not an open
  // target. Returns '' only when no chat identity is resolvable. Native
  // Save-to-Folder rows arrive as view:'saved' + state.isLinked:true with
  // a valid href; this resolver yields /c/<chatId> for them.
  function resolveRowOpenTarget(row) {
    if (!row || typeof row !== 'object') return '';
    const norm = ensureString(row.normalizedHref).trim();
    if (norm) return norm;
    const href = ensureString(row.href).trim();
    if (href) return href;
    const linkSrc = ensureString(row.linkSourceHref).trim();
    if (linkSrc) return linkSrc;
    const chatId = ensureString(row.chatId).trim();
    if (chatId) return hrefForChatId(chatId);
    return '';
  }

  // True when a row should open its original ChatGPT chat (a live link)
  // instead of a captured Studio snapshot reader. Covers Native
  // Save-to-Folder rows, which arrive as view:'saved' + state.isLinked:true
  // with no readable transcript. A row is link-only when it is tagged
  // linked (view OR state OR row flag), OR carries a resolvable link
  // target without a captured snapshot.
  function rowIsLinkOnly(row) {
    if (!row || typeof row !== 'object') return false;
    if (ensureString(row.view).trim().toLowerCase() === 'linked') return true;
    const st = (row.state && typeof row.state === 'object') ? row.state : null;
    if (st && st.isLinked === true) return true;
    if (row.isLinked === true) return true;
    if (ensureString(row.snapshotId).trim()) return false;
    return !!resolveRowOpenTarget(row);
  }

  function rowHasTranscriptEvidence(row) {
    if (!row || typeof row !== 'object') return false;
    const raw = (row.raw && typeof row.raw === 'object') ? row.raw : {};
    const snapshotId = ensureString(
      row.snapshotId
      || row.lastSnapshotId
      || row.latestSnapshotId
      || row.snapshot_id
      || raw.snapshotId
      || raw.lastSnapshotId
      || raw.latestSnapshotId
      || raw.snapshot_id
      || raw.snapId
      || raw.snapshot?.id
      || raw.snapshot?.snapshotId
      || raw.meta?.snapshotId
      || raw.meta?.lastSnapshotId
      || raw.meta?.latestSnapshotId
    ).trim();
    if (snapshotId) return true;
    const countKeys = ['messageCount', 'turnCount', 'userTurnCount', 'assistantTurnCount', 'answerCount'];
    for (const key of countKeys) {
      if (toNonNegativeInt(row[key]) > 0 || toNonNegativeInt(raw[key]) > 0) return true;
    }
    const snapshots = Array.isArray(row.snapshots) ? row.snapshots : (Array.isArray(raw.snapshots) ? raw.snapshots : []);
    return snapshots.some((snap) => {
      if (!snap || typeof snap !== 'object') return false;
      return !!(
        ensureString(snap.snapshotId || snap.id).trim()
        || toNonNegativeInt(snap.messageCount) > 0
        || toNonNegativeInt(snap.turnCount) > 0
      );
    });
  }

  // ── Dedupe key ──────────────────────────────────────────────────────────
  function getRowDedupeKey(row) {
    if (!row || typeof row !== 'object') return '';
    const chatId = ensureString(row.chatId).trim();
    if (chatId) return `chatId:${chatId}`;
    const nh = ensureString(row.normalizedHref).trim();
    if (nh) return `href:${nh}`;
    const href = ensureString(row.href).trim();
    if (href) return `href:${normalizeHref(href)}`;
    const snap = ensureString(row.snapshotId || row.latestSnapshotId).trim();
    if (snap) return `snap:${snap}`;
    return '';
  }

  // ── Facets / counts (native shape) ─────────────────────────────────────
  function facetRowsFromMap(map) {
    return Array.from(map.values()).sort((a, b) => (b.count - a.count) || String(a.label || a.id).localeCompare(String(b.label || b.id)));
  }
  function bumpFacet(map, idRaw, labelRaw = idRaw, extra = {}) {
    const id = normText(idRaw || labelRaw);
    const label = normText(labelRaw || id);
    if (!id && !label) return;
    const key = (id || label).toLowerCase();
    const row = map.get(key) || { id, label, count: 0, ...extra };
    row.count += 1;
    map.set(key, row);
  }
  function normalizeCategoryList(groups, chats) {
    const countById = new Map();
    (Array.isArray(chats) ? chats : []).forEach((chat) => (chat.categories || []).forEach((cat) => {
      const id = normText(cat.id || cat.name || cat.label);
      if (!id) return;
      countById.set(id, (countById.get(id) || 0) + 1);
    }));
    return (Array.isArray(groups) ? groups : []).map((group) => ({
      id: group.id,
      name: group.name,
      label: group.name,
      color: group.color || '',
      count: countById.get(group.id) || (Array.isArray(group.rows) ? group.rows.length : 0),
      source: 'categories',
    })).sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
  }
  function collectTagFacets(chats) {
    const map = new Map();
    (Array.isArray(chats) ? chats : []).forEach((chat) => {
      (chat.tags || []).forEach((tag) => {
        const id = normText(tag.id || slug(tag.label || tag.name));
        const label = normText(tag.label || tag.name || id);
        if (!id && !label) return;
        const key = (id || label).toLowerCase();
        const current = map.get(key) || { id, label, name: label, color: tag.color || '', count: 0, usageCount: 0, source: 'tags' };
        current.count += 1;
        current.usageCount += Number(tag.usageCount || 0) || 0;
        if (!current.color && tag.color) current.color = tag.color;
        map.set(key, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
  }
  function buildFacets(chats /* , model */) {
    const sourceMap = new Map();
    const folderMap = new Map();
    const labelMap = new Map();
    const categoryMap = new Map();
    const projectMap = new Map();
    const tagMap = new Map();
    const yearMap = new Map();
    const monthMap = new Map();
    (Array.isArray(chats) ? chats : []).forEach((chat) => {
      (chat.sources || []).forEach((source) => bumpFacet(sourceMap, source, source));
      (chat.folderIds || []).forEach((id, idx) => bumpFacet(folderMap, id, chat.folderNames?.[idx] || id));
      (chat.labels || []).forEach((label) => bumpFacet(labelMap, label.key || label.id, label.label || label.name || label.id, { type: label.type || '' }));
      (chat.categories || []).forEach((cat) => bumpFacet(categoryMap, cat.id, cat.name || cat.label || cat.id));
      if (chat.projectId || chat.projectName) bumpFacet(projectMap, chat.projectId || chat.projectName, chat.projectName || chat.projectId);
      (chat.tags || []).forEach((tag) => bumpFacet(tagMap, tag.id || tag.label, tag.label || tag.name || tag.id));
      const ms = dateMs(readDateField(chat, 'createdAt') || readDateField(chat, 'sortAt'));
      if (ms) {
        const d = new Date(ms);
        const year = String(d.getUTCFullYear());
        const month = `${year}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        bumpFacet(yearMap, year, year);
        bumpFacet(monthMap, month, month);
      }
    });
    return {
      sources: facetRowsFromMap(sourceMap),
      folders: facetRowsFromMap(folderMap),
      labels: facetRowsFromMap(labelMap),
      categories: facetRowsFromMap(categoryMap),
      projects: facetRowsFromMap(projectMap),
      tags: facetRowsFromMap(tagMap),
      years: facetRowsFromMap(yearMap),
      months: facetRowsFromMap(monthMap),
    };
  }
  function buildCounts(model) {
    const saved = model.savedChats || [];
    const chats = model.chats || [];
    const recentChats = model.recentChats || [];
    const storedKnownChats = Math.max(chats.length, Number(model.lastKnownRegistryCount || 0) || 0);
    return {
      knownChats: chats.length,
      storedKnownChats,
      savedChats: saved.length,
      recentChats: recentChats.length,
      nativeRecentChats: recentChats.length,
      importedChats: chats.filter((chat) => chat.isImported).length,
      folders: (model.folders || []).length,
      labels: (model.labels || []).length,
      categories: (model.categories || []).length,
      projects: (model.projects || []).length,
      tags: (model.tags || []).length,
      undated: chats.filter((chat) => !dateMs(chat.createdAt)).length,
      unfiledSaved: saved.filter((chat) => !(chat.folderIds || []).length).length,
      unlabeledSaved: saved.filter((chat) => !(chat.labels || []).length).length,
      uncategorizedSaved: saved.filter((chat) => !(chat.categories || []).length).length,
    };
  }

  // ── Facets / counts (Studio shape) ──────────────────────────────────────
  // Studio uses simple "by-key" buckets: byView, byFolder, byCategory,
  // byProject, byLabel, byTag. Each bucket is {[key]: chatId[]}.
  function buildFacetsStudio(rows) {
    const facets = {
      byView: Object.create(null),
      byFolder: Object.create(null),
      byCategory: Object.create(null),
      byProject: Object.create(null),
      byLabel: Object.create(null),
      byTag: Object.create(null),
    };
    const push = (bucket, key, chatId) => {
      const k = ensureString(key).trim();
      if (!k) return;
      (bucket[k] = bucket[k] || []).push(chatId);
    };
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      if (!row || !row.chatId) return;
      push(facets.byView, row.view, row.chatId);
      if (row.folderId) push(facets.byFolder, row.folderId, row.chatId);
      if (row.categoryId) push(facets.byCategory, row.categoryId, row.chatId);
      if (row.projectId) push(facets.byProject, row.projectId, row.chatId);
      for (const lab of (row.labels || [])) push(facets.byLabel, typeof lab === 'string' ? lab : (lab?.id || lab?.label || ''), row.chatId);
      for (const tag of (row.tags || [])) push(facets.byTag, typeof tag === 'string' ? tag : (tag?.id || tag?.label || ''), row.chatId);
    });
    return facets;
  }
  function countsFromFacetsStudio(facets, total) {
    const f = facets || {};
    const collapse = (bucket) => Object.fromEntries(Object.entries(bucket || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
    return {
      total: Number(total) || 0,
      views: collapse(f.byView),
      folders: collapse(f.byFolder),
      categories: collapse(f.byCategory),
      projects: collapse(f.byProject),
      labels: collapse(f.byLabel),
      tags: collapse(f.byTag),
    };
  }
  function boolish(value) {
    if (value === true || value === 1) return true;
    const text = ensureString(value).trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes';
  }
  function rowNestedState(row) {
    const raw = row && row.raw && typeof row.raw === 'object' ? row.raw : null;
    const meta = row && row.meta && typeof row.meta === 'object' ? row.meta : null;
    const rowState = row && row.state && typeof row.state === 'object' ? row.state : null;
    const rawState = raw && raw.state && typeof raw.state === 'object' ? raw.state : null;
    const metaState = meta && meta.state && typeof meta.state === 'object' ? meta.state : null;
    return { raw, meta, rowState, rawState, metaState };
  }
  function rowViewForHeadline(row) {
    const { raw, meta } = rowNestedState(row);
    return ensureString(
      row?.displayView
      || row?.badgeKind
      || row?.view
      || row?.status
      || raw?.displayView
      || raw?.badgeKind
      || raw?.view
      || raw?.status
      || meta?.displayView
      || meta?.view
      || meta?.status
      || ''
    ).trim().toLowerCase();
  }
  function rowFlagForHeadline(row, keys = []) {
    const { raw, meta, rowState, rawState, metaState } = rowNestedState(row);
    for (const src of [row, rowState, raw, rawState, meta, metaState]) {
      if (!src || typeof src !== 'object') continue;
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(src, key) && boolish(src[key])) return true;
      }
    }
    return false;
  }
  function rowDeletedForHeadline(row) {
    const view = rowViewForHeadline(row);
    return view === 'deleted'
      || view === 'tombstone'
      || view === 'tombstoned'
      || rowFlagForHeadline(row, ['deleted', 'isDeleted', 'is_deleted', 'tombstoned', 'isTombstoned']);
  }
  function rowArchivedForHeadline(row) {
    const view = rowViewForHeadline(row);
    return view === 'archive'
      || view === 'archived'
      || rowFlagForHeadline(row, ['archived', 'isArchived', 'is_archived']);
  }
  function rowSavedForHeadline(row) {
    const view = rowViewForHeadline(row);
    return view === 'saved' || rowFlagForHeadline(row, ['saved', 'isSaved', 'is_saved']);
  }
  function rowImportedForHeadline(row) {
    const view = rowViewForHeadline(row);
    return view === 'imported' || rowFlagForHeadline(row, ['imported', 'isImported', 'is_imported']);
  }
  function rowLinkedForHeadline(row) {
    const view = rowViewForHeadline(row);
    return view === 'linked' || view === 'link' || rowFlagForHeadline(row, ['linked', 'isLinked', 'is_linked']);
  }
  function countFacetKeys(bucket) {
    return Object.keys(bucket || {}).filter(Boolean).length;
  }
  function canonicalDedupeRows(rows) {
    const out = [];
    const seen = new Set();
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
      if (!row || typeof row !== 'object') return;
      const dedupeKey = getRowDedupeKey(row) || `row:${index}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      out.push(row);
    });
    return out;
  }
  function canonicalRowIsDeleted(row) {
    return !!(row && typeof row === 'object' && rowDeletedForHeadline(row));
  }
  function canonicalRowIsArchived(row) {
    return !!(row && typeof row === 'object' && rowArchivedForHeadline(row));
  }
  function canonicalActiveRows(rows) {
    return canonicalDedupeRows(rows).filter((row) => !canonicalRowIsDeleted(row) && !canonicalRowIsArchived(row));
  }
  function canonicalArchivedRows(rows) {
    return canonicalDedupeRows(rows).filter((row) => !canonicalRowIsDeleted(row) && canonicalRowIsArchived(row));
  }
  function canonicalRowView(row) {
    const isSaved = rowSavedForHeadline(row);
    const isLinked = !isSaved && (rowLinkedForHeadline(row) || rowIsLinkOnly(row));
    return deriveViewFromBooleans({
      isSaved,
      isLinked,
      isImported: rowImportedForHeadline(row),
      isRecent: true,
    });
  }
  function canonicalHeadlineCounts(rows) {
    const counts = {
      total: 0,
      saved: 0,
      link: 0,
      linked: 0,
      pinned: 0,
      archived: 0,
      folders: 0,
      labels: 0,
      categories: 0,
      projects: 0,
    };
    const activeRows = [];
    canonicalDedupeRows(rows).forEach((row) => {
      if (canonicalRowIsDeleted(row)) return;
      if (canonicalRowIsArchived(row)) {
        counts.archived += 1;
        return;
      }
      const view = canonicalRowView(row);
      counts.total += 1;
      activeRows.push(row);
      if (rowFlagForHeadline(row, ['pinned', 'isPinned', 'is_pinned'])) counts.pinned += 1;
      if (view === 'saved') counts.saved += 1;
      else if (view === 'linked') counts.link += 1;
    });
    counts.linked = counts.link;
    const facets = buildFacetsStudio(activeRows);
    counts.folders = countFacetKeys(facets.byFolder);
    counts.labels = countFacetKeys(facets.byLabel);
    counts.categories = countFacetKeys(facets.byCategory);
    counts.projects = countFacetKeys(facets.byProject);
    return counts;
  }
  function canonicalActiveFacets(rows) {
    return buildFacetsStudio(canonicalActiveRows(rows));
  }

  // ── Filter / sort / bucket (native rows) ───────────────────────────────
  function matchesOne(value, candidates = []) {
    if (value == null || value === '' || value === 'all') return true;
    const vals = Array.isArray(value) ? value : [value];
    const lookup = new Set((Array.isArray(candidates) ? candidates : [candidates]).map((v) => normText(v).toLowerCase()).filter(Boolean));
    return vals.some((raw) => lookup.has(normText(raw).toLowerCase()));
  }
  function filterChats(chats, filters = {}) {
    const f = filters && typeof filters === 'object' ? filters : {};
    const q = normText(f.q || f.search || '').toLowerCase();
    const source = f.source || f.sources || '';
    const folder = f.folder || f.folderId || f.folderName || '';
    const label = f.label || f.labelId || f.labelName || '';
    const category = f.category || f.categoryId || f.categoryName || '';
    const project = f.project || f.projectId || f.projectName || '';
    const tag = f.tag || f.tagId || f.tagName || '';
    const missing = normText(f.missing || '').toLowerCase();
    const includeArchived = f.includeArchived === true;
    const dateField = f.dateField || 'createdAt';
    const startMs = dateMs(f.start || f.dateStart || f.from || '');
    const endMs = dateMs(f.end || f.dateEnd || f.to || '');
    return (Array.isArray(chats) ? chats : []).filter((chat) => {
      if (!includeArchived && chat.isArchived) return false;
      if (q && !String(chat.searchText || '').includes(q)) return false;
      if (source && !matchesOne(source, chat.sources || chat.source)) return false;
      if (folder && !matchesOne(folder, [...(chat.folderIds || []), ...(chat.folderNames || [])])) return false;
      if (label && !matchesOne(label, [...(chat.labelIds || []), ...(chat.labelNames || [])])) return false;
      if (category && !matchesOne(category, [...(chat.categoryIds || []), ...(chat.categoryNames || [])])) return false;
      if (project && !matchesOne(project, [chat.projectId, chat.projectName])) return false;
      if (tag && !matchesOne(tag, [...(chat.tagIds || []), ...(chat.tagNames || [])])) return false;
      if (missing === 'folder' && (chat.folderIds || []).length) return false;
      if (missing === 'label' && (chat.labels || []).length) return false;
      if (missing === 'category' && (chat.categories || []).length) return false;
      const ms = dateMs(readDateField(chat, dateField));
      if (startMs && (!ms || ms < startMs)) return false;
      if (endMs && (!ms || ms > endMs)) return false;
      return true;
    });
  }
  function canonicalRowTime(row, dateField = 'best') {
    const explicit = readDateField(row, dateField || 'best');
    const first = dateMs(explicit);
    if (first) return first;
    const candidates = [
      row?.sortAt,
      row?.lastInteractionAt,
      row?.lastMessageAt,
      row?.updatedAt,
      row?.capturedAt,
      row?.lastCapturedAt,
      row?.savedAt,
      row?.linkedAt,
      row?.createdAt,
      row?.observedAt,
      row?.ts,
    ];
    for (const value of candidates) {
      const ms = dateMs(value);
      if (ms) return ms;
    }
    return 0;
  }
  function canonicalRowTitle(row) {
    return normText(row?.title || row?.displayTitle || row?.sourceTitle || row?.chatTitle || row?.name || '');
  }
  function canonicalRowIdentity(row) {
    return normText(getRowDedupeKey(row) || row?.chatId || row?.id || row?.snapshotId || row?.href || row?.normalizedHref || canonicalRowTitle(row));
  }
  function compareCanonicalRows(a, b, sort = 'recent', dateField = 'best') {
    const s = ensureString(sort || 'recent').toLowerCase();
    const titleCompare = canonicalRowTitle(a).localeCompare(canonicalRowTitle(b));
    const idCompare = canonicalRowIdentity(a).localeCompare(canonicalRowIdentity(b));
    const dateCompare = canonicalRowTime(b, dateField) - canonicalRowTime(a, dateField);
    if (s === 'oldest') return -dateCompare || titleCompare || idCompare;
    if (s === 'az' || s === 'title') return titleCompare || dateCompare || idCompare;
    if (s === 'mostturns' || s === 'most-turns') {
      const countCompare = (Number(b?.messageCount || b?.turnCount || 0) || 0) - (Number(a?.messageCount || a?.turnCount || 0) || 0);
      return countCompare || dateCompare || titleCompare || idCompare;
    }
    if (s === 'source') return String(a?.source || '').localeCompare(String(b?.source || '')) || dateCompare || titleCompare || idCompare;
    if (s === 'category') return String(a?.categoryText || a?.categoryName || a?.categoryId || '').localeCompare(String(b?.categoryText || b?.categoryName || b?.categoryId || '')) || dateCompare || titleCompare || idCompare;
    if (s === 'label') return String(a?.labelText || '').localeCompare(String(b?.labelText || '')) || dateCompare || titleCompare || idCompare;
    return dateCompare || titleCompare || idCompare;
  }
  function sortChats(chats, sort = 'newest', dateField = 'createdAt') {
    const rows = (Array.isArray(chats) ? chats : []).slice();
    const s = ensureString(sort || 'newest').toLowerCase();
    rows.sort((a, b) => {
      if (s === 'newest') return compareCanonicalRows(a, b, 'recent', dateField);
      return compareCanonicalRows(a, b, s, dateField);
    });
    return rows;
  }
  function canonicalSortRows(rows, sort = 'recent', dateField = 'best') {
    return (Array.isArray(rows) ? rows : []).slice().sort((a, b) => compareCanonicalRows(a, b, sort, dateField));
  }
  function canonicalRowsForView(rows, view = 'all') {
    const normalized = ensureString(view || 'all').toLowerCase();
    if (normalized === 'archive' || normalized === 'archived') return canonicalArchivedRows(rows);
    const active = canonicalActiveRows(rows);
    if (!normalized || normalized === 'all' || normalized === 'recent' || normalized === 'recents') return active;
    if (normalized === 'saved') return active.filter((row) => canonicalRowView(row) === 'saved');
    if (normalized === 'link' || normalized === 'linked') return active.filter((row) => canonicalRowView(row) === 'linked');
    if (normalized === 'pinned') return active.filter((row) => rowFlagForHeadline(row, ['pinned', 'isPinned', 'is_pinned']));
    if (normalized === 'imported') return active.filter((row) => canonicalRowView(row) === 'imported');
    return active.filter((row) => rowViewForHeadline(row) === normalized);
  }
  function canonicalExplorerRows(rows, filters = {}) {
    const f = filters && typeof filters === 'object' ? filters : {};
    const view = f.forceView || f.view || 'all';
    const sort = f.sort || 'recent';
    const dateField = f.dateField || 'best';
    return canonicalSortRows(filterChats(canonicalRowsForView(rows, view), Object.assign({}, f, {
      includeArchived: view === 'archive' || view === 'archived'
    })), sort, dateField);
  }
  function canonicalRecentRows(rows, limit = 20, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const sorted = canonicalSortRows(canonicalRowsForView(rows, opts.view || 'all'), 'recent', opts.dateField || 'best');
    const cap = Number(limit);
    return Number.isFinite(cap) && cap >= 0 ? sorted.slice(0, cap) : sorted;
  }
  function canonicalSavedRecentRows(rows, limit = 20, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const saved = canonicalActiveRows(rows).filter((row) => rowSavedForHeadline(row) && rowHasTranscriptEvidence(row));
    const sorted = canonicalSortRows(saved, 'recent', opts.dateField || 'savedRecent');
    const cap = Number(limit);
    return Number.isFinite(cap) && cap >= 0 ? sorted.slice(0, cap) : sorted;
  }
  function bucketKey(value, bucket = 'month') {
    const ms = dateMs(value);
    if (!ms) return '';
    const d = new Date(ms);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const b = ensureString(bucket || 'month').toLowerCase();
    if (b === 'day') return `${year}-${month}-${day}`;
    if (b === 'week') return isoWeekKey(d);
    if (b === 'year') return String(year);
    return `${year}-${month}`;
  }
  function isoWeekKey(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }
  function bucketLabel(key, bucket = 'month') {
    if (!key) return 'Undated';
    const b = ensureString(bucket || 'month').toLowerCase();
    if (b === 'month' && /^\d{4}-\d{2}$/.test(key)) {
      const [year, month] = key.split('-').map(Number);
      try {
        return new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
      } catch { return key; }
    }
    if (b === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const [y, m, d] = key.split('-').map(Number);
      try {
        return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
      } catch { return key; }
    }
    return key;
  }

  // ── Public surface ──────────────────────────────────────────────────────
  const LibraryIndexCore = Object.freeze({
    __phase: PHASE,
    __version: '1.0.0',

    // Constants
    REGISTRY_BATCH_HISTORY_LIMIT,
    SOURCE_RANK,

    // Identity / href
    parseChatIdFromHref,
    normalizeChatId,
    normalizeHref,
    isImportedId,
    hrefForChatId,

    // Helpers
    normText,
    slug,
    trimString,
    uniqueStrings,
    toNonNegativeInt,
    firstCount,
    dateMs,
    isoOrEmpty,
    pickNewerDate,
    pickOlderDate,
    compareDateDesc,
    readDateField,

    // Source rank / merge
    sourceRank,
    normalizeSource,
    mergeSourceArrays,
    bestSource,
    sourceHintsForRow,

    // Title / confidence / batch
    chooseBetterTitle,
    higherConfidence,
    mergeBatchHistory,

    // Native row
    deriveTurnCounts,
    mergeObjectsById,
    normalizeChatRow,
    mergeChatRecord,

    // Studio row
    normalizeRowStudio,
    normalizeLinkedOnlyProjection,

    // View / dedupe
    deriveViewFromBooleans,
    getRowDedupeKey,

    // Open-target resolution (Native Save-to-Folder + linked rows)
    resolveRowOpenTarget,
    rowIsLinkOnly,
    rowHasTranscriptEvidence,

    // Facets / counts
    bumpFacet,
    facetRowsFromMap,
    normalizeCategoryList,
    collectTagFacets,
    buildFacets,
    buildCounts,
    buildFacetsStudio,
    countsFromFacetsStudio,
    canonicalHeadlineCounts,
    canonicalActiveRows,
    canonicalArchivedRows,
    canonicalRowView,
    canonicalActiveFacets,
    canonicalRowsForView,

    // Filter / sort / bucket
    matchesOne,
    filterChats,
    canonicalRowTime,
    compareCanonicalRows,
    canonicalSortRows,
    canonicalExplorerRows,
    canonicalRecentRows,
    canonicalSavedRecentRows,
    sortChats,
    bucketKey,
    isoWeekKey,
    bucketLabel,
  });

  H2O.Library.LibraryIndexCore = LibraryIndexCore;
})();
