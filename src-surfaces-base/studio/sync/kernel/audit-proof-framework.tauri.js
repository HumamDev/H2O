/* H2O Desktop Sync Kernel - F14.2.12 audit / proof framework
 *
 * Desktop/Tauri L1 primitive only.
 *
 * Safety invariants:
 *   - Shapes and validates caller-supplied audit records, proof records,
 *     and metadata only.
 *   - No proof execution, audit execution, storage reads/writes, workflow
 *     execution, publication, relay, WebDAV, polling, timers, network, domain
 *     mutation, or mobile behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.12, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.shapeAuditRecord(input)
 *   H2O.Desktop.Sync.kernel.validateAuditRecord(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapeProofRecord(input)
 *   H2O.Desktop.Sync.kernel.validateProofRecord(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapeAuditMetadata(input)
 *   H2O.Desktop.Sync.kernel.validateAuditMetadata(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapeProofMetadata(input)
 *   H2O.Desktop.Sync.kernel.validateProofMetadata(input, policy?)
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
  H2O.Desktop.Sync.kernel = H2O.Desktop.Sync.kernel || {};

  var kernel = H2O.Desktop.Sync.kernel;
  if (kernel.__auditProofFrameworkInstalled) return;

  var VERSION = '0.1.0-f14.2.12';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.audit-proof-validation.v1';
  var AUDIT_SCHEMA = 'h2o.desktop.sync.kernel.audit-record.v1';
  var PROOF_SCHEMA = 'h2o.desktop.sync.kernel.proof-record.v1';
  var AUDIT_METADATA_SCHEMA = 'h2o.desktop.sync.kernel.audit-metadata.v1';
  var PROOF_METADATA_SCHEMA = 'h2o.desktop.sync.kernel.proof-metadata.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var STATE_HASH_RE = /^([0-9a-f]{8}|[0-9a-f]{64})$/;

  var SUPPORTED_DOMAINS = [
    'folder',
    'binding',
    'chat',
    'snapshot',
    'capture',
    'publication',
    'review'
  ];

  var AUDIT_RESULTS = [
    'success',
    'failed',
    'blocked',
    'rolled-back',
    'dry-run',
    'unknown'
  ];

  var PROOF_STATUSES = [
    'passed',
    'failed',
    'blocked',
    'skipped',
    'inconclusive',
    'unknown'
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

  function lowerHash(value) {
    return cleanString(value).toLowerCase();
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

  function normalizeStringList(value) {
    var out = [];
    asArray(value).forEach(function (item) {
      var normalized = cleanString(item);
      if (normalized && out.indexOf(normalized) === -1) out.push(normalized);
    });
    return out;
  }

  function normalizeMetadata(value) {
    if (!isObject(value)) return {};
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      var normalized = cleanString(key);
      if (!normalized) return;
      var item = value[key];
      if (item == null) return;
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        out[normalized] = item;
      }
    });
    return out;
  }

  function isSha256Hex(value) {
    return SHA256_RE.test(lowerHash(value));
  }

  function isStateHash(value) {
    var text = lowerHash(value);
    return !text || STATE_HASH_RE.test(text);
  }

  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }

  function isIsoOrEmpty(value) {
    var text = cleanString(value);
    return !text || Number.isFinite(Date.parse(text));
  }

  function nullableNumber(value) {
    if (value == null || value === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  function normalizeActorPeer(peer) {
    var source = safeObject(peer);
    return {
      physicalDeviceIdHash: lowerHash(source.physicalDeviceIdHash),
      installIdHash: lowerHash(source.installIdHash),
      syncPeerIdHash: lowerHash(source.syncPeerIdHash),
      surfaceKind: cleanString(source.surfaceKind)
    };
  }

  function validateActorPeer(peer, blockers, prefix, required) {
    var source = safeObject(peer);
    if (!isObject(peer)) {
      if (required) addCode(blockers, prefix + '-actorPeer-required');
      return;
    }
    if (!isSha256Hex(source.physicalDeviceIdHash)) addCode(blockers, prefix + '-actorPeer-physicalDeviceIdHash-invalid');
    if (!isSha256Hex(source.installIdHash)) addCode(blockers, prefix + '-actorPeer-installIdHash-invalid');
    if (!isSha256Hex(source.syncPeerIdHash)) addCode(blockers, prefix + '-actorPeer-syncPeerIdHash-invalid');
  }

  function normalizePolicy(policy) {
    var source = safeObject(policy);
    var domains = normalizeStringList(source.allowedDomains);
    var auditResults = normalizeStringList(source.allowedAuditResults);
    var proofStatuses = normalizeStringList(source.allowedProofStatuses);
    return {
      allowedDomains: domains.length ? domains : SUPPORTED_DOMAINS.slice(),
      allowedAuditResults: auditResults.length ? auditResults : AUDIT_RESULTS.slice(),
      allowedProofStatuses: proofStatuses.length ? proofStatuses : PROOF_STATUSES.slice(),
      requireAuditId: source.requireAuditId !== false,
      requireProofId: source.requireProofId !== false,
      requireSubject: source.requireSubject !== false,
      requireLineage: source.requireLineage === true,
      requireActorPeer: source.requireActorPeer === true,
      requireTimestamp: source.requireTimestamp === true,
      requireTransactionId: source.requireTransactionId === true,
      requireChecks: source.requireChecks === true,
      privacyPolicy: safeObject(source.privacyPolicy)
    };
  }

  function normalizeCheckResult(input) {
    var source = safeObject(input);
    var status = cleanString(source.status || source.proofStatus || (source.ok === true ? 'passed' : source.ok === false ? 'failed' : 'unknown'));
    if (PROOF_STATUSES.indexOf(status) === -1) status = 'unknown';
    return {
      checkId: cleanString(source.checkId || source.id),
      checkName: cleanString(source.checkName || source.name),
      status: status,
      ok: status === 'passed',
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings),
      metadata: normalizeMetadata(source.metadata)
    };
  }

  function shapeAuditMetadata(input) {
    var source = safeObject(input);
    return {
      schema: AUDIT_METADATA_SCHEMA,
      auditId: cleanString(source.auditId || source.auditMaintenanceId),
      domain: cleanString(source.domain),
      subjectType: cleanString(source.subjectType),
      subjectId: lowerHash(source.subjectId),
      operation: cleanString(source.operation),
      operationIntent: cleanString(source.operationIntent),
      lineageId: cleanString(source.lineageId),
      eventDigest: lowerHash(source.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey),
      transactionId: cleanString(source.transactionId),
      actorPeer: normalizeActorPeer(source.actorPeer),
      policyVersion: cleanString(source.policyVersion),
      predicateVersion: cleanString(source.predicateVersion),
      createdAtIso: cleanString(source.createdAtIso || source.auditAtIso),
      metadata: normalizeMetadata(source.metadata)
    };
  }

  function shapeProofMetadata(input) {
    var source = safeObject(input);
    return {
      schema: PROOF_METADATA_SCHEMA,
      proofId: cleanString(source.proofId),
      proofKind: cleanString(source.proofKind || source.kind),
      domain: cleanString(source.domain),
      subjectType: cleanString(source.subjectType),
      subjectId: lowerHash(source.subjectId),
      lineageId: cleanString(source.lineageId),
      eventDigest: lowerHash(source.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey),
      actorPeer: normalizeActorPeer(source.actorPeer),
      policyVersion: cleanString(source.policyVersion),
      predicateVersion: cleanString(source.predicateVersion),
      generatedAtIso: cleanString(source.generatedAtIso || source.createdAtIso),
      metadata: normalizeMetadata(source.metadata)
    };
  }

  function shapeAuditRecord(input) {
    var source = safeObject(input);
    var metadata = shapeAuditMetadata(source.metadata || source);
    return {
      schema: AUDIT_SCHEMA,
      auditId: cleanString(source.auditId || source.auditMaintenanceId || metadata.auditId),
      auditMaintenanceId: cleanString(source.auditMaintenanceId || source.auditId || metadata.auditId),
      domain: cleanString(source.domain || metadata.domain),
      subjectType: cleanString(source.subjectType || metadata.subjectType),
      subjectId: lowerHash(source.subjectId || metadata.subjectId),
      operation: cleanString(source.operation || metadata.operation),
      operationIntent: cleanString(source.operationIntent || metadata.operationIntent),
      lineageId: cleanString(source.lineageId || metadata.lineageId),
      eventDigest: lowerHash(source.eventDigest || metadata.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey || metadata.dedupeKey),
      transactionId: cleanString(source.transactionId || metadata.transactionId),
      actorPeer: normalizeActorPeer(source.actorPeer || metadata.actorPeer),
      preStateHash: lowerHash(source.preStateHash),
      postStateHash: lowerHash(source.postStateHash),
      auditResult: cleanString(source.auditResult || source.result || 'unknown'),
      auditAtIso: cleanString(source.auditAtIso || source.createdAtIso || metadata.createdAtIso),
      sequence: nullableNumber(source.sequence),
      validationSummary: {
        ok: source.validationSummary && source.validationSummary.ok === true,
        blockers: codeList(source.validationSummary && source.validationSummary.blockers),
        warnings: codeList(source.validationSummary && source.validationSummary.warnings)
      },
      metadata: metadata
    };
  }

  function shapeProofRecord(input) {
    var source = safeObject(input);
    var metadata = shapeProofMetadata(source.metadata || source);
    var proofStatus = cleanString(source.proofStatus || source.status || (source.ok === true ? 'passed' : source.ok === false ? 'failed' : 'unknown'));
    if (PROOF_STATUSES.indexOf(proofStatus) === -1) proofStatus = 'unknown';
    return {
      schema: PROOF_SCHEMA,
      proofId: cleanString(source.proofId || metadata.proofId),
      proofKind: cleanString(source.proofKind || source.kind || metadata.proofKind),
      domain: cleanString(source.domain || metadata.domain),
      subjectType: cleanString(source.subjectType || metadata.subjectType),
      subjectId: lowerHash(source.subjectId || metadata.subjectId),
      lineageId: cleanString(source.lineageId || metadata.lineageId),
      eventDigest: lowerHash(source.eventDigest || metadata.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey || metadata.dedupeKey),
      actorPeer: normalizeActorPeer(source.actorPeer || metadata.actorPeer),
      proofStatus: proofStatus,
      ok: proofStatus === 'passed',
      generatedAtIso: cleanString(source.generatedAtIso || source.createdAtIso || metadata.generatedAtIso),
      checks: asArray(source.checks || source.checkResults).map(normalizeCheckResult),
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings),
      metadata: metadata
    };
  }

  function result(blockers, warnings, audit, proof, extra) {
    var out = {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      valid: blockers.length === 0,
      audit: audit || null,
      proof: proof || null,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
    if (isObject(extra)) {
      Object.keys(extra).forEach(function (key) {
        out[key] = extra[key];
      });
    }
    return out;
  }

  function scanPrivacy(value, options, blockers, warnings) {
    if (typeof kernel.scanPrivacy !== 'function') return;
    var scanPolicy = Object.assign({
      subjectType: 'audit-proof',
      redactionClass: 'redacted',
      allowedRedactionClasses: ['redacted']
    }, safeObject(options.privacyPolicy));
    var scan = kernel.scanPrivacy(value, scanPolicy);
    codeList(scan.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(scan.warnings).forEach(function (code) { addCode(warnings, code); });
  }

  function validateCommonMetadata(value, options, blockers, warnings, prefix) {
    if (value.domain && options.allowedDomains.indexOf(value.domain) === -1) addCode(blockers, prefix + '-domain-not-allowed');
    if (options.requireSubject) {
      if (!value.subjectType) addCode(blockers, prefix + '-subjectType-required');
      if (!isSha256Hex(value.subjectId)) addCode(blockers, prefix + '-subjectId-invalid');
    } else if (value.subjectId && !isSha256Hex(value.subjectId)) {
      addCode(blockers, prefix + '-subjectId-invalid');
    }
    if (options.requireLineage && !value.lineageId) addCode(blockers, prefix + '-lineageId-required');
    if (value.eventDigest && !isSha256Hex(value.eventDigest)) addCode(blockers, prefix + '-eventDigest-invalid');
    if (value.dedupeKey && !isSha256Hex(value.dedupeKey)) addCode(blockers, prefix + '-dedupeKey-invalid');
    if (options.requireActorPeer) validateActorPeer(value.actorPeer, blockers, prefix, true);
    if (value.createdAtIso && !isIso(value.createdAtIso)) addCode(blockers, prefix + '-createdAtIso-invalid');
    if (value.generatedAtIso && !isIso(value.generatedAtIso)) addCode(blockers, prefix + '-generatedAtIso-invalid');
    if (value.policyVersion && value.policyVersion.length > 120) addCode(warnings, prefix + '-policyVersion-long');
    if (value.predicateVersion && value.predicateVersion.length > 120) addCode(warnings, prefix + '-predicateVersion-long');
  }

  function validateAuditMetadata(input, policy) {
    var options = normalizePolicy(policy);
    var metadata = shapeAuditMetadata(input);
    var blockers = [];
    var warnings = [];
    if (options.requireAuditId && !metadata.auditId) addCode(blockers, 'audit-id-required');
    if (options.requireTransactionId && !metadata.transactionId) addCode(blockers, 'audit-transactionId-required');
    validateCommonMetadata(metadata, options, blockers, warnings, 'audit-metadata');
    scanPrivacy(metadata, options, blockers, warnings);
    return result(blockers, warnings, null, null, {
      auditMetadata: metadata
    });
  }

  function validateProofMetadata(input, policy) {
    var options = normalizePolicy(policy);
    var metadata = shapeProofMetadata(input);
    var blockers = [];
    var warnings = [];
    if (options.requireProofId && !metadata.proofId) addCode(blockers, 'proof-id-required');
    if (!metadata.proofKind) addCode(warnings, 'proof-kind-missing');
    validateCommonMetadata(metadata, options, blockers, warnings, 'proof-metadata');
    scanPrivacy(metadata, options, blockers, warnings);
    return result(blockers, warnings, null, null, {
      proofMetadata: metadata
    });
  }

  function validateAuditRecord(input, policy) {
    var options = normalizePolicy(policy);
    var audit = shapeAuditRecord(input);
    var blockers = [];
    var warnings = [];

    if (options.requireAuditId && !audit.auditId) addCode(blockers, 'audit-id-required');
    if (!audit.operation && !audit.operationIntent) addCode(blockers, 'audit-operation-required');
    if (AUDIT_RESULTS.indexOf(audit.auditResult) === -1) addCode(blockers, 'audit-result-invalid');
    if (options.allowedAuditResults.indexOf(audit.auditResult) === -1) addCode(blockers, 'audit-result-not-allowed');
    if (!isStateHash(audit.preStateHash)) addCode(blockers, 'audit-preStateHash-invalid');
    if (!isStateHash(audit.postStateHash)) addCode(blockers, 'audit-postStateHash-invalid');
    if (options.requireTimestamp && !isIso(audit.auditAtIso)) addCode(blockers, 'audit-auditAtIso-required');
    if (!isIsoOrEmpty(audit.auditAtIso)) addCode(blockers, 'audit-auditAtIso-invalid');
    if (Number.isNaN(audit.sequence)) addCode(blockers, 'audit-sequence-invalid');
    if (options.requireTransactionId && !audit.transactionId) addCode(blockers, 'audit-transactionId-required');
    validateCommonMetadata(audit, options, blockers, warnings, 'audit');
    scanPrivacy(audit, options, blockers, warnings);

    return result(blockers, warnings, audit, null);
  }

  function validateProofRecord(input, policy) {
    var options = normalizePolicy(policy);
    var proof = shapeProofRecord(input);
    var blockers = [];
    var warnings = [];

    if (options.requireProofId && !proof.proofId) addCode(blockers, 'proof-id-required');
    if (options.allowedProofStatuses.indexOf(proof.proofStatus) === -1) addCode(blockers, 'proof-status-not-allowed');
    if (options.requireTimestamp && !isIso(proof.generatedAtIso)) addCode(blockers, 'proof-generatedAtIso-required');
    if (!isIsoOrEmpty(proof.generatedAtIso)) addCode(blockers, 'proof-generatedAtIso-invalid');
    if (options.requireChecks && !proof.checks.length) addCode(blockers, 'proof-checks-required');
    proof.checks.forEach(function (check) {
      if (!check.checkId && !check.checkName) addCode(warnings, 'proof-check-identity-missing');
      if (options.allowedProofStatuses.indexOf(check.status) === -1) addCode(blockers, 'proof-check-status-not-allowed');
      codeList(check.blockers).forEach(function (code) {
        if (check.status === 'passed') addCode(warnings, 'proof-check-passed-with-blockers');
      });
    });
    validateCommonMetadata(proof, options, blockers, warnings, 'proof');
    scanPrivacy(proof, options, blockers, warnings);

    return result(blockers, warnings, null, proof);
  }

  kernel.AUDIT_PROOF_SUPPORTED_DOMAINS = SUPPORTED_DOMAINS.slice();
  kernel.shapeAuditRecord = shapeAuditRecord;
  kernel.validateAuditRecord = validateAuditRecord;
  kernel.shapeProofRecord = shapeProofRecord;
  kernel.validateProofRecord = validateProofRecord;
  kernel.shapeAuditMetadata = shapeAuditMetadata;
  kernel.validateAuditMetadata = validateAuditMetadata;
  kernel.shapeProofMetadata = shapeProofMetadata;
  kernel.validateProofMetadata = validateProofMetadata;
  kernel.__auditProofFrameworkInstalled = true;
  kernel.__auditProofFrameworkVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
