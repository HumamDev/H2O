/* H2O Desktop Sync - F14.5.9 capture recovery runtime
 *
 * Tauri-only recovery capture lane. Canonicalizes external redacted evidence
 * into a NEW snapshot subject linked back to the lost/degraded subject via
 * a redacted hash, per the F14.4.12 snapshot recovery contract.
 *
 * Safety invariants:
 *   - Recovery mode only. Fresh-mode behavior is unchanged; this module
 *     installs alongside capture-fresh-runtime and does not mutate any
 *     fresh-mode export.
 *   - The recovered subjectId is always newly generated; the lost subjectId
 *     is never reused, derived from, or echoed in raw form.
 *   - The lost subject lifecycle is read-only to this lane.
 *   - No storage writes, publication, relay/outbox, Native call, F5 review
 *     state mutation, execute-lane dispatch, remote apply, cross-install
 *     transfer, or watermark/consumed-op writes.
 *   - chatgpt-export-zip provenance is blocked with
 *     `recovery-provenance-zip-deferred` per the deferral list.
 *   - Uses kernel identity, privacy, owner handoff, audit, consumed-operation,
 *     watermark, replay, result-shape, and F5-review shape helpers directly.
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
  H2O.Capture = H2O.Capture || {};
  if (H2O.Desktop.Sync.__captureRecoveryRuntimeInstalled) return;

  var VERSION = '0.1.0-f14.5.9';
  var RESULT_SCHEMA = 'h2o.desktop.sync.capture-recovery-runtime-result.v1';
  var RECOVERY_SUBJECT_SCHEMA = 'h2o.snapshot.recovery-subject.v1';
  var RECOVERY_EVENT_SCHEMA = 'h2o.snapshot.recovery-event.v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var OPERATION = 'capture-recovery';
  var OPERATION_INTENT = 'create';
  var POLICY_VERSION = 'f14.5.9';
  var PREDICATE_VERSION = 'capture-recovery-v1';
  var DENYLIST_VERSION = 'capture-recovery-denylist-v1';
  var REDACTED = 'redacted';
  var METADATA_ONLY = 'metadata-only';
  var PROOF_ISO = '2026-06-01T10:00:00Z';

  var RECOVERY_PROVENANCES = [
    'studio-full-bundle-v2',
    'mv3-cache-export',
    'manual-redacted-evidence'
  ];
  var DEFERRED_PROVENANCES = ['chatgpt-export-zip'];
  var TRUST_GRADES = ['high', 'medium', 'low'];
  var HIGH_TRUST_PROVENANCES = ['studio-full-bundle-v2', 'mv3-cache-export'];
  var LOW_TRUST_PROVENANCES = ['manual-redacted-evidence'];

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

  var BOOKKEEPING_SOURCE_VALIDATED = 'snapshot-recovery-source-validated';
  var BOOKKEEPING_APPLIED = 'snapshot-recovery-applied';
  var BOOKKEEPING_CROSS_REFERENCE = 'snapshot-recovery-cross-reference-applied';
  var F5_ANNOTATION_CODE = 'recovery-occurred-during-review';
  var F5_OPEN_STATUSES = ['generated', 'pending-review', 'pending-approved'];

  // Recovery output denylist intentionally OMITS the four recovery linkage
  // fields (recoveredFromSubjectIdHash, recoveryProvenance, recoveryTrustGrade,
  // recoveryAtIso) so they may appear on the recovery subject/event. All other
  // forbidden fields from the capture domain are preserved.
  var RECOVERY_FOREVER_NO_FIELDS = [
    'body', 'content', 'contentHtml', 'contentText', 'html', 'markdown',
    'messages', 'message', 'text', 'title', 'tags', 'routeSuggestion',
    'attachments', 'attachmentBytes', 'file', 'filename', 'path', 'url',
    'href', 'sourceUrl', 'accountId', 'chatId', 'snapshotId', 'turnId',
    'itemId', 'messageId', 'msgId', 'model', 'email', 'password', 'apiKey',
    'token', 'accessToken', 'refreshToken'
  ];

  // Recovery linkage fields are allowed on outputs only; if any of these
  // appear on caller INPUT we treat that as a configuration error, except
  // the explicit lostSubjectIdHash / recoveryProvenance / recoveryAtIso
  // parameters at top-level.
  var RECOVERY_FIELDS = [
    'recoveredFromSubjectIdHash',
    'recoveryTrustGrade'
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
      platformId: normalizeEnum(source.platformId || input.platformId,
        ['desktop-studio', 'chrome-studio', 'native-extension', 'mobile'], 'desktop-studio'),
      surfaceKind: normalizeEnum(source.surfaceKind || input.surfaceKind || actorPeer.surfaceKind,
        ['desktop-tauri', 'browser-studio', 'browser-runtime', 'mobile'], 'desktop-tauri'),
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

  function trustGradeForProvenance(provenance) {
    if (HIGH_TRUST_PROVENANCES.indexOf(provenance) !== -1) return 'high';
    if (LOW_TRUST_PROVENANCES.indexOf(provenance) !== -1) return 'low';
    return '';
  }

  function collectForbiddenKeys(value, out) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) collectForbiddenKeys(value[i], out);
      return;
    }
    if (!isObject(value)) return;
    Object.keys(value).forEach(function (key) {
      if (RECOVERY_FOREVER_NO_FIELDS.indexOf(key) !== -1) addCode(out, key);
      if (/token$/i.test(key) && key !== 'previewToken') addCode(out, key);
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

  // Privacy scan tailored for recovery output. Avoids the kernel's
  // 'capture' domain forbidden list because that list rejects the four
  // recovery linkage fields that MUST appear on recovery outputs. Calls
  // kernel.scanPrivacy directly with a curated forbidden list and runs
  // a local denylist sweep to defend in depth.
  function scanRecoveryPrivacy(value, blockers, warnings) {
    var kernel = getKernel();
    if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        var scan = kernel.scanPrivacy(value, {
          subjectType: SUBJECT_TYPE,
          redactionClass: REDACTED,
          allowedRedactionClasses: [REDACTED, METADATA_ONLY],
          forbiddenList: RECOVERY_FOREVER_NO_FIELDS,
          foreverNoFields: RECOVERY_FOREVER_NO_FIELDS
        });
        codeList(scan && scan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(scan && scan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'capture-recovery-privacy-scan-threw');
      }
    }
    var localHits = [];
    collectForbiddenKeys(value, localHits);
    if (localHits.length) addCode(blockers, 'capture-recovery-denylist-raw-content');
  }

  function validateNormalized(parts, blockers) {
    if (!isSha256Hex(parts.actorPeer.physicalDeviceIdHash)) addCode(blockers, 'capture-recovery-actor-peer-invalid');
    if (!isSha256Hex(parts.actorPeer.installIdHash)) addCode(blockers, 'capture-recovery-actor-peer-invalid');
    if (!isSha256Hex(parts.actorPeer.syncPeerIdHash)) addCode(blockers, 'capture-recovery-actor-peer-invalid');
    if (!isSha256Hex(parts.producer.producerPeerIdHash)) addCode(blockers, 'capture-recovery-producer-peer-invalid');
    if (!isSha256Hex(parts.producer.installIdHash)) addCode(blockers, 'capture-recovery-producer-install-invalid');
    if (!isSha256Hex(parts.owner.ownerWorkspaceIdHash)) addCode(blockers, 'capture-recovery-owner-workspace-invalid');
    if (parts.owner.ownerAccountIdHash && !isSha256Hex(parts.owner.ownerAccountIdHash)) {
      addCode(blockers, 'capture-recovery-owner-account-invalid');
    }
    if (parts.owner.ownerPeerIdHash && !isSha256Hex(parts.owner.ownerPeerIdHash)) {
      addCode(blockers, 'capture-recovery-owner-peer-invalid');
    }
    if (!isSha256Hex(parts.lostSubjectIdHash)) addCode(blockers, 'capture-recovery-lost-subject-hash-invalid');
    if (parts.summary.evidenceDigest && !isSha256Hex(parts.summary.evidenceDigest)) {
      addCode(blockers, 'capture-recovery-evidence-digest-invalid');
    }
    ['itemCount', 'turnCount', 'attachmentCount'].forEach(function (field) {
      if (typeof parts.summary[field] !== 'undefined' &&
          (!Number.isInteger(parts.summary[field]) || parts.summary[field] < 0)) {
        addCode(blockers, 'capture-recovery-summary-counter-invalid');
      }
    });
  }

  function validationSummary(status, blockers, warnings) {
    return {
      status: status,
      policyVersion: POLICY_VERSION,
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

  // Recovery subjectId derivation MUST NOT reuse the lost subjectId nor
  // be derived from it. We seed with a freshly generated UUID plus the
  // owner/provenance/recovery timestamp tuple so that the same physical
  // recovery attempt is reproducible within a run but distinct across runs.
  async function recoverySubjectIdentity(parts, recoveryNonce) {
    return sha256Hex([
      'h2o.snapshot.recovery-subject.identity.v1',
      parts.owner.ownerWorkspaceIdHash,
      parts.recoveryProvenance,
      parts.recoveryAtIso,
      recoveryNonce
    ]);
  }

  // Recovery dedupeKey is deterministic over the (owner, lost subject,
  // provenance, evidence) tuple. This is the replay-protection key: two
  // attempts to recover the same lost subject from the same redacted
  // evidence collide here, even though each attempt mints a fresh random
  // subjectId. Without this, replay detection over consumed-op rows would
  // be impossible by construction.
  async function recoverySubjectDedupeKey(parts) {
    return sha256Hex([
      'h2o.snapshot.recovery-subject.dedupe.v1',
      parts.owner.ownerWorkspaceIdHash,
      parts.lostSubjectIdHash,
      parts.recoveryProvenance,
      parts.summary.evidenceDigest || ''
    ]);
  }

  async function recoveryEventDedupeKey(subjectDedupeKey, parts) {
    return sha256Hex([
      'h2o.snapshot.recovery-event.dedupe.v1',
      subjectDedupeKey,
      parts.recoveryProvenance,
      'recovered'
    ]);
  }

  async function recoverySubjectRevision(subjectIdHash, parts) {
    return sha256Hex([
      'h2o.snapshot.recovery-subject.revision.v1',
      subjectIdHash,
      parts.summary.redactionClass,
      parts.summary.evidenceDigest || null,
      parts.summary.lengthBucket || null,
      typeof parts.summary.itemCount === 'number' ? parts.summary.itemCount : null,
      typeof parts.summary.turnCount === 'number' ? parts.summary.turnCount : null,
      typeof parts.summary.attachmentCount === 'number' ? parts.summary.attachmentCount : null,
      parts.summary.statusBucket || null,
      parts.summary.kindBucket || null,
      parts.recoveryTrustGrade
    ]);
  }

  function shapeOwnerPreview(parts, subjectIdHash, revisionHash, lineageId, dedupeKey, createdAtIso) {
    var kernel = getKernel();
    var handoff = {
      handoffId: generateUuid(),
      handoffStatus: 'validated',
      ownerKind: 'snapshot-domain',
      ownerId: parts.owner.ownerWorkspaceIdHash,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectIdHash,
      operation: OPERATION,
      operationIntent: OPERATION_INTENT,
      requestedCapability: 'produceEvidence',
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      handoffReason: 'capture-recovery-canonical-subject-preview',
      createdAtIso: createdAtIso,
      requestedByPeer: parts.actorPeer,
      owner: {
        ownerKind: 'snapshot-domain',
        ownerId: parts.owner.ownerWorkspaceIdHash,
        ownerNameHash: parts.owner.ownerWorkspaceIdHash,
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        authorityLevel: 'strong-local-authority',
        capabilities: ['read', 'produceEvidence', 'ownerHandoff'],
        subjectTypes: [SUBJECT_TYPE],
        domains: ['snapshot', 'capture'],
        ownerPeer: parts.actorPeer,
        metadata: { mode: 'recovery', runtimePhase: POLICY_VERSION }
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
        metadata: { revisionHash: revisionHash }
      },
      metadata: { mode: 'recovery', previewOnly: true }
    };
    if (!kernel || typeof kernel.validateOwnerHandoff !== 'function') {
      return { ok: false, blockers: ['capture-recovery-owner-handoff-kernel-unavailable'], warnings: [], handoff: handoff };
    }
    return kernel.validateOwnerHandoff(handoff, {
      allowedOwnerKinds: ['snapshot-domain'],
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

  function shapeConsumedPreview(parts, subjectIdHash, lineageId, eventDigest, dedupeKey, createdAtIso,
      consumedRows, blockers, warnings) {
    var kernel = getKernel();
    var candidate = {
      consumedId: generateUuid(),
      eventDigest: eventDigest,
      dedupeKey: dedupeKey,
      lineageId: lineageId,
      subjectId: subjectIdHash,
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
      reason: 'capture-recovery-preview-only',
      validationSummary: {
        ok: blockers.length === 0,
        checkedAtIso: createdAtIso,
        blockers: uniqueCodes(blockers),
        warnings: uniqueCodes(warnings)
      }
    };
    if (!kernel || typeof kernel.validateReplayCandidate !== 'function') {
      return { ok: false, replaySafe: false, blockers: ['capture-recovery-consumed-kernel-unavailable'], warnings: [], consumedOperation: candidate };
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

  function shapeWatermarkPreview(parts, subjectIdHash, revisionHash, lineageId, dedupeKey, createdAtIso, currentWatermark) {
    var kernel = getKernel();
    var proposed = {
      watermarkId: generateUuid(),
      peerId: parts.actorPeer.syncPeerIdHash,
      subjectId: subjectIdHash,
      lineageId: lineageId,
      revisionHash: revisionHash,
      watermarkAtIso: createdAtIso,
      recordedAtIso: createdAtIso,
      dedupeKey: dedupeKey
    };
    if (!kernel || typeof kernel.shapeWatermarkState !== 'function') {
      return { ok: false, blockers: ['capture-recovery-watermark-kernel-unavailable'], warnings: [], proposedWatermark: proposed };
    }
    return kernel.shapeWatermarkState({
      currentWatermark: currentWatermark || null,
      proposedWatermark: proposed,
      requireAdvance: false,
      allowIdempotent: true
    });
  }

  function shapeReplayPreview(parts, subjectIdHash, revisionHash, lineageId, eventDigest, dedupeKey, consumedResult, watermarkResult) {
    var kernel = getKernel();
    var candidate = {
      subjectType: SUBJECT_TYPE,
      subjectId: subjectIdHash,
      operation: OPERATION,
      operationKind: OPERATION,
      operationIntent: OPERATION_INTENT,
      baseHash: revisionHash,
      targetHash: revisionHash,
      revisionHash: revisionHash,
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
      metadata: { mode: 'recovery', previewOnly: true }
    };
    if (!kernel || typeof kernel.composeReplayDefense !== 'function') {
      return { ok: false, replaySafe: false, blockers: ['capture-recovery-replay-kernel-unavailable'], warnings: [], candidate: candidate };
    }
    return kernel.composeReplayDefense({
      candidate: candidate,
      identity: {
        subjectType: SUBJECT_TYPE,
        subjectId: subjectIdHash,
        operation: OPERATION,
        baseHash: revisionHash,
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

  function shapeAuditPreview(parts, subjectIdHash, revisionHash, lineageId, eventDigest, dedupeKey, createdAtIso, blockers, warnings) {
    var kernel = getKernel();
    var audit = {
      auditId: generateUuid(),
      auditMaintenanceId: generateUuid(),
      domain: 'capture',
      subjectType: SUBJECT_TYPE,
      subjectId: subjectIdHash,
      operation: OPERATION,
      operationIntent: OPERATION_INTENT,
      lineageId: lineageId,
      eventDigest: eventDigest,
      dedupeKey: dedupeKey,
      transactionId: '',
      actorPeer: parts.actorPeer,
      preStateHash: '',
      postStateHash: revisionHash,
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
        subjectId: subjectIdHash,
        operation: OPERATION,
        operationIntent: OPERATION_INTENT,
        lineageId: lineageId,
        eventDigest: eventDigest,
        dedupeKey: dedupeKey,
        actorPeer: parts.actorPeer,
        policyVersion: POLICY_VERSION,
        predicateVersion: PREDICATE_VERSION,
        createdAtIso: createdAtIso,
        metadata: { mode: 'recovery', previewOnly: true }
      }
    };
    if (!kernel || typeof kernel.validateAuditRecord !== 'function') {
      return { ok: false, blockers: ['capture-recovery-audit-kernel-unavailable'], warnings: [], audit: audit };
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

  async function buildAuditKeys(parts, subjectIdHash, revisionHash, objectSchema, eventDigest, validation) {
    var validationResultHash = await sha256Hex([
      'h2o.snapshot.recovery.validation-result.v1',
      validation.status,
      validation.policyVersion,
      validation.denylistVersion,
      validation.blockers,
      validation.warnings
    ]);
    var denylistScanHash = await sha256Hex([
      'h2o.snapshot.recovery.denylist-scan.v1',
      'kernel.scanPrivacy',
      DENYLIST_VERSION,
      objectSchema,
      validation.blockers,
      validation.warnings
    ]);
    var custodyChainHash = await sha256Hex([
      'h2o.snapshot.recovery.custody-chain.v1',
      parts.producer,
      parts.owner,
      parts.recoveryProvenance,
      parts.recoveryTrustGrade,
      eventDigest
    ]);
    var auditKey = await sha256Hex([
      'h2o.snapshot.recovery.audit-key.v1',
      parts.owner.ownerWorkspaceIdHash,
      parts.producer.producerPeerIdHash,
      subjectIdHash,
      revisionHash,
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

  function bookkeepingEntry(code, parts, subjectIdHash, lineageId, dedupeKey, eventDigest, createdAtIso, extra) {
    var entry = {
      schema: 'h2o.snapshot.recovery-bookkeeping-entry.v1',
      code: code,
      domain: 'snapshot',
      subjectType: SUBJECT_TYPE,
      recoveredSubjectIdHash: subjectIdHash,
      recoveredFromSubjectIdHash: parts.lostSubjectIdHash,
      recoveryProvenance: parts.recoveryProvenance,
      recoveryTrustGrade: parts.recoveryTrustGrade,
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      eventDigest: eventDigest,
      recordedAtIso: createdAtIso,
      ownerWorkspaceIdHash: parts.owner.ownerWorkspaceIdHash,
      sideEffects: {
        publicationQueued: false,
        relayQueued: false,
        outboxQueued: false,
        nativeMutation: false,
        f5ReviewActivity: false,
        watermarkWritten: false,
        consumedOperationWritten: false,
        lostSubjectMutated: false,
        storageWritten: false
      }
    };
    if (isObject(extra)) {
      Object.keys(extra).forEach(function (key) {
        if (typeof extra[key] !== 'undefined') entry[key] = extra[key];
      });
    }
    return entry;
  }

  function buildBookkeepingEntries(parts, subjectIdHash, revisionHash, lineageId, dedupeKey, eventDigest, createdAtIso, sourceSummary) {
    var entries = [];
    entries.push(bookkeepingEntry(BOOKKEEPING_SOURCE_VALIDATED,
      parts, subjectIdHash, lineageId, dedupeKey, eventDigest, createdAtIso, {
        sourceSummary: sourceSummary
      }));
    entries.push(bookkeepingEntry(BOOKKEEPING_APPLIED,
      parts, subjectIdHash, lineageId, dedupeKey, eventDigest, createdAtIso, {
        revisionHash: revisionHash,
        applyResult: 'preview-only'
      }));
    entries.push(bookkeepingEntry(BOOKKEEPING_CROSS_REFERENCE,
      parts, subjectIdHash, lineageId, dedupeKey, eventDigest, createdAtIso, {
        crossReferenceKind: 'recovered-from-prior-subject',
        lostSubjectMutated: false
      }));
    return entries;
  }

  // Best-effort F5 review annotation. Validates the caller-supplied review
  // through the kernel shape. If the review is open (one of the open
  // statuses) emit the annotation entry; otherwise drop it. Either way the
  // review state itself is never altered and f5ReviewActivity stays false.
  function buildF5Annotation(openF5Review, parts, subjectIdHash, lineageId, dedupeKey, eventDigest, createdAtIso, warnings) {
    if (!openF5Review) return null;
    var kernel = getKernel();
    var shaped = null;
    if (kernel && typeof kernel.shapeF5Review === 'function') {
      try { shaped = kernel.shapeF5Review(openF5Review); }
      catch (_) { addCode(warnings, 'capture-recovery-f5-review-shape-threw'); }
    } else {
      addCode(warnings, 'capture-recovery-f5-review-shape-unavailable');
    }
    var reviewStatus = cleanString(shaped && shaped.reviewStatus);
    if (!reviewStatus || F5_OPEN_STATUSES.indexOf(reviewStatus) === -1) {
      addCode(warnings, 'capture-recovery-f5-review-not-open');
      return null;
    }
    var reviewId = cleanString(shaped && shaped.reviewId) || cleanString(openF5Review && openF5Review.reviewId);
    return {
      schema: 'h2o.snapshot.recovery-f5-annotation.v1',
      code: F5_ANNOTATION_CODE,
      annotationOnly: true,
      reviewStateChanged: false,
      reviewId: reviewId,
      reviewStatus: reviewStatus,
      recoveredSubjectIdHash: subjectIdHash,
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      eventDigest: eventDigest,
      annotatedAtIso: createdAtIso
    };
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
      crossInstallTransfer: false,
      lostSubjectMutated: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
  }

  function createDomainResult(input, extraFields) {
    var kernel = getKernel();
    var value = safeObject(input);
    var extra = {
      canonicalRecoverySubject: value.canonicalRecoverySubject || null,
      canonicalRecoveryEvent: value.canonicalRecoveryEvent || null,
      bookkeepingEntries: asArray(value.bookkeepingEntries),
      f5ReviewAnnotation: value.f5ReviewAnnotation || null,
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
      runtimeMode: 'recovery',
      recoveryMode: true,
      recoveryProvenance: value.recoveryProvenance || '',
      recoveryTrustGrade: value.recoveryTrustGrade || '',
      lostSubjectIdHash: value.lostSubjectIdHash || '',
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
        metadata: { runtimeMode: 'recovery', phase: POLICY_VERSION },
        extra: extra
      });
    }
    return Object.assign({
      schema: RESULT_SCHEMA,
      ok: value.ok === true,
      actionable: value.actionable === true,
      blockers: uniqueCodes(value.blockers),
      warnings: uniqueCodes(value.warnings),
      metadata: { runtimeMode: 'recovery', phase: POLICY_VERSION }
    }, extra);
  }

  async function canonicalizeCaptureRecovery(input) {
    var sourceInput = safeObject(input);
    var blockers = [];
    var warnings = [];

    if (!isObject(input)) addCode(blockers, 'capture-recovery-input-not-object');

    // Block any caller-supplied derived recovery fields on input. Allowed
    // top-level recovery inputs are lostSubjectIdHash, recoveryProvenance,
    // recoveryAtIso. The derived fields (recoveredFromSubjectIdHash,
    // recoveryTrustGrade) must be computed, not injected.
    if (hasAnyKey(sourceInput, RECOVERY_FIELDS)) {
      addCode(blockers, 'capture-recovery-derived-field-on-input');
    }

    var rawProvenance = cleanString(sourceInput.recoveryProvenance);
    var recoveryProvenance = '';
    if (!rawProvenance) {
      addCode(blockers, 'capture-recovery-provenance-missing');
    } else if (DEFERRED_PROVENANCES.indexOf(rawProvenance) !== -1) {
      addCode(blockers, 'recovery-provenance-zip-deferred');
    } else if (RECOVERY_PROVENANCES.indexOf(rawProvenance) === -1) {
      addCode(blockers, 'capture-recovery-provenance-invalid');
    } else {
      recoveryProvenance = rawProvenance;
    }

    var lostSubjectIdHash = cleanLower(sourceInput.lostSubjectIdHash);
    if (!lostSubjectIdHash) {
      addCode(blockers, 'capture-recovery-lost-subject-hash-missing');
    } else if (!isSha256Hex(lostSubjectIdHash)) {
      addCode(blockers, 'capture-recovery-lost-subject-hash-invalid');
    }

    var recoveryAtIso = normalizeIso(sourceInput.recoveryAtIso || sourceInput.nowIso, nowIsoSeconds());
    var recoveryTrustGrade = recoveryProvenance ? trustGradeForProvenance(recoveryProvenance) : '';
    if (recoveryProvenance && TRUST_GRADES.indexOf(recoveryTrustGrade) === -1) {
      addCode(blockers, 'capture-recovery-trust-grade-unresolved');
    }

    scanRecoveryPrivacy(sourceInput, blockers, warnings);

    var actorPeer = normalizeActorPeer(sourceInput);
    var producer = normalizeProducer(sourceInput, actorPeer);
    var owner = normalizeOwner(sourceInput);
    var summary = normalizeSummary(sourceInput);
    var artifactKind = normalizeEnum(sourceInput.artifactKind, ARTIFACT_KINDS,
      recoveryProvenance === 'manual-redacted-evidence' ? 'manual-redacted-evidence' : 'chat-snapshot-digest');
    var shellSubject = recoveryProvenance === 'manual-redacted-evidence';
    var parts = {
      actorPeer: actorPeer,
      producer: producer,
      owner: owner,
      summary: summary,
      artifactKind: artifactKind,
      lostSubjectIdHash: lostSubjectIdHash,
      recoveryProvenance: recoveryProvenance,
      recoveryTrustGrade: recoveryTrustGrade,
      recoveryAtIso: recoveryAtIso,
      shellSubject: shellSubject
    };
    validateNormalized(parts, blockers);

    if (blockers.length) {
      return createDomainResult({
        ok: false,
        actionable: false,
        blockers: blockers,
        warnings: warnings,
        recoveryProvenance: recoveryProvenance,
        recoveryTrustGrade: recoveryTrustGrade,
        lostSubjectIdHash: lostSubjectIdHash,
        canonicalRecoverySubject: null,
        canonicalRecoveryEvent: null,
        bookkeepingEntries: [],
        sideEffects: sideEffects()
      });
    }

    var recoveryNonce = generateUuid();
    var recoveredSubjectIdHash = await recoverySubjectIdentity(parts, recoveryNonce);
    var revisionHash = await recoverySubjectRevision(recoveredSubjectIdHash, parts);
    if (!isSha256Hex(recoveredSubjectIdHash)) addCode(blockers, 'capture-recovery-subject-identity-failed');
    if (!isSha256Hex(revisionHash)) addCode(blockers, 'capture-recovery-subject-revision-failed');
    if (recoveredSubjectIdHash && recoveredSubjectIdHash === lostSubjectIdHash) {
      addCode(blockers, 'capture-recovery-subject-id-reuses-lost');
    }

    var kernel = getKernel();
    var identityKit = null;
    if (kernel && typeof kernel.buildIdentityKit === 'function') {
      identityKit = await kernel.buildIdentityKit({
        subjectType: SUBJECT_TYPE,
        subjectId: recoveredSubjectIdHash,
        operation: OPERATION,
        baseHash: revisionHash,
        actorPeer: actorPeer
      });
      codeList(identityKit && identityKit.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(identityKit && identityKit.warnings).forEach(function (code) { addCode(warnings, code); });
    } else {
      addCode(blockers, 'capture-recovery-identity-kernel-unavailable');
    }
    var lineageId = cleanString(identityKit && identityKit.lineageId);
    // Override the kernel's per-call dedupeKey (derived from the random
    // subjectId) with the stable recovery dedupeKey so replay detection
    // works across attempts.
    var dedupeKey = cleanLower(await recoverySubjectDedupeKey(parts));
    if (!lineageId) addCode(blockers, 'capture-recovery-lineage-id-missing');
    if (!isSha256Hex(dedupeKey)) addCode(blockers, 'capture-recovery-dedupe-key-invalid');

    var validation = validationSummary(blockers.length ? 'blocked' : 'accepted', blockers, warnings);

    var subject = {
      schema: RECOVERY_SUBJECT_SCHEMA,
      schemaVersion: 1,
      subjectType: SUBJECT_TYPE,
      recoveredSubjectIdHash: recoveredSubjectIdHash,
      revisionHash: revisionHash,
      subjectState: blockers.length ? 'blocked' : 'recovered',
      shellSubject: shellSubject,
      recoveredFromSubjectIdHash: lostSubjectIdHash,
      recoveryProvenance: recoveryProvenance,
      recoveryTrustGrade: recoveryTrustGrade,
      recoveryAtIso: recoveryAtIso,
      artifactKind: artifactKind,
      owner: owner,
      summary: summary,
      replay: {
        lineageId: lineageId,
        dedupeKey: dedupeKey,
        payloadHash: '',
        eventDigest: '',
        sourceWatermark: null
      },
      audit: {
        auditKey: '',
        custodyChainHash: '',
        validationResultHash: '',
        denylistScanHash: ''
      },
      validation: validation
    };
    subject.replay.payloadHash = await sha256Hex(stripForPayloadHash(subject));
    subject.replay.eventDigest = await sha256Hex(stripForEventDigest(subject));
    subject.audit = await buildAuditKeys(parts, recoveredSubjectIdHash, revisionHash,
      RECOVERY_SUBJECT_SCHEMA, subject.replay.eventDigest, validation);

    var eventReplay = {
      lineageId: lineageId,
      dedupeKey: await recoveryEventDedupeKey(dedupeKey, parts),
      payloadHash: '',
      eventDigest: '',
      sourceWatermark: null
    };
    var event = {
      schema: RECOVERY_EVENT_SCHEMA,
      schemaVersion: 1,
      eventId: generateUuid(),
      eventKind: blockers.length ? 'validation-blocked' : 'recovered',
      eventAtIso: recoveryAtIso,
      producer: producer,
      owner: owner,
      recoveryProvenance: recoveryProvenance,
      recoveryTrustGrade: recoveryTrustGrade,
      recoveryAtIso: recoveryAtIso,
      subject: {
        subjectType: SUBJECT_TYPE,
        recoveredSubjectIdHash: recoveredSubjectIdHash,
        revisionHash: revisionHash,
        recoveredFromSubjectIdHash: lostSubjectIdHash
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
    event.replay.payloadHash = await sha256Hex(stripForPayloadHash(event));
    event.replay.eventDigest = await sha256Hex(stripForEventDigest(event));
    event.audit = await buildAuditKeys(parts, recoveredSubjectIdHash, revisionHash,
      RECOVERY_EVENT_SCHEMA, event.replay.eventDigest, validation);

    var bookkeepingEntries = buildBookkeepingEntries(parts, recoveredSubjectIdHash, revisionHash,
      lineageId, dedupeKey, event.replay.eventDigest, recoveryAtIso, {
        artifactKind: artifactKind,
        evidenceDigest: summary.evidenceDigest || '',
        shellSubject: shellSubject
      });

    scanRecoveryPrivacy(subject, blockers, warnings);
    scanRecoveryPrivacy(event, blockers, warnings);
    bookkeepingEntries.forEach(function (entry) { scanRecoveryPrivacy(entry, blockers, warnings); });

    // Defense in depth: bookkeeping codes are required to be present.
    var emittedCodes = bookkeepingEntries.map(function (entry) { return entry && entry.code; });
    [BOOKKEEPING_SOURCE_VALIDATED, BOOKKEEPING_APPLIED, BOOKKEEPING_CROSS_REFERENCE].forEach(function (code) {
      if (emittedCodes.indexOf(code) === -1) addCode(blockers, 'capture-recovery-bookkeeping-' + code + '-missing');
    });

    if (blockers.length) {
      subject.validation = validationSummary('blocked', blockers, warnings);
      subject.subjectState = 'blocked';
      event.validation = subject.validation;
      event.eventKind = 'validation-blocked';
    }

    return createDomainResult({
      ok: blockers.length === 0,
      actionable: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      recoveryProvenance: recoveryProvenance,
      recoveryTrustGrade: recoveryTrustGrade,
      lostSubjectIdHash: lostSubjectIdHash,
      canonicalRecoverySubject: subject,
      canonicalRecoveryEvent: event,
      bookkeepingEntries: bookkeepingEntries,
      sideEffects: sideEffects()
    });
  }

  async function previewCaptureRecovery(input) {
    var sourceInput = safeObject(input);
    var canonical = await canonicalizeCaptureRecovery(sourceInput);
    var blockers = uniqueCodes(canonical.blockers);
    var warnings = uniqueCodes(canonical.warnings);
    var subject = canonical.canonicalRecoverySubject;
    var event = canonical.canonicalRecoveryEvent;
    var bookkeepingEntries = asArray(canonical.bookkeepingEntries);

    if (!subject || !event) {
      return createDomainResult({
        ok: false,
        actionable: false,
        blockers: blockers,
        warnings: warnings,
        recoveryProvenance: canonical.recoveryProvenance,
        recoveryTrustGrade: canonical.recoveryTrustGrade,
        lostSubjectIdHash: canonical.lostSubjectIdHash,
        canonicalRecoverySubject: subject,
        canonicalRecoveryEvent: event,
        bookkeepingEntries: bookkeepingEntries,
        sideEffects: sideEffects()
      });
    }

    var parts = {
      actorPeer: normalizeActorPeer(sourceInput),
      producer: normalizeProducer(sourceInput, normalizeActorPeer(sourceInput)),
      owner: subject.owner,
      summary: subject.summary,
      artifactKind: subject.artifactKind,
      lostSubjectIdHash: subject.recoveredFromSubjectIdHash,
      recoveryProvenance: subject.recoveryProvenance,
      recoveryTrustGrade: subject.recoveryTrustGrade,
      recoveryAtIso: subject.recoveryAtIso,
      shellSubject: subject.shellSubject === true
    };

    var ownerHandoff = shapeOwnerPreview(
      parts,
      subject.recoveredSubjectIdHash,
      subject.revisionHash,
      subject.replay.lineageId,
      subject.replay.dedupeKey,
      subject.recoveryAtIso
    );
    codeList(ownerHandoff && ownerHandoff.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(ownerHandoff && ownerHandoff.warnings).forEach(function (code) { addCode(warnings, code); });

    var watermark = shapeWatermarkPreview(
      parts,
      subject.recoveredSubjectIdHash,
      subject.revisionHash,
      subject.replay.lineageId,
      subject.replay.dedupeKey,
      subject.recoveryAtIso,
      sourceInput.currentWatermark
    );
    codeList(watermark && watermark.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(watermark && watermark.warnings).forEach(function (code) { addCode(warnings, code); });

    var consumed = shapeConsumedPreview(
      parts,
      subject.recoveredSubjectIdHash,
      subject.replay.lineageId,
      event.replay.eventDigest,
      event.replay.dedupeKey,
      subject.recoveryAtIso,
      sourceInput.consumedRows,
      blockers,
      warnings
    );
    codeList(consumed && consumed.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(consumed && consumed.warnings).forEach(function (code) { addCode(warnings, code); });
    if (hasTerminalDedupe(sourceInput.consumedRows, event.replay.dedupeKey)) {
      addCode(blockers, 'capture-recovery-replay-duplicate');
    }

    var replay = shapeReplayPreview(
      parts,
      subject.recoveredSubjectIdHash,
      subject.revisionHash,
      subject.replay.lineageId,
      event.replay.eventDigest,
      event.replay.dedupeKey,
      consumed,
      watermark
    );
    codeList(replay && replay.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(replay && replay.warnings).forEach(function (code) { addCode(warnings, code); });

    var audit = shapeAuditPreview(
      parts,
      subject.recoveredSubjectIdHash,
      subject.revisionHash,
      subject.replay.lineageId,
      event.replay.eventDigest,
      event.replay.dedupeKey,
      subject.recoveryAtIso,
      blockers,
      warnings
    );
    codeList(audit && audit.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(audit && audit.warnings).forEach(function (code) { addCode(warnings, code); });

    var f5Annotation = buildF5Annotation(
      sourceInput.openF5Review,
      parts,
      subject.recoveredSubjectIdHash,
      subject.replay.lineageId,
      event.replay.dedupeKey,
      event.replay.eventDigest,
      subject.recoveryAtIso,
      warnings
    );
    if (f5Annotation) scanRecoveryPrivacy(f5Annotation, blockers, warnings);

    var ok = blockers.length === 0;
    if (!ok) {
      subject.validation = validationSummary('blocked', blockers, warnings);
      subject.subjectState = 'blocked';
      event.validation = subject.validation;
      event.eventKind = 'validation-blocked';
    }

    return createDomainResult({
      ok: ok,
      actionable: ok,
      blockers: blockers,
      warnings: warnings,
      recoveryProvenance: subject.recoveryProvenance,
      recoveryTrustGrade: subject.recoveryTrustGrade,
      lostSubjectIdHash: subject.recoveredFromSubjectIdHash,
      canonicalRecoverySubject: subject,
      canonicalRecoveryEvent: event,
      bookkeepingEntries: bookkeepingEntries,
      f5ReviewAnnotation: f5Annotation,
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

  // executeRecovery is the entry-point exposed on H2O.Capture. It is a
  // preview-only canonicalization: it returns the canonical recovery
  // subject/event and bookkeeping entries without writing to any ledger,
  // publishing, relaying, advancing watermarks, recording consumed ops, or
  // mutating F5 review state or the lost subject row.
  async function executeRecovery(input) {
    return previewCaptureRecovery(input);
  }

  async function proofFixture(provenance) {
    var actorPeer = {
      physicalDeviceIdHash: await sha256Hex('capture-recovery-proof-device-' + provenance),
      installIdHash: await sha256Hex('capture-recovery-proof-install-' + provenance),
      syncPeerIdHash: await sha256Hex('capture-recovery-proof-peer-' + provenance),
      surfaceKind: 'desktop-tauri'
    };
    var ownerWorkspaceIdHash = await sha256Hex('capture-recovery-proof-workspace');
    var lostSubjectIdHash = await sha256Hex('capture-recovery-proof-lost-subject-' + provenance);
    var evidenceDigest = await sha256Hex('capture-recovery-proof-redacted-evidence-' + provenance);
    return {
      nowIso: PROOF_ISO,
      recoveryAtIso: PROOF_ISO,
      actorPeer: actorPeer,
      owner: {
        ownerWorkspaceIdHash: ownerWorkspaceIdHash,
        ownerPeerIdHash: actorPeer.syncPeerIdHash
      },
      lostSubjectIdHash: lostSubjectIdHash,
      recoveryProvenance: provenance,
      artifactKind: provenance === 'manual-redacted-evidence' ? 'manual-redacted-evidence' : 'chat-snapshot-digest',
      summary: {
        redactionClass: REDACTED,
        evidenceDigest: evidenceDigest,
        lengthBucket: provenance === 'manual-redacted-evidence' ? 'unknown' : 'medium',
        itemCount: provenance === 'manual-redacted-evidence' ? 0 : 1,
        turnCount: provenance === 'manual-redacted-evidence' ? 0 : 6,
        attachmentCount: 0,
        statusBucket: 'new',
        kindBucket: provenance === 'manual-redacted-evidence' ? 'otherKind' : 'captureSnippetKind'
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

  function bookkeepingHasCode(result, code) {
    return asArray(result && result.bookkeepingEntries).some(function (entry) {
      return entry && cleanString(entry.code) === code;
    });
  }

  async function buildOpenF5Review(subjectIdHash) {
    var lineageId = generateUuid();
    var candidateId = generateUuid();
    var proposalEnvelopeId = generateUuid();
    var digest = await sha256Hex('capture-recovery-proof-f5-evidence');
    return {
      reviewId: generateUuid(),
      candidateId: candidateId,
      proposalEnvelopeId: proposalEnvelopeId,
      subjectId: subjectIdHash,
      lineageId: lineageId,
      predicateVersion: 'snapshot-delete-f5-v1',
      justifyingEvidenceDigests: [digest],
      reviewStatus: 'pending-review',
      createdAtIso: PROOF_ISO
    };
  }

  async function runCaptureRecoveryRuntimeProof() {
    var fullBundleInput = await proofFixture('studio-full-bundle-v2');
    var fullBundle = await executeRecovery(fullBundleInput);

    var mv3Input = await proofFixture('mv3-cache-export');
    var mv3 = await executeRecovery(mv3Input);

    var manualInput = await proofFixture('manual-redacted-evidence');
    var manual = await executeRecovery(manualInput);

    var zipInput = await proofFixture('studio-full-bundle-v2');
    zipInput.recoveryProvenance = 'chatgpt-export-zip';
    var zipBlocked = await executeRecovery(zipInput);

    var missingLostInput = await proofFixture('studio-full-bundle-v2');
    delete missingLostInput.lostSubjectIdHash;
    var missingLost = await executeRecovery(missingLostInput);

    var duplicateRows = fullBundle.consumedOperationPreview ? [Object.assign({}, fullBundle.consumedOperationPreview, {
      consumedStatus: 'consumed'
    })] : [];
    var duplicateInput = Object.assign({}, fullBundleInput, { consumedRows: duplicateRows });
    var duplicate = await executeRecovery(duplicateInput);

    var privacyInput = Object.assign({}, fullBundleInput, { text: 'raw recovery content must not pass' });
    var privacy = await executeRecovery(privacyInput);

    var f5Review = await buildOpenF5Review(fullBundle.canonicalRecoverySubject &&
      fullBundle.canonicalRecoverySubject.recoveredSubjectIdHash);
    var f5Input = Object.assign({}, fullBundleInput, { openF5Review: f5Review });
    var f5Annotated = await executeRecovery(f5Input);

    var checks = {
      fullBundleProducesCanonicalRecoverySubject: fullBundle.ok === true &&
        fullBundle.canonicalRecoverySubject &&
        fullBundle.canonicalRecoverySubject.schema === RECOVERY_SUBJECT_SCHEMA &&
        isSha256Hex(fullBundle.canonicalRecoverySubject.recoveredSubjectIdHash),
      fullBundleSubjectIdDiffersFromLost: fullBundle.canonicalRecoverySubject &&
        cleanLower(fullBundle.canonicalRecoverySubject.recoveredSubjectIdHash) !==
          cleanLower(fullBundleInput.lostSubjectIdHash) &&
        cleanLower(fullBundle.canonicalRecoverySubject.recoveredFromSubjectIdHash) ===
          cleanLower(fullBundleInput.lostSubjectIdHash),
      fullBundleTrustHigh: fullBundle.canonicalRecoverySubject &&
        fullBundle.canonicalRecoverySubject.recoveryTrustGrade === 'high' &&
        fullBundle.canonicalRecoverySubject.recoveryProvenance === 'studio-full-bundle-v2',
      mv3ProducesCanonicalRecoverySubjectHighTrust: mv3.ok === true &&
        mv3.canonicalRecoverySubject &&
        mv3.canonicalRecoverySubject.recoveryTrustGrade === 'high' &&
        mv3.canonicalRecoverySubject.recoveryProvenance === 'mv3-cache-export' &&
        cleanLower(mv3.canonicalRecoverySubject.recoveredSubjectIdHash) !==
          cleanLower(mv3Input.lostSubjectIdHash),
      manualProducesShellSubjectLowTrust: manual.ok === true &&
        manual.canonicalRecoverySubject &&
        manual.canonicalRecoverySubject.shellSubject === true &&
        manual.canonicalRecoverySubject.recoveryTrustGrade === 'low' &&
        manual.canonicalRecoverySubject.recoveryProvenance === 'manual-redacted-evidence',
      chatgptZipBlocked: zipBlocked.ok === false &&
        codeList(zipBlocked.blockers).indexOf('recovery-provenance-zip-deferred') !== -1,
      missingLostSubjectBlocked: missingLost.ok === false &&
        codeList(missingLost.blockers).indexOf('capture-recovery-lost-subject-hash-missing') !== -1,
      replayDuplicateBlocked: duplicate.ok === false &&
        codeList(duplicate.blockers).indexOf('capture-recovery-replay-duplicate') !== -1,
      privacyViolationBlocked: privacy.ok === false &&
        codeList(privacy.blockers).indexOf('capture-recovery-denylist-raw-content') !== -1 &&
        !outputContainsNeedle(fullBundle, 'raw recovery content must not pass'),
      bookkeepingSourceValidatedPresent: bookkeepingHasCode(fullBundle, BOOKKEEPING_SOURCE_VALIDATED),
      bookkeepingAppliedPresent: bookkeepingHasCode(fullBundle, BOOKKEEPING_APPLIED),
      bookkeepingCrossReferencePresent: bookkeepingHasCode(fullBundle, BOOKKEEPING_CROSS_REFERENCE),
      f5AnnotationDoesNotChangeReviewState: f5Annotated.ok === true &&
        f5Annotated.f5ReviewAnnotation &&
        f5Annotated.f5ReviewAnnotation.code === F5_ANNOTATION_CODE &&
        f5Annotated.f5ReviewAnnotation.annotationOnly === true &&
        f5Annotated.f5ReviewAnnotation.reviewStateChanged === false &&
        f5Annotated.sideEffects && f5Annotated.sideEffects.f5ReviewActivity === false,
      lostSubjectLifecycleUnchanged: fullBundle.sideEffects &&
        fullBundle.sideEffects.lostSubjectMutated === false,
      noPublicationRelayOutboxF5OrExecuteActivity: allSideEffectsFalse(fullBundle) &&
        allSideEffectsFalse(mv3) && allSideEffectsFalse(manual)
    };
    var ok = Object.keys(checks).every(function (key) { return checks[key] === true; });
    return createDomainResult({
      ok: ok,
      actionable: false,
      blockers: ok ? [] : ['capture-recovery-runtime-proof-failed'],
      warnings: [],
      recoveryProvenance: fullBundle.recoveryProvenance,
      recoveryTrustGrade: fullBundle.recoveryTrustGrade,
      lostSubjectIdHash: fullBundle.lostSubjectIdHash,
      sideEffects: sideEffects(),
      canonicalRecoverySubject: fullBundle.canonicalRecoverySubject,
      canonicalRecoveryEvent: fullBundle.canonicalRecoveryEvent,
      bookkeepingEntries: fullBundle.bookkeepingEntries
    }, {
      checks: checks
    });
  }

  H2O.Capture.executeRecovery = executeRecovery;
  H2O.Desktop.Sync.canonicalizeCaptureRecovery = canonicalizeCaptureRecovery;
  H2O.Desktop.Sync.previewCaptureRecovery = previewCaptureRecovery;
  H2O.Desktop.Sync.runCaptureRecoveryRuntimeProof = runCaptureRecoveryRuntimeProof;
  H2O.Desktop.Sync.__captureRecoveryRuntimeInstalled = true;
  H2O.Desktop.Sync.__captureRecoveryRuntimeVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
