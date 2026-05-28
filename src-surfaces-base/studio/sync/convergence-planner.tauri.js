/* H2O Desktop Sync - F10.8.6c convergence planner
 *
 * Desktop/Tauri-only read-only planner over local canonical snapshot,
 * remote-observed projection, readiness diagnostics, and relay index signals.
 *
 * Safety invariants:
 *   - Planning only. No convergence, apply, proposal generation,
 *     conflictCandidate generation, WebDAV changes, storage mutation, polling,
 *     network, automatic merge, or mobile write-back.
 *   - Missing prerequisites are reported as blockers instead of repaired.
 *   - Output is redacted: hashed subject/peer/revision identifiers only.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__convergencePlannerInstalled) return;

  var SCHEMA = 'h2o.studio.sync.convergence-plan.v1';
  var VERSION = '0.1.0-f10.8.6c';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'path', 'url', 'password', 'apiKey'
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

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function isHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
  }

  function emptyBuckets() {
    return {
      alreadyConverged: [],
      needsPreview: [],
      proposalEligible: [],
      conflicted: [],
      blocked: [],
      stale: [],
      replay: []
    };
  }

  function countsFor(buckets) {
    return {
      alreadyConverged: buckets.alreadyConverged.length,
      needsPreview: buckets.needsPreview.length,
      proposalEligible: buckets.proposalEligible.length,
      conflicted: buckets.conflicted.length,
      blocked: buckets.blocked.length,
      stale: buckets.stale.length,
      replay: buckets.replay.length
    };
  }

  function baseResult(blockers, warnings) {
    var buckets = emptyBuckets();
    return {
      schema: SCHEMA,
      ok: false,
      buckets: buckets,
      counts: countsFor(buckets),
      blockers: codeList(blockers),
      warnings: codeList(warnings)
    };
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

  async function readLocalSnapshot(options, blockers, warnings) {
    var opts = safeObject(options);
    if (isObject(opts.localSnapshot)) return opts.localSnapshot;
    var diagnostics = H2O.Studio && H2O.Studio.diagnostics ? H2O.Studio.diagnostics : {};
    if (typeof diagnostics.canonicalizeFolderSnapshot !== 'function') {
      addCode(blockers, 'canonical-snapshot-unavailable');
      return null;
    }
    try {
      var snapshot = await diagnostics.canonicalizeFolderSnapshot({ redactionClass: 'redacted' });
      codeList(snapshot && snapshot.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(snapshot && snapshot.warnings).forEach(function (code) { addCode(warnings, code); });
      if (!snapshot || snapshot.ok !== true) addCode(blockers, 'canonical-snapshot-not-ready');
      return safeObject(snapshot);
    } catch (_) {
      addCode(blockers, 'canonical-snapshot-read-failed');
      return null;
    }
  }

  async function readRemoteState(options, blockers, warnings) {
    var opts = safeObject(options);
    if (isObject(opts.remoteObservedState)) return opts.remoteObservedState;
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.projectRemoteEnvelopeState !== 'function') {
      addCode(blockers, 'remote-envelope-projector-unavailable');
      return null;
    }
    try {
      var remote = await sync.projectRemoteEnvelopeState();
      codeList(remote && remote.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(remote && remote.warnings).forEach(function (code) { addCode(warnings, code); });
      if (!remote || remote.ok !== true) addCode(blockers, 'remote-observed-state-not-ready');
      return safeObject(remote);
    } catch (_) {
      addCode(blockers, 'remote-observed-state-read-failed');
      return null;
    }
  }

  async function readReadiness(options, blockers, warnings) {
    var opts = safeObject(options);
    if (isObject(opts.readiness)) return opts.readiness;
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.checkConvergenceReadiness !== 'function') {
      addCode(blockers, 'convergence-readiness-unavailable');
      return null;
    }
    try {
      var readiness = await sync.checkConvergenceReadiness();
      codeList(readiness && readiness.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(readiness && readiness.warnings).forEach(function (code) { addCode(warnings, code); });
      return safeObject(readiness);
    } catch (_) {
      addCode(blockers, 'convergence-readiness-read-failed');
      return null;
    }
  }

  async function readRelayIndex(warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayIndex !== 'function') return null;
    try {
      var index = await sync.listRelayIndex();
      codeList(index && index.warnings).forEach(function (code) { addCode(warnings, code); });
      return safeObject(index);
    } catch (_) {
      addCode(warnings, 'relay-index-read-failed');
      return null;
    }
  }

  function localObjectsBySubject(snapshot) {
    var map = {};
    asArray(safeObject(snapshot).objects).forEach(function (object) {
      var subjectId = cleanString(object && object.subjectId).toLowerCase();
      if (!subjectId) return;
      map[subjectId] = safeObject(object);
    });
    return map;
  }

  function signalSet(index, field) {
    var set = {};
    asArray(safeObject(index).entries).forEach(function (entry) {
      var row = safeObject(entry);
      if (row[field] === true && cleanString(row.eventDigest)) set[cleanString(row.eventDigest)] = true;
    });
    return set;
  }

  function readinessBlocksProposal(readiness) {
    var r = safeObject(readiness);
    if (r.ok !== true) return true;
    var ready = safeObject(r.readiness);
    return ready.peerIdentityReady !== true ||
      ready.relayInboxReady !== true ||
      ready.relayIndexReady !== true ||
      ready.replayProtectionAvailable !== true ||
      ready.dedupeProtectionAvailable !== true ||
      ready.conflictWorkflowAvailable !== true ||
      ready.proposalWorkflowAvailable !== true;
  }

  function changedFields(remote) {
    return asArray(remote.changedFields)
      .map(cleanString)
      .filter(Boolean)
      .sort();
  }

  function colorOnlyRemote(remote) {
    var fields = changedFields(remote);
    return fields.length === 1 && fields[0] === 'color';
  }

  function candidate(localObject, remoteObject, reason, extra) {
    var local = safeObject(localObject);
    var remote = safeObject(remoteObject);
    var out = {
      subjectId: cleanString(remote.subjectId || local.subjectId).toLowerCase(),
      sourcePeerId: cleanString(remote.sourcePeerId),
      sourcePlatform: safeObject(remote.sourcePlatform),
      localRevisionHash: cleanString(local.revisionHash),
      remoteRevisionHash: cleanString(remote.revisionHash),
      lineageId: cleanString(remote.lineageId),
      eventDigest: cleanString(remote.eventDigest),
      reason: cleanString(reason)
    };
    var additions = safeObject(extra);
    Object.keys(additions).forEach(function (key) {
      out[key] = additions[key];
    });
    return out;
  }

  function addBlocked(buckets, remoteObject, blockers) {
    buckets.blocked.push(candidate(null, remoteObject, 'readiness-blocked', {
      blockerCodes: codeList(blockers)
    }));
  }

  async function buildConvergencePlan(options) {
    var blockers = [];
    var warnings = [];
    var opts = safeObject(options);
    var localSnapshot = await readLocalSnapshot(opts, blockers, warnings);
    var remoteState = await readRemoteState(opts, blockers, warnings);
    var readiness = await readReadiness(opts, blockers, warnings);
    var relayIndex = await readRelayIndex(warnings);

    var buckets = emptyBuckets();
    var localBySubject = localObjectsBySubject(localSnapshot);
    var remoteObjects = asArray(safeObject(remoteState).objects);
    var staleEvents = signalSet(relayIndex, 'stale');
    var replayEvents = signalSet(relayIndex, 'replayAttempt');
    var readinessBlocked = readinessBlocksProposal(readiness) || blockers.length > 0;

    for (var i = 0; i < remoteObjects.length; i += 1) {
      var remote = safeObject(remoteObjects[i]);
      var subjectId = cleanString(remote.subjectId).toLowerCase();
      if (!subjectId) continue;
      var local = localBySubject[subjectId] || null;
      var eventDigest = cleanString(remote.eventDigest);

      if (eventDigest && replayEvents[eventDigest]) {
        buckets.replay.push(candidate(local, remote, 'duplicate-lineage-or-eventDigest'));
        continue;
      }
      if (eventDigest && staleEvents[eventDigest]) {
        buckets.stale.push(candidate(local, remote, 'stale-watermark-or-base'));
        continue;
      }
      if (!local) {
        buckets.conflicted.push(candidate(null, remote, 'unknown-remote-object'));
        continue;
      }

      var localHash = cleanString(local.revisionHash).toLowerCase();
      var remoteHash = cleanString(remote.revisionHash).toLowerCase();
      if (localHash && remoteHash && localHash === remoteHash) {
        buckets.alreadyConverged.push(candidate(local, remote, 'revision-hash-equal'));
        continue;
      }

      if (!isHash(localHash) || !isHash(remoteHash)) {
        buckets.conflicted.push(candidate(local, remote, 'missing-or-invalid-revision-hash'));
        continue;
      }

      if (readinessBlocked) {
        addBlocked(buckets, remote, blockers);
        continue;
      }

      if (colorOnlyRemote(remote)) {
        buckets.proposalEligible.push(candidate(local, remote, 'safe-color-only-divergence', {
          changedFields: ['color']
        }));
        continue;
      }

      buckets.needsPreview.push(candidate(local, remote, 'remote-differs-preview-required'));
    }

    var result = {
      schema: SCHEMA,
      ok: blockers.length === 0,
      buckets: buckets,
      counts: countsFor(buckets),
      blockers: blockers,
      warnings: warnings
    };
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      result.ok = false;
      addCode(result.blockers, 'convergence-plan-contains-forbidden-field');
      addCode(result.warnings, 'blocked-forbidden-key-' + forbidden);
      result.buckets = emptyBuckets();
      result.counts = countsFor(result.buckets);
    }
    return result;
  }

  H2O.Desktop.Sync.buildConvergencePlan = buildConvergencePlan;
  H2O.Desktop.Sync.__convergencePlannerInstalled = true;
  H2O.Desktop.Sync.__convergencePlannerVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
