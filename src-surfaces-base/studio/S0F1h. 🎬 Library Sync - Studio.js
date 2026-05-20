// ==UserScript==
// @h2o-id             s0f1h.library_sync.studio
// @name               S0F1h. 🎬 Library Sync - Studio
// @namespace          H2O.Premium.CGX.library_sync.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000021
// @description        Studio Library Sync: cross-surface live propagation of Library state. Routes through H2O.Studio.platform.broadcast (emitRaw / onAnyChange) which is the required boundary for the future Tauri port. Wire format (BROADCAST_KEY / NATIVE_BROADCAST_KEY in chrome.storage.local) is preserved for native (chatgpt.com tab) interop. Falls back to direct chrome.storage if the platform adapter is unavailable. Library Workspace + Index subscribe and refresh on sync events.
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
  const STUDIO_LIBRARY_INDEX_CACHE_KEY = 'h2o:prm:cgx:library-index:studio:registry:v1';
  const IGNORED_SELF_REFRESH_KEYS = new Set([
    STUDIO_LIBRARY_INDEX_CACHE_KEY,
  ]);
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
    transport: null,        // 'platform.broadcast' | 'chrome.storage.fallback' | null
    unsub: null,            // teardown for the bound listener, if any
    lastSync: 0,
    lastChangeKeys: [],
    lastWatchedHits: [],
    lastEmittedReasons: [],
    lastNativeBroadcastAt: 0,
    lastNativeBroadcastTs: 0,
    lastNativeBroadcastKeys: [],
    lastNativeBroadcastReasons: [],
    lastNativeBroadcastHasLinkedRecords: false,
    lastNativeBroadcastLinkedRecordsCount: 0,
    lastNativeBroadcastProjectCatalogCount: 0,
    lastNativeBroadcastProjectCatalogSource: '',
    lastNativeBroadcastPayload: null,
    lastNativeBroadcastReadAt: 0,
    lastNativeBroadcastReadSource: '',
    lastNativeBroadcastReadError: '',
    lastRefreshOwners: [],
    lastStudioBroadcastAt: 0,
    lastStudioBroadcastReason: '',
    lastStudioBroadcastPayloadKeys: [],
    lastStudioBroadcastTransport: '',
    pendingTimer: null,
    pendingReasons: new Set(),
    subscribers: new Set(),
  };

  // ── Transport seam ────────────────────────────────────────────────────────
  // All cross-surface signaling routes through H2O.Studio.platform.broadcast.
  // emitRaw / onAnyChange preserve the legacy wire format (writes to
  // BROADCAST_KEY / NATIVE_BROADCAST_KEY in chrome.storage.local) so the
  // native counterpart at scripts/0F1h.*.js and the watching feature owners
  // continue to operate unchanged. The platform adapter is the required
  // boundary for the future Tauri port — at port time the MV3 adapter is
  // swapped for a Tauri adapter without touching this file. See
  // surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md and
  // STUDIO_PORTABILITY_CONTRACT.md.
  function getPlatformBroadcast() {
    const p = W.H2O && W.H2O.Studio && W.H2O.Studio.platform && W.H2O.Studio.platform.broadcast;
    if (!p) return null;
    if (typeof p.emitRaw !== 'function' || typeof p.onAnyChange !== 'function') return null;
    // Reject the fallback adapter — it would noop/throw and we'd want the
    // direct chrome.storage path to take over for graceful degradation.
    const env = W.H2O && W.H2O.Studio && W.H2O.Studio.platform && W.H2O.Studio.platform.env;
    if (env && env.adapter === 'fallback') return null;
    return p;
  }

  function hasChromeStorage() {
    try {
      return !!(W.chrome && chrome.storage && chrome.storage.local && typeof chrome.storage.local.set === 'function');
    } catch { return false; }
  }

  function hasChromeStorageRead() {
    try {
      return !!(W.chrome && chrome.storage && chrome.storage.local && typeof chrome.storage.local.get === 'function');
    } catch { return false; }
  }

  function isWatchedKey(key) {
    const k = String(key || '');
    if (IGNORED_SELF_REFRESH_KEYS.has(k)) return false;
    return WATCHED_PREFIXES.some((p) => k.startsWith(p));
  }

  function normalizeNativeBroadcastPayload(value) {
    const raw = value && typeof value === 'object' ? value : null;
    if (!raw) return null;
    if (raw.projectCatalog || Array.isArray(raw.linkedRecords) || raw.surface === 'native' || Array.isArray(raw.reasons)) return raw;
    const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
    if (payload && (payload.projectCatalog || Array.isArray(payload.linkedRecords) || payload.surface === 'native' || Array.isArray(payload.reasons))) return payload;
    const nestedValue = raw.value && typeof raw.value === 'object' ? raw.value : null;
    if (nestedValue && (nestedValue.projectCatalog || Array.isArray(nestedValue.linkedRecords) || nestedValue.surface === 'native' || Array.isArray(nestedValue.reasons))) return nestedValue;
    return raw;
  }

  function emitNativeBroadcastUpdated(payload, reason) {
    const detail = {
      key: NATIVE_BROADCAST_KEY,
      payload: payload || null,
      reason: String(reason || 'native-broadcast'),
      t: Date.now(),
    };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:library:native-broadcast-updated', { detail })); } catch {}
    try { W.H2O?.events?.emit?.('library:native-broadcast-updated', detail); } catch {}
  }

  function rememberNativeBroadcast(payload, reason = '') {
    try {
      const p = normalizeNativeBroadcastPayload(payload);
      state.lastNativeBroadcastAt = Date.now();
      state.lastNativeBroadcastTs = Number(p?.ts || 0) || 0;
      state.lastNativeBroadcastKeys = p ? Object.keys(p).slice(0, 24) : [];
      state.lastNativeBroadcastReasons = Array.isArray(p?.reasons) ? p.reasons.slice(0, 24) : [];
      state.lastNativeBroadcastHasLinkedRecords = Array.isArray(p?.linkedRecords);
      state.lastNativeBroadcastLinkedRecordsCount = Array.isArray(p?.linkedRecords) ? p.linkedRecords.length : 0;
      state.lastNativeBroadcastProjectCatalogCount = Array.isArray(p?.projectCatalog?.rows) ? p.projectCatalog.rows.length : 0;
      state.lastNativeBroadcastProjectCatalogSource = String(p?.projectCatalog?.source || '');
      state.lastNativeBroadcastPayload = p || null;
      emitNativeBroadcastUpdated(p, reason);
    } catch {}
  }

  async function refreshNativeBroadcast(reason = '') {
    if (!hasChromeStorageRead()) {
      state.lastNativeBroadcastReadAt = Date.now();
      state.lastNativeBroadcastReadSource = 'none';
      state.lastNativeBroadcastReadError = 'chrome-storage-read-unavailable';
      return null;
    }
    try {
      const raw = await new Promise((resolve) => {
        try {
          chrome.storage.local.get(NATIVE_BROADCAST_KEY, (items) => {
            if (chrome.runtime && chrome.runtime.lastError) { resolve(null); return; }
            resolve(items && items[NATIVE_BROADCAST_KEY]);
          });
        } catch { resolve(null); }
      });
      const payload = normalizeNativeBroadcastPayload(raw);
      state.lastNativeBroadcastReadAt = Date.now();
      state.lastNativeBroadcastReadSource = payload ? 'chrome.storage.local' : 'chrome.storage.local-empty';
      state.lastNativeBroadcastReadError = payload ? '' : state.lastNativeBroadcastReadError;
      if (payload) {
        rememberNativeBroadcast(payload, reason || 'refresh');
        step('native-broadcast.refresh', String(reason || 'manual'));
      }
      return payload;
    } catch (e) {
      state.lastNativeBroadcastReadAt = Date.now();
      state.lastNativeBroadcastReadSource = 'error';
      state.lastNativeBroadcastReadError = String(e?.message || e || 'native-broadcast-read-error');
      err('native-broadcast.refresh', e);
      return null;
    }
  }

  /* Single change-handler body, shared by the platform-backed and legacy
   * fallback paths so behavior is byte-identical regardless of transport. */
  function handleChanges(changes, area) {
    if (area !== 'local') return;
    const hits = [];
    const changedKeys = Object.keys(changes || {});
    state.lastChangeKeys = changedKeys.slice(-24);
    for (const key of changedKeys) {
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
      if (key === NATIVE_BROADCAST_KEY) {
        rememberNativeBroadcast(changes[NATIVE_BROADCAST_KEY]?.newValue || null, 'storage.onChanged');
        hits.push('native-broadcast');
      }
    }
    if (hits.length) {
      state.lastWatchedHits = hits.slice(-24);
      coalesceEmit(`${state.transport || 'transport'}:${hits.length}`);
    }
  }

  function emitSync(reasonList) {
    const reasons = Array.from(new Set(reasonList || []));
    const detail = { reasons, t: Date.now(), surface: 'studio' };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:library:cross-surface-sync', { detail })); } catch {}
    try { W.dispatchEvent(new CustomEvent('h2o:library:cross-surface-sync', { detail })); } catch {}
    try { W.H2O?.events?.emit?.('library:cross-surface-sync', detail); } catch {}
    state.subscribers.forEach((fn) => { try { fn(detail); } catch (e) { err('subscriber', e); } });
    state.lastEmittedReasons = reasons.slice(0, 24);
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
        const owners = [];
        if (idx?.refresh) {
          owners.push('library-index');
          idx.refresh('cross-surface-sync').catch(() => {});
        }
        // Workspace caches will bust naturally via the index-updated subscription.
        if (ws?._bustCaches) {
          owners.push('library-workspace');
          ws._bustCaches('cross-surface-sync');
        }
        state.lastRefreshOwners = owners;
      } catch (e) { err('refresh.bust', e); }
    }, COALESCE_MS);
  }

  function bindTransport() {
    if (state.bound) return true;
    // Prefer the platform adapter (Tauri-portable path).
    const pb = getPlatformBroadcast();
    if (pb) {
      try {
        state.unsub = pb.onAnyChange(handleChanges);
        state.transport = 'platform.broadcast';
        state.bound = true;
        step('bind.platform.broadcast');
        return true;
      } catch (e) { err('bind.platform.broadcast', e); /* fall through to legacy */ }
    }
    // Legacy direct chrome.storage path — preserved for graceful degradation
    // when the platform adapter is the fallback (e.g., chrome.* unavailable).
    if (!hasChromeStorage()) return false;
    if (!chrome.storage.onChanged || typeof chrome.storage.onChanged.addListener !== 'function') return false;
    try {
      const listener = (changes, area) => handleChanges(changes, area);
      chrome.storage.onChanged.addListener(listener);
      state.unsub = () => { try { chrome.storage.onChanged.removeListener(listener); } catch (_) {} };
      state.transport = 'chrome.storage.fallback';
      state.bound = true;
      step('bind.chrome.storage.fallback');
      return true;
    } catch (e) { err('bind.chrome.storage.fallback', e); return false; }
  }

  function broadcastFromStudio(reason, payload) {
    // Write a small ticking sentinel — native's listener (registered by
    // scripts/0F1h native counterpart) picks this up via chrome.storage.
    // The wire format (BROADCAST_KEY, body shape) is part of the legacy
    // cross-surface protocol and is intentionally preserved.
    const body = {
      ts: Date.now(),
      surface: 'studio',
      reason: String(reason || 'studio-change'),
      payload: payload && typeof payload === 'object' ? payload : null,
    };
    state.lastStudioBroadcastAt = body.ts;
    state.lastStudioBroadcastReason = body.reason;
    state.lastStudioBroadcastPayloadKeys = body.payload ? Object.keys(body.payload).slice(0, 24) : [];
    const pb = getPlatformBroadcast();
    if (pb) {
      try {
        state.lastStudioBroadcastTransport = 'platform.broadcast';
        // emitRaw is fire-and-forget for callers; preserve sync `return true`
        // semantics by not awaiting. Errors funnel into err() via .catch.
        pb.emitRaw(BROADCAST_KEY, body)
          .then(() => step('broadcast.platform', body.reason))
          .catch((e) => err('broadcast.platform', e));
        return true;
      } catch (e) { err('broadcast.platform', e); /* fall through to legacy */ }
    }
    if (!hasChromeStorage()) {
      state.lastStudioBroadcastTransport = 'drop:no-chrome-storage';
      return false;
    }
    try {
      state.lastStudioBroadcastTransport = 'chrome.storage.fallback';
      chrome.storage.local.set({ [BROADCAST_KEY]: body }, () => {
        step('broadcast.fallback', body.reason);
      });
      return true;
    } catch (e) {
      state.lastStudioBroadcastTransport = 'drop:error';
      err('broadcast.fallback', e);
      return false;
    }
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
    getNativeBroadcast() { return state.lastNativeBroadcastPayload || null; },
    refreshNativeBroadcast,
    diagnose() {
      if (!state.lastNativeBroadcastAt) {
        try { refreshNativeBroadcast('diagnose').catch(() => {}); } catch {}
      }
      const pb = getPlatformBroadcast();
      const env = W.H2O && W.H2O.Studio && W.H2O.Studio.platform && W.H2O.Studio.platform.env;
      return {
        surface: 'studio',
        bound: state.bound,
        transport: state.transport,                 // 'platform.broadcast' | 'chrome.storage.fallback' | null
        platformBroadcastAvailable: !!pb,
        platformAdapter: env ? env.adapter : null,  // 'mv3' | 'fallback' | 'tauri' (future)
        legacyKeyCompat: true,                      // BROADCAST_KEY/NATIVE_BROADCAST_KEY preserved for native interop
        hasChromeStorage: hasChromeStorage(),
        lastSync: state.lastSync,
        watchedPrefixes: WATCHED_PREFIXES,
        ignoredSelfRefreshKeys: Array.from(IGNORED_SELF_REFRESH_KEYS),
        broadcastKey: BROADCAST_KEY,
        nativeBroadcastKey: NATIVE_BROADCAST_KEY,
        coalesceMs: COALESCE_MS,
        projection: {
          watchedPrefixesCount: WATCHED_PREFIXES.length,
          lastChangeKeys: state.lastChangeKeys.slice(),
          lastWatchedHits: state.lastWatchedHits.slice(),
          lastEmittedReasons: state.lastEmittedReasons.slice(),
          lastRefreshOwners: state.lastRefreshOwners.slice(),
          nativeBroadcast: {
            observedAt: state.lastNativeBroadcastAt,
            ts: state.lastNativeBroadcastTs,
            payloadKeys: state.lastNativeBroadcastKeys.slice(),
            reasons: state.lastNativeBroadcastReasons.slice(),
            hasLinkedRecords: state.lastNativeBroadcastHasLinkedRecords,
            linkedRecordsCount: state.lastNativeBroadcastLinkedRecordsCount,
            projectCatalogCount: state.lastNativeBroadcastProjectCatalogCount,
            projectCatalogSource: state.lastNativeBroadcastProjectCatalogSource,
            readAt: state.lastNativeBroadcastReadAt,
            readSource: state.lastNativeBroadcastReadSource,
            readError: state.lastNativeBroadcastReadError,
          },
          studioBroadcast: {
            at: state.lastStudioBroadcastAt,
            reason: state.lastStudioBroadcastReason,
            payloadKeys: state.lastStudioBroadcastPayloadKeys.slice(),
            transport: state.lastStudioBroadcastTransport,
          },
        },
        subscribers: state.subscribers.size,
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  };

  H2O.Library.Sync = Sync;

  function bootBindings() {
    bindTransport();
    refreshNativeBroadcast('boot').catch(() => {});
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
