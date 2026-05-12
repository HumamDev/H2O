// ==UserScript==
// @h2o-id             s0f1h.library_sync.studio
// @name               S0F1h. 🎬 Library Sync - Studio
// @namespace          H2O.Premium.CGX.library_sync.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000021
// @description        Studio Library Sync: cross-surface live propagation of Library state. Watches chrome.storage.onChanged for archive-bridge mutations made by native (chatgpt.com tab) and re-emits them as evt:h2o:library:cross-surface-sync. Library Workspace + Index subscribe and refresh. Also broadcasts Studio-originated changes back out via chrome.storage so native can pick them up.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1h Library Sync (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 20 };
  const step = (s, o = '') => {
    try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {}
  };
  const err = (s, e) => {
    try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {}
  };

  // ── Constants ──────────────────────────────────────────────────────────────
  // Keys that the archive bridge / native scripts write that we care about for
  // cross-surface invalidation. We watch chrome.storage.local for these and
  // re-emit a single coalesced sync event regardless of which one changed.
  const WATCHED_PREFIXES = [
    'h2o:prm:cgx:fldrs:state:data:',          // folder vault
    'h2o:prm:cgx:fldrs:state:ui:',            // folder UI state
    'h2o:prm:cgx:fldrs:state:projects_cache:',// projects cache
    'h2o:prm:cgx:library:cat-candidate-pool:',// category candidates
    'h2o:prm:cgx:library:category-overrides:',// category overrides
    'h2o:prm:cgx:library:labels:',            // labels catalog/bindings/ui/cfg
    'h2o:prm:cgx:library:tag-auto-pool:',     // tag pools
    'h2o:prm:cgx:library:tag-occ-index:',     // tag occurrence index
    'h2o:library:chat-registry:',             // chat registry (any surface)
    'h2o:prm:cgx:library-index:',             // library index registry
    'h2o:prm:cgx:library:chat-title:state:v1:',// chat title/emoji state
    'h2o:prm:cgx:library:interface-meta:v1:', // native decorator meta/heat/pin mirror
  ];
  // Broadcast heartbeat to avoid event storms: at most one sync per 350ms.
  const COALESCE_MS = 350;
  // Studio-originated sync key: write here, native picks up via chrome.storage.
  const BROADCAST_KEY = 'h2o:library:cross-surface:broadcast:v1';
  // Native-originated sync key: native (0F1h) writes here when its Library
  // state changes; Studio listens so chatgpt.com tab mutations propagate back.
  // Two separate keys so each side reacts to the OTHER side's broadcast
  // without re-firing its own (avoids self-feedback loops).
  const NATIVE_BROADCAST_KEY = 'h2o:library:cross-surface:broadcast:native:v1';

  const state = {
    bound: false,
    lastSync: 0,
    pendingTimer: null,
    pendingReasons: new Set(),
    subscribers: new Set(),
  };

  function hasChromeStorage() {
    try {
      return !!(W.chrome && chrome.storage && chrome.storage.local && typeof chrome.storage.local.set === 'function');
    } catch { return false; }
  }

  function isWatchedKey(key) {
    const k = String(key || '');
    return WATCHED_PREFIXES.some((p) => k.startsWith(p));
  }

  function emitSync(reasonList) {
    const reasons = Array.from(new Set(reasonList || []));
    const detail = { reasons, t: Date.now(), surface: 'studio' };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:library:cross-surface-sync', { detail })); } catch {}
    try { W.dispatchEvent(new CustomEvent('h2o:library:cross-surface-sync', { detail })); } catch {}
    try { W.H2O?.events?.emit?.('library:cross-surface-sync', detail); } catch {}
    state.subscribers.forEach((fn) => { try { fn(detail); } catch (e) { err('subscriber', e); } });
    step('emit-sync', String(reasons.length));
  }

  function coalesceEmit(reason) {
    state.pendingReasons.add(String(reason || 'change'));
    if (state.pendingTimer) return;
    state.pendingTimer = W.setTimeout(() => {
      const reasons = Array.from(state.pendingReasons);
      state.pendingReasons.clear();
      state.pendingTimer = null;
      state.lastSync = Date.now();
      emitSync(reasons);
      // Bust caches on Workspace + refresh Index.
      try {
        const ws = H2O.LibraryWorkspace;
        const idx = H2O.LibraryIndex;
        if (idx?.refresh) idx.refresh('cross-surface-sync').catch(() => {});
        // Workspace caches will bust naturally via the index-updated subscription.
        if (ws?._bustCaches) ws._bustCaches('cross-surface-sync');
      } catch (e) { err('refresh.bust', e); }
    }, COALESCE_MS);
  }

  function bindChromeStorage() {
    if (state.bound) return true;
    if (!hasChromeStorage()) return false;
    if (!chrome.storage.onChanged || typeof chrome.storage.onChanged.addListener !== 'function') return false;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const hits = [];
        for (const key of Object.keys(changes || {})) {
          if (isWatchedKey(key)) hits.push(key);
          if (key === BROADCAST_KEY) {
            // chrome.storage.onChanged fires in the writing context too, so
            // every Studio-originated broadcast would otherwise come back as
            // an inbound event and trigger a wasteful self-refresh. Skip if
            // the payload identifies itself as Studio's own write.
            const newVal = changes[BROADCAST_KEY] && changes[BROADCAST_KEY].newValue;
            if (newVal && newVal.surface === 'studio') continue;
            hits.push('broadcast');
          }
          // Native counterpart (0F1h) writes here on its own state changes.
          // Studio reacts so a folder/category mutation made in a chatgpt.com
          // tab refreshes the open Library page.
          if (key === NATIVE_BROADCAST_KEY) hits.push('native-broadcast');
        }
        if (hits.length) coalesceEmit(`chrome.storage:${hits.length}`);
      });
      state.bound = true;
      step('bind.chrome.storage');
      return true;
    } catch (e) { err('bind.chrome.storage', e); return false; }
  }

  function broadcastFromStudio(reason, payload) {
    // Write a small ticking sentinel to chrome.storage.local — native's listener
    // (registered by 0F3a/0F4a/etc) can pick this up via the same key prefix.
    if (!hasChromeStorage()) return false;
    try {
      const body = {
        ts: Date.now(),
        surface: 'studio',
        reason: String(reason || 'studio-change'),
        payload: payload && typeof payload === 'object' ? payload : null,
      };
      chrome.storage.local.set({ [BROADCAST_KEY]: body }, () => {
        step('broadcast', body.reason);
      });
      return true;
    } catch (e) { err('broadcast', e); return false; }
  }

  // ── Workspace bridge ───────────────────────────────────────────────────────
  // When Studio Library Workspace mutates a folder binding / snapshot category,
  // it emits 'library-workspace:updated' with reason in detail. We listen for
  // mutation reasons and re-broadcast to native via chrome.storage.
  function bindWorkspaceEvents() {
    const ws = H2O.LibraryWorkspace;
    if (!ws || typeof ws.subscribe !== 'function') return false;
    ws.subscribe((evt) => {
      const reason = String(evt?.reason || '');
      if (['folder-binding-changed', 'category-changed', 'setFolderBinding', 'setSnapshotCategory'].includes(reason)) {
        broadcastFromStudio(reason, evt?.detail || null);
      }
    });
    step('bind.workspace');
    return true;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  const Sync = {
    surface: 'studio',
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      state.subscribers.add(fn);
      return () => state.subscribers.delete(fn);
    },
    broadcast: broadcastFromStudio,
    pingNow(reason) { coalesceEmit(reason || 'manual'); },
    diagnose() {
      return {
        surface: 'studio',
        bound: state.bound,
        hasChromeStorage: hasChromeStorage(),
        lastSync: state.lastSync,
        watchedPrefixes: WATCHED_PREFIXES,
        broadcastKey: BROADCAST_KEY,
        nativeBroadcastKey: NATIVE_BROADCAST_KEY,
        coalesceMs: COALESCE_MS,
        subscribers: state.subscribers.size,
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  };

  H2O.Library.Sync = Sync;

  function bootBindings() {
    bindChromeStorage();
    bindWorkspaceEvents() || W.setTimeout(bindWorkspaceEvents, 350);
  }

  function registerOnCore() {
    const core = H2O.LibraryCore;
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-sync', Sync, { replace: true });
      core.registerService('library-sync', Sync, { replace: true });
      step('register-on-core', 'library-sync');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  if (!registerOnCore()) W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  bootBindings();

  step('boot', 'studio-library-sync-ready');
})();
