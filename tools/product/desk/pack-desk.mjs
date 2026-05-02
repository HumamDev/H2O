#!/usr/bin/env node
// @version 1.0.0
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const uiSourceDir = path.join(repoRoot, "surfaces", "desk");
const contentSourceFile = path.join(repoRoot, "surfaces", "desk", "page-bridge.js");

const buildDir = path.join(repoRoot, "build", "chrome-ext-desk");
const buildUiDeskDir = path.join(buildDir, "surfaces", "desk");
const buildContentDir = path.join(buildDir, "content");
const deskIconPackDir = path.join(repoRoot, "assets", "surface-chrome-desk-icons");
const deskIconBuildDir = path.join(buildDir, "icons");
const deskIconSizes = [16, 32, 48, 128, 256, 512, 1024];
const deskRequiredIconSizes = [16, 32, 48, 128];

const uiSourceFiles = ["desk.html", "desk.css", "desk.js"];
const contentBuildFile = path.join(buildContentDir, "page-bridge.js");

const manifest = {
  manifest_version: 3,
  name: "H2O Desk",
  version: "0.5.0",
  description: "Desk Phase 3 role workspace.",
  action: {
    default_title: "Open Desk",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png"
    }
  },
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  background: {
    service_worker: "service-worker.js",
    type: "module"
  },
  side_panel: {
    default_path: "surfaces/desk/desk.html"
  },
  permissions: ["sidePanel", "tabs", "storage", "scripting"],
  host_permissions: ["https://chatgpt.com/*"],
  content_scripts: [
    {
      matches: ["https://chatgpt.com/*"],
      js: ["content/page-bridge.js"],
      run_at: "document_idle"
    }
  ]
};

