/* H2O Desktop Sync Kernel - F14.2.2 privacy scan primitive
 *
 * Desktop/Tauri L0 primitive only.
 *
 * Safety invariants:
 *   - Evaluates privacy policy only. No domain policy decisions.
 *   - No publication, replay, watermark, relay, WebDAV, storage, network,
 *     polling, timers, apply, convergence, or mobile behavior.
 *   - F14.3.8 adds a domain forbidden-field wrapper for chat metadata while
 *     preserving the base forever-no scanner behavior.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.scanPrivacy(value, policy?)
 *   H2O.Desktop.Sync.kernel.findForbiddenFields(value, policy?)
 *   H2O.Desktop.Sync.kernel.enforceRedactionClass(policy?)
 *   H2O.Desktop.Sync.kernel.scanDomainForbiddenFields(domainTag, target)
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  H2O.Desktop.Sync.kernel = H2O.Desktop.Sync.kernel || {};

  var kernel = H2O.Desktop.Sync.kernel;
  if (kernel.__privacyScanInstalled) return;

  var VERSION = '0.2.0-f14.3.8';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.privacy-scan.v1';

  var REDACTED = 'redacted';
  var DEVICE_LOCAL = 'device-local';
  var METADATA_ONLY = 'metadata-only';

  var REDACTION_CLASSES = [REDACTED, DEVICE_LOCAL, METADATA_ONLY];
  var DEFAULT_ALLOWED_REDACTION_CLASSES = [REDACTED];

  // Mirrors packages/cross-platform-envelope/src/constants.ts.
  var DEFAULT_FOREVER_NO_FIELDS = [
    'content',
    'body',
    'text',
    'messages',
    'attachments',
    'url',
    'path',
    'password',
    'apiKey'
  ];

  // Envelope-level local-only audit detail list.
  var DEFAULT_METADATA_ONLY_FORBIDDEN_FIELDS = [
    'auditMaintenanceId',
    'previewToken',
    'dbFingerprint',
    'candidateIds',
    'preState',
    'postState'
  ];

  var TOKEN_FIELD_EXCEPTION = 'previewToken';
  var CHAT_METADATA_ALWAYS_FORBIDDEN_FIELDS = [
    'messages',
    'message_array',
    'conversation',
    'text',
    'content',
    'body',
    'excerpts',
    'snippets',
    'attachments',
    'files',
    'file_ids',
    'image_urls',
    'audio_urls',
    'system_prompt',
    'instructions',
    'custom_instructions',
    'seed_prompt',
    'tool_calls',
    'function_calls',
    'plugins',
    'model',
    'model_slug',
    'model_version',
    'participants',
    'share_token',
    'share_url',
    'sharing',
    'visibility',
    'public_flag',
    'url',
    'path',
    'cookies',
    'session_token',
    'sessionToken',
    'user_agent',
    'userAgent',
    'ip',
    'IP',
    'ipAddress',
    'ip_address'
  ];
  var CHAT_METADATA_REDACTED_FORBIDDEN_FIELDS = [
    'name',
    'title',
    'chatTitle',
    'rawTitle',
    'proposedTitle',
    'rawId',
    'chatId',
    'chat_id',
    'accountId',
    'account_id',
    'rawAccountId',
    'userId',
    'user_id',
    'rawUserId',
    'messageId',
    'message_id',
    'rawMessageId'
  ];

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function normalizeStringList(value) {
    var out = [];
    asArray(value).forEach(function (item) {
      var normalized = cleanString(item);
      if (normalized && out.indexOf(normalized) === -1) out.push(normalized);
    });
    return out;
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }

  function uniqueStringList(value) {
    var out = [];
    asArray(value).forEach(function (item) {
      var normalized = cleanString(item);
      if (normalized && out.indexOf(normalized) === -1) out.push(normalized);
    });
    return out;
  }

  function normalizePolicy(policy) {
    var p = safeObject(policy);
    var allowedRedactionClasses = normalizeStringList(p.allowedRedactionClasses);
    if (!allowedRedactionClasses.length) {
      allowedRedactionClasses = DEFAULT_ALLOWED_REDACTION_CLASSES.slice();
    }

    return {
      subjectType: cleanString(p.subjectType),
      redactionClass: cleanString(p.redactionClass),
      allowedRedactionClasses: allowedRedactionClasses,
      allowlist: normalizeStringList(p.allowlist),
      forbiddenList: normalizeStringList(p.forbiddenList),
      foreverNoFields: normalizeStringList(p.foreverNoFields).length
        ? normalizeStringList(p.foreverNoFields)
        : DEFAULT_FOREVER_NO_FIELDS.slice(),
      redactionClassForbiddenList: normalizeStringList(p.redactionClassForbiddenList),
      enforceAllowlist: p.enforceAllowlist === true || normalizeStringList(p.allowlist).length > 0,
      allowTokenFields: normalizeStringList(p.allowTokenFields)
    };
  }

  function redactionClassFrom(value, options) {
    var valueClass = isObject(value) ? cleanString(value.redactionClass) : '';
    return options.redactionClass || valueClass || REDACTED;
  }

  function subjectFamily(subjectType) {
    var s = cleanString(subjectType);
    if (s === 'folderBinding' || s.indexOf('folderBinding.') === 0) return 'binding';
    if (s === 'folder.metadata' || s.indexOf('folder.') === 0) return 'folder';
    if (s === 'chat' || s.indexOf('chat.') === 0) return 'chat';
    if (s === 'snapshot' || s.indexOf('snapshot.') === 0) return 'snapshot';
    if (s === 'capture' || s.indexOf('capture.') === 0) return 'capture';
    return s ? 'unknown' : '';
  }

  function matchesFieldRule(rule, fieldName, fieldPath) {
    if (!rule) return false;
    if (rule === fieldName || rule === fieldPath) return true;
    if (rule.slice(-2) === '.*') {
      var prefix = rule.slice(0, -1);
      return fieldPath.indexOf(prefix) === 0;
    }
    return false;
  }

  function matchesAnyRule(rules, fieldName, fieldPath) {
    for (var i = 0; i < rules.length; i++) {
      if (matchesFieldRule(rules[i], fieldName, fieldPath)) return true;
    }
    return false;
  }

  function isTokenField(fieldName, options) {
    if (fieldName === TOKEN_FIELD_EXCEPTION) return false;
    if (options.allowTokenFields.indexOf(fieldName) !== -1) return false;
    var lower = fieldName.toLowerCase();
    return lower === 'token' || lower.slice(-5) === 'token';
  }

  function appendHit(hits, fieldName, fieldPath, reason) {
    for (var i = 0; i < hits.length; i++) {
      if (hits[i].fieldName === fieldName &&
        hits[i].fieldPath === fieldPath &&
        hits[i].reason === reason) {
        return;
      }
    }
    hits.push({
      fieldName: fieldName,
      fieldPath: fieldPath,
      reason: reason
    });
  }

  function scanNode(value, parentPath, options, hits) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        scanNode(value[i], parentPath ? parentPath + '[' + i + ']' : '[' + i + ']', options, hits);
      }
      return;
    }
    if (!isObject(value)) return;

    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var childPath = parentPath ? parentPath + '.' + key : key;

      if (matchesAnyRule(options.foreverNoFields, key, childPath)) {
        appendHit(hits, key, childPath, 'forever-no');
      }
      if (isTokenField(key, options)) {
        appendHit(hits, key, childPath, 'token-family');
      }
      if (matchesAnyRule(options.forbiddenList, key, childPath)) {
        appendHit(hits, key, childPath, 'policy-forbidden');
      }
      if (options.redactionClass === METADATA_ONLY &&
        matchesAnyRule(DEFAULT_METADATA_ONLY_FORBIDDEN_FIELDS, key, childPath)) {
        appendHit(hits, key, childPath, 'metadata-only-forbidden');
      }
      if (matchesAnyRule(options.redactionClassForbiddenList, key, childPath)) {
        appendHit(hits, key, childPath, 'redaction-class-forbidden');
      }
      if (options.enforceAllowlist && !matchesAnyRule(options.allowlist, key, childPath)) {
        appendHit(hits, key, childPath, 'not-allowlisted');
      }

      scanNode(value[key], childPath, options, hits);
    }
  }

  function blockerForHitReason(reason) {
    if (reason === 'not-allowlisted') return 'payload-contains-disallowed-field';
    if (reason === 'policy-forbidden') return 'payload-contains-forbidden-field';
    if (reason === 'metadata-only-forbidden') return 'payload-contains-forbidden-field';
    if (reason === 'redaction-class-forbidden') return 'payload-contains-forbidden-field';
    return 'payload-contains-forever-no-field';
  }

  function baseResult(options, redactionClass, blockers, warnings, forbiddenFields) {
    return {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      subjectType: options.subjectType,
      subjectFamily: subjectFamily(options.subjectType),
      redactionClass: redactionClass,
      forbiddenFields: forbiddenFields,
      warnings: warnings,
      blockers: blockers
    };
  }

  function enforceRedactionClass(policy) {
    var options = normalizePolicy(policy);
    var blockers = [];
    var warnings = [];
    var redactionClass = options.redactionClass || REDACTED;

    if (REDACTION_CLASSES.indexOf(redactionClass) === -1) {
      addCode(blockers, 'privacy-redaction-class-invalid');
    } else if (options.allowedRedactionClasses.indexOf(redactionClass) === -1) {
      addCode(blockers, 'privacy-redaction-class-not-allowed');
    }

    return baseResult(options, redactionClass, blockers, warnings, []);
  }

  function findForbiddenFields(value, policy) {
    var options = normalizePolicy(policy);
    options.redactionClass = redactionClassFrom(value, options);
    var hits = [];
    scanNode(value, '', options, hits);
    return hits;
  }

  function domainPolicy(domainTag, redactionClass) {
    var tag = cleanString(domainTag);
    var baseForeverNo = DEFAULT_FOREVER_NO_FIELDS.slice();
    if (tag === 'chat.metadata') {
      var forbidden = baseForeverNo.concat(CHAT_METADATA_ALWAYS_FORBIDDEN_FIELDS);
      if (redactionClass === REDACTED || !redactionClass) {
        forbidden = forbidden.concat(CHAT_METADATA_REDACTED_FORBIDDEN_FIELDS);
      }
      return {
        supported: true,
        subjectType: 'chat.metadata',
        forbiddenList: uniqueStringList(forbidden),
        foreverNoFields: uniqueStringList(baseForeverNo.concat(CHAT_METADATA_ALWAYS_FORBIDDEN_FIELDS)),
        allowTokenFields: [TOKEN_FIELD_EXCEPTION]
      };
    }
    return {
      supported: false,
      subjectType: tag,
      forbiddenList: [],
      foreverNoFields: baseForeverNo,
      allowTokenFields: [TOKEN_FIELD_EXCEPTION]
    };
  }

  function scanDomainForbiddenFields(domainTag, target) {
    var tag = cleanString(domainTag);
    var redactionClass = redactionClassFrom(target, {});
    var policy = domainPolicy(tag, redactionClass);
    var blockers = [];
    var warnings = [];
    if (!tag) addCode(blockers, 'domain-tag-missing');
    if (!policy.supported) addCode(warnings, 'domain-forbidden-policy-not-registered');

    var scan = scanPrivacy(target, {
      subjectType: policy.subjectType || tag,
      redactionClass: redactionClass,
      allowedRedactionClasses: REDACTION_CLASSES.slice(),
      forbiddenList: policy.forbiddenList,
      foreverNoFields: policy.foreverNoFields,
      allowTokenFields: policy.allowTokenFields
    });
    codeList(scan.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(scan.warnings).forEach(function (code) { addCode(warnings, code); });

    var forbiddenFields = asArray(scan.forbiddenFields);
    var hitNames = [];
    forbiddenFields.forEach(function (hit) {
      var name = cleanString(hit && hit.fieldName);
      if (name && hitNames.indexOf(name) === -1) hitNames.push(name);
    });
    return {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      domainTag: tag,
      subjectType: policy.subjectType || tag,
      subjectFamily: subjectFamily(policy.subjectType || tag),
      redactionClass: redactionClass,
      forbiddenFields: forbiddenFields,
      hits: hitNames,
      warnings: warnings,
      blockers: blockers
    };
  }

  function scanPrivacy(value, policy) {
    var options = normalizePolicy(policy);
    var blockers = [];
    var warnings = [];
    var redactionClass = redactionClassFrom(value, options);
    options.redactionClass = redactionClass;

    if (!options.subjectType) addCode(blockers, 'privacy-subject-type-missing');

    if (REDACTION_CLASSES.indexOf(redactionClass) === -1) {
      addCode(blockers, 'privacy-redaction-class-invalid');
    } else if (options.allowedRedactionClasses.indexOf(redactionClass) === -1) {
      addCode(blockers, 'privacy-redaction-class-not-allowed');
    }

    var forbiddenFields = findForbiddenFields(value, options);
    forbiddenFields.forEach(function (hit) {
      addCode(blockers, blockerForHitReason(hit.reason));
    });

    return baseResult(options, redactionClass, blockers, warnings, forbiddenFields);
  }

  function defaultForeverNoFields() {
    return DEFAULT_FOREVER_NO_FIELDS.slice();
  }

  function defaultRedactionClasses() {
    return REDACTION_CLASSES.slice();
  }

  kernel.scanPrivacy = scanPrivacy;
  kernel.findForbiddenFields = findForbiddenFields;
  kernel.scanDomainForbiddenFields = scanDomainForbiddenFields;
  kernel.enforceRedactionClass = enforceRedactionClass;
  kernel.defaultForeverNoFields = defaultForeverNoFields;
  kernel.defaultRedactionClasses = defaultRedactionClasses;
  kernel.__privacyScanInstalled = true;
  kernel.__privacyScanVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
