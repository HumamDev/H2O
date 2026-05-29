/* H2O Desktop Sync - F12.0.4b delete F5 review row
 *
 * Desktop/Tauri-only metadata ledger for delete proposals that are ready for
 * F5 reviewed-delete handling.
 *
 * Safety invariants:
 *   - Review metadata only. No tombstone minting, folder delete, apply,
 *     applyEvent, bookkeeping, publication, outbox enqueue, WebDAV, timers,
 *     polling, or mobile write-back.
 *   - The only write is an append-only local metadata row under a dedicated
 *     ledger key after previewDeleteF5Handoff() returns handoffReady.
 *   - Rows are redacted hashes and evidence digests only.
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
  if (H2O.Desktop.Sync.__deleteF5ReviewRowInstalled) return;

  var LEDGER_KEY = 'h2o:sync:delete-f5-review-rows:v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.delete-f5-review-row-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.delete-f5-review-row.v1';
  var CREATE_SCHEMA = 'h2o.desktop.sync.delete-f5-review-row-create.v1';
  var LIST_SCHEMA = 'h2o.desktop.sync.delete-f5-review-row-list.v1';
  var VERSION = '0.1.0-f12.0.4b';
  var APPROVAL_TOKEN = 'I_APPROVE_DELETE_F5_REVIEW_ROW';
  var REVIEW_STATUS = 'pending-review';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'parentId', 'targetParentId',
    'sourceParentId', 'path', 'url', 'password', 'apiKey',
    'proposedName', 'targetName', 'previousName', 'rawName'
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

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
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
      reviewId: cleanString(r.reviewId),
      candidateId: cleanString(r.candidateId),
      proposalEnvelopeId: cleanString(r.proposalEnvelopeId),
      subjectId: cleanString(r.subjectId),
      lineageId: cleanString(r.lineageId),
      predicateVersion: cleanString(r.predicateVersion),
      justifyingEvidenceDigests: asArray(r.justifyingEvidenceDigests).map(cleanString).filter(Boolean),
      reviewStatus: cleanString(r.reviewStatus),
      createdAtIso: cleanString(r.createdAtIso)
    };
  }

  function countsFor(rows) {
    var counts = { total: rows.length, pendingReview: 0 };
    rows.forEach(function (row) {
      if (cleanString(row.reviewStatus) === REVIEW_STATUS) counts.pendingReview += 1;
    });
    return counts;
  }

  function failure(blockers, warnings) {
    return {
      schema: CREATE_SCHEMA,
      ok: false,
      reviewRow: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  function validatePreview(preview, blockers, warnings) {
    if (!preview || preview.ok !== true || preview.handoffReady !== true) {
      addCode(blockers, 'delete-f5-handoff-not-ready');
    }
    codeList(preview && preview.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preview && preview.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!cleanString(preview && preview.candidateId)) addCode(blockers, 'candidateId-required');
    if (!cleanString(preview && preview.proposalEnvelopeId)) addCode(blockers, 'proposal-envelope-id-required');
    if (!isSha256Hex(preview && preview.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!cleanString(preview && preview.lineageId)) addCode(blockers, 'lineage-id-required');
    if (!cleanString(preview && preview.predicateVersion)) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    var digests = asArray(preview && preview.justifyingEvidenceDigests);
    if (!digests.length) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    digests.forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    });
    if (Number(preview && preview.membershipCount) !== 0 || Number(preview && preview.childFolderCount) !== 0) {
      addCode(blockers, 'folder-not-empty');
    }
  }

  function validateRow(row, blockers, warnings) {
    if (!cleanString(row.reviewId)) addCode(blockers, 'review-id-required');
    if (!cleanString(row.candidateId)) addCode(blockers, 'candidateId-required');
    if (!cleanString(row.proposalEnvelopeId)) addCode(blockers, 'proposal-envelope-id-required');
    if (!isSha256Hex(row.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (!cleanString(row.lineageId)) addCode(blockers, 'lineage-id-required');
    if (!cleanString(row.predicateVersion)) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    if (cleanString(row.reviewStatus) !== REVIEW_STATUS) addCode(blockers, 'review-status-invalid');
    if (!Number.isFinite(Date.parse(cleanString(row.createdAtIso)))) addCode(blockers, 'createdAtIso-invalid');
    var digests = asArray(row.justifyingEvidenceDigests);
    if (!digests.length) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    digests.forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    });
    var forbidden = foreverNoKey(row);
    if (forbidden) {
      addCode(blockers, 'delete-f5-review-row-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function detectDuplicate(rows, row, blockers) {
    rows.forEach(function (existingValue) {
      var existing = safeObject(existingValue);
      if (cleanString(existing.candidateId) === row.candidateId) addCode(blockers, 'delete-f5-review-row-duplicate');
      if (cleanString(existing.proposalEnvelopeId) === row.proposalEnvelopeId) {
        addCode(blockers, 'delete-f5-review-row-duplicate');
      }
    });
  }

  async function createDeleteF5ReviewRow(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var candidateId = cleanString(args.candidateId);
    if (!candidateId) addCode(blockers, 'candidateId-required');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }

    var sync = H2O.Desktop.Sync;
    var preview = null;
    if (!sync || typeof sync.previewDeleteF5Handoff !== 'function') {
      addCode(blockers, 'delete-f5-handoff-preview-unavailable');
    } else if (candidateId) {
      try {
        preview = safeObject(await sync.previewDeleteF5Handoff({ candidateId: candidateId }));
      } catch (_) {
        addCode(blockers, 'delete-f5-handoff-preview-failed');
      }
    }
    validatePreview(preview, blockers, warnings);

    var row = {
      schema: ROW_SCHEMA,
      reviewId: 'delete-f5-review:' + generateUuid(),
      candidateId: cleanString(preview && preview.candidateId) || candidateId,
      proposalEnvelopeId: cleanString(preview && preview.proposalEnvelopeId),
      subjectId: cleanString(preview && preview.subjectId).toLowerCase(),
      lineageId: cleanString(preview && preview.lineageId),
      predicateVersion: cleanString(preview && preview.predicateVersion),
      justifyingEvidenceDigests: asArray(preview && preview.justifyingEvidenceDigests)
        .map(cleanString)
        .map(function (value) { return value.toLowerCase(); })
        .filter(Boolean),
      reviewStatus: REVIEW_STATUS,
      createdAtIso: nowIsoSeconds()
    };
    validateRow(row, blockers, warnings);

    var ledger = null;
    if (!blockers.length) {
      try {
        ledger = normalizeLedger(await storageGet(LEDGER_KEY));
      } catch (_) {
        addCode(blockers, 'delete-f5-review-ledger-unavailable');
      }
      if (!ledger) addCode(blockers, 'delete-f5-review-ledger-malformed');
      else detectDuplicate(ledger.rows, row, blockers);
    }
    if (blockers.length) return failure(blockers, warnings);

    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: row.createdAtIso,
      rows: ledger.rows.concat([row])
    };
    try {
      await storageSet(LEDGER_KEY, next);
    } catch (_) {
      return failure(['delete-f5-review-ledger-write-failed'], warnings);
    }

    return {
      schema: CREATE_SCHEMA,
      ok: true,
      reviewRow: rowSummary(row),
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  async function listDeleteF5ReviewRows() {
    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return {
        schema: LIST_SCHEMA,
        ok: false,
        rows: [],
        counts: countsFor([]),
        blockers: ['delete-f5-review-ledger-unavailable'],
        warnings: []
      };
    }
    if (!ledger) {
      return {
        schema: LIST_SCHEMA,
        ok: false,
        rows: [],
        counts: countsFor([]),
        blockers: ['delete-f5-review-ledger-malformed'],
        warnings: []
      };
    }
    var rows = ledger.rows.map(rowSummary);
    var blockers = [];
    var warnings = [];
    var forbidden = foreverNoKey(rows);
    if (forbidden) {
      addCode(blockers, 'delete-f5-review-ledger-contains-forbidden-field');
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

  H2O.Desktop.Sync.createDeleteF5ReviewRow = createDeleteF5ReviewRow;
  H2O.Desktop.Sync.listDeleteF5ReviewRows = listDeleteF5ReviewRows;
  H2O.Desktop.Sync.__deleteF5ReviewRowInstalled = true;
  H2O.Desktop.Sync.__deleteF5ReviewRowVersion = VERSION;
  H2O.Desktop.Sync.__deleteF5ReviewRowApprovalToken = APPROVAL_TOKEN;
  H2O.Desktop.Sync.__deleteF5ReviewRowLedgerKey = LEDGER_KEY;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
