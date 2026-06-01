/* R4.7.2 — Retired Native Categories Sidebar UI (from 0F4a)
 *
 * This file is an ARCHIVE of the Native ChatGPT categories sidebar UI
 * that was physically removed from
 *   src-runtime-base/0F4a.⬛️🗂️ Categories 🗂️.js
 * in commit _<R4.7.2 commit hash; populated post-commit>_.
 *
 * The functions below reference variables that are scope-bound to the
 * 0F4a IIFE (`W`, `D`, `H2O`, `core`, `compat`, `err`,
 * `getCompat`, `getCategoryAppearance`, `categoryIconSvgForAppearance`,
 * `setCategoryAppearance`, `makeCategoryTagLinkPicker`,
 * `normalizeHexColor`, `normalizeCategoryIcon`,
 * `refreshActivePageForAppearance`, `CFG_CATEGORY_ICON_OPTIONS`,
 * `UI_FSECTION_CATEGORIES_ROOT`, `ATTR_CGXUI_OWNER`,
 * `ATTR_CGXUI_STATE`, `OWNER_SKID`, `owner`,
 * `isNativeOrganizationUiEnabled`).
 *
 * This file is NOT loaded by any runtime — it is purely archival.
 * It is not syntactically self-contained; pasting it back into 0F4a's
 * IIFE scope (at the recorded line ranges in extracted-from-0F4a.md)
 * restores the original code.
 *
 * Why retired:
 *   The Native ChatGPT Library workspace and sidebar organization UI
 *   were replaced by Desktop Studio (R4.5.x). After R4.6.0–R4.6.4
 *   deprecation flags + default flip + soak proved the Native UI was
 *   dormant, R4.7 physically removes the now-dead UI code.
 *
 * Replacement:
 *   Native categories sidebar → Desktop Studio's S0Z1g categories
 *   section + S0F1m's openCategoryEditor + S0F1n batch toolbar +
 *   S0F4b actions.
 *
 * Boundary preserved:
 *   - H2O.archiveBoot.{rename,delete,create}Category APIs remain
 *     reachable via H2O.archiveBoot in 0D3a — Studio MV3 fallback
 *     uses them directly.
 *   - Category data layer in 0F4a (categoryCore, normalizers,
 *     catalog reads, candidate-acceptance) stays untouched.
 *   - 0F5a tag extraction untouched.
 *   - 0D3*/3X* capture modules untouched.
 *   - acceptCategoryCandidate's createCategory call site (line 2756
 *     in pre-R4.7.2 numbering) stays in 0F4a.
 *
 * Rollback:
 *   See ../README.md and ../notes/rollback-procedures.md.
 *   Either git revert the R4.7.2 commit, or paste each block below
 *   back into 0F4a at the line ranges recorded in
 *   extracted-from-0F4a.md.
 */

