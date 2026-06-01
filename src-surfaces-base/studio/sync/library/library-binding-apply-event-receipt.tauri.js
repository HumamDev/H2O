/* H2O Desktop Sync - F15.6.b library binding apply-event receipt
 *
 * Read-only apply-event receipt builder for library binding operations.
 * Composes the F15.5.b binding handoff preview (which itself wraps the
 * F15.4.b binding proposal candidate) into a kernel-validated applyEvent
 * + receipt + auditMetadata envelope, with watermarkPreview /
 * consumedOperationPreview shapes prepared for the F14.6 execute
 * settlement writer.
 *
 * Per F15.0.0 §6.1 the library.binding lane has only Native owners —
 * this module shapes no F5 envelope, never touches the F5 review queue,
 * and never reaches Native execution. It is strictly preview-only for
 * both supported operations (bind, unbind); every sideEffectSummary flag
 * stays false on every success path.
 *
 * Materialized cache (chats.category_id):
 *
 *   Per F15.0.2 §2.2, writes to the chats.category_id materialized read
 *   cache are owned EXCLUSIVELY by the F14.6 execute-settlement-writer
 *   after a chat-category binding apply lands. This receipt MUST NOT
 *   write the cache. The defense-in-depth forbidden-field list includes
 *   `category_id` / `chats.category_id` so the cache key never appears
 *   in any envelope this module emits.
 *
 *   For chat-category bindings, this module emits a single info
 *   warning `chats-category-id-refresh-pending`. The warning makes the
 *   cache dependency explicit in the receipt envelope so downstream
 *   settlement / operator UI know a refresh is due. The warning itself
 *   carries no raw cache key.
 *
 * This module NEVER calls Native, applies, publishes, enqueues
 * relay/outbox rows, advances watermarks, records consumed operations,
 * writes Labels/Categories/Tags storage, writes the chats.category_id
 * materialized cache, ingests into the F5 review queue, or mutates
 * any store.
 *
 * Public API:
 *   H2O.Desktop.Sync.buildLibraryBindingApplyEventReceipt(input)        -> Promise<result>
 *   H2O.Desktop.Sync.buildLibraryBindingBindApplyEventReceipt(input)
 *   H2O.Desktop.Sync.buildLibraryBindingUnbindApplyEventReceipt(input)
 *
 *   H2O.Desktop.Sync.__libraryBindingApplyEventReceiptInstalled
 *   H2O.Desktop.Sync.__libraryBindingApplyEventReceiptVersion
 *
 * Kernel adoption:
 *   identity-kit:           canonicalJSON, sha256Hex, isSha256Hex
 *   privacy-scan:           scanDomainForbiddenFields('library.binding', ...)
 *   audit-proof-framework:  shapeAuditMetadata, shapeAuditRecord,
 *                           validateAuditMetadata (when available)
 *   consumed-op:            shapeConsumedOperation
 *   watermark-service:      shapeWatermark, shapeWatermarkState
 *   lifecycle-framework:    shapeLifecycleTransition
 *   owner-handoff:          validateOwnerHandoff (defense-in-depth)
 *   result-shape:           createResult (fallback wrap)
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
  if (H2O.Desktop.Sync.__libraryBindingApplyEventReceiptInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f15.6.binding';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-binding-apply-event-receipt.v1';
  var APPLY_EVENT_SCHEMA = 'h2o.desktop.sync.library-binding-apply-event.v1';
  var RECEIPT_SCHEMA = 'h2o.desktop.sync.library-binding-receipt.v1';
  var SUBJECT_TYPE = 'library.binding';
  var PRIVACY_DOMAIN_TAG = 'library.binding';
  var OWNER_KIND_NATIVE = 'native';
  var REDACTED = 'redacted';
  var KIND_APPLY_EVENT = 'applyEvent';
  var AUDIT_POLICY_VERSION = 'h2o.library.binding.audit-policy.v1';
  var CAPABILITY_TAG = 'h2o.library.binding.capability.apply.v1';
  var MAX_RELATED_SUBJECTS = 50;
  var SHA256_RE = /^[0-9a-f]{64}$/;

  // Same forbidden-field defense-in-depth list as F15.5.b PLUS the
  // materialized cache keys `category_id` / `chats.category_id` — the
  // binding lane is the source of truth for those keys; this receipt
  // must never emit them.
  var PRIVACY_FORBIDDEN_FIELDS = [
    'rawPayload', 'bindingPayload',
    'name', 'rawName',
    'rawLeftId', 'rawRightId',
    'chatId', 'chat_id',
    'labelId', 'tagId', 'categoryId', 'folderId',
    'accountId', 'account_id', 'rawAccountId',
    'userId', 'user_id', 'rawUserId',
    'title', 'chatTitle', 'rawTitle',
    'content', 'body', 'text',
    'messages', 'turns',
    'notes', 'rawNotes',
    'category_id', 'chats.category_id',
    'attachments', 'files',
    'path', 'url',
    'password', 'apiKey',
    'cookies', 'session_token', 'sessionToken',
    'share_url', 'share_token', 'shareUrl', 'shareToken'
  ];

  // Per-operation metadata. Both operations route to Native; no F5 path
  // exists in the binding lane (F15.0.0 §6.1).
  var OPERATION_META = {
    'bind': {
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      receiptKind: 'library-binding-bind-applied',
      applyOperation: 'library-binding-bind-applied',
      bindingFromState: 'absent',
      bindingToState: 'bound',
      predicateVersion: 'h2o.library.binding.bind.predicate.v1'
    },
    'unbind': {
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      receiptKind: 'library-binding-unbind-applied',
      applyOperation: 'library-binding-unbind-applied',
      bindingFromState: 'bound',
      bindingToState: 'unbound',
      predicateVersion: 'h2o.library.binding.unbind.predicate.v1'
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
  // Kernel-first with deterministic local fall-back. Eight call sites in
  // the main flow guard against leakage at every shape transition.
  function scanPrivacy(target, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scan = kernel.scanDomainForbiddenFields(PRIVACY_DOMAIN_TAG, target);
        if (scan && scan.ok === false) {
          mergeCodes(blockers, scan.blockers);
          mergeCodes(warnings, scan.warnings);
          addCode(blockers, 'library-binding-receipt-privacy-failed');
          return;
        }
      } catch (_) {
        addCode(warnings, 'library-binding-receipt-privacy-scan-threw');
      }
    } else {
      addCode(warnings, 'library-binding-receipt-privacy-scan-unavailable');
    }
    var hits = [];
    findForbiddenFieldsLocal(target, '', hits);
    if (hits.length) {
      addCode(blockers, 'library-binding-receipt-privacy-failed');
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

  // ── Endpoint defense-in-depth ───────────────────────────────────────
  // Mirrors F15.5.b — receipt re-checks endpoint sha256s so a hand-rolled
  // or tampered handoff that clears the preview gate cannot produce a
  // Native apply-event receipt.
  function validateEndpoints(handoffPreview, blockers) {
    var canonical = safeObject(handoffPreview.canonicalBinding);
    var current = safeObject(handoffPreview.expectedCurrentState);
    var target = safeObject(handoffPreview.expectedTargetState);
    var left = cleanLower(canonical.leftSubjectId)
      || cleanLower(target.leftSubjectId)
      || cleanLower(current.leftSubjectId);
    var right = cleanLower(canonical.rightSubjectId)
      || cleanLower(target.rightSubjectId)
      || cleanLower(current.rightSubjectId);
    if (!isSha256Hex(left) || !isSha256Hex(right)) {
      addCode(blockers, 'library-binding-endpoints-missing');
      return false;
    }
    return true;
  }

  // ── Kernel shape wrappers ───────────────────────────────────────────
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
        addCode(blockers, 'library-binding-audit-metadata-invalid');
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
        addCode(blockers, 'library-binding-handoff-shape-invalid');
        return false;
      }
      return true;
    } catch (_) {
      addCode(warnings, 'kernel-handoff-shape-threw');
      return true;
    }
  }

  // ── Apply event + receipt + audit metadata + previews ───────────────
  function buildPayload(meta, handoffPreview, candidate, actorPeer, bindingTransition,
                         canonicalBinding, observedAtIso) {
    return {
      auditMaintenanceId: '',
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
        bindingState: cleanString(safeObject(handoffPreview.expectedCurrentState).bindingState) ||
                      meta.bindingFromState
      },
      postState: {
        hash: cleanLower(safeObject(handoffPreview.expectedTargetState).revisionHash) ||
              cleanLower(safeObject(candidate).revisionHash) ||
              cleanLower(safeObject(candidate).targetHash),
        bindingState: cleanString(safeObject(handoffPreview.expectedTargetState).bindingState) ||
                      meta.bindingToState
      },
      bindingTransition: {
        fromState: bindingTransition.fromState,
        toState: bindingTransition.toState
      },
      kernelLifecycleTransition: bindingTransition,
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
      bindingKind: cleanString(canonicalBinding.bindingKind),
      // Endpoint sha256s carried into the payload so settlement-writer can
      // locate the chat by leftSubjectId (for chat-category cache refresh).
      // These are sha256 hashes, never raw IDs.
      leftSubjectId: cleanLower(canonicalBinding.leftSubjectId),
      rightSubjectId: cleanLower(canonicalBinding.rightSubjectId),
      leftSubjectType: cleanString(canonicalBinding.leftSubjectType),
      rightSubjectType: cleanString(canonicalBinding.rightSubjectType),
      result: 'applied',
      receiptOnly: true
    };
  }

  function shapeBindingTransition(meta, handoffPreview, observedAtIso, warnings) {
    var current = safeObject(handoffPreview.expectedCurrentState);
    var target = safeObject(handoffPreview.expectedTargetState);
    var fromState = cleanString(current.bindingState) || meta.bindingFromState;
    var toState = cleanString(target.bindingState) || meta.bindingToState;
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
  // sideEffectSummary: all 8 flags ALWAYS false on every binding receipt
  // success path (no F5 path, no cache write, no Native execution, no
  // apply, no publication / relay / outbox / watermark / consumed-op).
  function sideEffectSummary() {
    return {
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      applyExecuted: false
    };
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
      canonicalBinding: opts.canonicalBinding || null,
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
      validationSummary: opts.validationSummary || {},
      blockers: codeList(opts.blockers),
      warnings: codeList(opts.warnings),
      sideEffectSummary: sideEffectSummary(),
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

  // ── Main entry — buildLibraryBindingApplyEventReceipt(input) ────────
  async function buildLibraryBindingApplyEventReceipt(input) {
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
      // Per F15.0.0 §6.1 the binding lane has no F5 path; these gates
      // are surfaced as constants so the validationSummary shape is
      // structurally compatible with F15.6.a catalog tombstone receipts.
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
      addCode(blockers, 'library-binding-handoff-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.handoffResolved = true;

    // Gate 2: handoff preview must be ok + ready
    if (handoffPreview.ok !== true) {
      mergeCodes(warnings, handoffPreview.warnings);
      addCode(blockers, 'library-binding-handoff-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    if (handoffPreview.handoffReady !== true) {
      addCode(blockers, 'library-binding-handoff-not-ready');
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
      addCode(blockers, 'library-binding-operation-not-allowed');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.operationAllowed = true;
    var meta = OPERATION_META[operation];

    // Gate 4: ownerKind cross-check — binding lane is always Native
    if (cleanString(handoffPreview.ownerKind) !== meta.ownerKind) {
      addCode(blockers, 'library-binding-handoff-shape-invalid');
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

    // Gate 6: actorPeer + originAccountIdHash sanity (defense-in-depth)
    var actorPeer = safeObject(handoffPreview.actorPeer);
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)
        || !isSha256Hex(actorPeer.installIdHash)
        || !isSha256Hex(actorPeer.syncPeerIdHash)) {
      addCode(blockers, 'library-binding-actor-peer-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }
    var originAccountIdHash = cleanLower(handoffPreview.originAccountIdHash) ||
      cleanLower(args.originAccountIdHash);
    if (!isSha256Hex(originAccountIdHash)) {
      addCode(blockers, 'library-binding-origin-account-id-hash-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // Endpoint defense-in-depth: handoff preview already verifies this,
    // but re-checking here ensures a tampered handoff cannot produce a
    // Native apply-event receipt.
    if (!validateEndpoints(handoffPreview, blockers)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // ── Build applyEvent ──
    var candidate = safeObject(handoffPreview.candidate);
    var proposal = safeObject(handoffPreview.proposal);
    var canonicalBinding = safeObject(handoffPreview.canonicalBinding);
    var preflight = safeObject(handoffPreview.preflight);
    var diagnostics = safeObject(handoffPreview.diagnostics);
    var bindingTransition = shapeBindingTransition(meta, handoffPreview, observedAtIso, warnings);

    var payload = buildPayload(meta, handoffPreview, {
      proposal: proposal, candidate: candidate,
      revisionHash: candidate.revisionHash || proposal.revisionHash,
      targetHash: candidate.targetHash || proposal.targetHash
    }, actorPeer, bindingTransition, canonicalBinding, observedAtIso);

    // Privacy scan on payload before sealing applyEvent
    scanPrivacy(payload, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    var capabilitySnapshotHash = await sha256Hex(CAPABILITY_TAG);
    var payloadHash = await sha256Hex(canonicalJson(payload));
    if (!isSha256Hex(capabilitySnapshotHash)) addCode(blockers, 'library-binding-apply-event-shape-invalid');
    if (!isSha256Hex(payloadHash)) addCode(blockers, 'library-binding-apply-event-shape-invalid');
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
      addCode(blockers, 'library-binding-receipt-shape-invalid');
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
      auditResult: 'preview-only',
      preStateHash: payload.preStateHash,
      postStateHash: payload.postStateHash,
      bindingTransition: payload.bindingTransition,
      bindingKind: payload.bindingKind,
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
      auditSchema: 'h2o.library.binding.audit-id.v1',
      subjectId: cleanLower(handoffPreview.subjectId),
      operationId: cleanString(handoffPreview.operationId),
      observedAtIso: observedAtIso
    }));
    var transactionId = await sha256Hex(canonicalJson({
      transactionSchema: 'h2o.library.binding.transaction-id.v1',
      receiptId: receiptId,
      observedAtIso: observedAtIso
    }));
    var eventDigest = await sha256Hex(canonicalJson(applyEvent));
    if (!isSha256Hex(auditId) || !isSha256Hex(transactionId) || !isSha256Hex(eventDigest)) {
      addCode(blockers, 'library-binding-audit-metadata-invalid');
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
        bindingKind: cleanString(canonicalBinding.bindingKind),
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
        watermarkSchema: 'h2o.library.binding.watermark.v1',
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
      addCode(blockers, 'library-binding-watermark-preview-invalid');
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
      reason: 'library-binding-apply-event-receipt-preview',
      validationSummary: { ok: true, blockers: [], warnings: [] }
    }, warnings, 'consumed-op-preview-shape-threw');
    if (!isObject(consumedOperationPreview)) {
      addCode(blockers, 'library-binding-consumed-op-preview-invalid');
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

    // ── Build digests (deterministic over the built envelopes) ──
    var applyEventDigest = await sha256Hex(canonicalJson(applyEvent));
    var receiptDigest = await sha256Hex(canonicalJson(receipt));
    if (!isSha256Hex(applyEventDigest)) addCode(blockers, 'library-binding-apply-event-shape-invalid');
    if (!isSha256Hex(receiptDigest)) addCode(blockers, 'library-binding-receipt-shape-invalid');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: handoffPreview.operationIntent });
    }

    // ── relatedSubjects pass-through + truncation ──
    var related = handoffPreview.relatedSubjects;
    if (!Array.isArray(related) && Array.isArray(args.relatedSubjects)) related = args.relatedSubjects;
    var truncated = truncateRelatedSubjects(related, warnings);
    // Privacy scan 7: relatedSubjects
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
      addCode(warnings, 'library-binding-receipt-context-incomplete');
    }

    // ── Chat-category materialized cache dependency ─────────────────
    // For chat-category bindings, the chats.category_id materialized
    // read cache is downstream of this apply event. The receipt does
    // NOT write the cache (F15.0.2 §2.2 — execute-settlement-writer
    // owns that). The warning makes the dependency explicit in the
    // envelope so downstream consumers (settlement / operator UI) know
    // a refresh is due.
    if (cleanString(canonicalBinding.bindingKind) === 'chat-category') {
      addCode(warnings, 'chats-category-id-refresh-pending');
    }

    // Preview-only marker (no F5 ingest, no Native call, no apply)
    addCode(warnings, 'receipt-preview-only');

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
      canonicalBinding: canonicalBinding,
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
      validationSummary: validationSummary,
      blockers: [],
      warnings: warnings,
      observedAtIso: observedAtIso
    });

    // Privacy scan 8: final result envelope (defense in depth)
    return scanFinalOutput(result);
  }

  // ── Convenience wrappers ────────────────────────────────────────────
  function withOperation(input, operation) {
    return Object.assign({}, safeObject(input), { operation: operation });
  }
  H2O.Desktop.Sync.buildLibraryBindingApplyEventReceipt = buildLibraryBindingApplyEventReceipt;
  H2O.Desktop.Sync.buildLibraryBindingBindApplyEventReceipt = function (input) {
    return buildLibraryBindingApplyEventReceipt(withOperation(input, 'bind'));
  };
  H2O.Desktop.Sync.buildLibraryBindingUnbindApplyEventReceipt = function (input) {
    return buildLibraryBindingApplyEventReceipt(withOperation(input, 'unbind'));
  };

  H2O.Desktop.Sync.__libraryBindingApplyEventReceiptInstalled = true;
  H2O.Desktop.Sync.__libraryBindingApplyEventReceiptVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
