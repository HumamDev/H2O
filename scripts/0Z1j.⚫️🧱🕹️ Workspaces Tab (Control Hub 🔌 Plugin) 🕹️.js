// ==UserScript==
// @h2o-id             0z1j.workspaces.tab.control.hub.plugin
// @name               0Z1j.⚫️🧱🕹️ Workspaces Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.workspaces.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Workspace Shelf and Drawer controls into Control Hub via plugin API.
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
  const MARK = '__H2O_CHUB_WORKSPACES_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let CLS = 'cgxui-cnhb';

  const FEATURE_KEY_WORKSPACE = 'workspace';
  const FEATURE_KEY_WORKSPACE_SHELF = 'workspaceShelf';
  const FEATURE_KEY_WORKSPACE_DRAWER = 'workspaceDrawer';
  const KEY_CHUB_WORKSPACE_SUBTAB_V1 = 'h2o:prm:cgx:cntrlhb:state:workspace:subtab:v1';

  const WORKSPACE_META = Object.freeze({
    key: FEATURE_KEY_WORKSPACE,
    label: 'Workspace',
    icon: '🧱',
    subtitle: 'Shelf and Drawer controls for the right-side workspace.',
    category: 'save',
    insertBefore: 'dataBackup',
    description: Object.freeze({
      default: 'Control Shelf and Drawer behavior from one workspace tab.',
      focus: 'Keep the active workspace pane easy to switch while you stay in the current chat.',
      review: 'Move between Shelf and Drawer without hunting for shell buttons.',
      performance: 'Choose the lighter workspace presentation mode when the chat UI feels crowded.',
    }),
  });

  const WORKSPACE_SUBTABS = Object.freeze([
    Object.freeze({
      key: FEATURE_KEY_WORKSPACE_SHELF,
      label: 'Shelf',
      icon: '📚',
      subtitle: 'Open and configure the Shelf workspace pane.',
      description: Object.freeze({
        default: 'Open the Shelf and adjust how the workspace shell is presented.',
        focus: 'Keep saved context visible in the Shelf.',
        review: 'Return to the Shelf quickly while checking artifacts.',
        performance: 'Use the lightest shell mode for Shelf work.',
      }),
    }),
    Object.freeze({
      key: FEATURE_KEY_WORKSPACE_DRAWER,
      label: 'Drawer',
      icon: '🧰',
      subtitle: 'Open and configure the Drawer workspace pane.',
      description: Object.freeze({
        default: 'Open the Drawer and adjust how the workspace shell is presented.',
        focus: 'Keep artifact editing one click away.',
        review: 'Use the Drawer while inspecting notes and prompt capsules.',
        performance: 'Switch Drawer presentation without overloading the viewport.',
      }),
    }),
  ]);

  const WORKSPACE_VISIBILITY = Object.freeze({
    selectors: Object.freeze([
      '#cgxui-wsdk-root',
      '[data-cgxui-owner="wsdk"]',
    ]),
    hideCss: `
__ROOT__ body{
  transform:none !important;
}
`,
  });

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

  function safeCall(_label, fn) {
    try { return fn(); } catch {}
    return undefined;
  }

  function invalidate(api = LAST_API) {
    if (!api || typeof api.invalidate !== 'function') return;
    try { W.setTimeout(() => api.invalidate(), 0); } catch {}
  }

  function applySkin(api) {
    let skin = null;
    try { skin = typeof api?.getSkin === 'function' ? api.getSkin() : null; } catch {}
    CLS = skin?.CLS || CLS;
  }

  function workspaceApi() {
    try { return (TOPW.H2O || W.H2O)?.Workspace || null; } catch {}
    return null;
  }

  function workspaceState() {
    return safeCall('workspace.getState', () => workspaceApi()?.getRightState?.()) || { open: false, pane: 'shelf', dockMode: 'overlay' };
  }

  function openShelfAction() {
    const ok = safeCall('workspace.openShelf', () => workspaceApi()?.openShelf?.());
    invalidate();
    return { message: ok ? 'Shelf opened.' : 'Workspace Shelf is unavailable.' };
  }

  function openDrawerAction() {
    const ok = safeCall('workspace.openDrawer', () => workspaceApi()?.openDrawer?.());
    invalidate();
    return { message: ok ? 'Drawer opened.' : 'Workspace Drawer is unavailable.' };
  }

  function closeAction() {
    const ok = safeCall('workspace.close', () => workspaceApi()?.closeRightShell?.());
    invalidate();
    return { message: ok ? 'Workspace closed.' : 'Workspace shell is unavailable.' };
  }

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

  function renderStatus() {
    const state = workspaceState();
    return renderInfoList([
      { label: 'Open', value: state.open ? 'Yes' : 'No' },
      { label: 'Pane', value: String(state.pane || 'shelf') },
      { label: 'Mode', value: String(state.dockMode || 'overlay') },
    ]);
  }

  const WORKSPACE_SHELF_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'custom',
      key: 'workspaceShelfStatus',
      label: 'Status',
      group: 'Shelf',
      render() { return renderStatus(); },
    }),
    Object.freeze({
      type: 'action',
      key: 'workspaceShelfActions',
      label: 'Shelf',
      group: 'Shelf',
      statusText: '',
      buttons: Object.freeze([
        Object.freeze({ label: 'Open Shelf', primary: true, action: () => openShelfAction() }),
        Object.freeze({ label: 'Close', action: () => closeAction() }),
      ]),
    }),
    Object.freeze({
      type: 'select',
      key: 'workspaceShelfDockMode',
      label: 'Presentation',
      group: 'Shell Mode',
      def: 'overlay',
      opts: Object.freeze([Object.freeze(['overlay', 'Overlay']), Object.freeze(['dock', 'Dock'])]),
      getLive() { return String(workspaceState().dockMode || 'overlay'); },
      setLive(v) { safeCall('workspace.setDockMode', () => workspaceApi()?.setDockMode?.(v)); invalidate(); },
    }),
  ]);

  const WORKSPACE_DRAWER_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'custom',
      key: 'workspaceDrawerStatus',
      label: 'Status',
      group: 'Drawer',
      render() { return renderStatus(); },
    }),
    Object.freeze({
      type: 'action',
      key: 'workspaceDrawerActions',
      label: 'Drawer',
      group: 'Drawer',
      statusText: '',
      buttons: Object.freeze([
        Object.freeze({ label: 'Open Drawer', primary: true, action: () => openDrawerAction() }),
        Object.freeze({ label: 'Close', action: () => closeAction() }),
      ]),
    }),
    Object.freeze({
      type: 'select',
      key: 'workspaceDrawerDockMode',
      label: 'Presentation',
      group: 'Shell Mode',
      def: 'overlay',
      opts: Object.freeze([Object.freeze(['overlay', 'Overlay']), Object.freeze(['dock', 'Dock'])]),
      getLive() { return String(workspaceState().dockMode || 'overlay'); },
      setLive(v) { safeCall('workspace.setDockMode', () => workspaceApi()?.setDockMode?.(v)); invalidate(); },
    }),
  ]);

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      applySkin(api);
      api.registerPlugin({
        key: FEATURE_KEY_WORKSPACE,
        title: 'Workspaces Tab',
        meta: WORKSPACE_META,
        category: 'save',
        subtabs: WORKSPACE_SUBTABS,
        subtabStorageKey: KEY_CHUB_WORKSPACE_SUBTAB_V1,
        visibility: WORKSPACE_VISIBILITY,
      });
      api.registerPlugin({
        key: FEATURE_KEY_WORKSPACE_SHELF,
        getControls() {
          return WORKSPACE_SHELF_CONTROLS;
        },
      });
      api.registerPlugin({
        key: FEATURE_KEY_WORKSPACE_DRAWER,
        getControls() {
          return WORKSPACE_DRAWER_CONTROLS;
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O WorkspacesTab] register failed', error); } catch {}
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
