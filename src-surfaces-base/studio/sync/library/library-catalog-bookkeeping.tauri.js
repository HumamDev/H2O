/* H2O Desktop Sync - F15.7.a library catalog bookkeeping
 *
 * Append-only Studio-local audit ledger for F15.6.a library catalog
 * apply-event receipts. Ingests a fully-formed catalog receipt envelope
 * (any of seven operations: create, rename, recolor, archive,
 * restore-from-archived, tombstone, restore-from-retained), assembles a
 * deterministic ledger row, and appends it to a chrome.storage.local
 * key with idempotent-by-rowId semantics.
 *
 * This module is a LOCAL audit append. It does NOT:
 *   - call Native or apply
 *   - call ingestF5Review (the F5 wire-through already ran at F15.6.a
 *     receipt time; this module mirrors f5ReviewIngested / f5ReviewId
 *     from the receipt verbatim — append-only audit, never re-touched)
 *   - write the publication ledger
 *   - write the relay inbox/outbox
 *   - write the watermark ledger (execute-settlement-writer's domain)
 *   - write the consumed-op ledger (execute-settlement-writer's domain)
 *   - write the execute journal (execute-lane's domain)
 *   - write the chats.category_id materialized cache (binding lane +
 *     execute-settlement-writer's domain per F15.0.2 §2.2)
 *   - mutate Labels/Categories/Tags or any SQLite table
 *
 * Idempotency:
 *   rowId is the sha256 over (subjectId, applyEventDigest, dedupeKey,
 *   receiptDigest, actorPeer.syncPeerIdHash). Same receipt + same peer
 *   → same rowId. A duplicate `record*` call returns
 *   `{ok:true, recorded:false, alreadyPresent:true, row:<existing>}`
 *   with no storage write. A different peer recording the same envelope
 *   gets a distinct rowId AND a `library-catalog-bookkeeping-cross-peer-
 *   dedupe-detected` warning (cross-peer audit is by design).
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
 *   H2O.Desktop.Sync.recordLibraryCatalogBookkeeping(input)     -> Promise<result>
 *   H2O.Desktop.Sync.listLibraryCatalogBookkeepingLedger()      -> Promise<list-result>
 *
 *   H2O.Desktop.Sync.__libraryCatalogBookkeepingInstalled
 *   H2O.Desktop.Sync.__libraryCatalogBookkeepingVersion
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
  if (H2O.Desktop.Sync.__libraryCatalogBookkeepingInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.1.0-f15.7.catalog';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-catalog-bookkeeping.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.library-catalog-bookkeeping-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.library-catalog-bookkeeping-row.v1';
  var STORAGE_KEY = 'h2o:sync:library-catalog-bookkeeping:v1';
  var LANE = 'library.catalog';
  var SUBJECT_TYPE = 'library.catalog';
  var PRIVACY_DOMAIN_TAG = 'library.catalog';
  var EXPECTED_RECEIPT_SCHEMA = 'h2o.desktop.sync.library-catalog-apply-event-receipt.v1';
  var EXPECTED_RECEIPT_VERSION_PREFIX = '0.1.0-f15.6.catalog';
  var OWNER_KIND_NATIVE = 'native';
  var OWNER_KIND_F5 = 'f5';
  var MAX_RELATED_SUBJECTS = 50;
  var BOOKKEEPING_SURFACE = 'desktop-studio';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  // Same forbidden-field defense-in-depth list as F15.6.a — identifiers
  // cross both the envelope boundary AND the local storage boundary only
  // as sha256 hashes. The chrome.storage.local ledger is searchable;
  // raw values must never land there.
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

  // Per-operation lane invariants. Each entry encodes the expected
  // ownerKind + targetBroker that the receipt MUST carry; mismatches
  // trigger library-catalog-bookkeeping-lane-invariant-violation.
  var OPERATION_INVARIANTS = {
    'create':                  { ownerKind: OWNER_KIND_NATIVE, allowsF5Touch: false },
    'rename':                  { ownerKind: OWNER_KIND_NATIVE, allowsF5Touch: false },
    'recolor':                 { ownerKind: OWNER_KIND_NATIVE, allowsF5Touch: false },
    'archive':                 { ownerKind: OWNER_KIND_NATIVE, allowsF5Touch: false },
    'restore-from-archived':   { ownerKind: OWNER_KIND_NATIVE, allowsF5Touch: false },
    'tombstone':               { ownerKind: OWNER_KIND_F5,     allowsF5Touch: true  },
    'restore-from-retained':   { ownerKind: OWNER_KIND_NATIVE, allowsF5Touch: false }
  };

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
    var blockerToAdd = cleanString(blockerCode) || 'library-catalog-bookkeeping-receipt-privacy-failed';
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
        addCode(warnings, 'library-catalog-bookkeeping-privacy-scan-threw');
      }
    } else {
      addCode(warnings, 'library-catalog-bookkeeping-privacy-scan-unavailable');
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
  // Returns:
  //   { ok: true, ledger }                    — present, well-shaped
  //   { ok: true, ledger: emptyLedger() }     — absent (first ever write)
  //   { ok: false, malformed: true }          — present but bad shape
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
      addCode(blockers, 'library-catalog-bookkeeping-ledger-read-failed');
      return null;
    }
    var parsed = parseLedger(raw);
    if (!parsed.ok) {
      addCode(blockers, 'library-catalog-bookkeeping-ledger-malformed');
      return null;
    }
    return parsed.ledger;
  }
  async function persistLedger(ledger, blockers) {
    try {
      await storageSet(STORAGE_KEY, ledger);
      return true;
    } catch (_) {
      addCode(blockers, 'library-catalog-bookkeeping-ledger-write-failed');
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
  // Reads, validates, and returns the receipt envelope and a small
  // accessor bag (the receipt fields F15.7.a actually needs to assemble
  // the row). Adds blockers on any structural issue.
  function validateReceiptShape(receipt, blockers, warnings) {
    if (!isObject(receipt)) {
      addCode(blockers, 'library-catalog-bookkeeping-receipt-not-ok');
      return null;
    }
    if (receipt.ok !== true) {
      mergeCodes(warnings, receipt.warnings);
      addCode(blockers, 'library-catalog-bookkeeping-receipt-not-ok');
      return null;
    }
    if (cleanString(receipt.schema) !== EXPECTED_RECEIPT_SCHEMA) {
      addCode(blockers, 'library-catalog-bookkeeping-receipt-schema-invalid');
      return null;
    }
    var version = cleanString(receipt.version);
    if (version.indexOf(EXPECTED_RECEIPT_VERSION_PREFIX) !== 0) {
      addCode(blockers, 'library-catalog-bookkeeping-receipt-version-unsupported');
      return null;
    }
    if (!isSha256Hex(receipt.applyEventDigest) || !isSha256Hex(receipt.receiptDigest)) {
      addCode(blockers, 'library-catalog-bookkeeping-receipt-digest-invalid');
      return null;
    }
    if (!isObject(receipt.applyEvent) || !isObject(receipt.receipt) || !isObject(receipt.auditMetadata)) {
      addCode(blockers, 'library-catalog-bookkeeping-receipt-shape-invalid');
      return null;
    }
    var actorPeer = safeObject(receipt.actorPeer);
    if (!isSha256Hex(actorPeer.physicalDeviceIdHash)
        || !isSha256Hex(actorPeer.installIdHash)
        || !isSha256Hex(actorPeer.syncPeerIdHash)) {
      addCode(blockers, 'library-catalog-bookkeeping-actor-peer-invalid');
      return null;
    }
    if (!isSha256Hex(receipt.originAccountIdHash)) {
      addCode(blockers, 'library-catalog-bookkeeping-origin-account-id-hash-invalid');
      return null;
    }
    return receipt;
  }
  function validateLaneInvariants(receipt, blockers, warnings) {
    var operation = cleanString(receipt.operation);
    var inv = OPERATION_INVARIANTS[operation];
    if (!inv) {
      addCode(blockers, 'library-catalog-bookkeeping-lane-invariant-violation');
      return false;
    }
    var ownerKind = cleanString(receipt.ownerKind);
    if (ownerKind !== inv.ownerKind) {
      addCode(blockers, 'library-catalog-bookkeeping-lane-invariant-violation');
      return false;
    }
    var f5Touched = safeObject(receipt.sideEffectSummary).f5Touched === true;
    if (!inv.allowsF5Touch && f5Touched) {
      addCode(blockers, 'library-catalog-bookkeeping-lane-invariant-violation');
      return false;
    }
    if (operation === 'tombstone') {
      if (f5Touched) {
        // f5Touched=true REQUIRES f5ReviewIngested=true AND sha256 f5ReviewId
        if (receipt.f5ReviewIngested !== true || !isSha256Hex(receipt.f5ReviewId)) {
          addCode(blockers, 'library-catalog-bookkeeping-lane-invariant-violation');
          return false;
        }
      } else {
        // Tombstone that did NOT touch F5 (queue unavailable / duplicate /
        // throw / blocked) — receipt remained ok:true per F14.5.5.2.
        // Bookkeeping is the audit trail; emit an advisory warning so the
        // operator UI can surface this state, but don't block.
        addCode(warnings, 'library-catalog-bookkeeping-tombstone-f5-not-ingested');
      }
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
  async function assembleRow(receipt, rowId, relatedDigest, relatedCount, relatedTruncated,
                              receiptWarnings, recordedAtIso) {
    var receiptObj = safeObject(receipt.receipt);
    var applyEventObj = safeObject(receipt.applyEvent);
    var auditMetadata = safeObject(receipt.auditMetadata);
    var actorPeer = safeObject(receipt.actorPeer);
    var operation = cleanString(receipt.operation);
    var inv = OPERATION_INVARIANTS[operation] || { allowsF5Touch: false };
    var f5Touched = safeObject(receipt.sideEffectSummary).f5Touched === true;

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

      // Kernel-shaped previews (carried for replay; receipts already
      // privacy-scanned these — bookkeeping re-scans the assembled row
      // before storage as defense-in-depth).
      watermarkPreview: isObject(receipt.watermarkPreview) ? receipt.watermarkPreview : null,
      consumedOperationPreview: isObject(receipt.consumedOperationPreview) ? receipt.consumedOperationPreview : null,

      // relatedSubjects (digest only — never raw)
      relatedSubjectsDigest: cleanLower(relatedDigest),
      relatedSubjectsCount: relatedCount,
      relatedSubjectsTruncated: relatedTruncated === true,

      // Catalog-only F5 mirror fields
      // For non-tombstone ops these are false/null. For tombstone:
      //   - successful F5 ingest → ingested=true, id=<sha256>, touched=true
      //   - failed/unavailable/duplicate/throw → ingested=false, id=null,
      //     touched=false (the warning surfaced upstream is preserved
      //     via the pass-through warnings[] field below).
      f5ReviewIngested: inv.allowsF5Touch && receipt.f5ReviewIngested === true,
      f5ReviewId: inv.allowsF5Touch && isSha256Hex(receipt.f5ReviewId)
                    ? cleanLower(receipt.f5ReviewId) : null,
      tombstoneF5Touched: inv.allowsF5Touch && f5Touched === true,

      // Validation summary — receipt's validationSummary plus a
      // bookkeeping-side echo that this row's shape was assembled
      // successfully.
      validationSummary: Object.assign({}, safeObject(receipt.validationSummary), {
        bookkeepingShape: true
      }),

      // Pass-through warnings from receipt (deduped via codeList).
      // The upstream warnings (including f5-review-* and the chat-
      // category-id-refresh-pending advisory if applicable) are part
      // of the audit row, not lost.
      warnings: codeList(receiptWarnings || receipt.warnings)
    };

    // Compute rowDigest = sha256(canonicalJson(row \ rowDigest))
    var rowForDigest = Object.assign({}, row);
    delete rowForDigest.rowDigest;
    row.rowDigest = await sha256Hex(canonicalJson(rowForDigest));
    return row;
  }

  // ── Side-effect summary ─────────────────────────────────────────────
  // The 8 standard cross-platform flags stay FALSE per F15.0.0 §10.3.
  // The 9th lane-scoped flag `bookkeepingLedgerWritten` flips true ONLY
  // when a new row was actually appended; false on duplicate, blocker,
  // read failure, or any other no-op outcome.
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
      observedAtIso: opts.observedAtIso || nowIsoSeconds(),
      f5ReviewIngested: opts.f5ReviewIngested === true,
      f5ReviewId: cleanLower(opts.f5ReviewId) || null
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
    scanPrivacy(result, blockers, warnings, 'library-catalog-bookkeeping-output-privacy-failed');
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

  // ── Main entry — recordLibraryCatalogBookkeeping(input) ─────────────
  async function recordLibraryCatalogBookkeeping(input) {
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

    // Resolve receipt — accept either {receipt} or top-level receipt-shape
    var receipt = isObject(args.receipt) ? args.receipt
      : isObject(args.applyEventReceipt) ? args.applyEventReceipt
      : isObject(args.handoffPreview) || cleanString(args.schema) === EXPECTED_RECEIPT_SCHEMA
        ? args : null;
    if (!receipt) {
      addCode(blockers, 'library-catalog-bookkeeping-receipt-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.receiptResolved = true;

    // Privacy scan 1: input receipt
    scanPrivacy(receipt, blockers, warnings, 'library-catalog-bookkeeping-receipt-privacy-failed');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.receiptPrivacySafe = true;

    // Receipt shape + version + digest + actor + origin
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

    // Lane invariants (catalog operations + ownerKind + f5Touched/f5ReviewId consistency)
    if (!validateLaneInvariants(receipt, blockers, warnings)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.laneInvariantsMatched = true;

    var actorPeer = safeObject(receipt.actorPeer);
    var rowId = await computeRowId(receipt, actorPeer);
    if (!isSha256Hex(rowId)) {
      addCode(blockers, 'library-catalog-bookkeeping-row-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    // Load ledger
    var ledger = await loadLedger(blockers, warnings);
    if (blockers.length || !ledger) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.ledgerReadSafe = true;

    // Idempotency check by rowId
    var existing = null;
    for (var i = 0; i < ledger.rows.length; i++) {
      var r = ledger.rows[i];
      if (isObject(r) && cleanLower(r.rowId) === rowId) {
        existing = r;
        break;
      }
    }

    // Truncate + digest relatedSubjects
    var relatedInfo = truncateRelatedSubjects(receipt.relatedSubjects, warnings);
    var relatedDigest = relatedInfo.count
      ? await sha256Hex(canonicalJson(relatedInfo.entries))
      : await sha256Hex(canonicalJson([]));
    if (!isSha256Hex(relatedDigest)) {
      addCode(blockers, 'library-catalog-bookkeeping-row-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    if (existing) {
      // Duplicate — return existing row without writing storage.
      addCode(warnings, 'library-catalog-bookkeeping-already-present');
      validationSummary.rowShapeValid = true;
      validationSummary.rowPrivacySafe = true;
      validationSummary.ledgerAppendSafe = true; // no append needed; treat as safe
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
        observedAtIso: observedAtIso,
        f5ReviewIngested: existing.f5ReviewIngested === true,
        f5ReviewId: existing.f5ReviewId || null
      });
      return scanFinalOutput(dupResult);
    }

    // Cross-peer dedupe diagnostic: same applyEventDigest + dedupeKey but
    // a different rowId means another peer recorded this envelope. Warn
    // and STILL append (cross-peer audit is by design).
    var crossPeerHit = ledger.rows.some(function (r) {
      var x = safeObject(r);
      return cleanLower(x.applyEventDigest) === cleanLower(receipt.applyEventDigest)
        && cleanLower(x.dedupeKey) === cleanLower(receipt.dedupeKey)
        && cleanLower(x.rowId) !== rowId;
    });
    if (crossPeerHit) {
      addCode(warnings, 'library-catalog-bookkeeping-cross-peer-dedupe-detected');
    }

    // Assemble row
    var row = await assembleRow(receipt, rowId, relatedDigest, relatedInfo.count,
      relatedInfo.truncated, receipt.warnings, recordedAtIso);
    if (!isObject(row) || !isSha256Hex(row.rowDigest)) {
      addCode(blockers, 'library-catalog-bookkeeping-row-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.rowShapeValid = true;

    // Privacy scan 2: constructed row before write
    scanPrivacy(row, blockers, warnings, 'library-catalog-bookkeeping-row-privacy-failed');
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.rowPrivacySafe = true;

    // Privacy scan 3: F5 review fields on row (tombstone defense-in-depth).
    // Even though F15.6.a already validated f5ReviewId as sha256, this
    // scan confirms the row's F5 fields are pure sha256 / boolean / null —
    // no raw queue keys or names leaked into the audit trail.
    if (cleanString(receipt.operation) === 'tombstone') {
      scanPrivacy({
        f5ReviewIngested: row.f5ReviewIngested,
        f5ReviewId: row.f5ReviewId,
        tombstoneF5Touched: row.tombstoneF5Touched
      }, blockers, warnings, 'library-catalog-bookkeeping-row-privacy-failed');
      if (blockers.length) {
        return blockedResult({ blockers: blockers, warnings: warnings,
          validationSummary: validationSummary, observedAtIso: observedAtIso });
      }
    }

    // Append + persist
    var nextRows = ledger.rows.slice();
    nextRows.push(row);
    var ledgerDigest = await sha256Hex(canonicalJson(nextRows));
    if (!isSha256Hex(ledgerDigest)) {
      addCode(blockers, 'library-catalog-bookkeeping-row-shape-invalid');
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

    // Privacy scan 4: ledger snapshot returned to caller
    scanPrivacy(nextLedger, blockers, warnings, 'library-catalog-bookkeeping-row-privacy-failed');
    if (blockers.length) {
      // Ledger already written; we can't roll back. Surface the blocker
      // but still return the row so the caller knows what happened.
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    // Build success result
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
      observedAtIso: observedAtIso,
      f5ReviewIngested: row.f5ReviewIngested === true,
      f5ReviewId: row.f5ReviewId || null
    });

    // Privacy scan 5: final result envelope
    return scanFinalOutput(result);
  }

  // ── Diagnostic read API ─────────────────────────────────────────────
  async function listLibraryCatalogBookkeepingLedger() {
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
    // Always compute a deterministic digest over the rows array (even
    // when empty) so the API contract is uniform: `list.ledgerDigest` is
    // always a sha256 hex string. Stored digest is preferred when present.
    var ledgerDigest = isSha256Hex(ledger.ledgerDigest)
      ? ledger.ledgerDigest
      : await sha256Hex(canonicalJson(ledger.rows));
    if (!isSha256Hex(ledgerDigest)) {
      addCode(blockers, 'library-catalog-bookkeeping-ledger-malformed');
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
    // Privacy scan the ledger snapshot before returning.
    scanPrivacy(ledgerOut, blockers, warnings, 'library-catalog-bookkeeping-output-privacy-failed');
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

  H2O.Desktop.Sync.recordLibraryCatalogBookkeeping = recordLibraryCatalogBookkeeping;
  H2O.Desktop.Sync.listLibraryCatalogBookkeepingLedger = listLibraryCatalogBookkeepingLedger;
  H2O.Desktop.Sync.__libraryCatalogBookkeepingInstalled = true;
  H2O.Desktop.Sync.__libraryCatalogBookkeepingVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
