/* H2O Studio Sync - F10.3 first cross-platform bridge
 * Desktop latest.json bundle -> Chrome Studio bundle-envelope preview
 *
 * Operator-triggered DIAGNOSTIC ONLY. Read-only. No merge. No apply.
 * No write-back. No proposal. No remote apply. No background sync.
 *
 * Reads the existing sync-folder handle that R2C folder-import.mv3.js
 * persists in IndexedDB and produces a redacted "bundle" envelope
 * preview per the F10.2.0 cross-platform envelope spec
 * (docs/systems/cross-platform/envelope-v1.md). The constructed
 * envelope is returned as a diagnostic result; it is never written to
 * chrome.storage, never broadcast via chrome.runtime, never enqueued
 * to F6, and never enters the folder-import merge path.
 *
 * Safety invariants:
 *   - no Desktop/Tauri behavior (bails on detectTauri())
 *   - no background polling or interval auto-preview
 *   - no chrome.storage writes
 *   - no sync-folder writes
 *   - no chrome.runtime.sendMessage with bundle content
 *   - no folder-import.mv3.js call (existing merge path untouched)
 *   - no @h2o/cross-platform-envelope runtime import (F10.2.2 CP-10.1)
 *   - no recursive envelope enumeration inside payload (v1 keeps
 *     payload.envelopes as the empty array; F10.3.1+ scope)
 *   - no fake placeholder hashes — all sha256 strings are computed via
 *     Web Crypto over real inputs; fields whose source data is absent
 *     from the bundle (e.g. physicalDeviceIdHash, installIdHash) are
 *     left as empty strings so format gates correctly identify the gap
 *
 * Public API:
 *   H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes(options?)
 *     -> Promise<BundleEnvelopePreviewResult>
 *
 * Result schema: h2o.studio.sync.bundle-envelope-preview.v1
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (detectTauri()) return;

  function detectChromeExtension() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }
  if (!detectChromeExtension()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__bundleEnvelopePreviewInstalled) return;

  // ── Inlined constants (parity verified by F10.2.2 scans) ────────────
  // Source of truth: packages/cross-platform-envelope/src/constants.ts
  // F10.2.2 scan-kind-literal-drift will fail if 'bundle' ever leaves
  // ENVELOPE_KINDS.
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var RESULT_SCHEMA = 'h2o.studio.sync.bundle-envelope-preview.v1';
  var BRIDGE_VERSION_TAG = 'h2o.platform.capabilities.v1#f10.3-bridge-v1';

  // Sync-folder IndexedDB constants — mirror folder-import.mv3.js exactly.
  var IDB_NAME = 'h2o.studio.sync.folder.mv3';
  var IDB_STORE = 'handles';
  var IDB_KEY = 'sync-folder';
  var LATEST_FILE = 'latest.json';

  var DEFAULT_MAX_BYTES = 16 * 1024 * 1024;
  var HARD_CAP_BYTES = 64 * 1024 * 1024;

  var EMPTY_SECTION_COUNTS = Object.freeze({
    chats: 0, snapshots: 0, folders: 0, labels: 0, tags: 0, categories: 0,
  });

  // ── Format predicates (mirrored from F10.2.1 helper) ────────────────
  function isSha256Hex(s) {
    if (typeof s !== 'string') return false;
    if (s.length !== 64) return false;
    return /^[0-9a-f]{64}$/.test(s);
  }
  function isValidIsoSeconds(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s);
  }

  // ── Web Crypto helpers (Chrome extension context only) ──────────────
  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i].toString(16);
      hex += b.length === 1 ? '0' + b : b;
    }
    return hex;
  }

  async function sha256Hex(input) {
    if (!webCryptoAvailable()) return '';
    var data;
    if (typeof input === 'string') {
      data = new TextEncoder().encode(input);
    } else if (input instanceof Uint8Array) {
      data = input;
    } else {
      data = new TextEncoder().encode(String(input));
    }
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  // ── Canonicalize for deterministic hashing ──────────────────────────
  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
      var sorted = {};
      var keys = Object.keys(value).sort();
      for (var i = 0; i < keys.length; i++) {
        sorted[keys[i]] = canonicalize(value[keys[i]]);
      }
      return sorted;
    }
    return value;
  }
  function jsonCanonical(v) {
    return JSON.stringify(canonicalize(v));
  }

  // ── UUID v4 generation (envelope id, lineageId) ─────────────────────
  function generateUuid() {
    var bytes;
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      bytes = new Uint8Array(16);
      global.crypto.getRandomValues(bytes);
    } else {
      bytes = new Uint8Array(16);
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function cleanString(v) {
    return typeof v === 'string' ? v : '';
  }

  // ── IndexedDB read-only handle retrieval ────────────────────────────
  // Reuses the IDB store that folder-import.mv3.js maintains; this
  // module never opens it for write.
  function getSyncFolderHandle() {
    return new Promise(function (resolve) {
      var indexedDb;
      try { indexedDb = global.indexedDB; } catch (_) { resolve(null); return; }
      if (!indexedDb) { resolve(null); return; }
      var req;
      try {
        req = indexedDb.open(IDB_NAME);
      } catch (_) {
        resolve(null);
        return;
      }
      req.onerror = function () { resolve(null); };
      req.onsuccess = function () {
        var db = req.result;
        if (!db || !db.objectStoreNames || !db.objectStoreNames.contains(IDB_STORE)) {
          try { db.close(); } catch (_) {}
          resolve(null);
          return;
        }
        try {
          var tx = db.transaction([IDB_STORE], 'readonly');
          var store = tx.objectStore(IDB_STORE);
          var getReq = store.get(IDB_KEY);
          getReq.onsuccess = function () {
            resolve(getReq.result || null);
            try { db.close(); } catch (_) {}
          };
          getReq.onerror = function () {
            resolve(null);
            try { db.close(); } catch (_) {}
          };
        } catch (_) {
          resolve(null);
          try { db.close(); } catch (_) {}
        }
      };
    });
  }

  // ── Forever-no field scan (defensive payload check) ─────────────────
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'url', 'path', 'password', 'apiKey',
  ];
  function objectContainsForbiddenField(obj) {
    if (obj == null || typeof obj !== 'object') return false;
    var stack = [obj];
    while (stack.length > 0) {
      var current = stack.pop();
      if (Array.isArray(current)) {
        for (var i = 0; i < current.length; i++) stack.push(current[i]);
        continue;
      }
      if (current != null && typeof current === 'object') {
        var keys = Object.keys(current);
        for (var j = 0; j < keys.length; j++) {
          var k = keys[j];
          if (FOREVER_NO_FIELDS.indexOf(k) !== -1) return true;
          if (k !== 'previewToken' && /token$/i.test(k)) return true;
          stack.push(current[k]);
        }
      }
    }
    return false;
  }

  function arrLen(x) { return Array.isArray(x) ? x.length : 0; }
  function readSectionCounts(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      return Object.assign({}, EMPTY_SECTION_COUNTS);
    }
    return {
      chats: arrLen(bundle.chats),
      snapshots: arrLen(bundle.snapshots),
      folders: arrLen(bundle.folders),
      labels: arrLen(bundle.labels),
      tags: arrLen(bundle.tags),
      categories: arrLen(bundle.categories),
    };
  }

  // ── Build redacted peer envelope from bundle fields ─────────────────
  // The existing Desktop bundle does not carry the full F2 redacted peer
  // envelope (physicalDeviceIdHash, installIdHash, syncPeerIdHash). The
  // bridge:
  //   - computes a real sha256 of bundle.sourceSyncPeerId for syncPeerIdHash
  //   - leaves the other two hash fields as empty strings so the format
  //     gate correctly identifies the gap (NO fake placeholder hashes)
  //   - emits specific bridge-level warnings naming the missing fields
  async function buildSourcePeerEnvelope(bundle, warnings) {
    var syncPeerId = cleanString(bundle && bundle.sourceSyncPeerId);
    var syncPeerIdHash = '';
    if (syncPeerId) {
      syncPeerIdHash = await sha256Hex(syncPeerId);
    } else {
      warnings.push('source-sync-peer-id-missing-from-bundle');
    }
    if (!isSha256Hex(syncPeerIdHash)) {
      warnings.push('source-peer-sync-peer-id-not-sha256');
    }
    warnings.push('source-peer-physical-device-id-absent-from-bundle');
    warnings.push('source-peer-install-id-absent-from-bundle');
    return {
      physicalDeviceIdHash: '',
      installIdHash: '',
      syncPeerIdHash: syncPeerIdHash,
      surfaceKind: 'desktop-tauri',
    };
  }

  // ── Compose the result envelope around an empty bundle ──────────────
  function makeEarlyResult(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      ok: false,
      redacted: true,
      envelope: null,
      sectionCounts: Object.assign({}, EMPTY_SECTION_COUNTS),
      findings: { blockers: blockers.slice(), warnings: warnings.slice() },
      bundleBytes: 0,
      bundleSchema: '',
    };
  }

  // ── Public API: previewLatestBundleAsEnvelopes ──────────────────────
  async function previewLatestBundleAsEnvelopes(options) {
    var blockers = [];
    var warnings = [];
    var opts = options || {};

    var maxBytes = (typeof opts.maxBytes === 'number' && opts.maxBytes > 0)
      ? opts.maxBytes
      : DEFAULT_MAX_BYTES;
    if (maxBytes > HARD_CAP_BYTES) maxBytes = HARD_CAP_BYTES;

    var createdAt = (typeof opts.nowIso === 'string' && isValidIsoSeconds(opts.nowIso))
      ? opts.nowIso
      : nowIsoSeconds();

    if (!webCryptoAvailable()) {
      // Per the F10.3 plan, do not fake hashes. If Web Crypto is
      // unavailable, surface the gap and return without an envelope.
      warnings.push('web-crypto-unavailable');
      return makeEarlyResult(blockers, warnings);
    }

    // ── 1. Retrieve sync-folder handle (read-only) ────────────────────
    var handle = await getSyncFolderHandle();
    if (!handle) {
      warnings.push('no-sync-folder-handle');
      return makeEarlyResult(blockers, warnings);
    }

    // Check (but never request) permission.
    try {
      if (typeof handle.queryPermission === 'function') {
        var perm = await handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
          warnings.push('sync-folder-permission-not-granted');
          return makeEarlyResult(blockers, warnings);
        }
      }
    } catch (_) {
      warnings.push('sync-folder-permission-check-failed');
    }

    // ── 2. Read latest.json (size-capped, read-only) ──────────────────
    var fileHandle;
    try {
      fileHandle = await handle.getFileHandle(LATEST_FILE);
    } catch (_) {
      warnings.push('no-latest-json-in-folder');
      return makeEarlyResult(blockers, warnings);
    }
    var file;
    try {
      file = await fileHandle.getFile();
    } catch (_) {
      warnings.push('file-handle-read-failed');
      return makeEarlyResult(blockers, warnings);
    }
    var fileBytes = file.size || 0;
    if (fileBytes > maxBytes) {
      warnings.push('bundle-exceeds-byte-cap');
      var early = makeEarlyResult(blockers, warnings);
      early.bundleBytes = fileBytes;
      return early;
    }
    var fileText;
    try {
      fileText = await file.text();
    } catch (_) {
      warnings.push('latest-json-decode-failed');
      var early2 = makeEarlyResult(blockers, warnings);
      early2.bundleBytes = fileBytes;
      return early2;
    }
    var bundle;
    try {
      bundle = JSON.parse(fileText);
    } catch (_) {
      warnings.push('latest-json-not-json');
      var early3 = makeEarlyResult(blockers, warnings);
      early3.bundleBytes = fileBytes;
      return early3;
    }
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
      warnings.push('latest-json-not-object');
      var early4 = makeEarlyResult(blockers, warnings);
      early4.bundleBytes = fileBytes;
      return early4;
    }

    // ── 3. Extract bundle metadata (no chat/message/snapshot enumeration)
    var sectionCounts = readSectionCounts(bundle);
    var bundleSchema = cleanString(bundle.schema);
    var exportSchemaVersion = cleanString(bundle.exportSchemaVersion);
    var bundleSequence = (typeof bundle.sequenceNumber === 'number') ? bundle.sequenceNumber : null;
    var bundleHashFromBundle = '';
    if (typeof bundle.contentSha256 === 'string') {
      // export-bundle.tauri.js stores this as 'sha256:<hex>'; strip prefix.
      var marker = bundle.contentSha256.indexOf(':');
      var hex = marker >= 0 ? bundle.contentSha256.slice(marker + 1) : bundle.contentSha256;
      if (isSha256Hex(hex)) bundleHashFromBundle = hex;
    }
    var bundleHash = bundleHashFromBundle || await sha256Hex(fileText);

    // ── 4. Construct payload (no envelope enumeration in v1) ──────────
    var payload = {
      envelopes: [],
      bundleSequence: bundleSequence != null ? bundleSequence : 0,
      bundleHash: bundleHash,
      sectionCounts: sectionCounts,
      bundleSchema: bundleSchema,
      exportSchemaVersion: exportSchemaVersion,
    };

    // Defensive forever-no scan on the constructed payload. The bridge
    // never copies chat/message/snapshot content into the payload, but
    // this guards against future regressions.
    if (objectContainsForbiddenField(payload)) {
      blockers.push('payload-contains-forever-no-field');
    }

    // ── 5. Compute capabilitySnapshotHash from this bridge's known tag
    // The hash is sha256 of an OPAQUE tag identifying the manifest
    // version this bridge was compiled against. The producer's actual
    // manifest hash would be carried inside a future richer bundle; for
    // F10.3 the bridge advertises its own view via this tag.
    var capabilitySnapshotHash = await sha256Hex(BRIDGE_VERSION_TAG);

    // ── 6. Build source peer envelope (real sha256 where data exists) ─
    var sourcePeerEnvelope = await buildSourcePeerEnvelope(bundle, warnings);

    // ── 7. Compute dedupeKey (canonical, deterministic) ───────────────
    var dedupeKey = await sha256Hex(jsonCanonical({
      schema: ENVELOPE_SCHEMA,
      purpose: 'dedupeKey',
      platformId: 'desktop-studio',
      kind: 'bundle',
      subjectType: 'latest-json-bundle',
      operation: 'desktop-latest-json-export',
      bundleSequence: payload.bundleSequence,
      bundleHash: payload.bundleHash,
    }));

    // ── 8. Compute payloadHash ────────────────────────────────────────
    var payloadHash = await sha256Hex(jsonCanonical(payload));

    // ── 9. Construct envelope (literal kind/schema for F10.2.2 scan) ──
    var envelopeBase = {
      schema: 'h2o.crossPlatform.envelope.v1',
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'bundle',
      id: generateUuid(),
      lineageId: generateUuid(),
      createdAt: createdAt,
      sequence: null,
      exportSequence: bundleSequence,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: sourcePeerEnvelope,
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'strong-local-authority',
      capabilityUsed: 'export',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: 'latest-json-bundle',
      subjectId: payload.bundleHash,
      operation: 'desktop-latest-json-export',
      redactionClass: 'redacted',
      dryRun: null,
      transactional: null,
      dedupeKey: dedupeKey,
      payloadHash: payloadHash,
      payload: payload,
    };

    // ── 10. Compute eventDigest (envelope minus warnings/blockers/eventDigest)
    var envelopeForDigest = canonicalize(envelopeBase);
    var eventDigest = await sha256Hex(JSON.stringify(envelopeForDigest));

    var envelope = Object.assign({}, envelopeBase, {
      eventDigest: eventDigest,
      warnings: [],
      blockers: [],
    });

    // ── 11. Format-gate verification on the constructed envelope ──────
    if (!isSha256Hex(envelope.capabilitySnapshotHash)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(envelope.dedupeKey)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(envelope.payloadHash)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(envelope.eventDigest)) blockers.push('envelope-schema-too-new');
    if (!isValidIsoSeconds(envelope.createdAt)) blockers.push('envelope-schema-too-new');
    // Peer envelope: format gate is structural; missing fields surface
    // as 'envelope-schema-too-new' which mirrors F10.2.1 helper behavior.
    var peer = envelope.sourcePlatform.sourcePeerEnvelope;
    if (!isSha256Hex(peer.physicalDeviceIdHash)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(peer.installIdHash)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(peer.syncPeerIdHash)) blockers.push('envelope-schema-too-new');

    // Dedupe blocker codes (multiple gate misses surface once).
    var dedupedBlockers = [];
    var seen = Object.create(null);
    for (var i = 0; i < blockers.length; i++) {
      if (!seen[blockers[i]]) {
        seen[blockers[i]] = true;
        dedupedBlockers.push(blockers[i]);
      }
    }

    return {
      schema: RESULT_SCHEMA,
      ok: dedupedBlockers.length === 0,
      redacted: true,
      envelope: envelope,
      sectionCounts: sectionCounts,
      findings: { blockers: dedupedBlockers, warnings: warnings.slice() },
      bundleBytes: fileBytes,
      bundleSchema: bundleSchema,
    };
  }

  // ── Public registration ─────────────────────────────────────────────
  H2O.Studio.diagnostics.previewLatestBundleAsEnvelopes = previewLatestBundleAsEnvelopes;
  H2O.Studio.diagnostics.__bundleEnvelopePreviewInstalled = true;

})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
