/* H2O Desktop Sync - F16.1.a library runtime conflict gate foundation
 *
 * Read-only runtime conflict evaluator for library.catalog and
 * library.binding. This module turns the F15.12 conflict contract into a
 * callable gate surface, but F16.1.a does not wire it into preflight,
 * settlement, store shims, bulk execution, Native, F5, publication, relay,
 * watermarks, or consumed-op writes.
 *
 * Public API:
 *   H2O.Desktop.Sync.evaluateLibraryRuntimeConflict(input)
 *   H2O.Desktop.Sync.evaluateLibraryCatalogRuntimeConflict(input)
 *   H2O.Desktop.Sync.evaluateLibraryBindingRuntimeConflict(input)
 *   H2O.Desktop.Sync.classifyLibraryBulkRuntimeConflictRows(input)
 *
 *   H2O.Desktop.Sync.__libraryConflictRuntimeInstalled
 *   H2O.Desktop.Sync.__libraryConflictRuntimeVersion
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
  if (H2O.Desktop.Sync.__libraryConflictRuntimeInstalled) return;

  var VERSION = '0.1.0-f16.1.a';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-conflict-runtime.v1';
  var CATALOG_DOMAIN = 'library.catalog';
  var BINDING_DOMAIN = 'library.binding';
  var CACHE_DOMAIN = 'library.cache';
  var BULK_DOMAIN = 'library.bulk';
  var F5_DOMAIN = 'library.f5';
  var CATALOG_SUBJECT_TYPE = 'library.catalog';
  var BINDING_SUBJECT_TYPE = 'library.binding';
  var CHAT_SUBJECT_TYPE = 'chat.metadata';
  var FOLDER_SUBJECT_TYPE = 'folder.metadata';
  var SHA256_RE = /^[0-9a-f]{64}$/;

  var TAXONOMY_CODES = [
    'library-catalog-cross-install-stale-base',
    'library-catalog-cross-install-name-collision',
    'library-catalog-cross-install-lifecycle-conflict',
    'library-catalog-f5-review-conflict',
    'library-binding-cross-install-stale-base',
    'library-binding-cross-install-duplicate-edge',
    'library-binding-cross-install-state-conflict',
    'library-binding-f7-f15-identity-conflict',
    'library-bulk-cross-install-partial-conflict',
    'library-conflict-refresh-required',
    'library-cache-cross-install-drift'
  ];

  var GUARD_CODES = [
    'library-conflict-runtime-context-missing',
    'library-conflict-runtime-shape-invalid',
    'library-conflict-runtime-privacy-failed'
  ];

  var PROOF_CASE_NAMES = [
    'runtime-conflict-catalog-create-collision',
    'runtime-conflict-catalog-stale-rename',
    'runtime-conflict-catalog-stale-recolor',
    'runtime-conflict-catalog-archive-vs-rename',
    'runtime-conflict-binding-duplicate-edge',
    'runtime-conflict-binding-bind-unbind-race',
    'runtime-conflict-binding-chat-category-replacement-race',
    'runtime-conflict-binding-chat-folder-replacement-race',
    'runtime-conflict-binding-f7-f15-identity-mismatch',
    'runtime-conflict-cache-drift-warning-only',
    'runtime-conflict-f5-terminal-conflict',
    'runtime-conflict-bulk-partial-conflict',
    'runtime-conflict-privacy-leak-mutation-blocks',
    'runtime-conflict-side-effects-all-false',
    'runtime-conflict-apis-markers-present',
    'runtime-conflict-loader-pack-wiring-present'
  ];

  var RAW_FIELD_GUARDRAILS = [
    'name', 'rawName', 'displayName', 'label', 'title',
    'color', 'rawColor', 'folderName', 'folderColor',
    'rawId', 'labelId', 'tagId', 'categoryId', 'folderId',
    'chatId', 'accountId', 'rawAccountId', 'userId', 'rawUserId',
    'chat_id', 'category_id', 'chats.category_id', 'folder_id',
    'path', 'filePath', 'filename', 'fileName', 'bundleFilename',
    'content', 'body', 'text', 'messages', 'turns',
    'attachments', 'files', 'url', 'share_url', 'token', 'apiKey',
    'password', 'cookies', 'session_token', 'sessionToken'
  ];

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
  function supplied(input, key) {
    return isObject(input) && Object.prototype.hasOwnProperty.call(input, key);
  }
  function firstString(values) {
    for (var i = 0; i < values.length; i += 1) {
      var value = cleanString(values[i]);
      if (value) return value;
    }
    return '';
  }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (normalized && list.indexOf(normalized) === -1) list.push(normalized);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
  }
  function mergeCodes(into, from) {
    codeList(from).forEach(function (code) { addCode(into, code); });
  }

  function sideEffectSummary() {
    return {
      storageWritten: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false
    };
  }

  function addDecision(ctx, rule, status, code, detail) {
    var d = safeObject(detail);
    var decision = {
      rule: cleanString(rule),
      status: cleanString(status) || 'pass',
      code: cleanString(code),
      severity: cleanString(d.severity) || (status === 'blocked' ? 'blocker' : status === 'warning' ? 'warning' : 'info')
    };
    [
      'domain',
      'operation',
      'subjectType',
      'bindingKind',
      'leftSubjectType',
      'rightSubjectType',
      'rowIndex',
      'rowDomain',
      'outcome',
      'refreshRequired',
      'retrySafe',
      'idempotent',
      'warningOnly',
      'sourceOfTruth'
    ].forEach(function (key) {
      if (typeof d[key] !== 'undefined') decision[key] = d[key];
    });
    ctx.decisions.push(decision);
    if (decision.severity === 'blocker') addCode(ctx.blockers, decision.code);
    if (decision.severity === 'warning') addCode(ctx.warnings, decision.code);
    if (decision.refreshRequired === true) {
      ctx.refreshRequired = true;
      addCode(ctx.warnings, 'library-conflict-refresh-required');
    }
    if (decision.retrySafe === true) ctx.retrySafe = true;
  }

  function buildContext(input, domain) {
    var args = safeObject(input);
    return {
      input: args,
      domain: cleanString(domain || args.domain),
      mode: cleanString(args.mode) || 'diagnostic',
      operation: cleanString(args.operation || safeObject(args.candidate).operation || safeObject(args.candidate).operationKind),
      observedAtIso: cleanString(args.observedAtIso) || nowIsoSeconds(),
      decisions: [],
      blockers: [],
      warnings: [],
      refreshRequired: false,
      retrySafe: false,
      conflictDetected: false,
      privacy: { ok: true, forbiddenFieldCount: 0, blockedFields: [] }
    };
  }

  function localForbiddenScan(target) {
    var hits = [];
    function scan(node, path) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i += 1) scan(node[i], path + '[' + i + ']');
        return;
      }
      Object.keys(node).forEach(function (key) {
        if (RAW_FIELD_GUARDRAILS.indexOf(key) !== -1) {
          hits.push({ field: key, path: path ? path + '/' + key : key });
        }
        scan(node[key], path ? path + '/' + key : key);
      });
    }
    scan(target, '');
    return hits;
  }

  function scanPrivacy(ctx, target) {
    var hits = localForbiddenScan(target);
    var kernel = H2O.Desktop.Sync.kernel || null;
    var domainTag = ctx.domain === CATALOG_DOMAIN ? CATALOG_DOMAIN
      : ctx.domain === BINDING_DOMAIN ? BINDING_DOMAIN
        : ctx.domain === BULK_DOMAIN ? BINDING_DOMAIN
          : ctx.domain === CACHE_DOMAIN ? BINDING_DOMAIN
            : CATALOG_DOMAIN;

    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try {
        var scan = kernel.scanDomainForbiddenFields(domainTag, Object.assign({ redactionClass: 'redacted' }, safeObject(target)));
        var scanHits = Array.isArray(scan && scan.forbiddenFields) ? scan.forbiddenFields
          : Array.isArray(scan && scan.hits) ? scan.hits : [];
        for (var i = 0; i < scanHits.length; i += 1) {
          var hit = scanHits[i];
          hits.push({
            field: isObject(hit) ? cleanString(hit.fieldName || hit.fieldPath || hit.field) : cleanString(hit),
            path: isObject(hit) ? cleanString(hit.fieldPath || hit.path || hit.fieldName) : cleanString(hit)
          });
        }
        mergeCodes(ctx.warnings, scan && scan.warnings);
        if (scan && scan.ok === false) mergeCodes(ctx.blockers, scan.blockers);
      } catch (_) {
        addCode(ctx.warnings, 'library-conflict-runtime-privacy-scan-threw');
      }
    }

    var deduped = [];
    hits.forEach(function (hit) {
      var field = cleanString(hit && hit.field);
      if (!field || deduped.indexOf(field) !== -1) return;
      deduped.push(field);
    });
    if (deduped.length) {
      ctx.privacy = { ok: false, forbiddenFieldCount: deduped.length, blockedFields: deduped.slice(0, 12) };
      addCode(ctx.blockers, 'library-conflict-runtime-privacy-failed');
      addDecision(ctx, 'privacy', 'blocked', 'library-conflict-runtime-privacy-failed', {
        domain: ctx.domain,
        operation: ctx.operation,
        outcome: 'forbidden raw field present in conflict input'
      });
      return false;
    }
    ctx.privacy = { ok: true, forbiddenFieldCount: 0, blockedFields: [] };
    return true;
  }

  function shapeFrom(entry, keys) {
    var source = safeObject(entry);
    for (var i = 0; i < keys.length; i += 1) {
      if (isObject(source[keys[i]])) return source[keys[i]];
    }
    return source;
  }

  function catalogFrom(entry) {
    return shapeFrom(entry, ['canonicalCatalog', 'catalog', 'canonical', 'expectedTargetState', 'targetState']);
  }

  function bindingFrom(entry) {
    return shapeFrom(entry, ['canonicalBinding', 'binding', 'canonical', 'expectedTargetState', 'targetState']);
  }

  function lifecycleOf(state) {
    return cleanString(safeObject(state).lifecycleState || safeObject(state).state);
  }

  function bindingStateOf(state) {
    return cleanString(safeObject(state).bindingState || safeObject(state).state || safeObject(state).status);
  }

  function hashOf(state) {
    var s = safeObject(state);
    return cleanLower(firstString([
      s.revisionHash,
      s.baseHash,
      s.stateHash,
      s.currentHash,
      s.targetHash,
      s.expectedHash
    ]));
  }

  function expectedBaseHash(input) {
    var args = safeObject(input);
    var candidate = safeObject(args.candidate);
    var expected = safeObject(args.expectedState || candidate.expectedCurrentState);
    return cleanLower(firstString([
      args.expectedBaseHash,
      candidate.baseHash,
      expected.baseHash,
      expected.revisionHash,
      expected.stateHash
    ]));
  }

  function currentRevisionHash(input) {
    var args = safeObject(input);
    var current = safeObject(args.currentState || args.localState || args.remoteState);
    return cleanLower(firstString([
      args.currentRevisionHash,
      current.revisionHash,
      current.baseHash,
      current.stateHash,
      hashOf(current)
    ]));
  }

  function activeState(value) {
    var state = cleanString(value || 'active');
    return !state || state === 'active' || state === 'bound';
  }

  function sameCatalogNameIdentity(a, b) {
    return !!(a && b &&
      cleanString(a.catalogKind) === cleanString(b.catalogKind) &&
      cleanLower(a.nameHash) === cleanLower(b.nameHash) &&
      cleanLower(a.originAccountIdHash) === cleanLower(b.originAccountIdHash));
  }

  function catalogIdentitySubject(catalog) {
    return cleanLower(safeObject(catalog).subjectId);
  }

  function collectCatalogs(input) {
    return asArray(input.existingCatalogs).concat(asArray(input.existingSubjects)).map(catalogFrom).filter(isObject);
  }

  function transitionAllowed(operation, from, to) {
    var op = cleanString(operation);
    var current = cleanString(from);
    var target = cleanString(to);
    if (!op) return true;
    if (op === 'create') return !current || current === 'absent' || target === 'active';
    if (op === 'rename' || op === 'recolor') {
      if (current === 'retained' || current === 'expired' || current === 'tombstoned') return false;
      return !target || target === current;
    }
    if (op === 'archive') return current === 'active' && target === 'archived';
    if (op === 'restore-from-archived') return current === 'archived' && target === 'active';
    if (op === 'tombstone') return (current === 'active' || current === 'archived') && target === 'retained';
    if (op === 'restore-from-retained') return current === 'retained' && target === 'active';
    return true;
  }

  function inspectStaleCatalogBase(ctx) {
    var expectedHash = expectedBaseHash(ctx.input);
    var currentHash = currentRevisionHash(ctx.input);
    if (expectedHash && currentHash && expectedHash !== currentHash) {
      ctx.conflictDetected = true;
      addDecision(ctx, 'catalog-stale-base', 'blocked', 'library-catalog-cross-install-stale-base', {
        domain: CATALOG_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'expected base hash differs from current settled revision',
        refreshRequired: true
      });
    }
  }

  function inspectCatalogNameCollision(ctx) {
    var args = ctx.input;
    var op = ctx.operation;
    if (op !== 'create' && op !== 'rename') return;
    var target = catalogFrom(safeObject(args.candidate).expectedTargetState || args.expectedState || args.candidate || args.currentState);
    if (!target || !cleanLower(target.nameHash) || !cleanString(target.catalogKind) || !cleanLower(target.originAccountIdHash)) {
      addDecision(ctx, 'catalog-name-collision-context', 'warning', 'library-conflict-runtime-context-missing', {
        domain: CATALOG_DOMAIN,
        operation: op,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'catalog identity context missing'
      });
      return;
    }
    if (!supplied(args, 'existingCatalogs') && !supplied(args, 'existingSubjects')) {
      addDecision(ctx, 'catalog-name-collision-context', 'warning', 'library-conflict-runtime-context-missing', {
        domain: CATALOG_DOMAIN,
        operation: op,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'existing catalog context missing'
      });
      return;
    }
    var subjectId = catalogIdentitySubject(target);
    var collision = collectCatalogs(args).filter(function (catalog) {
      return activeState(lifecycleOf(catalog)) &&
        catalogIdentitySubject(catalog) !== subjectId &&
        sameCatalogNameIdentity(catalog, target);
    })[0];
    if (collision) {
      ctx.conflictDetected = true;
      addDecision(ctx, 'catalog-duplicate-active-nameHash', 'blocked', 'library-catalog-cross-install-name-collision', {
        domain: CATALOG_DOMAIN,
        operation: op,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'active same-account same-kind nameHash already exists',
        refreshRequired: true
      });
    }
  }

  function inspectCatalogLifecycle(ctx) {
    var args = ctx.input;
    var current = safeObject(args.currentState || args.localState);
    var expected = safeObject(args.expectedState || safeObject(args.candidate).expectedCurrentState);
    var target = safeObject(args.expectedTargetState || safeObject(args.candidate).expectedTargetState || args.targetState);
    var fromState = cleanString(lifecycleOf(current) || lifecycleOf(expected));
    var toState = cleanString(lifecycleOf(target) || lifecycleOf(safeObject(args.candidate).targetState));
    var expectedLifecycle = lifecycleOf(expected);
    if (expectedLifecycle && fromState && expectedLifecycle !== fromState) {
      ctx.conflictDetected = true;
      addDecision(ctx, 'catalog-lifecycle-stale-state', 'blocked', 'library-catalog-cross-install-lifecycle-conflict', {
        domain: CATALOG_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'expected lifecycle differs from current lifecycle',
        refreshRequired: true
      });
    }
    if (fromState && toState && !transitionAllowed(ctx.operation, fromState, toState)) {
      ctx.conflictDetected = true;
      addDecision(ctx, 'catalog-lifecycle-transition', 'blocked', 'library-catalog-cross-install-lifecycle-conflict', {
        domain: CATALOG_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'requested lifecycle transition is no longer legal',
        refreshRequired: true
      });
    }
    if (ctx.operation === 'bind' && fromState && fromState !== 'active') {
      ctx.conflictDetected = true;
      addDecision(ctx, 'catalog-tombstone-blocks-new-bind', 'blocked', 'library-catalog-cross-install-lifecycle-conflict', {
        domain: CATALOG_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'new binding targets non-active catalog',
        refreshRequired: true
      });
    }
  }

  function terminalValue(review, prefix) {
    var r = safeObject(review);
    return cleanString(
      r[prefix + 'TerminalClosure'] ||
      r[prefix + 'TerminalState'] ||
      r[prefix + 'Decision'] ||
      r[prefix + 'Closure'] ||
      ''
    );
  }

  function reviewState(review) {
    var r = safeObject(review);
    return cleanString(r.status || r.state || r.reviewState || r.decision || r.terminalState);
  }

  function inspectF5(ctx) {
    var review = safeObject(ctx.input.f5Review);
    if (!isObject(ctx.input.f5Review)) return;
    var currentTerminal = cleanString(terminalValue(review, 'current') || review.currentTerminal || review.closedAs || review.terminalState);
    var expectedTerminal = cleanString(terminalValue(review, 'expected') || review.expectedTerminal || review.proposedDecision || review.targetDecision);
    var state = reviewState(review);
    var pending = review.pending === true || state === 'pending' || state === 'open';

    if (review.conflict === true) {
      ctx.conflictDetected = true;
      addDecision(ctx, 'f5-terminal-conflict', 'blocked', 'library-catalog-f5-review-conflict', {
        domain: F5_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'F5 review reports a terminal conflict',
        refreshRequired: true
      });
      return;
    }

    if (currentTerminal && expectedTerminal) {
      if (currentTerminal === expectedTerminal) {
        addDecision(ctx, 'f5-terminal-idempotent', 'pass', 'library-catalog-f5-review-conflict', {
          domain: F5_DOMAIN,
          operation: ctx.operation,
          subjectType: CATALOG_SUBJECT_TYPE,
          outcome: 'same terminal closure is idempotent',
          idempotent: true,
          retrySafe: true
        });
      } else {
        ctx.conflictDetected = true;
        addDecision(ctx, 'f5-terminal-conflict', 'blocked', 'library-catalog-f5-review-conflict', {
          domain: F5_DOMAIN,
          operation: ctx.operation,
          subjectType: CATALOG_SUBJECT_TYPE,
          outcome: 'conflicting terminal closure already exists',
          refreshRequired: true
        });
      }
    }

    if (pending && ctx.mode === 'settlement' && ctx.operation === 'tombstone') {
      ctx.conflictDetected = true;
      addDecision(ctx, 'f5-pending-blocks-tombstone-execute', 'blocked', 'library-catalog-f5-review-conflict', {
        domain: F5_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'pending F5 review blocks tombstone settlement'
      });
    }
    if (state === 'approved-restore') {
      addDecision(ctx, 'f5-approved-restore-no-native-tombstone', 'pass', 'library-catalog-f5-review-conflict', {
        domain: F5_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'approve-restore closes review without Native tombstone apply',
        retrySafe: true
      });
    }
    if (state === 'auto-expired') {
      addDecision(ctx, 'f5-auto-expired-maps-to-seal', 'pass', 'library-catalog-f5-review-conflict', {
        domain: F5_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'auto-expired maps to seal path when supported'
      });
    }
  }

  function bindingEdge(binding) {
    var b = safeObject(binding);
    return {
      bindingKind: cleanString(b.bindingKind),
      leftSubjectId: cleanLower(b.leftSubjectId),
      rightSubjectId: cleanLower(b.rightSubjectId),
      leftSubjectType: cleanString(b.leftSubjectType),
      rightSubjectType: cleanString(b.rightSubjectType)
    };
  }

  function sameEdge(a, b) {
    var ea = bindingEdge(a);
    var eb = bindingEdge(b);
    return ea.bindingKind && ea.bindingKind === eb.bindingKind &&
      ea.leftSubjectId && ea.leftSubjectId === eb.leftSubjectId &&
      ea.rightSubjectId && ea.rightSubjectId === eb.rightSubjectId;
  }

  function exactReplay(candidate, existing) {
    var c = safeObject(candidate);
    var e = safeObject(existing);
    if (c.exactReplay === true || e.exactReplay === true) return true;
    if (cleanLower(c.eventDigest) && cleanLower(c.eventDigest) === cleanLower(e.eventDigest)) return true;
    if (cleanLower(c.dedupeKey) && cleanLower(c.dedupeKey) === cleanLower(e.dedupeKey)) return true;
    return cleanLower(c.subjectId) && cleanLower(c.subjectId) === cleanLower(e.subjectId) && sameEdge(c, e);
  }

  function collectBindings(input) {
    return asArray(input.existingBindings).concat(asArray(input.existingSubjects)).map(bindingFrom).filter(isObject);
  }

  function inspectBindingExpectedState(ctx, binding) {
    var expected = safeObject(ctx.input.expectedState || safeObject(ctx.input.candidate).expectedCurrentState);
    var current = safeObject(ctx.input.currentState || ctx.input.localState);
    var expectedState = bindingStateOf(expected);
    var currentState = bindingStateOf(current);
    if (expectedState && currentState && expectedState !== currentState) {
      var idempotent = (ctx.operation === 'bind' && currentState === 'bound' && sameEdge(binding, current)) ||
        (ctx.operation === 'unbind' && (currentState === 'unbound' || currentState === 'absent'));
      if (idempotent) {
        addDecision(ctx, 'binding-state-idempotent', 'pass', 'library-binding-cross-install-state-conflict', {
          domain: BINDING_DOMAIN,
          operation: ctx.operation,
          subjectType: BINDING_SUBJECT_TYPE,
          bindingKind: binding.bindingKind,
          outcome: 'settled state already reflects requested operation',
          idempotent: true,
          retrySafe: true
        });
      } else {
        ctx.conflictDetected = true;
        addDecision(ctx, 'binding-stale-base', 'blocked', 'library-binding-cross-install-stale-base', {
          domain: BINDING_DOMAIN,
          operation: ctx.operation,
          subjectType: BINDING_SUBJECT_TYPE,
          bindingKind: binding.bindingKind,
          outcome: 'expected binding state differs from current state',
          refreshRequired: true
        });
        addDecision(ctx, 'binding-state-conflict', 'blocked', 'library-binding-cross-install-state-conflict', {
          domain: BINDING_DOMAIN,
          operation: ctx.operation,
          subjectType: BINDING_SUBJECT_TYPE,
          bindingKind: binding.bindingKind,
          outcome: 'bind/unbind race observed'
        });
      }
    }
  }

  function inspectBindingDuplicateAndOneActive(ctx, binding) {
    if (ctx.operation !== 'bind') return;
    if (!supplied(ctx.input, 'existingBindings') && !supplied(ctx.input, 'existingSubjects')) {
      addDecision(ctx, 'binding-duplicate-context', 'warning', 'library-conflict-runtime-context-missing', {
        domain: BINDING_DOMAIN,
        operation: ctx.operation,
        subjectType: BINDING_SUBJECT_TYPE,
        bindingKind: binding.bindingKind,
        outcome: 'existing binding context missing'
      });
      return;
    }
    var edge = bindingEdge(binding);
    collectBindings(ctx.input).forEach(function (existing) {
      var existingState = bindingStateOf(existing) || 'bound';
      if (existingState !== 'bound') return;
      if (sameEdge(binding, existing)) {
        if (exactReplay(safeObject(ctx.input.candidate || binding), existing)) {
          addDecision(ctx, 'binding-duplicate-edge-idempotent', 'pass', 'library-binding-cross-install-duplicate-edge', {
            domain: BINDING_DOMAIN,
            operation: ctx.operation,
            subjectType: BINDING_SUBJECT_TYPE,
            bindingKind: edge.bindingKind,
            outcome: 'duplicate logical edge is exact replay',
            idempotent: true,
            retrySafe: true
          });
        } else {
          ctx.conflictDetected = true;
          addDecision(ctx, 'binding-duplicate-edge', 'blocked', 'library-binding-cross-install-duplicate-edge', {
            domain: BINDING_DOMAIN,
            operation: ctx.operation,
            subjectType: BINDING_SUBJECT_TYPE,
            bindingKind: edge.bindingKind,
            outcome: 'active duplicate logical edge exists',
            refreshRequired: true
          });
        }
      }
      if ((edge.bindingKind === 'chat-category' || edge.bindingKind === 'chat-folder') &&
          cleanString(existing.bindingKind) === edge.bindingKind &&
          cleanLower(existing.leftSubjectId) === edge.leftSubjectId &&
          cleanLower(existing.rightSubjectId) !== edge.rightSubjectId) {
        ctx.conflictDetected = true;
        addDecision(ctx, 'binding-one-active-per-chat', 'blocked', 'library-binding-cross-install-state-conflict', {
          domain: BINDING_DOMAIN,
          operation: ctx.operation,
          subjectType: BINDING_SUBJECT_TYPE,
          bindingKind: edge.bindingKind,
          leftSubjectType: edge.leftSubjectType || CHAT_SUBJECT_TYPE,
          rightSubjectType: edge.bindingKind === 'chat-folder' ? FOLDER_SUBJECT_TYPE : edge.rightSubjectType,
          outcome: 'one active binding per chat rule violated',
          refreshRequired: true
        });
      }
    });
  }

  function inspectBindingReplacement(ctx) {
    var op = cleanString(ctx.operation);
    if (op !== 'replace' && op !== 'move' && ctx.input.replacementRace !== true) return;
    ctx.conflictDetected = true;
    addDecision(ctx, 'binding-replacement-decomposes', 'blocked', 'library-binding-cross-install-state-conflict', {
      domain: BINDING_DOMAIN,
      operation: op || 'replace',
      subjectType: BINDING_SUBJECT_TYPE,
      outcome: 'replacement must remain independent unbind plus bind proposals',
      refreshRequired: true
    });
  }

  function inspectBridge(ctx) {
    var bridge = safeObject(ctx.input.bridgeContext);
    if (!isObject(ctx.input.bridgeContext)) return;
    if (bridge.activeStateConflict === true || bridge.conflict === true) {
      ctx.conflictDetected = true;
      addDecision(ctx, 'binding-f7-f15-identity-conflict', 'blocked', 'library-binding-f7-f15-identity-conflict', {
        domain: BINDING_DOMAIN,
        operation: ctx.operation,
        subjectType: BINDING_SUBJECT_TYPE,
        bindingKind: 'chat-folder',
        leftSubjectType: CHAT_SUBJECT_TYPE,
        rightSubjectType: FOLDER_SUBJECT_TYPE,
        outcome: 'F7 and F15 active folder identities conflict',
        refreshRequired: true
      });
      return;
    }
    if (bridge.identityMismatch === true || bridge.consistent === false || bridge.warning === true) {
      addDecision(ctx, 'binding-f7-f15-identity-warning', 'warning', 'library-binding-f7-f15-identity-conflict', {
        domain: BINDING_DOMAIN,
        operation: ctx.operation,
        subjectType: BINDING_SUBJECT_TYPE,
        bindingKind: 'chat-folder',
        outcome: 'F7/F15 identity bridge requires operator visibility'
      });
    }
  }

  function inspectCache(ctx) {
    var observation = safeObject(ctx.input.cacheObservation || ctx.input.materializedCacheObservation);
    if (!isObject(ctx.input.cacheObservation) && !isObject(ctx.input.materializedCacheObservation)) return;
    var status = cleanString(observation.status).toLowerCase();
    var drift = observation.drift === true || observation.driftDetected === true ||
      observation.cacheDrift === true || observation.stale === true ||
      status === 'drift' || status === 'drifted' || status === 'stale';
    if (drift) {
      addDecision(ctx, 'cache-drift-warning-only', 'warning', 'library-cache-cross-install-drift', {
        domain: CACHE_DOMAIN,
        operation: ctx.operation,
        subjectType: BINDING_SUBJECT_TYPE,
        outcome: 'materialized cache drift is warning-only',
        warningOnly: true,
        sourceOfTruth: 'library.binding'
      });
    }
  }

  function evaluateCatalog(input) {
    var ctx = buildContext(input, CATALOG_DOMAIN);
    if (!scanPrivacy(ctx, ctx.input)) return finalize(ctx);
    if (!isObject(input)) {
      addDecision(ctx, 'catalog-input-shape', 'blocked', 'library-conflict-runtime-shape-invalid', {
        domain: CATALOG_DOMAIN,
        operation: ctx.operation,
        subjectType: CATALOG_SUBJECT_TYPE,
        outcome: 'input must be an object'
      });
      return finalize(ctx);
    }
    inspectStaleCatalogBase(ctx);
    inspectCatalogNameCollision(ctx);
    inspectCatalogLifecycle(ctx);
    inspectF5(ctx);
    return finalize(ctx);
  }

  function evaluateBinding(input) {
    var ctx = buildContext(input, BINDING_DOMAIN);
    if (!scanPrivacy(ctx, ctx.input)) return finalize(ctx);
    var binding = bindingFrom(safeObject(ctx.input.candidate || ctx.input.currentState || ctx.input.expectedState));
    if (!binding || !cleanString(binding.bindingKind)) {
      addDecision(ctx, 'binding-input-shape', 'blocked', 'library-conflict-runtime-shape-invalid', {
        domain: BINDING_DOMAIN,
        operation: ctx.operation,
        subjectType: BINDING_SUBJECT_TYPE,
        outcome: 'binding shape is missing'
      });
      return finalize(ctx);
    }
    inspectBindingExpectedState(ctx, binding);
    inspectBindingDuplicateAndOneActive(ctx, binding);
    inspectBindingReplacement(ctx);
    inspectBridge(ctx);
    inspectCache(ctx);
    return finalize(ctx);
  }

  function evaluateCache(input) {
    var ctx = buildContext(input, CACHE_DOMAIN);
    if (!scanPrivacy(ctx, ctx.input)) return finalize(ctx);
    inspectCache(ctx);
    return finalize(ctx);
  }

  function evaluateF5(input) {
    var ctx = buildContext(input, F5_DOMAIN);
    if (!scanPrivacy(ctx, ctx.input)) return finalize(ctx);
    inspectF5(ctx);
    return finalize(ctx);
  }

  function classifyBulkRows(input) {
    var ctx = buildContext(input, BULK_DOMAIN);
    if (!scanPrivacy(ctx, ctx.input)) return finalize(ctx);
    var rows = asArray(ctx.input.bulkRows);
    var conflictCount = 0;
    var idempotentCount = 0;
    rows.forEach(function (row, index) {
      var r = safeObject(row);
      var rowDomain = cleanString(r.domain || r.subjectType || r.itemDomain) || BINDING_DOMAIN;
      if (r.conflict === true || r.blocked === true || cleanString(r.status) === 'conflict') {
        conflictCount += 1;
        ctx.conflictDetected = true;
        addDecision(ctx, 'bulk-row-partial-conflict', 'partial-conflict', 'library-bulk-cross-install-partial-conflict', {
          domain: BULK_DOMAIN,
          operation: ctx.operation || 'bulk-import',
          rowIndex: index,
          rowDomain: rowDomain,
          outcome: 'bulk row classified as partial conflict',
          retrySafe: true
        });
        addCode(ctx.warnings, 'library-bulk-cross-install-partial-conflict');
      } else if (r.duplicate === true || r.exactReplay === true || cleanString(r.status) === 'duplicate') {
        idempotentCount += 1;
        addDecision(ctx, 'bulk-row-idempotent', 'pass', 'library-binding-cross-install-duplicate-edge', {
          domain: BULK_DOMAIN,
          operation: ctx.operation || 'bulk-import',
          rowIndex: index,
          rowDomain: rowDomain,
          outcome: 'bulk row is idempotent repeat',
          idempotent: true,
          retrySafe: true
        });
      } else {
        addDecision(ctx, 'bulk-row-clean', 'pass', '', {
          domain: BULK_DOMAIN,
          operation: ctx.operation || 'bulk-import',
          rowIndex: index,
          rowDomain: rowDomain,
          outcome: 'bulk row has no conflict evidence'
        });
      }
    });
    ctx.bulkSummary = {
      rowCount: rows.length,
      conflictCount: conflictCount,
      idempotentCount: idempotentCount,
      retrySafe: conflictCount > 0 || idempotentCount > 0
    };
    if (conflictCount > 0) ctx.retrySafe = true;
    return finalize(ctx);
  }

  function finalize(ctx) {
    var blockers = codeList(ctx.blockers);
    var warnings = codeList(ctx.warnings);
    var hasPartialConflict = ctx.decisions.some(function (decision) {
      return decision.status === 'partial-conflict' || decision.status === 'conflict';
    });
    var hasBlockerDecision = ctx.decisions.some(function (decision) {
      return decision.severity === 'blocker';
    });
    var conflictFree = blockers.length === 0 && !hasPartialConflict && !hasBlockerDecision;
    var proofSummary = Object.assign({
      decisionCount: ctx.decisions.length,
      blockerCount: blockers.length,
      warningCount: warnings.length,
      taxonomyCodesCovered: TAXONOMY_CODES.length,
      guardCodesCovered: GUARD_CODES.length,
      proofCaseNamesCovered: PROOF_CASE_NAMES.length
    }, safeObject(ctx.bulkSummary));
    return {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      conflictFree: conflictFree,
      domain: ctx.domain,
      mode: ctx.mode,
      operation: ctx.operation,
      decisions: ctx.decisions,
      blockers: blockers,
      warnings: warnings,
      refreshRequired: ctx.refreshRequired === true || warnings.indexOf('library-conflict-refresh-required') !== -1,
      retrySafe: ctx.retrySafe === true,
      proofSummary: proofSummary,
      privacy: ctx.privacy,
      sideEffectSummary: sideEffectSummary(),
      observedAtIso: ctx.observedAtIso
    };
  }

  function evaluateLibraryRuntimeConflict(input) {
    var args = safeObject(input);
    var domain = cleanString(args.domain);
    if (domain === CATALOG_DOMAIN) return evaluateCatalog(args);
    if (domain === BINDING_DOMAIN) return evaluateBinding(args);
    if (domain === CACHE_DOMAIN) return evaluateCache(args);
    if (domain === BULK_DOMAIN) return classifyBulkRows(args);
    if (domain === F5_DOMAIN) return evaluateF5(args);
    var ctx = buildContext(args, domain);
    addDecision(ctx, 'runtime-conflict-domain', 'blocked', 'library-conflict-runtime-shape-invalid', {
      domain: domain,
      operation: ctx.operation,
      outcome: 'unsupported conflict runtime domain'
    });
    return finalize(ctx);
  }

  function evaluateLibraryCatalogRuntimeConflict(input) {
    return evaluateCatalog(Object.assign({}, safeObject(input), { domain: CATALOG_DOMAIN }));
  }

  function evaluateLibraryBindingRuntimeConflict(input) {
    return evaluateBinding(Object.assign({}, safeObject(input), { domain: BINDING_DOMAIN }));
  }

  function classifyLibraryBulkRuntimeConflictRows(input) {
    return classifyBulkRows(Object.assign({}, safeObject(input), { domain: BULK_DOMAIN, mode: cleanString(safeObject(input).mode) || 'bulk' }));
  }

  H2O.Desktop.Sync.evaluateLibraryRuntimeConflict = evaluateLibraryRuntimeConflict;
  H2O.Desktop.Sync.evaluateLibraryCatalogRuntimeConflict = evaluateLibraryCatalogRuntimeConflict;
  H2O.Desktop.Sync.evaluateLibraryBindingRuntimeConflict = evaluateLibraryBindingRuntimeConflict;
  H2O.Desktop.Sync.classifyLibraryBulkRuntimeConflictRows = classifyLibraryBulkRuntimeConflictRows;
  H2O.Desktop.Sync.__libraryConflictRuntimeInstalled = true;
  H2O.Desktop.Sync.__libraryConflictRuntimeVersion = VERSION;

})(typeof window !== 'undefined' ? window : globalThis);
