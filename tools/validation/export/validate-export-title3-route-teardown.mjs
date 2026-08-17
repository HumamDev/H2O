#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BASE = "923da37e4c6c8b098a410a21abac735047ea2fad";
const EXPORT_REL = "src-runtime-base/0E1a.⬛️📀 Export Chat 📀.js";
const INTERFACE_REL = "src-runtime-base/9A1a.🟫🖥️ Interface Kernel ⚙️🖥️.js";
const exportSource = fs.readFileSync(path.join(ROOT, EXPORT_REL), "utf8");
const interfaceSource = fs.readFileSync(path.join(ROOT, INTERFACE_REL), "utf8");
const baseSource = execFileSync("git", ["-C", ROOT, "show", `${BASE}:${EXPORT_REL}`], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
});

const results = [];
function check(name, fn) {
  fn();
  results.push(name);
  process.stdout.write(`ok ${results.length} - ${name}\n`);
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function extractFunction(source, name) {
  const needle = `function ${name}(`;
  const start = source.indexOf(needle);
  assert.ok(start >= 0, `function ${name} not found`);
  assert.equal(source.indexOf(needle, start + 1), -1, `function ${name} is ambiguous`);
  const closeRe = /\n(\s*)\}/g;
  closeRe.lastIndex = start;
  let match;
  while ((match = closeRe.exec(source)) !== null) {
    const candidate = source.slice(start, match.index + match[0].length);
    try {
      new vm.Script(`(${candidate})`);
      return candidate;
    } catch {
      // Widen to the next syntactically valid closing brace.
    }
  }
  throw new Error(`could not delimit ${name}`);
}

const binder = extractFunction(exportSource, "CORE_bindPromptExportPlacement");
const boot = extractFunction(exportSource, "CORE_EC_boot");
const routeSync = extractFunction(exportSource, "CORE_syncActiveNavigationRoute");

