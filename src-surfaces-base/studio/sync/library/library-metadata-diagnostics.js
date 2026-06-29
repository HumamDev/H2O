/* H2O Studio Sync - Phase 1 labels/tags/categories metadata diagnostics
 *
 * Read-only diagnostic for labels, tags, categories, and classification
 * metadata readiness across Desktop Studio and Chrome Studio.
 *
 * Public API:
 *   H2O.Studio.sync.libraryMetadataDiagnostics.captureSnapshot(options)
 *   H2O.Studio.sync.libraryMetadataDiagnostics.compareSnapshots(left, right)
 *   H2O.Studio.sync.libraryMetadataDiagnostics.runDiagnostic(input)
 *   H2O.Studio.sync.libraryMetadataDiagnostics.captureDisplayParityModel(options)
 *   H2O.Studio.sync.runLibraryMetadataDiagnostics(input)
 *
 * Safety invariants:
 *   - Diagnostics only. No product sync writes.
 *   - No Desktop apply behavior.
 *   - No Chrome request export.
 *   - No Chrome canonical mutation.
 *   - No import/export/sync/apply method is invoked.
 *   - No SQLite writer identity, settlement writer, or trigger command is
 *     invoked. Runtime state is observed by API presence only.
 *   - No chat, snapshot, asset, label, tag, category, folder, or metadata
 *     delete behavior.
 *   - Output is counts, booleans, warning codes, and hashes only.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Library = H2O.Library || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};

  if (H2O.Studio.sync.libraryMetadataDiagnostics &&
      H2O.Studio.sync.libraryMetadataDiagnostics.__installed) return;

  var VERSION = '0.1.0-phase1';
  var SNAPSHOT_SCHEMA = 'h2o.studio.sync.library-metadata-diagnostics-snapshot.v1';
  var COMPARISON_SCHEMA = 'h2o.studio.sync.library-metadata-diagnostics-comparison.v1';
  var DISPLAY_PARITY_SCHEMA = 'h2o.studio.sync.library-metadata-display-parity.v1';
  var DISPLAY_PARITY_VERSION = '0.1.0-phase5';
  var DESKTOP_CANONICAL_LIBRARY_METADATA_SCHEMA = 'h2o.studio.library-metadata.desktop-canonical.v1';

  var DEFERRED_WARNING_CODES = {
    labels: 'library-propagation-labels-deferred',
    tags: 'library-propagation-tags-deferred',
    unsupportedStorage: 'library-propagation-unsupported-storage-deferred',
    projects: 'library-propagation-projects-deferred',
    folderBindings: 'library-propagation-folder-bindings-deferred',
    tombstones: 'library-propagation-tombstones-deferred',
    applyEvents: 'library-propagation-apply-events-deferred'
  };

  var WARNING_CODES = {
    localOnly: 'library-metadata-diagnostics-local-snapshot-only',
    peerRequired: 'library-metadata-diagnostics-peer-snapshot-required',
    indexUnavailable: 'library-metadata-diagnostics-library-index-unavailable',
    storeUnavailable: 'library-metadata-diagnostics-store-unavailable',
    storeRowsUnavailable: 'library-metadata-diagnostics-store-rows-unavailable',
    f15RuntimeProofRequired: 'library-metadata-diagnostics-f15-runtime-proof-required',
    productSyncNotReady: 'library-metadata-diagnostics-product-sync-not-ready'
  };

  var MISMATCH_CODES = {
    schema: 'library-metadata-diagnostics-schema-mismatch',
    source: 'library-metadata-diagnostics-source-unavailable',
    labels: 'library-metadata-diagnostics-label-mismatch',
    tags: 'library-metadata-diagnostics-tag-mismatch',
    categories: 'library-metadata-diagnostics-category-mismatch',
    classification: 'library-metadata-diagnostics-classification-mismatch',
    desktopCanonicalProjection: 'library-metadata-diagnostics-desktop-canonical-projection-mismatch',
    deferredWarnings: 'library-metadata-diagnostics-deferred-warning-mismatch',
    f15: 'library-metadata-diagnostics-f15-readiness-mismatch'
  };

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

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function numberOrZero(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function boolValue(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function safeDiagnosticCode(value) {
    var code = cleanString(value);
    if (!/^[a-z0-9][a-z0-9:._-]{1,140}$/i.test(code)) return '';
    return code;
  }

  function addUnique(list, value) {
    var code = safeDiagnosticCode(value);
    if (!code) return;
    if (list.indexOf(code) === -1) list.push(code);
  }

  function uniqueSorted(values) {
    var seen = Object.create(null);
    asArray(values).forEach(function (value) {
      var normalized = cleanString(value);
      if (normalized) seen[normalized] = true;
    });
    return Object.keys(seen).sort();
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

  function detectSurface() {
    var isTauri = false;
    var isChrome = false;
    var adapter = '';
    try {
      isTauri = !!(global.__TAURI_INTERNALS__ || global.__TAURI__ ||
        (H2O.Studio.platform && H2O.Studio.platform.env &&
          H2O.Studio.platform.env.isTauri === true));
    } catch (_) { isTauri = false; }
    try {
      isChrome = !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) { isChrome = false; }
    try {
      adapter = cleanString(H2O.Studio.platform && H2O.Studio.platform.env &&
        H2O.Studio.platform.env.adapter);
    } catch (_) { adapter = ''; }
    if (isTauri) return { surface: 'desktop-studio', sourceType: 'desktop-metadata-read-model', isTauri: true, isChrome: false, adapter: adapter || 'tauri' };
    if (isChrome) return { surface: 'chrome-studio', sourceType: 'chrome-metadata-read-model', isTauri: false, isChrome: true, adapter: adapter || 'mv3' };
    return { surface: 'unknown-studio', sourceType: 'unknown-metadata-read-model', isTauri: false, isChrome: false, adapter: adapter || 'unknown' };
  }

  function getIndex() {
    return H2O.LibraryIndex || (H2O.Library && H2O.Library.Index) || null;
  }

  function getLibraryIndexCore() {
    return (H2O.Library && H2O.Library.LibraryIndexCore) || null;
  }

  function isArchived(row) {
    var view = cleanLower(row && (row.view || row.status));
    return view === 'archived' || boolValue(row && (row.archived || row.isArchived));
  }

  function isDeleted(row) {
    var view = cleanLower(row && (row.view || row.status));
    return view === 'deleted' || view === 'tombstone' || view === 'tombstoned' ||
      boolValue(row && (row.deleted || row.isDeleted || row.tombstoned));
  }

  function canonicalActiveRows(rows) {
    var core = getLibraryIndexCore();
    if (core && typeof core.canonicalActiveRows === 'function') {
      try { return asArray(core.canonicalActiveRows(asArray(rows))); }
      catch (_) { /* fall through */ }
    }
    return asArray(rows).filter(function (row) {
      return row && typeof row === 'object' && !isArchived(row) && !isDeleted(row);
    });
  }

  function firstValue(source, names) {
    var obj = safeObject(source);
    for (var i = 0; i < names.length; i += 1) {
      var value = cleanString(obj[names[i]]);
      if (value) return value;
    }
    return '';
  }

  function normalizeValueToken(value) {
    if (isObject(value)) {
      return firstValue(value, [
        'id', 'labelId', 'tagId', 'categoryId', 'projectId',
        'name', 'label', 'title', 'value'
      ]);
    }
    return cleanString(value);
  }

  function normalizeTokenArray(value) {
    if (Array.isArray(value)) {
      return uniqueSorted(value.map(normalizeValueToken));
    }
    var token = normalizeValueToken(value);
    return token ? [token] : [];
  }

  function organization(row) {
    return safeObject(row && row.organization);
  }

  function snapshotMeta(row) {
    return safeObject(row && row.snapshotMeta);
  }

  function meta(row) {
    return safeObject(row && row.meta);
  }

  function collectLabelTokens(row) {
    var values = [];
    values = values.concat(normalizeTokenArray(row && row.labels));
    values = values.concat(normalizeTokenArray(row && row.labelIds));
    values = values.concat(normalizeTokenArray(row && row.labelNames));
    values = values.concat(normalizeTokenArray(organization(row).labels));
    values = values.concat(normalizeTokenArray(organization(row).labelIds));
    values = values.concat(normalizeTokenArray(snapshotMeta(row).labels));
    values = values.concat(normalizeTokenArray(snapshotMeta(row).labelIds));
    values = values.concat(normalizeTokenArray(meta(row).labels));
    values = values.concat(normalizeTokenArray(meta(row).labelIds));
    values = values.concat(normalizeTokenArray(row && row.labelSummary));
    return uniqueSorted(values);
  }

  function collectTagTokens(row) {
    var values = [];
    values = values.concat(normalizeTokenArray(row && row.tags));
    values = values.concat(normalizeTokenArray(row && row.tagIds));
    values = values.concat(normalizeTokenArray(row && row.tagNames));
    values = values.concat(normalizeTokenArray(organization(row).tags));
    values = values.concat(normalizeTokenArray(organization(row).tagIds));
    values = values.concat(normalizeTokenArray(snapshotMeta(row).tags));
    values = values.concat(normalizeTokenArray(snapshotMeta(row).tagIds));
    values = values.concat(normalizeTokenArray(meta(row).tags));
    values = values.concat(normalizeTokenArray(meta(row).tagIds));
    return uniqueSorted(values);
  }

  function collectCategoryTokens(row) {
    var values = [];
    [
      row && row.categoryId,
      row && row.category_id,
      row && row.category,
      row && row.categoryName,
      row && row.snapshotCategory,
      organization(row).categoryId,
      organization(row).category,
      snapshotMeta(row).categoryId,
      snapshotMeta(row).category,
      meta(row).categoryId,
      meta(row).category
    ].forEach(function (value) {
      values = values.concat(normalizeTokenArray(value));
    });
    values = values.concat(normalizeTokenArray(row && row.categories));
    values = values.concat(normalizeTokenArray(row && row.categoryCandidates));
    return uniqueSorted(values);
  }

  function collectClassificationTokens(row) {
    var values = [];
    [
      row && row.classification,
      row && row.classificationId,
      row && row.classificationName,
      row && row.categoryOverride,
      row && row.categorySource,
      snapshotMeta(row).classification,
      meta(row).classification
    ].forEach(function (value) {
      values = values.concat(normalizeTokenArray(value));
    });
    values = values.concat(collectCategoryTokens(row));
    return uniqueSorted(values);
  }

  function rowKey(row, index) {
    return firstValue(row, ['chatId', 'id', 'externalId', 'conversationId', 'snapshotId', 'href']) ||
      ('row:' + index);
  }

  function rowMetadataToken(row, index) {
    return {
      rowKey: rowKey(row, index),
      labels: collectLabelTokens(row),
      tags: collectTagTokens(row),
      categories: collectCategoryTokens(row),
      classification: collectClassificationTokens(row),
      hasProjectSignal: !!firstValue(row, ['projectId', 'project_id', 'projectName'])
    };
  }

  function catalogRowToken(kind, row, index) {
    var idFields = kind === 'labels'
      ? ['labelId', 'id']
      : (kind === 'tags' ? ['tagId', 'id'] : ['categoryId', 'id']);
    var token = {
      kind: kind,
      index: index,
      id: firstValue(row, idFields),
      name: firstValue(row, ['name', 'label', 'title']),
      status: firstValue(row, ['status', 'lifecycleState']),
      source: firstValue(row, ['source', 'origin']),
      hasMetaJson: !!(row && (row.meta_json || row.metaJson || row.metadata))
    };
    if (kind === 'tags') token.autoDerived = boolValue(row && (row.autoDerived || row.auto_derived));
    if (kind === 'categories') token.parent = firstValue(row, ['parentId', 'parent_id']);
    if (kind === 'labels') token.hasColor = !!firstValue(row, ['color', 'colorHex']);
    return token;
  }

  function getStores() {
    return (H2O.Studio && H2O.Studio.store) || {};
  }

  function methodNames(api, names) {
    return names.filter(function (name) { return !!(api && typeof api[name] === 'function'); }).sort();
  }

  async function callNoArg(api, names) {
    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      if (api && typeof api[name] === 'function') {
        try { return await api[name](); }
        catch (_) { return null; }
      }
    }
    return null;
  }

  function countFromValue(value) {
    if (typeof value === 'number') return Math.max(0, value);
    if (isObject(value)) {
      return Math.max(0, numberOrZero(value.rowCount || value.count || value.n || value.total));
    }
    return null;
  }

  function sanitizeStoreDiagnose(value) {
    var diag = safeObject(value);
    var tables = Array.isArray(diag.tables)
      ? diag.tables.map(cleanString).filter(Boolean).sort()
      : (diag.table ? [cleanString(diag.table)] : []);
    return {
      installed: diag.installed === true,
      ready: diag.ready === true,
      backend: cleanString(diag.backend),
      schemaVersion: cleanString(diag.schemaVersion),
      tables: tables,
      writesSinceBoot: numberOrZero(diag.writesSinceBoot),
      warningCount: asArray(diag.warnings).length,
      errorCount: asArray(diag.errors).length,
      hasInitError: !!diag.initError,
      lastWriteObserved: !!cleanString(diag.lastWriteAt),
      lastReloadObserved: !!cleanString(diag.lastReloadedAt)
    };
  }

  async function readStoreSummary(kind, hashWarnings) {
    var api = getStores()[kind] || null;
    var readMethods = methodNames(api, ['getAll', 'list', 'count', 'diagnose', 'isReady']);
    var mutationApis = methodNames(api, [
      'create', 'upsert', 'patch', 'remove', 'delete',
      'bindChat', 'unbindChat', 'replaceForChat',
      'assignChat', 'clearChat'
    ]);
    if (!api) {
      addUnique(hashWarnings, WARNING_CODES.storeUnavailable + ':' + kind);
      return {
        available: false,
        readMethods: [],
        mutationApisPresent: [],
        rowCount: 0,
        rowHash: await hashValue([]),
        rowSource: 'unavailable',
        diagnose: sanitizeStoreDiagnose(null)
      };
    }

    var diagRaw = await callNoArg(api, ['diagnose']);
    var rows = await callNoArg(api, ['getAll', 'list']);
    var rowSource = Array.isArray(rows) ? 'store-read' : 'unavailable';
    if (!Array.isArray(rows)) addUnique(hashWarnings, WARNING_CODES.storeRowsUnavailable + ':' + kind);
    var countRaw = await callNoArg(api, ['count']);
    var count = Array.isArray(rows) ? rows.length : countFromValue(countRaw);
    if (count == null) count = 0;
    var tokens = Array.isArray(rows)
      ? rows.map(function (row, index) { return catalogRowToken(kind, safeObject(row), index); })
      : [];
    return {
      available: true,
      readMethods: readMethods,
      mutationApisPresent: mutationApis,
      rowCount: count,
      rowHash: await hashValue(tokens),
      rowSource: rowSource,
      diagnose: sanitizeStoreDiagnose(diagRaw)
    };
  }

  async function readChatStoreSummary(hashWarnings) {
    var api = getStores().chats || null;
    if (!api) {
      addUnique(hashWarnings, WARNING_CODES.storeUnavailable + ':chats');
      return {
        available: false,
        readMethods: [],
        mutationApisPresent: [],
        rowCount: 0,
        categoryAssignmentCount: 0,
        rowHash: await hashValue([]),
        diagnose: sanitizeStoreDiagnose(null)
      };
    }
    var readMethods = methodNames(api, ['getAll', 'list', 'count', 'diagnose', 'isReady']);
    var mutationApis = methodNames(api, ['create', 'upsert', 'patch', 'remove', 'delete']);
    var diagRaw = await callNoArg(api, ['diagnose']);
    var rows = await callNoArg(api, ['getAll', 'list']);
    if (!Array.isArray(rows)) addUnique(hashWarnings, WARNING_CODES.storeRowsUnavailable + ':chats');
    var countRaw = await callNoArg(api, ['count']);
    var count = Array.isArray(rows) ? rows.length : countFromValue(countRaw);
    if (count == null) count = 0;
    var tokens = Array.isArray(rows)
      ? rows.map(function (row, index) {
        return {
          rowKey: rowKey(row, index),
          category: collectCategoryTokens(row),
          classification: collectClassificationTokens(row)
        };
      })
      : [];
    return {
      available: true,
      readMethods: readMethods,
      mutationApisPresent: mutationApis,
      rowCount: count,
      categoryAssignmentCount: tokens.filter(function (token) { return token.category.length > 0; }).length,
      rowHash: await hashValue(tokens),
      diagnose: sanitizeStoreDiagnose(diagRaw)
    };
  }

  function indexSummary(rows, activeRows) {
    var tokens = activeRows.map(rowMetadataToken);
    var labelSet = [];
    var tagSet = [];
    var categorySet = [];
    var classificationSet = [];
    tokens.forEach(function (token) {
      labelSet = labelSet.concat(token.labels);
      tagSet = tagSet.concat(token.tags);
      categorySet = categorySet.concat(token.categories);
      classificationSet = classificationSet.concat(token.classification);
    });
    return {
      rowCount: rows.length,
      activeRowCount: activeRows.length,
      rowsWithLabels: tokens.filter(function (token) { return token.labels.length > 0; }).length,
      rowsWithTags: tokens.filter(function (token) { return token.tags.length > 0; }).length,
      rowsWithCategories: tokens.filter(function (token) { return token.categories.length > 0; }).length,
      rowsWithClassificationSignals: tokens.filter(function (token) { return token.classification.length > 0; }).length,
      rowsWithProjectSignals: tokens.filter(function (token) { return token.hasProjectSignal; }).length,
      labelFacetCount: uniqueSorted(labelSet).length,
      tagFacetCount: uniqueSorted(tagSet).length,
      categoryFacetCount: uniqueSorted(categorySet).length,
      classificationFacetCount: uniqueSorted(classificationSet).length,
      tokens: tokens
    };
  }

  function readIndexRows(warnings) {
    var idx = getIndex();
    var rows = [];
    try {
      if (idx && typeof idx.getAll === 'function') rows = asArray(idx.getAll());
      else addUnique(warnings, WARNING_CODES.indexUnavailable);
    } catch (_) {
      rows = [];
      addUnique(warnings, WARNING_CODES.indexUnavailable);
    }
    return rows;
  }

  async function readWorkspaceSummary(kind) {
    var workspace = H2O.LibraryWorkspace || (H2O.Studio && H2O.Studio.LibraryWorkspace) || null;
    if (!workspace) return { available: false, source: 'unavailable', rowCount: 0, rowHash: await hashValue([]) };
    var methodMap = {
      labels: ['getLabels', 'listLabels'],
      tags: ['getTags', 'listTags'],
      categories: ['getCategories', 'listCategories']
    };
    var rows = await callNoArg(workspace, methodMap[kind] || []);
    var tokens = Array.isArray(rows)
      ? rows.map(function (row, index) { return catalogRowToken(kind, safeObject(row), index); })
      : [];
    return {
      available: Array.isArray(rows),
      source: Array.isArray(rows) ? 'workspace' : 'unavailable',
      rowCount: tokens.length,
      rowHash: await hashValue(tokens)
    };
  }

  async function readFolderSyncDiagnostic(warnings) {
    var api = H2O.Studio && H2O.Studio.sync && H2O.Studio.sync.folder;
    var diag = null;
    if (api && typeof api.diagnose === 'function') {
      try { diag = await api.diagnose(); }
      catch (_) { diag = null; }
    }
    var observed = [];
    collectCodesFrom(diag, observed);
    observed.forEach(function (code) { addUnique(warnings, code); });
    return {
      available: !!api,
      diagnoseAvailable: !!(api && typeof api.diagnose === 'function'),
      syncNowAvailable: !!(api && typeof api.syncNow === 'function'),
      importLatestBundleAvailable: !!(api && typeof api.importLatestBundle === 'function'),
      exportChromeToSyncFolderAvailable: !!(api && typeof api.exportChromeToSyncFolder === 'function'),
      observedWarningCount: observed.length,
      observedDeferredWarnings: observed.filter(isDeferredWarning).sort()
    };
  }

  function safeProjectionHash(value) {
    var text = cleanString(value);
    if (!text) return '';
    if (!/^[a-z0-9][a-z0-9:._-]{3,180}$/i.test(text)) return '';
    return text;
  }

  function summarizeDesktopCanonicalLibraryMetadataProjection(value) {
    var input = safeObject(value);
    var counts = safeObject(input.counts);
    var hashes = safeObject(input.hashes);
    var available = cleanString(input.schema) === DESKTOP_CANONICAL_LIBRARY_METADATA_SCHEMA ||
      input.available === true ||
      !!safeProjectionHash(hashes.projection || input.projectionHash);
    return {
      available: available,
      schema: available ? (cleanString(input.schema) || DESKTOP_CANONICAL_LIBRARY_METADATA_SCHEMA) : '',
      version: cleanString(input.version),
      phase: cleanString(input.phase),
      section: 'desktopCanonicalLibraryMetadata',
      sourceName: cleanString(input.sourceName || input.displaySourceName || input.source || 'desktopCanonicalLibraryMetadata'),
      displayMode: cleanString(input.displayMode || 'hash-count-read-model'),
      uiDisplayNamesAvailable: input.uiDisplayNamesAvailable === true,
      uiDisplayDeferred: input.uiDisplayDeferred !== false,
      counts: {
        labelCatalogCount: numberOrZero(counts.labelCatalogCount || input.labelCatalogCount),
        tagCatalogCount: numberOrZero(counts.tagCatalogCount || input.tagCatalogCount),
        categoryCatalogCount: numberOrZero(counts.categoryCatalogCount || input.categoryCatalogCount),
        chatStoreRowCount: numberOrZero(counts.chatStoreRowCount || input.chatStoreRowCount),
        chatLabelBindingCount: numberOrZero(counts.chatLabelBindingCount || input.chatLabelBindingCount),
        chatTagBindingCount: numberOrZero(counts.chatTagBindingCount || input.chatTagBindingCount),
        chatCategoryAssignmentCount: numberOrZero(counts.chatCategoryAssignmentCount || input.chatCategoryAssignmentCount),
        classificationSignalCount: numberOrZero(counts.classificationSignalCount || input.classificationSignalCount)
      },
      hashes: {
        labels: safeProjectionHash(hashes.labels),
        tags: safeProjectionHash(hashes.tags),
        categories: safeProjectionHash(hashes.categories),
        chatLabelBindings: safeProjectionHash(hashes.chatLabelBindings),
        chatTagBindings: safeProjectionHash(hashes.chatTagBindings),
        chatCategoryAssignments: safeProjectionHash(hashes.chatCategoryAssignments),
        projection: safeProjectionHash(hashes.projection || input.projectionHash)
      },
      importedAt: cleanString(input.importedAt),
      sourceExportedAt: cleanString(input.sourceExportedAt || input.exportedAt),
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
        accountLinkedMetadata: false
      },
      desktopAuthority: input.desktopAuthority !== false,
      chromeAuthority: false,
      readOnlyProjection: input.readOnlyProjection !== false,
      productSyncReady: false,
      chromeRequestExport: false,
      desktopApply: false,
      canonicalMutation: false,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noSnapshotDelete: true,
      noAssetDelete: true
    };
  }

  async function readDesktopCanonicalLibraryMetadataProjectionSummary(detected, warnings) {
    var sync = (H2O.Studio && H2O.Studio.sync) || {};
    try {
      if (detected && detected.isChrome && sync.folder) {
        if (typeof sync.folder.diagnoseDesktopCanonicalLibraryMetadata === 'function') {
          return summarizeDesktopCanonicalLibraryMetadataProjection(await sync.folder.diagnoseDesktopCanonicalLibraryMetadata());
        }
        if (typeof sync.folder.getDesktopCanonicalLibraryMetadata === 'function') {
          return summarizeDesktopCanonicalLibraryMetadataProjection(await sync.folder.getDesktopCanonicalLibraryMetadata());
        }
      }
      if (detected && detected.isTauri && sync.libraryMetadataExportProjection &&
          typeof sync.libraryMetadataExportProjection.buildDesktopCanonicalMetadataExport === 'function') {
        return summarizeDesktopCanonicalLibraryMetadataProjection(await sync.libraryMetadataExportProjection.buildDesktopCanonicalMetadataExport({
          requestedBy: 'library-metadata-diagnostics'
        }));
      }
    } catch (e) {
      addUnique(warnings, 'library-metadata-diagnostics-desktop-canonical-projection-read-failed');
    }
    return summarizeDesktopCanonicalLibraryMetadataProjection(null);
  }

  function collectCodesFrom(value, out) {
    if (!value) return;
    if (typeof value === 'string') {
      addUnique(out, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(function (entry) { collectCodesFrom(entry, out); });
      return;
    }
    if (!isObject(value)) return;
    if (value.code) addUnique(out, value.code);
    if (value.warning) addUnique(out, value.warning);
    if (value.warn) addUnique(out, value.warn);
    if (Array.isArray(value.warnings)) collectCodesFrom(value.warnings, out);
    if (Array.isArray(value.deferredFields)) collectCodesFrom(value.deferredFields, out);
    if (Array.isArray(value.blockers)) collectCodesFrom(value.blockers, out);
    if (isObject(value.hardening)) collectCodesFrom(value.hardening.warnings, out);
    if (isObject(value.latestSummary)) collectCodesFrom(value.latestSummary, out);
    if (isObject(value.importSummary)) collectCodesFrom(value.importSummary, out);
  }

  function isDeferredWarning(code) {
    var normalized = cleanString(code);
    return Object.keys(DEFERRED_WARNING_CODES).some(function (key) {
      return DEFERRED_WARNING_CODES[key] === normalized;
    });
  }

  function deferredWarningSummary(observed) {
    var codes = Object.keys(DEFERRED_WARNING_CODES).map(function (key) {
      return DEFERRED_WARNING_CODES[key];
    }).sort();
    var required = [
      DEFERRED_WARNING_CODES.labels,
      DEFERRED_WARNING_CODES.tags,
      DEFERRED_WARNING_CODES.unsupportedStorage
    ];
    var observedDeferred = uniqueSorted(asArray(observed).filter(isDeferredWarning));
    return {
      taxonomyPresent: true,
      expectedCodes: codes,
      requiredPhase1Codes: required,
      observedCodes: observedDeferred,
      labelsDeferredObserved: observedDeferred.indexOf(DEFERRED_WARNING_CODES.labels) !== -1,
      tagsDeferredObserved: observedDeferred.indexOf(DEFERRED_WARNING_CODES.tags) !== -1,
      unsupportedStorageDeferredObserved: observedDeferred.indexOf(DEFERRED_WARNING_CODES.unsupportedStorage) !== -1
    };
  }

  function readF15Summary() {
    var sync = (H2O.Desktop && H2O.Desktop.Sync) || {};
    var allowed = Array.isArray(sync.__f15CutoverAllowedWriterIdentities)
      ? sync.__f15CutoverAllowedWriterIdentities.slice()
      : [];
    return {
      desktopSyncAvailable: !!(H2O.Desktop && H2O.Desktop.Sync),
      catalogCanonicalizerAvailable: typeof sync.canonicalizeLibraryCatalog === 'function',
      bindingCanonicalizerAvailable: typeof sync.canonicalizeLibraryBinding === 'function',
      catalogDiagnosticsAvailable: typeof sync.diagnoseLibraryCatalog === 'function',
      bindingDiagnosticsAvailable: typeof sync.diagnoseLibraryBinding === 'function',
      storeCutoverShimsInstalled: sync.__libraryStoreCutoverShimsInstalled === true,
      storeCutoverShimsVersion: cleanString(sync.__libraryStoreCutoverShimsVersion),
      sqliteWriterIdentitySentinelInstalled: sync.__sqliteWriterIdentitySentinelInstalled === true,
      sqliteWriterIdentitySentinelVersion: cleanString(sync.__sqliteWriterIdentitySentinelVersion),
      proveWriterIdentityAvailable: typeof sync.proveSQLiteWriterIdentitySentinel === 'function',
      executeSettlementSqliteAvailable: typeof sync.executeSettlementSqlite === 'function',
      allowedWriterIdentityCount: allowed.length,
      allowedWriterIdentitiesRedacted: true,
      triggerRuntimeProofRequired: true,
      runtimeProofInvoked: false
    };
  }

  function readPropagationReadiness(folderSyncSummary) {
    var ingestion = (H2O.Studio && H2O.Studio.ingestion) || {};
    var sync = (H2O.Studio && H2O.Studio.sync) || {};
    return {
      exportLatestSyncBundleAvailable: typeof ingestion.exportLatestSyncBundle === 'function',
      autoExportAvailable: !!sync.autoExport,
      folderSyncDiagnosticAvailable: !!(folderSyncSummary && folderSyncSummary.diagnoseAvailable),
      folderSyncNowAvailable: !!(folderSyncSummary && folderSyncSummary.syncNowAvailable),
      importLatestBundleAvailable: !!(folderSyncSummary && folderSyncSummary.importLatestBundleAvailable),
      libraryParityDiagnosticReady: !!sync.libraryParity,
      metadataProductSyncWritesAdded: false,
      chromeCanonicalMutationAllowed: false,
      desktopApplyBehaviorAdded: false,
      chromeRequestExportAdded: false,
      productSyncReady: false,
      phase1DiagnosticsReady: true
    };
  }

  function privacySummary() {
    return {
      redacted: true,
      hashOnly: true,
      rawIdsReturned: false,
      rawTitlesReturned: false,
      rawContentReturned: false,
      rawLabelNamesReturned: false,
      rawTagNamesReturned: false,
      rawCategoryNamesReturned: false,
      rawColorsReturned: false,
      accountLinkedMetadataReturned: false
    };
  }

  function sideEffectSummary() {
    return {
      productSyncWritesAdded: false,
      storageWritten: false,
      sqliteWritten: false,
      chromeStorageWritten: false,
      importInvoked: false,
      exportInvoked: false,
      syncNowInvoked: false,
      applyExecuted: false,
      desktopApplyExecuted: false,
      chromeRequestExported: false,
      canonicalMutationAttempted: false,
      deleteExecuted: false,
      purgeExecuted: false,
      chatDeleted: false,
      snapshotDeleted: false,
      assetDeleted: false
    };
  }

  function buildDisplayParityModel(snapshotInput) {
    var snapshot = snapshotSummary(snapshotInput);
    var projection = summarizeDesktopCanonicalLibraryMetadataProjection(snapshot.desktopCanonicalLibraryMetadata);
    var blockers = [];
    if (!projection.available) addUnique(blockers, 'library-metadata-display-parity-projection-unavailable');
    return {
      schema: DISPLAY_PARITY_SCHEMA,
      version: DISPLAY_PARITY_VERSION,
      phase: 'phase5-read-only-display-parity',
      ok: projection.available === true,
      status: projection.available ? 'desktop-canonical-library-metadata-display-ready' : 'desktop-canonical-library-metadata-unavailable',
      surface: cleanString(snapshot.surface),
      sourceName: 'desktopCanonicalLibraryMetadata',
      section: 'desktopCanonicalLibraryMetadata',
      projectionSchema: cleanString(projection.schema),
      projectionVersion: cleanString(projection.version),
      projectionPhase: cleanString(projection.phase),
      available: projection.available === true,
      displayMode: cleanString(projection.displayMode || 'hash-count-read-model'),
      displaySurface: 'library-metadata-diagnostics-display-parity-model',
      uiDisplayNamesAvailable: projection.uiDisplayNamesAvailable === true,
      uiDisplayDeferred: projection.uiDisplayDeferred !== false,
      userFacingNote: projection.uiDisplayNamesAvailable === true
        ? 'Desktop-origin metadata names are available from the read-only projection.'
        : 'Desktop-origin metadata names and details are deferred; Phase 5 displays counts, hashes, status, and authority flags only.',
      displayedFields: [
        'sourceName',
        'projectionSchema',
        'projectionVersion',
        'projectionPhase',
        'displayMode',
        'counts.labelCatalogCount',
        'counts.tagCatalogCount',
        'counts.categoryCatalogCount',
        'counts.chatCategoryAssignmentCount',
        'counts.classificationSignalCount',
        'projectionHash',
        'flags.desktopAuthority',
        'flags.chromeAuthority',
        'flags.readOnlyProjection',
        'flags.chromeRequestExport',
        'flags.desktopApply',
        'flags.canonicalMutation',
        'privacy.redacted',
        'privacy.hashOnly'
      ],
      counts: {
        labelCatalogCount: numberOrZero(projection.counts.labelCatalogCount),
        tagCatalogCount: numberOrZero(projection.counts.tagCatalogCount),
        categoryCatalogCount: numberOrZero(projection.counts.categoryCatalogCount),
        chatCategoryAssignmentCount: numberOrZero(projection.counts.chatCategoryAssignmentCount),
        classificationSignalCount: numberOrZero(projection.counts.classificationSignalCount)
      },
      projectionHash: safeProjectionHash(projection.hashes.projection),
      flags: {
        desktopAuthority: projection.desktopAuthority !== false,
        chromeAuthority: false,
        readOnlyProjection: projection.readOnlyProjection !== false,
        chromeRequestExport: false,
        desktopApply: false,
        canonicalMutation: false,
        productSyncReady: false
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
        accountLinkedMetadata: false
      },
      sideEffectSummary: sideEffectSummary(),
      safety: {
        noHardDelete: true,
        noPurge: true,
        noChatDelete: true,
        noSnapshotDelete: true,
        noAssetDelete: true,
        noLabelDelete: true,
        noTagDelete: true,
        noCategoryDelete: true,
        noMetadataDelete: true
      },
      blockers: blockers,
      warnings: uniqueSorted(snapshot.warnings),
      observedAtIso: nowIso()
    };
  }

  async function captureDisplayParityModel(options) {
    var snapshot = await captureSnapshot(options || {});
    return buildDisplayParityModel(snapshot);
  }

  async function captureSnapshot(options) {
    var opts = safeObject(options);
    var detected = detectSurface();
    var warnings = [];
    collectCodesFrom(opts.warnings, warnings);
    collectCodesFrom(opts.latestSummary, warnings);
    collectCodesFrom(opts.latestResult, warnings);

    var rows = readIndexRows(warnings);
    var activeRows = canonicalActiveRows(rows);
    var idx = indexSummary(rows, activeRows);
    var folderSyncSummary = await readFolderSyncDiagnostic(warnings);
    var desktopCanonicalLibraryMetadata = await readDesktopCanonicalLibraryMetadataProjectionSummary(detected, warnings);
    var stores = {
      labels: await readStoreSummary('labels', warnings),
      tags: await readStoreSummary('tags', warnings),
      categories: await readStoreSummary('categories', warnings),
      chats: await readChatStoreSummary(warnings)
    };
    var workspace = {
      labels: await readWorkspaceSummary('labels'),
      tags: await readWorkspaceSummary('tags'),
      categories: await readWorkspaceSummary('categories')
    };
    var deferred = deferredWarningSummary(warnings);
    var f15 = readF15Summary();
    if (detected.isTauri && (!f15.storeCutoverShimsInstalled || !f15.sqliteWriterIdentitySentinelInstalled)) {
      addUnique(warnings, WARNING_CODES.f15RuntimeProofRequired);
    }
    addUnique(warnings, WARNING_CODES.productSyncNotReady);

    return {
      schema: SNAPSHOT_SCHEMA,
      version: VERSION,
      phase: 'phase1-read-only-diagnostics',
      surface: cleanString(opts.surfaceOverride) || detected.surface,
      sourceType: cleanString(opts.sourceTypeOverride) || detected.sourceType,
      sourceAvailable: rows.length > 0 || stores.labels.available || stores.tags.available ||
        stores.categories.available || desktopCanonicalLibraryMetadata.available === true,
      observedAtIso: nowIso(),
      privacy: privacySummary(),
      sideEffectSummary: sideEffectSummary(),
      sourceMetadata: {
        platformAdapter: detected.adapter,
        isTauri: detected.isTauri,
        isChromeRuntime: detected.isChrome,
        libraryIndexAvailable: !!getIndex(),
        libraryIndexCoreAvailable: !!getLibraryIndexCore(),
        snapshotMode: 'cache-and-store-read-only'
      },
      counts: {
        libraryIndexRows: idx.rowCount,
        libraryIndexActiveRows: idx.activeRowCount,
        rowsWithLabels: idx.rowsWithLabels,
        rowsWithTags: idx.rowsWithTags,
        rowsWithCategories: idx.rowsWithCategories,
        rowsWithClassificationSignals: idx.rowsWithClassificationSignals,
        rowsWithProjectSignals: idx.rowsWithProjectSignals,
        labelFacetCount: idx.labelFacetCount,
        tagFacetCount: idx.tagFacetCount,
        categoryFacetCount: idx.categoryFacetCount,
        classificationFacetCount: idx.classificationFacetCount,
        labelStoreRows: stores.labels.rowCount,
        tagStoreRows: stores.tags.rowCount,
        categoryStoreRows: stores.categories.rowCount,
        chatStoreRows: stores.chats.rowCount,
        chatCategoryAssignments: stores.chats.categoryAssignmentCount,
        desktopCanonicalMetadataLabelCount: desktopCanonicalLibraryMetadata.counts.labelCatalogCount,
        desktopCanonicalMetadataTagCount: desktopCanonicalLibraryMetadata.counts.tagCatalogCount,
        desktopCanonicalMetadataCategoryCount: desktopCanonicalLibraryMetadata.counts.categoryCatalogCount,
        desktopCanonicalMetadataChatCategoryAssignmentCount: desktopCanonicalLibraryMetadata.counts.chatCategoryAssignmentCount
      },
      hashes: {
        rowMetadata: await hashValue(idx.tokens),
        labels: await hashValue({
          store: stores.labels.rowHash,
          workspace: workspace.labels.rowHash,
          facets: uniqueSorted(idx.tokens.reduce(function (out, token) { return out.concat(token.labels); }, []))
        }),
        tags: await hashValue({
          store: stores.tags.rowHash,
          workspace: workspace.tags.rowHash,
          facets: uniqueSorted(idx.tokens.reduce(function (out, token) { return out.concat(token.tags); }, []))
        }),
        categories: await hashValue({
          store: stores.categories.rowHash,
          workspace: workspace.categories.rowHash,
          facets: uniqueSorted(idx.tokens.reduce(function (out, token) { return out.concat(token.categories); }, []))
        }),
        classification: await hashValue(uniqueSorted(idx.tokens.reduce(function (out, token) {
          return out.concat(token.classification);
        }, []))),
        chatCategoryCache: stores.chats.rowHash,
        desktopCanonicalLibraryMetadataProjection: cleanString(desktopCanonicalLibraryMetadata.hashes.projection)
      },
      stores: stores,
      workspace: workspace,
      f15: f15,
      propagation: readPropagationReadiness(folderSyncSummary),
      desktopCanonicalLibraryMetadata: desktopCanonicalLibraryMetadata,
      folderSync: folderSyncSummary,
      deferredWarnings: deferred,
      warnings: uniqueSorted(warnings),
      blockers: [],
      verdict: {
        diagnosticsReady: true,
        productSyncReady: false,
        recommendedNextSlice: 'desktop-canonical-metadata-export'
      }
    };
  }

  function snapshotSummary(snapshot) {
    var s = safeObject(snapshot);
    return {
      schema: cleanString(s.schema),
      version: cleanString(s.version),
      phase: cleanString(s.phase),
      surface: cleanString(s.surface),
      sourceType: cleanString(s.sourceType),
      sourceAvailable: s.sourceAvailable === true,
      sourceMetadata: safeObject(s.sourceMetadata),
      counts: safeObject(s.counts),
      hashes: safeObject(s.hashes),
      f15: safeObject(s.f15),
      propagation: safeObject(s.propagation),
      desktopCanonicalLibraryMetadata: summarizeDesktopCanonicalLibraryMetadataProjection(s.desktopCanonicalLibraryMetadata),
      deferredWarnings: safeObject(s.deferredWarnings),
      warnings: asArray(s.warnings).map(cleanString).filter(Boolean),
      blockers: asArray(s.blockers).map(cleanString).filter(Boolean),
      privacy: safeObject(s.privacy),
      sideEffectSummary: safeObject(s.sideEffectSummary),
      observedAtIso: cleanString(s.observedAtIso)
    };
  }

  function normalizeCompareInput(leftSnapshot, rightSnapshot) {
    var left = safeObject(leftSnapshot);
    var right = safeObject(rightSnapshot);
    if (left.surface === 'desktop-studio' && right.surface === 'chrome-studio') {
      return { chrome: right, desktop: left };
    }
    return { chrome: left, desktop: right };
  }

  function mismatch(list, code, field, chromeValue, desktopValue) {
    list.push({
      code: code,
      field: field,
      chrome: chromeValue,
      desktop: desktopValue
    });
  }

  function compareField(mismatches, code, field, chromeValue, desktopValue) {
    if (chromeValue !== desktopValue) mismatch(mismatches, code, field, chromeValue, desktopValue);
  }

  function compareSnapshots(leftSnapshot, rightSnapshot) {
    var normalized = normalizeCompareInput(leftSnapshot, rightSnapshot);
    var chrome = snapshotSummary(normalized.chrome);
    var desktop = snapshotSummary(normalized.desktop);
    var mismatches = [];
    var warnings = [];

    if (chrome.schema !== SNAPSHOT_SCHEMA) mismatch(mismatches, MISMATCH_CODES.schema, 'chrome.schema', chrome.schema, SNAPSHOT_SCHEMA);
    if (desktop.schema !== SNAPSHOT_SCHEMA) mismatch(mismatches, MISMATCH_CODES.schema, 'desktop.schema', desktop.schema, SNAPSHOT_SCHEMA);
    if (!chrome.sourceAvailable) mismatch(mismatches, MISMATCH_CODES.source, 'chrome.sourceAvailable', chrome.sourceAvailable, true);
    if (!desktop.sourceAvailable) mismatch(mismatches, MISMATCH_CODES.source, 'desktop.sourceAvailable', desktop.sourceAvailable, true);

    compareField(mismatches, MISMATCH_CODES.labels, 'counts.rowsWithLabels', numberOrZero(chrome.counts.rowsWithLabels), numberOrZero(desktop.counts.rowsWithLabels));
    compareField(mismatches, MISMATCH_CODES.tags, 'counts.rowsWithTags', numberOrZero(chrome.counts.rowsWithTags), numberOrZero(desktop.counts.rowsWithTags));
    compareField(mismatches, MISMATCH_CODES.categories, 'counts.rowsWithCategories', numberOrZero(chrome.counts.rowsWithCategories), numberOrZero(desktop.counts.rowsWithCategories));
    compareField(mismatches, MISMATCH_CODES.classification, 'counts.rowsWithClassificationSignals', numberOrZero(chrome.counts.rowsWithClassificationSignals), numberOrZero(desktop.counts.rowsWithClassificationSignals));
    compareField(mismatches, MISMATCH_CODES.labels, 'counts.labelFacetCount', numberOrZero(chrome.counts.labelFacetCount), numberOrZero(desktop.counts.labelFacetCount));
    compareField(mismatches, MISMATCH_CODES.tags, 'counts.tagFacetCount', numberOrZero(chrome.counts.tagFacetCount), numberOrZero(desktop.counts.tagFacetCount));
    compareField(mismatches, MISMATCH_CODES.categories, 'counts.categoryFacetCount', numberOrZero(chrome.counts.categoryFacetCount), numberOrZero(desktop.counts.categoryFacetCount));
    compareField(mismatches, MISMATCH_CODES.classification, 'counts.classificationFacetCount', numberOrZero(chrome.counts.classificationFacetCount), numberOrZero(desktop.counts.classificationFacetCount));
    compareField(mismatches, MISMATCH_CODES.labels, 'hashes.labels', cleanString(chrome.hashes.labels), cleanString(desktop.hashes.labels));
    compareField(mismatches, MISMATCH_CODES.tags, 'hashes.tags', cleanString(chrome.hashes.tags), cleanString(desktop.hashes.tags));
    compareField(mismatches, MISMATCH_CODES.categories, 'hashes.categories', cleanString(chrome.hashes.categories), cleanString(desktop.hashes.categories));
    compareField(mismatches, MISMATCH_CODES.classification, 'hashes.classification', cleanString(chrome.hashes.classification), cleanString(desktop.hashes.classification));
    compareField(mismatches, MISMATCH_CODES.classification, 'hashes.rowMetadata', cleanString(chrome.hashes.rowMetadata), cleanString(desktop.hashes.rowMetadata));
    if (chrome.desktopCanonicalLibraryMetadata.available || desktop.desktopCanonicalLibraryMetadata.available) {
      compareField(mismatches, MISMATCH_CODES.desktopCanonicalProjection, 'desktopCanonicalLibraryMetadata.available',
        chrome.desktopCanonicalLibraryMetadata.available === true,
        desktop.desktopCanonicalLibraryMetadata.available === true);
      compareField(mismatches, MISMATCH_CODES.desktopCanonicalProjection, 'desktopCanonicalLibraryMetadata.counts.labelCatalogCount',
        numberOrZero(chrome.desktopCanonicalLibraryMetadata.counts.labelCatalogCount),
        numberOrZero(desktop.desktopCanonicalLibraryMetadata.counts.labelCatalogCount));
      compareField(mismatches, MISMATCH_CODES.desktopCanonicalProjection, 'desktopCanonicalLibraryMetadata.counts.tagCatalogCount',
        numberOrZero(chrome.desktopCanonicalLibraryMetadata.counts.tagCatalogCount),
        numberOrZero(desktop.desktopCanonicalLibraryMetadata.counts.tagCatalogCount));
      compareField(mismatches, MISMATCH_CODES.desktopCanonicalProjection, 'desktopCanonicalLibraryMetadata.counts.categoryCatalogCount',
        numberOrZero(chrome.desktopCanonicalLibraryMetadata.counts.categoryCatalogCount),
        numberOrZero(desktop.desktopCanonicalLibraryMetadata.counts.categoryCatalogCount));
      compareField(mismatches, MISMATCH_CODES.desktopCanonicalProjection, 'desktopCanonicalLibraryMetadata.counts.chatCategoryAssignmentCount',
        numberOrZero(chrome.desktopCanonicalLibraryMetadata.counts.chatCategoryAssignmentCount),
        numberOrZero(desktop.desktopCanonicalLibraryMetadata.counts.chatCategoryAssignmentCount));
      compareField(mismatches, MISMATCH_CODES.desktopCanonicalProjection, 'desktopCanonicalLibraryMetadata.hashes.projection',
        cleanString(chrome.desktopCanonicalLibraryMetadata.hashes.projection),
        cleanString(desktop.desktopCanonicalLibraryMetadata.hashes.projection));
    }
    compareField(mismatches, MISMATCH_CODES.deferredWarnings, 'deferredWarnings.observedCodes', canonicalJson(chrome.deferredWarnings.observedCodes), canonicalJson(desktop.deferredWarnings.observedCodes));
    compareField(mismatches, MISMATCH_CODES.f15, 'f15.storeCutoverShimsInstalled', chrome.f15.storeCutoverShimsInstalled === true, desktop.f15.storeCutoverShimsInstalled === true);
    compareField(mismatches, MISMATCH_CODES.f15, 'f15.sqliteWriterIdentitySentinelInstalled', chrome.f15.sqliteWriterIdentitySentinelInstalled === true, desktop.f15.sqliteWriterIdentitySentinelInstalled === true);

    chrome.warnings.concat(desktop.warnings).forEach(function (code) { addUnique(warnings, code); });

    return {
      schema: COMPARISON_SCHEMA,
      version: VERSION,
      phase: 'phase1-read-only-diagnostics',
      ok: mismatches.length === 0,
      status: mismatches.length === 0 ? 'match' : 'mismatch',
      chrome: chrome,
      desktop: desktop,
      mismatches: mismatches,
      blockers: mismatches.map(function (entry) { return entry.code; }).filter(function (code, index, list) {
        return code && list.indexOf(code) === index;
      }).sort(),
      warnings: uniqueSorted(warnings),
      privacy: privacySummary(),
      sideEffectSummary: sideEffectSummary(),
      observedAtIso: nowIso()
    };
  }

  async function runDiagnostic(input) {
    var args = safeObject(input);
    var chromeSnapshot = args.chromeSnapshot || null;
    var desktopSnapshot = args.desktopSnapshot || null;
    var localSnapshot = null;
    if (!chromeSnapshot || !desktopSnapshot) {
      localSnapshot = await captureSnapshot(args.captureOptions || {});
      if (localSnapshot.surface === 'chrome-studio' && !chromeSnapshot) chromeSnapshot = localSnapshot;
      if (localSnapshot.surface === 'desktop-studio' && !desktopSnapshot) desktopSnapshot = localSnapshot;
    }
    if (!chromeSnapshot || !desktopSnapshot) {
      return {
        schema: COMPARISON_SCHEMA,
        version: VERSION,
        phase: 'phase1-read-only-diagnostics',
        ok: false,
        status: 'peer-snapshot-required',
        localSnapshot: localSnapshot ? snapshotSummary(localSnapshot) : null,
        chrome: chromeSnapshot ? snapshotSummary(chromeSnapshot) : null,
        desktop: desktopSnapshot ? snapshotSummary(desktopSnapshot) : null,
        mismatches: [{
          code: WARNING_CODES.peerRequired,
          field: chromeSnapshot ? 'desktopSnapshot' : 'chromeSnapshot',
          chrome: !!chromeSnapshot,
          desktop: !!desktopSnapshot
        }],
        blockers: [WARNING_CODES.peerRequired],
        warnings: [WARNING_CODES.localOnly],
        privacy: privacySummary(),
        sideEffectSummary: sideEffectSummary(),
        observedAtIso: nowIso()
      };
    }
    return compareSnapshots(chromeSnapshot, desktopSnapshot);
  }

  function listDeferredWarningCodes() {
    return Object.keys(DEFERRED_WARNING_CODES).map(function (key) {
      return DEFERRED_WARNING_CODES[key];
    }).sort();
  }

  function listMismatchCodes() {
    return Object.keys(MISMATCH_CODES).map(function (key) {
      return MISMATCH_CODES[key];
    }).sort();
  }

  var api = {
    __installed: true,
    version: VERSION,
    snapshotSchema: SNAPSHOT_SCHEMA,
    comparisonSchema: COMPARISON_SCHEMA,
    displayParitySchema: DISPLAY_PARITY_SCHEMA,
    captureSnapshot: captureSnapshot,
    compareSnapshots: compareSnapshots,
    runDiagnostic: runDiagnostic,
    buildDisplayParityModel: buildDisplayParityModel,
    captureDisplayParityModel: captureDisplayParityModel,
    listDeferredWarningCodes: listDeferredWarningCodes,
    listMismatchCodes: listMismatchCodes,
    warningCodes: Object.keys(WARNING_CODES).map(function (key) { return WARNING_CODES[key]; }).sort()
  };

  H2O.Studio.sync.libraryMetadataDiagnostics = api;
  H2O.Studio.sync.captureLibraryMetadataDiagnosticSnapshot = captureSnapshot;
  H2O.Studio.sync.compareLibraryMetadataDiagnosticSnapshots = compareSnapshots;
  H2O.Studio.sync.runLibraryMetadataDiagnostics = runDiagnostic;
  H2O.Studio.sync.captureLibraryMetadataDisplayParityModel = captureDisplayParityModel;
})(typeof globalThis !== 'undefined' ? globalThis : window);
