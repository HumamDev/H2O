/* H2O Desktop Sync - F14.3.2 read-only chat diagnostics
 *
 * Six read-only diagnostic primitives over the F14.3.0 canonical chat
 * model. Each is a pure function that reports observed state + blockers /
 * warnings using the kernel result shape. No diagnostic writes storage,
 * mutates a mirror, generates a proposal, publishes, applies, executes an
 * owner handoff, advances any watermark, or writes the consumed-op log.
 *
 * Public API:
 *   H2O.Desktop.Sync.runChatMaterializationDiagnostic(input)  -> Promise<result>
 *   H2O.Desktop.Sync.runCrossAccountIdentityCheck(input)      -> Promise<result>
 *   H2O.Desktop.Sync.runNativeOwnerReachabilityProbe(input?)  -> result
 *   H2O.Desktop.Sync.runMirrorStalenessProbe(input)           -> result
 *   H2O.Desktop.Sync.runChatTombstoneCheck(input)             -> Promise<result>
 *   H2O.Desktop.Sync.runChatForbiddenFieldScan(target)        -> result
 *
 *   H2O.Desktop.Sync.__chatDiagnosticsInstalled
 *   H2O.Desktop.Sync.__chatDiagnosticsVersion
 *
 * Kernel adoption:
 *   identity-kit (sha256Hex / isSha256Hex / canonicalJSON)
 *   privacy-scan (scanDomainForbiddenFields / defaultForeverNoFields)
 *   blockers + result-shape (createBlocker / addBlocker / createResult helpers)
 *   lifecycle-framework (shapeLifecycleState — labelling only)
 *   consumed-op primitive (validateReplayCandidate / assistConsumedSafe)
 *   tombstone-reader (isTombstoned / tombstoneStatus / shapeTombstone)
 *   owner-handoff (normalizeOwnerKind / validateOwnerDeclaration —
 *                  validation only; no handoff execution)
 *
 * Each diagnostic returns a result envelope with:
 *   { schema, version, ok, ...domain-specific flags..., blockers, warnings,
 *     observedAtIso }
 *
 * Blocker codes raised by these diagnostics:
 *   - cross-account-chat-identity
 *   - native-owner-unreachable
 *   - mirror-stale
 *   - f5-blocker-present
 *   - chat-preflight-output-contains-forbidden-field
 *   - chat-canonicalizer-unavailable
 *   - chat-input-not-object / chat-input-missing
 *   - identity-input-missing
 *   - identity-hash-malformed
 *   - native-owner-declaration-invalid
 *   - native-owner-kind-not-native
 *   - native-owner-status-not-provided     (warning)
 *   - consumed-op-log-not-provided          (warning)
 *   - tombstone-log-not-provided            (warning)
 *   - kernel-not-installed                  (warning)
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
  if (H2O.Desktop.Sync.__chatDiagnosticsInstalled) return;

  var VERSION = '0.1.0-f14.3.2';
  var DEFAULT_FRESHNESS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  var SUBJECT_TYPE = 'chat.metadata';
  var EXPECTED_OWNER_KIND = 'native';

  // ── Tiny helpers (kept local to avoid kernel-version coupling) ──────
  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  function nowMs() { return Date.now(); }
  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanString(value) {
    return typeof value === 'string' ? value : '';
  }
  function getKernel() {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    return sync.kernel || null;
  }
  function getCanonicalizer() {
    var sync = (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
    return (typeof sync.canonicalizeChatMetadata === 'function')
      ? sync.canonicalizeChatMetadata
      : null;
  }

  // ── Blocker / warning helpers (kernel-first, internal fallback) ────
  function addCode(list, code) {
    var normalized = cleanString(code).trim();
    if (!normalized) return;
    var kernel = getKernel();
    if (kernel && typeof kernel.addBlocker === 'function' && list && list.__listKind === 'blocker') {
      try { kernel.addBlocker(list, normalized); return; }
      catch (_) { /* fall through */ }
    }
    if (kernel && typeof kernel.addWarning === 'function' && list && list.__listKind === 'warning') {
      try { kernel.addWarning(list, normalized); return; }
      catch (_) { /* fall through */ }
    }
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }
  function makeBlockerList() {
    var l = [];
    Object.defineProperty(l, '__listKind', { value: 'blocker', enumerable: false });
    return l;
  }
  function makeWarningList() {
    var l = [];
    Object.defineProperty(l, '__listKind', { value: 'warning', enumerable: false });
    return l;
  }
  function mergeCodes(into, from) {
    if (!Array.isArray(from)) return;
    for (var i = 0; i < from.length; i++) {
      var entry = from[i];
      if (entry && typeof entry === 'object' && typeof entry.code === 'string') {
        addCode(into, entry.code);
      } else if (typeof entry === 'string') {
        addCode(into, entry);
      }
    }
  }

  // Result envelope (schema-stable). Kernel result helpers, when present,
  // are used to compute ok and to normalize blocker/warning shapes; the
  // diagnostic-specific fields are added to the same envelope.
  function makeResult(schema, fields, blockers, warnings, observedAtIso) {
    var kernel = getKernel();
    var bList = blockers || [];
    var wList = warnings || [];
    var ok;
    if (kernel && typeof kernel.calculateOk === 'function') {
      try { ok = !!kernel.calculateOk({ blockers: bList }); }
      catch (_) { ok = bList.length === 0; }
    } else {
      ok = bList.length === 0;
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
      var keys = Object.keys(fields);
      for (var i = 0; i < keys.length; i++) out[keys[i]] = fields[keys[i]];
    }
    if (kernel && typeof kernel.shapeLifecycleState === 'function' && isObject(fields) && fields.lifecycle) {
      try { out.lifecycle = kernel.shapeLifecycleState(fields.lifecycle) || fields.lifecycle; }
      catch (_) { /* keep raw */ }
    }
    return out;
  }

  function isSha256HexLocal(s) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(s); } catch (_) { /* fall through */ }
    }
    return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
  }

  // ── Internal: build (or accept) a canonical snapshot ─────────────────
  // The materialization diagnostic and several others can accept either
  // a raw chat input (which we canonicalize) or an already-canonicalized
  // snapshot. This helper normalizes both into:
  //   { snapshot, canonResult, blockers (from canonicalizer), warnings }
  async function resolveSnapshot(input) {
    if (!isObject(input)) {
      return { snapshot: null, canonResult: null, gateBlockers: ['chat-input-not-object'], gateWarnings: [] };
    }
    if (isObject(input.snapshot) && input.snapshot.subjectType === SUBJECT_TYPE) {
      return { snapshot: input.snapshot, canonResult: null, gateBlockers: [], gateWarnings: [] };
    }
    var canon = getCanonicalizer();
    if (!canon) {
      return { snapshot: null, canonResult: null, gateBlockers: ['chat-canonicalizer-unavailable'], gateWarnings: [] };
    }
    var result;
    try {
      result = await canon(input);
    } catch (_) {
      return { snapshot: null, canonResult: null, gateBlockers: ['chat-canonicalizer-threw'], gateWarnings: [] };
    }
    if (!result || result.quarantined || !result.snapshot) {
      var reason = (result && result.quarantineReason) || 'canonicalization-failed';
      var copied = [];
      copied.push(reason);
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

  // ─── 1. Materialization diagnostic ───────────────────────────────────
  async function runChatMaterializationDiagnostic(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
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
      snapshot: null,
      lifecycle: { domain: 'chat.metadata', state: 'detected' }
    };

    if (!isObject(input)) {
      addCode(blockers, 'chat-input-missing');
      return makeResult('h2o.desktop.sync.chat-materialization-diagnostic.v1', fields, blockers, warnings, observedAtIso);
    }
    fields.observed = true;
    fields.lifecycle = { domain: 'chat.metadata', state: 'observed' };

    // ── Canonicalize (or accept supplied snapshot)
    var resolved = await resolveSnapshot(input);
    if (resolved.gateBlockers.length > 0) {
      for (var i = 0; i < resolved.gateBlockers.length; i++) addCode(blockers, resolved.gateBlockers[i]);
      for (var j = 0; j < resolved.gateWarnings.length; j++) addCode(warnings, resolved.gateWarnings[j]);
      return makeResult('h2o.desktop.sync.chat-materialization-diagnostic.v1', fields, blockers, warnings, observedAtIso);
    }
    fields.snapshot = resolved.snapshot;
    fields.canonicalized = true;
    fields.lifecycle = { domain: 'chat.metadata', state: 'canonicalized' };

    // ── diffClassified: enough information to bucket the diff
    if (isSha256HexLocal(resolved.snapshot.subjectId)
        && isSha256HexLocal(resolved.snapshot.revisionHash)
        && isSha256HexLocal(resolved.snapshot.originAccountIdHash)) {
      fields.diffClassified = true;
      fields.lifecycle = { domain: 'chat.metadata', state: 'diff-classified' };
    } else {
      addCode(warnings, 'diff-classification-prerequisites-incomplete');
    }

    // ── consumedSafe via kernel.assistConsumedSafe / validateReplayCandidate
    var kernel = getKernel();
    var consumedLog = (isObject(input) && Array.isArray(input.consumedOperationsLog))
      ? input.consumedOperationsLog
      : null;
    if (!consumedLog) {
      addCode(warnings, 'consumed-op-log-not-provided');
      fields.consumedSafe = true; // best-effort: assume safe when no log to oppose
    } else if (kernel && typeof kernel.assistConsumedSafe === 'function') {
      try {
        var helper = kernel.assistConsumedSafe({
          subjectId: resolved.snapshot.subjectId,
          revisionHash: resolved.snapshot.revisionHash,
          log: consumedLog
        });
        fields.consumedSafe = !!(helper && helper.safe);
        if (helper && Array.isArray(helper.warnings)) {
          for (var aw = 0; aw < helper.warnings.length; aw++) {
            addCode(warnings, helper.warnings[aw] && helper.warnings[aw].code ? helper.warnings[aw].code : helper.warnings[aw]);
          }
        }
      } catch (_) {
        fields.consumedSafe = internalConsumedSafeCheck(resolved.snapshot, consumedLog);
      }
    } else {
      fields.consumedSafe = internalConsumedSafeCheck(resolved.snapshot, consumedLog);
    }
    if (!fields.consumedSafe) addCode(blockers, 'consumed-operation-not-safe');

    // ── identitySafe: account match if caller provided a local-account hash
    var localHash = pickLocalAccountIdHash(input);
    if (!localHash) {
      addCode(warnings, 'local-account-id-hash-not-provided');
      fields.identitySafe = true; // best-effort: cannot disprove identity without it
    } else {
      var snapshotHash = cleanString(resolved.snapshot.originAccountIdHash);
      if (!isSha256HexLocal(localHash) || !isSha256HexLocal(snapshotHash)) {
        addCode(blockers, 'identity-hash-malformed');
        fields.identitySafe = false;
      } else if (snapshotHash !== localHash) {
        addCode(blockers, 'cross-account-chat-identity');
        fields.identitySafe = false;
      } else {
        fields.identitySafe = true;
      }
    }

    return makeResult('h2o.desktop.sync.chat-materialization-diagnostic.v1', fields, blockers, warnings, observedAtIso);
  }

  function internalConsumedSafeCheck(snapshot, log) {
    if (!Array.isArray(log) || !snapshot) return true;
    for (var i = 0; i < log.length; i++) {
      var entry = log[i];
      if (!isObject(entry)) continue;
      if (entry.subjectId === snapshot.subjectId
          && entry.revisionHash === snapshot.revisionHash) {
        return false;
      }
    }
    return true;
  }

  function pickLocalAccountIdHash(input) {
    if (!isObject(input)) return '';
    if (typeof input.localAccountIdHash === 'string') return input.localAccountIdHash;
    if (typeof input.deviceAccountIdHash === 'string') return input.deviceAccountIdHash;
    if (isObject(input.localAccount)) {
      if (typeof input.localAccount.accountIdHash === 'string') return input.localAccount.accountIdHash;
      if (typeof input.localAccount.idHash === 'string') return input.localAccount.idHash;
    }
    return '';
  }

  // ─── 2. Cross-account identity check ─────────────────────────────────
  async function runCrossAccountIdentityCheck(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { match: false, mismatch: false };

    if (!isObject(input)) {
      addCode(blockers, 'chat-input-missing');
      return makeResult('h2o.desktop.sync.chat-cross-account-identity-check.v1', fields, blockers, warnings, observedAtIso);
    }

    // Snapshot side
    var snapshotHash;
    if (isObject(input.snapshot) && typeof input.snapshot.originAccountIdHash === 'string') {
      snapshotHash = input.snapshot.originAccountIdHash;
    } else if (typeof input.snapshotAccountIdHash === 'string') {
      snapshotHash = input.snapshotAccountIdHash;
    } else if (typeof input.originAccountIdHash === 'string') {
      snapshotHash = input.originAccountIdHash;
    } else {
      // Best-effort: canonicalize input to obtain a snapshot
      var resolved = await resolveSnapshot(input);
      if (resolved.gateBlockers.length > 0) {
        for (var b = 0; b < resolved.gateBlockers.length; b++) addCode(blockers, resolved.gateBlockers[b]);
        for (var w = 0; w < resolved.gateWarnings.length; w++) addCode(warnings, resolved.gateWarnings[w]);
        return makeResult('h2o.desktop.sync.chat-cross-account-identity-check.v1', fields, blockers, warnings, observedAtIso);
      }
      snapshotHash = resolved.snapshot.originAccountIdHash;
    }

    // Local side
    var localHash = pickLocalAccountIdHash(input);
    if (!localHash) {
      addCode(blockers, 'identity-input-missing');
      return makeResult('h2o.desktop.sync.chat-cross-account-identity-check.v1', fields, blockers, warnings, observedAtIso);
    }

    if (!isSha256HexLocal(snapshotHash) || !isSha256HexLocal(localHash)) {
      addCode(blockers, 'identity-hash-malformed');
      return makeResult('h2o.desktop.sync.chat-cross-account-identity-check.v1', fields, blockers, warnings, observedAtIso);
    }

    if (snapshotHash === localHash) {
      fields.match = true;
    } else {
      fields.mismatch = true;
      addCode(blockers, 'cross-account-chat-identity');
    }

    return makeResult('h2o.desktop.sync.chat-cross-account-identity-check.v1', fields, blockers, warnings, observedAtIso);
  }

  // ─── 3. Native owner reachability probe ──────────────────────────────
  function runNativeOwnerReachabilityProbe(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { reachable: false, unreachable: false };

    var declaration = isObject(input) ? input.ownerDeclaration : null;
    var kernel = getKernel();
    var ownerKind = '';

    if (isObject(declaration)) {
      if (kernel && typeof kernel.validateOwnerDeclaration === 'function') {
        try {
          var v = kernel.validateOwnerDeclaration(declaration);
          if (v && v.ok === false) {
            addCode(blockers, 'native-owner-declaration-invalid');
            mergeCodes(blockers, v.blockers);
            mergeCodes(warnings, v.warnings);
          }
        } catch (_) {
          addCode(warnings, 'kernel-owner-validation-failed');
        }
      }
      if (kernel && typeof kernel.normalizeOwnerKind === 'function') {
        try { ownerKind = cleanString(kernel.normalizeOwnerKind(declaration.ownerKind)); }
        catch (_) { ownerKind = cleanString(declaration.ownerKind); }
      } else {
        ownerKind = cleanString(declaration.ownerKind);
      }
      if (ownerKind && ownerKind !== EXPECTED_OWNER_KIND) {
        addCode(blockers, 'native-owner-kind-not-native');
      }
    } else if (isObject(input) && typeof input.ownerKind === 'string') {
      ownerKind = input.ownerKind === EXPECTED_OWNER_KIND ? EXPECTED_OWNER_KIND : input.ownerKind;
      if (ownerKind && ownerKind !== EXPECTED_OWNER_KIND) {
        addCode(blockers, 'native-owner-kind-not-native');
      }
    }

    // Status: caller may supply a runtime-derived reachability hint.
    // We never probe ChatGPT.com from the diagnostic itself (no network).
    var statusHint = isObject(input) ? cleanString(input.status) : '';
    if (statusHint === 'reachable') {
      fields.reachable = true;
    } else if (statusHint === 'unreachable') {
      fields.unreachable = true;
      addCode(blockers, 'native-owner-unreachable');
    } else {
      addCode(warnings, 'native-owner-status-not-provided');
      fields.unreachable = true;
      addCode(blockers, 'native-owner-unreachable');
    }

    if (!kernel) addCode(warnings, 'kernel-not-installed');
    return makeResult('h2o.desktop.sync.chat-native-owner-reachability-probe.v1', fields, blockers, warnings, observedAtIso);
  }

  // ─── 4. Mirror staleness probe ───────────────────────────────────────
  function runMirrorStalenessProbe(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { fresh: false, stale: false, ageMs: null, freshnessWindowMs: DEFAULT_FRESHNESS_WINDOW_MS };

    if (!isObject(input)) {
      addCode(blockers, 'chat-input-missing');
      return makeResult('h2o.desktop.sync.chat-mirror-staleness-probe.v1', fields, blockers, warnings, observedAtIso);
    }

    var windowMs = (typeof input.freshnessWindowMs === 'number' && input.freshnessWindowMs > 0)
      ? Math.floor(input.freshnessWindowMs)
      : DEFAULT_FRESHNESS_WINDOW_MS;
    fields.freshnessWindowMs = windowMs;

    var lastSyncIso = cleanString(input.mirrorLastSyncIso);
    var snapshotIso = cleanString(input.observedAtIso);
    if (isObject(input.snapshot) && !snapshotIso && typeof input.snapshot.observedAtIso === 'string') {
      snapshotIso = input.snapshot.observedAtIso;
    }
    if (!lastSyncIso) {
      addCode(blockers, 'mirror-stale');
      addCode(warnings, 'mirror-last-sync-iso-not-provided');
      fields.stale = true;
      return makeResult('h2o.desktop.sync.chat-mirror-staleness-probe.v1', fields, blockers, warnings, observedAtIso);
    }

    var lastSyncMs = Date.parse(lastSyncIso);
    var referenceMs;
    if (snapshotIso) {
      var parsedSnap = Date.parse(snapshotIso);
      referenceMs = isFinite(parsedSnap) ? parsedSnap : nowMs();
    } else {
      referenceMs = nowMs();
    }
    if (!isFinite(lastSyncMs)) {
      addCode(blockers, 'mirror-stale');
      addCode(warnings, 'mirror-last-sync-iso-malformed');
      fields.stale = true;
      return makeResult('h2o.desktop.sync.chat-mirror-staleness-probe.v1', fields, blockers, warnings, observedAtIso);
    }

    var ageMs = referenceMs - lastSyncMs;
    if (ageMs < 0) ageMs = 0;
    fields.ageMs = ageMs;
    if (ageMs <= windowMs) {
      fields.fresh = true;
    } else {
      fields.stale = true;
      addCode(blockers, 'mirror-stale');
    }
    return makeResult('h2o.desktop.sync.chat-mirror-staleness-probe.v1', fields, blockers, warnings, observedAtIso);
  }

  // ─── 5. Chat tombstone check ─────────────────────────────────────────
  async function runChatTombstoneCheck(input) {
    var observedAtIso = (isObject(input) && typeof input.observedAtIso === 'string')
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { present: false, absent: false, recordIds: [] };

    if (!isObject(input)) {
      addCode(blockers, 'chat-input-missing');
      return makeResult('h2o.desktop.sync.chat-tombstone-check.v1', fields, blockers, warnings, observedAtIso);
    }

    var subjectId = '';
    if (typeof input.subjectId === 'string') subjectId = input.subjectId;
    else if (isObject(input.snapshot) && typeof input.snapshot.subjectId === 'string') subjectId = input.snapshot.subjectId;
    if (!subjectId) {
      // Best-effort canonicalize for a snapshot if not provided directly
      var resolved = await resolveSnapshot(input);
      if (resolved.gateBlockers.length > 0) {
        for (var i = 0; i < resolved.gateBlockers.length; i++) addCode(blockers, resolved.gateBlockers[i]);
        for (var j = 0; j < resolved.gateWarnings.length; j++) addCode(warnings, resolved.gateWarnings[j]);
        return makeResult('h2o.desktop.sync.chat-tombstone-check.v1', fields, blockers, warnings, observedAtIso);
      }
      subjectId = resolved.snapshot.subjectId;
    }

    var log = Array.isArray(input.tombstoneLog) ? input.tombstoneLog : null;
    var kernel = getKernel();

    if (!log) {
      addCode(warnings, 'tombstone-log-not-provided');
      // No log => treat as absent (best-effort honest default).
      fields.absent = true;
      return makeResult('h2o.desktop.sync.chat-tombstone-check.v1', fields, blockers, warnings, observedAtIso);
    }

    var hits = [];
    for (var t = 0; t < log.length; t++) {
      var entry = log[t];
      if (!isObject(entry)) continue;
      // Kernel-first: shape + validate the candidate tombstone
      var tombstone = entry;
      if (kernel && typeof kernel.shapeTombstone === 'function') {
        try { tombstone = kernel.shapeTombstone(entry) || entry; }
        catch (_) { tombstone = entry; }
      }
      var matches = false;
      if (typeof tombstone.subjectId === 'string' && tombstone.subjectId === subjectId) matches = true;
      if (!matches && typeof tombstone.recordKind === 'string'
          && tombstone.recordKind === 'chat'
          && typeof tombstone.subjectIdHash === 'string'
          && tombstone.subjectIdHash === subjectId) {
        matches = true;
      }
      if (matches) {
        if (kernel && typeof kernel.isTombstoned === 'function') {
          try {
            if (!kernel.isTombstoned(tombstone)) continue;
          } catch (_) { /* fall through */ }
        }
        var recId = cleanString(tombstone.recordId) || cleanString(tombstone.id);
        if (recId) hits.push(recId);
      }
    }

    if (hits.length > 0) {
      fields.present = true;
      fields.recordIds = hits;
      addCode(blockers, 'f5-blocker-present');
    } else {
      fields.absent = true;
    }
    return makeResult('h2o.desktop.sync.chat-tombstone-check.v1', fields, blockers, warnings, observedAtIso);
  }

  // ─── 6. Forbidden-field output scan ──────────────────────────────────
  // The chat-extended forever-no list must be applied on top of the
  // kernel's default list. The privacy scanner is preferred; an internal
  // recursive scan is the fallback path.
  var CHAT_FORBIDDEN_EXTRA = [
    'messages', 'message_array', 'conversation', 'text', 'content', 'body',
    'excerpts', 'snippets',
    'attachments', 'files', 'file_ids', 'image_urls', 'audio_urls',
    'system_prompt', 'instructions', 'custom_instructions', 'seed_prompt',
    'tool_calls', 'function_calls', 'plugins',
    'model', 'model_slug', 'model_version',
    'participants', 'share_token', 'share_url', 'sharing', 'visibility',
    'public_flag', 'url', 'path', 'cookies', 'session_token', 'sessionToken',
    'user_agent', 'userAgent', 'ip', 'IP', 'ipAddress', 'ip_address',
    'name', 'title', 'chatTitle', 'rawTitle', 'proposedTitle',
    'rawId', 'chatId', 'chat_id',
    'accountId', 'account_id', 'rawAccountId',
    'userId', 'user_id', 'rawUserId',
    'messageId', 'message_id', 'rawMessageId'
  ];

  function combinedForbiddenList() {
    var kernel = getKernel();
    var base = (kernel && typeof kernel.defaultForeverNoFields === 'function')
      ? kernel.defaultForeverNoFields()
      : ['content', 'body', 'text', 'messages', 'attachments', 'url', 'path', 'password', 'apiKey'];
    return base.concat(CHAT_FORBIDDEN_EXTRA);
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

  function runChatForbiddenFieldScan(target) {
    var observedAtIso = nowIsoSeconds();
    var blockers = makeBlockerList();
    var warnings = makeWarningList();
    var fields = { hits: [] };

    var list = combinedForbiddenList();
    var kernel = getKernel();
    var hits = null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var domainScan = kernel.scanDomainForbiddenFields(SUBJECT_TYPE, target);
        if (domainScan && Array.isArray(domainScan.forbiddenFields)) {
          hits = domainScan.forbiddenFields.map(function (hit) {
            return isObject(hit) ? cleanString(hit.fieldName || hit.fieldPath) : cleanString(hit);
          }).filter(Boolean);
        } else if (domainScan && Array.isArray(domainScan.hits)) {
          hits = domainScan.hits.slice();
        }
        mergeCodes(warnings, domainScan && domainScan.warnings);
      } catch (_) { /* fall through */ }
    }
    if (hits === null && kernel && typeof kernel.findForbiddenFields === 'function') {
      try {
        var kernelHits = kernel.findForbiddenFields(target, {
          subjectType: SUBJECT_TYPE,
          redactionClass: 'redacted',
          allowedRedactionClasses: ['redacted'],
          forbiddenList: list,
          foreverNoFields: list
        });
        if (Array.isArray(kernelHits)) {
          hits = kernelHits.map(function (hit) {
            return isObject(hit) ? cleanString(hit.fieldName || hit.fieldPath) : cleanString(hit);
          }).filter(Boolean);
        }
      } catch (_) { /* fall through */ }
    }
    if (hits === null) {
      var local = [];
      findForbiddenInternal(target, list, local);
      hits = local;
    }
    // Deduplicate while preserving order
    var seen = Object.create(null);
    var dedup = [];
    for (var h = 0; h < hits.length; h++) {
      var hit = String(hits[h]);
      if (!seen[hit]) { seen[hit] = true; dedup.push(hit); }
    }
    fields.hits = dedup;

    if (dedup.length > 0) {
      addCode(blockers, 'chat-preflight-output-contains-forbidden-field');
      for (var d = 0; d < Math.min(dedup.length, 8); d++) {
        addCode(blockers, 'forbidden-field:' + dedup[d]);
      }
    }
    if (!kernel) addCode(warnings, 'kernel-not-installed');
    return makeResult('h2o.desktop.sync.chat-forbidden-field-output-scan.v1', fields, blockers, warnings, observedAtIso);
  }

  // ── Registration (idempotent) ────────────────────────────────────────
  H2O.Desktop.Sync.runChatMaterializationDiagnostic = runChatMaterializationDiagnostic;
  H2O.Desktop.Sync.runCrossAccountIdentityCheck     = runCrossAccountIdentityCheck;
  H2O.Desktop.Sync.runNativeOwnerReachabilityProbe  = runNativeOwnerReachabilityProbe;
  H2O.Desktop.Sync.runMirrorStalenessProbe          = runMirrorStalenessProbe;
  H2O.Desktop.Sync.runChatTombstoneCheck            = runChatTombstoneCheck;
  H2O.Desktop.Sync.runChatForbiddenFieldScan        = runChatForbiddenFieldScan;
  H2O.Desktop.Sync.__chatDiagnosticsInstalled       = true;
  H2O.Desktop.Sync.__chatDiagnosticsVersion         = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
