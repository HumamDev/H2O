// ==UserScript==
// @h2o-id      9c.title.under.input.bar
// @name         9c.🟤📌 Title Under Input bar 📌
// @namespace    H2O.ChatGPT.TitleUnderInput
// @version      2.8
// @description  Full under-input title, auto-sync, native rename integration, and sidebar locate highlight.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// --- Extended Script Notes ---
// This script displays the full original chat title under the input bar,
// syncs instantly when switching chats,
// preserves folder structure,
// allows inline renaming of only the last title segment,
// and uses native ChatGPT rename so changes persist everywhere.
// Clicking the title locates the chat in the sidebar with a highlight ring.
// --------------------------------


(function () {
  'use strict';

  let labelEl = null;
  let lastSeenRaw = '';
  let stableCount = 0;
  let shownTitle = '';
  let isEditing = false;

  // ───────── Global CSS ─────────
const style = document.createElement('style');
style.textContent = `
  .ho-sidebar-ring {
  border-radius: 8px;

  /* 1) The ring: real border, fully inside the element box */
  border: -2px solid rgba(255, 213, 74, 0.5);

  /* 2) Soft inner glow (also inside) */
  box-shadow:
    inset 0 0 0 1px rgba(255, 213, 74, 0.3),
    0 0 3px rgba(255, 213, 74, 0.1);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}


  /* Base style for the under-input title */
  .ho-tab-title-under-input {
    font-size: 12px;
    opacity: 0.85;
    margin-top: 0;
    text-align: center;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    /* no extra min-height here — disclaimer container provides the space */
  }

  .ho-title-text {
    cursor: pointer;
    white-space: nowrap;
    max-width: 80vw;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ho-title-edit-dot {
    border: none;
    background: transparent;
    padding: 0 4px;
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
    opacity: 0.7;
  }
  .ho-title-edit-dot:hover {
    opacity: 1;
  }

  .ho-title-edit-input {
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.25);
    background: rgba(0,0,0,0.35);
    color: inherit;
    min-width: 160px;
    max-width: 80vw;
    text-align: center;
  }

  /* 🔹 Disclaimer container: make it a positioning context */
  main div.text-token-text-secondary[class*="vt-disclaimer"] {
    position: relative;
  }

  /* 🔹 When our title is inside the disclaimer row, center it absolutely */
  main div.text-token-text-secondary[class*="vt-disclaimer"] > .ho-tab-title-under-input {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    max-width: calc(100% - 16px);
  }
`;
document.head.appendChild(style);



  // ───────── Helpers: chat + sidebar ─────────

  function isProjectView() {
    // true for URLs like /g/g-p-xxxx/project
    return /^\/g\/g-p-[^/]+\/project\/?$/i.test(location.pathname);
  }


  function getCurrentChatId() {
    const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  function openSidebarIfPossible() {
    const btn =
      document.querySelector('button[aria-label*="Open sidebar"]') ||
      document.querySelector('button[aria-label*="Show sidebar"]') ||
      document.querySelector('button[aria-label*="Expand sidebar"]');
    if (btn) btn.click();
  }

  function findSidebarEntry() {
    const chatId = getCurrentChatId();
    if (!chatId) return null;

    const selector =
      `aside a[href*="/c/${chatId}"],` +
      `aside button[href*="/c/${chatId}"],` +
      `nav a[href*="/c/${chatId}"],` +
      `nav button[href*="/c/${chatId}"]`;

    return document.querySelector(selector);
  }

function getSidebarConversationTitle() {
  const entry = findSidebarEntry();
  if (!entry) return '';

  // ✅ Prefer raw cached title if another script stored it
  const raw = entry.dataset && entry.dataset.hoRawTitle;
  if (raw) return raw.trim();

  const lines = (entry.textContent || '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  return lines[0] || '';
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

  // ───────── Title helpers (integrate with 9b) ─────────

  function getRawFullTitle() {
    const full = window.H2O_fullOriginalTitle;
    if (full && full !== 'ChatGPT') return full;

    const conv = getSidebarConversationTitle();
    if (conv) {
      return `${conv} – ChatGPT`;
    }

    return document.title || '';
  }

  // Strip trailing "– ChatGPT" or "- ChatGPT" (only at the end)
  function stripTrailingChatGPT(raw) {
    return (raw || '').replace(/\s*[–-]\s*ChatGPT\s*$/i, '').trim();
  }

  // "Folder – Conversation – ChatGPT" -> "Folder – Conversation"
  function extractUnderInputTitle(raw) {
    return stripTrailingChatGPT(raw);
  }

  // From "Folder – Conversation" or "Folder - Conversation" take only last segment
  function getConversationFromUnderInput(full) {
    const t = (full || '').trim();
    if (!t) return '';
    const parts = t.split(/\s*[–-]\s*/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  // Keep folder parts, replace last segment, then append " – ChatGPT"
  function buildNewRawFullTitle(newConversationTitle) {
    let t = stripTrailingChatGPT(getRawFullTitle());
    const parts = t.split(/\s*[–-]\s*/).filter(Boolean);

    if (parts.length === 0) {
      return `${newConversationTitle} – ChatGPT`;
    }

    parts[parts.length - 1] = newConversationTitle;
    return `${parts.join(' – ')} – ChatGPT`;
  }

  // ───────── Native rename bridge ─────────

  function triggerNativeSidebarRename(newTitle) {
    const entry = findSidebarEntry();
    if (!entry) return;

    entry.dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true })
    );

    setTimeout(() => {
      const input = entry.querySelector('input, textarea');
      if (!input) return;

      input.value = newTitle;
      input.dispatchEvent(
        new InputEvent('input', { bubbles: true, cancelable: true })
      );

      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        })
      );

      input.blur();
    }, 80);
  }

  // ───────── Label / inline edit UI ─────────

  // 🔹 Prefer the disclaimer container as parent, fall back to composer
  function getDisclaimerContainer() {
    // Outer wrapper that has the fixed min-height for the disclaimer row
    return document.querySelector(
      'main div.text-token-text-secondary[class*="vt-disclaimer"]'
    );
  }

  function getComposerContainer() {
    const form =
      document.querySelector('form[data-testid="composer"]') ||
      document.querySelector('form');
    return form ? form.parentElement : null;
  }

  function ensureLabel() {
    // 🔹 In project/folder view we don't want any under-input title
    if (isProjectView()) {
      if (labelEl) {
        labelEl.style.display = 'none';
      }
      return;
    }

    // If we come back from a project page, re-enable the label
    if (labelEl) {
      labelEl.style.display = '';
    }

    // 1) Try disclaimer first
    let parent = getDisclaimerContainer();

    // 2) Fallback: composer parent (previous behavior)
    if (!parent) {
      parent = getComposerContainer();
    }
    if (!parent) return;

    // If label already exists, but is attached to another parent, move it
    if (labelEl && labelEl.parentElement !== parent) {
      labelEl.parentElement?.removeChild(labelEl);
      parent.appendChild(labelEl);
    }

    // First-time creation
    if (!labelEl) {
      labelEl = parent.querySelector('.ho-tab-title-under-input');
    }

    if (!labelEl) {
      labelEl = document.createElement('div');
      labelEl.className = 'ho-tab-title-under-input';
      parent.appendChild(labelEl);
    }
  }



  function buildStaticLabel(text) {
    if (!labelEl) return;
    labelEl.innerHTML = '';

    const span = document.createElement('span');
    span.className = 'ho-title-text';
    span.textContent = text || '';
    span.addEventListener('click', onTitleClick);
    span.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startInlineEdit();
    });

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'ho-title-edit-dot';
    dot.textContent = '•';
    dot.title = 'Rename this chat';
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      startInlineEdit();
    });

    labelEl.appendChild(span);
    labelEl.appendChild(dot);
  }

  function updateLabelText(text) {
    shownTitle = text;
    ensureLabel();
    if (!labelEl || isEditing) return;

    const span = labelEl.querySelector('.ho-title-text');
    if (!span) {
      buildStaticLabel(text);
    } else {
      span.textContent = text;
    }
  }

  function startInlineEdit() {
    ensureLabel();
    if (!labelEl || isEditing) return;
    isEditing = true;

    const raw = getRawFullTitle();
    const fullUnder = extractUnderInputTitle(raw) || shownTitle || '';
    const currentConv = getConversationFromUnderInput(fullUnder);

    labelEl.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ho-title-edit-input';
    input.value = currentConv;
    labelEl.appendChild(input);
    input.focus();
    input.select();

    function finish(commit) {
      if (!isEditing) return;
      isEditing = false;

      const newConv = (commit ? input.value : currentConv).trim();
      labelEl.innerHTML = '';

      if (commit && newConv && newConv !== currentConv) {
        applyRename(newConv);
      } else {
        buildStaticLabel(fullUnder || shownTitle || currentConv);
      }
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });

    input.addEventListener('blur', () => finish(true));
  }

  function applyRename(newConversationTitle) {
    const newRaw = buildNewRawFullTitle(newConversationTitle);

    window.H2O_fullOriginalTitle = newRaw;
    document.title = newRaw;

    const newUnder = extractUnderInputTitle(newRaw);
    updateLabelText(newUnder);

    triggerNativeSidebarRename(newConversationTitle);
  }

  // ───────── Main sync loop ─────────

  function tick() {
    try {
      // 🔹 Don't show/update title on project/folder pages
      if (isProjectView()) {
        if (labelEl) labelEl.style.display = 'none';
        return;
      }

      ensureLabel();
      if (!labelEl || isEditing) return;

      const raw = getRawFullTitle();
      if (!raw) return;

      if (raw === lastSeenRaw) {
        stableCount++;
      } else {
        lastSeenRaw = raw;
        stableCount = 1;
      }

      if (stableCount >= 2) {   // small debounce
        const underInput = extractUnderInputTitle(raw) || raw;
        if (underInput && underInput !== shownTitle) {
          updateLabelText(underInput);
        }
      }
    } catch (e) {
      console.warn('[TitleUnderInput] error:', e);
    }
  }


  function forceRefreshTitleSoon() {
    lastSeenRaw = '';
    stableCount = 0;
    setTimeout(tick, 120);
  }

  // First setup: reserve space as soon as composer exists
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ensureLabel();
    tick();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      ensureLabel();
      tick();
    }, { once: true });
  }

  // Regular polling (keeps in sync with slower changes)
  setInterval(tick, 1000);

  // React to SPA navigation between chats
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    const ret = origPushState.apply(this, args);
    forceRefreshTitleSoon();
    return ret;
  };
    // ✅ Listen to 9d emoji rename events and refresh immediately
window.addEventListener('ho:autoemoji:changed', () => {
  try { lastSeenRaw = ''; stableCount = 0; tick(); } catch {}
});

  window.addEventListener('popstate', forceRefreshTitleSoon);

  // Also watch for composer being re-created
  const mo = new MutationObserver(() => {
    // if composer changed, reattach label & refresh text
    forceRefreshTitleSoon();
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
