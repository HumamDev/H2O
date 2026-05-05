// ==UserScript==
// @h2o-id             0z1f.library.tab.control.hub.plugin
// @name               0Z1f.⚫️🗂️🕹️ Library Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.library.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Library tab controls into Control Hub via plugin API.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const D = document;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const EV_CHUB_READY_V1 = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';
  const MARK = '__H2O_CHUB_LIBRARY_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let CLS = 'cgxui-cnhb';
  let ATTR_CGXUI = 'data-cgxui';
  let ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  let ATTR_CGXUI_STATE = 'data-cgxui-state';
  let ATTR_CGXUI_KEY = 'data-cgxui-key';
  let ATTR_CGXUI_ORDER = 'data-cgxui-order';

  const FEATURE_KEY_LIBRARY = 'library';
  const FEATURE_KEY_LIBRARY_PROJECTS = 'projects';
  const FEATURE_KEY_LIBRARY_CATEGORIES = 'categories';
  const FEATURE_KEY_LIBRARY_LABELS = 'labels';
  const FEATURE_KEY_LIBRARY_TAGS = 'tags';
  const KEY_CHUB_LIBRARY_SIDEBAR_LAYOUT_V1 = 'h2o:prm:cgx:library-workspace:sidebar-layout:v1';

  const LIBRARY_SUBTABS = Object.freeze([
    {
      key: FEATURE_KEY_LIBRARY,
      label: 'Library',
      icon: '🗂️',
      subtitle: 'Browse, organize, and retrieve chats through folders.',
      description: {
        default: 'Keep folder-based library organization in its own tab instead of mixing it into raw data tools.',
        focus: 'Bring project folders closer while you stay on the active thread.',
        review: 'Use library organization to locate and regroup chats quickly.',
        performance: 'Keep retrieval tools separate from backup flows so the hub stays easier to scan.',
      },
    },
    {
      key: FEATURE_KEY_LIBRARY_PROJECTS,
      label: 'Projects',
      icon: '📁',
      subtitle: 'Native project sidebar behavior.',
      description: {
        default: 'Reference native Projects behavior from the Library tab.',
        focus: 'Keep native project controls visible beside folder and category settings.',
        review: 'Use this as the Library baseline while tuning adjacent sidebar sections.',
        performance: 'No extra runtime controls are added here.',
      },
    },
    {
      key: 'folders',
      label: 'Folders',
      icon: '🗂️',
      subtitle: 'Project / folder list tweaks.',
      description: {
        default: 'Tweak folder spacing & colors.',
        focus: 'Focus on active projects.',
        review: 'Highlight project grouping.',
        performance: 'Minimal DOM work.',
      },
    },
    {
      key: FEATURE_KEY_LIBRARY_CATEGORIES,
      label: 'Categories',
      icon: '🏷️',
      subtitle: 'Category sidebar open behavior.',
      description: {
        default: 'Choose how category rows open from the native sidebar.',
        focus: 'Open category lists in the least distracting surface for the current workflow.',
        review: 'Switch between page and panel browsing for category chat groups.',
        performance: 'Use a lighter panel surface when a full page view is unnecessary.',
      },
    },
    {
      key: FEATURE_KEY_LIBRARY_LABELS,
      label: 'Labels',
      icon: '🔖',
      subtitle: 'Label sidebar counters, previews, and section-open behavior.',
      description: {
        default: 'Tune the Labels sidebar section so it matches the rest of the Library surfaces.',
        focus: 'Keep label browsing compact while deciding whether labels open inline, in-page, or in-panel.',
        review: 'Switch between count-heavy scanning and cleaner preview flows without leaving the Library tab.',
        performance: 'Keep Labels lightweight by choosing the smallest surface and section-open behavior that still fits the task.',
      },
    },
    {
      key: FEATURE_KEY_LIBRARY_TAGS,
      label: 'Tags',
      icon: '#️⃣',
      subtitle: 'Current-chat tag mode and tag surface controls.',
      description: {
        default: 'Switch current-chat tagging between manual and automatic modes from the Library tab.',
        focus: 'Keep tag mode close to Categories while working on the active chat.',
        review: 'Change tagging behavior without opening the Categories page first.',
        performance: 'Use a lightweight toggle for current-chat tag mode.',
      },
    },
  ]);

  function getApi() {
    try {
      const root = TOPW.H2O || W.H2O;
      if (!root) return null;

      const isHubApi = (api) => api && typeof api.registerPlugin === 'function';
      const fast = [
        root?.CH?.cnhb,
        root?.CHUB?.cnhb,
        root?.CGX?.cnhb,
        root?.CH?.cntrlhb,
        root?.CHUB?.cntrlhb,
        root?.CHUB?.chub,
        root?.CGX?.cntrlhb,
        root?.CGX?.chub,
      ];

      for (const node of fast) {
        const api = node?.api;
        if (isHubApi(api)) return api;
      }

      for (const tok of Object.keys(root)) {
        const bucket = root[tok];
        if (!bucket || typeof bucket !== 'object') continue;
        for (const pid of Object.keys(bucket)) {
          const api = bucket?.[pid]?.api;
          if (isHubApi(api)) return api;
        }
      }
    } catch {}
    return null;
  }

  function safeCall(label, fn) {
    try { return fn(); } catch (error) { try { console.warn('[H2O LibraryTab] ' + label, error); } catch {} }
    return undefined;
  }

  function invalidate(api = LAST_API) {
    if (!api || typeof api.invalidate !== 'function') return;
    try { W.setTimeout(() => api.invalidate(), 0); } catch {}
  }

  const storage = {
    getStr(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setJSON(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; } },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
  };

  function renderInfoList(items) {
    const rows = Array.isArray(items) ? items.filter((item) => item && item.value != null && String(item.value).trim() !== '') : [];
    const root = D.createElement('div');
    root.className = `${CLS}-infoList`;
    if (!rows.length) return root;

    for (const item of rows) {
      const row = D.createElement('div');
      row.className = `${CLS}-infoLine`;

      const key = D.createElement('span');
      key.className = `${CLS}-infoKey`;
      key.textContent = item.label || 'Info';

      const value = D.createElement('span');
      value.className = `${CLS}-infoVal`;
      value.textContent = String(item.value || '');

      row.append(key, value);
      root.appendChild(row);
    }
    return root;
  }

  const CHUB_FOLDERS_SEL_ROOT = '[data-cgxui="flsc-root"][data-cgxui-owner="flsc"]';

  function CHUB_FOLDERS_root() {
    return D.querySelector(CHUB_FOLDERS_SEL_ROOT);
  }

  function CHUB_FOLDERS_headerButton() {
    return CHUB_FOLDERS_root()?.querySelector(':scope > button') || null;
  }

  function CHUB_FOLDERS_findActionByText(text) {
    const root = CHUB_FOLDERS_root();
    if (!root) return null;
    const target = String(text || '').trim().toLowerCase();
    return Array.from(root.querySelectorAll('button, a, div')).find((el) => String(el.textContent || '').trim().toLowerCase() === target) || null;
  }

  function CHUB_FOLDERS_focusAction() {
    const root = CHUB_FOLDERS_root();
    if (!root) return { message: 'Folders section not found.' };
    safeCall('folders.focus', () => root.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return { ok: true, message: 'Folders section focused.' };
  }

  function CHUB_FOLDERS_setExpanded(open) {
    const btn = CHUB_FOLDERS_headerButton();
    if (!btn) return { message: 'Folders section not found.' };
    const isOpen = btn.getAttribute('aria-expanded') !== 'false';
    if (isOpen !== !!open) safeCall(`folders.setExpanded:${open ? 'open' : 'close'}`, () => btn.click());
    invalidate();
    return { ok: true, message: open ? 'Folders expanded.' : 'Folders collapsed.' };
  }

  function CHUB_FOLDERS_newFolderAction() {
    const expand = CHUB_FOLDERS_setExpanded(true);
    if (expand?.ok === false) return expand;
    const btn = CHUB_FOLDERS_findActionByText('New folder');
    if (!btn) return { message: 'New folder control not found.' };
    safeCall('folders.newFolder', () => btn.click());
    return { ok: true, message: 'New folder dialog opened.' };
  }

  function CHUB_FOLDERS_renderStatus() {
    const root = CHUB_FOLDERS_root();
    const headerBtn = CHUB_FOLDERS_headerButton();
    const count = root ? root.querySelectorAll('[data-cgxui-state="folder-group"]').length : 0;
    const expanded = headerBtn ? (headerBtn.getAttribute('aria-expanded') !== 'false') : false;
    return renderInfoList([
      { label: 'Visible', value: root ? 'Yes' : 'No' },
      { label: 'Expanded', value: root ? (expanded ? 'Yes' : 'No') : '' },
      { label: 'Folders', value: root ? String(count) : '' },
    ]);
  }

  function CHUB_CATEGORIES_openModeOpts() {
    return [['page', 'Page'], ['panel', 'Panel']];
  }

  function CHUB_LIBRARY_moreOpenModeOpts() {
    return [['page', 'Page'], ['dropdown', 'Dropdown']];
  }

  function CHUB_LIBRARY_inlinePreviewOpts() {
    return [['enabled', 'Enabled'], ['disabled', 'Disabled']];
  }

  function CHUB_FOLDERS_getOpenMode() {
    const mode = safeCall('folders.getOpenMode', () => W.H2O?.folders?.getFolderOpenMode?.()) || 'panel';
    return String(mode || '').toLowerCase() === 'page' ? 'page' : 'panel';
  }

  function CHUB_FOLDERS_setOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'page' ? 'page' : 'panel';
    safeCall('folders.setOpenMode', () => W.H2O?.folders?.setFolderOpenMode?.(next));
    return next;
  }

  function CHUB_CATEGORIES_getOpenMode() {
    const mode = safeCall('categories.getOpenMode', () => W.H2O?.folders?.getCategoryOpenMode?.()) || 'page';
    return String(mode || '').toLowerCase() === 'panel' ? 'panel' : 'page';
  }

  function CHUB_CATEGORIES_setOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'panel' ? 'panel' : 'page';
    safeCall('categories.setOpenMode', () => W.H2O?.folders?.setCategoryOpenMode?.(next));
    return next;
  }

  function CHUB_FOLDERS_getMoreOpenMode() {
    const mode = safeCall('folders.getMoreOpenMode', () => W.H2O?.folders?.getFolderMoreOpenMode?.()) || 'page';
    return String(mode || '').toLowerCase() === 'dropdown' ? 'dropdown' : 'page';
  }

  function CHUB_FOLDERS_setMoreOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'dropdown' ? 'dropdown' : 'page';
    safeCall('folders.setMoreOpenMode', () => W.H2O?.folders?.setFolderMoreOpenMode?.(next));
    return next;
  }

  function CHUB_CATEGORIES_getMoreOpenMode() {
    const mode = safeCall('categories.getMoreOpenMode', () => W.H2O?.folders?.getCategoryMoreOpenMode?.()) || 'page';
    return String(mode || '').toLowerCase() === 'dropdown' ? 'dropdown' : 'page';
  }

  function CHUB_CATEGORIES_setMoreOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'dropdown' ? 'dropdown' : 'page';
    safeCall('categories.setMoreOpenMode', () => W.H2O?.folders?.setCategoryMoreOpenMode?.(next));
    return next;
  }

  function CHUB_PROJECTS_getMoreOpenMode() {
    const mode = safeCall('projects.getMoreOpenMode', () => W.H2O?.folders?.getProjectMoreOpenMode?.()) || 'dropdown';
    return String(mode || '').toLowerCase() === 'page' ? 'page' : 'dropdown';
  }

  function CHUB_PROJECTS_setMoreOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'page' ? 'page' : 'dropdown';
    safeCall('projects.setMoreOpenMode', () => W.H2O?.folders?.setProjectMoreOpenMode?.(next));
    return next;
  }

  function CHUB_FOLDERS_getInlinePreviewOnOpen() {
    const enabled = safeCall('folders.getInlinePreviewOnOpen', () => W.H2O?.folders?.getFolderInlinePreviewOnOpen?.());
    return enabled === false ? 'disabled' : 'enabled';
  }

  function CHUB_FOLDERS_setInlinePreviewOnOpen(value) {
    const next = String(value || '').toLowerCase() === 'disabled' ? 'disabled' : 'enabled';
    safeCall('folders.setInlinePreviewOnOpen', () => W.H2O?.folders?.setFolderInlinePreviewOnOpen?.(next === 'enabled'));
    return next;
  }

  function CHUB_CATEGORIES_getInlinePreviewOnOpen() {
    const enabled = safeCall('categories.getInlinePreviewOnOpen', () => W.H2O?.folders?.getCategoryInlinePreviewOnOpen?.());
    return enabled === false ? 'disabled' : 'enabled';
  }

  function CHUB_CATEGORIES_setInlinePreviewOnOpen(value) {
    const next = String(value || '').toLowerCase() === 'disabled' ? 'disabled' : 'enabled';
    safeCall('categories.setInlinePreviewOnOpen', () => W.H2O?.folders?.setCategoryInlinePreviewOnOpen?.(next === 'enabled'));
    return next;
  }

  function CHUB_PROJECTS_getInlinePreviewOnOpen() {
    const enabled = safeCall('projects.getInlinePreviewOnOpen', () => W.H2O?.folders?.getProjectInlinePreviewOnOpen?.());
    return enabled === false ? 'disabled' : 'enabled';
  }

  function CHUB_PROJECTS_setInlinePreviewOnOpen(value) {
    const next = String(value || '').toLowerCase() === 'disabled' ? 'disabled' : 'enabled';
    safeCall('projects.setInlinePreviewOnOpen', () => W.H2O?.folders?.setProjectInlinePreviewOnOpen?.(next === 'enabled'));
    return next;
  }

  function CHUB_FOLDERS_getShowCounts() {
    return safeCall('folders.getShowFolderCounts', () => W.H2O?.folders?.getShowFolderCounts?.()) !== false;
  }

  function CHUB_FOLDERS_setShowCounts(value) {
    safeCall('folders.setShowFolderCounts', () => W.H2O?.folders?.setShowFolderCounts?.(value !== false));
    return value !== false;
  }

  function CHUB_CATEGORIES_getShowCounts() {
    return safeCall('categories.getShowCategoryCounts', () => W.H2O?.folders?.getShowCategoryCounts?.()) !== false;
  }

  function CHUB_CATEGORIES_setShowCounts(value) {
    safeCall('categories.setShowCategoryCounts', () => W.H2O?.folders?.setShowCategoryCounts?.(value !== false));
    return value !== false;
  }

  const CHUB_LABELS_SEL_ROOT = '[data-cgxui="lbsc-root"][data-cgxui-owner="lbsc"]';

  function CHUB_LABELS_owner() {
    return W.H2O?.Labels
      || W.H2O?.LibraryCore?.getOwner?.('labels')
      || W.H2O?.LibraryCore?.getService?.('labels')
      || null;
  }

  function CHUB_LABELS_root() {
    return D.querySelector(CHUB_LABELS_SEL_ROOT);
  }

  function CHUB_LABELS_headerButton() {
    return CHUB_LABELS_root()?.querySelector(':scope > button') || null;
  }

  function CHUB_LABELS_focusAction() {
    const root = CHUB_LABELS_root();
    if (!root) return { message: 'Labels section not found.' };
    safeCall('labels.focus', () => root.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return { ok: true, message: 'Labels section focused.' };
  }

  function CHUB_LABELS_setExpanded(open) {
    const owner = CHUB_LABELS_owner();
    if (owner?.setSectionExpanded) {
      safeCall(`labels.setExpanded:${open ? 'open' : 'close'}`, () => owner.setSectionExpanded(open === true));
      invalidate();
      return { ok: true, message: open ? 'Labels expanded.' : 'Labels collapsed.' };
    }
    const btn = CHUB_LABELS_headerButton();
    if (!btn) return { message: 'Labels section not found.' };
    const isOpen = btn.getAttribute('aria-expanded') !== 'false';
    if (isOpen !== !!open) safeCall(`labels.headerClick:${open ? 'open' : 'close'}`, () => btn.click());
    invalidate();
    return { ok: true, message: open ? 'Labels expanded.' : 'Labels collapsed.' };
  }

  function CHUB_LABELS_renderStatus() {
    const root = CHUB_LABELS_root();
    const headerBtn = CHUB_LABELS_headerButton();
    const owner = CHUB_LABELS_owner();
    const count = owner?.listTypes ? Number((owner.listTypes() || []).length) : 0;
    const expanded = headerBtn ? (headerBtn.getAttribute('aria-expanded') !== 'false') : false;
    return renderInfoList([
      { label: 'Visible', value: root ? 'Yes' : 'No' },
      { label: 'Expanded', value: root ? (expanded ? 'Yes' : 'No') : '' },
      { label: 'Label Types', value: root ? String(count) : '' },
    ]);
  }

  function CHUB_LABELS_getShowCounts() {
    return safeCall('labels.getShowCounts', () => CHUB_LABELS_owner()?.getShowCounts?.()) !== false;
  }

  function CHUB_LABELS_setShowCounts(value) {
    safeCall('labels.setShowCounts', () => CHUB_LABELS_owner()?.setShowCounts?.(value !== false));
    return value !== false;
  }

  function CHUB_LABELS_getOpenMode() {
    const mode = safeCall('labels.getOpenMode', () => CHUB_LABELS_owner()?.getOpenMode?.()) || 'page';
    return String(mode || '').toLowerCase() === 'panel' ? 'panel' : 'page';
  }

  function CHUB_LABELS_setOpenMode(mode) {
    const next = String(mode || '').toLowerCase() === 'panel' ? 'panel' : 'page';
    safeCall('labels.setOpenMode', () => CHUB_LABELS_owner()?.setOpenMode?.(next));
    return next;
  }

  function CHUB_LABELS_getInlinePreviewOnOpen() {
    const enabled = safeCall('labels.getInlinePreviewOnOpen', () => CHUB_LABELS_owner()?.getInlinePreviewOnOpen?.());
    return enabled === true ? 'enabled' : 'disabled';
  }

  function CHUB_LABELS_setInlinePreviewOnOpen(value) {
    const next = String(value || '').toLowerCase() === 'enabled' ? 'enabled' : 'disabled';
    safeCall('labels.setInlinePreviewOnOpen', () => CHUB_LABELS_owner()?.setInlinePreviewOnOpen?.(next === 'enabled'));
    return next;
  }

  function CHUB_LABELS_typeExpandModeOpts() {
    return [
      ['all-open', 'All Expanded'],
      ['all-closed', 'All Collapsed'],
      ['remember', 'Remember Last Time'],
    ];
  }

  function CHUB_LABELS_getTypeExpandMode() {
    const mode = safeCall('labels.getTypeExpandMode', () => CHUB_LABELS_owner()?.getTypeExpandMode?.()) || 'remember';
    if (String(mode || '').toLowerCase() === 'all-open') return 'all-open';
    if (String(mode || '').toLowerCase() === 'all-closed') return 'all-closed';
    return 'remember';
  }

  function CHUB_LABELS_setTypeExpandMode(mode) {
    const next = CHUB_LABELS_typeExpandModeOpts().some(([value]) => value === mode) ? mode : 'remember';
    safeCall('labels.setTypeExpandMode', () => CHUB_LABELS_owner()?.setTypeExpandMode?.(next));
    return next;
  }

  function CHUB_LABELS_isTypeVisible(typeKey) {
    return safeCall(`labels.isTypeVisible:${typeKey}`, () => CHUB_LABELS_owner()?.isTypeVisible?.(typeKey)) !== false;
  }

  function CHUB_LABELS_setTypeVisible(typeKey, value) {
    safeCall(`labels.setTypeVisible:${typeKey}`, () => CHUB_LABELS_owner()?.setTypeVisible?.(typeKey, value !== false));
    return value !== false;
  }

  function CHUB_TAGS_owner() {
    return W.H2O?.Tags || W.H2O?.TG?.tags || W.H2O?.LibraryCore?.getOwner?.('tags') || W.H2O?.LibraryCore?.getService?.('tags') || null;
  }

  function CHUB_TAGS_getCurrentChatId() {
    try {
      const live = String(W.H2O?.archiveBoot?.getCurrentChatId?.() || W.H2O?.util?.getChatId?.() || '').trim();
      if (live) return live;
    } catch {}
    return '';
  }

  function CHUB_TAGS_getMode() {
    const chatId = CHUB_TAGS_getCurrentChatId();
    const owner = CHUB_TAGS_owner();
    if (!chatId || !owner?.getChatMode) return 'manual';
    try { return String(owner.getChatMode(chatId) || 'manual'); } catch { return 'manual'; }
  }

  function CHUB_TAGS_setMode(mode) {
    const chatId = CHUB_TAGS_getCurrentChatId();
    const owner = CHUB_TAGS_owner();
    if (!chatId || !owner?.setChatMode) return 'manual';
    try { return String(owner.setChatMode(chatId, mode) || 'manual'); } catch { return 'manual'; }
  }

  function CHUB_TAGS_modeOpts() {
    return [
      ['manual', 'Manual'],
      ['suggestion', 'Suggestion'],
      ['auto', 'Automatic'],
    ];
  }

  function CHUB_TAGS_renderStatus() {
    const chatId = CHUB_TAGS_getCurrentChatId();
    const owner = CHUB_TAGS_owner();
    const tagCount = chatId && owner?.getChatTagCatalog ? Number((owner.getChatTagCatalog(chatId) || []).length) : 0;
    return renderInfoList([
      { label:'Current Chat', value: chatId || 'No active chat remembered' },
      { label:'Mode', value: CHUB_TAGS_getMode() },
      { label:'Tags', value: chatId ? String(tagCount) : '' },
    ]);
  }

  const CHUB_LW_SECTIONS = Object.freeze([
    { id: 'library', label: 'Library' },
    { id: 'labels', label: 'Labels' },
    { id: 'folders', label: 'Folders' },
    { id: 'categories', label: 'Categories' },
    { id: 'projects', label: 'Projects' },
    { id: 'recents', label: 'Recents', native: true },
  ]);

  function CHUB_LW_owner() {
    return W.H2O?.LibraryWorkspace
      || W.H2O?.LibraryCore?.getOwner?.('library-workspace')
      || W.H2O?.LibraryCore?.getService?.('library-workspace')
      || null;
  }

  function CHUB_LW_defaultLayout() {
    const sections = {};
    CHUB_LW_SECTIONS.forEach((section, idx) => { sections[section.id] = { visible: true, order: (idx + 1) * 10 }; });
    return { sections, updatedAt: 0 };
  }

  function CHUB_LW_normalizeLayout(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const inSections = src.sections && typeof src.sections === 'object' ? src.sections : {};
    const out = CHUB_LW_defaultLayout();
    CHUB_LW_SECTIONS.forEach((section, idx) => {
      const row = inSections[section.id] && typeof inSections[section.id] === 'object' ? inSections[section.id] : {};
      const n = Number(row.order);
      out.sections[section.id] = {
        visible: row.visible !== false,
        order: Number.isFinite(n) ? n : (idx + 1) * 10,
      };
    });
    out.updatedAt = Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : 0;
    CHUB_LW_orderIds(out).forEach((id, idx) => { out.sections[id].order = (idx + 1) * 10; });
    return out;
  }

  function CHUB_LW_orderIds(layoutRaw = null) {
    const layout = layoutRaw && layoutRaw.sections ? layoutRaw : CHUB_LW_normalizeLayout(layoutRaw);
    return CHUB_LW_SECTIONS.slice().sort((a, b) => {
      const ao = Number(layout.sections?.[a.id]?.order);
      const bo = Number(layout.sections?.[b.id]?.order);
      return ((Number.isFinite(ao) ? ao : 999) - (Number.isFinite(bo) ? bo : 999));
    }).map((section) => section.id);
  }

  function CHUB_LW_getLayout() {
    const owner = CHUB_LW_owner();
    if (owner?.getSidebarLayout) {
      try { return CHUB_LW_normalizeLayout(owner.getSidebarLayout()); } catch {}
    }
    return CHUB_LW_normalizeLayout(storage.getJSON(KEY_CHUB_LIBRARY_SIDEBAR_LAYOUT_V1, null));
  }

  function CHUB_LW_writeLayoutFallback(layout) {
    const next = CHUB_LW_normalizeLayout({ ...(layout || {}), updatedAt: Date.now() });
    storage.setJSON(KEY_CHUB_LIBRARY_SIDEBAR_LAYOUT_V1, next);
    return next;
  }

  function CHUB_LW_setSectionVisible(sectionId, visible) {
    const id = String(sectionId || '').trim();
    const owner = CHUB_LW_owner();
    if (owner?.setSidebarSectionVisible) {
      try { const next = owner.setSidebarSectionVisible(id, visible !== false); invalidate(); return CHUB_LW_normalizeLayout(next); } catch {}
    }
    const layout = CHUB_LW_getLayout();
    if (layout.sections[id]) layout.sections[id].visible = visible !== false;
    const next = CHUB_LW_writeLayoutFallback(layout);
    invalidate();
    return next;
  }

  function CHUB_LW_moveSection(sectionId, direction) {
    const id = String(sectionId || '').trim();
    const owner = CHUB_LW_owner();
    if (owner?.moveSidebarSection) {
      try { const next = owner.moveSidebarSection(id, direction); invalidate(); return CHUB_LW_normalizeLayout(next); } catch {}
    }
    const order = CHUB_LW_orderIds(CHUB_LW_getLayout());
    const idx = order.indexOf(id);
    if (idx < 0) return CHUB_LW_getLayout();
    const delta = String(direction || '').toLowerCase() === 'down' ? 1 : -1;
    const nextIdx = Math.max(0, Math.min(order.length - 1, idx + delta));
    if (nextIdx !== idx) { const [item] = order.splice(idx, 1); order.splice(nextIdx, 0, item); }
    return CHUB_LW_setOrder(order);
  }

  function CHUB_LW_setOrder(sectionIds) {
    const owner = CHUB_LW_owner();
    if (owner?.setSidebarOrder) {
      try { const next = owner.setSidebarOrder(sectionIds); invalidate(); return CHUB_LW_normalizeLayout(next); } catch {}
    }
    const layout = CHUB_LW_getLayout();
    const ids = Array.isArray(sectionIds) ? sectionIds.filter((id) => layout.sections[id]) : CHUB_LW_orderIds(layout);
    ids.forEach((id, idx) => { layout.sections[id].order = (idx + 1) * 10; });
    const next = CHUB_LW_writeLayoutFallback(layout);
    invalidate();
    return next;
  }

  function CHUB_LW_resetLayout() {
    const owner = CHUB_LW_owner();
    if (owner?.resetSidebarLayout) {
      try { const next = owner.resetSidebarLayout(); invalidate(); return CHUB_LW_normalizeLayout(next); } catch {}
    }
    const next = CHUB_LW_writeLayoutFallback(CHUB_LW_defaultLayout());
    invalidate();
    return next;
  }

  function CHUB_LW_applyLayoutAction() {
    const owner = CHUB_LW_owner();
    const ok = safeCall('libraryWorkspace.applySidebarLayout', () => owner?.applySidebarLayout?.('control-hub'));
    invalidate();
    return { message: ok ? 'Sidebar layout applied.' : 'Saved. Library Workspace will apply it when available.' };
  }

  function CHUB_LW_openAction() {
    const ok = safeCall('libraryWorkspace.open', () => CHUB_LW_owner()?.openWorkspace?.({ source: 'control-hub' }));
    invalidate();
    return { message: ok ? 'Library opened.' : 'Library Workspace is unavailable.' };
  }

  function CHUB_LW_refreshAction() {
    const ok = safeCall('libraryWorkspace.refresh', () => CHUB_LW_owner()?.refresh?.('control-hub'));
    invalidate();
    return { message: ok ? 'Library refreshed.' : 'Library Workspace is unavailable.' };
  }

  function CHUB_LW_resetUiAction() {
    const ok = safeCall('libraryWorkspace.resetUi', () => CHUB_LW_owner()?.resetWorkspaceUiPrefs?.());
    invalidate();
    return { message: ok ? 'Library UI preferences reset.' : 'Library Workspace is unavailable.' };
  }

  function CHUB_LW_getLibraryButtonVisible() {
    return CHUB_LW_getLayout().sections?.library?.visible !== false;
  }

  function CHUB_LW_setLibraryButtonVisible(value) {
    CHUB_LW_setSectionVisible('library', value !== false);
    return value !== false;
  }

  function CHUB_LW_renderStatus() {
    const owner = CHUB_LW_owner();
    const check = safeCall('libraryWorkspace.selfCheck', () => owner?.selfCheck?.()) || {};
    const layout = CHUB_LW_getLayout();
    return renderInfoList([
      { label: 'Workspace API', value: owner ? 'Ready' : 'Missing' },
      { label: 'Sidebar Row', value: check.sidebarRowExists ? 'Visible' : 'Not found' },
      { label: 'Page Mounted', value: check.pageMounted ? 'Yes' : 'No' },
      { label: 'Route', value: check.registeredRoute ? 'Registered' : 'Not registered' },
      { label: 'Order', value: CHUB_LW_orderIds(layout).join(' → ') },
      { label: 'Storage', value: KEY_CHUB_LIBRARY_SIDEBAR_LAYOUT_V1 },
    ]);
  }

  function CHUB_LW_renderDiagnostics() {
    const owner = CHUB_LW_owner();
    const core = W.H2O?.LibraryCore || null;
    const check = safeCall('libraryWorkspace.selfCheck', () => owner?.selfCheck?.()) || null;
    const routes = core?.listRoutes ? core.listRoutes().join(', ') : '';
    const owners = core?.listOwners ? core.listOwners().join(', ') : '';
    const services = core?.listServices ? core.listServices().join(', ') : '';
    return renderInfoList([
      { label: 'Owners', value: owners },
      { label: 'Services', value: services },
      { label: 'Routes', value: routes },
      { label: 'SelfCheck', value: check ? JSON.stringify({ ok: check.ok, sidebarRowCount: check.sidebarRowCount, pageMounted: check.pageMounted }) : 'Unavailable' },
    ]);
  }

  function CHUB_LW_renderSidebarLayoutEditor() {
    const root = D.createElement('div');
    root.className = `${CLS}-tabOrderEditor ${CLS}-libraryLayoutEditor`;

    const hint = D.createElement('div');
    hint.className = `${CLS}-ctrlHint ${CLS}-tabOrderHint`;
    hint.textContent = 'Show, hide, and reorder the Library-related sidebar sections. Control Hub edits settings; Library Workspace applies the actual sidebar layout.';
    root.appendChild(hint);

    const list = D.createElement('div');
    list.className = `${CLS}-tabOrderList`;
    root.appendChild(list);

    const actionRow = D.createElement('div');
    actionRow.className = `${CLS}-sbPaletteActions`;
    const resetBtn = D.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = `${CLS}-actionBtn`;
    resetBtn.textContent = 'Reset Default Order';
    const showAllBtn = D.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = `${CLS}-actionBtn`;
    showAllBtn.textContent = 'Show All';
    const applyBtn = D.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = `${CLS}-actionBtn primary`;
    applyBtn.textContent = 'Apply Now';
    const status = D.createElement('span');
    status.className = `${CLS}-ctrlActionStatus`;
    status.style.textAlign = 'left';
    status.style.minWidth = '0';

    const renderRows = () => {
      list.textContent = '';
      const layout = CHUB_LW_getLayout();
      const order = CHUB_LW_orderIds(layout);
      order.forEach((id, idx) => {
        const meta = CHUB_LW_SECTIONS.find((section) => section.id === id) || { id, label: id };
        const cfg = layout.sections[id] || { visible: true, order: (idx + 1) * 10 };
        const row = D.createElement('div');
        row.className = `${CLS}-tabOrderRow`;
        row.setAttribute(ATTR_CGXUI_KEY, id);
        row.setAttribute(ATTR_CGXUI_ORDER, String(idx + 1));

        const left = D.createElement('div');
        left.className = `${CLS}-tabOrderLeft`;
        const index = D.createElement('span');
        index.className = `${CLS}-tabOrderIndex`;
        index.textContent = String(idx + 1);
        const sw = D.createElement('button');
        sw.type = 'button';
        sw.className = `${CLS}-miniSwitch`;
        sw.innerHTML = '<i></i>';
        sw.setAttribute(ATTR_CGXUI_STATE, cfg.visible !== false ? 'on' : 'off');
        sw.title = cfg.visible !== false ? 'Hide section' : 'Show section';
        const textWrap = D.createElement('div');
        textWrap.className = `${CLS}-tabOrderText`;
        const title = D.createElement('div');
        title.className = `${CLS}-tabOrderTitle`;
        title.textContent = meta.label;
        const sub = D.createElement('div');
        sub.className = `${CLS}-tabOrderSub`;
        sub.textContent = meta.native ? 'Native / best-effort' : 'H2O-owned section';
        textWrap.append(title, sub);
        left.append(index, sw, textWrap);

        const right = D.createElement('div');
        right.className = `${CLS}-tabOrderMoves`;
        const makeMoveBtn = (txt, direction, disabled) => {
          const btn = D.createElement('button');
          btn.type = 'button';
          btn.className = `${CLS}-tabOrderMoveBtn`;
          btn.textContent = txt;
          btn.disabled = !!disabled;
          btn.addEventListener('click', (evt) => {
            evt.preventDefault();
            CHUB_LW_moveSection(id, direction);
            status.textContent = 'Sidebar order updated.';
            renderRows();
          }, true);
          return btn;
        };
        right.append(makeMoveBtn('↑', 'up', idx === 0), makeMoveBtn('↓', 'down', idx === order.length - 1));

        sw.addEventListener('click', (evt) => {
          evt.preventDefault();
          const nextVisible = sw.getAttribute(ATTR_CGXUI_STATE) !== 'on';
          CHUB_LW_setSectionVisible(id, nextVisible);
          status.textContent = `${meta.label} ${nextVisible ? 'shown' : 'hidden'}.`;
          renderRows();
        }, true);

        row.append(left, right);
        list.appendChild(row);
      });
    };

    resetBtn.addEventListener('click', (evt) => { evt.preventDefault(); CHUB_LW_resetLayout(); status.textContent = 'Default sidebar layout restored.'; renderRows(); }, true);
    showAllBtn.addEventListener('click', (evt) => {
      evt.preventDefault();
      CHUB_LW_SECTIONS.forEach((section) => CHUB_LW_setSectionVisible(section.id, true));
      status.textContent = 'All sections shown.';
      renderRows();
    }, true);
    applyBtn.addEventListener('click', (evt) => { evt.preventDefault(); const res = CHUB_LW_applyLayoutAction(); status.textContent = res.message || 'Applied.'; renderRows(); }, true);

    renderRows();
    actionRow.append(resetBtn, showAllBtn, applyBtn, status);
    root.appendChild(actionRow);
    return root;
  }

  const LIBRARY_CONTROLS = [
    {
      type:'custom',
      key:'libraryWorkspaceStatus',
      label:'Status',
      group:'Workspace',
      render() { return CHUB_LW_renderStatus(); },
    },
    {
      type:'toggle',
      key:'librarySidebarButtonVisible',
      label:'Show Library Button',
      group:'Workspace',
      help:'Show or hide the top-level Library button in the ChatGPT sidebar.',
      def:true,
      getLive() { return CHUB_LW_getLibraryButtonVisible(); },
      setLive(v) { return CHUB_LW_setLibraryButtonVisible(v); },
    },
    {
      type:'action',
      key:'libraryWorkspaceActions',
      label:'Library Workspace',
      group:'Workspace',
      statusText:'',
      buttons:[
        { label:'Open Library', primary:true, action: () => CHUB_LW_openAction() },
        { label:'Refresh', action: () => CHUB_LW_refreshAction() },
        { label:'Reset UI Prefs', action: () => CHUB_LW_resetUiAction() },
      ],
    },
    {
      type:'custom',
      key:'librarySidebarLayout',
      label:'Sidebar Sections',
      group:'Sidebar Layout',
      help:'Control which Library-related sections appear in the sidebar and the order they use.',
      stackBelowLabel:true,
      render() { return CHUB_LW_renderSidebarLayoutEditor(); },
    },
    {
      type:'custom',
      key:'libraryDiagnostics',
      label:'Diagnostics',
      group:'Diagnostics',
      render() { return CHUB_LW_renderDiagnostics(); },
    },
  ];

  const PROJECTS_CONTROLS = [
    {
      type:'custom',
      key:'projectsLibraryStatus',
      label:'Projects',
      group:'Projects',
      render() {
        return renderInfoList([
          { label:'Source', value:'Native ChatGPT Projects' },
          { label:'Library role', value:'Reference section' },
        ]);
      },
    },
    {
      type:'select',
      key:'projectInlinePreviewOnOpen',
      label:'Inline Preview on Open',
      group:'Projects',
      help:'Allow native project rows to open their inline chat preview, or send project toggle opens directly to the project surface.',
      def:'enabled',
      opts: CHUB_LIBRARY_inlinePreviewOpts,
      getLive() { return CHUB_PROJECTS_getInlinePreviewOnOpen(); },
      setLive(v) { CHUB_PROJECTS_setInlinePreviewOnOpen(v); },
    },
    {
      type:'select',
      key:'projectMoreOpenMode',
      label:'More Open Mode',
      group:'Projects',
      help:'Choose whether the native Projects More row opens the H2O projects page or keeps the native dropdown behavior.',
      def:'dropdown',
      opts: CHUB_LIBRARY_moreOpenModeOpts,
      getLive() { return CHUB_PROJECTS_getMoreOpenMode(); },
      setLive(v) { CHUB_PROJECTS_setMoreOpenMode(v); },
    },
  ];

  const FOLDERS_CONTROLS = [
    {
      type:'custom',
      key:'foldersStatus',
      label:'Status',
      group:'Folders',
      render() { return CHUB_FOLDERS_renderStatus(); },
    },
    {
      type:'toggle',
      key:'showFolderCounts',
      label:'Show Folder Counters',
      group:'Folders',
      help:'Show or hide the chat-count number displayed at the end of folder rows.',
      def:true,
      getLive() { return CHUB_FOLDERS_getShowCounts(); },
      setLive(v) { CHUB_FOLDERS_setShowCounts(v); },
    },
    {
      type:'select',
      key:'folderOpenMode',
      label:'Folder Open Mode',
      group:'Folders',
      help:'Choose whether folder rows open the full folder page view or a lighter internal panel.',
      def:'panel',
      opts: CHUB_CATEGORIES_openModeOpts,
      getLive() { return CHUB_FOLDERS_getOpenMode(); },
      setLive(v) { CHUB_FOLDERS_setOpenMode(v); },
    },
    {
      type:'select',
      key:'folderInlinePreviewOnOpen',
      label:'Inline Preview on Open',
      group:'Folders',
      help:'Allow folder rows to expand their top chat preview in the sidebar, or send row opens directly to the configured folder surface.',
      def:'enabled',
      opts: CHUB_LIBRARY_inlinePreviewOpts,
      getLive() { return CHUB_FOLDERS_getInlinePreviewOnOpen(); },
      setLive(v) { CHUB_FOLDERS_setInlinePreviewOnOpen(v); },
    },
    {
      type:'select',
      key:'folderMoreOpenMode',
      label:'More Open Mode',
      group:'Folders',
      help:'Choose whether the top-level More row opens hidden folders in a page or a dropdown.',
      def:'page',
      opts: CHUB_LIBRARY_moreOpenModeOpts,
      getLive() { return CHUB_FOLDERS_getMoreOpenMode(); },
      setLive(v) { CHUB_FOLDERS_setMoreOpenMode(v); },
    },
    {
      type:'action',
      key:'foldersActions',
      label:'Folders',
      group:'Folders',
      statusText:'',
      buttons:[
        { label:'Focus Sidebar', primary:true, action: () => CHUB_FOLDERS_focusAction() },
        { label:'Expand', action: () => CHUB_FOLDERS_setExpanded(true) },
        { label:'Collapse', action: () => CHUB_FOLDERS_setExpanded(false) },
        { label:'New Folder', action: () => CHUB_FOLDERS_newFolderAction() },
      ],
    },
  ];

  const CATEGORIES_CONTROLS = [
    {
      type:'toggle',
      key:'showCategoryCounts',
      label:'Show Category Counters',
      group:'Categories',
      help:'Show or hide the chat-count number displayed at the end of category rows.',
      def:true,
      getLive() { return CHUB_CATEGORIES_getShowCounts(); },
      setLive(v) { CHUB_CATEGORIES_setShowCounts(v); },
    },
    {
      type:'select',
      key:'categoryOpenMode',
      label:'Category Open Mode',
      group:'Categories',
      help:'Choose whether category rows open the full category page view or a lighter internal panel.',
      def:'page',
      opts: CHUB_CATEGORIES_openModeOpts,
      getLive() { return CHUB_CATEGORIES_getOpenMode(); },
      setLive(v) { CHUB_CATEGORIES_setOpenMode(v); },
    },
    {
      type:'select',
      key:'categoryInlinePreviewOnOpen',
      label:'Inline Preview on Open',
      group:'Categories',
      help:'Allow category rows to expand their top chat preview in the sidebar, or send row opens directly to the configured category surface.',
      def:'enabled',
      opts: CHUB_LIBRARY_inlinePreviewOpts,
      getLive() { return CHUB_CATEGORIES_getInlinePreviewOnOpen(); },
      setLive(v) { CHUB_CATEGORIES_setInlinePreviewOnOpen(v); },
    },
    {
      type:'select',
      key:'categoryMoreOpenMode',
      label:'More Open Mode',
      group:'Categories',
      help:'Choose whether the top-level More row opens hidden categories in a page or a dropdown.',
      def:'page',
      opts: CHUB_LIBRARY_moreOpenModeOpts,
      getLive() { return CHUB_CATEGORIES_getMoreOpenMode(); },
      setLive(v) { CHUB_CATEGORIES_setMoreOpenMode(v); },
    },
  ];

  const LABELS_CONTROLS = [
    {
      type:'custom',
      key:'labelsStatus',
      label:'Status',
      group:'Labels',
      render() { return CHUB_LABELS_renderStatus(); },
    },
    {
      type:'toggle',
      key:'showLabelCounts',
      label:'Show Label Counters',
      group:'Labels',
      help:'Show or hide the chat-count number displayed at the end of label rows.',
      def:true,
      getLive() { return CHUB_LABELS_getShowCounts(); },
      setLive(v) { CHUB_LABELS_setShowCounts(v); },
    },
    {
      type:'select',
      key:'labelOpenMode',
      label:'Open Mode',
      group:'Labels',
      help:'Choose whether label rows open the full in-shell Labels page or a lighter floating panel.',
      def:'page',
      opts: CHUB_CATEGORIES_openModeOpts,
      getLive() { return CHUB_LABELS_getOpenMode(); },
      setLive(v) { CHUB_LABELS_setOpenMode(v); },
    },
    {
      type:'select',
      key:'labelInlinePreviewOnOpen',
      label:'Inline Preview on Open',
      group:'Labels',
      help:'Allow label rows to toggle their top matching chats inline in the sidebar, or open directly into the configured Labels surface.',
      def:'disabled',
      opts: CHUB_LIBRARY_inlinePreviewOpts,
      getLive() { return CHUB_LABELS_getInlinePreviewOnOpen(); },
      setLive(v) { CHUB_LABELS_setInlinePreviewOnOpen(v); },
    },
    {
      type:'select',
      key:'labelTypeExpandMode',
      label:'Subsection Open State',
      group:'Labels',
      help:'Choose whether Workflow, Priority, and the other Labels subsections open expanded, collapsed, or remember their previous state whenever the Labels section opens.',
      def:'remember',
      opts: CHUB_LABELS_typeExpandModeOpts,
      getLive() { return CHUB_LABELS_getTypeExpandMode(); },
      setLive(v) { CHUB_LABELS_setTypeExpandMode(v); },
    },
    {
      type:'toggle',
      key:'labelSectionWorkflow',
      label:'Show Workflow Section',
      group:'Labels',
      help:'Show or hide the Workflow subsection in the Labels sidebar section.',
      def:true,
      getLive() { return CHUB_LABELS_isTypeVisible('workflowStatus'); },
      setLive(v) { CHUB_LABELS_setTypeVisible('workflowStatus', v); },
    },
    {
      type:'toggle',
      key:'labelSectionPriority',
      label:'Show Priority Section',
      group:'Labels',
      help:'Show or hide the Priority subsection in the Labels sidebar section.',
      def:true,
      getLive() { return CHUB_LABELS_isTypeVisible('priority'); },
      setLive(v) { CHUB_LABELS_setTypeVisible('priority', v); },
    },
    {
      type:'toggle',
      key:'labelSectionFollowUp',
      label:'Show Follow-up Section',
      group:'Labels',
      help:'Show or hide the Follow-up subsection in the Labels sidebar section.',
      def:true,
      getLive() { return CHUB_LABELS_isTypeVisible('followUp'); },
      setLive(v) { CHUB_LABELS_setTypeVisible('followUp', v); },
    },
    {
      type:'toggle',
      key:'labelSectionContentType',
      label:'Show Content Type Section',
      group:'Labels',
      help:'Show or hide the Content Type subsection in the Labels sidebar section.',
      def:true,
      getLive() { return CHUB_LABELS_isTypeVisible('contentType'); },
      setLive(v) { CHUB_LABELS_setTypeVisible('contentType', v); },
    },
    {
      type:'toggle',
      key:'labelSectionContext',
      label:'Show Context Section',
      group:'Labels',
      help:'Show or hide the Context subsection in the Labels sidebar section.',
      def:true,
      getLive() { return CHUB_LABELS_isTypeVisible('context'); },
      setLive(v) { CHUB_LABELS_setTypeVisible('context', v); },
    },
    {
      type:'toggle',
      key:'labelSectionCustom',
      label:'Show Custom Section',
      group:'Labels',
      help:'Show or hide the Custom subsection in the Labels sidebar section.',
      def:true,
      getLive() { return CHUB_LABELS_isTypeVisible('custom'); },
      setLive(v) { CHUB_LABELS_setTypeVisible('custom', v); },
    },
    {
      type:'action',
      key:'labelsActions',
      label:'Labels',
      group:'Labels',
      statusText:'',
      buttons:[
        { label:'Focus Sidebar', primary:true, action: () => CHUB_LABELS_focusAction() },
        { label:'Expand', action: () => CHUB_LABELS_setExpanded(true) },
        { label:'Collapse', action: () => CHUB_LABELS_setExpanded(false) },
      ],
    },
  ];

  const TAGS_CONTROLS = [
    {
      type:'custom',
      key:'tagsLibraryStatus',
      label:'Tags',
      group:'Tags',
      render() { return CHUB_TAGS_renderStatus(); },
    },
    {
      type:'select',
      key:'currentChatTagMode',
      label:'Current Chat Tag Mode',
      group:'Tags',
      help:'Switch the active chat between manual tagging and automatic tagging.',
      def:'manual',
      opts: CHUB_TAGS_modeOpts,
      getLive() { return CHUB_TAGS_getMode(); },
      setLive(v) { return CHUB_TAGS_setMode(v); },
    },
  ];

  const CONTROLS_BY_KEY = {
    [FEATURE_KEY_LIBRARY]: LIBRARY_CONTROLS,
    [FEATURE_KEY_LIBRARY_PROJECTS]: PROJECTS_CONTROLS,
    folders: FOLDERS_CONTROLS,
    [FEATURE_KEY_LIBRARY_CATEGORIES]: CATEGORIES_CONTROLS,
    [FEATURE_KEY_LIBRARY_LABELS]: LABELS_CONTROLS,
    [FEATURE_KEY_LIBRARY_TAGS]: TAGS_CONTROLS,
  };

  function applySkin(api) {
    let skin = null;
    try { skin = typeof api?.getSkin === 'function' ? api.getSkin() : null; } catch {}
    CLS = skin?.CLS || CLS;
    ATTR_CGXUI = skin?.ATTR_CGXUI || ATTR_CGXUI;
    ATTR_CGXUI_OWNER = skin?.ATTR_CGXUI_OWNER || ATTR_CGXUI_OWNER;
  }

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      applySkin(api);
      api.registerPlugin({
        key: FEATURE_KEY_LIBRARY,
        title: 'Library',
        subtabs: LIBRARY_SUBTABS,
        visibility: {
          selectors: [
            '[data-cgxui-owner="flsc"]',
          ],
        },
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_LIBRARY];
        },
      });
      api.registerPlugin({
        key: FEATURE_KEY_LIBRARY_PROJECTS,
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_LIBRARY_PROJECTS];
        },
      });
      api.registerPlugin({
        key: 'folders',
        getControls() {
          return CONTROLS_BY_KEY.folders;
        },
      });
      api.registerPlugin({
        key: FEATURE_KEY_LIBRARY_CATEGORIES,
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_LIBRARY_CATEGORIES];
        },
      });
      api.registerPlugin({
        key: FEATURE_KEY_LIBRARY_LABELS,
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_LIBRARY_LABELS];
        },
      });
      api.registerPlugin({
        key: FEATURE_KEY_LIBRARY_TAGS,
        getControls() {
          return CONTROLS_BY_KEY[FEATURE_KEY_LIBRARY_TAGS];
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O LibraryTab] register failed', error); } catch {}
      return false;
    }
  }

  register();
  W.addEventListener(EV_CHUB_READY_V1, register, true);

  if (!LAST_API) {
    let tries = 0;
    const timer = W.setInterval(() => {
      tries += 1;
      if (register() || tries > 80) {
        try { W.clearInterval(timer); } catch {}
      }
    }, 250);
  }
})();
