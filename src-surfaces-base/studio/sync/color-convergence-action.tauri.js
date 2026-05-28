/* H2O Desktop Sync - F10.8.9b local color convergence action
 *
 * Desktop/Tauri-only operator-approved convergence action for exactly one
 * color-only planner entry.
 *
 * Safety invariants:
 *   - Color only. No rename, create, move, delete, folderBinding changes, batch
 *     operations, automatic merge, remote apply, publication, upload/download,
 *     watermark writes, consumed-ledger writes, or mobile write-back.
 *   - The action first runs F10.8.9a read-only preflight and requires
 *     actionable === true before building a local preview.
 *   - The only domain mutation is delegated to the existing F10.7.1
 *     applyFolderColorPreview() gate.
 *   - applyEvent is generated only after successful local apply. It is returned
 *     as evidence and is not published/enqueued/uploaded here.
 *   - Output is redacted: no raw folder IDs, colors, names, chat IDs, paths,
 *     URLs, tokens, or content.
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
  if (H2O.Desktop.Sync.__colorConvergenceActionInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.color-convergence-action.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.8.9b';
  var APPROVAL_TOKEN = 'I_APPROVE_LOCAL_COLOR_CONVERGENCE';
  var SUBJECT_TYPE = 'folder.metadata';
  var OPERATION = 'folder-metadata-color-apply';
  var PREVIEW_OPERATION = 'folder-metadata-color-convergence-preview';
  var PREDICATE_VERSION = 'h2o.studio.sync.f7-color-apply.v1';
  var CAPABILITY_TAG = 'h2o.platform.capabilities.v1#f10.8.9b-local-color-convergence-v1';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'path', 'url', 'password', 'apiKey',
    'targetColor', 'color', 'iconColor', 'folderColor', 'accentColor'
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
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function isLocalHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function addMinutesIso(minutes) {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
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

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function bytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
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

  async function sha256Hex(value) {
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : String(value == null ? '' : value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function generateUuid() {
    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      global.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
  }

  function fnv1a32Hex(input) {
    var text = String(input || '');
    var hash = 0x811c9dc5;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('00000000' + hash.toString(16)).slice(-8);
  }

  function firstPresent(row, keys) {
    var obj = safeObject(row);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return obj[key];
    }
    return null;
  }

  function firstString(row, keys) {
    return cleanString(firstPresent(row, keys));
  }

  function normalizeNumber(value) {
    if (value == null || value === '') return null;
    var num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeColor(value) {
    var color = cleanString(value);
    return color ? color.toLowerCase() : '';
  }

  function normalizeFolderHash(row) {
    if (!isObject(row)) return '';
    var metaValue = firstPresent(row, ['meta', 'meta_json']);
    var metaPresent = isObject(metaValue)
      ? Object.keys(metaValue).length > 0
      : !!cleanString(metaValue);
    return fnv1a32Hex(canonicalJson({
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: cleanString(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id'])),
      color: firstString(row, ['color', 'iconColor', 'folderColor', 'accentColor']) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null,
      metaPresent: !!metaPresent
    }));
  }

  async function canonicalFolderHash(row) {
    if (!isObject(row)) return '';
    return sha256Hex(canonicalJson({
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: cleanString(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id'])) || null,
      color: normalizeColor(firstString(row, ['iconColor', 'icon_color'])) ||
        normalizeColor(firstString(row, ['color', 'folderColor', 'accentColor'])) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null
    }));
  }

  function entryFromInput(input) {
    var args = safeObject(input);
    return safeObject(args.plannerEntry || args.entry || args.candidate);
  }

  function entrySubject(entry) {
    return cleanString(entry.subjectId).toLowerCase();
  }

  function entryEventDigest(entry) {
    return cleanString(entry.eventDigest).toLowerCase();
  }

  function entryDedupeKey(entry) {
    return cleanString(entry.dedupeKey || entry.eventDigest).toLowerCase();
  }

  function entryLineage(entry) {
    return cleanString(entry.lineageId) || generateUuid();
  }

  function entryBaseHash(entry) {
    return cleanString(entry.localRevisionHash || entry.baseHash).toLowerCase();
  }

  function entryTargetHash(entry) {
    return cleanString(entry.remoteRevisionHash || entry.targetHash || entry.revisionHash).toLowerCase();
  }

  function changedFields(entry) {
    return asArray(entry.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function colorOnly(entry) {
    var fields = changedFields(entry);
    return fields.length === 1 && fields[0] === 'color';
  }

  async function callMaybe(api, methods) {
    for (var i = 0; i < methods.length; i += 1) {
      var name = methods[i];
      if (api && typeof api[name] === 'function') {
        try {
          var value = await Promise.resolve(api[name]());
          if (Array.isArray(value)) return value;
          if (Array.isArray(value && value.folders)) return value.folders;
          if (Array.isArray(value && value.rows)) return value.rows;
        } catch (_) { /* try next */ }
      }
    }
    return [];
  }

  async function readFolderRows(warnings) {
    var rows = [];
    var storeFolders = H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
    rows = await callMaybe(storeFolders, ['list', 'getAll', 'listFolders']);
    if (rows.length) return rows;

    var h2oFolders = H2O.folders || (H2O.Library && H2O.Library.Folders);
    rows = await callMaybe(h2oFolders, ['list', 'getAll', 'listFolders']);
    if (rows.length) return rows;

    try {
      if (h2oFolders && typeof h2oFolders.diagnose === 'function') {
        var diag = safeObject(h2oFolders.diagnose());
        var parity = safeObject(diag.folderParity);
        if (Array.isArray(parity.folders)) return parity.folders;
      }
    } catch (_) {
      addCode(warnings, 'folder-diagnostic-read-failed');
    }
    addCode(warnings, 'folder-row-source-unavailable');
    return [];
  }

  async function resolveSubject(subjectId, warnings) {
    var rows = await readFolderRows(warnings);
    for (var i = 0; i < rows.length; i += 1) {
      var row = safeObject(rows[i]);
      var id = firstString(row, ['id', 'folderId']);
      if (!id) continue;
      var hash = await sha256Hex(SUBJECT_TYPE + ':' + id);
      if (hash === subjectId) return { row: row, folderId: id };
    }
    return { row: null, folderId: '' };
  }

  function nestedColor(value) {
    var obj = safeObject(value);
    return normalizeColor(obj.targetColor || obj.color || obj.iconColor || obj.folderColor || obj.accentColor);
  }

  function targetColorFromEntry(entry) {
    var direct = normalizeColor(entry.targetColor || entry.targetColour || entry.proposedColor ||
      entry.color || entry.iconColor || entry.folderColor || entry.accentColor);
    if (direct) return direct;
    var candidates = [
      entry.deviceLocal,
      entry.desktopLocalApply,
      entry.localApply,
      entry.proposedOperation,
      entry.expectedPostState,
      safeObject(entry.payload).proposedOperation,
      safeObject(entry.payload).expectedPostState,
      safeObject(safeObject(entry.payload).proposalPreview).desktopLocalApply,
      safeObject(safeObject(entry.payload).proposalPreview).localApply,
      safeObject(safeObject(entry.payload).proposalPreview).expectedPostState
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var color = nestedColor(candidates[i]);
      if (color) return color;
    }
    return '';
  }

  async function matchingInboxEnvelope(entry, warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.listRelayInbox !== 'function') return null;
    try {
      var inbox = safeObject(await sync.listRelayInbox({ includeSerializedEnvelope: true }));
      var rows = asArray(inbox.rows);
      var eventDigest = entryEventDigest(entry);
      for (var i = 0; i < rows.length; i += 1) {
        var row = safeObject(rows[i]);
        if (eventDigest && cleanString(row.eventDigest).toLowerCase() !== eventDigest) continue;
        if (!cleanString(row.serializedEnvelope)) continue;
        try {
          var env = JSON.parse(cleanString(row.serializedEnvelope));
          if (isObject(env)) return env;
        } catch (_) {
          addCode(warnings, 'matching-inbox-envelope-malformed');
        }
      }
    } catch (_) {
      addCode(warnings, 'relay-inbox-read-failed');
    }
    return null;
  }

  async function targetColor(entry, warnings) {
    var color = targetColorFromEntry(entry);
    if (color) return color;
    var envelope = await matchingInboxEnvelope(entry, warnings);
    return envelope ? targetColorFromEntry(envelope) : '';
  }

  async function localActorPeer(blockers) {
    var identity = H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      addCode(blockers, 'invalid-peer-identity');
      return null;
    }
    try {
      var value = await Promise.resolve(identity.whenReady());
      if (!isObject(value) || !cleanString(value.physicalDeviceId) ||
          !cleanString(value.installId) || !cleanString(value.syncPeerId)) {
        addCode(blockers, 'invalid-peer-identity');
        return null;
      }
      return {
        physicalDeviceIdHash: await sha256Hex(cleanString(value.physicalDeviceId)),
        installIdHash: await sha256Hex(cleanString(value.installId)),
        syncPeerIdHash: await sha256Hex(cleanString(value.syncPeerId)),
        surfaceKind: 'desktop-tauri'
      };
    } catch (_) {
      addCode(blockers, 'invalid-peer-identity');
      return null;
    }
  }

  function failure(blockers, warnings) {
    return {
      schema: SCHEMA,
      ok: false,
      applied: false,
      applyEvent: null,
      subjectId: null,
      lineageId: null,
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

  async function buildLocalPreviewEnvelope(entry, target, targetColorValue, baseHash, actorPeer, warnings) {
    var subjectId = entrySubject(entry);
    var lineageId = entryLineage(entry);
    var changed = ['color'];
    var changedFieldsHash = await sha256Hex(canonicalJson(changed));
    var payload = {
      predicateVersion: PREDICATE_VERSION,
      proposalPreview: {
        proposalEligible: true,
        baseHash: baseHash,
        expectedPostState: {
          subjectType: SUBJECT_TYPE,
          subjectId: subjectId,
          revisionHash: entryTargetHash(entry),
          changedFieldsHash: changedFieldsHash
        },
        changedFields: changed,
        operationIntent: 'update',
        justificationHashes: [entryEventDigest(entry)].filter(Boolean),
        predicateVersion: PREDICATE_VERSION,
        previewSource: 'convergence-preflight.v1',
        desktopLocalApply: {
          localOnly: true,
          targetFolderId: target.folderId,
          targetColor: targetColorValue
        }
      }
    };
    var payloadHash = await sha256Hex(canonicalJson(payload));
    var dedupeKey = await sha256Hex(canonicalJson({
      schema: ENVELOPE_SCHEMA,
      kind: 'preview',
      purpose: 'f10.8.9b-color-convergence',
      subjectId: subjectId,
      baseHash: baseHash,
      targetHash: entryTargetHash(entry),
      sourceEventDigest: entryEventDigest(entry)
    }));
    var envelope = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'preview',
      id: generateUuid(),
      lineageId: lineageId,
      createdAt: nowIsoSeconds(),
      expiresAt: addMinutesIso(10),
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: actorPeer
      },
      declaredAuthority: 'preview-coordinator',
      effectiveAuthority: 'preview-coordinator',
      capabilityUsed: 'preview',
      capabilitySnapshotHash: await sha256Hex(CAPABILITY_TAG),
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: PREVIEW_OPERATION,
      operationIntent: 'update',
      redactionClass: 'device-local',
      dryRun: true,
      transactional: false,
      dedupeKey: dedupeKey,
      payloadHash: payloadHash,
      payload: payload,
      warnings: codeList(warnings),
      blockers: []
    };
    envelope.eventDigest = await sha256Hex(canonicalJson(envelope));
    return envelope;
  }

  async function applyEventAuditRow(applyResult, subjectId, lineageId) {
    var ledger = safeObject(safeObject(applyResult).audit).ledger;
    if (!isObject(ledger)) return null;
    var transactionId = cleanString(ledger.transactionId);
    var operationId = cleanString(ledger.operationId);
    var auditMaintenanceId = await sha256Hex(canonicalJson({
      schema: SCHEMA,
      purpose: 'auditMaintenanceId',
      operationId: operationId,
      transactionId: transactionId
    }));
    return Object.assign({}, ledger, {
      auditMaintenanceId: auditMaintenanceId,
      operation: OPERATION,
      operationIntent: 'update',
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      proposalLineageId: cleanString(ledger.proposalLineageId) || lineageId,
      lineageId: lineageId,
      result: 'applied',
      resultState: 'applied',
      transactionComplete: true,
      transactionCommitted: true,
      committed: true,
      fieldsUpdated: ['color'],
      changedFields: ['color'],
      predicateVersion: PREDICATE_VERSION,
      warnings: codeList(applyResult.warnings),
      blockers: codeList(applyResult.blockers)
    });
  }

  async function executeColorConvergence(input) {
    var args = safeObject(input);
    var entry = entryFromInput(args);
    var blockers = [];
    var warnings = [];

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }
    if (!colorOnly(entry)) addCode(blockers, 'field-not-allowlisted');
    if (!isSha256Hex(entrySubject(entry))) addCode(blockers, 'subjectId-invalid');
    if (!isLocalHash(entryBaseHash(entry))) addCode(blockers, 'baseHash-unavailable');
    if (!isLocalHash(entryTargetHash(entry))) addCode(blockers, 'targetHash-unavailable');
    if (!entryEventDigest(entry)) addCode(blockers, 'eventDigest-unavailable');

    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.runConvergencePreflight !== 'function') addCode(blockers, 'convergence-preflight-unavailable');
    if (!sync || typeof sync.applyFolderColorPreview !== 'function') addCode(blockers, 'folder-color-apply-unavailable');
    if (!sync || typeof sync.buildFolderApplyEvent !== 'function') addCode(blockers, 'applyEvent-builder-unavailable');

    var preflight = null;
    if (!blockers.length) {
      try {
        preflight = safeObject(await sync.runConvergencePreflight({ plannerEntry: entry }));
      } catch (_) {
        addCode(blockers, 'convergence-preflight-failed');
      }
      codeList(preflight && preflight.blockers).forEach(function (code) { addCode(blockers, code); });
      codeList(preflight && preflight.warnings).forEach(function (code) { addCode(warnings, code); });
      if (!preflight || preflight.actionable !== true) addCode(blockers, 'convergence-preflight-not-actionable');
      if (preflight && preflight.targetColorAvailable !== true) addCode(blockers, 'target-color-unavailable');
      if (preflight && preflight.subjectResolved !== true) addCode(blockers, 'subject-not-resolved');
    }

    var targetColorValue = '';
    var target = { row: null, folderId: '' };
    var actorPeer = null;
    if (!blockers.length) {
      targetColorValue = await targetColor(entry, warnings);
      if (!targetColorValue) addCode(blockers, 'target-color-unavailable');
      target = await resolveSubject(entrySubject(entry), warnings);
      if (!target.row || !target.folderId) addCode(blockers, 'subject-not-resolved');
      actorPeer = await localActorPeer(blockers);
    }

    var baselineHash = '';
    if (!blockers.length) {
      baselineHash = normalizeFolderHash(target.row);
      var canonicalHash = await canonicalFolderHash(target.row);
      var entryBase = entryBaseHash(entry);
      if (!baselineHash || (entryBase !== baselineHash && entryBase !== canonicalHash)) {
        addCode(blockers, 'baseline-hash-mismatch');
      }
    }

    if (blockers.length) return failure(blockers, warnings);

    var previewEnvelope = await buildLocalPreviewEnvelope(entry, target, targetColorValue, baselineHash, actorPeer, warnings);
    var applyToken = cleanString(sync.__folderColorApplyApprovalToken);
    var applyResult = safeObject(await sync.applyFolderColorPreview({
      previewEnvelope: previewEnvelope,
      expectedBaselineHash: baselineHash,
      operatorApprovalToken: applyToken
    }));
    codeList(applyResult.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(applyResult.warnings).forEach(function (code) { addCode(warnings, code); });
    if (applyResult.ok !== true || applyResult.applied !== true) {
      if (!blockers.length) addCode(blockers, 'folder-color-apply-failed');
      return failure(blockers, warnings);
    }

    var auditRow = await applyEventAuditRow(applyResult, entrySubject(entry), entryLineage(entry));
    var applyEvent = safeObject(await sync.buildFolderApplyEvent({ applyAuditRow: auditRow }));
    codeList(applyEvent.blockers).forEach(function (code) { addCode(blockers, code); });
    codeList(applyEvent.warnings).forEach(function (code) { addCode(warnings, code); });
    if (applyEvent.kind !== 'applyEvent' || applyEvent.dryRun !== false || applyEvent.transactional !== true) {
      addCode(blockers, 'applyEvent-build-failed');
      return failure(blockers, warnings);
    }

    var result = {
      schema: SCHEMA,
      ok: true,
      applied: true,
      applyEvent: applyEvent,
      subjectId: entrySubject(entry),
      lineageId: entryLineage(entry),
      blockers: [],
      warnings: codeList(warnings)
    };
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      return failure(['color-convergence-result-contains-forbidden-field'], ['blocked-forbidden-key-' + forbidden]);
    }
    return result;
  }

  H2O.Desktop.Sync.executeColorConvergence = executeColorConvergence;
  H2O.Desktop.Sync.__colorConvergenceActionInstalled = true;
  H2O.Desktop.Sync.__colorConvergenceActionVersion = VERSION;
  H2O.Desktop.Sync.__colorConvergenceActionApprovalToken = APPROVAL_TOKEN;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
