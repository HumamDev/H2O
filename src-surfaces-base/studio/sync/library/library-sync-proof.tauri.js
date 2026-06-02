/* H2O Desktop Sync - F15.9.a library sync proof foundation
 *
 * Runtime smoke proof for the F15 library sync lane. This module exercises
 * the existing catalog and binding primitives with synthetic, device-local
 * fixtures, scans the redacted artifacts for raw-data leaks, and returns
 * summary evidence only.
 *
 * Safety invariants:
 *   - Proof harness only.
 *   - No real library business-table writes.
 *   - Bookkeeping calls are sandboxed behind an in-memory chrome.storage.local
 *     replacement for this proof session only.
 *   - No publication, relay/outbox, Native, F5 execution, apply, watermark,
 *     or consumed-operation writes.
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
  if (H2O.Desktop.Sync.__librarySyncProofInstalled) return;

  var VERSION = '0.1.0-f15.9.a';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-sync-proof.v1';
  var CATALOG_SUBJECT_TYPE = 'library.catalog';
  var BINDING_SUBJECT_TYPE = 'library.binding';
  var CHAT_SUBJECT_TYPE = 'chat.metadata';
  var ZERO_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var REQUIRED_APIS = [
    'canonicalizeLibraryCatalog',
    'diagnoseLibraryCatalog',
    'preflightLibraryCatalog',
    'generateLibraryCatalogProposalCandidate',
    'previewLibraryCatalogHandoff',
    'buildLibraryCatalogApplyEventReceipt',
    'recordLibraryCatalogBookkeeping',
    'shapeLibraryCatalogExecuteEnvelope',
    'canonicalizeLibraryBinding',
    'diagnoseLibraryBinding',
    'preflightLibraryBinding',
    'generateLibraryBindingProposalCandidate',
    'previewLibraryBindingHandoff',
    'buildLibraryBindingApplyEventReceipt',
    'recordLibraryBindingBookkeeping',
    'shapeLibraryBindingExecuteEnvelope',
    'proveSQLiteWriterIdentitySentinel',
    'runLibraryBulkMigrationProof'
  ];

  var REQUIRED_MARKERS = [
    '__libraryCatalogCanonicalizerInstalled',
    '__libraryBindingCanonicalizerInstalled',
    '__libraryCatalogDiagnosticsInstalled',
    '__libraryBindingDiagnosticsInstalled',
    '__libraryCatalogPreflightInstalled',
    '__libraryBindingPreflightInstalled',
    '__libraryCatalogProposalInstalled',
    '__libraryBindingProposalInstalled',
    '__libraryCatalogHandoffPreviewInstalled',
    '__libraryBindingHandoffPreviewInstalled',
    '__libraryCatalogApplyEventReceiptInstalled',
    '__libraryBindingApplyEventReceiptInstalled',
    '__libraryCatalogBookkeepingInstalled',
    '__libraryBindingBookkeepingInstalled',
    '__libraryCatalogExecuteAdapterInstalled',
    '__libraryBindingExecuteAdapterInstalled',
    '__f15CutoverInstalled',
    '__libraryBulkMigrationInstalled'
  ];

  var FORBIDDEN_OUTPUT_KEYS = [
    'name',
    'rawName',
    'displayName',
    'label',
    'title',
    'chatTitle',
    'rawTitle',
    'color',
    'rawColor',
    'rawId',
    'labelId',
    'tagId',
    'categoryId',
    'folderId',
    'chatId',
    'chat_id',
    'category_id',
    'chats.category_id',
    'accountId',
    'rawAccountId',
    'userId',
    'rawUserId',
    'content',
    'body',
    'text',
    'messages',
    'turns',
    'attachments',
    'files',
    'filename',
    'fileName',
    'path',
    'url',
    'token',
    'tokens'
  ];

  function getSync() { return H2O.Desktop.Sync || {}; }
  function getKernel() { return getSync().kernel || null; }
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isSha256Hex(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return SHA256_RE.test(cleanLower(value));
  }
  function addCode(list, code) {
    var text = cleanString(code);
    if (!text || list.indexOf(text) !== -1) return;
    list.push(text);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
  }
  function mergeCodes(into, value) {
    codeList(value).forEach(function (code) { addCode(into, code); });
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
  function canonicalJSON(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.canonicalJSON === 'function') {
      try { return kernel.canonicalJSON(value); } catch (_) { /* fall through */ }
    }
    return JSON.stringify(canonicalize(value));
  }
  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }
  async function sha256Hex(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var digest = await kernel.sha256Hex(value);
        if (isSha256Hex(digest)) return cleanLower(digest);
      } catch (_) { /* fall through */ }
    }
    if (!global.crypto || !global.crypto.subtle || typeof TextEncoder === 'undefined') return '';
    var text = typeof value === 'string' ? value : canonicalJSON(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }
  async function digestOf(value) {
    return await sha256Hex(canonicalJSON(value));
  }
  function sideEffectSummary() {
    return {
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      realBusinessTableWritten: false,
      realBookkeepingStorageWritten: false
    };
  }

  function stepOk(value, field) {
    if (!isObject(value)) return false;
    if (field && value[field] !== true) return false;
    return value.ok === true;
  }
  function summarizeResult(value) {
    var v = safeObject(value);
    return {
      ok: v.ok === true,
      blockers: codeList(v.blockers),
      warnings: codeList(v.warnings),
      sideEffectSummary: safeObject(v.sideEffectSummary)
    };
  }
  function summarizePipeline(label, parts, extras) {
    var blockers = [];
    var warnings = [];
    Object.keys(parts).forEach(function (key) {
      mergeCodes(blockers, parts[key] && parts[key].blockers);
      mergeCodes(warnings, parts[key] && parts[key].warnings);
    });
    var stepStatus = {};
    Object.keys(parts).forEach(function (key) {
      var part = safeObject(parts[key]);
      stepStatus[key] = part.ok === true;
    });
    var ok = Object.keys(stepStatus).every(function (key) { return stepStatus[key] === true; }) &&
      blockers.length === 0;
    return Object.assign({
      ok: ok,
      lane: label,
      steps: stepStatus,
      blockers: blockers,
      warnings: warnings,
      sideEffectSummary: sideEffectSummary()
    }, safeObject(extras));
  }

  async function apiPresence() {
    var sync = getSync();
    var missingApis = [];
    var missingMarkers = [];
    for (var i = 0; i < REQUIRED_APIS.length; i++) {
      if (typeof sync[REQUIRED_APIS[i]] !== 'function') missingApis.push(REQUIRED_APIS[i]);
    }
    for (var j = 0; j < REQUIRED_MARKERS.length; j++) {
      if (sync[REQUIRED_MARKERS[j]] !== true) missingMarkers.push(REQUIRED_MARKERS[j]);
    }
    return {
      ok: missingApis.length === 0 && missingMarkers.length === 0,
      checkedApiCount: REQUIRED_APIS.length,
      checkedMarkerCount: REQUIRED_MARKERS.length,
      missingApis: missingApis,
      missingMarkers: missingMarkers,
      blockers: missingApis.concat(missingMarkers).map(function (name) {
        return 'library-sync-proof-api-missing:' + name;
      }),
      warnings: []
    };
  }

  function buildPrivacyNeedles(raw) {
    var values = asArray(raw);
    return values.map(cleanString).filter(Boolean);
  }
  function collectForbiddenKeys(value, hits, path) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) collectForbiddenKeys(value[i], hits, path + '[' + i + ']');
      return;
    }
    if (!isObject(value)) return;
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      if (FORBIDDEN_OUTPUT_KEYS.indexOf(key) !== -1) hits.push(path ? path + '.' + key : key);
      collectForbiddenKeys(value[key], hits, path ? path + '.' + key : key);
    }
  }
  async function privacyScan(targets, rawNeedles) {
    var blockers = [];
    var warnings = [];
    var leakCount = 0;
    var checkedTargets = 0;
    var needles = buildPrivacyNeedles(rawNeedles);
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      if (!isObject(target) && !Array.isArray(target)) continue;
      checkedTargets += 1;
      var text = '';
      try { text = JSON.stringify(target); } catch (_) { text = ''; }
      var lower = text.toLowerCase();
      for (var n = 0; n < needles.length; n++) {
        var needle = needles[n];
        if (needle && lower.indexOf(needle.toLowerCase()) !== -1) {
          leakCount += 1;
          addCode(blockers, 'library-sync-proof-raw-value-leak:' + n);
        }
      }
      var keyHits = [];
      collectForbiddenKeys(target, keyHits, '');
      if (keyHits.length) {
        leakCount += keyHits.length;
        addCode(blockers, 'library-sync-proof-forbidden-field-leak');
      }
      var domain = target.subjectType === BINDING_SUBJECT_TYPE ? BINDING_SUBJECT_TYPE : CATALOG_SUBJECT_TYPE;
      var kernel = getKernel();
      if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
        try {
          var scan = kernel.scanDomainForbiddenFields(domain, target);
          if (scan && scan.ok === false) {
            leakCount += asArray(scan.forbiddenFields).length || 1;
            addCode(blockers, 'library-sync-proof-domain-privacy-failed');
          }
        } catch (_) {
          addCode(warnings, 'library-sync-proof-domain-privacy-threw');
        }
      }
    }
    return {
      ok: blockers.length === 0,
      checkedTargets: checkedTargets,
      leakCount: leakCount,
      blockers: blockers,
      warnings: warnings
    };
  }

  async function buildActorPeer() {
    return {
      physicalDeviceIdHash: await sha256Hex('f15.9.a.proof.device'),
      installIdHash: await sha256Hex('f15.9.a.proof.install'),
      syncPeerIdHash: await sha256Hex('f15.9.a.proof.peer')
    };
  }
  async function buildOwner() {
    return {
      ownerNameHash: await sha256Hex('f15.9.a.proof.native.owner'),
      ownerVersionHash: await sha256Hex('f15.9.a.proof.owner.version')
    };
  }
  async function buildF5Review() {
    return {
      reviewId: await sha256Hex('f15.9.a.proof.f5.review'),
      reviewStatus: 'pending-review',
      reviewKind: 'f5-reviewed-library-catalog-tombstone'
    };
  }
  async function buildExecuteDispatch() {
    return {
      ok: true,
      confirmed: true,
      dispatchStatus: 'confirmed',
      operationResultDigest: await sha256Hex('f15.9.a.proof.dispatch.result'),
      sideEffectSummary: sideEffectSummary()
    };
  }
  async function buildCommonFixtures(input) {
    var observedAtIso = cleanString(input && input.observedAtIso) || '2026-06-02T00:00:00Z';
    var originAccountIdHash = await sha256Hex('f15.9.a.proof.account');
    var actorPeer = await buildActorPeer();
    var owner = await buildOwner();
    var f5Review = await buildF5Review();
    var dispatch = await buildExecuteDispatch();
    var chatSubjectId = await sha256Hex('chat.metadata:f15.9.a.proof.chat');
    var raw = {
      catalogRawNameValue: 'F15 Proof Label Raw Name',
      catalogRawColorValue: '#15A9AA',
      catalogRawIdValue: 'f15-proof-catalog-raw-id',
      chatRawIdValue: 'f15-proof-chat-raw-id',
      categoryRawIdValue: 'f15-proof-category-id',
      bundlePathNeedle: '/tmp/f15-proof-library.bundle',
      bundleFileNeedle: 'f15-proof-library.bundle',
      titleValue: 'F15 Proof Raw Title',
      contentValue: 'F15 Proof Raw Content',
      tokenValue: 'f15-proof-token'
    };
    return {
      observedAtIso: observedAtIso,
      originAccountIdHash: originAccountIdHash,
      actorPeer: actorPeer,
      owner: owner,
      f5Review: f5Review,
      dispatch: dispatch,
      chatSubjectId: chatSubjectId,
      raw: raw,
      ledgerInputs: {
        catalog: {},
        binding: {}
      }
    };
  }

  function catalogDeviceLocalInput(fixtures) {
    var row = {
      catalogKind: 'label',
      lifecycleState: 'active',
      perEnvelopeSalt: 'f15.9.a.catalog.salt',
      originAccountIdHash: fixtures.originAccountIdHash,
      sourceTag: 'desktop',
      observedAtIso: fixtures.observedAtIso
    };
    row.rawId = fixtures.raw.catalogRawIdValue;
    row.name = fixtures.raw.catalogRawNameValue;
    row.color = fixtures.raw.catalogRawColorValue;
    return row;
  }
  function catalogContext(fixtures, canonical, operation) {
    return {
      operation: operation,
      canonicalCatalog: canonical,
      currentLifecycleState: operation === 'create' ? 'absent' : canonical.lifecycleState,
      localAccountIdHash: fixtures.originAccountIdHash,
      actorPeer: fixtures.actorPeer,
      existingCatalogSiblings: [],
      sourceMirror: { fresh: true, status: 'fresh' },
      replayContext: { replaySafe: true, ok: true },
      watermarkState: { watermarkSafe: true, ok: true, currentWatermark: 1, proposedWatermark: 2 },
      consumedOperationState: { consumedSafe: true, ok: true },
      requireContext: true,
      observedAtIso: fixtures.observedAtIso
    };
  }
  async function bindingDeviceLocalInput(fixtures, catalog) {
    return {
      bindingKind: 'chat-label',
      bindingState: 'bound',
      perEnvelopeSalt: 'f15.9.a.binding.salt',
      leftSubjectType: CHAT_SUBJECT_TYPE,
      rightSubjectType: CATALOG_SUBJECT_TYPE,
      leftSubjectId: fixtures.chatSubjectId,
      rightSubjectId: catalog.subjectId,
      originAccountIdHash: fixtures.originAccountIdHash,
      sourceTag: 'desktop',
      observedAtIso: fixtures.observedAtIso
    };
  }
  function chatContext(fixtures) {
    return {
      subjectType: CHAT_SUBJECT_TYPE,
      subjectId: fixtures.chatSubjectId,
      lifecycleState: 'active',
      originAccountIdHash: fixtures.originAccountIdHash,
      redactionClass: 'redacted'
    };
  }
  function bindingContext(fixtures, binding, catalog, operation) {
    return {
      operation: operation,
      diagnosticIntent: operation,
      canonicalBinding: binding,
      localAccountIdHash: fixtures.originAccountIdHash,
      actorPeer: fixtures.actorPeer,
      relatedCatalogs: [catalog],
      relatedChats: [chatContext(fixtures)],
      siblingBindings: [],
      sourceMirror: { fresh: true, status: 'fresh' },
      replayContext: { replaySafe: true, ok: true },
      watermarkState: { watermarkSafe: true, ok: true, currentWatermark: 1, proposedWatermark: 2 },
      consumedOperationState: { consumedSafe: true, ok: true },
      materializedCacheObservation: { status: 'fresh' },
      requireContext: true,
      observedAtIso: fixtures.observedAtIso
    };
  }

  function memoryStorageAdapter(memory) {
    return {
      get: function (keys, callback) {
        var out = {};
        var arr = Array.isArray(keys) ? keys : [keys];
        for (var i = 0; i < arr.length; i++) {
          var key = arr[i];
          if (Object.prototype.hasOwnProperty.call(memory, key)) out[key] = memory[key];
        }
        callback(out);
      },
      set: function (items, callback) {
        Object.keys(items || {}).forEach(function (key) { memory[key] = items[key]; });
        callback();
      }
    };
  }
  async function withMemoryChromeStorage(fn) {
    var oldChrome = global.chrome;
    var memory = {};
    var proofChrome = Object.assign({}, oldChrome || {});
    proofChrome.runtime = Object.assign({}, proofChrome.runtime || {}, { lastError: null });
    proofChrome.storage = Object.assign({}, proofChrome.storage || {}, {
      local: memoryStorageAdapter(memory)
    });
    global.chrome = proofChrome;
    try {
      return await fn(memory);
    } finally {
      if (typeof oldChrome === 'undefined') {
        try { delete global.chrome; } catch (_) { global.chrome = undefined; }
      } else {
        global.chrome = oldChrome;
      }
    }
  }

  async function runLibraryCatalogPipelineProof(input) {
    var blockers = [];
    var warnings = [];
    var fixtures = await buildCommonFixtures(input || {});
    var artifacts = [];
    var parts = {};

    try {
      var canonical = await getSync().canonicalizeLibraryCatalog(catalogDeviceLocalInput(fixtures));
      parts.canonicalize = summarizeResult(canonical);
      if (!stepOk(canonical)) addCode(blockers, 'library-sync-proof-catalog-canonicalize-failed');
      var catalog = safeObject(canonical.canonical);

      var context = catalogContext(fixtures, catalog, 'create');
      var diagnostics = await getSync().diagnoseLibraryCatalog(context);
      parts.diagnose = summarizeResult(diagnostics);
      if (!stepOk(diagnostics)) addCode(blockers, 'library-sync-proof-catalog-diagnostics-failed');

      var preflight = await getSync().preflightLibraryCatalog(Object.assign({}, context, { diagnosticsResult: diagnostics }));
      parts.preflight = summarizeResult(preflight);
      if (!stepOk(preflight) || preflight.actionable !== true) addCode(blockers, 'library-sync-proof-catalog-preflight-failed');

      var proposal = await getSync().generateLibraryCatalogProposalCandidate(Object.assign({}, context, {
        diagnosticsResult: diagnostics
      }));
      parts.proposal = summarizeResult(proposal);
      if (!stepOk(proposal) || proposal.generated !== true) addCode(blockers, 'library-sync-proof-catalog-proposal-failed');

      var handoff = await getSync().previewLibraryCatalogHandoff({
        operation: 'create',
        proposalCandidate: proposal,
        candidate: proposal.candidate,
        preflight: proposal.preflight || preflight,
        actorPeer: fixtures.actorPeer,
        ownerStatus: 'reachable',
        originAccountIdHash: fixtures.originAccountIdHash,
        observedAtIso: fixtures.observedAtIso
      });
      parts.handoff = summarizeResult(handoff);
      if (!stepOk(handoff) || handoff.handoffReady !== true) addCode(blockers, 'library-sync-proof-catalog-handoff-failed');

      var receipt = await getSync().buildLibraryCatalogApplyEventReceipt({
        operation: 'create',
        handoffPreview: handoff,
        observedAtIso: fixtures.observedAtIso
      });
      parts.receipt = summarizeResult(receipt);
      if (!stepOk(receipt)) addCode(blockers, 'library-sync-proof-catalog-receipt-failed');

      var bookkeeping = await withMemoryChromeStorage(function () {
        return getSync().recordLibraryCatalogBookkeeping({
          receipt: receipt,
          observedAtIso: fixtures.observedAtIso,
          recordedAtIso: fixtures.observedAtIso
        });
      });
      parts.bookkeeping = summarizeResult(bookkeeping);
      if (!stepOk(bookkeeping) || !isObject(bookkeeping.row)) addCode(blockers, 'library-sync-proof-catalog-bookkeeping-failed');

      var execute = await getSync().shapeLibraryCatalogExecuteEnvelope({
        bookkeepingResult: bookkeeping,
        receipt: receipt,
        observedAtIso: fixtures.observedAtIso
      });
      parts.executeEnvelope = summarizeResult(execute);
      if (!stepOk(execute) || !isObject(execute.envelope)) addCode(blockers, 'library-sync-proof-catalog-execute-envelope-failed');

      artifacts = [canonical, diagnostics, preflight, proposal, handoff, receipt, bookkeeping, execute];
      mergeCodes(warnings, parts.bookkeeping.warnings);
      mergeCodes(warnings, parts.executeEnvelope.warnings);
      var privacy = await privacyScan(artifacts, [
        fixtures.raw.catalogRawNameValue,
        fixtures.raw.catalogRawColorValue,
        fixtures.raw.catalogRawIdValue,
        fixtures.raw.chatRawIdValue,
        fixtures.raw.categoryRawIdValue,
        fixtures.raw.bundlePathNeedle,
        fixtures.raw.bundleFileNeedle,
        fixtures.raw.titleValue,
        fixtures.raw.contentValue,
        fixtures.raw.tokenValue
      ]);
      if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
      mergeCodes(warnings, privacy.warnings);

      var artifactDigest = await digestOf({
        subjectId: proposal.subjectId,
        lineageId: proposal.lineageId,
        dedupeKey: proposal.dedupeKey,
        executeEnvelopeDigest: execute.envelope && execute.envelope.eventDigest
      });
      return summarizePipeline('library.catalog', parts, {
        operation: 'create',
        subjectId: proposal.subjectId || catalog.subjectId,
        lineageId: proposal.lineageId,
        dedupeKey: proposal.dedupeKey,
        operationId: proposal.operationId,
        executeEnvelopeDigest: execute.envelope && execute.envelope.eventDigest,
        artifactDigest: artifactDigest,
        privacy: privacy,
        inMemoryBookkeepingWritten: bookkeeping && bookkeeping.sideEffectSummary &&
          bookkeeping.sideEffectSummary.bookkeepingLedgerWritten === true,
        blockers: blockers,
        warnings: codeList(warnings)
      });
    } catch (e) {
      addCode(blockers, 'library-sync-proof-catalog-threw');
      return summarizePipeline('library.catalog', parts, {
        operation: 'create',
        blockers: blockers,
        warnings: warnings.concat(cleanString(e && e.message) ? ['library-sync-proof-catalog-error'] : [])
      });
    }
  }

  async function runLibraryBindingPipelineProof(input) {
    var blockers = [];
    var warnings = [];
    var fixtures = await buildCommonFixtures(input || {});
    var artifacts = [];
    var parts = {};

    try {
      var catalogCanonical = await getSync().canonicalizeLibraryCatalog(catalogDeviceLocalInput(fixtures));
      var catalog = safeObject(catalogCanonical.canonical);
      var bindingInput = await bindingDeviceLocalInput(fixtures, catalog);

      var canonical = await getSync().canonicalizeLibraryBinding(bindingInput);
      parts.canonicalize = summarizeResult(canonical);
      if (!stepOk(canonical)) addCode(blockers, 'library-sync-proof-binding-canonicalize-failed');
      var binding = safeObject(canonical.canonical);

      var context = bindingContext(fixtures, binding, catalog, 'bind');
      var diagnostics = await getSync().diagnoseLibraryBinding(context);
      parts.diagnose = summarizeResult(diagnostics);
      if (!stepOk(diagnostics)) addCode(blockers, 'library-sync-proof-binding-diagnostics-failed');

      var preflight = await getSync().preflightLibraryBinding(Object.assign({}, context, { diagnosticsResult: diagnostics }));
      parts.preflight = summarizeResult(preflight);
      if (!stepOk(preflight) || preflight.actionable !== true) addCode(blockers, 'library-sync-proof-binding-preflight-failed');

      var proposal = await getSync().generateLibraryBindingProposalCandidate(Object.assign({}, context, {
        diagnosticsResult: diagnostics
      }));
      parts.proposal = summarizeResult(proposal);
      if (!stepOk(proposal) || proposal.generated !== true) addCode(blockers, 'library-sync-proof-binding-proposal-failed');

      var handoff = await getSync().previewLibraryBindingHandoff({
        operation: 'bind',
        proposalCandidate: proposal,
        candidate: proposal.candidate,
        preflight: proposal.preflight || preflight,
        actorPeer: fixtures.actorPeer,
        ownerStatus: 'reachable',
        originAccountIdHash: fixtures.originAccountIdHash,
        observedAtIso: fixtures.observedAtIso
      });
      parts.handoff = summarizeResult(handoff);
      if (!stepOk(handoff) || handoff.handoffReady !== true) addCode(blockers, 'library-sync-proof-binding-handoff-failed');

      var receipt = await getSync().buildLibraryBindingApplyEventReceipt({
        operation: 'bind',
        handoffPreview: handoff,
        observedAtIso: fixtures.observedAtIso
      });
      parts.receipt = summarizeResult(receipt);
      if (!stepOk(receipt)) addCode(blockers, 'library-sync-proof-binding-receipt-failed');

      var bookkeeping = await withMemoryChromeStorage(function () {
        return getSync().recordLibraryBindingBookkeeping({
          receipt: receipt,
          observedAtIso: fixtures.observedAtIso,
          recordedAtIso: fixtures.observedAtIso
        });
      });
      parts.bookkeeping = summarizeResult(bookkeeping);
      if (!stepOk(bookkeeping) || !isObject(bookkeeping.row)) addCode(blockers, 'library-sync-proof-binding-bookkeeping-failed');

      var execute = await getSync().shapeLibraryBindingExecuteEnvelope({
        bookkeepingResult: bookkeeping,
        receipt: receipt,
        observedAtIso: fixtures.observedAtIso
      });
      parts.executeEnvelope = summarizeResult(execute);
      if (!stepOk(execute) || !isObject(execute.envelope)) addCode(blockers, 'library-sync-proof-binding-execute-envelope-failed');

      artifacts = [canonical, diagnostics, preflight, proposal, handoff, receipt, bookkeeping, execute];
      mergeCodes(warnings, parts.bookkeeping.warnings);
      mergeCodes(warnings, parts.executeEnvelope.warnings);
      var privacy = await privacyScan(artifacts, [
        fixtures.raw.catalogRawNameValue,
        fixtures.raw.catalogRawColorValue,
        fixtures.raw.catalogRawIdValue,
        fixtures.raw.chatRawIdValue,
        fixtures.raw.categoryRawIdValue,
        fixtures.raw.bundlePathNeedle,
        fixtures.raw.bundleFileNeedle,
        fixtures.raw.titleValue,
        fixtures.raw.contentValue,
        fixtures.raw.tokenValue
      ]);
      if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
      mergeCodes(warnings, privacy.warnings);

      var artifactDigest = await digestOf({
        subjectId: proposal.subjectId,
        lineageId: proposal.lineageId,
        dedupeKey: proposal.dedupeKey,
        executeEnvelopeDigest: execute.envelope && execute.envelope.eventDigest
      });
      return summarizePipeline('library.binding', parts, {
        operation: 'bind',
        bindingKind: 'chat-label',
        subjectId: proposal.subjectId || binding.subjectId,
        lineageId: proposal.lineageId,
        dedupeKey: proposal.dedupeKey,
        operationId: proposal.operationId,
        executeEnvelopeDigest: execute.envelope && execute.envelope.eventDigest,
        artifactDigest: artifactDigest,
        privacy: privacy,
        inMemoryBookkeepingWritten: bookkeeping && bookkeeping.sideEffectSummary &&
          bookkeeping.sideEffectSummary.bookkeepingLedgerWritten === true,
        blockers: blockers,
        warnings: codeList(warnings)
      });
    } catch (e) {
      addCode(blockers, 'library-sync-proof-binding-threw');
      return summarizePipeline('library.binding', parts, {
        operation: 'bind',
        bindingKind: 'chat-label',
        blockers: blockers,
        warnings: warnings.concat(cleanString(e && e.message) ? ['library-sync-proof-binding-error'] : [])
      });
    }
  }

  async function runLibraryStoreCutoverProof() {
    var fn = getSync().proveSQLiteWriterIdentitySentinel;
    if (typeof fn !== 'function') {
      return {
        ok: false,
        delegated: false,
        blockers: ['library-sync-proof-store-cutover-unavailable'],
        warnings: [],
        sideEffectSummary: sideEffectSummary()
      };
    }
    try {
      var proof = await fn();
      return {
        ok: proof && proof.ok === true,
        delegated: true,
        unauthorizedBeforeBlocked: proof && proof.unauthorizedBeforeBlocked === true,
        authorizedWritePassed: proof && proof.authorizedWritePassed === true,
        unauthorizedAfterClearBlocked: proof && proof.unauthorizedAfterClearBlocked === true,
        unregisteredConnectionFailedClosed: proof && proof.unregisteredConnectionFailedClosed === true,
        blockers: codeList(proof && proof.blockers),
        warnings: codeList(proof && proof.warnings),
        sideEffectSummary: sideEffectSummary()
      };
    } catch (_) {
      return {
        ok: false,
        delegated: true,
        blockers: ['library-sync-proof-store-cutover-threw'],
        warnings: [],
        sideEffectSummary: sideEffectSummary()
      };
    }
  }

  async function runLibraryBulkMigrationE2EProof() {
    var fn = getSync().runLibraryBulkMigrationProof;
    if (typeof fn !== 'function') {
      return {
        ok: false,
        delegated: false,
        blockers: ['library-sync-proof-bulk-migration-unavailable'],
        warnings: [],
        sideEffectSummary: sideEffectSummary()
      };
    }
    try {
      var proof = await fn();
      return {
        ok: proof && proof.ok === true,
        delegated: true,
        chunkedMode: proof && proof.chunkedMode === true,
        partialFailureBlocked: proof && proof.partialFailureBlocked === true,
        sentinelBulkModeBlocked: proof && proof.sentinelBulkModeBlocked === true,
        rawLeakCheck: proof && proof.rawLeakCheck === false,
        blockers: codeList(proof && proof.blockers),
        warnings: codeList(proof && proof.warnings),
        sideEffectSummary: sideEffectSummary()
      };
    } catch (_) {
      return {
        ok: false,
        delegated: true,
        blockers: ['library-sync-proof-bulk-migration-threw'],
        warnings: [],
        sideEffectSummary: sideEffectSummary()
      };
    }
  }

  async function runLibraryEndToEndSyncProof(input) {
    var observedAtIso = cleanString(input && input.observedAtIso) || nowIsoSeconds();
    var blockers = [];
    var warnings = [];
    var presence = await apiPresence();
    mergeCodes(blockers, presence.blockers);
    mergeCodes(warnings, presence.warnings);

    var catalogSmoke = presence.ok ? await runLibraryCatalogPipelineProof(input || {}) : null;
    var bindingSmoke = presence.ok ? await runLibraryBindingPipelineProof(input || {}) : null;
    var storeCutover = await runLibraryStoreCutoverProof();
    var bulkMigration = await runLibraryBulkMigrationE2EProof();

    if (catalogSmoke && catalogSmoke.ok !== true) mergeCodes(blockers, catalogSmoke.blockers);
    if (bindingSmoke && bindingSmoke.ok !== true) mergeCodes(blockers, bindingSmoke.blockers);
    if (storeCutover.ok !== true) mergeCodes(blockers, storeCutover.blockers);
    if (bulkMigration.ok !== true) mergeCodes(blockers, bulkMigration.blockers);

    var privacyTargets = [catalogSmoke, bindingSmoke, storeCutover, bulkMigration].filter(Boolean);
    var privacy = await privacyScan(privacyTargets, []);
    if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
    mergeCodes(warnings, privacy.warnings);

    var ok = blockers.length === 0 &&
      presence.ok === true &&
      catalogSmoke && catalogSmoke.ok === true &&
      bindingSmoke && bindingSmoke.ok === true &&
      storeCutover.ok === true &&
      bulkMigration.ok === true &&
      privacy.ok === true;

    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      catalogSmoke: catalogSmoke,
      bindingSmoke: bindingSmoke,
      storeCutover: storeCutover,
      bulkMigration: bulkMigration,
      privacy: privacy,
      apiPresence: presence,
      blockers: codeList(blockers),
      warnings: codeList(warnings),
      sideEffectSummary: sideEffectSummary(),
      observedAtIso: observedAtIso
    };
  }

  H2O.Desktop.Sync.runLibraryEndToEndSyncProof = runLibraryEndToEndSyncProof;
  H2O.Desktop.Sync.runLibraryCatalogPipelineProof = runLibraryCatalogPipelineProof;
  H2O.Desktop.Sync.runLibraryBindingPipelineProof = runLibraryBindingPipelineProof;
  H2O.Desktop.Sync.runLibraryStoreCutoverProof = runLibraryStoreCutoverProof;
  H2O.Desktop.Sync.runLibraryBulkMigrationE2EProof = runLibraryBulkMigrationE2EProof;
  H2O.Desktop.Sync.__librarySyncProofInstalled = true;
  H2O.Desktop.Sync.__librarySyncProofVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
