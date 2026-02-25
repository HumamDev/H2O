import fs from "node:fs";
import path from "node:path";
// @version 1.0.0

const SRC =
  process.env.H2O_SRC_DIR ||
  "/Users/hobayda/Library/Mobile Documents/com~apple~CloudDocs/VS Code/h2o-source";

const OUT_DIR =
  process.env.H2O_EXT_OUT_DIR ||
  path.join(SRC, "build", "chrome-ext-live");

const PROXY_PACK_URL =
  process.env.H2O_EXT_PROXY_PACK_URL ||
  "http://127.0.0.1:5500/dev_output/proxy/_install-all.tampermonkey.txt";

const CHAT_MATCH =
  process.env.H2O_EXT_MATCH ||
  "https://chatgpt.com/*";

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
  return {
    manifest_version: 3,
    name: "H2O Live Dev Loader (Unpacked)",
    version: "1.0.0",
    description: "Dev-only local loader for H2O scripts on chatgpt.com (no Tampermonkey cache freeze).",
    background: {
      service_worker: "bg.js",
    },
    host_permissions: [
      hostPerm,
    ],
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
  return `const TAG = "[H2O EXT LIVE]";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "h2o-ext-live:fetch-text" || typeof msg.url !== "string") return;

  (async () => {
    try {
      const res = await fetch(msg.url, {
        method: "GET",
        cache: "no-store",
      });
      const text = await res.text();
      sendResponse({
        ok: res.ok,
        status: Number(res.status || 0),
        text: String(text || ""),
        url: String(msg.url),
      });
    } catch (err) {
      sendResponse({
        ok: false,
        status: 0,
        error: String(err && (err.stack || err.message || err)),
        url: String(msg.url),
      });
    }
  })();

  return true;
});

console.log(TAG, "background ready");
`;
}

function makeLoaderJs() {
  return `(() => {
  "use strict";

  const TAG = "[H2O EXT LIVE]";
  const PROXY_PACK_URL = ${JSON.stringify(PROXY_PACK_URL)};
  const MSG_FETCH_TEXT = "h2o-ext-live:fetch-text";

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

  function withBust(url) {
    const sep = url.includes("?") ? "&" : "?";
    const bust = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
    return \`\${url}\${sep}extcb=\${encodeURIComponent(bust)}\`;
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
          reject(new Error(resp?.error || \`HTTP \${Number(resp?.status || 0)}\`));
          return;
        }
        resolve({ text: String(resp.text || ""), url: reqUrl });
      });
    });
  }

  function readTag(metaText, tag) {
    const rx = new RegExp(\`^\\\\s*//\\\\s*@\${tag}\\\\s+(.+?)\\\\s*$\`, "mi");
    const m = String(metaText || "").match(rx);
    return m ? String(m[1]).trim() : "";
  }

  function normalizeRunAt(runAtRaw) {
    const v = String(runAtRaw || "").trim().toLowerCase().replace(/_/g, "-");
    if (v === "document-start") return "document-start";
    if (v === "document-end") return "document-end";
    return "document-idle";
  }

  function parseProxyPack(packText) {
    const headers = String(packText || "").match(HDR_RE) || [];
    const out = [];

    for (const h of headers) {
      const name = readTag(h, "name") || "(unnamed)";
      const runAt = normalizeRunAt(readTag(h, "run-at") || "document-idle");
      const requireUrl = readTag(h, "require");
      if (!requireUrl) continue;
      out.push({ name, runAt, requireUrl });
    }

    return out;
  }

  async function executeCode(code, sourceUrl) {
    const body = String(code || "");
    const withSource = body + "\\n//# sourceURL=" + sourceUrl;

    // Try classic-script semantics first.
    try {
      const fn = new Function(withSource);
      fn.call(window);
      return "function";
    } catch (e1) {
      // Fallback: execute as blob module wrapped in IIFE.
      const wrapped = "(function(){\\n" + withSource + "\\n})();\\n";
      const blob = new Blob([wrapped], { type: "text/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      try {
        await import(blobUrl);
        return "module";
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    }
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
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        const res = await sendFetchText(it.requireUrl);
        if (!String(res.text || "").trim()) {
          warn(phase, \`[\${i + 1}/\${items.length}]\`, it.name, "empty response");
          continue;
        }
        const mode = await executeCode(res.text, it.requireUrl);
        log(phase, \`[\${i + 1}/\${items.length}]\`, it.name, "loaded via", mode);
      } catch (e) {
        err(phase, \`[\${i + 1}/\${items.length}]\`, it.name, e);
      }
    }
  }

  async function boot() {
    log("boot start", location.href);

    const packRes = await sendFetchText(PROXY_PACK_URL);
    const all = parseProxyPack(packRes.text);
    if (!all.length) {
      warn("no scripts parsed from proxy pack", PROXY_PACK_URL);
      return;
    }

    const phaseStart = [];
    const phaseEnd = [];
    const phaseIdle = [];

    for (const it of all) {
      if (it.runAt === "document-start") phaseStart.push(it);
      else if (it.runAt === "document-end") phaseEnd.push(it);
      else phaseIdle.push(it);
    }

    log("scripts:", all.length, { start: phaseStart.length, end: phaseEnd.length, idle: phaseIdle.length });

    await loadPhase(phaseStart, "document-start");
    await waitDomContentLoaded();
    await loadPhase(phaseEnd, "document-end");
    await waitDomIdle();
    await loadPhase(phaseIdle, "document-idle");

    log("boot done");
  }

  boot().catch((e) => err("boot fatal", e));
})();
`;
}

function makeReadme() {
  const outAbs = path.resolve(OUT_DIR);
  return `H2O Chrome Live Dev Extension (Unpacked)
========================================

This is a DEV-only extension path that avoids Tampermonkey cache freeze.

How it works:
- Content script fetches:
  ${PROXY_PACK_URL}
- It parses @require URLs and loads scripts in order (by @run-at phase).
- Each fetch adds extcb=<timestamp-random> to avoid stale cache.

IMPORTANT:
- Disable H2O Tampermonkey proxy scripts while using this extension.
- Keep your local server running on 127.0.0.1:5500.

Install:
1) Open chrome://extensions
2) Enable "Developer mode"
3) Click "Load unpacked"
4) Select this folder:
   ${outAbs}

Daily workflow:
1) In VS Code, run:
   - H2O: Sync + Build (TSV master) (one click)
2) Refresh chatgpt.com tab
3) Changes should appear without TM update checks or dev/dev2 edits

If you add/remove scripts in dev-order:
- Run the build task again, then refresh the page.
`;
}

function writeFile(fp, txt) {
  fs.writeFileSync(fp, String(txt), "utf8");
}

ensureDir(OUT_DIR);

writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(makeManifest(), null, 2) + "\n");
writeFile(path.join(OUT_DIR, "bg.js"), makeBackgroundJs());
writeFile(path.join(OUT_DIR, "loader.js"), makeLoaderJs());
writeFile(path.join(OUT_DIR, "README.txt"), makeReadme());

console.log("[H2O] chrome live extension generated:");
console.log("[H2O] out:", OUT_DIR);
console.log("[H2O] manifest:", path.join(OUT_DIR, "manifest.json"));
console.log("[H2O] proxy pack:", PROXY_PACK_URL);
