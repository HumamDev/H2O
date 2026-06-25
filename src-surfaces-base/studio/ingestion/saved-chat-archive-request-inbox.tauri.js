/* H2O Studio Saved Chat Archive Request Inbox (Desktop / Tauri)
 *
 * Phase D.3B.1: Desktop-owned inbox scanner for externally delivered
 * h2o.savedChatArchiveRequest.v1 metadata envelopes. Enqueue-only via the
 * D.2B request queue API; writes receipts and never materializes packages.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};

  var REQUEST_SCHEMA = 'h2o.savedChatArchiveRequest.v1';
  var RECEIPT_SCHEMA = 'h2o.savedChatArchiveRequestReceipt.v1';
  var DIAGNOSTIC_SCHEMA = 'h2o.savedChatArchiveRequestInboxDiagnostic.v1';
  var SCAN_SCHEMA = 'h2o.savedChatArchiveRequestInboxScan.v1';
  var ROOT_DIR = 'H2O Studio Archive Requests';
  var INBOX_DIR = ROOT_DIR + '/inbox';
  var RECEIPTS_DIR = ROOT_DIR + '/receipts';
  var REQUEST_SUFFIX = '.request.json';
  var RECEIPT_SUFFIX = '.receipt.json';
  var MALFORMED_PREFIX = 'malformed-sha256-';
  var HOME_BASE_DIR = 21;
  var DEFAULT_SIZE_CAP_BYTES = 128 * 1024;
  var DEFAULT_SCAN_LIMIT = 50;
  var MAX_SCAN_LIMIT = 200;
  var MODULE_VERSION = '0.1.0-d3b1';
  var REQUEST_FILE_RE = /^[A-Za-z0-9._:@-]{1,180}\.request\.json$/;
  var REQUEST_ID_RE = /^[A-Za-z0-9._:@-]{1,180}$/;

  var state = {
    installedAt: nowIso(),
    lastScanAt: '',
    lastProcessAt: '',
    lastReceiptPath: '',
    lastError: '',
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function makeIssue(code, message, detail) {
    var out = { code: code, message: message };
    if (typeof detail !== 'undefined') out.detail = detail;
    return out;
  }

  function pushIssue(list, code, message, detail) {
    list.push(makeIssue(code, message, detail));
  }

  function getInvoke() {
    try {
      var internals = global.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    } catch (_) { /* ignore */ }
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
      if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    } catch (_) { /* ignore */ }
    return null;
  }

  function baseDirOptions(extra) {
    return Object.assign({ baseDir: HOME_BASE_DIR }, extra || {});
  }

  function fsReadDir(path) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for read_dir'));
    return invoke('plugin:fs|read_dir', { path: path, options: baseDirOptions() });
  }

  function decodeToText(raw, contextPath) {
    if (raw == null) throw new Error('decodeToText: null response for ' + cleanString(contextPath));
    if (typeof raw === 'string') return raw;
    if (raw instanceof Uint8Array) return new TextDecoder('utf-8').decode(raw);
    if (raw instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(raw));
    if (Array.isArray(raw)) {
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i += 1) bytes[i] = raw[i] & 255;
      return new TextDecoder('utf-8').decode(bytes);
    }
    if (raw && typeof raw === 'object' && typeof raw.byteLength === 'number' && raw.buffer instanceof ArrayBuffer) {
      return new TextDecoder('utf-8').decode(new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength));
    }
    throw new Error('decodeToText: unsupported response type for ' + cleanString(contextPath));
  }

  async function fsReadText(path) {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for read_text_file');
    try {
      return decodeToText(await invoke('plugin:fs|read_text_file', { path: path, options: baseDirOptions() }), path);
    } catch (textErr) {
      try {
        return decodeToText(await invoke('plugin:fs|read_file', { path: path, options: baseDirOptions() }), path);
      } catch (fileErr) {
        throw new Error(String((textErr && textErr.message) || textErr) +
          ' / fallback read_file failed: ' + String((fileErr && fileErr.message) || fileErr));
      }
    }
  }

  function fsMkdir(path) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable for mkdir'));
    return invoke('plugin:fs|mkdir', { path: path, options: baseDirOptions({ recursive: true }) });
  }

  async function fsWriteText(path, text) {
    var invoke = getInvoke();
    if (!invoke) throw new Error('tauri invoke unavailable for write_text_file');
    var body = String(text || '');
    try {
      return await invoke('plugin:fs|write_text_file', { path: path, contents: body, options: baseDirOptions() });
    } catch (objectErr) {
      var bytes = new TextEncoder().encode(body);
      try {
        return await invoke('plugin:fs|write_text_file', bytes, {
          headers: {
            path: encodeURIComponent(path),
            options: JSON.stringify(baseDirOptions()),
          },
        });
      } catch (bytesErr) {
        throw new Error(String((objectErr && objectErr.message) || objectErr) +
          ' / fallback write_text_file failed: ' + String((bytesErr && bytesErr.message) || bytesErr));
      }
    }
  }

  function byteLength(text) {
    try { return new TextEncoder().encode(String(text || '')).length; }
    catch (_) { return String(text || '').length; }
  }

  function simpleHashHex(text) {
    var hash = 2166136261;
    var source = String(text || '');
    for (var i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    var seed = ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    return (seed + seed + seed + seed + seed + seed + seed + seed).slice(0, 64);
  }

  async function sha256Hex(text) {
    try {
      var cryptoObj = global.crypto;
      if (cryptoObj && cryptoObj.subtle && typeof cryptoObj.subtle.digest === 'function') {
        var digest = await cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
        return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (_) { /* fallback below */ }
    return simpleHashHex(text);
  }

  function isMissingFileError(error) {
    var text = String((error && error.message) || error || '').toLowerCase();
    return text.indexOf('not found') >= 0 ||
      text.indexOf('no such file') >= 0 ||
      text.indexOf('os error 2') >= 0 ||
      text.indexOf('enoent') >= 0 ||
      text.indexOf('notfound') >= 0;
  }

  function safeFileName(value) {
    return cleanString(value).replace(/[^A-Za-z0-9._:@-]/g, '-').slice(0, 220);
  }

  function requestIdFromFileName(fileName) {
    var name = cleanString(fileName);
    if (!REQUEST_FILE_RE.test(name)) return '';
    return name.slice(0, -REQUEST_SUFFIX.length);
  }

  function requestFilePath(fileName) {
    return INBOX_DIR + '/' + fileName;
  }

  function receiptFileNameFor(requestId, fileHash) {
    var id = cleanString(requestId);
    if (REQUEST_ID_RE.test(id)) return id + RECEIPT_SUFFIX;
    var hash = cleanString(fileHash).replace(/^sha256-/, '');
    if (!/^[0-9a-f]{64}$/i.test(hash)) hash = simpleHashHex(id || nowIso());
    return MALFORMED_PREFIX + hash.toLowerCase() + RECEIPT_SUFFIX;
  }

  function receiptFilePathFor(requestId, fileHash) {
    return RECEIPTS_DIR + '/' + receiptFileNameFor(requestId, fileHash);
  }

  function normalizeLimit(value, fallback) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) n = fallback;
    return Math.max(1, Math.min(MAX_SCAN_LIMIT, Math.floor(n)));
  }

  function normalizeSizeCap(value) {
    var n = Number(value);
    if (!isFinite(n) || n <= 0) return DEFAULT_SIZE_CAP_BYTES;
    return Math.max(1, Math.floor(n));
  }

  function entryName(entry) {
    if (typeof entry === 'string') return entry;
    return cleanString(entry && (entry.name || entry.fileName || entry.path && String(entry.path).split('/').pop()));
  }

  function entryIsDirectory(entry) {
    if (!entry || typeof entry === 'string') return false;
    if (entry.isDirectory === true) return true;
    if (entry.children && Array.isArray(entry.children)) return true;
    if (entry.type === 'directory' || entry.kind === 'directory') return true;
    return false;
  }

  function summarizeError(error) {
    return {
      message: cleanString((error && error.message) || error).slice(0, 300),
      code: cleanString(error && error.code).slice(0, 80),
    };
  }

  function createReceipt(base) {
    var item = safeObject(base);
    return {
      schema: RECEIPT_SCHEMA,
      requestId: cleanString(item.requestId) || null,
      dedupeKey: cleanString(item.dedupeKey) || null,
      receivedAt: cleanString(item.receivedAt) || nowIso(),
      processedAt: cleanString(item.processedAt) || nowIso(),
      sourceFile: cleanString(item.sourceFile) || null,
      requestFileSha256: cleanString(item.requestFileSha256) || null,
      status: cleanString(item.status) || 'rejected',
      enqueueStatus: cleanString(item.enqueueStatus) || 'not-enqueued',
      persisted: item.persisted === true,
      duplicateOf: cleanString(item.duplicateOf) || null,
      packageWriteDeferred: true,
      materializeTriggered: false,
      blockers: asArray(item.blockers),
      warnings: asArray(item.warnings),
    };
  }

  async function writeReceipt(receipt) {
    await fsMkdir(RECEIPTS_DIR);
    var path = receiptFilePathFor(receipt && receipt.requestId, receipt && receipt.requestFileSha256);
    await fsWriteText(path, JSON.stringify(receipt, null, 2) + '\n');
    state.lastReceiptPath = '$HOME/' + path;
    return state.lastReceiptPath;
  }

  function resultFromReceipt(receipt, extra) {
    var status = cleanString(receipt && receipt.status) || 'rejected';
    return Object.assign({
      ok: status === 'validated' || status === 'duplicate' || status === 'needs-desktop-snapshot',
      status: status,
      requestId: receipt && receipt.requestId || null,
      dedupeKey: receipt && receipt.dedupeKey || null,
      receipt: receipt || null,
      packageWriteDeferred: true,
      materializeTriggered: false,
    }, extra || {});
  }

  async function processSavedChatArchiveRequestInboxFileV1(options) {
    options = safeObject(options);
    state.lastProcessAt = nowIso();
    var writeReceipts = options.writeReceipt !== false;
    var maxBytes = normalizeSizeCap(options.maxBytes || options.sizeCapBytes);
    var rawFileName = cleanString(options.fileName);
    var requestIdOption = cleanString(options.requestId);
    var fileName = rawFileName || (requestIdOption ? requestIdOption + REQUEST_SUFFIX : '');
    var receivedAt = nowIso();
    var blockers = [];
    var warnings = [];
    var fileHash = '';
    var receiptPath = '';
    var fileRequestId = requestIdFromFileName(fileName);

    if (!fileRequestId) {
      pushIssue(blockers, 'invalid-request-file-name', 'Request file name must match <requestId>.request.json.', { fileName: fileName });
      var invalidReceipt = createReceipt({
        requestId: null,
        sourceFile: safeFileName(fileName) || null,
        requestFileSha256: 'sha256-' + simpleHashHex(fileName),
        receivedAt: receivedAt,
        status: 'rejected',
        enqueueStatus: 'not-enqueued',
        blockers: blockers,
        warnings: warnings,
      });
      if (writeReceipts) {
        try { receiptPath = await writeReceipt(invalidReceipt); }
        catch (writeErr) { pushIssue(warnings, 'receipt-write-failed', 'Could not write request receipt.', summarizeError(writeErr)); }
      }
      return resultFromReceipt(invalidReceipt, { receiptPath: receiptPath, enqueued: false });
    }

    var text = '';
    try {
      text = await fsReadText(requestFilePath(fileName));
    } catch (readErr) {
      pushIssue(blockers, 'request-read-failed', 'Could not read request file.', summarizeError(readErr));
      fileHash = 'sha256-' + simpleHashHex(fileName);
      var readReceipt = createReceipt({
        requestId: fileRequestId,
        sourceFile: fileName,
        requestFileSha256: fileHash,
        receivedAt: receivedAt,
        status: 'rejected',
        enqueueStatus: 'not-enqueued',
        blockers: blockers,
        warnings: warnings,
      });
      if (writeReceipts) {
        try { receiptPath = await writeReceipt(readReceipt); }
        catch (writeErr1) { pushIssue(warnings, 'receipt-write-failed', 'Could not write request receipt.', summarizeError(writeErr1)); }
      }
      return resultFromReceipt(readReceipt, { receiptPath: receiptPath, enqueued: false });
    }

    var bytes = byteLength(text);
    fileHash = 'sha256-' + await sha256Hex(text);
    if (bytes > maxBytes) {
      pushIssue(blockers, 'request-file-too-large', 'Request file exceeds the D.3B.1 size cap.', { byteLength: bytes, maxBytes: maxBytes });
      var sizeReceipt = createReceipt({
        requestId: fileRequestId,
        sourceFile: fileName,
        requestFileSha256: fileHash,
        receivedAt: receivedAt,
        status: 'rejected',
        enqueueStatus: 'not-enqueued',
        blockers: blockers,
        warnings: warnings,
      });
      if (writeReceipts) {
        try { receiptPath = await writeReceipt(sizeReceipt); }
        catch (writeErr2) { pushIssue(warnings, 'receipt-write-failed', 'Could not write request receipt.', summarizeError(writeErr2)); }
      }
      return resultFromReceipt(sizeReceipt, { receiptPath: receiptPath, enqueued: false, byteLength: bytes });
    }

    var envelope = null;
    try {
      envelope = JSON.parse(text);
    } catch (parseErr) {
      pushIssue(blockers, 'request-json-malformed', 'Request file is not valid JSON.', summarizeError(parseErr));
      var parseReceipt = createReceipt({
        requestId: fileRequestId,
        sourceFile: fileName,
        requestFileSha256: fileHash,
        receivedAt: receivedAt,
        status: 'rejected',
        enqueueStatus: 'not-enqueued',
        blockers: blockers,
        warnings: warnings,
      });
      if (writeReceipts) {
        try { receiptPath = await writeReceipt(parseReceipt); }
        catch (writeErr3) { pushIssue(warnings, 'receipt-write-failed', 'Could not write request receipt.', summarizeError(writeErr3)); }
      }
      return resultFromReceipt(parseReceipt, { receiptPath: receiptPath, enqueued: false, byteLength: bytes });
    }

    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      pushIssue(blockers, 'request-envelope-object-required', 'Request file JSON must be an object.');
    }
    var envelopeRequestId = cleanString(envelope && envelope.requestId);
    var dedupeKey = cleanString(envelope && envelope.dedupeKey);
    if (envelopeRequestId !== fileRequestId) {
      pushIssue(blockers, 'filename-request-id-mismatch', 'Request filename must match envelope.requestId.', {
        fileRequestId: fileRequestId,
        envelopeRequestId: envelopeRequestId || null,
      });
    }
    if (cleanString(envelope && envelope.schema) !== REQUEST_SCHEMA) {
      pushIssue(blockers, 'unsupported-schema', 'Unsupported saved-chat archive request schema.', {
        expected: REQUEST_SCHEMA,
        actual: cleanString(envelope && envelope.schema) || null,
      });
    }

    if (blockers.length) {
      var rejectedReceipt = createReceipt({
        requestId: fileRequestId,
        dedupeKey: dedupeKey,
        sourceFile: fileName,
        requestFileSha256: fileHash,
        receivedAt: receivedAt,
        status: 'rejected',
        enqueueStatus: 'not-enqueued',
        blockers: blockers,
        warnings: warnings,
      });
      if (writeReceipts) {
        try { receiptPath = await writeReceipt(rejectedReceipt); }
        catch (writeErr4) { pushIssue(warnings, 'receipt-write-failed', 'Could not write request receipt.', summarizeError(writeErr4)); }
      }
      return resultFromReceipt(rejectedReceipt, { receiptPath: receiptPath, enqueued: false, byteLength: bytes });
    }

    var enqueue = H2O.Studio.ingestion && H2O.Studio.ingestion.enqueueSavedChatArchiveRequestV1;
    if (typeof enqueue !== 'function') {
      pushIssue(blockers, 'enqueue-api-unavailable', 'D.2B request queue API is unavailable.');
      var unavailableReceipt = createReceipt({
        requestId: fileRequestId,
        dedupeKey: dedupeKey,
        sourceFile: fileName,
        requestFileSha256: fileHash,
        receivedAt: receivedAt,
        status: 'db-unavailable',
        enqueueStatus: 'db-unavailable',
        blockers: blockers,
        warnings: warnings,
      });
      if (writeReceipts) {
        try { receiptPath = await writeReceipt(unavailableReceipt); }
        catch (writeErr5) { pushIssue(warnings, 'receipt-write-failed', 'Could not write request receipt.', summarizeError(writeErr5)); }
      }
      return resultFromReceipt(unavailableReceipt, { receiptPath: receiptPath, enqueued: false, byteLength: bytes });
    }

    var enqueueResult;
    try {
      enqueueResult = await enqueue(envelope);
    } catch (enqueueErr) {
      pushIssue(blockers, 'enqueue-threw', 'D.2B request queue API threw.', summarizeError(enqueueErr));
      enqueueResult = { status: 'db-unavailable', persisted: false, duplicateOf: null };
    }
    var enqueueStatus = cleanString(enqueueResult && enqueueResult.status) || 'rejected';
    var receipt = createReceipt({
      requestId: fileRequestId,
      dedupeKey: dedupeKey,
      sourceFile: fileName,
      requestFileSha256: fileHash,
      receivedAt: receivedAt,
      status: enqueueStatus,
      enqueueStatus: enqueueStatus,
      persisted: enqueueResult && enqueueResult.persisted === true,
      duplicateOf: enqueueResult && enqueueResult.duplicateOf || null,
      blockers: blockers,
      warnings: warnings.concat(asArray(enqueueResult && enqueueResult.warnings)),
    });
    if (writeReceipts) {
      try { receiptPath = await writeReceipt(receipt); }
      catch (writeErr6) {
        pushIssue(warnings, 'receipt-write-failed', 'Could not write request receipt.', summarizeError(writeErr6));
        receipt.warnings = warnings.concat(asArray(enqueueResult && enqueueResult.warnings));
      }
    }
    return resultFromReceipt(receipt, {
      receiptPath: receiptPath,
      enqueued: true,
      enqueueResult: enqueueResult || null,
      byteLength: bytes,
    });
  }

  async function scanSavedChatArchiveRequestInboxV1(options) {
    options = safeObject(options);
    state.lastScanAt = nowIso();
    var limit = normalizeLimit(options.limit, DEFAULT_SCAN_LIMIT);
    var writeReceipts = options.writeReceipts !== false;
    var maxBytes = normalizeSizeCap(options.maxBytes || options.sizeCapBytes);
    var result = {
      ok: false,
      schema: SCAN_SCHEMA,
      status: 'scan-started',
      generatedAt: nowIso(),
      rootPath: '$HOME/' + ROOT_DIR,
      inboxPath: '$HOME/' + INBOX_DIR,
      receiptsPath: '$HOME/' + RECEIPTS_DIR,
      limit: limit,
      sizeCapBytes: maxBytes,
      scanned: 0,
      processed: 0,
      receiptsWritten: 0,
      rejected: 0,
      duplicates: 0,
      validated: 0,
      needsDesktopSnapshot: 0,
      dbUnavailable: 0,
      warnings: [],
      blockers: [],
      items: [],
      packageWriteDeferred: true,
      materializeTriggered: false,
    };
    var entries;
    try {
      entries = await fsReadDir(INBOX_DIR);
    } catch (readErr) {
      if (isMissingFileError(readErr)) {
        result.ok = true;
        result.status = 'inbox-missing';
        pushIssue(result.warnings, 'inbox-missing', 'Archive request inbox does not exist yet.', { inboxPath: result.inboxPath });
        return result;
      }
      result.status = 'inbox-read-failed';
      pushIssue(result.blockers, 'inbox-read-failed', 'Could not list archive request inbox.', summarizeError(readErr));
      return result;
    }

    var names = [];
    asArray(entries).forEach(function (entry) {
      result.scanned += 1;
      var name = entryName(entry);
      if (!name || name.charAt(0) === '.') return;
      if (name.endsWith('.tmp')) return;
      if (entryIsDirectory(entry)) return;
      if (!REQUEST_FILE_RE.test(name)) return;
      names.push(name);
    });
    names.sort();
    names = names.slice(0, limit);

    for (var i = 0; i < names.length; i += 1) {
      var item = await processSavedChatArchiveRequestInboxFileV1({
        fileName: names[i],
        writeReceipt: writeReceipts,
        maxBytes: maxBytes,
      });
      result.processed += 1;
      if (item.receiptPath) result.receiptsWritten += 1;
      if (item.status === 'validated') result.validated += 1;
      else if (item.status === 'duplicate') result.duplicates += 1;
      else if (item.status === 'needs-desktop-snapshot') result.needsDesktopSnapshot += 1;
      else if (item.status === 'db-unavailable') result.dbUnavailable += 1;
      else if (item.status === 'rejected') result.rejected += 1;
      if (item.receipt && item.receipt.warnings && item.receipt.warnings.length) {
        result.warnings = result.warnings.concat(item.receipt.warnings);
      }
      if (item.receipt && item.receipt.blockers && item.receipt.blockers.length) {
        result.blockers = result.blockers.concat(item.receipt.blockers);
      }
      result.items.push({
        fileName: names[i],
        status: item.status,
        requestId: item.requestId || null,
        dedupeKey: item.dedupeKey || null,
        receiptPath: item.receiptPath || null,
        enqueued: item.enqueued === true,
      });
    }

    result.ok = result.blockers.length === 0;
    result.status = result.processed === 0
      ? 'empty'
      : (result.blockers.length ? 'completed-with-blockers' : (result.warnings.length ? 'completed-with-warnings' : 'completed'));
    return result;
  }

  async function diagnoseSavedChatArchiveRequestInboxV1(options) {
    options = safeObject(options);
    var result = {
      ok: true,
      schema: DIAGNOSTIC_SCHEMA,
      moduleVersion: MODULE_VERSION,
      generatedAt: nowIso(),
      desktopOnly: true,
      manualScanOnly: true,
      watcher: false,
      polling: false,
      rootPath: '$HOME/' + ROOT_DIR,
      inboxPath: '$HOME/' + INBOX_DIR,
      receiptsPath: '$HOME/' + RECEIPTS_DIR,
      baseDir: HOME_BASE_DIR,
      sizeCapBytes: normalizeSizeCap(options.maxBytes || options.sizeCapBytes),
      apis: {
        enqueueSavedChatArchiveRequestV1: typeof (H2O.Studio.ingestion && H2O.Studio.ingestion.enqueueSavedChatArchiveRequestV1) === 'function',
        diagnoseSavedChatArchiveRequestInboxV1: true,
        scanSavedChatArchiveRequestInboxV1: true,
        processSavedChatArchiveRequestInboxFileV1: true,
      },
      boundaries: {
        packageWriteDeferred: true,
        materializeTriggered: false,
        chromeDelivery: false,
        syncTransport: false,
        fileSystemAccessApi: false,
        nativeBridge: false,
        localRelay: false,
        importRecovery: false,
        archivePackageMutation: false,
        casWrites: false,
        requestFileMutation: false,
      },
      state: {
        installedAt: state.installedAt,
        lastScanAt: state.lastScanAt,
        lastProcessAt: state.lastProcessAt,
        lastReceiptPath: state.lastReceiptPath,
        lastError: state.lastError,
      },
      warnings: [],
      blockers: [],
    };
    try {
      await fsReadDir(INBOX_DIR);
      result.inboxReachable = true;
    } catch (err) {
      result.inboxReachable = false;
      if (isMissingFileError(err)) {
        pushIssue(result.warnings, 'inbox-missing', 'Archive request inbox does not exist yet.', { inboxPath: result.inboxPath });
      } else {
        result.ok = false;
        pushIssue(result.blockers, 'inbox-read-failed', 'Could not list archive request inbox.', summarizeError(err));
      }
    }
    return result;
  }

  H2O.Studio.ingestion.diagnoseSavedChatArchiveRequestInboxV1 = diagnoseSavedChatArchiveRequestInboxV1;
  H2O.Studio.ingestion.scanSavedChatArchiveRequestInboxV1 = scanSavedChatArchiveRequestInboxV1;
  H2O.Studio.ingestion.processSavedChatArchiveRequestInboxFileV1 = processSavedChatArchiveRequestInboxFileV1;
})(typeof globalThis !== 'undefined' ? globalThis : this);
