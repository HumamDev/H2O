/*
 * R4.7.6 retired Native Folders sidebar UI archive.
 *
 * Source: src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js
 * Destination: retired-features/native-library-ui/0F3a-folders-ui/folders-sidebar-list.js
 *
 * Block 1 of 6 — R4.6.3 per-element org gate for folder rows/more buttons.
 * Block 2 of 6 — CSS for flsc-folder-row / flsc-folder-more sidebar row affordances.
 * Block 3 of 6 — UI_openFolderActionsPop archival reference (shared popup used by retired sidebar more buttons; live function may remain for non-sidebar compatibility).
 * Block 4 of 6 — UI_buildFoldersSection sidebar row/list render path.
 * Block 5 of 6 — CORE_FS_syncFolderSidebarActiveState active-row sync path.
 * Block 6 of 6 — CORE_FS_ensureInjected sidebar injection lifecycle.
 *
 * Hard boundary: ENGINE_injectAddToLibrary, ENGINE_injectAddToFolder,
 * STORE_validateFolderCreate, folder data/store/binding logic, and
 * capture/save/link paths stay live in 0F3a.
 */

/* Block 1 of 6 — R4.6.3 per-element org gate */
  /* ── R4.6.3 — Per-element gate (cascade-proof, see 0F4a for pattern) ─
   * Per-folder "more" button has inline style.cssText including
   * `display:inline-flex` which survived R4.6.2's CSS rule. R4.6.3
   * uses el.style.setProperty('display','none','important') — the
   * inline !important flag set via CSSOM beats ANY other source
   * (cascade, inline non-!important, etc.). ENGINE_injectAddToLibrary
   * + ENGINE_injectAddToFolder use different cgxui values
   * (flsc-add-to-folder, flsc-add-to-library) and are NEVER affected. */
  const R46_ORG_SELECTORS = [
    '[data-cgxui="flsc-folder-row"]',
    '[data-cgxui="flsc-folder-more"]',
  ];
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



/* Block 2 of 6 — folder row/more CSS (commented archival text) */
// /* B) Folder row “⋯” button */
// ${FROW},
// ${CROW}{
//   position:relative;
//   padding-right:40px !important;
// }
// ${ROOT} [data-cgxui-state="folder-row-wrap"]{
//   position:relative;
// }
// ${FROW}:not(:hover):not([aria-current="true"]),
// ${CROW}:not(:hover):not([aria-current="true"]){
//   background: transparent !important;
// }
// ${FMORE},
// ${CMORE}{
//   all:unset !important;
//   box-sizing:border-box !important;
//   position:absolute !important;
//   right:9px !important;
//   top:50% !important;
//   transform:translateY(-50%) !important;
//   display:inline-flex !important;
//   align-items:center !important;
//   justify-content:center !important;
//   width:30px !important;
//   min-width:30px !important;
//   max-width:30px !important;
//   height:30px !important;
//   min-height:30px !important;
//   max-height:30px !important;
//   flex:0 0 30px !important;
//   padding:0 !important;
//   margin:0 !important;
//   border:0 !important;
//   border-radius:8px !important;
//   background:transparent !important;
//   color:var(--text-primary, #fff) !important;
//   cursor:pointer !important;
//   pointer-events:auto !important;
//   touch-action:manipulation !important;
//   z-index:20 !important;
//   outline:none !important;
//   appearance:none !important;
//   -webkit-appearance:none !important;
//   opacity:.72;
//   visibility:visible;
//   transition:opacity .12s ease, background .12s ease, color .12s ease;
// }
// ${ROOT} [data-cgxui-state="folder-row-wrap"]:hover ${FMORE},
// ${ROOT} [data-cgxui-state="folder-row-wrap"]:focus-within ${FMORE},
// ${FROW}:hover ${FMORE},
// ${FROW}:focus-within ${FMORE},
// ${CROW}:hover ${CMORE},
// ${CROW}:focus-within ${CMORE}{
//   opacity:1;
//   visibility:visible;
// }
// ${FMORE}:focus-visible,
// ${CMORE}:focus-visible{
//   box-shadow:0 0 0 2px rgba(255,255,255,.26) inset !important;
// }
// ${FMORE} svg,
// ${CMORE} svg{
//   width:20px !important;
//   height:20px !important;
//   display:block !important;
//   flex:0 0 20px !important;
//   opacity:1 !important;
//   pointer-events:none !important;
// }
// ${FMORE}:hover,
// ${CMORE}:hover{
//   color:var(--text-primary, #fff);
//   background:var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)) !important;
// }
// ${FMORE}:active,
// ${CMORE}:active{ background:var(--interactive-bg-secondary-press, rgba(255,255,255,.12)) !important; }
// 
// 
// /* F) Active group row (contains current chat) */
// ${FROW}[aria-current="true"],
// ${CROW}[aria-current="true"]{
//   background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
//   border-radius: 8px;
// }
// 

