/* H2O Desktop Sync - F10.8.2 local relay inbox
 *
 * Desktop/Tauri-only intake for remotely produced relay envelopes.
 *
 * Safety invariants:
 *   - Inbox acceptance is not mutation. Rows are validation evidence only.
 *   - No apply, convergence, automatic review, automatic merge, WebDAV,
 *     fetch, runtime messaging, polling, timers, or mobile write-back.
 *   - Valid envelopes are staged as pending-review; expired or invalid
 *     envelopes are quarantined locally as expired/blocked rows.
 *   - Duplicate event digests are rejected and not appended.
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
  if (H2O.Desktop.Sync.__relayInboxInstalled) return;

  var INBOX_KEY = 'h2o:sync:relay-inbox:v1';
  var INBOX_SCHEMA = 'h2o.desktop.sync.relay-inbox.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.relay-inbox-row.v1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.relay-inbox-ingest.v1';
  var QUARANTINE_SCHEMA = 'h2o.desktop.sync.relay-inbox-quarantine.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.8.2';
  var RELAY_PENDING_REVIEW = 'pending-review';
  var RELAY_EXPIRED = 'expired';
  var RELAY_BLOCKED = 'blocked';
  var ALLOWED_KINDS = ['evidence', 'preview', 'proposal', 'conflictCandidate', 'applyEvent'];
  var READ_ONLY_KINDS = ['evidence', 'preview'];
  var WRITE_KINDS = ['proposal', 'conflictCandidate', 'applyEvent'];
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

  function validIsoSeconds(value) {
    var text = cleanString(value);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text)) return false;
    var ms = Date.parse(text);
    return Number.isFinite(ms);
  }

  function isExpired(envelope, nowIso) {
    var expiresAt = cleanString(envelope.expiresAt);
    if (!expiresAt) return false;
    if (!validIsoSeconds(expiresAt)) return false;
    return Date.parse(expiresAt) <= Date.parse(nowIso);
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

  function validatePosture(envelope, blockers) {
    var kind = cleanString(envelope.kind);
    if (READ_ONLY_KINDS.indexOf(kind) !== -1 && envelope.operationIntent !== undefined) {
      addCode(blockers, 'operation-intent-wrong-for-kind');
    }
    if (WRITE_KINDS.indexOf(kind) !== -1 && !cleanString(envelope.operationIntent)) {
      addCode(blockers, 'operation-intent-wrong-for-kind');
    }
    if (kind === 'preview' && envelope.dryRun !== true) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (kind === 'applyEvent' && envelope.dryRun !== false) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (kind === 'applyEvent' && envelope.transactional !== true) addCode(blockers, 'operation-intent-wrong-for-kind');
  }

  async function validateEnvelope(envelope, nowIso) {
    var env = safeObject(envelope);
    var blockers = [];
    var warnings = [];
    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!isObject(envelope)) addCode(blockers, 'invalid-envelope');
    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'invalid-schema');
    if (env.envelopeVersion !== 'v1') addCode(blockers, 'invalid-schema');
    if (env.envelopeKindVersion !== 'v1') addCode(blockers, 'invalid-schema');
    if (ALLOWED_KINDS.indexOf(cleanString(env.kind)) === -1) addCode(blockers, 'unsupported-envelope-kind');
    if (!validIsoSeconds(env.createdAt)) addCode(blockers, 'invalid-created-at');
    if (env.expiresAt !== undefined && !validIsoSeconds(env.expiresAt)) addCode(blockers, 'invalid-expiration');
    if (cleanString(env.redactionClass) !== 'redacted') addCode(blockers, 'relay-redaction-required');
    if (!isSha256Hex(env.dedupeKey)) addCode(blockers, 'invalid-dedupe-key');
    if (!isSha256Hex(env.eventDigest)) addCode(blockers, 'invalid-digest');
    if (!isSha256Hex(env.payloadHash)) addCode(blockers, 'invalid-digest');
    validatePeerEnvelope(env, blockers);
    validatePosture(env, blockers);
    codeList(env.blockers).forEach(function () { addCode(blockers, 'envelope-has-blockers'); });
    codeList(env.warnings).forEach(function (code) { addCode(warnings, code); });

    var forbiddenKey = foreverNoKey(env);
    if (forbiddenKey) {
      addCode(blockers, 'forbidden-field-present');
      addCode(warnings, 'blocked-forbidden-key-' + forbiddenKey);
    }

    var payloadHash = '';
    var eventDigest = '';
    if (webCryptoAvailable()) {
      payloadHash = await sha256Hex(canonicalJson(env.payload || {}));
      eventDigest = await sha256Hex(canonicalJson(envelopeForEventDigest(env)));
    }
    if (payloadHash && env.payloadHash !== payloadHash) addCode(blockers, 'invalid-digest');
    if (eventDigest && env.eventDigest !== eventDigest) addCode(blockers, 'invalid-digest');
    if (isExpired(env, nowIso)) addCode(warnings, 'envelope-expired');

    return {
      ok: blockers.length === 0,
      expired: blockers.length === 0 && isExpired(env, nowIso),
      blockers: blockers,
      warnings: warnings,
      eventDigest: isSha256Hex(env.eventDigest) ? cleanString(env.eventDigest) : '',
      dedupeKey: isSha256Hex(env.dedupeKey) ? cleanString(env.dedupeKey) : '',
      kind: cleanString(env.kind)
    };
  }

  function freshInbox() {
    var now = nowIsoSeconds();
    return {
      schema: INBOX_SCHEMA,
      createdAt: now,
      updatedAt: now,
      rows: []
    };
  }

  function validRow(row) {
    var relayStatus = cleanString(row.relayStatus);
    var kind = cleanString(row.kind);
    return isObject(row)
      && row.schema === ROW_SCHEMA
      && [RELAY_PENDING_REVIEW, RELAY_EXPIRED, RELAY_BLOCKED].indexOf(relayStatus) !== -1
      && typeof row.receivedAtIso === 'string'
      && isSha256Hex(row.envelopeDigest)
      && isSha256Hex(row.eventDigest)
      && isSha256Hex(row.dedupeKey)
      && (ALLOWED_KINDS.indexOf(kind) !== -1 || (relayStatus === RELAY_BLOCKED && !!kind))
      && isObject(row.sourcePlatform)
      && typeof row.serializedEnvelope === 'string'
      && row.serializedEnvelope.length > 0
      && isObject(row.validationSummary);
  }

  function normalizeInbox(raw) {
    if (!raw) return freshInbox();
    if (!isObject(raw) || raw.schema !== INBOX_SCHEMA || !Array.isArray(raw.rows)) return null;
    var rows = [];
    for (var i = 0; i < raw.rows.length; i += 1) {
      if (!validRow(raw.rows[i])) return null;
      rows.push(raw.rows[i]);
    }
    return {
      schema: INBOX_SCHEMA,
      createdAt: cleanString(raw.createdAt) || nowIsoSeconds(),
      updatedAt: cleanString(raw.updatedAt) || nowIsoSeconds(),
      rows: rows
    };
  }

  function duplicateEventDigest(rows, eventDigest) {
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].eventDigest === eventDigest) return true;
    }
    return false;
  }

  function duplicateDedupeKey(rows, dedupeKey) {
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].dedupeKey === dedupeKey) return true;
    }
    return false;
  }

  function sanitizedSerializedEnvelope(envelope, envelopeDigest, validation) {
    if (!validation.blockers.length && !validation.expired) return canonicalJson(envelope);
    if (validation.blockers.indexOf('forbidden-field-present') === -1) return canonicalJson(envelope);
    return canonicalJson({
      schema: QUARANTINE_SCHEMA,
      quarantined: true,
      originalEnvelopeDigest: envelopeDigest,
      relayStatus: RELAY_BLOCKED,
      blockers: validation.blockers.slice(),
      warnings: validation.warnings.slice()
    });
  }

  function rowSummary(row, includeSerializedEnvelope) {
    var summary = {
      rowId: row.rowId,
      schema: row.schema,
      relayStatus: row.relayStatus,
      receivedAtIso: row.receivedAtIso,
      envelopeDigest: row.envelopeDigest,
      eventDigest: row.eventDigest,
      dedupeKey: row.dedupeKey,
      kind: row.kind,
      sourcePlatform: row.sourcePlatform,
      serializedEnvelopePresent: typeof row.serializedEnvelope === 'string' && row.serializedEnvelope.length > 0,
      validationSummary: row.validationSummary
    };
    if (includeSerializedEnvelope === true) summary.serializedEnvelope = row.serializedEnvelope;
    return summary;
  }

  function failure(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      ok: false,
      ingested: false,
      localOnly: true,
      relayStatus: null,
      storageKey: INBOX_KEY,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  async function ingestRelayEnvelope(input) {
    var args = safeObject(input);
    var envelope = safeObject(args.envelope);
    var now = nowIsoSeconds();
    var validation = await validateEnvelope(envelope, now);
    var serializedCandidate = canonicalJson(envelope);
    var envelopeDigest = await sha256Hex(serializedCandidate);
    var rowEventDigest = validation.eventDigest || envelopeDigest;
    var rowDedupeKey = validation.dedupeKey || await sha256Hex('relay-inbox-dedupe-fallback:' + envelopeDigest);

    var inbox;
    try {
      inbox = normalizeInbox(await storageGet(INBOX_KEY));
    } catch (_) {
      return failure(['storage-unavailable'], validation.warnings);
    }
    if (!inbox) return failure(['inbox-malformed'], validation.warnings);
    if (duplicateEventDigest(inbox.rows, rowEventDigest)) {
      return failure(['duplicate-eventDigest'], validation.warnings);
    }
    if (!validation.blockers.length && duplicateDedupeKey(inbox.rows, rowDedupeKey)) {
      addCode(validation.blockers, 'replay-dedupe-key');
    }

    var relayStatus = RELAY_PENDING_REVIEW;
    if (validation.blockers.length) relayStatus = RELAY_BLOCKED;
    else if (validation.expired) relayStatus = RELAY_EXPIRED;

    var row = {
      schema: ROW_SCHEMA,
      rowId: generateUuid(),
      relayStatus: relayStatus,
      receivedAtIso: now,
      envelopeDigest: envelopeDigest,
      eventDigest: rowEventDigest,
      dedupeKey: rowDedupeKey,
      kind: validation.kind || 'unknown',
      sourcePlatform: {
        platformId: cleanString(envelope.sourcePlatform && envelope.sourcePlatform.platformId),
        surfaceKind: cleanString(envelope.sourcePlatform && envelope.sourcePlatform.surfaceKind),
        sourcePeerEnvelope: sourcePeerEnvelope(envelope)
      },
      serializedEnvelope: sanitizedSerializedEnvelope(envelope, envelopeDigest, validation),
      validationSummary: {
        ok: validation.ok && !validation.expired,
        expired: validation.expired,
        blockers: validation.blockers.slice(),
        warnings: validation.warnings.slice()
      }
    };

    var next = {
      schema: INBOX_SCHEMA,
      createdAt: inbox.createdAt,
      updatedAt: now,
      rows: inbox.rows.concat([row])
    };
    try {
      await storageSet(INBOX_KEY, next);
    } catch (_) {
      return failure(['storage-unavailable'], validation.warnings);
    }

    return {
      schema: RESULT_SCHEMA,
      ok: validation.ok && !validation.expired,
      ingested: true,
      localOnly: true,
      storageKey: INBOX_KEY,
      relayStatus: relayStatus,
      row: rowSummary(row, false),
      counts: countRows(next.rows),
      blockers: validation.blockers.slice(),
      warnings: validation.warnings.slice()
    };
  }

  function countRows(rows) {
    return {
      rows: rows.length,
      pendingReview: rows.filter(function (row) { return row.relayStatus === RELAY_PENDING_REVIEW; }).length,
      expired: rows.filter(function (row) { return row.relayStatus === RELAY_EXPIRED; }).length,
      blocked: rows.filter(function (row) { return row.relayStatus === RELAY_BLOCKED; }).length
    };
  }

  async function listRelayInbox(options) {
    var opts = safeObject(options);
    var includeSerializedEnvelope = opts.includeSerializedEnvelope === true;
    var inbox;
    try {
      inbox = normalizeInbox(await storageGet(INBOX_KEY));
    } catch (_) {
      return {
        schema: INBOX_SCHEMA,
        ok: false,
        storageKey: INBOX_KEY,
        rows: [],
        counts: countRows([]),
        blockers: ['storage-unavailable'],
        warnings: []
      };
    }
    if (!inbox) {
      return {
        schema: INBOX_SCHEMA,
        ok: false,
        storageKey: INBOX_KEY,
        rows: [],
        counts: countRows([]),
        blockers: ['inbox-malformed'],
        warnings: []
      };
    }
    return {
      schema: INBOX_SCHEMA,
      ok: true,
      storageKey: INBOX_KEY,
      createdAt: inbox.createdAt,
      updatedAt: inbox.updatedAt,
      rows: inbox.rows.map(function (row) { return rowSummary(row, includeSerializedEnvelope); }),
      counts: countRows(inbox.rows),
      blockers: [],
      warnings: []
    };
  }

  H2O.Desktop.Sync.ingestRelayEnvelope = ingestRelayEnvelope;
  H2O.Desktop.Sync.listRelayInbox = listRelayInbox;
  H2O.Desktop.Sync.__relayInboxInstalled = true;
  H2O.Desktop.Sync.__relayInboxVersion = VERSION;
  H2O.Desktop.Sync.__relayInboxStorageKey = INBOX_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
