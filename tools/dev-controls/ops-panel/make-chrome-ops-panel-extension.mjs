// @version 1.1.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { removeArchiveWorkbenchFromOut } from "../../product/studio/pack-studio.mjs";
import { writeExtensionIcons } from "../../product/extension/write-extension-icons.mjs";
// @version 1.0.0

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const SRC_DEFAULT = path.resolve(TOOL_DIR, "..", "..", "..");

const SRC =
  process.env.H2O_SRC_DIR ||
  SRC_DEFAULT;

const OUT_DIR =
  process.env.H2O_PANEL_OUT_DIR ||
  path.join(SRC, "build", "chrome-ext-ops-panel");
const OPS_ICON_PACK_DIR = path.join(SRC, "assets", "chrome-ops-panel-icons");
const ICON_SIZES = [16, 32, 48, 128, 256, 512, 1024];

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

function copyIconPack(outDir, iconPackDir) {
  const iconsDir = path.join(outDir, "icons");
  ensureDir(iconsDir);
  for (const size of ICON_SIZES) {
    const iconName = `icon${size}.png`;
    const src = path.join(iconPackDir, iconName);
    const dest = path.join(iconsDir, iconName);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, dest);
  }
}

function makeManifest() {
  return {
    manifest_version: 3,
    name: "H2O Ops Panel (Preview)",
    version: "0.1.0",
    description: "Preview/scaffold for the future H2O panel extension UI.",
    permissions: ["storage", "management"],
    icons: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
    action: {
      default_title: "H2O Ops Panel",
      default_popup: "panel.html",
      default_icon: {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
      },
    },
  };
}

function makePanelHtml() {
  return `<!doctype html>
<html data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>H2O Ops Panel</title>
  <link rel="stylesheet" href="panel.css">
</head>
<body>
  <main class="app">
    <header class="hero">
      <div class="eyebrow">H2O OPS PANEL</div>
      <div class="title-row">
        <h1>Ops Panel</h1>
        <button class="info-dot" type="button" title="Ops controls live here. Settings are saved in chrome.storage.local." aria-label="Ops Panel info">i</button>
      </div>
    </header>

    <section class="card launch-card">
      <div class="section-head">
        <div class="section-title">Launch</div>
        <button class="info-dot" type="button" title="Open Studio or Control Hub from the H2O Dev Controls extension." aria-label="Launch info">i</button>
      </div>
      <div class="actions">
        <button id="open-studio" type="button">Open Studio</button>
        <button id="open-control-hub" type="button">Open Control Hub</button>
        <button id="show-setup-prompt" type="button">Show Setup Prompt</button>
      </div>
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
      <label class="row">
        <span>Dark Mode</span>
        <input id="toggle-dark" type="checkbox">
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
  --grad-a: rgba(217,137,52,.14);
  --grad-b: rgba(13,107,95,.12);
  --hero-bg-a: rgba(255,255,255,.78);
  --hero-bg-b: rgba(255,255,255,.55);
  --row-bg: rgba(255,255,255,.6);
  --shadow: rgba(24,23,22,.05);
}
:root[data-theme="dark"] {
  --bg: #131618;
  --ink: #f4f7fa;
  --muted: #a7b1ba;
  --card: #1b2126;
  --line: #2c353d;
  --accent: #4ec7b0;
  --accent-2: #f0ad5f;
  --grad-a: rgba(240,173,95,.18);
  --grad-b: rgba(78,199,176,.18);
  --hero-bg-a: rgba(255,255,255,.03);
  --hero-bg-b: rgba(255,255,255,.01);
  --row-bg: rgba(255,255,255,.02);
  --shadow: rgba(0,0,0,.35);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  width: 380px;
  min-height: 540px;
  background:
    radial-gradient(1200px 400px at -10% -20%, var(--grad-a), transparent 50%),
    radial-gradient(700px 400px at 120% 10%, var(--grad-b), transparent 45%),
    var(--bg);
  color: var(--ink);
  font: 13px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
.app { padding: 12px; display: grid; gap: 10px; }
.hero {
  background: linear-gradient(180deg, var(--hero-bg-a), var(--hero-bg-b));
  border: 1px solid rgba(24,23,22,.08);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 4px 18px var(--shadow);
}
.eyebrow { font-size: 10px; letter-spacing: .12em; color: var(--muted); }
.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.hero h1 { margin: 6px 0 2px; font-size: 18px; line-height: 1.1; }
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
  background: var(--row-bg);
}
.row span { font-size: 12px; }
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.section-title { font-weight: 600; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.actions button { min-width: 0; }
.actions button:nth-child(3) { grid-column: 1 / -1; }
.info-dot {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  padding: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--muted);
  border: 1px solid var(--line);
  background: transparent;
  cursor: help;
}
.checklist { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.checklist li { display: flex; align-items: center; gap: 8px; }
textarea {
  width: 100%; resize: vertical; min-height: 120px;
  border: 1px solid var(--line); border-radius: 10px; padding: 9px;
  background: var(--card); color: var(--ink); font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.foot {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  color: var(--muted); font-size: 11px;
}
button {
  appearance: none; border: 1px solid var(--line); background: var(--card); color: var(--ink);
  border-radius: 10px; padding: 7px 10px; cursor: pointer; font: inherit;
}
button:hover { border-color: var(--accent); }
button:disabled { opacity: .55; cursor: default; }
input[type="checkbox"] { accent-color: var(--accent); }
`;
}

