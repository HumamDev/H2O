/* H2O Studio Sync - F7.1b folder.metadata bidirectional preview
 *
 * PURE PREVIEW HELPER - read-only, in-memory, no IO.
 *   - No Tauri invokes, no browser storage access, no fetch, no fs.
 *   - No SQLite access and no persistence.
 *   - No F5 tombstone lifecycle calls.
 *   - No F6 conflict queue calls or ingestion.
 *   - No import/export/folder-sync/peer-transport calls.
 *
 * This helper compares local and remote folder metadata evidence and returns
 * redacted counts only. Hashes are ephemeral implementation details and are
 * never exposed in the default report.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__bidirectionalFolderPreviewInstalled) return;

  var REPORT_SCHEMA = 'h2o.studio.sync.bidirectional-preview.v0';
  var ENTITY_KIND = 'folder.metadata';
  var VERSION = '0.1.0-f7.1b';
  var FOLDER_STATE_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';

  function nowIso() {
    return new Date().toISOString();
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(Object(obj), key);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeString(value) {
    if (value == null) return '';
    var str = String(value).trim();
    return str || '';
  }

  function firstPresent(row, keys) {
    var obj = safeObject(row);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (hasOwn(obj, key) && obj[key] != null) return obj[key];
    }
    return null;
  }

  function firstString(row, keys) {
    return safeString(firstPresent(row, keys));
  }

  function normalizeNumber(value) {
    if (value == null || value === '') return { present: false, value: null };
    var num = Number(value);
    if (!Number.isFinite(num)) return { present: true, value: null };
    return { present: true, value: num };
  }

  function normalizeTimestamp(value) {
    if (value == null || value === '') {
      return { present: false, parseable: false, value: null };
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { present: true, parseable: true, value: value };
    }
    var parsed = Date.parse(String(value));
    if (!Number.isFinite(parsed)) {
      return { present: true, parseable: false, value: null };
    }
    return { present: true, parseable: true, value: parsed };
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i++) {
      out[keys[i]] = canonicalize(value[keys[i]]);
    }
    return out;
  }

  function stableStringify(value) {
    return JSON.stringify(canonicalize(value));
  }

  function hashString(value) {
    var input = String(value || '');
    var hash = 0x811c9dc5;
    for (var i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function emptyBuckets() {
    return {};
  }

  function increment(map, key, amount) {
    if (!key) return;
    map[key] = Number(map[key] || 0) + (amount == null ? 1 : amount);
  }

  function addCode(list, code) {
    if (!code) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === code) return;
    }
    list.push({ code: code });
  }

  function createReport() {
    return {
      schema: REPORT_SCHEMA,
      ok: true,
      generatedAt: nowIso(),
      dryRun: true,
      redacted: true,
      writesPerformed: 0,
      entityKind: ENTITY_KIND,
      scanned: {
        local: 0,
        remote: 0,
        matchedById: 0
      },
      proposed: {
        pull: { total: 0, byEntityKind: emptyBuckets(), blocked: 0 },
        push: { total: 0, byEntityKind: emptyBuckets(), blocked: 0 }
      },
      categories: {
        same: 0,
        localOnly: 0,
        remoteOnly: 0,
        divergentMetadata: 0,
        localNewer: 0,
        remoteNewer: 0,
        timestampUnavailable: 0,
        unsupported: 0
      },
      conflictCandidates: {
        total: 0,
        byKind: emptyBuckets(),
        byEntityKind: emptyBuckets(),
        bySeverity: emptyBuckets()
      },
      tombstoneReferences: {
        total: 0,
        deleteVsEditOwnedByF5: 0
      },
      blockers: [],
      warnings: []
    };
  }

  function extractFolderRows(value) {
    if (Array.isArray(value)) return { rows: value, available: true };
    if (!isObject(value)) return { rows: [], available: false };
    if (Array.isArray(value.folders)) return { rows: value.folders, available: true };
    if (isObject(value.chromeStorageLocal)) {
      var state = safeObject(value.chromeStorageLocal[FOLDER_STATE_KEY]);
      if (Array.isArray(state.folders)) return { rows: state.folders, available: true };
    }
    var csl = safeObject(safeObject(value.bundle).chromeStorageLocal);
    var bundleState = safeObject(csl[FOLDER_STATE_KEY]);
    if (Array.isArray(bundleState.folders)) return { rows: bundleState.folders, available: true };
    return { rows: [], available: false };
  }

  function localFolderInput(input) {
    var obj = safeObject(input);
    if (hasOwn(obj, 'localFolders')) return extractFolderRows(obj.localFolders);
    if (isObject(obj.localState)) return extractFolderRows(obj.localState);
    if (isObject(obj.local)) return extractFolderRows(obj.local);
    return { rows: [], available: false };
  }

  function remoteFolderInput(input) {
    var obj = safeObject(input);
    if (hasOwn(obj, 'remoteFolders')) return extractFolderRows(obj.remoteFolders);
    if (isObject(obj.remoteState)) return extractFolderRows(obj.remoteState);
    if (isObject(obj.remote)) return extractFolderRows(obj.remote);
    if (isObject(obj.bundle)) return extractFolderRows(obj.bundle);
    if (isObject(obj.envelope)) return extractFolderRows(obj.envelope);
    return { rows: [], available: false };
  }

  function normalizeFolder(row, side, report) {
    if (!isObject(row)) {
      report.categories.unsupported += 1;
      addCode(report.warnings, 'unsupported');
      return null;
    }

    var id = firstString(row, ['id', 'folderId']);
    if (!id) {
      report.categories.unsupported += 1;
      addCode(report.blockers, 'folder-id-missing');
      return null;
    }

    var name = firstString(row, ['name', 'title', 'folderName']);
    var parentId = firstString(row, ['parentId', 'parentFolderId', 'parent_id']);
    var color = firstString(row, ['color', 'iconColor', 'folderColor', 'accentColor']);
    var icon = firstString(row, ['icon', 'iconKey']);
    var kind = firstString(row, ['kind']);
    var source = firstString(row, ['source']);
    var sortOrder = normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position']));
    var createdAt = normalizeTimestamp(firstPresent(row, ['createdAt', 'created_at']));
    var updatedAt = normalizeTimestamp(firstPresent(row, ['updatedAt', 'updated_at']));
    var metaValue = firstPresent(row, ['meta', 'meta_json']);
    var metaPresent = isObject(metaValue)
      ? Object.keys(metaValue).length > 0
      : !!safeString(metaValue);

    var hashInput = {
      name: name || null,
      parentId: parentId || null,
      color: color || null,
      icon: icon || null,
      sortOrder: sortOrder.value,
      kind: kind || null,
      source: source || null,
      metaPresent: !!metaPresent
    };

    return {
      id: id,
      side: side,
      namePresent: !!name,
      parentIdPresent: !!parentId,
      colorPresent: !!color,
      iconPresent: !!icon,
      sortOrderPresent: !!sortOrder.present,
      kindPresent: !!kind,
      sourcePresent: !!source,
      createdAtPresent: !!createdAt.present,
      updatedAtPresent: !!updatedAt.present,
      createdAtParseable: !!createdAt.parseable,
      updatedAtParseable: !!updatedAt.parseable,
      updatedAtValue: updatedAt.value,
      metaPresent: !!metaPresent,
      normalizedHash: hashString(stableStringify(hashInput))
    };
  }

  function normalizeCollection(rows, side, report) {
    var out = Object.create(null);
    var list = asArray(rows);
    for (var i = 0; i < list.length; i++) {
      var folder = normalizeFolder(list[i], side, report);
      if (!folder) continue;
      if (out[folder.id]) {
        report.categories.unsupported += 1;
        addCode(report.warnings, 'unsupported');
        continue;
      }
      out[folder.id] = folder;
    }
    return out;
  }

  function addConflictCandidate(report) {
    report.conflictCandidates.total += 1;
    increment(report.conflictCandidates.byKind, 'same-record-divergent-metadata');
    increment(report.conflictCandidates.byEntityKind, ENTITY_KIND);
    increment(report.conflictCandidates.bySeverity, 'medium');
  }

  function compareTimestamps(local, remote, report, hashDiffers) {
    if (!local.updatedAtParseable || !remote.updatedAtParseable) {
      if (hashDiffers) {
        report.categories.timestampUnavailable += 1;
        addCode(report.warnings, 'timestamp-unavailable');
      }
      return;
    }
    if (local.updatedAtValue > remote.updatedAtValue) {
      report.categories.localNewer += 1;
    } else if (remote.updatedAtValue > local.updatedAtValue) {
      report.categories.remoteNewer += 1;
    }
  }

  function addPreviewOnlyBlocker(report) {
    addCode(report.blockers, 'preview-only-no-apply');
  }

  function compareFolderMetadata(localMap, remoteMap, report) {
    var seen = Object.create(null);
    var localIds = Object.keys(localMap);
    var remoteIds = Object.keys(remoteMap);
    var i;

    for (i = 0; i < localIds.length; i++) {
      var id = localIds[i];
      seen[id] = true;
      var local = localMap[id];
      var remote = remoteMap[id];
      if (!remote) {
        report.categories.localOnly += 1;
        report.proposed.push.total += 1;
        report.proposed.push.blocked += 1;
        increment(report.proposed.push.byEntityKind, ENTITY_KIND);
        addPreviewOnlyBlocker(report);
        continue;
      }

      report.scanned.matchedById += 1;
      var hashDiffers = local.normalizedHash !== remote.normalizedHash;
      if (hashDiffers) {
        report.categories.divergentMetadata += 1;
        addCode(report.blockers, 'folder-metadata-divergent');
        addConflictCandidate(report);
      } else {
        report.categories.same += 1;
      }
      compareTimestamps(local, remote, report, hashDiffers);
    }

    for (i = 0; i < remoteIds.length; i++) {
      var remoteId = remoteIds[i];
      if (seen[remoteId]) continue;
      report.categories.remoteOnly += 1;
      report.proposed.pull.total += 1;
      report.proposed.pull.blocked += 1;
      increment(report.proposed.pull.byEntityKind, ENTITY_KIND);
      addPreviewOnlyBlocker(report);
    }
  }

  function inspectEnvelope(input, report) {
    var obj = safeObject(input);
    var envelope = isObject(obj.envelope) ? obj.envelope
      : isObject(obj.bundle) ? obj.bundle
      : null;
    if (!envelope) return;

    if (!hasOwn(envelope, 'sequenceNumber') || envelope.sequenceNumber == null) {
      addCode(report.warnings, 'peer-sequence-unavailable');
    }
    if (!hasOwn(envelope, 'watermark') && !hasOwn(envelope, 'watermarks')) {
      addCode(report.warnings, 'watermark-unavailable');
    }
  }

  function previewBidirectionalFolderMetadata(input) {
    var report = createReport();
    var inp = isObject(input) ? input : {};
    var localInput = localFolderInput(inp);
    var remoteInput = remoteFolderInput(inp);

    if (!localInput.available) addCode(report.warnings, 'local-folders-unavailable');
    if (!remoteInput.available) addCode(report.warnings, 'remote-folders-unavailable');

    report.scanned.local = localInput.rows.length;
    report.scanned.remote = remoteInput.rows.length;

    var localMap = normalizeCollection(localInput.rows, 'local', report);
    var remoteMap = normalizeCollection(remoteInput.rows, 'remote', report);
    compareFolderMetadata(localMap, remoteMap, report);
    inspectEnvelope(inp, report);

    return report;
  }

  H2O.Studio.diagnostics.previewBidirectionalFolderMetadata = previewBidirectionalFolderMetadata;
  H2O.Studio.diagnostics.__bidirectionalFolderPreviewInstalled = true;
  H2O.Studio.diagnostics.__bidirectionalFolderPreviewVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
