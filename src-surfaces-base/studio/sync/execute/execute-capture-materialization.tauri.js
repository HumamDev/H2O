/* H2O Desktop Sync - F14.6.11 capture materialization writer
 *
 * Materializes canonical capture fresh/recovery bundles into a local
 * append-only ledger.
 *
 * Safety invariants:
 *   - No relay dispatch, generic Native dispatch, F5 execution, publication
 *     dispatch, consumed-op write, watermark write, or execute settlement.
 *   - Writes only through an existing local storage helper, or caller-supplied
 *     proof memory.
 *   - Dedupe is idempotent by subjectId / eventDigest / dedupeKey.
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
  if (H2O.Desktop.Sync.__captureMaterializationInstalled) return;

  var VERSION = '0.1.0-f14.6.11';
  var LEDGER_KEY = 'h2o:sync:execute-capture-materialization:v1';
  var LEDGER_SCHEMA = 'h2o.desktop.sync.execute-capture-materialization-ledger.v1';
  var ROW_SCHEMA = 'h2o.desktop.sync.execute-capture-materialization-row.v1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-capture-materialization-result.v1';
  var FRESH_ARTIFACT_SCHEMA = 'h2o.capture.artifact.v1';
  var FRESH_EVENT_SCHEMA = 'h2o.capture.event.v1';
  var RECOVERY_SUBJECT_SCHEMA = 'h2o.snapshot.recovery-subject.v1';
  var RECOVERY_EVENT_SCHEMA = 'h2o.snapshot.recovery-event.v1';
  var RECOVERY_FIELDS = [
    'recoveredFromSubjectIdHash',
    'recoveredSubjectIdHash',
    'recoveryProvenance',
    'recoveryTrustGrade',
    'recoveryAtIso',
    'lostSubjectIdHash',
    'shellSubject'
  ];
  var FOREVER_NO_FIELDS = [
    'body', 'content', 'contentHtml', 'contentText', 'html', 'markdown',
    'messages', 'message', 'text', 'title', 'tags', 'routeSuggestion',
    'attachments', 'attachmentBytes', 'file', 'filename', 'path', 'url',
    'href', 'sourceUrl', 'sourcePointer', 'rawSourcePointer',
    'sourcePointerRaw', 'rawPointer', 'accountId', 'chatId', 'snapshotId',
    'turnId', 'itemId', 'messageId', 'msgId', 'model', 'email', 'password',
    'apiKey', 'token', 'accessToken', 'refreshToken'
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
  function isSha256Hex(value) { return /^[0-9a-f]{64}$/.test(cleanLower(value)); }
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

  function sideEffectSummary(flags) {
    var f = safeObject(flags);
    return {
      captureMaterializationTouched: f.captureMaterializationTouched === true,
      executeJournalTouched: f.executeJournalTouched === true,
      relayOutboxTouched: false,
      nativeCalled: f.nativeCalled === true,
      f5Touched: false,
      publicationLedgerTouched: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
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
      rows: opts.rows || [],
      writes: opts.writes || null,
      counts: opts.counts || { rows: 0, artifacts: 0, events: 0, recovery: 0, fresh: 0 },
      storageKey: LEDGER_KEY,
      sideEffectSummary: sideEffectSummary(opts.sideEffects),
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
          metadata: { domain: 'capture', version: VERSION }
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
      blockers: blockers,
      warnings: warnings
    }));
  }

  function hasAnyKey(value, keys) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) if (hasAnyKey(value[i], keys)) return true;
      return false;
    }
    if (!isObject(value)) return false;
    var own = Object.keys(value);
    for (var k = 0; k < own.length; k += 1) {
      if (keys.indexOf(own[k]) !== -1) return true;
      if (hasAnyKey(value[own[k]], keys)) return true;
    }
    return false;
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
  function scanPrivacy(value, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        var scan = kernel.scanPrivacy(value, {
          subjectType: 'capture.artifact',
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted', 'metadata-only'],
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        });
        codeList(scan && scan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(scan && scan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) { addCode(warnings, 'capture-materialization-privacy-scan-threw'); }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'capture-materialization-output-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function storageApi(options) {
    var opts = safeObject(options);
    if (opts.storage && typeof opts.storage.get === 'function' && typeof opts.storage.set === 'function') return opts.storage;
    try {
      var platformStorage = global.H2O && global.H2O.Studio && global.H2O.Studio.platform &&
        global.H2O.Studio.platform.storage;
      if (platformStorage && typeof platformStorage.get === 'function' && typeof platformStorage.set === 'function') {
        return platformStorage;
      }
    } catch (_) { /* ignore */ }
    return null;
  }
  function normalizeLedger(raw) {
    if (!raw) return { schema: LEDGER_SCHEMA, createdAtIso: nowIsoSeconds(), rows: [] };
    if (!isObject(raw) || raw.schema !== LEDGER_SCHEMA || !Array.isArray(raw.rows)) return null;
    return {
      schema: LEDGER_SCHEMA,
      createdAtIso: cleanString(raw.createdAtIso) || nowIsoSeconds(),
      updatedAtIso: cleanString(raw.updatedAtIso),
      rows: raw.rows.slice()
    };
  }
  async function readLedger(options) {
    var opts = safeObject(options);
    if (Array.isArray(opts.__captureMaterializationRows)) {
      return { ok: true, ledger: { schema: LEDGER_SCHEMA, createdAtIso: nowIsoSeconds(), rows: opts.__captureMaterializationRows.slice() }, blockers: [], warnings: [] };
    }
    var storage = storageApi(opts);
    if (!storage) return { ok: false, ledger: null, blockers: ['capture-storage-unavailable'], warnings: [] };
    var raw;
    try { raw = await storage.get(LEDGER_KEY); } catch (_) {
      return { ok: false, ledger: null, blockers: ['capture-storage-unavailable'], warnings: [] };
    }
    var ledger = normalizeLedger(raw);
    if (!ledger) return { ok: false, ledger: null, blockers: ['capture-materialization-ledger-malformed'], warnings: [] };
    return { ok: true, ledger: ledger, blockers: [], warnings: [] };
  }
  async function writeLedger(ledger, options) {
    var opts = safeObject(options);
    if (Array.isArray(opts.__captureMaterializationRows)) {
      opts.__captureMaterializationRows.length = 0;
      ledger.rows.forEach(function (row) { opts.__captureMaterializationRows.push(row); });
      return { ok: true };
    }
    var storage = storageApi(opts);
    if (!storage) return { ok: false, blockers: ['capture-storage-unavailable'], warnings: [] };
    try {
      await storage.set(LEDGER_KEY, ledger);
      return { ok: true };
    } catch (_) {
      return { ok: false, blockers: ['capture-storage-unavailable'], warnings: [] };
    }
  }
  function rowKey(row) {
    var r = safeObject(row);
    return cleanLower(r.subjectId) + '|' + cleanLower(r.eventDigest) + '|' + cleanLower(r.dedupeKey);
  }
  function countsFor(rows) {
    var list = asArray(rows);
    return {
      rows: list.length,
      artifacts: list.filter(function (row) { return row.writeKind === 'artifact' || row.writeKind === 'recovery-subject'; }).length,
      events: list.filter(function (row) { return row.writeKind === 'event' || row.writeKind === 'recovery-event'; }).length,
      recovery: list.filter(function (row) { return row.mode === 'recovery'; }).length,
      fresh: list.filter(function (row) { return row.mode === 'fresh'; }).length
    };
  }

  function bundleMode(bundle) {
    var b = safeObject(bundle);
    if (isObject(b.canonicalArtifact) || isObject(b.canonicalEvent)) return 'fresh';
    if (isObject(b.canonicalRecoverySubject) || isObject(b.canonicalRecoveryEvent)) return 'recovery';
    if (safeObject(b.artifact).schema === FRESH_ARTIFACT_SCHEMA || safeObject(b.event).schema === FRESH_EVENT_SCHEMA) return 'fresh';
    if (safeObject(b.subject).schema === RECOVERY_SUBJECT_SCHEMA || safeObject(b.event).schema === RECOVERY_EVENT_SCHEMA) return 'recovery';
    return '';
  }
  function bundleArtifact(bundle, mode) {
    var b = safeObject(bundle);
    return mode === 'fresh' ? safeObject(b.canonicalArtifact || b.artifact) : safeObject(b.canonicalRecoverySubject || b.subject);
  }
  function bundleEvent(bundle, mode) {
    var b = safeObject(bundle);
    return mode === 'fresh' ? safeObject(b.canonicalEvent || b.event) : safeObject(b.canonicalRecoveryEvent || b.event);
  }
  function replayOf(value) { return safeObject(safeObject(value).replay); }
  function subjectIdOf(value, mode) {
    var row = safeObject(value);
    if (mode === 'fresh') return cleanLower(row.artifactIdHash || safeObject(row.subject).artifactIdHash);
    return cleanLower(row.recoveredSubjectIdHash || safeObject(row.subject).recoveredSubjectIdHash);
  }
  function revisionOf(value, mode) {
    var row = safeObject(value);
    if (mode === 'fresh') return cleanLower(row.artifactRevisionHash || safeObject(row.subject).artifactRevisionHash);
    return cleanLower(row.revisionHash || safeObject(row.subject).revisionHash);
  }
  function validateCanonicalPair(artifact, event, mode, blockers) {
    var a = safeObject(artifact);
    var e = safeObject(event);
    if (mode === 'fresh') {
      if (a.schema !== FRESH_ARTIFACT_SCHEMA) addCode(blockers, 'capture-fresh-artifact-schema-invalid');
      if (e.schema !== FRESH_EVENT_SCHEMA) addCode(blockers, 'capture-fresh-event-schema-invalid');
      if (hasAnyKey(a, RECOVERY_FIELDS) || hasAnyKey(e, RECOVERY_FIELDS)) addCode(blockers, 'capture-fresh-recovery-field-present');
    } else if (mode === 'recovery') {
      if (a.schema !== RECOVERY_SUBJECT_SCHEMA) addCode(blockers, 'capture-recovery-subject-schema-invalid');
      if (e.schema !== RECOVERY_EVENT_SCHEMA) addCode(blockers, 'capture-recovery-event-schema-invalid');
      if (!isSha256Hex(a.recoveredFromSubjectIdHash)) addCode(blockers, 'capture-recovery-lineage-missing');
      if (!cleanString(a.recoveryProvenance) || !cleanString(a.recoveryTrustGrade) || !isIso(a.recoveryAtIso)) {
        addCode(blockers, 'capture-recovery-fields-missing');
      }
    } else {
      addCode(blockers, 'capture-materialization-mode-unsupported');
    }
    var subjectId = subjectIdOf(a, mode);
    var eventSubjectId = subjectIdOf(e, mode);
    var replay = replayOf(e);
    if (!isSha256Hex(subjectId)) addCode(blockers, 'capture-materialization-subjectId-invalid');
    if (eventSubjectId && eventSubjectId !== subjectId) addCode(blockers, 'capture-materialization-event-subjectId-mismatch');
    if (!cleanString(replay.lineageId)) addCode(blockers, 'capture-materialization-lineageId-missing');
    if (!isSha256Hex(replay.dedupeKey)) addCode(blockers, 'capture-materialization-dedupeKey-invalid');
    if (!isSha256Hex(replay.eventDigest)) addCode(blockers, 'capture-materialization-eventDigest-invalid');
    if (mode === 'recovery' && !cleanString(replay.lineageId)) addCode(blockers, 'capture-recovery-lineage-missing');
  }

  async function shapeRow(mode, writeKind, payload, event, options) {
    var opts = safeObject(options);
    var subjectId = subjectIdOf(payload, mode) || subjectIdOf(event, mode);
    var payloadReplay = replayOf(payload);
    var row = {
      schema: ROW_SCHEMA,
      writeId: await sha256Hex({
        schema: ROW_SCHEMA,
        mode: mode,
        writeKind: writeKind,
        subjectId: subjectId,
        eventDigest: cleanLower(payloadReplay.eventDigest),
        dedupeKey: cleanLower(payloadReplay.dedupeKey)
      }),
      mode: mode,
      writeKind: writeKind,
      subjectId: subjectId,
      revisionHash: revisionOf(payload, mode),
      lineageId: cleanString(payloadReplay.lineageId),
      dedupeKey: cleanLower(payloadReplay.dedupeKey),
      eventDigest: cleanLower(payloadReplay.eventDigest),
      payloadSchema: cleanString(payload.schema),
      payload: payload,
      materializedAtIso: cleanString(opts.nowIso || nowIsoSeconds())
    };
    if (mode === 'recovery') {
      row.recovery = {
        recoveredFromSubjectIdHash: cleanLower(payload.recoveredFromSubjectIdHash || safeObject(payload.subject).recoveredFromSubjectIdHash),
        recoveryProvenance: cleanString(payload.recoveryProvenance),
        recoveryTrustGrade: cleanString(payload.recoveryTrustGrade),
        recoveryAtIso: cleanString(payload.recoveryAtIso)
      };
    }
    return row;
  }
  async function shapeCaptureMaterializationWrites(bundle, options) {
    var blockers = [];
    var warnings = [];
    if (!isObject(bundle)) addCode(blockers, 'capture-bundle-required');
    var mode = bundleMode(bundle);
    var artifact = bundleArtifact(bundle, mode);
    var event = bundleEvent(bundle, mode);
    validateCanonicalPair(artifact, event, mode, blockers);
    scanPrivacy({ artifact: artifact, event: event }, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings, { writes: { mode: mode, rows: [] } });
    var rows = [
      await shapeRow(mode, mode === 'fresh' ? 'artifact' : 'recovery-subject', artifact, event, options),
      await shapeRow(mode, mode === 'fresh' ? 'event' : 'recovery-event', event, event, options)
    ];
    return buildResult({
      ok: true,
      writes: { schema: 'h2o.desktop.sync.execute-capture-materialization-writes.v1', mode: mode, rows: rows },
      rows: rows,
      counts: countsFor(rows),
      warnings: warnings,
      metadata: { mode: mode }
    });
  }

  function validateRow(row, blockers, warnings, options) {
    var r = safeObject(row);
    if (r.schema !== ROW_SCHEMA) addCode(blockers, 'capture-materialization-row-schema-invalid');
    if (!isSha256Hex(r.writeId)) addCode(blockers, 'capture-materialization-writeId-invalid');
    if (['fresh', 'recovery'].indexOf(r.mode) === -1) addCode(blockers, 'capture-materialization-mode-invalid');
    if (['artifact', 'event', 'recovery-subject', 'recovery-event'].indexOf(r.writeKind) === -1) {
      addCode(blockers, 'capture-materialization-writeKind-invalid');
    }
    if (!isSha256Hex(r.subjectId)) addCode(blockers, 'capture-materialization-subjectId-invalid');
    if (!isSha256Hex(r.eventDigest)) addCode(blockers, 'capture-materialization-eventDigest-invalid');
    if (!isSha256Hex(r.dedupeKey)) addCode(blockers, 'capture-materialization-dedupeKey-invalid');
    if (!cleanString(r.lineageId)) addCode(blockers, 'capture-materialization-lineageId-missing');
    if (!isObject(r.payload)) addCode(blockers, 'capture-materialization-payload-required');
    if (!isIso(r.materializedAtIso)) addCode(blockers, 'capture-materialization-materializedAtIso-invalid');
    if (r.mode === 'fresh' && hasAnyKey(r, RECOVERY_FIELDS)) addCode(blockers, 'capture-fresh-recovery-field-present');
    if (r.mode === 'recovery') {
      var rec = safeObject(r.recovery);
      if (!isSha256Hex(rec.recoveredFromSubjectIdHash) ||
          !cleanString(rec.recoveryProvenance) ||
          !cleanString(rec.recoveryTrustGrade) ||
          !isIso(rec.recoveryAtIso)) {
        addCode(blockers, 'capture-recovery-fields-missing');
      }
    }
    scanPrivacy(r, blockers, warnings);
    codeList(safeObject(options).warnings).forEach(function (code) { addCode(warnings, code); });
  }
  function validateCaptureMaterializationWrites(writes, options) {
    var blockers = [];
    var warnings = [];
    var rows = asArray(safeObject(writes).rows);
    if (!isObject(writes)) addCode(blockers, 'capture-materialization-writes-required');
    if (!rows.length) addCode(blockers, 'capture-materialization-writes-empty');
    rows.forEach(function (row) { validateRow(row, blockers, warnings, options); });
    var seen = {};
    rows.forEach(function (row) {
      var key = rowKey(row);
      if (seen[key]) addCode(blockers, 'capture-materialization-write-duplicate');
      seen[key] = true;
    });
    return buildResult({
      ok: blockers.length === 0,
      writes: { schema: safeObject(writes).schema || '', mode: cleanString(safeObject(writes).mode), rows: rows },
      rows: rows,
      counts: countsFor(rows),
      blockers: blockers,
      warnings: warnings
    });
  }
  async function materializeCaptureBundle(bundle, options) {
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    var sideEffects = {};
    var shaped = await shapeCaptureMaterializationWrites(bundle, opts);
    if (shaped.ok !== true) return failure(shaped.blockers, shaped.warnings, { sideEffects: sideEffects, writes: shaped.writes });
    var validation = validateCaptureMaterializationWrites(shaped.writes, opts);
    if (validation.ok !== true) return failure(validation.blockers, validation.warnings, { sideEffects: sideEffects, writes: shaped.writes });
    var read = await readLedger(opts);
    if (read.ok !== true) return failure(read.blockers, read.warnings, { sideEffects: sideEffects, writes: shaped.writes });
    var rows = read.ledger.rows.slice();
    var existing = {};
    rows.forEach(function (row) { existing[rowKey(row)] = true; });
    var appended = [];
    validation.rows.forEach(function (row) {
      var key = rowKey(row);
      if (existing[key]) return;
      existing[key] = true;
      rows.push(row);
      appended.push(row);
    });
    if (!appended.length) {
      return buildResult({
        ok: true,
        appended: false,
        rows: validation.rows,
        writes: shaped.writes,
        counts: countsFor(validation.rows),
        warnings: warnings,
        sideEffects: sideEffects,
        metadata: { idempotent: true }
      });
    }
    var next = {
      schema: LEDGER_SCHEMA,
      createdAtIso: read.ledger.createdAtIso,
      updatedAtIso: cleanString(opts.nowIso || nowIsoSeconds()),
      rows: rows
    };
    var wrote = await writeLedger(next, opts);
    if (wrote.ok !== true) return failure(wrote.blockers || ['capture-storage-unavailable'], wrote.warnings || [], { sideEffects: sideEffects, writes: shaped.writes });
    sideEffects.captureMaterializationTouched = true;
    return buildResult({
      ok: true,
      appended: true,
      rows: appended,
      writes: shaped.writes,
      counts: countsFor(appended),
      sideEffects: sideEffects,
      warnings: warnings,
      metadata: { idempotent: false }
    });
  }
  async function listCaptureMaterializedRows(options) {
    var read = await readLedger(options);
    if (read.ok !== true) return failure(read.blockers, read.warnings);
    var rows = read.ledger.rows.slice();
    var opts = safeObject(options);
    if (cleanString(opts.mode)) rows = rows.filter(function (row) { return row.mode === cleanString(opts.mode); });
    if (cleanString(opts.subjectId)) rows = rows.filter(function (row) { return row.subjectId === cleanLower(opts.subjectId); });
    return buildResult({ ok: true, rows: rows, counts: countsFor(rows), metadata: { query: 'capture-materialized' } });
  }

  async function proofFreshBundle() {
    var subject = await sha256Hex('capture-materialization-proof:fresh-subject');
    var revision = await sha256Hex('capture-materialization-proof:fresh-revision');
    var lineage = await sha256Hex('capture-materialization-proof:fresh-lineage');
    var dedupe = await sha256Hex('capture-materialization-proof:fresh-dedupe');
    var eventDedupe = await sha256Hex('capture-materialization-proof:fresh-event-dedupe');
    var eventDigest = await sha256Hex('capture-materialization-proof:fresh-event');
    var sourceSubjectHash = await sha256Hex('capture-materialization-proof:fresh-source');
    return {
      canonicalArtifact: {
        schema: FRESH_ARTIFACT_SCHEMA,
        schemaVersion: 1,
        artifactIdHash: subject,
        artifactRevisionHash: revision,
        artifactKind: 'chat-snapshot-digest',
        artifactState: 'captured',
        capturedAtIso: '2026-06-01T10:00:00Z',
        updatedAtIso: '2026-06-01T10:00:00Z',
        source: { sourceKind: 'chatgpt-live', origin: 'live', sourceSubjectHash: sourceSubjectHash },
        summary: { redactionClass: 'redacted', evidenceDigest: await sha256Hex('capture-materialization-proof:fresh-evidence'), lengthBucket: 'medium' },
        replay: { lineageId: lineage, dedupeKey: dedupe, payloadHash: await sha256Hex('p'), eventDigest: await sha256Hex('a') },
        validation: { status: 'accepted', blockers: [], warnings: [] }
      },
      canonicalEvent: {
        schema: FRESH_EVENT_SCHEMA,
        schemaVersion: 1,
        eventId: 'capture-materialization-proof-event',
        eventKind: 'observed',
        eventAtIso: '2026-06-01T10:00:00Z',
        source: { sourceKind: 'chatgpt-live', origin: 'live', sourceSubjectHash: sourceSubjectHash },
        subject: { subjectType: 'capture.artifact', artifactIdHash: subject, artifactRevisionHash: revision },
        replay: { lineageId: lineage, dedupeKey: eventDedupe, payloadHash: await sha256Hex('q'), eventDigest: eventDigest },
        validation: { status: 'accepted', blockers: [], warnings: [] }
      }
    };
  }
  async function proofRecoveryBundle() {
    var subject = await sha256Hex('capture-materialization-proof:recovery-subject');
    var lost = await sha256Hex('capture-materialization-proof:lost-subject');
    var revision = await sha256Hex('capture-materialization-proof:recovery-revision');
    var lineage = await sha256Hex('capture-materialization-proof:recovery-lineage');
    var dedupe = await sha256Hex('capture-materialization-proof:recovery-dedupe');
    var eventDedupe = await sha256Hex('capture-materialization-proof:recovery-event-dedupe');
    var eventDigest = await sha256Hex('capture-materialization-proof:recovery-event');
    return {
      canonicalRecoverySubject: {
        schema: RECOVERY_SUBJECT_SCHEMA,
        schemaVersion: 1,
        subjectType: 'snapshot.conversation',
        recoveredSubjectIdHash: subject,
        revisionHash: revision,
        subjectState: 'recovered',
        recoveredFromSubjectIdHash: lost,
        recoveryProvenance: 'studio-full-bundle-v2',
        recoveryTrustGrade: 'high',
        recoveryAtIso: '2026-06-01T10:00:00Z',
        artifactKind: 'chat-snapshot-digest',
        summary: { redactionClass: 'redacted', evidenceDigest: await sha256Hex('capture-materialization-proof:recovery-evidence'), lengthBucket: 'medium' },
        replay: { lineageId: lineage, dedupeKey: dedupe, payloadHash: await sha256Hex('r'), eventDigest: await sha256Hex('s') },
        validation: { status: 'accepted', blockers: [], warnings: [] }
      },
      canonicalRecoveryEvent: {
        schema: RECOVERY_EVENT_SCHEMA,
        schemaVersion: 1,
        eventId: 'capture-materialization-proof-recovery-event',
        eventKind: 'recovered',
        eventAtIso: '2026-06-01T10:00:00Z',
        recoveryProvenance: 'studio-full-bundle-v2',
        recoveryTrustGrade: 'high',
        recoveryAtIso: '2026-06-01T10:00:00Z',
        subject: {
          subjectType: 'snapshot.conversation',
          recoveredSubjectIdHash: subject,
          revisionHash: revision,
          recoveredFromSubjectIdHash: lost
        },
        replay: { lineageId: lineage, dedupeKey: eventDedupe, payloadHash: await sha256Hex('t'), eventDigest: eventDigest },
        validation: { status: 'accepted', blockers: [], warnings: [] }
      }
    };
  }
  function containsRawLeak(value) {
    return canonicalJson(value).indexOf('Leaked raw content') !== -1 ||
      canonicalJson(value).indexOf('raw-source-pointer') !== -1;
  }
  async function runCaptureMaterializationProof() {
    var blockers = [];
    var warnings = [];
    var memoryRows = [];
    var freshBundle = await proofFreshBundle();
    var recoveryBundle = await proofRecoveryBundle();
    var freshWrites = await shapeCaptureMaterializationWrites(freshBundle, { nowIso: '2026-06-01T10:05:00Z' });
    if (!freshWrites.ok || safeObject(freshWrites.writes).mode !== 'fresh') addCode(blockers, 'proof-fresh-write-shape-failed');
    var recoveryWrites = await shapeCaptureMaterializationWrites(recoveryBundle, { nowIso: '2026-06-01T10:05:00Z' });
    if (!recoveryWrites.ok || safeObject(recoveryWrites.writes).mode !== 'recovery' ||
        !safeObject(recoveryWrites.rows[0]).recovery) addCode(blockers, 'proof-recovery-write-shape-failed');
    var freshWithRecovery = await proofFreshBundle();
    freshWithRecovery.canonicalArtifact.recoveryProvenance = 'studio-full-bundle-v2';
    var freshBlocked = await shapeCaptureMaterializationWrites(freshWithRecovery, {});
    if (freshBlocked.ok) addCode(blockers, 'proof-fresh-recovery-fields-accepted');
    var recoveryNoLineage = await proofRecoveryBundle();
    recoveryNoLineage.canonicalRecoveryEvent.replay.lineageId = '';
    var recoveryBlocked = await shapeCaptureMaterializationWrites(recoveryNoLineage, {});
    if (recoveryBlocked.ok) addCode(blockers, 'proof-recovery-missing-lineage-accepted');
    var first = await materializeCaptureBundle(freshBundle, { __captureMaterializationRows: memoryRows, nowIso: '2026-06-01T10:05:00Z' });
    var duplicate = await materializeCaptureBundle(freshBundle, { __captureMaterializationRows: memoryRows, nowIso: '2026-06-01T10:06:00Z' });
    if (!first.ok || first.appended !== true || !duplicate.ok || duplicate.appended === true) {
      addCode(blockers, 'proof-duplicate-not-idempotent');
    }
    var unavailable = await materializeCaptureBundle(recoveryBundle, { nowIso: '2026-06-01T10:05:00Z' });
    if (unavailable.ok || unavailable.blockers.indexOf('capture-storage-unavailable') === -1) {
      addCode(blockers, 'proof-storage-unavailable-not-blocked');
    }
    var privacyBundle = await proofFreshBundle();
    privacyBundle.canonicalEvent.rawSourcePointer = 'raw-source-pointer';
    var privacy = await shapeCaptureMaterializationWrites(privacyBundle, {});
    if (privacy.ok) addCode(blockers, 'proof-privacy-violation-accepted');
    var listed = await listCaptureMaterializedRows({ __captureMaterializationRows: memoryRows });
    if (!listed.ok || listed.rows.length !== 2) addCode(blockers, 'proof-list-materialized-failed');
    var rawLeak = containsRawLeak(freshWrites) || containsRawLeak(recoveryWrites);
    if (rawLeak) addCode(blockers, 'proof-raw-leak-detected');
    var forbiddenFlagsFalse = first.sideEffectSummary.relayOutboxTouched === false &&
      first.sideEffectSummary.nativeCalled === false &&
      first.sideEffectSummary.f5Touched === false &&
      first.sideEffectSummary.publicationLedgerTouched === false &&
      first.sideEffectSummary.watermarkWritten === false &&
      first.sideEffectSummary.consumedOperationWritten === false;
    if (!forbiddenFlagsFalse) addCode(blockers, 'proof-forbidden-side-effects');
    return buildResult({
      ok: blockers.length === 0,
      rows: listed.rows,
      writes: freshWrites.writes,
      counts: countsFor(listed.rows),
      blockers: blockers,
      warnings: warnings,
      sideEffects: { captureMaterializationTouched: first.sideEffectSummary.captureMaterializationTouched === true },
      metadata: {
        proof: 'capture-materialization',
        freshWriteShape: freshWrites.ok === true,
        recoveryWriteShape: recoveryWrites.ok === true,
        freshRecoveryFieldsBlocked: freshBlocked.ok !== true,
        recoveryMissingLineageBlocked: recoveryBlocked.ok !== true,
        duplicateIdempotent: duplicate.ok === true && duplicate.appended !== true,
        storageUnavailableBlocked: unavailable.ok !== true,
        privacyViolationBlocked: privacy.ok !== true,
        rawLeakCheck: rawLeak,
        forbiddenSideEffectFlagsFalse: forbiddenFlagsFalse
      }
    });
  }

  H2O.Desktop.Sync.materializeCaptureBundle = materializeCaptureBundle;
  H2O.Desktop.Sync.shapeCaptureMaterializationWrites = shapeCaptureMaterializationWrites;
  H2O.Desktop.Sync.validateCaptureMaterializationWrites = validateCaptureMaterializationWrites;
  H2O.Desktop.Sync.listCaptureMaterializedRows = listCaptureMaterializedRows;
  H2O.Desktop.Sync.runCaptureMaterializationProof = runCaptureMaterializationProof;
  H2O.Desktop.Sync.__captureMaterializationInstalled = true;
  H2O.Desktop.Sync.__captureMaterializationVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
