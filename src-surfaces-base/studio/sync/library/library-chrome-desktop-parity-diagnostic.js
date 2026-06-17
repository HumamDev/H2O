/* H2O Studio Sync - F19.1.a Chrome/Desktop Library parity diagnostic
 *
 * Read-only diagnostic foundation for premium sync. Captures hash-only
 * evidence from the current Studio surface and compares it with a supplied
 * peer snapshot. No import, export, settlement, storage write, SQLite write,
 * Native/F5 call, or propagation behavior change is allowed here.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Library = H2O.Library || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};

  var VERSION = '0.1.0-f19.1.a';
  var SNAPSHOT_SCHEMA = 'h2o.studio.sync.library-parity-snapshot.v1';
  var PARITY_SCHEMA = 'h2o.studio.sync.chrome-desktop-library-parity.v1';

  var MISMATCH_CODES = {
    count: 'library-parity-count-mismatch',
    saved: 'library-parity-saved-count-mismatch',
    linked: 'library-parity-linked-count-mismatch',
    pinned: 'library-parity-pinned-count-mismatch',
    archived: 'library-parity-archived-count-mismatch',
    folders: 'library-parity-folder-mismatch',
    labels: 'library-parity-label-mismatch',
    categories: 'library-parity-category-mismatch',
    projects: 'library-parity-project-mismatch',
    recents: 'library-parity-recents-mismatch',
    missingSource: 'library-parity-missing-source',
    chromeUnavailable: 'library-parity-chrome-source-unavailable',
    desktopUnavailable: 'library-parity-desktop-sqlite-source-unavailable',
    schema: 'library-parity-schema-mismatch',
    peerRequired: 'library-parity-peer-snapshot-required'
  };

  var WARNING_CODES = {
    identityWorkspaceUnknown: 'library-parity-identity-workspace-unknown',
    localOnly: 'library-parity-local-snapshot-only',
    catalogPartial: 'library-parity-catalog-source-partial'
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized) return;
    if (list.indexOf(normalized) === -1) list.push(normalized);
  }

  function detectSurface() {
    var isTauri = false;
    var isChrome = false;
    var adapter = '';
    try {
      isTauri = !!(global.__TAURI_INTERNALS__ || global.__TAURI__ ||
        (H2O.Studio.platform && H2O.Studio.platform.env && H2O.Studio.platform.env.isTauri === true));
    } catch (_) { isTauri = false; }
    try {
      isChrome = !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) { isChrome = false; }
    try {
      adapter = cleanString(H2O.Studio.platform && H2O.Studio.platform.env && H2O.Studio.platform.env.adapter);
    } catch (_) { adapter = ''; }
    if (isTauri) {
      return { surface: 'desktop-studio', sourceType: 'desktop-sqlite-library-index', isTauri: true, isChrome: false, adapter: adapter || 'tauri' };
    }
    if (isChrome) {
      return { surface: 'chrome-studio', sourceType: 'chrome-library-index', isTauri: false, isChrome: true, adapter: adapter || 'mv3' };
    }
    return { surface: 'unknown-studio', sourceType: 'unknown-library-index', isTauri: false, isChrome: false, adapter: adapter || 'unknown' };
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
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
      var cryptoApi = global.crypto;
      if (cryptoApi && cryptoApi.subtle && typeof cryptoApi.subtle.digest === 'function' && typeof TextEncoder !== 'undefined') {
        var bytes = new TextEncoder().encode(input);
        var digest = await cryptoApi.subtle.digest('SHA-256', bytes);
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

  function rowId(row) {
    return cleanString(row.chatId || row.id || row.externalId || row.conversationId);
  }

  function boolValue(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function rowView(row) {
    return cleanString(row.view || row.status || '').toLowerCase();
  }

  function isSaved(row) {
    var view = rowView(row);
    return view === 'saved' || boolValue(row.saved) || boolValue(row.isSaved);
  }

  function isLinked(row) {
    var view = rowView(row);
    return view === 'linked' || boolValue(row.linked) || boolValue(row.isLinked);
  }

  function isArchived(row) {
    var view = rowView(row);
    return view === 'archived' || boolValue(row.archived) || boolValue(row.isArchived);
  }

  function isDeleted(row) {
    var view = rowView(row);
    return view === 'deleted' || view === 'tombstone' || view === 'tombstoned' ||
      boolValue(row.deleted) || boolValue(row.isDeleted) || boolValue(row.tombstoned);
  }

  function isPinned(row) {
    return boolValue(row.pinned) || boolValue(row.isPinned);
  }

  function firstId(row, names) {
    for (var i = 0; i < names.length; i += 1) {
      var value = cleanString(row && row[names[i]]);
      if (value) return value;
    }
    return '';
  }

  function uniqueSorted(values) {
    var seen = Object.create(null);
    asArray(values).forEach(function (value) {
      var normalized = cleanString(value);
      if (normalized) seen[normalized] = true;
    });
    return Object.keys(seen).sort();
  }

  function collectFacetIds(rows, fieldName, arrayFieldName) {
    var values = [];
    asArray(rows).forEach(function (row) {
      var direct = cleanString(row && row[fieldName]);
      if (direct) values.push(direct);
      asArray(row && row[arrayFieldName]).forEach(function (value) {
        values.push(cleanString(value && typeof value === 'object' ? (value.id || value.name || value.label || value.value) : value));
      });
    });
    return uniqueSorted(values);
  }

  function stableCatalogTokens(items, idNames) {
    return uniqueSorted(asArray(items).map(function (item) {
      if (item && typeof item === 'object') {
        var id = firstId(item, idNames);
        if (id) return id;
        var name = firstId(item, ['name', 'title', 'label']);
        return name ? 'name:' + name : '';
      }
      return cleanString(item);
    }));
  }

  async function callMaybe(api, methodNames) {
    for (var i = 0; i < methodNames.length; i += 1) {
      var name = methodNames[i];
      if (api && typeof api[name] === 'function') {
        try { return await api[name](); }
        catch (_) { return null; }
      }
    }
    return null;
  }

  function getIndex() {
    return H2O.LibraryIndex || (H2O.Library && H2O.Library.Index) || null;
  }

  function getLibraryIndexCore() {
    return (H2O.Library && H2O.Library.LibraryIndexCore) || null;
  }

  async function readCatalog(kind, rows, warnings) {
    var workspace = H2O.LibraryWorkspace || (H2O.Studio && H2O.Studio.LibraryWorkspace) || null;
    var stores = (H2O.Studio && H2O.Studio.store) || {};
    var fromWorkspace = null;
    var fromStore = null;
    var methodByKind = {
      folders: ['getFolders', 'listFolders'],
      labels: ['getLabels', 'listLabels'],
      categories: ['getCategories', 'listCategories'],
      projects: ['getProjects', 'listProjects']
    };
    var storeByKind = {
      folders: stores.folders,
      labels: stores.labels,
      categories: stores.categories,
      projects: stores.projects
    };
    if (workspace) fromWorkspace = await callMaybe(workspace, methodByKind[kind] || []);
    if (fromWorkspace == null && storeByKind[kind]) {
      fromStore = await callMaybe(storeByKind[kind], ['getAll', 'list', 'listAll']);
    }
    var raw = Array.isArray(fromWorkspace) ? fromWorkspace : (Array.isArray(fromStore) ? fromStore : null);
    if (raw) {
      return {
        source: Array.isArray(fromWorkspace) ? 'workspace' : 'store',
        tokens: stableCatalogTokens(raw, [kind.slice(0, -1) + 'Id', 'id'])
      };
    }
    addCode(warnings, WARNING_CODES.catalogPartial);
    if (kind === 'folders') return { source: 'library-index-facets', tokens: collectFacetIds(rows, 'folderId', 'folders') };
    if (kind === 'labels') return { source: 'library-index-facets', tokens: collectFacetIds(rows, 'labelId', 'labels') };
    if (kind === 'categories') return { source: 'library-index-facets', tokens: collectFacetIds(rows, 'categoryId', 'categories') };
    if (kind === 'projects') return { source: 'library-index-facets', tokens: collectFacetIds(rows, 'projectId', 'projects') };
    return { source: 'unavailable', tokens: [] };
  }

  function summarizeCounts(rows) {
    var list = asArray(rows);
    var core = getLibraryIndexCore();
    var canonical = core && typeof core.canonicalHeadlineCounts === 'function'
      ? safeObject(core.canonicalHeadlineCounts(list))
      : {};
    var linkCount = Number(canonical.link || canonical.linked || 0) || 0;
    return {
      total: Number(canonical.total || 0) || 0,
      saved: Number(canonical.saved || 0) || 0,
      link: linkCount,
      linked: linkCount,
      pinned: Number(canonical.pinned || 0) || 0,
      archived: Number(canonical.archived || 0) || 0,
      folders: Number(canonical.folders || 0) || 0,
      labels: Number(canonical.labels || 0) || 0,
      categories: Number(canonical.categories || 0) || 0,
      projects: Number(canonical.projects || 0) || 0
    };
  }

  function recencyNumber(row) {
    var values = [row.updatedAt, row.capturedAt, row.createdAt, row.linkedAt, row.savedAt, row.ts];
    for (var i = 0; i < values.length; i += 1) {
      var raw = values[i];
      if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
      var parsed = Date.parse(cleanString(raw));
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function canonicalActiveRows(rows) {
    var core = getLibraryIndexCore();
    if (core && typeof core.canonicalActiveRows === 'function') return asArray(core.canonicalActiveRows(asArray(rows)));
    var seen = Object.create(null);
    return asArray(rows).filter(function (row, index) {
      if (!row || typeof row !== 'object' || isArchived(row) || isDeleted(row)) return false;
      var key = cleanString(row.chatId || row.id || row.snapshotId || row.href || ('row:' + index));
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function canonicalRecentRows(rows, limit) {
    var core = getLibraryIndexCore();
    if (core && typeof core.canonicalRecentRows === 'function') {
      return asArray(core.canonicalRecentRows(asArray(rows), limit, { dateField: 'best' }));
    }
    return asArray(rows)
      .slice()
      .sort(function (a, b) {
        var dateCompare = recencyNumber(b) - recencyNumber(a);
        var titleCompare = cleanString(a.title).localeCompare(cleanString(b.title));
        var idCompare = rowId(a).localeCompare(rowId(b));
        return dateCompare || titleCompare || idCompare;
      })
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  function rowToken(row) {
    return {
      id: rowId(row),
      view: rowView(row),
      saved: isSaved(row),
      linked: isLinked(row),
      pinned: isPinned(row),
      archived: isArchived(row),
      folder: cleanString(row.folderId),
      category: cleanString(row.categoryId),
      project: cleanString(row.projectId),
      labels: uniqueSorted(asArray(row.labels).map(function (value) {
        return cleanString(value && typeof value === 'object' ? (value.id || value.name || value.label) : value);
      })),
      tags: uniqueSorted(asArray(row.tags).map(function (value) {
        return cleanString(value && typeof value === 'object' ? (value.id || value.name || value.label) : value);
      }))
    };
  }

  function recentTokens(rows) {
    return canonicalRecentRows(rows, 20)
      .map(function (row) {
        return {
          id: rowId(row),
          view: rowView(row),
          updated: recencyNumber(row)
        };
      });
  }

  function readIdentityMetadata(warnings) {
    var identityKnown = false;
    var workspaceKnown = false;
    try {
      var api = H2O.Studio && H2O.Studio.identity;
      var diag = api && typeof api.diagnose === 'function' ? safeObject(api.diagnose()) : null;
      identityKnown = !!(diag && (diag.ready === true || diag.status === 'ready' || diag.identityKnown === true));
      workspaceKnown = !!(diag && (diag.workspaceKnown === true || diag.workspaceHash || diag.workspaceIdHash));
    } catch (_) { /* ignore */ }
    if (!identityKnown || !workspaceKnown) addCode(warnings, WARNING_CODES.identityWorkspaceUnknown);
    return {
      identityKnown: identityKnown,
      workspaceKnown: workspaceKnown
    };
  }

  async function captureSnapshot(options) {
    var opts = safeObject(options);
    var detected = detectSurface();
    var warnings = [];
    var idx = getIndex();
    var indexRows = [];
    var indexDiag = null;
    try {
      if (idx && typeof idx.getAll === 'function') {
        indexRows = asArray(idx.getAll());
      }
    } catch (_) {
      indexRows = [];
    }
    try {
      indexDiag = idx && typeof idx.diagnose === 'function' ? safeObject(idx.diagnose()) : null;
    } catch (_) {
      indexDiag = null;
    }
    var activeRows = canonicalActiveRows(indexRows);
    var catalogs = {
      folders: await readCatalog('folders', activeRows, warnings),
      labels: await readCatalog('labels', activeRows, warnings),
      categories: await readCatalog('categories', activeRows, warnings),
      projects: await readCatalog('projects', activeRows, warnings)
    };
    var counts = summarizeCounts(indexRows, catalogs);
    var rowTokens = activeRows.map(rowToken).filter(function (token) { return token.id; }).sort(function (a, b) {
      return canonicalJson(a).localeCompare(canonicalJson(b));
    });
    var recents = recentTokens(activeRows);
    var identity = readIdentityMetadata(warnings);
    var sourceAvailable = !!(idx && typeof idx.getAll === 'function');
    return {
      schema: SNAPSHOT_SCHEMA,
      version: VERSION,
      surface: cleanString(opts.surfaceOverride) || detected.surface,
      sourceType: cleanString(opts.sourceTypeOverride) || detected.sourceType,
      sourceAvailable: sourceAvailable,
      sourceMetadata: {
        platformAdapter: detected.adapter,
        isTauri: detected.isTauri,
        isChromeRuntime: detected.isChrome,
        libraryIndexAvailable: !!idx,
        libraryIndexRows: indexRows.length,
        libraryIndexActiveRows: activeRows.length,
        libraryIndexSource: cleanString(indexDiag && (indexDiag.lastSource || indexDiag.source)),
        catalogSources: {
          folders: catalogs.folders.source,
          labels: catalogs.labels.source,
          categories: catalogs.categories.source,
          projects: catalogs.projects.source
        },
        identityKnown: identity.identityKnown,
        workspaceKnown: identity.workspaceKnown,
        snapshotMode: 'cache-only-read-only'
      },
      counts: counts,
      hashes: {
        rows: await hashValue(rowTokens),
        folders: await hashValue(catalogs.folders.tokens),
        labels: await hashValue(catalogs.labels.tokens),
        categories: await hashValue(catalogs.categories.tokens),
        projects: await hashValue(catalogs.projects.tokens),
        recents: await hashValue(recents)
      },
      warnings: warnings,
      observedAtIso: nowIso()
    };
  }

  function snapshotSummary(snapshot) {
    var s = safeObject(snapshot);
    return {
      schema: cleanString(s.schema),
      version: cleanString(s.version),
      surface: cleanString(s.surface),
      sourceType: cleanString(s.sourceType),
      sourceAvailable: s.sourceAvailable === true,
      sourceMetadata: safeObject(s.sourceMetadata),
      counts: safeObject(s.counts),
      hashes: safeObject(s.hashes),
      warnings: asArray(s.warnings).map(cleanString).filter(Boolean),
      observedAtIso: cleanString(s.observedAtIso)
    };
  }

  function mismatch(mismatches, code, field, chromeValue, desktopValue) {
    mismatches.push({
      code: code,
      field: field,
      chrome: chromeValue,
      desktop: desktopValue
    });
  }

  function compareField(mismatches, code, field, chromeValue, desktopValue) {
    if (chromeValue !== desktopValue) mismatch(mismatches, code, field, chromeValue, desktopValue);
  }

  function normalizeCompareInput(chromeSnapshot, desktopSnapshot) {
    var left = safeObject(chromeSnapshot);
    var right = safeObject(desktopSnapshot);
    if (left.surface === 'desktop-studio' && right.surface === 'chrome-studio') {
      return { chrome: right, desktop: left };
    }
    return { chrome: left, desktop: right };
  }

  function compareSnapshots(chromeSnapshot, desktopSnapshot) {
    var normalized = normalizeCompareInput(chromeSnapshot, desktopSnapshot);
    var chrome = snapshotSummary(normalized.chrome);
    var desktop = snapshotSummary(normalized.desktop);
    var mismatches = [];
    var blockers = [];
    var warnings = [];

    if (chrome.schema !== SNAPSHOT_SCHEMA) mismatch(mismatches, MISMATCH_CODES.schema, 'chrome.schema', chrome.schema, SNAPSHOT_SCHEMA);
    if (desktop.schema !== SNAPSHOT_SCHEMA) mismatch(mismatches, MISMATCH_CODES.schema, 'desktop.schema', desktop.schema, SNAPSHOT_SCHEMA);
    if (!chrome.sourceAvailable) mismatch(mismatches, MISMATCH_CODES.chromeUnavailable, 'chrome.sourceAvailable', chrome.sourceAvailable, true);
    if (!desktop.sourceAvailable) mismatch(mismatches, MISMATCH_CODES.desktopUnavailable, 'desktop.sourceAvailable', desktop.sourceAvailable, true);

    compareField(mismatches, MISMATCH_CODES.count, 'counts.total', Number(chrome.counts.total || 0), Number(desktop.counts.total || 0));
    compareField(mismatches, MISMATCH_CODES.saved, 'counts.saved', Number(chrome.counts.saved || 0), Number(desktop.counts.saved || 0));
    compareField(mismatches, MISMATCH_CODES.linked, 'counts.link', Number(chrome.counts.link || chrome.counts.linked || 0), Number(desktop.counts.link || desktop.counts.linked || 0));
    compareField(mismatches, MISMATCH_CODES.pinned, 'counts.pinned', Number(chrome.counts.pinned || 0), Number(desktop.counts.pinned || 0));
    compareField(mismatches, MISMATCH_CODES.archived, 'counts.archived', Number(chrome.counts.archived || 0), Number(desktop.counts.archived || 0));
    compareField(mismatches, MISMATCH_CODES.folders, 'counts.folders', Number(chrome.counts.folders || 0), Number(desktop.counts.folders || 0));
    compareField(mismatches, MISMATCH_CODES.labels, 'counts.labels', Number(chrome.counts.labels || 0), Number(desktop.counts.labels || 0));
    compareField(mismatches, MISMATCH_CODES.categories, 'counts.categories', Number(chrome.counts.categories || 0), Number(desktop.counts.categories || 0));
    compareField(mismatches, MISMATCH_CODES.projects, 'counts.projects', Number(chrome.counts.projects || 0), Number(desktop.counts.projects || 0));
    compareField(mismatches, MISMATCH_CODES.folders, 'hashes.folders', cleanString(chrome.hashes.folders), cleanString(desktop.hashes.folders));
    compareField(mismatches, MISMATCH_CODES.labels, 'hashes.labels', cleanString(chrome.hashes.labels), cleanString(desktop.hashes.labels));
    compareField(mismatches, MISMATCH_CODES.categories, 'hashes.categories', cleanString(chrome.hashes.categories), cleanString(desktop.hashes.categories));
    compareField(mismatches, MISMATCH_CODES.projects, 'hashes.projects', cleanString(chrome.hashes.projects), cleanString(desktop.hashes.projects));
    compareField(mismatches, MISMATCH_CODES.recents, 'hashes.recents', cleanString(chrome.hashes.recents), cleanString(desktop.hashes.recents));
    compareField(mismatches, MISMATCH_CODES.count, 'hashes.rows', cleanString(chrome.hashes.rows), cleanString(desktop.hashes.rows));

    mismatches.forEach(function (entry) { addCode(blockers, entry.code); });
    asArray(chrome.warnings).concat(asArray(desktop.warnings)).forEach(function (code) { addCode(warnings, cleanString(code)); });
    if (!chrome.sourceMetadata.identityKnown || !chrome.sourceMetadata.workspaceKnown ||
        !desktop.sourceMetadata.identityKnown || !desktop.sourceMetadata.workspaceKnown) {
      addCode(warnings, WARNING_CODES.identityWorkspaceUnknown);
    }

    return {
      schema: PARITY_SCHEMA,
      version: VERSION,
      ok: mismatches.length === 0,
      status: mismatches.length === 0 ? 'match' : 'mismatch',
      chrome: chrome,
      desktop: desktop,
      mismatches: mismatches,
      blockers: blockers,
      warnings: warnings,
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
      var warnings = [WARNING_CODES.localOnly];
      var blockers = [MISMATCH_CODES.peerRequired];
      return {
        schema: PARITY_SCHEMA,
        version: VERSION,
        ok: false,
        status: 'peer-snapshot-required',
        localSnapshot: localSnapshot ? snapshotSummary(localSnapshot) : null,
        chrome: chromeSnapshot ? snapshotSummary(chromeSnapshot) : null,
        desktop: desktopSnapshot ? snapshotSummary(desktopSnapshot) : null,
        mismatches: [{
          code: MISMATCH_CODES.peerRequired,
          field: chromeSnapshot ? 'desktopSnapshot' : 'chromeSnapshot',
          chrome: !!chromeSnapshot,
          desktop: !!desktopSnapshot
        }],
        blockers: blockers,
        warnings: warnings,
        observedAtIso: nowIso()
      };
    }
    return compareSnapshots(chromeSnapshot, desktopSnapshot);
  }

  function listMismatchCodes() {
    return Object.keys(MISMATCH_CODES).map(function (key) { return MISMATCH_CODES[key]; }).sort();
  }

  var api = {
    __installed: true,
    version: VERSION,
    snapshotSchema: SNAPSHOT_SCHEMA,
    paritySchema: PARITY_SCHEMA,
    captureSnapshot: captureSnapshot,
    compareSnapshots: compareSnapshots,
    runDiagnostic: runDiagnostic,
    listMismatchCodes: listMismatchCodes,
    warningCodes: Object.keys(WARNING_CODES).map(function (key) { return WARNING_CODES[key]; }).sort()
  };

  H2O.Studio.sync.libraryParity = api;
  H2O.Studio.sync.captureLibraryParitySnapshot = captureSnapshot;
  H2O.Studio.sync.compareLibraryParitySnapshots = compareSnapshots;
  H2O.Studio.sync.runChromeDesktopLibraryParityDiagnostic = runDiagnostic;
})(typeof globalThis !== 'undefined' ? globalThis : window);
