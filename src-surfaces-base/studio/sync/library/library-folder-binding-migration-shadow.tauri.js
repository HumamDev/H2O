/* H2O Desktop Sync - F15.11.d folder binding migration shadow events
 *
 * Privacy-safe shadow event ledger for linking legacy F7/F13 folder binding
 * identity to the F15 library.binding chat-folder identity. This module is
 * intentionally metadata-only:
 *   - no folder store writes
 *   - no SQLite writes
 *   - no execute / settlement
 *   - no F7 wrapper delegation by itself
 *
 * Public API:
 *   H2O.Desktop.Sync.createLibraryFolderBindingMigrationShadow(input)
 *   H2O.Desktop.Sync.listLibraryFolderBindingMigrationShadows(input)
 *   H2O.Desktop.Sync.setF15FolderBindingDelegationEnabled(value)
 *   H2O.Desktop.Sync.isF15FolderBindingDelegationEnabled()
 *   H2O.Desktop.Sync.__enableF15FolderBindingDelegation
 *   H2O.Desktop.Sync.__libraryFolderBindingMigrationShadowInstalled
 *   H2O.Desktop.Sync.__libraryFolderBindingMigrationShadowVersion
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
  if (H2O.Desktop.Sync.__libraryFolderBindingMigrationShadowInstalled) return;

  var VERSION = '0.1.0-f15.11.d';
  var SHADOW_SCHEMA = 'h2o.desktop.sync.library-folder-binding-migration-shadow.v1';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-folder-binding-migration-shadow-result.v1';
  var SUBJECT_TYPE = 'library.binding';
  var BINDING_KIND = 'chat-folder';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var FORBIDDEN_RAW_FIELD_KEYS = [
    'rawChatId',
    'rawFolderId',
    'chatId',
    'chat_id',
    'folderId',
    'folder_id',
    'name',
    'folderName',
    'rawName',
    'title',
    'displayName',
    'color',
    'rawColor',
    'path',
    'url',
    'href',
    'content',
    'body',
    'text',
    'messages',
    'turns',
    'attachments',
    'files',
    'token',
    'tokens',
    'apiKey',
    'password',
    'sessionToken',
    'session_token',
    'category_id',
    'chats.category_id'
  ];

  var shadowLedger = [];

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function normalizeObservedAt(value) {
    var text = cleanString(value);
    if (!text) return nowIsoSeconds();
    var date = new Date(text);
    if (!Number.isFinite(date.getTime())) return nowIsoSeconds();
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function getKernel() {
    return (H2O.Desktop && H2O.Desktop.Sync && H2O.Desktop.Sync.kernel) || null;
  }

  function isSha256Hex(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return SHA256_RE.test(cleanLower(value));
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
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var part = bytes[i].toString(16);
      out += part.length === 1 ? '0' + part : part;
    }
    return out;
  }

  async function sha256Hex(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var digest = await kernel.sha256Hex(value);
        if (isSha256Hex(digest)) return cleanLower(digest);
      } catch (_) { /* fall through */ }
    }
    if (!global.crypto || !global.crypto.subtle || typeof global.crypto.subtle.digest !== 'function') return '';
    var text = typeof value === 'string' ? value : canonicalJSON(value);
    var data = new global.TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
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
      storageWritten: false
    };
  }

  function addEntry(list, code, severity, metadata) {
    var normalized = cleanString(code);
    if (!normalized) return;
    var sev = cleanString(severity) || 'warning';
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized && list[i].severity === sev) return;
    }
    var entry = { code: normalized, severity: sev };
    if (isObject(metadata)) entry.metadata = metadata;
    list.push(entry);
  }

  function addBlocker(list, code, metadata) {
    addEntry(list, code, 'blocker', metadata);
  }

  function addWarning(list, code, metadata) {
    addEntry(list, code, 'warning', metadata);
  }

  function scanForbiddenFieldNames(value, path, hits) {
    if (!isObject(value) && !Array.isArray(value)) return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) scanForbiddenFieldNames(value[i], path + '[' + i + ']', hits);
      return;
    }
    Object.keys(value).forEach(function (key) {
      var nextPath = path ? path + '.' + key : key;
      if (FORBIDDEN_RAW_FIELD_KEYS.indexOf(key) !== -1) hits.push(nextPath);
      scanForbiddenFieldNames(value[key], nextPath, hits);
    });
  }

  function scanPrivacy(target, blockers, warnings) {
    var hits = [];
    scanForbiddenFieldNames(target, '', hits);
    var kernel = getKernel();
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, target, 'redacted');
        if (scan && scan.ok === false && Array.isArray(scan.forbiddenFields)) {
          for (var i = 0; i < scan.forbiddenFields.length; i++) {
            var hit = scan.forbiddenFields[i];
            hits.push(cleanString(hit && (hit.fieldName || hit.field || hit.path)) || 'unknown');
          }
        }
      } catch (_) {
        addWarning(warnings, 'library-folder-binding-shadow-privacy-scan-threw');
      }
    }
    var deduped = [];
    for (var j = 0; j < hits.length; j++) {
      if (hits[j] && deduped.indexOf(hits[j]) === -1) deduped.push(hits[j]);
    }
    if (deduped.length > 0) addBlocker(blockers, 'library-folder-binding-shadow-privacy-failed');
    return {
      ok: deduped.length === 0,
      forbiddenFields: deduped,
      blockers: deduped.length > 0 ? [{ code: 'library-folder-binding-shadow-privacy-failed', severity: 'blocker' }] : [],
      warnings: []
    };
  }

  function buildResult(fields) {
    var value = isObject(fields) ? fields : {};
    var blockers = Array.isArray(value.blockers) ? value.blockers : [];
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      created: value.created === true,
      alreadyPresent: value.alreadyPresent === true,
      shadowEvent: value.shadowEvent || null,
      row: value.row || null,
      rows: Array.isArray(value.rows) ? value.rows : [],
      rowCount: typeof value.rowCount === 'number' ? value.rowCount : (Array.isArray(value.rows) ? value.rows.length : shadowLedger.length),
      blockers: blockers,
      warnings: Array.isArray(value.warnings) ? value.warnings : [],
      privacy: value.privacy || { ok: blockers.length === 0, forbiddenFields: [], blockers: [], warnings: [] },
      sideEffectSummary: sideEffectSummary(),
      observedAtIso: value.observedAtIso || nowIsoSeconds()
    };
  }

  async function createLibraryFolderBindingMigrationShadow(input) {
    var args = isObject(input) ? input : {};
    var blockers = [];
    var warnings = [];
    var observedAtIso = normalizeObservedAt(args.observedAtIso);

    if (!isObject(input)) addBlocker(blockers, 'library-folder-binding-shadow-input-invalid');

    var inputPrivacy = scanPrivacy(args, blockers, warnings);
    if (blockers.length) {
      return buildResult({ blockers: blockers, warnings: warnings, privacy: inputPrivacy, observedAtIso: observedAtIso });
    }

    var chatSubjectId = cleanLower(args.chatSubjectId || args.leftSubjectId);
    var folderSubjectId = cleanLower(args.folderSubjectId || args.rightSubjectId);
    var perEnvelopeSalt = cleanLower(args.perEnvelopeSalt);
    if (!isSha256Hex(chatSubjectId)) addBlocker(blockers, 'missing-chat-subject-hash');
    if (!isSha256Hex(folderSubjectId)) addBlocker(blockers, 'missing-folder-subject-hash');
    if (!isSha256Hex(perEnvelopeSalt)) addBlocker(blockers, 'missing-per-envelope-salt');
    if (blockers.length) {
      return buildResult({ blockers: blockers, warnings: warnings, privacy: inputPrivacy, observedAtIso: observedAtIso });
    }

    var legacyF13SubjectId = cleanLower(args.legacyF13SubjectId);
    if (!isSha256Hex(legacyF13SubjectId)) {
      legacyF13SubjectId = await sha256Hex('folderBinding:' + chatSubjectId + ':' + folderSubjectId);
    }

    var libraryBindingSubjectId = cleanLower(args.libraryBindingSubjectId);
    if (!isSha256Hex(libraryBindingSubjectId)) {
      libraryBindingSubjectId = await sha256Hex(canonicalJSON({
        subjectType: SUBJECT_TYPE,
        bindingKind: BINDING_KIND,
        leftSubjectId: chatSubjectId,
        rightSubjectId: folderSubjectId,
        perEnvelopeSalt: perEnvelopeSalt
      }));
    }

    var legacyF10SubjectId = cleanLower(args.legacyF10SubjectId);
    if (!isSha256Hex(legacyF10SubjectId)) {
      legacyF10SubjectId = await sha256Hex(canonicalJSON({
        legacyLayer: 'F10/F7-preview',
        bindingKind: BINDING_KIND,
        chatSubjectId: chatSubjectId,
        folderSubjectId: folderSubjectId
      }));
    }

    if (!isSha256Hex(legacyF13SubjectId) || !isSha256Hex(libraryBindingSubjectId) || !isSha256Hex(legacyF10SubjectId)) {
      addBlocker(blockers, 'library-folder-binding-shadow-identity-failed');
      return buildResult({ blockers: blockers, warnings: warnings, privacy: inputPrivacy, observedAtIso: observedAtIso });
    }

    var migrationDigest = await sha256Hex(canonicalJSON({
      legacyF10SubjectId: legacyF10SubjectId,
      legacyF13SubjectId: legacyF13SubjectId,
      libraryBindingSubjectId: libraryBindingSubjectId,
      chatSubjectId: chatSubjectId,
      folderSubjectId: folderSubjectId,
      bindingKind: BINDING_KIND
    }));
    if (!isSha256Hex(migrationDigest)) {
      addBlocker(blockers, 'library-folder-binding-shadow-digest-failed');
      return buildResult({ blockers: blockers, warnings: warnings, privacy: inputPrivacy, observedAtIso: observedAtIso });
    }

    var shadowEvent = {
      schema: SHADOW_SCHEMA,
      version: VERSION,
      legacyF10SubjectId: legacyF10SubjectId,
      legacyF13SubjectId: legacyF13SubjectId,
      libraryBindingSubjectId: libraryBindingSubjectId,
      chatSubjectId: chatSubjectId,
      folderSubjectId: folderSubjectId,
      bindingKind: BINDING_KIND,
      migrationDigest: migrationDigest,
      observedAtIso: observedAtIso
    };

    var outputPrivacy = scanPrivacy(shadowEvent, blockers, warnings);
    if (blockers.length) {
      return buildResult({ blockers: blockers, warnings: warnings, privacy: outputPrivacy, observedAtIso: observedAtIso });
    }

    for (var i = 0; i < shadowLedger.length; i++) {
      if (shadowLedger[i] && shadowLedger[i].migrationDigest === migrationDigest) {
        addWarning(warnings, 'library-folder-binding-shadow-already-present');
        return buildResult({
          created: false,
          alreadyPresent: true,
          shadowEvent: shadowLedger[i],
          row: shadowLedger[i],
          rows: shadowLedger.slice(),
          warnings: warnings,
          privacy: outputPrivacy,
          observedAtIso: observedAtIso
        });
      }
    }

    shadowLedger.push(shadowEvent);
    return buildResult({
      created: true,
      alreadyPresent: false,
      shadowEvent: shadowEvent,
      row: shadowEvent,
      rows: shadowLedger.slice(),
      warnings: warnings,
      privacy: outputPrivacy,
      observedAtIso: observedAtIso
    });
  }

  function listLibraryFolderBindingMigrationShadows(input) {
    var args = isObject(input) ? input : {};
    var rows = shadowLedger.slice();
    var digest = cleanLower(args.migrationDigest);
    if (isSha256Hex(digest)) {
      rows = rows.filter(function (row) { return row && row.migrationDigest === digest; });
    }
    return buildResult({
      created: false,
      alreadyPresent: false,
      rows: rows,
      rowCount: rows.length,
      observedAtIso: normalizeObservedAt(args.observedAtIso)
    });
  }

  function setF15FolderBindingDelegationEnabled(value) {
    H2O.Desktop.Sync.__enableF15FolderBindingDelegation = value === true;
    return {
      ok: true,
      enabled: H2O.Desktop.Sync.__enableF15FolderBindingDelegation === true,
      version: VERSION
    };
  }

  function isF15FolderBindingDelegationEnabled() {
    return H2O.Desktop.Sync.__enableF15FolderBindingDelegation === true;
  }

  if (typeof H2O.Desktop.Sync.__enableF15FolderBindingDelegation !== 'boolean') {
    H2O.Desktop.Sync.__enableF15FolderBindingDelegation = false;
  }
  H2O.Desktop.Sync.createLibraryFolderBindingMigrationShadow = createLibraryFolderBindingMigrationShadow;
  H2O.Desktop.Sync.listLibraryFolderBindingMigrationShadows = listLibraryFolderBindingMigrationShadows;
  H2O.Desktop.Sync.setF15FolderBindingDelegationEnabled = setF15FolderBindingDelegationEnabled;
  H2O.Desktop.Sync.isF15FolderBindingDelegationEnabled = isF15FolderBindingDelegationEnabled;
  H2O.Desktop.Sync.__libraryFolderBindingMigrationShadowInstalled = true;
  H2O.Desktop.Sync.__libraryFolderBindingMigrationShadowVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
