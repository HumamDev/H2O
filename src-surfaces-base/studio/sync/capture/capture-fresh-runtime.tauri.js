/* H2O Desktop Sync - F14.5.8 capture fresh runtime
 *
 * Tauri-only fresh capture lane. Builds new redacted CaptureArtifact and
 * CaptureEvent subjects from already-redacted fresh capture evidence.
 *
 * Safety invariants:
 *   - Fresh mode only; recovery fields are blocked.
 *   - No storage writes, publication, relay/outbox, Native call, F5 review,
 *     execute-lane dispatch, remote apply, or cross-install transfer.
 *   - Uses kernel identity, privacy/domain scans, owner handoff, audit,
 *     consumed-operation, watermark, replay, and result-shape helpers.
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
  if (H2O.Desktop.Sync.__captureFreshRuntimeInstalled) return;

  var VERSION = '0.1.0-f14.5.8';
  var RESULT_SCHEMA = 'h2o.desktop.sync.capture-fresh-runtime-result.v1';
  var ARTIFACT_SCHEMA = 'h2o.capture.artifact.v1';
  var EVENT_SCHEMA = 'h2o.capture.event.v1';
  var SUBJECT_TYPE = 'capture.artifact';
  var OPERATION = 'capture-fresh';
  var OPERATION_INTENT = 'create';
  var POLICY_VERSION = 'f14.5.8';
  var DENYLIST_VERSION = 'capture-denylist-v1';
  var REDACTED = 'redacted';
  var METADATA_ONLY = 'metadata-only';
  var PROOF_ISO = '2026-06-01T10:00:00Z';

  var SOURCE_KINDS = [
    'chatgpt-live',
    'claude-live',
    'chatgpt-import',
    'manual-redacted',
    'native-mirror',
    'studio-bundle-import'
  ];
  var ORIGINS = ['live', 'import', 'manual', 'mirror'];
  var OBSERVATION_SOURCES = [
    'page-localStorage',
    'native-mirror',
    'extension-message',
    'desktop-import',
    'mobile-import',
    'manual-entry'
  ];
  var ARTIFACT_KINDS = [
    'chat-snapshot-digest',
    'turn-selection-digest',
    'attachment-metadata-digest',
    'capture-store-digest',
    'manual-redacted-evidence'
  ];
  var LENGTH_BUCKETS = ['empty', 'short', 'medium', 'long', 'very-long', 'unknown'];
  var STATUS_BUCKETS = ['new', 'reviewed', 'archived', 'converted', 'dismissed', 'other'];
  var KIND_BUCKETS = ['captureSnippetKind', 'attachmentMetadataKind', 'aggregateDigestKind', 'otherKind'];
  var RECOVERY_FIELDS = [
    'recoveredFromSubjectIdHash',
    'recoveryProvenance',
    'recoveryTrustGrade',
    'recoveryAtIso'
  ];
  var CAPTURE_FOREVER_NO_FIELDS = [
    'body', 'content', 'contentHtml', 'contentText', 'html', 'markdown',
    'messages', 'message', 'text', 'title', 'tags', 'routeSuggestion',
    'attachments', 'attachmentBytes', 'file', 'filename', 'path', 'url',
    'href', 'sourceUrl', 'accountId', 'chatId', 'snapshotId', 'turnId',
    'itemId', 'messageId', 'msgId', 'model', 'email', 'password', 'apiKey',
    'token', 'accessToken', 'refreshToken'
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function isSha256Hex(value) { return /^[0-9a-f]{64}$/.test(cleanLower(value)); }
  function isIso(value) { var text = cleanString(value); return !!text && Number.isFinite(Date.parse(text)); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }

  function getKernel() {
    return (H2O.Desktop && H2O.Desktop.Sync && H2O.Desktop.Sync.kernel) || null;
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

  function uniqueCodes(value) {
    var out = [];
    codeList(value).forEach(function (code) { addCode(out, code); });
    return out;
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
    var kernel = getKernel();
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
    var kernel = getKernel();
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
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) { /* fall through */ }
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
  }

  function valueAtPath(input, path) {
    var cursor = input;
    for (var i = 0; i < path.length; i += 1) {
      if (!isObject(cursor)) return undefined;
      cursor = cursor[path[i]];
    }
    return cursor;
  }

  function firstString(input, paths) {
    for (var i = 0; i < paths.length; i += 1) {
      var v = valueAtPath(input, paths[i]);
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  function firstNumber(input, paths) {
    for (var i = 0; i < paths.length; i += 1) {
      var v = valueAtPath(input, paths[i]);
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
  }

  function normalizeEnum(value, allowed, fallback) {
    var text = cleanString(value);
    return allowed.indexOf(text) === -1 ? fallback : text;
  }

  function normalizeIso(value, fallback) {
    var text = cleanString(value);
    if (isIso(text)) return new Date(text).toISOString().replace(/\.\d{3}Z$/, 'Z');
    return fallback;
  }

  function normalizeActorPeer(input) {
    var source = safeObject(input.actorPeer || input.producer || input.ownerPeer);
    return {
      physicalDeviceIdHash: cleanLower(source.physicalDeviceIdHash),
      installIdHash: cleanLower(source.installIdHash),
      syncPeerIdHash: cleanLower(source.syncPeerIdHash || source.producerPeerIdHash),
      surfaceKind: cleanString(source.surfaceKind || 'desktop-tauri')
    };
  }

  function normalizeProducer(input, actorPeer) {
    var source = safeObject(input.producer);
    return {
      platformId: normalizeEnum(source.platformId || input.platformId, ['desktop-studio', 'chrome-studio', 'native-extension', 'mobile'], 'desktop-studio'),
      surfaceKind: normalizeEnum(source.surfaceKind || input.surfaceKind || actorPeer.surfaceKind, ['desktop-tauri', 'browser-studio', 'browser-runtime', 'mobile'], 'desktop-tauri'),
      producerPeerIdHash: cleanLower(source.producerPeerIdHash || source.syncPeerIdHash || actorPeer.syncPeerIdHash),
      installIdHash: cleanLower(source.installIdHash || actorPeer.installIdHash),
      sequence: Number.isInteger(source.sequence) && source.sequence >= 0 ? source.sequence : null
    };
  }

  function normalizeOwner(input) {
    var owner = safeObject(input.owner);
    return {
      ownerWorkspaceIdHash: cleanLower(owner.ownerWorkspaceIdHash || input.ownerWorkspaceIdHash || input.workspaceIdHash),
      ownerAccountIdHash: cleanLower(owner.ownerAccountIdHash || input.ownerAccountIdHash),
      ownerPeerIdHash: cleanLower(owner.ownerPeerIdHash || input.ownerPeerIdHash)
    };
  }

  function normalizeSource(input) {
    var source = safeObject(input.source);
    var sourceKind = normalizeEnum(source.sourceKind || input.sourceKind, SOURCE_KINDS, 'chatgpt-live');
    var originFallback = sourceKind === 'native-mirror' ? 'mirror' :
      sourceKind === 'manual-redacted' ? 'manual' :
        sourceKind.indexOf('import') !== -1 ? 'import' : 'live';
    var out = {
      sourceKind: sourceKind,
      origin: normalizeEnum(source.origin || input.origin, ORIGINS, originFallback),
      sourceSubjectHash: cleanLower(source.sourceSubjectHash || input.sourceSubjectHash),
      captureSessionIdHash: cleanLower(source.captureSessionIdHash || input.captureSessionIdHash)
    };
    var observationSource = normalizeEnum(source.observationSource || input.observationSource, OBSERVATION_SOURCES, '');
    if (observationSource) out.observationSource = observationSource;
    return out;
  }

  function normalizeIdentity(input, source) {
    var identity = safeObject(input.identity);
    return {
      sourceSubjectHash: cleanLower(identity.sourceSubjectHash || source.sourceSubjectHash),
      chatIdHash: cleanLower(identity.chatIdHash || input.chatIdHash),
      snapshotIdHash: cleanLower(identity.snapshotIdHash || input.snapshotIdHash),
      turnIdHash: cleanLower(identity.turnIdHash || input.turnIdHash),
      sourceItemIdHash: cleanLower(identity.sourceItemIdHash || input.sourceItemIdHash),
      captureSessionIdHash: cleanLower(identity.captureSessionIdHash || source.captureSessionIdHash)
    };
  }

  function normalizeSummary(input) {
    var summary = safeObject(input.summary);
    var itemCount = firstNumber(input, [['summary', 'itemCount'], ['itemCount']]);
    var turnCount = firstNumber(input, [['summary', 'turnCount'], ['turnCount']]);
    var attachmentCount = firstNumber(input, [['summary', 'attachmentCount'], ['attachmentCount']]);
    var out = {
      redactionClass: normalizeEnum(summary.redactionClass || input.redactionClass, [REDACTED, METADATA_ONLY], REDACTED),
      evidenceDigest: cleanLower(summary.evidenceDigest || input.evidenceDigest),
      lengthBucket: normalizeEnum(summary.lengthBucket || input.lengthBucket, LENGTH_BUCKETS, 'unknown')
    };
    if (itemCount != null) out.itemCount = Math.max(0, Math.floor(itemCount));
    if (turnCount != null) out.turnCount = Math.max(0, Math.floor(turnCount));
    if (attachmentCount != null) out.attachmentCount = Math.max(0, Math.floor(attachmentCount));
    var statusBucket = normalizeEnum(summary.statusBucket || input.statusBucket, STATUS_BUCKETS, '');
    if (statusBucket) out.statusBucket = statusBucket;
    var kindBucket = normalizeEnum(summary.kindBucket || input.kindBucket, KIND_BUCKETS, '');
    if (kindBucket) out.kindBucket = kindBucket;
    return out;
  }

  function collectForbiddenKeys(value, out) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) collectForbiddenKeys(value[i], out);
      return;
    }
    if (!isObject(value)) return;
    Object.keys(value).forEach(function (key) {
      if (CAPTURE_FOREVER_NO_FIELDS.indexOf(key) !== -1) addCode(out, key);
      if (/token$/i.test(key)) addCode(out, key);
      collectForbiddenKeys(value[key], out);
    });
  }

  function hasAnyKey(value, keys) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) if (hasAnyKey(value[i], keys)) return true;
      return false;
    }
    if (!isObject(value)) return false;
    var own = Object.keys(value);
    for (var k = 0; k < own.length; k += 1) {
      if (keys.indexOf(own[k]) !== -1) return true;
      if (hasAnyKey(value[own[k]], keys)) return true;
    }
    return false;
  }

  function scanCapturePrivacy(value, blockers, warnings) {
    var kernel = getKernel();
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var domainScan = kernel.scanDomainForbiddenFields('capture.fresh', value);
        codeList(domainScan && domainScan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(domainScan && domainScan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'capture-domain-forbidden-scan-threw');
      }
    }
    if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        var scan = kernel.scanPrivacy(value, {
          subjectType: SUBJECT_TYPE,
          redactionClass: REDACTED,
          allowedRedactionClasses: [REDACTED, METADATA_ONLY],
          forbiddenList: CAPTURE_FOREVER_NO_FIELDS,
          foreverNoFields: CAPTURE_FOREVER_NO_FIELDS
        });
        codeList(scan && scan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(scan && scan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'capture-privacy-scan-threw');
      }
    }
    var localHits = [];
    collectForbiddenKeys(value, localHits);
    if (localHits.length) addCode(blockers, 'capture-denylist-raw-content');
  }

  function validateNormalized(parts, blockers) {
    if (!isSha256Hex(parts.actorPeer.physicalDeviceIdHash)) addCode(blockers, 'capture-actor-peer-invalid');
    if (!isSha256Hex(parts.actorPeer.installIdHash)) addCode(blockers, 'capture-actor-peer-invalid');
    if (!isSha256Hex(parts.actorPeer.syncPeerIdHash)) addCode(blockers, 'capture-actor-peer-invalid');
    if (!isSha256Hex(parts.producer.producerPeerIdHash)) addCode(blockers, 'capture-producer-peer-invalid');
    if (!isSha256Hex(parts.producer.installIdHash)) addCode(blockers, 'capture-producer-install-invalid');
    if (!isSha256Hex(parts.owner.ownerWorkspaceIdHash)) addCode(blockers, 'capture-owner-workspace-invalid');
    if (parts.owner.ownerAccountIdHash && !isSha256Hex(parts.owner.ownerAccountIdHash)) addCode(blockers, 'capture-owner-account-invalid');
    if (parts.owner.ownerPeerIdHash && !isSha256Hex(parts.owner.ownerPeerIdHash)) addCode(blockers, 'capture-owner-peer-invalid');
    if (!isSha256Hex(parts.source.sourceSubjectHash)) addCode(blockers, 'capture-source-subject-invalid');
    ['chatIdHash', 'snapshotIdHash', 'turnIdHash', 'sourceItemIdHash', 'captureSessionIdHash'].forEach(function (field) {
      if (parts.identity[field] && !isSha256Hex(parts.identity[field])) addCode(blockers, 'capture-identity-hash-invalid');
    });
    if (!isSha256Hex(parts.summary.evidenceDigest)) addCode(blockers, 'capture-evidence-digest-invalid');
    ['itemCount', 'turnCount', 'attachmentCount'].forEach(function (field) {
      if (typeof parts.summary[field] !== 'undefined' &&
          (!Number.isInteger(parts.summary[field]) || parts.summary[field] < 0)) {
        addCode(blockers, 'capture-summary-counter-invalid');
      }
    });
  }

  function validationSummary(status, blockers, warnings) {
    return {
      status: status,
      policyVersion: 'f14.5.1',
      denylistVersion: DENYLIST_VERSION,
      blockers: uniqueCodes(blockers),
      warnings: uniqueCodes(warnings)
    };
  }

  function stripForPayloadHash(value) {
    var clone = JSON.parse(JSON.stringify(value));
    delete clone.audit;
    delete clone.validation;
    if (clone.replay) {
      delete clone.replay.payloadHash;
      delete clone.replay.eventDigest;
    }
    return clone;
  }

  function stripForEventDigest(value) {
    var clone = JSON.parse(JSON.stringify(value));
    delete clone.audit;
    if (clone.validation) {
      delete clone.validation.blockers;
      delete clone.validation.warnings;
    }
    if (clone.replay) delete clone.replay.eventDigest;
    return clone;
  }

  async function artifactIdentity(parts) {
    return sha256Hex([
      'h2o.capture.artifact.identity.v1',
      parts.owner.ownerWorkspaceIdHash,
      parts.source.sourceKind,
      parts.source.sourceSubjectHash,
      parts.identity.chatIdHash || null,
      parts.identity.snapshotIdHash || null,
      parts.identity.turnIdHash || null,
      parts.identity.sourceItemIdHash || null,
      parts.artifactKind
    ]);
  }

  async function artifactRevision(artifactIdHash, parts) {
    return sha256Hex([
      'h2o.capture.artifact.revision.v1',
      artifactIdHash,
      parts.summary.redactionClass,
      parts.summary.evidenceDigest,
      parts.summary.lengthBucket || null,
      typeof parts.summary.itemCount === 'number' ? parts.summary.itemCount : null,
      typeof parts.summary.turnCount === 'number' ? parts.summary.turnCount : null,
      typeof parts.summary.attachmentCount === 'number' ? parts.summary.attachmentCount : null,
      parts.summary.statusBucket || null,
      parts.summary.kindBucket || null
    ]);
  }

  function shapeOwnerPreview(parts, artifactIdHash, artifactRevisionHash, lineageId, dedupeKey, createdAtIso) {
    var kernel = getKernel();
    var handoff = {
      handoffId: generateUuid(),
      handoffStatus: 'validated',
      ownerKind: 'desktop-store',
      ownerId: parts.owner.ownerWorkspaceIdHash,
      subjectType: SUBJECT_TYPE,
      subjectId: artifactIdHash,
      operation: OPERATION,
      operationIntent: OPERATION_INTENT,
      requestedCapability: 'produceEvidence',
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      handoffReason: 'fresh-capture-canonical-subject-preview',
      createdAtIso: createdAtIso,
      requestedByPeer: parts.actorPeer,
      owner: {
        ownerKind: 'desktop-store',
        ownerId: parts.owner.ownerWorkspaceIdHash,
        ownerNameHash: parts.owner.ownerWorkspaceIdHash,
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        authorityLevel: 'strong-local-authority',
        capabilities: ['read', 'produceEvidence', 'ownerHandoff'],
        subjectTypes: [SUBJECT_TYPE],
        domains: ['capture'],
        ownerPeer: parts.actorPeer,
        metadata: { mode: 'fresh', runtimePhase: 'f14.5.8' }
      },
      authority: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        declaredAuthority: 'strong-local-authority',
        effectiveAuthority: 'strong-local-authority',
        requiredAuthority: 'strong-local-authority',
        capability: 'produceEvidence',
        actorPeer: parts.actorPeer,
        approvedByPeer: parts.actorPeer,
        createdAtIso: createdAtIso,
        metadata: { artifactRevisionHash: artifactRevisionHash }
      },
      metadata: { mode: 'fresh', previewOnly: true }
    };
    if (!kernel || typeof kernel.validateOwnerHandoff !== 'function') {
      return { ok: false, blockers: ['capture-owner-handoff-kernel-unavailable'], warnings: [], handoff: handoff };
    }
    return kernel.validateOwnerHandoff(handoff, {
      allowedOwnerKinds: ['desktop-store'],
      allowedCapabilities: ['read', 'produceEvidence', 'ownerHandoff'],
      allowedAuthorityLevels: ['strong-local-authority'],
      requiredAuthorityLevel: 'strong-local-authority',
      requiredCapability: 'produceEvidence',
      requireActorPeer: true,
      requireSubject: true,
      requireLineage: true,
      requireAuthority: true,
      requireOwnerCapability: true,
      privacyPolicy: {
        subjectType: SUBJECT_TYPE,
        redactionClass: REDACTED,
        allowedRedactionClasses: [REDACTED]
      }
    });
  }

  function shapeConsumedPreview(parts, artifactIdHash, lineageId, eventDigest, dedupeKey, createdAtIso, consumedRows, blockers, warnings) {
    var kernel = getKernel();
    var candidate = {
      consumedId: generateUuid(),
      eventDigest: eventDigest,
      dedupeKey: dedupeKey,
      lineageId: lineageId,
      subjectId: artifactIdHash,
      sourcePeerId: parts.actorPeer.syncPeerIdHash,
      envelopeKind: 'evidence',
      operationKind: OPERATION,
      consumedStatus: blockers.length ? 'blocked' : 'consumed',
      consumedAtIso: createdAtIso,
      actorPeer: parts.actorPeer,
      originTag: {
        originKind: 'local',
        sourcePeerId: parts.actorPeer.syncPeerIdHash,
        sourcePlatform: 'desktop-studio',
        envelopeKind: 'evidence',
        operationKind: OPERATION,
        lineageId: lineageId,
        eventDigest: eventDigest,
        dedupeKey: dedupeKey
      },
      reason: 'fresh-capture-preview-only',
      validationSummary: {
        ok: blockers.length === 0,
        checkedAtIso: createdAtIso,
        blockers: uniqueCodes(blockers),
        warnings: uniqueCodes(warnings)
      }
    };
    if (!kernel || typeof kernel.validateReplayCandidate !== 'function') {
      return { ok: false, replaySafe: false, blockers: ['capture-consumed-kernel-unavailable'], warnings: [], consumedOperation: candidate };
    }
    return kernel.validateReplayCandidate({
      rows: asArray(consumedRows),
      candidate: candidate
    });
  }

  function hasTerminalDedupe(rows, dedupeKey) {
    var target = cleanLower(dedupeKey);
    if (!isSha256Hex(target)) return false;
    var terminal = ['consumed', 'duplicate', 'replay', 'expired', 'superseded'];
    var list = asArray(rows);
    for (var i = 0; i < list.length; i += 1) {
      var row = safeObject(list[i]);
      if (cleanLower(row.dedupeKey) === target &&
          terminal.indexOf(cleanString(row.consumedStatus || row.status)) !== -1) {
        return true;
      }
    }
    return false;
  }

  function shapeWatermarkPreview(parts, artifactIdHash, artifactRevisionHash, lineageId, dedupeKey, createdAtIso, currentWatermark) {
    var kernel = getKernel();
    var proposed = {
      watermarkId: generateUuid(),
      peerId: parts.actorPeer.syncPeerIdHash,
      subjectId: artifactIdHash,
      lineageId: lineageId,
      revisionHash: artifactRevisionHash,
      watermarkAtIso: createdAtIso,
      recordedAtIso: createdAtIso,
      dedupeKey: dedupeKey
    };
    if (!kernel || typeof kernel.shapeWatermarkState !== 'function') {
      return { ok: false, blockers: ['capture-watermark-kernel-unavailable'], warnings: [], proposedWatermark: proposed };
    }
    return kernel.shapeWatermarkState({
      currentWatermark: currentWatermark || null,
      proposedWatermark: proposed,
      requireAdvance: false,
      allowIdempotent: true
    });
  }

  function shapeReplayPreview(parts, artifactIdHash, artifactRevisionHash, lineageId, eventDigest, dedupeKey, consumedResult, watermarkResult) {
    var kernel = getKernel();
    var candidate = {
      subjectType: SUBJECT_TYPE,
      subjectId: artifactIdHash,
      operation: OPERATION,
      operationKind: OPERATION,
      operationIntent: OPERATION_INTENT,
      baseHash: artifactRevisionHash,
      targetHash: artifactRevisionHash,
      revisionHash: artifactRevisionHash,
      lineageId: lineageId,
      eventDigest: eventDigest,
      dedupeKey: dedupeKey,
      actorPeer: parts.actorPeer,
      originTag: {
        originKind: 'local',
        sourcePeerId: parts.actorPeer.syncPeerIdHash,
        sourcePlatform: 'desktop-studio',
        envelopeKind: 'evidence',
        operationKind: OPERATION,
        lineageId: lineageId,
        eventDigest: eventDigest,
        dedupeKey: dedupeKey
      },
      metadata: { mode: 'fresh', previewOnly: true }
    };
    if (!kernel || typeof kernel.composeReplayDefense !== 'function') {
      return { ok: false, replaySafe: false, blockers: ['capture-replay-kernel-unavailable'], warnings: [], candidate: candidate };
    }
    return kernel.composeReplayDefense({
      candidate: candidate,
      identity: {
        subjectType: SUBJECT_TYPE,
        subjectId: artifactIdHash,
        operation: OPERATION,
        baseHash: artifactRevisionHash,
        actorPeer: parts.actorPeer
      },
      consumed: {
        rows: asArray(consumedResult && consumedResult.existingConsumedOperation ? [consumedResult.existingConsumedOperation] : []),
        candidate: consumedResult && consumedResult.consumedOperation
      },
      watermark: {
        currentWatermark: watermarkResult && watermarkResult.currentWatermark,
        proposedWatermark: watermarkResult && watermarkResult.proposedWatermark,
        requireAdvance: false,
        allowIdempotent: true
      },
      originTag: candidate.originTag
    }, {
      requireIdentity: true,
      requireConsumedOperation: true,
      requireWatermark: true,
      requireOriginTag: true
    });
  }

  function shapeAuditPreview(parts, artifactIdHash, artifactRevisionHash, lineageId, eventDigest, dedupeKey, createdAtIso, blockers, warnings) {
    var kernel = getKernel();
    var audit = {
      auditId: generateUuid(),
      auditMaintenanceId: generateUuid(),
      domain: 'capture',
      subjectType: SUBJECT_TYPE,
      subjectId: artifactIdHash,
      operation: OPERATION,
      operationIntent: OPERATION_INTENT,
      lineageId: lineageId,
      eventDigest: eventDigest,
      dedupeKey: dedupeKey,
      transactionId: '',
      actorPeer: parts.actorPeer,
      preStateHash: '',
      postStateHash: artifactRevisionHash,
      auditResult: blockers.length ? 'blocked' : 'dry-run',
      auditAtIso: createdAtIso,
      validationSummary: {
        ok: blockers.length === 0,
        blockers: uniqueCodes(blockers),
        warnings: uniqueCodes(warnings)
      },
      metadata: {
        domain: 'capture',
        subjectType: SUBJECT_TYPE,
        subjectId: artifactIdHash,
        operation: OPERATION,
        operationIntent: OPERATION_INTENT,
        lineageId: lineageId,
        eventDigest: eventDigest,
        dedupeKey: dedupeKey,
        actorPeer: parts.actorPeer,
        policyVersion: POLICY_VERSION,
        predicateVersion: 'capture-fresh-v1',
        createdAtIso: createdAtIso,
        metadata: { mode: 'fresh', previewOnly: true }
      }
    };
    if (!kernel || typeof kernel.validateAuditRecord !== 'function') {
      return { ok: false, blockers: ['capture-audit-kernel-unavailable'], warnings: [], audit: audit };
    }
    return kernel.validateAuditRecord(audit, {
      allowedDomains: ['capture'],
      allowedAuditResults: ['dry-run', 'blocked'],
      requireAuditId: true,
      requireSubject: true,
      requireLineage: true,
      requireActorPeer: true,
      requireTimestamp: true,
      requireTransactionId: false,
      privacyPolicy: {
        subjectType: SUBJECT_TYPE,
        redactionClass: REDACTED,
        allowedRedactionClasses: [REDACTED]
      }
    });
  }

  async function buildAuditKeys(parts, artifactIdHash, artifactRevisionHash, objectSchema, eventDigest, validation) {
    var validationResultHash = await sha256Hex([
      'h2o.capture.validation-result.v1',
      validation.status,
      validation.policyVersion,
      validation.denylistVersion,
      validation.blockers,
      validation.warnings
    ]);
    var denylistScanHash = await sha256Hex([
      'h2o.capture.denylist-scan.v1',
      'kernel.scanPrivacy',
      DENYLIST_VERSION,
      objectSchema,
      validation.blockers,
      validation.warnings
    ]);
    var custodyChainHash = await sha256Hex([
      'h2o.capture.custody-chain.v1',
      parts.producer,
      parts.source,
      parts.owner,
      eventDigest
    ]);
    var auditKey = await sha256Hex([
      'h2o.capture.audit-key.v1',
      parts.owner.ownerWorkspaceIdHash,
      parts.producer.producerPeerIdHash,
      artifactIdHash,
      artifactRevisionHash,
      objectSchema,
      eventDigest
    ]);
    return {
      auditKey: auditKey,
      custodyChainHash: custodyChainHash,
      validationResultHash: validationResultHash,
      denylistScanHash: denylistScanHash
    };
  }

  async function canonicalizeCaptureFresh(input) {
    var sourceInput = safeObject(input);
    var createdAtIso = normalizeIso(sourceInput.capturedAtIso || sourceInput.eventAtIso || sourceInput.nowIso, nowIsoSeconds());
    var blockers = [];
    var warnings = [];

    if (!isObject(input)) addCode(blockers, 'capture-input-not-object');
    if (hasAnyKey(sourceInput, RECOVERY_FIELDS)) addCode(blockers, 'capture-recovery-field-present');
    scanCapturePrivacy(sourceInput, blockers, warnings);

    var actorPeer = normalizeActorPeer(sourceInput);
    var producer = normalizeProducer(sourceInput, actorPeer);
    var owner = normalizeOwner(sourceInput);
    var source = normalizeSource(sourceInput);
    var identity = normalizeIdentity(sourceInput, source);
    var summary = normalizeSummary(sourceInput);
    var artifactKind = normalizeEnum(sourceInput.artifactKind, ARTIFACT_KINDS, 'chat-snapshot-digest');
    var parts = {
      actorPeer: actorPeer,
      producer: producer,
      owner: owner,
      source: source,
      identity: identity,
      summary: summary,
      artifactKind: artifactKind
    };
    validateNormalized(parts, blockers);

    if (blockers.length) {
      return createDomainResult({
        ok: false,
        actionable: false,
        blockers: blockers,
        warnings: warnings,
        canonicalArtifact: null,
        canonicalEvent: null,
        sideEffects: sideEffects()
      });
    }

    var artifactIdHash = await artifactIdentity(parts);
    var artifactRevisionHash = await artifactRevision(artifactIdHash, parts);
    if (!isSha256Hex(artifactIdHash)) addCode(blockers, 'capture-artifact-identity-failed');
    if (!isSha256Hex(artifactRevisionHash)) addCode(blockers, 'capture-artifact-revision-failed');

    var kernel = getKernel();
    var identityKit = null;
    if (kernel && typeof kernel.buildIdentityKit === 'function') {
      identityKit = await kernel.buildIdentityKit({
        subjectType: SUBJECT_TYPE,
        subjectId: artifactIdHash,
        operation: OPERATION,
        baseHash: artifactRevisionHash,
        actorPeer: actorPeer
      });
      codeList(identityKit && identityKit.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(identityKit && identityKit.warnings).forEach(function (code) { addCode(warnings, code); });
    } else {
      addCode(blockers, 'capture-identity-kernel-unavailable');
    }
    var lineageId = cleanString(identityKit && identityKit.lineageId);
    var dedupeKey = cleanLower(identityKit && identityKit.dedupeKey);
    if (!lineageId) addCode(blockers, 'capture-lineage-id-missing');
    if (!isSha256Hex(dedupeKey)) addCode(blockers, 'capture-dedupe-key-invalid');

    var validation = validationSummary(blockers.length ? 'blocked' : 'accepted', blockers, warnings);
    var replayBase = {
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      payloadHash: '',
      eventDigest: '',
      sourceWatermark: null
    };
    var artifact = {
      schema: ARTIFACT_SCHEMA,
      schemaVersion: 1,
      artifactIdHash: artifactIdHash,
      artifactRevisionHash: artifactRevisionHash,
      artifactKind: artifactKind,
      artifactState: blockers.length ? 'blocked' : 'captured',
      capturedAtIso: createdAtIso,
      updatedAtIso: createdAtIso,
      owner: owner,
      source: source,
      identity: identity,
      summary: summary,
      replay: replayBase,
      audit: {
        auditKey: '',
        custodyChainHash: '',
        validationResultHash: '',
        denylistScanHash: ''
      },
      validation: validation
    };
    artifact.replay.payloadHash = await sha256Hex(stripForPayloadHash(artifact));
    artifact.replay.eventDigest = await sha256Hex(stripForEventDigest(artifact));
    artifact.audit = await buildAuditKeys(parts, artifactIdHash, artifactRevisionHash, ARTIFACT_SCHEMA, artifact.replay.eventDigest, validation);

    var eventReplay = {
      lineageId: lineageId,
      dedupeKey: await sha256Hex(['h2o.capture.event.dedupe.v1', dedupeKey, artifactIdHash, artifactRevisionHash, 'observed']),
      payloadHash: '',
      eventDigest: '',
      sourceWatermark: null
    };
    var event = {
      schema: EVENT_SCHEMA,
      schemaVersion: 1,
      eventId: generateUuid(),
      eventKind: blockers.length ? 'validation-blocked' : 'observed',
      eventAtIso: createdAtIso,
      producer: producer,
      owner: owner,
      source: source,
      subject: {
        subjectType: SUBJECT_TYPE,
        artifactIdHash: artifactIdHash,
        artifactRevisionHash: artifactRevisionHash
      },
      replay: eventReplay,
      audit: {
        auditKey: '',
        custodyChainHash: '',
        validationResultHash: '',
        denylistScanHash: ''
      },
      validation: validation
    };
    if (identity.chatIdHash) event.subject.chatIdHash = identity.chatIdHash;
    if (identity.snapshotIdHash) event.subject.snapshotIdHash = identity.snapshotIdHash;
    if (identity.turnIdHash) event.subject.turnIdHash = identity.turnIdHash;
    event.replay.payloadHash = await sha256Hex(stripForPayloadHash(event));
    event.replay.eventDigest = await sha256Hex(stripForEventDigest(event));
    event.audit = await buildAuditKeys(parts, artifactIdHash, artifactRevisionHash, EVENT_SCHEMA, event.replay.eventDigest, validation);

    scanCapturePrivacy(artifact, blockers, warnings);
    scanCapturePrivacy(event, blockers, warnings);
    if (hasAnyKey(artifact, RECOVERY_FIELDS) || hasAnyKey(event, RECOVERY_FIELDS)) {
      addCode(blockers, 'capture-recovery-field-emitted');
    }
    if (blockers.length) {
      artifact.validation = validationSummary('blocked', blockers, warnings);
      artifact.artifactState = 'blocked';
      event.validation = artifact.validation;
      event.eventKind = 'validation-blocked';
    }

    return createDomainResult({
      ok: blockers.length === 0,
      actionable: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      canonicalArtifact: artifact,
      canonicalEvent: event,
      sideEffects: sideEffects()
    });
  }

  async function previewCaptureFresh(input) {
    var sourceInput = safeObject(input);
    var canonical = await canonicalizeCaptureFresh(sourceInput);
    var blockers = uniqueCodes(canonical.blockers);
    var warnings = uniqueCodes(canonical.warnings);
    var artifact = canonical.canonicalArtifact;
    var event = canonical.canonicalEvent;

    if (!artifact || !event) {
      return createDomainResult({
        ok: false,
        actionable: false,
        blockers: blockers,
        warnings: warnings,
        canonicalArtifact: artifact,
        canonicalEvent: event,
        sideEffects: sideEffects()
      });
    }

    var parts = {
      actorPeer: normalizeActorPeer(sourceInput),
      producer: artifact.source ? normalizeProducer(sourceInput, normalizeActorPeer(sourceInput)) : {},
      owner: artifact.owner,
      source: artifact.source,
      identity: artifact.identity,
      summary: artifact.summary,
      artifactKind: artifact.artifactKind
    };

    var ownerHandoff = shapeOwnerPreview(
      parts,
      artifact.artifactIdHash,
      artifact.artifactRevisionHash,
      artifact.replay.lineageId,
      artifact.replay.dedupeKey,
      artifact.capturedAtIso
    );
    codeList(ownerHandoff && ownerHandoff.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ownerHandoff && ownerHandoff.warnings).forEach(function (code) { addCode(warnings, code); });

    var watermark = shapeWatermarkPreview(
      parts,
      artifact.artifactIdHash,
      artifact.artifactRevisionHash,
      artifact.replay.lineageId,
      artifact.replay.dedupeKey,
      artifact.capturedAtIso,
      sourceInput.currentWatermark
    );
    codeList(watermark && watermark.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(watermark && watermark.warnings).forEach(function (code) { addCode(warnings, code); });

    var consumed = shapeConsumedPreview(
      parts,
      artifact.artifactIdHash,
      artifact.replay.lineageId,
      event.replay.eventDigest,
      event.replay.dedupeKey,
      artifact.capturedAtIso,
      sourceInput.consumedRows,
      blockers,
      warnings
    );
    codeList(consumed && consumed.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(consumed && consumed.warnings).forEach(function (code) { addCode(warnings, code); });
    if (hasTerminalDedupe(sourceInput.consumedRows, event.replay.dedupeKey)) {
      addCode(blockers, 'capture-replay-duplicate');
    }

    var replay = shapeReplayPreview(
      parts,
      artifact.artifactIdHash,
      artifact.artifactRevisionHash,
      artifact.replay.lineageId,
      event.replay.eventDigest,
      event.replay.dedupeKey,
      consumed,
      watermark
    );
    codeList(replay && replay.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(replay && replay.warnings).forEach(function (code) { addCode(warnings, code); });

    var audit = shapeAuditPreview(
      parts,
      artifact.artifactIdHash,
      artifact.artifactRevisionHash,
      artifact.replay.lineageId,
      event.replay.eventDigest,
      event.replay.dedupeKey,
      artifact.capturedAtIso,
      blockers,
      warnings
    );
    codeList(audit && audit.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(audit && audit.warnings).forEach(function (code) { addCode(warnings, code); });

    var ok = blockers.length === 0;
    if (!ok) {
      artifact.validation = validationSummary('blocked', blockers, warnings);
      artifact.artifactState = 'blocked';
      event.validation = artifact.validation;
      event.eventKind = 'validation-blocked';
    }

    return createDomainResult({
      ok: ok,
      actionable: ok,
      blockers: blockers,
      warnings: warnings,
      canonicalArtifact: artifact,
      canonicalEvent: event,
      ownerHandoffPreview: ownerHandoff && ownerHandoff.handoff,
      ownerHandoffValidation: ownerHandoff,
      auditRecordPreview: audit && audit.audit,
      auditValidation: audit,
      consumedOperationPreview: consumed && consumed.consumedOperation,
      consumedValidation: consumed,
      watermarkPreview: watermark && watermark.proposedWatermark,
      watermarkValidation: watermark,
      replayValidation: replay,
      sideEffects: sideEffects()
    });
  }

  function sideEffects() {
    return {
      storageWritten: false,
      localBookkeepingWritten: false,
      publicationQueued: false,
      relayQueued: false,
      outboxQueued: false,
      nativeMutation: false,
      f5ReviewActivity: false,
      executeLaneDispatched: false,
      remoteApply: false,
      crossInstallTransfer: false
    };
  }

  function createDomainResult(input, extraFields) {
    var kernel = getKernel();
    var value = safeObject(input);
    var extra = {
      canonicalArtifact: value.canonicalArtifact || null,
      canonicalEvent: value.canonicalEvent || null,
      ownerHandoffPreview: value.ownerHandoffPreview || null,
      ownerHandoffValidation: value.ownerHandoffValidation || null,
      auditRecordPreview: value.auditRecordPreview || null,
      auditValidation: value.auditValidation || null,
      consumedOperationPreview: value.consumedOperationPreview || null,
      consumedValidation: value.consumedValidation || null,
      watermarkPreview: value.watermarkPreview || null,
      watermarkValidation: value.watermarkValidation || null,
      replayValidation: value.replayValidation || null,
      sideEffects: value.sideEffects || sideEffects(),
      runtimeMode: 'fresh',
      recoveryMode: false,
      version: VERSION
    };
    if (isObject(extraFields)) {
      Object.keys(extraFields).forEach(function (key) {
        extra[key] = extraFields[key];
      });
    }
    if (kernel && typeof kernel.createResult === 'function') {
      return kernel.createResult({
        schema: RESULT_SCHEMA,
        ok: value.ok === true,
        actionable: value.actionable === true,
        blockers: uniqueCodes(value.blockers),
        warnings: uniqueCodes(value.warnings),
        metadata: { runtimeMode: 'fresh', phase: 'f14.5.8' },
        extra: extra
      });
    }
    return Object.assign({
      schema: RESULT_SCHEMA,
      ok: value.ok === true,
      actionable: value.actionable === true,
      blockers: uniqueCodes(value.blockers),
      warnings: uniqueCodes(value.warnings),
      metadata: { runtimeMode: 'fresh', phase: 'f14.5.8' }
    }, extra);
  }

  async function proofFixture() {
    var actorPeer = {
      physicalDeviceIdHash: await sha256Hex('capture-fresh-proof-device'),
      installIdHash: await sha256Hex('capture-fresh-proof-install'),
      syncPeerIdHash: await sha256Hex('capture-fresh-proof-peer'),
      surfaceKind: 'desktop-tauri'
    };
    var ownerWorkspaceIdHash = await sha256Hex('capture-fresh-proof-workspace');
    var sourceSubjectHash = await sha256Hex('capture-fresh-proof-source-subject');
    var chatIdHash = await sha256Hex('capture-fresh-proof-chat');
    var snapshotIdHash = await sha256Hex('capture-fresh-proof-snapshot');
    var sourceItemIdHash = await sha256Hex('capture-fresh-proof-item');
    var evidenceDigest = await sha256Hex('capture-fresh-proof-redacted-evidence');
    return {
      nowIso: PROOF_ISO,
      capturedAtIso: PROOF_ISO,
      actorPeer: actorPeer,
      owner: {
        ownerWorkspaceIdHash: ownerWorkspaceIdHash,
        ownerPeerIdHash: actorPeer.syncPeerIdHash
      },
      source: {
        sourceKind: 'chatgpt-live',
        origin: 'live',
        observationSource: 'desktop-import',
        sourceSubjectHash: sourceSubjectHash
      },
      identity: {
        sourceSubjectHash: sourceSubjectHash,
        chatIdHash: chatIdHash,
        snapshotIdHash: snapshotIdHash,
        sourceItemIdHash: sourceItemIdHash
      },
      artifactKind: 'chat-snapshot-digest',
      summary: {
        redactionClass: REDACTED,
        evidenceDigest: evidenceDigest,
        lengthBucket: 'medium',
        itemCount: 1,
        turnCount: 8,
        attachmentCount: 0,
        statusBucket: 'new',
        kindBucket: 'captureSnippetKind'
      }
    };
  }

  function outputContainsNeedle(value, needle) {
    return canonicalJson(value).indexOf(needle) !== -1;
  }

  function allSideEffectsFalse(result) {
    var effects = safeObject(result && result.sideEffects);
    return Object.keys(effects).every(function (key) { return effects[key] === false; });
  }

  async function runCaptureFreshRuntimeProof() {
    var validInput = await proofFixture();
    var valid = await previewCaptureFresh(validInput);
    var duplicateInput = Object.assign({}, validInput, {
      consumedRows: valid.consumedOperationPreview ? [Object.assign({}, valid.consumedOperationPreview, {
        consumedStatus: 'consumed'
      })] : []
    });
    var duplicate = await previewCaptureFresh(duplicateInput);
    var privacyInput = Object.assign({}, validInput, { text: 'raw proof content must not pass' });
    var privacy = await previewCaptureFresh(privacyInput);
    var recoveryInput = Object.assign({}, validInput, {
      recoveredFromSubjectIdHash: await sha256Hex('not-fresh')
    });
    var recovery = await previewCaptureFresh(recoveryInput);

    var checks = {
      validFreshCaptureProducesCanonicalArtifact: valid.ok === true &&
        valid.canonicalArtifact && valid.canonicalArtifact.schema === ARTIFACT_SCHEMA,
      validFreshCaptureProducesCanonicalEvent: valid.ok === true &&
        valid.canonicalEvent && valid.canonicalEvent.schema === EVENT_SCHEMA,
      newSubjectIdentityGenerated: valid.canonicalArtifact &&
        isSha256Hex(valid.canonicalArtifact.artifactIdHash) &&
        isSha256Hex(valid.canonicalArtifact.artifactRevisionHash),
      rawContentBlockedFromConvergenceOutput: privacy.ok === false &&
        codeList(privacy.blockers).indexOf('capture-denylist-raw-content') !== -1 &&
        !outputContainsNeedle(valid, 'raw proof content must not pass'),
      allowedBucketsAndHashesEmitted: valid.canonicalArtifact &&
        valid.canonicalArtifact.summary.lengthBucket === 'medium' &&
        valid.canonicalArtifact.summary.kindBucket === 'captureSnippetKind' &&
        isSha256Hex(valid.canonicalArtifact.summary.evidenceDigest),
      recoveryFieldsAbsent: !hasAnyKey(valid, RECOVERY_FIELDS),
      recoveryFieldsBlocked: recovery.ok === false &&
        codeList(recovery.blockers).indexOf('capture-recovery-field-present') !== -1,
      replayDuplicateBlocked: duplicate.ok === false &&
        codeList(duplicate.blockers).indexOf('capture-replay-duplicate') !== -1,
      privacyViolationBlocked: privacy.ok === false,
      noPublicationRelayOutboxF5OrExecuteActivity: allSideEffectsFalse(valid)
    };
    var ok = Object.keys(checks).every(function (key) { return checks[key] === true; });
    return createDomainResult({
      ok: ok,
      actionable: false,
      blockers: ok ? [] : ['capture-fresh-runtime-proof-failed'],
      warnings: [],
      sideEffects: sideEffects(),
      canonicalArtifact: valid.canonicalArtifact,
      canonicalEvent: valid.canonicalEvent
    }, {
      checks: checks
    });
  }

  H2O.Desktop.Sync.canonicalizeCaptureFresh = canonicalizeCaptureFresh;
  H2O.Desktop.Sync.previewCaptureFresh = previewCaptureFresh;
  H2O.Desktop.Sync.runCaptureFreshRuntimeProof = runCaptureFreshRuntimeProof;
  H2O.Desktop.Sync.__captureFreshRuntimeInstalled = true;
  H2O.Desktop.Sync.__captureFreshRuntimeVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
