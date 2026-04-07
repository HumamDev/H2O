// @version 1.0.0
export function makeChromeLiveLoaderJs({
  DEV_TAG,
  DEV_TITLE,
  DEV_HAS_CONTROLS,
  PROXY_PACK_URL,
  DEV_SCRIPT_CATALOG,
  DEV_ORDER_SECTIONS_SNAPSHOT,
  STORAGE_KEY,
  STORAGE_ORDER_OVERRIDES_KEY,
  PAGE_FOLDER_BRIDGE_FILE,
}) {
  return `(() => {
  "use strict";

  const TAG = ${JSON.stringify(DEV_TAG)};
  const STATUS_LABEL = ${JSON.stringify(DEV_TITLE)};
  const LOADER_INSTANCE_KEY = "__H2O_EXT_DEV_CTRL_LOADER_V1__";
  if (globalThis[LOADER_INSTANCE_KEY]?.active) {
    try { console.info(TAG, "duplicate loader ignored", location.href); } catch {}
    return;
  }
  try {
    globalThis[LOADER_INSTANCE_KEY] = {
      active: true,
      href: String(location.href || ""),
      startedAt: Date.now(),
    };
  } catch {}
  const ENABLE_TOGGLES = ${JSON.stringify(DEV_HAS_CONTROLS)};
  const PROXY_PACK_URL = ${JSON.stringify(PROXY_PACK_URL)};
  const DEV_SCRIPT_CATALOG = ${JSON.stringify(DEV_SCRIPT_CATALOG)};
  const DEV_ORDER_SECTIONS = ${JSON.stringify(DEV_ORDER_SECTIONS_SNAPSHOT)};
  const STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
  const STORAGE_SETS_KEY = "h2oExtDevToggleSetsV1";
  const STORAGE_ORDER_OVERRIDES_KEY = ${JSON.stringify(STORAGE_ORDER_OVERRIDES_KEY)};
  const STORAGE_RUNTIME_KEY = "h2oExtDevRuntimeStatsV1";
  const RUNTIME_KEEP_LIMIT = 300;
  const RUNTIME_EWMA_ALPHA = 0.35;
  const SCRIPT_LOAD_TIMEOUT_MS = 12000;
  const SCRIPT_LOAD_TIMEOUT_START_MS = 4000;
  const SCRIPT_LOAD_TIMEOUT_END_MS = 8000;
  const SCRIPT_LOAD_TIMEOUT_IDLE_MS = 20000;

  const SCRIPT_SLOWLOAD_WARN_START_MS = 1200;
  const SCRIPT_SLOWLOAD_WARN_END_MS = 2500;
  const SCRIPT_SLOWLOAD_WARN_IDLE_MS = 6000;
  const IDLE_SERIAL_SECTION_TITLES = [
    "🧠 CORE",
    "🪟 CHAT FLOW",
    "⚡ PERFORMANCE",
    "🗄️ DATA",
    "🎛️ SYSTEM SURFACES",
    "🕹️ CONTROL HUB",
    "🗺️ MINIMAP BASE",
  ];
  const IDLE_SERIAL_ALIAS_SET = new Set(collectSectionAliasIds(IDLE_SERIAL_SECTION_TITLES));
  const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
  const MSG_HTTP = "h2o-ext-live:http";
  const MSG_PAGE_DISABLE_ONCE = "h2o-ext-live:page-disable-once";
  const MSG_PAGE_SET_LINK = "h2o-ext-live:page-set-link";
  const MSG_HTTP_REQ = "h2o-ext-live:http:req";
  const MSG_HTTP_RES = "h2o-ext-live:http:res";
  const MSG_HIGHLIGHT_REQ = "h2o-ext-live:highlight:req";
  const MSG_ARCHIVE_REQ = "h2o-ext-archive:v1:req";
  const MSG_ARCHIVE_RES = "h2o-ext-archive:v1:res";
  const MSG_ARCHIVE_SW = "h2o-ext-archive:v1";
  const MSG_FOLDERS_SW = "h2o-ext-folders:v1";
  const MSG_FOLDERS_REQ = "h2o-ext-folders:v1:req";
  const MSG_FOLDERS_RES = "h2o-ext-folders:v1:res";
  const PAGE_FOLDER_BRIDGE_FILE = ${JSON.stringify(PAGE_FOLDER_BRIDGE_FILE)};
  const DEFAULT_NS_DISK = "h2o:prm:cgx:h2odata";
  const ARCHIVE_TIMEOUT_MS = 12000;

  const HDR_RE = /\\/\\/\\s*==UserScript==[\\s\\S]*?\\/\\/\\s*==\\/UserScript==/g;

  function log(...args) {
    try { console.log(TAG, ...args); } catch {}
  }

  function warn(...args) {
    try { console.warn(TAG, ...args); } catch {}
  }

  function err(...args) {
    try { console.error(TAG, ...args); } catch {}
  }

  function setStatus(msg, isError = false) {
    try {
      const id = "h2o-ext-live-status";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.position = "fixed";
        el.style.bottom = "3px";
        el.style.right = "10px";
        el.style.zIndex = "2147483647";
        el.style.padding = "3px 6px";
        el.style.borderRadius = "7px";
        el.style.font = "10px/1.2 system-ui, -apple-system, Segoe UI, sans-serif";
        el.style.boxShadow = "0 2px 8px rgba(0,0,0,.28)";
        el.style.border = "1px solid rgba(255,255,255,.18)";
        el.style.pointerEvents = "none";
        document.documentElement.appendChild(el);
      }
      el.textContent = String(msg || "");
      el.style.background = isError ? "rgba(127,29,29,.92)" : "rgba(15,23,42,.92)";
      el.style.color = isError ? "#fecaca" : "#e2e8f0";
    } catch {}
  }

  function clearStatusLater(ms = 2200) {
    setTimeout(() => {
      try {
        const el = document.getElementById("h2o-ext-live-status");
        if (el && el.parentNode) el.parentNode.removeChild(el);
      } catch {}
    }, ms);
  }

  function hasVersionToken(url) {
    const raw = String(url || "");
    return /(?:[?&])(v|ver|version)=/.test(raw);
  }

  function stripDevCacheNoise(url) {
    const raw = String(url || "");
    if (!raw) return raw;
    try {
      const u = new URL(raw, location.href);
      u.searchParams.delete("extcb");
      u.searchParams.delete("cb");
      u.searchParams.delete("cacheBust");
      return u.toString();
    } catch {}
    return raw
      .replace(/([?&])extcb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cacheBust=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/[?&]$/, "")
      .replace("?&", "?");
  }

  function withBuildAwareUrl(url, opts = null) {
    const raw = String(url || "");
    if (!raw) return raw;
    const mode = String(opts && opts.mode || "auto").trim().toLowerCase();
    if (mode === "none") return raw;
    if (mode === "force") {
      const sep = raw.includes("?") ? "&" : "?";
      return raw + sep + "extcb=" + encodeURIComponent(String(Date.now()) + "-" + Math.random().toString(36).slice(2));
    }
    if (hasVersionToken(raw)) return raw;
    return raw;
  }

  function sendFetchText(url) {
    return new Promise((resolve, reject) => {
      const reqUrl = withBuildAwareUrl(url, { mode: "none" });
      chrome.runtime.sendMessage({ type: MSG_FETCH_TEXT, url: reqUrl }, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) {
          reject(new Error(String(le.message || le)));
          return;
        }
        if (!resp || !resp.ok) {
          reject(new Error(resp?.error || ("HTTP " + Number(resp?.status || 0))));
          return;
        }
        resolve({ text: String(resp.text || ""), url: reqUrl });
      });
    });
  }

  function sleepMs(ms = 0) {
    return new Promise((resolve) => {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function directFetchText(url, timeoutMs = 10000) {
    const reqUrl = withBuildAwareUrl(url, { mode: "none" });
    return new Promise((resolve, reject) => {
      const ac = (typeof AbortController !== "undefined") ? new AbortController() : null;
      const timer = ac ? setTimeout(() => { try { ac.abort(); } catch {} }, Math.max(1000, Number(timeoutMs) || 10000)) : 0;
      fetch(reqUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        signal: ac ? ac.signal : undefined,
      }).then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error("HTTP " + Number(res.status || 0));
        resolve({
          text: String(text || ""),
          url: String(res.url || reqUrl),
        });
      }).catch((error) => {
        reject(error instanceof Error ? error : new Error(String(error || "fetch failed")));
      }).finally(() => {
        if (timer) {
          try { clearTimeout(timer); } catch {}
        }
      });
    });
  }

  function isTransientFetchTextError(error) {
    const msg = String(error && (error.stack || error.message || error) || "").toLowerCase();
    if (!msg) return false;
    return (
      msg.includes("could not establish connection")
      || msg.includes("receiving end does not exist")
      || msg.includes("message port closed")
      || msg.includes("user aborted a request")
      || msg.includes("the user aborted a request")
    );
  }

  async function loadProxyPackText(url) {
    let runtimeError = null;
    try {
      return await sendFetchText(url);
    } catch (error) {
      runtimeError = error;
    }

    if (isTransientFetchTextError(runtimeError)) {
      await sleepMs(180);
      try {
        return await sendFetchText(url);
      } catch (retryError) {
        runtimeError = retryError;
      }
    }

    try {
      const direct = await directFetchText(url, 10000);
      warn("proxy pack runtime fetch failed; used direct fetch fallback", {
        url: String(url || ""),
        error: String(runtimeError && (runtimeError.stack || runtimeError.message || runtimeError) || ""),
      });
      return direct;
    } catch (directError) {
      warn("proxy pack fetch failed; using catalog fallback only", {
        url: String(url || ""),
        runtimeError: String(runtimeError && (runtimeError.stack || runtimeError.message || runtimeError) || ""),
        directError: String(directError && (directError.stack || directError.message || directError) || ""),
      });
      return { text: "", url: String(url || ""), fallback: "catalog-only" };
    }
  }

  function sendHttp(req) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: MSG_HTTP, req }, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) {
          reject(new Error(String(le.message || le)));
          return;
        }
        if (!resp || resp.ok === false) {
          reject(new Error(resp?.error || ("HTTP " + Number(resp?.status || 0))));
          return;
        }
        resolve(resp);
      });
    });
  }

  function consumePageDisableOnce() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: MSG_PAGE_DISABLE_ONCE, op: "consume" }, (resp) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("page-disable consume failed", le.message || String(le));
            resolve(false);
            return;
          }
          if (!resp || resp.ok === false) {
            if (resp && resp.error) warn("page-disable consume failed", resp.error);
            resolve(false);
            return;
          }
          resolve(resp.armed === true);
        });
      } catch (e) {
        warn("page-disable consume failed", e);
        resolve(false);
      }
    });
  }

  function getResolvedSetState(consumePreview = true) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({
          type: MSG_PAGE_SET_LINK,
          op: consumePreview ? "resolve-consume" : "resolve",
        }, (resp) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("page-set resolve failed", le.message || String(le));
            resolve({ slot: 0, source: "global-toggles" });
            return;
          }
          if (!resp || resp.ok === false) {
            if (resp && resp.error) warn("page-set resolve failed", resp.error);
            resolve({ slot: 0, source: "global-toggles" });
            return;
          }
          const slot = Number(resp.slot);
          resolve({
            slot: Number.isFinite(slot) && slot > 0 ? Math.floor(slot) : 0,
            source: String(resp.source || resp.resolvedSource || "global-toggles"),
          });
        });
      } catch (e) {
        warn("page-set resolve failed", e);
        resolve({ slot: 0, source: "global-toggles" });
      }
    });
  }

  function isPlainObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function clampTimeoutMs(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return ARCHIVE_TIMEOUT_MS;
    return Math.max(500, Math.min(120000, Math.floor(n)));
  }

  function sendArchiveReq(req, timeoutMs = ARCHIVE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("archive bridge timeout"));
      }, clampTimeoutMs(timeoutMs));

      try {
        chrome.runtime.sendMessage({ type: MSG_ARCHIVE_SW, req }, (resp) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          const le = chrome.runtime.lastError;
          if (le) {
            reject(new Error(String(le.message || le)));
            return;
          }
          if (!resp || resp.ok === false) {
            reject(new Error(String(resp?.error || "archive request failed")));
            return;
          }
          resolve(resp.result);
        });
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  function normalizeNsDisk(raw) {
    const ns = String(raw || DEFAULT_NS_DISK).trim();
    return ns || DEFAULT_NS_DISK;
  }

  function sendFolderReq(req, timeoutMs = 2200) {
    return new Promise((resolve, reject) => {
      const id = "folders_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage, false);
        reject(new Error("folder bridge timeout"));
      }, clampTimeoutMs(timeoutMs));

      const onMessage = (ev) => {
        if (ev.source !== window) return;
        const data = ev.data;
        if (!data || data.type !== MSG_FOLDERS_RES || data.id !== id) return;
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, false);
        if (data.ok === false) {
          reject(new Error(String(data.error || "folder bridge failed")));
          return;
        }
        resolve(data.result);
      };

      window.addEventListener("message", onMessage, false);
      try {
        window.postMessage({
          type: MSG_FOLDERS_REQ,
          id,
          req,
        }, "*");
      } catch (error) {
        done = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage, false);
        reject(error);
      }
    });
  }

  let installPageFolderBridgePromise = null;

  function installPageFolderBridge(timeoutMs = 2200) {
    const scriptId = "h2o-ext-folder-bridge-page";
    const existing = document.getElementById(scriptId);
    if (existing && existing.dataset.h2oReady === "1") {
      return Promise.resolve(true);
    }
    if (installPageFolderBridgePromise) return installPageFolderBridgePromise;

    installPageFolderBridgePromise = new Promise((resolve, reject) => {
      const host = scriptHost();
      if (!host) {
        installPageFolderBridgePromise = null;
        reject(new Error("folder bridge host unavailable"));
        return;
      }

      const script = existing || document.createElement("script");
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        installPageFolderBridgePromise = null;
        reject(new Error("folder bridge install timeout"));
      }, clampTimeoutMs(timeoutMs));

      const cleanup = () => {
        clearTimeout(timer);
        script.removeEventListener("load", onLoad, false);
        script.removeEventListener("error", onError, false);
      };
      const onLoad = () => {
        if (done) return;
        done = true;
        cleanup();
        script.dataset.h2oReady = "1";
        resolve(true);
      };
      const onError = () => {
        if (done) return;
        done = true;
        cleanup();
        installPageFolderBridgePromise = null;
        reject(new Error("folder bridge script load failed"));
      };

      script.addEventListener("load", onLoad, false);
      script.addEventListener("error", onError, false);

      if (!existing) {
        script.id = scriptId;
        script.async = false;
        script.dataset.h2oReady = "0";
        script.src = chrome.runtime.getURL(PAGE_FOLDER_BRIDGE_FILE);
        host.appendChild(script);
      }
    });

    return installPageFolderBridgePromise;
  }

  function installRuntimeFolderBridge() {
    if (window.__H2O_EXT_FOLDER_RUNTIME_BRIDGE_V1__) return;
    window.__H2O_EXT_FOLDER_RUNTIME_BRIDGE_V1__ = true;

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== MSG_FOLDERS_SW) return undefined;
      installPageFolderBridge().then(() => sendFolderReq({
        op: String(msg.req && msg.req.op || ""),
        payload: isPlainObj(msg.req && msg.req.payload) ? msg.req.payload : {},
        nsDisk: normalizeNsDisk(msg.req && msg.req.nsDisk),
      })).then((result) => {
        sendResponse({ ok: true, result });
      }).catch((error) => {
        sendResponse({ ok: false, error: String(error && (error.stack || error.message || error)) });
      });
      return true;
    });
  }

  function installRuntimeHighlightBridge() {
    if (window.__H2O_EXT_HIGHLIGHT_RUNTIME_BRIDGE_V1__) return;
    window.__H2O_EXT_HIGHLIGHT_RUNTIME_BRIDGE_V1__ = true;

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== "h2o-highlight-trigger") return undefined;
      try {
        window.postMessage({
          type: MSG_HIGHLIGHT_REQ,
          req: {
            action: String(msg.action || "popup"),
            color: String(msg.color || ""),
          },
        }, "*");
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error && (error.stack || error.message || error)) });
      }
      return true;
    });
  }

  function installPageHttpBridge() {
    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const data = ev.data;
      if (!data || data.type !== MSG_HTTP_REQ || !data.id || !data.req) return;

      const id = String(data.id);
      const req = data.req;

      sendHttp(req).then((resp) => {
        try {
          window.postMessage({ type: MSG_HTTP_RES, id, ...resp }, "*");
        } catch {}
      }).catch((e) => {
        try {
          window.postMessage({
            type: MSG_HTTP_RES,
            id,
            ok: false,
            status: 0,
            error: String(e && (e.stack || e.message || e)),
          }, "*");
        } catch {}
      });
    }, false);
    log("page HTTP bridge ready");
  }

  function installPageArchiveBridge() {
    // Best-effort anti-spam gate for same-page callers. This is not a cryptographic trust boundary.
    const archiveSession = { clientId: "", token: "" };
    const AUTH_FREE_OPS = new Set(["ping", "initSession"]);
    const ALLOW_OPS = new Set([
      "ping",
      "initSession",
      "getBootMode",
      "setBootMode",
      "getMigratedFlag",
      "setMigratedFlag",
      "getChatIndex",
      "setChatIndex",
      "captureSnapshot",
      "loadLatestSnapshot",
      "loadSnapshot",
      "listSnapshots",
      "listAllChatIds",
      "listChatIds",
      "listWorkbenchRows",
      "getFoldersList",
      "resolveFolderBindings",
      "setFolderBinding",
      "pinSnapshot",
      "deleteSnapshot",
      "applyRetention",
      "openWorkbench",
      "exportBundle",
      "importBundle",
    ]);
    const makeToken = () => {
      const now = Date.now().toString(36);
      const rnd = Math.random().toString(36).slice(2, 14);
      return "archtok_" + now + "_" + rnd;
    };
    const reply = (id, out) => {
      try { window.postMessage({ type: MSG_ARCHIVE_RES, id, ...out }, "*"); } catch {}
    };

    window.addEventListener("message", (ev) => {
      if (ev.source !== window) return;
      const data = ev.data;
      if (!isPlainObj(data) || data.type !== MSG_ARCHIVE_REQ) return;

      const id = String(data.id || "").trim();
      const req = data.req;
      const bad = !id || !isPlainObj(req) || typeof req.op !== "string" || !req.op.trim() || (req.payload != null && !isPlainObj(req.payload));
      if (bad) {
        reply(id || ("bad-" + Date.now()), { ok: false, error: "invalid archive bridge payload" });
        return;
      }

      const op = String(req.op || "").trim();
      const payload = isPlainObj(req.payload) ? req.payload : {};
      if (!ALLOW_OPS.has(op)) {
        reply(id, { ok: false, error: "unsupported archive op: " + op });
        return;
      }

      if (op === "initSession") {
        const clientId = String(payload.clientId || "").trim();
        if (!clientId) {
          reply(id, { ok: false, error: "missing clientId for initSession" });
          return;
        }
        archiveSession.clientId = clientId.slice(0, 120);
        archiveSession.token = makeToken();
        reply(id, { ok: true, result: { ok: true, source: "page-bridge", clientId: archiveSession.clientId, sessionToken: archiveSession.token } });
        return;
      }

      if (!AUTH_FREE_OPS.has(op)) {
        const clientId = String(payload.clientId || "").trim();
        const sessionToken = String(payload.sessionToken || "").trim();
        if (!archiveSession.clientId || !archiveSession.token) {
          reply(id, { ok: false, error: "archive session not initialized" });
          return;
        }
        if (!clientId || !sessionToken || clientId !== archiveSession.clientId || sessionToken !== archiveSession.token) {
          reply(id, { ok: false, error: "archive session unauthorized" });
          return;
        }
      }

      sendArchiveReq({
        op,
        payload,
        nsDisk: req.nsDisk,
      }, data.timeoutMs).then((result) => {
        reply(id, { ok: true, result });
      }).catch((e) => {
        reply(id, {
          ok: false,
          error: String(e && (e.stack || e.message || e)),
        });
      });
    }, false);
    log("page archive bridge ready (session hardening active)");
  }

  function readTag(metaText, tag) {
    const rx = new RegExp("^\\\\s*//\\\\s*@" + tag + "\\\\s+(.+?)\\\\s*$", "mi");
    const m = String(metaText || "").match(rx);
    return m ? String(m[1]).trim() : "";
  }

  function normalizeRunAt(runAtRaw) {
    const v = String(runAtRaw || "").trim().toLowerCase().replace(/_/g, "-");
    if (v === "document-start") return "document-start";
    if (v === "document-end") return "document-end";
    return "document-idle";
  }

  function stripEmojiAndInvisibles(textRaw) {
    return String(textRaw || "")
      .replace(/[\\u{1F3FB}-\\u{1F3FF}]/gu, "")
      .replace(/[\\p{Extended_Pictographic}]/gu, "")
      .replace(/[\\uFE0E\\uFE0F\\u200D\\u200B-\\u200F\\uFEFF\\u2060\\u00AD]/g, "")
      .replace(/[\\u202A-\\u202E\\u2066-\\u2069]/g, "");
  }

  function toAliasName(filenameRaw) {
    const base = String(filenameRaw || "").replace(/(\\.user)?\\.js$/i, "");
    const firstDot = base.indexOf(".");
    if (firstDot <= 0) return "";
    const id = base.slice(0, firstDot).trim();
    let title = base.slice(firstDot + 1);
    title = stripEmojiAndInvisibles(title)
      .trim()
      .replace(/\\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!id || !title) return "";
    return id + "._" + title + "_.js";
  }

  function normalizeAliasId(aliasRaw) {
    const alias = toAliasName(aliasRaw);
    if (alias) return alias;
    const raw = String(aliasRaw || "").trim();
    return raw ? raw.replace(/\\.user\\.js$/i, ".js") : "";
  }

  function collectSectionAliasIds(sectionTitlesRaw) {
    const wanted = new Set(
      (Array.isArray(sectionTitlesRaw) ? sectionTitlesRaw : [sectionTitlesRaw])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    );
    if (!wanted.size) return [];

    const out = [];
    const seen = new Set();
    const sections = Array.isArray(DEV_ORDER_SECTIONS) ? DEV_ORDER_SECTIONS : [];
    for (const sec of sections) {
      const title = String(sec && sec.title || "").trim();
      if (!wanted.has(title)) continue;
      const items = Array.isArray(sec && sec.items) ? sec.items : [];
      for (const row of items) {
        const aliasId = normalizeAliasId(row && row.file || "");
        if (!aliasId || seen.has(aliasId)) continue;
        seen.add(aliasId);
        out.push(aliasId);
      }
    }
    return out;
  }

  function aliasIdFromRequireUrl(urlStr) {
    const raw = String(urlStr || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw, location.href);
      const parts = String(u.pathname || "").split("/").filter(Boolean);
      const idx = parts.lastIndexOf("alias");
      const tail = idx >= 0 ? parts.slice(idx + 1).join("/") : (parts[parts.length - 1] || "");
      return normalizeAliasId(decodeURIComponent(tail || ""));
    } catch {}
    const m = raw.match(new RegExp("/alias/([^?#]+)", "i"));
    if (m) {
      try { return normalizeAliasId(decodeURIComponent(m[1])); } catch { return normalizeAliasId(m[1]); }
    }
    return normalizeAliasId(raw);
  }

  function stripDevCacheNoise(url) {
    const raw = String(url || "");
    if (!raw) return raw;
    try {
      const u = new URL(raw, location.href);
      u.searchParams.delete("extcb");
      u.searchParams.delete("cb");
      u.searchParams.delete("cacheBust");
      return u.toString();
    } catch {}
    return raw
      .replace(/([?&])extcb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cacheBust=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/[?&]$/, "")
      .replace("?&", "?");
  }

  function parseProxyPack(packText) {
    const headers = String(packText || "").match(HDR_RE) || [];
    const out = [];

    for (const h of headers) {
      const name = readTag(h, "name") || "(unnamed)";
      const runAt = normalizeRunAt(readTag(h, "run-at") || "document-idle");
      const rawRequireUrl = readTag(h, "require");
      if (!rawRequireUrl) continue;
      const aliasId = aliasIdFromRequireUrl(rawRequireUrl) || name;
      const requireUrl = stripDevCacheNoise(rawRequireUrl);
      out.push({ name, runAt, requireUrl, aliasId });
    }

    return out;
  }

  function aliasRequireUrl(aliasIdRaw) {
    const aliasId = normalizeAliasId(aliasIdRaw);
    if (!aliasId) return "";
    const enc = encodeURIComponent(aliasId);
    try {
      const u = new URL(PROXY_PACK_URL);
      return u.origin + "/alias/" + enc;
    } catch {}
    return "http://127.0.0.1:5500/alias/" + enc;
  }

  function normalizeCatalog(rawCatalog) {
    const map = {};
    const order = [];
    if (!rawCatalog || typeof rawCatalog !== "object") return { map, order };
    for (const [k, v] of Object.entries(rawCatalog)) {
      const aliasId = normalizeAliasId(k);
      if (!aliasId) continue;
      const meta = v && typeof v === "object" ? v : {};
      map[aliasId] = {
        name: String(meta.name || aliasId),
        runAt: normalizeRunAt(meta.runAt || "document-idle"),
        runtimeGroup: String(meta.runtimeGroup || ""),
        runtimeOrder: Number.isFinite(Number(meta.runtimeOrder)) ? Number(meta.runtimeOrder) : null,
      };
      order.push(aliasId);
    }
    return { map, order };
  }

  function applyRuntimeOrderFix(items) {
    if (!Array.isArray(items) || !items.length) return items;
    let next = items.slice();
    const groups = new Map();

    for (const item of next) {
      const group = String(item && item.runtimeGroup || "").trim();
      const aliasId = String(item && item.aliasId || "").trim();
      const order = Number(item && item.runtimeOrder);
      if (!group || !aliasId || !Number.isFinite(order)) continue;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ aliasId, order });
    }

    for (const rows of groups.values()) {
      const wanted = rows
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((row) => row.aliasId);
      if (wanted.length < 2) continue;
      const present = wanted.filter((aliasId) => next.some((item) => String(item && item.aliasId || "") === aliasId));
      if (present.length < 2) continue;
      const presentSet = new Set(present);
      const insertAt = next.findIndex((item) => presentSet.has(String(item && item.aliasId || "")));
      if (insertAt < 0) continue;
      const byAlias = new Map(next.map((item) => [String(item && item.aliasId || ""), item]));
      const rest = next.filter((item) => !presentSet.has(String(item && item.aliasId || "")));
      const reordered = present.map((aliasId) => byAlias.get(aliasId)).filter(Boolean);
      next = [...rest.slice(0, insertAt), ...reordered, ...rest.slice(insertAt)];
    }

    return next;
  }


  function mergeScriptsWithCatalog(proxyScripts, rawCatalog) {
    const fromPack = Array.isArray(proxyScripts) ? proxyScripts : [];
    const catalog = normalizeCatalog(rawCatalog);
    const byAlias = {};
    const out = [];
    const seen = new Set();

    for (const aliasId of catalog.order) {
      const meta = catalog.map[aliasId] || {};
      byAlias[aliasId] = {
        name: String(meta.name || aliasId),
        runAt: normalizeRunAt(meta.runAt || "document-idle"),
        requireUrl: aliasRequireUrl(aliasId),
        aliasId,
      };
    }

    for (let i = 0; i < fromPack.length; i++) {
      const item = fromPack[i] || {};
      const aliasId = String(item.aliasId || "").trim();
      if (!aliasId) continue;

      const base = byAlias[aliasId] || {
        name: aliasId,
        runAt: "document-idle",
        requireUrl: aliasRequireUrl(aliasId),
        aliasId,
      };
      const merged = {
        ...base,
        ...item,
        aliasId,
        name: String(item.name || base.name || aliasId),
        runAt: normalizeRunAt(item.runAt || base.runAt || "document-idle"),
        requireUrl: String(stripDevCacheNoise(item.requireUrl || base.requireUrl || aliasRequireUrl(aliasId))),
      };

      byAlias[aliasId] = merged;
      if (seen.has(aliasId)) {
        const idx = out.findIndex((it) => String(it && it.aliasId || "") === aliasId);
        if (idx >= 0) out[idx] = merged;
      } else {
        out.push(merged);
        seen.add(aliasId);
      }
    }

    for (const aliasId of catalog.order) {
      if (seen.has(aliasId)) continue;
      const base = byAlias[aliasId];
      if (!base) continue;
      out.push(base);
      seen.add(aliasId);
    }

    return applyRuntimeOrderFix(out);
  }

  function normalizeOrderOverrideMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== "object") return out;
    for (const [k, v] of Object.entries(rawMap)) {
      const aliasId = normalizeAliasId(k);
      if (!aliasId) continue;
      out[aliasId] = v === true;
    }
    return out;
  }

  function normalizeSetMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== "object") return out;
    for (const [k, v] of Object.entries(rawMap)) {
      const aliasId = normalizeAliasId(k);
      if (!aliasId) continue;
      out[aliasId] = v !== false;
    }
    return out;
  }

  function normalizeToggleSets(rawSets) {
    const out = {};
    if (!rawSets || typeof rawSets !== "object") return out;
    for (const [slot, rawRec] of Object.entries(rawSets)) {
      const slotNum = Number(slot);
      if (!Number.isFinite(slotNum) || slotNum <= 0) continue;
      if (!rawRec || typeof rawRec !== "object") continue;
      const maybeMap = rawRec && typeof rawRec.map === "object" ? rawRec.map : rawRec;
      out[String(slotNum)] = {
        map: normalizeSetMap(maybeMap),
      };
    }
    return out;
  }

  function resolveToggleMapForPage(globalMapRaw, toggleSetsRaw, slotRaw) {
    const slot = Number(slotRaw);
    if (!Number.isFinite(slot) || slot <= 0) return globalMapRaw || {};
    const toggleSets = normalizeToggleSets(toggleSetsRaw);
    const rec = toggleSets[String(Math.floor(slot))];
    if (!rec || !rec.map || typeof rec.map !== "object") return globalMapRaw || {};
    const out = {};
    for (const [aliasId, enabled] of Object.entries(rec.map)) {
      if (enabled === false) out[aliasId] = false;
    }
    return out;
  }

  function buildAllOffToggleMap(itemsRaw) {
    const out = {};
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    for (const item of items) {
      const aliasId = String(item && item.aliasId || "").trim();
      if (!aliasId) continue;
      out[aliasId] = false;
    }
    return out;
  }

  function collectOrderEnabledMap(rawSections, overridesRaw) {
    const out = {};
    const sections = Array.isArray(rawSections) ? rawSections : [];
    for (const sec of sections) {
      const items = Array.isArray(sec && sec.items) ? sec.items : [];
      for (const row of items) {
        const aliasId = normalizeAliasId(row && row.file || "");
        if (!aliasId) continue;
        out[aliasId] = row && row.enabled === true;
      }
    }
    const overrides = normalizeOrderOverrideMap(overridesRaw);
    for (const [aliasId, enabled] of Object.entries(overrides)) {
      out[aliasId] = enabled === true;
    }
    return out;
  }

  function loadLoaderState() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY, STORAGE_SETS_KEY, STORAGE_ORDER_OVERRIDES_KEY], (res) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("storage get failed", le.message || String(le));
            resolve({ toggleMap: {}, toggleSets: {}, orderOverrideMap: {} });
            return;
          }
          const toggleMap = res && typeof res[STORAGE_KEY] === "object" && res[STORAGE_KEY]
            ? res[STORAGE_KEY]
            : {};
          const toggleSets = res && typeof res[STORAGE_SETS_KEY] === "object" && res[STORAGE_SETS_KEY]
            ? res[STORAGE_SETS_KEY]
            : {};
          const orderOverrideMap = res && typeof res[STORAGE_ORDER_OVERRIDES_KEY] === "object" && res[STORAGE_ORDER_OVERRIDES_KEY]
            ? res[STORAGE_ORDER_OVERRIDES_KEY]
            : {};
          resolve({
            toggleMap: normalizeSetMap(toggleMap),
            toggleSets: normalizeToggleSets(toggleSets),
            orderOverrideMap: normalizeOrderOverrideMap(orderOverrideMap),
          });
        });
      } catch (e) {
        warn("storage unavailable", e);
        resolve({ toggleMap: {}, toggleSets: {}, orderOverrideMap: {} });
      }
    });
  }

  function readRuntimeStats() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_RUNTIME_KEY], (res) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("runtime storage get failed", le.message || String(le));
            resolve({});
            return;
          }
          const map = res && typeof res[STORAGE_RUNTIME_KEY] === "object" && res[STORAGE_RUNTIME_KEY]
            ? res[STORAGE_RUNTIME_KEY]
            : {};
          resolve(map);
        });
      } catch {
        resolve({});
      }
    });
  }

  function writeRuntimeStats(nextMap) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [STORAGE_RUNTIME_KEY]: nextMap }, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  function heapUsedBytes() {
    try {
      const n = Number(globalThis.performance && performance.memory && performance.memory.usedJSHeapSize);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }

  function heapProbeSupported() {
    try {
      const n = Number(globalThis.performance && performance.memory && performance.memory.usedJSHeapSize);
      return Number.isFinite(n) && n >= 0;
    } catch {
      return false;
    }
  }

  function roundMs(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    if (n > 0 && n < 0.1) return 0.1;
    return Math.round(n * 10) / 10;
  }

  function normalizeRuntimeEntry(raw) {
    const o = raw && typeof raw === "object" ? raw : {};
    const loads = Number(o.loads);
    const failures = Number(o.failures);
    const ts = Number(o.ts);
    const lastSeen = Number(o.lastSeen);
    const phase = String(o.lastPhase || o.phase || "");
    const lastLoadMs = Number(o.lastLoadMs);
    const ewmaLoadMs = Number(o.ewmaLoadMs);
    const lastHeapDeltaBytes = Number(o.lastHeapDeltaBytes);
    const heapSupported = o.heapSupported !== false;
    return {
      loads: Number.isFinite(loads) ? Math.max(0, Math.floor(loads)) : 0,
      failures: Number.isFinite(failures) ? Math.max(0, Math.floor(failures)) : 0,
      lastSeen: Number.isFinite(lastSeen) && lastSeen > 0
        ? Math.max(0, Math.floor(lastSeen))
        : (Number.isFinite(ts) ? Math.max(0, Math.floor(ts)) : 0),
      ts: Number.isFinite(ts) ? Math.max(0, Math.floor(ts)) : (Number.isFinite(lastSeen) ? Math.max(0, Math.floor(lastSeen)) : 0),
      lastPhase: phase,
      phase,
      lastLoadMs: Number.isFinite(lastLoadMs) ? roundMs(lastLoadMs) : 0,
      ewmaLoadMs: Number.isFinite(ewmaLoadMs) ? roundMs(ewmaLoadMs) : 0,
      lastHeapDeltaBytes: Number.isFinite(lastHeapDeltaBytes) ? Math.round(lastHeapDeltaBytes) : 0,
      heapSupported: !!heapSupported,
    };
  }

  function trimRuntimeStatsMap(map) {
    const entries = Object.entries(map || {}).filter(([k]) => String(k || "").trim());
    if (entries.length <= RUNTIME_KEEP_LIMIT) return map || {};
    entries.sort((a, b) => {
      const at = Number(a[1] && a[1].lastSeen) || 0;
      const bt = Number(b[1] && b[1].lastSeen) || 0;
      return bt - at;
    });
    const next = {};
    for (let i = 0; i < entries.length && i < RUNTIME_KEEP_LIMIT; i++) {
      const [k, v] = entries[i];
      next[k] = v;
    }
    return next;
  }

  function mergeRuntimeSample(prev, sample) {
    const base = normalizeRuntimeEntry(prev);
    const s = sample && typeof sample === "object" ? sample : {};
    const loadMs = roundMs(Number(s.loadMs));
    const heapDeltaBytes = Number.isFinite(Number(s.heapDeltaBytes)) ? Math.round(Number(s.heapDeltaBytes)) : 0;
    const heapSupported = typeof s.heapSupported === "boolean" ? s.heapSupported : (base.heapSupported !== false);
    const ok = !!s.ok;
    const now = Number.isFinite(Number(s.ts)) ? Math.floor(Number(s.ts)) : Date.now();

    if (ok) {
      base.loads += 1;
      base.lastLoadMs = loadMs;
      base.ewmaLoadMs = base.ewmaLoadMs > 0
        ? roundMs((base.ewmaLoadMs * (1 - RUNTIME_EWMA_ALPHA)) + (loadMs * RUNTIME_EWMA_ALPHA))
        : loadMs;
    } else {
      base.failures += 1;
    }

    base.lastSeen = now;
    base.lastPhase = String(s.phase || "");
    base.phase = base.lastPhase;
    base.ts = base.lastSeen;
    base.lastHeapDeltaBytes = heapDeltaBytes;
    base.heapSupported = !!heapSupported;
    return base;
  }

  async function flushRuntimeSamples(samples) {
    if (!Array.isArray(samples) || !samples.length) return;
    const existing = await readRuntimeStats();
    const next = { ...existing };
    for (const sample of samples) {
      const aliasId = String(sample && sample.aliasId || "").trim();
      if (!aliasId) continue;
      next[aliasId] = mergeRuntimeSample(next[aliasId], sample);
    }
    await writeRuntimeStats(trimRuntimeStatsMap(next));
  }

  function decideScriptState(item, toggleMap, orderEnabledMap) {
    const key = String(item?.aliasId || item?.name || "");
    if (!key) {
      return {
        key,
        enabled: true,
        orderAllowed: true,
        toggleAllowed: true,
      };
    }
    let orderAllowed = true;
    if (orderEnabledMap && Object.prototype.hasOwnProperty.call(orderEnabledMap, key)) {
      orderAllowed = orderEnabledMap[key] === true;
    }
    const toggleAllowed = toggleMap[key] !== false;
    return {
      key,
      enabled: orderAllowed && toggleAllowed,
      orderAllowed,
      toggleAllowed,
    };
  }

  function scriptHost() {
    return document.head || document.documentElement || document.body || null;
  }

  function waitScriptHost(maxWaitMs = 1800) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        const host = scriptHost();
        if (host) return resolve(host);
        if (Date.now() - t0 >= maxWaitMs) return resolve(null);
        setTimeout(tick, 30);
      };
      tick();
    });
  }

  function timeoutForPhase(phase) {
    if (phase === "document-start") return SCRIPT_LOAD_TIMEOUT_START_MS;
    if (phase === "document-end") return SCRIPT_LOAD_TIMEOUT_END_MS;
    return SCRIPT_LOAD_TIMEOUT_IDLE_MS;
  }

  function slowWarnForPhase(phase) {
    if (phase === "document-start") return SCRIPT_SLOWLOAD_WARN_START_MS;
    if (phase === "document-end") return SCRIPT_SLOWLOAD_WARN_END_MS;
    return SCRIPT_SLOWLOAD_WARN_IDLE_MS;
  }

  function nextFrame() {
    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 16);
      }
    });
  }

  function loadExternalScript(url, phase = "document-idle", options = null) {
    return new Promise((resolve, reject) => {
      const host = scriptHost();
      if (!host) return reject(new Error("document host unavailable"));

      const s = document.createElement("script");
      s.type = "text/javascript";
      s.async = false;
      s.src = withBuildAwareUrl(url);

      const opts = options && typeof options === "object" ? options : null;
      const timeoutMs = Math.max(1000, Number(opts?.timeoutMs) || timeoutForPhase(phase));
      const slowWarnMs = Math.max(250, Number(opts?.slowWarnMs) || slowWarnForPhase(phase));

      let done = false;
      let hardTimer = 0;
      let slowTimer = 0;

      const cleanup = () => {
        if (hardTimer) {
          try { clearTimeout(hardTimer); } catch {}
        }
        if (slowTimer) {
          try { clearTimeout(slowTimer); } catch {}
        }
        try { if (s.parentNode) s.parentNode.removeChild(s); } catch {}
      };

      const finish = (ok, value) => {
        if (done) return;
        done = true;
        cleanup();
        if (ok) resolve(value);
        else reject(value instanceof Error ? value : new Error(String(value || "script load failed")));
      };

      s.onload = () => {
        finish(true, s.src || url);
      };
      s.onerror = () => {
        finish(false, new Error("script load blocked/failed: " + String(s.src || url)));
      };

      host.appendChild(s);

      nextFrame().then(() => {
        if (done) return;

        slowTimer = setTimeout(() => {
          if (done) return;
          try {
            log("slow-load", phase, String(s.src || url), { timeoutMs, slowWarnMs });
          } catch {}
        }, slowWarnMs);

        hardTimer = setTimeout(() => {
          if (done) return;
          finish(false, new Error("script load timeout: " + String(s.src || url)));
        }, timeoutMs);
      });
    });
  }

  function yieldToBrowser() {
    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => resolve());
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  function waitDomContentLoaded() {
    if (document.readyState === "interactive" || document.readyState === "complete") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }

  async function waitDomIdle() {
    await waitDomContentLoaded();
    await new Promise((resolve) => {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(resolve, { timeout: 180 });
      } else {
        setTimeout(resolve, 32);
      }
    });
  }

  function idleSerialAlias(aliasIdRaw) {
    const aliasId = String(aliasIdRaw || "").trim();
    if (!aliasId) return false;
    return IDLE_SERIAL_ALIAS_SET.has(aliasId);
  }

  async function loadOneScript(it, idx, total, phase, runtimeSamples = [], progressState = null) {
    const pos = progressState ? (Number(progressState.done) + 1) : (idx + 1);
    const label = String(it?.aliasId || it?.name || "script");
    setStatus(STATUS_LABEL + ": loading " + pos + "/" + total + " · " + label);
    const t0 = (globalThis.performance && typeof performance.now === "function") ? performance.now() : Date.now();
    const heapSupported = heapProbeSupported();
    const heap0 = heapUsedBytes();
    try {
      const loadedUrl = await loadExternalScript(it.requireUrl, phase, {
        timeoutMs: timeoutForPhase(phase),
        slowWarnMs: slowWarnForPhase(phase),
      });
      const t1 = (globalThis.performance && typeof performance.now === "function") ? performance.now() : Date.now();
      const heap1 = heapUsedBytes();
      runtimeSamples.push({
        aliasId: it.aliasId,
        phase,
        ok: true,
        loadMs: roundMs(t1 - t0),
        heapDeltaBytes: heap1 && heap0 ? (heap1 - heap0) : 0,
        heapSupported,
        ts: Date.now(),
      });
      log(phase, "[" + (idx + 1) + "/" + total + "]", it.name, it.aliasId, "loaded", loadedUrl);
      return 1;
    } catch (e) {
      const t1 = (globalThis.performance && typeof performance.now === "function") ? performance.now() : Date.now();
      const heap1 = heapUsedBytes();
      runtimeSamples.push({
        aliasId: it.aliasId,
        phase,
        ok: false,
        loadMs: roundMs(t1 - t0),
        heapDeltaBytes: heap1 && heap0 ? (heap1 - heap0) : 0,
        heapSupported,
        ts: Date.now(),
      });
      err(phase, "[" + (idx + 1) + "/" + total + "]", it.name, it.aliasId, e);
      return 0;
    } finally {
      if (progressState) progressState.done = Number(progressState.done) + 1;
    }
  }

  async function loadPhase(items, phase, runtimeSamples = [], progressState = null) {
    const list = Array.isArray(items) ? items : [];
    let loaded = 0;
    const total = progressState ? Number(progressState.total) : list.length;
    const isIdle = phase === "document-idle";
    const serialList = isIdle ? list.filter((it) => idleSerialAlias(it && it.aliasId)) : list;
    const parallelList = isIdle ? list.filter((it) => !idleSerialAlias(it && it.aliasId)) : [];

    for (let i = 0; i < serialList.length; i++) {
      loaded += await loadOneScript(serialList[i], i, total, phase, runtimeSamples, progressState);
      await yieldToBrowser();
    }

    if (parallelList.length) {
      const batchSize = 6;
      for (let start = 0; start < parallelList.length; start += batchSize) {
        const chunk = parallelList.slice(start, start + batchSize);
        const tasks = chunk.map((it, localIdx) => {
          const globalIdx = serialList.length + start + localIdx;
          return loadOneScript(it, globalIdx, total, phase, runtimeSamples, progressState);
        });
        const results = await Promise.all(tasks);
        loaded += results.reduce((sum, n) => sum + Number(n || 0), 0);
        await yieldToBrowser();
      }
    }

    return loaded;
  }

  async function boot() {
    setStatus(STATUS_LABEL + ": loading...");
    log("boot start", location.href);
    if (ENABLE_TOGGLES && await consumePageDisableOnce()) {
      log("page-only disable armed; skipping script load for this page", location.href);
      setStatus(STATUS_LABEL + ": disabled for this page load");
      clearStatusLater(2600);
      return;
    }
    installRuntimeFolderBridge();
    installRuntimeHighlightBridge();
    installPageHttpBridge();
    installPageArchiveBridge();

    const packRes = await loadProxyPackText(PROXY_PACK_URL);
    const fromPack = parseProxyPack(packRes.text);
    const all = mergeScriptsWithCatalog(fromPack, DEV_SCRIPT_CATALOG);
    if (!all.length) {
      warn("no scripts available (proxy pack + catalog)", PROXY_PACK_URL);
      setStatus(STATUS_LABEL + ": no scripts parsed", true);
      return;
    }

    const enabled = [];
    const disabled = [];
    const loaderState = await loadLoaderState();
    const resolvedSetState = ENABLE_TOGGLES ? await getResolvedSetState(true) : { slot: 0, source: "global-toggles" };
    const resolvedSetSlot = Number(resolvedSetState && resolvedSetState.slot) || 0;
    const resolvedSource = String(resolvedSetState && resolvedSetState.source || "global-toggles");
    const toggleMap = ENABLE_TOGGLES
      ? (resolvedSource === "all-off"
        ? buildAllOffToggleMap(all)
        : resolveToggleMapForPage(loaderState.toggleMap, loaderState.toggleSets, resolvedSetSlot))
      : {};
    const orderEnabledMap = collectOrderEnabledMap(DEV_ORDER_SECTIONS, loaderState.orderOverrideMap);
    const disabledBy = {
      orderOnly: 0,
      toggleOnly: 0,
      both: 0,
    };
    for (const it of all) {
      const decision = decideScriptState(it, toggleMap, orderEnabledMap);
      if (decision.enabled) {
        enabled.push(it);
      } else {
        disabled.push(it);
        if (!decision.orderAllowed && !decision.toggleAllowed) disabledBy.both += 1;
        else if (!decision.orderAllowed) disabledBy.orderOnly += 1;
        else disabledBy.toggleOnly += 1;
      }
    }

    const phaseStart = [];
    const phaseEnd = [];
    const phaseIdle = [];
    for (const it of enabled) {
      if (it.runAt === "document-start") phaseStart.push(it);
      else if (it.runAt === "document-end") phaseEnd.push(it);
      else phaseIdle.push(it);
    }

    log("scripts", {
      total: all.length,
      fromPack: fromPack.length,
      fromCatalogOnly: Math.max(0, all.length - fromPack.length),
      resolvedSetSlot,
      resolvedSource,
      enabled: enabled.length,
      disabled: disabled.length,
      disabledBy,
      start: phaseStart.length,
      end: phaseEnd.length,
      idle: phaseIdle.length,
    });
    if (disabled.length) {
      log("disabled aliases", disabled.map((d) => d.aliasId));
    }

    const host = await waitScriptHost();
    if (!host) {
      warn("script host not ready");
      setStatus(STATUS_LABEL + ": script host missing", true);
      return;
    }

    const runtimeSamples = [];
    let loadedTotal = 0;
    const progressState = { total: enabled.length, done: 0 };
    loadedTotal += await loadPhase(phaseStart, "document-start", runtimeSamples, progressState);
    await waitDomContentLoaded();
    loadedTotal += await loadPhase(phaseEnd, "document-end", runtimeSamples, progressState);
    await waitDomIdle();
    loadedTotal += await loadPhase(phaseIdle, "document-idle", runtimeSamples, progressState);
    await flushRuntimeSamples(runtimeSamples);

    log("boot done");
    setStatus(
      STATUS_LABEL +
      ": loaded " + loadedTotal + "/" + enabled.length +
      " (disabled " + disabled.length +
      " = order " + disabledBy.orderOnly +
      " + toggles " + disabledBy.toggleOnly +
      " + both " + disabledBy.both + ")"
    );
    clearStatusLater();
  }

  boot().catch((e) => {
    err("boot fatal", e);
    setStatus(STATUS_LABEL + ": boot fatal (check console)", true);
  });
})();
`;
}
