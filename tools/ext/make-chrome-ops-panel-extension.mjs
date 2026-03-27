// @version 1.0.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { removeArchiveWorkbenchFromOut } from "./pack-studio.mjs";
import { writeExtensionIcons } from "./write-extension-icons.mjs";
// @version 1.0.0

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const SRC_DEFAULT = path.resolve(TOOL_DIR, "..", "..");

const SRC =
  process.env.H2O_SRC_DIR ||
  SRC_DEFAULT;

const OUT_DIR =
  process.env.H2O_PANEL_OUT_DIR ||
  path.join(SRC, "build", "chrome-ext-ops-panel");

const STORAGE_KEY = "h2oPanelPreviewStateV1";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFile(fp, txt) {
  fs.writeFileSync(fp, String(txt), "utf8");
}

function removeIfPresent(fp) {
  try { fs.unlinkSync(fp); } catch {}
}

function makeManifest() {
  return {
    manifest_version: 3,
    name: "H2O Ops Panel (Preview)",
    version: "0.1.0",
    description: "Preview/scaffold for the future H2O panel extension UI.",
    permissions: ["storage", "management"],
    icons: {
      "16": "icon16.png",
      "32": "icon32.png",
      "48": "icon48.png",
      "128": "icon128.png",
    },
    action: {
      default_title: "H2O Ops Panel",
      default_popup: "panel.html",
      default_icon: {
        "16": "icon16.png",
        "32": "icon32.png",
      },
    },
  };
}

function makePanelHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>H2O Ops Panel Preview</title>
  <link rel="stylesheet" href="panel.css">
</head>
<body>
  <main class="app">
    <header class="hero">
      <div class="eyebrow">H2O OPS PANEL</div>
      <h1>Ops Panel Preview</h1>
      <p>Separate extension icon for the final Ops Panel UI while you build it gradually.</p>
    </header>

    <section class="card launch-card">
      <div class="section-title">Archive Workbench</div>
      <p class="card-copy">Open the saved-chat workbench from the H2O Dev Controls extension.</p>
      <button id="open-workbench" type="button">Open Workbench</button>
    </section>

    <section class="card grid2">
      <label class="row">
        <span>Enable Panel Shell</span>
        <input id="toggle-shell" type="checkbox">
      </label>
      <label class="row">
        <span>Enable Diagnostics</span>
        <input id="toggle-diagnostics" type="checkbox">
      </label>
      <label class="row">
        <span>Compact Layout</span>
        <input id="toggle-compact" type="checkbox">
      </label>
      <label class="row">
        <span>Show Dev Markers</span>
        <input id="toggle-markers" type="checkbox">
      </label>
    </section>

    <section class="card">
      <div class="section-title">Milestones</div>
      <ul class="checklist">
        <li><input type="checkbox" data-key="milestone_nav"> Navigation shell</li>
        <li><input type="checkbox" data-key="milestone_notes"> Notes panel integration</li>
        <li><input type="checkbox" data-key="milestone_bookmarks"> Bookmarks panel integration</li>
        <li><input type="checkbox" data-key="milestone_release"> Release-ready popup/panel UX</li>
      </ul>
    </section>

    <section class="card">
      <div class="section-title">Scratch Notes</div>
      <textarea id="notes" rows="8" placeholder="Design notes, TODOs, interaction ideas..."></textarea>
    </section>

    <footer class="foot">
      <span id="status">Saved locally in chrome.storage</span>
      <button id="reset" type="button">Reset</button>
    </footer>
  </main>
  <script src="panel.js"></script>
