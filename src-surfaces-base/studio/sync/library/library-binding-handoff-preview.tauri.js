/* H2O Desktop Sync - F15.5.b library binding handoff preview
 *
 * Read-only handoff preview for generated library binding proposal
 * candidates (F15.4 binding output). Validates and shapes a Native owner
 * handoff request for bind/unbind operations.
 *
 * Per F15.0.0 §6.1 the library.binding lane has only Native owners — there
 * is no F5 path. This module therefore never shapes an F5 envelope, never
 * touches the F5 review queue, and never reaches Native execution. It is
 * preview-only: never executes a handoff, never calls Native, never ingests
 * into the F5 review queue, never applies, never publishes, never enqueues
 * relay/outbox rows, never advances watermarks, never records consumed
 * operations, never writes the chats.category_id materialized cache, never
 * mutates Labels/Categories/Tags, and never mutates any store.
 *
 * Public API:
 *   H2O.Desktop.Sync.previewLibraryBindingHandoff(input)         -> Promise<result>
 *   H2O.Desktop.Sync.previewLibraryBindingBindHandoff(input)
 *   H2O.Desktop.Sync.previewLibraryBindingUnbindHandoff(input)
 *
 *   H2O.Desktop.Sync.__libraryBindingHandoffPreviewInstalled
 *   H2O.Desktop.Sync.__libraryBindingHandoffPreviewVersion
 *
 * Kernel adoption:
 *   identity-kit:   canonicalJSON, sha256Hex, isSha256Hex
 *   privacy-scan:   scanDomainForbiddenFields('library.binding', ...)
 *   owner-handoff:  shapeOwnerDeclaration, validateOwnerDeclaration,
 *                   shapeAuthorityMetadata, validateAuthorityMetadata,
 *                   shapeOwnerHandoff, validateOwnerHandoff
 *   result-shape:   createResult (fallback wrap)
 *
 * Composed downstream:
 *   library-binding-canonicalizer (F15.1.b) — input canonicalization
 *   library-binding-diagnostics   (F15.2.b) — output-class privacy
 *   library-binding-preflight     (F15.3.b) — readiness gates
 *   library-binding-proposal-     (F15.4.b) — candidate input to this module
 *     candidate-generator
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
  if (H2O.Desktop.Sync.__libraryBindingHandoffPreviewInstalled) return;

  // ── Constants ───────────────────────────────────────────────────────
  var VERSION = '0.2.0-f15.11.b';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-binding-handoff-preview.v1';
  var NATIVE_HANDOFF_REQUEST_SCHEMA = 'h2o.desktop.sync.library-binding-native-handoff-request.v1';
  var SUBJECT_TYPE = 'library.binding';
  var PRIVACY_DOMAIN_TAG = 'library.binding';
  var OWNER_KIND_NATIVE = 'native';
  var REQUIRED_CAPABILITY = 'ownerHandoff';
  var DEFAULT_AUTHORITY_LEVEL = 'audited-apply-authority';
  var HANDOFF_STATUS = 'requested';
  var MAX_RELATED_SUBJECTS = 50;
  var DEFAULT_EXPIRES_AFTER_MINUTES = 60;
  var SHA256_RE = /^[0-9a-f]{64}$/;

  // Forbidden fields — defense-in-depth output scan list. Mirrors F15.0.1
  // §8 + privacy-scan kernel LIBRARY_BINDING_*_FORBIDDEN_FIELDS lists.
  // Identifiers cross the envelope boundary only as sha256 hashes; raw
  // values, raw endpoint ids, raw payload blobs, raw titles, raw category
  // cache keys, and raw account ids never appear.
  var PRIVACY_FORBIDDEN_FIELDS = [
    'rawPayload', 'bindingPayload',
    'name', 'rawName',
    'rawLeftId', 'rawRightId',
    'chatId', 'chat_id',
    'labelId', 'tagId', 'categoryId', 'folderId',
    'accountId', 'account_id', 'rawAccountId',
    'userId', 'user_id', 'rawUserId',
    'title', 'chatTitle', 'rawTitle',
    'content', 'body', 'text',
    'messages', 'turns',
    'notes', 'rawNotes',
    'category_id',
    'attachments', 'files',
    'path', 'url',
    'password', 'apiKey',
    'cookies', 'session_token', 'sessionToken',
    'share_url', 'share_token', 'shareUrl', 'shareToken'
  ];

  // Per-operation metadata. Both operations route to Native; no F5 path
  // exists in the binding lane per F15.0.0 §6.1.
  var OPERATION_META = {
    'bind': {
      proposalOperation: 'library-binding-bind-proposed',
      operationIntent: 'create',
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      handoffReason: 'library-binding-bind-native-handoff'
    },
    'unbind': {
      proposalOperation: 'library-binding-unbind-proposed',
      operationIntent: 'update',
      ownerKind: OWNER_KIND_NATIVE,
      targetBroker: OWNER_KIND_NATIVE,
      handoffReason: 'library-binding-unbind-native-handoff'
    }
  };
  var ALLOWED_OPERATIONS = Object.keys(OPERATION_META);

  // ── Tiny helpers ────────────────────────────────────────────────────
  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function nowIsoSeconds() { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function isSha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return SHA256_RE.test(cleanLower(value));
  }
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }
  function addCode(list, code) {
    var n = cleanString(code);
    if (!n || list.indexOf(n) !== -1) return;
    list.push(n);
  }
  function mergeCodes(into, from) {
    if (!Array.isArray(from)) return;
    for (var i = 0; i < from.length; i++) {
      var entry = from[i];
      if (entry && typeof entry === 'object' && typeof entry.code === 'string') addCode(into, entry.code);
      else if (typeof entry === 'string') addCode(into, entry);
    }
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) { return arr.indexOf(code) === index; });
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
    for (var i = 0; i < bytes.length; i++) {
      var p = bytes[i].toString(16);
      hex += p.length === 1 ? '0' + p : p;
    }
    return hex;
  }
  function webCryptoAvailable() {
    try { return !!(global.crypto && global.crypto.subtle && global.crypto.subtle.digest); }
    catch (_) { return false; }
  }
  async function sha256Hex(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.sha256Hex === 'function') {
      try {
        var k = await kernel.sha256Hex(value);
        if (isSha256Hex(k)) return cleanLower(k);
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
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') global.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytesToHex(bytes);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
      h.slice(16, 20) + '-' + h.slice(20, 32);
  }
  function addMinutesIso(minutes) {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  // ── Privacy scan ────────────────────────────────────────────────────
  // Kernel-first, with deterministic local fall-back over the
  // PRIVACY_FORBIDDEN_FIELDS list. Six call sites in the main flow guard
  // against leakage at every shape transition.
  function scanPrivacy(target, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scan = kernel.scanDomainForbiddenFields(PRIVACY_DOMAIN_TAG, target);
        if (scan && scan.ok === false) {
          mergeCodes(blockers, scan.blockers);
          mergeCodes(warnings, scan.warnings);
          // Defense in depth — always add the specific blocker for clarity.
          addCode(blockers, 'library-binding-handoff-privacy-failed');
          return;
        }
      } catch (_) {
        addCode(warnings, 'library-binding-privacy-scan-threw');
      }
    } else {
      addCode(warnings, 'library-binding-privacy-scan-unavailable');
    }
    // Local fall-back: walk target tree for forbidden field names.
    var hits = [];
    findForbiddenFieldsLocal(target, '', hits);
    if (hits.length) {
      addCode(blockers, 'library-binding-handoff-privacy-failed');
      for (var i = 0; i < Math.min(hits.length, 5); i++) {
        addCode(warnings, 'forbidden-field:' + hits[i].field);
      }
    }
  }
  function findForbiddenFieldsLocal(node, prefix, hits) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) findForbiddenFieldsLocal(node[i], prefix + '[' + i + ']', hits);
      return;
    }
    if (typeof node !== 'object') return;
    var keys = Object.keys(node);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (PRIVACY_FORBIDDEN_FIELDS.indexOf(k) !== -1) {
        hits.push({ field: k, path: prefix + '/' + k });
      }
      findForbiddenFieldsLocal(node[k], prefix + '/' + k, hits);
    }
  }

  // ── relatedSubjects truncation (per F15.0.1 §6.6) ───────────────────
  function truncateRelatedSubjects(related, warnings) {
    var arr = asArray(related);
    if (arr.length <= MAX_RELATED_SUBJECTS) return arr.slice();
    var severityOrder = { 'blocker': 0, 'warning': 1, 'info': 2 };
    var sorted = arr.slice().sort(function (a, b) {
      var sa = severityOrder[(a && a.severity) || 'info'];
      var sb = severityOrder[(b && b.severity) || 'info'];
      if (sa !== sb) return sa - sb;
      var ta = Date.parse((a && a.observedAtIso) || '') || 0;
      var tb = Date.parse((b && b.observedAtIso) || '') || 0;
      return tb - ta;
    });
    addCode(warnings, 'related-subjects-truncated');
    return sorted.slice(0, MAX_RELATED_SUBJECTS);
  }

  // ── Candidate resolution ────────────────────────────────────────────
  function resolveProposalCandidate(args) {
    if (isObject(args.proposalCandidate)) return args.proposalCandidate;
    if (isObject(args.proposal)) return args.proposal;
    if (isObject(args.candidate)) return args.candidate;
    return null;
  }
  function resolvePreflight(args, candidate) {
    if (isObject(args.preflight)) return args.preflight;
    if (candidate && isObject(candidate.preflight)) return candidate.preflight;
    return null;
  }
  function resolveCanonicalBinding(candidate) {
    return safeObject(candidate && candidate.canonicalBinding);
  }
  function resolveDiagnostics(args, candidate) {
    if (isObject(args.diagnostics)) return args.diagnostics;
    if (candidate && isObject(candidate.diagnostics)) return candidate.diagnostics;
    return {};
  }

  // ── Endpoint defense-in-depth ───────────────────────────────────────
  // The F15.4.b generator already verifies endpoint sha256s during
  // canonicalization. This preview re-checks them at handoff time so a
  // malformed candidate (e.g., one constructed by hand or tampered) can
  // never produce a Native handoff request.
  function validateEndpoints(candidate, blockers) {
    var canonical = safeObject(candidate.canonicalBinding);
    var current = safeObject(candidate.expectedCurrentState);
    var target = safeObject(candidate.expectedTargetState);
    var left = cleanLower(canonical.leftSubjectId)
      || cleanLower(target.leftSubjectId)
      || cleanLower(current.leftSubjectId);
    var right = cleanLower(canonical.rightSubjectId)
      || cleanLower(target.rightSubjectId)
      || cleanLower(current.rightSubjectId);
    if (!isSha256Hex(left) || !isSha256Hex(right)) {
      addCode(blockers, 'library-binding-endpoints-missing');
      return false;
    }
    return true;
  }

  // ── Actor peer resolution ──────────────────────────────────────────
  async function resolveActorPeer(args, candidate) {
    var raw = args && isObject(args.actorPeer) ? args.actorPeer : null;
    if (!raw && candidate && isObject(candidate.actorPeer)) raw = candidate.actorPeer;
    if (raw) {
      return {
        physicalDeviceIdHash: cleanLower(raw.physicalDeviceIdHash),
        installIdHash: cleanLower(raw.installIdHash),
        syncPeerIdHash: cleanLower(raw.syncPeerIdHash),
        surfaceKind: cleanString(raw.surfaceKind) || 'desktop-tauri'
      };
    }
    // Last-resort: read H2O.Studio.identity
    var studio = (global.H2O && global.H2O.Studio) || null;
    var identity = studio && studio.identity ? studio.identity : null;
    var fromStudio = null;
    try {
      if (identity && typeof identity.get === 'function') fromStudio = identity.get();
    } catch (_) { fromStudio = null; }
    if (isObject(fromStudio)) {
      return {
        physicalDeviceIdHash: cleanLower(fromStudio.physicalDeviceIdHash),
        installIdHash: cleanLower(fromStudio.installIdHash),
        syncPeerIdHash: cleanLower(fromStudio.syncPeerIdHash),
        surfaceKind: cleanString(fromStudio.surfaceKind) || 'desktop-tauri'
      };
    }
    return null;
  }
  function validateActorPeer(peer, blockers) {
    if (!isObject(peer)) {
      addCode(blockers, 'library-binding-actor-peer-invalid');
      return false;
    }
    if (!isSha256Hex(peer.physicalDeviceIdHash)
        || !isSha256Hex(peer.installIdHash)
        || !isSha256Hex(peer.syncPeerIdHash)) {
      addCode(blockers, 'library-binding-actor-peer-invalid');
      return false;
    }
    return true;
  }

  // ── Owner declaration (kernel.shapeOwnerDeclaration / validate) ─────
  async function buildOwnerDeclaration(args, ownerKind, actorPeer, warnings) {
    var supplied = isObject(args.ownerDeclaration) ? args.ownerDeclaration : null;
    var ownerIdSeed = 'h2o.library.binding.native-owner:' +
      (cleanString(args.originAccountIdHash) || 'local');
    var ownerIdHash = await sha256Hex(ownerIdSeed);
    var declaration = {
      ownerKind: ownerKind,
      kind: ownerKind,
      ownerId: 'library-binding-native-owner',
      id: 'library-binding-native-owner',
      platformId: 'library-binding-native-owner',
      surfaceKind: 'native',
      authorityLevel: cleanString(args.authorityLevel) || DEFAULT_AUTHORITY_LEVEL,
      capabilities: ['read', 'review', REQUIRED_CAPABILITY],
      subjectTypes: [SUBJECT_TYPE],
      domains: [SUBJECT_TYPE],
      ownerNameHash: ownerIdHash,
      ownerPeer: actorPeer,
      actorPeer: actorPeer
    };
    if (supplied) {
      // Merge specific supplied fields without bleeding raw names through
      if (cleanString(supplied.authorityLevel)) declaration.authorityLevel = cleanString(supplied.authorityLevel);
      if (Array.isArray(supplied.capabilities)) declaration.capabilities = supplied.capabilities.slice();
      if (cleanString(supplied.ownerId)) {
        declaration.ownerId = cleanString(supplied.ownerId);
        declaration.id = declaration.ownerId;
      }
    }
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.shapeOwnerDeclaration === 'function') {
      try { return kernel.shapeOwnerDeclaration(declaration); }
      catch (_) { addCode(warnings, 'kernel-handoff-shape-threw'); }
    }
    return declaration;
  }
  function validateOwnerDeclaration(declaration, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.validateOwnerDeclaration === 'function') {
      try {
        var v = kernel.validateOwnerDeclaration(declaration);
        if (v && v.ok === false) {
          mergeCodes(blockers, v.blockers);
          mergeCodes(warnings, v.warnings);
          return false;
        }
        return true;
      } catch (_) {
        addCode(warnings, 'kernel-handoff-shape-threw');
        return true; // best-effort
      }
    }
    return true;
  }

  // ── Authority metadata ─────────────────────────────────────────────
  // NOTE (F15.5.a integration lesson, preserved verbatim):
  // kernel.shapeOwnerDeclaration preserves declaration.ownerPeer but drops
  // declaration.actorPeer (intentional: declarations carry ownerPeer,
  // handoffs carry actorPeer). The caller passes the resolved actorPeer
  // separately so authority metadata can populate actorPeer/approvedByPeer
  // with valid sha256 hashes.
  function buildAuthorityMetadata(args, declaration, actorPeer, candidate, createdAtIso, warnings) {
    var peer = isObject(actorPeer) ? actorPeer
      : (isObject(declaration.ownerPeer) ? declaration.ownerPeer
      : (isObject(declaration.actorPeer) ? declaration.actorPeer : null));
    var meta = {
      platformId: declaration.platformId,
      surfaceKind: declaration.surfaceKind,
      declaredAuthority: declaration.authorityLevel,
      effectiveAuthority: declaration.authorityLevel,
      requiredAuthority: DEFAULT_AUTHORITY_LEVEL,
      capability: REQUIRED_CAPABILITY,
      actorPeer: peer,
      approvedByPeer: peer,
      createdAtIso: createdAtIso,
      expiresAtIso: cleanString(args.expiresAtIso) || addMinutesIso(DEFAULT_EXPIRES_AFTER_MINUTES),
      metadata: {
        subjectType: SUBJECT_TYPE,
        subjectId: cleanLower(candidate.subjectId),
        operation: cleanString(candidate.operation),
        operationIntent: cleanString(candidate.operationIntent),
        previewOnly: true
      }
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.shapeAuthorityMetadata === 'function') {
      try { return kernel.shapeAuthorityMetadata(meta); }
      catch (_) { addCode(warnings, 'kernel-handoff-shape-threw'); }
    }
    return meta;
  }
  function validateAuthorityMetadata(meta, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.validateAuthorityMetadata === 'function') {
      try {
        var v = kernel.validateAuthorityMetadata(meta);
        if (v && v.ok === false) {
          mergeCodes(blockers, v.blockers);
          mergeCodes(warnings, v.warnings);
          return false;
        }
        return true;
      } catch (_) {
        addCode(warnings, 'kernel-handoff-shape-threw');
        return true;
      }
    }
    return true;
  }

  // ── Owner handoff envelope ─────────────────────────────────────────
  // NOTE (F15.5.a integration lesson, preserved verbatim):
  // shapeOwnerHandoff reads `requestedByPeer || actorPeer` from input. The
  // declaration object passed in is post-shape so it carries `ownerPeer`
  // (not `actorPeer`); pass the resolved actorPeer separately so
  // requestedByPeer is set to a sha256-valid peer.
  function buildOwnerHandoff(args, declaration, authority, actorPeer, candidate, candidateMeta,
                              createdAtIso, warnings) {
    var peer = isObject(actorPeer) ? actorPeer
      : (isObject(declaration.ownerPeer) ? declaration.ownerPeer
      : (isObject(declaration.actorPeer) ? declaration.actorPeer : null));
    var input = {
      handoffId: cleanString(args.handoffId) || generateUuid(),
      handoffStatus: HANDOFF_STATUS,
      owner: declaration,
      ownerDeclaration: declaration,
      authority: authority,
      subjectType: SUBJECT_TYPE,
      subjectId: cleanLower(candidate.subjectId),
      operation: cleanString(candidate.operation),
      operationIntent: cleanString(candidate.operationIntent),
      requestedCapability: REQUIRED_CAPABILITY,
      lineageId: cleanLower(candidate.lineageId),
      eventDigest: cleanLower(candidate.eventDigest || candidate.dedupeKey),
      dedupeKey: cleanLower(candidate.dedupeKey),
      handoffReason: candidateMeta.handoffReason,
      createdAtIso: createdAtIso,
      expiresAtIso: cleanString(args.expiresAtIso) || addMinutesIso(DEFAULT_EXPIRES_AFTER_MINUTES),
      requestedByPeer: peer,
      metadata: {
        subjectId: cleanLower(candidate.subjectId),
        operationId: cleanString(candidate.operationId),
        previewOnly: true,
        ownerKind: declaration.ownerKind
      }
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.shapeOwnerHandoff === 'function') {
      try { return kernel.shapeOwnerHandoff(input); }
      catch (_) { addCode(warnings, 'kernel-handoff-shape-threw'); }
    }
    return input;
  }
  function validateOwnerHandoff(handoff, blockers, warnings) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.validateOwnerHandoff === 'function') {
      try {
        var v = kernel.validateOwnerHandoff(handoff);
        if (v && (v.ok === false || v.valid === false)) {
          mergeCodes(blockers, v.blockers);
          mergeCodes(warnings, v.warnings);
          addCode(blockers, 'library-binding-handoff-shape-invalid');
          return false;
        }
        return true;
      } catch (_) {
        addCode(warnings, 'kernel-handoff-shape-threw');
        return true;
      }
    }
    return true;
  }

  // ── Side-effect summary (all eight flags false) ────────────────────
  function sideEffectSummary() {
    return {
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      applyExecuted: false
    };
  }

  // ── Result envelope assembly ───────────────────────────────────────
  function buildResult(opts) {
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: !!opts.ok,
      handoffReady: !!opts.handoffReady,
      operation: cleanString(opts.operation),
      operationIntent: cleanString(opts.operationIntent),
      ownerKind: cleanString(opts.ownerKind),
      targetBroker: cleanString(opts.targetBroker),
      subjectId: cleanLower(opts.subjectId),
      lineageId: cleanLower(opts.lineageId),
      dedupeKey: cleanLower(opts.dedupeKey),
      operationId: cleanString(opts.operationId),
      // expectedCurrentState / expectedTargetState are F15.4 envelope OBJECTS
      // ({subjectType, subjectId, bindingState, leftSubjectId, rightSubjectId, ...}).
      // Carry them through verbatim — cleanString() would stringify them to
      // "[object Object]" (F15.5.a integration lesson).
      expectedCurrentState: isObject(opts.expectedCurrentState) ? opts.expectedCurrentState : null,
      expectedTargetState: isObject(opts.expectedTargetState) ? opts.expectedTargetState : null,
      originAccountIdHash: cleanLower(opts.originAccountIdHash),
      actorPeer: opts.actorPeer || null,
      owner: opts.owner || null,
      authorityMetadata: opts.authorityMetadata || null,
      handoffRequest: opts.handoffRequest || null,
      proposal: opts.proposal || null,
      candidate: opts.candidate || null,
      canonicalBinding: opts.canonicalBinding || null,
      preflight: opts.preflight || null,
      diagnostics: opts.diagnostics || null,
      relatedSubjects: asArray(opts.relatedSubjects),
      validationSummary: opts.validationSummary || {},
      blockers: codeList(opts.blockers),
      warnings: codeList(opts.warnings),
      sideEffectSummary: sideEffectSummary(),
      observedAtIso: opts.observedAtIso || nowIsoSeconds()
    };
    // Wrap-only: defer to kernel.createResult for ok/blocker normalization
    // if available; never lose any fields from the payload.
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.createResult === 'function') {
      try {
        var generic = kernel.createResult({
          schema: RESULT_SCHEMA,
          ok: payload.ok,
          actionable: payload.handoffReady,
          blockers: payload.blockers,
          warnings: payload.warnings,
          metadata: {
            domain: 'library.binding',
            subjectType: SUBJECT_TYPE,
            version: VERSION
          }
        });
        if (generic && typeof generic === 'object') {
          var mergedBlockers = codeList(generic.blockers).concat(payload.blockers.filter(function (c) {
            return codeList(generic.blockers).indexOf(c) === -1;
          }));
          var mergedWarnings = codeList(generic.warnings).concat(payload.warnings.filter(function (c) {
            return codeList(generic.warnings).indexOf(c) === -1;
          }));
          payload.blockers = mergedBlockers;
          payload.warnings = mergedWarnings;
          if (generic.ok === false) payload.ok = false;
        }
      } catch (_) { /* swallow */ }
    }
    return payload;
  }
  function blockedResult(opts) {
    opts = opts || {};
    opts.ok = false;
    opts.handoffReady = false;
    return buildResult(opts);
  }
  function scanFinalOutput(result) {
    var blockers = [];
    var warnings = result.warnings ? result.warnings.slice() : [];
    scanPrivacy(result, blockers, warnings);
    if (!blockers.length) return result;
    var summary = Object.assign({}, safeObject(result.validationSummary), {
      outputPrivacySafe: false
    });
    return blockedResult({
      operation: result.operation,
      operationIntent: result.operationIntent,
      ownerKind: result.ownerKind,
      targetBroker: result.targetBroker,
      subjectId: result.subjectId,
      lineageId: result.lineageId,
      dedupeKey: result.dedupeKey,
      operationId: result.operationId,
      expectedCurrentState: result.expectedCurrentState,
      expectedTargetState: result.expectedTargetState,
      originAccountIdHash: result.originAccountIdHash,
      actorPeer: null,
      owner: null,
      authorityMetadata: null,
      handoffRequest: null,
      proposal: null,
      candidate: null,
      canonicalBinding: null,
      preflight: null,
      diagnostics: null,
      relatedSubjects: [],
      validationSummary: summary,
      blockers: codeList(blockers.concat(result.blockers || [])),
      warnings: codeList(warnings),
      observedAtIso: result.observedAtIso
    });
  }

  // ── Main entry — previewLibraryBindingHandoff(input) ───────────────
  async function previewLibraryBindingHandoff(input) {
    var args = safeObject(input);
    var blockers = [];
    var warnings = [];
    var observedAtIso = cleanString(args.observedAtIso) || nowIsoSeconds();
    var validationSummary = {
      candidateResolved: false,
      candidateValid: false,
      candidatePrivacySafe: false,
      preflightOk: false,
      preflightActionable: false,
      ownerNative: false,
      ownerReachable: false,
      authorityValid: false,
      handoffShape: false,
      relatedSubjectsClear: true,
      outputPrivacySafe: true
    };

    if (!isObject(input)) {
      addCode(blockers, 'input-missing');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }

    // Gate 1: resolve proposal candidate
    var candidate = resolveProposalCandidate(args);
    if (!candidate) {
      addCode(blockers, 'library-binding-proposal-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.candidateResolved = true;

    // Gate 2: candidate must be ok + generated
    if (candidate.ok !== true) {
      mergeCodes(warnings, candidate.warnings);
      addCode(blockers, 'library-binding-proposal-not-ok');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    var candidateStatus = cleanString(safeObject(candidate.candidate).status)
      || cleanString(candidate.status);
    if (candidateStatus !== 'generated') {
      addCode(blockers, 'library-binding-proposal-not-generated');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    validationSummary.candidateValid = true;

    // Gate 3: operation must be allowed
    var operation = cleanString(args.operation) || cleanString(candidate.operation);
    // F15.4 candidates carry `operation = 'library-binding-bind-proposed'`
    // (proposalOperation) when their domainOperation is 'bind'. Coerce the
    // canonical short form back from candidate.domainOperation if present.
    if (!OPERATION_META[operation]) {
      var domainOp = cleanString(candidate.domainOperation)
        || cleanString(safeObject(candidate.candidate).domainOperation)
        || cleanString(safeObject(candidate.proposal).domainOperation);
      if (OPERATION_META[domainOp]) operation = domainOp;
    }
    if (!OPERATION_META[operation]) {
      addCode(blockers, 'library-binding-operation-not-allowed');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso });
    }
    var meta = OPERATION_META[operation];

    // Gate 4: preflight present + ok + actionable
    var preflight = resolvePreflight(args, candidate);
    if (!isObject(preflight)) {
      addCode(blockers, 'library-binding-preflight-missing');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent,
        subjectId: candidate.subjectId, lineageId: candidate.lineageId,
        dedupeKey: candidate.dedupeKey });
    }
    if (preflight.ok !== true) {
      mergeCodes(blockers, preflight.blockers);
      addCode(blockers, 'library-binding-preflight-not-actionable');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }
    validationSummary.preflightOk = true;
    if (preflight.actionable !== true) {
      addCode(blockers, 'library-binding-preflight-not-actionable');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }
    validationSummary.preflightActionable = true;

    // Privacy scan 1: input proposal candidate
    scanPrivacy(candidate, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }
    validationSummary.candidatePrivacySafe = true;

    // Privacy scan 2: input preflight
    scanPrivacy(preflight, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Endpoint defense-in-depth: ensure left + right endpoint sha256s
    // resolved from canonicalBinding or expectedTargetState. F15.4
    // canonicalization already enforces this, but a hand-rolled or
    // tampered candidate must never produce a Native handoff request.
    if (!validateEndpoints(candidate, blockers)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Resolve actor peer (must have all three sha256 fields)
    var actorPeer = await resolveActorPeer(args, candidate);
    if (!validateActorPeer(actorPeer, blockers)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Resolve originAccountIdHash
    var originAccountIdHash = cleanLower(args.originAccountIdHash)
      || cleanLower(candidate.originAccountIdHash);
    if (!isSha256Hex(originAccountIdHash)) {
      addCode(blockers, 'library-binding-origin-account-id-hash-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Resolve canonical binding (snapshot) + diagnostics
    var canonicalBinding = resolveCanonicalBinding(candidate);
    var diagnostics = resolveDiagnostics(args, candidate);

    // Owner declaration — always Native for binding lane
    var declaration = await buildOwnerDeclaration({
      originAccountIdHash: originAccountIdHash,
      authorityLevel: args.authorityLevel,
      ownerDeclaration: args.ownerDeclaration
    }, meta.ownerKind, actorPeer, warnings);
    if (!validateOwnerDeclaration(declaration, blockers, warnings)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }
    validationSummary.ownerNative = true;

    // Cross-check ownerKind matches operation (must be 'native')
    if (cleanString(declaration.ownerKind) !== meta.ownerKind) {
      addCode(blockers, 'library-binding-handoff-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Owner reachability (advisory: presence of all 3 sha256 fields is
    // the structural reachability check at preview time; caller may
    // supply ownerStatus for richer signalling)
    var ownerStatus = cleanString(args.ownerStatus) || 'reachable';
    if (ownerStatus === 'unreachable' || ownerStatus === 'unavailable') {
      addCode(blockers, 'library-binding-handoff-shape-invalid');
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }
    validationSummary.ownerReachable = true;

    // Privacy scan 3: owner declaration
    scanPrivacy(declaration, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Authority metadata
    var createdAtIso = observedAtIso;
    var authorityMetadata = buildAuthorityMetadata({
      expiresAtIso: args.expiresAtIso
    }, declaration, actorPeer, candidate, createdAtIso, warnings);
    if (!validateAuthorityMetadata(authorityMetadata, blockers, warnings)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }
    validationSummary.authorityValid = true;

    // Privacy scan 4: authority metadata
    scanPrivacy(authorityMetadata, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Owner handoff envelope — Native only, no F5 wrap.
    var ownerHandoff = buildOwnerHandoff({
      handoffId: args.handoffId,
      expiresAtIso: args.expiresAtIso
    }, declaration, authorityMetadata, actorPeer, candidate, meta, createdAtIso, warnings);
    if (!validateOwnerHandoff(ownerHandoff, blockers, warnings)) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent,
        ownerKind: meta.ownerKind, targetBroker: meta.targetBroker });
    }
    validationSummary.handoffShape = true;

    // Privacy scan 5: handoff request envelope
    scanPrivacy(ownerHandoff, blockers, warnings);
    if (blockers.length) {
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Compose handoffRequest result field
    var handoffRequest = Object.assign({
      previewSchema: NATIVE_HANDOFF_REQUEST_SCHEMA,
      previewOnly: true
    }, safeObject(ownerHandoff));

    // relatedSubjects pass-through + truncation
    var related = candidate.relatedSubjects;
    if (!Array.isArray(related) && Array.isArray(args.relatedSubjects)) related = args.relatedSubjects;
    var truncated = truncateRelatedSubjects(related, warnings);
    scanPrivacy(truncated, blockers, warnings);
    if (blockers.length) {
      validationSummary.relatedSubjectsClear = false;
      return blockedResult({ blockers: blockers, warnings: warnings,
        validationSummary: validationSummary, observedAtIso: observedAtIso,
        operation: operation, operationIntent: meta.operationIntent });
    }

    // Pass through proposal/preflight warnings (deduped via codeList)
    mergeCodes(warnings, candidate.warnings);
    mergeCodes(warnings, preflight.warnings);

    // Context-incomplete advisory
    if (!isObject(args.preflight) && !isObject(candidate.preflight)) {
      addCode(warnings, 'library-handoff-context-incomplete');
    }

    // ── Assemble success result envelope ──
    var result = buildResult({
      ok: true,
      handoffReady: true,
      operation: operation,
      operationIntent: meta.operationIntent,
      ownerKind: meta.ownerKind,
      targetBroker: meta.targetBroker,
      subjectId: candidate.subjectId,
      lineageId: candidate.lineageId,
      dedupeKey: candidate.dedupeKey,
      operationId: candidate.operationId,
      expectedCurrentState: candidate.expectedCurrentState,
      expectedTargetState: candidate.expectedTargetState,
      originAccountIdHash: originAccountIdHash,
      actorPeer: actorPeer,
      owner: declaration,
      authorityMetadata: authorityMetadata,
      handoffRequest: handoffRequest,
      proposal: safeObject(candidate.proposal),
      candidate: safeObject(candidate.candidate),
      canonicalBinding: canonicalBinding,
      preflight: preflight,
      diagnostics: diagnostics,
      relatedSubjects: truncated,
      validationSummary: validationSummary,
      blockers: [],
      warnings: warnings,
      observedAtIso: observedAtIso
    });

    // Privacy scan 6: final output envelope (defense in depth)
    return scanFinalOutput(result);
  }

  // ── Convenience wrappers ───────────────────────────────────────────
  function withOperation(input, operation) {
    return Object.assign({}, safeObject(input), { operation: operation });
  }
  H2O.Desktop.Sync.previewLibraryBindingHandoff = previewLibraryBindingHandoff;
  H2O.Desktop.Sync.previewLibraryBindingBindHandoff = function (input) {
    return previewLibraryBindingHandoff(withOperation(input, 'bind'));
  };
  H2O.Desktop.Sync.previewLibraryBindingUnbindHandoff = function (input) {
    return previewLibraryBindingHandoff(withOperation(input, 'unbind'));
  };

  H2O.Desktop.Sync.__libraryBindingHandoffPreviewInstalled = true;
  H2O.Desktop.Sync.__libraryBindingHandoffPreviewVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