/* Block 3 of 6 — UI_openFolderActionsPop archival reference */
  function UI_openFolderActionsPop(anchorEl, folder, afterChange = null) {
    if (!anchorEl || !folder) return;
    const folderId = String(folder.id || folder.folderId || '').trim();
    const folderName = String(folder.name || folder.title || folderId || 'Folder');
    const folderColor = STORE_normalizeProjectColor(folder.iconColor || folder.color);
    return UI_openFolderPop(anchorEl, [
      { type: 'title', label: 'Folder actions' },
      UI_colorGridItem('Color', folderColor, (color) => {
        STORE_setFolderIconColor(folderId, color);
        afterChange?.();
      }, true),
      'sep',
      {
        label: 'Open folder',
        iconSvg: FRAG_SVG_FOLDER,
        onClick: () => UI_openFolderByMode(folderId),
      },
      'sep',
      {
        label: 'Open in Studio',
        iconSvg: FRAG_SVG_FOLDER,
        onClick: () => {
          const hash = `#/saved?folder=${encodeURIComponent(folderId)}`;
          H2O.archiveBoot?.openWorkbench?.(hash);
        },
      },
      'sep',
      {
        label: 'Rename folder',
        onClick: async () => {
          const next = await UI_openNameModal({
            title: 'Rename folder',
            placeholder: 'Folder name',
            initialValue: folderName,
            confirmText: 'Rename'
          });
          if (!next) return;

          const result = STORE_renameFolder(folderId, next, {
            source: 'folder-actions-rename',
            rerender: false,
          });
          if (!result.ok) {
            if ((result.blockers || []).includes('same-name-conflict')) return alert('Folder already exists.');
            if ((result.blockers || []).includes('reserved-folder-name')) return alert(`${next} is a view, not a folder.`);
            return alert('Folder rename blocked.');
          }
          if (result.applied) {
            afterChange?.();
            ENGINE_rerenderAllSections();
          }
        }
      },
      'sep',
      {
        label: 'Delete folder',
        danger: true,
        onClick: async () => {
          const preview = API_previewMetadataOperation({
            schema: FOLDER_METADATA_OPERATION_SCHEMA,
            operationType: 'delete-folder',
            folderId,
            sourceSurface: 'native-chatgpt',
            reason: 'Native folder action delete preview',
          });
          const blockerCodes = (preview.blockers || []).map((entry) => String(entry?.code || entry || '')).filter(Boolean);
          if (blockerCodes.includes('delete-non-empty-folder-blocked')) {
            return alert('Only empty folders can be deleted.');
          }
          const hardBlockers = blockerCodes.filter((code) => code !== 'delete-confirmation-required');
          if (hardBlockers.length) {
            return alert(`Folder delete blocked: ${hardBlockers[0]}`);
          }

          const confirmed = await UI_openExactConfirmationModal({
            title: 'Delete empty folder',
            message: `Delete "${folderName}" from H2O folders. This only applies to empty folders and does not delete chats.`,
            requiredText: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
            confirmText: 'Delete',
            inputLabel: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
            danger: true,
          });
          if (!confirmed) return;

          const result = API_applyMetadataOperation({
            schema: FOLDER_METADATA_OPERATION_SCHEMA,
            operationType: 'delete-folder',
            folderId,
            confirmation: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
            sourceSurface: 'native-chatgpt',
            reason: 'Native folder action empty delete',
          });
          if (!result.ok || !result.applied) {
            const resultBlockers = (result.blockers || []).map((entry) => String(entry?.code || entry || '')).filter(Boolean);
            if (resultBlockers.includes('delete-non-empty-folder-blocked')) return alert('Only empty folders can be deleted.');
            return alert(`Folder delete blocked${resultBlockers[0] ? `: ${resultBlockers[0]}` : '.'}`);
          }
          UI_closeFolderPop();
          afterChange?.();
          ENGINE_rerenderAllSections();
          UI_refreshActivePageForAppearance('folder', folderId);
        }
      },
      'sep',
      {
        label: 'Copy folder ID',
        onClick: () => UI_copyTextValue(folderId, 'Folder ID'),
      },
    ], { menuKind: 'folder-actions', folderId });
  }

