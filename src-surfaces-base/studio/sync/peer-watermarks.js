/* H2O Studio Sync - Peer Watermark Diagnostics (F5H.5-b)
 *
 * Read-only diagnostics only. Aggregates existing peer/export/import/
 * tombstone-review evidence and reports why destructive lifecycle actions
 * remain blocked until a durable watermark table exists.
 *
 * No schema changes, no storage writes, no cleanup, no purge, no compaction,
 * no sync apply.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  if (H2O.Studio.sync.peerWatermarks && H2O.Studio.sync.peerWatermarks.__installed) return;

  var DIAGNOSTIC_SCHEMA = 'h2o.studio.sync.peer-watermark-diagnostic.v1';
  var MODULE_VERSION = '0.1.0-f5h.5-b';
  var BLOCKER_CODES = Object.freeze([
    'peer-watermark-table-not-implemented',
    'active-peer-waterline-unknown',
    'source-stream-waterline-unknown',
    'retention-hold-model-not-implemented',
    'destructive-compaction-blocked',
    'real-user-purge-blocked',
  ]);
  var MISSING_WATERMARK_CLASSES = Object.freeze([
    'export-watermark',
    'tombstone-watermark',
    'review-watermark',
    'maintenance-watermark',
  ]);

  var state = {
    installedAt: Date.now(),
    lastDiagnosticAt: '',
    lastSummary: null,
    lastError: '',
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return String(Date.now()); }
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function safeObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function numberOrNull(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function numberOrZero(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function detectSurface() {
    try {
      if (global.__TAURI_INTERNALS__ || global.__TAURI__) return 'desktop-tauri';
    } catch (_) { /* ignore */ }
    try {
      if (global.chrome && global.chrome.runtime && global.chrome.runtime.id) return 'chrome-mv3';
    } catch (_) { /* ignore */ }
    return 'studio-web';
  }

  function redactPeerId(peerId) {
    var value = cleanString(peerId);
    if (!value) return '';
    var parts = value.split(':');
    if (parts.length >= 4) return parts.slice(0, 3).join(':') + ':<redacted>';
    return '<redacted>';
  }

  function fallbackHash(text) {
    var h = 2166136261;
    var s = String(text || '');
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  async function fingerprint(value) {
    var text;
    try { text = JSON.stringify(value); }
    catch (_) { text = String(value == null ? '' : value); }
    try {
      if (global.crypto && global.crypto.subtle && typeof TextEncoder !== 'undefined') {
        var bytes = new TextEncoder().encode(text);
        var digest = await global.crypto.subtle.digest('SHA-256', bytes);
        var hex = Array.prototype.map.call(new Uint8Array(digest), function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
        return 'sha256:' + hex.slice(0, 16);
      }
    } catch (_) { /* fallback */ }
    return 'hash:' + fallbackHash(text);
  }

  function pushUnique(list, value) {
    var v = cleanString(value);
    if (!v || list.indexOf(v) >= 0) return;
    list.push(v);
  }

  function bumpCounter(map, key, amount) {
    var k = cleanString(key) || 'unknown';
    map[k] = numberOrZero(map[k]) + (amount == null ? 1 : numberOrZero(amount));
  }

  function minNumber(current, value) {
    var n = numberOrNull(value);
    if (n == null) return current;
    if (current == null || n < current) return n;
    return current;
  }

  function maxNumber(current, value) {
    var n = numberOrNull(value);
    if (n == null) return current;
    if (current == null || n > current) return n;
    return current;
  }

  function getStores() {
    return safeObject(H2O.Studio && H2O.Studio.store);
  }

  async function callMaybe(obj, names, arg) {
    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      if (obj && typeof obj[name] === 'function') {
        try { return { ok: true, method: name, value: await obj[name](arg) }; }
        catch (e) { return { ok: false, method: name, error: String((e && e.message) || e) }; }
      }
    }
    return { ok: false, method: null, error: 'method-unavailable' };
  }

  function readField(row, camel, snake) {
    if (!row || typeof row !== 'object') return '';
    if (row[camel] != null) return row[camel];
    if (snake && row[snake] != null) return row[snake];
    return '';
  }

  function makeAccumulator(includeIds) {
    return {
      includeIds: includeIds,
      peersByKey: Object.create(null),
      streamsByKey: Object.create(null),
      warnings: [],
      lifecycle: {
        available: false,
        source: '',
        tombstones: null,
        reviews: null,
        watermarks: null,
      },
    };
  }

  async function peerKeyFor(peerId, fallbackKey) {
    var id = cleanString(peerId);
    if (id) return await fingerprint(['peer', id]);
    var fallback = cleanString(fallbackKey);
    return fallback || 'unknown-peer';
  }

  async function addPeer(acc, peerId, classification, evidenceKind, detail) {
    var key = await peerKeyFor(peerId, detail && detail.peerKey);
    var peer = acc.peersByKey[key];
    if (!peer) {
      peer = {
        peerKey: key,
        redactedPeerId: peerId ? redactPeerId(peerId) : '',
        classifications: [],
        evidenceKinds: [],
        evidenceCount: 0,
        sources: [],
        minSequence: null,
        maxSequence: null,
        lastSeenAt: '',
        warnings: [],
      };
      if (acc.includeIds && peerId) peer.peerId = cleanString(peerId);
      acc.peersByKey[key] = peer;
    }
    pushUnique(peer.classifications, classification);
    pushUnique(peer.evidenceKinds, evidenceKind);
    peer.evidenceCount += 1;
    var d = safeObject(detail);
    if (d.source) pushUnique(peer.sources, d.source);
    peer.minSequence = minNumber(peer.minSequence, d.sequence);
    peer.maxSequence = maxNumber(peer.maxSequence, d.sequence);
    if (d.seenAt && (!peer.lastSeenAt || cleanString(d.seenAt) > peer.lastSeenAt)) {
      peer.lastSeenAt = cleanString(d.seenAt);
    }
    asArray(d.warnings).forEach(function (warning) { pushUnique(peer.warnings, warning); });
    return peer;
  }

  async function addSourceStream(acc, sourcePeerId, streamKind, evidenceKind, detail) {
    var peerKey = await peerKeyFor(sourcePeerId, detail && detail.peerKey);
    var d = safeObject(detail);
    var key = [
      peerKey,
      cleanString(streamKind) || 'unknown',
      cleanString(d.exportId || d.lastSeenExportId || d.checksum || ''),
    ].join('\u0000');
    var stream = acc.streamsByKey[key];
    if (!stream) {
      stream = {
        sourcePeerKey: peerKey,
        streamKind: cleanString(streamKind) || 'unknown',
        evidenceKinds: [],
        sequenceMin: null,
        sequenceMax: null,
        exportFingerprint: d.exportId ? await fingerprint(['export', d.exportId]) : '',
        checksumFingerprint: d.checksum ? await fingerprint(['checksum', d.checksum]) : '',
        lastSeenExportFingerprint: d.lastSeenExportId ? await fingerprint(['export', d.lastSeenExportId]) : '',
        seenCount: 0,
        firstSeenAt: cleanString(d.seenAt || ''),
        lastSeenAt: cleanString(d.seenAt || ''),
        warnings: [],
      };
      if (acc.includeIds) {
        if (sourcePeerId) stream.sourcePeerId = cleanString(sourcePeerId);
        if (d.exportId) stream.exportId = cleanString(d.exportId);
        if (d.lastSeenExportId) stream.lastSeenExportId = cleanString(d.lastSeenExportId);
      }
      acc.streamsByKey[key] = stream;
    }
    pushUnique(stream.evidenceKinds, evidenceKind);
    stream.sequenceMin = minNumber(stream.sequenceMin, d.sequence);
    stream.sequenceMax = maxNumber(stream.sequenceMax, d.sequence);
    stream.seenCount += Math.max(1, numberOrZero(d.seenCount) || 1);
    if (d.seenAt) {
      var seenAt = cleanString(d.seenAt);
      if (!stream.firstSeenAt || seenAt < stream.firstSeenAt) stream.firstSeenAt = seenAt;
      if (!stream.lastSeenAt || seenAt > stream.lastSeenAt) stream.lastSeenAt = seenAt;
    }
    asArray(d.warnings).forEach(function (warning) { pushUnique(stream.warnings, warning); });
  }

  async function collectIdentity(acc) {
    var api = H2O.Studio && H2O.Studio.identity;
    if (!api) {
      acc.warnings.push({ code: 'identity-api-unavailable' });
      return;
    }
    var identity = null;
    try {
      if (typeof api.get === 'function') identity = api.get();
      if (!identity && typeof api.whenReady === 'function') identity = await api.whenReady();
    } catch (e) {
      acc.warnings.push({ code: 'identity-read-failed', detail: String((e && e.message) || e) });
    }
    var diagnose = null;
    try {
      if (typeof api.diagnose === 'function') diagnose = api.diagnose();
    } catch (_) { diagnose = null; }
    var peerId = cleanString(identity && identity.syncPeerId);
    if (peerId) {
      await addPeer(acc, peerId, 'local-peer', 'identity', {
        source: 'h2o:sync:peer-identity:v1',
      });
    } else if (diagnose && diagnose.installed) {
      await addPeer(acc, '', 'unknown-peer', 'identity-diagnostic', {
        source: 'h2o:sync:peer-identity:v1',
        warnings: ['identity-redacted-or-unavailable'],
      });
    } else {
      acc.warnings.push({ code: 'identity-unavailable' });
    }
  }

  async function collectExportLog(acc) {
    var api = H2O.Studio && H2O.Studio.exportLog;
    if (!api || typeof api.read !== 'function') {
      acc.warnings.push({ code: 'export-log-api-unavailable' });
      return;
    }
    try {
      var log = await api.read();
      if (!log) {
        acc.warnings.push({ code: 'export-log-empty-or-invalid' });
        return;
      }
      var peerId = cleanString(log.syncPeerId);
      await addPeer(acc, peerId, 'exporting-peer', 'export-log', {
        source: 'h2o:sync:export-log:v1',
        sequence: log.sequenceNumber,
        seenAt: log.lastExportedAt,
      });
      await addSourceStream(acc, peerId, 'export', 'export-log', {
        exportId: log.lastExportId,
        sequence: log.sequenceNumber,
        seenAt: log.lastExportedAt,
      });
      asArray(log.exportHistory).forEach(function (event) {
        // Handled asynchronously below so source stream fingerprints stay stable.
      });
      var history = asArray(log.exportHistory);
      for (var i = 0; i < history.length; i += 1) {
        await addSourceStream(acc, peerId, 'export', 'export-history', {
          exportId: history[i] && history[i].exportId,
          sequence: history[i] && history[i].sequenceNumber,
          seenAt: history[i] && history[i].exportedAt,
        });
      }
    } catch (e) {
      acc.warnings.push({ code: 'export-log-read-failed', detail: String((e && e.message) || e) });
    }
  }

  async function collectPeerDiscovery(acc, includeIds) {
    var api = H2O.Studio && H2O.Studio.peerDiscovery;
    if (!api || typeof api.scan !== 'function') {
      acc.warnings.push({ code: 'peer-discovery-api-unavailable' });
      return;
    }
    try {
      var report = await api.scan({ verifyLatest: false, includeSensitive: includeIds });
      asArray(report && report.peers).forEach(function () {
        // Collected by index loop below to allow async fingerprinting.
      });
      var peers = asArray(report && report.peers);
      for (var i = 0; i < peers.length; i += 1) {
        var peer = peers[i] || {};
        var rawPeerId = includeIds ? cleanString(peer.syncPeerId) : '';
        await addPeer(acc, rawPeerId, 'discovered-peer', 'peer-discovery', {
          peerKey: cleanString(peer.peerKey),
          source: 'devices-state',
          sequence: peer.sequenceNumber,
          seenAt: peer.lastExportedAt,
          warnings: asArray(peer.warnings).map(function (w) { return cleanString(w && w.code); }).filter(Boolean),
        });
        await addSourceStream(acc, rawPeerId, 'export', 'peer-discovery', {
          peerKey: cleanString(peer.peerKey),
          exportId: peer.lastExportId,
          checksum: peer.latestSha256 || peer.lastFileSha256,
          sequence: peer.sequenceNumber,
          seenAt: peer.lastExportedAt,
        });
      }
    } catch (e) {
      acc.warnings.push({ code: 'peer-discovery-scan-failed', detail: String((e && e.message) || e) });
    }
  }

  async function collectImportState(acc) {
    var sync = safeObject(H2O.Studio && H2O.Studio.sync);
    var diagnostics = [];
    try {
      if (sync.folder && typeof sync.folder.diagnose === 'function') {
        diagnostics.push(await sync.folder.diagnose());
      }
    } catch (e) {
      acc.warnings.push({ code: 'chrome-folder-import-diagnose-failed', detail: String((e && e.message) || e) });
    }
    try {
      if (typeof sync.diagnose === 'function' && sync.diagnose !== diagnose) {
        diagnostics.push(await sync.diagnose());
      }
    } catch (e) {
      acc.warnings.push({ code: 'desktop-folder-sync-diagnose-failed', detail: String((e && e.message) || e) });
    }
    for (var i = 0; i < diagnostics.length; i += 1) {
      var diag = safeObject(diagnostics[i]);
      var exportId = cleanString(diag.lastAppliedExportId);
      var checksum = cleanString(diag.lastChecksum);
      if (!exportId && !checksum) continue;
      await addPeer(acc, '', 'import-observed-peer', 'import-state', {
        source: cleanString(diag.stateKey || diag.api || 'sync-folder-import-state'),
        seenAt: diag.lastAppliedAt,
        warnings: ['source-peer-id-unavailable-from-import-state'],
      });
      await addSourceStream(acc, '', 'export', 'import-state', {
        exportId: exportId,
        checksum: checksum,
        seenAt: diag.lastAppliedAt,
        warnings: ['source-peer-id-unavailable-from-import-state'],
      });
    }
  }

  async function collectTombstones(acc) {
    var store = getStores().tombstones;
    if (!store) {
      acc.warnings.push({ code: 'tombstone-store-unavailable' });
      return;
    }
    var result = await callMaybe(store, ['listTombstones', 'list', 'getAll']);
    if (!result.ok) {
      acc.warnings.push({ code: 'tombstone-list-unavailable', detail: result.error });
      return;
    }
    var rows = asArray(result.value);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i] || {};
      var peerId = cleanString(readField(row, 'deletedBySyncPeerId', 'deleted_by_sync_peer_id'));
      var exportId = cleanString(readField(row, 'sourceExportId', 'source_export_id'));
      var sequence = readField(row, 'sourceSequenceNumber', 'source_sequence_number');
      var seenAt = cleanString(readField(row, 'deletedAt', 'deleted_at'));
      await addPeer(acc, peerId, peerId ? 'tombstone-source-peer' : 'unknown-peer', 'tombstone-row', {
        source: 'sync_tombstones',
        sequence: sequence,
        seenAt: seenAt,
        warnings: peerId ? [] : ['tombstone-source-peer-missing'],
      });
      await addSourceStream(acc, peerId, 'tombstone', 'tombstone-row', {
        exportId: exportId,
        sequence: sequence,
        seenAt: seenAt,
      });
    }
  }

  async function collectReviews(acc) {
    var store = getStores().tombstoneReviews;
    if (!store) {
      acc.warnings.push({ code: 'tombstone-review-store-unavailable' });
      return;
    }
    var result = await callMaybe(store, ['listReviews', 'list', 'getAll']);
    if (!result.ok) {
      acc.warnings.push({ code: 'tombstone-review-list-unavailable', detail: result.error });
      return;
    }
    var rows = asArray(result.value);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i] || {};
      var peerId = cleanString(readField(row, 'remoteSyncPeerId', 'remote_sync_peer_id'));
      var exportId = cleanString(readField(row, 'remoteExportId', 'remote_export_id'));
      var lastSeenExportId = cleanString(readField(row, 'lastSeenExportId', 'last_seen_export_id'));
      var sequence = readField(row, 'remoteSequenceNumber', 'remote_sequence_number');
      var seenAt = cleanString(readField(row, 'lastSeenAt', 'last_seen_at') || readField(row, 'receivedAt', 'received_at'));
      var seenCount = readField(row, 'seenCount', 'seen_count');
      await addPeer(acc, peerId, peerId ? 'review-remote-peer' : 'unknown-peer', 'tombstone-review-row', {
        source: 'sync_tombstone_reviews',
        sequence: sequence,
        seenAt: seenAt,
        warnings: peerId ? [] : ['review-remote-peer-missing'],
      });
      await addSourceStream(acc, peerId, 'tombstone-review', 'tombstone-review-row', {
        exportId: exportId,
        lastSeenExportId: lastSeenExportId,
        sequence: sequence,
        seenAt: seenAt,
        seenCount: seenCount,
      });
    }
  }

  async function collectLifecycle(acc) {
    var store = getStores().tombstoneReviews;
    if (!store || typeof store.diagnoseLifecycle !== 'function') {
      acc.lifecycle = {
        available: false,
        source: 'tombstoneReviews.diagnoseLifecycle',
        reason: 'lifecycle-diagnostics-unavailable',
      };
      return;
    }
    try {
      var report = await store.diagnoseLifecycle();
      acc.lifecycle = {
        available: true,
        source: 'tombstoneReviews.diagnoseLifecycle',
        schema: cleanString(report && report.schema),
        platform: cleanString(report && report.platform),
        redacted: report ? report.redacted !== false : true,
        tombstones: report && report.tombstones ? {
          supported: report.tombstones.supported !== false,
          total: numberOrZero(report.tombstones.total),
          active: numberOrZero(report.tombstones.active),
          restored: numberOrZero(report.tombstones.restored),
          purgeBlocked: numberOrZero(report.tombstones.purgeBlocked),
          syntheticCandidates: numberOrZero(report.tombstones.syntheticCandidates),
        } : null,
        reviews: report && report.reviews ? {
          supported: report.reviews.supported !== false,
          total: numberOrZero(report.reviews.total),
          pending: numberOrZero(report.reviews.pending),
          acceptedLater: numberOrZero(report.reviews.acceptedLater),
          resolved: numberOrZero(report.reviews.resolved),
          rejected: numberOrZero(report.reviews.rejected),
          ignored: numberOrZero(report.reviews.ignored),
          purgeBlocked: numberOrZero(report.reviews.purgeBlocked),
          syntheticCandidates: numberOrZero(report.reviews.syntheticCandidates),
        } : null,
        watermarks: safeObject(report && report.watermarks),
      };
    } catch (e) {
      acc.lifecycle = {
        available: false,
        source: 'tombstoneReviews.diagnoseLifecycle',
        reason: 'lifecycle-diagnostics-failed',
      };
      acc.warnings.push({ code: 'lifecycle-diagnostics-failed', detail: String((e && e.message) || e) });
    }
  }

  function finalizePeers(acc) {
    var peers = Object.keys(acc.peersByKey).sort().map(function (key) {
      var peer = acc.peersByKey[key];
      peer.classifications.sort();
      peer.evidenceKinds.sort();
      peer.sources.sort();
      peer.warnings.sort();
      return peer;
    });
    var byClassification = {};
    var byEvidenceKind = {};
    peers.forEach(function (peer) {
      peer.classifications.forEach(function (classification) { bumpCounter(byClassification, classification); });
      peer.evidenceKinds.forEach(function (kind) { bumpCounter(byEvidenceKind, kind); });
    });
    return {
      total: peers.length,
      byClassification: byClassification,
      byEvidenceKind: byEvidenceKind,
      peers: peers,
    };
  }

  function finalizeStreams(acc) {
    var streams = Object.keys(acc.streamsByKey).sort().map(function (key) {
      var stream = acc.streamsByKey[key];
      stream.evidenceKinds.sort();
      stream.warnings.sort();
      return stream;
    });
    var byStreamKind = {};
    streams.forEach(function (stream) { bumpCounter(byStreamKind, stream.streamKind); });
    return {
      total: streams.length,
      byStreamKind: byStreamKind,
      streams: streams,
    };
  }

  function makeBlockers() {
    return BLOCKER_CODES.map(function (code) { return { code: code }; });
  }

  async function diagnose(options) {
    var opts = safeObject(options);
    var includeIds = opts.includeIds === true;
    var acc = makeAccumulator(includeIds);
    var generatedAt = nowIso();
    try {
      await collectIdentity(acc);
      await collectExportLog(acc);
      await collectPeerDiscovery(acc, includeIds);
      await collectImportState(acc);
      await collectTombstones(acc);
      await collectReviews(acc);
      await collectLifecycle(acc);
      var knownPeers = finalizePeers(acc);
      var sourceStreams = finalizeStreams(acc);
      var result = {
        schema: DIAGNOSTIC_SCHEMA,
        readOnly: true,
        noMutation: true,
        supported: false,
        reason: 'peer-watermark-table-not-implemented',
        surface: detectSurface(),
        generatedAt: generatedAt,
        redacted: !includeIds,
        knownPeers: knownPeers,
        sourceStreams: sourceStreams,
        watermarkClasses: {
          supported: false,
          present: [],
          missing: MISSING_WATERMARK_CLASSES.slice(),
          deferred: ['folder-state-watermark'],
        },
        blockers: makeBlockers(),
        lifecycle: acc.lifecycle,
        warnings: acc.warnings,
      };
      state.lastDiagnosticAt = generatedAt;
      state.lastSummary = {
        knownPeerCount: knownPeers.total,
        sourceStreamCount: sourceStreams.total,
        warningCount: acc.warnings.length,
      };
      state.lastError = '';
      return result;
    } catch (e) {
      state.lastError = String((e && e.message) || e);
      return {
        schema: DIAGNOSTIC_SCHEMA,
        readOnly: true,
        noMutation: true,
        supported: false,
        reason: 'peer-watermark-diagnostics-failed',
        surface: detectSurface(),
        generatedAt: generatedAt,
        redacted: !includeIds,
        knownPeers: { total: 0, byClassification: {}, byEvidenceKind: {}, peers: [] },
        sourceStreams: { total: 0, byStreamKind: {}, streams: [] },
        watermarkClasses: {
          supported: false,
          present: [],
          missing: MISSING_WATERMARK_CLASSES.slice(),
          deferred: ['folder-state-watermark'],
        },
        blockers: makeBlockers(),
        lifecycle: {
          available: false,
          reason: 'peer-watermark-diagnostics-failed',
        },
        warnings: [{ code: 'peer-watermark-diagnostics-failed', detail: state.lastError }],
      };
    }
  }

  H2O.Studio.sync.peerWatermarks = {
    __installed: true,
    __version: MODULE_VERSION,
    diagnose: diagnose,
    constants: Object.freeze({
      schema: DIAGNOSTIC_SCHEMA,
      blockers: BLOCKER_CODES.slice(),
      missingWatermarkClasses: MISSING_WATERMARK_CLASSES.slice(),
    }),
    state: state,
  };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
