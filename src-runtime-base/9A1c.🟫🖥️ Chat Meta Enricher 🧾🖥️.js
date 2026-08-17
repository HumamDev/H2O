// ==H2O Module==
// @h2o-id             9a1c.chat-meta.enricher
// @name               9A1c.🟫🖥️ Chat Meta Enricher 🧾🖥️
// @namespace          H2O.Premium.CGX.interface.chatMetaEnricher
// @author             HumamDev
// @version            6.4
// @revision           002
// @build              260506-212559
// @description        Chat Meta Enricher: created date, answer count, preview tooltip, and pin sorting
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  if (window.__h2o_interface_meta_booted) return;
  if (!window.H2O?.interface?.version) { console.warn('[Meta] Kernel not ready'); return; }
  if (!window.__h2o_interface_decorator_booted) { console.warn('[Meta] Decorator not ready'); return; }

  // ✅ Phase 2 surface gate: skip on auth/settings/admin pages where the chat
  // list isn't relevant. Mirrors the gate in 9A1b Chat List Decorator; if the
  // decorator self-skipped we already early-returned via the boot-flag check
  // above, but this guard also protects the case where the decorator booted
  // first (e.g. on a chat URL) and then a later script-load somehow re-runs
  // this IIFE on a non-list surface.
  const _path9A1c = (typeof location !== 'undefined' && typeof location.pathname === 'string') ? location.pathname : '';
  if (/^\/(?:auth|settings|admin)(?:\/|$)/i.test(_path9A1c)) {
    try { console.info('[Meta] surface skip:', _path9A1c); } catch (_) {}
    return;
  }

  const I = window.H2O.interface;
  let selfHealStarted = false;
  let registryStorageBridgeBound = false;

  const _openChatMetaSyncDiag = {
    requestCount: 0,
    semanticStateReadCount: 0,
    expensiveAcquisitionCount: 0,
    signatureSkipCount: 0,
    notReadySkipCount: 0,
    listRuntimeTurnsCount: 0,
    loadedConversationDiscoveryCount: 0,
    interfaceStoreWriteCount: 0,
    interfaceStoreNoopCount: 0,
    miniMapForcedRefreshCount: 0,
    lastRequestReason: '',
    lastAcquiredChatId: '',
    lastAcquiredSignature: '',
    lastAcquisitionDurationMs: 0,
    lastSemanticComposerReady: false,
    lastSemanticUserTurnCount: 0,
    lastSemanticDomUserCount: 0,
  };

  const style = document.createElement("style");
  style.textContent = `
.ho-pinned-row::before{
  border-color: rgba(255,255,255,0.22) !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.08) !important;
}

.ho-meta-row{
  display:flex !important;
  align-items:center !important;
  justify-content: space-between !important; /* left text + right actions */
  gap: 10px !important;
  width: 100% !important;
  min-width: 0 !important;
  box-sizing: border-box !important;
  margin-top: 2px !important;
  font-size: 11px !important;
  color: rgba(255,255,255,0.45) !important;

  background: none !important;
  box-shadow: none !important;
  text-shadow: none !important;
  filter: none !important;
}

.ho-meta-lefttext{
  flex: 1 1 auto !important;
  min-width: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  max-width: none !important;
}

.ho-meta-actions-right{
  display:inline-flex !important;
  align-items:center !important;
  flex: 0 0 auto !important;
  margin-left: auto !important;
  gap: 10px !important;
  transform: translateY(0px) !important;
}

.ho-meta-row, .ho-meta-actions-right { position: relative !important; z-index: 5 !important; pointer-events: auto !important; }
.ho-meta-action { pointer-events: auto !important; }

/* Buttons base */
.ho-meta-action{
  position: relative !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;

  width: 20px !important;
  height: 20px !important;
  padding: 0 !important;
  border-radius: 7px !important;

  font-size: 0 !important;
  line-height: 0 !important;
  color: rgba(255,255,255,0.70) !important;
  cursor: pointer !important;
  user-select: none !important;

  border: 1px solid rgba(255,255,255,0.12) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.035)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.14),
    0 4px 12px rgba(0,0,0,0.20) !important;
  transition:
    background .15s ease,
    border-color .15s ease,
    color .15s ease,
    transform .15s ease,
    box-shadow .15s ease;
  overflow: hidden !important;
}

.ho-meta-action::before{
  content: "" !important;
  position: relative !important;
  z-index: 2 !important;
  width: 13px !important;
  height: 13px !important;
  background: currentColor !important;
  opacity: 0.9 !important;
  transition: opacity .15s ease, background .15s ease, transform .15s ease;
}

.ho-meta-action::after{
  content: "" !important;
  position: absolute !important;
  inset: 2px !important;
  border-radius: 5px !important;
  background: radial-gradient(circle at 35% 20%, rgba(255,255,255,0.22), transparent 56%) !important;
  opacity: 0.6 !important;
  pointer-events: none !important;
}

/* Chat info = small luminous info/star badge */
.ho-meta-action.ho-review::before{
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' fill-rule='evenodd' d='M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-1 8h2v6h-2v-6Zm0-4h2v2h-2V7Z'/%3E%3Cpath fill='black' d='M19.5 2.5l.55 1.4 1.45.6-1.45.6-.55 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z'/%3E%3C/svg%3E") center / contain no-repeat !important;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' fill-rule='evenodd' d='M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-1 8h2v6h-2v-6Zm0-4h2v2h-2V7Z'/%3E%3Cpath fill='black' d='M19.5 2.5l.55 1.4 1.45.6-1.45.6-.55 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z'/%3E%3C/svg%3E") center / contain no-repeat !important;
}

.ho-meta-action.ho-review{
  color: rgba(190,215,255,0.92) !important;
}

/* Pin = angled pushpin badge */
.ho-meta-action.ho-fix::before{
  width: 14px !important;
  height: 14px !important;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M14.1 2.7a1 1 0 0 1 1.4 0l5.8 5.8a1 1 0 0 1 0 1.4l-1.6 1.6a1 1 0 0 1-1.1.2l-2.7-1-3.7 3.7.8 3.5a1 1 0 0 1-1.7.9l-3.1-3.1-4.9 4.9a1 1 0 1 1-1.4-1.4l4.9-4.9-3.1-3.1a1 1 0 0 1 .9-1.7l3.5.8 3.7-3.7-1-2.7a1 1 0 0 1 .2-1.1l1.7-1.6Z'/%3E%3C/svg%3E") center / contain no-repeat !important;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M14.1 2.7a1 1 0 0 1 1.4 0l5.8 5.8a1 1 0 0 1 0 1.4l-1.6 1.6a1 1 0 0 1-1.1.2l-2.7-1-3.7 3.7.8 3.5a1 1 0 0 1-1.7.9l-3.1-3.1-4.9 4.9a1 1 0 1 1-1.4-1.4l4.9-4.9-3.1-3.1a1 1 0 0 1 .9-1.7l3.5.8 3.7-3.7-1-2.7a1 1 0 0 1 .2-1.1l1.7-1.6Z'/%3E%3C/svg%3E") center / contain no-repeat !important;
  transform: rotate(-8deg) !important;
}

.ho-meta-action:hover{
  color: rgba(255,255,255,0.96) !important;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.20), rgba(255,255,255,0.075)) !important;
  border-color: rgba(255,255,255,0.24) !important;
  transform: translateY(-0.5px) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.18),
    0 0 12px rgba(255,255,255,0.10),
    0 5px 14px rgba(0,0,0,0.25) !important;
}

/* Pin ON = warm gold badge */
.ho-meta-action.ho-fix.is-on{
  color: rgba(255,218,132,0.98) !important;
  background:
    linear-gradient(180deg, rgba(212,175,55,0.28), rgba(212,175,55,0.10)) !important;
  border-color: rgba(255,218,132,0.36) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,242,194,0.20),
    0 0 14px rgba(212,175,55,0.24) !important;
  opacity: 1 !important;
}

.ho-meta-action.is-on{
  color: rgba(255,255,255,0.98) !important;
}

/* ✅ MAIN LIST: hide extra snippet lines without JS (prevents refresh-jump) */
main .ho-snip-hidden{
  flex: 1 1 auto !important;
  min-width: 0 !important;
  width: 100% !important;
}

main .ho-snip-hidden > :not(:first-child):not(.ho-meta-row){
  display: none !important;
}

#ho-preview-tip{
  position: fixed !important;
  z-index: 2147483647 !important;
  background: #000 !important;
  border: 1px solid rgba(255,255,255,0.14) !important;
  border-radius: 10px !important;
  padding: 10px 12px !important;
  box-shadow: 0 12px 30px rgba(0,0,0,0.85) !important;

  color: rgba(255,255,255,0.92) !important;
  font-size: 12px !important;
  max-width: 320px !important;
  display: none !important;

  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  mix-blend-mode: normal !important;
  filter: none !important;
  isolation: isolate !important;
}
#ho-preview-tip.show{ display:block !important; }
#ho-preview-tip .t{ font-weight: 600 !important; margin-bottom: 6px !important; }
#ho-preview-tip .m{ color: rgba(255,255,255,0.70) !important; }
`;
  document.head.appendChild(style);

  function listRuntimeTurns() {
    _openChatMetaSyncDiag.listRuntimeTurnsCount += 1;
    try {
      const turns = window.H2O?.turnRuntime?.listTurns?.();
      if (Array.isArray(turns) && turns.length) return turns;
    } catch {}
    try {
      const turns = window.H2O?.turn?.getTurns?.();
      if (Array.isArray(turns) && turns.length) return turns;
    } catch {}
    return [];
  }

  function toPositiveInt(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  function uniqueCountFromList(list, idGetters = []) {
    if (!Array.isArray(list) || !list.length) return 0;
    const seen = new Set();
    let anonymous = 0;

    list.forEach((item) => {
      if (!item) return;
      let key = "";
      for (const getter of idGetters) {
        try {
          key = String(getter(item) || "").trim();
        } catch {
          key = "";
        }
        if (key) break;
      }

      if (key) {
        seen.add(key);
      } else {
        anonymous += 1;
      }
    });

    return seen.size + anonymous;
  }

  function listRuntimeAnswers(turns = listRuntimeTurns()) {
    const out = [];
    for (const turn of Array.isArray(turns) ? turns : []) {
      const answers = Array.isArray(turn?.answers) ? turn.answers : [];
      if (answers.length) {
        for (const answer of answers) {
          if (answer?.id || answer?.el) out.push({ id: String(answer?.id || '').trim(), el: answer?.el || null });
        }
        continue;
      }
      const answerIds = Array.isArray(turn?.answerIds) ? turn.answerIds : [];
      const answerEls = Array.isArray(turn?.live?.answerEls) ? turn.live.answerEls : [];
      if (answerIds.length || answerEls.length) {
        const length = Math.max(answerIds.length, answerEls.length);
        for (let index = 0; index < length; index += 1) {
          const id = String(answerIds[index] || '').trim();
          const el = answerEls[index] || null;
          if (id || el) out.push({ id, el });
        }
        continue;
      }
      const answerId = String(turn?.answerId || turn?.primaryAId || turn?.aId || '').trim();
      const answerEl = turn?.answerEl || turn?.primaryAEl || turn?.el || turn?.live?.primaryAEl || null;
      if (answerId || answerEl) out.push({ id: answerId, el: answerEl });
    }
    return out;
  }

  function countAssistantAnswers(runtimeAnswers = [], domSnapshot = null) {
    const runtimeCount = uniqueCountFromList(runtimeAnswers, [
      (answer) => answer?.id,
      (answer) => answer?.el?.getAttribute?.('data-message-id'),
      (answer) => answer?.el?.id,
    ]);
    if (runtimeCount) return runtimeCount;
    return toPositiveInt(domSnapshot?.assistantCount);
  }

  function hasUserTurnIdentity(turn) {
    if (!turn || typeof turn !== 'object') return false;
    if (String(turn.qId || turn.questionId || '').trim()) return true;
    if (turn.qEl || turn.questionEl || turn.live?.qEl) return true;
    const role = String(
      turn.role
      || turn.author?.role
      || turn.message?.author?.role
      || ''
    ).trim().toLowerCase();
    return role === 'user';
  }

  // A canonical turn represents one user question regardless of how many
  // assistant answer variants it owns. Unanswered user turns still count.
  function countUserTurns(turns = listRuntimeTurns()) {
    const userTurns = (Array.isArray(turns) ? turns : []).filter(hasUserTurnIdentity);
    return uniqueCountFromList(userTurns, [
      (turn) => turn.qId || turn.questionId,
      (turn) => turn.qEl?.getAttribute?.('data-message-id')
        || turn.questionEl?.getAttribute?.('data-message-id')
        || turn.live?.qEl?.getAttribute?.('data-message-id'),
      (turn) => turn.turnId || turn.id || turn.index,
    ]);
  }

  function semanticElementId(el, fallback = '') {
    if (!el || typeof el.getAttribute !== 'function') return String(fallback || '');
    return String(
      el.getAttribute('data-message-id')
      || el.getAttribute('data-h2o-id')
      || el.id
      || fallback
      || ''
    ).trim();
  }

  function listDomMessageIdentitySnapshot() {
    const rows = [...document.querySelectorAll('[data-message-author-role="user"], [data-message-author-role="assistant"]')]
      .filter((el) => el instanceof HTMLElement && el.isConnected);
    const userIds = [];
    const assistantIds = [];
    const userEls = [];
    const assistantEls = [];
    rows.forEach((el, index) => {
      const role = String(el.getAttribute('data-message-author-role') || '').trim().toLowerCase();
      const id = semanticElementId(el, `${role || 'message'}:${index}`);
      if (role === 'user') {
        userIds.push(id);
        userEls.push(el);
      } else if (role === 'assistant') {
        assistantIds.push(id);
        assistantEls.push(el);
      }
    });
    return {
      userIds,
      assistantIds,
      userEls,
      assistantEls,
      userCount: new Set(userIds).size,
      assistantCount: new Set(assistantIds).size,
    };
  }

  function turnQuestionIdentity(turn, index) {
    return String(
      turn?.qId
      || turn?.questionId
      || semanticElementId(turn?.qEl || turn?.questionEl || turn?.live?.qEl)
      || turn?.turnId
      || turn?.id
      || `turn:${index}`
    ).trim();
  }

  function answerIdentity(answer, index) {
    return String(
      answer?.id
      || semanticElementId(answer?.el)
      || `answer:${index}`
    ).trim();
  }

  function buildOpenChatStateSignature(chatId, turns = [], answers = [], domSnapshot = null) {
    const questionIds = (Array.isArray(turns) ? turns : [])
      .filter(hasUserTurnIdentity)
      .map(turnQuestionIdentity);
    const answerIds = (Array.isArray(answers) ? answers : []).map(answerIdentity);
    const dom = domSnapshot && typeof domSnapshot === 'object' ? domSnapshot : {};
    return JSON.stringify([
      String(chatId || ''),
      questionIds,
      answerIds,
      Array.isArray(dom.userIds) ? dom.userIds : [],
      Array.isArray(dom.assistantIds) ? dom.assistantIds : [],
    ]);
  }

  function captureOpenChatSemanticState() {
    const chatId = I.nav.currentChatId();
    if (!chatId) return null;
    _openChatMetaSyncDiag.semanticStateReadCount += 1;
    const publishedTurns = listRuntimeTurns();
    const domSnapshot = listDomMessageIdentitySnapshot();
    // Core is preferred. On current native Project chats it can legitimately be
    // empty while role-bearing message elements are already mounted. Reuse
    // those semantic elements as a lightweight loaded-state fallback; this
    // reads IDs/elements only and never text, fibers, MiniMap, or the network.
    const turns = publishedTurns.some(hasUserTurnIdentity)
      ? publishedTurns
      : domSnapshot.userEls.map((qEl, index) => ({
        qId: domSnapshot.userIds[index],
        turnId: `dom:${domSnapshot.userIds[index]}`,
        qEl,
      }));
    const publishedAnswers = listRuntimeAnswers(turns);
    const answers = publishedAnswers.length
      ? publishedAnswers
      : domSnapshot.assistantEls.map((el, index) => ({
        id: domSnapshot.assistantIds[index],
        el,
      }));
    const canonicalUserTurnCount = countUserTurns(turns);
    const composerReady = !!document.querySelector('#prompt-textarea, textarea[data-id="root"]');
    _openChatMetaSyncDiag.lastSemanticComposerReady = composerReady;
    _openChatMetaSyncDiag.lastSemanticUserTurnCount = canonicalUserTurnCount;
    _openChatMetaSyncDiag.lastSemanticDomUserCount = domSnapshot.userCount;
    return {
      chatId,
      turns,
      answers,
      domSnapshot,
      composerReady,
      // A long conversation mounts progressively. Do not perform preview/fiber/
      // timestamp work against each partial DOM state: wait until the mounted
      // user-message set catches the already-published canonical turn snapshot.
      ready: composerReady
        && canonicalUserTurnCount > 0
        && domSnapshot.userCount >= canonicalUserTurnCount,
      signature: buildOpenChatStateSignature(chatId, turns, answers, domSnapshot),
    };
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mon = d.toLocaleString(undefined, { month: "short" });
    const yy = d.getFullYear();
    return `${dd} ${mon} ${yy}`;
  }

  function isProjectPagePath(pathname = location.pathname) {
    return /^\/g\/[^/?#]+\/project\/?$/i.test(String(pathname || ''));
  }

  function projectCardChatId(link) {
    if (!link || typeof link.getAttribute !== 'function') return '';
    const href = String(link.getAttribute('href') || '');
    const match = href.match(/\/c\/([^/?#]+)/i);
    return match ? match[1] : '';
  }

  function isProjectCardLink(link, pathname = location.pathname) {
    if (!isProjectPagePath(pathname) || !projectCardChatId(link)) return false;
    if (!link.closest?.('main')) return false;
    if (I.utils?.isInsideH2OInternalSurface?.(link)) return false;
    const row = link.closest?.('.ho-main-row') || link.parentElement;
    if (!row) return false;
    const href = String(link.getAttribute?.('href') || '');
    return /^\/g\/[^/?#]+\/c\/[^/?#]+\/?$/i.test(href)
      || !!row.querySelector?.([
        '[data-testid="project-conversation-overflow-date"]',
        '[data-testid="project-conversation-overflow-menu"]',
      ].join(','));
  }

  function listProjectCardLinks() {
    if (!isProjectPagePath()) return [];
    return [...document.querySelectorAll('main a[href*="/c/"]')]
      .filter((link) => isProjectCardLink(link));
  }

  function createPendingProjectMetaTracker(maxSize = 256) {
    const pending = new Set();
    const limit = Math.max(1, Math.trunc(Number(maxSize) || 256));
    return Object.freeze({
      retain(chatIds) {
        for (const rawId of Array.isArray(chatIds) ? chatIds : []) {
          const chatId = String(rawId || '').trim();
          if (!chatId) continue;
          pending.delete(chatId);
          pending.add(chatId);
          while (pending.size > limit) pending.delete(pending.values().next().value);
        }
        return [...pending];
      },
      consume(chatIds) {
        const consumed = [];
        for (const rawId of chatIds || []) {
          const chatId = String(rawId || '').trim();
          if (chatId && pending.delete(chatId)) consumed.push(chatId);
        }
        return consumed;
      },
      snapshot() {
        return [...pending];
      },
      has(chatId) {
        return pending.has(String(chatId || '').trim());
      },
    });
  }

  const _pendingProjectMetaTracker = createPendingProjectMetaTracker();
  const _projectReturnMetaDiag = {
    retainedChangeCount: 0,
    consumedChangeCount: 0,
    targetedRenderCount: 0,
    fullRenderCount: 0,
    lastRetainedChatIds: [],
    lastConsumedChatIds: [],
    lastRenderAt: 0,
    get pendingChatIds() {
      return _pendingProjectMetaTracker.snapshot();
    },
  };

  function formatProjectCardRegistryMetadata(record) {
    const rec = record && typeof record === 'object' ? record : {};
    const createdAtSource = String(rec.createdAtSource || '').trim();
    const dateText = createdAtSource ? formatDate(rec.createdAt) : '';
    const userTurnCountSource = String(rec.userTurnCountSource || '').trim();
    const rawCount = Number(rec.userTurnCount);
    const hasTrustedCount = !!userTurnCountSource && Number.isFinite(rawCount) && rawCount >= 0;
    const countText = hasTrustedCount ? `${Math.trunc(rawCount)} Q&A` : '';

    if (dateText && countText) return `Created: ${dateText} · ${countText}`;
    if (dateText) return `Created: ${dateText}`;
    if (countText) return countText;
    return 'Open once to load details';
  }

  function messageCreateTimeMs(message) {
    const raw = Number(message?.create_time);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return raw >= 1e11 ? Math.trunc(raw) : Math.trunc(raw * 1000);
  }

  // Read the already-loaded authoritative conversation message array from the
  // current turn fibers. This never issues a conversation/background request.
  function getLoadedConversationMessages(turns = [], answers = []) {
    _openChatMetaSyncDiag.loadedConversationDiscoveryCount += 1;
    const candidates = [];
    for (const turn of Array.isArray(turns) ? turns : []) {
      const question = turn?.qEl || turn?.questionEl || turn?.live?.qEl || null;
      if (question) candidates.push(question);
    }
    for (const answer of Array.isArray(answers) ? answers : []) {
      if (answer?.el) candidates.push(answer.el);
    }

    for (const node of candidates) {
      const reactKey = Object.keys(node || {}).find((key) => key.startsWith('__reactFiber$'));
      let fiber = reactKey ? node[reactKey] : null;
      for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
        const messages = fiber?.memoizedProps?.messages || fiber?.pendingProps?.messages;
        if (Array.isArray(messages) && messages.length) return messages;
      }
    }
    return [];
  }

  function getFirstMessageCreateTimeMs(messages = getLoadedConversationMessages()) {
    return messageCreateTimeMs(Array.isArray(messages) ? messages[0] : null);
  }

  function getLastMessageCreateTimeMs(messages = getLoadedConversationMessages()) {
    let latest = 0;
    for (const message of Array.isArray(messages) ? messages : []) {
      latest = Math.max(latest, messageCreateTimeMs(message) || 0);
    }
    return latest || null;
  }

  function timestampMs(value) {
    if (value == null || value === '') return 0;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function chooseTruthfulCreatedAt(existingCreatedAt, authoritativeCreatedAtMs) {
    const existingMs = timestampMs(existingCreatedAt);
    const authoritativeMs = timestampMs(authoritativeCreatedAtMs);
    if (authoritativeMs && (!existingMs || authoritativeMs < existingMs)) return authoritativeCreatedAtMs;
    if (existingMs) return existingCreatedAt;
    return null;
  }

  // Evidence is about the accepted value, not about the capture as a whole.
  // A capture can legitimately record userTurnCount while only preserving a
  // legacy createdAt it never observed, and that date stays unverified. The
  // date is evidenced only when this capture read a real creation timestamp
  // and that reading is the value we accepted — which also covers the case
  // where the observation simply confirms what was already stored.
  function createdAtHasObservedEvidence(acceptedCreatedAt, authoritativeCreatedAtMs) {
    const authoritativeMs = timestampMs(authoritativeCreatedAtMs);
    if (!authoritativeMs) return false;
    return timestampMs(acceptedCreatedAt) === authoritativeMs;
  }

    // --------------------------
// snapshot helpers (DOM text) ✅
// --------------------------
function escapeHtml(s=""){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function normText(s=""){
  return String(s)
    .replace(/\s+/g, " ")
    .trim();
}

function trunc(s="", n=260){
  const t = normText(s);
  return t.length > n ? (t.slice(0, n-1) + "…") : t;
}

function extractMessageText(el){
  if (!el) return "";
  // textContent avoids a synchronous style/layout flush on long conversations.
  // The snapshot is preview text only; canonical metadata never depends on it.
  return normText(el.textContent || "");
}

function getFirstLastSnapshots(turns = [], answers = []){
  const firstQTurn = turns.find((turn) => !!turn?.qEl) || null;
  const lastQTurn = turns.slice().reverse().find((turn) => !!turn?.qEl) || null;

  const firstQ = extractMessageText(firstQTurn?.qEl);
  const firstA = extractMessageText(answers[0]?.el);

  const lastQ  = extractMessageText(lastQTurn?.qEl);
  const lastA  = extractMessageText(answers[answers.length - 1]?.el);

  return {
    firstQ: trunc(firstQ, 320),
    firstA: trunc(firstA, 360),
    lastQ:  trunc(lastQ,  320),
    lastA:  trunc(lastA,  360),
  };
}

const MEANINGFUL_META_FIELDS = Object.freeze([
  'answers',
  'createdAt',
  'createdAtSource',
  'userTurnCount',
  'userTurnCountSource',
  'lastMessageAt',
  'metadataSource',
  'firstQ',
  'firstA',
  'lastQ',
  'lastA',
]);

function hasMeaningfulMetaChange(existing, partial) {
  const before = existing && typeof existing === 'object' ? existing : {};
  const next = partial && typeof partial === 'object' ? partial : {};
  return MEANINGFUL_META_FIELDS.some((field) => (
    Object.prototype.hasOwnProperty.call(next, field)
    && JSON.stringify(before[field] ?? null) !== JSON.stringify(next[field] ?? null)
  ));
}

function reusableTruthfulOpenChatMeta(existing, values = null) {
  const answers = values?.answers;
  const userTurnCount = values?.userTurnCount;
  const rec = existing && typeof existing === 'object' ? existing : null;
  if (!rec) return null;
  if (!timestampMs(rec.createdAt) || !String(rec.createdAtSource || '').trim()) return null;
  if (!String(rec.userTurnCountSource || '').trim()) return null;
  if (Number(rec.userTurnCount) !== Number(userTurnCount)) return null;
  if (Number(rec.answers || 0) !== Number(answers || 0)) return null;
  return {
    answers: Number(rec.answers || 0),
    createdAt: rec.createdAt,
    createdAtSource: String(rec.createdAtSource),
    userTurnCount: Number(rec.userTurnCount),
    userTurnCountSource: String(rec.userTurnCountSource),
    ...(timestampMs(rec.lastMessageAt) ? { lastMessageAt: rec.lastMessageAt } : {}),
    metadataSource: String(rec.metadataSource || 'open-chat'),
    firstQ: String(rec.firstQ || ''),
    firstA: String(rec.firstA || ''),
    lastQ: String(rec.lastQ || ''),
    lastA: String(rec.lastA || ''),
    ...(rec.updatedAt ? { updatedAt: rec.updatedAt } : {}),
    ...(rec.metadataCapturedAt ? { metadataCapturedAt: rec.metadataCapturedAt } : {}),
  };
}


  // --------------------------
  // update meta while inside chat
  // --------------------------
function updateMetaFromOpenChat(state = captureOpenChatSemanticState()) {
  const chatId = String(state?.chatId || '');
  if (!chatId) return { ok: false, reason: 'no-chat' };

  const startedAt = performance.now();

  const existing = I.store.getMeta(chatId);
  const now = Date.now();
  const runtimeTurns = Array.isArray(state?.turns) ? state.turns : [];
  const runtimeAnswers = Array.isArray(state?.answers) ? state.answers : [];
  const nextAnswers = countAssistantAnswers(runtimeAnswers, state?.domSnapshot);
  const prevAnswers = toPositiveInt(existing?.answers);
  const answers = nextAnswers || prevAnswers || 0;
  const userTurnCount = countUserTurns(runtimeTurns);
  const hasUserTurnEvidence = runtimeTurns.some(hasUserTurnIdentity);
  const reusableMeta = reusableTruthfulOpenChatMeta(existing, { answers, userTurnCount });
  if (reusableMeta) {
    _openChatMetaSyncDiag.interfaceStoreNoopCount += 1;
    try { mirrorOpenChatMetaToRegistry(chatId, reusableMeta); } catch (_) {}
    _openChatMetaSyncDiag.lastAcquiredChatId = chatId;
    _openChatMetaSyncDiag.lastAcquiredSignature = String(state?.signature || '');
    _openChatMetaSyncDiag.lastAcquisitionDurationMs = performance.now() - startedAt;
    return { ok: true, changed: false, reusedTruthfulMeta: true, chatId, signature: String(state?.signature || '') };
  }
  _openChatMetaSyncDiag.expensiveAcquisitionCount += 1;
  const loadedMessages = getLoadedConversationMessages(runtimeTurns, runtimeAnswers);
  const tsMs = getFirstMessageCreateTimeMs(loadedMessages);
  const lastMessageAtMs = getLastMessageCreateTimeMs(loadedMessages);
  const createdAt = chooseTruthfulCreatedAt(existing?.createdAt, tsMs);
  const createdAtEvidenced = createdAtHasObservedEvidence(createdAt, tsMs);
  const capturedMeaningfulMetadata = !!(tsMs || hasUserTurnEvidence);

  // ✅ NEW: first/last Q/A snapshots (from open chat DOM)
  const snaps = getFirstLastSnapshots(runtimeTurns, runtimeAnswers);

  const meaningfulPartial = {
    answers,

    ...(createdAt ? { createdAt } : {}),
    ...(createdAtEvidenced ? { createdAtSource: 'open-chat-message' } : {}),
    // The count and its proof are written together from the same evidence gate,
    // so a schema-default 0 can never arrive looking like a measurement.
    ...(hasUserTurnEvidence ? {
      userTurnCount,
      userTurnCountSource: 'open-chat-turn-runtime',
    } : {}),
    ...(lastMessageAtMs ? { lastMessageAt: lastMessageAtMs } : {}),
    ...(capturedMeaningfulMetadata ? { metadataSource: 'open-chat' } : {}),

    // ✅ store snapshots
    firstQ: existing ? (snaps.firstQ || existing.firstQ || "") : snaps.firstQ,
    firstA: existing ? (snaps.firstA || existing.firstA || "") : snaps.firstA,
    lastQ:  existing ? (snaps.lastQ  || existing.lastQ  || "") : snaps.lastQ,
    lastA:  existing ? (snaps.lastA  || existing.lastA  || "") : snaps.lastA,
  };

  const changed = hasMeaningfulMetaChange(existing, meaningfulPartial);
  const partial = changed ? {
    ...meaningfulPartial,
    updatedAt: now,
    ...(capturedMeaningfulMetadata ? { metadataCapturedAt: now } : {}),
  } : {
    ...meaningfulPartial,
    ...(existing?.updatedAt ? { updatedAt: existing.updatedAt } : {}),
    ...(existing?.metadataCapturedAt ? { metadataCapturedAt: existing.metadataCapturedAt } : {}),
  };

  if (changed) {
    I.store.setMeta(chatId, partial);
    _openChatMetaSyncDiag.interfaceStoreWriteCount += 1;
  } else {
    _openChatMetaSyncDiag.interfaceStoreNoopCount += 1;
  }
  // Phase 2D — mirror into H2O.ChatRegistry as the canonical truth layer. Soft no-op
  // if registry is not loaded yet; never throws back into the caller.
  try { mirrorOpenChatMetaToRegistry(chatId, partial); } catch (_) {}

  _openChatMetaSyncDiag.lastAcquiredChatId = chatId;
  _openChatMetaSyncDiag.lastAcquiredSignature = String(state?.signature || '');
  _openChatMetaSyncDiag.lastAcquisitionDurationMs = performance.now() - startedAt;
  return { ok: true, changed, chatId, signature: String(state?.signature || '') };
}

function createOpenChatMetaSyncController(options) {
  options = options || {};
  const {
    readState,
    acquire,
    settleMs = 180,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    scheduleAcquire = null,
    onRequest = null,
    onSkip = null,
  } = options || {};
  let timer = 0;
  let running = false;
  let followUpRequested = false;
  let lastStateReadAt = 0;
  const lastSuccessfulSignatureByChatId = new Map();
  const settlingSignatureByChatId = new Map();

  const flush = () => {
    timer = 0;
    const now = Date.now();
    if ((now - lastStateReadAt) < settleMs) return;
    lastStateReadAt = now;
    if (running) {
      followUpRequested = true;
      return;
    }
    const state = typeof readState === 'function' ? readState() : null;
    const chatId = String(state?.chatId || '');
    const signature = String(state?.signature || '');
    if (!chatId || !signature) return;
    if (state?.ready === false) {
      if (typeof onSkip === 'function') onSkip(state, 'semantic-state-not-ready');
      return;
    }
    if (lastSuccessfulSignatureByChatId.get(chatId) === signature) {
      if (typeof onSkip === 'function') onSkip(state, 'signature-match');
      return;
    }
    // Progressive mounts can pause briefly between chunks. Require the same
    // cheap semantic signature to survive two idle-settled observations. A
    // newer signature replaces the candidate, so only the latest state wins.
    if (settlingSignatureByChatId.get(chatId) !== signature) {
      settlingSignatureByChatId.set(chatId, signature);
      if (typeof onSkip === 'function') onSkip(state, 'semantic-state-settling');
      request('verify-settled-semantic-state');
      return;
    }
    settlingSignatureByChatId.delete(chatId);

    running = true;
    const runAcquire = () => {
      try {
        const result = typeof acquire === 'function' ? acquire(state) : { ok: false };
        if (result?.ok !== false) lastSuccessfulSignatureByChatId.set(chatId, signature);
      } finally {
        running = false;
        if (followUpRequested) {
          followUpRequested = false;
          request('state-changed-during-acquisition');
        }
      }
    };
    if (typeof scheduleAcquire === 'function') scheduleAcquire(runAcquire);
    else runAcquire();
  };

  const request = (reason = 'unspecified') => {
    if (typeof onRequest === 'function') onRequest(String(reason || 'unspecified'));
    if (running) followUpRequested = true;
    // Leading bounded coalescing: an already-queued cheap state read cannot be
    // postponed forever by a stream of equivalent mutation/event requests.
    if (timer) return;
    timer = setTimer(flush, settleMs);
  };

  return {
    request,
    flush,
    clearSignatures() {
      lastSuccessfulSignatureByChatId.clear();
      settlingSignatureByChatId.clear();
    },
  };
}

function scheduleOpenChatMetaRead(callback) {
  const token = { cancelled: false, channel: new MessageChannel() };
  token.channel.port1.onmessage = () => {
    token.channel.port1.close();
    token.channel.port2.close();
    if (!token.cancelled) callback();
  };
  token.channel.port2.postMessage(0);
  return token;
}

function cancelOpenChatMetaRead(token) {
  if (!token || typeof token !== 'object') return;
  token.cancelled = true;
  try { token.channel?.port1?.close(); } catch {}
  try { token.channel?.port2?.close(); } catch {}
}

function scheduleOpenChatMetaIdle(callback) {
  if (typeof scheduler?.postTask === 'function') {
    // The state is already composer-ready and twice-settled here. Background
    // tasks can starve indefinitely under ChatGPT's continuous lifecycle work;
    // one user-visible pass runs promptly without returning to mutation-driven
    // acquisition.
    scheduler.postTask(callback, { priority: 'user-visible' });
    return;
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(callback);
  else requestAnimationFrame(callback);
}

const _openChatMetaSyncController = createOpenChatMetaSyncController({
  readState: captureOpenChatSemanticState,
  acquire: updateMetaFromOpenChat,
  setTimer: scheduleOpenChatMetaRead,
  clearTimer: cancelOpenChatMetaRead,
  scheduleAcquire: scheduleOpenChatMetaIdle,
  onRequest(reason) {
    _openChatMetaSyncDiag.requestCount += 1;
    _openChatMetaSyncDiag.lastRequestReason = reason;
  },
  onSkip(_state, reason) {
    _openChatMetaSyncDiag.signatureSkipCount += 1;
    if (reason === 'semantic-state-not-ready') _openChatMetaSyncDiag.notReadySkipCount += 1;
  },
});

function requestOpenChatMetaSync(reason = 'unspecified') {
  _openChatMetaSyncController.request(reason);
}

function resetOpenChatMetaSyncDiagnostics({ clearSignatures = false } = {}) {
  Object.assign(_openChatMetaSyncDiag, {
    requestCount: 0,
    semanticStateReadCount: 0,
    expensiveAcquisitionCount: 0,
    signatureSkipCount: 0,
    notReadySkipCount: 0,
    listRuntimeTurnsCount: 0,
    loadedConversationDiscoveryCount: 0,
    interfaceStoreWriteCount: 0,
    interfaceStoreNoopCount: 0,
    miniMapForcedRefreshCount: 0,
    lastRequestReason: '',
    lastAcquiredChatId: '',
    lastAcquiredSignature: '',
    lastAcquisitionDurationMs: 0,
    lastSemanticComposerReady: false,
    lastSemanticUserTurnCount: 0,
    lastSemanticDomUserCount: 0,
  });
  if (clearSignatures) _openChatMetaSyncController.clearSignatures();
}

// Phase 2D — small additive bridge from the existing interface-local meta store
// (ho:chat-meta-v1, owned by 9A1a) into H2O.ChatRegistry. Strict rules:
//   • If H2O.ChatRegistry is missing, silent no-op.
//   • Never alters tooltip rendering, never blocks the existing setMeta call.
//   • Reuses the already-truncated firstQ/firstA/lastQ/lastA strings (320/360 chars).
//   • Maps truthful timestamps → ISO strings, `answers` → answerCount, and
//     canonical question turns → userTurnCount.
//   • source: "chat-meta-enricher", passive: false (already-loaded open-chat
//     evidence is authoritative for the fields it actually supplies).
//
// Phase 2D-perf — fingerprint-based idempotency guard. The MutationObserver in
// setupMetaObserver() can fire multiple times during boot resync and on any DOM
// churn under <main>; without a guard, mirrorOpenChatMetaToRegistry would call
// reg.upsertRecord on every tick. The guard is in-memory only (intentionally not
// persisted): a fresh page load should re-mirror once to populate the registry,
// but within a single session repeated identical calls are dropped.
const _registryMirrorDiag = {
  mirroredToRegistryCount: 0,
  lastRegistryMirrorAt: 0,
  lastRegistryMirrorChatId: '',
  lastRegistryMirrorError: null,
  skippedRegistryMirrorCount: 0,
  lastRegistryMirrorSkipReason: '',
  lastRegistryMirrorFingerprintAt: 0,
};

// chatId → last-mirrored fingerprint string. Map (not Object) so we get O(1) lookups
// and clean iteration without prototype-pollution concerns. In-memory only — no
// localStorage, no Library Store, no persistence layer.
const _lastMirrorFingerprintByChatId = new Map();

function _toIsoOrEmpty(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    try { return new Date(v).toISOString(); } catch { return ''; }
  }
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) {
      try { return new Date(n).toISOString(); } catch {}
    }
    const parsed = Date.parse(v);
    if (Number.isFinite(parsed)) { try { return new Date(parsed).toISOString(); } catch {} }
  }
  return '';
}

// Deterministic fingerprint over the meaningful content fields. Uses an array
// (not an object) so JSON.stringify produces a stable order without depending on
// engine key-iteration order. Bookkeeping-only updatedAt and metadataCapturedAt
// are intentionally EXCLUDED so repeated identical observations do not churn
// Registry writes.
function _computeMirrorFingerprint(chatId, partial) {
  const p = (partial && typeof partial === 'object') ? partial : {};
  return JSON.stringify([
    String(chatId || ''),
    p.createdAt ?? '',
    p.createdAtSource ?? '',
    p.lastMessageAt ?? '',
    p.answers ?? 0,
    p.userTurnCount ?? '',
    p.userTurnCountSource ?? '',
    p.metadataSource ?? '',
    typeof p.firstQ === 'string' ? p.firstQ : '',
    typeof p.firstA === 'string' ? p.firstA : '',
    typeof p.lastQ  === 'string' ? p.lastQ  : '',
    typeof p.lastA  === 'string' ? p.lastA  : '',
  ]);
}

function buildRegistryMirrorInput(chatId, partial) {
  const createdAtIso = _toIsoOrEmpty(partial.createdAt);
  const updatedAtIso = _toIsoOrEmpty(partial.updatedAt) || new Date().toISOString();
  const lastMessageAtIso = _toIsoOrEmpty(partial.lastMessageAt);
  const metadataCapturedAtIso = _toIsoOrEmpty(partial.metadataCapturedAt);
  const metadataSource = typeof partial.metadataSource === 'string'
    ? partial.metadataSource.trim()
    : '';
  const createdAtSource = typeof partial.createdAtSource === 'string'
    ? partial.createdAtSource.trim()
    : '';
  const userTurnCountSource = typeof partial.userTurnCountSource === 'string'
    ? partial.userTurnCountSource.trim()
    : '';
  const answers = Number(partial.answers);
  const safeAnswers = Number.isFinite(answers) && answers > 0 ? Math.trunc(answers) : 0;
  const rawUserTurnCount = Number(partial.userTurnCount);
  const hasUserTurnCount = Object.prototype.hasOwnProperty.call(partial, 'userTurnCount')
    && Number.isFinite(rawUserTurnCount)
    && rawUserTurnCount >= 0;

  return {
    chatId,
    href: `/c/${chatId}`,
    titleSource: 'sidebar',
    updatedAt: updatedAtIso,
    answerCount: safeAnswers,
    ...(createdAtIso ? { createdAt: createdAtIso } : {}),
    // Gated on the value as well, so proof can never travel without the date
    // it is proof of.
    ...(createdAtIso && createdAtSource ? { createdAtSource } : {}),
    ...(lastMessageAtIso ? { lastMessageAt: lastMessageAtIso } : {}),
    ...(hasUserTurnCount ? { userTurnCount: Math.trunc(rawUserTurnCount) } : {}),
    // Gated on the count as well, so proof never travels without the value it
    // is proof of.
    ...(hasUserTurnCount && userTurnCountSource ? { userTurnCountSource } : {}),
    ...(metadataCapturedAtIso && metadataSource ? {
      metadataCapturedAt: metadataCapturedAtIso,
      metadataSource,
    } : {}),
    preview: {
      firstQ: typeof partial.firstQ === 'string' ? partial.firstQ : '',
      firstA: typeof partial.firstA === 'string' ? partial.firstA : '',
      lastQ:  typeof partial.lastQ  === 'string' ? partial.lastQ  : '',
      lastA:  typeof partial.lastA  === 'string' ? partial.lastA  : '',
      updatedAt: updatedAtIso,
    },
  };
}

function mirrorOpenChatMetaToRegistry(chatId, partial) {
  const reg = window.H2O && window.H2O.ChatRegistry;
  if (!reg || typeof reg.upsertRecord !== 'function') return; // silent no-op
  if (!chatId || !partial || typeof partial !== 'object') return;

  // Fingerprint guard — short-circuit before any string formatting or upsert work.
  // Skips when the same meaningful metadata tuple was last mirrored. Capture and
  // update clocks are excluded. Cached regardless of upsert outcome so a tombstoned chat
  // that returns null also gets the cheap-skip path on subsequent identical attempts.
  const fingerprint = _computeMirrorFingerprint(chatId, partial);
  const last = _lastMirrorFingerprintByChatId.get(chatId);
  if (last !== undefined && last === fingerprint) {
    _registryMirrorDiag.skippedRegistryMirrorCount += 1;
    _registryMirrorDiag.lastRegistryMirrorSkipReason = 'fingerprint-match';
    _registryMirrorDiag.lastRegistryMirrorFingerprintAt = Date.now();
    return;
  }

  const input = buildRegistryMirrorInput(chatId, partial);

  try {
    reg.upsertRecord(input, { source: 'chat-meta-enricher', passive: false });
    _registryMirrorDiag.mirroredToRegistryCount += 1;
    _registryMirrorDiag.lastRegistryMirrorAt = Date.now();
    _registryMirrorDiag.lastRegistryMirrorChatId = chatId;
    _registryMirrorDiag.lastRegistryMirrorError = null;
    _registryMirrorDiag.lastRegistryMirrorFingerprintAt = Date.now();
    // Cache the fingerprint AFTER the call so a thrown error doesn't poison the
    // dedupe map (the next attempt will retry naturally). Tombstone-blocked
    // upserts return null without throwing, so they DO update the fingerprint —
    // that's desirable: repeated identical attempts on a tombstoned chat skip
    // the cheap upsert call as well.
    _lastMirrorFingerprintByChatId.set(chatId, fingerprint);
  } catch (e) {
    _registryMirrorDiag.lastRegistryMirrorError = String(e?.message || e || 'unknown');
  }
}

/* Phase 2G — one-way truthful provenance backfill.

   The Registry became provenance-capable in Phase 1, but records persisted
   before that landed carry the older shape: the value survived, the proof never
   existed for it. Every record in an established store is in that state, so a
   Project card whose Registry record predates the schema shows "open once to
   load details" permanently — the only writer of provenance is the open-chat
   mirror above, and reaching it means reopening every affected chat.

   The evidence is not lost. 9A1a's interface store kept the provenance the
   Registry never received, durably, per chat. This promotes it one way, and
   only where the proof demonstrably describes the value the Registry already
   holds.

   Deliberately not a migration: no new store, no schema change, no polling, no
   observer. One readiness-triggered pass per document, naturally idempotent
   because a repaired record stops looking like a candidate. */
const PROVENANCE_BACKFILL_SOURCE = 'chat-meta-provenance-backfill';

const _provenanceBackfillDiag = {
  ran: false,
  scannedInterfaceRecords: 0,
  candidates: 0,
  upserts: 0,
  skippedNoProvenance: 0,
  skippedNoRegistryRecord: 0,
  skippedAlreadyTrusted: 0,
  skippedValueMismatch: 0,
  lastRunAt: 0,
  lastError: null,
};

/* Returns the narrowest Registry input that repairs this record, or null when
   there is nothing safe to repair. Date and count are decided independently, so
   a chat with a matching date and a diverged count still gets its date proof. */
function buildProvenanceBackfillInput(chatId, interfaceRecord, registryRecord) {
  const m = interfaceRecord && typeof interfaceRecord === 'object' ? interfaceRecord : null;
  const rec = registryRecord && typeof registryRecord === 'object' ? registryRecord : null;
  if (!chatId || !m || !rec) return null;

  const createdAtSource = typeof m.createdAtSource === 'string' ? m.createdAtSource.trim() : '';
  const createdAtIso = _toIsoOrEmpty(m.createdAt);
  /* Proof may only travel to the value it is proof of. Equality is the only
     case where that is demonstrable from stored state alone: a Registry date
     this capture never observed keeps its unverified status. A Registry with no
     date is deliberately left alone as well — merge would populate it safely,
     but supplying a value is capture's job, and repair must not become a second
     way for values to enter the Registry. */
  const promoteDate = !!createdAtSource
    && !!createdAtIso
    && !String(rec.createdAtSource || '').trim()
    && createdAtIso === String(rec.createdAt || '');

  const userTurnCountSource = typeof m.userTurnCountSource === 'string' ? m.userTurnCountSource.trim() : '';
  const rawCount = Number(m.userTurnCount);
  const hasCount = Object.prototype.hasOwnProperty.call(m, 'userTurnCount')
    && Number.isFinite(rawCount)
    && rawCount >= 0;
  const count = hasCount ? Math.trunc(rawCount) : null;
  /* Same rule for the count. The live store holds real divergences — an
     interface count of 3 against a Registry 9 — and copying the proof across
     would certify a number this evidence never counted. */
  const promoteCount = !!userTurnCountSource
    && hasCount
    && !String(rec.userTurnCountSource || '').trim()
    && count === Number(rec.userTurnCount);

  if (!promoteDate && !promoteCount) return null;

  /* Capture provenance rides along only when something evidenced is actually
     being repaired, and only in the pair the existing contract writes it as. */
  const metadataSource = typeof m.metadataSource === 'string' ? m.metadataSource.trim() : '';
  const metadataCapturedAtIso = _toIsoOrEmpty(m.metadataCapturedAt);

  return {
    chatId,
    href: String(rec.href || `/c/${chatId}`),
    ...(promoteDate ? { createdAt: createdAtIso, createdAtSource } : {}),
    ...(promoteCount ? { userTurnCount: count, userTurnCountSource } : {}),
    ...(metadataCapturedAtIso && metadataSource ? {
      metadataCapturedAt: metadataCapturedAtIso,
      metadataSource,
    } : {}),
  };
}

function backfillRegistryProvenanceOnce() {
  if (_provenanceBackfillDiag.ran) return _provenanceBackfillDiag;
  const reg = window.H2O && window.H2O.ChatRegistry;
  // Not ready yet is not a failure: the readiness callback runs this again.
  if (!reg || typeof reg.getRecord !== 'function' || typeof reg.upsertRecord !== 'function') {
    return _provenanceBackfillDiag;
  }
  _provenanceBackfillDiag.ran = true;
  _provenanceBackfillDiag.lastRunAt = Date.now();

  let meta = null;
  try { meta = I.store.getAllMeta(); } catch (e) {
    _provenanceBackfillDiag.lastError = String(e?.message || e || 'read-interface-store');
    return _provenanceBackfillDiag;
  }

  const inputs = [];
  for (const [rawId, record] of Object.entries(meta || {})) {
    const chatId = String(rawId || '').trim();
    if (!chatId) continue;
    _provenanceBackfillDiag.scannedInterfaceRecords += 1;

    const m = record && typeof record === 'object' ? record : null;
    const hasProof = !!String(m?.createdAtSource || '').trim()
      || !!String(m?.userTurnCountSource || '').trim();
    if (!hasProof) { _provenanceBackfillDiag.skippedNoProvenance += 1; continue; }

    let rec = null;
    try { rec = reg.getRecord(chatId); } catch (_) { rec = null; }
    if (!rec) { _provenanceBackfillDiag.skippedNoRegistryRecord += 1; continue; }

    if (String(rec.createdAtSource || '').trim() && String(rec.userTurnCountSource || '').trim()) {
      _provenanceBackfillDiag.skippedAlreadyTrusted += 1;
      continue;
    }

    const input = buildProvenanceBackfillInput(chatId, m, rec);
    if (!input) { _provenanceBackfillDiag.skippedValueMismatch += 1; continue; }
    inputs.push(input);
  }

  _provenanceBackfillDiag.candidates = inputs.length;
  if (!inputs.length) return _provenanceBackfillDiag;

  /* upsertMany batches the whole repair into one flush and one change emission,
     so a store of tens of records costs one write rather than one per chat. The
     emitted change is what drives the existing Project-card refresh. */
  try {
    const options = { source: PROVENANCE_BACKFILL_SOURCE, passive: true };
    if (typeof reg.upsertMany === 'function') {
      reg.upsertMany(inputs, options);
    } else {
      inputs.forEach((input) => { reg.upsertRecord(input, options); });
    }
    _provenanceBackfillDiag.upserts = inputs.length;
  } catch (e) {
    _provenanceBackfillDiag.lastError = String(e?.message || e || 'upsert-failed');
  }
  return _provenanceBackfillDiag;
}

// Phase 2F — expose tiny read-only diag surface so a future Library Tab / Control Hub
// debug pane can surface mirror health without depending on enricher internals.
try {
  window.H2O = window.H2O || {};
  window.H2O.interface = window.H2O.interface || {};
  window.H2O.interface.metaEnricher = Object.assign(window.H2O.interface.metaEnricher || {}, {
    mirrorDiag: _registryMirrorDiag,
    syncDiag: _openChatMetaSyncDiag,
    projectReturnDiag: _projectReturnMetaDiag,
    provenanceBackfillDiag: _provenanceBackfillDiag,
    requestOpenChatMetaSync,
    resetOpenChatMetaSyncDiagnostics,
    mirrorOpenChatMetaToRegistry,   // exported so other modules can opt-in to mirror specific chatIds
  });
} catch (_) {}


  // --------------------------
  // preview tooltip (single global)
  // --------------------------
  function getPreviewTip(){
    let tip = document.getElementById("ho-preview-tip");
    if (!tip){
      tip = document.createElement("div");
      tip.id = "ho-preview-tip";
      document.body.appendChild(tip);
    }
    return tip;
  }

  function showPreviewTip(anchorEl, html){
    const tip = getPreviewTip();
    tip.innerHTML = html;
    tip.classList.add("show");

    const r = anchorEl.getBoundingClientRect();
    let left = Math.round(r.right + 10);
    let top  = Math.round(r.top + r.height / 2);

    requestAnimationFrame(() => {
      const tr = tip.getBoundingClientRect();
      if (left + tr.width > window.innerWidth - 8) left = Math.max(8, Math.round(r.left - 10 - tr.width));
      const minTop = 8 + tr.height/2;
      const maxTop = window.innerHeight - 8 - tr.height/2;
      top = Math.min(Math.max(top, minTop), maxTop);

      tip.style.left = left + "px";
      tip.style.top  = top + "px";
      tip.style.transform = "translateY(-50%)";
    });
  }

  function hidePreviewTip(){
    const tip = document.getElementById("ho-preview-tip");
    if (tip) tip.classList.remove("show");
  }

  // --------------------------
  // ✅ SORT: pinned rows first (MAIN). The querySelectorAll below already only matches
  // ho-main-row elements, which we never set on H2O-internal links thanks to the
  // isInsideH2OInternalSurface guard in renderMetaInProjectList. Defense-in-depth: the
  // forEach below also re-checks each row before touching it.
  // --------------------------
  function sortMainListByPins(){
    if (!isProjectPagePath()) return;
    const rows = [...document.querySelectorAll("main .ho-main-row")];
    if (!rows.length) return;

    const groups = new Map();
    for (const row of rows){
      const parent = row.parentElement;
      if (!parent) continue;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(row);
    }

    for (const [parent, list] of groups.entries()){
      const items = list.map(row => {
        const a = row.querySelector('a[href*="/c/"]');
        // Defense-in-depth: skip H2O-internal chat-link rows. The renderMetaInProjectList
        // forEach already refuses to add `.ho-main-row` to anchors inside H2O surfaces, so
        // these rows should never appear here. We re-check anyway in case an older
        // decoration leaked, or another module added the class.
        if (a && I.utils?.isInsideH2OInternalSurface?.(a)) return null;
        const idm = (a?.getAttribute("href") || "").match(/\/c\/([^\/?#]+)/);
        const id = idm ? idm[1] : null;
        return { row, id };
      }).filter(x => x && !!x.id);

      const pinned = items.filter(x => I.store.isPinned(x.id));
      if (!pinned.length) continue;

      const normal = items.filter(x => !I.store.isPinned(x.id));
      const desired = [...pinned, ...normal].map(x => x.row);

      // idempotent check
      let same = true;
      for (let i=0; i<desired.length; i++){
        if (parent.children[i] !== desired[i]) { same = false; break; }
      }
      if (same) continue;

      const frag = document.createDocumentFragment();
      desired.forEach(r => frag.appendChild(r));
      parent.appendChild(frag);
    }
  }

// --------------------------
// render meta row under title in MAIN list
// --------------------------
function renderMetaInProjectList(onlyChatIds = null) {
  if (!isProjectPagePath()) {
    document.querySelectorAll('main .ho-meta-row[data-ho-project-chat-meta="9A1c"]')
      .forEach((row) => row.remove());
    return new Set();
  }

  const meta = I.store.getAllMeta();
  const links = listProjectCardLinks();
  const exactChatIds = onlyChatIds
    ? new Set([...onlyChatIds].map((id) => String(id || '').trim()).filter(Boolean))
    : null;
  const renderedChatIds = new Set();

  let sawPinned = false;

  links.forEach(link => {
    // Skip H2O-internal chat-link rows (Tag Viewer, Bubble Cloud candidate popup, in-shell
    // pages). Without this guard the meta enricher injects a "Open once · — answers" row
    // under every H2O chat link, producing the repeated rows seen in the Tag Viewer.
    if (I.utils?.isInsideH2OInternalSurface?.(link)) return;
    const href = link.getAttribute("href") || "";
    const m = href.match(/\/c\/([^\/?#]+)/);
    if (!m) return;

    const chatId = m[1];
    if (exactChatIds && !exactChatIds.has(chatId)) return;
    const data = meta[chatId];
    const registryRecord = window.H2O?.ChatRegistry?.getRecord?.(chatId) || null;

// structure guards (stable + anti-duplication)
const wrapper = link.querySelector(':scope > div') || link.firstElementChild;
if (!wrapper) return;

// left column: first direct div inside wrapper (fallback wrapper)
const leftCol =
  wrapper.querySelector(':scope > div') ||
  wrapper.firstElementChild ||
  wrapper;
if (!leftCol) return;

// ✅ dedupe: if multiple meta rows exist, keep only the first
const metas = [...leftCol.querySelectorAll(':scope > .ho-meta-row')];
if (metas.length > 1) metas.slice(1).forEach(m => m.remove());

// title row: first direct child that is NOT metaRow
const titleRow =
  [...leftCol.children].find(el => el instanceof HTMLElement && !el.classList.contains("ho-meta-row")) ||
  leftCol;


    // ✅ Ensure row wrapper exists for sorting
    const rowWrap = link.closest(".ho-main-row") || link.parentElement;
    if (rowWrap) rowWrap.classList.add("ho-main-row");

// ✅ Ensure metaRow exists (strict direct child)
let metaRow = leftCol.querySelector(':scope > .ho-meta-row');

    if (metaRow && metaRow.dataset.hoProjectChatId && metaRow.dataset.hoProjectChatId !== chatId) {
      metaRow.remove();
      metaRow = null;
    }

    if (!metaRow) {
      metaRow = document.createElement("div");
      metaRow.className = "ho-meta-row";
      titleRow.insertAdjacentElement("afterend", metaRow);
    }
    metaRow.dataset.hoProjectChatMeta = '9A1c';
    metaRow.dataset.hoProjectChatId = chatId;

/*
    // ✅ Hide snippet lines once
    if (!leftCol.__hoSnipHidden) {
      [...leftCol.children].forEach(el => {
        if (!(el instanceof HTMLElement)) return;
        if (el === titleRow || el === metaRow) el.style.display = "";
        else el.style.display = "none";
      });
      leftCol.__hoSnipHidden = true;
    }
*/

// ✅ Hide snippet lines via CSS class (no delayed inline display writes)
if (!leftCol.classList.contains("ho-snip-hidden")) {
  leftCol.classList.add("ho-snip-hidden");
}


    const safe = data || {};
    const infoDateStr = safe.createdAt ? formatDate(safe.createdAt) : "—";
    const infoAnswersStr = (safe.answers ?? null) !== null ? String(safe.answers) : "—";
    const leftText = formatProjectCardRegistryMetadata(registryRecord);

    const pinned = I.store.isPinned(chatId);
    if (pinned) sawPinned = true;

    if (rowWrap) rowWrap.classList.toggle("ho-pinned-row", pinned);

    // ✅ SELF-HEAL: ensure the actions exist (Fix/Review never missing)
    const hasActions = !!metaRow.querySelector(".ho-meta-actions-right");
    if (!hasActions) {
metaRow.innerHTML = `
  <div class="ho-meta-lefttext"></div>
  <div class="ho-meta-actions-right">
    <span class="ho-meta-action ho-review" title="Chat info" aria-label="Show chat info" role="button" tabindex="0"></span>
    <span class="ho-meta-action ho-fix" title="Pin chat" aria-label="Pin chat" role="button" tabindex="0"></span>
  </div>
`;

    }

    // update left text every time
    const leftTextEl = metaRow.querySelector(".ho-meta-lefttext");
    if (leftTextEl && leftTextEl.textContent !== leftText) {
      leftTextEl.textContent = leftText;
    }

    // pinned “tanned”
    const fixBtn = metaRow.querySelector(".ho-fix");
    if (fixBtn) fixBtn.classList.toggle("is-on", pinned);

    // ✅ Wire events once per metaRow node (no double listeners)
    if (!metaRow.__hoWired) {
      metaRow.__hoWired = true;

      const revBtn = metaRow.querySelector(".ho-review");

      // prevent parent <a> stealing press
      [fixBtn, revBtn].forEach(b => {
        if (!b) return;
        ["pointerdown", "mousedown"].forEach(evt => {
          b.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
          }, true);
        });
      });

      // Fix click => pin toggle + sort
      fixBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const nowPinned = !I.store.isPinned(chatId);
        I.store.setPinned(chatId, nowPinned);

        if (rowWrap) rowWrap.classList.toggle("ho-pinned-row", nowPinned);
        fixBtn.classList.toggle("is-on", nowPinned);

        // ✅ stable re-sort

        I.pin.schedule(sortMainListByPins);
      }, true);

      // Review hover tooltip
      revBtn?.addEventListener("mouseenter", () => {
        const titleText = (titleRow?.textContent || link.textContent || "")
          .trim().split("\n")[0].trim() || "Chat";

        const lastSeen = I.heat.getLastActivity(chatId);

        const heat = I.heat.getLevel(chatId);

          const mq = safe.firstQ || "";
const ma = safe.firstA || "";
const lq = safe.lastQ  || "";
const la = safe.lastA  || "";

const firstBlock = (mq || ma)
  ? `<div class="m"><b>📍 First</b></div>
     <div class="m"><b>Q:</b> ${escapeHtml(mq || "—")}</div>
     <div class="m"><b>A:</b> ${escapeHtml(ma || "—")}</div>`
  : `<div class="m"><b>📍 First</b> — <i>Open chat once to cache</i></div>`;

const lastBlock = (lq || la)
  ? `<div class="m"><b>🕒 Last</b></div>
     <div class="m"><b>Q:</b> ${escapeHtml(lq || "—")}</div>
     <div class="m"><b>A:</b> ${escapeHtml(la || "—")}</div>`
  : `<div class="m"><b>🕒 Last</b> — <i>Open chat once to cache</i></div>`;


const html = `
  <div class="t">${escapeHtml(titleText)}</div>

  <div class="m">Heat: <b>${escapeHtml(heat)}</b></div>
  <div class="m">Pinned: <b>${I.store.isPinned(chatId) ? "Yes" : "No"}</b></div>
  <div class="m">Created: <b>${escapeHtml(infoDateStr || "—")}</b></div>
  <div class="m">Answers: <b>${escapeHtml(infoAnswersStr)}</b></div>
  <div class="m">Last seen: <b>${lastSeen ? escapeHtml(formatDate(lastSeen)) : "—"}</b></div>

  <div style="height:8px"></div>
  ${firstBlock}
  <div style="height:8px"></div>
  ${lastBlock}
`;

        showPreviewTip(revBtn, html);
      }, true);

      revBtn?.addEventListener("mouseleave", hidePreviewTip, true);
    }

    metaRow.style.display = "flex";
    renderedChatIds.add(chatId);
  });

  const consumedChatIds = _pendingProjectMetaTracker.consume(renderedChatIds);
  if (consumedChatIds.length) {
    _projectReturnMetaDiag.consumedChangeCount += consumedChatIds.length;
    _projectReturnMetaDiag.lastConsumedChatIds = consumedChatIds;
  }
  _projectReturnMetaDiag.lastRenderAt = Date.now();
  if (exactChatIds) _projectReturnMetaDiag.targetedRenderCount += 1;
  else _projectReturnMetaDiag.fullRenderCount += 1;

  if (sawPinned) {
    try { I.pin.schedule(sortMainListByPins); } catch {}
  }
  return renderedChatIds;
}


// --------------------------
// Observer (RAF-batched, ignores internal lock)
// --------------------------
(function setupMetaObserver() {
  let HO_META_SKIP_UNTIL = 0;
  function hoMetaMute(ms = 160){ HO_META_SKIP_UNTIL = Date.now() + ms; }

  function hoMetaFinishBoot(){
    requestAnimationFrame(() =>
      document.documentElement.classList.remove("ho-meta-boot")
    );
  }

  // show boot-hide until first render
  document.documentElement.classList.add("ho-meta-boot");

  const resync = () => {
    hoMetaMute(260);
    try { requestOpenChatMetaSync('dom-or-route-resync'); } catch {}
    try { renderMetaInProjectList(); } catch {}
    hoMetaFinishBoot();
  };

  let rafPending = false;
  let debounceTO = 0;

  /* Window a burst of DOM requests coalesces into, and the longest a request
     can wait before its pass runs. The two are the same number because the
     pass is anchored to the request that armed it rather than to the last one
     seen — see schedule(). */
  const META_RESYNC_COALESCE_MS = 120;

  let root = null;
  let observer = null;
  let subscribedRegistry = null;
  let unsubscribeRegistry = null;
  let registryBindAttempts = 0;
  let registryBindTimer = 0;
  let registryBindSettled = false;
  let registryRefreshRAF = 0;
  let registryRefreshAll = false;

  function getRoot(){
    return document.querySelector("main") || document.body;
  }

  function bindObserver(){
    const newRoot = getRoot();
    if (newRoot === root && observer) return;

    try { observer?.disconnect(); } catch {}
    root = newRoot;

    observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true, attributes: false, characterData: false });
  }

  function scheduleRegistryRefresh(detail) {
    const changedChatIds = Array.isArray(detail?.chatIds)
      ? detail.chatIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (changedChatIds.length) {
      _pendingProjectMetaTracker.retain(changedChatIds);
      _projectReturnMetaDiag.retainedChangeCount += changedChatIds.length;
      _projectReturnMetaDiag.lastRetainedChatIds = [...new Set(changedChatIds)];
    } else {
      registryRefreshAll = true;
    }
    if (!isProjectPagePath()) return;
    if (registryRefreshRAF) return;
    registryRefreshRAF = requestAnimationFrame(() => {
      registryRefreshRAF = 0;
      if (!isProjectPagePath() || I.lock.locked()) return;
      const pendingChatIds = _pendingProjectMetaTracker.snapshot();
      const renderAll = registryRefreshAll;
      registryRefreshAll = false;
      if (!renderAll && !pendingChatIds.length) return;
      I.lock.with(() => renderMetaInProjectList(renderAll ? null : new Set(pendingChatIds)));
    });
  }

  /* Late Registry binding.

     0F1g publishes H2O.ChatRegistry several seconds after this module boots —
     measured on the Project route at ~t+12s, against 9A1c booting at ~t+2s and
     the cards painting at ~t+9s. Every existing way into
     bindRegistrySubscription is activity-driven: the MutationObserver through
     schedule(), navigation through kickMetaResync, and one boot rAF that runs
     long before the Registry exists. A page whose DOM settles in that gap
     therefore never binds, never attaches registry.ready, and keeps the
     pre-hydration fallback indefinitely. Measured live: 25 s idle, zero trusted
     rows, and a single inert DOM node flipping every one of them to truth.

     There is nothing to subscribe to instead. The whole *:ready vocabulary in
     this runtime has no Registry publication event, 0F1a registers services
     silently, and loadAndComplete in 0F1g only resolves its own promise —
     publishing such an event belongs to that owner, not here. Until it exists,
     this mirrors the wait 0F1g already performs for its own dependency in
     bootWhenLibraryCoreReady: a finite retry that stops the instant the
     Registry appears and gives up permanently after a bounded window. No
     interval, no observer, no animation-frame loop, and nothing left running
     once it settles either way. */
  const REGISTRY_BIND_MAX_ATTEMPTS = 40;

  function scheduleRegistryBindRetry() {
    if (registryBindSettled || registryBindTimer) return;
    if (registryBindAttempts >= REGISTRY_BIND_MAX_ATTEMPTS) {
      // Give up for good rather than degrade into a permanent poll.
      registryBindSettled = true;
      return;
    }
    // Same backoff shape the Registry uses for itself: quick at first,
    // then widening, so a normal boot binds in the first attempts and a runtime
    // without a Registry costs almost nothing on the way to giving up.
    const delay = Math.min(1400, 120 + registryBindAttempts * 40);
    registryBindAttempts += 1;
    registryBindTimer = setTimeout(() => {
      registryBindTimer = 0;
      bindRegistrySubscription();
      scheduleRegistryBindRetry();
    }, delay);
  }

  function bindRegistrySubscription() {
    const registry = window.H2O?.ChatRegistry || null;
    if (registry === subscribedRegistry && unsubscribeRegistry) return;
    try { unsubscribeRegistry?.(); } catch {}
    subscribedRegistry = null;
    unsubscribeRegistry = null;
    if (!registry || typeof registry.subscribe !== 'function') {
      scheduleRegistryBindRetry();
      return;
    }
    /* Bound. Nothing further needs waking, so the retry stops permanently and
       any armed timer is dropped. */
    registryBindSettled = true;
    if (registryBindTimer) { clearTimeout(registryBindTimer); registryBindTimer = 0; }
    subscribedRegistry = registry;
    unsubscribeRegistry = registry.subscribe(scheduleRegistryRefresh);
    try {
      registry.ready?.then?.(() => {
        /* Repair before the first refresh, so the cards this readiness callback
           is about to render already see the restored proofs instead of
           painting the fallback and correcting it a frame later. The upsert
           emits its own change too, which the subscription above picks up. */
        try { backfillRegistryProvenanceOnce(); } catch (_) {}
        scheduleRegistryRefresh({ chatIds: [] });
      });
    } catch {}
  }

  function schedule(){
    bindObserver(); // ✅ do this FIRST (main can swap)
    bindRegistrySubscription();

    // DOM churn is only a cheap *request*. Resetting the controller's trailing
    // settle window is constant-time; no DOM traversal or metadata acquisition
    // happens here. One flush reads the latest semantic state after mount churn.
    if (I.nav.currentChatId()) {
      requestOpenChatMetaSync('conversation-dom-mutation');
    }

    if (Date.now() < HO_META_SKIP_UNTIL) return;
    if (I.lock.locked()) return;

    /* Keep the first request, not the last one.

       This used to clear and re-arm the timer on every call. A Project page
       mutates far more often than every 120 ms — one harmless churn was
       measured reaching schedule() seven times — so each invocation cancelled
       the pending pass and the timer never elapsed: 7 armed, 6 cancelled, 0
       fired, resync never reached. A card whose row had been written before
       the Registry hydrated therefore kept "open once to load details" for a
       chat the Registry already described, for as long as the page kept
       moving.

       Coalescing into the pending pass costs a burst exactly one pass, same as
       before, but bounds the wait at META_RESYNC_COALESCE_MS from the request
       that armed it. Clearing debounceTO as the pass begins lets later churn
       arm the next one. */
    if (debounceTO) return;
    debounceTO = setTimeout(() => {
      debounceTO = 0;
      if (rafPending) return;
      rafPending = true;

      requestAnimationFrame(() => {
        rafPending = false;
        if (Date.now() < HO_META_SKIP_UNTIL) return;

        I.lock.with(resync);
      });
    }, META_RESYNC_COALESCE_MS);
  }



  function kickMetaResync(){

    document.documentElement.classList.add("ho-meta-boot");

    requestAnimationFrame(() => {
      bindObserver();
      bindRegistrySubscription();
      I.lock.with(() => {
        requestOpenChatMetaSync('route-raf');
        renderMetaInProjectList();
        hoMetaFinishBoot();
      });
    });

    setTimeout(() => {
      I.lock.with(() => {
        requestOpenChatMetaSync('route-settled');
        renderMetaInProjectList();
        hoMetaFinishBoot();
      });
    }, 350);
  }

  function requestMetaFromSemanticEvent(event) {
    requestOpenChatMetaSync(`semantic-event:${String(event?.type || 'unknown')}`);
  }

  window.addEventListener(I.nav.EVENT, kickMetaResync, true);
  [
    "evt:h2o:answers:scan",
    "h2o:answers:scan",
    "evt:h2o:core:turn:updated",
    "evt:h2o:minimap:ready",
    "evt:h2o:minimap:shell-ready",
    "evt:h2o:minimap:engine-ready",
    "evt:h2o:minimap:index:hydrated",
    "evt:h2o:minimap:index:appended",
  ].forEach((eventName) => {
    window.addEventListener(eventName, requestMetaFromSemanticEvent, true);
  });

  /* Cross-document Registry invalidation.

     The Registry lives in page-origin localStorage, so a capture performed in
     another tab updates the store without any in-document signal reaching a
     Project list that is already open. The subscription above only covers the
     document that observed the change, which is why a Project tab left open
     beside a chat tab kept showing "open once to load details" for a chat that
     had in fact been captured — the promise the fallback makes is per profile,
     not per document.

     The storage event fires only in OTHER same-origin documents, never in the
     writer, so this complements the in-document path instead of duplicating
     it: the writing tab still refreshes through the Registry subscription. */
  /* The Registry owns its own store. The first version of this bridge filtered
     on the interface store owned by 9A1a — no Registry write ever touches it,
     so the listener could not fire for the change it exists to observe. 0F1g
     publishes its key, so read it from there and keep the literal value only
     for the window before that module boots. */
  const REGISTRY_STORAGE_KEY_FALLBACK = 'h2o:library:chat-registry:v1';

  function registryStorageKey() {
    const key = window.H2O?.ChatRegistry?.storageKey;
    return typeof key === 'string' && key ? key : REGISTRY_STORAGE_KEY_FALLBACK;
  }

  function onRegistryStorageEvent(event) {
    /* Cheapest rejections first. This fires for every same-origin storage
       write in the profile, and the Project page has its own performance
       budget to respect. Resolving the key per event costs one property read
       and keeps a Registry that boots late — or renames its store — correct. */
    if (!event || event.key !== registryStorageKey()) return;
    if (event.newValue === event.oldValue) return;
    if (!isProjectPagePath()) return;
    /* Deriving the exact changed chatIds would mean parsing both the old and
       the new whole-store blobs on every write. Each record carries full first
       and last message text, so that parse costs far more than the coalesced
       re-render it would save. Refreshing the visible cards is the cheaper
       truthful path, and scheduleRegistryRefresh already collapses a burst of
       writes into a single rAF pass. */
    scheduleRegistryRefresh({ chatIds: [] });
  }

  if (!registryStorageBridgeBound) {
    registryStorageBridgeBound = true;
    window.addEventListener('storage', onRegistryStorageEvent, false);
  }

    if (!selfHealStarted) {
  selfHealStarted = true;

    // ✅ Self-heal: if main list renders without meta rows, re-kick
setInterval(() => {
  if (I.lock.locked()) return;
  if (Date.now() < HO_META_SKIP_UNTIL) return;
  if (!isProjectPagePath()) return;

  const links = listProjectCardLinks();
  if (!links.length) return;

  const sample = [...links].slice(0, 6);
  const missing = sample.some(link => {
    const wrapper = link.querySelector(':scope > div') || link.firstElementChild;
    const leftCol = wrapper?.querySelector(':scope > div') || wrapper?.firstElementChild || wrapper;
    return leftCol && !leftCol.querySelector(':scope > .ho-meta-row');
  });

  if (missing) kickMetaResync();
}, 900);

}
  requestAnimationFrame(() => {
    bindObserver();
    bindRegistrySubscription();
    kickMetaResync();
    try { I.pin.schedule(sortMainListByPins); } catch {}
  });
})();

window.__h2o_interface_meta_booted = true;
})();
