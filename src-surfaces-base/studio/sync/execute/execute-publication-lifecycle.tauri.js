/* H2O Desktop Sync - F14.6.4 execute publication lifecycle
 *
 * Append-only execute publication lifecycle ledger.
 *
 * Safety invariants:
 *   - Publication ledger only. No relay enqueue/dispatch, no Native execution,
 *     no F5 execution, no apply, no watermark writes, no consumed-operation
 *     writes, no timers, and no polling.
 *   - Every lifecycle change appends an event. Existing rows are preserved.
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
  if (H2O.Desktop.Sync.__executePublicationLifecycleInstalled) return;

  var VERSION = '0.1.0-f14.6.4';
  var LEDGER_KEY = 'h2o:sync:execute-publication-lifecycle:v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.execute-publication-ledger.v1';
  var EVENT_SCHEMA = 'h2o.desktop.sync.execute-publication-event.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.execute-publication-row.v1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-publication-result.v1';
  var STATUSES = ['generated', 'published', 'blocked', 'failed', 'expired', 'superseded', 'withdrawn'];
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message', 'turns',
    'attachments', 'files', 'rawId', 'chatId', 'snapshotId', 'folderId',
    'accountId', 'title', 'name', 'path', 'url', 'href', 'password',
    'apiKey', 'accessToken', 'refreshToken', 'token'
  ];

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
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
  }
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
    for (var i = 0; i < bytes.length; i += 1) {
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

  function sideEffectSummary() {
    return {
      publicationLedgerTouched: true,
      relayTouched: false,
      relayDispatched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Executed: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
  }
  function allNonPublicationSideEffectsFalse(map) {
    var value = safeObject(map);
    return value.publicationLedgerTouched === true &&
      value.relayTouched === false &&
      value.relayDispatched === false &&
      value.outboxTouched === false &&
      value.nativeCalled === false &&
      value.f5Executed === false &&
      value.applyExecuted === false &&
      value.watermarkWritten === false &&
      value.consumedOperationWritten === false;
  }
  function buildResult(opts) {
    opts = safeObject(opts);
    var blockers = codeList(opts.blockers);
    var warnings = codeList(opts.warnings);
    var ok = typeof opts.ok === 'boolean' ? opts.ok : blockers.length === 0;
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      appended: opts.appended === true,
      row: opts.row || null,
      rows: opts.rows || [],
      event: opts.event || null,
      privacyScan: opts.privacyScan || null,
      sideEffectSummary: sideEffectSummary(),
      blockers: blockers,
      warnings: warnings,
      metadata: opts.metadata || {}
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.createResult === 'function') {
      try {
        var shaped = kernel.createResult({
          schema: RESULT_SCHEMA,
          ok: payload.ok,
          actionable: payload.ok,
          blockers: payload.blockers,
          warnings: payload.warnings,
          metadata: { domain: 'execute', version: VERSION }
        });
        if (shaped && typeof shaped === 'object') {
          payload.ok = shaped.ok === true;
          payload.blockers = codeList(shaped.blockers);
          payload.warnings = codeList(shaped.warnings);
        }
      } catch (_) { /* keep local result */ }
    }
    return payload;
  }
  function failure(blockers, warnings, extra) {
    return buildResult(Object.assign({}, safeObject(extra), {
      ok: false,
      appended: false,
      blockers: blockers,
      warnings: warnings
    }));
  }

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
  async function readLedger(options) {
    var memory = safeObject(options).__memoryLedger;
    if (memory && memory.schema === LEDGER_SCHEMA) return normalizeLedger(memory);
    return normalizeLedger(await storageGet(LEDGER_KEY));
  }
  async function writeLedger(ledger, options) {
    var memory = safeObject(options).__memoryLedger;
    if (memory && memory.schema === LEDGER_SCHEMA) {
      memory.createdAtIso = ledger.createdAtIso;
      memory.updatedAtIso = ledger.updatedAtIso;
      memory.events = ledger.events.slice();
      return;
    }
    await storageSet(LEDGER_KEY, ledger);
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrayHit = foreverNoKey(value[i]);
        if (arrayHit) return arrayHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (FOREVER_NO_FIELDS.indexOf(key) !== -1) return key;
      if (/token$/i.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }
  function domainPrivacyTag(domainId) {
    if (domainId === 'chat') return 'chat.metadata';
    if (domainId === 'snapshot') return 'snapshot.conversation';
    if (domainId === 'capture') return 'capture.artifact';
    return cleanString(domainId);
  }
  function scanPrivacy(envelope, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var result = null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        result = kernel.scanDomainForbiddenFields(domainPrivacyTag(envelope.domainId), envelope);
      } catch (_) {
        addCode(blockers, 'execute-publication-privacy-scan-threw');
      }
    } else if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        result = kernel.scanPrivacy(envelope, {
          subjectType: domainPrivacyTag(envelope.domainId),
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted', 'metadata-only'],
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        });
      } catch (_) {
        addCode(blockers, 'execute-publication-privacy-scan-threw');
      }
    } else {
      addCode(blockers, 'execute-publication-privacy-scan-unavailable');
    }
    if (result) {
      codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    }
    var forbidden = foreverNoKey(envelope);
    if (forbidden) {
      addCode(blockers, 'execute-publication-privacy-violation');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return result || { ok: false, blockers: ['execute-publication-privacy-scan-unavailable'], warnings: [] };
  }
  function validationSummary(input) {
    var source = safeObject(input);
    return {
      ok: source.ok === true,
      actionable: source.actionable === true,
      blockers: codeList(source.blockers),
      warnings: codeList(source.warnings)
    };
  }
  async function publicationIdFor(envelope, options) {
    var explicit = cleanString(safeObject(options).publicationId);
    if (explicit) return explicit;
    return await sha256Hex({
      schema: 'h2o.desktop.sync.execute-publication-id-input.v1',
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      lineageId: cleanString(envelope.lineageId)
    });
  }
  function rowFromEvent(event) {
    var e = safeObject(event);
    return {
      schema: ROW_SCHEMA,
      publicationId: cleanString(e.publicationId),
      status: cleanString(e.status),
      envelopeKind: cleanString(e.envelopeKind),
      domainId: cleanString(e.domainId),
      operationKind: cleanString(e.operationKind),
      subjectId: cleanLower(e.subjectId),
      lineageId: cleanString(e.lineageId),
      dedupeKey: cleanLower(e.dedupeKey),
      eventDigest: cleanLower(e.eventDigest),
      publicationEventId: cleanLower(e.publicationEventId),
      publicationEventAtIso: cleanString(e.publicationEventAtIso),
      createdAtIso: cleanString(e.createdAtIso),
      updatedAtIso: cleanString(e.publicationEventAtIso || e.updatedAtIso),
      validationSummary: validationSummary(e.validationSummary),
      privacyScan: safeObject(e.privacyScan)
    };
  }
  function reduceRows(ledger) {
    var byId = {};
    asArray(ledger && ledger.events).forEach(function (event) {
      var row = rowFromEvent(event);
      if (!row.publicationId) return;
      var existing = byId[row.publicationId];
      if (!existing || Date.parse(row.updatedAtIso) >= Date.parse(existing.updatedAtIso || '')) {
        byId[row.publicationId] = row;
      }
    });
    return Object.keys(byId).sort().map(function (key) { return byId[key]; });
  }
  function findCurrentRow(ledger, publicationId) {
    var id = cleanString(publicationId);
    var rows = reduceRows(ledger);
    for (var i = 0; i < rows.length; i += 1) {
      if (rows[i].publicationId === id) return rows[i];
    }
    return null;
  }
  function duplicateEventExists(ledger, publicationId, dedupeKey, eventDigest, status, publicationEventId) {
    var pid = cleanString(publicationId);
    var dedupe = cleanLower(dedupeKey);
    var digest = cleanLower(eventDigest);
    var state = cleanString(status);
    var eventId = cleanLower(publicationEventId);
    return asArray(ledger && ledger.events).some(function (event) {
      var e = safeObject(event);
      if (eventId && cleanLower(e.publicationEventId) === eventId) return true;
      return cleanString(e.publicationId) === pid &&
        cleanLower(e.dedupeKey) === dedupe &&
        cleanLower(e.eventDigest) === digest &&
        cleanString(e.status) === state;
    });
  }
  async function eventIdFor(parts) {
    return await sha256Hex({
      schema: EVENT_SCHEMA,
      publicationId: cleanString(parts.publicationId),
      status: cleanString(parts.status),
      dedupeKey: cleanLower(parts.dedupeKey),
      eventDigest: cleanLower(parts.eventDigest),
      publicationEventAtIso: cleanString(parts.publicationEventAtIso)
    });
  }
  async function buildEvent(envelope, preflightResult, status, options, privacyScan) {
    var opts = safeObject(options);
    var atIso = cleanString(opts.publicationEventAtIso || opts.nowIso || nowIsoSeconds());
    var publicationId = await publicationIdFor(envelope, opts);
    var event = {
      schema: EVENT_SCHEMA,
      publicationId: publicationId,
      status: status,
      envelopeKind: cleanString(envelope.envelopeKind),
      domainId: cleanString(envelope.domainId),
      operationKind: cleanString(envelope.operationKind),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      eventDigest: cleanLower(envelope.eventDigest),
      publicationEventId: '',
      publicationEventAtIso: atIso,
      createdAtIso: cleanString(opts.createdAtIso || envelope.createdAtIso || atIso),
      validationSummary: validationSummary(preflightResult),
      privacyScan: safeObject(privacyScan)
    };
    event.publicationEventId = cleanLower(opts.publicationEventId || await eventIdFor(event));
    return event;
  }
  function validateStatus(status, blockers) {
    if (STATUSES.indexOf(cleanString(status)) === -1) addCode(blockers, 'execute-publication-status-invalid');
  }
  function validateEnvelope(envelope, blockers, warnings) {
    if (typeof H2O.Desktop.Sync.validateExecuteEnvelope !== 'function') {
      addCode(blockers, 'execute-envelope-validator-unavailable');
      return { ok: false, blockers: ['execute-envelope-validator-unavailable'], warnings: [] };
    }
    var result = H2O.Desktop.Sync.validateExecuteEnvelope(envelope);
    codeList(result.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(result.warnings).forEach(function (code) { addCode(warnings, code); });
    return result;
  }
  function validateEvent(event, blockers, warnings) {
    if (event.schema !== EVENT_SCHEMA) addCode(blockers, 'execute-publication-event-schema-invalid');
    if (!cleanString(event.publicationId)) addCode(blockers, 'execute-publicationId-required');
    validateStatus(event.status, blockers);
    if (!isSha256Hex(event.dedupeKey)) addCode(blockers, 'execute-publication-dedupeKey-invalid');
    if (!isSha256Hex(event.eventDigest)) addCode(blockers, 'execute-publication-eventDigest-invalid');
    if (!isSha256Hex(event.publicationEventId)) addCode(blockers, 'execute-publicationEventId-invalid');
    if (!isIso(event.publicationEventAtIso)) addCode(blockers, 'execute-publicationEventAtIso-invalid');
    var forbidden = foreverNoKey(event);
    if (forbidden) {
      addCode(blockers, 'execute-publication-event-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }
  async function appendEvent(event, options, blockers, warnings) {
    var ledger = null;
    try {
      ledger = await readLedger(options);
    } catch (_) {
      addCode(blockers, 'execute-publication-ledger-unavailable');
      return null;
    }
    if (!ledger) {
      addCode(blockers, 'execute-publication-ledger-malformed');
      return null;
    }
    validateEvent(event, blockers, warnings);
    if (duplicateEventExists(
      ledger,
      event.publicationId,
      event.dedupeKey,
      event.eventDigest,
      event.status,
      event.publicationEventId
    )) {
      addCode(blockers, 'duplicate-execute-publication-event');
    }
    if (blockers.length) return ledger;
    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: cleanString(ledger.createdAtIso) || event.createdAtIso,
      updatedAtIso: event.publicationEventAtIso,
      events: ledger.events.concat([event])
    };
    try {
      await writeLedger(next, options);
    } catch (_) {
      addCode(blockers, 'execute-publication-ledger-write-failed');
      return ledger;
    }
    return next;
  }

  async function createExecutePublicationRow(envelope, preflightResult, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var envValidation = validateEnvelope(envelope, blockers, warnings);
    var shapedEnvelope = safeObject(envValidation.envelope || envelope);
    var privacyScan = scanPrivacy(shapedEnvelope, blockers, warnings);
    if (privacyScan && privacyScan.ok !== true) {
      addCode(blockers, 'execute-publication-privacy-blocked');
    }
    if (envValidation.ok !== true) {
      addCode(blockers, 'execute-publication-envelope-invalid');
    }
    if (blockers.length) return failure(blockers, warnings, { privacyScan: privacyScan });

    var preflight = validationSummary(preflightResult);
    var status = preflight.ok === true && preflight.actionable === true ? 'generated' : 'blocked';
    var event = await buildEvent(shapedEnvelope, preflightResult, status, opts, privacyScan);
    var appendBlockers = [];
    var appendWarnings = warnings.slice();
    var ledger = await appendEvent(event, opts, appendBlockers, appendWarnings);
    if (appendBlockers.length) {
      return failure(appendBlockers, appendWarnings, { event: event, privacyScan: privacyScan });
    }
    return buildResult({
      ok: true,
      appended: true,
      row: rowFromEvent(event),
      rows: reduceRows(ledger),
      event: event,
      privacyScan: privacyScan,
      warnings: appendWarnings,
      metadata: { status: status, storageKey: LEDGER_KEY }
    });
  }

  async function transitionExecutePublicationRow(publicationId, nextStatus, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    validateStatus(nextStatus, blockers);
    var id = cleanString(publicationId);
    if (!id) addCode(blockers, 'execute-publicationId-required');
    if (blockers.length) return failure(blockers, warnings);

    var ledger = null;
    try {
      ledger = await readLedger(opts);
    } catch (_) {
      return failure(['execute-publication-ledger-unavailable'], warnings);
    }
    if (!ledger) return failure(['execute-publication-ledger-malformed'], warnings);
    var current = findCurrentRow(ledger, id);
    if (!current) return failure(['execute-publication-row-not-found'], warnings);

    var envelope = {
      envelopeKind: current.envelopeKind,
      domainId: current.domainId,
      operationKind: current.operationKind,
      subjectId: current.subjectId,
      lineageId: current.lineageId,
      dedupeKey: current.dedupeKey,
      eventDigest: current.eventDigest,
      createdAtIso: current.createdAtIso
    };
    var privacyScan = current.privacyScan || {};
    var event = await buildEvent(envelope, current.validationSummary, cleanString(nextStatus), Object.assign({}, opts, {
      publicationId: id,
      createdAtIso: current.createdAtIso
    }), privacyScan);
    var appendBlockers = [];
    var appendWarnings = warnings.slice();
    var nextLedger = await appendEvent(event, opts, appendBlockers, appendWarnings);
    if (appendBlockers.length) return failure(appendBlockers, appendWarnings, { event: event, privacyScan: privacyScan });
    return buildResult({
      ok: true,
      appended: true,
      row: rowFromEvent(event),
      rows: reduceRows(nextLedger),
      event: event,
      privacyScan: privacyScan,
      warnings: appendWarnings,
      metadata: { status: cleanString(nextStatus), storageKey: LEDGER_KEY }
    });
  }

  async function getExecutePublicationRow(publicationId, options) {
    var opts = safeObject(options);
    var id = cleanString(publicationId);
    if (!id) return failure(['execute-publicationId-required'], []);
    var ledger = null;
    try {
      ledger = await readLedger(opts);
    } catch (_) {
      return failure(['execute-publication-ledger-unavailable'], []);
    }
    if (!ledger) return failure(['execute-publication-ledger-malformed'], []);
    var row = findCurrentRow(ledger, id);
    if (!row) return failure(['execute-publication-row-not-found'], []);
    return buildResult({ ok: true, row: row, rows: [], metadata: { storageKey: LEDGER_KEY } });
  }

  async function listExecutePublicationRowsByDedupe(dedupeKey, options) {
    var opts = safeObject(options);
    var key = cleanLower(isObject(dedupeKey) ? dedupeKey.dedupeKey : dedupeKey);
    if (!isSha256Hex(key)) return failure(['execute-publication-dedupeKey-invalid'], []);
    var ledger = null;
    try {
      ledger = await readLedger(opts);
    } catch (_) {
      return failure(['execute-publication-ledger-unavailable'], []);
    }
    if (!ledger) return failure(['execute-publication-ledger-malformed'], []);
    var rows = reduceRows(ledger).filter(function (row) { return row.dedupeKey === key; });
    return buildResult({ ok: true, rows: rows, metadata: { storageKey: LEDGER_KEY, dedupeKey: key } });
  }

  async function proofEnvelope(label, overrides) {
    var args = safeObject(overrides);
    return await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'proposal-receipt',
      domainId: 'snapshot',
      operationKind: 'snapshot-proof-operation',
      subjectId: cleanLower(args.subjectId || await sha256Hex('execute-publication-proof-subject:' + label)),
      lineageId: 'execute-publication-proof-lineage-' + label,
      dedupeKey: cleanLower(args.dedupeKey || await sha256Hex('execute-publication-proof-dedupe:' + label)),
      dispatchProfile: {
        requiresF5: false,
        requiresNative: true,
        requiresRelay: false,
        nativeCommand: 'snapshot.proof.preview',
        nativeIdempotent: true,
        f5QueueKey: '',
        retryPolicy: { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' }
      },
      payloadShapes: args.payloadShapes || {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-publication-proof-receipt.v1',
          redactionClass: 'redacted',
          receiptDigest: await sha256Hex('execute-publication-proof-receipt:' + label)
        }
      },
      settlementShapes: {
        redactionClass: 'redacted',
        journalPhase: 'accepted',
        settlementDigest: await sha256Hex('execute-publication-proof-settlement:' + label)
      },
      createdAtIso: '2026-06-01T10:00:00Z'
    });
  }
  async function runExecutePublicationLifecycleProof() {
    var blockers = [];
    var warnings = [];
    if (typeof H2O.Desktop.Sync.shapeExecuteEnvelope !== 'function') {
      return failure(['execute-envelope-shaper-unavailable'], []);
    }
    var memoryLedger = normalizeLedger(null);
    memoryLedger.createdAtIso = '2026-06-01T10:00:00Z';
    var opts = { __memoryLedger: memoryLedger, publicationEventAtIso: '2026-06-01T10:00:00Z' };
    var envelope = await proofEnvelope('valid');
    var okPreflight = { ok: true, actionable: true, blockers: [], warnings: [] };
    var generated = await createExecutePublicationRow(envelope, okPreflight, opts);
    if (!generated.ok || cleanString(safeObject(generated.row).status) !== 'generated') {
      addCode(blockers, 'proof-generated-row-failed');
    }

    var blockedEnvelope = await proofEnvelope('blocked');
    var blocked = await createExecutePublicationRow(blockedEnvelope, {
      ok: false,
      actionable: false,
      blockers: ['proof-preflight-blocker'],
      warnings: []
    }, Object.assign({}, opts, { publicationEventAtIso: '2026-06-01T10:01:00Z' }));
    if (!blocked.ok || cleanString(safeObject(blocked.row).status) !== 'blocked') {
      addCode(blockers, 'proof-blocked-row-failed');
    }

    var transition = await transitionExecutePublicationRow(generated.row.publicationId, 'published', Object.assign({}, opts, {
      publicationEventAtIso: '2026-06-01T10:02:00Z'
    }));
    if (!transition.ok || cleanString(safeObject(transition.row).status) !== 'published') {
      addCode(blockers, 'proof-transition-published-failed');
    }

    var duplicate = await transitionExecutePublicationRow(generated.row.publicationId, 'published', Object.assign({}, opts, {
      publicationEventAtIso: '2026-06-01T10:02:00Z'
    }));
    if (duplicate.ok) addCode(blockers, 'proof-duplicate-publication-event-accepted');

    var invalidStatus = await transitionExecutePublicationRow(generated.row.publicationId, 'relayed', Object.assign({}, opts, {
      publicationEventAtIso: '2026-06-01T10:03:00Z'
    }));
    if (invalidStatus.ok) addCode(blockers, 'proof-invalid-status-accepted');

    var privacyEnvelope = await proofEnvelope('privacy', {
      payloadShapes: {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-publication-proof-receipt.v1',
          redactionClass: 'redacted',
          title: 'raw title must not publish'
        }
      }
    });
    var privacy = await createExecutePublicationRow(privacyEnvelope, okPreflight, Object.assign({}, opts, {
      publicationEventAtIso: '2026-06-01T10:04:00Z'
    }));
    if (privacy.ok) addCode(blockers, 'proof-privacy-violation-accepted');

    var lookup = await getExecutePublicationRow(generated.row.publicationId, opts);
    var list = await listExecutePublicationRowsByDedupe(envelope.dedupeKey, opts);
    if (!lookup.ok || safeObject(lookup.row).status !== 'published') addCode(blockers, 'proof-get-row-failed');
    if (!list.ok || list.rows.length !== 1) addCode(blockers, 'proof-list-by-dedupe-failed');
    if (!allNonPublicationSideEffectsFalse(sideEffectSummary())) addCode(blockers, 'proof-side-effect-flags-invalid');

    return buildResult({
      ok: blockers.length === 0,
      appended: false,
      row: lookup.row || null,
      rows: reduceRows(memoryLedger),
      blockers: blockers,
      warnings: warnings,
      metadata: {
        proof: 'execute-publication-lifecycle',
        validPreflightGenerated: generated.ok === true && safeObject(generated.row).status === 'generated',
        blockedPreflightRecorded: blocked.ok === true && safeObject(blocked.row).status === 'blocked',
        generatedToPublished: transition.ok === true && safeObject(transition.row).status === 'published',
        duplicateBlocked: duplicate.ok !== true,
        invalidStatusBlocked: invalidStatus.ok !== true,
        privacyViolationBlocked: privacy.ok !== true,
        noExecutionSideEffects: allNonPublicationSideEffectsFalse(sideEffectSummary())
      }
    });
  }

  H2O.Desktop.Sync.createExecutePublicationRow = createExecutePublicationRow;
  H2O.Desktop.Sync.transitionExecutePublicationRow = transitionExecutePublicationRow;
  H2O.Desktop.Sync.getExecutePublicationRow = getExecutePublicationRow;
  H2O.Desktop.Sync.listExecutePublicationRowsByDedupe = listExecutePublicationRowsByDedupe;
  H2O.Desktop.Sync.runExecutePublicationLifecycleProof = runExecutePublicationLifecycleProof;
  H2O.Desktop.Sync.__executePublicationLifecycleInstalled = true;
  H2O.Desktop.Sync.__executePublicationLifecycleVersion = VERSION;
  H2O.Desktop.Sync.__executePublicationLifecycleLedgerKey = LEDGER_KEY;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
