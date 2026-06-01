/* H2O Desktop Sync - F15.7.b library binding bookkeeping
 *
 * Append-only Studio-local audit ledger for F15.6.b library binding
 * apply-event receipts. Ingests a fully-formed binding receipt envelope
 * (bind or unbind across the four binding kinds: chat-label, chat-tag,
 * chat-category, tag-category), assembles a deterministic ledger row,
 * and appends it to a chrome.storage.local key with idempotent-by-rowId
 * semantics.
 *
 * Per F15.0.0 §6.1 the library.binding lane has only Native owners. This
 * module's lane invariants ENFORCE that:
 *   - ownerKind must be 'native'
 *   - targetBroker must be 'native'
 *   - receipt.sideEffectSummary.f5Touched must be false
 *   - receipt must NOT carry f5ReviewIngested / f5ReviewId / tombstoneF5Touched
 * Any f5* footprint blocks with library-binding-bookkeeping-lane-invariant-violation.
 *
 * Materialized cache (chats.category_id) per F15.0.2 §2.2:
 *   This module does NOT write the chats.category_id materialized read
 *   cache. The defense-in-depth forbidden-field list includes
 *   `category_id` / `chats.category_id` so those keys never appear in
 *   any audit row or in chrome.storage.
 *
 *   For chat-category bindings (i.e. canonicalBinding.bindingKind ===
 *   'chat-category'), the row carries a DECLARATIVE
 *   `chatsCategoryIdRefreshPending: true` boolean and the upstream
 *   `chats-category-id-refresh-pending` warning is preserved in
 *   `row.warnings`. This makes the cache dependency explicit in the
 *   audit trail without ever writing the cache itself; execute-
 *   settlement-writer remains the exclusive cache writer.
 *
 * This module is a LOCAL audit append. It does NOT:
 *   - call Native or apply
 *   - call ingestF5Review (binding lane has no F5 path)
 *   - write the publication ledger
 *   - write the relay inbox/outbox
 *   - write the watermark ledger (execute-settlement-writer's domain)
 *   - write the consumed-op ledger (execute-settlement-writer's domain)
 *   - write the execute journal (execute-lane's domain)
 *   - write the chats.category_id materialized cache (settlement-writer's domain)
 *   - mutate Labels/Categories/Tags or any SQLite table
 *
 * Idempotency:
 *   rowId is the sha256 over (subjectId, applyEventDigest, dedupeKey,
 *   receiptDigest, actorPeer.syncPeerIdHash). Same receipt + same peer
 *   → same rowId. A duplicate `record*` call returns
 *   `{ok:true, recorded:false, alreadyPresent:true, row:<existing>}`
 *   with no storage write. A different peer recording the same envelope
 *   gets a distinct rowId AND a `library-binding-bookkeeping-cross-peer-
 *   dedupe-detected` warning.
 *
 * Side-effect contract:
 *   The 8 standard cross-platform sideEffectSummary flags
 *   (publicationTouched, relayTouched, outboxTouched, nativeCalled,
 *   f5Touched, watermarkWritten, consumedOperationWritten, applyExecuted)
 *   stay FALSE per F15.0.0 §10.3. A 9th lane-scoped flag
 *   `bookkeepingLedgerWritten` flips true ONLY when a new row was
 *   appended; false on duplicate / blocker / read-failure.
 *
 * Public API:
 *   H2O.Desktop.Sync.recordLibraryBindingBookkeeping(input)     -> Promise<result>
 *   H2O.Desktop.Sync.listLibraryBindingBookkeepingLedger()      -> Promise<list-result>
 *
 *   H2O.Desktop.Sync.__libraryBindingBookkeepingInstalled
 *   H2O.Desktop.Sync.__libraryBindingBookkeepingVersion
 *
 * No clear/delete API is exported. Append-only is enforced by absence
 * of a public deletion path. Test harnesses clear via direct
 * chrome.storage.local.remove(STORAGE_KEY).
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
  if (H2O.Desktop.Sync.__libraryBindingBookkeepingInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f15.7.binding';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-binding-bookkeeping.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.library-binding-bookkeeping-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.library-binding-bookkeeping-row.v1';
  var STORAGE_KEY = 'h2o:sync:library-binding-bookkeeping:v1';
  var LANE = 'library.binding';
  var SUBJECT_TYPE = 'library.binding';
  var PRIVACY_DOMAIN_TAG = 'library.binding';
  var EXPECTED_RECEIPT_SCHEMA = 'h2o.desktop.sync.library-binding-apply-event-receipt.v1';
  var EXPECTED_RECEIPT_VERSION_PREFIX = '0.1.0-f15.6.binding';
  var OWNER_KIND_NATIVE = 'native';
  var ALLOWED_OPERATIONS = ['bind', 'unbind'];
  var ALLOWED_BINDING_KINDS = ['chat-label', 'chat-tag', 'chat-category', 'tag-category'];
  var CHAT_CATEGORY_KIND = 'chat-category';
  var CHATS_CATEGORY_REFRESH_PENDING_WARNING = 'chats-category-id-refresh-pending';
  var MAX_RELATED_SUBJECTS = 50;
  var BOOKKEEPING_SURFACE = 'desktop-studio';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  // Same forbidden-field defense-in-depth list as F15.6.b — identifiers
  // cross both the envelope boundary AND the local storage boundary
  // only as sha256 hashes. Includes `category_id` / `chats.category_id`
  // so binding-lane cache keys never appear in storage.
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

  // F5 footprint fields on receipts — if ANY of these appear on the
  // input receipt with a non-null/non-false value, the lane invariant
  // is violated. Binding lane has no F5 path; an F5 footprint indicates
  // either a tampered receipt or a misrouted catalog receipt.
  var F5_FOOTPRINT_FIELDS = [
    'f5ReviewIngested', 'f5ReviewId',
    'tombstoneF5Touched', 'f5Touched',
    'f5Handoff'
  ];

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
    var blockerToAdd = cleanString(blockerCode) || 'library-binding-bookkeeping-receipt-privacy-failed';
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
        addCode(warnings, 'library-binding-bookkeeping-privacy-scan-threw');
      }
    } else {
      addCode(warnings, 'library-binding-bookkeeping-privacy-scan-unavailable');
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

  // ── chrome.storage.local helpers ────────────────────────────────────
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

  // ── Ledger normalization ────────────────────────────────────────────
  function emptyLedger() {
    return {
      schema: LEDGER_SCHEMA,
      version: VERSION,
      rows: [],
      rowsCount: 0,
      ledgerDigest: '',
      observedAtIso: ''
    };
  }
  function parseLedger(raw) {
    if (raw === null || raw === undefined) return { ok: true, ledger: emptyLedger() };
    if (!isObject(raw)) return { ok: false, malformed: true };
    if (raw.schema !== LEDGER_SCHEMA) return { ok: false, malformed: true };
    if (!Array.isArray(raw.rows)) return { ok: false, malformed: true };
    return {
      ok: true,
      ledger: {
        schema: LEDGER_SCHEMA,
        version: cleanString(raw.version) || VERSION,
        rows: raw.rows.slice(),
        rowsCount: raw.rows.length,
        ledgerDigest: cleanLower(raw.ledgerDigest),
        observedAtIso: cleanString(raw.observedAtIso)
      }
    };
  }
  async function loadLedger(blockers, warnings) {
    var raw;
    try {
      raw = await storageGet(STORAGE_KEY);
    } catch (_) {
      addCode(blockers, 'library-binding-bookkeeping-ledger-read-failed');
      return null;
    }
    var parsed = parseLedger(raw);
    if (!parsed.ok) {
      addCode(blockers, 'library-binding-bookkeeping-ledger-malformed');
      return null;
    }
    return parsed.ledger;
  }
  async function persistLedger(ledger, blockers) {
    try {
      await storageSet(STORAGE_KEY, ledger);
      return true;
    } catch (_) {
      addCode(blockers, 'library-binding-bookkeeping-ledger-write-failed');
      return false;
    }
  }

  // ── relatedSubjects digesting (F15.0.1 §6.5) ─────────────────────────
  function severityRank(s) {
    return s === 'blocker' ? 0 : s === 'warning' ? 1 : 2;
  }
  function truncateRelatedSubjects(related, warnings) {
    var arr = asArray(related);
    if (!arr.length) return { entries: [], count: 0, truncated: false };
    if (arr.length <= MAX_RELATED_SUBJECTS) {
      return { entries: arr.slice(), count: arr.length, truncated: false };
    }
    var sorted = arr.slice().sort(function (a, b) {
      var sa = severityRank((a && a.severity) || 'info');
      var sb = severityRank((b && b.severity) || 'info');
      if (sa !== sb) return sa - sb;
      var ta = Date.parse((a && a.observedAtIso) || '') || 0;
      var tb = Date.parse((b && b.observedAtIso) || '') || 0;
      return tb - ta;
    });
    addCode(warnings, 'related-subjects-truncated');
    return {
      entries: sorted.slice(0, MAX_RELATED_SUBJECTS),
      count: MAX_RELATED_SUBJECTS,
      truncated: true
    };
  }

  // ── Receipt validation ──────────────────────────────────────────────
  function validateReceiptShape(receipt, blockers, warnings) {
    if (!isObject(receipt)) {
      addCode(blockers, 'library-binding-bookkeeping-receipt-not-ok');
      return null;
    }
    if (receipt.ok !== true) {
      mergeCodes(warnings, receipt.warnings);
      addCode(blockers, 'library-binding-bookkeeping-receipt-not-ok');
      return null;
    }
    if (cleanString(receipt.schema) !== EXPECTED_RECEIPT_SCHEMA) {
      addCode(blockers, 'library-binding-bookkeeping-receipt-schema-invalid');
      return null;
    }
    var version = cleanString(receipt.version);
    if (version.indexOf(EXPECTED_RECEIPT_VERSION_PREFIX) !== 0) {
      addCode(blockers, 'library-binding-bookkeeping-receipt-version-unsupported');
      return null;
    }
    if (!isSha256Hex(receipt.applyEventDigest) || !isSha256Hex(receipt.receiptDigest)) {
      addCode(blockers, 'library-binding-bookkeeping-receipt-digest-invalid');
      return null;
    }
    if (!isObject(receipt.applyEvent) || !isObject(receipt.receipt) || !isObject(receipt.auditMetadata)) {
      addCode(blockers, 'library-binding-bookkeeping-receipt-shape-invalid');
      return null;
    }
    var actorPeer = safeObject(receipt.actorPeer);
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)
        || !isSha256Hex(actorPeer.installIdHash)
        || !isSha256Hex(actorPeer.syncPeerIdHash)) {
      addCode(blockers, 'library-binding-bookkeeping-actor-peer-invalid');
      return null;
    }
    if (!isSha256Hex(receipt.originAccountIdHash)) {
      addCode(blockers, 'library-binding-bookkeeping-origin-account-id-hash-invalid');
      return null;
    }
    return receipt;
  }

  // Detect any F5 footprint on the input receipt. Binding lane has no
  // F5 path; an F5 footprint indicates either a tampered receipt or a
  // misrouted catalog receipt. Either way, lane invariant is violated.
  function hasF5Footprint(receipt) {
    for (var i = 0; i < F5_FOOTPRINT_FIELDS.length; i++) {
      var field = F5_FOOTPRINT_FIELDS[i];
      if (!Object.prototype.hasOwnProperty.call(receipt, field)) continue;
      var v = receipt[field];
      if (v === null || v === undefined || v === false || v === '') continue;
      return field;
    }
    var ses = safeObject(receipt.sideEffectSummary);
    if (ses.f5Touched === true) return 'sideEffectSummary.f5Touched';
    if (isObject(receipt.handoffRequest) && isObject(receipt.handoffRequest.f5Handoff)) {
      return 'handoffRequest.f5Handoff';
    }
    return null;
  }

  function validateLaneInvariants(receipt, blockers, warnings) {
    var operation = cleanString(receipt.operation);
    if (ALLOWED_OPERATIONS.indexOf(operation) === -1) {
      addCode(blockers, 'library-binding-bookkeeping-lane-invariant-violation');
      return false;
    }
    if (cleanString(receipt.ownerKind) !== OWNER_KIND_NATIVE) {
      addCode(blockers, 'library-binding-bookkeeping-lane-invariant-violation');
      return false;
    }
    if (cleanString(receipt.targetBroker) !== OWNER_KIND_NATIVE) {
      addCode(blockers, 'library-binding-bookkeeping-lane-invariant-violation');
      return false;
    }
    var footprint = hasF5Footprint(receipt);
    if (footprint) {
      addCode(blockers, 'library-binding-bookkeeping-lane-invariant-violation');
      addCode(warnings, 'f5-footprint-detected:' + footprint);
      return false;
    }
    return true;
  }

  // ── Row assembly ────────────────────────────────────────────────────
  async function computeRowId(receipt, actorPeer) {
    return await sha256Hex(canonicalJson({
      schema: ROW_SCHEMA,
      lane: LANE,
      subjectId: cleanLower(receipt.subjectId),
      applyEventDigest: cleanLower(receipt.applyEventDigest),
      dedupeKey: cleanLower(receipt.dedupeKey),
      receiptDigest: cleanLower(receipt.receiptDigest),
      actorPeerSyncPeerIdHash: cleanLower(actorPeer.syncPeerIdHash)
    }));
  }
  function isChatCategoryBinding(receipt) {
    var canonical = safeObject(receipt.canonicalBinding);
    var kind = cleanString(canonical.bindingKind);
    if (!kind) {
      // Fallback: look in receipt payload / expectedTargetState
      var target = safeObject(receipt.expectedTargetState);
      kind = cleanString(target.bindingKind);
    }
    if (!kind) {
      var applyEvent = safeObject(receipt.applyEvent);
      var payload = safeObject(applyEvent.payload);
      kind = cleanString(payload.bindingKind);
    }
    return kind === CHAT_CATEGORY_KIND;
  }
  async function assembleRow(receipt, rowId, relatedDigest, relatedCount, relatedTruncated,
                              receiptWarnings, recordedAtIso) {
    var receiptObj = safeObject(receipt.receipt);
    var applyEventObj = safeObject(receipt.applyEvent);
    var auditMetadata = safeObject(receipt.auditMetadata);
    var actorPeer = safeObject(receipt.actorPeer);
    var canonicalBinding = safeObject(receipt.canonicalBinding);
    var payload = safeObject(applyEventObj.payload);
    var operation = cleanString(receipt.operation);

    // Binding-specific fields
    var bindingKind = cleanString(canonicalBinding.bindingKind) || cleanString(payload.bindingKind);
    var leftSubjectId = cleanLower(canonicalBinding.leftSubjectId) || cleanLower(payload.leftSubjectId);
    var rightSubjectId = cleanLower(canonicalBinding.rightSubjectId) || cleanLower(payload.rightSubjectId);
    var leftSubjectType = cleanString(canonicalBinding.leftSubjectType) || cleanString(payload.leftSubjectType);
    var rightSubjectType = cleanString(canonicalBinding.rightSubjectType) || cleanString(payload.rightSubjectType);
    var bindingTransition = isObject(payload.bindingTransition) ? {
      fromState: cleanString(payload.bindingTransition.fromState),
      toState: cleanString(payload.bindingTransition.toState)
    } : isObject(receiptObj.bindingTransition) ? {
      fromState: cleanString(receiptObj.bindingTransition.fromState),
      toState: cleanString(receiptObj.bindingTransition.toState)
    } : { fromState: '', toState: '' };
    var chatsCategoryRefreshPending = bindingKind === CHAT_CATEGORY_KIND;

    // Preserve the chat-category refresh warning from receipt warnings
    // so the audit row records the dependency declaratively. We also
    // declaratively mirror it on `row.chatsCategoryIdRefreshPending`.
    var rowWarnings = codeList(receiptWarnings || receipt.warnings);
    if (chatsCategoryRefreshPending && rowWarnings.indexOf(CHATS_CATEGORY_REFRESH_PENDING_WARNING) === -1) {
      addCode(rowWarnings, CHATS_CATEGORY_REFRESH_PENDING_WARNING);
    }

    var row = {
      schema: ROW_SCHEMA,
      version: VERSION,
      rowId: rowId,
      rowDigest: '',
      recordedAtIso: recordedAtIso,
      bookkeepingWriterSurface: BOOKKEEPING_SURFACE,
      bookkeepingVersion: VERSION,
      lane: LANE,

      // Subject identity
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(receipt.subjectId),
      lineageId: cleanLower(receipt.lineageId),
      dedupeKey: cleanLower(receipt.dedupeKey),
      operationId: cleanString(receipt.operationId),

      // Operation
      operation: operation,
      operationIntent: cleanString(receipt.operationIntent),
      receiptKind: cleanString(receiptObj.receiptKind),
      applyOperation: cleanString(applyEventObj.operation),
      ownerKind: cleanString(receipt.ownerKind),
      targetBroker: cleanString(receipt.targetBroker),
      predicateVersion: cleanString(receiptObj.predicateVersion) || cleanString(auditMetadata.predicateVersion),
      policyVersion: cleanString(auditMetadata.policyVersion),
      capabilityUsed: cleanString(applyEventObj.capabilityUsed),
      capabilitySnapshotHash: cleanLower(applyEventObj.capabilitySnapshotHash),

      // Digests / hashes
      applyEventDigest: cleanLower(receipt.applyEventDigest),
      receiptDigest: cleanLower(receipt.receiptDigest),
      eventDigest: cleanLower(receipt.applyEventDigest),
      payloadHash: cleanLower(applyEventObj.payloadHash),
      baseHash: cleanLower(safeObject(receiptObj).preStateHash),
      targetHash: cleanLower(safeObject(receiptObj).postStateHash),
      revisionHash: cleanLower(safeObject(receiptObj).postStateHash),

      // State (objects, never stringified)
      expectedCurrentState: isObject(receipt.expectedCurrentState) ? receipt.expectedCurrentState : null,
      expectedTargetState: isObject(receipt.expectedTargetState) ? receipt.expectedTargetState : null,

      // Origin / actor
      originAccountIdHash: cleanLower(receipt.originAccountIdHash),
      actorPeer: {
        physicalDeviceIdHash: cleanLower(actorPeer.physicalDeviceIdHash),
        installIdHash: cleanLower(actorPeer.installIdHash),
        syncPeerIdHash: cleanLower(actorPeer.syncPeerIdHash),
        surfaceKind: cleanString(actorPeer.surfaceKind) || 'desktop-tauri'
      },
      sourcePlatform: {
        platformId: BOOKKEEPING_SURFACE,
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: {
          physicalDeviceIdHash: cleanLower(actorPeer.physicalDeviceIdHash),
          installIdHash: cleanLower(actorPeer.installIdHash),
          syncPeerIdHash: cleanLower(actorPeer.syncPeerIdHash),
          surfaceKind: cleanString(actorPeer.surfaceKind) || 'desktop-tauri'
        }
      },

      // Audit
      auditId: cleanString(auditMetadata.auditId),
      auditMaintenanceId: cleanString(auditMetadata.auditMaintenanceId || auditMetadata.auditId),
      transactionId: cleanString(auditMetadata.transactionId),
      auditAtIso: cleanString(applyEventObj.createdAt) || cleanString(auditMetadata.createdAtIso),
      auditResult: cleanString(receiptObj.auditResult) || 'preview-only',

      // Apply envelope
      applyEventId: cleanString(applyEventObj.id),
      applyEventAtIso: cleanString(applyEventObj.createdAt),

      // Kernel-shaped previews
      watermarkPreview: isObject(receipt.watermarkPreview) ? receipt.watermarkPreview : null,
      consumedOperationPreview: isObject(receipt.consumedOperationPreview) ? receipt.consumedOperationPreview : null,

      // relatedSubjects (digest only — never raw)
      relatedSubjectsDigest: cleanLower(relatedDigest),
      relatedSubjectsCount: relatedCount,
      relatedSubjectsTruncated: relatedTruncated === true,

      // Binding-only fields
      bindingKind: bindingKind,
      leftSubjectId: leftSubjectId,
      rightSubjectId: rightSubjectId,
      leftSubjectType: leftSubjectType,
      rightSubjectType: rightSubjectType,
      bindingTransition: bindingTransition,
      // Declarative mirror of the chat-category materialized cache
      // dependency. NEVER carries the actual `category_id` value or any
      // raw cache key — this is a boolean flag plus a warning code.
      // The actual cache refresh remains execute-settlement-writer's
      // exclusive job per F15.0.2 §2.2.
      chatsCategoryIdRefreshPending: chatsCategoryRefreshPending,

      // Validation summary — receipt's validationSummary plus a
      // bookkeeping-side echo that this row's shape was assembled
      // successfully.
      validationSummary: Object.assign({}, safeObject(receipt.validationSummary), {
        bookkeepingShape: true
      }),

      // Pass-through warnings from receipt (deduped via codeList).
      // For chat-category bindings, the chats-category-id-refresh-pending
      // warning is preserved here.
      warnings: rowWarnings
    };

    // Compute rowDigest = sha256(canonicalJson(row \ rowDigest))
    var rowForDigest = Object.assign({}, row);
    delete rowForDigest.rowDigest;
    row.rowDigest = await sha256Hex(canonicalJson(rowForDigest));
    return row;
  }

  // ── Side-effect summary ─────────────────────────────────────────────
  function sideEffectSummary(bookkeepingLedgerWritten) {
    return {
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      applyExecuted: false,
      bookkeepingLedgerWritten: bookkeepingLedgerWritten === true
    };
  }

  // ── Result envelope assembly ────────────────────────────────────────
  function buildResult(opts) {
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      recorded: opts.recorded === true,
      alreadyPresent: opts.alreadyPresent === true,
      row: opts.row || null,
      rowId: cleanLower(opts.rowId) || null,
      rowDigest: cleanLower(opts.rowDigest) || null,
      ledger: opts.ledger || null,
      ledgerDigest: cleanLower(opts.ledgerDigest) || null,
      receipt: opts.receipt || null,
      receiptDigest: cleanLower(opts.receiptDigest) || null,
      applyEventDigest: cleanLower(opts.applyEventDigest) || null,
      validationSummary: opts.validationSummary || {},
      blockers: codeList(opts.blockers),
      warnings: codeList(opts.warnings),
      sideEffectSummary: sideEffectSummary(opts.bookkeepingLedgerWritten),
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
    opts.bookkeepingLedgerWritten = false;
    return buildResult(opts);
  }
  function scanFinalOutput(result) {
    var blockers = [];
    var warnings = result.warnings ? result.warnings.slice() : [];
    scanPrivacy(result, blockers, warnings, 'library-binding-bookkeeping-output-privacy-failed');
    if (!blockers.length) return result;
    var summary = Object.assign({}, safeObject(result.validationSummary), {
      outputPrivacySafe: false
    });
    return blockedResult({
      validationSummary: summary,
      blockers: codeList(blockers.concat(result.blockers || [])),
      warnings: codeList(warnings),
      observedAtIso: result.observedAtIso
    });
  }

  // ── Main entry — recordLibraryBindingBookkeeping(input) ─────────────
  async function recordLibraryBindingBookkeeping(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    var recordedAtIso = cleanString(args.recordedAtIso) || observedAtIso;
    var validationSummary = {
      receiptResolved: false,
      receiptOk: false,
      receiptSchemaMatched: false,
      receiptVersionAccepted: false,
      receiptDigestsValid: false,
      receiptHasEnvelopes: false,
      receiptPrivacySafe: false,
      actorPeerValid: false,
      originAccountIdHashValid: false,
      laneInvariantsMatched: false,
      rowShapeValid: false,
      rowPrivacySafe: false,
      ledgerReadSafe: false,
      ledgerAppendSafe: false,
      outputPrivacySafe: true
    };

    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    var receipt = isObject(args.receipt) ? args.receipt
      : isObject(args.applyEventReceipt) ? args.applyEventReceipt
      : isObject(args.handoffPreview) || cleanString(args.schema) === EXPECTED_RECEIPT_SCHEMA
        ? args : null;
    if (!receipt) {
      addCode(blockers, 'library-binding-bookkeeping-receipt-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.receiptResolved = true;

    // Privacy scan 1: input receipt
    scanPrivacy(receipt, blockers, warnings, 'library-binding-bookkeeping-receipt-privacy-failed');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.receiptPrivacySafe = true;

    var validated = validateReceiptShape(receipt, blockers, warnings);
    if (!validated) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.receiptOk = true;
    validationSummary.receiptSchemaMatched = true;
    validationSummary.receiptVersionAccepted = true;
    validationSummary.receiptDigestsValid = true;
    validationSummary.receiptHasEnvelopes = true;
    validationSummary.actorPeerValid = true;
    validationSummary.originAccountIdHashValid = true;

    // Lane invariants: Native-only, no F5 footprint, bind/unbind only
    if (!validateLaneInvariants(receipt, blockers, warnings)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.laneInvariantsMatched = true;

    var actorPeer = safeObject(receipt.actorPeer);
    var rowId = await computeRowId(receipt, actorPeer);
    if (!isSha256Hex(rowId)) {
      addCode(blockers, 'library-binding-bookkeeping-row-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    var ledger = await loadLedger(blockers, warnings);
    if (blockers.length || !ledger) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.ledgerReadSafe = true;

    var existing = null;
    for (var i = 0; i < ledger.rows.length; i++) {
      var r = ledger.rows[i];
      if (isObject(r) && cleanLower(r.rowId) === rowId) {
        existing = r;
        break;
      }
    }

    var relatedInfo = truncateRelatedSubjects(receipt.relatedSubjects, warnings);
    var relatedDigest = relatedInfo.count
      ? await sha256Hex(canonicalJson(relatedInfo.entries))
      : await sha256Hex(canonicalJson([]));
    if (!isSha256Hex(relatedDigest)) {
      addCode(blockers, 'library-binding-bookkeeping-row-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    if (existing) {
      addCode(warnings, 'library-binding-bookkeeping-already-present');
      validationSummary.rowShapeValid = true;
      validationSummary.rowPrivacySafe = true;
      validationSummary.ledgerAppendSafe = true;
      var dupResult = buildResult({
        ok: true,
        recorded: false,
        alreadyPresent: true,
        row: existing,
        rowId: rowId,
        rowDigest: existing.rowDigest,
        ledger: ledger,
        ledgerDigest: ledger.ledgerDigest,
        receipt: receipt,
        receiptDigest: receipt.receiptDigest,
        applyEventDigest: receipt.applyEventDigest,
        validationSummary: validationSummary,
        blockers: [],
        warnings: warnings,
        bookkeepingLedgerWritten: false,
        observedAtIso: observedAtIso
      });
      return scanFinalOutput(dupResult);
    }

    // Cross-peer dedupe diagnostic
    var crossPeerHit = ledger.rows.some(function (r) {
      var x = safeObject(r);
      return cleanLower(x.applyEventDigest) === cleanLower(receipt.applyEventDigest)
        && cleanLower(x.dedupeKey) === cleanLower(receipt.dedupeKey)
        && cleanLower(x.rowId) !== rowId;
    });
    if (crossPeerHit) {
      addCode(warnings, 'library-binding-bookkeeping-cross-peer-dedupe-detected');
    }

    var row = await assembleRow(receipt, rowId, relatedDigest, relatedInfo.count,
      relatedInfo.truncated, receipt.warnings, recordedAtIso);
    if (!isObject(row) || !isSha256Hex(row.rowDigest)) {
      addCode(blockers, 'library-binding-bookkeeping-row-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.rowShapeValid = true;

    // Privacy scan 2: constructed row before write
    scanPrivacy(row, blockers, warnings, 'library-binding-bookkeeping-row-privacy-failed');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.rowPrivacySafe = true;

    // Append + persist
    var nextRows = ledger.rows.slice();
    nextRows.push(row);
    var ledgerDigest = await sha256Hex(canonicalJson(nextRows));
    if (!isSha256Hex(ledgerDigest)) {
      addCode(blockers, 'library-binding-bookkeeping-row-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    var nextLedger = {
      schema: LEDGER_SCHEMA,
      version: VERSION,
      rows: nextRows,
      rowsCount: nextRows.length,
      ledgerDigest: ledgerDigest,
      observedAtIso: observedAtIso
    };
    var wrote = await persistLedger(nextLedger, blockers);
    if (!wrote) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.ledgerAppendSafe = true;

    // Privacy scan 3: ledger snapshot returned to caller
    scanPrivacy(nextLedger, blockers, warnings, 'library-binding-bookkeeping-row-privacy-failed');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    var result = buildResult({
      ok: true,
      recorded: true,
      alreadyPresent: false,
      row: row,
      rowId: row.rowId,
      rowDigest: row.rowDigest,
      ledger: nextLedger,
      ledgerDigest: ledgerDigest,
      receipt: receipt,
      receiptDigest: receipt.receiptDigest,
      applyEventDigest: receipt.applyEventDigest,
      validationSummary: validationSummary,
      blockers: [],
      warnings: warnings,
      bookkeepingLedgerWritten: true,
      observedAtIso: observedAtIso
    });

    // Privacy scan 4: final result envelope
    return scanFinalOutput(result);
  }

  // ── Diagnostic read API ─────────────────────────────────────────────
  async function listLibraryBindingBookkeepingLedger() {
    var blockers = [];
    var warnings = [];
    var observedAtIso = nowIsoSeconds();
    var ledger = await loadLedger(blockers, warnings);
    if (blockers.length || !ledger) {
      return {
        schema: RESULT_SCHEMA,
        version: VERSION,
        ok: false,
        ledger: null,
        ledgerDigest: null,
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary(false),
        observedAtIso: observedAtIso
      };
    }
    // Always compute a deterministic digest, even for empty ledgers, so
    // the API contract is uniform: `list.ledgerDigest` is always sha256.
    var ledgerDigest = isSha256Hex(ledger.ledgerDigest)
      ? ledger.ledgerDigest
      : await sha256Hex(canonicalJson(ledger.rows));
    if (!isSha256Hex(ledgerDigest)) {
      addCode(blockers, 'library-binding-bookkeeping-ledger-malformed');
      return {
        schema: RESULT_SCHEMA,
        version: VERSION,
        ok: false,
        ledger: null,
        ledgerDigest: null,
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary(false),
        observedAtIso: observedAtIso
      };
    }
    var ledgerOut = Object.assign({}, ledger, { ledgerDigest: ledgerDigest });
    scanPrivacy(ledgerOut, blockers, warnings, 'library-binding-bookkeeping-output-privacy-failed');
    if (blockers.length) {
      return {
        schema: RESULT_SCHEMA,
        version: VERSION,
        ok: false,
        ledger: null,
        ledgerDigest: null,
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary(false),
        observedAtIso: observedAtIso
      };
    }
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: true,
      ledger: ledgerOut,
      ledgerDigest: ledgerDigest,
      blockers: [],
      warnings: codeList(warnings),
      sideEffectSummary: sideEffectSummary(false),
      observedAtIso: observedAtIso
    };
  }

  H2O.Desktop.Sync.recordLibraryBindingBookkeeping = recordLibraryBindingBookkeeping;
  H2O.Desktop.Sync.listLibraryBindingBookkeepingLedger = listLibraryBindingBookkeepingLedger;
  H2O.Desktop.Sync.__libraryBindingBookkeepingInstalled = true;
  H2O.Desktop.Sync.__libraryBindingBookkeepingVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
