/* H2O Studio Sync - F7.1b/F7.2 folder.metadata bidirectional preview
 *
 * PURE PREVIEW HELPER - read-only, in-memory, no IO.
 *   - No Tauri invokes, no browser storage access, no fetch, no fs.
 *   - No SQLite access and no persistence.
 *   - No F5 tombstone lifecycle calls.
 *   - No F6 conflict queue calls or ingestion.
 *   - No import/export/folder-sync/peer-transport calls.
 *
 * This helper compares local and remote folder metadata evidence and returns
 * redacted counts by default. F7.2 can optionally return capped F6-shaped
 * conflict candidate objects; it still never writes or calls F6 ingestion.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__bidirectionalFolderPreviewInstalled) return;

  var REPORT_SCHEMA = 'h2o.studio.sync.folder-metadata-preview.v1';
  var LEGACY_REPORT_SCHEMA = 'h2o.studio.sync.bidirectional-preview.v0';
  var CONFLICT_CANDIDATE_SCHEMA = 'h2o.studio.sync-conflict-candidate.v1';
  var ENTITY_KIND = 'folder.metadata';
  var CONFLICT_ENTITY_KIND = 'folder';
  var CANDIDATE_SOURCE = 'bidirectional-folder-preview';
  var VERSION = '0.3.0-f7.2';
  var FOLDER_STATE_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
  var DEFAULT_CONFLICT_CANDIDATE_LIMIT = 20;
  var MAX_CONFLICT_CANDIDATE_LIMIT = 50;
  var DEFAULT_DIFFERENCE_LIMIT = 50;
  var MAX_DIFFERENCE_LIMIT = 100;

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

  function canonicalParentId(value) {
    return safeString(value);
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

  function stableHash(value) {
    var input = String(value || '');
    return hashString('a:' + input) + hashString('b:' + input);
  }

  function normalizeName(value) {
    return safeString(value).replace(/\s+/g, ' ').toLowerCase();
  }

  function normalizeHexColor(value) {
    var color = safeString(value);
    return color ? color.toLowerCase() : '';
  }

  function normalizeBooleanLike(value) {
    if (value === true || value === false) return value;
    if (value == null || value === '') return null;
    var str = String(value).trim().toLowerCase();
    if (str === 'true' || str === '1' || str === 'yes') return true;
    if (str === 'false' || str === '0' || str === 'no') return false;
    return null;
  }

  function normalizeDeletedState(row) {
    var deletedAt = firstString(row, ['deletedAt', 'deleted_at', 'removedAt', 'removed_at']);
    if (deletedAt) return 'deleted';
    var deleted = normalizeBooleanLike(firstPresent(row, ['deleted', 'isDeleted', 'is_deleted']));
    if (deleted === true) return 'deleted';
    var active = normalizeBooleanLike(firstPresent(row, ['active', 'isActive', 'is_active']));
    if (active === true) return 'active';
    if (active === false) return 'inactive';
    return '';
  }

  function fingerprint(prefix, value) {
    return stableHash(prefix + ':' + safeString(value || 'unknown'));
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

  function normalizeOptions(input) {
    var root = safeObject(input);
    var opts = isObject(root.options) ? root.options : root;
    var include = opts.includeConflictCandidates === true;
    var limit = Number(opts.conflictCandidateLimit);
    if (!Number.isFinite(limit) || limit < 0) limit = DEFAULT_CONFLICT_CANDIDATE_LIMIT;
    limit = Math.min(Math.floor(limit), MAX_CONFLICT_CANDIDATE_LIMIT);
    var diffLimit = Number(opts.differenceLimit);
    if (!Number.isFinite(diffLimit) || diffLimit < 0) diffLimit = DEFAULT_DIFFERENCE_LIMIT;
    diffLimit = Math.min(Math.floor(diffLimit), MAX_DIFFERENCE_LIMIT);
    return {
      includeConflictCandidates: include,
      conflictCandidateLimit: limit,
      includeIds: opts.includeIds === true,
      differenceLimit: diffLimit
    };
  }

  function createReport(options) {
    var conflictCandidates = {
      total: 0,
      byKind: emptyBuckets(),
      byEntityKind: emptyBuckets(),
      bySeverity: emptyBuckets()
    };
    if (options && options.includeConflictCandidates === true) {
      conflictCandidates.candidates = [];
    }

    return {
      schema: REPORT_SCHEMA,
      legacySchema: LEGACY_REPORT_SCHEMA,
      ok: true,
      readOnly: true,
      noMutation: true,
      generatedAt: nowIso(),
      dryRun: true,
      redacted: !(options && options.includeIds === true),
      writesPerformed: 0,
      syncApplyPerformed: false,
      operationApplyPerformed: false,
      entityKind: ENTITY_KIND,
      sources: {
        local: {
          available: false,
          rowCount: 0,
          sourceSurface: null,
          sourceHash: null
        },
        remote: {
          available: false,
          rowCount: 0,
          sourceSurface: null,
          sourceHash: null
        }
      },
      comparedFolders: {
        local: 0,
        remote: 0,
        matchedById: 0,
        matchedByName: 0,
        missingLocal: 0,
        missingRemote: 0
      },
      matches: {
        total: 0,
        sameIdSameMetadata: 0
      },
      differences: {
        total: 0,
        byKind: emptyBuckets(),
        entries: []
      },
      staleGuard: {
        localSourceHash: null,
        remoteSourceHash: null,
        comparisonHash: null
      },
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
      conflictCandidates: conflictCandidates,
      tombstoneReferences: {
        total: 0,
        deleteVsEditOwnedByF5: 0
      },
      canApply: false,
      blockers: [
        { code: 'preview-only-no-apply' },
        { code: 'f6-ingest-not-called' },
        { code: 'folder-metadata-apply-blocked' },
        { code: 'metadata-authority-not-proven' }
      ],
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

  function makeDedupeHash(conflictKind, idMaterial, localHash, remoteHash, field) {
    return 'f7folder:' + stableHash(stableStringify({
      v: 'f7-folder-conflict-v1',
      conflictKind: conflictKind,
      entityKind: CONFLICT_ENTITY_KIND,
      field: field || null,
      folderIdentityHash: stableHash(idMaterial || 'unknown'),
      localMetadataHash: localHash || null,
      remoteMetadataHash: remoteHash || null
    }));
  }

  function candidateFor(conflictKind, severity, classification, details) {
    details = safeObject(details);
    return {
      schema: CONFLICT_CANDIDATE_SCHEMA,
      conflictKind: conflictKind,
      entityKind: CONFLICT_ENTITY_KIND,
      classification: classification,
      severity: severity,
      source: CANDIDATE_SOURCE,
      dedupeKeyHash: makeDedupeHash(
        conflictKind,
        details.idMaterial,
        details.localHash,
        details.remoteHash,
        details.field
      ),
      localUpdatedAtPresent: !!details.localUpdatedAtPresent,
      remoteUpdatedAtPresent: !!details.remoteUpdatedAtPresent,
      localDigestPresent: !!details.localDigestPresent,
      remoteDigestPresent: !!details.remoteDigestPresent,
      field: details.field || null,
      previewSchema: REPORT_SCHEMA,
      warnings: asArray(details.warnings)
        .map(function (w) { return isObject(w) ? { code: safeString(w.code) } : { code: safeString(w) }; })
        .filter(function (w) { return !!w.code; })
    };
  }

  function addConflictCandidate(report, conflictKind, severity, classification, details) {
    report.conflictCandidates.total += 1;
    increment(report.conflictCandidates.byKind, conflictKind);
    increment(report.conflictCandidates.byEntityKind, CONFLICT_ENTITY_KIND);
    increment(report.conflictCandidates.bySeverity, severity);
    if (Array.isArray(report.conflictCandidates.candidates)
        && report.conflictCandidates.candidates.length < report._candidateLimit) {
      report.conflictCandidates.candidates.push(candidateFor(conflictKind, severity, classification, details));
    }
  }

  function candidateMappingForDifference(kind) {
    if (kind === 'same-id-different-name') {
      return {
        conflictKind: 'same-record-divergent-metadata',
        classification: 'needs-human-review',
        severity: 'medium',
        warning: 'same-id-different-name'
      };
    }
    if (kind === 'same-id-different-canonical-color') {
      return {
        conflictKind: 'same-record-divergent-metadata',
        classification: 'safe-review',
        severity: 'low',
        warning: 'same-id-different-canonical-color'
      };
    }
    if (kind === 'same-id-different-icon') {
      return {
        conflictKind: 'same-record-divergent-metadata',
        classification: 'safe-review',
        severity: 'low',
        warning: 'same-id-different-icon'
      };
    }
    if (kind === 'same-id-different-sort-order') {
      return {
        conflictKind: 'same-record-divergent-metadata',
        classification: 'safe-review',
        severity: 'low',
        warning: 'same-id-different-sort-order'
      };
    }
    if (kind === 'same-id-different-active-state') {
      return {
        conflictKind: 'delete-vs-edit-reference',
        classification: 'needs-human-review',
        severity: 'high',
        warning: 'active-state-divergent'
      };
    }
    if (kind === 'same-id-different-source-metadata') {
      return {
        conflictKind: 'same-record-divergent-metadata',
        classification: 'needs-human-review',
        severity: 'medium',
        warning: 'same-id-different-source-metadata'
      };
    }
    if (kind === 'same-id-different-metadata') {
      return {
        conflictKind: 'same-record-divergent-metadata',
        classification: 'needs-human-review',
        severity: 'medium',
        warning: 'same-id-different-metadata'
      };
    }
    if (kind === 'same-name-different-id') {
      return {
        conflictKind: 'folder-identity-collision',
        classification: 'needs-human-review',
        severity: 'medium',
        warning: 'same-name-different-id'
      };
    }
    if (kind === 'missing-local-folder') {
      return {
        conflictKind: 'remote-only-folder-metadata',
        classification: 'safe-review',
        severity: 'low',
        warning: 'missing-local-folder',
        informationalOnly: true
      };
    }
    if (kind === 'missing-remote-folder') {
      return {
        conflictKind: 'local-only-folder-metadata',
        classification: 'safe-review',
        severity: 'low',
        warning: 'missing-remote-folder',
        informationalOnly: true
      };
    }
    return {
      conflictKind: 'same-record-divergent-metadata',
      classification: 'needs-human-review',
      severity: 'medium',
      warning: kind || 'folder-metadata-divergent'
    };
  }

  function candidateSeverityForDifference(kind) {
    return candidateMappingForDifference(kind).severity;
  }

  function addConflictCandidateForDifference(report, kind, field, details) {
    var mapping = candidateMappingForDifference(kind);
    var candidateDetails = Object.assign({}, safeObject(details), {
      field: field || null,
      warnings: asArray(details && details.warnings).slice()
    });
    addCode(candidateDetails.warnings, mapping.warning);
    if (mapping.informationalOnly) addCode(candidateDetails.warnings, 'informational-only-no-apply');
    addConflictCandidate(
      report,
      mapping.conflictKind,
      mapping.severity,
      mapping.classification,
      candidateDetails
    );
  }

  function differenceEntry(report, kind, severity, field, details) {
    details = safeObject(details);
    var out = {
      kind: kind,
      severity: severity,
      field: field || null,
      folderFingerprint: details.folderFingerprint || fingerprint('folder', details.idMaterial),
      nameFingerprint: details.nameFingerprint || null,
      localDigestPresent: !!details.localDigestPresent,
      remoteDigestPresent: !!details.remoteDigestPresent,
      localMetadataHash: details.localHash || null,
      remoteMetadataHash: details.remoteHash || null,
      warnings: asArray(details.warnings)
        .map(function (w) { return isObject(w) ? { code: safeString(w.code) } : { code: safeString(w) }; })
        .filter(function (w) { return !!w.code; })
    };
    if (report.redacted === false) {
      if (details.localId) out.localFolderId = details.localId;
      if (details.remoteId) out.remoteFolderId = details.remoteId;
    }
    return out;
  }

  function addDifference(report, kind, severity, field, details) {
    report.differences.total += 1;
    increment(report.differences.byKind, kind);
    addConflictCandidateForDifference(report, kind, field, details);
    if (report.differences.entries.length < report._differenceLimit) {
      report.differences.entries.push(differenceEntry(report, kind, severity, field, details));
    }
  }

  function normalizeFolder(row, side, report, index) {
    if (!isObject(row)) {
      report.categories.unsupported += 1;
      addCode(report.warnings, 'unsupported');
      addConflictCandidate(report, 'unsupported-merge-kind', 'info', 'unsupported-record-kind', {
        idMaterial: side + ':unsupported:' + index + ':non-object',
        localDigestPresent: side === 'local',
        remoteDigestPresent: side === 'remote',
        warnings: [{ code: 'unsupported' }]
      });
      return null;
    }

    var id = firstString(row, ['id', 'folderId']);
    if (!id) {
      report.categories.unsupported += 1;
      addCode(report.blockers, 'folder-id-missing');
      addConflictCandidate(report, 'unsupported-merge-kind', 'info', 'unsupported-record-kind', {
        idMaterial: side + ':missing-id:' + index + ':' + stableHash(stableStringify(row)),
        localDigestPresent: side === 'local',
        remoteDigestPresent: side === 'remote',
        warnings: [{ code: 'folder-id-missing' }]
      });
      return null;
    }

    var name = firstString(row, ['name', 'title', 'folderName']);
    var normalizedName = normalizeName(name);
    var parentId = canonicalParentId(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id']));
    var color = normalizeHexColor(firstString(row, ['color', 'folderColor', 'accentColor']));
    var iconColor = normalizeHexColor(firstString(row, ['iconColor', 'icon_color']));
    var canonicalColor = iconColor || color;
    var icon = firstString(row, ['icon', 'iconKey']);
    var kind = firstString(row, ['kind']);
    var source = firstString(row, ['source']);
    var sourceSurface = firstString(row, ['sourceSurface', 'surface', 'storeKind']);
    var sourcePeerId = firstString(row, ['sourcePeerId', 'syncPeerId', 'peerId', 'source_peer_id']);
    var sortOrder = normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position']));
    var createdAt = normalizeTimestamp(firstPresent(row, ['createdAt', 'created_at']));
    var updatedAt = normalizeTimestamp(firstPresent(row, ['updatedAt', 'updated_at']));
    var deletedState = normalizeDeletedState(row);
    var metaValue = firstPresent(row, ['meta', 'meta_json']);
    var metaPresent = isObject(metaValue)
      ? Object.keys(metaValue).length > 0
      : !!safeString(metaValue);

    var hashInput = {
      name: name || null,
      parentId: parentId,
      color: color || null,
      iconColor: iconColor || null,
      canonicalColor: canonicalColor || null,
      icon: icon || null,
      sortOrder: sortOrder.value,
      deletedState: deletedState || null,
      kind: kind || null,
      source: source || null,
      sourceSurface: sourceSurface || null,
      sourcePeerHash: sourcePeerId ? fingerprint('peer', sourcePeerId) : null,
      metaPresent: !!metaPresent
    };

    return {
      id: id,
      side: side,
      idFingerprint: fingerprint('folder-id', id),
      name: name,
      normalizedName: normalizedName,
      nameFingerprint: normalizedName ? fingerprint('folder-name', normalizedName) : null,
      parentId: parentId,
      color: color,
      iconColor: iconColor,
      canonicalColor: canonicalColor,
      icon: icon,
      kind: kind,
      source: source,
      sourceSurface: sourceSurface,
      sourcePeerHash: sourcePeerId ? fingerprint('peer', sourcePeerId) : null,
      sortOrder: sortOrder.value,
      deletedState: deletedState,
      namePresent: !!name,
      parentIdPresent: !!parentId,
      colorPresent: !!canonicalColor,
      iconPresent: !!icon,
      sortOrderPresent: !!sortOrder.present,
      kindPresent: !!kind,
      sourcePresent: !!(source || sourceSurface || sourcePeerId),
      createdAtPresent: !!createdAt.present,
      updatedAtPresent: !!updatedAt.present,
      createdAtParseable: !!createdAt.parseable,
      updatedAtParseable: !!updatedAt.parseable,
      updatedAtValue: updatedAt.value,
      deletedStatePresent: !!deletedState,
      metaPresent: !!metaPresent,
      normalizedHash: hashString(stableStringify(hashInput))
    };
  }

  function normalizeCollection(rows, side, report) {
    var out = Object.create(null);
    var list = asArray(rows);
    for (var i = 0; i < list.length; i++) {
      var folder = normalizeFolder(list[i], side, report, i);
      if (!folder) continue;
      if (out[folder.id]) {
        report.categories.unsupported += 1;
        addCode(report.warnings, 'unsupported');
        addConflictCandidate(report, 'unsupported-merge-kind', 'info', 'unsupported-record-kind', {
          idMaterial: side + ':duplicate-id:' + i + ':' + stableHash(folder.id),
          localDigestPresent: side === 'local',
          remoteDigestPresent: side === 'remote',
          warnings: [{ code: 'unsupported' }]
        });
        continue;
      }
      out[folder.id] = folder;
    }
    return out;
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

  function collectionHash(map) {
    var ids = Object.keys(map || {}).sort();
    var rows = [];
    for (var i = 0; i < ids.length; i++) {
      var row = map[ids[i]];
      rows.push({
        idFingerprint: row.idFingerprint,
        metadataHash: row.normalizedHash,
        nameFingerprint: row.nameFingerprint || null
      });
    }
    return stableHash(stableStringify(rows));
  }

  function sourceSurface(input, side) {
    var obj = safeObject(input);
    var direct = firstString(obj, [
      side + 'SourceSurface',
      side + 'Surface',
      side + 'StoreKind',
      side + 'Source'
    ]);
    if (direct) return direct;
    var nested = safeObject(obj[side]);
    return firstString(nested, ['sourceSurface', 'surface', 'storeKind', 'source']) || null;
  }

  function updateSourceReport(report, side, folderInput, map, input) {
    var sourceHash = collectionHash(map);
    report.sources[side] = {
      available: folderInput.available === true,
      rowCount: asArray(folderInput.rows).length,
      sourceSurface: sourceSurface(input, side),
      sourceHash: sourceHash
    };
    if (side === 'local') report.staleGuard.localSourceHash = sourceHash;
    if (side === 'remote') report.staleGuard.remoteSourceHash = sourceHash;
  }

  function differenceDetails(local, remote, warnings) {
    local = safeObject(local);
    remote = safeObject(remote);
    return {
      idMaterial: (local.id || remote.id || local.idFingerprint || remote.idFingerprint || 'unknown'),
      folderFingerprint: local.idFingerprint || remote.idFingerprint || null,
      nameFingerprint: local.nameFingerprint || remote.nameFingerprint || null,
      localId: local.id || null,
      remoteId: remote.id || null,
      localHash: local.normalizedHash || null,
      remoteHash: remote.normalizedHash || null,
      localUpdatedAtPresent: !!local.updatedAtPresent,
      remoteUpdatedAtPresent: !!remote.updatedAtPresent,
      localDigestPresent: !!local.id,
      remoteDigestPresent: !!remote.id,
      warnings: warnings || []
    };
  }

  function compareMetadataFields(local, remote, report) {
    var changed = false;
    var checks = [
      ['name', 'same-id-different-name', local.normalizedName, remote.normalizedName],
      ['canonicalColor', 'same-id-different-canonical-color', local.canonicalColor, remote.canonicalColor],
      ['icon', 'same-id-different-icon', local.icon, remote.icon],
      ['sortOrder', 'same-id-different-sort-order', local.sortOrder, remote.sortOrder],
      ['activeState', 'same-id-different-active-state', local.deletedState, remote.deletedState],
      ['sourceMetadata', 'same-id-different-source-metadata',
        stableStringify({
          source: local.source || null,
          sourceSurface: local.sourceSurface || null,
          sourcePeerHash: local.sourcePeerHash || null
        }),
        stableStringify({
          source: remote.source || null,
          sourceSurface: remote.sourceSurface || null,
          sourcePeerHash: remote.sourcePeerHash || null
        })
      ]
    ];

    for (var i = 0; i < checks.length; i++) {
      var field = checks[i][0];
      var kind = checks[i][1];
      var a = checks[i][2];
      var b = checks[i][3];
      if (a === b) continue;
      changed = true;
      addDifference(report, kind, candidateSeverityForDifference(kind), field,
        differenceDetails(local, remote, [{ code: kind }]));
    }
    return changed;
  }

  function indexByName(map) {
    var out = Object.create(null);
    var ids = Object.keys(map || {});
    for (var i = 0; i < ids.length; i++) {
      var row = map[ids[i]];
      if (!row || !row.nameFingerprint) continue;
      var key = row.nameFingerprint;
      out[key] = out[key] || [];
      out[key].push(row);
    }
    return out;
  }

  function compareSameNameDifferentIds(localMap, remoteMap, report) {
    var localNames = indexByName(localMap);
    var remoteNames = indexByName(remoteMap);
    var keys = Object.keys(localNames);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var localRows = localNames[key] || [];
      var remoteRows = remoteNames[key] || [];
      if (!remoteRows.length) continue;
      report.comparedFolders.matchedByName += Math.min(localRows.length, remoteRows.length);
      for (var l = 0; l < localRows.length; l++) {
        for (var r = 0; r < remoteRows.length; r++) {
          if (localRows[l].id === remoteRows[r].id) continue;
          addDifference(report, 'same-name-different-id', 'medium', 'identity',
            differenceDetails(localRows[l], remoteRows[r], [{ code: 'same-name-different-id' }]));
        }
      }
    }
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
        report.comparedFolders.missingRemote += 1;
        addDifference(report, 'missing-remote-folder', 'medium', 'identity',
          differenceDetails(local, {}, [{ code: 'missing-remote-folder' }]));
        report.proposed.push.total += 1;
        report.proposed.push.blocked += 1;
        increment(report.proposed.push.byEntityKind, ENTITY_KIND);
        addPreviewOnlyBlocker(report);
        continue;
      }

      report.scanned.matchedById += 1;
      report.comparedFolders.matchedById += 1;
      var hashDiffers = local.normalizedHash !== remote.normalizedHash;
      if (hashDiffers) {
        report.categories.divergentMetadata += 1;
        addCode(report.blockers, 'folder-metadata-divergent');
        if (!compareMetadataFields(local, remote, report)) {
          addDifference(report, 'same-id-different-metadata', 'medium', 'metadata',
            differenceDetails(local, remote, [{ code: 'folder-metadata-divergent' }]));
        }
      } else {
        report.categories.same += 1;
        report.matches.total += 1;
        report.matches.sameIdSameMetadata += 1;
      }
      compareTimestamps(local, remote, report, hashDiffers);
    }

    for (i = 0; i < remoteIds.length; i++) {
      var remoteId = remoteIds[i];
      if (seen[remoteId]) continue;
      var remote = remoteMap[remoteId];
      report.categories.remoteOnly += 1;
      report.comparedFolders.missingLocal += 1;
      addDifference(report, 'missing-local-folder', 'medium', 'identity',
        differenceDetails({}, remote, [{ code: 'missing-local-folder' }]));
      report.proposed.pull.total += 1;
      report.proposed.pull.blocked += 1;
      increment(report.proposed.pull.byEntityKind, ENTITY_KIND);
      addPreviewOnlyBlocker(report);
    }
    compareSameNameDifferentIds(localMap, remoteMap, report);
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
    var inp = isObject(input) ? input : {};
    var options = normalizeOptions(inp);
    var report = createReport(options);
    Object.defineProperty(report, '_candidateLimit', {
      value: options.conflictCandidateLimit,
      enumerable: false,
      configurable: true
    });
    Object.defineProperty(report, '_differenceLimit', {
      value: options.differenceLimit,
      enumerable: false,
      configurable: true
    });
    var localInput = localFolderInput(inp);
    var remoteInput = remoteFolderInput(inp);

    if (!localInput.available) addCode(report.warnings, 'local-folders-unavailable');
    if (!remoteInput.available) addCode(report.warnings, 'remote-folders-unavailable');

    report.scanned.local = localInput.rows.length;
    report.scanned.remote = remoteInput.rows.length;
    report.comparedFolders.local = localInput.rows.length;
    report.comparedFolders.remote = remoteInput.rows.length;

    var localMap = normalizeCollection(localInput.rows, 'local', report);
    var remoteMap = normalizeCollection(remoteInput.rows, 'remote', report);
    updateSourceReport(report, 'local', localInput, localMap, inp);
    updateSourceReport(report, 'remote', remoteInput, remoteMap, inp);
    compareFolderMetadata(localMap, remoteMap, report);
    inspectEnvelope(inp, report);
    report.staleGuard.comparisonHash = stableHash(stableStringify({
      schema: REPORT_SCHEMA,
      localSourceHash: report.staleGuard.localSourceHash,
      remoteSourceHash: report.staleGuard.remoteSourceHash,
      differences: report.differences.byKind,
      matches: report.matches.sameIdSameMetadata
    }));
    delete report._candidateLimit;
    delete report._differenceLimit;

    return report;
  }

  H2O.Studio.diagnostics.previewBidirectionalFolderMetadata = previewBidirectionalFolderMetadata;
  H2O.Studio.diagnostics.__bidirectionalFolderPreviewInstalled = true;
  H2O.Studio.diagnostics.__bidirectionalFolderPreviewVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
