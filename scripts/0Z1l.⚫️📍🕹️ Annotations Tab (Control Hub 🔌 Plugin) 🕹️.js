// ==UserScript==
// @h2o-id             0z1l.annotations.tab.control.hub.plugin
// @name               0Z1l.⚫️📍🕹️ Annotations Tab (Control Hub 🔌 Plugin) 🕹️
// @namespace          H2O.Premium.CGX.annotations.tab.control.hub.plugin
// @author             HumamDev
// @version            0.1.0
// @revision           001
// @build              260505-000000
// @description        Registers the Annotations tab, Margin Anchor subtab, and Notes controls into Control Hub via plugin API.
// @match       https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const EV_CHUB_READY_V1 = 'h2o.ev:prm:cgx:cntrlhb:ready:v1';
  const MARK = '__H2O_CHUB_ANNOTATIONS_TAB_PLUGIN_V010__';

  if (W[MARK]) return;
  W[MARK] = true;

  let LAST_API = null;

  const FEATURE_KEY_ANNOTATIONS = 'annotations';
  const FEATURE_KEY_NOTES = 'notes';
  const FEATURE_KEY_MARGIN_ANCHOR = 'marginAnchor';
  const KEY_CHUB_ANNOTATIONS_SUBTAB_V1 = 'h2o:prm:cgx:cntrlhb:state:annotations:subtab:v1';

  const ANNOTATIONS_META = Object.freeze({
    key: FEATURE_KEY_ANNOTATIONS,
    label: 'Annotations',
    icon: '📍',
    subtitle: 'Margin anchors + notes surfaces grouped together.',
    category: 'nav',
    hidden: false,
    description: Object.freeze({
      default: 'Keep anchor marks and notes tools inside one annotations workspace.',
      focus: 'Switch between margin anchors and notes without hunting across separate hub areas.',
      review: 'Use anchors and notes together while reviewing longer chats.',
      performance: 'Keep annotation tools grouped while the underlying features stay unchanged.',
    }),
  });

  const ANNOTATIONS_SUBTABS = Object.freeze([
    Object.freeze({
      key: FEATURE_KEY_MARGIN_ANCHOR,
      label: 'Margin Anchor',
      icon: '📍',
      subtitle: 'Left-margin pins, notes, and status dots.',
      description: Object.freeze({
        default: 'Quickly jump to any margin pin.',
        focus: 'Surface active notes and anchors.',
        review: 'Keep reference marks visible during longer reads.',
        performance: 'Keep anchors lightweight.',
      }),
    }),
    Object.freeze({
      key: FEATURE_KEY_NOTES,
      label: 'Notes',
      icon: '🗒️',
      subtitle: 'Open and refresh the Dock Notes surface from Control Hub.',
      description: Object.freeze({
        default: 'Launch the existing Notes tab from Dock Panel and keep note actions nearby.',
        focus: 'Jump into Notes quickly while staying in the annotations area.',
        review: 'Open Notes and refresh side notes without leaving the review flow.',
        performance: 'Bridge into the current Notes surface instead of duplicating another notes system.',
      }),
    }),
  ]);

  const ANNOTATIONS_VISIBILITY = Object.freeze({
    selectors: Object.freeze([
      '[data-cgxui-owner="mrnc"]',
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

  function CHUB_DOCK_api() {
    return W.H2O?.DP?.dckpnl?.api || null;
  }

  function CHUB_NOTES_dockApi() {
    return CHUB_DOCK_api();
  }

  function CHUB_NOTES_notesApi() {
    return W.H2ONotes || W.HoNotes || null;
  }

  function CHUB_NOTES_emitChanged() {
    try { W.dispatchEvent(new Event('h2o:notes:changed')); } catch {}
    try { W.dispatchEvent(new Event('h2o-notes:changed')); } catch {}
  }

  function CHUB_NOTES_openPanel(reason = 'control-hub:notes:open') {
    const api = CHUB_NOTES_dockApi();
    if (!api) return { message: 'Dock Panel is unavailable.' };

    safeCall(`notes.open:${reason}`, () => {
      api.ensurePanel?.();
      api.open?.();
      api.setView?.('notes');
      api.requestRender?.();
    });
    return { message: 'Notes tab opened.' };
  }

  function CHUB_NOTES_refreshPanel(reason = 'control-hub:notes:refresh') {
    const api = CHUB_NOTES_dockApi();
    if (!api) return { message: 'Dock Panel is unavailable.' };

    safeCall(`notes.refresh:${reason}`, () => {
      api.setView?.('notes');
      api.requestRender?.();
    });
    return { message: 'Notes refreshed.' };
  }

  function CHUB_NOTES_clearScratch() {
    const api = CHUB_NOTES_notesApi();
    if (!api?.scratchSet) return { message: 'Notes Engine is unavailable.' };

    safeCall('notes.clearScratch', () => api.scratchSet(''));
    CHUB_NOTES_emitChanged();
    CHUB_NOTES_refreshPanel('control-hub:notes:clear-scratch');
    return { message: 'Scratchpad cleared.' };
  }

  const NOTES_CONTROLS = Object.freeze([
    Object.freeze({
      type: 'action',
      key: 'notesLaunch',
      label: 'Notes Panel',
      group: 'Launch',
      statusText: '',
      buttons: Object.freeze([
        Object.freeze({
          label: 'Open Notes',
          primary: true,
          action: () => CHUB_NOTES_openPanel(),
          successText: 'Opened.',
          errorText: 'Open failed.',
        }),
        Object.freeze({
          label: 'Refresh',
          action: () => CHUB_NOTES_refreshPanel(),
          successText: 'Refreshed.',
          errorText: 'Refresh failed.',
        }),
      ]),
    }),
    Object.freeze({
      type: 'action',
      key: 'notesScratch',
      label: 'Scratchpad',
      group: 'Notes',
      statusText: '',
      buttons: Object.freeze([
        Object.freeze({
          label: 'Clear Scratch',
          primary: true,
          action: () => CHUB_NOTES_clearScratch(),
          successText: 'Cleared.',
          errorText: 'Scratch unavailable.',
        }),
      ]),
    }),
    Object.freeze({ type: 'select', key: 'spPos', label: 'Dock Position', group: 'Dock Layout', def: 'right', opts: Object.freeze([Object.freeze(['right', 'Right']), Object.freeze(['left', 'Left'])]) }),
    Object.freeze({ type: 'range', key: 'spWidth', label: 'Dock Width', group: 'Dock Layout', def: 260, min: 220, max: 400, step: 10, unit: 'px' }),
  ]);

  function register() {
    const api = getApi();
    if (!api?.registerPlugin) return false;
    if (api === LAST_API) return true;

    try {
      api.registerPlugin({
        key: FEATURE_KEY_ANNOTATIONS,
        title: 'Annotations Tab',
        meta: ANNOTATIONS_META,
        category: 'nav',
        subtabs: ANNOTATIONS_SUBTABS,
        subtabStorageKey: KEY_CHUB_ANNOTATIONS_SUBTAB_V1,
        visibility: ANNOTATIONS_VISIBILITY,
      });
      api.registerPlugin({
        key: FEATURE_KEY_NOTES,
        getControls() {
          return NOTES_CONTROLS;
        },
      });
      LAST_API = api;
      invalidate(api);
      return true;
    } catch (error) {
      try { console.warn('[H2O AnnotationsTab] register failed', error); } catch {}
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
