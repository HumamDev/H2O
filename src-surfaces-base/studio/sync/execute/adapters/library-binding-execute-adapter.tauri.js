/* H2O Desktop Sync - F15.8.b library binding execute adapter
 *
 * Metadata-only execute adapter for the library.binding lane. Consumes a
 * F15.7.b binding bookkeeping result/row + its source F15.6.b receipt and
 * shapes a F14.6.2 execute-envelope ready for the F14.6 execute lane
 * (preflight gate → native broker → settlement writer).
 *
 * Per F15.0.0 §6.1 the library.binding lane has only Native owners. This
 * module's lane invariants ENFORCE that:
 *   - operation ∈ {bind, unbind}
 *   - canonicalBinding.bindingKind ∈ {chat-label, chat-tag, chat-category, tag-category}
 *   - ownerKind === 'native'
 *   - targetBroker === 'native'
 *   - receipt.sideEffectSummary.f5Touched === false
 *   - receipt MUST NOT carry any of: f5ReviewIngested, f5ReviewId,
 *     tombstoneF5Touched, f5Handoff, handoffRequest.f5Handoff
 *   - bookkeeping row MUST NOT carry the same f5* footprint
 * Any f5* footprint blocks with
 * library-binding-execute-lane-invariant-violation.
 *
 * Per F14.6.2 §safety-invariants this module is SHAPE/VALIDATE/REGISTER
 * metadata only. It does NOT:
 *   - store callbacks in the adapter registry
 *   - call Tauri Native (F14.6.6 native broker's job)
 *   - mutate F5 review queue (binding lane never touches F5)
 *   - write the publication ledger (F14.6.4 lifecycle module's job)
 *   - write the relay inbox/outbox (F14.6.5 relay broker's job)
 *   - advance watermarks (F14.6.8 settlement writer's job)
 *   - write consumed-ops (F14.6.8 settlement writer's job)
 *   - apply / execute (F14.6 broker chain + settlement writer's job)
 *   - mutate any SQLite storage (F15.8.f sentinel guards that exclusively)
 *   - write the chats.category_id materialized cache (F15.8.d cache
 *     refresh bridge does that, called by F15.8.c settlement writer)
 *
 * Chat-category materialized cache (F15.0.2 §2.2):
 *   For chat-category bindings, the envelope carries a declarative
 *   `requiresCategoryCacheRefresh: true` flag plus a
 *   `categoryCacheAction: 'set' | 'clear'` directive. The adapter does
 *   NOT write the cache itself; F15.8.d will pick up these flags from
 *   the envelope and dispatch the synchronous cache refresh via the
 *   F15.8.c settlement writer extension. The defense-in-depth forbidden-
 *   field list includes `category_id` / `chats.category_id` so those
 *   keys never appear in any envelope this adapter shapes.
 *
 * Public API:
 *   H2O.Desktop.Sync.shapeLibraryBindingExecuteEnvelope(input)       -> Promise<result>
 *   H2O.Desktop.Sync.registerLibraryBindingExecuteAdapter()          -> result
 *   H2O.Desktop.Sync.getLibraryBindingExecuteAdapterMetadata()       -> metadata | null
 *
 *   H2O.Desktop.Sync.__libraryBindingExecuteAdapterInstalled
 *   H2O.Desktop.Sync.__libraryBindingExecuteAdapterVersion
 *
 * Note on F14.6.2 DOMAINS list:
 *   F14.6.2's `DOMAINS = ['chat', 'snapshot', 'capture']` does not
 *   include `'library.binding'`. The kernel adapter registry rejects
 *   `execute-adapter-domain-invalid`. The adapter falls back to LOCAL
 *   metadata storage and surfaces a clear warning
 *   `library-binding-execute-adapter-kernel-domain-not-supported`. Same
 *   pattern as F15.8.a.
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
  if (H2O.Desktop.Sync.__libraryBindingExecuteAdapterInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f15.8.binding';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-binding-execute-adapter.v1';
  var ENVELOPE_SCHEMA = 'h2o.desktop.sync.execute-envelope.v1';
  var ADAPTER_ID = 'library-binding-execute-adapter';
  var DOMAIN_ID = 'library.binding';
  var SUBJECT_TYPE = 'library.binding';
  var PRIVACY_DOMAIN_TAG = 'library.binding';
  var ENVELOPE_KIND = 'proposal-receipt';
  var EXPECTED_RECEIPT_SCHEMA = 'h2o.desktop.sync.library-binding-apply-event-receipt.v1';
  var EXPECTED_RECEIPT_VERSION_PREFIX = '0.1.0-f15.6.binding';
  var EXPECTED_BOOKKEEPING_ROW_SCHEMA = 'h2o.desktop.sync.library-binding-bookkeeping-row.v1';
  var CHAT_CATEGORY_KIND = 'chat-category';
  var ALLOWED_OPERATIONS = ['bind', 'unbind'];
  var ALLOWED_BINDING_KINDS = ['chat-label', 'chat-tag', 'chat-category', 'tag-category'];
  var OWNER_KIND_NATIVE = 'native';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  // Same forbidden-field defense-in-depth list as F15.6.b / F15.7.b.
  // Includes `category_id` + `chats.category_id` so binding-lane cache
  // keys never appear in storage.
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

  // F5 footprint fields on receipts/rows — if ANY of these appear with a
  // non-null/non-false value, the lane invariant is violated. Binding
  // lane has no F5 path; an F5 footprint indicates either a tampered
  // envelope or a misrouted catalog input.
  var F5_FOOTPRINT_FIELDS = [
    'f5ReviewIngested', 'f5ReviewId',
    'tombstoneF5Touched', 'f5Touched',
    'f5Handoff'
  ];

  // Module-scoped local adapter metadata (used if kernel registry
  // rejects the library.binding domain). Never exposes callbacks.
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
  function scanPrivacy(target, blockers, warnings, blockerCode) {
    var blockerToAdd = cleanString(blockerCode) || 'library-binding-execute-privacy-failed';
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
        addCode(warnings, 'library-binding-execute-privacy-scan-threw');
      }
    } else {
      addCode(warnings, 'library-binding-execute-privacy-scan-unavailable');
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
    return { row: row, receipt: receipt };
  }

  // ── Receipt validation ──────────────────────────────────────────────
  function validateReceiptShape(receipt, blockers, warnings) {
    if (!isObject(receipt)) {
      addCode(blockers, 'library-binding-execute-receipt-not-ok');
      return null;
    }
    if (receipt.ok !== true) {
      mergeCodes(warnings, receipt.warnings);
      addCode(blockers, 'library-binding-execute-receipt-not-ok');
      return null;
    }
    if (cleanString(receipt.schema) !== EXPECTED_RECEIPT_SCHEMA) {
      addCode(blockers, 'library-binding-execute-receipt-schema-invalid');
      return null;
    }
    var version = cleanString(receipt.version);
    if (version.indexOf(EXPECTED_RECEIPT_VERSION_PREFIX) !== 0) {
      addCode(blockers, 'library-binding-execute-receipt-schema-invalid');
      return null;
    }
    if (!isSha256Hex(receipt.applyEventDigest) || !isSha256Hex(receipt.receiptDigest)) {
      addCode(blockers, 'library-binding-execute-receipt-schema-invalid');
      return null;
    }
    if (!isObject(receipt.applyEvent) || !isObject(receipt.receipt) || !isObject(receipt.auditMetadata)) {
      addCode(blockers, 'library-binding-execute-receipt-schema-invalid');
      return null;
    }
    var actorPeer = safeObject(receipt.actorPeer);
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)
        || !isSha256Hex(actorPeer.installIdHash)
        || !isSha256Hex(actorPeer.syncPeerIdHash)) {
      addCode(blockers, 'library-binding-execute-receipt-schema-invalid');
      return null;
    }
    if (!isSha256Hex(receipt.originAccountIdHash)) {
      addCode(blockers, 'library-binding-execute-receipt-schema-invalid');
      return null;
    }
    return receipt;
  }

  // Detect any F5 footprint on a target (receipt or row).
  function hasF5Footprint(target) {
    if (!isObject(target)) return null;
    for (var i = 0; i < F5_FOOTPRINT_FIELDS.length; i++) {
      var field = F5_FOOTPRINT_FIELDS[i];
      if (!Object.prototype.hasOwnProperty.call(target, field)) continue;
      var v = target[field];
      if (v === null || v === undefined || v === false || v === '') continue;
      return field;
    }
    var ses = safeObject(target.sideEffectSummary);
    if (ses.f5Touched === true) return 'sideEffectSummary.f5Touched';
    if (isObject(target.handoffRequest) && isObject(target.handoffRequest.f5Handoff)) {
      return 'handoffRequest.f5Handoff';
    }
    return null;
  }

  // ── Bookkeeping row validation ──────────────────────────────────────
  function validateBookkeepingRow(row, receipt, blockers, warnings) {
    if (!isObject(row)) {
      addCode(blockers, 'library-binding-execute-bookkeeping-row-missing');
      return null;
    }
    if (cleanString(row.schema) !== EXPECTED_BOOKKEEPING_ROW_SCHEMA) {
      addCode(blockers, 'library-binding-execute-bookkeeping-row-missing');
      return null;
    }
    if (cleanString(row.lane) !== DOMAIN_ID) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      return null;
    }
    if (!isSha256Hex(row.rowId) || !isSha256Hex(row.rowDigest)) {
      addCode(blockers, 'library-binding-execute-bookkeeping-row-missing');
      return null;
    }
    if (!isSha256Hex(row.applyEventDigest) || !isSha256Hex(row.receiptDigest)) {
      addCode(blockers, 'library-binding-execute-bookkeeping-row-missing');
      return null;
    }
    // Cross-check digests against the receipt.
    if (cleanLower(row.applyEventDigest) !== cleanLower(receipt.applyEventDigest)) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      return null;
    }
    if (cleanLower(row.receiptDigest) !== cleanLower(receipt.receiptDigest)) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      return null;
    }
    return row;
  }

  // ── Lane invariants ────────────────────────────────────────────────
  function validateLaneInvariants(receipt, row, blockers, warnings) {
    var operation = cleanString(receipt.operation);
    if (ALLOWED_OPERATIONS.indexOf(operation) === -1) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      return null;
    }
    if (cleanString(receipt.ownerKind) !== OWNER_KIND_NATIVE) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      return null;
    }
    if (cleanString(receipt.targetBroker) !== OWNER_KIND_NATIVE) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      return null;
    }
    // F5 footprint check on BOTH the receipt AND the bookkeeping row.
    var receiptF5 = hasF5Footprint(receipt);
    if (receiptF5) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      addCode(warnings, 'f5-footprint-detected:receipt.' + receiptF5);
      return null;
    }
    var rowF5 = hasF5Footprint(row);
    if (rowF5) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      addCode(warnings, 'f5-footprint-detected:row.' + rowF5);
      return null;
    }
    // bindingKind must be one of the four allowed kinds. Try multiple
    // sources: canonicalBinding (receipt) → row → applyEvent payload.
    var bindingKind = cleanString(safeObject(receipt.canonicalBinding).bindingKind)
      || cleanString(row.bindingKind)
      || cleanString(safeObject(safeObject(receipt.applyEvent).payload).bindingKind);
    if (ALLOWED_BINDING_KINDS.indexOf(bindingKind) === -1) {
      addCode(blockers, 'library-binding-execute-lane-invariant-violation');
      return null;
    }
    return { operation: operation, bindingKind: bindingKind };
  }

  // ── Envelope shaping ────────────────────────────────────────────────
  // Native command name convention: snake_case with binding kind. For
  // example, chat-label bind → h2o_library_binding_bind_chat_label_apply.
  function nativeCommandFor(operation, bindingKind) {
    var kindToken = bindingKind.replace(/-/g, '_');
    return 'h2o_library_binding_' + operation + '_' + kindToken + '_apply';
  }
  function flavorFor(operation, bindingKind) {
    return 'library-binding-' + operation + '-' + bindingKind;
  }
  function operationKindFor(operation) {
    return 'library-binding-' + operation + '-applied';
  }

  function buildDispatchProfile(operation, bindingKind) {
    return {
      requiresNative: true,
      requiresF5: false,
      requiresRelay: false,
      nativeCommand: nativeCommandFor(operation, bindingKind),
      // F14.6.2 validateDispatchProfile requires nativeIdempotent to be
      // a boolean. Binding lane operations are idempotent via the
      // F14.6.8 settlement writer's (eventDigest, dedupeKey) dedupe
      // + the canonical binding's (leftSubjectId, rightSubjectId)
      // composite key in the binding store.
      nativeIdempotent: true,
      retryPolicy: {
        maxAttempts: 3,
        minDelayMs: 1000,
        maxDelayMs: 30000,
        backoffKind: 'exponential'
      }
    };
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

  // Endpoint sha256 hashes from canonical binding (preferred) →
  // expectedTargetState → row → applyEvent payload. Never raw IDs.
  function resolveEndpoints(receipt, row) {
    var canonical = safeObject(receipt.canonicalBinding);
    var target = safeObject(receipt.expectedTargetState);
    var current = safeObject(receipt.expectedCurrentState);
    var payload = safeObject(safeObject(receipt.applyEvent).payload);
    return {
      leftSubjectId: cleanLower(canonical.leftSubjectId)
        || cleanLower(target.leftSubjectId)
        || cleanLower(current.leftSubjectId)
        || cleanLower(row.leftSubjectId)
        || cleanLower(payload.leftSubjectId),
      rightSubjectId: cleanLower(canonical.rightSubjectId)
        || cleanLower(target.rightSubjectId)
        || cleanLower(current.rightSubjectId)
        || cleanLower(row.rightSubjectId)
        || cleanLower(payload.rightSubjectId),
      leftSubjectType: cleanString(canonical.leftSubjectType)
        || cleanString(row.leftSubjectType)
        || cleanString(payload.leftSubjectType),
      rightSubjectType: cleanString(canonical.rightSubjectType)
        || cleanString(row.rightSubjectType)
        || cleanString(payload.rightSubjectType)
    };
  }

  function buildPayloadShapes(row, receipt, invariants, endpoints) {
    var receiptObj = safeObject(receipt.receipt);
    var payload = safeObject(safeObject(receipt.applyEvent).payload);
    var canonical = safeObject(receipt.canonicalBinding);
    return {
      proposalReceipt: {
        schema: 'h2o.desktop.sync.library-binding-execute-proposal-receipt.v1',
        domainId: DOMAIN_ID,
        operationKind: operationKindFor(invariants.operation),
        flavor: flavorFor(invariants.operation, invariants.bindingKind),
        receiptDigest: cleanLower(receipt.receiptDigest),
        applyEventDigest: cleanLower(receipt.applyEventDigest),
        bookkeepingRowId: cleanLower(row.rowId),
        bookkeepingRowDigest: cleanLower(row.rowDigest),
        // Canonical binding snapshot is hash-only.
        canonicalSubjectId: cleanLower(canonical.subjectId || receipt.subjectId),
        canonicalRevisionHash: cleanLower(canonical.revisionHash || payload.postStateHash),
        canonicalBindingKind: invariants.bindingKind,
        canonicalSourceTagHash: cleanLower(canonical.sourceTagHash),
        canonicalSchemaVersion: cleanString(canonical.schemaVersion),
        // Endpoint sha256s only.
        leftSubjectId: endpoints.leftSubjectId,
        rightSubjectId: endpoints.rightSubjectId,
        leftSubjectType: endpoints.leftSubjectType,
        rightSubjectType: endpoints.rightSubjectType,
        // Binding transition is named-state only.
        bindingFromState: cleanString(safeObject(payload.bindingTransition).fromState),
        bindingToState: cleanString(safeObject(payload.bindingTransition).toState),
        predicateVersion: cleanString(receiptObj.predicateVersion)
      }
    };
  }

  // For chat-category bindings the envelope carries a declarative
  // cache-refresh directive picked up by F15.8.d.
  // - bind   → categoryCacheAction: 'set'
  // - unbind → categoryCacheAction: 'clear'
  // The adapter itself NEVER writes the cache; it only sets the
  // metadata flags.
  function chatCategoryCacheMetadata(invariants) {
    if (invariants.bindingKind !== CHAT_CATEGORY_KIND) {
      return { requiresCategoryCacheRefresh: false, categoryCacheAction: null };
    }
    return {
      requiresCategoryCacheRefresh: true,
      categoryCacheAction: invariants.operation === 'bind' ? 'set' : 'clear'
    };
  }

  function buildSettlementShapes(row, receipt, invariants, endpoints, settlementDigest) {
    var receiptObj = safeObject(receipt.receipt);
    var payload = safeObject(safeObject(receipt.applyEvent).payload);
    var postHash = cleanLower(payload.postStateHash) || cleanLower(receiptObj.postStateHash);
    var cache = chatCategoryCacheMetadata(invariants);
    return {
      revisionHash: postHash,
      postStateHash: postHash,
      settlementDigest: settlementDigest,
      receiptDigest: cleanLower(receipt.receiptDigest),
      bookkeepingRowId: cleanLower(row.rowId),
      expectedCurrentState: isObject(receipt.expectedCurrentState) ? receipt.expectedCurrentState : null,
      expectedTargetState: isObject(receipt.expectedTargetState) ? receipt.expectedTargetState : null,
      bindingKind: invariants.bindingKind,
      leftSubjectId: endpoints.leftSubjectId,
      rightSubjectId: endpoints.rightSubjectId,
      leftSubjectType: endpoints.leftSubjectType,
      rightSubjectType: endpoints.rightSubjectType,
      requiresCategoryCacheRefresh: cache.requiresCategoryCacheRefresh,
      categoryCacheAction: cache.categoryCacheAction
    };
  }

  async function shapeEnvelopeInternal(row, receipt, invariants, observedAtIso, warnings) {
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
      operationKind: operationKindFor(invariants.operation)
    });
    if (!isSha256Hex(settlementDigest)) {
      addCode(warnings, 'library-binding-execute-settlement-digest-derivation-failed');
      return null;
    }
    var endpoints = resolveEndpoints(receipt, row);
    var dispatchProfile = buildDispatchProfile(invariants.operation, invariants.bindingKind);
    var payloadShapes = buildPayloadShapes(row, receipt, invariants, endpoints);
    var settlementShapes = buildSettlementShapes(row, receipt, invariants, endpoints, settlementDigest);
    var actorPeer = safeObject(receipt.actorPeer);
    var envelope = {
      schema: ENVELOPE_SCHEMA,
      version: VERSION,
      envelopeKind: ENVELOPE_KIND,
      flavor: flavorFor(invariants.operation, invariants.bindingKind),
      domainId: DOMAIN_ID,
      operationKind: operationKindFor(invariants.operation),
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
    scanPrivacy(result, blockers, warnings, 'library-binding-execute-privacy-failed');
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

  // ── Main entry — shapeLibraryBindingExecuteEnvelope(input) ─────────
  async function shapeLibraryBindingExecuteEnvelope(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();

    if (!isObject(input)) {
      addCode(blockers, 'library-binding-execute-receipt-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    var resolved = resolveInputs(args);
    var receipt = resolved.receipt;
    var row = resolved.row;

    // Privacy scan 1: input bookkeeping row (top-level)
    if (row) {
      scanPrivacy(row, blockers, warnings, 'library-binding-execute-privacy-failed');
      if (blockers.length) {
        return blockedResult({ blockers: blockers, warnings: warnings,
          observedAtIso: observedAtIso });
      }
    }
    // Privacy scan 2: receipt
    if (receipt) {
      scanPrivacy(receipt, blockers, warnings, 'library-binding-execute-privacy-failed');
      if (blockers.length) {
        return blockedResult({ blockers: blockers, warnings: warnings,
          observedAtIso: observedAtIso });
      }
    }

    var validatedReceipt = validateReceiptShape(receipt, blockers, warnings);
    if (!validatedReceipt) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    var validatedRow = validateBookkeepingRow(row, validatedReceipt, blockers, warnings);
    if (!validatedRow) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    var invariants = validateLaneInvariants(validatedReceipt, validatedRow, blockers, warnings);
    if (!invariants) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    var envelope = await shapeEnvelopeInternal(validatedRow, validatedReceipt, invariants,
      observedAtIso, warnings);
    if (!isObject(envelope)) {
      addCode(blockers, 'library-binding-execute-envelope-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    if (!isSha256Hex(envelope.subjectId)
        || !isSha256Hex(envelope.dedupeKey)
        || !isSha256Hex(envelope.eventDigest)
        || !isSha256Hex(envelope.receiptDigest)
        || !isSha256Hex(envelope.bookkeepingRowId)
        || !isSha256Hex(envelope.settlementShapes && envelope.settlementShapes.settlementDigest)) {
      addCode(blockers, 'library-binding-execute-envelope-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }
    if (!isIso(envelope.createdAtIso)) {
      addCode(blockers, 'library-binding-execute-envelope-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }
    // Endpoint sha256 validation
    var ss = safeObject(envelope.settlementShapes);
    if (!isSha256Hex(ss.leftSubjectId) || !isSha256Hex(ss.rightSubjectId)) {
      addCode(blockers, 'library-binding-execute-envelope-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // Privacy scan 3: execute envelope
    scanPrivacy(envelope, blockers, warnings, 'library-binding-execute-privacy-failed');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        observedAtIso: observedAtIso });
    }

    // Pass-through warnings from receipt + bookkeeping row
    mergeCodes(warnings, validatedReceipt.warnings);
    mergeCodes(warnings, validatedRow.warnings);

    var result = buildResult({
      ok: true,
      registered: false,
      envelope: envelope,
      bookkeepingRow: validatedRow,
      receipt: validatedReceipt,
      blockers: [],
      warnings: warnings,
      observedAtIso: observedAtIso
    });

    // Privacy scan 4: final result envelope
    return scanFinalOutput(result);
  }

  // ── Adapter metadata + registration ─────────────────────────────────
  function buildAdapterMetadata() {
    // operationKinds: union over (operation × bindingKind) flavors,
    // expressed as the F14.6.2 operationKind string per operation.
    return {
      schema: 'h2o.desktop.sync.execute-adapter.v1',
      adapterId: ADAPTER_ID,
      domainId: DOMAIN_ID,
      version: VERSION,
      envelopeKinds: [ENVELOPE_KIND],
      operationKinds: ALLOWED_OPERATIONS.map(operationKindFor),
      dispatchTargets: ['native']
    };
  }

  function registerLibraryBindingExecuteAdapter() {
    var warnings = [];
    var metadata = buildAdapterMetadata();
    var kernelRegistered = false;
    var kernelResponse = null;

    if (typeof H2O.Desktop.Sync.registerExecuteAdapter === 'function') {
      try {
        kernelResponse = H2O.Desktop.Sync.registerExecuteAdapter(metadata);
        if (kernelResponse && kernelResponse.ok === true) {
          kernelRegistered = true;
        } else {
          var kernelBlockers = codeList(kernelResponse && kernelResponse.blockers);
          if (kernelBlockers.indexOf('execute-adapter-domain-invalid') !== -1) {
            addCode(warnings, 'library-binding-execute-adapter-kernel-domain-not-supported');
          } else {
            for (var i = 0; i < kernelBlockers.length; i++) {
              addCode(warnings, 'library-binding-execute-adapter-kernel-blocked:' + kernelBlockers[i]);
            }
          }
        }
      } catch (_) {
        addCode(warnings, 'library-binding-execute-adapter-kernel-register-threw');
      }
    } else {
      addCode(warnings, 'library-binding-execute-adapter-kernel-registry-unavailable');
    }

    localAdapterMetadata = metadata;

    return buildResult({
      ok: true,
      registered: true,
      adapterMetadata: metadata,
      blockers: [],
      warnings: warnings,
      observedAtIso: nowIsoSeconds()
    });
  }

  function getLibraryBindingExecuteAdapterMetadata() {
    return localAdapterMetadata ? Object.assign({}, localAdapterMetadata) : null;
  }

  H2O.Desktop.Sync.shapeLibraryBindingExecuteEnvelope = shapeLibraryBindingExecuteEnvelope;
  H2O.Desktop.Sync.registerLibraryBindingExecuteAdapter = registerLibraryBindingExecuteAdapter;
  H2O.Desktop.Sync.getLibraryBindingExecuteAdapterMetadata = getLibraryBindingExecuteAdapterMetadata;
  H2O.Desktop.Sync.__libraryBindingExecuteAdapterInstalled = true;
  H2O.Desktop.Sync.__libraryBindingExecuteAdapterVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