</body>
</html>
`;
}

function makePanelCss() {
  return `:root {
  --bg: #f4f2ed;
  --ink: #181716;
  --muted: #6c655e;
  --card: #fffdf7;
  --line: #d8d0c5;
  --accent: #0d6b5f;
  --accent-2: #d98934;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  width: 380px;
  min-height: 540px;
  background:
    radial-gradient(1200px 400px at -10% -20%, rgba(217,137,52,.14), transparent 50%),
    radial-gradient(700px 400px at 120% 10%, rgba(13,107,95,.12), transparent 45%),
    var(--bg);
  color: var(--ink);
  font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.app { padding: 12px; display: grid; gap: 10px; }
.hero {
  background: linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
  border: 1px solid rgba(24,23,22,.08);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 4px 18px rgba(24,23,22,.05);
}
.eyebrow { font-size: 10px; letter-spacing: .12em; color: var(--muted); }
.hero h1 { margin: 4px 0 4px; font-size: 18px; line-height: 1.1; }
.hero p { margin: 0; color: var(--muted); }
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px;
}
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  border: 1px solid rgba(24,23,22,.06);
  border-radius: 10px;
  padding: 8px;
  background: rgba(255,255,255,.6);
}
.row span { font-size: 12px; }
.section-title { font-weight: 600; margin-bottom: 8px; }
.card-copy { margin: 0 0 10px; color: var(--muted); }
.checklist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.checklist li { display: flex; align-items: center; gap: 8px; }
textarea {
  width: 100%; resize: vertical; min-height: 120px;
  border: 1px solid var(--line); border-radius: 10px; padding: 9px;
  background: #fff; color: var(--ink); font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.foot {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  color: var(--muted); font-size: 11px;
}
button {
  appearance: none; border: 1px solid var(--line); background: white; color: var(--ink);
  border-radius: 10px; padding: 7px 10px; cursor: pointer; font: inherit;
}
button:hover { border-color: var(--accent); }
input[type="checkbox"] { accent-color: var(--accent); }
`;
}

function makePanelJs() {
  return `(() => {
  "use strict";

  const STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
  const MSG_ARCHIVE = "h2o-ext-archive:v1";
  const DEV_CONTROLS_NAME = "H2O Dev Controls";
  const DEV_CONTROLS_WORKBENCH_PATH = "surfaces/studio/studio.html#/saved";
  const DEFAULT_STATE = {
    shell: true,
    diagnostics: false,
    compact: false,
    markers: true,
    milestone_nav: false,
    milestone_notes: false,
    milestone_bookmarks: false,
    milestone_release: false,
    notes: "",
  };

  const statusEl = document.getElementById("status");
  const refs = {
    shell: document.getElementById("toggle-shell"),
    diagnostics: document.getElementById("toggle-diagnostics"),
    compact: document.getElementById("toggle-compact"),
    markers: document.getElementById("toggle-markers"),
    notes: document.getElementById("notes"),
  };

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = String(msg || "");
  }

  function managementGetAll() {
    return new Promise((resolve, reject) => {
      try {
        chrome.management.getAll((items) => {
          const le = chrome.runtime.lastError;
          if (le) return reject(new Error(String(le.message || le)));
          resolve(Array.isArray(items) ? items : []);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function findDevControlsExtension() {
    const items = await managementGetAll();
    for (const item of items) {
      if (!item || item.id === chrome.runtime.id) continue;
      if (item.type !== "extension" || item.enabled === false) continue;
      if (!String(item.name || "").startsWith(DEV_CONTROLS_NAME)) continue;
      return item;
    }
    return null;
  }

  function buildDevControlsWorkbenchUrl(extId) {
    return "chrome-extension://" + String(extId || "") + "/" + DEV_CONTROLS_WORKBENCH_PATH;
  }

  function sendArchiveMessage(extId, req) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(String(extId || ""), { type: MSG_ARCHIVE, req }, (resp) => {
          const le = chrome.runtime.lastError;
          if (le) return reject(new Error(String(le.message || le)));
          if (!resp || resp.ok === false) return reject(new Error(String(resp?.error || "Archive message failed")));
          resolve(resp.result);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function probeDevControlsArchive(extId) {
    try {
      const result = await sendArchiveMessage(extId, { op: "ping", payload: {} });
      return !!result && result.ok !== false;
    } catch {
      return false;
    }
  }

  function openWorkbenchUrl(url) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.create({ url: String(url || "") }, (tab) => {
          const le = chrome.runtime.lastError;
          if (le) return reject(new Error(String(le.message || le)));
          resolve(tab || null);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function refreshWorkbenchButton() {
    const btn = document.getElementById("open-workbench");
    if (!(btn instanceof HTMLButtonElement)) return null;
    try {
      const ext = await findDevControlsExtension();
      btn.disabled = !ext;
      const archiveReady = ext ? await probeDevControlsArchive(ext.id) : false;
      btn.title = !ext
        ? "Load the H2O Dev Controls extension to use the workbench"
        : (archiveReady
          ? "Open the dev-controls workbench in a new tab"
          : "H2O Dev Controls is installed but its archive runtime is not responding");
      return ext;
    } catch (err) {
      btn.disabled = false;
      btn.title = "Try opening the workbench";
      setStatus("Workbench lookup error");
      return null;
    }
  }

  function getState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const le = chrome.runtime.lastError;
        if (le) {
          setStatus("Storage read error");
          return resolve({ ...DEFAULT_STATE });
        }
        const saved = res && typeof res[STORAGE_KEY] === "object" && res[STORAGE_KEY] ? res[STORAGE_KEY] : {};
        resolve({ ...DEFAULT_STATE, ...saved });
      });
    });
  }

  function saveState(state) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
        setStatus("Saved locally in chrome.storage");
        resolve();
      });
    });
  }

  async function applyState(state) {
    refs.shell.checked = !!state.shell;
    refs.diagnostics.checked = !!state.diagnostics;
    refs.compact.checked = !!state.compact;
    refs.markers.checked = !!state.markers;
    refs.notes.value = String(state.notes || "");
    for (const el of document.querySelectorAll('.checklist input[type="checkbox"][data-key]')) {
      const key = String(el.dataset.key || "");
      el.checked = !!state[key];
    }
  }

  function collectState() {
    const out = {
      shell: !!refs.shell.checked,
      diagnostics: !!refs.diagnostics.checked,
      compact: !!refs.compact.checked,
      markers: !!refs.markers.checked,
      notes: String(refs.notes.value || ""),
    };
    for (const el of document.querySelectorAll('.checklist input[type="checkbox"][data-key]')) {
      out[String(el.dataset.key || "")] = !!el.checked;
    }
    return out;
  }

  async function init() {
    const state = await getState();
    await applyState(state);
    await refreshWorkbenchButton();
    setStatus("Saved locally in chrome.storage");
  }

  let saveTimer = 0;
  function queueSave() {
    if (saveTimer) clearTimeout(saveTimer);
    setStatus("Saving...");
    saveTimer = setTimeout(() => {
      saveState(collectState());
    }, 120);
  }

  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.matches('input[type="checkbox"]')) queueSave();
  });

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.id === "notes") queueSave();
  });

  document.getElementById("reset").addEventListener("click", async () => {
    await chrome.storage.local.remove([STORAGE_KEY]);
    await applyState({ ...DEFAULT_STATE });
    setStatus("Reset to defaults");
  });

  document.getElementById("open-workbench").addEventListener("click", async () => {
    const btn = document.getElementById("open-workbench");
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    setStatus("Opening workbench...");
    try {
      const ext = await findDevControlsExtension();
      if (!ext) throw new Error("H2O Dev Controls extension not found");
      await openWorkbenchUrl(buildDevControlsWorkbenchUrl(ext.id));
      setStatus("Workbench opened");
      window.close();
    } catch (err) {
      setStatus(String(err && (err.message || err)) || "Failed to open workbench");
      await refreshWorkbenchButton();
    }
  });

  init();
})();
`;
}

function makeReadme() {
  const outAbs = path.resolve(OUT_DIR);
  return `H2O Ops Panel Extension (Preview)
===========================

This is a separate extension icon used to develop the final Ops Panel UI gradually.
It is intentionally separate from H2O Dev Controls.

Install:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select:
   ${outAbs}

Notes:
- State is stored in chrome.storage.local.
- The Workbench button opens the page hosted by the H2O Dev Controls extension.
- This preview build does not inject scripts yet.
`;
}

ensureDir(OUT_DIR);
writeExtensionIcons(OUT_DIR, "panel");
writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(makeManifest(), null, 2) + "\n");
writeFile(path.join(OUT_DIR, "panel.html"), makePanelHtml());
writeFile(path.join(OUT_DIR, "panel.css"), makePanelCss());
writeFile(path.join(OUT_DIR, "panel.js"), makePanelJs());
removeArchiveWorkbenchFromOut(OUT_DIR);
for (const staleName of ["bg.js", "loader.js", "popup.html", "popup.css", "popup.js"]) {
  removeIfPresent(path.join(OUT_DIR, staleName));
}
writeFile(path.join(OUT_DIR, "README.txt"), makeReadme());

console.log("[H2O] panel preview extension generated:");
console.log("[H2O] out:", OUT_DIR);
console.log("[H2O] manifest:", path.join(OUT_DIR, "manifest.json"));
