/* H2O Desktop Sync - F14.5.5.1 snapshot F5 review queue
 *
 * Append-only event-sourced ledger implementing the F14.5.5 F5 Review Queue
 * Contract for snapshot tombstone lifecycle. Ingests kernel.shapeF5Handoff
 * envelopes emitted by snapshot-tombstone-apply-event-receipt, persists
 * kernel.shapeF5Review rows in pending state, captures operator decisions
 * (approve-seal / approve-restore) under approval-token guard, observes
 * automatic expiry transitions when retention windows elapse, and surfaces
 * actionable rows for the future F14.6 execute lane to consume.
 *
 * Hard boundaries (per F14.5.5 §1):
 *   - No Native execution. No F5 work outside the queue ledger.
 *   - No apply, no publication, no relay/outbox, no watermark writes,
 *     no consumed-op writes, no snapshot mutation.
 *   - No own timer. Caller (F14.6 timer or UI panel-open fallback) drives
 *     expiry evaluation via evaluateF5ReviewExpiry.
 *   - Reviews referenced by reviewId only. Snapshot identity is opaque
 *     hashes flowed from the receipt envelope.
 *
 * Public API:
 *   H2O.Desktop.Sync.ingestF5Review(input)
 *   H2O.Desktop.Sync.recordF5ReviewDecision(input)
 *   H2O.Desktop.Sync.evaluateF5ReviewExpiry(input)
 *   H2O.Desktop.Sync.closeF5Review(input)
 *   H2O.Desktop.Sync.listF5ReviewsByState(state, observedAtIso)
 *   H2O.Desktop.Sync.listF5ReviewsPastExpiry(observedAtIso)
 *   H2O.Desktop.Sync.getF5ReviewById(reviewId)
 *   H2O.Desktop.Sync.listF5ReviewsStuckPostDecision(observedAtIso, gracePeriodMs)
 *   H2O.Desktop.Sync.__snapshotF5ReviewQueueInstalled
 *   H2O.Desktop.Sync.__snapshotF5ReviewQueueVersion
 *
 * Kernel adoption (F14.5.5 §2 — all mandatory):
 *   shapeF5Handoff, shapeF5Review, shapeAuditRecord, shapeAuditMetadata,
 *   shapeLifecycleState, shapeLifecycleTransition, shapeTombstone,
 *   scanDomainForbiddenFields('snapshot.conversation', ...),
 *   composeReplayDefense, createResult.
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
  if (H2O.Desktop.Sync.__snapshotF5ReviewQueueInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f14.5.5.1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-f5-review-queue.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.snapshot-f5-review-queue-ledger.v1';
  var EVENT_ENVELOPE_SCHEMA = 'h2o.desktop.sync.snapshot-f5-review-queue-event.v1';
  var LEDGER_KEY = 'h2o:sync:snapshot-f5-review-queue:v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var DOMAIN = 'snapshot';
  var OPERATION_INTENT = 'review';
  var PRIVACY_DOMAIN_TAG = 'snapshot.conversation';
  var DEFAULT_RETENTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
  var DEFAULT_STUCK_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours

  // Queue review states (F14.5.5 §4.1)
  var STATE_PENDING = 'pending';
  var STATE_APPROVED_SEAL = 'approved-seal';
  var STATE_APPROVED_RESTORE = 'approved-restore';
  var STATE_AUTO_EXPIRED = 'auto-expired';
  var STATE_CLOSED_SEALED = 'closed-sealed';
  var STATE_CLOSED_RESTORED = 'closed-restored';
  var STATES = [
    STATE_PENDING, STATE_APPROVED_SEAL, STATE_APPROVED_RESTORE,
    STATE_AUTO_EXPIRED, STATE_CLOSED_SEALED, STATE_CLOSED_RESTORED
  ];
  var TERMINAL_STATES = [STATE_CLOSED_SEALED, STATE_CLOSED_RESTORED];
  var POST_DECISION_STATES = [STATE_APPROVED_SEAL, STATE_APPROVED_RESTORE, STATE_AUTO_EXPIRED];
  var OPEN_STATES = [STATE_PENDING, STATE_APPROVED_SEAL, STATE_APPROVED_RESTORE, STATE_AUTO_EXPIRED];

  // Event-type operations (F14.5.5 §14.2)
  var EVENT_INGESTED = 'f5-review-ingested';
  var EVENT_APPROVED_SEAL = 'f5-review-approved-seal';
  var EVENT_APPROVED_RESTORE = 'f5-review-approved-restore';
  var EVENT_AUTO_EXPIRED = 'f5-review-auto-expired';
  var EVENT_CLOSED_SEALED = 'f5-review-closed-sealed';
  var EVENT_CLOSED_RESTORED = 'f5-review-closed-restored';
  var EVENT_OPERATIONS = [
    EVENT_INGESTED, EVENT_APPROVED_SEAL, EVENT_APPROVED_RESTORE,
    EVENT_AUTO_EXPIRED, EVENT_CLOSED_SEALED, EVENT_CLOSED_RESTORED
  ];

  // Decision-kind discriminator passed by operator UI
  var DECISION_APPROVE_SEAL = 'approve-seal';
  var DECISION_APPROVE_RESTORE = 'approve-restore';
  var DECISION_KINDS = [DECISION_APPROVE_SEAL, DECISION_APPROVE_RESTORE];

  // Closure-kind discriminator passed by F14.6
  var CLOSURE_SEALED = 'closed-sealed';
  var CLOSURE_RESTORED = 'closed-restored';
  var CLOSURE_KINDS = [CLOSURE_SEALED, CLOSURE_RESTORED];

  // Mapping queue-state → kernel F5_REVIEW_STATUSES (so shapeF5Review
  // persists with a kernel-recognized status value).
  var KERNEL_STATUS_MAP = {};
  KERNEL_STATUS_MAP[STATE_PENDING] = 'pending-review';
  KERNEL_STATUS_MAP[STATE_APPROVED_SEAL] = 'approved';
  KERNEL_STATUS_MAP[STATE_APPROVED_RESTORE] = 'rejected';
  KERNEL_STATUS_MAP[STATE_AUTO_EXPIRED] = 'expired';
  KERNEL_STATUS_MAP[STATE_CLOSED_SEALED] = 'applied';
  KERNEL_STATUS_MAP[STATE_CLOSED_RESTORED] = 'withdrawn';

  // Snapshot lifecycle state carried as a sub-block on every event.
  // The snapshot's lifecycle never moves out of `retained` while the
  // review is open; F14.6's apply is what transitions it.
  function snapshotLifecycleStateForReviewState(reviewState) {
    if (reviewState === STATE_CLOSED_SEALED) return 'tombstoned';
    if (reviewState === STATE_CLOSED_RESTORED) return 'active';
    return 'retained';
  }

  // System-actor pseudo-peer for auto-expiry events (F14.5.5 §8.1).
  // Deterministic hashes derived from fixed identifying strings; not
  // an operator and not derived from any operator's peer id.
  var SYSTEM_ACTOR_LABEL = 'h2o:sync:system-actor:f5-review-queue-expiry';
  var SYSTEM_ACTOR_CACHE = null;

  // ── Tiny helpers ────────────────────────────────────────────────────
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function nowIsoHourCoarsened() {
    return new Date().toISOString().replace(/T(\d{2}):\d{2}:\d{2}\.\d{3}Z$/, 'T$1:00:00Z');
  }
  function hourCoarsenIso(value) {
    var text = cleanString(value);
    if (!text) return '';
    if (!Number.isFinite(Date.parse(text))) return '';
    return text.replace(/T(\d{2}):\d{2}:\d{2}(\.\d{3})?Z$/, 'T$1:00:00Z');
  }
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }
  function isSha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
  }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
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
  async function systemActorPeer() {
    if (SYSTEM_ACTOR_CACHE) return SYSTEM_ACTOR_CACHE;
    var phys = await sha256Hex(SYSTEM_ACTOR_LABEL + ':physical');
    var inst = await sha256Hex(SYSTEM_ACTOR_LABEL + ':install');
    var sync = await sha256Hex(SYSTEM_ACTOR_LABEL + ':peer');
    SYSTEM_ACTOR_CACHE = {
      physicalDeviceIdHash: phys,
      installIdHash: inst,
      syncPeerIdHash: sync,
      surfaceKind: 'system-actor'
    };
    return SYSTEM_ACTOR_CACHE;
  }
  function generatePerReviewSalt() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) { /* fall through */ }
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    return bytesToHex(bytes);
  }

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

  // ── Ledger helpers ──────────────────────────────────────────────────
  function normalizeLedger(raw) {
    if (!raw) return { schema: LEDGER_SCHEMA, createdAtIso: nowIsoSeconds(), events: [] };
    if (!isObject(raw) || raw.schema !== LEDGER_SCHEMA || !Array.isArray(raw.events)) return null;
    return {
      schema: LEDGER_SCHEMA,
      createdAtIso: cleanString(raw.createdAtIso) || nowIsoSeconds(),
      updatedAtIso: cleanString(raw.updatedAtIso),
      events: raw.events.slice()
    };
  }

  // Reduce the event log into per-review derived state.
  // Returns a Map-like object keyed by reviewId. Each entry:
  //   { reviewId, currentState, reviewStatusVersion, reviewRow,
  //     retentionExpiresAtIso, ingestedAtIso, lastEventAtIso,
  //     postDecisionAtIso, events: [...] }
  function deriveReviewIndex(ledger) {
    var index = {};
    var events = asArray(ledger && ledger.events);
    for (var i = 0; i < events.length; i++) {
      var event = safeObject(events[i]);
      var reviewId = cleanLower(safeObject(event.f5ReviewRef).reviewId || event.reviewId);
      if (!reviewId) continue;
      var entry = index[reviewId];
      if (!entry) {
        entry = {
          reviewId: reviewId,
          currentState: null,
          reviewStatusVersion: 0,
          reviewRow: null,
          retentionExpiresAtIso: '',
          retentionStartedAtIso: '',
          ingestedAtIso: '',
          lastEventAtIso: '',
          postDecisionAtIso: '',
          events: []
        };
        index[reviewId] = entry;
      }
      entry.events.push(event);
      entry.reviewStatusVersion = (entry.reviewStatusVersion | 0) + 1;
      var operation = cleanString(event.operation);
      var occurredAtIso = cleanString(event.auditAtIso || event.occurredAtIso);
      entry.lastEventAtIso = occurredAtIso || entry.lastEventAtIso;
      if (operation === EVENT_INGESTED) {
        entry.currentState = STATE_PENDING;
        entry.reviewRow = safeObject(event.reviewRow);
        entry.retentionExpiresAtIso = cleanString(event.retentionExpiresAtIso);
        entry.retentionStartedAtIso = cleanString(event.retentionStartedAtIso);
        entry.ingestedAtIso = occurredAtIso || entry.ingestedAtIso;
      } else if (operation === EVENT_APPROVED_SEAL) {
        entry.currentState = STATE_APPROVED_SEAL;
        entry.postDecisionAtIso = occurredAtIso || entry.postDecisionAtIso;
      } else if (operation === EVENT_APPROVED_RESTORE) {
        entry.currentState = STATE_APPROVED_RESTORE;
        entry.postDecisionAtIso = occurredAtIso || entry.postDecisionAtIso;
      } else if (operation === EVENT_AUTO_EXPIRED) {
        entry.currentState = STATE_AUTO_EXPIRED;
        entry.postDecisionAtIso = occurredAtIso || entry.postDecisionAtIso;
      } else if (operation === EVENT_CLOSED_SEALED) {
        entry.currentState = STATE_CLOSED_SEALED;
      } else if (operation === EVENT_CLOSED_RESTORED) {
        entry.currentState = STATE_CLOSED_RESTORED;
      }
    }
    return index;
  }

  function findEntryBySubjectIdIfOpen(index, subjectId) {
    var subjectIdLower = cleanLower(subjectId);
    var keys = Object.keys(index);
    for (var i = 0; i < keys.length; i++) {
      var entry = index[keys[i]];
      if (!entry || !entry.reviewRow) continue;
      if (cleanLower(entry.reviewRow.subjectId) !== subjectIdLower) continue;
      if (OPEN_STATES.indexOf(entry.currentState) === -1) continue;
      return entry;
    }
    return null;
  }

  // ── Privacy scan ────────────────────────────────────────────────────
  function privacyScan(target, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scan = kernel.scanDomainForbiddenFields(PRIVACY_DOMAIN_TAG, target);
        if (scan && scan.ok === false) {
          addCode(blockers, 'f5-review-row-contains-forbidden-field');
          mergeCodes(blockers, scan.blockers);
          mergeCodes(warnings, scan.warnings);
        }
      } catch (_) {
        addCode(warnings, 'f5-review-privacy-scan-threw');
      }
    } else {
      addCode(warnings, 'f5-review-privacy-scan-unavailable');
    }
  }

  // ── Kernel-shape helpers (kernel-first; deterministic fallback) ─────
  function shapeWithKernel(name, input, warnings, warningCode) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel[name] === 'function') {
      try { return kernel[name](input); }
      catch (_) {
        if (warnings && warningCode) addCode(warnings, warningCode);
      }
    }
    return safeObject(input);
  }
  function shapeF5HandoffSafe(input, warnings) {
    return shapeWithKernel('shapeF5Handoff', input, warnings, 'f5-handoff-shape-threw');
  }
  function shapeF5ReviewSafe(input, warnings) {
    return shapeWithKernel('shapeF5Review', input, warnings, 'f5-review-shape-threw');
  }
  function shapeAuditRecordSafe(input, warnings) {
    return shapeWithKernel('shapeAuditRecord', input, warnings, 'audit-record-shape-threw');
  }
  function shapeAuditMetadataSafe(input, warnings) {
    return shapeWithKernel('shapeAuditMetadata', input, warnings, 'audit-metadata-shape-threw');
  }
  function shapeLifecycleStateSafe(input, warnings) {
    return shapeWithKernel('shapeLifecycleState', input, warnings, 'lifecycle-state-shape-threw');
  }
  function shapeLifecycleTransitionSafe(input, warnings) {
    return shapeWithKernel('shapeLifecycleTransition', input, warnings, 'lifecycle-transition-shape-threw');
  }
  function shapeTombstoneSafe(input, warnings) {
    return shapeWithKernel('shapeTombstone', input, warnings, 'tombstone-shape-threw');
  }

  // ── Replay defense ──────────────────────────────────────────────────
  function replayDefense(subjectId, operation, revisionHash, prevEvents, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.composeReplayDefense !== 'function') {
      addCode(warnings, 'replay-defense-unavailable');
      return;
    }
    try {
      var rd = kernel.composeReplayDefense({
        candidate: {
          subjectType: SUBJECT_TYPE,
          subjectId: subjectId,
          operation: operation,
          operationKind: operation,
          operationIntent: OPERATION_INTENT,
          revisionHash: revisionHash || ''
        },
        consumedOperations: prevEvents
      });
      if (rd && rd.ok === false) {
        addCode(blockers, 'f5-review-replay-detected');
        mergeCodes(blockers, rd.blockers);
        mergeCodes(warnings, rd.warnings);
      }
    } catch (_) {
      addCode(warnings, 'replay-defense-threw');
    }
  }

  // ── Result envelope ─────────────────────────────────────────────────
  function sideEffectSummary() {
    return {
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Executed: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      snapshotMutated: false
    };
  }
  function buildResult(opts) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      status: opts.status || 'blocked',
      reviewId: opts.reviewId || null,
      currentState: opts.currentState || null,
      reviewStatusVersion: opts.reviewStatusVersion || 0,
      event: opts.event || null,
      reviewRow: opts.reviewRow || null,
      lifecycleState: opts.lifecycleState || null,
      lifecycleTransition: opts.lifecycleTransition || null,
      rows: opts.rows || null,
      observedAtIso: opts.observedAtIso || nowIsoSeconds(),
      sideEffectSummary: sideEffectSummary(),
      blockers: codeList(opts.blockers),
      warnings: codeList(opts.warnings),
      metadata: opts.metadata || {}
    };
    if (kernel && typeof kernel.createResult === 'function') {
      try {
        var generic = kernel.createResult({
          schema: RESULT_SCHEMA,
          ok: payload.ok,
          actionable: payload.ok,
          blockers: payload.blockers,
          warnings: payload.warnings,
          metadata: { domain: DOMAIN, subjectType: SUBJECT_TYPE, version: VERSION }
        });
        if (generic && typeof generic === 'object') {
          payload.ok = generic.ok === true;
          payload.blockers = codeList(generic.blockers).concat(payload.blockers.filter(function (c) {
            return codeList(generic.blockers).indexOf(c) === -1;
          }));
          payload.warnings = codeList(generic.warnings).concat(payload.warnings.filter(function (c) {
            return codeList(generic.warnings).indexOf(c) === -1;
          }));
        }
      } catch (_) { /* swallow */ }
    }
    return payload;
  }
  function failureResult(opts) {
    opts = opts || {};
    opts.ok = false;
    opts.status = opts.status || 'blocked';
    return buildResult(opts);
  }

  // ── Identity helpers ────────────────────────────────────────────────
  async function deriveReviewId(parts) {
    return await sha256Hex(canonicalJson({
      subjectId: cleanLower(parts.subjectId),
      candidateId: cleanString(parts.candidateId),
      originAccountIdHash: cleanLower(parts.originAccountIdHash),
      perReviewSalt: cleanString(parts.perReviewSalt)
    }));
  }
  async function deriveApprovalToken(parts) {
    return await sha256Hex(canonicalJson({
      reviewId: cleanLower(parts.reviewId),
      decisionKind: cleanString(parts.decisionKind),
      reviewStatusVersion: parts.reviewStatusVersion | 0,
      actorPeerSyncHash: cleanLower(parts.actorPeerSyncHash),
      decidedAtIso: cleanString(parts.decidedAtIso)
    }));
  }
  async function deriveEventDigest(eventBody) {
    return await sha256Hex(canonicalJson(eventBody));
  }
  async function deriveDedupeKey(parts) {
    return await sha256Hex(canonicalJson(parts));
  }

  // ── Append-time orchestration (shared by all writers) ───────────────
  async function readAndIndex() {
    var raw = await storageGet(LEDGER_KEY);
    var ledger = normalizeLedger(raw);
    if (!ledger) {
      return { error: 'f5-review-ledger-malformed' };
    }
    return { ledger: ledger, index: deriveReviewIndex(ledger) };
  }
  function checkEventDuplicate(ledger, eventDigest, dedupeKey, blockers) {
    var events = asArray(ledger && ledger.events);
    for (var i = 0; i < events.length; i++) {
      var e = safeObject(events[i]);
      if (eventDigest && cleanLower(e.eventDigest) === eventDigest) {
        addCode(blockers, 'f5-review-event-duplicate-eventDigest');
        return true;
      }
      if (dedupeKey && cleanLower(e.dedupeKey) === dedupeKey) {
        addCode(blockers, 'f5-review-event-duplicate-dedupeKey');
        return true;
      }
    }
    return false;
  }
  async function appendEvent(ledger, event) {
    var nextLedger = {
      schema: LEDGER_SCHEMA,
      createdAtIso: ledger.createdAtIso,
      updatedAtIso: nowIsoSeconds(),
      events: ledger.events.concat([event])
    };
    await storageSet(LEDGER_KEY, nextLedger);
    return nextLedger;
  }

  // ── Event-envelope assembly ─────────────────────────────────────────
  function assembleAuditMetadata(parts, warnings) {
    return shapeAuditMetadataSafe({
      auditId: parts.auditId,
      domain: DOMAIN,
      subjectType: SUBJECT_TYPE,
      subjectId: parts.subjectId,
      operation: parts.operation,
      operationIntent: OPERATION_INTENT,
      lineageId: parts.lineageId,
      eventDigest: parts.eventDigest,
      dedupeKey: parts.dedupeKey,
      transactionId: parts.reviewId,
      actorPeer: parts.actorPeer,
      policyVersion: 'h2o.snapshot.f5-review-queue.v1',
      predicateVersion: parts.predicateVersion || 'h2o.snapshot.f5-review.predicate.v1',
      createdAtIso: parts.occurredAtIso,
      metadata: { reviewId: parts.reviewId, reviewStatusVersion: parts.reviewStatusVersion }
    }, warnings);
  }
  function assembleLifecycleState(parts, warnings) {
    return shapeLifecycleStateSafe({
      domain: DOMAIN,
      subjectType: SUBJECT_TYPE,
      subjectId: parts.subjectId,
      state: snapshotLifecycleStateForReviewState(parts.reviewState),
      lineageId: parts.lineageId,
      eventDigest: parts.eventDigest,
      dedupeKey: parts.dedupeKey,
      ownerKind: 'f5',
      enteredAtIso: parts.occurredAtIso,
      metadata: { reviewId: parts.reviewId, reviewState: parts.reviewState }
    }, warnings);
  }
  function assembleLifecycleTransition(parts, warnings) {
    if (!parts.fromState || !parts.toState) return null;
    return shapeLifecycleTransitionSafe({
      domain: DOMAIN,
      subjectType: SUBJECT_TYPE,
      subjectId: parts.subjectId,
      transitionName: parts.transitionName,
      fromState: parts.fromState,
      toState: parts.toState,
      lineageId: parts.lineageId,
      eventDigest: parts.eventDigest,
      dedupeKey: parts.dedupeKey,
      actorPeer: parts.actorPeer,
      reasonCode: parts.reasonCode || 'f5-review-queue',
      transitionedAtIso: parts.occurredAtIso,
      metadata: { reviewId: parts.reviewId, reviewState: parts.reviewState }
    }, warnings);
  }
  function assembleEventEnvelope(parts, audit, lifecycleState, lifecycleTransition) {
    var envelope = {
      schema: EVENT_ENVELOPE_SCHEMA,
      operation: parts.operation,
      operationIntent: OPERATION_INTENT,
      reviewId: parts.reviewId,
      subjectId: parts.subjectId,
      lineageId: parts.lineageId,
      eventDigest: parts.eventDigest,
      dedupeKey: parts.dedupeKey,
      auditAtIso: parts.occurredAtIso,
      occurredAtIso: parts.occurredAtIso,
      reviewStatusVersion: parts.reviewStatusVersion,
      reviewState: parts.reviewState,
      kernelReviewStatus: KERNEL_STATUS_MAP[parts.reviewState] || 'pending-review',
      auditRecord: audit,
      lifecycleState: lifecycleState,
      lifecycleTransition: lifecycleTransition,
      f5ReviewRef: {
        reviewId: parts.reviewId,
        subjectId: parts.subjectId,
        lineageId: parts.lineageId
      },
      snapshotBookkeepingPointer: parts.snapshotBookkeepingPointer || null,
      retentionExpiresAtIso: parts.retentionExpiresAtIso || '',
      retentionStartedAtIso: parts.retentionStartedAtIso || '',
      reviewRow: parts.reviewRow || null,
      tombstone: parts.tombstone || null,
      decisionKind: parts.decisionKind || null,
      closureKind: parts.closureKind || null,
      approvalTokenHash: parts.approvalTokenHash || null,
      applyEventDigest: parts.applyEventDigest || null,
      reasonCode: parts.reasonCode || null,
      actorPeer: parts.actorPeer
    };
    return envelope;
  }

  // ── Egress redaction helper ─────────────────────────────────────────
  function redactedRow(entry, observedAtIso) {
    if (!entry) return null;
    var row = safeObject(entry.reviewRow);
    var observedMs = Date.parse(observedAtIso || nowIsoSeconds());
    var expiresMs = entry.retentionExpiresAtIso ? Date.parse(entry.retentionExpiresAtIso) : NaN;
    var daysRemaining = null;
    var pastExpiry = false;
    if (Number.isFinite(observedMs) && Number.isFinite(expiresMs)) {
      var diffMs = expiresMs - observedMs;
      daysRemaining = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
      pastExpiry = diffMs <= 0;
    }
    return {
      reviewId: entry.reviewId,
      currentState: entry.currentState,
      kernelReviewStatus: KERNEL_STATUS_MAP[entry.currentState] || 'pending-review',
      reviewStatusVersion: entry.reviewStatusVersion,
      subjectId: row.subjectId || '',
      lineageId: row.lineageId || '',
      candidateId: row.candidateId || '',
      proposalEnvelopeId: row.proposalEnvelopeId || '',
      predicateVersion: row.predicateVersion || '',
      evidenceDigestCount: asArray(row.justifyingEvidenceDigests).length,
      retentionStartedAtIso: entry.retentionStartedAtIso || '',
      retentionExpiresAtIso: entry.retentionExpiresAtIso || '',
      daysRemaining: daysRemaining,
      pastExpiry: pastExpiry,
      ingestedAtIso: entry.ingestedAtIso || '',
      lastEventAtIso: entry.lastEventAtIso || '',
      postDecisionAtIso: entry.postDecisionAtIso || ''
    };
  }
  function redactedRowsList(entries, observedAtIso, blockers, warnings) {
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var r = redactedRow(entries[i], observedAtIso);
      if (r) out.push(r);
    }
    privacyScan(out, blockers, warnings);
    if (blockers.length) return [];
    return out;
  }

  // ── Public API: ingestF5Review ──────────────────────────────────────
  async function ingestF5Review(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();

    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }
    var handoffSource = isObject(args.f5Handoff) ? args.f5Handoff
      : isObject(args.handoff) ? args.handoff : null;
    if (!handoffSource) {
      addCode(blockers, 'f5-handoff-required');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }
    // Defense-in-depth: privacy scan on the RAW input before shape
    // filtering can silently drop forbidden fields. The kernel shape
    // function normalizes; it does not redact maliciously-passed
    // forbidden fields. Operator-passed forbidden fields are a hard
    // blocker, surfaced here.
    privacyScan({ rawInput: input, rawHandoff: handoffSource }, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });

    var handoff = shapeF5HandoffSafe(handoffSource, warnings);
    if (!isSha256Hex(handoff.subjectId)) addCode(blockers, 'f5-handoff-subjectId-invalid');
    if (!cleanString(handoff.candidateId)) addCode(blockers, 'f5-handoff-candidateId-required');
    if (!cleanString(handoff.lineageId)) addCode(blockers, 'f5-handoff-lineageId-required');
    if (!cleanString(handoff.proposalEnvelopeId)) addCode(blockers, 'f5-handoff-proposalEnvelopeId-required');
    if (!asArray(handoff.justifyingEvidenceDigests).length) addCode(blockers, 'f5-handoff-evidence-digests-required');

    var originAccountIdHash = cleanLower(args.originAccountIdHash);
    if (!isSha256Hex(originAccountIdHash)) addCode(blockers, 'origin-account-id-hash-required');

    var actorPeer = safeObject(args.actorPeer);
    if (!isSha256Hex(actorPeer.syncPeerIdHash)) addCode(blockers, 'actor-peer-syncPeerIdHash-required');
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)) addCode(blockers, 'actor-peer-physicalDeviceIdHash-required');
    if (!isSha256Hex(actorPeer.installIdHash)) addCode(blockers, 'actor-peer-installIdHash-required');

    var retentionWindowMs = (typeof args.retentionWindowMs === 'number' && args.retentionWindowMs > 0)
      ? Math.floor(args.retentionWindowMs)
      : DEFAULT_RETENTION_WINDOW_MS;
    var retentionStartedAtIso = hourCoarsenIso(args.retentionStartedAtIso)
      || hourCoarsenIso(observedAtIso) || nowIsoHourCoarsened();
    var retentionStartedMs = Date.parse(retentionStartedAtIso);
    if (!Number.isFinite(retentionStartedMs)) addCode(blockers, 'retention-started-iso-invalid');
    var snapshotBookkeepingPointer = cleanString(args.snapshotBookkeepingPointer
      || args.applyEventDigest || handoff.proposalEnvelopeId);

    // Privacy scan on input handoff + supplied context
    privacyScan({ handoff: handoff, args: { actorPeer: actorPeer, originAccountIdHash: originAccountIdHash } },
      blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });

    var indexResult = await readAndIndex().catch(function () { return { error: 'f5-review-ledger-read-failed' }; });
    if (indexResult.error) {
      addCode(blockers, indexResult.error);
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }
    var ledger = indexResult.ledger;
    var index = indexResult.index;

    // Open-review duplicate block
    var openEntry = findEntryBySubjectIdIfOpen(index, handoff.subjectId);
    if (openEntry) {
      addCode(blockers, 'f5-review-open-duplicate');
      return failureResult({
        blockers: blockers, warnings: warnings, observedAtIso: observedAtIso,
        reviewId: openEntry.reviewId, currentState: openEntry.currentState,
        reviewStatusVersion: openEntry.reviewStatusVersion
      });
    }

    var perReviewSalt = cleanString(args.perReviewSalt) || generatePerReviewSalt();
    var reviewId = await deriveReviewId({
      subjectId: handoff.subjectId,
      candidateId: handoff.candidateId,
      originAccountIdHash: originAccountIdHash,
      perReviewSalt: perReviewSalt
    });
    if (!isSha256Hex(reviewId)) {
      addCode(blockers, 'review-id-generation-failed');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    // Replay defense before any side effect
    replayDefense(handoff.subjectId, EVENT_INGESTED, handoff.baseHash || '',
      asArray(ledger.events), blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });

    var retentionExpiresAtIso = new Date(retentionStartedMs + retentionWindowMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    retentionExpiresAtIso = hourCoarsenIso(retentionExpiresAtIso) || retentionExpiresAtIso;

    var reviewRow = shapeF5ReviewSafe({
      reviewId: reviewId,
      candidateId: handoff.candidateId,
      proposalEnvelopeId: handoff.proposalEnvelopeId,
      subjectId: handoff.subjectId,
      lineageId: handoff.lineageId,
      predicateVersion: handoff.predicateVersion,
      justifyingEvidenceDigests: handoff.justifyingEvidenceDigests,
      reviewStatus: KERNEL_STATUS_MAP[STATE_PENDING],
      createdAtIso: observedAtIso
    }, warnings);

    var occurredAtIso = observedAtIso;
    var reviewStatusVersion = 1;

    var eventDigest = await deriveEventDigest({
      operation: EVENT_INGESTED,
      reviewId: reviewId,
      subjectId: handoff.subjectId,
      lineageId: handoff.lineageId,
      reviewStatusVersion: reviewStatusVersion,
      occurredAtIso: occurredAtIso,
      reviewRow: reviewRow
    });
    var dedupeKey = await deriveDedupeKey({
      reviewId: reviewId, operation: EVENT_INGESTED,
      reviewStatusVersion: reviewStatusVersion,
      occurredAtIso: occurredAtIso,
      actorPeerSyncHash: cleanLower(actorPeer.syncPeerIdHash)
    });
    if (!isSha256Hex(eventDigest)) { addCode(blockers, 'event-digest-generation-failed'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso }); }
    if (!isSha256Hex(dedupeKey)) { addCode(blockers, 'dedupe-key-generation-failed'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso }); }

    if (checkEventDuplicate(ledger, eventDigest, dedupeKey, blockers)) {
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }

    var auditId = await sha256Hex(canonicalJson({ reviewId: reviewId, op: EVENT_INGESTED, v: reviewStatusVersion }));
    var commonParts = {
      operation: EVENT_INGESTED,
      reviewId: reviewId,
      subjectId: handoff.subjectId,
      lineageId: handoff.lineageId,
      reviewStatusVersion: reviewStatusVersion,
      reviewState: STATE_PENDING,
      eventDigest: eventDigest,
      dedupeKey: dedupeKey,
      occurredAtIso: occurredAtIso,
      auditId: auditId,
      actorPeer: actorPeer,
      retentionExpiresAtIso: retentionExpiresAtIso,
      retentionStartedAtIso: retentionStartedAtIso,
      reviewRow: reviewRow,
      snapshotBookkeepingPointer: snapshotBookkeepingPointer,
      predicateVersion: handoff.predicateVersion,
      transitionName: 'tombstone-handoff-ingested',
      fromState: null,
      toState: null,
      reasonCode: 'f5-review-ingested'
    };
    var audit = assembleAuditMetadata(commonParts, warnings);
    var lifecycleState = assembleLifecycleState(commonParts, warnings);
    var event = assembleEventEnvelope(commonParts, audit, lifecycleState, null);

    privacyScan(event, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });

    try { await appendEvent(ledger, event); }
    catch (_) { addCode(blockers, 'f5-review-ledger-write-failed'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso }); }

    return buildResult({
      ok: true, status: 'ingested', reviewId: reviewId,
      currentState: STATE_PENDING, reviewStatusVersion: reviewStatusVersion,
      event: event, reviewRow: reviewRow, lifecycleState: lifecycleState,
      observedAtIso: observedAtIso, blockers: blockers, warnings: warnings,
      metadata: { perReviewSalt: perReviewSalt, retentionExpiresAtIso: retentionExpiresAtIso }
    });
  }

  // ── Public API: recordF5ReviewDecision ─────────────────────────────
  async function recordF5ReviewDecision(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();

    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }
    var reviewId = cleanLower(args.reviewId);
    if (!isSha256Hex(reviewId)) addCode(blockers, 'review-id-required');
    var decisionKind = cleanString(args.decisionKind);
    if (DECISION_KINDS.indexOf(decisionKind) === -1) addCode(blockers, 'decision-kind-invalid');
    var actorPeer = safeObject(args.actorPeer);
    if (!isSha256Hex(actorPeer.syncPeerIdHash)) addCode(blockers, 'actor-peer-syncPeerIdHash-required');
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)) addCode(blockers, 'actor-peer-physicalDeviceIdHash-required');
    if (!isSha256Hex(actorPeer.installIdHash)) addCode(blockers, 'actor-peer-installIdHash-required');
    var approvalToken = cleanLower(args.approvalToken);
    if (!isSha256Hex(approvalToken)) addCode(blockers, 'approval-token-required');
    var decidedAtIso = cleanString(args.decidedAtIso);
    if (!isIso(decidedAtIso)) addCode(blockers, 'decided-at-iso-invalid');
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId || null });

    var indexResult = await readAndIndex().catch(function () { return { error: 'f5-review-ledger-read-failed' }; });
    if (indexResult.error) { addCode(blockers, indexResult.error); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }
    var ledger = indexResult.ledger;
    var entry = indexResult.index[reviewId];
    if (!entry) { addCode(blockers, 'f5-review-not-found'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }
    if (entry.currentState !== STATE_PENDING) {
      addCode(blockers, 'f5-review-not-pending');
      return failureResult({
        blockers: blockers, warnings: warnings, observedAtIso: observedAtIso,
        reviewId: reviewId, currentState: entry.currentState,
        reviewStatusVersion: entry.reviewStatusVersion
      });
    }

    var nextStatusVersion = entry.reviewStatusVersion + 1;
    var expectedToken = await deriveApprovalToken({
      reviewId: reviewId, decisionKind: decisionKind,
      reviewStatusVersion: entry.reviewStatusVersion,
      actorPeerSyncHash: actorPeer.syncPeerIdHash, decidedAtIso: decidedAtIso
    });
    if (expectedToken !== approvalToken) {
      addCode(blockers, 'f5-review-decision-stale');
      return failureResult({
        blockers: blockers, warnings: warnings, observedAtIso: observedAtIso,
        reviewId: reviewId, currentState: entry.currentState,
        reviewStatusVersion: entry.reviewStatusVersion
      });
    }

    var nextState = decisionKind === DECISION_APPROVE_SEAL ? STATE_APPROVED_SEAL : STATE_APPROVED_RESTORE;
    var operation = decisionKind === DECISION_APPROVE_SEAL ? EVENT_APPROVED_SEAL : EVENT_APPROVED_RESTORE;
    var reviewRow = entry.reviewRow || {};

    replayDefense(reviewRow.subjectId, operation, reviewRow.baseHash || '',
      asArray(ledger.events), blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });

    var occurredAtIso = decidedAtIso;
    var eventDigest = await deriveEventDigest({
      operation: operation, reviewId: reviewId, subjectId: reviewRow.subjectId,
      lineageId: reviewRow.lineageId, reviewStatusVersion: nextStatusVersion,
      occurredAtIso: occurredAtIso, decisionKind: decisionKind,
      actorPeerSyncHash: actorPeer.syncPeerIdHash
    });
    var dedupeKey = await deriveDedupeKey({
      reviewId: reviewId, decisionKind: decisionKind,
      reviewStatusVersion: nextStatusVersion,
      actorPeerSyncHash: cleanLower(actorPeer.syncPeerIdHash),
      decidedAtIso: decidedAtIso
    });
    if (!isSha256Hex(eventDigest) || !isSha256Hex(dedupeKey)) {
      addCode(blockers, 'event-digest-or-dedupe-key-generation-failed');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });
    }
    if (checkEventDuplicate(ledger, eventDigest, dedupeKey, blockers)) {
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });
    }
    var approvalTokenHash = await sha256Hex(approvalToken);
    var auditId = await sha256Hex(canonicalJson({ reviewId: reviewId, op: operation, v: nextStatusVersion }));

    var commonParts = {
      operation: operation, reviewId: reviewId,
      subjectId: reviewRow.subjectId, lineageId: reviewRow.lineageId,
      reviewStatusVersion: nextStatusVersion, reviewState: nextState,
      eventDigest: eventDigest, dedupeKey: dedupeKey,
      occurredAtIso: occurredAtIso, auditId: auditId,
      actorPeer: actorPeer,
      retentionExpiresAtIso: entry.retentionExpiresAtIso,
      retentionStartedAtIso: entry.retentionStartedAtIso,
      reviewRow: reviewRow,
      predicateVersion: reviewRow.predicateVersion,
      transitionName: nextState === STATE_APPROVED_SEAL ? 'tombstone-approved-seal' : 'tombstone-approved-restore',
      fromState: 'retained', toState: 'retained',
      reasonCode: 'f5-review-decision',
      decisionKind: decisionKind, approvalTokenHash: approvalTokenHash
    };
    var audit = assembleAuditMetadata(commonParts, warnings);
    var lifecycleState = assembleLifecycleState(commonParts, warnings);
    var lifecycleTransition = assembleLifecycleTransition(commonParts, warnings);
    var event = assembleEventEnvelope(commonParts, audit, lifecycleState, lifecycleTransition);

    privacyScan(event, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });

    try { await appendEvent(ledger, event); }
    catch (_) { addCode(blockers, 'f5-review-ledger-write-failed'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }

    return buildResult({
      ok: true, status: 'decision-recorded', reviewId: reviewId,
      currentState: nextState, reviewStatusVersion: nextStatusVersion,
      event: event, reviewRow: reviewRow, lifecycleState: lifecycleState,
      lifecycleTransition: lifecycleTransition,
      observedAtIso: observedAtIso, blockers: blockers, warnings: warnings,
      metadata: { decisionKind: decisionKind }
    });
  }

  // ── Public API: evaluateF5ReviewExpiry ──────────────────────────────
  async function evaluateF5ReviewExpiry(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }
    var reviewId = cleanLower(args.reviewId);
    if (!isSha256Hex(reviewId)) addCode(blockers, 'review-id-required');
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });

    var indexResult = await readAndIndex().catch(function () { return { error: 'f5-review-ledger-read-failed' }; });
    if (indexResult.error) { addCode(blockers, indexResult.error); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }
    var ledger = indexResult.ledger;
    var entry = indexResult.index[reviewId];
    if (!entry) { addCode(blockers, 'f5-review-not-found'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }
    if (entry.currentState !== STATE_PENDING) {
      return buildResult({
        ok: true, status: 'expiry-noop', reviewId: reviewId,
        currentState: entry.currentState, reviewStatusVersion: entry.reviewStatusVersion,
        observedAtIso: observedAtIso, blockers: [], warnings: warnings,
        metadata: { noopReason: 'not-pending' }
      });
    }
    var expiresMs = Date.parse(entry.retentionExpiresAtIso);
    var observedMs = Date.parse(observedAtIso);
    if (!Number.isFinite(expiresMs) || !Number.isFinite(observedMs)) {
      addCode(blockers, 'retention-deadline-invalid');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });
    }
    if (observedMs < expiresMs) {
      return buildResult({
        ok: true, status: 'expiry-noop', reviewId: reviewId,
        currentState: STATE_PENDING, reviewStatusVersion: entry.reviewStatusVersion,
        observedAtIso: observedAtIso, blockers: [], warnings: warnings,
        metadata: { noopReason: 'within-window', retentionExpiresAtIso: entry.retentionExpiresAtIso }
      });
    }

    var actorPeer = await systemActorPeer();
    var nextStatusVersion = entry.reviewStatusVersion + 1;
    var reviewRow = entry.reviewRow || {};
    var occurredAtIso = observedAtIso;

    replayDefense(reviewRow.subjectId, EVENT_AUTO_EXPIRED, reviewRow.baseHash || '',
      asArray(ledger.events), blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });

    var eventDigest = await deriveEventDigest({
      operation: EVENT_AUTO_EXPIRED, reviewId: reviewId,
      subjectId: reviewRow.subjectId, lineageId: reviewRow.lineageId,
      reviewStatusVersion: nextStatusVersion, occurredAtIso: occurredAtIso,
      retentionExpiresAtIso: entry.retentionExpiresAtIso
    });
    var dedupeKey = await deriveDedupeKey({
      reviewId: reviewId, operation: EVENT_AUTO_EXPIRED,
      reviewStatusVersion: nextStatusVersion, occurredAtIso: occurredAtIso,
      actorPeerSyncHash: cleanLower(actorPeer.syncPeerIdHash)
    });
    if (!isSha256Hex(eventDigest) || !isSha256Hex(dedupeKey)) {
      addCode(blockers, 'event-digest-or-dedupe-key-generation-failed');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });
    }
    if (checkEventDuplicate(ledger, eventDigest, dedupeKey, blockers)) {
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });
    }
    var auditId = await sha256Hex(canonicalJson({ reviewId: reviewId, op: EVENT_AUTO_EXPIRED, v: nextStatusVersion }));

    var commonParts = {
      operation: EVENT_AUTO_EXPIRED, reviewId: reviewId,
      subjectId: reviewRow.subjectId, lineageId: reviewRow.lineageId,
      reviewStatusVersion: nextStatusVersion, reviewState: STATE_AUTO_EXPIRED,
      eventDigest: eventDigest, dedupeKey: dedupeKey,
      occurredAtIso: occurredAtIso, auditId: auditId,
      actorPeer: actorPeer,
      retentionExpiresAtIso: entry.retentionExpiresAtIso,
      retentionStartedAtIso: entry.retentionStartedAtIso,
      reviewRow: reviewRow,
      predicateVersion: reviewRow.predicateVersion,
      transitionName: 'tombstone-auto-expired',
      fromState: 'retained', toState: 'retained',
      reasonCode: 'retention-window-elapsed'
    };
    var audit = assembleAuditMetadata(commonParts, warnings);
    var lifecycleState = assembleLifecycleState(commonParts, warnings);
    var lifecycleTransition = assembleLifecycleTransition(commonParts, warnings);
    var event = assembleEventEnvelope(commonParts, audit, lifecycleState, lifecycleTransition);

    privacyScan(event, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });

    try { await appendEvent(ledger, event); }
    catch (_) { addCode(blockers, 'f5-review-ledger-write-failed'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }

    return buildResult({
      ok: true, status: 'auto-expired', reviewId: reviewId,
      currentState: STATE_AUTO_EXPIRED, reviewStatusVersion: nextStatusVersion,
      event: event, reviewRow: reviewRow, lifecycleState: lifecycleState,
      lifecycleTransition: lifecycleTransition,
      observedAtIso: observedAtIso, blockers: [], warnings: warnings,
      metadata: { reasonCode: 'retention-window-elapsed' }
    });
  }

  // ── Public API: closeF5Review ──────────────────────────────────────
  async function closeF5Review(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso });
    }
    var reviewId = cleanLower(args.reviewId);
    if (!isSha256Hex(reviewId)) addCode(blockers, 'review-id-required');
    var closureKind = cleanString(args.closureKind);
    if (CLOSURE_KINDS.indexOf(closureKind) === -1) addCode(blockers, 'closure-kind-invalid');
    var applyEventDigest = cleanLower(args.applyEventDigest);
    if (!isSha256Hex(applyEventDigest)) addCode(blockers, 'apply-event-digest-required');
    var appliedAtIso = cleanString(args.appliedAtIso);
    if (!isIso(appliedAtIso)) addCode(blockers, 'applied-at-iso-invalid');
    var actorPeer = safeObject(args.actorPeer);
    if (!isSha256Hex(actorPeer.syncPeerIdHash)) addCode(blockers, 'actor-peer-syncPeerIdHash-required');
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)) addCode(blockers, 'actor-peer-physicalDeviceIdHash-required');
    if (!isSha256Hex(actorPeer.installIdHash)) addCode(blockers, 'actor-peer-installIdHash-required');
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId || null });

    var indexResult = await readAndIndex().catch(function () { return { error: 'f5-review-ledger-read-failed' }; });
    if (indexResult.error) { addCode(blockers, indexResult.error); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }
    var ledger = indexResult.ledger;
    var entry = indexResult.index[reviewId];
    if (!entry) { addCode(blockers, 'f5-review-not-found'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }
    if (POST_DECISION_STATES.indexOf(entry.currentState) === -1) {
      addCode(blockers, 'f5-review-not-post-decision');
      return failureResult({
        blockers: blockers, warnings: warnings, observedAtIso: observedAtIso,
        reviewId: reviewId, currentState: entry.currentState,
        reviewStatusVersion: entry.reviewStatusVersion
      });
    }
    // Closure-state compatibility check
    if (closureKind === CLOSURE_RESTORED && entry.currentState !== STATE_APPROVED_RESTORE) {
      addCode(blockers, 'closure-kind-incompatible-with-decision');
    }
    if (closureKind === CLOSURE_SEALED &&
        entry.currentState !== STATE_APPROVED_SEAL &&
        entry.currentState !== STATE_AUTO_EXPIRED) {
      addCode(blockers, 'closure-kind-incompatible-with-decision');
    }
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId, currentState: entry.currentState, reviewStatusVersion: entry.reviewStatusVersion });

    var nextStatusVersion = entry.reviewStatusVersion + 1;
    var nextState = closureKind === CLOSURE_SEALED ? STATE_CLOSED_SEALED : STATE_CLOSED_RESTORED;
    var operation = closureKind === CLOSURE_SEALED ? EVENT_CLOSED_SEALED : EVENT_CLOSED_RESTORED;
    var reviewRow = entry.reviewRow || {};
    var occurredAtIso = appliedAtIso;

    replayDefense(reviewRow.subjectId, operation, reviewRow.baseHash || '',
      asArray(ledger.events), blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });

    var eventDigest = await deriveEventDigest({
      operation: operation, reviewId: reviewId,
      subjectId: reviewRow.subjectId, lineageId: reviewRow.lineageId,
      reviewStatusVersion: nextStatusVersion, occurredAtIso: occurredAtIso,
      applyEventDigest: applyEventDigest, closureKind: closureKind,
      actorPeerSyncHash: actorPeer.syncPeerIdHash
    });
    var dedupeKey = await deriveDedupeKey({
      reviewId: reviewId, closureKind: closureKind,
      reviewStatusVersion: nextStatusVersion, occurredAtIso: occurredAtIso,
      actorPeerSyncHash: cleanLower(actorPeer.syncPeerIdHash),
      applyEventDigest: applyEventDigest
    });
    if (!isSha256Hex(eventDigest) || !isSha256Hex(dedupeKey)) {
      addCode(blockers, 'event-digest-or-dedupe-key-generation-failed');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });
    }
    if (checkEventDuplicate(ledger, eventDigest, dedupeKey, blockers)) {
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });
    }
    var auditId = await sha256Hex(canonicalJson({ reviewId: reviewId, op: operation, v: nextStatusVersion }));

    var fromLifecycle = 'retained';
    var toLifecycle = nextState === STATE_CLOSED_SEALED ? 'tombstoned' : 'active';
    var commonParts = {
      operation: operation, reviewId: reviewId,
      subjectId: reviewRow.subjectId, lineageId: reviewRow.lineageId,
      reviewStatusVersion: nextStatusVersion, reviewState: nextState,
      eventDigest: eventDigest, dedupeKey: dedupeKey,
      occurredAtIso: occurredAtIso, auditId: auditId,
      actorPeer: actorPeer,
      retentionExpiresAtIso: entry.retentionExpiresAtIso,
      retentionStartedAtIso: entry.retentionStartedAtIso,
      reviewRow: reviewRow,
      predicateVersion: reviewRow.predicateVersion,
      transitionName: nextState === STATE_CLOSED_SEALED ? 'tombstone-closure-sealed' : 'tombstone-closure-restored',
      fromState: fromLifecycle, toState: toLifecycle,
      reasonCode: 'f5-review-closed',
      closureKind: closureKind, applyEventDigest: applyEventDigest
    };
    var audit = assembleAuditMetadata(commonParts, warnings);
    var lifecycleState = assembleLifecycleState(commonParts, warnings);
    var lifecycleTransition = assembleLifecycleTransition(commonParts, warnings);
    // Tombstone shape attached on sealed closures (read-only reference;
    // queue does not write to any Native tombstone table).
    var tombstone = null;
    if (nextState === STATE_CLOSED_SEALED) {
      tombstone = shapeTombstoneSafe({
        tombstoneId: applyEventDigest,
        recordKind: 'snapshot',
        subjectId: reviewRow.subjectId,
        deletedAt: occurredAtIso,
        deletedBySyncPeerId: actorPeer.syncPeerIdHash,
        deleteReason: entry.currentState === STATE_AUTO_EXPIRED ? 'retention-expired' : 'operator-approved-seal',
        priorDigest: applyEventDigest,
        sourceExportId: reviewId,
        createdAt: occurredAtIso, updatedAt: occurredAtIso
      }, warnings);
    }
    commonParts.tombstone = tombstone;
    var event = assembleEventEnvelope(commonParts, audit, lifecycleState, lifecycleTransition);

    privacyScan(event, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId });

    try { await appendEvent(ledger, event); }
    catch (_) { addCode(blockers, 'f5-review-ledger-write-failed'); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: observedAtIso, reviewId: reviewId }); }

    return buildResult({
      ok: true, status: 'closed', reviewId: reviewId,
      currentState: nextState, reviewStatusVersion: nextStatusVersion,
      event: event, reviewRow: reviewRow, lifecycleState: lifecycleState,
      lifecycleTransition: lifecycleTransition,
      observedAtIso: observedAtIso, blockers: [], warnings: warnings,
      metadata: { closureKind: closureKind, tombstone: tombstone }
    });
  }

  // ── Public API: listing helpers ─────────────────────────────────────
  async function listF5ReviewsByState(state, observedAtIso) {
    var blockers = [];
    var warnings = [];
    var ts = cleanString(observedAtIso) || nowIsoSeconds();
    var targetState = cleanString(state);
    if (STATES.indexOf(targetState) === -1) {
      addCode(blockers, 'state-invalid');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts });
    }
    var indexResult = await readAndIndex().catch(function () { return { error: 'f5-review-ledger-read-failed' }; });
    if (indexResult.error) { addCode(blockers, indexResult.error); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts }); }
    var entries = Object.keys(indexResult.index).map(function (k) { return indexResult.index[k]; })
      .filter(function (e) { return e.currentState === targetState; });
    var rows = redactedRowsList(entries, ts, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts });
    return buildResult({
      ok: true, status: 'listed', rows: rows,
      observedAtIso: ts, blockers: [], warnings: warnings,
      metadata: { state: targetState, count: rows.length }
    });
  }
  async function listF5ReviewsPastExpiry(observedAtIso) {
    var blockers = [];
    var warnings = [];
    var ts = cleanString(observedAtIso) || nowIsoSeconds();
    var observedMs = Date.parse(ts);
    if (!Number.isFinite(observedMs)) {
      addCode(blockers, 'observed-at-iso-invalid');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts });
    }
    var indexResult = await readAndIndex().catch(function () { return { error: 'f5-review-ledger-read-failed' }; });
    if (indexResult.error) { addCode(blockers, indexResult.error); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts }); }
    var entries = Object.keys(indexResult.index).map(function (k) { return indexResult.index[k]; })
      .filter(function (e) {
        if (e.currentState !== STATE_PENDING) return false;
        var em = Date.parse(e.retentionExpiresAtIso);
        return Number.isFinite(em) && observedMs >= em;
      });
    var rows = redactedRowsList(entries, ts, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts });
    return buildResult({
      ok: true, status: 'listed', rows: rows,
      observedAtIso: ts, blockers: [], warnings: warnings,
      metadata: { count: rows.length }
    });
  }
  async function getF5ReviewById(reviewId) {
    var blockers = [];
    var warnings = [];
    var ts = nowIsoSeconds();
    var rid = cleanLower(reviewId);
    if (!isSha256Hex(rid)) {
      addCode(blockers, 'review-id-required');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts });
    }
    var indexResult = await readAndIndex().catch(function () { return { error: 'f5-review-ledger-read-failed' }; });
    if (indexResult.error) { addCode(blockers, indexResult.error); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts, reviewId: rid }); }
    var entry = indexResult.index[rid];
    if (!entry) {
      return buildResult({
        ok: true, status: 'not-found', reviewId: rid,
        currentState: null, reviewStatusVersion: 0,
        rows: [], observedAtIso: ts, blockers: [], warnings: warnings,
        metadata: { found: false }
      });
    }
    var rows = redactedRowsList([entry], ts, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts, reviewId: rid });
    return buildResult({
      ok: true, status: 'found', reviewId: rid,
      currentState: entry.currentState, reviewStatusVersion: entry.reviewStatusVersion,
      rows: rows, observedAtIso: ts, blockers: [], warnings: warnings,
      metadata: { found: true, reviewRow: entry.reviewRow }
    });
  }
  async function listF5ReviewsStuckPostDecision(observedAtIso, gracePeriodMs) {
    var blockers = [];
    var warnings = [];
    var ts = cleanString(observedAtIso) || nowIsoSeconds();
    var observedMs = Date.parse(ts);
    if (!Number.isFinite(observedMs)) {
      addCode(blockers, 'observed-at-iso-invalid');
      return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts });
    }
    var grace = (typeof gracePeriodMs === 'number' && gracePeriodMs > 0)
      ? Math.floor(gracePeriodMs) : DEFAULT_STUCK_GRACE_MS;
    var indexResult = await readAndIndex().catch(function () { return { error: 'f5-review-ledger-read-failed' }; });
    if (indexResult.error) { addCode(blockers, indexResult.error); return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts }); }
    var entries = Object.keys(indexResult.index).map(function (k) { return indexResult.index[k]; })
      .filter(function (e) {
        if (POST_DECISION_STATES.indexOf(e.currentState) === -1) return false;
        var pm = Date.parse(e.postDecisionAtIso);
        return Number.isFinite(pm) && (observedMs - pm) >= grace;
      });
    var rows = redactedRowsList(entries, ts, blockers, warnings);
    if (blockers.length) return failureResult({ blockers: blockers, warnings: warnings, observedAtIso: ts });
    return buildResult({
      ok: true, status: 'listed', rows: rows,
      observedAtIso: ts, blockers: [], warnings: warnings,
      metadata: { count: rows.length, gracePeriodMs: grace }
    });
  }

  // ── Registration ────────────────────────────────────────────────────
  H2O.Desktop.Sync.ingestF5Review = ingestF5Review;
  H2O.Desktop.Sync.recordF5ReviewDecision = recordF5ReviewDecision;
  H2O.Desktop.Sync.evaluateF5ReviewExpiry = evaluateF5ReviewExpiry;
  H2O.Desktop.Sync.closeF5Review = closeF5Review;
  H2O.Desktop.Sync.listF5ReviewsByState = listF5ReviewsByState;
  H2O.Desktop.Sync.listF5ReviewsPastExpiry = listF5ReviewsPastExpiry;
  H2O.Desktop.Sync.getF5ReviewById = getF5ReviewById;
  H2O.Desktop.Sync.listF5ReviewsStuckPostDecision = listF5ReviewsStuckPostDecision;
  H2O.Desktop.Sync.__snapshotF5ReviewQueueInstalled = true;
  H2O.Desktop.Sync.__snapshotF5ReviewQueueVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
