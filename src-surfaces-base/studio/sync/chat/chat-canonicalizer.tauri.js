/* H2O Desktop Sync - F14.3.1 read-only chat canonicalizer
 *
 * Desktop/Tauri-only diagnostic. Operator-triggered. Pure function:
 *   one chat metadata record (Native mirror / Library Index / Registry Core
 *   projection) -> one canonical chat snapshot per F14.3.0.
 *
 * Public API:
 *   H2O.Desktop.Sync.canonicalizeChatMetadata(input) -> Promise<result>
 *   H2O.Desktop.Sync.__chatCanonicalizerInstalled
 *   H2O.Desktop.Sync.__chatCanonicalizerVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - Read-only: no storage writes, no mutations, no fetch, no timers, no
 *     polling, no publication, no proposal, no preflight, no apply, no
 *     watermark advance, no consumed-op writes.
 *   - Uses kernel identity-kit (canonicalJSON + sha256Hex + isSha256Hex).
 *   - Uses kernel privacy-scan if available; falls back to internal scanner.
 *   - Quarantine reasons (input rejected with no snapshot):
 *       input-not-object
 *       forbidden-field-detected           (kernel + chat-extended list)
 *       schema-mismatch                    (input.schemaVersion > current)
 *       missing-chat-id
 *       missing-account-binding            (neither accountId nor accountIdHash)
 *       kernel-identity-kit-unavailable
 *       account-hash-failed / account-hash-malformed
 *       subject-id-generation-failed / subject-id-malformed
 *       revision-hash-failed
 *       forbidden-field-in-snapshot        (output-side defense in depth)
 *   - Raw chatId / title / accountId are NEVER present in the emitted
 *     snapshot. Title enters the revisionHash inputs and is destroyed by
 *     sha256; titleHash = sha256(title) is the redacted-class projection.
 *   - originAccountIdHash is bound into revisionHash to prevent
 *     cross-account chatId collisions (F14.3.0 §1).
 *   - archivedAt is coarsened to the hour to limit timing correlation.
 *   - device-local class is not supported in v1; coerced to redacted with a
 *     warning ('device-local-class-not-supported-in-v1').
 *   - Idempotent install marker.
 *
 * Result schema:
 *   h2o.desktop.sync.chat-canonical-snapshot.v1
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
  if (H2O.Desktop.Sync.__chatCanonicalizerInstalled) return;

  var RESULT_SCHEMA = 'h2o.desktop.sync.chat-canonical-snapshot.v1';
  var VERSION = '0.1.0-f14.3.1';
  var OBJECT_TYPE = 'chat';
  var SUBJECT_TYPE = 'chat.metadata';
  var CURRENT_SCHEMA_VERSION = 1;
  var ALLOWED_SOURCE_TAGS = ['native-mirror', 'library-index', 'library-registry', 'unspecified'];

  // Chat-specific forever-no extensions registered on top of the kernel's
  // default list. These names must never appear as keys in either the
  // input record or the emitted snapshot. The list mirrors F14.3.0 §4.
  var CHAT_FORBIDDEN_EXTRA = [
    'messages', 'message_array', 'conversation', 'text', 'content', 'body',
    'excerpts', 'snippets',
    'attachments', 'files', 'file_ids', 'image_urls', 'audio_urls',
    'system_prompt', 'instructions', 'custom_instructions', 'seed_prompt',
    'tool_calls', 'function_calls', 'plugins',
    'model', 'model_slug', 'model_version',
    'participants', 'share_token', 'share_url', 'sharing', 'visibility',
    'public_flag', 'url', 'path', 'cookies', 'session_token', 'sessionToken',
    'user_agent', 'userAgent', 'ip', 'IP', 'ipAddress', 'ip_address'
  ];

  var CHAT_REDACTED_FORBIDDEN_EXTRA = [
    'name', 'title', 'chatTitle', 'rawTitle', 'proposedTitle',
    'rawId', 'chatId', 'chat_id',
    'accountId', 'account_id', 'rawAccountId',
    'userId', 'user_id', 'rawUserId',
    'messageId', 'message_id', 'rawMessageId'
  ];

  // ── Small helpers ───────────────────────────────────────────────────
  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanString(value) {
    return typeof value === 'string' ? value : '';
  }
  function addCode(list, code) {
    var normalized = cleanString(code).trim();
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

  // ── Input normalization (handles common field aliases) ───────────────
  function extractChatId(input) {
    if (!isObject(input)) return '';
    var direct = input.chatId || input.id;
    if (typeof direct === 'string' && direct.length > 0) return direct;
    if (isObject(input.chat)) {
      var nested = input.chat.chatId || input.chat.id;
      if (typeof nested === 'string' && nested.length > 0) return nested;
    }
    return '';
  }

  function extractAccountBinding(input) {
    if (!isObject(input)) return { raw: '', hash: '' };
    if (typeof input.accountIdHash === 'string' && input.accountIdHash) {
      return { raw: '', hash: input.accountIdHash };
    }
    if (typeof input.originAccountIdHash === 'string' && input.originAccountIdHash) {
      return { raw: '', hash: input.originAccountIdHash };
    }
    if (typeof input.accountId === 'string' && input.accountId) {
      return { raw: input.accountId, hash: '' };
    }
    if (isObject(input.account)) {
      var a = input.account;
      if (typeof a.accountIdHash === 'string' && a.accountIdHash) {
        return { raw: '', hash: a.accountIdHash };
      }
      if (typeof a.accountId === 'string' && a.accountId) {
        return { raw: a.accountId, hash: '' };
      }
      if (typeof a.id === 'string' && a.id) {
        return { raw: a.id, hash: '' };
      }
    }
    return { raw: '', hash: '' };
  }

  function extractTitle(input) {
    if (!isObject(input)) return null;
    if (typeof input.title === 'string') return input.title;
    if (isObject(input.chat) && typeof input.chat.title === 'string') return input.chat.title;
    return null;
  }

  function extractArchived(input) {
    if (!isObject(input)) return null;
    var candidates = [input.archived, input.isArchived, input.is_archived];
    if (isObject(input.chat)) {
      candidates.push(input.chat.archived, input.chat.isArchived, input.chat.is_archived);
    }
    for (var i = 0; i < candidates.length; i++) {
      if (typeof candidates[i] === 'boolean') return candidates[i];
    }
    return null;
  }

  function extractArchivedAt(input) {
    if (!isObject(input)) return null;
    var v = input.archivedAt || input.archived_at;
    if (!(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v))) {
      if (isObject(input.chat)) {
        v = input.chat.archivedAt || input.chat.archived_at;
      }
    }
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(v)) return null;
    // Coarsen to the hour to limit timing-correlation leakage.
    return v.replace(/T(\d{2}):\d{2}:\d{2}(\.\d+)?Z?$/, 'T$1:00:00Z');
  }

  function extractSchemaVersion(input) {
    if (!isObject(input)) return CURRENT_SCHEMA_VERSION;
    var v = input.schemaVersion;
    if (typeof v === 'number' && isFinite(v) && v > 0) return Math.floor(v);
    return CURRENT_SCHEMA_VERSION;
  }

  function extractSourceTag(input) {
    var v = (isObject(input) && typeof input.sourceTag === 'string') ? input.sourceTag : '';
    return ALLOWED_SOURCE_TAGS.indexOf(v) === -1 ? 'unspecified' : v;
  }

  function extractRedactionClass(input) {
    if (!isObject(input)) return 'redacted';
    return input.redactionClass === 'device-local' ? 'device-local' : 'redacted';
  }

  // ── Forbidden-field scanning (kernel-first, internal fallback) ───────
  function combinedForbiddenList(includeRedactedOnly) {
    var kernel = getKernel();
    var base = (kernel && typeof kernel.defaultForeverNoFields === 'function')
      ? kernel.defaultForeverNoFields()
      : ['content', 'body', 'text', 'messages', 'attachments', 'url', 'path', 'password', 'apiKey'];
    return includeRedactedOnly
      ? base.concat(CHAT_FORBIDDEN_EXTRA).concat(CHAT_REDACTED_FORBIDDEN_EXTRA)
      : base.concat(CHAT_FORBIDDEN_EXTRA);
  }

  function findForbiddenKeysInternal(value, forbiddenList, hitsOut) {
    if (value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        findForbiddenKeysInternal(value[i], forbiddenList, hitsOut);
      }
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
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scanTarget = target;
        if (options.deviceLocalInput === true && isObject(target)) {
          scanTarget = Object.assign({}, target, { redactionClass: 'device-local' });
        }
        var domainScan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, scanTarget);
        return hitNamesFromDomainScan(domainScan);
      } catch (_) { /* fall through to internal scanner */ }
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
        if (Array.isArray(kernelHits) && kernelHits.length > 0) return hitNamesFromDomainScan({ forbiddenFields: kernelHits });
      } catch (_) { /* fall through to internal scanner */ }
    }
    var hits = [];
    findForbiddenKeysInternal(target, list, hits);
    return hits;
  }

  // ── Result envelope helpers ──────────────────────────────────────────
  function buildResult(opts) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      redacted: opts.redacted !== false,
      quarantined: !!opts.quarantined,
      quarantineReason: opts.quarantineReason || null,
      snapshot: opts.snapshot || null,
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
        if (b && typeof b === 'object' && typeof b.code === 'string') {
          addCode(blockers, b.code);
        } else if (typeof b === 'string') {
          addCode(blockers, b);
        }
      }
    }
    return buildResult({
      ok: false,
      redacted: true,
      quarantined: true,
      quarantineReason: reason,
      snapshot: null,
      blockers: blockers,
      warnings: warnings || [],
      observedAtIso: observedAtIso
    });
  }

  // ── Public API ───────────────────────────────────────────────────────
  /**
   * canonicalizeChatMetadata(input) -> Promise<result>
   *
   * Read-only canonicalization of one chat metadata record into the
   * F14.3.0 canonical chat snapshot shape. Pure function: same input
   * (with same perEnvelopeSalt) produces the same snapshot. Never writes
   * storage, never mutates mirrors, never publishes.
   *
   * Input (loose; multiple field aliases accepted):
   *   chatId           : string  (or .id / .chat.chatId / .chat.id)
   *   accountId        : string  (raw — will be sha256-hashed)
   *     OR
   *   accountIdHash    : string  (already-hashed sha256 hex)
   *     OR
   *   originAccountIdHash : string (already-hashed sha256 hex)
   *   title            : string  (optional; produces titleHash)
   *   archived         : boolean (optional)
   *   archivedAt       : ISO string (optional; coarsened to hour)
   *   schemaVersion    : integer (default CURRENT_SCHEMA_VERSION; > current => quarantine)
   *   sourceTag        : 'native-mirror' | 'library-index' | 'library-registry' | 'unspecified'
   *   perEnvelopeSalt  : string  (optional; pass to make subjectId deterministic)
   *   observedAtIso    : string  (optional; defaults to now)
   *   redactionClass   : 'redacted' (default) | 'device-local' (coerced + warned in v1)
   *
   * Output (canonical snapshot under `result.snapshot` on success):
   *   { objectType: "chat",
   *     subjectType: "chat.metadata",
   *     subjectId, revisionHash, titleHash, archived, archivedAt,
   *     originAccountIdHash, schemaVersion, sourceTag, observedAtIso }
   */
  async function canonicalizeChatMetadata(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
      ? input.observedAtIso
      : nowIsoSeconds();
    var warnings = [];

    // Gate 0: input must be an object.
    if (!isObject(input)) {
      return quarantine('input-not-object', observedAtIso, [], warnings);
    }

    // Gate 1: forbidden fields in input (kernel + chat-extended list).
    var inputForbidden = scanForbidden(input, { deviceLocalInput: true });
    if (inputForbidden.length > 0) {
      var inHits = [];
      for (var ih = 0; ih < Math.min(inputForbidden.length, 6); ih++) {
        addCode(inHits, 'forbidden-field-in-input:' + String(inputForbidden[ih]));
      }
      return quarantine('forbidden-field-detected', observedAtIso, inHits, warnings);
    }

    // Gate 2: schema version <= current.
    var schemaVersion = extractSchemaVersion(input);
    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      return quarantine('schema-mismatch', observedAtIso, [], warnings);
    }

    // Gate 3: chatId present.
    var rawChatId = extractChatId(input);
    if (!rawChatId) {
      return quarantine('missing-chat-id', observedAtIso, [], warnings);
    }

    // Gate 4: account binding present (raw or pre-hashed).
    var account = extractAccountBinding(input);
    if (!account.raw && !account.hash) {
      return quarantine('missing-account-binding', observedAtIso, [], warnings);
    }

    // Beyond this point we need kernel identity primitives.
    var kernel = getKernel();
    if (!kernel
        || typeof kernel.sha256Hex !== 'function'
        || typeof kernel.canonicalJSON !== 'function') {
      return quarantine('kernel-identity-kit-unavailable', observedAtIso, [], warnings);
    }
    var isSha256Hex = (typeof kernel.isSha256Hex === 'function')
      ? kernel.isSha256Hex
      : function (s) { return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s); };

    // ── originAccountIdHash ─────────────────────────────────────────
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

    // ── titleHash (only if a title was provided) ────────────────────
    var rawTitle = extractTitle(input);
    var titleHash = null;
    if (typeof rawTitle === 'string' && rawTitle.length > 0) {
      try {
        var th = await kernel.sha256Hex(rawTitle);
        if (isSha256Hex(th)) {
          titleHash = th;
        } else {
          addCode(warnings, 'title-hash-malformed');
        }
      } catch (_) {
        addCode(warnings, 'title-hash-failed');
      }
    }

    // ── Other allowlisted metadata + class coercion ─────────────────
    var archived = extractArchived(input);
    var archivedAt = extractArchivedAt(input);
    var sourceTag = extractSourceTag(input);
    var redactionClass = extractRedactionClass(input);
    if (redactionClass !== 'redacted') {
      addCode(warnings, 'device-local-class-not-supported-in-v1');
    }

    // ── subjectId = sha256(canonicalJSON(identity tuple)) ───────────
    // The kernel identity kit composes the same way; we use the
    // primitives directly so the inputs are explicit and auditable.
    var perEnvelopeSalt = (typeof input.perEnvelopeSalt === 'string' && input.perEnvelopeSalt)
      ? input.perEnvelopeSalt
      : '';
    var subjectId;
    try {
      var subjectCanon = kernel.canonicalJSON({
        subjectType: SUBJECT_TYPE,
        rawId: rawChatId,
        perEnvelopeSalt: perEnvelopeSalt
      });
      subjectId = await kernel.sha256Hex(subjectCanon);
    } catch (_) {
      return quarantine('subject-id-generation-failed', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(subjectId)) {
      return quarantine('subject-id-malformed', observedAtIso, [], warnings);
    }

    // ── revisionHash = sha256(canonicalJSON(field set)) ─────────────
    // Raw title enters the hash and is destroyed by sha256; the redacted
    // projection is titleHash. originAccountIdHash binds revision to
    // account so cross-account chatId collisions cannot share a revision.
    var revisionHash;
    try {
      var revisionCanon = kernel.canonicalJSON({
        title: typeof rawTitle === 'string' ? rawTitle : null,
        archived: typeof archived === 'boolean' ? archived : null,
        originAccountIdHash: originAccountIdHash,
        schemaVersion: schemaVersion
      });
      revisionHash = await kernel.sha256Hex(revisionCanon);
    } catch (_) {
      return quarantine('revision-hash-failed', observedAtIso, [], warnings);
    }
    if (!isSha256Hex(revisionHash)) {
      return quarantine('revision-hash-failed', observedAtIso, [], warnings);
    }

    // ── Assemble the snapshot ───────────────────────────────────────
    var snapshot = {
      objectType: OBJECT_TYPE,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      revisionHash: revisionHash,
      titleHash: titleHash,
      archived: archived,
      archivedAt: archivedAt,
      originAccountIdHash: originAccountIdHash,
      schemaVersion: schemaVersion,
      sourceTag: sourceTag,
      observedAtIso: observedAtIso
    };

    // Output-side defense in depth: refuse to emit if any forbidden
    // key snuck into the snapshot (should be impossible — we only emit
    // an allowlisted shape — but the guard makes a future regression
    // surface as a quarantine rather than a leak).
    var snapshotForbidden = scanForbidden(snapshot);
    if (snapshotForbidden.length > 0) {
      var snapHits = [];
      for (var sh = 0; sh < Math.min(snapshotForbidden.length, 6); sh++) {
        addCode(snapHits, 'forbidden-field-in-snapshot:' + String(snapshotForbidden[sh]));
      }
      return quarantine('forbidden-field-in-snapshot', observedAtIso, snapHits, warnings);
    }

    return buildResult({
      ok: true,
      redacted: true,
      quarantined: false,
      quarantineReason: null,
      snapshot: snapshot,
      blockers: [],
      warnings: warnings,
      observedAtIso: observedAtIso
    });
  }

  // ── Registration (idempotent) ────────────────────────────────────────
  H2O.Desktop.Sync.canonicalizeChatMetadata = canonicalizeChatMetadata;
  H2O.Desktop.Sync.__chatCanonicalizerInstalled = true;
  H2O.Desktop.Sync.__chatCanonicalizerVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
