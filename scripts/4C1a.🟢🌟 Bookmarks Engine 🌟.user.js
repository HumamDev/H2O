// ==UserScript==
// @h2o-id      4d.bookmarks.engine
// @name         4D.🟢🌟 Bookmarks Engine 🌟
// @namespace    H2O.Prime.CGX.BookmarksEngine
// @version      2.2.4
// @description  Bookmark button under each assistant answer + per-chat localStorage. Core-aware IDs/turns + robust hydration. Snapshot capture + getAll/setAll + captureSnapshot API. Always emits DOM events + Core topic. (cgxui CSS migration)
// @match        https://chatgpt.com/*
// @author       HumamDev
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * Fixes in 2.2.2
   * - Always emit DOM events (Tab listens to DOM events even when Core bus exists)
   * - Snapshot capture resolves correct store id (msgId vs primaryAId)
   * - Changed event detail contract: {chatId, storeKey, reason, ts, count, changedId}
   * ========================================================================== */

  const TOK = 'BE';
  const PID = 'bkmrksngne';
  const CID = 'bookmarkse';
  const SkID = 'bkng';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const DsID = PID;
  const BrID = PID;

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, suite: SUITE, host: HOST };

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const NS_MEM  = `${TOK}:${PID}`;
  const NS_GUARD = `${NS_MEM}:guard`;

  const KEY_BOOKMARKS_GUARD_BOOT     = `${NS_GUARD}:booted`;
  const KEY_BOOKMARKS_GUARD_STYLE    = `${NS_GUARD}:style`;
  const KEY_BOOKMARKS_GUARD_NAV_HOOK = `${NS_GUARD}:navHook`;
  const KEY_BOOKMARKS_MIG_V1         = `${NS_DISK}:migrate:bookmarks:v1`;

  const EV_BOOKMARKS_CHANGED_CANON    = 'bookmarks:changed';
  const EV_BOOKMARKS_CHANGED_H2O      = 'h2o:bookmarks:changed';
  const EV_BOOKMARKS_CHANGED_H2O_DASH = 'h2o-bookmarks:changed';
  const EV_BOOKMARKS_CHANGED_HO_LEG   = 'ho-bookmarks:changed';

  const EV_INLINE_CHANGED_H2O         = 'h2o:inline:changed';
  const EV_INLINE_CHANGED_HO_LEG      = 'ho-inline:changed';

  const EV_CORE_INDEX_UPDATED         = 'h2o:index:updated';
  const EV_CORE_TURN_UPDATED          = 'h2o:turn:updated';

  const EV_MSG_REMOUNTED              = 'h2o:message:remounted';
  const EV_MSG_REMOUNTED_EVT          = 'evt:h2o:message:remounted';
  const EV_MSG_REMOUNTED_HO_LEG       = 'ho:message-remounted';

  const EV_NAVIGATION_H2O             = 'h2o:navigation';

  const ATTR_BOOKMARKS_BTN            = 'data-h2o-bookmarkbtn';
  const ATTR_CGX_OWNER                = 'data-cgxui-owner';
  const ATTR_CGX_UI                   = 'data-cgxui';

  const SEL_ = Object.freeze({
    msgAny:   '[data-message-author-role="assistant"], [data-message-author-role="user"]',
    msgA:     '[data-message-author-role="assistant"]',
    mdAny:    '.markdown, .prose, [data-testid="markdown"]',
    copyBtn:  'button[data-testid="copy-turn-action-button"]',
    goodBtn:  'button[data-testid="good-response-turn-action-button"]',
    badBtn:   'button[data-testid="bad-response-turn-action-button"]',
    moreBtn:  'button[aria-label="More actions"]',
    turnsRoot:'[data-testid="conversation-turns"]',
    rootMain: 'main',
  });

  const CSS_STYLE_ID     = `cgxui-${SkID}-style`;
  const CSS_BTN_CLASS    = `cgxui-${SkID}-bm-btn`;

  const CFG = Object.freeze({
    snippetMax: 260,
    snapMax: 12000,
    titleMax: 90,
    waitBootSubtree: true,
    captureTimeoutMs: 9000,
    captureMinChars: 20,
  });

  const STR = Object.freeze({
    chatUnknown: 'unknown',
    roleA: 'assistant',
    ariaLabel: 'Bookmark this answer',
    starOn: '★',
    starOff:'☆',
    warnFallback:'[H2O Bookmarks] Could not resolve messageId; using fallback:',
  });

  VAULT.diag = VAULT.diag || { ver:'bookmarks-v2.2.2', bootCount:0, lastBootAt:0, steps:[], lastError:null, stepsMax:140 };
  function DIAG_safe(name, extra){
    try {
      const d = VAULT.diag;
      d.steps.push({ t: Date.now(), name, extra: extra ?? null });
      if (d.steps.length > d.stepsMax) d.steps.shift();
    } catch {}
  }

  VAULT.state = VAULT.state || {
    booted:false,
    chatId:'',
    storeKey:'',
    refreshPending:false,
    mo:null,
    waitMO:null,
    onNav:null, onPop:null,
    onChangedH2O:null, onChangedHO:null,
    onInlineH2O:null, onInlineHO:null,
    onCoreIndex:null, onCoreTurn:null,
    onRemounted:null,
    origPush:null, origReplace:null,
  };
  const S = VAULT.state;

  function safeParseJSON(s, fb){
    const v = W.H2O?.util?.safeParse?.(s, fb);
    if (v !== undefined) return v;
    try { return JSON.parse(s); } catch { return fb; }
  }

  function getChatId(){
    const v = W.H2O?.util?.getChatId?.();
    if (v) return String(v);
    const m = String(location.pathname || '').match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : STR.chatUnknown;
  }

  function storeKey(chatId){
    const id = String(chatId || STR.chatUnknown);
    const newKey = `${NS_DISK}:state:bookmarks_${id}:v1`;
    const oldKey = `H2O:bookmarks:v1:${id}`;

    try {
      const vNew = localStorage.getItem(newKey);
      if (vNew == null || vNew === '') {
        const vOld = localStorage.getItem(oldKey);
        if (vOld != null && vOld !== '') localStorage.setItem(newKey, vOld);
      }
    } catch {}
    try { localStorage.removeItem(oldKey); } catch {}
    try { localStorage.setItem(KEY_BOOKMARKS_MIG_V1, '1'); } catch {}

    return newKey;
  }

  function normId(id){
    const v = W.H2O?.msg?.normalizeId?.(id);
    if (v) return v;
    return String(id || '').replace(/^conversation-turn-/, '').trim();
  }

  function emitDom(name, detail){
    try {
      if (detail !== undefined) W.dispatchEvent(new CustomEvent(name, { detail }));
      else W.dispatchEvent(new Event(name));
    } catch {}
  }

  function changedDetail(reason, changedId){
    return {
      chatId: S.chatId || getChatId(),
      storeKey: S.storeKey || '',
      reason: String(reason || ''),
      ts: Date.now(),
      count: loadStore().length,
      changedId: changedId ? String(changedId) : '',
    };
  }

  function emitChanged(reason, changedId){
    const detail = changedDetail(reason, changedId);

    // Always emit DOM events (Tabs depend on them)
    emitDom(EV_BOOKMARKS_CHANGED_H2O, detail);
    emitDom(EV_BOOKMARKS_CHANGED_H2O_DASH, detail);
    emitDom(EV_BOOKMARKS_CHANGED_HO_LEG);

    // Also emit Core topic if available
    if (W.H2O?.events?.emit) {
      try { W.H2O.events.emit(EV_BOOKMARKS_CHANGED_CANON, detail); } catch {}
    }
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
    return line.length > CFG.titleMax ? (line.slice(0, CFG.titleMax - 1) + '…') : line;
  }

  function loadStore(){
    const raw = localStorage.getItem(S.storeKey);
    const v = safeParseJSON(raw, []);
    const arr = Array.isArray(v) ? v : [];

    // ✅ Migration: prefer primaryAId as canonical msgId when present (fixes preview/jump id drift).
    try{
      let changed = false;
      for (const it of arr){
        if (!it || typeof it !== 'object') continue;
        const pid = normId(it.primaryAId || '');
        if (pid){
          if (normId(it.msgId || '') !== pid){
            it.msgId = pid;
            changed = true;
          }
          if (!it.primaryAId) { it.primaryAId = pid; changed = true; }
        }
      }
      if (changed) saveStore(arr);
    } catch {}

    return arr;
  }
  function saveStore(arr){
    try { localStorage.setItem(S.storeKey, JSON.stringify(arr || [])); } catch {}
  }

  function getAll(){ return loadStore(); }

  function setAll(arr, reason='setAll'){
    const next = Array.isArray(arr) ? arr : [];
    saveStore(next);
    emitChanged(reason, '');
    refresh('setAll');
  }

  function resolveStoreId(idOrTarget){
    const id = normId(idOrTarget || '');
    if (!id) return '';

    const arr = loadStore();

    // direct match by msgId
    const byMsg = arr.find(x => x && normId(x.msgId) === id);
    if (byMsg?.msgId) return normId(byMsg.msgId);

    // match by primaryAId
    const byPrim = arr.find(x => x && normId(x.primaryAId) === id);
    if (byPrim?.msgId) return normId(byPrim.msgId);

    // fallback: maybe caller passed msgId already
    return id;
  }

  function findMessageEl(msgId){
    if (!msgId) return null;
    const id = normId(msgId);

    const el = W.H2O?.msg?.findEl?.(id);
    if (el) return el;

    const esc = (s) => (W.CSS && W.CSS.escape) ? W.CSS.escape(s) : String(s).replace(/"/g,'\\"');

    return (
      document.querySelector(`[data-message-id="${esc(id)}"]`) ||
      document.querySelector(`[data-testid="conversation-turn-${esc(id)}"]`) ||
      document.querySelector(`[data-h2o-id="${esc(id)}"]`) ||
      document.querySelector(`[data-h2o-uid="${esc(id)}"]`) ||
      document.querySelector(`[data-ho-id="${esc(id)}"]`) ||
      document.querySelector(`[data-ho-uid="${esc(id)}"]`)
    );
  }

  function ensureDomHasId(msgEl, id){
    if (!msgEl || !id) return;
    const cur = msgEl.getAttribute('data-message-id');
    if (!cur) msgEl.setAttribute('data-message-id', normId(id));
  }

  function makeSnippet(msgEl){
    if (!msgEl) return '';
    const content =
      msgEl.querySelector(SEL_.mdAny) ||
      msgEl.querySelector(SEL_.msgA + ' ' + SEL_.mdAny) ||
      msgEl;

    const clone = content.cloneNode(true);
    clone.querySelectorAll('button, nav, svg, textarea, input, select').forEach(n => n.remove());
    clone.querySelectorAll('[aria-hidden="true"], .sr-only, .visually-hidden').forEach(n => n.remove());

    let txt = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    txt = txt.replace(/^\s*ChatGPT\s+said:\s*/i, '');
    txt = txt.replace(/^\s*Thought\s+for\s+[\d.]+\s*(s|sec|secs|seconds|m|min|mins|minutes)\s*/i, '');
    txt = txt.replace(/^\s*TITLE\s*[:—-]?\s*/i, '');

    return txt.slice(0, CFG.snippetMax);
  }

  function getMountedContentEl(msgEl){
    if (!msgEl) return null;
    return (
      msgEl.querySelector(SEL_.mdAny) ||
      msgEl.querySelector(SEL_.msgA + ' ' + SEL_.mdAny) ||
      msgEl
    );
  }

  function captureSnapshotFromEl(msgEl){
    const content = getMountedContentEl(msgEl);
    if (!content) return { snapText:'', title:'' };

    const raw = cleanText(content.textContent || '');
    const snap = raw.slice(0, CFG.snapMax);
    const title = firstLineTitle(snap);
    return { snapText: snap, title };
  }

  function list(){
    const arr = loadStore();
    return arr.slice().sort((a,b)=>{
      const at = (a && a.turnNo != null) ? a.turnNo : 1e9;
      const bt = (b && b.turnNo != null) ? b.turnNo : 1e9;
      if (at !== bt) return at - bt;

      const ap = (a && a.pairNo != null) ? a.pairNo : 1e9;
      const bp = (b && b.pairNo != null) ? b.pairNo : 1e9;
      if (ap !== bp) return ap - bp;

      return (a?.createdAt || 0) - (b?.createdAt || 0);
    });
  }

  function has(msgId){
    if (!msgId) return false;
    const id = normId(msgId);
    return loadStore().some(x => x && normId(x.msgId) === id);
  }

  function upsertSnapshot(msgIdOrTarget, snapText, title){
    const storeId = resolveStoreId(msgIdOrTarget);
    if (!storeId) return false;

    const arr = loadStore();
    const idx = arr.findIndex(x => x && normId(x.msgId) === storeId);
    if (idx < 0) return false;

    const cur = arr[idx] || {};
    const next = Object.assign({}, cur, {
      snapText: String(snapText || cur.snapText || ''),
      title: String(title || cur.title || ''),
      updatedAt: Date.now(),
    });

    arr[idx] = next;
    saveStore(arr);
    emitChanged('snapshot', storeId);
    return true;
  }

  async function captureSnapshot(msgIdOrTargetId, opts){
    const target = normId(msgIdOrTargetId || '');
    if (!target) return { ok:false, reason:'no-id', snapText:'', title:'' };

    const storeId = resolveStoreId(target);

    const timeoutMs = Number(opts?.timeoutMs || CFG.captureTimeoutMs);
    const minChars  = Number(opts?.minChars  || CFG.captureMinChars);

    const started = Date.now();
    const tryOnce = () => {
      const msgEl = findMessageEl(target) || findMessageEl(storeId);
      if (!msgEl) return null;

      const noScroll = !!opts?.noScroll;
      if (!noScroll) {
        try { msgEl.scrollIntoView({ behavior:'auto', block:'center' }); } catch {}
      }

      const { snapText, title } = captureSnapshotFromEl(msgEl);
      if (snapText && snapText.length >= minChars) return { msgEl, snapText, title };
      return { msgEl, snapText:'', title:'' };
    };

    let last = null;

    // If caller requested noScroll, do a single pass (mounted-only snapshot).
    if (opts?.noScroll) {
      last = tryOnce();
      if (last && last.snapText) {
        upsertSnapshot(storeId || target, last.snapText, last.title);
        return { ok:true, reason:'captured', snapText:last.snapText, title:last.title };
      }
      return { ok:false, reason:(last ? 'too-short' : 'not-mounted'), snapText:'', title:'' };
    }

    while ((Date.now() - started) < timeoutMs) {
      last = tryOnce();
      if (last && last.snapText) {
        upsertSnapshot(storeId || target, last.snapText, last.title);
        return { ok:true, reason:'captured', snapText:last.snapText, title:last.title };
      }
      await new Promise(r => requestAnimationFrame(r));
    }

    return { ok:false, reason:'timeout', snapText:'', title:'' };
  }

  function getSnapshot(msgIdOrTarget){
    const storeId = resolveStoreId(msgIdOrTarget);
    if (!storeId) return { snapText:'', title:'' };

    const arr = loadStore();
    const it = arr.find(x => x && normId(x.msgId) === storeId) || null;
    return {
      snapText: String(it?.snapText || ''),
      title: String(it?.title || ''),
    };
  }

  function toggle(entry){
    if (!entry || !entry.msgId) return false;

    const arr = loadStore();
    const id = normId(entry.msgId);
    const idx = arr.findIndex(x => x && normId(x.msgId) === id);

    if (idx >= 0) {
      arr.splice(idx, 1);
      saveStore(arr);
      emitChanged('remove', id);
      return false;
    }

    const next = Object.assign({}, entry);
    next.msgId = id;

    if (!next.title && next.snapText) next.title = firstLineTitle(next.snapText);
    if (!next.createdAt) next.createdAt = Date.now();

    arr.push(next);

    // Best-effort snippet/title if missing (helps list cards even before snapshot is captured)
    try {
      if (!next.snippet) {
        const el = findMessageEl(next.msgId);
        const sn = makeSnippet(el, CFG.snippetMax);
        if (sn) next.snippet = sn;
      }
      if (!next.title) {
        const base = String(next.snippet || '').trim();
        if (base) next.title = firstLineTitle(base);
      }
    } catch (_) {}


    saveStore(arr);
    emitChanged('add', id);

    // Auto snapshot capture (best-effort): enables instant preview later.
    try {
      const snap = getSnapshot(id);
      if (!snap || !snap.snapText) {
        const sched = (typeof requestIdleCallback === 'function')
          ? (fn)=>requestIdleCallback(fn, { timeout: 1200 })
          : (fn)=>setTimeout(fn, 0);

        sched(()=>{ try { captureSnapshot(id, { timeoutMs: CFG.captureTimeoutMs, minChars: CFG.captureMinChars }); } catch (_) {} });
      }
    } catch (_) {}

    return true;
  }

  function clear(){
    saveStore([]);
    emitChanged('clear', '');
  }

  function buildPairNoToAssistantEl(){
    const map = new Map();
    const assists = Array.from(document.querySelectorAll(SEL_.msgA));
    for (let i=0;i<assists.length;i++) map.set(i+1, assists[i]);
    return map;
  }

  function hydrateDomIdsFromStore(){
    const items = loadStore();
    if (!items.length) return;

    const pairToEl = buildPairNoToAssistantEl();
    let changed = false;

    for (const b of items) {
      const msgId = b?.msgId ? normId(b.msgId) : '';
      const primaryAId = b?.primaryAId ? normId(b.primaryAId) : '';
      const pairNo = b?.pairNo;

      let el =
        (primaryAId && W.H2O?.msg?.findEl?.(primaryAId)) ||
        (msgId && W.H2O?.msg?.findEl?.(msgId)) ||
        null;

      if (!el && pairNo) el = pairToEl.get(pairNo) || null;
      if (!el) continue;

      const cur = el.getAttribute('data-message-id');
      const want = primaryAId || msgId;
      if (!want) continue;

      if (!cur) {
        el.setAttribute('data-message-id', want);
        changed = true;
      }
    }

    if (changed) DIAG_safe('hydrate:domIds', { changed:true });
  }

  function injectStyles(){
    if (document.getElementById(CSS_STYLE_ID)) return;
    if (W[KEY_BOOKMARKS_GUARD_STYLE]) return;
    W[KEY_BOOKMARKS_GUARD_STYLE] = 1;

    const css = `
button.${CSS_BTN_CLASS}[${ATTR_CGX_OWNER}="${SkID}"]{
  color: inherit;
  display:inline-flex; align-items:center; justify-content:center;
  border-radius:8px;
  background:transparent;
  border:0;
  padding:0;
  cursor:pointer;
  pointer-events:auto !important;
  opacity:.92;
  transition:transform .12s ease, background .12s ease, opacity .12s ease, filter .12s ease;
}
button.${CSS_BTN_CLASS}[${ATTR_CGX_OWNER}="${SkID}"] > span{
  display:flex; align-items:center; justify-content:center;
  width:32px; height:32px;
  font-size:14px; line-height:1;
}
button.${CSS_BTN_CLASS}[${ATTR_CGX_OWNER}="${SkID}"]:hover{
  background:rgba(255,255,255,.08);
  transform:translateY(-1px);
  opacity:1;
}
button.${CSS_BTN_CLASS}[${ATTR_CGX_OWNER}="${SkID}"][data-on="1"]{
  filter:drop-shadow(0 0 6px rgba(251,191,36,.35));
}
`;
    const style = document.createElement('style');
    style.id = CSS_STYLE_ID;
    style.textContent = css;
    style.setAttribute(ATTR_CGX_OWNER, SkID);
    style.setAttribute(ATTR_CGX_UI, `${SkID}-style`);
    document.documentElement.appendChild(style);
  }

  function getAssistantRootFromNode(node){
    return node?.closest?.(SEL_.msgA) || null;
  }

  function findToolbars(){
    const copyBtns = document.querySelectorAll(SEL_.copyBtn);
    const items = [];

    copyBtns.forEach(copyBtn=>{
      const bar = copyBtn.closest('div');
      if (!bar) return;

      const hasGood = bar.querySelector(SEL_.goodBtn);
      const hasBad  = bar.querySelector(SEL_.badBtn);
      const hasMore = bar.querySelector(SEL_.moreBtn);
      if (hasGood && hasBad && hasMore) items.push({ bar, copyBtn });
    });

    const seen = new Set();
    return items.filter(x => (seen.has(x.bar) ? false : (seen.add(x.bar), true)));
  }

  function setBtnVisual(btn, on){
    btn.dataset.on = on ? '1' : '0';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const span = btn.querySelector('span');
    if (span) span.textContent = on ? STR.starOn : STR.starOff;
  }

  function computePairNo(msgEl){
    if (!msgEl) return -1;
    const assists = Array.from(document.querySelectorAll(SEL_.msgA));
    const ai = assists.indexOf(msgEl);
    return ai >= 0 ? (ai + 1) : -1;
  }

  function computeCoreFields(msgEl){
    const H = W.H2O;
    if (!(H && H.index && H.turn)) return { turnNo:0, primaryAId:'', aId:'' };

    const aId = normId(H.index.getAId?.(msgEl) || '');
    const primaryAId = normId(H.turn.getPrimaryAIdByAId?.(aId) || aId || '');
    const turnNo =
      H.turn.getTurnIndexByAId?.(aId) ||
      H.turn.getTurnIndexByAEl?.(msgEl) ||
      0;

    return { turnNo:Number(turnNo||0), primaryAId, aId };
  }

  function injectToolbarButton(item){
    const { bar, copyBtn } = item;
    if (!bar || bar.querySelector(`[${ATTR_BOOKMARKS_BTN}]`)) return;

    const btn = document.createElement('button');
    btn.setAttribute(ATTR_BOOKMARKS_BTN, '1');
    btn.className = `${CSS_BTN_CLASS} text-token-text-secondary hover:bg-token-bg-secondary rounded-lg`;
    btn.type = 'button';
    btn.setAttribute('aria-label', STR.ariaLabel);
    btn.setAttribute(ATTR_CGX_OWNER, SkID);
    btn.setAttribute(ATTR_CGX_UI, `${SkID}-bm-btn`);

    const span = document.createElement('span');
    span.className = 'flex items-center justify-center touch:w-10 h-8 w-8';
    btn.appendChild(span);

    setBtnVisual(btn, false);

    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      e.stopPropagation();

      const msgEl = getAssistantRootFromNode(btn) || getAssistantRootFromNode(copyBtn);

      let snippet = '';
      let pairNo = -1;
      let snapText = '';
      let title = '';

      // ✅ Canonical store id: prefer primaryAId/aId (core), else data-message-id, else data-testid.
      let msgId = null;
      let primaryAId = null;
      let turnNo = 0;

      if (msgEl && document.contains(msgEl)) {
        snippet = makeSnippet(msgEl);
        pairNo = computePairNo(msgEl);

        const cap = captureSnapshotFromEl(msgEl);
        snapText = String(cap?.snapText || '');
        title = String(cap?.title || '');

        const core = computeCoreFields(msgEl);
        turnNo = Number(core?.turnNo || 0) || 0;
        primaryAId = normId(core?.primaryAId || '') || null;

        const domId  = normId(core?.aId || msgEl.getAttribute('data-message-id') || '') || '';
        const testId = normId(String(msgEl.getAttribute('data-testid') || '').replace(/^conversation-turn-/, '')) || '';

        msgId = primaryAId || domId || testId || null;

        // If the DOM lacks a stable id attribute, pin one so other modules can find it later.
        if (msgId) ensureDomHasId(msgEl, msgId);
      }

      // Last-resort fallback (rare): still bookmark, but preview/jump may be limited.
      if (!msgId) msgId = `H2O_bm_fallback_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      const entry = {
        msgId: normId(msgId),
        pairNo,
        turnNo: turnNo || 0,
        primaryAId: primaryAId || '',
        role: STR.roleA,
        createdAt: Date.now(),
        snippet,
        snapText: snapText || '',
        title: title || '',
      };

      const nowOn = toggle(entry);
      setBtnVisual(btn, nowOn);
      hydrateDomIdsFromStore();
      refresh('toggle');
    });

    const more = bar.querySelector(SEL_.moreBtn);
    if (more) more.insertAdjacentElement('beforebegin', btn);
    else bar.appendChild(btn);

    const msgEl = getAssistantRootFromNode(copyBtn);
    const mid = msgEl ? (msgEl.getAttribute('data-message-id') || '') : '';
    if (mid) setBtnVisual(btn, has(mid));
  }

  function refresh(reason=''){
    if (S.refreshPending) return;
    S.refreshPending = true;

    requestAnimationFrame(()=>{
      S.refreshPending = false;
      hydrateDomIdsFromStore();
      findToolbars().forEach(injectToolbarButton);
      DIAG_safe('refresh', reason || '');
    });
  }

  function rebindChatContextIfChanged(){
    const nowId = getChatId();
    if (nowId === S.chatId) return;
    S.chatId = nowId;
    S.storeKey = storeKey(S.chatId);
    emitChanged('chat', '');
    refresh('chat');
  }

  function hasCore(){
    return !!(W.H2O && W.H2O.index && typeof W.H2O.index.getTurns === 'function');
  }

  function hookHistoryOnce(){
    if (W[KEY_BOOKMARKS_GUARD_NAV_HOOK]) return;
    W[KEY_BOOKMARKS_GUARD_NAV_HOOK] = 1;

    S.origPush = history.pushState;
    S.origReplace = history.replaceState;

    history.pushState = function(){
      const r = S.origPush.apply(this, arguments);
      emitDom(EV_NAVIGATION_H2O);
      return r;
    };

    history.replaceState = function(){
      const r = S.origReplace.apply(this, arguments);
      emitDom(EV_NAVIGATION_H2O);
      return r;
    };
  }

  function isRelevantMutation(muts){
    for (const m of muts) {
      for (const n of m.addedNodes || []) {
        if (n && n.nodeType === 1) {
          const el = n;
          if (
            el.matches?.('[data-message-author-role]') ||
            el.querySelector?.('[data-message-author-role]') ||
            el.matches?.('button[aria-label="Copy"]') ||
            el.querySelector?.('button[aria-label="Copy"]')
          ) return true;
        }
      }
    }
    return false;
  }

  function getObsRoot(){
    return document.querySelector(SEL_.turnsRoot) || document.querySelector(SEL_.rootMain) || document.body;
  }

  function bindRuntime(){
    S.onChangedH2O = () => refresh('evt:changed');
    S.onChangedHO  = () => refresh('evt:legacy');
    S.onInlineH2O  = () => refresh('evt:inline');
    S.onInlineHO   = () => refresh('evt:inlineLegacy');

    S.onCoreIndex = (e)=>{
      const chatIdFromCore = String(e?.detail?.chatId || '').trim();
      if (chatIdFromCore && chatIdFromCore !== S.chatId) {
        S.chatId = chatIdFromCore;
        S.storeKey = storeKey(S.chatId);
        emitChanged('core:chat', '');
      }
      refresh('core:index');
    };
    S.onCoreTurn = () => refresh('core:turn');
    S.onRemounted = () => refresh('unmount:remount');

    S.onNav = () => { rebindChatContextIfChanged(); refresh('nav'); };
    S.onPop = () => S.onNav && S.onNav();

    // Listen to both DOM variants (other modules)
    W.addEventListener(EV_BOOKMARKS_CHANGED_H2O, S.onChangedH2O);
    W.addEventListener(EV_BOOKMARKS_CHANGED_H2O_DASH, S.onChangedH2O);
    W.addEventListener(EV_BOOKMARKS_CHANGED_HO_LEG,  S.onChangedHO);

    W.addEventListener(EV_INLINE_CHANGED_H2O, S.onInlineH2O);
    W.addEventListener(EV_INLINE_CHANGED_HO_LEG, S.onInlineHO);

    W.addEventListener(EV_CORE_INDEX_UPDATED, S.onCoreIndex);
    W.addEventListener(EV_CORE_TURN_UPDATED,  S.onCoreTurn);

    W.addEventListener(EV_MSG_REMOUNTED, S.onRemounted);
    W.addEventListener(EV_MSG_REMOUNTED_EVT, S.onRemounted);
    W.addEventListener(EV_MSG_REMOUNTED_HO_LEG, S.onRemounted);

    W.addEventListener('popstate', S.onPop);
    W.addEventListener(EV_NAVIGATION_H2O, S.onNav);

    if (!hasCore()) {
      S.mo = new MutationObserver((muts)=>{
        if (!isRelevantMutation(muts)) return;
        rebindChatContextIfChanged();
        refresh('mo');
      });
      S.mo.observe(getObsRoot(), { childList:true, subtree:true });
    }
  }

  function exportGlobals(){
    W.H2OBookmarks = W.H2OBookmarks || {};
    Object.assign(W.H2OBookmarks, {
      key:    () => S.storeKey,
      chatId: () => S.chatId,
      list,
      has,
      toggle,
      clear,
      findMessageEl,
      getAll,
      setAll,
      getSnapshot,
      captureSnapshot,
      // extra: explicit changed detail builder (optional)
      _changedDetail: (reason, changedId) => changedDetail(reason, changedId),
    });
    W.HoBookmarks = W.HoBookmarks || W.H2OBookmarks;
  }

  function waitForMessagesThenInit(){
    const tryInit = ()=>{
      const hasAny = !!document.querySelector(SEL_.msgA);
      if (!hasAny) return false;

      S.chatId = getChatId();
      S.storeKey = storeKey(S.chatId);

      injectStyles();
      hookHistoryOnce();
      exportGlobals();
      bindRuntime();

      refresh('boot');
      DIAG_safe('boot:done', { ok:true, chatId:S.chatId });
      return true;
    };

    if (tryInit()) return;

    if (typeof MutationObserver !== 'function') {
      setTimeout(()=>{ tryInit(); }, 350);
      return;
    }

    S.waitMO = new MutationObserver(()=>{
      if (tryInit()) {
        try { S.waitMO.disconnect(); } catch {}
        S.waitMO = null;
      }
    });
    S.waitMO.observe(document.documentElement, { childList:true, subtree: CFG.waitBootSubtree });
  }

  function boot(){
    try {
      VAULT.diag.bootCount++;
      VAULT.diag.lastBootAt = Date.now();

      if (S.booted) return;
      S.booted = true;

      if (W[KEY_BOOKMARKS_GUARD_BOOT]) return;
      W[KEY_BOOKMARKS_GUARD_BOOT] = 1;

      waitForMessagesThenInit();
    } catch (err) {
      VAULT.diag.lastError = String(err?.stack || err);
      DIAG_safe('boot:crash', VAULT.diag.lastError);
      throw err;
    }
  }

  function dispose(){
    try {
      if (S.onChangedH2O) {
        W.removeEventListener(EV_BOOKMARKS_CHANGED_H2O, S.onChangedH2O);
        W.removeEventListener(EV_BOOKMARKS_CHANGED_H2O_DASH, S.onChangedH2O);
      }
      if (S.onChangedHO)  W.removeEventListener(EV_BOOKMARKS_CHANGED_HO_LEG,  S.onChangedHO);

      if (S.onInlineH2O)  W.removeEventListener(EV_INLINE_CHANGED_H2O, S.onInlineH2O);
      if (S.onInlineHO)   W.removeEventListener(EV_INLINE_CHANGED_HO_LEG, S.onInlineHO);
      if (S.onCoreIndex)  W.removeEventListener(EV_CORE_INDEX_UPDATED, S.onCoreIndex);
      if (S.onCoreTurn)   W.removeEventListener(EV_CORE_TURN_UPDATED,  S.onCoreTurn);

      if (S.onRemounted) {
        W.removeEventListener(EV_MSG_REMOUNTED, S.onRemounted);
        W.removeEventListener(EV_MSG_REMOUNTED_EVT, S.onRemounted);
        W.removeEventListener(EV_MSG_REMOUNTED_HO_LEG, S.onRemounted);
      }

      if (S.onPop) W.removeEventListener('popstate', S.onPop);
      if (S.onNav) W.removeEventListener(EV_NAVIGATION_H2O, S.onNav);

      if (S.mo) { try { S.mo.disconnect(); } catch {} S.mo = null; }
      if (S.waitMO) { try { S.waitMO.disconnect(); } catch {} S.waitMO = null; }

      if (S.origPush) history.pushState = S.origPush;
      if (S.origReplace) history.replaceState = S.origReplace;
      S.origPush = null;
      S.origReplace = null;

      try { document.getElementById(CSS_STYLE_ID)?.remove(); } catch {}

      DIAG_safe('dispose:done', null);
    } catch (e) {
      DIAG_safe('dispose:err', String(e?.stack || e));
    }
  }

  VAULT.api = VAULT.api || {};
  VAULT.api.boot = boot;
  VAULT.api.dispose = dispose;
  VAULT.api.refresh = refresh;

  boot();
})();
