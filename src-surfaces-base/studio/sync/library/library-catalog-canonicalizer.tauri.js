/* H2O Desktop Sync - F15.1.a read-only library catalog canonicalizer
 *
 * Desktop/Tauri-only pure canonicalizer:
 *   legacy label/tag/category row -> redacted library.catalog envelope.
 *
 * Public API:
 *   H2O.Desktop.Sync.canonicalizeLibraryCatalog(input) -> Promise<result>
 *   H2O.Desktop.Sync.__libraryCatalogCanonicalizerInstalled
 *   H2O.Desktop.Sync.__libraryCatalogCanonicalizerVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - Read-only: no storage reads/writes, no mutations, no fetch, no timers,
 *     no publication, no relay/outbox, no apply, no Native/F5 execution,
 *     no watermark writes, and no consumed-operation writes.
 *   - Uses F14 kernel identity primitives for canonical JSON + sha256.
 *   - Uses the F15.1.0 library.catalog privacy policy. Legacy raw input fields
 *     are accepted only in device-local scan mode; canonical output is scanned
 *     as redacted and must contain hash-safe fields only.
 *   - Raw catalog ids, raw names, raw colors, and raw account ids are never
 *     emitted in canonical output.
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
  if (H2O.Desktop.Sync.__libraryCatalogCanonicalizerInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.library-catalog-canonicalizer-result.v1';
  var CANONICAL_SCHEMA = 'h2o.library.catalog.v1';
  var VERSION = '0.1.0-f15.1.a';
  var OBJECT_TYPE = 'libraryCatalog';
  var SUBJECT_TYPE = 'library.catalog';

  var ALLOWED_CATALOG_KINDS = ['label', 'tag', 'category'];
  var ALLOWED_LIFECYCLE_STATES = ['active', 'archived', 'retained', 'expired', 'tombstoned'];
  var ALLOWED_SOURCE_TAGS = ['desktop', 'mv3-import', 'bundle-import'];
  var SAFE_ICON_RE = /^[a-z0-9._:-]{1,48}$/i;
  var SHA256_RE = /^[0-9a-f]{64}$/;

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

  function firstNumber(input, paths) {
    for (var i = 0; i < paths.length; i++) {
      var value = valueAtPath(input, paths[i]);
      if (typeof value === 'number' && isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() && isFinite(Number(value))) return Number(value);
    }
    return null;
  }

  function firstBoolean(input, paths) {
    for (var i = 0; i < paths.length; i++) {
      var value = valueAtPath(input, paths[i]);
      if (typeof value === 'boolean') return value;
    }
    return null;
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

  function scanCatalogPrivacy(target, redactionClass) {
    var kernel = getKernel();
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') return [];
    var scanTarget = isObject(target)
      ? Object.assign({}, target, { redactionClass: redactionClass || 'redacted' })
      : target;
    return hitNamesFromDomainScan(kernel.scanDomainForbiddenFields(SUBJECT_TYPE, scanTarget));
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
      canonicalCatalog: opts.canonical || null,
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

  function normalizeCatalogKind(input) {
    var raw = firstString(input, [['catalogKind'], ['catalog_kind'], ['kind'], ['type']]).toLowerCase();
    if (raw === 'labels') raw = 'label';
    if (raw === 'tags') raw = 'tag';
    if (raw === 'categories') raw = 'category';
    if (!raw) {
      if (hasOwn(input, 'labelId') || hasOwn(input, 'label_id')) raw = 'label';
      else if (hasOwn(input, 'tagId') || hasOwn(input, 'tag_id')) raw = 'tag';
      else if (hasOwn(input, 'categoryId') || hasOwn(input, 'category_id')) raw = 'category';
    }
    return ALLOWED_CATALOG_KINDS.indexOf(raw) === -1 ? '' : raw;
  }

  function extractRawId(input, catalogKind) {
    if (catalogKind === 'label') {
      return firstString(input, [['labelId'], ['label_id'], ['id']]);
    }
    if (catalogKind === 'tag') {
      return firstString(input, [['tagId'], ['tag_id'], ['id']]);
    }
    if (catalogKind === 'category') {
      return firstString(input, [['categoryId'], ['category_id'], ['id']]);
    }
    return '';
  }

  function extractRawName(input) {
    return firstString(input, [
      ['name'], ['rawName'], ['displayName'], ['title'], ['label'],
      ['meta', 'name'], ['meta', 'displayName']
    ]);
  }

  function extractRawColor(input) {
    return firstString(input, [
      ['color'], ['rawColor'], ['colour'], ['meta', 'color'], ['meta', 'rawColor']
    ]);
  }

  function normalizeDisplayOrder(input, warnings) {
    var value = firstNumber(input, [
      ['displayOrder'], ['display_order'], ['sortOrder'], ['sort_order'], ['order'],
      ['meta', 'displayOrder'], ['meta', 'sortOrder']
    ]);
    if (value == null) return 0;
    var normalized = Math.max(0, Math.floor(value));
    if (normalized !== value) addCode(warnings, 'display-order-normalized');
    return normalized;
  }

  function normalizeIconHint(input, warnings) {
    var value = firstString(input, [['iconHint'], ['icon'], ['meta', 'iconHint'], ['meta', 'icon']]);
    if (!value) return null;
    if (!SAFE_ICON_RE.test(value)) {
      addCode(warnings, 'icon-hint-ignored');
      return null;
    }
    return value;
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

  function normalizeLifecycle(input, warnings) {
    var raw = firstString(input, [
      ['lifecycleState'], ['lifecycle_state'], ['status'], ['state'],
      ['meta', 'lifecycleState'], ['meta', 'status']
    ]).toLowerCase();
    var archivedInput = firstBoolean(input, [['archived'], ['isArchived'], ['is_archived']]);
    var tombstonedInput = firstBoolean(input, [
      ['tombstoned'], ['isTombstoned'], ['is_tombstoned'],
      ['deleted'], ['isDeleted'], ['is_deleted']
    ]);
    if (!raw) {
      if (tombstonedInput === true) raw = 'tombstoned';
      else if (archivedInput === true) raw = 'archived';
      else raw = 'active';
    }
    if (raw === 'live') raw = 'active';
    if (raw === 'deleted' || raw === 'removed') raw = 'tombstoned';
    if (ALLOWED_LIFECYCLE_STATES.indexOf(raw) === -1) {
      return { ok: false, lifecycleState: '', archived: false, tombstoned: false };
    }
    if ((archivedInput === true && raw !== 'archived') ||
        (tombstonedInput === true && raw !== 'tombstoned')) {
      addCode(warnings, 'legacy-input-normalized');
    }
    return {
      ok: true,
      lifecycleState: raw,
      archived: raw === 'archived',
      tombstoned: raw === 'tombstoned'
    };
  }

  function lifecycleTimestamps(input, lifecycleState, observedAtIso) {
    var archivedAtIso = null;
    if (lifecycleState === 'archived') {
      archivedAtIso = coarsenIsoToHour(firstString(input, [
        ['archivedAtIso'], ['archivedAt'], ['archived_at'],
        ['updatedAtIso'], ['updatedAt'], ['updated_at']
      ]));
    }
    var lifecycleChangedAtIso = coarsenIsoToHour(firstString(input, [
      ['lifecycleChangedAtIso'], ['lifecycleChangedAt'], ['lifecycle_changed_at'],
      ['updatedAtIso'], ['updatedAt'], ['updated_at'],
      ['createdAtIso'], ['createdAt'], ['created_at']
    ])) || observedAtIso;
    var retentionExpiresAtIso = coarsenIsoToHour(firstString(input, [
      ['retentionExpiresAtIso'], ['retentionExpiresAt'], ['retention_expires_at'],
      ['expiresAtIso'], ['expiresAt'], ['expires_at']
    ]));
    return {
      archivedAtIso: archivedAtIso,
      lifecycleChangedAtIso: lifecycleChangedAtIso,
      retentionExpiresAtIso: retentionExpiresAtIso
    };
  }

  function accountHash(input) {
    return firstString(input, [
      ['originAccountIdHash'], ['accountIdHash'], ['account_id_hash'],
      ['meta', 'originAccountIdHash'], ['meta', 'accountIdHash']
    ]);
  }

  function rawAccountFieldPresent(input) {
    return hasOwn(input, 'accountId') || hasOwn(input, 'rawAccountId') ||
      hasOwn(input, 'userId') || hasOwn(input, 'rawUserId');
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

  async function canonicalizeLibraryCatalog(input) {
    var warnings = [];
    var observedAtIso = isObject(input) ? observedAt(input, warnings) : coarsenIsoToHour(nowIsoSeconds());

    if (!isObject(input)) {
      return quarantine('input-not-object', observedAtIso, [], warnings);
    }

    var inputForbidden = scanCatalogPrivacy(input, 'device-local');
    if (inputForbidden.length > 0 || rawAccountFieldPresent(input)) {
      var inHits = [];
      for (var ih = 0; ih < Math.min(inputForbidden.length, 8); ih++) {
        addCode(inHits, 'forbidden-field-in-input:' + String(inputForbidden[ih]));
      }
      if (rawAccountFieldPresent(input)) addCode(inHits, 'forbidden-field-in-input:accountId');
      return quarantine('forbidden-field-detected', observedAtIso, inHits, warnings);
    }

    var catalogKind = normalizeCatalogKind(input);
    if (!catalogKind) {
      return quarantine('invalid-catalog-kind', observedAtIso, [], warnings);
    }

    var rawId = extractRawId(input, catalogKind);
    if (!rawId) {
      return quarantine('missing-catalog-id', observedAtIso, [], warnings);
    }

    var rawName = extractRawName(input);
    if (!rawName) {
      return quarantine('missing-catalog-name', observedAtIso, [], warnings);
    }

    var perEnvelopeSalt = firstString(input, [['perEnvelopeSalt'], ['per_envelope_salt']]);
    if (!perEnvelopeSalt) {
      return quarantine('missing-per-envelope-salt', observedAtIso, [], warnings);
    }

    var originAccountIdHash = accountHash(input);
    var kernel = getKernel();
    if (!kernel
        || typeof kernel.sha256Hex !== 'function'
        || typeof kernel.canonicalJSON !== 'function') {
      return quarantine('kernel-identity-kit-unavailable', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(originAccountIdHash, kernel)) {
      return quarantine('missing-origin-account', observedAtIso, [], warnings);
    }

    var lifecycle = normalizeLifecycle(input, warnings);
    if (!lifecycle.ok) {
      return quarantine('invalid-lifecycle-state', observedAtIso, [], warnings);
    }

    if (hasOwn(input, 'parentId') || hasOwn(input, 'parent_id')) {
      addCode(warnings, 'parent-id-deferred');
    }
    if (catalogKind === 'tag' && hasOwn(input, 'autoDerived')) {
      addCode(warnings, 'legacy-input-normalized');
    }

    var nameHashResult = await sha256Field(kernel, rawName, 'name-hash-failed', observedAtIso, warnings);
    if (!nameHashResult.ok) return nameHashResult.result;

    var rawColor = extractRawColor(input);
    var colorHash = null;
    if (rawColor) {
      var colorHashResult = await sha256Field(
        kernel,
        rawColor.toLowerCase(),
        'color-hash-failed',
        observedAtIso,
        warnings
      );
      if (!colorHashResult.ok) return colorHashResult.result;
      colorHash = colorHashResult.digest;
    }

    var sourceTag = normalizeSourceTag(input, warnings);
    var sourceTagHashResult = await sha256Field(kernel, sourceTag, 'revision-hash-failed', observedAtIso, warnings);
    if (!sourceTagHashResult.ok) return sourceTagHashResult.result;

    var subjectId = '';
    try {
      subjectId = await kernel.sha256Hex(kernel.canonicalJSON({
        subjectType: SUBJECT_TYPE,
        catalogKind: catalogKind,
        rawId: rawId,
        perEnvelopeSalt: perEnvelopeSalt
      }));
    } catch (_) {
      return quarantine('subject-id-generation-failed', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(subjectId, kernel)) {
      return quarantine('subject-id-generation-failed', observedAtIso, [], warnings);
    }

    var timestamps = lifecycleTimestamps(input, lifecycle.lifecycleState, observedAtIso);
    var displayOrder = normalizeDisplayOrder(input, warnings);
    var iconHint = normalizeIconHint(input, warnings);

    var revisionInput = {
      lifecycleState: lifecycle.lifecycleState,
      archived: lifecycle.archived,
      tombstoned: lifecycle.tombstoned,
      retentionExpiresAtIso: timestamps.retentionExpiresAtIso,
      catalogKind: catalogKind,
      nameHash: nameHashResult.digest,
      colorHash: colorHash,
      displayOrder: displayOrder,
      iconHint: iconHint,
      originAccountIdHash: originAccountIdHash,
      schemaVersion: CANONICAL_SCHEMA,
      sourceTagHash: sourceTagHashResult.digest
    };

    var revisionHash = '';
    try {
      revisionHash = await kernel.sha256Hex(kernel.canonicalJSON(revisionInput));
    } catch (_) {
      return quarantine('revision-hash-failed', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(revisionHash, kernel)) {
      return quarantine('revision-hash-failed', observedAtIso, [], warnings);
    }

    var canonical = {
      objectType: OBJECT_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      revisionHash: revisionHash,
      catalogKind: catalogKind,
      nameHash: nameHashResult.digest,
      colorHash: colorHash,
      displayOrder: displayOrder,
      iconHint: iconHint,
      originAccountIdHash: originAccountIdHash,
      schemaVersion: CANONICAL_SCHEMA,
      lifecycleState: lifecycle.lifecycleState,
      archived: lifecycle.archived,
      tombstoned: lifecycle.tombstoned,
      archivedAtIso: timestamps.archivedAtIso,
      lifecycleChangedAtIso: timestamps.lifecycleChangedAtIso,
      retentionExpiresAtIso: timestamps.retentionExpiresAtIso,
      sourceTag: sourceTag,
      sourceTagHash: sourceTagHashResult.digest,
      observedAtIso: observedAtIso,
      redactionClass: 'redacted'
    };

    var outputForbidden = scanCatalogPrivacy(canonical, 'redacted');
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

  H2O.Desktop.Sync.canonicalizeLibraryCatalog = canonicalizeLibraryCatalog;
  H2O.Desktop.Sync.__libraryCatalogCanonicalizerInstalled = true;
  H2O.Desktop.Sync.__libraryCatalogCanonicalizerVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
