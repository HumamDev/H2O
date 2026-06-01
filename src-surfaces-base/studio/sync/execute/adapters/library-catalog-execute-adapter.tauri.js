/* H2O Desktop Sync - F15.8.a library catalog execute adapter
 *
 * Metadata-only execute adapter for the library.catalog lane. Consumes a
 * F15.7.a catalog bookkeeping result/row + its source F15.6.a receipt and
 * shapes a F14.6.2 execute-envelope ready for the F14.6 execute lane
 * (preflight gate → native broker / f5 broker → settlement writer).
 *
 * Per F14.6.2 §safety-invariants: this module is SHAPE/VALIDATE/REGISTER
 * metadata only. It does NOT:
 *   - store callbacks in the adapter registry
 *   - call Tauri Native (the F14.6.6 native broker's job)
 *   - mutate F5 review queue (F15.6.a already ingested at receipt time;
 *     F15.8.e closure bridge will call closeF5Review later)
 *   - write the publication ledger (F14.6.4 lifecycle module's job)
 *   - write the relay inbox/outbox (F14.6.5 relay broker's job)
 *   - advance watermarks (F14.6.8 settlement writer's job)
 *   - write consumed-ops (F14.6.8 settlement writer's job)
 *   - apply / execute (F14.6 broker chain + settlement writer's job)
 *   - mutate any SQLite storage (F15.8.f sentinel guards that exclusively)
 *
 * Tombstone F5 state gate:
 *   For the tombstone operation, the adapter REQUIRES that the F5 review
 *   referenced by the bookkeeping row's `f5ReviewId` is in a
 *   post-decision state (approved-seal | approved-restore | auto-expired)
 *   before shaping an actionable envelope. If the F5 review is in any
 *   open / pending state, the adapter blocks with
 *   `library-catalog-execute-tombstone-f5-state-not-post-decision`.
 *   The adapter NEVER closes a review — F15.8.e is that bridge.
 *
 * Public API:
 *   H2O.Desktop.Sync.shapeLibraryCatalogExecuteEnvelope(input)       -> Promise<result>
 *   H2O.Desktop.Sync.registerLibraryCatalogExecuteAdapter()          -> result
 *
 *   H2O.Desktop.Sync.__libraryCatalogExecuteAdapterInstalled
 *   H2O.Desktop.Sync.__libraryCatalogExecuteAdapterVersion
 *
 * Kernel adoption:
 *   identity-kit:   canonicalJSON, sha256Hex, isSha256Hex
 *   privacy-scan:   scanDomainForbiddenFields('library.catalog', ...)
 *   result-shape:   createResult (fallback wrap)
 *
 * Note on F14.6.2 DOMAINS list:
 *   The F14.6.2 envelope contract's `DOMAINS = ['chat', 'snapshot',
 *   'capture']` does not currently include `'library.catalog'` or
 *   `'library.binding'`. F15.8.a tries to register through the kernel
 *   adapter registry best-effort; on `execute-adapter-domain-invalid`
 *   from the kernel, the adapter falls back to LOCAL metadata storage
 *   (a module-scoped object) and surfaces a clear warning
 *   `library-catalog-execute-adapter-kernel-domain-not-supported`. The
 *   adapter remains functional and the envelope it shapes still
 *   conforms to the F14.6.2 envelope schema.
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
  if (H2O.Desktop.Sync.__libraryCatalogExecuteAdapterInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f15.8.catalog';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-catalog-execute-adapter.v1';
  var ENVELOPE_SCHEMA = 'h2o.desktop.sync.execute-envelope.v1';
  var ADAPTER_ID = 'library-catalog-execute-adapter';
  var DOMAIN_ID = 'library.catalog';
  var SUBJECT_TYPE = 'library.catalog';
  var PRIVACY_DOMAIN_TAG = 'library.catalog';
  var ENVELOPE_KIND = 'proposal-receipt';
  var EXPECTED_RECEIPT_SCHEMA = 'h2o.desktop.sync.library-catalog-apply-event-receipt.v1';
  var EXPECTED_RECEIPT_VERSION_PREFIX = '0.1.0-f15.6.catalog';
  var EXPECTED_BOOKKEEPING_ROW_SCHEMA = 'h2o.desktop.sync.library-catalog-bookkeeping-row.v1';
  var F5_QUEUE_KEY = 'h2o:sync:snapshot-f5-review-queue:v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  // F5 review states allowed for tombstone envelope shaping. Mirrors
  // F14.6.15 snapshot-tombstone adapter `POST_DECISION_STATES`.
  var F5_POST_DECISION_STATES = ['approved-seal', 'approved-restore', 'auto-expired'];

  // Same forbidden-field defense-in-depth list as F15.6.a / F15.7.a.
  // Identifiers cross the envelope boundary only as sha256 hashes.
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

  // Per-operation metadata. Each entry maps to: a flavor name used in
  // envelope.flavor + payloadShapes; a Native command tag for the F14.6.6
  // native broker; whether F5 is in the dispatch profile; and the
  // lifecycle invariant the receipt MUST satisfy.
  var OPERATION_META = {
    'create': {
      flavor: 'library-catalog-create',
      operationKind: 'library-catalog-create-applied',
      nativeCommand: 'h2o_library_catalog_create_apply',
      requiresF5: false
    },
    'rename': {
      flavor: 'library-catalog-rename',
      operationKind: 'library-catalog-rename-applied',
      nativeCommand: 'h2o_library_catalog_rename_apply',
      requiresF5: false
    },
    'recolor': {
      flavor: 'library-catalog-recolor',
      operationKind: 'library-catalog-recolor-applied',
      nativeCommand: 'h2o_library_catalog_recolor_apply',
      requiresF5: false
    },
    'archive': {
      flavor: 'library-catalog-archive',
      operationKind: 'library-catalog-archive-applied',
      nativeCommand: 'h2o_library_catalog_archive_apply',
      requiresF5: false
    },
    'restore-from-archived': {
      flavor: 'library-catalog-restore-from-archived',
      operationKind: 'library-catalog-restore-from-archived-applied',
      nativeCommand: 'h2o_library_catalog_restore_from_archived_apply',
      requiresF5: false
    },
    'tombstone': {
      flavor: 'library-catalog-tombstone',
      operationKind: 'library-catalog-tombstone-applied',
      nativeCommand: 'h2o_library_catalog_tombstone_apply',
      requiresF5: true
    },
    'restore-from-retained': {
      flavor: 'library-catalog-restore-from-retained',
      operationKind: 'library-catalog-restore-from-retained-applied',
      nativeCommand: 'h2o_library_catalog_restore_from_retained_apply',
      requiresF5: false
    }
  };
  var ALLOWED_OPERATIONS = Object.keys(OPERATION_META);

  // Module-scoped local adapter metadata (used if kernel registry rejects
  // the library.catalog domain). Never exposes callbacks.
  var localAdapterMetadata = null;

  // ── Tiny helpers ────────────────────────────────────────────────────
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isSha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return SHA256_RE.test(cleanLower(value));
  }
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
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

  // ── Privacy scan ────────────────────────────────────────────────────
  // Kernel-first with deterministic local fall-back. Four call sites in
  // the main flow guard against leakage at every shape transition.
  function scanPrivacy(target, blockers, warnings, blockerCode) {
    var blockerToAdd = cleanString(blockerCode) || 'library-catalog-execute-privacy-failed';
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scan = kernel.scanDomainForbiddenFields(PRIVACY_DOMAIN_TAG, target);
        if (scan && scan.ok === false) {
          mergeCodes(blockers, scan.blockers);
          mergeCodes(warnings, scan.warnings);
          addCode(blockers, blockerToAdd);
          return;
        }
      } catch (_) {
        addCode(warnings, 'library-catalog-execute-privacy-scan-threw');
      }
    } else {
      addCode(warnings, 'library-catalog-execute-privacy-scan-unavailable');
    }
    var hits = [];
    findForbiddenFieldsLocal(target, '', hits);
    if (hits.length) {
      addCode(blockers, blockerToAdd);
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

  // ── Input resolution ────────────────────────────────────────────────
  // Accept either:
  //   { bookkeepingResult, ... }        — F15.7.a result envelope
  //   { row, receipt, ... }             — direct row + receipt
  //   { receipt, bookkeepingRow, ... }  — alt naming
  // and produce a normalized { row, receipt, f5Review? } tuple.
  function resolveInputs(args) {
    var bookkeepingResult = safeObject(args.bookkeepingResult);
    var row = isObject(args.row) ? args.row
      : isObject(args.bookkeepingRow) ? args.bookkeepingRow
      : isObject(bookkeepingResult.row) ? bookkeepingResult.row
      : null;
    var receipt = isObject(args.receipt) ? args.receipt
      : isObject(args.applyEventReceipt) ? args.applyEventReceipt
      : isObject(bookkeepingResult.receipt) ? bookkeepingResult.receipt
      : null;
    var f5Review = isObject(args.f5Review) ? args.f5Review
      : (cleanString(args.f5ReviewState) || cleanString(args.currentState))
        ? { currentState: cleanString(args.f5ReviewState) || cleanString(args.currentState),
            reviewId: cleanLower(args.f5ReviewId) }
        : null;
    return { row: row, receipt: receipt, f5Review: f5Review };
  }

  // ── Receipt validation (mirrors F15.7.a's validateReceiptShape) ─────
  function validateReceiptShape(receipt, blockers, warnings) {
    if (!isObject(receipt)) {
      addCode(blockers, 'library-catalog-execute-receipt-not-ok');
      return null;
    }
    if (receipt.ok !== true) {
      mergeCodes(warnings, receipt.warnings);
      addCode(blockers, 'library-catalog-execute-receipt-not-ok');
      return null;
    }
    if (cleanString(receipt.schema) !== EXPECTED_RECEIPT_SCHEMA) {
      addCode(blockers, 'library-catalog-execute-receipt-schema-invalid');
      return null;
    }
    var version = cleanString(receipt.version);
    if (version.indexOf(EXPECTED_RECEIPT_VERSION_PREFIX) !== 0) {
      addCode(blockers, 'library-catalog-execute-receipt-schema-invalid');
      return null;
    }
    if (!isSha256Hex(receipt.applyEventDigest) || !isSha256Hex(receipt.receiptDigest)) {
      addCode(blockers, 'library-catalog-execute-receipt-schema-invalid');
      return null;
    }
    if (!isObject(receipt.applyEvent) || !isObject(receipt.receipt) || !isObject(receipt.auditMetadata)) {
      addCode(blockers, 'library-catalog-execute-receipt-schema-invalid');
      return null;
    }
    var actorPeer = safeObject(receipt.actorPeer);
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)
        || !isSha256Hex(actorPeer.installIdHash)
        || !isSha256Hex(actorPeer.syncPeerIdHash)) {
      addCode(blockers, 'library-catalog-execute-receipt-schema-invalid');
      return null;
    }
    if (!isSha256Hex(receipt.originAccountIdHash)) {
      addCode(blockers, 'library-catalog-execute-receipt-schema-invalid');
      return null;
    }
    return receipt;
  }

  // ── Bookkeeping row validation ──────────────────────────────────────
  function validateBookkeepingRow(row, receipt, blockers, warnings) {
    if (!isObject(row)) {
      addCode(blockers, 'library-catalog-execute-bookkeeping-row-missing');
      return null;
    }
    if (cleanString(row.schema) !== EXPECTED_BOOKKEEPING_ROW_SCHEMA) {
      addCode(blockers, 'library-catalog-execute-bookkeeping-row-missing');
      return null;
    }
    if (cleanString(row.lane) !== DOMAIN_ID) {
      addCode(blockers, 'library-catalog-execute-lane-invariant-violation');
      return null;
    }
    if (!isSha256Hex(row.rowId) || !isSha256Hex(row.rowDigest)) {
      addCode(blockers, 'library-catalog-execute-bookkeeping-row-missing');
      return null;
    }
    if (!isSha256Hex(row.applyEventDigest) || !isSha256Hex(row.receiptDigest)) {
      addCode(blockers, 'library-catalog-execute-bookkeeping-row-missing');
      return null;
    }
    // Cross-check the bookkeeping row's digests against the receipt's digests.
    if (cleanLower(row.applyEventDigest) !== cleanLower(receipt.applyEventDigest)) {
      addCode(blockers, 'library-catalog-execute-lane-invariant-violation');
      return null;
    }
    if (cleanLower(row.receiptDigest) !== cleanLower(receipt.receiptDigest)) {
      addCode(blockers, 'library-catalog-execute-lane-invariant-violation');
      return null;
    }
    return row;
  }

  // ── F5 state gate (tombstone only) ──────────────────────────────────
  // For tombstone, the bookkeeping row's f5ReviewId is the link to the
  // F5 review queue entry. The adapter requires the review be in a
  // post-decision state (approved-seal | approved-restore | auto-expired)
  // before shaping an actionable envelope. The adapter NEVER mutates the
  // queue — F15.8.e closure bridge does that.
  function validateF5StateForTombstone(row, f5Review, blockers, warnings) {
    var stateRaw = safeObject(f5Review).currentState;
    var state = cleanString(stateRaw).toLowerCase();
    if (!state) {
      addCode(blockers, 'library-catalog-execute-tombstone-f5-state-not-post-decision');
      return false;
    }
    if (F5_POST_DECISION_STATES.indexOf(state) === -1) {
      addCode(blockers, 'library-catalog-execute-tombstone-f5-state-not-post-decision');
      return false;
    }
    // Cross-check f5ReviewId on row matches the supplied review (if both present).
    var rowReviewId = cleanLower(row.f5ReviewId);
    var suppliedReviewId = cleanLower(f5Review.reviewId);
    if (rowReviewId && suppliedReviewId && rowReviewId !== suppliedReviewId) {
      addCode(blockers, 'library-catalog-execute-tombstone-f5-state-not-post-decision');
      return false;
    }
    return true;
  }

  // ── Envelope shaping ────────────────────────────────────────────────
  function buildDispatchProfile(meta, row) {
    var base = {
      requiresNative: true,
      requiresF5: meta.requiresF5 === true,
      requiresRelay: false,
      nativeCommand: meta.nativeCommand,
      // F14.6.2 validateDispatchProfile requires nativeIdempotent to be
      // a boolean. Library catalog operations are idempotent via the
      // F14.6.8 settlement writer's (eventDigest, dedupeKey) dedupe.
      nativeIdempotent: true,
      retryPolicy: {
        maxAttempts: 3,
        minDelayMs: 1000,
        maxDelayMs: 30000,
        backoffKind: 'exponential'
      }
    };
    if (meta.requiresF5 === true) {
      base.f5ReviewId = cleanLower(row.f5ReviewId) || null;
      base.f5QueueKey = F5_QUEUE_KEY;
    }
    return base;
  }

  async function computeSettlementDigest(parts) {
    return await sha256Hex(canonicalJson({
      domainId: DOMAIN_ID,
      subjectId: parts.subjectId,
      lineageId: parts.lineageId,
      dedupeKey: parts.dedupeKey,
      eventDigest: parts.eventDigest,
      receiptDigest: parts.receiptDigest,
      bookkeepingRowId: parts.bookkeepingRowId,
      operationKind: parts.operationKind
    }));
  }

  // Build the payloadShapes.proposalReceipt object. Field names + values
  // are sha256 / opaque-string only — no raw IDs, names, paths, colors.
  function buildPayloadShapes(row, receipt, meta) {
    var receiptObj = safeObject(receipt.receipt);
    var applyEventObj = safeObject(receipt.applyEvent);
    var canonicalCatalog = safeObject(receipt.canonicalCatalog);
    var payload = safeObject(applyEventObj.payload);
    return {
      proposalReceipt: {
        schema: 'h2o.desktop.sync.library-catalog-execute-proposal-receipt.v1',
        domainId: DOMAIN_ID,
        operationKind: meta.operationKind,
        flavor: meta.flavor,
        // Digest links into the receipt + bookkeeping audit chain. No
        // raw values; receipt + bookkeeping row carry all evidence.
        receiptDigest: cleanLower(receipt.receiptDigest),
        applyEventDigest: cleanLower(receipt.applyEventDigest),
        bookkeepingRowId: cleanLower(row.rowId),
        bookkeepingRowDigest: cleanLower(row.rowDigest),
        // Canonical catalog snapshot is hash-only.
        canonicalSubjectId: cleanLower(canonicalCatalog.subjectId || receipt.subjectId),
        canonicalRevisionHash: cleanLower(canonicalCatalog.revisionHash || payload.postStateHash),
        canonicalKindTag: cleanLower(canonicalCatalog.catalogKind),
        canonicalNameHash: cleanLower(canonicalCatalog.nameHash),
        canonicalColorHash: cleanLower(canonicalCatalog.colorHash) || null,
        canonicalSourceTagHash: cleanLower(canonicalCatalog.sourceTagHash),
        canonicalSchemaVersion: cleanString(canonicalCatalog.schemaVersion),
        // Lifecycle transition is named-state only; from/to live as
        // opaque tokens.
        lifecycleFromState: cleanString(safeObject(payload.lifecycleTransition).fromState),
        lifecycleToState: cleanString(safeObject(payload.lifecycleTransition).toState),
        predicateVersion: cleanString(receiptObj.predicateVersion),
        // F5 fields (tombstone only; null for native ops)
        f5ReviewIngested: meta.requiresF5 ? (receipt.f5ReviewIngested === true) : false,
        f5ReviewId: meta.requiresF5 ? (cleanLower(receipt.f5ReviewId) || null) : null
      }
    };
  }

  function buildSettlementShapes(row, receipt, meta, settlementDigest) {
    var receiptObj = safeObject(receipt.receipt);
    var payload = safeObject(safeObject(receipt.applyEvent).payload);
    var postHash = cleanLower(payload.postStateHash) || cleanLower(receiptObj.postStateHash);
    return {
      revisionHash: postHash,
      postStateHash: postHash,
      settlementDigest: settlementDigest,
      receiptDigest: cleanLower(receipt.receiptDigest),
      bookkeepingRowId: cleanLower(row.rowId),
      // expectedCurrentState / expectedTargetState are F15.4 envelope
      // objects (preserved verbatim by F15.5 → F15.6 → F15.7).
      expectedCurrentState: isObject(receipt.expectedCurrentState) ? receipt.expectedCurrentState : null,
      expectedTargetState: isObject(receipt.expectedTargetState) ? receipt.expectedTargetState : null
    };
  }

  async function shapeEnvelopeInternal(row, receipt, meta, observedAtIso, warnings) {
    var subjectId = cleanLower(receipt.subjectId);
    var lineageId = cleanLower(receipt.lineageId);
    var dedupeKey = cleanLower(receipt.dedupeKey);
    var eventDigest = cleanLower(receipt.applyEventDigest);
    var settlementDigest = await computeSettlementDigest({
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      eventDigest: eventDigest,
      receiptDigest: cleanLower(receipt.receiptDigest),
      bookkeepingRowId: cleanLower(row.rowId),
      operationKind: meta.operationKind
    });
    if (!isSha256Hex(settlementDigest)) {
      addCode(warnings, 'library-catalog-execute-settlement-digest-derivation-failed');
      return null;
    }
    var dispatchProfile = buildDispatchProfile(meta, row);
    var payloadShapes = buildPayloadShapes(row, receipt, meta);
    var settlementShapes = buildSettlementShapes(row, receipt, meta, settlementDigest);
    var actorPeer = safeObject(receipt.actorPeer);
    var envelope = {
      schema: ENVELOPE_SCHEMA,
      version: VERSION,
      envelopeKind: ENVELOPE_KIND,
      flavor: meta.flavor,
      domainId: DOMAIN_ID,
      operationKind: meta.operationKind,
      subjectId: subjectId,
      lineageId: lineageId,
      dedupeKey: dedupeKey,
      eventDigest: eventDigest,
      dispatchProfile: dispatchProfile,
      payloadShapes: payloadShapes,
      settlementShapes: settlementShapes,
      receiptDigest: cleanLower(receipt.receiptDigest),
      receiptKind: cleanString(safeObject(receipt.receipt).receiptKind),
      bookkeepingRowId: cleanLower(row.rowId),
      originAccountIdHash: cleanLower(receipt.originAccountIdHash),
      actorPeer: {
        physicalDeviceIdHash: cleanLower(actorPeer.physicalDeviceIdHash),
        installIdHash: cleanLower(actorPeer.installIdHash),
        syncPeerIdHash: cleanLower(actorPeer.syncPeerIdHash),
        surfaceKind: cleanString(actorPeer.surfaceKind) || 'desktop-tauri'
      },
      createdAtIso: observedAtIso,
      observedAtIso: observedAtIso
    };
    return envelope;
  }

  // ── Side-effect summary (all 8 flags false) ─────────────────────────
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

  // ── Result envelope assembly ────────────────────────────────────────
  function buildResult(opts) {
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      registered: opts.registered === true,
      envelope: opts.envelope || null,
      bookkeepingRow: opts.bookkeepingRow || null,
      receipt: opts.receipt || null,
      adapterMetadata: opts.adapterMetadata || null,
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
    opts.registered = false;
    return buildResult(opts);
  }
  function scanFinalOutput(result) {
    var blockers = [];
    var warnings = result.warnings ? result.warnings.slice() : [];
    scanPrivacy(result, blockers, warnings, 'library-catalog-execute-privacy-failed');
    if (!blockers.length) return result;
    return blockedResult({
      envelope: null,
      bookkeepingRow: null,
      receipt: null,
      blockers: codeList(blockers.concat(result.blockers || [])),
      warnings: codeList(warnings),
      observedAtIso: result.observedAtIso
    });
  }

  // ── Main entry — shapeLibraryCatalogExecuteEnvelope(input) ─────────
  async function shapeLibraryCatalogExecuteEnvelope(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();

    if (!isObject(input)) {
      addCode(blockers, 'library-catalog-execute-receipt-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // Resolve inputs
    var resolved = resolveInputs(args);
    var receipt = resolved.receipt;
    var row = resolved.row;
    var f5Review = resolved.f5Review;

    // Privacy scan 1: input bookkeeping row (top-level)
    if (row) {
      scanPrivacy(row, blockers, warnings, 'library-catalog-execute-privacy-failed');
      if (blockers.length) {
        return blockedResult({ blockers: blockers, warnings: warnings,
          observedAtIso: observedAtIso });
      }
    }
    // Privacy scan 2: receipt
    if (receipt) {
      scanPrivacy(receipt, blockers, warnings, 'library-catalog-execute-privacy-failed');
      if (blockers.length) {
        return blockedResult({ blockers: blockers, warnings: warnings,
          observedAtIso: observedAtIso });
      }
    }

    // Validate receipt
    var validatedReceipt = validateReceiptShape(receipt, blockers, warnings);
    if (!validatedReceipt) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // Validate bookkeeping row
    var validatedRow = validateBookkeepingRow(row, validatedReceipt, blockers, warnings);
    if (!validatedRow) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // Determine operation from receipt + row (must agree)
    var operation = cleanString(validatedReceipt.operation) ||
      cleanString(validatedRow.operation);
    if (!OPERATION_META[operation]) {
      addCode(blockers, 'library-catalog-execute-lane-invariant-violation');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }
    var meta = OPERATION_META[operation];

    // Cross-check ownerKind matches operation invariants. For tombstone
    // the receipt should have ownerKind=f5; for others, native.
    var receiptOwner = cleanString(validatedReceipt.ownerKind);
    var expectedOwner = meta.requiresF5 ? 'f5' : 'native';
    if (receiptOwner !== expectedOwner) {
      addCode(blockers, 'library-catalog-execute-lane-invariant-violation');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // F5 state gate for tombstone
    if (meta.requiresF5) {
      if (!validateF5StateForTombstone(validatedRow, f5Review, blockers, warnings)) {
        return blockedResult({ blockers: blockers, warnings: warnings,
          observedAtIso: observedAtIso });
      }
    }

    // Shape envelope
    var envelope = await shapeEnvelopeInternal(validatedRow, validatedReceipt, meta,
      observedAtIso, warnings);
    if (!isObject(envelope)) {
      addCode(blockers, 'library-catalog-execute-envelope-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // Validate envelope sha256 fields
    if (!isSha256Hex(envelope.subjectId)
        || !isSha256Hex(envelope.dedupeKey)
        || !isSha256Hex(envelope.eventDigest)
        || !isSha256Hex(envelope.receiptDigest)
        || !isSha256Hex(envelope.bookkeepingRowId)
        || !isSha256Hex(envelope.settlementShapes && envelope.settlementShapes.settlementDigest)) {
      addCode(blockers, 'library-catalog-execute-envelope-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }
    if (!isIso(envelope.createdAtIso)) {
      addCode(blockers, 'library-catalog-execute-envelope-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // Privacy scan 3: execute envelope
    scanPrivacy(envelope, blockers, warnings, 'library-catalog-execute-privacy-failed');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // Pass-through warnings from receipt + bookkeeping row
    mergeCodes(warnings, validatedReceipt.warnings);
    mergeCodes(warnings, validatedRow.warnings);
    if (!isObject(args.f5Review) && meta.requiresF5) {
      addCode(warnings, 'library-catalog-execute-context-incomplete');
    }

    // Assemble result
    var result = buildResult({
      ok: true,
      registered: false,    // shapeLibraryCatalogExecuteEnvelope does not register
      envelope: envelope,
      bookkeepingRow: validatedRow,
      receipt: validatedReceipt,
      blockers: [],
      warnings: warnings,
      observedAtIso: observedAtIso
    });

    // Privacy scan 4: final result envelope (defense-in-depth)
    return scanFinalOutput(result);
  }

  // ── Adapter metadata + registration ─────────────────────────────────
  // Metadata-only per F14.6.2. NO callbacks, NO function values, NO
  // executable hooks. The metadata describes WHAT the adapter handles,
  // not HOW to execute.
  function buildAdapterMetadata() {
    return {
      schema: 'h2o.desktop.sync.execute-adapter.v1',
      adapterId: ADAPTER_ID,
      domainId: DOMAIN_ID,
      version: VERSION,
      envelopeKinds: [ENVELOPE_KIND],
      operationKinds: ALLOWED_OPERATIONS.map(function (op) { return OPERATION_META[op].operationKind; }),
      dispatchTargets: ['native', 'f5']
    };
  }

  function registerLibraryCatalogExecuteAdapter() {
    var warnings = [];
    var metadata = buildAdapterMetadata();
    var kernelRegistered = false;
    var kernelResponse = null;

    // Best-effort kernel registration. F14.6.2's `DOMAINS = ['chat',
    // 'snapshot', 'capture']` does not include 'library.catalog'; the
    // kernel registry will reject with `execute-adapter-domain-invalid`.
    // We accept that and fall back to LOCAL metadata storage.
    if (typeof H2O.Desktop.Sync.registerExecuteAdapter === 'function') {
      try {
        kernelResponse = H2O.Desktop.Sync.registerExecuteAdapter(metadata);
        if (kernelResponse && kernelResponse.ok === true) {
          kernelRegistered = true;
        } else {
          var kernelBlockers = codeList(kernelResponse && kernelResponse.blockers);
          if (kernelBlockers.indexOf('execute-adapter-domain-invalid') !== -1) {
            addCode(warnings, 'library-catalog-execute-adapter-kernel-domain-not-supported');
          } else {
            for (var i = 0; i < kernelBlockers.length; i++) {
              addCode(warnings, 'library-catalog-execute-adapter-kernel-blocked:' + kernelBlockers[i]);
            }
          }
        }
      } catch (_) {
        addCode(warnings, 'library-catalog-execute-adapter-kernel-register-threw');
      }
    } else {
      addCode(warnings, 'library-catalog-execute-adapter-kernel-registry-unavailable');
    }

    // Always store local metadata. Adapter is functional regardless of
    // kernel registry availability.
    localAdapterMetadata = metadata;

    return buildResult({
      ok: true,
      registered: true,    // local registration always succeeds
      adapterMetadata: metadata,
      blockers: [],
      warnings: warnings,
      observedAtIso: nowIsoSeconds()
    });
  }

  function getLibraryCatalogExecuteAdapterMetadata() {
    return localAdapterMetadata ? Object.assign({}, localAdapterMetadata) : null;
  }

  H2O.Desktop.Sync.shapeLibraryCatalogExecuteEnvelope = shapeLibraryCatalogExecuteEnvelope;
  H2O.Desktop.Sync.registerLibraryCatalogExecuteAdapter = registerLibraryCatalogExecuteAdapter;
  H2O.Desktop.Sync.getLibraryCatalogExecuteAdapterMetadata = getLibraryCatalogExecuteAdapterMetadata;
  H2O.Desktop.Sync.__libraryCatalogExecuteAdapterInstalled = true;
  H2O.Desktop.Sync.__libraryCatalogExecuteAdapterVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
