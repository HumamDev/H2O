/* R4.7.3 — Retired Native Labels Sidebar UI (from 0F6a)
 *
 * This file is an ARCHIVE of the Native ChatGPT labels sidebar UI
 * that was physically removed from
 *   src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js
 * in commit _<R4.7.3 commit hash; populated post-commit>_.
 *
 * The functions below reference variables that are scope-bound to
 * the 0F6a IIFE (`W`, `D`, `H2O`, `core`, `state`, `err`, `step`,
 * `SkID`, `MODTAG`, `SEL`, `TYPE_DEFS`, `CFG_SEE_MORE_LIMIT`,
 * `UI_LABELS_ROOT`, `UI_LABELS_ROW`, `UI_LABELS_MORE`,
 * `UI_LABELS_POP`, `UI_LABELS_MODAL`, `UI_LABELS_VIEWER`,
 * `UI_LABELS_PAGE_HOST`, `UI_LABELS_PAGE`, `ATTR_CGXUI`,
 * `ATTR_CGXUI_OWNER`, `ATTR_CGXUI_STATE`, `ensureStyle`,
 * `readCatalog`, `readUi`, `writeUi`, `readCfg`, `listTypeDefs`,
 * `getLabelCounts`, `getChatLabels`, `normalizeBindingRow`,
 * `toChatId`, `listChatsByLabel`, `normalizeType`, `slugify`,
 * `normalizeLabel`, `findProjectsH2`, `findProjectsSection`,
 * `findLabelsRoot`, `pickSidebarRoot`, `safeRemove`,
 * `utilSelScoped`, `mutationHasOnlyH2OOwnedNodes`,
 * `recordLabelsShellSeen`, `recordLabelsHydrated`,
 * `isNativeOrganizationUiEnabled`, `closeTransientPop`,
 * `renameLabel`, `deleteLabel`, `openLabelByMode`,
 * `openLabelsByMode`, `openAssignModal`, `syncHeaderArrow`,
 * `applyTypeExpandModeOnSectionOpen`, `getTypeExpanded`,
 * `setTypeExpanded`, `setLabelPreviewOpen`, `isLabelPreviewOpen`,
 * `isTypeVisible`, `makeRowShell`, `setRowText`, `injectIcon`,
 * `makeIconToggle`, `makeNativeLikeMoreButton`,
 * `makeTypeHeaderButton`, `makeLabelCountSpan`,
 * `cleanSurfaceChatTitle`, `removeSurfaceChatLeadingIcon`,
 * `wireAsButton`).
 *
 * This file is NOT loaded by any runtime — it is purely archival.
 * It is not syntactically self-contained; pasting it back into
 * 0F6a's IIFE scope (at the recorded line ranges in
 * extracted-from-0F6a.md) restores the original code.
 *
 * Why retired:
 *   The Native ChatGPT Library sidebar labels section was hidden
 *   by R4.6.x deprecation flags (default-flipped in R4.6.4) and
 *   replaced by Desktop Studio's S0Z1g + S0F1m + S0F1n + S0F6b
 *   stack (shipped in R4.5.x). After soak proved the Native UI
 *   was dormant, R4.7.3 physically removes the now-dead UI code.
 *
 * Replacement:
 *   - Labels sidebar SECTION → Desktop Studio's S0Z1g labels
 *     section
 *   - Label rename/color/delete (sidebar row context menu) →
 *     S0F1m's openLabelEditor({mode: 'rename' | 'color' | 'delete'})
 *   - Label-create UI → S0F1m's openLabelEditor({mode: 'create'})
 *   - Label rows + label "more" button → S0Z1g sidebar item menu
 *     + S0F1m modals
 *   - Multi-select batch operations on labels → S0F1n Library
 *     Batch Toolbar
 *   - Label business actions (set/clear) from Library →
 *     S0F6b Labels Actions
 *
 * Boundary preserved:
 *   - function createLabel / renameLabel / deleteLabel — STAY in
 *     0F6a; Studio MV3 fallback (S0Z1g) calls H2O.Labels.* directly
 *   - Label catalog + bindings data layer — STAYS in 0F6a
 *   - Label query API (getChatLabels, flattenChatLabels,
 *     getLabelCounts, listChatsByLabel, buildLabelSummary,
 *     buildArchiveLabelAssignments) — STAYS in 0F6a
 *   - Per-turn `lbsc-chip-color` chip UI + supporting CSS — STAYS
 *     in 0F6a (different DOM subtree from `lbsc-root`)
 *   - Workspace viewer + modal UI (mountPage, openLabelsViewer,
 *     openLabelViewer, openAssignModal, closeViewer,
 *     closeAssignModal, makeChatRow, makeStandalonePageShell) —
 *     STAY in 0F6a; R4.7.4 scope
 *   - MOD API exposures via `H2O.Labels.*` — preserved (the few
 *     entries that referenced the retired sidebar functions now
 *     forward to no-op stubs that keep the same call shape)
 *   - 0F5a tag extraction untouched
 *   - 0D3* / 3X* capture modules untouched
 *
 * Rollback:
 *   See ../README.md and ../notes/rollback-procedures.md.
 *   Either git revert the R4.7.3 commit, or paste each block
 *   below back into 0F6a at the line ranges recorded in
 *   extracted-from-0F6a.md.
 */

