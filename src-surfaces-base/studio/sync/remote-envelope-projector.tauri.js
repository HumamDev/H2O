/* H2O Desktop Sync - F10.8.6b remote envelope projector
 *
 * Desktop/Tauri-only read-only projection over accepted relay inbox rows.
 *
 * Safety invariants:
 *   - Projection only. No convergence, apply, proposal generation,
 *     conflictCandidate generation, WebDAV changes, storage mutation, polling,
 *     network, automatic merge, or mobile write-back.
 *   - Reads only the existing relay inbox list API and ignores blocked/expired
 *     rows. Downloaded envelopes remain inert observation data.
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
  if (H2O.Desktop.Sync.__remoteEnvelopeProjectorInstalled) return;

  var SCHEMA = 'h2o.studio.sync.remote-observed-state.v1';
  var VERSION = '0.1.0-f10.8.6b';
  var ACCEPTED_STATUSES = ['pending-review', 'accepted'];
  var ENVELOPE_KINDS = ['evidence', 'preview', 'proposal', 'conflictCandidate', 'applyEvent'];
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

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function isRedactedHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
  }

  function sourcePeerEnvelope(envelope, row) {
    var fromEnvelope = safeObject(safeObject(safeObject(envelope).sourcePlatform).sourcePeerEnvelope);
    if (Object.keys(fromEnvelope).length) return fromEnvelope;
    return safeObject(safeObject(safeObject(row).sourcePlatform).sourcePeerEnvelope);
  }

  function sourcePeerId(envelope, row) {
    var peer = sourcePeerEnvelope(envelope, row);
    var syncPeerIdHash = cleanString(peer.syncPeerIdHash);
    var installIdHash = cleanString(peer.installIdHash);
    var physicalDeviceIdHash = cleanString(peer.physicalDeviceIdHash);
    if (isSha256Hex(syncPeerIdHash)) return syncPeerIdHash;
    if (isSha256Hex(installIdHash)) return installIdHash;
    if (isSha256Hex(physicalDeviceIdHash)) return physicalDeviceIdHash;
    return '';
  }

  function sourcePlatformSummary(envelope, row) {
    var source = safeObject(envelope.sourcePlatform);
    if (!Object.keys(source).length) source = safeObject(row.sourcePlatform);
    return {
      platformId: cleanString(source.platformId),
      surfaceKind: cleanString(source.surfaceKind)
    };
  }

  function parseEnvelope(row, warnings) {
    try {
      var serialized = cleanString(row.serializedEnvelope);
      if (!serialized) {
        addCode(warnings, 'inbox-envelope-missing');
        return null;
      }
      var parsed = JSON.parse(serialized);
      if (!isObject(parsed)) {
        addCode(warnings, 'inbox-envelope-malformed');
        return null;
      }
      return parsed;
    } catch (_) {
      addCode(warnings, 'inbox-envelope-malformed');
      return null;
    }
  }

  function firstHash(values) {
    for (var i = 0; i < values.length; i += 1) {
      var value = cleanString(values[i]);
      if (isRedactedHash(value)) return value.toLowerCase();
    }
    return '';
  }

  function revisionHash(envelope, row) {
    var payload = safeObject(envelope.payload);
    var proposalPreview = safeObject(payload.proposalPreview);
    var expectedPostState = safeObject(proposalPreview.expectedPostState || payload.expectedPostState);
    var postState = safeObject(payload.postState);
    return firstHash([
      envelope.revisionHash,
      payload.revisionHash,
      payload.postStateHash,
      postState.hash,
      expectedPostState.revisionHash,
      expectedPostState.hash,
      payload.observedStateHash,
      payload.evidenceHash,
      envelope.payloadHash,
      row.envelopeDigest,
      envelope.eventDigest,
      row.eventDigest
    ]);
  }

  function observedAtIso(envelope, row) {
    return cleanString(row.receivedAtIso || envelope.observedAtIso || envelope.createdAt);
  }

  function acceptedRow(row) {
    return ACCEPTED_STATUSES.indexOf(cleanString(row.relayStatus)) !== -1;
  }

  function baseCounts() {
    return {
      peers: 0,
      objects: 0,
      evidence: 0,
      preview: 0,
      proposal: 0,
      conflictCandidate: 0,
      applyEvent: 0
    };
  }

  function incrementKind(counts, kind) {
    if (ENVELOPE_KINDS.indexOf(kind) !== -1) counts[kind] += 1;
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

  function addPeer(peersById, object) {
    var peerId = cleanString(object.sourcePeerId);
    if (!peerId) return;
    if (!peersById[peerId]) {
      peersById[peerId] = {
        sourcePeerId: peerId,
        sourcePlatform: object.sourcePlatform,
        objectCount: 0,
        lastObservedAtIso: ''
      };
    }
    peersById[peerId].objectCount += 1;
    if (!peersById[peerId].lastObservedAtIso ||
        Date.parse(object.observedAtIso) > Date.parse(peersById[peerId].lastObservedAtIso)) {
      peersById[peerId].lastObservedAtIso = object.observedAtIso;
    }
  }

  function projectObject(envelope, row, warnings) {
    var subjectId = cleanString(envelope.subjectId || safeObject(envelope.payload).subjectId);
    if (!isSha256Hex(subjectId)) {
      if (subjectId) addCode(warnings, 'subject-id-not-redacted');
      return null;
    }
    var peerId = sourcePeerId(envelope, row);
    if (!peerId) {
      addCode(warnings, 'source-peer-id-missing');
      return null;
    }
    var revision = revisionHash(envelope, row);
    if (!revision) {
      addCode(warnings, 'revision-hash-missing');
      return null;
    }
    return {
      subjectId: subjectId.toLowerCase(),
      sourcePeerId: peerId,
      sourcePlatform: sourcePlatformSummary(envelope, row),
      revisionHash: revision,
      lineageId: cleanString(envelope.lineageId),
      eventDigest: cleanString(envelope.eventDigest || row.eventDigest),
      observedAtIso: observedAtIso(envelope, row),
      observationSource: 'relay-inbox'
    };
  }

  async function projectRemoteEnvelopeState() {
    var blockers = [];
    var warnings = [];
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayInbox !== 'function') {
      addCode(blockers, 'relay-inbox-unavailable');
      return {
        schema: SCHEMA,
        ok: false,
        peers: [],
        objects: [],
        counts: baseCounts(),
        blockers: blockers,
        warnings: warnings
      };
    }

    var inbox;
    try {
      inbox = await sync.listRelayInbox({ includeSerializedEnvelope: true });
    } catch (_) {
      addCode(blockers, 'relay-inbox-read-failed');
      inbox = null;
    }
    if (!inbox || inbox.ok !== true) {
      codeList(inbox && inbox.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(inbox && inbox.warnings).forEach(function (code) { addCode(warnings, code); });
      if (!blockers.length) addCode(blockers, 'relay-inbox-not-ready');
      return {
        schema: SCHEMA,
        ok: false,
        peers: [],
        objects: [],
        counts: baseCounts(),
        blockers: blockers,
        warnings: warnings
      };
    }

    var counts = baseCounts();
    var objects = [];
    var peersById = {};
    var rows = asArray(inbox.rows);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      if (!acceptedRow(row)) continue;
      var envelope = parseEnvelope(row, warnings);
      if (!envelope) continue;
      var kind = cleanString(envelope.kind || row.kind);
      incrementKind(counts, kind);
      var object = projectObject(envelope, row, warnings);
      if (!object) continue;
      objects.push(object);
      addPeer(peersById, object);
    }

    var peers = Object.keys(peersById).sort().map(function (peerId) { return peersById[peerId]; });
    counts.peers = peers.length;
    counts.objects = objects.length;

    var result = {
      schema: SCHEMA,
      ok: blockers.length === 0,
      peers: peers,
      objects: objects,
      counts: counts,
      blockers: blockers,
      warnings: warnings
    };
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      result.ok = false;
      addCode(result.blockers, 'projected-state-contains-forbidden-field');
      addCode(result.warnings, 'blocked-forbidden-key-' + forbidden);
      result.peers = [];
      result.objects = [];
      result.counts = baseCounts();
    }
    return result;
  }

  H2O.Desktop.Sync.projectRemoteEnvelopeState = projectRemoteEnvelopeState;
  H2O.Desktop.Sync.__remoteEnvelopeProjectorInstalled = true;
  H2O.Desktop.Sync.__remoteEnvelopeProjectorVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
