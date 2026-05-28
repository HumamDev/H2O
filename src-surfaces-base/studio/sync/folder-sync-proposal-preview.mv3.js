/* H2O Studio Sync - F10.6.3 folder proposal-preview envelopes
 *
 * Chrome Studio diagnostic only. Operator-triggered. No automatic run.
 *
 * Generates F10.2 preview envelopes from proposalEligible F10.6.2 folder
 * diff entries. This is still preview-only: kind="preview", dryRun=true.
 *
 * Safety invariants:
 *   - No proposal envelope emission.
 *   - No conflictCandidate envelope emission.
 *   - No applyEvent, apply, remote apply, WebDAV, or write-back.
 *   - No storage writes. No fetch. No chrome.runtime.sendMessage.
 *   - No timers or polling.
 *   - folderBinding entries refuse generation in v1.
 *   - Conflicted/report-only entries refuse generation.
 *   - Raw folder names and raw chat IDs are never emitted.
 *   - No runtime import of @h2o/cross-platform-envelope.
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
  if (detectTauri()) return;

  function detectChromeExtension() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }
  if (!detectChromeExtension()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.diagnostics = H2O.Studio.diagnostics || {};
  if (H2O.Studio.diagnostics.__folderSyncProposalPreviewInstalled) return;

  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var DIFF_SCHEMA = 'h2o.studio.sync.folder-diff.v1';
  var PREDICATE_VERSION = 'h2o.folder-sync.predicate.v1';
  var BRIDGE_VERSION_TAG = 'h2o.platform.capabilities.v1#f10.6.3-folder-proposal-preview-v1';
  var VERSION = '0.1.0-f10.6.3';
  var PEER_IDENTITY_KEY = 'h2o:sync:peer-identity:v1';
  var PEER_IDENTITY_SCHEMA = 'h2o.studio.peer-identity.v1';
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

  function isSha256Hex(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i += 1) {
      out[keys[i]] = canonicalize(value[keys[i]]);
    }
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : String(value == null ? '' : value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function generateUuid() {
    var bytes;
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      bytes = new Uint8Array(16);
      global.crypto.getRandomValues(bytes);
    } else {
      bytes = new Uint8Array(16);
      for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
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

  function chromeLocalRef() {
    try {
      var s = global.chrome && global.chrome.storage && global.chrome.storage.local;
      if (s && typeof s.get === 'function') return s;
    } catch (_) { /* ignore */ }
    return null;
  }

  function getChromeStorageKey(key) {
    return new Promise(function (resolve) {
      var s = chromeLocalRef();
      if (!s) { resolve(null); return; }
      var settled = false;
      function finish(value) {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      }
      try {
        s.get(key, function (items) {
          try {
            var rt = global.chrome && global.chrome.runtime;
            if (rt && rt.lastError) { finish(null); return; }
            finish(items && Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null);
          } catch (_) { finish(null); }
        });
      } catch (_) { finish(null); }
    });
  }

  function isUsablePeerIdentity(identity) {
    return !!(
      identity &&
      typeof identity === 'object' &&
      !Array.isArray(identity) &&
      identity.schema === PEER_IDENTITY_SCHEMA &&
      typeof identity.physicalDeviceId === 'string' &&
      identity.physicalDeviceId &&
      typeof identity.installId === 'string' &&
      identity.installId &&
      typeof identity.syncPeerId === 'string' &&
      identity.syncPeerId
    );
  }

  async function readStoredPeerIdentity() {
    var identity = await getChromeStorageKey(PEER_IDENTITY_KEY);
    return isUsablePeerIdentity(identity) ? identity : null;
  }

  async function hashPeerIdentity(identity) {
    return {
      physicalDeviceIdHash: await sha256Hex(identity.physicalDeviceId),
      installIdHash: await sha256Hex(identity.installId),
      syncPeerIdHash: await sha256Hex(identity.syncPeerId),
      surfaceKind: 'browser-studio'
    };
  }

  async function buildExtensionContextPeerEnvelope(warnings) {
    var runtimeId = '';
    try { runtimeId = String(global.chrome && global.chrome.runtime && global.chrome.runtime.id || ''); }
    catch (_) { runtimeId = ''; }
    if (!runtimeId) {
      addCode(warnings, 'source-peer-extension-context-unavailable');
      return {
        physicalDeviceIdHash: '',
        installIdHash: '',
        syncPeerIdHash: '',
        surfaceKind: 'browser-studio'
      };
    }
    addCode(warnings, 'source-peer-identity-derived-from-extension-context');
    return {
      physicalDeviceIdHash: await sha256Hex('h2o.chrome-studio.peer.v1:physical-device:' + runtimeId),
      installIdHash: await sha256Hex('h2o.chrome-studio.peer.v1:install:' + runtimeId),
      syncPeerIdHash: await sha256Hex('studio-chrome:mv3-chrome:idb-archive:' + runtimeId),
      surfaceKind: 'browser-studio'
    };
  }

  async function buildSourcePeerEnvelope(warnings) {
    var identity = null;
    try {
      var idApi = H2O.Studio && H2O.Studio.identity;
      if (idApi && typeof idApi.whenReady === 'function') {
        identity = await idApi.whenReady();
      } else if (idApi && typeof idApi.get === 'function') {
        identity = idApi.get();
      }
    } catch (_) {
      identity = null;
    }
    if (!isUsablePeerIdentity(identity)) {
      identity = await readStoredPeerIdentity();
    }
    if (isUsablePeerIdentity(identity)) {
      return hashPeerIdentity(identity);
    }
    return buildExtensionContextPeerEnvelope(warnings);
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

  function failedPreview(blockers, warnings, options) {
    return {
      schema: ENVELOPE_SCHEMA,
      kind: 'preview',
      dryRun: true,
      redacted: true,
      redactionClass: options.redactionClass,
      blockers: asArray(blockers).slice(),
      warnings: asArray(warnings).slice()
    };
  }

  function validDiff(diff) {
    return isObject(diff)
      && diff.schema === 'h2o.studio.sync.folder-diff.v1'
      && isObject(diff.buckets)
      && isObject(diff.counts);
  }

  function findBucketName(diff, entry) {
    var buckets = safeObject(diff && diff.buckets);
    var subjectId = cleanString(entry && entry.subjectId);
    var names = ['added', 'changed', 'deleted', 'unchanged', 'conflicted'];
    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      var rows = asArray(buckets[name]);
      for (var r = 0; r < rows.length; r += 1) {
        var row = rows[r];
        if (row === entry) return name;
        if (subjectId && cleanString(row && row.subjectId) === subjectId && cleanString(row && row.kind) === cleanString(entry && entry.kind)) {
          return name;
        }
      }
    }
    return '';
  }

  function operationForBucket(bucket) {
    if (bucket === 'added') {
      return { operation: 'folder-metadata-create-preview', intent: 'create' };
    }
    if (bucket === 'deleted') {
      return { operation: 'folder-metadata-delete-preview', intent: 'delete' };
    }
    return { operation: 'folder-metadata-update-preview', intent: 'update' };
  }

  function validateEntry(diff, entry, blockers) {
    if (!validDiff(diff)) addCode(blockers, 'envelope-schema-too-new');
    if (!isObject(entry)) addCode(blockers, 'envelope-schema-too-new');
    if (cleanString(entry && entry.subjectType) === 'folderBinding' || cleanString(entry && entry.objectType) === 'folderBinding') {
      addCode(blockers, 'folder-binding-preview-only');
    }
    var diffBlockers = asArray(diff && diff.blockers).map(cleanString).filter(Boolean);
    if (diffBlockers.indexOf('orphan-parent') !== -1) addCode(blockers, 'orphan-parent');
    if (diffBlockers.indexOf('duplicate-folder-name') !== -1) addCode(blockers, 'duplicate-folder-name');
    if (diffBlockers.indexOf('baseline-hash-not-verified') !== -1) addCode(blockers, 'baseline-hash-not-verified');
    if (diffBlockers.indexOf('f5-blocker-present') !== -1) addCode(blockers, 'f5-blocker-present');
    if (diffBlockers.indexOf('f6-blocker-present') !== -1) addCode(blockers, 'f6-blocker-present');

    var bucket = findBucketName(diff, entry);
    if (bucket === 'conflicted') addCode(blockers, 'conflicted-entry-refused');
    if (bucket === 'unchanged') addCode(blockers, 'report-only-entry-refused');
    if (bucket !== 'added' && bucket !== 'changed' && bucket !== 'deleted') addCode(blockers, 'entry-not-proposal-eligible');
    if (!entry || entry.proposalEligible !== true) addCode(blockers, 'entry-not-proposal-eligible');
    var reason = cleanString(entry && entry.reason);
    if (reason === 'delete-vs-update') addCode(blockers, 'f5-blocker-present');
    if (reason === 'orphan-parent') addCode(blockers, 'orphan-parent');
    if (reason === 'duplicate-folder-name') addCode(blockers, 'duplicate-folder-name');
    if (reason === 'baseline-hash-not-verified') addCode(blockers, 'baseline-hash-not-verified');
    return bucket;
  }

  function expectedPostState(entry, changedFieldsHash) {
    return {
      subjectType: 'folder.metadata',
      subjectId: cleanString(entry.subjectId),
      revisionHash: cleanString(entry.revisionHash) || null,
      nameHash: cleanString(entry.nameHash) || null,
      changedFieldsHash: changedFieldsHash
    };
  }

  async function previewFolderSyncProposal(input) {
    var args = safeObject(input);
    var options = normalizeOptions(args);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) {
      addCode(blockers, 'envelope-schema-too-new');
      return failedPreview(blockers, warnings, options);
    }

    var diff = safeObject(args.diff);
    var entry = safeObject(args.entry);
    var bucket = validateEntry(diff, entry, blockers);
    if (blockers.length) {
      return failedPreview(blockers, warnings, options);
    }

    var changedFields = asArray(entry.changedFields)
      .map(cleanString)
      .filter(Boolean)
      .sort();
    var op = operationForBucket(bucket);
    var createdAt = nowIsoSeconds();
    var capabilitySnapshotHash = await sha256Hex(BRIDGE_VERSION_TAG);
    var entryHash = await sha256Hex(canonicalJson(entry));
    var diffHash = await sha256Hex(canonicalJson({
      schema: diff.schema,
      mode: diff.mode,
      predicateVersion: diff.predicateVersion,
      counts: diff.counts,
      subjectId: entry.subjectId,
      bucket: bucket
    }));
    var changedFieldsHash = await sha256Hex(canonicalJson(changedFields));
    var postState = expectedPostState(entry, changedFieldsHash);
    var payload = {
      predicateVersion: PREDICATE_VERSION,
      proposalPreview: {
        proposalEligible: true,
        baseHash: cleanString(entry.baseHash) || null,
        expectedPostState: postState,
        changedFields: changedFields,
        operationIntent: op.intent,
        justificationHashes: [diffHash, entryHash],
        predicateVersion: PREDICATE_VERSION,
        previewSource: 'folder-sync-diff.v1'
      }
    };

    var forbiddenPayloadKey = foreverNoKey(payload);
    if (forbiddenPayloadKey) {
      addCode(blockers, 'payload-contains-forever-no-field');
      return failedPreview(blockers, warnings, options);
    }

    var sourcePeerEnvelope = await buildSourcePeerEnvelope(warnings);
    var dedupeKey = await sha256Hex(canonicalJson({
      schema: ENVELOPE_SCHEMA,
      purpose: 'dedupeKey',
      platformId: 'chrome-studio',
      kind: 'preview',
      subjectType: 'folder.metadata',
      subjectId: cleanString(entry.subjectId),
      operation: op.operation,
      revisionHash: cleanString(entry.revisionHash),
      bucket: bucket,
      changedFields: changedFields
    }));
    var payloadHash = await sha256Hex(canonicalJson(payload));

    var envelopeBase = {
      schema: 'h2o.crossPlatform.envelope.v1',
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'preview',
      id: generateUuid(),
      lineageId: generateUuid(),
      createdAt: createdAt,
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'chrome-studio',
        surfaceKind: 'browser-studio',
        sourcePeerEnvelope: sourcePeerEnvelope
      },
      declaredAuthority: 'preview-coordinator',
      effectiveAuthority: 'preview-coordinator',
      capabilityUsed: 'preview',
      capabilitySnapshotHash: capabilitySnapshotHash,
      subjectType: 'folder.metadata',
      subjectId: cleanString(entry.subjectId),
      operation: op.operation,
      redactionClass: options.redactionClass,
      dryRun: true,
      transactional: true,
      dedupeKey: dedupeKey,
      payloadHash: payloadHash,
      payload: payload
    };
    var eventDigest = await sha256Hex(JSON.stringify(canonicalize(envelopeBase)));
    var envelope = Object.assign({}, envelopeBase, {
      eventDigest: eventDigest,
      warnings: warnings.slice(),
      blockers: blockers.slice()
    });

    if (!isSha256Hex(envelope.capabilitySnapshotHash)) addCode(envelope.blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(envelope.dedupeKey)) addCode(envelope.blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(envelope.payloadHash)) addCode(envelope.blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(envelope.eventDigest)) addCode(envelope.blockers, 'envelope-schema-too-new');
    var peer = envelope.sourcePlatform.sourcePeerEnvelope;
    if (!isSha256Hex(peer.physicalDeviceIdHash)) addCode(envelope.blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(peer.installIdHash)) addCode(envelope.blockers, 'envelope-schema-too-new');
    if (!isSha256Hex(peer.syncPeerIdHash)) addCode(envelope.blockers, 'envelope-schema-too-new');

    var forbiddenEnvelopeKey = foreverNoKey(envelope);
    if (forbiddenEnvelopeKey) {
      addCode(envelope.blockers, 'payload-contains-forever-no-field');
    }
    if (envelope.blockers.length) envelope.effectiveAuthority = 'rejected';
    return envelope;
  }

  H2O.Studio.diagnostics.previewFolderSyncProposal = previewFolderSyncProposal;
  H2O.Studio.diagnostics.__folderSyncProposalPreviewInstalled = true;
  H2O.Studio.diagnostics.__folderSyncProposalPreviewVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
