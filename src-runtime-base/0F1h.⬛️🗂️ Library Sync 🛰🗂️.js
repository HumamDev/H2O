// ==H2O Module==
// @h2o-id             0f1h.library_sync
// @name               0F1h.⬛️🗂️ Library Sync 🛰🗂️
// @namespace          H2O.Premium.CGX.library_sync
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000040
// @description        Native Library Sync: closes the cross-surface loop with Studio's S0F1h. Listens for chrome.storage broadcasts written by Studio mutations (#h2o:library:cross-surface:broadcast:v1) and dispatches evt:h2o:library:cross-surface-sync on the native window. Subscribes to native Library state-change events and writes a coalesced sentinel back to chrome.storage so Studio picks up native mutations too. Strictly additive — does not modify any existing native script; native scripts may opt-in by subscribing to evt:h2o:library:cross-surface-sync at their convenience.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ 0F1h Library Sync (native)', Date.now());

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 20 };
  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  // ── Constants ──────────────────────────────────────────────────────────────
  // Two distinct keys so each side reacts to the OTHER side's broadcast without
  // self-feedback loops. Studio writes STUDIO_BROADCAST_KEY; native writes
  // NATIVE_BROADCAST_KEY. Each listens for the key it does NOT write.
  const STUDIO_BROADCAST_KEY = 'h2o:library:cross-surface:broadcast:v1';
  const NATIVE_BROADCAST_KEY = 'h2o:library:cross-surface:broadcast:native:v1';
  const COALESCE_MS = 350;
  const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  const FOLDER_METADATA_OPERATION_REQUEST_SCHEMA = 'h2o.folder-metadata-operation-request.v1';
  const FOLDER_METADATA_OPERATION_SCHEMA = 'h2o.folder-metadata-operation.v1';
  const FOLDER_METADATA_OPERATION_RESULT_SCHEMA = 'h2o.folder-metadata-operation-result.v1';
  const FOLDER_METADATA_OPERATION_RESULT_MAX = 8;
  const FOLDER_METADATA_OPERATION_RESULT_REPLAY_MS = 30000;
  const FOLDER_METADATA_OWNER_RETRY_MS = 150;
  const FOLDER_METADATA_OWNER_RETRY_MAX = 30;
  const FOLDER_METADATA_REQUEST_MODES = new Set(['preview', 'apply']);

  // Native Library state-change events the module fans into the outbound
  // broadcast. New events can be added without code changes elsewhere — Studio
  // doesn't care about the reason names, only that a change happened.
  const NATIVE_EVENTS_TO_BROADCAST = [
    'evt:h2o:folders:changed',
    'evt:h2o:library-index:updated',
    'evt:h2o:chat-registry:changed',
    'evt:h2o:library:cat-candidate-pool-updated',
    'evt:h2o:library:autoclass-prefs-changed',
    'evt:h2o:library:autoclass-review-completed',
    'evt:h2o:tags:category-links-changed',
    'evt:h2o:projects:changed',
    'evt:h2o:projects:cache-updated',
    'evt:h2o:library-workspace:updated',
    'evt:h2o:chat-title:changed',
    'evt:h2o:chat-title:emoji-updated',
    'h2o:chat-title:changed',
    'h2o:chat-title:emoji-updated',
    'h2o:interface:meta-mirror',
  ];
  const IMMEDIATE_BROADCAST_EVENTS = new Set([
    'evt:h2o:projects:changed',
    'evt:h2o:projects:cache-updated',
  ]);

  // Page-world / content-script bridge channels. The chrome-live loader.js
  // content script listens to chrome.storage.onChanged in the extension's
  // privileged context and relays cross-surface broadcasts here via
  // window.postMessage, because page-world (where 0F1h runs on chatgpt.com)
  // has no direct chrome.storage access. We fall back to this bridge whenever
  // chrome.storage is unreachable from this context.
  //
  // Two redundant transports. window.postMessage cross-world hops can be
  // dropped silently in some isolated-world configurations, so we mirror
  // every frame onto a CustomEvent dispatched on `document`. The document
  // event system traverses the DOM, which IS shared between page main-world
  // and content-script isolated-world. Whichever transport survives wins;
  // the receiver dedupes (a single state.bridgeReady flip is idempotent).
  const BRIDGE_EVENT = 'h2o-ext-cs:v1:event';
  const BRIDGE_WRITE = 'h2o-ext-cs:v1:write';
  const BRIDGE_PROBE = 'h2o-ext-cs:v1:probe';
  const BRIDGE_READY = 'h2o-ext-cs:v1:ready';
  const EV_PROBE = 'h2o-ext-cs:probe';
  const EV_WRITE = 'h2o-ext-cs:write';
  const EV_READY = 'h2o-ext-cs:ready';
  const EV_EVENT = 'h2o-ext-cs:event';
  const EV_FOLDER_METADATA_RESULT = 'h2o-ext-cs:folder-metadata-result';

  const state = {
    storageBound: false,
    bridgeBound: false,
    bridgeReady: false,
    eventsBound: false,
    lastInbound: 0,
    lastInboundReason: '',
    lastInboundPayloadKeys: [],
    lastInboundPayloadSurface: '',
    lastInboundPayloadTs: 0,
    lastOutbound: 0,
    lastOutboundReasons: [],
    lastOutboundPayloadKeys: [],
    lastOutboundTransport: '',
    lastLinkedRecordsCount: 0,
    lastLinkedRecordsEligible: 0,
    lastLinkedRecordsCapped: false,
    lastProjectCatalogAvailable: false,
    lastProjectCatalogCount: 0,
    lastProjectCatalogCapped: false,
    lastProjectCatalogSource: '',
    lastFolderCatalogCount: 0,
    lastFolderBindingCount: 0,
    lastFolderCatalogCapped: false,
    lastFolderBindingCapped: false,
    lastFolderCatalogSource: '',
    lastFolderCatalogNamesSample: [],
    lastFolderCatalogChecksum: '',
    pendingFolderMetadataOperationResults: [],
    recentFolderMetadataOperationResults: [],
    lastFolderMetadataOperationResultAt: 0,
    lastFolderMetadataOperationResultCount: 0,
    lastFolderMetadataOperationResultRequestIds: [],
    lastFolderMetadataOperationRequestAt: 0,
    lastFolderMetadataOperationRequestCount: 0,
    lastFolderMetadataOperationRequestIds: [],
    lastFolderMetadataOperationRequestSummaries: [],
    handledFolderMetadataOperationRequestIds: new Set(),
    pendingFolderMetadataOperationRequests: new Map(),
    lastFolderMetadataOperationResultSummaries: [],
    folderBridgeReadyBroadcasted: false,
    lastFolderBridgeReadyBroadcastAt: 0,
    lastFolderBridgeReadyBroadcastReason: '',
    pendingTimer: null,
    pendingReasons: new Set(),
    subscribers: new Set(),
  };

  // ── Capability probes ──────────────────────────────────────────────────────
  function hasChromeStorage() {
    try {
      return !!(W.chrome && chrome.storage && chrome.storage.local
        && typeof chrome.storage.local.set === 'function');
    } catch { return false; }
  }
  function hasChromeStorageListener() {
    try {
      return !!(chrome.storage.onChanged
        && typeof chrome.storage.onChanged.addListener === 'function');
    } catch { return false; }
  }

  // ── Inbound: Studio → native ───────────────────────────────────────────────
  function emitSyncEvent(reason, payload) {
    const handledFolderMetadataOperationRequests = handleFolderMetadataOperationRequests(payload);
    const detail = {
      reason: String(reason || ''),
      payload: payload || null,
      t: Date.now(),
      surface: 'native',
      folderMetadataOperationRequestsHandled: handledFolderMetadataOperationRequests.length > 0,
      folderMetadataOperationRequestIds: handledFolderMetadataOperationRequests,
    };
    try {
      const p = payload && typeof payload === 'object' ? payload : null;
      state.lastInboundReason = detail.reason;
      state.lastInboundPayloadKeys = p ? Object.keys(p).slice(0, 24) : [];
      state.lastInboundPayloadSurface = String(p?.surface || '');
      state.lastInboundPayloadTs = Number(p?.ts || 0) || 0;
    } catch {}
    // Dual-event pattern (H2O convention): canonical evt:* + legacy alias + bus.
    try { W.dispatchEvent(new CustomEvent('evt:h2o:library:cross-surface-sync', { detail })); } catch {}
    try { W.dispatchEvent(new CustomEvent('h2o:library:cross-surface-sync', { detail })); } catch {}
    try { W.H2O?.events?.emit?.('library:cross-surface-sync', detail); } catch {}
    state.subscribers.forEach((fn) => { try { fn(detail); } catch (e) { err('subscriber', e); } });
    state.lastInbound = Date.now();
    step('inbound', String(reason || ''));
  }

  function addCode(list, code) {
    const normalized = String(code || '').trim();
    if (!normalized) return;
    if (!list.some((entry) => entry && entry.code === normalized)) list.push({ code: normalized });
  }

  function folderMetadataResultBase(request, code = '') {
    const req = request && typeof request === 'object' ? request : {};
    const op = req.operation && typeof req.operation === 'object' ? req.operation : {};
    const result = {
      schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
      requestId: String(req.requestId || '').trim(),
      requestMode: String(req.requestMode || '').trim(),
      ok: false,
      applied: false,
      noMutation: true,
      operationType: String(op.operationType || '').trim(),
      folderId: String(op.folderId || '').trim(),
      before: null,
      after: null,
      blockers: [],
      warnings: [],
    };
    addCode(result.blockers, code);
    return result;
  }

  function wrapFolderMetadataPreviewResult(request, preview) {
    const src = preview && typeof preview === 'object' ? preview : {};
    return {
      schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
      requestId: String(request?.requestId || '').trim(),
      requestMode: String(request?.requestMode || 'preview').trim() || 'preview',
      ok: Array.isArray(src.blockers) ? src.blockers.length === 0 : false,
      applied: false,
      noMutation: true,
      readOnly: src.readOnly === true,
      canApply: src.canApply === true,
      operationType: String(src.operationType || request?.operation?.operationType || '').trim(),
      folderId: String(src.folderId || request?.operation?.folderId || '').trim(),
      before: src.before && typeof src.before === 'object' ? src.before : null,
      after: Object.prototype.hasOwnProperty.call(src, 'after') ? src.after : null,
      blockers: Array.isArray(src.blockers) ? src.blockers.slice(0, 12) : [],
      warnings: Array.isArray(src.warnings) ? src.warnings.slice(0, 12) : [],
    };
  }

  function wrapFolderMetadataApplyResult(request, applied) {
    const src = applied && typeof applied === 'object' ? applied : {};
    return {
      schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
      requestId: String(request?.requestId || '').trim(),
      requestMode: String(request?.requestMode || 'apply').trim() || 'apply',
      ok: src.ok === true,
      applied: src.applied === true,
      noMutation: src.noMutation !== false,
      operationType: String(src.operationType || request?.operation?.operationType || '').trim(),
      folderId: String(src.folderId || request?.operation?.folderId || '').trim(),
      before: src.before && typeof src.before === 'object' ? src.before : null,
      after: Object.prototype.hasOwnProperty.call(src, 'after') ? src.after : null,
      blockers: Array.isArray(src.blockers) ? src.blockers.slice(0, 12) : [],
      warnings: Array.isArray(src.warnings) ? src.warnings.slice(0, 12) : [],
    };
  }

  function hasFolderMetadataOwner(mode = 'preview') {
    if (!H2O.folders || typeof H2O.folders.previewMetadataOperation !== 'function') return false;
    if (mode === 'apply' && typeof H2O.folders.applyMetadataOperation !== 'function') return false;
    return true;
  }

  function deferFolderMetadataOperationRequest(request, code = 'native-folder-owner-api-unavailable') {
    const req = request && typeof request === 'object' ? request : {};
    const id = String(req.requestId || '').trim();
    if (!id) {
      queueFolderMetadataOperationResult(folderMetadataResultBase(req, code));
      return null;
    }
    const existing = state.pendingFolderMetadataOperationRequests.get(id);
    if (existing) return null;
    const entry = {
      request: req,
      attempts: 0,
      code,
      createdAt: Date.now(),
      timer: null,
    };
    const retry = () => {
      entry.attempts += 1;
      if (hasFolderMetadataOwner(req.requestMode)) {
        state.pendingFolderMetadataOperationRequests.delete(id);
        executeFolderMetadataOperationRequest(req);
        return;
      }
      if (entry.attempts >= FOLDER_METADATA_OWNER_RETRY_MAX) {
        state.pendingFolderMetadataOperationRequests.delete(id);
        const result = folderMetadataResultBase(req, code);
        result.ownerWaitMs = Date.now() - entry.createdAt;
        queueFolderMetadataOperationResult(result);
        return;
      }
      entry.timer = W.setTimeout(retry, FOLDER_METADATA_OWNER_RETRY_MS);
    };
    state.pendingFolderMetadataOperationRequests.set(id, entry);
    entry.timer = W.setTimeout(retry, FOLDER_METADATA_OWNER_RETRY_MS);
    return null;
  }

  function executeFolderMetadataOperationRequest(request) {
    const req = request && typeof request === 'object' ? request : {};
    let result = null;
    try {
      const mode = String(req.requestMode || '').trim();
      const operation = req.operation && typeof req.operation === 'object' ? req.operation : null;
      if (req.schema !== FOLDER_METADATA_OPERATION_REQUEST_SCHEMA) {
        result = folderMetadataResultBase(req, 'invalid-request-schema');
      } else if (!FOLDER_METADATA_REQUEST_MODES.has(mode)) {
        result = folderMetadataResultBase(req, 'invalid-request-mode');
      } else if (!operation || operation.schema !== FOLDER_METADATA_OPERATION_SCHEMA) {
        result = folderMetadataResultBase(req, 'invalid-folder-metadata-operation');
      } else if (!hasFolderMetadataOwner(mode)) {
        deferFolderMetadataOperationRequest(req, 'native-folder-owner-api-unavailable');
        return null;
      } else if (mode === 'preview') {
        result = wrapFolderMetadataPreviewResult(req, H2O.folders.previewMetadataOperation(operation));
      } else if (mode === 'apply') {
        result = wrapFolderMetadataApplyResult(req, H2O.folders.applyMetadataOperation(operation));
      }
    } catch (e) {
      result = folderMetadataResultBase(req, 'native-folder-owner-error');
      result.error = String(e?.message || e || 'native-folder-owner-error');
      err('folderMetadata.request.execute', e);
    }
    if (!result) result = folderMetadataResultBase(req, 'invalid-folder-metadata-operation');
    queueFolderMetadataOperationResult(result);
    return result;
  }

  function folderMetadataRequestsFromPayload(payload) {
    const body = payload && typeof payload === 'object' ? payload : null;
    const nested = body?.payload && typeof body.payload === 'object' ? body.payload : null;
    const sources = [
      body?.folderMetadataOperationRequests,
      nested?.folderMetadataOperationRequests,
    ];
    const out = [];
    for (const value of sources) {
      if (Array.isArray(value)) out.push(...value);
      else if (value && typeof value === 'object') out.push(value);
    }
    return out.filter(Boolean).slice(0, 8);
  }

  function handleFolderMetadataOperationRequests(payload) {
    const requests = folderMetadataRequestsFromPayload(payload);
    if (!requests.length) return [];
    const handledIds = [];
    for (const request of requests) {
      const id = String(request?.requestId || '').trim();
      if (!id || state.handledFolderMetadataOperationRequestIds.has(id)) continue;
      state.handledFolderMetadataOperationRequestIds.add(id);
      handledIds.push(id);
      const op = request?.operation && typeof request.operation === 'object' ? request.operation : {};
      state.lastFolderMetadataOperationRequestSummaries.push({
        requestId: id,
        requestMode: String(request?.requestMode || '').trim(),
        operationType: String(op.operationType || '').trim(),
        folderId: String(op.folderId || '').trim(),
        folderName: String(op.after?.name || op.name || '').trim(),
        ownerAvailable: hasFolderMetadataOwner(String(request?.requestMode || '').trim() || 'preview'),
        at: Date.now(),
      });
      if (state.lastFolderMetadataOperationRequestSummaries.length > FOLDER_METADATA_OPERATION_RESULT_MAX) {
        state.lastFolderMetadataOperationRequestSummaries.splice(0, state.lastFolderMetadataOperationRequestSummaries.length - FOLDER_METADATA_OPERATION_RESULT_MAX);
      }
      executeFolderMetadataOperationRequest(request);
    }
    if (state.handledFolderMetadataOperationRequestIds.size > 64) {
      state.handledFolderMetadataOperationRequestIds = new Set(Array.from(state.handledFolderMetadataOperationRequestIds).slice(-32));
    }
    if (handledIds.length) {
      state.lastFolderMetadataOperationRequestAt = Date.now();
      state.lastFolderMetadataOperationRequestCount += handledIds.length;
      state.lastFolderMetadataOperationRequestIds = handledIds.slice(-FOLDER_METADATA_OPERATION_RESULT_MAX);
      step('folder-metadata.requests', String(handledIds.length));
    }
    return handledIds;
  }

  function bindStorage() {
    if (state.storageBound) return true;
    if (!hasChromeStorage() || !hasChromeStorageListener()) {
      step('bind.storage.skip', 'no chrome.storage');
      return false;
    }
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        // React to STUDIO_BROADCAST_KEY only — our own NATIVE_BROADCAST_KEY
        // would create a self-feedback loop if we listened for it here.
        if (!(STUDIO_BROADCAST_KEY in changes)) return;
        const change = changes[STUDIO_BROADCAST_KEY];
        emitSyncEvent('studio-broadcast', change?.newValue || null);
      });
      state.storageBound = true;
      step('bind.storage');
      return true;
    } catch (e) { err('bind.storage', e); return false; }
  }

  // Fallback path: page-world doesn't see chrome.storage, but the loader.js
  // content script relays onChanged events via window.postMessage. We
  // subscribe regardless of bindStorage outcome — when both are bound it's
  // harmless because changes initiated through the bridge still produce the
  // STUDIO_BROADCAST_KEY-only emit and the direct path filters by key as well.
  function markReady(via) {
    if (state.bridgeReady) return;
    state.bridgeReady = true;
    step('bridge.ready', String(via || ''));
    if (!state.folderBridgeReadyBroadcasted) {
      state.folderBridgeReadyBroadcasted = true;
      state.lastFolderBridgeReadyBroadcastAt = Date.now();
      state.lastFolderBridgeReadyBroadcastReason = String(via || 'bridge-ready');
      W.setTimeout(() => {
        broadcastImmediately('bridge-ready:folder-state');
      }, 50);
    }
  }

  function handleInboundEvent(key, newValue, source) {
    if (key !== STUDIO_BROADCAST_KEY) return;
    // A delivered cross-surface event proves the bridge is alive even if
    // we somehow missed the probe → READY handshake.
    markReady('event:' + (source || ''));
    emitSyncEvent('studio-broadcast', newValue || null);
  }

  function bindBridge() {
    if (state.bridgeBound) return true;
    try {
      // Transport 1: window.postMessage. Cross-world ev.source filtering
      // was removed because main-world ↔ isolated-world WindowProxy
      // identities differ. Gates on the uniquely-namespaced type strings.
      W.addEventListener('message', (ev) => {
        const data = ev && ev.data;
        if (!data || typeof data !== 'object') return;
        const t = data.type;
        if (t === BRIDGE_READY) { markReady('postMessage'); return; }
        if (t === BRIDGE_EVENT) { handleInboundEvent(data.key, data.newValue, 'postMessage'); return; }
      });

      // Transport 2: document CustomEvent. Survives the isolated-world
      // edge cases where window.postMessage cross-world hops are dropped.
      D.addEventListener(EV_READY, () => { markReady('custom-event'); });
      D.addEventListener(EV_EVENT, (ev) => {
        const d = (ev && ev.detail) || {};
        handleInboundEvent(d.key, d.newValue, 'custom-event');
      });

      state.bridgeBound = true;
      step('bind.bridge');

      // Probe with retry, fanned out on BOTH transports. The first probe
      // almost always succeeds; the retry exists as a guard against any
      // transient ordering issue. We stop the moment bridgeReady flips.
      let attempts = 0;
      const MAX_ATTEMPTS = 6;
      const PROBE_DELAY_MS = 250;
      const tryProbe = () => {
        if (state.bridgeReady) return;
        if (attempts >= MAX_ATTEMPTS) { step('bridge.probe.timeout', String(attempts)); return; }
        attempts++;
        try { W.postMessage({ type: BRIDGE_PROBE, t: Date.now(), attempt: attempts }, '*'); } catch {}
        try { D.dispatchEvent(new CustomEvent(EV_PROBE, { detail: { t: Date.now(), attempt: attempts } })); } catch {}
        W.setTimeout(tryProbe, PROBE_DELAY_MS);
      };
      tryProbe();
      return true;
    } catch (e) { err('bind.bridge', e); return false; }
  }

  // Project a compact linked-only snapshot from H2O.ChatRegistry into the
  // broadcast payload. Native page-world cannot reach chrome.storage and
  // Studio (chrome-extension origin) cannot reach chatgpt.com's localStorage
  // — so the broadcast key (which already crosses the boundary via the
  // bridge) is the only viable transport for record-level state.
  //
  // Strict filter: only records that are explicitly linked AND not saved
  // AND have a parsable chatId are included. Saved records flow into Studio
  // through the archive bridge; including them here would duplicate.
  // Size-capped to LINKED_SNAPSHOT_MAX so a runaway registry can't bloat
  // chrome.storage (Chrome's per-key quota is 8 KiB by default and we
  // share the key with the existing reasons array).
  const LINKED_SNAPSHOT_MAX = 500;
  const PROJECT_CATALOG_MAX = 250;
  const FOLDER_CATALOG_MAX = 250;
  const FOLDER_BINDING_MAX = 1200;
  const FOLDER_BINDINGS_PER_FOLDER_MAX = 250;
  function snapshotLinkedRecords() {
    try {
      const reg = W.H2O && W.H2O.ChatRegistry;
      if (!reg || typeof reg.listRecords !== 'function') {
        state.lastLinkedRecordsCount = 0;
        state.lastLinkedRecordsEligible = 0;
        state.lastLinkedRecordsCapped = false;
        return [];
      }
      const out = [];
      let eligible = 0;
      const records = reg.listRecords({ includeDeleted: false }) || [];
      for (const rec of records) {
        if (!rec || !rec.chatId || !rec.state) continue;
        if (!rec.state.isLinked) continue;
        if (rec.state.isSaved) continue;
        eligible++;
        if (out.length < LINKED_SNAPSHOT_MAX) {
          out.push({
            chatId: rec.chatId,
            title: rec.title || '',
            href: rec.href || '',
            normalizedHref: rec.normalizedHref || '',
            linkSourceHref: rec.linkSourceHref || '',
            linkedAt: rec.linkedAt || '',
            linkedFrom: rec.linkedFrom || '',
            updatedAt: rec.updatedAt || '',
            firstSeenAt: rec.firstSeenAt || '',
            lastSeenAt: rec.lastSeenAt || '',
            project: rec.project ? { projectId: rec.project.projectId || '', projectName: rec.project.projectName || '' } : null,
            state: {
              isLinked: true,
              isSaved: false,
              isImported: !!rec.state.isImported,
            },
          });
        }
        if (out.length >= LINKED_SNAPSHOT_MAX) break;
      }
      state.lastLinkedRecordsCount = out.length;
      state.lastLinkedRecordsEligible = eligible;
      state.lastLinkedRecordsCapped = out.length >= LINKED_SNAPSHOT_MAX;
      return out;
    } catch (e) {
      state.lastLinkedRecordsCount = 0;
      state.lastLinkedRecordsEligible = 0;
      state.lastLinkedRecordsCapped = false;
      err('snapshotLinkedRecords', e);
      return [];
    }
  }

  function normalizeProjectCatalogRow(row, index) {
    const src = row && typeof row === 'object' ? row : {};
    const id = String(src.id || src.projectId || '').trim();
    if (!id) return null;
    const title = String(src.title || src.name || src.projectName || id).trim() || id;
    const href = String(src.href || src.nativeProjectHref || '').trim();
    return {
      id,
      projectId: id,
      title,
      name: title,
      projectName: title,
      href,
      nativeProjectHref: href,
      index: Number.isFinite(Number(src.index)) ? Number(src.index) : index,
      source: String(src.source || 'native-project-cache'),
    };
  }

  function snapshotProjectCatalog() {
    try {
      const projects = W.H2O && W.H2O.Projects;
      const store = typeof projects?.readStore === 'function' ? projects.readStore() : null;
      const bestRows = Array.isArray(store?.bestRows) ? store.bestRows : [];
      const rows = Array.isArray(store?.rows) ? store.rows : [];
      let fallbackRows = [];
      if (!bestRows.length && !rows.length && typeof projects?.owner?.loadRowsFast === 'function') {
        try {
          const fastRows = projects.owner.loadRowsFast();
          fallbackRows = Array.isArray(fastRows) ? fastRows : [];
        } catch (error) {
          err('snapshotProjectCatalog.loadRowsFast', error);
        }
      }
      const sourceRows = bestRows.length ? bestRows : (rows.length ? rows : fallbackRows);
      const out = [];
      for (let i = 0; i < sourceRows.length; i += 1) {
        const row = normalizeProjectCatalogRow(sourceRows[i], i);
        if (row) out.push(row);
        if (out.length >= PROJECT_CATALOG_MAX) break;
      }
      state.lastProjectCatalogCount = out.length;
      state.lastProjectCatalogAvailable = !!out.length;
      state.lastProjectCatalogCapped = sourceRows.length > out.length;
      state.lastProjectCatalogSource = bestRows.length
        ? 'H2O.Projects.readStore.bestRows'
        : rows.length
        ? 'H2O.Projects.readStore.rows'
        : fallbackRows.length
        ? 'H2O.Projects.owner.loadRowsFast'
        : 'none';
      return {
        source: state.lastProjectCatalogSource,
        rows: out,
        count: out.length,
        capped: state.lastProjectCatalogCapped,
        cap: PROJECT_CATALOG_MAX,
        store: {
          source: String(store?.source || ''),
          bestSource: String(store?.bestSource || ''),
          rowCount: Number(store?.itemCount || rows.length || 0) || 0,
          bestRowCount: Number(store?.bestRowCount || bestRows.length || 0) || 0,
          complete: !!store?.complete,
          bestComplete: !!store?.bestComplete,
          lastSuccessAt: Number(store?.lastSuccessAt || 0) || 0,
          lastReconciledAt: Number(store?.lastReconciledAt || 0) || 0,
        },
      };
    } catch (e) {
      state.lastProjectCatalogCount = 0;
      state.lastProjectCatalogAvailable = false;
      state.lastProjectCatalogCapped = false;
      state.lastProjectCatalogSource = 'error';
      err('snapshotProjectCatalog', e);
      return { source: 'error', rows: [], count: 0, capped: false, cap: PROJECT_CATALOG_MAX, store: null };
    }
  }

  function normalizeFolderBridgeRow(row, index) {
    const src = row && typeof row === 'object' ? row : {};
    const id = String(src.id || src.folderId || '').trim();
    if (!id) return null;
    const name = String(src.name || src.title || id).trim() || id;
    const iconColor = String(src.iconColor || src.color || '').trim();
    const color = String(src.color || src.iconColor || '').trim();
    const out = {
      id,
      folderId: id,
      name,
      title: name,
      source: String(src.source || 'native-folder-catalog').trim() || 'native-folder-catalog',
      index,
    };
    if (String(src.kind || '').trim()) out.kind = String(src.kind || '').trim();
    if (src.projectRef && typeof src.projectRef === 'object') out.projectRef = src.projectRef;
    if (iconColor) out.iconColor = iconColor;
    if (color) out.color = color;
    if (String(src.icon || '').trim()) out.icon = String(src.icon || '').trim();
    if (String(src.parentId || '').trim()) out.parentId = String(src.parentId || '').trim();
    if (Object.prototype.hasOwnProperty.call(src, 'sortOrder')) out.sortOrder = src.sortOrder;
    if (Object.prototype.hasOwnProperty.call(src, 'createdAt')) out.createdAt = src.createdAt;
    if (Object.prototype.hasOwnProperty.call(src, 'updatedAt')) out.updatedAt = src.updatedAt;
    return out;
  }

  function stableFolderStateChecksum(value) {
    let text = '';
    try { text = JSON.stringify(value || null); } catch { text = String(value || ''); }
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    return `h2o-folder-${(hash >>> 0).toString(16)}`;
  }

  function snapshotFolderState() {
    try {
      const foldersApi = W.H2O && (W.H2O.folders || W.H2O.LibraryFolders || W.H2O.Library?.Folders);
      const rowsRaw = typeof foldersApi?.list === 'function'
        ? foldersApi.list()
        : (Array.isArray(foldersApi?.folders) ? foldersApi.folders : []);
      const folders = [];
      const seen = new Set();
      const sourceRows = Array.isArray(rowsRaw) ? rowsRaw : [];
      let folderCapped = false;
      for (let i = 0; i < sourceRows.length; i += 1) {
        const row = normalizeFolderBridgeRow(sourceRows[i], i);
        if (!row || seen.has(row.id)) continue;
        seen.add(row.id);
        folders.push(row);
        if (folders.length >= FOLDER_CATALOG_MAX) {
          folderCapped = sourceRows.length > (i + 1);
          break;
        }
      }

      const parity = typeof foldersApi?.diagnose === 'function' ? foldersApi.diagnose()?.folderParity : null;
      const parityFolders = Array.isArray(parity?.folders) ? parity.folders : [];
      const parityById = new Map();
      parityFolders.forEach((folder) => {
        const id = String(folder?.id || folder?.folderId || '').trim();
        if (id) parityById.set(id, folder);
      });

      const items = {};
      let bindingCount = 0;
      let eligibleBindingCount = 0;
      let bindingCapped = false;
      for (const folder of folders) {
        const parityFolder = parityById.get(folder.id);
        const bindingKeys = Array.isArray(parityFolder?.bindingKeys)
          ? parityFolder.bindingKeys.map((value) => String(value || '').trim()).filter(Boolean)
          : [];
        eligibleBindingCount += bindingKeys.length;
        const values = [];
        for (const value of bindingKeys) {
          if (values.length >= FOLDER_BINDINGS_PER_FOLDER_MAX) { bindingCapped = true; break; }
          if (bindingCount >= FOLDER_BINDING_MAX) { bindingCapped = true; break; }
          if (!values.includes(value)) {
            values.push(value);
            bindingCount += 1;
          }
        }
        items[folder.id] = values;
      }

      const payload = {
        source: 'native-folder-catalog',
        key: FOLDER_STATE_DATA_KEY,
        folders,
        items,
        counts: {
          folderCount: folders.length,
          eligibleFolderCount: sourceRows.length,
          bindingCount,
          eligibleBindingCount,
          emptyFolderCount: folders.filter((folder) => !items[folder.id]?.length).length,
          boundFolderCount: folders.filter((folder) => !!items[folder.id]?.length).length,
        },
        capped: {
          folders: folderCapped,
          bindings: bindingCapped || eligibleBindingCount > bindingCount,
        },
        caps: {
          folders: FOLDER_CATALOG_MAX,
          bindings: FOLDER_BINDING_MAX,
          bindingsPerFolder: FOLDER_BINDINGS_PER_FOLDER_MAX,
        },
        samples: {
          folderNames: folders.map((folder) => folder.name).slice(0, 12),
          folderIds: folders.map((folder) => folder.id).slice(0, 12),
        },
      };
      payload.checksum = stableFolderStateChecksum({ folders: payload.folders, items: payload.items });

      state.lastFolderCatalogCount = folders.length;
      state.lastFolderBindingCount = bindingCount;
      state.lastFolderCatalogCapped = !!payload.capped.folders;
      state.lastFolderBindingCapped = !!payload.capped.bindings;
      state.lastFolderCatalogSource = folders.length ? 'H2O.folders.list' : 'none';
      state.lastFolderCatalogNamesSample = payload.samples.folderNames.slice();
      state.lastFolderCatalogChecksum = payload.checksum;
      return payload;
    } catch (e) {
      state.lastFolderCatalogCount = 0;
      state.lastFolderBindingCount = 0;
      state.lastFolderCatalogCapped = false;
      state.lastFolderBindingCapped = false;
      state.lastFolderCatalogSource = 'error';
      state.lastFolderCatalogNamesSample = [];
      state.lastFolderCatalogChecksum = '';
      err('snapshotFolderState', e);
      return {
        source: 'native-folder-catalog',
        key: FOLDER_STATE_DATA_KEY,
        folders: [],
        items: {},
        counts: { folderCount: 0, eligibleFolderCount: 0, bindingCount: 0, eligibleBindingCount: 0, emptyFolderCount: 0, boundFolderCount: 0 },
        capped: { folders: false, bindings: false },
        caps: { folders: FOLDER_CATALOG_MAX, bindings: FOLDER_BINDING_MAX, bindingsPerFolder: FOLDER_BINDINGS_PER_FOLDER_MAX },
        samples: { folderNames: [], folderIds: [] },
        checksum: '',
        error: String(e?.message || e || 'folder-state-snapshot-error'),
      };
    }
  }

  function normalizeFolderMetadataOperationResult(result) {
    const src = result && typeof result === 'object' ? result : {};
    const requestId = String(src.requestId || '').trim();
    const requestMode = String(src.requestMode || '').trim();
    return {
      schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
      requestId,
      requestMode,
      ok: src.ok === true,
      applied: src.applied === true,
      noMutation: src.noMutation !== false,
      readOnly: src.readOnly === true,
      canApply: src.canApply === true,
      operationType: String(src.operationType || src.operation?.operationType || '').trim(),
      folderId: String(src.folderId || src.operation?.folderId || '').trim(),
      before: src.before && typeof src.before === 'object' ? src.before : null,
      after: Object.prototype.hasOwnProperty.call(src, 'after') ? src.after : null,
      blockers: Array.isArray(src.blockers) ? src.blockers.slice(0, 12) : [],
      warnings: Array.isArray(src.warnings) ? src.warnings.slice(0, 12) : [],
      error: src.error ? String(src.error) : '',
      t: Number(src.t || Date.now()) || Date.now(),
    };
  }

  function queueFolderMetadataOperationResult(result) {
    const normalized = normalizeFolderMetadataOperationResult(result);
    if (!normalized.requestId) normalized.blockers.push({ code: 'missing-request-id' });
    state.lastFolderMetadataOperationResultSummaries.push({
      requestId: normalized.requestId,
      requestMode: normalized.requestMode,
      operationType: normalized.operationType,
      folderId: normalized.folderId,
      ok: normalized.ok,
      applied: normalized.applied,
      blockers: normalized.blockers.map((entry) => String(entry?.code || '')).filter(Boolean).slice(0, 8),
      at: Date.now(),
    });
    if (state.lastFolderMetadataOperationResultSummaries.length > FOLDER_METADATA_OPERATION_RESULT_MAX) {
      state.lastFolderMetadataOperationResultSummaries.splice(0, state.lastFolderMetadataOperationResultSummaries.length - FOLDER_METADATA_OPERATION_RESULT_MAX);
    }
    try {
      D.dispatchEvent(new CustomEvent(EV_FOLDER_METADATA_RESULT, {
        detail: { result: normalized, t: Date.now() },
      }));
    } catch {}
    state.pendingFolderMetadataOperationResults.push(normalized);
    state.recentFolderMetadataOperationResults.push({ ...normalized, replayUntil: Date.now() + FOLDER_METADATA_OPERATION_RESULT_REPLAY_MS });
    if (state.recentFolderMetadataOperationResults.length > FOLDER_METADATA_OPERATION_RESULT_MAX) {
      state.recentFolderMetadataOperationResults.splice(0, state.recentFolderMetadataOperationResults.length - FOLDER_METADATA_OPERATION_RESULT_MAX);
    }
    if (state.pendingFolderMetadataOperationResults.length > FOLDER_METADATA_OPERATION_RESULT_MAX) {
      state.pendingFolderMetadataOperationResults.splice(0, state.pendingFolderMetadataOperationResults.length - FOLDER_METADATA_OPERATION_RESULT_MAX);
    }
    state.lastFolderMetadataOperationResultAt = Date.now();
    state.lastFolderMetadataOperationResultCount += 1;
    state.lastFolderMetadataOperationResultRequestIds = state.pendingFolderMetadataOperationResults
      .map((item) => String(item.requestId || '').trim())
      .filter(Boolean)
      .slice(-FOLDER_METADATA_OPERATION_RESULT_MAX);
    broadcastImmediately('folder-metadata-operation-result');
    return normalized;
  }

  // ── Outbound: native → Studio ──────────────────────────────────────────────
  function broadcastNow() {
    const reasons = Array.from(state.pendingReasons);
    state.pendingReasons.clear();
    const now = Date.now();
    state.recentFolderMetadataOperationResults = state.recentFolderMetadataOperationResults.filter((item) => Number(item?.replayUntil || 0) > now);
    const folderMetadataResultMap = new Map();
    state.recentFolderMetadataOperationResults.forEach((item) => {
      const clean = { ...item };
      delete clean.replayUntil;
      if (clean.requestId) folderMetadataResultMap.set(clean.requestId, clean);
    });
    state.pendingFolderMetadataOperationResults.splice(0, FOLDER_METADATA_OPERATION_RESULT_MAX).forEach((item) => {
      if (item.requestId) folderMetadataResultMap.set(item.requestId, item);
    });
    const folderMetadataOperationResults = Array.from(folderMetadataResultMap.values()).slice(-FOLDER_METADATA_OPERATION_RESULT_MAX);
    const body = {
      ts: Date.now(),
      surface: 'native',
      reasons,
      // Phase 7 fix: include a projected linked-only snapshot so Studio's
      // S0F1c can merge linked records into its Library Index. The full
      // native registry lives in chatgpt.com's localStorage and is otherwise
      // unreachable from Studio.
      linkedRecords: snapshotLinkedRecords(),
      // Phase 7C read-only projection: native project cache names live in
      // page localStorage. Studio cannot read that origin, so expose a bounded
      // catalog summary through the existing cross-surface sync envelope.
      projectCatalog: snapshotProjectCatalog(),
      // Folder catalog bridge: project the native folder catalog/state into
      // Studio's existing folder-state key. This is read-only on native.
      folderState: snapshotFolderState(),
    };
    if (folderMetadataOperationResults.length) {
      body.folderMetadataOperationResults = folderMetadataOperationResults;
    }
    state.lastOutboundReasons = reasons.slice(0, 24);
    state.lastOutboundPayloadKeys = Object.keys(body).slice(0, 24);
    if (hasChromeStorage()) {
      try {
        state.lastOutboundTransport = 'chrome.storage';
        chrome.storage.local.set({ [NATIVE_BROADCAST_KEY]: body }, () => {
          state.lastOutbound = body.ts;
          step('outbound', String(reasons.length));
        });
        return;
      } catch (e) { err('broadcast', e); /* fall through to bridge */ }
    }
    if (state.bridgeBound) {
      const writePayload = { key: NATIVE_BROADCAST_KEY, value: body, t: body.ts };
      let sent = false;
      try { W.postMessage({ type: BRIDGE_WRITE, ...writePayload }, '*'); sent = true; } catch (e) { err('broadcast.bridge.postMessage', e); }
      try { D.dispatchEvent(new CustomEvent(EV_WRITE, { detail: writePayload })); sent = true; } catch (e) { err('broadcast.bridge.event', e); }
      if (sent) {
        state.lastOutboundTransport = 'bridge';
        state.lastOutbound = body.ts;
        step('outbound.bridge', String(reasons.length));
      } else {
        state.lastOutboundTransport = 'drop:transport-failed';
        step('outbound.drop', 'transport-failed');
      }
    } else {
      state.lastOutboundTransport = 'drop:no-transport';
      step('outbound.drop', 'no transport');
    }
  }

  function scheduleBroadcast(reason) {
    state.pendingReasons.add(String(reason || 'change'));
    if (state.pendingTimer) return;
    state.pendingTimer = W.setTimeout(() => {
      state.pendingTimer = null;
      broadcastNow();
    }, COALESCE_MS);
  }

  function broadcastImmediately(reason) {
    state.pendingReasons.add(String(reason || 'change'));
    if (state.pendingTimer) {
      try { W.clearTimeout(state.pendingTimer); } catch {}
      state.pendingTimer = null;
    }
    broadcastNow();
  }

  function bindNativeEvents() {
    if (state.eventsBound) return true;
    try {
      for (const ev of NATIVE_EVENTS_TO_BROADCAST) {
        W.addEventListener(ev, () => {
          if (IMMEDIATE_BROADCAST_EVENTS.has(ev)) broadcastImmediately(ev);
          else scheduleBroadcast(ev);
        });
      }
      state.eventsBound = true;
      step('bind.events', String(NATIVE_EVENTS_TO_BROADCAST.length));
      return true;
    } catch (e) { err('bind.events', e); return false; }
  }

  // ── Public API (mirror of Studio S0F1h) ────────────────────────────────────
  const Sync = {
    surface: 'native',
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      state.subscribers.add(fn);
      return () => state.subscribers.delete(fn);
    },
    broadcast(reason, payload) {
      scheduleBroadcast(reason || 'manual');
    },
    pingStudio(reason) { scheduleBroadcast(reason || 'manual.ping'); broadcastNow(); },
    flushFolderState(reason) { broadcastImmediately(reason || 'manual.folder-state'); return true; },
    queueFolderMetadataOperationResult,
    diagnose() {
      return {
        surface: 'native',
        version: '1.0.0',
        storageBound: state.storageBound,
        bridgeBound: state.bridgeBound,
        bridgeReady: state.bridgeReady,
        eventsBound: state.eventsBound,
        hasChromeStorage: hasChromeStorage(),
        watchedKey: STUDIO_BROADCAST_KEY,
        broadcastKey: NATIVE_BROADCAST_KEY,
        coalesceMs: COALESCE_MS,
        eventsListened: NATIVE_EVENTS_TO_BROADCAST.slice(),
        deprecation: {
          phase: '9B',
          surface: 'native',
          status: 'active-required',
          behaviorChanged: false,
          activeRequired: [
            'native-to-Studio broadcast remains required for linked records and projectCatalog projection',
            'Studio-to-native sync consumer events remain required while native owns folder/category/label/tag/project writes',
            'chrome.storage broadcast keys remain transport envelopes, not canonical stores',
          ],
          futureDeprecated: [
            'state-projection payloads after canonical SW-IDB cache-invalidation is explicitly designed and validated',
          ],
          doNotRemoveUntil: [
            'canonical reads are enabled for migrated domains',
            'live dual-read and cache-invalidation semantics replace projection broadcasts',
            'Studio no longer depends on native projectCatalog or linked-record broadcast',
          ],
        },
        lastInbound: state.lastInbound,
        lastOutbound: state.lastOutbound,
        projection: {
          watchedKey: STUDIO_BROADCAST_KEY,
          broadcastKey: NATIVE_BROADCAST_KEY,
          eventsListenedCount: NATIVE_EVENTS_TO_BROADCAST.length,
          inbound: {
            at: state.lastInbound,
            reason: state.lastInboundReason,
            payloadKeys: state.lastInboundPayloadKeys.slice(),
            surface: state.lastInboundPayloadSurface,
            ts: state.lastInboundPayloadTs,
          },
          outbound: {
            at: state.lastOutbound,
            reasons: state.lastOutboundReasons.slice(),
            payloadKeys: state.lastOutboundPayloadKeys.slice(),
            transport: state.lastOutboundTransport,
          },
          linkedRecords: {
            count: state.lastLinkedRecordsCount,
            eligibleCountSampled: state.lastLinkedRecordsEligible,
            eligibleCountComplete: !state.lastLinkedRecordsCapped,
            capped: state.lastLinkedRecordsCapped,
            cap: LINKED_SNAPSHOT_MAX,
          },
          projectCatalog: {
            available: !!state.lastProjectCatalogAvailable,
            count: Number(state.lastProjectCatalogCount || 0) || 0,
            capped: !!state.lastProjectCatalogCapped,
            cap: PROJECT_CATALOG_MAX,
            source: String(state.lastProjectCatalogSource || ''),
          },
          folderState: {
            source: String(state.lastFolderCatalogSource || ''),
            key: FOLDER_STATE_DATA_KEY,
            folderCount: Number(state.lastFolderCatalogCount || 0) || 0,
            bindingCount: Number(state.lastFolderBindingCount || 0) || 0,
            folderCapped: !!state.lastFolderCatalogCapped,
            bindingCapped: !!state.lastFolderBindingCapped,
            folderCap: FOLDER_CATALOG_MAX,
            bindingCap: FOLDER_BINDING_MAX,
            bindingPerFolderCap: FOLDER_BINDINGS_PER_FOLDER_MAX,
            checksum: String(state.lastFolderCatalogChecksum || ''),
            folderNamesSample: state.lastFolderCatalogNamesSample.slice(),
            bridgeReadyBroadcasted: !!state.folderBridgeReadyBroadcasted,
            bridgeReadyBroadcastAt: state.lastFolderBridgeReadyBroadcastAt,
            bridgeReadyBroadcastReason: state.lastFolderBridgeReadyBroadcastReason,
          },
          folderMetadataOperations: {
            requestSchema: FOLDER_METADATA_OPERATION_REQUEST_SCHEMA,
            operationSchema: FOLDER_METADATA_OPERATION_SCHEMA,
            resultSchema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
            requestsHandledAt: state.lastFolderMetadataOperationRequestAt,
            requestsHandledCount: state.lastFolderMetadataOperationRequestCount,
            lastHandledRequestIds: state.lastFolderMetadataOperationRequestIds.slice(),
            lastHandledRequestSummaries: state.lastFolderMetadataOperationRequestSummaries.slice(),
            pendingOwnerRequestCount: state.pendingFolderMetadataOperationRequests.size,
            pendingResultCount: state.pendingFolderMetadataOperationResults.length,
            recentResultCount: state.recentFolderMetadataOperationResults.length,
            lastResultAt: state.lastFolderMetadataOperationResultAt,
            lastResultCount: state.lastFolderMetadataOperationResultCount,
            lastRequestIds: state.lastFolderMetadataOperationResultRequestIds.slice(),
            lastResultSummaries: state.lastFolderMetadataOperationResultSummaries.slice(),
            maxResultsPerBroadcast: FOLDER_METADATA_OPERATION_RESULT_MAX,
            replayMs: FOLDER_METADATA_OPERATION_RESULT_REPLAY_MS,
          },
        },
        subscribers: state.subscribers.size,
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  };

  H2O.Library.Sync = Sync;

  // ── Boot ──────────────────────────────────────────────────────────────────
  function bootBindings() {
    bindStorage();
    bindBridge();
    bindNativeEvents();
    // Phase 7 fix: kick an initial broadcast a moment after boot so Studio
    // receives the current linked-only snapshot even when no chat-registry
    // change has fired yet. Delayed to let H2O.ChatRegistry finish hydrating.
    W.setTimeout(() => {
      scheduleBroadcast('boot:initial-snapshot');
    }, 1200);
    W.setTimeout(() => {
      scheduleBroadcast('boot:folder-state-projection');
    }, 2600);
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

  // Library Core may not be ready when 0F1h boots (depends on dev-order). We
  // poll-via-event the same way Studio modules do: try immediately, then bind
  // a one-shot listener for the Library Ready event.
  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }
  bootBindings();

  step('boot', 'native-library-sync-ready');
})();
