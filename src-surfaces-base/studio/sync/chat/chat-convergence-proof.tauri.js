/* H2O Desktop Sync - F14.3.7 chat convergence proof
 *
 * Read-only proof harness for chat archive/rename proposal, handoff preview,
 * and receipt builder contracts. It builds synthetic redacted fixtures in
 * memory only. No storage writes, publication, relay, Native call, apply,
 * watermark write, or consumed-operation write.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
      if (global.H2O && global.H2O.Studio && global.H2O.Studio.platform &&
          global.H2O.Studio.platform.env && global.H2O.Studio.platform.env.isTauri === true) return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__chatConvergenceProofInstalled) return;

  var VERSION = '0.1.0-f14.3.7';
  var RESULT_SCHEMA = 'h2o.desktop.sync.chat-convergence-proof.v1';
  var ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1';
  var SUBJECT_TYPE = 'chat.metadata';
  var OP_ARCHIVE_PROPOSED = 'chat-metadata-archive-proposed';
  var OP_RENAME_PROPOSED = 'chat-metadata-rename-proposed';
  var OP_ARCHIVE_APPLIED = 'chat-metadata-archive-applied';
  var OP_RENAME_APPLIED = 'chat-metadata-rename-applied';
  var OPERATION_INTENT = 'update';
  var REDACTED = 'redacted';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'message_array', 'conversation',
    'attachments', 'files', 'file_ids', 'image_urls', 'audio_urls',
    'name', 'title', 'chatTitle', 'rawTitle', 'proposedTitle',
    'rawId', 'chatId', 'accountId', 'rawAccountId',
    'path', 'url', 'share_url', 'share_token', 'password', 'apiKey',
    'session_token', 'cookies', 'token'
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

  function cleanLower(value) {
    return cleanString(value).toLowerCase();
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) {
      return arr.indexOf(code) === index;
    });
  }

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  function isSha256Hex(value) {
    return /^[0-9a-f]{64}$/.test(cleanLower(value));
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJson(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.canonicalJSON === 'function') {
      try { return kernel.canonicalJSON(value); } catch (_) { /* fall through */ }
    }
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
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var fromKernel = await kernel.sha256Hex(value);
        if (isSha256Hex(fromKernel)) return cleanLower(fromKernel);
      } catch (_) { /* fall through */ }
    }
    if (!webCryptoAvailable()) return '';
    var text = typeof value === 'string' ? value : canonicalJson(value);
    var data = new TextEncoder().encode(text);
    var buffer = await global.crypto.subtle.digest('SHA-256', data);
    return bytesToHex(new Uint8Array(buffer));
  }

  function generateUuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) { /* fall through */ }
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
      if (/token$/i.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }

  function scanPrivacy(value, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        var scan = kernel.scanPrivacy(value, {
          subjectType: SUBJECT_TYPE,
          redactionClass: REDACTED,
          allowedRedactionClasses: [REDACTED],
          forbiddenList: FOREVER_NO_FIELDS,
          foreverNoFields: FOREVER_NO_FIELDS
        });
        codeList(scan && scan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(scan && scan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'privacy-scan-threw');
      }
    }
    if (typeof H2O.Desktop.Sync.runChatForbiddenFieldScan === 'function') {
      try {
        var chatScan = H2O.Desktop.Sync.runChatForbiddenFieldScan(value);
        codeList(chatScan && chatScan.blockers).forEach(function (code) { addCode(blockers, code); });
        codeList(chatScan && chatScan.warnings).forEach(function (code) { addCode(warnings, code); });
      } catch (_) {
        addCode(warnings, 'chat-forbidden-field-scan-threw');
      }
    }
    var forbidden = foreverNoKey(value);
    if (forbidden) {
      addCode(blockers, 'payload-contains-forever-no-field');
      addCode(warnings, 'blocked-forbidden-key-' + forbidden);
    }
  }

  async function actorPeer() {
    return {
      physicalDeviceIdHash: await sha256Hex('h2o-chat-proof-device'),
      installIdHash: await sha256Hex('h2o-chat-proof-install'),
      syncPeerIdHash: await sha256Hex('h2o-chat-proof-peer'),
      surfaceKind: 'desktop-tauri'
    };
  }

  async function ownerDeclaration(peer) {
    return {
      ownerKind: 'native',
      kind: 'native',
      ownerId: 'native-chat-owner-proof',
      id: 'native-chat-owner-proof',
      platformId: 'native-chat-owner-proof',
      surfaceKind: 'native',
      authorityLevel: 'audited-apply-authority',
      capabilities: ['ownerHandoff'],
      subjectTypes: [SUBJECT_TYPE],
      ownerNameHash: await sha256Hex('h2o-chat-proof-native-owner'),
      ownerPeer: peer,
      actorPeer: peer
    };
  }

  function envelopeForEventDigest(envelope) {
    var clone = JSON.parse(JSON.stringify(envelope));
    delete clone.eventDigest;
    delete clone.warnings;
    delete clone.blockers;
    return clone;
  }

  async function buildProposalFixture(domain, peer) {
    var proposalOperation = domain === 'rename' ? OP_RENAME_PROPOSED : OP_ARCHIVE_PROPOSED;
    var subjectId = await sha256Hex('chat.metadata:proof-' + domain);
    var baseHash = await sha256Hex('chat-proof-base:' + domain);
    var targetHash = await sha256Hex('chat-proof-target:' + domain);
    var kernel = H2O.Desktop.Sync.kernel || null;
    var lineageResult = kernel && typeof kernel.generateLineageId === 'function'
      ? await kernel.generateLineageId({
        deterministic: true,
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        operation: proposalOperation,
        baseHash: baseHash,
        actorPeer: peer
      })
      : null;
    var dedupeResult = kernel && typeof kernel.generateDedupeKey === 'function'
      ? await kernel.generateDedupeKey({
        subjectType: SUBJECT_TYPE,
        subjectId: subjectId,
        operation: proposalOperation,
        baseHash: baseHash,
        actorPeer: peer
      })
      : null;
    var lineageId = isSha256Hex(lineageResult && lineageResult.lineageId)
      ? cleanLower(lineageResult.lineageId)
      : await sha256Hex('lineage:' + subjectId + ':' + proposalOperation + ':' + baseHash);
    var dedupeKey = isSha256Hex(dedupeResult && dedupeResult.dedupeKey)
      ? cleanLower(dedupeResult.dedupeKey)
      : await sha256Hex('dedupe:' + subjectId + ':' + proposalOperation + ':' + baseHash);
    var evidenceDigest = await sha256Hex('evidence:' + subjectId + ':' + domain);
    var predicateVersion = domain === 'rename' ? 'h2o.chat.rename.predicate.v1' : 'h2o.chat.archive.predicate.v1';
    var target = domain === 'rename'
      ? { titleHash: await sha256Hex('proof-title-target') }
      : { archived: true };
    var proposedOperation = Object.assign({
      operation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      baseHash: baseHash,
      targetHash: targetHash,
      predicateVersion: predicateVersion,
      sourceGate: 'chat-convergence-proof.v1'
    }, target);
    if (domain === 'rename') proposedOperation.currentTitleHash = await sha256Hex('proof-title-current');
    if (domain === 'archive') proposedOperation.currentArchiveState = false;
    var expectedPostState = Object.assign({
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      baseHash: baseHash,
      expectedPostStateHash: targetHash,
      predicateVersion: predicateVersion
    }, target);
    var payload = {
      justifyingEvidenceDigests: [evidenceDigest],
      proposedOperation: proposedOperation,
      expectedPostState: expectedPostState,
      predicateVersion: predicateVersion
    };
    var payloadHash = await sha256Hex(payload);
    var envelopeBase = {
      schema: ENVELOPE_SCHEMA,
      envelopeVersion: 'v1',
      envelopeKindVersion: 'v1',
      kind: 'proposal',
      id: generateUuid(),
      lineageId: lineageId,
      createdAt: nowIsoSeconds(),
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      sequence: null,
      exportSequence: null,
      sourcePlatform: {
        platformId: 'desktop-studio',
        surfaceKind: 'desktop-tauri',
        sourcePeerEnvelope: peer
      },
      declaredAuthority: 'strong-local-authority',
      effectiveAuthority: 'strong-local-authority',
      capabilityUsed: 'propose',
      capabilitySnapshotHash: await sha256Hex('h2o.chat.proof.capability:' + domain),
      subjectType: SUBJECT_TYPE,
      subjectId: subjectId,
      operation: proposalOperation,
      operationIntent: OPERATION_INTENT,
      redactionClass: REDACTED,
      dryRun: null,
      transactional: null,
      dedupeKey: dedupeKey,
      payloadHash: payloadHash,
      payload: payload
    };
    var envelope = Object.assign({}, envelopeBase, {
      eventDigest: await sha256Hex(envelopeForEventDigest(envelopeBase)),
      warnings: [],
      blockers: []
    });
    return {
      proposalCandidate: envelope,
      candidateRow: {
        rowId: generateUuid(),
        envelopeId: envelope.id,
        lineageId: lineageId,
        subjectId: subjectId,
        operation: proposalOperation,
        operationIntent: OPERATION_INTENT,
        baseHash: baseHash,
        targetHash: targetHash,
        predicateVersion: predicateVersion,
        dedupeKey: dedupeKey,
        eventDigest: envelope.eventDigest,
        actorPeer: peer,
        status: 'generated',
        sourceDomain: SUBJECT_TYPE,
        targetState: target,
        serializedEnvelope: canonicalJson(envelope)
      }
    };
  }

  function operationResultFor(domain, candidate, peer) {
    var env = safeObject(candidate.proposalCandidate);
    var op = safeObject(safeObject(env.payload).proposedOperation);
    return {
      ok: true,
      result: 'applied',
      operation: domain === 'rename' ? OP_RENAME_APPLIED : OP_ARCHIVE_APPLIED,
      preStateHash: cleanLower(op.baseHash),
      postStateHash: cleanLower(op.targetHash),
      transactionId: 'chat-proof-txn-' + domain,
      auditMaintenanceId: 'chat-proof-audit-' + domain,
      operationId: 'chat-proof-operation-' + domain,
      appliedAtIso: nowIsoSeconds(),
      actorPeer: peer
    };
  }

  async function runLane(domain, result, peer, owner) {
    var candidate = await buildProposalFixture(domain, peer);
    var blockers = [];
    var warnings = [];
    scanPrivacy(candidate, blockers, warnings);
    var handoff = await H2O.Desktop.Sync.previewChatNativeOwnerHandoff({
      candidate: candidate,
      ownerDeclaration: owner,
      ownerStatus: 'reachable'
    });
    var receipt = await H2O.Desktop.Sync.buildChatApplyEventReceipt({
      proposalCandidate: candidate,
      handoffPreview: handoff,
      operationResult: operationResultFor(domain, candidate, peer)
    });
    codeList(handoff && handoff.blockers).forEach(function (code) { addCode(blockers, domain + '-handoff-' + code); });
    codeList(handoff && handoff.warnings).forEach(function (code) { addCode(warnings, domain + '-handoff-' + code); });
    codeList(receipt && receipt.blockers).forEach(function (code) { addCode(blockers, domain + '-receipt-' + code); });
    codeList(receipt && receipt.warnings).forEach(function (code) { addCode(warnings, domain + '-receipt-' + code); });
    var event = safeObject(receipt && receipt.applyEvent);
    scanPrivacy(receipt, blockers, warnings);
    var proposalLineageOk = handoff && handoff.lineageId === candidate.proposalCandidate.lineageId;
    var receiptLineageOk = event.lineageId === candidate.proposalCandidate.lineageId;
    if (!proposalLineageOk) addCode(blockers, domain + '-proposal-lineage-mismatch');
    if (!receiptLineageOk) addCode(blockers, domain + '-receipt-lineage-mismatch');
    return {
      ok: blockers.length === 0 &&
        handoff && handoff.ok === true &&
        handoff.handoffReady === true &&
        receipt && receipt.ok === true &&
        event.kind === 'applyEvent',
      candidate: {
        operation: candidate.proposalCandidate.operation,
        subjectId: candidate.proposalCandidate.subjectId,
        lineageId: candidate.proposalCandidate.lineageId,
        eventDigest: candidate.proposalCandidate.eventDigest
      },
      handoffReady: handoff && handoff.handoffReady === true,
      receiptReady: receipt && receipt.ok === true,
      applyEventDigest: cleanLower(event.eventDigest),
      proposalLineageOk: proposalLineageOk,
      applyEventLineageOk: receiptLineageOk,
      blockers: blockers,
      warnings: warnings
    };
  }

  async function negativeProofs(candidate, handoff, peer) {
    var out = {
      rawTitleBlocked: false,
      rawChatIdBlocked: false,
      forbiddenFieldBlocked: false,
      blockers: [],
      warnings: []
    };
    var rawTitle = await H2O.Desktop.Sync.buildChatApplyEventReceipt({
      proposalCandidate: candidate,
      handoffPreview: handoff,
      operationResult: Object.assign(operationResultFor('rename', candidate, peer), { title: 'Forbidden raw title' })
    });
    out.rawTitleBlocked = rawTitle && rawTitle.ok === false;
    var rawChatId = await H2O.Desktop.Sync.buildChatApplyEventReceipt({
      proposalCandidate: candidate,
      handoffPreview: handoff,
      operationResult: Object.assign(operationResultFor('rename', candidate, peer), { chatId: 'raw-chat-id' })
    });
    out.rawChatIdBlocked = rawChatId && rawChatId.ok === false;
    var content = await H2O.Desktop.Sync.buildChatApplyEventReceipt({
      proposalCandidate: candidate,
      handoffPreview: handoff,
      operationResult: Object.assign(operationResultFor('rename', candidate, peer), { content: 'forbidden content' })
    });
    out.forbiddenFieldBlocked = content && content.ok === false;
    if (!out.rawTitleBlocked) addCode(out.blockers, 'raw-title-negative-proof-failed');
    if (!out.rawChatIdBlocked) addCode(out.blockers, 'raw-chatId-negative-proof-failed');
    if (!out.forbiddenFieldBlocked) addCode(out.blockers, 'content-negative-proof-failed');
    codeList(rawTitle && rawTitle.warnings).forEach(function (code) { addCode(out.warnings, code); });
    codeList(rawChatId && rawChatId.warnings).forEach(function (code) { addCode(out.warnings, code); });
    codeList(content && content.warnings).forEach(function (code) { addCode(out.warnings, code); });
    return out;
  }

  function finish(result) {
    result.blockers = codeList(result.blockers);
    result.warnings = codeList(result.warnings);
    result.ok = result.archiveLaneOk === true &&
      result.renameLaneOk === true &&
      result.privacyOk === true &&
      result.noRawTitleLeaks === true &&
      result.noRawChatIdLeaks === true &&
      result.proposalLineageOk === true &&
      result.applyEventLineageOk === true &&
      result.blockers.length === 0;
    return result;
  }

  async function runChatConvergenceProof() {
    var result = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: false,
      archiveLaneOk: false,
      renameLaneOk: false,
      privacyOk: false,
      noRawTitleLeaks: false,
      noRawChatIdLeaks: false,
      proposalLineageOk: false,
      applyEventLineageOk: false,
      archive: null,
      rename: null,
      negativeProofs: null,
      blockers: [],
      warnings: []
    };
    if (!webCryptoAvailable()) addCode(result.blockers, 'web-crypto-unavailable');
    if (typeof H2O.Desktop.Sync.previewChatNativeOwnerHandoff !== 'function') addCode(result.blockers, 'chat-handoff-preview-unavailable');
    if (typeof H2O.Desktop.Sync.buildChatApplyEventReceipt !== 'function') addCode(result.blockers, 'chat-receipt-builder-unavailable');
    if (result.blockers.length) return finish(result);

    var peer = await actorPeer();
    var owner = await ownerDeclaration(peer);
    var archive = await runLane('archive', result, peer, owner);
    var rename = await runLane('rename', result, peer, owner);
    result.archive = archive;
    result.rename = rename;
    result.archiveLaneOk = archive.ok === true;
    result.renameLaneOk = rename.ok === true;
    result.proposalLineageOk = archive.proposalLineageOk === true && rename.proposalLineageOk === true;
    result.applyEventLineageOk = archive.applyEventLineageOk === true && rename.applyEventLineageOk === true;
    codeList(archive.blockers).forEach(function (code) { addCode(result.blockers, code); });
    codeList(rename.blockers).forEach(function (code) { addCode(result.blockers, code); });
    codeList(archive.warnings).forEach(function (code) { addCode(result.warnings, code); });
    codeList(rename.warnings).forEach(function (code) { addCode(result.warnings, code); });

    var negativeCandidate = await buildProposalFixture('rename', peer);
    var negativeHandoff = await H2O.Desktop.Sync.previewChatNativeOwnerHandoff({
      candidate: negativeCandidate,
      ownerDeclaration: owner,
      ownerStatus: 'reachable'
    });
    var negative = await negativeProofs(negativeCandidate, negativeHandoff, peer);
    result.negativeProofs = negative;
    result.noRawTitleLeaks = negative.rawTitleBlocked === true;
    result.noRawChatIdLeaks = negative.rawChatIdBlocked === true;
    result.privacyOk = negative.forbiddenFieldBlocked === true &&
      result.archiveLaneOk === true &&
      result.renameLaneOk === true;
    codeList(negative.blockers).forEach(function (code) { addCode(result.blockers, code); });
    codeList(negative.warnings).forEach(function (code) { addCode(result.warnings, code); });
    return finish(result);
  }

  H2O.Desktop.Sync.runChatConvergenceProof = runChatConvergenceProof;
  H2O.Desktop.Sync.__chatConvergenceProofInstalled = true;
  H2O.Desktop.Sync.__chatConvergenceProofVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
