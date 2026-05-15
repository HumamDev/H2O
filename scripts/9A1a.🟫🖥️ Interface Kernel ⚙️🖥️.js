// ==H2O Module==
// @h2o-id             9a1a.interface.kernel
// @name               9A1a.🟫🖥️ Interface Kernel ⚙️🖥️
// @namespace          H2O.Premium.CGX.interface.kernel
// @author             HumamDev
// @version            6.4
// @revision           002
// @build              260506-212559
// @description        Interface Kernel: shared config, storage, heat, navigation, locks, and pin scheduling
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  if (window.H2O?.interface?.version) return;
  if (!window.H2O) window.H2O = {};

  const COLORS = [
    { name: "gold",  value: "rgba(212,175,55,1)" },
    { name: "red",   value: "rgba(179,58,58,1)" },
    { name: "blue",  value: "rgba(70,100,200,1)" },
    { name: "green", value: "rgba(60,150,90,1)" }
  ];

  const DOT_KEY = id => `ho:chat-dot-idx:${id}`;
  const ROW_KEY = id => `ho:chat-row-idx:${id}`;
  const LASTSEEN_KEY = id => `ho:chat-lastseen:${id}`;
  const META_KEY = "ho:chat-meta-v1";
  const OVERRIDE_KEY = id => `ho:chat-heat-override:${id}`;
  const PIN_KEY = id => `ho:chat-pin:${id}`;
  const INTERFACE_META_MIRROR_KEY = id => `h2o:prm:cgx:library:interface-meta:v1:${id}`;
  const NATIVE_BROADCAST_KEY = "h2o:library:cross-surface:broadcast:native:v1";
  const ACTIVITY_STYLE_KEY = "ho:chat-list-activity-style";
  const HEAT_CLASSES = ['ho-heat-hot','ho-heat-warm','ho-heat-off'];
  const HEAT_CLASS_CLEANUP = [...HEAT_CLASSES, 'ho-heat-cold'];
  const HEAT_LEVELS = new Set(['auto', 'hot', 'warm', 'off']);
  const ACTIVITY_STYLES = new Set(['edge-strip', 'edge-wide']);

  function normalizeHeatLevel(level) {
    return HEAT_LEVELS.has(level) ? level : "off";
  }

  function normalizeActivityStyle(value) {
    const key = String(value || "").trim().toLowerCase();
    return ACTIVITY_STYLES.has(key) ? key : "edge-strip";
  }

  function loadMetaStore() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); }
    catch { return {}; }
  }

  function saveMetaStore(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta || {})); } catch {}
  }

  function hasChromeStorage() {
    try {
      return !!(window.chrome && chrome.storage && chrome.storage.local && typeof chrome.storage.local.set === "function");
    } catch {
      return false;
    }
  }

  let HO_MIRROR_APPLYING = 0;

  function broadcastInterfaceMirror(reason, payload) {
    if (!hasChromeStorage()) return;
    try {
      chrome.storage.local.set({
        [NATIVE_BROADCAST_KEY]: {
          ts: Date.now(),
          surface: "native",
          reason: String(reason || "interface-meta"),
          payload: payload && typeof payload === "object" ? payload : null,
        },
      });
    } catch {}
  }

  function mirrorInterfaceState(id, partial, reason = "interface-meta") {
    if (HO_MIRROR_APPLYING || !id || !partial || typeof partial !== "object") return;
    const metaStore = loadMetaStore();
    const current = metaStore?.[id] && typeof metaStore[id] === "object" ? metaStore[id] : {};
    const currentHeat = normalizeHeatLevel(localStorage.getItem(OVERRIDE_KEY(id)) || current.heatOverride || "auto");
    const currentPinned = localStorage.getItem(PIN_KEY(id)) === "1" || !!current.pinned;
    const next = {
      ...current,
      heatOverride: currentHeat,
      pinned: currentPinned,
      ...partial,
      chatId: id,
      updatedAt: partial.updatedAt || Date.now(),
    };
    const key = INTERFACE_META_MIRROR_KEY(id);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    try { window.H2O?.Library?.Store?.set?.(key, next)?.catch?.(() => {}); } catch {}
    if (hasChromeStorage()) {
      try { chrome.storage.local.set({ [key]: next }); } catch {}
    }
    broadcastInterfaceMirror(reason, { chatId: id, meta: next });
  }

  function applyInterfaceMirror(id, value) {
    if (!id || !value || typeof value !== "object") return;
    HO_MIRROR_APPLYING++;
    try {
      if (Object.prototype.hasOwnProperty.call(value, "heatOverride")) {
        const heat = normalizeHeatLevel(value.heatOverride || "auto");
        if (heat === "auto") localStorage.removeItem(OVERRIDE_KEY(id));
        else localStorage.setItem(OVERRIDE_KEY(id), heat);
      }

      if (value.pinned) localStorage.setItem(PIN_KEY(id), "1");
      else if (Object.prototype.hasOwnProperty.call(value, "pinned")) localStorage.removeItem(PIN_KEY(id));

      if (Object.prototype.hasOwnProperty.call(value, "rowTint")) {
        const rowTint = Number.parseInt(value.rowTint, 10);
        if (Number.isFinite(rowTint) && rowTint >= 0) localStorage.setItem(ROW_KEY(id), String(rowTint));
        else localStorage.removeItem(ROW_KEY(id));
      }

      const metaPatch = { ...value };
      delete metaPatch.chatId;
      delete metaPatch.heatOverride;
      delete metaPatch.pinned;
      const hasMetaPatch = Object.keys(metaPatch).some((key) => metaPatch[key] !== undefined && metaPatch[key] !== null && metaPatch[key] !== "");
      if (hasMetaPatch) {
        const meta = loadMetaStore();
        meta[id] = { ...(meta[id] || {}), ...metaPatch };
        saveMetaStore(meta);
      }
    } catch {
    } finally {
      HO_MIRROR_APPLYING--;
    }
    try { window.dispatchEvent(new Event(api.nav.EVENT)); } catch {}
    try { window.dispatchEvent(new CustomEvent("h2o:interface:meta-mirror", { detail: { chatId: id } })); } catch {}
  }

  function bindInterfaceMirrorSync() {
    if (!hasChromeStorage() || !chrome.storage.onChanged || typeof chrome.storage.onChanged.addListener !== "function") return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        for (const key of Object.keys(changes || {})) {
          if (!key.startsWith("h2o:prm:cgx:library:interface-meta:v1:")) continue;
          const chatId = key.slice("h2o:prm:cgx:library:interface-meta:v1:".length);
          const next = changes[key]?.newValue;
          if (chatId && next && typeof next === "object") applyInterfaceMirror(chatId, next);
        }
      });
    } catch {}
  }

  function unwrapCrossSurfacePayload(detail) {
    const root = detail && typeof detail === "object" ? detail : {};
    const payload = root.payload && typeof root.payload === "object" ? root.payload : root;
    return payload.payload && typeof payload.payload === "object" ? payload.payload : payload;
  }

  function applyCrossSurfaceInterfaceMeta(detail) {
    const payload = unwrapCrossSurfacePayload(detail);
    const meta = payload?.meta && typeof payload.meta === "object"
      ? payload.meta
      : (payload?.interfaceMeta && typeof payload.interfaceMeta === "object" ? payload.interfaceMeta : payload);
    const chatId = String(payload?.chatId || meta?.chatId || "").trim();
    if (!chatId || !meta || typeof meta !== "object") return false;
    const hasInterfacePatch = ["heatOverride", "pinned", "rowTint"].some((key) => (
      Object.prototype.hasOwnProperty.call(meta, key)
    ));
    if (!hasInterfacePatch) return false;
    applyInterfaceMirror(chatId, meta);
    return true;
  }

  function bindCrossSurfaceInterfaceMirrorSync() {
    const handler = (ev) => {
      try { applyCrossSurfaceInterfaceMeta(ev && ev.detail); } catch {}
    };
    try { window.addEventListener("evt:h2o:library:cross-surface-sync", handler); } catch {}
    try { window.addEventListener("h2o:library:cross-surface-sync", handler); } catch {}
  }

  function getChatIdFromHref(href) {
    if (!href) return null;

    // accept absolute or relative
    // supports: /c/ID , https://chatgpt.com/c/ID , /chat/ID (some UIs)
    const m =
      href.match(/\/c\/([^/?#]+)/) ||
      href.match(/\/chat\/([^/?#]+)/);

    return m ? m[1] : null;
  }

  function currentChatId() {
    return location.pathname.match(/\/c\/([^/?#]+)/)?.[1] || null;
  }

  let HO_INTERNAL_MUT = 0;
  const lock = {
    with(fn) {
      HO_INTERNAL_MUT++;
      try { return fn(); } finally { HO_INTERNAL_MUT--; }
    },
    locked() { return HO_INTERNAL_MUT > 0; },
  };

  let hoPinSortRAF = 0;
  let hoPinSortTO = 0;

  const api = {
    version: '1.0.0',

    config: {
      COLORS,
    },

    keys: {
      dot: DOT_KEY,
      row: ROW_KEY,
      lastseen: LASTSEEN_KEY,
      override: OVERRIDE_KEY,
      pin: PIN_KEY,
      meta: META_KEY,
      activityStyle: ACTIVITY_STYLE_KEY,
    },

    store: {
      getDot(id) {
        const stored = localStorage.getItem(DOT_KEY(id));
        return stored !== null ? parseInt(stored, 10) : -1;
      },
      setDot(id, idx) {
        if (idx < 0) localStorage.removeItem(DOT_KEY(id));
        else localStorage.setItem(DOT_KEY(id), String(idx));
      },
      getRow(id) {
        const stored = localStorage.getItem(ROW_KEY(id));
        return stored !== null ? parseInt(stored, 10) : -1;
      },
      setRow(id, idx) {
        const next = Number.parseInt(idx, 10);
        if (!Number.isFinite(next) || next < 0) localStorage.removeItem(ROW_KEY(id));
        else localStorage.setItem(ROW_KEY(id), String(next));
        mirrorInterfaceState(id, { rowTint: Number.isFinite(next) ? next : -1 }, "interface-row-tint");
      },
      getOverride(id) {
        const stored = localStorage.getItem(OVERRIDE_KEY(id));
        return stored === null ? "auto" : normalizeHeatLevel(stored);
      },
      setOverride(id, level) {
        const next = normalizeHeatLevel(level);
        if (next === "auto") localStorage.removeItem(OVERRIDE_KEY(id));
        else localStorage.setItem(OVERRIDE_KEY(id), next);
        mirrorInterfaceState(id, { heatOverride: next }, "interface-heat-override");
      },
      isPinned(id) {
        try { return localStorage.getItem(PIN_KEY(id)) === "1"; }
        catch { return false; }
      },
      setPinned(id, on) {
        try {
          if (on) localStorage.setItem(PIN_KEY(id), "1");
          else localStorage.removeItem(PIN_KEY(id));
          mirrorInterfaceState(id, { pinned: !!on }, "interface-pin");
        } catch {}
      },
      getActivityStyle() {
        try { return normalizeActivityStyle(localStorage.getItem(ACTIVITY_STYLE_KEY)); }
        catch { return "edge-strip"; }
      },
      setActivityStyle(value) {
        const next = normalizeActivityStyle(value);
        try {
          if (next === "edge-strip") localStorage.removeItem(ACTIVITY_STYLE_KEY);
          else localStorage.setItem(ACTIVITY_STYLE_KEY, next);
        } catch {}
        return next;
      },
      getLastSeen(id) {
        return parseInt(localStorage.getItem(LASTSEEN_KEY(id)) || "0", 10);
      },
      touchLastSeen(id) {
        if (!id) return;
        localStorage.setItem(LASTSEEN_KEY(id), String(Date.now()));
      },
      getMeta(id) {
        const meta = loadMetaStore();
        return meta?.[id] || null;
      },
      getAllMeta() {
        return loadMetaStore();
      },
      setMeta(id, partial) {
        if (!id) return;
        const meta = loadMetaStore();
        meta[id] = { ...(meta[id] || {}), ...(partial || {}) };
        saveMetaStore(meta);
        mirrorInterfaceState(id, meta[id], "interface-meta");
      },
    },

    lock,

    heat: {
      CLASSES: HEAT_CLASSES,
      getLastActivity(chatId) {
        const meta = loadMetaStore();
        const m = meta?.[chatId];
        const seen = parseInt(localStorage.getItem(LASTSEEN_KEY(chatId)) || "0", 10);
        return Math.max(seen, (m?.updatedAt || 0), (m?.createdAt || 0));
      },
      getLevel(chatId) {
        const ov = api.store.getOverride(chatId);
        if (ov !== "auto") return ov;

        const t = api.heat.getLastActivity(chatId);
        if (!t) return "off";

        const ageHrs = (Date.now() - t) / 36e5;
        if (ageHrs <= 24) return "hot";
        if (ageHrs <= 24 * 7) return "warm";
        return "off";
      },
      applyToBtn(btn, chatId) {
        if (!btn || !chatId) return;
        btn.classList.remove(...HEAT_CLASS_CLEANUP);
        btn.classList.add("ho-heat-" + api.heat.getLevel(chatId));
      },
    },

    nav: {
      EVENT: 'ho:navigate',
      getChatIdFromHref,
      currentChatId,
      installHistoryHook() {
        if (window.__h2o_interface_history_hooked) return;
        window.__h2o_interface_history_hooked = true;

        const _push = history.pushState;
        const _rep = history.replaceState;

        function touchAndNotify() {
          api.store.touchLastSeen(currentChatId());
          window.dispatchEvent(new Event(api.nav.EVENT));
        }

        history.pushState = function(...args) {
          const r = _push.apply(this, args);
          touchAndNotify();
          return r;
        };

        history.replaceState = function(...args) {
          const r = _rep.apply(this, args);
          touchAndNotify();
          return r;
        };

        window.addEventListener("popstate", touchAndNotify);
      },
      installProjectClickHook() {
        if (window.__h2o_interface_project_click_hooked) return;
        window.__h2o_interface_project_click_hooked = true;

        function hoFireNavigate() {
          window.dispatchEvent(new Event(api.nav.EVENT));
        }

        document.addEventListener("click", (e) => {
          const a = e.target instanceof HTMLElement
            ? e.target.closest('nav a.ho-project-row, nav .ho-seeall')
            : null;
          if (!a) return;

          setTimeout(hoFireNavigate, 80);
        }, true);
      },
    },

    pin: {
      schedule(sorterFn) {
        cancelAnimationFrame(hoPinSortRAF);
        clearTimeout(hoPinSortTO);

        hoPinSortRAF = requestAnimationFrame(() => {
          if (typeof sorterFn !== "function") return;
          lock.with(() => sorterFn());
        });
      },
    },

    utils: {
      qsa(sel, root=document) { return [...root.querySelectorAll(sel)]; },
      debounce(fn, ms=50) {
        let t;
        return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
      },
      // True when `el` lives inside any H2O-owned UI surface (Tag Viewer, Bubble Cloud
      // popups, in-shell pages, and any future module that uses the standard cgxui
      // ownership markers). Used by the Chat List Decorator (9A1b) and Chat Meta
      // Enricher (9A1c) to skip rows that look like native ChatGPT chat-link rows but
      // are actually injected by H2O's own UI — preventing duplicate "Open once · — answers"
      // meta rows + decorator pills inside the Tag Viewer / Bubble Cloud candidate popup.
      isInsideH2OInternalSurface(el) {
        if (!el || typeof el.closest !== 'function') return false;
        try {
          return !!(
            el.closest('[data-cgxui-owner]') ||           // generic H2O cgxui ownership marker
            el.closest('[data-cgxui]') ||                  // generic H2O cgxui element marker
            el.closest('[data-h2o-tags-chat-header]') ||   // Tag Viewer per-chat header rows
            el.closest('[data-h2o-tags-turn-row]') ||      // Tag Viewer per-turn rows
            el.closest('[data-h2o-tags-nonce]') ||         // Tag Viewer / Bubble Cloud list container
            el.closest('[data-h2o-tags-open-btn]') ||      // Tag Viewer "Open" button row
            el.closest('[data-h2o-shell]') ||              // generic H2O shell containers
            el.closest('[data-h2o-page]')                  // generic H2O page containers
          );
        } catch (_e) { return false; }
      },
    },
  };

  window.H2O.interface = api;

  bindInterfaceMirrorSync();
  bindCrossSurfaceInterfaceMirrorSync();
  api.nav.installHistoryHook();
  api.nav.installProjectClickHook();

  const id = api.nav.currentChatId();
  if (id) api.store.touchLastSeen(id);
})();
