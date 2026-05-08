// ==UserScript==
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
// ==/UserScript==

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
      const answerId = String(turn?.answerId || turn?.primaryAId || turn?.aId || '').trim();
      const answerEl = turn?.answerEl || turn?.primaryAEl || turn?.el || turn?.live?.primaryAEl || null;
      if (answerId || answerEl) out.push({ id: answerId, el: answerEl });
    }
    return out;
  }

  function listMiniMapTurns(refresh = false) {
    const sources = [
      () => refresh ? window.H2O_MM_refreshTurnsCache?.() : null,
      () => window.H2O_MM_getTurns?.(),
      () => refresh ? window.H2O?.MM?.mnmp?.api?.core?.refreshTurnsCache?.() : null,
      () => window.H2O?.MM?.mnmp?.api?.core?.getTurns?.(),
      () => refresh ? window.H2O_MM_SHARED?.get?.()?.api?.core?.refreshTurnsCache?.() : null,
      () => window.H2O_MM_SHARED?.get?.()?.api?.core?.getTurns?.(),
    ];

    for (const source of sources) {
      try {
        const rows = source();
        if (Array.isArray(rows) && rows.length) return rows;
      } catch {}
    }

    return [];
  }

  function listMiniMapAnswers() {
    const sources = [
      () => window.H2O_MM_getAnswersSafe?.(),
      () => window.H2O?.MM?.mnmp?.api?.core?.getAnswerList?.(),
      () => window.H2O_MM_SHARED?.get?.()?.api?.core?.getAnswerList?.(),
      () => window.getAnswers?.(),
    ];

    for (const source of sources) {
      try {
        const rows = source();
        if (Array.isArray(rows) && rows.length) return rows;
      } catch {}
    }

    return [];
  }

  function hasAnswerLikeTurn(row) {
    return !!(
      String(row?.answerId || row?.primaryAId || row?.aId || "").trim() ||
      row?.answerEl ||
      row?.primaryAEl ||
      row?.el ||
      row?.live?.primaryAEl
    );
  }

  function countAnswerLikeTurns(rows) {
    if (!Array.isArray(rows) || !rows.length) return 0;
    const answerRows = rows.filter(hasAnswerLikeTurn);
    const countableRows = answerRows.length ? answerRows : rows;
    return uniqueCountFromList(countableRows, [
      (turn) => turn.answerId || turn.primaryAId || turn.aId,
      (turn) => turn.turnId,
      (turn) => turn.id,
      (turn) => turn.index,
    ]);
  }

  function countMiniMapButtons() {
    const btns = [...document.querySelectorAll(
      '[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"], .cgxui-mm-btn'
    )].filter((el) => el instanceof HTMLElement && el.isConnected);

    return uniqueCountFromList(btns, [
      (el) => el.dataset?.primaryAId,
      (el) => el.dataset?.turnId,
      (el) => el.dataset?.id,
      (el) => el.dataset?.index,
      (el) => el.getAttribute?.("aria-label"),
      (el) => el.textContent,
    ]);
  }

  function parseMiniMapCounterTotal() {
    const nodes = [...document.querySelectorAll([
      '[data-cgxui$="counter"]',
      '[data-cgxui$="count"]',
      '.cgxui-mm-count',
      '.cgxui-mm-counter',
      '.cgxui-mnmp-count',
      '.cgxui-mnmp-counter',
    ].join(","))];

    for (const node of nodes) {
      const text = String(node?.textContent || "").trim();
      const match = text.match(/(?:answer\s*:?\s*)?(\d+)\s*\/\s*(\d+)/i);
      const total = toPositiveInt(match?.[2]);
      if (total) return total;
    }

    return 0;
  }

  function countAssistantAnswersFromDom() {
    const nodes = [...document.querySelectorAll(
      'article[data-message-author-role="assistant"], div[data-message-author-role="assistant"], [data-message-author-role="assistant"]'
    )].filter((el) => el instanceof HTMLElement && el.isConnected);

    return uniqueCountFromList(nodes, [
      (el) => el.getAttribute?.("data-message-id"),
      (el) => el.dataset?.messageId,
      (el) => el.id,
    ]);
  }

  function countMiniMapAnswers() {
    const turns = listMiniMapTurns(false);
    const turnCount = countAnswerLikeTurns(turns);
    if (turnCount) return turnCount;

    const refreshedTurns = listMiniMapTurns(true);
    const refreshedTurnCount = countAnswerLikeTurns(refreshedTurns);
    if (refreshedTurnCount) return refreshedTurnCount;

    const answersCount = uniqueCountFromList(listMiniMapAnswers(), [
      (el) => el.getAttribute?.("data-message-id"),
      (el) => el.dataset?.messageId,
      (el) => el.id,
    ]);
    if (answersCount) return answersCount;

    return parseMiniMapCounterTotal() || countMiniMapButtons();
  }

  function countAssistantAnswers() {
    const miniMapCount = countMiniMapAnswers();
    if (miniMapCount) return miniMapCount;

    const turns = listRuntimeTurns();
    const runtimeCount = listRuntimeAnswers(turns).length;
    if (runtimeCount) return runtimeCount;

    return countAssistantAnswersFromDom();
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2, "0");
    const mon = d.toLocaleString(undefined, { month: "short" });
    const yy = d.getFullYear();
    return `${dd} ${mon} ${yy}`;
  }

  // 🔍 Read actual creation time from React fiber (same idea as timestamp script)
  function getFirstMessageCreateTimeMs() {
    const firstAssistant = listRuntimeAnswers().find((entry) => !!entry?.el)?.el || null;
    if (!firstAssistant) return null;

    const reactKey = Object.keys(firstAssistant).find(k => k.startsWith("__reactFiber$"));
    if (!reactKey) return null;

    const fiber = firstAssistant[reactKey];
    const messages = fiber?.return?.memoizedProps?.messages;
    const tsSec = messages?.[0]?.create_time;
    if (!tsSec) return null;

    return tsSec * 1000;
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
  // Try to avoid copying button labels etc; innerText is OK here.
  return normText(el.innerText || el.textContent || "");
}

