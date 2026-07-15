/*
 * CV-3.2 reversible canonical-source canary console harness.
 *
 * Paste this whole file into the authenticated ChatGPT tab's DevTools console.
 * Evaluation only installs window.H2O_CV3_CANARY. It does not run a stage,
 * switch sources, click branches, submit prompts, scroll, or rebuild MiniMap.
 */
(() => {
  'use strict';

  const G = globalThis;
  const VERSION = 'cv3.2-canary-harness-v5.1';
  const EVIDENCE_SCHEMA_VERSION = 5;
  const SOURCE_LEGACY = 'legacy-durable-cache';
  const SOURCE_LEDGER = 'chat-atlas-ledger';
  const STAGE_PREFIX = 'h2o:cv3:';
  const BASELINE_KEY = 'h2o:cv3:legacy-baseline';
  const RUN_ID_KEY = 'h2o:cv3:run-id';
  const CHECKPOINT_KEY = 'h2o:cv3:checkpoint:v2';
  const LEGACY_CHECKPOINT_KEYS = Object.freeze(['h2o:cv3:checkpoint:v1']);
  const CHECKPOINT_SCHEMA_VERSION = 2;
  const CHECKPOINT_TTL_MS = 24 * 60 * 60 * 1000;
  const CHECKPOINT_MAX_BYTES = 16 * 1024;
  const STAGE_RECORD_MAX_CHARS = 900000;
  const MOVEMENT_HELPER_KEY = 'h2o:cv3-3:navigation:v1';
  const MOVEMENT_HELPER_VERSION = 'cv3.3-navigation-spot-check-v1';
  const MOVEMENT_HELPER_SCHEMA_VERSION = 1;
  const SESSION_ONLY_STAGES = new Set(['P4_ARM', 'P5_ARM', 'P6_ARM', 'P7_ARM', 'P9_ARM']);
  const DURABLE_STAGES = new Set([
    'P0',
    'P1',
    'P2',
    'P3',
    'P4',
    'P5',
    'P6',
    'P7',
    'P7_DURING',
    'P8',
    'P8_RELOAD',
    'P9',
    'P10',
  ]);
  const TURN_UPDATED_EVENT = 'evt:h2o:core:turn:updated';
  const ROLLBACK_INSTRUCTION = [
    'Run: await H2O_CV3_CANARY.P8()',
    'If normal rollback fails or throws: reload the page immediately.',
    'After reload, reinstall this harness and run: await H2O_CV3_CANARY.P8_RELOAD_VERIFY()',
  ];
  const OPTIONAL = 'optional';
  let currentRunId = null;
  const volatileStageStates = new Map();

  function nowIso() {
    return new Date().toISOString();
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function asString(value) {
    return value == null ? '' : String(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function uniqueOrdered(values) {
    const seen = new Set();
    const result = [];
    for (const raw of values || []) {
      const value = asString(raw).trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
    return result;
  }

  function stableValue(value, depth = 0, seen = new WeakSet()) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (depth > 12) return '[depth-limit]';
    if (typeof Element !== 'undefined' && value instanceof Element) {
      return {
        element: true,
        tag: value.tagName,
        id: value.id || null,
        cgxui: value.getAttribute?.('data-cgxui') || null,
      };
    }
    if (value instanceof Map) {
      return Array.from(value.entries()).map(([key, item]) => [stableValue(key, depth + 1, seen), stableValue(item, depth + 1, seen)]);
    }
    if (value instanceof Set) return Array.from(value).map((item) => stableValue(item, depth + 1, seen));
    if (Array.isArray(value)) return value.slice(0, 500).map((item) => stableValue(item, depth + 1, seen));
    if (typeof value === 'object') {
      if (seen.has(value)) return '[circular]';
      seen.add(value);
      const output = {};
      for (const key of Object.keys(value).sort()) {
        const item = stableValue(value[key], depth + 1, seen);
        if (item !== undefined) output[key] = item;
      }
      seen.delete(value);
      return output;
    }
    return String(value);
  }

  function stableJson(value) {
    return JSON.stringify(stableValue(value));
  }

  function hash64(value) {
    const text = asString(value);
    let hash = 0xcbf29ce484222325n;
    for (const character of text) {
      const codePoint = BigInt(character.codePointAt(0));
      hash ^= codePoint;
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
  }

  function fingerprintRows(value) {
    const rows = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const serialized = stableJson(rows);
    return {
      algorithm: 'fnv1a64-codepoint-v1',
      count: rows.length,
      serializedChars: serialized.length,
      hash: hash64(serialized),
    };
  }

  function utf8ByteLength(value) {
    let bytes = 0;
    for (const character of asString(value)) {
      const codePoint = character.codePointAt(0);
      bytes += codePoint <= 0x7f ? 1 : (codePoint <= 0x7ff ? 2 : (codePoint <= 0xffff ? 3 : 4));
    }
    return bytes;
  }

  function storageRead(storage, key) {
    try {
      return storage?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  }

  function storageWrite(storage, key, value) {
    try {
      storage?.setItem?.(key, value);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: 'storage-write-failed', error: asString(error?.message || error) };
    }
  }

  function storageKeys(storage) {
    const keys = [];
    try {
      for (let index = 0; index < asNumber(storage?.length); index += 1) {
        const key = storage?.key?.(index);
        if (key != null) keys.push(asString(key));
      }
    } catch {
      return [];
    }
    return keys;
  }

  function readStored(key) {
    const raw = storageRead(G.sessionStorage, key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeStored(key, value) {
    const normalized = stableValue(value);
    const raw = JSON.stringify(normalized);
    if (raw.length > STAGE_RECORD_MAX_CHARS) throw new Error(`bounded-evidence-limit-exceeded:${key}:${raw.length}`);
    const write = storageWrite(G.sessionStorage, key, raw);
    if (!write.ok) throw new Error(`${write.reason}:${key}:${write.error || 'unknown'}`);
    return normalized;
  }

  function stageName(stage) {
    return asString(stage).trim().toUpperCase().replace(/-/g, '_');
  }

  function stageStorageKey(stage) {
    return `${STAGE_PREFIX}${stageName(stage).toLowerCase().replace(/_/g, '-')}`;
  }

  function getCurrentRunId() {
    if (currentRunId) return currentRunId;
    currentRunId = asString(storageRead(G.sessionStorage, RUN_ID_KEY)).trim() || null;
    return currentRunId;
  }

  function generateRunId() {
    const uuid = safeRead(() => G.crypto?.randomUUID?.(), '');
    if (uuid) return `cv3-${uuid}`;
    const bytes = new Uint32Array(4);
    const generated = safeRead(() => {
      G.crypto?.getRandomValues?.(bytes);
      return Array.from(bytes).map((value) => value.toString(16).padStart(8, '0')).join('');
    }, '');
    if (generated) return `cv3-${generated}`;
    return `cv3-${Date.now().toString(36)}-${asNumber(G.performance?.now?.()).toString(36)}`;
  }

  function compactSource(source) {
    if (!source || typeof source !== 'object') return null;
    return {
      activeSource: source.activeSource || null,
      effectiveSource: source.effectiveSource || null,
      defaultSource: source.defaultSource || null,
      supportedSources: asArray(source.supportedSources).slice(0, 8),
      persisted: source.persisted ?? null,
      switchCount: asNumber(source.switchCount),
      invalidSwitchCount: asNumber(source.invalidSwitchCount),
      rejectedSwitchCount: asNumber(source.rejectedSwitchCount),
      lastSourceSwitch: stableValue(source.lastSourceSwitch || null),
      lastSelection: stableValue(source.lastSelection || null),
    };
  }

  function compactCounts(counts) {
    if (!counts || typeof counts !== 'object') return null;
    return Object.fromEntries([
      'canonical',
      'ledger',
      'miniMap',
      'mapButtons',
      'turnById',
      'coreTurnList',
    ].map((key) => [key, counts[key] ?? null]));
  }

  function compactAliasGauges(alias) {
    if (!alias || typeof alias !== 'object') return null;
    const gauges = Object.fromEntries([
      'currentCrossMemberDuplicateCount',
      'crossMemberAliasConflictCount',
      'crossMemberAliasRepairCount',
      'currentAliasConflictCount',
      'historicalAliasConflictCount',
      'duplicateAliasCount',
      'quarantinedAliasCount',
      'quarantinedAliasResolutionCount',
    ].map((key) => [key, asNumber(alias[key])]));
    return {
      ...gauges,
      recentAliasConflicts: asArray(alias.recentAliasConflicts).slice(-12).map((row) => stableValue(row)),
      quarantinedAliases: asArray(alias.quarantinedAliases).slice(0, 12).map((row) => stableValue(row)),
    };
  }

  function compactDualRun(dualRun) {
    if (!dualRun || typeof dualRun !== 'object') return null;
    const scalarKeys = [
      'ready',
      'comparisonEligible',
      'exactParity',
      'countParity',
      'orderParity',
      'fieldShapeParity',
      'comparisonCount',
      'skippedComparisonCount',
      'cleanComparisonStreak',
      'legacyCount',
      'adapterCount',
      'currentMismatchCount',
      'totalMismatchCount',
      'missingInLegacyCount',
      'missingInAdapterCount',
      'duplicateIdentityCount',
      'duplicateAliasCount',
      'primaryRekeyCount',
      'instrumentationErrorCount',
      'captureSequence',
      'captureGeneration',
      'comparedLedgerGeneration',
      'flushSequence',
      'rebaseCount',
      'evidenceChatKey',
      'captureChatKey',
      'ledgerChatKey',
      'lastSkipReason',
      'lastComparisonTimestamp',
      'lastInstrumentationError',
    ];
    return Object.fromEntries(scalarKeys.map((key) => {
      const value = dualRun[key];
      if (typeof value === 'number') return [key, asNumber(value)];
      if (typeof value === 'boolean') return [key, value];
      return [key, value ?? null];
    }));
  }

  function compactConvergence(convergence) {
    if (!convergence || typeof convergence !== 'object') return null;
    return {
      parityStatus: convergence.parityStatus || null,
      blockers: asArray(convergence.blockers).slice(0, 12),
      blockerCount: asArray(convergence.blockers).length,
    };
  }

  function compactScalarTree(value, depth = 0) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (depth >= 5 || typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      compactScalarTree(item, depth + 1),
    ]).filter(([, item]) => item !== null));
  }

  function compactIdentityDriftRow(row) {
    return {
      turnNo: asNumber(row?.turnNo),
      reasons: uniqueOrdered(asArray(row?.reasons)).slice(0, 12),
      expected: row?.expected ? {
        qId: row.expected.qId || null,
        primaryAId: row.expected.primaryAId || null,
        noAnswer: row.expected.noAnswer === true,
      } : null,
      actual: row?.actual ? {
        qId: row.actual.qId || null,
        primaryAId: row.actual.primaryAId || null,
        noAnswer: row.actual.noAnswer === true,
      } : null,
    };
  }

  function compactEvidenceState(fullState) {
    if (!fullState || typeof fullState !== 'object') return null;
    const alignment = fullState.miniMapIdentityAlignment || {};
    const fingerprints = {};
    for (const [name, rows] of [
      ['canonicalRecords', fullState.canonicalRecords],
      ['ledgerMembers', fullState.ledgerSnapshot?.members],
      ['perTurn', fullState.perTurn],
      ['miniMapBoxes', fullState.miniMapBoxes],
      ['visibleAnswerNumbers', fullState.visibleNumbers?.answer],
      ['visibleQuestionNumbers', fullState.visibleNumbers?.question],
      ['pageDividers', fullState.pageDividers],
      ['titleBars', fullState.titleBars],
      ['timestamps', fullState.timestamps],
      ['washerRows', fullState.washerProjection?.rows],
    ]) {
      if (rows !== undefined) fingerprints[name] = fingerprintRows(rows);
    }
    return stableValue({
      evidenceSchema: EVIDENCE_SCHEMA_VERSION,
      href: fullState.href || null,
      activeChatKey: fullState.activeChatKey || null,
      turnVersion: asNumber(fullState.turnVersion),
      source: compactSource(fullState.source),
      counts: compactCounts(fullState.counts),
      ledgerSummary: fullState.ledgerSummary ? {
        ledgerReady: fullState.ledgerSummary.ledgerReady === true,
        chatKey: fullState.ledgerSummary.chatKey || null,
        version: asNumber(fullState.ledgerSummary.version),
        memberCount: asNumber(fullState.ledgerSummary.memberCount),
        completeShellMap: fullState.ledgerSummary.completeShellMap ?? null,
      } : null,
      dualRun: compactDualRun(fullState.dualRun),
      convergence: compactConvergence(fullState.convergence),
      aliasDiagnostics: compactAliasGauges(fullState.aliasDiagnostics),
      miniMapAutomaticRefresh: compactScalarTree(fullState.miniMapAutomaticRefresh),
      miniMapIdentityAlignment: {
        ok: alignment.ok === true,
        duplicateTurnNos: asArray(alignment.duplicateTurns).slice(0, 24),
        duplicateTurnCount: asArray(alignment.duplicateTurns).length,
        driftCount: asArray(alignment.drifts).length,
        driftRows: asArray(alignment.drifts).slice(0, 12).map(compactIdentityDriftRow),
      },
      fingerprints,
    });
  }

  function compactBaselineTurn(row) {
    return stableValue({
      turnNo: asNumber(row?.turnNo),
      logicalMemberKey: row?.logicalMemberKey || null,
      qId: row?.qId || null,
      primaryAId: row?.primaryAId || null,
      answerIds: asArray(row?.answerIds).slice(),
      currentAnswerIds: asArray(row?.currentAnswerIds).slice(),
      currentAliases: asArray(row?.currentAliases).slice(),
      questionCurrentAliases: asArray(row?.questionCurrentAliases).slice(),
      answerCurrentAliases: asArray(row?.answerCurrentAliases).slice(),
      questionResolverAliases: asArray(row?.questionResolverAliases).slice(),
      answerResolverAliases: asArray(row?.answerResolverAliases).slice(),
      resolverAliases: asArray(row?.resolverAliases).slice(),
      answerCurrentShells: asArray(row?.answerCurrentShells).map((shell) => ({
        shellTurnId: shell?.shellTurnId || null,
        messageId: shell?.messageId || null,
        currentAnswerId: shell?.currentAnswerId || null,
      })),
      noAnswer: row?.noAnswer === true,
      hydration: row?.hydration || 'none',
      pageNo: asNumber(row?.pageNo),
    });
  }

  function compactBaselineState(fullState) {
    const compact = compactEvidenceState(fullState);
    const perTurn = asArray(fullState?.perTurn).map(compactBaselineTurn);
    return stableValue({
      evidenceSchema: EVIDENCE_SCHEMA_VERSION,
      capturedAt: nowIso(),
      href: compact?.href || null,
      activeChatKey: compact?.activeChatKey || null,
      turnVersion: compact?.turnVersion || 0,
      source: compact?.source || null,
      counts: compact?.counts || null,
      ledgerSummary: compact?.ledgerSummary || null,
      perTurn,
      fingerprints: {
        ...compact?.fingerprints,
        baselinePerTurn: fingerprintRows(perTurn),
      },
    });
  }

  function compactStageSummary(result) {
    const state = result?.state || result?.after || result?.before || null;
    const before = result?.before || null;
    const after = result?.after || result?.state || null;
    return stableValue({
      stage: stageName(result?.stage),
      capturedAt: result?.capturedAt || nowIso(),
      ok: result?.ok === true,
      failureReasons: uniqueOrdered(asArray(result?.failureReasons)).slice(0, 24),
      gates: Object.fromEntries(Object.entries(result?.gates || {})
        .filter(([, value]) => typeof value === 'boolean')
        .slice(0, 40)),
      sourceBefore: compactSource(before?.source),
      sourceAfter: compactSource(after?.source || state?.source),
      counts: compactCounts(state?.counts),
      aliasGauges: compactAliasGauges(state?.aliasDiagnostics),
      dualRun: compactDualRun(state?.dualRun),
      convergence: compactConvergence(state?.convergence),
      emergencyRollbackRequired: !!result?.emergencyRollbackRequired,
      emergencyRollbackUsed: !!result?.emergencyRollbackUsed,
      evidenceDegraded: result?.evidenceDegraded === true,
      changed: result?.changed ?? null,
      error: result?.error ? asString(result.error).slice(0, 500) : null,
    });
  }

  function compactCheckpointStageSummary(result) {
    const summary = compactStageSummary(result);
    const checkpointSource = (source) => source ? {
      activeSource: source.activeSource || null,
      effectiveSource: source.effectiveSource || null,
      defaultSource: source.defaultSource || null,
      persisted: source.persisted ?? null,
      switchCount: asNumber(source.switchCount),
    } : null;
    const checkpointAliases = (alias) => alias ? Object.fromEntries([
      'currentCrossMemberDuplicateCount',
      'crossMemberAliasConflictCount',
      'currentAliasConflictCount',
      'historicalAliasConflictCount',
      'duplicateAliasCount',
      'quarantinedAliasCount',
    ].map((key) => [key, asNumber(alias[key])])) : null;
    const checkpointDualRun = (dualRun) => dualRun ? {
      ready: dualRun.ready === true,
      exactParity: dualRun.exactParity === true,
      currentMismatchCount: asNumber(dualRun.currentMismatchCount),
      totalMismatchCount: asNumber(dualRun.totalMismatchCount),
      instrumentationErrorCount: asNumber(dualRun.instrumentationErrorCount),
    } : null;
    const compact = {
      stage: summary.stage,
      capturedAt: summary.capturedAt,
      ok: summary.ok,
    };
    if (summary.failureReasons.length) compact.failureReasons = summary.failureReasons;
    if (Object.keys(summary.gates).length) compact.gates = summary.gates;
    if (summary.sourceBefore) compact.sourceBefore = checkpointSource(summary.sourceBefore);
    if (summary.sourceAfter) compact.sourceAfter = checkpointSource(summary.sourceAfter);
    if (summary.counts) compact.counts = summary.counts;
    if (summary.aliasGauges) compact.aliasGauges = checkpointAliases(summary.aliasGauges);
    if (summary.dualRun) compact.dualRun = checkpointDualRun(summary.dualRun);
    if (summary.convergence) compact.convergence = summary.convergence;
    if (summary.emergencyRollbackRequired) compact.emergencyRollbackRequired = true;
    if (summary.emergencyRollbackUsed) compact.emergencyRollbackUsed = true;
    if (summary.evidenceDegraded) compact.evidenceDegraded = true;
    if (summary.changed != null) compact.changed = summary.changed;
    if (summary.error) compact.error = summary.error;
    return stableValue(compact);
  }

  function checkpointStagePolicy(stage) {
    const name = stageName(stage);
    if (SESSION_ONLY_STAGES.has(name)) return 'session-only';
    if (DURABLE_STAGES.has(name)) return 'durable';
    return 'unsupported';
  }

  function checkpointRequiredField(checkpoint) {
    for (const field of [
      'schemaVersion',
      'harnessVersion',
      'runId',
      'chatKey',
      'createdAt',
      'updatedAt',
      'expiresAt',
      'ttlMs',
      'stages',
    ]) {
      if (!(field in (checkpoint || {}))) return field;
    }
    return null;
  }

  function readCheckpoint(options = {}) {
    const raw = storageRead(G.localStorage, CHECKPOINT_KEY);
    if (!raw) return { ok: false, reason: 'checkpoint-missing' };
    let checkpoint;
    try {
      checkpoint = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'checkpoint-malformed-json' };
    }
    if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
      return { ok: false, reason: 'checkpoint-invalid-shape' };
    }
    const missing = checkpointRequiredField(checkpoint);
    if (missing) return { ok: false, reason: `checkpoint-missing-required-field:${missing}` };
    if (checkpoint.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
      return { ok: false, reason: 'checkpoint-unsupported-schema-version' };
    }
    if (checkpoint.harnessVersion !== VERSION) {
      return { ok: false, reason: 'checkpoint-foreign-harness-version' };
    }
    if (!checkpoint.runId || !checkpoint.chatKey || !checkpoint.createdAt
      || !checkpoint.updatedAt || !checkpoint.expiresAt
      || checkpoint.ttlMs !== CHECKPOINT_TTL_MS
      || !checkpoint.stages || typeof checkpoint.stages !== 'object'
      || Array.isArray(checkpoint.stages)) {
      return { ok: false, reason: 'checkpoint-invalid-required-field' };
    }
    const nowMs = asNumber(options.nowMs, Date.now());
    const expiresMs = Date.parse(checkpoint.expiresAt);
    if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
      return { ok: false, reason: 'checkpoint-expired' };
    }
    const expectedChatKey = options.chatKey === undefined ? activeChatKey() : options.chatKey;
    if (expectedChatKey && comparableChatKey(expectedChatKey) !== comparableChatKey(checkpoint.chatKey)) {
      return { ok: false, reason: 'checkpoint-foreign-chat' };
    }
    const expectedRunId = options.runId === undefined ? getCurrentRunId() : options.runId;
    if (expectedRunId && expectedRunId !== checkpoint.runId) {
      return { ok: false, reason: 'checkpoint-foreign-run' };
    }
    return { ok: true, checkpoint: stableValue(checkpoint), bytes: utf8ByteLength(raw) };
  }

  function writeCheckpoint(checkpoint) {
    const normalized = stableValue(checkpoint);
    const raw = JSON.stringify(normalized);
    const bytes = utf8ByteLength(raw);
    if (bytes > CHECKPOINT_MAX_BYTES) {
      return {
        ok: false,
        reason: 'checkpoint-size-limit-exceeded',
        bytes,
        limitBytes: CHECKPOINT_MAX_BYTES,
      };
    }
    const write = storageWrite(G.localStorage, CHECKPOINT_KEY, raw);
    return write.ok
      ? { ok: true, bytes, limitBytes: CHECKPOINT_MAX_BYTES }
      : { ...write, bytes, limitBytes: CHECKPOINT_MAX_BYTES };
  }

  function foreignSessionEvidenceReason() {
    for (const key of storageKeys(G.sessionStorage)) {
      if (!key.startsWith(STAGE_PREFIX) || key === RUN_ID_KEY) continue;
      const raw = storageRead(G.sessionStorage, key);
      if (!raw) continue;
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        return 'session-evidence-malformed-cleanup-required';
      }
      if (value?.evidenceSchema !== EVIDENCE_SCHEMA_VERSION) {
        return 'session-evidence-foreign-schema-cleanup-required';
      }
    }
    return null;
  }

  function beginFreshRun() {
    const foreignSessionEvidence = foreignSessionEvidenceReason();
    if (foreignSessionEvidence) return { ok: false, reason: foreignSessionEvidence };
    const existingRunId = getCurrentRunId();
    if (existingRunId) {
      const existing = readCheckpoint({ runId: existingRunId });
      return existing.ok
        ? { ok: true, runId: existingRunId, resumed: true, checkpoint: existing.checkpoint }
        : { ok: false, reason: existing.reason };
    }
    const existingRaw = storageRead(G.localStorage, CHECKPOINT_KEY);
    if (existingRaw) {
      const existing = readCheckpoint({ runId: null });
      return {
        ok: false,
        reason: existing.ok
          ? 'checkpoint-existing-run-requires-cleanup'
          : `checkpoint-existing-invalid:${existing.reason}`,
      };
    }
    const legacyCheckpointKey = LEGACY_CHECKPOINT_KEYS.find((key) => storageRead(G.localStorage, key));
    if (legacyCheckpointKey) {
      return {
        ok: false,
        reason: 'checkpoint-legacy-evidence-requires-cleanup',
        legacyCheckpointKey,
      };
    }
    const existingSessionKeys = storageKeys(G.sessionStorage).filter((key) => key.startsWith(STAGE_PREFIX));
    if (existingSessionKeys.length) {
      return { ok: false, reason: 'session-evidence-existing-cleanup-required' };
    }
    const chatKey = activeChatKey();
    if (!chatKey) return { ok: false, reason: 'checkpoint-chat-key-missing' };
    const runId = generateRunId();
    const createdAt = nowIso();
    const checkpoint = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      harnessVersion: VERSION,
      runId,
      chatKey,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.parse(createdAt) + CHECKPOINT_TTL_MS).toISOString(),
      ttlMs: CHECKPOINT_TTL_MS,
      stages: {},
    };
    const write = writeCheckpoint(checkpoint);
    if (!write.ok) return write;
    currentRunId = runId;
    const sessionWrite = storageWrite(G.sessionStorage, RUN_ID_KEY, runId);
    if (!sessionWrite.ok) return sessionWrite;
    return { ok: true, runId, resumed: false, checkpoint, checkpointWrite: write };
  }

  function adoptCheckpointRun(checkpoint) {
    currentRunId = checkpoint?.runId || null;
    if (!currentRunId) return { ok: false, reason: 'checkpoint-run-id-missing' };
    const write = storageWrite(G.sessionStorage, RUN_ID_KEY, currentRunId);
    return write.ok ? { ok: true, runId: currentRunId } : write;
  }

  function checkpointWriteResult(value = {}) {
    return {
      ok: value.ok === true,
      skipped: value.skipped === true,
      reason: value.reason || null,
      bytes: value.bytes == null ? null : asNumber(value.bytes),
      limitBytes: value.limitBytes == null ? CHECKPOINT_MAX_BYTES : asNumber(value.limitBytes),
    };
  }

  function previewCheckpointStage(result) {
    const policy = checkpointStagePolicy(result?.stage);
    if (policy === 'session-only') {
      return {
        ok: true,
        checkpoint: null,
        checkpointWrite: checkpointWriteResult({
          ok: true,
          skipped: true,
          reason: 'session-only-stage',
        }),
      };
    }
    if (policy !== 'durable') {
      return {
        ok: false,
        checkpoint: null,
        checkpointWrite: checkpointWriteResult({
          ok: false,
          reason: 'checkpoint-stage-policy-unsupported',
        }),
      };
    }
    const runId = getCurrentRunId();
    if (!runId) {
      return {
        ok: false,
        checkpoint: null,
        checkpointWrite: checkpointWriteResult({ ok: false, reason: 'checkpoint-run-not-established' }),
      };
    }
    const read = readCheckpoint({ runId });
    if (!read.ok) {
      return {
        ok: false,
        checkpoint: null,
        checkpointWrite: checkpointWriteResult({ ok: false, reason: read.reason }),
      };
    }
    const updatedAt = nowIso();
    const checkpoint = {
      ...read.checkpoint,
      updatedAt,
      stages: {
        ...read.checkpoint.stages,
        [stageName(result.stage)]: compactCheckpointStageSummary(result),
      },
    };
    const raw = stableJson(checkpoint);
    const bytes = utf8ByteLength(raw);
    const checkpointWrite = checkpointWriteResult(bytes > CHECKPOINT_MAX_BYTES
      ? {
        ok: false,
        reason: 'checkpoint-size-limit-exceeded',
        bytes,
      }
      : {
        ok: true,
        bytes,
      });
    return { ok: checkpointWrite.ok, checkpoint, checkpointWrite };
  }

  function buildStageRecord(stage, payload, capturedAt, checkpointWrite) {
    return stableValue({
      ...payload,
      stage: stageName(stage),
      capturedAt,
      evidenceSchema: EVIDENCE_SCHEMA_VERSION,
      checkpointWrite: checkpointWriteResult(checkpointWrite),
    });
  }

  function serializeStageRecord(record) {
    const normalized = stableValue(record);
    const raw = JSON.stringify(normalized);
    return {
      normalized,
      raw,
      chars: raw.length,
      bytes: utf8ByteLength(raw),
      limitChars: STAGE_RECORD_MAX_CHARS,
    };
  }

  function predictStageCapacity(stage, payload, options = {}) {
    const capturedAt = options.capturedAt || nowIso();
    const base = buildStageRecord(stage, payload, capturedAt, { ok: true });
    const preview = previewCheckpointStage(base);
    const candidate = buildStageRecord(stage, payload, capturedAt, preview.checkpointWrite);
    const measurement = serializeStageRecord(candidate);
    const reasons = [];
    if (!preview.ok) reasons.push(`checkpoint:${preview.checkpointWrite.reason}`);
    if (measurement.chars > STAGE_RECORD_MAX_CHARS) reasons.push('stage-record-size-limit-exceeded');
    return {
      ok: reasons.length === 0,
      reasons,
      measurement,
      checkpointPreview: preview,
      record: candidate,
    };
  }

  function saveStage(stage, payload) {
    const capturedAt = nowIso();
    const prediction = predictStageCapacity(stage, payload, { capturedAt });
    let result = prediction.record;
    if (!prediction.ok) {
      result = buildStageRecord(stage, {
        ...payload,
        ok: false,
        failureReasons: uniqueOrdered([
          ...asArray(payload?.failureReasons),
          ...prediction.reasons.map((reason) => `evidence:${reason}`),
        ]),
        capacity: {
          ok: false,
          chars: prediction.measurement.chars,
          bytes: prediction.measurement.bytes,
          limitChars: STAGE_RECORD_MAX_CHARS,
        },
      }, capturedAt, prediction.checkpointPreview.checkpointWrite);
      const failedMeasurement = serializeStageRecord(result);
      if (failedMeasurement.chars <= STAGE_RECORD_MAX_CHARS) {
        writeStored(stageStorageKey(stage), result);
      }
      console.error(`[CV-3.2 ${stageName(stage)} EVIDENCE REFUSAL]`, compactStageSummary(result));
      return result;
    }

    const policy = checkpointStagePolicy(stage);
    if (policy === 'durable') {
      const actualWrite = writeCheckpoint(prediction.checkpointPreview.checkpoint);
      result = buildStageRecord(stage, payload, capturedAt, actualWrite);
      if (!actualWrite.ok) {
        result.ok = false;
        result.failureReasons = uniqueOrdered([
          ...asArray(result.failureReasons),
          `checkpoint:${actualWrite.reason}`,
        ]);
        console.error('[CV-3.2 CHECKPOINT FAILURE]', compactStageSummary(result));
      }
    }
    writeStored(stageStorageKey(stage), result);
    if (result.ok === false) console.error(`[CV-3.2 ${stageName(stage)} FAILURE]`, compactStageSummary(result));
    else console.log(`[CV-3.2 ${stageName(stage)}]`, result);
    return result;
  }

  function getStage(stage) {
    return readStored(stageStorageKey(stage));
  }

  function safeRead(fn, fallback = null) {
    try {
      const value = fn();
      return value === undefined ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function runtime() {
    return G.H2O?.turnRuntime || null;
  }

  function activeChatKey() {
    const fromApi = safeRead(() => G.H2O?.surface?.chatId?.(), '');
    if (fromApi) return asString(fromApi);
    const path = asString(G.location?.pathname);
    const match = path.match(/\/(?:c|g\/[^/]+\/c)\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function comparableChatKey(value) {
    const text = asString(value).trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (!text) return '';
    const match = text.match(/(?:^|\/)(?:c\/)?([^/]+)$/);
    return asString(match?.[1] || text);
  }

  function canonicalRecords() {
    const rt = runtime();
    const records = safeRead(() => rt?.listTurnRecords?.(), []);
    return asArray(records).slice().sort((a, b) => {
      return asNumber(a?.turnNo || a?.idx || a?.index) - asNumber(b?.turnNo || b?.idx || b?.index);
    });
  }

  function ledgerSnapshot() {
    return safeRead(() => runtime()?.getChatAtlasLedgerSnapshot?.(), { ledgerReady: false, members: [] });
  }

  function ledgerDiagnostics() {
    return safeRead(() => runtime()?.getChatAtlasLedgerDiagnostics?.(), { ledgerReady: false });
  }

  function convergenceParity() {
    return safeRead(() => runtime()?.getChatAtlasConvergenceParity?.(), {
      parityStatus: 'unknown',
      blockers: ['convergence-api-unavailable'],
    });
  }

  function sourceState(diagnostics = ledgerDiagnostics()) {
    const source = diagnostics?.canonicalSource || {};
    const active = safeRead(() => runtime()?.getChatAtlasCanonicalSource?.(), null);
    return {
      activeSource: active || source.activeSource || null,
      effectiveSource: source.effectiveSource || null,
      defaultSource: source.defaultSource || null,
      supportedSources: asArray(source.supportedSources).slice(),
      switchCount: asNumber(source.switchCount),
      invalidSwitchCount: asNumber(source.invalidSwitchCount),
      rejectedSwitchCount: asNumber(source.rejectedSwitchCount),
      lastSourceSwitch: source.lastSourceSwitch || null,
      lastSelection: source.lastSelection || null,
      persisted: source.persisted,
    };
  }

  function turnVersion() {
    return asNumber(safeRead(() => G.H2O?.turn?.version?.(), 0));
  }

  function miniMapRoot() {
    return document.querySelector([
      '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"]',
      '[data-h2o-owner="minimap-v10"]',
    ].join(', '));
  }

  function miniMapBoxes() {
    const root = miniMapRoot();
    if (!root) return [];
    return Array.from(root.querySelectorAll('[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"], .cgxui-mm-btn'))
      .map((button, domIndex) => {
        const wrap = button.closest?.('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"], .cgxui-mm-wrap');
        return {
          domIndex,
          label: asString(button.textContent).replace(/\s+/g, ' ').trim().slice(0, 80),
          turnNo: asNumber(button.dataset?.turnIdx || wrap?.dataset?.turnIdx),
          turnId: asString(button.dataset?.turnId || wrap?.dataset?.turnId).replace(/^turn:/, ''),
          qId: asString(button.dataset?.questionId || wrap?.dataset?.questionId),
          primaryAId: asString(button.dataset?.primaryAId || wrap?.dataset?.primaryAId),
          pageNo: asNumber(button.dataset?.page || wrap?.dataset?.page),
          noAnswer: button.hasAttribute?.('data-h2o-no-answer') || wrap?.hasAttribute?.('data-h2o-no-answer') || false,
          washName: button.getAttribute?.('data-h2o-wash-name') || null,
          washId: button.getAttribute?.('data-h2o-wash-id') || null,
        };
      })
      .sort((a, b) => a.domIndex - b.domIndex);
  }

  function compatMapSizes() {
    return {
      mapButtons: G.H2O_MM_mapButtons instanceof Map ? G.H2O_MM_mapButtons.size : null,
      turnById: G.H2O_MM_turnById instanceof Map ? G.H2O_MM_turnById.size : null,
      coreTurnList: asNumber(safeRead(() => G.H2O_MM_CORE_API?.getTurnList?.().length, 0)),
    };
  }

  function miniMapPerf() {
    const stats = safeRead(() => G.H2O?.perf?.modules?.miniMapEngine?.getStats?.(), null);
    return stats ? {
      rebuild: stats.rebuild || null,
      automaticRefresh: stats.automaticRefresh || null,
      rafOnce: stats.rafOnce || null,
      structureRecovery: stats.structureRecovery || null,
    } : null;
  }

  function recordAliases(record) {
    return uniqueOrdered([
      record?.turnId,
      record?.qId,
      record?.primaryAId,
      ...asArray(record?.answerIds),
      ...asArray(record?._aliasIds),
      ...asArray(record?.aliasIds),
    ].map((value) => asString(value).replace(/^turn:/, '')));
  }

  function ledgerRows(snapshot = ledgerSnapshot()) {
    return asArray(snapshot?.members).map((member) => ({
      logicalMemberKey: member?.logicalMemberKey || null,
      turnNo: asNumber(member?.turnNo),
      qId: member?.question?.qId || null,
      primaryAId: member?.answer?.primaryAId || null,
      currentAnswerIds: asArray(member?.answer?.currentAnswerIds).slice(),
      questionCurrentAliases: asArray(member?.question?.currentAliases).slice(),
      answerCurrentAliases: asArray(member?.answer?.currentAliases).slice(),
      questionResolverAliases: asArray(member?.question?.aliases).slice(),
      answerResolverAliases: asArray(member?.answer?.aliases).slice(),
      answerCurrentShells: asArray(member?.answer?.currentShells).map((shell) => ({
        shellTurnId: shell?.shellTurnId || null,
        messageId: shell?.messageId || null,
        currentAnswerId: shell?.currentAnswerId || null,
      })),
      currentProjectionSource: member?.answer?.currentProjectionSource || 'none',
      resolverAliases: asArray(member?.resolverAliases).slice(),
      noAnswer: !!member?.noAnswer,
      hydration: member?.hydration || 'none',
      pageNo: asNumber(member?.pageNo),
      pageIndex: asNumber(member?.pageIndex),
    })).sort((a, b) => a.turnNo - b.turnNo);
  }

  function canonicalRows(records = canonicalRecords()) {
    return records.map((record, index) => {
      const turnNo = asNumber(record?.turnNo || record?.idx || record?.index || index + 1);
      return {
        turnNo,
        idx: record?.idx ?? null,
        turnId: asString(record?.turnId).replace(/^turn:/, '') || null,
        qId: record?.qId || null,
        primaryAId: record?.primaryAId || null,
        answerIds: asArray(record?.answerIds).slice(),
        aliases: asArray(record?._aliasIds).slice(),
        noAnswer: record?.noAnswer === true || record?.hasAssistant === false || (!record?.primaryAId && !asArray(record?.answerIds).length),
        pageNo: turnNo > 0 ? Math.floor((turnNo - 1) / 25) + 1 : 0,
      };
    });
  }

  function perTurnRows(records = canonicalRecords(), snapshot = ledgerSnapshot()) {
    const ledgerByTurn = new Map(ledgerRows(snapshot).map((row) => [row.turnNo, row]));
    return canonicalRows(records).map((record) => {
      const ledger = ledgerByTurn.get(record.turnNo) || null;
      return {
        logicalMemberKey: ledger?.logicalMemberKey || null,
        turnNo: record.turnNo,
        qId: record.qId,
        primaryAId: record.primaryAId,
        currentAnswerIds: ledger?.currentAnswerIds || [],
        currentAliases: uniqueOrdered([
          ...(ledger?.questionCurrentAliases || []),
          ...(ledger?.answerCurrentAliases || []),
        ]),
        questionCurrentAliases: asArray(ledger?.questionCurrentAliases).slice(),
        answerCurrentAliases: asArray(ledger?.answerCurrentAliases).slice(),
        questionResolverAliases: asArray(ledger?.questionResolverAliases).slice(),
        answerResolverAliases: asArray(ledger?.answerResolverAliases).slice(),
        answerCurrentShells: asArray(ledger?.answerCurrentShells).map((shell) => ({ ...shell })),
        currentProjectionSource: ledger?.currentProjectionSource || 'none',
        hydration: ledger?.hydration || 'none',
        resolverAliases: asArray(ledger?.resolverAliases).slice(),
        answerIds: record.answerIds,
        noAnswer: record.noAnswer,
        pageNo: record.pageNo,
      };
    });
  }

  function identityAlignment(records = canonicalRecords(), boxes = miniMapBoxes()) {
    const boxByTurn = new Map();
    const duplicateTurns = [];
    for (const box of boxes) {
      if (boxByTurn.has(box.turnNo)) duplicateTurns.push(box.turnNo);
      else boxByTurn.set(box.turnNo, box);
    }
    const drifts = [];
    for (const row of canonicalRows(records)) {
      const box = boxByTurn.get(row.turnNo);
      const reasons = [];
      if (!box) reasons.push('box-missing');
      else {
        if (row.qId && box.qId && row.qId !== box.qId) reasons.push('question-id-mismatch');
        if (row.primaryAId) {
          if (row.primaryAId !== box.primaryAId) reasons.push('primary-id-mismatch');
        } else if (row.noAnswer && box.primaryAId) reasons.push('no-answer-primary-present');
      }
      if (reasons.length) drifts.push({ turnNo: row.turnNo, expected: row, actual: box || null, reasons });
    }
    return {
      ok: drifts.length === 0 && duplicateTurns.length === 0 && records.length === boxes.length,
      drifts,
      duplicateTurns: uniqueOrdered(duplicateTurns.map(String)).map(Number),
    };
  }

  function visibleNumbers() {
    const read = (selector, type) => Array.from(document.querySelectorAll(selector)).slice(0, 250).map((el) => ({
      type,
      text: asString(el.textContent).replace(/\s+/g, ' ').trim().slice(0, 80),
      number: asNumber(el.getAttribute?.('data-h2o-big-answer-num') || el.getAttribute?.('data-h2o-turn-num') || el.textContent),
      answerId: el.getAttribute?.('data-h2o-big-answer-id') || el.closest?.('[data-message-id]')?.getAttribute?.('data-message-id') || null,
      turnId: el.getAttribute?.('data-h2o-big-answer-turn-id') || el.closest?.('[data-turn-id]')?.getAttribute?.('data-turn-id') || null,
    }));
    return {
      answer: read('[data-h2o-big-answer-num]', 'answer'),
      question: read('.cgxui-qbig-number', 'question'),
    };
  }

  function titleBars() {
    return Array.from(document.querySelectorAll('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]')).slice(0, 250).map((bar) => ({
      turnNo: asNumber(bar.getAttribute?.('data-h2o-turn-num') || bar.getAttribute?.('data-h2o-stack-turn-no')),
      answerId: bar.getAttribute?.('data-answer-id') || null,
      title: asString(bar.textContent).replace(/\s+/g, ' ').trim().slice(0, 160),
      inTitleStack: bar.hasAttribute?.('data-h2o-in-title-stack'),
      washName: bar.getAttribute?.('data-h2o-title-wash') || null,
    }));
  }

  function timestamps() {
    return Array.from(document.querySelectorAll('.cgxui-ats-ts, [data-cgxui="ats-stamp"], .chatgpt-timestamp')).slice(0, 250).map((stamp) => ({
      text: asString(stamp.textContent).replace(/\s+/g, ' ').trim().slice(0, 100),
      fullLabel: stamp.dataset?.fullLabel || null,
      answerId: stamp.closest?.('[data-message-id]')?.getAttribute?.('data-message-id') || null,
    }));
  }

  function pageDividers() {
    const selector = [
      '[data-cgxui*="page-divider"]',
      '[data-h2o-page-num]',
      '[data-page-num][data-cgxui-owner]',
      '[data-cgxui="chat-page-title-list-synth"]',
    ].join(', ');
    return Array.from(document.querySelectorAll(selector)).slice(0, 100).map((el) => ({
      cgxui: el.getAttribute?.('data-cgxui') || null,
      pageNo: asNumber(el.getAttribute?.('data-h2o-page-num') || el.getAttribute?.('data-page-num') || el.dataset?.page),
      text: asString(el.textContent).replace(/\s+/g, ' ').trim().slice(0, 120),
      hidden: !!el.hidden,
    }));
  }

  function washerProjection(records = canonicalRecords(), boxes = miniMapBoxes()) {
    const api = G.H2O?.MM?.wash;
    if (!api || typeof api.inspectMiniBtn !== 'function') return { available: false, rows: [], mismatches: [] };
    const boxesByTurn = new Map(boxes.map((box) => [box.turnNo, box]));
    const root = miniMapRoot();
    const rows = [];
    for (const record of canonicalRows(records)) {
      const box = boxesByTurn.get(record.turnNo);
      const button = box && root?.querySelector?.(`[data-cgxui="mnmp-btn"][data-turn-idx="${record.turnNo}"], [data-cgxui="mm-btn"][data-turn-idx="${record.turnNo}"]`);
      if (!button) continue;
      const inspected = safeRead(() => api.inspectMiniBtn(record.primaryAId || record.qId || '', button), null);
      rows.push({
        turnNo: record.turnNo,
        primaryAId: record.primaryAId,
        matchesExpected: inspected?.matchesExpected ?? null,
        shouldWash: inspected?.shouldWash ?? null,
        actualWashed: inspected?.actualWashed ?? null,
        colorName: inspected?.colorName || null,
        projectedWashName: inspected?.projectedWashName || null,
      });
    }
    return { available: true, rows, mismatches: rows.filter((row) => row.matchesExpected === false) };
  }

  function consumerResult(name, present, failures = [], evidence = null) {
    return {
      name,
      status: !present ? 'absent' : (failures.length ? 'present-failing' : 'present-passing'),
      optionality: OPTIONAL,
      failures,
      evidence,
    };
  }

  function consumerAudit(records = canonicalRecords(), snapshot = ledgerSnapshot(), parity = convergenceParity()) {
    const rows = canonicalRows(records);
    const aliases = new Map();
    for (const row of records) {
      for (const id of recordAliases(row)) aliases.set(id, row);
    }
    const boxes = miniMapBoxes();
    const alignment = identityAlignment(records, boxes);
    const maps = compatMapSizes();
    const bars = titleBars();
    const numbers = visibleNumbers();
    const stampRows = timestamps();
    const dividers = pageDividers();
    const wash = washerProjection(records, boxes);
    const navigator = G.H2ONavigator || G.HoNavigator || null;
    const navNodes = safeRead(() => navigator?.listNodes?.(), []);
    const shared = safeRead(() => G.H2O_MM_SHARED?.get?.(), null);
    const navControls = shared?.api?.rt || null;
    const threadPages = shared?.api?.mm?.chatPagesCtl || G.H2O?.ChatPageTitleIntent?.api || null;
    const threadState = safeRead(() => threadPages?.getState?.(), null);
    const pagination = G.H2O_Pagination || null;
    const paginationState = safeRead(() => pagination?.getDividerPaginationState?.(), null);
    const unmount = G.H2O?.UM?.nmntmssgs || null;
    const highlightDots = Array.from(document.querySelectorAll('[data-cgxui="mnmp-dotrow"][data-cgxui-owner="mnmp"]'));
    const highlightFailures = highlightDots.map((row) => ({
      turnId: asString(row.getAttribute?.('data-turn-id')).replace(/^turn:/, ''),
      answerId: asString(row.getAttribute?.('data-primary-a-id')),
      questionId: asString(row.getAttribute?.('data-question-id')),
    })).filter((row) => {
      const ids = [row.turnId, row.answerId, row.questionId].filter(Boolean);
      return ids.length > 0 && !ids.some((id) => aliases.has(id));
    }).map((row) => ({ reason: 'highlight-dot-identity-unresolved', row }));
    const activeNavigationId = asString(safeRead(() => navControls?.getActiveTurnId?.(), '')).replace(/^turn:/, '');
    const navigationFailures = activeNavigationId && !aliases.has(activeNavigationId)
      ? [{ reason: 'active-navigation-id-unresolved', activeNavigationId }]
      : [];

    const titleFailures = [];
    const titleTurnCounts = new Map();
    for (const bar of bars) {
      if (bar.turnNo) titleTurnCounts.set(bar.turnNo, (titleTurnCounts.get(bar.turnNo) || 0) + 1);
      if (bar.answerId && !aliases.has(asString(bar.answerId).replace(/^turn:/, ''))) titleFailures.push({ reason: 'unresolved-title-answer-id', row: bar });
    }
    for (const [turnNo, count] of titleTurnCounts) if (count > 1) titleFailures.push({ reason: 'duplicate-title-bars', turnNo, count });

    const answerNumberFailures = numbers.answer.filter((item) => item.number && !rows.some((row) => row.turnNo === item.number));
    const questionNumberFailures = numbers.question.filter((item) => item.number && !rows.some((row) => row.turnNo === item.number));
    const navFailures = asArray(navNodes).filter((node) => {
      const id = asString(node?.answerId || node?.turnId || node?.qId).replace(/^turn:/, '');
      return id && !aliases.has(id);
    }).slice(0, 24).map((node) => ({ reason: 'navigator-node-unresolved', node: stableValue(node) }));

    return {
      canonicalRecords: consumerResult('canonical-records', true, rows.length ? [] : ['canonical-records-empty'], { count: rows.length }),
      miniMap: consumerResult('MiniMap', !!miniMapRoot(), alignment.ok ? [] : alignment.drifts.concat(alignment.duplicateTurns), { count: boxes.length, alignment }),
      miniMapCompatMaps: consumerResult('MiniMap compat maps', maps.mapButtons != null || maps.turnById != null, [
        ...(maps.mapButtons != null && maps.mapButtons !== rows.length ? [`mapButtons:${maps.mapButtons}!=${rows.length}`] : []),
        ...(maps.turnById != null && maps.turnById !== rows.length ? [`turnById:${maps.turnById}!=${rows.length}`] : []),
      ], maps),
      pageDividers: consumerResult('page dividers', !!pagination || dividers.length > 0, [], { dividerRows: dividers, paginationState }),
      titleBars: consumerResult('title bars', bars.length > 0, titleFailures, { count: bars.length, rows: bars }),
      answerNumbers: consumerResult('Answer Numbers', numbers.answer.length > 0, answerNumberFailures, numbers.answer),
      questionNumbers: consumerResult('Question Numbers', numbers.question.length > 0, questionNumberFailures, numbers.question),
      timestamps: consumerResult('timestamps', stampRows.length > 0, [], { count: stampRows.length, rows: stampRows }),
      navigator: consumerResult('Navigator', !!navigator, navFailures, { nodeCount: asArray(navNodes).length }),
      navigationControls: consumerResult('Navigation Controls', !!navControls, navigationFailures, {
        activeTurnId: activeNavigationId || null,
      }),
      washer: consumerResult('Washer', wash.available, wash.mismatches, wash),
      threadPages: consumerResult('Thread Pages', !!threadPages, [], threadState),
      unmountAdapter: consumerResult('Unmount adapter', !!unmount, [], stableValue(unmount?.state || null)),
      paginationAdapter: consumerResult('Pagination adapter', !!pagination, [], paginationState),
      highlightDots: consumerResult('Highlight dots', highlightDots.length > 0, highlightFailures, { count: highlightDots.length }),
      convergence: consumerResult('convergence probe', true, asArray(parity?.blockers), {
        parityStatus: parity?.parityStatus,
        washerMatches: parity?.washerMatches,
        noAnswerMatches: parity?.noAnswerMatches,
      }),
    };
  }

  function aliasDiagnostics(diagnostics = ledgerDiagnostics(), snapshot = ledgerSnapshot()) {
    return {
      currentCrossMemberDuplicateCount: asNumber(diagnostics?.currentCrossMemberDuplicateCount),
      crossMemberAliasConflictCount: asNumber(diagnostics?.crossMemberAliasConflictCount),
      crossMemberAliasRepairCount: asNumber(diagnostics?.crossMemberAliasRepairCount),
      currentAliasConflictCount: asNumber(diagnostics?.currentAliasConflictCount),
      historicalAliasConflictCount: asNumber(diagnostics?.historicalAliasConflictCount),
      duplicateAliasCount: asNumber(diagnostics?.duplicateAliasCount),
      quarantinedAliasCount: asNumber(diagnostics?.quarantinedAliasCount ?? snapshot?.quarantinedAliasCount),
      quarantinedAliasResolutionCount: asNumber(diagnostics?.quarantinedAliasResolutionCount ?? snapshot?.quarantinedAliasResolutionCount),
      recentAliasConflicts: asArray(diagnostics?.recentAliasConflicts).slice(-12),
      quarantinedAliases: asArray(snapshot?.quarantinedAliases).slice(0, 12),
    };
  }

  function captureState(options = {}) {
    const records = canonicalRecords();
    const ledger = ledgerSnapshot();
    const diagnostics = ledgerDiagnostics();
    const parity = convergenceParity();
    const boxes = miniMapBoxes();
    const state = {
      href: location.href,
      activeChatKey: activeChatKey(),
      source: sourceState(diagnostics),
      turnVersion: turnVersion(),
      counts: {
        canonical: records.length,
        ledger: asNumber(ledger?.memberCount, asArray(ledger?.members).length),
        miniMap: boxes.length,
        ...compatMapSizes(),
      },
      ledgerSummary: {
        ledgerReady: !!ledger?.ledgerReady,
        chatKey: ledger?.chatKey || null,
        version: asNumber(ledger?.version),
        memberCount: asNumber(ledger?.memberCount, asArray(ledger?.members).length),
        completeShellMap: ledger?.completeShellMap ?? null,
      },
      dualRun: diagnostics?.dualRun || null,
      convergence: parity,
      aliasDiagnostics: aliasDiagnostics(diagnostics, ledger),
      miniMapAutomaticRefresh: miniMapPerf(),
      miniMapIdentityAlignment: identityAlignment(records, boxes),
    };
    if (options.includeRows) {
      state.canonicalRecords = canonicalRows(records);
      state.ledgerSnapshot = stableValue(ledger);
      state.perTurn = perTurnRows(records, ledger);
      state.miniMapBoxes = boxes;
      state.visibleNumbers = visibleNumbers();
      state.pageDividers = pageDividers();
      state.titleBars = titleBars();
      state.timestamps = timestamps();
      state.washerProjection = washerProjection(records, boxes);
      state.consumers = consumerAudit(records, ledger, parity);
      const variants = state.perTurn.filter((row) => row.answerIds.length > 1);
      state.knownMultiVariantTurn = variants.length ? variants[0] : null;
    }
    return state;
  }

  function rememberFullState(stage, state) {
    volatileStageStates.set(stageName(stage), state);
    return state;
  }

  function recalledFullState(stage) {
    return volatileStageStates.get(stageName(stage)) || null;
  }

  function compactConsumerResults(consumers) {
    const status = {};
    const failures = [];
    for (const [key, consumer] of Object.entries(consumers || {})) {
      status[key] = consumer?.status || 'absent';
      for (const failure of asArray(consumer?.failures)) {
        failures.push({ consumer: key, failure: stableValue(failure) });
      }
    }
    return {
      status,
      trueFailureCount: failures.length,
      failureEvidence: failures.slice(0, 24),
      failureEvidenceTruncated: failures.length > 24,
      fingerprint: fingerprintRows(Object.entries(status)),
    };
  }

  function hydrationFlags(value) {
    const hydration = asString(value).trim().toLowerCase();
    return {
      hydration: hydration || 'none',
      question: hydration === 'question' || hydration === 'both',
      answer: hydration === 'answer' || hydration === 'both',
    };
  }

  function replaceIdentity(values, previousIdentity, currentIdentity) {
    return asArray(values).map((value) => value === previousIdentity ? currentIdentity : value);
  }

  function sameHydrationOwner(owner, expected) {
    return !!owner
      && !!expected
      && asNumber(owner.turnNo) > 0
      && asNumber(owner.turnNo) === asNumber(expected.turnNo)
      && !!owner.logicalMemberKey
      && owner.logicalMemberKey === expected.logicalMemberKey
      && !!owner.qId
      && owner.qId === expected.qId;
  }

  function hydrationPromotionBranchContinuity(previous, current, shellTurnId) {
    const previousShells = asArray(previous?.answerCurrentShells);
    const currentShells = asArray(current?.answerCurrentShells);
    const previousShellOrder = previousShells.map((shell) => shell?.shellTurnId || null);
    const currentShellOrder = currentShells.map((shell) => shell?.shellTurnId || null);
    const shellOrderStable = stableJson(previousShellOrder) === stableJson(currentShellOrder);
    const previousSelectedIndex = previousShells.findIndex((shell) => shell?.currentAnswerId === previous?.primaryAId);
    const currentSelectedIndex = currentShells.findIndex((shell) => shell?.currentAnswerId === current?.primaryAId);
    const promotionShellIndex = previousShells.findIndex((shell) => shell?.shellTurnId === shellTurnId);

    if (previousShells.length === 1 && currentShells.length === 1) {
      const ok = shellOrderStable && previousShellOrder[0] === shellTurnId;
      return {
        ok,
        status: ok ? 'single-shell-stable' : 'changed',
        reason: ok ? 'single-shell-turn-id-stable' : 'single-shell-turn-id-changed',
        shellOrderStable,
        previousSelectedIndex,
        currentSelectedIndex,
        promotionShellIndex,
      };
    }

    const nativeProjection = previous?.currentProjectionSource === 'native-evidence'
      && current?.currentProjectionSource === 'native-evidence';
    const selectedShellStable = promotionShellIndex >= 0
      && previousSelectedIndex === promotionShellIndex
      && currentSelectedIndex === promotionShellIndex;
    const ok = previousShells.length > 1
      && previousShells.length === currentShells.length
      && shellOrderStable
      && nativeProjection
      && selectedShellStable;
    return {
      ok,
      status: ok ? 'multi-shell-promotion-equivalent' : 'ambiguous',
      reason: ok
        ? 'multi-shell-current-projection-and-selection-stable'
        : (!nativeProjection
          ? 'multi-shell-native-projection-unavailable'
          : (!shellOrderStable
            ? 'multi-shell-order-changed'
            : 'multi-shell-selection-not-proven')),
      shellOrderStable,
      nativeProjection,
      selectedShellStable,
      previousSelectedIndex,
      currentSelectedIndex,
      promotionShellIndex,
    };
  }

  function evaluateHydrationPromotion(previous, current, currentRows, aliasDiagnosticsValue) {
    const reasons = [];
    const previousTurnNo = asNumber(previous?.turnNo);
    const currentTurnNo = asNumber(current?.turnNo);
    const previousLogicalMemberKey = asString(previous?.logicalMemberKey).trim();
    const currentLogicalMemberKey = asString(current?.logicalMemberKey).trim();
    const previousQId = asString(previous?.qId).trim();
    const currentQId = asString(current?.qId).trim();
    if (previousTurnNo <= 0 || currentTurnNo <= 0 || previousTurnNo !== currentTurnNo) {
      reasons.push('hydration-turn-number-continuity-failed');
    }
    if (!previousLogicalMemberKey || !currentLogicalMemberKey) {
      reasons.push('hydration-logical-member-key-missing');
    } else if (previousLogicalMemberKey !== currentLogicalMemberKey) {
      reasons.push('hydration-logical-member-key-changed');
    }
    if (!previousQId || !currentQId) reasons.push('hydration-question-id-missing');
    else if (previousQId !== currentQId) reasons.push('hydration-question-id-changed');
    if (previous?.noAnswer !== current?.noAnswer) reasons.push('hydration-no-answer-state-changed');

    const previousShells = asArray(previous?.answerCurrentShells);
    const currentShells = asArray(current?.answerCurrentShells);
    const reverseTransition = previousShells.some((shell) => {
      if (!shell?.shellTurnId || !shell?.messageId || shell.messageId !== previous?.primaryAId) return false;
      return currentShells.some((candidate) => candidate?.shellTurnId === shell.shellTurnId
        && !candidate?.messageId
        && candidate?.currentAnswerId === candidate?.shellTurnId
        && current?.primaryAId === candidate?.shellTurnId);
    });
    if (reverseTransition) reasons.push('hydration-direction-reversed');

    const relevantPreviousShells = previousShells.filter((shell) => {
      const shellTurnId = asString(shell?.shellTurnId).trim();
      return !!shellTurnId
        && !asString(shell?.messageId).trim()
        && shell?.currentAnswerId === shellTurnId
        && previous?.primaryAId === shellTurnId;
    });
    if (relevantPreviousShells.length !== 1) reasons.push('hydration-before-shell-candidate-not-unique');
    const previousShell = relevantPreviousShells.length === 1 ? relevantPreviousShells[0] : null;
    const shellTurnId = asString(previousShell?.shellTurnId).trim();
    const matchingCurrentShells = shellTurnId
      ? currentShells.filter((shell) => shell?.shellTurnId === shellTurnId)
      : [];
    if (previousShell && matchingCurrentShells.length !== 1) {
      const apparentPromotedShell = currentShells.find((shell) => {
        return !!asString(shell?.messageId).trim()
          && shell?.currentAnswerId === shell?.messageId
          && current?.primaryAId === shell?.messageId;
      });
      reasons.push(apparentPromotedShell?.shellTurnId && apparentPromotedShell.shellTurnId !== shellTurnId
        ? 'hydration-shell-turn-id-changed'
        : 'hydration-after-shell-match-not-unique');
    }
    const currentShell = matchingCurrentShells.length === 1 ? matchingCurrentShells[0] : null;
    const previousPrimaryAId = asString(previous?.primaryAId).trim();
    const finalPrimaryAId = asString(current?.primaryAId).trim();
    const messageId = asString(currentShell?.messageId).trim();
    if (currentShell) {
      if (!messageId || messageId.startsWith('request-placeholder-') || messageId === shellTurnId) {
        reasons.push('hydration-final-message-id-not-real');
      }
      if (currentShell.currentAnswerId !== messageId) reasons.push('hydration-current-answer-id-not-message-id');
      if (finalPrimaryAId !== messageId) reasons.push('hydration-primary-not-promoted-message-id');
      if (previousPrimaryAId !== shellTurnId) reasons.push('hydration-previous-primary-not-shell-id');
    }

    const previousHydration = hydrationFlags(previous?.hydration);
    const currentHydration = hydrationFlags(current?.hydration);
    if (previousHydration.answer || !currentHydration.answer || (previousHydration.question && !currentHydration.question)) {
      reasons.push('hydration-direction-not-forward');
    }

    if (previousShell && currentShell && messageId) {
      if (stableJson(replaceIdentity(previous?.currentAnswerIds, shellTurnId, messageId))
        !== stableJson(current?.currentAnswerIds)) {
        reasons.push('hydration-current-answer-set-unrelated-mutation');
      }
      if (stableJson(replaceIdentity(previous?.answerIds, shellTurnId, messageId))
        !== stableJson(current?.answerIds)) {
        reasons.push('hydration-answer-set-unrelated-mutation');
      }
      const normalizedCurrentShells = currentShells.map((shell) => ({
        shellTurnId: shell?.shellTurnId || null,
        messageId: shell?.shellTurnId === shellTurnId ? null : (shell?.messageId || null),
        currentAnswerId: shell?.shellTurnId === shellTurnId ? shellTurnId : (shell?.currentAnswerId || null),
      }));
      const normalizedPreviousShells = previousShells.map((shell) => ({
        shellTurnId: shell?.shellTurnId || null,
        messageId: shell?.messageId || null,
        currentAnswerId: shell?.currentAnswerId || null,
      }));
      if (stableJson(normalizedPreviousShells) !== stableJson(normalizedCurrentShells)) {
        reasons.push('hydration-shell-set-unrelated-mutation');
      }
    }

    const currentAnswerResolverAliases = uniqueOrdered(current?.answerResolverAliases);
    if (previousPrimaryAId && !currentAnswerResolverAliases.includes(previousPrimaryAId)) {
      reasons.push('hydration-previous-primary-resolver-alias-missing');
    }
    const previousOwners = rollbackIdentityOwners(currentRows, previousPrimaryAId, 'answer');
    const finalOwners = rollbackIdentityOwners(currentRows, finalPrimaryAId, 'answer');
    if (previousPrimaryAId && previousOwners.length !== 1) reasons.push('hydration-previous-owner-count-not-one');
    if (finalPrimaryAId && finalOwners.length !== 1) reasons.push('hydration-final-owner-count-not-one');
    if (previousOwners.some((owner) => !sameHydrationOwner(owner, current))) {
      reasons.push('hydration-previous-id-owned-by-another-member');
    }
    if (finalOwners.some((owner) => !sameHydrationOwner(owner, current))) {
      reasons.push('hydration-final-id-owned-by-another-member');
    }
    const quarantine = quarantinedIdentitySet(aliasDiagnosticsValue);
    const quarantinedIdentities = uniqueOrdered([previousPrimaryAId, finalPrimaryAId])
      .filter((identity) => quarantine.has(identity));
    if (quarantinedIdentities.length) reasons.push('hydration-involved-identity-quarantined');
    if (!aliasClean(aliasDiagnosticsValue)) reasons.push('hydration-alias-diagnostics-not-clean');

    const branchContinuity = hydrationPromotionBranchContinuity(previous, current, shellTurnId);
    if (!branchContinuity.ok) reasons.push(`hydration-visible-branch-${branchContinuity.reason}`);

    const acceptedInvariants = [
      'same-turn-number',
      'stable-turn-order',
      'stable-membership-count',
      'same-logical-member-key',
      'same-question-id',
      'forward-answer-hydration',
      'stable-shell-turn-id',
      'shell-primary-promoted-to-message-id',
      'answer-sets-change-only-by-promotion',
      'unique-same-member-resolver-ownership',
      'identities-not-quarantined',
      'alias-gauges-clean',
      'visible-branch-continuity-proven',
    ];
    return {
      ok: reasons.length === 0,
      reasons: uniqueOrdered(reasons),
      evidence: {
        turnNo: previousTurnNo,
        logicalMemberKey: previousLogicalMemberKey || null,
        qId: previousQId || null,
        shellTurnId: shellTurnId || null,
        previousPrimaryAId: previousPrimaryAId || null,
        finalPrimaryAId: finalPrimaryAId || null,
        hydrationBefore: previousHydration.hydration,
        hydrationAfter: currentHydration.hydration,
        previousOwnerCount: previousOwners.length,
        finalOwnerCount: finalOwners.length,
        branchContinuity,
        quarantinedIdentities,
        acceptedInvariants: reasons.length === 0 ? acceptedInvariants : [],
      },
    };
  }

  function semanticMembershipRows(rows, promotions, phase) {
    const promotionByTurn = new Map(asArray(promotions).map((promotion) => [asNumber(promotion?.turnNo), promotion]));
    return asArray(rows).map((row) => {
      const promotion = promotionByTurn.get(asNumber(row?.turnNo));
      const normalize = (value) => {
        if (phase === 'after' && promotion && value === promotion.finalPrimaryAId) {
          return promotion.previousPrimaryAId;
        }
        return value ?? null;
      };
      return {
        turnNo: asNumber(row?.turnNo),
        qId: row?.qId || null,
        primaryAId: normalize(row?.primaryAId),
        answerIds: asArray(row?.answerIds).map(normalize),
        currentAnswerIds: asArray(row?.currentAnswerIds).map(normalize),
        answerShells: asArray(row?.answerCurrentShells).map((shell) => ({
          shellTurnId: shell?.shellTurnId || null,
          currentAnswerId: normalize(shell?.currentAnswerId),
        })),
        noAnswer: row?.noAnswer === true,
        pageNo: asNumber(row?.pageNo),
      };
    });
  }

  function currentPrimaryPublication(state) {
    const boxesByTurn = new Map(asArray(state?.miniMapBoxes).map((box) => [asNumber(box?.turnNo), box]));
    const mismatches = [];
    for (const row of asArray(state?.perTurn)) {
      const primaryAId = asString(row?.primaryAId).trim();
      if (!primaryAId) continue;
      const box = boxesByTurn.get(asNumber(row?.turnNo)) || null;
      if (!box || box.primaryAId !== primaryAId) {
        mismatches.push({
          turnNo: asNumber(row?.turnNo),
          expectedPrimaryAId: primaryAId,
          publishedPrimaryAId: box?.primaryAId || null,
        });
      }
    }
    return {
      ok: mismatches.length === 0,
      mismatchCount: mismatches.length,
      mismatchRows: mismatches.slice(0, 24),
      mismatchRowsTruncated: mismatches.length > 24,
    };
  }

  function idleAutomaticRefreshSettled(delta) {
    return asNumber(delta?.identityDriftRebuildCount) === 0
      && asNumber(delta?.coreTurnUpdatedRebuildCount) === 0;
  }

  function compareMembershipIdentityStates(before, after) {
    const beforeRows = asArray(before?.perTurn);
    const afterRows = asArray(after?.perTurn);
    const afterByTurn = new Map(afterRows.map((row) => [asNumber(row?.turnNo), row]));
    const mismatches = [];
    const acceptedHydrationPromotions = [];
    const beforeOrder = beforeRows.map((row) => asNumber(row?.turnNo));
    const afterOrder = afterRows.map((row) => asNumber(row?.turnNo));
    const membershipCountStable = beforeRows.length === afterRows.length;
    const orderStable = stableJson(beforeOrder) === stableJson(afterOrder);
    for (const previous of beforeRows) {
      const turnNo = asNumber(previous?.turnNo);
      const current = afterByTurn.get(turnNo) || null;
      const reasons = [];
      if (!current) reasons.push('turn-missing');
      else {
        if (previous.qId !== current.qId) reasons.push('q-id-changed');
        if (previous.primaryAId !== current.primaryAId) reasons.push('primary-a-id-changed');
        if (previous.noAnswer !== current.noAnswer) reasons.push('no-answer-changed');
        if (stableJson(previous.answerIds) !== stableJson(current.answerIds)) reasons.push('answer-ids-changed');
        if (stableJson(previous.currentAnswerIds) !== stableJson(current.currentAnswerIds)) reasons.push('current-answer-ids-changed');
        if (reasons.length) {
          const promotion = evaluateHydrationPromotion(previous, current, afterRows, after?.aliasDiagnostics);
          if (promotion.ok && membershipCountStable && orderStable) {
            acceptedHydrationPromotions.push(promotion.evidence);
            reasons.length = 0;
          } else {
            reasons.push(...promotion.reasons);
            if (!membershipCountStable) reasons.push('hydration-membership-count-changed');
            if (!orderStable) reasons.push('hydration-turn-order-changed');
          }
        }
      }
      if (reasons.length) {
        mismatches.push({
          turnNo,
          reasons: uniqueOrdered(reasons).slice(0, 24),
          previous: previous ? compactBaselineTurn(previous) : null,
          current: current ? compactBaselineTurn(current) : null,
        });
      }
    }
    for (const current of afterRows) {
      if (!beforeRows.some((previous) => asNumber(previous?.turnNo) === asNumber(current?.turnNo))) {
        mismatches.push({ turnNo: asNumber(current?.turnNo), reasons: ['unexpected-turn'], previous: null, current: compactBaselineTurn(current) });
      }
    }
    const structuralMismatchReasons = [];
    if (!membershipCountStable) structuralMismatchReasons.push('membership-count-changed');
    if (!orderStable) structuralMismatchReasons.push('turn-order-changed');
    const rawBeforeFingerprint = fingerprintRows(beforeRows.map(compactBaselineTurn));
    const rawAfterFingerprint = fingerprintRows(afterRows.map(compactBaselineTurn));
    const semanticBeforeFingerprint = fingerprintRows(semanticMembershipRows(beforeRows, acceptedHydrationPromotions, 'before'));
    const semanticAfterFingerprint = fingerprintRows(semanticMembershipRows(afterRows, acceptedHydrationPromotions, 'after'));
    const trueMismatchCount = mismatches.length + structuralMismatchReasons.length;
    return {
      comparedTurnCount: Math.max(beforeRows.length, afterRows.length),
      stable: trueMismatchCount === 0,
      trueMismatchCount,
      mismatchRows: mismatches.slice(0, 24),
      mismatchRowsTruncated: mismatches.length > 24,
      orderStable,
      structuralMismatchReasons,
      acceptedHydrationPromotionCount: acceptedHydrationPromotions.length,
      acceptedHydrationPromotions: acceptedHydrationPromotions.slice(0, 24),
      acceptedHydrationPromotionsTruncated: acceptedHydrationPromotions.length > 24,
      beforeFingerprint: rawBeforeFingerprint,
      afterFingerprint: rawAfterFingerprint,
      rawFingerprintMatching: rawBeforeFingerprint.hash === rawAfterFingerprint.hash,
      semanticBeforeFingerprint,
      semanticAfterFingerprint,
      semanticFingerprintMatching: semanticBeforeFingerprint.hash === semanticAfterFingerprint.hash,
    };
  }

  function readMovementEvidence() {
    const raw = storageRead(G.sessionStorage, MOVEMENT_HELPER_KEY);
    if (!raw) return { ok: false, reason: 'movement-helper-evidence-missing' };
    let evidence;
    try {
      evidence = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'movement-helper-evidence-malformed' };
    }
    if (evidence?.schemaVersion !== MOVEMENT_HELPER_SCHEMA_VERSION
      || evidence?.helperVersion !== MOVEMENT_HELPER_VERSION
      || !evidence?.scenarioId
      || !Array.isArray(evidence?.snapshots)) {
      return { ok: false, reason: 'movement-helper-evidence-incompatible' };
    }
    if (!/^CV3\.3-S1-/.test(evidence.scenarioId)) {
      return { ok: false, reason: 'movement-helper-scenario-not-s1' };
    }
    const currentChatKey = comparableChatKey(activeChatKey());
    const foreignSnapshot = evidence.snapshots.find((snapshot) => {
      return comparableChatKey(snapshot?.chatKey) !== currentChatKey;
    });
    if (!currentChatKey || foreignSnapshot) {
      return { ok: false, reason: 'movement-helper-foreign-chat' };
    }
    return { ok: true, evidence };
  }

  function compactMovementEvidenceReferences(options = {}) {
    const read = readMovementEvidence();
    if (!read.ok) return { ok: false, reason: read.reason, movementCoverageComplete: false };
    const expectedScenarioId = options.scenarioId || null;
    if (expectedScenarioId && read.evidence.scenarioId !== expectedScenarioId) {
      return { ok: false, reason: 'movement-helper-foreign-scenario', movementCoverageComplete: false };
    }
    const requiredLabels = ['oldest', 'middle', 'newest'];
    const references = [];
    for (const label of requiredLabels) {
      const matching = read.evidence.snapshots.filter((snapshot) => {
        return asString(snapshot?.label).trim().toLowerCase() === label;
      });
      const snapshot = matching.at(-1) || null;
      if (!snapshot) continue;
      references.push({
        label,
        snapshotId: hash64(stableJson([
          read.evidence.scenarioId,
          snapshot.chatKey,
          snapshot.capturedAt,
          snapshot.label,
        ])),
        capturedAt: snapshot.capturedAt || null,
        chatKey: snapshot.chatKey || null,
        href: snapshot.href || null,
        counts: compactCounts(snapshot.counts),
        gates: Object.fromEntries(Object.entries(snapshot.gates || {}).filter(([, value]) => typeof value === 'boolean')),
      });
    }
    const missingLabels = requiredLabels.filter((label) => !references.some((reference) => reference.label === label));
    return {
      ok: missingLabels.length === 0,
      reason: missingLabels.length ? `movement-helper-regions-missing:${missingLabels.join(',')}` : null,
      helperVersion: read.evidence.helperVersion,
      helperScenarioId: read.evidence.scenarioId,
      chatKey: activeChatKey(),
      snapshotLabels: references.map((reference) => reference.label),
      snapshotReferences: references,
      regionCount: references.length,
      movementCoverageComplete: missingLabels.length === 0,
      missingLabels,
    };
  }

  function projectedRollbackPayload(state) {
    const compact = compactEvidenceState(state);
    const projectedRows = asArray(state?.perTurn).slice(0, 24).map((row) => ({
      ok: false,
      transition: 'alias-equivalent',
      turnNo: asNumber(row?.turnNo),
      previous: { qId: row?.qId || null, primaryAId: row?.primaryAId || null },
      current: { qId: row?.qId || null, primaryAId: row?.primaryAId || null },
      failureReasons: ['projected-capacity-row'],
    }));
    return {
      ok: true,
      changed: true,
      gates: Object.fromEntries(Array.from({ length: 14 }, (_, index) => [`projectedGate${index + 1}`, true])),
      setterResult: { ok: true, changed: true, activeSource: SOURCE_LEGACY },
      turnUpdateEvents: [{ reason: 'projected-capacity', version: asNumber(state?.turnVersion) + 1 }],
      before: compact,
      state: compact,
      rollbackEquivalence: {
        ok: true,
        routeMatches: true,
        baselineCount: asNumber(state?.counts?.canonical),
        currentCount: asNumber(state?.counts?.canonical),
        baselineCountPreserved: true,
        stableOrder: true,
        duplicateCurrentTurnNos: [],
        exactTransitionCount: 0,
        aliasEquivalentTransitionCount: projectedRows.length,
        memberKeyRelationCounts: { equal: 0, regenerated: 0, unavailable: projectedRows.length },
        aliasDiagnosticsClean: true,
        finalTurnNo: asNumber(state?.counts?.canonical),
        finalPrimaryAId: 'projected-final-primary',
        finalPrimaryValid: true,
        finalPrimaryPublishedByMiniMap: true,
        evaluatedTurnCount: asNumber(state?.counts?.canonical),
        trueFailingRowCount: projectedRows.length,
        failingRows: projectedRows,
        passingSampleRows: projectedRows.slice(0, 3),
        failureReasons: projectedRows.map((row) => `turn-${row.turnNo}:projected-capacity-row`),
      },
      evidenceDegraded: false,
      emergencyRollbackRequired: false,
      failureReasons: [],
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    };
  }

  function capacityPreflight(checks) {
    const results = checks.map(({ stage, payload }) => {
      const prediction = predictStageCapacity(stage, payload);
      return {
        stage: stageName(stage),
        ok: prediction.ok,
        reasons: prediction.reasons,
        chars: prediction.measurement.chars,
        bytes: prediction.measurement.bytes,
        limitChars: STAGE_RECORD_MAX_CHARS,
        checkpointBytes: prediction.checkpointPreview.checkpointWrite.bytes,
        checkpointLimitBytes: CHECKPOINT_MAX_BYTES,
      };
    });
    return { ok: results.every((result) => result.ok), results };
  }

  function countsEqual(counts) {
    const required = [counts?.canonical, counts?.ledger, counts?.miniMap, counts?.mapButtons, counts?.turnById];
    return required.every((value) => Number.isInteger(value) && value > 0) && new Set(required).size === 1;
  }

  function dualRunClean(dualRun) {
    return !!dualRun?.ready
      && dualRun?.exactParity === true
      && asNumber(dualRun?.currentMismatchCount) === 0
      && asNumber(dualRun?.totalMismatchCount) === 0
      && asNumber(dualRun?.missingInLegacyCount) === 0
      && asNumber(dualRun?.missingInAdapterCount) === 0
      && asNumber(dualRun?.duplicateIdentityCount) === 0
      && asNumber(dualRun?.duplicateAliasCount) === 0
      && asNumber(dualRun?.primaryRekeyCount) === 0
      && asNumber(dualRun?.instrumentationErrorCount) === 0;
  }

  function aliasClean(alias) {
    return asNumber(alias?.currentCrossMemberDuplicateCount) === 0
      && asNumber(alias?.crossMemberAliasConflictCount) === 0
      && asNumber(alias?.currentAliasConflictCount) === 0
      && asNumber(alias?.historicalAliasConflictCount) === 0
      && asNumber(alias?.duplicateAliasCount) === 0
      && asNumber(alias?.quarantinedAliasCount) === 0;
  }

  function broadAnswerResolverAliases(row) {
    return uniqueOrdered([
      ...asArray(row?.answerResolverAliases),
      ...asArray(row?.resolverAliases),
    ]);
  }

  function sameLogicalTurn(left, right) {
    if (!left || !right) return false;
    if (asNumber(left.turnNo) !== asNumber(right.turnNo)) return false;
    if (left.qId && right.qId && left.qId !== right.qId) return false;
    if (left.logicalMemberKey && right.logicalMemberKey
      && left.logicalMemberKey !== right.logicalMemberKey) return false;
    return true;
  }

  function evaluateStreamingIdentityContinuity(duringTurn, finalTurn, state = {}) {
    const reasons = [];
    const duringPrimaryAId = asString(duringTurn?.primaryAId).trim() || null;
    const finalPrimaryAId = asString(finalTurn?.primaryAId).trim() || null;
    const placeholderDuring = !!duringPrimaryAId
      && duringPrimaryAId.startsWith('request-placeholder-');

    if (!duringTurn) reasons.push('missing-p7-during-turn');
    if (!duringPrimaryAId) reasons.push('missing-p7-during-primary');
    if (!finalTurn) reasons.push('missing-final-turn');

    if (duringTurn && finalTurn) {
      if (!asNumber(duringTurn.turnNo) || !asNumber(finalTurn.turnNo)
        || asNumber(duringTurn.turnNo) !== asNumber(finalTurn.turnNo)) {
        reasons.push('streaming-turn-number-mismatch');
      }
      if (!duringTurn.qId || !finalTurn.qId) reasons.push('streaming-question-id-missing');
      else if (duringTurn.qId !== finalTurn.qId) reasons.push('streaming-question-id-mismatch');
      if (duringTurn.logicalMemberKey && finalTurn.logicalMemberKey
        && duringTurn.logicalMemberKey !== finalTurn.logicalMemberKey) {
        reasons.push('streaming-logical-member-key-mismatch');
      }
    }

    const finalBroadAliases = broadAnswerResolverAliases(finalTurn);
    const ownerRows = duringPrimaryAId
      ? asArray(state?.perTurn).filter((row) => broadAnswerResolverAliases(row).includes(duringPrimaryAId))
      : [];
    const quarantined = duringPrimaryAId
      ? asArray(state?.aliasDiagnostics?.quarantinedAliases).some((entry) => {
        return asString(entry?.alias ?? entry) === duringPrimaryAId;
      })
      : false;

    if (placeholderDuring) {
      if (!finalPrimaryAId) reasons.push('final-primary-missing');
      else {
        if (finalPrimaryAId === duringPrimaryAId) reasons.push('placeholder-remains-settled-primary');
        if (finalPrimaryAId.startsWith('request-placeholder-')) reasons.push('final-primary-is-placeholder');
      }
      if (!finalBroadAliases.includes(duringPrimaryAId)) {
        reasons.push('placeholder-broad-resolver-continuity-missing');
      }
      if (ownerRows.length !== 1) reasons.push('placeholder-owner-count-not-one');
      if (ownerRows.some((row) => !sameLogicalTurn(row, finalTurn))) {
        reasons.push('placeholder-owned-by-another-member');
      }
      if (quarantined) reasons.push('placeholder-quarantined');
      if (!aliasClean(state?.aliasDiagnostics)) reasons.push('alias-diagnostics-not-clean');
    } else if (duringPrimaryAId && finalPrimaryAId !== duringPrimaryAId) {
      reasons.push('already-final-primary-changed');
    }

    return {
      ok: reasons.length === 0,
      reasons: uniqueOrdered(reasons),
      placeholderDuring,
      duringPrimaryAId,
      finalPrimaryAId,
      sameTurn: sameLogicalTurn(duringTurn, finalTurn),
      finalBroadAliases,
      placeholderOwnerCount: ownerRows.length,
      placeholderOwnerTurnNos: ownerRows.map((row) => row.turnNo),
      placeholderQuarantined: quarantined,
      currentAliasesContainPlaceholder: placeholderDuring
        ? asArray(finalTurn?.currentAliases).includes(duringPrimaryAId)
        : false,
      currentAnswerIdsContainPlaceholder: placeholderDuring
        ? asArray(finalTurn?.currentAnswerIds).includes(duringPrimaryAId)
        : false,
    };
  }

  function broadQuestionResolverAliases(row) {
    return uniqueOrdered([
      row?.qId,
      ...asArray(row?.questionResolverAliases),
      ...asArray(row?.resolverAliases),
    ]);
  }

  function rollbackAnswerResolverAliases(row) {
    return uniqueOrdered([
      row?.primaryAId,
      ...asArray(row?.currentAnswerIds),
      ...asArray(row?.answerResolverAliases),
      ...asArray(row?.resolverAliases),
    ]);
  }

  function rollbackOwnerDescriptor(row) {
    return {
      turnNo: asNumber(row?.turnNo),
      logicalMemberKey: row?.logicalMemberKey || null,
      qId: row?.qId || null,
      primaryAId: row?.primaryAId || null,
    };
  }

  function sameRollbackMember(previous, current) {
    const previousTurnNo = asNumber(previous?.turnNo);
    const currentTurnNo = asNumber(current?.turnNo);
    return !!previous
      && !!current
      && previousTurnNo > 0
      && currentTurnNo > 0
      && previousTurnNo === currentTurnNo;
  }

  function rollbackIdentityOwners(rows, identity, side) {
    const id = asString(identity).trim();
    if (!id) return [];
    return asArray(rows).filter((row) => {
      const aliases = side === 'question'
        ? broadQuestionResolverAliases(row)
        : rollbackAnswerResolverAliases(row);
      return aliases.includes(id);
    });
  }

  function quarantinedIdentitySet(aliasDiagnosticsValue) {
    return new Set(asArray(aliasDiagnosticsValue?.quarantinedAliases).map((entry) => {
      return asString(entry?.alias ?? entry).trim();
    }).filter(Boolean));
  }

  function connectedAnswerIds(row) {
    return uniqueOrdered(asArray(row?.answerCurrentShells).map((shell) => shell?.messageId));
  }

  function evaluateVisibleBranch(previous, current) {
    const previousConnectedIds = connectedAnswerIds(previous);
    const currentConnectedIds = connectedAnswerIds(current);
    const previousSelectedId = previousConnectedIds[previousConnectedIds.length - 1] || null;
    const currentSelectedId = currentConnectedIds[currentConnectedIds.length - 1] || null;
    if (!previousSelectedId || !currentSelectedId) {
      return {
        ok: true,
        status: 'not-evaluable',
        reason: 'connected-assistant-evidence-unavailable',
        previousConnectedIds,
        currentConnectedIds,
        previousSelectedId,
        currentSelectedId,
      };
    }
    const ok = previousSelectedId === currentSelectedId;
    return {
      ok,
      status: ok ? 'exact' : 'changed',
      reason: ok ? 'connected-current-projection-stable' : 'visible-branch-selection-changed',
      previousConnectedIds,
      currentConnectedIds,
      previousSelectedId,
      currentSelectedId,
    };
  }

  function evaluateRollbackEquivalence(baselineState, currentState) {
    const baselineRows = asArray(baselineState?.perTurn);
    const currentRows = asArray(currentState?.perTurn);
    const currentByTurn = new Map();
    const duplicateCurrentTurnNos = [];
    for (const row of currentRows) {
      const turnNo = asNumber(row?.turnNo);
      if (currentByTurn.has(turnNo)) duplicateCurrentTurnNos.push(turnNo);
      else currentByTurn.set(turnNo, row);
    }
    const routeMatches = !!comparableChatKey(baselineState?.activeChatKey)
      && comparableChatKey(baselineState?.activeChatKey) === comparableChatKey(currentState?.activeChatKey);
    const stableOrder = baselineRows.every((row, index) => {
      return asNumber(currentRows[index]?.turnNo) === asNumber(row?.turnNo);
    });
    const baselineCountPreserved = currentRows.length >= baselineRows.length;
    const quarantine = quarantinedIdentitySet(currentState?.aliasDiagnostics);
    const perTurnEvidence = [];

    for (const previous of baselineRows) {
      const current = currentByTurn.get(asNumber(previous?.turnNo)) || null;
      const failureReasons = [];
      if (!current) failureReasons.push('baseline-turn-missing');

      const previousLogicalMemberKey = previous?.logicalMemberKey || null;
      const currentLogicalMemberKey = current?.logicalMemberKey || null;
      const memberKeyRelation = !previousLogicalMemberKey || !currentLogicalMemberKey
        ? 'unavailable'
        : previousLogicalMemberKey === currentLogicalMemberKey
          ? 'equal'
          : 'regenerated';
      const memberKeyRegenerated = memberKeyRelation === 'regenerated';
      const memberKeyCorroborates = memberKeyRelation === 'equal';

      const previousQId = previous?.qId || null;
      const currentQId = current?.qId || null;
      const questionWitnessAliases = broadQuestionResolverAliases(current);
      const questionOwners = rollbackIdentityOwners(currentRows, previousQId, 'question');
      const questionExact = !!previousQId && previousQId === currentQId;
      const questionAliasEquivalent = !!previousQId && questionWitnessAliases.includes(previousQId);
      if (!previousQId) failureReasons.push('previous-question-id-missing');
      else if (!questionExact && !questionAliasEquivalent) failureReasons.push('question-continuity-missing');
      if (previousQId && questionOwners.length !== 1) failureReasons.push('question-owner-count-not-one');
      if (questionOwners.some((owner) => !sameRollbackMember(previous, owner))) {
        failureReasons.push('question-owned-by-another-member');
      }

      const previousPrimaryAId = previous?.primaryAId || null;
      const currentPrimaryAId = current?.primaryAId || null;
      const answerWitnessAliases = rollbackAnswerResolverAliases(current);
      const answerOwners = rollbackIdentityOwners(currentRows, previousPrimaryAId, 'answer');
      const answerExact = previousPrimaryAId === currentPrimaryAId;
      const answerAliasEquivalent = !!previousPrimaryAId && answerWitnessAliases.includes(previousPrimaryAId);
      if (previousPrimaryAId && !answerExact && !answerAliasEquivalent) {
        failureReasons.push('answer-continuity-missing');
      }
      if (previousPrimaryAId && answerOwners.length !== 1) failureReasons.push('answer-owner-count-not-one');
      if (answerOwners.some((owner) => !sameRollbackMember(previous, owner))) {
        failureReasons.push('answer-owned-by-another-member');
      }
      if (currentPrimaryAId?.startsWith?.('request-placeholder-')) {
        failureReasons.push('current-primary-is-placeholder');
      }

      const involvedIdentities = uniqueOrdered([
        previousQId,
        currentQId,
        previousPrimaryAId,
        currentPrimaryAId,
      ]);
      const quarantinedIdentities = involvedIdentities.filter((identity) => quarantine.has(identity));
      if (quarantinedIdentities.length) failureReasons.push('involved-identity-quarantined');

      const visibleBranch = evaluateVisibleBranch(previous, current);
      if (!visibleBranch.ok) failureReasons.push('visible-branch-selection-changed');
      if (!sameRollbackMember(previous, current)) failureReasons.push('logical-member-continuity-failed');

      perTurnEvidence.push({
        ok: failureReasons.length === 0,
        transition: questionExact && answerExact ? 'exact' : 'alias-equivalent',
        turnNo: asNumber(previous?.turnNo),
        previousLogicalMemberKey,
        currentLogicalMemberKey,
        memberKeyRelation,
        memberKeyRegenerated,
        memberKeyCorroborates,
        logicalMemberKey: {
          previous: previousLogicalMemberKey,
          current: currentLogicalMemberKey,
          relation: memberKeyRelation,
          regenerated: memberKeyRegenerated,
          corroborates: memberKeyCorroborates,
        },
        previous: { qId: previousQId, primaryAId: previousPrimaryAId },
        current: { qId: currentQId, primaryAId: currentPrimaryAId },
        question: {
          exact: questionExact,
          aliasEquivalent: questionAliasEquivalent,
          witnessAliases: questionWitnessAliases,
          ownerCount: questionOwners.length,
          owners: questionOwners.map(rollbackOwnerDescriptor),
        },
        answer: {
          exact: answerExact,
          aliasEquivalent: answerAliasEquivalent,
          witnessAliases: answerWitnessAliases,
          ownerCount: answerOwners.length,
          owners: answerOwners.map(rollbackOwnerDescriptor),
        },
        quarantine: {
          quarantined: quarantinedIdentities.length > 0,
          identities: quarantinedIdentities,
        },
        visibleBranch,
        failureReasons: uniqueOrdered(failureReasons),
      });
    }

    const finalTurn = currentRows[currentRows.length - 1] || null;
    const finalPrimaryAId = asString(finalTurn?.primaryAId).trim() || null;
    const finalPrimaryValid = !!finalPrimaryAId && !finalPrimaryAId.startsWith('request-placeholder-');
    const finalPrimaryPublishedByMiniMap = finalPrimaryValid && asArray(currentState?.miniMapBoxes).some((box) => {
      return asNumber(box?.turnNo) === asNumber(finalTurn?.turnNo)
        && box?.primaryAId === finalPrimaryAId;
    });
    const aliasDiagnosticsClean = aliasClean(currentState?.aliasDiagnostics);
    const failureReasons = [];
    if (!routeMatches) failureReasons.push('comparable-chat-route-mismatch');
    if (!baselineCountPreserved) failureReasons.push('baseline-turn-count-shrank');
    if (!stableOrder) failureReasons.push('baseline-turn-order-changed');
    if (duplicateCurrentTurnNos.length) failureReasons.push('duplicate-current-turn-number');
    if (!aliasDiagnosticsClean) failureReasons.push('alias-diagnostics-not-clean');
    if (!finalPrimaryValid) failureReasons.push('final-primary-missing-or-placeholder');
    if (!finalPrimaryPublishedByMiniMap) failureReasons.push('final-primary-not-published-by-minimap');
    for (const row of perTurnEvidence) {
      for (const reason of row.failureReasons) failureReasons.push(`turn-${row.turnNo}:${reason}`);
    }

    return {
      ok: failureReasons.length === 0,
      routeMatches,
      baselineCount: baselineRows.length,
      currentCount: currentRows.length,
      baselineCountPreserved,
      stableOrder,
      duplicateCurrentTurnNos,
      aliasDiagnosticsClean,
      finalTurnNo: asNumber(finalTurn?.turnNo),
      finalPrimaryAId,
      finalPrimaryValid,
      finalPrimaryPublishedByMiniMap,
      perTurnEvidence,
      failureReasons: uniqueOrdered(failureReasons),
    };
  }

  function compactRollbackOwner(owner) {
    return {
      turnNo: asNumber(owner?.turnNo),
      logicalMemberKey: owner?.logicalMemberKey || null,
      qId: owner?.qId || null,
      primaryAId: owner?.primaryAId || null,
    };
  }

  function compactRollbackEvidenceRow(row) {
    const compactSide = (side) => ({
      exact: side?.exact === true,
      aliasEquivalent: side?.aliasEquivalent === true,
      witnessAliasCount: asArray(side?.witnessAliases).length,
      witnessAliases: asArray(side?.witnessAliases).slice(0, 64),
      ownerCount: asNumber(side?.ownerCount),
      owners: asArray(side?.owners).slice(0, 16).map(compactRollbackOwner),
    });
    return stableValue({
      ok: row?.ok === true,
      transition: row?.transition || null,
      turnNo: asNumber(row?.turnNo),
      previousLogicalMemberKey: row?.previousLogicalMemberKey || null,
      currentLogicalMemberKey: row?.currentLogicalMemberKey || null,
      memberKeyRelation: row?.memberKeyRelation || 'unavailable',
      memberKeyRegenerated: row?.memberKeyRegenerated === true,
      memberKeyCorroborates: row?.memberKeyCorroborates === true,
      previous: stableValue(row?.previous || null),
      current: stableValue(row?.current || null),
      question: compactSide(row?.question),
      answer: compactSide(row?.answer),
      quarantine: stableValue(row?.quarantine || null),
      visibleBranch: stableValue(row?.visibleBranch || null),
      failureReasons: uniqueOrdered(asArray(row?.failureReasons)).slice(0, 32),
    });
  }

  function summarizeRollbackEquivalence(evaluation) {
    const rows = asArray(evaluation?.perTurnEvidence);
    const failingRows = rows.filter((row) => row?.ok !== true);
    const passingRows = rows.filter((row) => row?.ok === true);
    const transitionCounts = { exact: 0, 'alias-equivalent': 0 };
    const memberKeyRelationCounts = { equal: 0, regenerated: 0, unavailable: 0 };
    for (const row of rows) {
      if (row?.transition in transitionCounts) transitionCounts[row.transition] += 1;
      if (row?.memberKeyRelation in memberKeyRelationCounts) memberKeyRelationCounts[row.memberKeyRelation] += 1;
    }
    const allFailureReasons = asArray(evaluation?.failureReasons).map((reason) => asString(reason).slice(0, 300));
    const boundedFailureReasons = allFailureReasons.slice(0, 2048);
    return stableValue({
      ok: evaluation?.ok === true,
      routeMatches: evaluation?.routeMatches === true,
      baselineCount: asNumber(evaluation?.baselineCount),
      currentCount: asNumber(evaluation?.currentCount),
      baselineCountPreserved: evaluation?.baselineCountPreserved === true,
      stableOrder: evaluation?.stableOrder === true,
      duplicateCurrentTurnNos: asArray(evaluation?.duplicateCurrentTurnNos).slice(0, 250),
      exactTransitionCount: transitionCounts.exact,
      aliasEquivalentTransitionCount: transitionCounts['alias-equivalent'],
      memberKeyRelationCounts,
      aliasDiagnosticsClean: evaluation?.aliasDiagnosticsClean === true,
      finalTurnNo: asNumber(evaluation?.finalTurnNo),
      finalPrimaryAId: evaluation?.finalPrimaryAId || null,
      finalPrimaryValid: evaluation?.finalPrimaryValid === true,
      finalPrimaryPublishedByMiniMap: evaluation?.finalPrimaryPublishedByMiniMap === true,
      evaluatedTurnCount: rows.length,
      trueFailingRowCount: failingRows.length,
      failingRows: failingRows.slice(0, 24).map(compactRollbackEvidenceRow),
      failingRowsTruncated: failingRows.length > 24,
      passingSampleRows: passingRows.slice(0, 3).map(compactRollbackEvidenceRow),
      failureReasonCount: allFailureReasons.length,
      failureReasons: boundedFailureReasons,
      failureReasonsTruncated: boundedFailureReasons.length < allFailureReasons.length,
    });
  }

  function sourceIs(state, source) {
    return state?.source?.activeSource === source && state?.source?.effectiveSource === source;
  }

  function currentProjectionIds(state) {
    const ids = new Set();
    for (const row of asArray(state?.perTurn)) {
      for (const id of [row.qId, row.primaryAId, ...asArray(row.currentAnswerIds), ...asArray(row.currentAliases)]) {
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  function counterDelta(before, after) {
    const result = {};
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    for (const key of keys) {
      const a = before?.[key];
      const b = after?.[key];
      if (typeof a === 'number' || typeof b === 'number') result[key] = asNumber(b) - asNumber(a);
    }
    return result;
  }

  function sourceHistory() {
    const rich = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']
      .map((key) => readStored(`${STAGE_PREFIX}${key}`))
      .filter(Boolean)
      .map((stage) => ({
        stage: stage.stage,
        capturedAt: stage.capturedAt,
        activeSource: stage.state?.source?.activeSource || stage.after?.source?.activeSource || stage.source?.activeSource || null,
        effectiveSource: stage.state?.source?.effectiveSource || stage.after?.source?.effectiveSource || stage.source?.effectiveSource || null,
      }));
    if (rich.length) return rich;
    const checkpoint = readCheckpoint();
    if (!checkpoint.ok) return [];
    return Object.values(checkpoint.checkpoint.stages).map((stage) => ({
      stage: stage.stage,
      capturedAt: stage.capturedAt,
      activeSource: stage.sourceAfter?.activeSource || null,
      effectiveSource: stage.sourceAfter?.effectiveSource || null,
    }));
  }

  function sessionStageSummaries() {
    const summaries = {};
    for (const key of storageKeys(G.sessionStorage)) {
      if (!key.startsWith(STAGE_PREFIX) || key === BASELINE_KEY || key === RUN_ID_KEY) continue;
      const value = readStored(key);
      if (!value?.stage) continue;
      summaries[stageName(value.stage)] = compactStageSummary(value);
    }
    return summaries;
  }

  function EXPORT() {
    const checkpoint = readCheckpoint({ runId: getCurrentRunId() || null });
    const result = stableValue({
      ok: checkpoint.ok,
      exportedAt: nowIso(),
      checkpointReason: checkpoint.ok ? null : checkpoint.reason,
      checkpoint: checkpoint.ok ? checkpoint.checkpoint : null,
      stageSummaries: {
        ...(checkpoint.ok ? checkpoint.checkpoint.stages : {}),
        ...sessionStageSummaries(),
      },
    });
    if (result.ok) console.log('[CV-3.2 EXPORT]', result);
    else console.error('[CV-3.2 EXPORT FAILURE]', result);
    return result;
  }

  function CLEANUP() {
    const removed = { sessionStorage: [], localStorage: [] };
    for (const [name, storage] of [
      ['sessionStorage', G.sessionStorage],
      ['localStorage', G.localStorage],
    ]) {
      for (const key of storageKeys(storage)) {
        if (!key.startsWith(STAGE_PREFIX)) continue;
        try {
          storage.removeItem(key);
          removed[name].push(key);
        } catch {
          // The postcondition below fails closed if removal did not succeed.
        }
      }
    }
    currentRunId = null;
    volatileStageStates.clear();
    const remaining = {
      sessionStorage: storageKeys(G.sessionStorage).filter((key) => key.startsWith(STAGE_PREFIX)),
      localStorage: storageKeys(G.localStorage).filter((key) => key.startsWith(STAGE_PREFIX)),
    };
    const result = {
      ok: remaining.sessionStorage.length === 0 && remaining.localStorage.length === 0,
      removed,
      remaining,
    };
    if (result.ok) console.log('[CV-3.2 CLEANUP]', result);
    else console.error('[CV-3.2 CLEANUP FAILURE]', result);
    return result;
  }

  async function captureTurnEvents(action, settleMs = 1200) {
    const events = [];
    const handler = (event) => events.push(stableValue(event?.detail || {}));
    G.addEventListener(TURN_UPDATED_EVENT, handler);
    try {
      const result = action();
      await wait(settleMs);
      return { result: stableValue(result), events };
    } finally {
      G.removeEventListener(TURN_UPDATED_EVENT, handler);
    }
  }

  function compareAliasGauges(before, after) {
    const keys = [
      'currentCrossMemberDuplicateCount',
      'crossMemberAliasConflictCount',
      'currentAliasConflictCount',
      'historicalAliasConflictCount',
      'duplicateAliasCount',
      'quarantinedAliasCount',
    ];
    return Object.fromEntries(keys.map((key) => [key, asNumber(after?.[key]) - asNumber(before?.[key])]));
  }

  async function P0() {
    const run = beginFreshRun();
    if (!run.ok) {
      const result = {
        stage: 'P0',
        capturedAt: nowIso(),
        ok: false,
        canSwitch: false,
        run,
        failureReasons: [run.reason || 'checkpoint-run-start-failed'],
        instruction: 'Run CLEANUP(), then restart the canary from P0.',
      };
      console.error('[CV-3.2 P0 FAILURE]', compactStageSummary(result));
      return result;
    }
    const rt = runtime();
    const state = captureState({ includeRows: false });
    const api = {
      runtime: !!rt,
      getter: typeof rt?.getChatAtlasCanonicalSource === 'function',
      setter: typeof rt?.setChatAtlasCanonicalSource === 'function',
      ledgerSnapshot: typeof rt?.getChatAtlasLedgerSnapshot === 'function',
      ledgerDiagnostics: typeof rt?.getChatAtlasLedgerDiagnostics === 'function',
      convergence: typeof rt?.getChatAtlasConvergenceParity === 'function',
      records: typeof rt?.listTurnRecords === 'function',
    };
    const ledgerChatMatches = !!comparableChatKey(state.activeChatKey)
      && comparableChatKey(state.activeChatKey) === comparableChatKey(state.ledgerSummary.chatKey);
    const gates = {
      APIsAvailable: Object.values(api).every(Boolean),
      legacyDefault: state.source.defaultSource === SOURCE_LEGACY,
      legacyActive: sourceIs(state, SOURCE_LEGACY),
      sourceNotPersisted: state.source.persisted === false,
      ledgerReady: state.ledgerSummary.ledgerReady === true,
      ledgerChatMatches,
      countsAgree: countsEqual(state.counts),
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
    };
    const ok = Object.values(gates).every(Boolean);
    return saveStage('P0', {
      ok,
      canSwitch: ok,
      run: { runId: run.runId, resumed: run.resumed },
      api,
      gates,
      state: compactEvidenceState(state),
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      instruction: ok ? 'Run P1 next.' : 'ABORT. Do not run P2.',
    });
  }

  async function P1() {
    const preflight = getStage('P0');
    if (!preflight?.ok) return saveStage('P1', { ok: false, failureReasons: ['p0-not-passed'], instruction: 'Run P0 and resolve every gate.' });
    const state = captureState({ includeRows: true });
    const baseline = compactBaselineState(state);
    writeStored(BASELINE_KEY, baseline);
    const ok = sourceIs(state, SOURCE_LEGACY) && countsEqual(state.counts) && dualRunClean(state.dualRun);
    return saveStage('P1', {
      ok,
      baselineKey: BASELINE_KEY,
      baselineReference: {
        key: BASELINE_KEY,
        evidenceSchema: EVIDENCE_SCHEMA_VERSION,
        turnCount: baseline.perTurn.length,
        serializedChars: stableJson(baseline).length,
        perTurnFingerprint: baseline.fingerprints.baselinePerTurn,
      },
      state: compactEvidenceState(state),
      multiVariantTurnFound: !!state.knownMultiVariantTurn,
      instruction: ok ? 'Review the baseline, then run P2.' : 'ABORT. Do not run P2.',
    });
  }

  async function P2() {
    const p0 = getStage('P0');
    const baseline = readStored(BASELINE_KEY);
    const before = captureState({ includeRows: false });
    if (!p0?.ok || !baseline || !sourceIs(before, SOURCE_LEGACY)) {
      return saveStage('P2', {
        ok: false,
        switched: false,
        failureReasons: ['preflight-or-baseline-invalid-or-source-not-legacy'],
        rollbackInstruction: ROLLBACK_INSTRUCTION,
      });
    }
    const compactBefore = compactEvidenceState(before);
    const projectedP2Payload = {
      ok: true,
      switched: true,
      gates: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`projectedGate${index + 1}`, true])),
      setterResult: { ok: true, changed: true, activeSource: SOURCE_LEDGER },
      turnUpdateEvents: [{ reason: 'projected-capacity', version: before.turnVersion + 1 }],
      before: compactBefore,
      state: compactBefore,
      aliasGaugeDelta: {},
      failureReasons: [],
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    };
    const evidenceCapacity = capacityPreflight([
      { stage: 'P2', payload: projectedP2Payload },
      { stage: 'P8', payload: projectedRollbackPayload(captureState({ includeRows: true })) },
    ]);
    if (!evidenceCapacity.ok) {
      return saveStage('P2', {
        ok: false,
        switched: false,
        evidenceCapacity,
        before: compactBefore,
        failureReasons: ['evidence-capacity-preflight-failed'],
        rollbackInstruction: ROLLBACK_INSTRUCTION,
        instruction: 'ABORT. The ledger setter was not called.',
      });
    }
    const eventCapture = await captureTurnEvents(() => {
      return runtime().setChatAtlasCanonicalSource(SOURCE_LEDGER);
    });
    const after = captureState({ includeRows: false });
    const result = eventCapture.result || {};
    const aliasDelta = compareAliasGauges(before.aliasDiagnostics, after.aliasDiagnostics);
    const gates = {
      setterOk: result.ok === true,
      changed: result.changed === true,
      ledgerActive: sourceIs(after, SOURCE_LEDGER),
      versionAdvanced: after.turnVersion > before.turnVersion,
      sourceNotPersisted: after.source.persisted === false,
      oneTurnUpdate: eventCapture.events.length === 1,
      mismatchStillZero: dualRunClean(after.dualRun),
      aliasGaugesUnchanged: Object.values(aliasDelta).every((value) => value === 0),
      ledgerStillReady: after.ledgerSummary.ledgerReady === true,
    };
    const ok = Object.values(gates).every(Boolean);
    return saveStage('P2', {
      ok,
      switched: sourceIs(after, SOURCE_LEDGER),
      gates,
      setterResult: result,
      turnUpdateEvents: eventCapture.events.slice(0, 8),
      before: compactBefore,
      state: compactEvidenceState(after),
      aliasGaugeDelta: aliasDelta,
      evidenceCapacity,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
      instruction: ok ? 'Wait for a stable UI, then run P3.' : 'STOP. Run P8 now; reload immediately if rollback fails.',
    });
  }

  async function P3() {
    await wait(1200);
    const baseline = readStored(BASELINE_KEY);
    const state = captureState({ includeRows: true });
    const baselineByTurn = new Map(asArray(baseline?.perTurn).map((row) => [row.turnNo, row]));
    const rawOrderChanges = state.perTurn.filter((row) => {
      const before = baselineByTurn.get(row.turnNo);
      return before && JSON.stringify(before.answerIds) !== JSON.stringify(row.answerIds);
    }).map((row) => ({ turnNo: row.turnNo, legacy: baselineByTurn.get(row.turnNo).answerIds, ledger: row.answerIds }));
    const visibleVariantChanges = rawOrderChanges.filter((change) => {
      const before = baselineByTurn.get(change.turnNo);
      const after = state.perTurn.find((row) => row.turnNo === change.turnNo);
      return before?.primaryAId !== after?.primaryAId;
    });
    const consumerFailures = Object.values(state.consumers || {}).filter((consumer) => consumer.status === 'present-failing');
    const compactConsumers = compactConsumerResults(state.consumers);
    const gates = {
      ledgerSource: sourceIs(state, SOURCE_LEDGER),
      countsAgree: countsEqual(state.counts),
      identityAligned: state.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
      consumersPass: consumerFailures.length === 0,
      visibleVariantBehaviorStable: visibleVariantChanges.length === 0,
    };
    return saveStage('P3', {
      ok: Object.values(gates).every(Boolean),
      gates,
      state: compactEvidenceState(state),
      rawVariantOrderChanged: rawOrderChanges.length > 0,
      rawVariantOrderChangeCount: rawOrderChanges.length,
      rawVariantOrderChanges: rawOrderChanges.slice(0, 24),
      visibleVariantBehaviorChanged: visibleVariantChanges.length > 0,
      visibleVariantBehaviorChangeCount: visibleVariantChanges.length,
      visibleVariantBehaviorChanges: visibleVariantChanges.slice(0, 24),
      consumerResults: compactConsumers,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P4_ARM() {
    const state = captureState({ includeRows: true });
    rememberFullState('P4_ARM', state);
    const movementInfrastructure = readMovementEvidence();
    const projectedMovement = movementInfrastructure.ok ? {
      ok: true,
      helperVersion: movementInfrastructure.evidence.helperVersion,
      helperScenarioId: movementInfrastructure.evidence.scenarioId,
      chatKey: activeChatKey(),
      snapshotLabels: ['oldest', 'middle', 'newest'],
      snapshotReferences: ['oldest', 'middle', 'newest'].map((label) => ({
        label,
        snapshotId: 'projected-movement-reference',
        capturedAt: nowIso(),
        chatKey: activeChatKey(),
      })),
      regionCount: 3,
      movementCoverageComplete: true,
      missingLabels: [],
    } : { ok: false, reason: movementInfrastructure.reason, movementCoverageComplete: false };
    const compactState = compactEvidenceState(state);
    const projectedMembership = compareMembershipIdentityStates(state, state);
    const projectedPrimaryPublication = currentPrimaryPublication(state);
    const projectedP4 = {
      ok: true,
      gates: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`projectedGate${index + 1}`, true])),
      armSummary: compactState,
      firstSettledSummary: compactState,
      state: compactState,
      membershipIdentityComparison: projectedMembership,
      currentPrimaryPublication: projectedPrimaryPublication,
      fingerprintContinuity: {
        before: projectedMembership.beforeFingerprint,
        after: projectedMembership.afterFingerprint,
        matching: projectedMembership.rawFingerprintMatching,
        rawBefore: projectedMembership.beforeFingerprint,
        rawAfter: projectedMembership.afterFingerprint,
        rawMatching: projectedMembership.rawFingerprintMatching,
        semanticBefore: projectedMembership.semanticBeforeFingerprint,
        semanticAfter: projectedMembership.semanticAfterFingerprint,
        semanticMatching: projectedMembership.semanticFingerprintMatching,
        acceptedHydrationPromotionCount: projectedMembership.acceptedHydrationPromotionCount,
      },
      movementEvidence: projectedMovement,
      automaticRefreshDelta: {},
      idleThreeSecondAutomaticRefreshDelta: {},
      failureReasons: [],
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    };
    const evidenceCapacity = capacityPreflight([
      { stage: 'P4_ARM', payload: { ok: true, state: compactState } },
      { stage: 'P4', payload: projectedP4 },
      { stage: 'P8', payload: projectedRollbackPayload(state) },
    ]);
    const ok = sourceIs(state, SOURCE_LEDGER)
      && countsEqual(state.counts)
      && movementInfrastructure.ok
      && evidenceCapacity.ok;
    const payload = {
      ok,
      manualActionAuthorized: ok,
      state: compactState,
      movementInfrastructure: movementInfrastructure.ok ? {
        ok: true,
        helperVersion: movementInfrastructure.evidence.helperVersion,
        helperScenarioId: movementInfrastructure.evidence.scenarioId,
        chatKey: activeChatKey(),
      } : movementInfrastructure,
      evidenceCapacity,
      failureReasons: [
        ...(!movementInfrastructure.ok ? [movementInfrastructure.reason] : []),
        ...(!evidenceCapacity.ok ? ['evidence-capacity-preflight-failed'] : []),
      ],
      manualAction: ok
        ? 'Capture helper snapshots labeled oldest, middle, and newest while moving through the chat, then wait ten seconds and run P4.'
        : 'Do not perform the manual movement. Resolve the failed evidence preflight first.',
    };
    return saveStage('P4_ARM', payload);
  }

  async function P4() {
    const arm = readStored(`${STAGE_PREFIX}p4-arm`);
    if (!arm?.ok) return saveStage('P4', { ok: false, failureReasons: ['p4-arm-missing-or-failed'], rollbackInstruction: ROLLBACK_INSTRUCTION });
    const armFullState = recalledFullState('P4_ARM');
    if (!armFullState) return saveStage('P4', { ok: false, failureReasons: ['p4-arm-volatile-state-missing'], rollbackInstruction: ROLLBACK_INSTRUCTION });
    const first = captureState({ includeRows: true });
    await wait(3000);
    const second = captureState({ includeRows: true });
    const beforeAuto = armFullState.miniMapAutomaticRefresh?.automaticRefresh || {};
    const afterAuto = second.miniMapAutomaticRefresh?.automaticRefresh || {};
    const idleAutoDelta = counterDelta(first.miniMapAutomaticRefresh?.automaticRefresh || {}, afterAuto);
    const membershipIdentityComparison = compareMembershipIdentityStates(armFullState, second);
    const primaryPublication = currentPrimaryPublication(second);
    const movementEvidence = compactMovementEvidenceReferences({
      scenarioId: arm.movementInfrastructure?.helperScenarioId,
    });
    const gates = {
      ledgerSource: sourceIs(second, SOURCE_LEDGER),
      countsAgree: countsEqual(second.counts),
      logicalMembershipStable: membershipIdentityComparison.stable,
      miniMapAligned: second.miniMapIdentityAlignment.ok === true,
      finalPrimaryPublishedByMiniMap: primaryPublication.ok,
      dualRunExact: dualRunClean(second.dualRun),
      convergenceClean: asArray(second.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(second.aliasDiagnostics),
      noInstrumentationError: asNumber(second.dualRun?.instrumentationErrorCount) === 0,
      noIdleRebuildLoop: idleAutomaticRefreshSettled(idleAutoDelta),
      movementCoverageComplete: movementEvidence.ok && movementEvidence.movementCoverageComplete,
    };
    return saveStage('P4', {
      ok: Object.values(gates).every(Boolean),
      gates,
      armSummary: compactEvidenceState(armFullState),
      firstSettledSummary: compactEvidenceState(first),
      state: compactEvidenceState(second),
      membershipIdentityComparison,
      currentPrimaryPublication: primaryPublication,
      fingerprintContinuity: {
        before: membershipIdentityComparison.beforeFingerprint,
        after: membershipIdentityComparison.afterFingerprint,
        matching: membershipIdentityComparison.rawFingerprintMatching,
        rawBefore: membershipIdentityComparison.beforeFingerprint,
        rawAfter: membershipIdentityComparison.afterFingerprint,
        rawMatching: membershipIdentityComparison.rawFingerprintMatching,
        semanticBefore: membershipIdentityComparison.semanticBeforeFingerprint,
        semanticAfter: membershipIdentityComparison.semanticAfterFingerprint,
        semanticMatching: membershipIdentityComparison.semanticFingerprintMatching,
        acceptedHydrationPromotionCount: membershipIdentityComparison.acceptedHydrationPromotionCount,
      },
      movementEvidence,
      automaticRefreshDelta: counterDelta(beforeAuto, afterAuto),
      idleThreeSecondAutomaticRefreshDelta: idleAutoDelta,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P5_ARM() {
    const state = captureState({ includeRows: true });
    rememberFullState('P5_ARM', state);
    const compactState = compactEvidenceState(state);
    const projectedP5 = {
      ok: true,
      gates: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`projectedGate${index + 1}`, true])),
      expectedReducedCount: Math.max(1, asNumber(state.counts?.canonical) - 1),
      removedTurnCount: Math.min(24, asArray(state.perTurn).length),
      removedTurns: asArray(state.perTurn).slice(-24).map(compactBaselineTurn),
      leakedRemovedIds: [],
      state: compactState,
      failureReasons: [],
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    };
    const evidenceCapacity = capacityPreflight([
      { stage: 'P5_ARM', payload: { ok: true, state: compactState } },
      { stage: 'P5', payload: projectedP5 },
      { stage: 'P8', payload: projectedRollbackPayload(state) },
    ]);
    const ok = sourceIs(state, SOURCE_LEDGER) && countsEqual(state.counts) && evidenceCapacity.ok;
    const payload = {
      ok,
      manualActionAuthorized: ok,
      state: compactState,
      evidenceCapacity,
      failureReasons: evidenceCapacity.ok ? [] : ['evidence-capacity-preflight-failed'],
      manualAction: ok
        ? 'In the disposable branch conversation, select the shorter branch so downstream turns disappear. Do not navigate to another conversation.'
        : 'Do not select the shorter branch. Resolve the failed evidence preflight first.',
    };
    return saveStage('P5_ARM', payload);
  }

  async function P5() {
    await wait(1500);
    const arm = readStored(`${STAGE_PREFIX}p5-arm`);
    const armFullState = recalledFullState('P5_ARM');
    const state = captureState({ includeRows: true });
    const beforeTurns = new Map(asArray(armFullState?.perTurn).map((row) => [row.turnNo, row]));
    const afterTurns = new Map(state.perTurn.map((row) => [row.turnNo, row]));
    const removedTurns = Array.from(beforeTurns.values()).filter((row) => !afterTurns.has(row.turnNo));
    const currentIds = currentProjectionIds(state);
    const leakedRemovedIds = [];
    for (const row of removedTurns) {
      for (const id of [row.qId, row.primaryAId, ...row.currentAnswerIds]) if (id && currentIds.has(id)) leakedRemovedIds.push(id);
    }
    const gates = {
      armPassed: !!arm?.ok,
      armVolatileStatePresent: !!armFullState,
      sameChatRoute: comparableChatKey(armFullState?.activeChatKey) === comparableChatKey(state.activeChatKey),
      countReduced: state.counts.canonical < asNumber(armFullState?.counts?.canonical),
      countsAgree: countsEqual(state.counts),
      removedTurnsExist: removedTurns.length > 0,
      removedIdentitiesAbsent: leakedRemovedIds.length === 0,
      ledgerSource: sourceIs(state, SOURCE_LEDGER),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
    };
    return saveStage('P5', {
      ok: Object.values(gates).every(Boolean),
      gates,
      expectedReducedCount: state.counts.canonical,
      removedTurnCount: removedTurns.length,
      removedTurns: removedTurns.slice(0, 24).map(compactBaselineTurn),
      removedTurnsTruncated: removedTurns.length > 24,
      leakedRemovedIds: uniqueOrdered(leakedRemovedIds),
      state: compactEvidenceState(state),
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P6_ARM() {
    const p5 = getStage('P5');
    const state = captureState({ includeRows: true });
    rememberFullState('P6_ARM', state);
    const compactState = compactEvidenceState(state);
    const projectedP6 = {
      ok: true,
      gates: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`projectedGate${index + 1}`, true])),
      restoredIdentityMismatchCount: 0,
      restoredIdentityMismatches: [],
      shortOnlyIdCount: 0,
      shortOnlyIds: [],
      leakedShortOnlyIds: [],
      state: compactState,
      failureReasons: [],
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    };
    const evidenceCapacity = capacityPreflight([
      { stage: 'P6_ARM', payload: { ok: true, state: compactState } },
      { stage: 'P6', payload: projectedP6 },
      { stage: 'P8', payload: projectedRollbackPayload(state) },
    ]);
    const ok = !!p5?.ok && evidenceCapacity.ok;
    const payload = {
      ok,
      manualActionAuthorized: ok,
      state: compactState,
      evidenceCapacity,
      failureReasons: evidenceCapacity.ok ? [] : ['evidence-capacity-preflight-failed'],
      manualAction: ok
        ? 'Switch back to the original longer branch under the same conversation route, then wait for automatic MiniMap regrowth.'
        : 'Do not restore the longer branch. Resolve the failed evidence preflight first.',
    };
    return saveStage('P6_ARM', payload);
  }

  async function P6() {
    await wait(1500);
    const arm = readStored(`${STAGE_PREFIX}p6-arm`);
    const armFullState = recalledFullState('P6_ARM');
    const baseline = readStored(BASELINE_KEY);
    const state = captureState({ includeRows: true });
    const baselineByTurn = new Map(asArray(baseline?.perTurn).map((row) => [row.turnNo, row]));
    const currentByTurn = new Map(state.perTurn.map((row) => [row.turnNo, row]));
    const restoredIdentityMismatches = [];
    for (const [turnNo, before] of baselineByTurn) {
      const after = currentByTurn.get(turnNo);
      if (!after || before.qId !== after.qId || before.primaryAId !== after.primaryAId) {
        restoredIdentityMismatches.push({ turnNo, expected: before, actual: after || null });
      }
    }
    const shortIds = currentProjectionIds(armFullState || {});
    const baselineIds = currentProjectionIds(baseline || {});
    const currentIds = currentProjectionIds(state);
    const shortOnlyIds = Array.from(shortIds).filter((id) => !baselineIds.has(id));
    const leakedShortOnlyIds = shortOnlyIds.filter((id) => currentIds.has(id));
    const gates = {
      armPassed: !!arm?.ok,
      armVolatileStatePresent: !!armFullState,
      sameChatRoute: comparableChatKey(armFullState?.activeChatKey) === comparableChatKey(state.activeChatKey),
      originalCountRestored: state.counts.canonical === asNumber(baseline?.counts?.canonical),
      countsAgree: countsEqual(state.counts),
      originalIdentitiesRestored: restoredIdentityMismatches.length === 0,
      shortOnlyCurrentIdentitiesAbsent: leakedShortOnlyIds.length === 0,
      ledgerSource: sourceIs(state, SOURCE_LEDGER),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
    };
    return saveStage('P6', {
      ok: Object.values(gates).every(Boolean),
      gates,
      restoredIdentityMismatchCount: restoredIdentityMismatches.length,
      restoredIdentityMismatches: restoredIdentityMismatches.slice(0, 24),
      shortOnlyIdCount: shortOnlyIds.length,
      shortOnlyIds: shortOnlyIds.slice(0, 48),
      leakedShortOnlyIds: leakedShortOnlyIds.slice(0, 48),
      state: compactEvidenceState(state),
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P7_ARM() {
    const state = captureState({ includeRows: true });
    rememberFullState('P7_ARM', state);
    const compactState = compactEvidenceState(state);
    const projectedP7During = {
      ok: true,
      state: compactState,
      lastTurn: compactBaselineTurn(state.perTurn.at(-1) || {}),
      failureReasons: [],
    };
    const projectedP7 = {
      ok: true,
      gates: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`projectedGate${index + 1}`, true])),
      exactPrompt: 'CV-3 LEDGER CANARY STREAMING PASS',
      before: compactState,
      during: projectedP7During,
      finalTurn: compactBaselineTurn(state.perTurn.at(-1) || {}),
      streamingIdentityContinuity: { ok: true, reasons: [] },
      state: compactState,
      failureReasons: [],
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    };
    const evidenceCapacity = capacityPreflight([
      { stage: 'P7_ARM', payload: { ok: true, state: compactState } },
      { stage: 'P7_DURING', payload: projectedP7During },
      { stage: 'P7', payload: projectedP7 },
      { stage: 'P8', payload: projectedRollbackPayload(state) },
    ]);
    const ok = sourceIs(state, SOURCE_LEDGER) && countsEqual(state.counts) && evidenceCapacity.ok;
    const payload = {
      ok,
      manualActionAuthorized: ok,
      state: compactState,
      evidenceCapacity,
      exactPrompt: 'CV-3 LEDGER CANARY STREAMING PASS',
      failureReasons: evidenceCapacity.ok ? [] : ['evidence-capacity-preflight-failed'],
      manualAction: ok
        ? 'Submit the exact prompt, then run P7_DURING while the answer is still streaming. Run P7 after completion.'
        : 'Do not submit the prompt. Resolve the failed evidence preflight first.',
    };
    return saveStage('P7_ARM', payload);
  }

  async function P7_DURING() {
    const state = captureState({ includeRows: true });
    const lastTurn = state.perTurn.at(-1) || null;
    const payload = {
      ok: !!lastTurn?.primaryAId,
      state: compactEvidenceState(state),
      lastTurn: lastTurn ? compactBaselineTurn(lastTurn) : null,
      failureReasons: lastTurn?.primaryAId ? [] : ['missing-p7-during-primary'],
    };
    return saveStage('P7_DURING', payload);
  }

  async function P7() {
    await wait(1500);
    const arm = readStored(`${STAGE_PREFIX}p7-arm`);
    const armFullState = recalledFullState('P7_ARM');
    const during = readStored(`${STAGE_PREFIX}p7-during`);
    const state = captureState({ includeRows: true });
    const finalTurn = state.perTurn.at(-1) || null;
    const duringTurn = during?.lastTurn || null;
    const placeholder = duringTurn?.primaryAId || null;
    const streamingIdentityContinuity = evaluateStreamingIdentityContinuity(
      duringTurn,
      finalTurn,
      state,
    );
    const gates = {
      armPassed: !!arm?.ok,
      duringCapturePresent: !!during,
      armVolatileStatePresent: !!armFullState,
      canonicalIncreasedOne: state.counts.canonical === asNumber(armFullState?.counts?.canonical) + 1,
      countsAgree: countsEqual(state.counts),
      finalAnswerPresent: !!finalTurn?.primaryAId && finalTurn.noAnswer === false,
      finalPrimaryPublishedByMiniMap: state.miniMapBoxes.some((box) => box.turnNo === finalTurn.turnNo && box.primaryAId === finalTurn.primaryAId),
      streamingIdentityContinuity: streamingIdentityContinuity.ok,
      ledgerSource: sourceIs(state, SOURCE_LEDGER),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(state.aliasDiagnostics),
    };
    return saveStage('P7', {
      ok: Object.values(gates).every(Boolean),
      gates,
      exactPrompt: arm?.exactPrompt,
      before: compactEvidenceState(armFullState),
      during,
      finalTurn: finalTurn ? compactBaselineTurn(finalTurn) : null,
      requestPlaceholderCandidate: placeholder,
      streamingIdentityContinuity,
      state: compactEvidenceState(state),
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P8() {
    const baseline = readStored(BASELINE_KEY);
    const before = captureState({ includeRows: true });
    if (before.source.activeSource !== SOURCE_LEDGER) {
      return saveStage('P8', {
        ok: sourceIs(before, SOURCE_LEGACY),
        changed: false,
        evidenceDegraded: false,
        state: compactEvidenceState(before),
        failureReasons: sourceIs(before, SOURCE_LEGACY) ? [] : ['unexpected-source-before-rollback'],
        rollbackInstruction: ROLLBACK_INSTRUCTION,
      });
    }
    let eventCapture;
    try {
      eventCapture = await captureTurnEvents(() => {
        return runtime().setChatAtlasCanonicalSource(SOURCE_LEGACY);
      });
    } catch (error) {
      const afterError = captureState({ includeRows: false });
      return saveStage('P8', {
        ok: false,
        changed: false,
        evidenceDegraded: false,
        error: asString(error?.message || error),
        state: compactEvidenceState(afterError),
        emergencyRollbackRequired: true,
        rollbackInstruction: ROLLBACK_INSTRUCTION,
      });
    }
    const after = captureState({ includeRows: true });
    const rollbackEquivalence = evaluateRollbackEquivalence(baseline, after);
    const rollbackEquivalenceSummary = summarizeRollbackEquivalence(rollbackEquivalence);
    const result = eventCapture.result || {};
    const gates = {
      setterOk: result.ok === true,
      changed: result.changed === true,
      legacyActive: sourceIs(after, SOURCE_LEGACY),
      versionAdvanced: after.turnVersion > before.turnVersion,
      sourceNotPersisted: after.source.persisted === false,
      oneTurnUpdate: eventCapture.events.length === 1,
      countsAgree: countsEqual(after.counts),
      miniMapAligned: after.miniMapIdentityAlignment.ok === true,
      dualRunExact: dualRunClean(after.dualRun),
      convergenceClean: asArray(after.convergence?.blockers).length === 0,
      aliasesClean: aliasClean(after.aliasDiagnostics),
      rollbackEquivalent: rollbackEquivalence.ok,
      finalPrimaryNonPlaceholder: rollbackEquivalence.finalPrimaryValid,
      finalPrimaryPublishedByMiniMap: rollbackEquivalence.finalPrimaryPublishedByMiniMap,
    };
    const ok = Object.values(gates).every(Boolean);
    const normalPayload = {
      ok,
      changed: result.changed === true,
      evidenceDegraded: false,
      gates,
      setterResult: result,
      turnUpdateEvents: eventCapture.events.slice(0, 8),
      before: compactEvidenceState(before),
      state: compactEvidenceState(after),
      rollbackEquivalence: rollbackEquivalenceSummary,
      emergencyRollbackRequired: !ok,
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
      instruction: ok ? 'Run P9_ARM, wait 60 seconds, then run P9.' : 'Reload immediately, reinstall this harness, then run P8_RELOAD_VERIFY.',
    };
    const normalCapacity = predictStageCapacity('P8', normalPayload);
    if (normalCapacity.ok) return saveStage('P8', normalPayload);

    const degradedPayload = {
      ok: false,
      changed: result.changed === true,
      evidenceDegraded: true,
      degradationReason: normalCapacity.reasons.includes('stage-record-size-limit-exceeded')
        ? 'stage-record-size-limit-exceeded'
        : 'persisted-evidence-capacity-unavailable',
      normalEvidenceCapacity: {
        chars: normalCapacity.measurement.chars,
        bytes: normalCapacity.measurement.bytes,
        limitChars: STAGE_RECORD_MAX_CHARS,
        reasons: normalCapacity.reasons,
      },
      setterResult: stableValue(result),
      turnUpdateEvents: eventCapture.events.slice(0, 8),
      rollbackOutcome: {
        legacyActive: sourceIs(after, SOURCE_LEGACY),
        source: compactSource(after.source),
        counts: compactCounts(after.counts),
        miniMapAligned: after.miniMapIdentityAlignment.ok === true,
        dualRun: compactDualRun(after.dualRun),
        convergence: compactConvergence(after.convergence),
        aliasDiagnostics: compactAliasGauges(after.aliasDiagnostics),
      },
      emergencyRollbackRequired: !sourceIs(after, SOURCE_LEGACY),
      failureReasons: [`evidence-degraded:${normalCapacity.reasons.join(',') || 'persisted-evidence-capacity-unavailable'}`],
      rollbackInstruction: ROLLBACK_INSTRUCTION,
      instruction: 'Rollback completed, but required evidence degraded. P10 must return CANARY_INCOMPLETE_EVIDENCE.',
    };
    return saveStage('P8', degradedPayload);
  }

  async function P8_RELOAD_VERIFY() {
    const recovered = readCheckpoint({ runId: null });
    if (!recovered.ok) {
      const result = {
        stage: 'P8_RELOAD',
        capturedAt: nowIso(),
        evidenceSchema: EVIDENCE_SCHEMA_VERSION,
        ok: false,
        emergencyRollbackUsed: true,
        checkpointRecovery: { ok: false, reason: recovered.reason },
        failureReasons: [`checkpoint:${recovered.reason}`],
      };
      writeStored(stageStorageKey('P8_RELOAD'), result);
      console.error('[CV-3.2 P8 RELOAD VERIFY FAILURE]', compactStageSummary(result));
      return result;
    }
    const adopted = adoptCheckpointRun(recovered.checkpoint);
    if (!adopted.ok) {
      const result = {
        stage: 'P8_RELOAD',
        capturedAt: nowIso(),
        evidenceSchema: EVIDENCE_SCHEMA_VERSION,
        ok: false,
        emergencyRollbackUsed: true,
        checkpointRecovery: { ok: false, reason: adopted.reason },
        failureReasons: [`checkpoint:${adopted.reason}`],
      };
      console.error('[CV-3.2 P8 RELOAD VERIFY FAILURE]', compactStageSummary(result));
      return result;
    }
    const state = captureState({ includeRows: true });
    const gates = {
      legacyActive: sourceIs(state, SOURCE_LEGACY),
      defaultLegacy: state.source.defaultSource === SOURCE_LEGACY,
      sourceNotPersisted: state.source.persisted === false,
      countsAgree: countsEqual(state.counts),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
    };
    return saveStage('P8_RELOAD', {
      ok: Object.values(gates).every(Boolean),
      emergencyRollbackUsed: true,
      gates,
      evidenceDegraded: false,
      state: compactEvidenceState(state),
      checkpointRecovery: {
        ok: true,
        runId: recovered.checkpoint.runId,
        recoveredStageNames: Object.keys(recovered.checkpoint.stages),
        previousP8Summary: recovered.checkpoint.stages.P8 || null,
      },
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
    });
  }

  async function P9_ARM() {
    const state = captureState({ includeRows: true });
    rememberFullState('P9_ARM', state);
    const payload = {
      ok: sourceIs(state, SOURCE_LEGACY),
      armedAt: nowIso(),
      state: compactEvidenceState(state),
      manualAction: 'Wait a full 60 seconds without interacting, then run P9.',
    };
    return saveStage('P9_ARM', payload);
  }

  async function P9() {
    const arm = readStored(`${STAGE_PREFIX}p9-arm`);
    const armFullState = recalledFullState('P9_ARM');
    const elapsedMs = Date.now() - Date.parse(arm?.armedAt || 0);
    const state = captureState({ includeRows: true });
    const beforeAuto = armFullState?.miniMapAutomaticRefresh?.automaticRefresh || {};
    const afterAuto = state.miniMapAutomaticRefresh?.automaticRefresh || {};
    const autoDelta = counterDelta(beforeAuto, afterAuto);
    const aliasDelta = compareAliasGauges(armFullState?.aliasDiagnostics || {}, state.aliasDiagnostics);
    const gates = {
      armPassed: !!arm?.ok,
      armVolatileStatePresent: !!armFullState,
      waitedAtLeast60Seconds: elapsedMs >= 60000,
      legacyActive: sourceIs(state, SOURCE_LEGACY),
      sourceSwitchCountStable: state.source.switchCount === armFullState?.source?.switchCount,
      countsAgree: countsEqual(state.counts),
      miniMapAligned: state.miniMapIdentityAlignment.ok === true,
      noIdentityDriftRebuildGrowth: asNumber(autoDelta.identityDriftRebuildCount) === 0,
      noCoreRebuildGrowth: asNumber(autoDelta.coreTurnUpdatedRebuildCount) === 0,
      noMismatchGrowth: asNumber(state.dualRun?.totalMismatchCount) === asNumber(armFullState?.dualRun?.totalMismatchCount),
      noConflictOrQuarantineGrowth: Object.values(aliasDelta).every((value) => value === 0),
      dualRunExact: dualRunClean(state.dualRun),
      convergenceClean: asArray(state.convergence?.blockers).length === 0,
    };
    return saveStage('P9', {
      ok: Object.values(gates).every(Boolean),
      gates,
      elapsedMs,
      automaticRefreshDelta: autoDelta,
      aliasGaugeDelta: aliasDelta,
      state: compactEvidenceState(state),
      failureReasons: Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name),
      rollbackInstruction: ROLLBACK_INSTRUCTION,
    });
  }

  async function P10() {
    const checkpointRead = readCheckpoint();
    const checkpointStages = checkpointRead.ok ? checkpointRead.checkpoint.stages : {};
    const stages = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
      const key = `P${index}`;
      return [key, getStage(key) || checkpointStages[key] || null];
    }));
    const emergency = getStage('P8_RELOAD') || checkpointStages.P8_RELOAD || null;
    const missingStages = Object.entries(stages).filter(([, result]) => !result).map(([name]) => name);
    const failedStages = Object.entries(stages).filter(([, result]) => result && result.ok !== true).map(([name]) => name);
    const degradedStages = Object.entries(stages).filter(([, result]) => result?.evidenceDegraded === true).map(([name]) => name);
    const p3 = stages.P3;
    let canaryVerdict;
    if (!stages.P0?.ok) canaryVerdict = 'CANARY_ABORTED_PREFLIGHT';
    else if (degradedStages.length) canaryVerdict = 'CANARY_INCOMPLETE_EVIDENCE';
    else if (emergency?.emergencyRollbackUsed) canaryVerdict = emergency.ok ? 'CANARY_FAILED_RELOAD_RECOVERED' : 'CANARY_FAILED_ROLLED_BACK';
    else if (failedStages.length || missingStages.length) canaryVerdict = 'CANARY_FAILED_ROLLED_BACK';
    else if (p3?.rawVariantOrderChanged && !p3?.visibleVariantBehaviorChanged) canaryVerdict = 'CANARY_PASS_WITH_VARIANT_ORDER_WATCH';
    else canaryVerdict = 'CANARY_PASS';
    const ok = canaryVerdict === 'CANARY_PASS' || canaryVerdict === 'CANARY_PASS_WITH_VARIANT_ORDER_WATCH';
    const result = {
      ok,
      canaryVerdict,
      emergencyRollbackUsed: !!emergency?.emergencyRollbackUsed,
      stageResults: Object.fromEntries(Object.entries(stages).map(([key, value]) => [key, value ? { ok: value.ok, failureReasons: value.failureReasons || [] } : null])),
      evidenceDegradedStages: degradedStages,
      sourceHistory: sourceHistory(),
      baselineSummary: stages.P1?.state
        ? { counts: stages.P1.state.counts, source: stages.P1.state.source, turnVersion: stages.P1.state.turnVersion }
        : (checkpointStages.P1 || null),
      ledgerSummary: stages.P7?.state
        ? { counts: stages.P7.state.counts, source: stages.P7.state.source, ledger: stages.P7.state.ledgerSummary }
        : (checkpointStages.P7 || null),
      rollbackSummary: stages.P8?.state
        ? { counts: stages.P8.state.counts, source: stages.P8.state.source, turnVersion: stages.P8.state.turnVersion }
        : (stages.P8?.rollbackOutcome || checkpointStages.P8 || emergency || null),
      variantOrderFinding: {
        rawVariantOrderChanged: !!p3?.rawVariantOrderChanged,
        visibleVariantBehaviorChanged: !!p3?.visibleVariantBehaviorChanged,
        changes: p3?.rawVariantOrderChanges || [],
      },
      consumerResults: p3?.consumerResults || null,
      aliasDiagnostics: stages.P9?.state?.aliasDiagnostics || stages.P8?.state?.aliasDiagnostics || null,
      dualRunResults: stages.P9?.state?.dualRun || stages.P8?.state?.dualRun || null,
      convergenceResults: stages.P9?.state?.convergence || stages.P8?.state?.convergence || null,
      automaticRefreshResults: stages.P9?.state?.miniMapAutomaticRefresh || null,
      idleResults: stages.P9 || null,
      failureStage: failedStages[0] || missingStages[0] || null,
      failureReasons: [
        ...failedStages.flatMap((stage) => asArray(stages[stage]?.failureReasons).map((reason) => `${stage}:${reason}`)),
        ...missingStages.map((stage) => `${stage}:not-run`),
      ],
      checkpointRecovery: {
        ok: checkpointRead.ok,
        reason: checkpointRead.ok ? null : checkpointRead.reason,
        runId: checkpointRead.ok ? checkpointRead.checkpoint.runId : null,
      },
    };
    return saveStage('P10', result);
  }

  const API = Object.freeze({
    version: VERSION,
    evidenceSchema: EVIDENCE_SCHEMA_VERSION,
    limits: Object.freeze({
      stageRecordMaxChars: STAGE_RECORD_MAX_CHARS,
      checkpointMaxBytes: CHECKPOINT_MAX_BYTES,
    }),
    sourceValues: Object.freeze({ legacy: SOURCE_LEGACY, ledger: SOURCE_LEDGER }),
    rollbackInstruction: Object.freeze(ROLLBACK_INSTRUCTION.slice()),
    P0,
    P1,
    P2,
    P3,
    P4_ARM,
    P4,
    P5_ARM,
    P5,
    P6_ARM,
    P6,
    P7_ARM,
    P7_DURING,
    P7,
    P8,
    P8_RELOAD_VERIFY,
    P9_ARM,
    P9,
    P10,
    evaluateStreamingIdentityContinuity,
    evaluateRollbackEquivalence,
    EXPORT,
    CLEANUP,
    inspect: () => captureState({ includeRows: true }),
    readStage: (stage) => getStage(asString(stage).toUpperCase()),
  });

  Object.defineProperty(G, 'H2O_CV3_CANARY', {
    value: API,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  console.info(`[CV-3.2] Installed ${VERSION}. No stage or source switch has run.`);
})();
