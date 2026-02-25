// ==UserScript==
// @name         8b.🔶🗂️ Folders 🗂️ (Prototype v0.4.1 FIX)
// @namespace    H2O.ChatGPT.sidebarFoldersPrototype
// @version      0.5.0
// @description  Folders section independent from Projects + icons always visible + safe observers (no crash).
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // ✅ SPA / double-run guard
  if (window.H2O_FOLDERS_V041_BOOTED) return;
  window.H2O_FOLDERS_V041_BOOTED = true;

  /** -------------------- Config -------------------- **/
  const H2O_ATTR      = 'data-h2o-folders-section';
  const PROJECTS_RE   = /projects/i;
  const FOLDERS_LABEL = 'Folders';

  const KEY_DATA = 'h2o:folders:data:v1'; // { folders:[{id,name,createdAt}], items:{[folderId]:[hrefs]} }
  const KEY_UI   = 'h2o:folders:ui:v1';   // { openFolders:{[folderId]:bool}, foldersExpanded:bool }

  const SEED_FOLDERS = [
    { name: 'Pinned'  },
    { name: 'Study'   },
    { name: 'Case'    },
    { name: 'Dev'     },
    { name: 'Archive' },
  ];

  const DIAG = (window.H2O_FOLDERS_DIAG = window.H2O_FOLDERS_DIAG || {
    bootAt: Date.now(),
    phase: 'boot',
    lastReason: '',
    lastError: null,
    injected: false,
  });

  /** -------------------- Small helpers -------------------- **/
  const uid = () => 'f_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const esc = (s) => (s || '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || ''); } catch { return fallback; }
  }
  function saveJSON(key, obj) {
    localStorage.setItem(key, JSON.stringify(obj));
  }
  function getData() {
    let data = loadJSON(KEY_DATA, null);
    if (!data || typeof data !== 'object') data = { folders: [], items: {} };
    if (!Array.isArray(data.folders)) data.folders = [];
    if (!data.items || typeof data.items !== 'object') data.items = {};
    return data;
  }
  function getUI() {
    let ui = loadJSON(KEY_UI, null);
    if (!ui || typeof ui !== 'object') ui = { openFolders: {}, foldersExpanded: true };
    if (!ui.openFolders || typeof ui.openFolders !== 'object') ui.openFolders = {};
    if (typeof ui.foldersExpanded !== 'boolean') ui.foldersExpanded = true;
    return ui;
  }
  function seedIfEmpty() {
    const data = getData();
    if (data.folders.length) return;

    const folders = SEED_FOLDERS.map(x => ({ id: uid(), name: x.name, createdAt: Date.now() }));
    const items = {};
    folders.forEach(f => (items[f.id] = []));
    saveJSON(KEY_DATA, { folders, items });

    const ui = getUI();
    folders.forEach(f => { ui.openFolders[f.id] = true; });
    saveJSON(KEY_UI, ui);
  }

  /** -------------------- DOM anchors (Projects) -------------------- **/
  function findProjectsH2() {
    const labels = [...document.querySelectorAll('h2.__menu-label')];
    return labels.find(el => PROJECTS_RE.test((el.textContent || '').trim())) || null;
  }

  // ✅ IMPORTANT FIX: do NOT require inner rows (“New project”), because when collapsed they may not exist.
  function findProjectsSection(h2) {
    if (!h2) return null;
    const btn = h2.closest('button');
    if (!btn) return null;

    return (
      btn.closest('div.group\\/sidebar-expando-section') ||
      btn.closest('div[class*="sidebar-expando-section"]') ||
      null
    );
  }

/** -------------------- Styles + always-visible icons -------------------- **/
  const FOLDER_ICON_SVG = `
    <svg class="h2o-folder-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
            fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;
  const ADD_ICON_SVG = `
    <svg class="h2o-folder-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
            fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M12 11v6M9 14h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

/** -------------------- Styles -------------------- **/

