/* H2O Desktop Sync - F15.1.b read-only library binding canonicalizer
 *
 * Desktop/Tauri-only pure canonicalizer:
 *   library binding input -> redacted library.binding envelope.
 *
 * Public API:
 *   H2O.Desktop.Sync.canonicalizeLibraryBinding(input) -> Promise<result>
 *   H2O.Desktop.Sync.__libraryBindingCanonicalizerInstalled
 *   H2O.Desktop.Sync.__libraryBindingCanonicalizerVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - Read-only: no storage reads/writes, no mutations, no fetch, no timers,
 *     no publication, no relay/outbox, no apply, no Native/F5 execution,
 *     no watermark writes, and no consumed-operation writes.
 *   - Uses F14 kernel identity primitives for canonical JSON + sha256.
 *   - Uses the F15.1.0 library.binding privacy policy. Raw endpoint ids and
 *     legacy category assignment fields fail closed in this phase.
 *   - Raw ids, names, titles, and content are never emitted in canonical
 *     output. Endpoint subject ids must be supplied as sha256 values.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__libraryBindingCanonicalizerInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.library-binding-canonicalizer-result.v1';
  var CANONICAL_SCHEMA = 'h2o.library.binding.v1';
  var VERSION = '0.1.0-f15.1.b';
  var OBJECT_TYPE = 'libraryBinding';
  var SUBJECT_TYPE = 'library.binding';
  var CHAT_SUBJECT_TYPE = 'chat.metadata';
  var CATALOG_SUBJECT_TYPE = 'library.catalog';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var ALLOWED_BINDING_KINDS = ['chat-label', 'chat-tag', 'chat-category', 'tag-category', 'chat-folder'];
  var DEFERRED_BINDING_KINDS = ['chat-folder'];
  var ALLOWED_BINDING_STATES = ['bound', 'unbound'];
  var ALLOWED_SOURCE_TAGS = ['desktop', 'mv3-import', 'bundle-import', 'auto-suggested'];
  var RAW_ENDPOINT_FIELD_NAMES = [
    'rawPayload',
    'bindingPayload',
    'name',
    'rawName',
    'rawLeftId',
    'rawRightId',
    'chatId',
    'chat_id',
    'labelId',
    'label_id',
    'tagId',
    'tag_id',
    'categoryId',
    'category_id',
    'folderId',
    'folder_id',
    'accountId',
    'rawAccountId',
    'userId',
    'title',
    'chatTitle',
    'rawTitle',
    'content',
    'body',
    'text',
    'messages',
    'turns',
    'notes',
    'rawNotes'
  ];

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }

  function getKernel() {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    return sync.kernel || null;
  }

  function isSha256Hex(value, kernel) {
    if (kernel && typeof kernel.isSha256Hex === 'function') return kernel.isSha256Hex(value);
    return typeof value === 'string' && SHA256_RE.test(value);
  }

  function valueAtPath(input, path) {
    var cursor = input;
    for (var i = 0; i < path.length; i++) {
      if (!isObject(cursor)) return undefined;
      cursor = cursor[path[i]];
    }
    return cursor;
  }

  function firstString(input, paths) {
    for (var i = 0; i < paths.length; i++) {
      var value = valueAtPath(input, paths[i]);
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function hasOwn(input, key) {
    return isObject(input) && Object.prototype.hasOwnProperty.call(input, key);
  }

  function hitNamesFromDomainScan(scan) {
    var out = [];
    var hits = Array.isArray(scan && scan.forbiddenFields)
      ? scan.forbiddenFields
      : (Array.isArray(scan && scan.hits) ? scan.hits : []);
    for (var i = 0; i < hits.length; i++) {
      var hit = hits[i];
      var name = isObject(hit) ? cleanString(hit.fieldName || hit.fieldPath) : cleanString(hit);
      if (name && out.indexOf(name) === -1) out.push(name);
    }
    return out;
  }

  function scanBindingPrivacy(target, redactionClass) {
    var kernel = getKernel();
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') return [];
    var scanTarget = isObject(target)
      ? Object.assign({}, target, { redactionClass: redactionClass || 'redacted' })
      : target;
    return hitNamesFromDomainScan(kernel.scanDomainForbiddenFields(SUBJECT_TYPE, scanTarget));
  }

  function findRawEndpointFields(value, parentPath, hits) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        findRawEndpointFields(value[i], parentPath ? parentPath + '[' + i + ']' : '[' + i + ']', hits);
      }
      return;
    }
    if (!isObject(value)) return;
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var path = parentPath ? parentPath + '.' + key : key;
      if (RAW_ENDPOINT_FIELD_NAMES.indexOf(key) !== -1 || path === 'chats.category_id') {
        if (hits.indexOf(path) === -1) hits.push(path);
      }
      findRawEndpointFields(value[key], path, hits);
    }
  }

  function buildSideEffectSummary() {
    return {
      storageWritten: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
  }

  function buildResult(opts) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      redacted: true,
      quarantined: !!opts.quarantined,
      quarantineReason: opts.quarantineReason || null,
      canonical: opts.canonical || null,
      canonicalBinding: opts.canonical || null,
      blockers: Array.isArray(opts.blockers) ? opts.blockers : [],
      warnings: Array.isArray(opts.warnings) ? opts.warnings : [],
      sideEffectSummary: buildSideEffectSummary(),
      observedAtIso: opts.observedAtIso || nowIsoSeconds()
    };
  }

  function quarantine(reason, observedAtIso, extraBlockers, warnings) {
    var blockers = [];
    addCode(blockers, reason);
    if (Array.isArray(extraBlockers)) {
      for (var i = 0; i < extraBlockers.length; i++) {
        var blocker = extraBlockers[i];
        if (isObject(blocker) && typeof blocker.code === 'string') addCode(blockers, blocker.code);
        else if (typeof blocker === 'string') addCode(blockers, blocker);
      }
    }
    return buildResult({
      ok: false,
      quarantined: true,
      quarantineReason: reason,
      canonical: null,
      blockers: blockers,
      warnings: warnings || [],
      observedAtIso: observedAtIso
    });
  }

  function normalizeIsoOrNull(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function coarsenIsoToHour(value) {
    var iso = normalizeIsoOrNull(value);
    if (!iso) return null;
    return iso.replace(/T(\d{2}):\d{2}:\d{2}Z$/, 'T$1:00:00Z');
  }

  function observedAt(input, warnings) {
    var explicit = coarsenIsoToHour(firstString(input, [['observedAtIso'], ['observedAt'], ['observed_at']]));
    if (explicit) return explicit;
    addCode(warnings, 'observed-at-missing-used-now');
    return coarsenIsoToHour(nowIsoSeconds()) || nowIsoSeconds();
  }

  function normalizeBindingKind(input) {
    var raw = firstString(input, [['bindingKind'], ['binding_kind'], ['kind'], ['type']]).toLowerCase();
    if (raw === 'chat_label') raw = 'chat-label';
    if (raw === 'chat_tag') raw = 'chat-tag';
    if (raw === 'chat_category') raw = 'chat-category';
    if (raw === 'tag_category') raw = 'tag-category';
    if (raw === 'chat_folder') raw = 'chat-folder';
    if (!raw) {
      if ((hasOwn(input, 'chatSubjectId') || hasOwn(input, 'leftSubjectId')) && hasOwn(input, 'labelSubjectId')) {
        raw = 'chat-label';
      } else if ((hasOwn(input, 'chatSubjectId') || hasOwn(input, 'leftSubjectId')) && hasOwn(input, 'tagSubjectId')) {
        raw = 'chat-tag';
      } else if ((hasOwn(input, 'chatSubjectId') || hasOwn(input, 'leftSubjectId')) && hasOwn(input, 'categorySubjectId')) {
        raw = 'chat-category';
      } else if (hasOwn(input, 'tagSubjectId') && hasOwn(input, 'categorySubjectId')) {
        raw = 'tag-category';
      }
    }
    return ALLOWED_BINDING_KINDS.indexOf(raw) === -1 ? '' : raw;
  }

  function expectedTypes(bindingKind) {
    if (bindingKind === 'chat-label' || bindingKind === 'chat-tag' || bindingKind === 'chat-category') {
      return { left: CHAT_SUBJECT_TYPE, right: CATALOG_SUBJECT_TYPE };
    }
    if (bindingKind === 'tag-category') {
      return { left: CATALOG_SUBJECT_TYPE, right: CATALOG_SUBJECT_TYPE };
    }
    return { left: '', right: '' };
  }

  function endpointSubjectIds(input, bindingKind) {
    if (bindingKind === 'chat-label') {
      return {
        left: firstString(input, [['leftSubjectId'], ['chatSubjectId']]),
        right: firstString(input, [['rightSubjectId'], ['labelSubjectId']])
      };
    }
    if (bindingKind === 'chat-tag') {
      return {
        left: firstString(input, [['leftSubjectId'], ['chatSubjectId']]),
        right: firstString(input, [['rightSubjectId'], ['tagSubjectId']])
      };
    }
    if (bindingKind === 'chat-category') {
      return {
        left: firstString(input, [['leftSubjectId'], ['chatSubjectId']]),
        right: firstString(input, [['rightSubjectId'], ['categorySubjectId']])
      };
    }
    if (bindingKind === 'tag-category') {
      return {
        left: firstString(input, [['leftSubjectId'], ['tagSubjectId']]),
        right: firstString(input, [['rightSubjectId'], ['categorySubjectId']])
      };
    }
    return { left: '', right: '' };
  }

  function explicitEndpointTypes(input) {
    return {
      left: firstString(input, [['leftSubjectType'], ['left_subject_type']]),
      right: firstString(input, [['rightSubjectType'], ['right_subject_type']])
    };
  }

  function normalizeBindingState(input) {
    var raw = firstString(input, [['bindingState'], ['binding_state'], ['state'], ['status']]).toLowerCase();
    if (raw === 'active' || raw === 'linked' || raw === 'attached') raw = 'bound';
    if (raw === 'inactive' || raw === 'removed' || raw === 'detached') raw = 'unbound';
    return raw;
  }

  function normalizeSourceTag(input, warnings) {
    var raw = firstString(input, [['sourceTag'], ['source_tag'], ['source'], ['origin'], ['meta', 'sourceTag']]);
    var normalized = raw.toLowerCase();
    if (!normalized) return 'desktop';
    if (normalized === 'manual' || normalized === 'local' || normalized === 'sqlite') normalized = 'desktop';
    if (ALLOWED_SOURCE_TAGS.indexOf(normalized) === -1) {
      addCode(warnings, 'source-tag-normalized');
      return 'desktop';
    }
    if (raw && raw !== normalized) addCode(warnings, 'source-tag-normalized');
    return normalized;
  }

  function accountHash(input) {
    return firstString(input, [
      ['originAccountIdHash'], ['accountIdHash'], ['account_id_hash'],
      ['meta', 'originAccountIdHash'], ['meta', 'accountIdHash']
    ]);
  }

  function bindingTimestamps(input, bindingState, observedAtIso) {
    var boundAtIso = coarsenIsoToHour(firstString(input, [
      ['boundAtIso'], ['boundAt'], ['bound_at'],
      ['assignedAtIso'], ['assignedAt'], ['assigned_at'],
      ['createdAtIso'], ['createdAt'], ['created_at']
    ]));
    var unboundAtIso = coarsenIsoToHour(firstString(input, [
      ['unboundAtIso'], ['unboundAt'], ['unbound_at'],
      ['clearedAtIso'], ['clearedAt'], ['cleared_at'],
      ['updatedAtIso'], ['updatedAt'], ['updated_at']
    ]));
    if (bindingState === 'bound') {
      if (!boundAtIso) boundAtIso = observedAtIso;
      unboundAtIso = null;
    } else {
      if (!unboundAtIso) unboundAtIso = observedAtIso;
      if (!boundAtIso) boundAtIso = null;
    }
    return {
      boundAtIso: boundAtIso,
      unboundAtIso: unboundAtIso
    };
  }

  async function sha256Field(kernel, value, failureCode, observedAtIso, warnings) {
    var digest = '';
    try {
      digest = await kernel.sha256Hex(value);
    } catch (_) {
      return { ok: false, digest: '', result: quarantine(failureCode, observedAtIso, [], warnings) };
    }
    if (!isSha256Hex(digest, kernel)) {
      return { ok: false, digest: '', result: quarantine(failureCode, observedAtIso, [], warnings) };
    }
    return { ok: true, digest: digest, result: null };
  }

  async function canonicalizeLibraryBinding(input) {
    var warnings = [];
    var observedAtIso = isObject(input) ? observedAt(input, warnings) : coarsenIsoToHour(nowIsoSeconds());

    if (!isObject(input)) {
      return quarantine('input-not-object', observedAtIso, [], warnings);
    }

    var inputForbidden = scanBindingPrivacy(input, 'device-local');
    var rawEndpointHits = [];
    findRawEndpointFields(input, '', rawEndpointHits);
    if (inputForbidden.length > 0 || rawEndpointHits.length > 0) {
      var inHits = [];
      for (var ih = 0; ih < Math.min(inputForbidden.length, 8); ih++) {
        addCode(inHits, 'forbidden-field-in-input:' + String(inputForbidden[ih]));
      }
      for (var rh = 0; rh < Math.min(rawEndpointHits.length, 8); rh++) {
        addCode(inHits, 'forbidden-field-in-input:' + String(rawEndpointHits[rh]));
      }
      return quarantine('forbidden-field-detected', observedAtIso, inHits, warnings);
    }

    var bindingKind = normalizeBindingKind(input);
    if (!bindingKind) {
      return quarantine('invalid-binding-kind', observedAtIso, [], warnings);
    }
    if (DEFERRED_BINDING_KINDS.indexOf(bindingKind) !== -1) {
      return quarantine('binding-kind-deferred', observedAtIso, [], warnings);
    }

    var bindingState = normalizeBindingState(input);
    if (!bindingState) {
      return quarantine('missing-binding-state', observedAtIso, [], warnings);
    }
    if (ALLOWED_BINDING_STATES.indexOf(bindingState) === -1) {
      return quarantine('invalid-binding-state', observedAtIso, [], warnings);
    }

    var perEnvelopeSalt = firstString(input, [['perEnvelopeSalt'], ['per_envelope_salt']]);
    if (!perEnvelopeSalt) {
      return quarantine('missing-per-envelope-salt', observedAtIso, [], warnings);
    }

    var kernel = getKernel();
    if (!kernel
        || typeof kernel.sha256Hex !== 'function'
        || typeof kernel.canonicalJSON !== 'function') {
      return quarantine('kernel-identity-kit-unavailable', observedAtIso, [], warnings);
    }

    var originAccountIdHash = accountHash(input);
    if (!isSha256Hex(originAccountIdHash, kernel)) {
      return quarantine('missing-origin-account', observedAtIso, [], warnings);
    }

    var expected = expectedTypes(bindingKind);
    var explicitTypes = explicitEndpointTypes(input);
    if (explicitTypes.left && explicitTypes.left !== expected.left) {
      return quarantine('invalid-left-subject-type', observedAtIso, [], warnings);
    }
    if (explicitTypes.right && explicitTypes.right !== expected.right) {
      return quarantine('invalid-right-subject-type', observedAtIso, [], warnings);
    }

    var endpoints = endpointSubjectIds(input, bindingKind);
    var leftSubjectId = endpoints.left;
    var rightSubjectId = endpoints.right;
    if (!isSha256Hex(leftSubjectId, kernel)) {
      return quarantine('missing-left-subject', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(rightSubjectId, kernel)) {
      return quarantine('missing-right-subject', observedAtIso, [], warnings);
    }

    var leftSubjectType = expected.left;
    var rightSubjectType = expected.right;
    if (bindingKind === 'tag-category' && rightSubjectId < leftSubjectId) {
      var tmp = leftSubjectId;
      leftSubjectId = rightSubjectId;
      rightSubjectId = tmp;
      addCode(warnings, 'tag-category-endpoints-normalized');
    }

    var sourceTag = normalizeSourceTag(input, warnings);
    var sourceTagHashResult = await sha256Field(kernel, sourceTag, 'revision-hash-failed', observedAtIso, warnings);
    if (!sourceTagHashResult.ok) return sourceTagHashResult.result;

    var subjectId = '';
    try {
      subjectId = await kernel.sha256Hex(kernel.canonicalJSON({
        subjectType: SUBJECT_TYPE,
        bindingKind: bindingKind,
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        perEnvelopeSalt: perEnvelopeSalt
      }));
    } catch (_) {
      return quarantine('subject-id-generation-failed', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(subjectId, kernel)) {
      return quarantine('subject-id-generation-failed', observedAtIso, [], warnings);
    }

    var revisionInput = {
      bindingState: bindingState,
      bindingKind: bindingKind,
      leftSubjectId: leftSubjectId,
      rightSubjectId: rightSubjectId,
      leftSubjectType: leftSubjectType,
      rightSubjectType: rightSubjectType,
      originAccountIdHash: originAccountIdHash,
      schemaVersion: CANONICAL_SCHEMA,
      sourceTagHash: sourceTagHashResult.digest
    };
    var revisionHashResult = await sha256Field(kernel, kernel.canonicalJSON(revisionInput), 'revision-hash-failed', observedAtIso, warnings);
    if (!revisionHashResult.ok) return revisionHashResult.result;

    var timestamps = bindingTimestamps(input, bindingState, observedAtIso);
    var canonical = {
      objectType: OBJECT_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      revisionHash: revisionHashResult.digest,
      bindingKind: bindingKind,
      leftSubjectId: leftSubjectId,
      rightSubjectId: rightSubjectId,
      leftSubjectType: leftSubjectType,
      rightSubjectType: rightSubjectType,
      originAccountIdHash: originAccountIdHash,
      schemaVersion: CANONICAL_SCHEMA,
      bindingState: bindingState,
      boundAtIso: timestamps.boundAtIso,
      unboundAtIso: timestamps.unboundAtIso,
      sourceTag: sourceTag,
      sourceTagHash: sourceTagHashResult.digest,
      observedAtIso: observedAtIso,
      redactionClass: 'redacted'
    };

    var outputForbidden = scanBindingPrivacy(canonical, 'redacted');
    if (outputForbidden.length > 0) {
      var outHits = [];
      for (var oh = 0; oh < Math.min(outputForbidden.length, 8); oh++) {
        addCode(outHits, 'forbidden-field-in-canonical:' + String(outputForbidden[oh]));
      }
      return quarantine('forbidden-field-in-canonical', observedAtIso, outHits, warnings);
    }

    return buildResult({
      ok: true,
      quarantined: false,
      quarantineReason: null,
      canonical: canonical,
      blockers: [],
      warnings: warnings,
      observedAtIso: observedAtIso
    });
  }

  H2O.Desktop.Sync.canonicalizeLibraryBinding = canonicalizeLibraryBinding;
  H2O.Desktop.Sync.__libraryBindingCanonicalizerInstalled = true;
  H2O.Desktop.Sync.__libraryBindingCanonicalizerVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
