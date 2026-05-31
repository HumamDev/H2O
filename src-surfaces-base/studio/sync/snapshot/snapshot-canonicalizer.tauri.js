/* H2O Desktop Sync - F14.4.1 read-only snapshot canonicalizer
 *
 * Desktop/Tauri-only diagnostic. Pure function:
 *   Native snapshot record -> redacted canonical snapshot object.
 *
 * Public API:
 *   H2O.Desktop.Sync.canonicalizeSnapshot(input) -> Promise<result>
 *   H2O.Desktop.Sync.__snapshotCanonicalizerInstalled
 *   H2O.Desktop.Sync.__snapshotCanonicalizerVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - Read-only: no storage writes, no mutations, no fetch, no timers, no
 *     polling, no publication, no relay/outbox, no restore, no apply, no
 *     Native execution, no watermark advance, no consumed-op writes.
 *   - Uses kernel identity-kit (canonicalJSON + sha256Hex + subjectId).
 *   - Uses kernel privacy/domain forbidden scanner plus snapshot-specific
 *     forever-no extensions.
 *   - Quarantines missing snapshot id, missing account binding, invalid
 *     lifecycle, forbidden fields, schema mismatch, and malformed hashes.
 *   - Raw snapshot id / chat id / account id / model / source tag are never
 *     emitted. Counts and sizes are bucketized before output.
 *
 * Result schema:
 *   h2o.desktop.sync.snapshot-canonicalizer-result.v1
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
  if (H2O.Desktop.Sync.__snapshotCanonicalizerInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-canonicalizer-result.v1';
  var CANONICAL_SCHEMA = 'h2o.desktop.sync.snapshot.conversation.canonical.v1';
  var VERSION = '0.1.0-f14.4.1';
  var OBJECT_TYPE = 'snapshot';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var CURRENT_SCHEMA_VERSION = 1;

  var ALLOWED_LIFECYCLE_STATES = ['active', 'archived', 'retained', 'expired', 'tombstoned'];
  var ALLOWED_SOURCE_TAGS = [
    'native-snapshot',
    'manual-snapshot',
    'library-snapshot',
    'sync-import',
    'unspecified'
  ];

  var SNAPSHOT_FORBIDDEN_EXTRA = [
    'messages', 'message_array', 'turns', 'turn_array', 'snapshotTurns',
    'conversation', 'conversationBody', 'transcript', 'text', 'content',
    'body', 'prompt', 'answer', 'response', 'responses', 'completion',
    'excerpt', 'excerpts', 'snippet', 'snippets',
    'attachments', 'files', 'file_ids', 'image_urls', 'audio_urls',
    'html', 'markdown', 'rawSnapshot', 'snapshotPayload', 'payload',
    'share_token', 'share_url', 'sharing', 'visibility', 'public_flag',
    'url', 'path', 'cookies', 'session_token', 'sessionToken',
    'user_agent', 'userAgent', 'ip', 'IP', 'ipAddress', 'ip_address'
  ];

  var SNAPSHOT_REDACTED_FORBIDDEN_EXTRA = [
    'rawId', 'snapshotId', 'snapshot_id',
    'chatId', 'chat_id', 'conversationId', 'conversation_id',
    'accountId', 'account_id', 'rawAccountId',
    'userId', 'user_id', 'rawUserId',
    'messageId', 'message_id', 'rawMessageId',
    'title', 'name', 'chatTitle', 'folderName'
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
      var v = valueAtPath(input, paths[i]);
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  }

  function firstNumber(input, paths) {
    for (var i = 0; i < paths.length; i++) {
      var v = valueAtPath(input, paths[i]);
      if (typeof v === 'number' && isFinite(v)) return v;
      if (typeof v === 'string' && v.trim() && isFinite(Number(v))) return Number(v);
    }
    return null;
  }

  function firstBoolean(input, paths) {
    for (var i = 0; i < paths.length; i++) {
      var v = valueAtPath(input, paths[i]);
      if (typeof v === 'boolean') return v;
    }
    return null;
  }

  function extractSnapshotId(input) {
    return firstString(input, [
      ['snapshotId'], ['snapshot_id'], ['id'],
      ['snapshot', 'snapshotId'], ['snapshot', 'snapshot_id'], ['snapshot', 'id']
    ]);
  }

  function extractAccountBinding(input) {
    var hash = firstString(input, [
      ['originAccountIdHash'], ['accountIdHash'], ['account_id_hash'],
      ['account', 'originAccountIdHash'], ['account', 'accountIdHash']
    ]);
    if (hash) return { raw: '', hash: hash };
    var raw = firstString(input, [
      ['accountId'], ['account_id'],
      ['account', 'accountId'], ['account', 'account_id'], ['account', 'id']
    ]);
    return { raw: raw, hash: '' };
  }

  function extractChatBinding(input) {
    var hash = firstString(input, [
      ['originChatSubjectIdHash'], ['chatSubjectIdHash'], ['chat_subject_id_hash'],
      ['chat', 'originChatSubjectIdHash'], ['chat', 'chatSubjectIdHash']
    ]);
    if (hash) return { raw: '', hash: hash };
    var raw = firstString(input, [
      ['chatSubjectId'], ['chatId'], ['chat_id'], ['conversationId'], ['conversation_id'],
      ['chat', 'chatSubjectId'], ['chat', 'chatId'], ['chat', 'id']
    ]);
    return { raw: raw, hash: '' };
  }

  function extractSchemaVersion(input) {
    var v = firstNumber(input, [['schemaVersion'], ['schema_version']]);
    if (v == null) return CURRENT_SCHEMA_VERSION;
    if (!isFinite(v) || v < 1) return NaN;
    return Math.floor(v);
  }

  function normalizeLifecycle(input) {
    var raw = firstString(input, [
      ['lifecycleState'], ['lifecycle_state'], ['state'], ['status'],
      ['snapshot', 'lifecycleState'], ['snapshot', 'state'], ['snapshot', 'status']
    ]).toLowerCase();

    var tombstoned = firstBoolean(input, [
      ['tombstoned'], ['isTombstoned'], ['is_tombstoned'],
      ['deleted'], ['isDeleted'], ['is_deleted']
    ]);
    var archived = firstBoolean(input, [
      ['archived'], ['isArchived'], ['is_archived']
    ]);

    if (!raw) {
      if (tombstoned === true) raw = 'tombstoned';
      else if (archived === true) raw = 'archived';
      else raw = 'active';
    }

    if (raw === 'live') raw = 'active';
    if (raw === 'deleted' || raw === 'removed') raw = 'tombstoned';
    if (ALLOWED_LIFECYCLE_STATES.indexOf(raw) === -1) {
      return { ok: false, lifecycleState: '', archived: false, tombstoned: false };
    }

    return {
      ok: true,
      lifecycleState: raw,
      archived: archived === null ? raw === 'archived' : archived === true,
      tombstoned: tombstoned === null ? raw === 'tombstoned' : tombstoned === true
    };
  }

  function normalizeIsoOrNull(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function extractTimestamps(input, lifecycleState, observedAtIso, warnings) {
    var capturedAtIso = normalizeIsoOrNull(firstString(input, [
      ['capturedAtIso'], ['capturedAt'], ['captured_at'],
      ['createdAtIso'], ['createdAt'], ['created_at'], ['timestamp']
    ]));
    if (!capturedAtIso) {
      capturedAtIso = observedAtIso;
      addCode(warnings, 'captured-at-missing-used-observed-at');
    }

    var lifecycleChangedAtIso = normalizeIsoOrNull(firstString(input, [
      ['lifecycleChangedAtIso'], ['lifecycleChangedAt'], ['lifecycle_changed_at'],
      ['updatedAtIso'], ['updatedAt'], ['updated_at'],
      ['archivedAtIso'], ['archivedAt'], ['archived_at'],
      ['tombstonedAtIso'], ['tombstonedAt'], ['tombstoned_at']
    ]));
    if (!lifecycleChangedAtIso) lifecycleChangedAtIso = capturedAtIso;

    var retentionExpiresAtIso = normalizeIsoOrNull(firstString(input, [
      ['retentionExpiresAtIso'], ['retentionExpiresAt'], ['retention_expires_at'],
      ['expiresAtIso'], ['expiresAt'], ['expires_at'], ['purgeAfter'], ['purge_after']
    ]));
    if (lifecycleState === 'expired' && !retentionExpiresAtIso) {
      addCode(warnings, 'expired-without-retention-expiry');
    }

    return {
      capturedAtIso: capturedAtIso,
      lifecycleChangedAtIso: lifecycleChangedAtIso,
      retentionExpiresAtIso: retentionExpiresAtIso
    };
  }

  function turnCountBucket(count) {
    if (count == null || !isFinite(count) || count < 0) return 'unknown';
    var n = Math.floor(count);
    if (n === 0) return '0';
    if (n === 1) return '1';
    if (n <= 5) return '2-5';
    if (n <= 10) return '6-10';
    if (n <= 25) return '11-25';
    if (n <= 50) return '26-50';
    if (n <= 100) return '51-100';
    if (n <= 250) return '101-250';
    if (n <= 500) return '251-500';
    if (n <= 1000) return '501-1000';
    return '1001+';
  }

  function sizeBucket(bytes) {
    if (bytes == null || !isFinite(bytes) || bytes < 0) return 'unknown';
    var n = Math.floor(bytes);
    if (n === 0) return '0';
    if (n <= 4096) return '1-4kb';
    if (n <= 16384) return '4-16kb';
    if (n <= 65536) return '16-64kb';
    if (n <= 262144) return '64-256kb';
    if (n <= 1048576) return '256kb-1mb';
    if (n <= 4194304) return '1-4mb';
    if (n <= 16777216) return '4-16mb';
    return '16mb+';
  }

  function extractTurnCount(input) {
    return firstNumber(input, [
      ['turnCount'], ['turn_count'], ['messageCount'], ['message_count'],
      ['metadata', 'turnCount'], ['metadata', 'messageCount']
    ]);
  }

  function extractSizeBytes(input) {
    return firstNumber(input, [
      ['sizeBytes'], ['size_bytes'], ['byteSize'], ['byte_size'], ['bytes'],
      ['payloadBytes'], ['payload_bytes'], ['contentBytes'], ['content_bytes'],
      ['metadata', 'sizeBytes'], ['metadata', 'bytes']
    ]);
  }

  function normalizeSourceTag(input) {
    var raw = firstString(input, [
      ['sourceTag'], ['source_tag'], ['source'], ['origin'], ['metadata', 'sourceTag']
    ]);
    var normalized = raw.toLowerCase();
    if (ALLOWED_SOURCE_TAGS.indexOf(normalized) === -1) normalized = 'unspecified';
    return { raw: raw || normalized, normalized: normalized };
  }

  function modelValue(input) {
    return firstString(input, [
      ['model'], ['modelSlug'], ['model_slug'], ['modelVersion'], ['model_version'],
      ['metadata', 'model'], ['metadata', 'modelSlug']
    ]);
  }

  function combinedForbiddenList(includeRedactedOnly) {
    var kernel = getKernel();
    var base = (kernel && typeof kernel.defaultForeverNoFields === 'function')
      ? kernel.defaultForeverNoFields()
      : ['content', 'body', 'text', 'messages', 'attachments', 'url', 'path', 'password', 'apiKey'];
    return includeRedactedOnly
      ? base.concat(SNAPSHOT_FORBIDDEN_EXTRA).concat(SNAPSHOT_REDACTED_FORBIDDEN_EXTRA)
      : base.concat(SNAPSHOT_FORBIDDEN_EXTRA);
  }

  function findForbiddenKeysInternal(value, forbiddenList, hitsOut) {
    if (value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) findForbiddenKeysInternal(value[i], forbiddenList, hitsOut);
      return;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (forbiddenList.indexOf(key) !== -1) {
        hitsOut.push(key);
      } else if (/token$/i.test(key) && key !== 'previewToken') {
        hitsOut.push(key);
      }
      findForbiddenKeysInternal(value[key], forbiddenList, hitsOut);
    }
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

  function scanForbidden(target, opts) {
    var kernel = getKernel();
    var options = isObject(opts) ? opts : {};
    var includeRedactedOnly = options.deviceLocalInput !== true;
    var hits = [];

    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scanTarget = target;
        if (options.deviceLocalInput === true && isObject(target)) {
          scanTarget = Object.assign({}, target, { redactionClass: 'device-local' });
        }
        hits = hitNamesFromDomainScan(kernel.scanDomainForbiddenFields(SUBJECT_TYPE, scanTarget));
      } catch (_) { /* fall through to local/kernel generic scanners */ }
    }

    var list = combinedForbiddenList(includeRedactedOnly);
    if (kernel && typeof kernel.findForbiddenFields === 'function') {
      try {
        var kernelHits = kernel.findForbiddenFields(target, {
          subjectType: SUBJECT_TYPE,
          redactionClass: includeRedactedOnly ? 'redacted' : 'device-local',
          allowedRedactionClasses: ['redacted', 'device-local'],
          forbiddenList: list,
          foreverNoFields: combinedForbiddenList(false)
        });
        hitNamesFromDomainScan({ forbiddenFields: kernelHits }).forEach(function (name) {
          if (hits.indexOf(name) === -1) hits.push(name);
        });
      } catch (_) { /* fall through to internal scanner */ }
    }

    var localHits = [];
    findForbiddenKeysInternal(target, list, localHits);
    localHits.forEach(function (name) {
      if (hits.indexOf(name) === -1) hits.push(name);
    });
    return hits;
  }

  function buildResult(opts) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      redacted: opts.redacted !== false,
      quarantined: !!opts.quarantined,
      quarantineReason: opts.quarantineReason || null,
      canonicalSnapshot: opts.canonicalSnapshot || null,
      snapshot: opts.canonicalSnapshot || null,
      blockers: Array.isArray(opts.blockers) ? opts.blockers : [],
      warnings: Array.isArray(opts.warnings) ? opts.warnings : [],
      observedAtIso: opts.observedAtIso || nowIsoSeconds()
    };
  }

  function quarantine(reason, observedAtIso, extraBlockers, warnings) {
    var blockers = [];
    addCode(blockers, reason);
    if (Array.isArray(extraBlockers)) {
      for (var i = 0; i < extraBlockers.length; i++) {
        var b = extraBlockers[i];
        if (b && typeof b === 'object' && typeof b.code === 'string') addCode(blockers, b.code);
        else if (typeof b === 'string') addCode(blockers, b);
      }
    }
    return buildResult({
      ok: false,
      redacted: true,
      quarantined: true,
      quarantineReason: reason,
      canonicalSnapshot: null,
      blockers: blockers,
      warnings: warnings || [],
      observedAtIso: observedAtIso
    });
  }

  async function canonicalizeSnapshot(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
      ? normalizeIsoOrNull(input.observedAtIso) || nowIsoSeconds()
      : nowIsoSeconds();
    var warnings = [];

    if (!isObject(input)) {
      return quarantine('input-not-object', observedAtIso, [], warnings);
    }

    var inputForbidden = scanForbidden(input, { deviceLocalInput: true });
    if (inputForbidden.length > 0) {
      var inHits = [];
      for (var ih = 0; ih < Math.min(inputForbidden.length, 8); ih++) {
        addCode(inHits, 'forbidden-field-in-input:' + String(inputForbidden[ih]));
      }
      return quarantine('forbidden-field-detected', observedAtIso, inHits, warnings);
    }

    var schemaVersion = extractSchemaVersion(input);
    if (!isFinite(schemaVersion) || schemaVersion > CURRENT_SCHEMA_VERSION) {
      return quarantine('schema-mismatch', observedAtIso, [], warnings);
    }

    var rawSnapshotId = extractSnapshotId(input);
    if (!rawSnapshotId) {
      return quarantine('missing-snapshot-id', observedAtIso, [], warnings);
    }

    var account = extractAccountBinding(input);
    if (!account.raw && !account.hash) {
      return quarantine('missing-account-binding', observedAtIso, [], warnings);
    }

    var lifecycle = normalizeLifecycle(input);
    if (!lifecycle.ok) {
      return quarantine('invalid-lifecycle', observedAtIso, [], warnings);
    }

    var kernel = getKernel();
    if (!kernel
        || typeof kernel.sha256Hex !== 'function'
        || typeof kernel.canonicalJSON !== 'function') {
      return quarantine('kernel-identity-kit-unavailable', observedAtIso, [], warnings);
    }
    var isSha256Hex = (typeof kernel.isSha256Hex === 'function')
      ? kernel.isSha256Hex
      : function (s) { return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s); };

    var originAccountIdHash;
    if (account.hash) {
      if (!isSha256Hex(account.hash)) {
        return quarantine('account-hash-malformed', observedAtIso, [], warnings);
      }
      originAccountIdHash = account.hash;
    } else {
      try {
        originAccountIdHash = await kernel.sha256Hex(account.raw);
      } catch (_) {
        return quarantine('account-hash-failed', observedAtIso, [], warnings);
      }
      if (!isSha256Hex(originAccountIdHash)) {
        return quarantine('account-hash-malformed', observedAtIso, [], warnings);
      }
    }

    var chat = extractChatBinding(input);
    var originChatSubjectIdHash = '';
    if (chat.hash) {
      if (!isSha256Hex(chat.hash)) {
        return quarantine('chat-subject-hash-malformed', observedAtIso, [], warnings);
      }
      originChatSubjectIdHash = chat.hash;
    } else if (chat.raw) {
      try {
        originChatSubjectIdHash = await kernel.sha256Hex({
          schema: 'h2o.desktop.sync.snapshot.origin-chat-subject-input.v1',
          subjectType: 'chat.metadata',
          rawChatId: chat.raw,
          originAccountIdHash: originAccountIdHash
        });
      } catch (_) {
        return quarantine('chat-subject-hash-failed', observedAtIso, [], warnings);
      }
      if (!isSha256Hex(originChatSubjectIdHash)) {
        return quarantine('chat-subject-hash-malformed', observedAtIso, [], warnings);
      }
    } else {
      addCode(warnings, 'origin-chat-binding-missing');
      originChatSubjectIdHash = await kernel.sha256Hex({
        schema: 'h2o.desktop.sync.snapshot.origin-chat-subject-missing.v1',
        originAccountIdHash: originAccountIdHash
      });
    }

    var subjectId;
    try {
      if (typeof kernel.generateSubjectId === 'function') {
        var subject = await kernel.generateSubjectId({
          subjectType: SUBJECT_TYPE,
          rawIdentifiers: {
            snapshotId: rawSnapshotId,
            originChatSubjectIdHash: originChatSubjectIdHash,
            originAccountIdHash: originAccountIdHash
          }
        });
        if (subject && subject.ok && isSha256Hex(subject.subjectId)) subjectId = subject.subjectId;
      }
      if (!subjectId) {
        subjectId = await kernel.sha256Hex({
          schema: 'h2o.desktop.sync.snapshot.subject-id-input.v1',
          subjectType: SUBJECT_TYPE,
          rawSnapshotId: rawSnapshotId,
          originChatSubjectIdHash: originChatSubjectIdHash,
          originAccountIdHash: originAccountIdHash
        });
      }
    } catch (_) {
      return quarantine('subject-id-generation-failed', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(subjectId)) {
      return quarantine('subject-id-malformed', observedAtIso, [], warnings);
    }

    var timestamps = extractTimestamps(input, lifecycle.lifecycleState, observedAtIso, warnings);
    var turnBucket = turnCountBucket(extractTurnCount(input));
    var bytesBucket = sizeBucket(extractSizeBytes(input));
    var modelRaw = modelValue(input);
    var modelHash = null;
    if (modelRaw) {
      try { modelHash = await kernel.sha256Hex(modelRaw); } catch (_) { addCode(warnings, 'model-hash-failed'); }
      if (modelHash && !isSha256Hex(modelHash)) {
        modelHash = null;
        addCode(warnings, 'model-hash-malformed');
      }
    }

    var source = normalizeSourceTag(input);
    var sourceTagHash = null;
    try {
      sourceTagHash = await kernel.sha256Hex(source.raw || source.normalized);
    } catch (_) {
      return quarantine('source-tag-hash-failed', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(sourceTagHash)) {
      return quarantine('source-tag-hash-malformed', observedAtIso, [], warnings);
    }

    var revisionHash;
    try {
      revisionHash = await kernel.sha256Hex({
        schema: CANONICAL_SCHEMA,
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        originChatSubjectIdHash: originChatSubjectIdHash,
        originAccountIdHash: originAccountIdHash,
        lifecycleState: lifecycle.lifecycleState,
        archived: lifecycle.archived,
        tombstoned: lifecycle.tombstoned,
        capturedAtIso: timestamps.capturedAtIso,
        lifecycleChangedAtIso: timestamps.lifecycleChangedAtIso,
        retentionExpiresAtIso: timestamps.retentionExpiresAtIso,
        turnCountBucket: turnBucket,
        sizeBucket: bytesBucket,
        modelHash: modelHash,
        sourceTag: source.normalized,
        sourceTagHash: sourceTagHash,
        schemaVersion: schemaVersion
      });
    } catch (_) {
      return quarantine('revision-hash-failed', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(revisionHash)) {
      return quarantine('revision-hash-failed', observedAtIso, [], warnings);
    }

    var canonicalSnapshot = {
      objectType: OBJECT_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      revisionHash: revisionHash,
      originChatSubjectIdHash: originChatSubjectIdHash,
      originAccountIdHash: originAccountIdHash,
      lifecycleState: lifecycle.lifecycleState,
      archived: lifecycle.archived,
      tombstoned: lifecycle.tombstoned,
      capturedAtIso: timestamps.capturedAtIso,
      lifecycleChangedAtIso: timestamps.lifecycleChangedAtIso,
      retentionExpiresAtIso: timestamps.retentionExpiresAtIso,
      turnCountBucket: turnBucket,
      sizeBucket: bytesBucket,
      modelHash: modelHash,
      sourceTag: source.normalized,
      sourceTagHash: sourceTagHash,
      schemaVersion: schemaVersion,
      redactionClass: 'redacted'
    };

    var snapshotForbidden = scanForbidden(canonicalSnapshot);
    if (snapshotForbidden.length > 0) {
      var snapHits = [];
      for (var sh = 0; sh < Math.min(snapshotForbidden.length, 8); sh++) {
        addCode(snapHits, 'forbidden-field-in-snapshot:' + String(snapshotForbidden[sh]));
      }
      return quarantine('forbidden-field-in-snapshot', observedAtIso, snapHits, warnings);
    }

    return buildResult({
      ok: true,
      redacted: true,
      quarantined: false,
      quarantineReason: null,
      canonicalSnapshot: canonicalSnapshot,
      blockers: [],
      warnings: warnings,
      observedAtIso: observedAtIso
    });
  }

  H2O.Desktop.Sync.canonicalizeSnapshot = canonicalizeSnapshot;
  H2O.Desktop.Sync.__snapshotCanonicalizerInstalled = true;
  H2O.Desktop.Sync.__snapshotCanonicalizerVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
