/* H2O Desktop Sync - F10.8.8 consumed operation ledger
 *
 * Desktop/Tauri-only append/list ledger for already processed, ignored,
 * blocked, duplicate, replay, expired, or superseded convergence-relevant
 * events.
 *
 * Safety invariants:
 *   - Ledger only. No convergence, apply, publication, upload/download,
 *     watermark advancement, domain mutation, timers, polling, or mobile
 *     write-back.
 *   - Rows are append-only. Existing rows are preserved byte-for-byte and new
 *     validated consumed-operation rows are appended under a dedicated key.
 *   - This module records processing status; it never changes archive/domain
 *     state and never makes artifacts relay-visible.
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
  if (H2O.Desktop.Sync.__consumedOperationLedgerInstalled) return;

  var LEDGER_KEY = 'h2o:sync:consumed-operation-ledger:v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.consumed-operation-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.consumed-operation-ledger-row.v1';
  var RECORD_SCHEMA = 'h2o.desktop.sync.consumed-operation-record.v1';
  var LIST_SCHEMA = 'h2o.desktop.sync.consumed-operation-list.v1';
  var VERSION = '0.1.0-f10.8.8';
  var CONSUMED_STATUSES = [
    'consumed',
    'ignored',
    'blocked',
    'duplicate',
    'replay',
    'expired',
    'superseded'
  ];
  var ENVELOPE_KINDS = [
    'evidence',
    'preview',
    'proposal',
    'conflictCandidate',
    'applyEvent'
  ];
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'path', 'url', 'password', 'apiKey'
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

  function isIso(value) {
    var text = cleanString(value);
    if (!text) return false;
    return Number.isFinite(Date.parse(text));
  }

  function validIsoOrNull(value) {
    if (value == null) return true;
    var text = cleanString(value);
    if (!text) return true;
    return Number.isFinite(Date.parse(text));
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

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
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

  function normalizeLedger(raw) {
    if (!raw) return { schema: LEDGER_SCHEMA, createdAtIso: nowIsoSeconds(), rows: [] };
    if (!isObject(raw) || raw.schema !== LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return {
      schema: LEDGER_SCHEMA,
      createdAtIso: cleanString(raw.createdAtIso) || nowIsoSeconds(),
      updatedAtIso: cleanString(raw.updatedAtIso),
      rows: raw.rows.slice()
    };
  }

  async function actorPeerFromIdentity() {
    var identity = H2O.Studio && H2O.Studio.identity;
    var raw = null;
    try {
      if (identity && typeof identity.get === 'function') raw = identity.get();
    } catch (_) {
      raw = null;
    }
    if (!isObject(raw)) return null;
    var physicalDeviceIdHash = cleanString(raw.physicalDeviceIdHash);
    var installIdHash = cleanString(raw.installIdHash);
    var syncPeerIdHash = cleanString(raw.syncPeerIdHash);
    if (!physicalDeviceIdHash && cleanString(raw.physicalDeviceId)) {
      physicalDeviceIdHash = await sha256Hex(cleanString(raw.physicalDeviceId));
    }
    if (!installIdHash && cleanString(raw.installId)) {
      installIdHash = await sha256Hex(cleanString(raw.installId));
    }
    if (!syncPeerIdHash && cleanString(raw.syncPeerId)) {
      syncPeerIdHash = await sha256Hex(cleanString(raw.syncPeerId));
    }
    return {
      physicalDeviceIdHash: physicalDeviceIdHash,
      installIdHash: installIdHash,
      syncPeerIdHash: syncPeerIdHash,
      surfaceKind: 'desktop-tauri'
    };
  }

  function validPeer(peer) {
    var p = safeObject(peer);
    return isSha256Hex(p.physicalDeviceIdHash) &&
      isSha256Hex(p.installIdHash) &&
      isSha256Hex(p.syncPeerIdHash) &&
      cleanString(p.surfaceKind || 'desktop-tauri') === 'desktop-tauri';
  }

  function validationSummary(input, blockers, warnings) {
    var summary = safeObject(input);
    var out = {
      ok: summary.ok === true,
      blockers: codeList(summary.blockers),
      warnings: codeList(summary.warnings)
    };
    blockers.forEach(function (code) { addCode(out.blockers, code); });
    warnings.forEach(function (code) { addCode(out.warnings, code); });
    out.ok = out.blockers.length === 0;
    return out;
  }

  function rowSummary(row) {
    var r = safeObject(row);
    return {
      schema: ROW_SCHEMA,
      consumedId: cleanString(r.consumedId),
      eventDigest: cleanString(r.eventDigest),
      dedupeKey: cleanString(r.dedupeKey),
      lineageId: cleanString(r.lineageId),
      subjectId: cleanString(r.subjectId),
      sourcePeerId: cleanString(r.sourcePeerId),
      envelopeKind: cleanString(r.envelopeKind),
      operationKind: cleanString(r.operationKind),
      consumedStatus: cleanString(r.consumedStatus),
      consumedAtIso: cleanString(r.consumedAtIso),
      actorPeer: safeObject(r.actorPeer),
      reason: cleanString(r.reason),
      validationSummary: safeObject(r.validationSummary)
    };
  }

  function countsFor(rows) {
    var counts = {
      total: rows.length,
      consumed: 0,
      ignored: 0,
      blocked: 0,
      duplicate: 0,
      replay: 0,
      expired: 0,
      superseded: 0,
      evidence: 0,
      preview: 0,
      proposal: 0,
      conflictCandidate: 0,
      applyEvent: 0
    };
    rows.forEach(function (row) {
      var status = cleanString(row.consumedStatus);
      var kind = cleanString(row.envelopeKind);
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      if (Object.prototype.hasOwnProperty.call(counts, kind)) counts[kind] += 1;
    });
    return counts;
  }

  function duplicateExists(rows, eventDigest, dedupeKey) {
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.eventDigest) === eventDigest && cleanString(row.dedupeKey) === dedupeKey) {
        return true;
      }
    }
    return false;
  }

  function validateRowInput(row, blockers, warnings) {
    if (!isSha256Hex(row.eventDigest)) addCode(blockers, 'eventDigest-invalid');
    if (!isSha256Hex(row.dedupeKey)) addCode(blockers, 'dedupeKey-invalid');
    if (cleanString(row.lineageId) && cleanString(row.lineageId).length > 160) {
      addCode(blockers, 'lineageId-invalid');
    }
    if (cleanString(row.subjectId) && !isSha256Hex(row.subjectId)) {
      addCode(blockers, 'subjectId-invalid');
    }
    if (cleanString(row.sourcePeerId) && !isSha256Hex(row.sourcePeerId)) {
      addCode(blockers, 'sourcePeerId-invalid');
    }
    if (ENVELOPE_KINDS.indexOf(cleanString(row.envelopeKind)) === -1) {
      addCode(blockers, 'envelope-kind-invalid');
    }
    if (!cleanString(row.operationKind)) addCode(blockers, 'operationKind-required');
    if (CONSUMED_STATUSES.indexOf(cleanString(row.consumedStatus)) === -1) {
      addCode(blockers, 'consumed-status-invalid');
    }
    if (!isIso(row.consumedAtIso)) addCode(blockers, 'consumedAtIso-invalid');
    if (!validPeer(row.actorPeer)) addCode(blockers, 'actor-peer-invalid');
    if (cleanString(row.reason).length > 240) addCode(blockers, 'reason-too-long');
    if (!validIsoOrNull(row.validationSummary && row.validationSummary.checkedAtIso)) {
      addCode(blockers, 'validationSummary-checkedAtIso-invalid');
    }
    var forbidden = foreverNoKey(row);
    if (forbidden) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function failure(schema, blockers, warnings) {
    return {
      schema: schema,
      ok: false,
      appended: false,
      row: null,
      rows: [],
      counts: countsFor([]),
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  async function recordConsumedOperation(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var actorPeer = isObject(args.actorPeer) ? safeObject(args.actorPeer) : await actorPeerFromIdentity();
    var consumedAtIso = cleanString(args.consumedAtIso) || nowIsoSeconds();
    var row = {
      schema: ROW_SCHEMA,
      consumedId: cleanString(args.consumedId) || generateUuid(),
      eventDigest: cleanString(args.eventDigest).toLowerCase(),
      dedupeKey: cleanString(args.dedupeKey).toLowerCase(),
      lineageId: cleanString(args.lineageId),
      subjectId: cleanString(args.subjectId).toLowerCase(),
      sourcePeerId: cleanString(args.sourcePeerId).toLowerCase(),
      envelopeKind: cleanString(args.envelopeKind),
      operationKind: cleanString(args.operationKind),
      consumedStatus: cleanString(args.consumedStatus || args.status || 'consumed'),
      consumedAtIso: consumedAtIso,
      actorPeer: actorPeer || {},
      reason: cleanString(args.reason),
      validationSummary: validationSummary(args.validationSummary, [], [])
    };

    validateRowInput(row, blockers, warnings);
    row.validationSummary = validationSummary(args.validationSummary, blockers, warnings);
    if (blockers.length) return failure(RECORD_SCHEMA, blockers, warnings);

    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return failure(RECORD_SCHEMA, ['consumed-operation-ledger-unavailable'], warnings);
    }
    if (!ledger) return failure(RECORD_SCHEMA, ['consumed-operation-ledger-malformed'], warnings);
    if (duplicateExists(ledger.rows, row.eventDigest, row.dedupeKey)) {
      return failure(RECORD_SCHEMA, ['duplicate-consumed-operation'], warnings);
    }

    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: row.consumedAtIso,
      rows: ledger.rows.concat([row])
    };
    try {
      await storageSet(LEDGER_KEY, next);
    } catch (_) {
      return failure(RECORD_SCHEMA, ['consumed-operation-ledger-write-failed'], warnings);
    }

    return {
      schema: RECORD_SCHEMA,
      ok: true,
      appended: true,
      row: rowSummary(row),
      rows: [],
      counts: countsFor(next.rows),
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  async function listConsumedOperations() {
    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return failure(LIST_SCHEMA, ['consumed-operation-ledger-unavailable'], []);
    }
    if (!ledger) return failure(LIST_SCHEMA, ['consumed-operation-ledger-malformed'], []);
    var rows = ledger.rows.map(rowSummary);
    var blockers = [];
    var warnings = [];
    var forbidden = foreverNoKey(rows);
    if (forbidden) {
      addCode(blockers, 'consumed-operation-ledger-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return {
      schema: LIST_SCHEMA,
      ok: blockers.length === 0,
      storageKey: LEDGER_KEY,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: cleanString(ledger.updatedAtIso) || null,
      rows: blockers.length ? [] : rows,
      counts: blockers.length ? countsFor([]) : countsFor(rows),
      blockers: blockers,
      warnings: warnings
    };
  }

  H2O.Desktop.Sync.recordConsumedOperation = recordConsumedOperation;
  H2O.Desktop.Sync.listConsumedOperations = listConsumedOperations;
  H2O.Desktop.Sync.__consumedOperationLedgerInstalled = true;
  H2O.Desktop.Sync.__consumedOperationLedgerVersion = VERSION;
  H2O.Desktop.Sync.__consumedOperationLedgerKey = LEDGER_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
