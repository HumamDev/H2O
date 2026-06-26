/* H2O Studio Saved Chat Archive Request Delivery (Chrome / MV3)
 *
 * Phase D.3C.1: low-level delivery module ONLY. Writes a metadata-only
 * h2o.savedChatArchiveRequest.v1 envelope into the Desktop-owned inbox using the
 * browser File System Access API, against the D.3C.0 contract
 * (docs/systems/archive/saved-chat-archive-request-delivery-v1.md).
 *
 * Scope guards:
 *   - No UI. No automatic flow. No background delivery. No silent write.
 *   - Read-back of Desktop results is deferred to D.3C.3 (not implemented here).
 *   - No Desktop runtime, no service-worker transport, no native messaging, no
 *     localhost relay, no network, no WebDAV/cloud, no Sync lane, no package
 *     writer, no CAS, no Desktop SQLite, no queue/materializer calls.
 *
 * The folder handle is persisted under a dedicated IndexedDB store that is
 * deliberately separate from the Sync folder handle. The selected root must be
 * exactly "H2O Studio Archive Requests"; only the inbox subfolder is created.
 * The Desktop-owned results subfolder is never created or written here.
 *
 * Public API (H2O.Studio.ingestion):
 *   diagnoseSavedChatArchiveRequestDeliveryV1()
 *   connectSavedChatArchiveRequestFolderV1()
 *   disconnectSavedChatArchiveRequestFolderV1()
 *   deliverSavedChatArchiveRequestV1(options)
 */
