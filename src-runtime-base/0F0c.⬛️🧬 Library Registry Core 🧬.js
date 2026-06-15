// ==H2O Module==
// @h2o-id             0f0c.library_registry_core
// @name               0F0c.⬛️🧬 Library Registry Core 🧬
// @namespace          H2O.Premium.CGX.library_registry_core
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260515-000010
// @description        Phase 2A — native runtime copy of the shared pure Chat Registry merge/normalize logic. Publishes window.H2O.Library.RegistryCore. Body is byte-identical to shared/library/chat-registry-core.js and to the Studio mirror surfaces/studio/S0F0c. — keep the three in sync. Loads at 0F0c so it precedes 0F1g (native Chat Registry) at boot.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

// MIRROR — body must match shared/library/chat-registry-core.js and
// surfaces/studio/S0F0c. exactly. Edit the canonical in shared/ first, then
// copy the body here. A future Phase 3 will replace this duplication with a
// proper shared-loader pipeline.

(() => {
  'use strict';

  const W = (typeof window !== 'undefined') ? window : globalThis;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.Library.RegistryCore && H2O.Library.RegistryCore.__phase === '2A') return;

  const SCHEMA_VERSION = 1;
  const PHASE = '2A';

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

  function sanitizeRecord(rec, fallbackChatId = '') {
    const r = (rec && typeof rec === 'object') ? rec : {};
    const opts = (typeof fallbackChatId === 'object' && fallbackChatId)
      ? fallbackChatId
      : { fallbackChatId: ensureString(fallbackChatId) };
    const fbId = ensureString(opts.fallbackChatId);

    const chatId = normalizeChatId(r.chatId || r.id || fbId);
    const href = trimString(r.href);
    const normalizedHref = trimString(r.normalizedHref) || normalizeHref(href || hrefForChatId(chatId));

    const lastSeenAtRaw = isFiniteNumber(r.lastSeenTs) && r.lastSeenTs > 0
      ? new Date(r.lastSeenTs).toISOString()
      : r.lastSeenAt;
    const flatDeleted = (r.deleted === true) && !(r.state && typeof r.state === 'object');

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

      turnCount: isFiniteNumber(r.turnCount) ? Math.max(0, Math.trunc(r.turnCount)) : 0,
      answerCount: isFiniteNumber(r.answerCount) ? Math.max(0, Math.trunc(r.answerCount)) : 0,
      userTurnCount: isFiniteNumber(r.userTurnCount) ? Math.max(0, Math.trunc(r.userTurnCount)) : 0,

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

  function diffFields(prev, next) {
    const changed = [];
    const top = ['title','titleSource','displayTitle','sourceTitle','pageTitle','originalTitle','createdAt','firstSeenAt','lastSeenAt','updatedAt','lastMessageAt','lastOpenedAt','turnCount','answerCount','userTurnCount','href','normalizedHref','linkedAt','linkedFrom','linkSourceHref'];
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
    const turnCount = options.fullScan === true ? (b.turnCount || 0) : (maxNum(a.turnCount, b.turnCount) || 0);
    const answerCount = options.fullScan === true ? (b.answerCount || 0) : (maxNum(a.answerCount, b.answerCount) || 0);
    const userTurnCount = options.fullScan === true ? (b.userTurnCount || 0) : (maxNum(a.userTurnCount, b.userTurnCount) || 0);
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
      turnCount,
      answerCount,
      userTurnCount,
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

  function deriveRecordView(record) {
    const r = sanitizeRecord(record);
    if (r.state.isImported && r.state.isSaved) return 'imported';
    if (r.state.isSaved && r.chatId) return 'saved';
    if (r.state.isLinked && r.chatId) return 'linked';
    return 'recents';
  }

  function getRecordDedupeKey(record) {
    const r = sanitizeRecord(record);
    if (r.chatId) return `chatId:${r.chatId}`;
    if (r.normalizedHref) return `href:${r.normalizedHref}`;
    const latest = trimString(record?.latestSnapshotId);
    if (latest) return `snap:${latest}`;
    return '';
  }

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

  const RegistryCore = Object.freeze({
    __phase: PHASE,
    __version: '1.0.0',
    SCHEMA_VERSION,
    TITLE_SOURCE_RANK,

    trimString,
    dateMs,
    isoOrEmpty,
    pickOlderIso,
    pickNewerIso,
    uniqueStrings,
    isFiniteNumber,
    maxNum,

    parseChatIdFromHref,
    normalizeChatId,
    isImportedId,
    normalizeHref,
    hrefForChatId,

    chooseBetterTitle,
    isPlaceholderTitle,
    titleSourceRank,

    sanitizeState,
    sanitizeRecord,
    sanitizeTombstone,

    diffFields,
    mergeRecord,

    deriveRecordView,
    getRecordDedupeKey,

    repairLinkedFlag,

    adoptShape,
  });

  H2O.Library.RegistryCore = RegistryCore;
})();
