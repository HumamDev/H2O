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
