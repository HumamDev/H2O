// ==UserScript==
// @h2o-id             s0f1g.chat_registry.studio
// @name               S0F1g. 🎬 Chat Registry - Studio
// @namespace          H2O.Premium.CGX.chat_registry.studio
// @author             HumamDev
// @version            2.0.0
// @revision           002
// @build              260515-000012
// @description        Studio Chat Registry: per-chat metadata truth layer on the Studio surface. Phase 2A — record shape widened to the canonical Phase 1 shape (state.isLinked + linkedAt/linkedFrom/linkSourceHref + state.isSaved/isImported/isPinned/isArchived/isDeleted + normalizedHref + schemaVersion + source/provenance) so it stops drifting from native 0F1g. Pure record sanitize/merge/repair logic is delegated to H2O.Library.RegistryCore (loaded by S0F0c) so native and Studio compute byte-identical merged records for identical inputs. Storage stays separate — persists to the Studio Library Store under h2o:library:chat-registry:studio:v1.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1g Chat Registry (Studio, Phase 2A)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const VERSION = '2.0.0';
  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'h2o:library:chat-registry:studio:v1';
  const FLUSH_DEBOUNCE_MS = 140;
  const EVENT_NAME = 'chat-registry:changed';
  const TAG = '[H2O.ChatRegistry(Studio)]';

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const diag = {
    t0: performance.now(),
    steps: [], errors: [], bufMax: 120, errMax: 30,
  };
  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), e: String(e?.stack || e?.message || e || '') });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  // ── Shared registry-core handle (set by S0F0c) ─────────────────────────────
  function core() { return H2O.Library?.RegistryCore || null; }
  function nowMs() { return Date.now(); }
  function nowIso() { try { return new Date().toISOString(); } catch { return ''; } }

  // ── State ──────────────────────────────────────────────────────────────────
  // recordsById holds canonical-shaped records keyed by chatId. The previous
  // Studio shape (chatId/title/projectId/folderId/snapshotCount/lastSeenTs/
  // deleted) is normalized via sanitizeRecord on load AND on every write, so
  // both legacy and canonical shapes converge after the first boot.
  const state = {
    booted: false,
    loaded: false,
    recordsById: Object.create(null),
    idByHref: Object.create(null),
    flushTimer: null,
    subscribers: new Set(),
    loadErr: null,
    readyResolve: null,
    readyPromise: null,
    flushes: 0,
    lastReadAt: 0,
    lastWriteAt: 0,
  };
  state.readyPromise = new Promise((resolve) => { state.readyResolve = resolve; });

  function getStore() {
    try { return H2O.Library?.Store || null; } catch { return null; }
  }

  // ── Load / flush ───────────────────────────────────────────────────────────
  // We accept TWO on-disk shapes:
  //   (a) Canonical wrapped: { schemaVersion, recordsById, idByHref, meta }
  //   (b) Legacy Studio flat: { [chatId]: { chatId, title, ..., lastSeenTs, deleted? } }
  // adoptShape (shared) handles both. Records that pass through it gain the
  // canonical Phase 1 fields with explicit defaults. Re-flushing rewrites the
  // store in canonical shape, completing the widen in-place.
  async function loadFromStore() {
    const c = core();
    if (!c) {
      err('load', 'shared-core-missing');
      state.loaded = true;
      return;
    }
    const store = getStore();
    let raw = null;
    if (store && typeof store.get === 'function') {
      try { raw = await store.get(STORAGE_KEY); }
      catch (e) { err('load.store', e); }
    }
    if (raw == null) {
      // Fall back to direct localStorage so Registry boots even before
      // Library Store finishes its capability probe.
      try {
        const txt = W.localStorage?.getItem(STORAGE_KEY);
        if (txt) raw = JSON.parse(txt);
      } catch (e) { err('load.localStorage', e); }
    }
    try {
      const shape = c.adoptShape(raw);
      state.recordsById = shape.recordsById;
      state.idByHref = shape.idByHref;
      state.loaded = true;
      state.lastReadAt = nowMs();
      step('load', `records=${Object.keys(state.recordsById).length}`);
    } catch (e) {
      err('load.adopt', e);
      state.loaded = true;
      state.loadErr = e;
    }
  }

  function ensureLoaded() {
    if (state.loaded) return Promise.resolve();
    return loadFromStore();
  }

  function scheduleFlush(reason = '') {
    if (state.flushTimer) return;
    state.flushTimer = W.setTimeout(async () => {
      state.flushTimer = null;
      try {
        const payload = {
          schemaVersion: SCHEMA_VERSION,
          recordsById: state.recordsById,
          idByHref: state.idByHref,
          meta: {
            updatedAt: nowIso(),
            recordCount: Object.keys(state.recordsById).length,
          },
        };
        const store = getStore();
        if (store && typeof store.set === 'function') {
          await store.set(STORAGE_KEY, payload);
        } else {
          W.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
        }
        state.flushes += 1;
        state.lastWriteAt = nowMs();
        step('flush.ok', `${reason} | records=${payload.meta.recordCount}`);
      } catch (e) { err('flush', e); }
    }, FLUSH_DEBOUNCE_MS);
  }

  // ── Events / subscriptions ─────────────────────────────────────────────────
  function emitChange(action, chatIds, source, changedFields) {
    const detail = {
      action: String(action || 'change'),
      chatIds: Array.isArray(chatIds) ? chatIds.slice() : (chatIds ? [chatIds] : []),
      source: String(source || ''),
      changedFields: Array.isArray(changedFields) ? changedFields.slice() : [],
      ts: nowMs(),
    };
    state.subscribers.forEach((fn) => { try { fn(detail); } catch (e) { err('subscriber', e); } });
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

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    state.subscribers.add(fn);
    return () => state.subscribers.delete(fn);
  }
  function unsubscribe(fn) {
    if (typeof fn === 'function') state.subscribers.delete(fn);
  }

  // ── Index maintenance ──────────────────────────────────────────────────────
  function indexRecord(prev, next) {
    const id = next?.chatId;
    if (!id) return;
    state.recordsById[id] = next;
    if (prev && prev.normalizedHref && prev.normalizedHref !== next.normalizedHref) {
      if (state.idByHref[prev.normalizedHref] === id) delete state.idByHref[prev.normalizedHref];
    }
    if (next.normalizedHref) state.idByHref[next.normalizedHref] = id;
  }

  // ── Sync read API (canonical names — mirrors native 0F1g) ─────────────────
  // Studio's previous API was async-only. Phase 2A adds sync reads off the
  // in-memory cache so validation/diagnostic callers don't await every probe.
  // Callers that need disk-fresh data can `await ChatRegistry.ready` first.
  function getRecord(chatIdInput) {
    const c = core();
    if (!c) return null;
    const id = c.normalizeChatId(chatIdInput);
    if (!id) return null;
    return state.recordsById[id] || null;
  }
  function getRecordByHref(hrefInput) {
    const c = core();
    if (!c) return null;
    const nh = c.normalizeHref(hrefInput);
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
      rows = rows.filter((r) => { try { return !!opts.filter(r); } catch { return false; } });
    }
    if (Number.isFinite(opts.limit) && opts.limit > 0) rows = rows.slice(0, Math.trunc(opts.limit));
    return rows;
  }
  function resolveChatId(input) {
    const c = core();
    if (!c) return '';
    if (input == null) return '';
    if (typeof input === 'object') {
      return c.normalizeChatId(input.chatId || input.id || '') || c.parseChatIdFromHref(input.href || input.normalizedHref || '');
    }
    const s = String(input);
    return c.normalizeChatId(s) || c.parseChatIdFromHref(s);
  }

  // ── Sync write API: upsertRecord (mirrors native 0F1g signature) ──────────
  // Accepts either the canonical shape or the legacy Studio flat shape; the
  // shared sanitizeRecord normalizes both. Synchronously updates the in-memory
  // map, schedules a debounced flush, emits change events. The previous
  // async-only upsertChat/upsertMany API stays for backward compat below.
  function upsertRecord(input, options = {}) {
    const c = core();
    if (!c) return null;
    const incoming = (input && typeof input === 'object') ? input : {};
    const id = c.normalizeChatId(incoming.chatId || incoming.id || '')
      || c.parseChatIdFromHref(incoming.href || incoming.normalizedHref || '');
    if (!id) return null;
    const prev = state.recordsById[id] || null;
    const sane = c.sanitizeRecord({ ...incoming, chatId: id }, id);
    if (options.source) {
      sane.source.first = sane.source.first || (prev?.source?.first || options.source);
      sane.source.seenFrom = c.uniqueStrings([...(sane.source.seenFrom || []), options.source]);
    }
    const next = c.mergeRecord(prev, sane, options);
    const changed = prev ? c.diffFields(prev, next) : ['<created>'];
    indexRecord(prev, next);
    scheduleFlush('upsert');
    if (changed.length) emitChange('upsert', [id], options.source, changed);
    return next;
  }

  function upsertMany(inputs, options = {}) {
    const list = Array.isArray(inputs) ? inputs : [];
    const out = [];
    const changedIds = [];
    list.forEach((i) => {
      const r = upsertRecord(i, options);
      if (r) { out.push(r); changedIds.push(r.chatId); }
    });
    return out;
  }

  // ── Async write API (backward compat) ──────────────────────────────────────
  // The Studio v1 API exposed `upsertChat(id, record)` and `upsertMany([...])`
  // as async. Keep both async signatures alive for any caller that already
  // awaits them; the body delegates to the sync upsertRecord above.
  async function upsertChat(chatId, record) {
    await ensureLoaded();
    return upsertRecord({ chatId, ...(record || {}) });
  }
  async function upsertManyAsync(records) {
    await ensureLoaded();
    return upsertMany(records);
  }
  async function getChat(chatId) {
    await ensureLoaded();
    return getRecord(chatId);
  }
  async function listAll() {
    await ensureLoaded();
    return Object.values(state.recordsById);
  }
  async function listActive() {
    await ensureLoaded();
    return Object.values(state.recordsById).filter((r) => !r.state?.isDeleted);
  }
  async function markDeleted(chatId) {
    await ensureLoaded();
    const c = core();
    if (!c) return false;
    const id = c.normalizeChatId(chatId);
    if (!id || !state.recordsById[id]) return false;
    const prev = state.recordsById[id];
    const next = c.mergeRecord(prev, c.sanitizeRecord({
      chatId: id,
      state: { ...prev.state, isDeleted: true, syncState: 'deleted' },
    }, id));
    indexRecord(prev, next);
    scheduleFlush('mark-deleted');
    emitChange('mark-deleted', [id], 'registry', ['state.isDeleted', 'state.syncState']);
    return true;
  }
  async function patch(chatId, p) {
    await ensureLoaded();
    return upsertRecord({ chatId, ...(p || {}) });
  }
  async function findByNormalizedHref(href) {
    await ensureLoaded();
    return getRecordByHref(href);
  }

  // ── Repair: enforce chatId && isSaved ⟹ isLinked ───────────────────────────
  // Synchronous; delegates the pure transform to the shared core, then applies
  // the result back into the in-memory map, persists, and emits once.
  function repairLinkedFlag() {
    const c = core();
    if (!c) return { scanned: 0, updated: 0 };
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

  // ── Stats / selfCheck (parity with native API) ─────────────────────────────
  function getStats() {
    const records = Object.values(state.recordsById);
    let saved = 0, archived = 0, pinned = 0, imported = 0, deleted = 0, linked = 0;
    let withFolder = 0, withCategory = 0, withTags = 0, withLabels = 0;
    for (const r of records) {
      if (r.state?.isSaved) saved += 1;
      if (r.state?.isArchived) archived += 1;
      if (r.state?.isPinned) pinned += 1;
      if (r.state?.isImported) imported += 1;
      if (r.state?.isDeleted) deleted += 1;
      if (r.state?.isLinked) linked += 1;
      if (r.organization?.folderId) withFolder += 1;
      if (r.organization?.categoryId) withCategory += 1;
      if ((r.organization?.tagIds || []).length) withTags += 1;
      if ((r.organization?.labelIds || []).length) withLabels += 1;
    }
    return {
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      storageKey: STORAGE_KEY,
      surface: 'studio',
      booted: state.booted,
      loaded: state.loaded,
      counts: {
        records: records.length,
        hrefIndex: Object.keys(state.idByHref).length,
        tombstones: 0,
        saved, archived, pinned, imported, deleted, linked,
        withFolder, withCategory, withTags, withLabels,
      },
      io: {
        lastReadAt: state.lastReadAt,
        lastWriteAt: state.lastWriteAt,
        flushes: state.flushes,
      },
      subscribers: state.subscribers.size,
    };
  }

  function selfCheck() {
    const stats = getStats();
    const issues = [];
    const c = core();
    if (!c) issues.push({ kind: 'shared-core-missing' });
    // Invariant check — should always be clean after repairLinkedFlag has run.
    for (const r of Object.values(state.recordsById)) {
      if (r.chatId && r.state?.isSaved && !r.state?.isLinked) {
        issues.push({ kind: 'invariant-violation:saved-not-linked', id: r.chatId });
      }
    }
    return {
      ok: issues.length === 0,
      version: VERSION,
      surface: 'studio',
      booted: state.booted,
      loaded: state.loaded,
      hasLibraryCore: !!H2O.LibraryCore,
      hasSharedCore: !!c,
      registeredOwner: !!H2O.LibraryCore?.getOwner?.('chat-registry'),
      registeredService: !!H2O.LibraryCore?.getService?.('chat-registry'),
      counts: stats.counts,
      issues: issues.slice(0, 12),
      diag: { steps: diag.steps.slice(-12), errors: diag.errors.slice(-8) },
    };
  }

  // ── Diagnose (preserved from v1) ────────────────────────────────────────────
  function diagnose() {
    return {
      surface: 'studio',
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      loaded: state.loaded,
      loadErr: state.loadErr ? String(state.loadErr) : null,
      chats: Object.keys(state.recordsById).length,
      active: Object.values(state.recordsById).filter((r) => !r.state?.isDeleted).length,
      deleted: Object.values(state.recordsById).filter((r) => r.state?.isDeleted).length,
      linked: Object.values(state.recordsById).filter((r) => r.state?.isLinked).length,
      saved: Object.values(state.recordsById).filter((r) => r.state?.isSaved).length,
      storageKey: STORAGE_KEY,
      storeBackend: getStore()?.backend?.() || null,
      hasSharedCore: !!core(),
      steps: diag.steps.slice(-20),
      errors: diag.errors.slice(-10),
    };
  }

  // ── Public surface ─────────────────────────────────────────────────────────
  // The shape now matches native 0F1g for the methods relevant to Library
  // consumers (getRecord, listRecords, upsertRecord, repairLinkedFlag,
  // getStats, selfCheck, normalizeHref, parseChatIdFromHref, subscribe). The
  // legacy async methods (upsertChat, listAll, etc.) stay for backward compat.
  const ChatRegistry = {
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    storageKey: STORAGE_KEY,
    eventName: `evt:h2o:${EVENT_NAME}`,
    ready: state.readyPromise,

    // Sync API (canonical — mirrors native 0F1g)
    getRecord,
    getRecordByHref,
    listRecords,
    upsertRecord,
    upsertMany,
    resolveChatId,
    get parseChatIdFromHref() { return core()?.parseChatIdFromHref || ((x) => ''); },
    get normalizeHref() { return core()?.normalizeHref || ((x) => String(x || '')); },

    // Maintenance
    repairLinkedFlag,
    getStats,
    selfCheck,
    diagnose,

    // Subscriptions
    subscribe,
    unsubscribe,

    // Legacy async API (kept for backward compat with v1 callers)
    upsertChat,
    upsertManyAsync,
    getChat,
    listAll,
    listActive,
    markDeleted,
    patch,
    findByNormalizedHref,

    _diag: diag,
  };

  // Expose
  H2O.ChatRegistry = ChatRegistry;
  H2O.Library.ChatRegistry = ChatRegistry;

  // ── Boot ───────────────────────────────────────────────────────────────────
  function registerOnCore() {
    const c = H2O.LibraryCore;
    if (!c || typeof c.registerOwner !== 'function') return false;
    try {
      c.registerOwner('chat-registry', ChatRegistry, { replace: true });
      c.registerService('chat-registry', ChatRegistry, { replace: true });
      step('register-on-core', 'chat-registry');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }
  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }

  // Kick off the disk load; on completion, run the one-shot linked backfill so
  // legacy Studio records (no isLinked field) gain the canonical invariant.
  ensureLoaded().then(() => {
    state.booted = true;
    try {
      const r = repairLinkedFlag();
      step('boot:repair-linked', `${r.updated}/${r.scanned}`);
    } catch (e) { err('boot:repair-linked', e); }
    try { state.readyResolve && state.readyResolve(ChatRegistry); } catch {}
    try { console.log(`${TAG} v${VERSION} ready — records=${Object.keys(state.recordsById).length} key=${STORAGE_KEY}`); } catch {}
  });

  step('boot', 'studio-chat-registry-ready');
})();