function getFirstLastSnapshots(){
  const turns = listRuntimeTurns();
  const answers = listRuntimeAnswers(turns);
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


  // --------------------------
  // update meta while inside chat
  // --------------------------
function updateMetaFromOpenChat() {
  const chatId = I.nav.currentChatId();
  if (!chatId) return;

  const existing = I.store.getMeta(chatId);
  const now = Date.now();
  const nextAnswers = countAssistantAnswers();
  const prevAnswers = toPositiveInt(existing?.answers);
  const answers = nextAnswers || prevAnswers || 0;
  const tsMs = getFirstMessageCreateTimeMs();

  const createdAt = tsMs ?? existing?.createdAt ?? now;

  // ✅ NEW: first/last Q/A snapshots (from open chat DOM)
  const snaps = getFirstLastSnapshots();

  const partial = {
    createdAt: (!existing?.createdAt || (tsMs && tsMs < existing.createdAt))
      ? createdAt
      : existing.createdAt,
    answers,
    updatedAt: now,

    // ✅ store snapshots
    firstQ: existing ? (snaps.firstQ || existing.firstQ || "") : snaps.firstQ,
    firstA: existing ? (snaps.firstA || existing.firstA || "") : snaps.firstA,
    lastQ:  existing ? (snaps.lastQ  || existing.lastQ  || "") : snaps.lastQ,
    lastA:  existing ? (snaps.lastA  || existing.lastA  || "") : snaps.lastA,
  };

  I.store.setMeta(chatId, partial);
}


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
function renderMetaInProjectList() {
  const meta = I.store.getAllMeta();
  const links = document.querySelectorAll('main a[href*="/c/"]');

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
    const data = meta[chatId];

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

    if (!metaRow) {
      metaRow = document.createElement("div");
      metaRow.className = "ho-meta-row";
      titleRow.insertAdjacentElement("afterend", metaRow);
    }

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


    // no meta yet -> hide row
 const safe = data || {};
const dateStr = safe.createdAt ? formatDate(safe.createdAt) : "—";
const answersStr = (safe.answers ?? null) !== null ? String(safe.answers) : "—";

const leftText = (dateStr !== "—" || answersStr !== "—")
  ? `${dateStr} · ${answersStr} answers`
  : `Open once · — answers`;

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
  <div class="m">Created: <b>${escapeHtml(dateStr || "—")}</b></div>
  <div class="m">Answers: <b>${escapeHtml(answersStr)}</b></div>
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
  });

  if (sawPinned) {
    try { I.pin.schedule(sortMainListByPins); } catch {}
  }
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
    try { updateMetaFromOpenChat(); } catch {}
    try { renderMetaInProjectList(); } catch {}
    hoMetaFinishBoot();
  };

  let rafPending = false;
  let debounceTO = 0;

  let root = null;
  let observer = null;

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

  function schedule(){
    bindObserver(); // ✅ do this FIRST (main can swap)

    if (Date.now() < HO_META_SKIP_UNTIL) return;
    if (I.lock.locked()) return;

    clearTimeout(debounceTO);
    debounceTO = setTimeout(() => {
      if (rafPending) return;
      rafPending = true;

      requestAnimationFrame(() => {
        rafPending = false;
        if (Date.now() < HO_META_SKIP_UNTIL) return;

        I.lock.with(resync);
      });
    }, 120);
  }



  function kickMetaResync(){

    document.documentElement.classList.add("ho-meta-boot");

    requestAnimationFrame(() => {
      bindObserver();
      I.lock.with(resync);
    });

    setTimeout(() => {
      I.lock.with(resync);
    }, 350);
  }

  function refreshMetaFromMiniMapEvent() {
    requestAnimationFrame(() => {
      if (I.lock.locked()) return;
      I.lock.with(resync);
    });

    setTimeout(() => {
      if (I.lock.locked()) return;
      I.lock.with(resync);
    }, 420);
  }

  window.addEventListener(I.nav.EVENT, kickMetaResync, true);
  [
    "evt:h2o:answers:scan",
    "h2o:answers:scan",
    "evt:h2o:minimap:ready",
    "evt:h2o:minimap:shell-ready",
    "evt:h2o:minimap:engine-ready",
    "evt:h2o:minimap:index:hydrated",
    "evt:h2o:minimap:index:appended",
  ].forEach((eventName) => {
    window.addEventListener(eventName, refreshMetaFromMiniMapEvent, true);
  });

    if (!selfHealStarted) {
  selfHealStarted = true;

    // ✅ Self-heal: if main list renders without meta rows, re-kick
setInterval(() => {
  if (I.lock.locked()) return;
  if (Date.now() < HO_META_SKIP_UNTIL) return;

  const links = document.querySelectorAll('main a[href*="/c/"]');
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
    kickMetaResync();
    try { I.pin.schedule(sortMainListByPins); } catch {}
  });
})();

window.__h2o_interface_meta_booted = true;
})();
