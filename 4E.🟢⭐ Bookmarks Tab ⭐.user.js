// ==UserScript==
// @name         4E.🟢⭐ Bookmarks Tab ⭐
// @namespace    H2O.Prime.CGX.BookmarksTab
// @version      1.2.6
// @description  Dock tab renderer for Bookmarks (UI only). Bottom action bar + icon buttons + stable preview using Engine captureSnapshot(). (cgxui CSS migration)
// @match        https://chatgpt.com/*
// @author       HumamDev
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const TOK = 'BT';
  const PID = 'bmdocktab';
  const CID = 'bookmarks';
  const SkID = 'bmtab';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const DsID = PID;
  const BrID = PID;

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok:TOK, pid:PID, cid:CID, skid:SkID, suite:SUITE, host:HOST };

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const NS_MEM  = `${TOK}:${PID}`;
  const NS_GUARD = `${NS_MEM}:guard`;

  const KEY_GUARD_BOOT  = `${NS_GUARD}:booted`;
  const KEY_GUARD_STYLE = `${NS_GUARD}:style`;
  const KEY_GUARD_REG   = `${NS_GUARD}:registered`;

  const ATTR_CGX_OWNER = 'data-cgxui-owner';
  const ATTR_CGX_UI    = 'data-cgxui';

  const CSS_STYLE_ID = `cgxui-${SkID}-style`;

  const EV_BOOKMARKS_CHANGED_A = 'h2o:bookmarks:changed';
  const EV_BOOKMARKS_CHANGED_B = 'h2o-bookmarks:changed';
  const EV_BOOKMARKS_CHANGED_C = 'ho-bookmarks:changed';

  const CFG = Object.freeze({
    registerMaxRaf: 160,
    renderMaxInitial: 80,
    renderChunk: 60,
    searchDebounceMs: 120,

    // preview capture
    captureAfterJumpDelayMs: 420,
    captureTimeoutMs: 2200,
    captureMinChars: 80,
    snapMaxChars: 12000,
    titleMaxChars: 90,
    use24h: true,
  });

  const STR = Object.freeze({
    tabId: 'bookmarks',
    title: 'Bookmarks',

    emptyHtml:
      `<div class="cgxui-bm-empty" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-empty">No bookmarks yet. Use the ★ button on answers.</div>`,

    engineMissingHtml:
      `<div class="cgxui-bm-empty" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-empty">Bookmarks Engine not loaded. Enable <b>4D.🟢🌟 Bookmarks Engine 🌟</b>.</div>`,

    clearConfirm: 'Clear ALL bookmarks in this chat?',
    exportFail: 'Export failed (clipboard blocked).',

    aAct: 'data-bm-act',
    aId:  'data-bm-id',

    actExport: 'export',
    actExportRaw: 'exportRaw',
    actClear: 'clear',
    actTogglePinnedOnly: 'pinnedOnly',
    actToggleNotesOnly:  'notesOnly',

    actRowJump: 'rowJump',
    actRowRemove: 'rowRemove',
    actRowPin: 'rowPin',
    actRowEditNote: 'rowEditNote',
    actRowEditTags: 'rowEditTags',
    actRowToggleExpand: 'rowExpand',
    actMore: 'more',
    actLoadPreview: 'loadPreview',

    actSaveNote: 'saveNote',
    actSaveTags: 'saveTags',
    actCancelEdit: 'cancelEdit',

    uiSearchPh: 'Search bookmarks…',
    uiSortTurn: 'Turn',
    uiSortNewest: 'Newest',
    uiSortOldest: 'Oldest',
    uiPinnedOnly: 'Pinned',
    uiNotesOnly: 'Notes',
    uiExport: 'Export',
    uiExportRaw: 'Raw',
    uiClear: 'Clear',

    uiNotMountedTitle: 'Preview not available (answer not mounted)',
    uiNotMountedBody: 'Press “Load preview” once (it will jump + cache). Then preview stays available here.',
    uiLoadPreview: 'Load preview',
  });

  VAULT.diag = VAULT.diag || { ver: 'bmdocktab-v2.6', bootCount:0, lastBootAt:0, steps:[], lastError:null, stepsMax:160 };
  function DIAG_safe(name, extra){
    try {
      const d = VAULT.diag;
      d.steps.push({ t: Date.now(), name, extra: extra ?? null });
      if (d.steps.length > d.stepsMax) d.steps.shift();
    } catch {}
  }

  VAULT.state = VAULT.state || {
    booted:false,
    tries:0,

    lastPanelEl:null,
    lastListEl:null,

    q:'',
    sort:'turn',
    pinnedOnly:false,
    notesOnly:false,
    limit:CFG.renderMaxInitial,

    expandedIds: new Set(),   // keep expanded state across rerender
    boundWeak:new WeakSet(),
    tSearch:0,
    _eventsBound:false,
  };
  const S = VAULT.state;

  function API_getEngine(){ return W.H2OBookmarks || null; }

  function safeParseJSON(s, fb){ try { return JSON.parse(s); } catch { return fb; } }

  function escapeHtml(s){
    return String(s ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // ───────────────────────────── DOM Preview (Option 2) ─────────────────────────────

  function DOM_findMountedAnswerRoot(engine, targetId){
    if (!engine || !targetId) return null;
    const msgEl = engine.findMessageEl?.(targetId) || engine.findMessageEl?.(String(targetId||''));
    if (!msgEl) return null;
    return (
      msgEl.querySelector('.markdown') ||
      msgEl.querySelector('.prose') ||
      msgEl.querySelector('[data-testid="markdown"]') ||
      msgEl
    );
  }

  function DOM_buildSanitizedClone(srcEl){
    if (!srcEl) return null;
    const clone = srcEl.cloneNode(true);
    clone.querySelectorAll('button, nav, svg, textarea, input, select').forEach(n => n.remove());
    clone.querySelectorAll('[aria-hidden="true"], .sr-only, .visually-hidden').forEach(n => n.remove());
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    return clone;
  }

  function DOM_scrollToTarget(engine, targetId){
    if (!engine || !targetId) return false;
    const el = engine.findMessageEl?.(targetId) || engine.findMessageEl?.(String(targetId||''));
    if (!el) return false;
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    return true;
  }

  async function copyText(txt){
    try { await navigator.clipboard.writeText(txt); return true; }
    catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        return true;
      } catch { return false; }
    }
  }

  function CSS_escape(s){
    try { if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(s)); } catch {}
    return String(s).replace(/["\\]/g,'\\$&');
  }

  function cleanText(s){
    return String(s || '')
      .replace(/\r/g,'')
      .replace(/[ \t]+\n/g,'\n')
      .replace(/\n{3,}/g,'\n\n')
      .trim();
  }

  function firstLineTitle(text){
    const t = cleanText(text);
    if (!t) return '';
    const line = (t.split('\n').find(x => x.trim()) || '').trim();
    if (!line) return '';
    return line.length > CFG.titleMaxChars ? (line.slice(0, CFG.titleMaxChars - 1) + '…') : line;
  }

  function titleFromSnippet(snippet){
    const s = cleanText(snippet || '');
    if (!s) return '';
    const m = s.match(/^(.{1,140}?)([.!?]\s|$)/);
    const base = (m && m[1]) ? m[1].trim() : (s.split('\n')[0] || '').trim();
    return base.length > CFG.titleMaxChars ? (base.slice(0, CFG.titleMaxChars - 1) + '…') : base;
  }

  function getTargetId(bm){
    return String((bm && (bm.primaryAId || bm.msgId)) || '');
  }

  function formatTs(ms){
    if (!ms) return '';
    try {
      const d = new Date(ms);
      const now = new Date();
      const sameYear = d.getFullYear() === now.getFullYear();

      const month = d.toLocaleString(undefined, { month:'short' });
      const day = String(d.getDate()).padStart(2,'0');
      const year = d.getFullYear();

      const hh = String(CFG.use24h ? d.getHours() : ((d.getHours() % 12) || 12)).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');

      const ampm = CFG.use24h ? '' : (d.getHours() >= 12 ? ' PM' : ' AM');
      const left = `${month} ${day}${sameYear ? '' : ` ${year}`}`;
      return `${left} · ${hh}:${mm}${ampm}`;
    } catch {
      try { return new Date(ms).toLocaleString(); } catch { return ''; }
    }
  }

  function metaKey(chatId){
    const id = String(chatId || 'unknown');
    return `${NS_DISK}:ui:bookmark_meta_${id}:v2`;
  }

  function loadMeta(chatId){
    const k = metaKey(chatId);
    const fb = { v:2, byId:{} };
    try {
      const raw = localStorage.getItem(k);
      const obj = safeParseJSON(raw || '', fb);
      if (!obj || typeof obj !== 'object') return fb;
      if (!obj.byId || typeof obj.byId !== 'object') obj.byId = {};
      return obj;
    } catch { return fb; }
  }

  function saveMeta(chatId, obj){
    const k = metaKey(chatId);
    try { localStorage.setItem(k, JSON.stringify(obj)); } catch {}
  }

  function metaGet(store, msgId){
    const id = String(msgId || '');
    const m = store.byId[id];
    if (!m || typeof m !== 'object') return { pin:false, note:'', tags:[], title:'', snapText:'' };
    return {
      pin: !!m.pin,
      note: String(m.note || ''),
      tags: Array.isArray(m.tags) ? m.tags.map(x => String(x||'').trim()).filter(Boolean) : [],
      title: String(m.title || ''),
      snapText: String(m.snapText || ''),
    };
  }

  function metaSet(store, msgId, patch){
    const id = String(msgId || '');
    if (!id) return;
    const cur = metaGet(store, id);
    store.byId[id] = {
      pin: (patch.pin != null) ? !!patch.pin : cur.pin,
      note: (patch.note != null) ? String(patch.note) : cur.note,
      tags: (patch.tags != null) ? patch.tags : cur.tags,
      title: (patch.title != null) ? String(patch.title) : cur.title,
      snapText: (patch.snapText != null) ? String(patch.snapText) : cur.snapText,
    };
  }

  function deriveTitle(bm, meta, engine){
    const mt = String(meta?.title || '').trim();
    if (mt) return mt;

    const bt = String(bm?.title || '').trim();
    if (bt) return bt;

    // prefer Engine snapshot/title if exists
    const tid = getTargetId(bm);
    const eng = engine?.getSnapshot?.(String(bm?.msgId || '')) || (tid ? engine?.getSnapshot?.(tid) : null);
    const engTitle = String(eng?.title || '').trim();
    if (engTitle) return engTitle;

    const engineSnap = String(bm?.snapText || '').trim();
    if (engineSnap) {
      const t = firstLineTitle(engineSnap);
      if (t) return t;
    }

    const metaSnap = String(meta?.snapText || '').trim();
    if (metaSnap) {
      const t = firstLineTitle(metaSnap);
      if (t) return t;
    }

    const st = titleFromSnippet(bm?.snippet || '');
    if (st) return st;

    return 'Bookmark';
  }

  function ensureStyle(){
    if (document.getElementById(CSS_STYLE_ID)) return;
    if (W[KEY_GUARD_STYLE]) return;
    W[KEY_GUARD_STYLE] = 1;

    const st = document.createElement('style');
    st.id = CSS_STYLE_ID;
    st.setAttribute(ATTR_CGX_OWNER, SkID);
    st.setAttribute(ATTR_CGX_UI, `${SkID}-style`);

    st.textContent = `
.cgxui-bm-root{ display:flex; flex-direction:column; gap:10px; }

.cgxui-bm-toolbar{
  display:flex;
  flex-direction:column;
  gap:6px;
  padding:10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(255,255,255,.03);
}
.cgxui-bm-row{ display:flex; flex-wrap:wrap; gap:6px; align-items:center; }

.cgxui-bm-search{
  width:100%;
  padding:7px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(0,0,0,.16);
  color:inherit;
  outline:none;
  font-size:12.5px;
}
.cgxui-bm-select{
  padding:5px 9px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(0,0,0,.16);
  color:inherit;
  outline:none;
  font-size:11.5px;
  height:28px;
}
.cgxui-bm-btn{
  padding:5px 9px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  color:inherit;
  cursor:pointer;
  font-size:11.5px;
  line-height:1;
  height:28px;
}
.cgxui-bm-btn:hover{ background:rgba(255,255,255,.10); }
.cgxui-bm-btn.is-on{ border-color:rgba(255,255,255,.24); background:rgba(255,255,255,.10); }

.cgxui-bm-list{ display:flex; flex-direction:column; gap:10px; }

.cgxui-bm-card{
  border-radius:16px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(255,255,255,.03);
  overflow:hidden;
}

/* Header: dot + main (no actions here) */
.cgxui-bm-card-head{
  display:grid;
  grid-template-columns: 12px 1fr;
  gap:10px;
  align-items:start;
  padding:10px 12px 8px;
  cursor:pointer;
}
.cgxui-bm-dot{
  width:10px; height:10px; border-radius:999px;
  margin-top:4px;
  background: var(--bm-dot, #fbbf24);
  box-shadow: 0 0 0 2px rgba(0,0,0,.15);
}
.cgxui-bm-main{ min-width:0; }

.cgxui-bm-title{
  font-size:13px;
  line-height:1.25;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
}

.cgxui-bm-sub{
  margin-top:6px;
  opacity:.82;
  font-size:11.5px;
  display:flex;
  gap:6px;
  flex-wrap:wrap;
}
.cgxui-bm-chip{
  padding:2px 8px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(0,0,0,.12);
  white-space:nowrap;
}

/* Bottom action bar (requested) */
.cgxui-bm-card-foot{
  display:flex;
  gap:6px;
  padding:8px 10px 10px;
  justify-content:flex-end;
}
.cgxui-bm-ico{
  width:28px; height:28px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:10px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(0,0,0,.12);
  cursor:pointer;
  user-select:none;
  font-size:13px;
  line-height:1;
}
.cgxui-bm-ico:hover{ background:rgba(255,255,255,.10); }

.cgxui-bm-card-body{ padding:0 12px 12px; display:none; }
.cgxui-bm-card[data-expanded="1"] .cgxui-bm-card-body{ display:block; }

.cgxui-bm-sheet{
  padding:10px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(0,0,0,.12);
}

.cgxui-bm-empty{
  padding:12px 10px;
  border-radius:14px;
  border:1px dashed rgba(255,255,255,.14);
  background:rgba(255,255,255,.04);
  opacity:.92;
}

.cgxui-bm-previewtext{
  white-space:pre-wrap;
  line-height:1.35;
  font-size:12.8px;
  max-height: 320px;
  overflow:auto;
  padding-right: 6px;
}

.cgxui-bm-edit{ margin-top:10px; display:flex; flex-direction:column; gap:6px; }
.cgxui-bm-input{
  width:100%;
  padding:7px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(0,0,0,.16);
  color:inherit;
  outline:none;
  font-size:12.5px;
}
.cgxui-bm-textarea{
  width:100%;
  min-height:78px;
  padding:7px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.10);
  background:rgba(0,0,0,.16);
  color:inherit;
  outline:none;
  resize:vertical;
  font-size:12.5px;
}
`;
    document.head.appendChild(st);
  }

  function toolbarHtml(){
    const pinnedOn = S.pinnedOnly ? 'is-on' : '';
    const notesOn  = S.notesOnly  ? 'is-on' : '';
    const sort = String(S.sort || 'turn');

    return `
<div class="cgxui-bm-toolbar" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-toolbar">
  <input class="cgxui-bm-search" type="text" value="${escapeHtml(S.q)}" placeholder="${escapeHtml(STR.uiSearchPh)}"
    ${STR.aAct}="search" />
  <div class="cgxui-bm-row" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-row">
    <select class="cgxui-bm-select" ${STR.aAct}="sort">
      <option value="turn" ${sort === 'turn' ? 'selected' : ''}>Sort: ${escapeHtml(STR.uiSortTurn)}</option>
      <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Sort: ${escapeHtml(STR.uiSortNewest)}</option>
      <option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Sort: ${escapeHtml(STR.uiSortOldest)}</option>
    </select>

    <button class="cgxui-bm-btn ${pinnedOn}" ${STR.aAct}="${STR.actTogglePinnedOnly}">${escapeHtml(STR.uiPinnedOnly)}</button>
    <button class="cgxui-bm-btn ${notesOn}" ${STR.aAct}="${STR.actToggleNotesOnly}">${escapeHtml(STR.uiNotesOnly)}</button>

    <button class="cgxui-bm-btn" ${STR.aAct}="${STR.actExport}">${escapeHtml(STR.uiExport)}</button>
    <button class="cgxui-bm-btn" ${STR.aAct}="${STR.actExportRaw}">${escapeHtml(STR.uiExportRaw)}</button>
    <button class="cgxui-bm-btn" ${STR.aAct}="${STR.actClear}">${escapeHtml(STR.uiClear)}</button>
  </div>
</div>`;
  }

  function iconFor(act, pinOn, expanded){
    if (act === STR.actRowToggleExpand) return expanded ? '▴' : '▾';
    if (act === STR.actRowJump) return '↪';
    if (act === STR.actRowPin) return pinOn ? '●' : '○';
    if (act === STR.actRowEditNote) return '✎';
    if (act === STR.actRowEditTags) return '#';
    if (act === STR.actRowRemove) return '⌫';
    return '•';
  }

  function cardHtml(bm, meta, engine){
    const id = String(bm?.msgId || '');
    const targetId = getTargetId(bm);
    const ts = formatTs(bm?.createdAt || 0);

    const pin = !!meta.pin;
    const note = String(meta.note || '').trim();
    const tags = Array.isArray(meta.tags) ? meta.tags : [];

    const dot = pin ? '#60a5fa' : '#fbbf24';
    const title = deriveTitle(bm, meta, engine);

    const chips = [];
    if (ts) chips.push(`<span class="cgxui-bm-chip">${escapeHtml(ts)}</span>`);
    const tno = (bm && typeof bm.turnNo === 'number' && bm.turnNo > 0) ? bm.turnNo : null;
    if (tno) chips.push(`<span class="cgxui-bm-chip">${escapeHtml('Turn ' + tno)}</span>`);
    if (note) chips.push(`<span class="cgxui-bm-chip">note</span>`);
    for (const tg of tags.slice(0, 6)) chips.push(`<span class="cgxui-bm-chip">${escapeHtml(tg)}</span>`);

    const expanded = S.expandedIds.has(id);

    return `
<div class="cgxui-bm-card" data-bm-card="1" data-expanded="${expanded ? '1' : '0'}"
  ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-card"
  ${STR.aId}="${escapeHtml(id)}" data-target-id="${escapeHtml(targetId)}">

  <div class="cgxui-bm-card-head"
    ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-head"
    ${STR.aAct}="${STR.actRowJump}" ${STR.aId}="${escapeHtml(id)}" data-target-id="${escapeHtml(targetId)}">

    <span class="cgxui-bm-dot" style="--bm-dot:${dot}"></span>

    <div class="cgxui-bm-main">
      <div class="cgxui-bm-title"><b>${escapeHtml(title)}</b></div>
      <div class="cgxui-bm-sub">${chips.join('')}</div>
    </div>
  </div>

  <div class="cgxui-bm-card-foot" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-foot">
    <button class="cgxui-bm-ico" title="Expand" ${STR.aAct}="${STR.actRowToggleExpand}" ${STR.aId}="${escapeHtml(id)}">${iconFor(STR.actRowToggleExpand, pin, expanded)}</button>
    <button class="cgxui-bm-ico" title="Jump" ${STR.aAct}="${STR.actRowJump}" ${STR.aId}="${escapeHtml(id)}">↪</button>
    <button class="cgxui-bm-ico" title="Pin" ${STR.aAct}="${STR.actRowPin}" ${STR.aId}="${escapeHtml(id)}">${iconFor(STR.actRowPin, pin, expanded)}</button>
    <button class="cgxui-bm-ico" title="Note" ${STR.aAct}="${STR.actRowEditNote}" ${STR.aId}="${escapeHtml(id)}">✎</button>
    <button class="cgxui-bm-ico" title="Tags" ${STR.aAct}="${STR.actRowEditTags}" ${STR.aId}="${escapeHtml(id)}">#</button>
    <button class="cgxui-bm-ico" title="Remove" ${STR.aAct}="${STR.actRowRemove}" ${STR.aId}="${escapeHtml(id)}">⌫</button>
  </div>

  <div class="cgxui-bm-card-body" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-body">
    <div class="cgxui-bm-sheet" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-sheet">
      <div class="cgxui-bm-preview" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-preview" data-preview="1"></div>
      <div class="cgxui-bm-edit" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-edit" data-edit="0" style="display:none"></div>
    </div>
  </div>
</div>`;
  }

  function filterSort(items, metaStore){
    let arr = Array.isArray(items) ? items.slice() : [];

    arr = arr.map(bm => {
      const id = String(bm?.msgId || '');
      const meta = metaGet(metaStore, id);
      return { bm, id, meta };
    });

    const q = String(S.q || '').trim().toLowerCase();
    if (q) {
      arr = arr.filter(x => {
        const title = String(titleFromSnippet(x.bm?.snippet || '')).toLowerCase();
        const sn = String(x.bm?.snippet || '').toLowerCase();
        const note = String(x.meta.note || '').toLowerCase();
        const tags = (x.meta.tags || []).join(' ').toLowerCase();
        const snap = String(x.bm?.snapText || x.meta.snapText || '').toLowerCase();
        return title.includes(q) || sn.includes(q) || note.includes(q) || tags.includes(q) || snap.includes(q);
      });
    }

    if (S.pinnedOnly) arr = arr.filter(x => !!x.meta.pin);
    if (S.notesOnly)  arr = arr.filter(x => String(x.meta.note || '').trim().length > 0);

    const sort = String(S.sort || 'turn');
    if (sort === 'newest') {
      arr.sort((a,b)=> (b.bm?.createdAt||0) - (a.bm?.createdAt||0));
    } else if (sort === 'oldest') {
      arr.sort((a,b)=> (a.bm?.createdAt||0) - (b.bm?.createdAt||0));
    } else {
      arr.sort((a,b)=>{
        if (!!a.meta.pin !== !!b.meta.pin) return a.meta.pin ? -1 : 1;
        const at = (a.bm && a.bm.turnNo != null && a.bm.turnNo > 0) ? a.bm.turnNo : 1e9;
        const bt = (b.bm && b.bm.turnNo != null && b.bm.turnNo > 0) ? b.bm.turnNo : 1e9;
        if (at !== bt) return at - bt;
        return (a.bm?.createdAt||0) - (b.bm?.createdAt||0);
      });
    }

    return arr;
  }

  function render(ctx){
    const panelEl = ctx?.panelEl || null;
    const listEl  = ctx?.listEl  || null;
    if (!listEl) return;

    ensureStyle();

    S.lastPanelEl = panelEl;
    S.lastListEl  = listEl;

    const engine = API_getEngine();
    if (!engine) {
      listEl.innerHTML = STR.engineMissingHtml;
      if (panelEl) panelEl.dataset.view = STR.tabId;
      return;
    }

    const chatId = engine.chatId?.() || '';
    const metaStore = loadMeta(chatId);

    const items = engine.list?.() || [];
    const rows = filterSort(items, metaStore);

    const limited = rows.slice(0, Math.max(0, S.limit));
    const hasMore = rows.length > limited.length;

    const cardsHtml = limited.length
      ? limited.map(x => cardHtml(x.bm, x.meta, engine)).join('')
      : STR.emptyHtml;

    const loadMoreHtml = hasMore
      ? `<button class="cgxui-bm-btn" ${STR.aAct}="${STR.actMore}">Load more</button>`
      : '';

    listEl.innerHTML = `
<div class="cgxui-bm-root" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-root">
  ${toolbarHtml()}
  <div class="cgxui-bm-list" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-list">${cardsHtml}</div>
  ${loadMoreHtml}
</div>
`;

    // rebuild previews for expanded cards (so preview remains visible after rerender)
    for (const id of Array.from(S.expandedIds)) {
      const card = listEl.querySelector(`[data-bm-card="1"][${STR.aId}="${CSS_escape(id)}"]`);
      if (card) buildPreview(engine, chatId, metaStore, id, card);
    }

    if (!S.boundWeak.has(listEl)) {
      S.boundWeak.add(listEl);
      listEl.addEventListener('click', (e) => onClick(e), true);
      listEl.addEventListener('input', (e) => onInput(e), true);
      listEl.addEventListener('change', (e) => onChange(e), true);
    }

    if (panelEl) panelEl.dataset.view = STR.tabId;
  }

  function rerender(reason){
    const listEl = S.lastListEl;
    if (!listEl || !document.contains(listEl)) return;
    render({ panelEl: S.lastPanelEl, listEl });
    DIAG_safe('rerender', { reason: String(reason || '') });
  }

  async function buildPreview(engine, chatId, metaStore, id, card){
    const previewHost = card.querySelector('[data-preview="1"]');
    if (!previewHost) return;

    const bmId = String(id || '');
    const meta = metaGet(metaStore, bmId);

    previewHost.textContent = '';

    const engSnapObj = engine.getSnapshot?.(bmId) || null;
    const engSnap = String(engSnapObj?.snapText || '').trim();

    if (engSnap) {
      previewHost.innerHTML = `<div class="cgxui-bm-previewtext">${escapeHtml(engSnap)}</div>`;
      previewHost.setAttribute('data-built','1');
      return;
    }

    const snap = String(meta.snapText || '').trim();
    if (snap) {
      previewHost.innerHTML = `<div class="cgxui-bm-previewtext">${escapeHtml(snap)}</div>`;
      previewHost.setAttribute('data-built','1');
      return;
    }


    // If no cached snapshot, but the answer is currently mounted, render a sanitized clone immediately
    // and ask Engine to cache a mounted-only snapshot (no scroll) for future unmounts.
    if (!snap && tid){
      const src = DOM_findMountedAnswerRoot(engine, tid);
      if (src){
        const clone = DOM_buildSanitizedClone(src);
        if (clone) previewHost.appendChild(clone);
        previewHost.setAttribute('data-preview-built', '1');

        try{
          engine?.captureSnapshot?.(tid, { noScroll:true, timeoutMs: 600, minChars: CFG.captureMinChars });
        } catch {}
        return;
      }
    }
previewHost.innerHTML = `
<div class="cgxui-bm-empty" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-notmounted">
  <b>${escapeHtml(STR.uiNotMountedTitle)}</b><br/>
  <span>${escapeHtml(STR.uiNotMountedBody)}</span><br/><br/>
  <button class="cgxui-bm-btn" ${STR.aAct}="${STR.actLoadPreview}" ${STR.aId}="${escapeHtml(bmId)}">${escapeHtml(STR.uiLoadPreview)}</button>
</div>`;
    previewHost.setAttribute('data-built','1');
  }

  function toggleExpand(engine, chatId, metaStore, id){
    const listEl = S.lastListEl;
    if (!listEl) return;

    const card = listEl.querySelector(`[data-bm-card="1"][${STR.aId}="${CSS_escape(id)}"]`);
    if (!card) return;

    const expanded = card.getAttribute('data-expanded') === '1';
    const next = !expanded;

    card.setAttribute('data-expanded', next ? '1' : '0');

    if (next) S.expandedIds.add(id);
    else S.expandedIds.delete(id);

    if (!next) return;

    buildPreview(engine, chatId, metaStore, id, card);
  }

  function onInput(e){
    const t = e.target;
    const act = t?.getAttribute?.(STR.aAct) || '';
    if (act !== 'search') return;

    if (S.tSearch) clearTimeout(S.tSearch);
    S.tSearch = setTimeout(()=>{
      S.q = String(t.value || '');
      S.limit = CFG.renderMaxInitial;
      rerender('search');
    }, CFG.searchDebounceMs);
  }

  function onChange(e){
    const t = e.target;
    const act = t?.getAttribute?.(STR.aAct) || '';
    if (act !== 'sort') return;

    S.sort = String(t.value || 'turn');
    S.limit = CFG.renderMaxInitial;
    rerender('sort');
  }

  async function onClick(e){
    const engine = API_getEngine();
    if (!engine) return;

    const chatId = engine.chatId?.() || '';
    const metaStore = loadMeta(chatId);

    const t = e.target;
    const btn = t && t.closest?.(`[${STR.aAct}]`);
    if (!btn) return;

    const act = btn.getAttribute(STR.aAct) || '';
    const id  = btn.getAttribute(STR.aId) || '';

    if (act === STR.actClear) {
      e.preventDefault();
      if (!confirm(STR.clearConfirm)) return;
      engine.clear?.();
      return;
    }

    if (act === STR.actExport) {
      e.preventDefault();
      const payload = {
        v: 1,
        chatId: engine.chatId?.() || '',
        storeKey: engine.key?.() || '',
        bookmarks: engine.list?.() || [],
        meta: metaStore,
      };
      const ok = await copyText(JSON.stringify(payload, null, 2));
      if (!ok) alert(STR.exportFail);
      return;
    }

    if (act === STR.actExportRaw) {
      e.preventDefault();
      const ok = await copyText(JSON.stringify(engine.list?.() || [], null, 2));
      if (!ok) alert(STR.exportFail);
      return;
    }

    if (act === STR.actTogglePinnedOnly) {
      e.preventDefault();
      S.pinnedOnly = !S.pinnedOnly;
      S.limit = CFG.renderMaxInitial;
      rerender('pinnedOnly');
      return;
    }

    if (act === STR.actToggleNotesOnly) {
      e.preventDefault();
      S.notesOnly = !S.notesOnly;
      S.limit = CFG.renderMaxInitial;
      rerender('notesOnly');
      return;
    }

    if (act === STR.actMore) {
      e.preventDefault();
      S.limit = Math.max(0, S.limit) + CFG.renderChunk;
      rerender('more');
      return;
    }

    if (!id) return;

    if (act === STR.actRowRemove) {
      e.preventDefault();
      if (engine.has?.(id)) engine.toggle?.({ msgId: id });
      return;
    }

    if (act === STR.actRowPin) {
      e.preventDefault();
      const cur = metaGet(metaStore, id);
      metaSet(metaStore, id, { pin: !cur.pin });
      saveMeta(chatId, metaStore);
      rerender('pin');
      return;
    }

    if (act === STR.actRowToggleExpand) {
      e.preventDefault();
      toggleExpand(engine, chatId, metaStore, id);
      return;
    }

    if (act === STR.actRowEditNote) {
      e.preventDefault();
      openEditor(chatId, metaStore, id, 'note');
      return;
    }

    if (act === STR.actRowEditTags) {
      e.preventDefault();
      openEditor(chatId, metaStore, id, 'tags');
      return;
    }

    if (act === STR.actLoadPreview) {
      e.preventDefault();

      const card = S.lastListEl?.querySelector(`[data-bm-card="1"][${STR.aId}="${CSS_escape(id)}"]`);
      const targetId = card?.getAttribute('data-target-id') || id;

      // Ensure card is expanded so user sees the result
      S.expandedIds.add(id);
      if (card) card.setAttribute('data-expanded', '1');

      // Jump close so it mounts (Idle-Unmount compatible)
      DOM_scrollToTarget(engine, targetId);

      // Capture snapshot after jump (best-effort)
      await new Promise(r => setTimeout(r, CFG.captureAfterJumpDelayMs));
      const res = await engine.captureSnapshot?.(targetId, { timeoutMs: CFG.captureTimeoutMs, minChars: CFG.captureMinChars });

      if (res?.ok && res.snapText) {
        metaSet(metaStore, id, {
          snapText: String(res.snapText).slice(0, CFG.snapMaxChars),
          title: String(res.title || ''),
        });
        saveMeta(chatId, metaStore);
      }

      rerender('loadPreview');
      return;
    }

    if (act === STR.actRowJump) {
      // Auto-expand preview on click (Option 2)
      e.preventDefault();

      const card = btn.closest?.('[data-bm-card="1"]') || S.lastListEl?.querySelector(`[data-bm-card="1"][${STR.aId}="${CSS_escape(id)}"]`);
      if (!card) return;

      const targetId = card.getAttribute('data-target-id') || id;

      // Expand + build preview immediately
      S.expandedIds.add(id);
      card.setAttribute('data-expanded','1');
      buildPreview(engine, chatId, metaStore, id, card);

      // Jump close so it mounts
      DOM_scrollToTarget(engine, targetId);

      const snapNow =
        String(engine.getSnapshot?.(id)?.snapText || '') ||
        String(metaGet(metaStore, id)?.snapText || '');

      // Capture snapshot after jump if missing
      if (!String(snapNow).trim()){
        await new Promise(r => setTimeout(r, CFG.captureAfterJumpDelayMs));
        const res = await engine.captureSnapshot?.(targetId, { timeoutMs: CFG.captureTimeoutMs, minChars: CFG.captureMinChars });
        if (res?.ok && res.snapText){
          metaSet(metaStore, id, {
            snapText: String(res.snapText).slice(0, CFG.snapMaxChars),
            title: String(res.title || ''),
          });
          saveMeta(chatId, metaStore);
        }
      }

      rerender('rowJump');
      return;
    }
  }

  function openEditor(chatId, metaStore, id, mode){
    const listEl = S.lastListEl;
    if (!listEl) return;

    const card = listEl.querySelector(`[data-bm-card="1"][${STR.aId}="${CSS_escape(id)}"]`);
    if (!card) return;

    S.expandedIds.add(id);
    card.setAttribute('data-expanded','1');

    const editHost = card.querySelector('[data-edit]');
    if (!editHost) return;

    const meta = metaGet(metaStore, id);
    editHost.style.display = '';
    editHost.setAttribute('data-edit','1');

    if (mode === 'note') {
      editHost.innerHTML = `
<textarea class="cgxui-bm-textarea" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-note" data-note="1">${escapeHtml(meta.note)}</textarea>
<div class="cgxui-bm-row" style="margin-top:8px;">
  <button class="cgxui-bm-btn" ${STR.aAct}="${STR.actSaveNote}" ${STR.aId}="${escapeHtml(id)}">Save</button>
  <button class="cgxui-bm-btn" ${STR.aAct}="${STR.actCancelEdit}" ${STR.aId}="${escapeHtml(id)}">Cancel</button>
</div>`;
    } else {
      editHost.innerHTML = `
<input class="cgxui-bm-input" ${ATTR_CGX_OWNER}="${SkID}" ${ATTR_CGX_UI}="${SkID}-tags" data-tags="1"
  value="${escapeHtml((meta.tags || []).join(', '))}" placeholder="tag1, tag2, tag3" />
<div class="cgxui-bm-row" style="margin-top:8px;">
  <button class="cgxui-bm-btn" ${STR.aAct}="${STR.actSaveTags}" ${STR.aId}="${escapeHtml(id)}">Save</button>
  <button class="cgxui-bm-btn" ${STR.aAct}="${STR.actCancelEdit}" ${STR.aId}="${escapeHtml(id)}">Cancel</button>
</div>`;
    }

    listEl.addEventListener('click', (ev)=>{
      const b = ev.target?.closest?.(`[${STR.aAct}]`);
      if (!b) return;
      const a = b.getAttribute(STR.aAct);
      const bid = b.getAttribute(STR.aId);
      if (bid !== id) return;

      if (a === STR.actSaveNote) {
        ev.preventDefault();
        const ta = card.querySelector('textarea[data-note="1"]');
        const note = String(ta?.value || '').trim();
        metaSet(metaStore, id, { note });
        saveMeta(chatId, metaStore);
        rerender('saveNote');
      }

      if (a === STR.actSaveTags) {
        ev.preventDefault();
        const inp = card.querySelector('input[data-tags="1"]');
        const raw = String(inp?.value || '');
        const tags = raw.split(',').map(x => x.trim()).filter(Boolean).slice(0, 12);
        metaSet(metaStore, id, { tags });
        saveMeta(chatId, metaStore);
        rerender('saveTags');
      }

      if (a === STR.actCancelEdit) {
        ev.preventDefault();
        rerender('cancelEdit');
      }
    }, { capture:true, once:true });

    // ensure preview exists if expanded
    const engine = API_getEngine();
    if (engine) buildPreview(engine, chatId, metaStore, id, card);
  }

  function register(){
    const Dock = H2O.Dock || H2O.PanelSide || null;
    if (!Dock?.registerTab) return false;

    if (Dock.tabs?.[STR.tabId]?.h2oBookmarksTab) return true;

    Dock.registerTab(STR.tabId, {
      title: STR.title,
      h2oBookmarksTab: true,
      render: (ctx) => render(ctx || {}),
    });

    return true;
  }

  function bindExternalEventsOnce(){
    if (S._eventsBound) return;
    S._eventsBound = true;
    const rer = () => rerender('bookmarksChanged');
    W.addEventListener(EV_BOOKMARKS_CHANGED_A, rer);
    W.addEventListener(EV_BOOKMARKS_CHANGED_B, rer);
    W.addEventListener(EV_BOOKMARKS_CHANGED_C, rer);
  }

  function boot(){
    try {
      VAULT.diag.bootCount++;
      VAULT.diag.lastBootAt = Date.now();

      if (S.booted) return;
      S.booted = true;

      if (W[KEY_GUARD_BOOT]) return;
      W[KEY_GUARD_BOOT] = 1;

      bindExternalEventsOnce();

      S.tries = 0;
      (function loop(){
        if (register()) {
          W[KEY_GUARD_REG] = 1;
          DIAG_safe('register:ok', null);
          return;
        }
        if (++S.tries > CFG.registerMaxRaf) {
          DIAG_safe('register:timeout', { tries:S.tries });
          return;
        }
        requestAnimationFrame(loop);
      })();

      DIAG_safe('boot:done', { ok:true });
    } catch (err) {
      VAULT.diag.lastError = String(err?.stack || err);
      DIAG_safe('boot:crash', VAULT.diag.lastError);
      throw err;
    }
  }

  function dispose(){
    try {
      try { document.getElementById(CSS_STYLE_ID)?.remove(); } catch {}
      S.boundWeak = new WeakSet();
      S.lastPanelEl = null;
      S.lastListEl = null;
      DIAG_safe('dispose:done', null);
    } catch (e) {
      DIAG_safe('dispose:err', String(e?.stack || e));
    }
  }

  VAULT.api = VAULT.api || {};
  VAULT.api.boot = boot;
  VAULT.api.dispose = dispose;
  VAULT.api.render = render;

  boot();
})();
