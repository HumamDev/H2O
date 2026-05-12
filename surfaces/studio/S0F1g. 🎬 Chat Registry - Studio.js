// ==UserScript==
// @h2o-id             s0f1g.chat_registry.studio
// @name               S0F1g. 🎬 Chat Registry - Studio
// @namespace          H2O.Premium.CGX.chat_registry.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000004
// @description        Studio Chat Registry: per-chat metadata truth layer (titles, projectIds, folderBindings, snapshot counts, last-seen times). Persists to Library Store under a Studio-isolated key. Mirrors native 0F1g shape so consumers (Library Index, Workspace, Insights) use one API.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1g Chat Registry (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const STORAGE_KEY = 'h2o:library:chat-registry:studio:v1';
  const FLUSH_DEBOUNCE_MS = 140;

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 80, errMax: 20 };
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

  // ── State ──────────────────────────────────────────────────────────────────
  // chats: { [chatId]: { chatId, title, projectId, folderId, snapshotCount, lastSeenTs, deleted? } }
  const state = {
    chats: Object.create(null),
    loaded: false,
    loadErr: null,
    flushTimer: null,
    subscribers: new Set(),
  };

  function getStore() {
    try { return H2O.Library?.Store || null; } catch { return null; }
  }

  function emitChange(reason, ids = []) {
    const detail = { reason: String(reason || ''), chatIds: Array.isArray(ids) ? ids.slice() : [], t: Date.now() };
    // Dual-event pattern (CLAUDE.md): canonical + legacy.
    try { W.dispatchEvent(new CustomEvent('evt:h2o:chat-registry:changed', { detail })); } catch {}
    try { W.dispatchEvent(new CustomEvent('h2o:chat-registry:changed', { detail })); } catch {}
    try { W.H2O?.events?.emit?.('chat-registry:changed', detail); } catch {}
    state.subscribers.forEach((fn) => { try { fn(detail); } catch (e) { err('subscriber', e); } });
  }

  async function loadFromStore() {
    const store = getStore();
    if (!store) {
      // No store yet — try sync localStorage fallback so Registry boots even
      // before S0F1e probe completes.
      try {
        const raw = W.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              if (v && typeof v === 'object') state.chats[String(k)] = { ...v, chatId: String(k) };
            }
          }
        }
        state.loaded = true;
        step('load.localStorage', String(Object.keys(state.chats).length));
        return;
      } catch (e) { err('load.localStorage', e); state.loadErr = e; }
      state.loaded = true; // mark loaded with empty set
      return;
    }
    try {
      const v = await store.get(STORAGE_KEY);
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) {
          if (val && typeof val === 'object') state.chats[String(k)] = { ...val, chatId: String(k) };
        }
      }
      state.loaded = true;
      step('load.store', String(Object.keys(state.chats).length));
    } catch (e) { err('load.store', e); state.loadErr = e; state.loaded = true; }
  }

  function scheduleFlush() {
    if (state.flushTimer) return;
    state.flushTimer = W.setTimeout(async () => {
      state.flushTimer = null;
      const store = getStore();
      try {
        const snapshot = {};
        for (const [k, v] of Object.entries(state.chats)) snapshot[k] = { ...v };
        if (store) await store.set(STORAGE_KEY, snapshot);
        else W.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        step('flush.ok', String(Object.keys(snapshot).length));
      } catch (e) { err('flush', e); }
    }, FLUSH_DEBOUNCE_MS);
  }

  function ensureLoaded() {
    if (state.loaded) return Promise.resolve();
    return loadFromStore();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  const ChatRegistry = {
    ready: ensureLoaded(),

    async upsertChat(chatId, record) {
      const id = String(chatId || '').trim();
      if (!id) return null;
      await ensureLoaded();
      const prev = state.chats[id] || { chatId: id };
      const next = {
        ...prev,
        ...(record || {}),
        chatId: id,
        lastSeenTs: Number(record?.lastSeenTs ?? prev.lastSeenTs ?? Date.now()),
      };
      const changed = JSON.stringify(prev) !== JSON.stringify(next);
      state.chats[id] = next;
      if (changed) {
        scheduleFlush();
        emitChange('upsert', [id]);
      }
      return next;
    },

    async upsertMany(records) {
      await ensureLoaded();
      const ids = [];
      const list = Array.isArray(records) ? records : [];
      for (const rec of list) {
        const id = String(rec?.chatId || '').trim();
        if (!id) continue;
        const prev = state.chats[id] || { chatId: id };
        const next = { ...prev, ...rec, chatId: id, lastSeenTs: Number(rec.lastSeenTs ?? prev.lastSeenTs ?? Date.now()) };
        if (JSON.stringify(prev) !== JSON.stringify(next)) {
          state.chats[id] = next;
          ids.push(id);
        }
      }
      if (ids.length) {
        scheduleFlush();
        emitChange('upsertMany', ids);
      }
      return ids;
    },

    async getChat(chatId) {
      await ensureLoaded();
      return state.chats[String(chatId || '').trim()] || null;
    },

    async listAll() {
      await ensureLoaded();
      return Object.values(state.chats);
    },

    async listActive() {
      await ensureLoaded();
      return Object.values(state.chats).filter((c) => !c.deleted);
    },

    async markDeleted(chatId) {
      const id = String(chatId || '').trim();
      if (!id) return false;
      await ensureLoaded();
      const prev = state.chats[id];
      if (!prev) return false;
      state.chats[id] = { ...prev, deleted: true, deletedAt: Date.now() };
      scheduleFlush();
      emitChange('delete', [id]);
      return true;
    },

    async patch(chatId, patch) {
      const id = String(chatId || '').trim();
      if (!id) return null;
      return ChatRegistry.upsertChat(id, patch);
    },

    async findByNormalizedHref(href) {
      await ensureLoaded();
      const h = String(href || '').trim();
      if (!h) return null;
      const target = h.replace(/^https?:\/\/[^/]+/i, '');
      for (const c of Object.values(state.chats)) {
        if (`/c/${c.chatId}` === target) return c;
      }
      return null;
    },

    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      state.subscribers.add(fn);
      return () => state.subscribers.delete(fn);
    },

    diagnose() {
      return {
        surface: 'studio',
        loaded: state.loaded,
        loadErr: state.loadErr ? String(state.loadErr) : null,
        chats: Object.keys(state.chats).length,
        active: Object.values(state.chats).filter((c) => !c.deleted).length,
        deleted: Object.values(state.chats).filter((c) => c.deleted).length,
        storageKey: STORAGE_KEY,
        storeBackend: getStore()?.backend?.() || null,
        steps: diag.steps.slice(-20),
        errors: diag.errors.slice(-10),
      };
    },
  };

  // Expose
  H2O.ChatRegistry = ChatRegistry;
  H2O.Library.ChatRegistry = ChatRegistry;

  // Register on Library Core
  function registerOnCore() {
    const core = H2O.LibraryCore;
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('chat-registry', ChatRegistry, { replace: true });
      core.registerService('chat-registry', ChatRegistry, { replace: true });
      step('register-on-core', 'chat-registry');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }
  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }

  step('boot', 'studio-chat-registry-ready');
})();
