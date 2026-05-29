/* H2O Desktop Sync - F12.0.4a delete proposal to F5 handoff preview
 *
 * Desktop/Tauri-only read-only handoff preview from a generated delete
 * proposal candidate to an F5 reviewed-delete candidate.
 *
 * Safety invariants:
 *   - Diagnostic only. No F5 review row creation, tombstone minting, delete,
 *     applyEvent, publication, outbox enqueue, convergence action, WebDAV,
 *     timers, polling, or mobile write-back.
 *   - Reads the local proposal candidate ledger only, validates the redacted
 *     proposal envelope, then re-runs F12 delete materialization/preflight.
 *   - Output is redacted hashes/counts/codes only.
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
  if (H2O.Desktop.Sync.__deleteF5HandoffPreviewInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.delete-f5-handoff-preview.v1';
  var VERSION = '0.1.0-f12.0.4a';
  var PROPOSAL_LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var PROPOSAL_LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var SUBJECT_TYPE = 'folder.metadata';
  var OPERATION = 'folder-metadata-delete-proposed';
  var EXPECTED_F5_REVIEW_KIND = 'f5-reviewed-empty-folder-delete';
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

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      handoffReady: false,
      candidateId: null,
      proposalEnvelopeId: null,
      subjectId: null,
      lineageId: null,
      baseHash: null,
      predicateVersion: null,
      justifyingEvidenceDigests: [],
      expectedF5ReviewKind: EXPECTED_F5_REVIEW_KIND,
      membershipCount: null,
      childFolderCount: null,
      blockers: [],
      warnings: []
    };
  }

  function resultFrom(fields, blockers, warnings) {
    var out = baseResult();
    Object.keys(safeObject(fields)).forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = fields[key];
    });
    out.blockers = codeList(blockers);
    out.warnings = codeList(warnings);
    out.ok = out.blockers.length === 0;
    out.handoffReady = out.ok === true &&
      !!out.candidateId &&
      !!out.proposalEnvelopeId &&
      isSha256Hex(out.subjectId) &&
      !!out.lineageId &&
      !!out.baseHash &&
      !!out.predicateVersion &&
      asArray(out.justifyingEvidenceDigests).length > 0 &&
      out.membershipCount === 0 &&
      out.childFolderCount === 0;
    var forbidden = foreverNoKey(out);
    if (forbidden) {
      out.ok = false;
      out.handoffReady = false;
      addCode(out.blockers, 'delete-f5-handoff-preview-output-contains-forbidden-field');
      addCode(out.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return out;
  }

  async function readProposalLedger(blockers) {
    var raw;
    try {
      raw = await storageGet(PROPOSAL_LEDGER_KEY);
    } catch (_) {
      addCode(blockers, 'proposal-ledger-unavailable');
      return null;
    }
    if (!raw) {
      addCode(blockers, 'proposal-ledger-missing');
      return null;
    }
    if (!isObject(raw) || raw.schema !== PROPOSAL_LEDGER_SCHEMA || !Array.isArray(raw.rows)) {
      addCode(blockers, 'proposal-ledger-malformed');
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

  function parseEnvelope(row, blockers) {
    try {
      var parsed = JSON.parse(cleanString(row.serializedEnvelope));
      if (!isObject(parsed)) {
        addCode(blockers, 'proposal-envelope-malformed');
        return null;
      }
      return parsed;
    } catch (_) {
      addCode(blockers, 'proposal-envelope-malformed');
      return null;
    }
  }

  function validPeer(peer) {
    var p = safeObject(peer);
    return isSha256Hex(p.physicalDeviceIdHash) &&
      isSha256Hex(p.installIdHash) &&
      isSha256Hex(p.syncPeerIdHash) &&
      cleanString(p.surfaceKind) === 'desktop-tauri';
  }

  function justifyingEvidenceDigests(envelope, row) {
    var payload = safeObject(envelope.payload);
    var list = asArray(payload.justifyingEvidenceDigests)
      .map(cleanString)
      .map(function (value) { return value.toLowerCase(); })
      .filter(isSha256Hex);
    if (list.length) return list;
    return asArray(row.justifyingEvidenceDigests)
      .map(cleanString)
      .map(function (value) { return value.toLowerCase(); })
      .filter(isSha256Hex);
  }

  function proposalPayload(envelope) {
    return safeObject(envelope.payload);
  }

  function proposedOperation(envelope) {
    return safeObject(proposalPayload(envelope).proposedOperation);
  }

  function expectedPostState(envelope) {
    return safeObject(proposalPayload(envelope).expectedPostState);
  }

  function baseHashFor(row, envelope) {
    return cleanString(row.baseHash ||
      proposedOperation(envelope).baseHash ||
      expectedPostState(envelope).baseHash).toLowerCase();
  }

  function validateCandidate(row, envelope, blockers, warnings) {
    if (!row) {
      addCode(blockers, 'proposal-candidate-not-found');
      return;
    }
    if (cleanString(row.status) !== 'generated') addCode(blockers, 'proposal-candidate-not-generated');
    if (cleanString(row.operationIntent) !== 'delete') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(row.operation) !== OPERATION) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (!cleanString(row.serializedEnvelope)) addCode(blockers, 'proposal-envelope-missing');
    if (cleanString(row.expiresAt)) {
      var rowExpires = Date.parse(cleanString(row.expiresAt));
      if (!Number.isFinite(rowExpires) || rowExpires <= Date.now()) addCode(blockers, 'proposal-expired');
    }
    if (!isObject(envelope)) return;

    var payload = proposalPayload(envelope);
    var peer = safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope);
    if (cleanString(envelope.kind) !== 'proposal') addCode(blockers, 'proposal-kind-required');
    if (cleanString(envelope.operationIntent) !== 'delete') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(envelope.operation) !== OPERATION) addCode(blockers, 'operation-intent-wrong-for-kind');
    if (cleanString(envelope.subjectType) !== SUBJECT_TYPE) addCode(blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(envelope.subjectId)) addCode(blockers, 'subject-id-invalid');
    if (cleanString(envelope.id) !== cleanString(row.envelopeId)) addCode(blockers, 'proposal-envelope-id-mismatch');
    if (cleanString(envelope.lineageId) !== cleanString(row.lineageId)) addCode(blockers, 'proposal-lineage-mismatch');
    if (cleanString(envelope.subjectId) !== cleanString(row.subjectId)) addCode(blockers, 'proposal-subject-mismatch');
    if (cleanString(envelope.eventDigest) !== cleanString(row.eventDigest)) addCode(blockers, 'proposal-eventDigest-mismatch');
    if (cleanString(envelope.dedupeKey) !== cleanString(row.dedupeKey)) addCode(blockers, 'proposal-dedupeKey-mismatch');
    if (asArray(envelope.blockers).length) addCode(blockers, 'proposal-envelope-has-blockers');
    if (cleanString(envelope.expiresAt)) {
      var envelopeExpires = Date.parse(cleanString(envelope.expiresAt));
      if (!Number.isFinite(envelopeExpires) || envelopeExpires <= Date.now()) addCode(blockers, 'proposal-expired');
    }
    if (!validPeer(peer)) addCode(blockers, 'invalid-peer-identity');
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    if (!justifyingEvidenceDigests(envelope, row).length) addCode(blockers, 'delete-proposal-missing-f5-predicate');
    if (!isObject(payload.proposedOperation)) addCode(blockers, 'proposal-operation-missing');
    if (!isObject(payload.expectedPostState)) addCode(blockers, 'proposal-expected-state-missing');
    if (proposedOperation(envelope).operationIntent !== 'delete') addCode(blockers, 'operation-intent-wrong-for-kind');
    if (expectedPostState(envelope).membershipCount !== 0 || expectedPostState(envelope).childFolderCount !== 0) {
      addCode(blockers, 'folder-not-empty');
    }
    var forbidden = foreverNoKey(envelope);
    if (forbidden) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  async function relayIndexSafe(row, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayIndex !== 'function') {
      addCode(blockers, 'relay-index-unavailable');
      return false;
    }
    var index;
    try {
      index = safeObject(await sync.listRelayIndex());
    } catch (_) {
      addCode(blockers, 'relay-index-read-failed');
      return false;
    }
    codeList(index.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(index.warnings).forEach(function (code) { addCode(warnings, code); });
    var eventDigest = cleanString(row.eventDigest);
    var dedupeKey = cleanString(row.dedupeKey);
    var safe = true;
    asArray(index.entries).forEach(function (item) {
      var entry = safeObject(item);
      var eventMatch = eventDigest && cleanString(entry.eventDigest) === eventDigest;
      var dedupeMatch = dedupeKey && cleanString(entry.dedupeKey) === dedupeKey;
      if (!eventMatch && !dedupeMatch) return;
      if (entry.replayAttempt === true) { safe = false; addCode(blockers, 'replay-detected'); }
      if (entry.stale === true) { safe = false; addCode(blockers, 'stale-evidence-not-revalidated'); }
      if (entry.expired === true) { safe = false; addCode(blockers, 'envelope-expired'); }
    });
    asArray(index.replays).forEach(function (replay) {
      if (dedupeKey && cleanString(safeObject(replay).dedupeKey) === dedupeKey) {
        safe = false;
        addCode(blockers, 'replay-dedupe-key');
      }
    });
    return safe && !codeList(index.blockers).length;
  }

  async function consumedSafe(row, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listConsumedOperations !== 'function') {
      addCode(blockers, 'consumed-operation-ledger-unavailable');
      return false;
    }
    var ledger;
    try {
      ledger = safeObject(await sync.listConsumedOperations());
    } catch (_) {
      addCode(blockers, 'consumed-operation-ledger-read-failed');
      return false;
    }
    codeList(ledger.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ledger.warnings).forEach(function (code) { addCode(warnings, code); });
    var eventDigest = cleanString(row.eventDigest);
    var dedupeKey = cleanString(row.dedupeKey);
    var safe = true;
    asArray(ledger.rows).forEach(function (value) {
      var entry = safeObject(value);
      var eventMatch = eventDigest && cleanString(entry.eventDigest) === eventDigest;
      var dedupeMatch = dedupeKey && cleanString(entry.dedupeKey) === dedupeKey;
      if (!eventMatch && !dedupeMatch) return;
      safe = false;
      addCode(blockers, 'consumed-operation-present');
      var status = cleanString(entry.consumedStatus);
      if (status) addCode(warnings, 'consumed-status-' + status);
    });
    return safe && !codeList(ledger.blockers).length;
  }

  async function watermarkSafe(row, envelope, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.getConvergenceWatermarks !== 'function') {
      addCode(blockers, 'convergence-watermark-ledger-unavailable');
      return false;
    }
    var watermarks;
    try {
      watermarks = safeObject(await sync.getConvergenceWatermarks());
    } catch (_) {
      addCode(blockers, 'convergence-watermark-ledger-read-failed');
      return false;
    }
    codeList(watermarks.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(watermarks.warnings).forEach(function (code) { addCode(warnings, code); });
    var peer = safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope);
    var key = cleanString(peer.syncPeerIdHash) + ':' + cleanString(row.subjectId);
    var latest = safeObject(safeObject(watermarks.latestByPeerSubject)[key]);
    var targetHash = cleanString(row.targetHash || expectedPostState(envelope).expectedPostStateHash);
    if (latest && targetHash && cleanString(latest.revisionHash) === targetHash) {
      addCode(blockers, 'target-already-watermarked');
      return false;
    }
    return !codeList(watermarks.blockers).length;
  }

  function plannerEntryFrom(row, envelope) {
    var payload = proposalPayload(envelope);
    return {
      bucket: 'delete',
      subjectId: cleanString(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      eventDigest: cleanString(envelope.eventDigest),
      dedupeKey: cleanString(envelope.dedupeKey),
      sourcePeerId: cleanString(safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope).syncPeerIdHash),
      sourcePlatform: safeObject(envelope.sourcePlatform),
      baseHash: baseHashFor(row, envelope),
      localRevisionHash: baseHashFor(row, envelope),
      targetHash: cleanString(row.targetHash || expectedPostState(envelope).expectedPostStateHash).toLowerCase(),
      operation: OPERATION,
      operationIntent: 'delete',
      justifyingEvidenceDigests: justifyingEvidenceDigests(envelope, row),
      payload: {
        proposedOperation: proposedOperation(envelope),
        expectedPostState: expectedPostState(envelope),
        predicateVersion: cleanString(payload.predicateVersion)
      }
    };
  }

  async function runDeleteDiagnostics(entry, blockers, warnings) {
    var sync = H2O.Desktop.Sync;
    var materialization = {};
    var preflight = {};
    if (!sync || typeof sync.checkDeleteMaterialization !== 'function') {
      addCode(blockers, 'delete-materialization-diagnostic-unavailable');
    } else {
      try {
        materialization = safeObject(await sync.checkDeleteMaterialization({ plannerEntry: entry }));
      } catch (_) {
        addCode(blockers, 'delete-materialization-diagnostic-failed');
      }
    }
    if (!sync || typeof sync.runDeleteConvergencePreflight !== 'function') {
      addCode(blockers, 'delete-convergence-preflight-unavailable');
    } else {
      try {
        preflight = safeObject(await sync.runDeleteConvergencePreflight({ plannerEntry: entry }));
      } catch (_) {
        addCode(blockers, 'delete-convergence-preflight-failed');
      }
    }
    codeList(materialization.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(materialization.warnings).forEach(function (code) { addCode(warnings, code); });
    codeList(preflight.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(preflight.warnings).forEach(function (code) { addCode(warnings, code); });
    if (preflight.actionable !== true) addCode(blockers, 'delete-preflight-not-actionable');
    if (preflight.emptyFolder !== true) addCode(blockers, 'folder-not-empty');
    if (preflight.baseFresh !== true) addCode(blockers, 'baseline-hash-not-verified');
    if (preflight.deleteVsEditConflict === true) addCode(blockers, 'delete-vs-edit-conflict');
    if (preflight.recoveryReady !== true) addCode(blockers, 'recovery-precondition-unmet');
    if (preflight.tombstoneCapable !== true) addCode(blockers, 'f5-tombstone-path-unavailable');
    return { materialization: materialization, preflight: preflight };
  }

  async function previewDeleteF5Handoff(input) {
    var args = safeObject(input);
    var candidateId = cleanString(args.candidateId);
    var blockers = [];
    var warnings = [];
    if (!candidateId) addCode(blockers, 'candidateId-required');

    var ledger = await readProposalLedger(blockers);
    var row = ledger ? findCandidate(ledger.rows, candidateId) : null;
    var envelope = row ? parseEnvelope(row, blockers) : null;
    validateCandidate(row, envelope, blockers, warnings);

    if (row && envelope) {
      await relayIndexSafe(row, blockers, warnings);
      await consumedSafe(row, blockers, warnings);
      await watermarkSafe(row, envelope, blockers, warnings);
      var entry = plannerEntryFrom(row, envelope);
      var diagnostics = await runDeleteDiagnostics(entry, blockers, warnings);
      var materialization = safeObject(diagnostics.materialization);
      var payload = proposalPayload(envelope);
      return resultFrom({
        candidateId: cleanString(row.rowId),
        proposalEnvelopeId: cleanString(envelope.id),
        subjectId: cleanString(envelope.subjectId),
        lineageId: cleanString(envelope.lineageId),
        baseHash: baseHashFor(row, envelope),
        predicateVersion: cleanString(payload.predicateVersion),
        justifyingEvidenceDigests: justifyingEvidenceDigests(envelope, row),
        expectedF5ReviewKind: EXPECTED_F5_REVIEW_KIND,
        membershipCount: Number(materialization.membershipCount),
        childFolderCount: Number(materialization.childFolderCount)
      }, blockers, warnings);
    }

    return resultFrom({ candidateId: candidateId }, blockers, warnings);
  }

  H2O.Desktop.Sync.previewDeleteF5Handoff = previewDeleteF5Handoff;
  H2O.Desktop.Sync.__deleteF5HandoffPreviewInstalled = true;
  H2O.Desktop.Sync.__deleteF5HandoffPreviewVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
