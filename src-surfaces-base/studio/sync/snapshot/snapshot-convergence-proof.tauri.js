/* H2O Desktop Sync - F14.4.10 snapshot convergence proof
 *
 * Read-only proof harness for snapshot convergence lanes. It directly
 * exercises proposal-shaped fixtures, owner handoff previews, applyEvent
 * receipt builders, and in-memory bookkeeping lineage checks. This module
 * never writes storage, publishes, enqueues relay outbox rows, calls Native/F5,
 * applies, advances watermarks, or records consumed operations.
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
  if (H2O.Desktop.Sync.__snapshotProofInstalled) return;

  var VERSION = '0.1.0-f14.5.5.5';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-convergence-proof.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.convergence-proposal-candidate-row.v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var KIND_PROPOSAL = 'proposal';
  var OPERATION_INTENT = 'update';
  var OP_ARCHIVE_PROPOSED = 'snapshot-lifecycle-archive-proposed';
  var OP_TOMBSTONE_PROPOSED = 'snapshot-lifecycle-tombstone-proposed';
  var OP_RESTORE_PROPOSED = 'snapshot-lifecycle-restore-proposed';
  var OP_ARCHIVE_APPLIED = 'snapshot-lifecycle-archive-applied';
  var OP_TOMBSTONE_APPLIED = 'snapshot-lifecycle-tombstone-applied';
  var OP_RESTORE_APPLIED = 'snapshot-lifecycle-restore-applied';
  var REDACTED = 'redacted';
  var PROOF_ISO = '2026-05-31T10:00:00Z';
  var FUTURE_ISO = '2099-01-01T00:00:00Z';
  var STALE_ISO = '2026-05-31T08:00:00Z';
  var EXPIRED_ISO = '2026-05-30T10:00:00Z';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f14.4.10-desktop-snapshot-convergence-proof-v1';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message_array', 'turns',
    'turn_array', 'conversation', 'transcript', 'attachments', 'files',
    'file_ids', 'image_urls', 'audio_urls', 'rawSnapshot', 'snapshotPayload',
    'rawId', 'snapshotId', 'snapshot_id', 'chatId', 'chat_id',
    'accountId', 'account_id', 'rawAccountId', 'title', 'name',
    'model', 'modelSlug', 'model_slug', 'modelVersion', 'model_version',
    'path', 'url', 'share_url', 'share_token', 'password', 'apiKey',
    'session_token', 'cookies', 'token'
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function isSha256Hex(value) { return /^[0-9a-f]{64}$/.test(cleanLower(value)); }
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
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
  function allValuesTrue(map) {
    return Object.keys(safeObject(map)).every(function (key) {
      return safeObject(map)[key] === true;
    });
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
    try { return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest); }
    catch (_) { return false; }
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
    try { if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID(); }
    catch (_) { /* fall through */ }
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
  }
  function envelopeForEventDigest(envelope) {
    var clone = JSON.parse(JSON.stringify(envelope));
    delete clone.eventDigest;
    delete clone.warnings;
    delete clone.blockers;
    return clone;
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrayHit = foreverNoKey(value[i]);
        if (arrayHit) return arrayHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (FOREVER_NO_FIELDS.indexOf(key) !== -1) return key;
      if (/token$/i.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }
  function scanPrivacy(value, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var domainScan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, value);
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
          redactionClass: REDACTED,
          allowedRedactionClasses: [REDACTED],
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        });
        codeList(scan && scan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(scan && scan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'privacy-scan-threw');
      }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }
  function containsRawFixture(value, needle) {
    return canonicalJson(value).indexOf(needle) !== -1;
  }

  async function actorPeer() {
    return {
      physicalDeviceIdHash: await sha256Hex('snapshot-proof-device'),
      installIdHash: await sha256Hex('snapshot-proof-install'),
      syncPeerIdHash: await sha256Hex('snapshot-proof-peer'),
      surfaceKind: 'desktop-tauri'
    };
  }
  async function nativeOwner(peer) {
    return {
      ownerKind: 'native',
      kind: 'native',
      ownerId: 'native-snapshot-owner-proof',
      id: 'native-snapshot-owner-proof',
      platformId: 'native-snapshot-owner-proof',
      surfaceKind: 'native',
      authorityLevel: 'audited-apply-authority',
      capabilities: ['read', 'restore', 'ownerHandoff'],
      subjectTypes: [SUBJECT_TYPE, 'snapshot'],
      domains: [SUBJECT_TYPE, 'snapshot', 'restore'],
      ownerNameHash: await sha256Hex('snapshot-proof-native-owner'),
      ownerPeer: peer,
      actorPeer: peer
    };
  }
  async function f5Owner(peer) {
    return {
      ownerKind: 'f5',
      kind: 'f5',
      ownerId: 'f5-snapshot-owner-proof',
      id: 'f5-snapshot-owner-proof',
      platformId: 'f5-snapshot-owner-proof',
      surfaceKind: 'desktop-tauri',
      authorityLevel: 'audited-apply-authority',
      capabilities: ['read', 'review', 'delete', 'ownerHandoff'],
      subjectTypes: [SUBJECT_TYPE, 'snapshot'],
      domains: [SUBJECT_TYPE, 'snapshot', 'tombstone'],
      ownerNameHash: await sha256Hex('snapshot-proof-f5-owner'),
      ownerPeer: peer,
      actorPeer: peer
    };
  }

  function proposedOperationFor(operation, subjectId, baseHash, targetHash, fromState, toState) {
    return {
      operation: operation,
      operationIntent: OPERATION_INTENT,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      baseHash: baseHash,
      targetHash: targetHash,
      lifecycleTransition: {
        fromState: fromState,
        toState: toState
      }
    };
  }
  function expectedPostState(subjectId, targetHash, state) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      lifecycleState: state,
      expectedPostStateHash: targetHash
    };
  }
  function predicateFor(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return 'h2o.snapshot.archive.predicate.v1';
    if (operation === OP_TOMBSTONE_PROPOSED) return 'h2o.snapshot.tombstone.predicate.v1';
    if (operation === OP_RESTORE_PROPOSED) return 'h2o.snapshot.restore.predicate.v1';
    return 'h2o.snapshot.proof.predicate.v1';
  }
  function targetStateFor(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return 'archived';
    if (operation === OP_TOMBSTONE_PROPOSED) return 'tombstoned';
    if (operation === OP_RESTORE_PROPOSED) return 'captured';
    return '';
  }
  function applyOperationFor(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return OP_ARCHIVE_APPLIED;
    if (operation === OP_TOMBSTONE_PROPOSED) return OP_TOMBSTONE_APPLIED;
    if (operation === OP_RESTORE_PROPOSED) return OP_RESTORE_APPLIED;
    return '';
  }
  function operationName(operation) {
    if (operation === OP_ARCHIVE_PROPOSED) return 'archive';
    if (operation === OP_TOMBSTONE_PROPOSED) return 'tombstone';
    if (operation === OP_RESTORE_PROPOSED) return 'restore';
    return '';
  }

  async function identityFor(operation, subjectId, baseHash, peer) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var lineageId = '';
    var dedupeKey = '';
    if (kernel && typeof kernel.generateLineageId === 'function') {
      var lineage = await kernel.generateLineageId({
        deterministic: true,
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        operation: operation,
        baseHash: baseHash,
        actorPeer: peer
      });
      lineageId = cleanLower(lineage && lineage.lineageId);
    }
    if (!isSha256Hex(lineageId)) lineageId = await sha256Hex({ purpose: 'lineage', operation: operation, subjectId: subjectId, baseHash: baseHash, peer: peer });
    if (kernel && typeof kernel.generateDedupeKey === 'function') {
      var dedupe = await kernel.generateDedupeKey({
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        operation: operation,
        baseHash: baseHash,
        actorPeer: peer
      });
      dedupeKey = cleanLower(dedupe && dedupe.dedupeKey);
    }
    if (!isSha256Hex(dedupeKey)) dedupeKey = await sha256Hex({ purpose: 'dedupe', operation: operation, subjectId: subjectId, baseHash: baseHash, peer: peer });
    return { lineageId: lineageId, dedupeKey: dedupeKey };
  }

  async function buildProposalFixture(lane, operation, fromState, toState, peer) {
    var subjectId = await sha256Hex('snapshot.conversation:proof:' + lane);
    var baseHash = await sha256Hex('snapshot-proof-base:' + lane + ':' + fromState);
    var targetHash = await sha256Hex('snapshot-proof-target:' + lane + ':' + toState);
    var identity = await identityFor(operation, subjectId, baseHash, peer);
    var evidence = await sha256Hex('snapshot-proof-evidence:' + lane);
    var payload = {
      justifyingEvidenceDigests: [evidence],
      proposedOperation: proposedOperationFor(operation, subjectId, baseHash, targetHash, fromState, toState),
      expectedPostState: expectedPostState(subjectId, targetHash, toState),
      predicateVersion: predicateFor(operation)
    };
    var payloadHash = await sha256Hex(payload);
    var capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG + ':' + lane);
    var createdAt = PROOF_ISO;
    var envelopeBase = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: KIND_PROPOSAL,
      id: generateUuid(),
      lineageId: identity.lineageId,
      createdAt: createdAt,
      expiresAt: FUTURE_ISO,
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: peer
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'strong-local-authority',
      capabilityUsed: 'propose',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: operation,
      operationIntent: OPERATION_INTENT,
      redactionClass: REDACTED,
      dryRun: null,
      transactional: null,
      dedupeKey: identity.dedupeKey,
      payloadHash: payloadHash,
      payload: payload
    };
    var eventDigest = await sha256Hex(envelopeForEventDigest(envelopeBase));
    var envelope = Object.assign({}, envelopeBase, {
      eventDigest: eventDigest,
      warnings: [],
      blockers: []
    });
    var row = {
      schema: ROW_SCHEMA,
      rowId: generateUuid(),
      envelopeId: envelope.id,
      lineageId: envelope.lineageId,
      subjectId: subjectId,
      operation: operation,
      operationIntent: OPERATION_INTENT,
      baseHash: baseHash,
      targetHash: targetHash,
      justifyingEvidenceDigests: [evidence],
      predicateVersion: predicateFor(operation),
      generatedAtIso: createdAt,
      expiresAt: FUTURE_ISO,
      dedupeKey: identity.dedupeKey,
      eventDigest: eventDigest,
      actorPeer: peer,
      status: 'generated',
      sourceDomain: SUBJECT_TYPE,
      targetState: { lifecycleState: toState },
      canonicalSnapshotSummary: {
        subjectId: subjectId,
        revisionHash: baseHash,
        originChatSubjectIdHash: await sha256Hex('snapshot-proof-origin-chat:' + lane),
        originAccountIdHash: await sha256Hex('snapshot-proof-account'),
        schemaVersion: 'h2o.snapshot.conversation.v1',
        lifecycleState: fromState
      },
      validationSummary: {
        ok: true,
        actionable: true,
        operation: operationName(operation),
        sideEffectFree: true
      },
      serializedEnvelope: canonicalJson(envelope)
    };
    return {
      proposalCandidate: envelope,
      candidateRow: row,
      candidateId: row.rowId,
      operation: operation,
      applyOperation: applyOperationFor(operation),
      operationName: operationName(operation),
      fromState: fromState,
      targetState: toState,
      subjectId: subjectId,
      lineageId: identity.lineageId,
      dedupeKey: identity.dedupeKey,
      baseHash: baseHash,
      targetHash: targetHash,
      eventDigest: eventDigest
    };
  }

  function snapshotRecordFor(fixture, accountHash) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: fixture.subjectId,
      revisionHash: fixture.baseHash,
      originChatSubjectIdHash: safeObject(fixture.candidateRow.canonicalSnapshotSummary).originChatSubjectIdHash,
      originAccountIdHash: accountHash || safeObject(fixture.candidateRow.canonicalSnapshotSummary).originAccountIdHash,
      lifecycleState: fixture.fromState,
      archived: fixture.fromState === 'archived',
      tombstoned: fixture.fromState === 'tombstoned',
      capturedAtIso: '2026-05-31T09:00:00Z',
      lifecycleChangedAtIso: '2026-05-31T09:30:00Z',
      retentionExpiresAtIso: FUTURE_ISO,
      turnCountBucket: '10-24',
      sizeBucket: '64kb-256kb',
      modelHash: '',
      sourceTag: '',
      sourceTagHash: '',
      schemaVersion: 'h2o.snapshot.conversation.v1'
    };
  }

  function activeTombstone(subjectId, priorDigest, peer) {
    return {
      tombstoneId: 'snapshot-proof-tombstone-' + subjectId.slice(0, 12),
      recordKind: 'snapshot',
      recordId: subjectId,
      subjectId: subjectId,
      deletedAt: '2026-05-31T09:40:00Z',
      deletedBySyncPeerId: cleanString(peer && peer.syncPeerIdHash),
      deleteReason: 'snapshot-proof-tombstone',
      priorDigest: priorDigest,
      createdAt: '2026-05-31T09:40:00Z',
      updatedAt: '2026-05-31T09:40:00Z'
    };
  }
  function restoredTombstoneEvidence(subjectId, priorDigest, peer, tombstoneId) {
    return {
      tombstoneId: tombstoneId || ('snapshot-proof-tombstone-' + subjectId.slice(0, 12)),
      recordKind: 'snapshot',
      recordId: subjectId,
      subjectId: subjectId,
      deletedAt: '2026-05-31T09:40:00Z',
      deletedBySyncPeerId: cleanString(peer && peer.syncPeerIdHash),
      deleteReason: 'snapshot-proof-restore-source',
      priorDigest: priorDigest,
      restoredAt: '2026-05-31T10:00:00Z',
      restoredBySyncPeerId: cleanString(peer && peer.syncPeerIdHash),
      createdAt: '2026-05-31T09:40:00Z',
      updatedAt: '2026-05-31T10:00:00Z'
    };
  }

  function operationResultFor(fixture, peer, extra) {
    return Object.assign({
      ok: true,
      result: 'success',
      status: 'success',
      applied: true,
      subjectId: fixture.subjectId,
      lineageId: fixture.lineageId,
      operation: fixture.applyOperation,
      preStateHash: fixture.baseHash,
      postStateHash: fixture.targetHash,
      lifecycleState: fixture.targetState,
      appliedAtIso: PROOF_ISO,
      actorPeer: peer,
      operationId: fixture.operationName + '-proof-operation-' + fixture.subjectId.slice(0, 8),
      transactionId: fixture.operationName + '-proof-transaction-' + fixture.subjectId.slice(0, 8),
      auditMaintenanceId: fixture.operationName + '-proof-audit-' + fixture.subjectId.slice(0, 8)
    }, safeObject(extra));
  }

  function buildBookkeepingPreview(fixture, handoffPreview, receipt) {
    var event = safeObject(receipt && receipt.applyEvent);
    return {
      schema: 'h2o.desktop.sync.snapshot-convergence-bookkeeping-proof-row.v1',
      rowId: generateUuid(),
      status: 'proof-only',
      proposalEnvelopeId: cleanString(fixture.proposalCandidate.id),
      proposalEventDigest: fixture.eventDigest,
      proposalDedupeKey: fixture.dedupeKey,
      handoffId: cleanString(safeObject(handoffPreview.handoffRequest).handoffId),
      applyEventId: cleanString(event.id),
      applyEventDigest: cleanString(event.eventDigest),
      applyEventDedupeKey: cleanString(event.dedupeKey),
      subjectType: SUBJECT_TYPE,
      subjectId: fixture.subjectId,
      lineageId: fixture.lineageId,
      operation: fixture.applyOperation,
      proposalOperation: fixture.operation,
      sourceLifecycleState: fixture.fromState,
      targetLifecycleState: fixture.targetState,
      validationSummary: {
        proposalLinked: true,
        handoffLinked: true,
        receiptLinked: true,
        auditLinked: !!receipt.auditMetadata,
        publicationTouched: false,
        relayTouched: false,
        nativeCalled: false,
        f5Touched: false,
        outboxTouched: false,
        watermarkWritten: false,
        consumedOperationWritten: false
      }
    };
  }

  function laneSummary(name, fixture, handoff, receipt, bookkeeping, blockers, warnings) {
    return {
      ok: blockers.length === 0,
      lane: name,
      operation: fixture.operationName,
      proposalGenerated: !!fixture.proposalCandidate,
      handoffReady: handoff && handoff.handoffReady === true,
      applyEventGenerated: !!(receipt && receipt.ok === true && receipt.applyEvent),
      bookkeepingPreviewed: !!bookkeeping,
      subjectId: fixture.subjectId,
      lineageId: fixture.lineageId,
      proposalEventDigest: fixture.eventDigest,
      applyEventDigest: cleanString(safeObject(receipt && receipt.applyEvent).eventDigest),
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  function validateLaneLineage(fixture, handoff, receipt, bookkeeping, blockers) {
    var event = safeObject(receipt && receipt.applyEvent);
    if (cleanLower(fixture.proposalCandidate.lineageId) !== fixture.lineageId) addCode(blockers, 'proposal-lineage-mismatch');
    if (cleanLower(handoff && handoff.lineageId) !== fixture.lineageId) addCode(blockers, 'handoff-lineage-mismatch');
    if (cleanLower(event.lineageId) !== fixture.lineageId) addCode(blockers, 'receipt-lineage-mismatch');
    if (cleanLower(bookkeeping && bookkeeping.lineageId) !== fixture.lineageId) addCode(blockers, 'bookkeeping-lineage-mismatch');
    if (cleanLower(handoff && handoff.subjectId) !== fixture.subjectId) addCode(blockers, 'handoff-subject-mismatch');
    if (cleanLower(event.subjectId) !== fixture.subjectId) addCode(blockers, 'receipt-subject-mismatch');
    if (cleanLower(bookkeeping && bookkeeping.subjectId) !== fixture.subjectId) addCode(blockers, 'bookkeeping-subject-mismatch');
  }

  async function runArchiveLane(peer, owner) {
    var blockers = [];
    var warnings = [];
    var fixture = await buildProposalFixture('archive', OP_ARCHIVE_PROPOSED, 'captured', 'archived', peer);
    var handoff = await H2O.Desktop.Sync.previewSnapshotNativeArchiveHandoff({
      candidate: fixture,
      ownerDeclaration: owner,
      ownerStatus: 'reachable'
    });
    codeList(handoff && handoff.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!handoff || handoff.ok !== true || handoff.handoffReady !== true) {
      codeList(handoff && handoff.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'archive-handoff-not-ready');
    }
    var receipt = await H2O.Desktop.Sync.buildSnapshotArchiveApplyEventReceipt({
      proposalCandidate: fixture,
      handoffPreview: handoff,
      operationResult: operationResultFor(fixture, peer, { archived: true })
    });
    codeList(receipt && receipt.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!receipt || receipt.ok !== true || !receipt.applyEvent) {
      codeList(receipt && receipt.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'archive-receipt-not-generated');
    }
    var bookkeeping = buildBookkeepingPreview(fixture, handoff || {}, receipt || {});
    validateLaneLineage(fixture, handoff || {}, receipt || {}, bookkeeping, blockers);
    scanPrivacy({ fixture: fixture, handoff: handoff, receipt: receipt, bookkeeping: bookkeeping }, blockers, warnings);
    return {
      fixture: fixture,
      handoff: handoff,
      receipt: receipt,
      bookkeeping: bookkeeping,
      summary: laneSummary('archiveLane', fixture, handoff, receipt, bookkeeping, blockers, warnings)
    };
  }

  async function runTombstoneLane(peer, owner) {
    var blockers = [];
    var warnings = [];
    var fixture = await buildProposalFixture('tombstone', OP_TOMBSTONE_PROPOSED, 'archived', 'tombstoned', peer);
    var handoff = await H2O.Desktop.Sync.previewSnapshotF5TombstoneHandoff({
      candidate: fixture,
      ownerDeclaration: owner,
      ownerStatus: 'available'
    });
    codeList(handoff && handoff.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!handoff || handoff.ok !== true || handoff.handoffReady !== true) {
      codeList(handoff && handoff.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'tombstone-handoff-not-ready');
    }
    var f5Evidence = activeTombstone(fixture.subjectId, fixture.baseHash, peer);
    var receipt = await H2O.Desktop.Sync.buildSnapshotTombstoneApplyEventReceipt({
      proposalCandidate: fixture,
      handoffPreview: handoff,
      operationResult: operationResultFor(fixture, peer, {
        tombstoned: true,
        f5Evidence: f5Evidence
      })
    });
    codeList(receipt && receipt.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!receipt || receipt.ok !== true || !receipt.applyEvent || !receipt.f5Evidence) {
      codeList(receipt && receipt.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'tombstone-receipt-not-generated');
    }
    var bookkeeping = buildBookkeepingPreview(fixture, handoff || {}, receipt || {});
    validateLaneLineage(fixture, handoff || {}, receipt || {}, bookkeeping, blockers);
    scanPrivacy({ fixture: fixture, handoff: handoff, receipt: receipt, bookkeeping: bookkeeping }, blockers, warnings);
    return {
      fixture: fixture,
      handoff: handoff,
      receipt: receipt,
      bookkeeping: bookkeeping,
      summary: laneSummary('tombstoneLane', fixture, handoff, receipt, bookkeeping, blockers, warnings)
    };
  }

  async function runRestoreArchiveLane(peer, owner) {
    var blockers = [];
    var warnings = [];
    var fixture = await buildProposalFixture('restore-archive', OP_RESTORE_PROPOSED, 'archived', 'captured', peer);
    var handoff = await H2O.Desktop.Sync.previewSnapshotRestoreHandoff({
      candidate: fixture,
      ownerDeclaration: owner,
      ownerStatus: 'reachable'
    });
    codeList(handoff && handoff.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!handoff || handoff.ok !== true || handoff.handoffReady !== true) {
      codeList(handoff && handoff.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'restore-archive-handoff-not-ready');
    }
    var receipt = await H2O.Desktop.Sync.buildSnapshotRestoreApplyEventReceipt({
      proposalCandidate: fixture,
      handoffPreview: handoff,
      operationResult: operationResultFor(fixture, peer, {
        restored: true,
        restoreSource: 'archived'
      })
    });
    codeList(receipt && receipt.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!receipt || receipt.ok !== true || !receipt.applyEvent) {
      codeList(receipt && receipt.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'restore-archive-receipt-not-generated');
    }
    var bookkeeping = buildBookkeepingPreview(fixture, handoff || {}, receipt || {});
    validateLaneLineage(fixture, handoff || {}, receipt || {}, bookkeeping, blockers);
    scanPrivacy({ fixture: fixture, handoff: handoff, receipt: receipt, bookkeeping: bookkeeping }, blockers, warnings);
    return {
      fixture: fixture,
      handoff: handoff,
      receipt: receipt,
      bookkeeping: bookkeeping,
      summary: laneSummary('restoreArchiveLane', fixture, handoff, receipt, bookkeeping, blockers, warnings)
    };
  }

  async function runRestoreTombstoneLane(peer, owner) {
    var blockers = [];
    var warnings = [];
    var fixture = await buildProposalFixture('restore-tombstone', OP_RESTORE_PROPOSED, 'tombstoned', 'captured', peer);
    var tombstone = activeTombstone(fixture.subjectId, fixture.baseHash, peer);
    var handoff = await H2O.Desktop.Sync.previewSnapshotRestoreHandoff({
      candidate: fixture,
      ownerDeclaration: owner,
      ownerStatus: 'reachable',
      tombstoneEvidence: [tombstone],
      retentionExpiresAtIso: FUTURE_ISO,
      referenceIso: PROOF_ISO
    });
    codeList(handoff && handoff.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!handoff || handoff.ok !== true || handoff.handoffReady !== true) {
      codeList(handoff && handoff.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'restore-tombstone-handoff-not-ready');
    }
    var receipt = await H2O.Desktop.Sync.buildSnapshotRestoreApplyEventReceipt({
      proposalCandidate: fixture,
      handoffPreview: handoff,
      operationResult: operationResultFor(fixture, peer, {
        restored: true,
        restoreSource: 'tombstoned',
        f5RestoreEvidence: restoredTombstoneEvidence(fixture.subjectId, fixture.baseHash, peer, tombstone.tombstoneId)
      })
    });
    codeList(receipt && receipt.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!receipt || receipt.ok !== true || !receipt.applyEvent || !receipt.f5RestoreEvidence) {
      codeList(receipt && receipt.blockers).forEach(function (code) { addCode(blockers, code); });
      addCode(blockers, 'restore-tombstone-receipt-not-generated');
    }
    var bookkeeping = buildBookkeepingPreview(fixture, handoff || {}, receipt || {});
    validateLaneLineage(fixture, handoff || {}, receipt || {}, bookkeeping, blockers);
    scanPrivacy({ fixture: fixture, handoff: handoff, receipt: receipt, bookkeeping: bookkeeping }, blockers, warnings);
    return {
      fixture: fixture,
      handoff: handoff,
      receipt: receipt,
      bookkeeping: bookkeeping,
      summary: laneSummary('restoreTombstoneLane', fixture, handoff, receipt, bookkeeping, blockers, warnings)
    };
  }

  // ─── F14.5.5.5 — F5 review queue integration lane ───────────────────
  // Verifies the end-to-end path that F14.5.5.2 introduced:
  //   tombstone proposal → tombstone receipt → ingestF5Review →
  //   pending review row → snapshot in retained-window state.
  //
  // Storage discipline: snapshot the queue ledger, clear it, run the lane,
  // and restore the original ledger value in a finally block. Repeated proof
  // runs cannot pollute real F5 review state.
  var F5_QUEUE_LEDGER_KEY = 'h2o:sync:snapshot-f5-review-queue:v1';
  var F5_QUEUE_LEDGER_SCHEMA = 'h2o.desktop.sync.snapshot-f5-review-queue-ledger.v1';
  function f5QueueStorageRef() {
    try {
      var c = global.chrome;
      if (c && c.storage && c.storage.local
          && typeof c.storage.local.get === 'function'
          && typeof c.storage.local.set === 'function') return c.storage.local;
    } catch (_) { /* ignore */ }
    return null;
  }
  function snapshotF5QueueLedger() {
    return new Promise(function (resolve) {
      var s = f5QueueStorageRef();
      if (!s) { resolve(null); return; }
      try {
        s.get([F5_QUEUE_LEDGER_KEY], function (items) {
          resolve(items && Object.prototype.hasOwnProperty.call(items, F5_QUEUE_LEDGER_KEY)
            ? items[F5_QUEUE_LEDGER_KEY] : null);
        });
      } catch (_) { resolve(null); }
    });
  }
  function setF5QueueLedger(value) {
    return new Promise(function (resolve, reject) {
      var s = f5QueueStorageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        var payload = {};
        payload[F5_QUEUE_LEDGER_KEY] = value;
        s.set(payload, function () { resolve(); });
      } catch (e) { reject(e); }
    });
  }
  async function clearF5QueueLedger() {
    return setF5QueueLedger({
      schema: F5_QUEUE_LEDGER_SCHEMA,
      createdAtIso: PROOF_ISO,
      events: []
    });
  }
  async function restoreF5QueueLedger(snapshotValue) {
    if (snapshotValue === null || snapshotValue === undefined) {
      return clearF5QueueLedger();
    }
    return setF5QueueLedger(snapshotValue);
  }

  async function runF5QueueIntegrationLane(peer, owner) {
    var blockers = [];
    var warnings = [];
    var sync = H2O.Desktop.Sync;
    var queueAvailable = !!(sync.__snapshotF5ReviewQueueInstalled
      && typeof sync.ingestF5Review === 'function'
      && typeof sync.getF5ReviewById === 'function');
    if (!queueAvailable) addCode(blockers, 'f5-review-queue-not-installed');

    var fixture = await buildProposalFixture(
      'f5-queue-integration', OP_TOMBSTONE_PROPOSED, 'archived', 'tombstoned', peer);
    var handoff = null;
    var receipt = null;
    var queueRow = null;
    var ledgerSnapshot = await snapshotF5QueueLedger();

    try {
      if (queueAvailable) {
        try { await clearF5QueueLedger(); }
        catch (_) { addCode(warnings, 'f5-queue-ledger-clear-failed'); }
      }

      handoff = await sync.previewSnapshotF5TombstoneHandoff({
        candidate: fixture,
        ownerDeclaration: owner,
        ownerStatus: 'available'
      });
      codeList(handoff && handoff.warnings).forEach(function (code) { addCode(warnings, code); });
      if (!handoff || handoff.ok !== true || handoff.handoffReady !== true) {
        codeList(handoff && handoff.blockers).forEach(function (code) { addCode(blockers, code); });
        addCode(blockers, 'f5-integration-handoff-not-ready');
      }

      var f5Evidence = activeTombstone(fixture.subjectId, fixture.baseHash, peer);
      var originAccountIdHash = await sha256Hex('snapshot-proof:f5-integration:originAccountIdHash');
      receipt = await sync.buildSnapshotTombstoneApplyEventReceipt({
        proposalCandidate: fixture,
        handoffPreview: handoff,
        operationResult: operationResultFor(fixture, peer, {
          tombstoned: true,
          f5Evidence: f5Evidence
        }),
        originAccountIdHash: originAccountIdHash
      });
      codeList(receipt && receipt.warnings).forEach(function (code) { addCode(warnings, code); });
      if (!receipt || receipt.ok !== true || !receipt.applyEvent || !receipt.f5Evidence) {
        codeList(receipt && receipt.blockers).forEach(function (code) { addCode(blockers, code); });
        addCode(blockers, 'f5-integration-receipt-not-generated');
      }

      // F14.5.5.5 — assert the wire-through actually ingested into the queue.
      if (receipt && receipt.ok === true) {
        if (receipt.f5ReviewIngested !== true) {
          addCode(blockers, 'f5-integration-receipt-f5ReviewIngested-not-true');
        }
        if (!isSha256Hex(receipt.f5ReviewId)) {
          addCode(blockers, 'f5-integration-receipt-f5ReviewId-not-sha256');
        }
        if (queueAvailable && isSha256Hex(receipt.f5ReviewId)) {
          queueRow = await sync.getF5ReviewById(receipt.f5ReviewId);
          if (!queueRow || queueRow.status !== 'found') {
            addCode(blockers, 'f5-integration-queue-row-not-found');
          }
          if (queueRow && queueRow.currentState !== 'pending') {
            addCode(blockers, 'f5-integration-queue-row-not-pending');
          }
          // Retained-state mapping per queue contract: a `pending` review row
          // corresponds to a snapshot in the `retained` retention-window state.
          // The lifecycleState mapping happens inside the queue's event emit;
          // we assert structurally via the row's currentState here.
          if (queueRow && queueRow.currentState !== 'pending') {
            addCode(blockers, 'f5-integration-snapshot-not-in-retained');
          }
          // Privacy: no raw chatId / title / accountId / content / turns
          // anywhere in the egress row blob.
          var rowBlob = JSON.stringify({
            rows: queueRow && queueRow.rows,
            reviewRow: queueRow && queueRow.metadata && queueRow.metadata.reviewRow
          });
          if (rowBlob.indexOf('"chatId"') !== -1) addCode(blockers, 'f5-integration-raw-chatId-leak');
          if (rowBlob.indexOf('"title"') !== -1) addCode(blockers, 'f5-integration-raw-title-leak');
          if (rowBlob.indexOf('"accountId"') !== -1) addCode(blockers, 'f5-integration-raw-accountId-leak');
          if (rowBlob.indexOf('"content"') !== -1) addCode(blockers, 'f5-integration-raw-content-leak');
          if (rowBlob.indexOf('"turns"') !== -1) addCode(blockers, 'f5-integration-raw-turns-leak');
        }
      }

      scanPrivacy({ fixture: fixture, handoff: handoff, receipt: receipt, queueRow: queueRow },
        blockers, warnings);
    } finally {
      if (queueAvailable) {
        try { await restoreF5QueueLedger(ledgerSnapshot); }
        catch (_) { addCode(warnings, 'f5-queue-ledger-restore-failed'); }
      }
    }

    // Build a bookkeeping preview so the orchestrator's lineageSummary check
    // (which is called over every lane) finds matching lineageId on the lane
    // shape. The F5 integration lane never writes to the bookkeeping ledger;
    // this is a preview-only shape used by the cross-lane lineage assertion.
    var bookkeeping = buildBookkeepingPreview(fixture, handoff || {}, receipt || {});
    validateLaneLineage(fixture, handoff || {}, receipt || {}, bookkeeping, blockers);

    return {
      fixture: fixture,
      handoff: handoff,
      receipt: receipt,
      bookkeeping: bookkeeping,
      queueRow: queueRow,
      summary: {
        ok: blockers.length === 0,
        lane: 'f5QueueIntegrationLane',
        operation: fixture.operationName,
        proposalGenerated: !!fixture.proposalCandidate,
        handoffReady: !!(handoff && handoff.handoffReady === true),
        applyEventGenerated: !!(receipt && receipt.ok === true && receipt.applyEvent),
        bookkeepingPreviewed: !!bookkeeping,
        f5ReviewIngested: !!(receipt && receipt.f5ReviewIngested === true),
        f5ReviewId: cleanString(receipt && receipt.f5ReviewId),
        queueRowFound: !!(queueRow && queueRow.status === 'found'),
        queueRowCurrentState: cleanString(queueRow && queueRow.currentState),
        snapshotInRetained: !!(queueRow && queueRow.currentState === 'pending'),
        subjectId: fixture.subjectId,
        lineageId: fixture.lineageId,
        proposalEventDigest: fixture.eventDigest,
        applyEventDigest: cleanString(safeObject(receipt && receipt.applyEvent).eventDigest),
        blockers: codeList(blockers),
        warnings: codeList(warnings)
      }
    };
  }

  function dependencyChecks() {
    var required = [
      'previewSnapshotNativeArchiveHandoff',
      'previewSnapshotF5TombstoneHandoff',
      'previewSnapshotRestoreHandoff',
      'buildSnapshotArchiveApplyEventReceipt',
      'buildSnapshotTombstoneApplyEventReceipt',
      'buildSnapshotRestoreApplyEventReceipt',
      'runSnapshotConvergencePreflight',
      'runSnapshotForbiddenFieldScan',
      'runSnapshotLifecycleTransitionAllowed'
    ];
    var missing = required.filter(function (name) { return typeof H2O.Desktop.Sync[name] !== 'function'; });
    return {
      ok: missing.length === 0,
      missing: missing
    };
  }

  async function preflightCase(args) {
    try {
      return await H2O.Desktop.Sync.runSnapshotConvergencePreflight(args);
    } catch (e) {
      return {
        ok: false,
        actionable: false,
        blockers: ['snapshot-proof-preflight-threw'],
        warnings: [cleanString(e && e.message) || 'unknown']
      };
    }
  }
  function commonPreflightArgs(fixture, peer, owner, overrides) {
    var account = safeObject(fixture.candidateRow.canonicalSnapshotSummary).originAccountIdHash;
    return Object.assign({
      snapshotRecord: snapshotRecordFor(fixture, account),
      operation: operationName(fixture.operation),
      expectedTarget: { lifecycleState: targetStateFor(fixture.operation) },
      localAccountIdHash: account,
      ownerDeclaration: owner,
      ownerStatus: 'reachable',
      mirrorLastSyncIso: '2026-05-31T09:59:30Z',
      referenceIso: PROOF_ISO,
      freshnessWindowMs: 5 * 60 * 1000,
      tombstoneLog: [],
      replayLog: [],
      consumedOperationsLog: [],
      currentWatermark: {
        peerId: peer.syncPeerIdHash,
        subjectId: fixture.subjectId,
        lineageId: fixture.lineageId,
        revisionHash: fixture.baseHash,
        watermarkAtIso: '2026-05-31T09:00:00Z'
      },
      proposedWatermark: {
        peerId: peer.syncPeerIdHash,
        subjectId: fixture.subjectId,
        lineageId: fixture.lineageId,
        revisionHash: fixture.targetHash,
        watermarkAtIso: PROOF_ISO
      },
      contentAvailable: true,
      contentDigest: fixture.baseHash,
      expectedContentDigest: fixture.baseHash
    }, safeObject(overrides));
  }

  function blocked(result) {
    return !!result && (result.ok === false || result.actionable === false || codeList(result.blockers).length > 0);
  }
  async function negativeCases(fixtures, peer, owner) {
    var archive = fixtures.archive.fixture;
    var restoreTombstone = fixtures.restoreTombstone.fixture;
    var account = safeObject(archive.candidateRow.canonicalSnapshotSummary).originAccountIdHash;
    var restoreAccount = safeObject(restoreTombstone.candidateRow.canonicalSnapshotSummary).originAccountIdHash;
    var differentAccount = await sha256Hex('snapshot-proof-different-account');
    var crossAccount = await preflightCase(commonPreflightArgs(archive, peer, owner, {
      localAccountIdHash: differentAccount
    }));
    var staleMirror = await preflightCase(commonPreflightArgs(archive, peer, owner, {
      mirrorLastSyncIso: STALE_ISO
    }));
    var tombstonePresent = await preflightCase(commonPreflightArgs(archive, peer, owner, {
      tombstoneLog: [activeTombstone(archive.subjectId, archive.baseHash, peer)]
    }));
    var replayDetected = await preflightCase(commonPreflightArgs(archive, peer, owner, {
      replayLog: [{
        subjectType: SUBJECT_TYPE,
        subjectId: archive.subjectId,
        operation: 'archive',
        revisionHash: archive.baseHash,
        eventDigest: archive.eventDigest,
        dedupeKey: archive.dedupeKey,
        consumedStatus: 'consumed'
      }]
    }));
    var retentionExpired = await preflightCase(commonPreflightArgs(restoreTombstone, peer, owner, {
      snapshotRecord: Object.assign({}, snapshotRecordFor(restoreTombstone, restoreAccount), {
        retentionExpiresAtIso: EXPIRED_ISO
      }),
      operation: 'restore',
      expectedTarget: { lifecycleState: 'captured' },
      tombstoneLog: [activeTombstone(restoreTombstone.subjectId, restoreTombstone.baseHash, peer)],
      retentionExpiresAtIso: EXPIRED_ISO
    }));
    var contentMissing = await preflightCase(commonPreflightArgs(archive, peer, owner, {
      contentAvailable: false
    }));
    var lifecycle = await H2O.Desktop.Sync.runSnapshotLifecycleTransitionAllowed({
      fromState: 'expired',
      toState: 'active',
      operation: 'archive'
    });
    var forbidden = H2O.Desktop.Sync.runSnapshotForbiddenFieldScan({
      subjectType: SUBJECT_TYPE,
      redactionClass: REDACTED,
      messages: ['blocked-proof-message']
    });
    var privacyBlockers = [];
    var privacyWarnings = [];
    scanPrivacy({ subjectType: SUBJECT_TYPE, redactionClass: REDACTED, snapshotId: 'raw-snapshot-proof-id' }, privacyBlockers, privacyWarnings);
    var rawSnapshotBlockers = [];
    var rawChatBlockers = [];
    var rawAccountBlockers = [];
    var modelSlugBlockers = [];
    scanPrivacy({ subjectType: SUBJECT_TYPE, redactionClass: REDACTED, snapshotId: 'snapshot-proof-raw-id' }, rawSnapshotBlockers, []);
    scanPrivacy({ subjectType: SUBJECT_TYPE, redactionClass: REDACTED, chatId: 'chat-proof-raw-id' }, rawChatBlockers, []);
    scanPrivacy({ subjectType: SUBJECT_TYPE, redactionClass: REDACTED, accountId: 'account-proof-raw-id' }, rawAccountBlockers, []);
    scanPrivacy({ subjectType: SUBJECT_TYPE, redactionClass: REDACTED, model_slug: 'gpt-proof-raw' }, modelSlugBlockers, []);

    return {
      crossAccountMismatch: blocked(crossAccount),
      staleMirror: blocked(staleMirror),
      tombstonePresent: blocked(tombstonePresent),
      replayDetected: blocked(replayDetected),
      retentionExpired: blocked(retentionExpired),
      contentMissing: blocked(contentMissing),
      invalidLifecycleTransition: blocked(lifecycle),
      forbiddenField: blocked(forbidden),
      privacyViolation: privacyBlockers.length > 0,
      rawSnapshotIdLeak: rawSnapshotBlockers.length > 0,
      rawChatIdLeak: rawChatBlockers.length > 0,
      rawAccountIdLeak: rawAccountBlockers.length > 0,
      modelSlugLeak: modelSlugBlockers.length > 0,
      details: {
        crossAccountBlockers: codeList(crossAccount && crossAccount.blockers),
        staleMirrorBlockers: codeList(staleMirror && staleMirror.blockers),
        tombstoneBlockers: codeList(tombstonePresent && tombstonePresent.blockers),
        replayBlockers: codeList(replayDetected && replayDetected.blockers),
        retentionBlockers: codeList(retentionExpired && retentionExpired.blockers),
        contentBlockers: codeList(contentMissing && contentMissing.blockers),
        lifecycleBlockers: codeList(lifecycle && lifecycle.blockers),
        forbiddenBlockers: codeList(forbidden && forbidden.blockers),
        privacyBlockers: codeList(privacyBlockers),
        rawSnapshotIdBlockers: codeList(rawSnapshotBlockers),
        rawChatIdBlockers: codeList(rawChatBlockers),
        rawAccountIdBlockers: codeList(rawAccountBlockers),
        modelSlugBlockers: codeList(modelSlugBlockers)
      }
    };
  }

  function lineageSummary(lanes) {
    var blockers = [];
    var names = Object.keys(lanes);
    var checks = {};
    names.forEach(function (name) {
      var lane = lanes[name];
      var fixture = safeObject(lane.fixture);
      var handoff = safeObject(lane.handoff);
      var receipt = safeObject(lane.receipt);
      var event = safeObject(receipt.applyEvent);
      var bookkeeping = safeObject(lane.bookkeeping);
      checks[name] = {
        proposal: cleanLower(safeObject(fixture.proposalCandidate).lineageId) === cleanLower(fixture.lineageId),
        handoff: cleanLower(handoff.lineageId) === cleanLower(fixture.lineageId),
        receipt: cleanLower(event.lineageId) === cleanLower(fixture.lineageId),
        bookkeeping: cleanLower(bookkeeping.lineageId) === cleanLower(fixture.lineageId)
      };
      if (!allValuesTrue(checks[name])) addCode(blockers, name + '-lineage-inconsistent');
    });
    return {
      ok: blockers.length === 0,
      proposal: names.every(function (name) { return checks[name].proposal === true; }),
      handoff: names.every(function (name) { return checks[name].handoff === true; }),
      receipt: names.every(function (name) { return checks[name].receipt === true; }),
      bookkeeping: names.every(function (name) { return checks[name].bookkeeping === true; }),
      lanes: checks,
      blockers: blockers,
      warnings: []
    };
  }

  function sideEffectSummary(lanes) {
    var flags = {
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
    Object.keys(lanes).forEach(function (name) {
      var summary = safeObject(safeObject(lanes[name].bookkeeping).validationSummary);
      Object.keys(flags).forEach(function (key) {
        if (summary[key] === true) flags[key] = true;
      });
      var handoffSummary = safeObject(safeObject(lanes[name].handoff).validationSummary);
      if (handoffSummary.nativeCalled === true) flags.nativeCalled = true;
      if (handoffSummary.f5Called === true) flags.f5Touched = true;
      if (handoffSummary.publicationTouched === true) flags.publicationTouched = true;
      if (handoffSummary.relayTouched === true) flags.relayTouched = true;
    });
    return Object.assign({
      ok: Object.keys(flags).every(function (key) { return flags[key] === false; })
    }, flags);
  }

  function privacySummary(result, negative) {
    var blockers = [];
    var warnings = [];
    scanPrivacy(result, blockers, warnings);
    var rawSnapshotPresent = containsRawFixture(result, 'snapshot-proof-raw-id');
    var rawChatPresent = containsRawFixture(result, 'chat-proof-raw-id');
    var rawAccountPresent = containsRawFixture(result, 'account-proof-raw-id');
    var modelSlugPresent = containsRawFixture(result, 'gpt-proof-raw');
    return {
      ok: blockers.length === 0 &&
        rawSnapshotPresent === false &&
        rawChatPresent === false &&
        rawAccountPresent === false &&
        modelSlugPresent === false &&
        negative.rawSnapshotIdLeak === true &&
        negative.rawChatIdLeak === true &&
        negative.rawAccountIdLeak === true &&
        negative.modelSlugLeak === true &&
        negative.forbiddenField === true &&
        negative.privacyViolation === true,
      forbiddenFieldBlocked: negative.forbiddenField === true,
      privacyViolationBlocked: negative.privacyViolation === true,
      rawSnapshotIdLeak: rawSnapshotPresent,
      rawChatIdLeak: rawChatPresent,
      rawAccountIdLeak: rawAccountPresent,
      modelSlugLeak: modelSlugPresent,
      blockers: blockers,
      warnings: warnings
    };
  }

  function validateProofWithKernel(proof, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateProofRecord !== 'function') {
      addCode(warnings, 'audit-proof-framework-unavailable');
      return [];
    }
    try {
      var result = kernel.validateProofRecord({
        proofId: cleanString(proof.summary && proof.summary.proofId),
        proofKind: 'snapshot-convergence-proof',
        domain: 'snapshot',
        subjectType: SUBJECT_TYPE,
        proofStatus: proof.ok ? 'passed' : 'failed',
        createdAtIso: cleanString(proof.summary && proof.summary.observedAtIso),
        checks: [
          { checkId: 'archive', checkName: 'archive lane', status: proof.archiveLane.ok ? 'passed' : 'failed' },
          { checkId: 'tombstone', checkName: 'tombstone lane', status: proof.tombstoneLane.ok ? 'passed' : 'failed' },
          { checkId: 'restore-archive', checkName: 'restore archive lane', status: proof.restoreArchiveLane.ok ? 'passed' : 'failed' },
          { checkId: 'restore-tombstone', checkName: 'restore tombstone lane', status: proof.restoreTombstoneLane.ok ? 'passed' : 'failed' }
        ]
      }, {
        allowedDomains: ['snapshot'],
        allowedProofStatuses: ['passed', 'failed'],
        requireProofId: true,
        requireSubject: false,
        requireTimestamp: true,
        requireChecks: true,
        privacyPolicy: {
          subjectType: SUBJECT_TYPE,
          redactionClass: REDACTED,
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        }
      });
      codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
      return codeList(result && result.blockers);
    } catch (_) {
      addCode(warnings, 'proof-record-validation-threw');
      return [];
    }
  }

  function blockedResult(blockers, warnings) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      archiveLane: { ok: false },
      tombstoneLane: { ok: false },
      restoreArchiveLane: { ok: false },
      restoreTombstoneLane: { ok: false },
      privacy: { ok: false },
      lineage: { ok: false },
      sideEffects: { ok: false },
      negativeCases: {},
      summary: {
        proofId: '',
        positiveLaneCount: 0,
        negativeGateCount: 0,
        rawLeakDetected: false
      },
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }

  async function runSnapshotConvergenceProof() {
    var blockers = [];
    var warnings = [];
    var deps = dependencyChecks();
    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (!deps.ok) {
      deps.missing.forEach(function (name) { addCode(blockers, 'dependency-missing-' + name); });
      return blockedResult(blockers, warnings);
    }

    var peer = await actorPeer();
    var nativeDeclaration = await nativeOwner(peer);
    var f5Declaration = await f5Owner(peer);

    var archive = await runArchiveLane(peer, nativeDeclaration);
    var tombstone = await runTombstoneLane(peer, f5Declaration);
    var restoreArchive = await runRestoreArchiveLane(peer, nativeDeclaration);
    var restoreTombstone = await runRestoreTombstoneLane(peer, nativeDeclaration);
    var f5QueueIntegration = await runF5QueueIntegrationLane(peer, f5Declaration);
    var lanes = {
      archive: archive,
      tombstone: tombstone,
      restoreArchive: restoreArchive,
      restoreTombstone: restoreTombstone,
      f5QueueIntegration: f5QueueIntegration
    };
    var negative = await negativeCases(lanes, peer, nativeDeclaration);
    var negativeBooleans = {
      crossAccountMismatch: negative.crossAccountMismatch,
      staleMirror: negative.staleMirror,
      tombstonePresent: negative.tombstonePresent,
      replayDetected: negative.replayDetected,
      retentionExpired: negative.retentionExpired,
      contentMissing: negative.contentMissing,
      invalidLifecycleTransition: negative.invalidLifecycleTransition,
      forbiddenField: negative.forbiddenField,
      privacyViolation: negative.privacyViolation,
      rawSnapshotIdLeak: negative.rawSnapshotIdLeak,
      rawChatIdLeak: negative.rawChatIdLeak,
      rawAccountIdLeak: negative.rawAccountIdLeak,
      modelSlugLeak: negative.modelSlugLeak
    };
    var lineage = lineageSummary(lanes);
    var sideEffects = sideEffectSummary(lanes);
    var partial = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      archiveLane: archive.summary,
      tombstoneLane: tombstone.summary,
      restoreArchiveLane: restoreArchive.summary,
      restoreTombstoneLane: restoreTombstone.summary,
      f5QueueIntegrationLane: f5QueueIntegration.summary,
      lineage: lineage,
      sideEffects: sideEffects,
      negativeCases: negative,
      summary: {
        proofId: generateUuid(),
        observedAtIso: nowIsoSeconds()
      }
    };
    var privacy = privacySummary(partial, negative);

    [
      archive.summary,
      tombstone.summary,
      restoreArchive.summary,
      restoreTombstone.summary,
      f5QueueIntegration.summary,
      lineage,
      privacy
    ].forEach(function (item) {
      codeList(item && item.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(item && item.warnings).forEach(function (code) { addCode(warnings, code); });
    });
    if (!allValuesTrue(negativeBooleans)) addCode(blockers, 'negative-gates-not-all-blocked');
    if (!sideEffects.ok) addCode(blockers, 'snapshot-proof-side-effect-flag-set');
    if (!lineage.ok) addCode(blockers, 'snapshot-proof-lineage-inconsistent');
    if (!privacy.ok) addCode(blockers, 'snapshot-proof-privacy-check-failed');

    var ok = blockers.length === 0 &&
      archive.summary.ok === true &&
      tombstone.summary.ok === true &&
      restoreArchive.summary.ok === true &&
      restoreTombstone.summary.ok === true &&
      f5QueueIntegration.summary.ok === true &&
      allValuesTrue(negativeBooleans) &&
      lineage.ok === true &&
      sideEffects.ok === true &&
      privacy.ok === true;

    var result = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      archiveLane: archive.summary,
      tombstoneLane: tombstone.summary,
      restoreArchiveLane: restoreArchive.summary,
      restoreTombstoneLane: restoreTombstone.summary,
      f5QueueIntegrationLane: f5QueueIntegration.summary,
      privacy: privacy,
      lineage: lineage,
      sideEffects: sideEffects,
      negativeCases: negative,
      summary: {
        proofId: partial.summary.proofId,
        observedAtIso: partial.summary.observedAtIso,
        positiveLaneCount: [
          archive.summary.ok,
          tombstone.summary.ok,
          restoreArchive.summary.ok,
          restoreTombstone.summary.ok,
          f5QueueIntegration.summary.ok
        ].filter(Boolean).length,
        negativeGateCount: Object.keys(negativeBooleans).filter(function (key) { return negativeBooleans[key] === true; }).length,
        expectedNegativeGateCount: Object.keys(negativeBooleans).length,
        proposalLineageConsistent: lineage.proposal === true,
        handoffLineageConsistent: lineage.handoff === true,
        receiptLineageConsistent: lineage.receipt === true,
        bookkeepingLineageConsistent: lineage.bookkeeping === true,
        rawLeakDetected: privacy.rawSnapshotIdLeak === true ||
          privacy.rawChatIdLeak === true ||
          privacy.rawAccountIdLeak === true ||
          privacy.modelSlugLeak === true,
        publicationTouched: sideEffects.publicationTouched,
        relayTouched: sideEffects.relayTouched,
        outboxTouched: sideEffects.outboxTouched,
        nativeCalled: sideEffects.nativeCalled,
        f5Touched: sideEffects.f5Touched,
        watermarkWritten: sideEffects.watermarkWritten,
        consumedOperationWritten: sideEffects.consumedOperationWritten
      },
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
    var kernelBlockers = validateProofWithKernel(result, warnings);
    kernelBlockers.forEach(function (code) { addCode(blockers, code); });
    result.blockers = codeList(blockers);
    result.warnings = codeList(warnings);
    result.ok = result.ok && result.blockers.length === 0;
    return result;
  }

  H2O.Desktop.Sync.runSnapshotConvergenceProof = runSnapshotConvergenceProof;
  H2O.Desktop.Sync.__snapshotProofInstalled = true;
  H2O.Desktop.Sync.__snapshotProofVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
