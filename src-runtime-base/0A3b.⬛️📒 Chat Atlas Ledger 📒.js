// ==H2O Module==
// @h2o-id             0a3b.chatatlas.ledger
// @name               0A3b.⬛️📒 Chat Atlas Ledger 📒
// @namespace          H2O.Premium.CGX.chatatlas.ledger
// @author             HumamDev
// @version            12.7.11
// @revision           001
// @build              260808-000003
// @description        Chat Atlas Ledger: evidence observer, canonical-source mode, dual-run comparison, convergence parity and ledger diagnostics
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

// ─────────────────────────────────────────────────────────────────────────────
// CHAT ATLAS LEDGER.
//
// Sole owner of the Ledger subsystem: chatAtlasLedgerState,
// chatAtlasCanonicalSourceState and chatAtlasDualRunState, the evidence
// MutationObserver, the rAF flush scheduler, the version/route reset lifecycle,
// canonical-record construction, dual-run comparison, convergence parity and
// every Ledger diagnostic. All of it moved out of 0A1a H2O Core verbatim.
//
// The Ledger is OPTIONAL. Canonical source defaults to 'legacy' and nothing in
// production flips it, so generic H2O turn building must keep working whether or
// not this file is present. It registers itself into 0A3a Chat Atlas Core and is
// reached only through that broker:
//
//     0A1a H2O Core  →  0A3a Chat Atlas Core  →  0A3b Chat Atlas Ledger
//
// It writes no central Chat Atlas state (completeTurnIndexAuthorityState,
// selectedPathAcquisitionState, selectedPathOverlayState) and no generic
// turnState. Where the extracted code reads those, it reads them through the
// host surface below.
// ─────────────────────────────────────────────────────────────────────────────