function makePanelJs() {
  return `(() => {
  "use strict";

  const STORAGE_KEY = ${JSON.stringify(STORAGE_KEY)};
  const DEV_CONTROLS_NAME = "H2O Dev Controls";
  const DEV_CONTROLS_STUDIO_PATH = "surfaces/studio/studio.html";
  const DEV_CONTROLS_CONTROL_HUB_MSG = "h2o-ext-live:control-hub-open";
  const DEV_CONTROLS_IDENTITY_FIRST_RUN_MSG = "h2o-ext-identity-first-run:v1";
  const CHATGPT_CONTROL_HUB_URL = "https://chatgpt.com/?h2o_open_control_hub=1";
  const DEFAULT_STATE = {
    shell: true,
    diagnostics: false,
    compact: false,
    markers: true,
    darkMode: true,
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
    darkMode: document.getElementById("toggle-dark"),
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

  function buildDevControlsStudioUrl(extId) {
    return "chrome-extension://" + String(extId || "") + "/" + DEV_CONTROLS_STUDIO_PATH;
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

  function sendControlHubOpen(extId) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(String(extId || ""), { type: DEV_CONTROLS_CONTROL_HUB_MSG }, (resp) => {
          const le = chrome.runtime.lastError;
          if (le) return reject(new Error(String(le.message || le)));
          if (!resp || resp.ok === false) return reject(new Error(String(resp?.error || "Control Hub open request failed")));
          resolve(resp);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  function sendIdentityFirstRunPrompt(extId, action = "force-show") {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(String(extId || ""), { type: DEV_CONTROLS_IDENTITY_FIRST_RUN_MSG, action }, (resp) => {
          const le = chrome.runtime.lastError;
          if (le) return reject(new Error(String(le.message || le)));
          if (!resp || resp.ok === false) return reject(new Error(String(resp?.error || "Setup prompt request failed")));
          resolve(resp);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  async function refreshLaunchButtons() {
    const studioBtn = document.getElementById("open-studio");
    const controlHubBtn = document.getElementById("open-control-hub");
    const setupPromptBtn = document.getElementById("show-setup-prompt");
    if (!(studioBtn instanceof HTMLButtonElement) || !(controlHubBtn instanceof HTMLButtonElement) || !(setupPromptBtn instanceof HTMLButtonElement)) return null;
    try {
      const ext = await findDevControlsExtension();
      studioBtn.disabled = !ext;
      controlHubBtn.disabled = !ext;
      setupPromptBtn.disabled = !ext;
      studioBtn.title = !ext
        ? "Load the H2O Dev Controls extension to open Studio"
        : "Open the dev-controls Studio home in a new tab";
      controlHubBtn.title = !ext
        ? "Open ChatGPT and trigger Control Hub (requires H2O Dev Controls loader)"
        : "Open ChatGPT and trigger the same in-page Control Hub as Cockpit Pro";
      setupPromptBtn.title = !ext
        ? "Load the H2O Dev Controls extension first"
        : "Force-show the Cockpit Pro/H2O first-run setup prompt on the active ChatGPT tab";
      return ext;
    } catch (err) {
      studioBtn.disabled = false;
      controlHubBtn.disabled = false;
      setupPromptBtn.disabled = false;
      studioBtn.title = "Try opening Studio";
      controlHubBtn.title = "Try opening Control Hub";
      setStatus("Studio lookup error");
      return null;
    }
  }

  function applyTheme(isDark) {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
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
    refs.darkMode.checked = !!state.darkMode;
    refs.notes.value = String(state.notes || "");
    applyTheme(!!state.darkMode);
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
      darkMode: !!refs.darkMode.checked,
      notes: String(refs.notes.value || ""),
    };
    for (const el of document.querySelectorAll('.checklist input[type="checkbox"][data-key]')) {
      out[String(el.dataset.key || "")] = !!el.checked;
    }
    return out;
  }

  async function init() {
    applyTheme(DEFAULT_STATE.darkMode);
    const state = await getState();
    await applyState(state);
    await refreshLaunchButtons();
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
    if (t.matches('input[type="checkbox"]')) {
      if (t.id === "toggle-dark") applyTheme(!!refs.darkMode.checked);
      queueSave();
    }
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

  async function openStudioFromDevControls() {
    const studioBtn = document.getElementById("open-studio");
    if (studioBtn instanceof HTMLButtonElement) studioBtn.disabled = true;
    setStatus("Opening Studio...");
    try {
      const ext = await findDevControlsExtension();
      if (!ext) throw new Error("H2O Dev Controls extension not found");
      await openWorkbenchUrl(buildDevControlsStudioUrl(ext.id));
      setStatus("Studio opened");
      window.close();
    } catch (err) {
      setStatus(String(err && (err.message || err)) || "Failed to open Studio");
      await refreshLaunchButtons();
    }
  }

  async function openControlHubFromDevControls() {
    const controlHubBtn = document.getElementById("open-control-hub");
    if (controlHubBtn instanceof HTMLButtonElement) controlHubBtn.disabled = true;
    setStatus("Opening Control Hub...");
    try {
      const ext = await findDevControlsExtension();
      if (!ext) throw new Error("H2O Dev Controls extension not found");
      try {
        await sendControlHubOpen(ext.id);
      } catch {
        // Fallback: open ChatGPT with one-time URL trigger if runtime message path fails.
        await openWorkbenchUrl(CHATGPT_CONTROL_HUB_URL);
      }
      setStatus("Control Hub opened");
      window.close();
    } catch (err) {
      setStatus(String(err && (err.message || err)) || "Failed to open Control Hub");
      await refreshLaunchButtons();
    }
  }

  async function showSetupPromptFromDevControls() {
    const setupPromptBtn = document.getElementById("show-setup-prompt");
    if (setupPromptBtn instanceof HTMLButtonElement) setupPromptBtn.disabled = true;
    setStatus("Showing setup prompt...");
    try {
      const ext = await findDevControlsExtension();
      if (!ext) throw new Error("H2O Dev Controls extension not found");
      await sendIdentityFirstRunPrompt(ext.id, "force-show");
      setStatus("Setup prompt shown on ChatGPT");
      setTimeout(() => window.close(), 420);
    } catch (err) {
      setStatus(String(err && (err.message || err)) || "Failed to show setup prompt");
      await refreshLaunchButtons();
    }
  }

  document.getElementById("open-studio").addEventListener("click", async () => {
    await openStudioFromDevControls();
  });

  document.getElementById("open-control-hub").addEventListener("click", async () => {
    await openControlHubFromDevControls();
  });

  document.getElementById("show-setup-prompt").addEventListener("click", async () => {
    await showSetupPromptFromDevControls();
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
- Dark Mode toggle is available in the popup.
- Open Studio button launches the Studio page from H2O Dev Controls.
- Open Control Hub button opens the in-page Control Hub through H2O Dev Controls.
- Show Setup Prompt asks H2O Dev Controls to force-show the Cockpit Pro/H2O setup prompt on an active ChatGPT tab.
- Ops icon uses a dedicated logo family for quick identification.
- This preview build does not inject scripts yet.
`;
}

async function main() {
  ensureDir(OUT_DIR);
  await writeExtensionIcons(OUT_DIR, "panel");
  copyIconPack(OUT_DIR, OPS_ICON_PACK_DIR);
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
}

main().catch((error) => {
  console.error("[H2O] Ops panel preview build failed.");
  console.error(error?.stack || error);
  process.exit(1);
});
