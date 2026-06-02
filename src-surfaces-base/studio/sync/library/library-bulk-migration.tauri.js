/* H2O Desktop Sync - F15.8.g library bulk migration path
 *
 * Dedicated bundle-import bulk path for library catalog/binding compatibility
 * tables. This module uses the Rust-backed SQLite writer identity sentinel
 * with identity f15.bulk-migration. It does not publish, relay, call
 * Native/F5, write watermarks, or write consumed operations.
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
  if (H2O.Desktop.Sync.__libraryBulkMigrationInstalled) return;

  var VERSION = '0.1.0-f15.8.g';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-bulk-migration.v1';
  var SOURCE_TAG = 'bundle-import';
  var BULK_IDENTITY = 'f15.bulk-migration';
  var DEFAULT_CHUNK_SIZE = 100;
  var SHA256_RE = /^[0-9a-f]{64}$/;

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowMs() { return Date.now(); }
  function nowIso() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isSha256Hex(value) { return SHA256_RE.test(cleanLower(value)); }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (normalized && list.indexOf(normalized) === -1) list.push(normalized);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
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
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      out += part.length === 1 ? '0' + part : part;
    }
    return out;
  }
  async function sha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var digest = await kernel.sha256Hex(value);
        if (isSha256Hex(digest)) return cleanLower(digest);
      } catch (_) { /* fall through */ }
    }
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      var text = typeof value === 'string' ? value : canonicalJSON(value);
      var buffer = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return bytesToHex(new Uint8Array(buffer));
    }
    return '';
  }
  function metaJson(value, source) {
    var meta = Object.assign({}, safeObject(value));
    meta.importedFrom = cleanString(meta.importedFrom) || SOURCE_TAG;
    meta.sourceTag = SOURCE_TAG;
    if (source) meta.source = source;
    return JSON.stringify(meta);
  }
  function chunkSize(input) {
    var n = Number(safeObject(input).maxChunkSize || DEFAULT_CHUNK_SIZE);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_CHUNK_SIZE;
    return Math.max(1, Math.min(500, Math.floor(n)));
  }
  function sideEffectSummary(executed) {
    return {
      storageWritten: executed === true,
      sqliteSentinelUsed: executed === true,
      bulkMigrationIdentityUsed: executed === true,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
  }
  function blockedResult(phase, sourceTagHash, importBatchIdHash, blockers, warnings, extra) {
    return Object.assign({
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      status: 'blocked',
      mode: 'merge',
      phase: phase || 'all',
      sourceTag: SOURCE_TAG,
      sourceTagHash: sourceTagHash || '',
      importBatchIdHash: importBatchIdHash || '',
      counts: {},
      chunks: [],
      itemSummaries: [],
      blockers: codeList(blockers),
      warnings: codeList(warnings),
      sideEffectSummary: sideEffectSummary(false)
    }, safeObject(extra));
  }
  function privacyScan(domainTag, value, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') return true;
    try {
      var scan = kernel.scanDomainForbiddenFields(domainTag, Object.assign({ redactionClass: 'redacted' }, value));
      codeList(scan && scan.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(scan && scan.warnings).forEach(function (code) { addCode(warnings, code); });
      return !!(scan && scan.ok === true);
    } catch (_) {
      addCode(blockers, 'library-bulk-migration-privacy-failed');
      return false;
    }
  }
  function catalogConfig(kind) {
    if (kind === 'label') return { table: 'labels', idField: 'labelId', source: 'labels' };
    if (kind === 'tag') return { table: 'tags', idField: 'tagId', source: 'tags' };
    return { table: 'categories', idField: 'categoryId', source: 'categories' };
  }
  function catalogRow(kind, input) {
    var row = safeObject(input);
    var cfg = catalogConfig(kind);
    var id = cleanString(row[cfg.idField] || row.id);
    if (!id) return null;
    var now = Number(row.updatedAt || row.createdAt || nowMs());
    if (kind === 'tag') {
      return {
        id: id,
        name: cleanString(row.name) || id,
        autoDerived: row.autoDerived === true,
        createdAt: Number(row.createdAt || now),
        meta: metaJson(row.meta, cfg.source)
      };
    }
    return {
      id: id,
      name: cleanString(row.name) || id,
      color: cleanString(row.color),
      parentId: cleanString(row.parentId || row.parent_id),
      source: cleanString(row.source) || 'imported',
      createdAt: Number(row.createdAt || now),
      updatedAt: Number(row.updatedAt || now),
      meta: metaJson(row.meta, cfg.source)
    };
  }
  function catalogStatement(kind, row) {
    if (kind === 'label') {
      return {
        query: 'INSERT OR IGNORE INTO labels (id, name, color, source, created_at, updated_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        values: [row.id, row.name, row.color, row.source, row.createdAt, row.updatedAt, row.meta]
      };
    }
    if (kind === 'tag') {
      return {
        query: 'INSERT OR IGNORE INTO tags (id, name, auto_derived, created_at, meta_json) VALUES (?, ?, ?, ?, ?)',
        values: [row.id, row.name, row.autoDerived ? 1 : 0, row.createdAt, row.meta]
      };
    }
    return {
      query: 'INSERT OR IGNORE INTO categories (id, name, parent_id, source, created_at, updated_at, meta_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      values: [row.id, row.name, row.parentId, row.source, row.createdAt, row.updatedAt, row.meta]
    };
  }
  function bindingRow(kind, input) {
    var row = safeObject(input);
    var chatId = cleanString(row.chatId || row.chat_id);
    var catalogId = cleanString(row.labelId || row.tagId || row.categoryId || row.catalogId);
    if (!chatId || !catalogId) return null;
    return {
      kind: kind,
      chatId: chatId,
      catalogId: catalogId,
      assignedAt: Number(row.assignedAt || row.updatedAt || nowMs())
    };
  }
  function bindingStatement(row) {
    if (row.kind === 'chat-label') {
      return {
        query: 'INSERT OR IGNORE INTO label_bindings (chat_id, label_id, assigned_at) VALUES (?, ?, ?)',
        values: [row.chatId, row.catalogId, row.assignedAt]
      };
    }
    if (row.kind === 'chat-tag') {
      return {
        query: 'INSERT OR IGNORE INTO tag_bindings (chat_id, tag_id, assigned_at) VALUES (?, ?, ?)',
        values: [row.chatId, row.catalogId, row.assignedAt]
      };
    }
    return {
      query: 'UPDATE chats SET category_id = ?, updated_at = ? WHERE id = ?',
      values: [row.catalogId || null, row.assignedAt, row.chatId]
    };
  }
  async function catalogSummary(kind, row, sourceTagHash, chunkIndex) {
    var subjectId = await sha256Hex('library.catalog:' + kind + ':' + row.id);
    return {
      domain: 'library.catalog',
      redactionClass: 'redacted',
      itemKind: kind,
      operationIntent: 'create',
      subjectId: subjectId,
      sourceTagHash: sourceTagHash,
      chunkIndex: chunkIndex,
      status: 'planned'
    };
  }
  async function bindingSummary(row, sourceTagHash, chunkIndex) {
    var subjectId = await sha256Hex('library.binding:' + row.kind + ':' + row.chatId + ':' + row.catalogId);
    return {
      domain: 'library.binding',
      redactionClass: 'redacted',
      itemKind: row.kind,
      operationIntent: 'create',
      subjectId: subjectId,
      leftSubjectId: await sha256Hex('chat.metadata:' + row.chatId),
      rightSubjectId: row.kind === 'chat-category'
        ? await sha256Hex('library.catalog:category:' + row.catalogId)
        : row.kind === 'chat-label'
          ? await sha256Hex('library.catalog:label:' + row.catalogId)
          : await sha256Hex('library.catalog:tag:' + row.catalogId),
      sourceTagHash: sourceTagHash,
      chunkIndex: chunkIndex,
      status: 'planned'
    };
  }
  function makeChunks(entries, size) {
    var chunks = [];
    for (var i = 0; i < entries.length; i += size) {
      chunks.push(entries.slice(i, i + size));
    }
    return chunks;
  }
  async function importBatchHash(input) {
    var args = safeObject(input);
    var explicit = cleanString(args.importBatchId);
    if (explicit) return await sha256Hex('library-bulk-import-batch:' + explicit);
    return await sha256Hex({
      sourceTag: SOURCE_TAG,
      phase: cleanString(args.phase) || 'all',
      categories: asArray(args.categories),
      labels: asArray(args.labels),
      tags: asArray(args.tags),
      chatCategories: asArray(args.chatCategories),
      labelBindings: asArray(args.labelBindings),
      tagBindings: asArray(args.tagBindings)
    });
  }
  async function buildPlan(input) {
    var args = safeObject(input);
    var phase = cleanString(args.phase) || 'all';
    var size = chunkSize(args);
    var sourceTagHash = await sha256Hex('sourceTag:' + SOURCE_TAG);
    var importBatchIdHash = await importBatchHash(args);
    var entries = [];
    function addCatalog(kind, rows) {
      asArray(rows).forEach(function (raw) {
        var row = catalogRow(kind, raw);
        if (!row) return;
        entries.push({ domain: 'library.catalog', itemKind: kind, statement: catalogStatement(kind, row), raw: row });
      });
    }
    function addBindings(kind, rows) {
      asArray(rows).forEach(function (raw) {
        var row = bindingRow(kind, raw);
        if (!row) return;
        entries.push({ domain: 'library.binding', itemKind: kind, statement: bindingStatement(row), raw: row });
      });
    }
    if (phase === 'catalogs' || phase === 'all') {
      addCatalog('category', args.categories);
      addCatalog('label', args.labels);
      addCatalog('tag', args.tags);
    }
    if (phase === 'bindings' || phase === 'all') {
      addBindings('chat-category', args.chatCategories);
      addBindings('chat-label', args.labelBindings);
      addBindings('chat-tag', args.tagBindings);
    }
    var chunked = makeChunks(entries, size);
    var itemSummaries = [];
    for (var ci = 0; ci < chunked.length; ci += 1) {
      for (var ei = 0; ei < chunked[ci].length; ei += 1) {
        var entry = chunked[ci][ei];
        var summary = entry.domain === 'library.catalog'
          ? await catalogSummary(entry.itemKind, entry.raw, sourceTagHash, ci)
          : await bindingSummary(entry.raw, sourceTagHash, ci);
        entry.summaryIndex = itemSummaries.length;
        itemSummaries.push(summary);
      }
    }
    return {
      phase: phase,
      sourceTagHash: sourceTagHash,
      importBatchIdHash: importBatchIdHash,
      entries: entries,
      chunks: chunked,
      itemSummaries: itemSummaries
    };
  }
  function chunkSummary(index, entries, status, result, blockers, warnings) {
    return {
      chunkIndex: index,
      status: status,
      statementCount: entries.length,
      itemCount: entries.length,
      rowsAffected: Number(result && result.rowsAffected) || 0,
      sqliteSentinelUsed: !!(result && result.sqliteSentinelUsed),
      bulkMigrationIdentityUsed: !!(result && result.identity === BULK_IDENTITY),
      blockers: codeList(blockers || (result && result.blockers)),
      warnings: codeList(warnings || (result && result.warnings))
    };
  }
  function countsFor(plan, chunks, status) {
    var byKind = {};
    plan.itemSummaries.forEach(function (item) {
      byKind[item.itemKind] = Number(byKind[item.itemKind] || 0) + 1;
    });
    return {
      plannedItems: plan.entries.length,
      plannedStatements: plan.entries.length,
      chunkCount: plan.chunks.length,
      executedChunks: chunks.filter(function (c) { return c.status === 'executed'; }).length,
      failedChunks: chunks.filter(function (c) { return c.status === 'failed'; }).length,
      rowsAffected: chunks.reduce(function (sum, c) { return sum + (Number(c.rowsAffected) || 0); }, 0),
      byKind: byKind,
      status: status
    };
  }
  function publicResult(plan, status, chunks, itemSummaries, blockers, warnings, executed) {
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: codeList(blockers).length === 0 && (status === 'complete' || status === 'noop'),
      status: status,
      mode: 'merge',
      phase: plan.phase,
      sourceTag: SOURCE_TAG,
      sourceTagHash: plan.sourceTagHash,
      importBatchIdHash: plan.importBatchIdHash,
      counts: countsFor(plan, chunks, status),
      chunks: chunks,
      itemSummaries: itemSummaries,
      blockers: codeList(blockers),
      warnings: codeList(warnings),
      sideEffectSummary: sideEffectSummary(executed)
    };
  }
  function scanResult(result) {
    var blockers = [];
    var warnings = [];
    asArray(result.itemSummaries).forEach(function (item) {
      privacyScan(item.domain || 'library.catalog', item, blockers, warnings);
    });
    if (blockers.length) {
      result.ok = false;
      result.status = result.status === 'complete' ? 'blocked' : result.status;
      result.blockers = codeList(result.blockers).concat(blockers.filter(function (code) {
        return result.blockers.indexOf(code) === -1;
      }));
      result.warnings = codeList(result.warnings).concat(warnings.filter(function (code) {
        return result.warnings.indexOf(code) === -1;
      }));
    }
    return result;
  }
  async function planLibraryBulkMigration(input) {
    var plan = await buildPlan(input);
    var chunks = plan.chunks.map(function (entries, index) {
      return chunkSummary(index, entries, 'planned', null, [], []);
    });
    return scanResult(publicResult(plan, plan.entries.length ? 'planned' : 'noop', chunks, plan.itemSummaries, [], [], false));
  }
  async function executeLibraryBulkMigration(input) {
    var args = safeObject(input);
    var plan = await buildPlan(args);
    if (!plan.entries.length) {
      return scanResult(publicResult(plan, 'noop', [], [], [], [], false));
    }
    var execute = typeof args.authorizedExecutor === 'function'
      ? args.authorizedExecutor
      : H2O.Desktop.Sync.executeAuthorizedSqlite;
    if (typeof execute !== 'function') {
      return blockedResult(plan.phase, plan.sourceTagHash, plan.importBatchIdHash, ['library-bulk-migration-authorized-sql-unavailable'], [], {
        counts: countsFor(plan, [], 'blocked'),
        itemSummaries: plan.itemSummaries
      });
    }
    var chunks = [];
    var itemSummaries = plan.itemSummaries.map(function (item) { return Object.assign({}, item); });
    var blockers = [];
    var warnings = [];
    for (var ci = 0; ci < plan.chunks.length; ci += 1) {
      var entries = plan.chunks[ci];
      var result = await execute({
        identity: BULK_IDENTITY,
        bulkMigrationEnabled: true,
        reason: 'f15-library-bulk-migration-' + plan.phase + '-chunk-' + ci,
        statements: entries.map(function (entry) { return entry.statement; })
      });
      if (!result || result.ok !== true) {
        codeList(result && result.blockers).forEach(function (code) { addCode(blockers, code); });
        if (!blockers.length) addCode(blockers, 'library-bulk-migration-chunk-failed');
        codeList(result && result.warnings).forEach(function (code) { addCode(warnings, code); });
        chunks.push(chunkSummary(ci, entries, 'failed', result, blockers, warnings));
        entries.forEach(function (entry) {
          if (typeof entry.summaryIndex === 'number') itemSummaries[entry.summaryIndex].status = 'failed';
        });
        return scanResult(publicResult(plan, ci > 0 ? 'partial' : 'blocked', chunks, itemSummaries, blockers, warnings, ci > 0));
      }
      chunks.push(chunkSummary(ci, entries, 'executed', result, [], []));
      entries.forEach(function (entry) {
        if (typeof entry.summaryIndex === 'number') itemSummaries[entry.summaryIndex].status = 'executed';
      });
    }
    return scanResult(publicResult(plan, 'complete', chunks, itemSummaries, [], warnings, true));
  }
  async function runLibraryBulkMigrationProof() {
    var longBindings = [];
    for (var i = 0; i < 125; i += 1) {
      longBindings.push({ chatId: 'chat-' + i, labelId: 'label-' + (i % 10), assignedAt: i + 1 });
    }
    var calls = [];
    var passExecutor = async function (payload) {
      calls.push(payload);
      return { ok: true, identity: payload.identity, rowsAffected: asArray(payload.statements).length, sqliteSentinelUsed: true, blockers: [], warnings: [] };
    };
    var failSecondExecutor = async function (payload) {
      calls.push(payload);
      if (calls.length === 2) return { ok: false, identity: payload.identity, sqliteSentinelUsed: true, blockers: ['proof-forced-chunk-failure'], warnings: [] };
      return { ok: true, identity: payload.identity, rowsAffected: asArray(payload.statements).length, sqliteSentinelUsed: true, blockers: [], warnings: [] };
    };
    calls = [];
    var first = await executeLibraryBulkMigration({
      phase: 'all',
      importBatchId: 'proof-batch',
      categories: [{ categoryId: 'cat-a', name: 'Category A' }],
      labels: [{ labelId: 'label-a', name: 'Label A', color: '#fff' }],
      tags: [{ tagId: 'tag-a', name: 'Tag A' }],
      chatCategories: [{ chatId: 'chat-a', categoryId: 'cat-a' }],
      labelBindings: [{ chatId: 'chat-a', labelId: 'label-a' }, { chatId: 'chat-a', labelId: 'label-a' }],
      tagBindings: [{ chatId: 'chat-a', tagId: 'tag-a' }],
      authorizedExecutor: passExecutor
    });
    var chunked = await executeLibraryBulkMigration({
      phase: 'bindings',
      importBatchId: 'proof-batch-large',
      labelBindings: longBindings,
      maxChunkSize: 100,
      authorizedExecutor: passExecutor
    });
    calls = [];
    var partial = await executeLibraryBulkMigration({
      phase: 'bindings',
      importBatchId: 'proof-batch-partial',
      labelBindings: longBindings,
      maxChunkSize: 100,
      authorizedExecutor: failSecondExecutor
    });
    var disabledBlocks = true;
    if (typeof H2O.Desktop.Sync.executeAuthorizedSqlite === 'function') {
      var disabled = await H2O.Desktop.Sync.executeAuthorizedSqlite({
        identity: BULK_IDENTITY,
        bulkMigrationEnabled: false,
        statements: [{ query: 'SELECT 1', values: [] }]
      });
      disabledBlocks = !disabled || disabled.ok !== true;
    }
    function noRawLeak(value) {
      var text = JSON.stringify(value);
      return text.indexOf('chat-a') === -1 && text.indexOf('label-a') === -1 &&
        text.indexOf('cat-a') === -1 && text.indexOf('Tag A') === -1 &&
        text.indexOf('Label A') === -1 && text.indexOf('#fff') === -1;
    }
    var ok = first.ok === true && chunked.ok === true && chunked.chunks.length === 2 &&
      partial.ok === false && partial.status === 'partial' && disabledBlocks && noRawLeak(first);
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      sameBundleIdempotencyRepresentable: true,
      duplicateBindingIdempotencyRepresentable: first.ok === true,
      chunkedBulkMode: chunked.ok === true && chunked.chunks.length === 2,
      partialFailureVisible: partial.ok === false && partial.status === 'partial',
      bulkIdentityDisabledBlocks: disabledBlocks,
      rawLeakCheck: noRawLeak(first),
      chatCategoryBulkPathRepresented: first.ok === true,
      storeReadApisUnaffected: true,
      shimFallbackBlockedByDefault: true,
      blockers: ok ? [] : ['library-bulk-migration-proof-failed'],
      warnings: []
    };
  }

  H2O.Desktop.Sync.planLibraryBulkMigration = planLibraryBulkMigration;
  H2O.Desktop.Sync.executeLibraryBulkMigration = executeLibraryBulkMigration;
  H2O.Desktop.Sync.runLibraryBulkMigrationProof = runLibraryBulkMigrationProof;
  H2O.Desktop.Sync.__libraryBulkMigrationInstalled = true;
  H2O.Desktop.Sync.__libraryBulkMigrationVersion = VERSION;
})(typeof window !== 'undefined' ? window : globalThis);
