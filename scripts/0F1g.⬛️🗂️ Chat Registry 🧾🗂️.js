// ==H2O Module==
// @h2o-id             0f1g.chat_registry
// @name               0F1g.⬛️🗂️ Chat Registry 🧾🗂️
// @namespace          H2O.Premium.CGX.chat_registry
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260510-000001
// @description        Chat Registry: canonical durable Chat Registry for Library/Explorer chat metadata. Phase 1 — additive truth layer with stable H2O.ChatRegistry public API. Library Index can consume this as a derived projection in a future phase.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /*
   * 0F1g — Chat Registry (durable source-of-truth for chat metadata)
   *
   * OWNS:
   *   - Canonical per-chat record store keyed by chatId (truth layer).
   *   - normalizedHref → chatId secondary index for href-based dedupe.
   *   - Tombstones for deleted/missing chats (so passive rescans cannot resurrect them).
   *   - Merge policy that protects rich metadata (folder/category/tag/label) from
   *     being clobbered by passive sidebar scans.
   *   - Subscription bus for downstream consumers (Library Index, Insights, future UIs).
   *
   * MUST NOT OWN:
   *   - Search / filter / facet computation                → 0F1c Library Index
   *   - Explorer/Analytics rendering                       → 0F1d Library Insights
   *   - Library page route / sidebar shell                 → 0F1b Library Workspace
   *   - Storage adapter selection / quota probes           → 0F1e Library Store
   *   - Folder / category / tag / label catalogs           → 0F3a / 0F4a / 0F5a / 0F6a
   *
   * PHASE 1 SCOPE (this file):
   *   - Stand up H2O.ChatRegistry as the canonical truth layer. Persist to localStorage
   *     under h2o:library:chat-registry:v1 with a debounced flush.
   *   - Do NOT migrate 0F1c yet. 0F1c continues to maintain its own known-chat registry
   *     and is the consumer surface today; in Phase 2 it will be rewired to derive its
   *     normalized index from H2O.ChatRegistry.
   *
   * DESIGN NOTES:
   *   - Reads are synchronous (in-memory cache); writes update the cache and schedule a
   *     debounced localStorage flush. ready Promise resolves once the boot read completes.
   *   - Library Store (0F1e) is async and may not be durable in every runtime. Phase 1
   *     deliberately stays on localStorage (the same tier 0F1c uses today) so this module
   *     ships with no hard async dependency. A Library Store mirror can be added in Phase 2.
   *   - chatId is immutable. normalizedHref is the secondary key. Both are validated
   *     defensively at every public-API boundary so callers cannot poison the maps.
   */

  const W = window;
  const H2O = (W.H2O = W.H2O || {});

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'h2o:library:chat-registry:v1';
  const STORAGE_FLUSH_DEBOUNCE_MS = 140;
  const EVENT_NAME = 'chat-registry:changed';
  const TAG = '[H2O.ChatRegistry]';

  const BOOT_LOCK = '__h2oChatRegistryBooted_v1_0_0';
  const BOOT_TIMER_SET = '__h2oChatRegistryBootTimers_v1_0_0';
  const BOOT_MAX_ATTEMPTS = 160;

  if (H2O.ChatRegistry && H2O.ChatRegistry.version) return; // idempotent

  /* ─── diag (mirrors 0F1a / 0F1c style) ─── */
  const diag = {
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 160,
    errMax: 40,
  };
  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), e: String(e?.stack || e || '') });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  /* ─── Phase 2A: shared pure module ──────────────────────────────────────
   *
   * The pure functions below (string/date helpers, chatId/href normalization,
   * title rank, sanitize, merge, diff, repair, adoptShape) live in the shared
   * module at shared/library/chat-registry-core.js (loaded into this surface
   * by scripts/0F0c.). We delegate to it instead of carrying our own copy of
   * the logic so native and Studio can never drift.
   *
   * The local wrappers below preserve the previous in-file names so callers
   * inside this file (and via H2O.ChatRegistry's public surface) don't change.
   * If the shared module is unavailable for any reason, the wrappers fall back
   * to safe no-ops or empty defaults — boot will still succeed, with reduced
   * fidelity, rather than crash. */
  function core() { return H2O.Library?.RegistryCore || null; }

  function ensureString(v) { return (typeof v === 'string') ? v : (v == null ? '' : String(v)); }
  function trimString(v) {
    const c = core();
    return c ? c.trimString(v) : ensureString(v).trim();
  }
  function nowMs() { return Date.now(); }
  function nowIso() { try { return new Date().toISOString(); } catch { return ''; } }

  function isFiniteNumber(n) {
    const c = core();
    return c ? c.isFiniteNumber(n) : (typeof n === 'number' && Number.isFinite(n));
  }
  function maxNum(a, b) {
    const c = core();
    if (c) return c.maxNum(a, b);
    const ax = isFiniteNumber(a) ? a : -Infinity;
    const bx = isFiniteNumber(b) ? b : -Infinity;
    if (ax === -Infinity && bx === -Infinity) return undefined;
    return ax >= bx ? ax : bx;
  }

  function dateMs(value) {
    const c = core();
    return c ? c.dateMs(value) : 0;
  }
  function isoOrEmpty(value) {
    const c = core();
    if (c) return c.isoOrEmpty(value);
    const ms = dateMs(value);
    if (!ms) return '';
    try { return new Date(ms).toISOString(); } catch { return ''; }
  }
  function pickOlderIso(a, b) {
    const c = core();
    return c ? c.pickOlderIso(a, b) : (a || b || '');
  }
  function pickNewerIso(a, b) {
    const c = core();
    return c ? c.pickNewerIso(a, b) : (a || b || '');
  }
  function uniqueStrings(rows) {
    const c = core();
    return c ? c.uniqueStrings(rows) : (Array.isArray(rows) ? rows.slice() : []);
  }

  /* ─── chatId / href normalization (delegated to shared core) ─── */
  function parseChatIdFromHref(input) {
    const c = core();
    if (c) return c.parseChatIdFromHref(input);
    const raw = trimString(input);
    if (!raw) return '';
    const m = raw.match(/\/c\/([A-Za-z0-9._:-]+)/);
    return m ? m[1] : '';
  }
  function normalizeChatId(input) {
    const c = core();
    if (c) return c.normalizeChatId(input);
    return trimString(input);
  }
  function isImportedId(id) {
    const c = core();
    return c ? c.isImportedId(id) : /^imported[-_:]/i.test(trimString(id));
  }
  function normalizeHref(href) {
    const c = core();
    if (c) return c.normalizeHref(href);
    return trimString(href);
  }
  function hrefForChatId(chatId) {
    const c = core();
    return c ? c.hrefForChatId(chatId) : '';
  }

  /* ─── storage (sync localStorage; Library Store mirror is a Phase 2 concern) ─── */
  const storage = {
    readRaw(key) {
      try { return W.localStorage?.getItem(key); } catch { return null; }
    },
    writeRaw(key, value) {
      try { W.localStorage?.setItem(key, value); return true; }
      catch (e) { err(`storage-set:${key}`, e); return false; }
    },
    delRaw(key) {
      try { W.localStorage?.removeItem(key); return true; } catch { return false; }
    },
    readJson(key, fallback = null) {
      const raw = storage.readRaw(key);
      if (raw == null) return fallback;
      try { return JSON.parse(raw); }
      catch (e) { err(`storage-parse:${key}`, e); return fallback; }
    },
    writeJson(key, value) {
      try { return storage.writeRaw(key, JSON.stringify(value)); }
      catch (e) { err(`storage-stringify:${key}`, e); return false; }
    },
  };

  /* ─── module state (in-memory cache + flush bookkeeping) ─── */
  const state = {
    booted: false,
    loaded: false,
    recordsById: Object.create(null),
    idByHref: Object.create(null),
    tombstonesById: Object.create(null),
    meta: {
      createdAt: '',
      updatedAt: '',
      recordCount: 0,
      lastCompactedAt: '',
    },
    flushTimer: 0,
    subscribers: new Set(),
    readyResolve: null,
    readyPromise: null,
    lastReadAt: 0,
    lastWriteAt: 0,
    writes: 0,
    flushes: 0,
  };
  state.readyPromise = new Promise((resolve) => { state.readyResolve = resolve; });

  /* ─── load from disk ─── */
  function emptyShape() {
    const ts = nowIso();
    return {
      schemaVersion: SCHEMA_VERSION,
      recordsById: Object.create(null),
      idByHref: Object.create(null),
      tombstonesById: Object.create(null),
      meta: {
        createdAt: ts,
        updatedAt: ts,
        recordCount: 0,
        lastCompactedAt: '',
      },
    };
  }

  // adoptShape now delegates to the shared core when available so disk-loaded
  // snapshots are normalized identically on both surfaces. The shared
  // implementation also handles legacy flat snapshot maps (Studio-style) for
  // forward compatibility — harmless on native because native always wrote
  // the wrapped shape.
  function adoptShape(raw) {
    const c = core();
    if (c) return c.adoptShape(raw);
    return emptyShape();
  }

  function loadFromDisk() {
    const raw = storage.readJson(STORAGE_KEY, null);
    const shape = adoptShape(raw);
    state.recordsById = shape.recordsById;
    state.idByHref = shape.idByHref;
    state.tombstonesById = shape.tombstonesById;
    state.meta = shape.meta;
    state.loaded = true;
    state.lastReadAt = nowMs();
    step('load', `records=${state.meta.recordCount}`);
  }

  function flushToDisk(reason = 'flush') {
    if (!state.loaded) return false;
    const payload = {
      schemaVersion: SCHEMA_VERSION,
      recordsById: state.recordsById,
      idByHref: state.idByHref,
      tombstonesById: state.tombstonesById,
      meta: {
        ...state.meta,
        updatedAt: nowIso(),
        recordCount: Object.keys(state.recordsById).length,
      },
    };
    state.meta = payload.meta;
    const ok = storage.writeJson(STORAGE_KEY, payload);
    if (ok) {
      state.lastWriteAt = nowMs();
      state.flushes += 1;
      step('flush', `${reason} | records=${payload.meta.recordCount}`);
    }
    return ok;
  }

  function scheduleFlush(reason = '') {
    if (state.flushTimer) return;
    const timer = W.setTimeout(() => {
      state.flushTimer = 0;
      try { flushToDisk(reason); } catch (e) { err('flush', e); }
    }, STORAGE_FLUSH_DEBOUNCE_MS);
    state.flushTimer = timer;
  }

  /* ─── record sanitization (delegated to shared core) ─── */
  // Normalizes any record-shaped object (from disk, callers, or merges) into
  // the canonical ChatRecord shape. The shared module's sanitizeRecord is the
  // single source of truth — same call on Studio. Local wrapper preserves the
  // older fallbackChatId signature.
  function sanitizeRecord(rec, fallbackChatId = '') {
    const c = core();
    if (c) return c.sanitizeRecord(rec, fallbackChatId);
    // Defensive fallback — empty record. Should never run in practice because
    // 0F0c loads before 0F1g.
    return { schemaVersion: SCHEMA_VERSION, chatId: '', href: '', normalizedHref: '', title: '', titleSource: '', createdAt: '', firstSeenAt: '', lastSeenAt: '', updatedAt: '', lastMessageAt: '', lastOpenedAt: '', turnCount: 0, answerCount: 0, userTurnCount: 0, source: { first: '', seenFrom: [] }, project: { projectId: '', projectName: '' }, organization: { folderId: '', categoryId: '', tagIds: [], labelIds: [] }, state: { isPinned: false, isArchived: false, isSaved: false, isLinked: false, isImported: false, isDeleted: false, syncState: '' }, linkedAt: '', linkedFrom: '', linkSourceHref: '', quality: { confidence: '', inferredFields: [], conflicts: [] }, preview: { firstQ: '', firstA: '', lastQ: '', lastA: '', updatedAt: '' } };
  }

  function sanitizeTombstone(tomb, fallbackChatId = '') {
    const c = core();
    if (c) return c.sanitizeTombstone(tomb, fallbackChatId);
    return { chatId: '', reason: 'unknown', deletedAt: nowIso(), lastSeenAt: '', href: '' };
  }

  /* ─── title strength heuristic (delegated to shared core) ─── */
  const TITLE_SOURCE_RANK = (core() && core().TITLE_SOURCE_RANK) || Object.freeze({
    manual: 100, archive: 90, import: 88, snapshot: 85, workbench: 82,
    title: 70, sidebar: 60, project: 55, inferred: 30, derived: 10,
    unknown: 5, '': 0,
  });
  function isPlaceholderTitle(t) {
    const c = core();
    return c ? c.isPlaceholderTitle(t) : !trimString(t);
  }
  function titleSourceRank(s) {
    const c = core();
    return c ? c.titleSourceRank(s) : 0;
  }
  function chooseBetterTitle(prevTitle, prevSource, nextTitle, nextSource) {
    const c = core();
    if (c) return c.chooseBetterTitle(prevTitle, prevSource, nextTitle, nextSource);
    return { title: trimString(nextTitle) || trimString(prevTitle), source: trimString(nextSource) || trimString(prevSource) };
  }

  /* ─── merge (delegated to shared core) ─── */
  // The shared module owns merge / diff / org-array / org-scalar logic. Native
  // and Studio now produce byte-identical merged records for identical inputs.
  function diffFields(prev, next) {
    const c = core();
    return c ? c.diffFields(prev, next) : [];
  }
  function mergeRecord(prev, incoming, options = {}) {
    const c = core();
    if (c) return c.mergeRecord(prev, incoming, options);
    return sanitizeRecord(incoming || prev || {});
  }

  /* ─── index maintenance ─── */
  function indexRecord(prev, next) {
    const id = next.chatId;
    if (!id) return;
    state.recordsById[id] = next;
    if (prev && prev.normalizedHref && prev.normalizedHref !== next.normalizedHref) {
      if (state.idByHref[prev.normalizedHref] === id) delete state.idByHref[prev.normalizedHref];
    }
    if (next.normalizedHref) state.idByHref[next.normalizedHref] = id;
    state.meta.recordCount = Object.keys(state.recordsById).length;
  }

  function unindexRecord(rec) {
    const id = rec?.chatId;
    if (!id) return;
    if (state.recordsById[id]) delete state.recordsById[id];
    if (rec.normalizedHref && state.idByHref[rec.normalizedHref] === id) {
      delete state.idByHref[rec.normalizedHref];
    }
    state.meta.recordCount = Object.keys(state.recordsById).length;
  }

  /* ─── notifications ─── */
  function emitChange(action, chatIds, source, changedFields) {
    const detail = {
      action: trimString(action) || 'change',
      chatIds: uniqueStrings(Array.isArray(chatIds) ? chatIds : [chatIds]),
      source: trimString(source),
      changedFields: uniqueStrings(changedFields),
      ts: nowMs(),
    };
    // local subscribers first (cheap, in-process)
    state.subscribers.forEach((fn) => {
      try { fn(detail); } catch (e) { err('subscriber', e); }
    });
    // H2O event bus (preferred when available) + legacy DOM dispatch as fallback
    try {
      if (H2O.events && typeof H2O.events.emit === 'function') {
        H2O.events.emit(`evt:h2o:${EVENT_NAME}`, detail);
        return;
      }
    } catch (e) { err('emit:bus', e); }
    try {
      W.dispatchEvent(new CustomEvent(`evt:h2o:${EVENT_NAME}`, { detail }));
      W.dispatchEvent(new CustomEvent(`h2o:${EVENT_NAME}`, { detail }));
    } catch (e) { err('emit:dom', e); }
  }

  /* ─── public API surface ─── */
  function getRecord(chatIdInput) {
    const id = normalizeChatId(chatIdInput);
    if (!id) return null;
    return state.recordsById[id] || null;
  }

  function getRecordByHref(hrefInput) {
    const nh = normalizeHref(hrefInput);
    if (!nh) return null;
    const id = state.idByHref[nh];
    return id ? (state.recordsById[id] || null) : null;
  }

  function listRecords(options = {}) {
    const all = Object.values(state.recordsById);
    const opts = options || {};
    let rows = all;
    if (opts.includeDeleted !== true) {
      rows = rows.filter((r) => !r.state?.isDeleted);
    }
    if (typeof opts.filter === 'function') {
      rows = rows.filter((r) => {
        try { return !!opts.filter(r); } catch { return false; }
      });
    }
    if (opts.sort === 'lastSeen' || opts.sort === 'lastSeenDesc') {
      rows = rows.slice().sort((a, b) => dateMs(b.lastSeenAt) - dateMs(a.lastSeenAt));
    } else if (opts.sort === 'lastMessage' || opts.sort === 'lastMessageDesc') {
      rows = rows.slice().sort((a, b) => dateMs(b.lastMessageAt) - dateMs(a.lastMessageAt));
    } else if (opts.sort === 'title') {
      rows = rows.slice().sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    }
    if (Number.isFinite(opts.limit) && opts.limit > 0) rows = rows.slice(0, Math.trunc(opts.limit));
    return rows;
  }

  function resolveChatId(input) {
    if (input == null) return '';
    if (typeof input === 'object') {
      return normalizeChatId(input.chatId || input.id || '') || parseChatIdFromHref(input.href || input.normalizedHref || '');
    }
    const s = ensureString(input);
    return normalizeChatId(s) || parseChatIdFromHref(s);
  }

  function buildPatchedRecord(prevRec, input) {
    const incoming = (input && typeof input === 'object') ? input : {};
    const id = normalizeChatId(incoming.chatId || incoming.id || prevRec?.chatId || '')
      || (incoming.href ? parseChatIdFromHref(incoming.href) : '');
    if (!id) return null;
    const stamped = {
      ...incoming,
      chatId: id,
      href: trimString(incoming.href || prevRec?.href || hrefForChatId(id)),
      normalizedHref: normalizeHref(incoming.href || incoming.normalizedHref || prevRec?.normalizedHref || hrefForChatId(id)),
    };
    return stamped;
  }

  function applyMerge(rawInput, options = {}) {
    if (!state.loaded) loadFromDisk();
    const stamped = buildPatchedRecord(getRecord(normalizeChatId(rawInput?.chatId || rawInput?.id || '')) || null, rawInput);
    if (!stamped) return null;
    const id = stamped.chatId;
    // Tombstone gate: ANY upsert is blocked unless options.allowResurrect === true.
    // The caller must explicitly opt in to resurrect; otherwise the tombstone stands and
    // both passive and active writes are dropped silently. This is stricter than a
    // passive-only gate — it matches the semantics of markDeleted as a deliberate user
    // action that should not be undone by either casual sightings or routine archive scans.
    const tomb = state.tombstonesById[id];
    if (tomb && options.allowResurrect !== true) {
      step('skip-tombstone', id);
      return null;
    }
    if (tomb && options.allowResurrect === true) {
      delete state.tombstonesById[id];
      // Clear the prev record's isDeleted / syncState so the merge produces a non-deleted
      // record — UNLESS the incoming patch explicitly sets state.isDeleted === true. The
      // sticky-on-true rule for booleans would otherwise keep isDeleted=true forever once
      // markDeleted ran, even after an explicit resurrect.
      const prevRec = state.recordsById[id];
      const incomingExplicitlyDeleted = !!(rawInput && typeof rawInput === 'object'
        && rawInput.state && rawInput.state.isDeleted === true);
      if (prevRec && !incomingExplicitlyDeleted) {
        state.recordsById[id] = {
          ...prevRec,
          state: { ...prevRec.state, isDeleted: false, syncState: '' },
        };
      }
      step('resurrect', id);
    }
    const prev = state.recordsById[id] || null;
    // Stamp seenFrom + first/lastSeen if a source label was provided.
    const sourceLabel = trimString(options.source);
    const observedAtIso = isoOrEmpty(options.observedAt) || nowIso();
    const seedRec = sanitizeRecord(stamped, id);
    if (sourceLabel) {
      if (!seedRec.source.first) seedRec.source.first = prev?.source?.first || sourceLabel;
      seedRec.source.seenFrom = uniqueStrings([...(seedRec.source.seenFrom || []), sourceLabel]);
    }
    if (!seedRec.firstSeenAt) seedRec.firstSeenAt = prev?.firstSeenAt || observedAtIso;
    if (!seedRec.lastSeenAt) seedRec.lastSeenAt = observedAtIso;
    if (!seedRec.updatedAt) seedRec.updatedAt = observedAtIso;
    const merged = mergeRecord(prev, seedRec, options);
    const changed = prev ? diffFields(prev, merged) : ['<created>'];
    indexRecord(prev, merged);
    return { prev, next: merged, changed };
  }

  function upsertRecord(input, options = {}) {
    const res = applyMerge(input, options);
    if (!res) return null;
    scheduleFlush('upsert');
    if (res.changed.length) emitChange('upsert', [res.next.chatId], options.source, res.changed);
    return res.next;
  }

  function upsertMany(inputs, options = {}) {
    const list = Array.isArray(inputs) ? inputs : [];
    const out = [];
    const changedIds = [];
    const allChanged = new Set();
    list.forEach((input) => {
      const res = applyMerge(input, options);
      if (!res) return;
      out.push(res.next);
      if (res.changed.length) {
        changedIds.push(res.next.chatId);
        res.changed.forEach((f) => allChanged.add(f));
      }
    });
    if (out.length) scheduleFlush('upsert-many');
    if (changedIds.length) emitChange('upsert-many', changedIds, options.source, [...allChanged]);
    return out;
  }

  function patchRecord(chatIdInput, patch, options = {}) {
    const id = normalizeChatId(chatIdInput);
    if (!id) return null;
    const prev = state.recordsById[id];
    if (!prev) return null;
    const next = mergeRecord(prev, sanitizeRecord({ ...patch, chatId: id }, id), options);
    const changed = diffFields(prev, next);
    indexRecord(prev, next);
    if (changed.length) {
      scheduleFlush('patch');
      emitChange('patch', [id], options.source, changed);
    }
    return next;
  }

  function markSeen(chatIdOrHref, seenPatch = {}) {
    const id = resolveChatId(chatIdOrHref);
    if (!id) return null;
    const observedAt = isoOrEmpty(seenPatch?.observedAt) || nowIso();
    const sourceLabel = trimString(seenPatch?.source) || 'sighting';
    const partial = {
      ...seenPatch,
      chatId: id,
      lastSeenAt: observedAt,
    };
    return upsertRecord(partial, {
      source: sourceLabel,
      passive: seenPatch?.passive !== false,
      observedAt,
    });
  }

  function markMissing(chatIdInput, reason = 'missing') {
    const id = normalizeChatId(chatIdInput);
    if (!id) return null;
    const prev = state.recordsById[id];
    if (!prev) return null;
    const next = mergeRecord(prev, sanitizeRecord({
      chatId: id,
      state: { ...prev.state, syncState: 'missing' },
      quality: { ...prev.quality, conflicts: [{ kind: 'missing', reason: trimString(reason), ts: nowIso() }] },
    }, id));
    indexRecord(prev, next);
    scheduleFlush('mark-missing');
    emitChange('mark-missing', [id], 'registry', ['state.syncState']);
    return next;
  }

  function markDeleted(chatIdInput, reason = 'deleted') {
    const id = normalizeChatId(chatIdInput);
    if (!id) return null;
    const prev = state.recordsById[id];
    if (prev) {
      // Default merge (not fullScan): preserves organization metadata so the deleted
      // record still carries its folder/category/tags/labels for forensic views.
      // isDeleted is sticky-on-true under default merge, so it persists.
      const next = mergeRecord(prev, sanitizeRecord({
        chatId: id,
        state: { ...prev.state, isDeleted: true, syncState: 'deleted' },
      }, id));
      indexRecord(prev, next);
    }
    state.tombstonesById[id] = sanitizeTombstone({
      chatId: id,
      reason: trimString(reason) || 'deleted',
      deletedAt: nowIso(),
      lastSeenAt: prev?.lastSeenAt || '',
      href: prev?.href || hrefForChatId(id),
    }, id);
    scheduleFlush('mark-deleted');
    emitChange('mark-deleted', [id], 'registry', ['state.isDeleted','state.syncState']);
    return state.recordsById[id] || null;
  }

  function attachOrgScalar(chatIdInput, field, value, source = 'attach') {
    const id = normalizeChatId(chatIdInput);
    if (!id) return null;
    const prev = state.recordsById[id];
    if (!prev) return null;
    const next = mergeRecord(prev, sanitizeRecord({
      chatId: id,
      organization: { ...prev.organization, [field]: trimString(value) },
    }, id), { fullScan: true });
    const changed = diffFields(prev, next);
    indexRecord(prev, next);
    if (changed.length) {
      scheduleFlush(`attach-${field}`);
      emitChange(`attach-${field}`, [id], source, changed);
    }
    return next;
  }

  function attachFolder(chatId, folderId) { return attachOrgScalar(chatId, 'folderId', folderId, 'folders'); }
  function attachCategory(chatId, categoryId) { return attachOrgScalar(chatId, 'categoryId', categoryId, 'categories'); }

  function setOrgArray(chatIdInput, field, ids, source) {
    const id = normalizeChatId(chatIdInput);
    if (!id) return null;
    const prev = state.recordsById[id];
    if (!prev) return null;
    const next = mergeRecord(prev, sanitizeRecord({
      chatId: id,
      organization: { ...prev.organization, [field]: uniqueStrings(ids) },
    }, id), { fullScan: true });
    const changed = diffFields(prev, next);
    indexRecord(prev, next);
    if (changed.length) {
      scheduleFlush(`set-${field}`);
      emitChange(`set-${field}`, [id], source, changed);
    }
    return next;
  }

  function modifyOrgArray(chatIdInput, field, ids, mode, source) {
    const id = normalizeChatId(chatIdInput);
    if (!id) return null;
    const prev = state.recordsById[id];
    if (!prev) return null;
    const cur = uniqueStrings(prev.organization[field]);
    const incoming = uniqueStrings(ids);
    let nextList = cur;
    if (mode === 'add') {
      nextList = uniqueStrings([...cur, ...incoming]);
    } else if (mode === 'remove') {
      const drop = new Set(incoming.map((s) => s.toLowerCase()));
      nextList = cur.filter((s) => !drop.has(s.toLowerCase()));
    }
    const next = mergeRecord(prev, sanitizeRecord({
      chatId: id,
      organization: { ...prev.organization, [field]: nextList },
    }, id), { fullScan: true });
    const changed = diffFields(prev, next);
    indexRecord(prev, next);
    if (changed.length) {
      scheduleFlush(`${mode}-${field}`);
      emitChange(`${mode}-${field}`, [id], source, changed);
    }
    return next;
  }

  function setTags(chatId, tagIds) { return setOrgArray(chatId, 'tagIds', tagIds, 'tags'); }
  function addTags(chatId, tagIds) { return modifyOrgArray(chatId, 'tagIds', tagIds, 'add', 'tags'); }
  function removeTags(chatId, tagIds) { return modifyOrgArray(chatId, 'tagIds', tagIds, 'remove', 'tags'); }
  function setLabels(chatId, labelIds) { return setOrgArray(chatId, 'labelIds', labelIds, 'labels'); }
  function addLabels(chatId, labelIds) { return modifyOrgArray(chatId, 'labelIds', labelIds, 'add', 'labels'); }
  function removeLabels(chatId, labelIds) { return modifyOrgArray(chatId, 'labelIds', labelIds, 'remove', 'labels'); }

  /* ─── stats / health / repair ─── */
  function getStats() {
    const records = Object.values(state.recordsById);
    let saved = 0, archived = 0, pinned = 0, imported = 0, deleted = 0, withFolder = 0, withCategory = 0, withTags = 0, withLabels = 0, withPreview = 0, withAnswerCount = 0;
    for (const r of records) {
      if (r.state?.isSaved) saved += 1;
      if (r.state?.isArchived) archived += 1;
      if (r.state?.isPinned) pinned += 1;
      if (r.state?.isImported) imported += 1;
      if (r.state?.isDeleted) deleted += 1;
      if (r.organization?.folderId) withFolder += 1;
      if (r.organization?.categoryId) withCategory += 1;
      if ((r.organization?.tagIds || []).length) withTags += 1;
      if ((r.organization?.labelIds || []).length) withLabels += 1;
      const p = r.preview || {};
      if (p.firstQ || p.firstA || p.lastQ || p.lastA) withPreview += 1;
      if ((r.answerCount || 0) > 0) withAnswerCount += 1;
    }
    return {
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      storageKey: STORAGE_KEY,
      booted: state.booted,
      loaded: state.loaded,
      counts: {
        records: records.length,
        hrefIndex: Object.keys(state.idByHref).length,
        tombstones: Object.keys(state.tombstonesById).length,
        saved, archived, pinned, imported, deleted,
        withFolder, withCategory, withTags, withLabels,
        withPreview, withAnswerCount,
      },
      meta: { ...state.meta },
      io: {
        lastReadAt: state.lastReadAt,
        lastWriteAt: state.lastWriteAt,
        flushes: state.flushes,
      },
      subscribers: state.subscribers.size,
    };
  }

  function verifyHealth() {
    const issues = [];
    const ids = Object.keys(state.recordsById);
    for (const id of ids) {
      const r = state.recordsById[id];
      if (!r || typeof r !== 'object') {
        issues.push({ kind: 'invalid-record', id });
        continue;
      }
      if (!r.chatId) issues.push({ kind: 'missing-chatId', id });
      if (r.chatId && r.chatId !== id) issues.push({ kind: 'mismatched-chatId', id, recChatId: r.chatId });
      if (r.organization && !Array.isArray(r.organization.tagIds)) issues.push({ kind: 'invalid-tagIds-array', id });
      if (r.organization && !Array.isArray(r.organization.labelIds)) issues.push({ kind: 'invalid-labelIds-array', id });
      if (r.source && !Array.isArray(r.source.seenFrom)) issues.push({ kind: 'invalid-seenFrom-array', id });
      if (r.firstSeenAt && r.lastSeenAt && dateMs(r.firstSeenAt) > dateMs(r.lastSeenAt)) issues.push({ kind: 'firstSeen-after-lastSeen', id });
      if (r.createdAt && r.lastMessageAt && dateMs(r.createdAt) > dateMs(r.lastMessageAt) + 86400000) {
        issues.push({ kind: 'created-after-lastMessage', id });
      }
      if (r.preview && typeof r.preview !== 'object') issues.push({ kind: 'invalid-preview-shape', id });
      if (r.preview) {
        for (const f of ['firstQ','firstA','lastQ','lastA']) {
          if (r.preview[f] != null && typeof r.preview[f] !== 'string') {
            issues.push({ kind: `invalid-preview-${f}-type`, id });
          }
        }
      }
    }
    const seenHrefs = new Map();
    for (const [href, id] of Object.entries(state.idByHref)) {
      if (!state.recordsById[id]) issues.push({ kind: 'href-points-to-missing-chatId', href, id });
      if (seenHrefs.has(href)) {
        issues.push({ kind: 'duplicate-href', href, ids: [seenHrefs.get(href), id] });
      } else {
        seenHrefs.set(href, id);
      }
    }
    for (const [id, tomb] of Object.entries(state.tombstonesById)) {
      if (!tomb || !tomb.chatId) issues.push({ kind: 'invalid-tombstone', id });
      const active = state.recordsById[id];
      if (active && !active.state?.isDeleted) {
        issues.push({ kind: 'tombstone-vs-active', id });
      }
    }
    return { ok: issues.length === 0, issues, checkedAt: nowIso(), recordCount: ids.length };
  }

  function repairIndex() {
    if (!state.loaded) loadFromDisk();
    const beforeHrefs = Object.keys(state.idByHref).length;
    const beforeRecords = Object.keys(state.recordsById).length;
    // Rebuild idByHref from recordsById (single source of truth).
    const nextHref = Object.create(null);
    for (const [id, rec] of Object.entries(state.recordsById)) {
      if (!rec || rec.chatId !== id) continue;
      const nh = trimString(rec.normalizedHref) || normalizeHref(rec.href || hrefForChatId(id));
      if (!nh) continue;
      nextHref[nh] = id;
    }
    state.idByHref = nextHref;
    // Drop tombstones whose record is still active and not flagged deleted (caller's choice
    // resolution: prefer the live record — tombstone is the ambiguous one here).
    const droppedTombstones = [];
    for (const [id, tomb] of Object.entries(state.tombstonesById)) {
      const active = state.recordsById[id];
      if (active && !active.state?.isDeleted) {
        droppedTombstones.push(id);
        delete state.tombstonesById[id];
      }
    }
    state.meta.lastCompactedAt = nowIso();
    state.meta.recordCount = Object.keys(state.recordsById).length;
    flushToDisk('repair-index');
    emitChange('repair', Object.keys(state.recordsById), 'registry', ['idByHref','tombstonesById']);
    return {
      ok: true,
      hrefsBefore: beforeHrefs,
      hrefsAfter: Object.keys(state.idByHref).length,
      recordsBefore: beforeRecords,
      recordsAfter: Object.keys(state.recordsById).length,
      droppedTombstones,
    };
  }

  /**
   * Phase 1 backfill: enforce `chatId && isSaved ⟹ isLinked` across the entire
   * registry, idempotently. Delegates the pure transformation to the shared
   * core (H2O.Library.RegistryCore.repairLinkedFlag), then applies the
   * resulting records back into the in-memory index, persists, and emits a
   * single 'repair-linked' change event. Returns { scanned, updated }.
   */
  function repairLinkedFlag() {
    if (!state.loaded) loadFromDisk();
    const c = core();
    if (!c) {
      step('repair-linked', 'no-core');
      return { scanned: Object.keys(state.recordsById).length, updated: 0 };
    }
    const beforeMap = state.recordsById;
    const { recordsById: afterMap, scanned, updated, updatedIds } = c.repairLinkedFlag(beforeMap);
    if (updated > 0) {
      for (const id of updatedIds) {
        const prev = beforeMap[id];
        const next = afterMap[id];
        indexRecord(prev, next);
      }
      scheduleFlush('repair-linked');
      emitChange('repair-linked', updatedIds, 'registry', [
        'state.isLinked', 'linkedAt', 'linkedFrom', 'linkSourceHref',
      ]);
    }
    step('repair-linked', `${updated}/${scanned}`);
    return { scanned, updated };
  }

  function exportSnapshot() {
    return {
      schemaVersion: SCHEMA_VERSION,
      version: VERSION,
      exportedAt: nowIso(),
      storageKey: STORAGE_KEY,
      recordsById: { ...state.recordsById },
      idByHref: { ...state.idByHref },
      tombstonesById: { ...state.tombstonesById },
      meta: { ...state.meta },
    };
  }

  function importSnapshot(snapshot, options = {}) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { ok: false, error: 'invalid-snapshot' };
    }
    const incoming = adoptShape(snapshot);
    const merge = options.mode !== 'replace';
    if (!merge) {
      state.recordsById = incoming.recordsById;
      state.idByHref = incoming.idByHref;
      state.tombstonesById = incoming.tombstonesById;
      state.meta = incoming.meta;
    } else {
      for (const [id, rec] of Object.entries(incoming.recordsById)) {
        const prev = state.recordsById[id] || null;
        const next = mergeRecord(prev, rec, { fullScan: false });
        indexRecord(prev, next);
      }
      for (const [id, tomb] of Object.entries(incoming.tombstonesById)) {
        if (!state.tombstonesById[id]) state.tombstonesById[id] = tomb;
      }
    }
    state.meta.recordCount = Object.keys(state.recordsById).length;
    flushToDisk('import-snapshot');
    const ids = Object.keys(state.recordsById);
    emitChange('import', ids, 'snapshot', ['<bulk>']);
    return {
      ok: true,
      mode: merge ? 'merge' : 'replace',
      recordCount: state.meta.recordCount,
      tombstoneCount: Object.keys(state.tombstonesById).length,
    };
  }

  /* ─── subscriptions ─── */
  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    state.subscribers.add(fn);
    return () => unsubscribe(fn);
  }
  function unsubscribe(fn) {
    if (typeof fn === 'function') state.subscribers.delete(fn);
  }

  /* ─── self-check (lightweight, mirrors 0F1d.selfCheck pattern) ─── */
  function selfCheck() {
    const health = verifyHealth();
    const stats = getStats();
    return {
      ok: health.ok,
      version: VERSION,
      booted: state.booted,
      loaded: state.loaded,
      hasLibraryCore: !!H2O.LibraryCore,
      registeredOwner: !!H2O.LibraryCore?.getOwner?.('chat-registry'),
      registeredService: !!H2O.LibraryCore?.getService?.('chat-registry'),
      counts: stats.counts,
      meta: stats.meta,
      issues: health.issues.slice(0, 12),
      diag: { steps: diag.steps.slice(-12), errors: diag.errors.slice(-8) },
    };
  }

  /* ─── public surface ─── */
  const ChatRegistry = {
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    storageKey: STORAGE_KEY,
    eventName: `evt:h2o:${EVENT_NAME}`,
    ready: state.readyPromise,

    getRecord,
    getRecordByHref,
    listRecords,

    upsertRecord,
    upsertMany,

    patchRecord,
    markSeen,
    markMissing,
    markDeleted,

    attachFolder,
    attachCategory,
    setTags,
    addTags,
    removeTags,
    setLabels,
    addLabels,
    removeLabels,

    resolveChatId,
    normalizeHref,
    parseChatIdFromHref,

    getStats,
    verifyHealth,
    repairIndex,
    repairLinkedFlag,
    exportSnapshot,
    importSnapshot,

    subscribe,
    unsubscribe,

    selfCheck,
    _diag: diag,
  };

  /* ─── boot: wait for Library Core, then register & load ─── */
  function bootWhenLibraryCoreReady(attempt = 0) {
    if (H2O[BOOT_LOCK]) return;
    const core = H2O.LibraryCore;
    if (!core) {
      if (attempt >= BOOT_MAX_ATTEMPTS) {
        try { H2O.ChatRegistryBootDiag = { ok: false, status: 'library-core-not-found', attempts: attempt, ts: nowMs() }; } catch {}
        // Still expose the API so callers don't crash; just won't be registered with core.
        publishApi();
        loadAndComplete('boot:no-core');
        return;
      }
      if (!H2O[BOOT_TIMER_SET]) H2O[BOOT_TIMER_SET] = new Set();
      const delay = Math.min(1400, 70 + attempt * 30);
      const timer = W.setTimeout(() => {
        try { H2O[BOOT_TIMER_SET]?.delete?.(timer); } catch {}
        bootWhenLibraryCoreReady(attempt + 1);
      }, delay);
      try { H2O[BOOT_TIMER_SET].add(timer); } catch {}
      return;
    }
    try { H2O.ChatRegistryBootDiag = { ok: true, status: 'library-core-ready', attempts: attempt, ts: nowMs() }; } catch {}
    publishApi();
    registerWithCore(core);
    loadAndComplete('boot:core-ready');
  }

  function publishApi() {
    H2O.Library = H2O.Library || {};
    H2O.ChatRegistry = ChatRegistry;
    H2O.Library.ChatRegistry = ChatRegistry; // convenience namespace
  }

  function registerWithCore(core) {
    try {
      core.registerOwner?.('chat-registry', ChatRegistry, { replace: true });
      core.registerService?.('chat-registry', ChatRegistry, { replace: true });
      step('registered-with-library-core');
    } catch (e) { err('register-with-core', e); }
  }

  function loadAndComplete(reason) {
    if (H2O[BOOT_LOCK]) return;
    H2O[BOOT_LOCK] = true;
    try { loadFromDisk(); } catch (e) { err('load-from-disk', e); }
    // Phase 1: one-shot backfill of the saved-implies-linked invariant.
    // Defensive — only runs if records actually loaded, and silently swallows
    // any error so a broken backfill cannot block boot. Idempotent on repeat.
    if (state.meta.recordCount > 0) {
      try {
        const repaired = repairLinkedFlag();
        step('boot:repair-linked', `${repaired.updated}/${repaired.scanned}`);
      } catch (e) { err('boot:repair-linked', e); }
    }
    state.booted = true;
    try { state.readyResolve && state.readyResolve(ChatRegistry); } catch {}
    step('boot-complete', reason);
    try {
      console.log(`${TAG} v${VERSION} ready — records=${state.meta.recordCount} key=${STORAGE_KEY}`);
    } catch {}
  }

  // Start boot. Idempotent guard (BOOT_LOCK) prevents double-boot if this script
  // is somehow re-evaluated by the loader.
  bootWhenLibraryCoreReady();
})();
