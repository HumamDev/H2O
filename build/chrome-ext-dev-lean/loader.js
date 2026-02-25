(() => {
  "use strict";

  const TAG = "[H2O DEV LEAN]";
  const STATUS_LABEL = "H2O Dev Loader (Lean)";
  const ENABLE_TOGGLES = false;
  const PROXY_PACK_URL = "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt";
  const STORAGE_KEY = "h2oExtDevToggleMapV1";
  const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
  const MSG_HTTP = "h2o-ext-live:http";
  const MSG_HTTP_REQ = "h2o-ext-live:http:req";
  const MSG_HTTP_RES = "h2o-ext-live:http:res";

  const HDR_RE = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/g;

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
        el.style.top = "10px";
        el.style.right = "10px";
        el.style.zIndex = "2147483647";
        el.style.padding = "6px 10px";
        el.style.borderRadius = "10px";
        el.style.font = "12px/1.35 system-ui, -apple-system, Segoe UI, sans-serif";
        el.style.boxShadow = "0 4px 18px rgba(0,0,0,.35)";
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

  function withBust(url) {
    const sep = url.includes("?") ? "&" : "?";
    const bust = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
    return url + sep + "extcb=" + encodeURIComponent(bust);
  }

  function sendFetchText(url) {
    return new Promise((resolve, reject) => {
      const reqUrl = withBust(url);
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

  function readTag(metaText, tag) {
    const rx = new RegExp("^\\s*//\\s*@" + tag + "\\s+(.+?)\\s*$", "mi");
    const m = String(metaText || "").match(rx);
    return m ? String(m[1]).trim() : "";
  }

  function normalizeRunAt(runAtRaw) {
    const v = String(runAtRaw || "").trim().toLowerCase().replace(/_/g, "-");
    if (v === "document-start") return "document-start";
    if (v === "document-end") return "document-end";
    return "document-idle";
  }

  function aliasIdFromRequireUrl(urlStr) {
    const raw = String(urlStr || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw, location.href);
      const parts = String(u.pathname || "").split("/").filter(Boolean);
      const idx = parts.lastIndexOf("alias");
      const tail = idx >= 0 ? parts.slice(idx + 1).join("/") : (parts[parts.length - 1] || "");
      return decodeURIComponent(tail || "");
    } catch {}
    const m = raw.match(new RegExp("/alias/([^?#]+)", "i"));
    if (m) {
      try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
    return raw;
  }

  function parseProxyPack(packText) {
    const headers = String(packText || "").match(HDR_RE) || [];
    const out = [];

    for (const h of headers) {
      const name = readTag(h, "name") || "(unnamed)";
      const runAt = normalizeRunAt(readTag(h, "run-at") || "document-idle");
      const requireUrl = readTag(h, "require");
      if (!requireUrl) continue;
      const aliasId = aliasIdFromRequireUrl(requireUrl) || name;
      out.push({ name, runAt, requireUrl, aliasId });
    }

    return out;
  }

  function loadToggleMap() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([STORAGE_KEY], (res) => {
          const le = chrome.runtime.lastError;
          if (le) {
            warn("storage get failed", le.message || String(le));
            resolve({});
            return;
          }
          const map = res && typeof res[STORAGE_KEY] === "object" && res[STORAGE_KEY]
            ? res[STORAGE_KEY]
            : {};
          resolve(map);
        });
      } catch (e) {
        warn("storage unavailable", e);
        resolve({});
      }
    });
  }

  function isScriptEnabled(item, toggleMap) {
    const key = String(item?.aliasId || item?.name || "");
    if (!key) return true;
    return toggleMap[key] !== false;
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

  function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
      const host = scriptHost();
      if (!host) return reject(new Error("document host unavailable"));

      const s = document.createElement("script");
      s.type = "text/javascript";
      s.async = false;
      s.src = withBust(url);

      s.onload = () => {
        try { if (s.parentNode) s.parentNode.removeChild(s); } catch {}
        resolve(s.src || url);
      };
      s.onerror = () => {
        try { if (s.parentNode) s.parentNode.removeChild(s); } catch {}
        reject(new Error("script load blocked/failed: " + String(s.src || url)));
      };

      host.appendChild(s);
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
        window.requestIdleCallback(resolve, { timeout: 1200 });
      } else {
        setTimeout(resolve, 120);
      }
    });
  }

  async function loadPhase(items, phase) {
    let loaded = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const loadedUrl = await loadExternalScript(it.requireUrl);
        log(phase, "[" + (i + 1) + "/" + items.length + "]", it.name, it.aliasId, "loaded", loadedUrl);
        loaded++;
      } catch (e) {
        err(phase, "[" + (i + 1) + "/" + items.length + "]", it.name, it.aliasId, e);
      }
    }
    return loaded;
  }

  async function boot() {
    setStatus(STATUS_LABEL + ": loading...");
    log("boot start", location.href);
    installPageHttpBridge();

    const packRes = await sendFetchText(PROXY_PACK_URL);
    const all = parseProxyPack(packRes.text);
    if (!all.length) {
      warn("no scripts parsed from proxy pack", PROXY_PACK_URL);
      setStatus(STATUS_LABEL + ": no scripts parsed", true);
      return;
    }

    const enabled = [];
    const disabled = [];
    if (ENABLE_TOGGLES) {
      const toggleMap = await loadToggleMap();
      for (const it of all) {
        (isScriptEnabled(it, toggleMap) ? enabled : disabled).push(it);
      }
    } else {
      enabled.push(...all);
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
      enabled: enabled.length,
      disabled: disabled.length,
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

    let loadedTotal = 0;
    loadedTotal += await loadPhase(phaseStart, "document-start");
    await waitDomContentLoaded();
    loadedTotal += await loadPhase(phaseEnd, "document-end");
    await waitDomIdle();
    loadedTotal += await loadPhase(phaseIdle, "document-idle");

    log("boot done");
    setStatus(STATUS_LABEL + ": loaded " + loadedTotal + "/" + enabled.length + " (disabled " + disabled.length + ")");
    clearStatusLater();
  }

  boot().catch((e) => {
    err("boot fatal", e);
    setStatus(STATUS_LABEL + ": boot fatal (check console)", true);
  });
})();
