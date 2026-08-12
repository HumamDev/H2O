// ==H2O Module==
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
// ==/H2O Module==

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
  let titleHostEl = null;
  let shownTitle = '';
  let shownProjectKey = '';
  let baseTitle = '';
  let isEditing = false;
  let menuEl = null;
  let projectPickerEl = null;
  let moveConfirmationEl = null;
  let moveInteraction = null;
  let menuCleanup = [];
  let menuPositionRaf = 0;
  const menuPositions = new Map();
  let unsubscribe = null;
  let unsubscribeInternalTitleSettings = null;
  let attachTimer = 0;
  let settingsAttachTimer = 0;
  let refreshTimer = 0;
  let presentationRefreshRaf = 0;
  let nativeDisclaimerRaf = 0;
  let internalTitleWidthRaf = 0;
  let internalTitleResizeObserver = null;
  let observedInternalTitleHost = null;
  let appliedInternalTitleWidthPx = NaN;
  let appliedInternalProjectWidthPx = NaN;
  let bodyObserver = null;
  let nativeDisclaimerEl = null;
  let internalTitleBaseWidthPct = 60;
  let showProject = true;
  let hideNativeDisclaimer = true;
  let editorSessionSeq = 0;
  let activeEditorSession = null;
  let renameError = null;
  let destroyed = false;
  const cleanups = new Set();

  const STYLE_ID = 'ho-title-under-input-style-v3';
  const RUNTIME_MARK = 'v6-hide-new-chat';
  const DEFAULT_INTERNAL_CHAT_TITLE_WIDTH = 60;
  const NATIVE_DISCLAIMER_TEXT = 'ChatGPT can make mistakes. Check important info.';
  const CSS = `
    .ho-sidebar-ring {
      border-radius: 8px;
      box-shadow:
        inset 0 0 0 1px rgba(255, 213, 74, 0.35),
        0 0 3px rgba(255, 213, 74, 0.12);
      transition: box-shadow 0.2s ease;
    }

    .ho-tab-title-under-input {
      font-size: 11px;
      line-height: 14px;
      opacity: 0.85;
      margin-top: 0;
      text-align: center;
      display: inline-flex;
      justify-content: flex-start;
      align-items: center;
      gap: 7px;
      min-width: 0;
      min-height: 18px;
      height: 18px;
      position: absolute;
      left: 50%;
      top: calc(100% + 3px);
      width: min(90%, var(--ho-internal-title-rendered-width, var(--ho-internal-title-base-width, 60%)));
      max-width: 90%;
      margin-inline: 0;
      box-sizing: border-box;
      padding: 0 6px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      background: linear-gradient(90deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025));
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.08),
        0 4px 12px rgba(0,0,0,0.16);
      color: rgba(255,255,255,0.88);
      font-weight: 600;
      transform: translateX(-50%);
      z-index: 2;
      transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    }

    [data-ho-internal-title-host="1"] {
      position: relative;
      overflow: visible;
    }

    .ho-tab-title-under-input:hover {
      opacity: 0.96;
      border-color: rgba(255,255,255,0.14);
      background: linear-gradient(90deg, rgba(255,255,255,0.13), rgba(255,255,255,0.055));
    }

    .ho-title-main {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      max-width: none;
      line-height: 14px;
      flex: 1 1 auto;
      overflow: hidden;
    }

    .ho-title-project {
      display: inline-flex;
      align-items: center;
      width: var(--ho-internal-title-project-width, auto);
      max-width: var(--ho-internal-title-project-width, 180px);
      min-width: 0;
      flex: 0 0 var(--ho-internal-title-project-width, auto);
      border: 0;
      background: transparent;
      margin: 0;
      padding-right: 7px;
      border-right: 1px solid rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.62);
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      line-height: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      user-select: text;
    }

    .ho-tab-title-under-input[data-ho-show-project="0"] .ho-title-project {
      display: none;
    }

    [data-ho-native-disclaimer-hidden="1"] {
      display: none !important;
    }

    .ho-title-text {
      cursor: pointer;
      white-space: nowrap;
      max-width: none;
      overflow: hidden;
      text-overflow: clip;
      min-width: 0;
      flex: 1 1 auto;
    }

    .ho-title-edit-dot {
      border: none;
      background: transparent;
      width: 16px;
      height: 16px;
      padding: 0;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
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

    .ho-title-rename-error {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: min(36vw, 300px);
      color: rgba(255, 176, 176, 0.96);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
    }

    .ho-title-rename-error > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ho-title-rename-retry {
      border: 0;
      border-radius: 4px;
      padding: 1px 5px;
      background: rgba(255, 255, 255, 0.10);
      color: inherit;
      font: inherit;
      cursor: pointer;
    }

    .ho-title-rename-status {
      color: rgba(255, 255, 255, 0.62);
      font-size: 10px;
      font-weight: 600;
      white-space: nowrap;
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

    .ho-title-project-picker {
      min-width: 248px;
      width: min(304px, calc(100vw - 16px));
    }

    .ho-title-project-confirm {
      min-width: 276px;
      width: min(320px, calc(100vw - 16px));
      padding: 14px;
      overflow: visible;
    }

    .ho-title-project-confirm-message {
      color: rgba(255,255,255,0.95);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }

    .ho-title-project-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .ho-title-action-menu .ho-title-project-confirm-actions button {
      width: auto;
      min-height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      background: rgba(255,255,255,0.08);
    }

    .ho-title-action-menu .ho-title-project-confirm-actions button[data-primary="true"] {
      background: rgba(255,255,255,0.92);
      color: rgba(20,20,20,0.95);
    }

    .ho-title-project-move-error {
      margin-top: 9px;
      color: rgba(255,176,176,0.96);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.3;
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

  function canonicalString(value) {
    return typeof value === 'string' ? value : '';
  }

  function editorSessionMatches(session, state) {
    if (!session || session.cancelled || destroyed || activeEditorSession !== session) return false;
    const snapshot = state || W.H2O?.ChatTitle?.getState?.() || {};
    return (
      getCurrentChatId() === session.chatId &&
      snapshot.chatId === session.chatId &&
      snapshot.routeKind === session.routeKind &&
      Number.isSafeInteger(snapshot.routeToken) &&
      snapshot.routeToken === session.routeToken
    );
  }

  function detachEditorInputListeners(session) {
    if (!session?.input) return;
    try { session.input.removeEventListener('keydown', session.onKeydown); } catch {}
    try { session.input.removeEventListener('blur', session.onBlur); } catch {}
    session.onKeydown = null;
    session.onBlur = null;
  }

  function cancelEditorSession(reason) {
    const session = activeEditorSession;
    if (!session) {
      isEditing = false;
      return false;
    }
    session.cancelled = true;
    session.cancelReason = String(reason || 'cancelled');
    session.finished = true;
    detachEditorInputListeners(session);
    try { session.controller?.abort?.(); } catch {}
    session.controller = null;
    activeEditorSession = null;
    isEditing = false;
    return true;
  }

  function destroy() {
    destroyed = true;
    cancelEditorSession('runtime-destroyed');
    renameError = null;
    clearTimeout(attachTimer);
    clearTimeout(settingsAttachTimer);
    clearTimeout(refreshTimer);
    cancelAnimationFrame(presentationRefreshRaf);
    presentationRefreshRaf = 0;
    cancelAnimationFrame(nativeDisclaimerRaf);
    nativeDisclaimerRaf = 0;
    cancelAnimationFrame(internalTitleWidthRaf);
    internalTitleWidthRaf = 0;
    try { internalTitleResizeObserver?.disconnect?.(); } catch {}
    internalTitleResizeObserver = null;
    observedInternalTitleHost = null;
    closeTitleMenu(true);
    try { unsubscribe?.(); } catch {}
    unsubscribe = null;
    try { unsubscribeInternalTitleSettings?.(); } catch {}
    unsubscribeInternalTitleSettings = null;
    try { bodyObserver?.disconnect?.(); } catch {}
    bodyObserver = null;
    cleanups.forEach((fn) => {
      try { fn(); } catch {}
    });
    cleanups.clear();
    try { labelEl?.remove?.(); } catch {}
    labelEl = null;
    try { titleHostEl?.removeAttribute?.('data-ho-internal-title-host'); } catch {}
    titleHostEl = null;
    try { nativeDisclaimerEl?.removeAttribute?.('data-ho-native-disclaimer-hidden'); } catch {}
    nativeDisclaimerEl = null;
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
    cancelEditorSession('route-or-label-removed');
    closeTitleMenu(true);
    shownTitle = '';
    shownProjectKey = '';
    baseTitle = '';
    renameError = null;
    if (labelEl) {
      try { labelEl.remove(); } catch {}
      labelEl = null;
    }
    appliedInternalTitleWidthPx = NaN;
    appliedInternalProjectWidthPx = NaN;
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

  function projectIdentityRoot(value) {
    const raw = norm(value).split(/[/?#]/)[0];
    const match = raw.match(/^(g-p-[a-f0-9]{32})(?:-|$)/i);
    return match ? match[1].toLowerCase() : raw.toLowerCase();
  }

  function resolveCanonicalProjectMeta(rows, routeId) {
    const id = norm(routeId);
    const identity = projectIdentityRoot(id);
    if (!id || !identity || !Array.isArray(rows)) return null;
    const candidates = rows.filter((row) => {
      const rowId = norm(row?.id || row?.projectId || '');
      const hrefId = norm(String(row?.href || '').match(/\/g\/([^/]+)\/project(?:$|[?#])/i)?.[1] || '');
      return rowId === id || hrefId === id ||
        projectIdentityRoot(rowId) === identity || projectIdentityRoot(hrefId) === identity;
    });
    const unique = [...new Map(candidates.map((row) => {
      const key = `${norm(row?.id || row?.projectId || '')}\u0001${norm(row?.href || '')}`;
      return [key, row];
    })).values()];
    if (unique.length !== 1) return null;
    const row = unique[0];
    const title = norm(row?.title || row?.name || row?.projectName || '');
    if (!title) return null;
    const rowId = norm(row?.id || row?.projectId || id);
    const href = norm(row?.href || '') || normalizeProjectHref(rowId || id);
    return { id: rowId || id, routeId: id, href, title };
  }

  function readProjectMeta() {
    if (!showProject) return null;
    const id = getCurrentProjectId();
    if (!id) return null;
    return resolveCanonicalProjectMeta(projectRowsFromStore(), id);
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

  function computeAnchoredMenuPosition(anchorRect, menuRect, viewport, placement = 'below') {
    const gap = 7;
    const pad = 8;
    const minLeft = viewport.left + pad;
    const usableWidth = Math.max(0, viewport.width - pad * 2);
    const renderedWidth = Math.min(menuRect.width, usableWidth);
    const maxLeft = viewport.right - renderedWidth - pad;
    const minTop = viewport.top + pad;
    let left;
    let top;
    let side = placement;
    let maxHeight;
    if (placement === 'side') {
      const rightLeft = anchorRect.right + gap;
      const leftLeft = anchorRect.left - gap - renderedWidth;
      const fitsRight = rightLeft <= maxLeft;
      const fitsLeft = leftLeft >= minLeft;
      left = fitsRight || (!fitsLeft && viewport.right - anchorRect.right >= anchorRect.left - viewport.left)
        ? rightLeft
        : leftLeft;
      maxHeight = Math.max(0, Math.floor(viewport.height - pad * 2));
      const renderedHeight = Math.min(menuRect.height, maxHeight);
      top = clamp(anchorRect.top, minTop, viewport.bottom - renderedHeight - pad);
      side = left < anchorRect.left ? 'left' : 'right';
    } else {
      const belowRoom = Math.max(0, viewport.bottom - pad - anchorRect.bottom - gap);
      const aboveRoom = Math.max(0, anchorRect.top - viewport.top - pad - gap);
      const fitsBelow = menuRect.height <= belowRoom;
      const fitsAbove = menuRect.height <= aboveRoom;
      const preferAbove = placement === 'above';
      const above = preferAbove
        ? (fitsAbove || (!fitsBelow && aboveRoom >= belowRoom))
        : (!fitsBelow && (fitsAbove || aboveRoom > belowRoom));
      maxHeight = Math.max(0, Math.floor(above ? aboveRoom : belowRoom));
      const renderedHeight = Math.min(menuRect.height, maxHeight);
      left = anchorRect.right - renderedWidth;
      top = above ? anchorRect.top - gap - renderedHeight : anchorRect.bottom + gap;
      side = above ? 'above' : 'below';
    }
    return {
      left: Math.round(clamp(left, minLeft, maxLeft)),
      top: Math.round(top),
      side,
      maxHeight,
    };
  }

  function forgetPositionedMenu(menu) {
    if (!menu) return;
    menuPositions.delete(menu);
    try { menu.remove(); } catch {}
  }

  function closeMoveConfirmation(force = false) {
    if (!force && moveInteraction?.isPending?.()) return false;
    forgetPositionedMenu(moveConfirmationEl);
    moveConfirmationEl = null;
    moveInteraction?.cancel?.();
    return true;
  }

  function closeProjectPicker(force = false) {
    if (!closeMoveConfirmation(force)) return false;
    forgetPositionedMenu(projectPickerEl);
    projectPickerEl = null;
    moveInteraction = null;
    return true;
  }

  function closeTitleMenu(force = false) {
    if (!force && moveInteraction?.isPending?.()) return false;
    D.querySelectorAll('.ho-title-edit-dot[aria-expanded="true"]').forEach((node) => {
      node.setAttribute('aria-expanded', 'false');
    });
    menuCleanup.forEach((fn) => {
      try { fn(); } catch {}
    });
    menuCleanup = [];
    cancelAnimationFrame(menuPositionRaf);
    menuPositionRaf = 0;
    closeProjectPicker(true);
    forgetPositionedMenu(menuEl);
    menuEl = null;
    menuPositions.clear();
    D.querySelectorAll('.ho-title-action-menu').forEach((node) => {
      try { node.remove(); } catch {}
    });
    return true;
  }

  function attachMenuDismiss(menu) {
    let active = true;
    const onOutside = (event) => {
      const insideChain = [...D.querySelectorAll('.ho-title-action-menu')]
        .some((node) => node.contains?.(event.target));
      if (!insideChain) closeTitleMenu();
    };
    const onKey = (event) => {
      if (event.key !== 'Escape' || moveInteraction?.isPending?.()) return;
      event.preventDefault();
      event.stopPropagation();
      if (moveConfirmationEl) closeMoveConfirmation();
      else if (projectPickerEl) closeProjectPicker();
      else closeTitleMenu();
    };
    const onGeometry = () => scheduleOpenMenuPositions();
    setTimeout(() => {
      if (!active) return;
      D.addEventListener('pointerdown', onOutside, true);
      D.addEventListener('keydown', onKey, true);
      W.addEventListener('resize', onGeometry, { passive: true });
      W.addEventListener('scroll', onGeometry, { passive: true, capture: true });
      W.visualViewport?.addEventListener?.('resize', onGeometry, { passive: true });
      W.visualViewport?.addEventListener?.('scroll', onGeometry, { passive: true });
    }, 0);
    menuCleanup.push(() => { active = false; D.removeEventListener('pointerdown', onOutside, true); });
    menuCleanup.push(() => D.removeEventListener('keydown', onKey, true));
    menuCleanup.push(() => W.removeEventListener('resize', onGeometry));
    menuCleanup.push(() => W.removeEventListener('scroll', onGeometry, true));
    menuCleanup.push(() => W.visualViewport?.removeEventListener?.('resize', onGeometry));
    menuCleanup.push(() => W.visualViewport?.removeEventListener?.('scroll', onGeometry));
  }

  function positionMenu(menu, anchor, placement = 'below') {
    if (!menu?.isConnected) D.body.appendChild(menu);
    menuPositions.set(menu, { anchor, placement });
    const pad = 8;
    const viewport = getViewportBox();
    const availableWidth = Math.max(40, Math.floor(viewport.width - pad * 2));
    menu.style.minWidth = '';
    menu.style.width = '';
    menu.style.maxWidth = `${availableWidth}px`;
    menu.style.height = 'auto';
    menu.style.maxHeight = 'none';
    menu.style.overflowY = 'hidden';
    if (menu.getBoundingClientRect().width > availableWidth) {
      menu.style.minWidth = '0';
      menu.style.width = `${availableWidth}px`;
    }
    const ar = anchor?.getBoundingClientRect?.() || {
      left: viewport.left + viewport.width / 2,
      right: viewport.left + viewport.width / 2,
      bottom: viewport.top + viewport.height / 2,
      top: viewport.top + viewport.height / 2,
    };
    const mr = menu.getBoundingClientRect();
    const point = computeAnchoredMenuPosition(ar, mr, viewport, placement);
    menu.style.maxHeight = `${point.maxHeight}px`;
    menu.style.overflowY = 'auto';
    menu.dataset.hoMenuPlacement = point.side;
    menu.style.left = `${point.left}px`;
    menu.style.top = `${point.top}px`;
  }

  function scheduleOpenMenuPositions() {
    cancelAnimationFrame(menuPositionRaf);
    menuPositionRaf = requestAnimationFrame(() => {
      menuPositionRaf = 0;
      [...menuPositions.entries()].forEach(([menu, config]) => {
        if (!menu?.isConnected || !config?.anchor?.isConnected) {
          menuPositions.delete(menu);
          return;
        }
        positionMenu(menu, config.anchor, config.placement);
      });
    });
  }

  function markTitleOwnedMenu(menu) {
    menu.dataset.hoTitleMenu = '1';
    menu.dataset.hoTitleMenuOwner = '9C1a';
    menu.setAttribute('data-cgxui-owner', '9C1a');
    return menu;
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
      const injectedOwner = norm(btn.getAttribute?.('data-cgxui') || '').toLowerCase();
      const action = norm(btn.dataset.action || '').toLowerCase();
      const label = norm(btn.querySelector?.('.ho-menu-label')?.textContent || btn.textContent || '').toLowerCase();
      const key = injectedOwner ? `injected:${injectedOwner}` : action ? `action:${action}` : `label:${label}`;
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

  function protectTitleMenu(menu, anchor, placement = 'below') {
    sanitizeTitleMenu(menu);
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sanitizeTitleMenu(menu);
        positionMenu(menu, anchor || labelEl, placement);
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
    if (!closeTitleMenu()) return;
    ensureStyle();

    const menu = D.createElement('div');
    menu.className = 'ho-title-action-menu';
    markTitleOwnedMenu(menu);
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
        if (item.action === 'move-project') {
          openProjectChooser(btn);
          return;
        }
        closeTitleMenu();
        if (item.action === 'rename') startInlineEdit();
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
    markTitleOwnedMenu(menu);
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

  function getProjectsApi() {
    return W.H2O?.Projects ||
      W.H2O?.LibraryCore?.getService?.('project-provider') ||
      W.H2O?.LibraryCore?.getService?.('projects') ||
      null;
  }

  function canonicalProjectRows(api = getProjectsApi()) {
    const groups = [];
    try {
      const store = api?.readStore?.();
      if (Array.isArray(store?.bestRows)) groups.push(store.bestRows);
      if (Array.isArray(store?.rows)) groups.push(store.rows);
    } catch {}
    try {
      const fast = api?.owner?.loadRowsFast?.();
      if (Array.isArray(fast)) groups.push(fast);
    } catch {}
    const byId = new Map();
    groups.flat().forEach((row) => {
      const id = String(row?.id || row?.projectId || '').trim();
      if (!id) return;
      const previous = byId.get(id) || {};
      const name = String(row?.title || row?.name || row?.projectName || previous.name || id)
        .replace(/[\s\u00A0]+/g, ' ')
        .trim();
      byId.set(id, {
        id,
        name: name || previous.name || id,
        href: String(row?.href || row?.nativeProjectHref || previous.href || '').trim(),
      });
    });
    return [...byId.values()];
  }

  function currentProjectAliases(chatId) {
    const aliases = new Set();
    const routeId = getCurrentProjectId();
    if (routeId) aliases.add(routeId);
    try {
      const record = W.H2O?.ChatRegistry?.getRecord?.(chatId);
      const recordId = String(record?.project?.projectId || record?.projectId || '').trim();
      if (recordId) aliases.add(recordId);
    } catch {}
    return aliases;
  }

  function createProjectMoveInteraction(move) {
    let selected = null;
    let pending = false;
    const cancel = () => {
      if (pending) return false;
      selected = null;
      return true;
    };
    return {
      select(project) {
        if (pending || !project?.id) return null;
        selected = { id: String(project.id), name: String(project.name || project.id) };
        return { ...selected };
      },
      cancel,
      escape: cancel,
      isPending() { return pending; },
      current() { return selected ? { ...selected } : null; },
      async confirm(chatId) {
        if (pending) return { ok: false, status: 'move-pending' };
        if (!selected?.id || !chatId) return { ok: false, status: 'missing-move-target' };
        const locked = { ...selected };
        pending = true;
        try {
          const result = await move({
            chatId,
            projectId: locked.id,
            source: 'title-under-input',
          });
          return { ...(result || { ok: false, status: 'move-failed' }), project: locked };
        } catch (error) {
          return { ok: false, status: 'move-failed', error: String(error?.message || error || 'Move failed'), project: locked };
        } finally {
          pending = false;
        }
      },
    };
  }

  function openProjectChooser(anchor) {
    if (!closeProjectPicker()) return;
    const api = getProjectsApi();
    const projects = canonicalProjectRows(api);
    const chatId = getCurrentChatId();
    const currentAliases = currentProjectAliases(chatId);
    moveInteraction = createProjectMoveInteraction((args) => {
      if (typeof api?.moveChatToProject !== 'function') {
        return Promise.resolve({ ok: false, status: 'project-move-unavailable', error: 'Project move is unavailable.' });
      }
      return api.moveChatToProject(args);
    });

    const picker = D.createElement('div');
    picker.className = 'ho-title-action-menu ho-title-project-picker';
    markTitleOwnedMenu(picker);
    picker.dataset.hoProjectChoiceSurface = '1';
    picker.setAttribute('role', 'listbox');
    picker.setAttribute('aria-label', 'Move chat to project');
    const head = D.createElement('div');
    head.className = 'ho-menu-muted';
    head.textContent = 'Move to project';
    picker.appendChild(head);

    let focusTarget = null;
    if (!projects.length) {
      const empty = D.createElement('div');
      empty.className = 'ho-menu-muted';
      empty.textContent = 'No projects available';
      picker.appendChild(empty);
    } else {
      projects.forEach((project) => {
        const routeId = normalizeProjectHref(project.id).split('/')[2] || '';
        const hrefId = String(project.href || '').match(/\/g\/([^/]+)\/project/)?.[1] || '';
        const current = currentAliases.has(project.id) || currentAliases.has(routeId) || currentAliases.has(hrefId);
        const button = makeMenuButton({
          icon: ICONS.project,
          label: project.name,
          action: `move-project:${project.id}`,
          trailing: current ? '<span class="ho-menu-check" aria-label="Current project">✓</span>' : '',
        });
        button.setAttribute('role', 'option');
        button.dataset.hoProjectChoice = '1';
        button.dataset.projectId = project.id;
        button.setAttribute('aria-selected', current ? 'true' : 'false');
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          moveInteraction?.select?.(project);
          openMoveConfirmation(button, project);
        });
        picker.appendChild(button);
        if (!focusTarget || current) focusTarget = button;
      });
    }

    projectPickerEl = picker;
    positionMenu(picker, anchor, 'side');
    setTimeout(() => focusTarget?.focus?.(), 0);
  }

  function openMoveConfirmation(anchor, project) {
    if (!closeMoveConfirmation()) return;
    moveInteraction?.select?.(project);
    const popup = D.createElement('div');
    popup.className = 'ho-title-action-menu ho-title-project-confirm';
    markTitleOwnedMenu(popup);
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Confirm move to project');

    const message = D.createElement('div');
    message.className = 'ho-title-project-confirm-message';
    message.textContent = `Do you want to move this chat to “${project.name}”?`;
    popup.appendChild(message);
    const errorEl = D.createElement('div');
    errorEl.className = 'ho-title-project-move-error';
    errorEl.hidden = true;
    popup.appendChild(errorEl);

    const actions = D.createElement('div');
    actions.className = 'ho-title-project-confirm-actions';
    const cancelButton = D.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    const moveButton = D.createElement('button');
    moveButton.type = 'button';
    moveButton.dataset.primary = 'true';
    moveButton.textContent = 'Move';
    actions.append(cancelButton, moveButton);
    popup.appendChild(actions);

    cancelButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (moveInteraction?.escape?.()) closeMoveConfirmation();
    });
    moveButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (moveInteraction?.isPending?.()) return;
      errorEl.hidden = true;
      moveButton.disabled = true;
      cancelButton.disabled = true;
      popup.setAttribute('aria-busy', 'true');
      const chatId = getCurrentChatId();
      void moveInteraction.confirm(chatId).then((result) => {
        if (result?.ok === true) {
          closeTitleMenu(true);
          refreshSoon('project-moved');
          return;
        }
        errorEl.textContent = result?.error || 'Could not move this chat. Please try again.';
        errorEl.hidden = false;
        moveButton.disabled = false;
        cancelButton.disabled = false;
        popup.removeAttribute('aria-busy');
        positionMenu(popup, anchor, 'side');
        moveButton.focus?.();
      });
    });

    moveConfirmationEl = popup;
    positionMenu(popup, anchor, 'side');
    setTimeout(() => moveButton.focus?.(), 0);
  }

  function getComposerRoot() {
    return D.querySelector('#thread-bottom-container')?.closest?.('.composer-parent') || null;
  }

  function getDisclaimerContainer() {
    const candidate = getComposerRoot()?.querySelector?.('[data-testid="thread-disclaimer"]') || null;
    return candidate && norm(candidate.textContent) === NATIVE_DISCLAIMER_TEXT ? candidate : null;
  }

  function applyNativeDisclaimerVisibility() {
    const candidate = getDisclaimerContainer();
    if (nativeDisclaimerEl && nativeDisclaimerEl !== candidate) {
      try { nativeDisclaimerEl.removeAttribute('data-ho-native-disclaimer-hidden'); } catch {}
    }
    nativeDisclaimerEl = candidate;
    if (!nativeDisclaimerEl) return false;
    if (hideNativeDisclaimer) {
      nativeDisclaimerEl.setAttribute('data-ho-native-disclaimer-hidden', '1');
    } else {
      nativeDisclaimerEl.removeAttribute('data-ho-native-disclaimer-hidden');
    }
    return true;
  }

  function scheduleNativeDisclaimerVisibility() {
    if (destroyed || nativeDisclaimerRaf) return;
    nativeDisclaimerRaf = requestAnimationFrame(() => {
      nativeDisclaimerRaf = 0;
      applyNativeDisclaimerVisibility();
    });
  }

  function getComposerContainer() {
    const form = D.querySelector('form[data-testid="composer"]') || D.querySelector('form');
    return form ? form.parentElement : null;
  }

  function isCurrentTitleSurface(label, host, parent) {
    return !!parent && !!label?.isConnected && label.parentElement === parent &&
      !!host?.isConnected && host === parent;
  }

  function normalizeInternalChatTitleWidth(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return DEFAULT_INTERNAL_CHAT_TITLE_WIDTH;
    return Math.round(Math.min(90, Math.max(60, number)) * 2) / 2;
  }

  function computeAdaptiveInternalTitleWidth({ composerWidth, basePct, titleIntrinsicWidth, fixedWidth }) {
    const composer = Math.max(0, Number(composerWidth) || 0);
    const base = composer * normalizeInternalChatTitleWidth(basePct) / 100;
    const maximum = composer * 0.9;
    const required = Math.max(0, Number(fixedWidth) || 0) + Math.max(0, Number(titleIntrinsicWidth) || 0);
    return Math.min(maximum, Math.max(base, required));
  }

  function cssPixels(style, property) {
    const value = Number.parseFloat(style?.getPropertyValue?.(property) || '0');
    return Number.isFinite(value) ? value : 0;
  }

  function measureIntrinsicTitleWidth(element) {
    if (!element) return 0;
    if (element.matches?.('input, textarea')) return Math.max(element.scrollWidth || 0, element.clientWidth || 0);
    let rangeWidth = 0;
    try {
      const range = D.createRange();
      range.selectNodeContents(element);
      rangeWidth = range.getBoundingClientRect().width;
      range.detach?.();
    } catch {}
    return rangeWidth > 0 ? rangeWidth : (element.scrollWidth || 0);
  }

  function measureProjectPresentationWidth(project, baseOuterWidth) {
    if (!project || !showProject) return 0;
    const style = W.getComputedStyle(project);
    let textWidth = 0;
    try {
      const range = D.createRange();
      range.selectNodeContents(project);
      textWidth = range.getBoundingClientRect().width;
      range.detach?.();
    } catch {}
    const naturalWidth = textWidth +
      cssPixels(style, 'padding-left') + cssPixels(style, 'padding-right') +
      cssPixels(style, 'border-left-width') + cssPixels(style, 'border-right-width');
    return Math.min(180, Math.max(0, Number(baseOuterWidth) || 0) * 0.4, naturalWidth);
  }

  function measureInternalTitleFixedWidth(projectWidth) {
    if (!labelEl) return 0;
    const outerStyle = W.getComputedStyle(labelEl);
    const main = labelEl.querySelector('.ho-title-main');
    const mainStyle = main ? W.getComputedStyle(main) : null;
    const project = showProject ? labelEl.querySelector('.ho-title-project') : null;
    const dot = main?.querySelector?.('.ho-title-edit-dot');
    const outerGap = project && main ? cssPixels(outerStyle, 'column-gap') : 0;
    const mainGap = dot ? cssPixels(mainStyle, 'column-gap') : 0;
    return (
      cssPixels(outerStyle, 'padding-left') +
      cssPixels(outerStyle, 'padding-right') +
      cssPixels(outerStyle, 'border-left-width') +
      cssPixels(outerStyle, 'border-right-width') +
      (project ? Math.max(0, Number(projectWidth) || 0) : 0) +
      outerGap +
      (dot?.getBoundingClientRect?.().width || 0) +
      mainGap
    );
  }

  function updateAdaptiveInternalTitleWidth() {
    if (destroyed || !labelEl || !titleHostEl || labelEl.style.display === 'none') return;
    const composerWidth = titleHostEl.getBoundingClientRect().width;
    if (!(composerWidth > 0)) return;
    const titleContent = labelEl.querySelector('.ho-title-text, .ho-title-edit-input');
    const baseOuterWidth = composerWidth * internalTitleBaseWidthPct / 100;
    const projectWidth = measureProjectPresentationWidth(labelEl.querySelector('.ho-title-project'), baseOuterWidth);
    const width = computeAdaptiveInternalTitleWidth({
      composerWidth,
      basePct: internalTitleBaseWidthPct,
      titleIntrinsicWidth: measureIntrinsicTitleWidth(titleContent),
      fixedWidth: measureInternalTitleFixedWidth(projectWidth),
    });
    if (!(width > 0)) return;
    if (!Number.isFinite(appliedInternalProjectWidthPx) || Math.abs(appliedInternalProjectWidthPx - projectWidth) > 0.25) {
      appliedInternalProjectWidthPx = projectWidth;
      labelEl.style.setProperty('--ho-internal-title-project-width', `${projectWidth}px`);
    }
    if (!Number.isFinite(appliedInternalTitleWidthPx) || Math.abs(appliedInternalTitleWidthPx - width) > 0.25) {
      appliedInternalTitleWidthPx = width;
      labelEl.style.setProperty('--ho-internal-title-rendered-width', `${width}px`);
      labelEl.dataset.hoInternalTitleActualPct = String(Math.round(width / composerWidth * 1000) / 10);
    }
  }

  function scheduleAdaptiveInternalTitleWidth() {
    if (destroyed || internalTitleWidthRaf) return;
    internalTitleWidthRaf = requestAnimationFrame(() => {
      internalTitleWidthRaf = 0;
      updateAdaptiveInternalTitleWidth();
    });
  }

  function observeInternalTitleHost(host) {
    if (observedInternalTitleHost === host) return;
    try { internalTitleResizeObserver?.disconnect?.(); } catch {}
    internalTitleResizeObserver = null;
    observedInternalTitleHost = host || null;
    appliedInternalTitleWidthPx = NaN;
    appliedInternalProjectWidthPx = NaN;
    if (!host || typeof W.ResizeObserver !== 'function') return;
    internalTitleResizeObserver = new W.ResizeObserver(() => scheduleAdaptiveInternalTitleWidth());
    internalTitleResizeObserver.observe(host);
  }

  function applyInternalChatTitleSettings(settings) {
    const widthPct = normalizeInternalChatTitleWidth(settings?.widthPct);
    internalTitleBaseWidthPct = widthPct;
    showProject = settings?.showProject !== false;
    hideNativeDisclaimer = settings?.hideNativeDisclaimer !== false;
    labelEl?.style?.setProperty?.('--ho-internal-title-base-width', `${widthPct}%`);
    labelEl?.setAttribute?.('data-ho-show-project', showProject ? '1' : '0');
    scheduleAdaptiveInternalTitleWidth();
    scheduleNativeDisclaimerVisibility();
    scheduleOpenMenuPositions();
    return Object.freeze({ widthPct, showProject, hideNativeDisclaimer });
  }

  function attachInternalChatTitleSettings() {
    const api = W.H2O?.Surface?.Interface;
    if (!api || typeof api.getInternalChatTitleSettings !== 'function') return false;
    applyInternalChatTitleSettings(api.getInternalChatTitleSettings());
    if (!unsubscribeInternalTitleSettings && typeof api.subscribeInternalChatTitleSettings === 'function') {
      unsubscribeInternalTitleSettings = api.subscribeInternalChatTitleSettings(applyInternalChatTitleSettings);
    }
    return true;
  }

  function scheduleSettingsAttach() {
    if (destroyed) return;
    clearTimeout(settingsAttachTimer);
    settingsAttachTimer = setTimeout(() => {
      if (!attachInternalChatTitleSettings()) scheduleSettingsAttach();
    }, 150);
  }

  function ensureLabel() {
    ensureStyle();
    if (isProjectView() || !getCurrentChatId()) {
      hideTitleLabel();
      return false;
    }

    let parent = getComposerContainer() || getDisclaimerContainer();
    if (!parent) return false;

    if (labelEl && !isCurrentTitleSurface(labelEl, titleHostEl, parent)) {
      closeTitleMenu(true);
      labelEl = null;
      shownProjectKey = '';
      appliedInternalTitleWidthPx = NaN;
      appliedInternalProjectWidthPx = NaN;
    }
    if (titleHostEl && (!titleHostEl.isConnected || titleHostEl !== parent)) {
      try { titleHostEl.removeAttribute?.('data-ho-internal-title-host'); } catch {}
      titleHostEl = null;
      observeInternalTitleHost(null);
    }
    if (titleHostEl !== parent) {
      titleHostEl = parent;
      titleHostEl.setAttribute('data-ho-internal-title-host', '1');
      observeInternalTitleHost(titleHostEl);
    }

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
    attachInternalChatTitleSettings();
    scheduleAdaptiveInternalTitleWidth();
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
    scheduleAdaptiveInternalTitleWidth();
  }

  function updateLabelText(text, options = {}) {
    const next = options.canonical === true ? canonicalString(text) : norm(text);
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
      scheduleAdaptiveInternalTitleWidth();
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

  function clearRenameError() {
    renameError = null;
    try { labelEl?.querySelector?.('.ho-title-rename-error')?.remove?.(); } catch {}
  }

  function renderRenameError() {
    if (!renameError || isEditing || !labelEl) return;
    const currentChatId = getCurrentChatId();
    if (renameError.chatId !== currentChatId) {
      clearRenameError();
      return;
    }
    const main = labelEl.querySelector('.ho-title-main');
    if (!main || main.querySelector('.ho-title-rename-error')) return;
    const box = D.createElement('span');
    box.className = 'ho-title-rename-error';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    const message = D.createElement('span');
    message.textContent = renameError.message;
    const retry = D.createElement('button');
    retry.type = 'button';
    retry.className = 'ho-title-rename-retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const retryText = renameError?.pendingText || '';
      clearRenameError();
      startInlineEdit(retryText);
    });
    box.appendChild(message);
    box.appendChild(retry);
    main.appendChild(box);
  }

  function renderFromState(state) {
    const currentChatId = getCurrentChatId();
    if (!currentChatId || !state || state.routeKind === 'project') {
      hideTitleLabel();
      return;
    }
    if (state.chatId && state.chatId !== currentChatId) {
      hideTitleLabel();
      return;
    }
    if (activeEditorSession && !editorSessionMatches(activeEditorSession, state)) {
      cancelEditorSession('route-state-changed');
    }
    if (renameError && (
      renameError.chatId !== currentChatId ||
      (Number.isSafeInteger(state.routeToken) && renameError.routeToken !== state.routeToken)
    )) {
      clearRenameError();
    }
    baseTitle = norm(state.baseTitle || '');
    const canonical = state.convergence?.enabled === true;
    const display = canonical
      ? canonicalString(state.displayTitle)
      : norm(state.displayTitle || state.baseTitle || '');
    if (display && (canonical || !(isEmojiOnlyTitle(display) && !baseTitle))) {
      updateLabelText(display, { canonical });
    } else {
      updatePlaceholderLabel();
    }
    renderRenameError();
  }

  function renderCurrentTitleState(api, fallback) {
    if (destroyed) return;
    let current = fallback || {};
    try { current = api?.getState?.() || current; } catch {}
    try { renderFromState(current); } catch {}
  }

  function startInlineEdit(initialValue) {
    if (destroyed || !ensureLabel() || !labelEl || isEditing) return;
    const api = W.H2O && W.H2O.ChatTitle;
    const state = api?.getState?.() || {};
    const chatId = getCurrentChatId();
    if (
      !chatId ||
      state.chatId !== chatId ||
      state.routeKind !== 'chat' ||
      !Number.isSafeInteger(state.routeToken)
    ) {
      renderCurrentTitleState(api, state);
      return;
    }
    const currentBase = norm(state.baseTitle || baseTitle || shownTitle);
    if (!currentBase) return;
    const editValue = norm(initialValue || currentBase);
    const identity = Object.freeze({
      chatId,
      routeToken: state.routeToken,
      routeKind: state.routeKind,
      editorSessionId: `under-input-editor-${++editorSessionSeq}`,
    });
    const session = {
      identity,
      chatId: identity.chatId,
      routeToken: identity.routeToken,
      routeKind: identity.routeKind,
      editorSessionId: identity.editorSessionId,
      cancelled: false,
      cancelReason: '',
      finished: false,
      controller: null,
      input: null,
      label: labelEl,
      onKeydown: null,
      onBlur: null,
    };
    activeEditorSession = session;
    isEditing = true;
    clearRenameError();
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
    input.value = editValue;
    session.input = input;
    main.appendChild(input);
    labelEl.appendChild(main);
    scheduleAdaptiveInternalTitleWidth();
    input.focus();
    input.select();

    async function finish(commit) {
      if (session.finished || session.cancelled || activeEditorSession !== session || destroyed) return;
      session.finished = true;
      detachEditorInputListeners(session);

      if (!commit) {
        cancelEditorSession('editor-cancelled');
        renderCurrentTitleState(api, state);
        return;
      }
      if (!editorSessionMatches(session)) {
        cancelEditorSession('route-stale-before-submit');
        renderCurrentTitleState(api, state);
        return;
      }

      const nextBase = norm(input.value);
      if (!nextBase || nextBase === currentBase) {
        cancelEditorSession('editor-unchanged');
        renderCurrentTitleState(api, state);
        return;
      }

      input.disabled = true;
      input.setAttribute('aria-busy', 'true');
      const status = D.createElement('span');
      status.className = 'ho-title-rename-status';
      status.textContent = 'Saving…';
      main.appendChild(status);
      session.controller = typeof W.AbortController === 'function' ? new W.AbortController() : null;

      const result = await applyRename(nextBase, session);
      if (
        result?.ignored ||
        session.cancelled ||
        destroyed ||
        activeEditorSession !== session
      ) {
        return;
      }

      const currentLabel = labelEl;
      const canRender = !!currentLabel &&
        currentLabel === session.label &&
        currentLabel.isConnected !== false;
      activeEditorSession = null;
      session.controller = null;
      isEditing = false;
      if (!canRender) return;

      currentLabel.innerHTML = '';
      if (result?.ok) {
        clearRenameError();
      } else {
        renameError = {
          chatId: session.chatId,
          routeToken: session.routeToken,
          pendingText: nextBase,
          message: 'Title was not saved.',
        };
      }
      renderCurrentTitleState(api, state);
    }

    const runFinish = (commit) => {
      void finish(commit).catch(() => {
        const wasCurrent = activeEditorSession === session && !destroyed;
        cancelEditorSession('editor-finish-error');
        if (!wasCurrent) return;
        renameError = {
          chatId: session.chatId,
          routeToken: session.routeToken,
          pendingText: norm(input.value || editValue),
          message: 'Title was not saved.',
        };
        renderCurrentTitleState(api, state);
      });
    };
    session.onKeydown = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runFinish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        runFinish(false);
      }
    };
    session.onBlur = () => runFinish(true);
    input.addEventListener('keydown', session.onKeydown);
    input.addEventListener('blur', session.onBlur);
  }

  async function applyRename(nextBase, session) {
    const api = W.H2O && W.H2O.ChatTitle;
    if (!api || typeof api.renameNative !== 'function') {
      return {
        ok: false,
        status: 'title-api-unavailable',
        chatId: session.chatId,
        routeToken: session.routeToken,
      };
    }
    if (!editorSessionMatches(session)) {
      return {
        ok: false,
        status: 'route-stale-before-request',
        ignored: true,
        chatId: session.chatId,
        routeToken: session.routeToken,
      };
    }

    let result;
    try {
      result = await api.renameNative(nextBase, {
        userInitiated: true,
        source: 'under-input',
        chatId: session.chatId,
        expectedRouteToken: session.routeToken,
        expectedRouteKind: session.routeKind,
        operationId: session.editorSessionId,
        signal: session.controller?.signal,
      });
    } catch (err) {
      result = {
        ok: false,
        status: 'error',
        error: String(err && err.message || err),
      };
    }

    if (!editorSessionMatches(session)) {
      return {
        ok: false,
        status: 'superseded',
        ignored: true,
        chatId: session.chatId,
        routeToken: session.routeToken,
      };
    }
    const current = api.getState?.() || {};
    if (
      current.chatId !== session.chatId ||
      current.routeKind !== session.routeKind ||
      current.routeToken !== session.routeToken ||
      result?.status === 'route-stale' ||
      result?.status === 'route-stale-before-request'
    ) {
      cancelEditorSession('route-stale-after-request');
      return {
        ok: false,
        status: 'route-stale',
        ignored: true,
        chatId: session.chatId,
        routeToken: session.routeToken,
      };
    }
    return {
      ...(result || { ok: false, status: 'unknown' }),
      chatId: session.chatId,
      routeToken: session.routeToken,
    };
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
    if (destroyed) return;
    clearTimeout(attachTimer);
    attachTimer = setTimeout(() => {
      if (!attachChatTitle()) scheduleAttach();
    }, 150);
  }

  function refreshSoon(reason) {
    if (destroyed) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      try {
        W.H2O?.ChatTitle?.refresh?.(reason || 'under-input-refresh');
        renderFromState(W.H2O?.ChatTitle?.getState?.());
      } catch {}
    }, 120);
  }

  function refreshPresentationSoon(reason) {
    if (destroyed || presentationRefreshRaf) return;
    presentationRefreshRaf = requestAnimationFrame(() => {
      presentationRefreshRaf = 0;
      const parent = getComposerContainer() || getDisclaimerContainer();
      const surfaceCurrent = !!labelEl?.isConnected && !!parent && labelEl.parentElement === parent;
      const hostCurrent = !!titleHostEl?.isConnected && titleHostEl === parent;
      if (!isCurrentTitleSurface(labelEl, titleHostEl, parent)) {
        if (!parent) return;
        labelEl = surfaceCurrent ? labelEl : null;
        titleHostEl = hostCurrent ? titleHostEl : null;
      }
      let current = null;
      try { current = W.H2O?.ChatTitle?.getState?.() || null; } catch {}
      if (current) renderFromState(current);
      else refreshSoon(reason || 'presentation-readiness');
    });
  }

  function init() {
    if (destroyed) return;
    ensureLabel();
    if (!attachInternalChatTitleSettings()) scheduleSettingsAttach();
    if (!attachChatTitle()) scheduleAttach();
    refreshSoon('under-input-init');

    const renderCurrentState = (event) => {
      let current = event?.detail;
      try { current = W.H2O?.ChatTitle?.getState?.() || current; } catch {}
      renderFromState(current);
    };
    const onTitleChanged = (event) => renderCurrentState(event);
    const onEmojiUpdated = (event) => renderCurrentState(event);
    const onAutoEmojiChanged = () => refreshSoon('legacy-autoemoji-changed');
    const onPopState = () => {
      refreshPresentationSoon('popstate-presentation');
      refreshSoon('popstate');
    };
    const onProjectsChanged = () => refreshPresentationSoon('projects-changed');

    W.addEventListener('h2o:chat-title:changed', onTitleChanged);
    W.addEventListener('h2o:chat-title:emoji-updated', onEmojiUpdated);
    W.addEventListener('ho:autoemoji:changed', onAutoEmojiChanged);
    W.addEventListener('popstate', onPopState);
    W.addEventListener('evt:h2o:projects:changed', onProjectsChanged);
    addCleanup(() => W.removeEventListener('h2o:chat-title:changed', onTitleChanged));
    addCleanup(() => W.removeEventListener('h2o:chat-title:emoji-updated', onEmojiUpdated));
    addCleanup(() => W.removeEventListener('ho:autoemoji:changed', onAutoEmojiChanged));
    addCleanup(() => W.removeEventListener('popstate', onPopState));
    addCleanup(() => W.removeEventListener('evt:h2o:projects:changed', onProjectsChanged));

    bodyObserver = new MutationObserver(() => {
      refreshPresentationSoon('composer-dom-mutation');
      scheduleNativeDisclaimerVisibility();
      scheduleOpenMenuPositions();
    });
    if (D.body) bodyObserver.observe(D.body, { childList: true, subtree: true });
  }

  W[BOOT_KEY] = { destroy };

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