function ensureStyle() {
  if (document.getElementById('h2o-folders-style')) return;

  const st = document.createElement('style');
  st.id = 'h2o-folders-style';
  st.textContent = `
/* ===========================
   H2O Folders — Styles (Clean)
   Goal: Projects-like popover + stable icons
   =========================== */

/* --- Icon slot (fix “icon appears only after click”) --- */
.h2o-folder-ico{ width:16px; height:16px; opacity:.9; flex:0 0 auto; }
.h2o-ico-slot{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:20px; height:20px;
  margin-right:8px;
  opacity:1 !important;
  visibility:visible !important;
  flex:0 0 auto;
}

/* --- Shared separator --- */
.h2o-sep{
  height: 1px;
  margin: 6px 8px;
  background: var(--border-default, rgba(255,255,255,.12));
}

/* ===========================
   A) Main folders dropdown menu
   =========================== */
.h2o-folders-menu{
  position:fixed;
  z-index:999999;
  min-width:200px;
  background:rgba(30,30,30,.96);
  border:1px solid rgba(255,255,255,.10);
  border-radius:10px;
  box-shadow:0 12px 30px rgba(0,0,0,.45);
  overflow:hidden;
  backdrop-filter: blur(8px);
}
.h2o-folders-menu button{
  all:unset;
  display:flex;
  width:100%;
  padding:10px 12px;
  cursor:pointer;
  color:rgba(255,255,255,.92);
  font-size:13px;
}
.h2o-folders-menu button:hover{ background:rgba(255,255,255,.08); }
.h2o-folders-menu .h2o-muted{ opacity:.7; padding:10px 12px; font-size:12px; }
.h2o-folders-menu .h2o-sep{ margin:0; }

/* ===========================
   B) Folder row “⋯” button
   =========================== */
.h2o-folder-row{ position:relative; }
.h2o-folder-more{
  all:unset;
  position:absolute;
  right:10px; top:50%;
  transform:translateY(-50%);
  width:28px; height:28px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:8px;
  cursor:pointer;
  color:rgba(255,255,255,.85);
  opacity:0;
}
.h2o-folder-row:hover .h2o-folder-more,
.h2o-folder-row:focus-within .h2o-folder-more{ opacity:1; }
.h2o-folder-more:hover{ background:rgba(255,255,255,.08); }
.h2o-folder-more:active{ background:rgba(255,255,255,.10); }

/* ===========================
   C) Popover (Rename / Delete)
   IMPORTANT: items are .h2o-pop-item
   (so DO NOT style ".h2o-folder-pop button" globally)
   =========================== */
.h2o-folder-pop{
  position:fixed;
  z-index:999999;
  padding:6px;
  min-width:210px;
  background: var(--bg-elevated-secondary, #181818);
  border: 1px solid var(--border-default, #ffffff26);
  border-radius:12px;
  box-shadow: var(--shadow-lg, 0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a);
  backdrop-filter: blur(var(--blur-sm, 8px));
  overflow:hidden;
}

.h2o-pop-item{
  all:unset;
  display:flex;
  align-items:center;
  gap:10px;
  width:100%;
  padding:10px 12px;
  border-radius:10px;
  cursor:pointer;
  color: var(--text-primary, #fff);
  font-size: var(--text-sm, .875rem);
  line-height: 1;
}
.h2o-pop-item:hover{ background: var(--interactive-bg-secondary-hover, #ffffff1a); }
.h2o-pop-item:active{ background: var(--interactive-bg-secondary-press, #ffffff0d); }
.h2o-pop-item.is-danger{ color: var(--text-error, #f93a37); }

.h2o-pop-ico{
  width:20px; height:20px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color: currentColor;
}
.h2o-pop-ico svg{
  width:20px; height:20px;
  fill: currentColor;
}

/* ===========================
   D) Modal (Create / Rename)
   =========================== */
.h2o-modal-overlay{
  position:fixed; inset:0;
  z-index:999999;
  background:rgba(0,0,0,.55);
  display:flex;
  align-items:flex-start;
  justify-content:center;
  padding-top:90px;
}

.h2o-modal{
  width:min(560px, calc(100vw - 32px));
  background:rgba(32,32,32,.98);
  border:1px solid rgba(255,255,255,.12);
  border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.6);
  overflow:hidden;
}

.h2o-modal-hd{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:14px 16px;
}
.h2o-modal-title{ font-size:14px; font-weight:600; opacity:.95; }

.h2o-modal-x{
  all:unset;
  width:30px; height:30px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:10px;
  cursor:pointer;
  opacity:.9;
}
.h2o-modal-x:hover{ background:rgba(255,255,255,.08); }

.h2o-modal-bd{ padding:0 16px 16px; }
.h2o-modal-input{
  width:100%;
  margin-top:6px;
  padding:12px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(18,18,18,.8);
  color:rgba(255,255,255,.92);
  outline:none;
}

.h2o-modal-ft{
  display:flex;
  justify-content:flex-end;
  gap:10px;
  padding:12px 16px 16px;
}
.h2o-btn{
  all:unset;
  padding:10px 14px;
  border-radius:12px;
  cursor:pointer;
  font-size:13px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  color:rgba(255,255,255,.92);
}
.h2o-btn:hover{ background:rgba(255,255,255,.10); }
.h2o-btn-primary{ background:rgba(255,255,255,.12); }
.h2o-btn-primary[disabled]{ opacity:.4; cursor:not-allowed; }
  `;

  document.documentElement.appendChild(st);
}


/** -------------------- Helpers -------------------- **/

  let H2O_folderPopEl = null;

function closeFolderPop() {
  if (H2O_folderPopEl) H2O_folderPopEl.remove();
  H2O_folderPopEl = null;
}

