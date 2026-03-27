// ==UserScript==
// @h2o-id             6b1a.sticky.notes.portal
// @name               6B1a.🟢📝 Sticky Notes Portal 📝
// @namespace          H2O.Premium.CGX.sticky.notes.portal
// @author             HumamDev
// @version            1.3.0
// @revision           001
// @build              260304-102754
// @description        (Margin Anchor Addon) Sticky Notes Portal for Margin Anchor (H2O). Splits body-mounted resizable note boxes into a separate script while preserving full functionality. Hard-linked via H2O vault + versioned events; load order safe.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * H2O Module Standard — Contract (v2.0) 💧✅  — STAGE 1 (Mechanics only) 🧱⚙️
   * ========================================================================= */

  const W = window;
  const D = document;

  // MUST match Core identity (same vault, same SkID, same PID)
  const TOK = 'MA';
  const PID = 'mrgnnchr';
  const SkID = 'mrnc';
  const BrID = PID;

  const MODTAG = 'MAnchorNotes';
  const SUITE  = 'prm';
  const HOST   = 'cgx';
  const DsID   = PID;

  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));
  MOD_OBJ.meta = MOD_OBJ.meta || { tok: TOK, pid: PID, skid: SkID, modtag: 'MAnchor', suite: SUITE, host: HOST };
  MOD_OBJ.api  = MOD_OBJ.api  || {};

  // Attributes (must match Core)
  const ATTR_CGXUI       = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';

  // UI tokens (must match Core)
  const UI_MANCHOR_NOTEBOX   = `${SkID}-notebox`;
  const UI_MANCHOR_NOTE_HDR  = `${SkID}-note-hdr`;
  const UI_MANCHOR_NOTE_BTNS = `${SkID}-note-btns`;
  const UI_MANCHOR_NOTE_BTN  = `${SkID}-note-btn`;
  const UI_MANCHOR_NOTE_PAL  = `${SkID}-note-pal`;
  const UI_MANCHOR_NOTE_SW   = `${SkID}-note-sw`;
  const UI_MANCHOR_NOTE_TX   = `${SkID}-note-tx`;

  // Style id split (avoid collision with core style)
  const CSS_NOTE_STYLE_ID = `cgxui-${SkID}-note-style`;

  // Event topics (read from core if available; otherwise compute)
  const NS_EV = `h2o.ev:${SUITE}:${HOST}:${DsID}`;
  const EV_MANCHOR_READY_V1       = `${NS_EV}:ready:v1`;
  const EV_MANCHOR_NOTE_TOGGLE_V1 = `${NS_EV}:note:toggle:v1`;
  const EV_MANCHOR_NOTE_CLOSE_V1  = `${NS_EV}:note:close:v1`;
  const EV_MANCHOR_NOTE_STATE_V1  = `${NS_EV}:note:state:v1`; // notes -> core

  /* ───────────────────────────── 🔴 STATE 📄🔓💧 ───────────────────────────── */
  const STATE = {
    booted: false,
    disposers: [],

    // open + palette state
    noteOpen: new Set(),          // key
    notePalOpen: new Set(),       // key

    // draft + save debounce
    noteSaveTimers: new Map(),    // key -> timer
    noteTextDraft: new Map(),     // key -> { itemId, text }

    // portal registry
    notePortals: new Map(),       // key -> { el, msgEl, a, itemId }
    notePosRaf: 0,

    // local muting
    muting: 0
  };

  /* ───────────────────────────── 🟩 Helpers / Guards 🧷🔓💧 ───────────────────────────── */
  function DIAG_warn(...a){ try { console.warn('[H2O][MAnchorNotes]', ...a); } catch {} }
  function DIAG_err(...a){ try { console.error('[H2O][MAnchorNotes]', ...a); } catch {} }

  function CORE_API() {
    return MOD_OBJ.api?.core || null;
  }

  function SAFE_withMut(fn){
    STATE.muting++;
    try { return fn(); } finally { STATE.muting--; }
  }

  function NOTE_removePortal(key){
    const rec = STATE.notePortals.get(key);
    if (!rec) return;
    try { rec.el?.remove(); } catch {}
    STATE.notePortals.delete(key);
  }

  function NOTE_applyColor(el, hex){
    const c = (hex || '#ffd24a').trim();
    const h = c.replace('#','');
    const ok = /^[0-9a-fA-F]{6}$/.test(h);
    const r = ok ? parseInt(h.slice(0,2),16) : 255;
    const g = ok ? parseInt(h.slice(2,4),16) : 210;
    const b = ok ? parseInt(h.slice(4,6),16) : 74;

    const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
    const fg  = lum > 0.62 ? '#141414' : '#f6f6f6';

    const br = Math.max(0, Math.floor(r*0.55));
    const bg = `rgb(${r},${g},${b})`;
    el.style.setProperty('--h2o-note-bg', bg);
    el.style.setProperty('--h2o-note-fg', fg);
    el.style.setProperty('--h2o-note-border', `rgba(${br},${br},${br},.45)`);
  }

  function NOTE_scheduleReposition(){
    if (STATE.notePosRaf) return;
    STATE.notePosRaf = requestAnimationFrame(() => {
      STATE.notePosRaf = 0;
      try { NOTE_repositionAll(); } catch (e) { DIAG_err(e); }
    });
  }

  function NOTE_repositionAll(){
    const api = CORE_API();
    const anchorToY = api?.util?.anchorToY;
    if (typeof anchorToY !== 'function') return;

    for (const [k, rec] of STATE.notePortals) {
      const el = rec?.el;
      const msgEl = rec?.msgEl;
      const a = rec?.a;
      if (!el || !msgEl || !D.contains(msgEl) || !a) {
        NOTE_removePortal(k);
        continue;
      }

      const y = anchorToY(msgEl, a);
      const mr = msgEl.getBoundingClientRect();

      const w = el.offsetWidth || 260;
      const h = el.offsetHeight || 220;

      let left = mr.left - w - 14;
      if (left < 8) left = 8;

      let top = mr.top + y - 26;
      top = Math.max(8, Math.min(top, W.innerHeight - h - 8));

      el.style.left = `${Math.round(left)}px`;
      el.style.top  = `${Math.round(top)}px`;
    }
  }

  /* ───────────────────────────── 🎨 CSS (Notes only) 🎨 ───────────────────────────── */
  function CSS_noteText(){
    const ATTR = ATTR_CGXUI;
    const OWN  = ATTR_CGXUI_OWNER;
    const AST  = ATTR_CGXUI_STATE;

    const selScoped = (ui) => `[${ATTR}="${ui}"][${OWN}="${SkID}"]`;

    return `
${selScoped(UI_MANCHOR_NOTEBOX)}{
  position:fixed;
  top:0; left:0;
  width:260px;
  min-width:200px;
  max-width:420px;
  height:220px;
  min-height:160px;
  max-height:520px;
  padding:10px;
  border-radius:10px;
  overflow:hidden;
  z-index:2147483647;
  background: var(--h2o-note-bg, #ffd24a);
  color: var(--h2o-note-fg, #141414);
  border: 1px solid var(--h2o-note-border, rgba(0,0,0,.25));
  box-shadow: 0 18px 50px rgba(0,0,0,.35);
  backdrop-filter: blur(8px);
  resize: both;
  box-sizing: border-box;
  display:flex;
  flex-direction:column;
}

${selScoped(UI_MANCHOR_NOTE_HDR)}{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  margin-bottom: 8px;
}

${selScoped(UI_MANCHOR_NOTE_BTNS)}{
  display:flex;
  gap:8px;
  align-items:center;
}

${selScoped(UI_MANCHOR_NOTE_BTN)}{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  min-width:34px;
  min-height:30px;

  border: 1px solid rgba(255,255,255,.28) !important;
  background: rgba(255,255,255,.18) !important;
  color: inherit !important;
  border-radius: 8px;
  padding: 6px 8px;
  cursor:pointer;
  opacity: 1 !important;
  user-select:none;
}

${selScoped(UI_MANCHOR_NOTE_BTN)} svg{
  width:18px;
  height:18px;
  display:block;
}

${selScoped(UI_MANCHOR_NOTE_PAL)}{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin: 6px 0 10px;
}

${selScoped(UI_MANCHOR_NOTE_SW)}{
  width:18px;
  height:18px;
  border-radius:6px;
  border: 1px solid color-mix(in oklab, #ffffff 18%, transparent);
  cursor:pointer;
  box-shadow: 0 10px 20px rgba(0,0,0,.25);
  opacity:.95;
}

${selScoped(UI_MANCHOR_NOTE_TX)}{
  width:100%;
  height:100%;
  box-sizing:border-box;

  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;

  border-radius: 0;
  color: inherit;

  padding: 10px 10px;
  margin: 0;

  font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  resize: none !important;
}

[${OWN}="${SkID}"] [${ATTR}="${UI_MANCHOR_NOTE_TX}"]{
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  resize: none !important;
}

/* Palette show/hide */
${selScoped(UI_MANCHOR_NOTEBOX)}[${AST}="pal-closed"] ${selScoped(UI_MANCHOR_NOTE_PAL)}{ display:none; }
${selScoped(UI_MANCHOR_NOTEBOX)}[${AST}="pal-open"]   ${selScoped(UI_MANCHOR_NOTE_PAL)}{ display:flex; }
`;
  }

  function UI_ensureNoteStyle(){
    let style = D.getElementById(CSS_NOTE_STYLE_ID);
    if (!style) {
      style = D.createElement('style');
      style.id = CSS_NOTE_STYLE_ID;
      D.documentElement.appendChild(style);
      STATE.disposers.push(() => { try { style.remove(); } catch {} });
    }
    const txt = CSS_noteText();
    if (style.textContent !== txt) style.textContent = txt;
  }

  /* ───────────────────────────── 🏗️ Portal Build 📝 ───────────────────────────── */
  function NOTE_buildPortal({ key, msgEl, a, item }) {
    UI_ensureNoteStyle();

    const box = D.createElement('div');
    box.setAttribute(ATTR_CGXUI, UI_MANCHOR_NOTEBOX);
    box.setAttribute(ATTR_CGXUI_OWNER, SkID);
    box.dataset.key = key;

    const hdr = D.createElement('div');
    hdr.setAttribute(ATTR_CGXUI, UI_MANCHOR_NOTE_HDR);
    hdr.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const left = D.createElement('div');
    left.textContent = 'Note';

    const btns = D.createElement('div');
    btns.setAttribute(ATTR_CGXUI, UI_MANCHOR_NOTE_BTNS);
    btns.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const btnPal = D.createElement('button');
    btnPal.type = 'button';
    btnPal.setAttribute(ATTR_CGXUI, UI_MANCHOR_NOTE_BTN);
    btnPal.setAttribute(ATTR_CGXUI_OWNER, SkID);
    btnPal.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 0 18h2.2a2.3 2.3 0 0 0 2.3-2.3c0-1-.7-1.8-1.6-2.1l-1.1-.3a2.1 2.1 0 0 1-1.5-2c0-1.2 1-2.2 2.2-2.2h2.2A4.6 4.6 0 0 0 21 7.5C19.6 5 16.9 3 12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <circle cx="8.5" cy="10" r="1" fill="currentColor"/>
        <circle cx="11.5" cy="8" r="1" fill="currentColor"/>
        <circle cx="7.5" cy="13" r="1" fill="currentColor"/>
      </svg>
    `;

    const btnClose = D.createElement('button');
    btnClose.type = 'button';
    btnClose.setAttribute(ATTR_CGXUI, UI_MANCHOR_NOTE_BTN);
    btnClose.setAttribute(ATTR_CGXUI_OWNER, SkID);
    btnClose.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    `;

    btns.append(btnPal, btnClose);
    hdr.append(left, btns);

    const pal = D.createElement('div');
    pal.setAttribute(ATTR_CGXUI, UI_MANCHOR_NOTE_PAL);
    pal.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const api = CORE_API();
    const colors = (api?.cfg?.NOTE_COLORS || ['#ffd24a', '#9be7ff', '#b7ffb2', '#ffb6d5', '#d5b6ff', '#ffffff', '#2b2b2b']);

    for (const c of colors) {
      const sw = D.createElement('button');
      sw.type = 'button';
      sw.setAttribute(ATTR_CGXUI, UI_MANCHOR_NOTE_SW);
      sw.setAttribute(ATTR_CGXUI_OWNER, SkID);
      sw.style.background = c;
      sw.title = c;

      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          api?.items?.updateItem?.(msgEl, a, item.id, { ui: { ...(item.ui || {}), color: c }, data: { ...(item.data || {}), color: c } });
        } catch {}
        NOTE_applyColor(box, c);
        try { api?.ui?.scheduleRepaint?.(msgEl); } catch {}
      }, { passive: false });

      pal.appendChild(sw);
    }

    const ta = D.createElement('textarea');
    ta.setAttribute(ATTR_CGXUI, UI_MANCHOR_NOTE_TX);
    ta.setAttribute(ATTR_CGXUI_OWNER, SkID);
    ta.placeholder = 'Type…';

    const draft = STATE.noteTextDraft.get(key);
    ta.value = (draft?.text ?? item?.data?.text ?? '').toString();

    const initialColor = (item?.ui?.color || item?.data?.color || api?.cfg?.NOTE_DEFAULT_COLOR || '#ffd24a');
    NOTE_applyColor(box, initialColor);

    ta.addEventListener('input', () => {
      STATE.noteTextDraft.set(key, { itemId: item.id, text: ta.value });

      const prev = STATE.noteSaveTimers.get(key);
      if (prev) clearTimeout(prev);

      const t = setTimeout(() => {
        try { api?.items?.updateItem?.(msgEl, a, item.id, { data: { text: ta.value } }); }
        catch (e) { DIAG_err(e); }
        STATE.noteSaveTimers.delete(key);
      }, 250);

      STATE.noteSaveTimers.set(key, t);
    });

    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      NOTE_apiClose(key, msgEl);
    }, { passive: false });

    btnPal.addEventListener('click', (e) => {
      e.stopPropagation();
      if (STATE.notePalOpen.has(key)) STATE.notePalOpen.delete(key);
      else STATE.notePalOpen.add(key);
      box.setAttribute(ATTR_CGXUI_STATE, STATE.notePalOpen.has(key) ? 'pal-open' : 'pal-closed');
    }, { passive: false });

    box.append(hdr, pal, ta);
    box.setAttribute(ATTR_CGXUI_STATE, STATE.notePalOpen.has(key) ? 'pal-open' : 'pal-closed');

    D.body.appendChild(box);
    STATE.notePortals.set(key, { el: box, msgEl, a, itemId: item.id });

    setTimeout(() => { try { ta.focus(); } catch {} }, 0);
    NOTE_scheduleReposition();
    return box;
  }

  function NOTE_ensurePortal({ key, msgEl, a, item }){
    let rec = STATE.notePortals.get(key);
    if (!rec || !rec.el || !D.contains(rec.el)) {
      NOTE_buildPortal({ key, msgEl, a, item });
    } else {
      rec.msgEl = msgEl;
      rec.a = a;
      rec.itemId = item?.id;

      const api = CORE_API();
      const color = (item?.ui?.color || item?.data?.color || api?.cfg?.NOTE_DEFAULT_COLOR || '#ffd24a');
      NOTE_applyColor(rec.el, color);

      const ta = rec.el.querySelector?.(`[${ATTR_CGXUI}="${UI_MANCHOR_NOTE_TX}"]`);
      if (ta && ta instanceof HTMLTextAreaElement) {
        const draft = STATE.noteTextDraft.get(key);
        const txt = (draft?.text ?? item?.data?.text ?? '').toString();
        if (ta.value !== txt) ta.value = txt;
      }
    }
    NOTE_scheduleReposition();
  }

  /* ───────────────────────────── 🔗 Notes API (for Core) 🔗 ───────────────────────────── */
  function NOTE_apiIsOpen(key){ return STATE.noteOpen.has(key); }

  function NOTE_emitState(msgEl){
    try {
      D.dispatchEvent(new CustomEvent(EV_MANCHOR_NOTE_STATE_V1, { detail: { msgEl } }));
    } catch {}
  }

  function NOTE_apiOpen({ key, msgEl, a, item }){
    if (!key || !(msgEl instanceof HTMLElement) || !a || !item) return;
    STATE.noteOpen.add(key);
    NOTE_ensurePortal({ key, msgEl, a, item });
    NOTE_emitState(msgEl);
  }

  function NOTE_apiClose(key, msgEl){
    if (!key) return;
    STATE.noteOpen.delete(key);
    NOTE_removePortal(key);
    if (msgEl instanceof HTMLElement) NOTE_emitState(msgEl);
  }

  function NOTE_apiToggle({ key, msgEl, a, item, forceOpen }){
    if (!key || !(msgEl instanceof HTMLElement) || !a || !item) return;

    const inNote = (() => {
      try { return !!(D.activeElement && (D.activeElement.closest?.(`[${ATTR_CGXUI}="${UI_MANCHOR_NOTEBOX}"]`))); }
      catch { return false; }
    })();
    if (inNote) return;

    if (forceOpen || !STATE.noteOpen.has(key)) {
      NOTE_apiOpen({ key, msgEl, a, item });
    } else {
      NOTE_apiClose(key, msgEl);
    }
  }

  function NOTE_apiRemove(key){
    if (!key) return;
    STATE.noteOpen.delete(key);
    STATE.notePalOpen.delete(key);
    NOTE_removePortal(key);
  }

  /* ───────────────────────────── 🎯 Wiring (Events + scroll/resize) 🎯 ───────────────────────────── */
  function WIRE_listeners(){
    // Toggle from Core
    const onToggle = (ev) => {
      if (STATE.muting) return;
      const d = ev?.detail || {};
      NOTE_apiToggle({
        key: d.key,
        msgEl: d.msgEl,
        a: d.a,
        item: d.item,
        forceOpen: !!d.forceOpen
      });
    };

    const onClose = (ev) => {
      const d = ev?.detail || {};
      NOTE_apiRemove(d.key);
    };

    D.addEventListener(EV_MANCHOR_NOTE_TOGGLE_V1, onToggle, true);
    D.addEventListener(EV_MANCHOR_NOTE_CLOSE_V1, onClose, true);
    STATE.disposers.push(() => { try { D.removeEventListener(EV_MANCHOR_NOTE_TOGGLE_V1, onToggle, true); } catch {} });
    STATE.disposers.push(() => { try { D.removeEventListener(EV_MANCHOR_NOTE_CLOSE_V1, onClose, true); } catch {} });

    // Reposition on scroll/resize
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        NOTE_scheduleReposition();
      });
    };
    W.addEventListener('scroll', onScroll, { passive: true });
    W.addEventListener('resize', onScroll, { passive: true });
    STATE.disposers.push(() => { try { W.removeEventListener('scroll', onScroll); } catch {} });
    STATE.disposers.push(() => { try { W.removeEventListener('resize', onScroll); } catch {} });

    // Cleanup portals if DOM removes their msgEl (MutationObserver light)
    const mo = new MutationObserver(() => NOTE_scheduleReposition());
    mo.observe(D.documentElement, { childList: true, subtree: true });
    STATE.disposers.push(() => { try { mo.disconnect(); } catch {} });
  }

  function PUBLISH_notesAPI(){
    MOD_OBJ.api.notes = MOD_OBJ.api.notes || {};
    Object.assign(MOD_OBJ.api.notes, {
      v: '1.0.0',
      isOpen: NOTE_apiIsOpen,
      open: NOTE_apiOpen,
      close: NOTE_apiClose,
      toggle: NOTE_apiToggle,
      ensure: NOTE_ensurePortal,
      remove: NOTE_apiRemove,
      reposition: NOTE_scheduleReposition
    });
  }

  function BOOT(){
    if (STATE.booted) return;
    STATE.booted = true;

    PUBLISH_notesAPI();
    UI_ensureNoteStyle();
    WIRE_listeners();

    // If core not ready yet, wait; if it is, still ok.
    const onReady = () => {
      try { NOTE_scheduleReposition(); } catch {}
    };
    D.addEventListener(EV_MANCHOR_READY_V1, onReady, { once: true });
    STATE.disposers.push(() => { try { D.removeEventListener(EV_MANCHOR_READY_V1, onReady); } catch {} });

    // Also immediate attempt (load order safe)
    try { NOTE_scheduleReposition(); } catch {}
  }

  function DISPOSE(){
    try {
      for (const fn of STATE.disposers.splice(0)) { try { fn?.(); } catch {} }

      for (const k of Array.from(STATE.notePortals.keys())) NOTE_apiRemove(k);

      if (STATE.notePosRaf) { cancelAnimationFrame(STATE.notePosRaf); STATE.notePosRaf = 0; }

      D.getElementById(CSS_NOTE_STYLE_ID)?.remove();

      STATE.booted = false;
    } catch (e) { DIAG_err(e); }
  }

  MOD_OBJ.bootNotes = MOD_OBJ.bootNotes || BOOT;
  MOD_OBJ.disposeNotes = MOD_OBJ.disposeNotes || DISPOSE;

  // autostart
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', BOOT, { once: true });
  else BOOT();

})();