(function (global) {
  'use strict';

  /* ── Desktop bail — this is Chrome / MV3 only ─────────────────────── */
  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};
  if (H2O.Studio.ingestion.__archiveRequestDeliveryInstalled) return;

  var PHASE = 'D.3C.3';
  var DIAG_SCHEMA = 'h2o.studio.archive-request-delivery-diagnostics.v1';
  var REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';
  var RECEIPT_SCHEMA = 'h2o.savedChatArchiveRequestReceipt.v1';
  var ROOT_DIR_NAME = 'H2O Studio Archive Requests';
  var INBOX_DIR = 'inbox';
  var RECEIPTS_DIR = 'receipts';
  var REQUEST_SUFFIX = '.request.json';
  var TMP_SUFFIX = '.request.json.tmp';
  var RECEIPT_SUFFIX = '.receipt.json';
  var MAX_REQUEST_BYTES = 128 * 1024; /* matches inbox contract 128 KB cap */
  var MAX_RECEIPT_BYTES = 128 * 1024; /* read-back size cap */

  var IDB_NAME = 'h2o.studio.archive-requests.folder.mv3';
  var IDB_STORE = 'handles';
  var IDB_KEY = 'archive-requests-folder';

  /* Authoritative package content that must never appear in a request file. */
  var FORBIDDEN_KEYS = {
    manifest: true, manifestJson: true, snapshot: true, snapshotJson: true,
    transcript: true, turns: true, messages: true, content: true,
    contentText: true, contentHtml: true, html: true, outerHTML: true,
    outerHtml: true, outer_html: true, markdown: true, chatMd: true,
    chatHtml: true, assets: true, assetRefs: true, images: true, blobs: true,
    casPath: true, casPaths: true, packagePath: true, archivePackagePath: true,
    contentHash: true,
  };

  /* ── Small helpers ────────────────────────────────────────────────── */
  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }
  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  /* requestId must be a safe, single-segment file stem — never a path. */
  function isSafeRequestId(value) {
    var id = cleanString(value);
    if (!id || id.length > 128) return false;
    if (id.indexOf('/') !== -1 || id.indexOf('\\') !== -1) return false;
    if (id.indexOf('..') !== -1) return false;
    return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id);
  }

  function collectForbiddenKeys(value, prefix, out) {
    if (!isObject(value) && !Array.isArray(value)) return;
    Object.keys(value).forEach(function (key) {
      var name = String(key);
      var path = prefix ? prefix + '.' + name : name;
      if (FORBIDDEN_KEYS[name]) out.push(path);
      var child = value[key];
      if (isObject(child) || Array.isArray(child)) collectForbiddenKeys(child, path, out);
    });
  }

  function stableSort(value) {
    if (Array.isArray(value)) return value.map(stableSort);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] === 'undefined') return;
      out[key] = stableSort(value[key]);
    });
    return out;
  }
  function stableJson(value) {
    return JSON.stringify(stableSort(value), null, 2);
  }
  function byteLength(text) {
    try { return new TextEncoder().encode(text).length; }
    catch (_) { return String(text).length; }
  }

  /* ── Envelope safety re-assertion (defense in depth) ──────────────── */
  function assertSafeEnvelope(envelope) {
    var blockers = [];
    if (!isObject(envelope)) { blockers.push('envelope-not-object'); return { ok: false, blockers: blockers }; }
    if (cleanString(envelope.schema) !== REQUEST_SCHEMA) blockers.push('unexpected-schema');
    if (!cleanString(envelope.requestId)) blockers.push('missing-request-id');
    else if (!isSafeRequestId(envelope.requestId)) blockers.push('unsafe-request-id');
    if (!cleanString(envelope.dedupeKey)) blockers.push('missing-dedupe-key');
    var pp = isObject(envelope.payloadPolicy) ? envelope.payloadPolicy : null;
    if (!pp || pp.containsSnapshotContent !== false) blockers.push('snapshot-content-not-false');
    if (!pp || pp.containsAssets !== false) blockers.push('assets-not-false');
    var forbidden = [];
    collectForbiddenKeys(envelope, '', forbidden);
    if (forbidden.length) blockers.push('forbidden-payload-fields:' + forbidden.join(','));
    return { ok: blockers.length === 0, blockers: blockers };
  }

  /* ── File System Access availability ──────────────────────────────── */
  function pickerAvailable() {
    try { return typeof global.showDirectoryPicker === 'function'; }
    catch (_) { return false; }
  }
  function indexedDbAvailable() {
    try { return !!global.indexedDB; }
    catch (_) { return false; }
  }
  function handleSupportsWrite(handle) {
    return !!handle
      && typeof handle.getDirectoryHandle === 'function'
      && typeof handle.queryPermission === 'function';
  }
  function handleSupportsRead(handle) {
    return !!handle && typeof handle.getDirectoryHandle === 'function';
  }

  /* ── Dedicated IndexedDB handle store (separate from Sync) ─────────── */
  function openHandleDb() {
    return new Promise(function (resolve, reject) {
      if (!indexedDbAvailable()) { reject(new Error('indexedDB unavailable')); return; }
      var req = global.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        try {
          var db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        } catch (e) { reject(e); }
      };
      req.onerror = function () { reject(req.error || new Error('indexedDB open failed')); };
      req.onsuccess = function () { resolve(req.result); };
    });
  }
  async function loadStoredHandle() {
    var db;
    try { db = await openHandleDb(); }
    catch (_) { return null; }
    try {
      return await new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onerror = function () { reject(req.error || new Error('indexedDB get failed')); };
        req.onsuccess = function () { resolve(req.result || null); };
      });
    } catch (_) { return null; }
    finally { try { db.close(); } catch (_) { /* ignore */ } }
  }
  async function saveStoredHandle(handle) {
    var db = await openHandleDb();
    try {
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var req = tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
        req.onerror = function () { reject(req.error || new Error('indexedDB put failed')); };
        req.onsuccess = function () { resolve(); };
      });
    } finally { try { db.close(); } catch (_) { /* ignore */ } }
  }
  async function clearStoredHandle() {
    var db;
    try { db = await openHandleDb(); }
    catch (_) { return false; }
    try {
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var req = tx.objectStore(IDB_STORE).delete(IDB_KEY);
        req.onerror = function () { reject(req.error || new Error('indexedDB delete failed')); };
        req.onsuccess = function () { resolve(); };
      });
      return true;
    } catch (_) { return false; }
    finally { try { db.close(); } catch (_) { /* ignore */ } }
  }

  /* ── Permission (gesture-bound; never silent) ─────────────────────── */
  async function queryReadWritePermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'unavailable';
    try { return await handle.queryPermission({ mode: 'readwrite' }); }
    catch (_) { return 'unknown'; }
  }
  async function ensureReadWritePermission(handle) {
    var current = await queryReadWritePermission(handle);
    if (current === 'granted') return 'granted';
    if (typeof handle.requestPermission !== 'function') return 'denied';
    var asked;
    try { asked = await handle.requestPermission({ mode: 'readwrite' }); }
    catch (_) { return 'denied'; }
    return asked === 'granted' ? 'granted' : 'denied';
  }

  /* Read-only permission for receipt read-back (lighter than readwrite). */
  async function queryReadPermission(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return 'unavailable';
    try { return await handle.queryPermission({ mode: 'read' }); }
    catch (_) { return 'unknown'; }
  }
  async function ensureReadPermission(handle) {
    var current = await queryReadPermission(handle);
    if (current === 'granted') return 'granted';
    if (typeof handle.requestPermission !== 'function') return 'denied';
    var asked;
    try { asked = await handle.requestPermission({ mode: 'read' }); }
    catch (_) { return 'denied'; }
    return asked === 'granted' ? 'granted' : 'denied';
  }

  /* ── Atomic-ish write: .tmp then move(), fallback write-final+remove ─ */
  async function writeRequestAtomic(inboxHandle, fileName, tmpFileName, json) {
    var tmpHandle = await inboxHandle.getFileHandle(tmpFileName, { create: true });
    var writable = await tmpHandle.createWritable();
    try { await writable.write(json); }
    finally { await writable.close(); }

    if (typeof tmpHandle.move === 'function') {
      try { await tmpHandle.move(fileName); return 'move'; }
      catch (_) { /* fall through to copy-then-delete */ }
    }
    var finalHandle = await inboxHandle.getFileHandle(fileName, { create: true });
    var finalWritable = await finalHandle.createWritable();
    try { await finalWritable.write(json); }
    finally { await finalWritable.close(); }
    try { await inboxHandle.removeEntry(tmpFileName); }
    catch (_) { /* benign: Desktop ignores .tmp */ }
    return 'copy-then-delete';
  }

  /* ── Result shaping ───────────────────────────────────────────────── */
  function makeResult(status, extra) {
    var base = {
      ok: status === 'delivered',
      status: status,
      requestId: null,
      dedupeKey: null,
      fileName: null,
      tmpFileName: null,
      folderConnected: false,
      atomicMethod: null,
      warnings: [],
      blockers: [],
    };
    return Object.assign(base, extra || {});
  }

  /* ── Builder bridge (reuse the D.3A builder; never package writer) ── */
  async function resolveEnvelope(options) {
    if (isObject(options.envelope)) return { ok: true, envelope: options.envelope, builderUsed: false };
    var build = H2O.Studio.ingestion.buildSavedChatArchiveRequestV1;
    if (typeof build !== 'function') return { ok: false, blockers: ['builder-unavailable'] };
    var built;
    try { built = await build(isObject(options.builderOptions) ? options.builderOptions : options); }
    catch (e) { return { ok: false, blockers: ['builder-threw:' + cleanString(e && e.message)] }; }
    if (!built || built.ok !== true || !isObject(built.envelope)) {
      return { ok: false, blockers: (built && built.blockers) || ['builder-failed'] };
    }
    return { ok: true, envelope: built.envelope, builderUsed: true };
  }

  /* ── Public API: diagnose ─────────────────────────────────────────── */
  async function diagnoseSavedChatArchiveRequestDeliveryV1() {
    var handle = null;
    try { handle = await loadStoredHandle(); } catch (_) { handle = null; }
    var permission = 'unavailable';
    var folderName = null;
    if (handle) {
      folderName = cleanString(handle.name) || null;
      permission = await queryReadWritePermission(handle);
    }
    return {
      schema: DIAG_SCHEMA,
      phase: PHASE,
      fileSystemAccessAvailable: pickerAvailable(),
      indexedDbAvailable: indexedDbAvailable(),
      folderConnected: !!handle,
      folderName: folderName,
      expectedFolderName: ROOT_DIR_NAME,
      folderNameMatches: !!handle && folderName === ROOT_DIR_NAME,
      permission: permission,
      inboxDir: INBOX_DIR,
      receiptsDir: RECEIPTS_DIR,
      requestFileSuffix: REQUEST_SUFFIX,
      tmpFileSuffix: TMP_SUFFIX,
      receiptFileSuffix: RECEIPT_SUFFIX,
      maxRequestBytes: MAX_REQUEST_BYTES,
      automaticDeliveryEnabled: false,
      backgroundDeliveryEnabled: false,
      watcherEnabled: false,
      pollingEnabled: false,
      readBackImplemented: true,
      readBackAutomatic: false,
      notes: [
        'D.3C.3 delivery + manual read-back; no automatic delivery flow is enabled.',
        'Delivery requires an explicit user gesture and confirmDelivery:true.',
        'Receipt read-back is read-only, manual, and never writes/creates receipts.',
      ],
    };
  }

  /* ── Public API: connect folder (user gesture required) ───────────── */
  async function connectSavedChatArchiveRequestFolderV1() {
    if (!pickerAvailable()) return makeResult('file-system-access-unavailable');
    var handle;
    try { handle = await global.showDirectoryPicker({ mode: 'readwrite' }); }
    catch (e) {
      if (e && e.name === 'AbortError') return makeResult('cancelled');
      return makeResult('file-system-access-unavailable', { blockers: [cleanString(e && e.message)] });
    }
    var folderName = cleanString(handle && handle.name);
    if (folderName !== ROOT_DIR_NAME) {
      return makeResult('archive-request-folder-name-mismatch', {
        warnings: ['expected-folder-name:' + ROOT_DIR_NAME, 'selected-folder-name:' + folderName],
      });
    }
    var permission = await ensureReadWritePermission(handle);
    if (permission !== 'granted') {
      return makeResult('archive-request-folder-permission-denied', { folderConnected: false });
    }
    try { await saveStoredHandle(handle); }
    catch (e) {
      return makeResult('archive-request-folder-not-connected', { blockers: ['persist-failed:' + cleanString(e && e.message)] });
    }
    return makeResult('connected', { folderConnected: true, warnings: ['folder-name:' + folderName] });
  }

  /* ── Public API: disconnect folder ────────────────────────────────── */
  async function disconnectSavedChatArchiveRequestFolderV1() {
    var existing = null;
    try { existing = await loadStoredHandle(); } catch (_) { existing = null; }
    if (!existing) return makeResult('not-connected', { folderConnected: false });
    var cleared = await clearStoredHandle();
    return makeResult(cleared ? 'disconnected' : 'disconnect-failed', { folderConnected: false });
  }

  /* ── Public API: deliver (manual, gesture-gated, enqueue-intent) ──── */
  async function deliverSavedChatArchiveRequestV1(options) {
    var input = isObject(options) ? options : {};

    var handle = null;
    try { handle = await loadStoredHandle(); } catch (_) { handle = null; }
    var folderConnected = !!handle;

    /* 1. Resolve + re-assert metadata-only safety BEFORE any write. */
    var resolved = await resolveEnvelope(input);
    if (!resolved.ok) {
      return makeResult('builder-failed', { folderConnected: folderConnected, blockers: resolved.blockers || ['builder-failed'] });
    }
    var envelope = resolved.envelope;
    var safety = assertSafeEnvelope(envelope);
    var requestId = cleanString(envelope.requestId) || null;
    var dedupeKey = cleanString(envelope.dedupeKey) || null;
    if (!safety.ok) {
      return makeResult('unsafe-envelope', {
        folderConnected: folderConnected,
        requestId: requestId,
        dedupeKey: dedupeKey,
        blockers: safety.blockers,
      });
    }

    var fileName = requestId + REQUEST_SUFFIX;
    var tmpFileName = requestId + TMP_SUFFIX;
    var json = stableJson(envelope);
    if (byteLength(json) > MAX_REQUEST_BYTES) {
      return makeResult('envelope-too-large', {
        folderConnected: folderConnected, requestId: requestId, dedupeKey: dedupeKey,
        fileName: fileName, tmpFileName: tmpFileName,
        blockers: ['max-bytes:' + MAX_REQUEST_BYTES],
      });
    }

    /* 2. Explicit-gesture gate — no automatic / silent delivery. */
    if (input.confirmDelivery !== true) {
      return makeResult('delivery-disabled', {
        folderConnected: folderConnected, requestId: requestId, dedupeKey: dedupeKey,
        fileName: fileName, tmpFileName: tmpFileName,
        warnings: ['explicit-user-gesture-required: pass confirmDelivery:true from a user gesture'],
      });
    }

    /* 3. Folder + permission gates. */
    if (!handle) {
      return makeResult('archive-request-folder-not-connected', {
        folderConnected: false, requestId: requestId, dedupeKey: dedupeKey,
        fileName: fileName, tmpFileName: tmpFileName,
      });
    }
    if (!handleSupportsWrite(handle)) {
      return makeResult('file-system-access-unavailable', {
        folderConnected: true, requestId: requestId, dedupeKey: dedupeKey,
        fileName: fileName, tmpFileName: tmpFileName,
      });
    }
    if (cleanString(handle.name) !== ROOT_DIR_NAME) {
      return makeResult('archive-request-folder-name-mismatch', {
        folderConnected: true, requestId: requestId, dedupeKey: dedupeKey,
        fileName: fileName, tmpFileName: tmpFileName,
        warnings: ['expected-folder-name:' + ROOT_DIR_NAME, 'selected-folder-name:' + cleanString(handle.name)],
      });
    }
    var permission = await ensureReadWritePermission(handle);
    if (permission !== 'granted') {
      return makeResult('archive-request-folder-permission-denied', {
        folderConnected: true, requestId: requestId, dedupeKey: dedupeKey,
        fileName: fileName, tmpFileName: tmpFileName,
      });
    }

    /* 4. Ensure inbox/ only (never the Desktop-owned results folder) and write. */
    var atomicMethod;
    try {
      var inboxHandle = await handle.getDirectoryHandle(INBOX_DIR, { create: true });
      atomicMethod = await writeRequestAtomic(inboxHandle, fileName, tmpFileName, json);
    } catch (e) {
      return makeResult('inbox-write-failed', {
        folderConnected: true, requestId: requestId, dedupeKey: dedupeKey,
        fileName: fileName, tmpFileName: tmpFileName,
        blockers: ['write-failed:' + cleanString(e && e.message)],
      });
    }

    return makeResult('delivered', {
      folderConnected: true, requestId: requestId, dedupeKey: dedupeKey,
      fileName: fileName, tmpFileName: tmpFileName, atomicMethod: atomicMethod,
      warnings: resolved.builderUsed ? [] : ['prebuilt-envelope'],
    });
  }

  /* ── Receipt read-back (D.3C.3): read-only, manual, informational ──── */
  function makeReadResult(status, extra) {
    var OK_READ = { 'queued-on-desktop': 1, 'already-queued-duplicate': 1, 'needs-desktop-snapshot': 1 };
    var base = {
      ok: !!OK_READ[status],
      status: status,
      requestId: null,
      receipt: null,
      receiptFileName: null,
      folderConnected: false,
      warnings: [],
      blockers: [],
    };
    return Object.assign(base, extra || {});
  }

  /* Map the Desktop receipt verdict (status/enqueueStatus) to a Chrome status. */
  function mapReceiptStatus(receipt) {
    var warnings = [];
    function m(value) {
      if (value === 'validated') return 'queued-on-desktop';
      if (value === 'duplicate') return 'already-queued-duplicate';
      if (value === 'rejected') return 'rejected-by-desktop';
      if (value === 'needs-desktop-snapshot') return 'needs-desktop-snapshot';
      if (value === 'db-unavailable') return 'db-unavailable';
      return null;
    }
    var mapped = m(cleanString(receipt.status)) || m(cleanString(receipt.enqueueStatus));
    if (!mapped) {
      mapped = 'rejected-by-desktop';
      warnings.push('unrecognized-receipt-status:' + cleanString(receipt.status));
    }
    return { status: mapped, warnings: warnings };
  }

  function isNotFound(err) {
    return !!err && (err.name === 'NotFoundError' || err.code === 8);
  }
  function isPermissionError(err) {
    return !!err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
  }

  async function readSavedChatArchiveRequestReceiptV1(options) {
    var input = isObject(options) ? options : {};
    var requestId = cleanString(input.requestId);

    var handle = null;
    try { handle = await loadStoredHandle(); } catch (_) { handle = null; }
    var folderConnected = !!handle;

    if (!requestId || !isSafeRequestId(requestId)) {
      return makeReadResult('receipt-request-id-mismatch', {
        folderConnected: folderConnected, requestId: requestId || null, blockers: ['invalid-request-id'],
      });
    }
    var receiptFileName = requestId + RECEIPT_SUFFIX;
    if (!handle) {
      return makeReadResult('archive-request-folder-not-connected', {
        folderConnected: false, requestId: requestId, receiptFileName: receiptFileName,
      });
    }
    if (!handleSupportsRead(handle)) {
      return makeReadResult('file-system-access-unavailable', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
      });
    }
    var permission = await ensureReadPermission(handle);
    if (permission !== 'granted') {
      return makeReadResult('archive-request-folder-permission-denied', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
      });
    }

    /* Receipts folder is Desktop-owned: open WITHOUT create. Absent => awaiting. */
    var receiptsDir;
    try {
      receiptsDir = await handle.getDirectoryHandle(RECEIPTS_DIR);
    } catch (e) {
      if (isPermissionError(e)) {
        return makeReadResult('archive-request-folder-permission-denied', {
          folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        });
      }
      return makeReadResult('delivered-awaiting-desktop', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
      });
    }

    var file;
    try {
      var fileHandle = await receiptsDir.getFileHandle(receiptFileName);
      file = await fileHandle.getFile();
    } catch (e) {
      if (isPermissionError(e)) {
        return makeReadResult('archive-request-folder-permission-denied', {
          folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        });
      }
      if (isNotFound(e)) {
        return makeReadResult('delivered-awaiting-desktop', {
          folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        });
      }
      return makeReadResult('receipt-malformed', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        blockers: ['receipt-read-failed:' + cleanString(e && e.message)],
      });
    }

    if (file && typeof file.size === 'number' && file.size > MAX_RECEIPT_BYTES) {
      return makeReadResult('receipt-malformed', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        blockers: ['receipt-too-large:' + MAX_RECEIPT_BYTES],
      });
    }

    var text;
    try { text = await file.text(); }
    catch (e) {
      return makeReadResult('receipt-malformed', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        blockers: ['receipt-read-failed:' + cleanString(e && e.message)],
      });
    }
    if (typeof text === 'string' && byteLength(text) > MAX_RECEIPT_BYTES) {
      return makeReadResult('receipt-malformed', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        blockers: ['receipt-too-large:' + MAX_RECEIPT_BYTES],
      });
    }

    var receipt;
    try { receipt = JSON.parse(text); }
    catch (_) {
      return makeReadResult('receipt-malformed', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        blockers: ['receipt-json-parse-failed'],
      });
    }

    if (!isObject(receipt) || cleanString(receipt.schema) !== RECEIPT_SCHEMA) {
      return makeReadResult('receipt-schema-mismatch', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        receipt: isObject(receipt) ? receipt : null, blockers: ['expected-schema:' + RECEIPT_SCHEMA],
      });
    }
    if (cleanString(receipt.requestId) !== requestId) {
      return makeReadResult('receipt-request-id-mismatch', {
        folderConnected: true, requestId: requestId, receiptFileName: receiptFileName,
        receipt: receipt, blockers: ['receipt-request-id:' + cleanString(receipt.requestId)],
      });
    }

    var mapped = mapReceiptStatus(receipt);
    return makeReadResult(mapped.status, {
      folderConnected: true,
      requestId: requestId,
      receiptFileName: receiptFileName,
      receipt: receipt,
      warnings: asArray(receipt.warnings).concat(mapped.warnings),
      blockers: asArray(receipt.blockers),
    });
  }

  /* Optional alias: a "refresh" is just a manual read of the latest receipt. */
  function refreshSavedChatArchiveRequestStatusV1(options) {
    return readSavedChatArchiveRequestReceiptV1(options);
  }

  H2O.Studio.ingestion.diagnoseSavedChatArchiveRequestDeliveryV1 = diagnoseSavedChatArchiveRequestDeliveryV1;
  H2O.Studio.ingestion.connectSavedChatArchiveRequestFolderV1 = connectSavedChatArchiveRequestFolderV1;
  H2O.Studio.ingestion.disconnectSavedChatArchiveRequestFolderV1 = disconnectSavedChatArchiveRequestFolderV1;
  H2O.Studio.ingestion.deliverSavedChatArchiveRequestV1 = deliverSavedChatArchiveRequestV1;
  H2O.Studio.ingestion.readSavedChatArchiveRequestReceiptV1 = readSavedChatArchiveRequestReceiptV1;
  H2O.Studio.ingestion.refreshSavedChatArchiveRequestStatusV1 = refreshSavedChatArchiveRequestStatusV1;
  H2O.Studio.ingestion.__archiveRequestDeliveryInstalled = true;
})(typeof window !== 'undefined' ? window : globalThis);
