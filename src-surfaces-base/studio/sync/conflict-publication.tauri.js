/* H2O Desktop Sync - F10.8.6g3 conflictCandidate publication
 *
 * Desktop/Tauri-only manual publisher for generated conflictCandidate
 * artifacts.
 *
 * Publication means:
 *   generated conflictCandidate -> relay outbox row
 *
 * Safety invariants:
 *   - conflictCandidate only. No proposal publication changes, upload,
 *     WebDAV, apply, applyEvent, convergence, remote mutation, automatic
 *     merge, timers, polling, or mobile write-back.
 *   - Publishes only an existing generated conflictCandidate. It never creates
 *     a conflictCandidate and never mutates candidate rows.
 *   - Relay visibility is local outbox staging only; WebDAV upload remains a
 *     separate explicit operator action.
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
  if (H2O.Desktop.Sync.__conflictPublicationInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.conflict-publication.v1';
  var CONFLICT_LEDGER_KEY = 'h2o:sync:convergence-conflict-candidates:v1';
  var CONFLICT_LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-conflict-candidate-ledger.v1';
  var VERSION = '0.1.0-f10.8.6g3';
  var APPROVAL_TOKEN = 'I_APPROVE_CONFLICT_PUBLICATION';
  var PUBLICATION_STATUS_PUBLISHED = 'published';
  var RELAY_STATUS_PENDING = 'pending-upload';
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

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function storageRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function') return s;
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

  function failure(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      ok: false,
      published: false,
      relayStatus: null,
      outboxRow: null,
      publicationRow: null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  function parseEnvelope(row, blockers) {
    try {
      var parsed = JSON.parse(cleanString(row.serializedEnvelope));
      if (!isObject(parsed)) {
        addCode(blockers, 'conflict-envelope-malformed');
        return null;
      }
      return parsed;
    } catch (_) {
      addCode(blockers, 'conflict-envelope-malformed');
      return null;
    }
  }

  async function readConflictLedger(blockers) {
    var raw;
    try {
      raw = await storageGet(CONFLICT_LEDGER_KEY);
    } catch (_) {
      addCode(blockers, 'conflict-candidate-ledger-unavailable');
      return null;
    }
    if (!raw) {
      addCode(blockers, 'conflict-candidate-ledger-missing');
      return null;
    }
    if (!isObject(raw) || raw.schema !== CONFLICT_LEDGER_SCHEMA || !Array.isArray(raw.rows)) {
      addCode(blockers, 'conflict-candidate-ledger-malformed');
      return null;
    }
    return { schema: raw.schema, rows: raw.rows.slice() };
  }

  function findCandidate(rows, candidateId) {
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.rowId) === candidateId ||
          cleanString(row.envelopeId) === candidateId ||
          cleanString(row.eventDigest) === candidateId ||
          cleanString(row.dedupeKey) === candidateId) {
        return row;
      }
    }
    return null;
  }

  async function adjustedReadiness(blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.checkConvergenceReadiness !== 'function') {
      addCode(blockers, 'convergence-readiness-unavailable');
      return null;
    }
    var readiness;
    try {
      readiness = safeObject(await sync.checkConvergenceReadiness());
    } catch (_) {
      addCode(blockers, 'convergence-readiness-read-failed');
      return null;
    }
    var ready = safeObject(readiness.readiness);
    ready.conflictWorkflowAvailable = true;
    if (ready.relayOutboxReady === true && ready.relayIndexReady === true) {
      ready.lineageTrackingAvailable = true;
    }
    readiness.readiness = ready;
    readiness.blockers = codeList(readiness.blockers).filter(function (code) {
      return code !== 'conflict-workflow-unavailable' && code !== 'lineage-tracking-unavailable';
    });
    readiness.ok = readiness.blockers.length === 0;
    codeList(readiness.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(readiness.warnings).forEach(function (code) { addCode(warnings, code); });
    return readiness;
  }

  async function relayIndex(blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayIndex !== 'function') {
      addCode(blockers, 'relay-index-unavailable');
      return null;
    }
    try {
      var index = safeObject(await sync.listRelayIndex());
      codeList(index.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(index.warnings).forEach(function (code) { addCode(warnings, code); });
      return index;
    } catch (_) {
      addCode(blockers, 'relay-index-read-failed');
      return null;
    }
  }

  function relayEntries(index) {
    return asArray(safeObject(index).entries).map(safeObject);
  }

  function validateRelaySignals(index, eventDigest, dedupeKey, blockers) {
    var rows = relayEntries(index);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (cleanString(row.eventDigest) === eventDigest) addCode(blockers, 'duplicate-eventDigest');
      if (cleanString(row.dedupeKey) === dedupeKey) addCode(blockers, 'duplicate-dedupeKey');
      if ((cleanString(row.eventDigest) === eventDigest || cleanString(row.dedupeKey) === dedupeKey) &&
          (row.replayAttempt === true || row.stale === true || row.expired === true)) {
        addCode(blockers, 'stale-evidence-not-revalidated');
      }
    }
    asArray(safeObject(index).replays).forEach(function (replay) {
      if (cleanString(safeObject(replay).dedupeKey) === dedupeKey) addCode(blockers, 'replay-dedupe-key');
    });
  }

  async function publicationLedger(blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listPublicationLedger !== 'function') {
      addCode(blockers, 'publication-ledger-unavailable');
      return null;
    }
    try {
      var ledger = safeObject(await sync.listPublicationLedger());
      codeList(ledger.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(ledger.warnings).forEach(function (code) { addCode(warnings, code); });
      return ledger;
    } catch (_) {
      addCode(blockers, 'publication-ledger-read-failed');
      return null;
    }
  }

  function validatePublicationHistory(ledger, row, blockers) {
    var rows = asArray(safeObject(ledger).rows).map(safeObject);
    var candidateRowId = cleanString(row.rowId);
    var eventDigest = cleanString(row.eventDigest);
    var dedupeKey = cleanString(row.dedupeKey);
    for (var i = 0; i < rows.length; i += 1) {
      var item = rows[i];
      if (cleanString(item.candidateKind) !== 'conflictCandidate') continue;
      var status = cleanString(item.publicationStatus);
      var sameCandidate = cleanString(item.candidateRowId) === candidateRowId;
      var sameEvent = cleanString(item.eventDigest) === eventDigest;
      var sameDedupe = cleanString(item.dedupeKey) === dedupeKey;
      if (sameCandidate && status === 'published') addCode(blockers, 'conflict-candidate-already-published');
      if (sameCandidate && status === 'withdrawn') addCode(blockers, 'conflict-candidate-withdrawn');
      if (sameCandidate && status === 'superseded') addCode(blockers, 'conflict-candidate-superseded');
      if (sameCandidate && status === 'expired') addCode(blockers, 'conflict-candidate-expired');
      if ((sameEvent || sameDedupe) && status === 'published') addCode(blockers, 'duplicate-publication');
    }
  }

  function validateCandidate(row, envelope, blockers, warnings) {
    if (!row) {
      addCode(blockers, 'conflict-candidate-not-found');
      return;
    }
    if (cleanString(row.status) !== 'generated') addCode(blockers, 'conflict-candidate-not-generated');
    if (!cleanString(row.serializedEnvelope)) addCode(blockers, 'conflict-envelope-missing');
    if (cleanString(row.expiresAt)) {
      var expires = Date.parse(cleanString(row.expiresAt));
      if (!Number.isFinite(expires) || expires <= Date.now()) addCode(blockers, 'conflict-candidate-expired');
    }
    if (!isObject(envelope)) return;
    if (cleanString(envelope.kind) !== 'conflictCandidate') addCode(blockers, 'conflictCandidate-kind-required');
    if (cleanString(envelope.id) !== cleanString(row.envelopeId)) addCode(blockers, 'conflict-envelope-id-mismatch');
    if (cleanString(envelope.lineageId) !== cleanString(row.conflictLineageId)) addCode(blockers, 'conflict-lineage-mismatch');
    if (cleanString(envelope.subjectId) !== cleanString(row.subjectId)) addCode(blockers, 'conflict-subject-mismatch');
    if (cleanString(envelope.eventDigest) !== cleanString(row.eventDigest)) addCode(blockers, 'conflict-eventDigest-mismatch');
    if (cleanString(envelope.dedupeKey) !== cleanString(row.dedupeKey)) addCode(blockers, 'conflict-dedupeKey-mismatch');
    if (asArray(envelope.blockers).length) addCode(blockers, 'conflict-envelope-has-blockers');
    if (cleanString(envelope.expiresAt)) {
      var envelopeExpires = Date.parse(cleanString(envelope.expiresAt));
      if (!Number.isFinite(envelopeExpires) || envelopeExpires <= Date.now()) addCode(blockers, 'conflict-candidate-expired');
    }
    var payload = safeObject(envelope.payload);
    if (!isObject(payload.requesterState)) addCode(blockers, 'requesterState-missing');
    if (!isObject(payload.counterpartState)) addCode(blockers, 'counterpartState-missing');
    if (!Object.prototype.hasOwnProperty.call(payload, 'commonAncestorHash')) addCode(blockers, 'commonAncestorHash-missing');
    if (!cleanString(payload.divergenceReason)) addCode(blockers, 'divergenceReason-missing');
    var forbidden = foreverNoKey(envelope);
    if (forbidden) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function outboxRowId(enqueueResult) {
    return cleanString(safeObject(enqueueResult && enqueueResult.row).rowId);
  }

  async function appendPublishedLedgerRow(row, enqueueResult, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.appendPublicationLedgerEvent !== 'function') {
      addCode(blockers, 'publication-ledger-unavailable');
      return null;
    }
    try {
      var result = await sync.appendPublicationLedgerEvent({
        candidateKind: 'conflictCandidate',
        candidateRowId: cleanString(row.rowId),
        envelopeId: cleanString(row.envelopeId),
        lineageId: cleanString(row.conflictLineageId),
        subjectId: cleanString(row.subjectId),
        eventDigest: cleanString(row.eventDigest),
        dedupeKey: cleanString(row.dedupeKey),
        sourceLedgerKey: CONFLICT_LEDGER_KEY,
        publishedAtIso: nowIsoSeconds(),
        actorPeer: safeObject(row.actorPeer),
        publicationStatus: PUBLICATION_STATUS_PUBLISHED,
        outboxRowId: outboxRowId(enqueueResult),
        relayStatus: RELAY_STATUS_PENDING,
        validationSummary: {
          ok: true,
          blockers: [],
          warnings: warnings.slice()
        }
      });
      codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
      if (!result || result.ok !== true || result.appended !== true) {
        addCode(blockers, 'publication-ledger-append-failed');
        return null;
      }
      return safeObject(result.row);
    } catch (_) {
      addCode(blockers, 'publication-ledger-append-failed');
      return null;
    }
  }

  async function publishConflictCandidate(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var candidateId = cleanString(args.candidateId);
    if (!candidateId) addCode(blockers, 'candidateId-required');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }

    var ledger = await readConflictLedger(blockers);
    var candidateRow = ledger ? findCandidate(ledger.rows, candidateId) : null;
    var envelope = candidateRow ? parseEnvelope(candidateRow, blockers) : null;
    validateCandidate(candidateRow, envelope, blockers, warnings);

    await adjustedReadiness(blockers, warnings);
    var index = await relayIndex(blockers, warnings);
    if (candidateRow) validateRelaySignals(index, cleanString(candidateRow.eventDigest), cleanString(candidateRow.dedupeKey), blockers);
    var pubLedger = await publicationLedger(blockers, warnings);
    if (candidateRow) validatePublicationHistory(pubLedger, candidateRow, blockers);

    if (blockers.length) return failure(blockers, warnings);

    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.enqueueRelayEnvelope !== 'function') {
      return failure(['relay-outbox-unavailable'], warnings);
    }
    var enqueueResult;
    try {
      enqueueResult = await sync.enqueueRelayEnvelope({ envelope: envelope });
    } catch (_) {
      return failure(['relay-outbox-enqueue-failed'], warnings);
    }
    codeList(enqueueResult && enqueueResult.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(enqueueResult && enqueueResult.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!enqueueResult || enqueueResult.ok !== true || enqueueResult.enqueued !== true) {
      addCode(blockers, 'relay-outbox-enqueue-failed');
      return failure(blockers, warnings);
    }

    var publicationRow = await appendPublishedLedgerRow(candidateRow, enqueueResult, blockers, warnings);
    if (blockers.length) {
      return failure(blockers, warnings);
    }

    return {
      schema: RESULT_SCHEMA,
      ok: true,
      published: true,
      relayStatus: RELAY_STATUS_PENDING,
      outboxRow: safeObject(enqueueResult.row),
      publicationRow: publicationRow,
      blockers: [],
      warnings: codeList(warnings)
    };
  }

  H2O.Desktop.Sync.publishConflictCandidate = publishConflictCandidate;
  H2O.Desktop.Sync.__conflictPublicationInstalled = true;
  H2O.Desktop.Sync.__conflictPublicationVersion = VERSION;
  H2O.Desktop.Sync.__conflictPublicationApprovalToken = APPROVAL_TOKEN;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
