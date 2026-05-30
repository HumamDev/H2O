/* H2O Desktop Sync Kernel - F14.2.7 tombstone reader / F5 handoff primitive
 *
 * Desktop/Tauri L0 primitive only.
 *
 * Safety invariants:
 *   - Shapes and validates caller-supplied tombstone / F5 handoff data only.
 *   - No tombstone creation, delete, storage reads/writes, F5 review actions,
 *     retention policy ownership, publication, relay, WebDAV, polling, timers,
 *     apply, convergence, domain mutation, or mobile behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.7, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.shapeTombstone(input)
 *   H2O.Desktop.Sync.kernel.validateTombstone(input)
 *   H2O.Desktop.Sync.kernel.tombstoneStatus(input)
 *   H2O.Desktop.Sync.kernel.isTombstoned(input)
 *   H2O.Desktop.Sync.kernel.isRestoredTombstone(input)
 *   H2O.Desktop.Sync.kernel.shapeF5Handoff(input)
 *   H2O.Desktop.Sync.kernel.validateF5Handoff(input)
 *   H2O.Desktop.Sync.kernel.shapeF5Review(input)
 *   H2O.Desktop.Sync.kernel.validateF5Review(input)
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
  if (kernel.__tombstoneReaderInstalled) return;

  var VERSION = '0.1.0-f14.2.7';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.tombstone-validation.v1';
  var TOMBSTONE_SCHEMA = 'h2o.desktop.sync.kernel.tombstone-state.v1';
  var HANDOFF_SCHEMA = 'h2o.desktop.sync.kernel.f5-handoff.v1';
  var REVIEW_SCHEMA = 'h2o.desktop.sync.kernel.f5-review.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var STATE_HASH_RE = /^([0-9a-f]{8}|[0-9a-f]{64})$/;

  var TOMBSTONE_RECORD_KINDS = [
    'chat',
    'linkedOnlyChat',
    'snapshot',
    'savedSnapshot',
    'folder',
    'folderBinding',
    'tag',
    'tagBinding',
    'label',
    'labelBinding',
    'category',
    'categoryAssignment',
    'project',
    'visualMetadata',
    'capture'
  ];

  var F5_REVIEW_STATUSES = [
    'generated',
    'pending-review',
    'pending-approved',
    'approved',
    'blocked',
    'withdrawn',
    'expired',
    'superseded',
    'rejected',
    'applied'
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
    return SHA256_RE.test(cleanString(value));
  }

  function isStateHash(value) {
    var text = cleanString(value).toLowerCase();
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

  function normalizeDigestList(value) {
    return asArray(value).map(function (item) {
      return cleanString(item).toLowerCase();
    }).filter(Boolean).filter(function (digest, index, arr) {
      return arr.indexOf(digest) === index;
    });
  }

  function shapeTombstone(input) {
    var row = safeObject(input);
    return {
      schema: TOMBSTONE_SCHEMA,
      tombstoneId: cleanString(row.tombstoneId || row.tombstone_id),
      sourceSchema: cleanString(row.schema),
      recordKind: cleanString(row.recordKind || row.record_kind),
      recordId: cleanString(row.recordId || row.record_id),
      subjectId: cleanString(row.subjectId).toLowerCase(),
      deletedAt: cleanString(row.deletedAt || row.deleted_at),
      deletedBySyncPeerId: cleanString(row.deletedBySyncPeerId || row.deleted_by_sync_peer_id),
      deleteReason: cleanString(row.deleteReason || row.delete_reason),
      priorDigest: cleanString(row.priorDigest || row.prior_digest).toLowerCase(),
      priorUpdatedAt: cleanString(row.priorUpdatedAt || row.prior_updated_at),
      sourceExportId: cleanString(row.sourceExportId || row.source_export_id),
      sourceSequenceNumber: nullableNumber(row.sourceSequenceNumber || row.source_sequence_number),
      cascadeFrom: cleanString(row.cascadeFrom || row.cascade_from),
      restoredAt: cleanString(row.restoredAt || row.restored_at),
      restoredBySyncPeerId: cleanString(row.restoredBySyncPeerId || row.restored_by_sync_peer_id),
      createdAt: cleanString(row.createdAt || row.created_at),
      updatedAt: cleanString(row.updatedAt || row.updated_at)
    };
  }

  function tombstoneStatus(input) {
    var tombstone = shapeTombstone(input);
    if (!tombstone.tombstoneId) return 'missing';
    if (tombstone.restoredAt) return 'restored';
    if (tombstone.deletedAt) return 'tombstoned';
    return 'incomplete';
  }

  function isTombstoned(input) {
    return tombstoneStatus(input) === 'tombstoned';
  }

  function isRestoredTombstone(input) {
    return tombstoneStatus(input) === 'restored';
  }

  function result(blockers, warnings, tombstone, handoff, extra) {
    var out = {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      valid: blockers.length === 0,
      tombstone: tombstone || null,
      handoff: handoff || null,
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

  function validateTombstone(input) {
    var tombstone = shapeTombstone(input);
    var blockers = [];
    var warnings = [];

    if (!tombstone.tombstoneId) addCode(blockers, 'tombstone-id-required');
    if (!tombstone.recordKind) {
      addCode(blockers, 'tombstone-record-kind-required');
    } else if (TOMBSTONE_RECORD_KINDS.indexOf(tombstone.recordKind) === -1) {
      addCode(blockers, 'tombstone-record-kind-unknown');
    }
    if (!tombstone.recordId && !isSha256Hex(tombstone.subjectId)) {
      addCode(blockers, 'tombstone-record-identity-required');
    }
    if (tombstone.subjectId && !isSha256Hex(tombstone.subjectId)) {
      addCode(blockers, 'tombstone-subject-id-invalid');
    }
    if (!isIso(tombstone.deletedAt)) addCode(blockers, 'tombstone-deletedAt-invalid');
    if (!tombstone.deletedBySyncPeerId) addCode(blockers, 'tombstone-deletedBySyncPeerId-required');
    if (!tombstone.deleteReason) addCode(blockers, 'tombstone-deleteReason-required');
    if (!isStateHash(tombstone.priorDigest)) addCode(blockers, 'tombstone-priorDigest-invalid');
    if (!isIsoOrEmpty(tombstone.priorUpdatedAt)) addCode(blockers, 'tombstone-priorUpdatedAt-invalid');
    if (!isIsoOrEmpty(tombstone.restoredAt)) addCode(blockers, 'tombstone-restoredAt-invalid');
    if (tombstone.restoredAt && !tombstone.restoredBySyncPeerId) {
      addCode(blockers, 'tombstone-restoredBySyncPeerId-required');
    }
    if (Number.isNaN(tombstone.sourceSequenceNumber)) {
      addCode(blockers, 'tombstone-sourceSequenceNumber-invalid');
    }
    if (tombstone.createdAt && !isIso(tombstone.createdAt)) addCode(warnings, 'tombstone-createdAt-invalid');
    if (tombstone.updatedAt && !isIso(tombstone.updatedAt)) addCode(warnings, 'tombstone-updatedAt-invalid');

    return result(blockers, warnings, tombstone, null, {
      tombstoneStatus: tombstoneStatus(tombstone)
    });
  }

  function shapeF5Handoff(input) {
    var source = safeObject(input);
    return {
      schema: HANDOFF_SCHEMA,
      candidateId: cleanString(source.candidateId),
      proposalEnvelopeId: cleanString(source.proposalEnvelopeId),
      subjectId: cleanString(source.subjectId).toLowerCase(),
      lineageId: cleanString(source.lineageId),
      baseHash: cleanString(source.baseHash).toLowerCase(),
      predicateVersion: cleanString(source.predicateVersion),
      justifyingEvidenceDigests: normalizeDigestList(source.justifyingEvidenceDigests),
      expectedF5ReviewKind: cleanString(source.expectedF5ReviewKind),
      membershipCount: nullableNumber(source.membershipCount),
      childFolderCount: nullableNumber(source.childFolderCount),
      reviewStatus: cleanString(source.reviewStatus),
      createdAtIso: cleanString(source.createdAtIso)
    };
  }

  function validateF5Handoff(input) {
    var handoff = shapeF5Handoff(input);
    var blockers = [];
    var warnings = [];

    if (!handoff.candidateId) addCode(blockers, 'f5-handoff-candidate-id-required');
    if (!handoff.proposalEnvelopeId) addCode(blockers, 'f5-handoff-proposal-envelope-id-required');
    if (!isSha256Hex(handoff.subjectId)) addCode(blockers, 'f5-handoff-subject-id-invalid');
    if (!handoff.lineageId) addCode(blockers, 'f5-handoff-lineage-id-required');
    if (handoff.baseHash && !isStateHash(handoff.baseHash)) addCode(blockers, 'f5-handoff-baseHash-invalid');
    if (!handoff.predicateVersion) addCode(blockers, 'f5-handoff-predicateVersion-required');
    if (!handoff.justifyingEvidenceDigests.length) {
      addCode(blockers, 'f5-handoff-evidence-digests-required');
    }
    handoff.justifyingEvidenceDigests.forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'f5-handoff-evidence-digest-invalid');
    });
    if (!handoff.expectedF5ReviewKind) addCode(warnings, 'f5-handoff-review-kind-missing');
    if (Number.isNaN(handoff.membershipCount)) addCode(blockers, 'f5-handoff-membership-count-invalid');
    if (Number.isNaN(handoff.childFolderCount)) addCode(blockers, 'f5-handoff-child-folder-count-invalid');
    if (handoff.reviewStatus && F5_REVIEW_STATUSES.indexOf(handoff.reviewStatus) === -1) {
      addCode(blockers, 'f5-review-status-invalid');
    }
    if (handoff.createdAtIso && !isIso(handoff.createdAtIso)) addCode(blockers, 'f5-handoff-createdAtIso-invalid');

    return result(blockers, warnings, null, handoff, {
      handoffReady: blockers.length === 0
    });
  }

  function shapeF5Review(input) {
    var row = safeObject(input);
    return {
      schema: REVIEW_SCHEMA,
      reviewId: cleanString(row.reviewId),
      candidateId: cleanString(row.candidateId),
      proposalEnvelopeId: cleanString(row.proposalEnvelopeId),
      subjectId: cleanString(row.subjectId).toLowerCase(),
      lineageId: cleanString(row.lineageId),
      predicateVersion: cleanString(row.predicateVersion),
      justifyingEvidenceDigests: normalizeDigestList(row.justifyingEvidenceDigests),
      reviewStatus: cleanString(row.reviewStatus),
      createdAtIso: cleanString(row.createdAtIso)
    };
  }

  function validateF5Review(input) {
    var review = shapeF5Review(input);
    var blockers = [];
    var warnings = [];

    if (!review.reviewId) addCode(blockers, 'f5-review-id-required');
    if (!review.candidateId) addCode(blockers, 'f5-handoff-candidate-id-required');
    if (!review.proposalEnvelopeId) addCode(blockers, 'f5-handoff-proposal-envelope-id-required');
    if (!isSha256Hex(review.subjectId)) addCode(blockers, 'f5-handoff-subject-id-invalid');
    if (!review.lineageId) addCode(blockers, 'f5-handoff-lineage-id-required');
    if (!review.predicateVersion) addCode(blockers, 'f5-handoff-predicateVersion-required');
    if (!review.justifyingEvidenceDigests.length) addCode(blockers, 'f5-handoff-evidence-digests-required');
    review.justifyingEvidenceDigests.forEach(function (digest) {
      if (!isSha256Hex(digest)) addCode(blockers, 'f5-handoff-evidence-digest-invalid');
    });
    if (F5_REVIEW_STATUSES.indexOf(review.reviewStatus) === -1) addCode(blockers, 'f5-review-status-invalid');
    if (!isIso(review.createdAtIso)) addCode(blockers, 'f5-review-createdAtIso-invalid');

    return result(blockers, warnings, null, review, {
      reviewReady: blockers.length === 0
    });
  }

  kernel.shapeTombstone = shapeTombstone;
  kernel.validateTombstone = validateTombstone;
  kernel.tombstoneStatus = tombstoneStatus;
  kernel.isTombstoned = isTombstoned;
  kernel.isRestoredTombstone = isRestoredTombstone;
  kernel.shapeF5Handoff = shapeF5Handoff;
  kernel.validateF5Handoff = validateF5Handoff;
  kernel.shapeF5Review = shapeF5Review;
  kernel.validateF5Review = validateF5Review;
  kernel.TOMBSTONE_RECORD_KINDS = TOMBSTONE_RECORD_KINDS.slice();
  kernel.F5_REVIEW_STATUSES = F5_REVIEW_STATUSES.slice();
  kernel.__tombstoneReaderInstalled = true;
  kernel.__tombstoneReaderVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