const serviceWorkerSource = `
const GRAMMAR_KEY = "deskGrammarTabId";
const MAIN_TAB_KEY = "deskMainTabId";
const CHATGPT_URL = "https://chatgpt.com/";
const CHATGPT_MATCH = CHATGPT_URL + "*";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await chrome.storage.local.get([GRAMMAR_KEY, MAIN_TAB_KEY]);
  const keysToRemove = [];

  if (data[GRAMMAR_KEY] === tabId) {
    keysToRemove.push(GRAMMAR_KEY);
  }

  if (data[MAIN_TAB_KEY] === tabId) {
    keysToRemove.push(MAIN_TAB_KEY);
  }

  if (keysToRemove.length) {
    await chrome.storage.local.remove(keysToRemove);
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void trackPotentialMainTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || typeof changeInfo.url === "string") {
    void trackPotentialMainTab(tabId, tab);
  }
});

function isChatGptTab(tab) {
  return !!tab?.id && typeof tab.url === "string" && tab.url.startsWith(CHATGPT_URL);
}

async function getStoredTabId(key) {
  const data = await chrome.storage.local.get(key);
  return data[key] ?? null;
}

async function setStoredTabId(key, tabId) {
  await chrome.storage.local.set({ [key]: tabId });
}

async function clearStoredTabId(key) {
  await chrome.storage.local.remove(key);
}

async function getGrammarTabId() {
  return getStoredTabId(GRAMMAR_KEY);
}

async function setGrammarTabId(tabId) {
  await setStoredTabId(GRAMMAR_KEY, tabId);
}

async function clearGrammarTabId() {
  await clearStoredTabId(GRAMMAR_KEY);
}

async function getMainTabId() {
  return getStoredTabId(MAIN_TAB_KEY);
}

async function setMainTabId(tabId) {
  await setStoredTabId(MAIN_TAB_KEY, tabId);
}

async function clearMainTabId() {
  await clearStoredTabId(MAIN_TAB_KEY);
}

async function safeGetTab(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function resolveTrackedTab(tabId, clearKey) {
  if (!tabId) return null;

  const tab = await safeGetTab(tabId);
  if (tab?.id) {
    return tab;
  }

  await clearStoredTabId(clearKey);
  return null;
}

async function resolveGrammarTab() {
  const tab = await resolveTrackedTab(await getGrammarTabId(), GRAMMAR_KEY);
  if (!tab?.id) {
    return null;
  }

  return ensureGrammarTabNotAutoDiscardable(tab.id, tab);
}

async function resolveStoredMainTab() {
  const tab = await resolveTrackedTab(await getMainTabId(), MAIN_TAB_KEY);
  if (!tab) return null;

  const grammarTabId = await getGrammarTabId();
  if (!isChatGptTab(tab) || tab.id === grammarTabId) {
    await clearMainTabId();
    return null;
  }

  return tab;
}

async function trackPotentialMainTab(tabId, providedTab = null) {
  const grammarTabId = await getGrammarTabId();
  if (!tabId || tabId === grammarTabId) {
    return;
  }

  const tab = providedTab?.id === tabId ? providedTab : await safeGetTab(tabId);
  if (!isChatGptTab(tab)) {
    return;
  }

  await setMainTabId(tab.id);
}

async function ensureGrammarTabNotAutoDiscardable(tabId, fallbackTab = null) {
  if (!tabId) {
    return fallbackTab;
  }

  try {
    return await chrome.tabs.update(tabId, { autoDiscardable: false });
  } catch {
    return fallbackTab || safeGetTab(tabId);
  }
}

async function openOrReuseGrammarTab() {
  const existing = await resolveGrammarTab();

  if (existing?.id) {
    return { tab: existing, created: false };
  }

  const createdTab = await chrome.tabs.create({
    url: CHATGPT_URL,
    active: false
  });

  await setGrammarTabId(createdTab.id);
  const pinnedTab = await ensureGrammarTabNotAutoDiscardable(createdTab.id, createdTab);
  return { tab: pinnedTab, created: true };
}

async function focusGrammarTab() {
  const existing = await resolveGrammarTab();

  if (!existing?.id) {
    throw new Error("Grammar tab does not exist yet.");
  }

  if (existing.windowId != null) {
    await chrome.windows.update(existing.windowId, { focused: true });
  }

  await chrome.tabs.update(existing.id, { active: true });
  return existing;
}

async function getGrammarStatus() {
  const tab = await resolveGrammarTab();

  if (!tab?.id) {
    return {
      status: "Not created",
      tabId: null
    };
  }

  return {
    status: tab.discarded ? "Discarded" : "Ready",
    tabId: tab.id
  };
}

async function relayToActiveTab(relayType) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  return chrome.tabs.sendMessage(tab.id, { type: relayType });
}

async function ensureDeskBridge(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "DESK_PING" });
    return;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/page-bridge.js"]
    });
  }
}

async function runGrammar(text) {
  const result = await openOrReuseGrammarTab();
  const tabId = result.tab.id;

  if (!tabId) {
    throw new Error("Grammar tab could not be created.");
  }

  await ensureDeskBridge(tabId);

  const response = await chrome.tabs.sendMessage(tabId, {
    type: "DESK_GRAMMAR_RUN",
    text
  });

  return {
    tabId,
    created: result.created,
    response
  };
}

// This selection is intentionally heuristic. Desk targets the last active ChatGPT tab
// that is not the stored Grammar helper tab, with lightweight fallbacks if that tab disappears.
async function resolveMainChatTabHeuristically() {
  const grammarTabId = await getGrammarTabId();
  const storedMainTab = await resolveStoredMainTab();
  if (storedMainTab?.id && storedMainTab.id !== grammarTabId) {
    return storedMainTab;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (isChatGptTab(activeTab) && activeTab.id !== grammarTabId) {
    await setMainTabId(activeTab.id);
    return activeTab;
  }

  const tabs = await chrome.tabs.query({ url: [CHATGPT_MATCH] });
  const fallbackTab =
    tabs.find((tab) => tab.id && tab.id !== grammarTabId && tab.active) ||
    tabs.find((tab) => tab.id && tab.id !== grammarTabId);

  if (!fallbackTab?.id) {
    throw new Error("No main ChatGPT tab is available for insertion.");
  }

  await setMainTabId(fallbackTab.id);
  return fallbackTab;
}

async function insertOutputIntoMainInput(text) {
  const mainTab = await resolveMainChatTabHeuristically();
  if (!mainTab?.id) {
    throw new Error("Main ChatGPT tab not found.");
  }

  await ensureDeskBridge(mainTab.id);

  const response = await chrome.tabs.sendMessage(mainTab.id, {
    type: "DESK_INSERT_MAIN_COMPOSER_TEXT",
    text,
    mode: "append"
  });

  return {
    mainTab,
    response
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "DESK_REQUEST_ACTIVE_SELECTION" || message.type === "DESK_REQUEST_ACTIVE_PAGE_TEXT") {
    (async () => {
      try {
        const relayType =
          message.type === "DESK_REQUEST_ACTIVE_SELECTION"
            ? "DESK_GET_PAGE_SELECTION"
            : "DESK_GET_PAGE_FALLBACK_TEXT";

        const response = await relayToActiveTab(relayType);
        sendResponse(response || { ok: false, error: "No response from content script." });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === "DESK_GET_GRAMMAR_STATUS") {
    (async () => {
      try {
        const grammar = await getGrammarStatus();
        sendResponse({ ok: true, grammar });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === "DESK_OPEN_GRAMMAR_TAB") {
    (async () => {
      try {
        const result = await openOrReuseGrammarTab();
        sendResponse({
          ok: true,
          grammar: {
            status: "Ready",
            tabId: result.tab.id,
            created: result.created
          }
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === "DESK_FOCUS_GRAMMAR_TAB") {
    (async () => {
      try {
        const tab = await focusGrammarTab();
        sendResponse({
          ok: true,
          grammar: {
            status: "Ready",
            tabId: tab.id
          }
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === "DESK_RUN_GRAMMAR") {
    (async () => {
      try {
        const text = String(message.text || "").trim();
        if (!text) {
          sendResponse({ ok: false, error: "No text provided." });
          return;
        }

        const result = await runGrammar(text);
        const grammar = await getGrammarStatus();

        sendResponse({
          ok: result.response?.ok === true,
          text: result.response?.text || "",
          error: result.response?.error || null,
          grammar
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }

  if (message.type === "DESK_INSERT_OUTPUT_INTO_MAIN_INPUT") {
    (async () => {
      try {
        const text = String(message.text || "");
        if (!text.trim()) {
          sendResponse({ ok: false, error: "No text provided." });
          return;
        }

        const result = await insertOutputIntoMainInput(text);
        sendResponse({
          ok: result.response?.ok === true,
          error: result.response?.error || null,
          mainTab: {
            id: result.mainTab.id,
            title: result.mainTab.title || "",
            heuristic: "last-active-non-helper-chatgpt-tab"
          }
        });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || String(error) });
      }
    })();
    return true;
  }
});
`;

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

