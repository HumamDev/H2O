// ==H2O Module==
// @h2o-id             0a3a.chatatlas.core
// @name               0A3a.⬛️🧭 Chat Atlas Core 🧭
// @namespace          H2O.Premium.CGX.chatatlas.core
// @author             HumamDev
// @version            12.7.11
// @revision           001
// @build              260808-000002
// @description        Chat Atlas Core: service registry and policy broker between H2O Core and the Chat Atlas Ledger
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

// ─────────────────────────────────────────────────────────────────────────────
// CHAT ATLAS CORE — MILESTONE 2A SHELL.
//
// This file is deliberately small right now. Milestone 2A creates it to fix the
// *boundary* before the ~11k-line central Chat Atlas authority moves in, so the
// dependency direction is established once and never inverted:
//
//     0A1a H2O Core  →  0A3a Chat Atlas Core  →  0A3b Chat Atlas Ledger
//
// H2O Core must never depend on the Ledger directly. Everything generic H2O and
// the (still-resident) central Atlas implementation need from the Ledger goes
// through the narrow service surface below, resolved per call and inert when the
// Ledger has not registered.
//
// What this file does NOT own yet, by design: completeTurnIndexAuthorityState,
// selectedPathAcquisitionState, selectedPathOverlayState, branch expansion and
// transaction state, effective presentation, Reveal, Full Index, the Refresh
// Coordinator, trusted selection and default/manual arbitration. Those stay in
// 0A1a until Milestone 2B moves them here. Nothing is copied ahead of that move.
// ─────────────────────────────────────────────────────────────────────────────

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const H2O = (W.H2O = W.H2O || {});

  const CHAT_ATLAS_CORE_VER = '12.7.11';

  // ── Service registry ──────────────────────────────────────────────────────
  // Modelled on the project's archiveBoot._register* handshake: the provider
  // pushes its implementation in when it boots, the consumer resolves per call,
  // and absence is a normal state rather than an error. No polling, no timers,
  // no captured implementation reference anywhere else in the codebase.
  const services = Object.create(null);

  function registerService(name, impl) {
    const key = String(name || '').trim();
    if (!key || !impl || typeof impl !== 'object') return null;
    services[key] = impl;
    // Unregistration is explicit and identity-checked so a stale provider can
    // never detach a newer one.
    return function unregister() {
      if (services[key] === impl) delete services[key];
    };
  }

  function getService(name) {
    const key = String(name || '').trim();
    if (!key) return null;
    const impl = services[key];
    return (impl && typeof impl === 'object') ? impl : null;
  }

  // ── Ledger service ────────────────────────────────────────────────────────
  const LEDGER_SERVICE = 'ledger';
  const ledger = () => getService(LEDGER_SERVICE);
  const hasLedger = () => !!ledger();

  // Semantic reads. The raw Ledger state objects are deliberately NOT exposed:
  // the six central-Atlas functions still living in 0A1a used to read
  // chatAtlasLedgerState.members / .version directly, and they now ask for the
  // same two facts through here instead. Absent Ledger reads as "nothing yet",
  // which is exactly how the Ledger's own not-ready state already behaved.
  const getLedgerMembers = () => {
    const m = ledger()?.getMembers?.();
    return Array.isArray(m) ? m : [];
  };
  const getLedgerVersion = () => Number(ledger()?.getVersion?.() || 0);

  // ── H2O Core host surface ─────────────────────────────────────────────────
  // 0A1a publishes the internals the Ledger still needs (generic turn model,
  // and — until 2B — the central Atlas helpers). It is read through the broker
  // so the Ledger never reaches into H2O Core directly, and so 2B can drop
  // entries from it as their implementations arrive here.
  const HOST_GLOBAL = 'H2O_CHAT_ATLAS_HOST_V1';
  function getHost() {
    try {
      return TOPW[HOST_GLOBAL] || W[HOST_GLOBAL] || null;
    } catch {
      return null;
    }
  }

  // ── Canonical draft policy (the load-bearing H2O Core seam) ───────────────
  // Generic turn commits call this on every build. The contract is that the
  // Ledger is OPTIONAL: canonical source defaults to 'legacy', no production
  // caller flips it today, and if the Ledger is missing, not ready, or set to
  // legacy, the caller's own drafts are returned untouched. Turn building must
  // never depend on the Ledger being present.
  function selectCanonicalDrafts(legacyDrafts, context) {
    const svc = ledger();
    if (!svc || typeof svc.selectCanonicalDrafts !== 'function') return legacyDrafts;
    try {
      const out = svc.selectCanonicalDrafts(legacyDrafts, context);
      return (out === undefined || out === null) ? legacyDrafts : out;
    } catch {
      return legacyDrafts;
    }
  }

  // Ledger-owned entry points that generic/central code still calls by name.
  // Each is inert when the Ledger is absent.
  const scheduleLedgerFlush = (...a) => ledger()?.scheduleFlush?.(...a);
  const startLedger = (...a) => ledger()?.start?.(...a);
  const buildLedgerCanonicalRecords = (...a) => {
    const out = ledger()?.buildCanonicalRecords?.(...a);
    return Array.isArray(out) ? out : [];
  };


  // ═══════════════════════════════════════════════════════════════════════════
  // PERIPHERAL CHAT ATLAS SUBDOMAINS (Milestone 2B-1)
  //
  // Reveal / pager / scroll and the Full Index diagnostic subdomain moved here
  // from 0A1a. Both were proven to write ZERO central Chat Atlas authority
  // state, which is why they could cross ahead of the central pipeline; that
  // pipeline stays atomic in H2O Core until Milestone 2B-2.
  //
  // Preference/canary deliberately did NOT move: six of its seven functions
  // write completeTurnIndexAuthorityState, and inventing a cross-owner mutation
  // just to hit this milestone is exactly what the boundary rule forbids.
  // ═══════════════════════════════════════════════════════════════════════════

  // Central state these subdomains READ (never write). The set trap throws
  // rather than silently succeeding: Milestone 2A lost two real behaviours to a
  // read-only proxy that swallowed writes, so any future write here fails loudly
  // instead. Production behaviour is unchanged because there are no writes.
  // Local alias for this file's own host accessor.
  const host = getHost;

  const readOnlyCentral = (name) => new Proxy({}, {
    get: (_t, k) => host()?.[name]?.[k],
    has: (_t, k) => !!host()?.[name] && k in host()[name],
    ownKeys: () => Object.keys(host()?.[name] || {}),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    set(_t, k) { throw new Error(`chat-atlas-core: ${name}.${String(k)} is owned by H2O Core; use an owner-side command`); },
  });
  const completeTurnIndexAuthorityState = readOnlyCentral('completeTurnIndexAuthorityState');
  const selectedPathAcquisitionState = readOnlyCentral('selectedPathAcquisitionState');
  const chatAtlasDefaultOverlayState = readOnlyCentral('chatAtlasDefaultOverlayState');
  const chatAtlasQuestionEditPlanState = readOnlyCentral('chatAtlasQuestionEditPlanState');
  const state = readOnlyCentral('state');

  // Central Chat Atlas helpers still resident in 0A1a until 2B-2. Const-arrow
  // bindings so they never collide with the real declarations under a validator
  // scan for `  function <name>(`.
  const hostFn = (name) => (...a) => host()?.[name]?.(...a);
  const chatAtlasAnswerIdentityForRoot = hostFn('chatAtlasAnswerIdentityForRoot');
  const chatAtlasCanonicalPresentationIndex = hostFn('chatAtlasCanonicalPresentationIndex');
  const chatAtlasChainToRoot = hostFn('chatAtlasChainToRoot');
  const chatAtlasCompleteIndexIdentity = hostFn('chatAtlasCompleteIndexIdentity');
  const chatAtlasCompleteIndexStableHash = hostFn('chatAtlasCompleteIndexStableHash');
  const chatAtlasComputeDefaultLatestCreatedPath = hostFn('chatAtlasComputeDefaultLatestCreatedPath');
  const chatAtlasConvergenceAnswerVariantRoots = hostFn('chatAtlasConvergenceAnswerVariantRoots');
  const chatAtlasConvergenceBranchRoot = hostFn('chatAtlasConvergenceBranchRoot');
  const chatAtlasConvergenceExactIndicator = hostFn('chatAtlasConvergenceExactIndicator');
  const chatAtlasConvergenceGraphScope = hostFn('chatAtlasConvergenceGraphScope');
  const chatAtlasConvergenceQuestionVariants = hostFn('chatAtlasConvergenceQuestionVariants');
  const chatAtlasConvergenceUniqueNode = hostFn('chatAtlasConvergenceUniqueNode');
  const chatAtlasFreeze = (...a) => host()?.chatAtlasFreeze?.(...a) ?? (a.length ? a[0] : undefined);
  const chatAtlasGraphCreateTime = hostFn('chatAtlasGraphCreateTime');
  const chatAtlasGraphDivergence = hostFn('chatAtlasGraphDivergence');
  const chatAtlasMapMountedNativePath = hostFn('chatAtlasMapMountedNativePath');
  const chatAtlasNativeVariantPagers = hostFn('chatAtlasNativeVariantPagers');
  const chatAtlasNormalizeId = (...a) => host()?.chatAtlasNormalizeId?.(...a) ?? '';
  // Route spine stays in H2O Core; read it through the host.
  const chatAtlasFullIndexRoute = (...a) => host()?.chatAtlasFullIndexRoute?.(...a) ?? { chatId: null, routeKey: '' };
  const chatAtlasPagerAuditHash = hostFn('chatAtlasPagerAuditHash');
  const chatAtlasTriggerCompleteIndexAuthority = hostFn('chatAtlasTriggerCompleteIndexAuthority');
  const chatAtlasTurn2AuditRole = hostFn('chatAtlasTurn2AuditRole');
  const getCompleteTurnIndexProjectionStatus = hostFn('getCompleteTurnIndexProjectionStatus');
  const getEffectivePresentationIndex = hostFn('getEffectivePresentationIndex');
  const listTurnRecords = (...a) => { const v = host()?.listTurnRecords?.(...a); return Array.isArray(v) ? v : []; };
  const buildChatAtlasLedgerCanonicalRecords = (...a) => {
    const v = ledger()?.buildCanonicalRecords?.(...a);
    return Array.isArray(v) ? v : [];
  };

  // Shared leaf constants (own copies; DOM/schema values, per project convention)
  const D = document;
  const COMPLETE_TURN_INDEX_CACHE_SCHEMA = 1;
  const CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS = Object.freeze(['previous', 'next', 'left', 'right']);


  const CHAT_ATLAS_REVEAL_SCROLLABLE_OVERFLOW = /^(auto|scroll|overlay)$/;

  function chatAtlasRevealIsScrollable(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const overflowY = String(W.getComputedStyle?.(el)?.overflowY || '');
      if (!CHAT_ATLAS_REVEAL_SCROLLABLE_OVERFLOW.test(overflowY)) return false;
      return Number(el.scrollHeight || 0) > Number(el.clientHeight || 0) + 4;
    } catch { return false; }
  }

  // The scroll container that GOVERNS the mounted conversation turns. Anchored
  // on turn identity and walked upward — never chosen by being the biggest
  // scrollable thing on the page, which would happily pick a side panel. Two
  // existing modules already resolve the conversation scroller this way
  // (0D3c resolveChatScrollHost, 1A1c MINI_completeIndexScrollRoot); this adds
  // the ambiguity proof neither of them makes: EVERY mounted turn must resolve
  // to the SAME governing element, and there is no fallback to the document.
  function chatAtlasResolveConversationScrollContainer() {
    const fail = (reason, candidates = 0) => Object.freeze({
      ok: false, reason, element: null, candidateCount: candidates,
    });
    let sections = [];
    try {
      sections = Array.from(D.querySelectorAll('[data-testid^="conversation-turn-"]'));
    } catch { return fail('reveal-container-query-failed'); }
    if (!sections.length) return fail('reveal-container-no-mounted-turns');
    const governing = new Map();
    for (const section of sections) {
      let cursor = section;
      let found = null;
      let hops = 0;
      while (cursor && hops < 64) {
        hops += 1;
        cursor = cursor.parentElement;
        if (!cursor) break;
        // The document scroller is never the conversation container.
        if (cursor === D.body || cursor === D.documentElement) break;
        if (chatAtlasRevealIsScrollable(cursor)) { found = cursor; break; }
      }
      if (!found) continue;
      const entry = governing.get(found) || { element: found, turns: 0 };
      entry.turns += 1;
      governing.set(found, entry);
    }
    const candidates = Array.from(governing.values());
    if (!candidates.length) return fail('reveal-container-unresolved');
    // Ambiguity is a refusal, not a tie-break: two governing scrollers means
    // the conversation subtree is not what we think it is.
    if (candidates.length > 1) return fail('reveal-container-ambiguous', candidates.length);
    const winner = candidates[0];
    if (winner.element === D.scrollingElement) return fail('reveal-container-is-document', 1);
    return Object.freeze({
      ok: true,
      reason: null,
      element: winner.element,
      candidateCount: 1,
      governedTurns: winner.turns,
    });
  }

  function chatAtlasRevealContainerDiagnostics() {
    const resolved = chatAtlasResolveConversationScrollContainer();
    const el = resolved.ok ? resolved.element : null;
    return Object.freeze({
      revealContainerState: resolved.ok ? 'resolved' : 'unresolved',
      revealContainerReason: resolved.reason,
      revealContainerCandidateCount: Number(resolved.candidateCount || 0),
      revealContainerGovernedTurns: Number(resolved.governedTurns || 0),
      // Content-free by construction: the tag comes from a fixed vocabulary and
      // the test id is reduced to a stable hash. Diagnostics never carry raw
      // page strings, so container identity stays comparable across reloads
      // without leaking anything from the conversation.
      revealContainerTag: el ? String(el.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') : null,
      revealContainerTestIdHash: el && el.getAttribute?.('data-testid')
        ? `djb2:${chatAtlasCompleteIndexStableHash(String(el.getAttribute('data-testid')))}`
        : null,
      revealContainerClientHeight: el ? Number(el.clientHeight || 0) : 0,
      revealContainerScrollHeight: el ? Number(el.scrollHeight || 0) : 0,
      revealContainerScrollTop: el ? Number(el.scrollTop || 0) : 0,
    });
  }

  const chatAtlasRevealState = {
    transactionState: 'idle',
    token: '',
    reason: null,
    superseded: false,
    supersededBy: null,
    attempts: 0,
    topScrollExecuted: false,
    internalDepth: 0,
    listeners: [],
    pin: null,
    bookmark: null,
    restoreState: 'idle',
    restoreReason: null,
    restoreMethod: null,
    restoreTargetId: null,
    restoreOffset: 0,
    restoreFinalScrollTop: 0,
    restoreRequestedScrollTop: 0,
    restoreFirstMeasuredScrollTop: 0,
    restoreMeasuredOffset: 0,
    restoreOffsetError: 0,
    restoreCorrectionAttempts: 0,
    restoreCorrectionReason: null,
    pagerAudit: null,
    pagerLocator: null,
    container: null,
    ticks: 0,
    readinessState: 'idle',
    readinessReason: null,
    readinessAttempts: 0,
    readinessTarget: null,
    readinessRetryTask: null,
    readinessRetryPending: false,
    readinessRetryScheduled: 0,
    readinessRetryDelayMs: 0,
    readinessRetryGeneration: 0,
    readinessStartedAtNavigationMs: 0,
    readinessFirstResolvedAtNavigationMs: 0,
    readinessTerminalElapsedMs: 0,
    readinessTerminalState: null,
    readinessReadyElapsedMs: 0,
    movementPhase: null,
    movementExpectedTop: 0,
    movementFromTop: 0,
    movementActivatedAtMs: 0,
    movementToken: '',
    movementConsumed: true,
    movementConsumedBy: null,
    supersessionSource: null,
    supersessionEventType: null,
    supersessionEventTrusted: false,
    supersessionPhase: null,
    supersessionInternalDepth: 0,
    supersessionInternalExpectationActive: false,
    supersessionPointerScrollArmed: false,
    supersessionMsAfterTopScroll: 0,
    supersessionScrollTopBefore: 0,
    supersessionScrollTopAfter: 0,
    supersessionExpectedInternalTop: 0,
    supersessionReason: null,
    reconcileState: 'idle',
    reconcileReason: null,
    reconcileAuthorityProbes: 0,
    reconcileScrollWakeups: 0,
    reconcileScheduledProbes: 0,
    reconcileStartedAtNavigationMs: 0,
    reconcileLastProbeAtNavigationMs: 0,
    reconcileTerminalElapsedMs: 0,
    reconcileRetryTask: null,
    reconcileRetryPending: false,
    reconcileRetryGeneration: 0,
    readinessAuthorityProbes: 0,
    readinessScheduledProbes: 0,
    restoreRan: false,
    driftField: null,
    driftHard: false,
    mountedQId: null,
    mountedAId: null,
    pagerPresent: false,
  };

  // Scope pin. Every asynchronous continuation re-checks this before acting.
  function chatAtlasRevealCurrentPin(target) {
    return Object.freeze({
      chatId: String(completeTurnIndexAuthorityState.chatId || ''),
      routeKey: String(completeTurnIndexAuthorityState.routeKey || ''),
      generation: Number(completeTurnIndexAuthorityState.generation || 0),
      graphCaptureIdentity: String(selectedPathAcquisitionState.graph?.captureIdentity || ''),
      defaultTerminalId: chatAtlasDefaultOverlayState.terminalNodeId || null,
      targetOrder: Number(target?.order || 0),
      targetQId: target?.qId || null,
      targetCurrentAId: target?.currentAId || null,
      targetExpectedAId: target?.expectedAId || null,
      divergenceFingerprint: `${Number(target?.order || 0)}:${target?.qId || ''}:${target?.currentAId || ''}:${target?.expectedAId || ''}`,
    });
  }

  // Scope drift, classified. Scrolling to reveal a virtualized turn MOUNTS
  // turns, which re-captures the graph and moves the divergence projection —
  // churn we caused ourselves. Treating that as invalidation aborted the
  // transaction between the scroll and its compensating restore. Only page
  // identity is hard.
  function chatAtlasRevealScopeDrift() {
    const pin = chatAtlasRevealState.pin;
    const none = Object.freeze({ hard: false, soft: false, field: null });
    if (!pin) return Object.freeze({ hard: true, soft: false, field: 'transaction-missing' });
    if (chatAtlasRevealState.superseded === true) {
      return Object.freeze({ hard: true, soft: false, field: 'user-superseded' });
    }
    const now = chatAtlasRevealCurrentPin({
      order: pin.targetOrder,
      qId: pin.targetQId,
      currentAId: pin.targetCurrentAId,
      expectedAId: pin.targetExpectedAId,
    });
    if (now.chatId !== pin.chatId) return Object.freeze({ hard: true, soft: false, field: 'chatId' });
    if (now.routeKey !== pin.routeKey) return Object.freeze({ hard: true, soft: false, field: 'routeKey' });
    if (now.generation !== pin.generation) return Object.freeze({ hard: true, soft: false, field: 'generation' });
    // Soft: a direct consequence of the reveal itself. The pinned target
    // identities are retained and measurement continues.
    if (now.graphCaptureIdentity !== pin.graphCaptureIdentity) {
      return Object.freeze({ hard: false, soft: true, field: 'graphCaptureIdentity' });
    }
    if (now.defaultTerminalId !== pin.defaultTerminalId) {
      return Object.freeze({ hard: false, soft: true, field: 'defaultTerminalId' });
    }
    // The LIVE first-divergence projection, not a rebuild of the pin's own
    // values. Mounting the target moves this projection, which is soft churn:
    // the transaction keeps its original pinned identities.
    const liveFingerprint = `${Number(chatAtlasDefaultOverlayState.revealTargetOrder || 0)}:${chatAtlasDefaultOverlayState.revealTargetQId || ''}:${chatAtlasDefaultOverlayState.revealTargetCurrentAId || ''}:${chatAtlasDefaultOverlayState.revealTargetExpectedAId || ''}`;
    if (liveFingerprint !== pin.divergenceFingerprint) {
      return Object.freeze({ hard: false, soft: true, field: 'divergenceFingerprint' });
    }
    return none;
  }

  function chatAtlasRevealScopeValid() {
    const drift = chatAtlasRevealScopeDrift();
    return drift.hard !== true;
  }

  // Restoration is permitted whenever we moved the page and it is still safe
  // and meaningful to move it back.
  function chatAtlasRevealRestorePermitted() {
    if (chatAtlasRevealState.topScrollExecuted !== true) return false;
    if (chatAtlasRevealState.restoreRan === true) return false;
    if (chatAtlasRevealState.superseded === true) return false;
    const drift = chatAtlasRevealScopeDrift();
    if (drift.hard === true) return false;
    const container = chatAtlasRevealState.container || null;
    if (!container) return false;
    if (container.isConnected === false) return false;
    return true;
  }

  // Terminal exit. The compensating restore ALWAYS runs first when permitted:
  // no terminal state may be written while the page is still where our scroll
  // left it.
  function chatAtlasRevealTerminate(state, reason) {
    if (chatAtlasRevealRestorePermitted()) {
      chatAtlasRevealState.restoreRan = true;
      chatAtlasRevealRestore(chatAtlasRevealState.container);
    } else if (chatAtlasRevealState.topScrollExecuted === true
      && chatAtlasRevealState.restoreState === 'idle') {
      const drift = chatAtlasRevealScopeDrift();
      chatAtlasRevealState.restoreState = 'skipped';
      chatAtlasRevealState.restoreReason = chatAtlasRevealState.superseded === true
        ? 'restore-superseded'
        : (drift.hard === true ? `restore-unsafe:${drift.field}` : 'restore-container-unavailable');
    }
    return chatAtlasRevealFinish(state, reason);
  }

  function chatAtlasRevealClearListeners() {
    for (const entry of chatAtlasRevealState.listeners.splice(0)) {
      try { entry.target?.removeEventListener?.(entry.type, entry.handler, entry.options); } catch {}
    }
  }

  // ONLY these prove a human moved the page. A bare movement signal — a
  // `scroll` event, a virtualization relayout, our own programmatic scroll —
  // is never intent, however trusted the event object says it is.
  const CHAT_ATLAS_REVEAL_GENUINE_INTENT = Object.freeze([
    'wheel', 'touchstart', 'touchmove', 'user-key', 'scrollbar-pointer',
    'manual-branch-selection', 'minimap-navigation',
  ]);

  function chatAtlasRevealIsGenuineIntent(source) {
    return CHAT_ATLAS_REVEAL_GENUINE_INTENT.includes(String(source || ''));
  }

  function chatAtlasRevealRecordSupersessionAttempt(source, detail = {}) {
    const st = chatAtlasRevealState;
    const container = st.container || null;
    st.supersessionSource = String(source || '');
    st.supersessionEventType = String(detail.eventType || '') || null;
    st.supersessionEventTrusted = detail.trusted === true;
    st.supersessionPhase = String(st.movementPhase || st.transactionState || 'idle');
    st.supersessionInternalDepth = Number(st.internalDepth || 0);
    st.supersessionInternalExpectationActive = chatAtlasRevealInternalMovementActive();
    st.supersessionPointerScrollArmed = detail.pointerScrollArmed === true;
    st.supersessionScrollTopBefore = Number(st.movementFromTop || 0);
    st.supersessionScrollTopAfter = container ? Number(container.scrollTop || 0) : 0;
    st.supersessionExpectedInternalTop = Number(st.movementExpectedTop || 0);
    const activatedAt = Number(st.movementActivatedAtMs || 0);
    st.supersessionMsAfterTopScroll = activatedAt
      ? Math.max(0, chatAtlasRevealNavigationMs() - activatedAt)
      : 0;
  }

  function chatAtlasRevealSupersede(by = 'user-action', detail = {}) {
    if (chatAtlasRevealState.transactionState === 'idle') return false;
    if (chatAtlasRevealIsGenuineIntent(by)) chatAtlasRevealCancelReconcileRetry();
    chatAtlasRevealRecordSupersessionAttempt(by, detail);
    if (!chatAtlasRevealIsGenuineIntent(by)) {
      // Recorded for diagnostics, but it does not end the transaction.
      chatAtlasRevealState.supersessionReason = 'ignored-not-user-intent';
      return false;
    }
    chatAtlasRevealState.supersessionReason = 'genuine-user-intent';
    chatAtlasRevealCancelReadinessRetry();
    chatAtlasRevealState.superseded = true;
    chatAtlasRevealState.supersededBy = by;
    chatAtlasRevealState.transactionState = 'superseded';
    chatAtlasRevealState.reason = 'reveal-superseded-by-user-scroll';
    chatAtlasRevealClearListeners();
    return true;
  }

  // A bounded, transaction-scoped expectation that OUR movement is about to
  // land. The old synchronous flag cleared before the browser delivered the
  // asynchronous scroll signal, so our own scroll looked like the user's.
  function chatAtlasRevealArmInternalMovement(phase, expectedTop, fromTop) {
    const st = chatAtlasRevealState;
    st.movementPhase = String(phase || '');
    st.movementExpectedTop = Number(expectedTop || 0);
    st.movementFromTop = Number(fromTop || 0);
    st.movementActivatedAtMs = chatAtlasRevealNavigationMs();
    st.movementToken = String(st.token || '');
    st.movementConsumed = false;
    return st.movementPhase;
  }

  function chatAtlasRevealInternalMovementActive() {
    const st = chatAtlasRevealState;
    if (!st.movementPhase) return false;
    if (st.movementConsumed === true) return false;
    if (String(st.movementToken || '') !== String(st.token || '')) return false;
    // Bounded by the existing reconciliation, never by a timer.
    return Number(st.ticks || 0) <= CHAT_ATLAS_REVEAL_RECONCILE_TICKS;
  }

  function chatAtlasRevealConsumeInternalMovement(source = 'scroll') {
    const st = chatAtlasRevealState;
    if (!chatAtlasRevealInternalMovementActive()) return false;
    st.movementConsumed = true;
    st.movementConsumedBy = String(source || '');
    return true;
  }

  function chatAtlasRevealClearInternalMovement() {
    const st = chatAtlasRevealState;
    st.movementPhase = null;
    st.movementConsumed = true;
    st.movementToken = '';
  }

  function chatAtlasRevealFreezeReconcile(terminalState) {
    const st = chatAtlasRevealState;
    if (Number(st.reconcileTerminalElapsedMs || 0) > 0) return false;
    const started = Number(st.reconcileStartedAtNavigationMs || 0);
    st.reconcileTerminalElapsedMs = started
      ? Math.max(1, chatAtlasRevealNavigationMs() - started)
      : 1;
    st.reconcileState = 'terminal';
    st.reconcileReason = String(terminalState || '') || null;
    return true;
  }

  function chatAtlasRevealFinish(state, reason) {
    chatAtlasRevealCancelReadinessRetry();
    chatAtlasRevealCancelReconcileRetry();
    if (chatAtlasRevealState.topScrollExecuted === true) chatAtlasRevealFreezeReconcile(state);
    chatAtlasRevealClearInternalMovement();
    chatAtlasRevealState.transactionState = state;
    chatAtlasRevealState.reason = reason;
    chatAtlasRevealClearListeners();
    return Object.freeze({ ok: state === 'target-mounted', state, reason });
  }

  // Our own scroll and restore movements must not look like the user's.
  function chatAtlasRevealInternal(run) {
    chatAtlasRevealState.internalDepth += 1;
    try { return run(); } finally {
      chatAtlasRevealState.internalDepth = Math.max(0, chatAtlasRevealState.internalDepth - 1);
    }
  }

  function chatAtlasRevealInstallUserListeners(container) {
    chatAtlasRevealClearListeners();
    // Each event is classified on its own terms; only proven intent supersedes.
    const onIntent = (type) => (event) => {
      chatAtlasRevealSupersede(type, { eventType: type, trusted: event?.isTrusted === true });
    };
    // A bare scroll signal only CONSUMES our pending internal movement. It can
    // never supersede — this is the exact false positive being removed.
    const onScroll = (event) => {
      chatAtlasRevealConsumeInternalMovement('scroll');
      chatAtlasRevealRecordSupersessionAttempt('scroll-observed', {
        eventType: 'scroll', trusted: event?.isTrusted === true,
      });
      chatAtlasRevealState.supersessionReason = 'ignored-not-user-intent';
      // A movement signal is not intent, but it IS a reason to look again.
      try { chatAtlasRevealReconcileTick('scroll'); } catch {}
    };
    // A pointer press is scrollbar intent only in the gutter, not anywhere in
    // the conversation body.
    const onPointer = (event) => {
      let armed = false;
      try {
        const rect = container.getBoundingClientRect?.();
        const x = Number(event?.clientX);
        armed = !!rect && Number.isFinite(x)
          && (x - Number(rect.left || 0)) > Number(container.clientWidth || 0);
      } catch { armed = false; }
      if (!armed) {
        chatAtlasRevealRecordSupersessionAttempt('pointer-in-content', {
          eventType: 'pointerdown', trusted: event?.isTrusted === true, pointerScrollArmed: false,
        });
        chatAtlasRevealState.supersessionReason = 'ignored-not-user-intent';
        return;
      }
      chatAtlasRevealSupersede('scrollbar-pointer', {
        eventType: 'pointerdown', trusted: event?.isTrusted === true, pointerScrollArmed: true,
      });
    };
    const onKey = (event) => {
      const key = String(event?.key || '');
      if (![
        'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar',
      ].includes(key)) return;
      chatAtlasRevealSupersede('user-key', { eventType: 'keydown', trusted: event?.isTrusted === true });
    };
    const add = (target, type, handler, options) => {
      if (!target?.addEventListener) return;
      try {
        target.addEventListener(type, handler, options);
        chatAtlasRevealState.listeners.push({ target, type, handler, options });
      } catch {}
    };
    const passive = { passive: true };
    add(container, 'wheel', onIntent('wheel'), passive);
    add(container, 'touchstart', onIntent('touchstart'), passive);
    add(container, 'touchmove', onIntent('touchmove'), passive);
    add(container, 'pointerdown', onPointer, passive);
    add(container, 'scroll', onScroll, passive);
    add(W, 'keydown', onKey, true);
    return chatAtlasRevealState.listeners.length;
  }

  function chatAtlasRevealOpenTransaction(target) {
    chatAtlasRevealClearListeners();
    const container = chatAtlasResolveConversationScrollContainer();
    if (!container.ok) {
      // The CALLER decides whether this is terminal or merely early: at boot
      // the conversation has not mounted yet, and that is not a failure.
      chatAtlasRevealState.reason = container.reason;
      return Object.freeze({ ok: false, reason: container.reason, container: null });
    }
    const token = `reveal:${String(completeTurnIndexAuthorityState.chatId || '')}:${Number(completeTurnIndexAuthorityState.generation || 0)}:${target?.qId || ''}`;
    chatAtlasRevealState.token = token;
    chatAtlasRevealState.pin = chatAtlasRevealCurrentPin(target);
    chatAtlasRevealState.superseded = false;
    chatAtlasRevealState.supersededBy = null;
    chatAtlasRevealState.attempts = 0;
    chatAtlasRevealState.topScrollExecuted = false;
    chatAtlasRevealState.restoreState = 'idle';
    chatAtlasRevealState.restoreReason = null;
    chatAtlasRevealState.transactionState = 'open';
    chatAtlasRevealState.reason = null;
    chatAtlasRevealInstallUserListeners(container.element);
    return Object.freeze({ ok: true, reason: null, token, container: container.element });
  }

  // Bookmark: canonical identity first, container scrollTop only as a fallback.
  function chatAtlasRevealCaptureBookmark(container) {
    const scrollTop = Number(container?.scrollTop || 0);
    const base = { kind: 'scroll-top', turnId: null, offset: 0, scrollTop, captured: true };
    let sections = [];
    try {
      sections = Array.from(container?.querySelectorAll?.('[data-testid^="conversation-turn-"]') || []);
    } catch { sections = []; }
    let containerTop = 0;
    try { containerTop = Number(container?.getBoundingClientRect?.().top || 0); } catch {}
    for (const section of sections) {
      let qEl = null;
      try { qEl = section.querySelector?.('[data-message-author-role="user"][data-message-id]') || null; } catch {}
      const qId = chatAtlasCompleteIndexIdentity(qEl?.getAttribute?.('data-message-id'));
      if (!qId) continue;
      // Measure the SAME element restoration resolves. Capturing the turn
      // section while restoring the inner message element made them disagree
      // by the section's leading layout — the observed 998 px miss.
      let top = null;
      try { top = Number(qEl.getBoundingClientRect?.().top); } catch { top = null; }
      if (!Number.isFinite(top)) continue;
      if (top - containerTop < -1) continue;
      base.kind = 'canonical-turn';
      base.turnId = qId;
      base.offset = Math.round(top - containerTop);
      break;
    }
    chatAtlasRevealState.bookmark = chatAtlasFreeze(base);
    return chatAtlasRevealState.bookmark;
  }

  const CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX = 2;

  function chatAtlasRevealRestore(container) {
    const record = (state, reason, method = null, targetId = null, offset = 0) => {
      chatAtlasRevealState.restoreState = state;
      chatAtlasRevealState.restoreReason = reason;
      chatAtlasRevealState.restoreMethod = method;
      chatAtlasRevealState.restoreTargetId = targetId;
      chatAtlasRevealState.restoreOffset = offset;
      return Object.freeze({ ok: state === 'restored', state, reason, method });
    };
    const bookmark = chatAtlasRevealState.bookmark;
    if (!bookmark) return record('skipped', 'reveal-bookmark-missing');
    if (chatAtlasRevealState.superseded === true) return record('skipped', 'restore-superseded');
    if (!chatAtlasRevealScopeValid()) return record('skipped', 'reveal-scope-drift');
    if (!container) return record('failed', 'reveal-container-unavailable');
    // Restoration is a viewport movement only: it never touches branch
    // authority, MiniMap navigation, flashing or manual-override state.
    chatAtlasRevealArmInternalMovement('restore-bookmark',
      Number(bookmark.scrollTop || 0), Number(container.scrollTop || 0));
    return chatAtlasRevealInternal(() => {
      if (bookmark.kind === 'canonical-turn' && bookmark.turnId) {
        const wanted = Number(bookmark.offset || 0);
        const resolve = () => {
          try {
            const all = Array.from(container.querySelectorAll?.(
              `[data-message-author-role="user"][data-message-id="${bookmark.turnId}"]`,
            ) || []);
            if (all.length > 1) return 'ambiguous';
            return all[0] || null;
          } catch { return null; }
        };
        const offsetOf = (el) => Number(el.getBoundingClientRect?.().top || 0)
          - Number(container.getBoundingClientRect?.().top || 0);
        const first = resolve();
        if (first === 'ambiguous') {
          chatAtlasRevealState.restoreCorrectionReason = 'canonical-anchor-ambiguous';
        } else if (first) {
          try {
            const requested = Number(container.scrollTop || 0) + (offsetOf(first) - wanted);
            chatAtlasRevealState.restoreRequestedScrollTop = requested;
            container.scrollTop = requested;
            chatAtlasRevealState.restoreFirstMeasuredScrollTop = Number(container.scrollTop || 0);
            // Verify against the ORIGINAL bookmark: layout may have shifted or
            // the browser's scroll anchoring may have moved the position.
            const again = resolve();
            const settled = again && again !== 'ambiguous' ? again : first;
            let measured = offsetOf(settled);
            let error = Math.round(measured - wanted);
            if (Math.abs(error) > CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX) {
              chatAtlasRevealState.restoreCorrectionAttempts = 1;
              chatAtlasRevealState.restoreCorrectionReason = 'offset-error-corrected';
              container.scrollTop = Number(container.scrollTop || 0) + error;
              measured = offsetOf(settled);
              error = Math.round(measured - wanted);
            }
            chatAtlasRevealState.restoreMeasuredOffset = Math.round(measured);
            chatAtlasRevealState.restoreOffsetError = error;
            chatAtlasRevealState.restoreFinalScrollTop = Number(container.scrollTop || 0);
            if (Math.abs(error) > CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX) {
              return record('failed', 'reveal-restore-failed', 'canonical-turn', bookmark.turnId, wanted);
            }
            return record('restored', null, 'canonical-turn', bookmark.turnId, wanted);
          } catch {
            return record('failed', 'reveal-restore-failed', 'canonical-turn', bookmark.turnId, wanted);
          }
        } else {
          chatAtlasRevealState.restoreCorrectionReason = 'canonical-anchor-missing';
        }
      }
      const wantedTop = Number(bookmark.scrollTop || 0);
      try {
        chatAtlasRevealState.restoreRequestedScrollTop = wantedTop;
        container.scrollTop = wantedTop;
        chatAtlasRevealState.restoreFirstMeasuredScrollTop = Number(container.scrollTop || 0);
        let error = Math.round(Number(container.scrollTop || 0) - wantedTop);
        if (Math.abs(error) > CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX) {
          chatAtlasRevealState.restoreCorrectionAttempts = 1;
          chatAtlasRevealState.restoreCorrectionReason = 'scroll-top-error-corrected';
          container.scrollTop = Number(container.scrollTop || 0) - error;
          error = Math.round(Number(container.scrollTop || 0) - wantedTop);
        }
        chatAtlasRevealState.restoreOffsetError = error;
        if (Math.abs(error) > CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX) {
          chatAtlasRevealState.restoreFinalScrollTop = Number(container.scrollTop || 0);
          return record('failed', 'reveal-restore-failed', 'scroll-top', null, wantedTop);
        }
      } catch {
        return record('failed', 'reveal-restore-failed', 'scroll-top', null, wantedTop);
      }
      chatAtlasRevealState.restoreFinalScrollTop = Number(container.scrollTop || 0);
      return record('restored', null, 'scroll-top', null, wantedTop);
    });
  }

  // Exact mounted-target proof. Requires the target question, a paired
  // assistant identity and an unambiguous regeneration pager owned by that
  // exact pair. Mounting some other early turn is never success.
  // ── Passive pager audit (Stage 2C-2ah3) ───────────────────────────────────
  // Read-only structural capture. It never activates anything and never keeps
  // a DOM reference: only content-free counts, enums and hashes survive, so
  // the picture stays readable after restoration re-virtualizes the turn.
  const CHAT_ATLAS_PAGER_AUDIT_MAX_CANDIDATES = 24;

  // How far above an exact indicator we will look for controls before calling
  // them adjacent. A toolbar seven hops away is not a pager.
  const CHAT_ATLAS_PAGER_AUDIT_ADJACENCY_HOPS = 3;

  function chatAtlasPagerAuditRegions(answerSection) {
    const regions = [];
    const push = (region, el) => regions.push({ region, el: el || null });
    push('answer-section', answerSection);
    push('answer-section-parent', answerSection?.parentElement || null);
    push('previous-sibling-section', answerSection?.previousElementSibling || null);
    push('following-sibling-section', answerSection?.nextElementSibling || null);
    let wrapper = null;
    try {
      wrapper = answerSection?.parentElement?.closest?.('[data-testid^="conversation-turn-"]') || null;
    } catch { wrapper = null; }
    if (wrapper && wrapper !== answerSection) push('conversation-turn-wrapper', wrapper);
    return regions;
  }

  function chatAtlasPagerAuditButtonLike(node) {
    if (!node || node.nodeType !== 1) return false;
    if (String(node.tagName || '').toUpperCase() === 'BUTTON') return true;
    return String(node.getAttribute?.('role') || '').trim().toLowerCase() === 'button';
  }

  // Content-free structural summary of ONE unique control. Every button-like
  // node is recorded, including ones with no aria-label, title, test id or
  // role — an unlabelled icon control must never silently disappear.
  function chatAtlasPagerAuditControl(node, ordinal, regions, targetAId, root) {
    const label = String(node?.getAttribute?.('aria-label') || '').trim();
    const title = String(node?.getAttribute?.('title') || '').trim();
    const testId = String(node?.getAttribute?.('data-testid') || '').trim();
    const lower = label.toLowerCase();
    const exactPrevious = lower === 'previous response';
    const exactNext = lower === 'next response';
    let svg = false;
    let childCount = 0;
    try {
      childCount = Number(node?.children?.length || 0);
      svg = Array.from(node?.querySelectorAll?.('*') || [])
        .some((n) => String(n?.tagName || '').toLowerCase() === 'svg');
    } catch {}
    let indicatorHops = -1;
    let group = node;
    for (let hop = 0; hop < 8 && group; hop += 1) {
      if (chatAtlasConvergenceExactIndicator(group)) { indicatorHops = hop; break; }
      group = group.parentElement || null;
    }
    let owner = null;
    let ownerMethod = 'none';
    try { owner = node.closest?.('[data-message-id]') || null; } catch {}
    if (owner) ownerMethod = 'closest-message-id';
    if (!owner && root) {
      let ordered = [];
      try { ordered = Array.from(root.querySelectorAll?.('[data-message-id], button, [role="button"]') || []); } catch {}
      let last = null;
      for (const entry of ordered) {
        if (entry === node) break;
        if (chatAtlasCompleteIndexIdentity(entry?.getAttribute?.('data-message-id'))) last = entry;
      }
      if (last) { owner = last; ownerMethod = 'section-document-order'; }
    }
    if (!owner) {
      try {
        owner = node.closest?.('[data-testid^="conversation-turn-"]')
          ?.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null;
      } catch { owner = null; }
      if (owner) ownerMethod = 'sibling-assistant';
    }
    const ownerId = chatAtlasCompleteIndexIdentity(owner?.getAttribute?.('data-message-id')) || '';
    const ownerRole = String(owner?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase() || 'unknown';
    const ownerMatch = !owner
      ? 'unknown'
      : (ownerId === chatAtlasCompleteIndexIdentity(targetAId)
        ? 'target-answer'
        : (ownerRole === 'user' ? 'question' : 'other-answer'));
    return Object.freeze({
      ordinal,
      regions: Object.freeze(regions.slice()),
      tag: String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
      disabled: node?.disabled === true || node?.getAttribute?.('aria-disabled') === 'true',
      ariaLabelPresent: !!label,
      ariaLabelHash: chatAtlasPagerAuditHash(label),
      titlePresent: !!title,
      titleHash: chatAtlasPagerAuditHash(title),
      testIdPresent: !!testId,
      testIdHash: chatAtlasPagerAuditHash(testId),
      role: String(node?.getAttribute?.('role') || '').trim().toLowerCase() || null,
      svgChild: svg,
      childCount,
      exactPrevious,
      exactNext,
      directionWords: Object.freeze(CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS.filter((w) => lower.includes(w))),
      indicatorFound: indicatorHops >= 0,
      indicatorHops,
      ownerMethod,
      ownerMatch,
      ownerRole,
      hasAnyLabelSignal: !!(label || title || testId),
    });
  }

  function chatAtlasPagerAuditStructuralTag(node) {
    if (!node) return null;
    return String(node.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null;
  }

  function chatAtlasRevealAuditPager(row) {
    const targetAId = chatAtlasCompleteIndexIdentity(row?.mountedAId);
    const answerSection = row?.answerSection || row?.section || null;
    if (!answerSection || !targetAId) {
      chatAtlasRevealState.pagerAudit = chatAtlasFreeze({
        state: 'skipped', reason: 'audit-target-unavailable',
        targetMounted: !!row?.mountedQId, assistantMounted: !!targetAId,
        regions: [], controls: [], indicators: [], adjacent: [], totals: {},
        failureClass: 'insufficient-pager-structure',
      });
      return chatAtlasRevealState.pagerAudit;
    }
    // ── Deduplicate by DOM node identity across overlapping regions ────────
    const byNode = new Map();
    const regions = [];
    let rawOccurrences = 0;
    for (const { region, el } of chatAtlasPagerAuditRegions(answerSection)) {
      let buttons = [];
      let indicators = 0;
      if (el) {
        try { buttons = Array.from(el.querySelectorAll?.('*') || []).filter(chatAtlasPagerAuditButtonLike); } catch { buttons = []; }
        try {
          indicators = Array.from(el.querySelectorAll?.('*') || [])
            .filter((n) => /^\d+\s*\/\s*\d+$/.test(String(n?.textContent || '').trim())).length;
        } catch { indicators = 0; }
      }
      for (const node of buttons) {
        rawOccurrences += 1;
        const entry = byNode.get(node) || { node, regions: [], root: el };
        if (!entry.regions.includes(region)) entry.regions.push(region);
        if (region === 'answer-section') entry.root = el;
        byNode.set(node, entry);
      }
      regions.push(Object.freeze({
        region, present: !!el, buttonCount: buttons.length, indicatorCount: indicators,
      }));
    }
    const uniqueNodes = Array.from(byNode.values()).slice(0, CHAT_ATLAS_PAGER_AUDIT_MAX_CANDIDATES);
    const ordinalOf = new Map();
    const controls = uniqueNodes.map((entry, index) => {
      ordinalOf.set(entry.node, index);
      return chatAtlasPagerAuditControl(entry.node, index, entry.regions, targetAId, entry.root || answerSection);
    });

    // ── Exact indicators and the controls genuinely grouped with them ──────
    const indicatorNodes = [];
    const seenIndicator = new Set();
    for (const { region, el } of chatAtlasPagerAuditRegions(answerSection)) {
      if (!el) continue;
      let all = [];
      try { all = Array.from(el.querySelectorAll?.('*') || []); } catch { all = []; }
      for (const n of all) {
        if (seenIndicator.has(n)) continue;
        if (!/^\d+\s*\/\s*\d+$/.test(String(n?.textContent || '').trim())) continue;
        if (Number(n?.children?.length || 0) > 0) continue;   // innermost only
        seenIndicator.add(n);
        indicatorNodes.push({ node: n, region });
      }
    }
    const adjacent = [];
    const adjacentNodes = new Set();
    const indicators = indicatorNodes.map((entry, index) => {
      const node = entry.node;
      const parent = node.parentElement || null;
      const siblings = parent?.children || [];
      const indexInParent = Array.prototype.indexOf.call(siblings, node);
      // Smallest ancestor, within a bounded hop count, that actually contains
      // button-like controls. A numeric element seven hops from a toolbar is
      // NOT adjacency.
      let group = parent;
      let groupHops = 1;
      let groupButtons = [];
      for (let hop = 0; hop < CHAT_ATLAS_PAGER_AUDIT_ADJACENCY_HOPS && group; hop += 1) {
        let found = [];
        try { found = Array.from(group.querySelectorAll?.('*') || []).filter(chatAtlasPagerAuditButtonLike); } catch { found = []; }
        if (found.length) { groupButtons = found; groupHops = hop + 1; break; }
        group = group.parentElement || null;
      }
      let parentButtons = [];
      try { parentButtons = Array.from(parent?.querySelectorAll?.('*') || []).filter(chatAtlasPagerAuditButtonLike); } catch {}
      let resolverHops = -1;
      let probe = node;
      for (let hop = 0; hop < 8 && probe; hop += 1) {
        if (chatAtlasConvergenceExactIndicator(probe)) { resolverHops = hop; break; }
        probe = probe.parentElement || null;
      }
      for (const btn of groupButtons) {
        if (adjacentNodes.has(btn)) continue;
        adjacentNodes.add(btn);
        const btnIndex = Array.prototype.indexOf.call(siblings, btn);
        let position = 'other';
        try {
          if (node.contains?.(btn)) position = 'descendant';
          else if (btnIndex >= 0 && indexInParent >= 0) position = btnIndex < indexInParent ? 'before-indicator' : 'after-indicator';
        } catch {}
        const control = controls.find((c) => c.ordinal === ordinalOf.get(btn)) || null;
        const label = String(btn?.getAttribute?.('aria-label') || '').trim().toLowerCase();
        adjacent.push(Object.freeze({
          indicatorOrdinal: index,
          buttonOrdinal: ordinalOf.has(btn) ? ordinalOf.get(btn) : -1,
          position,
          ariaLabelHash: chatAtlasPagerAuditHash(btn?.getAttribute?.('aria-label')),
          titleHash: chatAtlasPagerAuditHash(btn?.getAttribute?.('title')),
          testIdHash: chatAtlasPagerAuditHash(btn?.getAttribute?.('data-testid')),
          hasAnyLabelSignal: !!(btn?.getAttribute?.('aria-label') || btn?.getAttribute?.('title') || btn?.getAttribute?.('data-testid')),
          exactContractLabel: label === 'previous response' || label === 'next response',
          disabled: btn?.disabled === true,
          svgChild: control ? control.svgChild : false,
          ownerMatch: control ? control.ownerMatch : 'unknown',
          region: control && control.regions.includes('answer-section') ? 'answer-section' : (control?.regions?.[0] || entry.region),
          resolverRecognized: label === 'previous response' || label === 'next response',
        }));
      }
      return Object.freeze({
        ordinal: index,
        region: entry.region,
        tag: chatAtlasPagerAuditStructuralTag(node),
        parentTag: chatAtlasPagerAuditStructuralTag(parent),
        exactPattern: true,
        resolverHops,
        siblingCount: siblings.length,
        indexInParent,
        previousSiblingTag: chatAtlasPagerAuditStructuralTag(siblings[indexInParent - 1] || null),
        nextSiblingTag: chatAtlasPagerAuditStructuralTag(siblings[indexInParent + 1] || null),
        previousButtonOrdinal: (() => {
          for (let i = indexInParent - 1; i >= 0; i -= 1) {
            if (chatAtlasPagerAuditButtonLike(siblings[i]) && ordinalOf.has(siblings[i])) return ordinalOf.get(siblings[i]);
          }
          return -1;
        })(),
        nextButtonOrdinal: (() => {
          for (let i = indexInParent + 1; i < siblings.length; i += 1) {
            if (chatAtlasPagerAuditButtonLike(siblings[i]) && ordinalOf.has(siblings[i])) return ordinalOf.get(siblings[i]);
          }
          return -1;
        })(),
        parentButtonCount: parentButtons.length,
        groupButtonCount: groupButtons.length,
        groupHops,
      });
    });

    // The UNCHANGED resolver, for comparison only.
    let entries = [];
    try { entries = chatAtlasNativeVariantPagers(answerSection) || []; } catch { entries = []; }
    const owned = entries.filter((e) => e.kind === 'assistant-regeneration' && e.ownerId === targetAId);
    const distinctOwners = new Set(entries.map((e) => String(e.ownerId || ''))).size;

    // ── Aggregates on RAW structural evidence ─────────────────────────────
    const recognized = controls.filter((c) => c.exactPrevious || c.exactNext);
    const ownerMatched = controls.filter((c) => c.ownerMatch === 'target-answer');
    const adjacentLabelled = adjacent.filter((a) => a.hasAnyLabelSignal);
    const adjacentContract = adjacent.filter((a) => a.exactContractLabel);
    const adjacentInRoot = adjacent.filter((a) => a.region === 'answer-section');
    const adjacentOwned = adjacent.filter((a) => a.ownerMatch === 'target-answer');

    // ── Evidence-based classification, anchored on the INDICATOR ──────────
    // Generic toolbar buttons that merely share a distant ancestor with a
    // number are never treated as relabelled pager controls.
    let failureClass = 'insufficient-pager-structure';
    if (owned.length === 1) failureClass = 'pager-resolver-should-have-succeeded';
    else if (!indicators.length) failureClass = 'pager-indicator-absent';
    else if (!adjacent.length) failureClass = 'pager-controls-absent';
    else if (!adjacentLabelled.length) failureClass = 'pager-controls-unlabeled';
    else if (!adjacentInRoot.length) failureClass = 'pager-outside-answer-section';
    else if (!adjacentContract.length) failureClass = 'pager-label-contract-mismatch';
    else if (!adjacentOwned.length) failureClass = 'pager-ownership-contract-mismatch';
    else if (owned.length > 1 || distinctOwners > 1) failureClass = 'pager-resolver-ambiguity';

    chatAtlasRevealState.pagerAudit = chatAtlasFreeze({
      state: 'captured',
      reason: null,
      targetMounted: true,
      assistantMounted: true,
      regions: regions.slice(),
      controls: controls.slice(),
      indicators: indicators.slice(),
      adjacent: adjacent.slice(),
      totals: {
        regionCount: regions.length,
        rawButtonOccurrences: rawOccurrences,
        uniqueButtonCount: byNode.size,
        duplicateOccurrenceCount: Math.max(0, rawOccurrences - byNode.size),
        uniqueCandidateCount: controls.length,
        totalButtons: rawOccurrences,
        candidateCount: controls.length,
        recognizedLabelCount: recognized.length,
        indicatorCount: indicators.length,
        ownerMatchCount: ownerMatched.length,
        adjacentControlCount: adjacent.length,
        adjacentLabelledCount: adjacentLabelled.length,
        adjacentContractCount: adjacentContract.length,
        resolverEntryCount: entries.length,
        resolverOwnedCount: owned.length,
        resolverDistinctOwners: distinctOwners,
      },
      failureClass,
    });
    return chatAtlasRevealState.pagerAudit;
  }

  // ── Container-wide passive pager locator (Stage 2C-2ah5) ─────────────────
  // Widens the search from one section to the PROVEN conversation container
  // plus bounded overlay roots, and calibrates against any genuine pager that
  // exists elsewhere. Read-only: no clicks, focus, hover or scrolling.
  const CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS = 40;

  const CHAT_ATLAS_PAGER_LOCATOR_NEAR_PX = 400;

  function chatAtlasPagerLocatorRect(el) {
    try {
      const r = el?.getBoundingClientRect?.();
      if (!r) return null;
      return {
        top: Math.round(Number(r.top || 0)),
        left: Math.round(Number(r.left || 0)),
        width: Math.round(Number(r.width || 0)),
        height: Math.round(Number(r.height || 0)),
      };
    } catch { return null; }
  }

  // Content-free shape of an icon: viewBox and ordered path hashes only.
  function chatAtlasPagerLocatorSvgSignature(node) {
    let svgs = [];
    try { svgs = Array.from(node?.querySelectorAll?.('*') || []).filter((n) => String(n?.tagName || '').toLowerCase() === 'svg'); } catch {}
    if (!svgs.length) return Object.freeze({ svgCount: 0, viewBoxHash: null, pathCount: 0, pathHashes: Object.freeze([]) });
    const svg = svgs[0];
    let paths = [];
    try { paths = Array.from(svg.querySelectorAll?.('*') || []).filter((n) => String(n?.tagName || '').toLowerCase() === 'path'); } catch {}
    return Object.freeze({
      svgCount: svgs.length,
      viewBoxHash: chatAtlasPagerAuditHash(svg.getAttribute?.('viewBox')),
      pathCount: paths.length,
      pathHashes: Object.freeze(paths.slice(0, 6).map((n) => chatAtlasPagerAuditHash(n.getAttribute?.('d')))),
    });
  }

  function chatAtlasPagerLocatorSignatureKey(sig) {
    return `${sig.viewBoxHash || ''}|${sig.pathCount}|${(sig.pathHashes || []).join(',')}`;
  }

  function chatAtlasPagerLocatorOwner(node, targetAId) {
    let owner = null;
    let method = 'none';
    try { owner = node.closest?.('[data-message-id]') || null; } catch {}
    if (owner) method = 'closest-message-id';
    if (!owner) {
      try {
        owner = node.closest?.('[data-testid^="conversation-turn-"]')
          ?.querySelector?.('[data-message-author-role="assistant"][data-message-id]') || null;
      } catch { owner = null; }
      if (owner) method = 'sibling-assistant';
    }
    const id = chatAtlasCompleteIndexIdentity(owner?.getAttribute?.('data-message-id')) || '';
    const role = String(owner?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase() || 'unknown';
    return Object.freeze({
      method,
      role,
      match: !owner ? 'unknown'
        : (id === chatAtlasCompleteIndexIdentity(targetAId) ? 'target-answer'
          : (role === 'user' ? 'question' : 'other-answer')),
    });
  }

  function chatAtlasPagerLocatorControl(node, ordinal, region, targetAId, targetRect) {
    const label = String(node?.getAttribute?.('aria-label') || '').trim();
    const lower = label.toLowerCase();
    const title = String(node?.getAttribute?.('title') || '').trim();
    const testId = String(node?.getAttribute?.('data-testid') || '').trim();
    const rect = chatAtlasPagerLocatorRect(node);
    const sig = chatAtlasPagerLocatorSvgSignature(node);
    const owner = chatAtlasPagerLocatorOwner(node, targetAId);
    return Object.freeze({
      ordinal,
      region,
      tag: String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
      ariaLabelPresent: !!label,
      ariaLabelHash: chatAtlasPagerAuditHash(label),
      titlePresent: !!title,
      titleHash: chatAtlasPagerAuditHash(title),
      testIdPresent: !!testId,
      testIdHash: chatAtlasPagerAuditHash(testId),
      exactContractLabel: lower === 'previous response' || lower === 'next response',
      directionWords: Object.freeze(CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS.filter((w) => lower.includes(w))),
      disabled: node?.disabled === true,
      svg: sig,
      signatureKey: sig.svgCount ? chatAtlasPagerLocatorSignatureKey(sig) : null,
      width: rect ? rect.width : 0,
      height: rect ? rect.height : 0,
      distanceFromTargetPx: rect && targetRect ? Math.abs(rect.top - targetRect.top) : -1,
      ownerMethod: owner.method,
      ownerRole: owner.role,
      ownerMatch: owner.match,
      resolverAccepts: lower === 'previous response' || lower === 'next response',
    });
  }

  function chatAtlasPagerLocatorCapture(row) {
    const targetAId = chatAtlasCompleteIndexIdentity(row?.mountedAId);
    const answerSection = row?.answerSection || row?.section || null;
    const resolved = chatAtlasResolveConversationScrollContainer();
    const container = resolved.ok ? resolved.element : null;
    const store = (payload) => {
      chatAtlasRevealState.pagerLocator = chatAtlasFreeze(payload);
      return chatAtlasRevealState.pagerLocator;
    };
    if (!container || !targetAId || !answerSection) {
      return store({
        state: 'skipped', reason: 'locator-scope-unavailable', conclusion: 'insufficient-live-evidence',
        controls: [], indicators: [], knownPagerSignatures: [], overlayCandidates: [], totals: {}, visibility: {},
      });
    }
    let targetAnswerEl = null;
    try { targetAnswerEl = answerSection.querySelector?.(`[data-message-author-role="assistant"][data-message-id="${targetAId}"]`) || null; } catch {}
    const targetRect = chatAtlasPagerLocatorRect(targetAnswerEl || answerSection);

    // ── Container-wide census, deduplicated by DOM node ───────────────────
    const byNode = new Map();
    const addNode = (node, region) => {
      const entry = byNode.get(node) || { node, region };
      byNode.set(node, entry);
      return entry;
    };
    let all = [];
    try { all = Array.from(container.querySelectorAll?.('*') || []); } catch { all = []; }
    const indicators = [];
    let occurrences = 0;
    for (const node of all) {
      if (chatAtlasPagerAuditButtonLike(node)) {
        occurrences += 1;
        addNode(node, answerSection.contains?.(node) ? 'answer-section' : 'conversation-container');
        continue;
      }
      if (Number(node?.children?.length || 0) > 0) continue;
      if (!/^\d+\s*\/\s*\d+$/.test(String(node?.textContent || '').trim())) continue;
      if (indicators.length >= CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS) continue;
      const rect = chatAtlasPagerLocatorRect(node);
      const owner = chatAtlasPagerLocatorOwner(node, targetAId);
      indicators.push(Object.freeze({
        ordinal: indicators.length,
        region: answerSection.contains?.(node) ? 'answer-section' : 'conversation-container',
        tag: String(node?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
        parentTag: String(node?.parentElement?.tagName || '').toLowerCase().replace(/[^a-z0-9-]/g, '') || null,
        ownerMatch: owner.match,
        ownerRole: owner.role,
        distanceFromTargetPx: rect && targetRect ? Math.abs(rect.top - targetRect.top) : -1,
      }));
    }
    // ── Calibration: any pager the UNCHANGED resolver accepts anywhere ─────
    const knownSignatures = [];
    let knownPagerCount = 0;
    let knownAssistantPagerCount = 0;
    let resolverButtonOccurrences = 0;
    let sections = [];
    try { sections = Array.from(container.querySelectorAll?.('[data-testid^="conversation-turn-"]') || []); } catch {}
    for (const section of sections) {
      let entries = [];
      try { entries = chatAtlasNativeVariantPagers(section) || []; } catch { entries = []; }
      for (const entry of entries) {
        // Any genuine pager calibrates the icon contract — a question-edit
        // pager carries the same chevrons as a regeneration pager. Recording
        // the kind keeps the two distinguishable without narrowing the sample.
        if (!entry.previous && !entry.next) continue;
        knownPagerCount += 1;
        if (entry.kind === 'assistant-regeneration') knownAssistantPagerCount += 1;
        const btn = entry.previous || entry.next;
        // Mission B item 6: every resolver entry feeds the one census. These
        // buttons were already seen by the container sweep, so the DOM-node
        // dedupe is what keeps each of them a single record.
        for (const node of [entry.previous, entry.next]) {
          if (!node) continue;
          resolverButtonOccurrences += 1;
          addNode(node, answerSection.contains?.(node) ? 'answer-section' : 'conversation-container');
        }
        const sig = chatAtlasPagerLocatorSvgSignature(btn);
        const rect = chatAtlasPagerLocatorRect(btn);
        if (knownSignatures.length >= CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS) continue;
        knownSignatures.push(Object.freeze({
          ordinal: knownSignatures.length,
          kind: String(entry.kind || 'unknown'),
          ownerIsTarget: entry.ownerId === targetAId,
          labelHash: chatAtlasPagerAuditHash(btn?.getAttribute?.('aria-label')),
          svg: sig,
          signatureKey: sig.svgCount ? chatAtlasPagerLocatorSignatureKey(sig) : null,
          width: rect ? rect.width : 0,
          height: rect ? rect.height : 0,
          distanceFromTargetPx: rect && targetRect ? Math.abs(rect.top - targetRect.top) : -1,
        }));
      }
    }
    const controls = Array.from(byNode.values())
      .slice(0, CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS)
      .map((e, i) => chatAtlasPagerLocatorControl(e.node, i, e.region, targetAId, targetRect));

    const knownKeys = new Set(knownSignatures.map((k) => k.signatureKey).filter(Boolean));
    const signatureMatches = controls.filter((c) => c.signatureKey && knownKeys.has(c.signatureKey));
    const unlabelledTarget = controls.filter((c) => !c.ariaLabelPresent && !c.titlePresent
      && !c.testIdPresent && c.svg.svgCount > 0 && c.ownerMatch === 'target-answer');
    const unlabelledMatch = unlabelledTarget.some((c) => c.signatureKey && knownKeys.has(c.signatureKey));
    const nearestKnown = knownSignatures.reduce((best, k) => (
      k.distanceFromTargetPx >= 0 && (best < 0 || k.distanceFromTargetPx < best) ? k.distanceFromTargetPx : best
    ), -1);

    // ── Bounded overlay roots only: parent and its direct siblings ─────────
    const overlayCandidates = [];
    const overlayRoots = [];
    const parent = container.parentElement || null;
    // Sibling roots first, each including itself: the most specific bounded
    // root wins, so a sibling overlay layer is never reported as the parent's.
    for (const sib of Array.from(parent?.children || [])) {
      if (sib === container) continue;
      if (overlayRoots.length >= 6) break;
      overlayRoots.push({ root: 'container-sibling', el: sib, self: true });
    }
    if (parent) overlayRoots.push({ root: 'container-parent', el: parent, self: false });
    const overlaySeen = new Set();
    for (const { root, el, self } of overlayRoots) {
      let nodes = [];
      try { nodes = Array.from(el.querySelectorAll?.('*') || []); } catch { nodes = []; }
      if (self) nodes = [el].concat(nodes);
      for (const node of nodes) {
        if (overlayCandidates.length >= CHAT_ATLAS_PAGER_LOCATOR_MAX_ITEMS) break;
        if (overlaySeen.has(node)) continue;
        overlaySeen.add(node);
        if (container.contains?.(node)) continue;
        let position = '';
        try { position = String(W.getComputedStyle?.(node)?.position || ''); } catch {}
        if (position !== 'fixed' && position !== 'absolute') continue;
        let indicatorCount = 0;
        let directional = 0;
        try {
          const inner = Array.from(node.querySelectorAll?.('*') || []);
          indicatorCount = inner.filter((n) => /^\d+\s*\/\s*\d+$/.test(String(n?.textContent || '').trim())).length;
          directional = inner.filter((n) => chatAtlasPagerAuditButtonLike(n)
            && CHAT_ATLAS_PAGER_AUDIT_DIRECTION_WORDS.some((w) => String(n.getAttribute?.('aria-label') || '').toLowerCase().includes(w))).length;
        } catch {}
        if (!indicatorCount && !directional) continue;
        const rect = chatAtlasPagerLocatorRect(node);
        const distance = rect && targetRect ? Math.abs(rect.top - targetRect.top) : -1;
        overlayCandidates.push(Object.freeze({
          ordinal: overlayCandidates.length,
          root,
          proximity: distance >= 0 && distance <= CHAT_ATLAS_PAGER_LOCATOR_NEAR_PX ? 'near-target' : 'far',
          indicatorCount,
          directionalCount: directional,
          ownerMatch: chatAtlasPagerLocatorOwner(node, targetAId).match,
          distanceFromTargetPx: distance,
        }));
      }
    }

    // ── Visibility / conditional-UI signals (read-only) ────────────────────
    const containerRect = chatAtlasPagerLocatorRect(container);
    const visible = targetRect && containerRect
      ? Math.max(0, Math.min(targetRect.top + targetRect.height, containerRect.top + containerRect.height)
        - Math.max(targetRect.top, containerRect.top))
      : 0;
    const matchesState = (el, sel) => { try { return el?.matches?.(sel) === true; } catch { return false; } };
    const visibility = Object.freeze({
      intersectsViewport: visible > 0,
      visiblePercent: targetRect && targetRect.height
        ? Math.max(0, Math.min(100, Math.round((visible / targetRect.height) * 100))) : 0,
      hovered: matchesState(targetAnswerEl, ':hover'),
      focusWithin: matchesState(targetAnswerEl, ':focus-within'),
      targetWidth: targetRect ? targetRect.width : 0,
      targetHeight: targetRect ? targetRect.height : 0,
      distanceFromViewportTopPx: targetRect && containerRect ? targetRect.top - containerRect.top : -1,
    });

    const targetControls = controls.filter((c) => c.ownerMatch === 'target-answer');
    const containerExactLabels = controls.filter((c) => c.exactContractLabel);
    const containerDirectional = controls.filter((c) => c.directionWords.length || c.exactContractLabel);
    const containerUnlabelledSvg = controls.filter((c) => !c.ariaLabelPresent && !c.titlePresent
      && !c.testIdPresent && c.svg.svgCount > 0);
    // Pager-shaped and BELONGS to the target, but sits outside the answer root
    // the resolver searches — the resolver would never see it.
    const targetPagerOutsideRoot = containerDirectional.filter((c) => c.ownerMatch === 'target-answer'
      && c.region !== 'answer-section');
    const overlayNearTarget = overlayCandidates.filter((o) => o.proximity === 'near-target'
      && (o.ownerMatch === 'target-answer' || o.ownerMatch === 'unknown'));
    // Pager-shaped and INSIDE the target's own answer section, yet ownership
    // resolution attributes it to some other message — a resolver mismatch.
    const misownedInsideRoot = containerDirectional.filter((c) => c.region === 'answer-section'
      && c.ownerMatch !== 'target-answer');
    // The unlabelled target button carries the exact icon geometry of a pager
    // the UNCHANGED resolver already accepts elsewhere: same control, wrong
    // (or absent) label contract. Never inferred from "has an SVG" alone.
    const signatureMismatch = knownKeys.size > 0 && unlabelledMatch;

    let conclusion = 'insufficient-live-evidence';
    if (targetPagerOutsideRoot.length || overlayNearTarget.length) {
      conclusion = 'pager-found-outside-target-root';
    } else if (misownedInsideRoot.length) {
      conclusion = 'pager-owner-resolution-mismatch';
    } else if (signatureMismatch) {
      conclusion = 'pager-contract-signature-mismatch';
    } else if (knownPagerCount > 0) {
      conclusion = 'pager-dom-absent-for-target';
    } else if (!containerExactLabels.length && !indicators.length) {
      conclusion = 'no-native-pager-calibration-available';
    }
    return store({
      state: 'captured',
      reason: null,
      conclusion,
      controls: controls.slice(),
      indicators: indicators.slice(),
      knownPagerSignatures: knownSignatures.slice(),
      overlayCandidates: overlayCandidates.slice(),
      visibility,
      totals: {
        rawButtonOccurrences: occurrences + resolverButtonOccurrences,
        resolverButtonOccurrences,
        uniqueButtonCount: byNode.size,
        containerIndicatorCount: indicators.length,
        containerExactLabelCount: containerExactLabels.length,
        containerDirectionalCount: containerDirectional.length,
        containerUnlabelledSvgCount: containerUnlabelledSvg.length,
        knownPagerCount,
        knownAssistantPagerCount,
        knownPagerSignatureCount: knownSignatures.length,
        targetNearbyControlCount: targetControls.length,
        targetOwnerMatchCount: targetControls.length,
        targetSignatureMatches: signatureMatches.length,
        unlabelledTargetSignatureMatch: unlabelledMatch,
        nearestKnownSignatureDistancePx: nearestKnown,
        overlayCandidateCount: overlayCandidates.length,
      },
    });
  }

  // ── Turn-2 graph eligibility audit (Stage 2C-2ah7) ───────────────────────
  // Publishes the sibling proof H2O ALREADY computes and discards. Read-only
  // with respect to the graph, the traversal, the branch vector and the
  // newest-created policy: every helper below is called, never redefined.
  const CHAT_ATLAS_TURN2_AUDIT_MAX_CHILDREN = 32;

  const CHAT_ATLAS_TURN2_AUDIT_MAX_POINTS = 32;

  let chatAtlasTurn2GraphAudit = null;

  // Distinguishes "absent" from "duplicated": the unique-node helper answers
  // null for both, and only one of them is an ambiguity.
  function chatAtlasTurn2AuditMatchCount(graph, id, productKey) {
    const wanted = chatAtlasCompleteIndexIdentity(id);
    if (!wanted) return 0;
    let count = 0;
    for (const node of graph?.nodes || []) {
      if (productKey && node?.[productKey] !== true) continue;
      if (chatAtlasCompleteIndexIdentity(node?.messageId) === wanted) count += 1;
    }
    return count;
  }

  function chatAtlasTurn2AuditNodeByMessageId(graph, id) {
    const wanted = chatAtlasCompleteIndexIdentity(id);
    if (!wanted) return null;
    const found = (graph?.nodes || [])
      .filter((node) => chatAtlasCompleteIndexIdentity(node?.messageId) === wanted);
    return found.length === 1 ? found[0] : null;
  }

  // One assistant identity, described only by its relationship to the target
  // question. Nothing here re-implements traversal: branch-root resolution is
  // the existing chatAtlasConvergenceBranchRoot.
  function chatAtlasTurn2AuditAssistant(graph, byId, questionNode, answerRoots, id, chainNodeIds) {
    const matchCount = chatAtlasTurn2AuditMatchCount(graph, id, null);
    const node = chatAtlasTurn2AuditNodeByMessageId(graph, id);
    if (!node) {
      return Object.freeze({
        found: false, ambiguous: matchCount > 1, role: 'unknown',
        productAnswer: false, branchShellAlias: false, stopped: false, createTimePresent: false,
        parentIsTargetQuestion: false, directChildIndex: -1, reachableFromAnswerRoot: false,
        answerRootOrdinal: -1, graphPathContainsTargetQuestion: false,
        intermediateNodeBetweenQuestionAndIdentity: false, onCurrentNodeChain: false,
      });
    }
    const root = questionNode ? chatAtlasConvergenceBranchRoot(questionNode, node, byId) : null;
    const rootOrdinal = root ? answerRoots.findIndex((entry) => entry.nodeId === root.nodeId) : -1;
    const directChildIndex = questionNode
      ? (questionNode.childIds || []).indexOf(node.nodeId)
      : -1;
    let chain = [];
    try { chain = chatAtlasChainToRoot(byId, node) || []; } catch { chain = []; }
    const chainIds = new Set(chain.map((entry) => entry.nodeId));
    return Object.freeze({
      found: true,
      ambiguous: matchCount > 1,
      role: chatAtlasTurn2AuditRole(node),
      productAnswer: node.productAnswer === true,
      branchShellAlias: node.branchShellAlias === true,
      stopped: node.stopped === true,
      createTimePresent: chatAtlasGraphCreateTime(node) !== null,
      parentIsTargetQuestion: !!questionNode && node.parentId === questionNode.nodeId,
      directChildIndex,
      reachableFromAnswerRoot: rootOrdinal >= 0,
      answerRootOrdinal: rootOrdinal,
      graphPathContainsTargetQuestion: !!questionNode && chainIds.has(questionNode.nodeId),
      // A wrapper/alias sits between the question and this identity.
      intermediateNodeBetweenQuestionAndIdentity: !!root && root.nodeId !== node.nodeId,
      onCurrentNodeChain: chainNodeIds.has(node.nodeId),
    });
  }

  function chatAtlasCaptureTurn2GraphAudit() {
    const store = (payload) => {
      chatAtlasTurn2GraphAudit = chatAtlasFreeze(payload);
      return chatAtlasTurn2GraphAudit;
    };
    const blank = (reason) => store({
      state: 'skipped', reason,
      conclusion: 'insufficient-graph-evidence',
      policyRecommendation: 'no-policy-change-supported',
      question: { found: false, unique: false, directChildCount: 0, productUserChildCount: 0,
        productAnswerChildCount: 0, branchShellAliasChildCount: 0, stoppedChildCount: 0,
        answerRootCount: 0, questionVariantCount: 0, answerRootCountGreaterThanOne: false },
      children: [], current: null, defaultAnswer: null,
      defaultEligibility: { archive: false, presentation: false, nativeSibling: false,
        exclusionReason: 'insufficient-graph-evidence' },
      points: [], turn2Point: { found: false, kind: 'none', variantCount: 0, selectedIndex: -1,
        containsCurrent: false, containsDefault: false, containsBoth: false },
      pointer: { present: false, belongsToGraph: false, chainContainsQuestion: false,
        chainContainsCurrent: false, chainContainsDefault: false, agreesWithEffective: false },
    });

    const targetQId = chatAtlasCompleteIndexIdentity(chatAtlasDefaultOverlayState.revealTargetQId);
    const currentAId = chatAtlasCompleteIndexIdentity(chatAtlasDefaultOverlayState.revealTargetCurrentAId);
    const defaultAId = chatAtlasCompleteIndexIdentity(chatAtlasDefaultOverlayState.revealTargetExpectedAId);
    if (!targetQId || !currentAId || !defaultAId) return blank('audit-target-unresolved');
    const scope = chatAtlasConvergenceGraphScope();
    if (!scope.ok) return blank(scope.reason);
    const graph = scope.graph;
    const byId = scope.byId;

    // ── Mission F: the host's own pointer, proven through its chain ────────
    const pointerId = chatAtlasCompleteIndexIdentity(graph.currentNode);
    const pointerNode = pointerId ? byId.get(pointerId) || null : null;
    let pointerChain = [];
    if (pointerNode) {
      try { pointerChain = chatAtlasChainToRoot(byId, pointerNode) || []; } catch { pointerChain = []; }
    }
    const chainNodeIds = new Set(pointerChain.map((node) => node.nodeId));
    const chainMessageIds = new Set(pointerChain
      .map((node) => chatAtlasCompleteIndexIdentity(node.messageId))
      .filter(Boolean));
    let effectiveTurn2AId = '';
    try {
      const effective = getEffectivePresentationIndex();
      const row = (Array.isArray(effective?.turns) ? effective.turns : [])
        .find((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === targetQId) || null;
      effectiveTurn2AId = chatAtlasCompleteIndexIdentity(row?.primaryAId) || '';
    } catch { effectiveTurn2AId = ''; }
    const pointer = Object.freeze({
      present: !!pointerId,
      belongsToGraph: !!pointerNode,
      chainContainsQuestion: chainMessageIds.has(targetQId),
      chainContainsCurrent: chainMessageIds.has(currentAId),
      chainContainsDefault: chainMessageIds.has(defaultAId),
      // Membership is the proof. Equality with graph.currentNode is not.
      agreesWithEffective: !!effectiveTurn2AId && chainMessageIds.has(effectiveTurn2AId),
    });

    // ── Mission C: the target question and its direct children ────────────
    const questionMatches = chatAtlasTurn2AuditMatchCount(graph, targetQId, 'productUser');
    const questionNode = chatAtlasConvergenceUniqueNode(graph, targetQId, 'productUser');
    const currentMatches = chatAtlasTurn2AuditMatchCount(graph, currentAId, null);
    const defaultMatches = chatAtlasTurn2AuditMatchCount(graph, defaultAId, null);
    const ambiguous = questionMatches > 1 || currentMatches > 1 || defaultMatches > 1;
    if (!questionNode && !ambiguous) return blank('target-question-unresolved');

    const answerRoots = questionNode
      ? chatAtlasConvergenceAnswerVariantRoots(questionNode, byId)
      : [];
    const questionVariants = questionNode
      ? chatAtlasConvergenceQuestionVariants(questionNode, byId)
      : [];
    const childNodes = (questionNode?.childIds || [])
      .map((childId) => byId.get(childId))
      .filter(Boolean);
    const children = childNodes.slice(0, CHAT_ATLAS_TURN2_AUDIT_MAX_CHILDREN).map((node, index) => {
      const resolved = chatAtlasAnswerIdentityForRoot(node, byId);
      const own = chatAtlasCompleteIndexIdentity(node.messageId) || '';
      return Object.freeze({
        ordinal: index,
        role: chatAtlasTurn2AuditRole(node),
        productUser: node.productUser === true,
        productAnswer: node.productAnswer === true,
        branchShellAlias: node.branchShellAlias === true,
        stopped: node.stopped === true,
        createTimePresent: chatAtlasGraphCreateTime(node) !== null,
        parentIsTargetQuestion: node.parentId === questionNode.nodeId,
        answerIdentityResolves: !!resolved,
        resolvedAnswerIsCurrent: !!resolved && resolved === currentAId,
        resolvedAnswerIsDefault: !!resolved && resolved === defaultAId,
        childIsCurrent: own === currentAId,
        childIsDefault: own === defaultAId,
      });
    });
    const question = Object.freeze({
      found: !!questionNode,
      unique: questionMatches === 1,
      directChildCount: childNodes.length,
      productUserChildCount: childNodes.filter((n) => n.productUser === true).length,
      productAnswerChildCount: childNodes.filter((n) => n.productAnswer === true).length,
      branchShellAliasChildCount: childNodes.filter((n) => n.branchShellAlias === true).length,
      stoppedChildCount: childNodes.filter((n) => n.stopped === true).length,
      answerRootCount: answerRoots.length,
      questionVariantCount: questionVariants.length,
      answerRootCountGreaterThanOne: answerRoots.length > 1,
    });

    // ── Mission D ─────────────────────────────────────────────────────────
    const current = chatAtlasTurn2AuditAssistant(graph, byId, questionNode, answerRoots, currentAId, chainNodeIds);
    const defaultAnswer = chatAtlasTurn2AuditAssistant(graph, byId, questionNode, answerRoots, defaultAId, chainNodeIds);

    // ── Mission E: summarise the EXISTING branch vector, unchanged ─────────
    // Membership is tested on the answer-branch ROOT that carries an identity,
    // which is what variantIds holds — a stopped or aliased variant is still a
    // root even when no product answer resolves beneath it.
    const rootIdFor = (node) => {
      if (!node || !questionNode) return '';
      const root = chatAtlasConvergenceBranchRoot(questionNode, node, byId);
      return root ? root.nodeId : '';
    };
    const currentRootId = rootIdFor(chatAtlasTurn2AuditNodeByMessageId(graph, currentAId));
    const defaultRootId = rootIdFor(chatAtlasTurn2AuditNodeByMessageId(graph, defaultAId));
    let computed = null;
    try { computed = chatAtlasComputeDefaultLatestCreatedPath(); } catch { computed = null; }
    const vector = computed?.ok === true && Array.isArray(computed.branchVector) ? computed.branchVector : [];
    const targetOrder = (() => {
      const turns = Array.isArray(computed?.turns) ? computed.turns : [];
      const row = turns.find((turn) => chatAtlasCompleteIndexIdentity(turn?.qId) === targetQId) || null;
      return row ? Number(row.order || 0) : 0;
    })();
    const summarise = (point) => {
      const ids = Array.isArray(point?.variantIds) ? point.variantIds : [];
      const times = Array.isArray(point?.variantCreateTimes) ? point.variantCreateTimes : [];
      const selectedIndex = Number(point?.selectedIndex ?? -1);
      const selectedId = selectedIndex >= 0 ? String(ids[selectedIndex] || '') : '';
      const selectedTime = selectedIndex >= 0 ? times[selectedIndex] : null;
      return Object.freeze({
        order: Number(point?.order || 0),
        kind: String(point?.kind || 'none'),
        variantCount: Number(point?.variantCount || ids.length || 0),
        selectedIndex,
        selectedVariantCreateTimePresent: typeof selectedTime === 'number'
          && Number.isFinite(selectedTime) && selectedTime > 0,
        ownerIsTargetQuestion: chatAtlasCompleteIndexIdentity(point?.ownerMessageId) === targetQId,
        containsCurrent: !!currentRootId && ids.includes(currentRootId),
        containsDefault: !!defaultRootId && ids.includes(defaultRootId),
        selectedIsCurrent: !!currentRootId && selectedId === currentRootId,
        selectedIsDefault: !!defaultRootId && selectedId === defaultRootId,
      });
    };
    const points = vector.slice(0, CHAT_ATLAS_TURN2_AUDIT_MAX_POINTS).map(summarise);
    const turn2Raw = vector.find((point) => (
      String(point?.kind || '') === 'assistant-regeneration'
      && chatAtlasCompleteIndexIdentity(point?.ownerMessageId) === targetQId
      && (!targetOrder || Number(point?.order || 0) === targetOrder)
    )) || null;
    const turn2Summary = turn2Raw ? summarise(turn2Raw) : null;
    const turn2Point = Object.freeze({
      found: !!turn2Summary,
      kind: turn2Summary ? turn2Summary.kind : 'none',
      variantCount: turn2Summary ? turn2Summary.variantCount : 0,
      selectedIndex: turn2Summary ? turn2Summary.selectedIndex : -1,
      containsCurrent: !!turn2Summary && turn2Summary.containsCurrent,
      containsDefault: !!turn2Summary && turn2Summary.containsDefault,
      containsBoth: !!turn2Summary && turn2Summary.containsCurrent && turn2Summary.containsDefault,
    });

    // ── Mission D exclusion ladder and Mission G conclusion ────────────────
    const archiveEligible = defaultAnswer.found
      && (defaultAnswer.productAnswer || defaultAnswer.branchShellAlias);
    const structuralSibling = question.answerRootCountGreaterThanOne
      && current.reachableFromAnswerRoot
      && defaultAnswer.reachableFromAnswerRoot
      && current.answerRootOrdinal !== defaultAnswer.answerRootOrdinal;
    const nativeSibling = structuralSibling && turn2Point.containsBoth;

    let exclusionReason = 'none';
    if (ambiguous) exclusionReason = 'ambiguous-root';
    else if (!defaultAnswer.found) exclusionReason = 'node-not-found';
    else if (defaultAnswer.role !== 'assistant') exclusionReason = 'not-assistant';
    else if (!defaultAnswer.reachableFromAnswerRoot) {
      exclusionReason = defaultAnswer.graphPathContainsTargetQuestion
        ? 'not-resolved-from-answer-root'
        : 'parent-mismatch';
    } else if (!question.answerRootCountGreaterThanOne) exclusionReason = 'not-direct-child';
    else if (!turn2Point.containsBoth) exclusionReason = 'not-resolved-from-answer-root';
    else if (defaultAnswer.stopped) exclusionReason = 'stopped';
    else if (defaultAnswer.branchShellAlias) exclusionReason = 'branch-shell-alias';
    else if (!defaultAnswer.productAnswer) exclusionReason = 'not-assistant';

    const presentationEligible = nativeSibling && exclusionReason === 'none';

    let conclusion = 'insufficient-graph-evidence';
    if (ambiguous) conclusion = 'graph-identity-ambiguous';
    else if (!questionNode || !current.found || !defaultAnswer.found) {
      conclusion = 'insufficient-graph-evidence';
    } else if (!nativeSibling) conclusion = 'not-genuine-answer-siblings';
    else if (!presentationEligible) conclusion = 'sibling-target-not-presentation-eligible';
    else conclusion = 'genuine-eligible-answer-siblings';

    let policyRecommendation = 'no-policy-change-supported';
    if (conclusion === 'graph-identity-ambiguous') policyRecommendation = 'graph-ambiguous';
    else if (conclusion === 'genuine-eligible-answer-siblings') policyRecommendation = 'default-target-valid';
    else if (exclusionReason === 'branch-shell-alias') policyRecommendation = 'exclude-branch-shell-alias';
    else if (exclusionReason === 'stopped') policyRecommendation = 'exclude-stopped-answer';
    else if (structuralSibling && !turn2Point.containsBoth) policyRecommendation = 'require-branch-vector-membership';
    else if (['not-resolved-from-answer-root', 'parent-mismatch', 'not-direct-child'].includes(exclusionReason)) {
      policyRecommendation = 'require-direct-answer-sibling';
    }

    return store({
      state: 'captured',
      reason: null,
      conclusion,
      policyRecommendation,
      question,
      children,
      current,
      defaultAnswer,
      defaultEligibility: Object.freeze({
        archive: archiveEligible,
        presentation: presentationEligible,
        nativeSibling,
        exclusionReason,
      }),
      points,
      turn2Point,
      pointer,
    });
  }

  function chatAtlasRevealMeasureTarget(targetQId) {
    const wanted = chatAtlasCompleteIndexIdentity(targetQId);
    chatAtlasRevealState.mountedQId = null;
    chatAtlasRevealState.mountedAId = null;
    chatAtlasRevealState.pagerPresent = false;
    if (!wanted) return Object.freeze({ state: 'target-still-unmounted', reason: 'reveal-target-unproven' });
    let map = null;
    try { map = chatAtlasMapMountedNativePath(); } catch { map = null; }
    const rows = Array.isArray(map?.rows) ? map.rows : [];
    const matches = rows.filter((row) => row.mountedQId === wanted);
    if (!matches.length) return Object.freeze({ state: 'target-still-unmounted', reason: 'target-question-unmounted' });
    if (matches.length > 1) return Object.freeze({ state: 'target-mounted-ambiguous', reason: 'target-question-duplicated' });
    const row = matches[0];
    chatAtlasRevealState.mountedQId = row.mountedQId;
    if (!row.mountedAId) {
      return Object.freeze({ state: 'target-answer-unavailable', reason: 'target-answer-unmounted' });
    }
    // Passive structural capture at the exact moment the row is proven and
    // before restoration re-virtualizes it. Read-only; no DOM is retained.
    try { chatAtlasRevealAuditPager(row); } catch {}
    try { chatAtlasPagerLocatorCapture(row); } catch {}
    try { chatAtlasCaptureTurn2GraphAudit(); } catch {}
    // The pager must belong to THIS question/answer pair. Split user/assistant
    // sections are handled because the row carries its own answer section.
    let pagers = [];
    try { pagers = chatAtlasNativeVariantPagers(row.answerSection || row.section) || []; } catch { pagers = []; }
    const owned = pagers.filter((entry) => entry.kind === 'assistant-regeneration'
      && entry.ownerId === row.mountedAId);
    if (owned.length > 1) return Object.freeze({ state: 'target-mounted-ambiguous', reason: 'pager-owner-ambiguous' });
    chatAtlasRevealState.mountedAId = row.mountedAId;
    chatAtlasRevealState.pagerPresent = owned.length === 1;
    // The question and its answer ARE mounted. Calling that "still unmounted"
    // threw away proven evidence and misdescribed the terminal condition.
    if (!owned.length) {
      return Object.freeze({ state: 'target-mounted-pager-unavailable', reason: 'reveal-pager-unavailable' });
    }
    return Object.freeze({ state: 'target-mounted', reason: null });
  }

  // The action boundary. ENABLED: exactly one reversible movement of the proven
  // conversation container to its absolute top. No loop, no increments, no
  // second scroll — the attempt counter is the hard gate.
  const CHAT_ATLAS_REVEAL_ACTION_ENABLED = true;

  const CHAT_ATLAS_REVEAL_RECONCILE_TICKS = 3;

  function chatAtlasExecuteOneShotRevealAction(transaction) {
    if (CHAT_ATLAS_REVEAL_ACTION_ENABLED !== true) {
      chatAtlasRevealState.reason = 'reveal-action-disabled';
      return Object.freeze({ ok: false, executed: false, reason: 'reveal-action-disabled' });
    }
    if (!chatAtlasRevealScopeValid()) {
      return Object.freeze({ ok: false, executed: false, reason: 'reveal-scope-drift' });
    }
    if (chatAtlasRevealState.attempts >= 1 || chatAtlasRevealState.topScrollExecuted === true) {
      return Object.freeze({ ok: false, executed: false, reason: 'reveal-attempt-exhausted' });
    }
    const container = transaction?.container || null;
    if (!container) return Object.freeze({ ok: false, executed: false, reason: 'reveal-container-unavailable' });
    chatAtlasRevealState.attempts = 1;
    let moved = false;
    chatAtlasRevealArmInternalMovement('reveal-top', 0, Number(container.scrollTop || 0));
    chatAtlasRevealInternal(() => {
      try { container.scrollTop = 0; moved = true; } catch { moved = false; }
    });
    if (!moved) {
      return Object.freeze({ ok: false, executed: false, reason: 'reveal-produced-no-mount' });
    }
    chatAtlasRevealState.topScrollExecuted = true;
    chatAtlasRevealState.reconcileStartedAtNavigationMs = chatAtlasRevealNavigationMs();
    chatAtlasRevealState.reconcileState = 'reconciling';
    return Object.freeze({ ok: true, executed: true, reason: null });
  }

  // One bounded reveal: open, bookmark, one scroll, measure. The reconciliation
  // window is driven by the EXISTING authority notification, capped by ticks.
  const CHAT_ATLAS_REVEAL_READINESS_MAX = 3;

  // Scheduled late-boot probes are a RESERVED budget: boot-time authority
  // publications must never spend it. Five probes across ~8 s.
  // ABSOLUTE probe targets measured from the readiness start, so event-loop
  // delay cannot compound the schedule. Sparse across ~40 s: a conversation
  // can finish mounting far later than the old 8 s window allowed.
  // Post-scroll reconciliation targets, absolute from the top-scroll time. The
  // live trace saw the internal movement land 19.2 s after the scroll, so the
  // window reaches 30 s. Authority publications and scroll wakeups may
  // reconcile EARLIER but never spend this reserved budget.
  const CHAT_ATLAS_REVEAL_RECONCILE_TARGETS_MS = Object.freeze([
    100, 500, 1500, 3000, 6000, 12000, 20000, 30000,
  ]);

  const CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX = CHAT_ATLAS_REVEAL_RECONCILE_TARGETS_MS.length;

  const CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS = 30000;

  function chatAtlasRevealReconcileElapsedMs() {
    const frozen = Number(chatAtlasRevealState.reconcileTerminalElapsedMs || 0);
    if (frozen > 0) return frozen;
    const started = Number(chatAtlasRevealState.reconcileStartedAtNavigationMs || 0);
    if (!started) return 0;
    return Math.max(0, chatAtlasRevealNavigationMs() - started);
  }

  function chatAtlasRevealCancelReconcileRetry() {
    const handle = chatAtlasRevealState.reconcileRetryTask;
    chatAtlasRevealState.reconcileRetryTask = null;
    chatAtlasRevealState.reconcileRetryPending = false;
    if (handle == null) return false;
    try {
      if (typeof W.clearTimeout === 'function') W.clearTimeout(handle);
      else clearTimeout(handle);
    } catch {}
    return true;
  }

  function chatAtlasRevealScheduleReconcileRetry() {
    const st = chatAtlasRevealState;
    if (st.transactionState !== 'awaiting-mount') return false;
    if (st.reconcileRetryPending === true) return false;
    const spent = Number(st.reconcileScheduledProbes || 0);
    if (spent >= CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX) return false;
    const elapsed = chatAtlasRevealReconcileElapsedMs();
    if (elapsed >= CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS) return false;
    const target = CHAT_ATLAS_REVEAL_RECONCILE_TARGETS_MS[spent];
    const delay = Math.max(0, target - elapsed);
    const generation = Number(st.reconcileRetryGeneration || 0) + 1;
    st.reconcileRetryGeneration = generation;
    st.reconcileRetryPending = true;
    const schedule = typeof W.setTimeout === 'function'
      ? (fn, ms) => W.setTimeout(fn, ms)
      : (fn, ms) => setTimeout(fn, ms);
    st.reconcileRetryTask = schedule(() => {
      st.reconcileRetryTask = null;
      st.reconcileRetryPending = false;
      if (Number(st.reconcileRetryGeneration || 0) !== generation) return;
      if (st.transactionState !== 'awaiting-mount') return;
      try { chatAtlasRevealReconcileTick('scheduled'); } catch {}
    }, delay);
    return true;
  }

  const CHAT_ATLAS_REVEAL_READINESS_TARGETS_MS = Object.freeze([
    500, 1500, 3000, 6000, 10000, 16000, 24000, 34000, 40000,
  ]);

  const CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX = CHAT_ATLAS_REVEAL_READINESS_TARGETS_MS.length;

  const CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS = 40000;

  // Milliseconds since navigation, matching the trace's own basis.
  function chatAtlasRevealNavigationMs() {
    try {
      const value = W.performance && typeof W.performance.now === 'function'
        ? Number(W.performance.now())
        : NaN;
      if (Number.isFinite(value)) return Math.round(value);
    } catch {}
    return 0;
  }

  // Live while running; FROZEN once readiness reaches a terminal state, so a
  // later projection read cannot inflate it.
  function chatAtlasRevealReadinessElapsedMs() {
    const frozen = Number(chatAtlasRevealState.readinessTerminalElapsedMs || 0);
    if (frozen > 0) return frozen;
    const started = Number(chatAtlasRevealState.readinessStartedAtNavigationMs || 0);
    if (!started) return 0;
    return Math.max(0, chatAtlasRevealNavigationMs() - started);
  }

  function chatAtlasRevealFreezeReadiness(terminalState) {
    const st = chatAtlasRevealState;
    if (Number(st.readinessTerminalElapsedMs || 0) > 0) return false;
    const started = Number(st.readinessStartedAtNavigationMs || 0);
    st.readinessTerminalElapsedMs = started
      ? Math.max(1, chatAtlasRevealNavigationMs() - started)
      : 1;
    st.readinessTerminalState = terminalState;
    return true;
  }

  function chatAtlasRevealCancelReadinessRetry() {
    const handle = chatAtlasRevealState.readinessRetryTask;
    chatAtlasRevealState.readinessRetryTask = null;
    chatAtlasRevealState.readinessRetryPending = false;
    if (handle == null) return false;
    // Call through W so the receiver is preserved.
    try {
      if (typeof W.clearTimeout === 'function') W.clearTimeout(handle);
      else clearTimeout(handle);
    } catch {}
    return true;
  }

  // Authority notifications alone proved insufficient: the conversation can
  // finish mounting AFTER the last publication, leaving a pending readiness
  // transaction with a resolved container and nothing left to wake it. One
  // bounded, transaction-owned timeout closes that gap. It is not polling: it
  // is capped by revealReadinessCap and cancelled on every terminal path.
  function chatAtlasRevealScheduleReadinessRetry() {
    const st = chatAtlasRevealState;
    if (st.transactionState !== 'waiting-for-container-readiness') return false;
    if (st.readinessRetryPending === true) return false;         // no duplicates
    // Only SCHEDULED probes count against the reserved budget.
    const spent = Number(st.readinessScheduledProbes || 0);
    if (spent >= CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX) return false;
    const elapsed = chatAtlasRevealReadinessElapsedMs();
    if (elapsed >= CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS) return false;
    // Absolute target minus elapsed: a late timer does not push the rest out.
    const target = CHAT_ATLAS_REVEAL_READINESS_TARGETS_MS[spent];
    const delay = Math.max(0, target - elapsed);
    const generation = Number(st.readinessRetryGeneration || 0) + 1;
    st.readinessRetryGeneration = generation;
    st.readinessRetryDelayMs = delay;
    st.readinessRetryPending = true;
    st.readinessRetryScheduled = Number(st.readinessRetryScheduled || 0) + 1;
    const schedule = typeof W.setTimeout === 'function'
      ? (fn, ms) => W.setTimeout(fn, ms)
      : (fn, ms) => setTimeout(fn, ms);
    st.readinessRetryTask = schedule(() => {
      st.readinessRetryTask = null;
      st.readinessRetryPending = false;
      // A superseded or replaced transaction must not act.
      if (Number(st.readinessRetryGeneration || 0) !== generation) return;
      if (st.transactionState !== 'waiting-for-container-readiness') return;
      try { chatAtlasRevealRunOneShot(st.readinessTarget, 'scheduled'); } catch {}
    }, delay);
    return true;
  }

  function chatAtlasRevealRunOneShot(target, source = 'authority') {
    const st = chatAtlasRevealState;
    const waiting = st.transactionState === 'waiting-for-container-readiness';
    if (st.transactionState !== 'idle' && !waiting) {
      return Object.freeze({ ok: false, state: st.transactionState, reason: 'reveal-already-run' });
    }
    if (waiting) {
      // A pending readiness transaction is inert once its scope moved.
      if (!chatAtlasRevealScopeValid()) {
        chatAtlasRevealCancelReadinessRetry();
        chatAtlasRevealFreezeReadiness('superseded');
        st.readinessState = 'superseded';
        st.readinessReason = 'reveal-scope-drift';
        return chatAtlasRevealFinish('reveal-scope-drift', 'reveal-scope-drift');
      }
    } else {
      st.pin = chatAtlasRevealCurrentPin(target);
      st.readinessTarget = target;
      st.readinessStartedAtNavigationMs = chatAtlasRevealNavigationMs();
      st.readinessFirstResolvedAtNavigationMs = 0;
      st.readinessTerminalElapsedMs = 0;
      st.readinessTerminalState = null;
      st.readinessReadyElapsedMs = 0;
      st.readinessAttempts = 0;
      st.readinessAuthorityProbes = 0;
      st.readinessScheduledProbes = 0;
      st.readinessState = 'waiting';
      st.readinessReason = null;
      st.superseded = false;
      st.supersededBy = null;
    }
    // Readiness retries CONTAINER DISCOVERY ONLY. It never scrolls, never
    // captures a bookmark and never consumes the single scroll attempt.
    const probe = chatAtlasResolveConversationScrollContainer();
    if (!probe.ok) {
      st.readinessAttempts = Number(st.readinessAttempts || 0) + 1;
      if (source === 'scheduled') st.readinessScheduledProbes = Number(st.readinessScheduledProbes || 0) + 1;
      else st.readinessAuthorityProbes = Number(st.readinessAuthorityProbes || 0) + 1;
      st.readinessReason = probe.reason;
      // Only the reserved schedule can end the window — boot-time authority
      // noise never times readiness out.
      const budgetSpent = Number(st.readinessScheduledProbes || 0) >= CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX;
      const deadlineReached = chatAtlasRevealReadinessElapsedMs() >= CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS;
      if (budgetSpent || deadlineReached) {
        // One last look before giving up: a container that resolved between
        // the probe above and now must not be discarded.
        const finalProbe = chatAtlasResolveConversationScrollContainer();
        if (finalProbe.ok) {
          chatAtlasRevealCancelReadinessRetry();
          if (!st.readinessFirstResolvedAtNavigationMs) {
            st.readinessFirstResolvedAtNavigationMs = chatAtlasRevealNavigationMs();
          }
          chatAtlasRevealFreezeReadiness('ready');
          st.readinessReadyElapsedMs = Number(st.readinessTerminalElapsedMs || 0);
          st.readinessState = 'ready';
          st.readinessReason = null;
          st.transactionState = 'idle';
          const late = chatAtlasRevealOpenTransaction(target || st.readinessTarget);
          if (!late.ok) return chatAtlasRevealFinish('reveal-container-unavailable', late.reason);
          return chatAtlasRevealProceedAfterOpen(late);
        }
        chatAtlasRevealCancelReadinessRetry();
        chatAtlasRevealFreezeReadiness('timeout');
        st.readinessState = 'timeout';
        return chatAtlasRevealFinish('reveal-container-readiness-timeout', probe.reason);
      }
      st.readinessState = 'waiting';
      st.transactionState = 'waiting-for-container-readiness';
      // The final attempt must run even if no further notification arrives.
      chatAtlasRevealScheduleReadinessRetry();
      return Object.freeze({
        ok: false, state: 'waiting-for-container-readiness', reason: probe.reason,
        retryPending: st.readinessRetryPending === true,
      });
    }
    // Resolved: no retry may remain outstanding and no stale reason may linger.
    chatAtlasRevealCancelReadinessRetry();
    if (!st.readinessFirstResolvedAtNavigationMs) {
      st.readinessFirstResolvedAtNavigationMs = chatAtlasRevealNavigationMs();
    }
    chatAtlasRevealFreezeReadiness('ready');
    st.readinessReadyElapsedMs = Number(st.readinessTerminalElapsedMs || 0);
    st.readinessState = 'ready';
    st.readinessReason = null;
    st.transactionState = 'idle';
    const opened = chatAtlasRevealOpenTransaction(target || st.readinessTarget);
    if (!opened.ok) return chatAtlasRevealFinish('reveal-container-unavailable', opened.reason);
    return chatAtlasRevealProceedAfterOpen(opened);
  }

  function chatAtlasRevealProceedAfterOpen(opened) {
    chatAtlasRevealState.container = opened.container;
    chatAtlasRevealState.ticks = 0;
    chatAtlasRevealCaptureBookmark(opened.container);
    const action = chatAtlasExecuteOneShotRevealAction({ container: opened.container });
    if (action.executed !== true) {
      return chatAtlasRevealTerminate('reveal-container-unavailable', action.reason);
    }
    chatAtlasRevealState.transactionState = 'awaiting-mount';
    return chatAtlasRevealReconcileTick();
  }

  function chatAtlasRevealReconcileTick(source = 'authority') {
    // Supersession is checked FIRST: a user action already moved the state out
    // of 'awaiting-mount', and reporting a generic 'not awaiting' would hide
    // the precise terminal reason the contract requires.
    if (chatAtlasRevealState.superseded === true) {
      if (chatAtlasRevealState.transactionState === 'idle') {
        return Object.freeze({ ok: false, state: 'idle', reason: 'reveal-not-awaiting' });
      }
      return chatAtlasRevealTerminate('reveal-superseded-by-user-scroll', 'reveal-superseded-by-user-scroll');
    }
    if (chatAtlasRevealState.transactionState !== 'awaiting-mount') {
      return Object.freeze({ ok: false, state: chatAtlasRevealState.transactionState, reason: 'reveal-not-awaiting' });
    }
    const drift = chatAtlasRevealScopeDrift();
    chatAtlasRevealState.driftField = drift.field;
    chatAtlasRevealState.driftHard = drift.hard === true;
    if (drift.hard === true) {
      return chatAtlasRevealTerminate('reveal-scope-drift', `reveal-scope-drift:${drift.field}`);
    }
    // Only SCHEDULED probes spend the reserved budget; authority publications
    // and scroll wakeups reconcile opportunistically.
    if (source === 'scheduled') {
      chatAtlasRevealState.reconcileScheduledProbes = Number(chatAtlasRevealState.reconcileScheduledProbes || 0) + 1;
    } else if (source === 'scroll') {
      chatAtlasRevealState.reconcileScrollWakeups = Number(chatAtlasRevealState.reconcileScrollWakeups || 0) + 1;
    } else {
      chatAtlasRevealState.reconcileAuthorityProbes = Number(chatAtlasRevealState.reconcileAuthorityProbes || 0) + 1;
    }
    chatAtlasRevealState.reconcileLastProbeAtNavigationMs = chatAtlasRevealNavigationMs();
    // Soft churn keeps the ORIGINAL pinned target identities and keeps going.
    const container = chatAtlasRevealState.container || null;
    const pin = chatAtlasRevealState.pin;
    const measured = chatAtlasRevealMeasureTarget(pin?.targetQId);
    chatAtlasRevealState.ticks = Number(chatAtlasRevealState.ticks || 0) + 1;
    // Any conclusive measurement ends it; only a genuinely absent target waits.
    if (measured.state !== 'target-still-unmounted' && measured.state !== 'target-answer-unavailable') {
      chatAtlasRevealFreezeReconcile(measured.state);
      return chatAtlasRevealTerminate(measured.state, measured.reason);
    }
    const budgetSpent = Number(chatAtlasRevealState.reconcileScheduledProbes || 0)
      >= CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX;
    const deadlineReached = chatAtlasRevealReconcileElapsedMs() >= CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS;
    if (budgetSpent || deadlineReached) {
      // One final LIVE measurement: a stale earlier read must never decide it.
      const finalMeasured = chatAtlasRevealMeasureTarget(pin?.targetQId);
      chatAtlasRevealFreezeReconcile(finalMeasured.state);
      if (finalMeasured.state !== 'target-still-unmounted') {
        return chatAtlasRevealTerminate(finalMeasured.state, finalMeasured.reason);
      }
      return chatAtlasRevealTerminate(
        drift.soft === true ? 'reveal-soft-scope-drift-restored' : 'target-still-unmounted',
        finalMeasured.reason,
      );
    }
    // The lifecycle drives itself: nothing outside it needs to fire again.
    chatAtlasRevealScheduleReconcileRetry();
    return Object.freeze({ ok: false, state: 'awaiting-mount', reason: measured.reason });
  }

  function chatAtlasRevealDiagnostics() {
    const bookmark = chatAtlasRevealState.bookmark;
    return Object.freeze({
      revealState: String(chatAtlasRevealState.transactionState || 'idle'),
      revealReason: chatAtlasRevealState.reason,
      revealAttempts: Number(chatAtlasRevealState.attempts || 0),
      revealTransactionState: String(chatAtlasRevealState.transactionState || 'idle'),
      // Hashed, never raw: the token embeds chat and question identities, and
      // diagnostics stay content-free the same way the trusted-capture token
      // hash does.
      revealTransactionTokenHash: chatAtlasRevealState.token
        ? `djb2:${chatAtlasCompleteIndexStableHash(String(chatAtlasRevealState.token))}`
        : null,
      revealTransactionReason: chatAtlasRevealState.reason,
      revealTransactionScopeValid: chatAtlasRevealScopeValid(),
      revealTransactionSuperseded: chatAtlasRevealState.superseded === true,
      revealUserSuperseded: chatAtlasRevealState.superseded === true,
      revealTopScrollExecuted: chatAtlasRevealState.topScrollExecuted === true,
      revealListenerCount: chatAtlasRevealState.listeners.length,
      revealMountedQId: chatAtlasRevealState.mountedQId,
      revealMountedAId: chatAtlasRevealState.mountedAId,
      revealPagerPresent: chatAtlasRevealState.pagerPresent === true,
      revealBookmarkKind: bookmark?.kind || null,
      revealBookmarkTurnId: bookmark?.turnId || null,
      revealBookmarkOffset: Number(bookmark?.offset || 0),
      revealBookmarkScrollTop: Number(bookmark?.scrollTop || 0),
      revealBookmarkCaptured: bookmark?.captured === true,
      revealRestoreState: String(chatAtlasRevealState.restoreState || 'idle'),
      revealRestoreReason: chatAtlasRevealState.restoreReason,
      revealRestoreMethod: chatAtlasRevealState.restoreMethod,
      revealRestoreTargetId: chatAtlasRevealState.restoreTargetId,
      revealRestoreOffset: Number(chatAtlasRevealState.restoreOffset || 0),
      revealRestoreFinalScrollTop: Number(chatAtlasRevealState.restoreFinalScrollTop || 0),
      revealRestoreRequestedScrollTop: Number(chatAtlasRevealState.restoreRequestedScrollTop || 0),
      revealRestoreFirstMeasuredScrollTop: Number(chatAtlasRevealState.restoreFirstMeasuredScrollTop || 0),
      revealRestoreBookmarkOffset: Number(chatAtlasRevealState.bookmark?.offset || 0),
      revealRestoreMeasuredOffset: Number(chatAtlasRevealState.restoreMeasuredOffset || 0),
      revealRestoreOffsetError: Number(chatAtlasRevealState.restoreOffsetError || 0),
      revealRestoreCorrectionAttempts: Number(chatAtlasRevealState.restoreCorrectionAttempts || 0),
      revealRestoreCorrectionReason: chatAtlasRevealState.restoreCorrectionReason,
      revealRestoreTolerancePx: CHAT_ATLAS_REVEAL_RESTORE_TOLERANCE_PX,
      pagerAuditState: String(chatAtlasRevealState.pagerAudit?.state || 'idle'),
      pagerAuditReason: chatAtlasRevealState.pagerAudit?.reason || null,
      pagerAuditTargetMounted: chatAtlasRevealState.pagerAudit?.targetMounted === true,
      pagerAuditAssistantMounted: chatAtlasRevealState.pagerAudit?.assistantMounted === true,
      pagerAuditRegionCount: Number(chatAtlasRevealState.pagerAudit?.totals?.regionCount || 0),
      pagerAuditTotalButtons: Number(chatAtlasRevealState.pagerAudit?.totals?.totalButtons || 0),
      pagerAuditCandidateCount: Number(chatAtlasRevealState.pagerAudit?.totals?.candidateCount || 0),
      pagerAuditRecognizedLabelCount: Number(chatAtlasRevealState.pagerAudit?.totals?.recognizedLabelCount || 0),
      pagerAuditIndicatorCount: Number(chatAtlasRevealState.pagerAudit?.totals?.indicatorCount || 0),
      pagerAuditOwnerMatchCount: Number(chatAtlasRevealState.pagerAudit?.totals?.ownerMatchCount || 0),
      pagerAuditResolverEntryCount: Number(chatAtlasRevealState.pagerAudit?.totals?.resolverEntryCount || 0),
      pagerAuditResolverOwnedCount: Number(chatAtlasRevealState.pagerAudit?.totals?.resolverOwnedCount || 0),
      pagerAuditLikelyFailureClass: chatAtlasRevealState.pagerAudit?.failureClass || null,
      pagerAuditRawButtonOccurrences: Number(chatAtlasRevealState.pagerAudit?.totals?.rawButtonOccurrences || 0),
      pagerAuditUniqueButtonCount: Number(chatAtlasRevealState.pagerAudit?.totals?.uniqueButtonCount || 0),
      pagerAuditDuplicateOccurrenceCount: Number(chatAtlasRevealState.pagerAudit?.totals?.duplicateOccurrenceCount || 0),
      pagerAuditUniqueCandidateCount: Number(chatAtlasRevealState.pagerAudit?.totals?.uniqueCandidateCount || 0),
      pagerAuditAdjacentControlCount: Number(chatAtlasRevealState.pagerAudit?.totals?.adjacentControlCount || 0),
      pagerAuditAdjacentLabelledCount: Number(chatAtlasRevealState.pagerAudit?.totals?.adjacentLabelledCount || 0),
      pagerAuditAdjacentContractCount: Number(chatAtlasRevealState.pagerAudit?.totals?.adjacentContractCount || 0),
      pagerAuditRegions: chatAtlasRevealState.pagerAudit?.regions || [],
      pagerAuditControls: chatAtlasRevealState.pagerAudit?.controls || [],
      pagerAuditIndicators: chatAtlasRevealState.pagerAudit?.indicators || [],
      pagerAuditAdjacent: chatAtlasRevealState.pagerAudit?.adjacent || [],
      pagerLocatorState: String(chatAtlasRevealState.pagerLocator?.state || 'idle'),
      pagerLocatorReason: chatAtlasRevealState.pagerLocator?.reason || null,
      pagerLocatorConclusion: chatAtlasRevealState.pagerLocator?.conclusion || null,
      pagerLocatorContainerIndicatorCount: Number(chatAtlasRevealState.pagerLocator?.totals?.containerIndicatorCount || 0),
      pagerLocatorContainerExactLabelCount: Number(chatAtlasRevealState.pagerLocator?.totals?.containerExactLabelCount || 0),
      pagerLocatorContainerDirectionalCount: Number(chatAtlasRevealState.pagerLocator?.totals?.containerDirectionalCount || 0),
      pagerLocatorContainerUnlabelledSvgCount: Number(chatAtlasRevealState.pagerLocator?.totals?.containerUnlabelledSvgCount || 0),
      pagerLocatorKnownPagerCount: Number(chatAtlasRevealState.pagerLocator?.totals?.knownPagerCount || 0),
      pagerLocatorKnownPagerSignatureCount: Number(chatAtlasRevealState.pagerLocator?.totals?.knownPagerSignatureCount || 0),
      pagerLocatorTargetSignatureMatches: Number(chatAtlasRevealState.pagerLocator?.totals?.targetSignatureMatches || 0),
      pagerLocatorUnlabelledTargetSignatureMatch: chatAtlasRevealState.pagerLocator?.totals?.unlabelledTargetSignatureMatch === true,
      pagerLocatorNearestKnownSignatureDistancePx: Number(chatAtlasRevealState.pagerLocator?.totals?.nearestKnownSignatureDistancePx ?? -1),
      pagerLocatorTargetNearbyControlCount: Number(chatAtlasRevealState.pagerLocator?.totals?.targetNearbyControlCount || 0),
      pagerLocatorTargetOwnerMatchCount: Number(chatAtlasRevealState.pagerLocator?.totals?.targetOwnerMatchCount || 0),
      pagerLocatorOverlayCandidateCount: Number(chatAtlasRevealState.pagerLocator?.totals?.overlayCandidateCount || 0),
      pagerLocatorTargetHovered: chatAtlasRevealState.pagerLocator?.visibility?.hovered === true,
      pagerLocatorTargetFocusWithin: chatAtlasRevealState.pagerLocator?.visibility?.focusWithin === true,
      pagerLocatorTargetVisiblePercent: Number(chatAtlasRevealState.pagerLocator?.visibility?.visiblePercent || 0),
      pagerLocatorControls: chatAtlasRevealState.pagerLocator?.controls || [],
      pagerLocatorIndicators: chatAtlasRevealState.pagerLocator?.indicators || [],
      pagerLocatorKnownPagerSignatures: chatAtlasRevealState.pagerLocator?.knownPagerSignatures || [],
      pagerLocatorOverlayCandidates: chatAtlasRevealState.pagerLocator?.overlayCandidates || [],
      // ── Selected-chain / canonical pairing parity (Stage 2C-2ai1) ───────
      selectedChainPairingRule: 'canonical-last-product-answer',
      ...(() => {
        const parity = chatAtlasSelectedChainCanonicalParity();
        let computed = null;
        try { computed = chatAtlasComputeDefaultLatestCreatedPath(); } catch { computed = null; }
        const targetQId = chatAtlasCompleteIndexIdentity(chatAtlasDefaultOverlayState.revealTargetQId);
        const roots = Array.isArray(computed?.branchRoots) ? computed.branchRoots : [];
        const record = targetQId
          ? (roots.find((entry) => chatAtlasCompleteIndexIdentity(entry?.qId) === targetQId) || null)
          : (roots.find((entry) => Number(entry?.order || 0) === 2) || null);
        const canonical = chatAtlasCanonicalPresentationIndex();
        const canonicalRow = record
          ? (Array.isArray(canonical?.turns)
            ? canonical.turns.find((turn) => (
              chatAtlasCompleteIndexIdentity(turn?.qId) === chatAtlasCompleteIndexIdentity(record.qId)
            )) || null
            : null)
          : null;
        return {
          selectedChainTurn2BranchRootPresent: !!chatAtlasCompleteIndexIdentity(record?.branchRootAId),
          selectedChainTurn2BranchRootIsPrimary: record?.branchRootIsPrimary === true,
          selectedChainTurn2PrimaryAnswerResolved: !!chatAtlasCompleteIndexIdentity(record?.primaryAId),
          selectedChainTurn2PrimaryMatchesCanonical: !!record && !!canonicalRow
            && chatAtlasCompleteIndexIdentity(record.primaryAId)
              === chatAtlasCompleteIndexIdentity(canonicalRow.primaryAId),
          selectedChainCanonicalParity: parity.ok === true,
          selectedChainCanonicalParityReason: parity.reason || null,
          selectedChainCanonicalParityRows: Number(parity.comparedRows || 0),
          selectedChainCanonicalParityMismatches: Number(parity.mismatchCount || 0),
        };
      })(),
      // ── Graph-proven divergence and question-edit plan (Stage 2C-2ah8) ──
      graphDivergenceState: String(chatAtlasGraphDivergence().state || 'idle'),
      graphDivergenceReason: chatAtlasGraphDivergence().reason || null,
      graphDivergenceKind: chatAtlasGraphDivergence().kind || null,
      graphDivergenceOrder: Number(chatAtlasGraphDivergence().order || 0),
      graphDivergenceSharedPrefixLength: Number(chatAtlasGraphDivergence().sharedPrefixLength || 0),
      graphDivergenceOwnerFound: chatAtlasGraphDivergence().ownerFound === true,
      graphDivergenceOwnerRole: chatAtlasGraphDivergence().ownerRole || null,
      graphDivergenceOwnerMessageId: chatAtlasGraphDivergence().ownerMessageId || null,
      graphDivergenceCurrentRootFound: chatAtlasGraphDivergence().currentRootFound === true,
      graphDivergenceDefaultRootFound: chatAtlasGraphDivergence().defaultRootFound === true,
      graphDivergenceCurrentRootMessageId: chatAtlasGraphDivergence().currentRootMessageId || null,
      graphDivergenceDefaultRootMessageId: chatAtlasGraphDivergence().defaultRootMessageId || null,
      graphDivergenceVariantCount: Number(chatAtlasGraphDivergence().variantCount || 0),
      graphDivergenceCurrentIndex: Number(chatAtlasGraphDivergence().currentIndex ?? -1),
      graphDivergenceDefaultIndex: Number(chatAtlasGraphDivergence().defaultIndex ?? -1),
      graphDivergenceDirectAnswerSiblingProof: chatAtlasGraphDivergence().directAnswerSiblingProof === true,
      graphDivergenceQuestionVariantProof: chatAtlasGraphDivergence().questionVariantProof === true,
      graphDivergenceBranchVectorAgreement: chatAtlasGraphDivergence().branchVectorAgreement === true,
      defaultObservedDivergenceKind: chatAtlasDefaultOverlayState.observedDivergenceKind || null,
      defaultNativeRoute: chatAtlasDefaultOverlayState.nativeRoute || null,
      defaultAnswerConvergenceSuppressed: chatAtlasDefaultOverlayState.answerConvergenceSuppressed === true,
      defaultQuestionEditPlanState: String(chatAtlasQuestionEditPlanState.state || 'idle'),
      defaultQuestionEditPlanReason: chatAtlasQuestionEditPlanState.reason || null,
      defaultQuestionEditPagerOwnerProven: chatAtlasQuestionEditPlanState.plan?.pagerOwnerProven === true,
      defaultQuestionEditPreviousAvailable: chatAtlasQuestionEditPlanState.plan?.previousAvailable === true,
      defaultQuestionEditNextAvailable: chatAtlasQuestionEditPlanState.plan?.nextAvailable === true,
      defaultQuestionEditRequiredDirection: chatAtlasQuestionEditPlanState.plan?.requiredDirection || null,
      defaultQuestionEditVariantCount: Number(chatAtlasQuestionEditPlanState.plan?.variantCount || 0),
      defaultQuestionEditCurrentIndex: Number(chatAtlasQuestionEditPlanState.plan?.currentIndex ?? -1),
      defaultQuestionEditTargetIndex: Number(chatAtlasQuestionEditPlanState.plan?.targetIndex ?? -1),
      defaultQuestionEditActivationPermitted: chatAtlasQuestionEditPlanState.plan?.activationPermitted === true,
      defaultQuestionEditActivationCount: Number(chatAtlasQuestionEditPlanState.activations || 0),
      // ── Turn-2 graph eligibility audit (Stage 2C-2ah7) ──────────────────
      turn2GraphAuditState: String(chatAtlasTurn2GraphAudit?.state || 'idle'),
      turn2GraphAuditReason: chatAtlasTurn2GraphAudit?.reason || null,
      turn2GraphAuditConclusion: chatAtlasTurn2GraphAudit?.conclusion || null,
      turn2GraphAuditPolicyRecommendation: chatAtlasTurn2GraphAudit?.policyRecommendation || null,
      turn2QuestionFound: chatAtlasTurn2GraphAudit?.question?.found === true,
      turn2QuestionUnique: chatAtlasTurn2GraphAudit?.question?.unique === true,
      turn2DirectChildCount: Number(chatAtlasTurn2GraphAudit?.question?.directChildCount || 0),
      turn2AnswerRootCount: Number(chatAtlasTurn2GraphAudit?.question?.answerRootCount || 0),
      turn2QuestionVariantCount: Number(chatAtlasTurn2GraphAudit?.question?.questionVariantCount || 0),
      turn2CurrentAssistantFound: chatAtlasTurn2GraphAudit?.current?.found === true,
      turn2CurrentAssistantDirectChild: Number(chatAtlasTurn2GraphAudit?.current?.directChildIndex ?? -1) >= 0,
      turn2CurrentAssistantProductAnswer: chatAtlasTurn2GraphAudit?.current?.productAnswer === true,
      turn2CurrentAssistantBranchShellAlias: chatAtlasTurn2GraphAudit?.current?.branchShellAlias === true,
      turn2CurrentAssistantStopped: chatAtlasTurn2GraphAudit?.current?.stopped === true,
      turn2DefaultAssistantFound: chatAtlasTurn2GraphAudit?.defaultAnswer?.found === true,
      turn2DefaultAssistantDirectChild: Number(chatAtlasTurn2GraphAudit?.defaultAnswer?.directChildIndex ?? -1) >= 0,
      turn2DefaultAssistantProductAnswer: chatAtlasTurn2GraphAudit?.defaultAnswer?.productAnswer === true,
      turn2DefaultAssistantBranchShellAlias: chatAtlasTurn2GraphAudit?.defaultAnswer?.branchShellAlias === true,
      turn2DefaultAssistantStopped: chatAtlasTurn2GraphAudit?.defaultAnswer?.stopped === true,
      turn2DefaultAssistantArchiveEligible: chatAtlasTurn2GraphAudit?.defaultEligibility?.archive === true,
      turn2DefaultAssistantPresentationEligible: chatAtlasTurn2GraphAudit?.defaultEligibility?.presentation === true,
      turn2DefaultAssistantNativeSiblingEligible: chatAtlasTurn2GraphAudit?.defaultEligibility?.nativeSibling === true,
      turn2DefaultAssistantExclusionReason: chatAtlasTurn2GraphAudit?.defaultEligibility?.exclusionReason || null,
      turn2DefaultAssistantIntermediateNode:
        chatAtlasTurn2GraphAudit?.defaultAnswer?.intermediateNodeBetweenQuestionAndIdentity === true,
      turn2DefaultAssistantAnswerRootOrdinal: Number(chatAtlasTurn2GraphAudit?.defaultAnswer?.answerRootOrdinal ?? -1),
      turn2BranchVectorPointFound: chatAtlasTurn2GraphAudit?.turn2Point?.found === true,
      turn2BranchVectorKind: chatAtlasTurn2GraphAudit?.turn2Point?.kind || null,
      turn2BranchVectorVariantCount: Number(chatAtlasTurn2GraphAudit?.turn2Point?.variantCount || 0),
      turn2BranchVectorSelectedIndex: Number(chatAtlasTurn2GraphAudit?.turn2Point?.selectedIndex ?? -1),
      turn2BranchVectorContainsCurrent: chatAtlasTurn2GraphAudit?.turn2Point?.containsCurrent === true,
      turn2BranchVectorContainsDefault: chatAtlasTurn2GraphAudit?.turn2Point?.containsDefault === true,
      turn2BranchVectorContainsBoth: chatAtlasTurn2GraphAudit?.turn2Point?.containsBoth === true,
      turn2CurrentGraphPointerPresent: chatAtlasTurn2GraphAudit?.pointer?.present === true,
      turn2CurrentGraphPointerBelongs: chatAtlasTurn2GraphAudit?.pointer?.belongsToGraph === true,
      turn2CurrentGraphChainContainsQuestion: chatAtlasTurn2GraphAudit?.pointer?.chainContainsQuestion === true,
      turn2CurrentGraphChainContainsCurrentAssistant: chatAtlasTurn2GraphAudit?.pointer?.chainContainsCurrent === true,
      turn2CurrentGraphChainContainsDefaultAssistant: chatAtlasTurn2GraphAudit?.pointer?.chainContainsDefault === true,
      turn2CurrentGraphAgreesWithEffective: chatAtlasTurn2GraphAudit?.pointer?.agreesWithEffective === true,
      turn2GraphDirectChildren: chatAtlasTurn2GraphAudit?.children || [],
      turn2DefaultBranchVectorPoints: chatAtlasTurn2GraphAudit?.points || [],
      revealRestoreDelta: Math.round(
        Number(chatAtlasRevealState.restoreFinalScrollTop || 0)
        - Number(chatAtlasRevealState.bookmark?.scrollTop || 0),
      ),
      revealReconcileTicks: Number(chatAtlasRevealState.ticks || 0),
      revealReadinessState: String(chatAtlasRevealState.readinessState || 'idle'),
      revealReadinessReason: chatAtlasRevealState.readinessReason,
      revealReadinessAttempts: Number(chatAtlasRevealState.readinessAttempts || 0),
      revealReadinessCap: CHAT_ATLAS_REVEAL_READINESS_MAX,
      revealReadinessRetryScheduled: Number(chatAtlasRevealState.readinessRetryScheduled || 0),
      revealReadinessRetryPending: chatAtlasRevealState.readinessRetryPending === true,
      revealReadinessRetryDelayMs: Number(chatAtlasRevealState.readinessRetryDelayMs || 0),
      revealReadinessRetryGeneration: Number(chatAtlasRevealState.readinessRetryGeneration || 0),
      revealReadinessAuthorityProbes: Number(chatAtlasRevealState.readinessAuthorityProbes || 0),
      revealReadinessScheduledProbes: Number(chatAtlasRevealState.readinessScheduledProbes || 0),
      revealReadinessScheduledCap: CHAT_ATLAS_REVEAL_READINESS_SCHEDULED_MAX,
      revealReadinessElapsedMs: chatAtlasRevealReadinessElapsedMs(),
      revealReadinessStartedAtNavigationMs: Number(chatAtlasRevealState.readinessStartedAtNavigationMs || 0),
      revealReadinessFirstResolvedAtNavigationMs: Number(chatAtlasRevealState.readinessFirstResolvedAtNavigationMs || 0),
      revealReadinessReadyElapsedMs: Number(chatAtlasRevealState.readinessReadyElapsedMs || 0),
      revealReadinessTerminalElapsedMs: Number(chatAtlasRevealState.readinessTerminalElapsedMs || 0),
      revealReadinessTerminalState: chatAtlasRevealState.readinessTerminalState,
      revealSupersessionSource: chatAtlasRevealState.supersessionSource,
      revealSupersessionEventType: chatAtlasRevealState.supersessionEventType,
      revealSupersessionEventTrusted: chatAtlasRevealState.supersessionEventTrusted === true,
      revealSupersessionPhase: chatAtlasRevealState.supersessionPhase,
      revealSupersessionInternalDepth: Number(chatAtlasRevealState.supersessionInternalDepth || 0),
      revealSupersessionInternalExpectationActive: chatAtlasRevealState.supersessionInternalExpectationActive === true,
      revealSupersessionPointerScrollArmed: chatAtlasRevealState.supersessionPointerScrollArmed === true,
      revealSupersessionMsAfterTopScroll: Number(chatAtlasRevealState.supersessionMsAfterTopScroll || 0),
      revealSupersessionScrollTopBefore: Number(chatAtlasRevealState.supersessionScrollTopBefore || 0),
      revealSupersessionScrollTopAfter: Number(chatAtlasRevealState.supersessionScrollTopAfter || 0),
      revealSupersessionExpectedInternalTop: Number(chatAtlasRevealState.supersessionExpectedInternalTop || 0),
      revealSupersessionReason: chatAtlasRevealState.supersessionReason,
      revealReconcileState: String(chatAtlasRevealState.reconcileState || 'idle'),
      revealReconcileReason: chatAtlasRevealState.reconcileReason,
      revealReconcileAuthorityProbes: Number(chatAtlasRevealState.reconcileAuthorityProbes || 0),
      revealReconcileScrollWakeups: Number(chatAtlasRevealState.reconcileScrollWakeups || 0),
      revealReconcileScheduledProbes: Number(chatAtlasRevealState.reconcileScheduledProbes || 0),
      revealReconcileScheduledCap: CHAT_ATLAS_REVEAL_RECONCILE_SCHEDULED_MAX,
      revealReconcileStartedAtNavigationMs: Number(chatAtlasRevealState.reconcileStartedAtNavigationMs || 0),
      revealReconcileLastProbeAtNavigationMs: Number(chatAtlasRevealState.reconcileLastProbeAtNavigationMs || 0),
      revealReconcileTerminalElapsedMs: Number(chatAtlasRevealState.reconcileTerminalElapsedMs || 0),
      revealReconcileRetryPending: chatAtlasRevealState.reconcileRetryPending === true,
      revealReconcileDeadlineMs: CHAT_ATLAS_REVEAL_RECONCILE_DEADLINE_MS,
      revealReadinessDeadlineMs: CHAT_ATLAS_REVEAL_READINESS_DEADLINE_MS,
      revealScopeDriftField: chatAtlasRevealState.driftField,
      revealScopeDriftPhase: String(chatAtlasRevealState.transactionState || 'idle'),
      revealScopeHardInvalidation: chatAtlasRevealState.driftHard === true,
      revealScopeRestorePermitted: chatAtlasRevealRestorePermitted(),
      revealScopeDriftBeforeHash: chatAtlasRevealState.pin
        ? `djb2:${chatAtlasCompleteIndexStableHash(String(chatAtlasRevealState.pin.divergenceFingerprint || ''))}`
        : null,
      revealScopeDriftAfterHash: chatAtlasRevealState.pin
        ? `djb2:${chatAtlasCompleteIndexStableHash(String(chatAtlasRevealCurrentPin({
          order: chatAtlasRevealState.pin.targetOrder,
          qId: chatAtlasRevealState.pin.targetQId,
          currentAId: chatAtlasRevealState.pin.targetCurrentAId,
          expectedAId: chatAtlasRevealState.pin.targetExpectedAId,
        }).divergenceFingerprint || ''))}`
        : null,
      ...chatAtlasRevealContainerDiagnostics(),
    });
  }

  // Pairing parity between the selected-chain projection and the canonical
  // host-payload projection, on the columns production actually compares.
  function chatAtlasSelectedChainCanonicalParity() {
    const blank = (reason) => chatAtlasFreeze({
      ok: false, reason, comparedRows: 0, mismatchCount: 0, firstMismatchOrder: 0,
    });
    const canonical = chatAtlasCanonicalPresentationIndex();
    if (!Array.isArray(canonical?.turns) || !canonical.turns.length) return blank('canonical-unavailable');
    let computed = null;
    try { computed = chatAtlasComputeDefaultLatestCreatedPath(); } catch { computed = null; }
    if (computed?.ok !== true) return blank(computed?.reason || 'default-path-unavailable');
    const byQId = new Map(canonical.turns.map((turn) => [
      chatAtlasCompleteIndexIdentity(turn?.qId), turn,
    ]));
    let compared = 0;
    let mismatches = 0;
    let firstMismatchOrder = 0;
    for (const turn of computed.turns) {
      const canonicalRow = byQId.get(chatAtlasCompleteIndexIdentity(turn?.qId));
      if (!canonicalRow) continue;
      compared += 1;
      if (
        chatAtlasCompleteIndexIdentity(turn?.primaryAId)
        !== chatAtlasCompleteIndexIdentity(canonicalRow?.primaryAId)
      ) {
        mismatches += 1;
        if (!firstMismatchOrder) firstMismatchOrder = Number(turn?.order || 0);
      }
    }
    return chatAtlasFreeze({
      ok: compared > 0 && mismatches === 0,
      reason: compared === 0 ? 'no-shared-rows' : (mismatches ? 'primary-answer-mismatch' : null),
      comparedRows: compared,
      mismatchCount: mismatches,
      firstMismatchOrder,
    });
  }

  const CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT = 12;

  const chatAtlasFullIndexState = {
    status: 'idle',
    chatId: null,
    routeKey: '',
    generation: 0,
    fetchCount: 0,
    startedAt: null,
    completedAt: null,
    errorCode: null,
    index: null,
    promise: null,
    controller: null,
    attempted: false,
  };


  function chatAtlasFullIndexReadMiniMapRows() {
    const readApi = (target) => {
      if (!target) return null;
      try {
        const candidate = target.H2O_MM_CORE_API
          || target.H2O_MM_SHARED?.get?.()?.api?.core
          || target.H2O_MM_SHARED?.api?.core
          || null;
        return typeof candidate?.getTurnList === 'function' ? candidate : null;
      } catch {
        return null;
      }
    };
    let topWindow = null;
    try { topWindow = W?.top || null; } catch { topWindow = null; }
    const api = readApi(topWindow) || readApi(W);
    if (!api) return [];
    try {
      const rows = api.getTurnList();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function chatAtlasFullIndexProjectionRow(row, order) {
    const qId = chatAtlasNormalizeId(row?.qId || row?.questionId || '') || null;
    const primaryAId = chatAtlasNormalizeId(row?.primaryAId || row?.answerId || '') || null;
    const rawVariants = Array.isArray(row?.answerVariants)
      ? row.answerVariants
      : (Array.isArray(row?.answerIds) ? row.answerIds : []);
    const answerVariants = [];
    for (const rawId of rawVariants) {
      const answerId = chatAtlasNormalizeId(rawId?.id || rawId);
      if (answerId && !answerVariants.includes(answerId)) answerVariants.push(answerId);
    }
    if (primaryAId && !answerVariants.includes(primaryAId)) answerVariants.push(primaryAId);
    return {
      order: Number(row?.order || row?.turnNo || row?.index || order) || order,
      qId,
      primaryAId,
      answerVariants,
      noAnswer: row?.noAnswer === true || (!primaryAId && answerVariants.length === 0),
    };
  }

  function chatAtlasFullIndexCompareProjection(indexTurns, rows, source) {
    const expected = (Array.isArray(indexTurns) ? indexTurns : [])
      .map((row, index) => chatAtlasFullIndexProjectionRow(row, index + 1));
    const actual = (Array.isArray(rows) ? rows : [])
      .map((row, index) => chatAtlasFullIndexProjectionRow(row, index + 1));
    const expectedByQId = new Map(expected.filter((row) => row.qId).map((row) => [row.qId, row]));
    const actualByQId = new Map(actual.filter((row) => row.qId).map((row) => [row.qId, row]));
    const samples = [];
    const pushSample = (kind, evidence = {}) => {
      if (samples.length >= CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT) return;
      samples.push({ source, kind, ...evidence });
    };
    let missingCount = 0;
    let extraCount = 0;
    let orderMismatchCount = 0;
    let primaryMismatchCount = 0;
    let variantMismatchCount = 0;
    let noAnswerMismatchCount = 0;

    for (const expectedRow of expected) {
      if (!expectedRow.qId || actualByQId.has(expectedRow.qId)) continue;
      missingCount += 1;
      pushSample('missing-from-projection', { qId: expectedRow.qId });
    }
    for (const actualRow of actual) {
      if (!actualRow.qId || expectedByQId.has(actualRow.qId)) continue;
      extraCount += 1;
      pushSample('projection-only', { qId: actualRow.qId });
    }
    for (const [qId, expectedRow] of expectedByQId) {
      const actualRow = actualByQId.get(qId);
      if (!actualRow) continue;
      if (expectedRow.order !== actualRow.order) {
        orderMismatchCount += 1;
        pushSample('order-mismatch', { qId, expected: expectedRow.order, actual: actualRow.order });
      }
      if (expectedRow.primaryAId !== actualRow.primaryAId) {
        primaryMismatchCount += 1;
        pushSample('primary-mismatch', {
          qId,
          expected: expectedRow.primaryAId,
          actual: actualRow.primaryAId,
        });
      }
      if (JSON.stringify(expectedRow.answerVariants) !== JSON.stringify(actualRow.answerVariants)) {
        variantMismatchCount += 1;
        pushSample('variant-mismatch', {
          qId,
          expectedCount: expectedRow.answerVariants.length,
          actualCount: actualRow.answerVariants.length,
        });
      }
      if (expectedRow.noAnswer !== actualRow.noAnswer) {
        noAnswerMismatchCount += 1;
        pushSample('no-answer-mismatch', {
          qId,
          expected: expectedRow.noAnswer,
          actual: actualRow.noAnswer,
        });
      }
    }
    return {
      source,
      count: actual.length,
      missingCount,
      extraCount,
      orderMismatchCount,
      primaryMismatchCount,
      variantMismatchCount,
      noAnswerMismatchCount,
      samples,
    };
  }

  function chatAtlasCompareFullConversationIndex(index = chatAtlasFullIndexState.index) {
    const indexTurns = Array.isArray(index?.turns) ? index.turns : [];
    const canonical = chatAtlasFullIndexCompareProjection(indexTurns, listTurnRecords(), 'canonical');
    const ledger = chatAtlasFullIndexCompareProjection(
      indexTurns,
      buildChatAtlasLedgerCanonicalRecords(),
      'ledger',
    );
    const minimap = chatAtlasFullIndexCompareProjection(indexTurns, chatAtlasFullIndexReadMiniMapRows(), 'minimap');
    const sources = [canonical, ledger, minimap];
    const boundedSamples = [];
    for (const source of sources) {
      for (const sample of source.samples) {
        if (boundedSamples.length >= CHAT_ATLAS_FULL_INDEX_SAMPLE_LIMIT) break;
        boundedSamples.push(sample);
      }
    }
    const orderMismatchCount = sources.reduce((sum, item) => sum + item.orderMismatchCount, 0);
    const primaryMismatchCount = sources.reduce((sum, item) => sum + item.primaryMismatchCount, 0);
    const variantMismatchCount = sources.reduce((sum, item) => sum + item.variantMismatchCount, 0);
    const noAnswerMismatchCount = sources.reduce((sum, item) => sum + item.noAnswerMismatchCount, 0);
    const identityMismatch = sources.some((item) => (
      item.extraCount > 0
      || item.primaryMismatchCount > 0
      || item.variantMismatchCount > 0
      || item.noAnswerMismatchCount > 0
    ));
    const projectionIncomplete = sources.some((item) => item.missingCount > 0 && item.count < indexTurns.length);
    return {
      canonicalCount: canonical.count,
      ledgerCount: ledger.count,
      minimapCount: minimap.count,
      missingFromCanonicalCount: canonical.missingCount,
      extraInCanonicalCount: canonical.extraCount,
      missingFromLedgerCount: ledger.missingCount,
      extraInLedgerCount: ledger.extraCount,
      missingFromMiniMapCount: minimap.missingCount,
      extraInMiniMapCount: minimap.extraCount,
      orderMismatchCount,
      primaryMismatchCount,
      variantMismatchCount,
      noAnswerMismatchCount,
      projectionIncomplete,
      classification: projectionIncomplete
        ? 'projection-incomplete'
        : (identityMismatch ? 'identity-mismatch' : 'exact'),
      boundedSamples,
    };
  }

  function getConversationTurnIndexDiagnostics() {
    if (completeTurnIndexAuthorityState.enabled) {
      const authority = getCompleteTurnIndexProjectionStatus();
      const index = completeTurnIndexAuthorityState.index;
      const comparisons = index ? chatAtlasCompareFullConversationIndex(index) : null;
      return chatAtlasFreeze({
        status: authority.status,
        chatId: authority.chatId,
        fetchCount: authority.fetchCount,
        startedAt: authority.startedAt,
        completedAt: authority.completedAt,
        errorCode: authority.errorCode,
        index: authority.authoritative ? {
          schema: COMPLETE_TURN_INDEX_CACHE_SCHEMA,
          count: authority.count,
          fingerprint: authority.fingerprint,
          payloadUpdateTime: authority.payloadUpdateTime,
          completenessProof: authority.completenessProof,
          noAnswerCount: index.turns.filter((turn) => turn.noAnswer === true).length,
          variantTurnCount: index.turns.filter((turn) => turn.answerVariants.length > 1).length,
        } : null,
        comparisons,
        authority,
      });
    }
    const index = chatAtlasFullIndexState.index;
    const comparisons = index ? chatAtlasCompareFullConversationIndex(index) : null;
    const turns = Array.isArray(index?.turns) ? index.turns : [];
    return chatAtlasFreeze({
      status: chatAtlasFullIndexState.status,
      chatId: chatAtlasFullIndexState.chatId,
      fetchCount: chatAtlasFullIndexState.fetchCount,
      startedAt: chatAtlasFullIndexState.startedAt,
      completedAt: chatAtlasFullIndexState.completedAt,
      errorCode: chatAtlasFullIndexState.errorCode,
      index: index ? {
        schema: Number(index.schema || 0) || null,
        count: turns.length,
        fingerprint: String(index.sourceFingerprint || '') || null,
        payloadUpdateTime: index.payloadUpdateTime ?? null,
        completenessProof: String(index?.completeness?.proof || '') || null,
        noAnswerCount: turns.filter((turn) => turn?.noAnswer === true).length,
        variantTurnCount: turns.filter((turn) => Array.isArray(turn?.answerVariants) && turn.answerVariants.length > 1).length,
      } : null,
      comparisons,
    });
  }

  function chatAtlasResetFullIndexRoute(nextRoute, staleStatus = false) {
    try { chatAtlasFullIndexState.controller?.abort?.('route-changed'); } catch {}
    chatAtlasFullIndexState.generation += 1;
    chatAtlasFullIndexState.status = staleStatus ? 'stale-route-discarded' : 'idle';
    chatAtlasFullIndexState.chatId = nextRoute?.chatId || null;
    chatAtlasFullIndexState.routeKey = nextRoute?.routeKey || '';
    chatAtlasFullIndexState.fetchCount = 0;
    chatAtlasFullIndexState.startedAt = null;
    chatAtlasFullIndexState.completedAt = staleStatus ? new Date().toISOString() : null;
    chatAtlasFullIndexState.errorCode = null;
    chatAtlasFullIndexState.index = null;
    chatAtlasFullIndexState.promise = null;
    chatAtlasFullIndexState.controller = null;
    chatAtlasFullIndexState.attempted = false;
  }

  function chatAtlasTriggerFullConversationIndex() {
    if (completeTurnIndexAuthorityState.enabled) return chatAtlasTriggerCompleteIndexAuthority();
    const route = chatAtlasFullIndexRoute();
    const routeChanged = route.routeKey !== chatAtlasFullIndexState.routeKey
      || route.chatId !== chatAtlasFullIndexState.chatId;
    if (routeChanged) {
      const stale = chatAtlasFullIndexState.status === 'loading-full-index';
      chatAtlasResetFullIndexRoute(route, stale && !route.chatId);
    }
    if (!route.chatId) return Promise.resolve(getConversationTurnIndexDiagnostics());
    if (chatAtlasFullIndexState.promise) return chatAtlasFullIndexState.promise;
    if (chatAtlasFullIndexState.attempted) return Promise.resolve(getConversationTurnIndexDiagnostics());
    const provider = H2O.archiveBoot?.fetchConversationTurnIndex;
    if (typeof provider !== 'function') return Promise.resolve(getConversationTurnIndexDiagnostics());

    const Controller = W.AbortController;
    const controller = typeof Controller === 'function' ? new Controller() : null;
    const generation = chatAtlasFullIndexState.generation;
    const routeKey = route.routeKey;
    chatAtlasFullIndexState.attempted = true;
    chatAtlasFullIndexState.fetchCount += 1;
    chatAtlasFullIndexState.status = 'loading-full-index';
    chatAtlasFullIndexState.startedAt = new Date().toISOString();
    chatAtlasFullIndexState.completedAt = null;
    chatAtlasFullIndexState.errorCode = null;
    chatAtlasFullIndexState.controller = controller;
    const operation = Promise.resolve()
      .then(() => provider(route.chatId, { signal: controller?.signal }))
      .then((result) => {
        const stillCurrent = generation === chatAtlasFullIndexState.generation
          && routeKey === chatAtlasFullIndexState.routeKey
          && route.chatId === chatAtlasFullIndexState.chatId;
        if (!stillCurrent) {
          if (!chatAtlasFullIndexState.chatId && chatAtlasFullIndexState.status === 'idle') {
            chatAtlasFullIndexState.status = 'stale-route-discarded';
            chatAtlasFullIndexState.completedAt = new Date().toISOString();
          }
          return getConversationTurnIndexDiagnostics();
        }
        chatAtlasFullIndexState.completedAt = new Date().toISOString();
        const validIndex = result?.ok === true
          && Number(result?.index?.schema) === 1
          && chatAtlasNormalizeId(result?.index?.chatId) === route.chatId
          && result?.index?.completeness?.complete === true
          && result?.index?.completeness?.proof === 'host-payload-full-graph'
          && Array.isArray(result?.index?.turns);
        if (validIndex) {
          chatAtlasFullIndexState.index = result.index;
          chatAtlasFullIndexState.status = 'complete-from-host-payload';
          chatAtlasFullIndexState.errorCode = null;
        } else {
          chatAtlasFullIndexState.index = null;
          chatAtlasFullIndexState.status = 'full-index-unavailable';
          chatAtlasFullIndexState.errorCode = String(
            result?.errorCode
            || (result?.ok === true ? 'full-index-envelope-invalid' : 'full-index-unavailable'),
          ).slice(0, 96);
        }
        return getConversationTurnIndexDiagnostics();
      })
      .catch((error) => {
        if (generation === chatAtlasFullIndexState.generation && routeKey === chatAtlasFullIndexState.routeKey) {
          chatAtlasFullIndexState.index = null;
          chatAtlasFullIndexState.status = 'full-index-unavailable';
          chatAtlasFullIndexState.completedAt = new Date().toISOString();
          chatAtlasFullIndexState.errorCode = String(error?.code || 'provider-failed').slice(0, 96);
        }
        return getConversationTurnIndexDiagnostics();
      })
      .finally(() => {
        if (generation === chatAtlasFullIndexState.generation && routeKey === chatAtlasFullIndexState.routeKey) {
          chatAtlasFullIndexState.promise = null;
          chatAtlasFullIndexState.controller = null;
        }
      });
    chatAtlasFullIndexState.promise = operation;
    return operation;
  }

  // ── Public Chat Atlas Core API ────────────────────────────────────────────
  // Registration key: TOPW.H2O_CHAT_ATLAS_CORE (plus H2O.chatAtlasCore for
  // namespace discovery). Kept narrow on purpose — Milestone 2B grows this file
  // enormously, and every name added here becomes a contract.
  const CHAT_ATLAS_CORE_API = {
    ver: CHAT_ATLAS_CORE_VER,

    // service registry
    _registerService: registerService,
    _registerLedgerService: (impl) => registerService(LEDGER_SERVICE, impl),
    getService,
    hasLedger,

    // host surface used by the Ledger
    getHost,

    // semantic Ledger reads (no raw state escapes)
    getLedgerMembers,
    getLedgerVersion,

    // policy / entry points
    selectCanonicalDrafts,
    scheduleLedgerFlush,
    startLedger,
    buildLedgerCanonicalRecords,

    // Peripheral subdomains moved in Milestone 2B-1
    revealDiagnostics: (...a) => chatAtlasRevealDiagnostics(...a),
    revealRunOneShot: (...a) => chatAtlasRevealRunOneShot(...a),
    revealReconcileTick: (...a) => chatAtlasRevealReconcileTick(...a),
    revealSupersede: (...a) => chatAtlasRevealSupersede(...a),
    // Two read-only facts H2O Core still consults while it owns the central
    // pipeline. Reveal state itself never leaves this file.
    getRevealTransactionState: () => chatAtlasRevealState.transactionState,
    getRevealReadinessTarget: () => chatAtlasRevealState.readinessTarget,
    fullIndexRoute: (...a) => chatAtlasFullIndexRoute(...a),
    triggerFullConversationIndex: (...a) => chatAtlasTriggerFullConversationIndex(...a),
    getConversationTurnIndexDiagnostics: (...a) => getConversationTurnIndexDiagnostics(...a),
  };

  try { TOPW.H2O_CHAT_ATLAS_CORE = CHAT_ATLAS_CORE_API; } catch {}
  if (W !== TOPW) { try { W.H2O_CHAT_ATLAS_CORE = CHAT_ATLAS_CORE_API; } catch {} }
  try { H2O.chatAtlasCore = CHAT_ATLAS_CORE_API; } catch {}
  try { TOPW.H2O_CHAT_ATLAS_CORE_READY = true; } catch {}

  // ── H2O.turnRuntime — Ledger-facing properties ────────────────────────────
  // H2O Core creates and owns the turnRuntime root; this file adopts the SAME
  // object and contributes only the Ledger-facing members it took over from
  // 0A1a. The certified surface is 37 properties and must stay 37: 31 remain
  // assigned by H2O Core, the 6 below move here. The Ledger never creates a
  // competing runtime root — it only supplies these implementations.
  (() => {
    const adopt = () => {
      const rt = (H2O && typeof H2O.turnRuntime === 'object' && H2O.turnRuntime)
        || (TOPW.H2O && typeof TOPW.H2O.turnRuntime === 'object' && TOPW.H2O.turnRuntime)
        || null;
      if (!rt) return false;
      Object.assign(rt, {
        getChatAtlasLedgerSnapshot: (...a) => ledger()?.getSnapshot?.(...a) ?? null,
        getChatAtlasLedgerDiagnostics: (...a) => ledger()?.getDiagnostics?.(...a) ?? null,
        getChatAtlasConvergenceParity: (...a) => ledger()?.getConvergenceParity?.(...a) ?? null,
        subscribeChatAtlasLedger: (...a) => ledger()?.subscribe?.(...a) ?? (() => {}),
        getChatAtlasCanonicalSource: (...a) => ledger()?.getCanonicalSource?.(...a) ?? 'legacy',
        setChatAtlasCanonicalSource: (...a) => ledger()?.setCanonicalSource?.(...a) ?? false,
      });
      return true;
    };
    // H2O Core loads first, so the root normally exists already. The ready
    // event is the project's own signal; there is no polling and no timeout.
    if (!adopt()) {
      try { H2O.events?.onReady?.('h2o:core:turnRuntime', adopt); } catch {}
      try { H2O.events?.onReady?.('h2o:core', adopt); } catch {}
    }
  })();
})();