(() => {
  'use strict';

  const D = document;
  const W = window;
  const TOPW = W.top || W;
  const H2O = (W.H2O = W.H2O || {});

  const LEDGER_VER = '12.7.11';

  // ── DOM/contract constants (own copies; leaf values, per project convention)
  const ATTR_TESTID = 'data-testid';
  const ATTR_MESSAGE_AUTHOR_ROLE = 'data-message-author-role';
  const SEL_CORE_WITH_ROLE = `[${ATTR_MESSAGE_AUTHOR_ROLE}]`;
  const EV_CORE_TURN_UPDATED = 'evt:h2o:core:turn:updated';
  const CHAT_ATLAS_SHELL_SEL = 'section[data-testid^="conversation-turn-"]';
  const CHAT_ATLAS_PAGE_SIZE = 25;
  const CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL = [
    '[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"]',
    '[data-h2o-owner="minimap-v10"]',
  ].join(', ');
  const CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL = [
    '[data-cgxui="mnmp-btn"]',
    '[data-cgxui="mm-btn"]',
    '.cgxui-mm-btn',
  ].join(', ');

  // ── Broker + host surface ─────────────────────────────────────────────────
  // Everything the extracted Ledger still needs from H2O Core (generic turn
  // model) and from the central Chat Atlas implementation that has not moved
  // yet is reached through 0A3a. Resolution is per call; when the broker or a
  // member is missing the shim is inert, which matches the Ledger's existing
  // not-ready behaviour. Milestone 2B deletes most of these as their real
  // implementations arrive in 0A3a.
  //
  // These are const-arrow bindings, not function declarations, so they cannot
  // collide with the identically named production functions in 0A1a when a
  // validator scans an aggregated source for `  function <name>(`.
  const core = () => {
    try { return TOPW.H2O_CHAT_ATLAS_CORE || W.H2O_CHAT_ATLAS_CORE || null; } catch { return null; }
  };
  const host = () => core()?.getHost?.() || null;
  // Milestone 2B-2 moved the central Chat Atlas implementation into 0A3a, so the
  // helpers below now resolve from the broker's own scope rather than from H2O
  // Core's host surface. Resolution stays per call and inert when absent.
  const atlas = () => core()?.getAtlasHost?.() || null;

  // generic turn model / state owned by H2O Core
  const turnState = new Proxy({}, {
    get: (_t, k) => host()?.turnState?.[k],
    set: () => true,   // the Ledger never writes generic turn state
  });
  const completeTurnIndexAuthorityState = new Proxy({}, {
    get: (_t, k) => atlas()?.completeTurnIndexAuthorityState?.[k],
    set: () => true,   // nor central Chat Atlas authority state
  });

  const buildCanonicalTurnId = (...a) => host()?.buildCanonicalTurnId?.(...a);
  const buildTurns = (...a) => host()?.buildTurns?.(...a);
  const getEffectivePresentationIndex = (...a) => atlas()?.getEffectivePresentationIndex?.(...a);

  // central Chat Atlas helpers, owned by 0A3a since Milestone 2B-2
  const chatAtlasCanonicalPresentationIndex = (...a) => atlas()?.chatAtlasCanonicalPresentationIndex?.(...a);
  const chatAtlasClearBranchSelectionStale = (...a) => atlas()?.chatAtlasClearBranchSelectionStale?.(...a);
  const chatAtlasCloseBranchTransaction = (...a) => atlas()?.chatAtlasCloseBranchTransaction?.(...a);
  const chatAtlasCompleteBranchExpansionCheckpoint = (...a) => atlas()?.chatAtlasCompleteBranchExpansionCheckpoint?.(...a);
  const chatAtlasCompleteIndexAuthorityActive = (...a) => atlas()?.chatAtlasCompleteIndexAuthorityActive?.(...a) === true;
  const chatAtlasCompleteIndexIdentity = (...a) => atlas()?.chatAtlasCompleteIndexIdentity?.(...a);
  const chatAtlasCurrentChatKey = (...a) => atlas()?.chatAtlasCurrentChatKey?.(...a) ?? '';
  const chatAtlasCv2CurrentIds = (...a) => atlas()?.chatAtlasCv2CurrentIds?.(...a);
  const chatAtlasEvaluateHistoricalCompleteness = (...a) => atlas()?.chatAtlasEvaluateHistoricalCompleteness?.(...a);
  const chatAtlasFailClosedPreExpansionReturn = (...a) => atlas()?.chatAtlasFailClosedPreExpansionReturn?.(...a);
  const chatAtlasFreeze = (...a) => atlas()?.chatAtlasFreeze?.(...a) ?? (a.length ? a[0] : undefined);
  const chatAtlasFullIndexRoute = (...a) => atlas()?.chatAtlasFullIndexRoute?.(...a);
  const chatAtlasNormalizeChatKey = (...a) => atlas()?.chatAtlasNormalizeChatKey?.(...a) ?? '';
  const chatAtlasNormalizeId = (...a) => atlas()?.chatAtlasNormalizeId?.(...a) ?? '';
  const chatAtlasNow = (...a) => atlas()?.chatAtlasNow?.(...a) ?? Date.now();
  const chatAtlasNullableCount = (...a) => atlas()?.chatAtlasNullableCount?.(...a) ?? 0;
  const chatAtlasOpenBranchExpansion = (...a) => atlas()?.chatAtlasOpenBranchExpansion?.(...a);
  const chatAtlasPairEvidence = (...a) => atlas()?.chatAtlasPairEvidence?.(...a);
  const chatAtlasReadEvidence = (...a) => atlas()?.chatAtlasReadEvidence?.(...a);
  const chatAtlasReadMiniMapCompletenessDiagnostics = (...a) => atlas()?.chatAtlasReadMiniMapCompletenessDiagnostics?.(...a);
  const chatAtlasRealBranchExpansionTargetValidation = (...a) => atlas()?.chatAtlasRealBranchExpansionTargetValidation?.(...a);
  const chatAtlasSelectedPathEvaluate = (...a) => atlas()?.chatAtlasSelectedPathEvaluate?.(...a);
  const chatAtlasSelectedPathOverlayEvaluate = (...a) => atlas()?.chatAtlasSelectedPathOverlayEvaluate?.(...a);
  const chatAtlasTraceTrustedLifecycle = (...a) => atlas()?.chatAtlasTraceTrustedLifecycle?.(...a);

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTED LEDGER IMPLEMENTATION — moved verbatim from 0A1a H2O Core.
  // No renames, no signature changes, no substitutions.
  // ═══════════════════════════════════════════════════════════════════════════

  const chatAtlasLedgerState = {
    ready: false,
    version: 0,
    chatKey: '',
    members: [],
    nextMemberId: 1,
    subscribers: new Set(),
    observer: null,
    observerRoot: null,
    observerActive: false,
    canonicalListenerBound: false,
    dirtyShells: new Set(),
    fullRebuildPending: false,
    raf: 0,
    buildCount: 0,
    lastBuildMs: 0,
    flushCount: 0,
    lastFlushMs: 0,
    maxFlushMs: 0,
    lastDirtyShellCount: 0,
    aliasAbsorbCount: 0,
    duplicateAliasCount: 0,
    currentCrossMemberDuplicateCount: 0,
    crossMemberAliasConflictCount: 0,
    crossMemberAliasRepairCount: 0,
    currentAliasConflictCount: 0,
    historicalAliasConflictCount: 0,
    pairingAdjacencyRejectCount: 0,
    quarantinedAliases: new Set(),
    quarantinedAliasResolutionCount: 0,
    lastAliasConflict: null,
    recentAliasConflicts: [],
    lastPairingRejection: null,
    recentPairingRejections: [],
    completeShellMap: false,
    duplicateMemberCandidates: [],
    unboundShells: [],
    parityWithCurrentTurnRuntime: false,
    parityStatus: 'not-built',
    parityDisagreements: [],
    warnings: [],
    canonicalRecordCount: 0,
    canonicalTurnVersion: 0,
    shellCount: 0,
    questionShellCount: 0,
    answerShellCount: 0,
  };

  const CHAT_ATLAS_CANONICAL_SOURCE_LEGACY = 'legacy-durable-cache';

  const CHAT_ATLAS_CANONICAL_SOURCE_LEDGER = 'chat-atlas-ledger';

  const CHAT_ATLAS_CANONICAL_SOURCES = Object.freeze([
    CHAT_ATLAS_CANONICAL_SOURCE_LEGACY,
    CHAT_ATLAS_CANONICAL_SOURCE_LEDGER,
  ]);

  const CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT = 12;

  const CHAT_ATLAS_DUAL_RUN_FIELDS = Object.freeze([
    'count',
    'order',
    'stableIdentity',
    'qId',
    'primaryAId',
    'answerIds',
    '_aliasIds',
    'turnNo',
    'idx',
    'noAnswer',
    'fieldShape',
    'missingInLegacy',
    'missingInAdapter',
    'duplicateIdentity',
    'duplicateAlias',
    'primaryRekey',
  ]);

  function createChatAtlasMismatchCounters() {
    return Object.fromEntries(CHAT_ATLAS_DUAL_RUN_FIELDS.map((field) => [field, 0]));
  }

  const chatAtlasCanonicalSourceState = {
    defaultSource: CHAT_ATLAS_CANONICAL_SOURCE_LEGACY,
    activeSource: CHAT_ATLAS_CANONICAL_SOURCE_LEGACY,
    effectiveSource: CHAT_ATLAS_CANONICAL_SOURCE_LEGACY,
    switchCount: 0,
    invalidSwitchCount: 0,
    rejectedSwitchCount: 0,
    canonicalMutationAttemptCount: 0,
    lastSwitch: null,
    lastInvalidSwitch: null,
    lastRejectedSwitch: null,
    latestLegacyRecords: [],
    latestLegacyVersion: 0,
    latestLegacyCapture: null,
    legacyCaptureCount: 0,
    lastSelection: null,
  };

  const chatAtlasDualRunState = {
    ready: false,
    comparisonCount: 0,
    sequence: 0,
    lastComparisonTimestamp: null,
    lastReason: null,
    legacyCount: 0,
    adapterCount: 0,
    countParity: false,
    orderParity: false,
    fieldShapeParity: false,
    exactParity: false,
    totalMismatchCount: 0,
    currentMismatchCount: 0,
    cleanComparisonStreak: 0,
    mismatchCountersByField: createChatAtlasMismatchCounters(),
    cumulativeMismatchCountersByField: createChatAtlasMismatchCounters(),
    missingInLegacyCount: 0,
    missingInAdapterCount: 0,
    duplicateIdentityCount: 0,
    duplicateAliasCount: 0,
    primaryRekeyCount: 0,
    recentMismatchSamples: [],
    recentSkipSamples: [],
    evidenceChatKey: '',
    comparisonEligible: false,
    comparisonActive: false,
    lastSkipReason: null,
    skippedComparisonCount: 0,
    staleCaptureSkipCount: 0,
    chatKeyMismatchSkipCount: 0,
    generationMismatchSkipCount: 0,
    reentrantSkipCount: 0,
    rebaseCount: 0,
    lastRebaseTimestamp: null,
    lastRebaseReason: null,
    comparedLedgerVersion: null,
    comparedCaptureSequence: null,
    instrumentationErrorCount: 0,
    lastInstrumentationError: null,
    warnings: [],
  };

  function chatAtlasShellDescriptor(shell) {
    if (!shell || !shell.isConnected) return null;
    return {
      connected: true,
      testId: String(shell.getAttribute?.(ATTR_TESTID) || ''),
      turnId: String(shell.getAttribute?.('data-turn-id') || ''),
      role: String(shell.getAttribute?.('data-turn') || ''),
    };
  }

  function chatAtlasRecordAliases(record) {
    const aliases = new Set();
    const add = (value) => {
      const id = chatAtlasNormalizeId(value);
      if (id) aliases.add(id);
    };
    add(record?.qId);
    add(record?.primaryAId);
    for (const value of record?.answerIds || []) add(value);
    for (const value of record?._aliasIds || []) add(value);
    return aliases;
  }

  function chatAtlasBuildOwnerMap(records, aliasFn) {
    const owners = new Map();
    for (const record of Array.isArray(records) ? records : []) {
      for (const alias of aliasFn(record)) {
        if (!owners.has(alias)) owners.set(alias, new Set());
        owners.get(alias).add(record);
      }
    }
    return owners;
  }

  function chatAtlasQuestionEvidenceAliases(pair) {
    return chatAtlasCv2CurrentIds([
      pair?.question?.messageId,
      pair?.question?.shellTurnId,
      ...(pair?.question?.aliases || []),
    ]);
  }

  function chatAtlasMatchPreviousRecord(
    pair,
    previousByQuestionShell,
    previousQuestionOwners,
    usedPrevious,
    quarantinedAliases,
  ) {
    const candidates = new Set();
    const shellCandidate = pair?.question?.shell
      ? previousByQuestionShell.get(pair.question.shell)
      : null;
    if (shellCandidate) {
      return usedPrevious.has(shellCandidate)
        ? { record: null, basis: 'question-shell-already-used', candidates: [shellCandidate] }
        : { record: shellCandidate, basis: 'question-shell', candidates: [shellCandidate] };
    }
    for (const alias of chatAtlasQuestionEvidenceAliases(pair)) {
      if (quarantinedAliases.has(alias)) continue;
      for (const owner of previousQuestionOwners.get(alias) || []) candidates.add(owner);
    }
    if (candidates.size !== 1) {
      return { record: null, basis: candidates.size ? 'ambiguous-question-alias' : 'no-positive-question-match', candidates: Array.from(candidates) };
    }
    const record = Array.from(candidates)[0];
    return usedPrevious.has(record)
      ? { record: null, basis: 'question-alias-already-used', candidates: [record] }
      : { record, basis: 'question-alias', candidates: [record] };
  }

  function chatAtlasCanonicalQuestionAliases(record) {
    return chatAtlasCv2CurrentIds([record?.qId]);
  }

  function chatAtlasMatchCanonicalRecord(
    member,
    canonicalQuestionOwners,
    canonicalShellBindings,
    usedCanonical,
    quarantinedAliases,
  ) {
    const shellCandidates = [];
    for (const [canonical, bindings] of canonicalShellBindings) {
      if (bindings?.qShell && bindings.qShell === member.question.shellRef) shellCandidates.push(canonical);
    }
    if (shellCandidates.length === 1) {
      const record = shellCandidates[0];
      return usedCanonical.has(record) ? null : record;
    }
    if (shellCandidates.length > 1) return null;

    const candidates = new Set();
    for (const alias of chatAtlasCv2CurrentIds([
      member?.question?.qId,
      ...(member?.question?.currentAliases || []),
    ])) {
      if (quarantinedAliases.has(alias)) continue;
      for (const owner of canonicalQuestionOwners.get(alias) || []) candidates.add(owner);
    }
    if (candidates.size !== 1) return null;
    const record = Array.from(candidates)[0];
    return usedCanonical.has(record) ? null : record;
  }

  function chatAtlasMemberDiagnosticRef(member) {
    return {
      logicalMemberKey: String(member?.logicalMemberKey || ''),
      turnNo: Number(member?.turnNo || 0) || null,
    };
  }

  function chatAtlasRecordAliasConflict(sample, kind = 'historical') {
    const event = {
      timestamp: new Date().toISOString(),
      flushSequence: Number(chatAtlasLedgerState.version || 0) + 1,
      ...sample,
    };
    chatAtlasLedgerState.crossMemberAliasConflictCount += 1;
    if (kind === 'current') chatAtlasLedgerState.currentAliasConflictCount += 1;
    if (kind === 'historical') chatAtlasLedgerState.historicalAliasConflictCount += 1;
    if (kind === 'repair') chatAtlasLedgerState.crossMemberAliasRepairCount += 1;
    chatAtlasLedgerState.lastAliasConflict = event;
    chatAtlasLedgerState.recentAliasConflicts.push(event);
    if (chatAtlasLedgerState.recentAliasConflicts.length > CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      chatAtlasLedgerState.recentAliasConflicts.splice(
        0,
        chatAtlasLedgerState.recentAliasConflicts.length - CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
      );
    }
  }

  function chatAtlasRecordPairingRejection(rejection) {
    const event = {
      timestamp: new Date().toISOString(),
      flushSequence: Number(chatAtlasLedgerState.version || 0) + 1,
      ...rejection,
    };
    chatAtlasLedgerState.pairingAdjacencyRejectCount += 1;
    chatAtlasLedgerState.lastPairingRejection = event;
    chatAtlasLedgerState.recentPairingRejections.push(event);
    if (chatAtlasLedgerState.recentPairingRejections.length > CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      chatAtlasLedgerState.recentPairingRejections.splice(
        0,
        chatAtlasLedgerState.recentPairingRejections.length - CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
      );
    }
  }

  function chatAtlasBuildCurrentAliasOwners(members) {
    const owners = new Map();
    const add = (member, side, path, values) => {
      for (const alias of chatAtlasCv2CurrentIds(values)) {
        if (!owners.has(alias)) owners.set(alias, new Map());
        const memberKey = String(member.logicalMemberKey || '');
        if (!owners.get(alias).has(memberKey)) {
          owners.get(alias).set(memberKey, { member, sides: new Set(), paths: new Set() });
        }
        const evidence = owners.get(alias).get(memberKey);
        evidence.sides.add(side);
        evidence.paths.add(path);
      }
    };
    for (const member of Array.isArray(members) ? members : []) {
      add(member, 'question', 'question-current-alias', member.question.currentAliases);
      add(member, 'question', 'question-shell-evidence', member.question.evidenceAliases);
      add(member, 'question', 'current-qid', [member.question.currentQId]);
      if (member.answer.currentProjectionSource === 'native-evidence') {
        add(member, 'answer', 'answer-current-alias', member.answer.currentAliases);
        add(member, 'answer', 'answer-shell-evidence', member.answer.evidenceAliases);
        add(member, 'answer', 'answer-current-id', member.answer.currentAnswerIds);
        add(member, 'answer', 'projected-primary', [member.answer.primaryAId]);
      }
    }
    return owners;
  }

  function chatAtlasPrepareAliasQuarantine(currentOwners, priorQuarantine) {
    const quarantine = new Set();
    for (const alias of priorQuarantine || []) {
      if ((currentOwners.get(alias)?.size || 0) !== 1) quarantine.add(alias);
    }
    let currentConflicts = 0;
    for (const [alias, owners] of currentOwners) {
      if (owners.size <= 1) continue;
      currentConflicts += 1;
      quarantine.add(alias);
      const entries = Array.from(owners.values());
      chatAtlasRecordAliasConflict({
        alias,
        winningMemberKey: null,
        winningTurnNo: null,
        losingMembers: entries.map((entry) => chatAtlasMemberDiagnosticRef(entry.member)),
        evidenceClass: 'current',
        evidencePaths: entries.flatMap((entry) => Array.from(entry.paths)),
        action: 'quarantined',
      }, 'current');
    }
    chatAtlasLedgerState.currentCrossMemberDuplicateCount = currentConflicts;
    return quarantine;
  }

  function chatAtlasRecordAliasRepairOnce(
    alias,
    winner,
    loser,
    evidenceClass,
    source,
    repairEventKeys,
  ) {
    const winnerRef = chatAtlasMemberDiagnosticRef(winner);
    const loserRef = chatAtlasMemberDiagnosticRef(loser);
    const key = `${alias}|${winnerRef.logicalMemberKey}|${loserRef.logicalMemberKey}`;
    if (repairEventKeys.has(key)) return;
    repairEventKeys.add(key);
    chatAtlasRecordAliasConflict({
      alias,
      winningMemberKey: winnerRef.logicalMemberKey,
      winningTurnNo: winnerRef.turnNo,
      losingMembers: [loserRef],
      evidenceClass,
      source,
      action: 'removed-from-historical-owner',
    }, 'repair');
  }

  function chatAtlasAbsorbHistoricalAliases(target, values, context) {
    let absorbed = 0;
    for (const alias of chatAtlasCv2CurrentIds(values)) {
      const currentOwners = context.currentOwners.get(alias);
      if (currentOwners?.size > 1) continue;
      if (currentOwners?.size === 1) {
        const winner = Array.from(currentOwners.values())[0].member;
        if (winner !== context.member) {
          chatAtlasRecordAliasRepairOnce(
            alias,
            winner,
            context.member,
            'current-wins-historical',
            context.source,
            context.repairEventKeys,
          );
          continue;
        }
      } else if (context.quarantine.has(alias)) {
        continue;
      }
      if (target.has(alias)) continue;
      target.add(alias);
      absorbed += 1;
    }
    return absorbed;
  }

  function chatAtlasRebuildResolverAliases(member) {
    member.aliases = new Set([
      ...(member.question.aliases || []),
      ...(member.answer.aliases || []),
      ...(member.resolverHistoryAliases || []),
    ]);
  }

  function chatAtlasRemoveResolverAlias(member, alias) {
    member.question.aliases.delete(alias);
    member.answer.aliases.delete(alias);
    member.resolverHistoryAliases.delete(alias);
    member.aliases.delete(alias);
  }

  function chatAtlasRepairResolverOwnership(
    members,
    currentOwners,
    quarantine,
    repairEventKeys,
  ) {
    for (const member of members) chatAtlasRebuildResolverAliases(member);
    const resolverOwners = chatAtlasBuildOwnerMap(members, (member) => member.aliases);
    for (const [alias, owners] of resolverOwners) {
      if (owners.size <= 1) continue;
      const current = currentOwners.get(alias);
      if (current?.size === 1) {
        const winner = Array.from(current.values())[0].member;
        for (const loser of owners) {
          if (loser === winner) continue;
          chatAtlasRemoveResolverAlias(loser, alias);
          chatAtlasRecordAliasRepairOnce(
            alias,
            winner,
            loser,
            'current-wins-historical',
            'final-resolver-repair',
            repairEventKeys,
          );
        }
        continue;
      }
      quarantine.add(alias);
      const ownerList = Array.from(owners);
      for (const member of ownerList) chatAtlasRemoveResolverAlias(member, alias);
      if (!current || current.size <= 1) {
        chatAtlasRecordAliasConflict({
          alias,
          winningMemberKey: null,
          winningTurnNo: null,
          losingMembers: ownerList.map(chatAtlasMemberDiagnosticRef),
          evidenceClass: 'historical',
          action: 'quarantined',
        }, 'historical');
      }
    }
    for (const alias of quarantine) {
      for (const member of members) chatAtlasRemoveResolverAlias(member, alias);
    }
    for (const member of members) chatAtlasRebuildResolverAliases(member);
    const finalOwners = chatAtlasBuildOwnerMap(members, (member) => member.aliases);
    chatAtlasLedgerState.quarantinedAliasResolutionCount = Array.from(quarantine)
      .filter((alias) => (finalOwners.get(alias)?.size || 0) > 0)
      .length;
    return finalOwners;
  }

  function chatAtlasRecordNoAnswerHistoryRepairs(
    previousRecord,
    member,
    currentOwners,
    repairEventKeys,
  ) {
    if (!previousRecord) return;
    const questionAliases = new Set(previousRecord.question.aliases || []);
    const dropped = chatAtlasCv2CurrentIds([
      ...(previousRecord.answer.aliases || []),
      ...Array.from(previousRecord.aliases || []).filter((alias) => !questionAliases.has(alias)),
    ]);
    for (const alias of dropped) {
      const owners = currentOwners.get(alias);
      if (owners?.size !== 1) continue;
      const winner = Array.from(owners.values())[0].member;
      if (winner === member) continue;
      chatAtlasRecordAliasRepairOnce(
        alias,
        winner,
        member,
        'current-wins-no-answer-history',
        'no-answer-history-drop',
        repairEventKeys,
      );
    }
  }

  function chatAtlasMemberSignature(member) {
    return JSON.stringify({
      key: member.logicalMemberKey,
      turnNo: member.turnNo,
      qId: member.question.qId || '',
      currentQId: member.question.currentQId || '',
      primaryAId: member.answer.primaryAId || '',
      aliases: Array.from(member.aliases).sort(),
      questionShellTurnId: member.question.shellTurnId || '',
      questionMessageId: member.question.messageId || '',
      questionCurrentAliases: member.question.currentAliases || [],
      questionEvidenceAliases: member.question.evidenceAliases || [],
      answerCurrentIds: member.answer.currentAnswerIds || [],
      answerCurrentAliases: member.answer.currentAliases || [],
      answerEvidenceAliases: member.answer.evidenceAliases || [],
      answerCurrentShells: member.answer.currentShells || [],
      answerCurrentProjectionSource: member.answer.currentProjectionSource || 'none',
      qHydrated: member.question.hydrated,
      aHydrated: member.answer.hydrated,
      noAnswer: member.noAnswer,
    });
  }

  function chatAtlasPublicMember(member) {
    return {
      logicalMemberKey: member.logicalMemberKey,
      turnNo: member.turnNo,
      question: {
        shellBinding: chatAtlasShellDescriptor(member.question.shellRef),
        shellTurnId: member.question.shellTurnId || null,
        messageId: member.question.messageId || null,
        qId: member.question.qId || null,
        currentQId: member.question.currentQId || null,
        projectedQId: member.question.qId || null,
        currentAliases: (member.question.currentAliases || []).slice(),
        evidenceAliases: (member.question.evidenceAliases || []).slice(),
        aliases: Array.from(member.question.aliases),
        hydrated: !!member.question.hydrated,
      },
      answer: {
        shellBinding: chatAtlasShellDescriptor(member.answer.shellRef),
        shellTurnId: member.answer.shellTurnId || null,
        messageId: member.answer.messageId || null,
        primaryAId: member.answer.primaryAId || null,
        projectedPrimaryAId: member.answer.primaryAId || null,
        currentAnswerIds: (member.answer.currentAnswerIds || []).slice(),
        currentAliases: (member.answer.currentAliases || []).slice(),
        evidenceAliases: (member.answer.evidenceAliases || []).slice(),
        currentShells: (member.answer.currentShells || []).map((item) => ({ ...item })),
        currentProjectionSource: member.answer.currentProjectionSource || 'none',
        aliases: Array.from(member.answer.aliases),
        hydrated: !!member.answer.hydrated,
      },
      resolverAliases: Array.from(member.aliases),
      noAnswer: !!member.noAnswer,
      hydration: member.hydration,
      pageNo: member.pageNo,
      pageIndex: member.pageIndex,
    };
  }

  function chatAtlasCv2UniqueIds(values, opts = {}) {
    const primary = chatAtlasNormalizeId(opts.primaryId) || null;
    const ids = new Set();
    for (const value of values || []) {
      const id = chatAtlasNormalizeId(value);
      if (id && id !== primary) ids.add(id);
    }
    const ordered = Array.from(ids).sort();
    if (primary) ordered.push(primary);
    return ordered;
  }

  function chatAtlasCv2RecordFromDraft(draft, index, logicalMemberKey = '', opts = {}) {
    const turnNo = index + 1;
    const qId = chatAtlasNormalizeId(draft?.qId) || null;
    const rawAnswerIds = Array.isArray(draft?.answerIds) ? draft.answerIds : [];
    const draftPrimary = chatAtlasNormalizeId(draft?.primaryAId)
      || chatAtlasNormalizeId(rawAnswerIds[rawAnswerIds.length - 1])
      || null;
    const preserveProjectionOrder = !!opts.preserveProjectionOrder;
    const answerIds = preserveProjectionOrder
      ? chatAtlasCv2CurrentIds(rawAnswerIds)
      : chatAtlasCv2UniqueIds(rawAnswerIds, { primaryId: draftPrimary });
    const primaryAId = preserveProjectionOrder
      ? (answerIds[answerIds.length - 1] || null)
      : (draftPrimary && answerIds.includes(draftPrimary) ? draftPrimary : null);
    const aliasIds = preserveProjectionOrder
      ? chatAtlasCv2CurrentIds(draft?.aliasIds || draft?._aliasIds || [])
      : chatAtlasCv2UniqueIds(draft?.aliasIds || draft?._aliasIds || []);
    const noAnswer = typeof draft?.noAnswer === 'boolean'
      ? draft.noAnswer
      : !primaryAId && answerIds.length === 0;
    return {
      logicalMemberKey: String(logicalMemberKey || ''),
      turnId: buildCanonicalTurnId({ turnNo, qId, primaryAId }),
      turnNo,
      idx: turnNo,
      index: turnNo,
      qId,
      primaryAId,
      answerIds,
      _aliasIds: aliasIds,
      aliasIds: aliasIds.slice(),
      hasQuestion: !!qId,
      hasAssistant: !noAnswer && answerIds.length > 0,
      noAnswer,
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    };
  }

  // Pure view adapter. Resolver aliases stay broad in the ledger; canonical
  // fields project only the current native shell/message evidence.
  function buildChatAtlasLedgerCanonicalRecords(members = chatAtlasLedgerState.members) {
    // Once the complete-index lane owns presentation, Ledger's canonical
    // projection must consume that same immutable effective index. Native
    // shells are a hydration witness only; a virtualized or mid-transition
    // shell prefix (for example 1..26) is never a second membership authority.
    const effectiveIndex = typeof getEffectivePresentationIndex === 'function'
      ? getEffectivePresentationIndex()
      : null;
    if (
      typeof chatAtlasCompleteIndexAuthorityActive === 'function'
      && chatAtlasCompleteIndexAuthorityActive()
      && effectiveIndex?.complete === true
      && Array.isArray(effectiveIndex.turns)
    ) {
      return effectiveIndex.turns.map((turn, index) => chatAtlasCv2RecordFromDraft({
        qId: turn?.qId || null,
        primaryAId: turn?.primaryAId || null,
        answerIds: Array.isArray(turn?.answerVariants) ? turn.answerVariants.slice() : [],
        aliasIds: [turn?.turnId, ...(turn?.answerVariants || [])],
        noAnswer: turn?.noAnswer === true,
      }, index, `complete-index:${turn?.qId || index + 1}`, { preserveProjectionOrder: true }));
    }
    const orderedMembers = Array.isArray(members)
      ? members.slice().sort((a, b) => Number(a?.turnNo || 0) - Number(b?.turnNo || 0))
      : [];
    return orderedMembers.map((member, index) => {
      const qId = chatAtlasNormalizeId(member?.question?.qId) || null;
      const answerIds = member?.noAnswer
        ? []
        : chatAtlasCv2CurrentIds(member?.answer?.currentAnswerIds || []);
      const primaryAId = member?.noAnswer
        ? null
        : (answerIds[answerIds.length - 1] || null);
      const aliasIds = chatAtlasCv2CurrentIds([
        ...(member?.question?.currentAliases || []),
        ...(member?.answer?.currentAliases || []),
      ]);
      return chatAtlasCv2RecordFromDraft({
        qId,
        primaryAId,
        answerIds,
        aliasIds,
        noAnswer: !!member?.noAnswer,
      }, index, member?.logicalMemberKey || '', { preserveProjectionOrder: true });
    });
  }

  function chatAtlasCv2RecordsToDrafts(records) {
    return (Array.isArray(records) ? records : []).map((record, index) => ({
      turnNo: index + 1,
      qId: record?.qId || null,
      primaryAId: record?.primaryAId || null,
      answerIds: Array.isArray(record?.answerIds) ? record.answerIds.slice() : [],
      aliasIds: Array.isArray(record?._aliasIds) ? record._aliasIds.slice() : [],
      noAnswer: !!record?.noAnswer,
      hasQuestion: !!record?.qId,
      hasAssistant: !record?.noAnswer && !!record?.primaryAId,
      live: { qEl: null, primaryAEl: null, answerEls: [], connected: false },
    }));
  }

  function chatAtlasCv2RecordInstrumentationError(error, operation = 'instrumentation') {
    try {
      const timestamp = new Date().toISOString();
      chatAtlasDualRunState.instrumentationErrorCount += 1;
      chatAtlasDualRunState.lastInstrumentationError = {
        operation: String(operation || 'instrumentation'),
        timestamp,
        message: String(error?.message || error || 'unknown'),
      };
    } catch {}
  }

  function chatAtlasCv2ResetBindingEvidence(chatKey, reason = 'chat-key-change') {
    const key = String(chatKey || '');
    if (chatAtlasDualRunState.evidenceChatKey === key) return;
    chatAtlasDualRunState.evidenceChatKey = key;
    chatAtlasDualRunState.ready = false;
    chatAtlasDualRunState.sequence = 0;
    chatAtlasDualRunState.lastComparisonTimestamp = null;
    chatAtlasDualRunState.lastReason = null;
    chatAtlasDualRunState.legacyCount = 0;
    chatAtlasDualRunState.adapterCount = 0;
    chatAtlasDualRunState.countParity = false;
    chatAtlasDualRunState.orderParity = false;
    chatAtlasDualRunState.fieldShapeParity = false;
    chatAtlasDualRunState.exactParity = false;
    chatAtlasDualRunState.totalMismatchCount = 0;
    chatAtlasDualRunState.currentMismatchCount = 0;
    chatAtlasDualRunState.cleanComparisonStreak = 0;
    chatAtlasDualRunState.mismatchCountersByField = createChatAtlasMismatchCounters();
    chatAtlasDualRunState.cumulativeMismatchCountersByField = createChatAtlasMismatchCounters();
    chatAtlasDualRunState.missingInLegacyCount = 0;
    chatAtlasDualRunState.missingInAdapterCount = 0;
    chatAtlasDualRunState.duplicateIdentityCount = 0;
    chatAtlasDualRunState.duplicateAliasCount = 0;
    chatAtlasDualRunState.primaryRekeyCount = 0;
    chatAtlasDualRunState.recentMismatchSamples = [];
    chatAtlasDualRunState.recentSkipSamples = [];
    chatAtlasDualRunState.comparisonEligible = false;
    chatAtlasDualRunState.lastSkipReason = null;
    chatAtlasDualRunState.comparedLedgerVersion = null;
    chatAtlasDualRunState.comparedCaptureSequence = null;
    chatAtlasDualRunState.warnings = [];
    chatAtlasDualRunState.rebaseCount += 1;
    chatAtlasDualRunState.lastRebaseTimestamp = new Date().toISOString();
    chatAtlasDualRunState.lastRebaseReason = String(reason || 'chat-key-change');
  }

  function chatAtlasCv2RecordComparisonSkip(reason, detail = {}) {
    const skipReason = String(reason || 'comparison-ineligible');
    chatAtlasDualRunState.comparisonEligible = false;
    chatAtlasDualRunState.lastSkipReason = skipReason;
    chatAtlasDualRunState.skippedComparisonCount += 1;
    if (skipReason === 'capture-generation-stale') {
      chatAtlasDualRunState.staleCaptureSkipCount += 1;
      chatAtlasDualRunState.generationMismatchSkipCount += 1;
    } else if (skipReason === 'chat-key-mismatch') {
      chatAtlasDualRunState.chatKeyMismatchSkipCount += 1;
    } else if (skipReason === 'comparison-reentrant') {
      chatAtlasDualRunState.reentrantSkipCount += 1;
    }
    const sample = {
      reason: skipReason,
      timestamp: new Date().toISOString(),
      ...detail,
    };
    chatAtlasDualRunState.recentSkipSamples.push(sample);
    if (chatAtlasDualRunState.recentSkipSamples.length > CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      chatAtlasDualRunState.recentSkipSamples.splice(
        0,
        chatAtlasDualRunState.recentSkipSamples.length - CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
      );
    }
    return { eligible: false, reason: skipReason };
  }

  function chatAtlasCv2CaptureLegacyDrafts(drafts) {
    const records = (Array.isArray(drafts) ? drafts : [])
      .map((draft, index) => chatAtlasCv2RecordFromDraft(draft, index));
    const sequence = chatAtlasCanonicalSourceState.legacyCaptureCount + 1;
    const chatKey = chatAtlasCurrentChatKey();
    const capture = {
      records,
      chatKey,
      sequence,
      timestamp: new Date().toISOString(),
      ledgerChatKey: String(chatAtlasLedgerState.chatKey || ''),
      ledgerVersion: Number(chatAtlasLedgerState.version || 0),
      ledgerFlushCount: Number(chatAtlasLedgerState.flushCount || 0),
      canonicalTurnVersion: Number(turnState.version || 0),
      ledgerPending: !!(
        chatAtlasLedgerState.raf
        || chatAtlasLedgerState.fullRebuildPending
        || chatAtlasLedgerState.dirtyShells.size
      ),
    };
    chatAtlasCanonicalSourceState.latestLegacyRecords = records;
    chatAtlasCanonicalSourceState.latestLegacyVersion += 1;
    chatAtlasCanonicalSourceState.legacyCaptureCount = sequence;
    chatAtlasCanonicalSourceState.latestLegacyCapture = capture;
    return capture;
  }

  function chatAtlasCv2ComparableIds(record) {
    return new Set(chatAtlasCv2UniqueIds([
      record?.turnId,
      record?.qId,
      record?.primaryAId,
      ...(record?.answerIds || []),
      ...(record?._aliasIds || []),
    ]));
  }

  function chatAtlasCv2IdentityKey(record) {
    const qId = chatAtlasNormalizeId(record?.qId);
    if (qId) return `q:${qId}`;
    const primaryAId = chatAtlasNormalizeId(record?.primaryAId);
    if (primaryAId) return `a:${primaryAId}`;
    const logicalMemberKey = String(record?.logicalMemberKey || '').trim();
    if (logicalMemberKey) return `logical:${logicalMemberKey}`;
    return `turn:${Math.max(0, Number(record?.turnNo || 0) || 0)}`;
  }

  function chatAtlasCv2OwnerMap(records, valueFn) {
    const owners = new Map();
    for (let index = 0; index < records.length; index += 1) {
      for (const value of valueFn(records[index])) {
        if (!owners.has(value)) owners.set(value, new Set());
        owners.get(value).add(index);
      }
    }
    return owners;
  }

  function chatAtlasCv2SortedIds(values) {
    return chatAtlasCv2UniqueIds(values).sort();
  }

  function chatAtlasCv2ArraysEqual(left, right) {
    const a = chatAtlasCv2SortedIds(left);
    const b = chatAtlasCv2SortedIds(right);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function chatAtlasCv2PushMismatch(counters, samples, field, detail) {
    counters[field] = (counters[field] || 0) + 1;
    if (samples.length < CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      samples.push({ field, ...detail });
    }
  }

  function chatAtlasCv2CompareCanonicalViews(legacyRecords, adapterRecords) {
    const legacy = Array.isArray(legacyRecords) ? legacyRecords : [];
    const adapter = Array.isArray(adapterRecords) ? adapterRecords : [];
    const counters = createChatAtlasMismatchCounters();
    const samples = [];
    const legacyAliasOwners = chatAtlasCv2OwnerMap(legacy, chatAtlasCv2ComparableIds);
    const legacyIdentityOwners = chatAtlasCv2OwnerMap(legacy, (record) => [chatAtlasCv2IdentityKey(record)]);
    const adapterIdentityOwners = chatAtlasCv2OwnerMap(adapter, (record) => [chatAtlasCv2IdentityKey(record)]);
    const legacyAllAliasOwners = chatAtlasCv2OwnerMap(legacy, chatAtlasCv2ComparableIds);
    const adapterAllAliasOwners = chatAtlasCv2OwnerMap(adapter, chatAtlasCv2ComparableIds);
    const usedLegacy = new Set();

    if (legacy.length !== adapter.length) {
      chatAtlasCv2PushMismatch(counters, samples, 'count', {
        reason: 'record-count-mismatch',
        legacyCount: legacy.length,
        adapterCount: adapter.length,
      });
    }

    for (const [identity, owners] of legacyIdentityOwners) {
      if (owners.size > 1) chatAtlasCv2PushMismatch(counters, samples, 'duplicateIdentity', { source: 'legacy', identity, indexes: Array.from(owners) });
    }
    for (const [identity, owners] of adapterIdentityOwners) {
      if (owners.size > 1) chatAtlasCv2PushMismatch(counters, samples, 'duplicateIdentity', { source: 'adapter', identity, indexes: Array.from(owners) });
    }
    for (const [alias, owners] of legacyAllAliasOwners) {
      if (owners.size > 1) chatAtlasCv2PushMismatch(counters, samples, 'duplicateAlias', { source: 'legacy', alias, indexes: Array.from(owners) });
    }
    for (const [alias, owners] of adapterAllAliasOwners) {
      if (owners.size > 1) chatAtlasCv2PushMismatch(counters, samples, 'duplicateAlias', { source: 'adapter', alias, indexes: Array.from(owners) });
    }

    for (let adapterIndex = 0; adapterIndex < adapter.length; adapterIndex += 1) {
      const adapted = adapter[adapterIndex];
      const candidates = new Set();
      for (const id of chatAtlasCv2ComparableIds(adapted)) {
        for (const legacyIndex of legacyAliasOwners.get(id) || []) {
          if (!usedLegacy.has(legacyIndex)) candidates.add(legacyIndex);
        }
      }
      let legacyIndex = candidates.size === 1 ? Array.from(candidates)[0] : -1;
      if (legacyIndex < 0 && candidates.size === 0 && legacy[adapterIndex] && !usedLegacy.has(adapterIndex)) {
        const fallback = legacy[adapterIndex];
        if (!chatAtlasCv2ComparableIds(adapted).size && !chatAtlasCv2ComparableIds(fallback).size) {
          legacyIndex = adapterIndex;
        }
      }
      if (legacyIndex < 0) {
        chatAtlasCv2PushMismatch(counters, samples, 'stableIdentity', {
          adapterIndex,
          logicalMemberKey: adapted?.logicalMemberKey || '',
          turnNo: adapted?.turnNo || adapterIndex + 1,
          reason: candidates.size > 1 ? 'ambiguous-legacy-identity' : 'no-record-local-identity-match',
        });
        chatAtlasCv2PushMismatch(counters, samples, 'missingInLegacy', {
          adapterIndex,
          logicalMemberKey: adapted?.logicalMemberKey || '',
          turnNo: adapted?.turnNo || adapterIndex + 1,
          reason: candidates.size > 1 ? 'ambiguous-legacy-identity' : 'legacy-record-not-found',
          candidateIndexes: Array.from(candidates),
        });
        continue;
      }
      usedLegacy.add(legacyIndex);
      const current = legacy[legacyIndex];
      const context = {
        logicalMemberKey: adapted?.logicalMemberKey || '',
        adapterIndex,
        legacyIndex,
        turnNo: adapted?.turnNo || adapterIndex + 1,
      };
      if (legacyIndex !== adapterIndex) {
        chatAtlasCv2PushMismatch(counters, samples, 'order', { ...context, reason: 'logical-order-mismatch' });
      }
      if (!current || typeof current !== 'object'
        || !Array.isArray(current.answerIds)
        || !Array.isArray(current._aliasIds)
        || !adapted || typeof adapted !== 'object'
        || !Array.isArray(adapted.answerIds)
        || !Array.isArray(adapted._aliasIds)) {
        chatAtlasCv2PushMismatch(counters, samples, 'fieldShape', { ...context, reason: 'required-field-shape-mismatch' });
      }
      for (const field of ['qId', 'primaryAId', 'turnNo', 'idx', 'noAnswer']) {
        const left = field === 'qId' || field === 'primaryAId'
          ? (chatAtlasNormalizeId(current?.[field]) || null)
          : current?.[field];
        const right = field === 'qId' || field === 'primaryAId'
          ? (chatAtlasNormalizeId(adapted?.[field]) || null)
          : adapted?.[field];
        if (left !== right) {
          chatAtlasCv2PushMismatch(counters, samples, field, { ...context, legacyValue: left, adapterValue: right });
          if (field === 'primaryAId' && left && right) {
            chatAtlasCv2PushMismatch(counters, samples, 'primaryRekey', {
              ...context,
              legacyPrimaryAId: left,
              adapterPrimaryAId: right,
            });
          }
        }
      }
      if (!chatAtlasCv2ArraysEqual(current?.answerIds, adapted?.answerIds)) {
        chatAtlasCv2PushMismatch(counters, samples, 'answerIds', {
          ...context,
          legacyValue: chatAtlasCv2SortedIds(current?.answerIds),
          adapterValue: chatAtlasCv2SortedIds(adapted?.answerIds),
        });
      }
      if (!chatAtlasCv2ArraysEqual(current?._aliasIds, adapted?._aliasIds)) {
        chatAtlasCv2PushMismatch(counters, samples, '_aliasIds', {
          ...context,
          legacyValue: chatAtlasCv2SortedIds(current?._aliasIds),
          adapterValue: chatAtlasCv2SortedIds(adapted?._aliasIds),
        });
      }
    }

    for (let legacyIndex = 0; legacyIndex < legacy.length; legacyIndex += 1) {
      if (usedLegacy.has(legacyIndex)) continue;
      chatAtlasCv2PushMismatch(counters, samples, 'missingInAdapter', {
        legacyIndex,
        turnNo: legacy[legacyIndex]?.turnNo || legacyIndex + 1,
        reason: 'adapter-record-not-found',
      });
    }

    const currentMismatchCount = Object.values(counters).reduce((sum, value) => sum + value, 0);
    return {
      counters,
      samples,
      currentMismatchCount,
      countParity: counters.count === 0,
      orderParity: counters.order === 0 && counters.missingInLegacy === 0 && counters.missingInAdapter === 0,
      fieldShapeParity: counters.fieldShape === 0,
      exactParity: currentMismatchCount === 0,
    };
  }

  function chatAtlasCv2ComparisonEligibility() {
    if (chatAtlasDualRunState.comparisonActive) {
      return chatAtlasCv2RecordComparisonSkip('comparison-reentrant');
    }
    const capture = chatAtlasCanonicalSourceState.latestLegacyCapture;
    if (!capture || !Array.isArray(capture.records)) {
      return chatAtlasCv2RecordComparisonSkip('missing-legacy-capture');
    }
    if (!chatAtlasLedgerState.ready || !chatAtlasLedgerState.members.length) {
      return chatAtlasCv2RecordComparisonSkip('ledger-not-ready', {
        captureSequence: capture.sequence,
      });
    }
    const currentChatKey = chatAtlasCurrentChatKey();
    const ledgerChatKey = String(chatAtlasLedgerState.chatKey || '');
    if (!currentChatKey
      || capture.chatKey !== currentChatKey
      || ledgerChatKey !== currentChatKey
      || capture.ledgerChatKey !== ledgerChatKey) {
      return chatAtlasCv2RecordComparisonSkip('chat-key-mismatch', {
        captureChatKey: capture.chatKey,
        captureLedgerChatKey: capture.ledgerChatKey,
        ledgerChatKey,
        currentChatKey,
        captureSequence: capture.sequence,
      });
    }
    const currentLedgerVersion = Number(chatAtlasLedgerState.version || 0);
    const currentLedgerFlushCount = Number(chatAtlasLedgerState.flushCount || 0);
    const ledgerPending = !!(
      chatAtlasLedgerState.raf
      || chatAtlasLedgerState.fullRebuildPending
      || chatAtlasLedgerState.dirtyShells.size
    );
    if (capture.ledgerPending
      || ledgerPending
      || Number(capture.ledgerVersion) !== currentLedgerVersion
      || Number(capture.ledgerFlushCount) !== currentLedgerFlushCount) {
      return chatAtlasCv2RecordComparisonSkip('capture-generation-stale', {
        captureSequence: capture.sequence,
        captureLedgerVersion: capture.ledgerVersion,
        ledgerVersion: currentLedgerVersion,
        captureLedgerFlushCount: capture.ledgerFlushCount,
        ledgerFlushCount: currentLedgerFlushCount,
        captureLedgerPending: !!capture.ledgerPending,
        ledgerPending,
      });
    }
    return {
      eligible: true,
      capture,
      ledgerVersion: currentLedgerVersion,
      ledgerFlushCount: currentLedgerFlushCount,
      ledgerChatKey,
    };
  }

  function chatAtlasRunCanonicalDualComparison(reason = 'ledger-update') {
    let eligibility = null;
    try {
      eligibility = chatAtlasCv2ComparisonEligibility();
    } catch (error) {
      chatAtlasCv2RecordInstrumentationError(error, 'comparison-eligibility');
      return { eligible: false, ok: false, reason: 'instrumentation-failed' };
    }
    if (!eligibility.eligible) return eligibility;
    chatAtlasDualRunState.comparisonActive = true;
    try {
      const capture = eligibility.capture;
      const legacy = capture.records;
      const adapter = buildChatAtlasLedgerCanonicalRecords();
      const result = chatAtlasCv2CompareCanonicalViews(legacy, adapter);
      chatAtlasDualRunState.ready = true;
      chatAtlasDualRunState.comparisonEligible = true;
      chatAtlasDualRunState.comparisonCount += 1;
      chatAtlasDualRunState.sequence = chatAtlasLedgerState.version;
      chatAtlasDualRunState.lastComparisonTimestamp = new Date().toISOString();
      chatAtlasDualRunState.lastReason = String(reason || 'ledger-update');
      chatAtlasDualRunState.legacyCount = legacy.length;
      chatAtlasDualRunState.adapterCount = adapter.length;
      chatAtlasDualRunState.countParity = result.countParity;
      chatAtlasDualRunState.orderParity = result.orderParity;
      chatAtlasDualRunState.fieldShapeParity = result.fieldShapeParity;
      chatAtlasDualRunState.exactParity = result.exactParity;
      chatAtlasDualRunState.currentMismatchCount = result.currentMismatchCount;
      chatAtlasDualRunState.totalMismatchCount += result.currentMismatchCount;
      chatAtlasDualRunState.cleanComparisonStreak = result.exactParity
        ? chatAtlasDualRunState.cleanComparisonStreak + 1
        : 0;
      chatAtlasDualRunState.mismatchCountersByField = { ...result.counters };
      for (const field of CHAT_ATLAS_DUAL_RUN_FIELDS) {
        chatAtlasDualRunState.cumulativeMismatchCountersByField[field] += result.counters[field] || 0;
      }
      chatAtlasDualRunState.missingInLegacyCount = result.counters.missingInLegacy;
      chatAtlasDualRunState.missingInAdapterCount = result.counters.missingInAdapter;
      chatAtlasDualRunState.duplicateIdentityCount = result.counters.duplicateIdentity;
      chatAtlasDualRunState.duplicateAliasCount = result.counters.duplicateAlias;
      chatAtlasDualRunState.primaryRekeyCount = result.counters.primaryRekey;
      chatAtlasDualRunState.recentMismatchSamples = result.samples.slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT);
      chatAtlasDualRunState.comparedLedgerVersion = eligibility.ledgerVersion;
      chatAtlasDualRunState.comparedCaptureSequence = capture.sequence;
      chatAtlasDualRunState.warnings = [];
      return { eligible: true, exact: result.exactParity };
    } catch (error) {
      chatAtlasCv2RecordInstrumentationError(error, 'dual-run-comparison');
      return { eligible: true, ok: false, reason: 'instrumentation-failed' };
    } finally {
      chatAtlasDualRunState.comparisonActive = false;
    }
  }

  function chatAtlasCanonicalSourceDiagnostics() {
    return {
      defaultSource: chatAtlasCanonicalSourceState.defaultSource,
      activeSource: chatAtlasCanonicalSourceState.activeSource,
      effectiveSource: chatAtlasCanonicalSourceState.effectiveSource,
      supportedSources: CHAT_ATLAS_CANONICAL_SOURCES.slice(),
      switchCount: chatAtlasCanonicalSourceState.switchCount,
      invalidSwitchCount: chatAtlasCanonicalSourceState.invalidSwitchCount,
      rejectedSwitchCount: chatAtlasCanonicalSourceState.rejectedSwitchCount,
      lastSourceSwitch: chatAtlasCanonicalSourceState.lastSwitch ? { ...chatAtlasCanonicalSourceState.lastSwitch } : null,
      lastInvalidSwitch: chatAtlasCanonicalSourceState.lastInvalidSwitch ? { ...chatAtlasCanonicalSourceState.lastInvalidSwitch } : null,
      lastRejectedSwitch: chatAtlasCanonicalSourceState.lastRejectedSwitch ? { ...chatAtlasCanonicalSourceState.lastRejectedSwitch } : null,
      lastSelection: chatAtlasCanonicalSourceState.lastSelection ? { ...chatAtlasCanonicalSourceState.lastSelection } : null,
      persisted: false,
    };
  }

  function chatAtlasDualRunDiagnostics() {
    const capture = chatAtlasCanonicalSourceState.latestLegacyCapture;
    return {
      ready: chatAtlasDualRunState.ready,
      status: chatAtlasDualRunState.ready
        ? (chatAtlasDualRunState.exactParity ? 'exact' : 'mismatch')
        : 'not-ready',
      comparisonCount: chatAtlasDualRunState.comparisonCount,
      flushComparisonSequence: chatAtlasDualRunState.sequence,
      lastComparisonTimestamp: chatAtlasDualRunState.lastComparisonTimestamp,
      lastReason: chatAtlasDualRunState.lastReason,
      legacyCount: chatAtlasDualRunState.legacyCount,
      adapterCount: chatAtlasDualRunState.adapterCount,
      countParity: chatAtlasDualRunState.countParity,
      orderParity: chatAtlasDualRunState.orderParity,
      fieldShapeParity: chatAtlasDualRunState.fieldShapeParity,
      exactParity: chatAtlasDualRunState.exactParity,
      totalMismatchCount: chatAtlasDualRunState.totalMismatchCount,
      currentMismatchCount: chatAtlasDualRunState.currentMismatchCount,
      cleanComparisonStreak: chatAtlasDualRunState.cleanComparisonStreak,
      mismatchCountersByField: { ...chatAtlasDualRunState.mismatchCountersByField },
      cumulativeMismatchCountersByField: { ...chatAtlasDualRunState.cumulativeMismatchCountersByField },
      missingInLegacyCount: chatAtlasDualRunState.missingInLegacyCount,
      missingInAdapterCount: chatAtlasDualRunState.missingInAdapterCount,
      duplicateIdentityCount: chatAtlasDualRunState.duplicateIdentityCount,
      duplicateAliasCount: chatAtlasDualRunState.duplicateAliasCount,
      primaryRekeyCount: chatAtlasDualRunState.primaryRekeyCount,
      recentMismatchSamples: chatAtlasDualRunState.recentMismatchSamples.map((sample) => ({ ...sample })),
      recentSkipSamples: chatAtlasDualRunState.recentSkipSamples.map((sample) => ({ ...sample })),
      mismatchSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
      evidenceChatKey: chatAtlasDualRunState.evidenceChatKey,
      legacyCaptureChatKey: capture?.chatKey || '',
      ledgerChatKey: String(chatAtlasLedgerState.chatKey || ''),
      legacyCaptureSequence: capture?.sequence ?? null,
      legacyCaptureCount: chatAtlasCanonicalSourceState.legacyCaptureCount,
      legacyCaptureTimestamp: capture?.timestamp || null,
      captureLedgerVersion: capture?.ledgerVersion ?? null,
      captureLedgerFlushCount: capture?.ledgerFlushCount ?? null,
      captureCanonicalTurnVersion: capture?.canonicalTurnVersion ?? null,
      captureLedgerPending: capture?.ledgerPending ?? null,
      comparedLedgerVersion: chatAtlasDualRunState.comparedLedgerVersion,
      comparedCaptureSequence: chatAtlasDualRunState.comparedCaptureSequence,
      comparisonEligible: chatAtlasDualRunState.comparisonEligible,
      lastSkipReason: chatAtlasDualRunState.lastSkipReason,
      skippedComparisonCount: chatAtlasDualRunState.skippedComparisonCount,
      staleCaptureSkipCount: chatAtlasDualRunState.staleCaptureSkipCount,
      chatKeyMismatchSkipCount: chatAtlasDualRunState.chatKeyMismatchSkipCount,
      generationMismatchSkipCount: chatAtlasDualRunState.generationMismatchSkipCount,
      reentrantSkipCount: chatAtlasDualRunState.reentrantSkipCount,
      rebaseCount: chatAtlasDualRunState.rebaseCount,
      lastRebaseTimestamp: chatAtlasDualRunState.lastRebaseTimestamp,
      lastRebaseReason: chatAtlasDualRunState.lastRebaseReason,
      instrumentationErrorCount: chatAtlasDualRunState.instrumentationErrorCount,
      lastInstrumentationError: chatAtlasDualRunState.lastInstrumentationError
        ? { ...chatAtlasDualRunState.lastInstrumentationError }
        : null,
      warnings: chatAtlasDualRunState.warnings.slice(),
      domWriteCount: 0,
      storageWriteCount: 0,
      physicalExecutorCallCount: 0,
      paginationExecutorCallCount: 0,
      unmountExecutorCallCount: 0,
    };
  }

  function getChatAtlasCanonicalSource() {
    return chatAtlasCanonicalSourceState.activeSource;
  }

  function chatAtlasLedgerCanonicalSourceReady() {
    const currentChatKey = chatAtlasCurrentChatKey();
    return !!chatAtlasLedgerState.ready
      && !!chatAtlasLedgerState.members.length
      && chatAtlasLedgerState.chatKey === currentChatKey;
  }

  function setChatAtlasCanonicalSource(value) {
    const requested = String(value || '').trim();
    if (!CHAT_ATLAS_CANONICAL_SOURCES.includes(requested)) {
      chatAtlasCanonicalSourceState.invalidSwitchCount += 1;
      chatAtlasCanonicalSourceState.lastInvalidSwitch = {
        requested,
        activeSource: chatAtlasCanonicalSourceState.activeSource,
        timestamp: new Date().toISOString(),
        reason: 'unsupported-source',
      };
      return chatAtlasFreeze({ ok: false, reason: 'unsupported-source', ...chatAtlasCanonicalSourceDiagnostics() });
    }
    if (requested === chatAtlasCanonicalSourceState.activeSource) {
      return chatAtlasFreeze({ ok: true, changed: false, ...chatAtlasCanonicalSourceDiagnostics() });
    }
    if (requested === CHAT_ATLAS_CANONICAL_SOURCE_LEDGER
      && !chatAtlasLedgerCanonicalSourceReady()) {
      chatAtlasCanonicalSourceState.rejectedSwitchCount += 1;
      chatAtlasCanonicalSourceState.lastRejectedSwitch = {
        requested,
        activeSource: chatAtlasCanonicalSourceState.activeSource,
        timestamp: new Date().toISOString(),
        reason: 'ledger-not-ready',
      };
      return chatAtlasFreeze({ ok: false, reason: 'ledger-not-ready', ...chatAtlasCanonicalSourceDiagnostics() });
    }

    const previous = chatAtlasCanonicalSourceState.activeSource;
    const switchedAt = new Date().toISOString();
    chatAtlasCanonicalSourceState.activeSource = requested;
    chatAtlasCanonicalSourceState.canonicalMutationAttemptCount += 1;
    try {
      buildTurns();
      chatAtlasCanonicalSourceState.switchCount += 1;
      chatAtlasCanonicalSourceState.lastSwitch = {
        from: previous,
        to: requested,
        timestamp: switchedAt,
        reason: 'operator',
      };
      return chatAtlasFreeze({ ok: true, changed: true, ...chatAtlasCanonicalSourceDiagnostics() });
    } catch (error) {
      const fallbackSource = requested === CHAT_ATLAS_CANONICAL_SOURCE_LEGACY
        ? CHAT_ATLAS_CANONICAL_SOURCE_LEGACY
        : previous;
      chatAtlasCanonicalSourceState.activeSource = fallbackSource;
      if (fallbackSource === CHAT_ATLAS_CANONICAL_SOURCE_LEGACY) {
        chatAtlasCanonicalSourceState.effectiveSource = CHAT_ATLAS_CANONICAL_SOURCE_LEGACY;
      }
      chatAtlasCanonicalSourceState.rejectedSwitchCount += 1;
      chatAtlasCanonicalSourceState.lastRejectedSwitch = {
        requested,
        activeSource: fallbackSource,
        timestamp: switchedAt,
        reason: `canonical-rebuild-failed:${String(error?.message || error || 'unknown')}`,
      };
      if (requested !== CHAT_ATLAS_CANONICAL_SOURCE_LEGACY) {
        try { buildTurns(); } catch {}
      }
      return chatAtlasFreeze({ ok: false, reason: 'canonical-rebuild-failed', ...chatAtlasCanonicalSourceDiagnostics() });
    }
  }

  function selectChatAtlasCanonicalDrafts(legacyDrafts) {
    const legacyCanonicalDrafts = Array.isArray(legacyDrafts) ? legacyDrafts : [];
    try {
      chatAtlasCv2CaptureLegacyDrafts(legacyCanonicalDrafts);
      chatAtlasRunCanonicalDualComparison('legacy-capture');
    } catch (error) {
      chatAtlasCv2RecordInstrumentationError(error, 'legacy-capture');
    }
    let selectedDrafts = legacyCanonicalDrafts;
    let effectiveSource = CHAT_ATLAS_CANONICAL_SOURCE_LEGACY;
    if (chatAtlasCanonicalSourceState.activeSource === CHAT_ATLAS_CANONICAL_SOURCE_LEDGER
      && chatAtlasLedgerCanonicalSourceReady()) {
      selectedDrafts = chatAtlasCv2RecordsToDrafts(buildChatAtlasLedgerCanonicalRecords());
      effectiveSource = CHAT_ATLAS_CANONICAL_SOURCE_LEDGER;
    }
    chatAtlasCanonicalSourceState.effectiveSource = effectiveSource;
    chatAtlasCanonicalSourceState.lastSelection = {
      activeSource: chatAtlasCanonicalSourceState.activeSource,
      effectiveSource,
      legacyCount: legacyCanonicalDrafts.length,
      selectedCount: selectedDrafts.length,
      ledgerReady: !!chatAtlasLedgerState.ready,
      ledgerSourceReady: chatAtlasLedgerCanonicalSourceReady(),
      timestamp: new Date().toISOString(),
    };
    return selectedDrafts;
  }

  function chatAtlasComputeParity(members, canonicalRecords) {
    const disagreements = [];
    const canonical = Array.isArray(canonicalRecords) ? canonicalRecords : [];
    const total = Math.max(members.length, canonical.length);
    for (let index = 0; index < total; index += 1) {
      const shadow = members[index] || null;
      const current = canonical[index] || null;
      if (!shadow || !current) {
        disagreements.push({
          turnNo: index + 1,
          reason: shadow ? 'missing-current-turn-runtime-record' : 'missing-shadow-member',
        });
        continue;
      }
      const currentAliases = chatAtlasRecordAliases(current);
      const overlap = Array.from(shadow.aliases).some((alias) => currentAliases.has(alias));
      if (!overlap) {
        disagreements.push({
          turnNo: index + 1,
          reason: 'identity-alias-disagreement',
          shadowKey: shadow.logicalMemberKey,
          currentTurnId: String(current.turnId || ''),
        });
      }
    }
    return {
      exact: members.length === canonical.length && disagreements.length === 0,
      status: members.length === canonical.length
        ? (disagreements.length ? 'identity-disagreement' : 'exact')
        : 'count-difference-explained-by-hydration-or-legacy-witness',
      disagreements,
    };
  }

  function chatAtlasApplyEvidence(read, reason, isFlush) {
    const started = chatAtlasNow();
    const nextChatKey = chatAtlasCurrentChatKey();
    const previousLedgerChatKey = String(chatAtlasLedgerState.chatKey || '');
    const previous = chatAtlasLedgerState.members;
    const previousByQuestionShell = new Map();
    for (const record of previous) {
      if (record.question.shellRef) previousByQuestionShell.set(record.question.shellRef, record);
    }
    const previousQuestionOwners = chatAtlasBuildOwnerMap(previous, (record) => chatAtlasCv2CurrentIds([
      record?.question?.qId,
      ...(record?.question?.currentAliases || []),
    ]));
    const canonicalQuestionOwners = chatAtlasBuildOwnerMap(read.canonicalRecords, chatAtlasCanonicalQuestionAliases);
    const pairing = chatAtlasPairEvidence(read.evidence);
    for (const rejection of pairing.rejectedAssistants) chatAtlasRecordPairingRejection(rejection);
    const completeShellMap = !!read.completeShellMap && pairing.rejectedAssistants.length === 0;
    if (!completeShellMap && previous.length) {
      chatAtlasLedgerState.completeShellMap = false;
      chatAtlasLedgerState.unboundShells = [
        ...read.unbound,
        ...pairing.rejectedAssistants.map((item) => ({ ...item, reason: `pairing-rejected:${item.reason}` })),
      ];
      chatAtlasLedgerState.warnings = ['incomplete-stable-shell-map-retained-prior-ledger'];
      return chatAtlasFreeze({
        reason: String(reason || 'unknown'),
        version: chatAtlasLedgerState.version,
        added: [],
        removed: [],
        updated: [],
        memberCount: previous.length,
        shellCount: read.shells.length,
        skipped: true,
        skipReason: 'incomplete-stable-shell-map',
      });
    }
    const pairs = pairing.pairs;
    const next = [];
    const buildContexts = [];
    const candidateConflicts = [];
    const usedPrevious = new Set();
    const usedCanonical = new Set();
    const priorQuarantine = previousLedgerChatKey === nextChatKey
      ? new Set(chatAtlasLedgerState.quarantinedAliases)
      : new Set();
    const repairEventKeys = new Set();
    let absorbed = 0;

    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      const previousMatch = chatAtlasMatchPreviousRecord(
        pair,
        previousByQuestionShell,
        previousQuestionOwners,
        usedPrevious,
        priorQuarantine,
      );
      if (!previousMatch.record && previousMatch.candidates.length) {
        candidateConflicts.push({
          turnNo: index + 1,
          reason: previousMatch.basis,
          candidateKeys: previousMatch.candidates.map((item) => item.logicalMemberKey),
        });
      }
      const previousRecord = previousMatch.record;
      if (previousRecord) usedPrevious.add(previousRecord);

      const lastAnswer = pair.answers[pair.answers.length - 1] || null;
      const currentQId = chatAtlasNormalizeId(pair.question?.messageId) || null;
      const questionCurrentAliases = chatAtlasCv2CurrentIds([
        currentQId,
        pair.question?.shellTurnId,
      ]);
      const projectedQId = currentQId
        || previousRecord?.question?.qId
        || chatAtlasNormalizeId(pair.question?.shellTurnId)
        || null;
      const questionEvidenceAliases = chatAtlasCv2CurrentIds([
        ...(pair.question?.aliases || []),
        ...questionCurrentAliases,
      ]);
      const currentAnswerShells = pair.answers.map((answer) => ({
        shellTurnId: answer?.shellTurnId || null,
        messageId: answer?.messageId || null,
        currentAnswerId: answer?.messageId || answer?.shellTurnId || null,
      }));
      const answerCurrentAliases = chatAtlasCv2CurrentIds(
        currentAnswerShells.flatMap((answer) => [answer.shellTurnId, answer.messageId]),
      );
      const currentAnswerIds = chatAtlasCv2CurrentIds(
        currentAnswerShells.map((answer) => answer.currentAnswerId),
      );
      const answerEvidenceAliases = chatAtlasCv2CurrentIds([
        ...pair.answers.flatMap((answer) => Array.from(answer?.aliases || [])),
        ...answerCurrentAliases,
        ...currentAnswerIds,
      ]);
      let currentProjectionSource = currentAnswerIds.length ? 'native-evidence' : 'none';
      if (pair.answers.length && !currentAnswerIds.length && previousRecord?.answer?.primaryAId) {
        currentAnswerIds.push(previousRecord.answer.primaryAId);
        currentProjectionSource = 'previous-primary-fallback';
      }
      const projectedPrimaryAId = currentAnswerIds[currentAnswerIds.length - 1] || null;
      const member = {
        logicalMemberKey: previousRecord?.logicalMemberKey || `atlas:${chatAtlasLedgerState.nextMemberId++}`,
        turnNo: index + 1,
        aliases: new Set(),
        resolverHistoryAliases: new Set(),
        question: {
          shellRef: pair.question?.shell?.isConnected ? pair.question.shell : null,
          shellTurnId: pair.question?.shellTurnId || null,
          messageId: pair.question?.messageId || null,
          qId: projectedQId,
          currentQId,
          currentAliases: questionCurrentAliases,
          evidenceAliases: questionEvidenceAliases,
          aliases: new Set(),
          hydrated: !!pair.question?.hydrated,
        },
        answer: {
          shellRef: lastAnswer?.shell?.isConnected ? lastAnswer.shell : null,
          shellTurnId: lastAnswer?.shellTurnId || null,
          messageId: lastAnswer?.messageId || null,
          primaryAId: projectedPrimaryAId,
          currentAnswerIds,
          currentAliases: answerCurrentAliases,
          currentShells: currentAnswerShells,
          currentProjectionSource,
          evidenceAliases: answerEvidenceAliases,
          aliases: new Set(),
          hydrated: pair.answers.some((answer) => !!answer.hydrated),
        },
        noAnswer: pair.answers.length === 0,
        hydration: 'none',
        pageNo: Math.floor(index / CHAT_ATLAS_PAGE_SIZE) + 1,
        pageIndex: Math.floor(index / CHAT_ATLAS_PAGE_SIZE),
      };
      next.push(member);
      buildContexts.push({ member, previousRecord, pair });
    }

    const currentOwners = chatAtlasBuildCurrentAliasOwners(next);
    const quarantine = chatAtlasPrepareAliasQuarantine(currentOwners, priorQuarantine);
    for (const member of next) {
      member.question.aliases = new Set(member.question.evidenceAliases.filter((alias) => !quarantine.has(alias)));
      member.answer.aliases = new Set(member.answer.evidenceAliases.filter((alias) => !quarantine.has(alias)));
    }

    for (const context of buildContexts) {
      const { member, previousRecord, pair } = context;
      const absorbContext = (source) => ({
        member,
        currentOwners,
        quarantine,
        repairEventKeys,
        source,
      });
      const trueNoAnswer = completeShellMap && pair.answers.length === 0 && member.noAnswer;
      if (previousRecord) {
        absorbed += chatAtlasAbsorbHistoricalAliases(
          member.question.aliases,
          previousRecord.question.aliases,
          absorbContext('previous-question-history'),
        );
        if (member.noAnswer) {
          if (trueNoAnswer) {
            chatAtlasRecordNoAnswerHistoryRepairs(
              previousRecord,
              member,
              currentOwners,
              repairEventKeys,
            );
          }
        } else {
          absorbed += chatAtlasAbsorbHistoricalAliases(
            member.answer.aliases,
            previousRecord.answer.aliases,
            absorbContext('previous-answer-history'),
          );
          absorbed += chatAtlasAbsorbHistoricalAliases(
            member.resolverHistoryAliases,
            previousRecord.aliases,
            absorbContext('previous-resolver-history'),
          );
        }
      }

      const canonical = chatAtlasMatchCanonicalRecord(
        member,
        canonicalQuestionOwners,
        read.canonicalShellBindings,
        usedCanonical,
        quarantine,
      );
      if (canonical) {
        usedCanonical.add(canonical);
        absorbed += chatAtlasAbsorbHistoricalAliases(
          member.question.aliases,
          [canonical.qId],
          absorbContext('canonical-question-enrichment'),
        );
        if (!member.noAnswer) {
          absorbed += chatAtlasAbsorbHistoricalAliases(
            member.answer.aliases,
            [canonical.primaryAId, ...(canonical.answerIds || [])],
            absorbContext('canonical-answer-enrichment'),
          );
          absorbed += chatAtlasAbsorbHistoricalAliases(
            member.resolverHistoryAliases,
            chatAtlasRecordAliases(canonical),
            absorbContext('canonical-resolver-enrichment'),
          );
        }
      }

      chatAtlasRebuildResolverAliases(member);
      member.hydration = member.question.hydrated && member.answer.hydrated
        ? 'both'
        : (member.question.hydrated ? 'question' : (member.answer.hydrated ? 'answer' : 'none'));
    }

    const aliasOwners = chatAtlasRepairResolverOwnership(
      next,
      currentOwners,
      quarantine,
      repairEventKeys,
    );
    const duplicateAliases = Array.from(aliasOwners.entries())
      .filter(([, owners]) => owners.size > 1)
      .map(([alias, owners]) => ({ alias, memberKeys: Array.from(owners).map((record) => record.logicalMemberKey) }));
    const parity = chatAtlasComputeParity(next, read.canonicalRecords);
    const previousSignatures = new Map(previous.map((member) => [member.logicalMemberKey, chatAtlasMemberSignature(member)]));
    const nextSignatures = new Map(next.map((member) => [member.logicalMemberKey, chatAtlasMemberSignature(member)]));
    const added = next.filter((member) => !previousSignatures.has(member.logicalMemberKey)).map((member) => member.logicalMemberKey);
    const removed = previous.filter((member) => !nextSignatures.has(member.logicalMemberKey)).map((member) => member.logicalMemberKey);
    const updated = next.filter((member) => {
      const before = previousSignatures.get(member.logicalMemberKey);
      return before != null && before !== nextSignatures.get(member.logicalMemberKey);
    }).map((member) => member.logicalMemberKey);

    chatAtlasLedgerState.members = next;
    chatAtlasLedgerState.ready = true;
    chatAtlasLedgerState.version += 1;
    chatAtlasLedgerState.chatKey = nextChatKey;
    try {
      if (previousLedgerChatKey !== nextChatKey) {
        chatAtlasCv2ResetBindingEvidence(
          nextChatKey,
          previousLedgerChatKey ? 'ledger-chat-key-change' : 'ledger-initial-binding',
        );
      }
    } catch (error) {
      chatAtlasCv2RecordInstrumentationError(error, 'ledger-binding-evidence');
    }
    chatAtlasLedgerState.buildCount += 1;
    chatAtlasLedgerState.aliasAbsorbCount += absorbed;
    chatAtlasLedgerState.duplicateAliasCount = duplicateAliases.length;
    chatAtlasLedgerState.quarantinedAliases = quarantine;
    chatAtlasLedgerState.completeShellMap = completeShellMap;
    chatAtlasLedgerState.duplicateMemberCandidates = candidateConflicts;
    chatAtlasLedgerState.unboundShells = [
      ...read.unbound,
      ...pairing.rejectedAssistants.map((item) => ({ ...item, reason: `pairing-rejected:${item.reason}` })),
    ];
    chatAtlasLedgerState.parityWithCurrentTurnRuntime = parity.exact;
    chatAtlasLedgerState.parityStatus = parity.status;
    chatAtlasLedgerState.parityDisagreements = parity.disagreements;
    chatAtlasLedgerState.canonicalRecordCount = read.canonicalRecords.length;
    chatAtlasLedgerState.canonicalTurnVersion = read.canonicalVersion;
    chatAtlasLedgerState.shellCount = read.shells.length;
    chatAtlasLedgerState.questionShellCount = read.questionShellCount;
    chatAtlasLedgerState.answerShellCount = read.answerShellCount;
    chatAtlasLedgerState.warnings = completeShellMap
      ? []
      : ['incomplete-stable-shell-map'];
    const elapsed = Math.max(0, chatAtlasNow() - started) + Math.max(0, Number(read.readMs) || 0);
    chatAtlasLedgerState.lastBuildMs = elapsed;
    if (isFlush) {
      chatAtlasLedgerState.flushCount += 1;
      chatAtlasLedgerState.lastFlushMs = elapsed;
      chatAtlasLedgerState.maxFlushMs = Math.max(chatAtlasLedgerState.maxFlushMs, elapsed);
    }
    chatAtlasRunCanonicalDualComparison(reason);
    chatAtlasClearBranchSelectionStaleOnCanonicalReturn(next);
    chatAtlasSelectedPathEvaluate(next);
    if (typeof chatAtlasSelectedPathOverlayEvaluate === 'function') {
      chatAtlasSelectedPathOverlayEvaluate();
    }

    const delta = chatAtlasFreeze({
      reason: String(reason || 'unknown'),
      version: chatAtlasLedgerState.version,
      added,
      removed,
      updated,
      memberCount: next.length,
      shellCount: read.shells.length,
    });
    for (const listener of Array.from(chatAtlasLedgerState.subscribers)) {
      try { listener(delta); } catch (error) {
        try { console.warn('[H2O.Core] Chat Atlas ledger subscriber error', error); } catch {}
      }
    }
    return delta;
  }

  function chatAtlasRebindObserver(root) {
    if (!root || !root.isConnected || typeof MutationObserver !== 'function') return;
    if (chatAtlasLedgerState.observerRoot === root && chatAtlasLedgerState.observerActive) return;
    try { chatAtlasLedgerState.observer?.disconnect(); } catch {}
    chatAtlasLedgerState.observerRoot = root;
    chatAtlasLedgerState.observer = new MutationObserver((mutations) => {
      let relevant = false;
      for (const mutation of mutations) {
        const nodes = [mutation.target, ...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        for (const node of nodes) {
          if (!node || node.nodeType !== 1) continue;
          let shell = null;
          try { shell = node.matches?.(CHAT_ATLAS_SHELL_SEL) ? node : node.closest?.(CHAT_ATLAS_SHELL_SEL); } catch {}
          if (shell) {
            chatAtlasLedgerState.dirtyShells.add(shell);
            relevant = true;
          }
          try {
            if (node.matches?.(SEL_CORE_WITH_ROLE) || node.querySelector?.(SEL_CORE_WITH_ROLE)) relevant = true;
            for (const descendant of node.querySelectorAll?.(CHAT_ATLAS_SHELL_SEL) || []) {
              chatAtlasLedgerState.dirtyShells.add(descendant);
              relevant = true;
            }
          } catch {}
        }
      }
      if (!relevant) return;
      if (!chatAtlasLedgerState.dirtyShells.size) chatAtlasLedgerState.fullRebuildPending = true;
      scheduleChatAtlasLedgerFlush('mutation');
    });
    try {
      chatAtlasLedgerState.observer.observe(root, { childList: true, subtree: true });
      chatAtlasLedgerState.observerActive = true;
    } catch {
      chatAtlasLedgerState.observerActive = false;
    }
  }

  function chatAtlasFlush(reason = 'scheduled') {
    chatAtlasLedgerState.raf = 0;
    const dirtyCount = chatAtlasLedgerState.dirtyShells.size;
    chatAtlasLedgerState.lastDirtyShellCount = dirtyCount;
    chatAtlasLedgerState.dirtyShells.clear();
    chatAtlasLedgerState.fullRebuildPending = false;
    try {
      const read = chatAtlasReadEvidence();
      const delta = chatAtlasApplyEvidence(read, reason, true);
      chatAtlasRebindObserver(read.root);
      return delta;
    } catch (error) {
      chatAtlasLedgerState.warnings = [`flush-failed:${String(error?.message || error || 'unknown')}`];
      return null;
    }
  }

  function scheduleChatAtlasLedgerFlush(reason = 'scheduled') {
    if (chatAtlasLedgerState.raf) return;
    try {
      chatAtlasLedgerState.raf = W.requestAnimationFrame(() => chatAtlasFlush(reason));
    } catch {
      chatAtlasLedgerState.raf = W.setTimeout(() => chatAtlasFlush(reason), 0);
    }
  }

  function startChatAtlasLedger() {
    try {
      const read = chatAtlasReadEvidence();
      chatAtlasApplyEvidence(read, 'boot', false);
      chatAtlasRebindObserver(read.root);
      if (!chatAtlasLedgerState.canonicalListenerBound) {
        chatAtlasLedgerState.canonicalListenerBound = true;
        H2O.bus.on(EV_CORE_TURN_UPDATED, () => scheduleChatAtlasLedgerFlush('canonical-turn-updated'));
      }
    } catch (error) {
      chatAtlasLedgerState.ready = false;
      chatAtlasLedgerState.warnings = [`boot-failed:${String(error?.message || error || 'unknown')}`];
    }
  }

  function getChatAtlasLedgerSnapshot() {
    try {
      return chatAtlasFreeze({
        ledgerReady: !!chatAtlasLedgerState.ready,
        version: chatAtlasLedgerState.version,
        chatKey: chatAtlasLedgerState.chatKey,
        memberCount: chatAtlasLedgerState.members.length,
        completeShellMap: chatAtlasLedgerState.completeShellMap,
        quarantinedAliasCount: chatAtlasLedgerState.quarantinedAliases.size,
        quarantinedAliases: Array.from(chatAtlasLedgerState.quarantinedAliases)
          .slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT),
        quarantinedAliasResolutionCount: chatAtlasLedgerState.quarantinedAliasResolutionCount,
        members: chatAtlasLedgerState.members.map(chatAtlasPublicMember),
      });
    } catch (error) {
      return chatAtlasFreeze({ ledgerReady: false, memberCount: 'unknown', members: [], warning: String(error?.message || error || 'snapshot-failed') });
    }
  }

  const CHAT_ATLAS_CONVERGENCE_MINIMAP_WRAP_SEL = [
    '[data-cgxui="mnmp-wrap"]',
    '[data-cgxui="mm-wrap"]',
    '.cgxui-mm-wrap',
  ].join(', ');

  const CHAT_ATLAS_CONVERGENCE_SAFETY_KEYS = [
    'domWriteCount',
    'storageWriteCount',
    'physicalExecutorCallCount',
    'paginationExecutorCallCount',
    'unmountExecutorCallCount',
    'consumerSwitchCount',
    'canonicalMutationAttemptCount',
  ];

  const CHAT_ATLAS_CONVERGENCE_UNMATCHED_CLASSIFICATIONS = Object.freeze([
    'cache-only-historical-row',
    'canonical-only-current-row',
    'ledger-only-live-row',
    'branch-inactive-row',
    'unresolved-identity-mismatch',
  ]);

  function chatAtlasConvergenceAttr(el, name) {
    try { return String(el?.getAttribute?.(name) || '').trim(); } catch { return ''; }
  }

  function chatAtlasConvergenceText(el) {
    try { return String(el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120); } catch { return ''; }
  }

  function chatAtlasConvergencePositiveInt(value) {
    const number = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function chatAtlasConvergenceIds(values) {
    const ids = new Set();
    for (const value of values || []) {
      const id = chatAtlasNormalizeId(value);
      if (id) ids.add(id);
    }
    return ids;
  }

  function chatAtlasConvergenceSafetyCounters() {
    let diagnostics = {};
    try { diagnostics = getChatAtlasLedgerDiagnostics() || {}; } catch {}
    const counters = {};
    for (const key of CHAT_ATLAS_CONVERGENCE_SAFETY_KEYS) {
      const value = Number(diagnostics?.[key]);
      counters[key] = Number.isFinite(value) ? value : 'unknown';
    }
    return counters;
  }

  function chatAtlasConvergenceSafetyResult(before, after) {
    const changes = [];
    for (const key of CHAT_ATLAS_CONVERGENCE_SAFETY_KEYS) {
      if (before?.[key] !== after?.[key]) {
        changes.push({ key, before: before?.[key] ?? 'unknown', after: after?.[key] ?? 'unknown' });
      }
    }
    return {
      safetyCountersBefore: before,
      safetyCountersAfter: after,
      safetyCountersUnchanged: changes.length === 0,
      safetyCounterChanges: changes,
    };
  }

  function chatAtlasConvergenceLedgerRow(member) {
    const answerAliases = Array.from(member?.answer?.aliases || []).map(chatAtlasNormalizeId).filter(Boolean);
    const questionAliases = Array.from(member?.question?.aliases || []).map(chatAtlasNormalizeId).filter(Boolean);
    const currentAnswerIds = Array.from(member?.answer?.currentAnswerIds || []).map(chatAtlasNormalizeId).filter(Boolean);
    const qId = chatAtlasNormalizeId(member?.question?.qId) || null;
    const primaryAId = chatAtlasNormalizeId(member?.answer?.primaryAId) || null;
    const allIds = chatAtlasConvergenceIds([qId, primaryAId, ...answerAliases, ...questionAliases]);
    const answerIds = chatAtlasConvergenceIds([primaryAId, ...answerAliases]);
    const questionIds = chatAtlasConvergenceIds([qId, ...questionAliases]);
    return {
      row: {
        logicalMemberKey: String(member?.logicalMemberKey || ''),
        turnNo: Math.max(0, Number(member?.turnNo || 0) || 0),
        pageNo: Math.max(0, Number(member?.pageNo || 0) || 0),
        pageIndex: Math.max(0, Number(member?.pageIndex || 0) || 0),
        noAnswer: !!member?.noAnswer,
        qId,
        primaryAId,
        currentAnswerIds,
        currentProjectionSource: String(member?.answer?.currentProjectionSource || ''),
        answerAliases,
        questionAliases,
        hydration: String(member?.hydration || 'none'),
      },
      allIds,
      answerIds,
      questionIds,
    };
  }

  function chatAtlasConvergenceCanonicalRow(record, index, fieldShapeMismatches) {
    const turnNo = Math.max(0, Number(record?.turnNo || record?.idx || record?.index || index + 1) || 0);
    const rawAnswerIds = Array.isArray(record?.answerIds) ? record.answerIds : [];
    const rawAliasIds = Array.isArray(record?._aliasIds) ? record._aliasIds : [];
    if (!record || typeof record !== 'object') {
      fieldShapeMismatches.push({ source: 'canonical', index, reason: 'record-not-object' });
    } else {
      if (!Array.isArray(record.answerIds)) fieldShapeMismatches.push({ source: 'canonical', turnNo, field: 'answerIds', reason: 'expected-array' });
      if (!Array.isArray(record._aliasIds)) fieldShapeMismatches.push({ source: 'canonical', turnNo, field: '_aliasIds', reason: 'expected-array' });
    }
    const answerIds = rawAnswerIds.map(chatAtlasNormalizeId).filter(Boolean);
    const aliasIds = rawAliasIds.map(chatAtlasNormalizeId).filter(Boolean);
    const qId = chatAtlasNormalizeId(record?.qId) || null;
    const primaryAId = chatAtlasNormalizeId(record?.primaryAId) || null;
    const allIds = chatAtlasConvergenceIds([
      record?.turnId,
      qId,
      primaryAId,
      ...answerIds,
      ...aliasIds,
    ]);
    return {
      row: {
        turnNo,
        idx: Number.isFinite(Number(record?.idx)) ? Number(record.idx) : null,
        qId,
        primaryAId,
        answerIds,
        _aliasIds: aliasIds,
        noAnswer: record?.noAnswer === true || record?.hasAssistant === false || (!primaryAId && answerIds.length === 0),
        pageNo: turnNo > 0 ? Math.floor((turnNo - 1) / CHAT_ATLAS_PAGE_SIZE) + 1 : 0,
      },
      allIds,
      answerIds: chatAtlasConvergenceIds([primaryAId, ...answerIds]),
      questionIds: chatAtlasConvergenceIds([qId]),
    };
  }

  function chatAtlasConvergenceWashMarker(btn) {
    try {
      if (btn?.getAttribute?.('data-cgxui-wash') === '1' || btn?.dataset?.wash === 'true') return true;
      if (btn?.getAttribute?.('data-h2o-wash-name') || btn?.getAttribute?.('data-h2o-wash-id')) return true;
      return Array.from(btn?.classList || []).some((name) => name.startsWith('cgxui-mnmp-wash-') || name.startsWith('cgxui-wash-'));
    } catch {
      return false;
    }
  }

  function chatAtlasConvergenceNoAnswerMarker(btn, wrap = null) {
    const sources = [];
    const read = (name) => chatAtlasConvergenceAttr(btn, name) || chatAtlasConvergenceAttr(wrap, name);
    let value = false;
    for (const name of ['data-no-answer', 'data-at-no-answer', 'data-cgxui-no-answer']) {
      const attrValue = read(name);
      const present = !!(btn?.hasAttribute?.(name) || wrap?.hasAttribute?.(name));
      if (!present) continue;
      sources.push(name);
      if (attrValue === '1' || attrValue === 'true') value = true;
    }
    const primaryAId = read('data-primary-a-id');
    if (/^no-answer:/i.test(primaryAId)) {
      sources.push('data-primary-a-id:no-answer-prefix');
      value = true;
    }
    const classNames = Array.from(btn?.classList || []);
    if (classNames.some((name) => /(^|-)no-answer($|-)/i.test(String(name)))) {
      sources.push('class:no-answer');
      value = true;
    }
    return {
      available: sources.length > 0,
      value,
      source: sources.length ? sources.join('+') : 'unavailable',
    };
  }

  function chatAtlasConvergenceMiniMapBox(btn, domIndex) {
    const wrap = btn?.closest?.(CHAT_ATLAS_CONVERGENCE_MINIMAP_WRAP_SEL) || null;
    const read = (name) => chatAtlasConvergenceAttr(btn, name) || chatAtlasConvergenceAttr(wrap, name);
    const dataPrimaryAId = read('data-primary-a-id');
    const dataTurn = read('data-turn');
    const dataTurnId = read('data-turn-id');
    const dataId = read('data-id');
    const dataQuestionId = read('data-question-id');
    const dataPage = read('data-page');
    const inferredTurnNo = chatAtlasConvergencePositiveInt(read('data-turn-idx'))
      || chatAtlasConvergencePositiveInt(btn?.querySelector?.('.cgxui-mm-num')?.textContent)
      || chatAtlasConvergencePositiveInt(chatAtlasConvergenceText(btn));
    const inferredPageNo = chatAtlasConvergencePositiveInt(read('data-page-num'))
      || chatAtlasConvergencePositiveInt(dataPage)
      || (inferredTurnNo ? Math.floor((inferredTurnNo - 1) / CHAT_ATLAS_PAGE_SIZE) + 1 : 0);
    const noAnswerMarker = chatAtlasConvergenceNoAnswerMarker(btn, wrap);
    return {
      row: {
        domIndex,
        label: chatAtlasConvergenceAttr(btn, 'aria-label') || chatAtlasConvergenceAttr(btn, 'title'),
        text: chatAtlasConvergenceText(btn),
        dataPrimaryAId,
        dataTurn,
        dataTurnId,
        dataId,
        dataQuestionId,
        dataPage,
        inferredTurnNo,
        inferredPageNo,
        noAnswer: noAnswerMarker.available ? noAnswerMarker.value : 'unknown',
        noAnswerSemanticAvailable: noAnswerMarker.available,
        noAnswerMarkerSource: noAnswerMarker.source,
        washMarker: chatAtlasConvergenceWashMarker(btn),
        resolvedTurnNo: null,
        resolvedLogicalMemberKey: null,
        mismatchReason: '',
        primaryMismatchReason: '',
      },
      btn,
      allIds: chatAtlasConvergenceIds([dataPrimaryAId, dataTurnId, dataId, dataQuestionId]),
    };
  }

  function chatAtlasConvergenceAliasOwners(entries) {
    const owners = new Map();
    for (let index = 0; index < entries.length; index += 1) {
      for (const id of entries[index].allIds) {
        if (!owners.has(id)) owners.set(id, new Set());
        owners.get(id).add(index);
      }
    }
    return owners;
  }

  function chatAtlasConvergenceMatch(entry, owners, fallbackIndex, used = null, targetLength = null) {
    const candidates = new Set();
    for (const id of entry?.allIds || []) {
      for (const index of owners?.get?.(id) || []) candidates.add(index);
    }
    const boundedLength = Number.isInteger(targetLength) && targetLength >= 0 ? targetLength : null;
    const boundedCandidates = Array.from(candidates)
      .filter((index) => Number.isInteger(index) && index >= 0 && (boundedLength == null || index < boundedLength));
    const rejectedCandidateIndexes = Array.from(candidates)
      .filter((index) => !boundedCandidates.includes(index))
      .slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT);
    const available = boundedCandidates.filter((index) => !used?.has(index));
    const claimed = boundedCandidates.filter((index) => used?.has(index));
    if (boundedCandidates.length === 1 && available.length === 1) {
      return {
        index: available[0],
        basis: 'record-local-alias',
        candidates: available,
        claimedCandidates: claimed,
        rejectedCandidateIndexes,
        rejectedFallbackIndex: Number.isInteger(fallbackIndex) ? fallbackIndex : null,
      };
    }
    let basis = 'unmatched';
    if (boundedCandidates.length > 1) basis = 'ambiguous-alias';
    else if (boundedCandidates.length && !available.length) basis = 'already-claimed-alias';
    else if (rejectedCandidateIndexes.length) basis = 'out-of-bounds-alias';
    // Ordinal position is diagnostic context only; it never establishes identity.
    return {
      index: -1,
      basis,
      candidates: available,
      claimedCandidates: claimed,
      rejectedCandidateIndexes,
      rejectedFallbackIndex: Number.isInteger(fallbackIndex) ? fallbackIndex : null,
    };
  }

  function chatAtlasConvergenceUnmatchedTracker() {
    const counts = {};
    for (const classification of CHAT_ATLAS_CONVERGENCE_UNMATCHED_CLASSIFICATIONS) counts[classification] = 0;
    return { counts, evidence: [], total: 0, truncated: false, keys: new Set() };
  }

  function chatAtlasConvergenceRecordUnmatched(tracker, classification, evidence, dedupeKey = '') {
    if (!tracker) return;
    const normalized = CHAT_ATLAS_CONVERGENCE_UNMATCHED_CLASSIFICATIONS.includes(classification)
      ? classification
      : 'unresolved-identity-mismatch';
    const key = String(dedupeKey || `${normalized}:${evidence?.source || 'unknown'}:${evidence?.turnNo || evidence?.domIndex || tracker.total}`);
    if (tracker.keys.has(key)) return;
    tracker.keys.add(key);
    tracker.counts[normalized] += 1;
    tracker.total += 1;
    if (tracker.evidence.length < CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
      tracker.evidence.push({ classification: normalized, ...evidence });
    } else {
      tracker.truncated = true;
    }
  }

  function chatAtlasConvergenceHasPartialCacheEvidence(diagnostics) {
    const currentChatKey = chatAtlasNormalizeChatKey(chatAtlasCurrentChatKey());
    if (!currentChatKey || chatAtlasNormalizeChatKey(diagnostics?.chatKey) !== currentChatKey) return false;
    const cached = chatAtlasNullableCount(diagnostics?.cachedTurnCount);
    const published = chatAtlasNullableCount(diagnostics?.publishedTurnCount);
    const observed = chatAtlasNullableCount(diagnostics?.observedTurnCount);
    const retained = chatAtlasNullableCount(diagnostics?.offDomRetainedCount);
    const merge = diagnostics?.lastMergeDecision;
    const mergeOutputCount = chatAtlasNullableCount(merge?.outputCount);
    const mergeLiveCount = chatAtlasNullableCount(merge?.liveCount);
    return Number(retained || 0) > 0
      || (cached != null && observed != null && cached > observed)
      || (published != null && observed != null && published > observed)
      || (merge?.mode === 'union'
        && mergeOutputCount != null
        && mergeLiveCount != null
        && mergeOutputCount > mergeLiveCount);
  }

  function chatAtlasConvergenceClassifyMiniMapUnmatched(
    box,
    match,
    canonicalOwners,
    canonicalEntries,
    usedCanonical,
    miniMapDiagnostics,
  ) {
    if (match?.basis === 'ambiguous-alias') {
      return { classification: 'unresolved-identity-mismatch', severity: 'blocker', reason: 'ambiguous-ledger-alias-match' };
    }
    if (match?.basis === 'already-claimed-alias') {
      return { classification: 'unresolved-identity-mismatch', severity: 'blocker', reason: 'duplicate-ledger-member-claim' };
    }
    if (match?.basis === 'out-of-bounds-alias') {
      return { classification: 'unresolved-identity-mismatch', severity: 'blocker', reason: 'out-of-bounds-ledger-alias-match' };
    }
    const canonicalMatch = chatAtlasConvergenceMatch(
      box,
      canonicalOwners,
      box?.row?.inferredTurnNo > 0 ? box.row.inferredTurnNo - 1 : box?.row?.domIndex,
      null,
      canonicalEntries.length,
    );
    const canonical = canonicalMatch.index >= 0 && canonicalMatch.index < canonicalEntries.length
      ? canonicalEntries[canonicalMatch.index]
      : null;
    if (canonical?.row && !usedCanonical.has(canonicalMatch.index)) {
      return { classification: 'canonical-only-current-row', severity: 'mismatch', reason: 'canonical-row-has-no-ledger-member' };
    }
    if (!canonical?.row && chatAtlasConvergenceHasPartialCacheEvidence(miniMapDiagnostics)) {
      return { classification: 'cache-only-historical-row', severity: 'warning', reason: 'partial-cache-row-not-in-current-universe' };
    }
    return { classification: 'unresolved-identity-mismatch', severity: 'mismatch', reason: 'no-ledger-member-match' };
  }

  function chatAtlasConvergenceMiniMapPrimaryMismatch(ledger, canonical, box) {
    const actualPrimaryAId = chatAtlasNormalizeId(box?.row?.dataPrimaryAId) || null;
    const currentAnswerIds = Array.from(ledger?.row?.currentAnswerIds || []).map(chatAtlasNormalizeId).filter(Boolean);
    const selectedCurrentAId = currentAnswerIds[currentAnswerIds.length - 1] || null;
    const expectedPrimaryIds = Array.from(chatAtlasConvergenceIds([
      canonical?.row?.primaryAId,
      ledger?.row?.primaryAId,
      selectedCurrentAId,
    ]));
    const noAnswer = canonical?.row?.noAnswer === true || ledger?.row?.noAnswer === true;
    let reason = '';
    if (noAnswer) {
      if (actualPrimaryAId) reason = 'no-answer-minimap-primary-present';
    } else if (!actualPrimaryAId || !expectedPrimaryIds.includes(actualPrimaryAId)) {
      reason = 'minimap-primary-not-member-answer';
    }
    if (!reason) return null;
    return {
      turnNo: ledger?.row?.turnNo || canonical?.row?.turnNo || 0,
      logicalMemberKey: ledger?.row?.logicalMemberKey || null,
      qId: canonical?.row?.qId || ledger?.row?.qId || null,
      canonicalPrimaryAId: canonical?.row?.primaryAId || null,
      ledgerPrimaryAId: ledger?.row?.primaryAId || null,
      currentAnswerIds,
      expectedPrimaryIds,
      actualMiniMapPrimaryAId: actualPrimaryAId,
      miniMapTurnId: box?.row?.dataTurnId || null,
      miniMapQuestionId: box?.row?.dataQuestionId || null,
      reason,
    };
  }

  function chatAtlasConvergenceWasherState(entry, btn, warnings) {
    let washApi = null;
    try { washApi = W?.H2O?.MM?.wash || W?.top?.H2O?.MM?.wash || null; } catch {}
    if (!washApi || typeof washApi.inspectMiniBtn !== 'function') {
      warnings.push('washer-read-api-unavailable');
      return {
        available: false,
        expectedAvailable: false,
        expectedWashed: 'unknown',
        actualWashed: 'unknown',
        computedVisualWash: 'unknown',
        washerExpectedSource: 'unavailable',
        washerActualSource: 'unavailable',
        selectedOrCurrent: 'unknown',
        actualWashAttrs: {},
        actualWashClasses: [],
      };
    }
    const buttonId = chatAtlasConvergenceAttr(btn, 'data-primary-a-id') || entry?.row?.primaryAId || '';
    let inspected = null;
    try { inspected = washApi.inspectMiniBtn(buttonId, btn) || null; } catch {}
    if (!inspected || typeof inspected.shouldWash !== 'boolean') {
      warnings.push('washer-expected-state-unavailable');
      return {
        available: false,
        expectedAvailable: false,
        expectedWashed: 'unknown',
        actualWashed: 'unknown',
        computedVisualWash: 'unknown',
        washerExpectedSource: 'unavailable',
        washerActualSource: 'unavailable',
        selectedOrCurrent: 'unknown',
        actualWashAttrs: {},
        actualWashClasses: [],
      };
    }
    const actualWashAttrs = {
      dataCgxuiWash: chatAtlasConvergenceAttr(btn, 'data-cgxui-wash'),
      dataWash: chatAtlasConvergenceAttr(btn, 'data-wash'),
      dataH2oWashId: chatAtlasConvergenceAttr(btn, 'data-h2o-wash-id'),
      dataH2oWashName: chatAtlasConvergenceAttr(btn, 'data-h2o-wash-name'),
    };
    const actualWashClasses = Array.from(btn?.classList || [])
      .filter((name) => /^cgxui-(?:mnmp-)?wash-/i.test(String(name)));
    const actualWashed = actualWashAttrs.dataCgxuiWash === '1'
      || actualWashAttrs.dataWash === 'true'
      || !!actualWashAttrs.dataH2oWashId
      || !!actualWashAttrs.dataH2oWashName
      || actualWashClasses.length > 0;
    const selectedOrCurrent = !!inspected.selectedOrCurrent;
    const washerActualSource = actualWashed
      ? (actualWashClasses.length ? 'minimap-wash-attrs+classes' : 'minimap-wash-attrs')
      : (selectedOrCurrent ? 'selected-or-current-style-only' : 'no-wash-projection');
    return {
      available: true,
      expectedAvailable: true,
      expectedWashed: !!inspected.shouldWash,
      expectedColorName: String(inspected.colorName || '') || null,
      washerExpectedSource: `washer-owner:inspectMiniBtn${inspected.expectedSource ? `:${inspected.expectedSource}` : ''}`,
      actualWashed,
      washerActualSource,
      computedVisualWash: inspected?.computedVisualWash ?? 'unknown',
      actualColorName: actualWashAttrs.dataH2oWashName || null,
      selectedOrCurrent,
      selectedStateTokens: String(inspected.selectedStateTokens || ''),
      actualWashAttrs,
      actualWashClasses,
      projectedWashId: actualWashAttrs.dataH2oWashId || null,
    };
  }

  function chatAtlasInternalExactness(parityStatus, blockers, mismatchCount) {
    const status = String(parityStatus || 'unknown');
    return chatAtlasFreeze({
      status,
      exact: status === 'exact',
      blockerCount: Array.isArray(blockers) ? blockers.length : 0,
      mismatchCount: Math.max(0, Number(mismatchCount || 0) || 0),
    });
  }

  function chatAtlasBuildProjectionConvergenceDiagnostics(
    parityStatus,
    blockers = [],
    mismatchCount = 0,
    miniMapDiagnostics = undefined,
    completenessProof = null,
  ) {
    const completenessEvaluation = chatAtlasEvaluateHistoricalCompleteness(
      miniMapDiagnostics,
      completenessProof,
    );
    const nextBlockers = Array.from(new Set(Array.isArray(blockers) ? blockers : []));
    let nextMismatchCount = Math.max(0, Number(mismatchCount || 0) || 0);
    if (completenessEvaluation.destructiveShrinkEvidence) {
      nextBlockers.push('unproven-cache-shrink-persisted');
      nextMismatchCount += 1;
    }
    const deduplicatedBlockers = Array.from(new Set(nextBlockers));
    const nextParityStatus = completenessEvaluation.destructiveShrinkEvidence
      ? 'mismatch'
      : String(parityStatus || 'unknown');
    return chatAtlasFreeze({
      parityStatus: nextParityStatus,
      blockers: deduplicatedBlockers,
      warning: completenessEvaluation.warningEvidence
        ? 'incomplete-projection-coverage'
        : null,
      internalExactness: chatAtlasInternalExactness(
        nextParityStatus,
        deduplicatedBlockers,
        nextMismatchCount,
      ),
      historicalCompleteness: completenessEvaluation.historicalCompleteness,
      historicalCompletenessWarningEvidence: completenessEvaluation.warningEvidence,
      unprovenCacheShrinkEvidence: completenessEvaluation.destructiveShrinkEvidence,
    });
  }

  function getChatAtlasConvergenceParity() {
    const safetyBefore = chatAtlasConvergenceSafetyCounters();
    try {
      const blockers = [];
      const warnings = [];
      const notes = [
        'operator-called-read-only-probe',
        'does-not-drive-canonical-records-or-minimap-rendering',
      ];
      const countMismatches = [];
      const orderMismatches = [];
      const fieldShapeMismatches = [];
      const qIdMismatches = [];
      const primaryAIdMismatches = [];
      const aliasMismatches = [];
      const noAnswerMismatches = [];
      const pageNoMismatches = [];
      const miniMapMissingBoxes = [];
      const miniMapUnexpectedBoxes = [];
      const miniMapOrderMismatches = [];
      const miniMapPrimaryMismatches = [];
      const blockingAliasMismatches = [];
      const blockingMiniMapUnexpectedBoxes = [];
      const unmatchedRows = chatAtlasConvergenceUnmatchedTracker();
      const miniMapCompletenessDiagnostics = chatAtlasReadMiniMapCompletenessDiagnostics();
      let noAnswerMiniMapPrimaryMismatchCount = 0;
      let miniMapPrimaryNotMemberAnswerCount = 0;
      const washerMismatches = [];
      const washerAudit = [];

      const ledgerEntries = chatAtlasLedgerState.members.map(chatAtlasConvergenceLedgerRow);
      const canonicalEntries = turnState.turns.map((record, index) => chatAtlasConvergenceCanonicalRow(record, index, fieldShapeMismatches));
      const ledgerRows = ledgerEntries.map((entry) => entry.row);
      const canonicalRows = canonicalEntries.map((entry) => entry.row);
      const canonicalOwners = chatAtlasConvergenceAliasOwners(canonicalEntries);
      const usedCanonical = new Set();
      const canonicalByLedgerIndex = new Map();
      const ledgerReady = !!chatAtlasLedgerState.ready;
      const canonicalReady = canonicalRows.length > 0;

      if (ledgerReady) {
      for (let index = 0; index < ledgerEntries.length; index += 1) {
        const ledger = ledgerEntries[index];
        const match = chatAtlasConvergenceMatch(
          ledger,
          canonicalOwners,
          index,
          usedCanonical,
          canonicalEntries.length,
        );
        const canonical = match.index >= 0 && match.index < canonicalEntries.length
          ? canonicalEntries[match.index]
          : null;
        if (!canonical?.row) {
          const classification = match.basis === 'unmatched'
            ? 'ledger-only-live-row'
            : 'unresolved-identity-mismatch';
          const severity = ['ambiguous-alias', 'already-claimed-alias', 'out-of-bounds-alias'].includes(match.basis)
            ? 'blocker'
            : 'mismatch';
          const reason = match.basis === 'ambiguous-alias'
            ? 'ambiguous-canonical-alias-match'
            : match.basis === 'already-claimed-alias'
              ? 'duplicate-canonical-member-claim'
              : match.basis === 'out-of-bounds-alias'
                ? 'out-of-bounds-canonical-alias-match'
                : 'canonical-record-not-matched';
          const mismatch = {
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            classification,
            severity,
            reason,
            candidateIndexes: Array.from(new Set([
              ...(match.candidates || []),
              ...(match.claimedCandidates || []),
              ...(match.rejectedCandidateIndexes || []),
            ])).slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT),
          };
          aliasMismatches.push(mismatch);
          if (severity === 'blocker') blockingAliasMismatches.push(mismatch);
          chatAtlasConvergenceRecordUnmatched(
            unmatchedRows,
            classification,
            { source: 'ledger', severity, reason, logicalMemberKey: ledger.row.logicalMemberKey, turnNo: ledger.row.turnNo },
            `ledger:${index}`,
          );
          continue;
        }
        usedCanonical.add(match.index);
        canonicalByLedgerIndex.set(index, canonical);
        if (match.index !== index || canonical.row.turnNo !== ledger.row.turnNo) {
          orderMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            expectedIndex: index,
            canonicalIndex: match.index,
            ledgerTurnNo: ledger.row.turnNo,
            canonicalTurnNo: canonical.row.turnNo,
          });
        }
        if (ledger.row.qId && canonical.row.qId
          && !ledger.questionIds.has(canonical.row.qId)
          && !canonical.questionIds.has(ledger.row.qId)) {
          qIdMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerQId: ledger.row.qId,
            canonicalQId: canonical.row.qId,
          });
        }
        if (ledger.row.primaryAId && canonical.row.primaryAId
          && !ledger.answerIds.has(canonical.row.primaryAId)
          && !canonical.answerIds.has(ledger.row.primaryAId)) {
          primaryAIdMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerPrimaryAId: ledger.row.primaryAId,
            canonicalPrimaryAId: canonical.row.primaryAId,
          });
        }
        if (ledger.row.noAnswer !== canonical.row.noAnswer) {
          noAnswerMismatches.push({
            source: 'ledger-vs-canonical',
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerNoAnswer: ledger.row.noAnswer,
            canonicalNoAnswer: canonical.row.noAnswer,
            classification: 'blocker',
            rationale: 'authoritative-ledger-canonical-disagreement',
          });
        }
        if (ledger.row.pageNo !== canonical.row.pageNo) {
          pageNoMismatches.push({
            source: 'ledger-vs-canonical',
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerPageNo: ledger.row.pageNo,
            canonicalPageNo: canonical.row.pageNo,
          });
        }
      }

      }
      if (ledgerReady && canonicalReady) {

      for (let index = 0; index < canonicalEntries.length; index += 1) {
        if (!usedCanonical.has(index)) {
          const mismatch = {
            source: 'canonical',
            canonicalIndex: index,
            turnNo: canonicalEntries[index].row.turnNo,
            classification: 'canonical-only-current-row',
            severity: 'mismatch',
            reason: 'canonical-record-not-matched-to-ledger',
          };
          aliasMismatches.push(mismatch);
          chatAtlasConvergenceRecordUnmatched(
            unmatchedRows,
            'canonical-only-current-row',
            { source: 'canonical', severity: 'mismatch', reason: mismatch.reason, turnNo: mismatch.turnNo },
            `canonical:${index}`,
          );
        }
      }
      }

      let miniMapRoot = null;
      try { miniMapRoot = D.querySelector(CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL); } catch {}
      let miniMapEntries = [];
      if (miniMapRoot) {
        try {
          miniMapEntries = Array.from(miniMapRoot.querySelectorAll(CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL))
            .map(chatAtlasConvergenceMiniMapBox);
        } catch { miniMapEntries = []; }
      }
      const renderedMiniMapBoxes = miniMapEntries.map((entry) => entry.row);
      const ledgerOwners = chatAtlasConvergenceAliasOwners(ledgerEntries);
      const boxesByLedgerIndex = new Map();
      const usedLedger = new Set();
      if (ledgerReady) {
      for (let index = 0; index < miniMapEntries.length; index += 1) {
        const box = miniMapEntries[index];
        const fallbackIndex = box.row.inferredTurnNo > 0 ? box.row.inferredTurnNo - 1 : index;
        const match = chatAtlasConvergenceMatch(
          box,
          ledgerOwners,
          fallbackIndex,
          usedLedger,
          ledgerEntries.length,
        );
        const ledger = match.index >= 0 && match.index < ledgerEntries.length
          ? ledgerEntries[match.index]
          : null;
        if (!ledger?.row) {
          const unmatched = chatAtlasConvergenceClassifyMiniMapUnmatched(
            box,
            match,
            canonicalOwners,
            canonicalEntries,
            usedCanonical,
            miniMapCompletenessDiagnostics,
          );
          box.row.mismatchReason = unmatched.reason;
          const evidence = {
            ...box.row,
            classification: unmatched.classification,
            severity: unmatched.severity,
            candidateIndexes: Array.from(new Set([
              ...(match.candidates || []),
              ...(match.claimedCandidates || []),
              ...(match.rejectedCandidateIndexes || []),
            ])).slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT),
          };
          miniMapUnexpectedBoxes.push(evidence);
          if (unmatched.severity === 'blocker') blockingMiniMapUnexpectedBoxes.push(evidence);
          chatAtlasConvergenceRecordUnmatched(
            unmatchedRows,
            unmatched.classification,
            {
              source: 'minimap',
              severity: unmatched.severity,
              reason: unmatched.reason,
              domIndex: box.row.domIndex,
              turnNo: box.row.inferredTurnNo,
            },
            `minimap:${index}`,
          );
          continue;
        }
        usedLedger.add(match.index);
        box.row.resolvedTurnNo = ledger.row.turnNo;
        box.row.resolvedLogicalMemberKey = ledger.row.logicalMemberKey;
        const primaryMismatch = chatAtlasConvergenceMiniMapPrimaryMismatch(
          ledger,
          canonicalByLedgerIndex.get(match.index) || null,
          box,
        );
        if (primaryMismatch) {
          box.row.primaryMismatchReason = primaryMismatch.reason;
          if (primaryMismatch.reason === 'no-answer-minimap-primary-present') {
            noAnswerMiniMapPrimaryMismatchCount += 1;
          } else if (primaryMismatch.reason === 'minimap-primary-not-member-answer') {
            miniMapPrimaryNotMemberAnswerCount += 1;
          }
          if (miniMapPrimaryMismatches.length < CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT) {
            miniMapPrimaryMismatches.push(primaryMismatch);
          }
        }
        if (!boxesByLedgerIndex.has(match.index)) boxesByLedgerIndex.set(match.index, []);
        boxesByLedgerIndex.get(match.index).push(box);
        if (match.index !== index) {
          miniMapOrderMismatches.push({
            logicalMemberKey: ledger.row.logicalMemberKey,
            expectedDomIndex: match.index,
            actualDomIndex: index,
            turnNo: ledger.row.turnNo,
          });
        }
        if (box.row.inferredPageNo && box.row.inferredPageNo !== ledger.row.pageNo) {
          pageNoMismatches.push({
            source: 'ledger-vs-minimap',
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerPageNo: ledger.row.pageNo,
            miniMapPageNo: box.row.inferredPageNo,
          });
        }
        if (box.row.noAnswerSemanticAvailable && box.row.noAnswer !== ledger.row.noAnswer) {
          noAnswerMismatches.push({
            source: 'ledger-vs-minimap',
            logicalMemberKey: ledger.row.logicalMemberKey,
            turnNo: ledger.row.turnNo,
            ledgerNoAnswer: ledger.row.noAnswer,
            miniMapNoAnswer: box.row.noAnswer,
            miniMapNoAnswerMarkerSource: box.row.noAnswerMarkerSource,
            classification: 'blocker',
            rationale: 'reliable-minimap-no-answer-marker-disagrees',
          });
        }
        const wash = chatAtlasConvergenceWasherState(ledger, box.btn, warnings);
        let washerMismatchReason = '';
        if (wash.expectedAvailable) {
          if (wash.actualWashed !== wash.expectedWashed) {
            washerMismatchReason = 'washer-owner-vs-explicit-projection-mismatch';
          } else if (wash.expectedWashed && wash.actualWashed
            && wash.expectedColorName && wash.actualColorName
            && wash.expectedColorName !== wash.actualColorName) {
            washerMismatchReason = 'washer-color-attribute-mismatch';
          } else if (wash.expectedWashed && wash.actualWashed && wash.computedVisualWash === false) {
            washerMismatchReason = 'wash-visual-missing';
          }
        }
        const washerRow = {
          logicalMemberKey: ledger.row.logicalMemberKey,
          turnNo: ledger.row.turnNo,
          ...wash,
          mismatchReason: washerMismatchReason,
          classification: washerMismatchReason ? 'blocker' : (wash.expectedAvailable ? 'pass' : 'warning'),
          rationale: washerMismatchReason
            ? 'washer-owner-state-disagrees-with-explicit-minimap-wash-projection'
            : (wash.expectedAvailable
              ? (wash.selectedOrCurrent && !wash.actualWashed
                ? 'selected-or-current-style-is-not-washer-evidence'
                : 'washer-owner-and-explicit-projection-agree')
              : 'washer-owner-state-unavailable'),
        };
        washerAudit.push(washerRow);
        if (washerMismatchReason) washerMismatches.push({ ...washerRow, reason: washerMismatchReason });
      }
      }

      if (ledgerReady && miniMapRoot && miniMapEntries.length) {
        for (let index = 0; index < ledgerEntries.length; index += 1) {
          const boxes = boxesByLedgerIndex.get(index) || [];
          if (!boxes.length) miniMapMissingBoxes.push({ ...ledgerEntries[index].row });
          if (boxes.length > 1) {
            miniMapUnexpectedBoxes.push({
              logicalMemberKey: ledgerEntries[index].row.logicalMemberKey,
              turnNo: ledgerEntries[index].row.turnNo,
              domIndexes: boxes.map((box) => box.row.domIndex),
              reason: 'duplicate-minimap-boxes-for-ledger-member',
            });
          }
        }
      }

      const ledgerMemberCount = ledgerRows.length;
      const canonicalRecordCount = canonicalRows.length;
      const renderedMiniMapBoxCount = renderedMiniMapBoxes.length;
      const expectedPageCount = ledgerMemberCount ? Math.ceil(ledgerMemberCount / CHAT_ATLAS_PAGE_SIZE) : 0;
      const noAnswerCountLedger = ledgerRows.filter((row) => row.noAnswer).length;
      const noAnswerCountCanonical = canonicalRows.filter((row) => row.noAnswer).length;
      const miniMapRendered = !!miniMapRoot && renderedMiniMapBoxCount > 0;
      const noAnswerLedgerIndexes = ledgerEntries
        .map((entry, index) => entry.row.noAnswer ? index : -1)
        .filter((index) => index >= 0);
      const noAnswerMarkerRows = noAnswerLedgerIndexes.flatMap((index) => boxesByLedgerIndex.get(index) || []);
      const noAnswerSemanticAvailable = noAnswerLedgerIndexes.length === 0
        ? true
        : noAnswerMarkerRows.length === noAnswerLedgerIndexes.length
          && noAnswerMarkerRows.every((entry) => entry.row.noAnswerSemanticAvailable);
      const miniMapNoAnswerMarkerSources = Array.from(new Set(
        noAnswerMarkerRows
          .filter((entry) => entry.row.noAnswerSemanticAvailable)
          .map((entry) => entry.row.noAnswerMarkerSource)
          .filter(Boolean)
      ));
      const miniMapNoAnswerMarkerSource = noAnswerLedgerIndexes.length === 0
        ? 'not-applicable'
        : (noAnswerSemanticAvailable ? miniMapNoAnswerMarkerSources.join('+') : 'unavailable');
      const noAnswerCountMiniMap = noAnswerSemanticAvailable
        ? noAnswerMarkerRows.filter((entry) => entry.row.noAnswer === true).length
        : 'unknown';
      const noAnswerMatches = noAnswerMismatches.length === 0;
      if (miniMapRendered && noAnswerLedgerIndexes.length && !noAnswerSemanticAvailable) {
        warnings.push('minimap-no-answer-marker-unavailable');
        notes.push('no-answer-parity-uses-ledger-vs-canonical-only');
      }
      const washerExpectedSources = Array.from(new Set(washerAudit.map((row) => row.washerExpectedSource).filter(Boolean)));
      const washerActualSources = Array.from(new Set(washerAudit.map((row) => row.washerActualSource).filter(Boolean)));
      const washerExpectedSource = washerExpectedSources.length === 1 ? washerExpectedSources[0] : washerExpectedSources;
      const washerActualSource = washerActualSources.length === 1 ? washerActualSources[0] : washerActualSources;
      const washerMatches = washerAudit.some((row) => !row.expectedAvailable)
        ? (washerMismatches.length ? false : 'unknown')
        : washerMismatches.length === 0;
      const countParity = ledgerReady && canonicalReady && miniMapRendered
        ? ledgerMemberCount === canonicalRecordCount && canonicalRecordCount === renderedMiniMapBoxCount
        : 'unknown';

      if (ledgerReady && canonicalReady && ledgerMemberCount !== canonicalRecordCount) {
        countMismatches.push({ source: 'ledger-vs-canonical', ledgerMemberCount, canonicalRecordCount });
      }
      if (ledgerReady && miniMapRendered && ledgerMemberCount !== renderedMiniMapBoxCount) {
        countMismatches.push({ source: 'ledger-vs-minimap', ledgerMemberCount, renderedMiniMapBoxCount });
      }
      if (!ledgerReady) warnings.push('chat-atlas-ledger-not-ready');
      if (!canonicalReady) warnings.push('canonical-turn-runtime-not-ready');
      if (!miniMapRoot) warnings.push('minimap-root-not-rendered');
      else if (!miniMapRendered) warnings.push('minimap-boxes-not-rendered');
      if (unmatchedRows.evidence.some((entry) => entry.severity !== 'blocker')) {
        warnings.push('convergence-unmatched-rows');
      }

      const mismatchGroups = [
        countMismatches,
        orderMismatches,
        fieldShapeMismatches,
        qIdMismatches,
        primaryAIdMismatches,
        aliasMismatches,
        noAnswerMismatches,
        pageNoMismatches,
        miniMapMissingBoxes,
        miniMapUnexpectedBoxes,
        miniMapOrderMismatches,
        miniMapPrimaryMismatches,
        washerMismatches,
      ];
      if (countMismatches.length) blockers.push('count-mismatch');
      if (orderMismatches.length) blockers.push('ledger-canonical-order-mismatch');
      if (fieldShapeMismatches.length) blockers.push('canonical-field-shape-mismatch');
      if (qIdMismatches.length) blockers.push('question-id-mismatch');
      if (primaryAIdMismatches.length) blockers.push('primary-answer-id-mismatch');
      if (blockingAliasMismatches.length) blockers.push('record-local-alias-mismatch');
      if (noAnswerMismatches.length) blockers.push('no-answer-mismatch');
      if (pageNoMismatches.length) blockers.push('page-membership-mismatch');
      if (miniMapMissingBoxes.length) blockers.push('minimap-missing-boxes');
      if (blockingMiniMapUnexpectedBoxes.length) blockers.push('minimap-unexpected-boxes');
      if (miniMapOrderMismatches.length) blockers.push('minimap-order-mismatch');
      if (noAnswerMiniMapPrimaryMismatchCount) blockers.push('no-answer-minimap-primary-present');
      if (miniMapPrimaryNotMemberAnswerCount) blockers.push('minimap-primary-not-member-answer');
      if (washerMismatches.length) blockers.push('washer-mismatch');

      const unknown = !ledgerReady || !canonicalReady || !miniMapRendered;
      const mismatch = mismatchGroups.some((group) => group.length > 0);
      const parityStatus = unknown ? 'unknown' : (mismatch ? 'mismatch' : (warnings.length ? 'warn' : 'exact'));
      const safetyAfter = chatAtlasConvergenceSafetyCounters();
      const safety = chatAtlasConvergenceSafetyResult(safetyBefore, safetyAfter);
      if (!safety.safetyCountersUnchanged) blockers.push('safety-counter-changed-during-probe');
      const mismatchCount = mismatchGroups.reduce((total, group) => total + group.length, 0)
        + (safety.safetyCountersUnchanged ? 0 : 1);
      const projectionDiagnostics = chatAtlasBuildProjectionConvergenceDiagnostics(
        safety.safetyCountersUnchanged ? parityStatus : 'mismatch',
        blockers,
        mismatchCount,
        miniMapCompletenessDiagnostics,
      );
      if (projectionDiagnostics.warning) warnings.push(projectionDiagnostics.warning);

      return chatAtlasFreeze({
        readOnly: true,
        authority: 'chat-atlas-convergence-parity',
        parityStatus: projectionDiagnostics.parityStatus,
        blockers: projectionDiagnostics.blockers,
        warnings: Array.from(new Set(warnings)),
        notes,
        chatKey: chatAtlasLedgerState.chatKey,
        internalExactness: projectionDiagnostics.internalExactness,
        historicalCompleteness: projectionDiagnostics.historicalCompleteness,
        historicalCompletenessWarningEvidence: projectionDiagnostics.historicalCompletenessWarningEvidence,
        unprovenCacheShrinkEvidence: projectionDiagnostics.unprovenCacheShrinkEvidence,
        ledgerReady,
        canonicalReady,
        miniMapRendered,
        ledgerMemberCount,
        canonicalRecordCount,
        renderedMiniMapBoxCount,
        countParity,
        expectedPageCount,
        noAnswerCountLedger,
        noAnswerCountCanonical,
        noAnswerCountMiniMap,
        noAnswerSemanticAvailable,
        miniMapNoAnswerMarkerSource,
        noAnswerMatches,
        washerExpectedSource,
        washerActualSource,
        washerMatches,
        ledgerRows,
        canonicalRows,
        renderedMiniMapBoxes,
        countMismatches,
        orderMismatches,
        fieldShapeMismatches,
        qIdMismatches,
        primaryAIdMismatches,
        aliasMismatches,
        noAnswerMismatches,
        pageNoMismatches,
        miniMapMissingBoxes,
        miniMapUnexpectedBoxes,
        miniMapOrderMismatches,
        noAnswerMiniMapPrimaryMismatchCount,
        miniMapPrimaryNotMemberAnswerCount,
        miniMapPrimaryMismatchSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        miniMapPrimaryMismatches,
        unmatchedRowCounts: { ...unmatchedRows.counts },
        unmatchedRowTotal: unmatchedRows.total,
        unmatchedRowEvidenceSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        unmatchedRowEvidenceTruncated: unmatchedRows.truncated,
        unmatchedRowEvidence: unmatchedRows.evidence,
        washerAudit,
        washerMismatches,
        miniMapRootSelector: miniMapRoot ? CHAT_ATLAS_CONVERGENCE_MINIMAP_ROOT_SEL : null,
        miniMapBoxSelector: miniMapRoot ? CHAT_ATLAS_CONVERGENCE_MINIMAP_BOX_SEL : null,
        ...safety,
      });
    } catch (error) {
      const safetyAfter = chatAtlasConvergenceSafetyCounters();
      const safety = chatAtlasConvergenceSafetyResult(safetyBefore, safetyAfter);
      const projectionDiagnostics = chatAtlasBuildProjectionConvergenceDiagnostics('unknown', [], 0);
      const unmatchedRows = chatAtlasConvergenceUnmatchedTracker();
      const catchWarnings = [
        `convergence-parity-probe-failed:${String(error?.message || error || 'unknown')}`,
      ];
      if (projectionDiagnostics.warning) catchWarnings.push(projectionDiagnostics.warning);
      return chatAtlasFreeze({
        readOnly: true,
        authority: 'chat-atlas-convergence-parity',
        parityStatus: projectionDiagnostics.parityStatus,
        blockers: projectionDiagnostics.blockers,
        warnings: Array.from(new Set(catchWarnings)),
        notes: ['operator-called-read-only-probe'],
        chatKey: chatAtlasLedgerState.chatKey,
        internalExactness: projectionDiagnostics.internalExactness,
        historicalCompleteness: projectionDiagnostics.historicalCompleteness,
        historicalCompletenessWarningEvidence: projectionDiagnostics.historicalCompletenessWarningEvidence,
        unprovenCacheShrinkEvidence: projectionDiagnostics.unprovenCacheShrinkEvidence,
        ledgerReady: !!chatAtlasLedgerState.ready,
        canonicalReady: 'unknown',
        miniMapRendered: 'unknown',
        ledgerMemberCount: chatAtlasLedgerState.members.length,
        canonicalRecordCount: 'unknown',
        renderedMiniMapBoxCount: 'unknown',
        countParity: 'unknown',
        expectedPageCount: 'unknown',
        noAnswerCountLedger: 'unknown',
        noAnswerCountCanonical: 'unknown',
        noAnswerCountMiniMap: 'unknown',
        noAnswerSemanticAvailable: 'unknown',
        miniMapNoAnswerMarkerSource: 'unknown',
        noAnswerMatches: 'unknown',
        washerExpectedSource: 'unknown',
        washerActualSource: 'unknown',
        washerMatches: 'unknown',
        ledgerRows: [],
        canonicalRows: [],
        renderedMiniMapBoxes: [],
        countMismatches: [],
        orderMismatches: [],
        fieldShapeMismatches: [],
        qIdMismatches: [],
        primaryAIdMismatches: [],
        aliasMismatches: [],
        noAnswerMismatches: [],
        pageNoMismatches: [],
        miniMapMissingBoxes: [],
        miniMapUnexpectedBoxes: [],
        miniMapOrderMismatches: [],
        noAnswerMiniMapPrimaryMismatchCount: 'unknown',
        miniMapPrimaryNotMemberAnswerCount: 'unknown',
        miniMapPrimaryMismatchSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        miniMapPrimaryMismatches: [],
        unmatchedRowCounts: { ...unmatchedRows.counts },
        unmatchedRowTotal: 0,
        unmatchedRowEvidenceSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        unmatchedRowEvidenceTruncated: false,
        unmatchedRowEvidence: [],
        washerAudit: [],
        washerMismatches: [],
        ...safety,
      });
    }
  }

  function getChatAtlasLedgerDiagnostics() {
    try {
      const members = chatAtlasLedgerState.members;
      return chatAtlasFreeze({
        ledgerReady: !!chatAtlasLedgerState.ready,
        memberCount: members.length,
        shellCount: chatAtlasLedgerState.shellCount,
        questionShellCount: chatAtlasLedgerState.questionShellCount,
        answerShellCount: chatAtlasLedgerState.answerShellCount,
        hydratedMemberCount: members.filter((member) => member.hydration !== 'none').length,
        noAnswerCount: members.filter((member) => member.noAnswer).length,
        logicalPageCount: members.length ? Math.ceil(members.length / CHAT_ATLAS_PAGE_SIZE) : 0,
        buildCount: chatAtlasLedgerState.buildCount,
        lastBuildMs: chatAtlasLedgerState.lastBuildMs,
        flushCount: chatAtlasLedgerState.flushCount,
        lastFlushMs: chatAtlasLedgerState.lastFlushMs,
        maxFlushMs: chatAtlasLedgerState.maxFlushMs,
        dirtyShellCount: chatAtlasLedgerState.dirtyShells.size,
        lastDirtyShellCount: chatAtlasLedgerState.lastDirtyShellCount,
        aliasAbsorbCount: chatAtlasLedgerState.aliasAbsorbCount,
        duplicateAliasCount: chatAtlasLedgerState.duplicateAliasCount,
        currentCrossMemberDuplicateCount: chatAtlasLedgerState.currentCrossMemberDuplicateCount,
        crossMemberAliasConflictCount: chatAtlasLedgerState.crossMemberAliasConflictCount,
        crossMemberAliasRepairCount: chatAtlasLedgerState.crossMemberAliasRepairCount,
        currentAliasConflictCount: chatAtlasLedgerState.currentAliasConflictCount,
        historicalAliasConflictCount: chatAtlasLedgerState.historicalAliasConflictCount,
        pairingAdjacencyRejectCount: chatAtlasLedgerState.pairingAdjacencyRejectCount,
        quarantinedAliasCount: chatAtlasLedgerState.quarantinedAliases.size,
        quarantinedAliases: Array.from(chatAtlasLedgerState.quarantinedAliases)
          .slice(0, CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT),
        quarantinedAliasResolutionCount: chatAtlasLedgerState.quarantinedAliasResolutionCount,
        lastAliasConflict: chatAtlasLedgerState.lastAliasConflict
          ? { ...chatAtlasLedgerState.lastAliasConflict }
          : null,
        recentAliasConflicts: chatAtlasLedgerState.recentAliasConflicts
          .slice(-CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT)
          .map((item) => ({ ...item })),
        lastPairingRejection: chatAtlasLedgerState.lastPairingRejection
          ? { ...chatAtlasLedgerState.lastPairingRejection }
          : null,
        recentPairingRejections: chatAtlasLedgerState.recentPairingRejections
          .slice(-CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT)
          .map((item) => ({ ...item })),
        aliasConflictSampleLimit: CHAT_ATLAS_DUAL_RUN_SAMPLE_LIMIT,
        completeShellMap: chatAtlasLedgerState.completeShellMap,
        duplicateMemberCandidates: chatAtlasLedgerState.duplicateMemberCandidates.length,
        duplicateMemberCandidateDetails: chatAtlasLedgerState.duplicateMemberCandidates.slice(),
        unboundShells: chatAtlasLedgerState.unboundShells.slice(),
        parityWithCurrentTurnRuntime: chatAtlasLedgerState.parityWithCurrentTurnRuntime,
        parityStatus: chatAtlasLedgerState.parityStatus,
        parityDisagreements: chatAtlasLedgerState.parityDisagreements.slice(),
        canonicalRecordCount: chatAtlasLedgerState.canonicalRecordCount,
        canonicalTurnVersion: chatAtlasLedgerState.canonicalTurnVersion,
        observerActive: chatAtlasLedgerState.observerActive,
        warnings: chatAtlasLedgerState.warnings.slice(),
        ledgerMode: chatAtlasCanonicalSourceState.activeSource === CHAT_ATLAS_CANONICAL_SOURCE_LEGACY
          ? 'shadow'
          : 'canonical-source',
        canonicalSource: chatAtlasCanonicalSourceDiagnostics(),
        dualRun: chatAtlasDualRunDiagnostics(),
        zeroConsumerSwitches: chatAtlasCanonicalSourceState.switchCount === 0,
        consumerSwitchCount: chatAtlasCanonicalSourceState.switchCount,
        canonicalMutationAttemptCount: chatAtlasCanonicalSourceState.canonicalMutationAttemptCount,
        domWriteCount: 0,
        storageWriteCount: 0,
        physicalExecutorCallCount: 0,
        paginationExecutorCallCount: 0,
        unmountExecutorCallCount: 0,
      });
    } catch (error) {
      return chatAtlasFreeze({
        ledgerReady: false,
        warning: String(error?.message || error || 'diagnostics-failed'),
        canonicalSource: chatAtlasCanonicalSourceDiagnostics(),
        dualRun: chatAtlasDualRunDiagnostics(),
        zeroConsumerSwitches: chatAtlasCanonicalSourceState.switchCount === 0,
        consumerSwitchCount: chatAtlasCanonicalSourceState.switchCount,
        canonicalMutationAttemptCount: chatAtlasCanonicalSourceState.canonicalMutationAttemptCount,
        domWriteCount: 0,
        storageWriteCount: 0,
        physicalExecutorCallCount: 0,
      });
    }
  }

  function subscribeChatAtlasLedger(listener) {
    if (typeof listener !== 'function') return () => {};
    chatAtlasLedgerState.subscribers.add(listener);
    return () => { chatAtlasLedgerState.subscribers.delete(listener); };
  }

  function chatAtlasClearBranchSelectionStaleOnCanonicalReturn(members = []) {
    const intent = completeTurnIndexAuthorityState.trustedSelectedPathIntent;
    if (!intent || completeTurnIndexAuthorityState.branchSelectionStale !== true) return false;
    const qId = chatAtlasCompleteIndexIdentity(intent.qId);
    const priorAnswerId = chatAtlasCompleteIndexIdentity(intent.priorAnswerId);
    const revision = Number(intent.staleRevision || 0);
    const route = chatAtlasFullIndexRoute();
    if (
      !qId
      || !priorAnswerId
      || revision !== Number(completeTurnIndexAuthorityState.branchSelectionStaleRevision || 0)
      || qId !== String(completeTurnIndexAuthorityState.branchSelectionStaleQId || '')
      || intent.chatId !== String(completeTurnIndexAuthorityState.branchSelectionStaleChatId || '')
      || intent.routeKey !== String(completeTurnIndexAuthorityState.branchSelectionStaleRouteKey || '')
      || intent.generation !== Number(completeTurnIndexAuthorityState.branchSelectionStaleGeneration || 0)
      || route.chatId !== intent.chatId
      || route.routeKey !== intent.routeKey
      || intent.generation !== Number(completeTurnIndexAuthorityState.generation || 0)
    ) return false;
    const canonicalMatches = (Array.isArray(completeTurnIndexAuthorityState.index?.turns)
      ? completeTurnIndexAuthorityState.index.turns
      : []).filter((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === qId);
    if (canonicalMatches.length !== 1) return false;
    const canonical = canonicalMatches[0];
    const canonicalPrimaryAId = chatAtlasCompleteIndexIdentity(canonical?.primaryAId);
    if (chatAtlasCompleteIndexIdentity(canonical?.qId) !== qId || !canonicalPrimaryAId) return false;
    const currentMembers = (Array.isArray(members) ? members : []).filter((member) => (
      chatAtlasCompleteIndexIdentity(member?.question?.currentQId) === qId
      && member?.answer?.currentProjectionSource === 'native-evidence'
    ));
    if (currentMembers.length !== 1) return false;
    const selectedAnswerIds = chatAtlasCv2CurrentIds(currentMembers[0]?.answer?.currentAnswerIds || []);
    if (selectedAnswerIds.length !== 1) return false;
    const selectedAnswerId = chatAtlasCompleteIndexIdentity(selectedAnswerIds[0]);
    if (!selectedAnswerId || selectedAnswerId === priorAnswerId || selectedAnswerId !== canonicalPrimaryAId) {
      return false;
    }
    const targetIndex = chatAtlasCanonicalPresentationIndex();
    const priorCount = Math.max(0, Number(intent.priorEffectiveCount || 0) || 0);
    const targetCount = Array.isArray(targetIndex?.turns) ? targetIndex.turns.length : 0;
    if (targetCount > priorCount) {
      const candidate = intent?.returnTargetCandidate || null;
      if (candidate?.classification === 'expanding') {
        const validation = chatAtlasRealBranchExpansionTargetValidation(
          intent,
          targetIndex,
          candidate,
        );
        if (!validation.ok) {
          chatAtlasFailClosedPreExpansionReturn(
            intent,
            null,
            'pre-expansion-return-target-mismatch',
            { allowTargetArrival: true },
          );
          return true;
        }
      }
      const lease = chatAtlasOpenBranchExpansion(intent, targetIndex);
      if (lease) {
        chatAtlasTraceTrustedLifecycle('branch-expansion-anchor-returned', {
          priorCount,
          targetCount,
          requiredPageNums: lease.requiredPageNums.join(','),
        });
        chatAtlasCompleteBranchExpansionCheckpoint('native-branch-returned-to-canonical', {
          allowConfirmation: false,
        });
        return true;
      }
    }
    const checkpoint = Object.freeze({
      revision,
      qId,
      chatId: intent.chatId,
      routeKey: intent.routeKey,
      generation: intent.generation,
    });
    const cleared = chatAtlasClearBranchSelectionStale(checkpoint, 'native-branch-returned-to-canonical');
    if (cleared) chatAtlasCloseBranchTransaction('published', 'native-branch-returned-to-canonical', String(intent.token || ''));
    if (cleared && completeTurnIndexAuthorityState.trustedSelectedPathIntent?.token === intent.token) {
      core()?.clearTrustedSelectedPathIntent?.();
      chatAtlasTraceTrustedLifecycle('trusted-intent-cleared', {
        reason: 'native-branch-returned-to-canonical',
        qId,
        token: intent.token,
      });
    }
    return cleared;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEDGER SERVICE REGISTRATION
  //
  // Registered into 0A3a Chat Atlas Core under the 'ledger' service key. The
  // broker resolves this per call and is inert when it is absent, so H2O Core
  // never gains a hard dependency on this file. Unregistration is identity
  // checked by the registry, so a stale provider cannot detach a newer one.
  // ═══════════════════════════════════════════════════════════════════════════

  const LEDGER_SERVICE_IMPL = {
    ver: LEDGER_VER,

    // semantic state reads — the raw state objects never leave this file
    getMembers: () => (Array.isArray(chatAtlasLedgerState.members) ? chatAtlasLedgerState.members : []),
    getVersion: () => Number(chatAtlasLedgerState.version || 0),
    isReady: () => !!chatAtlasLedgerState.ready,

    // lifecycle
    start: (...a) => startChatAtlasLedger(...a),
    scheduleFlush: (...a) => scheduleChatAtlasLedgerFlush(...a),

    // canonical source / draft policy
    selectCanonicalDrafts: (legacyDrafts) => selectChatAtlasCanonicalDrafts(legacyDrafts),
    buildCanonicalRecords: (...a) => buildChatAtlasLedgerCanonicalRecords(...a),
    getCanonicalSource: (...a) => getChatAtlasCanonicalSource(...a),
    setCanonicalSource: (...a) => setChatAtlasCanonicalSource(...a),

    // public diagnostics surfaced on H2O.turnRuntime by 0A3a
    getSnapshot: (...a) => getChatAtlasLedgerSnapshot(...a),
    getDiagnostics: (...a) => getChatAtlasLedgerDiagnostics(...a),
    getConvergenceParity: (...a) => getChatAtlasConvergenceParity(...a),
    subscribe: (...a) => subscribeChatAtlasLedger(...a),
  };

  let unregisterLedger = null;
  function installLedgerService() {
    const api = core();
    if (!api || typeof api._registerLedgerService !== 'function') return false;
    if (unregisterLedger) return true;
    unregisterLedger = api._registerLedgerService(LEDGER_SERVICE_IMPL) || null;
    return !!unregisterLedger;
  }

  // 0A3a loads immediately before this file, so registration normally succeeds
  // on the first attempt. The ready event is the fallback signal — no polling,
  // no timers.
  if (!installLedgerService()) {
    try { H2O.events?.onReady?.('h2o:chatatlas:core', installLedgerService); } catch {}
  }

  try { TOPW.H2O_CHAT_ATLAS_LEDGER_READY = true; } catch {}
})();
