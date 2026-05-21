/* H2O Studio — S0Y1a Studio Ribbon (Phase 1a)
 *
 * Surface module that:
 *   1. Registers the seven default tabs (Home / Format / Structure / AI Tools /
 *      Metadata / View / Export) and their groups + placeholder actions on
 *      H2O.Studio.ribbon (the passive shell from ribbon/ribbon-shell.studio.js).
 *   2. Mounts the ribbon DOM into the <section id="studioRibbon"> placeholder
 *      that studio.html provides above .wbMain.
 *   3. Reacts to ribbon shell events (contextChanged / tabChanged /
 *      collapsedChanged) and to H2O.Studio.store.prefs 'ready' to repaint.
 *
 * Strict Phase 1a discipline:
 *   - Every action button is rendered disabled with title "Coming soon".
 *   - No action handler mutates application data.
 *   - No chrome.* / localStorage / indexedDB / fetch.
 *   - No selectors against the ChatGPT replay DOM (no cg* queries).
 *   - No imports from src-surfaces-base/desk/.
 *   - Storage limited to the two ribbon prefs keys (delegated to the shell).
 *   - Visibility is driven by chat-type context from studio.js. The ribbon
 *     hides itself entirely when chatType is null.
 *
 * Dependencies:
 *   - H2O.Studio.ribbon (ribbon-shell.studio.js, loaded earlier)
 *   - Optional: H2O.events.on (used for shell event subscriptions)
 *   - Optional: H2O.Studio.store.prefs (used indirectly via the shell)
 *
 * Does NOT depend on:
 *   - any other Studio feature module
 *   - studio.js exports (it talks to studio.js one-way, via shell.setContext)
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency. */
  if (H2O.Studio.__studioRibbonSurfaceInstalled) return;
  H2O.Studio.__studioRibbonSurfaceInstalled = true;

  /* ── Default catalogue ─────────────────────────────────────────────────
   * Tabs not visible for a given chat type are filtered at render time.
   * chatTypes: which chatType values cause the tab to be rendered.
   * Phase 1a actions are all { disabled: true, tooltip: 'Coming soon' }. */
  const TAB_CATALOGUE = [
    {
      id: 'home', label: 'Home',
      chatTypes: ['saved', 'indexed', 'imported', 'readonly'],
      groups: [
        { id: 'edit', label: 'Edit', actions: [
          { id: 'rename-chat', label: 'Rename chat' },
          { id: 'copy-title',  label: 'Copy title' },
        ] },
        { id: 'history', label: 'History', actions: [
          { id: 'undo', label: 'Undo' },
          { id: 'redo', label: 'Redo' },
        ] },
        { id: 'source', label: 'Source', actions: [
          { id: 'open-original', label: 'Open original' },
        ] },
      ],
    },
    {
      id: 'format', label: 'Format',
      chatTypes: ['saved'],
      groups: [
        { id: 'headings', label: 'Headings', actions: [
          { id: 'h1', label: 'H1' },
          { id: 'h2', label: 'H2' },
          { id: 'h3', label: 'H3' },
        ] },
        { id: 'blocks', label: 'Blocks', actions: [
          { id: 'quote',   label: 'Quote' },
          { id: 'code',    label: 'Code block' },
          { id: 'callout', label: 'Callout' },
        ] },
        { id: 'cleanup', label: 'Cleanup', actions: [
          { id: 'clean-spacing', label: 'Clean spacing' },
        ] },
      ],
    },
    {
      id: 'structure', label: 'Structure',
      chatTypes: ['saved'],
      groups: [
        { id: 'sections', label: 'Sections', actions: [
          { id: 'add-section',      label: 'Add section' },
          { id: 'split-section',    label: 'Split section' },
          { id: 'collapse-section', label: 'Collapse section' },
        ] },
        { id: 'navigation', label: 'Navigation', actions: [
          { id: 'page-divider',     label: 'Page divider' },
          { id: 'table-of-contents', label: 'Table of contents' },
        ] },
      ],
    },
    {
      id: 'ai-tools', label: 'AI Tools',
      chatTypes: ['saved'],
      groups: [
        { id: 'extract', label: 'Extract', actions: [
          { id: 'summarize',     label: 'Summarize' },
          { id: 'extract-tasks', label: 'Extract tasks' },
          { id: 'generate-tags', label: 'Generate tags' },
        ] },
        { id: 'rewrite', label: 'Rewrite', actions: [
          { id: 'rewrite-selection', label: 'Rewrite selected' },
          { id: 'study-notes',       label: 'Create study notes' },
        ] },
      ],
    },
    {
      id: 'metadata', label: 'Metadata',
      chatTypes: ['saved', 'indexed', 'imported', 'readonly'],
      groups: [
        { id: 'labels', label: 'Labels', actions: [
          { id: 'add-tags', label: 'Tags' },
          { id: 'category', label: 'Category' },
          { id: 'project',  label: 'Project' },
          { id: 'status',   label: 'Status' },
        ] },
        { id: 'source', label: 'Source', actions: [
          { id: 'source-link', label: 'Source link' },
        ] },
      ],
    },
    {
      id: 'view', label: 'View',
      chatTypes: ['saved', 'indexed', 'imported', 'readonly'],
      groups: [
        { id: 'modes', label: 'Modes', actions: [
          { id: 'compact-mode', label: 'Compact mode' },
          { id: 'focus-mode',   label: 'Focus mode' },
        ] },
        { id: 'overlays', label: 'Overlays', actions: [
          { id: 'show-timestamps', label: 'Timestamps' },
          { id: 'show-minimap',    label: 'MiniMap' },
        ] },
        { id: 'width', label: 'Width', actions: [
          { id: 'reading-width', label: 'Reading width' },
        ] },
      ],
    },
    {
      id: 'export', label: 'Export',
      chatTypes: ['saved', 'indexed', 'imported', 'readonly'],
      groups: [
        { id: 'copy', label: 'Copy', actions: [
          { id: 'copy-clean-transcript', label: 'Copy clean transcript' },
        ] },
        { id: 'download', label: 'Download', actions: [
          { id: 'export-markdown', label: 'Markdown' },
          { id: 'export-pdf',      label: 'PDF' },
          { id: 'export-docx',     label: 'DOCX' },
        ] },
        { id: 'print', label: 'Print', actions: [
          { id: 'print-view', label: 'Print view' },
        ] },
      ],
    },
  ];

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function getShell() {
    return H2O && H2O.Studio && H2O.Studio.ribbon;
  }
  function getContainer() {
    return document.getElementById('studioRibbon');
  }
  function safeEmit(name, detail) {
    try {
      if (H2O && H2O.events && typeof H2O.events.emit === 'function') {
        H2O.events.emit(name, detail || {});
      }
    } catch (_) { /* swallow */ }
  }
  function safeOn(name, fn) {
    try {
      if (H2O && H2O.events && typeof H2O.events.on === 'function') {
        H2O.events.on(name, fn);
      }
    } catch (_) { /* swallow */ }
  }

  /* ── Registration of the default catalogue ────────────────────────── */
  function registerCatalogue(shell) {
    TAB_CATALOGUE.forEach(function (tab) {
      shell.registerTab(tab.id, { label: tab.label, chatTypes: tab.chatTypes.slice() });
      tab.groups.forEach(function (group) {
        shell.registerGroup(tab.id, group.id, { label: group.label });
        group.actions.forEach(function (action) {
          shell.registerAction(tab.id, group.id, action.id, {
            label: action.label,
            disabled: true,
            tooltip: 'Coming soon',
            phase: '1a',
          });
        });
      });
    });
  }

  /* ── Tab filter for current chat type ─────────────────────────────── */
  function visibleTabsFor(chatType) {
    if (!chatType) return [];
    return TAB_CATALOGUE.filter(function (tab) {
      return tab.chatTypes.indexOf(chatType) !== -1;
    });
  }

  /* ── DOM building ─────────────────────────────────────────────────── */
  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'dataset' && attrs[k] && typeof attrs[k] === 'object') {
          Object.keys(attrs[k]).forEach(function (dk) { node.dataset[dk] = attrs[k][dk]; });
        } else if (k.indexOf('aria-') === 0 || k === 'role' || k === 'tabindex' || k === 'type' || k === 'id' || k === 'title' || k === 'hidden') {
          if (k === 'hidden') { if (attrs[k]) node.hidden = true; }
          else node.setAttribute(k, String(attrs[k]));
        } else {
          node.setAttribute(k, String(attrs[k]));
        }
      });
    }
    if (text != null) node.textContent = String(text);
    return node;
  }

  function buildTabStrip(visibleTabs, activeTabId, collapsed) {
    const strip = el('div', { class: 'wbRibbonBar' });

    const tablist = el('div', { class: 'wbRibbonTabs', role: 'tablist', 'aria-label': 'Studio ribbon tabs' });
    visibleTabs.forEach(function (tab) {
      const isActive = (tab.id === activeTabId);
      const tabBtn = el('button', {
        type: 'button',
        class: 'wbRibbonTab' + (isActive ? ' is-active' : ''),
        role: 'tab',
        id: 'wbRibbonTab-' + tab.id,
        'aria-selected': isActive ? 'true' : 'false',
        'aria-controls': 'wbRibbonPanel-' + tab.id,
        tabindex: isActive ? '0' : '-1',
        'data-tab-id': tab.id,
      }, tab.label);
      tablist.appendChild(tabBtn);
    });

    strip.appendChild(tablist);

    const collapseBtn = el('button', {
      type: 'button',
      class: 'wbRibbonCollapse',
      'aria-label': collapsed ? 'Expand ribbon' : 'Collapse ribbon',
      'aria-expanded': collapsed ? 'false' : 'true',
      title: collapsed ? 'Expand ribbon' : 'Collapse ribbon',
      'data-action': 'toggle-collapsed',
    });
    /* Chevron — purely decorative; the aria-label drives screen readers. */
    collapseBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" width="14" height="14">'
      + '<path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    strip.appendChild(collapseBtn);

    return strip;
  }

  function buildPanels(shell, visibleTabs, activeTabId) {
    const panels = el('div', { class: 'wbRibbonPanels' });
    visibleTabs.forEach(function (tab) {
      const isActive = (tab.id === activeTabId);
      const panel = el('div', {
        class: 'wbRibbonPanel',
        role: 'tabpanel',
        id: 'wbRibbonPanel-' + tab.id,
        'aria-labelledby': 'wbRibbonTab-' + tab.id,
        tabindex: '0',
        'data-tab-id': tab.id,
        hidden: !isActive,
      });

      const groups = shell.groupsForTab(tab.id);
      Object.keys(groups).forEach(function (gid, idx, arr) {
        const group = groups[gid];
        const groupEl = el('div', { class: 'wbRibbonGroup', 'data-group-id': group.id });
        const actionsRow = el('div', { class: 'wbRibbonGroupActions' });
        const actions = shell.actionsForGroup(tab.id, group.id);
        Object.keys(actions).forEach(function (aid) {
          const action = actions[aid];
          const btn = el('button', {
            type: 'button',
            class: 'wbRibbonAction',
            'data-action-id': action.id,
            title: action.tooltip || '',
            'aria-disabled': 'true',
            disabled: 'disabled',
          }, action.label);
          actionsRow.appendChild(btn);
        });
        groupEl.appendChild(actionsRow);
        const groupLabel = el('div', { class: 'wbRibbonGroupLabel' }, group.label);
        groupEl.appendChild(groupLabel);
        panel.appendChild(groupEl);
        if (idx < arr.length - 1) {
          panel.appendChild(el('div', { class: 'wbRibbonSeparator', 'aria-hidden': 'true' }));
        }
      });

      panels.appendChild(panel);
    });
    return panels;
  }

  /* ── Render orchestration ─────────────────────────────────────────── */
  function render(container, shell) {
    const ctx = shell.getContext();
    const chatType = (ctx && ctx.chatType) || null;
    const collapsed = !!shell.getCollapsed();

    /* Visibility: ribbon entirely hidden when no chat is open. */
    if (!chatType) {
      container.hidden = true;
      container.dataset.chatType = '';
      container.dataset.collapsed = '';
      /* Still clear content so a focus inside the hidden node has nothing
       * to grab. */
      container.innerHTML = '';
      return;
    }

    container.hidden = false;
    container.dataset.chatType = chatType;
    container.dataset.collapsed = collapsed ? 'true' : '';

    const visibleTabs = visibleTabsFor(chatType);
    if (!visibleTabs.length) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }

    /* Resolve active tab: persisted -> first visible. */
    let activeTabId = shell.getActiveTab();
    const visibleIds = visibleTabs.map(function (t) { return t.id; });
    if (!activeTabId || visibleIds.indexOf(activeTabId) === -1) {
      activeTabId = visibleTabs[0].id;
      /* Update the shell so persistence reflects the resolved state. */
      shell.setActiveTab(activeTabId);
    }

    container.innerHTML = '';
    container.appendChild(buildTabStrip(visibleTabs, activeTabId, collapsed));
    if (!collapsed) {
      container.appendChild(buildPanels(shell, visibleTabs, activeTabId));
    }
  }

  function focusActiveTab(container) {
    const active = container.querySelector('.wbRibbonTab[aria-selected="true"]');
    if (active && typeof active.focus === 'function') {
      try { active.focus(); } catch (_) { /* swallow */ }
    }
  }

  /* ── Keyboard navigation on the tablist ───────────────────────────── */
  function bindKeyboard(container, shell) {
    container.addEventListener('keydown', function (ev) {
      const target = ev.target;
      if (!target || !target.classList || !target.classList.contains('wbRibbonTab')) return;

      const tabs = Array.prototype.slice.call(container.querySelectorAll('.wbRibbonTab'));
      const idx = tabs.indexOf(target);
      if (idx === -1) return;

      let nextIdx = -1;
      switch (ev.key) {
        case 'ArrowRight': nextIdx = (idx + 1) % tabs.length; break;
        case 'ArrowLeft':  nextIdx = (idx - 1 + tabs.length) % tabs.length; break;
        case 'Home':       nextIdx = 0; break;
        case 'End':        nextIdx = tabs.length - 1; break;
        default: return;
      }
      ev.preventDefault();
      const nextTab = tabs[nextIdx];
      const tabId = nextTab && nextTab.getAttribute('data-tab-id');
      if (tabId) {
        shell.setActiveTab(tabId);
        /* render() will rebuild; refocus the new tab after rebuild. */
      }
    });
  }

  /* ── Click handlers (tab switch + collapse toggle only) ───────────── */
  function bindClicks(container, shell) {
    container.addEventListener('click', function (ev) {
      const target = ev.target;
      if (!target || !target.closest) return;

      const collapseBtn = target.closest('[data-action="toggle-collapsed"]');
      if (collapseBtn) {
        ev.preventDefault();
        shell.setCollapsed(!shell.getCollapsed());
        return;
      }

      const tabBtn = target.closest('.wbRibbonTab');
      if (tabBtn) {
        const tabId = tabBtn.getAttribute('data-tab-id');
        if (tabId) {
          ev.preventDefault();
          shell.setActiveTab(tabId);
        }
        return;
      }

      /* All action buttons are disabled in Phase 1a; nothing else to do. */
    });
  }

  /* ── Initialization ───────────────────────────────────────────────── */
  let initialized = false;
  function init() {
    if (initialized) return;
    const shell = getShell();
    if (!shell) return;
    const container = getContainer();
    if (!container) return;
    initialized = true;

    registerCatalogue(shell);

    bindKeyboard(container, shell);
    bindClicks(container, shell);

    /* Subscribe to shell events via the direct subscriber API. The global
     * H2O.events in the current Studio runtime exposes emit but not on, so
     * subscribing through that bus would silently no-op. shell.subscribe()
     * is the canonical channel for in-process listeners. */
    const evts = shell.events;
    if (typeof shell.subscribe === 'function') {
      shell.subscribe(function (evt) {
        const name = evt && evt.event;
        if (name === evts.contextChanged) {
          render(container, shell);
        } else if (name === evts.tabChanged) {
          render(container, shell);
          /* Move focus to the new active tab so arrow keys keep working. */
          focusActiveTab(container);
        } else if (name === evts.collapsedChanged) {
          render(container, shell);
        }
      });
    }

    /* Listen to prefs ready in case the shell hydrates active-tab/collapsed
     * asynchronously after the surface module renders. */
    try {
      const prefs = H2O.Studio && H2O.Studio.store && H2O.Studio.store.prefs;
      if (prefs && typeof prefs.subscribe === 'function') {
        prefs.subscribe(function (evt) {
          if (evt && evt.type === 'ready') render(container, shell);
        });
      }
    } catch (_) { /* swallow */ }

    /* Initial paint. Until studio.js calls shell.setContext, chatType is
     * null so the ribbon stays hidden — which is the correct passive
     * default. */
    render(container, shell);

    /* Mark the shell mounted (no-op in Phase 1a but emits 'ready'). */
    try { shell.mount(container); } catch (_) { /* swallow */ }
    safeEmit('evt:h2o:studio:ribbon:surface-ready', { phase: '1a' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})(globalThis);
