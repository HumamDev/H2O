/* H2O Desktop Sync - F15.11.a folder binding bridge diagnostic
 *
 * Read-only diagnostic that maps current F7 folder bindings into the future
 * F15 library.binding chat-folder identity model. It computes redacted F13
 * and F15 identities from supplied subject hashes only.
 *
 * Public API:
 *   H2O.Desktop.Sync.runLibraryFolderBindingBridgeDiagnostic(input)
 *   H2O.Desktop.Sync.__libraryFolderBindingBridgeDiagnosticInstalled
 *   H2O.Desktop.Sync.__libraryFolderBindingBridgeDiagnosticVersion
 *
 * Safety invariants:
 *   - No wrapper delegation.
 *   - No chat-folder enablement.
 *   - No F7 deletion or behavior change.
 *   - No folder store writes, SQLite writes, execute/settlement changes, or UI.
 *   - Optional store inspection reads safe API presence and diagnose metadata
 *     only; it never enumerates or emits raw folder rows.
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
  if (H2O.Desktop.Sync.__libraryFolderBindingBridgeDiagnosticInstalled) return;

  var VERSION = '0.1.0-f15.11.a';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-folder-binding-bridge-diagnostic.v1';
  var SUBJECT_TYPE = 'library.binding';
  var BINDING_KIND = 'chat-folder';
  var CHAT_SUBJECT_TYPE = 'chat.metadata';
  var FOLDER_SUBJECT_TYPE = 'folder.metadata';
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
    'session_token'
  ];

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
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

  function firstString(input, names) {
    if (!isObject(input)) return '';
    for (var i = 0; i < names.length; i++) {
      var value = input[names[i]];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function normalizeSubjectCollection(value) {
    var set = Object.create(null);
    function add(candidate) {
      var hash = cleanLower(candidate);
      if (isSha256Hex(hash)) set[hash] = true;
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var entry = value[i];
        if (typeof entry === 'string') add(entry);
        else if (isObject(entry)) {
          add(entry.subjectId);
          add(entry.chatSubjectId);
          add(entry.folderSubjectId);
          add(entry.leftSubjectId);
          add(entry.rightSubjectId);
        }
      }
    } else if (isObject(value)) {
      Object.keys(value).forEach(function (key) {
        add(key);
        var entry = value[key];
        if (typeof entry === 'string') add(entry);
        else if (isObject(entry)) {
          add(entry.subjectId);
          add(entry.chatSubjectId);
          add(entry.folderSubjectId);
          add(entry.leftSubjectId);
          add(entry.rightSubjectId);
        }
      });
    }
    return set;
  }

  function subjectPresent(set, supplied, subjectId) {
    if (!supplied) return true;
    return !!set[cleanLower(subjectId)];
  }

  function scanForbiddenKeys(value, path, hits) {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) scanForbiddenKeys(value[i], path + '[' + i + ']', hits);
      return;
    }
    if (!isObject(value)) return;
    Object.keys(value).forEach(function (key) {
      var nextPath = path ? path + '.' + key : key;
      if (FORBIDDEN_RAW_FIELD_KEYS.indexOf(key) !== -1) {
        hits.push({ field: key, path: nextPath });
      }
      scanForbiddenKeys(value[key], nextPath, hits);
    });
  }

  function hitNamesFromDomainScan(scan) {
    var hits = Array.isArray(scan && scan.forbiddenFields)
      ? scan.forbiddenFields
      : (Array.isArray(scan && scan.hits) ? scan.hits : []);
    return hits.map(function (hit) {
      return isObject(hit) ? cleanString(hit.fieldName || hit.fieldPath || hit.field) : cleanString(hit);
    }).filter(Boolean);
  }

  function scanPrivacy(target) {
    var hits = [];
    scanForbiddenKeys(target, '', hits);
    var kernel = getKernel();
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scan = kernel.scanDomainForbiddenFields('library.binding', isObject(target)
          ? Object.assign({}, target, { redactionClass: 'redacted' })
          : target);
        if (scan && scan.ok === false) {
          hitNamesFromDomainScan(scan).forEach(function (name) {
            hits.push({ field: name, path: name });
          });
        }
      } catch (_) { /* local scan is authoritative for this bridge */ }
    }
    var deduped = [];
    var seen = Object.create(null);
    for (var i = 0; i < hits.length; i++) {
      var field = cleanString(hits[i] && hits[i].field);
      if (!field || seen[field]) continue;
      seen[field] = true;
      deduped.push({ field: field });
    }
    return {
      ok: deduped.length === 0,
      leakCount: deduped.length,
      forbiddenFields: deduped
    };
  }

  function activeRow(row) {
    if (!isObject(row)) return false;
    var status = cleanLower(row.status || row.bindingState || row.state);
    if (row.active === false) return false;
    return status !== 'unbound' && status !== 'deleted' && status !== 'removed' && status !== 'inactive';
  }

  function rowChatSubjectId(row) {
    return cleanLower(firstString(row, ['chatSubjectId', 'leftSubjectId']));
  }

  function rowFolderSubjectId(row) {
    return cleanLower(firstString(row, ['folderSubjectId', 'rightSubjectId']));
  }

  function rowLegacyF10SubjectId(row) {
    var value = cleanLower(firstString(row, ['legacyF10SubjectId', 'legacyPreviewSubjectId']));
    return isSha256Hex(value) ? value : '';
  }

  function rowLegacyF13SubjectId(row) {
    var value = cleanLower(firstString(row, ['legacyF13SubjectId', 'bindingSubjectId']));
    return isSha256Hex(value) ? value : '';
  }

  function rowLibraryBindingSubjectId(row) {
    var value = cleanLower(firstString(row, ['libraryBindingSubjectId', 'subjectId']));
    return isSha256Hex(value) ? value : '';
  }

  function inspectFolderStoreReadApis(input, warnings) {
    if (!input || input.inspectStoreReadApis !== true) return null;
    var folders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
    if (!folders) {
      addWarning(warnings, 'folder-store-read-api-unavailable');
      return { available: false };
    }
    var observation = {
      available: true,
      hasDiagnose: typeof folders.diagnose === 'function',
      hasGetAll: typeof folders.getAll === 'function',
      hasList: typeof folders.list === 'function',
      hasListChats: typeof folders.listChats === 'function',
      hasListForChat: typeof folders.listForChat === 'function',
      hasCount: typeof folders.count === 'function'
    };
    if (observation.hasDiagnose) {
      try {
        var diag = folders.diagnose();
        observation.installed = !!(diag && diag.installed);
        observation.ready = !!(diag && diag.ready);
        observation.backend = cleanString(diag && diag.backend);
      } catch (_) {
        addWarning(warnings, 'folder-store-diagnose-read-failed');
      }
    }
    return observation;
  }

  function buildResult(fields) {
    var blockers = asArray(fields.blockers);
    var warnings = asArray(fields.warnings);
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      rowCount: fields.rowCount || 0,
      mappedCount: fields.mappedCount || 0,
      duplicateCount: fields.duplicateCount || 0,
      cardinalityViolationCount: fields.cardinalityViolationCount || 0,
      missingSubjectCount: fields.missingSubjectCount || 0,
      malformedHashCount: fields.malformedHashCount || 0,
      identityMismatchCount: fields.identityMismatchCount || 0,
      mappings: asArray(fields.mappings),
      blockers: blockers,
      warnings: warnings,
      privacy: fields.privacy || { ok: true, leakCount: 0, forbiddenFields: [] },
      storeReadApiObservation: fields.storeReadApiObservation || null,
      sideEffectSummary: sideEffectSummary(),
      observedAtIso: fields.observedAtIso || nowIsoSeconds()
    };
  }

  async function buildMapping(row, index, context, counts, blockers, warnings) {
    var rowBlockers = [];
    var rowWarnings = [];
    var chatSubjectId = rowChatSubjectId(row);
    var folderSubjectId = rowFolderSubjectId(row);
    var salt = cleanString(row.perEnvelopeSalt) || context.perEnvelopeSalt;

    if (!chatSubjectId) {
      counts.missingSubjectCount += 1;
      addBlocker(rowBlockers, 'missing-chat-subject-hash');
    } else if (!isSha256Hex(chatSubjectId)) {
      counts.malformedHashCount += 1;
      addBlocker(rowBlockers, 'malformed-chat-subject-hash');
    } else if (!subjectPresent(context.chatSubjectSet, context.chatSubjectsSupplied, chatSubjectId)) {
      counts.missingSubjectCount += 1;
      addBlocker(rowBlockers, 'missing-chat-subject-hash');
    }

    if (!folderSubjectId) {
      counts.missingSubjectCount += 1;
      addBlocker(rowBlockers, 'missing-folder-subject-hash');
    } else if (!isSha256Hex(folderSubjectId)) {
      counts.malformedHashCount += 1;
      addBlocker(rowBlockers, 'malformed-folder-subject-hash');
    } else if (!subjectPresent(context.folderSubjectSet, context.folderSubjectsSupplied, folderSubjectId)) {
      counts.missingSubjectCount += 1;
      addBlocker(rowBlockers, 'missing-folder-subject-hash');
    }

    if (!salt) {
      addBlocker(rowBlockers, 'missing-per-envelope-salt');
    }

    var suppliedLegacyF10SubjectId = firstString(row, ['legacyF10SubjectId', 'legacyPreviewSubjectId']);
    if (suppliedLegacyF10SubjectId && !isSha256Hex(suppliedLegacyF10SubjectId)) {
      counts.malformedHashCount += 1;
      addBlocker(rowBlockers, 'malformed-legacy-f10-subject-hash');
    }

    var suppliedLegacyF13SubjectId = firstString(row, ['legacyF13SubjectId', 'bindingSubjectId']);
    if (suppliedLegacyF13SubjectId && !isSha256Hex(suppliedLegacyF13SubjectId)) {
      counts.malformedHashCount += 1;
      addBlocker(rowBlockers, 'malformed-legacy-f13-subject-hash');
    }

    var suppliedLibraryBindingSubjectId = firstString(row, ['libraryBindingSubjectId', 'subjectId']);
    if (suppliedLibraryBindingSubjectId && !isSha256Hex(suppliedLibraryBindingSubjectId)) {
      counts.malformedHashCount += 1;
      addBlocker(rowBlockers, 'malformed-library-binding-subject-hash');
    }

    if (rowBlockers.length > 0) {
      rowBlockers.forEach(function (entry) { addBlocker(blockers, entry.code, { rowIndex: index }); });
      rowWarnings.forEach(function (entry) { addWarning(warnings, entry.code, { rowIndex: index }); });
      return null;
    }

    var legacyF13SubjectId = await sha256Hex('folderBinding:' + chatSubjectId + ':' + folderSubjectId);
    var libraryBindingSubjectId = await sha256Hex(canonicalJSON({
      subjectType: SUBJECT_TYPE,
      bindingKind: BINDING_KIND,
      leftSubjectId: chatSubjectId,
      rightSubjectId: folderSubjectId,
      perEnvelopeSalt: salt
    }));
    if (!isSha256Hex(legacyF13SubjectId) || !isSha256Hex(libraryBindingSubjectId)) {
      counts.malformedHashCount += 1;
      addBlocker(blockers, 'library-folder-binding-bridge-identity-derivation-failed', { rowIndex: index });
      return null;
    }

    var identityMismatch = false;
    var suppliedF13 = rowLegacyF13SubjectId(row);
    var suppliedF15 = rowLibraryBindingSubjectId(row);
    if (suppliedF13 && suppliedF13 !== legacyF13SubjectId) identityMismatch = true;
    if (suppliedF15 && suppliedF15 !== libraryBindingSubjectId) identityMismatch = true;
    if (identityMismatch) {
      counts.identityMismatchCount += 1;
      addBlocker(blockers, 'library-folder-binding-bridge-identity-mismatch', { rowIndex: index });
    }

    var legacyF10SubjectId = rowLegacyF10SubjectId(row) || null;
    var migrationDigest = await sha256Hex(canonicalJSON({
      legacyF10SubjectId: legacyF10SubjectId,
      legacyF13SubjectId: legacyF13SubjectId,
      libraryBindingSubjectId: libraryBindingSubjectId,
      chatSubjectId: chatSubjectId,
      folderSubjectId: folderSubjectId,
      bindingKind: BINDING_KIND
    }));
    if (!isSha256Hex(migrationDigest)) {
      counts.malformedHashCount += 1;
      addBlocker(blockers, 'library-folder-binding-bridge-migration-digest-failed', { rowIndex: index });
      return null;
    }

    return {
      legacyF10SubjectId: legacyF10SubjectId,
      legacyF13SubjectId: legacyF13SubjectId,
      libraryBindingSubjectId: libraryBindingSubjectId,
      chatSubjectId: chatSubjectId,
      folderSubjectId: folderSubjectId,
      bindingKind: BINDING_KIND,
      leftSubjectType: CHAT_SUBJECT_TYPE,
      rightSubjectType: FOLDER_SUBJECT_TYPE,
      migrationDigest: migrationDigest,
      status: identityMismatch ? 'identity-mismatch' : 'mapped'
    };
  }

  async function runLibraryFolderBindingBridgeDiagnostic(input) {
    var source = isObject(input) ? input : {};
    var observedAtIso = normalizeObservedAt(source.observedAtIso);
    var blockers = [];
    var warnings = [];
    var rows = asArray(source.folderBindings);
    var inputPrivacy = scanPrivacy(source);
    if (!inputPrivacy.ok) {
      addBlocker(blockers, 'library-folder-binding-bridge-privacy-failed');
    }
    if (!rows.length) {
      addWarning(warnings, 'no-folder-bindings-supplied');
    }

    var context = {
      perEnvelopeSalt: cleanString(source.perEnvelopeSalt),
      chatSubjectSet: normalizeSubjectCollection(source.chatSubjects),
      folderSubjectSet: normalizeSubjectCollection(source.folderSubjects),
      chatSubjectsSupplied: Array.isArray(source.chatSubjects) || isObject(source.chatSubjects),
      folderSubjectsSupplied: Array.isArray(source.folderSubjects) || isObject(source.folderSubjects)
    };
    if (!context.chatSubjectsSupplied) addWarning(warnings, 'chat-subject-context-missing');
    if (!context.folderSubjectsSupplied) addWarning(warnings, 'folder-subject-context-missing');

    var storeReadApiObservation = inspectFolderStoreReadApis(source, warnings);
    var counts = {
      missingSubjectCount: 0,
      malformedHashCount: 0,
      identityMismatchCount: 0
    };
    var mappings = [];
    var activeByChat = Object.create(null);

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!isObject(row)) {
        counts.malformedHashCount += 1;
        addBlocker(blockers, 'folder-binding-row-invalid', { rowIndex: i });
        continue;
      }
      var mapping = await buildMapping(row, i, context, counts, blockers, warnings);
      if (!mapping) continue;
      if (activeRow(row)) {
        var key = mapping.chatSubjectId;
        if (!activeByChat[key]) activeByChat[key] = [];
        activeByChat[key].push(mapping);
      }
      mappings.push(mapping);
    }

    var duplicateCount = 0;
    var cardinalityViolationCount = 0;
    Object.keys(activeByChat).forEach(function (chatSubjectId) {
      var group = activeByChat[chatSubjectId] || [];
      if (group.length <= 1) return;
      cardinalityViolationCount += 1;
      duplicateCount += group.length - 1;
      group.forEach(function (mapping) {
        mapping.status = 'cardinality-conflict';
      });
    });
    if (cardinalityViolationCount > 0) {
      addBlocker(blockers, 'chat-folder-conflict', {
        cardinalityViolationCount: cardinalityViolationCount,
        duplicateCount: duplicateCount
      });
    }

    var outputPrivacyTarget = {
      mappings: mappings,
      rowCount: rows.length,
      mappedCount: mappings.length,
      duplicateCount: duplicateCount,
      cardinalityViolationCount: cardinalityViolationCount,
      missingSubjectCount: counts.missingSubjectCount,
      malformedHashCount: counts.malformedHashCount,
      identityMismatchCount: counts.identityMismatchCount
    };
    var outputPrivacy = scanPrivacy(outputPrivacyTarget);
    if (!outputPrivacy.ok) {
      addBlocker(blockers, 'library-folder-binding-bridge-output-privacy-failed');
    }

    var privacy = {
      ok: inputPrivacy.ok && outputPrivacy.ok,
      leakCount: inputPrivacy.leakCount + outputPrivacy.leakCount,
      forbiddenFields: inputPrivacy.forbiddenFields.concat(outputPrivacy.forbiddenFields)
    };

    return buildResult({
      rowCount: rows.length,
      mappedCount: mappings.length,
      duplicateCount: duplicateCount,
      cardinalityViolationCount: cardinalityViolationCount,
      missingSubjectCount: counts.missingSubjectCount,
      malformedHashCount: counts.malformedHashCount,
      identityMismatchCount: counts.identityMismatchCount,
      mappings: mappings,
      blockers: blockers,
      warnings: warnings,
      privacy: privacy,
      storeReadApiObservation: storeReadApiObservation,
      observedAtIso: observedAtIso
    });
  }

  H2O.Desktop.Sync.runLibraryFolderBindingBridgeDiagnostic = runLibraryFolderBindingBridgeDiagnostic;
  H2O.Desktop.Sync.__libraryFolderBindingBridgeDiagnosticInstalled = true;
  H2O.Desktop.Sync.__libraryFolderBindingBridgeDiagnosticVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
