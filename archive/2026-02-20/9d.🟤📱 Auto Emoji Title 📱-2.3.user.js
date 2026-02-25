// ==UserScript==
// @name         9d.🟤📱 Auto Emoji Title 📱
// @namespace    ho.chatgpt.autoemoji
// @version      2.3
// @description  (Stable + Live Picker + 9c Sync) Auto-prefix emoji ONCE per chat using native rename. If emoji already exists -> never auto-change. Click emoji badge -> picker. Live update + event for 9c. Chats only (no folders/projects).
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /**************************************************************
   * Identity + storage namespace (Contract v2.0)
   **************************************************************/
  const SUITE = 'prm';
  const HOST  = 'cgx';
  const TOK   = 'AE';
  const PID   = 'tmjttl';
  const DsID  = PID;

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;

  const UTIL_AE_safeId = (chatId) => String(chatId || '').replace(/[^a-zA-Z0-9_-]/g, '_');

  const KEY_AE_ = Object.freeze({
    DONE:  (chatId) => `${NS_DISK}:state:done_${UTIL_AE_safeId(chatId)}:v1`,
    EMOJI: (chatId) => `${NS_DISK}:state:emoji_${UTIL_AE_safeId(chatId)}:v1`,
    DONE_LEG:  (chatId) => `ho:autoemoji:done:${chatId}`,
    EMOJI_LEG: (chatId) => `ho:autoemoji:emoji:${chatId}`,
  });

  const EV_AE_CHANGED_CANON = 'evt:h2o:autoemoji:changed';
  const EV_AE_CHANGED_LEG   = 'ho:autoemoji:changed';

  /**************************************************************
   * Storage locks (per chat)
   **************************************************************/
  const DONE_KEY  = (chatId) => KEY_AE_.DONE(chatId);
  const EMOJI_KEY = (chatId) => KEY_AE_.EMOJI(chatId);

  const MIG_AE_keys = (chatId) => {
    try {
      const newDone = DONE_KEY(chatId);
      const oldDone = KEY_AE_.DONE_LEG(chatId);
      const vNew = localStorage.getItem(newDone);
      if (vNew == null || vNew === '') {
        const vOld = localStorage.getItem(oldDone);
        if (vOld != null && vOld !== '') localStorage.setItem(newDone, vOld);
      }
      localStorage.removeItem(oldDone);
    } catch {}

    try {
      const newEmoji = EMOJI_KEY(chatId);
      const oldEmoji = KEY_AE_.EMOJI_LEG(chatId);
      const vNew = localStorage.getItem(newEmoji);
      if (vNew == null || vNew === '') {
        const vOld = localStorage.getItem(oldEmoji);
        if (vOld != null && vOld !== '') localStorage.setItem(newEmoji, vOld);
      }
      localStorage.removeItem(oldEmoji);
    } catch {}
  };

  const isDone = (chatId) => {
    MIG_AE_keys(chatId);
    try { return localStorage.getItem(DONE_KEY(chatId)) === '1'; } catch { return false; }
  };
  const setDone = (chatId) => {
    MIG_AE_keys(chatId);
    try { localStorage.setItem(DONE_KEY(chatId), '1'); } catch {}
  };
  const getSavedEmoji = (chatId) => {
    MIG_AE_keys(chatId);
    try { return localStorage.getItem(EMOJI_KEY(chatId)) || ''; } catch { return ''; }
  };
  const setSavedEmoji = (chatId, e) => {
    MIG_AE_keys(chatId);
    try { localStorage.setItem(EMOJI_KEY(chatId), e); } catch {}
  };

  /**************************************************************
   * Emoji pool (expanded, practical “titling set”)
   * Note: “all system emojis” can’t be enumerated reliably in JS,
   * but this is intentionally large + useful.
   **************************************************************/
  const EMOJI_POOL = [
    // UI / status / markers
    '⭐','✨','⚡','🔥','💬','✅','❗','⚠️','🔁','🔒','🔓','📌','📍','🧭','🗺️','🧩','🧱','📦','📤','💾','🔋',

    // Work / docs / org
    '📁','📂','🗂️','🗃️','🗄️','📝','📄','📑','📜','🧾','📚','📖','📓','📒','📕','📗','📘','📙','🗞️','📰','🔖','📎',

    // Tech / code / tools
    '💻','🖥️','⌨️','🖱️','🧠','🧪','🧬','🔬','🔭','📐','📏','🧮',
    '⚙️','🛠️','🔧','🔩','🧰','🪛','🪚','🧲','🧯','🔌','🔋','💡',

    // Space / aero
    '🚀','🛰️','🛸','✈️','🛩️','🌌','🌍','🌙','⭐','☄️',

    // Time / planning
    '⏰','⏱️','⏲️','🕰️','📅','📆','🗓️','🧭',

    // Health / fitness
    '💊','🩺','💉','🩻','❤️','🫀','🫁','🧠','💪','🏋️','🏃','🧘','😴',

    // Food
    '🍏','🍎','🍋','🥗','🍞','🍕','🍜','🍣','☕','🧃',

    // Communication
    '💬','🗨️','🗯️','🗣️','📣','📢','✉️','📧','📨','📩','📮',

    // Creative / media
    '🎨','🖌️','🖍️','🖼️','✏️','🖊️','🖋️','📷','📸','🎬','🎧','🎤',

    // Faces (subset, useful)
    '😀','😅','😂','😊','😉','😍','🥳','😎','🤓','🧐','🤔','😴','🤯','😭','😤','😡','🤬','👻','🤖',

    // People/roles (subset)
    '👨‍💻','👩‍💻','👨‍🎓','👩‍🎓','👨‍🏫','👩‍🏫','👨‍🔬','👩‍🔬','👨‍⚕️','👩‍⚕️','👨‍⚖️','👩‍⚖️','👨‍🚀','👩‍🚀','👨‍🔧','👩‍🔧',

    // Legal / gov / buildings
    '⚖️','🏛️','🏫','🏢','🏗️',

    // Symbols/arrows
    '🔶','🔷','🔺','🔻','⬆️','⬇️','⬅️','➡️','↗️','↘️','↙️','↖️',

    // Flags (yours)
    '🇵🇸','🇩🇪','🇦🇹','🇪🇺','🇬🇧','🇺🇸','🇨🇦','🇨🇭','🇳🇱','🇸🇪','🇳🇴','🇫🇮','🇯🇵'
  ];

  const DEFAULT_EMOJI = '💬';

  /**************************************************************
   * Keyword -> emoji candidates
   **************************************************************/
  const KEYWORD_TO_EMOJIS = {
    // Legal/case
    law: ['⚖️','📜','🏛️'],
    legal: ['⚖️','📜'],
    court: ['⚖️','🏛️'],
    appeal: ['⚖️','📜'],
    objection: ['⚖️','📜'],
    fhwn: ['🏛️','⚖️'],
    kollegium: ['🏛️','⚖️'],

    // Study
    uni: ['🎓','🏫'],
    university: ['🎓','🏫'],
    study: ['📚','🎓'],
    master: ['🎓','📘'],
    bachelor: ['🎓','📗'],
    daad: ['🎓','🇩🇪'],
    application: ['📄','📨'],

    // Space
    space: ['🚀','🛰️','🌌'],
    rocket: ['🚀'],
    orbit: ['🛰️','🌍'],
    propulsion: ['🚀','⚙️'],
    satellite: ['🛰️'],

    // Code
    code: ['💻','⌨️'],
    script: ['💻','📜'],
    ui: ['💻','🎨'],
    css: ['🎨','💻'],
    js: ['💻','📜'],
    minimap: ['🗺️','💻'],

    // Health
    adhd: ['🧠','⚡'],
    sleep: ['😴','🌙'],
    meds: ['💊','🩺'],
    supplement: ['💊','🧪'],
    diet: ['🥗','🍏'],

    // Language
    german: ['🇩🇪','🗣️'],
    english: ['🇬🇧','🗣️'],
    arabic: ['🗣️','📚'],
    translation: ['🔁','🗣️'],

    // Planning
    plan: ['🧩','📋'],
    timeline: ['📆','📈'],
    summary: ['📝','🧠'],
    export: ['📤','📦'],
    backup: ['💾','🔋'],
  };

  /**************************************************************
   * Helpers: grapheme-safe emoji detection (prevents duplicates)
   **************************************************************/
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function graphemes(text){
    const s = norm(text);
    if (!s) return [];
    if (window.Intl && Intl.Segmenter){
      const seg = new Intl.Segmenter(undefined, { granularity:'grapheme' });
      return Array.from(seg.segment(s), x => x.segment);
    }
    return Array.from(s);
  }

  const isEmojiCluster = (cluster) => /\p{Extended_Pictographic}/u.test(cluster || '');

  function getEdgeEmoji(s){
    const t = norm(s);
    if (!t) return '';
    const g = graphemes(t);
    const first = g[0] || '';
    const last  = g[g.length - 1] || '';
    if (isEmojiCluster(first)) return first;
    if (isEmojiCluster(last)) return last;
    return '';
  }

  function stripEdgeEmoji(s){
    let g = graphemes(s);
    while (g.length && isEmojiCluster(g[0])) g.shift();
    while (g.length && isEmojiCluster(g[g.length-1])) g.pop();
    return norm(g.join(''));
  }

  function tokenizeTitle(title){
    return (title.toLowerCase().match(/\p{Letter}+/gu) || []);
  }

  function hashString(str){
    let hash = 0;
    for (let i=0;i<str.length;i++){
      hash = ((hash<<5)-hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function pickEmojiForTitle(plainTitle){
    if (!plainTitle) return DEFAULT_EMOJI;
    const clean = plainTitle.toLowerCase();
    const tokens = tokenizeTitle(clean);
    let candidates = [];
    for (const t of tokens) if (KEYWORD_TO_EMOJIS[t]) candidates = candidates.concat(KEYWORD_TO_EMOJIS[t]);
    const h = hashString(clean);
    if (candidates.length) return candidates[h % candidates.length];
    return EMOJI_POOL[h % EMOJI_POOL.length] || DEFAULT_EMOJI;
  }

  function isRTL(text){
    return /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text || '');
  }

  // IMPORTANT: no invisible marks -> avoids “random letters” issue
  function formatTitleWithEmoji(plain, emoji){
    const p = norm(plain);
    if (!p) return emoji;
    // RTL: append at end (visually left)
    if (isRTL(p)) return `${p} ${emoji}`;
    // LTR: prefix
    return `${emoji} ${p}`;
  }

  /**************************************************************
   * Chat-only guard (avoid folders/projects)
   **************************************************************/
  function getCurrentChatId(){
    const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  function isInChatView(){
    return !!getCurrentChatId();
  }

  /**************************************************************
   * Sidebar entry + “true title” (before we visually strip emoji)
   **************************************************************/
  function findSidebarEntry(chatId){
    if (!chatId) return null;
    const selector =
      `aside a[href*="/c/${chatId}"], nav a[href*="/c/${chatId}"],` +
      `aside button[href*="/c/${chatId}"], nav button[href*="/c/${chatId}"]`;
    return document.querySelector(selector);
  }

  function findLeafTitleNode(entry){
    if (!entry) return null;
    // pick the longest leaf text node
    const leafs = Array.from(entry.querySelectorAll('*'))
      .filter(el => el.childElementCount === 0)
      .filter(el => norm(el.textContent).length >= 2);
    leafs.sort((a,b) => norm(b.textContent).length - norm(a.textContent).length);
    return leafs[0] || null;
  }

  function getTrueTitle(entry){
    // store once per render-cycle; if entry rerenders, dataset resets and we recalc
    const leaf = findLeafTitleNode(entry);
    const raw = leaf ? norm(leaf.textContent) : norm(entry.textContent).split('\n').map(norm).filter(Boolean)[0] || '';
    return raw;
  }

  function isProjectsAreaPage(){
  // covers: /g/... (project pages / project lists)
  return /^\/g\/.+/i.test(location.pathname);
}

function extractChatIdFromHref(href){
  const m = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

/*
function findProjectListAnchors(){
  // ✅ IMPORTANT: exclude sidebar anchors; target the center/main list
  const all = Array.from(document.querySelectorAll('main a[href*="/c/"], section a[href*="/c/"]'));
  return all.filter(a => !a.closest('aside') && !a.closest('nav'));
}
*/

function findProjectListAnchors(){
  // ✅ capture ALL chat links in the main content area (project lists),
  // but exclude sidebar/nav
  const all = Array.from(document.querySelectorAll('a[href*="/c/"]'));
  return all.filter(a => !a.closest('aside') && !a.closest('nav'));
}

function findProjectTitleNode(anchor){
  if (!anchor) return null;

  // FIRST meaningful text node inside the anchor (usually the title line, not the snippet)
  const walker = document.createTreeWalker(
    anchor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const v = (node?.nodeValue || '');
        if (!v.trim()) return NodeFilter.FILTER_REJECT;

        const pe = node.parentElement;
        if (pe && pe.closest('.ho-emoji-badge, .ho-emoji-lane')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const firstText = walker.nextNode();
  return firstText?.parentElement || null;
}



  /**************************************************************
   * Native rename (persistent) + instant notify (for 9c)
   **************************************************************/
  function triggerNativeSidebarRename(chatId, newTitle){
    const entry = findSidebarEntry(chatId);
    if (!entry) return false;

    entry.dispatchEvent(new MouseEvent('dblclick', { bubbles:true, cancelable:true }));

    setTimeout(() => {
      const input = entry.querySelector('input, textarea, [contenteditable="true"]');
      if (!input) return;

      const title = String(newTitle);

      if (input.getAttribute && input.getAttribute('contenteditable') === 'true'){
        input.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, title);
      } else {
        input.focus();
        if (typeof input.setRangeText === 'function') input.setRangeText(title, 0, input.value.length, 'end');
        else input.value = title;
        input.dispatchEvent(new InputEvent('input', { bubbles:true }));
      }

      input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
      input.dispatchEvent(new KeyboardEvent('keyup',   { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
      input.blur();

      // Notify 9c NOW
      window.dispatchEvent(new CustomEvent(EV_AE_CHANGED_LEG, {
        detail: { chatId, newTitle: title }
      }));
      window.dispatchEvent(new CustomEvent(EV_AE_CHANGED_CANON, {
        detail: { chatId, newTitle: title }
      }));

      // Also refresh our badge/text immediately (no refresh needed)
      setTimeout(() => {
        ensureBadgeForChat(chatId);
      }, 80);

    }, 95);

    return true;
  }


/**************************************************************
 * UI: badge + picker (LIVE, no double emoji)
 * ✅ Sidebar (aside/nav): ABSOLUTE badge + reserved lane
 * ✅ Project list (main/section): INLINE badge (part of title flow)
 * ✅ NO global .ho-emoji-badge positioning (prevents “float above title” bug)
 **************************************************************/
const STYLE_ID = 'ho-autoemoji-style-v13';
const CSS = `
/* ============================================================
   0) BASE (safe defaults)
   - Keep minimal + non-positioning to avoid “scope leak”
   ============================================================ */
.ho-emoji-badge,
.ho-emoji-lane{
  user-select: none !important;
  cursor: pointer !important;
}

/* ============================================================
   1) SIDEBAR (aside/nav) — ABSOLUTE BADGE + RESERVED LANE
   ============================================================ */

/* Row becomes positioning context + reserve left lane */
aside .ho-emoji-row,
nav  .ho-emoji-row{
  position: relative !important;
  padding-left: 30px !important; /* reserved emoji lane */
}

/* Badge lives in the reserved lane (absolute) */
aside .ho-emoji-row > .ho-emoji-badge,
nav  .ho-emoji-row > .ho-emoji-badge{
  position: absolute !important;
  left: 8px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  width: 20px !important;
  height: 20px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 5 !important;
}

aside a.ho-emoji-row > .ho-emoji-badge:hover,
nav  a.ho-emoji-row > .ho-emoji-badge:hover{
  opacity: 1 !important;
  transform: translateY(-50%) scale(1.06) !important;
}

/* Optional: clickable “lane” (transparent overlay) */
aside a.ho-emoji-row > .ho-emoji-lane,
nav  a.ho-emoji-row > .ho-emoji-lane{
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  width: 30px !important;
  z-index: 4 !important;
}

/* ============================================================
   2) PROJECT LIST (main/section) — INLINE BADGE IN TITLE FLOW
   - Scoped to main/section so it cannot affect sidebar rows
   ============================================================ */

main a.ho-emoji-proj-row,
section a.ho-emoji-proj-row{
  padding-left: 0 !important; /* do not shift project row */
}

/* Inline badge: MUST be static (never absolute) */
main a.ho-emoji-proj-row .ho-emoji-badge,
section a.ho-emoji-proj-row .ho-emoji-badge{
  position: static !important;
  transform: none !important;

  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;

  width: auto !important;
  height: auto !important;
  margin: 0 6px 0 0 !important; /* emoji spacing */
  padding: 0 !important;

  opacity: .95 !important;
}

main a.ho-emoji-proj-row .ho-emoji-badge:hover,
section a.ho-emoji-proj-row .ho-emoji-badge:hover{
  opacity: 1 !important;
  transform: scale(1.06) !important;
}

/* Optional lane for project list (only if you inject it)
   NOTE: does not change badge positioning */
main a.ho-emoji-proj-row .ho-emoji-lane,
section a.ho-emoji-proj-row .ho-emoji-lane{
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  bottom: 0 !important;
  width: 30px !important;
  z-index: 4 !important;
}

/* ===== PROJECT LIST: force badge + text to be ONE line ===== */
main a.ho-emoji-proj-row .ho-emoji-titleline,
section a.ho-emoji-proj-row .ho-emoji-titleline{
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  min-width: 0 !important;
}

/* Project badge MUST be inline (never absolute) */
main a.ho-emoji-proj-row .ho-emoji-badge,
section a.ho-emoji-proj-row .ho-emoji-badge{
  position: static !important;
  transform: none !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin: 0 !important;
  padding: 0 !important;
  z-index: 5 !important;
}

/* ============================================================
   3) PICKER UI (unchanged)
   ============================================================ */

.ho-emoji-picker{
  position: fixed !important;
  z-index: 999999 !important;
  background: rgba(20,20,20,.95) !important;
  border: 1px solid rgba(255,255,255,.12) !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 30px rgba(0,0,0,.45) !important;
  padding: 10px !important;
  width: 420px !important;
  max-height: 520px !important;
  overflow: hidden !important;
  backdrop-filter: blur(8px) !important;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial !important;
  color: #fff !important;
}
.ho-emoji-picker input{
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 8px 10px !important;
  border-radius: 10px !important;
  border: 1px solid rgba(255,255,255,.15) !important;
  background: rgba(255,255,255,.06) !important;
  color: #fff !important;
  outline: none !important;
  margin-bottom: 8px !important;
}
.ho-emoji-grid{
  display: grid !important;
  grid-template-columns: repeat(14, 1fr) !important;
  gap: 6px !important;
  overflow: auto !important;
  max-height: 430px !important;
  padding-right: 4px !important;
}
.ho-emoji-btn{
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 28px !important;
  border-radius: 9px !important;
  cursor: pointer !important;
  background: rgba(255,255,255,.06) !important;
}
.ho-emoji-btn:hover{
  background: rgba(255,255,255,.12) !important;
}





`;




  function ensureStyle(){
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  let pickerEl = null;

  function closePicker(){
    if (pickerEl?.parentNode) pickerEl.parentNode.removeChild(pickerEl);
    pickerEl = null;
    document.removeEventListener('mousedown', onOutside, true);
  }

  function onOutside(e){
    if (pickerEl && !pickerEl.contains(e.target)) closePicker();
  }

  function openPicker({x,y, chatId, plainTitle, badgeEl}){
    ensureStyle();
    closePicker();

    pickerEl = document.createElement('div');
    pickerEl.className = 'ho-emoji-picker';
    pickerEl.style.left = Math.min(x, window.innerWidth - 440) + 'px';
    pickerEl.style.top  = Math.min(y, window.innerHeight - 560) + 'px';

    const input = document.createElement('input');
    input.placeholder = 'Search… (law / space / code / health / food / time)';

    const grid = document.createElement('div');
    grid.className = 'ho-emoji-grid';

    function render(list){
      grid.innerHTML = '';
      list.forEach(e => {
        const b = document.createElement('div');
        b.className = 'ho-emoji-btn';
        b.textContent = e;

        b.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();

          // Replace (never add): plainTitle is already emoji-stripped
          const finalTitle = formatTitleWithEmoji(plainTitle, e);

          setSavedEmoji(chatId, e);
          setDone(chatId);

          // LIVE UI update immediately
          badgeEl.textContent = e;

          triggerNativeSidebarRename(chatId, finalTitle);

          closePicker();
        }, true);

        grid.appendChild(b);
      });
    }

    // default render: full pool
    render(EMOJI_POOL);

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) return render(EMOJI_POOL);

      const quick = {
        law:   ['⚖️','🏛️','📜','🧾','❗','⚠️'],
        space: ['🚀','🛰️','🌍','🌌','🛸','☄️'],
        code:  ['💻','⌨️','🧠','⚙️','🧰','🔧'],
        health:['💊','🩺','❤️','💪','🧠','😴'],
        food:  ['🍏','🥗','🍕','🍜','🍋','☕'],
        time:  ['⏰','📆','🧭','✅','📌']
      };

      let list = [];
      Object.keys(quick).forEach(k => { if (q.includes(k)) list = list.concat(quick[k]); });

      if (!list.length){
        // fallback: stable window slice
        const h = hashString(q);
        const span = 140;
        const start = h % Math.max(1, (EMOJI_POOL.length - span));
        list = EMOJI_POOL.slice(start, start + span);
      }

      render(Array.from(new Set(list)));
    });

    pickerEl.appendChild(input);
    pickerEl.appendChild(grid);
    document.body.appendChild(pickerEl);

    setTimeout(() => input.focus(), 0);
    document.addEventListener('mousedown', onOutside, true);
  }


/**************************************************************
 * ✅ PROJECT TITLE (SAFE): get first meaningful text node
 * (prevents grabbing snippet/preview line)
 **************************************************************/
function getFirstTextFromAnchor(anchor){
  const walker = document.createTreeWalker(
    anchor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const v = (node?.nodeValue || '');
        if (!v.trim()) return NodeFilter.FILTER_REJECT;
        const pe = node.parentElement;
        if (pe && pe.closest('.ho-emoji-badge, .ho-emoji-lane')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  const n = walker.nextNode();
  return norm(n?.nodeValue || '');
}

/**************************************************************
 * 🧼 HARD “single emoji” cleanup (DOM-safe):
 * Remove leading emoji ONLY from the first real text node.
 * Never touches element.innerHTML / leaf.textContent replacements.
 **************************************************************/
function stripLeadingEmojiFromFirstText(anchor){
  if (!anchor) return;

  const walker = document.createTreeWalker(
    anchor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const v = (node?.nodeValue || '');
        if (!v.trim()) return NodeFilter.FILTER_REJECT;
        const pe = node.parentElement;
        if (pe && pe.closest('.ho-emoji-badge, .ho-emoji-lane')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const firstText = walker.nextNode();
  if (!firstText) return;

  const before = firstText.nodeValue || '';
  const trimmedLeft = before.replace(/^\s+/, '');

  const edge = getEdgeEmoji(trimmedLeft);
  if (!edge) return;

  let after = stripEdgeEmoji(trimmedLeft) || trimmedLeft;
  after = after.replace(/^\s+/, '');

  if (after !== trimmedLeft){
    firstText.nodeValue = after;
  }
}


function findFirstRealTextHost(anchor){
  const walker = document.createTreeWalker(
    anchor,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node){
        const v = (node?.nodeValue || '');
        if (!v.trim()) return NodeFilter.FILTER_REJECT;
        const pe = node.parentElement;
        if (pe && pe.closest('.ho-emoji-badge, .ho-emoji-lane, .ho-emoji-proj-badge')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNode = walker.nextNode();
  if (!textNode) return null;

  // We want the ELEMENT that holds this first “real” text (usually title line)
  const hostEl = textNode.parentElement || anchor;
  return { textNode, hostEl };
}


/**************************************************************
 * 🖱️ Middle mouse (auxclick) opens picker reliably
 * - Works in sidebar + project list
 * - Uses capture to beat React handlers/overlays
 **************************************************************/
let H2O_MIDDLE_BOUND = false;

function getPlainTitleForChatId(chatId, fallbackPlain){
  const entry = findSidebarEntry(chatId);
  if (entry){
    const t = getTrueTitle(entry);
    const plain = stripEdgeEmoji(t) || t;
    return plain || fallbackPlain;
  }
  return fallbackPlain;
}

function openPickerForAnchor(anchor, ev){
  const chatId = extractChatIdFromHref(anchor.getAttribute('href') || '');
  if (!chatId) return false;

  ensureStyle();

  // ensure badge exists
  let badge = anchor.querySelector(':scope .ho-emoji-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.className = 'ho-emoji-badge';
    badge.textContent = getSavedEmoji(chatId) || DEFAULT_EMOJI;
    anchor.insertBefore(badge, anchor.firstChild);
  }

  // title source: sidebar true title if possible, else first text node from this row
  const rawLocal = getFirstTextFromAnchor(anchor) || norm(anchor.textContent || '');
  const localPlain = stripEdgeEmoji(rawLocal) || rawLocal;
  const plainTitle = getPlainTitleForChatId(chatId, localPlain);

  const r = badge.getBoundingClientRect();
  openPicker({
    x: r.left,
    y: r.bottom + 6,
    chatId,
    plainTitle,
    badgeEl: badge
  });

  return true;
}


  function bindEmojiDblClickOnce(){
  if (window.__HO_EMOJI_DBLCLICK_BOUND) return;
  window.__HO_EMOJI_DBLCLICK_BOUND = true;

  document.addEventListener('dblclick', (e) => {
    const badge = e.target?.closest?.('.ho-emoji-badge');
    if (!badge) return;

    // Only hijack dblclicks ON the emoji
    e.preventDefault();
    e.stopPropagation();

    const anchor = badge.closest('a[href*="/c/"]');
    if (!anchor) return;

    const chatId = extractChatIdFromHref(anchor.getAttribute('href') || '');
    if (!chatId) return;

    // Determine plain title at click-time (works even after React rerenders)
    let plainTitle = '';
    const inSidebar = !!anchor.closest('aside, nav') && !anchor.closest('main, section');

    if (inSidebar){
      const entry = findSidebarEntry(chatId);
      const t = entry ? getTrueTitle(entry) : norm(anchor.textContent || '');
      plainTitle = stripEdgeEmoji(t) || t;
    } else {
      const leaf = findProjectTitleNode(anchor);
      const t = norm(leaf?.textContent || anchor.textContent || '');
      plainTitle = stripEdgeEmoji(t) || t;
    }

    const r = badge.getBoundingClientRect();
    openPicker({
      x: r.left,
      y: r.bottom + 6,
      chatId,
      plainTitle,
      badgeEl: badge
    });
  }, true); // ✅ capture phase beats ChatGPT handlers
}

function bindProjectEmojiClickOnce(){
  if (window.__HO_PROJ_EMOJI_CLICK_BOUND) return;
  window.__HO_PROJ_EMOJI_CLICK_BOUND = true;

  // Capture phase so we beat navigation
  document.addEventListener('pointerdown', (e) => {
    const badge = e.target?.closest?.('.ho-emoji-badge[data-ho-emoji-ctx="proj"]');
    if (!badge) return;

    // Stop navigation EARLY
    e.preventDefault();
    e.stopPropagation();
  }, true);

  document.addEventListener('click', (e) => {
    const badge = e.target?.closest?.('.ho-emoji-badge[data-ho-emoji-ctx="proj"]');
    if (!badge) return;

    e.preventDefault();
    e.stopPropagation();

    const anchor = badge.closest('a[href*="/c/"]');
    if (!anchor) return;

    const chatId = extractChatIdFromHref(anchor.getAttribute('href') || '');
    if (!chatId) return;

    const leaf = findProjectTitleNode(anchor);
    const raw = norm(leaf?.textContent || anchor.textContent || '');
    const plainTitle = stripEdgeEmoji(raw) || raw;

    const r = badge.getBoundingClientRect();
    openPicker({ x: r.left, y: r.bottom + 6, chatId, plainTitle, badgeEl: badge });
  }, true);
}


  /*
    function bindPickerClicksOnce(){
  if (window.__HO_EMOJI_PICKER_BINDED) return;
  window.__HO_EMOJI_PICKER_BINDED = true;

  // ✅ cancel "open in new tab" early (some browsers trigger it on mousedown)
  document.addEventListener('mousedown', (e) => {
    const hit = e.target?.closest?.('.ho-emoji-badge, .ho-emoji-lane');
    if (!hit) return;
    if (e.button === 1) { // middle
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // ✅ also cancel auxclick default
  document.addEventListener('auxclick', (e) => {
    const hit = e.target?.closest?.('.ho-emoji-badge, .ho-emoji-lane');
    if (!hit) return;
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

 */

/*
function bindMiddleOpenOnce(){
  if (H2O_MIDDLE_BOUND) return;
  H2O_MIDDLE_BOUND = true;

  document.addEventListener('auxclick', (e) => {
    if (!e.isTrusted) return;
    if (e.button !== 1) return; // middle click only

    const hit = e.target?.closest?.('.ho-emoji-badge, .ho-emoji-lane');
    if (!hit) return;

    const a = hit.closest('a[href*="/c/"]');
    if (!a) return;

    const chatId = extractChatIdFromHref(a.getAttribute('href') || '');
    if (!chatId) return;

    // figure out title
    const inSidebar = !!a.closest('aside, nav') && !a.closest('main, section');
    const leaf = inSidebar ? findLeafTitleNode(a) : findProjectTitleNode(a);
    const raw = norm(leaf?.textContent || a.textContent || '');
    const plainTitle = stripEdgeEmoji(raw) || raw;

    // use an existing badge (or create it minimally)
    let badgeEl = a.querySelector('.ho-emoji-badge');
    if (!badgeEl){
      badgeEl = document.createElement('span');
      badgeEl.className = 'ho-emoji-badge';
      badgeEl.textContent = getSavedEmoji(chatId) || DEFAULT_EMOJI;

      // insert safely
      if (inSidebar) a.insertBefore(badgeEl, a.firstChild);
      else {
        const leaf2 = findProjectTitleNode(a);
        const line = leaf2?.parentElement || a;
        line.insertBefore(badgeEl, leaf2 || line.firstChild);
      }
    }

    e.preventDefault();
    e.stopPropagation();

    const r = badgeEl.getBoundingClientRect();
    openPicker({
      x: r.left,
      y: r.bottom + 6,
      chatId,
      plainTitle,
      badgeEl
    });
  }, true);
}
*/

  /**************************************************************
   * Core: badge + visual strip (prevents double emoji)
   **************************************************************/
  const chatState = Object.create(null);
  const MIN_TITLE_LENGTH = 4;
  const STABLE_RUNS_REQUIRED = 2;

function stripEdgeEmojiFromLeaf(leaf){
  if (!leaf) return;
  const cur = (leaf.textContent || '').replace(/^\s+/, '').replace(/\s+/g,' ').trim();
  if (!cur) return;

  const edge = getEdgeEmoji(cur);
  if (!edge) return;

  const next = (stripEdgeEmoji(cur) || cur).replace(/^\s+/, '').replace(/\s+/g,' ').trim();
  if (leaf.textContent !== next){
    leaf.textContent = '';
    leaf.textContent = next;
  }
}

function keepOnlyOneBadgeAny(root, preferNearEl = null){
  if (!root) return null;

  let badges = Array.from(root.querySelectorAll('.ho-emoji-badge'));
  if (!badges.length) return null;

  // drop empty badges first
  badges = badges.filter(b => (b.textContent || '').trim().length > 0);
  if (!badges.length) return null;

  // choose which to keep
  let keep = badges[0];

  // If we know the title leaf (or its line), keep the badge closest to it
  if (preferNearEl){
    const pr = preferNearEl.getBoundingClientRect();
    const dist2 = (b) => {
      const r = b.getBoundingClientRect();
      const cx = r.left + r.width/2, cy = r.top + r.height/2;
      const tx = pr.left + pr.width/2, ty = pr.top + pr.height/2;
      const dx = cx - tx, dy = cy - ty;
      return dx*dx + dy*dy;
    };
    keep = badges.slice().sort((a,b) => dist2(a) - dist2(b))[0] || keep;
  }

  // remove all others
  badges.forEach(b => { if (b !== keep) b.remove(); });

  return keep;
}

function ensureBadgeForProjectListEntry(anchor){
  const chatId = extractChatIdFromHref(anchor.getAttribute('href'));
  if (!chatId) return;

  const leaf = findProjectTitleNode(anchor);
  if (!leaf) return;

  anchor.classList.add('ho-emoji-proj-row');

  // 1) Build/get a stable "title line" wrapper so emoji + text are same line
  // We wrap ONLY the leaf (title) and the badge, not the whole anchor.
  const parent = leaf.parentElement;
  if (!parent) return; // React mid-rerender

  let line = leaf.closest('.ho-emoji-titleline');
  if (!line){
    line = document.createElement('span');
    line.className = 'ho-emoji-titleline';
    parent.insertBefore(line, leaf);
    line.appendChild(leaf);
  }

  // 2) Kill duplicates everywhere inside this anchor (React can re-render)
  keepOnlyOneBadgeAny(anchor);

  // 3) Decide emoji
  const trueTitle = norm(leaf.textContent || '');
  if (!trueTitle) return;

  const existingEdge = getEdgeEmoji(trueTitle);
  if (existingEdge){
    setSavedEmoji(chatId, existingEdge);
    setDone(chatId);
  }

  const plain = stripEdgeEmoji(trueTitle) || trueTitle;
  const saved = getSavedEmoji(chatId);
  const badgeEmoji = existingEdge || saved || DEFAULT_EMOJI;

  // 4) Create/move badge so it lives INSIDE titleline, before the title leaf
  let badge = anchor.querySelector('.ho-emoji-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.className = 'ho-emoji-badge';
  }
  badge.textContent = badgeEmoji;

  // Ensure badge is first in the title line
  if (badge.parentNode !== line) badge.remove();
  if (!line.contains(badge)) line.insertBefore(badge, line.firstChild);

  // 5) Display-only: remove emoji from visible leaf text so you never see double
  const cur = norm(leaf.textContent || '');
  if (getEdgeEmoji(cur)) leaf.textContent = stripEdgeEmoji(cur) || cur;

  // 6) Make clicks on the badge ONLY open picker (fast + no navigation)
  // 6) Bind ONCE (very important)
  if (!badge.dataset.hoEmojiBound){
    badge.dataset.hoEmojiBound = '1';

    const open = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation?.();

      const r = badge.getBoundingClientRect();
      openPicker({ x: r.left, y: r.bottom + 6, chatId, plainTitle: plain, badgeEl: badge });
    };

    badge.addEventListener('pointerdown', open, true);
    badge.addEventListener('dblclick', open, true);
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
    }, true);
  }

}

window.addEventListener(EV_AE_CHANGED_LEG, (e) => {
  try { if (e?.detail?.chatId) MIG_AE_keys(e.detail.chatId); } catch {}
  const chatId = e?.detail?.chatId;
  if (!chatId) return;
  // Force immediate sidebar refresh (title + padding + badge)
  ensureBadgeForChat(chatId);
});

window.addEventListener(EV_AE_CHANGED_CANON, (e) => {
  const chatId = e?.detail?.chatId;
  if (!chatId) return;
  // Force immediate sidebar refresh (title + padding + badge)
  ensureBadgeForChat(chatId);
});



function ensureBadgeForChat(chatId){
  ensureStyle();

  const entry = findSidebarEntry(chatId);
  if (!entry) return;

  entry.classList.add('ho-emoji-row');

  const trueTitle = getTrueTitle(entry);
  if (!trueTitle) return;

  const leaf = findLeafTitleNode(entry);

  const existingEdge = getEdgeEmoji(trueTitle);
  if (existingEdge){
    setSavedEmoji(chatId, existingEdge);
    setDone(chatId);
  }

  const saved = getSavedEmoji(chatId);
  const badgeEmoji = existingEdge || saved || DEFAULT_EMOJI;

  // One badge only (remove duplicates created by rerenders)
  keepOnlyOneBadgeAny(entry, leaf);

  // Badge (create or update)
  let badge = entry.querySelector(':scope .ho-emoji-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.className = 'ho-emoji-badge';
    badge.textContent = badgeEmoji;
    entry.insertBefore(badge, entry.firstChild);
  } else {
    badge.textContent = badgeEmoji;
  }

  // ✅ Bind picker open ONCE (prevents “click many times” + prevents navigation)
  if (!badge.dataset.hoEmojiBound){
    badge.dataset.hoEmojiBound = '1';

    const plain = stripEdgeEmoji(trueTitle) || trueTitle;

    const open = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation?.();

      const r = badge.getBoundingClientRect();
      openPicker({
        x: r.left,
        y: r.bottom + 6,
        chatId,
        plainTitle: plain,
        badgeEl: badge
      });
    };

    // Use capture so we beat React/anchor handlers
    badge.addEventListener('pointerdown', open, true);
    badge.addEventListener('dblclick', open, true);

    // Block normal click behavior on the emoji itself
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
    }, true);

    // Block middle-click opening a new tab when clicking the emoji
    badge.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      open(e);
    }, true);
  }

  // Display-only: remove emoji from visible title so you don't see double
  if (leaf) stripEdgeEmojiFromLeaf(leaf);
  stripLeadingEmojiFromFirstText(entry);
}





function maybeAutoEmojiRename(){

  // ✅ Project list mode (/g/...)
  if (!isInChatView() && isProjectsAreaPage()){
    ensureStyle();
    const anchors = findProjectListAnchors();
    anchors.forEach(a => ensureBadgeForProjectListEntry(a));
    return; // ✅ stay on project list page, no chat logic
  }

  // ✅ Chat view mode (/c/...)
  const chatId = getCurrentChatId();
  if (!chatId) return;

  ensureBadgeForChat(chatId);

  // One-time only
  if (isDone(chatId)) return;

  const entry = findSidebarEntry(chatId);
  if (!entry) return;

  const trueTitle = getTrueTitle(entry);
  if (!trueTitle) return;

  // If title already has emoji -> lock, never auto-change
  if (getEdgeEmoji(trueTitle)){
    setDone(chatId);
    return;
  }

  const plain = stripEdgeEmoji(trueTitle);
  if (!plain || plain.length < MIN_TITLE_LENGTH) return;

  const st = (chatState[chatId] ||= { last:'', stable:0 });
  if (plain === st.last) st.stable++;
  else { st.last = plain; st.stable = 1; }

  if (st.stable < STABLE_RUNS_REQUIRED) return;

  const emoji = pickEmojiForTitle(plain);
  setSavedEmoji(chatId, emoji);
  setDone(chatId);

  const finalTitle = formatTitleWithEmoji(plain, emoji);
  triggerNativeSidebarRename(chatId, finalTitle);

  // badge refresh instantly
  ensureBadgeForChat(chatId);
}


  /**************************************************************
   * Observers
   **************************************************************/
  let t = null;
  function schedule(){
    clearTimeout(t);
    t = setTimeout(maybeAutoEmojiRename, 110);
  }

function init(){
  bindEmojiDblClickOnce();      // sidebar dblclick
  bindProjectEmojiClickOnce();  // project list click

  const mo = new MutationObserver(schedule);
  mo.observe(document.body, { childList:true, subtree:true, characterData:true });

  // ...your routing timer...
  schedule();
}


  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

})();