/* ─────────────────────────────────────────────────────────────────────
 * Block 1 of 5 — R4.6.3 per-element org gate (pre-R4.7.2 lines 108-177)
 * Installs the shared [data-h2o-r46-hidden="org-ui"] CSS rule + the
 * per-element sync function that toggled visibility based on the
 * library.nativeOrganizationUi flag. No longer needed once the UI it
 * gates is removed.
 * ─────────────────────────────────────────────────────────────────── */

  /* ── R4.6.3 — Per-element gate (cascade-proof) ──────────────────────
   * R4.6.2 used body[data-h2o-r46-hide-org="1"] descendant CSS rule.
   * Runtime soak revealed the body attribute is not consistently
   * maintained (likely stripped by host framework re-renders), so the
   * cascade-based gate silently failed. R4.6.3 replaces this with
   * per-element marking:
   *   1. Inject a SHARED CSS rule `[data-h2o-r46-hidden="org-ui"]
   *      { display:none !important; }` (idempotent across all R4.6
   *      modules — first one wins, others bail via id check).
   *   2. Sync matched elements every 1s + on MutationObserver: when
   *      flag is off, set data-h2o-r46-hidden="org-ui" AND inline
   *      style.setProperty('display','none','important'). The inline
   *      !important flag beats ANY competing CSS or inline style,
   *      cascade-proof.
   *   3. When flag is on, remove both markers so the element returns
   *      to its natural display.
   *
   * The CRUD APIs (renameCategory, deleteCategory, createCategory) are
   * NEVER affected — H2O.archiveBoot's functions are untouched. */
  const R46_ORG_SELECTORS = ['[data-cgxui="flsc-categories-root"]'];
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
 * Block 2 of 5 — openCategoryAppearanceEditor (pre-R4.7.2 lines 1474-1566)
 * The category-row context-menu popup. Opened from the row's "more"
 * button. Contains the rename + delete UI handlers that called
 * H2O.archiveBoot.renameCategory and H2O.archiveBoot.deleteCategory.
 *
 * ⚠️ KEPT IN 0F4a (NOT FULLY RETIRED IN R4.7.2)
 *   This function was the rename/delete UI for the now-retired
 *   sidebar row, but it is ALSO called from workspace-viewer
 *   surfaces in 0F4a that remain active until R4.7.3 retires the
 *   workspace. Removing this function in R4.7.2 would break the
 *   workspace viewer's category-appearance picker. We therefore
 *   keep the function definition in 0F4a (see breadcrumb at the
 *   original location). This block is reproduced here strictly as
 *   an archival reference for the sidebar-row consumer that WAS
 *   retired — when R4.7.3 retires the workspace viewer, this
 *   function moves with it.
 * ─────────────────────────────────────────────────────────────────── */

  function openCategoryAppearanceEditor(anchorEl, group, afterChange = null) {
    if (!anchorEl || !group) return null;
    const compat = getCompat();
    const openFolderPop = compat && compat.openFolderPop;
    if (typeof openFolderPop !== 'function') return null;
    const appearance = getCategoryAppearance(group);
    // Phase 12 polish: Rename and Delete are now available for every category.
    // - Rename: catalog merges by id, so renaming a default seeded category
    //   persists across reads.
    // - Delete: custom categories are physically removed; default seeded ones
    //   get a retired-status tombstone written into the stored catalog so the
    //   default-seed merge keeps them hidden on subsequent reads.
    const isCustom = group?.custom === true;
    const items = [
      { type: 'title', label: 'Category appearance' },
      {
        type: 'color-grid',
        label: 'Color',
        current: normalizeHexColor(appearance.color),
        options: [
          { key: 'default', label: 'Default', color: '', value: '' },
          { key: 'blue', label: 'Blue', color: '#3B82F6', value: '#3B82F6' },
          { key: 'red', label: 'Red', color: '#FF4C4C', value: '#FF4C4C' },
          { key: 'green', label: 'Green', color: '#22C55E', value: '#22C55E' },
          { key: 'gold', label: 'Gold', color: '#FFD54F', value: '#FFD54F' },
          { key: 'sky', label: 'Sky', color: '#7DD3FC', value: '#7DD3FC' },
          { key: 'pink', label: 'Pink', color: '#F472B6', value: '#F472B6' },
          { key: 'purple', label: 'Purple', color: '#A855F7', value: '#A855F7' },
          { key: 'orange', label: 'Orange', color: '#FF914D', value: '#FF914D' },
        ],
        onSelect: (color) => {
          setCategoryAppearance(group.id, { color });
          try { afterChange?.(); } catch (e) { err('after-change-color', e); }
        },
      },
      {
        type: 'icon-grid',
        label: 'Icon',
        current: normalizeCategoryIcon(appearance.icon),
        options: CFG_CATEGORY_ICON_OPTIONS,
        onSelect: (icon) => {
          setCategoryAppearance(group.id, { icon });
          try { afterChange?.(); } catch (e) { err('after-change-icon', e); }
        },
      },
    ];

    items.push('sep');
    items.push({
      type: 'custom',
      render: () => makeCategoryTagLinkPicker(group, afterChange),
    });

    // Rename — available for every category.
    items.push('sep');
    items.push({
      label: 'Rename',
      iconSvg: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm11-13 3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      onClick: async () => {
        const opener = compat?.openNameModal;
        if (typeof opener !== 'function') return;
        const next = await opener({
          title: 'Rename category',
          placeholder: 'Category name',
          initialValue: String(group.name || ''),
          confirmText: 'Save',
        });
        const trimmed = String(next || '').trim();
        if (!trimmed || trimmed === group.name) return;
        if (typeof H2O.archiveBoot?.renameCategory !== 'function') return;
        const updated = H2O.archiveBoot.renameCategory(group.id, trimmed);
        if (!updated) return;
        try { afterChange?.(); } catch (e) { err('after-change-rename', e); }
      },
    });
    // Delete — available for every category. Default seeded ones become
    // retired tombstones; custom ones are physically removed.
    items.push({
      label: 'Delete',
      danger: true,
      iconSvg: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2m-7 0v12.5A1.5 1.5 0 0 0 9.5 21h5A1.5 1.5 0 0 0 16 19.5V7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      onClick: () => {
        const ok = W.confirm?.(`Delete category "${group.name}"?\n\nThis removes the category from the catalog. Chats already assigned to this category by the extension are not modified by this action.`);
        if (!ok) return;
        if (typeof H2O.archiveBoot?.deleteCategory !== 'function') return;
        const removed = H2O.archiveBoot.deleteCategory(group.id);
        if (!removed) return;
        try { afterChange?.(); } catch (e) { err('after-change-delete', e); }
      },
    });

    return openFolderPop(anchorEl, items);
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 3 of 5 — makeFallbackSidebarHeader (pre-R4.7.2 lines 1779-1787)
 * Builds a button element that mimics ChatGPT's sidebar section header.
 * Used by prepareCategoriesSection when the host nav doesn't supply a
 * projects-section template to clone.
 * ─────────────────────────────────────────────────────────────────── */

  function makeFallbackSidebarHeader(labelText) {
    const btn = W.document.createElement('button');
    btn.type = 'button';
    btn.className = 'text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5';
    btn.innerHTML = '<h2 class="__menu-label" data-no-spacing="true"></h2>';
    const label = btn.querySelector('h2.__menu-label');
    if (label) label.textContent = labelText;
    return btn;
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 4 of 5 — prepareCategoriesSection (pre-R4.7.2 lines 1789-1832)
 * Creates or re-uses the categories sidebar SECTION element and tags it
 * with data-cgxui="flsc-categories-root". This is the boundary marker
 * the R4.6 deprecation gate matched against.
 * ─────────────────────────────────────────────────────────────────── */

  function prepareCategoriesSection(projectsSection, existingSection = null) {
    const doc = W.document;
    const projectsHeaderBtn =
      projectsSection?.querySelector?.(':scope > button') ||
      projectsSection?.querySelector?.('button') ||
      null;

    const section = existingSection instanceof HTMLElement ? existingSection : doc.createElement('div');
    if (projectsSection?.className) section.className = projectsSection.className;
    else if (!section.className) section.className = 'group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]';
    section.style.display = '';
    section.setAttribute('data-cgxui', UI_FSECTION_CATEGORIES_ROOT);
    section.setAttribute(ATTR_CGXUI_OWNER, OWNER_SKID);

    let headerBtn = section.querySelector(':scope > button');
    if (projectsHeaderBtn instanceof HTMLElement) {
      const cloned = projectsHeaderBtn.cloneNode(true);
      cloned.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      cloned.removeAttribute('aria-controls');
      if (headerBtn instanceof HTMLElement) headerBtn.replaceWith(cloned);
      else section.insertBefore(cloned, section.firstChild || null);
      headerBtn = cloned;
    } else if (!(headerBtn instanceof HTMLElement)) {
      headerBtn = makeFallbackSidebarHeader('Categories');
      section.insertBefore(headerBtn, section.firstChild || null);
    }

    headerBtn.removeAttribute('data-h2o-sidebar-shell-inert');
    const label = headerBtn.querySelector('h2.__menu-label') || headerBtn.querySelector('h2') || null;
    if (label) label.textContent = 'Categories';

    let listWrap = section.querySelector(':scope > [data-cgxui-state="section-list"]') ||
      section.querySelector(':scope > [data-h2o-sidebar-shell-list="1"]') ||
      null;
    if (!(listWrap instanceof HTMLElement)) {
      listWrap = doc.createElement('div');
      listWrap.setAttribute(ATTR_CGXUI_STATE, 'section-list');
      section.appendChild(listWrap);
    }
    listWrap.removeAttribute('data-h2o-sidebar-shell-list');
    listWrap.setAttribute(ATTR_CGXUI_STATE, 'section-list');
    if (headerBtn.nextElementSibling !== listWrap) section.insertBefore(listWrap, headerBtn.nextElementSibling || null);
    return { section, headerBtn, listWrap };
  }

/* ─────────────────────────────────────────────────────────────────────
 * Block 5 of 5 — buildCategoriesSection (pre-R4.7.2 lines 1834-2045)
 * The main sidebar renderer. Builds the categories section header,
 * the per-category rows, the "New category" action row (which called
 * H2O.archiveBoot.createCategory), and the row context-menu buttons
 * (which called openCategoryAppearanceEditor).
 * ─────────────────────────────────────────────────────────────────── */

  function buildCategoriesSection(projectsSection, existingSection = null, reason = 'build') {
    const compat = getCompat();
    if (!compat) return null;

    const doc = W.document;
    const prepared = prepareCategoriesSection(projectsSection, existingSection);
    if (!prepared) return null;
    const { section, headerBtn, listWrap } = prepared;
    section.setAttribute('data-h2o-sidebar-shell-last-seen-by', 'categories');
    section.setAttribute('data-h2o-sidebar-shell-last-reason', String(reason || 'build').slice(0, 80));

    const tplDiv = doc.querySelector('nav div.__menu-item') || doc.querySelector('div.__menu-item') || null;
    const tplA = doc.querySelector('nav a.__menu-item[href]') || doc.querySelector('a.__menu-item[href]') || null;
    const fallbackRowClass = (tplDiv?.className || tplA?.className || 'group __menu-item hoverable');

    const makeActionRow = (text, iconSvg, onClick, opts = {}) => {
      const row = compat.makeRowShell?.(tplDiv, tplA, fallbackRowClass, 'div');
      compat.setRowText?.(row, text);
      compat.injectIcon?.(row, iconSvg, { color: opts.color });
      return compat.wireAsButton?.(row, onClick) || row;
    };
    const makeCategoryRow = (group, onOpen, opts = {}) => {
      const row = compat.makeRowShell?.(tplDiv, tplA, fallbackRowClass, 'a');
      compat.setRowText?.(row, group?.name || 'Category');
      const appearance = opts.appearance || getCategoryAppearance(group);
      compat.injectIcon?.(row, categoryIconSvgForAppearance(appearance), { color: appearance.color });
      compat.wireAsButton?.(row, onOpen);
      if (typeof opts.onToggle === 'function') {
        compat.makeIconToggle?.(row, opts.isOpen ? 'Hide chats' : 'Show chats', opts.onToggle, !!opts.isOpen);
      }
      return row;
    };
    const makeCategoryMoreRow = (text, onClick, opts = {}) => {
      const row = compat.makeRowShell?.(tplDiv, tplA, fallbackRowClass, 'div');
      compat.setRowText?.(row, text);
      if (opts.indent) row.classList.add('ps-9');
      else compat.injectIcon?.(row, compat.moreIconSvg || '');
      return compat.wireAsButton?.(row, onClick) || row;
    };
    const makeSubChatRow = (href, text) => {
      const a = compat.makeRowShell?.(tplDiv, tplA, fallbackRowClass, 'a');
      a.setAttribute('href', href);
      a.setAttribute('role', 'link');
      a.classList.add('ps-9');
      compat.removeSurfaceChatLeadingIcon?.(a);
      const clean = compat.cleanSurfaceChatTitle ? compat.cleanSurfaceChatTitle(text) : text;
      compat.setRowText?.(a, clean);
      return a;
    };

    const readExpandedPref = () => {
      const ui = compat.readUi?.() || {};
      return ui.categoriesExpandedTouched === true ? !!ui.categoriesExpanded : true;
    };

    let expanded = readExpandedPref();
    let renderToken = 0;
    const applyExpandedToDOM = () => {
      headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      listWrap.style.display = expanded ? '' : 'none';
      compat.syncSectionHeaderArrow?.(headerBtn, expanded);
    };
    const setExpanded = (v) => {
      expanded = !!v;
      const ui = compat.readUi?.() || {};
      ui.categoriesExpanded = expanded;
      ui.categoriesExpandedTouched = true;
      compat.writeUi?.(ui);
      applyExpandedToDOM();
    };
    headerBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); };

    const render = async () => {
      const token = ++renderToken;
      const ui = compat.readUi?.() || {};
      listWrap.replaceChildren();
      listWrap.appendChild(makeActionRow('New category', compat.addIconSvg || '', async () => {
        const name = await compat.openNameModal?.({
          title: 'Create category',
          placeholder: 'Category name',
          initialValue: '',
          confirmText: 'Create category',
        });
        if (!name) return;
        if (typeof H2O.archiveBoot?.createCategory !== 'function') {
          W.alert?.('Category creation is not available yet.');
          return;
        }
        const created = H2O.archiveBoot.createCategory(name);
        const nextUi = compat.readUi?.() || {};
        nextUi.categoriesExpanded = true;
        nextUi.categoriesExpandedTouched = true;
        if (created?.id) nextUi.categoryPreviewFocusId = String(created.id || '');
        compat.writeUi?.(nextUi);
        expanded = true;
        render();
        refreshActivePageForAppearance('category', created?.id || '').catch((e2) => err('category-create:refresh-page', e2));
      }));

      let groups = [];
      try { groups = await owner.loadGroups(); } catch (e) { err('renderCategories', e); groups = []; }
      if (token !== renderToken) return;
      if (!groups.length) {
        applyExpandedToDOM();
        return;
      }
      const currentChatHref = doc.querySelector('a[aria-current="page"][href*="/c/"]')?.getAttribute('href') || '';
      const currentChatId = compat.parseChatIdFromHref ? compat.parseChatIdFromHref(currentChatHref) : '';
      let activeCategoryMarked = false;
      const previewLimit = Number(compat.categoryPreviewLimit || 5) || 5;
      const chatPreviewLimit = Number(compat.categoryChatPreviewLimit || 5) || 5;
      const previewFocusId = String(ui.categoryPreviewFocusId || '').trim();
      let previewGroups = groups.slice(0, previewLimit);
      if (previewFocusId && groups.length > previewLimit && !previewGroups.some((group) => group?.id === previewFocusId)) {
        const focusGroup = groups.find((group) => String(group?.id || '') === previewFocusId);
        if (focusGroup) previewGroups = [...groups.slice(0, Math.max(0, previewLimit - 1)), focusGroup];
      }

      previewGroups.forEach((group) => {
        const inlinePreviewEnabled = ui.categoryInlinePreviewOnOpen !== false;
        const isOpen = inlinePreviewEnabled && !!ui.openCategories?.[group.id];
        const appearance = getCategoryAppearance(group, ui);
        const grp = doc.createElement('div');
        grp.setAttribute('data-cgxui-state', 'category-group');
        grp.style.display = 'contents';
        const toggleCategory = () => {
          const u = compat.readUi?.() || {};
          u.openCategories = (u.openCategories && typeof u.openCategories === 'object') ? u.openCategories : {};
          u.openCategories[group.id] = !u.openCategories[group.id];
          compat.writeUi?.(u);
          render();
        };
        const row = makeCategoryRow(group, () => owner.openByMode(group), {
          appearance,
          isOpen,
          onToggle: inlinePreviewEnabled ? toggleCategory : null,
        });
        row.setAttribute('data-cgxui', compat.categoryRowToken || 'flsc-category-row');
        row.setAttribute(ATTR_CGXUI_OWNER, OWNER_SKID);
        row.setAttribute('data-cgxui-category-id', group.id);
        const isActiveCategory = !!currentChatId && group.rows.some((item) => item.chatId === currentChatId);
        if (isActiveCategory && !activeCategoryMarked) {
          row.setAttribute('aria-current', 'true');
          activeCategoryMarked = true;
        }
        const trunc = row.querySelector?.('.truncate,[class*="truncate"]');
        if (trunc && ui.showCategoryCounts !== false) {
          const span = doc.createElement('span');
          span.style.opacity = '.6';
          span.style.marginLeft = '8px';
          span.style.fontSize = '12px';
          span.textContent = `(${group.rows.length})`;
          trunc.parentElement?.appendChild(span);
        }
        const more = compat.makeNativeLikeMoreButton?.('Category appearance', compat.categoryMoreToken || 'flsc-category-more') || doc.createElement('button');
        if (!more.hasAttribute('type')) more.type = 'button';
        if (!more.hasAttribute('aria-label')) more.setAttribute('aria-label', 'Category appearance');
        if (!more.hasAttribute('title')) more.title = 'Category appearance';
        if (!more.hasAttribute('data-cgxui')) more.setAttribute('data-cgxui', compat.categoryMoreToken || 'flsc-category-more');
        if (!more.innerHTML) more.innerHTML = compat.moreIconSvg || '⋯';
        more.setAttribute(ATTR_CGXUI_OWNER, OWNER_SKID);
        more.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openCategoryAppearanceEditor(more, group, render);
        };
        row.appendChild(more);
        grp.appendChild(row);

        if (isOpen) {
          const previewRows = Array.isArray(group.rows) ? group.rows.slice(0, chatPreviewLimit) : [];
          previewRows.forEach((item) => grp.appendChild(makeSubChatRow(item.href, item.title)));
          if ((group.rows?.length || 0) > chatPreviewLimit) {
            const moreRow = makeCategoryMoreRow('Show more', () => owner.openByMode(group), { indent: true });
            moreRow.setAttribute('data-cgxui-state', 'category-show-more');
            grp.appendChild(moreRow);
          }
        }
        listWrap.appendChild(grp);
      });

      if (groups.length > previewLimit) {
        const moreRow = makeCategoryMoreRow('More', () => {});
        moreRow.setAttribute('data-cgxui-state', 'categories-more');
        moreRow.setAttribute('aria-label', 'More categories');
        moreRow.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof compat.openCategoriesMoreByMode === 'function') compat.openCategoriesMoreByMode(moreRow, groups);
          else owner.openCategoriesByMode(groups);
        };
        moreRow.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          if (typeof compat.openCategoriesMoreByMode === 'function') compat.openCategoriesMoreByMode(moreRow, groups);
          else owner.openCategoriesByMode(groups);
        };
        listWrap.appendChild(moreRow);
      }
      applyExpandedToDOM();
    };

    section.appendChild(headerBtn);
    section.appendChild(listWrap);
    section._cgxuiRender = render;
    section.setAttribute('data-h2o-sidebar-shell', 'hydrated');
    section.setAttribute('data-cgxui-mode', 'hydrated');
    render();
    applyExpandedToDOM();
    return section;
  }
