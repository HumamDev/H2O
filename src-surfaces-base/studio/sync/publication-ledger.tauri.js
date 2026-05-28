/* H2O Desktop Sync - F10.8.6g1 shared publication ledger
 *
 * Desktop/Tauri-only append/list ledger for publication lifecycle events.
 *
 * Safety invariants:
 *   - Ledger only. No publish action, outbox enqueue, upload/download, apply,
 *     convergence, remote mutation, automatic merge, timers, polling, or
 *     mobile write-back.
 *   - Rows are append-only. Existing rows are preserved byte-for-byte and new
 *     validated publication events are appended under a dedicated ledger key.
 *   - This module records publication lifecycle status; it never makes an
 *     artifact relay-visible by itself.
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
  if (H2O.Desktop.Sync.__publicationLedgerInstalled) return;

  var LEDGER_KEY = 'h2o:sync:publication-ledger:v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.publication-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.publication-ledger-row.v1';
  var APPEND_SCHEMA = 'h2o.desktop.sync.publication-ledger-append.v1';
  var LIST_SCHEMA = 'h2o.desktop.sync.publication-ledger-list.v1';
  var VERSION = '0.1.0-f10.8.6g1';
  var PROPOSAL_CANDIDATE_LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var CONFLICT_CANDIDATE_LEDGER_KEY = 'h2o:sync:convergence-conflict-candidates:v1';
  var CANDIDATE_KINDS = ['proposal', 'conflictCandidate'];
  var PUBLICATION_STATUSES = [
    'generated',
    'published',
    'downloaded',
    'reviewed',
    'superseded',
    'expired',
    'withdrawn',
    'blocked'
  ];
  var RELAY_STATUSES = [
    '',
    'pending-upload',
    'uploaded',
    'pending-review',
    'deduped',
    'expired',
    'blocked'
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

  function sourceLedgerKeyForKind(kind) {
    if (kind === 'proposal') return PROPOSAL_CANDIDATE_LEDGER_KEY;
    if (kind === 'conflictCandidate') return CONFLICT_CANDIDATE_LEDGER_KEY;
    return '';
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

  function rowSummary(row) {
    var r = safeObject(row);
    return {
      schema: ROW_SCHEMA,
      publicationId: cleanString(r.publicationId),
      candidateKind: cleanString(r.candidateKind),
      candidateRowId: cleanString(r.candidateRowId),
      envelopeId: cleanString(r.envelopeId),
      lineageId: cleanString(r.lineageId),
      subjectId: cleanString(r.subjectId),
      eventDigest: cleanString(r.eventDigest),
      dedupeKey: cleanString(r.dedupeKey),
      sourceLedgerKey: cleanString(r.sourceLedgerKey),
      publishedAtIso: r.publishedAtIso || null,
      actorPeer: safeObject(r.actorPeer),
      publicationStatus: cleanString(r.publicationStatus),
      outboxRowId: r.outboxRowId || null,
      relayStatus: r.relayStatus || null,
      validationSummary: safeObject(r.validationSummary)
    };
  }

  function countsFor(rows) {
    var counts = {
      total: rows.length,
      generated: 0,
      published: 0,
      downloaded: 0,
      reviewed: 0,
      superseded: 0,
      expired: 0,
      withdrawn: 0,
      blocked: 0,
      proposal: 0,
      conflictCandidate: 0
    };
    rows.forEach(function (row) {
      var status = cleanString(row.publicationStatus);
      var kind = cleanString(row.candidateKind);
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
      if (Object.prototype.hasOwnProperty.call(counts, kind)) counts[kind] += 1;
    });
    return counts;
  }

  function validateRowInput(row, blockers, warnings) {
    var candidateKind = cleanString(row.candidateKind);
    var expectedSource = sourceLedgerKeyForKind(candidateKind);
    if (CANDIDATE_KINDS.indexOf(candidateKind) === -1) addCode(blockers, 'candidate-kind-invalid');
    if (!cleanString(row.candidateRowId)) addCode(blockers, 'candidate-row-id-required');
    if (!cleanString(row.envelopeId)) addCode(blockers, 'envelope-id-required');
    if (!cleanString(row.lineageId)) addCode(blockers, 'lineage-id-required');
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!isSha256Hex(row.eventDigest)) addCode(blockers, 'eventDigest-invalid');
    if (!isSha256Hex(row.dedupeKey)) addCode(blockers, 'dedupeKey-invalid');
    if (!expectedSource) addCode(blockers, 'source-ledger-key-invalid');
    if (expectedSource && cleanString(row.sourceLedgerKey) !== expectedSource) {
      addCode(blockers, 'source-ledger-key-mismatch');
    }
    if (PUBLICATION_STATUSES.indexOf(cleanString(row.publicationStatus)) === -1) {
      addCode(blockers, 'publication-status-invalid');
    }
    if (!validIsoOrNull(row.publishedAtIso)) addCode(blockers, 'publishedAtIso-invalid');
    if (RELAY_STATUSES.indexOf(cleanString(row.relayStatus)) === -1) addCode(blockers, 'relay-status-invalid');
    if (cleanString(row.publicationStatus) === 'published' && !cleanString(row.outboxRowId)) {
      addCode(warnings, 'published-status-without-outbox-row');
    }
    if (!validPeer(row.actorPeer)) addCode(blockers, 'actor-peer-invalid');
    var forbidden = foreverNoKey(row);
    if (forbidden) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  async function appendPublicationLedgerEvent(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var candidateKind = cleanString(args.candidateKind);
    var status = cleanString(args.publicationStatus || args.status || 'generated');
    var sourceLedgerKey = cleanString(args.sourceLedgerKey || sourceLedgerKeyForKind(candidateKind));
    var actorPeer = isObject(args.actorPeer) ? safeObject(args.actorPeer) : await actorPeerFromIdentity();
    var publishedAtIso = args.publishedAtIso == null || cleanString(args.publishedAtIso) === ''
      ? (status === 'published' ? nowIsoSeconds() : null)
      : cleanString(args.publishedAtIso);
    var relayStatus = args.relayStatus == null ? null : cleanString(args.relayStatus);
    var row = {
      schema: ROW_SCHEMA,
      publicationId: cleanString(args.publicationId) || generateUuid(),
      candidateKind: candidateKind,
      candidateRowId: cleanString(args.candidateRowId),
      envelopeId: cleanString(args.envelopeId),
      lineageId: cleanString(args.lineageId),
      subjectId: cleanString(args.subjectId).toLowerCase(),
      eventDigest: cleanString(args.eventDigest).toLowerCase(),
      dedupeKey: cleanString(args.dedupeKey).toLowerCase(),
      sourceLedgerKey: sourceLedgerKey,
      publishedAtIso: publishedAtIso,
      actorPeer: actorPeer || {},
      publicationStatus: status,
      outboxRowId: args.outboxRowId == null ? null : cleanString(args.outboxRowId),
      relayStatus: relayStatus,
      validationSummary: validationSummary(args.validationSummary, [], [])
    };

    validateRowInput(row, blockers, warnings);
    row.validationSummary = validationSummary(args.validationSummary, blockers, warnings);
    if (blockers.length) {
      return {
        schema: APPEND_SCHEMA,
        ok: false,
        appended: false,
        row: null,
        blockers: codeList(blockers),
        warnings: codeList(warnings)
      };
    }

    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return {
        schema: APPEND_SCHEMA,
        ok: false,
        appended: false,
        row: null,
        blockers: ['publication-ledger-unavailable'],
        warnings: codeList(warnings)
      };
    }
    if (!ledger) {
      return {
        schema: APPEND_SCHEMA,
        ok: false,
        appended: false,
        row: null,
        blockers: ['publication-ledger-malformed'],
        warnings: codeList(warnings)
      };
    }

    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: nowIsoSeconds(),
      rows: ledger.rows.concat([row])
    };
    try {
      await storageSet(LEDGER_KEY, next);
    } catch (_) {
      return {
        schema: APPEND_SCHEMA,
        ok: false,
        appended: false,
        row: null,
        blockers: ['publication-ledger-write-failed'],
        warnings: codeList(warnings)
      };
    }

    return {
      schema: APPEND_SCHEMA,
      ok: true,
      appended: true,
      row: rowSummary(row),
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  async function listPublicationLedger() {
    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return {
        schema: LIST_SCHEMA,
        ok: false,
        rows: [],
        counts: countsFor([]),
        blockers: ['publication-ledger-unavailable'],
        warnings: []
      };
    }
    if (!ledger) {
      return {
        schema: LIST_SCHEMA,
        ok: false,
        rows: [],
        counts: countsFor([]),
        blockers: ['publication-ledger-malformed'],
        warnings: []
      };
    }
    var rows = ledger.rows.map(rowSummary);
    var blockers = [];
    var warnings = [];
    var forbidden = foreverNoKey(rows);
    if (forbidden) {
      addCode(blockers, 'publication-ledger-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return {
      schema: LIST_SCHEMA,
      ok: blockers.length === 0,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: cleanString(ledger.updatedAtIso) || null,
      rows: blockers.length ? [] : rows,
      counts: blockers.length ? countsFor([]) : countsFor(rows),
      blockers: blockers,
      warnings: warnings
    };
  }

  H2O.Desktop.Sync.appendPublicationLedgerEvent = appendPublicationLedgerEvent;
  H2O.Desktop.Sync.listPublicationLedger = listPublicationLedger;
  H2O.Desktop.Sync.__publicationLedgerInstalled = true;
  H2O.Desktop.Sync.__publicationLedgerVersion = VERSION;
  H2O.Desktop.Sync.__publicationLedgerKey = LEDGER_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
