/* H2O Desktop Sync - F14.6.2 execute envelope contract
 *
 * Execute Lane envelope shape and two-flavor adapter registry contract.
 *
 * Safety invariants:
 *   - Shape/validate/register metadata only. No broker, dispatch,
 *     publication, relay/outbox, Native execution, F5 execution, apply,
 *     watermark writes, consumed-operation writes, timers, polling, or storage.
 *   - Adapter registry is in-memory only and stores metadata, not executable
 *     callbacks.
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
  if (H2O.Desktop.Sync.__executeEnvelopeInstalled) return;

  var VERSION = '0.1.0-f14.6.2';
  var ENVELOPE_SCHEMA = 'h2o.desktop.sync.execute-envelope.v1';
  var ADAPTER_SCHEMA = 'h2o.desktop.sync.execute-adapter.v1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.execute-envelope-result.v1';
  var FLAVORS = ['proposal-receipt', 'canonical-preview'];
  var DOMAINS = ['chat', 'snapshot', 'capture'];
  var BACKOFF_KINDS = ['none', 'fixed', 'exponential'];
  var FORBIDDEN_ADAPTER_KEYS = [
    'broker', 'dispatch', 'execute', 'run', 'publish', 'relay', 'native',
    'callNative', 'f5', 'callF5', 'apply', 'writeWatermark',
    'recordConsumedOperation'
  ];
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message', 'turns',
    'attachments', 'files', 'rawId', 'chatId', 'snapshotId', 'folderId',
    'accountId', 'title', 'name', 'path', 'url', 'href', 'password',
    'apiKey', 'accessToken', 'refreshToken', 'token'
  ];
  var adapterRegistry = {};

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
      brokerInstalled: false,
      dispatchAttempted: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Executed: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
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
  function normalizeStringArray(value) {
    var out = [];
    asArray(value).forEach(function (item) {
      var text = cleanString(item);
      if (text && out.indexOf(text) === -1) out.push(text);
    });
    return out;
  }
  function normalizeShapeMap(value) {
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
  function normalizeRetryPolicy(value) {
    var source = safeObject(value);
    var maxAttempts = Number.isInteger(source.maxAttempts) ? source.maxAttempts : 0;
    var minDelayMs = Number.isInteger(source.minDelayMs) ? source.minDelayMs : 0;
    var maxDelayMs = Number.isInteger(source.maxDelayMs) ? source.maxDelayMs : minDelayMs;
    var backoffKind = cleanString(source.backoffKind || source.kind || 'none');
    if (BACKOFF_KINDS.indexOf(backoffKind) === -1) backoffKind = 'none';
    return {
      maxAttempts: maxAttempts,
      minDelayMs: minDelayMs,
      maxDelayMs: maxDelayMs,
      backoffKind: backoffKind
    };
  }
  function normalizeDispatchProfile(value) {
    var source = safeObject(value);
    return {
      requiresF5: source.requiresF5 === true,
      requiresNative: source.requiresNative === true,
      requiresRelay: source.requiresRelay === true,
      nativeCommand: cleanString(source.nativeCommand),
      nativeIdempotent: source.nativeIdempotent === true,
      f5QueueKey: cleanString(source.f5QueueKey),
      retryPolicy: normalizeRetryPolicy(source.retryPolicy)
    };
  }
  function envelopeDigestInput(envelope) {
    return {
      schema: ENVELOPE_SCHEMA,
      envelopeKind: cleanString(envelope.envelopeKind),
      domainId: cleanString(envelope.domainId),
      operationKind: cleanString(envelope.operationKind),
      subjectId: cleanLower(envelope.subjectId),
      lineageId: cleanString(envelope.lineageId),
      dedupeKey: cleanLower(envelope.dedupeKey),
      dispatchProfile: normalizeDispatchProfile(envelope.dispatchProfile),
      payloadShapes: normalizeShapeMap(envelope.payloadShapes),
      settlementShapes: normalizeShapeMap(envelope.settlementShapes),
      createdAtIso: cleanString(envelope.createdAtIso)
    };
  }
  async function deriveEventDigest(envelope) {
    return await sha256Hex(envelopeDigestInput(envelope));
  }
  function envelopeSummary(envelope) {
    var e = safeObject(envelope);
    return {
      schema: ENVELOPE_SCHEMA,
      envelopeKind: cleanString(e.envelopeKind || e.flavor),
      domainId: cleanString(e.domainId),
      operationKind: cleanString(e.operationKind),
      subjectId: cleanLower(e.subjectId),
      lineageId: cleanString(e.lineageId),
      dedupeKey: cleanLower(e.dedupeKey),
      eventDigest: cleanLower(e.eventDigest),
      dispatchProfile: normalizeDispatchProfile(e.dispatchProfile),
      payloadShapes: normalizeShapeMap(e.payloadShapes),
      settlementShapes: normalizeShapeMap(e.settlementShapes),
      createdAtIso: cleanString(e.createdAtIso)
    };
  }

  async function shapeExecuteEnvelope(input) {
    var args = safeObject(input);
    var createdAtIso = cleanString(args.createdAtIso) || nowIsoSeconds();
    var envelope = {
      schema: ENVELOPE_SCHEMA,
      envelopeKind: cleanString(args.envelopeKind || args.flavor || 'proposal-receipt'),
      domainId: cleanString(args.domainId),
      operationKind: cleanString(args.operationKind),
      subjectId: cleanLower(args.subjectId),
      lineageId: cleanString(args.lineageId),
      dedupeKey: cleanLower(args.dedupeKey),
      eventDigest: cleanLower(args.eventDigest),
      dispatchProfile: normalizeDispatchProfile(args.dispatchProfile),
      payloadShapes: normalizeShapeMap(args.payloadShapes),
      settlementShapes: normalizeShapeMap(args.settlementShapes),
      createdAtIso: createdAtIso
    };
    if (!envelope.eventDigest) envelope.eventDigest = await deriveEventDigest(envelope);
    return envelopeSummary(envelope);
  }

  function validateDispatchProfile(profile, blockers) {
    if (!isObject(profile)) {
      addCode(blockers, 'execute-envelope-dispatchProfile-required');
      return;
    }
    if (typeof profile.requiresF5 !== 'boolean') addCode(blockers, 'execute-envelope-requiresF5-invalid');
    if (typeof profile.requiresNative !== 'boolean') addCode(blockers, 'execute-envelope-requiresNative-invalid');
    if (typeof profile.requiresRelay !== 'boolean') addCode(blockers, 'execute-envelope-requiresRelay-invalid');
    if (typeof profile.nativeIdempotent !== 'boolean') addCode(blockers, 'execute-envelope-nativeIdempotent-invalid');
    if (profile.requiresNative === true && !cleanString(profile.nativeCommand)) {
      addCode(blockers, 'execute-envelope-nativeCommand-required');
    }
    if (profile.requiresF5 === true && !cleanString(profile.f5QueueKey)) {
      addCode(blockers, 'execute-envelope-f5QueueKey-required');
    }
    if (!isObject(profile.retryPolicy)) {
      addCode(blockers, 'execute-envelope-retryPolicy-required');
      return;
    }
    var retry = safeObject(profile.retryPolicy);
    if (!Number.isInteger(retry.maxAttempts) || retry.maxAttempts < 0 || retry.maxAttempts > 10) {
      addCode(blockers, 'execute-envelope-retryPolicy-maxAttempts-invalid');
    }
    if (!Number.isInteger(retry.minDelayMs) || retry.minDelayMs < 0) {
      addCode(blockers, 'execute-envelope-retryPolicy-minDelayMs-invalid');
    }
    if (!Number.isInteger(retry.maxDelayMs) || retry.maxDelayMs < retry.minDelayMs) {
      addCode(blockers, 'execute-envelope-retryPolicy-maxDelayMs-invalid');
    }
    if (BACKOFF_KINDS.indexOf(cleanString(retry.backoffKind)) === -1) {
      addCode(blockers, 'execute-envelope-retryPolicy-backoffKind-invalid');
    }
  }

  function validateExecuteEnvelope(envelope) {
    var raw = safeObject(envelope);
    var e = envelopeSummary(raw);
    var blockers = [];
    var warnings = [];
    if (raw.schema && raw.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'execute-envelope-schema-invalid');
    if (FLAVORS.indexOf(e.envelopeKind) === -1) addCode(blockers, 'execute-envelope-flavor-invalid');
    if (DOMAINS.indexOf(e.domainId) === -1) addCode(blockers, 'execute-envelope-domain-invalid');
    if (!cleanString(e.operationKind)) addCode(blockers, 'execute-envelope-operationKind-required');
    if (!isSha256Hex(e.subjectId)) addCode(blockers, 'execute-envelope-subjectId-invalid');
    if (!cleanString(e.lineageId)) addCode(blockers, 'execute-envelope-lineageId-required');
    if (!isSha256Hex(e.dedupeKey)) addCode(blockers, 'execute-envelope-dedupeKey-invalid');
    if (!isSha256Hex(e.eventDigest)) addCode(blockers, 'execute-envelope-eventDigest-invalid');
    validateDispatchProfile(raw.dispatchProfile, blockers);
    if (!isObject(raw.payloadShapes)) addCode(blockers, 'execute-envelope-payloadShapes-required');
    if (!isObject(raw.settlementShapes)) addCode(blockers, 'execute-envelope-settlementShapes-required');
    if (!isIso(e.createdAtIso)) addCode(blockers, 'execute-envelope-createdAtIso-invalid');
    if (e.envelopeKind === 'proposal-receipt' && !safeObject(e.payloadShapes).proposalReceipt) {
      addCode(warnings, 'execute-envelope-proposalReceipt-shape-missing');
    }
    if (e.envelopeKind === 'canonical-preview' && !safeObject(e.payloadShapes).canonicalPreview) {
      addCode(warnings, 'execute-envelope-canonicalPreview-shape-missing');
    }
    var forbidden = foreverNoKey(e);
    if (forbidden) {
      addCode(blockers, 'execute-envelope-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return buildResult({
      ok: blockers.length === 0,
      envelope: e,
      blockers: blockers,
      warnings: warnings,
      metadata: { envelopeKind: e.envelopeKind, domainId: e.domainId }
    });
  }

  function adapterSummary(adapter) {
    var source = safeObject(adapter);
    return {
      schema: ADAPTER_SCHEMA,
      adapterId: cleanString(source.adapterId || source.id),
      domainId: cleanString(source.domainId),
      version: cleanString(source.version),
      envelopeKinds: normalizeStringArray(source.envelopeKinds || source.flavors || FLAVORS),
      operationKinds: normalizeStringArray(source.operationKinds),
      dispatchTargets: normalizeStringArray(source.dispatchTargets),
      replaceExisting: source.replaceExisting === true || source.replace === true
    };
  }
  function hasFunctionValue(value) {
    if (typeof value === 'function') return true;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        if (hasFunctionValue(value[i])) return true;
      }
      return false;
    }
    if (!isObject(value)) return false;
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      if (hasFunctionValue(value[keys[k]])) return true;
    }
    return false;
  }
  function validateExecuteAdapter(adapter) {
    var raw = safeObject(adapter);
    var a = adapterSummary(raw);
    var blockers = [];
    var warnings = [];
    if (raw.schema && raw.schema !== ADAPTER_SCHEMA) addCode(blockers, 'execute-adapter-schema-invalid');
    if (!a.adapterId) addCode(blockers, 'execute-adapterId-required');
    if (DOMAINS.indexOf(a.domainId) === -1) addCode(blockers, 'execute-adapter-domain-invalid');
    if (!a.version) addCode(blockers, 'execute-adapter-version-required');
    if (!a.envelopeKinds.length) addCode(blockers, 'execute-adapter-envelopeKinds-required');
    a.envelopeKinds.forEach(function (kind) {
      if (FLAVORS.indexOf(kind) === -1) addCode(blockers, 'execute-adapter-flavor-invalid');
    });
    if (!a.operationKinds.length) addCode(blockers, 'execute-adapter-operationKinds-required');
    FORBIDDEN_ADAPTER_KEYS.forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(raw, key)) addCode(blockers, 'execute-adapter-execution-key-forbidden');
    });
    if (hasFunctionValue(raw)) addCode(blockers, 'execute-adapter-functions-forbidden');
    var forbidden = foreverNoKey(a);
    if (forbidden) {
      addCode(blockers, 'execute-adapter-contains-forbidden-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return buildResult({
      ok: blockers.length === 0,
      adapter: a,
      blockers: blockers,
      warnings: warnings,
      metadata: { domainId: a.domainId, adapterId: a.adapterId }
    });
  }
  function registerExecuteAdapter(adapter) {
    var validation = validateExecuteAdapter(adapter);
    if (!validation.ok) return validation;
    var a = validation.adapter;
    var existing = adapterRegistry[a.domainId];
    if (existing && a.replaceExisting !== true) {
      return failure(['execute-adapter-duplicate-domain'], [], {
        domainId: a.domainId,
        existingAdapterId: existing.adapterId
      });
    }
    adapterRegistry[a.domainId] = {
      schema: ADAPTER_SCHEMA,
      adapterId: a.adapterId,
      domainId: a.domainId,
      version: a.version,
      envelopeKinds: a.envelopeKinds.slice(),
      operationKinds: a.operationKinds.slice(),
      dispatchTargets: a.dispatchTargets.slice()
    };
    return buildResult({
      ok: true,
      adapter: adapterRegistry[a.domainId],
      adapters: listAdapterSummaries(),
      metadata: { registered: true, replaced: !!existing }
    });
  }
  function getExecuteAdapter(domainId) {
    var id = cleanString(isObject(domainId) ? domainId.domainId : domainId);
    if (DOMAINS.indexOf(id) === -1) return failure(['execute-adapter-domain-invalid'], []);
    var adapter = adapterRegistry[id] || null;
    if (!adapter) return failure(['execute-adapter-not-registered'], [], { domainId: id });
    return buildResult({ ok: true, adapter: adapter, metadata: { domainId: id } });
  }
  function listAdapterSummaries() {
    return Object.keys(adapterRegistry).sort().map(function (domainId) {
      var adapter = adapterRegistry[domainId];
      return {
        schema: adapter.schema,
        adapterId: adapter.adapterId,
        domainId: adapter.domainId,
        version: adapter.version,
        envelopeKinds: adapter.envelopeKinds.slice(),
        operationKinds: adapter.operationKinds.slice(),
        dispatchTargets: adapter.dispatchTargets.slice()
      };
    });
  }
  function listExecuteAdapters() {
    return buildResult({
      ok: true,
      adapters: listAdapterSummaries(),
      metadata: { count: listAdapterSummaries().length }
    });
  }

  async function proofEnvelope(kind, domain) {
    var seed = kind + ':' + domain;
    var subjectId = await sha256Hex('execute-envelope-proof:subject:' + seed);
    var dedupeKey = await sha256Hex('execute-envelope-proof:dedupe:' + seed);
    return await shapeExecuteEnvelope({
      envelopeKind: kind,
      domainId: domain,
      operationKind: domain + '-proof-operation',
      subjectId: subjectId,
      lineageId: 'execute-envelope-proof-lineage-' + seed,
      dedupeKey: dedupeKey,
      dispatchProfile: {
        requiresF5: kind === 'proposal-receipt' && domain === 'snapshot',
        requiresNative: kind === 'proposal-receipt',
        requiresRelay: false,
        nativeCommand: kind === 'proposal-receipt' ? domain + '.proof.preview' : '',
        nativeIdempotent: true,
        f5QueueKey: kind === 'proposal-receipt' && domain === 'snapshot' ? 'snapshot-f5-review' : '',
        retryPolicy: { maxAttempts: 0, minDelayMs: 0, maxDelayMs: 0, backoffKind: 'none' }
      },
      payloadShapes: kind === 'proposal-receipt' ? {
        proposalReceipt: {
          schema: 'h2o.desktop.sync.execute-envelope-proof-proposal-receipt.v1',
          receiptDigest: await sha256Hex('execute-envelope-proof:receipt:' + seed)
        }
      } : {
        canonicalPreview: {
          schema: 'h2o.desktop.sync.execute-envelope-proof-canonical-preview.v1',
          previewDigest: await sha256Hex('execute-envelope-proof:preview:' + seed)
        }
      },
      settlementShapes: {
        journalPhase: 'accepted',
        settlementDigest: await sha256Hex('execute-envelope-proof:settlement:' + seed)
      },
      createdAtIso: '2026-06-01T10:00:00Z'
    });
  }
  async function runExecuteEnvelopeProof() {
    var blockers = [];
    var warnings = [];
    var previousRegistry = adapterRegistry;
    adapterRegistry = {};
    try {
      var proposalReceipt = await proofEnvelope('proposal-receipt', 'snapshot');
      var canonicalPreview = await proofEnvelope('canonical-preview', 'capture');
      var proposalValidation = validateExecuteEnvelope(proposalReceipt);
      var previewValidation = validateExecuteEnvelope(canonicalPreview);
      if (!proposalValidation.ok) addCode(blockers, 'proof-valid-proposal-receipt-rejected');
      if (!previewValidation.ok) addCode(blockers, 'proof-valid-canonical-preview-rejected');

      var invalidDomain = validateExecuteEnvelope(Object.assign({}, proposalReceipt, { domainId: 'folder' }));
      var invalidFlavor = validateExecuteEnvelope(Object.assign({}, proposalReceipt, { envelopeKind: 'dispatch-now' }));
      var missingDispatchProfile = validateExecuteEnvelope((function () {
        var clone = Object.assign({}, proposalReceipt);
        delete clone.dispatchProfile;
        return clone;
      })());
      if (invalidDomain.ok) addCode(blockers, 'proof-invalid-domain-accepted');
      if (invalidFlavor.ok) addCode(blockers, 'proof-invalid-flavor-accepted');
      if (missingDispatchProfile.ok) addCode(blockers, 'proof-missing-dispatchProfile-accepted');

      var registerOne = registerExecuteAdapter({
        adapterId: 'execute-envelope-proof-snapshot-adapter',
        domainId: 'snapshot',
        version: 'proof',
        envelopeKinds: FLAVORS,
        operationKinds: ['snapshot-proof-operation'],
        dispatchTargets: ['native', 'f5']
      });
      var duplicate = registerExecuteAdapter({
        adapterId: 'execute-envelope-proof-snapshot-adapter-duplicate',
        domainId: 'snapshot',
        version: 'proof',
        envelopeKinds: FLAVORS,
        operationKinds: ['snapshot-proof-operation'],
        dispatchTargets: ['native']
      });
      var replace = registerExecuteAdapter({
        adapterId: 'execute-envelope-proof-snapshot-adapter-v2',
        domainId: 'snapshot',
        version: 'proof-v2',
        envelopeKinds: FLAVORS,
        operationKinds: ['snapshot-proof-operation'],
        dispatchTargets: ['native'],
        replaceExisting: true
      });
      var list = listExecuteAdapters();
      var get = getExecuteAdapter('snapshot');
      if (!registerOne.ok) addCode(blockers, 'proof-adapter-register-failed');
      if (duplicate.ok) addCode(blockers, 'proof-duplicate-adapter-accepted');
      if (!replace.ok) addCode(blockers, 'proof-adapter-explicit-replace-failed');
      if (!list.ok || list.adapters.length !== 1) addCode(blockers, 'proof-adapter-list-failed');
      if (!get.ok || !get.adapter || get.adapter.adapterId !== 'execute-envelope-proof-snapshot-adapter-v2') {
        addCode(blockers, 'proof-adapter-get-failed');
      }
      if (H2O.Desktop.Sync.executeBroker || H2O.Desktop.Sync.__executeBrokerInstalled) {
        addCode(blockers, 'proof-execute-broker-exists');
      }
      if (!allSideEffectsFalse(sideEffectSummary())) addCode(blockers, 'proof-side-effect-flags-not-false');

      return buildResult({
        ok: blockers.length === 0,
        envelope: proposalReceipt,
        adapter: get.adapter || null,
        adapters: list.adapters || [],
        blockers: blockers,
        warnings: warnings,
        metadata: {
          proof: 'execute-envelope',
          proposalReceiptValid: proposalValidation.ok === true,
          canonicalPreviewValid: previewValidation.ok === true,
          invalidDomainBlocked: invalidDomain.ok !== true,
          invalidFlavorBlocked: invalidFlavor.ok !== true,
          missingDispatchProfileBlocked: missingDispatchProfile.ok !== true,
          adapterRegisterWorks: registerOne.ok === true,
          adapterListGetWorks: list.ok === true && get.ok === true,
          duplicateAdapterBlocked: duplicate.ok !== true,
          explicitReplaceWorks: replace.ok === true,
          brokerAbsent: !(H2O.Desktop.Sync.executeBroker || H2O.Desktop.Sync.__executeBrokerInstalled),
          sideEffectFlagsAllFalse: allSideEffectsFalse(sideEffectSummary())
        }
      });
    } finally {
      adapterRegistry = previousRegistry;
    }
  }

  H2O.Desktop.Sync.shapeExecuteEnvelope = shapeExecuteEnvelope;
  H2O.Desktop.Sync.validateExecuteEnvelope = validateExecuteEnvelope;
  H2O.Desktop.Sync.registerExecuteAdapter = registerExecuteAdapter;
  H2O.Desktop.Sync.getExecuteAdapter = getExecuteAdapter;
  H2O.Desktop.Sync.listExecuteAdapters = listExecuteAdapters;
  H2O.Desktop.Sync.validateExecuteAdapter = validateExecuteAdapter;
  H2O.Desktop.Sync.runExecuteEnvelopeProof = runExecuteEnvelopeProof;
  H2O.Desktop.Sync.__executeEnvelopeInstalled = true;
  H2O.Desktop.Sync.__executeEnvelopeVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
