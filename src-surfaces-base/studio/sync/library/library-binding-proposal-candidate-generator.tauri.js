/* H2O Desktop Sync - F15.4.b library binding proposal candidate generator
 *
 * Desktop/Tauri-only pure proposal candidate generation for library.binding.
 *
 * Public API:
 *   H2O.Desktop.Sync.generateLibraryBindingProposalCandidate(input)
 *   H2O.Desktop.Sync.proposeLibraryBindingBind(input)
 *   H2O.Desktop.Sync.proposeLibraryBindingUnbind(input)
 *   H2O.Desktop.Sync.__libraryBindingProposalInstalled
 *   H2O.Desktop.Sync.__libraryBindingProposalVersion
 *
 * Safety invariants:
 *   - Candidate generation only.
 *   - No storage reads/writes, publication ledger writes, relay/outbox,
 *     Native calls, F5 execution, apply, watermark writes, consumed-op writes,
 *     store-layer rewiring, or Labels/Categories/Tags mutation.
 *   - Aggregate replacement intents are not single proposals in this phase.
 *   - Raw endpoint ids, names, titles, colors, content, paths, URLs, and
 *     tokens are never emitted in generated envelopes.
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
  if (H2O.Desktop.Sync.__libraryBindingProposalInstalled) return;

  var VERSION = '0.2.0-f15.11.b';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-binding-proposal-candidate-generator.v1';
  var PROPOSAL_SCHEMA = 'h2o.desktop.sync.library-binding-proposal.v1';
  var CANDIDATE_SCHEMA = 'h2o.desktop.sync.library-binding-proposal-candidate.v1';
  var SUBJECT_TYPE = 'library.binding';
  var ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var OPERATION_META = {
    bind: {
      proposalOperation: 'library-binding-bind-proposed',
      operationIntent: 'create',
      currentBindingState: 'absent',
      targetBindingState: 'bound',
      predicateVersion: 'h2o.library.binding.bind.predicate.v1'
    },
    unbind: {
      proposalOperation: 'library-binding-unbind-proposed',
      operationIntent: 'update',
      currentBindingState: 'bound',
      targetBindingState: 'unbound',
      predicateVersion: 'h2o.library.binding.unbind.predicate.v1'
    }
  };
  var REPLACE_OPERATIONS = [
    'replace-category',
    'replaceForChat',
    'replace-for-chat',
    'bulk-replace',
    'bulk replace'
  ];

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

  function getSync() {
    return (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
  }

  function getKernel() {
    return getSync().kernel || null;
  }

  function isSha256Hex(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return typeof value === 'string' && SHA256_RE.test(value);
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

  function isReplaceOperation(operation) {
    return REPLACE_OPERATIONS.indexOf(cleanString(operation)) !== -1;
  }

  function operationFromInput(input, fixedOperation, blockers) {
    var op = cleanString(fixedOperation) || cleanString(safeObject(input).operation);
    if (isReplaceOperation(op)) {
      addBlocker(blockers, 'library-binding-replace-operation-not-supported');
      return '';
    }
    return Object.prototype.hasOwnProperty.call(OPERATION_META, op) ? op : '';
  }

  function bindingFromPreflight(preflight) {
    if (!isObject(preflight)) return null;
    if (isObject(preflight.canonicalBinding)) return preflight.canonicalBinding;
    if (isObject(preflight.canonical)) return preflight.canonical;
    return null;
  }

  function scanDomain(domainTag, target, redactionClass, blockers, warnings, blockerCode) {
    var kernel = getKernel();
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') {
      addBlocker(blockers, blockerCode || 'library-binding-proposal-privacy-failed', {
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
      addBlocker(blockers, blockerCode || 'library-binding-proposal-privacy-failed');
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

  function expectedCurrentState(operation, binding, baseHash) {
    if (operation === 'bind') {
      return {
        subjectType: SUBJECT_TYPE,
        bindingState: 'absent',
        absent: true,
        revisionHash: ZERO_HASH,
        bindingKind: cleanString(binding.bindingKind),
        leftSubjectId: cleanLower(binding.leftSubjectId),
        rightSubjectId: cleanLower(binding.rightSubjectId)
      };
    }
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(binding.subjectId),
      bindingKind: cleanString(binding.bindingKind),
      bindingState: 'bound',
      revisionHash: cleanLower(baseHash),
      leftSubjectId: cleanLower(binding.leftSubjectId),
      rightSubjectId: cleanLower(binding.rightSubjectId),
      leftSubjectType: cleanString(binding.leftSubjectType),
      rightSubjectType: cleanString(binding.rightSubjectType),
      originAccountIdHash: cleanLower(binding.originAccountIdHash),
      sourceTagHash: cleanLower(binding.sourceTagHash)
    };
  }

  function expectedTargetState(meta, binding) {
    var targetState = cleanString(meta.targetBindingState);
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(binding.subjectId),
      bindingKind: cleanString(binding.bindingKind),
      bindingState: targetState,
      leftSubjectId: cleanLower(binding.leftSubjectId),
      rightSubjectId: cleanLower(binding.rightSubjectId),
      leftSubjectType: cleanString(binding.leftSubjectType),
      rightSubjectType: cleanString(binding.rightSubjectType),
      originAccountIdHash: cleanLower(binding.originAccountIdHash),
      schemaVersion: cleanString(binding.schemaVersion),
      sourceTagHash: cleanLower(binding.sourceTagHash)
    };
  }

  async function targetHashFor(targetState, blockers) {
    var targetHash = await sha256Hex({
      schema: 'h2o.desktop.sync.library-binding-proposal-target-state.v1',
      targetState: targetState
    });
    if (!isSha256Hex(targetHash)) addBlocker(blockers, 'library-binding-proposal-shape-invalid', {
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
      schema: 'h2o.desktop.sync.library-binding-operation-id.v1',
      subjectType: SUBJECT_TYPE,
      subjectId: input.subjectId,
      operation: input.proposalOperation,
      operationIntent: input.operationIntent,
      baseHash: input.baseHash,
      targetHash: input.targetHash,
      dedupeKey: input.dedupeKey
    });
    if (!isSha256Hex(operationId)) addBlocker(blockers, 'library-binding-proposal-shape-invalid', {
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
      bindingKindValid: pf.bindingKindValid === true,
      endpointSubjectHashesValid: pf.endpointSubjectHashesValid === true,
      activeCatalogEndpoint: pf.activeCatalogEndpoint,
      uniquenessOk: pf.uniquenessOk,
      categoryCacheObservationSafe: pf.categoryCacheObservationSafe !== false,
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

  function summarizeCanonicalBinding(binding) {
    return {
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(binding.subjectId),
      revisionHash: cleanLower(binding.revisionHash),
      bindingKind: cleanString(binding.bindingKind),
      bindingState: cleanString(binding.bindingState),
      leftSubjectId: cleanLower(binding.leftSubjectId),
      rightSubjectId: cleanLower(binding.rightSubjectId),
      leftSubjectType: cleanString(binding.leftSubjectType),
      rightSubjectType: cleanString(binding.rightSubjectType),
      originAccountIdHash: cleanLower(binding.originAccountIdHash),
      sourceTag: cleanString(binding.sourceTag),
      sourceTagHash: cleanLower(binding.sourceTagHash),
      schemaVersion: cleanString(binding.schemaVersion)
    };
  }

  function buildBindingShapes(input) {
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
    var bindingTransition = shapeWithKernel('shapeLifecycleTransition', {
      domain: SUBJECT_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: input.subjectId,
      transitionName: input.operation,
      fromState: input.expectedCurrentState.bindingState,
      toState: input.expectedTargetState.bindingState,
      lineageId: input.lineageId,
      eventDigest: input.operationId,
      dedupeKey: input.dedupeKey,
      actorPeer: input.actorPeer,
      reasonCode: 'library-binding-proposal-candidate',
      requestedAtIso: input.observedAtIso,
      transitionedAtIso: input.observedAtIso,
      metadata: {
        operation: input.proposalOperation,
        operationIntent: input.operationIntent,
        previewOnly: true
      }
    });
    var bindingState = shapeWithKernel('shapeLifecycleState', {
      domain: SUBJECT_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: input.subjectId,
      state: input.expectedTargetState.bindingState,
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
      operationKind: 'library.binding.' + input.operation + '.proposal',
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
        bindingKind: input.bindingKind,
        targetBindingState: input.expectedTargetState.bindingState,
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
      bindingState: bindingState,
      bindingTransition: bindingTransition,
      proposedWatermark: proposedWatermark,
      watermarkState: watermarkState,
      publicationMetadata: publicationMetadata
    };
  }

  function validateProposalShape(proposal, candidate, blockers) {
    if (!proposal || proposal.schema !== PROPOSAL_SCHEMA) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (!candidate || candidate.schema !== CANDIDATE_SCHEMA) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && proposal.kind !== 'proposal') addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && proposal.subjectType !== SUBJECT_TYPE) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && proposal.redactionClass !== 'redacted') addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.subjectId)) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.dedupeKey)) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.operationId)) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.baseHash)) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && !isSha256Hex(proposal.targetHash)) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
    if (proposal && proposal.sideEffectSummary) {
      Object.keys(proposal.sideEffectSummary).forEach(function (key) {
        if (proposal.sideEffectSummary[key] !== false) addBlocker(blockers, 'library-binding-proposal-shape-invalid');
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
      canonicalBinding: null,
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
      canonicalBinding: fields.canonicalBinding,
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

  async function runPreflight(input, operation, blockers) {
    if (typeof H2O.Desktop.Sync.preflightLibraryBinding !== 'function') {
      addBlocker(blockers, 'library-binding-preflight-not-ok', { reason: 'preflight-unavailable' });
      return null;
    }
    try {
      return await H2O.Desktop.Sync.preflightLibraryBinding(Object.assign({}, input, { operation: operation }));
    } catch (_) {
      addBlocker(blockers, 'library-binding-preflight-not-ok', { reason: 'preflight-threw' });
      return null;
    }
  }

  function baseHashFrom(input, binding, operation, blockers) {
    if (operation === 'bind') return ZERO_HASH;
    var explicit = cleanLower(input.baseHash || input.currentRevisionHash || input.expectedCurrentRevisionHash);
    var baseHash = explicit || cleanLower(binding.revisionHash);
    if (!isSha256Hex(baseHash)) addBlocker(blockers, 'library-binding-proposal-shape-invalid', {
      reason: 'base-hash-invalid'
    });
    return baseHash;
  }

  async function generateLibraryBindingProposalCandidate(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var operation = operationFromInput(args, '', blockers);
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();

    if (!isObject(input)) addBlocker(blockers, 'library-binding-proposal-shape-invalid', { reason: 'input-not-object' });
    if (!operation && !codeList(blockers).includes('library-binding-replace-operation-not-supported')) {
      addBlocker(blockers, 'library-binding-proposal-shape-invalid', { reason: 'operation-not-supported' });
    }
    if (blockers.length) return failure(operation || cleanString(args.operation), blockers, warnings, {
      observedAtIso: observedAtIso
    });

    scanDomain(SUBJECT_TYPE, args, 'device-local', blockers, warnings, 'library-binding-proposal-privacy-failed');
    if (blockers.length) return failure(operation, blockers, warnings, { observedAtIso: observedAtIso });

    var preflight = await runPreflight(args, operation, blockers);
    if (preflight) {
      mergeEntries(warnings, preflight.warnings, 'warning');
      scanDomain(SUBJECT_TYPE, preflight, 'redacted', blockers, warnings, 'library-binding-proposal-privacy-failed');
    }
    if (blockers.length) return failure(operation, blockers, warnings, {
      preflight: preflight,
      diagnostics: safeObject(preflight && preflight.diagnostics),
      observedAtIso: observedAtIso
    });
    if (!preflight || preflight.ok !== true) {
      mergeEntries(blockers, preflight && preflight.blockers, 'blocker');
      addBlocker(blockers, 'library-binding-preflight-not-ok');
      return failure(operation, blockers, warnings, {
        preflight: preflight,
        diagnostics: safeObject(preflight && preflight.diagnostics),
        observedAtIso: observedAtIso
      });
    }
    if (preflight.actionable !== true) {
      mergeEntries(blockers, preflight.blockers, 'blocker');
      addBlocker(blockers, 'library-binding-preflight-not-actionable');
      return failure(operation, blockers, warnings, {
        preflight: preflight,
        diagnostics: safeObject(preflight.diagnostics),
        observedAtIso: observedAtIso
      });
    }

    var binding = bindingFromPreflight(preflight);
    if (!binding || !isSha256Hex(binding.subjectId) || !isSha256Hex(binding.revisionHash)) {
      addBlocker(blockers, 'library-binding-proposal-shape-invalid', { reason: 'canonical-binding-invalid' });
      return failure(operation, blockers, warnings, {
        preflight: preflight,
        diagnostics: safeObject(preflight.diagnostics),
        observedAtIso: observedAtIso
      });
    }

    var meta = OPERATION_META[operation];
    var baseHash = baseHashFrom(args, binding, operation, blockers);
    var currentState = expectedCurrentState(operation, binding, baseHash);
    var targetState = expectedTargetState(meta, binding);
    var targetHash = await targetHashFor(targetState, blockers);
    if (blockers.length) return failure(operation, blockers, warnings, {
      canonicalBinding: binding,
      preflight: preflight,
      diagnostics: safeObject(preflight.diagnostics),
      observedAtIso: observedAtIso
    });

    var actorPeer = await resolveActorPeer(args, blockers);
    if (blockers.length || !actorPeer) return failure(operation, blockers, warnings, {
      canonicalBinding: binding,
      preflight: preflight,
      diagnostics: safeObject(preflight.diagnostics),
      observedAtIso: observedAtIso
    });

    var identityOperation = meta.proposalOperation + ':' + targetHash;
    var identity = await buildIdentity({
      subjectId: cleanLower(binding.subjectId),
      baseHash: baseHash,
      identityOperation: identityOperation,
      actorPeer: actorPeer
    });
    mergeEntries(blockers, identity.blockers, 'blocker');
    mergeEntries(warnings, identity.warnings, 'warning');
    if (blockers.length) return failure(operation, blockers, warnings, {
      canonicalBinding: binding,
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
      canonicalBinding: binding,
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
      bindingKind: cleanString(binding.bindingKind)
    };
    var kernelShapes = buildBindingShapes(shapeInput);

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
      bindingTransition: kernelShapes.bindingTransition,
      predicateVersion: meta.predicateVersion,
      originAccountIdHash: cleanLower(binding.originAccountIdHash),
      actorPeer: actorPeer,
      sourceTag: cleanString(binding.sourceTag),
      sourceTagHash: cleanLower(binding.sourceTagHash),
      relatedSubjects: relatedSubjects,
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
      bindingState: kernelShapes.bindingState,
      bindingTransition: kernelShapes.bindingTransition,
      originTag: kernelShapes.originTag,
      replayCandidate: kernelShapes.replayCandidate,
      proposedWatermark: kernelShapes.proposedWatermark,
      watermarkState: kernelShapes.watermarkState,
      publicationMetadata: kernelShapes.publicationMetadata,
      predicateVersion: meta.predicateVersion,
      originAccountIdHash: cleanLower(binding.originAccountIdHash),
      actorPeer: actorPeer,
      sourceTag: cleanString(binding.sourceTag),
      sourceTagHash: cleanLower(binding.sourceTagHash),
      relatedSubjects: relatedSubjects,
      canonicalBindingSummary: summarizeCanonicalBinding(binding),
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
    scanDomain(SUBJECT_TYPE, proposal, 'redacted', blockers, warnings, 'library-binding-proposal-privacy-failed');
    scanDomain(SUBJECT_TYPE, candidate, 'redacted', blockers, warnings, 'library-binding-proposal-privacy-failed');
    scanDomain(SUBJECT_TYPE, { relatedSubjects: relatedSubjects }, 'redacted', blockers, warnings, 'library-binding-proposal-privacy-failed');
    if (blockers.length) return failure(operation, blockers, warnings, {
      canonicalBinding: binding,
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
      originAccountIdHash: cleanLower(binding.originAccountIdHash),
      actorPeer: actorPeer,
      sourceTag: cleanString(binding.sourceTag),
      sourceTagHash: cleanLower(binding.sourceTagHash),
      relatedSubjects: relatedSubjects,
      observedAtIso: observedAtIso
    });

    return success({
      operation: operation,
      proposal: proposal,
      candidate: candidate,
      canonicalBinding: binding,
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
      originAccountIdHash: cleanLower(binding.originAccountIdHash),
      actorPeer: actorPeer,
      sourceTag: cleanString(binding.sourceTag),
      sourceTagHash: cleanLower(binding.sourceTagHash),
      relatedSubjects: relatedSubjects,
      warnings: warnings,
      observedAtIso: observedAtIso
    });
  }

  function withOperation(input, operation) {
    return Object.assign({}, safeObject(input), { operation: operation });
  }

  H2O.Desktop.Sync.generateLibraryBindingProposalCandidate = generateLibraryBindingProposalCandidate;
  H2O.Desktop.Sync.proposeLibraryBindingBind = function (input) {
    return generateLibraryBindingProposalCandidate(withOperation(input, 'bind'));
  };
  H2O.Desktop.Sync.proposeLibraryBindingUnbind = function (input) {
    return generateLibraryBindingProposalCandidate(withOperation(input, 'unbind'));
  };
  H2O.Desktop.Sync.__libraryBindingProposalInstalled = true;
  H2O.Desktop.Sync.__libraryBindingProposalVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
