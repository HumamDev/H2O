import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeExtensionIcons } from "./write-extension-icons.mjs";
// @version 1.1.0

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const SRC_DEFAULT = path.resolve(TOOL_DIR, "..", "..");

const SRC =
  process.env.H2O_SRC_DIR ||
  SRC_DEFAULT;

const OUT_DIR =
  process.env.H2O_EXT_OUT_DIR ||
  path.join(SRC, "build", "chrome-ext-dev-controls");

const PROXY_PACK_URL =
  process.env.H2O_EXT_PROXY_PACK_URL ||
  "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt";

const CHAT_MATCH =
  process.env.H2O_EXT_MATCH ||
  "https://chatgpt.com/*";

const STORAGE_KEY = "h2oExtDevToggleMapV1";
const DEV_VARIANT = String(process.env.H2O_EXT_DEV_VARIANT || "controls").trim().toLowerCase() === "lean" ? "lean" : "controls";
const DEV_HAS_CONTROLS = DEV_VARIANT === "controls";
const DEV_VERSION = "1.2.0";
const DEV_TITLE = DEV_HAS_CONTROLS ? "H2O Dev Controls" : "H2O Dev Loader (Lean)";
const DEV_NAME = DEV_HAS_CONTROLS ? "H2O Dev Controls (Unpacked)" : "H2O Dev Loader (Lean, Unpacked)";
const DEV_DESCRIPTION = DEV_HAS_CONTROLS
  ? "Dev-only local loader with per-script toggles for H2O scripts on chatgpt.com."
  : "Dev-only local loader for H2O scripts on chatgpt.com (lean mode, no popup toggles).";
const DEV_TAG = DEV_HAS_CONTROLS ? "[H2O DEV CTRL]" : "[H2O DEV LEAN]";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function originWildcard(urlStr) {
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return "http://127.0.0.1:5500/*";
  }
}

