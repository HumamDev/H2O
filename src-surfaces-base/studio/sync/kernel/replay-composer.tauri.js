/* H2O Desktop Sync Kernel - F14.2.9 replay-defense composer
 *
 * Desktop/Tauri L1 primitive only.
 *
 * Safety invariants:
 *   - Composes caller-supplied identity, consumed-operation, watermark,
 *     publication, tombstone, and origin-tag validation inputs only.
 *   - No replay policy ownership, storage reads/writes, watermark advancement,
 *     operation consumption, publication, relay, WebDAV, polling, timers,
 *     network, apply, convergence, domain mutation, or mobile behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.9, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.shapeReplayCandidate(input)
 *   H2O.Desktop.Sync.kernel.composeReplayDefense(input, policy?)
 *   H2O.Desktop.Sync.kernel.createReplayDefenseResult(input)
 *   H2O.Desktop.Sync.kernel.summarizeReplayValidation(input)
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
  if (kernel.__replayDefenseComposerInstalled) return;

  var VERSION = '0.1.0-f14.2.9';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.replay-defense.v1';
  var CANDIDATE_SCHEMA = 'h2o.desktop.sync.kernel.replay-candidate.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;

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

  function lowerHash(value) {
    return cleanString(value).toLowerCase();
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

  function normalizePolicy(policy) {
    var source = safeObject(policy);
    return {
      requireIdentity: source.requireIdentity === true,
      requireConsumedOperation: source.requireConsumedOperation === true,
      requireWatermark: source.requireWatermark === true,
      requirePublication: source.requirePublication === true,
      requireTombstone: source.requireTombstone === true,
      requireOriginTag: source.requireOriginTag === true,
      blockWhenTombstoned: source.blockWhenTombstoned === true,
      blockTerminalPublicationStatus: source.blockTerminalPublicationStatus === true,
      identityPolicy: safeObject(source.identityPolicy),
      consumedPolicy: safeObject(source.consumedPolicy),
      watermarkPolicy: safeObject(source.watermarkPolicy),
      publicationPolicy: safeObject(source.publicationPolicy),
      tombstonePolicy: safeObject(source.tombstonePolicy),
      originPolicy: safeObject(source.originPolicy)
    };
  }

  function shapeOriginTag(input) {
    if (typeof kernel.shapeOriginTag === 'function') return kernel.shapeOriginTag(input);
    var source = safeObject(input);
    return {
      originKind: cleanString(source.originKind || source.kind || 'unknown'),
      sourcePeerId: lowerHash(source.sourcePeerId),
      sourcePlatform: cleanString(source.sourcePlatform),
      envelopeKind: cleanString(source.envelopeKind),
      operationKind: cleanString(source.operationKind),
      lineageId: cleanString(source.lineageId),
      eventDigest: lowerHash(source.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey)
    };
  }

  function shapeReplayCandidate(input) {
    var source = safeObject(input);
    var candidate = safeObject(source.candidate || source.replayCandidate || source);
    var actorPeer = normalizeActorPeer(candidate.actorPeer || candidate.sourcePeerEnvelope);
    var originTag = shapeOriginTag(candidate.originTag || candidate.origin || candidate);
    return {
      schema: CANDIDATE_SCHEMA,
      subjectType: cleanString(candidate.subjectType),
      subjectId: lowerHash(candidate.subjectId),
      operation: cleanString(candidate.operation),
      operationKind: cleanString(candidate.operationKind || candidate.operation),
      operationIntent: cleanString(candidate.operationIntent),
      baseHash: lowerHash(candidate.baseHash),
      targetHash: lowerHash(candidate.targetHash || candidate.postStateHash || candidate.revisionHash),
      revisionHash: lowerHash(candidate.revisionHash),
      lineageId: cleanString(candidate.lineageId),
      eventDigest: lowerHash(candidate.eventDigest),
      dedupeKey: lowerHash(candidate.dedupeKey),
      actorPeer: actorPeer,
      originTag: originTag,
      metadata: normalizeMetadata(candidate.metadata)
    };
  }

  function hasProvided(value) {
    return isObject(value);
  }

  function summaryFrom(result, extra) {
    var source = safeObject(result);
    var summary = {
      ok: source.ok === true,
      valid: source.valid !== false && source.ok === true,
      replaySafe: typeof source.replaySafe === 'boolean' ? source.replaySafe : source.ok === true,
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings)
    };
    if (isObject(extra)) {
      Object.keys(extra).forEach(function (key) {
        summary[key] = extra[key];
      });
    }
    return summary;
  }

  function skippedSummary(required, validatorName) {
    return {
      ok: required ? false : true,
      valid: required ? false : true,
      replaySafe: required ? false : true,
      skipped: true,
      validator: validatorName,
      blockers: required ? ['replay-' + validatorName + '-required'] : [],
      warnings: []
    };
  }

  function unavailableSummary(required, validatorName) {
    return {
      ok: false,
      valid: false,
      replaySafe: false,
      skipped: false,
      validator: validatorName,
      blockers: [required ? 'replay-' + validatorName + '-unavailable' : 'replay-' + validatorName + '-unavailable'],
      warnings: []
    };
  }

  function collect(summary, blockers, warnings) {
    codeList(summary.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(summary.warnings).forEach(function (code) { addCode(warnings, code); });
  }

  function identityInput(args, candidate) {
    var source = safeObject(args.identity || args.identityInput);
    if (hasProvided(source)) return source;
    return {
      subjectType: candidate.subjectType,
      subjectId: candidate.subjectId,
      operation: candidate.operation || candidate.operationKind,
      baseHash: candidate.baseHash,
      actorPeer: candidate.actorPeer
    };
  }

  function consumedInput(args, candidate) {
    var explicit = safeObject(args.consumed || args.consumedInput);
    if (hasProvided(explicit)) return explicit;
    return {
      rows: asArray(args.consumedRows),
      candidate: Object.assign({}, candidate, {
        envelopeKind: cleanString(args.envelopeKind || candidate.envelopeKind),
        consumedStatus: cleanString(args.consumedStatus || 'consumed'),
        consumedAtIso: cleanString(args.consumedAtIso),
        sourcePeerId: lowerHash(args.sourcePeerId || candidate.originTag.sourcePeerId),
        actorPeer: candidate.actorPeer,
        originTag: candidate.originTag,
        validationSummary: safeObject(args.validationSummary)
      })
    };
  }

  function watermarkInput(args) {
    var explicit = safeObject(args.watermark || args.watermarkInput);
    if (hasProvided(explicit)) return explicit;
    return {
      currentWatermark: args.currentWatermark || args.current,
      proposedWatermark: args.proposedWatermark || args.proposed,
      requireAdvance: args.requireAdvance === true,
      allowIdempotent: args.allowIdempotent !== false
    };
  }

  function shouldRun(value, required) {
    if (required) return true;
    return hasProvided(value);
  }

  function composeIdentity(args, options, candidate) {
    var input = identityInput(args, candidate);
    if (!shouldRun(args.identity || args.identityInput, options.requireIdentity)) {
      return skippedSummary(false, 'identity');
    }
    if (typeof kernel.validateIdentityInput !== 'function') {
      return unavailableSummary(options.requireIdentity, 'identity');
    }
    return summaryFrom(kernel.validateIdentityInput(input), {
      validator: 'identity',
      identity: input
    });
  }

  function composeConsumed(args, options, candidate) {
    var explicit = args.consumed || args.consumedInput;
    var hasRows = Array.isArray(args.consumedRows);
    if (!shouldRun(explicit, options.requireConsumedOperation) && !hasRows) {
      return skippedSummary(false, 'consumed-operation');
    }
    if (typeof kernel.validateReplayCandidate !== 'function') {
      return unavailableSummary(options.requireConsumedOperation, 'consumed-operation');
    }
    var input = consumedInput(args, candidate);
    var result = kernel.validateReplayCandidate(input);
    return summaryFrom(result, {
      validator: 'consumed-operation',
      consumedOperation: result.consumedOperation || null,
      existingConsumedOperation: result.existingConsumedOperation || null,
      matchFound: result.matchFound === true
    });
  }

  function composeWatermark(args, options) {
    var explicit = args.watermark || args.watermarkInput || args.currentWatermark || args.proposedWatermark || args.current || args.proposed;
    if (!shouldRun(explicit, options.requireWatermark)) {
      return skippedSummary(false, 'watermark');
    }
    if (typeof kernel.validateWatermarkMonotonicity !== 'function') {
      return unavailableSummary(options.requireWatermark, 'watermark');
    }
    var input = Object.assign({}, options.watermarkPolicy, watermarkInput(args));
    var result = kernel.validateWatermarkMonotonicity(input);
    return summaryFrom(result, {
      validator: 'watermark',
      currentWatermark: result.currentWatermark || null,
      proposedWatermark: result.proposedWatermark || null,
      comparison: result.comparison || null
    });
  }

  function composePublication(args, options, blockers) {
    var publication = args.publication || args.publicationInput;
    if (!shouldRun(publication, options.requirePublication)) {
      return skippedSummary(false, 'publication');
    }
    if (typeof kernel.validatePublication !== 'function') {
      return unavailableSummary(options.requirePublication, 'publication');
    }
    var result = kernel.validatePublication(publication, options.publicationPolicy);
    var summary = summaryFrom(result, {
      validator: 'publication',
      publication: result.publication || null
    });
    if (options.blockTerminalPublicationStatus &&
      result.publication &&
      typeof kernel.isTerminalPublicationStatus === 'function' &&
      kernel.isTerminalPublicationStatus(result.publication.publicationStatus)) {
      addCode(summary.blockers, 'replay-publication-terminal-status');
      summary.ok = false;
      summary.valid = false;
      summary.replaySafe = false;
      addCode(blockers, 'replay-publication-terminal-status');
    }
    return summary;
  }

  function composeTombstone(args, options, blockers) {
    var tombstone = args.tombstone || args.tombstoneInput;
    if (!shouldRun(tombstone, options.requireTombstone)) {
      return skippedSummary(false, 'tombstone');
    }
    if (typeof kernel.validateTombstone !== 'function') {
      return unavailableSummary(options.requireTombstone, 'tombstone');
    }
    var result = kernel.validateTombstone(tombstone);
    var summary = summaryFrom(result, {
      validator: 'tombstone',
      tombstone: result.tombstone || null,
      tombstoneStatus: result.tombstoneStatus || ''
    });
    if (options.blockWhenTombstoned &&
      typeof kernel.isTombstoned === 'function' &&
      kernel.isTombstoned(result.tombstone)) {
      addCode(summary.blockers, 'replay-tombstone-present');
      summary.ok = false;
      summary.valid = false;
      summary.replaySafe = false;
      addCode(blockers, 'replay-tombstone-present');
    }
    return summary;
  }

  function composeOrigin(args, options, candidate) {
    var explicit = args.originTag || args.origin;
    var originTag = explicit || candidate.originTag;
    if (!shouldRun(explicit, options.requireOriginTag)) {
      return skippedSummary(false, 'origin-tag');
    }
    if (typeof kernel.validateOriginTag !== 'function') {
      return unavailableSummary(options.requireOriginTag, 'origin-tag');
    }
    var result = kernel.validateOriginTag(originTag);
    return summaryFrom(result, {
      validator: 'origin-tag',
      originTag: result.originTag || shapeOriginTag(originTag)
    });
  }

  function composeReplayDefense(input, policy) {
    var args = safeObject(input);
    var options = normalizePolicy(args.policy || policy);
    var candidate = shapeReplayCandidate(args.candidate || args.replayCandidate || args);
    var blockers = [];
    var warnings = [];
    var validationSummary = {};

    validationSummary.identity = composeIdentity(args, options, candidate);
    collect(validationSummary.identity, blockers, warnings);

    validationSummary.consumedOperation = composeConsumed(args, options, candidate);
    collect(validationSummary.consumedOperation, blockers, warnings);

    validationSummary.watermark = composeWatermark(args, options);
    collect(validationSummary.watermark, blockers, warnings);

    validationSummary.publication = composePublication(args, options, blockers);
    collect(validationSummary.publication, blockers, warnings);

    validationSummary.tombstone = composeTombstone(args, options, blockers);
    collect(validationSummary.tombstone, blockers, warnings);

    validationSummary.originTag = composeOrigin(args, options, candidate);
    collect(validationSummary.originTag, blockers, warnings);

    var replaySafe = blockers.length === 0 &&
      validationSummary.identity.replaySafe !== false &&
      validationSummary.consumedOperation.replaySafe !== false &&
      validationSummary.watermark.replaySafe !== false &&
      validationSummary.publication.replaySafe !== false &&
      validationSummary.tombstone.replaySafe !== false &&
      validationSummary.originTag.replaySafe !== false;

    return {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      replaySafe: replaySafe,
      candidate: candidate,
      blockers: codeList(blockers),
      warnings: codeList(warnings),
      validationSummary: validationSummary
    };
  }

  function summarizeReplayValidation(input) {
    var source = safeObject(input);
    var result = source.schema === RESULT_SCHEMA ? source : composeReplayDefense(source);
    return {
      schema: 'h2o.desktop.sync.kernel.replay-validation-summary.v1',
      ok: result.ok === true,
      replaySafe: result.replaySafe === true,
      blockers: codeList(result.blockers),
      warnings: codeList(result.warnings),
      validators: Object.keys(safeObject(result.validationSummary)).sort()
    };
  }

  function createReplayDefenseResult(input) {
    var source = safeObject(input);
    if (source.schema === RESULT_SCHEMA) return source;
    return {
      schema: RESULT_SCHEMA,
      ok: codeList(source.blockers).length === 0,
      replaySafe: source.replaySafe === true && codeList(source.blockers).length === 0,
      candidate: source.candidate ? shapeReplayCandidate(source.candidate) : null,
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings),
      validationSummary: safeObject(source.validationSummary)
    };
  }

  kernel.shapeReplayCandidate = shapeReplayCandidate;
  kernel.composeReplayDefense = composeReplayDefense;
  kernel.createReplayDefenseResult = createReplayDefenseResult;
  kernel.summarizeReplayValidation = summarizeReplayValidation;
  kernel.__replayDefenseComposerInstalled = true;
  kernel.__replayDefenseComposerVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
