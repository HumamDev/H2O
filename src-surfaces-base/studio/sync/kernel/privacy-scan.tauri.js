/* H2O Desktop Sync Kernel - F14.2.2 privacy scan primitive
 *
 * Desktop/Tauri L0 primitive only.
 *
 * Safety invariants:
 *   - Evaluates privacy policy only. No domain policy decisions.
 *   - No publication, replay, watermark, relay, WebDAV, storage, network,
 *     polling, timers, apply, convergence, or mobile behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.2, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.scanPrivacy(value, policy?)
 *   H2O.Desktop.Sync.kernel.findForbiddenFields(value, policy?)
 *   H2O.Desktop.Sync.kernel.enforceRedactionClass(policy?)
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

  var VERSION = '0.1.0-f14.2.2';
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
  kernel.enforceRedactionClass = enforceRedactionClass;
  kernel.defaultForeverNoFields = defaultForeverNoFields;
  kernel.defaultRedactionClasses = defaultRedactionClasses;
  kernel.__privacyScanInstalled = true;
  kernel.__privacyScanVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
