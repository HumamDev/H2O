/* H2O Desktop Sync - F15.8.d chats.category_id cache refresh bridge
 *
 * Settlement-callable bridge for the library.binding chat-category lane.
 * Source of truth remains library.binding; chats.category_id is only a
 * materialized read cache refreshed after a successful binding settlement.
 *
 * Safety invariants:
 *   - Handles only library.binding bindingKind === "chat-category".
 *   - Performs exactly one cache UPDATE through the supplied SQLite context.
 *   - Does not create bindings, mutate catalog state, publish, relay/outbox,
 *     call Native/F5, apply, write watermarks, or write consumed operations.
 *   - SQLite writer identity is a stub until F15.8.f; this module reports
 *     sqliteSentinelUsed:false and warns accordingly.
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
  if (H2O.Desktop.Sync.__chatCategoryCacheRefreshInstalled) return;

  var VERSION = '0.1.0-f15.8.cache';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-category-cache-refresh.v1';
  var PRIVACY_DOMAIN_TAG = 'library.binding';
  var EXPECTED_BINDING_KIND = 'chat-category';
  var WRITER_IDENTITY = 'f15.execute-settlement-writer';
  var SQL_SET = 'UPDATE chats SET category_id = ?, updated_at = ? WHERE id = ?';
  var SQL_CLEAR = 'UPDATE chats SET category_id = NULL, updated_at = ? WHERE id = ?';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isSha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return SHA256_RE.test(cleanLower(value));
  }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
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
    var kernel = H2O.Desktop.Sync.kernel || null;
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
  function webCryptoAvailable() {
    try { return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest); }
    catch (_) { return false; }
  }
  async function sha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var digest = await kernel.sha256Hex(value);
        if (isSha256Hex(digest)) return cleanLower(digest);
      } catch (_) { /* fall through */ }
    }
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJSON(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function sideEffectSummary(refreshed, storageWritten) {
    return {
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      applyExecuted: false,
      chatsCategoryIdCacheRefreshed: refreshed === true,
      sqliteSentinelUsed: false,
      storageWritten: storageWritten === true,
      storeShimRouted: false
    };
  }

  function buildResult(opts) {
    var o = safeObject(opts);
    var blockers = codeList(o.blockers);
    var refreshed = blockers.length === 0 && o.refreshed === true;
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0 && o.ok !== false,
      refreshed: refreshed,
      action: cleanString(o.action),
      bindingKind: cleanString(o.bindingKind),
      leftSubjectId: cleanLower(o.leftSubjectId),
      rightSubjectId: cleanLower(o.rightSubjectId),
      resolvedChatRowIdHash: cleanLower(o.resolvedChatRowIdHash),
      resolvedCategoryRowIdHash: cleanLower(o.resolvedCategoryRowIdHash),
      rowsAffected: Number(o.rowsAffected) || 0,
      cacheRevisionAdvanced: refreshed && o.cacheRevisionAdvanced === true,
      sqliteSentinelUsed: false,
      blockers: blockers,
      warnings: codeList(o.warnings),
      sideEffectSummary: sideEffectSummary(refreshed, refreshed && o.storageWritten === true),
      observedAtIso: cleanString(o.observedAtIso) || nowIsoSeconds()
    };
  }

  function blockedResult(opts) {
    var o = safeObject(opts);
    return buildResult(Object.assign({}, o, {
      ok: false,
      refreshed: false,
      cacheRevisionAdvanced: false,
      storageWritten: false
    }));
  }

  function scanPrivacy(target, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') {
      addCode(warnings, 'chat-category-cache-refresh-context-incomplete');
      return true;
    }
    try {
      var scan = kernel.scanDomainForbiddenFields(PRIVACY_DOMAIN_TAG, target);
      mergeCodes(blockers, scan && scan.blockers);
      mergeCodes(warnings, scan && scan.warnings);
      if (!scan || scan.ok !== true) {
        addCode(blockers, 'chat-category-cache-refresh-privacy-failed');
        return false;
      }
      return true;
    } catch (_) {
      addCode(blockers, 'chat-category-cache-refresh-privacy-failed');
      return false;
    }
  }

  async function withWriterIdentity(identity, fn) {
    return await fn(identity);
  }

  function extractActorPeer(input) {
    var source = safeObject(input);
    var envelope = safeObject(source.envelope);
    var receipt = safeObject(source.receipt);
    var bookkeepingRow = safeObject(source.bookkeepingRow);
    return safeObject(source.actorPeer || envelope.actorPeer || receipt.actorPeer || bookkeepingRow.actorPeer);
  }

  function extractContext(input) {
    var source = safeObject(input);
    var envelope = safeObject(source.envelope);
    var receipt = safeObject(source.receipt);
    var bookkeepingRow = safeObject(source.bookkeepingRow);
    var settlement = safeObject(envelope.settlementShapes);
    var receiptCanonical = safeObject(receipt.canonicalBinding);
    var receiptTarget = safeObject(receipt.expectedTargetState);
    var receiptCurrent = safeObject(receipt.expectedCurrentState);
    var receiptPayload = safeObject(safeObject(receipt.applyEvent).payload);
    var rowTarget = safeObject(bookkeepingRow.expectedTargetState);
    var rowCurrent = safeObject(bookkeepingRow.expectedCurrentState);
    var leftSubjectId = cleanLower(source.leftSubjectId) || cleanLower(settlement.leftSubjectId) ||
      cleanLower(receiptCanonical.leftSubjectId) || cleanLower(receiptTarget.leftSubjectId) ||
      cleanLower(receiptCurrent.leftSubjectId) || cleanLower(receiptPayload.leftSubjectId) ||
      cleanLower(bookkeepingRow.leftSubjectId) || cleanLower(rowTarget.leftSubjectId) ||
      cleanLower(rowCurrent.leftSubjectId);
    var rightSubjectId = cleanLower(source.rightSubjectId) || cleanLower(settlement.rightSubjectId) ||
      cleanLower(receiptCanonical.rightSubjectId) || cleanLower(receiptTarget.rightSubjectId) ||
      cleanLower(receiptCurrent.rightSubjectId) || cleanLower(receiptPayload.rightSubjectId) ||
      cleanLower(bookkeepingRow.rightSubjectId) || cleanLower(rowTarget.rightSubjectId) ||
      cleanLower(rowCurrent.rightSubjectId);
    var bindingKind = cleanString(source.bindingKind) || cleanString(settlement.bindingKind) ||
      cleanString(receiptCanonical.bindingKind) || cleanString(receiptTarget.bindingKind) ||
      cleanString(receiptPayload.bindingKind) || cleanString(bookkeepingRow.bindingKind);
    var bindingState = cleanString(source.bindingState) ||
      cleanString(safeObject(settlement.expectedTargetState).bindingState) ||
      cleanString(receiptTarget.bindingState) || cleanString(receiptPayload.bindingState) ||
      cleanString(bookkeepingRow.bindingState);
    var categoryCacheAction = cleanString(source.categoryCacheAction) ||
      cleanString(settlement.categoryCacheAction);
    return {
      envelope: envelope,
      receipt: receipt,
      bookkeepingRow: bookkeepingRow,
      leftSubjectId: leftSubjectId,
      rightSubjectId: rightSubjectId,
      bindingKind: bindingKind,
      bindingState: bindingState,
      categoryCacheAction: categoryCacheAction,
      originAccountIdHash: cleanLower(source.originAccountIdHash) ||
        cleanLower(envelope.originAccountIdHash) || cleanLower(receipt.originAccountIdHash) ||
        cleanLower(bookkeepingRow.originAccountIdHash),
      actorPeer: extractActorPeer(input)
    };
  }

  function sanitizeEnvelopeContext(context) {
    var envelope = safeObject(context.envelope);
    var receipt = safeObject(context.receipt);
    var row = safeObject(context.bookkeepingRow);
    var settlement = safeObject(envelope.settlementShapes);
    return {
      schema: RESULT_SCHEMA,
      redactionClass: 'redacted',
      envelopeSchema: cleanString(envelope.schema),
      envelopeDomainId: cleanString(envelope.domainId),
      envelopeOperationKind: cleanString(envelope.operationKind),
      envelopeSubjectId: cleanLower(envelope.subjectId),
      envelopeLineageId: cleanLower(envelope.lineageId),
      envelopeDedupeKey: cleanLower(envelope.dedupeKey),
      settlementDigest: cleanLower(settlement.settlementDigest),
      requiresCategoryCacheRefresh: settlement.requiresCategoryCacheRefresh === true,
      categoryCacheAction: context.categoryCacheAction,
      receiptSchema: cleanString(receipt.schema),
      receiptDigest: cleanLower(receipt.receiptDigest),
      bookkeepingRowSchema: cleanString(row.schema),
      bookkeepingRowId: cleanLower(row.rowId),
      bindingKind: context.bindingKind,
      bindingState: context.bindingState,
      leftSubjectId: context.leftSubjectId,
      rightSubjectId: context.rightSubjectId,
      originAccountIdHash: context.originAccountIdHash,
      actorPeer: context.actorPeer
    };
  }

  function readValue(container, keys, subjectId) {
    var source = safeObject(container);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (!isObject(source[key])) continue;
      if (Object.prototype.hasOwnProperty.call(source[key], subjectId)) {
        return source[key][subjectId];
      }
    }
    return null;
  }

  function readFromRows(rows, subjectId) {
    for (var i = 0; i < rows.length; i++) {
      var row = safeObject(rows[i]);
      var rowSubject = cleanLower(row.subjectId || row.subject_id || row.canonicalSubjectId);
      if (rowSubject !== subjectId) continue;
      return row.rowId || row.row_id || row.id || row.chatRowId || row.categoryRowId || null;
    }
    return null;
  }

  async function invokeResolver(fn, subjectId) {
    var value = await fn(subjectId);
    if (isObject(value)) {
      return value.rowId || value.row_id || value.id || value.chatRowId || value.categoryRowId || null;
    }
    return value;
  }

  async function resolveChatRowId(subjectId, resolverContext, warnings) {
    var context = safeObject(resolverContext);
    var names = ['resolveChatRowId', 'resolveChatRow', 'resolveRowId', 'resolveSubjectRowId'];
    for (var i = 0; i < names.length; i++) {
      if (typeof context[names[i]] !== 'function') continue;
      var resolved = await invokeResolver(context[names[i]], subjectId);
      if (cleanString(resolved)) return { rowId: cleanString(resolved), fallback: false };
    }
    var mapped = readValue(context, [
      'chatSubjectIdToRowId',
      'chatSubjectMap',
      'subjectIdToRowId',
      'subjectMap'
    ], subjectId);
    if (mapped) {
      addCode(warnings, 'chat-category-cache-refresh-resolver-fallback');
      return { rowId: cleanString(isObject(mapped) ? (mapped.rowId || mapped.row_id || mapped.id) : mapped), fallback: true };
    }
    var fromRows = readFromRows(asArray(context.chats || context.chatRows), subjectId);
    if (fromRows) {
      addCode(warnings, 'chat-category-cache-refresh-resolver-fallback');
      return { rowId: cleanString(fromRows), fallback: true };
    }
    return { rowId: '', fallback: false };
  }

  async function resolveCategoryRowId(subjectId, resolverContext, warnings) {
    var context = safeObject(resolverContext);
    var names = ['resolveCategoryRowId', 'resolveCategoryRow'];
    for (var i = 0; i < names.length; i++) {
      if (typeof context[names[i]] !== 'function') continue;
      var resolved = await invokeResolver(context[names[i]], subjectId);
      if (cleanString(resolved)) return { rowId: cleanString(resolved), fallback: false };
    }
    var mapped = readValue(context, [
      'categorySubjectIdToRowId',
      'categorySubjectMap',
      'subjectIdToRowId',
      'subjectMap'
    ], subjectId);
    if (mapped) {
      addCode(warnings, 'chat-category-cache-refresh-resolver-fallback');
      return { rowId: cleanString(isObject(mapped) ? (mapped.rowId || mapped.row_id || mapped.id) : mapped), fallback: true };
    }
    var fromRows = readFromRows(asArray(context.categories || context.categoryRows), subjectId);
    if (fromRows) {
      addCode(warnings, 'chat-category-cache-refresh-resolver-fallback');
      return { rowId: cleanString(fromRows), fallback: true };
    }
    return { rowId: '', fallback: false };
  }

  function resolveWriterIdentity(input) {
    var identity = input.writerIdentity;
    if (isObject(identity)) {
      identity = identity.identity || identity.writerIdentity || identity.id || identity.name;
    }
    return cleanString(identity) || WRITER_IDENTITY;
  }

  function getSqlExecutor(sqliteContext) {
    var context = safeObject(sqliteContext);
    var names = ['execute', 'sqlExecute', 'run', 'executeSql'];
    for (var i = 0; i < names.length; i++) {
      if (typeof context[names[i]] === 'function') return context[names[i]].bind(context);
    }
    if (typeof sqliteContext === 'function') return sqliteContext;
    return null;
  }

  function readRowsAffected(result, sqliteContext) {
    if (Array.isArray(result)) return Number(result[0]) || 0;
    if (typeof result === 'number') return result;
    if (isObject(result)) {
      if (result.rowsAffected != null) return Number(result.rowsAffected) || 0;
      if (result.rows_affected != null) return Number(result.rows_affected) || 0;
      if (result.affectedRows != null) return Number(result.affectedRows) || 0;
      if (result.affected != null) return Number(result.affected) || 0;
      if (result.changes != null) return Number(result.changes) || 0;
      if (isObject(result.result)) return readRowsAffected(result.result, sqliteContext);
    }
    var context = safeObject(sqliteContext);
    if (context.mockRowsAffected != null) return Number(context.mockRowsAffected) || 0;
    return 0;
  }

  async function executeSql(sqliteContext, query, values) {
    var executor = getSqlExecutor(sqliteContext);
    if (executor) {
      var executed = await executor(query, values);
      return {
        result: executed,
        rowsAffected: readRowsAffected(executed, sqliteContext),
        executed: true
      };
    }
    if (safeObject(sqliteContext).mockRowsAffected != null) {
      return {
        result: { mock: true, rowsAffected: Number(safeObject(sqliteContext).mockRowsAffected) || 0 },
        rowsAffected: Number(safeObject(sqliteContext).mockRowsAffected) || 0,
        executed: true
      };
    }
    return { result: null, rowsAffected: 0, executed: false };
  }

  async function refreshChatCategoryCache(input) {
    var args = safeObject(input);
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    var warnings = ['sqlite-writer-identity-sentinel-stubbed'];
    var blockers = [];
    var context = extractContext(args);
    var action = cleanString(context.categoryCacheAction);
    var bindingKind = cleanString(context.bindingKind);
    var leftSubjectId = cleanLower(context.leftSubjectId);
    var rightSubjectId = cleanLower(context.rightSubjectId);

    if (!isObject(input)) addCode(blockers, 'chat-category-cache-refresh-context-incomplete');
    if (bindingKind !== EXPECTED_BINDING_KIND) {
      addCode(blockers, 'chat-category-cache-refresh-invalid-binding-kind');
    }
    if (action !== 'set' && action !== 'clear') {
      addCode(blockers, 'chat-category-cache-refresh-invalid-action');
    }
    if (!isSha256Hex(leftSubjectId) || !isSha256Hex(rightSubjectId)) {
      addCode(blockers, 'chat-category-cache-refresh-resolver-failed');
    }
    var writerIdentity = resolveWriterIdentity(args);
    if (writerIdentity !== WRITER_IDENTITY) {
      addCode(blockers, 'chat-category-cache-refresh-sentinel-not-active');
    }

    scanPrivacy(sanitizeEnvelopeContext(context), blockers, warnings);
    if (blockers.length) {
      return blockedResult({
        action: action,
        bindingKind: bindingKind,
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var chatResolved;
    var categoryResolved = { rowId: '', fallback: false };
    try {
      chatResolved = await resolveChatRowId(leftSubjectId, args.resolverContext, warnings);
      if (action === 'set') {
        categoryResolved = await resolveCategoryRowId(rightSubjectId, args.resolverContext, warnings);
      }
    } catch (_) {
      addCode(blockers, 'chat-category-cache-refresh-resolver-failed');
    }
    if (!chatResolved || !cleanString(chatResolved.rowId)) {
      addCode(blockers, 'chat-category-cache-refresh-chat-row-not-found');
    }
    if (action === 'set' && (!categoryResolved || !cleanString(categoryResolved.rowId))) {
      addCode(blockers, 'chat-category-cache-refresh-category-row-not-found');
    }
    if (blockers.length) {
      return blockedResult({
        action: action,
        bindingKind: bindingKind,
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var chatRowId = cleanString(chatResolved.rowId);
    var categoryRowId = cleanString(categoryResolved && categoryResolved.rowId);
    var chatRowIdHash = await sha256Hex(chatRowId);
    var categoryRowIdHash = categoryRowId ? await sha256Hex(categoryRowId) : '';
    var writeRequestMetadata = {
      schema: RESULT_SCHEMA,
      redactionClass: 'redacted',
      action: action,
      bindingKind: bindingKind,
      leftSubjectId: leftSubjectId,
      rightSubjectId: rightSubjectId,
      resolvedChatRowIdHash: chatRowIdHash,
      resolvedCategoryRowIdHash: categoryRowIdHash,
      queryKind: action === 'set' ? 'chat-category-cache-set' : 'chat-category-cache-clear',
      valueCount: action === 'set' ? 3 : 2,
      observedAtIso: observedAtIso
    };
    scanPrivacy(writeRequestMetadata, blockers, warnings);
    if (blockers.length) {
      return blockedResult({
        action: action,
        bindingKind: bindingKind,
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        resolvedChatRowIdHash: chatRowIdHash,
        resolvedCategoryRowIdHash: categoryRowIdHash,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      });
    }

    var query = action === 'set' ? SQL_SET : SQL_CLEAR;
    var values = action === 'set'
      ? [categoryRowId, observedAtIso, chatRowId]
      : [observedAtIso, chatRowId];
    var sqlResult = null;
    try {
      sqlResult = await withWriterIdentity(WRITER_IDENTITY, async function () {
        return await executeSql(args.sqliteContext, query, values);
      });
    } catch (_) {
      addCode(blockers, 'chat-category-cache-refresh-update-failed');
    }
    if (!sqlResult || sqlResult.executed !== true) {
      addCode(blockers, 'chat-category-cache-refresh-update-failed');
    }
    var rowsAffected = sqlResult ? Number(sqlResult.rowsAffected) || 0 : 0;
    if (rowsAffected <= 0) {
      addCode(blockers, 'chat-category-cache-refresh-zero-rows-affected');
    }

    var result = blockers.length
      ? blockedResult({
        action: action,
        bindingKind: bindingKind,
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        resolvedChatRowIdHash: chatRowIdHash,
        resolvedCategoryRowIdHash: categoryRowIdHash,
        rowsAffected: rowsAffected,
        blockers: blockers,
        warnings: warnings,
        observedAtIso: observedAtIso
      })
      : buildResult({
        ok: true,
        refreshed: true,
        action: action,
        bindingKind: bindingKind,
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        resolvedChatRowIdHash: chatRowIdHash,
        resolvedCategoryRowIdHash: categoryRowIdHash,
        rowsAffected: rowsAffected,
        cacheRevisionAdvanced: true,
        storageWritten: true,
        blockers: [],
        warnings: warnings,
        observedAtIso: observedAtIso
      });

    var finalBlockers = [];
    var finalWarnings = result.warnings.slice();
    scanPrivacy(result, finalBlockers, finalWarnings);
    if (finalBlockers.length) {
      mergeCodes(finalBlockers, result.blockers);
      return blockedResult({
        action: action,
        bindingKind: bindingKind,
        leftSubjectId: leftSubjectId,
        rightSubjectId: rightSubjectId,
        resolvedChatRowIdHash: chatRowIdHash,
        resolvedCategoryRowIdHash: categoryRowIdHash,
        rowsAffected: rowsAffected,
        blockers: finalBlockers,
        warnings: finalWarnings,
        observedAtIso: observedAtIso
      });
    }
    return result;
  }

  H2O.Desktop.Sync.refreshChatCategoryCache = refreshChatCategoryCache;
  H2O.Desktop.Sync.__chatCategoryCacheRefreshInstalled = true;
  H2O.Desktop.Sync.__chatCategoryCacheRefreshVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
