/* H2O Studio Sync - F10.6.2 read-only folder sync diff engine
 *
 * REPORT-ONLY diagnostic. Consumes F10.6.1 canonical snapshots only.
 * No raw folder rows. No storage. No transport. No mutation.
 *
 * Safety invariants:
 *   - No writes to localStorage/chrome.storage/IndexedDB.
 *   - No fetch. No chrome.runtime.sendMessage. No timers/polling.
 *   - No proposal envelope emission.
 *   - No conflictCandidate envelope emission.
 *   - No applyEvent, apply, remote apply, WebDAV, or write-back.
 *   - folderBinding is diff/preview-only and never proposal eligible.
 *   - Raw names and raw chat IDs are never emitted by this report.
 *   - Defensive forever-no key scan runs before returning.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__folderSyncDiffInstalled) return;

  var SNAPSHOT_SCHEMA = 'h2o.studio.sync.folder-canonical-snapshot.v1';
  var DIFF_SCHEMA = 'h2o.studio.sync.folder-diff.v1';
  var CONFLICT_SCHEMA = 'h2o.studio.sync-conflict-candidate.v1';
  var PREDICATE_VERSION = 'h2o.folder-sync.predicate.v1';
  var VERSION = '0.1.0-f10.6.2';
  var REDACTED = 'redacted';
  var DEVICE_LOCAL = 'device-local';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'url', 'path', 'password', 'apiKey'
  ];

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

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function normalizeOptions(input) {
    var opts = safeObject(input);
    return {
      redactionClass: opts.redactionClass === DEVICE_LOCAL ? DEVICE_LOCAL : REDACTED
    };
  }

  function emptyCounts() {
    return {
      added: 0,
      changed: 0,
      deleted: 0,
      unchanged: 0,
      conflicted: 0,
      bindingAdded: 0,
      bindingRemoved: 0
    };
  }

  function baseResult(options, basePresent) {
    return {
      schema: DIFF_SCHEMA,
      ok: false,
      redacted: true,
      redactionClass: options.redactionClass,
      mode: basePresent ? '3-way' : '2-way',
      predicateVersion: PREDICATE_VERSION,
      snapshots: {
        localCount: 0,
        remoteCount: 0,
        baseCount: 0,
        basePresent: !!basePresent
      },
      counts: emptyCounts(),
      buckets: {
        added: [],
        changed: [],
        deleted: [],
        unchanged: [],
        conflicted: []
      },
      conflicts: [],
      blockers: [],
      warnings: []
    };
  }

  function validSnapshot(snapshot) {
    return isObject(snapshot)
      && snapshot.schema === SNAPSHOT_SCHEMA
      && Array.isArray(snapshot.objects)
      && Array.isArray(snapshot.bindings);
  }

  function folderObjects(snapshot) {
    return asArray(snapshot && snapshot.objects).filter(function (obj) {
      return isObject(obj)
        && obj.objectType === 'folder'
        && obj.subjectType === 'folder.metadata'
        && !!cleanString(obj.subjectId);
    });
  }

  function bindingObjects(snapshot) {
    return asArray(snapshot && snapshot.bindings).filter(function (obj) {
      return isObject(obj)
        && obj.objectType === 'folderBinding'
        && obj.subjectType === 'folderBinding'
        && !!cleanString(obj.subjectId);
    });
  }

  function shallowEqual(a, b) {
    return JSON.stringify(a || null) === JSON.stringify(b || null);
  }

  function buildFolderMap(snapshot, label, result) {
    var map = Object.create(null);
    var list = folderObjects(snapshot);
    var nameMap = Object.create(null);
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      var subjectId = cleanString(row.subjectId);
      if (!subjectId) continue;
      if (map[subjectId] && !shallowEqual(map[subjectId], row)) {
        addCode(result.blockers, 'subjectId-collision');
        continue;
      }
      map[subjectId] = row;
      var nameHash = cleanString(row.nameHash);
      if (nameHash) {
        if (nameMap[nameHash] && nameMap[nameHash] !== subjectId) addCode(result.blockers, 'duplicate-folder-name');
        nameMap[nameHash] = subjectId;
      }
    }
    checkMissingParents(map, label, result);
    return map;
  }

  function buildBindingMap(snapshot, result) {
    var map = Object.create(null);
    var list = bindingObjects(snapshot);
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      var subjectId = cleanString(row.subjectId);
      if (!subjectId) continue;
      if (map[subjectId] && !shallowEqual(map[subjectId], row)) {
        addCode(result.blockers, 'subjectId-collision');
        continue;
      }
      map[subjectId] = row;
    }
    return map;
  }

  function checkMissingParents(map, label, result) {
    var ids = Object.keys(map);
    for (var i = 0; i < ids.length; i += 1) {
      var row = map[ids[i]];
      var parentSubjectId = cleanString(row && row.structural && row.structural.parentSubjectId);
      if (parentSubjectId && !map[parentSubjectId]) {
        addCode(result.blockers, 'orphan-parent');
        addCode(result.warnings, label + '-orphan-parent');
      }
    }
  }

  function allKeys() {
    var out = Object.create(null);
    for (var i = 0; i < arguments.length; i += 1) {
      var map = arguments[i] || {};
      var keys = Object.keys(map);
      for (var k = 0; k < keys.length; k += 1) out[keys[k]] = true;
    }
    return Object.keys(out).sort();
  }

  function folderRevision(row) {
    return cleanString(row && row.revisionHash);
  }

  function fieldValue(row, field) {
    var obj = safeObject(row);
    var structural = safeObject(obj.structural);
    if (field === 'name') return cleanString(obj.nameHash);
    if (field === 'parent') return cleanString(structural.parentSubjectId);
    if (field === 'color') return cleanString(structural.color);
    if (field === 'icon') return cleanString(structural.icon);
    if (field === 'sortOrder') return structural.sortOrder == null ? '' : String(structural.sortOrder);
    if (field === 'kind') return cleanString(structural.kind);
    if (field === 'source') return cleanString(structural.source);
    return '';
  }

  function changedFields(a, b) {
    if (!a || !b) return [];
    var fields = ['name', 'parent', 'color', 'icon', 'sortOrder', 'kind', 'source'];
    var out = [];
    for (var i = 0; i < fields.length; i += 1) {
      if (fieldValue(a, fields[i]) !== fieldValue(b, fields[i])) out.push(fields[i]);
    }
    return out;
  }

  function bucketEntry(kind, subjectId, row, detail) {
    var safeDetail = safeObject(detail);
    var out = {
      subjectType: 'folder.metadata',
      subjectId: subjectId,
      kind: kind,
      revisionHash: folderRevision(row) || null,
      proposalEligible: safeDetail.proposalEligible === true
    };
    var fields = Array.isArray(safeDetail.changedFields) ? safeDetail.changedFields.filter(Boolean) : [];
    if (fields.length) out.changedFields = fields;
    if (cleanString(row && row.nameHash)) out.nameHash = cleanString(row.nameHash);
    if (safeDetail.reason) out.reason = cleanString(safeDetail.reason);
    return out;
  }

  function addBucket(result, bucketName, entry) {
    result.counts[bucketName] += 1;
    result.buckets[bucketName].push(entry);
  }

  function conflictSeverity(reason, fields) {
    if (reason === 'delete-vs-update') return 'high';
    if (reason === 'missing-parent' || reason === 'duplicate-folder-name') return 'high';
    var list = Array.isArray(fields) ? fields : [];
    if (list.length === 1 && list[0] === 'color') return 'low';
    return 'medium';
  }

  function makeConflict(subjectId, reason, localRow, remoteRow, baseRow, fields, hardBlocker) {
    var fieldList = Array.isArray(fields) ? fields.filter(Boolean) : [];
    return {
      schema: CONFLICT_SCHEMA,
      entityKind: 'folder',
      subjectType: 'folder.metadata',
      subjectId: subjectId,
      conflictKind: reason === 'delete-vs-update' ? 'delete-vs-edit-reference' : 'folder-metadata-divergent',
      classification: hardBlocker ? 'needs-human-review' : 'safe-review',
      severity: conflictSeverity(reason, fieldList),
      divergenceReason: reason,
      requesterState: {
        revisionHash: folderRevision(remoteRow) || null,
        present: !!remoteRow
      },
      counterpartState: {
        revisionHash: folderRevision(localRow) || null,
        present: !!localRow
      },
      commonAncestorHash: folderRevision(baseRow) || null,
      changedFields: fieldList,
      proposalEligible: false,
      warnings: hardBlocker ? [{ code: reason }] : []
    };
  }

  function classifyTwoWay(subjectId, localRow, remoteRow, result) {
    if (localRow && remoteRow) {
      if (folderRevision(localRow) === folderRevision(remoteRow)) {
        addBucket(result, 'unchanged', bucketEntry('unchanged', subjectId, localRow, { proposalEligible: false }));
        return;
      }
      var fields = changedFields(localRow, remoteRow);
      addBucket(result, 'conflicted', bucketEntry('conflicted', subjectId, remoteRow, {
        proposalEligible: false,
        changedFields: fields,
        reason: '2-way-different-revision'
      }));
      result.conflicts.push(makeConflict(subjectId, '2-way-different-revision', localRow, remoteRow, null, fields, false));
      return;
    }
    if (remoteRow && !localRow) {
      addBucket(result, 'added', bucketEntry('added', subjectId, remoteRow, { proposalEligible: false }));
      return;
    }
    if (localRow && !remoteRow) {
      addBucket(result, 'deleted', bucketEntry('deleted', subjectId, localRow, { proposalEligible: false }));
    }
  }

  function classifyThreeWay(subjectId, localRow, remoteRow, baseRow, result) {
    if (!baseRow) {
      if (localRow && remoteRow) {
        if (folderRevision(localRow) === folderRevision(remoteRow)) {
          addBucket(result, 'unchanged', bucketEntry('unchanged', subjectId, localRow, { proposalEligible: false }));
          return;
        }
        var noBaseFields = changedFields(localRow, remoteRow);
        addBucket(result, 'conflicted', bucketEntry('conflicted', subjectId, remoteRow, {
          proposalEligible: false,
          changedFields: noBaseFields,
          reason: 'baseline-hash-not-verified'
        }));
        addCode(result.blockers, 'baseline-hash-not-verified');
        result.conflicts.push(makeConflict(subjectId, 'baseline-hash-not-verified', localRow, remoteRow, null, noBaseFields, true));
        return;
      }
      if (remoteRow && !localRow) {
        addBucket(result, 'added', bucketEntry('added', subjectId, remoteRow, { proposalEligible: true }));
        return;
      }
      if (localRow && !remoteRow) {
        addBucket(result, 'deleted', bucketEntry('deleted', subjectId, localRow, { proposalEligible: true }));
      }
      return;
    }

    var baseRev = folderRevision(baseRow);
    var localRev = folderRevision(localRow);
    var remoteRev = folderRevision(remoteRow);
    var localPresent = !!localRow;
    var remotePresent = !!remoteRow;
    var localChanged = localPresent ? localRev !== baseRev : true;
    var remoteChanged = remotePresent ? remoteRev !== baseRev : true;

    if (localPresent && remotePresent && localRev === remoteRev) {
      addBucket(result, localChanged || remoteChanged ? 'changed' : 'unchanged', bucketEntry(
        localChanged || remoteChanged ? 'changed' : 'unchanged',
        subjectId,
        localRow,
        { proposalEligible: false, changedFields: changedFields(baseRow, localRow) }
      ));
      return;
    }

    if (!remoteChanged && localChanged) {
      addBucket(result, 'changed', bucketEntry('changed', subjectId, localRow || baseRow, {
        proposalEligible: true,
        changedFields: localRow ? changedFields(baseRow, localRow) : [],
        reason: localRow ? 'local-one-sided-change' : 'local-one-sided-delete'
      }));
      return;
    }

    if (!localChanged && remoteChanged) {
      var bucketName = remotePresent ? 'changed' : 'deleted';
      addBucket(result, bucketName, bucketEntry(bucketName, subjectId, remoteRow || baseRow, {
        proposalEligible: true,
        changedFields: remoteRow ? changedFields(baseRow, remoteRow) : [],
        reason: remoteRow ? 'remote-one-sided-change' : 'remote-one-sided-delete'
      }));
      return;
    }

    var reason = (!localPresent || !remotePresent) ? 'delete-vs-update' : 'both-changed';
    var fields = changedFields(localRow || baseRow, remoteRow || baseRow);
    var hard = reason === 'delete-vs-update';
    if (hard) {
      addCode(result.blockers, 'f5-blocker-present');
    } else if (fields.indexOf('name') !== -1 && fields.indexOf('parent') !== -1) {
      reason = 'rename-vs-move';
    } else if (fields.length === 1 && fields[0] === 'name') {
      reason = 'rename-vs-rename';
    } else if (fields.length === 1 && fields[0] === 'color') {
      reason = 'color-vs-color';
    }
    addBucket(result, 'conflicted', bucketEntry('conflicted', subjectId, remoteRow || localRow || baseRow, {
      proposalEligible: false,
      changedFields: fields,
      reason: reason
    }));
    result.conflicts.push(makeConflict(subjectId, reason, localRow, remoteRow, baseRow, fields, hard));
  }

  function compareFolders(localMap, remoteMap, baseMap, result) {
    var keys = allKeys(localMap, remoteMap, baseMap);
    for (var i = 0; i < keys.length; i += 1) {
      var subjectId = keys[i];
      if (result.mode === '3-way') {
        classifyThreeWay(subjectId, localMap[subjectId], remoteMap[subjectId], baseMap[subjectId], result);
      } else {
        classifyTwoWay(subjectId, localMap[subjectId], remoteMap[subjectId], result);
      }
    }
  }

  function compareBindings(localBindings, remoteBindings, baseBindings, result) {
    var keys = allKeys(localBindings, remoteBindings, baseBindings);
    for (var i = 0; i < keys.length; i += 1) {
      var subjectId = keys[i];
      var localRow = localBindings[subjectId];
      var remoteRow = remoteBindings[subjectId];
      var baseRow = baseBindings[subjectId];
      if (localRow && !remoteRow) result.counts.bindingRemoved += 1;
      if (remoteRow && !localRow) result.counts.bindingAdded += 1;
      if (result.mode === '3-way' && baseRow) {
        if (localRow && remoteRow && localRow.revisionHash !== remoteRow.revisionHash) {
          addCode(result.blockers, 'orphan-binding');
        }
      }
    }
  }

  function checkOrphanBindings(snapshot, folderMap, result, label) {
    var bindings = bindingObjects(snapshot);
    for (var i = 0; i < bindings.length; i += 1) {
      var binding = bindings[i];
      var folderSubjectId = cleanString(binding.folderSubjectId);
      if (folderSubjectId && !folderMap[folderSubjectId]) {
        addCode(result.blockers, 'orphan-binding');
        addCode(result.warnings, label + '-orphan-binding');
      }
    }
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrHit = foreverNoKey(value[i]);
        if (arrHit) return arrHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (FOREVER_NO_FIELDS.indexOf(key) !== -1) return key;
      if (/Token$/.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }

  function sortResult(result) {
    ['added', 'changed', 'deleted', 'unchanged', 'conflicted'].forEach(function (bucket) {
      result.buckets[bucket].sort(function (a, b) {
        return String(a.subjectId).localeCompare(String(b.subjectId));
      });
    });
    result.conflicts.sort(function (a, b) {
      return String(a.subjectId).localeCompare(String(b.subjectId));
    });
  }

  function failInvalidInput(result, input) {
    if (!validSnapshot(input.local)) addCode(result.blockers, 'local-canonical-snapshot-invalid');
    if (!validSnapshot(input.remote)) addCode(result.blockers, 'remote-canonical-snapshot-invalid');
    if (input.base != null && !validSnapshot(input.base)) addCode(result.blockers, 'baseline-hash-not-verified');
    result.ok = false;
    return result;
  }

  function diffFolderSnapshots(input) {
    var args = safeObject(input);
    var basePresent = validSnapshot(args.base);
    var result = baseResult(normalizeOptions(args), basePresent);
    if (!validSnapshot(args.local) || !validSnapshot(args.remote) || (args.base != null && !validSnapshot(args.base))) {
      return failInvalidInput(result, args);
    }

    result.snapshots.localCount = folderObjects(args.local).length;
    result.snapshots.remoteCount = folderObjects(args.remote).length;
    result.snapshots.baseCount = basePresent ? folderObjects(args.base).length : 0;
    result.snapshots.basePresent = basePresent;

    var localFolders = buildFolderMap(args.local, 'local', result);
    var remoteFolders = buildFolderMap(args.remote, 'remote', result);
    var baseFolders = basePresent ? buildFolderMap(args.base, 'base', result) : Object.create(null);
    var localBindings = buildBindingMap(args.local, result);
    var remoteBindings = buildBindingMap(args.remote, result);
    var baseBindings = basePresent ? buildBindingMap(args.base, result) : Object.create(null);

    checkOrphanBindings(args.local, localFolders, result, 'local');
    checkOrphanBindings(args.remote, remoteFolders, result, 'remote');
    if (basePresent) checkOrphanBindings(args.base, baseFolders, result, 'base');

    compareFolders(localFolders, remoteFolders, baseFolders, result);
    compareBindings(localBindings, remoteBindings, baseBindings, result);
    sortResult(result);

    result.ok = result.blockers.length === 0;
    var forbiddenKey = foreverNoKey(result);
    if (forbiddenKey) {
      addCode(result.blockers, 'payload-contains-forever-no-field');
      result.ok = false;
      result.buckets = { added: [], changed: [], deleted: [], unchanged: [], conflicted: [] };
      result.conflicts = [];
      result.counts = emptyCounts();
    }
    return result;
  }

  H2O.Studio.diagnostics.diffFolderSnapshots = diffFolderSnapshots;
  H2O.Studio.diagnostics.__folderSyncDiffInstalled = true;
  H2O.Studio.diagnostics.__folderSyncDiffVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
