// ==UserScript==
// @h2o-id             0a1b.observer.hub
// @name               0A1b.⬛️🛰 Observer Hub 🛰
// @namespace          H2O.Premium.CGX.observer.hub
// @author             HumamDev
// @version            0.2.0
// @revision           001
// @build              260312-000001
// @description        Shared conversation observer hub (root resolve + start MO + root MO + suppression + coalesced fan-out).
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const D = document;
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  /* ───────────────────────────── ⬜️ 0) IDENTITY / META ───────────────────────────── */
  const TOK = 'OH';
  const PID = 'obsrhub';
  const CID = 'observerhub';
  const SkID = 'obsh';

  const MODTAG = 'ObserverHub';
  const MODICON = '🧼';
  const EMOJI_HDR = '⬛️🧼';
  const SUITE = 'prm';
  const HOST = 'cgx';

  const DsID = PID;
  const BrID = PID;

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || {
    tok: TOK,
    pid: PID,
    cid: CID,
    skid: SkID,
    modtag: MODTAG,
    modicon: MODICON,
    emoji: EMOJI_HDR,
    suite: SUITE,
    host: HOST,
  };
  VAULT.diag = VAULT.diag || {
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 180,
    errMax: 40,
  };
  VAULT.state = VAULT.state || {};

  const DIAG = VAULT.diag;
  const S = VAULT.state;

  H2O.KEYS = H2O.KEYS || {};
  H2O.EV = H2O.EV || {};
  H2O.SEL = H2O.SEL || {};
  H2O.UI = H2O.UI || {};

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const NS_MEM = `${TOK}:${PID}:guard`;
  const KEY_BOOT = `${NS_MEM}:booted`;

  /* ───────────────────────────── ⬜️ 1) EVENTS / SELECTORS ───────────────────────────── */
  const EV_OBS_READY = 'evt:h2o:obs:ready';
  const EV_OBS_ROOT_CHANGED = 'evt:h2o:obs:rootchanged';
  const EV_OBS_MUTATIONS = 'evt:h2o:obs:mutations';
  const EV_OBS_FLUSH = 'evt:h2o:obs:flush';

  H2O.EV[`${TOK}_READY`] = H2O.EV[`${TOK}_READY`] || EV_OBS_READY;
  H2O.EV[`${TOK}_ROOT_CHANGED`] = H2O.EV[`${TOK}_ROOT_CHANGED`] || EV_OBS_ROOT_CHANGED;
  H2O.EV[`${TOK}_MUTATIONS`] = H2O.EV[`${TOK}_MUTATIONS`] || EV_OBS_MUTATIONS;
  H2O.EV[`${TOK}_FLUSH`] = H2O.EV[`${TOK}_FLUSH`] || EV_OBS_FLUSH;

  const ATTR_CGX_OWNER = 'data-cgxui-owner';

  const SEL_MSG_Q =
    H2O.SEL.HC_USER ||
    '[data-message-author-role="user"]';

  const SEL_MSG_A =
    H2O.SEL.HC_ASSISTANT ||
    '[data-message-author-role="assistant"]';

  const SEL_MSG_ANY = `${SEL_MSG_Q}, ${SEL_MSG_A}`;

  const SEL_CONV_TURN =
    H2O.SEL.CONV_TURN ||
    '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';

  const SEL_CONV_ROOT_HINTS = [
    '[data-testid="conversation-turns"]',
    '[data-testid^="conversation-turns"]',
    'main',
  ].join(', ');

  /* ───────────────────────────── ⬜️ 2) STATE ───────────────────────────── */
  S.booted = !!S.booted;
  S.root = S.root || null;
  S.rootStrategy = String(S.rootStrategy || '');
  S.rootVersion = Number(S.rootVersion || 0);

  S.startMO = S.startMO || null;
  S.rootMO = S.rootMO || null;

  S.subs = (S.subs instanceof Map) ? S.subs : new Map();
  S.subSeq = Number(S.subSeq || 0);

  S.flushRAF = Number(S.flushRAF || 0);
  S.flushTimer = Number(S.flushTimer || 0);

  S.suppressMap = (S.suppressMap instanceof Map) ? S.suppressMap : new Map();
  S.suppressSeq = Number(S.suppressSeq || 0);

  S.pending = isPendingShape(S.pending) ? S.pending : createPending();
  S.pendingDirty = !!S.pendingDirty;

  S.counts = S.counts || {};
  S.counts.rawMutationBatches = Number(S.counts.rawMutationBatches || 0);
  S.counts.deliveredFlushes = Number(S.counts.deliveredFlushes || 0);
  S.counts.suppressedBatches = Number(S.counts.suppressedBatches || 0);
  S.counts.ownedUiIgnored = Number(S.counts.ownedUiIgnored || 0);

  S.lastMutationAt = Number(S.lastMutationAt || 0);
  S.lastFlushAt = Number(S.lastFlushAt || 0);

  /* ───────────────────────────── ⬜️ 3) SAFE / DIAG / BUS ───────────────────────────── */
  function SAFE_now() {
    const t = Date.now();
    return Number.isFinite(t) ? t : 0;
  }

  function SAFE_raf(fn) {
    const schedule = H2O.runtime?.schedule;
    if (schedule && typeof schedule.rafOnce === 'function') {
      try {
        return schedule.rafOnce('obs:raf', fn);
      } catch (err) {
        DIAG_err('schedule:raf', err);
      }
    }
    try {
      return W.requestAnimationFrame(fn);
    } catch {
      return W.setTimeout(fn, 16);
    }
  }

  function SAFE_caf(id) {
    const schedule = H2O.runtime?.schedule;
    if (schedule && typeof schedule.cancel === 'function') {
      try {
        schedule.cancel('obs:raf');
        return;
      } catch (err) {
        DIAG_err('schedule:cancel', err);
      }
    }
    try {
      W.cancelAnimationFrame(id);
      return;
    } catch {}
    try {
      W.clearTimeout(id);
    } catch {}
  }

  function SAFE_emit(evt, detail = {}) {
    const emitTarget = H2O.events?.emit || H2O.bus?.emit;
    if (typeof emitTarget === 'function') {
      try { emitTarget(evt, detail); } catch (err) { DIAG_err(`emit:${evt}`, err); }
      return;
    }
    try { W.dispatchEvent(new CustomEvent(evt, { detail })); } catch (err) { DIAG_err(`domemit:${evt}`, err); }
  }

  function DIAG_log(step, data = null) {
    try {
      DIAG.steps.push({ step: String(step || ''), ts: SAFE_now(), data });
      if (DIAG.steps.length > DIAG.bufMax) DIAG.steps.splice(0, DIAG.steps.length - DIAG.bufMax);
    } catch {}
  }

  function DIAG_err(where, err) {
    try {
      DIAG.errors.push({
        where: String(where || ''),
        ts: SAFE_now(),
        error: String(err?.stack || err || ''),
      });
      if (DIAG.errors.length > DIAG.errMax) DIAG.errors.splice(0, DIAG.errors.length - DIAG.errMax);
    } catch {}
    try { console.warn('[H2O ObserverHub]', where, err); } catch {}
  }

  /* ───────────────────────────── ⬜️ 4) BASIC HELPERS ───────────────────────────── */
  function q(sel, root = D) {
    try { return sel ? root.querySelector(sel) : null; } catch { return null; }
  }

  function qq(sel, root = D) {
    try { return sel ? Array.from(root.querySelectorAll(sel)) : []; } catch { return []; }
  }

  function isEl(node) {
    return !!(node && node.nodeType === 1);
  }

  function dedupePush(arr, el, max = 40) {
    if (!Array.isArray(arr) || !isEl(el)) return;
    if (arr.includes(el)) return;
    if (arr.length >= max) return;
    arr.push(el);
  }

  function isOwnedUiNode(node) {
    if (!isEl(node)) return false;
    try {
      if (node.hasAttribute?.(ATTR_CGX_OWNER)) return true;
      return !!node.closest?.(`[${ATTR_CGX_OWNER}]`);
    } catch {
      return false;
    }
  }

  function isTurnNode(node) {
    if (!isEl(node)) return false;
    try {
      return !!(
        node.matches?.(SEL_CONV_TURN)
        || node.querySelector?.(SEL_CONV_TURN)
      );
    } catch {
      return false;
    }
  }

  function isAnswerNode(node) {
    if (!isEl(node)) return false;
    try {
      return !!(
        node.matches?.(SEL_MSG_A)
        || node.querySelector?.(SEL_MSG_A)
      );
    } catch {
      return false;
    }
  }

  function isConversationRelevantNode(node) {
    if (!isEl(node)) return false;
    if (isOwnedUiNode(node)) return false;
    try {
      return !!(
        node.matches?.(SEL_CONV_TURN)
        || node.matches?.(SEL_MSG_ANY)
        || node.querySelector?.(SEL_CONV_TURN)
        || node.querySelector?.(SEL_MSG_ANY)
      );
    } catch {
      return false;
    }
  }

  function findRelevantTurnEls(node) {
    if (!isEl(node) || isOwnedUiNode(node)) return [];
    const out = [];
    try {
      if (node.matches?.(SEL_CONV_TURN)) out.push(node);
    } catch {}
    try {
      const found = qq(SEL_CONV_TURN, node);
      for (const el of found) dedupePush(out, el, 30);
    } catch {}
    return out;
  }

  function findRelevantAnswerEls(node) {
    if (!isEl(node) || isOwnedUiNode(node)) return [];
    const out = [];
    try {
      if (node.matches?.(SEL_MSG_A)) out.push(node);
    } catch {}
    try {
      const found = qq(SEL_MSG_A, node);
      for (const el of found) dedupePush(out, el, 30);
    } catch {}
    return out;
  }

  function createPending() {
    return {
      ts: 0,
      reason: '',
      rawBatchCount: 0,

      hasAdded: false,
      hasRemoved: false,
      conversationRelevant: false,

      addedCount: 0,
      removedCount: 0,

      addedElements: [],
      removedElements: [],

      addedTurnCandidates: new Set(),
      addedAnswerCandidates: [],

      removedTurnLike: false,
      removedAnswerLike: false,

      ownedUiIgnored: 0,
      meta: {},
    };
  }

  function isPendingShape(v) {
    return !!(v && typeof v === 'object' && v.addedTurnCandidates instanceof Set && Array.isArray(v.addedElements));
  }

  function resetPending() {
    S.pending = createPending();
    S.pendingDirty = false;
    return S.pending;
  }

  /* ───────────────────────────── ⬜️ 5) ROOT RESOLUTION ───────────────────────────── */
  function resolveConversationRoot() {
    const direct = q('[data-testid="conversation-turns"]') || q('[data-testid^="conversation-turns"]');
    if (direct && direct.isConnected) {
      return { root: direct, strategy: 'root:conversation-turns' };
    }

    const firstTurn = q(SEL_CONV_TURN);
    if (firstTurn && firstTurn.isConnected) {
      const hinted = firstTurn.closest?.(SEL_CONV_ROOT_HINTS);
      if (hinted && hinted.isConnected) {
        return { root: hinted, strategy: 'root:turn.closest' };
      }

      if (firstTurn.parentElement && firstTurn.parentElement.isConnected) {
        return { root: firstTurn.parentElement, strategy: 'root:turn.parent' };
      }
    }

    const firstMsg = q(SEL_MSG_ANY);
    if (firstMsg && firstMsg.isConnected) {
      const hinted = firstMsg.closest?.(SEL_CONV_ROOT_HINTS);
      if (hinted && hinted.isConnected) {
        return { root: hinted, strategy: 'root:msg.closest' };
      }
      if (firstMsg.parentElement && firstMsg.parentElement.isConnected) {
        return { root: firstMsg.parentElement, strategy: 'root:msg.parent' };
      }
    }

    const main = q('main');
    if (main && main.isConnected) {
      return { root: main, strategy: 'root:main' };
    }

    return { root: null, strategy: 'root:none' };
  }

  function installStartMO() {
    if (S.startMO) return S.startMO;
    if (typeof MutationObserver !== 'function') return null;

    S.startMO = new MutationObserver(() => {
      API_OH_ensureRoot('start:mutation');
    });

    try {
      S.startMO.observe(D.documentElement || D.body, { childList: true, subtree: true });
      DIAG_log('startmo:install');
    } catch (err) {
      DIAG_err('startmo:observe', err);
      S.startMO = null;
    }

    return S.startMO;
  }

  function disconnectStartMO() {
    try { S.startMO?.disconnect?.(); } catch {}
    S.startMO = null;
  }

  function installRootMO(root) {
    if (!root || !root.isConnected || typeof MutationObserver !== 'function') return null;

    const sameRoot = S.rootMO && S.root === root;
    if (sameRoot) return S.rootMO;

    disconnectRootMO();
    S.root = root;

    S.rootMO = new MutationObserver((muts) => {
      try {
        S.counts.rawMutationBatches += 1;
        S.lastMutationAt = SAFE_now();

        const payload = API_OH_classifyMutations(muts);
        if (!payload.conversationRelevant) return;

        mergePending(payload, 'mo');
        if (isSuppressActive()) {
          S.counts.suppressedBatches += 1;
          S.pendingDirty = true;
          return;
        }

        scheduleFlush('mo');
      } catch (err) {
        DIAG_err('rootmo:callback', err);
      }
    });

    try {
      S.rootMO.observe(root, { childList: true, subtree: true });
      DIAG_log('rootmo:install', { strategy: S.rootStrategy });
    } catch (err) {
      DIAG_err('rootmo:observe', err);
      S.rootMO = null;
    }

    return S.rootMO;
  }

  function disconnectRootMO() {
    try { S.rootMO?.disconnect?.(); } catch {}
    S.rootMO = null;
  }

  /* ───────────────────────────── ⬜️ 6) SUBSCRIPTIONS ───────────────────────────── */
  function addSub(kind, owner, fn, opts = {}) {
    if (typeof fn !== 'function') return () => {};
    const id = ++S.subSeq;
    const rec = {
      id,
      kind: String(kind || ''),
      owner: String(owner || 'anon'),
      fn,
      once: !!opts.once,
      immediate: !!opts.immediate,
      allowDuringSuppress: !!opts.allowDuringSuppress,
    };
    S.subs.set(id, rec);

    return () => {
      try { S.subs.delete(id); } catch {}
    };
  }

  function removeSubsByOwner(owner) {
    const own = String(owner || '');
    if (!own) return 0;
    let removed = 0;
    for (const [id, rec] of S.subs.entries()) {
      if (rec?.owner === own) {
        S.subs.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  function deliver(kind, payload) {
    const idsToDelete = [];
    for (const [id, rec] of S.subs.entries()) {
      if (!rec || rec.kind !== kind) continue;
      if (kind === 'mut' && payload?.suppressActive && !rec.allowDuringSuppress) continue;
      try { rec.fn(payload); } catch (err) { DIAG_err(`deliver:${kind}:${rec.owner}`, err); }
      if (rec.once) idsToDelete.push(id);
    }
    for (const id of idsToDelete) S.subs.delete(id);
  }

  /* ───────────────────────────── ⬜️ 7) SUPPRESSION / FLUSH ───────────────────────────── */
  function isSuppressActive() {
    if (!(S.suppressMap instanceof Map) || !S.suppressMap.size) return false;
    const now = SAFE_now();
    for (const [token, rec] of S.suppressMap.entries()) {
      if (!rec) {
        S.suppressMap.delete(token);
        continue;
      }
      if (Number(rec.until || 0) > 0 && Number(rec.until || 0) <= now) {
        S.suppressMap.delete(token);
      }
    }
    return S.suppressMap.size > 0;
  }

  function mergePending(payload, reason = 'merge') {
    const p = S.pending || createPending();
    p.ts = payload?.ts || SAFE_now();
    p.reason = String(payload?.reason || reason || 'merge');
    p.rawBatchCount += Number(payload?.rawBatchCount || 0) || 1;

    p.hasAdded = p.hasAdded || !!payload?.hasAdded;
    p.hasRemoved = p.hasRemoved || !!payload?.hasRemoved;
    p.conversationRelevant = p.conversationRelevant || !!payload?.conversationRelevant;

    p.addedCount += Number(payload?.addedCount || 0);
    p.removedCount += Number(payload?.removedCount || 0);

    p.ownedUiIgnored += Number(payload?.ownedUiIgnored || 0);
    S.counts.ownedUiIgnored += Number(payload?.ownedUiIgnored || 0);

    if (Array.isArray(payload?.addedElements)) {
      for (const el of payload.addedElements) dedupePush(p.addedElements, el, 40);
    }
    if (Array.isArray(payload?.removedElements)) {
      for (const el of payload.removedElements) dedupePush(p.removedElements, el, 40);
    }
    if (payload?.addedTurnCandidates instanceof Set) {
      for (const el of payload.addedTurnCandidates) {
        if (isEl(el)) p.addedTurnCandidates.add(el);
      }
    }
    if (Array.isArray(payload?.addedAnswerCandidates)) {
      for (const el of payload.addedAnswerCandidates) dedupePush(p.addedAnswerCandidates, el, 40);
    }

    p.removedTurnLike = p.removedTurnLike || !!payload?.removedTurnLike;
    p.removedAnswerLike = p.removedAnswerLike || !!payload?.removedAnswerLike;

    p.meta = Object.assign({}, p.meta || {}, payload?.meta || {});
    S.pending = p;
    S.pendingDirty = true;
    return p;
  }

  function scheduleFlush(reason = 'mo') {
    const schedule = H2O.runtime?.schedule;
    if (schedule && typeof schedule.rafOnce === 'function') {
      schedule.rafOnce('obs:flush', () => API_OH_flush(reason));
      return;
    }
    if (S.flushRAF) return S.flushRAF;
    S.flushRAF = SAFE_raf(() => {
      S.flushRAF = 0;
      API_OH_flush(reason);
    });
    return S.flushRAF;
  }

  function buildPayloadFromPending(reason = 'flush') {
    const p = S.pending || createPending();
    return {
      source: 'observer-hub',
      reason: String(reason || p.reason || 'flush'),
      ts: SAFE_now(),

      root: S.root || null,
      rootConnected: !!(S.root && S.root.isConnected),

      suppressActive: isSuppressActive(),
      deferred: false,

      hasAdded: !!p.hasAdded,
      hasRemoved: !!p.hasRemoved,
      conversationRelevant: !!p.conversationRelevant,

      addedCount: Number(p.addedCount || 0),
      removedCount: Number(p.removedCount || 0),

      addedElements: Array.isArray(p.addedElements) ? p.addedElements.slice() : [],
      removedElements: Array.isArray(p.removedElements) ? p.removedElements.slice() : [],

      addedTurnCandidates: (p.addedTurnCandidates instanceof Set) ? new Set(p.addedTurnCandidates) : new Set(),
      addedAnswerCandidates: Array.isArray(p.addedAnswerCandidates) ? p.addedAnswerCandidates.slice() : [],

      removedTurnLike: !!p.removedTurnLike,
      removedAnswerLike: !!p.removedAnswerLike,

      ownedUiIgnored: Number(p.ownedUiIgnored || 0),
      rawBatchCount: Number(p.rawBatchCount || 0),

      meta: Object.assign({}, p.meta || {}, {
        strategy: S.rootStrategy || '',
      }),
    };
  }

  /* ───────────────────────────── ⬜️ 8) CLASSIFIER ───────────────────────────── */
  function API_OH_classifyMutations(muts) {
    const out = {
      source: 'observer-hub',
      reason: 'mo',
      ts: SAFE_now(),

      root: S.root || null,
      rootConnected: !!(S.root && S.root.isConnected),

      suppressActive: isSuppressActive(),
      deferred: false,

      hasAdded: false,
      hasRemoved: false,
      conversationRelevant: false,

      addedCount: 0,
      removedCount: 0,

      addedElements: [],
      removedElements: [],

      addedTurnCandidates: new Set(),
      addedAnswerCandidates: [],

      removedTurnLike: false,
      removedAnswerLike: false,

      ownedUiIgnored: 0,
      rawBatchCount: Array.isArray(muts) ? muts.length : 0,

      meta: {},
    };

    if (!Array.isArray(muts) || !muts.length) return out;

    for (const mut of muts) {
      const added = Array.from(mut?.addedNodes || []);
      const removed = Array.from(mut?.removedNodes || []);

      for (const node of added) {
        if (!isEl(node)) continue;
        if (isOwnedUiNode(node)) {
          out.ownedUiIgnored += 1;
          continue;
        }
        if (!isConversationRelevantNode(node)) continue;

        out.hasAdded = true;
        out.conversationRelevant = true;
        out.addedCount += 1;
        dedupePush(out.addedElements, node, 40);

        const turns = findRelevantTurnEls(node);
        for (const el of turns) out.addedTurnCandidates.add(el);

        const answers = findRelevantAnswerEls(node);
        for (const el of answers) dedupePush(out.addedAnswerCandidates, el, 40);
      }

      for (const node of removed) {
        if (!isEl(node)) continue;
        if (isOwnedUiNode(node)) {
          out.ownedUiIgnored += 1;
          continue;
        }
        if (!isConversationRelevantNode(node)) continue;

        out.hasRemoved = true;
        out.conversationRelevant = true;
        out.removedCount += 1;
        dedupePush(out.removedElements, node, 40);

        if (isTurnNode(node)) out.removedTurnLike = true;
        if (isAnswerNode(node)) out.removedAnswerLike = true;
      }
    }

    return out;
  }

  /* ───────────────────────────── ⬜️ 9) PUBLIC API ───────────────────────────── */
  function API_OH_getRoot() {
    if (S.root && S.root.isConnected) return S.root;
    if (S.root && !S.root.isConnected) {
      disconnectRootMO();
      S.root = null;
      S.rootStrategy = String(S.rootStrategy || 'root:stale');
      installStartMO();
    }
    return null;
  }

  function API_OH_ensureRoot(reason = 'manual') {
    const prev = API_OH_getRoot();
    const hit = resolveConversationRoot();

    if (!hit.root || !hit.root.isConnected) {
      S.root = null;
      S.rootStrategy = String(hit.strategy || 'root:none');
      installStartMO();
      return {
        ok: false,
        root: null,
        strategy: S.rootStrategy,
        reason: String(reason || ''),
        ts: SAFE_now(),
      };
    }

    S.root = hit.root;
    S.rootStrategy = String(hit.strategy || '');
    disconnectStartMO();
    installRootMO(hit.root);

    const changed = prev !== hit.root;
    if (changed) {
      S.rootVersion += 1;

      const detail = {
        source: 'observer-hub',
        reason: String(reason || ''),
        root: hit.root,
        rootConnected: true,
        strategy: S.rootStrategy,
        rootVersion: S.rootVersion,
        ts: SAFE_now(),
      };

      SAFE_emit(EV_OBS_ROOT_CHANGED, detail);
      SAFE_emit(EV_OBS_READY, detail);
      deliver('ready', detail);
      DIAG_log('root:changed', { strategy: S.rootStrategy, rootVersion: S.rootVersion });
    }

    return {
      ok: true,
      root: hit.root,
      strategy: S.rootStrategy,
      reason: String(reason || ''),
      ts: SAFE_now(),
    };
  }

  function API_OH_onReady(owner, fn, opts = {}) {
    const off = addSub('ready', owner, fn, opts);
    if (opts?.immediate && API_OH_getRoot()) {
      try {
        fn({
          source: 'observer-hub',
          reason: 'immediate',
          root: API_OH_getRoot(),
          rootConnected: true,
          strategy: S.rootStrategy,
          rootVersion: S.rootVersion,
          ts: SAFE_now(),
        });
      } catch (err) {
        DIAG_err(`onReady:immediate:${owner}`, err);
      }
    }
    return off;
  }

  function API_OH_onMutations(owner, fn, opts = {}) {
    return addSub('mut', owner, fn, opts);
  }

  function API_OH_off(owner) {
    return removeSubsByOwner(owner);
  }

  function API_OH_suppress(reason = '', ms = 0, meta = {}) {
    const token = ++S.suppressSeq;
    const waitMs = Math.max(0, Number(ms || 0) || 0);
    const until = waitMs ? (SAFE_now() + waitMs) : 0;

    const rec = {
      token,
      reason: String(reason || ''),
      until,
      meta: (meta && typeof meta === 'object') ? meta : {},
    };

    S.suppressMap.set(token, rec);

    if (waitMs > 0) {
      W.setTimeout(() => {
        API_OH_resume(token);
      }, waitMs + 4);
    }

    return {
      token,
      reason: rec.reason,
      until,
      release: () => API_OH_resume(token),
    };
  }

  function API_OH_resume(tokenOrOwner) {
    if (typeof tokenOrOwner === 'number') {
      S.suppressMap.delete(tokenOrOwner);
    } else if (typeof tokenOrOwner === 'string' && tokenOrOwner) {
      for (const [token, rec] of S.suppressMap.entries()) {
        if (rec?.reason === tokenOrOwner) S.suppressMap.delete(token);
      }
    } else {
      S.suppressMap.clear();
    }

    if (!isSuppressActive() && S.pendingDirty) {
      scheduleFlush('resume');
    }
    return true;
  }

  function API_OH_withSuppressed(reason, fn, opts = {}) {
    const handle = API_OH_suppress(reason, Number(opts?.ms || 0), opts?.meta || {});
    let out;
    try {
      out = fn?.();
    } catch (err) {
      handle.release();
      throw err;
    }

    if (out && typeof out.then === 'function') {
      return out.finally(() => {
        handle.release();
        if (opts?.flush !== false) API_OH_flush('withSuppressed:finally');
      });
    }

    handle.release();
    if (opts?.flush !== false) API_OH_flush('withSuppressed:finally');
    return out;
  }

  function API_OH_markDirty(reason = 'manual', meta = {}) {
    mergePending({
      source: 'observer-hub',
      reason: String(reason || 'manual'),
      ts: SAFE_now(),
      rawBatchCount: 0,
      hasAdded: false,
      hasRemoved: false,
      conversationRelevant: true,
      addedCount: 0,
      removedCount: 0,
      addedElements: [],
      removedElements: [],
      addedTurnCandidates: new Set(),
      addedAnswerCandidates: [],
      removedTurnLike: false,
      removedAnswerLike: false,
      ownedUiIgnored: 0,
      meta: (meta && typeof meta === 'object') ? meta : {},
    }, reason);
    scheduleFlush(reason);
    return true;
  }

  function API_OH_flush(reason = 'manual') {
    if (S.flushRAF) {
      SAFE_caf(S.flushRAF);
      S.flushRAF = 0;
    }

    if (isSuppressActive()) {
      S.pendingDirty = true;
      return false;
    }

    if (!S.pendingDirty) {
      const detail = {
        source: 'observer-hub',
        reason: String(reason || 'manual'),
        ts: SAFE_now(),
        root: API_OH_getRoot(),
        rootConnected: !!API_OH_getRoot(),
        suppressActive: false,
        deferred: false,
        conversationRelevant: false,
        hasAdded: false,
        hasRemoved: false,
        addedCount: 0,
        removedCount: 0,
        addedElements: [],
        removedElements: [],
        addedTurnCandidates: new Set(),
        addedAnswerCandidates: [],
        removedTurnLike: false,
        removedAnswerLike: false,
        ownedUiIgnored: 0,
        rawBatchCount: 0,
        meta: { strategy: S.rootStrategy || '' },
      };
      SAFE_emit(EV_OBS_FLUSH, detail);
      return true;
    }

    const detail = buildPayloadFromPending(reason);
    S.lastFlushAt = SAFE_now();
    S.counts.deliveredFlushes += 1;

    SAFE_emit(EV_OBS_MUTATIONS, detail);
    SAFE_emit(EV_OBS_FLUSH, detail);
    deliver('mut', detail);

    resetPending();
    return true;
  }

  function API_OH_stats() {
    return {
      rootConnected: !!(S.root && S.root.isConnected),
      rootStrategy: String(S.rootStrategy || ''),
      rootVersion: Number(S.rootVersion || 0),
      subscriberCount: S.subs.size,
      suppressDepth: S.suppressMap.size,
      pendingDirty: !!S.pendingDirty,
      lastMutationAt: Number(S.lastMutationAt || 0),
      lastFlushAt: Number(S.lastFlushAt || 0),
      counts: {
        rawMutationBatches: Number(S.counts.rawMutationBatches || 0),
        deliveredFlushes: Number(S.counts.deliveredFlushes || 0),
        suppressedBatches: Number(S.counts.suppressedBatches || 0),
        ownedUiIgnored: Number(S.counts.ownedUiIgnored || 0),
      },
    };
  }

  /* ───────────────────────────── ⬜️ 10) BOOT / DISPOSE ───────────────────────────── */
  function CORE_OH_boot() {
    if (S.booted) return;
    S.booted = true;

    API_OH_ensureRoot('boot');
    if (!API_OH_getRoot()) installStartMO();

    DIAG_log('boot:done', { ok: true });
  }

  function CORE_OH_dispose() {
    try { disconnectStartMO(); } catch {}
    try { disconnectRootMO(); } catch {}
    try { SAFE_caf(S.flushRAF); } catch {}
    S.flushRAF = 0;
    S.suppressMap?.clear?.();
    S.subs?.clear?.();
    resetPending();
    S.booted = false;
  }

  /* ───────────────────────────── ⬜️ 11) EXPOSE ───────────────────────────── */
  const API = {
    ver: '0.1.0',
    ensureRoot: API_OH_ensureRoot,
    getRoot: API_OH_getRoot,
    onReady: API_OH_onReady,
    onMutations: API_OH_onMutations,
    off: API_OH_off,
    suppress: API_OH_suppress,
    resume: API_OH_resume,
    withSuppressed: API_OH_withSuppressed,
    markDirty: API_OH_markDirty,
    flush: API_OH_flush,
    stats: API_OH_stats,
    classifyMutations: API_OH_classifyMutations,
    isOwnedUiNode,
    dispose: CORE_OH_dispose,
  };

  H2O.obs = API;
  W.H2O_ObserverHub = API;

  if (W[KEY_BOOT]) return;
  W[KEY_BOOT] = 1;

  CORE_OH_boot();
})();