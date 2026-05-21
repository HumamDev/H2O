/* H2O Studio Sync — Outbound Export Log (F3)
 *
 * Producer-side ledger for the multi-peer sync envelope. Tracks
 * sequenceNumber and exportId minting across exports. Only the disk-writing
 * exporter (H2O.Studio.ingestion.exportLatestSyncBundle) mints + persists
 * entries. exportFullBundle does NOT mutate this log — it is "preview"
 * shaped and must not look like a real export event.
 *
 * Storage (single key, surface-agnostic):
 *   chrome.storage.local['h2o:sync:export-log:v1']
 *   On Desktop the Tauri kv_store shim backs chrome.storage.local. On Chrome
 *   MV3 it is native chrome.storage.local. Same key on both.
 *
 * Public API:
 *   H2O.Studio.exportLog.read()
 *     → Promise<Log | null>   Returns the persisted log if valid; null otherwise.
 *
 *   H2O.Studio.exportLog.recordExport({ syncPeerId, outboundPath })
 *     → Promise<{ exportId, sequenceNumber, previousExportId, exportedAt }>
 *     Increments sequenceNumber, mints a fresh exportId, sets
 *     previousExportId to the prior lastExportId, persists the log, and
 *     returns the event tuple. The caller stamps these fields onto the
 *     outbound bundle.
 *
 *     If the persisted log is missing, malformed, or carries a different
 *     syncPeerId than supplied, a fresh log is started with sequence 1 and
 *     a single warning is logged.
 *
 *   H2O.Studio.exportLog.constants
 *     → { KEY, SCHEMA, HISTORY_MAX }
 *
 * Persistence shape:
 *   {
 *     schema:          'h2o.studio.export-log.v1',
 *     syncPeerId:      '<surface>:<app>:<store>:<installId>',
 *     lastExportId:    '<uuidv4>' | null,
 *     lastExportedAt:  '<ISO>' | '',
 *     sequenceNumber:  <integer>,
 *     exportHistory:   [{ exportId, sequenceNumber, exportedAt, outboundPath }]
 *   }
 *
 *   exportHistory is capped at HISTORY_MAX (50) entries. Oldest evicted.
 *
 * Atomicity:
 *   The log is persisted BEFORE the caller writes the bundle file. If the
 *   bundle write subsequently fails, the sequence number is "burned" — that
 *   is acceptable; gaps are tolerable. Re-use is not.
 *
 * Hard constraints:
 *   - Single persistent key 'h2o:sync:export-log:v1'.
 *   - No writes to any other storage.
 *   - No identity minting (that is F2's job; read identity via
 *     H2O.Studio.identity if needed by the caller).
 *   - No envelope construction (that is the exporter's job).
 *
 * Idempotency:
 *   IIFE checks H2O.Studio.exportLog.__exportLogInstalled and exits if true.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.exportLog = H2O.Studio.exportLog || {};
  if (H2O.Studio.exportLog.__exportLogInstalled) return;

  /* ─── Constants ───────────────────────────────────────────────────── */

  var LOG_KEY            = 'h2o:sync:export-log:v1';
  var LOG_SCHEMA         = 'h2o.studio.export-log.v1';
  var MODULE_VERSION     = '0.1.0-f3';
  var EXPORT_HISTORY_MAX = 50;

  /* ─── Tiny helpers ────────────────────────────────────────────────── */

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }
  function isString(x) { return typeof x === 'string'; }
  function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }

  /* UUIDv4 — prefer native, fall back to crypto.getRandomValues. */
  function uuidv4() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;  // v4
    b[8] = (b[8] & 0x3f) | 0x80;  // RFC variant
    var hex = [];
    for (var i = 0; i < 16; i++) {
      hex.push((b[i] >>> 4).toString(16));
      hex.push((b[i] & 0x0f).toString(16));
    }
    return hex.slice(0, 8).join('') + '-' +
           hex.slice(8, 12).join('') + '-' +
           hex.slice(12, 16).join('') + '-' +
           hex.slice(16, 20).join('') + '-' +
           hex.slice(20).join('');
  }
  var UUIDV4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function isUuidv4(s) { return isString(s) && UUIDV4_RE.test(s); }

  function warnOnce(msg) {
    try { console.warn('[H2O F3 export-log] ' + msg); }
    catch (_) { /* ignore */ }
  }

  /* ─── chrome.storage.local adapter ────────────────────────────────── */

  function storageGet(key) {
    return new Promise(function (resolve, reject) {
      try {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local
            || typeof global.chrome.storage.local.get !== 'function') {
          resolve(null);
          return;
        }
        global.chrome.storage.local.get([key], function (items) {
          var lastError = global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
        });
      } catch (e) { reject(e); }
    });
  }
  function storageSet(key, value) {
    return new Promise(function (resolve, reject) {
      try {
        if (!global.chrome || !global.chrome.storage || !global.chrome.storage.local
            || typeof global.chrome.storage.local.set !== 'function') {
          reject(new Error('chrome.storage.local unavailable'));
          return;
        }
        var payload = {};
        payload[key] = value;
        global.chrome.storage.local.set(payload, function () {
          var lastError = global.chrome.runtime && global.chrome.runtime.lastError;
          if (lastError) { reject(new Error(String(lastError.message || lastError))); return; }
          resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  /* ─── Validation + log shape ──────────────────────────────────────── */

  function validateLog(raw) {
    if (!isObject(raw))                                   return { ok: false, reason: 'not-an-object' };
    if (raw.schema !== LOG_SCHEMA)                        return { ok: false, reason: 'schema-mismatch' };
    if (!isString(raw.syncPeerId))                        return { ok: false, reason: 'missing-syncPeerId' };
    if (typeof raw.sequenceNumber !== 'number'
        || !isFinite(raw.sequenceNumber)
        || raw.sequenceNumber < 0)                        return { ok: false, reason: 'bad-sequenceNumber' };
    if (raw.lastExportId !== null && !isUuidv4(raw.lastExportId)) {
      return { ok: false, reason: 'bad-lastExportId' };
    }
    if (!isString(raw.lastExportedAt))                    return { ok: false, reason: 'missing-lastExportedAt' };
    if (!Array.isArray(raw.exportHistory))                return { ok: false, reason: 'bad-exportHistory' };
    return { ok: true };
  }

  function freshLog(syncPeerId) {
    return {
      schema:         LOG_SCHEMA,
      syncPeerId:     syncPeerId || '',
      lastExportId:   null,
      lastExportedAt: '',
      sequenceNumber: 0,
      exportHistory:  []
    };
  }

  /* ─── Public API ──────────────────────────────────────────────────── */

  function read() {
    return storageGet(LOG_KEY).then(function (raw) {
      if (!raw) return null;
      var v = validateLog(raw);
      if (!v.ok) return null;
      return raw;
    });
  }

  function recordExport(input) {
    var inp          = isObject(input) ? input : {};
    var outboundPath = isString(inp.outboundPath) ? inp.outboundPath : '';
    var syncPeerId   = isString(inp.syncPeerId)   ? inp.syncPeerId   : '';

    return storageGet(LOG_KEY).then(function (raw) {
      var log;
      if (!raw) {
        log = freshLog(syncPeerId);
      } else {
        var v = validateLog(raw);
        if (!v.ok) {
          warnOnce('existing log invalid (' + v.reason + '); starting fresh.');
          log = freshLog(syncPeerId);
        } else if (syncPeerId && raw.syncPeerId && raw.syncPeerId !== syncPeerId) {
          /* The peer changed under us (identity reset, ADR-0006 storage-kind
           * migration, etc.). Start a fresh log for the new peer. */
          warnOnce('syncPeerId changed (' + raw.syncPeerId + ' → ' + syncPeerId + '); starting fresh log.');
          log = freshLog(syncPeerId);
        } else {
          log = raw;
          if (!log.syncPeerId && syncPeerId) log.syncPeerId = syncPeerId;
        }
      }

      var previousExportId = log.lastExportId || null;
      var newExportId      = uuidv4();
      var newSequence      = (log.sequenceNumber || 0) + 1;
      var exportedAt       = nowIso();

      log.lastExportId   = newExportId;
      log.lastExportedAt = exportedAt;
      log.sequenceNumber = newSequence;

      var history = Array.isArray(log.exportHistory) ? log.exportHistory.slice() : [];
      history.push({
        exportId:       newExportId,
        sequenceNumber: newSequence,
        exportedAt:     exportedAt,
        outboundPath:   outboundPath
      });
      if (history.length > EXPORT_HISTORY_MAX) {
        history = history.slice(history.length - EXPORT_HISTORY_MAX);
      }
      log.exportHistory = history;

      return storageSet(LOG_KEY, log).then(function () {
        return {
          exportId:         newExportId,
          sequenceNumber:   newSequence,
          previousExportId: previousExportId,
          exportedAt:       exportedAt
        };
      });
    });
  }

  /* ─── Registration ────────────────────────────────────────────────── */

  H2O.Studio.exportLog.read         = read;
  H2O.Studio.exportLog.recordExport = recordExport;
  H2O.Studio.exportLog.constants    = Object.freeze({
    KEY:         LOG_KEY,
    SCHEMA:      LOG_SCHEMA,
    HISTORY_MAX: EXPORT_HISTORY_MAX
  });
  H2O.Studio.exportLog.__exportLogInstalled = true;
  H2O.Studio.exportLog.__exportLogVersion   = MODULE_VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
