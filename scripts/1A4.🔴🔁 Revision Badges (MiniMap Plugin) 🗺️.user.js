// ==UserScript==
// @name         1A4.🔴🔁 Revision Badges (MiniMap Plugin) 🗺️
// @namespace    H2O.Prime.CGX.MiniMap.RevisionBadges
// @version      1.3.0
// @description  MiniMap plugin: renders right-corner revision counters (Q edits + A regens) by detecting nearby x/y chips (.tabular-nums).
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;

  // ───────────────────────────── 🧯 Safe helpers ─────────────────────────────
  const NOOP = () => {};

  // MiniMap button selector (robust; matches the core script's attributes)
  const SEL_BTN = '[data-cgxui="btn"][data-cgxui-owner], [data-cgxui="btn"], .ho-mm-btn, .cgxui-mm-btn';

  // Turn container selectors (mirror MiniMap core)
  const SEL_CONV_TURN      = '[data-testid="conversation-turn"]';
  const SEL_TURN_MSG_GROUP = '[class*="group/turn-messages"]';
  const SEL_TABULAR_NUMS   = '.tabular-nums';

  const ATTR_CGXUI_STATE = 'data-cgxui-state';

  function cgxStateSet(el, tok, on){
    if (!el) return;
    const cur = String(el.getAttribute(ATTR_CGXUI_STATE) || '').trim();
    const parts = cur ? cur.split(/\s+/).filter(Boolean) : [];
    const set = new Set(parts);
    if (on) set.add(tok);
    else set.delete(tok);
    const next = Array.from(set).join(' ').trim();
    if (next) el.setAttribute(ATTR_CGXUI_STATE, next);
    else el.removeAttribute(ATTR_CGXUI_STATE);
  }

  // ───────────────────────────── 🎨 CSS ─────────────────────────────
  function CSS_mountOnce(){
    if (W.__H2O_MM_REV_CSS__) return;
    W.__H2O_MM_REV_CSS__ = 1;

    const id = 'h2o-mm-revision-badges-css-v1';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
/* ───────────────────────────── 🔁 Revision Badges (MiniMap) ───────────────────────────── */

/* Ensure button can anchor corner badges */
${SEL_BTN}{ position: relative; }

/* 🔢 Mini counters inside MiniMap button (no badge box) */
${SEL_BTN} .cgxui-mm-qrev,
${SEL_BTN} .cgxui-mm-arev{
  position: absolute;
  right: 3px;
  font-size: 8px;
  line-height: 1;
  letter-spacing: -0.2px;
  pointer-events: none;
  z-index: 6;
  opacity: 0.55;

  padding: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;

  text-shadow: 0 0 2px rgba(0,0,0,0.45);
}

/* top-right = question edits */
${SEL_BTN} .cgxui-mm-qrev{ top: 2px; }

/* bottom-right = answer regens */
${SEL_BTN} .cgxui-mm-arev{ bottom: 2px; }
`;
    document.documentElement.appendChild(style);
  }

  // ───────────────────────────── ✅ Engine (copied from MiniMap core) ─────────────────────────────

  /** Parse "x/y" counter chips (returns {cur,total} or null) */
  function H2O_MM_parseSlashCounter(txt){
    const m = String(txt || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return null;
    const cur = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);
    if (!Number.isFinite(cur) || !Number.isFinite(total) || total <= 1) return null;
    return { cur, total };
  }

  /* ✅ Question edit detection (tabular-nums nearby) */
  function H2O_MM_getQEditInfo(qEl){
    if (!qEl) return null;

    const turn =
      qEl.closest?.(SEL_CONV_TURN) ||
      qEl.closest?.(SEL_TURN_MSG_GROUP) ||
      qEl.parentElement;

    if (!turn) return null;

    const qRect = qEl.getBoundingClientRect();

    const candidates = Array.from(turn.querySelectorAll(SEL_TABULAR_NUMS))
      .map(el => ({ el, rect: el.getBoundingClientRect(), txt: (el.textContent || '').trim() }))
      .map(x => ({ ...x, info: H2O_MM_parseSlashCounter(x.txt) }))
      .filter(x => x.info);

    if (!candidates.length) return null;

    let best = null, bestScore = Infinity;
    for (const c of candidates){
      const dy = c.rect.top - qRect.bottom;
      if (dy < -60 || dy > 260) continue;
      const score = Math.abs(dy);
      if (score < bestScore){ bestScore = score; best = c; }
    }
    return best ? best.info : null;
  }

  /* ✅ Answer regen detection (tabular-nums nearby) */
  function H2O_MM_getARegenInfo(aEl){
    if (!aEl) return null;

    const turn =
      aEl.closest?.(SEL_CONV_TURN) ||
      aEl.closest?.(SEL_TURN_MSG_GROUP) ||
      aEl.parentElement;

    if (!turn) return null;

    const aRect = aEl.getBoundingClientRect();

    const candidates = Array.from(turn.querySelectorAll(SEL_TABULAR_NUMS))
      .map(el => ({ el, rect: el.getBoundingClientRect(), txt: (el.textContent || '').trim() }))
      .map(x => ({ ...x, info: H2O_MM_parseSlashCounter(x.txt) }))
      .filter(x => x.info);

    if (!candidates.length) return null;

    let best = null, bestScore = Infinity;
    for (const c of candidates){
      const dy = c.rect.top - aRect.bottom;
      if (dy < -40 || dy > 260) continue;
      const score = Math.abs(dy);
      if (score < bestScore){ bestScore = score; best = c; }
    }
    return best ? best.info : null;
  }

  /* ✅ Apply the revision marker onto the minimap button */
  function H2O_MM_applyRevisionMark(btn, turn){
    if (!btn) return;

    const qEl = turn?.qEl || turn?.questionEl || null;
    const aEl = turn?.primaryAEl || turn?.aEl || turn?.answerEl || null;

    const qInfo = H2O_MM_getQEditInfo(qEl);
    const aInfo = H2O_MM_getARegenInfo(aEl);

    const hasRev = !!(qInfo || aInfo);
    cgxStateSet(btn, 'rev', hasRev);

    // qInfo/aInfo are {cur,total} from "x/y" chips. Display current/total revision state.
    const qBadgeText = qInfo ? `${qInfo.cur}/${qInfo.total}` : '';
    const aBadgeText = aInfo ? `${aInfo.cur}/${aInfo.total}` : '';

    // ↗️ Question edits badge (top-right)
    let qBadge = btn.querySelector('.cgxui-mm-qrev');
    if (qInfo) {
      if (!qBadge) {
        qBadge = document.createElement('span');
        qBadge.className = 'cgxui-mm-qrev';
        btn.appendChild(qBadge);
      }
      qBadge.textContent = qBadgeText;
    } else {
      qBadge?.remove();
    }

    // ↘️ Answer regen badge (bottom-right)
    let aBadge = btn.querySelector('.cgxui-mm-arev');
    if (aInfo) {
      if (!aBadge) {
        aBadge = document.createElement('span');
        aBadge.className = 'cgxui-mm-arev';
        btn.appendChild(aBadge);
      }
      aBadge.textContent = aBadgeText;
    } else {
      aBadge?.remove();
    }

    // Optional: richer tooltip
    if (hasRev){
      const parts = [];
      if (qInfo) parts.push(`Q ${qInfo.cur}/${qInfo.total}`);
      if (aInfo) parts.push(`A ${aInfo.cur}/${aInfo.total}`);
      const base = btn.title || `Turn ${btn.dataset.turnIdx || ''}`;
      btn.title = `${base} — revised (${parts.join(', ')})`;
    }
  }

  // ───────────────────────────── 🔁 Optional bulk sync ─────────────────────────────
  function getTurns(){
    const tShared = W.H2O_MM_getTurns?.();
    if (Array.isArray(tShared) && tShared.length) return tShared;

    const t0 = W.H2O?.turn?.getTurns?.();
    if (Array.isArray(t0) && t0.length) return t0;

    const t1 = W.H2O_MM_refreshTurnsCache?.();
    if (Array.isArray(t1) && t1.length) return t1;

    return [];
  }

  function bindEventsOnce(){
    if (W.__H2O_MM_REV_EVT__) return;
    W.__H2O_MM_REV_EVT__ = 1;

    const onSync = () => { try { scheduleSyncAll(); } catch {} };
    W.addEventListener('evt:h2o:minimap:ready', onSync, true);
    W.addEventListener('h2o:minimap:ready', onSync, true);
    W.addEventListener('evt:h2o:minimap:phase', onSync, true);
    W.addEventListener('h2o:minimap:phase', onSync, true);
  }

  function syncAll(){
    const turns = getTurns();
    if (!turns.length) return;

    const byIdx = new Map();
    for (const t of turns){
      const idx = parseInt(t?.idx || 0, 10);
      if (Number.isFinite(idx) && idx > 0) byIdx.set(idx, t);
    }

    const map = W.H2O_MM_mapButtons || W.mapButtons;
    if (!(map instanceof Map) || !map.size) return;

    for (const [, btn] of map.entries()){
      const idx = parseInt(btn?.dataset?.turnIdx || '', 10);
      const t = byIdx.get(idx);
      if (!t) continue;
      try { H2O_MM_applyRevisionMark(btn, t); } catch {}
    }
  }

  let REV_SYNC_RAF = 0;
  function scheduleSyncAll(){
    if (REV_SYNC_RAF) return;
    REV_SYNC_RAF = requestAnimationFrame(() => {
      REV_SYNC_RAF = 0;
      try { syncAll(); } catch {}
    });
  }

  // ───────────────────────────── 🔌 Exports ─────────────────────────────
  W.H2O_MM_applyRevisionMark = H2O_MM_applyRevisionMark;
  W.H2O_MM_REV_syncAllButtons = syncAll;

  // ───────────────────────────── 🚀 Boot ─────────────────────────────
  function boot(){
    CSS_mountOnce();
    bindEventsOnce();

    // Late-load tolerant: do a few sync passes until MiniMap map appears
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      try { scheduleSyncAll(); } catch {}
      const map = W.H2O_MM_mapButtons || W.mapButtons;
      if ((map instanceof Map && map.size) || tries > 25) clearInterval(t);
    }, 220);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

})();