function makeManifest() {
  const hostPerm = originWildcard(PROXY_PACK_URL);
  const extraHostPerms = String(process.env.H2O_EXT_HOST_PERMS || "*://*/*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hostPermissions = Array.from(new Set([hostPerm, ...extraHostPerms]));
  const action = {
    default_title: DEV_TITLE,
    default_icon: {
      "16": "icon16.png",
      "32": "icon32.png",
    },
  };
  if (DEV_HAS_CONTROLS) action.default_popup = "popup.html";

  return {
    manifest_version: 3,
    name: DEV_NAME,
    version: DEV_VERSION,
    description: DEV_DESCRIPTION,
    permissions: DEV_HAS_CONTROLS ? ["storage", "tabs"] : [],
    icons: {
      "16": "icon16.png",
      "32": "icon32.png",
      "48": "icon48.png",
      "128": "icon128.png",
    },
    action,
    background: {
      service_worker: "bg.js",
    },
    host_permissions: hostPermissions,
    content_scripts: [
      {
        matches: [CHAT_MATCH],
        js: ["loader.js"],
        run_at: "document_start",
      },
    ],
  };
}

function makeBackgroundJs() {
  return `const TAG = ${JSON.stringify(DEV_TAG)};
const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
const MSG_HTTP = "h2o-ext-live:http";

function normHeaders(h) {
  if (!h || typeof h !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    if (v == null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

async function httpRequest(req) {
  const method = String(req?.method || "GET").toUpperCase();
  const url = String(req?.url || "");
  if (!url) return { ok: false, status: 0, error: "missing url" };

  const timeoutRaw = Number(req?.timeoutMs || 20000);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(1000, Math.min(120000, timeoutRaw)) : 20000;
  const headers = normHeaders(req?.headers);
  const hasBody = Object.prototype.hasOwnProperty.call(req || {}, "body");
  const body = hasBody && req.body != null ? String(req.body) : undefined;

  const ac = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = ac ? setTimeout(() => { try { ac.abort(); } catch {} }, timeoutMs) : 0;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "follow",
      signal: ac ? ac.signal : undefined,
    });
    const text = await res.text();
    return {
      ok: true,
      status: Number(res.status || 0),
      statusText: String(res.statusText || ""),
      responseText: String(text || ""),
      finalUrl: String(res.url || url),
      responseURL: String(res.url || url),
      method,
      url,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: String(err && (err.stack || err.message || err)),
      method,
      url,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === MSG_FETCH_TEXT && typeof msg.url === "string") {
    (async () => {
      const r = await httpRequest({
        method: "GET",
        url: String(msg.url),
        timeoutMs: 15000,
      });
      if (!r.ok) {
        sendResponse({
          ok: false,
          status: Number(r.status || 0),
          error: String(r.error || "request failed"),
          url: String(msg.url),
        });
        return;
      }
      sendResponse({
        ok: Number(r.status || 0) >= 200 && Number(r.status || 0) < 300,
        status: Number(r.status || 0),
        text: String(r.responseText || ""),
        url: String(msg.url),
      });
    })();
    return true;
  }

  if (msg.type === MSG_HTTP && msg.req && typeof msg.req.url === "string") {
    (async () => {
      const r = await httpRequest(msg.req);
      sendResponse(r);
    })();
    return true;
  }
});

console.log(TAG, "background ready");
`;
}

function makeLoaderJs() {
  return `(() => {
  "use strict";

  const TAG = ${JSON.stringify(DEV_TAG)};
  const STATUS_LABEL = ${JSON.stringify(DEV_TITLE)};
  const ENABLE_TOGGLES = ${JSON.stringify(DEV_HAS_CONTROLS)};
  const PROXY_PACK_URL = ${JSON.stringify(PROXY_PACK_URL)};
  const STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
  const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
  const MSG_HTTP = "h2o-ext-live:http";
  const MSG_HTTP_REQ = "h2o-ext-live:http:req";
  const MSG_HTTP_RES = "h2o-ext-live:http:res";

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
`;
}

function makePopupHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>H2O Dev Controls</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="app">
    <header class="top">
      <div>
        <h1>H2O Dev Controls</h1>
        <p class="sub">Per-script toggles for EXT dev loader</p>
      </div>
      <div class="dot" id="dot" title="Status"></div>
    </header>

    <div class="meta">
      <div id="counts">Loading...</div>
      <div id="pack-url" class="mono"></div>
    </div>

    <div class="actions">
      <button id="all-on" type="button">All On</button>
      <button id="all-off" type="button">All Off</button>
      <button id="reset" type="button">Reset</button>
      <button id="reload" type="button">Reload Tab</button>
    </div>

    <div class="hint" id="hint">Changes apply on page reload.</div>

    <div class="list" id="list"></div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
`;
}

function makePopupCss() {
  return `:root {
  --bg: #121314;
  --panel: #1a1c1f;
  --line: #2b2f35;
  --text: #eceff3;
  --muted: #a6adb8;
  --accent: #8dd35f;
  --danger: #ff7a7a;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
body {
  width: 430px;
  min-height: 520px;
  font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.app { padding: 10px; }
.top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
.top h1 { margin: 0; font-size: 15px; line-height: 1.2; }
.sub { margin: 2px 0 0; color: var(--muted); font-size: 11px; }
.dot {
  width: 10px; height: 10px; border-radius: 999px; margin-top: 4px;
  background: #666;
  box-shadow: 0 0 0 2px rgba(255,255,255,.06);
}
.dot.ok { background: var(--accent); }
.dot.err { background: var(--danger); }
.meta {
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 8px;
  margin-bottom: 8px;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: var(--muted); word-break: break-all; }
.actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}
button {
  appearance: none;
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 6px;
  cursor: pointer;
  font: inherit;
}
button:hover { border-color: #48515e; }
button:active { transform: translateY(1px); }
.hint { color: var(--muted); font-size: 11px; margin: 0 0 8px; }
.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 420px;
  overflow: auto;
  padding-right: 2px;
}
.row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255,255,255,.02);
  padding: 7px 8px;
}
.row.off { opacity: .68; }
.row .name { font-size: 12px; }
.row .alias { color: var(--muted); font-size: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.badge {
  border: 1px solid var(--line);
  color: var(--muted);
  border-radius: 999px;
  font-size: 10px;
  padding: 2px 6px;
}
.switch { position: relative; width: 32px; height: 18px; display: inline-block; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0;
  background: #3b4048; border-radius: 999px; transition: .15s ease;
  border: 1px solid rgba(255,255,255,.12);
}
.slider::before {
  content: "";
  position: absolute; width: 12px; height: 12px; left: 2px; top: 2px;
  border-radius: 50%; background: #d8dee8; transition: .15s ease;
}
.switch input:checked + .slider { background: rgba(141,211,95,.35); }
.switch input:checked + .slider::before { transform: translateX(14px); background: #b7f089; }
.empty, .error {
  border: 1px dashed var(--line);
  border-radius: 10px;
  padding: 12px;
  color: var(--muted);
}
.error { color: #ffd4d4; border-color: rgba(255,122,122,.35); }
`;
}

function makePopupJs() {
  return `(() => {
  "use strict";

  const PROXY_PACK_URL = ${JSON.stringify(PROXY_PACK_URL)};
  const STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
  const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";
  const HDR_RE = /\\/\\/\\s*==UserScript==[\\s\\S]*?\\/\\/\\s*==\\/UserScript==/g;

  const elList = document.getElementById("list");
  const elCounts = document.getElementById("counts");
  const elPackUrl = document.getElementById("pack-url");
  const elHint = document.getElementById("hint");
  const elDot = document.getElementById("dot");

  let scripts = [];
  let toggleMap = {};

  elPackUrl.textContent = PROXY_PACK_URL;

  function setDot(mode) {
    elDot.classList.remove("ok", "err");
    if (mode === "ok") elDot.classList.add("ok");
    if (mode === "err") elDot.classList.add("err");
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

  function aliasIdFromRequireUrl(urlStr) {
    const raw = String(urlStr || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw);
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

  function sendFetchText(url) {
    return new Promise((resolve, reject) => {
      const reqUrl = url + (url.includes("?") ? "&" : "?") + "popupcb=" + encodeURIComponent(Date.now());
      chrome.runtime.sendMessage({ type: MSG_FETCH_TEXT, url: reqUrl }, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) return reject(new Error(String(le.message || le)));
        if (!resp || !resp.ok) return reject(new Error(resp?.error || ("HTTP " + Number(resp?.status || 0))));
        resolve(String(resp.text || ""));
      });
    });
  }

  function storageGetMap() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const le = chrome.runtime.lastError;
        if (le) return resolve({});
        const map = res && typeof res[STORAGE_KEY] === "object" && res[STORAGE_KEY] ? res[STORAGE_KEY] : {};
        resolve(map);
      });
    });
  }

  function storageSetMap(nextMap) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: nextMap }, () => resolve());
    });
  }

  function storageReset() {
    return new Promise((resolve) => {
      chrome.storage.local.remove([STORAGE_KEY], () => resolve());
    });
  }

  function isEnabled(item) {
    return toggleMap[item.aliasId] !== false;
  }

  function countsText() {
    const total = scripts.length;
    const enabled = scripts.filter(isEnabled).length;
    const disabled = total - enabled;
    return enabled + "/" + total + " enabled · " + disabled + " disabled";
  }

  function render() {
    elCounts.textContent = countsText();
    elList.innerHTML = "";

    if (!scripts.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No scripts found in proxy pack.";
      elList.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const item of scripts) {
      const row = document.createElement("label");
      row.className = "row" + (isEnabled(item) ? "" : " off");
      row.title = item.requireUrl;

      const sw = document.createElement("span");
      sw.className = "switch";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = isEnabled(item);
      cb.dataset.aliasId = item.aliasId;
      const slider = document.createElement("span");
      slider.className = "slider";
      sw.appendChild(cb);
      sw.appendChild(slider);

      const text = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = item.name;
      const alias = document.createElement("div");
      alias.className = "alias";
      alias.textContent = item.aliasId;
      text.appendChild(name);
      text.appendChild(alias);

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = item.runAt;

      row.appendChild(sw);
      row.appendChild(text);
      row.appendChild(badge);
      frag.appendChild(row);
    }
    elList.appendChild(frag);
  }

  async function setAliasEnabled(aliasId, enabled) {
    const key = String(aliasId || "");
    if (!key) return;
    if (enabled) delete toggleMap[key];
    else toggleMap[key] = false;
    await storageSetMap(toggleMap);
    render();
    elHint.textContent = "Changes saved. Reload the page to apply.";
  }

  async function setAll(enabled) {
    if (!scripts.length) return;
    const next = { ...toggleMap };
    for (const it of scripts) {
      if (enabled) delete next[it.aliasId];
      else next[it.aliasId] = false;
    }
    toggleMap = next;
    await storageSetMap(toggleMap);
    render();
    elHint.textContent = enabled ? "All scripts enabled. Reload the page to apply." : "All scripts disabled. Reload the page to apply.";
  }

  async function resetToggles() {
    await storageReset();
    toggleMap = {};
    render();
    elHint.textContent = "Toggles reset to default (all on). Reload the page to apply.";
  }

  async function reloadActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || typeof tab.id !== "number") {
        elHint.textContent = "No active tab found.";
        return;
      }
      await chrome.tabs.reload(tab.id);
      elHint.textContent = "Active tab reloaded.";
    } catch (e) {
      elHint.textContent = "Reload failed: " + String(e && (e.message || e));
    }
  }

  async function loadAndRender() {
    setDot();
    elCounts.textContent = "Loading proxy pack...";
    try {
      const [packText, stored] = await Promise.all([
        sendFetchText(PROXY_PACK_URL),
        storageGetMap(),
      ]);
      scripts = parseProxyPack(packText);
      toggleMap = stored || {};
      setDot("ok");
      elHint.textContent = "Changes apply on page reload.";
      render();
    } catch (e) {
      setDot("err");
      elCounts.textContent = "Failed to load proxy pack";
      elList.innerHTML = "";
      const errBox = document.createElement("div");
      errBox.className = "error";
      errBox.textContent = String(e && (e.message || e));
      elList.appendChild(errBox);
      elHint.textContent = "Check local server and run Common build first.";
    }
  }

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.type !== "checkbox") return;
    const aliasId = String(t.dataset.aliasId || "");
    setAliasEnabled(aliasId, !!t.checked);
  });

  document.getElementById("all-on").addEventListener("click", () => setAll(true));
  document.getElementById("all-off").addEventListener("click", () => setAll(false));
  document.getElementById("reset").addEventListener("click", () => resetToggles());
  document.getElementById("reload").addEventListener("click", () => reloadActiveTab());

  loadAndRender();
})();
`;
}

function makeReadme() {
  const outAbs = path.resolve(OUT_DIR);
  if (!DEV_HAS_CONTROLS) {
    return `H2O Dev Loader Extension (Lean, Unpacked)