/* ─────────────────────────────────────────────────────────────────────
 * Block 1 of 6 — R4.6.3 per-element org gate (pre-R4.7.3 lines 128-183)
 * Self-contained gate plumbing: a single selector array, a
 * sync function, an installer, and a boot IIFE. No external callers.
 * The gate is no longer needed because the UI it gated is itself
 * retired.
 * ─────────────────────────────────────────────────────────────────── */

  /* ── R4.6.3 — Per-element gate (cascade-proof, see 0F4a for pattern) ─
   * Hides ONLY the labels sidebar SECTION root (lbsc-root). The
   * per-turn chip-color UI uses a different cgxui value and is NOT
   * matched. The CRUD APIs (renameLabel, deleteLabel, createLabel)
   * live on H2O.Labels and are never gated. */
  const R46_ORG_SELECTORS = ['[data-cgxui="lbsc-root"]'];
  function syncR46OrgElements() {
    try {
      const D = W.document;
      if (!D) return;
      const hide = !isNativeOrganizationUiEnabled();
      for (const sel of R46_ORG_SELECTORS) {
        D.querySelectorAll(sel).forEach((el) => {
          if (!el || el.nodeType !== 1) return;
          if (hide) {
            el.setAttribute('data-h2o-r46-hidden', 'org-ui');
            try { el.style.setProperty('display', 'none', 'important'); } catch (_) {}
          } else if (el.getAttribute('data-h2o-r46-hidden') === 'org-ui') {
            el.removeAttribute('data-h2o-r46-hidden');
            try { el.style.removeProperty('display'); } catch (_) {}
          }
        });
      }
    } catch (_) { /* swallow */ }
  }
  function installR46OrgCssGate() {
    try {
      const D = W.document;
      if (!D) return;
      const SHARED_STYLE_ID = 'h2o-r46-hidden-attr-css';
      if (!D.getElementById(SHARED_STYLE_ID)) {
        const style = D.createElement('style');
        style.id = SHARED_STYLE_ID;
        style.textContent =
          '[data-h2o-r46-hidden="org-ui"],[data-h2o-r46-hidden="workspace-ui"]'
        + '{display:none !important;}';
        (D.head || D.documentElement).appendChild(style);
      }
      syncR46OrgElements();
      if (typeof W.setInterval === 'function') {
        W.setInterval(syncR46OrgElements, 1000);
      }
      if (typeof W.MutationObserver === 'function' && D.body) {
        const obs = new W.MutationObserver(function () { syncR46OrgElements(); });
        obs.observe(D.body, { childList: true, subtree: true });
      }
    } catch (_) { /* swallow */ }
  }
  (function bootR46OrgCssGate() {
    try {
      const D = W.document;
      if (!D) return;
      if (D.readyState !== 'loading') installR46OrgCssGate();
      else D.addEventListener('DOMContentLoaded', installR46OrgCssGate, { once: true });
    } catch (_) { /* swallow */ }
  })();