check("dormant placement binder has no call site", () => {
  assert.equal(count(exportSource, "CORE_bindPromptExportPlacement("), 1);
  assert.match(exportSource, /function CORE_bindPromptExportPlacement\(\)/u);
  assert.doesNotMatch(boot, /CORE_bindPromptExportPlacement/u);
});
check("dead xpch prompt-button placement remains inside the dormant binder", () => {
  assert.match(binder, /UI_ensurePromptExportButton\(\)/u);
  assert.equal(count(exportSource, "UI_ensurePromptExportButton()"),
    count(baseSource, "UI_ensurePromptExportButton()"));
});
check("active listener count is unchanged", () => {
  assert.equal(count(exportSource, "UTIL_on("), count(baseSource, "UTIL_on("));
  assert.equal(count(exportSource, "EV_.NAVIGATE"), count(baseSource, "EV_.NAVIGATE"));
  assert.equal(count(exportSource, "'popstate'"), count(baseSource, "'popstate'"));
});
check("no History patch was added to Export Chat", () => {
  assert.equal(count(exportSource, "history.pushState ="), count(baseSource, "history.pushState ="));
  assert.equal(count(exportSource, "history.replaceState ="), count(baseSource, "history.replaceState ="));
});
check("no MutationObserver was added", () => {
  assert.equal(count(exportSource, "new MutationObserver"), count(baseSource, "new MutationObserver"));
});
check("no polling or per-frame route authority was added", () => {
  assert.equal(count(exportSource, "setInterval("), count(baseSource, "setInterval("));
  assert.doesNotMatch(routeSync, /requestAnimationFrame|setTimeout|setInterval/u);
});
check("active canonical navigation and popstate reuse the route-sync callback", () => {
  assert.match(boot, /UTIL_on\(window, EV_\.NAVIGATE, CORE_syncActiveNavigationRoute\);/u);
  assert.match(boot, /UTIL_on\(window, 'popstate', CORE_syncActiveNavigationRoute\);/u);
});
check("legacy navigation still bridges synchronously to canonical navigation", () => {
  assert.match(boot,
    /const onLegacyNavigate = \(e\) => \{ UTIL_emit\(EV_\.NAVIGATE, e\?\.detail\); \};/u);
  assert.match(boot, /UTIL_on\(window, MIG_\.LEG_NAVIGATE, onLegacyNavigate\);/u);
});
check("existing Interface Kernel surfaces pushState and replaceState as ho:navigate", () => {
  assert.match(interfaceSource, /EVENT: 'ho:navigate'/u);
  assert.match(interfaceSource, /history\.pushState = function\(\.\.\.args\)/u);
  assert.match(interfaceSource, /history\.replaceState = function\(\.\.\.args\)/u);
  assert.match(interfaceSource, /window\.dispatchEvent\(new Event\(api\.nav\.EVENT\)\)/u);
});
check("off-chat route-sync order is menu hide then established teardown", () => {
  assert.match(routeSync,
    /if \(!VIEW_shouldShow\(\)\) \{\s*UI_hideMenu\(\);\s*ACT_clearSelectionsAndExit\(\);\s*return;/u);
  assert.match(routeSync, /UI_scheduleMenuReposition\(\);/u);
});
check("Prompt Manager-owned export selector is byte-identical", () => {
  const selector = `[data-cgxui-owner="prmn"][data-cgxui="prmn-export-btn"]`;
  assert.equal(count(exportSource, selector), count(baseSource, selector));
});
check("dormant Input-Dock listener is byte-identical", () => {
  const listener = "UTIL_on(W, 'evt:h2o:inputdock:ready', scheduleEnsure, { passive: true });";
  assert.equal(count(exportSource, listener), 1);
  assert.equal(count(exportSource, listener), count(baseSource, listener));
});
check("route regex remains byte-identical", () => {
  const line = "CHAT_PATH_RE: /^(?:\\/c\\/|\\/g\\/[^/]+\\/c\\/)/i,";
  assert.equal(count(exportSource, line), 1);
  assert.equal(count(exportSource, line), count(baseSource, line));
});
check("existing user activation path remains wired", () => {
  assert.match(boot, /UTIL_on\(window, EV_\.EXPORT_RUN/u);
  assert.match(exportSource, /function ACT_runExternalExport\(/u);
});

class FakeClassList {
  constructor(...names) { this.names = new Set(names); }
  add(...names) { names.forEach((name) => this.names.add(name)); }
  remove(...names) { names.forEach((name) => this.names.delete(name)); }
  contains(name) { return this.names.has(name); }
  toggle(name, force) {
    const active = force === undefined ? !this.names.has(name) : !!force;
    if (active) this.names.add(name); else this.names.delete(name);
    return active;
  }
}

function element(...classes) {
  return { classList: new FakeClassList(...classes), style: { display: "flex", opacity: "1" },
    isConnected: true };
}

const CLS_ = Object.freeze({
  STATE_ACTIVE: "xpch-active",
  STATE_OPEN: "xpch-open",
  PROMPT_EXPORT_ACTIVE: "xpch-prompt-export-active",
});
const promptExportBtn = element(CLS_.PROMPT_EXPORT_ACTIVE);
const W = { location: { pathname: "/c/chat-one" } };
const D = { querySelector: () => promptExportBtn };
const counters = { menuWatcherClears: 0, menuRepositions: 0 };
const R = Object.create(null);
const sandbox = {
  W, D, R, CLS_,
  VIEW_: { CHAT_PATH_RE: /^(?:\/c\/|\/g\/[^/]+\/c\/)/i },
  SEL_: { MINIMAP: () => null, MINIMAP_TOGGLE: () => null,
    MINIMAP_BTN_SEL: () => "[data-id]", PROMPT_EXPORT_BTN: () => "prompt-export" },
  VIEW_isSearchPanelOpen: () => false,
  UI_clearMenuAnchorWatchers: () => { counters.menuWatcherClears += 1; },
  UI_scheduleMenuReposition: () => { counters.menuRepositions += 1; },
};
vm.createContext(sandbox);
vm.runInContext([
  extractFunction(exportSource, "VIEW_isChatPath"),
  extractFunction(exportSource, "VIEW_shouldShow"),
  extractFunction(exportSource, "UI_hideDlMark"),
  extractFunction(exportSource, "UI_positionAllMarks"),
  extractFunction(exportSource, "UI_positionSelectAllBtn"),
  extractFunction(exportSource, "UI_setPromptExportActive"),
  extractFunction(exportSource, "UI_hideMenu"),
  extractFunction(exportSource, "ACT_clearSelectionsAndExit"),
  routeSync,
].join("\n\n"), sandbox, { filename: EXPORT_REL });

function resetActive(pathname = "/c/chat-one") {
  W.location.pathname = pathname;
  R.isDownloadMode = true;
  R.selectedIds = new Set(["answer-a", "answer-b"]);
  R.allSelected = true;
  R.menuEl = element(CLS_.STATE_OPEN);
  R.menuAnchorBtn = element();
  R.selectAllBtn = element(CLS_.STATE_ACTIVE);
  R.dlLayer = element(CLS_.STATE_ACTIVE);
  R.dlMarkById = new Map([
    ["answer-a", element(CLS_.STATE_ACTIVE)],
    ["answer-b", element(CLS_.STATE_ACTIVE)],
  ]);
  R.wrapById = new Map();
  R.promptExportBtn = promptExportBtn;
  promptExportBtn.classList.add(CLS_.PROMPT_EXPORT_ACTIVE);
}

function assertInactive() {
  assert.equal(R.isDownloadMode, false);
  assert.equal(R.selectedIds.size, 0);
  assert.equal(R.allSelected, false);
  assert.equal(R.menuEl.classList.contains(CLS_.STATE_OPEN), false);
  assert.equal(R.selectAllBtn.classList.contains(CLS_.STATE_ACTIVE), false);
  assert.equal(R.selectAllBtn.style.display, "none");
  for (const mark of R.dlMarkById.values()) {
    assert.equal(mark.style.display, "none");
    assert.equal(mark.style.opacity, "0");
  }
  assert.equal(R.dlLayer.classList.contains(CLS_.STATE_ACTIVE), false);
  assert.equal(promptExportBtn.classList.contains(CLS_.PROMPT_EXPORT_ACTIVE), false);
}

for (const [pathname, eligible] of [
  ["/c/chat-one", true],
  ["/g/project-one/c/chat-two", true],
  ["/g/project-one/project", false],
  ["/g/project-one", false],
  ["/", false],
  ["/search", false],
]) {
  check(`${pathname} eligibility is ${eligible}`, () => {
    W.location.pathname = pathname;
    assert.equal(sandbox.VIEW_shouldShow(), eligible);
  });
}

check("eligible chat navigation preserves active mode and schedules menu reposition", () => {
  resetActive("/c/chat-one");
  const before = counters.menuRepositions;
  sandbox.CORE_syncActiveNavigationRoute();
  assert.equal(counters.menuRepositions, before + 1);
  assert.equal(R.isDownloadMode, true);
  assert.equal(R.selectedIds.size, 2);
  assert.equal(R.menuEl.classList.contains(CLS_.STATE_OPEN), true);
});
check("active chat to Project synchronously clears all route-only Export state", () => {
  resetActive();
  W.location.pathname = "/g/project-one/project";
  sandbox.CORE_syncActiveNavigationRoute();
  assertInactive();
});
check("menu teardown clears its active anchor watchers", () => {
  assert.equal(R.menuAnchorBtn, null);
  assert.ok(counters.menuWatcherClears > 0);
});
check("repeated Project reconciliation is idempotent", () => {
  const stable = JSON.stringify({ mode: R.isDownloadMode, selected: [...R.selectedIds],
    all: R.allSelected, menuOpen: R.menuEl.classList.contains(CLS_.STATE_OPEN) });
  sandbox.CORE_syncActiveNavigationRoute();
  sandbox.CORE_syncActiveNavigationRoute();
  assertInactive();
  assert.equal(JSON.stringify({ mode: R.isDownloadMode, selected: [...R.selectedIds],
    all: R.allSelected, menuOpen: R.menuEl.classList.contains(CLS_.STATE_OPEN) }), stable);
});
check("Project to chat restores eligibility without resurrecting session state", () => {
  W.location.pathname = "/g/project-one/c/chat-two";
  sandbox.CORE_syncActiveNavigationRoute();
  assert.equal(sandbox.VIEW_shouldShow(), true);
  assertInactive();
});
check("direct Project boot state remains inactive", () => {
  resetActive("/g/project-one/project");
  R.isDownloadMode = false;
  R.selectedIds.clear();
  R.allSelected = false;
  R.menuEl.classList.remove(CLS_.STATE_OPEN);
  R.selectAllBtn.classList.remove(CLS_.STATE_ACTIVE);
  R.dlLayer.classList.remove(CLS_.STATE_ACTIVE);
  promptExportBtn.classList.remove(CLS_.PROMPT_EXPORT_ACTIVE);
  sandbox.CORE_syncActiveNavigationRoute();
  assertInactive();
});

function makeNavigationModel() {
  const handlers = new Map();
  const on = (type, handler) => handlers.set(type, [...(handlers.get(type) || []), handler]);
  const emit = (type) => { for (const handler of handlers.get(type) || []) handler(); };
  on("evt:h2o:navigate", () => sandbox.CORE_syncActiveNavigationRoute());
  on("ho:navigate", () => emit("evt:h2o:navigate"));
  on("popstate", () => sandbox.CORE_syncActiveNavigationRoute());
  return {
    pushState(pathname) { W.location.pathname = pathname; emit("ho:navigate"); },
    replaceState(pathname) { W.location.pathname = pathname; emit("ho:navigate"); },
    popstate(pathname) { W.location.pathname = pathname; emit("popstate"); },
  };
}
const navigation = makeNavigationModel();
for (const [name, navigate] of [
  ["pushState", (pathname) => navigation.pushState(pathname)],
  ["replaceState", (pathname) => navigation.replaceState(pathname)],
  ["popstate", (pathname) => navigation.popstate(pathname)],
]) {
  check(`${name} existing event path tears down active Export state`, () => {
    resetActive();
    navigate("/g/project-one/project");
    assertInactive();
  });
}

check("product diff contains no backend request capability", () => {
  const diff = execFileSync("git", ["-C", ROOT, "diff", BASE, "--", EXPORT_REL], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  assert.doesNotMatch(diff, /backend-api|api\/auth\/session|\bfetch\s*\(/u);
});

process.stdout.write(`${JSON.stringify({
  ok: true,
  validator: "tools/validation/export/validate-export-title3-route-teardown.mjs",
  checks: results.length,
  binderActivated: false,
  newNavigationListeners: 0,
  newHistoryPatches: 0,
  newMutationObservers: 0,
  backendRequestsIssued: 0,
  liveAcceptance: "DEFERRED_BACKEND_GOVERNANCE",
})}\n`);
