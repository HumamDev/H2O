/* H2O Desktop Sync - F10.7.1 desktop-local folder color apply
 *
 * Desktop/Tauri-only mutation gate over the proven F7 local color apply command.
 *
 * Safety invariants:
 *   - Desktop-local only; bails on non-Tauri contexts.
 *   - Folder color only. No rename, move, create, delete, or binding changes.
 *   - Consumes F10.2 kind="preview" / dryRun=true envelopes only.
 *   - Requires explicit operator approval token.
 *   - Calls the existing local transactional Tauri command through the F7
 *     exact-gated wrapper; does not emit applyEvent.
 *   - No fetch, WebDAV, chrome.runtime messages, polling, automatic retry, or
 *     automatic merge.
 *   - Return payload is redacted: no raw folder IDs, colors, names, chat IDs,
 *     audit IDs, or content.
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
  if (H2O.Desktop.Sync.__folderColorApplyInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.folder-color-apply.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var VERSION = '0.1.0-f10.7.1';
  var APPROVAL_TOKEN = 'I_APPROVE_DESKTOP_LOCAL_FOLDER_COLOR_APPLY';
  var F7_APPLY_GATE = 'I_UNDERSTAND_THIS_APPLIES_ONE_LOCAL_FOLDER_COLOR_CHANGE';
  var ENTITY_KIND = 'folder.metadata';
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
    return /^[0-9a-f]{64}$/.test(cleanString(value));
  }

  function isLocalHash(value) {
    var text = cleanString(value);
    return (text.length === 8 || text.length === 64) && /^[0-9a-fA-F]+$/.test(text);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    var keys = Object.keys(value).sort();
    for (var i = 0; i < keys.length; i += 1) out[keys[i]] = canonicalize(value[keys[i]]);
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

  function normalizeFolderHash(row) {
    if (!isObject(row)) return '';
    var metaValue = firstPresent(row, ['meta', 'meta_json']);
    var metaPresent = isObject(metaValue)
      ? Object.keys(metaValue).length > 0
      : !!cleanString(metaValue);
    var hashInput = {
      name: firstString(row, ['name', 'title', 'folderName']) || null,
      parentId: cleanString(firstPresent(row, ['parentId', 'parentFolderId', 'parent_id'])),
      color: firstString(row, ['color', 'iconColor', 'folderColor', 'accentColor']) || null,
      icon: firstString(row, ['icon', 'iconKey']) || null,
      sortOrder: normalizeNumber(firstPresent(row, ['sortOrder', 'index', 'position'])),
      kind: firstString(row, ['kind']) || null,
      source: firstString(row, ['source']) || null,
      metaPresent: !!metaPresent
    };
    return fnv1a32Hex(canonicalJson(hashInput));
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      generatedAtIso: nowIso(),
      dryRun: false,
      applied: false,
      localOnly: true,
      syncPropagated: false,
      applyEventEmitted: false,
      operation: 'folder-color-apply',
      entityKind: ENTITY_KIND,
      fieldsUpdated: [],
      resultState: 'rejected',
      audit: {
        recorded: false,
        ledger: null
      },
      counts: {
        rowsUpdated: 0
      },
      blockers: [],
      warnings: []
    };
  }

  function fail(code, warnings) {
    var out = baseResult();
    addCode(out.blockers, code);
    asArray(warnings).forEach(function (warning) { addCode(out.warnings, warning); });
    return out;
  }

  function getDiagnostics() {
    return H2O.Studio && H2O.Studio.diagnostics ? H2O.Studio.diagnostics : null;
  }

  function getFoldersApi() {
    return H2O.Studio && H2O.Studio.store && H2O.Studio.store.folders;
  }

  function getIdentityApi() {
    return H2O.Studio && H2O.Studio.identity;
  }

  function sourcePeerEnvelope(envelope) {
    return safeObject(safeObject(safeObject(envelope).sourcePlatform).sourcePeerEnvelope);
  }

  function validPeerEnvelope(peer) {
    return isSha256Hex(peer.physicalDeviceIdHash)
      && isSha256Hex(peer.installIdHash)
      && isSha256Hex(peer.syncPeerIdHash);
  }

  async function localActorPeer() {
    var identity = getIdentityApi();
    if (!identity || typeof identity.whenReady !== 'function') return null;
    var value = await identity.whenReady();
    if (!isObject(value) || !cleanString(value.physicalDeviceId) ||
        !cleanString(value.installId) || !cleanString(value.syncPeerId)) {
      return null;
    }
    return {
      physicalDeviceIdHash: await sha256Hex(cleanString(value.physicalDeviceId)),
      installIdHash: await sha256Hex(cleanString(value.installId)),
      syncPeerIdHash: await sha256Hex(cleanString(value.syncPeerId)),
      surfaceKind: 'desktop-tauri'
    };
  }

  function proposalPreview(envelope) {
    return safeObject(safeObject(envelope).payload).proposalPreview;
  }

  function changedFields(pp) {
    return asArray(pp && pp.changedFields).map(cleanString).filter(Boolean).sort();
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function hasBlockingCode(codes, prefixOrCode) {
    for (var i = 0; i < codes.length; i += 1) {
      var code = codes[i];
      if (code === prefixOrCode || code.indexOf(prefixOrCode) === 0) return true;
    }
    return false;
  }

  function validateEnvelope(envelope, expectedBaselineHash, blockers, warnings) {
    var env = safeObject(envelope);
    var pp = proposalPreview(env);
    var sourcePlatform = safeObject(env.sourcePlatform);
    var peer = sourcePeerEnvelope(env);
    var fields = changedFields(pp);
    var envBlockers = codeList(env.blockers).concat(codeList(pp && pp.blockers));
    var envWarnings = codeList(env.warnings).concat(codeList(pp && pp.warnings));

    envWarnings.forEach(function (code) { addCode(warnings, code); });

    if (env.schema !== ENVELOPE_SCHEMA) addCode(blockers, 'invalid-preview-envelope');
    if (env.kind !== 'preview') addCode(blockers, 'preview-envelope-required');
    if (env.dryRun !== true) addCode(blockers, 'dry-run-preview-required');
    if (env.subjectType !== ENTITY_KIND) addCode(blockers, 'unsupported-entity-kind');
    if (!isObject(pp)) addCode(blockers, 'proposal-preview-required');
    if (pp && pp.proposalEligible !== true) addCode(blockers, 'proposal-eligible-required');
    if (cleanString(env.operationIntent || (pp && pp.operationIntent)) !== 'update') {
      addCode(blockers, 'operation-intent-update-required');
    }
    if (fields.length !== 1 || fields[0] !== 'color') addCode(blockers, 'field-not-allowlisted');
    if (!isLocalHash(expectedBaselineHash)) addCode(blockers, 'expected-baseline-hash-required');
    if (!validPeerEnvelope(peer)) addCode(blockers, 'invalid-peer-identity');
    if (cleanString(sourcePlatform.platformId) === 'mobile') addCode(blockers, 'mobile-write-back-forbidden');

    if (env.expiresAt) {
      var expires = Date.parse(env.expiresAt);
      if (!Number.isFinite(expires) || expires <= Date.now()) addCode(blockers, 'proposal-expired');
    }

    if (hasBlockingCode(envBlockers, 'duplicate-folder-name')) addCode(blockers, 'duplicate-folder-name');
    if (hasBlockingCode(envBlockers, 'orphan-parent')) addCode(blockers, 'orphan-parent');
    if (hasBlockingCode(envBlockers, 'f5-')) addCode(blockers, 'f5-blocker-present');
    if (hasBlockingCode(envBlockers, 'f6-')) addCode(blockers, 'f6-blocker-present');
    if (hasBlockingCode(envBlockers, 'baseline-hash-not-verified')) addCode(blockers, 'baseline-hash-not-verified');
    if (hasBlockingCode(envBlockers, 'baseline-hash-mismatch')) addCode(blockers, 'baseline-hash-mismatch');

    var previewBaseHash = cleanString(pp && pp.baseHash);
    var expected = cleanString(expectedBaselineHash).toLowerCase();
    if (previewBaseHash && previewBaseHash.length === expected.length &&
        previewBaseHash.toLowerCase() !== expected) {
      addCode(blockers, 'baseline-hash-mismatch');
    }
  }

  function desktopLocalApplyHint(envelope) {
    var pp = proposalPreview(envelope);
    return safeObject(
      safeObject(pp && pp.desktopLocalApply).localOnly === true ? pp.desktopLocalApply :
        (safeObject(pp && pp.localApply).localOnly === true ? pp.localApply :
          (safeObject(envelope && envelope.desktopLocalApply).localOnly === true ? envelope.desktopLocalApply : null))
    );
  }

  function localApplyTarget(envelope, blockers) {
    var hint = desktopLocalApplyHint(envelope);
    var folderId = cleanString(hint.targetFolderId || hint.folderId);
    var color = cleanString(hint.targetColor || hint.color || hint.iconColor);
    if (!folderId || !color) addCode(blockers, 'desktop-local-apply-target-required');
    return {
      targetFolderId: folderId,
      targetColor: color
    };
  }

  async function verifySubjectMapping(envelope, targetFolderId, blockers) {
    var expectedSubjectId = cleanString(envelope && envelope.subjectId);
    if (!expectedSubjectId || !targetFolderId) return;
    var actual = await sha256Hex('folder.metadata:' + targetFolderId);
    if (actual !== expectedSubjectId) addCode(blockers, 'subject-id-mismatch');
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

  async function applyFolderColorPreview(input) {
    var args = safeObject(input);
    var result = baseResult();
    var blockers = [];
    var warnings = [];
    var envelope = safeObject(args.previewEnvelope);
    var expectedBaselineHash = cleanString(args.expectedBaselineHash);

    if (!webCryptoAvailable()) addCode(blockers, 'web-crypto-unavailable');
    if (cleanString(args.operatorApprovalToken) !== APPROVAL_TOKEN) {
      addCode(blockers, 'operator-approval-token-required');
    }
    validateEnvelope(envelope, expectedBaselineHash, blockers, warnings);

    var localTarget = localApplyTarget(envelope, blockers);
    if (!blockers.length) await verifySubjectMapping(envelope, localTarget.targetFolderId, blockers);

    var diagnostics = getDiagnostics();
    if (!diagnostics || typeof diagnostics.planBidirectionalFolderMetadataApply !== 'function' ||
        typeof diagnostics.applyBidirectionalFolderMetadataColor !== 'function') {
      addCode(blockers, 'desktop-folder-color-apply-unavailable');
    }
    var foldersApi = getFoldersApi();
    if (!foldersApi || typeof foldersApi.get !== 'function') addCode(blockers, 'local-folder-read-unavailable');

    var actorPeer = null;
    if (!blockers.length) {
      try {
        actorPeer = await localActorPeer();
      } catch (_) {
        actorPeer = null;
      }
      if (!actorPeer || !validPeerEnvelope(actorPeer)) addCode(blockers, 'invalid-peer-identity');
    }

    if (blockers.length) {
      blockers.forEach(function (code) { addCode(result.blockers, code); });
      warnings.forEach(function (code) { addCode(result.warnings, code); });
      return result;
    }

    var currentFolder;
    try {
      currentFolder = await Promise.resolve(foldersApi.get(localTarget.targetFolderId));
    } catch (_) {
      currentFolder = null;
    }
    if (!currentFolder) return fail('target-folder-not-found', warnings);

    var targetFolder = Object.assign({}, currentFolder, {
      color: localTarget.targetColor,
      iconColor: localTarget.targetColor
    });
    var expectedTargetHash = normalizeFolderHash(targetFolder);
    var dedupeKeyHash = cleanString(envelope.dedupeKey || envelope.eventDigest);
    var planInput = {
      dryRun: true,
      entityKind: ENTITY_KIND,
      field: 'color',
      selectedDelta: {
        targetFolderId: localTarget.targetFolderId,
        dedupeKeyHash: dedupeKeyHash
      },
      expectedBaselineHash: expectedBaselineHash,
      expectedTargetHash: expectedTargetHash,
      reason: 'f10.7.1 desktop-local folder color apply preview gate',
      refreshLocalState: true,
      checkF5Blockers: true,
      checkF6Blockers: true
    };

    var priorPlan = await Promise.resolve(diagnostics.planBidirectionalFolderMetadataApply(planInput));
    if (!priorPlan || priorPlan.ok !== true || priorPlan.applyable !== true ||
        priorPlan.dryRun !== true || Number(priorPlan.writesPerformed) !== 0) {
      result.blockers = codeList(priorPlan && priorPlan.blockers);
      if (!result.blockers.length) addCode(result.blockers, 'apply-plan-proof-required');
      result.warnings = codeList(priorPlan && priorPlan.warnings).concat(warnings);
      return result;
    }

    var operationId = await sha256Hex(canonicalJson({
      schema: SCHEMA,
      purpose: 'operationId',
      envelopeId: cleanString(envelope.id),
      lineageId: cleanString(envelope.lineageId),
      subjectId: cleanString(envelope.subjectId),
      dedupeKeyHash: dedupeKeyHash,
      preStateHash: expectedBaselineHash,
      postStateHash: expectedTargetHash
    }));
    var transactionId = await sha256Hex(canonicalJson({
      schema: SCHEMA,
      purpose: 'transactionId',
      operationId: operationId
    }));

    var applyResult = await Promise.resolve(diagnostics.applyBidirectionalFolderMetadataColor({
      dryRun: false,
      devGate: F7_APPLY_GATE,
      reason: 'f10.7.1 approved desktop-local folder color apply',
      targetFolderId: localTarget.targetFolderId,
      field: 'color',
      targetColor: localTarget.targetColor,
      expectedBaselineHash: expectedBaselineHash,
      expectedTargetHash: expectedTargetHash,
      dedupeKeyHash: dedupeKeyHash,
      priorPlan: priorPlan,
      selectedDelta: {
        targetFolderId: localTarget.targetFolderId,
        dedupeKeyHash: dedupeKeyHash
      }
    }));

    result.ok = !!(applyResult && applyResult.ok === true);
    result.applied = !!(applyResult && applyResult.applied === true);
    result.resultState = result.ok && result.applied ? 'committed' : 'rejected';
    result.fieldsUpdated = result.applied ? ['color'] : [];
    result.counts.rowsUpdated = Number(applyResult && applyResult.counts && applyResult.counts.rowsUpdated) || 0;
    result.audit.recorded = !!(applyResult && applyResult.audit && applyResult.audit.recorded === true);
    result.audit.ledger = {
      operationId: operationId,
      actorPeer: actorPeer,
      proposalLineageId: cleanString(envelope.lineageId) || null,
      subjectId: cleanString(envelope.subjectId),
      preStateHash: expectedBaselineHash,
      postStateHash: expectedTargetHash,
      appliedAtIso: result.ok ? nowIso() : null,
      transactionId: transactionId,
      result: result.resultState,
      dedupeKey: dedupeKeyHash
    };
    result.blockers = codeList(applyResult && applyResult.blockers);
    result.warnings = warnings.concat(codeList(applyResult && applyResult.warnings));
    result.localOnly = true;
    result.syncPropagated = false;
    result.applyEventEmitted = false;

    var forbiddenKey = foreverNoKey(result);
    if (forbiddenKey) {
      return fail('payload-contains-forever-no-field', ['blocked-forbidden-key-' + forbiddenKey]);
    }
    return result;
  }

  H2O.Desktop.Sync.applyFolderColorPreview = applyFolderColorPreview;
  H2O.Desktop.Sync.__folderColorApplyInstalled = true;
  H2O.Desktop.Sync.__folderColorApplyVersion = VERSION;
  H2O.Desktop.Sync.__folderColorApplyApprovalToken = APPROVAL_TOKEN;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
