/* H2O Desktop Sync - F14.5.5.4 snapshot F5 review queue proof harness
 *
 * Persistent runtime proof for the F14.5.5.1 F5 review queue (and the
 * F14.5.5.2 wire-through from the snapshot tombstone receipt). Exercises
 * the ten required cases per the F14.5.5 contract.
 *
 * Storage discipline (mandatory): the queue persists to
 *   chrome.storage.local key `h2o:sync:snapshot-f5-review-queue:v1`
 * which is the SAME key the production queue uses. This harness:
 *   1. snapshots the existing ledger value at proof start;
 *   2. replaces it with a clean empty ledger between cases;
 *   3. restores the original ledger value in a finally block so
 *      repeated proof runs do not pollute real F5 review state.
 *
 * Hard boundaries:
 *   - No Native execution. No F5 work outside the queue ledger.
 *   - No publication, relay/outbox, watermark writes, consumed-op writes.
 *   - No apply. No mutation of the snapshot record. No UI.
 *   - Synthetic, privacy-safe data only: every identifier is sha256 of a
 *     fixed proof-internal salt plus a case index. No raw chatId/title/
 *     accountId/operator-peer fields appear anywhere in the proof input.
 *
 * Public API:
 *   H2O.Desktop.Sync.runSnapshotF5ReviewQueueProof()
 *   H2O.Desktop.Sync.__snapshotF5ReviewQueueProofInstalled
 *   H2O.Desktop.Sync.__snapshotF5ReviewQueueProofVersion
 *
 * Result envelope:
 *   { schema, version, ok, observedAtIso,
 *     caseCount, passCount, failCount,
 *     cases: [{ name, ok, assertions: [...], blockers, warnings }],
 *     warnings, errors }
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
  if (H2O.Desktop.Sync.__snapshotF5ReviewQueueProofInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f14.5.5.4';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-f5-review-queue-proof.v1';
  var LEDGER_KEY = 'h2o:sync:snapshot-f5-review-queue:v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.snapshot-f5-review-queue-ledger.v1';
  var PROOF_SALT = 'h2o.proof.f5-review-queue.v1.salt';
  var PREDICATE_VERSION = 'h2o.snapshot.tombstone.predicate.v1';

  // ── Tiny helpers ────────────────────────────────────────────────────
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
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
        var fromKernel = await kernel.sha256Hex(value);
        if (typeof fromKernel === 'string' && /^[0-9a-f]{64}$/.test(fromKernel)) return cleanLower(fromKernel);
      } catch (_) { /* fall through */ }
    }
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJson(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }
  function isSha256Hex(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(cleanLower(value)); }

  // ── Storage helpers ─────────────────────────────────────────────────
  function storageRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function' && typeof s.set === 'function') return s;
    } catch (_) { /* ignore */ }
    return null;
  }
  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        s.get([key], function (items) {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
  }
  function storageSet(key, value) {
    return new Promise(function (resolve, reject) {
      var s = storageRef();
      if (!s) { reject(new Error('storage-unavailable')); return; }
      try {
        var payload = {};
        payload[key] = value;
        s.set(payload, function () {
          var lastError = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve();
        });
      } catch (e) { reject(e); }
    });
  }
  async function snapshotLedger() {
    try { return await storageGet(LEDGER_KEY); }
    catch (_) { return null; }
  }
  async function clearLedger() {
    return storageSet(LEDGER_KEY, { schema: LEDGER_SCHEMA, createdAtIso: nowIsoSeconds(), events: [] });
  }
  async function restoreLedger(snapshot) {
    if (snapshot === null || snapshot === undefined) {
      // Original state had no ledger key at all; emulate by clearing.
      return storageSet(LEDGER_KEY, { schema: LEDGER_SCHEMA, createdAtIso: nowIsoSeconds(), events: [] });
    }
    return storageSet(LEDGER_KEY, snapshot);
  }

  // ── Fixture builders (deterministic; sha256 of proof salt + tag) ────
  async function makePeer() {
    var sync_ = await sha256Hex(PROOF_SALT + ':peer:syncPeerIdHash');
    var phys_ = await sha256Hex(PROOF_SALT + ':peer:physicalDeviceIdHash');
    var inst_ = await sha256Hex(PROOF_SALT + ':peer:installIdHash');
    return {
      syncPeerIdHash: sync_,
      physicalDeviceIdHash: phys_,
      installIdHash: inst_,
      surfaceKind: 'desktop-tauri-proof'
    };
  }
  async function makeAccountHash() {
    return await sha256Hex(PROOF_SALT + ':account:originAccountIdHash');
  }
  async function makeCaseFixture(caseTag, overrides) {
    var subjectId = await sha256Hex(PROOF_SALT + ':case:' + caseTag + ':subjectId');
    var lineageId = await sha256Hex(PROOF_SALT + ':case:' + caseTag + ':lineageId');
    var candidateId = 'cand-' + (await sha256Hex(PROOF_SALT + ':case:' + caseTag + ':candidateId')).slice(0, 32);
    var proposalEnvelopeId = 'env-' + (await sha256Hex(PROOF_SALT + ':case:' + caseTag + ':proposalEnvelopeId')).slice(0, 32);
    var baseHash = await sha256Hex(PROOF_SALT + ':case:' + caseTag + ':baseHash');
    var evidenceDigest = await sha256Hex(PROOF_SALT + ':case:' + caseTag + ':evidence');
    var bookkeepingPointer = await sha256Hex(PROOF_SALT + ':case:' + caseTag + ':snapshotBookkeepingPointer');
    var handoff = {
      candidateId: candidateId,
      proposalEnvelopeId: proposalEnvelopeId,
      subjectId: subjectId,
      lineageId: lineageId,
      baseHash: baseHash,
      predicateVersion: PREDICATE_VERSION,
      justifyingEvidenceDigests: [evidenceDigest],
      expectedF5ReviewKind: 'snapshot-tombstone',
      membershipCount: 0,
      childFolderCount: 0,
      reviewStatus: 'pending-review',
      createdAtIso: '2026-01-01T00:00:00Z'
    };
    if (isObject(overrides) && isObject(overrides.handoff)) {
      Object.keys(overrides.handoff).forEach(function (k) { handoff[k] = overrides.handoff[k]; });
    }
    return {
      handoff: handoff,
      subjectId: subjectId,
      lineageId: lineageId,
      candidateId: candidateId,
      proposalEnvelopeId: proposalEnvelopeId,
      baseHash: baseHash,
      bookkeepingPointer: bookkeepingPointer
    };
  }
  async function ingestRow(fixture, peer, accountHash, opts) {
    opts = opts || {};
    return H2O.Desktop.Sync.ingestF5Review({
      f5Handoff: fixture.handoff,
      originAccountIdHash: accountHash,
      actorPeer: peer,
      snapshotBookkeepingPointer: fixture.bookkeepingPointer,
      observedAtIso: opts.observedAtIso || '2026-01-15T00:00:00Z',
      retentionStartedAtIso: opts.retentionStartedAtIso || '2026-01-15T00:00:00Z',
      retentionWindowMs: opts.retentionWindowMs
    });
  }

  // ── Approval-token derivation (must mirror the queue's internal rule) ─
  async function deriveApprovalToken(parts) {
    return await sha256Hex(canonicalJson({
      reviewId: cleanLower(parts.reviewId),
      decisionKind: cleanString(parts.decisionKind),
      reviewStatusVersion: parts.reviewStatusVersion | 0,
      actorPeerSyncHash: cleanLower(parts.actorPeerSyncHash),
      decidedAtIso: cleanString(parts.decidedAtIso)
    }));
  }
  async function recordDecision(reviewId, currentVersion, decisionKind, peer, decidedAtIso) {
    var approvalToken = await deriveApprovalToken({
      reviewId: reviewId,
      decisionKind: decisionKind,
      reviewStatusVersion: currentVersion,
      actorPeerSyncHash: peer.syncPeerIdHash,
      decidedAtIso: decidedAtIso
    });
    return H2O.Desktop.Sync.recordF5ReviewDecision({
      reviewId: reviewId,
      decisionKind: decisionKind,
      actorPeer: peer,
      approvalToken: approvalToken,
      decidedAtIso: decidedAtIso,
      observedAtIso: decidedAtIso
    });
  }

  // ── Assertion helper ────────────────────────────────────────────────
  function pushAssert(list, name, ok, detail) {
    list.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  }
  function caseResult(name, assertions, blockers, warnings) {
    var allOk = assertions.length > 0 && assertions.every(function (a) { return a.ok === true; });
    return {
      name: name,
      ok: allOk,
      assertionCount: assertions.length,
      passCount: assertions.filter(function (a) { return a.ok; }).length,
      failCount: assertions.filter(function (a) { return !a.ok; }).length,
      assertions: assertions,
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
  }
  function hasBlocker(result, code) {
    if (!result) return false;
    return codeList(result.blockers).indexOf(code) !== -1;
  }

  // ── Case 1: ingest → pending row exists ─────────────────────────────
  async function caseIngestPending(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('1-ingest-pending');
    var result = await ingestRow(fixture, peer, accountHash);
    pushAssert(assertions, 'ingest ok=true', result.ok === true, JSON.stringify(codeList(result.blockers)));
    pushAssert(assertions, 'status=ingested', result.status === 'ingested', result.status);
    pushAssert(assertions, 'reviewId is sha256', isSha256Hex(result.reviewId));
    pushAssert(assertions, 'currentState=pending', result.currentState === 'pending');
    pushAssert(assertions, 'reviewStatusVersion=1', result.reviewStatusVersion === 1);
    pushAssert(assertions, 'reviewRow shaped', isObject(result.reviewRow) && !!result.reviewRow.schema);
    pushAssert(assertions, 'lifecycleState present', isObject(result.lifecycleState));
    pushAssert(assertions, 'side-effects all false',
      result.sideEffectSummary && Object.keys(result.sideEffectSummary).every(function (k) {
        return result.sideEffectSummary[k] === false;
      }));
    if (isSha256Hex(result.reviewId)) {
      var fetched = await H2O.Desktop.Sync.getF5ReviewById(result.reviewId);
      pushAssert(assertions, 'getF5ReviewById status=found', fetched.status === 'found');
      pushAssert(assertions, 'getF5ReviewById currentState=pending',
        fetched.currentState === 'pending');
    }
    return caseResult('ingest-pending', assertions, [], []);
  }

  // ── Case 2: duplicate open ingest blocked ───────────────────────────
  async function caseDuplicateOpenBlocked(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('2-duplicate-open');
    var first = await ingestRow(fixture, peer, accountHash);
    pushAssert(assertions, 'first ingest ok', first.ok === true);
    var second = await ingestRow(fixture, peer, accountHash, {
      observedAtIso: '2026-01-15T01:00:00Z',
      retentionStartedAtIso: '2026-01-15T01:00:00Z'
    });
    pushAssert(assertions, 'second ingest blocked', second.ok === false);
    pushAssert(assertions, 'blocker f5-review-open-duplicate',
      hasBlocker(second, 'f5-review-open-duplicate'),
      JSON.stringify(codeList(second.blockers)));
    return caseResult('duplicate-open-blocked', assertions, [], []);
  }

  // ── Case 3: approve-seal decision ───────────────────────────────────
  async function caseApproveSeal(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('3-approve-seal');
    var ingest = await ingestRow(fixture, peer, accountHash);
    pushAssert(assertions, 'setup ingest ok', ingest.ok === true);
    var decidedAtIso = '2026-01-20T12:00:00Z';
    var decision = await recordDecision(ingest.reviewId, ingest.reviewStatusVersion,
      'approve-seal', peer, decidedAtIso);
    pushAssert(assertions, 'decision ok=true', decision.ok === true,
      JSON.stringify(codeList(decision.blockers)));
    pushAssert(assertions, 'status=decision-recorded', decision.status === 'decision-recorded');
    pushAssert(assertions, 'currentState=approved-seal', decision.currentState === 'approved-seal');
    pushAssert(assertions, 'reviewStatusVersion=2', decision.reviewStatusVersion === 2);
    pushAssert(assertions, 'lifecycleTransition present', isObject(decision.lifecycleTransition));
    return caseResult('approve-seal', assertions, [], []);
  }

  // ── Case 4: approve-restore decision ────────────────────────────────
  async function caseApproveRestore(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('4-approve-restore');
    var ingest = await ingestRow(fixture, peer, accountHash);
    pushAssert(assertions, 'setup ingest ok', ingest.ok === true);
    var decidedAtIso = '2026-01-20T12:00:00Z';
    var decision = await recordDecision(ingest.reviewId, ingest.reviewStatusVersion,
      'approve-restore', peer, decidedAtIso);
    pushAssert(assertions, 'decision ok=true', decision.ok === true,
      JSON.stringify(codeList(decision.blockers)));
    pushAssert(assertions, 'currentState=approved-restore', decision.currentState === 'approved-restore');
    pushAssert(assertions, 'reviewStatusVersion=2', decision.reviewStatusVersion === 2);
    return caseResult('approve-restore', assertions, [], []);
  }

  // ── Case 5: auto-expiry path ────────────────────────────────────────
  async function caseAutoExpiry(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('5-auto-expiry');
    // Tight synthetic window: started 2020-01-01, expires 1 second later;
    // observed at 2026 — guaranteed past deadline without wall-clock dependency.
    var ingest = await ingestRow(fixture, peer, accountHash, {
      observedAtIso: '2020-01-01T00:00:00Z',
      retentionStartedAtIso: '2020-01-01T00:00:00Z',
      retentionWindowMs: 1000
    });
    pushAssert(assertions, 'setup ingest ok', ingest.ok === true);
    var expiry = await H2O.Desktop.Sync.evaluateF5ReviewExpiry({
      reviewId: ingest.reviewId,
      observedAtIso: '2026-06-01T12:00:00Z'
    });
    pushAssert(assertions, 'expiry ok=true', expiry.ok === true,
      JSON.stringify(codeList(expiry.blockers)));
    pushAssert(assertions, 'status=auto-expired', expiry.status === 'auto-expired');
    pushAssert(assertions, 'currentState=auto-expired', expiry.currentState === 'auto-expired');
    // Idempotency: a second evaluate should noop, not transition again.
    var reEvaluate = await H2O.Desktop.Sync.evaluateF5ReviewExpiry({
      reviewId: ingest.reviewId,
      observedAtIso: '2026-06-01T13:00:00Z'
    });
    pushAssert(assertions, 're-evaluate noop', reEvaluate.status === 'expiry-noop');
    return caseResult('auto-expiry', assertions, [], []);
  }

  // ── Case 6: close sealed ────────────────────────────────────────────
  async function caseCloseSealed(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('6-close-sealed');
    var ingest = await ingestRow(fixture, peer, accountHash);
    pushAssert(assertions, 'setup ingest ok', ingest.ok === true);
    var decidedAtIso = '2026-01-20T12:00:00Z';
    var decision = await recordDecision(ingest.reviewId, ingest.reviewStatusVersion,
      'approve-seal', peer, decidedAtIso);
    pushAssert(assertions, 'setup decision ok', decision.ok === true);
    var applyEventDigest = await sha256Hex(PROOF_SALT + ':case:6:applyEventDigest');
    var close = await H2O.Desktop.Sync.closeF5Review({
      reviewId: ingest.reviewId,
      closureKind: 'closed-sealed',
      applyEventDigest: applyEventDigest,
      appliedAtIso: '2026-01-21T12:00:00Z',
      actorPeer: peer
    });
    pushAssert(assertions, 'close ok=true', close.ok === true,
      JSON.stringify(codeList(close.blockers)));
    pushAssert(assertions, 'currentState=closed-sealed', close.currentState === 'closed-sealed');
    pushAssert(assertions, 'tombstone present',
      isObject(close.metadata) && isObject(close.metadata.tombstone));
    pushAssert(assertions, 'lifecycleTransition toState=tombstoned',
      isObject(close.lifecycleTransition) && close.lifecycleTransition.toState === 'tombstoned');
    return caseResult('close-sealed', assertions, [], []);
  }

  // ── Case 7: close restored ──────────────────────────────────────────
  async function caseCloseRestored(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('7-close-restored');
    var ingest = await ingestRow(fixture, peer, accountHash);
    pushAssert(assertions, 'setup ingest ok', ingest.ok === true);
    var decidedAtIso = '2026-01-20T12:00:00Z';
    var decision = await recordDecision(ingest.reviewId, ingest.reviewStatusVersion,
      'approve-restore', peer, decidedAtIso);
    pushAssert(assertions, 'setup decision ok', decision.ok === true);
    var applyEventDigest = await sha256Hex(PROOF_SALT + ':case:7:applyEventDigest');
    var close = await H2O.Desktop.Sync.closeF5Review({
      reviewId: ingest.reviewId,
      closureKind: 'closed-restored',
      applyEventDigest: applyEventDigest,
      appliedAtIso: '2026-01-21T12:00:00Z',
      actorPeer: peer
    });
    pushAssert(assertions, 'close ok=true', close.ok === true,
      JSON.stringify(codeList(close.blockers)));
    pushAssert(assertions, 'currentState=closed-restored', close.currentState === 'closed-restored');
    pushAssert(assertions, 'lifecycleTransition toState=active',
      isObject(close.lifecycleTransition) && close.lifecycleTransition.toState === 'active');
    return caseResult('close-restored', assertions, [], []);
  }

  // ── Case 8: terminal-row duplicate/block ────────────────────────────
  async function caseTerminalRowBlocked(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('8-terminal-blocked');
    var ingest = await ingestRow(fixture, peer, accountHash);
    pushAssert(assertions, 'setup ingest ok', ingest.ok === true);
    var decidedAtIso = '2026-01-20T12:00:00Z';
    var decision = await recordDecision(ingest.reviewId, ingest.reviewStatusVersion,
      'approve-restore', peer, decidedAtIso);
    pushAssert(assertions, 'setup decision ok', decision.ok === true);
    var applyEventDigest = await sha256Hex(PROOF_SALT + ':case:8:applyEventDigest');
    var close = await H2O.Desktop.Sync.closeF5Review({
      reviewId: ingest.reviewId,
      closureKind: 'closed-restored',
      applyEventDigest: applyEventDigest,
      appliedAtIso: '2026-01-21T12:00:00Z',
      actorPeer: peer
    });
    pushAssert(assertions, 'setup close ok', close.ok === true);

    // Now attempt new decision on the terminal row.
    var laterDecidedAtIso = '2026-01-25T12:00:00Z';
    var laterToken = await deriveApprovalToken({
      reviewId: ingest.reviewId,
      decisionKind: 'approve-seal',
      reviewStatusVersion: 3,
      actorPeerSyncHash: peer.syncPeerIdHash,
      decidedAtIso: laterDecidedAtIso
    });
    var laterDecision = await H2O.Desktop.Sync.recordF5ReviewDecision({
      reviewId: ingest.reviewId,
      decisionKind: 'approve-seal',
      actorPeer: peer,
      approvalToken: laterToken,
      decidedAtIso: laterDecidedAtIso,
      observedAtIso: laterDecidedAtIso
    });
    pushAssert(assertions, 'terminal decision blocked', laterDecision.ok === false);
    pushAssert(assertions, 'blocker f5-review-not-pending',
      hasBlocker(laterDecision, 'f5-review-not-pending'),
      JSON.stringify(codeList(laterDecision.blockers)));

    // Attempt a second close on the terminal row.
    var secondClose = await H2O.Desktop.Sync.closeF5Review({
      reviewId: ingest.reviewId,
      closureKind: 'closed-sealed',
      applyEventDigest: await sha256Hex(PROOF_SALT + ':case:8:applyEventDigest:second'),
      appliedAtIso: '2026-01-26T12:00:00Z',
      actorPeer: peer
    });
    pushAssert(assertions, 'terminal close blocked', secondClose.ok === false);
    pushAssert(assertions, 'blocker f5-review-not-post-decision',
      hasBlocker(secondClose, 'f5-review-not-post-decision'),
      JSON.stringify(codeList(secondClose.blockers)));
    return caseResult('terminal-row-blocked', assertions, [], []);
  }

  // ── Case 9: privacy violation blocked ───────────────────────────────
  async function casePrivacyViolation(peer, accountHash) {
    var assertions = [];
    var fixture = await makeCaseFixture('9-privacy-violation', {
      // Inject a forever-no field (raw title) into the handoff envelope.
      // The queue's defense-in-depth scan should reject this on ingress.
      handoff: { title: 'synthetic-proof-forbidden-field-marker' }
    });
    var result = await ingestRow(fixture, peer, accountHash);
    pushAssert(assertions, 'ingest ok=false', result.ok === false);
    pushAssert(assertions, 'blocker f5-review-row-contains-forbidden-field',
      hasBlocker(result, 'f5-review-row-contains-forbidden-field'),
      JSON.stringify(codeList(result.blockers)));
    return caseResult('privacy-violation', assertions, [], []);
  }

  // ── Case 10: list APIs return expected state-filtered rows ──────────
  async function caseListApis(peer, accountHash) {
    var assertions = [];
    // Three independent rows:
    //   A — pending, in-window (visible to listByState('pending') but
    //         NOT to listPastExpiry).
    //   B — pending, past retention deadline (visible to BOTH listByState
    //         and listPastExpiry).
    //   C — approved-seal, post-decision (visible to listByState('approved-seal')
    //         AND, with a sufficiently old grace period, to listStuckPostDecision).
    var fixA = await makeCaseFixture('10-A-pending-in-window');
    var fixB = await makeCaseFixture('10-B-pending-past-expiry');
    var fixC = await makeCaseFixture('10-C-approved-seal-stuck');

    var ingestA = await ingestRow(fixA, peer, accountHash, {
      observedAtIso: '2026-05-25T00:00:00Z',
      retentionStartedAtIso: '2026-05-25T00:00:00Z'
      // default 14-day window → expires ~2026-06-08; observed='2026-06-01' is still in-window
    });
    pushAssert(assertions, 'setup ingest A ok', ingestA.ok === true);

    var ingestB = await ingestRow(fixB, peer, accountHash, {
      observedAtIso: '2020-01-01T00:00:00Z',
      retentionStartedAtIso: '2020-01-01T00:00:00Z',
      retentionWindowMs: 1000
    });
    pushAssert(assertions, 'setup ingest B ok', ingestB.ok === true);

    var ingestC = await ingestRow(fixC, peer, accountHash);
    pushAssert(assertions, 'setup ingest C ok', ingestC.ok === true);
    var decisionC = await recordDecision(ingestC.reviewId, ingestC.reviewStatusVersion,
      'approve-seal', peer, '2026-01-20T12:00:00Z');
    pushAssert(assertions, 'setup decision C ok', decisionC.ok === true);

    var observedAtIso = '2026-06-01T12:00:00Z';

    var listPending = await H2O.Desktop.Sync.listF5ReviewsByState('pending', observedAtIso);
    var pendingIds = asArray(listPending.rows).map(function (r) { return r.reviewId; });
    pushAssert(assertions, 'listByState(pending) ok', listPending.ok === true);
    pushAssert(assertions, 'listByState(pending) includes A',
      pendingIds.indexOf(ingestA.reviewId) !== -1);
    pushAssert(assertions, 'listByState(pending) includes B',
      pendingIds.indexOf(ingestB.reviewId) !== -1);
    pushAssert(assertions, 'listByState(pending) excludes C',
      pendingIds.indexOf(ingestC.reviewId) === -1);

    var listSeal = await H2O.Desktop.Sync.listF5ReviewsByState('approved-seal', observedAtIso);
    var sealIds = asArray(listSeal.rows).map(function (r) { return r.reviewId; });
    pushAssert(assertions, 'listByState(approved-seal) includes C',
      sealIds.indexOf(ingestC.reviewId) !== -1);

    var listExpired = await H2O.Desktop.Sync.listF5ReviewsPastExpiry(observedAtIso);
    var expiredIds = asArray(listExpired.rows).map(function (r) { return r.reviewId; });
    pushAssert(assertions, 'listPastExpiry ok', listExpired.ok === true);
    pushAssert(assertions, 'listPastExpiry includes B',
      expiredIds.indexOf(ingestB.reviewId) !== -1);
    pushAssert(assertions, 'listPastExpiry excludes A (in-window)',
      expiredIds.indexOf(ingestA.reviewId) === -1);
    pushAssert(assertions, 'listPastExpiry excludes C (not pending)',
      expiredIds.indexOf(ingestC.reviewId) === -1);

    var getA = await H2O.Desktop.Sync.getF5ReviewById(ingestA.reviewId);
    pushAssert(assertions, 'getF5ReviewById(A) status=found',
      getA.status === 'found' && getA.currentState === 'pending');

    var stuck = await H2O.Desktop.Sync.listF5ReviewsStuckPostDecision(observedAtIso, 1000);
    var stuckIds = asArray(stuck.rows).map(function (r) { return r.reviewId; });
    pushAssert(assertions, 'listStuckPostDecision includes C',
      stuckIds.indexOf(ingestC.reviewId) !== -1);
    pushAssert(assertions, 'listStuckPostDecision excludes A',
      stuckIds.indexOf(ingestA.reviewId) === -1);

    // Privacy: all listed rows must be redacted (no raw chatId / title / accountId).
    var allRowsBlob = JSON.stringify({
      pending: listPending.rows, seal: listSeal.rows,
      expired: listExpired.rows, stuck: stuck.rows, get: getA.rows
    });
    pushAssert(assertions, 'list rows have no raw chatId field',
      allRowsBlob.indexOf('"chatId"') === -1);
    pushAssert(assertions, 'list rows have no raw title field',
      allRowsBlob.indexOf('"title"') === -1);
    pushAssert(assertions, 'list rows have no raw accountId field',
      allRowsBlob.indexOf('"accountId"') === -1);

    return caseResult('list-apis', assertions, [], []);
  }

  // ── Orchestrator ────────────────────────────────────────────────────
  async function runSnapshotF5ReviewQueueProof() {
    var observedAtIso = nowIsoSeconds();
    var warnings = [];
    var errors = [];
    var cases = [];
    var version = VERSION;

    var sync = H2O.Desktop.Sync;
    if (!sync.__snapshotF5ReviewQueueInstalled
        || typeof sync.ingestF5Review !== 'function'
        || typeof sync.recordF5ReviewDecision !== 'function'
        || typeof sync.evaluateF5ReviewExpiry !== 'function'
        || typeof sync.closeF5Review !== 'function'
        || typeof sync.getF5ReviewById !== 'function'
        || typeof sync.listF5ReviewsByState !== 'function'
        || typeof sync.listF5ReviewsPastExpiry !== 'function'
        || typeof sync.listF5ReviewsStuckPostDecision !== 'function') {
      errors.push('snapshot-f5-review-queue-not-installed');
      return assembleResult(cases, warnings, errors, observedAtIso);
    }
    if (!isObject(sync.kernel) || typeof sync.kernel.sha256Hex !== 'function'
        || typeof sync.kernel.canonicalJSON !== 'function') {
      errors.push('kernel-identity-kit-unavailable');
      return assembleResult(cases, warnings, errors, observedAtIso);
    }

    var ledgerSnapshot;
    try {
      ledgerSnapshot = await snapshotLedger();
    } catch (_) {
      errors.push('storage-snapshot-failed');
      return assembleResult(cases, warnings, errors, observedAtIso);
    }

    try {
      var peer = await makePeer();
      var accountHash = await makeAccountHash();

      // Each case starts from a clean empty ledger to keep cases independent
      // and the assertions readable. The original ledger is restored once
      // all cases finish (or throw).
      var runners = [
        ['ingest-pending',          caseIngestPending],
        ['duplicate-open-blocked',  caseDuplicateOpenBlocked],
        ['approve-seal',            caseApproveSeal],
        ['approve-restore',         caseApproveRestore],
        ['auto-expiry',             caseAutoExpiry],
        ['close-sealed',            caseCloseSealed],
        ['close-restored',          caseCloseRestored],
        ['terminal-row-blocked',    caseTerminalRowBlocked],
        ['privacy-violation',       casePrivacyViolation],
        ['list-apis',               caseListApis]
      ];

      for (var i = 0; i < runners.length; i++) {
        var name = runners[i][0];
        var runner = runners[i][1];
        try {
          await clearLedger();
        } catch (_) {
          errors.push('case-' + name + '-pre-clear-failed');
          cases.push(caseResult(name, [{ name: 'pre-clear', ok: false, detail: 'storage clear failed' }], [], []));
          continue;
        }
        try {
          var r = await runner(peer, accountHash);
          cases.push(r);
        } catch (e) {
          errors.push('case-' + name + '-threw:' + cleanString(e && e.message));
          cases.push(caseResult(name, [{ name: 'runner', ok: false, detail: cleanString(e && e.message) }], [], []));
        }
      }
    } finally {
      try { await restoreLedger(ledgerSnapshot); }
      catch (_) { errors.push('storage-restore-failed'); }
    }

    return assembleResult(cases, warnings, errors, observedAtIso, version);
  }

  function assembleResult(cases, warnings, errors, observedAtIso, version) {
    var caseCount = cases.length;
    var passCount = cases.filter(function (c) { return c.ok === true; }).length;
    var failCount = caseCount - passCount;
    var ok = errors.length === 0 && failCount === 0 && caseCount === 10;
    return {
      schema: RESULT_SCHEMA,
      version: version || VERSION,
      ok: ok,
      observedAtIso: observedAtIso || nowIsoSeconds(),
      caseCount: caseCount,
      passCount: passCount,
      failCount: failCount,
      cases: cases,
      warnings: codeList(warnings),
      errors: codeList(errors)
    };
  }

  // ── Registration ────────────────────────────────────────────────────
  H2O.Desktop.Sync.runSnapshotF5ReviewQueueProof = runSnapshotF5ReviewQueueProof;
  H2O.Desktop.Sync.__snapshotF5ReviewQueueProofInstalled = true;
  H2O.Desktop.Sync.__snapshotF5ReviewQueueProofVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
