// ==H2O Module==
// @h2o-id             0a4b.backend.acceptance.adapter
// @name               0A4b.⬛️🌐 Backend Acceptance Adapter 🌐
// @namespace          H2O.Premium.CGX.backend.acceptance
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260816-000001
// @description        Acceptance-only named feature adapter. Contains no backend transport.
// @match              https://chatgpt.com/*
// @run-at             document-start
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  const BOOT_KEY = '__h2oBackendAcceptanceBooted_v1';
  if (W[BOOT_KEY] && H2O.BackendAcceptance) return;

  const VERSION = 'h2o.backend-acceptance.v1';
  const READ_OPS = Object.freeze([
    'runtime-presence',
    'authority-status',
    'pacing-sample',
    'title-read',
    'archive-turn-index',
  ]);
  const MUTATION_OPS = Object.freeze(['title-patch', 'title-restore']);
  const READ_SET = new Set(READ_OPS);
  const MUTATION_SET = new Set(MUTATION_OPS);

  function frozen(value) {
    if (!value || typeof value !== 'object') return value;
    return Object.freeze(value);
  }

  function currentChatId() {
    const archive = H2O.archiveBoot;
    if (typeof archive?.getCurrentChatId === 'function') {
      const value = String(archive.getCurrentChatId() || '').trim();
      if (value && !value.startsWith('path:')) return value;
    }
    const value = String(H2O.util?.getChatId?.() || '').trim();
    return value && !value.startsWith('path:') ? value : '';
  }

  function authorityStatus() {
    const authority = H2O.BackendAuthority;
    if (typeof authority?.status !== 'function') {
      return frozen({
        ok: false,
        available: false,
        status: 'authority-unavailable',
        reason: 'authority-missing',
        cooldownMs: 0,
        supportedOrigin: '',
        origin: String(W.location?.origin || ''),
        lockName: '',
      });
    }
    const status = authority.status() || {};
    const available = status.available === true;
    return frozen({
      ok: available,
      available,
      status: available ? 'authority-available' : 'authority-unavailable',
      reason: String(status.reason || ''),
      cooldownMs: Math.max(0, Number(status.cooldownMs) || 0),
      supportedOrigin: String(status.supportedOrigin || ''),
      origin: String(status.origin || ''),
      lockName: String(status.lockName || ''),
    });
  }

  function runtimePresence() {
    const featureSurfaces = frozen({
      acceptance: typeof H2O.BackendAcceptance?.run === 'function',
      authority: typeof H2O.BackendAuthority?.status === 'function',
      title: typeof H2O.ChatTitle?.readNativeTitle === 'function',
      archive: typeof H2O.archiveBoot?.fetchConversationTurnIndex === 'function',
      identity: !!currentChatId(),
    });
    const ok = featureSurfaces.acceptance && featureSurfaces.authority
      && featureSurfaces.title && featureSurfaces.archive;
    return frozen({
      ok,
      status: ok ? 'runtime-present' : 'runtime-surface-missing',
      version: VERSION,
      pageOrigin: String(W.location?.origin || ''),
      featureSurfaces,
    });
  }

  function pacingSample() {
    const sampledAt = Date.now();
    const authority = authorityStatus();
    return frozen({
      ok: authority.ok,
      available: authority.available,
      status: authority.status,
      reason: authority.reason,
      cooldownMs: authority.cooldownMs,
      sampledAt,
    });
  }

  async function titleRead() {
    const chatId = currentChatId();
    if (!chatId) return frozen({ ok: false, status: 'missing-chat-id' });
    const feature = H2O.ChatTitle;
    if (typeof feature?.readNativeTitle !== 'function') {
      return frozen({ ok: false, status: 'title-feature-unavailable', chatId });
    }
    const result = await feature.readNativeTitle(chatId, { userInitiated: true });
    return frozen({
      ok: result?.ok === true,
      status: String(result?.status || 'title-read-failed'),
      reason: String(result?.reason || ''),
      statusCode: Number(result?.statusCode || 0),
      chatId,
      titlePresent: typeof result?.title === 'string' && result.title.length > 0,
      titleLength: typeof result?.title === 'string' ? result.title.length : 0,
      rateLimited: result?.rateLimited === true,
      retryAfterMs: Math.max(0, Number(result?.retryAfterMs) || 0),
    });
  }

  async function archiveTurnIndex() {
    const chatId = currentChatId();
    if (!chatId) return frozen({ ok: false, status: 'missing-chat-id' });
    const feature = H2O.archiveBoot;
    if (typeof feature?.fetchConversationTurnIndex !== 'function') {
      return frozen({ ok: false, status: 'archive-feature-unavailable', chatId });
    }
    const result = await feature.fetchConversationTurnIndex(chatId, { includeIdentityGraph: false });
    return frozen({
      ok: result?.ok === true,
      status: String(result?.status || result?.reason || (result?.ok === true ? 'turn-index-read' : 'turn-index-failed')),
      reason: String(result?.reason || ''),
      statusCode: Number(result?.statusCode || 0),
      chatId,
      turnCount: Array.isArray(result?.index?.turns) ? result.index.turns.length : 0,
      nodeCount: Number(result?.index?.nodeCount || result?.index?.completeness?.nodeCount || 0),
      complete: result?.index?.completeness?.complete === true,
      rateLimited: result?.rateLimited === true,
      retryAfterMs: Math.max(0, Number(result?.retryAfterMs) || 0),
    });
  }

  function mutationAllowed(args) {
    return Number(args?.phase) === 3 && args?.mutationAuthorized === true;
  }

  async function titleMutation(op, args) {
    if (!mutationAllowed(args)) return frozen({ ok: false, status: 'mutation-not-authorized' });
    const chatId = currentChatId();
    if (!chatId) return frozen({ ok: false, status: 'missing-chat-id' });
    const title = String(op === 'title-restore' ? args?.restoreTitle : args?.title || '').trim();
    if (!title) return frozen({ ok: false, status: 'missing-title', chatId });
    const feature = H2O.ChatTitle;
    if (typeof feature?.renameNative !== 'function') {
      return frozen({ ok: false, status: 'title-feature-unavailable', chatId });
    }
    const result = await feature.renameNative(title, { chatId, userInitiated: true });
    return frozen({
      ok: result?.ok === true,
      status: String(result?.status || 'title-mutation-failed'),
      reason: String(result?.reason || ''),
      statusCode: Number(result?.statusCode || 0),
      chatId,
      rateLimited: result?.rateLimited === true,
      retryAfterMs: Math.max(0, Number(result?.retryAfterMs) || 0),
    });
  }

  async function run(opRaw, args = {}) {
    const op = String(opRaw || '').trim();
    if (!READ_SET.has(op) && !MUTATION_SET.has(op)) {
      return frozen({ ok: false, status: 'op-not-allowlisted' });
    }
    if (op === 'runtime-presence') return runtimePresence();
    if (op === 'authority-status') return authorityStatus();
    if (op === 'pacing-sample') return pacingSample();
    if (op === 'title-read') return titleRead();
    if (op === 'archive-turn-index') return archiveTurnIndex();
    return titleMutation(op, args);
  }

  const api = Object.freeze({
    version: VERSION,
    operations: Object.freeze({ readOnly: READ_OPS, mutation: MUTATION_OPS }),
    run,
  });
  Object.defineProperty(H2O, 'BackendAcceptance', {
    value: api,
    configurable: false,
    enumerable: true,
    writable: false,
  });
  W[BOOT_KEY] = Object.freeze({ version: VERSION });
})();
