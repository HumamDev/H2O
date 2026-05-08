// ==UserScript==
// @h2o-id             9c1a.title.under.input.bar
// @name               9C1a.🟤📌 Title Under Input bar 📌
// @namespace          H2O.Premium.CGX.title.under.input.bar
// @author             HumamDev
// @version            3.0.0
// @revision           001
// @build              260506-000000
// @description        Under-input chat title renderer and explicit rename UI for H2O.ChatTitle.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(function () {
  'use strict';

  const W = window;
  const D = document;
  const BOOT_KEYS = [
    '__h2oTitleUnderInputRuntime_v3',
    '__h2oTitleUnderInputRuntime_v4',
  ];
  const BOOT_KEY = BOOT_KEYS[BOOT_KEYS.length - 1];
  BOOT_KEYS.forEach((key) => {
    try { W[key]?.destroy?.(); } catch {}
  });

  let labelEl = null;
  let shownTitle = '';
  let shownProjectKey = '';
  let baseTitle = '';
  let isEditing = false;
  let menuEl = null;
  let menuCleanup = [];
  let unsubscribe = null;
  let attachTimer = 0;
  let refreshTimer = 0;
  let bodyObserver = null;
  const cleanups = new Set();

  const STYLE_ID = 'ho-title-under-input-style-v3';
  const RUNTIME_MARK = 'v6-hide-new-chat';
  const CSS = `
    .ho-sidebar-ring {
      border-radius: 8px;
      box-shadow:
        inset 0 0 0 1px rgba(255, 213, 74, 0.35),
        0 0 3px rgba(255, 213, 74, 0.12);
      transition: box-shadow 0.2s ease;
    }

    .ho-tab-title-under-input {
      font-size: 12px;
      opacity: 0.85;
      margin-top: 0;
      text-align: center;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      gap: 7px;
      min-width: 0;
      max-width: min(88vw, 760px);
      padding: 4px 7px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      background: linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025));
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.08),
        0 4px 12px rgba(0,0,0,0.16);
      color: rgba(255,255,255,0.88);
      font-weight: 600;
      transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    }

    .ho-tab-title-under-input:hover {
      opacity: 0.96;
      border-color: rgba(255,255,255,0.14);
      background: linear-gradient(90deg, rgba(255,255,255,0.13), rgba(255,255,255,0.055));
    }

    .ho-title-main {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      max-width: min(72vw, 620px);
    }

    .ho-title-project {
      display: inline-flex;
      align-items: center;
      max-width: min(28vw, 180px);
      min-width: 0;
      border: 0;
      background: transparent;
      margin: 0;
      padding-right: 7px;
      border-right: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.62);
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      user-select: text;
    }

    .ho-title-text {
      cursor: pointer;
      white-space: nowrap;
      max-width: min(62vw, 560px);
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .ho-title-edit-dot {
      border: none;
      background: transparent;
      width: 18px;
      height: 18px;
      padding: 0;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      color: inherit;
      flex: 0 0 auto;
      letter-spacing: 0;
      transition: opacity 0.12s ease, background 0.12s ease;
    }

    .ho-title-main:hover .ho-title-edit-dot,
    .ho-title-main:focus-within .ho-title-edit-dot,
    .ho-title-edit-dot[aria-expanded="true"] {
      opacity: 0.78;
      pointer-events: auto;
    }

    .ho-title-edit-dot:hover {
      opacity: 1;
      background: rgba(255,255,255,0.08);
    }

    .ho-title-edit-input {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.25);
      background: rgba(0,0,0,0.35);
      color: inherit;
      min-width: 160px;
      max-width: min(80vw, 720px);
      text-align: center;
      outline: none;
      font-weight: 600;
    }

    .ho-title-placeholder-title {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      cursor: default;
    }

    .ho-title-placeholder-icon {
      --ho-title-placeholder-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M8 15H6l-3 3V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v4'/%3E%3Cpath fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' d='M10 19h5l4 2v-7a3 3 0 0 0-3-3h-6a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3Z'/%3E%3C/svg%3E");
      display: inline-block;
      width: 15px;
      height: 15px;
      background: rgba(218,235,255,0.96);
      -webkit-mask: var(--ho-title-placeholder-mask) center / contain no-repeat;
      mask: var(--ho-title-placeholder-mask) center / contain no-repeat;
      filter: drop-shadow(0 0 8px rgba(132,198,255,0.58));
    }

    .ho-title-action-menu {
      position: fixed;
      z-index: 2147483647;
      min-width: 218px;
      padding: 10px 0;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(47,47,47,0.98);
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.08),
        0 18px 38px rgba(0,0,0,0.38);
      color: rgba(255,255,255,0.95);
      font-size: 14px;
      font-weight: 600;
      box-sizing: border-box;
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      overflow-y: auto;
      overscroll-behavior: contain;
      contain: layout paint;
    }

    .ho-title-action-menu button {
      width: 100%;
      min-height: 40px;
      border: 0;
      background: transparent;
      color: inherit;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      text-align: left;
      cursor: pointer;
      font: inherit;
    }

    .ho-title-action-menu button:hover {
      background: rgba(255,255,255,0.09);
    }

    .ho-title-action-menu button[disabled] {
      opacity: 0.5;
      cursor: default;
    }

    .ho-title-action-menu button[disabled]:hover {
      background: transparent;
    }

    .ho-title-action-menu svg {
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .ho-title-action-menu .ho-menu-label {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ho-title-action-menu .ho-menu-check {
      opacity: 0.82;
      margin-left: auto;
    }

    .ho-title-action-menu .ho-menu-muted {
      min-height: 34px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      color: rgba(255,255,255,0.58);
      font-size: 12px;
      font-weight: 600;
    }

    main div.text-token-text-secondary[class*="vt-disclaimer"] {
      position: relative;
    }

    main div.text-token-text-secondary[class*="vt-disclaimer"] > .ho-tab-title-under-input {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      max-width: calc(100% - 16px);
    }
  `;

  function norm(value) {
    return String(value || '').replace(/[\s\u00A0]+/g, ' ').trim();
  }

  function escHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function graphemes(value) {
    const s = String(value || '');
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(seg.segment(s), (x) => x.segment);
      }
    } catch {}
    return Array.from(s);
  }

  function isEmojiCluster(cluster) {
    return /[\uFE0F\u200D]|\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(cluster || '');
  }

  function isEmojiOnlyTitle(value) {
    const parts = graphemes(value).map(norm).filter(Boolean);
    return parts.length > 0 && parts.every(isEmojiCluster);
  }

  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.max(min, Math.min(value, max));
  }

  function getViewportBox() {
    const doc = D.documentElement;
    const fallbackWidth = doc?.clientWidth || W.innerWidth || 1024;
    const fallbackHeight = doc?.clientHeight || W.innerHeight || 768;
    const vv = W.visualViewport;
    if (vv?.width && vv?.height) {
      const left = Number(vv.offsetLeft || 0);
      const top = Number(vv.offsetTop || 0);
      return {
        left,
        top,
        right: left + Number(vv.width),
        bottom: top + Number(vv.height),
        width: Number(vv.width),
        height: Number(vv.height),
      };
    }
    return {
      left: 0,
      top: 0,
      right: fallbackWidth,
      bottom: fallbackHeight,
      width: fallbackWidth,
      height: fallbackHeight,
    };
  }

  const ICONS = Object.freeze({
    rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/></svg>',
    project: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"/><path d="M12 11h5m0 0-2-2m2 2-2 2"/></svg>',
    label: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h6.1c.7 0 1.3.3 1.8.7l4.4 4.4a2.5 2.5 0 0 1 0 3.6l-7.6 7.6a2.5 2.5 0 0 1-3.6 0L4.2 15.4a2.5 2.5 0 0 1-.7-1.8V5.5Z"/><circle cx="8.5" cy="7.5" r="1.25" fill="currentColor" stroke="none"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"/><path d="M12 12h6M15 9v6"/></svg>',
  });

  function addCleanup(fn) {
    if (typeof fn === 'function') cleanups.add(fn);
    return fn;
  }

  function destroy() {
    clearTimeout(attachTimer);
    clearTimeout(refreshTimer);
    closeTitleMenu();
    try { unsubscribe?.(); } catch {}
    unsubscribe = null;
    try { bodyObserver?.disconnect?.(); } catch {}
    bodyObserver = null;
    cleanups.forEach((fn) => {
      try { fn(); } catch {}
    });
    cleanups.clear();
    try { labelEl?.remove?.(); } catch {}
    labelEl = null;
  }

  function ensureStyle() {
    let style = D.getElementById(STYLE_ID);
    if (!style) {
      style = D.createElement('style');
      style.id = STYLE_ID;
      D.head.appendChild(style);
    }
    if (style.textContent !== CSS) style.textContent = CSS;
  }

  function isProjectView() {
    return /^\/g\/g-p-[^/]+\/project\/?$/i.test(location.pathname);
  }

  function getCurrentChatId() {
    const match = location.pathname.match(/\/c\/([a-z0-9_-]+)/i);
    return match ? match[1] : null;
  }

  function hideTitleLabel() {
    closeTitleMenu();
    shownTitle = '';
    shownProjectKey = '';
    baseTitle = '';
    if (labelEl) {
      try { labelEl.remove(); } catch {}
      labelEl = null;
    }
  }

  function getCurrentProjectId() {
    const match = location.pathname.match(/^\/g\/(g-p-[^/]+)\/(?:c\/|project(?:\/|$))/i);
    return match ? match[1] : '';
  }

  function normalizeProjectHref(id) {
    const pid = norm(id);
    return pid ? `/g/${pid}/project` : '';
  }

  function projectRowsFromStore() {
    const rows = [];
    const add = (value) => {
      if (!Array.isArray(value)) return;
      value.forEach((row) => {
        if (row && typeof row === 'object') rows.push(row);
      });
    };
    try {
      const store = W.H2O?.Projects?.readStore?.();
      add(store?.bestRows);
      add(store?.rows);
    } catch {}
    try {
      add(W.H2O?.Projects?.owner?.loadRowsFast?.());
    } catch {}
    return rows;
  }

  function readProjectMeta() {
    const id = getCurrentProjectId();
    if (!id) return null;
    const href = normalizeProjectHref(id);
    const rows = projectRowsFromStore();
    const found = rows.find((row) => {
      const rowHref = String(row?.href || '').trim();
      const rowId = String(row?.id || row?.projectId || '').trim();
      return rowId === id || rowHref === href || rowHref.endsWith(href);
    });

    let title = norm(found?.title || found?.name || '');
    if (!title) {
      const selector = `a[href="${href.replace(/"/g, '\\"')}"], a[href$="${href.replace(/"/g, '\\"')}"]`;
      const link = D.querySelector(selector);
      title = norm(link?.querySelector?.('.truncate,[class*="truncate"]')?.textContent || link?.textContent || '');
    }

    return {
      id,
      href,
      title: title || 'Project',
    };
  }

  function openProject(project) {
    if (!project?.href) return;
    try {
      history.pushState({}, '', project.href);
      W.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      location.href = project.href;
    }
  }

  function openSidebarIfPossible() {
    const btn =
      D.querySelector('button[aria-label*="Open sidebar"]') ||
      D.querySelector('button[aria-label*="Show sidebar"]') ||
      D.querySelector('button[aria-label*="Expand sidebar"]');
    if (btn) btn.click();
  }

  function findSidebarEntry() {
    const chatId = getCurrentChatId();
    if (!chatId) return null;
    const id = String(chatId).replace(/"/g, '\\"');
    return D.querySelector(
      `aside a[href*="/c/${id}"], aside button[href*="/c/${id}"], nav a[href*="/c/${id}"], nav button[href*="/c/${id}"]`
    );
  }

  function highlightSidebarEntry() {
    const el = findSidebarEntry();
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('ho-sidebar-ring');
    setTimeout(() => el.classList.remove('ho-sidebar-ring'), 2000);
  }

  function onTitleClick() {
    openSidebarIfPossible();
    setTimeout(highlightSidebarEntry, 300);
  }

  function closeTitleMenu() {
    D.querySelectorAll('.ho-title-edit-dot[aria-expanded="true"]').forEach((node) => {
      node.setAttribute('aria-expanded', 'false');
    });
    menuCleanup.forEach((fn) => {
      try { fn(); } catch {}
    });
    menuCleanup = [];
    if (menuEl) {
      try { menuEl.remove(); } catch {}
    }
    menuEl = null;
    D.querySelectorAll('.ho-title-action-menu').forEach((node) => {
      try { node.remove(); } catch {}
    });
  }

  function attachMenuDismiss(menu) {
    let active = true;
    const onOutside = (event) => {
      if (!menu?.contains?.(event.target)) closeTitleMenu();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') closeTitleMenu();
    };
    setTimeout(() => {
      if (!active) return;
      D.addEventListener('pointerdown', onOutside, true);
      D.addEventListener('keydown', onKey, true);
      W.addEventListener('resize', closeTitleMenu, { passive: true });
      W.visualViewport?.addEventListener?.('resize', closeTitleMenu, { passive: true });
      W.visualViewport?.addEventListener?.('scroll', closeTitleMenu, { passive: true });
    }, 0);
    menuCleanup.push(() => { active = false; D.removeEventListener('pointerdown', onOutside, true); });
    menuCleanup.push(() => D.removeEventListener('keydown', onKey, true));
    menuCleanup.push(() => W.removeEventListener('resize', closeTitleMenu));
    menuCleanup.push(() => W.visualViewport?.removeEventListener?.('resize', closeTitleMenu));
    menuCleanup.push(() => W.visualViewport?.removeEventListener?.('scroll', closeTitleMenu));
  }

  function positionMenu(menu, anchor) {
    D.body.appendChild(menu);
    const pad = 8;
    const viewport = getViewportBox();
    const availableHeight = Math.max(40, Math.floor(viewport.height - pad * 2));
    menu.style.height = 'auto';
    menu.style.maxHeight = `${availableHeight}px`;
    menu.style.overflowY = 'auto';
    if (menu.scrollHeight > availableHeight) menu.style.height = `${availableHeight}px`;
    const ar = anchor?.getBoundingClientRect?.() || {
      left: viewport.left + viewport.width / 2,
      right: viewport.left + viewport.width / 2,
      bottom: viewport.top + viewport.height / 2,
      top: viewport.top + viewport.height / 2,
    };
    const mr = menu.getBoundingClientRect();
    const gap = 10;
    const minLeft = viewport.left + pad;
    const maxLeft = viewport.right - mr.width - pad;
    const minTop = viewport.top + pad;
    const maxTop = viewport.bottom - mr.height - pad;
    const hasRightRoom = ar.right + gap + mr.width <= viewport.right - pad;
    const hasLeftRoom = ar.left - gap - mr.width >= viewport.left + pad;
    let left = hasRightRoom
      ? Math.round(ar.right + gap)
      : hasLeftRoom
        ? Math.round(ar.left - gap - mr.width)
        : Math.round(ar.right - mr.width);
    let top = Math.round(ar.top - mr.height - 14);
    if (top < minTop) top = Math.round(ar.top - Math.min(72, Math.max(18, mr.height * 0.32)));
    left = clamp(left, minLeft, maxLeft);
    top = clamp(top, minTop, maxTop);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function makeMenuButton({ icon, label, action, disabled = false, trailing = '' }) {
    const btn = D.createElement('button');
    btn.type = 'button';
    if (action) btn.dataset.action = action;
    if (disabled) btn.disabled = true;
    btn.innerHTML = `${icon || ''}<span class="ho-menu-label">${escHtml(label)}</span>${trailing}`;
    return btn;
  }

  function dedupeMenuButtons(menu) {
    const seen = new Set();
    [...menu.querySelectorAll('button')].forEach((btn) => {
      const key = norm(btn.dataset.action || btn.querySelector?.('.ho-menu-label')?.textContent || btn.textContent || '').toLowerCase();
      if (!key) return;
      if (seen.has(key)) {
        btn.remove();
      } else {
        seen.add(key);
      }
    });
  }

  function sanitizeTitleMenu(menu) {
    if (!menu) return;
    const rows = [...menu.querySelectorAll('button, [role="menuitem"]')];
    let keptAddLabel = false;
    rows.forEach((row) => {
      const label = norm(row.querySelector?.('.ho-menu-label')?.textContent || row.textContent || '').toLowerCase();
      if (label !== 'add label') return;
      const isOwnButton = row.tagName === 'BUTTON' && row.dataset.action === 'add-label';
      if (isOwnButton && !keptAddLabel) {
        keptAddLabel = true;
        return;
      }
      try { row.remove(); } catch {}
    });
    dedupeMenuButtons(menu);
  }

  function protectTitleMenu(menu, anchor) {
    sanitizeTitleMenu(menu);
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sanitizeTitleMenu(menu);
        positionMenu(menu, anchor || labelEl);
      });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(menu, { childList: true, subtree: true });
    menuCleanup.push(() => {
      cancelAnimationFrame(raf);
      try { mo.disconnect(); } catch {}
    });
  }

  function openTitleMenu(anchor) {
    closeTitleMenu();
    ensureStyle();

    const menu = D.createElement('div');
    menu.className = 'ho-title-action-menu';
    menu.dataset.hoTitleMenu = '1';
    menu.dataset.hoTitleMenuOwner = '9C1a';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Chat title actions');

    const actions = [
      { action: 'rename', label: 'Rename', icon: ICONS.rename },
      { action: 'move-project', label: 'Move to project', icon: ICONS.project },
      { action: 'add-label', label: 'Add label', icon: ICONS.label },
      { action: 'add-folder', label: 'Add to folder', icon: ICONS.folder },
    ];

    const uniqueActions = actions.filter((item, index, list) => (
      list.findIndex((candidate) => candidate.action === item.action) === index
    ));

    uniqueActions.forEach((item) => {
      const btn = makeMenuButton(item);
      btn.setAttribute('role', 'menuitem');
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeTitleMenu();
        if (item.action === 'rename') startInlineEdit();
        else if (item.action === 'move-project') openNativeMoveToProject();
        else if (item.action === 'add-label') openLabelAssign();
        else if (item.action === 'add-folder') openFolderChooser(anchor || labelEl);
      });
      menu.appendChild(btn);
    });

    sanitizeTitleMenu(menu);
    if (anchor?.setAttribute) anchor.setAttribute('aria-expanded', 'true');
    menuEl = menu;
    positionMenu(menu, anchor || labelEl);
    protectTitleMenu(menu, anchor || labelEl);
    attachMenuDismiss(menu);
  }

  function currentChatHref() {
    const chatId = getCurrentChatId();
    return chatId ? `/c/${encodeURIComponent(chatId)}` : '';
  }

  function getLabelsApi() {
    return W.H2O?.Labels || W.H2O?.LibraryCore?.getService?.('labels') || null;
  }

  function openLabelAssign() {
    const chatId = getCurrentChatId();
    if (!chatId) return;
    const api = getLabelsApi();
    const open = api?.openAssignModal || api?.ui?.openAssignModal;
    if (typeof open === 'function') {
      try { open.call(api, chatId, { source: 'under-input-title-menu' }); } catch {}
    }
  }

  function getFoldersApi() {
    return W.H2O?.folders || W.H2O?.LibraryCore?.getService?.('folders') || null;
  }

  function openFolderChooser(anchor) {
    closeTitleMenu();
    ensureStyle();
    const chatId = getCurrentChatId();
    const api = getFoldersApi();
    const folders = typeof api?.list === 'function' ? (api.list() || []) : [];
    const binding = typeof api?.getBinding === 'function' ? api.getBinding(chatId || currentChatHref()) : {};

    const menu = D.createElement('div');
    menu.className = 'ho-title-action-menu';
    menu.dataset.hoTitleMenu = '1';
    menu.dataset.hoTitleMenuOwner = '9C1a';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Add chat to folder');

    const head = D.createElement('div');
    head.className = 'ho-menu-muted';
    head.textContent = 'Add to folder';
    menu.appendChild(head);

    const rows = [{ id: '', name: 'Unfiled' }, ...folders.map((folder) => ({
      id: String(folder?.id || folder?.folderId || ''),
      name: norm(folder?.name || folder?.title || folder?.id || 'Folder'),
    })).filter((folder) => folder.id && folder.name)];

    if (!chatId || !api || rows.length <= 1) {
      const empty = D.createElement('div');
      empty.className = 'ho-menu-muted';
      empty.textContent = !chatId ? 'Open a chat first' : 'No folders available';
      menu.appendChild(empty);
    } else {
      rows.forEach((folder) => {
        const selected = String(binding?.folderId || '') === String(folder.id || '');
        const btn = makeMenuButton({
          icon: ICONS.folder,
          label: folder.name,
          action: 'folder',
          trailing: selected ? '<span class="ho-menu-check">✓</span>' : '',
        });
        btn.setAttribute('role', 'menuitem');
        btn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          btn.disabled = true;
          void selectFolderForCurrentChat(api, chatId, folder).finally(() => {
            closeTitleMenu();
            refreshSoon('folder-assigned');
          });
        });
        menu.appendChild(btn);
      });
    }

    menuEl = menu;
    positionMenu(menu, anchor || labelEl);
    protectTitleMenu(menu, anchor || labelEl);
    attachMenuDismiss(menu);
  }

  async function selectFolderForCurrentChat(api, chatId, folder) {
    const folderId = String(folder?.id || '');
    const folderName = String(folder?.name || '');
    if (typeof api?.setBinding !== 'function') return null;
    let result = api.setBinding(chatId, folderId, {
      source: 'under-input-title-menu',
      reason: 'title-menu-folder',
    });
    if (
      result?.status === 'chat-not-saved' &&
      folderId &&
      typeof api.saveAndBindToFolder === 'function'
    ) {
      result = await api.saveAndBindToFolder({
        chatId,
        folderId,
        folderName,
        source: 'under-input-title-menu',
      });
    }
    return result;
  }

  function dispatchHover(el) {
    if (!el) return;
    ['pointerover', 'mouseover', 'mouseenter'].forEach((type) => {
      try {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: W }));
      } catch {}
    });
  }

  function findConversationOptionsButton(entry) {
    if (!entry) return null;
    const roots = [];
    let node = entry;
    for (let i = 0; i < 5 && node; i += 1) {
      roots.push(node);
      node = node.parentElement;
    }
    const selector = [
      'button.__menu-item-trailing-btn',
      'button[data-testid*="history-item"][data-testid$="options"]',
      'button[data-testid$="options"]',
      'button[aria-label*="conversation options"]',
      'button[aria-label*="Open conversation options"]',
    ].join(',');

    for (const root of roots) {
      dispatchHover(root);
      const direct = root.querySelector?.(selector);
      if (direct) return direct;
      const buttons = [...(root.querySelectorAll?.('button') || [])];
      const match = buttons.find((btn) => /conversation options|open conversation options|more/i.test(
        `${btn.getAttribute('aria-label') || ''} ${btn.title || ''} ${btn.textContent || ''}`
      ));
      if (match) return match;
    }
    return null;
  }

  function clickNativeMenuItem(pattern) {
    const items = [
      ...D.querySelectorAll('[role="menuitem"], [role="menu"] button, [data-radix-popper-content-wrapper] button'),
    ];
    const item = items.find((el) => pattern.test(norm(el.textContent || el.getAttribute('aria-label') || '')));
    if (!item) return false;
    try { item.click(); return true; } catch { return false; }
  }

  function openNativeMoveToProject() {
    void (async () => {
      openSidebarIfPossible();
      await delay(260);
      const entry = findSidebarEntry();
      if (!entry) return;
      const btn = findConversationOptionsButton(entry);
      if (btn) {
        try { btn.click(); } catch {}
      } else {
        try {
          entry.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W }));
        } catch {}
      }
      await delay(180);
      if (!clickNativeMenuItem(/move to project/i)) {
        await delay(420);
        clickNativeMenuItem(/move to project/i);
      }
    })();
  }

  function getDisclaimerContainer() {
    return D.querySelector('main div.text-token-text-secondary[class*="vt-disclaimer"]');
  }

  function getComposerContainer() {
    const form = D.querySelector('form[data-testid="composer"]') || D.querySelector('form');
    return form ? form.parentElement : null;
  }

  function ensureLabel() {
    ensureStyle();
    if (isProjectView() || !getCurrentChatId()) {
      hideTitleLabel();
      return false;
    }

    let parent = getDisclaimerContainer() || getComposerContainer();
    if (!parent) return false;

    if (!labelEl) labelEl = parent.querySelector('.ho-tab-title-under-input');
    if (!labelEl) {
      labelEl = D.createElement('div');
      labelEl.className = 'ho-tab-title-under-input';
      parent.appendChild(labelEl);
    } else if (labelEl.parentElement !== parent) {
      parent.appendChild(labelEl);
    }
    D.querySelectorAll('.ho-tab-title-under-input').forEach((node) => {
      if (node !== labelEl) {
        try { node.remove(); } catch {}
      }
    });
    if (labelEl.dataset.hoTitleRuntime !== RUNTIME_MARK) {
      labelEl.innerHTML = '';
      labelEl.dataset.hoTitleRuntime = RUNTIME_MARK;
      shownProjectKey = '';
      labelEl.dataset.hoTitlePlaceholder = '0';
    }
    labelEl.style.display = '';
    return true;
  }

  function buildStaticLabel(text, options = {}) {
    if (!labelEl) return;
    labelEl.innerHTML = '';
    labelEl.dataset.hoTitlePlaceholder = options.placeholder ? '1' : '0';
    const project = readProjectMeta();
    shownProjectKey = project ? `${project.id}:${project.title}` : '';

    if (project) {
      const projectEl = D.createElement('button');
      projectEl.type = 'button';
      projectEl.className = 'ho-title-project';
      projectEl.textContent = project.title;
      projectEl.title = project.title;
      projectEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openProject(project);
      });
      projectEl.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      labelEl.appendChild(projectEl);
    }

    const main = D.createElement('span');
    main.className = 'ho-title-main';

    const span = D.createElement('span');
    span.className = options.placeholder ? 'ho-title-text ho-title-placeholder-title' : 'ho-title-text';
    if (options.placeholder) {
      span.title = 'Chat title loading';
      const icon = D.createElement('span');
      icon.className = 'ho-title-placeholder-icon';
      icon.setAttribute('aria-hidden', 'true');
      span.appendChild(icon);
    } else {
      span.textContent = text || '';
      span.title = text || '';
    }
    span.addEventListener('click', onTitleClick);
    span.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      startInlineEdit();
    });

    const dot = D.createElement('button');
    dot.type = 'button';
    dot.className = 'ho-title-edit-dot';
    dot.textContent = '⋮';
    dot.title = 'Chat actions';
    dot.setAttribute('aria-label', 'Chat actions');
    dot.setAttribute('aria-expanded', 'false');
    dot.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openTitleMenu(dot);
    });

    main.appendChild(span);
    main.appendChild(dot);
    labelEl.appendChild(main);
  }

  function updateLabelText(text) {
    const next = norm(text);
    if (!next) return;
    shownTitle = next;
    if (!ensureLabel() || !labelEl || isEditing) return;
    const project = readProjectMeta();
    const projectKey = project ? `${project.id}:${project.title}` : '';

    const span = labelEl.querySelector('.ho-title-text');
    if (!span || projectKey !== shownProjectKey || labelEl.dataset.hoTitlePlaceholder === '1') {
      buildStaticLabel(next);
    } else if (span.textContent !== next) {
      span.textContent = next;
      span.title = next;
    }
  }

  function updatePlaceholderLabel() {
    shownTitle = '';
    if (!ensureLabel() || !labelEl || isEditing) return;
    const project = readProjectMeta();
    const projectKey = project ? `${project.id}:${project.title}` : '';
    const span = labelEl.querySelector('.ho-title-placeholder-title');
    if (!span || projectKey !== shownProjectKey || labelEl.dataset.hoTitlePlaceholder !== '1') {
      buildStaticLabel('', { placeholder: true });
    }
  }

  function renderFromState(state) {
    if (!getCurrentChatId() || !state || state.routeKind === 'project') {
      hideTitleLabel();
      return;
    }
    baseTitle = norm(state.baseTitle || '');
    const display = norm(state.displayTitle || state.baseTitle || '');
    if (display && !(isEmojiOnlyTitle(display) && !baseTitle)) {
      updateLabelText(display);
    } else {
      updatePlaceholderLabel();
    }
  }

  function startInlineEdit() {
    if (!ensureLabel() || !labelEl || isEditing) return;
    const api = W.H2O && W.H2O.ChatTitle;
    const state = api?.getState?.() || {};
    const currentBase = norm(state.baseTitle || baseTitle || shownTitle);
    if (!currentBase) return;

    isEditing = true;
    closeTitleMenu();
    labelEl.innerHTML = '';

    const project = readProjectMeta();
    shownProjectKey = project ? `${project.id}:${project.title}` : '';
    if (project) {
      const projectEl = D.createElement('button');
      projectEl.type = 'button';
      projectEl.className = 'ho-title-project';
      projectEl.textContent = project.title;
      projectEl.title = project.title;
      projectEl.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openProject(project);
      });
      projectEl.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      labelEl.appendChild(projectEl);
    }

    const main = D.createElement('span');
    main.className = 'ho-title-main';

    const input = D.createElement('input');
    input.type = 'text';
    input.className = 'ho-title-edit-input';
    input.value = currentBase;
    main.appendChild(input);
    labelEl.appendChild(main);
    input.focus();
    input.select();

    let finished = false;
    function finish(commit) {
      if (finished) return;
      finished = true;
      isEditing = false;

      const nextBase = norm(commit ? input.value : currentBase);
      labelEl.innerHTML = '';

      if (commit && nextBase && nextBase !== currentBase) {
        applyRename(nextBase);
      } else {
        renderFromState(api?.getState?.() || { baseTitle: currentBase, displayTitle: shownTitle || currentBase });
      }
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  function applyRename(nextBase) {
    const api = W.H2O && W.H2O.ChatTitle;
    if (!api) {
      updateLabelText(nextBase);
      return;
    }
    api.setTitle?.({
      baseTitle: nextBase,
      source: 'user',
      priority: 100,
      confidence: 1,
      reason: 'under-input-rename',
    }, {
      force: true,
      userInitiated: true,
      reason: 'under-input-rename',
    });
    updateLabelText(api.getState?.().displayTitle || nextBase);
    api.renameNative?.(nextBase, {
      userInitiated: true,
      source: 'under-input',
    });
  }

  function attachChatTitle() {
    const api = W.H2O && W.H2O.ChatTitle;
    if (!api || typeof api.subscribe !== 'function') return false;
    if (unsubscribe) return true;
    unsubscribe = api.subscribe((state) => renderFromState(state));
    try { renderFromState(api.getState()); } catch {}
    return true;
  }

  function scheduleAttach() {
    clearTimeout(attachTimer);
    attachTimer = setTimeout(() => {
      if (!attachChatTitle()) scheduleAttach();
    }, 150);
  }

  function refreshSoon(reason) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      try {
        W.H2O?.ChatTitle?.refresh?.(reason || 'under-input-refresh');
        renderFromState(W.H2O?.ChatTitle?.getState?.());
      } catch {}
    }, 120);
  }

  function init() {
    ensureLabel();
    if (!attachChatTitle()) scheduleAttach();
    refreshSoon('under-input-init');

    const onTitleChanged = (event) => renderFromState(event?.detail);
    const onEmojiUpdated = (event) => renderFromState(event?.detail);
    const onAutoEmojiChanged = () => refreshSoon('legacy-autoemoji-changed');
    const onPopState = () => refreshSoon('popstate');

    W.addEventListener('h2o:chat-title:changed', onTitleChanged);
    W.addEventListener('h2o:chat-title:emoji-updated', onEmojiUpdated);
    W.addEventListener('ho:autoemoji:changed', onAutoEmojiChanged);
    W.addEventListener('popstate', onPopState);
    addCleanup(() => W.removeEventListener('h2o:chat-title:changed', onTitleChanged));
    addCleanup(() => W.removeEventListener('h2o:chat-title:emoji-updated', onEmojiUpdated));
    addCleanup(() => W.removeEventListener('ho:autoemoji:changed', onAutoEmojiChanged));
    addCleanup(() => W.removeEventListener('popstate', onPopState));

    bodyObserver = new MutationObserver(() => refreshSoon('composer-dom-mutation'));
    if (D.body) bodyObserver.observe(D.body, { childList: true, subtree: true });
  }

  W[BOOT_KEY] = { destroy };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
