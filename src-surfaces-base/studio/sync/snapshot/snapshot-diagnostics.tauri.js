/* H2O Desktop Sync - F14.4.2 read-only snapshot diagnostics
 *
 * Snapshot convergence diagnostic primitives over the F14.4.0/F14.4.1
 * canonical snapshot.conversation model. Each API is read-only and only
 * reports observed state, blockers, and warnings.
 *
 * Public API:
 *   H2O.Desktop.Sync.runSnapshotMaterializationDiagnostic(input)
 *   H2O.Desktop.Sync.runSnapshotCrossAccountIdentityCheck(input)
 *   H2O.Desktop.Sync.runSnapshotNativeOwnerReachabilityProbe(input)
 *   H2O.Desktop.Sync.runSnapshotMirrorStalenessProbe(input)
 *   H2O.Desktop.Sync.runSnapshotTombstoneCheck(input)
 *   H2O.Desktop.Sync.runSnapshotForbiddenFieldScan(target)
 *   H2O.Desktop.Sync.runSnapshotRetentionWindowCheck(input)
 *   H2O.Desktop.Sync.runSnapshotContentIntegrityProbe(input)
 *   H2O.Desktop.Sync.runSnapshotLifecycleTransitionAllowed(input)
 *
 *   H2O.Desktop.Sync.__snapshotDiagnosticsInstalled
 *   H2O.Desktop.Sync.__snapshotDiagnosticsVersion
 *
 * Safety invariants:
 *   - Tauri only (bails on non-Tauri).
 *   - No restore execution, no apply, no publication, no relay/outbox, no
 *     Native execution, no storage writes, no watermark writes, no
 *     consumed-op writes.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__snapshotDiagnosticsInstalled) return;

  var VERSION = '0.1.0-f14.4.2';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var EXPECTED_OWNER_KIND = 'native';
  var DEFAULT_FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

  var SNAPSHOT_ALLOWED_STATES = ['active', 'archived', 'retained', 'expired', 'tombstoned'];
  var SNAPSHOT_TRANSITIONS = {
    active: ['active', 'archived', 'retained', 'tombstoned'],
    archived: ['archived', 'retained', 'expired', 'tombstoned', 'active'],
    retained: ['retained', 'expired', 'tombstoned', 'active'],
    expired: ['expired', 'tombstoned'],
    tombstoned: ['tombstoned']
  };

  var SNAPSHOT_FORBIDDEN_EXTRA = [
    'messages', 'message_array', 'turns', 'turn_array', 'snapshotTurns',
    'conversation', 'conversationBody', 'transcript', 'text', 'content',
    'body', 'prompt', 'answer', 'response', 'responses', 'completion',
    'excerpt', 'excerpts', 'snippet', 'snippets',
    'attachments', 'files', 'file_ids', 'image_urls', 'audio_urls',
    'html', 'markdown', 'rawSnapshot', 'snapshotPayload', 'payload',
    'share_token', 'share_url', 'sharing', 'visibility', 'public_flag',
    'url', 'path', 'cookies', 'session_token', 'sessionToken',
    'user_agent', 'userAgent', 'ip', 'IP', 'ipAddress', 'ip_address',
    'rawId', 'snapshotId', 'snapshot_id',
    'chatId', 'chat_id', 'conversationId', 'conversation_id',
    'accountId', 'account_id', 'rawAccountId',
    'userId', 'user_id', 'rawUserId',
    'messageId', 'message_id', 'rawMessageId',
    'title', 'name', 'chatTitle', 'folderName'
  ];

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  function nowMs() { return Date.now(); }
  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
  function getKernel() {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    return sync.kernel || null;
  }
  function getCanonicalizer() {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    return typeof sync.canonicalizeSnapshot === 'function' ? sync.canonicalizeSnapshot : null;
  }

  function makeBlockerList() {
    var list = [];
    Object.defineProperty(list, '__listKind', { value: 'blocker', enumerable: false });
    return list;
  }
  function makeWarningList() {
    var list = [];
    Object.defineProperty(list, '__listKind', { value: 'warning', enumerable: false });
    return list;
  }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized) return;
    var kernel = getKernel();
    if (kernel && typeof kernel.addBlocker === 'function' && list && list.__listKind === 'blocker') {
      try { kernel.addBlocker(list, normalized); return; } catch (_) { /* fall through */ }
    }
    if (kernel && typeof kernel.addWarning === 'function' && list && list.__listKind === 'warning') {
      try { kernel.addWarning(list, normalized); return; } catch (_) { /* fall through */ }
    }
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }
  function mergeCodes(into, from) {
    if (!Array.isArray(from)) return;
    for (var i = 0; i < from.length; i++) {
      var entry = from[i];
      if (entry && typeof entry === 'object' && typeof entry.code === 'string') addCode(into, entry.code);
      else if (typeof entry === 'string') addCode(into, entry);
    }
  }
  function makeResult(schema, fields, blockers, warnings, observedAtIso) {
    var kernel = getKernel();
    var bList = blockers || [];
    var wList = warnings || [];
    var ok = bList.length === 0;
    if (kernel && typeof kernel.calculateOk === 'function') {
      try { ok = !!kernel.calculateOk({ blockers: bList }); } catch (_) { ok = bList.length === 0; }
    }
    var out = {
      schema: schema,
      version: VERSION,
      ok: ok,
      blockers: bList.slice(),
      warnings: wList.slice(),
      observedAtIso: observedAtIso || nowIsoSeconds()
    };
    if (isObject(fields)) {
      Object.keys(fields).forEach(function (key) { out[key] = fields[key]; });
    }
    return out;
  }

  function isSha256HexLocal(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  }
  async function sha256Hex(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try { return await kernel.sha256Hex(value); } catch (_) { return ''; }
    }
    return '';
  }
  function isoMs(value) {
    var text = cleanString(value);
    if (!text) return NaN;
    return Date.parse(text);
  }
  function valueAtPath(input, path) {
    var cursor = input;
    for (var i = 0; i < path.length; i++) {
      if (!isObject(cursor)) return undefined;
      cursor = cursor[path[i]];
    }
    return cursor;
  }
  function firstString(input, paths) {
    for (var i = 0; i < paths.length; i++) {
      var value = valueAtPath(input, paths[i]);
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }
  function firstBoolean(input, paths) {
    for (var i = 0; i < paths.length; i++) {
      var value = valueAtPath(input, paths[i]);
      if (typeof value === 'boolean') return value;
    }
    return null;
  }

  async function pickLocalAccountIdHash(input) {
    if (!isObject(input)) return '';
    var hash = firstString(input, [
      ['localAccountIdHash'], ['deviceAccountIdHash'], ['accountIdHash'],
      ['localAccount', 'accountIdHash'], ['localAccount', 'idHash']
    ]);
    if (hash) return hash;
    var raw = firstString(input, [
      ['localAccountId'], ['deviceAccountId'],
      ['localAccount', 'accountId'], ['localAccount', 'id']
    ]);
    return raw ? await sha256Hex(raw) : '';
  }

  async function resolveSnapshot(input) {
    if (!isObject(input)) {
      return { snapshot: null, canonResult: null, gateBlockers: ['snapshot-input-not-object'], gateWarnings: [] };
    }
    if (isObject(input.snapshot) && input.snapshot.subjectType === SUBJECT_TYPE) {
      return { snapshot: input.snapshot, canonResult: null, gateBlockers: [], gateWarnings: [] };
    }
    if (isObject(input.canonicalSnapshot) && input.canonicalSnapshot.subjectType === SUBJECT_TYPE) {
      return { snapshot: input.canonicalSnapshot, canonResult: null, gateBlockers: [], gateWarnings: [] };
    }
    var canonicalizer = getCanonicalizer();
    if (!canonicalizer) {
      return { snapshot: null, canonResult: null, gateBlockers: ['snapshot-canonicalizer-unavailable'], gateWarnings: [] };
    }
    var result;
    try {
      result = await canonicalizer(input);
    } catch (_) {
      return { snapshot: null, canonResult: null, gateBlockers: ['snapshot-canonicalizer-threw'], gateWarnings: [] };
    }
    if (!result || result.quarantined || !result.snapshot) {
      var copied = [(result && result.quarantineReason) || 'canonicalization-failed'];
      if (Array.isArray(result && result.blockers)) {
        for (var i = 0; i < result.blockers.length; i++) {
          var b = result.blockers[i];
          if (b && typeof b.code === 'string') copied.push(b.code);
        }
      }
      return {
        snapshot: null,
        canonResult: result || null,
        gateBlockers: copied,
        gateWarnings: (result && Array.isArray(result.warnings))
          ? result.warnings.map(function (w) { return w && w.code; }).filter(Boolean)
          : []
      };
    }
    return { snapshot: result.snapshot, canonResult: result, gateBlockers: [], gateWarnings: [] };
  }

  function consumedCandidateFromSnapshot(snapshot, input) {
    var eventDigest = cleanString(input && input.eventDigest);
    var dedupeKey = cleanString(input && input.dedupeKey);
    if (!eventDigest && snapshot && snapshot.revisionHash) eventDigest = snapshot.revisionHash;
    if (!dedupeKey && snapshot && snapshot.revisionHash) dedupeKey = snapshot.revisionHash;
    return {
      eventDigest: eventDigest,
      dedupeKey: dedupeKey,
      lineageId: cleanString(input && input.lineageId),
      subjectId: cleanString(snapshot && snapshot.subjectId),
      sourcePeerId: cleanString(input && input.sourcePeerId),
      envelopeKind: cleanString(input && input.envelopeKind) || 'evidence',
      operationKind: cleanString(input && input.operationKind) || 'snapshot.restore',
      consumedStatus: 'consumed',
      consumedAtIso: nowIsoSeconds(),
      actorPeer: input && input.actorPeer,
      originTag: input && input.originTag
    };
  }

  function internalConsumedSafeCheck(snapshot, log) {
    if (!Array.isArray(log) || !snapshot) return true;
    for (var i = 0; i < log.length; i++) {
      var row = log[i];
      if (!isObject(row)) continue;
      if (row.subjectId === snapshot.subjectId && row.revisionHash === snapshot.revisionHash) return false;
      if (row.subjectId === snapshot.subjectId && row.eventDigest === snapshot.revisionHash) return false;
      if (row.subjectId === snapshot.subjectId && row.dedupeKey === snapshot.revisionHash) return false;
    }
    return true;
  }

  function consumedSafe(snapshot, input, blockers, warnings) {
    var log = isObject(input) && Array.isArray(input.consumedOperationsLog)
      ? input.consumedOperationsLog
      : (isObject(input) && Array.isArray(input.consumedLog) ? input.consumedLog : null);
    if (!log) {
      addCode(warnings, 'consumed-op-log-not-provided');
      return true;
    }
    var kernel = getKernel();
    if (kernel && typeof kernel.assistConsumedSafe === 'function') {
      try {
        var helper = kernel.assistConsumedSafe({
          rows: log,
          candidate: consumedCandidateFromSnapshot(snapshot, input)
        });
        mergeCodes(blockers, helper && helper.blockers);
        mergeCodes(warnings, helper && helper.warnings);
        return !!(helper && helper.consumedSafe);
      } catch (_) { /* fall through */ }
    }
    return internalConsumedSafeCheck(snapshot, log);
  }

  async function runSnapshotMaterializationDiagnostic(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = {
      observed: false,
      canonicalized: false,
      diffClassified: false,
      consumedSafe: false,
      identitySafe: false,
      materialized: false,
      canonicalSnapshot: null,
      lifecycle: { domain: SUBJECT_TYPE, state: 'detected' }
    };

    if (!isObject(input)) {
      addCode(blockers, 'snapshot-input-missing');
      return makeResult('h2o.desktop.sync.snapshot-materialization-diagnostic.v1', fields, blockers, warnings, observedAtIso);
    }
    fields.observed = true;
    fields.lifecycle = { domain: SUBJECT_TYPE, state: 'observed' };

    var resolved = await resolveSnapshot(input);
    mergeCodes(blockers, resolved.gateBlockers);
    mergeCodes(warnings, resolved.gateWarnings);
    if (!resolved.snapshot) {
      return makeResult('h2o.desktop.sync.snapshot-materialization-diagnostic.v1', fields, blockers, warnings, observedAtIso);
    }
    fields.canonicalSnapshot = resolved.snapshot;
    fields.canonicalized = true;
    fields.lifecycle = { domain: SUBJECT_TYPE, state: 'canonicalized' };

    if (isSha256HexLocal(resolved.snapshot.subjectId)
        && isSha256HexLocal(resolved.snapshot.revisionHash)
        && isSha256HexLocal(resolved.snapshot.originAccountIdHash)) {
      fields.diffClassified = true;
      fields.lifecycle = { domain: SUBJECT_TYPE, state: 'diff-classified' };
    } else {
      addCode(blockers, 'snapshot-diff-classification-prerequisites-incomplete');
    }

    fields.consumedSafe = consumedSafe(resolved.snapshot, input, blockers, warnings);
    if (!fields.consumedSafe) addCode(blockers, 'snapshot-consumed-operation-not-safe');

    var localHash = await pickLocalAccountIdHash(input);
    if (!localHash) {
      addCode(warnings, 'local-account-id-hash-not-provided');
      fields.identitySafe = true;
    } else if (!isSha256HexLocal(localHash) || !isSha256HexLocal(resolved.snapshot.originAccountIdHash)) {
      addCode(blockers, 'snapshot-identity-hash-malformed');
    } else if (localHash !== resolved.snapshot.originAccountIdHash) {
      addCode(blockers, 'cross-account-snapshot-identity');
    } else {
      fields.identitySafe = true;
    }

    fields.materialized = fields.canonicalized && fields.diffClassified && fields.consumedSafe && fields.identitySafe;
    return makeResult('h2o.desktop.sync.snapshot-materialization-diagnostic.v1', fields, blockers, warnings, observedAtIso);
  }

  async function runSnapshotCrossAccountIdentityCheck(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { match: false, mismatch: false, snapshotAccountIdHash: '', localAccountIdHash: '' };

    if (!isObject(input)) {
      addCode(blockers, 'snapshot-input-missing');
      return makeResult('h2o.desktop.sync.snapshot-cross-account-identity-check.v1', fields, blockers, warnings, observedAtIso);
    }
    var snapshotHash = firstString(input, [
      ['snapshotAccountIdHash'], ['originAccountIdHash'],
      ['snapshot', 'originAccountIdHash'], ['canonicalSnapshot', 'originAccountIdHash']
    ]);
    if (!snapshotHash) {
      var resolved = await resolveSnapshot(input);
      mergeCodes(blockers, resolved.gateBlockers);
      mergeCodes(warnings, resolved.gateWarnings);
      if (!resolved.snapshot) {
        return makeResult('h2o.desktop.sync.snapshot-cross-account-identity-check.v1', fields, blockers, warnings, observedAtIso);
      }
      snapshotHash = resolved.snapshot.originAccountIdHash;
    }
    var localHash = await pickLocalAccountIdHash(input);
    fields.snapshotAccountIdHash = snapshotHash;
    fields.localAccountIdHash = localHash;

    if (!localHash) addCode(blockers, 'snapshot-identity-input-missing');
    else if (!isSha256HexLocal(snapshotHash) || !isSha256HexLocal(localHash)) addCode(blockers, 'snapshot-identity-hash-malformed');
    else if (snapshotHash !== localHash) {
      fields.mismatch = true;
      addCode(blockers, 'cross-account-snapshot-identity');
    } else {
      fields.match = true;
    }
    return makeResult('h2o.desktop.sync.snapshot-cross-account-identity-check.v1', fields, blockers, warnings, observedAtIso);
  }

  function runSnapshotNativeOwnerReachabilityProbe(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { reachable: false, unreachable: false, ownerKind: '', ownerValidated: false };
    var kernel = getKernel();
    var declaration = isObject(input) ? input.ownerDeclaration : null;
    var ownerKind = '';

    if (isObject(declaration)) {
      if (kernel && typeof kernel.validateOwnerDeclaration === 'function') {
        try {
          var validation = kernel.validateOwnerDeclaration(declaration, {
            allowedOwnerKinds: ['native'],
            allowedCapabilities: ['restore', 'ownerHandoff', 'read'],
            allowedAuthorityLevels: ['strong-local-authority', 'audited-apply-authority', 'proposal-source'],
            requireActorPeer: false,
            privacyPolicy: { subjectType: SUBJECT_TYPE, redactionClass: 'redacted' }
          });
          fields.ownerValidated = !!(validation && validation.ok);
          mergeCodes(blockers, validation && validation.blockers);
          mergeCodes(warnings, validation && validation.warnings);
        } catch (_) {
          addCode(warnings, 'snapshot-owner-validation-failed');
        }
      }
      if (kernel && typeof kernel.normalizeOwnerKind === 'function') {
        try { ownerKind = cleanString(kernel.normalizeOwnerKind(declaration.ownerKind || declaration.kind)); }
        catch (_) { ownerKind = cleanString(declaration.ownerKind || declaration.kind); }
      } else {
        ownerKind = cleanString(declaration.ownerKind || declaration.kind);
      }
    } else if (isObject(input)) {
      ownerKind = cleanString(input.ownerKind);
      if (kernel && typeof kernel.normalizeOwnerKind === 'function') {
        try { ownerKind = cleanString(kernel.normalizeOwnerKind(ownerKind)) || ownerKind; } catch (_) { /* keep */ }
      }
    }

    fields.ownerKind = ownerKind;
    if (ownerKind && ownerKind !== EXPECTED_OWNER_KIND) addCode(blockers, 'snapshot-native-owner-kind-not-native');

    var status = '';
    if (isObject(input)) {
      status = cleanString(input.status);
      if (!status && isObject(input.ownerStatus)) status = cleanString(input.ownerStatus.status);
      if (!status && input.reachable === true) status = 'reachable';
      if (!status && input.reachable === false) status = 'unreachable';
    }
    if (status === 'reachable') {
      fields.reachable = true;
    } else {
      fields.unreachable = true;
      addCode(blockers, 'snapshot-native-owner-unreachable');
      if (!status) addCode(warnings, 'snapshot-native-owner-status-not-provided');
    }
    if (!kernel) addCode(warnings, 'kernel-not-installed');
    return makeResult('h2o.desktop.sync.snapshot-native-owner-reachability-probe.v1', fields, blockers, warnings, observedAtIso);
  }

  function runSnapshotMirrorStalenessProbe(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { fresh: false, stale: false, ageMs: null, freshnessWindowMs: DEFAULT_FRESHNESS_WINDOW_MS };

    if (!isObject(input)) {
      addCode(blockers, 'snapshot-input-missing');
      return makeResult('h2o.desktop.sync.snapshot-mirror-staleness-probe.v1', fields, blockers, warnings, observedAtIso);
    }

    var windowMs = typeof input.freshnessWindowMs === 'number' && input.freshnessWindowMs > 0
      ? Math.floor(input.freshnessWindowMs)
      : DEFAULT_FRESHNESS_WINDOW_MS;
    fields.freshnessWindowMs = windowMs;
    var lastSyncIso = cleanString(input.mirrorLastSyncIso || input.nativeMirrorLastSyncIso);
    if (!lastSyncIso) {
      fields.stale = true;
      addCode(blockers, 'snapshot-mirror-stale');
      addCode(warnings, 'snapshot-mirror-last-sync-iso-not-provided');
      return makeResult('h2o.desktop.sync.snapshot-mirror-staleness-probe.v1', fields, blockers, warnings, observedAtIso);
    }

    var referenceIso = cleanString(input.referenceIso || input.observedAtIso);
    if (!referenceIso && isObject(input.snapshot)) referenceIso = cleanString(input.snapshot.capturedAtIso);
    var lastSyncMs = isoMs(lastSyncIso);
    var referenceMs = referenceIso ? isoMs(referenceIso) : nowMs();
    if (!isFinite(lastSyncMs)) {
      fields.stale = true;
      addCode(blockers, 'snapshot-mirror-stale');
      addCode(warnings, 'snapshot-mirror-last-sync-iso-malformed');
      return makeResult('h2o.desktop.sync.snapshot-mirror-staleness-probe.v1', fields, blockers, warnings, observedAtIso);
    }
    if (!isFinite(referenceMs)) referenceMs = nowMs();
    var ageMs = Math.max(0, referenceMs - lastSyncMs);
    fields.ageMs = ageMs;
    if (ageMs <= windowMs) fields.fresh = true;
    else {
      fields.stale = true;
      addCode(blockers, 'snapshot-mirror-stale');
    }
    return makeResult('h2o.desktop.sync.snapshot-mirror-staleness-probe.v1', fields, blockers, warnings, observedAtIso);
  }

  async function runSnapshotTombstoneCheck(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { present: false, absent: false, recordIds: [], canonicalTombstoned: false };

    if (!isObject(input)) {
      addCode(blockers, 'snapshot-input-missing');
      return makeResult('h2o.desktop.sync.snapshot-tombstone-check.v1', fields, blockers, warnings, observedAtIso);
    }
    var subjectId = cleanString(input.subjectId);
    var snapshot = null;
    if (!subjectId || !isObject(input.snapshot)) {
      var resolved = await resolveSnapshot(input);
      mergeCodes(blockers, resolved.gateBlockers);
      mergeCodes(warnings, resolved.gateWarnings);
      if (resolved.snapshot) snapshot = resolved.snapshot;
      if (!subjectId && snapshot) subjectId = snapshot.subjectId;
    } else {
      snapshot = input.snapshot;
    }
    if (snapshot && snapshot.tombstoned === true) {
      fields.present = true;
      fields.canonicalTombstoned = true;
      addCode(blockers, 'snapshot-tombstone-present');
    }
    if (!subjectId) {
      addCode(blockers, 'snapshot-subject-id-missing');
      return makeResult('h2o.desktop.sync.snapshot-tombstone-check.v1', fields, blockers, warnings, observedAtIso);
    }

    var log = Array.isArray(input.tombstoneLog) ? input.tombstoneLog : null;
    var kernel = getKernel();
    if (!log) {
      if (!fields.present) fields.absent = true;
      addCode(warnings, 'snapshot-tombstone-log-not-provided');
      return makeResult('h2o.desktop.sync.snapshot-tombstone-check.v1', fields, blockers, warnings, observedAtIso);
    }
    var hits = [];
    for (var i = 0; i < log.length; i++) {
      var row = log[i];
      if (!isObject(row)) continue;
      var tombstone = row;
      if (kernel && typeof kernel.shapeTombstone === 'function') {
        try { tombstone = kernel.shapeTombstone(row) || row; } catch (_) { tombstone = row; }
      }
      var matches = tombstone.subjectId === subjectId ||
        (tombstone.recordKind === 'snapshot' && tombstone.recordId === subjectId) ||
        (tombstone.recordKind === SUBJECT_TYPE && tombstone.subjectId === subjectId);
      if (!matches) continue;
      var tombstoned = true;
      if (kernel && typeof kernel.isTombstoned === 'function') {
        try { tombstoned = !!kernel.isTombstoned(tombstone); } catch (_) { tombstoned = true; }
      } else if (tombstone.restoredAt) {
        tombstoned = false;
      } else if (!tombstone.deletedAt && !tombstone.tombstoneId) {
        tombstoned = false;
      }
      if (tombstoned) {
        hits.push(cleanString(tombstone.tombstoneId || tombstone.recordId || tombstone.id) || 'unknown');
      }
    }
    if (hits.length > 0) {
      fields.present = true;
      fields.recordIds = hits;
      addCode(blockers, 'snapshot-tombstone-present');
    } else if (!fields.present) {
      fields.absent = true;
    }
    return makeResult('h2o.desktop.sync.snapshot-tombstone-check.v1', fields, blockers, warnings, observedAtIso);
  }

  function combinedForbiddenList() {
    var kernel = getKernel();
    var base = (kernel && typeof kernel.defaultForeverNoFields === 'function')
      ? kernel.defaultForeverNoFields()
      : ['content', 'body', 'text', 'messages', 'attachments', 'url', 'path', 'password', 'apiKey'];
    return base.concat(SNAPSHOT_FORBIDDEN_EXTRA);
  }

  function findForbiddenInternal(value, forbiddenList, hits) {
    if (value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) findForbiddenInternal(value[i], forbiddenList, hits);
      return;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (forbiddenList.indexOf(key) !== -1) hits.push(key);
      else if (/token$/i.test(key) && key !== 'previewToken') hits.push(key);
      findForbiddenInternal(value[key], forbiddenList, hits);
    }
  }

  function hitNamesFromScan(scan) {
    var out = [];
    var hits = Array.isArray(scan && scan.forbiddenFields)
      ? scan.forbiddenFields
      : (Array.isArray(scan && scan.hits) ? scan.hits : []);
    for (var i = 0; i < hits.length; i++) {
      var hit = hits[i];
      var name = isObject(hit) ? cleanString(hit.fieldName || hit.fieldPath) : cleanString(hit);
      if (name && out.indexOf(name) === -1) out.push(name);
    }
    return out;
  }

  function runSnapshotForbiddenFieldScan(target) {
    var observedAtIso = nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { hits: [] };
    var kernel = getKernel();
    var hits = [];

    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var domainScan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, target);
        hitNamesFromScan(domainScan).forEach(function (name) {
          if (hits.indexOf(name) === -1) hits.push(name);
        });
        mergeCodes(warnings, domainScan && domainScan.warnings);
      } catch (_) { /* fall through */ }
    }
    if (kernel && typeof kernel.findForbiddenFields === 'function') {
      try {
        var list = combinedForbiddenList();
        var kernelHits = kernel.findForbiddenFields(target, {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted'],
          forbiddenList: list,
          foreverNoFields: list
        });
        hitNamesFromScan({ forbiddenFields: kernelHits }).forEach(function (name) {
          if (hits.indexOf(name) === -1) hits.push(name);
        });
      } catch (_) { /* fall through */ }
    }
    var local = [];
    findForbiddenInternal(target, combinedForbiddenList(), local);
    local.forEach(function (name) {
      if (hits.indexOf(name) === -1) hits.push(name);
    });
    fields.hits = hits;
    if (hits.length > 0) {
      addCode(blockers, 'snapshot-preflight-output-contains-forbidden-field');
      for (var i = 0; i < Math.min(hits.length, 8); i++) {
        addCode(blockers, 'forbidden-field:' + hits[i]);
      }
    }
    if (!kernel) addCode(warnings, 'kernel-not-installed');
    return makeResult('h2o.desktop.sync.snapshot-forbidden-field-scan.v1', fields, blockers, warnings, observedAtIso);
  }

  async function runSnapshotRetentionWindowCheck(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { retentionKnown: false, retentionActive: false, retentionExpired: false, retentionExpiresAtIso: null };

    if (!isObject(input)) {
      addCode(blockers, 'snapshot-input-missing');
      return makeResult('h2o.desktop.sync.snapshot-retention-window-check.v1', fields, blockers, warnings, observedAtIso);
    }
    var expiry = cleanString(input.retentionExpiresAtIso || input.retentionExpiresAt || input.expiresAt);
    if (!expiry && isObject(input.snapshot)) expiry = cleanString(input.snapshot.retentionExpiresAtIso);
    if (!expiry) {
      var resolved = await resolveSnapshot(input);
      mergeCodes(blockers, resolved.gateBlockers);
      mergeCodes(warnings, resolved.gateWarnings);
      if (resolved.snapshot) expiry = cleanString(resolved.snapshot.retentionExpiresAtIso);
    }
    fields.retentionExpiresAtIso = expiry || null;
    if (!expiry) {
      fields.retentionKnown = false;
      fields.retentionActive = true;
      addCode(warnings, 'snapshot-retention-expiry-not-provided');
      return makeResult('h2o.desktop.sync.snapshot-retention-window-check.v1', fields, blockers, warnings, observedAtIso);
    }
    var expiryMs = isoMs(expiry);
    var refMs = isoMs(cleanString(input.referenceIso)) || isoMs(observedAtIso);
    if (!isFinite(expiryMs)) {
      addCode(blockers, 'snapshot-retention-expiry-malformed');
    } else {
      fields.retentionKnown = true;
      if (expiryMs <= refMs) {
        fields.retentionExpired = true;
        addCode(blockers, 'snapshot-retention-expired');
      } else {
        fields.retentionActive = true;
      }
    }
    return makeResult('h2o.desktop.sync.snapshot-retention-window-check.v1', fields, blockers, warnings, observedAtIso);
  }

  function runSnapshotContentIntegrityProbe(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { contentAvailable: false, digestPresent: false, integrityVerified: false, contentDigest: '' };

    if (!isObject(input)) {
      addCode(blockers, 'snapshot-input-missing');
      return makeResult('h2o.desktop.sync.snapshot-content-integrity-probe.v1', fields, blockers, warnings, observedAtIso);
    }
    var privacy = runSnapshotForbiddenFieldScan(input);
    if (!privacy.ok) {
      mergeCodes(blockers, privacy.blockers);
      mergeCodes(warnings, privacy.warnings);
      return makeResult('h2o.desktop.sync.snapshot-content-integrity-probe.v1', fields, blockers, warnings, observedAtIso);
    }

    var available = firstBoolean(input, [
      ['contentAvailable'], ['contentPresent'], ['snapshotContentAvailable'],
      ['nativeContentAvailable'], ['archiveBlobAvailable']
    ]);
    fields.contentAvailable = available === true;
    if (available !== true) addCode(blockers, 'snapshot-content-missing');

    var digest = firstString(input, [
      ['contentDigest'], ['contentHash'], ['snapshotContentDigest'],
      ['bodyDigest'], ['payloadHash'], ['expectedContentDigest']
    ]);
    var expected = firstString(input, [['expectedContentDigest'], ['expectedContentHash']]);
    fields.contentDigest = digest;
    fields.digestPresent = !!digest;
    if (!digest) addCode(blockers, 'snapshot-content-digest-missing');
    else if (!isSha256HexLocal(digest)) addCode(blockers, 'snapshot-content-digest-invalid');
    if (expected && digest && expected !== digest) addCode(blockers, 'snapshot-content-integrity-mismatch');
    if (fields.contentAvailable && fields.digestPresent && isSha256HexLocal(digest) && (!expected || expected === digest)) {
      fields.integrityVerified = true;
    }
    return makeResult('h2o.desktop.sync.snapshot-content-integrity-probe.v1', fields, blockers, warnings, observedAtIso);
  }

  function transitionAllowed(fromState, toState) {
    if (!fromState || !toState) return false;
    var allowed = SNAPSHOT_TRANSITIONS[fromState] || [];
    return allowed.indexOf(toState) !== -1;
  }

  async function runSnapshotLifecycleTransitionAllowed(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { allowed: false, fromState: '', toState: '', lifecycleValidation: null };

    if (!isObject(input)) {
      addCode(blockers, 'snapshot-input-missing');
      return makeResult('h2o.desktop.sync.snapshot-lifecycle-transition-allowed.v1', fields, blockers, warnings, observedAtIso);
    }
    var fromState = cleanString(input.fromState || input.currentLifecycleState || input.lifecycleState);
    if (!fromState && isObject(input.snapshot)) fromState = cleanString(input.snapshot.lifecycleState);
    if (!fromState) {
      var resolved = await resolveSnapshot(input);
      mergeCodes(blockers, resolved.gateBlockers);
      mergeCodes(warnings, resolved.gateWarnings);
      if (resolved.snapshot) fromState = cleanString(resolved.snapshot.lifecycleState);
    }
    var toState = cleanString(input.toState || input.targetLifecycleState || input.nextLifecycleState);
    fields.fromState = fromState;
    fields.toState = toState;

    var kernel = getKernel();
    if (kernel && typeof kernel.validateLifecycleTransition === 'function') {
      try {
        var validation = kernel.validateLifecycleTransition({
          domain: 'snapshot',
          subjectType: SUBJECT_TYPE,
          subjectId: cleanString(input.subjectId || (input.snapshot && input.snapshot.subjectId)),
          fromState: fromState,
          toState: toState,
          transitionedAtIso: observedAtIso
        }, {
          domain: 'snapshot',
          allowedStates: SNAPSHOT_ALLOWED_STATES,
          orderedStates: SNAPSHOT_ALLOWED_STATES,
          allowedTransitions: SNAPSHOT_TRANSITIONS,
          allowSelfTransition: true,
          requireTransitionRule: true,
          enforceNoSkippedState: false,
          requireSubject: false,
          requireTimestamps: false,
          privacyPolicy: { subjectType: SUBJECT_TYPE, redactionClass: 'redacted' }
        });
        fields.lifecycleValidation = validation || null;
        mergeCodes(warnings, validation && validation.warnings);
      } catch (_) {
        addCode(warnings, 'snapshot-lifecycle-kernel-validation-failed');
      }
    }

    if (SNAPSHOT_ALLOWED_STATES.indexOf(fromState) === -1) addCode(blockers, 'snapshot-lifecycle-from-state-invalid');
    if (SNAPSHOT_ALLOWED_STATES.indexOf(toState) === -1) addCode(blockers, 'snapshot-lifecycle-to-state-invalid');
    if (!transitionAllowed(fromState, toState)) addCode(blockers, 'snapshot-lifecycle-transition-not-allowed');
    fields.allowed = blockers.length === 0;
    return makeResult('h2o.desktop.sync.snapshot-lifecycle-transition-allowed.v1', fields, blockers, warnings, observedAtIso);
  }

  H2O.Desktop.Sync.runSnapshotMaterializationDiagnostic = runSnapshotMaterializationDiagnostic;
  H2O.Desktop.Sync.runSnapshotCrossAccountIdentityCheck = runSnapshotCrossAccountIdentityCheck;
  H2O.Desktop.Sync.runSnapshotNativeOwnerReachabilityProbe = runSnapshotNativeOwnerReachabilityProbe;
  H2O.Desktop.Sync.runSnapshotMirrorStalenessProbe = runSnapshotMirrorStalenessProbe;
  H2O.Desktop.Sync.runSnapshotTombstoneCheck = runSnapshotTombstoneCheck;
  H2O.Desktop.Sync.runSnapshotForbiddenFieldScan = runSnapshotForbiddenFieldScan;
  H2O.Desktop.Sync.runSnapshotRetentionWindowCheck = runSnapshotRetentionWindowCheck;
  H2O.Desktop.Sync.runSnapshotContentIntegrityProbe = runSnapshotContentIntegrityProbe;
  H2O.Desktop.Sync.runSnapshotLifecycleTransitionAllowed = runSnapshotLifecycleTransitionAllowed;
  H2O.Desktop.Sync.__snapshotDiagnosticsInstalled = true;
  H2O.Desktop.Sync.__snapshotDiagnosticsVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
