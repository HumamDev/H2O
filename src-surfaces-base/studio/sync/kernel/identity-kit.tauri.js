/* H2O Desktop Sync Kernel - F14.2.3 identity kit primitive
 *
 * Desktop/Tauri L0 primitive only.
 *
 * Safety invariants:
 *   - Pure identity, canonicalization, and digest helpers only.
 *   - No domain policy decisions, storage reads/writes, publication, replay,
 *     watermark, relay, WebDAV, polling, timers, apply, convergence, or mobile
 *     behavior.
 *   - Existing domain lanes are not wired to this module in F14.2.3, so their
 *     output remains unchanged.
 *
 * Public API:
 *   H2O.Desktop.Sync.kernel.canonicalJSON(value)
 *   H2O.Desktop.Sync.kernel.sha256Hex(value)
 *   H2O.Desktop.Sync.kernel.generateSubjectId(input)
 *   H2O.Desktop.Sync.kernel.generateDedupeKey(input)
 *   H2O.Desktop.Sync.kernel.generateLineageId(input?)
 *   H2O.Desktop.Sync.kernel.validateIdentityInput(input)
 *   H2O.Desktop.Sync.kernel.buildIdentityKit(input)
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
  H2O.Desktop.Sync.kernel = H2O.Desktop.Sync.kernel || {};

  var kernel = H2O.Desktop.Sync.kernel;
  if (kernel.__identityKitInstalled) return;

  var VERSION = '0.1.0-f14.2.3';
  var RESULT_SCHEMA = 'h2o.desktop.sync.kernel.identity-kit.v1';
  var SHA256_RE = /^[0-9a-f]{64}$/;
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function isSha256Hex(value) {
    return typeof value === 'string' && SHA256_RE.test(value);
  }

  function isUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var part = bytes[i].toString(16);
      hex += part.length === 1 ? '0' + part : part;
    }
    return hex;
  }

  function webCryptoAvailable() {
    try {
      return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest);
    } catch (_) {
      return false;
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === 'object') {
      var out = {};
      var keys = Object.keys(value).sort();
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
      }
      return out;
    }
    return value;
  }

  function canonicalJSON(value) {
    return JSON.stringify(canonicalize(value));
  }

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJSON(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function generateUuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return global.crypto.randomUUID();
      }
    } catch (_) { /* fall through */ }

    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      global.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' +
      h.slice(8, 12) + '-' +
      h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' +
      h.slice(20, 32);
  }

  function normalizeActorPeer(actorPeer) {
    var peer = safeObject(actorPeer);
    return {
      physicalDeviceIdHash: cleanString(peer.physicalDeviceIdHash),
      installIdHash: cleanString(peer.installIdHash),
      syncPeerIdHash: cleanString(peer.syncPeerIdHash)
    };
  }

  function validateActorPeer(actorPeer) {
    var blockers = [];
    var peer = normalizeActorPeer(actorPeer);
    if (!isSha256Hex(peer.physicalDeviceIdHash)) addCode(blockers, 'identity-actor-peer-invalid');
    if (!isSha256Hex(peer.installIdHash)) addCode(blockers, 'identity-actor-peer-invalid');
    if (!isSha256Hex(peer.syncPeerIdHash)) addCode(blockers, 'identity-actor-peer-invalid');
    return {
      ok: blockers.length === 0,
      peer: peer,
      blockers: blockers
    };
  }

  function hasIdentifiers(input) {
    return Object.prototype.hasOwnProperty.call(input, 'rawIdentifiers') ||
      Object.prototype.hasOwnProperty.call(input, 'rawIdentifier') ||
      Object.prototype.hasOwnProperty.call(input, 'rawId') ||
      Object.prototype.hasOwnProperty.call(input, 'identifier');
  }

  function normalizeIdentifiers(input) {
    if (Object.prototype.hasOwnProperty.call(input, 'rawIdentifiers')) return input.rawIdentifiers;
    if (Object.prototype.hasOwnProperty.call(input, 'rawIdentifier')) return input.rawIdentifier;
    if (Object.prototype.hasOwnProperty.call(input, 'rawId')) return input.rawId;
    return input.identifier;
  }

  function validateIdentityInput(input) {
    var value = safeObject(input);
    var blockers = [];
    var warnings = [];
    var subjectType = cleanString(value.subjectType);
    var operation = cleanString(value.operation);
    var baseHash = cleanString(value.baseHash);
    var actorPeerResult = validateActorPeer(value.actorPeer);

    if (!subjectType) addCode(blockers, 'identity-subject-type-missing');
    if (!hasIdentifiers(value) && !isSha256Hex(cleanString(value.subjectId))) {
      addCode(blockers, 'identity-raw-identifiers-missing');
    }
    if (!operation) addCode(blockers, 'identity-operation-missing');
    if (baseHash && !isSha256Hex(baseHash)) addCode(blockers, 'identity-base-hash-invalid');

    actorPeerResult.blockers.forEach(function (code) { addCode(blockers, code); });

    return {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      subjectType: subjectType,
      operation: operation,
      baseHash: baseHash,
      actorPeer: actorPeerResult.peer,
      warnings: warnings,
      blockers: blockers
    };
  }

  async function generateSubjectId(input) {
    var value = safeObject(input);
    var subjectType = cleanString(value.subjectType);
    var existing = cleanString(value.subjectId);
    var blockers = [];

    if (isSha256Hex(existing)) {
      return {
        schema: RESULT_SCHEMA,
        ok: true,
        subjectId: existing,
        warnings: [],
        blockers: []
      };
    }
    if (!subjectType) addCode(blockers, 'identity-subject-type-missing');
    if (!hasIdentifiers(value)) addCode(blockers, 'identity-raw-identifiers-missing');
    if (blockers.length) {
      return {
        schema: RESULT_SCHEMA,
        ok: false,
        subjectId: '',
        warnings: [],
        blockers: blockers
      };
    }

    var subjectId = await sha256Hex({
      schema: 'h2o.desktop.sync.kernel.subject-id-input.v1',
      subjectType: subjectType,
      rawIdentifiers: normalizeIdentifiers(value)
    });

    return {
      schema: RESULT_SCHEMA,
      ok: isSha256Hex(subjectId),
      subjectId: subjectId,
      warnings: [],
      blockers: isSha256Hex(subjectId) ? [] : ['identity-sha256-unavailable']
    };
  }

  async function generateDedupeKey(input) {
    var value = safeObject(input);
    var blockers = [];
    var subjectId = cleanString(value.subjectId);
    var operation = cleanString(value.operation);
    var baseHash = cleanString(value.baseHash);
    var actorPeerResult = validateActorPeer(value.actorPeer);

    if (!isSha256Hex(subjectId)) addCode(blockers, 'identity-subject-id-invalid');
    if (!operation) addCode(blockers, 'identity-operation-missing');
    if (baseHash && !isSha256Hex(baseHash)) addCode(blockers, 'identity-base-hash-invalid');
    actorPeerResult.blockers.forEach(function (code) { addCode(blockers, code); });

    if (blockers.length) {
      return {
        schema: RESULT_SCHEMA,
        ok: false,
        dedupeKey: '',
        warnings: [],
        blockers: blockers
      };
    }

    var dedupeKey = await sha256Hex({
      schema: 'h2o.desktop.sync.kernel.dedupe-key-input.v1',
      subjectType: cleanString(value.subjectType),
      subjectId: subjectId,
      operation: operation,
      baseHash: baseHash || null,
      actorPeer: actorPeerResult.peer
    });

    return {
      schema: RESULT_SCHEMA,
      ok: isSha256Hex(dedupeKey),
      dedupeKey: dedupeKey,
      warnings: [],
      blockers: isSha256Hex(dedupeKey) ? [] : ['identity-sha256-unavailable']
    };
  }

  async function generateLineageId(input) {
    var value = safeObject(input);
    var deterministic = value.deterministic === true;
    var blockers = [];
    var lineageId = '';

    if (deterministic) {
      var subjectId = cleanString(value.subjectId);
      var operation = cleanString(value.operation);
      if (!isSha256Hex(subjectId)) addCode(blockers, 'identity-subject-id-invalid');
      if (!operation) addCode(blockers, 'identity-operation-missing');
      if (blockers.length) {
        return {
          schema: RESULT_SCHEMA,
          ok: false,
          lineageId: '',
          warnings: [],
          blockers: blockers
        };
      }
      lineageId = await sha256Hex({
        schema: 'h2o.desktop.sync.kernel.lineage-id-input.v1',
        subjectType: cleanString(value.subjectType),
        subjectId: subjectId,
        operation: operation,
        baseHash: cleanString(value.baseHash) || null,
        actorPeer: normalizeActorPeer(value.actorPeer)
      });
    } else {
      lineageId = generateUuid();
    }

    var valid = deterministic ? isSha256Hex(lineageId) : isUuid(lineageId);
    return {
      schema: RESULT_SCHEMA,
      ok: valid,
      lineageId: lineageId,
      warnings: [],
      blockers: valid ? [] : ['identity-lineage-generation-failed']
    };
  }

  async function buildIdentityKit(input) {
    var value = safeObject(input);
    var validation = validateIdentityInput(value);
    var blockers = validation.blockers.slice();
    var warnings = validation.warnings.slice();
    var subjectId = cleanString(value.subjectId);
    var dedupeKey = '';
    var lineageId = cleanString(value.lineageId);

    if (!isSha256Hex(subjectId)) {
      var subjectResult = await generateSubjectId(value);
      subjectId = cleanString(subjectResult.subjectId);
      subjectResult.blockers.forEach(function (code) { addCode(blockers, code); });
      subjectResult.warnings.forEach(function (code) { addCode(warnings, code); });
    }

    if (isSha256Hex(subjectId)) {
      var dedupeResult = await generateDedupeKey(Object.assign({}, value, {
        subjectId: subjectId
      }));
      dedupeKey = cleanString(dedupeResult.dedupeKey);
      dedupeResult.blockers.forEach(function (code) { addCode(blockers, code); });
      dedupeResult.warnings.forEach(function (code) { addCode(warnings, code); });
    }

    if (!lineageId) {
      var lineageResult = await generateLineageId(Object.assign({}, value, {
        subjectId: subjectId
      }));
      lineageId = cleanString(lineageResult.lineageId);
      lineageResult.blockers.forEach(function (code) { addCode(blockers, code); });
      lineageResult.warnings.forEach(function (code) { addCode(warnings, code); });
    }

    return {
      schema: RESULT_SCHEMA,
      ok: blockers.length === 0,
      subjectType: validation.subjectType,
      operation: validation.operation,
      subjectId: subjectId,
      dedupeKey: dedupeKey,
      lineageId: lineageId,
      warnings: warnings,
      blockers: blockers
    };
  }

  kernel.canonicalJSON = canonicalJSON;
  kernel.sha256Hex = sha256Hex;
  kernel.generateSubjectId = generateSubjectId;
  kernel.generateDedupeKey = generateDedupeKey;
  kernel.generateLineageId = generateLineageId;
  kernel.validateIdentityInput = validateIdentityInput;
  kernel.validateActorPeer = validateActorPeer;
  kernel.buildIdentityKit = buildIdentityKit;
  kernel.isSha256Hex = kernel.isSha256Hex || isSha256Hex;
  kernel.__identityKitInstalled = true;
  kernel.__identityKitVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
