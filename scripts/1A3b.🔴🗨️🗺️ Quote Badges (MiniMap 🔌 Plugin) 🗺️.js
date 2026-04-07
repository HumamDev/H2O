// ==UserScript==
// @h2o-id             1a3b.quote.badges.minimap.plugin
// @name               1A3b.🔴🗨️🗺️ Quote Badges (MiniMap 🔌 Plugin) 🗺️
// @namespace          H2O.Premium.CGX.quote.badges.minimap.plugin
// @author             HumamDev
// @version            1.3.1
// @revision           001
// @build              260304-102754
// @description        MiniMap plugin: renders quote corner numbers (qfrom/qto) using Quote Tracker / Backrefs DOM markers.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const SEL_USER_MSG = '[data-message-author-role="user"]';
  const SEL_CONV_TURN = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"], [class*="group/turn-messages"]';
  const SEL_QBOX = '.cgxui-qswr-quoteBox';

  // ───────────────────────────── 🧯 Safe helpers ─────────────────────────────
  const NOOP = () => {};
  const hasCE = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function');

  function escAttr(v){
    const s = String(v ?? '');
    return hasCE ? CSS.escape(s) : s.replace(/"/g, '\\"');
  }

  // MiniMap button selector (AUTO-DETECT)
  // The core MiniMap uses scoped cgxui ids (e.g. data-cgxui="cgxui-mnmp-btn")
  // so we must detect the real selector at runtime to avoid CSS missing and digits merging.

  // MiniMap button marker class (stable contract; plugin will add it)
  const CLS_MM_BTN = 'cgxui-mm-btn';

    function CSS_mountOnce(){
    if (W.__H2O_MM_QB_CSS_V2__) return true;
    W.__H2O_MM_QB_CSS_V2__ = 1;

    const id = 'h2o-mm-quote-badges-css-v2';
    if (document.getElementById(id)) return true;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
/* ───────────────────────────── 💬 Quote corner numbers (no badge box) ───────────────────────────── */
.${CLS_MM_BTN}{
  position: relative !important; /* ensure corner nums can anchor */
}
.${CLS_MM_BTN} .cgxui-mm-qfrom,
.${CLS_MM_BTN} .cgxui-mm-qto{
  position: absolute !important;
  left: 3px !important;
  font-size: 8px !important;
  line-height: 1 !important;
  pointer-events: none !important;
  z-index: 6 !important;
  opacity: 0.50 !important;
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  text-shadow: 0 0 2px rgba(0,0,0,0.45) !important;

  display: none !important; /* default hidden until data-on */
}
/* ↖️ incoming quote source (came FROM turn X) */
.${CLS_MM_BTN} .cgxui-mm-qfrom{
  top: 3px !important;
  font-size: 8px !important;              /* superscript size */
  transform: translateY(-22%) !important; /* superscript feel */
}
/* ↙️ outgoing quote destination (quoted TO turn Y) */
.${CLS_MM_BTN} .cgxui-mm-qto{
  bottom: 3px !important;
  font-size: 8px !important;              /* subscript size */
  transform: translateY(22%) !important;  /* subscript feel */
}
/* Show only when active */
.${CLS_MM_BTN} .cgxui-mm-qfrom[data-on="1"],
.${CLS_MM_BTN} .cgxui-mm-qto[data-on="1"]{
  display: block !important;
}
    `;
    document.documentElement.appendChild(style);
    return true;
  }



  // ───────────────────────────── 💬 Quote map cache ─────────────────────────────
  let QB_CACHE = { stamp: 0, inByTurn: null, outByFrom: null };

  function setAdd(map, k, v){
    let s = map.get(k);
    if (!s){ s = new Set(); map.set(k, s); }
    s.add(v);
  }

  function pickSmallestPlus(setLike){
    const arr = Array.from(setLike || [])
      .map(n => parseInt(n, 10))
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a,b)=>a-b);
    if (!arr.length) return null;
    return String(arr[0]) + (arr.length > 1 ? '+' : '');
  }

  function getTurns(){
    const tShared = W.H2O_MM_getTurns?.();
    if (Array.isArray(tShared) && tShared.length) return tShared;

    // Preferred: H2O.Core turn API
    const t0 = W.H2O?.turn?.getTurns?.();
    if (Array.isArray(t0) && t0.length) return t0;

    // Next: MiniMap export (if present)
    const t1 = W.H2O_MM_refreshTurnsCache?.();
    if (Array.isArray(t1) && t1.length) return t1;

    return [];
  }

  function turnIdxForAnswerEl(aEl){
    const via = W.H2O_MM_turnIdxForAnswerEl?.(aEl);
    if (via) return via;

    // Fallback: try data-turn-idx on closest answer
    const raw = aEl?.getAttribute?.('data-turn-idx') || aEl?.dataset?.turnIdx || '';
    const n = parseInt(String(raw).trim(), 10);
    return (Number.isFinite(n) && n > 0) ? n : 0;
  }

  function buildMaps(force=false){
    const now = Date.now();
    if (!force && QB_CACHE.inByTurn && (now - QB_CACHE.stamp) < 800) return QB_CACHE;

    const inByTurn  = new Map(); // toTurnIdx -> Set(fromAIdx)
    const outByFrom = new Map(); // fromAIdx  -> Set(toTurnIdx)

    // Incoming quotes (TOP-LEFT): scan quote boxes inside each question (turn cache is authoritative)
    const turns = getTurns();

    function parseFromAIdx(qb){
      const ds = qb?.dataset || {};
      const v =
        ds.h2oQuoteFrom ?? ds.hoQuoteFrom ??
        qb.getAttribute?.('data-h2o-quote-from') ??
        qb.getAttribute?.('data-ho-quote-from') ??
        '';
      const n = parseInt(String(v).trim(), 10);
      return (Number.isFinite(n) && n > 0) ? n : null;
    }

    function resolveQuestionScope(turnLike){
      const qRaw = turnLike?.qEl || turnLike?.questionEl || null;
      if (!qRaw) return null;
      if (qRaw.matches?.(SEL_USER_MSG)) return qRaw;
      const up = qRaw.closest?.(SEL_USER_MSG);
      if (up) return up;
      const turn = qRaw.closest?.(SEL_CONV_TURN);
      if (!turn) return qRaw;
      return turn.querySelector?.(SEL_USER_MSG) || qRaw;
    }

    if (turns.length){
      for (const t of turns){
        const toTurnIdx = parseInt(t?.idx || 0, 10);
        if (!Number.isFinite(toTurnIdx) || toTurnIdx <= 0) continue;

        const qEl = resolveQuestionScope(t);
        if (!qEl || !qEl.querySelectorAll) continue;

        const qboxes = qEl.querySelectorAll(SEL_QBOX);
        if (!qboxes?.length) continue;

        qboxes.forEach(qb => {
          const fromAIdx = parseFromAIdx(qb);
          if (!fromAIdx) return;
          setAdd(inByTurn, toTurnIdx, fromAIdx);
        });
      }
    } else {
      // Fallback: scan all quote boxes and try to derive destination by walking to the next assistant msg
      const qboxes = document.querySelectorAll(SEL_QBOX);
      qboxes.forEach(qb => {
        const fromAIdx = parseFromAIdx(qb);
        if (!fromAIdx) return;

        const userMsg = qb.closest?.('[data-message-author-role="user"]') || null;
        if (!userMsg) return;

        // Walk to next assistant message
        let el = userMsg.nextElementSibling;
        while (el){
          if (el.matches?.('[data-message-author-role="assistant"]')) break;
          el = el.nextElementSibling;
        }
        if (!el) return;

        const toTurnIdx = turnIdxForAnswerEl(el);
        if (!toTurnIdx) return;

        setAdd(inByTurn, toTurnIdx, fromAIdx);
      });
    }

    // Outgoing quotes (BOTTOM-LEFT): read Quote Backrefs arrows (authoritative)
    const arrows = Array.from(document.querySelectorAll('button[data-turn][data-cgxui$="-arrow"][data-cgxui-owner]'));
    for (const ar of arrows){
      const toTurnIdx = parseInt(ar?.dataset?.turn || '', 10);
      if (!Number.isFinite(toTurnIdx) || toTurnIdx <= 0) continue;

      const srcAssistEl =
        ar.closest?.('[data-message-author-role="assistant"]') ||
        ar.closest?.('article [data-message-author-role="assistant"]') ||
        null;
      if (!srcAssistEl) continue;

      const fromAIdx = turnIdxForAnswerEl(srcAssistEl);
      if (!fromAIdx) continue;

      setAdd(outByFrom, fromAIdx, toTurnIdx);
    }

    // Legacy fallback: older Backrefs builds used a class name
    if (!outByFrom.size){
      const legacyArrows = Array.from(document.querySelectorAll('.cgxui-mqbk-arrow[data-turn]'));
      for (const ar of legacyArrows){
        const toTurnIdx = parseInt(ar?.dataset?.turn || ar.getAttribute?.('data-turn') || '', 10);
        if (!Number.isFinite(toTurnIdx) || toTurnIdx <= 0) continue;

        const srcAssistEl = ar.closest?.('[data-message-author-role="assistant"]') || null;
        if (!srcAssistEl) continue;

        const fromAIdx = turnIdxForAnswerEl(srcAssistEl);
        if (!fromAIdx) continue;

        setAdd(outByFrom, fromAIdx, toTurnIdx);
      }
    }

    // Derive outByFrom from incoming if needed
    if (!outByFrom.size && inByTurn.size){
      for (const [toIdx, fromSet] of inByTurn.entries()){
        for (const fromAIdx of fromSet) setAdd(outByFrom, fromAIdx, toIdx);
      }
    }

    QB_CACHE = { stamp: now, inByTurn, outByFrom };
    return QB_CACHE;
  }

  function ensureCornerEl(btn, cls){
    try { btn?.classList?.add?.(CLS_MM_BTN); } catch {}
    let el = btn.querySelector('.' + cls);
    if (!el){
      el = document.createElement('span');
      el.className = cls;
      el.setAttribute('aria-hidden', 'true');
      btn.appendChild(el);
    }
    return el;
  }

  function syncForIdx(btn, turnIdx){
    if (!btn) return;
    try { btn.classList.add(CLS_MM_BTN); } catch {}

    const idx = parseInt(String(turnIdx || '').trim(), 10);
    if (!Number.isFinite(idx) || idx <= 0) {
      btn.querySelector('.cgxui-mm-qfrom')?.remove();
      btn.querySelector('.cgxui-mm-qto')?.remove();
      return;
    }

    const cache = buildMaps(false);

    const inVal  = pickSmallestPlus(cache.inByTurn?.get(idx));
    const outVal = pickSmallestPlus(cache.outByFrom?.get(idx));

    const elIn  = ensureCornerEl(btn, 'cgxui-mm-qfrom');
    const elOut = ensureCornerEl(btn, 'cgxui-mm-qto');

    if (inVal){
      elIn.textContent = inVal;
      elIn.setAttribute('data-on','1');
    } else {
      elIn.textContent = '';
      elIn.removeAttribute('data-on');
    }

    if (outVal){
      elOut.textContent = outVal;
      elOut.setAttribute('data-on','1');
    } else {
      elOut.textContent = '';
      elOut.removeAttribute('data-on');
    }
  }

  function syncForTurn(btn, t){
    return syncForIdx(btn, t?.idx);
  }

  function syncAllButtons(){
    const map = W.H2O_MM_mapButtons || W.mapButtons;
    if (!(map instanceof Map) || !map.size) return;
    for (const [id, btn] of map.entries()){
      try { btn?.classList?.add?.(CLS_MM_BTN); } catch {}
      const idx = parseInt(btn?.dataset?.turnIdx || btn?.dataset?.turnIdx || '', 10) || 0;
      if (idx) syncForIdx(btn, idx);
    }
  }

  let QB_SYNC_RAF = 0;
  function scheduleSyncAllButtons(){
    if (QB_SYNC_RAF) return;
    QB_SYNC_RAF = requestAnimationFrame(() => {
      QB_SYNC_RAF = 0;
      try { syncAllButtons(); } catch {}
    });
  }

  function syncOneFromIndexDetail(detail = {}){
    const idx = parseInt(String(detail?.idx || '').trim(), 10);
    const msgId = String(detail?.msgId || detail?.answerId || '').trim();
    const map = W.H2O_MM_mapButtons || W.mapButtons;
    if (!(map instanceof Map) || !map.size) return false;
    let btn = null;
    if (msgId) btn = map.get(msgId) || null;
    if (!btn) {
      for (const entry of new Set(Array.from(map.values()))) {
        if (!entry) continue;
        const entryMsg = String(entry.dataset?.primaryAId || '').trim();
        const entryIdx = parseInt(String(entry.dataset?.turnIdx || '').trim(), 10);
        if (msgId && entryMsg === msgId) { btn = entry; break; }
        if (Number.isFinite(idx) && idx > 0 && entryIdx === idx) { btn = entry; break; }
      }
    }
    if (!btn) return false;
    const turnIdx = Number.isFinite(idx) && idx > 0
      ? idx
      : (parseInt(String(btn.dataset?.turnIdx || '').trim(), 10) || 0);
    if (!turnIdx) return false;
    try { syncForIdx(btn, turnIdx); } catch { return false; }
    return true;
  }

  // ───────────────────────────── 🔁 Event bridge ─────────────────────────────
  function bindQuoteEventsOnce(){
    if (W.__H2O_MM_QB_EVT__) return;
    W.__H2O_MM_QB_EVT__ = 1;

    const onQuoteStructuralEvt = (e) => {
      QB_CACHE.stamp = 0;
      try { W.H2O_scheduleMiniMapRebuild?.(`quote:${e?.type || 'evt'}`); } catch {}
      try { scheduleSyncAllButtons(); } catch {}
    };
    const onQuoteSyncEvt = () => {
      QB_CACHE.stamp = 0;
      try { scheduleSyncAllButtons(); } catch {}
    };
    const onIndexSyncEvt = (e) => {
      QB_CACHE.stamp = 0;
      if (e?.type === 'evt:h2o:minimap:index:appended' && syncOneFromIndexDetail(e?.detail || {})) return;
      try { scheduleSyncAllButtons(); } catch {}
    };

    W.addEventListener('h2o:quote:pending', onQuoteSyncEvt, true);
    W.addEventListener('h2o:quote:chip', onQuoteSyncEvt, true);
    W.addEventListener('evt:h2o:minimap:ready', onQuoteSyncEvt, true);
    W.addEventListener('h2o:minimap:ready', onQuoteSyncEvt, true);
    W.addEventListener('evt:h2o:minimap:phase', onQuoteSyncEvt, true);
    W.addEventListener('h2o:minimap:phase', onQuoteSyncEvt, true);
    W.addEventListener('h2o:index:updated', onQuoteSyncEvt, true);
    W.addEventListener('h2o:turn:updated', onQuoteSyncEvt, true);
    W.addEventListener('evt:h2o:message:remounted', onQuoteSyncEvt, true);
    W.addEventListener('h2o:message:remounted', onQuoteSyncEvt, true);
    W.addEventListener('h2o:quote:chipChanged', onQuoteSyncEvt, true);
    W.addEventListener('h2o:qwrap:wrapped', onQuoteStructuralEvt, true);
    W.addEventListener('evt:h2o:minimap:index:hydrated', onIndexSyncEvt, true);
    W.addEventListener('evt:h2o:minimap:index:appended', onIndexSyncEvt, true);
  }

  // ───────────────────────────── 🔌 Exports ─────────────────────────────
  W.H2O_MM_syncQuoteBadgesForIdx  = syncForIdx;
  W.H2O_MM_syncQuoteBadgesForTurn = syncForTurn;
  W.H2O_MM_QB_syncAllButtons      = syncAllButtons;

  // ───────────────────────────── 🚀 Boot ─────────────────────────────
  function boot(){
    // CSS must mount AFTER the MiniMap buttons exist (selector is runtime-detected).
    // We'll retry a few times to avoid the classic "digits merge" failure mode.
    let cssOk = false;
    try { cssOk = !!CSS_mountOnce(); } catch {}
    bindQuoteEventsOnce();

    // Initial sync (late-load tolerant)
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      if (!cssOk) { try { cssOk = !!CSS_mountOnce(); } catch {} }
      try { scheduleSyncAllButtons(); } catch {}
      // stop once map exists or after ~5s
      const map = W.H2O_MM_mapButtons || W.mapButtons;
      if (((map instanceof Map && map.size) && cssOk) || tries > 25) clearInterval(t);
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

})();
