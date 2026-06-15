// shared/library/chat-registry-core.js
//
// Phase 2A — canonical pure module for Chat Registry record normalization
// and merge logic. Used by both native (0F1g) and Studio (S0F1g) Chat
// Registries through a self-publishing IIFE on `window.H2O.Library.RegistryCore`.
//
// IMPORTANT — runtime distribution:
//   Browser script tags cannot reach this file directly (the chrome-live
//   build bundles native scripts into a single loader.js; Studio script
//   tags are resolved relative to src-surfaces-base/studio/). To keep both surfaces
//   on the same logic without changing the build pipeline, this file is the
//   canonical source and TWO byte-identical mirror files exist:
//
//     src-runtime-base/0F0c.⬛️🧬 Library Registry Core 🧬.js                (native bundle)
//     src-surfaces-base/studio/S0F0c. 🎬 Library Registry Core - Studio.js   (Studio HTML)
//
//   The two mirror files differ ONLY in their userscript-style header
//   (h2o-id, name, match), which is necessary for the build / Studio loader
//   to discover them. Their bodies are identical to the body of this file.
//
//   If you edit this file, copy the new body into both mirrors. A future
//   phase (Phase 3) will introduce a shared/ loader pipeline that removes
//   this duplication.
//
// What this module provides (all pure functions — no DOM, no localStorage,
// no chrome.storage, no IndexedDB, no events, no side effects):
//
//   parseChatIdFromHref(input)           → string
//   normalizeChatId(input)               → string
//   isImportedId(id)                     → boolean
//   normalizeHref(href)                  → string
//   hrefForChatId(chatId)                → string
//   sanitizeState(state, opts?)          → StateObject
//   sanitizeRecord(rec, opts?)           → ChatRecord
//   sanitizeTombstone(tomb, opts?)       → TombstoneObject
//   chooseBetterTitle(pT, pS, nT, nS)    → { title, source }
//   diffFields(prev, next)               → string[]
//   mergeRecord(prev, incoming, opts?)   → ChatRecord
//   deriveRecordView(record)             → 'saved'|'linked'|'recents'|'imported'
//   getRecordDedupeKey(record)           → string (primary|secondary|tertiary key)
//   repairLinkedFlag(recordsById, opts?) → { recordsById, scanned, updated, updatedIds }
//   adoptShape(rawSnapshot)              → { schemaVersion, recordsById, idByHref, tombstonesById, meta }
//
//   Helper exports also available so callers don't reinvent them:
//     trimString, dateMs, isoOrEmpty, pickOlderIso, pickNewerIso,
//     uniqueStrings, isFiniteNumber, maxNum
//
//   Constants:
//     SCHEMA_VERSION
//     TITLE_SOURCE_RANK
//
// Phase 2A canonical invariant (enforced in mergeRecord):
//   chatId && state.isSaved === true   ⟹   state.isLinked === true
//
// Imported / local saved records with no chatId remain saved-only and never
// have isLinked auto-set, because there is no native source URL to link.

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  // Idempotent: if a prior loader already published the module, do nothing.
  if (H2O.Library.RegistryCore && H2O.Library.RegistryCore.__phase === '2A') return;

  const SCHEMA_VERSION = 1;
  const PHASE = '2A';

  // ── Primitive helpers ────────────────────────────────────────────────────
  function ensureString(v) { return (typeof v === 'string') ? v : (v == null ? '' : String(v)); }
  function trimString(v) { return ensureString(v).trim(); }
  function isFiniteNumber(n) { return typeof n === 'number' && Number.isFinite(n); }
  function maxNum(a, b) {
    const ax = isFiniteNumber(a) ? a : -Infinity;
    const bx = isFiniteNumber(b) ? b : -Infinity;
    if (ax === -Infinity && bx === -Infinity) return undefined;
    return ax >= bx ? ax : bx;
  }
  function dateMs(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value > 0 ? value : 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function nowIso() { try { return new Date().toISOString(); } catch { return ''; } }
  function isoOrEmpty(value) {
    const ms = dateMs(value);
    if (!ms) return '';
    try { return new Date(ms).toISOString(); } catch { return ''; }
  }
  function pickOlderIso(a, b) {
    const ma = dateMs(a), mb = dateMs(b);
    if (!ma) return b || '';
    if (!mb) return a || '';
    return ma <= mb ? a : b;
  }
  function pickNewerIso(a, b) {
    const ma = dateMs(a), mb = dateMs(b);
    if (!ma) return b || '';
    if (!mb) return a || '';
    return ma >= mb ? a : b;
  }
  function uniqueStrings(rows) {
    const out = [];
    const seen = new Set();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const v = trimString(row);
      const k = v.toLowerCase();
      if (!v || seen.has(k)) return;
      seen.add(k);
      out.push(v);
    });
    return out;
  }

  // ── chatId / href normalization ──────────────────────────────────────────
  function parseChatIdFromHref(input) {
    const raw = trimString(input);
    if (!raw) return '';
    const m = raw.match(/\/c\/([A-Za-z0-9._:-]+)/);
    return m ? m[1] : '';
  }
  function normalizeChatId(input) {
    const raw = trimString(input);
    if (!raw) return '';
    const fromHref = parseChatIdFromHref(raw);
    if (fromHref) return fromHref;
    return raw.replace(/^chat:/i, '').trim();
  }
  function isImportedId(id) {
    return /^imported[-_:]/i.test(trimString(id));
  }
  function normalizeHref(href) {
    const raw = trimString(href);
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
    const cleaned = path.split('#')[0].split('?')[0];
    return cleaned;
  }
  function hrefForChatId(chatId) {
    const id = normalizeChatId(chatId);
    if (!id || isImportedId(id)) return '';
    return `/c/${id}`;
  }

  // ── Title rank ───────────────────────────────────────────────────────────
  const TITLE_SOURCE_RANK = Object.freeze({
    manual: 100,
    archive: 90,
    import: 88,
    snapshot: 85,
    workbench: 82,
    title: 70,
    sidebar: 60,
    project: 55,
    inferred: 30,
    derived: 10,
    unknown: 5,
    '': 0,
  });
  const PLACEHOLDER_TITLE_RE = /^(new chat|untitled|untitled chat|chatgpt|chat|imported chat|linked chat|link)$/i;
  function isPlaceholderTitle(t) {
    const v = trimString(t);
    if (!v) return true;
    if (PLACEHOLDER_TITLE_RE.test(v)) return true;
    return false;
  }
  function firstNonPlaceholderTitle(values) {
    const list = Array.isArray(values) ? values : [];
    for (const value of list) {
      const title = trimString(value);
      if (title && !isPlaceholderTitle(title)) return title;
    }
    for (const value of list) {
      const title = trimString(value);
      if (title) return title;
    }
    return '';
  }
  function titleSourceRank(s) {
    return TITLE_SOURCE_RANK[String(s || '').toLowerCase()] ?? 0;
  }
  function chooseBetterTitle(prevTitle, prevSource, nextTitle, nextSource) {
    const nextEmpty = !trimString(nextTitle);
    if (nextEmpty) return { title: prevTitle || '', source: prevSource || '' };
    const prevEmpty = !trimString(prevTitle);
    if (prevEmpty) return { title: nextTitle, source: nextSource || '' };
    const prevPlaceholder = isPlaceholderTitle(prevTitle);
    const nextPlaceholder = isPlaceholderTitle(nextTitle);
    if (prevPlaceholder && !nextPlaceholder) return { title: nextTitle, source: nextSource || '' };
    if (!prevPlaceholder && nextPlaceholder) return { title: prevTitle, source: prevSource || '' };
    const prevRank = titleSourceRank(prevSource);
    const nextRank = titleSourceRank(nextSource);
    if (nextRank > prevRank) return { title: nextTitle, source: nextSource || '' };
    return { title: prevTitle, source: prevSource || '' };
  }

  // ── State sanitization ───────────────────────────────────────────────────
  // Accepts either the canonical Phase 1 state object or a legacy flat object
  // (older Studio records used `{ deleted: true }` at the top level). All
  // unknown / missing booleans default to false. Strings default to ''.
  function sanitizeState(state, opts = {}) {
    const s = (state && typeof state === 'object') ? state : {};
    const flatDeleted = opts && opts.flatDeleted === true;
    return {
      isPinned: !!s.isPinned,
      isArchived: !!s.isArchived,
      isSaved: !!s.isSaved,
      isLinked: !!s.isLinked,
      isImported: !!s.isImported || !!(opts && opts.importedChatId && isImportedId(opts.importedChatId)),
      isDeleted: !!s.isDeleted || (flatDeleted === true),
      syncState: trimString(s.syncState),
    };
  }

  // ── Record sanitization ──────────────────────────────────────────────────
  // Accepts the canonical Phase 1 shape OR the legacy flat Studio shape
  // (chatId, title, projectId, folderId, lastSeenTs, deleted, snapshotCount).
  // Returns a record in canonical Phase 1 shape with explicit defaults.
  function sanitizeRecord(rec, fallbackChatId = '') {
    const r = (rec && typeof rec === 'object') ? rec : {};
    const opts = (typeof fallbackChatId === 'object' && fallbackChatId)
      ? fallbackChatId
      : { fallbackChatId: ensureString(fallbackChatId) };
    const fbId = ensureString(opts.fallbackChatId);

    const chatId = normalizeChatId(r.chatId || r.id || fbId);
    const href = trimString(r.href);
    const normalizedHref = trimString(r.normalizedHref) || normalizeHref(href || hrefForChatId(chatId));

    // Legacy Studio shape: lastSeenTs is epoch ms. Convert to ISO so we
    // never store ms in the canonical record (canonical: ISO strings).
    const lastSeenAtRaw = isFiniteNumber(r.lastSeenTs) && r.lastSeenTs > 0
      ? new Date(r.lastSeenTs).toISOString()
      : r.lastSeenAt;
    const flatDeleted = (r.deleted === true) && !(r.state && typeof r.state === 'object');

    // Legacy Studio: project + folder were flat top-level fields. Promote to
    // canonical nested locations if the nested locations are absent.
    const projectFromLegacy = r.project && typeof r.project === 'object'
      ? r.project
      : { projectId: r.projectId, projectName: r.projectName };
    const orgFromLegacy = r.organization && typeof r.organization === 'object'
      ? r.organization
      : { folderId: r.folderId, categoryId: r.categoryId, tagIds: r.tagIds, labelIds: r.labelIds };

    const state = sanitizeState(r.state, { flatDeleted, importedChatId: chatId });

    const displayTitle = firstNonPlaceholderTitle([r.displayTitle, r.meta?.displayTitle]);
    const sourceTitle = firstNonPlaceholderTitle([r.sourceTitle, r.source?.sourceTitle, r.meta?.sourceTitle]);
    const pageTitle = firstNonPlaceholderTitle([r.pageTitle, r.source?.pageTitle, r.meta?.pageTitle]);
    const originalTitle = firstNonPlaceholderTitle([r.originalTitle, r.source?.originalTitle, r.meta?.originalTitle]);
    const title = firstNonPlaceholderTitle([r.title, displayTitle, sourceTitle, pageTitle, originalTitle]);
    const snapshotId = trimString(r.snapshotId || r.snapshot_id || r.lastSnapshotId || r.latestSnapshotId);
    const lastSnapshotId = trimString(r.lastSnapshotId || r.latestSnapshotId || snapshotId);
    const snapshotCount = isFiniteNumber(r.snapshotCount)
      ? Math.max(0, Math.trunc(r.snapshotCount))
      : (snapshotId || lastSnapshotId ? 1 : 0);

    return {
      schemaVersion: Number(r.schemaVersion) || SCHEMA_VERSION,
      chatId,
      href,
      normalizedHref,

      title,
      titleSource: trimString(r.titleSource),
      displayTitle: displayTitle || title,
      sourceTitle: sourceTitle || title,
      pageTitle: pageTitle || title,
      originalTitle: originalTitle || title,

      createdAt: isoOrEmpty(r.createdAt),
      firstSeenAt: isoOrEmpty(r.firstSeenAt),
      lastSeenAt: isoOrEmpty(lastSeenAtRaw),
      updatedAt: isoOrEmpty(r.updatedAt),
      lastMessageAt: isoOrEmpty(r.lastMessageAt),
      lastOpenedAt: isoOrEmpty(r.lastOpenedAt),

      snapshotId: snapshotId || lastSnapshotId,
      lastSnapshotId: lastSnapshotId || snapshotId,
      latestSnapshotId: lastSnapshotId || snapshotId,
      snapshotCount,
      messageCount: isFiniteNumber(r.messageCount) ? Math.max(0, Math.trunc(r.messageCount)) : 0,
      turnCount: isFiniteNumber(r.turnCount) ? Math.max(0, Math.trunc(r.turnCount)) : 0,
      answerCount: isFiniteNumber(r.answerCount) ? Math.max(0, Math.trunc(r.answerCount)) : 0,
      userTurnCount: isFiniteNumber(r.userTurnCount) ? Math.max(0, Math.trunc(r.userTurnCount)) : 0,
      assistantTurnCount: isFiniteNumber(r.assistantTurnCount) ? Math.max(0, Math.trunc(r.assistantTurnCount)) : 0,

      source: {
        first: trimString(r.source?.first),
        seenFrom: uniqueStrings(r.source?.seenFrom),
      },

      project: {
        projectId: trimString(projectFromLegacy?.projectId),
        projectName: trimString(projectFromLegacy?.projectName),
      },

      organization: {
        folderId: trimString(orgFromLegacy?.folderId),
        categoryId: trimString(orgFromLegacy?.categoryId),
        tagIds: uniqueStrings(orgFromLegacy?.tagIds),
        labelIds: uniqueStrings(orgFromLegacy?.labelIds),
      },

      state: {
        ...state,
        // The chatId-derived isImported override: an imported-prefix chatId
        // always marks the record imported regardless of caller-provided state.
        isImported: state.isImported || isImportedId(chatId),
      },

      linkedAt: isoOrEmpty(r.linkedAt),
      linkedFrom: trimString(r.linkedFrom),
      linkSourceHref: trimString(r.linkSourceHref),

      quality: {
        confidence: trimString(r.quality?.confidence),
        inferredFields: uniqueStrings(r.quality?.inferredFields),
        conflicts: Array.isArray(r.quality?.conflicts)
          ? r.quality.conflicts.filter((c) => c && typeof c === 'object').slice(0, 12)
          : [],
      },

      preview: {
        firstQ: trimString(r.preview?.firstQ),
        firstA: trimString(r.preview?.firstA),
        lastQ: trimString(r.preview?.lastQ),
        lastA: trimString(r.preview?.lastA),
        updatedAt: isoOrEmpty(r.preview?.updatedAt),
      },
    };
  }

  function sanitizeTombstone(tomb, fallbackChatId = '') {
    const t = (tomb && typeof tomb === 'object') ? tomb : {};
    return {
      chatId: normalizeChatId(t.chatId || fallbackChatId),
      reason: trimString(t.reason) || 'unknown',
      deletedAt: isoOrEmpty(t.deletedAt || t.ts) || nowIso(),
      lastSeenAt: isoOrEmpty(t.lastSeenAt),
      href: trimString(t.href),
    };
  }

  // ── Diff ─────────────────────────────────────────────────────────────────
  function diffFields(prev, next) {
    const changed = [];
    const top = ['title','titleSource','displayTitle','sourceTitle','pageTitle','originalTitle','createdAt','firstSeenAt','lastSeenAt','updatedAt','lastMessageAt','lastOpenedAt','snapshotId','lastSnapshotId','latestSnapshotId','snapshotCount','messageCount','turnCount','answerCount','userTurnCount','assistantTurnCount','href','normalizedHref','linkedAt','linkedFrom','linkSourceHref'];
    for (const f of top) {
      if (JSON.stringify(prev?.[f] ?? null) !== JSON.stringify(next?.[f] ?? null)) changed.push(f);
    }
    const nested = ['source.first','source.seenFrom','project.projectId','project.projectName','organization.folderId','organization.categoryId','organization.tagIds','organization.labelIds','state.isPinned','state.isArchived','state.isSaved','state.isLinked','state.isImported','state.isDeleted','state.syncState','quality.confidence','preview.firstQ','preview.firstA','preview.lastQ','preview.lastA','preview.updatedAt'];
    for (const path of nested) {
      const [a, b] = path.split('.');
      const pv = prev?.[a]?.[b];
      const nv = next?.[a]?.[b];
      if (JSON.stringify(pv ?? null) !== JSON.stringify(nv ?? null)) changed.push(path);
    }
    return changed;
  }

  // ── Merge ────────────────────────────────────────────────────────────────
  function mergeOrgArrays(prev = [], next = [], options = {}) {
    const np = Array.isArray(next) ? next : [];
    if (options.fullScan === true) return uniqueStrings(np);
    if (options.passive === true && np.length === 0) return uniqueStrings(prev);
    return uniqueStrings([...(prev || []), ...np]);
  }
  function mergeOrgScalar(prev, next, options = {}) {
    const nv = trimString(next);
    if (options.fullScan === true) return nv;
    if (options.passive === true && !nv) return trimString(prev);
    return nv || trimString(prev);
  }

  function mergeRecord(prev, incoming, options = {}) {
    const a = sanitizeRecord(prev, prev?.chatId || incoming?.chatId);
    const b = sanitizeRecord(incoming, incoming?.chatId || prev?.chatId);
    const chatId = a.chatId || b.chatId;
    const href = a.href || b.href;
    const normalizedHref = a.normalizedHref || b.normalizedHref || normalizeHref(href || hrefForChatId(chatId));
    const titlePick = chooseBetterTitle(a.title, a.titleSource, b.title, b.titleSource);
    const displayTitle = firstNonPlaceholderTitle([b.displayTitle, b.title, a.displayTitle, a.title, titlePick.title]);
    const sourceTitle = firstNonPlaceholderTitle([b.sourceTitle, b.title, a.sourceTitle, a.title, titlePick.title]);
    const pageTitle = firstNonPlaceholderTitle([b.pageTitle, b.title, a.pageTitle, a.title, titlePick.title]);
    const originalTitle = firstNonPlaceholderTitle([b.originalTitle, b.title, a.originalTitle, a.title, titlePick.title]);
    const createdAt = pickOlderIso(a.createdAt, b.createdAt);
    const firstSeenAt = pickOlderIso(a.firstSeenAt, b.firstSeenAt);
    const lastSeenAt = pickNewerIso(a.lastSeenAt, b.lastSeenAt);
    const updatedAt = pickNewerIso(a.updatedAt, b.updatedAt);
    const lastMessageAt = pickNewerIso(a.lastMessageAt, b.lastMessageAt);
    const lastOpenedAt = pickNewerIso(a.lastOpenedAt, b.lastOpenedAt);
    const snapshotId = trimString(b.snapshotId) || trimString(b.lastSnapshotId) || trimString(a.snapshotId) || trimString(a.lastSnapshotId);
    const lastSnapshotId = trimString(b.lastSnapshotId) || trimString(b.snapshotId) || trimString(a.lastSnapshotId) || trimString(a.snapshotId);
    const snapshotCount = options.fullScan === true ? (b.snapshotCount || 0) : (maxNum(a.snapshotCount, b.snapshotCount) || 0);
    const messageCount = options.fullScan === true ? (b.messageCount || 0) : (maxNum(a.messageCount, b.messageCount) || 0);
    const turnCount = options.fullScan === true ? (b.turnCount || 0) : (maxNum(a.turnCount, b.turnCount) || 0);
    const answerCount = options.fullScan === true ? (b.answerCount || 0) : (maxNum(a.answerCount, b.answerCount) || 0);
    const userTurnCount = options.fullScan === true ? (b.userTurnCount || 0) : (maxNum(a.userTurnCount, b.userTurnCount) || 0);
    const assistantTurnCount = options.fullScan === true ? (b.assistantTurnCount || 0) : (maxNum(a.assistantTurnCount, b.assistantTurnCount) || 0);
    const sourceFirst = trimString(a.source.first) || trimString(b.source.first);
    const seenFrom = uniqueStrings([...(a.source.seenFrom || []), ...(b.source.seenFrom || [])]);
    const projectId = mergeOrgScalar(a.project.projectId, b.project.projectId, options);
    const projectName = mergeOrgScalar(a.project.projectName, b.project.projectName, options);
    const folderId = mergeOrgScalar(a.organization.folderId, b.organization.folderId, options);
    const categoryId = mergeOrgScalar(a.organization.categoryId, b.organization.categoryId, options);
    const tagIds = mergeOrgArrays(a.organization.tagIds, b.organization.tagIds, options);
    const labelIds = mergeOrgArrays(a.organization.labelIds, b.organization.labelIds, options);

    const stateOut = {
      isPinned: !!(a.state.isPinned || b.state.isPinned),
      isArchived: !!(a.state.isArchived || b.state.isArchived),
      isSaved: !!(a.state.isSaved || b.state.isSaved),
      isLinked: !!(a.state.isLinked || b.state.isLinked),
      isImported: !!(a.state.isImported || b.state.isImported || isImportedId(chatId)),
      isDeleted: options.fullScan === true ? !!b.state.isDeleted : !!(a.state.isDeleted || b.state.isDeleted),
      syncState: trimString(b.state.syncState) || trimString(a.state.syncState),
    };
    // Canonical invariant: chatId && isSaved ⟹ isLinked
    if (stateOut.isSaved && chatId) {
      stateOut.isLinked = true;
    }

    let linkedAt = '';
    let linkedFrom = '';
    let linkSourceHref = '';
    if (stateOut.isLinked) {
      linkedAt = trimString(a.linkedAt)
        || trimString(b.linkedAt)
        || (isoOrEmpty(options.observedAt) || nowIso());
      linkedFrom = trimString(b.linkedFrom)
        || trimString(a.linkedFrom)
        || 'backfill:saved';
      linkSourceHref = trimString(b.linkSourceHref)
        || trimString(a.linkSourceHref)
        || href
        || normalizedHref
        || '';
    }

    const conflicts = [...(a.quality.conflicts || []), ...(b.quality.conflicts || [])].slice(-12);
    const inferredFields = uniqueStrings([...(a.quality.inferredFields || []), ...(b.quality.inferredFields || [])]);
    const confidence = trimString(b.quality.confidence) || trimString(a.quality.confidence);

    const previewOut = {
      firstQ: trimString(b.preview.firstQ) || trimString(a.preview.firstQ),
      firstA: trimString(b.preview.firstA) || trimString(a.preview.firstA),
      lastQ: trimString(b.preview.lastQ) || trimString(a.preview.lastQ),
      lastA: trimString(b.preview.lastA) || trimString(a.preview.lastA),
      updatedAt: pickNewerIso(a.preview.updatedAt, b.preview.updatedAt),
    };

    return sanitizeRecord({
      schemaVersion: SCHEMA_VERSION,
      chatId,
      href,
      normalizedHref,
      title: titlePick.title,
      titleSource: titlePick.source,
      displayTitle,
      sourceTitle,
      pageTitle,
      originalTitle,
      createdAt,
      firstSeenAt,
      lastSeenAt,
      updatedAt,
      lastMessageAt,
      lastOpenedAt,
      snapshotId,
      lastSnapshotId: lastSnapshotId || snapshotId,
      latestSnapshotId: lastSnapshotId || snapshotId,
      snapshotCount,
      messageCount,
      turnCount,
      answerCount,
      userTurnCount,
      assistantTurnCount,
      source: { first: sourceFirst, seenFrom },
      project: { projectId, projectName },
      organization: { folderId, categoryId, tagIds, labelIds },
      state: stateOut,
      linkedAt,
      linkedFrom,
      linkSourceHref,
      quality: { confidence, inferredFields, conflicts },
      preview: previewOut,
    }, chatId);
  }

  // ── View derivation (record-shapes.md) ──────────────────────────────────
  // Derives the view enum from state + chatId + state.isImported. Frozen at
  // four values: 'saved' | 'linked' | 'recents' | 'imported'.
  function deriveRecordView(record) {
    const r = sanitizeRecord(record);
    if (r.state.isImported && r.state.isSaved) return 'imported';
    if (r.state.isSaved && r.chatId) return 'saved';
    if (r.state.isLinked && r.chatId) return 'linked';
    return 'recents';
  }

  // ── Dedupe key ───────────────────────────────────────────────────────────
  // Returns the canonical dedupe key for a record per record-shapes.md:
  //   primary:   chatId                  (when non-empty)
  //   secondary: normalizedHref          (when chatId empty)
  //   tertiary:  snapshot:<latestSnapshotId> (imported-only fallback)
  function getRecordDedupeKey(record) {
    const r = sanitizeRecord(record);
    if (r.chatId) return `chatId:${r.chatId}`;
    if (r.normalizedHref) return `href:${r.normalizedHref}`;
    // latestSnapshotId isn't a sanitized field today (callers may attach it).
    const latest = trimString(record?.latestSnapshotId);
    if (latest) return `snap:${latest}`;
    return '';
  }

  // ── repairLinkedFlag (pure) ──────────────────────────────────────────────
  // Pure form: takes a records-by-id map, returns a new map with the
  // invariant applied plus a {scanned, updated, updatedIds} report. Callers
  // are responsible for persistence and event emission.
  function repairLinkedFlag(recordsById, options = {}) {
    const src = (recordsById && typeof recordsById === 'object') ? recordsById : {};
    const out = Object.create(null);
    let updated = 0;
    const updatedIds = [];
    const observedAt = isoOrEmpty(options.observedAt) || nowIso();

    for (const [id, rec] of Object.entries(src)) {
      const sane = sanitizeRecord(rec, id);
      if (!sane.chatId || !sane.state.isSaved || sane.state.isLinked) {
        out[id] = sane;
        continue;
      }
      const linkedAt = trimString(sane.linkedAt)
        || trimString(sane.firstSeenAt)
        || trimString(sane.createdAt)
        || observedAt;
      const linkedFrom = trimString(sane.linkedFrom) || 'backfill:saved';
      const linkSourceHref = trimString(sane.linkSourceHref)
        || trimString(sane.href)
        || trimString(sane.normalizedHref)
        || '';
      const patched = mergeRecord(sane, sanitizeRecord({
        chatId: sane.chatId,
        state: { ...sane.state, isLinked: true },
        linkedAt,
        linkedFrom,
        linkSourceHref,
      }, sane.chatId), { source: 'backfill:saved' });
      out[id] = patched;
      updated += 1;
      updatedIds.push(sane.chatId);
    }
    return { recordsById: out, scanned: Object.keys(src).length, updated, updatedIds };
  }

  // ── Disk-shape adoption ──────────────────────────────────────────────────
  // Converts a raw on-disk snapshot (whatever a previous build wrote) into
  // the canonical in-memory shape. Pure — no I/O; callers do the I/O.
  function adoptShape(raw) {
    const ts = nowIso();
    const out = {
      schemaVersion: SCHEMA_VERSION,
      recordsById: Object.create(null),
      idByHref: Object.create(null),
      tombstonesById: Object.create(null),
      meta: { createdAt: ts, updatedAt: ts, recordCount: 0, lastCompactedAt: '' },
    };
    if (!raw || typeof raw !== 'object') return out;
    out.schemaVersion = Number(raw.schemaVersion) || SCHEMA_VERSION;
    if (raw.recordsById && typeof raw.recordsById === 'object') {
      for (const [id, rec] of Object.entries(raw.recordsById)) {
        const safeId = normalizeChatId(id);
        if (!safeId) continue;
        out.recordsById[safeId] = sanitizeRecord(rec, safeId);
      }
    } else {
      // Studio legacy snapshot: a flat `{ [chatId]: legacyRecord }` map with
      // no recordsById wrapper. Try to migrate that too.
      let legacyHit = false;
      for (const [id, rec] of Object.entries(raw)) {
        if (typeof rec !== 'object' || !rec) continue;
        if (id === 'schemaVersion' || id === 'meta' || id === 'idByHref' || id === 'tombstonesById') continue;
        const safeId = normalizeChatId(id);
        if (!safeId) continue;
        out.recordsById[safeId] = sanitizeRecord(rec, safeId);
        legacyHit = true;
      }
      if (legacyHit) out.meta.updatedAt = nowIso();
    }
    if (raw.idByHref && typeof raw.idByHref === 'object') {
      for (const [href, id] of Object.entries(raw.idByHref)) {
        const nh = normalizeHref(href);
        const safeId = normalizeChatId(id);
        if (!nh || !safeId || !out.recordsById[safeId]) continue;
        out.idByHref[nh] = safeId;
      }
    } else {
      // Rebuild idByHref from records when the disk shape didn't carry it.
      for (const [safeId, rec] of Object.entries(out.recordsById)) {
        const nh = rec.normalizedHref;
        if (nh) out.idByHref[nh] = safeId;
      }
    }
    if (raw.tombstonesById && typeof raw.tombstonesById === 'object') {
      for (const [id, tomb] of Object.entries(raw.tombstonesById)) {
        const safeId = normalizeChatId(id);
        if (!safeId) continue;
        out.tombstonesById[safeId] = sanitizeTombstone(tomb, safeId);
      }
    }
    if (raw.meta && typeof raw.meta === 'object') {
      out.meta.createdAt = trimString(raw.meta.createdAt) || out.meta.createdAt;
      out.meta.updatedAt = trimString(raw.meta.updatedAt) || out.meta.updatedAt;
      out.meta.lastCompactedAt = trimString(raw.meta.lastCompactedAt) || '';
    }
    out.meta.recordCount = Object.keys(out.recordsById).length;
    return out;
  }

  // ── Public surface ───────────────────────────────────────────────────────
  const RegistryCore = Object.freeze({
    __phase: PHASE,
    __version: '1.0.0',
    SCHEMA_VERSION,
    TITLE_SOURCE_RANK,

    // primitives
    trimString,
    dateMs,
    isoOrEmpty,
    pickOlderIso,
    pickNewerIso,
    uniqueStrings,
    isFiniteNumber,
    maxNum,

    // identity / href
    parseChatIdFromHref,
    normalizeChatId,
    isImportedId,
    normalizeHref,
    hrefForChatId,

    // title rank
    chooseBetterTitle,
    isPlaceholderTitle,
    titleSourceRank,

    // sanitize
    sanitizeState,
    sanitizeRecord,
    sanitizeTombstone,

    // merge
    diffFields,
    mergeRecord,

    // derive
    deriveRecordView,
    getRecordDedupeKey,

    // repair
    repairLinkedFlag,

    // disk-shape adoption (still pure — caller does I/O)
    adoptShape,
  });

  H2O.Library.RegistryCore = RegistryCore;
})();
