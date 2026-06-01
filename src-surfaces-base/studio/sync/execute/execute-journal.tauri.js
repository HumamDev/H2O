/* H2O Desktop Sync - F14.6.1 execute journal primitive
 *
 * First Execute Lane runtime primitive. Records redacted execute journal rows
 * only, behind an append-only local ledger.
 *
 * Safety invariants:
 *   - No dispatch, publication, relay/outbox, Native execution, F5 execution,
 *     apply, watermark writes, consumed-operation writes, timers, or polling.
 *   - Ledger append dedupes by (journalRowId, eventDigest).
 *   - Query APIs are read-only projections over the journal ledger.
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
  if (H2O.Desktop.Sync.__executeJournalInstalled) return;

  var VERSION = '0.1.0-f14.6.1';
  var LEDGER_KEY = 'h2o:sync:execute-journal:v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.execute-journal-row.v1';
  var EVENT_SCHEMA = 'h2o.desktop.sync.execute-journal-event.v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.execute-journal-ledger.v1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-journal-result.v1';

  var PHASES = [
    'accepted',
    'preflight-blocked',
    'dispatching',
    'confirmed',
    'settling-consumed',
    'settling-watermark',
    'settling-bookkeeping',
    'settling-publication-terminal',
    'settled',
    'bookkept',
    'failed',
    'requires-f5-closure'
  ];
  var IN_FLIGHT_PHASES = [
    'accepted',
    'dispatching',
    'confirmed',
    'settling-consumed',
    'settling-watermark',
    'settling-bookkeeping',
    'settling-publication-terminal'
  ];
  var DISPATCH_TARGETS = ['relay', 'native', 'f5', 'capture-materialize', 'none'];
  var ENVELOPE_KINDS = ['evidence', 'preview', 'proposal', 'conflictCandidate', 'applyEvent', 'captureEvent'];
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
  function generateUuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) { /* fall through */ }
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
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

  function sideEffectSummary() {
    return {
      dispatchAttempted: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Executed: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      snapshotMutated: false,
      captureMaterialized: false
    };
  }
  function allSideEffectsFalse(map) {
    var value = safeObject(map);
    return Object.keys(sideEffectSummary()).every(function (key) { return value[key] === false; });
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
      counts: opts.counts || countsFor([]),
      storageKey: LEDGER_KEY,
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
  function failure(blockers, warnings, metadata) {
    return buildResult({ ok: false, blockers: blockers, warnings: warnings, metadata: metadata || {} });
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
  function normalizeEvidence(value) {
    var source = safeObject(value);
    var out = {};
    Object.keys(source).sort().forEach(function (key) {
      var item = source[key];
      if (item == null) return;
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') out[key] = item;
      else if (Array.isArray(item)) out[key] = item.map(function (entry) {
        if (entry == null) return null;
        if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') return entry;
        return safeObject(entry);
      });
      else if (isObject(item)) out[key] = safeObject(item);
    });
    return out;
  }
  function rowSummary(row) {
    var r = safeObject(row);
    return {
      schema: ROW_SCHEMA,
      journalRowId: cleanString(r.journalRowId),
      envelopeKind: cleanString(r.envelopeKind),
      domainId: cleanString(r.domainId),
      operationKind: cleanString(r.operationKind),
      subjectId: cleanLower(r.subjectId),
      lineageId: cleanString(r.lineageId),
      dedupeKey: cleanLower(r.dedupeKey),
      eventDigest: cleanLower(r.eventDigest),
      phase: cleanString(r.phase),
      attempt: Number.isInteger(r.attempt) ? r.attempt : 0,
      lastAttemptAtIso: cleanString(r.lastAttemptAtIso),
      dispatchTarget: cleanString(r.dispatchTarget),
      evidence: normalizeEvidence(r.evidence),
      blockers: codeList(r.blockers),
      warnings: codeList(r.warnings),
      createdAtIso: cleanString(r.createdAtIso)
    };
  }
  function eventSummary(event) {
    var e = safeObject(event);
    var row = rowSummary(e.row);
    return {
      schema: EVENT_SCHEMA,
      journalRowId: row.journalRowId,
      eventDigest: row.eventDigest,
      dedupeKey: row.dedupeKey,
      phase: row.phase,
      occurredAtIso: cleanString(e.occurredAtIso) || row.createdAtIso,
      row: row
    };
  }
  function countsFor(rows) {
    var counts = { total: rows.length };
    PHASES.forEach(function (phase) { counts[phase] = 0; });
    DISPATCH_TARGETS.forEach(function (target) { counts['target:' + target] = 0; });
    rows.forEach(function (row) {
      var phase = cleanString(row.phase);
      var target = cleanString(row.dispatchTarget);
      if (Object.prototype.hasOwnProperty.call(counts, phase)) counts[phase] += 1;
      if (Object.prototype.hasOwnProperty.call(counts, 'target:' + target)) counts['target:' + target] += 1;
    });
    return counts;
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
  function rowsFromLedger(ledger) {
    return asArray(ledger && ledger.events).map(function (event) {
      return rowSummary(safeObject(event).row);
    });
  }
  function duplicateExists(ledger, row) {
    var events = asArray(ledger && ledger.events);
    for (var i = 0; i < events.length; i += 1) {
      var existing = rowSummary(safeObject(events[i]).row);
      if (existing.journalRowId === row.journalRowId && existing.eventDigest === row.eventDigest) return true;
    }
    return false;
  }

  async function deriveEventDigest(row) {
    return await sha256Hex({
      schema: EVENT_SCHEMA,
      journalRowId: cleanString(row.journalRowId),
      envelopeKind: cleanString(row.envelopeKind),
      domainId: cleanString(row.domainId),
      operationKind: cleanString(row.operationKind),
      subjectId: cleanLower(row.subjectId),
      lineageId: cleanString(row.lineageId),
      dedupeKey: cleanLower(row.dedupeKey),
      phase: cleanString(row.phase),
      attempt: Number.isInteger(row.attempt) ? row.attempt : 0,
      lastAttemptAtIso: cleanString(row.lastAttemptAtIso),
      dispatchTarget: cleanString(row.dispatchTarget),
      evidence: normalizeEvidence(row.evidence),
      blockers: codeList(row.blockers),
      warnings: codeList(row.warnings),
      createdAtIso: cleanString(row.createdAtIso)
    });
  }

  async function shapeExecuteJournalRow(input) {
    var args = safeObject(input);
    var createdAtIso = cleanString(args.createdAtIso) || nowIsoSeconds();
    var phase = cleanString(args.phase || 'accepted');
    var attempt = Number.isInteger(args.attempt) ? args.attempt : 0;
    var row = {
      schema: ROW_SCHEMA,
      journalRowId: cleanString(args.journalRowId) || generateUuid(),
      envelopeKind: cleanString(args.envelopeKind || 'proposal'),
      domainId: cleanString(args.domainId || 'execute'),
      operationKind: cleanString(args.operationKind),
      subjectId: cleanLower(args.subjectId),
      lineageId: cleanString(args.lineageId),
      dedupeKey: cleanLower(args.dedupeKey),
      eventDigest: cleanLower(args.eventDigest),
      phase: phase,
      attempt: attempt,
      lastAttemptAtIso: cleanString(args.lastAttemptAtIso || (attempt > 0 ? createdAtIso : '')),
      dispatchTarget: cleanString(args.dispatchTarget || 'none'),
      evidence: normalizeEvidence(args.evidence),
      blockers: codeList(args.blockers),
      warnings: codeList(args.warnings),
      createdAtIso: createdAtIso
    };
    if (!row.eventDigest) row.eventDigest = await deriveEventDigest(row);
    return rowSummary(row);
  }

  function validateExecuteJournalRow(row) {
    var r = rowSummary(row);
    var blockers = [];
    var warnings = [];
    if (r.schema !== ROW_SCHEMA) addCode(blockers, 'execute-journal-row-schema-invalid');
    if (!cleanString(r.journalRowId)) addCode(blockers, 'journalRowId-required');
    if (ENVELOPE_KINDS.indexOf(r.envelopeKind) === -1) addCode(blockers, 'envelopeKind-invalid');
    if (!cleanString(r.domainId)) addCode(blockers, 'domainId-required');
    if (!cleanString(r.operationKind)) addCode(blockers, 'operationKind-required');
    if (!isSha256Hex(r.subjectId)) addCode(blockers, 'subjectId-invalid');
    if (!cleanString(r.lineageId)) addCode(blockers, 'lineageId-required');
    if (!isSha256Hex(r.dedupeKey)) addCode(blockers, 'dedupeKey-invalid');
    if (!isSha256Hex(r.eventDigest)) addCode(blockers, 'eventDigest-invalid');
    if (PHASES.indexOf(r.phase) === -1) addCode(blockers, 'phase-invalid');
    if (!Number.isInteger(r.attempt) || r.attempt < 0) addCode(blockers, 'attempt-invalid');
    if (r.lastAttemptAtIso && !isIso(r.lastAttemptAtIso)) addCode(blockers, 'lastAttemptAtIso-invalid');
    if (DISPATCH_TARGETS.indexOf(r.dispatchTarget) === -1) addCode(blockers, 'dispatchTarget-invalid');
    if (!isObject(r.evidence)) addCode(blockers, 'evidence-invalid');
    if (!Array.isArray(r.blockers)) addCode(blockers, 'blockers-invalid');
    if (!Array.isArray(r.warnings)) addCode(blockers, 'warnings-invalid');
    if (!isIso(r.createdAtIso)) addCode(blockers, 'createdAtIso-invalid');
    if (r.phase === 'preflight-blocked' && r.blockers.length === 0) addCode(warnings, 'preflight-blocked-without-blockers');
    if (r.phase === 'failed' && r.blockers.length === 0) addCode(warnings, 'failed-without-blockers');
    var forbidden = foreverNoKey(r);
    if (forbidden) {
      addCode(blockers, 'execute-journal-row-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return buildResult({
      ok: blockers.length === 0,
      row: r,
      blockers: blockers,
      warnings: warnings,
      metadata: { phase: r.phase, dispatchTarget: r.dispatchTarget }
    });
  }

  async function appendRowToLedger(ledger, rowInput) {
    var row = await shapeExecuteJournalRow(rowInput);
    var validation = validateExecuteJournalRow(row);
    if (!validation.ok) return { ok: false, row: row, ledger: ledger, blockers: validation.blockers, warnings: validation.warnings };
    if (duplicateExists(ledger, row)) {
      return { ok: false, row: row, ledger: ledger, blockers: ['duplicate-execute-journal-row'], warnings: validation.warnings };
    }
    var event = eventSummary({ occurredAtIso: row.createdAtIso, row: row });
    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: cleanString(ledger.createdAtIso) || row.createdAtIso,
      updatedAtIso: row.createdAtIso,
      events: asArray(ledger.events).concat([event])
    };
    return { ok: true, row: row, event: event, ledger: next, blockers: [], warnings: validation.warnings };
  }

  async function appendExecuteJournalRow(input) {
    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return failure(['execute-journal-ledger-unavailable'], []);
    }
    if (!ledger) return failure(['execute-journal-ledger-malformed'], []);
    var result = await appendRowToLedger(ledger, input);
    if (!result.ok) return failure(result.blockers, result.warnings, { row: result.row });
    try {
      await storageSet(LEDGER_KEY, result.ledger);
    } catch (_) {
      return failure(['execute-journal-ledger-write-failed'], result.warnings);
    }
    var rows = rowsFromLedger(result.ledger);
    return buildResult({
      ok: true,
      appended: true,
      row: result.row,
      rows: [],
      counts: countsFor(rows),
      warnings: result.warnings,
      metadata: { eventSchema: EVENT_SCHEMA, ledgerSchema: LEDGER_SCHEMA }
    });
  }

  async function readLedgerResult() {
    var ledger;
    try {
      ledger = normalizeLedger(await storageGet(LEDGER_KEY));
    } catch (_) {
      return { ok: false, ledger: null, blockers: ['execute-journal-ledger-unavailable'], warnings: [] };
    }
    if (!ledger) return { ok: false, ledger: null, blockers: ['execute-journal-ledger-malformed'], warnings: [] };
    return { ok: true, ledger: ledger, blockers: [], warnings: [] };
  }

  async function listExecuteJournalRowsByDedupe(dedupeKey) {
    var key = cleanLower(isObject(dedupeKey) ? dedupeKey.dedupeKey : dedupeKey);
    if (!isSha256Hex(key)) return failure(['dedupeKey-invalid'], []);
    var read = await readLedgerResult();
    if (!read.ok) return failure(read.blockers, read.warnings);
    var rows = rowsFromLedger(read.ledger).filter(function (row) { return row.dedupeKey === key; });
    return buildResult({
      ok: true,
      rows: rows,
      counts: countsFor(rows),
      metadata: { query: 'dedupe', dedupeKey: key }
    });
  }

  async function listExecuteJournalRowsInFlight(input) {
    var args = safeObject(input);
    var read = await readLedgerResult();
    if (!read.ok) return failure(read.blockers, read.warnings);
    var rows = rowsFromLedger(read.ledger).filter(function (row) {
      if (IN_FLIGHT_PHASES.indexOf(row.phase) === -1) return false;
      if (cleanString(args.domainId) && row.domainId !== cleanString(args.domainId)) return false;
      if (cleanString(args.dispatchTarget) && row.dispatchTarget !== cleanString(args.dispatchTarget)) return false;
      return true;
    });
    return buildResult({
      ok: true,
      rows: rows,
      counts: countsFor(rows),
      metadata: { query: 'in-flight', phases: IN_FLIGHT_PHASES.join(',') }
    });
  }

  async function proofFixture(seed) {
    var subjectId = await sha256Hex('execute-journal-proof:subject:' + seed);
    var dedupeKey = await sha256Hex('execute-journal-proof:dedupe:' + seed);
    return await shapeExecuteJournalRow({
      journalRowId: 'execute-journal-proof-row-' + seed,
      envelopeKind: 'proposal',
      domainId: 'snapshot',
      operationKind: 'snapshot-archive',
      subjectId: subjectId,
      lineageId: 'execute-journal-proof-lineage-' + seed,
      dedupeKey: dedupeKey,
      phase: 'accepted',
      attempt: 0,
      dispatchTarget: 'none',
      evidence: {
        evidenceSchema: 'h2o.desktop.sync.execute-journal-proof-evidence.v1',
        redactionClass: 'metadata-only',
        proofSeedHash: await sha256Hex('execute-journal-proof:evidence:' + seed)
      },
      createdAtIso: '2026-06-01T10:00:00Z'
    });
  }

  async function runExecuteJournalProof() {
    var blockers = [];
    var warnings = [];
    var ledger = normalizeLedger(null);
    ledger.createdAtIso = '2026-06-01T10:00:00Z';
    var validRow = await proofFixture('valid');
    var validValidation = validateExecuteJournalRow(validRow);
    if (!validValidation.ok) addCode(blockers, 'proof-valid-row-rejected');

    var invalidRow = await shapeExecuteJournalRow(Object.assign({}, validRow, {
      journalRowId: 'execute-journal-proof-row-invalid',
      eventDigest: '',
      phase: 'not-a-phase',
      subjectId: 'not-a-sha'
    }));
    invalidRow.phase = 'not-a-phase';
    invalidRow.subjectId = 'not-a-sha';
    var invalidValidation = validateExecuteJournalRow(invalidRow);
    if (invalidValidation.ok) addCode(blockers, 'proof-invalid-row-accepted');

    var appendOne = await appendRowToLedger(ledger, validRow);
    if (!appendOne.ok) addCode(blockers, 'proof-first-append-rejected');
    ledger = appendOne.ledger || ledger;
    var appendDuplicate = await appendRowToLedger(ledger, validRow);
    if (appendDuplicate.ok) addCode(blockers, 'proof-duplicate-row-accepted');

    var settledRow = await shapeExecuteJournalRow(Object.assign({}, await proofFixture('settled'), {
      journalRowId: 'execute-journal-proof-row-settled',
      phase: 'settled',
      createdAtIso: '2026-06-01T10:01:00Z'
    }));
    var appendSettled = await appendRowToLedger(ledger, settledRow);
    if (!appendSettled.ok) addCode(blockers, 'proof-settled-append-rejected');
    ledger = appendSettled.ledger || ledger;

    var proofRows = rowsFromLedger(ledger);
    var byDedupeRows = proofRows.filter(function (row) { return row.dedupeKey === validRow.dedupeKey; });
    var inFlightRows = proofRows.filter(function (row) { return IN_FLIGHT_PHASES.indexOf(row.phase) !== -1; });
    if (byDedupeRows.length !== 1 || byDedupeRows[0].journalRowId !== validRow.journalRowId) {
      addCode(blockers, 'proof-dedupe-lookup-failed');
    }
    if (inFlightRows.length !== 1 || inFlightRows[0].phase !== 'accepted') {
      addCode(blockers, 'proof-in-flight-query-failed');
    }
    if (!allSideEffectsFalse(sideEffectSummary())) addCode(blockers, 'proof-side-effect-flags-not-false');

    return buildResult({
      ok: blockers.length === 0,
      row: validRow,
      rows: proofRows,
      counts: countsFor(proofRows),
      blockers: blockers,
      warnings: warnings,
      metadata: {
        proof: 'execute-journal',
        validRowAccepted: validValidation.ok === true,
        invalidRowRejected: invalidValidation.ok !== true,
        duplicateRejected: appendDuplicate.ok !== true,
        inFlightCount: inFlightRows.length,
        dedupeLookupCount: byDedupeRows.length,
        sideEffectFlagsAllFalse: allSideEffectsFalse(sideEffectSummary())
      }
    });
  }

  H2O.Desktop.Sync.shapeExecuteJournalRow = shapeExecuteJournalRow;
  H2O.Desktop.Sync.validateExecuteJournalRow = validateExecuteJournalRow;
  H2O.Desktop.Sync.appendExecuteJournalRow = appendExecuteJournalRow;
  H2O.Desktop.Sync.listExecuteJournalRowsByDedupe = listExecuteJournalRowsByDedupe;
  H2O.Desktop.Sync.listExecuteJournalRowsInFlight = listExecuteJournalRowsInFlight;
  H2O.Desktop.Sync.runExecuteJournalProof = runExecuteJournalProof;
  H2O.Desktop.Sync.__executeJournalInstalled = true;
  H2O.Desktop.Sync.__executeJournalVersion = VERSION;
  H2O.Desktop.Sync.__executeJournalLedgerKey = LEDGER_KEY;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
