/* H2O Desktop Sync - F10.8.7 convergence watermark persistence
 *
 * Desktop/Tauri-only append-only watermark ledger.
 *
 * Safety invariants:
 *   - Watermark persistence only. No convergence, apply, publication, outbox,
 *     inbox, WebDAV, remote mutation, automatic advancement, timers, polling,
 *     or mobile write-back.
 *   - Recording is explicit only through recordConvergenceWatermark().
 *   - Rows are immutable. Existing rows are preserved byte-for-byte and new
 *     validated watermark rows are appended under a dedicated storage key.
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
  if (H2O.Desktop.Sync.__convergenceWatermarksInstalled) return;

  var STORAGE_KEY = 'h2o:sync:convergence-watermarks:v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-watermark-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-watermark-row.v1';
  var RECORD_SCHEMA = 'h2o.desktop.sync.convergence-watermark-record.v1';
  var LIST_SCHEMA = 'h2o.desktop.sync.convergence-watermark-list.v1';
  var VERSION = '0.1.0-f10.8.7';
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

  function isStateHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
  }

  function isIso(value) {
    var text = cleanString(value);
    if (!text) return false;
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

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      out[key] = canonicalize(value[key]);
    });
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

  function rowSummary(row) {
    var r = safeObject(row);
    return {
      schema: ROW_SCHEMA,
      watermarkId: cleanString(r.watermarkId),
      peerId: cleanString(r.peerId),
      subjectId: cleanString(r.subjectId),
      lineageId: cleanString(r.lineageId),
      revisionHash: cleanString(r.revisionHash),
      watermarkAtIso: cleanString(r.watermarkAtIso),
      recordedAtIso: cleanString(r.recordedAtIso),
      dedupeKey: cleanString(r.dedupeKey)
    };
  }

  function failure(schema, blockers, warnings) {
    return {
      schema: schema,
      ok: false,
      row: null,
      rows: [],
      counts: { rows: 0, peers: 0, subjects: 0 },
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  function validateInput(args, blockers, warnings) {
    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!isSha256Hex(args.peerId)) addCode(blockers, 'peerId-invalid');
    if (!isSha256Hex(args.subjectId)) addCode(blockers, 'subjectId-invalid');
    if (!cleanString(args.lineageId)) addCode(blockers, 'lineageId-required');
    if (!isStateHash(args.revisionHash)) addCode(blockers, 'revisionHash-invalid');
    if (!isIso(args.watermarkAtIso)) addCode(blockers, 'watermarkAtIso-invalid');
    var forbidden = foreverNoKey(args);
    if (forbidden) {
      addCode(blockers, 'watermark-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function duplicateExists(rows, dedupeKey) {
    for (var i = 0; i < rows.length; i += 1) {
      if (cleanString(rows[i] && rows[i].dedupeKey) === dedupeKey) return true;
    }
    return false;
  }

  function latestByPeerSubject(rows) {
    var latest = {};
    rows.forEach(function (row) {
      var summary = rowSummary(row);
      var key = summary.peerId + ':' + summary.subjectId;
      var current = latest[key];
      if (!current || Date.parse(summary.watermarkAtIso) >= Date.parse(current.watermarkAtIso)) {
        latest[key] = summary;
      }
    });
    return latest;
  }

  function countsFor(rows) {
    var peers = {};
    var subjects = {};
    rows.forEach(function (row) {
      var summary = rowSummary(row);
      if (summary.peerId) peers[summary.peerId] = true;
      if (summary.subjectId) subjects[summary.subjectId] = true;
    });
    return {
      rows: rows.length,
      peers: Object.keys(peers).length,
      subjects: Object.keys(subjects).length
    };
  }

  async function recordConvergenceWatermark(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var watermarkAtIso = cleanString(args.watermarkAtIso) || nowIsoSeconds();
    var candidate = {
      peerId: cleanString(args.peerId).toLowerCase(),
      subjectId: cleanString(args.subjectId).toLowerCase(),
      lineageId: cleanString(args.lineageId),
      revisionHash: cleanString(args.revisionHash).toLowerCase(),
      watermarkAtIso: watermarkAtIso
    };
    validateInput(candidate, blockers, warnings);
    if (blockers.length) return failure(RECORD_SCHEMA, blockers, warnings);

    var dedupeKey = await sha256Hex(canonicalJson({
      schema: ROW_SCHEMA,
      peerId: candidate.peerId,
      subjectId: candidate.subjectId,
      lineageId: candidate.lineageId,
      revisionHash: candidate.revisionHash,
      watermarkAtIso: candidate.watermarkAtIso
    }));
    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(STORAGE_KEY));
    } catch (_) {
      return failure(RECORD_SCHEMA, ['convergence-watermark-storage-unavailable'], warnings);
    }
    if (!ledger) return failure(RECORD_SCHEMA, ['convergence-watermark-ledger-malformed'], warnings);
    if (duplicateExists(ledger.rows, dedupeKey)) {
      return failure(RECORD_SCHEMA, ['duplicate-convergence-watermark'], warnings);
    }

    var row = {
      schema: ROW_SCHEMA,
      watermarkId: generateUuid(),
      peerId: candidate.peerId,
      subjectId: candidate.subjectId,
      lineageId: candidate.lineageId,
      revisionHash: candidate.revisionHash,
      watermarkAtIso: candidate.watermarkAtIso,
      recordedAtIso: nowIsoSeconds(),
      dedupeKey: dedupeKey
    };
    var forbidden = foreverNoKey(row);
    if (forbidden) {
      addCode(blockers, 'watermark-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
      return failure(RECORD_SCHEMA, blockers, warnings);
    }

    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: row.recordedAtIso,
      rows: ledger.rows.concat([row])
    };
    try {
      await storageSet(STORAGE_KEY, next);
    } catch (_) {
      return failure(RECORD_SCHEMA, ['convergence-watermark-write-failed'], warnings);
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

  async function getConvergenceWatermarks() {
    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(STORAGE_KEY));
    } catch (_) {
      return failure(LIST_SCHEMA, ['convergence-watermark-storage-unavailable'], []);
    }
    if (!ledger) return failure(LIST_SCHEMA, ['convergence-watermark-ledger-malformed'], []);
    var rows = ledger.rows.map(rowSummary);
    var blockers = [];
    var warnings = [];
    var forbidden = foreverNoKey(rows);
    if (forbidden) {
      addCode(blockers, 'convergence-watermarks-contain-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return {
      schema: LIST_SCHEMA,
      ok: blockers.length === 0,
      storageKey: STORAGE_KEY,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: cleanString(ledger.updatedAtIso) || null,
      rows: blockers.length ? [] : rows,
      latestByPeerSubject: blockers.length ? {} : latestByPeerSubject(rows),
      counts: blockers.length ? countsFor([]) : countsFor(rows),
      blockers: blockers,
      warnings: warnings
    };
  }

  H2O.Desktop.Sync.getConvergenceWatermarks = getConvergenceWatermarks;
  H2O.Desktop.Sync.recordConvergenceWatermark = recordConvergenceWatermark;
  H2O.Desktop.Sync.__convergenceWatermarksInstalled = true;
  H2O.Desktop.Sync.__convergenceWatermarksVersion = VERSION;
  H2O.Desktop.Sync.__convergenceWatermarksKey = STORAGE_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
