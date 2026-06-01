/* H2O Desktop Sync - F15.8.e library catalog F5 closure bridge
 *
 * Settlement-callable bridge for library.catalog tombstone envelopes after
 * F15.6.a has already ingested the F5 review and the F5/operator process has
 * produced a post-decision state.
 *
 * Safety invariants:
 *   - Handles only library.catalog / library-catalog-tombstone envelopes.
 *   - Closes an existing F5 review row only. It never records the decision.
 *   - Shapes Native evidence for sealed/auto-expired tombstones but never
 *     calls Native.
 *   - Does not mutate catalog storage, SQLite, category cache, publication,
 *     relay/outbox, watermarks, consumed operations, or store shims.
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
  if (H2O.Desktop.Sync.__libraryCatalogF5ClosureInstalled) return;

  var VERSION = '0.1.0-f15.8.f5-closure';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-catalog-f5-closure.v1';
  var PRIVACY_DOMAIN_TAG = 'library.catalog';
  var ENVELOPE_SCHEMA = 'h2o.desktop.sync.execute-envelope.v1';
  var DOMAIN_ID = 'library.catalog';
  var FLAVOR = 'library-catalog-tombstone';
  var OPERATION_KIND = 'library-catalog-tombstone-applied';
  var STATE_APPROVED_SEAL = 'approved-seal';
  var STATE_APPROVED_RESTORE = 'approved-restore';
  var STATE_AUTO_EXPIRED = 'auto-expired';
  var STATE_CLOSED_SEALED = 'closed-sealed';
  var STATE_CLOSED_RESTORED = 'closed-restored';
  var POST_DECISION_STATES = [STATE_APPROVED_SEAL, STATE_APPROVED_RESTORE, STATE_AUTO_EXPIRED];
  var TERMINAL_STATES = [STATE_CLOSED_SEALED, STATE_CLOSED_RESTORED];
  var SHA256_RE = /^[0-9a-f]{64}$/;

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
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
  }
  function mergeCodes(into, value) {
    codeList(value).forEach(function (code) { addCode(into, code); });
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
  function canonicalJSON(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.canonicalJSON === 'function') {
      try { return kernel.canonicalJSON(value); } catch (_) { /* fall through */ }
    }
    return JSON.stringify(canonicalize(value));
  }
  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
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
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var digest = await kernel.sha256Hex(value);
        if (isSha256Hex(digest)) return cleanLower(digest);
      } catch (_) { /* fall through */ }
    }
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJSON(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function sideEffectSummary(closed, nativeApplyRequired) {
    return {
      f5Touched: closed === true,
      f5Closed: closed === true,
      nativeCalled: false,
      applyExecuted: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      nativeApplyRequired: nativeApplyRequired === true,
      sqliteSentinelUsed: false,
      storeShimRouted: false
    };
  }

  function buildResult(opts) {
    var o = safeObject(opts);
    var blockers = codeList(o.blockers);
    var closed = blockers.length === 0 && o.closed === true;
    var nativeApplyRequired = closed && o.nativeApplyRequired === true;
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0 && o.ok !== false,
      closed: closed,
      idempotent: closed && o.idempotent === true,
      decisionKind: cleanString(o.decisionKind),
      f5ReviewId: cleanLower(o.f5ReviewId),
      f5CurrentState: cleanString(o.f5CurrentState),
      f5TargetState: cleanString(o.f5TargetState),
      nativeApplyRequired: nativeApplyRequired,
      nativeEvidence: o.nativeEvidence || null,
      closureEvidenceDigest: cleanLower(o.closureEvidenceDigest),
      envelope: o.envelope || null,
      review: o.review || null,
      blockers: blockers,
      warnings: codeList(o.warnings),
      sideEffectSummary: sideEffectSummary(closed, nativeApplyRequired),
      observedAtIso: cleanString(o.observedAtIso) || nowIsoSeconds()
    };
  }

  function blockedResult(opts) {
    var o = safeObject(opts);
    return buildResult(Object.assign({}, o, {
      ok: false,
      closed: false,
      idempotent: false,
      nativeApplyRequired: false
    }));
  }

  function scanPrivacy(target, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') {
      addCode(warnings, 'library-catalog-f5-closure-context-incomplete');
      return true;
    }
    try {
      var scan = kernel.scanDomainForbiddenFields(PRIVACY_DOMAIN_TAG, target);
      mergeCodes(blockers, scan && scan.blockers);
      mergeCodes(warnings, scan && scan.warnings);
      if (!scan || scan.ok !== true) {
        addCode(blockers, 'library-catalog-f5-closure-privacy-failed');
        return false;
      }
      return true;
    } catch (_) {
      addCode(blockers, 'library-catalog-f5-closure-privacy-failed');
      return false;
    }
  }

  function validateActorPeer(actorPeer) {
    var peer = safeObject(actorPeer);
    if (!isSha256Hex(peer.physicalDeviceIdHash) ||
        !isSha256Hex(peer.installIdHash) ||
        !isSha256Hex(peer.syncPeerIdHash)) return null;
    return {
      physicalDeviceIdHash: cleanLower(peer.physicalDeviceIdHash),
      installIdHash: cleanLower(peer.installIdHash),
      syncPeerIdHash: cleanLower(peer.syncPeerIdHash),
      surfaceKind: cleanString(peer.surfaceKind) || 'desktop-tauri'
    };
  }

  function validateEnvelope(envelope, blockers, warnings) {
    var e = safeObject(envelope);
    var profile = safeObject(e.dispatchProfile);
    if (e.schema !== ENVELOPE_SCHEMA ||
        e.domainId !== DOMAIN_ID ||
        e.flavor !== FLAVOR ||
        e.operationKind !== OPERATION_KIND ||
        profile.requiresF5 !== true ||
        !isSha256Hex(profile.f5ReviewId)) {
      addCode(blockers, 'library-catalog-f5-closure-envelope-invalid');
      return e;
    }
    if (!isSha256Hex(e.subjectId) || !isSha256Hex(e.lineageId) ||
        !isSha256Hex(e.dedupeKey) || !isSha256Hex(e.eventDigest) ||
        !isSha256Hex(e.receiptDigest)) {
      addCode(blockers, 'library-catalog-f5-closure-envelope-invalid');
    }
    scanPrivacy(e, blockers, warnings);
    return e;
  }

  function expectedTargetForDecision(decisionKind) {
    if (decisionKind === STATE_APPROVED_RESTORE) return STATE_CLOSED_RESTORED;
    if (decisionKind === STATE_APPROVED_SEAL || decisionKind === STATE_AUTO_EXPIRED) {
      return STATE_CLOSED_SEALED;
    }
    return '';
  }

  function closureKindForTarget(targetState) {
    if (targetState === STATE_CLOSED_RESTORED) return STATE_CLOSED_RESTORED;
    if (targetState === STATE_CLOSED_SEALED) return STATE_CLOSED_SEALED;
    return '';
  }

  function normalizeReview(raw, fallbackReviewId) {
    var value = safeObject(raw);
    var row = safeObject(value.row || value.reviewRow || value.f5ReviewRow ||
      asArray(value.rows)[0] || safeObject(value.metadata).reviewRow);
    var reviewId = cleanLower(value.reviewId || value.f5ReviewId || row.reviewId || fallbackReviewId);
    var currentState = cleanString(value.currentState || value.state || value.reviewState ||
      value.status || safeObject(value.metadata).currentState || row.currentState || row.state);
    var reviewStatusVersion = Number(value.reviewStatusVersion ||
      safeObject(value.metadata).reviewStatusVersion || row.reviewStatusVersion) || 0;
    var evidenceDigest = cleanLower(value.closureEvidenceDigest || value.applyEventDigest ||
      value.evidenceDigest || safeObject(value.metadata).closureEvidenceDigest ||
      safeObject(value.metadata).applyEventDigest || row.closureEvidenceDigest ||
      row.applyEventDigest || row.evidenceDigest);
    return {
      reviewId: reviewId,
      currentState: currentState,
      reviewStatusVersion: reviewStatusVersion,
      row: row,
      closureEvidenceDigest: evidenceDigest,
      source: value
    };
  }

  async function resolveReview(input, envelope, blockers, warnings) {
    var args = safeObject(input);
    var profile = safeObject(envelope.dispatchProfile);
    var reviewId = cleanLower(args.f5ReviewId || args.reviewId || profile.f5ReviewId);
    var supplied = args.f5Review || args.review || args.f5ReviewRow || null;
    var normalized = supplied ? normalizeReview(supplied, reviewId) : null;
    if (supplied) scanPrivacy(supplied, blockers, warnings);
    if (normalized && normalized.reviewId && reviewId && normalized.reviewId !== reviewId) {
      addCode(blockers, 'library-catalog-f5-closure-review-id-mismatch');
      return normalized;
    }
    if (normalized && normalized.reviewId) {
      scanPrivacy({
        redactionClass: 'redacted',
        reviewId: normalized.reviewId,
        currentState: normalized.currentState,
        reviewStatusVersion: normalized.reviewStatusVersion,
        row: normalized.row,
        closureEvidenceDigest: normalized.closureEvidenceDigest || null
      }, blockers, warnings);
      return normalized;
    }
    var getFn = args.getF5ReviewById || H2O.Desktop.Sync.getF5ReviewById;
    if (typeof getFn !== 'function') {
      addCode(blockers, 'library-catalog-f5-closure-review-not-found');
      addCode(warnings, 'library-catalog-f5-closure-context-incomplete');
      return null;
    }
    try {
      var found = await getFn(reviewId);
      mergeCodes(warnings, found && found.warnings);
      mergeCodes(blockers, found && found.blockers);
      var getStatus = cleanString(found && found.status);
      if (!found || getStatus === 'not-found' || (Array.isArray(found.rows) && found.rows.length === 0)) {
        addCode(blockers, 'library-catalog-f5-closure-review-not-found');
        return normalizeReview({ reviewId: reviewId }, reviewId);
      }
      normalized = normalizeReview(found, reviewId);
      if (normalized.reviewId && normalized.reviewId !== reviewId) {
        addCode(blockers, 'library-catalog-f5-closure-review-id-mismatch');
      }
      scanPrivacy({
        redactionClass: 'redacted',
        reviewId: normalized.reviewId,
        currentState: normalized.currentState,
        reviewStatusVersion: normalized.reviewStatusVersion,
        row: normalized.row,
        closureEvidenceDigest: normalized.closureEvidenceDigest || null
      }, blockers, warnings);
      return normalized;
    } catch (_) {
      addCode(blockers, 'library-catalog-f5-closure-review-not-found');
      return null;
    }
  }

  function reviewSummary(review, closeResult) {
    var close = safeObject(closeResult);
    return {
      reviewId: cleanLower(review && review.reviewId),
      currentState: cleanString(review && review.currentState),
      reviewStatusVersion: Number(review && review.reviewStatusVersion) || 0,
      row: safeObject(review && review.row),
      closeResult: closeResult ? {
        ok: close.ok === true,
        status: cleanString(close.status),
        currentState: cleanString(close.currentState),
        reviewStatusVersion: Number(close.reviewStatusVersion) || 0,
        metadata: {
          closureKind: cleanString(safeObject(close.metadata).closureKind)
        }
      } : null
    };
  }

  function buildNativeEvidence(envelope, review, targetState, observedAtIso) {
    if (targetState !== STATE_CLOSED_SEALED) return null;
    var settlement = safeObject(envelope.settlementShapes);
    var profile = safeObject(envelope.dispatchProfile);
    return {
      schema: 'h2o.desktop.sync.library-catalog-f5-native-evidence.v1',
      version: VERSION,
      redactionClass: 'redacted',
      requestKind: 'library-catalog-tombstone-apply',
      operation: OPERATION_KIND,
      nativeCommand: cleanString(profile.nativeCommand) || 'h2o_library_catalog_tombstone_apply',
      reviewId: cleanLower(review.reviewId),
      decisionKind: cleanString(review.currentState),
      closureKind: targetState,
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanLower(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      receiptDigest: cleanLower(envelope.receiptDigest),
      settlementDigest: cleanLower(settlement.settlementDigest),
      bookkeepingRowId: cleanLower(envelope.bookkeepingRowId || settlement.bookkeepingRowId),
      expectedTargetState: safeObject(settlement.expectedTargetState),
      observedAtIso: observedAtIso
    };
  }

  async function closureEvidenceDigestFor(envelope, review, targetState, nativeEvidence, observedAtIso) {
    return await sha256Hex(canonicalJSON({
      schema: RESULT_SCHEMA,
      version: VERSION,
      reviewId: cleanLower(review.reviewId),
      currentState: cleanString(review.currentState),
      targetState: targetState,
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanLower(envelope.lineageId),
      eventDigest: cleanLower(envelope.eventDigest),
      receiptDigest: cleanLower(envelope.receiptDigest),
      nativeEvidence: nativeEvidence || null,
      observedAtIso: observedAtIso
    }));
  }

  async function closeLibraryCatalogTombstoneViaF5(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    if (!isObject(input)) {
      addCode(blockers, 'library-catalog-f5-closure-context-incomplete');
      return blockedResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    var envelope = validateEnvelope(args.envelope || args.executeEnvelope, blockers, warnings);
    var profileReviewId = cleanLower(safeObject(envelope.dispatchProfile).f5ReviewId);
    if (blockers.length) {
      return blockedResult({
        envelope: envelope,
        f5ReviewId: profileReviewId,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var review = await resolveReview(args, envelope, blockers, warnings);
    if (!review || !isSha256Hex(review.reviewId)) {
      addCode(blockers, 'library-catalog-f5-closure-review-not-found');
    } else if (profileReviewId && review.reviewId !== profileReviewId) {
      addCode(blockers, 'library-catalog-f5-closure-review-id-mismatch');
    }
    if (blockers.length) {
      return blockedResult({
        envelope: envelope,
        review: review ? reviewSummary(review) : null,
        f5ReviewId: review ? review.reviewId : profileReviewId,
        f5CurrentState: review ? review.currentState : '',
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var currentState = cleanString(review.currentState);
    var targetState = expectedTargetForDecision(currentState);
    if (!targetState && TERMINAL_STATES.indexOf(currentState) === -1) {
      addCode(blockers, 'library-catalog-f5-closure-review-not-post-decision');
      return blockedResult({
        envelope: envelope,
        review: reviewSummary(review),
        f5ReviewId: review.reviewId,
        f5CurrentState: currentState,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var suppliedEvidence = cleanLower(args.closureEvidenceDigest || args.applyEventDigest);
    if (TERMINAL_STATES.indexOf(currentState) !== -1) {
      var expectedTerminal = currentState;
      var evidence = cleanLower(review.closureEvidenceDigest || suppliedEvidence);
      if (isSha256Hex(evidence) && (!suppliedEvidence || suppliedEvidence === evidence)) {
        addCode(warnings, 'library-catalog-f5-closure-idempotent');
        var idempotentResult = buildResult({
          ok: true,
          closed: true,
          idempotent: true,
          decisionKind: currentState,
          f5ReviewId: review.reviewId,
          f5CurrentState: currentState,
          f5TargetState: expectedTerminal,
          nativeApplyRequired: expectedTerminal === STATE_CLOSED_SEALED,
          nativeEvidence: null,
          closureEvidenceDigest: evidence,
          envelope: envelope,
          review: reviewSummary(review),
          blockers: blockers,
          warnings: warnings,
          observedAtIso: observedAtIso
        });
        var idempotentPrivacyBlockers = [];
        var idempotentPrivacyWarnings = idempotentResult.warnings.slice();
        scanPrivacy(idempotentResult, idempotentPrivacyBlockers, idempotentPrivacyWarnings);
        if (idempotentPrivacyBlockers.length) {
          return blockedResult({
            envelope: envelope,
            review: reviewSummary(review),
            f5ReviewId: review.reviewId,
            f5CurrentState: currentState,
            f5TargetState: expectedTerminal,
            blockers: idempotentPrivacyBlockers,
            warnings: idempotentPrivacyWarnings,
            observedAtIso: observedAtIso
          });
        }
        return idempotentResult;
      }
      addCode(blockers, 'library-catalog-f5-closure-state-mismatch');
      return blockedResult({
        envelope: envelope,
        review: reviewSummary(review),
        f5ReviewId: review.reviewId,
        f5CurrentState: currentState,
        f5TargetState: expectedTerminal,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var nativeEvidence = buildNativeEvidence(envelope, review, targetState, observedAtIso);
    if (targetState === STATE_CLOSED_SEALED && !isObject(nativeEvidence)) {
      addCode(blockers, 'library-catalog-f5-closure-native-evidence-missing');
    }
    if (nativeEvidence) scanPrivacy(nativeEvidence, blockers, warnings);

    var closureEvidenceDigest = await closureEvidenceDigestFor(envelope, review,
      targetState, nativeEvidence, observedAtIso);
    if (suppliedEvidence && suppliedEvidence !== closureEvidenceDigest) {
      addCode(blockers, 'library-catalog-f5-closure-state-mismatch');
    }

    if (blockers.length) {
      return blockedResult({
        envelope: envelope,
        review: reviewSummary(review),
        f5ReviewId: review.reviewId,
        f5CurrentState: currentState,
        f5TargetState: targetState,
        nativeEvidence: nativeEvidence,
        closureEvidenceDigest: closureEvidenceDigest,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    if (POST_DECISION_STATES.indexOf(currentState) === -1) {
      addCode(blockers, 'library-catalog-f5-closure-review-not-post-decision');
    }
    var closurePayload = {
      schema: 'h2o.desktop.sync.library-catalog-f5-closure-payload.v1',
      redactionClass: 'redacted',
      reviewId: review.reviewId,
      closureKind: closureKindForTarget(targetState),
      applyEventDigest: closureEvidenceDigest,
      appliedAtIso: observedAtIso,
      actorPeer: validateActorPeer(args.actorPeer || envelope.actorPeer || review.row.actorPeer || {})
    };
    if (!closurePayload.actorPeer) {
      addCode(blockers, 'library-catalog-f5-closure-close-failed');
      addCode(warnings, 'library-catalog-f5-closure-context-incomplete');
    }
    scanPrivacy(closurePayload, blockers, warnings);
    if (blockers.length) {
      return blockedResult({
        envelope: envelope,
        review: reviewSummary(review),
        f5ReviewId: review.reviewId,
        f5CurrentState: currentState,
        f5TargetState: targetState,
        nativeEvidence: nativeEvidence,
        closureEvidenceDigest: closureEvidenceDigest,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var closeFn = args.closeF5Review || H2O.Desktop.Sync.closeF5Review;
    if (typeof closeFn !== 'function') {
      addCode(blockers, 'library-catalog-f5-closure-close-failed');
      return blockedResult({
        envelope: envelope,
        review: reviewSummary(review),
        f5ReviewId: review.reviewId,
        f5CurrentState: currentState,
        f5TargetState: targetState,
        nativeEvidence: nativeEvidence,
        closureEvidenceDigest: closureEvidenceDigest,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var closeResult = null;
    try {
      closeResult = await closeFn(closurePayload);
    } catch (_) {
      closeResult = { ok: false, blockers: ['close-threw'], warnings: [] };
    }
    mergeCodes(warnings, closeResult && closeResult.warnings);
    codeList(closeResult && closeResult.warnings).forEach(function (code) {
      addCode(warnings, 'library-catalog-f5-closure-close-warning:' + code);
    });
    if (!closeResult || closeResult.ok !== true || cleanString(closeResult.currentState) !== targetState) {
      mergeCodes(blockers, closeResult && closeResult.blockers);
      addCode(blockers, 'library-catalog-f5-closure-close-failed');
    }
    if (blockers.length) {
      return blockedResult({
        envelope: envelope,
        review: reviewSummary(review, closeResult),
        f5ReviewId: review.reviewId,
        f5CurrentState: currentState,
        f5TargetState: targetState,
        nativeEvidence: nativeEvidence,
        closureEvidenceDigest: closureEvidenceDigest,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var result = buildResult({
      ok: true,
      closed: true,
      idempotent: false,
      decisionKind: currentState,
      f5ReviewId: review.reviewId,
      f5CurrentState: currentState,
      f5TargetState: targetState,
      nativeApplyRequired: targetState === STATE_CLOSED_SEALED,
      nativeEvidence: nativeEvidence,
      closureEvidenceDigest: closureEvidenceDigest,
      envelope: envelope,
      review: reviewSummary(review, closeResult),
      blockers: [],
      warnings: warnings,
      observedAtIso: observedAtIso
    });
    var finalBlockers = [];
    var finalWarnings = result.warnings.slice();
    scanPrivacy(result, finalBlockers, finalWarnings);
    if (finalBlockers.length) {
      return blockedResult({
        envelope: envelope,
        review: reviewSummary(review, closeResult),
        f5ReviewId: review.reviewId,
        f5CurrentState: currentState,
        f5TargetState: targetState,
        nativeEvidence: nativeEvidence,
        closureEvidenceDigest: closureEvidenceDigest,
        blockers: finalBlockers,
        warnings: finalWarnings,
        observedAtIso: observedAtIso
      });
    }
    return result;
  }

  H2O.Desktop.Sync.closeLibraryCatalogTombstoneViaF5 = closeLibraryCatalogTombstoneViaF5;
  H2O.Desktop.Sync.__libraryCatalogF5ClosureInstalled = true;
  H2O.Desktop.Sync.__libraryCatalogF5ClosureVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