/* ─────────────────────────────────────────────────────────────────────
 * Block 2 of 6 — openLabelActionsPop (pre-R4.7.3 lines 1483-1544)
 * The label-row context-menu popup. Opened from the row's "more"
 * button. Contains the rename + delete UI handlers that called
 * renameLabel and deleteLabel directly. Only caller was
 * buildLabelsSection (the retired sidebar renderer), so this
 * function is fully removed from 0F6a.
 *
 * The rename/delete CRUD entrypoints themselves
 * (function renameLabel / function deleteLabel) STAY in 0F6a — the
 * Studio MV3 fallback (S0Z1g) calls H2O.Labels.renameLabel etc.
 * directly, bypassing this UI shell.
 * ─────────────────────────────────────────────────────────────────── */

  function openLabelActionsPop(anchor, typeDef, record, count = 0) {
    if (!(anchor instanceof HTMLElement) || !typeDef || !record) return false;
    closeTransientPop();

    const pop = D.createElement('div');
    pop.setAttribute(ATTR_CGXUI, UI_LABELS_POP);
    pop.setAttribute(ATTR_CGXUI_OWNER, SkID);
    pop.setAttribute('role', 'menu');

    const title = D.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'pop-title');
    title.textContent = `${typeDef.fullLabel}: ${record.label}`;
    pop.appendChild(title);

    const addItem = (label, onClick, opts = {}) => {
      const item = D.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      if (opts.danger) item.setAttribute(ATTR_CGXUI_STATE, 'danger');
      item.textContent = label;
      item.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeTransientPop();
        try { onClick?.(); } catch (error) { err('label-row-actions', error); }
      };
      pop.appendChild(item);
      return item;
    };

    addItem(`Open label (${Number(count || 0)} chats)`, () => openLabelByMode(typeDef.key, record.id));
    addItem('Manage labels', () => openLabelsByMode({ focusType: typeDef.key }));
    addItem('Rename label', () => {
      const next = W.prompt?.('Rename label', record.label || '');
      if (!next || normalizeLabel(next) === normalizeLabel(record.label)) return;
      renameLabel(typeDef.key, record.id, next);
    });
    if (!record.builtIn) {
      addItem('Delete label', () => {
        if (!W.confirm?.(`Delete label "${record.label}"?`)) return;
        deleteLabel(typeDef.key, record.id);
      }, { danger: true });
    }

    D.body.appendChild(pop);
    state.clean.nodes.add(pop);
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(280, Math.max(210, pop.offsetWidth || 230));
    const left = Math.min(Math.max(8, rect.right - width), Math.max(8, W.innerWidth - width - 8));
    const top = Math.min(Math.max(8, rect.bottom + 6), Math.max(8, W.innerHeight - (pop.offsetHeight || 180) - 8));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    const onDocDown = (event) => {
      if (pop.contains(event.target) || anchor.contains(event.target)) return;
      closeTransientPop();
      D.removeEventListener('pointerdown', onDocDown, true);
    };
    W.setTimeout(() => D.addEventListener('pointerdown', onDocDown, true), 0);
    state.clean.listeners.add(() => D.removeEventListener('pointerdown', onDocDown, true));
    return true;
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 3 of 6 — makeFallbackSidebarHeader (pre-R4.7.3 lines 1799-1807)
 * Builds the section header button used when ChatGPT's native
 * sidebar template was not present. Only caller was
 * prepareLabelsSection (also retired).
 * ─────────────────────────────────────────────────────────────────── */

  function makeFallbackSidebarHeader(labelText) {
    const btn = D.createElement('button');
    btn.type = 'button';
    btn.className = 'text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5';
    btn.innerHTML = '<h2 class="__menu-label" data-no-spacing="true"></h2>';
    const label = btn.querySelector('h2.__menu-label');
    if (label) label.textContent = labelText;
    return btn;
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 4 of 6 — prepareLabelsSection (pre-R4.7.3 lines 1809-1849)
 * Constructs the section element shell + header + list wrapper.
 * Sets data-cgxui="lbsc-root" on the section element. Only caller
 * was buildLabelsSection (also retired).
 * ─────────────────────────────────────────────────────────────────── */

  function prepareLabelsSection(projectsSection, existingSection = null) {
    const projectsHeaderBtn = projectsSection?.querySelector?.(':scope > button') || projectsSection?.querySelector?.('button') || null;

    const section = existingSection instanceof HTMLElement ? existingSection : D.createElement('div');
    if (projectsSection?.className) section.className = projectsSection.className;
    else if (!section.className) section.className = 'group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]';
    section.style.display = '';
    section.setAttribute(ATTR_CGXUI, UI_LABELS_ROOT);
    section.setAttribute(ATTR_CGXUI_OWNER, SkID);

    let headerBtn = section.querySelector(':scope > button');
    if (projectsHeaderBtn instanceof HTMLElement) {
      const cloned = projectsHeaderBtn.cloneNode(true);
      cloned.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      cloned.removeAttribute('aria-controls');
      if (headerBtn instanceof HTMLElement) headerBtn.replaceWith(cloned);
      else section.insertBefore(cloned, section.firstChild || null);
      headerBtn = cloned;
    } else if (!(headerBtn instanceof HTMLElement)) {
      headerBtn = makeFallbackSidebarHeader(MODTAG);
      section.insertBefore(headerBtn, section.firstChild || null);
    }

    headerBtn.removeAttribute('data-h2o-sidebar-shell-inert');
    const label = headerBtn.querySelector('h2.__menu-label');
    if (label) label.textContent = MODTAG;

    let listWrap = section.querySelector(':scope > [data-cgxui-state="section-list"]') ||
      section.querySelector(':scope > [data-h2o-sidebar-shell-list="1"]') ||
      null;
    if (!(listWrap instanceof HTMLElement)) {
      listWrap = D.createElement('div');
      listWrap.setAttribute(ATTR_CGXUI_STATE, 'section-list');
      section.appendChild(listWrap);
    }
    listWrap.removeAttribute('data-h2o-sidebar-shell-list');
    listWrap.setAttribute(ATTR_CGXUI_STATE, 'section-list');
    if (headerBtn.nextElementSibling !== listWrap) section.insertBefore(listWrap, headerBtn.nextElementSibling || null);

    return { section, headerBtn, listWrap };
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 5 of 6 — buildLabelsSection (pre-R4.7.3 lines 1851-2000)
 * Main sidebar render function. Builds the section header, per-type
 * groups, per-label rows ("Open label", "Manage labels", row-level
 * "more" context menu, inline previews of chats with the label).
 * Was called from ensureInjected + MOD.buildSection API.
 *
 * 0F6a retains a no-op stub at the original location (returns null)
 * so MOD.buildSection forwarding still resolves; the original body
 * is preserved here for reference and rollback.
 * ─────────────────────────────────────────────────────────────────── */

  function buildLabelsSection(projectsSection, existingSection = null, reason = 'build') {
    ensureStyle();
    readCatalog();

    const prepared = prepareLabelsSection(projectsSection, existingSection);
    if (!prepared) return null;
    const { section, headerBtn, listWrap } = prepared;
    recordLabelsShellSeen(section, reason);

    const tplDiv = D.querySelector(`nav ${SEL.sidebarItemDiv}`) || D.querySelector(SEL.sidebarItemDiv) || null;
    const tplA = D.querySelector(`nav ${SEL.sidebarItemAnchor}`) || D.querySelector(SEL.sidebarItemAnchor) || null;
    const fallbackClass = tplDiv?.className || tplA?.className || 'group __menu-item hoverable';

    let expanded = readUi().expanded;
    const applyExpanded = () => {
      const ui = readUi();
      expanded = ui.expanded !== false;
      headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      listWrap.style.display = expanded ? '' : 'none';
      syncHeaderArrow(headerBtn, expanded);
    };
    const setExpanded = (value) => {
      writeUi({ expanded: !!value });
      if (value) applyTypeExpandModeOnSectionOpen();
      render();
    };

    headerBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(!readUi().expanded);
    };

    const makeActionRow = (text, onClick, opts = {}) => {
      const row = makeRowShell(tplDiv, tplA, fallbackClass, 'div');
      setRowText(row, text);
      injectIcon(row, opts.color || '');
      row.setAttribute(ATTR_CGXUI, UI_LABELS_ROW);
      row.setAttribute(ATTR_CGXUI_OWNER, SkID);
      return wireAsButton(row, onClick);
    };

    const makeLabelRow = (typeDef, record, count) => {
      const ui = readUi();
      const previewEnabled = ui.inlinePreview === true;
      const isPreviewOpen = previewEnabled && isLabelPreviewOpen(typeDef.key, record.id, ui);
      const row = makeActionRow(record.label, () => openLabelByMode(typeDef.key, record.id), { color: record.color });
      row.setAttribute('data-h2o-label-type', typeDef.key);
      row.setAttribute('data-h2o-label-id', record.id);
      row.title = `${typeDef.fullLabel}: ${record.label}`;
      const trunc = row.querySelector?.(SEL.sidebarTruncate);
      if (trunc && ui.showCounts !== false) trunc.parentElement?.appendChild(makeLabelCountSpan(count));
      const more = makeNativeLikeMoreButton(`Label actions for ${record.label}`);
      more.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLabelActionsPop(more, typeDef, record, count);
      };
      row.appendChild(more);
      if (previewEnabled) {
        makeIconToggle(
          row,
          isPreviewOpen ? 'Hide chats' : 'Show chats',
          () => {
            setLabelPreviewOpen(typeDef.key, record.id, !isPreviewOpen);
            rerenderLabelsSection('label-preview-toggle');
          },
          isPreviewOpen,
          record.color
        );
      }
      return { row, isPreviewOpen };
    };

    const makeSubChatRow = (href, text) => {
      const a = makeRowShell(tplDiv, tplA, fallbackClass, 'a');
      a.setAttribute('href', href);
      a.setAttribute('role', 'link');
      a.classList.add('ps-9');
      removeSurfaceChatLeadingIcon(a);
      setRowText(a, cleanSurfaceChatTitle(text));
      return a;
    };

    const render = () => {
      const ui = readUi();
      const cfg = readCfg();
      const catalog = readCatalog();
      const counts = getLabelCounts();
      listWrap.replaceChildren();

      listWrap.appendChild(makeActionRow('Manage labels', () => openLabelsByMode(), { color: '#A855F7' }));
      listWrap.appendChild(makeActionRow('Label current chat', () => openAssignModal(toChatId(), { source: 'sidebar-action' }), { color: '#3B82F6' }));

      listTypeDefs().filter((typeDef) => isTypeVisible(typeDef.key, ui)).forEach((typeDef) => {
        const rows = (catalog[typeDef.key] || []).filter((row) => row.builtIn || typeDef.key === 'custom' || (counts[typeDef.key]?.[row.id] || 0) > 0);
        if (!rows.length && typeDef.key === 'custom') return;
        const typeExpanded = getTypeExpanded(typeDef.key, ui);
        const groupWrap = D.createElement('div');
        groupWrap.setAttribute(ATTR_CGXUI_STATE, 'group');
        const groupBtn = makeTypeHeaderButton(typeDef, typeExpanded, () => {
          setTypeExpanded(typeDef.key, !getTypeExpanded(typeDef.key));
          rerenderLabelsSection('type-toggle');
        });
        groupWrap.appendChild(groupBtn);
        const groupBody = D.createElement('div');
        groupBody.setAttribute(ATTR_CGXUI_STATE, 'group-body');
        groupBody.style.display = typeExpanded ? '' : 'none';
        const limit = cfg.visibleLabelsPerType || CFG_SEE_MORE_LIMIT;
        rows.slice(0, limit).forEach((record) => {
          const block = D.createElement('div');
          block.setAttribute(ATTR_CGXUI_STATE, 'label-block');
          const { row, isPreviewOpen } = makeLabelRow(typeDef, record, counts[typeDef.key]?.[record.id] || 0);
          block.appendChild(row);
          if (ui.inlinePreview === true && isPreviewOpen) {
            const chats = listChatsByLabel(typeDef.key, record.id);
            chats.slice(0, 5).forEach((chat) => {
              if (!chat?.href) return;
              block.appendChild(makeSubChatRow(chat.href, chat.title || chat.chatId || chat.href));
            });
            if (chats.length > 5) {
              const moreChats = makeActionRow('Show more', () => openLabelByMode(typeDef.key, record.id), { color: record.color });
              moreChats.classList.add('ps-9');
              block.appendChild(moreChats);
            }
          }
          groupBody.appendChild(block);
        });
        if (rows.length > limit) {
          const more = makeActionRow('More', () => openLabelsByMode({ focusType: typeDef.key }), { color: '#888888' });
          more.setAttribute(ATTR_CGXUI_STATE, 'labels-more');
          groupBody.appendChild(more);
        }
        groupWrap.appendChild(groupBody);
        listWrap.appendChild(groupWrap);
      });

      applyExpanded();
      if (ui.inlinePreview) section.setAttribute('data-cgxui-inline-preview', 'true');
      else section.removeAttribute('data-cgxui-inline-preview');
      syncLabelSidebarActiveState('render');
    };

    section.appendChild(headerBtn);
    section.appendChild(listWrap);
    section._cgxuiRender = render;
    render();
    recordLabelsHydrated(section, reason);
    return section;
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 6 of 6 — Sidebar lifecycle (pre-R4.7.3 lines 2002-2202)
 * The sidebar-section lifecycle handlers:
 *   - activePageLabelKey
 *   - syncLabelSidebarActiveState
 *   - scheduleLabelSidebarActiveSync
 *   - rerenderLabelsSection
 *   - ensureSidebarObserver
 *   - scheduleEnsure
 *   - ensureInjected
 *
 * 0F6a retains no-op stubs for ALL of these because they have
 * external callers that R4.7.3 must not break:
 *   - rerenderLabelsSection ← called from createLabel/renameLabel/
 *     deleteLabel/afterLabelMutation/setTypeVisible/setShowCounts.
 *     Keeping the function as a no-op preserves the call site
 *     without rendering anything.
 *   - syncLabelSidebarActiveState ← called from workspace viewers
 *     (closeViewer/openLabelsViewer/openLabelViewer; R4.7.4 scope).
 *   - scheduleEnsure / ensureInjected ← exposed via MOD API and
 *     called from boot late-init.
 *
 * The bodies below are preserved here as the source of truth for
 * the original implementation.
 * ─────────────────────────────────────────────────────────────────── */

  function activePageLabelKey() {
    try {
      const page = state.pageEl?.isConnected ? state.pageEl : null;
      if (page?.getAttribute?.('data-cgxui-page-kind') !== 'label') return '';
      return String(page.getAttribute('data-cgxui-page-id') || '');
    } catch {
      return '';
    }
  }

  function syncLabelSidebarActiveState(reason = 'sync') {
    try {
      state.sidebarActiveSyncCount = Number(state.sidebarActiveSyncCount || 0) + 1;
      state.lastSidebarActiveSyncReason = String(reason || 'sync');
      state.sidebarLastActiveSyncReason = String(reason || 'sync');
      state.sidebarLastActiveSyncAt = Date.now();
      const currentChatId = toChatId();
      const currentLabels = currentChatId ? getChatLabels(currentChatId) : normalizeBindingRow(null);
      const pageKey = activePageLabelKey();
      D.querySelectorAll(utilSelScoped(UI_LABELS_ROW)).forEach((row) => {
        const type = normalizeType(row.getAttribute('data-h2o-label-type') || '');
        const labelId = slugify(row.getAttribute('data-h2o-label-id') || '');
        if (!type || !labelId) {
          row.removeAttribute('aria-current');
          return;
        }
        const value = currentLabels[type];
        const activeForChat = TYPE_DEFS[type]?.cardinality === 'single'
          ? value === labelId
          : (Array.isArray(value) ? value : []).includes(labelId);
        const activeForPage = pageKey === `${type}:${labelId}`;
        if (activeForChat || activeForPage) row.setAttribute('aria-current', 'true');
        else row.removeAttribute('aria-current');
      });
    } catch (e) {
      err('sync-label-active-state', e);
    }
  }

  function scheduleLabelSidebarActiveSync(reason = 'sync') {
    if (state.sidebarActiveSyncTimer) return;
    state.sidebarActiveSyncTimer = W.setTimeout(() => {
      const timer = state.sidebarActiveSyncTimer;
      state.sidebarActiveSyncTimer = 0;
      state.clean.timers.delete(timer);
      syncLabelSidebarActiveState(reason);
    }, 0);
    state.clean.timers.add(state.sidebarActiveSyncTimer);
  }

  function rerenderLabelsSection(reason = 'rerender') {
    try {
      D.querySelectorAll(utilSelScoped(UI_LABELS_ROOT)).forEach((section) => {
        const fn = section?._cgxuiRender;
        if (typeof fn === 'function') fn();
      });
      state.sidebarRenderCount = Number(state.sidebarRenderCount || 0) + 1;
      state.lastSidebarRenderReason = String(reason || 'rerender');
      state.sidebarLastRenderReason = String(reason || 'rerender');
      state.sidebarLastRenderAt = Date.now();
      step('rerender-section', reason);
    } catch (e) {
      err('rerender-section', e);
    }
  }

  function ensureSidebarObserver(root) {
    if (!(root instanceof HTMLElement)) return;
    if (state.observedRoot === root && state.sidebarMO) return;
    try { state.sidebarMO?.disconnect?.(); } catch {}
    state.observedRoot = root;
    const mo = new MutationObserver((muts) => {
      if (state.suppressMO) return;
      if (mutationHasOnlyH2OOwnedNodes(muts)) {
        if (D.querySelector(utilSelScoped(UI_LABELS_ROOT))) {
          state.sidebarSkippedH2OMutations = Number(state.sidebarSkippedH2OMutations || 0) + 1;
          scheduleLabelSidebarActiveSync('h2o-owned-mutation');
          return;
        }
      }
      const relevant = muts.some((mu) => {
        const target = mu.target;
        if (!(target instanceof HTMLElement)) return true;
        return !target.closest?.([
          utilSelScoped(UI_LABELS_ROOT),
          utilSelScoped(UI_LABELS_MODAL),
          utilSelScoped(UI_LABELS_VIEWER),
          utilSelScoped(UI_LABELS_PAGE_HOST),
          utilSelScoped(UI_LABELS_PAGE),
          utilSelScoped(UI_LABELS_POP),
        ].join(','));
      });
      if (!relevant) return;
      scheduleLabelSidebarActiveSync('sidebar-mutation');
      scheduleEnsure('mutation');
    });
    mo.observe(root, { childList: true, subtree: true });
    state.sidebarMO = mo;
    state.clean.observers.add(() => { try { mo.disconnect(); } catch {} });
  }

  function scheduleEnsure(reason = 'schedule') {
    if (state.ensureTimer) W.clearTimeout(state.ensureTimer);
    state.ensureTimer = W.setTimeout(() => {
      const timer = state.ensureTimer;
      state.ensureTimer = 0;
      state.clean.timers.delete(timer);
      ensureInjected(reason);
    }, 180);
    state.clean.timers.add(state.ensureTimer);
  }

  function ensureInjected(reason = 'ensure') {
    if (state.building) return false;
    state.sidebarEnsureCount = Number(state.sidebarEnsureCount || 0) + 1;
    state.lastSidebarEnsureReason = String(reason || 'ensure');
    state.sidebarLastEnsureReason = String(reason || 'ensure');
    state.sidebarLastEnsureAt = Date.now();
    const h2 = findProjectsH2();
    const projectsSection = h2 ? findProjectsSection(h2) : null;
    const existingGlobal = findLabelsRoot();
    if (!(projectsSection instanceof HTMLElement) && !existingGlobal) return false;
    const parent = projectsSection?.parentElement || existingGlobal?.parentElement || null;
    if (!(parent instanceof HTMLElement)) return false;
    ensureSidebarObserver(pickSidebarRoot(projectsSection || parent));

    const existing = parent.querySelector(`:scope > ${utilSelScoped(UI_LABELS_ROOT)}`) || existingGlobal;
    const folderRoot = parent.querySelector(':scope > [data-cgxui="flsc-root"][data-cgxui-owner="flsc"]');
    const beforeNode = projectsSection instanceof HTMLElement ? (folderRoot || projectsSection) : null;
    const labelRoots = [...D.querySelectorAll(utilSelScoped(UI_LABELS_ROOT))].filter((node) => node instanceof HTMLElement);

    if (existing && (!beforeNode || existing.nextElementSibling === beforeNode)) {
      if (!existing._cgxuiRender || existing.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
        buildLabelsSection(projectsSection, existing, reason || 'already-ok-hydrate');
      } else {
        recordLabelsShellSeen(existing, reason || 'already-ok');
      }
      syncLabelSidebarActiveState(reason || 'already-ok');
      step('already-ok', reason);
      return true;
    }

    if (existing && beforeNode) {
      state.suppressMO = true;
      try {
        if (!existing._cgxuiRender || existing.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
          buildLabelsSection(projectsSection, existing, reason || 'placement-hydrate');
        }
        labelRoots.forEach((node) => { if (node !== existing) safeRemove(node); });
        parent.insertBefore(existing, beforeNode);
        state.sidebarPlacementRepairCount = Number(state.sidebarPlacementRepairCount || 0) + 1;
        syncLabelSidebarActiveState(reason || 'placement-repair');
        step('placement-repair', `${reason}:before-${folderRoot ? 'folders' : 'projects'}`);
        return true;
      } catch (e) {
        err('placement-repair', e);
      } finally {
        state.suppressMO = false;
      }
    }
    if (existing && !beforeNode) {
      state.building = true;
      state.suppressMO = true;
      try {
        labelRoots.forEach((node) => { if (node !== existing) safeRemove(node); });
        buildLabelsSection(projectsSection, existing, reason || 'hydrate-existing');
        syncLabelSidebarActiveState(reason || 'hydrated');
        step('hydrated', reason);
        return true;
      } catch (e) {
        err('hydrate-existing', e);
        return false;
      } finally {
        state.suppressMO = false;
        state.building = false;
      }
    }

    state.building = true;
    state.suppressMO = true;
    try {
      labelRoots.forEach((node) => safeRemove(node));
      if (!(projectsSection instanceof HTMLElement)) return false;
      const section = buildLabelsSection(projectsSection, null, reason || 'build');
      if (!section) return false;
      parent.insertBefore(section, beforeNode);
      state.sidebarRenderCount = Number(state.sidebarRenderCount || 0) + 1;
      state.lastSidebarRenderReason = String(reason || 'ensure');
      state.sidebarLastRenderReason = String(reason || 'ensure');
      state.sidebarLastRenderAt = Date.now();
      syncLabelSidebarActiveState(reason || 'injected');
      step('injected', `${reason}:before-${folderRoot ? 'folders' : 'projects'}`);
      return true;
    } catch (e) {
      err('ensure-injected', e);
      return false;
    } finally {
      state.suppressMO = false;
      state.building = false;
    }
  }
