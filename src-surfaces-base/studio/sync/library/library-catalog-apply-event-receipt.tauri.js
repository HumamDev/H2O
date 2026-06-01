/* H2O Desktop Sync - F15.6.a library catalog apply-event receipt
 *
 * Read-only apply-event receipt builder for library catalog operations.
 * Composes the F15.5.a handoff preview (which itself wraps the F15.4.a
 * catalog proposal candidate) into a kernel-validated apply-event +
 * receipt + auditMetadata envelope, with watermarkPreview /
 * consumedOperationPreview shapes prepared for the F14.6 execute
 * settlement writer.
 *
 * This module is preview-only for six of the seven catalog operations:
 * create, rename, recolor, archive, restore-from-archived, and
 * restore-from-retained. For these, every sideEffectSummary flag stays
 * false; nothing is written, nothing executes.
 *
 * For the seventh operation — tombstone — this module IS the F5 review
 * queue ingress point promised in F15.5.a. It mirrors the F14.5.5.2
 * snapshot tombstone apply-event receipt wire-through verbatim:
 *
 *   1. The receipt envelope is built first.
 *   2. The F5 handoff envelope is forwarded VERBATIM to
 *      H2O.Desktop.Sync.ingestF5Review along with originAccountIdHash
 *      and actorPeer from the handoff preview.
 *   3. Failure modes (queue unavailable, ingest throw, open-duplicate,
 *      ingest blockers/warnings, unknown failure) all surface as
 *      warnings; the receipt itself stays ok: true. Fail-open.
 *   4. sideEffectSummary.f5Touched flips to true ONLY when ingest
 *      result.ok === true && reviewId is sha256-shaped. Other tombstone
 *      paths (no-op, duplicate, throw, unavailable) keep all flags false.
 *
 * This module NEVER calls Native, applies, publishes, enqueues
 * relay/outbox rows, advances watermarks, records consumed operations,
 * writes Labels/Categories/Tags storage, writes the chats.category_id
 * materialized cache (binding lane owns that), or mutates any store.
 *
 * Public API:
 *   H2O.Desktop.Sync.buildLibraryCatalogApplyEventReceipt(input)             -> Promise<result>
 *   H2O.Desktop.Sync.buildLibraryCatalogCreateApplyEventReceipt(input)
 *   H2O.Desktop.Sync.buildLibraryCatalogRenameApplyEventReceipt(input)
 *   H2O.Desktop.Sync.buildLibraryCatalogRecolorApplyEventReceipt(input)
 *   H2O.Desktop.Sync.buildLibraryCatalogArchiveApplyEventReceipt(input)
 *   H2O.Desktop.Sync.buildLibraryCatalogRestoreFromArchivedApplyEventReceipt(input)
 *   H2O.Desktop.Sync.buildLibraryCatalogTombstoneApplyEventReceipt(input)
 *   H2O.Desktop.Sync.buildLibraryCatalogRestoreFromRetainedApplyEventReceipt(input)
 *
 *   H2O.Desktop.Sync.__libraryCatalogApplyEventReceiptInstalled
 *   H2O.Desktop.Sync.__libraryCatalogApplyEventReceiptVersion
 *
 * Kernel adoption:
 *   identity-kit:           canonicalJSON, sha256Hex, isSha256Hex
 *   privacy-scan:           scanDomainForbiddenFields('library.catalog', ...)
 *   audit-proof-framework:  shapeAuditMetadata, shapeAuditRecord,
 *                           validateAuditMetadata (when available)
 *   consumed-op:            shapeConsumedOperation
 *   watermark-service:      shapeWatermark, shapeWatermarkState
 *   lifecycle-framework:    shapeLifecycleTransition
 *   owner-handoff:          validateOwnerHandoff (defense-in-depth)
 *   tombstone-reader:       validateF5Handoff (tombstone defense-in-depth)
 *   result-shape:           createResult (fallback wrap)
 *
 * F5 review queue:
 *   snapshot-f5-review-queue.tauri.js: ingestF5Review (tombstone only)
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
  if (H2O.Desktop.Sync.__libraryCatalogApplyEventReceiptInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f15.6.catalog';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-catalog-apply-event-receipt.v1';
  var APPLY_EVENT_SCHEMA = 'h2o.desktop.sync.library-catalog-apply-event.v1';
  var RECEIPT_SCHEMA = 'h2o.desktop.sync.library-catalog-receipt.v1';
  var SUBJECT_TYPE = 'library.catalog';
  var PRIVACY_DOMAIN_TAG = 'library.catalog';
  var OWNER_KIND_NATIVE = 'native';
  var OWNER_KIND_F5 = 'f5';
  var REDACTED = 'redacted';
  var KIND_APPLY_EVENT = 'applyEvent';
  var AUDIT_POLICY_VERSION = 'h2o.library.catalog.audit-policy.v1';
  var CAPABILITY_TAG = 'h2o.library.catalog.capability.apply.v1';
  var MAX_RELATED_SUBJECTS = 50;
  var SHA256_RE = /^[0-9a-f]{64}$/;

  // Same forbidden-field defense-in-depth list as F15.5.a. Identifiers
  // cross the envelope boundary only as sha256 hashes.
  var PRIVACY_FORBIDDEN_FIELDS = [
    'name', 'rawName', 'displayName', 'label', 'title',
    'color', 'rawColor',
    'rawId', 'labelId', 'tagId', 'categoryId', 'folderId',
    'accountId', 'account_id', 'rawAccountId',
    'userId', 'user_id', 'rawUserId',
    'content', 'body', 'text',
    'messages', 'message_array', 'turns', 'turn_array',
    'attachments', 'files', 'file_ids', 'image_urls', 'audio_urls',
    'share_url', 'share_token', 'shareUrl', 'shareToken',
    'path', 'url',
    'password', 'apiKey',
    'cookies', 'session_token', 'sessionToken',
    'category_id', 'chats.category_id'
  ];

  // Per-operation metadata — drives owner-kind dispatch + receipt shape.
  // ownerKind/targetBroker MUST match the F15.5.a handoff preview's
  // routing (cross-checked at gate 6).
  var OPERATION_META = {
    'create': {
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      receiptKind: 'library-catalog-create-applied',
      applyOperation: 'library-catalog-create-applied',
      lifecycleFromState: 'absent',
      lifecycleToState: 'active',
      predicateVersion: 'h2o.library.catalog.create.predicate.v1'
    },
    'rename': {
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      receiptKind: 'library-catalog-rename-applied',
      applyOperation: 'library-catalog-rename-applied',
      lifecycleFromState: 'active',
      lifecycleToState: 'active',
      predicateVersion: 'h2o.library.catalog.rename.predicate.v1'
    },
    'recolor': {
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      receiptKind: 'library-catalog-recolor-applied',
      applyOperation: 'library-catalog-recolor-applied',
      lifecycleFromState: 'active',
      lifecycleToState: 'active',
      predicateVersion: 'h2o.library.catalog.recolor.predicate.v1'
    },
    'archive': {
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      receiptKind: 'library-catalog-archive-applied',
      applyOperation: 'library-catalog-archive-applied',
      lifecycleFromState: 'active',
      lifecycleToState: 'archived',
      predicateVersion: 'h2o.library.catalog.archive.predicate.v1'
    },
    'restore-from-archived': {
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      receiptKind: 'library-catalog-restore-from-archived-applied',
      applyOperation: 'library-catalog-restore-from-archived-applied',
      lifecycleFromState: 'archived',
      lifecycleToState: 'active',
      predicateVersion: 'h2o.library.catalog.restore-from-archived.predicate.v1'
    },
    'tombstone': {
      ownerKind: OWNER_KIND_F5,
      targetBroker: OWNER_KIND_F5,
      receiptKind: 'library-catalog-tombstone-applied',
      applyOperation: 'library-catalog-tombstone-applied',
      lifecycleFromState: 'active',         // also accepts 'archived'
      lifecycleToState: 'retained',
      predicateVersion: 'h2o.library.catalog.tombstone.predicate.v1'
    },
    'restore-from-retained': {
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      receiptKind: 'library-catalog-restore-from-retained-applied',
      applyOperation: 'library-catalog-restore-from-retained-applied',
      lifecycleFromState: 'retained',
      lifecycleToState: 'active',
      predicateVersion: 'h2o.library.catalog.restore-from-retained.predicate.v1'
    }
  };
  var ALLOWED_OPERATIONS = Object.keys(OPERATION_META);

  // ── Tiny helpers ────────────────────────────────────────────────────
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }
  function isSha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return SHA256_RE.test(cleanLower(value));
  }
  function addCode(list, code) {
    var n = cleanString(code);
    if (!n || list.indexOf(n) !== -1) return;
    list.push(n);
  }
  function mergeCodes(into, from) {
    if (!Array.isArray(from)) return;
    for (var i = 0; i < from.length; i++) {
      var entry = from[i];
      if (entry && typeof entry === 'object' && typeof entry.code === 'string') addCode(into, entry.code);
      else if (typeof entry === 'string') addCode(into, entry);
    }
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) { return arr.indexOf(code) === index; });
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
    for (var i = 0; i < bytes.length; i++) {
      var p = bytes[i].toString(16);
      hex += p.length === 1 ? '0' + p : p;
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
        var k = await kernel.sha256Hex(value);
        if (isSha256Hex(k)) return cleanLower(k);
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
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
  }

  // ── Privacy scan ────────────────────────────────────────────────────
  // Kernel-first with deterministic local fall-back. Nine call sites in
  // the main flow guard against leakage at every shape transition.
  function scanPrivacy(target, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scan = kernel.scanDomainForbiddenFields(PRIVACY_DOMAIN_TAG, target);
        if (scan && scan.ok === false) {
          mergeCodes(blockers, scan.blockers);
          mergeCodes(warnings, scan.warnings);
          addCode(blockers, 'library-catalog-receipt-privacy-failed');
          return;
        }
      } catch (_) {
        addCode(warnings, 'library-catalog-receipt-privacy-scan-threw');
      }
    } else {
      addCode(warnings, 'library-catalog-receipt-privacy-scan-unavailable');
    }
    var hits = [];
    findForbiddenFieldsLocal(target, '', hits);
    if (hits.length) {
      addCode(blockers, 'library-catalog-receipt-privacy-failed');
      for (var i = 0; i < Math.min(hits.length, 5); i++) {
        addCode(warnings, 'forbidden-field:' + hits[i].field);
      }
    }
  }
  function findForbiddenFieldsLocal(node, prefix, hits) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) findForbiddenFieldsLocal(node[i], prefix + '[' + i + ']', hits);
      return;
    }
    if (typeof node !== 'object') return;
    var keys = Object.keys(node);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (PRIVACY_FORBIDDEN_FIELDS.indexOf(k) !== -1) {
        hits.push({ field: k, path: prefix + '/' + k });
      }
      findForbiddenFieldsLocal(node[k], prefix + '/' + k, hits);
    }
  }

  // ── relatedSubjects truncation (F15.0.1 §6.6) ───────────────────────
  function truncateRelatedSubjects(related, warnings) {
    var arr = asArray(related);
    if (arr.length <= MAX_RELATED_SUBJECTS) return arr.slice();
    var severityOrder = { 'blocker': 0, 'warning': 1, 'info': 2 };
    var sorted = arr.slice().sort(function (a, b) {
      var sa = severityOrder[(a && a.severity) || 'info'];
      var sb = severityOrder[(b && b.severity) || 'info'];
      if (sa !== sb) return sa - sb;
      var ta = Date.parse((a && a.observedAtIso) || '') || 0;
      var tb = Date.parse((b && b.observedAtIso) || '') || 0;
      return tb - ta;
    });
    addCode(warnings, 'related-subjects-truncated');
    return sorted.slice(0, MAX_RELATED_SUBJECTS);
  }

  // ── Handoff resolution ──────────────────────────────────────────────
  function resolveHandoffPreview(args) {
    if (isObject(args.handoffPreview)) return args.handoffPreview;
    if (isObject(args.preview)) return args.preview;
    return null;
  }

  // ── Kernel shape wrappers ───────────────────────────────────────────
  // Each kernel helper is best-effort: if the helper is missing or throws,
  // surface a warning and fall back to the locally-built shape (so the
  // receipt is robust to partial kernel availability — same posture as
  // F15.5).
  function shapeWithKernel(helperName, input, warnings, threwCode) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel[helperName] === 'function') {
      try { return kernel[helperName](input); }
      catch (_) { addCode(warnings, threwCode || 'kernel-handoff-shape-threw'); }
    }
    return input;
  }

  function validateAuditMetadata(metadata, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateAuditMetadata !== 'function') {
      addCode(warnings, 'audit-proof-framework-unavailable');
      return metadata;
    }
    try {
      var result = kernel.validateAuditMetadata(metadata, {
        allowedDomains: [PRIVACY_DOMAIN_TAG],
        requireAuditId: true,
        requireSubject: true,
        requireLineage: true,
        requireActorPeer: true,
        requireTimestamp: true,
        requireTransactionId: true
      });
      if (result && result.ok === false) {
        mergeCodes(blockers, result.blockers);
        mergeCodes(warnings, result.warnings);
        addCode(blockers, 'library-catalog-audit-metadata-invalid');
        return metadata;
      }
      return (result && isObject(result.audit)) ? result.audit : metadata;
    } catch (_) {
      addCode(warnings, 'audit-metadata-validate-threw');
      return metadata;
    }
  }

  function validateOwnerHandoffShape(handoff, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateOwnerHandoff !== 'function') return true;
    try {
      var v = kernel.validateOwnerHandoff(handoff);
      if (v && (v.ok === false || v.valid === false)) {
        mergeCodes(blockers, v.blockers);
        mergeCodes(warnings, v.warnings);
        addCode(blockers, 'library-catalog-handoff-shape-invalid');
        return false;
      }
      return true;
    } catch (_) {
      addCode(warnings, 'kernel-handoff-shape-threw');
      return true;
    }
  }

  function validateF5HandoffShape(f5Handoff, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.validateF5Handoff !== 'function') return true;
    try {
      var v = kernel.validateF5Handoff(f5Handoff);
      if (v && (v.ok === false || v.valid === false)) {
        mergeCodes(blockers, v.blockers);
        mergeCodes(warnings, v.warnings);
        addCode(blockers, 'library-catalog-f5-handoff-revalidation-failed');
        return false;
      }
      return true;
    } catch (_) {
      addCode(warnings, 'kernel-f5-handoff-shape-threw');
      return true;
    }
  }

  // ── F5 review queue ingest (tombstone only) ─────────────────────────
  // Mirrors F14.5.5.2 snapshot-tombstone-apply-event-receipt.tauri.js
  // verbatim. The receipt envelope is built first; this wire-through is
  // best-effort. Any failure surfaces as a warning and the receipt
  // remains successful.
  async function ingestIntoF5ReviewQueue(parts, warnings) {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    if (!sync.__snapshotF5ReviewQueueInstalled
        || typeof sync.ingestF5Review !== 'function') {
      addCode(warnings, 'f5-review-queue-unavailable');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (!isObject(parts.f5Handoff)) {
      addCode(warnings, 'f5-review-queue-handoff-envelope-missing');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (!isSha256Hex(parts.originAccountIdHash)) {
      addCode(warnings, 'f5-review-queue-originAccountIdHash-missing');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (!isObject(parts.actorPeer)
        || !isSha256Hex(safeObject(parts.actorPeer).syncPeerIdHash)) {
      addCode(warnings, 'f5-review-queue-actorPeer-invalid');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    var ingest;
    try {
      ingest = await sync.ingestF5Review({
        f5Handoff: parts.f5Handoff,
        originAccountIdHash: parts.originAccountIdHash,
        actorPeer: parts.actorPeer,
        observedAtIso: parts.observedAtIso,
        retentionStartedAtIso: parts.observedAtIso
      });
    } catch (_) {
      addCode(warnings, 'f5-review-ingest-threw');
      return { f5ReviewIngested: false, f5ReviewId: null };
    }
    if (ingest && ingest.ok === true && isSha256Hex(ingest.reviewId)) {
      return { f5ReviewIngested: true, f5ReviewId: cleanLower(ingest.reviewId) };
    }
    // Ingest blocked (e.g. open-duplicate from race-on-resubmit, privacy
    // violation, malformed envelope). Surface as warnings; receipt remains
    // successful per F14.5.5.2 contract.
    var prefix = 'f5-review-ingest-blocked:';
    codeList(ingest && ingest.blockers).forEach(function (code) {
      addCode(warnings, prefix + code);
    });
    codeList(ingest && ingest.warnings).forEach(function (code) {
      addCode(warnings, 'f5-review-ingest-warning:' + code);
    });
    if (!codeList(ingest && ingest.blockers).length
        && !codeList(ingest && ingest.warnings).length) {
      addCode(warnings, 'f5-review-ingest-unknown-failure');
    }
    return { f5ReviewIngested: false, f5ReviewId: null };
  }

  // ── Apply event + receipt + audit metadata + previews ───────────────
  function buildPayload(meta, handoffPreview, candidate, actorPeer, lifecycleTransition, observedAtIso) {
    return {
      auditMaintenanceId: '',                          // filled later (sha256 of identity inputs)
      operationId: cleanString(handoffPreview.operationId),
      subjectId: cleanLower(handoffPreview.subjectId),
      lineageId: cleanLower(handoffPreview.lineageId),
      dedupeKey: cleanLower(handoffPreview.dedupeKey),
      operation: meta.applyOperation,
      operationIntent: cleanString(handoffPreview.operationIntent),
      preStateHash: cleanLower(safeObject(handoffPreview.expectedCurrentState).revisionHash),
      postStateHash: cleanLower(safeObject(handoffPreview.expectedTargetState).revisionHash) ||
                     cleanLower(safeObject(candidate).revisionHash) ||
                     cleanLower(safeObject(candidate).targetHash),
      preState: {
        hash: cleanLower(safeObject(handoffPreview.expectedCurrentState).revisionHash),
        lifecycleState: cleanString(safeObject(handoffPreview.expectedCurrentState).lifecycleState) ||
                        meta.lifecycleFromState
      },
      postState: {
        hash: cleanLower(safeObject(handoffPreview.expectedTargetState).revisionHash) ||
              cleanLower(safeObject(candidate).revisionHash) ||
              cleanLower(safeObject(candidate).targetHash),
        lifecycleState: cleanString(safeObject(handoffPreview.expectedTargetState).lifecycleState) ||
                        meta.lifecycleToState
      },
      lifecycleTransition: {
        fromState: lifecycleTransition.fromState,
        toState: lifecycleTransition.toState
      },
      kernelLifecycleTransition: lifecycleTransition,
      actorPeer: actorPeer,
      ownerKind: meta.ownerKind,
      targetBroker: meta.targetBroker,
      receiptKind: meta.receiptKind,
      appliedAtIso: observedAtIso,
      predicateVersion: meta.predicateVersion,
      proposalEnvelopeId: cleanString(safeObject(candidate.proposal).id) ||
                          cleanString(safeObject(candidate.candidate).envelopeId) ||
                          cleanString(handoffPreview.operationId),
      proposalEventDigest: cleanLower(safeObject(candidate.proposal).eventDigest),
      proposalDedupeKey: cleanLower(handoffPreview.dedupeKey),
      result: 'applied',
      receiptOnly: true,
      tombstoned: meta.lifecycleToState === 'retained'
    };
  }

  function shapeLifecycleTransition(meta, handoffPreview, observedAtIso, warnings) {
    var current = safeObject(handoffPreview.expectedCurrentState);
    var target = safeObject(handoffPreview.expectedTargetState);
    var fromState = cleanString(current.lifecycleState) || meta.lifecycleFromState;
    var toState = cleanString(target.lifecycleState) || meta.lifecycleToState;
    var input = {
      transitionId: generateUuid(),
      lifecycleId: cleanLower(handoffPreview.lineageId),
      domain: PRIVACY_DOMAIN_TAG,
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(handoffPreview.subjectId),
      transitionName: meta.applyOperation,
      fromState: fromState,
      toState: toState,
      lineageId: cleanLower(handoffPreview.lineageId),
      eventDigest: '',
      dedupeKey: cleanLower(handoffPreview.dedupeKey),
      actorPeer: handoffPreview.actorPeer,
      reasonCode: meta.applyOperation,
      requestedAtIso: observedAtIso,
      transitionedAtIso: observedAtIso,
      sequence: 0,
      metadata: { receiptOnly: true }
    };
    var shaped = shapeWithKernel('shapeLifecycleTransition', input, warnings, 'lifecycle-transition-shape-threw');
    return isObject(shaped) ? shaped : input;
  }

  // ── Result envelope assembly ────────────────────────────────────────
  function sideEffectSummary(overrides) {
    var base = {
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      applyExecuted: false
    };
    if (isObject(overrides)) {
      Object.keys(overrides).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(base, k)) base[k] = overrides[k] === true;
      });
    }
    return base;
  }

  function buildResult(opts) {
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      operation: cleanString(opts.operation),
      operationIntent: cleanString(opts.operationIntent),
      ownerKind: cleanString(opts.ownerKind),
      targetBroker: cleanString(opts.targetBroker),
      subjectId: cleanLower(opts.subjectId),
      lineageId: cleanLower(opts.lineageId),
      dedupeKey: cleanLower(opts.dedupeKey),
      operationId: cleanString(opts.operationId),
      // expectedCurrentState / expectedTargetState are F15.4 envelope OBJECTS.
      // Preserve verbatim — cleanString() would mangle them.
      expectedCurrentState: isObject(opts.expectedCurrentState) ? opts.expectedCurrentState : null,
      expectedTargetState: isObject(opts.expectedTargetState) ? opts.expectedTargetState : null,
      originAccountIdHash: cleanLower(opts.originAccountIdHash),
      actorPeer: opts.actorPeer || null,
      authorityMetadata: opts.authorityMetadata || null,
      handoffPreview: opts.handoffPreview || null,
      handoffRequest: opts.handoffRequest || null,
      proposal: opts.proposal || null,
      candidate: opts.candidate || null,
      canonicalCatalog: opts.canonicalCatalog || null,
      preflight: opts.preflight || null,
      diagnostics: opts.diagnostics || null,
      relatedSubjects: asArray(opts.relatedSubjects),
      applyEvent: opts.applyEvent || null,
      receipt: opts.receipt || null,
      receiptDigest: cleanLower(opts.receiptDigest),
      applyEventDigest: cleanLower(opts.applyEventDigest),
      auditMetadata: opts.auditMetadata || null,
      watermarkPreview: opts.watermarkPreview || null,
      consumedOperationPreview: opts.consumedOperationPreview || null,
      f5ReviewIngested: opts.f5ReviewIngested === true,
      f5ReviewId: cleanLower(opts.f5ReviewId) || null,
      validationSummary: opts.validationSummary || {},
      blockers: codeList(opts.blockers),
      warnings: codeList(opts.warnings),
      sideEffectSummary: sideEffectSummary(opts.sideEffectSummary),
      observedAtIso: opts.observedAtIso || nowIsoSeconds()
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.createResult === 'function') {
      try {
        var generic = kernel.createResult({
          schema: RESULT_SCHEMA,
          ok: payload.ok,
          actionable: payload.ok,
          blockers: payload.blockers,
          warnings: payload.warnings,
          metadata: {
            domain: PRIVACY_DOMAIN_TAG,
            subjectType: SUBJECT_TYPE,
            version: VERSION
          }
        });
        if (generic && typeof generic === 'object') {
          var mergedBlockers = codeList(generic.blockers).concat(payload.blockers.filter(function (c) {
            return codeList(generic.blockers).indexOf(c) === -1;
          }));
          var mergedWarnings = codeList(generic.warnings).concat(payload.warnings.filter(function (c) {
            return codeList(generic.warnings).indexOf(c) === -1;
          }));
          payload.blockers = mergedBlockers;
          payload.warnings = mergedWarnings;
          if (generic.ok === false) payload.ok = false;
        }
      } catch (_) { /* swallow */ }
    }
    return payload;
  }
  function blockedResult(opts) {
    opts = opts || {};
    opts.ok = false;
    return buildResult(opts);
  }
  function scanFinalOutput(result) {
    var blockers = [];
    var warnings = result.warnings ? result.warnings.slice() : [];
    scanPrivacy(result, blockers, warnings);
    if (!blockers.length) return result;
    var summary = Object.assign({}, safeObject(result.validationSummary), {
      outputPrivacySafe: false
    });
    return blockedResult({
      operation: result.operation,
      operationIntent: result.operationIntent,
      ownerKind: result.ownerKind,
      targetBroker: result.targetBroker,
      subjectId: result.subjectId,
      lineageId: result.lineageId,
      dedupeKey: result.dedupeKey,
      operationId: result.operationId,
      expectedCurrentState: result.expectedCurrentState,
      expectedTargetState: result.expectedTargetState,
      originAccountIdHash: result.originAccountIdHash,
      validationSummary: summary,
      blockers: codeList(blockers.concat(result.blockers || [])),
      warnings: codeList(warnings),
      observedAtIso: result.observedAtIso
    });
  }

  // ── Main entry — buildLibraryCatalogApplyEventReceipt(input) ────────
  async function buildLibraryCatalogApplyEventReceipt(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    var validationSummary = {
      handoffResolved: false,
      handoffValid: false,
      handoffPrivacySafe: false,
      operationAllowed: false,
      ownerKindMatched: false,
      applyEventShape: false,
      receiptShape: false,
      auditMetadataShape: false,
      watermarkPreviewShape: false,
      consumedOperationPreviewShape: false,
      relatedSubjectsClear: true,
      outputPrivacySafe: true,
      f5IngestAttempted: false,
      f5IngestSucceeded: false
    };

    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    // Gate 1: resolve handoff preview
    var handoffPreview = resolveHandoffPreview(args);
    if (!handoffPreview) {
      addCode(blockers, 'library-catalog-handoff-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.handoffResolved = true;

    // Gate 2: handoff preview must be ok + ready
    if (handoffPreview.ok !== true) {
      mergeCodes(warnings, handoffPreview.warnings);
      addCode(blockers, 'library-catalog-handoff-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    if (handoffPreview.handoffReady !== true) {
      addCode(blockers, 'library-catalog-handoff-not-ready');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.handoffValid = true;

    // Privacy scan 1: input handoff preview (top-level)
    scanPrivacy(handoffPreview, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    // Privacy scan 2: handoff request envelope
    scanPrivacy(safeObject(handoffPreview.handoffRequest), blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.handoffPrivacySafe = true;

    // Gate 3: operation must be allowed
    var operation = cleanString(args.operation) ||
      cleanString(handoffPreview.operation) ||
      cleanString(safeObject(handoffPreview.candidate).domainOperation) ||
      cleanString(safeObject(handoffPreview.proposal).domainOperation);
    if (!OPERATION_META[operation]) {
      addCode(blockers, 'library-catalog-operation-not-allowed');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.operationAllowed = true;
    var meta = OPERATION_META[operation];

    // Gate 4: ownerKind cross-check vs handoff preview's routing
    if (cleanString(handoffPreview.ownerKind) !== meta.ownerKind) {
      addCode(blockers, 'library-catalog-handoff-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }
    validationSummary.ownerKindMatched = true;

    // Gate 5: defensive re-validate the owner handoff envelope shape
    var handoffRequest = safeObject(handoffPreview.handoffRequest);
    if (!validateOwnerHandoffShape(handoffRequest, blockers, warnings)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent,
        ownerKind: meta.ownerKind, targetBroker: meta.targetBroker });
    }

    // Gate 6: actorPeer + originAccountIdHash sanity (the handoff preview
    // already validated these, but we re-check defensively since the
    // receipt is the audit artifact).
    var actorPeer = safeObject(handoffPreview.actorPeer);
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)
        || !isSha256Hex(actorPeer.installIdHash)
        || !isSha256Hex(actorPeer.syncPeerIdHash)) {
      addCode(blockers, 'library-catalog-actor-peer-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }
    var originAccountIdHash = cleanLower(handoffPreview.originAccountIdHash) ||
      cleanLower(args.originAccountIdHash);
    if (!isSha256Hex(originAccountIdHash)) {
      addCode(blockers, 'library-catalog-origin-account-id-hash-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // Tombstone defense-in-depth: re-validate the F5 handoff inside the
    // handoff request before going further. Failure here is fail-CLOSED
    // (the receipt for a tombstone with a malformed F5 envelope must not
    // be emitted).
    if (meta.ownerKind === OWNER_KIND_F5) {
      var f5HandoffEnvelope = safeObject(handoffRequest.f5Handoff);
      if (!validateF5HandoffShape(f5HandoffEnvelope, blockers, warnings)) {
        return blockedResult({ blockers: blockers, warnings: warnings,
          validationSummary: validationSummary, observedAtIso: observedAtIso,
          operation: operation, operationIntent: handoffPreview.operationIntent,
          ownerKind: meta.ownerKind, targetBroker: meta.targetBroker });
      }
    }

    // ── Build applyEvent ──
    var candidate = safeObject(handoffPreview.candidate);
    var proposal = safeObject(handoffPreview.proposal);
    var canonicalCatalog = safeObject(handoffPreview.canonicalCatalog);
    var preflight = safeObject(handoffPreview.preflight);
    var diagnostics = safeObject(handoffPreview.diagnostics);
    var lifecycleTransition = shapeLifecycleTransition(meta, handoffPreview, observedAtIso, warnings);

    var payload = buildPayload(meta, handoffPreview, {
      proposal: proposal, candidate: candidate,
      revisionHash: candidate.revisionHash || proposal.revisionHash,
      targetHash: candidate.targetHash || proposal.targetHash
    }, actorPeer, lifecycleTransition, observedAtIso);

    // Privacy scan on payload before sealing applyEvent
    scanPrivacy(payload, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    var capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
    var payloadHash = await sha256Hex(canonicalJson(payload));
    if (!isSha256Hex(capabilitySnapshotHash)) addCode(blockers, 'library-catalog-apply-event-shape-invalid');
    if (!isSha256Hex(payloadHash)) addCode(blockers, 'library-catalog-apply-event-shape-invalid');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    var applyEvent = {
      schema: APPLY_EVENT_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: KIND_APPLY_EVENT,
      id: cleanString(args.applyEventId) || generateUuid(),
      lineageId: cleanLower(handoffPreview.lineageId),
      createdAt: observedAtIso,
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: actorPeer
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'strong-local-authority',
      capabilityUsed: 'apply',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(handoffPreview.subjectId),
      operation: meta.applyOperation,
      operationIntent: cleanString(handoffPreview.operationIntent),
      redactionClass: REDACTED,
      dryRun: false,
      transactional: true,
      dedupeKey: cleanLower(handoffPreview.dedupeKey),
      payloadHash: payloadHash,
      payload: payload
    };
    validationSummary.applyEventShape = true;

    // Privacy scan 3: applyEvent
    scanPrivacy(applyEvent, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // ── Build receipt ──
    var receiptId = await sha256Hex(canonicalJson({
      receiptSchema: RECEIPT_SCHEMA,
      subjectId: cleanLower(handoffPreview.subjectId),
      operationId: cleanString(handoffPreview.operationId),
      receiptKind: meta.receiptKind,
      observedAtIso: observedAtIso
    }));
    if (!isSha256Hex(receiptId)) {
      addCode(blockers, 'library-catalog-receipt-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }
    var receipt = {
      schema: RECEIPT_SCHEMA,
      version: VERSION,
      receiptId: receiptId,
      receiptKind: meta.receiptKind,
      receiptAtIso: observedAtIso,
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(handoffPreview.subjectId),
      lineageId: cleanLower(handoffPreview.lineageId),
      dedupeKey: cleanLower(handoffPreview.dedupeKey),
      operationId: cleanString(handoffPreview.operationId),
      operation: meta.applyOperation,
      operationIntent: cleanString(handoffPreview.operationIntent),
      ownerKind: meta.ownerKind,
      targetBroker: meta.targetBroker,
      actorPeer: actorPeer,
      auditResult: meta.ownerKind === OWNER_KIND_F5 ? 'f5-handed-off' : 'preview-only',
      preStateHash: payload.preStateHash,
      postStateHash: payload.postStateHash,
      lifecycleTransition: payload.lifecycleTransition,
      predicateVersion: meta.predicateVersion,
      validationSummary: { ok: true, blockers: [], warnings: [] },
      metadata: {
        receiptOnly: true,
        domain: PRIVACY_DOMAIN_TAG,
        previewOnly: true
      }
    };
    validationSummary.receiptShape = true;

    // Privacy scan 4: receipt
    scanPrivacy(receipt, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // ── Build auditMetadata ──
    var auditId = await sha256Hex(canonicalJson({
      auditSchema: 'h2o.library.catalog.audit-id.v1',
      subjectId: cleanLower(handoffPreview.subjectId),
      operationId: cleanString(handoffPreview.operationId),
      observedAtIso: observedAtIso
    }));
    var transactionId = await sha256Hex(canonicalJson({
      transactionSchema: 'h2o.library.catalog.transaction-id.v1',
      receiptId: receiptId,
      observedAtIso: observedAtIso
    }));
    var eventDigest = await sha256Hex(canonicalJson(applyEvent));
    if (!isSha256Hex(auditId) || !isSha256Hex(transactionId) || !isSha256Hex(eventDigest)) {
      addCode(blockers, 'library-catalog-audit-metadata-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }
    var auditMetadata = {
      auditId: auditId,
      auditMaintenanceId: auditId,
      domain: PRIVACY_DOMAIN_TAG,
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(handoffPreview.subjectId),
      operation: meta.applyOperation,
      operationIntent: cleanString(handoffPreview.operationIntent),
      lineageId: cleanLower(handoffPreview.lineageId),
      eventDigest: eventDigest,
      dedupeKey: cleanLower(handoffPreview.dedupeKey),
      transactionId: transactionId,
      actorPeer: actorPeer,
      policyVersion: AUDIT_POLICY_VERSION,
      predicateVersion: meta.predicateVersion,
      createdAtIso: observedAtIso,
      metadata: {
        receiptOnly: true,
        ownerKind: meta.ownerKind,
        receiptKind: meta.receiptKind,
        previewOnly: true
      }
    };
    auditMetadata = validateAuditMetadata(auditMetadata, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }
    validationSummary.auditMetadataShape = true;

    // Privacy scan 5: auditMetadata
    scanPrivacy(auditMetadata, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // ── Build watermarkPreview + consumedOperationPreview ──
    var watermarkInput = {
      watermarkId: await sha256Hex(canonicalJson({
        watermarkSchema: 'h2o.library.catalog.watermark.v1',
        subjectId: cleanLower(handoffPreview.subjectId),
        peerId: cleanLower(actorPeer.syncPeerIdHash),
        revisionHash: payload.postStateHash,
        observedAtIso: observedAtIso
      })),
      peerId: cleanLower(actorPeer.syncPeerIdHash),
      subjectId: cleanLower(handoffPreview.subjectId),
      lineageId: cleanLower(handoffPreview.lineageId),
      revisionHash: payload.postStateHash,
      watermarkAtIso: observedAtIso,
      recordedAtIso: observedAtIso,
      dedupeKey: cleanLower(handoffPreview.dedupeKey)
    };
    var watermarkPreview = shapeWithKernel('shapeWatermark', watermarkInput, warnings, 'watermark-preview-shape-threw');
    var watermarkState = shapeWithKernel('shapeWatermarkState', {
      proposed: watermarkPreview, current: null
    }, warnings, 'watermark-state-shape-threw');
    if (!isObject(watermarkPreview)) {
      addCode(blockers, 'library-catalog-watermark-preview-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }
    validationSummary.watermarkPreviewShape = true;

    var consumedOperationPreview = shapeWithKernel('shapeConsumedOperation', {
      consumedId: cleanString(handoffPreview.operationId),
      eventDigest: eventDigest,
      dedupeKey: cleanLower(handoffPreview.dedupeKey),
      lineageId: cleanLower(handoffPreview.lineageId),
      subjectId: cleanLower(handoffPreview.subjectId),
      sourcePeerId: cleanLower(actorPeer.syncPeerIdHash),
      envelopeKind: KIND_APPLY_EVENT,
      operationKind: meta.applyOperation,
      consumedStatus: 'consumed',
      consumedAtIso: observedAtIso,
      actorPeer: actorPeer,
      reason: 'library-catalog-apply-event-receipt-preview',
      validationSummary: { ok: true, blockers: [], warnings: [] }
    }, warnings, 'consumed-op-preview-shape-threw');
    if (!isObject(consumedOperationPreview)) {
      addCode(blockers, 'library-catalog-consumed-op-preview-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }
    validationSummary.consumedOperationPreviewShape = true;

    // Privacy scan 6: watermark + consumed-op previews (single combined scan)
    scanPrivacy({ watermarkPreview: watermarkPreview, watermarkState: watermarkState,
      consumedOperationPreview: consumedOperationPreview }, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // ── Privacy scan 7: F5 handoff payload (tombstone only) ──
    var f5HandoffEnvelope = null;
    if (meta.ownerKind === OWNER_KIND_F5) {
      f5HandoffEnvelope = safeObject(handoffRequest.f5Handoff);
      scanPrivacy(f5HandoffEnvelope, blockers, warnings);
      if (blockers.length) {
        return blockedResult({ blockers: blockers, warnings: warnings,
          validationSummary: validationSummary, observedAtIso: observedAtIso,
          operation: operation, operationIntent: handoffPreview.operationIntent });
      }
    }

    // ── Build digests (deterministic over the built envelopes) ──
    var applyEventDigest = await sha256Hex(canonicalJson(applyEvent));
    var receiptDigest = await sha256Hex(canonicalJson(receipt));
    if (!isSha256Hex(applyEventDigest)) addCode(blockers, 'library-catalog-apply-event-shape-invalid');
    if (!isSha256Hex(receiptDigest)) addCode(blockers, 'library-catalog-receipt-shape-invalid');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // ── relatedSubjects pass-through + truncation ──
    var related = handoffPreview.relatedSubjects;
    if (!Array.isArray(related) && Array.isArray(args.relatedSubjects)) related = args.relatedSubjects;
    var truncated = truncateRelatedSubjects(related, warnings);
    // Privacy scan 8: relatedSubjects
    scanPrivacy(truncated, blockers, warnings);
    if (blockers.length) {
      validationSummary.relatedSubjectsClear = false;
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // Pass-through warnings from handoff / proposal / preflight
    mergeCodes(warnings, handoffPreview.warnings);
    mergeCodes(warnings, candidate.warnings);
    mergeCodes(warnings, preflight.warnings);

    // Context-incomplete advisory
    if (!isObject(handoffPreview.preflight) && !isObject(handoffPreview.candidate)) {
      addCode(warnings, 'library-catalog-receipt-context-incomplete');
    }

    // ── F5 review queue ingest (tombstone only — F14.5.5.2 pattern) ──
    var f5ReviewIngested = false;
    var f5ReviewId = null;
    var f5Touched = false;
    if (meta.ownerKind === OWNER_KIND_F5 && f5HandoffEnvelope) {
      validationSummary.f5IngestAttempted = true;
      var ingestOutcome = await ingestIntoF5ReviewQueue({
        f5Handoff: f5HandoffEnvelope,
        originAccountIdHash: originAccountIdHash,
        actorPeer: actorPeer,
        observedAtIso: receipt.receiptAtIso
      }, warnings);
      f5ReviewIngested = ingestOutcome.f5ReviewIngested === true;
      f5ReviewId = ingestOutcome.f5ReviewId;
      if (f5ReviewIngested && isSha256Hex(f5ReviewId)) {
        f5Touched = true;
        validationSummary.f5IngestSucceeded = true;
      }
    } else {
      addCode(warnings, 'receipt-preview-only');
    }

    // ── Assemble success result envelope ──
    var result = buildResult({
      ok: true,
      operation: operation,
      operationIntent: cleanString(handoffPreview.operationIntent),
      ownerKind: meta.ownerKind,
      targetBroker: meta.targetBroker,
      subjectId: handoffPreview.subjectId,
      lineageId: handoffPreview.lineageId,
      dedupeKey: handoffPreview.dedupeKey,
      operationId: handoffPreview.operationId,
      expectedCurrentState: handoffPreview.expectedCurrentState,
      expectedTargetState: handoffPreview.expectedTargetState,
      originAccountIdHash: originAccountIdHash,
      actorPeer: actorPeer,
      authorityMetadata: handoffPreview.authorityMetadata,
      handoffPreview: handoffPreview,
      handoffRequest: handoffRequest,
      proposal: proposal,
      candidate: candidate,
      canonicalCatalog: canonicalCatalog,
      preflight: preflight,
      diagnostics: diagnostics,
      relatedSubjects: truncated,
      applyEvent: applyEvent,
      receipt: receipt,
      receiptDigest: receiptDigest,
      applyEventDigest: applyEventDigest,
      auditMetadata: auditMetadata,
      watermarkPreview: watermarkPreview,
      consumedOperationPreview: consumedOperationPreview,
      f5ReviewIngested: f5ReviewIngested,
      f5ReviewId: f5ReviewId,
      validationSummary: validationSummary,
      blockers: [],
      warnings: warnings,
      sideEffectSummary: { f5Touched: f5Touched },
      observedAtIso: observedAtIso
    });

    // Privacy scan 9: final result envelope (defense in depth)
    return scanFinalOutput(result);
  }

  // ── Convenience wrappers ────────────────────────────────────────────
  function withOperation(input, operation) {
    return Object.assign({}, safeObject(input), { operation: operation });
  }
  H2O.Desktop.Sync.buildLibraryCatalogApplyEventReceipt = buildLibraryCatalogApplyEventReceipt;
  H2O.Desktop.Sync.buildLibraryCatalogCreateApplyEventReceipt = function (input) {
    return buildLibraryCatalogApplyEventReceipt(withOperation(input, 'create'));
  };
  H2O.Desktop.Sync.buildLibraryCatalogRenameApplyEventReceipt = function (input) {
    return buildLibraryCatalogApplyEventReceipt(withOperation(input, 'rename'));
  };
  H2O.Desktop.Sync.buildLibraryCatalogRecolorApplyEventReceipt = function (input) {
    return buildLibraryCatalogApplyEventReceipt(withOperation(input, 'recolor'));
  };
  H2O.Desktop.Sync.buildLibraryCatalogArchiveApplyEventReceipt = function (input) {
    return buildLibraryCatalogApplyEventReceipt(withOperation(input, 'archive'));
  };
  H2O.Desktop.Sync.buildLibraryCatalogRestoreFromArchivedApplyEventReceipt = function (input) {
    return buildLibraryCatalogApplyEventReceipt(withOperation(input, 'restore-from-archived'));
  };
  H2O.Desktop.Sync.buildLibraryCatalogTombstoneApplyEventReceipt = function (input) {
    return buildLibraryCatalogApplyEventReceipt(withOperation(input, 'tombstone'));
  };
  H2O.Desktop.Sync.buildLibraryCatalogRestoreFromRetainedApplyEventReceipt = function (input) {
    return buildLibraryCatalogApplyEventReceipt(withOperation(input, 'restore-from-retained'));
  };

  H2O.Desktop.Sync.__libraryCatalogApplyEventReceiptInstalled = true;
  H2O.Desktop.Sync.__libraryCatalogApplyEventReceiptVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
