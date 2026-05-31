/* H2O Desktop Sync - F14.3.6a chat Native owner handoff preview
 *
 * Read-only handoff preview for generated chat metadata proposal candidates.
 * This module validates and shapes a Native owner handoff request only. It
 * never executes a handoff, calls Native, applies, publishes, enqueues relay
 * outbox rows, advances watermarks, or records consumed operations.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
      if (global.H2O && global.H2O.Studio && global.H2O.Studio.platform &&
          global.H2O.Studio.platform.env && global.H2O.Studio.platform.env.isTauri === true) return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__chatNativeHandoffPreviewInstalled) return;

  var VERSION = '0.1.0-f14.3.6a';
  var RESULT_SCHEMA = 'h2o.desktop.sync.chat-native-handoff-preview.v1';
  var HANDOFF_REQUEST_SCHEMA = 'h2o.desktop.sync.chat-native-owner-handoff-request.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var LEDGER_KEY = 'h2o:sync:convergence-proposal-candidates:v1';
  var SUBJECT_TYPE = 'chat.metadata';
  var KIND_PROPOSAL = 'proposal';
  var OP_ARCHIVE = 'chat-metadata-archive-proposed';
  var OP_RENAME = 'chat-metadata-rename-proposed';
  var OPERATION_INTENT = 'update';
  var STATUS_GENERATED = 'generated';
  var OWNER_KIND_NATIVE = 'native';
  var REQUIRED_CAPABILITY = 'ownerHandoff';
  var REQUIRED_AUTHORITY = 'audited-apply-authority';
  var HANDOFF_STATUS = 'requested';
  var PRIVACY_FORBIDDEN_FIELDS = [
    'content', 'body', 'text', 'messages', 'message_array', 'conversation',
    'attachments', 'files', 'file_ids', 'image_urls', 'audio_urls',
    'name', 'title', 'chatTitle', 'rawTitle', 'proposedTitle',
    'rawId', 'chatId', 'accountId', 'rawAccountId',
    'path', 'url', 'share_url', 'share_token', 'password', 'apiKey',
    'session_token', 'cookies', 'token'
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

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
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
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
  }

  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJson(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.canonicalJSON === 'function') {
      try { return kernel.canonicalJSON(value); } catch (_) { /* fall through */ }
    }
    return JSON.stringify(canonicalize(value));
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
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var fromKernel = await kernel.sha256Hex(value);
        if (isSha256Hex(fromKernel)) return cleanLower(fromKernel);
      } catch (_) { /* fall through */ }
    }
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJson(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function generateUuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
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

  function normalizeLedger(raw) {
    if (!raw) return { schema: LEDGER_SCHEMA, rows: [] };
    if (!isObject(raw) || raw.schema !== LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return {
      schema: LEDGER_SCHEMA,
      createdAtIso: cleanString(raw.createdAtIso),
      updatedAtIso: cleanString(raw.updatedAtIso),
      rows: raw.rows.slice()
    };
  }

  function parseJsonObject(text) {
    if (isObject(text)) return text;
    if (typeof text !== 'string' || !text.trim()) return null;
    try {
      var parsed = JSON.parse(text);
      return isObject(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function findLedgerRow(ledger, candidateId) {
    var id = cleanString(candidateId);
    var rows = asArray(ledger && ledger.rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (cleanString(row.rowId) === id ||
          cleanString(row.candidateId) === id ||
          cleanString(row.envelopeId) === id) {
        return row;
      }
    }
    return null;
  }

  function directCandidateParts(candidate) {
    var source = safeObject(candidate);
    var row = null;
    var envelope = null;

    if (isObject(source.proposalCandidate)) {
      envelope = source.proposalCandidate;
      row = isObject(source.candidateRow) ? source.candidateRow : null;
    } else if (isObject(source.envelope)) {
      envelope = source.envelope;
      row = isObject(source.candidateRow) ? source.candidateRow : null;
    } else if (isObject(source.candidate)) {
      return directCandidateParts(source.candidate);
    } else if (source.schema === ROW_SCHEMA || cleanString(source.serializedEnvelope)) {
      row = source;
      envelope = parseJsonObject(source.serializedEnvelope);
    } else {
      envelope = source;
      row = isObject(source.candidateRow) ? source.candidateRow : null;
    }

    if (!envelope && row) envelope = parseJsonObject(row.serializedEnvelope);
    return { envelope: envelope, row: row };
  }

  async function resolveCandidate(args, blockers, warnings) {
    var candidateId = cleanString(args.candidateId);
    if (candidateId) {
      var ledger = null;
      try {
        ledger = normalizeLedger(await storageGet(LEDGER_KEY));
      } catch (_) {
        addCode(blockers, 'proposal-ledger-unavailable');
        return { envelope: null, row: null, candidateId: candidateId };
      }
      if (!ledger) {
        addCode(blockers, 'proposal-ledger-malformed');
        return { envelope: null, row: null, candidateId: candidateId };
      }
      var row = findLedgerRow(ledger, candidateId);
      if (!row) {
        addCode(blockers, 'candidate-not-found');
        return { envelope: null, row: null, candidateId: candidateId };
      }
      var envelope = parseJsonObject(row.serializedEnvelope);
      if (!envelope && isObject(args.candidate)) {
        envelope = directCandidateParts(args.candidate).envelope;
      }
      if (!envelope) addCode(blockers, 'candidate-envelope-unavailable');
      return { envelope: envelope, row: row, candidateId: cleanString(row.rowId) || candidateId };
    }

    if (!isObject(args.candidate)) {
      addCode(blockers, 'candidate-missing');
      return { envelope: null, row: null, candidateId: '' };
    }
    var parts = directCandidateParts(args.candidate);
    if (!parts.envelope) addCode(blockers, 'candidate-envelope-unavailable');
    return {
      envelope: parts.envelope,
      row: parts.row,
      candidateId: cleanString(safeObject(parts.row).rowId) ||
        cleanString(args.candidateId) ||
        cleanString(safeObject(args.candidate).candidateId)
    };
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
      if (PRIVACY_FORBIDDEN_FIELDS.indexOf(key) !== -1) return key;
      if (/token$/i.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }

  function scanPrivacy(value, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var domainScanned = false;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var domainScan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, value);
        domainScanned = true;
        codeList(domainScan && domainScan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(domainScan && domainScan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'domain-forbidden-field-scan-threw');
      }
    }
    if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        var scan = kernel.scanPrivacy(value, {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted'],
          forbiddenList: PRIVACY_FORBIDDEN_FIELDS,
          foreverNoFields: PRIVACY_FORBIDDEN_FIELDS
        });
        codeList(scan && scan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(scan && scan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'privacy-scan-threw');
      }
    }
    if (!domainScanned && typeof H2O.Desktop.Sync.runChatForbiddenFieldScan === 'function') {
      try {
        var chatScan = H2O.Desktop.Sync.runChatForbiddenFieldScan(value);
        codeList(chatScan && chatScan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(chatScan && chatScan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'chat-forbidden-field-scan-threw');
      }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function validatePeer(peer) {
    return isSha256Hex(peer && peer.physicalDeviceIdHash) &&
      isSha256Hex(peer && peer.installIdHash) &&
      isSha256Hex(peer && peer.syncPeerIdHash);
  }

  function envelopeForEventDigest(envelope) {
    var clone = JSON.parse(JSON.stringify(envelope));
    delete clone.eventDigest;
    delete clone.warnings;
    delete clone.blockers;
    return clone;
  }

  async function validateDigest(envelope, row, blockers, warnings) {
    if (!webCryptoAvailable()) {
      addCode(blockers, 'web-crypto-unavailable');
      return;
    }
    if (!isSha256Hex(envelope.eventDigest)) {
      addCode(blockers, 'candidate-eventDigest-invalid');
      return;
    }
    var recomputed = await sha256Hex(envelopeForEventDigest(envelope));
    if (!isSha256Hex(recomputed)) {
      addCode(blockers, 'candidate-eventDigest-recompute-failed');
    } else if (recomputed !== cleanLower(envelope.eventDigest)) {
      addCode(blockers, 'candidate-eventDigest-mismatch');
    }
    if (row && cleanString(row.eventDigest) && cleanLower(row.eventDigest) !== cleanLower(envelope.eventDigest)) {
      addCode(blockers, 'candidate-row-eventDigest-mismatch');
    }
    if (row && cleanString(row.dedupeKey) && cleanLower(row.dedupeKey) !== cleanLower(envelope.dedupeKey)) {
      addCode(blockers, 'candidate-row-dedupeKey-mismatch');
    }
    codeList(warnings).forEach(function () { /* keeps linter-free use */ });
  }

  function operationDomain(operation) {
    if (operation === OP_ARCHIVE) return 'archive';
    if (operation === OP_RENAME) return 'rename';
    return '';
  }

  function candidateStatus(args, row, envelope) {
    var direct = safeObject(args.candidate);
    return cleanString(row && row.status) ||
      cleanString(direct.status) ||
      cleanString(envelope && envelope.status);
  }

  function validateCandidate(args, resolved, blockers, warnings) {
    var envelope = safeObject(resolved.envelope);
    var row = resolved.row ? safeObject(resolved.row) : null;
    var payload = safeObject(envelope.payload);
    var op = safeObject(payload.proposedOperation);
    var expected = safeObject(payload.expectedPostState);
    var status = candidateStatus(args, row, envelope);

    if (!isObject(resolved.envelope)) {
      addCode(blockers, 'candidate-envelope-unavailable');
      return null;
    }
    if (status !== STATUS_GENERATED) addCode(blockers, 'candidate-status-not-generated');
    if (envelope.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'candidate-envelope-schema-invalid');
    if (envelope.kind !== KIND_PROPOSAL) addCode(blockers, 'candidate-kind-not-proposal');
    if (envelope.subjectType !== SUBJECT_TYPE) addCode(blockers, 'candidate-subjectType-invalid');
    if (envelope.operationIntent !== OPERATION_INTENT) addCode(blockers, 'candidate-operationIntent-invalid');
    if (operationDomain(envelope.operation) === '') addCode(blockers, 'candidate-operation-not-supported');
    if (!isSha256Hex(envelope.subjectId)) addCode(blockers, 'candidate-subjectId-invalid');
    if (!isSha256Hex(envelope.lineageId)) addCode(blockers, 'candidate-lineageId-invalid');
    if (!isSha256Hex(envelope.dedupeKey)) addCode(blockers, 'candidate-dedupeKey-invalid');
    if (!isSha256Hex(envelope.payloadHash)) addCode(blockers, 'candidate-payloadHash-invalid');
    if (!isObject(envelope.sourcePlatform)) addCode(blockers, 'candidate-sourcePlatform-missing');
    if (!validatePeer(safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope))) {
      addCode(blockers, 'candidate-sourcePeer-invalid');
    }
    if (envelope.redactionClass !== 'redacted') addCode(blockers, 'candidate-redactionClass-invalid');
    if (!isIso(envelope.createdAt)) addCode(blockers, 'candidate-createdAt-invalid');
    if (!isIso(envelope.expiresAt)) {
      addCode(blockers, 'candidate-expiresAt-invalid');
    } else if (Date.parse(envelope.expiresAt) <= Date.now()) {
      addCode(blockers, 'candidate-expired');
    }
    if (!isObject(payload)) addCode(blockers, 'candidate-payload-missing');
    if (!Array.isArray(payload.justifyingEvidenceDigests) || payload.justifyingEvidenceDigests.length === 0) {
      addCode(blockers, 'candidate-justifyingEvidenceDigests-missing');
    }
    asArray(payload.justifyingEvidenceDigests).forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'candidate-justifyingEvidenceDigest-invalid');
    });
    if (!isObject(payload.proposedOperation)) addCode(blockers, 'candidate-proposedOperation-missing');
    if (!isObject(payload.expectedPostState)) addCode(blockers, 'candidate-expectedPostState-missing');
    if (!cleanString(payload.predicateVersion)) addCode(blockers, 'candidate-predicateVersion-missing');
    if (op.operation !== envelope.operation) addCode(blockers, 'candidate-proposedOperation-mismatch');
    if (op.operationIntent !== OPERATION_INTENT) addCode(blockers, 'candidate-proposedOperation-intent-invalid');
    if (op.subjectType !== SUBJECT_TYPE) addCode(blockers, 'candidate-proposedOperation-subjectType-invalid');
    if (op.subjectId !== envelope.subjectId) addCode(blockers, 'candidate-proposedOperation-subjectId-mismatch');
    if (expected.subjectType !== SUBJECT_TYPE) addCode(blockers, 'candidate-expectedPostState-subjectType-invalid');
    if (expected.subjectId !== envelope.subjectId) addCode(blockers, 'candidate-expectedPostState-subjectId-mismatch');
    if (!isSha256Hex(op.baseHash) || !isSha256Hex(op.targetHash)) addCode(blockers, 'candidate-operation-hash-invalid');
    if (!isSha256Hex(expected.expectedPostStateHash)) addCode(blockers, 'candidate-expectedPostStateHash-invalid');
    if (operationDomain(envelope.operation) === 'archive' && typeof op.archived !== 'boolean') {
      addCode(blockers, 'candidate-archive-target-invalid');
    }
    if (operationDomain(envelope.operation) === 'rename' && !isSha256Hex(op.titleHash)) {
      addCode(blockers, 'candidate-titleHash-invalid');
    }
    if (row) {
      if (cleanString(row.operation) && cleanString(row.operation) !== envelope.operation) {
        addCode(blockers, 'candidate-row-operation-mismatch');
      }
      if (cleanString(row.operationIntent) && cleanString(row.operationIntent) !== OPERATION_INTENT) {
        addCode(blockers, 'candidate-row-operationIntent-mismatch');
      }
      if (cleanString(row.subjectId) && cleanLower(row.subjectId) !== cleanLower(envelope.subjectId)) {
        addCode(blockers, 'candidate-row-subjectId-mismatch');
      }
      if (cleanString(row.lineageId) && cleanLower(row.lineageId) !== cleanLower(envelope.lineageId)) {
        addCode(blockers, 'candidate-row-lineageId-mismatch');
      }
    }

    scanPrivacy(envelope, blockers, warnings);
    if (row) scanPrivacy(row, blockers, warnings);
    return {
      status: status,
      operation: envelope.operation,
      operationDomain: operationDomain(envelope.operation),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanLower(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      baseHash: cleanLower(op.baseHash),
      targetHash: cleanLower(op.targetHash),
      predicateVersion: cleanString(payload.predicateVersion),
      expectedTarget: operationDomain(envelope.operation) === 'archive'
        ? { archived: op.archived === true }
        : { titleHash: cleanLower(op.titleHash) },
      sourcePeerEnvelope: safeObject(safeObject(envelope.sourcePlatform).sourcePeerEnvelope),
      candidateRowId: cleanString(resolved.candidateId) || cleanString(row && row.rowId),
      envelopeId: cleanString(envelope.id)
    };
  }

  function ownerStatusValue(value) {
    if (typeof value === 'string') return cleanString(value);
    if (isObject(value)) return cleanString(value.status || value.reachability || value.state);
    return '';
  }

  function ownerSubjectAuthorized(owner) {
    var subjectTypes = asArray(owner && owner.subjectTypes).map(cleanString).filter(Boolean);
    if (!subjectTypes.length) return false;
    return subjectTypes.indexOf(SUBJECT_TYPE) !== -1 ||
      subjectTypes.indexOf('chat') !== -1 ||
      subjectTypes.indexOf('*') !== -1;
  }

  function ownerDomainAuthorized(owner) {
    var domains = asArray(owner && owner.domains).map(cleanString).filter(Boolean);
    if (!domains.length) return true;
    return domains.indexOf(SUBJECT_TYPE) !== -1 ||
      domains.indexOf('chat') !== -1 ||
      domains.indexOf('*') !== -1;
  }

  function validateOwnerBoundary(args, summary, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var declaration = safeObject(args.ownerDeclaration);
    var status = ownerStatusValue(args.ownerStatus);

    if (!isObject(args.ownerDeclaration)) addCode(blockers, 'owner-declaration-missing');
    if (status !== 'reachable') addCode(blockers, 'native-owner-unreachable');

    if (typeof H2O.Desktop.Sync.runNativeOwnerReachabilityProbe === 'function') {
      try {
        var reachability = H2O.Desktop.Sync.runNativeOwnerReachabilityProbe({
          ownerDeclaration: declaration,
          status: status
        });
        if (reachability && reachability.ok === false) {
          codeList(reachability.blockers).forEach(function (code) { addCode(blockers, code); });
        }
        codeList(reachability && reachability.warnings).forEach(function (code) { addCode(warnings, code); });
        if (reachability && reachability.reachable === true) summary.ownerReachable = true;
      } catch (_) {
        addCode(warnings, 'native-owner-reachability-probe-threw');
      }
    } else if (status === 'reachable') {
      summary.ownerReachable = true;
    }

    if (!kernel || typeof kernel.validateOwnerDeclaration !== 'function') {
      addCode(blockers, 'kernel-owner-handoff-unavailable');
      return null;
    }

    var ownerValidation = null;
    try {
      ownerValidation = kernel.validateOwnerDeclaration(declaration, {
        allowedOwnerKinds: [OWNER_KIND_NATIVE],
        allowedAuthorityLevels: [REQUIRED_AUTHORITY],
        requireActorPeer: false,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          forbiddenList: PRIVACY_FORBIDDEN_FIELDS,
          foreverNoFields: PRIVACY_FORBIDDEN_FIELDS
        }
      });
    } catch (_) {
      addCode(blockers, 'owner-declaration-validation-threw');
    }
    codeList(ownerValidation && ownerValidation.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ownerValidation && ownerValidation.warnings).forEach(function (code) { addCode(warnings, code); });

    var owner = safeObject(ownerValidation && ownerValidation.owner);
    if (owner.ownerKind !== OWNER_KIND_NATIVE) addCode(blockers, 'native-owner-kind-not-native');
    if (owner.authorityLevel !== REQUIRED_AUTHORITY) addCode(blockers, 'native-owner-authority-insufficient');
    if (!ownerSubjectAuthorized(owner)) addCode(blockers, 'native-owner-subjectType-not-authorized');
    if (!ownerDomainAuthorized(owner)) addCode(blockers, 'native-owner-domain-not-authorized');
    scanPrivacy(owner, blockers, warnings);
    summary.ownerNative = owner.ownerKind === OWNER_KIND_NATIVE;
    summary.ownerAuthoritySafe = owner.authorityLevel === REQUIRED_AUTHORITY;
    return owner;
  }

  function expectedTargetForPreflight(args, summary) {
    if (summary.operationDomain === 'archive') return { archived: summary.expectedTarget.archived === true };
    if (summary.operationDomain !== 'rename') return null;
    var target = safeObject(args.expectedTarget);
    if (typeof target.title === 'string' && target.title.trim()) return { title: target.title };
    return null;
  }

  async function rerunPreflightIfPossible(args, candidateSummary, summary, blockers, warnings) {
    if (!isObject(args.chatRecord)) {
      addCode(warnings, 'chat-preflight-rerun-input-not-provided');
      return null;
    }
    if (typeof H2O.Desktop.Sync.runChatConvergencePreflight !== 'function') {
      addCode(warnings, 'chat-preflight-unavailable');
      return null;
    }
    var expectedTarget = expectedTargetForPreflight(args, candidateSummary);
    if (!expectedTarget) {
      addCode(warnings, 'chat-preflight-rerun-target-not-provided');
      return null;
    }
    var preflight = null;
    try {
      preflight = await H2O.Desktop.Sync.runChatConvergencePreflight(Object.assign({}, args, {
        operation: candidateSummary.operationDomain,
        expectedTarget: expectedTarget
      }));
    } catch (_) {
      addCode(blockers, 'chat-preflight-rerun-threw');
      return null;
    }
    summary.preflightRerun = true;
    codeList(preflight && preflight.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!preflight || preflight.ok !== true || preflight.actionable !== true) {
      codeList(preflight && preflight.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'chat-preflight-rerun-not-actionable');
      return preflight;
    }
    var snapshot = safeObject(preflight.canonicalSnapshot);
    if (isSha256Hex(snapshot.subjectId) && cleanLower(snapshot.subjectId) !== candidateSummary.subjectId) {
      addCode(blockers, 'chat-preflight-subjectId-mismatch');
    }
    if (isSha256Hex(snapshot.revisionHash) && cleanLower(snapshot.revisionHash) !== candidateSummary.baseHash) {
      addCode(blockers, 'chat-preflight-baseHash-mismatch');
    }
    summary.preflightSafe = blockers.indexOf('chat-preflight-rerun-not-actionable') === -1;
    return preflight;
  }

  function buildAuthorityMetadata(args, owner, candidateSummary, createdAtIso) {
    var explicit = safeObject(args.authorityMetadata);
    return {
      platformId: cleanString(explicit.platformId) || cleanString(owner.platformId) || 'native-owner',
      surfaceKind: cleanString(explicit.surfaceKind) || cleanString(owner.surfaceKind) || 'native',
      declaredAuthority: cleanString(explicit.declaredAuthority) || cleanString(owner.authorityLevel) || REQUIRED_AUTHORITY,
      effectiveAuthority: cleanString(explicit.effectiveAuthority) || cleanString(owner.authorityLevel) || REQUIRED_AUTHORITY,
      requiredAuthority: REQUIRED_AUTHORITY,
      capability: REQUIRED_CAPABILITY,
      actorPeer: candidateSummary.sourcePeerEnvelope,
      createdAtIso: createdAtIso,
      expiresAtIso: cleanString(args.expiresAtIso),
      metadata: {
        domain: SUBJECT_TYPE,
        operation: candidateSummary.operationDomain,
        previewOnly: true
      }
    };
  }

  function buildHandoffInput(args, owner, candidateSummary, createdAtIso) {
    return {
      handoffId: cleanString(args.handoffId) || generateUuid(),
      handoffStatus: HANDOFF_STATUS,
      owner: owner,
      ownerDeclaration: owner,
      authority: buildAuthorityMetadata(args, owner, candidateSummary, createdAtIso),
      subjectType: SUBJECT_TYPE,
      subjectId: candidateSummary.subjectId,
      operation: candidateSummary.operation,
      operationIntent: OPERATION_INTENT,
      requestedCapability: REQUIRED_CAPABILITY,
      lineageId: candidateSummary.lineageId,
      eventDigest: candidateSummary.eventDigest,
      dedupeKey: candidateSummary.dedupeKey,
      handoffReason: 'chat-metadata-native-owner-preview',
      createdAtIso: createdAtIso,
      expiresAtIso: cleanString(args.expiresAtIso),
      requestedByPeer: candidateSummary.sourcePeerEnvelope,
      metadata: {
        candidateId: candidateSummary.candidateRowId,
        envelopeId: candidateSummary.envelopeId,
        operationDomain: candidateSummary.operationDomain,
        previewOnly: true
      }
    };
  }

  function validateHandoff(handoffInput, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateOwnerHandoff !== 'function') {
      addCode(blockers, 'kernel-owner-handoff-unavailable');
      return null;
    }
    var result = null;
    try {
      result = kernel.validateOwnerHandoff(handoffInput, {
        allowedOwnerKinds: [OWNER_KIND_NATIVE],
        allowedAuthorityLevels: [REQUIRED_AUTHORITY],
        requiredAuthorityLevel: REQUIRED_AUTHORITY,
        requiredCapability: REQUIRED_CAPABILITY,
        requireActorPeer: false,
        requireSubject: true,
        requireLineage: true,
        requireAuthority: true,
        requireOwnerCapability: true,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          forbiddenList: PRIVACY_FORBIDDEN_FIELDS,
          foreverNoFields: PRIVACY_FORBIDDEN_FIELDS
        }
      });
    } catch (_) {
      addCode(blockers, 'owner-handoff-validation-threw');
      return null;
    }
    codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
    return result;
  }

  function outputResult(ok, handoffReady, candidateSummary, owner, handoffRequest, blockers, warnings, validationSummary) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      handoffReady: handoffReady,
      operation: cleanString(candidateSummary && candidateSummary.operation),
      subjectId: cleanString(candidateSummary && candidateSummary.subjectId),
      lineageId: cleanString(candidateSummary && candidateSummary.lineageId),
      dedupeKey: cleanString(candidateSummary && candidateSummary.dedupeKey),
      owner: owner || null,
      handoffRequest: handoffRequest || null,
      blockers: codeList(blockers),
      warnings: codeList(warnings),
      validationSummary: validationSummary || {}
    };
  }

  function blocked(blockers, warnings, validationSummary) {
    return outputResult(false, false, null, null, null, blockers, warnings, validationSummary);
  }

  function scanFinalOutput(result, warnings) {
    var blockers = [];
    scanPrivacy(result, blockers, warnings);
    if (!blockers.length) return result;
    return outputResult(false, false, null, null, null, blockers, warnings, Object.assign({}, safeObject(result.validationSummary), {
      outputPrivacySafe: false
    }));
  }

  async function previewChatNativeOwnerHandoff(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var summary = {
      candidateResolved: false,
      candidateValid: false,
      candidatePrivacySafe: false,
      ownerNative: false,
      ownerReachable: false,
      ownerAuthoritySafe: false,
      preflightRerun: false,
      preflightSafe: false,
      handoffValidated: false,
      outputPrivacySafe: true,
      storageMutated: false,
      nativeCalled: false,
      publicationTouched: false
    };

    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return blocked(blockers, warnings, summary);
    }

    var resolved = await resolveCandidate(args, blockers, warnings);
    summary.candidateResolved = !!resolved.envelope;
    if (blockers.length) return blocked(blockers, warnings, summary);

    var candidateSummary = validateCandidate(args, resolved, blockers, warnings);
    if (candidateSummary) await validateDigest(resolved.envelope, resolved.row, blockers, warnings);
    summary.candidatePrivacySafe = blockers.indexOf('payload-contains-forever-no-field') === -1 &&
      blockers.indexOf('payload-contains-forbidden-field') === -1 &&
      blockers.indexOf('chat-preflight-output-contains-forbidden-field') === -1;
    summary.candidateValid = blockers.length === 0;
    if (blockers.length || !candidateSummary) return blocked(blockers, warnings, summary);

    var owner = validateOwnerBoundary(args, summary, blockers, warnings);
    if (blockers.length || !owner) return blocked(blockers, warnings, summary);

    await rerunPreflightIfPossible(args, candidateSummary, summary, blockers, warnings);
    if (blockers.length) return blocked(blockers, warnings, summary);
    if (!summary.preflightRerun) summary.preflightSafe = true;

    var createdAtIso = nowIsoSeconds();
    var handoffInput = buildHandoffInput(args, owner, candidateSummary, createdAtIso);
    scanPrivacy(handoffInput, blockers, warnings);
    if (blockers.length) return blocked(blockers, warnings, summary);

    var handoffValidation = validateHandoff(handoffInput, blockers, warnings);
    summary.handoffValidated = blockers.length === 0 && !!(handoffValidation && handoffValidation.handoffReady);
    if (blockers.length || !handoffValidation || handoffValidation.handoffReady !== true) {
      return blocked(blockers, warnings, summary);
    }

    var handoffRequest = Object.assign({
      previewSchema: HANDOFF_REQUEST_SCHEMA,
      previewOnly: true
    }, safeObject(handoffValidation.handoff));
    var result = outputResult(true, true, candidateSummary, safeObject(handoffValidation.owner), handoffRequest, [], warnings, summary);
    return scanFinalOutput(result, warnings);
  }

  H2O.Desktop.Sync.previewChatNativeOwnerHandoff = previewChatNativeOwnerHandoff;
  H2O.Desktop.Sync.__chatNativeHandoffPreviewInstalled = true;
  H2O.Desktop.Sync.__chatNativeHandoffPreviewVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
