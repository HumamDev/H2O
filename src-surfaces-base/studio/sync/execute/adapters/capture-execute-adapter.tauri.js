/* H2O Desktop Sync - F14.6.12 capture execute adapter
 *
 * Capture domain adapter for Execute Lane canonical-preview envelopes.
 *
 * Safety invariants:
 *   - Adapter registration and envelope shaping only.
 *   - Uses capture materialization writer for write-shape validation only.
 *   - No materialization, broker dispatch, Native dispatch, F5 execution,
 *     publication dispatch, settlement, consumed-op write, watermark write,
 *     storage write, timer, or polling behavior.
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
  if (H2O.Desktop.Sync.__captureExecuteAdapterInstalled) return;

  var VERSION = '0.1.0-f14.6.12';
  var RESULT_SCHEMA = 'h2o.desktop.sync.capture-execute-adapter-result.v1';
  var ADAPTER_ID = 'capture-execute-adapter';
  var FRESH_OPERATION = 'capture-fresh-materialize';
  var RECOVERY_OPERATION = 'capture-recovery-materialize';
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

  function sideEffectSummary() {
    return {
      dispatchAttempted: false,
      publicationTouched: false,
      publicationLedgerTouched: false,
      relayTouched: false,
      relayOutboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      materialized: false,
      captureMaterializationTouched: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      bookkeepingWritten: false,
      executeJournalTouched: false,
      storageWritten: false
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
      envelope: opts.envelope || null,
      adapter: opts.adapter || null,
      adapters: opts.adapters || [],
      writes: opts.writes || null,
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
      } catch (_) { addCode(warnings, 'capture-execute-privacy-scan-threw'); }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'capture-execute-output-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  function bundleMode(bundle) {
    var b = safeObject(bundle);
    if (isObject(b.materializationWrites)) return cleanString(b.materializationWrites.mode);
    if (isObject(b.writes)) return cleanString(b.writes.mode);
    if (isObject(b.canonicalArtifact) || isObject(b.canonicalEvent)) return 'fresh';
    if (isObject(b.canonicalRecoverySubject) || isObject(b.canonicalRecoveryEvent)) return 'recovery';
    if (safeObject(b.artifact).schema === FRESH_ARTIFACT_SCHEMA || safeObject(b.event).schema === FRESH_EVENT_SCHEMA) return 'fresh';
    if (safeObject(b.subject).schema === RECOVERY_SUBJECT_SCHEMA || safeObject(b.event).schema === RECOVERY_EVENT_SCHEMA) return 'recovery';
    return '';
  }
  function operationForMode(mode) {
    if (mode === 'fresh') return FRESH_OPERATION;
    if (mode === 'recovery') return RECOVERY_OPERATION;
    return '';
  }
  function firstRow(writes) {
    return safeObject(asArray(safeObject(writes).rows)[0]);
  }
  function eventRow(writes) {
    var rows = asArray(safeObject(writes).rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (row.writeKind === 'event' || row.writeKind === 'recovery-event') return row;
    }
    return safeObject(rows[rows.length - 1]);
  }
  function recoveryFieldsFromWrites(writes) {
    var row = firstRow(writes);
    return safeObject(row.recovery || safeObject(row.payload).recovery || row.payload);
  }
  function publicationRowShape(writes, operationKind) {
    var event = eventRow(writes);
    var publicationId = cleanLower(event.eventDigest);
    return {
      schema: 'h2o.desktop.sync.capture-execute-publication-row.v1',
      publicationId: publicationId,
      status: 'generated',
      domainId: 'capture',
      operationKind: operationKind,
      subjectId: cleanLower(event.subjectId),
      lineageId: cleanString(event.lineageId),
      dedupeKey: cleanLower(event.dedupeKey),
      eventDigest: cleanLower(event.eventDigest)
    };
  }
  function settlementShapes(writes, operationKind) {
    var event = eventRow(writes);
    var first = firstRow(writes);
    return {
      consumedOperationRow: {
        schema: 'h2o.desktop.sync.kernel.consumed-operation.v1',
        consumedId: cleanLower(event.writeId),
        eventDigest: cleanLower(event.eventDigest),
        dedupeKey: cleanLower(event.dedupeKey),
        lineageId: cleanString(event.lineageId),
        subjectId: cleanLower(event.subjectId),
        envelopeKind: 'canonical-preview',
        operationKind: operationKind,
        consumedStatus: 'pending-materialization',
        consumedAtIso: cleanString(event.materializedAtIso)
      },
      watermarkAdvance: {
        schema: 'h2o.desktop.sync.kernel.watermark.v1',
        peerId: '',
        subjectId: cleanLower(event.subjectId),
        lineageId: cleanString(event.lineageId),
        revisionHash: cleanLower(first.revisionHash),
        watermarkAtIso: cleanString(event.materializedAtIso),
        dedupeKey: cleanLower(event.dedupeKey)
      },
      bookkeepingRow: {
        schema: 'h2o.desktop.sync.capture-execute-bookkeeping-row.v1',
        domainId: 'capture',
        operationKind: operationKind,
        subjectId: cleanLower(event.subjectId),
        lineageId: cleanString(event.lineageId),
        dedupeKey: cleanLower(event.dedupeKey),
        eventDigest: cleanLower(event.eventDigest),
        revisionHash: cleanLower(first.revisionHash),
        materializationWriteCount: asArray(safeObject(writes).rows).length
      },
      publicationRow: publicationRowShape(writes, operationKind)
    };
  }
  function canonicalPreviewShape(writes, mode, operationKind) {
    var event = eventRow(writes);
    return {
      schema: 'h2o.desktop.sync.capture-execute-canonical-preview.v1',
      domainId: 'capture',
      mode: mode,
      operationKind: operationKind,
      dispatchTarget: 'capture-materialize',
      subjectId: cleanLower(event.subjectId),
      lineageId: cleanString(event.lineageId),
      dedupeKey: cleanLower(event.dedupeKey),
      eventDigest: cleanLower(event.eventDigest),
      materializationWrites: writes
    };
  }
  function validateModeRules(mode, writes, blockers) {
    if (mode === 'fresh') {
      if (hasAnyKey(writes, RECOVERY_FIELDS)) addCode(blockers, 'capture-execute-fresh-recovery-field-present');
      return;
    }
    if (mode === 'recovery') {
      var recovery = recoveryFieldsFromWrites(writes);
      if (!isSha256Hex(recovery.recoveredFromSubjectIdHash) ||
          !cleanString(recovery.recoveryProvenance) ||
          !cleanString(recovery.recoveryTrustGrade) ||
          !isIso(recovery.recoveryAtIso)) {
        addCode(blockers, 'capture-execute-recovery-lineage-required');
      }
      return;
    }
    addCode(blockers, 'capture-execute-mode-unsupported');
  }

  function captureAdapterMetadata(replaceExisting) {
    return {
      adapterId: ADAPTER_ID,
      domainId: 'capture',
      version: VERSION,
      envelopeKinds: ['canonical-preview'],
      operationKinds: [FRESH_OPERATION, RECOVERY_OPERATION],
      dispatchTargets: ['capture-materialize'],
      replaceExisting: replaceExisting === true
    };
  }
  function registerCaptureExecuteAdapter(options) {
    var opts = safeObject(options);
    if (typeof H2O.Desktop.Sync.registerExecuteAdapter !== 'function') {
      return failure(['execute-adapter-registry-unavailable'], [], { adapterId: ADAPTER_ID });
    }
    var registered = H2O.Desktop.Sync.registerExecuteAdapter(captureAdapterMetadata(opts.replaceExisting === true));
    if (registered && registered.ok === true) {
      return buildResult({
        ok: true,
        adapter: registered.adapter,
        adapters: registered.adapters,
        warnings: registered.warnings,
        metadata: { registered: true }
      });
    }
    return failure(codeList(registered && registered.blockers), codeList(registered && registered.warnings), {
      adapterId: ADAPTER_ID
    });
  }

  async function resolveWrites(input, options, blockers, warnings) {
    var args = safeObject(input);
    var provided = safeObject(args.materializationWrites || args.writes);
    if (isObject(provided) && Array.isArray(provided.rows)) {
      var validation = H2O.Desktop.Sync.validateCaptureMaterializationWrites(provided, options);
      codeList(validation && validation.warnings).forEach(function (code) { addCode(warnings, code); });
      if (!validation || validation.ok !== true) {
        codeList(validation && validation.blockers).forEach(function (code) { addCode(blockers, code); });
        if (!blockers.length) addCode(blockers, 'capture-materialization-writes-invalid');
        return null;
      }
      return validation.writes || provided;
    }
    if (typeof H2O.Desktop.Sync.shapeCaptureMaterializationWrites !== 'function' ||
        typeof H2O.Desktop.Sync.validateCaptureMaterializationWrites !== 'function') {
      addCode(blockers, 'capture-materialization-writer-unavailable');
      return null;
    }
    var shaped = await H2O.Desktop.Sync.shapeCaptureMaterializationWrites(args.bundle || args.previewBundle || args, options);
    codeList(shaped && shaped.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!shaped || shaped.ok !== true) {
      codeList(shaped && shaped.blockers).forEach(function (code) { addCode(blockers, code); });
      if (!blockers.length) addCode(blockers, 'capture-materialization-write-shape-failed');
      return null;
    }
    var validated = H2O.Desktop.Sync.validateCaptureMaterializationWrites(shaped.writes, options);
    codeList(validated && validated.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!validated || validated.ok !== true) {
      codeList(validated && validated.blockers).forEach(function (code) { addCode(blockers, code); });
      if (!blockers.length) addCode(blockers, 'capture-materialization-writes-invalid');
      return null;
    }
    return validated.writes || shaped.writes;
  }

  async function buildCaptureExecuteEnvelope(input, options) {
    var args = safeObject(input);
    var opts = safeObject(options);
    var blockers = [];
    var warnings = [];
    if (!isObject(input)) addCode(blockers, 'capture-execute-input-required');
    if (typeof H2O.Desktop.Sync.shapeExecuteEnvelope !== 'function' ||
        typeof H2O.Desktop.Sync.validateExecuteEnvelope !== 'function') {
      addCode(blockers, 'execute-envelope-contract-unavailable');
    }
    if (typeof H2O.Desktop.Sync.shapeCaptureMaterializationWrites !== 'function' ||
        typeof H2O.Desktop.Sync.validateCaptureMaterializationWrites !== 'function') {
      addCode(blockers, 'capture-materialization-writer-unavailable');
    }
    var writes = blockers.length ? null : await resolveWrites(args, opts, blockers, warnings);
    if (blockers.length || !writes) return failure(blockers, warnings, { stage: 'materialization-writes', writes: writes });
    var mode = cleanString(safeObject(writes).mode) || bundleMode(args.bundle || args.previewBundle || args);
    var operationKind = operationForMode(mode);
    validateModeRules(mode, writes, blockers);
    scanPrivacy(writes, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings, { stage: 'validation', writes: writes });
    var event = eventRow(writes);
    var first = firstRow(writes);
    var payloadShapes = {
      canonicalPreview: canonicalPreviewShape(writes, mode, operationKind)
    };
    var settlement = settlementShapes(writes, operationKind);
    var shapedEnvelope = await H2O.Desktop.Sync.shapeExecuteEnvelope({
      envelopeKind: 'canonical-preview',
      domainId: 'capture',
      operationKind: operationKind,
      subjectId: cleanLower(event.subjectId),
      lineageId: cleanString(event.lineageId),
      dedupeKey: cleanLower(event.dedupeKey),
      eventDigest: cleanLower(event.eventDigest),
      dispatchProfile: {
        requiresF5: false,
        requiresNative: false,
        requiresRelay: false,
        dispatchTarget: 'capture-materialize',
        nativeCommand: '',
        nativeIdempotent: true,
        f5QueueKey: '',
        retryPolicy: safeObject(opts.retryPolicy || { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' })
      },
      payloadShapes: payloadShapes,
      settlementShapes: settlement,
      createdAtIso: cleanString(opts.createdAtIso || event.materializedAtIso || nowIsoSeconds())
    });
    var envelope = Object.assign({}, shapedEnvelope, {
      dispatchProfile: Object.assign({}, shapedEnvelope.dispatchProfile, { dispatchTarget: 'capture-materialize' })
    });
    scanPrivacy(envelope, blockers, warnings);
    if (blockers.length) return failure(blockers, warnings, { stage: 'privacy', writes: writes });
    var validation = H2O.Desktop.Sync.validateExecuteEnvelope(envelope);
    codeList(validation && validation.warnings).forEach(function (code) { addCode(warnings, code); });
    if (!validation || validation.ok !== true) {
      codeList(validation && validation.blockers).forEach(function (code) { addCode(blockers, code); });
      if (!blockers.length) addCode(blockers, 'execute-envelope-validation-failed');
      return failure(blockers, warnings, { stage: 'execute-envelope-validation', writes: writes });
    }
    var validatedEnvelope = Object.assign({}, validation.envelope || envelope, {
      dispatchProfile: Object.assign({}, safeObject(validation.envelope && validation.envelope.dispatchProfile), {
        dispatchTarget: 'capture-materialize'
      })
    });
    return buildResult({
      ok: true,
      envelope: validatedEnvelope,
      writes: writes,
      warnings: warnings,
      metadata: {
        adapterId: ADAPTER_ID,
        domainId: 'capture',
        mode: mode,
        operationKind: operationKind,
        revisionHash: cleanLower(first.revisionHash)
      }
    });
  }

  async function proofFreshBundle() {
    var subject = await sha256Hex('capture-execute-proof:fresh-subject');
    var revision = await sha256Hex('capture-execute-proof:fresh-revision');
    var lineage = await sha256Hex('capture-execute-proof:fresh-lineage');
    var dedupe = await sha256Hex('capture-execute-proof:fresh-dedupe');
    var eventDedupe = await sha256Hex('capture-execute-proof:fresh-event-dedupe');
    var eventDigest = await sha256Hex('capture-execute-proof:fresh-event');
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
        source: {
          sourceKind: 'chatgpt-live',
          origin: 'live',
          sourceSubjectHash: await sha256Hex('capture-execute-proof:fresh-source')
        },
        summary: {
          redactionClass: 'redacted',
          evidenceDigest: await sha256Hex('capture-execute-proof:fresh-evidence'),
          lengthBucket: 'medium'
        },
        replay: {
          lineageId: lineage,
          dedupeKey: dedupe,
          payloadHash: await sha256Hex('capture-execute-proof:fresh-payload'),
          eventDigest: await sha256Hex('capture-execute-proof:fresh-artifact-event')
        },
        validation: { status: 'accepted', blockers: [], warnings: [] }
      },
      canonicalEvent: {
        schema: FRESH_EVENT_SCHEMA,
        schemaVersion: 1,
        eventId: 'capture-execute-proof-fresh-event',
        eventKind: 'observed',
        eventAtIso: '2026-06-01T10:00:00Z',
        subject: {
          subjectType: 'capture.artifact',
          artifactIdHash: subject,
          artifactRevisionHash: revision
        },
        replay: {
          lineageId: lineage,
          dedupeKey: eventDedupe,
          payloadHash: await sha256Hex('capture-execute-proof:fresh-event-payload'),
          eventDigest: eventDigest
        },
        validation: { status: 'accepted', blockers: [], warnings: [] }
      }
    };
  }
  async function proofRecoveryBundle() {
    var subject = await sha256Hex('capture-execute-proof:recovery-subject');
    var lost = await sha256Hex('capture-execute-proof:lost-subject');
    var revision = await sha256Hex('capture-execute-proof:recovery-revision');
    var lineage = await sha256Hex('capture-execute-proof:recovery-lineage');
    var dedupe = await sha256Hex('capture-execute-proof:recovery-dedupe');
    var eventDedupe = await sha256Hex('capture-execute-proof:recovery-event-dedupe');
    var eventDigest = await sha256Hex('capture-execute-proof:recovery-event');
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
        summary: {
          redactionClass: 'redacted',
          evidenceDigest: await sha256Hex('capture-execute-proof:recovery-evidence'),
          lengthBucket: 'medium'
        },
        replay: {
          lineageId: lineage,
          dedupeKey: dedupe,
          payloadHash: await sha256Hex('capture-execute-proof:recovery-payload'),
          eventDigest: await sha256Hex('capture-execute-proof:recovery-subject-event')
        },
        validation: { status: 'accepted', blockers: [], warnings: [] }
      },
      canonicalRecoveryEvent: {
        schema: RECOVERY_EVENT_SCHEMA,
        schemaVersion: 1,
        eventId: 'capture-execute-proof-recovery-event',
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
        replay: {
          lineageId: lineage,
          dedupeKey: eventDedupe,
          payloadHash: await sha256Hex('capture-execute-proof:recovery-event-payload'),
          eventDigest: eventDigest
        },
        validation: { status: 'accepted', blockers: [], warnings: [] }
      }
    };
  }

  async function runCaptureExecuteAdapterProof() {
    var blockers = [];
    var warnings = [];
    var registered = registerCaptureExecuteAdapter({ replaceExisting: true });
    if (!registered.ok) codeList(registered.blockers).forEach(function (code) { addCode(blockers, code); });
    var fresh = await buildCaptureExecuteEnvelope(await proofFreshBundle(), { createdAtIso: '2026-06-01T10:05:00Z' });
    if (!fresh.ok || safeObject(fresh.envelope).operationKind !== FRESH_OPERATION ||
        safeObject(safeObject(fresh.envelope).dispatchProfile).dispatchTarget !== 'capture-materialize') {
      addCode(blockers, 'proof-fresh-envelope-invalid');
    }
    var recovery = await buildCaptureExecuteEnvelope(await proofRecoveryBundle(), { createdAtIso: '2026-06-01T10:05:00Z' });
    if (!recovery.ok || safeObject(recovery.envelope).operationKind !== RECOVERY_OPERATION) {
      addCode(blockers, 'proof-recovery-envelope-invalid');
    }
    var freshWithRecovery = await proofFreshBundle();
    freshWithRecovery.canonicalArtifact.recoveryProvenance = 'studio-full-bundle-v2';
    var freshBlocked = await buildCaptureExecuteEnvelope(freshWithRecovery);
    if (freshBlocked.ok) addCode(blockers, 'proof-fresh-recovery-fields-accepted');
    var recoveryMissingLineage = await proofRecoveryBundle();
    recoveryMissingLineage.canonicalRecoveryEvent.replay.lineageId = '';
    var recoveryBlocked = await buildCaptureExecuteEnvelope(recoveryMissingLineage);
    if (recoveryBlocked.ok) addCode(blockers, 'proof-recovery-missing-lineage-accepted');
    var invalid = await buildCaptureExecuteEnvelope({ canonicalArtifact: { schema: FRESH_ARTIFACT_SCHEMA } });
    if (invalid.ok) addCode(blockers, 'proof-invalid-preview-accepted');
    var listed = typeof H2O.Desktop.Sync.listExecuteAdapters === 'function' ? H2O.Desktop.Sync.listExecuteAdapters() : null;
    var got = typeof H2O.Desktop.Sync.getExecuteAdapter === 'function' ? H2O.Desktop.Sync.getExecuteAdapter('capture') : null;
    var listedHasCapture = asArray(listed && listed.adapters).some(function (adapter) {
      return safeObject(adapter).domainId === 'capture' && safeObject(adapter).adapterId === ADAPTER_ID;
    });
    if (!listed || listed.ok !== true || !listedHasCapture || !got || got.ok !== true || safeObject(got.adapter).adapterId !== ADAPTER_ID) {
      addCode(blockers, 'proof-adapter-registry-failed');
    }
    if (!allSideEffectsFalse(fresh.sideEffectSummary) ||
        !allSideEffectsFalse(recovery.sideEffectSummary) ||
        !allSideEffectsFalse(invalid.sideEffectSummary)) {
      addCode(blockers, 'proof-side-effects-not-false');
    }
    return buildResult({
      ok: blockers.length === 0,
      envelope: fresh.envelope,
      adapter: got && got.adapter,
      adapters: listed && listed.adapters,
      writes: fresh.writes,
      blockers: blockers,
      warnings: warnings,
      metadata: {
        proof: 'capture-execute-adapter',
        freshEnvelopeValid: fresh.ok === true,
        recoveryEnvelopeValid: recovery.ok === true,
        freshRecoveryFieldsBlocked: freshBlocked.ok !== true,
        recoveryMissingLineageBlocked: recoveryBlocked.ok !== true,
        invalidPreviewBlocked: invalid.ok !== true,
        adapterRegistryWorks: listedHasCapture && got && got.ok === true,
        sideEffectsFalse: allSideEffectsFalse(fresh.sideEffectSummary) &&
          allSideEffectsFalse(recovery.sideEffectSummary) &&
          allSideEffectsFalse(invalid.sideEffectSummary)
      }
    });
  }

  H2O.Desktop.Sync.registerCaptureExecuteAdapter = registerCaptureExecuteAdapter;
  H2O.Desktop.Sync.buildCaptureExecuteEnvelope = buildCaptureExecuteEnvelope;
  H2O.Desktop.Sync.runCaptureExecuteAdapterProof = runCaptureExecuteAdapterProof;
  H2O.Desktop.Sync.__captureExecuteAdapterInstalled = true;
  H2O.Desktop.Sync.__captureExecuteAdapterVersion = VERSION;
  if (typeof H2O.Desktop.Sync.registerExecuteAdapter === 'function') {
    try { registerCaptureExecuteAdapter({ replaceExisting: true }); } catch (_) { /* proof covers registration */ }
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
