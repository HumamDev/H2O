// ==UserScript==
// @h2o-id             0d3b.transcript.extension.bridge
// @name               0D3b.⚫️🗄️ Transcript Extension Bridge 📡🗂️🗄️
// @namespace          H2O.Premium.CGX.transcript.extension.bridge
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260406-000000
// @description        Transcript extension bridge: page <-> extension transport, session, availability, and op wrappers.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  "use strict";

  const W = window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const TAG = "[H2O.ArchiveBridge]";
  const REQ = "h2o-ext-archive:v1:req";
  const RES = "h2o-ext-archive:v1:res";
  const SW = "h2o-ext-archive:v1";
  const BRIDGE_TIMEOUT_MS = 12000;

  const state = {
    extensionChecked: false,
    extensionBacked: false,
    bridgeClientId: "",
    bridgeSessionToken: "",
    bridgeSessionReady: false,
  };

  function warn(...args) {
    try { console.warn(TAG, ...args); } catch {}
  }

  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function dataNs() {
    return String(H2O.data?.ready?.ns?.NS_DISK || "h2o:prm:cgx:h2odata");
  }

  function makeBridgeClientId() {
    return `arch_client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function bridgeNeedsSession(opRaw) {
    const op = String(opRaw || "").trim();
    return !!op && op !== "ping" && op !== "initSession";
  }

  async function ensureSession(force = false) {
    if (!state.extensionBacked) return false;
    if (!state.bridgeClientId) state.bridgeClientId = makeBridgeClientId();
    if (state.bridgeSessionReady && state.bridgeSessionToken && !force) return true;
    try {
      const id = `h2o_archive_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const req = {
        op: "initSession",
        payload: { clientId: state.bridgeClientId },
      };
      const maxWait = 2000;
      const out = await new Promise((resolve, reject) => {
        let done = false;
        const timer = W.setTimeout(() => {
          if (done) return;
          done = true;
          W.removeEventListener("message", onMsg, false);
          reject(new Error("bridge session timeout"));
        }, maxWait);
        const onMsg = (ev) => {
          if (ev.source !== W) return;
          const data = ev.data;
          if (!isObj(data) || data.type !== RES || String(data.id || "") !== id) return;
          if (done) return;
          done = true;
          W.clearTimeout(timer);
          W.removeEventListener("message", onMsg, false);
          if (data.ok === false) {
            reject(new Error(String(data.error || "bridge session failed")));
            return;
          }
          resolve(data.result || null);
        };
        W.addEventListener("message", onMsg, false);
        try {
          W.postMessage({ type: REQ, id, req, timeoutMs: maxWait }, "*");
        } catch (e) {
          if (done) return;
          done = true;
          W.clearTimeout(timer);
          W.removeEventListener("message", onMsg, false);
          reject(e);
        }
      });
      const token = String(out?.sessionToken || "").trim();
      if (!token) throw new Error("missing session token");
      state.bridgeSessionToken = token;
      state.bridgeSessionReady = true;
      return true;
    } catch (e) {
      state.bridgeSessionToken = "";
      state.bridgeSessionReady = false;
      warn("bridge session init failed", e);
      return false;
    }
  }

  async function call(op, payload = {}, opts = {}) {
    const req = { op: String(op || "").trim(), payload: isObj(payload) ? payload : {} };
    if (!req.op) throw new Error("missing bridge op");
    const nextPayload = isObj(req.payload) ? { ...req.payload } : {};
    if (!Object.prototype.hasOwnProperty.call(nextPayload, "nsDisk")) nextPayload.nsDisk = dataNs();
    if (bridgeNeedsSession(req.op)) {
      if (!state.bridgeSessionReady || !state.bridgeSessionToken) {
        await ensureSession();
      }
      if (state.bridgeSessionReady && state.bridgeSessionToken) {
        nextPayload.clientId = state.bridgeClientId;
        nextPayload.sessionToken = state.bridgeSessionToken;
      }
    }
    req.payload = nextPayload;

    const id = `h2o_archive_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const timeoutMs = Number.isFinite(Number(opts?.timeoutMs))
      ? Math.max(500, Math.min(120000, Math.floor(Number(opts.timeoutMs))))
      : BRIDGE_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let done = false;
      const timer = W.setTimeout(() => {
        if (done) return;
        done = true;
        W.removeEventListener("message", onMsg, false);
        reject(new Error(`bridge timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      const onMsg = (ev) => {
        if (ev.source !== W) return;
        const data = ev.data;
        if (!isObj(data) || data.type !== RES || String(data.id || "") !== id) return;
        if (done) return;
        done = true;
        W.clearTimeout(timer);
        W.removeEventListener("message", onMsg, false);
        if (data.ok === false) {
          const msg = String(data.error || "bridge request failed");
          if (bridgeNeedsSession(req.op) && /session|unauthorized|token/i.test(msg)) {
            state.bridgeSessionReady = false;
            state.bridgeSessionToken = "";
          }
          reject(new Error(msg));
          return;
        }
        resolve(data.result);
      };

      W.addEventListener("message", onMsg, false);
      try {
        W.postMessage({ type: REQ, id, req, timeoutMs }, "*");
      } catch (e) {
        if (done) return;
        done = true;
        W.clearTimeout(timer);
        W.removeEventListener("message", onMsg, false);
        reject(e);
      }
    });
  }

  async function isAvailable(forceCheck = false) {
    if (state.extensionChecked && !forceCheck) return state.extensionBacked;
    state.extensionChecked = true;
    try {
      const pong = await call("ping", {}, { timeoutMs: 1800 });
      state.extensionBacked = !!(pong && (pong.ok !== false) && String(pong.source || SW) === "sw");
      if (state.extensionBacked) await ensureSession(forceCheck);
      else {
        state.bridgeSessionReady = false;
        state.bridgeSessionToken = "";
      }
    } catch {
      state.extensionBacked = false;
      state.bridgeSessionReady = false;
      state.bridgeSessionToken = "";
    }
    return state.extensionBacked;
  }

  function getState() {
    return {
      extensionChecked: state.extensionChecked,
      extensionBacked: state.extensionBacked,
      bridgeClientId: state.bridgeClientId,
      bridgeSessionToken: state.bridgeSessionToken,
      bridgeSessionReady: state.bridgeSessionReady,
    };
  }

  function reset() {
    state.extensionChecked = false;
    state.extensionBacked = false;
    state.bridgeClientId = "";
    state.bridgeSessionToken = "";
    state.bridgeSessionReady = false;
  }

  const api = {
    MSG: { REQ, RES, SW },
    isAvailable,
    getState,
    reset,
    ensureSession,
    call,
    getBootMode: (chatId) => call("getBootMode", { chatId }),
    setBootMode: (chatId, mode) => call("setBootMode", { chatId, mode }),
    openWorkbench: (routeOrPayload) => {
      const route = isObj(routeOrPayload) ? routeOrPayload.route : routeOrPayload;
      return call("openWorkbench", { route: String(route || "/saved") });
    },
    captureSnapshot: (payload = {}) => call("captureSnapshot", payload),
    loadLatestSnapshot: (chatId) => call("loadLatestSnapshot", { chatId }),
    listSnapshots: (chatId) => call("listSnapshots", { chatId }),
    loadSnapshot: (snapshotIdOrPayload) => {
      const payload = isObj(snapshotIdOrPayload) ? snapshotIdOrPayload : { snapshotId: snapshotIdOrPayload };
      return call("loadSnapshot", payload);
    },
    pinSnapshot: (snapshotId, pinned, chatId = "") => call("pinSnapshot", { chatId, snapshotId, pinned: !!pinned }),
    deleteSnapshot: (snapshotIdOrPayload) => {
      const payload = isObj(snapshotIdOrPayload) ? snapshotIdOrPayload : { snapshotId: snapshotIdOrPayload };
      return call("deleteSnapshot", payload);
    },
    listAllChatIds: () => call("listAllChatIds", {}),
    listWorkbenchRows: () => call("listWorkbenchRows", {}),
    exportBundle: (opts = {}) => call("exportBundle", opts),
    importBundle: (opts = {}) => call("importBundle", opts),
    getMigratedFlag: (chatId) => call("getMigratedFlag", { chatId }),
    setMigratedFlag: (chatId, migrated) => call("setMigratedFlag", { chatId, migrated: !!migrated }),
  };

  function register() {
    const archiveBoot = H2O.archiveBoot;
    if (!archiveBoot || typeof archiveBoot._registerExtensionBridge !== "function") return false;
    archiveBoot._registerExtensionBridge(api);
    return true;
  }

  function boot() {
    if (register()) return;
    const check = () => {
      if (register()) return;
      W.setTimeout(check, 200);
    };
    W.setTimeout(check, 100);
  }

  boot();
})();
