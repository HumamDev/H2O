/* H2O Studio Sync - Phase 2 Desktop canonical metadata export projection
 *
 * Desktop/Tauri-only read projection for labels, tags, categories, and
 * classification metadata. The projection is intentionally hash/count based:
 * it does not expose raw chat IDs, titles, content, label/tag/category names,
 * colors, or account-linked metadata.
 *
 * Public API:
 *   H2O.Studio.sync.libraryMetadataExportProjection.buildDesktopCanonicalMetadataExport(options)
 *
 * Safety invariants:
 *   - Desktop export only. No Chrome import/display parity.
 *   - No Chrome request export.
 *   - No Desktop apply behavior.
 *   - No Chrome canonical mutation.
 *   - No Desktop canonical metadata mutation.
 *   - No chat, snapshot, asset, label, tag, category, folder, or metadata
 *     delete behavior.
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
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};

  if (H2O.Studio.sync.libraryMetadataExportProjection &&
      H2O.Studio.sync.libraryMetadataExportProjection.__installed) return;

  var VERSION = '0.1.0-phase2';
  var SCHEMA = 'h2o.studio.library-metadata.desktop-canonical.v1';
  var PHASE = 'phase2-desktop-canonical-export';

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

  function boolValue(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function safeCode(value) {
    var code = cleanString(value);
    if (!/^[a-z0-9][a-z0-9:._-]{1,140}$/i.test(code)) return '';
    return code;
  }

  function addWarning(warnings, code, detail) {
    var safe = safeCode(code);
    if (!safe) return;
    var entry = { code: safe };
    if (detail) entry.detail = safeCode(detail) || cleanString(detail).slice(0, 80);
    warnings.push(entry);
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

  function canonicalJson(value) {
    try { return JSON.stringify(canonicalize(value)); }
    catch (_) { return 'null'; }
  }

  function fallbackHash(text) {
    var h1 = 0x811c9dc5;
    var h2 = 0x01000193;
    var str = String(text || '');
    for (var i = 0; i < str.length; i += 1) {
      h1 ^= str.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= str.charCodeAt(str.length - 1 - i);
      h2 = Math.imul(h2, 0x01000193) >>> 0;
    }
    return 'fnv64-' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  async function hashText(text) {
    var input = String(text || '');
    try {
      if (global.crypto && global.crypto.subtle &&
          typeof global.crypto.subtle.digest === 'function' &&
          typeof global.TextEncoder !== 'undefined') {
        var bytes = new global.TextEncoder().encode(input);
        var digest = await global.crypto.subtle.digest('SHA-256', bytes);
        return Array.prototype.map.call(new Uint8Array(digest), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (_) { /* fall through */ }
    return fallbackHash(input);
  }

  async function hashValue(value) {
    return hashText(canonicalJson(value));
  }

  function getStores() {
    return safeObject(H2O.Studio && H2O.Studio.store);
  }

  async function listStoreRows(store, storeName, warnings) {
    if (!store) {
      addWarning(warnings, 'library-metadata-export-store-unavailable', storeName);
      return [];
    }
    try {
      if (typeof store.getAll === 'function') return asArray(await store.getAll());
      if (typeof store.list === 'function') return asArray(await store.list());
      addWarning(warnings, 'library-metadata-export-store-list-unavailable', storeName);
    } catch (e) {
      addWarning(warnings, 'library-metadata-export-store-list-failed', storeName);
    }
    return [];
  }

  function rowId(row, kind) {
    row = safeObject(row);
    if (kind === 'label') return cleanString(row.labelId || row.id);
    if (kind === 'tag') return cleanString(row.tagId || row.id);
    if (kind === 'category') return cleanString(row.categoryId || row.id);
    return cleanString(row.chatId || row.id);
  }

  function rowName(row) {
    row = safeObject(row);
    return cleanString(row.name || row.title || row.label || row.tag || row.category);
  }

  function rowColor(row) {
    row = safeObject(row);
    return cleanString(row.color || row.colorHex || row.accentColor);
  }

  function rowSource(row) {
    row = safeObject(row);
    return cleanString(row.source || row.originSource || row.sourceKind);
  }

  async function catalogRecord(kind, row, index) {
    var id = rowId(row, kind);
    var name = rowName(row);
    var color = rowColor(row);
    var source = rowSource(row);
    var parentId = cleanString(safeObject(row).parentId || safeObject(row).parentCategoryId);
    return {
      subjectType: 'library.catalog',
      catalogKind: kind,
      subjectHash: await hashValue({ subjectType: 'library.catalog', catalogKind: kind, id: id || String(index) }),
      nameHash: name ? await hashValue({ subjectType: 'library.catalog.name', catalogKind: kind, value: name }) : '',
      colorHash: color ? await hashValue({ subjectType: 'library.catalog.color', catalogKind: kind, value: color }) : '',
      sourceHash: source ? await hashValue({ subjectType: 'library.catalog.source', catalogKind: kind, value: source }) : '',
      parentHash: parentId ? await hashValue({ subjectType: 'library.catalog.parent', catalogKind: kind, id: parentId }) : '',
      hasName: !!name,
      hasColor: !!color,
      hasParent: !!parentId,
      autoDerived: boolValue(safeObject(row).autoDerived),
      hasMetadata: isObject(safeObject(row).metadata),
    };
  }

  async function catalogRecords(kind, rows) {
    var out = [];
    for (var i = 0; i < rows.length; i += 1) {
      out.push(await catalogRecord(kind, rows[i], i));
    }
    out.sort(function (a, b) {
      return cleanString(a.subjectHash).localeCompare(cleanString(b.subjectHash));
    });
    return out;
  }

  async function bindingRecord(bindingKind, leftKind, leftId, rightKind, rightId) {
    var leftHash = await hashValue({ subjectType: leftKind, id: cleanString(leftId) });
    var rightHash = await hashValue({ subjectType: rightKind, id: cleanString(rightId) });
    return {
      subjectType: 'library.binding',
      bindingKind: bindingKind,
      subjectHash: await hashValue({ bindingKind: bindingKind, leftHash: leftHash, rightHash: rightHash }),
      leftSubjectType: leftKind,
      leftSubjectHash: leftHash,
      rightSubjectType: rightKind,
      rightSubjectHash: rightHash,
    };
  }

  function chatId(row) {
    row = safeObject(row);
    return cleanString(row.chatId || row.id);
  }

  async function listCatalogChatBindings(store, catalogRows, kind, warnings) {
    var out = [];
    if (!store || typeof store.listChats !== 'function') {
      addWarning(warnings, 'library-metadata-export-binding-list-unavailable', kind);
      return out;
    }
    for (var i = 0; i < catalogRows.length; i += 1) {
      var catalogId = rowId(catalogRows[i], kind);
      if (!catalogId) continue;
      var chats = [];
      try {
        chats = asArray(await store.listChats(catalogId));
      } catch (e) {
        addWarning(warnings, 'library-metadata-export-binding-list-failed', kind);
        chats = [];
      }
      for (var j = 0; j < chats.length; j += 1) {
        var id = chatId(chats[j]);
        if (!id) continue;
        out.push(await bindingRecord('chat-' + kind, 'chat.metadata', id, 'library.catalog.' + kind, catalogId));
      }
    }
    out.sort(function (a, b) {
      return cleanString(a.subjectHash).localeCompare(cleanString(b.subjectHash));
    });
    return out;
  }

  async function chatCategoryBindings(chatRows) {
    var out = [];
    for (var i = 0; i < chatRows.length; i += 1) {
      var row = safeObject(chatRows[i]);
      var id = chatId(row);
      var categoryId = cleanString(row.categoryId || row.category_id);
      if (!id || !categoryId) continue;
      out.push(await bindingRecord('chat-category', 'chat.metadata', id, 'library.catalog.category', categoryId));
    }
    out.sort(function (a, b) {
      return cleanString(a.subjectHash).localeCompare(cleanString(b.subjectHash));
    });
    return out;
  }

  async function buildDesktopCanonicalMetadataExport(options) {
    var warnings = [];
    var stores = getStores();
    var labels = await listStoreRows(stores.labels, 'labels', warnings);
    var tags = await listStoreRows(stores.tags, 'tags', warnings);
    var categories = await listStoreRows(stores.categories, 'categories', warnings);
    var chats = await listStoreRows(stores.chats, 'chats', warnings);

    var labelCatalog = await catalogRecords('label', labels);
    var tagCatalog = await catalogRecords('tag', tags);
    var categoryCatalog = await catalogRecords('category', categories);
    var labelBindings = await listCatalogChatBindings(stores.labels, labels, 'label', warnings);
    var tagBindings = await listCatalogChatBindings(stores.tags, tags, 'tag', warnings);
    var categoryBindings = await chatCategoryBindings(chats);

    var counts = {
      labelCatalogCount: labelCatalog.length,
      tagCatalogCount: tagCatalog.length,
      categoryCatalogCount: categoryCatalog.length,
      chatStoreRowCount: chats.length,
      chatLabelBindingCount: labelBindings.length,
      chatTagBindingCount: tagBindings.length,
      chatCategoryAssignmentCount: categoryBindings.length,
      classificationSignalCount: categoryBindings.length,
    };

    var catalogs = {
      labels: labelCatalog,
      tags: tagCatalog,
      categories: categoryCatalog,
    };
    var bindings = {
      chatLabels: labelBindings,
      chatTags: tagBindings,
      chatCategories: categoryBindings,
    };
    var hashes = {
      labels: await hashValue(labelCatalog),
      tags: await hashValue(tagCatalog),
      categories: await hashValue(categoryCatalog),
      chatLabelBindings: await hashValue(labelBindings),
      chatTagBindings: await hashValue(tagBindings),
      chatCategoryAssignments: await hashValue(categoryBindings),
    };
    hashes.projection = await hashValue({ counts: counts, catalogs: catalogs, bindings: bindings });

    return {
      schema: SCHEMA,
      version: VERSION,
      phase: PHASE,
      source: {
        surface: 'desktop-studio',
        platformAdapter: 'tauri',
        authority: 'desktop',
        projection: 'desktop-canonical-library-metadata',
        exportedAtIso: nowIso(),
        requestedBy: safeCode(safeObject(options).requestedBy) || 'desktop-export-bundle',
      },
      privacy: {
        redacted: true,
        hashOnly: true,
        rawChatIds: false,
        rawChatTitles: false,
        rawChatContent: false,
        rawLabelNames: false,
        rawTagNames: false,
        rawCategoryNames: false,
        rawColors: false,
        accountLinkedMetadata: false,
      },
      sideEffectSummary: {
        readOnly: true,
        storageWrites: false,
        sqliteWrites: false,
        chromeStorageWrites: false,
        importInvoked: false,
        exportInvoked: false,
        syncNowInvoked: false,
        applyExecuted: false,
        desktopApply: false,
        chromeRequestExport: false,
        canonicalMutation: false,
        deletes: false,
      },
      counts: counts,
      hashes: hashes,
      catalogs: catalogs,
      bindings: bindings,
      diagnostics: {
        ok: true,
        warnings: warnings,
        blockers: [],
        productSyncReady: false,
        phase2DesktopExportReady: true,
        chromeImportDisplayParityImplemented: false,
        chromeRequestExportImplemented: false,
        desktopApplyImplemented: false,
      },
      safety: {
        noHardDelete: true,
        noPurge: true,
        noChatDelete: true,
        noSnapshotDelete: true,
        noAssetDelete: true,
        noLabelDelete: true,
        noTagDelete: true,
        noCategoryDelete: true,
        noMetadataDelete: true,
      },
    };
  }

  H2O.Studio.sync.libraryMetadataExportProjection = {
    __installed: true,
    schema: SCHEMA,
    version: VERSION,
    phase: PHASE,
    buildDesktopCanonicalMetadataExport: buildDesktopCanonicalMetadataExport,
  };
})(typeof window !== 'undefined' ? window : globalThis);