/* Block 4 of 6 — UI_buildFoldersSection */
  function UI_buildFoldersSection(projectsSection, existingSection = null, reason = 'build') {
    const prepared = UI_prepareSidebarSection(existingSection, projectsSection, UI_FSECTION_ROOT, CFG_FSECTION_LABEL);
    if (!prepared) return null;
    const { section, headerBtn, listWrap } = prepared;
    UI_recordShellSeen('folders', section, reason);

    // row templates
    const tplDiv = D.querySelector(`nav ${SEL.sidebarItemDiv}`) || D.querySelector(SEL.sidebarItemDiv) || null;
    const tplA   = D.querySelector(`nav ${SEL.sidebarItemAnchor}`) || D.querySelector(SEL.sidebarItemAnchor) || null;
    const FALLBACK_ROW_CLASS = (tplDiv?.className || tplA?.className || 'group __menu-item hoverable');

    const makeActionRow = (text, iconSvg, onClick, opts = {}) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'div');
      UI_setRowText(row, text);
      UI_injectIcon(row, iconSvg, { color: opts.color });
      return UI_wireAsButton(row, onClick);
    };

    const makeFolderRow = (text, iconSvg, onClick, opts = {}) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'div');
      UI_setRowText(row, text);
      UI_injectIcon(row, iconSvg, { color: opts.color });
      return UI_wireAsButton(row, onClick);
    };

    const makeFolderMoreRow = (text, onClick) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'div');
      UI_setRowText(row, text);
      row.classList.add('ps-9');
      row.setAttribute('data-cgxui-state', 'folder-show-more');
      return UI_wireAsButton(row, onClick);
    };

    const makeSubChatRow = (href, text) => {
      const a = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'a');
      a.setAttribute('href', href);
      a.setAttribute('role', 'link');
      a.classList.add('ps-9');
      UI_removeSurfaceChatLeadingIcon(a);
      UI_setRowText(a, UI_cleanSurfaceChatTitle(text));
      return a;
    };

    // independent expand/collapse state
    let expanded = STORE_readUI().foldersExpanded;

    const applyExpandedToDOM = () => {
      headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      listWrap.style.display = expanded ? '' : 'none';
      UI_syncSectionHeaderArrow(headerBtn, expanded);
    };

    const setExpanded = (v) => {
      expanded = !!v;
      const ui = STORE_readUI();
      ui.foldersExpanded = expanded;
      STORE_writeUI(ui);
      // also keep legacy "h2o:folders:expanded" string key in sync
      UTIL_storage.setStr(KEY_LEG_EXP, expanded ? '1' : '0');
      UTIL_storage.setJSON(KEY_FSECTION_STATE_EXP_V1, { expanded });
      applyExpandedToDOM();
    };

    headerBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); };

    const applySeeMoreControl = (renderedFolders = []) => {
      listWrap.querySelectorAll(':scope > [data-cgxui-state="see-more"], :scope > [data-cgxui-state="folders-more"]').forEach((n) => n.remove());

      const groups = [...listWrap.querySelectorAll(':scope > [data-cgxui-state="folder-group"]')];
      const updateKindDividers = () => {
        listWrap.querySelectorAll(':scope > [data-cgxui-state="kind-divider"]').forEach((divider) => {
          let prev = divider.previousElementSibling;
          while (prev && prev.getAttribute('data-cgxui-state') !== 'folder-group') prev = prev.previousElementSibling;
          let next = divider.nextElementSibling;
          while (next && next.getAttribute('data-cgxui-state') !== 'folder-group') next = next.nextElementSibling;

          const prevVisible = !!prev && prev.style.display !== 'none';
          const nextVisible = !!next && next.style.display !== 'none';
          divider.style.display = prevVisible && nextVisible ? '' : 'none';
        });
      };

      if (groups.length <= CFG_SEE_MORE_LIMIT) {
        groups.forEach((g) => (g.style.display = 'contents'));
        updateKindDividers();
        return;
      }

      groups.forEach((g, i) => {
        g.style.display = i < CFG_SEE_MORE_LIMIT ? 'contents' : 'none';
      });
      updateKindDividers();

      const row = makeActionRow('More', FRAG_SVG_MORE, () => {});
      row.setAttribute('data-cgxui-state', 'folders-more');
      row.setAttribute('aria-label', 'More folders');
      row.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        UI_openFoldersMoreByMode(row, renderedFolders);
      };
      row.onkeydown = (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        UI_openFoldersMoreByMode(row, renderedFolders);
      };
      listWrap.appendChild(row);
    };

    const render = () => {
      const data = STORE_readData();
      const ui = STORE_readUI();

      listWrap.replaceChildren();

      // New folder
      listWrap.appendChild(makeActionRow('New folder', FRAG_SVG_ADD, async () => {
        const name = await UI_openNameModal({
          title: 'Create folder',
          placeholder: 'Folder name',
          initialValue: '',
          confirmText: 'Create folder'
        });
        if (!name) return;
        if (UTIL_isReservedFolderViewName(name)) return alert(`${name} is a view, not a folder.`);

        const result = STORE_createFolder(name, {
          source: 'sidebar-folder-create',
        });
        if (!result.ok) {
          if ((result.blockers || []).includes('same-name-conflict')) return alert('Folder already exists.');
          if ((result.blockers || []).includes('reserved-folder-name')) return alert(`${name} is a view, not a folder.`);
          return alert('Folder create blocked.');
        }
        render();
      }));

      const realFolders = data.folders.filter((folder) => !UTIL_isReservedFolderViewName(folder.name));
      const projectFolders = realFolders.filter((folder) => folder.kind === 'project_backed');
      const localFolders = realFolders.filter((folder) => folder.kind !== 'project_backed');
      const folderGroups = [
        projectFolders,
        localFolders,
      ].filter((folders) => folders.length);
      const currentChatHref = D.querySelector(SEL.currentChatAnchor)?.getAttribute('href') || '';
      const currentChatKey = API_normalizeChatBindingKey(currentChatHref);
      const currentChatCandidates = new Set((currentChatKey.candidates || []).map((value) => String(value || '').trim()).filter(Boolean));
      const folderCounts = STORE_computeFolderCounts(data);
      const renderedFolderRows = [];
      const renderedFolders = [];

      const hrefMatchesCurrentChat = (href) => {
        if (!currentChatCandidates.size) return false;
        const key = API_normalizeChatBindingKey(href);
        return (key.candidates || []).some((value) => currentChatCandidates.has(String(value || '').trim()));
      };

      const appendKindDivider = () => {
        const divider = D.createElement('div');
        divider.setAttribute('data-cgxui-state', 'kind-divider');
        divider.setAttribute(ATTR_CGXUI_OWNER, SkID);
        listWrap.appendChild(divider);
      };

      // Folder groups
      folderGroups.forEach((folders, groupIndex) => {
        if (groupIndex > 0) appendKindDivider();

        folders.forEach((folder) => {
          renderedFolders.push(folder);
          const inlinePreviewEnabled = ui.folderInlinePreviewOnOpen !== false;
          const isOpen = inlinePreviewEnabled && !!ui.openFolders[folder.id];
          const hrefs = STORE_listFolderItems(data, folder.id);
          const isActiveFolder = hrefs.some(hrefMatchesCurrentChat);

          const grp = D.createElement('div');
          grp.setAttribute('data-cgxui-state', 'folder-group');
          grp.style.display = 'contents';

          const folderColor = STORE_normalizeProjectColor(folder.iconColor);
          const toggleFolder = () => {
            const u = STORE_readUI();
            u.openFolders[folder.id] = !u.openFolders[folder.id];
            STORE_writeUI(u);
            render();
          };

          const row = makeFolderRow(folder.name, FRAG_SVG_FOLDER, () => {
            UI_openFolderByMode(folder.id);
          }, { color: folderColor });
          if (inlinePreviewEnabled) UI_makeIconToggle(row, isOpen ? 'Hide chats' : 'Show chats', toggleFolder, isOpen);

          // mark row as owned for CSS hover more button
          row.setAttribute(ATTR_CGXUI, UI_FSECTION_FOLDER_ROW);
          row.setAttribute(ATTR_CGXUI_OWNER, SkID);
          row.setAttribute('data-cgxui-folder-id', folder.id);
          renderedFolderRows.push({ row, isActiveFolder });

          const rowWrap = D.createElement('div');
          rowWrap.setAttribute(ATTR_CGXUI_STATE, 'folder-row-wrap');
          rowWrap.setAttribute(ATTR_CGXUI_OWNER, SkID);
          rowWrap.setAttribute('data-h2o-folder-action-wrap', '1');
          rowWrap.setAttribute('data-h2o-folder-id', String(folder.id || ''));

          const more = UI_bindFolderMoreButton(UI_makeNativeLikeMoreButton('Folder actions', UI_FSECTION_FOLDER_MORE), () => {
            UI_openFolderActionsPop(more, folder, render);
          });
          more.setAttribute('data-h2o-folder-id', String(folder.id || folder.folderId || ''));

          rowWrap.appendChild(row);
          rowWrap.appendChild(more);

          const trunc = row.querySelector?.(SEL.sidebarTruncate);
          if (trunc && ui.showFolderCounts !== false) {
            const span = D.createElement('span');
            span.style.opacity = '.6';
            span.style.marginLeft = '8px';
            span.style.fontSize = '12px';
            span.textContent = `(${Number(folderCounts.byFolder?.[folder.id] ?? hrefs.length) || 0})`;
            trunc.parentElement?.appendChild(span);
          }

          grp.appendChild(rowWrap);

          if (isOpen) {
            const previewHrefs = hrefs.slice(0, CFG_FOLDER_CHAT_PREVIEW_LIMIT);
            previewHrefs.forEach((fullHref) => {
              const title = DOM_findChatTitleInSidebarByHref(fullHref);
              const fallbackId = DOM_parseChatIdFromHref(fullHref);
              const label = title ? title : (fallbackId || fullHref);
              grp.appendChild(makeSubChatRow(fullHref, label));
            });
            if (hrefs.length > CFG_FOLDER_CHAT_PREVIEW_LIMIT) {
              grp.appendChild(makeFolderMoreRow('Show more', () => UI_openFolderByMode(folder.id)));
            }
          }

          listWrap.appendChild(grp);
        });
      });

      let activeFolderMarked = false;
      renderedFolderRows.forEach(({ row, isActiveFolder }) => {
        if (isActiveFolder && !activeFolderMarked) {
          row.setAttribute('aria-current', 'true');
          activeFolderMarked = true;
        } else {
          row.removeAttribute('aria-current');
        }
      });

      applySeeMoreControl(renderedFolders);
      applyExpandedToDOM();
    };

    section.appendChild(headerBtn);
    section.appendChild(listWrap);

    // store render function on owned root (no raw "h2o" fields)
    section._cgxuiRender = render;

    render();
    applyExpandedToDOM();
    UI_recordHydrated('folders', section, reason);

    return section;
  }

