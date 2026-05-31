/* H2O Desktop Sync Kernel - F14.2.11 lifecycle state-machine framework
 *
 * Desktop/Tauri L1 primitive only.
 *
 * Safety invariants:
 *   - Shapes and validates caller-supplied lifecycle state records,
 *     transition records, metadata, and policies only.
 *   - No storage reads/writes, transition execution, workflow execution,
 *     domain policy ownership, relay, WebDAV, polling, timers, network,
 *     domain mutation, or mobile behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.11, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.shapeLifecycleState(input)
 *   H2O.Desktop.Sync.kernel.validateLifecycleState(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapeLifecycleTransition(input)
 *   H2O.Desktop.Sync.kernel.validateLifecycleTransition(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapeLifecycleMetadata(input)
 *   H2O.Desktop.Sync.kernel.validateLifecycleMetadata(input, policy?)
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
  if (kernel.__lifecycleFrameworkInstalled) return;

  var VERSION = '0.1.0-f14.2.11';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.lifecycle-validation.v1';
  var STATE_SCHEMA = 'h2o.desktop.sync.kernel.lifecycle-state.v1';
  var TRANSITION_SCHEMA = 'h2o.desktop.sync.kernel.lifecycle-transition.v1';
  var METADATA_SCHEMA = 'h2o.desktop.sync.kernel.lifecycle-metadata.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var SUPPORTED_DOMAINS = [
    'snapshot',
    'capture',
    'publication',
    'review',
    'chat',
    'folder',
    'binding'
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

  function isSha256Hex(value) {
    return SHA256_RE.test(lowerHash(value));
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

  function transitionKey(fromState, toState) {
    return cleanString(fromState) + '->' + cleanString(toState);
  }

  function normalizeTransitionRules(value) {
    var rules = {};
    if (Array.isArray(value)) {
      value.forEach(function (item) {
        if (typeof item === 'string') {
          var parts = item.split('->');
          if (parts.length === 2) {
            var from = cleanString(parts[0]);
            var to = cleanString(parts[1]);
            if (!rules[from]) rules[from] = [];
            if (to && rules[from].indexOf(to) === -1) rules[from].push(to);
          }
          return;
        }
        if (isObject(item)) {
          var f = cleanString(item.fromState || item.from);
          var t = cleanString(item.toState || item.to);
          if (!rules[f]) rules[f] = [];
          if (t && rules[f].indexOf(t) === -1) rules[f].push(t);
        }
      });
      return rules;
    }
    if (isObject(value)) {
      Object.keys(value).forEach(function (from) {
        rules[cleanString(from)] = normalizeStringList(value[from]);
      });
    }
    return rules;
  }

  function normalizePolicy(policy) {
    var source = safeObject(policy);
    var allowedStates = normalizeStringList(source.allowedStates || source.states);
    var orderedStates = normalizeStringList(source.orderedStates || allowedStates);
    var allowedTransitions = normalizeTransitionRules(source.allowedTransitions || source.transitions);
    return {
      domain: cleanString(source.domain),
      allowedDomains: normalizeStringList(source.allowedDomains).length
        ? normalizeStringList(source.allowedDomains)
        : SUPPORTED_DOMAINS.slice(),
      allowedStates: allowedStates,
      orderedStates: orderedStates,
      initialStates: normalizeStringList(source.initialStates),
      terminalStates: normalizeStringList(source.terminalStates),
      allowedTransitions: allowedTransitions,
      allowedSkipTransitions: normalizeStringList(source.allowedSkipTransitions),
      allowedBackwardTransitions: normalizeStringList(source.allowedBackwardTransitions),
      requireKnownState: source.requireKnownState !== false && allowedStates.length > 0,
      requireTransitionRule: source.requireTransitionRule === true || Object.keys(allowedTransitions).length > 0,
      enforceNoSkippedState: source.enforceNoSkippedState !== false && orderedStates.length > 0,
      allowInitialTransition: source.allowInitialTransition !== false,
      allowSelfTransition: source.allowSelfTransition === true,
      requireLifecycleId: source.requireLifecycleId === true,
      requireTransitionId: source.requireTransitionId === true,
      requireSubject: source.requireSubject !== false,
      requireLineage: source.requireLineage === true,
      requireActorPeer: source.requireActorPeer === true,
      requireTimestamps: source.requireTimestamps === true,
      privacyPolicy: safeObject(source.privacyPolicy)
    };
  }

  function shapeLifecycleMetadata(input) {
    var source = safeObject(input);
    return {
      schema: METADATA_SCHEMA,
      lifecycleId: cleanString(source.lifecycleId),
      domain: cleanString(source.domain),
      subjectType: cleanString(source.subjectType),
      subjectId: lowerHash(source.subjectId),
      lineageId: cleanString(source.lineageId),
      eventDigest: lowerHash(source.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey),
      ownerKind: cleanString(source.ownerKind),
      policyVersion: cleanString(source.policyVersion),
      predicateVersion: cleanString(source.predicateVersion),
      createdAtIso: cleanString(source.createdAtIso),
      updatedAtIso: cleanString(source.updatedAtIso),
      metadata: normalizeMetadata(source.metadata)
    };
  }

  function shapeLifecycleState(input) {
    var source = safeObject(input);
    var metadata = shapeLifecycleMetadata(source.metadata || source);
    return {
      schema: STATE_SCHEMA,
      lifecycleId: cleanString(source.lifecycleId || metadata.lifecycleId),
      domain: cleanString(source.domain || metadata.domain),
      subjectType: cleanString(source.subjectType || metadata.subjectType),
      subjectId: lowerHash(source.subjectId || metadata.subjectId),
      state: cleanString(source.state || source.lifecycleState),
      stateVersion: cleanString(source.stateVersion),
      lineageId: cleanString(source.lineageId || metadata.lineageId),
      eventDigest: lowerHash(source.eventDigest || metadata.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey || metadata.dedupeKey),
      ownerKind: cleanString(source.ownerKind || metadata.ownerKind),
      enteredAtIso: cleanString(source.enteredAtIso || source.createdAtIso),
      updatedAtIso: cleanString(source.updatedAtIso),
      metadata: metadata
    };
  }

  function shapeLifecycleTransition(input) {
    var source = safeObject(input);
    var metadata = shapeLifecycleMetadata(source.metadata || source);
    return {
      schema: TRANSITION_SCHEMA,
      transitionId: cleanString(source.transitionId),
      lifecycleId: cleanString(source.lifecycleId || metadata.lifecycleId),
      domain: cleanString(source.domain || metadata.domain),
      subjectType: cleanString(source.subjectType || metadata.subjectType),
      subjectId: lowerHash(source.subjectId || metadata.subjectId),
      transitionName: cleanString(source.transitionName || source.name),
      fromState: cleanString(source.fromState || source.from),
      toState: cleanString(source.toState || source.to),
      lineageId: cleanString(source.lineageId || metadata.lineageId),
      eventDigest: lowerHash(source.eventDigest || metadata.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey || metadata.dedupeKey),
      actorPeer: normalizeActorPeer(source.actorPeer),
      reasonCode: cleanString(source.reasonCode || source.reason),
      requestedAtIso: cleanString(source.requestedAtIso),
      transitionedAtIso: cleanString(source.transitionedAtIso || source.createdAtIso),
      sequence: nullableNumber(source.sequence),
      metadata: metadata
    };
  }

  function result(blockers, warnings, state, transition, extra) {
    var out = {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      valid: blockers.length === 0,
      state: state || null,
      transition: transition || null,
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
      subjectType: 'lifecycle',
      redactionClass: 'redacted',
      allowedRedactionClasses: ['redacted']
    }, safeObject(options.privacyPolicy));
    var scan = kernel.scanPrivacy(value, scanPolicy);
    codeList(scan.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(scan.warnings).forEach(function (code) { addCode(warnings, code); });
  }

  function stateKnown(state, options) {
    return !options.requireKnownState || options.allowedStates.indexOf(cleanString(state)) !== -1;
  }

  function validateCommonMetadata(value, options, blockers, warnings, prefix) {
    if (options.requireLifecycleId && !value.lifecycleId) addCode(blockers, prefix + '-lifecycleId-required');
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
    if (value.metadata.createdAtIso && !isIso(value.metadata.createdAtIso)) addCode(blockers, prefix + '-createdAtIso-invalid');
    if (value.metadata.updatedAtIso && !isIso(value.metadata.updatedAtIso)) addCode(warnings, prefix + '-updatedAtIso-invalid');
  }

  function validateLifecycleMetadata(input, policy) {
    var options = normalizePolicy(policy);
    var metadata = shapeLifecycleMetadata(input);
    var blockers = [];
    var warnings = [];
    validateCommonMetadata(metadata, options, blockers, warnings, 'lifecycle-metadata');
    scanPrivacy(metadata, options, blockers, warnings);
    return result(blockers, warnings, null, null, {
      metadata: metadata
    });
  }

  function validateLifecycleState(input, policy) {
    var options = normalizePolicy(policy);
    var state = shapeLifecycleState(input);
    var blockers = [];
    var warnings = [];

    validateCommonMetadata(state, options, blockers, warnings, 'lifecycle-state');
    if (!state.state) addCode(blockers, 'lifecycle-state-required');
    if (state.state && !stateKnown(state.state, options)) addCode(blockers, 'lifecycle-state-unknown');
    if (options.requireTimestamps && !isIso(state.enteredAtIso)) addCode(blockers, 'lifecycle-state-enteredAtIso-required');
    if (!isIsoOrEmpty(state.enteredAtIso)) addCode(blockers, 'lifecycle-state-enteredAtIso-invalid');
    if (!isIsoOrEmpty(state.updatedAtIso)) addCode(warnings, 'lifecycle-state-updatedAtIso-invalid');
    scanPrivacy(state, options, blockers, warnings);

    return result(blockers, warnings, state, null);
  }

  function transitionAllowedByRules(transition, options) {
    if (!options.requireTransitionRule) return true;
    var from = cleanString(transition.fromState);
    var to = cleanString(transition.toState);
    var allowed = options.allowedTransitions[from] || [];
    return allowed.indexOf(to) !== -1;
  }

  function validateNoSkippedState(transition, options, blockers) {
    if (!options.enforceNoSkippedState) return;
    var from = cleanString(transition.fromState);
    var to = cleanString(transition.toState);
    if (!from || !to) return;
    var fromIndex = options.orderedStates.indexOf(from);
    var toIndex = options.orderedStates.indexOf(to);
    if (fromIndex === -1 || toIndex === -1) return;
    var key = transitionKey(from, to);
    if (fromIndex === toIndex && !options.allowSelfTransition) {
      addCode(blockers, 'lifecycle-transition-self-not-allowed');
    }
    if (toIndex < fromIndex && options.allowedBackwardTransitions.indexOf(key) === -1) {
      addCode(blockers, 'lifecycle-transition-regression');
    }
    if (toIndex > fromIndex + 1 && options.allowedSkipTransitions.indexOf(key) === -1) {
      addCode(blockers, 'lifecycle-transition-skipped-state');
    }
  }

  function validateLifecycleTransition(input, policy) {
    var options = normalizePolicy(policy);
    var transition = shapeLifecycleTransition(input);
    var blockers = [];
    var warnings = [];

    validateCommonMetadata(transition, options, blockers, warnings, 'lifecycle-transition');
    if (options.requireTransitionId && !transition.transitionId) addCode(blockers, 'lifecycle-transition-id-required');
    if (!transition.toState) addCode(blockers, 'lifecycle-transition-toState-required');
    if (transition.fromState && !stateKnown(transition.fromState, options)) addCode(blockers, 'lifecycle-transition-fromState-unknown');
    if (transition.toState && !stateKnown(transition.toState, options)) addCode(blockers, 'lifecycle-transition-toState-unknown');
    if (!transition.fromState && !options.allowInitialTransition) addCode(blockers, 'lifecycle-transition-fromState-required');
    if (!transition.fromState && options.initialStates.length && options.initialStates.indexOf(transition.toState) === -1) {
      addCode(blockers, 'lifecycle-transition-initial-state-invalid');
    }
    if (transition.fromState && options.terminalStates.indexOf(transition.fromState) !== -1) {
      addCode(blockers, 'lifecycle-transition-from-terminal-state');
    }
    if (!transitionAllowedByRules(transition, options)) addCode(blockers, 'lifecycle-transition-not-allowed');
    validateNoSkippedState(transition, options, blockers);
    if (Number.isNaN(transition.sequence)) addCode(blockers, 'lifecycle-transition-sequence-invalid');
    if (options.requireTimestamps && !isIso(transition.transitionedAtIso)) {
      addCode(blockers, 'lifecycle-transition-transitionedAtIso-required');
    }
    if (!isIsoOrEmpty(transition.requestedAtIso)) addCode(blockers, 'lifecycle-transition-requestedAtIso-invalid');
    if (!isIsoOrEmpty(transition.transitionedAtIso)) addCode(blockers, 'lifecycle-transition-transitionedAtIso-invalid');
    validateActorPeer(transition.actorPeer, blockers, 'lifecycle-transition', options.requireActorPeer);
    scanPrivacy(transition, options, blockers, warnings);

    return result(blockers, warnings, null, transition);
  }

  kernel.LIFECYCLE_SUPPORTED_DOMAINS = SUPPORTED_DOMAINS.slice();
  kernel.shapeLifecycleState = shapeLifecycleState;
  kernel.validateLifecycleState = validateLifecycleState;
  kernel.shapeLifecycleTransition = shapeLifecycleTransition;
  kernel.validateLifecycleTransition = validateLifecycleTransition;
  kernel.shapeLifecycleMetadata = shapeLifecycleMetadata;
  kernel.validateLifecycleMetadata = validateLifecycleMetadata;
  kernel.__lifecycleFrameworkInstalled = true;
  kernel.__lifecycleFrameworkVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
