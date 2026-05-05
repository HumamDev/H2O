// ==UserScript==
// @h2o-id             0z1i.studio.tab.control.hub.plugin
// @name               0Z1i.⚫️🎬🕹️ Studio Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.studio.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Studio tab controls into Control Hub via plugin API.
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
  const MARK = '__H2O_CHUB_STUDIO_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;
  let CLS = 'cgxui-cnhb';

  const FEATURE_KEY_STUDIO = 'studio';

  const STUDIO_META = Object.freeze({
    key: FEATURE_KEY_STUDIO,
    label: 'Studio',
    icon: '🧪',
    subtitle: 'Workbench / Studio entry points for saved snapshots.',
    category: 'save',
    insertBefore: 'library',
    toggleHidden: true,
    description: Object.freeze({
      default: 'Open the saved-chat studio, snapshot reader, and workbench surfaces.',
      focus: 'Jump straight into captured material while keeping the live chat uncluttered.',
      review: 'Inspect saved chat snapshots and workbench rows from one studio tab.',
      performance: 'Use reader and workbench surfaces only when you need them, not all the time.',
    }),
  });

  const STUDIO_VISIBILITY = Object.freeze({
    selectors: Object.freeze([
      '.h2o-archive-reader',
      '.h2o-archive-saved',
    ]),
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

  function CHUB_STUDIO_api() {
    return W.H2O?.archiveBoot || null;
  }

  function CHUB_STUDIO_legacyApi() {
    return W.H2O?.archive || null;
  }

  function CHUB_STUDIO_chatId() {
    return String(W.H2O?.util?.getChatId?.() || '');
  }

  async function CHUB_STUDIO_openLatestSnapshot() {
    const api = CHUB_STUDIO_api();
    if (!api?.openWorkbench) return { ok: false, message: 'Studio workbench is unavailable.' };

    const chatId = CHUB_STUDIO_chatId();
    let snapshotId = '';
    if (api?.loadLatestSnapshot && chatId) {
      try {
        const latest = await api.loadLatestSnapshot(chatId);
        snapshotId = String(latest?.snapshotId || '').trim();
      } catch {}
    }

    const route = snapshotId ? `/read/${encodeURIComponent(snapshotId)}` : '/saved';
    safeCall('studio.openLatestSnapshot', () => api.openWorkbench(route));
    return {
      ok: true,
      snapshotId,
      message: snapshotId ? 'Latest snapshot opened in Studio.' : 'Studio opened.'
    };
  }

  function CHUB_STUDIO_openWorkbenchAction() {
    const api = CHUB_STUDIO_api();
    if (!api?.openWorkbench) return { message: 'Studio workbench is unavailable.' };
    safeCall('studio.openWorkbench', () => api.openWorkbench());
    return { ok: true, message: 'Studio opened.' };
  }

  function CHUB_STUDIO_openSavedChatsAction() {
    const api = CHUB_STUDIO_api();
    if (!api?.openSavedChats) return { message: 'Saved chats are unavailable.' };
    safeCall('studio.openSavedChats', () => api.openSavedChats({}));
    return { ok: true, message: 'Saved chats opened.' };
  }

  async function CHUB_STUDIO_openReaderAction() {
    const api = CHUB_STUDIO_api();
    if (!api?.openWorkbench) return { message: 'Studio workbench is unavailable.' };
    return CHUB_STUDIO_openLatestSnapshot();
  }

  async function CHUB_STUDIO_captureAction() {
    const api = CHUB_STUDIO_api();
    if (!api?.captureNow) return { message: 'Capture is unavailable.' };
    const res = await api.captureNow(CHUB_STUDIO_chatId());
    invalidate();
    if (res?.ok === false) return { message: String(res?.message || res?.error || 'Capture failed.') };
    return { ok: true, message: res?.deduped ? 'No new changes to capture.' : 'Snapshot captured.' };
  }

  function CHUB_STUDIO_renderStatus() {
    const api = CHUB_STUDIO_api();
    const latest = safeCall('studio.getLatest', () => CHUB_STUDIO_legacyApi()?.getLatest?.()) || null;
    return renderInfoList([
      { label: 'Ready', value: api ? 'Yes' : 'No' },
      { label: 'Workbench', value: api?.isExtensionBacked?.() ? 'Extension-backed' : 'Local / fallback' },
      { label: 'Latest Snapshot', value: latest?.capturedAt ? new Date(latest.capturedAt).toLocaleString('en-US') : 'None yet' },
    ]);
  }

  const STUDIO_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'custom',
      key: 'studioStatus',
      label: 'Status',
      group: 'Studio',
      render() { return CHUB_STUDIO_renderStatus(); },
    }),
    Object.freeze({
      type: 'action',
      key: 'studioOpeners',
      label: 'Studio Surfaces',
      group: 'Studio',
      statusText: '',
      buttons: Object.freeze([
        Object.freeze({ label: 'Open Studio', primary: true, action: () => CHUB_STUDIO_openWorkbenchAction() }),
        Object.freeze({ label: 'Saved Chats', action: () => CHUB_STUDIO_openSavedChatsAction() }),
        Object.freeze({ label: 'Latest Snapshot', action: () => CHUB_STUDIO_openReaderAction() }),
      ]),
    }),
    Object.freeze({
      type: 'action',
      key: 'studioCapture',
      label: 'Snapshots',
      group: 'Snapshots',
      statusText: '',
      buttons: Object.freeze([
        Object.freeze({ label: 'Capture Current Chat', primary: true, action: () => CHUB_STUDIO_captureAction() }),
      ]),
    }),
  ]);

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      applySkin(api);
      api.registerPlugin({
        key: FEATURE_KEY_STUDIO,
        title: 'Studio',
        meta: STUDIO_META,
        category: 'save',
        visibility: STUDIO_VISIBILITY,
        getControls() {
          return STUDIO_CONTROLS;
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O StudioTab] register failed', error); } catch {}
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
