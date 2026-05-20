/* H2O Studio Export - Full Bundle Exporter (Desktop / Tauri)
 *
 * Desktop-only exporter for moving SQLite-backed Studio Library data into a
 * Chrome-compatible "h2o.studio.fullBundle.v2" file. It reads through public
 * H2O.Studio.store adapters only. It never writes SQLite, chrome.storage, or
 * archive data.
 *
 * Chrome already imports this full-bundle shape through the existing
 * #/migrate/import flow; this file intentionally does not change Chrome import
 * logic or the archive IndexedDB schema.
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
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};

  var FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2';
  var CHAT_ARCHIVE_SCHEMA = 'h2o.chatArchive.bundle.v1';
  var FOLDER_STATE_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  var LABEL_BINDINGS_KEY = 'h2o:prm:cgx:library:labels:bindings:v1';
  var DEFAULT_KEEP_LATEST = 30;
  var EXPORTER_VERSION = '0.1.0';

  var state = {
    installedAt: Date.now(),
    lastExportAt: null,
    lastSummary: null,
    lastWarnings: [],
    lastError: null,
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function uniqStrings(values) {
    var out = [];
    var seen = Object.create(null);
    asArray(values).forEach(function (item) {
      var value = cleanString(item && typeof item === 'object' ? (item.id || item.labelId || item.tagId || item.categoryId || item.name) : item);
      if (!value || seen[value]) return;
      seen[value] = true;
      out.push(value);
    });
    return out;
  }

  function numberOrZero(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function epochToIso(value) {
    if (typeof value === 'string' && value.trim()) {
      var parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
      return value.trim();
    }
    var n = numberOrZero(value);
    if (n > 0) {
      try { return new Date(n).toISOString(); }
      catch (_) { return ''; }
    }
    return '';
  }

  function getStores() {
    return (H2O.Studio && H2O.Studio.store) || {};
  }

  async function listFromStore(store, opts) {
    if (!store) return [];
    try {
      if (typeof store.list === 'function') {
        var rows = await store.list(opts || {});
        return asArray(rows);
      }
      if (typeof store.getAll === 'function') {
        var all = await store.getAll();
        return asArray(all);
      }
    } catch (_) { /* caller records availability separately */ }
    return [];
  }

  async function listForChat(store, chatId) {
    if (!store || typeof store.listForChat !== 'function') return [];
    try { return asArray(await store.listForChat(chatId)); }
    catch (_) { return []; }
  }

  async function getStoreRow(store, id) {
    if (!store || typeof store.get !== 'function' || !id) return null;
    try { return await store.get(id); }
    catch (_) { return null; }
  }

  function makeLabelAssignments(labels) {
    var assignments = {
      workflowStatusLabelId: '',
      priorityLabelId: '',
      actionLabelIds: [],
      contextLabelIds: [],
      customLabelIds: [],
    };
    asArray(labels).forEach(function (label) {
      var id = cleanString(label && (label.labelId || label.id));
      if (!id) return;
      var meta = safeObject(label && label.meta);
      var type = cleanString((label && label.type) || meta.type || 'custom');
      if (type === 'workflow_status' && !assignments.workflowStatusLabelId) assignments.workflowStatusLabelId = id;
      else if (type === 'priority' && !assignments.priorityLabelId) assignments.priorityLabelId = id;
      else if (type === 'action') assignments.actionLabelIds.push(id);
      else if (type === 'context') assignments.contextLabelIds.push(id);
      else assignments.customLabelIds.push(id);
    });
    assignments.actionLabelIds = uniqStrings(assignments.actionLabelIds);
    assignments.contextLabelIds = uniqStrings(assignments.contextLabelIds);
    assignments.customLabelIds = uniqStrings(assignments.customLabelIds);
    return assignments;
  }

  function projectCategoryCatalog(row) {
    var id = cleanString(row && (row.categoryId || row.id));
    if (!id) return null;
    var meta = safeObject(row && row.meta);
    return {
      id: id,
      name: cleanString((row && row.name) || meta.name || id) || id,
      description: cleanString(meta.description || ''),
      color: cleanString(meta.color || ''),
      sortOrder: Math.floor(numberOrZero(meta.sortOrder)),
      createdAt: epochToIso((row && row.createdAt) || meta.createdAt) || nowIso(),
      updatedAt: epochToIso((row && row.updatedAt) || meta.updatedAt) || '',
      status: cleanString(meta.status || 'active') || 'active',
      replacementCategoryId: meta.replacementCategoryId || null,
      aliases: uniqStrings(meta.aliases),
    };
  }

  function projectLabelCatalog(row) {
    var id = cleanString(row && (row.labelId || row.id));
    if (!id) return null;
    var meta = safeObject(row && row.meta);
    return {
      id: id,
      name: cleanString((row && row.name) || meta.name || id) || id,
      type: cleanString((row && row.type) || meta.type || 'custom') || 'custom',
      color: cleanString((row && row.color) || meta.color || ''),
      sortOrder: Math.floor(numberOrZero(meta.sortOrder)),
      createdAt: epochToIso((row && row.createdAt) || meta.createdAt) || nowIso(),
    };
  }

  function projectFolder(row) {
    var id = cleanString(row && (row.folderId || row.id));
    if (!id) return null;
    var meta = safeObject(row && row.meta);
    var color = cleanString((row && (row.iconColor || row.color)) || meta.iconColor || meta.color || '');
    var out = {
      id: id,
      name: cleanString((row && row.name) || meta.name || id) || id,
      kind: cleanString((row && row.kind) || meta.kind || 'local') || 'local',
      parentId: cleanString((row && row.parentId) || meta.parentId || ''),
      source: cleanString((row && row.source) || meta.source || 'desktop-sqlite') || 'desktop-sqlite',
      sortOrder: Math.floor(numberOrZero((row && row.sortOrder) || meta.sortOrder)),
      createdAt: epochToIso((row && row.createdAt) || meta.createdAt) || '',
      updatedAt: epochToIso((row && row.updatedAt) || meta.updatedAt) || '',
      meta: meta,
    };
    if (color) out.iconColor = color;
    return out;
  }

  function projectTag(row) {
    var id = cleanString(row && (row.tagId || row.id));
    if (!id) return null;
    var meta = safeObject(row && row.meta);
    return {
      id: id,
      name: cleanString((row && row.name) || meta.name || id) || id,
      autoDerived: !!(row && row.autoDerived),
      createdAt: epochToIso((row && row.createdAt) || meta.createdAt) || '',
      meta: meta,
    };
  }

  function projectTurnMessage(turn, index, capturedAt) {
    var order = (typeof turn.turnIdx === 'number' && Number.isFinite(turn.turnIdx))
      ? Math.floor(turn.turnIdx) : index;
    return {
      role: cleanString(turn.role || 'assistant') || 'assistant',
      text: typeof turn.text === 'string' ? turn.text : '',
      order: order,
      createdAt: numberOrZero(capturedAt) || null,
    };
  }

  function projectRichTurn(turn, index) {
    var outer = typeof turn.outerHtml === 'string' ? turn.outerHtml : '';
    if (!outer) return null;
    var meta = safeObject(turn.meta);
    var out = Object.assign({}, meta);
    out.turnIdx = (typeof turn.turnIdx === 'number' && Number.isFinite(turn.turnIdx)) ? Math.floor(turn.turnIdx) : index;
    out.role = cleanString(turn.role || 'assistant') || 'assistant';
    out.outerHTML = outer;
    return out;
  }

  function makeCategoryRecord(categoryRow) {
    if (!categoryRow) return null;
    var id = cleanString(categoryRow.categoryId || categoryRow.id);
    if (!id) return null;
    return {
      primaryCategoryId: id,
      secondaryCategoryId: null,
      source: 'user',
      algorithmVersion: null,
      classifiedAt: null,
      overriddenAt: epochToIso(categoryRow.updatedAt) || null,
      confidence: null,
    };
  }

  function makeSnapshotMeta(chat, snapshot, turns, related) {
    var meta = Object.assign({}, safeObject(snapshot && snapshot.meta));
    var chatMeta = safeObject(chat && chat.meta);
    var folder = related.folder || null;
    var category = related.category || null;
    var labels = related.labels || [];
    var tags = related.tags || [];
    var title = cleanString((snapshot && snapshot.title) || meta.title || (chat && chat.title) || chat && chat.chatId);
    var href = cleanString((chat && (chat.href || chat.normalizedHref || chat.linkSourceHref)) || meta.href || meta.sourceUrl || '');
    var richTurns = turns.map(projectRichTurn).filter(function (row) { return !!row; });

    if (title) meta.title = title;
    if (href) {
      meta.href = href;
      meta.sourceUrl = meta.sourceUrl || href;
    }
    if (chat && chat.chatId && !meta.chatgptId) meta.chatgptId = cleanString(chat.chatId);
    meta.source = meta.source || 'desktop';
    meta.sourceType = meta.sourceType || 'desktop-sqlite-export';
    meta.originSource = meta.originSource || 'desktop-sqlite';
    meta.capturedAt = meta.capturedAt || epochToIso(snapshot && snapshot.capturedAt) || '';
    meta.updatedAt = meta.updatedAt || epochToIso((snapshot && snapshot.updatedAt) || (chat && chat.updatedAt)) || '';
    meta.messageCount = Number((snapshot && snapshot.messageCount) || turns.length || 0);
    if (typeof chatMeta.answerCount === 'number') meta.answerCount = chatMeta.answerCount;
    if (folder) {
      meta.folderId = cleanString(folder.folderId || folder.id);
      meta.folderName = cleanString(folder.name || meta.folderName || '');
    }
    if (category) meta.category = makeCategoryRecord(category);
    meta.labels = makeLabelAssignments(labels);
    meta.tags = tags.map(function (tag) { return cleanString(tag && (tag.tagId || tag.id)); }).filter(Boolean);
    if (richTurns.length > 0) meta.richTurns = richTurns;
    return meta;
  }

  function sortSnapshotsAscending(a, b) {
    var av = numberOrZero(a && a.snapshot && a.snapshot.capturedAt);
    var bv = numberOrZero(b && b.snapshot && b.snapshot.capturedAt);
    if (av !== bv) return av - bv;
    return cleanString(a && a.snapshot && a.snapshot.snapshotId).localeCompare(cleanString(b && b.snapshot && b.snapshot.snapshotId));
  }

  function makeChatIndex(chat, snapshots, related) {
    var latest = snapshots.length ? snapshots[snapshots.length - 1] : null;
    var latestSnap = latest && latest.snapshot;
    var pinnedIds = snapshots
      .filter(function (item) { return !!(item && item.snapshot && item.snapshot.pinned); })
      .map(function (item) { return cleanString(item.snapshot.snapshotId); })
      .filter(Boolean);
    var folder = related.folder || null;
    var category = related.category || null;
    var tags = related.tags || [];
    var labels = related.labels || [];
    return {
      lastSnapshotId: cleanString((chat && chat.lastSnapshotId) || (latestSnap && latestSnap.snapshotId) || ''),
      lastCapturedAt: epochToIso((chat && chat.lastCapturedAt) || (latestSnap && latestSnap.capturedAt)) || '',
      pinnedSnapshotIds: uniqStrings(pinnedIds),
      retentionPolicy: { keepLatest: DEFAULT_KEEP_LATEST },
      lastDigest: cleanString(latestSnap && latestSnap.digest),
      title: cleanString(chat && chat.title),
      href: cleanString(chat && (chat.href || chat.normalizedHref || chat.linkSourceHref)),
      state: {
        isSaved: !!(chat && chat.isSaved),
        isLinked: !!(chat && chat.isLinked),
        isPinned: !!(chat && chat.isPinned),
        isArchived: !!(chat && chat.isArchived),
        isDeleted: !!(chat && chat.isDeleted),
      },
      organization: {
        folderId: folder ? cleanString(folder.folderId || folder.id) : cleanString(chat && chat.folderId),
        folderName: folder ? cleanString(folder.name) : '',
        categoryId: category ? cleanString(category.categoryId || category.id) : cleanString(chat && chat.categoryId),
        tagIds: uniqStrings(tags.map(function (tag) { return tag && (tag.tagId || tag.id); })),
        tags: tags.map(projectTag).filter(Boolean),
        labelIds: uniqStrings(labels.map(function (label) { return label && (label.labelId || label.id); })),
      },
      linkSourceHref: cleanString(chat && chat.linkSourceHref),
      linkedFrom: cleanString(chat && chat.linkedFrom),
      linkedAt: epochToIso(chat && chat.linkedAt) || '',
    };
  }

  async function collectRelated(stores, chat) {
    var chatId = cleanString(chat && chat.chatId);
    var folderRows = await listForChat(stores.folders, chatId);
    var folder = folderRows[0] || null;
    if (!folder && chat && chat.folderId) folder = await getStoreRow(stores.folders, chat.folderId);
    var category = null;
    if (stores.categories && typeof stores.categories.getForChat === 'function') {
      try { category = await stores.categories.getForChat(chatId); }
      catch (_) { category = null; }
    }
    if (!category && chat && chat.categoryId) category = await getStoreRow(stores.categories, chat.categoryId);
    return {
      folder: folder,
      category: category,
      labels: await listForChat(stores.labels, chatId),
      tags: await listForChat(stores.tags, chatId),
    };
  }

  async function collectSnapshotRecords(stores, chatId) {
    var headers = [];
    if (stores.snapshots && typeof stores.snapshots.listByChat === 'function') {
      try { headers = asArray(await stores.snapshots.listByChat(chatId)); }
      catch (_) { headers = []; }
    }
    var out = [];
    for (var i = 0; i < headers.length; i += 1) {
      var header = headers[i] || {};
      var snapshotId = cleanString(header.snapshotId || header.id);
      if (!snapshotId) continue;
      var combined = null;
      if (stores.snapshots && typeof stores.snapshots.get === 'function') {
        try { combined = await stores.snapshots.get(snapshotId); }
        catch (_) { combined = null; }
      }
      if (combined && combined.snapshot) out.push(combined);
      else out.push({ snapshot: header, turns: [] });
    }
    out.sort(sortSnapshotsAscending);
    return out;
  }

  function projectBundleSnapshot(chat, combined, related) {
    var snapshot = combined && combined.snapshot ? combined.snapshot : {};
    var turns = asArray(combined && combined.turns);
    var createdAt = epochToIso(snapshot.capturedAt) || epochToIso(snapshot.updatedAt) || nowIso();
    var messages = turns.map(function (turn, index) {
      return projectTurnMessage(turn || {}, index, snapshot.capturedAt);
    });
    var meta = makeSnapshotMeta(chat, snapshot, turns, related);
    return {
      snapshotId: cleanString(snapshot.snapshotId || snapshot.id),
      chatId: cleanString(snapshot.chatId || chat.chatId),
      title: cleanString(snapshot.title || meta.title || chat.title || chat.chatId),
      createdAt: createdAt,
      schemaVersion: 1,
      messageCount: Number(snapshot.messageCount || messages.length || 0),
      digest: cleanString(snapshot.digest || ''),
      meta: meta,
      messages: messages,
    };
  }

  async function buildChatArchive(stores, warnings) {
    var chats = await listFromStore(stores.chats, { sort: { field: 'updatedAt', dir: 'DESC' } });
    var categories = (await listFromStore(stores.categories)).map(projectCategoryCatalog).filter(Boolean);
    var labels = (await listFromStore(stores.labels)).map(projectLabelCatalog).filter(Boolean);
    var archiveChats = [];
    var folderItems = Object.create(null);
    var labelBindings = Object.create(null);
    var snapshotCount = 0;
    var turnCount = 0;
    var linkedOnlyCount = 0;
    var noMessageSnapshotCount = 0;

    for (var i = 0; i < chats.length; i += 1) {
      var chat = chats[i] || {};
      var chatId = cleanString(chat.chatId || chat.id);
      if (!chatId) {
        warnings.push({ kind: 'chat', warning: 'skipped chat without chatId', index: i });
        continue;
      }
      var related = await collectRelated(stores, chat);
      var snapshotsCombined = await collectSnapshotRecords(stores, chatId);
      var bundleSnapshots = [];
      for (var si = 0; si < snapshotsCombined.length; si += 1) {
        var projected = projectBundleSnapshot(chat, snapshotsCombined[si], related);
        if (!projected.snapshotId) {
          warnings.push({ kind: 'snapshot', chatId: chatId, warning: 'skipped snapshot without snapshotId' });
          continue;
        }
        if (!projected.messages.length) {
          noMessageSnapshotCount += 1;
          warnings.push({ kind: 'snapshot-empty-messages', chatId: chatId, snapshotId: projected.snapshotId });
        }
        turnCount += projected.messages.length;
        bundleSnapshots.push(projected);
      }
      if (!bundleSnapshots.length) {
        linkedOnlyCount += 1;
        warnings.push({
          kind: 'linked-only-chat',
          chatId: chatId,
          warning: 'chat has no snapshots/messages; export keeps chat record but Chrome Saved Chats requires snapshots',
        });
      }
      snapshotCount += bundleSnapshots.length;
      if (related.folder) {
        var folderId = cleanString(related.folder.folderId || related.folder.id);
        if (folderId) {
          folderItems[folderId] = folderItems[folderId] || [];
          folderItems[folderId].push(chatId);
        }
      }
      var labelIds = uniqStrings(asArray(related.labels).map(function (label) { return label && (label.labelId || label.id); }));
      if (labelIds.length) labelBindings[chatId] = labelIds;
      archiveChats.push({
        chatId: chatId,
        bootMode: 'live_first',
        chatIndex: makeChatIndex(chat, snapshotsCombined, related),
        migrated: !!safeObject(chat.meta).migrated,
        snapshots: bundleSnapshots,
      });
    }

    return {
      archive: {
        schema: CHAT_ARCHIVE_SCHEMA,
        exportedAt: nowIso(),
        scope: 'all',
        chatCount: archiveChats.length,
        chats: archiveChats,
        catalogs: {
          categories: categories,
          labels: labels,
        },
      },
      diagnostics: {
        snapshotCount: snapshotCount,
        turnCount: turnCount,
        linkedOnlyCount: linkedOnlyCount,
        noMessageSnapshotCount: noMessageSnapshotCount,
      },
      folderItems: folderItems,
      labelBindings: labelBindings,
    };
  }

  async function buildFolderState(stores, folderItems) {
    var folders = (await listFromStore(stores.folders)).map(projectFolder).filter(Boolean);
    var items = Object.create(null);
    Object.keys(folderItems || {}).forEach(function (folderId) {
      items[folderId] = uniqStrings(folderItems[folderId]);
    });
    return {
      schemaVersion: 1,
      exportedFrom: 'desktop-sqlite',
      exportedAt: nowIso(),
      folders: folders,
      items: items,
    };
  }

  function buildLibraryKv(labelBindings) {
    var keys = Object.keys(labelBindings || {});
    if (!keys.length) return [];
    var bindings = {};
    keys.sort().forEach(function (chatId) {
      var ids = uniqStrings(labelBindings[chatId]);
      if (ids.length) bindings[chatId] = ids;
    });
    if (!Object.keys(bindings).length) return [];
    return [{
      key: LABEL_BINDINGS_KEY,
      value: {
        schemaVersion: 1,
        exportedFrom: 'desktop-sqlite',
        exportedAt: nowIso(),
        bindings: bindings,
      },
    }];
  }

  function getManifestInfo() {
    try {
      if (global.chrome && global.chrome.runtime && typeof global.chrome.runtime.getManifest === 'function') {
        var m = global.chrome.runtime.getManifest() || {};
        return {
          id: cleanString(global.chrome.runtime.id || 'desktop-tauri'),
          name: cleanString(m.name || 'H2O Studio Desktop'),
          version: cleanString(m.version || ''),
        };
      }
    } catch (_) { /* ignore */ }
    return { id: 'desktop-tauri', name: 'H2O Studio Desktop', version: '' };
  }

  function storeAvailability(stores) {
    return {
      chats: !!(stores.chats && (typeof stores.chats.list === 'function' || typeof stores.chats.getAll === 'function')),
      snapshots: !!(stores.snapshots && typeof stores.snapshots.listByChat === 'function' && typeof stores.snapshots.get === 'function'),
      folders: !!(stores.folders && (typeof stores.folders.list === 'function' || typeof stores.folders.getAll === 'function')),
      categories: !!(stores.categories && (typeof stores.categories.list === 'function' || typeof stores.categories.getAll === 'function')),
      labels: !!(stores.labels && (typeof stores.labels.list === 'function' || typeof stores.labels.getAll === 'function')),
      tags: !!(stores.tags && (typeof stores.tags.list === 'function' || typeof stores.tags.getAll === 'function')),
    };
  }

  async function exportFullBundle(options) {
    var startedAt = Date.now();
    var warnings = [];
    var stores = getStores();
    var availability = storeAvailability(stores);
    if (!availability.chats) throw new Error('Desktop export unavailable: store.chats missing');
    if (!availability.snapshots) warnings.push({ kind: 'store', warning: 'store.snapshots unavailable; exporting chat records without snapshots' });

    var collected = await buildChatArchive(stores, warnings);
    var folderState = await buildFolderState(stores, collected.folderItems);
    var chromeStorageLocal = {};
    chromeStorageLocal[FOLDER_STATE_KEY] = folderState;
    var libraryKv = buildLibraryKv(collected.labelBindings);
    var manifest = getManifestInfo();
    var chatArchive = collected.archive;
    var snapshotCount = collected.diagnostics.snapshotCount;
    var summary = {
      chatCount: chatArchive.chatCount,
      snapshotCount: snapshotCount,
      turnCount: collected.diagnostics.turnCount,
      categoryCount: asArray(chatArchive.catalogs && chatArchive.catalogs.categories).length,
      labelCount: asArray(chatArchive.catalogs && chatArchive.catalogs.labels).length,
      folderCount: asArray(folderState.folders).length,
      folderBindingCount: Object.keys(folderState.items || {}).reduce(function (sum, folderId) {
        return sum + asArray(folderState.items[folderId]).length;
      }, 0),
      labelBindingChatCount: Object.keys(collected.labelBindings || {}).length,
      chromeStorageKeyCount: Object.keys(chromeStorageLocal).length,
      libraryKvKeyCount: libraryKv.length,
      linkedOnlyCount: collected.diagnostics.linkedOnlyCount,
      noMessageSnapshotCount: collected.diagnostics.noMessageSnapshotCount,
    };
    var bundle = {
      schema: FULL_BUNDLE_SCHEMA,
      exportedAt: nowIso(),
      exportedFromExtensionId: manifest.id,
      exportedFromExtensionName: manifest.name,
      exportedFromVersion: manifest.version,
      exportedFromSurface: 'desktop-tauri',
      chatArchive: chatArchive,
      chromeStorageLocal: chromeStorageLocal,
      libraryKv: libraryKv,
      diagnostics: {
        desktopExport: {
          ok: true,
          exporterVersion: EXPORTER_VERSION,
          durationMs: Date.now() - startedAt,
          storeAvailability: availability,
          warnings: warnings,
          options: safeObject(options),
        },
        chromeStorageError: null,
        libraryKvError: null,
      },
      summary: summary,
    };
    state.lastExportAt = Date.now();
    state.lastSummary = summary;
    state.lastWarnings = warnings.slice();
    state.lastError = null;
    return bundle;
  }

  function diagnose() {
    var stores = getStores();
    return {
      installed: true,
      surface: 'desktop-tauri',
      schema: FULL_BUNDLE_SCHEMA,
      chatArchiveSchema: CHAT_ARCHIVE_SCHEMA,
      exporterVersion: EXPORTER_VERSION,
      readOnly: true,
      writesData: false,
      storeAvailability: storeAvailability(stores),
      lastExportAt: state.lastExportAt,
      lastSummary: state.lastSummary,
      lastWarnings: state.lastWarnings.slice(),
      lastError: state.lastError,
    };
  }

  var previous = H2O.Studio.ingestion;
  H2O.Studio.ingestion = Object.assign({}, previous, {
    __installed: true,
    exportFullBundle: function (options) {
      return exportFullBundle(options).catch(function (error) {
        state.lastError = String(error && (error.stack || error.message || error));
        throw error;
      });
    },
    diagnoseExportBundle: diagnose,
    diagnose: function () {
      var base = {};
      if (previous && typeof previous.diagnose === 'function') {
        try { base = previous.diagnose() || {}; }
        catch (_) { base = {}; }
      }
      base.exporter = diagnose();
      return base;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
