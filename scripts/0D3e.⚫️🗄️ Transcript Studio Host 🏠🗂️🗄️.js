// ==UserScript==
// @h2o-id             0d3e.transcript.studio.host
// @name               0D3e.⚫️🗄️ Transcript Studio Host 🏠🗂️🗄️
// @namespace          H2O.Premium.CGX.transcript.studio.host
// @author             HumamDev
// @version            1.3.0
// @revision           001
// @build              260415-000001
// @description        Studio H2O Host: Studio reader -> real H2O runtime bridge
// ==/UserScript==

(function studioH2OHost() {
  "use strict";

  const W = window;
  const D = document;

  W.H2O = W.H2O || {};
  W.H2O.util = W.H2O.util || {};

  const STATE = {
    mounted: false,
    readerRoot: null,
    scrollEl: null,
    snapshot: null,
    assistantTurnEls: [],
    route: null,
    prevUrl: "",
    prevGetChatId: null,
  };

  function setStudioFlags(on) {
    try { W.H2O_STUDIO_MODE = !!on; } catch {}
    try {
      if (on) D.documentElement.setAttribute("data-h2o-studio-mode", "1");
      else D.documentElement.removeAttribute("data-h2o-studio-mode");
    } catch {}
    try {
      if (on) D.body?.setAttribute("data-h2o-studio-mode", "1");
      else D.body?.removeAttribute("data-h2o-studio-mode");
    } catch {}
  }

  function installChatIdOverride() {
    if (STATE.prevGetChatId) return;
    const orig = W.H2O?.util?.getChatId;
    STATE.prevGetChatId = (typeof orig === "function") ? orig : null;

    W.H2O.util.getChatId = function patchedGetChatId() {
      const chatId = String(STATE.route?.chatId || "").trim();
      if (chatId) return chatId;
      if (typeof STATE.prevGetChatId === "function") {
        try { return STATE.prevGetChatId(); } catch {}
      }
      return "";
    };
  }

  function uninstallChatIdOverride() {
    if (STATE.prevGetChatId) {
      W.H2O.util.getChatId = STATE.prevGetChatId;
    } else {
      delete W.H2O.util.getChatId;
    }
    STATE.prevGetChatId = null;
  }

  function buildRoutePath(chatId, projectId) {
    const cId = String(chatId || "").trim();
    const pId = String(projectId || "").trim();
    if (!cId) return "";
    if (pId) return `/g/${encodeURIComponent(pId)}/c/${encodeURIComponent(cId)}`;
    return `/c/${encodeURIComponent(cId)}`;
  }

  function dispatchRouteChanged(reason) {
    const detail = {
      source: "studio-host",
      studio: true,
      reason: String(reason || ""),
      chatId: String(STATE.route?.chatId || ""),
      projectId: String(STATE.route?.projectId || ""),
      path: String(STATE.route?.path || W.location.pathname || ""),
    };

    try { W.dispatchEvent(new CustomEvent("evt:h2o:route:changed", { detail })); } catch {}
  }

  function setRoute(chatId, projectId) {
    const path = buildRoutePath(chatId, projectId);
    if (!path) return "";

    if (!STATE.prevUrl) {
      STATE.prevUrl = `${W.location.pathname}${W.location.search}${W.location.hash}`;
    }

    try {
      history.replaceState(
        Object.assign({}, history.state || {}, {
          h2oStudioReader: true,
          chatId: String(chatId || ""),
          projectId: String(projectId || "")
        }),
        "",
        path
      );
    } catch {}

    STATE.route = {
      chatId: String(chatId || ""),
      projectId: String(projectId || ""),
      path
    };

    dispatchRouteChanged("studio:set-route");
    return path;
  }

  function clearRoute() {
    if (STATE.prevUrl) {
      try {
        history.replaceState(
          Object.assign({}, history.state || {}, { h2oStudioReader: false }),
          "",
          STATE.prevUrl
        );
      } catch {}
    }

    STATE.prevUrl = "";
    STATE.route = null;
    dispatchRouteChanged("studio:clear-route");
  }

  function getReaderRoot() {
    return STATE.readerRoot && STATE.readerRoot.isConnected ? STATE.readerRoot : null;
  }

  function getScrollRoot() {
    return STATE.scrollEl && STATE.scrollEl.isConnected ? STATE.scrollEl : null;
  }

  function ensureReaderMarkers() {
    const root = getReaderRoot();
    const scrollEl = getScrollRoot();
    if (!root || !scrollEl) return;

    try { root.setAttribute("data-h2o-studio-reader", "1"); } catch {}
    try { scrollEl.setAttribute("data-testid", "conversation-turns"); } catch {}
  }

  function flushLifecycle(reason) {
    try { W.H2O?.obs?.ensureRoot?.(reason); } catch {}
    try { W.H2O?.index?.refresh?.(reason); } catch {}
    try { W.H2O?.obs?.markDirty?.(reason); } catch {}
    try { W.H2O?.obs?.flush?.(reason); } catch {}
  }

  function flushLifecycleMulti(reasonBase) {
    flushLifecycle(`${reasonBase}:sync`);
    try {
      W.requestAnimationFrame(() => {
        flushLifecycle(`${reasonBase}:raf1`);
        W.requestAnimationFrame(() => {
          flushLifecycle(`${reasonBase}:raf2`);
        });
      });
      W.setTimeout(() => flushLifecycle(`${reasonBase}:late`), 120);
    } catch {}
  }

  function mount(opts = {}) {
    unmount("studio:remount");

    const readerRoot = opts.readerRoot || null;
    const scrollEl = opts.scrollEl || null;
    const snapshot = opts.snapshot || null;
    const assistantTurnEls = Array.isArray(opts.assistantTurnEls) ? opts.assistantTurnEls.filter(Boolean) : [];

    STATE.readerRoot = readerRoot;
    STATE.scrollEl = scrollEl;
    STATE.snapshot = snapshot;
    STATE.assistantTurnEls = assistantTurnEls;
    STATE.mounted = !!(readerRoot && scrollEl);

    setStudioFlags(true);
    installChatIdOverride();
    ensureReaderMarkers();

    const meta = snapshot?.meta && typeof snapshot.meta === "object" ? snapshot.meta : {};
    const chatId = String(snapshot?.chatId || meta.chatId || "").trim();
    const projectId = String(meta.projectId || "").trim();

    setRoute(chatId, projectId);
    flushLifecycleMulti("studio:mount");

    return true;
  }

  function unmount(reason = "studio:unmount") {
    if (!STATE.mounted && !STATE.route && !STATE.prevUrl) return false;

    try {
      W.H2O?.obs?.withSuppressed?.(reason, () => {}, { flush: true });
    } catch {}

    STATE.mounted = false;
    STATE.readerRoot = null;
    STATE.scrollEl = null;
    STATE.snapshot = null;
    STATE.assistantTurnEls = [];

    clearRoute();
    uninstallChatIdOverride();
    setStudioFlags(false);

    try { W.H2O?.obs?.flush?.(reason); } catch {}

    return true;
  }

  W.H2O.studioHost = {
    mount,
    unmount,
    setRoute,
    clearRoute,
    getReaderRoot,
    getScrollRoot,
    isStudio: true,
  };

  setStudioFlags(true);
}());
