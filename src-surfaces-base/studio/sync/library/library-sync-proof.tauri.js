/* H2O Desktop Sync - F15.9.c library sync proof foundation
 *
 * Runtime proof for the F15 library sync lane. This module exercises the
 * existing catalog primitives across the full F15 catalog operation set,
 * exercises the full F15 binding operation set, scans the redacted artifacts
 * for raw-data leaks, and returns summary evidence only.
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

  var VERSION = '0.3.0-f15.9.c';
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
    'closeLibraryCatalogTombstoneViaF5',
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
    '__libraryCatalogF5ClosureInstalled',
    '__f15CutoverInstalled',
    '__libraryBulkMigrationInstalled'
  ];

  var CATALOG_CASE_DEFINITIONS = [
    {
      caseId: 'catalog-create-full-pipeline',
      operation: 'create',
      currentLifecycleState: 'absent',
      targetLifecycleState: 'active',
      targetNameKey: 'catalogCreateNameValue',
      targetColorKey: 'catalogCreateColorValue'
    },
    {
      caseId: 'catalog-rename-full-pipeline',
      operation: 'rename',
      currentLifecycleState: 'active',
      targetLifecycleState: 'active',
      baseNameKey: 'catalogRenameBaseNameValue',
      targetNameKey: 'catalogRenameTargetNameValue',
      targetColorKey: 'catalogStableColorValue'
    },
    {
      caseId: 'catalog-recolor-full-pipeline',
      operation: 'recolor',
      currentLifecycleState: 'active',
      targetLifecycleState: 'active',
      targetNameKey: 'catalogStableNameValue',
      baseColorKey: 'catalogRecolorBaseColorValue',
      targetColorKey: 'catalogRecolorTargetColorValue'
    },
    {
      caseId: 'catalog-archive-full-pipeline',
      operation: 'archive',
      currentLifecycleState: 'active',
      targetLifecycleState: 'archived',
      targetNameKey: 'catalogArchiveNameValue',
      targetColorKey: 'catalogStableColorValue'
    },
    {
      caseId: 'catalog-restore-from-archived-full-pipeline',
      operation: 'restore-from-archived',
      currentLifecycleState: 'archived',
      targetLifecycleState: 'active',
      targetNameKey: 'catalogRestoreArchivedNameValue',
      targetColorKey: 'catalogStableColorValue'
    },
    {
      caseId: 'catalog-tombstone-approve-seal-full-pipeline',
      operation: 'tombstone',
      currentLifecycleState: 'active',
      targetLifecycleState: 'retained',
      targetNameKey: 'catalogTombstoneSealNameValue',
      targetColorKey: 'catalogStableColorValue',
      f5DecisionState: 'approved-seal',
      expectedClosureState: 'closed-sealed',
      expectedNativeApplyRequired: true,
      proveDuplicateF5Ingest: true
    },
    {
      caseId: 'catalog-tombstone-approve-restore-full-pipeline',
      operation: 'tombstone',
      currentLifecycleState: 'archived',
      targetLifecycleState: 'retained',
      targetNameKey: 'catalogTombstoneRestoreNameValue',
      targetColorKey: 'catalogStableColorValue',
      f5DecisionState: 'approved-restore',
      expectedClosureState: 'closed-restored',
      expectedNativeApplyRequired: false
    },
    {
      caseId: 'catalog-restore-from-retained-full-pipeline',
      operation: 'restore-from-retained',
      currentLifecycleState: 'retained',
      targetLifecycleState: 'active',
      targetNameKey: 'catalogRestoreRetainedNameValue',
      targetColorKey: 'catalogStableColorValue'
    },
    {
      caseId: 'catalog-tombstone-pending-f5-blocks-execute',
      operation: 'tombstone',
      currentLifecycleState: 'active',
      targetLifecycleState: 'retained',
      targetNameKey: 'catalogPendingTombstoneNameValue',
      targetColorKey: 'catalogStableColorValue',
      f5DecisionState: 'pending-review',
      expectExecuteBlocker: 'library-catalog-execute-tombstone-f5-state-not-post-decision'
    }
  ];

  var BINDING_CASE_DEFINITIONS = [
    {
      caseId: 'binding-bind-chat-label-full-pipeline',
      operation: 'bind',
      bindingKind: 'chat-label',
      expectedCacheRefresh: false,
      expectedCacheAction: null
    },
    {
      caseId: 'binding-unbind-chat-label-full-pipeline',
      operation: 'unbind',
      bindingKind: 'chat-label',
      expectedCacheRefresh: false,
      expectedCacheAction: null
    },
    {
      caseId: 'binding-bind-chat-tag-full-pipeline',
      operation: 'bind',
      bindingKind: 'chat-tag',
      expectedCacheRefresh: false,
      expectedCacheAction: null
    },
    {
      caseId: 'binding-unbind-chat-tag-full-pipeline',
      operation: 'unbind',
      bindingKind: 'chat-tag',
      expectedCacheRefresh: false,
      expectedCacheAction: null
    },
    {
      caseId: 'binding-bind-chat-category-full-pipeline',
      operation: 'bind',
      bindingKind: 'chat-category',
      expectedCacheRefresh: true,
      expectedCacheAction: 'set',
      expectRefreshWarning: true
    },
    {
      caseId: 'binding-unbind-chat-category-full-pipeline',
      operation: 'unbind',
      bindingKind: 'chat-category',
      expectedCacheRefresh: true,
      expectedCacheAction: 'clear',
      expectRefreshWarning: true
    },
    {
      caseId: 'binding-bind-tag-category-full-pipeline',
      operation: 'bind',
      bindingKind: 'tag-category',
      expectedCacheRefresh: false,
      expectedCacheAction: null
    },
    {
      caseId: 'binding-unbind-tag-category-full-pipeline',
      operation: 'unbind',
      bindingKind: 'tag-category',
      expectedCacheRefresh: false,
      expectedCacheAction: null
    }
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
    var extra = safeObject(extras);
    Object.keys(parts).forEach(function (key) {
      mergeCodes(blockers, parts[key] && parts[key].blockers);
      mergeCodes(warnings, parts[key] && parts[key].warnings);
    });
    mergeCodes(blockers, extra.blockers);
    mergeCodes(warnings, extra.warnings);
    var stepStatus = {};
    Object.keys(parts).forEach(function (key) {
      var part = safeObject(parts[key]);
      stepStatus[key] = part.ok === true;
    });
    var ok = Object.keys(stepStatus).every(function (key) { return stepStatus[key] === true; }) &&
      blockers.length === 0;
    return Object.assign({}, extra, {
      ok: ok,
      lane: label,
      steps: stepStatus,
      blockers: codeList(blockers),
      warnings: codeList(warnings),
      sideEffectSummary: sideEffectSummary()
    });
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
      catalogCreateNameValue: 'F15 Proof Create Catalog',
      catalogRenameBaseNameValue: 'F15 Proof Rename Before',
      catalogRenameTargetNameValue: 'F15 Proof Rename After',
      catalogStableNameValue: 'F15 Proof Stable Catalog',
      catalogArchiveNameValue: 'F15 Proof Archive Catalog',
      catalogRestoreArchivedNameValue: 'F15 Proof Restore Archived Catalog',
      catalogTombstoneSealNameValue: 'F15 Proof Tombstone Seal Catalog',
      catalogTombstoneRestoreNameValue: 'F15 Proof Tombstone Restore Catalog',
      catalogRestoreRetainedNameValue: 'F15 Proof Restore Retained Catalog',
      catalogPendingTombstoneNameValue: 'F15 Proof Pending Tombstone Catalog',
      catalogRawColorValue: '#15A9AA',
      catalogCreateColorValue: '#159A00',
      catalogStableColorValue: '#1666AA',
      catalogRecolorBaseColorValue: '#2200AA',
      catalogRecolorTargetColorValue: '#22AA00',
      catalogRawIdValue: 'f15-proof-catalog-raw-id',
      catalogCategoryRawIdValue: 'f15-proof-category-raw-id',
      catalogTagRawIdValue: 'f15-proof-tag-raw-id',
      bindingLabelRawIdValue: 'f15-proof-binding-label-id',
      bindingTagRawIdValue: 'f15-proof-binding-tag-id',
      bindingCategoryRawIdValue: 'f15-proof-binding-category-id',
      bindingFolderRawIdValue: 'f15-proof-binding-folder-id',
      bindingEndpointRawIdValue: 'f15-proof-binding-endpoint-id',
      bindingReplaceOperationNeedle: 'replaceForChat',
      bindingReplaceCategoryNeedle: 'replace-category',
      chatRawIdValue: 'f15-proof-chat-raw-id',
      categoryRawIdValue: 'f15-proof-category-id',
      rawAccountIdNeedle: 'f15-proof-raw-account-id',
      bundlePathNeedle: '/tmp/f15-proof-library.bundle',
      bundleFileNeedle: 'f15-proof-library.bundle',
      titleValue: 'F15 Proof Raw Title',
      contentValue: 'F15 Proof Raw Content',
      bodyValue: 'F15 Proof Raw Body',
      messageValue: 'F15 Proof Raw Message',
      urlValue: 'https://example.invalid/f15-proof',
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

  function catalogRawIdFor(fixtures, catalogKind) {
    var kind = cleanString(catalogKind) || 'label';
    if (kind === 'category') return fixtures.raw.catalogCategoryRawIdValue;
    if (kind === 'tag') return fixtures.raw.catalogTagRawIdValue;
    return fixtures.raw.catalogRawIdValue;
  }
  function catalogDeviceLocalInput(fixtures, options) {
    var opts = safeObject(options);
    var catalogKind = cleanString(opts.catalogKind) || 'label';
    var row = {
      catalogKind: catalogKind,
      lifecycleState: cleanString(opts.lifecycleState) || 'active',
      perEnvelopeSalt: cleanString(opts.perEnvelopeSalt) || 'f15.9.b.catalog.salt',
      originAccountIdHash: fixtures.originAccountIdHash,
      sourceTag: 'desktop',
      observedAtIso: fixtures.observedAtIso
    };
    if (catalogKind === 'category') row.categoryId = cleanString(opts.rawId) || catalogRawIdFor(fixtures, catalogKind);
    else if (catalogKind === 'tag') row.tagId = cleanString(opts.rawId) || catalogRawIdFor(fixtures, catalogKind);
    else row.labelId = cleanString(opts.rawId) || catalogRawIdFor(fixtures, catalogKind);
    row.name = cleanString(opts.catalogNameValue) || fixtures.raw.catalogRawNameValue;
    if (opts.catalogColorValue !== null) row.color = cleanString(opts.catalogColorValue) || fixtures.raw.catalogRawColorValue;
    return row;
  }
  function catalogContext(fixtures, canonical, operation, options) {
    var opts = safeObject(options);
    return {
      operation: operation,
      canonicalCatalog: canonical,
      currentLifecycleState: operation === 'create'
        ? 'absent'
        : (cleanString(opts.currentLifecycleState) || canonical.lifecycleState),
      baseHash: cleanLower(opts.baseHash) || undefined,
      expectedCurrentRevisionHash: cleanLower(opts.baseHash) || undefined,
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
  function bindingDeviceLocalInput(fixtures, options) {
    var opts = safeObject(options);
    var bindingKind = cleanString(opts.bindingKind) || 'chat-label';
    var bindingState = cleanString(opts.bindingState) || 'bound';
    var leftSubjectId = cleanLower(opts.leftSubjectId);
    var rightSubjectId = cleanLower(opts.rightSubjectId);
    var leftSubjectType = cleanString(opts.leftSubjectType);
    var rightSubjectType = cleanString(opts.rightSubjectType);
    if (!leftSubjectType || !rightSubjectType) {
      if (bindingKind === 'tag-category') {
        leftSubjectType = CATALOG_SUBJECT_TYPE;
        rightSubjectType = CATALOG_SUBJECT_TYPE;
      } else {
        leftSubjectType = CHAT_SUBJECT_TYPE;
        rightSubjectType = CATALOG_SUBJECT_TYPE;
      }
    }
    return {
      bindingKind: bindingKind,
      bindingState: bindingState,
      perEnvelopeSalt: cleanString(opts.perEnvelopeSalt) || 'f15.9.c.binding.salt',
      leftSubjectType: leftSubjectType,
      rightSubjectType: rightSubjectType,
      leftSubjectId: leftSubjectId,
      rightSubjectId: rightSubjectId,
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
  function bindingContext(fixtures, binding, relatedCatalogs, operation) {
    var catalogs = asArray(relatedCatalogs).filter(Boolean);
    var relatedChats = binding && binding.leftSubjectType === CHAT_SUBJECT_TYPE
      ? [chatContext(fixtures)]
      : [];
    return {
      operation: operation,
      diagnosticIntent: operation,
      canonicalBinding: binding,
      localAccountIdHash: fixtures.originAccountIdHash,
      actorPeer: fixtures.actorPeer,
      relatedCatalogs: catalogs,
      relatedChats: relatedChats,
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

  function catalogKindForBindingSide(bindingKind, side) {
    if (bindingKind === 'chat-label') return 'label';
    if (bindingKind === 'chat-tag') return 'tag';
    if (bindingKind === 'chat-category') return 'category';
    if (bindingKind === 'tag-category') return side === 'left' ? 'tag' : 'category';
    return 'label';
  }
  function rawIdForBindingCatalog(fixtures, catalogKind) {
    if (catalogKind === 'category') return fixtures.raw.bindingCategoryRawIdValue;
    if (catalogKind === 'tag') return fixtures.raw.bindingTagRawIdValue;
    return fixtures.raw.bindingLabelRawIdValue;
  }
  async function canonicalCatalogForBinding(fixtures, catalogKind, caseId, slot) {
    var nameKey = 'binding.' + cleanString(caseId) + '.' + cleanString(slot) + '.' + cleanString(catalogKind);
    var result = await getSync().canonicalizeLibraryCatalog(catalogDeviceLocalInput(fixtures, {
      catalogKind: catalogKind,
      lifecycleState: 'active',
      rawId: rawIdForBindingCatalog(fixtures, catalogKind) + '.' + cleanString(caseId) + '.' + cleanString(slot),
      perEnvelopeSalt: 'f15.9.c.binding.catalog.salt.' + cleanString(caseId) + '.' + cleanString(slot),
      catalogNameValue: 'F15 Proof Binding Catalog ' + nameKey,
      catalogColorValue: fixtures.raw.catalogStableColorValue
    }));
    return result;
  }
  async function buildBindingEndpoints(fixtures, def) {
    var bindingKind = cleanString(def.bindingKind);
    var leftCatalog = null;
    var rightCatalog = null;
    var relatedCatalogs = [];
    var leftSubjectId = fixtures.chatSubjectId;
    var rightSubjectId = '';
    var leftSubjectType = CHAT_SUBJECT_TYPE;
    var rightSubjectType = CATALOG_SUBJECT_TYPE;

    if (bindingKind === 'tag-category') {
      leftCatalog = await canonicalCatalogForBinding(fixtures, catalogKindForBindingSide(bindingKind, 'left'), def.caseId, 'left');
      rightCatalog = await canonicalCatalogForBinding(fixtures, catalogKindForBindingSide(bindingKind, 'right'), def.caseId, 'right');
      relatedCatalogs = [safeObject(leftCatalog.canonical), safeObject(rightCatalog.canonical)];
      leftSubjectId = safeObject(leftCatalog.canonical).subjectId;
      rightSubjectId = safeObject(rightCatalog.canonical).subjectId;
      leftSubjectType = CATALOG_SUBJECT_TYPE;
      rightSubjectType = CATALOG_SUBJECT_TYPE;
    } else {
      rightCatalog = await canonicalCatalogForBinding(fixtures, catalogKindForBindingSide(bindingKind, 'right'), def.caseId, 'right');
      relatedCatalogs = [safeObject(rightCatalog.canonical)];
      rightSubjectId = safeObject(rightCatalog.canonical).subjectId;
    }

    return {
      catalogResults: [leftCatalog, rightCatalog].filter(Boolean),
      relatedCatalogs: relatedCatalogs,
      bindingInput: bindingDeviceLocalInput(fixtures, {
        bindingKind: bindingKind,
        bindingState: 'bound',
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        leftSubjectType: leftSubjectType,
        rightSubjectType: rightSubjectType,
        perEnvelopeSalt: 'f15.9.c.binding.salt.' + cleanString(def.caseId)
      })
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

  function rawValue(fixtures, key, fallback) {
    var value = cleanString(fixtures.raw && fixtures.raw[key]);
    return value || cleanString(fallback);
  }
  function catalogInputForCase(fixtures, def, flavor) {
    var isBase = flavor === 'base';
    var rawName = rawValue(
      fixtures,
      isBase ? (def.baseNameKey || def.targetNameKey) : def.targetNameKey,
      fixtures.raw.catalogRawNameValue
    );
    var rawColor = rawValue(
      fixtures,
      isBase ? (def.baseColorKey || def.targetColorKey) : def.targetColorKey,
      fixtures.raw.catalogRawColorValue
    );
    var currentState = cleanString(def.currentLifecycleState);
    var lifecycle = currentState === 'absent'
      ? (cleanString(def.targetLifecycleState) || 'active')
      : currentState;
    return catalogDeviceLocalInput(fixtures, {
      catalogKind: def.catalogKind || 'label',
      lifecycleState: lifecycle,
      perEnvelopeSalt: 'f15.9.b.catalog.salt.' + cleanString(def.caseId),
      catalogNameValue: rawName,
      catalogColorValue: rawColor
    });
  }
  function catalogPrivacyNeedles(fixtures) {
    var raw = safeObject(fixtures.raw);
    return Object.keys(raw).map(function (key) { return raw[key]; });
  }
  async function buildCatalogCaseReviewId(def) {
    return await sha256Hex('f15.9.b.library.catalog.f5.review:' + cleanString(def.caseId));
  }
  function f5ReviewForCase(reviewId, state, fixtures) {
    return {
      reviewId: cleanLower(reviewId),
      currentState: cleanString(state),
      reviewStatusVersion: 1,
      row: {
        reviewId: cleanLower(reviewId),
        currentState: cleanString(state),
        reviewStatusVersion: 1,
        actorPeer: fixtures.actorPeer
      }
    };
  }
  function closeF5ReviewForCase(targetState) {
    return async function () {
      return {
        ok: true,
        status: 'closed',
        currentState: cleanString(targetState),
        reviewStatusVersion: 2,
        metadata: { closureKind: cleanString(targetState) },
        blockers: [],
        warnings: []
      };
    };
  }
  async function withMockF5ReviewQueue(reviewId, fn) {
    var sync = getSync();
    var hadMarker = Object.prototype.hasOwnProperty.call(sync, '__snapshotF5ReviewQueueInstalled');
    var oldMarker = sync.__snapshotF5ReviewQueueInstalled;
    var hadIngest = Object.prototype.hasOwnProperty.call(sync, 'ingestF5Review');
    var oldIngest = sync.ingestF5Review;
    var ingestCount = 0;
    sync.__snapshotF5ReviewQueueInstalled = true;
    sync.ingestF5Review = async function () {
      ingestCount += 1;
      return {
        ok: true,
        reviewId: cleanLower(reviewId),
        blockers: [],
        warnings: ingestCount > 1 ? ['f5-review-duplicate-idempotent'] : []
      };
    };
    try {
      return await fn({
        duplicateIngested: function () { return ingestCount > 1; }
      });
    } finally {
      if (hadMarker) sync.__snapshotF5ReviewQueueInstalled = oldMarker;
      else {
        try { delete sync.__snapshotF5ReviewQueueInstalled; } catch (_) { sync.__snapshotF5ReviewQueueInstalled = undefined; }
      }
      if (hadIngest) sync.ingestF5Review = oldIngest;
      else {
        try { delete sync.ingestF5Review; } catch (_) { sync.ingestF5Review = undefined; }
      }
    }
  }
  function stepsFromParts(parts) {
    var out = {};
    Object.keys(parts).forEach(function (key) {
      out[key] = safeObject(parts[key]).ok === true;
    });
    return out;
  }
  function allRequiredStepsPassed(parts, names) {
    for (var i = 0; i < names.length; i++) {
      if (safeObject(parts[names[i]]).ok !== true) return false;
    }
    return true;
  }
  async function runCatalogProofCase(def, input) {
    var fixtures = await buildCommonFixtures(input || {});
    var blockers = [];
    var warnings = [];
    var parts = {};
    var artifacts = [];
    var duplicateF5Ingest = null;
    var f5ReviewId = '';
    var closure = null;

    try {
      var canonical = await getSync().canonicalizeLibraryCatalog(catalogInputForCase(fixtures, def, 'target'));
      parts.canonicalize = summarizeResult(canonical);
      if (!stepOk(canonical)) addCode(blockers, 'library-sync-proof-catalog-canonicalize-failed');
      var catalog = safeObject(canonical.canonical);

      var baseHash = ZERO_HASH;
      if (def.operation !== 'create') {
        var baseCanonical = await getSync().canonicalizeLibraryCatalog(catalogInputForCase(fixtures, def, 'base'));
        if (!stepOk(baseCanonical) || !isSha256Hex(safeObject(baseCanonical.canonical).revisionHash)) {
          addCode(blockers, 'library-sync-proof-catalog-base-canonicalize-failed');
        } else {
          baseHash = safeObject(baseCanonical.canonical).revisionHash;
        }
        artifacts.push(baseCanonical);
      }

      var context = catalogContext(fixtures, catalog, def.operation, {
        currentLifecycleState: def.currentLifecycleState,
        baseHash: baseHash
      });
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
        operation: def.operation,
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

      var receipt;
      if (def.operation === 'tombstone') {
        f5ReviewId = await buildCatalogCaseReviewId(def);
        receipt = await withMockF5ReviewQueue(f5ReviewId, async function (mockState) {
          var built = await getSync().buildLibraryCatalogApplyEventReceipt({
            operation: def.operation,
            handoffPreview: handoff,
            observedAtIso: fixtures.observedAtIso
          });
          if (def.proveDuplicateF5Ingest === true) {
            duplicateF5Ingest = await getSync().ingestF5Review({
              f5Handoff: safeObject(safeObject(handoff.handoffRequest).f5Handoff),
              originAccountIdHash: fixtures.originAccountIdHash,
              actorPeer: fixtures.actorPeer,
              observedAtIso: fixtures.observedAtIso
            });
            if (!mockState.duplicateIngested() || !duplicateF5Ingest ||
                duplicateF5Ingest.ok !== true ||
                codeList(duplicateF5Ingest.warnings).indexOf('f5-review-duplicate-idempotent') === -1) {
              addCode(blockers, 'library-sync-proof-catalog-duplicate-f5-ingest-failed');
            }
          }
          return built;
        });
      } else {
        receipt = await getSync().buildLibraryCatalogApplyEventReceipt({
          operation: def.operation,
          handoffPreview: handoff,
          observedAtIso: fixtures.observedAtIso
        });
      }
      parts.receipt = summarizeResult(receipt);
      if (!stepOk(receipt)) addCode(blockers, 'library-sync-proof-catalog-receipt-failed');
      if (def.operation === 'tombstone' &&
          (receipt.f5ReviewIngested !== true || receipt.f5ReviewId !== f5ReviewId)) {
        addCode(blockers, 'library-sync-proof-catalog-f5-ingest-failed');
      }

      var bookkeeping = await withMemoryChromeStorage(function () {
        return getSync().recordLibraryCatalogBookkeeping({
          receipt: receipt,
          observedAtIso: fixtures.observedAtIso,
          recordedAtIso: fixtures.observedAtIso
        });
      });
      parts.bookkeeping = summarizeResult(bookkeeping);
      if (!stepOk(bookkeeping) || !isObject(bookkeeping.row)) addCode(blockers, 'library-sync-proof-catalog-bookkeeping-failed');

      var f5Review = def.operation === 'tombstone'
        ? f5ReviewForCase(f5ReviewId || receipt.f5ReviewId, def.f5DecisionState, fixtures)
        : null;
      var execute = await getSync().shapeLibraryCatalogExecuteEnvelope({
        bookkeepingResult: bookkeeping,
        receipt: receipt,
        f5Review: f5Review,
        observedAtIso: fixtures.observedAtIso
      });
      parts.executeEnvelope = summarizeResult(execute);
      var executeBlockedAsExpected = !!def.expectExecuteBlocker &&
        execute && execute.ok === false &&
        codeList(execute.blockers).indexOf(def.expectExecuteBlocker) !== -1;
      if (def.expectExecuteBlocker) {
        if (!executeBlockedAsExpected) addCode(blockers, 'library-sync-proof-catalog-pending-f5-block-missing');
      } else if (!stepOk(execute) || !isObject(execute.envelope)) {
        addCode(blockers, 'library-sync-proof-catalog-execute-envelope-failed');
      }

      var closureSummary = null;
      if (!def.expectExecuteBlocker && def.operation === 'tombstone') {
        closure = await getSync().closeLibraryCatalogTombstoneViaF5({
          envelope: execute.envelope,
          f5Review: f5Review,
          actorPeer: fixtures.actorPeer,
          closeF5Review: closeF5ReviewForCase(def.expectedClosureState),
          observedAtIso: fixtures.observedAtIso
        });
        parts.f5Closure = summarizeResult(closure);
        var nativeApplyRequired = closure && closure.nativeApplyRequired === true;
        if (!stepOk(closure) ||
            closure.f5TargetState !== def.expectedClosureState ||
            nativeApplyRequired !== (def.expectedNativeApplyRequired === true)) {
          addCode(blockers, 'library-sync-proof-catalog-f5-closure-failed');
        }
        closureSummary = {
          ok: closure && closure.ok === true,
          closed: closure && closure.closed === true,
          decisionState: cleanString(def.f5DecisionState),
          targetState: closure && closure.f5TargetState,
          nativeApplyRequired: nativeApplyRequired
        };
      }

      artifacts = artifacts.concat([
        canonical, diagnostics, preflight, proposal, handoff, receipt,
        bookkeeping, execute, closure, duplicateF5Ingest
      ].filter(Boolean));
      Object.keys(parts).forEach(function (key) {
        mergeCodes(warnings, parts[key].warnings);
      });
      var privacy = await privacyScan(artifacts, catalogPrivacyNeedles(fixtures));
      if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
      mergeCodes(warnings, privacy.warnings);

      var requiredSteps = ['canonicalize', 'diagnose', 'preflight', 'proposal', 'handoff', 'receipt', 'bookkeeping'];
      var caseOk = blockers.length === 0 &&
        allRequiredStepsPassed(parts, requiredSteps) &&
        (def.expectExecuteBlocker ? executeBlockedAsExpected : parts.executeEnvelope.ok === true) &&
        (!parts.f5Closure || parts.f5Closure.ok === true) &&
        privacy.ok === true;
      var artifactDigest = await digestOf({
        caseId: def.caseId,
        operation: def.operation,
        subjectId: proposal.subjectId,
        lineageId: proposal.lineageId,
        dedupeKey: proposal.dedupeKey,
        executeEnvelopeDigest: execute.envelope && execute.envelope.eventDigest,
        closureEvidenceDigest: closure && closure.closureEvidenceDigest
      });

      return {
        caseId: def.caseId,
        required: true,
        ok: caseOk,
        operation: def.operation,
        currentLifecycleState: def.currentLifecycleState,
        targetLifecycleState: def.targetLifecycleState,
        steps: stepsFromParts(parts),
        executeBlockedAsExpected: executeBlockedAsExpected,
        pendingF5BlockerObserved: executeBlockedAsExpected,
        subjectId: proposal.subjectId || catalog.subjectId,
        lineageId: proposal.lineageId,
        dedupeKey: proposal.dedupeKey,
        operationId: proposal.operationId,
        baseHash: proposal.baseHash || baseHash,
        targetHash: proposal.targetHash,
        executeEnvelopeDigest: execute.envelope && execute.envelope.eventDigest,
        artifactDigest: artifactDigest,
        f5: def.operation === 'tombstone' ? {
          reviewIdPresent: isSha256Hex(f5ReviewId || receipt.f5ReviewId),
          reviewIngested: receipt.f5ReviewIngested === true,
          decisionState: cleanString(def.f5DecisionState),
          duplicateIngestIdempotent: duplicateF5Ingest ? duplicateF5Ingest.ok === true : null,
          closure: closureSummary
        } : null,
        privacy: privacy,
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary()
      };
    } catch (e) {
      addCode(blockers, 'library-sync-proof-catalog-case-threw');
      return {
        caseId: cleanString(def.caseId),
        required: true,
        ok: false,
        operation: cleanString(def.operation),
        steps: stepsFromParts(parts),
        executeBlockedAsExpected: false,
        pendingF5BlockerObserved: false,
        f5: null,
        privacy: { ok: false, checkedTargets: 0, leakCount: 0, blockers: ['library-sync-proof-catalog-case-threw'], warnings: [] },
        blockers: codeList(blockers),
        warnings: codeList(warnings.concat(cleanString(e && e.message) ? ['library-sync-proof-catalog-case-error'] : [])),
        sideEffectSummary: sideEffectSummary()
      };
    }
  }

  async function runLibraryCatalogPipelineProof(input) {
    var cases = [];
    var blockers = [];
    var warnings = [];
    for (var i = 0; i < CATALOG_CASE_DEFINITIONS.length; i++) {
      var proofCase = await runCatalogProofCase(CATALOG_CASE_DEFINITIONS[i], input || {});
      cases.push(proofCase);
      if (proofCase.ok !== true) mergeCodes(blockers, proofCase.blockers);
      mergeCodes(warnings, proofCase.warnings);
    }
    var privacy = await privacyScan(cases, catalogPrivacyNeedles(await buildCommonFixtures(input || {})));
    var privacyCase = {
      caseId: 'catalog-privacy-leak-scan',
      required: true,
      ok: privacy.ok === true,
      operation: 'privacy-scan',
      steps: { privacyScan: privacy.ok === true },
      privacy: privacy,
      blockers: codeList(privacy.blockers),
      warnings: codeList(privacy.warnings),
      sideEffectSummary: sideEffectSummary()
    };
    cases.push(privacyCase);
    if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
    mergeCodes(warnings, privacy.warnings);
    var passCount = cases.filter(function (item) { return item.ok === true; }).length;
    var failCount = cases.length - passCount;
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: failCount === 0 && blockers.length === 0 && privacy.ok === true,
      caseCount: cases.length,
      passCount: passCount,
      failCount: failCount,
      cases: cases,
      warnings: codeList(warnings),
      blockers: codeList(blockers),
      privacy: privacy,
      sideEffectSummary: sideEffectSummary(),
      observedAtIso: cleanString(input && input.observedAtIso) || nowIsoSeconds()
    };
  }

  function bindingPrivacyNeedles(fixtures) {
    var raw = safeObject(fixtures.raw);
    return [
      raw.bindingLabelRawIdValue,
      raw.bindingTagRawIdValue,
      raw.bindingCategoryRawIdValue,
      raw.bindingFolderRawIdValue,
      raw.bindingEndpointRawIdValue,
      raw.chatRawIdValue,
      raw.categoryRawIdValue,
      raw.catalogRawNameValue,
      raw.catalogRawColorValue,
      raw.catalogRawIdValue,
      raw.rawAccountIdNeedle,
      raw.bundlePathNeedle,
      raw.bundleFileNeedle,
      raw.titleValue,
      raw.contentValue,
      raw.bodyValue,
      raw.messageValue,
      raw.urlValue,
      raw.tokenValue
    ];
  }
  function bindingF5Footprint(value) {
    var hits = [];
    function visit(node, path) {
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i++) visit(node[i], path + '[' + i + ']');
        return;
      }
      if (!isObject(node)) return;
      Object.keys(node).forEach(function (key) {
        var nextPath = path ? path + '.' + key : key;
        var lower = key.toLowerCase();
        var val = node[key];
        if ((lower === 'f5reviewid' ||
             lower === 'f5reviewingested' ||
             lower === 'f5handoff' ||
             lower === 'tombstonef5touched') &&
            val !== null && typeof val !== 'undefined' && val !== false && val !== '') {
          hits.push(nextPath);
        }
        if (lower === 'f5touched' && val === true) hits.push(nextPath);
        visit(val, nextPath);
      });
    }
    visit(value, '');
    return hits;
  }
  function bindingCacheSummary(execute) {
    var settlement = safeObject(safeObject(execute && execute.envelope).settlementShapes);
    return {
      requiresCategoryCacheRefresh: settlement.requiresCategoryCacheRefresh === true,
      categoryCacheAction: settlement.categoryCacheAction || null
    };
  }
  function bindingDuplicateSibling(binding) {
    var duplicate = Object.assign({}, safeObject(binding));
    duplicate.subjectId = ZERO_HASH.replace(/0$/, '1');
    duplicate.revisionHash = safeObject(binding).revisionHash;
    duplicate.bindingState = 'bound';
    duplicate.subjectType = BINDING_SUBJECT_TYPE;
    return duplicate;
  }
  async function runBindingProofCase(def, input) {
    var blockers = [];
    var warnings = [];
    var fixtures = await buildCommonFixtures(input || {});
    var artifacts = [];
    var parts = {};

    try {
      var endpointSet = await buildBindingEndpoints(fixtures, def);
      artifacts = artifacts.concat(endpointSet.catalogResults);
      var bindingInput = endpointSet.bindingInput;

      var canonical = await getSync().canonicalizeLibraryBinding(bindingInput);
      parts.canonicalize = summarizeResult(canonical);
      if (!stepOk(canonical)) addCode(blockers, 'library-sync-proof-binding-canonicalize-failed');
      var binding = safeObject(canonical.canonical);

      var context = bindingContext(fixtures, binding, endpointSet.relatedCatalogs, def.operation);
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
        operation: def.operation,
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
        operation: def.operation,
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

      var cache = bindingCacheSummary(execute);
      var cacheMetadataOk = cache.requiresCategoryCacheRefresh === (def.expectedCacheRefresh === true) &&
        (cache.categoryCacheAction || null) === (def.expectedCacheAction || null);
      if (!cacheMetadataOk) addCode(blockers, 'library-sync-proof-binding-cache-metadata-failed');

      var receiptWarnings = codeList(receipt.warnings);
      var rowWarnings = codeList(bookkeeping && bookkeeping.row && bookkeeping.row.warnings);
      var refreshWarningOk = def.expectRefreshWarning === true
        ? receiptWarnings.indexOf('chats-category-id-refresh-pending') !== -1 &&
          rowWarnings.indexOf('chats-category-id-refresh-pending') !== -1 &&
          bookkeeping.row && bookkeeping.row.chatsCategoryIdRefreshPending === true
        : receiptWarnings.indexOf('chats-category-id-refresh-pending') === -1 &&
          (!bookkeeping.row || bookkeeping.row.chatsCategoryIdRefreshPending !== true);
      if (!refreshWarningOk) addCode(blockers, 'library-sync-proof-binding-refresh-warning-failed');

      artifacts = artifacts.concat([canonical, diagnostics, preflight, proposal, handoff, receipt, bookkeeping, execute]);
      Object.keys(parts).forEach(function (key) {
        mergeCodes(warnings, parts[key].warnings);
      });
      var f5Hits = bindingF5Footprint(artifacts);
      if (f5Hits.length) addCode(blockers, 'library-sync-proof-binding-f5-footprint-detected');
      var privacy = await privacyScan(artifacts, bindingPrivacyNeedles(fixtures));
      if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
      mergeCodes(warnings, privacy.warnings);

      var artifactDigest = await digestOf({
        caseId: def.caseId,
        subjectId: proposal.subjectId,
        lineageId: proposal.lineageId,
        dedupeKey: proposal.dedupeKey,
        executeEnvelopeDigest: execute.envelope && execute.envelope.eventDigest
      });
      var requiredSteps = ['canonicalize', 'diagnose', 'preflight', 'proposal', 'handoff', 'receipt', 'bookkeeping', 'executeEnvelope'];
      var caseOk = blockers.length === 0 &&
        allRequiredStepsPassed(parts, requiredSteps) &&
        cacheMetadataOk === true &&
        refreshWarningOk === true &&
        f5Hits.length === 0 &&
        privacy.ok === true;
      return {
        caseId: def.caseId,
        required: true,
        ok: caseOk,
        lane: 'library.binding',
        operation: def.operation,
        bindingKind: def.bindingKind,
        steps: stepsFromParts(parts),
        subjectId: proposal.subjectId || binding.subjectId,
        lineageId: proposal.lineageId,
        dedupeKey: proposal.dedupeKey,
        operationId: proposal.operationId,
        executeEnvelopeDigest: execute.envelope && execute.envelope.eventDigest,
        artifactDigest: artifactDigest,
        cacheRefresh: cache,
        cacheMetadataOk: cacheMetadataOk,
        refreshWarningOk: refreshWarningOk,
        noF5Footprint: f5Hits.length === 0,
        f5FootprintCount: f5Hits.length,
        privacy: privacy,
        inMemoryBookkeepingWritten: bookkeeping && bookkeeping.sideEffectSummary &&
          bookkeeping.sideEffectSummary.bookkeepingLedgerWritten === true,
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary()
      };
    } catch (e) {
      addCode(blockers, 'library-sync-proof-binding-threw');
      return {
        caseId: cleanString(def.caseId),
        required: true,
        ok: false,
        lane: 'library.binding',
        operation: cleanString(def.operation),
        bindingKind: cleanString(def.bindingKind),
        steps: stepsFromParts(parts),
        cacheRefresh: { requiresCategoryCacheRefresh: false, categoryCacheAction: null },
        cacheMetadataOk: false,
        refreshWarningOk: false,
        noF5Footprint: true,
        f5FootprintCount: 0,
        privacy: { ok: false, checkedTargets: 0, leakCount: 0, blockers: ['library-sync-proof-binding-threw'], warnings: [] },
        blockers: codeList(blockers),
        warnings: codeList(warnings.concat(cleanString(e && e.message) ? ['library-sync-proof-binding-error'] : [])),
        sideEffectSummary: sideEffectSummary()
      };
    }
  }

  async function runBindingDuplicateBlockCase(input) {
    var fixtures = await buildCommonFixtures(input || {});
    var blockers = [];
    var warnings = [];
    var parts = {};
    try {
      var def = {
        caseId: 'binding-duplicate-binding-blocks-proposal',
        operation: 'bind',
        bindingKind: 'chat-label'
      };
      var endpointSet = await buildBindingEndpoints(fixtures, def);
      var canonical = await getSync().canonicalizeLibraryBinding(endpointSet.bindingInput);
      parts.canonicalize = summarizeResult(canonical);
      var binding = safeObject(canonical.canonical);
      var duplicate = bindingDuplicateSibling(binding);
      var context = bindingContext(fixtures, binding, endpointSet.relatedCatalogs, 'bind');
      context.siblingBindings = [duplicate];
      var diagnostics = await getSync().diagnoseLibraryBinding(context);
      parts.diagnose = summarizeResult(diagnostics);
      var preflight = await getSync().preflightLibraryBinding(Object.assign({}, context, { diagnosticsResult: diagnostics }));
      parts.preflight = summarizeResult(preflight);
      var proposal = await getSync().generateLibraryBindingProposalCandidate(Object.assign({}, context, {
        diagnosticsResult: diagnostics
      }));
      parts.proposal = summarizeResult(proposal);
      var preflightBlocked = preflight && preflight.ok === false &&
        codeList(preflight.blockers).indexOf('chat-label-already-bound') !== -1;
      var proposalBlocked = proposal && proposal.ok === false &&
        (codeList(proposal.blockers).indexOf('chat-label-already-bound') !== -1 ||
         codeList(proposal.blockers).indexOf('library-binding-preflight-not-ok') !== -1);
      if (!preflightBlocked) addCode(blockers, 'library-sync-proof-binding-duplicate-preflight-not-blocked');
      if (!proposalBlocked) addCode(blockers, 'library-sync-proof-binding-duplicate-proposal-not-blocked');
      var privacy = await privacyScan([canonical, diagnostics, preflight, proposal], bindingPrivacyNeedles(fixtures));
      if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
      mergeCodes(warnings, privacy.warnings);
      return {
        caseId: 'binding-duplicate-binding-blocks-proposal',
        required: true,
        ok: blockers.length === 0 && preflightBlocked === true && proposalBlocked === true && privacy.ok === true,
        lane: 'library.binding',
        operation: 'bind',
        bindingKind: 'chat-label',
        steps: stepsFromParts(parts),
        preflightBlocked: preflightBlocked,
        proposalBlocked: proposalBlocked,
        expectedBlocker: 'chat-label-already-bound',
        privacy: privacy,
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary()
      };
    } catch (_) {
      addCode(blockers, 'library-sync-proof-binding-duplicate-case-threw');
      return {
        caseId: 'binding-duplicate-binding-blocks-proposal',
        required: true,
        ok: false,
        lane: 'library.binding',
        operation: 'bind',
        bindingKind: 'chat-label',
        steps: stepsFromParts(parts),
        preflightBlocked: false,
        proposalBlocked: false,
        privacy: { ok: false, checkedTargets: 0, leakCount: 0, blockers: ['library-sync-proof-binding-duplicate-case-threw'], warnings: [] },
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary()
      };
    }
  }

  async function runBindingReplaceOperationCase(input) {
    var fixtures = await buildCommonFixtures(input || {});
    var blockers = [];
    var warnings = [];
    try {
      var proposal = await getSync().generateLibraryBindingProposalCandidate({
        operation: 'replaceForChat',
        observedAtIso: fixtures.observedAtIso
      });
      var replaceBlocked = proposal && proposal.ok === false &&
        codeList(proposal.blockers).indexOf('library-binding-replace-operation-not-supported') !== -1;
      if (!replaceBlocked) addCode(blockers, 'library-sync-proof-binding-replace-operation-not-blocked');
      var privacy = await privacyScan([proposal], bindingPrivacyNeedles(fixtures));
      if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
      mergeCodes(warnings, privacy.warnings);
      return {
        caseId: 'binding-replace-operation-not-supported',
        required: true,
        ok: blockers.length === 0 && replaceBlocked === true && privacy.ok === true,
        lane: 'library.binding',
        operation: 'replace-operation',
        proposalBlocked: replaceBlocked,
        expectedBlocker: 'library-binding-replace-operation-not-supported',
        singleProposalGenerated: proposal && proposal.generated === true,
        privacy: privacy,
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary()
      };
    } catch (_) {
      addCode(blockers, 'library-sync-proof-binding-replace-case-threw');
      return {
        caseId: 'binding-replace-operation-not-supported',
        required: true,
        ok: false,
        lane: 'library.binding',
        operation: 'replace-operation',
        proposalBlocked: false,
        singleProposalGenerated: false,
        privacy: { ok: false, checkedTargets: 0, leakCount: 0, blockers: ['library-sync-proof-binding-replace-case-threw'], warnings: [] },
        blockers: codeList(blockers),
        warnings: codeList(warnings),
        sideEffectSummary: sideEffectSummary()
      };
    }
  }

  async function runLibraryBindingPipelineProof(input) {
    var cases = [];
    var blockers = [];
    var warnings = [];
    for (var i = 0; i < BINDING_CASE_DEFINITIONS.length; i++) {
      var proofCase = await runBindingProofCase(BINDING_CASE_DEFINITIONS[i], input || {});
      cases.push(proofCase);
      if (proofCase.ok !== true) mergeCodes(blockers, proofCase.blockers);
      mergeCodes(warnings, proofCase.warnings);
    }

    var cacheCases = cases.filter(function (item) {
      return item.bindingKind === 'chat-category';
    });
    var cacheMetadataOk = cacheCases.length === 2 && cacheCases.every(function (item) {
      if (item.operation === 'bind') {
        return item.cacheRefresh &&
          item.cacheRefresh.requiresCategoryCacheRefresh === true &&
          item.cacheRefresh.categoryCacheAction === 'set' &&
          item.refreshWarningOk === true;
      }
      if (item.operation === 'unbind') {
        return item.cacheRefresh &&
          item.cacheRefresh.requiresCategoryCacheRefresh === true &&
          item.cacheRefresh.categoryCacheAction === 'clear' &&
          item.refreshWarningOk === true;
      }
      return false;
    });
    var nonCacheMetadataOk = cases.filter(function (item) {
      return item.bindingKind !== 'chat-category';
    }).every(function (item) {
      return item.cacheRefresh &&
        item.cacheRefresh.requiresCategoryCacheRefresh === false &&
        item.cacheRefresh.categoryCacheAction === null;
    });
    var cacheCase = {
      caseId: 'binding-chat-category-cache-refresh-metadata',
      required: true,
      ok: cacheMetadataOk === true && nonCacheMetadataOk === true,
      lane: 'library.binding',
      operation: 'cache-metadata-proof',
      chatCategorySet: cacheCases.some(function (item) {
        return item.operation === 'bind' &&
          item.cacheRefresh &&
          item.cacheRefresh.categoryCacheAction === 'set';
      }),
      chatCategoryClear: cacheCases.some(function (item) {
        return item.operation === 'unbind' &&
          item.cacheRefresh &&
          item.cacheRefresh.categoryCacheAction === 'clear';
      }),
      nonChatCategoryNoRefresh: nonCacheMetadataOk === true,
      blockers: cacheMetadataOk && nonCacheMetadataOk ? [] : ['library-sync-proof-binding-cache-metadata-failed'],
      warnings: [],
      sideEffectSummary: sideEffectSummary()
    };
    cases.push(cacheCase);

    var noF5Ok = cases.every(function (item) {
      return item.noF5Footprint !== false && (item.f5FootprintCount || 0) === 0;
    });
    var noF5Case = {
      caseId: 'binding-no-f5-footprint',
      required: true,
      ok: noF5Ok === true,
      lane: 'library.binding',
      operation: 'lane-invariant-proof',
      noF5Footprint: noF5Ok === true,
      blockers: noF5Ok ? [] : ['library-sync-proof-binding-f5-footprint-detected'],
      warnings: [],
      sideEffectSummary: sideEffectSummary()
    };
    cases.push(noF5Case);

    var duplicateCase = await runBindingDuplicateBlockCase(input || {});
    cases.push(duplicateCase);

    var replaceCase = await runBindingReplaceOperationCase(input || {});
    cases.push(replaceCase);

    var fixtures = await buildCommonFixtures(input || {});
    var privacy = await privacyScan(cases, bindingPrivacyNeedles(fixtures));
    var privacyCase = {
      caseId: 'binding-privacy-leak-scan',
      required: true,
      ok: privacy.ok === true,
      lane: 'library.binding',
      operation: 'privacy-scan',
      steps: { privacyScan: privacy.ok === true },
      privacy: privacy,
      blockers: codeList(privacy.blockers),
      warnings: codeList(privacy.warnings),
      sideEffectSummary: sideEffectSummary()
    };
    cases.push(privacyCase);

    cases.forEach(function (proofCase) {
      if (proofCase.ok !== true) mergeCodes(blockers, proofCase.blockers);
      mergeCodes(warnings, proofCase.warnings);
    });
    var passCount = cases.filter(function (item) { return item.ok === true; }).length;
    var failCount = cases.length - passCount;
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: failCount === 0 && blockers.length === 0 && privacy.ok === true,
      caseCount: cases.length,
      passCount: passCount,
      failCount: failCount,
      cases: cases,
      warnings: codeList(warnings),
      blockers: codeList(blockers),
      privacy: privacy,
      sideEffectSummary: sideEffectSummary(),
      observedAtIso: cleanString(input && input.observedAtIso) || nowIsoSeconds()
    };
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

    var catalogProof = presence.ok ? await runLibraryCatalogPipelineProof(input || {}) : null;
    var bindingProof = presence.ok ? await runLibraryBindingPipelineProof(input || {}) : null;
    var storeCutover = await runLibraryStoreCutoverProof();
    var bulkMigration = await runLibraryBulkMigrationE2EProof();

    if (catalogProof && catalogProof.ok !== true) mergeCodes(blockers, catalogProof.blockers);
    if (bindingProof && bindingProof.ok !== true) mergeCodes(blockers, bindingProof.blockers);
    if (storeCutover.ok !== true) mergeCodes(blockers, storeCutover.blockers);
    if (bulkMigration.ok !== true) mergeCodes(blockers, bulkMigration.blockers);

    var privacyTargets = [catalogProof, bindingProof, storeCutover, bulkMigration].filter(Boolean);
    var privacy = await privacyScan(privacyTargets, []);
    if (!privacy.ok) mergeCodes(blockers, privacy.blockers);
    mergeCodes(warnings, privacy.warnings);

    var ok = blockers.length === 0 &&
      presence.ok === true &&
      catalogProof && catalogProof.ok === true &&
      bindingProof && bindingProof.ok === true &&
      storeCutover.ok === true &&
      bulkMigration.ok === true &&
      privacy.ok === true;

    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      catalogProof: catalogProof,
      catalogSmoke: catalogProof,
      bindingProof: bindingProof,
      bindingSmoke: bindingProof,
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
