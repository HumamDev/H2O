/* H2O Desktop Sync - F10.8.1 local relay outbox
 *
 * Desktop/Tauri-only durable staging for relay-safe envelopes.
 *
 * Safety invariants:
 *   - Storage only. No upload, download, inbox, convergence, WebDAV, fetch,
 *     runtime messaging, polling, timers, remote apply, or mobile write-back.
 *   - Append-only row model: existing rows are preserved byte-for-byte and
 *     new accepted envelopes are appended under a dedicated outbox key.
 *   - Enqueued envelopes stay inert data. Storing an applyEvent receipt does
 *     not make it executable by another peer.
 *   - Outbox rows store redacted metadata plus the serialized envelope blob.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__relayOutboxInstalled) return;

  var OUTBOX_KEY = 'h2o:sync:relay-outbox:v1';
  var OUTBOX_SCHEMA = 'h2o.desktop.sync.relay-outbox.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.relay-outbox-row.v1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.relay-outbox-enqueue.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.8.1';
  var RELAY_STATUS_PENDING = 'pending-upload';
  var RELAY_STATUS_UPLOADED = 'uploaded';
  var ALLOWED_KINDS = ['evidence', 'preview', 'proposal', 'conflictCandidate', 'applyEvent'];
  var SURFACE_KINDS = ['desktop-tauri', 'browser-studio', 'browser-runtime', 'mobile'];
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'url', 'path', 'password', 'apiKey'
  ];

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i += 1) out[keys[i]] = canonicalize(value[keys[i]]);
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
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
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : String(value == null ? '' : value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function generateUuid() {
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      global.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
  }

  function storageRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function' && typeof s.set === 'function') return s;
    } catch (_) { /* ignore */ }
    return null;
  }

  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        s.get([key], function (items) {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
  }

  function storageSet(key, value) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        var payload = {};
        payload[key] = value;
        s.set(payload, function () {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrHit = foreverNoKey(value[i]);
        if (arrHit) return arrHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (FOREVER_NO_FIELDS.indexOf(key) !== -1) return key;
      if (/Token$/.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }

  function envelopeForEventDigest(envelope) {
    var clone = JSON.parse(JSON.stringify(envelope));
    delete clone.eventDigest;
    delete clone.warnings;
    delete clone.blockers;
    return clone;
  }

  function sourcePeerEnvelope(envelope) {
    return safeObject(safeObject(safeObject(envelope).sourcePlatform).sourcePeerEnvelope);
  }

  function validatePeerEnvelope(envelope, blockers) {
    var sourcePlatform = safeObject(envelope.sourcePlatform);
    var peer = sourcePeerEnvelope(envelope);
    if (!cleanString(sourcePlatform.platformId)) addCode(blockers, 'source-platform-invalid');
    if (SURFACE_KINDS.indexOf(cleanString(sourcePlatform.surfaceKind)) === -1) {
      addCode(blockers, 'source-platform-invalid');
    }
    if (!isSha256Hex(peer.physicalDeviceIdHash)) addCode(blockers, 'invalid-peer-envelope');
    if (!isSha256Hex(peer.installIdHash)) addCode(blockers, 'invalid-peer-envelope');
    if (!isSha256Hex(peer.syncPeerIdHash)) addCode(blockers, 'invalid-peer-envelope');
    if (SURFACE_KINDS.indexOf(cleanString(peer.surfaceKind)) === -1) addCode(blockers, 'invalid-peer-envelope');
  }

  async function validateEnvelope(envelope) {
    var env = safeObject(envelope);
    var blockers = [];
    var warnings = [];
    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!isObject(envelope)) addCode(blockers, 'invalid-envelope');
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'invalid-schema');
    if (env.envelopeVersion !== 'v1') addCode(blockers, 'invalid-schema');
    if (env.envelopeKindVersion !== 'v1') addCode(blockers, 'invalid-schema');
    if (ALLOWED_KINDS.indexOf(cleanString(env.kind)) === -1) addCode(blockers, 'unsupported-envelope-kind');
    if (!isSha256Hex(env.dedupeKey)) addCode(blockers, 'invalid-dedupe-key');
    if (!isSha256Hex(env.eventDigest)) addCode(blockers, 'invalid-digest');
    if (!isSha256Hex(env.payloadHash)) addCode(blockers, 'invalid-digest');
    validatePeerEnvelope(env, blockers);
    codeList(env.blockers).forEach(function () { addCode(blockers, 'envelope-has-blockers'); });
    codeList(env.warnings).forEach(function (code) { addCode(warnings, code); });

    var forbiddenKey = foreverNoKey(env);
    if (forbiddenKey) {
      addCode(blockers, 'forbidden-field-present');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenKey);
    }

    var payloadHash = '';
    var eventDigest = '';
    if (!blockers.length || webCryptoAvailable()) {
      payloadHash = await sha256Hex(canonicalJson(env.payload || {}));
      eventDigest = await sha256Hex(canonicalJson(envelopeForEventDigest(env)));
    }
    if (payloadHash && env.payloadHash !== payloadHash) addCode(blockers, 'invalid-digest');
    if (eventDigest && env.eventDigest !== eventDigest) addCode(blockers, 'invalid-digest');

    return {
      ok: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      eventDigest: cleanString(env.eventDigest),
      dedupeKey: cleanString(env.dedupeKey),
      kind: cleanString(env.kind)
    };
  }

  function freshOutbox() {
    var now = nowIsoSeconds();
    return {
      schema: OUTBOX_SCHEMA,
      createdAt: now,
      updatedAt: now,
      rows: []
    };
  }

  function validRow(row) {
    var relayStatus = cleanString(row.relayStatus);
    return isObject(row)
      && row.schema === ROW_SCHEMA
      && isSha256Hex(row.envelopeDigest)
      && isSha256Hex(row.eventDigest)
      && isSha256Hex(row.dedupeKey)
      && ALLOWED_KINDS.indexOf(cleanString(row.kind)) !== -1
      && (relayStatus === RELAY_STATUS_PENDING || relayStatus === RELAY_STATUS_UPLOADED)
      && typeof row.serializedEnvelope === 'string'
      && row.serializedEnvelope.length > 0;
  }

  function normalizeOutbox(raw) {
    if (!raw) return freshOutbox();
    if (!isObject(raw) || raw.schema !== OUTBOX_SCHEMA || !Array.isArray(raw.rows)) {
      return null;
    }
    var rows = [];
    for (var i = 0; i < raw.rows.length; i += 1) {
      if (!validRow(raw.rows[i])) return null;
      rows.push(raw.rows[i]);
    }
    return {
      schema: OUTBOX_SCHEMA,
      createdAt: cleanString(raw.createdAt) || nowIsoSeconds(),
      updatedAt: cleanString(raw.updatedAt) || nowIsoSeconds(),
      rows: rows
    };
  }

  function duplicateRow(rows, dedupeKey, eventDigest) {
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (row.dedupeKey === dedupeKey) return 'duplicate-dedupe-key';
      if (row.eventDigest === eventDigest) return 'duplicate-event-digest';
    }
    return '';
  }

  function rowSummary(row, includeSerializedEnvelope) {
    var summary = {
      rowId: row.rowId,
      schema: row.schema,
      envelopeDigest: row.envelopeDigest,
      eventDigest: row.eventDigest,
      dedupeKey: row.dedupeKey,
      kind: row.kind,
      sourcePlatform: row.sourcePlatform,
      createdAt: row.createdAt,
      relayStatus: row.relayStatus,
      serializedEnvelopePresent: typeof row.serializedEnvelope === 'string' && row.serializedEnvelope.length > 0
    };
    if (row.uploadedAtIso) summary.uploadedAtIso = row.uploadedAtIso;
    if (row.remoteObjectKey) summary.remoteObjectKey = row.remoteObjectKey;
    if (includeSerializedEnvelope === true) summary.serializedEnvelope = row.serializedEnvelope;
    return summary;
  }

  function failure(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      ok: false,
      enqueued: false,
      localOnly: true,
      relayStatus: null,
      storageKey: OUTBOX_KEY,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  async function enqueueRelayEnvelope(input) {
    var args = safeObject(input);
    var envelope = safeObject(args.envelope);
    var validation = await validateEnvelope(envelope);
    if (!validation.ok) return failure(validation.blockers, validation.warnings);

    var serializedEnvelope = canonicalJson(envelope);
    var envelopeDigest = await sha256Hex(serializedEnvelope);
    var outbox;
    try {
      outbox = normalizeOutbox(await storageGet(OUTBOX_KEY));
    } catch (_) {
      return failure(['storage-unavailable'], validation.warnings);
    }
    if (!outbox) return failure(['outbox-malformed'], validation.warnings);

    var duplicate = duplicateRow(outbox.rows, validation.dedupeKey, validation.eventDigest);
    if (duplicate) return failure([duplicate], validation.warnings);

    var now = nowIsoSeconds();
    var row = {
      schema: ROW_SCHEMA,
      rowId: generateUuid(),
      envelopeDigest: envelopeDigest,
      eventDigest: validation.eventDigest,
      dedupeKey: validation.dedupeKey,
      kind: validation.kind,
      sourcePlatform: {
        platformId: cleanString(envelope.sourcePlatform && envelope.sourcePlatform.platformId),
        surfaceKind: cleanString(envelope.sourcePlatform && envelope.sourcePlatform.surfaceKind),
        sourcePeerEnvelope: sourcePeerEnvelope(envelope)
      },
      createdAt: now,
      relayStatus: RELAY_STATUS_PENDING,
      serializedEnvelope: serializedEnvelope
    };

    var next = {
      schema: OUTBOX_SCHEMA,
      createdAt: outbox.createdAt,
      updatedAt: now,
      rows: outbox.rows.concat([row])
    };
    try {
      await storageSet(OUTBOX_KEY, next);
    } catch (_) {
      return failure(['storage-unavailable'], validation.warnings);
    }

    return {
      schema: RESULT_SCHEMA,
      ok: true,
      enqueued: true,
      localOnly: true,
      storageKey: OUTBOX_KEY,
      relayStatus: RELAY_STATUS_PENDING,
      row: rowSummary(row, false),
      counts: {
        rows: next.rows.length,
        pendingUpload: next.rows.filter(function (item) { return item.relayStatus === RELAY_STATUS_PENDING; }).length,
        uploaded: next.rows.filter(function (item) { return item.relayStatus === RELAY_STATUS_UPLOADED; }).length
      },
      blockers: [],
      warnings: validation.warnings
    };
  }

  async function listRelayOutbox(options) {
    var opts = safeObject(options);
    var includeSerializedEnvelope = opts.includeSerializedEnvelope === true;
    var outbox;
    try {
      outbox = normalizeOutbox(await storageGet(OUTBOX_KEY));
    } catch (_) {
      return {
        schema: OUTBOX_SCHEMA,
        ok: false,
        storageKey: OUTBOX_KEY,
        rows: [],
        counts: { rows: 0, pendingUpload: 0, uploaded: 0 },
        blockers: ['storage-unavailable'],
        warnings: []
      };
    }
    if (!outbox) {
      return {
        schema: OUTBOX_SCHEMA,
        ok: false,
        storageKey: OUTBOX_KEY,
        rows: [],
        counts: { rows: 0, pendingUpload: 0, uploaded: 0 },
        blockers: ['outbox-malformed'],
        warnings: []
      };
    }
    return {
      schema: OUTBOX_SCHEMA,
      ok: true,
      storageKey: OUTBOX_KEY,
      createdAt: outbox.createdAt,
      updatedAt: outbox.updatedAt,
      rows: outbox.rows.map(function (row) { return rowSummary(row, includeSerializedEnvelope); }),
      counts: {
        rows: outbox.rows.length,
        pendingUpload: outbox.rows.filter(function (row) { return row.relayStatus === RELAY_STATUS_PENDING; }).length,
        uploaded: outbox.rows.filter(function (row) { return row.relayStatus === RELAY_STATUS_UPLOADED; }).length
      },
      blockers: [],
      warnings: []
    };
  }

  H2O.Desktop.Sync.enqueueRelayEnvelope = enqueueRelayEnvelope;
  H2O.Desktop.Sync.listRelayOutbox = listRelayOutbox;
  H2O.Desktop.Sync.__relayOutboxInstalled = true;
  H2O.Desktop.Sync.__relayOutboxVersion = VERSION;
  H2O.Desktop.Sync.__relayOutboxStorageKey = OUTBOX_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
