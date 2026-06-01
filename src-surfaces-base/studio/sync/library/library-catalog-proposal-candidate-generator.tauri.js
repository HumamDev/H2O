/* H2O Desktop Sync - F15.4.a library catalog proposal candidate generator
 *
 * Desktop/Tauri-only pure proposal candidate generation for library.catalog.
 *
 * Public API:
 *   H2O.Desktop.Sync.generateLibraryCatalogProposalCandidate(input)
 *   H2O.Desktop.Sync.proposeLibraryCatalogCreate(input)
 *   H2O.Desktop.Sync.proposeLibraryCatalogRename(input)
 *   H2O.Desktop.Sync.proposeLibraryCatalogRecolor(input)
 *   H2O.Desktop.Sync.proposeLibraryCatalogArchive(input)
 *   H2O.Desktop.Sync.proposeLibraryCatalogRestoreFromArchived(input)
 *   H2O.Desktop.Sync.proposeLibraryCatalogTombstone(input)
 *   H2O.Desktop.Sync.proposeLibraryCatalogRestoreFromRetained(input)
 *   H2O.Desktop.Sync.__libraryCatalogProposalInstalled
 *   H2O.Desktop.Sync.__libraryCatalogProposalVersion
 *
 * Safety invariants:
 *   - Candidate generation only.
 *   - No storage reads/writes, publication ledger writes, relay/outbox,
 *     Native calls, F5 execution, apply, watermark writes, consumed-op writes,
 *     store-layer rewiring, or Labels/Categories/Tags mutation.
 *   - Raw catalog names, colors, ids, account ids, chat titles, content,
 *     paths, URLs, and tokens are never emitted in generated envelopes.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__libraryCatalogProposalInstalled) return;

  var VERSION = '0.1.0-f15.4.catalog';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-catalog-proposal-candidate-generator.v1';
  var PROPOSAL_SCHEMA = 'h2o.desktop.sync.library-catalog-proposal.v1';
  var CANDIDATE_SCHEMA = 'h2o.desktop.sync.library-catalog-proposal-candidate.v1';
  var SUBJECT_TYPE = 'library.catalog';
  var ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var OPERATION_META = {
    create: {
      proposalOperation: 'library-catalog-create-proposed',
      operationIntent: 'create',
      targetLifecycleState: 'active',
      predicateVersion: 'h2o.library.catalog.create.predicate.v1',
      f5ReviewNeededLater: false
    },
    rename: {
      proposalOperation: 'library-catalog-rename-proposed',
      operationIntent: 'update',
      targetLifecycleState: null,
      predicateVersion: 'h2o.library.catalog.rename.predicate.v1',
      f5ReviewNeededLater: false
    },
    recolor: {
      proposalOperation: 'library-catalog-recolor-proposed',
      operationIntent: 'update',
      targetLifecycleState: null,
      predicateVersion: 'h2o.library.catalog.recolor.predicate.v1',
      f5ReviewNeededLater: false
    },
    archive: {
      proposalOperation: 'library-catalog-archive-proposed',
      operationIntent: 'update',
      targetLifecycleState: 'archived',
      predicateVersion: 'h2o.library.catalog.archive.predicate.v1',
      f5ReviewNeededLater: false
    },
    'restore-from-archived': {
      proposalOperation: 'library-catalog-restore-from-archived-proposed',
      operationIntent: 'update',
      targetLifecycleState: 'active',
      predicateVersion: 'h2o.library.catalog.restore-from-archived.predicate.v1',
      f5ReviewNeededLater: false
    },
    tombstone: {
      proposalOperation: 'library-catalog-tombstone-proposed',
      operationIntent: 'delete',
      targetLifecycleState: 'retained',
      predicateVersion: 'h2o.library.catalog.tombstone.predicate.v1',
      f5ReviewNeededLater: true
    },
    'restore-from-retained': {
      proposalOperation: 'library-catalog-restore-from-retained-proposed',
      operationIntent: 'update',
      targetLifecycleState: 'active',
      predicateVersion: 'h2o.library.catalog.restore-from-retained.predicate.v1',
      f5ReviewNeededLater: false
    }
  };

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function isSha256Hex(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return typeof value === 'string' && SHA256_RE.test(value);
  }

  function getSync() {
    return (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
  }

  function getKernel() {
    return getSync().kernel || null;
  }

  function sideEffectSummary() {
    return {
      storageWritten: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
  }

  function addEntry(list, code, severity, metadata) {
    var normalized = cleanString(code);
    if (!normalized) return;
    var sev = cleanString(severity) || 'blocker';
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized && list[i].severity === sev) return;
    }
    var entry = { code: normalized, severity: sev };
    if (isObject(metadata)) entry.metadata = metadata;
    list.push(entry);
  }

  function addBlocker(list, code, metadata) {
    addEntry(list, code, 'blocker', metadata);
  }

  function addWarning(list, code, metadata) {
    addEntry(list, code, 'warning', metadata);
  }

  function mergeEntries(into, from, severity) {
    asArray(from).forEach(function (entry) {
      if (isObject(entry)) addEntry(into, entry.code, entry.severity || severity || 'warning', entry.metadata);
      else addEntry(into, entry, severity || 'warning');
    });
  }

  function codeList(entries) {
    return asArray(entries).map(function (entry) {
      return isObject(entry) ? cleanString(entry.code) : cleanString(entry);
    }).filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
  }

  function canonicalJson(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.canonicalJSON === 'function') return kernel.canonicalJSON(value);
    return JSON.stringify(canonicalize(value));
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

  async function sha256Hex(value) {
    var kernel = getKernel();
    if (!kernel || typeof kernel.sha256Hex !== 'function') return '';
    try {
      var digest = await kernel.sha256Hex(value);
      return isSha256Hex(digest) ? cleanLower(digest) : '';
    } catch (_) {
      return '';
    }
  }

  function operationFromInput(input, fixedOperation) {
    var op = cleanString(fixedOperation) || cleanString(safeObject(input).operation);
    return Object.prototype.hasOwnProperty.call(OPERATION_META, op) ? op : '';
  }

  function catalogFromPreflight(preflight) {
    if (!isObject(preflight)) return null;
    if (isObject(preflight.canonicalCatalog)) return preflight.canonicalCatalog;
    if (isObject(preflight.canonical)) return preflight.canonical;
    return null;
  }

  function scanDomain(domainTag, target, redactionClass, blockers, warnings, blockerCode) {
    var kernel = getKernel();
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') {
      addBlocker(blockers, blockerCode || 'library-catalog-proposal-privacy-failed', {
        reason: 'domain-forbidden-scanner-unavailable'
      });
      return false;
    }
    var scanTarget = isObject(target)
      ? Object.assign({}, target, { redactionClass: redactionClass || 'redacted' })
      : target;
    var scan = kernel.scanDomainForbiddenFields(domainTag, scanTarget);
    mergeEntries(blockers, scan && scan.blockers, 'blocker');
    mergeEntries(warnings, scan && scan.warnings, 'warning');
    if (!scan || scan.ok !== true) {
      addBlocker(blockers, blockerCode || 'library-catalog-proposal-privacy-failed');
      return false;
    }
    return true;
  }

  function validateActorPeer(peer) {
    return isSha256Hex(peer && peer.physicalDeviceIdHash) &&
      isSha256Hex(peer && peer.installIdHash) &&
      isSha256Hex(peer && peer.syncPeerIdHash);
  }

  async function resolveActorPeer(input, blockers) {
    var source = safeObject(input);
    var supplied = safeObject(source.actorPeer || source.sourcePeerEnvelope);
    if (validateActorPeer(supplied)) {
      return {
        physicalDeviceIdHash: cleanLower(supplied.physicalDeviceIdHash),
        installIdHash: cleanLower(supplied.installIdHash),
        syncPeerIdHash: cleanLower(supplied.syncPeerIdHash)
      };
    }

    var identity = H2O.Studio && H2O.Studio.identity;
    var raw = null;
    try {
      if (identity && typeof identity.get === 'function') raw = identity.get();
    } catch (_) {
      raw = null;
    }
    if (!isObject(raw)) {
      addBlocker(blockers, 'invalid-peer-identity');
      return null;
    }

    var peer = {
      physicalDeviceIdHash: cleanString(raw.physicalDeviceIdHash) || await sha256Hex(cleanString(raw.physicalDeviceId)),
      installIdHash: cleanString(raw.installIdHash) || await sha256Hex(cleanString(raw.installId)),
      syncPeerIdHash: cleanString(raw.syncPeerIdHash) || await sha256Hex(cleanString(raw.syncPeerId))
    };
    if (!validateActorPeer(peer)) {
      addBlocker(blockers, 'invalid-peer-identity');
      return null;
    }
    return {
      physicalDeviceIdHash: cleanLower(peer.physicalDeviceIdHash),
      installIdHash: cleanLower(peer.installIdHash),
      syncPeerIdHash: cleanLower(peer.syncPeerIdHash)
    };
  }

  function lifecycleBooleans(lifecycleState) {
    var state = cleanString(lifecycleState);
    return {
      archived: state === 'archived',
      tombstoned: state === 'tombstoned'
    };
  }

  function expectedCurrentState(operation, catalog, baseHash, currentLifecycleState) {
    if (operation === 'create') {
      return {
        subjectType: SUBJECT_TYPE,
        lifecycleState: 'absent',
        absent: true,
        revisionHash: ZERO_HASH
      };
    }
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(catalog.subjectId),
      catalogKind: cleanString(catalog.catalogKind),
      lifecycleState: cleanString(currentLifecycleState || catalog.lifecycleState),
      revisionHash: cleanLower(baseHash),
      originAccountIdHash: cleanLower(catalog.originAccountIdHash),
      sourceTagHash: cleanLower(catalog.sourceTagHash)
    };
  }

  function expectedTargetState(operation, meta, catalog, preflight) {
    var state = cleanString(safeObject(preflight.preflight).targetLifecycleState) ||
      cleanString(meta.targetLifecycleState) ||
      cleanString(catalog.lifecycleState);
    var booleans = lifecycleBooleans(state);
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(catalog.subjectId),
      catalogKind: cleanString(catalog.catalogKind),
      lifecycleState: state,
      archived: booleans.archived,
      tombstoned: booleans.tombstoned,
      nameHash: cleanLower(catalog.nameHash),
      colorHash: catalog.colorHash ? cleanLower(catalog.colorHash) : null,
      displayOrder: typeof catalog.displayOrder === 'number' ? catalog.displayOrder : 0,
      iconHint: cleanString(catalog.iconHint) || null,
      originAccountIdHash: cleanLower(catalog.originAccountIdHash),
      schemaVersion: cleanString(catalog.schemaVersion),
      retentionExpiresAtIso: cleanString(catalog.retentionExpiresAtIso) || null,
      sourceTagHash: cleanLower(catalog.sourceTagHash),
      f5ReviewNeededLater: operation === 'tombstone' && meta.f5ReviewNeededLater === true
    };
  }

  async function targetHashFor(targetState, blockers) {
    var targetHash = await sha256Hex({
      schema: 'h2o.desktop.sync.library-catalog-proposal-target-state.v1',
      targetState: targetState
    });
    if (!isSha256Hex(targetHash)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid', {
      reason: 'target-hash-generation-failed'
    });
    return targetHash;
  }

  async function buildIdentity(input) {
    var kernel = getKernel();
    var blockers = [];
    var warnings = [];
    var actorPeer = safeObject(input.actorPeer);
    var subjectId = cleanLower(input.subjectId);
    var baseHash = cleanLower(input.baseHash);
    var identityOperation = cleanString(input.identityOperation);

    if (!kernel ||
        typeof kernel.generateDedupeKey !== 'function' ||
        typeof kernel.generateLineageId !== 'function') {
      addBlocker(blockers, 'kernel-identity-kit-unavailable');
      return { blockers: blockers, warnings: warnings };
    }

    var dedupe = await kernel.generateDedupeKey({
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: identityOperation,
      baseHash: baseHash,
      actorPeer: actorPeer
    });
    mergeEntries(blockers, dedupe && dedupe.blockers, 'blocker');
    mergeEntries(warnings, dedupe && dedupe.warnings, 'warning');
    var dedupeKey = cleanLower(dedupe && dedupe.dedupeKey);
    if (!isSha256Hex(dedupeKey)) addBlocker(blockers, 'dedupe-key-generation-failed');

    var lineage = await kernel.generateLineageId({
      deterministic: true,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: identityOperation,
      baseHash: baseHash,
      actorPeer: actorPeer
    });
    mergeEntries(blockers, lineage && lineage.blockers, 'blocker');
    mergeEntries(warnings, lineage && lineage.warnings, 'warning');
    var lineageId = cleanLower(lineage && lineage.lineageId);
    if (!isSha256Hex(lineageId)) addBlocker(blockers, 'lineage-id-generation-failed');

    return {
      subjectId: subjectId,
      dedupeKey: dedupeKey,
      lineageId: lineageId,
      blockers: blockers,
      warnings: warnings
    };
  }

  async function operationIdFor(input, blockers) {
    var operationId = await sha256Hex({
      schema: 'h2o.desktop.sync.library-catalog-operation-id.v1',
      subjectType: SUBJECT_TYPE,
      subjectId: input.subjectId,
      operation: input.proposalOperation,
      operationIntent: input.operationIntent,
      baseHash: input.baseHash,
      targetHash: input.targetHash,
      dedupeKey: input.dedupeKey
    });
    if (!isSha256Hex(operationId)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid', {
      reason: 'operation-id-generation-failed'
    });
    return operationId;
  }

  function shapeWithKernel(method, fallback) {
    var kernel = getKernel();
    if (kernel && typeof kernel[method] === 'function') {
      try { return kernel[method](fallback); } catch (_) { /* fall through */ }
    }
    return fallback;
  }

  function summarizePreflight(preflight) {
    var p = safeObject(preflight);
    var pf = safeObject(p.preflight);
    return {
      ok: p.ok === true,
      actionable: p.actionable === true,
      operation: cleanString(p.operation),
      currentLifecycleState: cleanString(pf.currentLifecycleState),
      targetLifecycleState: cleanString(pf.targetLifecycleState),
      lifecycleTransitionAllowed: pf.lifecycleTransitionAllowed === true,
      tombstoneF5Eligible: pf.tombstoneF5Eligible === true,
      blockers: codeList(p.blockers),
      warnings: codeList(p.warnings)
    };
  }

  function sanitizeRelatedSubject(value) {
    var source = safeObject(value);
    var out = {};
    [
      'subjectType',
      'subjectId',
      'revisionHash',
      'relationship',
      'relation',
      'catalogKind',
      'bindingKind',
      'leftSubjectId',
      'rightSubjectId',
      'leftSubjectType',
      'rightSubjectType',
      'lifecycleState',
      'bindingState',
      'originAccountIdHash',
      'sourceTagHash'
    ].forEach(function (key) {
      if (typeof source[key] !== 'undefined' && source[key] !== null) out[key] = source[key];
    });
    return out;
  }

  function summarizeCanonicalCatalog(catalog) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(catalog.subjectId),
      revisionHash: cleanLower(catalog.revisionHash),
      catalogKind: cleanString(catalog.catalogKind),
      lifecycleState: cleanString(catalog.lifecycleState),
      nameHash: cleanLower(catalog.nameHash),
      colorHash: catalog.colorHash ? cleanLower(catalog.colorHash) : null,
      originAccountIdHash: cleanLower(catalog.originAccountIdHash),
      sourceTag: cleanString(catalog.sourceTag),
      sourceTagHash: cleanLower(catalog.sourceTagHash),
      schemaVersion: cleanString(catalog.schemaVersion)
    };
  }

  function buildLifecycleShapes(input) {
    var originTag = shapeWithKernel('shapeOriginTag', {
      originKind: 'proposal',
      sourcePeerId: cleanLower(input.actorPeer.syncPeerIdHash),
      sourcePlatform: 'desktop-tauri',
      envelopeKind: 'proposal',
      operationKind: input.proposalOperation,
      lineageId: input.lineageId,
      eventDigest: input.operationId,
      dedupeKey: input.dedupeKey
    });
    var lifecycleTransition = shapeWithKernel('shapeLifecycleTransition', {
      domain: SUBJECT_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: input.subjectId,
      transitionName: input.operation,
      fromState: input.expectedCurrentState.lifecycleState,
      toState: input.expectedTargetState.lifecycleState,
      lineageId: input.lineageId,
      eventDigest: input.operationId,
      dedupeKey: input.dedupeKey,
      actorPeer: input.actorPeer,
      reasonCode: 'library-catalog-proposal-candidate',
      requestedAtIso: input.observedAtIso,
      transitionedAtIso: input.observedAtIso,
      metadata: {
        operation: input.proposalOperation,
        operationIntent: input.operationIntent,
        previewOnly: true
      }
    });
    var lifecycleState = shapeWithKernel('shapeLifecycleState', {
      domain: SUBJECT_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: input.subjectId,
      state: input.expectedTargetState.lifecycleState,
      lineageId: input.lineageId,
      eventDigest: input.operationId,
      dedupeKey: input.dedupeKey,
      ownerKind: 'proposal',
      enteredAtIso: input.observedAtIso,
      metadata: {
        operation: input.proposalOperation,
        previewOnly: true
      }
    });
    var proposedWatermark = shapeWithKernel('shapeWatermark', {
      peerId: cleanLower(input.actorPeer.syncPeerIdHash),
      subjectId: input.subjectId,
      lineageId: input.lineageId,
      revisionHash: input.targetHash,
      watermarkAtIso: input.observedAtIso,
      recordedAtIso: input.observedAtIso,
      dedupeKey: input.dedupeKey
    });
    var watermarkState = shapeWithKernel('shapeWatermarkState', {
      proposedWatermark: proposedWatermark,
      allowIdempotent: true
    });
    var replayCandidate = shapeWithKernel('shapeReplayCandidate', {
      subjectType: SUBJECT_TYPE,
      subjectId: input.subjectId,
      operation: input.proposalOperation,
      operationKind: 'library.catalog.' + input.operation + '.proposal',
      operationIntent: input.operationIntent,
      baseHash: input.baseHash,
      targetHash: input.targetHash,
      revisionHash: input.targetHash,
      lineageId: input.lineageId,
      eventDigest: input.operationId,
      dedupeKey: input.dedupeKey,
      actorPeer: input.actorPeer,
      originTag: originTag,
      metadata: {
        domain: SUBJECT_TYPE,
        catalogKind: input.catalogKind,
        targetLifecycleState: input.expectedTargetState.lifecycleState,
        previewOnly: true
      }
    });
    var publicationMetadata = shapeWithKernel('shapePublicationMetadata', {
      candidateKind: 'proposal',
      candidateRowId: input.operationId,
      envelopeId: input.operationId,
      lineageId: input.lineageId,
      subjectId: input.subjectId,
      eventDigest: input.operationId,
      dedupeKey: input.dedupeKey,
      sourceLedgerKey: '',
      actorPeer: input.actorPeer,
      publicationStatus: 'generated',
      relayStatus: '',
      createdAtIso: input.observedAtIso,
      domain: SUBJECT_TYPE,
      metadata: {
        previewOnly: true,
        storageWritten: false
      }
    });
    return {
      originTag: originTag,
      replayCandidate: replayCandidate,
      lifecycleState: lifecycleState,
      lifecycleTransition: lifecycleTransition,
      proposedWatermark: proposedWatermark,
      watermarkState: watermarkState,
      publicationMetadata: publicationMetadata
    };
  }

  function validateProposalShape(proposal, candidate, blockers) {
    if (!proposal || proposal.schema !== PROPOSAL_SCHEMA) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (!candidate || candidate.schema !== CANDIDATE_SCHEMA) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && proposal.kind !== 'proposal') addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && proposal.subjectType !== SUBJECT_TYPE) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && proposal.redactionClass !== 'redacted') addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.subjectId)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.dedupeKey)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.operationId)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.baseHash)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.targetHash)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
    if (proposal && proposal.sideEffectSummary) {
      Object.keys(proposal.sideEffectSummary).forEach(function (key) {
        if (proposal.sideEffectSummary[key] !== false) addBlocker(blockers, 'library-catalog-proposal-shape-invalid');
      });
    }
  }

  function failure(operation, blockers, warnings, extra) {
    return Object.assign({
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      status: 'blocked',
      generated: false,
      noop: false,
      operation: cleanString(operation),
      proposal: null,
      candidate: null,
      canonicalCatalog: null,
      preflight: null,
      diagnostics: {},
      subjectId: '',
      lineageId: '',
      dedupeKey: '',
      operationId: '',
      baseHash: '',
      targetHash: '',
      revisionHash: '',
      expectedCurrentState: null,
      expectedTargetState: null,
      operationIntent: '',
      originAccountIdHash: '',
      actorPeer: null,
      sourceTag: '',
      sourceTagHash: '',
      relatedSubjects: [],
      blockers: asArray(blockers),
      warnings: asArray(warnings),
      observedAtIso: nowIsoSeconds(),
      sideEffectSummary: sideEffectSummary()
    }, isObject(extra) ? extra : {});
  }

  function success(fields) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      status: 'generated',
      generated: true,
      noop: false,
      operation: fields.operation,
      proposal: fields.proposal,
      candidate: fields.candidate,
      canonicalCatalog: fields.canonicalCatalog,
      preflight: fields.preflight,
      diagnostics: fields.diagnostics,
      subjectId: fields.subjectId,
      lineageId: fields.lineageId,
      dedupeKey: fields.dedupeKey,
      operationId: fields.operationId,
      baseHash: fields.baseHash,
      targetHash: fields.targetHash,
      revisionHash: fields.targetHash,
      expectedCurrentState: fields.expectedCurrentState,
      expectedTargetState: fields.expectedTargetState,
      operationIntent: fields.operationIntent,
      originAccountIdHash: fields.originAccountIdHash,
      actorPeer: fields.actorPeer,
      sourceTag: fields.sourceTag,
      sourceTagHash: fields.sourceTagHash,
      relatedSubjects: fields.relatedSubjects,
      blockers: [],
      warnings: fields.warnings,
      observedAtIso: fields.observedAtIso,
      sideEffectSummary: sideEffectSummary()
    };
  }

  async function runPreflight(input, operation, blockers, warnings) {
    if (typeof H2O.Desktop.Sync.preflightLibraryCatalog !== 'function') {
      addBlocker(blockers, 'library-catalog-preflight-not-ok', { reason: 'preflight-unavailable' });
      return null;
    }
    try {
      return await H2O.Desktop.Sync.preflightLibraryCatalog(Object.assign({}, input, { operation: operation }));
    } catch (_) {
      addBlocker(blockers, 'library-catalog-preflight-not-ok', { reason: 'preflight-threw' });
      return null;
    }
  }

  function baseHashFrom(input, catalog, operation, blockers) {
    if (operation === 'create') return ZERO_HASH;
    var explicit = cleanLower(input.baseHash || input.currentRevisionHash || input.expectedCurrentRevisionHash);
    var baseHash = explicit || cleanLower(catalog.revisionHash);
    if (!isSha256Hex(baseHash)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid', {
      reason: 'base-hash-invalid'
    });
    return baseHash;
  }

  async function generateLibraryCatalogProposalCandidate(input) {
    var args = safeObject(input);
    var operation = operationFromInput(args);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();

    if (!isObject(input)) addBlocker(blockers, 'library-catalog-proposal-shape-invalid', { reason: 'input-not-object' });
    if (!operation) addBlocker(blockers, 'library-catalog-proposal-shape-invalid', { reason: 'operation-not-supported' });
    if (blockers.length) return failure(operation, blockers, warnings, { observedAtIso: observedAtIso });

    scanDomain(SUBJECT_TYPE, args, 'device-local', blockers, warnings, 'library-catalog-proposal-privacy-failed');
    if (blockers.length) return failure(operation, blockers, warnings, { observedAtIso: observedAtIso });

    var preflight = await runPreflight(args, operation, blockers, warnings);
    if (preflight) {
      mergeEntries(warnings, preflight.warnings, 'warning');
      scanDomain(SUBJECT_TYPE, preflight, 'redacted', blockers, warnings, 'library-catalog-proposal-privacy-failed');
    }
    if (blockers.length) return failure(operation, blockers, warnings, {
      preflight: preflight,
      diagnostics: safeObject(preflight && preflight.diagnostics),
      observedAtIso: observedAtIso
    });
    if (!preflight || preflight.ok !== true) {
      mergeEntries(blockers, preflight && preflight.blockers, 'blocker');
      addBlocker(blockers, 'library-catalog-preflight-not-ok');
      return failure(operation, blockers, warnings, {
        preflight: preflight,
        diagnostics: safeObject(preflight && preflight.diagnostics),
        observedAtIso: observedAtIso
      });
    }
    if (preflight.actionable !== true) {
      mergeEntries(blockers, preflight.blockers, 'blocker');
      addBlocker(blockers, 'library-catalog-preflight-not-actionable');
      return failure(operation, blockers, warnings, {
        preflight: preflight,
        diagnostics: safeObject(preflight.diagnostics),
        observedAtIso: observedAtIso
      });
    }

    var catalog = catalogFromPreflight(preflight);
    if (!catalog || !isSha256Hex(catalog.subjectId) || !isSha256Hex(catalog.revisionHash)) {
      addBlocker(blockers, 'library-catalog-proposal-shape-invalid', { reason: 'canonical-catalog-invalid' });
      return failure(operation, blockers, warnings, {
        preflight: preflight,
        diagnostics: safeObject(preflight.diagnostics),
        observedAtIso: observedAtIso
      });
    }

    var meta = OPERATION_META[operation];
    var baseHash = baseHashFrom(args, catalog, operation, blockers);
    var currentState = expectedCurrentState(
      operation,
      catalog,
      baseHash,
      safeObject(preflight.preflight).currentLifecycleState
    );
    var targetState = expectedTargetState(operation, meta, catalog, preflight);
    var targetHash = await targetHashFor(targetState, blockers);
    if (blockers.length) return failure(operation, blockers, warnings, {
      canonicalCatalog: catalog,
      preflight: preflight,
      diagnostics: safeObject(preflight.diagnostics),
      observedAtIso: observedAtIso
    });

    var actorPeer = await resolveActorPeer(args, blockers);
    if (blockers.length || !actorPeer) return failure(operation, blockers, warnings, {
      canonicalCatalog: catalog,
      preflight: preflight,
      diagnostics: safeObject(preflight.diagnostics),
      observedAtIso: observedAtIso
    });

    var identityOperation = meta.proposalOperation + ':' + targetHash;
    var identity = await buildIdentity({
      subjectId: cleanLower(catalog.subjectId),
      baseHash: baseHash,
      identityOperation: identityOperation,
      actorPeer: actorPeer
    });
    mergeEntries(blockers, identity.blockers, 'blocker');
    mergeEntries(warnings, identity.warnings, 'warning');
    if (blockers.length) return failure(operation, blockers, warnings, {
      canonicalCatalog: catalog,
      preflight: preflight,
      diagnostics: safeObject(preflight.diagnostics),
      observedAtIso: observedAtIso
    });

    var operationId = await operationIdFor({
      subjectId: identity.subjectId,
      proposalOperation: meta.proposalOperation,
      operationIntent: meta.operationIntent,
      baseHash: baseHash,
      targetHash: targetHash,
      dedupeKey: identity.dedupeKey
    }, blockers);
    if (blockers.length) return failure(operation, blockers, warnings, {
      canonicalCatalog: catalog,
      preflight: preflight,
      diagnostics: safeObject(preflight.diagnostics),
      observedAtIso: observedAtIso
    });

    var relatedSubjects = asArray(preflight.relatedSubjects).map(sanitizeRelatedSubject);
    var shapeInput = {
      operation: operation,
      proposalOperation: meta.proposalOperation,
      operationIntent: meta.operationIntent,
      subjectId: identity.subjectId,
      lineageId: identity.lineageId,
      dedupeKey: identity.dedupeKey,
      operationId: operationId,
      baseHash: baseHash,
      targetHash: targetHash,
      expectedCurrentState: currentState,
      expectedTargetState: targetState,
      actorPeer: actorPeer,
      observedAtIso: observedAtIso,
      catalogKind: cleanString(catalog.catalogKind)
    };
    var kernelShapes = buildLifecycleShapes(shapeInput);

    var proposal = {
      schema: PROPOSAL_SCHEMA,
      version: VERSION,
      kind: 'proposal',
      subjectType: SUBJECT_TYPE,
      redactionClass: 'redacted',
      operation: meta.proposalOperation,
      domainOperation: operation,
      operationIntent: meta.operationIntent,
      subjectId: identity.subjectId,
      lineageId: identity.lineageId,
      dedupeKey: identity.dedupeKey,
      operationId: operationId,
      revisionHash: targetHash,
      baseHash: baseHash,
      targetHash: targetHash,
      expectedCurrentState: currentState,
      expectedTargetState: targetState,
      lifecycleTransition: kernelShapes.lifecycleTransition,
      predicateVersion: meta.predicateVersion,
      originAccountIdHash: cleanLower(catalog.originAccountIdHash),
      actorPeer: actorPeer,
      sourceTag: cleanString(catalog.sourceTag),
      sourceTagHash: cleanLower(catalog.sourceTagHash),
      relatedSubjects: relatedSubjects,
      f5ReviewNeededLater: meta.f5ReviewNeededLater === true,
      previewOnly: true,
      sideEffectSummary: sideEffectSummary()
    };

    var candidate = {
      schema: CANDIDATE_SCHEMA,
      version: VERSION,
      status: 'generated',
      generated: true,
      candidateId: operationId,
      kind: 'proposal',
      subjectType: SUBJECT_TYPE,
      redactionClass: 'redacted',
      operation: meta.proposalOperation,
      domainOperation: operation,
      operationIntent: meta.operationIntent,
      subjectId: identity.subjectId,
      lineageId: identity.lineageId,
      dedupeKey: identity.dedupeKey,
      operationId: operationId,
      revisionHash: targetHash,
      baseHash: baseHash,
      targetHash: targetHash,
      expectedCurrentState: currentState,
      expectedTargetState: targetState,
      lifecycleState: kernelShapes.lifecycleState,
      lifecycleTransition: kernelShapes.lifecycleTransition,
      originTag: kernelShapes.originTag,
      replayCandidate: kernelShapes.replayCandidate,
      proposedWatermark: kernelShapes.proposedWatermark,
      watermarkState: kernelShapes.watermarkState,
      publicationMetadata: kernelShapes.publicationMetadata,
      predicateVersion: meta.predicateVersion,
      originAccountIdHash: cleanLower(catalog.originAccountIdHash),
      actorPeer: actorPeer,
      sourceTag: cleanString(catalog.sourceTag),
      sourceTagHash: cleanLower(catalog.sourceTagHash),
      relatedSubjects: relatedSubjects,
      f5ReviewNeededLater: meta.f5ReviewNeededLater === true,
      canonicalCatalogSummary: summarizeCanonicalCatalog(catalog),
      preflightSummary: summarizePreflight(preflight),
      validationSummary: {
        preflightOk: preflight.ok === true,
        preflightActionable: preflight.actionable === true,
        privacyOk: true,
        publicationTouched: false,
        relayTouched: false,
        nativeCalled: false,
        f5Touched: false,
        watermarkWritten: false,
        consumedOperationWritten: false
      },
      proposal: proposal,
      previewOnly: true,
      sideEffectSummary: sideEffectSummary()
    };

    validateProposalShape(proposal, candidate, blockers);
    scanDomain(SUBJECT_TYPE, proposal, 'redacted', blockers, warnings, 'library-catalog-proposal-privacy-failed');
    scanDomain(SUBJECT_TYPE, candidate, 'redacted', blockers, warnings, 'library-catalog-proposal-privacy-failed');
    scanDomain(SUBJECT_TYPE, { relatedSubjects: relatedSubjects }, 'redacted', blockers, warnings, 'library-catalog-proposal-privacy-failed');
    if (blockers.length) return failure(operation, blockers, warnings, {
      canonicalCatalog: catalog,
      preflight: preflight,
      diagnostics: safeObject(preflight.diagnostics),
      subjectId: identity.subjectId,
      lineageId: identity.lineageId,
      dedupeKey: identity.dedupeKey,
      operationId: operationId,
      baseHash: baseHash,
      targetHash: targetHash,
      revisionHash: targetHash,
      expectedCurrentState: currentState,
      expectedTargetState: targetState,
      operationIntent: meta.operationIntent,
      originAccountIdHash: cleanLower(catalog.originAccountIdHash),
      actorPeer: actorPeer,
      sourceTag: cleanString(catalog.sourceTag),
      sourceTagHash: cleanLower(catalog.sourceTagHash),
      relatedSubjects: relatedSubjects,
      observedAtIso: observedAtIso
    });

    return success({
      operation: operation,
      proposal: proposal,
      candidate: candidate,
      canonicalCatalog: catalog,
      preflight: preflight,
      diagnostics: safeObject(preflight.diagnostics),
      subjectId: identity.subjectId,
      lineageId: identity.lineageId,
      dedupeKey: identity.dedupeKey,
      operationId: operationId,
      baseHash: baseHash,
      targetHash: targetHash,
      expectedCurrentState: currentState,
      expectedTargetState: targetState,
      operationIntent: meta.operationIntent,
      originAccountIdHash: cleanLower(catalog.originAccountIdHash),
      actorPeer: actorPeer,
      sourceTag: cleanString(catalog.sourceTag),
      sourceTagHash: cleanLower(catalog.sourceTagHash),
      relatedSubjects: relatedSubjects,
      warnings: warnings,
      observedAtIso: observedAtIso
    });
  }

  function withOperation(input, operation) {
    return Object.assign({}, safeObject(input), { operation: operation });
  }

  H2O.Desktop.Sync.generateLibraryCatalogProposalCandidate = generateLibraryCatalogProposalCandidate;
  H2O.Desktop.Sync.proposeLibraryCatalogCreate = function (input) {
    return generateLibraryCatalogProposalCandidate(withOperation(input, 'create'));
  };
  H2O.Desktop.Sync.proposeLibraryCatalogRename = function (input) {
    return generateLibraryCatalogProposalCandidate(withOperation(input, 'rename'));
  };
  H2O.Desktop.Sync.proposeLibraryCatalogRecolor = function (input) {
    return generateLibraryCatalogProposalCandidate(withOperation(input, 'recolor'));
  };
  H2O.Desktop.Sync.proposeLibraryCatalogArchive = function (input) {
    return generateLibraryCatalogProposalCandidate(withOperation(input, 'archive'));
  };
  H2O.Desktop.Sync.proposeLibraryCatalogRestoreFromArchived = function (input) {
    return generateLibraryCatalogProposalCandidate(withOperation(input, 'restore-from-archived'));
  };
  H2O.Desktop.Sync.proposeLibraryCatalogTombstone = function (input) {
    return generateLibraryCatalogProposalCandidate(withOperation(input, 'tombstone'));
  };
  H2O.Desktop.Sync.proposeLibraryCatalogRestoreFromRetained = function (input) {
    return generateLibraryCatalogProposalCandidate(withOperation(input, 'restore-from-retained'));
  };
  H2O.Desktop.Sync.__libraryCatalogProposalInstalled = true;
  H2O.Desktop.Sync.__libraryCatalogProposalVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
