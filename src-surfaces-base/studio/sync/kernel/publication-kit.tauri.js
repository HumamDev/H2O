/* H2O Desktop Sync Kernel - F14.2.8 publication kit primitive
 *
 * Desktop/Tauri L1 primitive only.
 *
 * Safety invariants:
 *   - Shapes and validates caller-supplied publication records, metadata, and
 *     receipts only.
 *   - No relay enqueue, upload/download, publication action, storage
 *     reads/writes, transport ownership, apply, convergence, domain mutation,
 *     polling, timers, network, or mobile behavior.
 *   - Existing proposal/conflict publication lanes are not wired to this module
 *     in F14.2.8, so their output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.normalizePublicationStatus(status)
 *   H2O.Desktop.Sync.kernel.normalizeRelayStatus(status)
 *   H2O.Desktop.Sync.kernel.shapePublication(input)
 *   H2O.Desktop.Sync.kernel.validatePublication(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapePublicationMetadata(input)
 *   H2O.Desktop.Sync.kernel.validatePublicationMetadata(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapePublicationReceipt(input)
 *   H2O.Desktop.Sync.kernel.shapePublicationAuditMetadata(input)
 *   H2O.Desktop.Sync.kernel.createPublicationResult(input)
 *   H2O.Desktop.Sync.kernel.isTerminalPublicationStatus(status)
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
  if (kernel.__publicationKitInstalled) return;

  var VERSION = '0.1.0-f14.2.8';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.publication-validation.v1';
  var PUBLICATION_SCHEMA = 'h2o.desktop.sync.kernel.publication-state.v1';
  var METADATA_SCHEMA = 'h2o.desktop.sync.kernel.publication-metadata.v1';
  var RECEIPT_SCHEMA = 'h2o.desktop.sync.kernel.publication-receipt.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;

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

  var TERMINAL_PUBLICATION_STATUSES = [
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

  var DEFAULT_CANDIDATE_KINDS = [
    'proposal',
    'conflictCandidate'
  ];

  var DEFAULT_SOURCE_LEDGER_KEYS = {
    proposal: 'h2o:sync:convergence-proposal-candidates:v1',
    conflictCandidate: 'h2o:sync:convergence-conflict-candidates:v1'
  };

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
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }

  function isSha256Hex(value) {
    return SHA256_RE.test(cleanString(value).toLowerCase());
  }

  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }

  function isIsoOrEmpty(value) {
    var text = cleanString(value);
    return !text || Number.isFinite(Date.parse(text));
  }

  function normalizeStringList(value) {
    var out = [];
    asArray(value).forEach(function (item) {
      var normalized = cleanString(item);
      if (normalized && out.indexOf(normalized) === -1) out.push(normalized);
    });
    return out;
  }

  function normalizeMetadataObject(value) {
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

  function normalizePolicy(policy) {
    var source = safeObject(policy);
    var candidateKinds = normalizeStringList(source.allowedCandidateKinds);
    var publicationStatuses = normalizeStringList(source.allowedPublicationStatuses);
    var relayStatuses = normalizeStringList(source.allowedRelayStatuses);
    var sourceLedgerKeys = Object.assign({}, DEFAULT_SOURCE_LEDGER_KEYS, safeObject(source.sourceLedgerKeys));
    return {
      allowedCandidateKinds: candidateKinds.length ? candidateKinds : DEFAULT_CANDIDATE_KINDS.slice(),
      allowedPublicationStatuses: publicationStatuses.length ? publicationStatuses : PUBLICATION_STATUSES.slice(),
      allowedRelayStatuses: relayStatuses.length ? relayStatuses : RELAY_STATUSES.slice(),
      sourceLedgerKeys: sourceLedgerKeys,
      requireActorPeer: source.requireActorPeer !== false,
      requirePublishedOutboxRow: source.requirePublishedOutboxRow === true,
      requireKnownSourceLedgerKey: source.requireKnownSourceLedgerKey !== false,
      privacyPolicy: safeObject(source.privacyPolicy)
    };
  }

  function normalizePublicationStatus(status) {
    var value = cleanString(status);
    return PUBLICATION_STATUSES.indexOf(value) === -1 ? '' : value;
  }

  function normalizeRelayStatus(status) {
    var value = cleanString(status);
    return RELAY_STATUSES.indexOf(value) === -1 ? '' : value;
  }

  function isTerminalPublicationStatus(status) {
    return TERMINAL_PUBLICATION_STATUSES.indexOf(normalizePublicationStatus(status)) !== -1;
  }

  function validatePeerEnvelope(peer, blockers) {
    var source = safeObject(peer);
    if (!isObject(peer)) {
      addCode(blockers, 'publication-actorPeer-required');
      return;
    }
    if (!isSha256Hex(source.physicalDeviceIdHash)) {
      addCode(blockers, 'publication-actorPeer-physicalDeviceIdHash-invalid');
    }
    if (!isSha256Hex(source.installIdHash)) {
      addCode(blockers, 'publication-actorPeer-installIdHash-invalid');
    }
    if (!isSha256Hex(source.syncPeerIdHash)) {
      addCode(blockers, 'publication-actorPeer-syncPeerIdHash-invalid');
    }
  }

  function shapeActorPeer(peer) {
    var source = safeObject(peer);
    return {
      physicalDeviceIdHash: cleanString(source.physicalDeviceIdHash).toLowerCase(),
      installIdHash: cleanString(source.installIdHash).toLowerCase(),
      syncPeerIdHash: cleanString(source.syncPeerIdHash).toLowerCase()
    };
  }

  function shapeValidationSummary(value) {
    var source = safeObject(value);
    return {
      ok: source.ok !== false,
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings),
      metadata: normalizeMetadataObject(source.metadata)
    };
  }

  function shapePublication(input) {
    var source = safeObject(input);
    return {
      schema: PUBLICATION_SCHEMA,
      sourceSchema: cleanString(source.schema),
      publicationId: cleanString(source.publicationId),
      candidateKind: cleanString(source.candidateKind),
      candidateRowId: cleanString(source.candidateRowId),
      envelopeId: cleanString(source.envelopeId),
      lineageId: cleanString(source.lineageId),
      subjectId: cleanString(source.subjectId).toLowerCase(),
      eventDigest: cleanString(source.eventDigest).toLowerCase(),
      dedupeKey: cleanString(source.dedupeKey).toLowerCase(),
      sourceLedgerKey: cleanString(source.sourceLedgerKey),
      publishedAtIso: cleanString(source.publishedAtIso),
      actorPeer: shapeActorPeer(source.actorPeer),
      publicationStatus: normalizePublicationStatus(source.publicationStatus),
      rawPublicationStatus: cleanString(source.publicationStatus),
      outboxRowId: cleanString(source.outboxRowId),
      relayStatus: normalizeRelayStatus(source.relayStatus),
      rawRelayStatus: cleanString(source.relayStatus),
      validationSummary: shapeValidationSummary(source.validationSummary),
      metadata: normalizeMetadataObject(source.metadata)
    };
  }

  function shapePublicationMetadata(input) {
    var source = safeObject(input);
    return {
      schema: METADATA_SCHEMA,
      candidateKind: cleanString(source.candidateKind),
      candidateRowId: cleanString(source.candidateRowId),
      envelopeId: cleanString(source.envelopeId),
      lineageId: cleanString(source.lineageId),
      subjectId: cleanString(source.subjectId).toLowerCase(),
      eventDigest: cleanString(source.eventDigest).toLowerCase(),
      dedupeKey: cleanString(source.dedupeKey).toLowerCase(),
      sourceLedgerKey: cleanString(source.sourceLedgerKey),
      actorPeer: shapeActorPeer(source.actorPeer),
      publicationStatus: normalizePublicationStatus(source.publicationStatus),
      rawPublicationStatus: cleanString(source.publicationStatus),
      relayStatus: normalizeRelayStatus(source.relayStatus),
      rawRelayStatus: cleanString(source.relayStatus),
      createdAtIso: cleanString(source.createdAtIso || source.publishedAtIso),
      domain: cleanString(source.domain),
      metadata: normalizeMetadataObject(source.metadata)
    };
  }

  function shapePublicationReceipt(input) {
    var source = safeObject(input);
    var publication = shapePublication(source.publication || source);
    return {
      schema: RECEIPT_SCHEMA,
      ok: source.ok !== false,
      valid: source.valid !== false,
      publicationId: publication.publicationId,
      candidateKind: publication.candidateKind,
      candidateRowId: publication.candidateRowId,
      envelopeId: publication.envelopeId,
      lineageId: publication.lineageId,
      subjectId: publication.subjectId,
      eventDigest: publication.eventDigest,
      dedupeKey: publication.dedupeKey,
      publicationStatus: publication.publicationStatus,
      outboxRowId: publication.outboxRowId,
      relayStatus: publication.relayStatus,
      publishedAtIso: publication.publishedAtIso,
      publication: publication,
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings)
    };
  }

  function result(blockers, warnings, publication, extra) {
    var out = {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      valid: blockers.length === 0,
      publication: publication || null,
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

  function scanPublicationPrivacy(value, policy, blockers, warnings) {
    if (typeof kernel.scanPrivacy !== 'function') return;
    var scanPolicy = Object.assign({
      subjectType: 'publication',
      redactionClass: 'redacted',
      allowedRedactionClasses: ['redacted']
    }, safeObject(policy.privacyPolicy));
    var scan = kernel.scanPrivacy(value, scanPolicy);
    codeList(scan.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(scan.warnings).forEach(function (code) { addCode(warnings, code); });
  }

  function validatePublication(input, policy) {
    var options = normalizePolicy(policy);
    var publication = shapePublication(input);
    var blockers = [];
    var warnings = [];

    if (!publication.publicationId) addCode(blockers, 'publication-id-required');
    if (!publication.candidateKind) {
      addCode(blockers, 'publication-candidateKind-required');
    } else if (options.allowedCandidateKinds.indexOf(publication.candidateKind) === -1) {
      addCode(blockers, 'publication-candidateKind-not-allowed');
    }
    if (!publication.candidateRowId) addCode(blockers, 'publication-candidateRowId-required');
    if (!publication.envelopeId) addCode(blockers, 'publication-envelopeId-required');
    if (!publication.lineageId) addCode(blockers, 'publication-lineageId-required');
    if (!isSha256Hex(publication.subjectId)) addCode(blockers, 'publication-subjectId-invalid');
    if (!isSha256Hex(publication.eventDigest)) addCode(blockers, 'publication-eventDigest-invalid');
    if (!isSha256Hex(publication.dedupeKey)) addCode(blockers, 'publication-dedupeKey-invalid');
    if (!publication.sourceLedgerKey) {
      addCode(blockers, 'publication-sourceLedgerKey-required');
    } else if (options.requireKnownSourceLedgerKey &&
      options.sourceLedgerKeys[publication.candidateKind] &&
      options.sourceLedgerKeys[publication.candidateKind] !== publication.sourceLedgerKey) {
      addCode(blockers, 'publication-sourceLedgerKey-mismatch');
    }
    if (!publication.publicationStatus) {
      addCode(blockers, 'publication-status-invalid');
    } else if (options.allowedPublicationStatuses.indexOf(publication.publicationStatus) === -1) {
      addCode(blockers, 'publication-status-not-allowed');
    }
    if (publication.publishedAtIso && !isIso(publication.publishedAtIso)) {
      addCode(blockers, 'publication-publishedAtIso-invalid');
    }
    if (publication.publicationStatus === 'published' && !isIsoOrEmpty(publication.publishedAtIso)) {
      addCode(blockers, 'publication-publishedAtIso-invalid');
    }
    if (options.requirePublishedOutboxRow &&
      publication.publicationStatus === 'published' &&
      !publication.outboxRowId) {
      addCode(blockers, 'publication-outboxRowId-required');
    }
    if (publication.rawRelayStatus && !publication.relayStatus) {
      addCode(blockers, 'publication-relayStatus-invalid');
    } else if (options.allowedRelayStatuses.indexOf(publication.relayStatus) === -1) {
      addCode(blockers, 'publication-relayStatus-not-allowed');
    }
    if (options.requireActorPeer) validatePeerEnvelope(publication.actorPeer, blockers);
    if (publication.validationSummary.ok === false) addCode(warnings, 'publication-validationSummary-not-ok');
    scanPublicationPrivacy(publication, options, blockers, warnings);

    return result(blockers, warnings, publication);
  }

  function validatePublicationMetadata(input, policy) {
    var options = normalizePolicy(policy);
    var metadata = shapePublicationMetadata(input);
    var blockers = [];
    var warnings = [];

    if (!metadata.candidateKind) {
      addCode(blockers, 'publication-candidateKind-required');
    } else if (options.allowedCandidateKinds.indexOf(metadata.candidateKind) === -1) {
      addCode(blockers, 'publication-candidateKind-not-allowed');
    }
    if (!metadata.candidateRowId) addCode(blockers, 'publication-candidateRowId-required');
    if (!metadata.envelopeId) addCode(blockers, 'publication-envelopeId-required');
    if (!metadata.lineageId) addCode(blockers, 'publication-lineageId-required');
    if (!isSha256Hex(metadata.subjectId)) addCode(blockers, 'publication-subjectId-invalid');
    if (!isSha256Hex(metadata.eventDigest)) addCode(blockers, 'publication-eventDigest-invalid');
    if (!isSha256Hex(metadata.dedupeKey)) addCode(blockers, 'publication-dedupeKey-invalid');
    if (metadata.createdAtIso && !isIso(metadata.createdAtIso)) {
      addCode(blockers, 'publication-createdAtIso-invalid');
    }
    if (metadata.rawPublicationStatus && !metadata.publicationStatus) {
      addCode(blockers, 'publication-status-invalid');
    } else if (metadata.publicationStatus &&
      options.allowedPublicationStatuses.indexOf(metadata.publicationStatus) === -1) {
      addCode(blockers, 'publication-status-not-allowed');
    }
    if (metadata.rawRelayStatus && !metadata.relayStatus) {
      addCode(blockers, 'publication-relayStatus-invalid');
    } else if (metadata.relayStatus &&
      options.allowedRelayStatuses.indexOf(metadata.relayStatus) === -1) {
      addCode(blockers, 'publication-relayStatus-not-allowed');
    }
    if (options.requireActorPeer) validatePeerEnvelope(metadata.actorPeer, blockers);
    scanPublicationPrivacy(metadata, options, blockers, warnings);

    return result(blockers, warnings, metadata);
  }

  function createPublicationResult(input) {
    var source = safeObject(input);
    var blockers = codeList(source.blockers);
    var warnings = codeList(source.warnings);
    var publication = source.publication ? shapePublication(source.publication) : null;
    return result(blockers, warnings, publication, {
      receipt: source.receipt ? shapePublicationReceipt(source.receipt) : null,
      metadata: source.metadata ? shapePublicationMetadata(source.metadata) : null
    });
  }

  kernel.PUBLICATION_STATUSES = PUBLICATION_STATUSES.slice();
  kernel.PUBLICATION_RELAY_STATUSES = RELAY_STATUSES.slice();
  kernel.normalizePublicationStatus = normalizePublicationStatus;
  kernel.normalizeRelayStatus = normalizeRelayStatus;
  kernel.shapePublication = shapePublication;
  kernel.validatePublication = validatePublication;
  kernel.shapePublicationMetadata = shapePublicationMetadata;
  kernel.shapePublicationAuditMetadata = shapePublicationMetadata;
  kernel.validatePublicationMetadata = validatePublicationMetadata;
  kernel.validatePublicationAuditMetadata = validatePublicationMetadata;
  kernel.shapePublicationReceipt = shapePublicationReceipt;
  kernel.createPublicationResult = createPublicationResult;
  kernel.isTerminalPublicationStatus = isTerminalPublicationStatus;
  kernel.__publicationKitInstalled = true;
  kernel.__publicationKitVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