function openFolderPop(anchorEl, items) {
  ensureStyle();
  closeFolderPop();

  const pop = document.createElement('div');
  pop.className = 'h2o-folder-pop';

  items.forEach((it) => {
    if (it === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'h2o-sep';
      pop.appendChild(sep);
      return;
    }

    const b = document.createElement('button');
    b.type = 'button';

    // ✅ menu item styling (your CSS)
    b.className = 'h2o-pop-item' + (it.danger ? ' is-danger' : '');

    // ✅ optional icon support (either iconEl Node OR iconSvg string)
    if (it.iconEl) {
      const ico = document.createElement('span');
      ico.className = 'h2o-pop-ico';
      ico.appendChild(it.iconEl.cloneNode(true));
      b.appendChild(ico);
    } else if (it.iconSvg) {
      const ico = document.createElement('span');
      ico.className = 'h2o-pop-ico';
      ico.innerHTML = it.iconSvg; // must be a trusted string you control
      b.appendChild(ico);
    }

    const label = document.createElement('span');
    label.className = 'h2o-pop-label';
    label.textContent = it.label || '';
    b.appendChild(label);

    b.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeFolderPop();
      it.onClick?.();
    };

    pop.appendChild(b);
  });

  document.body.appendChild(pop);
  H2O_folderPopEl = pop;

  const pad = 8;
  const rA = anchorEl.getBoundingClientRect();
  const rP = pop.getBoundingClientRect();

  let left = Math.min(rA.right - rP.width, innerWidth - rP.width - pad);
  let top  = Math.min(rA.bottom + 6, innerHeight - rP.height - pad);
  left = Math.max(pad, left);
  top  = Math.max(pad, top);

  pop.style.left = left + 'px';
  pop.style.top  = top + 'px';

  setTimeout(() => {
    const onDoc = (e) => {
      if (!H2O_folderPopEl) return;
      if (!H2O_folderPopEl.contains(e.target)) closeFolderPop();
      document.removeEventListener('mousedown', onDoc, true);
    };
    document.addEventListener('mousedown', onDoc, true);
  }, 0);
}


/** --------------------  -------------------- **/

function openNameModal({ title, placeholder, initialValue, confirmText }) {
  ensureStyle();
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'h2o-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'h2o-modal';

    const hd = document.createElement('div');
    hd.className = 'h2o-modal-hd';

    const t = document.createElement('div');
    t.className = 'h2o-modal-title';
    t.textContent = title;

    const x = document.createElement('button');
    x.className = 'h2o-modal-x';
    x.textContent = '×';

    hd.appendChild(t);
    hd.appendChild(x);

    const bd = document.createElement('div');
    bd.className = 'h2o-modal-bd';

    const input = document.createElement('input');
    input.className = 'h2o-modal-input';
    input.placeholder = placeholder || '';
    input.value = initialValue || '';
    bd.appendChild(input);

    const ft = document.createElement('div');
    ft.className = 'h2o-modal-ft';

    const cancel = document.createElement('button');
    cancel.className = 'h2o-btn';
    cancel.textContent = 'Cancel';

    const ok = document.createElement('button');
    ok.className = 'h2o-btn h2o-btn-primary';
    ok.textContent = confirmText || 'OK';

    const sync = () => {
      ok.disabled = !input.value.trim();
    };
    sync();

    ft.appendChild(cancel);
    ft.appendChild(ok);

    modal.appendChild(hd);
    modal.appendChild(bd);
    modal.appendChild(ft);
    ov.appendChild(modal);
    document.body.appendChild(ov);

    const done = (v) => {
      ov.remove();
      resolve(v);
    };

    x.onclick = () => done(null);
    cancel.onclick = () => done(null);
    ok.onclick = () => done(input.value.trim() || null);

    ov.addEventListener('mousedown', (e) => {
      if (e.target === ov) done(null);
    });

    input.addEventListener('input', sync);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!ok.disabled) ok.click();
      }
    });

    setTimeout(() => input.focus(), 0);
  });
}

  /** --------------------  -------------------- **/


  /** -------------------- ✅ Folders "See more / See less" (ChatGPT sidebar) -------------------- **/

const FOLDERS_LIMIT = 7;
const KEY_FOLDERS_EXP = 'h2o:folders:expanded';

// Clone *Projects* "See more" row for pixel-perfect alignment
function getProjectsSeeMoreRow() {
  const t = [...document.querySelectorAll('nav .__menu-item .truncate')]
    .find(n => (n.textContent || '').trim() === 'See more');
  return t?.closest('.__menu-item') || null;
}

function applyFoldersSeeMore(listWrap) {
  if (!listWrap) return;

  // remove old
  listWrap.querySelectorAll('[data-h2o-folders-see-more]').forEach(n => n.remove());

  const folderRows = [...listWrap.querySelectorAll(':scope > .h2o-folder-row')]; // ✅ your rows
  if (folderRows.length <= FOLDERS_LIMIT) {
    folderRows.forEach(r => (r.style.display = ''));
    return;
  }

  const expanded = localStorage.getItem(KEY_FOLDERS_EXP) === '1';

  folderRows.forEach((r, i) => {
    r.style.display = (expanded || i < FOLDERS_LIMIT) ? '' : 'none';
  });

  const tpl = getProjectsSeeMoreRow();
  const row = tpl ? tpl.cloneNode(true) : document.createElement('div');

  if (!tpl) {
    row.className = 'group __menu-item hoverable gap-1.5';
    row.innerHTML = `
      <div class="flex items-center justify-center icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon">
          <path fill="currentColor" d="M4 8h12v2H4zm0 4h12v2H4z"/>
        </svg>
      </div>
      <div class="flex min-w-0 grow items-center gap-2.5"><div class="truncate"></div></div>
    `;
  }

  row.setAttribute('data-h2o-folders-see-more', '1');
  row.tabIndex = 0;

  const trunc = row.querySelector('.truncate');
  if (trunc) trunc.textContent = expanded ? 'See less' : 'See more';

  row.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    localStorage.setItem(KEY_FOLDERS_EXP, expanded ? '0' : '1');
    applyFoldersSeeMore(listWrap);
  };

  listWrap.appendChild(row);
}