/* Block 5 of 6 — CORE_FS_syncFolderSidebarActiveState */
  function CORE_FS_syncFolderSidebarActiveState(reason = 'sync') {
    try {
      STATE.sidebarActiveSyncCount = Number(STATE.sidebarActiveSyncCount || 0) + 1;
      STATE.lastSidebarActiveSyncReason = String(reason || 'sync');
      STATE.sidebarLastActiveSyncReason = String(reason || 'sync');
      STATE.sidebarLastActiveSyncAt = Date.now();
      const route = ROUTE_parseCurrent();
      const activeRouteFolderId = route?.view === 'folder' ? String(route.id || '').trim() : '';
      const currentHref = D.querySelector(SEL.currentChatAnchor)?.getAttribute('href') || W.location.pathname || '';
      const activeBinding = API_getBinding(currentHref);
      let activeMarked = false;
      D.querySelectorAll(UTIL_selScoped(UI_FSECTION_FOLDER_ROW)).forEach((row) => {
        const folderId = String(row.getAttribute('data-cgxui-folder-id') || '').trim();
        const matchesCurrentChat = !!folderId && String(activeBinding.folderId || '') === folderId;
        const active = !!folderId && !activeMarked && (folderId === activeRouteFolderId || matchesCurrentChat);
        if (active) {
          row.setAttribute('aria-current', 'true');
          activeMarked = true;
        } else {
          row.removeAttribute('aria-current');
        }
      });
    } catch (e) {
      DIAG_err('syncFolderSidebarActiveState', e);
    }
  }

