/* H2O Desktop Sync - F15.8.f legacy library store cutover shims
 *
 * Wraps legacy labels/tags/categories/chats write APIs after store
 * registration. Reads remain untouched. Protected SQLite writes go through
 * the Rust-backed writer identity sentinel and v12 triggers.
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
  H2O.Studio = H2O.Studio || {};
  if (H2O.Desktop.Sync.__libraryStoreCutoverShimsInstalled) return;

  var VERSION = '0.1.0-f15.8.f';
  var pending = new Set();
  var evidenceRows = [];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function nowMs() { return Date.now(); }
  function nowIso() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function uuid(prefix) {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return prefix + global.crypto.randomUUID();
    } catch (_) { /* ignore */ }
    return prefix + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }
  function getId(input, field) {
    if (typeof input === 'string') return cleanString(input);
    var source = safeObject(input);
    return cleanString(source[field] || source.id);
  }
  function parseMeta(value) {
    if (!value) return {};
    if (isObject(value)) return Object.assign({}, value);
    if (typeof value !== 'string') return {};
    try {
      var parsed = JSON.parse(value);
      return isObject(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  function stableStringify(value) {
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    if (!isObject(value)) return JSON.stringify(value);
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + stableStringify(value[key]);
    }).join(',') + '}';
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
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try { return await kernel.sha256Hex(value); } catch (_) { /* fall through */ }
    }
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      var text = typeof value === 'string' ? value : stableStringify(value);
      var buffer = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return bytesToHex(new Uint8Array(buffer));
    }
    return '';
  }
  function sideEffects() {
    return {
      storageWritten: true,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      sqliteSentinelUsed: true,
      storeShimRouted: true
    };
  }
  async function scan(domain, target) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (!kernel || typeof kernel.scanDomainForbiddenFields !== 'function') return true;
    var result = kernel.scanDomainForbiddenFields(domain, Object.assign({ redactionClass: 'redacted' }, target));
    if (!result || result.ok !== true) {
      throw new Error('f15-store-shim-privacy-failed:' + domain);
    }
    return true;
  }
  async function recordEvidence(domain, operation, fields) {
    var source = safeObject(fields);
    var row = Object.assign({
      schema: 'h2o.desktop.sync.f15-store-shim-evidence.v1',
      version: VERSION,
      domain: domain,
      kind: 'proposal',
      redactionClass: 'redacted',
      operation: operation,
      operationIntent: source.operationIntent || 'update',
      subjectId: source.subjectId || '',
      leftSubjectId: source.leftSubjectId || '',
      rightSubjectId: source.rightSubjectId || '',
      nameHash: source.nameHash || '',
      colorHash: source.colorHash || '',
      sourceTagHash: source.sourceTagHash || '',
      f5ReviewNeededLater: source.f5ReviewNeededLater === true,
      pendingReview: source.pendingReview === true,
      sideEffectSummary: sideEffects(),
      observedAtIso: nowIso()
    }, source.extra || {});
    await scan(domain, row);
    evidenceRows.push(row);
    if (evidenceRows.length > 100) evidenceRows.splice(0, evidenceRows.length - 100);
    return row;
  }
  function track(promise) {
    var wrapped = Promise.resolve(promise);
    pending.add(wrapped);
    wrapped.then(function () { pending.delete(wrapped); }, function () { pending.delete(wrapped); });
    return wrapped;
  }
  async function waitForPending(timeoutMs) {
    var timeout = Number(timeoutMs) || 5000;
    var started = Date.now();
    while (pending.size) {
      if (Date.now() - started > timeout) {
        return { ok: false, settled: false, pendingCount: pending.size, timedOut: true };
      }
      await Promise.race(Array.from(pending).concat(new Promise(function (resolve) {
        global.setTimeout(resolve, 50);
      })));
    }
    return { ok: true, settled: true, pendingCount: 0, timedOut: false };
  }
  async function authorized(statements, reason) {
    if (typeof H2O.Desktop.Sync.executeSettlementSqlite !== 'function') {
      throw new Error('f15-store-shim-authorized-sql-unavailable');
    }
    var result = await H2O.Desktop.Sync.executeSettlementSqlite(statements, { reason: reason });
    if (!result || result.ok !== true) {
      throw new Error((result && asArray(result.blockers).join(',')) || 'f15-store-shim-authorized-sql-failed');
    }
    return result;
  }
  function notifyAfterSettlement(api) {
    if (api && typeof api.reload === 'function') {
      try { return api.reload(); } catch (_) { /* ignore */ }
    }
    return Promise.resolve();
  }

  function catalogConfig(kind) {
    if (kind === 'label') return {
      storeName: 'labels',
      table: 'labels',
      idField: 'labelId',
      prefix: 'lbl_',
      columns: { name: 'name', color: 'color', source: 'source', createdAt: 'created_at', updatedAt: 'updated_at' },
      hasUpdatedAt: true
    };
    if (kind === 'tag') return {
      storeName: 'tags',
      table: 'tags',
      idField: 'tagId',
      prefix: 'tag_',
      columns: { name: 'name', autoDerived: 'auto_derived', createdAt: 'created_at' },
      boolColumns: { auto_derived: true },
      hasUpdatedAt: false
    };
    return {
      storeName: 'categories',
      table: 'categories',
      idField: 'categoryId',
      prefix: 'cat_',
      columns: { name: 'name', parentId: 'parent_id', source: 'source', createdAt: 'created_at', updatedAt: 'updated_at' },
      hasUpdatedAt: true
    };
  }
  function catalogColumns(cfg, patch, existing) {
    var columns = {};
    var metaPatch = null;
    Object.keys(patch || {}).forEach(function (field) {
      if (field === cfg.idField || field === 'id') return;
      if (field === 'meta' && isObject(patch.meta)) {
        metaPatch = patch.meta;
        return;
      }
      var col = cfg.columns[field];
      if (!col) {
        metaPatch = metaPatch || {};
        metaPatch[field] = patch[field];
        return;
      }
      if (typeof patch[field] === 'undefined') return;
      columns[col] = cfg.boolColumns && cfg.boolColumns[col] ? (patch[field] ? 1 : 0) : patch[field];
    });
    if (metaPatch) {
      columns.meta_json = JSON.stringify(Object.assign({}, parseMeta(existing && existing.meta), metaPatch));
    }
    return columns;
  }
  async function upsertCatalog(kind, input, generateId) {
    var cfg = catalogConfig(kind);
    var store = H2O.Studio.store && H2O.Studio.store[cfg.storeName];
    var patch = Object.assign({}, safeObject(input));
    var id = getId(patch, cfg.idField);
    if (!id && generateId) {
      id = uuid(cfg.prefix);
      patch[cfg.idField] = id;
    }
    if (!id) throw new Error('upsert: ' + cfg.idField + ' required');
    var existing = store && typeof store.get === 'function' ? await store.get(id) : null;
    var cols = catalogColumns(cfg, patch, existing);
    var now = nowMs();
    if (cfg.hasUpdatedAt && !('updated_at' in cols)) cols.updated_at = now;
    var operation = existing ? 'update' : 'create';
    if (!existing) {
      if (!cols.name) throw new Error('upsert: name required for new ' + kind);
      if (!('created_at' in cols)) cols.created_at = now;
    }
    await recordEvidence('library.catalog', operation, {
      operationIntent: existing ? 'update' : 'create',
      subjectId: await sha256Hex('library.catalog:' + kind + ':' + id),
      nameHash: patch.name ? await sha256Hex(String(patch.name)) : '',
      colorHash: patch.color ? await sha256Hex(String(patch.color)) : '',
      sourceTagHash: await sha256Hex('legacy-store:' + cfg.storeName)
    });
    var statements;
    if (existing) {
      var setClauses = [];
      var values = [];
      Object.keys(cols).forEach(function (col) { setClauses.push(col + ' = ?'); values.push(cols[col]); });
      if (!setClauses.length) return existing;
      values.push(id);
      statements = [{ query: 'UPDATE ' + cfg.table + ' SET ' + setClauses.join(', ') + ' WHERE id = ?', values: values }];
    } else {
      var names = ['id'].concat(Object.keys(cols));
      statements = [{
        query: 'INSERT INTO ' + cfg.table + ' (' + names.join(', ') + ') VALUES (' + names.map(function () { return '?'; }).join(', ') + ')',
        values: [id].concat(names.slice(1).map(function (col) { return cols[col]; }))
      }];
    }
    await authorized(statements, 'f15-store-shim-' + cfg.storeName + '-' + operation);
    await notifyAfterSettlement(store);
    return store && typeof store.get === 'function' ? await store.get(id) : null;
  }
  async function pendingCatalogDelete(kind, id) {
    var cfg = catalogConfig(kind);
    await recordEvidence('library.catalog', 'tombstone', {
      operationIntent: 'delete',
      subjectId: await sha256Hex('library.catalog:' + kind + ':' + id),
      sourceTagHash: await sha256Hex('legacy-store:' + cfg.storeName),
      f5ReviewNeededLater: true,
      pendingReview: true
    });
    return {
      ok: true,
      deleted: false,
      status: 'pending-review',
      pendingReview: true,
      f5ReviewNeededLater: true,
      catalogKind: kind,
      sideEffectSummary: Object.assign(sideEffects(), { storageWritten: false }),
      observedAtIso: nowIso()
    };
  }
  async function bindEdge(kind, leftId, rightId, operation) {
    var isLabel = kind === 'label';
    var table = isLabel ? 'label_bindings' : 'tag_bindings';
    var col = isLabel ? 'label_id' : 'tag_id';
    var subject = await sha256Hex('library.binding:chat-' + kind + ':' + leftId + ':' + rightId);
    await recordEvidence('library.binding', operation, {
      operationIntent: operation === 'bind' ? 'create' : 'delete',
      subjectId: subject,
      leftSubjectId: await sha256Hex('chat.metadata:' + leftId),
      rightSubjectId: await sha256Hex('library.catalog:' + kind + ':' + rightId),
      sourceTagHash: await sha256Hex('legacy-store:' + (isLabel ? 'labels' : 'tags'))
    });
    var statement = operation === 'bind'
      ? { query: 'INSERT OR IGNORE INTO ' + table + ' (chat_id, ' + col + ', assigned_at) VALUES (?, ?, ?)', values: [leftId, rightId, nowMs()] }
      : { query: 'DELETE FROM ' + table + ' WHERE chat_id = ? AND ' + col + ' = ?', values: [leftId, rightId] };
    await authorized([statement], 'f15-store-shim-' + table + '-' + operation);
    return true;
  }
  async function replaceEdges(kind, api, chatId, targetIds) {
    var current = typeof api.listForChat === 'function' ? await api.listForChat(chatId) : [];
    var idField = kind === 'label' ? 'labelId' : 'tagId';
    var currentIds = asArray(current).map(function (row) { return cleanString(row && row[idField] || row && row.id); }).filter(Boolean);
    var desired = [];
    asArray(targetIds).forEach(function (item) {
      var id = getId(item, idField);
      if (id && desired.indexOf(id) === -1) desired.push(id);
    });
    var statements = [];
    var table = kind === 'label' ? 'label_bindings' : 'tag_bindings';
    var col = kind === 'label' ? 'label_id' : 'tag_id';
    currentIds.filter(function (id) { return desired.indexOf(id) === -1; }).forEach(function (id) {
      statements.push({ query: 'DELETE FROM ' + table + ' WHERE chat_id = ? AND ' + col + ' = ?', values: [chatId, id] });
    });
    desired.filter(function (id) { return currentIds.indexOf(id) === -1; }).forEach(function (id) {
      statements.push({ query: 'INSERT OR IGNORE INTO ' + table + ' (chat_id, ' + col + ', assigned_at) VALUES (?, ?, ?)', values: [chatId, id, nowMs()] });
    });
    await recordEvidence('library.binding', 'replaceForChat', {
      operationIntent: 'update',
      subjectId: await sha256Hex('library.binding:replace:' + kind + ':' + chatId + ':' + desired.sort().join('|')),
      leftSubjectId: await sha256Hex('chat.metadata:' + chatId),
      sourceTagHash: await sha256Hex('legacy-store:' + (kind === 'label' ? 'labels' : 'tags')),
      extra: { decomposedOperationCount: statements.length }
    });
    if (statements.length) await authorized(statements, 'f15-store-shim-' + table + '-replaceForChat');
    await notifyAfterSettlement(api);
    return true;
  }
  async function setChatCategory(chatId, categoryId, api) {
    var chats = H2O.Studio.store && H2O.Studio.store.chats;
    var existing = chats && typeof chats.get === 'function' ? await chats.get(chatId) : null;
    var oldCategory = cleanString(existing && existing.categoryId);
    var action = categoryId ? 'bind' : 'unbind';
    await recordEvidence('library.binding', 'chat-category-' + action, {
      operationIntent: categoryId ? 'create' : 'delete',
      subjectId: await sha256Hex('library.binding:chat-category:' + chatId + ':' + (categoryId || oldCategory || 'none')),
      leftSubjectId: await sha256Hex('chat.metadata:' + chatId),
      rightSubjectId: categoryId ? await sha256Hex('library.catalog:category:' + categoryId) : '',
      sourceTagHash: await sha256Hex('legacy-store:categories'),
      extra: { decomposedOperationCount: oldCategory && categoryId && oldCategory !== categoryId ? 2 : 1 }
    });
    var result = await authorized([{
      query: 'UPDATE chats SET category_id = ?, updated_at = ? WHERE id = ?',
      values: [categoryId || null, nowMs(), chatId]
    }], 'f15-store-shim-chat-category-' + action);
    await notifyAfterSettlement(api || H2O.Studio.store.categories);
    return Number(result.rowsAffected) > 0;
  }

  function wrapCatalog(kind) {
    var cfg = catalogConfig(kind);
    var api = H2O.Studio.store && H2O.Studio.store[cfg.storeName];
    if (!api || api.__f15CutoverShimmed) return;
    var originalSaveNow = api.saveNow;
    api.create = function (input) { return track(upsertCatalog(kind, input, true)); };
    api.upsert = function (input) { return track(upsertCatalog(kind, input, false)); };
    api.patch = function (id, partial) {
      var merged = Object.assign({}, safeObject(partial));
      merged[cfg.idField] = getId(id, cfg.idField);
      return track(upsertCatalog(kind, merged, false));
    };
    api.patchOne = api.patch;
    api.remove = function (id) { return track(pendingCatalogDelete(kind, getId(id, cfg.idField))); };
    api['delete'] = api.remove;
    api.saveNow = function (opts) {
      return track(waitForPending(safeObject(opts).timeoutMs).then(function (result) {
        if (result.ok && typeof originalSaveNow === 'function') return originalSaveNow.call(api);
        return result;
      }));
    };
    api.__f15CutoverShimmed = true;
  }
  function wrapBindingStore(kind) {
    var cfg = catalogConfig(kind);
    var api = H2O.Studio.store && H2O.Studio.store[cfg.storeName];
    if (!api) return;
    var idField = cfg.idField;
    api.bindChat = function (catalogIdInput, chatIdInput) {
      var catalogId = getId(catalogIdInput, idField);
      var chatId = getId(chatIdInput, 'chatId');
      return track(bindEdge(kind, chatId, catalogId, 'bind').then(function (ok) {
        return notifyAfterSettlement(api).then(function () { return ok; });
      }));
    };
    api.unbindChat = function (catalogIdInput, chatIdInput) {
      var catalogId = getId(catalogIdInput, idField);
      var chatId = getId(chatIdInput, 'chatId');
      return track(bindEdge(kind, chatId, catalogId, 'unbind').then(function (ok) {
        return notifyAfterSettlement(api).then(function () { return ok; });
      }));
    };
    api.replaceForChat = function (chatIdInput, ids) {
      var chatId = getId(chatIdInput, 'chatId');
      return track(replaceEdges(kind, api, chatId, ids));
    };
  }
  function wrapCategories() {
    var api = H2O.Studio.store && H2O.Studio.store.categories;
    if (!api) return;
    api.assignChat = function (categoryIdInput, chatIdInput) {
      var categoryId = getId(categoryIdInput, 'categoryId');
      var chatId = getId(chatIdInput, 'chatId');
      return track(setChatCategory(chatId, categoryId, api));
    };
    api.clearChat = function (chatIdInput) {
      var chatId = getId(chatIdInput, 'chatId');
      return track(setChatCategory(chatId, null, api));
    };
  }
  function wrapChats() {
    var api = H2O.Studio.store && H2O.Studio.store.chats;
    var categories = H2O.Studio.store && H2O.Studio.store.categories;
    if (!api || api.__f15ChatCategoryShimmed) return;
    var originalUpsert = api.upsert;
    var originalPatch = api.patch;
    var originalSaveNow = api.saveNow;
    api.upsert = function (patch) {
      var source = Object.assign({}, safeObject(patch));
      var hasCategory = Object.prototype.hasOwnProperty.call(source, 'categoryId');
      var categoryId = cleanString(source.categoryId);
      if (hasCategory) delete source.categoryId;
      var base = typeof originalUpsert === 'function' ? originalUpsert.call(api, source) : Promise.resolve(null);
      return track(Promise.resolve(base).then(async function (row) {
        if (hasCategory) {
          await setChatCategory(getId(source, 'chatId'), categoryId || null, categories);
          return typeof api.get === 'function' ? await api.get(getId(source, 'chatId')) : row;
        }
        return row;
      }));
    };
    api.patch = function (chatIdInput, partial) {
      var source = Object.assign({}, safeObject(partial));
      var hasCategory = Object.prototype.hasOwnProperty.call(source, 'categoryId');
      var categoryId = cleanString(source.categoryId);
      if (hasCategory) delete source.categoryId;
      var base = Object.keys(source).length && typeof originalPatch === 'function'
        ? originalPatch.call(api, chatIdInput, source)
        : (typeof api.get === 'function' ? api.get(chatIdInput) : Promise.resolve(null));
      return track(Promise.resolve(base).then(async function (row) {
        if (hasCategory) {
          await setChatCategory(getId(chatIdInput, 'chatId'), categoryId || null, categories);
          return typeof api.get === 'function' ? await api.get(chatIdInput) : row;
        }
        return row;
      }));
    };
    api.saveNow = function (opts) {
      return track(waitForPending(safeObject(opts).timeoutMs).then(function (result) {
        if (result.ok && typeof originalSaveNow === 'function') return originalSaveNow.call(api);
        return result;
      }));
    };
    api.__f15ChatCategoryShimmed = true;
  }
  function install() {
    if (!H2O.Studio.store) return false;
    wrapCatalog('label');
    wrapCatalog('tag');
    wrapCatalog('category');
    wrapBindingStore('label');
    wrapBindingStore('tag');
    wrapCategories();
    wrapChats();
    return true;
  }
  install();

  H2O.Desktop.Sync.installLibraryStoreCutoverShims = install;
  H2O.Desktop.Sync.waitForLibraryStoreShimSettlement = waitForPending;
  H2O.Desktop.Sync.listLibraryStoreShimEvidence = function () { return evidenceRows.slice(); };
  H2O.Desktop.Sync.__libraryStoreCutoverShimsInstalled = true;
  H2O.Desktop.Sync.__libraryStoreCutoverShimsVersion = VERSION;
})(typeof window !== 'undefined' ? window : globalThis);