/** -------------------- Build Folders section (independent) -------------------- **/
function buildFoldersSection(projectsSection) {
  const section = document.createElement('div');
  section.className = projectsSection.className;
  section.setAttribute(H2O_ATTR, '1');

  // --- header clone (Projects-like) ---
  const projectsHeaderBtn =
    projectsSection.querySelector(':scope > button') ||
    projectsSection.querySelector('button');

  if (!projectsHeaderBtn) return null;

  const headerBtn = projectsHeaderBtn.cloneNode(true);

  // Strip linkage to Projects (so toggles don't affect each other)
  headerBtn.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  headerBtn.removeAttribute('aria-controls');

  // Rename label
  const label = headerBtn.querySelector('h2.__menu-label');
  if (label) label.textContent = FOLDERS_LABEL;

  // Container that holds all rows
  const listWrap = document.createElement('div');

  // --- row template (use sidebar item if exists) ---
  const tplDiv = document.querySelector('nav div.__menu-item') || document.querySelector('div.__menu-item') || null;
  const tplA   = document.querySelector('nav a.__menu-item[href]') || document.querySelector('a.__menu-item[href]') || null;

  const FALLBACK_ROW_CLASS = (tplDiv?.className || tplA?.className || 'group __menu-item hoverable');

  // Build a “ChatGPT-like” row shell (safe even if templates missing)
  function makeRowShell(tagName = 'div') {
    const tag = (tagName || 'div').toLowerCase();
    let row;

    // Prefer cloning to inherit exact spacing/layout
    const tpl = (tag === 'a' ? tplA : tplDiv) || tplA || tplDiv;

    if (tpl) {
      row = tpl.cloneNode(true);

      // sanitize
      row.querySelectorAll?.('[id]')?.forEach(el => el.removeAttribute('id'));
      row.removeAttribute?.('draggable');
      row.removeAttribute?.('data-discover');
      row.removeAttribute?.('data-testid');

      // Remove trailing options/buttons from cloned chat items
      row.querySelectorAll?.('.trailing-pair')?.forEach(n => n.remove());
      row.querySelectorAll?.('button[data-testid], button[aria-label], button[data-trailing-button]')?.forEach(n => n.remove());

      // Ensure it behaves like our control (not navigation)
      if (row.tagName === 'A') row.setAttribute('href', '#');
      row.tabIndex = 0;

      return row;
    }

    // Fallback: construct a minimal row that matches the common sidebar structure
    row = document.createElement(tag);
    row.className = FALLBACK_ROW_CLASS;
    if (tag === 'a') row.setAttribute('href', '#');
    row.tabIndex = 0;
    row.innerHTML = `
      <div class="flex min-w-0 grow items-center gap-2.5">
        <div class="truncate"></div>
      </div>
    `;
    return row;
  }

  function setRowText(rowEl, text) {
    const trunc =
      rowEl.querySelector?.('.truncate') ||
      rowEl.querySelector?.('[class*="truncate"]');

    if (trunc) trunc.textContent = text;
    else rowEl.textContent = text;
  }

  function injectIcon(rowEl, svg) {
    if (!svg) return;
    if (rowEl.querySelector('.h2o-ico-slot')) return;

    const slot = document.createElement('span');
    slot.className = 'h2o-ico-slot';
    slot.innerHTML = svg;

    const trunc =
      rowEl.querySelector?.('.truncate') ||
      rowEl.querySelector?.('[class*="truncate"]');

    if (trunc && trunc.parentElement) trunc.parentElement.insertBefore(slot, trunc);
    else rowEl.insertBefore(slot, rowEl.firstChild);
  }

  function wireAsButton(rowEl, onClick) {
    rowEl.setAttribute('role', 'button');
    rowEl.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      onClick?.();
    };
    rowEl.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    };
    return rowEl;
  }

  function makeActionRow(text, iconSvg, onClick) {
    const row = makeRowShell('div');
    setRowText(row, text);
    injectIcon(row, iconSvg);
    return wireAsButton(row, onClick);
  }

  function makeFolderRow(text, iconSvg, onClick) {
    const row = makeRowShell('a');
    setRowText(row, text);
    injectIcon(row, iconSvg);
    return wireAsButton(row, onClick);
  }

  function makeSubChatRow(href, text) {
    const a = makeRowShell('a');
    a.setAttribute('href', href);
    a.setAttribute('role', 'link');
    a.classList.add('ps-9');
    setRowText(a, text);
    return a;
  }

  // --- helpers for titles ---
  const normText = (s) => (s || '').trim().replace(/\s+/g, ' ');
  const parseChatIdFromHref = (href) => {
    const m = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  };
  const findChatTitleInSidebarByHref = (fullHref) => {
    const anchors = document.querySelectorAll('a.__menu-item[href]');
    for (const a of anchors) {
      if ((a.getAttribute('href') || '') === fullHref) {
        const t = normText(a.innerText);
        if (t) return t;
      }
    }
    const chatId = parseChatIdFromHref(fullHref);
    if (chatId) {
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (href.endsWith(`/c/${chatId}`)) {
          const t = normText(a.innerText);
          if (t) return t;
        }
      }
    }
    return null;
  };

  // --- independent expand/collapse state (Folders header only) ---
  let expanded = getUI().foldersExpanded;

  function applyExpandedToDOM() {
    headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    listWrap.style.display = expanded ? '' : 'none';
  }

  function setExpanded(v) {
    expanded = !!v;
    const ui = getUI();
    ui.foldersExpanded = expanded;
    saveJSON(KEY_UI, ui);
    applyExpandedToDOM();
  }

  headerBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(!expanded);
  };

  // --- See more/less (groups only) ---
  const KEY_SEE_MORE = 'h2o:folders:seeMoreExpanded:v1';
  const SEE_MORE_LIMIT = 7;

  const MORE_ICON_SVG = `
    <svg class="h2o-folder-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 10h12M6 14h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  function applySeeMoreControl() {
    // Remove previous control row
    listWrap.querySelectorAll(':scope > .h2o-folders-see-more').forEach(n => n.remove());

    const groups = [...listWrap.querySelectorAll(':scope > .h2o-folder-group')];
    if (groups.length <= SEE_MORE_LIMIT) {
      groups.forEach(g => (g.style.display = 'contents'));
      return;
    }

    const expandedList = localStorage.getItem(KEY_SEE_MORE) === '1';

    groups.forEach((g, i) => {
      g.style.display = (expandedList || i < SEE_MORE_LIMIT) ? 'contents' : 'none';
    });

    const row = makeActionRow(expandedList ? 'See less' : 'See more', MORE_ICON_SVG, () => {
      localStorage.setItem(KEY_SEE_MORE, expandedList ? '0' : '1');
      applySeeMoreControl();
    });

    row.classList.add('h2o-folders-see-more');
    listWrap.appendChild(row);
  }

  // --- render ---
  function render() {
    const data = getData();
    const ui   = getUI();

    listWrap.innerHTML = '';

    // New folder (always visible, never part of a group)
    listWrap.appendChild(makeActionRow('New folder', ADD_ICON_SVG, async () => {
      const name = await openNameModal({
        title: 'Create folder',
        placeholder: 'Folder name',
        initialValue: '',
        confirmText: 'Create folder'
      });
      if (!name) return;

      const d = getData();
      const exists = d.folders.some(f => (f.name || '').trim().toLowerCase() === name.toLowerCase());
      if (exists) return alert('Folder already exists.');

      const id = uid();
      d.folders.push({ id, name, createdAt: Date.now() });
      d.items[id] = d.items[id] || [];
      saveJSON(KEY_DATA, d);

      const u = getUI();
      u.openFolders[id] = true;
      saveJSON(KEY_UI, u);

      render();
    }));

    // Folder groups (each folder + its subchats = ONE hideable unit)
    data.folders.forEach(folder => {
      const isOpen = !!ui.openFolders[folder.id];
      const hrefs  = Array.isArray(data.items[folder.id]) ? data.items[folder.id] : [];

      // group wrapper (display: contents => no visual box, but hide/show works)
      const grp = document.createElement('div');
      grp.className = 'h2o-folder-group';
      grp.style.display = 'contents';

      const row = makeFolderRow(folder.name, FOLDER_ICON_SVG, () => {
        const u = getUI();
        u.openFolders[folder.id] = !u.openFolders[folder.id];
        saveJSON(KEY_UI, u);
        render();
      });

      row.classList.add('h2o-folder-row');

      // More button (absolute, hover-only via your CSS)
      const more = document.createElement('button');
      more.className = 'h2o-folder-more';
      more.type = 'button';
      more.textContent = '⋯';
      more.title = 'Folder actions';

      more.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        openFolderPop(more, [
          {
            label: 'Rename folder',
            onClick: async () => {
              const next = await openNameModal({
                title: 'Rename folder',
                placeholder: 'Folder name',
                initialValue: folder.name || '',
                confirmText: 'Rename'
              });
              if (!next) return;

              const d = getData();
              const exists = d.folders.some(f =>
                f.id !== folder.id && (f.name || '').trim().toLowerCase() === next.toLowerCase()
              );
              if (exists) return alert('Folder already exists.');

              const target = d.folders.find(f => f.id === folder.id);
              if (target) target.name = next;
              saveJSON(KEY_DATA, d);
              render();
            }
          },
          'sep',
          {
            label: 'Delete folder',
            onClick: () => {
              const ok = confirm(`Delete folder "${folder.name}"?`);
              if (!ok) return;

              const d = getData();
              d.folders = d.folders.filter(f => f.id !== folder.id);
              delete d.items[folder.id];
              saveJSON(KEY_DATA, d);

              const u = getUI();
              delete u.openFolders[folder.id];
              saveJSON(KEY_UI, u);

              render();
            }
          }
        ]);
      };

      row.appendChild(more);

      // Count badge
      const trunc = row.querySelector?.('.truncate') || row.querySelector?.('[class*="truncate"]');
      if (trunc) {
        const span = document.createElement('span');
        span.style.opacity = '.6';
        span.style.marginLeft = '8px';
        span.style.fontSize = '12px';
        span.textContent = `(${hrefs.length})`;
        trunc.parentElement?.appendChild(span);
      }

      grp.appendChild(row);

      // Subchats
      if (isOpen) {
        hrefs.forEach(fullHref => {
          const title = findChatTitleInSidebarByHref(fullHref);
          const fallbackId = parseChatIdFromHref(fullHref);
          const label = title ? title : (fallbackId || fullHref);
          grp.appendChild(makeSubChatRow(fullHref, label));
        });
      }

      listWrap.appendChild(grp);
    });

    // Inject See more/less AFTER all groups exist
    applySeeMoreControl();

    // Apply header collapse state without rewriting storage again
    applyExpandedToDOM();
  }

  // Mount
  section.appendChild(headerBtn);
  section.appendChild(listWrap);

  render();
  section._h2oRender = render;

  applyExpandedToDOM();
  return section;
}


  /** -------------------- Shift+Right-Click menu -------------------- **/
  let H2O_foldersMenuEl = null;

  function closeMenu() {
    if (H2O_foldersMenuEl) H2O_foldersMenuEl.remove();
    H2O_foldersMenuEl = null;
  }

  function openAssignMenu(x, y, fullHref) {
    ensureStyle();
    closeMenu();

    if (!getData().folders.length) seedIfEmpty();
    const d = getData();

    const m = document.createElement('div');
    m.className = 'h2o-folders-menu';

    const head = document.createElement('div');
    head.className = 'h2o-muted';
    head.textContent = 'Add/Remove chat in folders';
    m.appendChild(head);

    const sep = document.createElement('div');
    sep.className = 'h2o-sep';
    m.appendChild(sep);

    d.folders.forEach(f => {
      const arr = Array.isArray(d.items[f.id]) ? d.items[f.id] : [];
      const inFolder = arr.includes(fullHref);

      const btn = document.createElement('button');
      btn.innerHTML = `${esc(f.name)} <span style="margin-left:auto;opacity:.7;">${inFolder ? '✓' : ''}</span>`;

      btn.onclick = () => {
        const dd = getData();
        dd.items[f.id] = Array.isArray(dd.items[f.id]) ? dd.items[f.id] : [];
        const list = dd.items[f.id];

btn.onclick = () => {
  const dd = getData();

  // ✅ remove from ALL folders first (one-folder max)
  for (const fid of Object.keys(dd.items || {})) {
    dd.items[fid] = (dd.items[fid] || []).filter(h => h !== fullHref);
  }

  // ✅ if it was NOT in this folder, assign it to this folder
  if (!inFolder) {
    dd.items[f.id] = Array.isArray(dd.items[f.id]) ? dd.items[f.id] : [];
    dd.items[f.id].push(fullHref);
    dd.items[f.id] = [...new Set(dd.items[f.id])];
  }

  saveJSON(KEY_DATA, dd);

  closeMenu();
  document.querySelectorAll(`[${H2O_ATTR}]`).forEach(sec => sec._h2oRender?.());
};


        dd.items[f.id] = [...new Set(list)];
        saveJSON(KEY_DATA, dd);

        closeMenu();
        document.querySelectorAll(`[${H2O_ATTR}]`).forEach(sec => sec._h2oRender?.());
      };

      m.appendChild(btn);
    });

    document.body.appendChild(m);
    H2O_foldersMenuEl = m;

    // position
    const pad = 8;
    const r = m.getBoundingClientRect();
    let left = x, top = y;
    if (left + r.width > innerWidth - pad) left = innerWidth - r.width - pad;
    if (top + r.height > innerHeight - pad) top = innerHeight - r.height - pad;
    m.style.left = left + 'px';
    m.style.top  = top + 'px';

    setTimeout(() => {
      const onDoc = (e) => {
        if (!H2O_foldersMenuEl) return;
        if (!H2O_foldersMenuEl.contains(e.target)) closeMenu();
        document.removeEventListener('mousedown', onDoc, true);
      };
      document.addEventListener('mousedown', onDoc, true);
    }, 0);
  }

  function hookChatContextMenuOnce() {
    if (window.H2O_FOLDERS_CTX_HOOKED) return;
    window.H2O_FOLDERS_CTX_HOOKED = true;

    document.addEventListener('contextmenu', (e) => {
      if (!e.shiftKey) return;

      const a = e.target?.closest?.('a.__menu-item[href*="/c/"]');
      if (!a) return;

      const href = a.getAttribute('href') || '';
      if (href.endsWith('/project')) return;
      if (!/\/c\/[a-z0-9-]+/i.test(href)) return;

      e.preventDefault();
      e.stopPropagation();
      openAssignMenu(e.clientX, e.clientY, href);
    }, true);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    }, true);
  }

/** -------------------- ✅ Inject "Add to Folder" into 3-dots menu (debug + robust) -------------------- **/
const H2O_DEBUG_MENU = true; // flip false later
window.H2O_LAST_CHAT_HREF_FOR_MENU = '';

function H2O_dbg(...args) {
  if (!H2O_DEBUG_MENU) return;
  console.log('[H2O.Folders.Menu]', ...args);
}

function H2O_rerenderFolders() {
  document.querySelectorAll(`[${H2O_ATTR}]`).forEach(sec => sec._h2oRender?.());
}

// 1) Capture which chat the "..." menu belongs to
document.addEventListener('pointerdown', (e) => {
  const btn =
    e.target?.closest?.(
      'button.__menu-item-trailing-btn,' +
      'button[data-testid*="history-item"][data-testid$="options"],' +
      'button[data-testid$="options"],' +
      'button[aria-label*="conversation options"],' +
      'button[aria-label*="Open conversation options"]'
    );

  if (!btn) return;

  // ✅ more robust than requiring .__menu-item
  const a = btn.closest('a[href*="/c/"]');
  if (!a) {
    H2O_dbg('capture: no anchor found for options btn', btn);
    return;
  }

  window.H2O_LAST_CHAT_HREF_FOR_MENU = a.getAttribute('href') || '';

  console.log('[H2O.Menu] captured:', window.H2O_LAST_CHAT_HREF_FOR_MENU); // ✅ LOG #1

  H2O_dbg('captured href', window.H2O_LAST_CHAT_HREF_FOR_MENU);
}, true);


// 2) When the Radix menu appears, inject our item
function H2O_findMenuItemByText(menuEl, re) {
  const items = [...menuEl.querySelectorAll('[role="menuitem"]')];
  return items.find(it => re.test((it.textContent || '').trim())) || null;
}

function H2O_setMenuItemLabel(menuItemEl, newText) {
  // ✅ Replace ONLY the label text node, keep icon + chevron intact
  const tw = document.createTreeWalker(menuItemEl, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    const t = (n.nodeValue || '').trim();
    if (!t) continue;
    if (/move to project/i.test(t) || /add to folder/i.test(t)) {
      n.nodeValue = newText;
      return;
    }
  }

  // Fallback (rare): try known label holders
  const el = menuItemEl.querySelector('.truncate,[class*="truncate"]');
  if (el) el.textContent = newText;
}


function H2O_injectAddToFolder(menuEl) {
  if (!menuEl) return;

  if (!window.H2O_LAST_CHAT_HREF_FOR_MENU) {
  const a = document.querySelector('a[aria-current="page"][href*="/c/"]');
  if (a) window.H2O_LAST_CHAT_HREF_FOR_MENU = a.getAttribute('href') || '';
}

  if (menuEl.querySelector('[data-h2o-add-to-folder="1"]')) return;

  console.log('[H2O.Menu] menu seen:', (menuEl.innerText || '').slice(0,120)); // ✅ LOG #2

  const moveItem = H2O_findMenuItemByText(menuEl, /move to project/i);

  console.log('[H2O.Menu] moveItem?', !!moveItem); // ✅ LOG #3

  if (!moveItem) {
    H2O_dbg('menu found but no "Move to project"', {
      href: window.H2O_LAST_CHAT_HREF_FOR_MENU,
      items: [...menuEl.querySelectorAll('[role="menuitem"]')].map(x => (x.textContent || '').trim())
    });
    return;
  }

  const href = window.H2O_LAST_CHAT_HREF_FOR_MENU;
  if (!href) {
    H2O_dbg('inject: href empty (capture failed)');
    return;
  }

  // Clone "Move to project" for perfect styling
  const addItem = moveItem.cloneNode(true);
  addItem.setAttribute('data-h2o-add-to-folder', '1');
  H2O_setMenuItemLabel(addItem, 'Add to Folder');

  addItem.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const r = addItem.getBoundingClientRect();
    H2O_dbg('clicked Add to Folder', { href });

    openAssignMenu(r.right + 6, Math.max(8, r.top - 8), href);
  }, true);

  moveItem.parentNode.insertBefore(addItem, moveItem.nextSibling);
  H2O_dbg('✅ injected Add to Folder', { href });
}

// Observe menus appearing (Radix portals)
const H2O_menuMO = new MutationObserver((muts) => {
  for (const mu of muts) {
    for (const node of mu.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const menus = [];
if (node.getAttribute?.('role') === 'menu') menus.push(node);
else if (node.querySelectorAll) menus.push(...node.querySelectorAll('[role="menu"]'));
if (!menus.length) continue;

for (const menu of menus) {
  requestAnimationFrame(() => {
    const txt = (menu.innerText || '');
    if (/move to project/i.test(txt) || /pin chat/i.test(txt) || /archive/i.test(txt) || /delete/i.test(txt)) {
      H2O_dbg('menu appeared', { capturedHref: window.H2O_LAST_CHAT_HREF_FOR_MENU, preview: txt.slice(0, 140) });
      H2O_injectAddToFolder(menu);
    }
  });
}


      // ✅ wait 1 frame so Radix finishes populating text/items
      requestAnimationFrame(() => {
        const txt = (node.innerText || '');
        if (/move to project/i.test(txt) || /pin chat/i.test(txt) || /archive/i.test(txt) || /delete/i.test(txt)) {
          H2O_dbg('menu appeared', { capturedHref: window.H2O_LAST_CHAT_HREF_FOR_MENU, preview: txt.slice(0, 140) });
          H2O_injectAddToFolder(node);
        }
      });
    }
  }
});

H2O_menuMO.observe(document.body, { childList: true, subtree: true });


  /** -------------------- minimal viewer (works even before you build a full sidebar section) -------------------- **/
const H2O_FOLDERS_STORE_KEY = 'h2o:folders:v1';

function H2O_loadFoldersStore() {
  try { return JSON.parse(localStorage.getItem(H2O_FOLDERS_STORE_KEY) || '{}'); }
  catch { return {}; }
}

// Expected store shape (example):
// { folders:[{id,name}], chatToFolders:{ "/c/abc":[ "f1","f2" ] } }

function H2O_getChatTitleFromSidebar(href) {
  const a = document.querySelector(`a[href="${CSS.escape(href)}"]`);
  return (a?.innerText || href).trim().slice(0, 80);
}

function H2O_openFolderViewer(folderId) {
  const store = H2O_loadFoldersStore();
  const folders = store.folders || [];
  const chatToFolders = store.chatToFolders || {};

  const folder = folders.find(f => f.id === folderId);
  const title = folder ? folder.name : folderId;

  const chats = Object.entries(chatToFolders)
    .filter(([href, ids]) => Array.isArray(ids) && ids.includes(folderId))
    .map(([href]) => ({ href, title: H2O_getChatTitleFromSidebar(href) }));

  // kill old
  document.querySelectorAll('.h2o-folder-viewer').forEach(x => x.remove());

  const box = document.createElement('div');
  box.className = 'h2o-folder-viewer';
  box.innerHTML = `
    <div class="h2o-fv-head">
      <div class="h2o-fv-title">Folder: <b>${title}</b> (${chats.length})</div>
      <button class="h2o-fv-close" type="button">✕</button>
    </div>
    <div class="h2o-fv-list"></div>
  `;
  const list = box.querySelector('.h2o-fv-list');
  chats.forEach(c => {
    const row = document.createElement('a');
    row.href = c.href;
    row.className = 'h2o-fv-row';
    row.textContent = c.title;
    list.appendChild(row);
  });

  box.querySelector('.h2o-fv-close').onclick = () => box.remove();
  document.body.appendChild(box);
}

(function H2O_folderViewerCSS(){
  if (document.getElementById('h2o-folder-viewer-css')) return;
  const s = document.createElement('style');
  s.id = 'h2o-folder-viewer-css';
  s.textContent = `
    .h2o-folder-viewer{
      position: fixed; right: 18px; top: 90px; z-index: 999999;
      width: 360px; max-height: 60vh; overflow: hidden;
      background: rgba(20,20,20,.92); color: #fff;
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 14px; backdrop-filter: blur(10px);
      box-shadow: 0 18px 60px rgba(0,0,0,.45);
      font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial;
    }
    .h2o-fv-head{ display:flex; align-items:center; justify-content:space-between; padding: 10px 12px; }
    .h2o-fv-close{ border:0; background: transparent; color:#fff; cursor:pointer; font-size: 14px; opacity:.8; }
    .h2o-fv-close:hover{ opacity:1; }
    .h2o-fv-list{ padding: 6px 8px 10px; max-height: calc(60vh - 48px); overflow:auto; }
    .h2o-fv-row{ display:block; padding: 8px 10px; border-radius: 10px; color: inherit; text-decoration:none; }
    .h2o-fv-row:hover{ background: rgba(255,255,255,.08); }
  `;
  document.documentElement.appendChild(s);
})();


  /** -------------------- Injection lifecycle (safe) -------------------- **/
  let building = false;
  let tEnsure = 0;
  let suppressMO = false;
  let observedRoot = null;
  let mo = null;

  function pickSidebarRoot(fromEl) {
    return fromEl?.closest?.('nav') || fromEl?.closest?.('aside') || fromEl?.parentElement || document.body;
  }

  function ensureObserver(root) {
    if (observedRoot === root) return;
    if (mo) mo.disconnect();
    observedRoot = root;

    mo = new MutationObserver((muts) => {
      if (suppressMO) return;

      // Ignore mutations coming from our own UI or the menu
      const relevant = muts.some(mu => {
        const t = mu.target;
        return !(t instanceof HTMLElement) || !t.closest?.(`[${H2O_ATTR}], .h2o-folders-menu`);
      });
      if (!relevant) return;

      scheduleEnsure('mutation');
    });

    mo.observe(root, { childList: true, subtree: true });
  }

  function ensureInjected(reason='') {
    DIAG.lastReason = reason;
    if (building) return;

    const h2 = findProjectsH2();
    if (!h2) return;

    const projectsSection = findProjectsSection(h2);
    if (!projectsSection || !projectsSection.parentElement) return;

    ensureObserver(pickSidebarRoot(projectsSection));

    const parent = projectsSection.parentElement;

    // Already correct placement?
    const existing = parent.querySelector(`:scope > [${H2O_ATTR}]`);
    if (existing && projectsSection.previousElementSibling === existing) {
      DIAG.injected = true;
      DIAG.phase = 'already-ok';
      return;
    }

    building = true;
    suppressMO = true;
    try {
      // remove stale (only within this parent)
      parent.querySelectorAll(`:scope > [${H2O_ATTR}]`).forEach(n => n.remove());

      seedIfEmpty();

      const folders = buildFoldersSection(projectsSection);
      if (!folders) return;

      parent.insertBefore(folders, projectsSection);

      DIAG.injected = true;
      DIAG.phase = 'injected';
    } finally {
      suppressMO = false;
      building = false;
    }
  }

  function scheduleEnsure(reason='') {
    clearTimeout(tEnsure);
    tEnsure = setTimeout(() => ensureInjected(reason), 150);
  }

  // boot
  try {
    ensureStyle();
    hookChatContextMenuOnce();
    ensureInjected('boot');
  } catch (e) {
    DIAG.lastError = String(e?.stack || e);
    DIAG.phase = 'error-boot';
    console.error('[H2O.Folders] boot error:', e);
  }

  // short retry window (React late-mount)
  let tries = 0;
  const retry = setInterval(() => {
    tries++;
    ensureInjected('interval');
    if (DIAG.injected || tries >= 12) clearInterval(retry);
  }, 800);

})();
