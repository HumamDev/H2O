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
  const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  const EXTERNAL_NATIVE_FOLDER_MERGE_DIAG_KEY = 'h2o:library:native-folder-state:external-merge:diagnostic:v1';
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
  const FOLDER_METADATA_OPERATION_REQUEST_SCHEMA = 'h2o.folder-metadata-operation-request.v1';
  const FOLDER_METADATA_OPERATION_SCHEMA = 'h2o.folder-metadata-operation.v1';
  const FOLDER_METADATA_OPERATION_RESULT_SCHEMA = 'h2o.folder-metadata-operation-result.v1';
  const FOLDER_METADATA_REQUEST_DEFAULT_TIMEOUT_MS = 5000;
  const FOLDER_METADATA_REQUEST_MAX_PENDING = 32;
  const FOLDER_METADATA_STUDIO_BROADCAST_MESSAGE = 'h2o:library:studio-broadcast:v1';
  const NATIVE_OWNER_EXTENSION_IDS = [
    'bgdapdcjckbiejckpfeinlmcdnijifpg', // prod
    'bkijejgemjjolmdnkgcimoaniocegkij', // dev-controls
    'ceenhihlkfdfjdolchjffpeejblnejdb', // dev-controls-armed
    'ogcjkeaiicglflamhjaaimdhphjlgkbb', // dev-controls-oauth-google
    'eeebgndgehjalflefaldogahaklnlahi', // dev-lean
  ];

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
    lastNativeBroadcastFolderCount: 0,
    lastNativeBroadcastFolderBindingCount: 0,
    lastNativeBroadcastFolderSource: '',
    lastNativeBroadcastPayload: null,
    lastNativeBroadcastReadAt: 0,
    lastNativeBroadcastReadSource: '',
    lastNativeBroadcastReadError: '',
    lastNativeFolderMergeAt: 0,
    lastNativeFolderMergeStatus: '',
    lastNativeFolderMergeError: '',
    lastNativeFolderMergeChecksum: '',
    lastNativeFolderMergeIncomingChecksum: '',
    lastNativeFolderMergeIncomingFolderCount: 0,
    lastNativeFolderMergeIncomingBindingCount: 0,
    lastNativeFolderMergeMergedFolderCount: 0,
    lastNativeFolderMergeMergedBindingCount: 0,
    lastNativeFolderMergeDuplicateNameDifferentIdCount: 0,
    lastNativeFolderMergeDuplicateNameDifferentIdSample: [],
    lastNativeFolderMergeCaseArrived: false,
    lastNativeFolderMergePath: '',
    lastNativeFolderMergeDiagnosticKey: '',
    lastNativeFolderMergeSourceExtensionId: '',
    lastNativeFolderMergeReadAt: 0,
    lastNativeFolderMergeReadSource: '',
    lastNativeFolderMergeReadError: '',
    lastNativeFolderMergePromise: null,
    lastRefreshOwners: [],
    lastStudioBroadcastAt: 0,
    lastStudioBroadcastReason: '',
    lastStudioBroadcastPayloadKeys: [],
    lastStudioBroadcastTransport: '',
    lastStudioBroadcastExternalAt: 0,
    lastStudioBroadcastExternalStatus: '',
    lastStudioBroadcastExternalAttempts: 0,
    lastStudioBroadcastExternalOkCount: 0,
    lastStudioBroadcastExternalErrors: [],
    lastStudioBroadcastExternalTargetIds: [],
    pendingFolderMetadataRequests: new Map(),
    lastFolderMetadataRequestAt: 0,
    lastFolderMetadataRequestId: '',
    lastFolderMetadataRequestMode: '',
    lastFolderMetadataRequestStatus: '',
    lastFolderMetadataRequestEnvelope: null,
    folderMetadataTimeoutCount: 0,
    lastFolderMetadataResultAt: 0,
    lastFolderMetadataResultId: '',
    lastFolderMetadataResultStatus: '',
    lastFolderMetadataResultBlockers: [],
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

  function chromeStorageGet(key) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(key, (items) => {
          const runtimeError = chrome.runtime && chrome.runtime.lastError;
          if (runtimeError) { reject(new Error(runtimeError.message || String(runtimeError))); return; }
          resolve(items ? items[key] : undefined);
        });
      } catch (e) { reject(e); }
    });
  }

  function chromeStorageSet(items) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(items, () => {
          const runtimeError = chrome.runtime && chrome.runtime.lastError;
          if (runtimeError) { reject(new Error(runtimeError.message || String(runtimeError))); return; }
          resolve(true);
        });
      } catch (e) { reject(e); }
    });
  }

  function hasRuntimeExternalMessaging() {
    try {
      return !!(W.chrome && chrome.runtime && typeof chrome.runtime.sendMessage === 'function');
    } catch { return false; }
  }

  function folderMetadataRequestPayloadPresent(payload) {
    const p = payload && typeof payload === 'object' ? payload : null;
    const requests = p && p.folderMetadataOperationRequests;
    return Array.isArray(requests) ? requests.length > 0 : !!(requests && typeof requests === 'object');
  }

  function forwardStudioBroadcastToNativeOwners(body) {
    const payload = body && typeof body === 'object' ? body.payload : null;
    if (!folderMetadataRequestPayloadPresent(payload)) return false;
    state.lastStudioBroadcastExternalAt = Date.now();
    state.lastStudioBroadcastExternalStatus = 'skipped';
    state.lastStudioBroadcastExternalAttempts = 0;
    state.lastStudioBroadcastExternalOkCount = 0;
    state.lastStudioBroadcastExternalErrors = [];
    state.lastStudioBroadcastExternalTargetIds = [];
    if (!hasRuntimeExternalMessaging()) {
      state.lastStudioBroadcastExternalStatus = 'unavailable';
      state.lastStudioBroadcastExternalErrors = ['chrome-runtime-sendMessage-unavailable'];
      return false;
    }

    const ownId = String((W.chrome && chrome.runtime && chrome.runtime.id) || '');
    const lastNativeSourceId = String(
      state.lastNativeFolderMergeSourceExtensionId ||
      state.lastNativeBroadcastPayload?.sourceExtensionId ||
      ''
    ).trim();
    const preferredTargets = NATIVE_OWNER_EXTENSION_IDS.includes(lastNativeSourceId)
      ? [lastNativeSourceId]
      : NATIVE_OWNER_EXTENSION_IDS;
    const targets = preferredTargets.filter((id) => id && id !== ownId);
    state.lastStudioBroadcastExternalAttempts = targets.length;
    state.lastStudioBroadcastExternalStatus = targets.length ? 'pending' : 'no-native-targets';
    state.lastStudioBroadcastExternalTargetIds = targets.slice();
    if (!targets.length) return false;

    const message = {
      type: FOLDER_METADATA_STUDIO_BROADCAST_MESSAGE,
      key: BROADCAST_KEY,
      value: body,
      source: 'studio-launcher',
      sourceExtensionId: ownId,
      ts: Date.now(),
    };

    let settled = 0;
    targets.forEach((targetId) => {
      try {
        chrome.runtime.sendMessage(targetId, message, (resp) => {
          settled += 1;
          const runtimeError = chrome.runtime && chrome.runtime.lastError;
          if (runtimeError) {
            state.lastStudioBroadcastExternalErrors.push(`${targetId}:${String(runtimeError.message || runtimeError)}`);
          } else if (resp && resp.ok !== false) {
            state.lastStudioBroadcastExternalOkCount += 1;
          } else {
            state.lastStudioBroadcastExternalErrors.push(`${targetId}:${String((resp && (resp.status || resp.error)) || 'no-response')}`);
          }
          if (state.lastStudioBroadcastExternalErrors.length > 8) {
            state.lastStudioBroadcastExternalErrors.splice(0, state.lastStudioBroadcastExternalErrors.length - 8);
          }
          if (settled >= targets.length) {
            state.lastStudioBroadcastExternalStatus = state.lastStudioBroadcastExternalOkCount > 0
              ? 'ok'
              : 'failed';
          }
        });
      } catch (e) {
        settled += 1;
        state.lastStudioBroadcastExternalErrors.push(`${targetId}:${String(e?.message || e || 'send-failed')}`);
        if (settled >= targets.length) {
          state.lastStudioBroadcastExternalStatus = state.lastStudioBroadcastExternalOkCount > 0 ? 'ok' : 'failed';
        }
      }
    });
    return true;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  function stableChecksum(value) {
    let text = '';
    try { text = stableStringify(value || null); } catch { text = String(value || ''); }
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    return `h2o-folder-${(hash >>> 0).toString(16)}`;
  }

  function isWatchedKey(key) {
    const k = String(key || '');
    if (IGNORED_SELF_REFRESH_KEYS.has(k)) return false;
    return WATCHED_PREFIXES.some((p) => k.startsWith(p));
  }

  function normalizeNativeBroadcastPayload(value) {
    const raw = value && typeof value === 'object' ? value : null;
    if (!raw) return null;
    if (raw.projectCatalog || raw.folderState || Array.isArray(raw.linkedRecords) || raw.surface === 'native' || Array.isArray(raw.reasons)) return raw;
    const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
    if (payload && (payload.projectCatalog || payload.folderState || Array.isArray(payload.linkedRecords) || payload.surface === 'native' || Array.isArray(payload.reasons))) return payload;
    const nestedValue = raw.value && typeof raw.value === 'object' ? raw.value : null;
    if (nestedValue && (nestedValue.projectCatalog || nestedValue.folderState || Array.isArray(nestedValue.linkedRecords) || nestedValue.surface === 'native' || Array.isArray(nestedValue.reasons))) return nestedValue;
    return raw;
  }

  function normalizeFolderRow(row, index, fallbackSource = '') {
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
      source: String(src.source || fallbackSource || '').trim() || 'folder-state',
      index: Number.isFinite(Number(src.index)) ? Number(src.index) : index,
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

  function normalizeFolderState(raw, fallbackSource = '') {
    const src = raw && typeof raw === 'object' ? raw : {};
    const rows = Array.isArray(src.folders) ? src.folders : [];
    const folders = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const folder = normalizeFolderRow(row, index, fallbackSource || src.source || '');
      if (!folder || seen.has(folder.id)) return;
      seen.add(folder.id);
      folders.push(folder);
    });
    const inputItems = src.items && typeof src.items === 'object' ? src.items : {};
    const items = {};
    folders.forEach((folder) => {
      const values = Array.isArray(inputItems[folder.id]) ? inputItems[folder.id] : [];
      items[folder.id] = Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
    });
    return { folders, items };
  }

  function countFolderBindings(items) {
    if (!items || typeof items !== 'object') return 0;
    return Object.keys(items).reduce((sum, key) => sum + (Array.isArray(items[key]) ? items[key].length : 0), 0);
  }

  function mergeFolderRows(existing, incoming) {
    const out = { ...(existing || {}) };
    out.id = incoming.id;
    out.folderId = incoming.id;
    if (incoming.name) {
      out.name = incoming.name;
      out.title = incoming.title || incoming.name;
    }
    if (incoming.source) out.source = incoming.source;
    if (incoming.kind) out.kind = incoming.kind;
    if (incoming.projectRef) out.projectRef = incoming.projectRef;
    if (incoming.iconColor) out.iconColor = incoming.iconColor;
    if (incoming.color) out.color = incoming.color;
    if (!out.color && incoming.iconColor) out.color = incoming.iconColor;
    if (!out.iconColor && incoming.color) out.iconColor = incoming.color;
    if (incoming.icon) out.icon = incoming.icon;
    if (incoming.parentId) out.parentId = incoming.parentId;
    if (Object.prototype.hasOwnProperty.call(incoming, 'sortOrder')) out.sortOrder = incoming.sortOrder;
    if (!Object.prototype.hasOwnProperty.call(out, 'createdAt') && Object.prototype.hasOwnProperty.call(incoming, 'createdAt')) out.createdAt = incoming.createdAt;
    if (Object.prototype.hasOwnProperty.call(incoming, 'updatedAt')) out.updatedAt = incoming.updatedAt;
    if (Object.prototype.hasOwnProperty.call(incoming, 'index')) out.index = incoming.index;
    return out;
  }

  function findDuplicateNameDifferentIdCandidates(currentFolders, incomingFolders) {
    const byName = new Map();
    const add = (folder, source) => {
      const name = String(folder?.name || folder?.title || '').trim().toLowerCase();
      const id = String(folder?.id || folder?.folderId || '').trim();
      if (!name || !id) return;
      const row = byName.get(name) || { name: folder.name || folder.title || name, ids: new Set(), sources: new Set() };
      row.ids.add(id);
      row.sources.add(source);
      byName.set(name, row);
    };
    currentFolders.forEach((folder) => add(folder, 'existing'));
    incomingFolders.forEach((folder) => add(folder, 'incoming'));
    return Array.from(byName.values())
      .filter((row) => row.ids.size > 1)
      .map((row) => ({
        name: String(row.name || ''),
        ids: Array.from(row.ids).slice(0, 8),
        sources: Array.from(row.sources),
      }));
  }

  async function mergeNativeFolderState(nativeFolderState, reason = '') {
    try {
      const raw = nativeFolderState && typeof nativeFolderState === 'object' ? nativeFolderState : null;
      if (!raw || !Array.isArray(raw.folders)) {
        state.lastNativeFolderMergeAt = Date.now();
        state.lastNativeFolderMergeStatus = 'no-native-folder-state';
        state.lastNativeFolderMergeError = '';
        return { ok: false, status: state.lastNativeFolderMergeStatus };
      }
      if (!hasChromeStorageRead() || !hasChromeStorage()) {
        state.lastNativeFolderMergeAt = Date.now();
        state.lastNativeFolderMergeStatus = 'chrome-storage-unavailable';
        state.lastNativeFolderMergeError = 'chrome.storage.local read/write unavailable';
        return { ok: false, status: state.lastNativeFolderMergeStatus, error: state.lastNativeFolderMergeError };
      }

      const incoming = normalizeFolderState(raw, raw.source || 'native-folder-catalog');
      const currentRaw = await chromeStorageGet(FOLDER_STATE_DATA_KEY);
      const current = normalizeFolderState(currentRaw, 'existing-folder-state');
      const duplicates = findDuplicateNameDifferentIdCandidates(current.folders, incoming.folders);
      const currentById = new Map(current.folders.map((folder) => [folder.id, folder]));
      const incomingById = new Map(incoming.folders.map((folder) => [folder.id, folder]));
      const mergedFolders = [];
      const seen = new Set();

      current.folders.forEach((folder) => {
        const incomingFolder = incomingById.get(folder.id);
        mergedFolders.push(incomingFolder ? mergeFolderRows(folder, incomingFolder) : folder);
        seen.add(folder.id);
      });
      incoming.folders.forEach((folder) => {
        if (seen.has(folder.id)) return;
        mergedFolders.push(mergeFolderRows(currentById.get(folder.id), folder));
        seen.add(folder.id);
      });

      const mergedItems = {};
      mergedFolders.forEach((folder) => {
        const existingItems = Array.isArray(current.items[folder.id]) ? current.items[folder.id] : [];
        const incomingItems = Array.isArray(incoming.items[folder.id]) ? incoming.items[folder.id] : [];
        mergedItems[folder.id] = Array.from(new Set([...existingItems, ...incomingItems].map((value) => String(value || '').trim()).filter(Boolean)));
      });

      const beforeChecksum = stableChecksum({ folders: current.folders, items: current.items });
      const afterChecksum = stableChecksum({ folders: mergedFolders, items: mergedItems });
      const incomingChecksum = String(raw.checksum || stableChecksum({ folders: incoming.folders, items: incoming.items }));
      const incomingBindingCount = countFolderBindings(incoming.items);
      const mergedBindingCount = countFolderBindings(mergedItems);

      state.lastNativeFolderMergeAt = Date.now();
      state.lastNativeFolderMergeIncomingChecksum = incomingChecksum;
      state.lastNativeFolderMergeIncomingFolderCount = incoming.folders.length;
      state.lastNativeFolderMergeIncomingBindingCount = incomingBindingCount;
      state.lastNativeFolderMergeMergedFolderCount = mergedFolders.length;
      state.lastNativeFolderMergeMergedBindingCount = mergedBindingCount;
      state.lastNativeFolderMergeDuplicateNameDifferentIdCount = duplicates.length;
      state.lastNativeFolderMergeDuplicateNameDifferentIdSample = duplicates.slice(0, 8);
      state.lastNativeFolderMergeCaseArrived = incoming.folders.some((folder) => String(folder.name || '').trim().toLowerCase() === 'case');

      if (beforeChecksum === afterChecksum) {
        state.lastNativeFolderMergeStatus = 'unchanged';
        state.lastNativeFolderMergeChecksum = afterChecksum;
        state.lastNativeFolderMergeError = '';
        step('folder-state.merge.skip', reason || 'unchanged');
        return { ok: true, status: 'unchanged', checksum: afterChecksum };
      }

      await chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: { folders: mergedFolders, items: mergedItems } });
      state.lastNativeFolderMergeStatus = 'merged';
      state.lastNativeFolderMergeChecksum = afterChecksum;
      state.lastNativeFolderMergeError = '';
      step('folder-state.merge', `${incoming.folders.length}->${mergedFolders.length}`);
      return {
        ok: true,
        status: 'merged',
        checksum: afterChecksum,
        incomingFolderCount: incoming.folders.length,
        incomingBindingCount,
        mergedFolderCount: mergedFolders.length,
        mergedBindingCount,
      };
    } catch (e) {
      state.lastNativeFolderMergeAt = Date.now();
      state.lastNativeFolderMergeStatus = 'error';
      state.lastNativeFolderMergeError = String(e?.message || e || 'folder-state-merge-error');
      err('folder-state.merge', e);
      return { ok: false, status: 'error', error: state.lastNativeFolderMergeError };
    }
  }

  function asFiniteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function rememberExternalNativeFolderMergeDiagnostic(raw, reason = '') {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    state.lastNativeFolderMergeReadAt = Date.now();
    state.lastNativeFolderMergeReadSource = String(reason || 'external-folder-merge-diagnostic');
    if (!src) {
      state.lastNativeFolderMergeReadError = 'external-folder-merge-diagnostic-empty';
      return false;
    }
    state.lastNativeFolderMergeAt = asFiniteNumber(src.at || src.ts, Date.now());
    state.lastNativeFolderMergeStatus = String(src.status || 'external-background-observed');
    state.lastNativeFolderMergeError = String(src.error || src.diagnosticWriteError || '');
    state.lastNativeFolderMergeIncomingChecksum = String(src.incomingChecksum || '');
    state.lastNativeFolderMergeChecksum = String(src.mergedChecksum || src.checksum || '');
    state.lastNativeFolderMergeIncomingFolderCount = asFiniteNumber(src.incomingFolderCount, 0);
    state.lastNativeFolderMergeIncomingBindingCount = asFiniteNumber(src.incomingBindingCount, 0);
    state.lastNativeFolderMergeMergedFolderCount = asFiniteNumber(src.mergedFolderCount || src.afterFolderCount, 0);
    state.lastNativeFolderMergeMergedBindingCount = asFiniteNumber(src.mergedBindingCount, 0);
    state.lastNativeFolderMergeDuplicateNameDifferentIdCount = asFiniteNumber(src.duplicateNameDifferentIdCount, 0);
    state.lastNativeFolderMergeDuplicateNameDifferentIdSample = Array.isArray(src.duplicateNameDifferentIdSample)
      ? src.duplicateNameDifferentIdSample.slice(0, 8)
      : [];
    state.lastNativeFolderMergeCaseArrived = src.caseArrived === true;
    state.lastNativeFolderMergePath = 'external-background';
    state.lastNativeFolderMergeDiagnosticKey = String(src.diagnosticKey || EXTERNAL_NATIVE_FOLDER_MERGE_DIAG_KEY);
    state.lastNativeFolderMergeSourceExtensionId = String(src.sourceExtensionId || src.senderId || '');
    state.lastNativeFolderMergeReadError = '';
    step('folder-state.merge.external-diagnostic', state.lastNativeFolderMergeStatus);
    return true;
  }

  async function refreshExternalNativeFolderMergeDiagnostic(reason = '') {
    if (!hasChromeStorageRead()) {
      state.lastNativeFolderMergeReadAt = Date.now();
      state.lastNativeFolderMergeReadSource = 'chrome.storage.local-unavailable';
      state.lastNativeFolderMergeReadError = 'chrome.storage.local read unavailable';
      return null;
    }
    try {
      const raw = await chromeStorageGet(EXTERNAL_NATIVE_FOLDER_MERGE_DIAG_KEY);
      state.lastNativeFolderMergeReadAt = Date.now();
      state.lastNativeFolderMergeReadSource = raw ? 'chrome.storage.local' : 'chrome.storage.local-empty';
      if (!raw) return null;
      rememberExternalNativeFolderMergeDiagnostic(raw, reason || 'refresh-external-folder-merge-diagnostic');
      return raw;
    } catch (e) {
      state.lastNativeFolderMergeReadAt = Date.now();
      state.lastNativeFolderMergeReadSource = 'error';
      state.lastNativeFolderMergeReadError = String(e?.message || e || 'external-folder-merge-diagnostic-read-error');
      err('folder-state.merge.external-diagnostic.read', e);
      return null;
    }
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

  function folderMetadataResultBase(requestId, requestMode, operation, code) {
    const op = operation && typeof operation === 'object' ? operation : {};
    return {
      schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
      requestId: String(requestId || '').trim(),
      requestMode: String(requestMode || '').trim(),
      ok: false,
      applied: false,
      noMutation: true,
      operationType: String(op.operationType || '').trim(),
      folderId: String(op.folderId || '').trim(),
      before: null,
      after: null,
      blockers: code ? [{ code: String(code) }] : [],
      warnings: [],
    };
  }

  function folderMetadataRequestId() {
    return `h2o-folder-op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function currentPlatformAdapter() {
    try {
      const env = W.H2O && W.H2O.Studio && W.H2O.Studio.platform && W.H2O.Studio.platform.env;
      return String(env?.adapter || '');
    } catch { return ''; }
  }

  function folderMetadataRequestTransportBlocker() {
    const adapter = currentPlatformAdapter();
    if (adapter === 'tauri') return 'native-owner-request-desktop-bridge-not-implemented';
    if (!hasChromeStorage() && !getPlatformBroadcast()) return 'native-owner-broadcast-unavailable';
    return '';
  }

  function settleFolderMetadataRequest(requestId, result) {
    const id = String(requestId || '').trim();
    if (!id) return false;
    const pending = state.pendingFolderMetadataRequests.get(id);
    if (!pending) return false;
    try { W.clearTimeout(pending.timer); } catch {}
    state.pendingFolderMetadataRequests.delete(id);
    state.lastFolderMetadataResultAt = Date.now();
    state.lastFolderMetadataResultId = id;
    state.lastFolderMetadataResultStatus = result?.ok === true ? 'ok' : 'blocked';
    state.lastFolderMetadataRequestStatus = result?.ok === true ? 'resolved' : 'blocked';
    state.lastFolderMetadataResultBlockers = Array.isArray(result?.blockers)
      ? result.blockers.map((entry) => String(entry?.code || '')).filter(Boolean).slice(0, 8)
      : [];
    pending.resolve(result);
    return true;
  }

  function rememberFolderMetadataOperationResults(payload, reason = '') {
    const results = Array.isArray(payload?.folderMetadataOperationResults)
      ? payload.folderMetadataOperationResults
      : [];
    if (!results.length) return;
    results.slice(0, 16).forEach((raw) => {
      if (!raw || typeof raw !== 'object') return;
      const result = {
        ...raw,
        schema: String(raw.schema || FOLDER_METADATA_OPERATION_RESULT_SCHEMA),
        requestId: String(raw.requestId || '').trim(),
      };
      try {
        W.dispatchEvent(new CustomEvent('evt:h2o:folder-metadata-operation-result', {
          detail: { result, reason: String(reason || 'native-broadcast'), t: Date.now() },
        }));
      } catch {}
      settleFolderMetadataRequest(result.requestId, result);
    });
    step('folder-metadata.results', String(results.length));
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
      state.lastNativeBroadcastFolderCount = Array.isArray(p?.folderState?.folders) ? p.folderState.folders.length : 0;
      state.lastNativeBroadcastFolderBindingCount = Number(p?.folderState?.counts?.bindingCount || countFolderBindings(p?.folderState?.items)) || 0;
      state.lastNativeBroadcastFolderSource = String(p?.folderState?.source || '');
      state.lastNativeBroadcastPayload = p || null;
      let folderMergePromise = Promise.resolve(null);
      if (p?.folderState) {
        folderMergePromise = mergeNativeFolderState(p.folderState, reason || 'native-broadcast')
          .then((result) => {
            coalesceEmit('native-folder-state-merged');
            return result;
          })
          .catch((e) => {
            err('folder-state.merge.async', e);
            return { ok: false, status: 'error', error: String(e?.message || e || 'folder-state-merge-error') };
          });
        state.lastNativeFolderMergePromise = folderMergePromise;
      }
      rememberFolderMetadataOperationResults(p, reason);
      emitNativeBroadcastUpdated(p, reason);
      return folderMergePromise;
    } catch (e) {
      err('native-broadcast.remember', e);
      return Promise.resolve(null);
    }
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
        await rememberNativeBroadcast(payload, reason || 'refresh');
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
      if (key === EXTERNAL_NATIVE_FOLDER_MERGE_DIAG_KEY) {
        rememberExternalNativeFolderMergeDiagnostic(changes[key]?.newValue || null, 'storage.onChanged');
      }
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
        forwardStudioBroadcastToNativeOwners(body);
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
      forwardStudioBroadcastToNativeOwners(body);
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

  function requestFolderMetadataOperation(operation, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const mode = String(opts.requestMode || 'preview').trim();
    const op = operation && typeof operation === 'object' ? {
      schema: operation.schema || FOLDER_METADATA_OPERATION_SCHEMA,
      ...operation,
      sourceSurface: operation.sourceSurface || 'chrome-studio',
      createdAt: operation.createdAt || new Date().toISOString(),
    } : null;
    const requestId = String(opts.requestId || folderMetadataRequestId()).trim();
    const blocker = folderMetadataRequestTransportBlocker();
    if (mode !== 'preview' && mode !== 'apply') {
      return Promise.resolve(folderMetadataResultBase(requestId, mode, op, 'invalid-request-mode'));
    }
    if (!op || op.schema !== FOLDER_METADATA_OPERATION_SCHEMA) {
      return Promise.resolve(folderMetadataResultBase(requestId, mode, op, 'invalid-folder-metadata-operation'));
    }
    if (blocker) {
      return Promise.resolve(folderMetadataResultBase(requestId, mode, op, blocker));
    }
    if (state.pendingFolderMetadataRequests.size >= FOLDER_METADATA_REQUEST_MAX_PENDING) {
      return Promise.resolve(folderMetadataResultBase(requestId, mode, op, 'too-many-pending-folder-metadata-requests'));
    }

    const request = {
      schema: FOLDER_METADATA_OPERATION_REQUEST_SCHEMA,
      requestId,
      requestMode: mode,
      operation: op,
      createdAt: new Date().toISOString(),
    };
    const payload = { folderMetadataOperationRequests: [request] };
    const reason = String(opts.reason || `folder-metadata-operation-${mode}-request`);
    const waitForResult = opts.waitForResult !== false;
    const timeoutMsRaw = Number(opts.timeoutMs || FOLDER_METADATA_REQUEST_DEFAULT_TIMEOUT_MS);
    const timeoutMs = Math.max(500, Math.min(30000, Number.isFinite(timeoutMsRaw) ? timeoutMsRaw : FOLDER_METADATA_REQUEST_DEFAULT_TIMEOUT_MS));

    state.lastFolderMetadataRequestAt = Date.now();
    state.lastFolderMetadataRequestId = requestId;
    state.lastFolderMetadataRequestMode = mode;
    state.lastFolderMetadataRequestStatus = waitForResult ? 'pending' : 'sent';
    state.lastFolderMetadataRequestEnvelope = {
      requestId,
      requestMode: mode,
      operationType: String(op.operationType || ''),
      folderId: String(op.folderId || ''),
      reason,
      timeoutMs,
      waitForResult,
      payloadKeys: Object.keys(payload),
    };

    if (!waitForResult) {
      const sent = broadcastFromStudio(reason, payload);
      state.lastFolderMetadataRequestStatus = sent ? 'sent' : 'broadcast-failed';
      return Promise.resolve(sent
        ? { schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA, requestId, requestMode: mode, ok: true, applied: false, noMutation: true, blockers: [], warnings: [], sent: true }
        : folderMetadataResultBase(requestId, mode, op, 'native-owner-broadcast-unavailable'));
    }

    return new Promise((resolve) => {
      const timer = W.setTimeout(() => {
        try {
          refreshNativeBroadcast('folder-metadata-timeout-check').finally(() => {
            if (!state.pendingFolderMetadataRequests.has(requestId)) return;
            const timeoutResult = folderMetadataResultBase(requestId, mode, op, 'native-owner-timeout');
            state.pendingFolderMetadataRequests.delete(requestId);
            state.lastFolderMetadataRequestStatus = 'timeout';
            state.folderMetadataTimeoutCount += 1;
            state.lastFolderMetadataResultAt = Date.now();
            state.lastFolderMetadataResultId = requestId;
            state.lastFolderMetadataResultStatus = 'timeout';
            state.lastFolderMetadataResultBlockers = ['native-owner-timeout'];
            resolve(timeoutResult);
          });
        } catch {
          const timeoutResult = folderMetadataResultBase(requestId, mode, op, 'native-owner-timeout');
          state.pendingFolderMetadataRequests.delete(requestId);
          state.lastFolderMetadataRequestStatus = 'timeout';
          state.folderMetadataTimeoutCount += 1;
          state.lastFolderMetadataResultAt = Date.now();
          state.lastFolderMetadataResultId = requestId;
          state.lastFolderMetadataResultStatus = 'timeout';
          state.lastFolderMetadataResultBlockers = ['native-owner-timeout'];
          resolve(timeoutResult);
        }
      }, timeoutMs);
      state.pendingFolderMetadataRequests.set(requestId, { resolve, timer, operation: op, mode, createdAt: Date.now() });
      const sent = broadcastFromStudio(reason, payload);
      if (!sent) {
        const failed = folderMetadataResultBase(requestId, mode, op, 'native-owner-broadcast-unavailable');
        state.lastFolderMetadataRequestStatus = 'broadcast-failed';
        settleFolderMetadataRequest(requestId, failed);
      }
    });
  }

  const FolderMetadataOperations = {
    request: requestFolderMetadataOperation,
    diagnose() {
      return {
        requestSchema: FOLDER_METADATA_OPERATION_REQUEST_SCHEMA,
        operationSchema: FOLDER_METADATA_OPERATION_SCHEMA,
        resultSchema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
        adapter: currentPlatformAdapter(),
        transportBlocker: folderMetadataRequestTransportBlocker(),
        pendingRequests: state.pendingFolderMetadataRequests.size,
        lastRequestAt: state.lastFolderMetadataRequestAt,
        lastRequestId: state.lastFolderMetadataRequestId,
        lastRequestMode: state.lastFolderMetadataRequestMode,
        lastRequestStatus: state.lastFolderMetadataRequestStatus,
        lastRequestEnvelope: state.lastFolderMetadataRequestEnvelope ? { ...state.lastFolderMetadataRequestEnvelope } : null,
        timeoutCount: state.folderMetadataTimeoutCount,
        lastResultAt: state.lastFolderMetadataResultAt,
        lastResultId: state.lastFolderMetadataResultId,
        lastResultStatus: state.lastFolderMetadataResultStatus,
        lastResultBlockers: state.lastFolderMetadataResultBlockers.slice(),
        storageBridge: {
          requestWrittenBackend: state.lastStudioBroadcastTransport || '',
          nativeReadableBackend: state.lastStudioBroadcastExternalAttempts
            ? 'native-extension-chrome.storage.local-via-external-message'
            : '',
          resultReadBackend: state.lastNativeBroadcastReadSource || (state.transport || ''),
          lastRequestVisibleToNative: state.lastStudioBroadcastExternalOkCount > 0,
          lastNativeResultVisibleToStudio: !!state.lastFolderMetadataResultAt && state.lastFolderMetadataResultStatus !== 'timeout',
          externalNativeRequest: {
            at: state.lastStudioBroadcastExternalAt,
            status: state.lastStudioBroadcastExternalStatus,
            attempts: state.lastStudioBroadcastExternalAttempts,
            okCount: state.lastStudioBroadcastExternalOkCount,
            targetIds: state.lastStudioBroadcastExternalTargetIds.slice(),
            errors: state.lastStudioBroadcastExternalErrors.slice(),
          },
        },
      };
    },
  };

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
    folderMetadataOperations: FolderMetadataOperations,
    requestFolderMetadataOperation,
    pingNow(reason) { coalesceEmit(reason || 'manual'); },
    getNativeBroadcast() { return state.lastNativeBroadcastPayload || null; },
    refreshNativeBroadcast,
    refreshNativeFolderState(reason) {
      const why = reason || 'manual-folder-state-refresh';
      try { refreshExternalNativeFolderMergeDiagnostic(why).catch(() => {}); } catch {}
      return refreshNativeBroadcast(why);
    },
    diagnose() {
      if (!state.lastNativeBroadcastAt || (!state.lastNativeFolderMergeAt && !state.lastNativeBroadcastFolderCount)) {
        try { refreshNativeBroadcast('diagnose').catch(() => {}); } catch {}
      }
      if (!state.lastNativeFolderMergeAt) {
        try { refreshExternalNativeFolderMergeDiagnostic('diagnose').catch(() => {}); } catch {}
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
            folderCount: state.lastNativeBroadcastFolderCount,
            folderBindingCount: state.lastNativeBroadcastFolderBindingCount,
            folderSource: state.lastNativeBroadcastFolderSource,
            readAt: state.lastNativeBroadcastReadAt,
            readSource: state.lastNativeBroadcastReadSource,
            readError: state.lastNativeBroadcastReadError,
          },
          nativeFolderStateMerge: {
            key: FOLDER_STATE_DATA_KEY,
            diagnosticKey: state.lastNativeFolderMergeDiagnosticKey || EXTERNAL_NATIVE_FOLDER_MERGE_DIAG_KEY,
            path: state.lastNativeFolderMergePath || (state.lastNativeFolderMergeAt ? 'same-extension-broadcast' : ''),
            at: state.lastNativeFolderMergeAt,
            status: state.lastNativeFolderMergeStatus,
            error: state.lastNativeFolderMergeError,
            incomingChecksum: state.lastNativeFolderMergeIncomingChecksum,
            mergedChecksum: state.lastNativeFolderMergeChecksum,
            incomingFolderCount: state.lastNativeFolderMergeIncomingFolderCount,
            incomingBindingCount: state.lastNativeFolderMergeIncomingBindingCount,
            mergedFolderCount: state.lastNativeFolderMergeMergedFolderCount,
            mergedBindingCount: state.lastNativeFolderMergeMergedBindingCount,
            duplicateNameDifferentIdCount: state.lastNativeFolderMergeDuplicateNameDifferentIdCount,
            duplicateNameDifferentIdSample: state.lastNativeFolderMergeDuplicateNameDifferentIdSample.slice(),
            caseArrived: !!state.lastNativeFolderMergeCaseArrived,
            sourceExtensionId: state.lastNativeFolderMergeSourceExtensionId,
            readAt: state.lastNativeFolderMergeReadAt,
            readSource: state.lastNativeFolderMergeReadSource,
            readError: state.lastNativeFolderMergeReadError,
          },
          studioBroadcast: {
            at: state.lastStudioBroadcastAt,
            reason: state.lastStudioBroadcastReason,
            payloadKeys: state.lastStudioBroadcastPayloadKeys.slice(),
            transport: state.lastStudioBroadcastTransport,
          },
          folderMetadataOperations: FolderMetadataOperations.diagnose(),
        },
        subscribers: state.subscribers.size,
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  };

  H2O.Library.Sync = Sync;
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.folderMetadataOperations = FolderMetadataOperations;

  function bootBindings() {
    bindTransport();
    refreshNativeBroadcast('boot').catch(() => {});
    refreshExternalNativeFolderMergeDiagnostic('boot').catch(() => {});
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