/* Block 6 of 6 — CORE_FS_ensureInjected */
  function CORE_FS_ensureInjected(reason) {
    if (STATE.building) return false;
    STATE.sidebarEnsureCount = Number(STATE.sidebarEnsureCount || 0) + 1;
    STATE.lastSidebarEnsureReason = String(reason || 'ensure');
    STATE.sidebarLastEnsureReason = String(reason || 'ensure');
    STATE.sidebarLastEnsureAt = Date.now();

    const h2 = DOM_findProjectsH2();
    const projectsSection = h2 ? DOM_findProjectsSection(h2) : null;
    const existingFoldersGlobal = DOM_findOwnedRoot(UI_FSECTION_ROOT);
    const existingCategoriesGlobal = DOM_findOwnedRoot(UI_FSECTION_CATEGORIES_ROOT);
    if (!(projectsSection instanceof HTMLElement) && !existingFoldersGlobal && !existingCategoriesGlobal) return false;

    const parent = projectsSection?.parentElement || existingFoldersGlobal?.parentElement || existingCategoriesGlobal?.parentElement || null;
    if (!(parent instanceof HTMLElement)) return false;

    OBS_ensureSidebarObserver(DOM_pickSidebarRoot(projectsSection || parent));
    if (projectsSection instanceof HTMLElement) LIBCORE_applyProjectsNativeControls(projectsSection);

    const folderRoots = [...D.querySelectorAll(UTIL_selScoped(UI_FSECTION_ROOT))].filter((node) => node instanceof HTMLElement);
    const categoryRoots = [...D.querySelectorAll(UTIL_selScoped(UI_FSECTION_CATEGORIES_ROOT))].filter((node) => node instanceof HTMLElement);
    const existingFolders = folderRoots.find((node) => node instanceof HTMLElement) || null;
    const existingCategories = categoryRoots.find((node) => node instanceof HTMLElement) || null;
    if (
      projectsSection instanceof HTMLElement &&
      existingFolders &&
      existingCategories &&
      projectsSection.previousElementSibling === existingCategories &&
      existingCategories.previousElementSibling === existingFolders
    ) {
      if (!existingFolders._cgxuiRender || existingFolders.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
        UI_buildFoldersSection(projectsSection, existingFolders, reason || 'already-ok-hydrate');
      } else {
        UI_recordShellSeen('folders', existingFolders, reason || 'already-ok');
      }
      if (!existingCategories._cgxuiRender || existingCategories.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
        try { UI_buildCategoriesSection(projectsSection, existingCategories, reason || 'already-ok-hydrate'); } catch (e) { DIAG_err('ensureInjected:categories-hydrate', e); }
      }
      UI_noteCategoryHydration(existingCategories, reason || 'already-ok');
      LIBCORE_applyProjectsNativeControls(projectsSection);
      CORE_FS_syncFolderSidebarActiveState(reason || 'already-ok');
      DIAG_step('already-ok', reason);
      return true;
    }

    if (projectsSection instanceof HTMLElement && existingFolders && existingCategories) {
      STATE.suppressMO = true;
      try {
        if (!existingFolders._cgxuiRender || existingFolders.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
          UI_buildFoldersSection(projectsSection, existingFolders, reason || 'placement-hydrate');
        }
        if (!existingCategories._cgxuiRender || existingCategories.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
          try { UI_buildCategoriesSection(projectsSection, existingCategories, reason || 'placement-hydrate'); } catch (e) { DIAG_err('ensureInjected:categories-hydrate', e); }
        }
        UI_noteCategoryHydration(existingCategories, reason || 'placement-hydrate');
        folderRoots.forEach((node) => { if (node !== existingFolders) SAFE_remove(node); });
        categoryRoots.forEach((node) => { if (node !== existingCategories) SAFE_remove(node); });
        CORE_FS_injectSection(parent, existingFolders, projectsSection);
        CORE_FS_injectSection(parent, existingCategories, projectsSection);
        STATE.sidebarPlacementRepairCount = Number(STATE.sidebarPlacementRepairCount || 0) + 1;
        CORE_FS_syncFolderSidebarActiveState(reason || 'placement-repair');
        DIAG_step('placement-repair', reason);
        return true;
      } finally {
        STATE.suppressMO = false;
      }
    }

    STATE.building = true;
    STATE.suppressMO = true;

    try {
      STORE_seedIfEmpty();

      let folders = existingFolders;
      let builtSections = 0;
      folderRoots.forEach((node) => { if (node !== folders) SAFE_remove(node); });
      if (folders) {
        try {
          UI_buildFoldersSection(projectsSection, folders, reason || 'hydrate-existing');
        } catch (e) {
          DIAG_err('ensureInjected:folders-hydrate', e);
        }
      } else if (projectsSection instanceof HTMLElement) {
        try {
          folders = UI_buildFoldersSection(projectsSection, null, reason || 'build');
          if (folders) builtSections += 1;
        } catch (e) {
          DIAG_err('ensureInjected:folders', e);
        }
      }
      if (!folders) return false;

      if (projectsSection instanceof HTMLElement) CORE_FS_injectSection(parent, folders, projectsSection);

      // Categories is isolated: owner path first, then narrow local build fallback, never blocking Folders.
      let categories = existingCategories;
      categoryRoots.forEach((node) => { if (node !== categories) SAFE_remove(node); });
      if (categories) {
        try {
          UI_buildCategoriesSection(projectsSection, categories, reason || 'hydrate-existing');
        } catch (e) {
          DIAG_err('ensureInjected:categories-hydrate', e);
        }
        UI_noteCategoryHydration(categories, reason || 'hydrate-existing');
      } else if (projectsSection instanceof HTMLElement) {
        try {
          categories = UI_buildCategoriesSection(projectsSection, null, reason || 'build');
          if (categories) builtSections += 1;
        } catch (e) {
          DIAG_err('ensureInjected:categories-owner', e);
        }
        if (categories) UI_noteCategoryHydration(categories, reason || 'build');
      }
      if (categories && projectsSection instanceof HTMLElement) CORE_FS_injectSection(parent, categories, projectsSection);

      if (projectsSection instanceof HTMLElement) LIBCORE_applyProjectsNativeControls(projectsSection);
      if (builtSections) {
        STATE.sidebarRenderCount = Number(STATE.sidebarRenderCount || 0) + 1;
        STATE.lastSidebarRenderReason = String(reason || 'ensure');
        STATE.sidebarLastRenderReason = String(reason || 'ensure');
        STATE.sidebarLastRenderAt = Date.now();
      } else {
        STATE.sidebarPlacementRepairCount = Number(STATE.sidebarPlacementRepairCount || 0) + 1;
      }
      CORE_FS_syncFolderSidebarActiveState(reason || 'injected');
      DIAG_step('injected', `${reason}${categories ? '' : ':folders-only'}`);
      return true;
    } catch (e) {
      DIAG_err('ensureInjected', e);
      return false;
    } finally {
      STATE.suppressMO = false;
      STATE.building = false;
    }
  }