async function copyFileSafe(from, to) {
  await ensureDir(path.dirname(to));
  await fs.copyFile(from, to);
}

async function checkFileExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing source file: ${path.relative(repoRoot, filePath)}`);
  }
}

async function copyDeskIcons() {
  await ensureDir(deskIconBuildDir);
  for (const size of deskRequiredIconSizes) {
    await checkFileExists(path.join(deskIconPackDir, `icon${size}.png`));
  }
  for (const size of deskIconSizes) {
    const from = path.join(deskIconPackDir, `icon${size}.png`);
    const to = path.join(deskIconBuildDir, `icon${size}.png`);
    try {
      await fs.access(from);
    } catch {
      continue;
    }
    await copyFileSafe(from, to);
    console.log(`Copied: ${path.relative(repoRoot, to)}`);
  }
}

async function writeManifest() {
  const manifestPath = path.join(buildDir, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function writeServiceWorker() {
  const swPath = path.join(buildDir, "service-worker.js");
  await fs.writeFile(swPath, serviceWorkerSource.trimStart(), "utf8");
}

async function build() {
  console.log("Building Desk extension...");
  console.log(`UI source: ${path.relative(repoRoot, uiSourceDir)}`);
  console.log(`Output: ${path.relative(repoRoot, buildDir)}`);

  for (const fileName of uiSourceFiles) {
    await checkFileExists(path.join(uiSourceDir, fileName));
  }
  await checkFileExists(contentSourceFile);

  await removeDir(buildDir);
  await ensureDir(buildUiDeskDir);
  await ensureDir(buildContentDir);
  await ensureDir(deskIconBuildDir);

  for (const fileName of uiSourceFiles) {
    const from = path.join(uiSourceDir, fileName);
    const to = path.join(buildUiDeskDir, fileName);
    await copyFileSafe(from, to);
    console.log(`Copied: ${path.relative(repoRoot, to)}`);
  }

  await copyFileSafe(contentSourceFile, contentBuildFile);
  console.log(`Copied: ${path.relative(repoRoot, contentBuildFile)}`);
  await copyDeskIcons();

  await writeManifest();
  await writeServiceWorker();

  console.log("Done.");
}

build().catch((error) => {
  console.error("Desk build failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