==========================================

This is the DEV-only lean loader extension button (no popup toggles).

How it works:
- Content script fetches:
  ${PROXY_PACK_URL}
- It parses the proxy pack and loads all scripts by @run-at phase.
- It skips chrome.storage toggle reads for slightly faster startup.

IMPORTANT:
- Keep your local server running on 127.0.0.1:5500.
- Disable H2O Dev Controls if both point to the same page (avoid duplicate injection).

Install:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select this folder:
   ${outAbs}

Daily workflow:
1) Run Common / 3
2) Run the lean DEV build task (or lean combined task)
3) Refresh chatgpt.com tab
`;
  }

  return `H2O Dev Controls Extension (Unpacked)
=====================================

This is the DEV-only extension button with per-script toggles.

How it works:
- Content script fetches:
  ${PROXY_PACK_URL}
- It reads per-script toggles from chrome.storage.local.
- It loads only enabled scripts (grouped by @run-at phase).
- Popup shows all scripts from the proxy pack and lets you toggle them.

IMPORTANT:
- Keep your local server running on 127.0.0.1:5500.
- Toggle changes apply on page reload.
- Disable old TM proxy scripts while using this extension.

Install:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select this folder:
   ${outAbs}

Daily workflow:
1) Run Common / 3 (or the combined DEV workflow task)
2) Reload this extension (if loader changed)
3) Use the popup to toggle scripts
4) Refresh chatgpt.com tab
`;
}

function writeFile(fp, txt) {
  fs.writeFileSync(fp, String(txt), "utf8");
}

ensureDir(OUT_DIR);
writeExtensionIcons(OUT_DIR, DEV_HAS_CONTROLS ? "dev" : "dev-lean");

writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(makeManifest(), null, 2) + "\n");
writeFile(path.join(OUT_DIR, "bg.js"), makeBackgroundJs());
writeFile(path.join(OUT_DIR, "loader.js"), makeLoaderJs());
if (DEV_HAS_CONTROLS) {
  writeFile(path.join(OUT_DIR, "popup.html"), makePopupHtml());
  writeFile(path.join(OUT_DIR, "popup.css"), makePopupCss());
  writeFile(path.join(OUT_DIR, "popup.js"), makePopupJs());
} else {
  for (const n of ["popup.html", "popup.css", "popup.js"]) {
    try { fs.unlinkSync(path.join(OUT_DIR, n)); } catch {}
  }
}
writeFile(path.join(OUT_DIR, "README.txt"), makeReadme());

console.log("[H2O] " + (DEV_HAS_CONTROLS ? "dev controls" : "dev lean loader") + " extension generated:");
console.log("[H2O] out:", OUT_DIR);
console.log("[H2O] manifest:", path.join(OUT_DIR, "manifest.json"));
console.log("[H2O] proxy pack:", PROXY_PACK_URL);
