/* H2O Studio Sync — F10.5 native-extension capture evidence preview bridge.
 *
 * Operator-triggered DIAGNOSTIC ONLY. Read-only. No merge. No apply.
 * No write-back. No proposal. No remote apply. No background sync.
 *
 * Observes the existing native ChatGPT extension capture-store data —
 * which the native Capture Engine (src-runtime-base/3X1a) persists to
 * localStorage under the `h2o:prm:cgx:capture:store:v1:<chatId>` key
 * shape — and presents an aggregate-counts-only F10.2.0 `evidence`
 * envelope for Chrome Studio preview. The bridge reads that backend
 * directly (read-only): localStorage primarily, plus chrome.storage.local
 * as a secondary native<->Studio wire, merged by chatId. This is the
 * identical backend + verbatim key the read-only H2O.Studio.store.capture
 * facade reads via H2O.Studio.platform.storage. No native-extension code
 * change. No new chrome.runtime message type. No storage write. The
 * native runtime's data is the SUBJECT of observation; chrome-studio is
 * the envelope PRODUCER (honest authority attribution per F10.5 plan §3).
 *
 * Safety invariants:
 *   - Chrome MV3 only (bails on detectTauri()).
 *   - Operator-triggered. No setInterval, no auto-run, no polling.
 *   - Enumerates + reads capture stores read-only from localStorage
 *     (localStorage.key / getItem only) and chrome.storage.local
 *     (storage.get only). NEVER setItem / removeItem / clear / set.
 *     No localStorage write. No chrome.storage write.
 *   - Reads localStorage directly rather than via the lazy/async
 *     H2O.Studio.store.capture facade (whose getStore() returns null on
 *     the first synchronous call); direct read is race-free and returns
 *     identical bytes from the same backend. NEVER mutates a stored blob.
 *   - NEVER copies any free-text capture field into the returned
 *     envelope payload — specifically NOT item.text, item.title,
 *     item.tags, item.routeSuggestion, item.source.role,
 *     item.source.msgId, item.convertedTo, raw item.id, or raw
 *     chatId. ONLY counts and structural aggregates emitted.
 *   - Defensive forever-no key-name scan on constructed payload
 *     before emission. Refuses to emit if any forever-no key
 *     surfaces.
 *   - No chrome.runtime.sendMessage. No fetch. No setInterval.
 *   - No @h2o/cross-platform-envelope import at runtime (inlines
 *     a minimal constants subset; F10.2.2 CP-10.1 stays clean).
 *   - All sha256 strings computed via WKWebView-shared
 *     crypto.subtle.digest. No fake placeholder hashes.
 *   - Idempotent install marker:
 *       H2O.Studio.diagnostics.__nativeCaptureEvidencePreviewInstalled
 *
 * Public API:
 *   H2O.Studio.diagnostics.previewNativeCaptureAsEvidence(options?)
 *     -> Promise<NativeCaptureEvidencePreviewResult>
 *
 * Result schema:
 *   h2o.studio.sync.native-capture-evidence-preview.v1
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
  if (H2O.Studio.diagnostics.__nativeCaptureEvidencePreviewInstalled) return;

  // ── Inlined constants (parity verified by F10.2.2 scans) ────────────
  // Source of truth: packages/cross-platform-envelope/src/constants.ts
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var RESULT_SCHEMA = 'h2o.studio.sync.native-capture-evidence-preview.v1';
  var BRIDGE_VERSION_TAG = 'h2o.platform.capabilities.v1#f10.5-bridge-v1';

  // Native ChatGPT extension capture-store key shape. The native Capture
  // Engine (src-runtime-base/3X1a:73,95) writes each per-chat store under
  // `${NS}:store:v${storeVersion}:${chatId}` where NS='h2o:prm:cgx:capture'
  // and CFG.storeVersion=1. The Studio capture facade reads the same
  // verbatim key via platform.storage (localStorage). If the native engine
  // bumps storeVersion in a future migration, update this prefix in lock-step.
  var CAPTURE_STORE_PREFIX = 'h2o:prm:cgx:capture:store:v1:';
  var CAPTURE_KIND_TEXT_BUCKET = 'text';
  var DEFAULT_MAX_CHATS = 5000;

  // Forever-no field names (mirrored from F10.2.0 §5.3 deny list).
  // The bridge's defensive payload scan refuses to emit if any of
  // these surface as object keys in the constructed payload tree.
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'url', 'path', 'password', 'apiKey',
  ];

  // ── Format predicates (mirrored from F10.2.1 helper) ────────────────
  function isSha256Hex(s) {
    if (typeof s !== 'string') return false;
    if (s.length !== 64) return false;
    return /^[0-9a-f]{64}$/.test(s);
  }
  function isValidIsoSeconds(s) {
    return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s);
  }

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

  // ── Defensive forever-no payload scan (defense in depth) ────────────
  // The bridge constructs payload by hand using only count fields; the
  // scan is a structural backstop in case a future regression introduces
  // a content field. The scan also catches any *Token-family key except
  // literal 'previewToken'.
  function payloadContainsForbiddenField(obj) {
    if (obj == null || typeof obj !== 'object') return null;
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
          if (FOREVER_NO_FIELDS.indexOf(k) !== -1) return k;
          if (k !== 'previewToken' && /token$/i.test(k)) return k;
          stack.push(current[k]);
        }
      }
    }
    return null;
  }

  // ── Storage handles (read-only) ─────────────────────────────────────
  // The native ChatGPT Capture Engine (src-runtime-base/3X1a:73,95)
  // persists each per-chat store to localStorage. chrome.storage.local
  // is the established native<->Studio cross-context wire (cf. Library
  // Sync). The bridge reads BOTH, strictly read-only, and never writes.
  function localStorageRef() {
    try {
      var ls = global.localStorage;
      if (ls && typeof ls.getItem === 'function' && typeof ls.key === 'function'
          && typeof ls.length === 'number') {
        return ls;
      }
    } catch (_) { /* access can throw in sandboxed / partitioned contexts */ }
    return null;
  }
  function chromeLocalRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function') return s;
    } catch (_) { /* swallow */ }
    return null;
  }

  // Strip CAPTURE_STORE_PREFIX from a key, returning the chatId, or '' if
  // the key is not a capture *store* key. The ui-prefix
  // ('…:capture:ui:v1:') and the migration marker ('…:capture:migrate:…')
  // both fail the indexOf===0 test against the store-prefix, so they are
  // excluded automatically.
  function chatIdFromStoreKey(key) {
    if (typeof key !== 'string') return '';
    if (key.indexOf(CAPTURE_STORE_PREFIX) !== 0) return '';
    return key.slice(CAPTURE_STORE_PREFIX.length);
  }

  // Coerce a raw stored value into a store object. localStorage holds a
  // JSON string; chrome.storage holds a structured clone (object) or, if
  // a producer stored a string, a string. Returns the object, null
  // (absent), or undefined (parse error — counted as a read error).
  function parseStoreValue(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) { return undefined; }
    }
    return undefined;
  }

  // ── Read-only collectors (populate a chatId -> store Map) ───────────
  // filterSet (optional) restricts to specific chatIds. `into` is shared
  // across both backends; a chatId already present is not overwritten, so
  // localStorage (collected first) takes precedence over chrome.storage.
  function collectFromLocalStorage(filterSet, maxChats, into, stats) {
    var ls = localStorageRef();
    if (!ls) { stats.localStorageAvailable = false; return; }
    stats.localStorageAvailable = true;
    var total;
    try { total = ls.length; } catch (_) { stats.localStorageError = true; return; }
    for (var i = 0; i < total; i++) {
      if (into.size >= maxChats) break;
      var key;
      try { key = ls.key(i); } catch (_) { continue; }
      var chatId = chatIdFromStoreKey(key);
      if (!chatId) continue;
      if (filterSet && !filterSet[chatId]) continue;
      if (into.has(chatId)) continue;
      var raw;
      try { raw = ls.getItem(key); } catch (_) { stats.readErrors += 1; continue; }
      var store = parseStoreValue(raw);
      if (store === undefined) { stats.readErrors += 1; continue; }
      if (store && typeof store === 'object') into.set(chatId, store);
    }
  }

  function collectFromChromeStorage(filterSet, maxChats, into, stats) {
    return new Promise(function (resolve) {
      var s = chromeLocalRef();
      if (!s) { stats.chromeStorageAvailable = false; resolve(); return; }
      stats.chromeStorageAvailable = true;
      var settled = false;
      function finish() { if (!settled) { settled = true; resolve(); } }
      try {
        s.get(null, function (items) {
          try {
            var rt = global.chrome && global.chrome.runtime;
            if (rt && rt.lastError) { stats.chromeStorageError = true; finish(); return; }
            if (!items || typeof items !== 'object') { finish(); return; }
            var keys = Object.keys(items);
            for (var i = 0; i < keys.length; i++) {
              if (into.size >= maxChats) break;
              var chatId = chatIdFromStoreKey(keys[i]);
              if (!chatId) continue;
              if (filterSet && !filterSet[chatId]) continue;
              if (into.has(chatId)) continue;      // localStorage already won
              var store = parseStoreValue(items[keys[i]]);
              if (store === undefined) { stats.readErrors += 1; continue; }
              if (store && typeof store === 'object') into.set(chatId, store);
            }
          } catch (_) { stats.chromeStorageError = true; }
          finish();
        });
      } catch (_) { stats.chromeStorageError = true; finish(); }
    });
  }

  // ── Per-chat aggregation (counts and structural metadata only) ──────
  // Reads a store OBJECT (already loaded by the collectors above) and
  // increments counters by reading only status, pinned, kind, createdAt,
  // updatedAt. NEVER copies item.text / item.title / item.tags /
  // item.id raw / item.source.* / item.routeSuggestion / item.convertedTo.
  function aggregateStore(store, agg) {
    if (!store || typeof store !== 'object') return;
    if (agg.captureStoreVersion === null && typeof store.version === 'number') {
      agg.captureStoreVersion = store.version;
    }
    var items = Array.isArray(store.items) ? store.items : [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      agg.totalItemCount += 1;
      // Status bucket. Unknown statuses go to 'other'.
      var status = typeof item.status === 'string' ? item.status : '';
      if (status === 'new' || status === 'reviewed' || status === 'archived'
          || status === 'converted' || status === 'dismissed') {
        agg.itemsByStatus[status] += 1;
      } else {
        agg.itemsByStatus.other += 1;
      }
      // Pinned.
      if (item.pinned === true) agg.pinnedCount += 1;
      // Kind bucket. Coarse — 'text' (the native default) goes into
      // captureSnippetKind; everything else into otherKind. The literal
      // 'text' is a comparison value only — never a payload key name.
      var kind = typeof item.kind === 'string' ? item.kind : '';
      if (kind === CAPTURE_KIND_TEXT_BUCKET) {
        agg.itemsByKindBucket.captureSnippetKind += 1;
      } else {
        agg.itemsByKindBucket.otherKind += 1;
      }
      // Timestamp range. createdAt / updatedAt are numbers (epoch ms).
      var created = (typeof item.createdAt === 'number' && isFinite(item.createdAt) && item.createdAt > 0)
        ? item.createdAt : null;
      var updated = (typeof item.updatedAt === 'number' && isFinite(item.updatedAt) && item.updatedAt > 0)
        ? item.updatedAt : null;
      if (created !== null) {
        if (agg.earliestCreatedAt === null || created < agg.earliestCreatedAt) {
          agg.earliestCreatedAt = created;
        }
      }
      if (updated !== null) {
        if (agg.latestUpdatedAt === null || updated > agg.latestUpdatedAt) {
          agg.latestUpdatedAt = updated;
        }
      }
    }
  }

  function epochMsToIsoSeconds(ms) {
    if (typeof ms !== 'number' || !isFinite(ms) || ms <= 0) return null;
    try {
      return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    } catch (_) {
      return null;
    }
  }

  function makeEarlyResult(observedAtIso, blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      ok: false,
      redacted: true,
      envelope: null,
      observation: {
        chatsObservedCount: 0,
        totalItemCount: 0,
      },
      findings: { blockers: blockers.slice(), warnings: warnings.slice() },
      observedAtIso: observedAtIso,
    };
  }

  // ── Public API: previewNativeCaptureAsEvidence ──────────────────────
  async function previewNativeCaptureAsEvidence(options) {
    var blockers = [];
    var warnings = [];
    var opts = options || {};

    var observedAtIso = (typeof opts.nowIso === 'string' && isValidIsoSeconds(opts.nowIso))
      ? opts.nowIso
      : nowIsoSeconds();

    if (!webCryptoAvailable()) {
      warnings.push('web-crypto-unavailable');
      return makeEarlyResult(observedAtIso, blockers, warnings);
    }

    // ── 1. Resolve maxChats + optional chatId filter ──────────────────
    var maxChats = (typeof opts.maxChats === 'number' && opts.maxChats > 0)
      ? Math.min(opts.maxChats, DEFAULT_MAX_CHATS)
      : DEFAULT_MAX_CHATS;
    var filterSet = null;
    if (Array.isArray(opts.chatIds)) {
      filterSet = Object.create(null);
      for (var fi = 0; fi < opts.chatIds.length; fi++) {
        var fid = opts.chatIds[fi];
        if (typeof fid === 'string' && fid.length > 0) filterSet[fid] = true;
      }
    }

    // ── 2. Collect per-chat capture stores (read-only, dual backend) ──
    // The native Capture Engine (src-runtime-base/3X1a) persists each
    // per-chat store to localStorage under CAPTURE_STORE_PREFIX + chatId;
    // chrome.storage.local is the established native<->Studio wire (cf.
    // Library Sync). Read BOTH, strictly read-only, merged by chatId
    // (localStorage takes precedence). This observes the SAME backend +
    // verbatim key the H2O.Studio.store.capture facade reads, but does so
    // directly: the facade's getStore() is lazy/async (returns null on
    // the first synchronous call, hydrates on a later tick), which is
    // unusable for a one-shot diagnostic. Direct read-only access is
    // race-free and returns identical bytes.
    var chatStores = new Map();
    var stats = {
      localStorageAvailable: false,
      localStorageError: false,
      chromeStorageAvailable: false,
      chromeStorageError: false,
      readErrors: 0,
    };
    collectFromLocalStorage(filterSet, maxChats, chatStores, stats);
    await collectFromChromeStorage(filterSet, maxChats, chatStores, stats);

    if (!stats.localStorageAvailable && !stats.chromeStorageAvailable) {
      warnings.push('capture-storage-unavailable');
      return makeEarlyResult(observedAtIso, blockers, warnings);
    }
    if (stats.localStorageError || stats.chromeStorageError) {
      warnings.push('capture-store-enumeration-failed');
    }
    if (stats.readErrors > 0) {
      warnings.push('capture-store-read-errors');
    }
    if (chatStores.size === 0) {
      warnings.push('no-capture-stores-found');
      // Still emit a valid envelope describing the zero-observation
      // state so downstream consumers can confirm the bridge ran.
    }

    // ── 3. Per-chat aggregation (counts only) ─────────────────────────
    var agg = {
      captureStoreVersion: null,
      totalItemCount: 0,
      pinnedCount: 0,
      itemsByStatus: { new: 0, reviewed: 0, archived: 0, converted: 0, dismissed: 0, other: 0 },
      itemsByKindBucket: { captureSnippetKind: 0, otherKind: 0 },
      earliestCreatedAt: null,
      latestUpdatedAt: null,
      chatsObserved: [],
    };
    chatStores.forEach(function (store, chatId) {
      aggregateStore(store, agg);
      agg.chatsObserved.push(chatId);
    });

    // ── 4. chatsObservedHash: sha256 of sorted sha256(chatId) list ────
    // Allows a consumer to detect "same set of observed chats" without
    // ever seeing raw chat ids. Sorted-hex inputs ensure determinism.
    var perChatHashes = [];
    for (var j = 0; j < agg.chatsObserved.length; j++) {
      var h = await sha256Hex(agg.chatsObserved[j]);
      if (isSha256Hex(h)) perChatHashes.push(h);
    }
    perChatHashes.sort();
    var chatsObservedHash = perChatHashes.length > 0
      ? await sha256Hex(JSON.stringify(perChatHashes))
      : await sha256Hex('h2o.f10.5.no-chats-observed');

    // ── 5. Build payload (counts + structural metadata ONLY) ──────────
    var payload = {
      observationKind: 'native-extension.capture-state',
      observedAtIso: observedAtIso,
      captureStoreVersion: agg.captureStoreVersion != null ? agg.captureStoreVersion : 0,
      chatsObservedCount: agg.chatsObserved.length,
      totalItemCount: agg.totalItemCount,
      itemsByStatus: {
        new: agg.itemsByStatus.new,
        reviewed: agg.itemsByStatus.reviewed,
        archived: agg.itemsByStatus.archived,
        converted: agg.itemsByStatus.converted,
        dismissed: agg.itemsByStatus.dismissed,
        other: agg.itemsByStatus.other,
      },
      pinnedCount: agg.pinnedCount,
      itemsByKindBucket: {
        captureSnippetKind: agg.itemsByKindBucket.captureSnippetKind,
        otherKind: agg.itemsByKindBucket.otherKind,
      },
      timestampRangeIso: {
        earliestCreatedAtIso: epochMsToIsoSeconds(agg.earliestCreatedAt),
        latestUpdatedAtIso: epochMsToIsoSeconds(agg.latestUpdatedAt),
      },
      chatsObservedHash: chatsObservedHash,
      warningsObserved: warnings.slice(),
    };

    // ── 6. Defensive forever-no payload scan ──────────────────────────
    var leakedKey = payloadContainsForbiddenField(payload);
    if (leakedKey) {
      blockers.push('payload-contains-forever-no-field');
      // Return without the envelope to ensure no leaked field can
      // escape the bridge under any path.
      return {
        schema: RESULT_SCHEMA,
        ok: false,
        redacted: true,
        envelope: null,
        observation: {
          chatsObservedCount: agg.chatsObserved.length,
          totalItemCount: agg.totalItemCount,
        },
        findings: { blockers: blockers.slice(), warnings: warnings.slice() },
        observedAtIso: observedAtIso,
      };
    }

    // ── 7. capabilitySnapshotHash, dedupeKey, etc. ────────────────────
    var capabilitySnapshotHash = await sha256Hex(BRIDGE_VERSION_TAG);
    var dedupeKey = await sha256Hex(jsonCanonical({
      schema: ENVELOPE_SCHEMA,
      purpose: 'dedupeKey',
      platformId: 'chrome-studio',
      kind: 'evidence',
      subjectType: 'native-extension.capture.observation',
      operation: 'native-extension-capture-observation',
      chatsObservedHash: payload.chatsObservedHash,
      totalItemCount: payload.totalItemCount,
      captureStoreVersion: payload.captureStoreVersion,
    }));
    var payloadHash = await sha256Hex(jsonCanonical(payload));

    // ── 8. Construct envelope (kind: 'evidence', literal kind field) ──
    // The kind is a string literal so F10.2.2 scan-kind-literal-drift
    // can verify it against ENVELOPE_KINDS at scan time.
    var envelopeBase = {
      schema: 'h2o.crossPlatform.envelope.v1',
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'evidence',
      id: generateUuid(),
      lineageId: generateUuid(),
      createdAt: observedAtIso,
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'chrome-studio',
        surfaceKind: 'browser-studio',
        // Chrome-studio observing native runtime. The peer envelope is
        // left as empty hash strings because the chrome-studio bridge
        // does not currently carry an F2 redacted peer envelope of its
        // own; F10.3d's pattern only enriches Desktop. Format gate will
        // surface this as 'envelope-schema-too-new' the same way F10.3
        // did pre-F10.3d, which is the honest "absent data" signal.
        sourcePeerEnvelope: {
          physicalDeviceIdHash: '',
          installIdHash: '',
          syncPeerIdHash: '',
          surfaceKind: 'browser-studio',
        },
      },
      declaredAuthority: 'preview-coordinator',
      effectiveAuthority: 'preview-coordinator',
      capabilityUsed: 'produceEvidence',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: 'native-extension.capture.observation',
      subjectId: chatsObservedHash,
      operation: 'native-extension-capture-observation',
      redactionClass: 'redacted',
      dryRun: null,
      transactional: null,
      dedupeKey: dedupeKey,
      payloadHash: payloadHash,
      payload: payload,
    };
    var envelopeForDigest = canonicalize(envelopeBase);
    var eventDigest = await sha256Hex(JSON.stringify(envelopeForDigest));

    var envelope = Object.assign({}, envelopeBase, {
      eventDigest: eventDigest,
      warnings: [],
      blockers: [],
    });

    // ── 9. Format-gate verification on the constructed envelope ───────
    if (!isSha256Hex(envelope.capabilitySnapshotHash)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(envelope.dedupeKey)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(envelope.payloadHash)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(envelope.eventDigest)) blockers.push('envelope-schema-too-new');
    if (!isValidIsoSeconds(envelope.createdAt)) blockers.push('envelope-schema-too-new');
    var peer = envelope.sourcePlatform.sourcePeerEnvelope;
    if (!isSha256Hex(peer.physicalDeviceIdHash)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(peer.installIdHash)) blockers.push('envelope-schema-too-new');
    if (!isSha256Hex(peer.syncPeerIdHash)) blockers.push('envelope-schema-too-new');

    var dedupedBlockers = [];
    var seen = Object.create(null);
    for (var k = 0; k < blockers.length; k++) {
      if (!seen[blockers[k]]) {
        seen[blockers[k]] = true;
        dedupedBlockers.push(blockers[k]);
      }
    }

    return {
      schema: RESULT_SCHEMA,
      ok: dedupedBlockers.length === 0,
      redacted: true,
      envelope: envelope,
      observation: {
        chatsObservedCount: agg.chatsObserved.length,
        totalItemCount: agg.totalItemCount,
      },
      findings: { blockers: dedupedBlockers, warnings: warnings.slice() },
      observedAtIso: observedAtIso,
    };
  }

  // ── Public registration ─────────────────────────────────────────────
  H2O.Studio.diagnostics.previewNativeCaptureAsEvidence = previewNativeCaptureAsEvidence;
  H2O.Studio.diagnostics.__nativeCaptureEvidencePreviewInstalled = true;

})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
