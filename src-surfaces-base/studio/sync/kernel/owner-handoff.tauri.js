/* H2O Desktop Sync Kernel - F14.2.10 owner-handoff primitive
 *
 * Desktop/Tauri L1 primitive only.
 *
 * Safety invariants:
 *   - Shapes and validates caller-supplied owner declarations, authority
 *     metadata, handoff requests, and handoff responses only.
 *   - No owner invocation, storage reads/writes, F5 action, Native action,
 *     relay, WebDAV, polling, timers, network, apply, convergence, domain
 *     mutation, or mobile behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.10, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.normalizeOwnerKind(value)
 *   H2O.Desktop.Sync.kernel.normalizeOwnerHandoffStatus(value)
 *   H2O.Desktop.Sync.kernel.shapeOwnerDeclaration(input)
 *   H2O.Desktop.Sync.kernel.validateOwnerDeclaration(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapeAuthorityMetadata(input)
 *   H2O.Desktop.Sync.kernel.validateAuthorityMetadata(input, policy?)
 *   H2O.Desktop.Sync.kernel.shapeOwnerHandoff(input)
 *   H2O.Desktop.Sync.kernel.validateOwnerHandoff(input, policy?)
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
  if (kernel.__ownerHandoffInstalled) return;

  var VERSION = '0.1.0-f14.2.10';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.owner-handoff-validation.v1';
  var HANDOFF_SCHEMA = 'h2o.desktop.sync.kernel.owner-handoff.v1';
  var OWNER_SCHEMA = 'h2o.desktop.sync.kernel.owner-declaration.v1';
  var AUTHORITY_SCHEMA = 'h2o.desktop.sync.kernel.owner-authority.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var OWNER_KINDS = [
    'f5',
    'native',
    'desktop-store',
    'snapshot-domain'
  ];

  var OWNER_KIND_ALIASES = {
    F5: 'f5',
    f5: 'f5',
    'f5-delete': 'f5',
    'f5-reviewed-delete': 'f5',
    native: 'native',
    'native-extension': 'native',
    'native-runtime': 'native',
    desktopStore: 'desktop-store',
    'desktop-store': 'desktop-store',
    'desktop-studio': 'desktop-store',
    snapshotDomain: 'snapshot-domain',
    'snapshot-domain': 'snapshot-domain',
    snapshot: 'snapshot-domain'
  };

  var HANDOFF_STATUSES = [
    'requested',
    'validated',
    'accepted',
    'rejected',
    'blocked',
    'expired',
    'superseded',
    'completed'
  ];

  var AUTHORITY_LEVELS = [
    'none',
    'read-only',
    'evidence-producer',
    'preview-coordinator',
    'proposal-source',
    'strong-local-authority',
    'audited-apply-authority'
  ];

  var CAPABILITIES = [
    'read',
    'produceEvidence',
    'preview',
    'propose',
    'conflictReview',
    'apply',
    'delete',
    'export',
    'cache',
    'transport',
    'syncOutward',
    'ownerHandoff',
    'review',
    'restore'
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

  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }

  function isIsoOrEmpty(value) {
    var text = cleanString(value);
    return !text || Number.isFinite(Date.parse(text));
  }

  function normalizeOwnerKind(value) {
    var raw = cleanString(value);
    return OWNER_KIND_ALIASES[raw] || '';
  }

  function normalizeOwnerHandoffStatus(value) {
    var raw = cleanString(value);
    return HANDOFF_STATUSES.indexOf(raw) === -1 ? '' : raw;
  }

  function normalizeAuthorityLevel(value) {
    var raw = cleanString(value);
    return AUTHORITY_LEVELS.indexOf(raw) === -1 ? '' : raw;
  }

  function normalizeCapability(value) {
    var raw = cleanString(value);
    return CAPABILITIES.indexOf(raw) === -1 ? '' : raw;
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
    var ownerKinds = normalizeStringList(source.allowedOwnerKinds);
    var capabilities = normalizeStringList(source.allowedCapabilities);
    var authorityLevels = normalizeStringList(source.allowedAuthorityLevels);
    return {
      allowedOwnerKinds: ownerKinds.length ? ownerKinds.map(normalizeOwnerKind).filter(Boolean) : OWNER_KINDS.slice(),
      allowedCapabilities: capabilities.length ? capabilities : CAPABILITIES.slice(),
      allowedAuthorityLevels: authorityLevels.length ? authorityLevels : AUTHORITY_LEVELS.slice(),
      requireActorPeer: source.requireActorPeer === true,
      requireSubject: source.requireSubject !== false,
      requireLineage: source.requireLineage === true,
      requireAuthority: source.requireAuthority !== false,
      requireOwnerCapability: source.requireOwnerCapability !== false,
      requiredAuthorityLevel: normalizeAuthorityLevel(source.requiredAuthorityLevel),
      requiredCapability: normalizeCapability(source.requiredCapability),
      privacyPolicy: safeObject(source.privacyPolicy)
    };
  }

  function shapeOwnerDeclaration(input) {
    var source = safeObject(input);
    return {
      schema: OWNER_SCHEMA,
      ownerKind: normalizeOwnerKind(source.ownerKind || source.kind),
      rawOwnerKind: cleanString(source.ownerKind || source.kind),
      ownerId: cleanString(source.ownerId || source.id),
      ownerNameHash: lowerHash(source.ownerNameHash),
      platformId: cleanString(source.platformId),
      surfaceKind: cleanString(source.surfaceKind),
      authorityLevel: normalizeAuthorityLevel(source.authorityLevel || source.declaredAuthority),
      rawAuthorityLevel: cleanString(source.authorityLevel || source.declaredAuthority),
      capabilities: normalizeStringList(source.capabilities),
      subjectTypes: normalizeStringList(source.subjectTypes),
      domains: normalizeStringList(source.domains),
      ownerPeer: normalizeActorPeer(source.ownerPeer || source.actorPeer),
      metadata: normalizeMetadata(source.metadata)
    };
  }

  function shapeAuthorityMetadata(input) {
    var source = safeObject(input);
    return {
      schema: AUTHORITY_SCHEMA,
      platformId: cleanString(source.platformId),
      surfaceKind: cleanString(source.surfaceKind),
      declaredAuthority: normalizeAuthorityLevel(source.declaredAuthority || source.authorityLevel),
      rawDeclaredAuthority: cleanString(source.declaredAuthority || source.authorityLevel),
      effectiveAuthority: normalizeAuthorityLevel(source.effectiveAuthority || source.declaredAuthority || source.authorityLevel),
      rawEffectiveAuthority: cleanString(source.effectiveAuthority || source.declaredAuthority || source.authorityLevel),
      requiredAuthority: normalizeAuthorityLevel(source.requiredAuthority),
      rawRequiredAuthority: cleanString(source.requiredAuthority),
      capability: normalizeCapability(source.capability || source.requestedCapability),
      rawCapability: cleanString(source.capability || source.requestedCapability),
      actorPeer: normalizeActorPeer(source.actorPeer),
      approvedByPeer: normalizeActorPeer(source.approvedByPeer),
      createdAtIso: cleanString(source.createdAtIso),
      expiresAtIso: cleanString(source.expiresAtIso),
      metadata: normalizeMetadata(source.metadata)
    };
  }

  function shapeOwnerHandoff(input) {
    var source = safeObject(input);
    var owner = shapeOwnerDeclaration(source.owner || source.ownerDeclaration || source);
    var authority = shapeAuthorityMetadata(source.authority || source.authorityMetadata || source);
    return {
      schema: HANDOFF_SCHEMA,
      handoffId: cleanString(source.handoffId || source.requestId),
      handoffStatus: normalizeOwnerHandoffStatus(source.handoffStatus || source.status),
      rawHandoffStatus: cleanString(source.handoffStatus || source.status),
      ownerKind: owner.ownerKind,
      rawOwnerKind: owner.rawOwnerKind,
      ownerId: owner.ownerId,
      subjectType: cleanString(source.subjectType),
      subjectId: lowerHash(source.subjectId),
      operation: cleanString(source.operation),
      operationIntent: cleanString(source.operationIntent),
      requestedCapability: normalizeCapability(source.requestedCapability || authority.capability),
      rawRequestedCapability: cleanString(source.requestedCapability || authority.rawCapability),
      lineageId: cleanString(source.lineageId),
      eventDigest: lowerHash(source.eventDigest),
      dedupeKey: lowerHash(source.dedupeKey),
      handoffReason: cleanString(source.handoffReason || source.reason),
      createdAtIso: cleanString(source.createdAtIso),
      expiresAtIso: cleanString(source.expiresAtIso),
      requestedByPeer: normalizeActorPeer(source.requestedByPeer || source.actorPeer),
      owner: owner,
      authority: authority,
      metadata: normalizeMetadata(source.metadata)
    };
  }

  function result(blockers, warnings, handoff, owner, extra) {
    var out = {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      valid: blockers.length === 0,
      handoff: handoff || null,
      owner: owner || null,
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

  function scanPrivacy(value, policy, blockers, warnings) {
    if (typeof kernel.scanPrivacy !== 'function') return;
    var scanPolicy = Object.assign({
      subjectType: 'owner-handoff',
      redactionClass: 'redacted',
      allowedRedactionClasses: ['redacted']
    }, safeObject(policy.privacyPolicy));
    var scan = kernel.scanPrivacy(value, scanPolicy);
    codeList(scan.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(scan.warnings).forEach(function (code) { addCode(warnings, code); });
  }

  function validateOwnerDeclaration(input, policy) {
    var options = normalizePolicy(policy);
    var owner = shapeOwnerDeclaration(input);
    var blockers = [];
    var warnings = [];

    if (!owner.ownerKind) {
      addCode(blockers, 'owner-kind-invalid');
    } else if (options.allowedOwnerKinds.indexOf(owner.ownerKind) === -1) {
      addCode(blockers, 'owner-kind-not-allowed');
    }
    if (!owner.ownerId) addCode(blockers, 'owner-id-required');
    if (owner.ownerNameHash && !isSha256Hex(owner.ownerNameHash)) addCode(blockers, 'owner-nameHash-invalid');
    if (!owner.authorityLevel) {
      addCode(blockers, 'owner-authority-level-invalid');
    } else if (options.allowedAuthorityLevels.indexOf(owner.authorityLevel) === -1) {
      addCode(blockers, 'owner-authority-level-not-allowed');
    }
    owner.capabilities.forEach(function (capability) {
      if (CAPABILITIES.indexOf(capability) === -1) addCode(blockers, 'owner-capability-invalid');
      if (options.allowedCapabilities.indexOf(capability) === -1) addCode(blockers, 'owner-capability-not-allowed');
    });
    if (!owner.capabilities.length) addCode(warnings, 'owner-capabilities-empty');
    validateActorPeer(owner.ownerPeer, blockers, 'owner', options.requireActorPeer);
    scanPrivacy(owner, options, blockers, warnings);

    return result(blockers, warnings, null, owner);
  }

  function validateAuthorityMetadata(input, policy) {
    var options = normalizePolicy(policy);
    var authority = shapeAuthorityMetadata(input);
    var blockers = [];
    var warnings = [];

    if (options.requireAuthority && !authority.declaredAuthority) {
      addCode(blockers, 'authority-declared-invalid');
    } else if (authority.declaredAuthority &&
      options.allowedAuthorityLevels.indexOf(authority.declaredAuthority) === -1) {
      addCode(blockers, 'authority-declared-not-allowed');
    }
    if (options.requireAuthority && !authority.effectiveAuthority) {
      addCode(blockers, 'authority-effective-invalid');
    } else if (authority.effectiveAuthority &&
      options.allowedAuthorityLevels.indexOf(authority.effectiveAuthority) === -1) {
      addCode(blockers, 'authority-effective-not-allowed');
    }
    if (authority.rawRequiredAuthority && !authority.requiredAuthority) {
      addCode(blockers, 'authority-required-invalid');
    }
    if (options.requiredAuthorityLevel && authority.effectiveAuthority !== options.requiredAuthorityLevel) {
      addCode(blockers, 'authority-required-level-mismatch');
    }
    if (authority.rawCapability && !authority.capability) {
      addCode(blockers, 'authority-capability-invalid');
    } else if (authority.capability && options.allowedCapabilities.indexOf(authority.capability) === -1) {
      addCode(blockers, 'authority-capability-not-allowed');
    }
    if (options.requiredCapability && authority.capability !== options.requiredCapability) {
      addCode(blockers, 'authority-required-capability-mismatch');
    }
    validateActorPeer(authority.actorPeer, blockers, 'authority', options.requireActorPeer);
    if (authority.createdAtIso && !isIso(authority.createdAtIso)) addCode(blockers, 'authority-createdAtIso-invalid');
    if (!isIsoOrEmpty(authority.expiresAtIso)) addCode(blockers, 'authority-expiresAtIso-invalid');
    scanPrivacy(authority, options, blockers, warnings);

    return result(blockers, warnings, null, null, {
      authority: authority
    });
  }

  function validateOwnerCapability(owner, handoff, options, blockers) {
    if (!options.requireOwnerCapability) return;
    if (!handoff.requestedCapability) return;
    if (!owner.capabilities.length) {
      addCode(blockers, 'owner-capability-proof-missing');
      return;
    }
    if (owner.capabilities.indexOf(handoff.requestedCapability) === -1) {
      addCode(blockers, 'owner-capability-mismatch');
    }
  }

  function validateOwnerHandoff(input, policy) {
    var options = normalizePolicy(policy);
    var handoff = shapeOwnerHandoff(input);
    var owner = handoff.owner;
    var blockers = [];
    var warnings = [];

    if (!handoff.handoffId) addCode(blockers, 'handoff-id-required');
    if (!handoff.handoffStatus) {
      addCode(blockers, 'handoff-status-invalid');
    }
    if (!handoff.ownerKind) {
      addCode(blockers, 'owner-kind-invalid');
    } else if (options.allowedOwnerKinds.indexOf(handoff.ownerKind) === -1) {
      addCode(blockers, 'owner-kind-not-allowed');
    }
    if (!handoff.ownerId) addCode(blockers, 'owner-id-required');
    if (options.requireSubject) {
      if (!handoff.subjectType) addCode(blockers, 'handoff-subjectType-required');
      if (!isSha256Hex(handoff.subjectId)) addCode(blockers, 'handoff-subjectId-invalid');
    } else if (handoff.subjectId && !isSha256Hex(handoff.subjectId)) {
      addCode(blockers, 'handoff-subjectId-invalid');
    }
    if (!handoff.operation && !handoff.operationIntent) addCode(blockers, 'handoff-operation-required');
    if (handoff.rawRequestedCapability && !handoff.requestedCapability) {
      addCode(blockers, 'handoff-capability-invalid');
    } else if (handoff.requestedCapability && options.allowedCapabilities.indexOf(handoff.requestedCapability) === -1) {
      addCode(blockers, 'handoff-capability-not-allowed');
    }
    if (options.requiredCapability && handoff.requestedCapability !== options.requiredCapability) {
      addCode(blockers, 'handoff-required-capability-mismatch');
    }
    if (options.requireLineage && !handoff.lineageId) addCode(blockers, 'handoff-lineage-required');
    if (handoff.eventDigest && !isSha256Hex(handoff.eventDigest)) addCode(blockers, 'handoff-eventDigest-invalid');
    if (handoff.dedupeKey && !isSha256Hex(handoff.dedupeKey)) addCode(blockers, 'handoff-dedupeKey-invalid');
    if (!isIsoOrEmpty(handoff.createdAtIso)) addCode(blockers, 'handoff-createdAtIso-invalid');
    if (!isIsoOrEmpty(handoff.expiresAtIso)) addCode(blockers, 'handoff-expiresAtIso-invalid');
    validateActorPeer(handoff.requestedByPeer, blockers, 'handoff-requestedBy', options.requireActorPeer);

    var ownerValidation = validateOwnerDeclaration(owner, options);
    codeList(ownerValidation.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ownerValidation.warnings).forEach(function (code) { addCode(warnings, code); });

    var authorityValidation = validateAuthorityMetadata(handoff.authority, options);
    codeList(authorityValidation.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(authorityValidation.warnings).forEach(function (code) { addCode(warnings, code); });

    validateOwnerCapability(owner, handoff, options, blockers);
    scanPrivacy(handoff, options, blockers, warnings);

    return result(blockers, warnings, handoff, owner, {
      authority: handoff.authority,
      handoffReady: blockers.length === 0
    });
  }

  kernel.OWNER_HANDOFF_OWNER_KINDS = OWNER_KINDS.slice();
  kernel.OWNER_HANDOFF_STATUSES = HANDOFF_STATUSES.slice();
  kernel.normalizeOwnerKind = normalizeOwnerKind;
  kernel.normalizeOwnerHandoffStatus = normalizeOwnerHandoffStatus;
  kernel.shapeOwnerDeclaration = shapeOwnerDeclaration;
  kernel.validateOwnerDeclaration = validateOwnerDeclaration;
  kernel.shapeAuthorityMetadata = shapeAuthorityMetadata;
  kernel.validateAuthorityMetadata = validateAuthorityMetadata;
  kernel.shapeOwnerHandoff = shapeOwnerHandoff;
  kernel.validateOwnerHandoff = validateOwnerHandoff;
  kernel.__ownerHandoffInstalled = true;
  kernel.__ownerHandoffVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
