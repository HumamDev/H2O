#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  formatNativeDisplayTitle,
  isRTL,
  sanitizeNativeTitle,
} from "../../../packages/title-contract/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const B0_REL = "src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js";
const B1_REL = "src-runtime-base/9B1a.🟤🔖 Tab Title 🔖.js";
const B2_REL = "src-runtime-base/9B2a.🟤🏷️ Sidebar Title Renderer 🏷️.js";
const C1_REL = "src-runtime-base/9C1a.🟤📌 Title Under Input bar 📌.js";
const SELF_REL = "tools/validation/title-interface/validate-title-stage1e-convergence-v1.mjs";
const STAGE1C_REL = "tools/validation/title-interface/validate-title-stage1c-formatter-parity.mjs";
const ADR_REL = "docs/decisions/ADR-0011-title-management-contract.md";
const DEV_ORDER_REL = "config/dev-order.tsv";
const LOADER_DEPS_REL = "config/loader-deps.json";
const STAGE1EB_SCOPE_OPTION = "--stage1eb-sidebar-scope";
const F0D_REL = "src-runtime-base/0F0d.⬛️🧬 Library Index Core 🧬.js";
const F1C_REL = "src-runtime-base/0F1c.⬛️🗂️ Library Index 🧮🗂️.js";
const F2A_REL = "src-runtime-base/0F2a.⬛️🗂️ Projects 🗂️.js";
const F3A_REL = "src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js";
const F6A_REL = "src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js";
const D3A_REL = "src-runtime-base/0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️.js";
const FLAG_KEY = "title.threeSurfaceConvergenceV1";
const OVERRIDE_KEY = "__H2O_TITLE_THREE_SURFACE_CONVERGENCE_V1__";
const AUTHORIZED = new Set([B0_REL, B1_REL, C1_REL, SELF_REL, STAGE1C_REL, ADR_REL]);
const AUTHORIZED_TRACKED = new Set(AUTHORIZED);
const STAGE1EB_TRACKED = new Set([DEV_ORDER_REL, LOADER_DEPS_REL, SELF_REL, ADR_REL]);
const STAGE1EB_COMMITTED = new Set([...STAGE1EB_TRACKED, B2_REL]);
const EXPECTED_IDENTITY = Object.freeze({
  schemaVersion: 2,
  bridgeVersion: "3",
  generatorVersion: "3",
  sourceExportCount: 39,
  publicExportCount: 29,
  privilegedExportCount: 8,
  sourceOnlyExportCount: 2,
  sourceSha256: "57f3fe783b5253d07dafcd7ec4c89b75602337b86d83033ed52fbcc104097b0d",
  publicSurfaceDigest: "d525371c9e82cea7e59351a429120f049b52ca6c3b81ff72eeb599460bc755d3",
});

const b0Source = fs.readFileSync(path.join(ROOT, B0_REL), "utf8");
const b1Source = fs.readFileSync(path.join(ROOT, B1_REL), "utf8");
const c1Source = fs.readFileSync(path.join(ROOT, C1_REL), "utf8");
const b2Source = fs.readFileSync(path.join(ROOT, B2_REL), "utf8");
const readerSources = Object.freeze({
  [F0D_REL]: fs.readFileSync(path.join(ROOT, F0D_REL), "utf8"),
  [F1C_REL]: fs.readFileSync(path.join(ROOT, F1C_REL), "utf8"),
  [F2A_REL]: fs.readFileSync(path.join(ROOT, F2A_REL), "utf8"),
  [F3A_REL]: fs.readFileSync(path.join(ROOT, F3A_REL), "utf8"),
  [F6A_REL]: fs.readFileSync(path.join(ROOT, F6A_REL), "utf8"),
  [D3A_REL]: fs.readFileSync(path.join(ROOT, D3A_REL), "utf8"),
});

const scopeTests = [];
const scenarios = [];
const structuralAssertions = [];

function run(command, args) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function splitNul(value) {
  return String(value || "").split("\0").filter(Boolean);
}

function sameSet(actual, expected) {
  return actual.size === expected.size && [...actual].every((value) => expected.has(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function functionSlice(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start + 1);
  assert(start >= 0, `missing function ${name}`);
  assert(end > start, `missing function boundary ${nextName}`);
  return source.slice(start, end);
}

function sourceSlice(source, startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert(start >= 0, `missing source slice start: ${startText}`);
  assert(end > start, `missing source slice end: ${endText}`);
  return source.slice(start, end);
}

const readerSlices = Object.freeze({
  f0dEnsureString: functionSlice(readerSources[F0D_REL], "ensureString", "trimString"),
  f0dNormText: functionSlice(readerSources[F0D_REL], "normText", "slug"),
  f0dChooseBetterTitle: functionSlice(readerSources[F0D_REL], "chooseBetterTitle", "higherConfidence"),
  f1cNative: functionSlice(
    readerSources[F1C_REL],
    "extractNativeRecentTitle",
    "collectNativeRecentDomRows",
  ),
  f2aNative: functionSlice(
    readerSources[F2A_REL],
    "DOM_collectNativeProjectRows",
    "DOM_getNativeProjectRows",
  ),
  f3aNative: functionSlice(
    readerSources[F3A_REL],
    "DOM_extractSidebarChatTitle",
    "DOM_getChatTitleFromSidebar",
  ),
  f3aRendered: functionSlice(
    readerSources[F3A_REL],
    "DOM_menuContextFromAnchor",
    "DOM_anchorFromNearbyContainer",
  ),
  f6aRendered: functionSlice(
    readerSources[F6A_REL],
    "findChatTitleInSidebar",
    "getArchiveBoot",
  ),
  f6aNormText: functionSlice(readerSources[F6A_REL], "normText", "normalizeLabel"),
  f6aIds: functionSlice(readerSources[F6A_REL], "normalizeChatId", "toChatId"),
  f6aSelectors: sourceSlice(readerSources[F6A_REL], "const SEL = {", "const state ="),
  f6aSetRowText: functionSlice(readerSources[F6A_REL], "setRowText", "injectIcon"),
  d3aRendered: functionSlice(
    readerSources[D3A_REL],
    "readSidebarConversationTitle",
    "readConversationHistoryCacheTitle",
  ),
});

const EXPECTED_READER_SLICE_SHA256 = Object.freeze({
  f0dEnsureString: "e942d27c92fa4f14529d9724d3b3c528226b2551fe515a6719331a4474e04314",
  f0dNormText: "388c828537e4bde56303605ed38be3cc3162b420aadd4ec410205413de899b9b",
  f0dChooseBetterTitle: "6a29db4c4a853808f4b15e1e7b68cce394cc2ce74fe2d6a2a81a1b7609ad2b8b",
  f1cNative: "4d4dcadf8c1eebdcd51303d6e8137f0a5efa8255f257767b9f2ca68da8f30076",
  f2aNative: "2f3a124058020cdd85bffc2f999934ed37a5a76e8d01ee1b126ec8d83d21d30f",
  f3aNative: "d07d61c2f336d095c7d186ff20037b23775f41435c197852565fcf15a7704faa",
  f3aRendered: "99cd7c3b33fedc57469d94448cf14ce7397f84d5049f1176889aebd3409abffb",
  f6aRendered: "ab35def2ca439cb85fc49a1d874edb36a589b61a5c72d9bf61057d5eb9445f71",
  f6aNormText: "ec3bac14e827bd38d32c400e20dfaed42a8c346a679fd57f91bce821ededd3aa",
  f6aIds: "045d6232b1d72a4d4c87d5e911dfd4fe708f3b1f2cfee494ff7540bf262efd4f",
  f6aSelectors: "831ec3b4fae9ea0a2835826c6a5d7d86aef6cddad9b7fad8a38fa89505111cdf",
  f6aSetRowText: "083139b85e3119f54fcc3d8292c52a938db39a40c5a8caec876ed63e7d826254",
  d3aRendered: "dcacf7526af9a15f75e9dcd7caec1562262bbf5eb6652e3f1b1ab6aeb3f7837d",
});

const EXPECTED_READER_BLOBS = Object.freeze({
  [F0D_REL]: "278a5ef740edccb33b827fe1b47b97d5a531d86c",
  [F6A_REL]: "f557c45762ac58f581f2862c6c97b771c3ce8967",
});

function classifyScope({ modifiedTracked, staged, untracked, committedHeadPaths = [] }) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const headPaths = new Set(committedHeadPaths);
  assert.equal(stagedPaths.size, 0, `staged paths forbidden: ${[...stagedPaths].sort().join(", ")}`);
  if (modified.size === 0 && untrackedPaths.size === 0) {
    assert(
      sameSet(headPaths, AUTHORIZED),
      `committed-clean Stage 1E correction scope mismatch: ${JSON.stringify([...headPaths].sort())}`,
    );
    return "stage1e-corrections-committed-clean";
  }
  assert(
    sameSet(modified, AUTHORIZED_TRACKED),
    `tracked Stage 1E correction scope mismatch: ${JSON.stringify([...modified].sort())}`,
  );
  assert.equal(untrackedPaths.size, 0, "Stage 1E correction scope forbids untracked paths");
  return "stage1e-corrections-dirty";
}

function classifyStage1EBScope({ modifiedTracked, staged, untracked, committedHeadPaths = [] }) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const headPaths = new Set(committedHeadPaths);
  assert.equal(stagedPaths.size, 0, `staged paths forbidden: ${[...stagedPaths].sort().join(", ")}`);
  if (modified.size === 0 && untrackedPaths.size === 0) {
    assert(
      sameSet(headPaths, STAGE1EB_COMMITTED),
      `committed-clean Stage 1E-b scope mismatch: ${JSON.stringify([...headPaths].sort())}`,
    );
    return "stage1eb-sidebar-committed-clean";
  }
  assert(
    sameSet(modified, STAGE1EB_TRACKED),
    `tracked Stage 1E-b scope mismatch: ${JSON.stringify([...modified].sort())}`,
  );
  assert(
    sameSet(untrackedPaths, new Set([B2_REL])),
    `untracked Stage 1E-b scope mismatch: ${JSON.stringify([...untrackedPaths].sort())}`,
  );
  return "stage1eb-sidebar-dirty";
}

function requestedScopeMode(argv) {
  assert(
    argv.length === 0 || (argv.length === 1 && argv[0] === STAGE1EB_SCOPE_OPTION),
    `unknown or conflicting Stage 1E validator option: ${argv.join(" ")}`,
  );
  return argv[0] === STAGE1EB_SCOPE_OPTION ? "stage1eb-sidebar" : "stage1ea";
}

function currentScope() {
  return {
    modifiedTracked: splitNul(run("git", ["diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", "HEAD", "--"])),
    staged: splitNul(run("git", ["diff", "--cached", "--name-only", "-z", "--"])),
    untracked: splitNul(run("git", ["ls-files", "-z", "--others", "--exclude-standard", "--"])),
    committedHeadPaths: splitNul(run("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "HEAD^", "HEAD", "--"])),
  };
}

function scopeTest(name, callback) {
  callback();
  scopeTests.push(name);
  console.log(`ok scope ${scopeTests.length} - ${name}`);
}

async function scenario(name, callback) {
  await callback();
  scenarios.push(name);
  console.log(`ok ${scenarios.length} - ${name}`);
}

function structuralTest(name, callback) {
  callback();
  structuralAssertions.push(name);
  console.log(`ok structural ${structuralAssertions.length} - ${name}`);
}

const requestedMode = requestedScopeMode(process.argv.slice(2));
const actualScope = currentScope();
const scopeMode = requestedMode === "stage1eb-sidebar"
  ? classifyStage1EBScope(actualScope)
  : classifyScope(actualScope);

scopeTest("exact authorized six-file scope is accepted", () => {
  assert.equal(classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [],
    untracked: [],
  }), "stage1e-corrections-dirty");
});
scopeTest("exact committed-clean correction scope is accepted", () => {
  assert.equal(classifyScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: [...AUTHORIZED],
  }), "stage1e-corrections-committed-clean");
});
scopeTest("seventh tracked path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "foreign.js"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("seventh untracked path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [],
    untracked: ["foreign.tmp"],
  }), /forbids untracked paths/u);
});
scopeTest("staged path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [B0_REL],
    untracked: [],
  }), /staged paths forbidden/u);
});
scopeTest("config change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "config/dev-order.tsv"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("disabled 9D1a change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("generated output change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "apps/dev-server/alias/9B0a._Chat_Title_State_.js"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("publication-safety change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "tools/publish/canonical-write-guard.mjs"],
    staged: [],
    untracked: [],
  }), /tracked Stage 1E correction scope mismatch/u);
});
scopeTest("exact Stage 1E-b dirty scope is accepted", () => {
  assert.equal(classifyStage1EBScope({
    modifiedTracked: [...STAGE1EB_TRACKED],
    staged: [],
    untracked: [B2_REL],
  }), "stage1eb-sidebar-dirty");
});
scopeTest("exact Stage 1E-b committed-clean scope is accepted", () => {
  assert.equal(classifyStage1EBScope({
    modifiedTracked: [],
    staged: [],
    untracked: [],
    committedHeadPaths: [...STAGE1EB_COMMITTED],
  }), "stage1eb-sidebar-committed-clean");
});
scopeTest("Stage 1E-b rejects staged and every class of sixth tracked path", () => {
  for (const foreign of [
    B0_REL,
    "config/dev-order-foreign.tsv",
    "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js",
    "apps/dev-server/alias/9B2a._Sidebar_Title_Renderer_.js",
    "tools/publish/canonical-write-guard.mjs",
  ]) {
    assert.throws(() => classifyStage1EBScope({
      modifiedTracked: [...STAGE1EB_TRACKED, foreign],
      staged: [],
      untracked: [B2_REL],
    }), /tracked Stage 1E-b scope mismatch/u);
  }
  assert.throws(() => classifyStage1EBScope({
    modifiedTracked: [...STAGE1EB_TRACKED],
    staged: [DEV_ORDER_REL],
    untracked: [B2_REL],
  }), /staged paths forbidden/u);
});
scopeTest("Stage 1E-b rejects a second untracked path", () => {
  assert.throws(() => classifyStage1EBScope({
    modifiedTracked: [...STAGE1EB_TRACKED],
    staged: [],
    untracked: [B2_REL, "foreign.js"],
  }), /untracked Stage 1E-b scope mismatch/u);
});
scopeTest("Stage 1E-b CLI fails closed for unknown or conflicting options", () => {
  assert.throws(() => requestedScopeMode(["--unknown"]), /unknown or conflicting/u);
  assert.throws(
    () => requestedScopeMode([STAGE1EB_SCOPE_OPTION, STAGE1EB_SCOPE_OPTION]),
    /unknown or conflicting/u,
  );
});

function makeEventHub() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      if (typeof handler !== "function") return;
      const set = listeners.get(name) || new Set();
      set.add(handler);
      listeners.set(name, set);
    },
    removeEventListener(name, handler) {
      listeners.get(name)?.delete(handler);
    },
    dispatchEvent(event) {
      for (const handler of [...(listeners.get(event?.type) || [])]) handler.call(this, event);
      return true;
    },
    count() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
    countFor(name) {
      return listeners.get(name)?.size || 0;
    },
  };
}

function makeEffects() {
  return {
    fetches: [],
    storageOps: [],
    dispatched: [],
    timers: new Map(),
    observers: new Set(),
    abortControllers: 0,
    documentTitleAssignments: 0,
    detachedDomAccesses: [],
    resetTransient() {
      this.fetches.length = 0;
      this.storageOps.length = 0;
      this.dispatched.length = 0;
    },
  };
}

function makeStorage(effects) {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      const k = String(key);
      const v = String(value);
      values.set(k, v);
      effects.storageOps.push({ type: "set", key: k, value: v });
    },
    removeItem(key) {
      const k = String(key);
      values.delete(k);
      effects.storageOps.push({ type: "remove", key: k });
    },
    snapshot() {
      return JSON.stringify([...values.entries()].sort(([left], [right]) => left.localeCompare(right)));
    },
  };
}

function makeTimers(effects) {
  let nextId = 1;
  const set = (kind, callback, delay) => {
    const id = nextId++;
    effects.timers.set(id, { kind, callback, delay });
    return id;
  };
  return {
    setTimeout(callback, delay) {
      return set("timeout", callback, delay);
    },
    clearTimeout(id) {
      effects.timers.delete(id);
    },
    setInterval(callback, delay) {
      return set("interval", callback, delay);
    },
    clearInterval(id) {
      effects.timers.delete(id);
    },
    requestAnimationFrame(callback) {
      return set("frame", callback, 0);
    },
    cancelAnimationFrame(id) {
      effects.timers.delete(id);
    },
  };
}

function response({ ok = true, status = 200, body = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
    clone() {
      return {
        async json() {
          return body;
        },
      };
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(count = 5) {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

function installContractBridge(context, sandbox, kind) {
  if (kind === "absent") return;
  sandbox.__contractSanitize = sanitizeNativeTitle;
  sandbox.__contractFormat = formatNativeDisplayTitle;
  sandbox.__contractIsRTL = isRTL;
  sandbox.__contractIdentity = {
    ...EXPECTED_IDENTITY,
    ...(kind === "invalid" ? { bridgeVersion: "stale" } : {}),
  };
  vm.runInContext(`
    {
      const identity = Object.freeze({ ...globalThis.__contractIdentity });
      const contract = {
        identity,
        isRTL(value) {
          return globalThis.__contractIsRTL(value);
        },
        sanitizeNativeTitle(value) {
          return globalThis.__contractSanitize(value);
        },
        formatNativeDisplayTitle(baseTitle, emoji) {
          const result = globalThis.__contractFormat(baseTitle, emoji);
          return Object.freeze({ text: String(result.text), dir: String(result.dir) });
        },
      };
      Object.freeze(contract);
      Object.defineProperty(H2O, "TitleContract", {
        value: contract,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    }
  `, context);
}

function instrumentB0(source) {
  const anchor = "\n  boot();\n";
  const setTitleAnchor = "  function setTitle(payload, options) {\n";
  assert.equal(source.split(anchor).length - 1, 1, "9B0a boot anchor drifted");
  assert.equal(source.split(setTitleAnchor).length - 1, 1, "9B0a setTitle anchor drifted");
  return source.replace(setTitleAnchor, `${setTitleAnchor}    W.__H2O_STAGE1E_SET_TITLE_CALLS__ = Number(W.__H2O_STAGE1E_SET_TITLE_CALLS__ || 0) + 1;\n`)
    .replace(anchor, `
  W.__H2O_STAGE1E_B0_TEST__ = Object.freeze({
    displayFrom,
    legacyDisplayFrom,
    sanitizeNativeBaseTitle,
    splitNativeSubmission,
    readSidebarTitle,
    readLibraryTitle,
    detectTitles,
    resolveConvergenceStatus,
    currentRecord: () => ({ ...activeRecord }),
    recordFor: (chatId) => {
      const record = records.get(chatId);
      return record ? { ...record } : null;
    },
    currentRouteToken: () => routeToken,
    currentConvergence: () => ({ ...lastConvergenceStatus }),
    setTitleCallCount: () => Number(W.__H2O_STAGE1E_SET_TITLE_CALLS__ || 0),
    activeRename: () => activeRenameOperation ? {
      operationId: activeRenameOperation.operationId,
      chatId: activeRenameOperation.chatId,
      routeToken: activeRenameOperation.routeToken,
    } : null,
    flagListenerInstalled: () => convergenceFlagListenerInstalled,
    destroy,
  });
  boot();
`);
}

function createB0Harness({ flag = false, bridge = "valid", documentTitle = "Initial base - ChatGPT" } = {}) {
  const effects = makeEffects();
  const sidebarDom = createMiniDom(effects);
  const storage = makeStorage(effects);
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const documentEvents = makeEventHub();
  const titleNode = {};
  let sidebarEntry = null;
  const libraryRows = new Map();
  let fetchHandler = async (url) => (
    url === "/api/auth/session"
      ? response({ body: { accessToken: "stage1e-token" } })
      : response()
  );

  class CustomEventMock {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  class MutationObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      effects.observers.add(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }
  class AbortControllerMock extends AbortController {
    constructor() {
      super();
      effects.abortControllers += 1;
    }
  }

  const location = {
    pathname: "/c/stage1e-chat-a",
    href: "https://chatgpt.com/c/stage1e-chat-a",
    origin: "https://chatgpt.com",
    search: "",
  };
  const document = {
    ...documentEvents,
    title: documentTitle,
    hidden: false,
    readyState: "complete",
    body: {},
    documentElement: {},
    querySelector(selector) {
      if (selector === "title") return titleNode;
      if (/^(?:aside|nav) /u.test(String(selector || ""))) return sidebarEntry;
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createTreeWalker(root, show, filter) {
      return sidebarDom.document.createTreeWalker(root, show, filter);
    },
  };
  const history = {
    pushState() {},
    replaceState() {},
  };
  const sandbox = {
    ...windowEvents,
    window: null,
    document,
    location,
    history,
    localStorage: storage,
    sessionStorage: makeStorage(effects),
    console: { log() {}, warn() {}, error() {} },
    CustomEvent: CustomEventMock,
    MutationObserver: MutationObserverMock,
    AbortController: AbortControllerMock,
    NodeFilter: {
      SHOW_TEXT: 4,
      FILTER_REJECT: 2,
      FILTER_ACCEPT: 1,
    },
    URL,
    URLSearchParams,
    encodeURIComponent,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    requestAnimationFrame: timers.requestAnimationFrame,
    cancelAnimationFrame: timers.cancelAnimationFrame,
  };
  sandbox.window = sandbox;
  sandbox.fetch = async (url, options = {}) => {
    effects.fetches.push({ url: String(url), options });
    return fetchHandler(String(url), options);
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(`
    globalThis.H2O = {
      flags: {
        get(name, fallback) {
          return name === ${JSON.stringify(FLAG_KEY)} ? globalThis.__stage1eFlagValue : fallback;
        },
        set(name, value) {
          if (name === ${JSON.stringify(FLAG_KEY)}) globalThis.__stage1eFlagValue = value;
          return true;
        },
      },
      util: {
        getChatId() {
          const match = String(globalThis.location.pathname || "").match(/\\/c\\/([a-z0-9_-]+)/i);
          return match ? match[1] : "";
        },
      },
    };
  `, context);
  sandbox.__stage1eFlagValue = flag;
  sandbox.H2O.LibraryIndex = {
    getChat(chatId) {
      return libraryRows.get(String(chatId || "")) || null;
    },
  };
  installContractBridge(context, sandbox, bridge);
  const instrumentedB0Source = instrumentB0(b0Source);
  new vm.Script(instrumentedB0Source, { filename: `${B0_REL}:stage1e-harness` }).runInContext(context);
  effects.resetTransient();

  return {
    sandbox,
    context,
    effects,
    storage,
    hook: sandbox.__H2O_STAGE1E_B0_TEST__,
    api: sandbox.H2O.ChatTitle,
    setFlag(value) {
      sandbox.__stage1eFlagValue = value;
    },
    setRuntimeFlag(value) {
      return sandbox.H2O.flags.set(FLAG_KEY, value);
    },
    setSessionOverride(value) {
      if (value === undefined) delete sandbox[OVERRIDE_KEY];
      else sandbox[OVERRIDE_KEY] = value;
    },
    setFetch(handler) {
      fetchHandler = handler;
    },
    setRoute(pathname) {
      location.pathname = pathname;
      location.href = `https://chatgpt.com${pathname}`;
    },
    setDocumentTitle(value) {
      document.title = value;
    },
    setSidebarReaderFixture(nativeText, displayText) {
      const anchor = sidebarDom.document.createElement("a");
      anchor.setAttribute("href", "/c/stage1e-chat-a");
      const layout = sidebarDom.document.createElement("div");
      const native = sidebarDom.document.createElement("span");
      native.className = "truncate";
      native.textContent = String(nativeText || "");
      const visual = sidebarDom.document.createElement("span");
      visual.setAttribute("data-h2o-owner", "title-sidebar-renderer");
      visual.setAttribute("data-h2o-title-role", "visual");
      visual.textContent = String(displayText || "");
      layout.append(native, visual);
      anchor.appendChild(layout);
      sidebarDom.document.body.appendChild(anchor);
      sidebarEntry = anchor;
      return {
        anchor,
        layout,
        native,
        visual,
        removeVisualOwnership() {
          visual.removeAttribute("data-h2o-owner");
        },
        restoreVisualOwnership() {
          visual.setAttribute("data-h2o-owner", "title-sidebar-renderer");
        },
        replaceNative(nextText) {
          native.remove();
          const replacement = sidebarDom.document.createElement("span");
          replacement.className = "truncate";
          replacement.textContent = String(nextText || "");
          layout.prepend(replacement);
          return replacement;
        },
      };
    },
    setLibraryTitle(chatId, title) {
      libraryRows.set(String(chatId || ""), { chatId: String(chatId || ""), title: String(title || "") });
    },
    clearLibraryTitle(chatId) {
      libraryRows.delete(String(chatId || ""));
    },
    flagListenerCount() {
      return windowEvents.countFor("h2o:flags:changed");
    },
    triggerObservers() {
      for (const observer of effects.observers) {
        if (observer.active) observer.callback([]);
      }
    },
    reinstall() {
      delete sandbox.__h2oChatTitleStateBooted_v1;
      delete sandbox.H2O.ChatTitle;
      new vm.Script(instrumentedB0Source, { filename: `${B0_REL}:stage1e-reinstall-harness` })
        .runInContext(context);
    },
  };
}

function createTabHarness(initialState) {
  const effects = makeEffects();
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const documentEvents = makeEventHub();
  let currentState = initialState;
  let subscriber = null;
  let activeSubscriptions = 0;
  let titleWritesMarked = 0;

  class HTMLElementMock {
    constructor() {
      this.hidden = false;
      this.isConnected = true;
    }
    getAttribute() {
      return "";
    }
    querySelector() {
      return null;
    }
    querySelectorAll() {
      return [];
    }
    getBoundingClientRect() {
      return { width: 100, height: 20 };
    }
  }
  class MutationObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      effects.observers.add(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }

  const documentElement = new HTMLElementMock();
  let documentTitle = "Native fallback - ChatGPT";
  const document = {
    ...documentEvents,
    readyState: "complete",
    documentElement,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  Object.defineProperty(document, "title", {
    configurable: true,
    enumerable: true,
    get() {
      return documentTitle;
    },
    set(value) {
      documentTitle = String(value);
      effects.documentTitleAssignments += 1;
    },
  });
  const history = {
    pushState() {},
    replaceState() {},
  };
  const sandbox = {
    ...windowEvents,
    window: null,
    document,
    location: {
      pathname: "/c/stage1e-chat-a",
      href: "https://chatgpt.com/c/stage1e-chat-a",
      origin: "https://chatgpt.com",
      search: "",
    },
    history,
    console: { log() {}, warn() {}, error() {} },
    MutationObserver: MutationObserverMock,
    HTMLElement: HTMLElementMock,
    Element: HTMLElementMock,
    URL,
    URLSearchParams,
    Date,
    Math,
    Object,
    Array,
    Set,
    Map,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    requestAnimationFrame: timers.requestAnimationFrame,
    cancelAnimationFrame: timers.cancelAnimationFrame,
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1" };
    },
  };
  sandbox.window = sandbox;
  sandbox.H2O = {
    ChatTitle: {
      subscribe(callback) {
        subscriber = callback;
        activeSubscriptions += 1;
        callback(currentState);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          activeSubscriptions -= 1;
          if (subscriber === callback) subscriber = null;
        };
      },
      getState() {
        return currentState;
      },
      markDocumentTitleWrite() {
        titleWritesMarked += 1;
      },
      refresh() {},
    },
  };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(b1Source, { filename: `${B1_REL}:stage1e-harness` });

  return {
    sandbox,
    effects,
    document,
    evaluate() {
      script.runInContext(context);
    },
    emit(nextState) {
      currentState = nextState;
      subscriber?.(nextState);
    },
    activeSubscriptions() {
      return activeSubscriptions;
    },
    titleWritesMarked() {
      return titleWritesMarked;
    },
    listenerCount() {
      return windowEvents.count() + documentEvents.count();
    },
    activeTimerCount() {
      return effects.timers.size;
    },
    activeObserverCount() {
      return [...effects.observers].filter((observer) => observer.active).length;
    },
    titleAssignments() {
      return effects.documentTitleAssignments;
    },
    triggerObservers() {
      for (const observer of effects.observers) {
        if (observer.active) observer.callback([]);
      }
    },
    runTimers(kind) {
      for (const [id, timer] of [...effects.timers]) {
        if (kind && timer.kind !== kind) continue;
        if (timer.kind !== "interval") effects.timers.delete(id);
        timer.callback();
      }
    },
  };
}

function makeDomEvent(type, properties = {}) {
  return {
    type,
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
      this.propagationStopped = true;
    },
    ...properties,
  };
}

function createMiniDom(effects) {
  const documentEvents = makeEventHub();
  const allElements = new Set();
  let documentRef = null;

  function selectorMatches(element, selector) {
    const value = String(selector || "").trim();
    if (!value) return false;
    if (value.includes(" ")) {
      const parts = value.split(/\s+/u);
      return selectorMatches(element, parts[parts.length - 1]);
    }
    const tagMatch = value.match(/^[a-z][a-z0-9-]*/iu);
    if (tagMatch && element.tagName.toLowerCase() !== tagMatch[0].toLowerCase()) return false;
    const idMatch = value.match(/#([a-z0-9_-]+)/iu);
    if (idMatch && element.id !== idMatch[1]) return false;
    for (const match of value.matchAll(/\.([a-z0-9_-]+)/giu)) {
      if (!element.classList.contains(match[1])) return false;
    }
    for (const match of value.matchAll(/\[([^\]=~*^$|]+)(?:([~*^$|]?=)["']?([^"'\]]*)["']?)?\]/gu)) {
      const name = match[1];
      const operator = match[2] || "";
      const expected = match[3] || "";
      const actual = element.getAttribute(name);
      if (actual === null) return false;
      if (operator === "=" && actual !== expected) return false;
      if (operator === "*=" && !actual.includes(expected)) return false;
      if (operator === "^=" && !actual.startsWith(expected)) return false;
      if (operator === "$=" && !actual.endsWith(expected)) return false;
      if (operator === "~=" && !actual.split(/\s+/u).includes(expected)) return false;
    }
    return true;
  }

  class ElementMock {
    constructor(tagName = "div") {
      this.nodeType = 1;
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.ownerDocument = null;
      this.dataset = {};
      this.style = {
        setProperty(name, value) {
          this[name] = String(value);
        },
        removeProperty(name) {
          delete this[name];
        },
      };
      this.className = "";
      this.id = "";
      this.hidden = false;
      this.disabled = false;
      this._value = "";
      this.type = "";
      this.title = "";
      this._text = "";
      this._connected = false;
      this._everConnected = false;
      this._attributes = new Map();
      this._events = makeEventHub();
      allElements.add(this);
    }
    get isConnected() {
      return this._connected;
    }
    _trackDetachedAccess(operation) {
      if (this._everConnected && !this._connected) {
        effects.detachedDomAccesses.push({
          operation,
          tagName: this.tagName,
          className: this.className,
        });
      }
    }
    get value() {
      this._trackDetachedAccess("value:get");
      return this._value;
    }
    set value(next) {
      this._trackDetachedAccess("value:set");
      this._value = String(next ?? "");
    }
    get parentNode() {
      return this.parentElement;
    }
    get childNodes() {
      return this.children;
    }
    get nextSibling() {
      if (!this.parentElement) return null;
      const index = this.parentElement.children.indexOf(this);
      return this.parentElement.children[index + 1] || null;
    }
    get classList() {
      const element = this;
      return {
        contains(name) {
          return element.className.split(/\s+/u).filter(Boolean).includes(String(name));
        },
        add(...names) {
          const values = new Set(element.className.split(/\s+/u).filter(Boolean));
          names.forEach((name) => values.add(String(name)));
          element.className = [...values].join(" ");
        },
        remove(...names) {
          const removed = new Set(names.map(String));
          element.className = element.className
            .split(/\s+/u)
            .filter((name) => name && !removed.has(name))
            .join(" ");
        },
      };
    }
    get textContent() {
      this._trackDetachedAccess("textContent:get");
      if (this.children.length) return this.children.map((child) => child.textContent).join("");
      return this._text;
    }
    set textContent(value) {
      this._trackDetachedAccess("textContent:set");
      this._disconnectChildren();
      this.children = [];
      this._text = String(value ?? "");
    }
    get innerText() {
      if (
        this.hidden ||
        this.getAttribute("aria-hidden") === "true" ||
        this.getAttribute("data-h2o-title-native-hidden") === "1" ||
        this.style.display === "none" ||
        this.style.visibility === "hidden"
      ) return "";
      if (this.children.length) return this.children.map((child) => child.innerText).join("");
      return this._text;
    }
    set innerText(value) {
      this.textContent = value;
    }
    get innerHTML() {
      this._trackDetachedAccess("innerHTML:get");
      return this.textContent;
    }
    set innerHTML(value) {
      this._trackDetachedAccess("innerHTML:set");
      this._disconnectChildren();
      this.children = [];
      this._text = String(value || "");
    }
    _disconnectChildren() {
      for (const child of this.children) child._setConnected(false);
    }
    _setConnected(value) {
      this._connected = !!value;
      if (this._connected) this._everConnected = true;
      for (const child of this.children) child._setConnected(this._connected);
    }
    appendChild(child) {
      if (!child) return child;
      child.remove();
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument || documentRef;
      this.children.push(child);
      child._setConnected(this.isConnected);
      return child;
    }
    append(...nodes) {
      nodes.forEach((node) => this.appendChild(node));
    }
    prepend(...nodes) {
      [...nodes].reverse().forEach((node) => {
        node.remove();
        node.parentElement = this;
        node.ownerDocument = this.ownerDocument || documentRef;
        this.children.unshift(node);
        node._setConnected(this.isConnected);
      });
    }
    insertBefore(child, reference) {
      if (!reference || !this.children.includes(reference)) return this.appendChild(child);
      child.remove();
      const index = this.children.indexOf(reference);
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument || documentRef;
      this.children.splice(index, 0, child);
      child._setConnected(this.isConnected);
      return child;
    }
    insertAdjacentElement(position, child) {
      if (position !== "afterend" || !this.parentElement) return null;
      this.parentElement.insertBefore(child, this.nextSibling);
      return child;
    }
    remove() {
      if (this.parentElement) {
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
      }
      this.parentElement = null;
      this._setConnected(false);
    }
    setAttribute(name, value) {
      this._trackDetachedAccess("setAttribute");
      const key = String(name);
      const text = String(value);
      this._attributes.set(key, text);
      if (key === "id") this.id = text;
      if (key === "class") this.className = text;
      if (key.startsWith("data-")) {
        const dataName = key.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
        this.dataset[dataName] = text;
      }
    }
    getAttribute(name) {
      this._trackDetachedAccess("getAttribute");
      const key = String(name);
      if (key === "id" && this.id) return this.id;
      if (key === "class" && this.className) return this.className;
      return this._attributes.has(key) ? this._attributes.get(key) : null;
    }
    removeAttribute(name) {
      const key = String(name);
      this._attributes.delete(key);
      if (key.startsWith("data-")) {
        const dataName = key.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
        delete this.dataset[dataName];
      }
    }
    hasAttribute(name) {
      const key = String(name);
      if (key === "id") return !!this.id;
      if (key === "class") return !!this.className;
      return this._attributes.has(key);
    }
    addEventListener(name, handler) {
      this._trackDetachedAccess("addEventListener");
      this._events.addEventListener(name, handler);
    }
    removeEventListener(name, handler) {
      this._trackDetachedAccess("removeEventListener");
      this._events.removeEventListener(name, handler);
    }
    dispatchEvent(event) {
      const next = event?.type ? event : makeDomEvent(String(event || ""));
      this._events.dispatchEvent(next);
      return !next.defaultPrevented;
    }
    click() {
      this.dispatchEvent(makeDomEvent("click"));
    }
    focus() {
      if (documentRef) documentRef.activeElement = this;
    }
    select() {}
    contains(node) {
      if (node === this) return true;
      return this.children.some((child) => child.contains(node));
    }
    matches(selector) {
      return String(selector || "").split(",").some((item) => selectorMatches(this, item.trim()));
    }
    querySelectorAll(selector) {
      this._trackDetachedAccess("querySelectorAll");
      const selectors = String(selector || "").split(",").map((item) => item.trim()).filter(Boolean);
      const matches = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (selectors.some((item) => selectorMatches(child, item))) matches.push(child);
          visit(child);
        }
      };
      visit(this);
      return matches;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    closest(selector) {
      let node = this;
      while (node) {
        if (String(selector).split(",").some((item) => selectorMatches(node, item.trim()))) return node;
        node = node.parentElement;
      }
      return null;
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 320, bottom: 40, width: 320, height: 40 };
    }
    getClientRects() {
      return this.isConnected && this.innerText !== "" ? [this.getBoundingClientRect()] : [];
    }
  }

  class MutationObserverMock {
    constructor(callback) {
      this.callback = callback;
      this.active = false;
      effects.observers.add(this);
    }
    observe() {
      this.active = true;
    }
    disconnect() {
      this.active = false;
    }
  }

  const html = new ElementMock("html");
  const head = new ElementMock("head");
  const body = new ElementMock("body");
  const composerParent = new ElementMock("div");
  const form = new ElementMock("form");
  form.setAttribute("data-testid", "composer");
  html._setConnected(true);
  html.appendChild(head);
  html.appendChild(body);
  body.appendChild(composerParent);
  composerParent.appendChild(form);

  const document = {
    ...documentEvents,
    readyState: "complete",
    hidden: false,
    title: "Initial title - ChatGPT",
    activeElement: null,
    documentElement: html,
    head,
    body,
    createElement(tagName) {
      const element = new ElementMock(tagName);
      element.ownerDocument = document;
      return element;
    },
    getElementById(id) {
      return [...allElements].find((element) => element.id === id && element.isConnected) || null;
    },
    querySelector(selector) {
      const value = String(selector || "");
      if (value === 'form[data-testid="composer"]' || value === "form") return form;
      if (value.startsWith('main div.text-token-text-secondary')) return null;
      return html.querySelector(value);
    },
    querySelectorAll(selector) {
      return html.querySelectorAll(selector);
    },
    createTreeWalker(root, _whatToShow, filter) {
      const nodes = [];
      const collect = (element) => {
        if (element.children.length === 0 && element._text) {
          nodes.push({
            nodeType: 3,
            nodeValue: element._text,
            parentElement: element,
          });
        }
        for (const child of element.children) collect(child);
      };
      collect(root);
      let index = -1;
      return {
        currentNode: null,
        nextNode() {
          while (++index < nodes.length) {
            const node = nodes[index];
            const verdict = filter?.acceptNode?.(node);
            if (verdict === 2) continue;
            this.currentNode = node;
            return node;
          }
          this.currentNode = null;
          return null;
        },
      };
    },
  };
  documentRef = document;
  html.ownerDocument = document;
  head.ownerDocument = document;
  body.ownerDocument = document;
  composerParent.ownerDocument = document;
  form.ownerDocument = document;

  return {
    document,
    ElementMock,
    MutationObserverMock,
    composerParent,
    form,
    triggerObservers() {
      for (const observer of effects.observers) {
        if (observer.active) observer.callback([]);
      }
    },
    activeObserverCount() {
      return [...effects.observers].filter((observer) => observer.active).length;
    },
  };
}

function createEditorHarness(initialState = {}) {
  const effects = makeEffects();
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const dom = createMiniDom(effects);
  const subscribers = new Set();
  const renameCalls = [];
  let confirmedUpdates = 0;
  let renameHandler = null;
  let state = {
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 1,
    baseTitle: "Initial title",
    emoji: "",
    displayTitle: "Initial title",
    documentTitle: "Initial title",
    convergence: { enabled: true, mode: "canonical" },
    ...initialState,
  };
  const location = {
    pathname: `/c/${state.chatId}`,
    href: `https://chatgpt.com/c/${state.chatId}`,
    origin: "https://chatgpt.com",
    search: "",
  };
  const api = {
    subscribe(callback) {
      subscribers.add(callback);
      callback({ ...state });
      return () => subscribers.delete(callback);
    },
    getState() {
      return { ...state };
    },
    refresh() {
      return { ...state };
    },
    async renameNative(value, options) {
      renameCalls.push({ value, options });
      let result = renameHandler
        ? await renameHandler(value, options)
        : { ok: true, status: "backend-submitted", baseTitle: sanitizeNativeTitle(value), emoji: "" };
      if (options?.signal?.aborted) {
        return { ok: false, status: "aborted", confirm: false };
      }
      if (result?.ok && result.confirm !== false) {
        const base = typeof result.baseTitle === "string" ? result.baseTitle : sanitizeNativeTitle(value);
        const emoji = typeof result.emoji === "string" ? result.emoji : state.emoji;
        const formatted = formatNativeDisplayTitle(base, emoji);
        state = {
          ...state,
          baseTitle: base,
          emoji,
          displayTitle: formatted.text,
          documentTitle: formatted.text,
        };
        confirmedUpdates += 1;
        for (const callback of [...subscribers]) callback({ ...state });
      }
      return result;
    },
  };
  class CustomEventMock {
    constructor(type, options = {}) {
      this.type = type;
      this.detail = options.detail;
    }
  }
  class MouseEventMock {
    constructor(type, options = {}) {
      Object.assign(this, makeDomEvent(type, options));
    }
  }
  const history = {
    pushState() {},
    replaceState() {},
  };
  const sandbox = {
    ...windowEvents,
    window: null,
    document: dom.document,
    location,
    history,
    H2O: { ChatTitle: api },
    console: { log() {}, warn() {}, error() {} },
    CustomEvent: CustomEventMock,
    MouseEvent: MouseEventMock,
    MutationObserver: dom.MutationObserverMock,
    AbortController,
    HTMLElement: dom.ElementMock,
    Element: dom.ElementMock,
    URL,
    URLSearchParams,
    Intl,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    requestAnimationFrame: timers.requestAnimationFrame,
    cancelAnimationFrame: timers.cancelAnimationFrame,
    getComputedStyle() {
      return { display: "block", visibility: "visible", opacity: "1" };
    },
    innerWidth: 1280,
    innerHeight: 800,
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const script = new vm.Script(c1Source, { filename: `${C1_REL}:stage1e-editor-harness` });

  function emit(nextState) {
    state = { ...state, ...nextState };
    for (const callback of [...subscribers]) callback({ ...state });
  }

  return {
    sandbox,
    document: dom.document,
    effects,
    api,
    evaluate() {
      script.runInContext(context);
    },
    emit,
    state() {
      return { ...state };
    },
    setRoute(pathname) {
      location.pathname = pathname;
      location.href = `https://chatgpt.com${pathname}`;
    },
    setRenameHandler(handler) {
      renameHandler = handler;
    },
    renameCalls,
    confirmedUpdates() {
      return confirmedUpdates;
    },
    subscriberCount() {
      return subscribers.size;
    },
    listenerCount() {
      return windowEvents.count();
    },
    activeObserverCount: dom.activeObserverCount,
    find(selector) {
      return dom.document.querySelector(selector);
    },
    openEditor() {
      const title = dom.document.querySelector(".ho-title-text");
      assert(title, "confirmed title element missing");
      title.dispatchEvent(makeDomEvent("dblclick"));
      const input = dom.document.querySelector(".ho-title-edit-input");
      assert(input, "editor input missing");
      return input;
    },
    key(input, key) {
      input.dispatchEvent(makeDomEvent("keydown", { key }));
    },
    blur(input) {
      input.dispatchEvent(makeDomEvent("blur"));
    },
    destroy() {
      for (const key of ["__h2oTitleUnderInputRuntime_v3", "__h2oTitleUnderInputRuntime_v4"]) {
        sandbox[key]?.destroy?.();
      }
    },
  };
}

function createSidebarHarness(initialState = {}) {
  const effects = makeEffects();
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const dom = createMiniDom(effects);
  const subscribers = new Set();
  const mutations = { canonical: 0, patches: 0, storeWrites: 0 };
  const routePath = typeof initialState.routePath === "string"
    ? initialState.routePath
    : `/c/${initialState.chatId || "stage1eb-chat-a"}`;
  const { routePath: _ignoredRoutePath, ...snapshotState } = initialState;
  let state = {
    chatId: "stage1eb-chat-a",
    routeKind: "chat",
    routeToken: 1,
    baseTitle: "Native clean",
    emoji: "",
    displayTitle: "Native clean",
    documentTitle: "Native clean",
    convergence: { enabled: true, mode: "canonical" },
    ...snapshotState,
  };
  const location = {
    pathname: routePath,
    href: `https://chatgpt.com${routePath}`,
    origin: "https://chatgpt.com",
    search: "",
  };
  const sandbox = {
    ...windowEvents,
    window: null,
    document: dom.document,
    location,
    history: { pushState() {}, replaceState() {} },
    localStorage: makeStorage(effects),
    sessionStorage: makeStorage(effects),
    console: { log() {}, warn() {}, error() {} },
    HTMLElement: dom.ElementMock,
    MutationObserver: dom.MutationObserverMock,
    URL,
    decodeURIComponent,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    requestAnimationFrame: timers.requestAnimationFrame,
    cancelAnimationFrame: timers.cancelAnimationFrame,
    getComputedStyle(element) {
      return {
        display: element?.style?.display || "block",
        visibility: element?.style?.visibility || "visible",
        opacity: element?.style?.opacity ?? "1",
      };
    },
    fetch() {
      mutations.patches += 1;
      throw new Error("9B2a attempted network access");
    },
  };
  sandbox.window = sandbox;
  sandbox.H2O = {
    ChatTitle: {
      subscribe(callback) {
        subscribers.add(callback);
        callback({ ...state, convergence: { ...state.convergence } });
        return () => subscribers.delete(callback);
      },
      setTitle() { mutations.canonical += 1; },
      setEmoji() { mutations.canonical += 1; },
      renameNative() { mutations.patches += 1; },
    },
    Library: {
      Store: {
        set() { mutations.storeWrites += 1; },
      },
    },
  };
  const context = vm.createContext(sandbox);
  const script = new vm.Script(b2Source, { filename: `${B2_REL}:stage1eb-harness` });
  let defaultContainer = null;

  function ensureContainer(tagName = "nav", parent = dom.document.body) {
    const container = dom.document.createElement(tagName);
    parent.appendChild(container);
    if (!defaultContainer && tagName === "nav") defaultContainer = container;
    return container;
  }

  function createRow(options = {}) {
    const container = options.container || defaultContainer || ensureContainer();
    const anchor = dom.document.createElement("a");
    anchor.className = "__menu-item";
    anchor.setAttribute("href", options.href || location.pathname);
    if (Object.prototype.hasOwnProperty.call(options, "ariaLabelledby")) {
      anchor.setAttribute("aria-labelledby", options.ariaLabelledby);
    }
    if (Object.prototype.hasOwnProperty.call(options, "ariaLabel")) {
      anchor.setAttribute("aria-label", options.ariaLabel);
    }
    if (Object.prototype.hasOwnProperty.call(options, "title")) {
      anchor.setAttribute("title", options.title);
    }
    if (options.hidden) anchor.setAttribute("hidden", "");
    const layout = dom.document.createElement("div");
    anchor.appendChild(layout);
    let source = null;
    if (options.nativeTitle !== null) {
      source = dom.document.createElement("span");
      source.className = options.nativeClass || "truncate";
      source.textContent = options.nativeTitle ?? "Native clean";
      layout.appendChild(source);
    }
    container.appendChild(anchor);
    return { container, anchor, layout, source };
  }

  function runTimers(kind) {
    for (const [id, timer] of [...effects.timers]) {
      if (kind && timer.kind !== kind) continue;
      effects.timers.delete(id);
      timer.callback();
    }
  }

  return {
    sandbox,
    effects,
    mutations,
    dom,
    evaluate() { script.runInContext(context); },
    ensureContainer,
    createRow,
    emit(next) {
      state = {
        ...state,
        ...next,
        convergence: { ...state.convergence, ...(next?.convergence || {}) },
      };
      for (const callback of [...subscribers]) {
        callback({ ...state, convergence: { ...state.convergence } });
      }
    },
    setLocation(pathname) {
      location.pathname = pathname;
      location.href = `https://chatgpt.com${pathname}`;
    },
    runFrames() { runTimers("frame"); },
    runRetries() { runTimers("timeout"); },
    triggerMutation(records = []) {
      for (const item of effects.observers) {
        if (item.active) item.callback(records);
      }
    },
    visual(row) {
      return row.anchor.querySelector(
        '[data-h2o-owner="title-sidebar-renderer"][data-h2o-title-role="visual"]',
      );
    },
    nativeText(row) { return row.source?.textContent ?? ""; },
    renderedText(row) { return row.anchor.innerText; },
    subscriptionCount() { return subscribers.size; },
    observerCount() {
      return [...effects.observers].filter((item) => item.active).length;
    },
    runtime() { return sandbox.H2O.SidebarTitleRenderer; },
    destroy() { sandbox.H2O.SidebarTitleRenderer?.destroy?.(); },
  };
}

function executeReaderSlice(key, globals, expression) {
  return executeReaderBundle([key], globals, expression);
}

function executeReaderBundle(keys, globals, expression) {
  const sandbox = { ...globals };
  const context = vm.createContext(sandbox);
  new vm.Script(
    `${keys.map((key) => readerSlices[key]).join("\n")}\nglobalThis.__stage1ebReaderResult = (${expression});`,
    { filename: `${keys.join("+")}:committed-reader-slice` },
  ).runInContext(context);
  return sandbox.__stage1ebReaderResult;
}

function chooseBetterLibraryTitle(previous, next, fallback = "") {
  return executeReaderBundle(
    ["f0dEnsureString", "f0dNormText", "f0dChooseBetterTitle"],
    { previous, next, fallback },
    "chooseBetterTitle(previous, next, fallback)",
  );
}

function runReaderSlices(harness, row) {
  const { dom } = harness;
  const normText = (raw) => String(raw || "").replace(/\s+/gu, " ").trim();
  const parseChatId = (href) => {
    try {
      const match = new URL(String(href || ""), "https://chatgpt.com").pathname.match(/^\/c\/([^/]+)$/u);
      return match ? decodeURIComponent(match[1]) : "";
    } catch {
      return "";
    }
  };
  const chatId = parseChatId(row.anchor.getAttribute("href"));
  const common = {
    anchor: row.anchor,
    HTMLElement: dom.ElementMock,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    D: dom.document,
    SEL: {
      sidebarTruncate: '.truncate,[class*="truncate"]',
      sidebarItemAnchor: 'a[href*="/c/"]',
    },
  };
  const f1cNative = executeReaderSlice("f1cNative", {
    ...common,
    chatId,
    normText,
  }, "extractNativeRecentTitle(anchor, chatId)");
  const f2aNative = executeReaderSlice("f2aNative", {
    ...common,
    root: row.container,
    DOM_collectNativeProjectAnchors: () => [row.anchor],
    PROJECTS_idFromHref: () => "reader-project",
    normText,
  }, "DOM_collectNativeProjectRows(root)[0]?.title || ''");
  const f3aNative = executeReaderSlice("f3aNative", {
    ...common,
    UTIL_normText: normText,
    UI_cleanSurfaceChatTitle: normText,
    UI_isNoisySurfaceChatTitle: () => false,
  }, "DOM_extractSidebarChatTitle(anchor, '')");
  const f3aRendered = executeReaderSlice("f3aRendered", {
    ...common,
    source: "stage1eb",
    UTIL_normText: normText,
    DOM_parseChatIdFromHref: parseChatId,
    DOM_findChatTitleInSidebarByHref: () => "",
    DOM_rectSnapshot: () => null,
  }, "DOM_menuContextFromAnchor(anchor, source)?.title || ''");
  const f6aRendered = executeReaderBundle(
    ["f6aSelectors", "f6aNormText", "f6aIds", "f6aRendered"],
    {
    ...common,
    chatId,
  }, "findChatTitleInSidebar(chatId)");
  const f6aTruncate = executeReaderBundle(["f6aSelectors", "f6aSetRowText"], {
    ...common,
    row: row.anchor,
    visual: harness.visual(row),
    nativeTitle: row.source?.textContent || "",
  }, `(() => {
    setRowText(row, nativeTitle);
    const selected = row.querySelector(SEL.sidebarTruncate);
    return { text: selected?.textContent || "", matchedVisual: selected === visual };
  })()`);
  const d3aRendered = executeReaderSlice("d3aRendered", {
    ...common,
    chatId,
    toChatId: (value) => String(value || ""),
    normalizeChatIdFromUrl: parseChatId,
  }, "readSidebarConversationTitle(chatId)");
  return {
    f1cNative,
    f2aNative,
    f3aNative,
    f6aTruncateTarget: f6aTruncate.text,
    f6aTruncateMatchedVisual: f6aTruncate.matchedVisual,
    f6aVisualAfterTruncateTarget: harness.visual(row)?.textContent || "",
    f3aRendered,
    f6aRendered,
    d3aRendered,
  };
}

function currentRecord(harness) {
  return JSON.parse(JSON.stringify(harness.hook.currentRecord()));
}

function recordFor(harness, chatId) {
  const value = harness.hook.recordFor(chatId);
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function patchBody(effects) {
  const entry = effects.fetches.find((item) => item.options?.method === "PATCH");
  return entry ? JSON.parse(entry.options.body) : null;
}

await scenario("default flag state preserves the legacy formatter path", () => {
  const harness = createB0Harness();
  assert.equal(harness.hook.displayFrom("Alpha - Beta", "✨"), "✨ Beta");
  harness.api.debug.refreshDisplay("default-legacy");
  assert.equal(harness.api.getState().convergence.mode, "legacy");
  assert.equal(harness.api.getState().convergence.enabled, false);
});

await scenario("explicit flag activation selects the canonical formatter path", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Alpha - Beta", "✨"), "✨ Alpha - Beta");
  harness.api.debug.refreshDisplay("canonical-on");
  assert.equal(harness.api.getState().convergence.mode, "canonical");
  assert.equal(harness.api.getState().convergence.enabled, true);
});

await scenario("invalid or missing bridge identity falls back to legacy", () => {
  const invalid = createB0Harness({ flag: true, bridge: "invalid" });
  assert.equal(invalid.hook.displayFrom("Alpha - Beta", "✨"), "✨ Beta");
  invalid.api.debug.refreshDisplay("invalid-bridge");
  assert.equal(invalid.api.getState().convergence.mode, "legacy-fallback");
  assert.match(invalid.api.getState().lastWarning, /contract gate identity-mismatch/u);

  const absent = createB0Harness({ flag: true, bridge: "absent" });
  assert.equal(absent.hook.displayFrom("Alpha - Beta", "✨"), "✨ Beta");
});

await scenario("ordinary LTR title uses canonical composition", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Ordinary title", "✨"), "✨ Ordinary title");
});

await scenario("internal dash remains intact under canonical formatting", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Design - implementation", ""), "Design - implementation");
});

await scenario("terminal ChatGPT suffix is handled exactly once", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Release plan - ChatGPT", ""), "Release plan");
  assert.equal(harness.hook.displayFrom("ChatGPT", ""), "ChatGPT");
});

await scenario("existing edge emoji is not duplicated", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("✨ Existing", "✨"), "✨ Existing");
  assert.equal(harness.hook.displayFrom("Existing ✨", "✨"), "✨ Existing");
});

await scenario("multi-code-point emoji remains intact", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("Developer notes", "👩🏽‍💻"), "👩🏽‍💻 Developer notes");
});

await scenario("Arabic title uses deterministic RTL composition", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("مرحبا بالعالم", "✨"), "مرحبا بالعالم ✨");
});

await scenario("Hebrew title uses deterministic RTL composition", () => {
  const harness = createB0Harness({ flag: true });
  assert.equal(harness.hook.displayFrom("כותרת בדיקה", "✨"), "כותרת בדיקה ✨");
});

await scenario("successful rename does not change canonical state before PATCH success", async () => {
  const harness = createB0Harness({ flag: true });
  const pendingPatch = deferred();
  harness.setFetch(async (url) => (
    url === "/api/auth/session"
      ? response({ body: { accessToken: "token" } })
      : pendingPatch.promise
  ));
  const before = currentRecord(harness);
  const rename = harness.api.renameNative("Accepted - ChatGPT", {
    userInitiated: true,
    source: "validator",
  });
  await flushMicrotasks();
  assert.deepEqual(currentRecord(harness), before);
  assert.equal(harness.effects.storageOps.length, 0);
  pendingPatch.resolve(response());
  const result = await rename;
  assert.equal(result.ok, true);
});

await scenario("successful rename produces exactly one confirmed canonical update", async () => {
  const harness = createB0Harness({ flag: true });
  let updates = 0;
  harness.api.subscribe(() => {
    updates += 1;
  });
  updates = 0;
  harness.effects.resetTransient();
  const before = currentRecord(harness);
  const result = await harness.api.renameNative("Confirmed title", {
    userInitiated: true,
    source: "validator",
  });
  const after = currentRecord(harness);
  assert.equal(result.ok, true);
  assert.equal(after.baseTitle, "Confirmed title");
  assert.equal(after.rev, before.rev + 1);
  assert.equal(updates, 1);
  assert.deepEqual(patchBody(harness.effects), { title: "Confirmed title" });
  assert.equal(harness.effects.storageOps.filter((entry) => entry.type === "set").length, 1);
});

await scenario("failed rename leaves canonical state and persistence unchanged", async () => {
  const harness = createB0Harness({ flag: true });
  harness.setFetch(async (url) => (
    url === "/api/auth/session"
      ? response({ body: {} })
      : response({ ok: false, status: 500, body: { error: "expected" } })
  ));
  const before = currentRecord(harness);
  const storageBefore = harness.storage.snapshot();
  const result = await harness.api.renameNative("Rejected title", {
    userInitiated: true,
    source: "validator",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(currentRecord(harness), before);
  assert.equal(harness.storage.snapshot(), storageBefore);
  assert.equal(harness.effects.storageOps.length, 0);
});

await scenario("superseded or stale-route completion cannot update canonical state", async () => {
  const superseded = createB0Harness({ flag: true });
  const firstPatch = deferred();
  const secondPatch = deferred();
  superseded.setFetch(async (url, options) => {
    if (url === "/api/auth/session") return response({ body: {} });
    const title = JSON.parse(options.body).title;
    return title === "First title" ? firstPatch.promise : secondPatch.promise;
  });
  const before = currentRecord(superseded);
  const first = superseded.api.renameNative("First title", { userInitiated: true, source: "validator" });
  await flushMicrotasks();
  const second = superseded.api.renameNative("Second title", { userInitiated: true, source: "validator" });
  await flushMicrotasks();
  firstPatch.resolve(response());
  const firstResult = await first;
  assert.equal(firstResult.status, "superseded");
  assert.deepEqual(currentRecord(superseded), before);
  secondPatch.resolve(response());
  const secondResult = await second;
  assert.equal(secondResult.ok, true);
  assert.equal(currentRecord(superseded).baseTitle, "Second title");

  const stale = createB0Harness({ flag: true });
  const stalePatch = deferred();
  stale.setFetch(async (url) => (
    url === "/api/auth/session" ? response({ body: {} }) : stalePatch.promise
  ));
  const oldChatId = stale.api.getState().chatId;
  const oldRecord = recordFor(stale, oldChatId);
  const staleRename = stale.api.renameNative("Stale title", { userInitiated: true, source: "validator" });
  await flushMicrotasks();
  stale.setRoute("/c/stage1e-chat-b");
  stale.setDocumentTitle("Route B - ChatGPT");
  stale.effects.resetTransient();
  stalePatch.resolve(response());
  const staleResult = await staleRename;
  assert.equal(staleResult.status, "route-stale");
  assert.deepEqual(recordFor(stale, oldChatId), oldRecord);
  assert.equal(stale.effects.storageOps.length, 0);

  const authPending = createB0Harness({ flag: true });
  const authResponse = deferred();
  authPending.setFetch(async (url) => (
    url === "/api/auth/session" ? authResponse.promise : response()
  ));
  const authOldChatId = authPending.api.getState().chatId;
  const authOldRecord = recordFor(authPending, authOldChatId);
  const authRename = authPending.api.renameNative("Auth-stale title", {
    userInitiated: true,
    source: "validator",
  });
  await flushMicrotasks();
  authPending.setRoute("/c/stage1e-chat-b");
  authResponse.resolve(response({ body: { accessToken: "stage1e-token" } }));
  const authResult = await authRename;
  assert.equal(authResult.status, "route-stale");
  assert.equal(
    authPending.effects.fetches.filter((entry) => entry.options?.method === "PATCH").length,
    0,
  );
  assert.deepEqual(recordFor(authPending, authOldChatId), authOldRecord);
});

await scenario("explicit chat mismatch fails before authentication or PATCH", async () => {
  const harness = createB0Harness({ flag: true });
  const before = currentRecord(harness);
  const result = await harness.api.renameNative("Wrong target", {
    userInitiated: true,
    source: "validator",
    chatId: "stage1e-chat-b",
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "wrong-chat",
  });
  assert.equal(result.reason, "route-stale-before-request");
  assert.equal(harness.effects.fetches.length, 0);
  assert.deepEqual(currentRecord(harness), before);
  assert.equal(harness.effects.storageOps.length, 0);
});

await scenario("explicit route-token mismatch fails before authentication or PATCH", async () => {
  const harness = createB0Harness({ flag: true });
  const before = currentRecord(harness);
  const result = await harness.api.renameNative("Wrong token", {
    userInitiated: true,
    source: "validator",
    chatId: harness.api.getState().chatId,
    expectedRouteToken: harness.api.getState().routeToken + 1,
    expectedRouteKind: "chat",
    operationId: "wrong-token",
  });
  assert.equal(result.reason, "route-stale-before-request");
  assert.equal(harness.effects.fetches.length, 0);
  assert.deepEqual(currentRecord(harness), before);
});

await scenario("URL and coordinator mismatch fails before authentication or PATCH", async () => {
  const harness = createB0Harness({ flag: true });
  const before = currentRecord(harness);
  harness.setRoute("/c/stage1e-chat-b");
  const result = await harness.api.renameNative("URL moved", {
    userInitiated: true,
    source: "validator",
    chatId: "stage1e-chat-a",
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "url-moved",
  });
  assert.equal(result.reason, "route-stale-before-request");
  assert.equal(harness.effects.fetches.length, 0);
  assert.deepEqual(currentRecord(harness), before);
});

await scenario("native PATCH receives clean base while canonical emoji remains separate", async () => {
  for (const sample of [
    { input: "✨ New title", patch: "New title", emoji: "✨", display: "✨ New title" },
    { input: "✨✨ Repeated", patch: "Repeated", emoji: "✨", display: "✨ Repeated" },
    { input: "👩🏽‍💻 Developer", patch: "Developer", emoji: "👩🏽‍💻", display: "👩🏽‍💻 Developer" },
    { input: "مرحبا ✨", patch: "مرحبا", emoji: "✨", display: "مرحبا ✨" },
    { input: "✨ Release - ChatGPT", patch: "Release", emoji: "✨", display: "✨ Release" },
  ]) {
    const harness = createB0Harness({ flag: true });
    const result = await harness.api.renameNative(sample.input, {
      userInitiated: true,
      source: "validator",
      chatId: harness.api.getState().chatId,
      expectedRouteToken: harness.api.getState().routeToken,
      expectedRouteKind: "chat",
      operationId: `emoji-${sample.patch}`,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(patchBody(harness.effects), { title: sample.patch });
    assert.equal(harness.api.getState().baseTitle, sample.patch);
    assert.equal(harness.api.getState().emoji, sample.emoji);
    assert.equal(harness.api.getState().displayTitle, sample.display);
  }

  const empty = createB0Harness({ flag: true });
  const emptyResult = await empty.api.renameNative("✨", {
    userInitiated: true,
    source: "validator",
    chatId: empty.api.getState().chatId,
    expectedRouteToken: empty.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "emoji-only",
  });
  assert.equal(emptyResult.reason, "empty-base-after-emoji");
  assert.equal(empty.effects.fetches.length, 0);
});

await scenario("existing emoji is preserved and submitted emoji replaces it after confirmation", async () => {
  const harness = createB0Harness({ flag: true });
  harness.api.setEmoji({
    chatId: harness.api.getState().chatId,
    emoji: "🚀",
    source: "user",
    priority: 100,
  }, { force: true, reason: "validator-seed" });
  harness.effects.resetTransient();
  await harness.api.renameNative("Plain replacement", {
    userInitiated: true,
    source: "validator",
    chatId: harness.api.getState().chatId,
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "preserve-existing-emoji",
  });
  assert.deepEqual(patchBody(harness.effects), { title: "Plain replacement" });
  assert.equal(harness.api.getState().emoji, "🚀");

  harness.effects.resetTransient();
  await harness.api.renameNative("✨ Explicit replacement", {
    userInitiated: true,
    source: "validator",
    chatId: harness.api.getState().chatId,
    expectedRouteToken: harness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "replace-existing-emoji",
  });
  assert.deepEqual(patchBody(harness.effects), { title: "Explicit replacement" });
  assert.equal(harness.api.getState().emoji, "✨");
});

await scenario("abort and destruction during a pending request remain non-mutating", async () => {
  const aborted = createB0Harness({ flag: true });
  const externalController = new AbortController();
  externalController.abort();
  const beforeAbort = currentRecord(aborted);
  const abortResult = await aborted.api.renameNative("Never requested", {
    userInitiated: true,
    source: "validator",
    chatId: aborted.api.getState().chatId,
    expectedRouteToken: aborted.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "aborted-before-request",
    signal: externalController.signal,
  });
  assert.equal(abortResult.reason, "aborted-before-request");
  assert.equal(aborted.effects.fetches.length, 0);
  assert.deepEqual(currentRecord(aborted), beforeAbort);

  const destroyedHarness = createB0Harness({ flag: true });
  const pendingPatch = deferred();
  destroyedHarness.setFetch(async (url) => (
    url === "/api/auth/session" ? response({ body: {} }) : pendingPatch.promise
  ));
  const beforeDestroy = currentRecord(destroyedHarness);
  const pendingRename = destroyedHarness.api.renameNative("Destroyed request", {
    userInitiated: true,
    source: "validator",
    chatId: destroyedHarness.api.getState().chatId,
    expectedRouteToken: destroyedHarness.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "destroyed-pending",
  });
  await flushMicrotasks();
  destroyedHarness.hook.destroy();
  pendingPatch.resolve(response());
  const destroyedResult = await pendingRename;
  assert.equal(destroyedResult.status, "destroyed");
  assert.deepEqual(currentRecord(destroyedHarness), beforeDestroy);
  assert.equal(destroyedHarness.effects.storageOps.length, 0);
});

await scenario("editor opened on Chat A then routed to Chat B rejects Enter before rename", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Chat A pending";
  harness.setRoute("/c/stage1e-chat-b");
  harness.emit({
    chatId: "stage1e-chat-b",
    routeToken: 2,
    baseTitle: "Chat B",
    displayTitle: "Chat B",
    documentTitle: "Chat B",
  });
  harness.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 0);
  assert.equal(harness.state().baseTitle, "Chat B");
});

await scenario("editor opened on Chat A then routed to Chat B rejects blur before rename", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Chat A pending";
  harness.setRoute("/c/stage1e-chat-b");
  harness.emit({
    chatId: "stage1e-chat-b",
    routeToken: 2,
    baseTitle: "Chat B",
    displayTitle: "Chat B",
    documentTitle: "Chat B",
  });
  harness.blur(input);
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 0);
});

await scenario("URL change before coordinator refresh rejects editor submission", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Must stay with Chat A";
  harness.setRoute("/c/stage1e-chat-b");
  harness.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 0);
  assert.equal(harness.confirmedUpdates(), 0);
});

await scenario("successful editor save performs one rename and one confirmed update", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Confirmed editor title";
  harness.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 1);
  assert.equal(harness.confirmedUpdates(), 1);
  assert.equal(harness.state().baseTitle, "Confirmed editor title");
  assert.equal(harness.find(".ho-title-text")?.textContent, "Confirmed editor title");
});

await scenario("failed editor save preserves canonical display and shows Retry", async () => {
  const harness = createEditorHarness();
  harness.setRenameHandler(async () => ({ ok: false, status: "backend-500", confirm: false }));
  harness.evaluate();
  const before = harness.state();
  const input = harness.openEditor();
  input.value = "Rejected editor title";
  harness.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.confirmedUpdates(), 0);
  assert.deepEqual(harness.state(), before);
  assert.equal(harness.find(".ho-title-text")?.textContent, before.displayTitle);
  assert(harness.find(".ho-title-rename-retry"), "Retry control missing");
});

await scenario("editor Retry uses the intended failed pending text", async () => {
  const harness = createEditorHarness();
  let attempt = 0;
  harness.setRenameHandler(async (value) => {
    attempt += 1;
    if (attempt === 1) return { ok: false, status: "backend-500", confirm: false };
    return { ok: true, status: "backend-submitted", baseTitle: value, emoji: "" };
  });
  harness.evaluate();
  const firstInput = harness.openEditor();
  firstInput.value = "Retry this exact title";
  harness.key(firstInput, "Enter");
  await flushMicrotasks(12);
  harness.find(".ho-title-rename-retry").click();
  const retryInput = harness.find(".ho-title-edit-input");
  assert.equal(retryInput.value, "Retry this exact title");
  harness.key(retryInput, "Enter");
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 2);
  assert.equal(harness.renameCalls[1].value, "Retry this exact title");
  assert.equal(harness.state().baseTitle, "Retry this exact title");
});

await scenario("Enter followed by blur submits the editor once", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "One submission";
  harness.key(input, "Enter");
  harness.blur(input);
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 1);
  assert.equal(harness.confirmedUpdates(), 1);
});

await scenario("Escape followed by blur submits nothing", async () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Do not submit";
  harness.key(input, "Escape");
  harness.blur(input);
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 0);
  assert.equal(harness.state().baseTitle, "Initial title");
});

await scenario("editor reinstall supersedes an older pending submission", async () => {
  const harness = createEditorHarness();
  const firstPending = deferred();
  harness.setRenameHandler(async (value) => {
    if (value === "Older pending") return firstPending.promise;
    return { ok: true, status: "backend-submitted", baseTitle: value, emoji: "" };
  });
  harness.evaluate();
  const firstInput = harness.openEditor();
  firstInput.value = "Older pending";
  harness.key(firstInput, "Enter");
  await flushMicrotasks();

  harness.evaluate();
  const secondInput = harness.openEditor();
  secondInput.value = "Newer confirmed";
  harness.key(secondInput, "Enter");
  await flushMicrotasks(12);
  firstPending.resolve({ ok: true, status: "backend-submitted", baseTitle: "Older pending", emoji: "" });
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 2);
  assert.equal(harness.confirmedUpdates(), 1);
  assert.equal(harness.state().baseTitle, "Newer confirmed");
});

await scenario("pending editor rename then destroy has no late DOM access or confirmation", async () => {
  const harness = createEditorHarness();
  const pending = deferred();
  harness.setRenameHandler(async () => pending.promise);
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Destroyed pending";
  harness.key(input, "Enter");
  await flushMicrotasks();
  harness.destroy();
  pending.resolve({ ok: true, status: "backend-submitted", baseTitle: "Destroyed pending", emoji: "" });
  await flushMicrotasks(12);
  assert.equal(harness.renameCalls.length, 1);
  assert.equal(harness.confirmedUpdates(), 0);
  assert.deepEqual(harness.effects.detachedDomAccesses, []);
  assert.equal(harness.find(".ho-tab-title-under-input"), null);
});

await scenario("pending editor rename then route removal is safely cancelled", async () => {
  const harness = createEditorHarness();
  const pending = deferred();
  harness.setRenameHandler(async () => pending.promise);
  harness.evaluate();
  const input = harness.openEditor();
  input.value = "Route removed";
  harness.key(input, "Enter");
  await flushMicrotasks();
  harness.setRoute("/");
  harness.emit({
    chatId: null,
    routeKind: "transient",
    routeToken: 2,
    baseTitle: "",
    displayTitle: "",
    documentTitle: "",
  });
  pending.resolve({ ok: true, status: "backend-submitted", baseTitle: "Route removed", emoji: "" });
  await flushMicrotasks(12);
  assert.equal(harness.confirmedUpdates(), 0);
  assert.deepEqual(harness.effects.detachedDomAccesses, []);
  assert.equal(harness.find(".ho-tab-title-under-input"), null);
  assert.equal(harness.find(".ho-title-rename-error"), null);
});

await scenario("editor destroy and reinstall leaves one listener subscription and observer set", () => {
  const harness = createEditorHarness();
  harness.evaluate();
  const first = {
    subscribers: harness.subscriberCount(),
    listeners: harness.listenerCount(),
    observers: harness.activeObserverCount(),
  };
  harness.evaluate();
  const second = {
    subscribers: harness.subscriberCount(),
    listeners: harness.listenerCount(),
    observers: harness.activeObserverCount(),
  };
  assert.deepEqual(second, first);
  assert.equal(second.subscribers, 1);
  assert.equal(second.observers, 1);
});

await scenario("edge emoji editor intent produces an emoji-free native PATCH", async () => {
  const editor = createEditorHarness();
  editor.setRenameHandler(async () => ({
    ok: true,
    status: "backend-submitted",
    baseTitle: "New title",
    emoji: "✨",
  }));
  editor.evaluate();
  const input = editor.openEditor();
  input.value = "✨ New title";
  editor.key(input, "Enter");
  await flushMicrotasks(12);
  assert.equal(editor.renameCalls[0].value, "✨ New title");
  assert.equal(editor.state().displayTitle, "✨ New title");

  const coordinator = createB0Harness({ flag: true });
  await coordinator.api.renameNative(editor.renameCalls[0].value, {
    ...editor.renameCalls[0].options,
    chatId: coordinator.api.getState().chatId,
    expectedRouteToken: coordinator.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "editor-edge-emoji",
    signal: undefined,
  });
  assert.deepEqual(patchBody(coordinator.effects), { title: "New title" });
});

await scenario("multi-code-point emoji editor intent remains separate from native base", async () => {
  const coordinator = createB0Harness({ flag: true });
  await coordinator.api.renameNative("👩🏽‍💻 Developer notes", {
    userInitiated: true,
    source: "under-input",
    chatId: coordinator.api.getState().chatId,
    expectedRouteToken: coordinator.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "editor-multi-emoji",
  });
  assert.deepEqual(patchBody(coordinator.effects), { title: "Developer notes" });
  assert.equal(coordinator.api.getState().emoji, "👩🏽‍💻");
  assert.equal(coordinator.api.getState().displayTitle, "👩🏽‍💻 Developer notes");
});

await scenario("RTL suffix emoji editor intent remains separate and deterministic", async () => {
  const coordinator = createB0Harness({ flag: true });
  await coordinator.api.renameNative("مرحبا بالعالم ✨", {
    userInitiated: true,
    source: "under-input",
    chatId: coordinator.api.getState().chatId,
    expectedRouteToken: coordinator.api.getState().routeToken,
    expectedRouteKind: "chat",
    operationId: "editor-rtl-emoji",
  });
  assert.deepEqual(patchBody(coordinator.effects), { title: "مرحبا بالعالم" });
  assert.equal(coordinator.api.getState().displayTitle, "مرحبا بالعالم ✨");
});

await scenario("canonical enabled under-input display is consumed byte-exactly", () => {
  const exact = "  Canonical   spacing  ";
  const harness = createEditorHarness({
    displayTitle: exact,
    documentTitle: exact,
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.find(".ho-title-text")?.textContent, exact);

  const emojiOnly = createEditorHarness({
    baseTitle: "",
    emoji: "👩🏽‍💻",
    displayTitle: "👩🏽‍💻",
    documentTitle: "👩🏽‍💻",
    convergence: { enabled: true, mode: "canonical" },
  });
  emojiOnly.evaluate();
  assert.equal(emojiOnly.find(".ho-title-text")?.textContent, "👩🏽‍💻");
});

await scenario("legacy disabled under-input display retains legacy normalization", () => {
  const harness = createEditorHarness({
    displayTitle: "  Legacy   spacing  ",
    documentTitle: "  Legacy   spacing  ",
    convergence: { enabled: false, mode: "legacy" },
  });
  harness.evaluate();
  assert.equal(harness.find(".ho-title-text")?.textContent, "Legacy spacing");
});

await scenario("browser-tab canonical path is byte-exact and self-write observer is bounded", () => {
  const exact = "  ✨ Canonical   exact  ";
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Wrong - fallback",
    displayTitle: exact,
    documentTitle: exact,
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.document.title, exact);
  assert.equal(harness.titleAssignments(), 1);
  harness.triggerObservers();
  harness.runTimers("frame");
  assert.equal(harness.document.title, exact);
  assert.equal(harness.titleAssignments(), 1);
  assert(harness.titleWritesMarked() >= 1);
});

await scenario("browser-tab native overwrite is reasserted once and same-value sync is suppressed", () => {
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Base",
    displayTitle: "Canonical title",
    documentTitle: "Canonical title",
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.titleAssignments(), 1);
  harness.document.title = "Native overwrite - ChatGPT";
  harness.triggerObservers();
  harness.runTimers("frame");
  assert.equal(harness.document.title, "Canonical title");
  assert.equal(harness.titleAssignments(), 3);
  harness.runTimers("interval");
  assert.equal(harness.titleAssignments(), 3);
});

await scenario("flag disable snapshot restores legacy browser-tab rendering", () => {
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Base",
    displayTitle: "Canonical",
    documentTitle: "Canonical",
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.document.title, "Canonical");
  harness.emit({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Legacy base",
    displayTitle: "",
    documentTitle: "Legacy document",
    convergence: { enabled: false, mode: "legacy" },
  });
  assert.equal(harness.document.title, "Legacy document");
});

await scenario("real central false true false flag changes reproject both consumers without title writes", () => {
  const harness = createB0Harness({ flag: false });
  const recordBefore = currentRecord(harness);
  const storageBefore = harness.storage.snapshot();
  const snapshots = [];
  let notifications = 0;
  harness.api.subscribe((state) => {
    notifications += 1;
    snapshots.push(state);
  });
  notifications = 0;
  snapshots.length = 0;
  harness.effects.resetTransient();
  assert.equal(harness.flagListenerCount(), 1);
  harness.setRuntimeFlag(true);
  assert.equal(harness.api.getState().convergence.enabled, true);
  harness.sandbox.dispatchEvent(new harness.sandbox.CustomEvent("evt:h2o:flags:changed", {
    detail: { name: FLAG_KEY, value: true, source: "compatibility-alias" },
  }));
  assert.equal(notifications, 1);
  harness.setRuntimeFlag(false);
  assert.equal(harness.api.getState().convergence.enabled, false);
  assert.equal(notifications, 2);
  assert.deepEqual(currentRecord(harness), recordBefore);
  assert.equal(harness.storage.snapshot(), storageBefore);
  assert.equal(harness.effects.storageOps.length, 0);

  const canonicalSnapshot = snapshots[0];
  const legacySnapshot = snapshots[1];
  const tab = createTabHarness(legacySnapshot);
  tab.evaluate();
  tab.emit(canonicalSnapshot);
  assert.equal(tab.document.title, canonicalSnapshot.documentTitle);
  tab.emit(legacySnapshot);
  assert.equal(tab.document.title, legacySnapshot.documentTitle);

  const editor = createEditorHarness(legacySnapshot);
  editor.evaluate();
  editor.emit(canonicalSnapshot);
  assert.equal(editor.find(".ho-title-text")?.textContent, canonicalSnapshot.displayTitle);
  editor.emit(legacySnapshot);
  assert.equal(editor.find(".ho-title-text")?.textContent, legacySnapshot.displayTitle);

  harness.hook.destroy();
  assert.equal(harness.flagListenerCount(), 0);
  harness.reinstall();
  assert.equal(harness.flagListenerCount(), 1);
  harness.sandbox.__H2O_STAGE1E_B0_TEST__.destroy();
  assert.equal(harness.flagListenerCount(), 0);
});

await scenario("display-only canonical scenarios issue zero persistent title writes", () => {
  const harness = createB0Harness({ flag: true });
  harness.effects.resetTransient();
  assert.equal(harness.hook.displayFrom("Display only - intact", "✨"), "✨ Display only - intact");
  harness.api.debug.refreshDisplay("display-only");
  assert.equal(harness.effects.storageOps.length, 0);
  assert.equal(harness.effects.fetches.length, 0);
});

await scenario("browser-tab destroy and reinstall retain one live observer subscription and timer set", () => {
  const state = {
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Base",
    displayTitle: "Canonical",
    documentTitle: "Canonical",
    convergence: { enabled: true, mode: "canonical" },
  };
  const harness = createTabHarness(state);
  harness.evaluate();
  const first = {
    subscriptions: harness.activeSubscriptions(),
    listeners: harness.listenerCount(),
    timers: harness.activeTimerCount(),
    observers: harness.activeObserverCount(),
  };
  harness.evaluate();
  const second = {
    subscriptions: harness.activeSubscriptions(),
    listeners: harness.listenerCount(),
    timers: harness.activeTimerCount(),
    observers: harness.activeObserverCount(),
  };
  assert.deepEqual(second, first);
  assert.equal(second.subscriptions, 1);
  assert.equal(second.observers, 1);
});

function adoptedSidebar(options = {}) {
  const routeChatId = options.chatId ||
    String(options.routePath || "").match(/\/c\/([^/?#]+)/u)?.[1] ||
    "stage1eb-chat-a";
  const harness = createSidebarHarness({
    chatId: routeChatId,
    displayTitle: options.displayTitle ?? "Canonical display",
    baseTitle: options.baseTitle ?? "Native clean",
    emoji: options.emoji ?? "",
    convergence: options.convergence || { enabled: true, mode: "canonical" },
    ...(options.routePath ? { routePath: options.routePath } : {}),
  });
  const rowOptions = {
    nativeTitle: options.nativeTitle ?? "Native clean",
    href: options.href,
  };
  for (const key of ["ariaLabelledby", "ariaLabel", "title"]) {
    if (Object.prototype.hasOwnProperty.call(options, key)) rowOptions[key] = options[key];
  }
  const row = harness.createRow(rowOptions);
  harness.evaluate();
  harness.runFrames();
  return { harness, row };
}

async function seedConfirmedUserTitle(harness, submittedTitle, operationId) {
  const state = harness.api.getState();
  const result = await harness.api.renameNative(submittedTitle, {
    userInitiated: true,
    source: "under-input",
    chatId: state.chatId,
    expectedRouteToken: state.routeToken,
    expectedRouteKind: "chat",
    operationId,
  });
  assert.equal(result.ok, true);
  harness.effects.resetTransient();
  return currentRecord(harness);
}

function installStaleSidebarAdoption(harness, row, options = {}) {
  const staleId = options.staleId || `stale-visual-${Math.random().toString(36).slice(2, 8)}`;
  let visual = null;
  if (options.includeVisual !== false) {
    visual = harness.dom.document.createElement("span");
    visual.id = staleId;
    visual.setAttribute("data-h2o-owner", "title-sidebar-renderer");
    visual.setAttribute("data-h2o-title-role", "visual");
    visual.textContent = options.displayTitle || "Stale canonical";
    row.layout.appendChild(visual);
  }
  row.source.setAttribute("data-h2o-title-native-owner", "title-sidebar-renderer");
  row.source.setAttribute("data-h2o-title-native-hidden", "1");
  row.anchor.setAttribute("data-h2o-title-sidebar-adopted", "1");
  row.anchor.setAttribute(
    "data-h2o-title-aria-labelledby-absent",
    options.originalPresent ? "0" : "1",
  );
  if (options.originalPresent) {
    row.anchor.setAttribute(
      "data-h2o-title-aria-labelledby-original",
      options.originalValue || "native-original",
    );
  }
  row.anchor.setAttribute("data-h2o-title-aria-labelledby-visual-id", staleId);
  if (options.currentValue === null) row.anchor.removeAttribute("aria-labelledby");
  else row.anchor.setAttribute("aria-labelledby", options.currentValue || staleId);
  return { staleId, visual };
}

await scenario("sidebar flag disabled leaves native DOM untouched", () => {
  const { harness, row } = adoptedSidebar({
    convergence: { enabled: false, mode: "legacy" },
  });
  assert.equal(harness.visual(row), null);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(row.anchor.hasAttribute("aria-labelledby"), false);
});

await scenario("sidebar canonical ordinary title is displayed byte-exactly", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Canonical ordinary" });
  assert.equal(harness.visual(row)?.textContent, "Canonical ordinary");
  assert.equal(harness.renderedText(row), "Canonical ordinary");
  assert.equal(harness.nativeText(row), "Native clean");
});

await scenario("sidebar canonical emoji is displayed once", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "✨ Canonical", emoji: "✨" });
  assert.equal(harness.renderedText(row), "✨ Canonical");
  assert.equal((harness.renderedText(row).match(/✨/gu) || []).length, 1);
});

await scenario("sidebar preserves multi-code-point emoji", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "👩🏽‍💻 Developer notes" });
  assert.equal(harness.visual(row)?.textContent, "👩🏽‍💻 Developer notes");
});

await scenario("sidebar preserves internal dash text", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Alpha - Beta - Notes" });
  assert.equal(harness.renderedText(row), "Alpha - Beta - Notes");
});

await scenario("sidebar displays Arabic canonical text byte-exactly", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "مرحبا بالعالم ✨" });
  assert.equal(harness.visual(row)?.textContent, "مرحبا بالعالم ✨");
  assert.equal(harness.visual(row)?.getAttribute("dir"), "auto");
});

await scenario("sidebar displays Hebrew canonical text byte-exactly", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "שלום עולם ✨" });
  assert.equal(harness.visual(row)?.textContent, "שלום עולם ✨");
});

await scenario("sidebar supports an emoji-only canonical display", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "👩🏽‍💻", baseTitle: "", emoji: "👩🏽‍💻" });
  assert.equal(harness.renderedText(row), "👩🏽‍💻");
});

await scenario("sidebar leaves a wrong-chat row untouched", () => {
  const { harness, row } = adoptedSidebar({ href: "/c/stage1eb-chat-b" });
  assert.equal(harness.visual(row), null);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
});

await scenario("sidebar exact-route matching rejects prefix paths", () => {
  const { harness, row } = adoptedSidebar({ href: "/c/stage1eb-chat-a-extra" });
  assert.equal(harness.visual(row), null);
  const exact = adoptedSidebar({
    href: "https://chatgpt.com/c/stage1eb-chat-a?model=gpt-5#latest",
    displayTitle: "Query-safe canonical",
  });
  assert.equal(exact.harness.renderedText(exact.row), "Query-safe canonical");
});

await scenario("sidebar direct chat route identity adopts exactly", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/c/stage1eb-direct-chat",
    displayTitle: "Direct canonical",
  });
  assert.equal(harness.renderedText(row), "Direct canonical");
});

await scenario("sidebar project-scoped chat route identity adopts exactly", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat",
    displayTitle: "Project canonical",
  });
  assert.equal(harness.renderedText(row), "Project canonical");
});

await scenario("sidebar project route rejects a wrong project identity", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat",
    href: "/g/g-p-project-b/c/stage1eb-other-chat",
  });
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar same chat under another project is not interchangeable", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-shared-chat",
    href: "/g/g-p-project-b/c/stage1eb-shared-chat",
  });
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar project route rejects a prefixed chat ID", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat",
    href: "/g/g-p-project-a/c/stage1eb-project-chat-extra",
  });
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar project route rejects extra path segments", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat",
    href: "/g/g-p-project-a/c/stage1eb-project-chat/details",
  });
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar project route ignores query and fragment while matching pathname", () => {
  const { harness, row } = adoptedSidebar({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat?model=gpt-5#latest",
    href: "https://chatgpt.com/g/g-p-project-a/c/stage1eb-project-chat?view=compact#row",
    displayTitle: "Project query-safe canonical",
  });
  assert.equal(harness.renderedText(row), "Project query-safe canonical");
});

await scenario("sidebar project route A to B releases before B re-adoption", () => {
  const harness = createSidebarHarness({
    routePath: "/g/g-p-project-a/c/stage1eb-project-chat-a",
    chatId: "stage1eb-project-chat-a",
    displayTitle: "Project A canonical",
  });
  const container = harness.ensureContainer();
  const rowA = harness.createRow({
    container,
    href: "/g/g-p-project-a/c/stage1eb-project-chat-a",
    nativeTitle: "Project A native",
  });
  const rowB = harness.createRow({
    container,
    href: "/g/g-p-project-b/c/stage1eb-project-chat-b",
    nativeTitle: "Project B native",
  });
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.renderedText(rowA), "Project A canonical");
  harness.setLocation("/g/g-p-project-b/c/stage1eb-project-chat-b");
  harness.emit({
    chatId: "stage1eb-project-chat-b",
    routeToken: 2,
    baseTitle: "Project B native",
    displayTitle: "Project B canonical",
  });
  assert.equal(harness.visual(rowA), null);
  assert.equal(harness.renderedText(rowB), "Project B native");
  harness.runFrames();
  assert.equal(harness.renderedText(rowB), "Project B canonical");
});

await scenario("sidebar adopts every visible duplicate active row", () => {
  const harness = createSidebarHarness({ displayTitle: "Duplicate canonical" });
  const nav = harness.ensureContainer("nav");
  const aside = harness.ensureContainer("aside");
  const left = harness.createRow({ container: nav });
  const right = harness.createRow({ container: aside });
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.renderedText(left), "Duplicate canonical");
  assert.equal(harness.renderedText(right), "Duplicate canonical");
  assert.equal(harness.runtime().diagnose().adoptedRows, 2);
});

await scenario("sidebar caps adoption at six and diagnoses extras", () => {
  const harness = createSidebarHarness({ displayTitle: "Bounded canonical" });
  const container = harness.ensureContainer();
  const rows = Array.from({ length: 8 }, () => harness.createRow({ container }));
  harness.evaluate();
  harness.runFrames();
  assert.equal(rows.filter((row) => harness.visual(row)).length, 6);
  assert.equal(harness.visual(rows[6]), null);
  assert.equal(harness.visual(rows[7]), null);
  assert.equal(harness.runtime().diagnose().overflowCandidates, 2);
});

await scenario("sidebar refuses a row without a native title source", () => {
  const harness = createSidebarHarness();
  const row = harness.createRow({ nativeTitle: null });
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar adopts when the native title source appears later", () => {
  const harness = createSidebarHarness({ displayTitle: "Late canonical" });
  const row = harness.createRow({ nativeTitle: null });
  harness.evaluate();
  harness.runFrames();
  const source = harness.dom.document.createElement("span");
  source.className = "truncate";
  source.textContent = "Late native";
  row.layout.appendChild(source);
  row.source = source;
  harness.triggerMutation([{ target: row.layout, addedNodes: [source], removedNodes: [] }]);
  harness.runFrames();
  assert.equal(harness.renderedText(row), "Late canonical");
  assert.equal(source.textContent, "Late native");
});

await scenario("sidebar re-adopts a replaced native title node", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Replacement canonical" });
  const oldSource = row.source;
  const replacement = harness.dom.document.createElement("span");
  replacement.className = "truncate";
  replacement.textContent = "Replacement native";
  oldSource.remove();
  row.layout.prepend(replacement);
  row.source = replacement;
  harness.triggerMutation([{ target: row.layout, addedNodes: [replacement], removedNodes: [oldSource] }]);
  assert.equal(harness.visual(row), null, "old adoption must release synchronously");
  harness.runFrames();
  assert.equal(harness.renderedText(row), "Replacement canonical");
  assert.equal(replacement.textContent, "Replacement native");
});

await scenario("sidebar releases and adopts an entirely replaced row", () => {
  const { harness, row: oldRow } = adoptedSidebar({ displayTitle: "Row replacement canonical" });
  const container = oldRow.container;
  oldRow.anchor.remove();
  const newRow = harness.createRow({ container, nativeTitle: "New row native" });
  harness.triggerMutation([{ target: container, addedNodes: [newRow.anchor], removedNodes: [oldRow.anchor] }]);
  assert.equal(oldRow.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(oldRow.anchor.hasAttribute("aria-labelledby"), false);
  harness.runFrames();
  assert.equal(harness.renderedText(newRow), "Row replacement canonical");
});

await scenario("sidebar releases a row whose href is reused for another chat", () => {
  const { harness, row } = adoptedSidebar();
  row.anchor.setAttribute("href", "/c/stage1eb-chat-b");
  harness.triggerMutation([{ target: row.anchor, attributeName: "href" }]);
  assert.equal(harness.visual(row), null);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  harness.runFrames();
  assert.equal(harness.visual(row), null);
});

await scenario("sidebar handles virtualized row disappearance and return", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Virtual canonical" });
  const container = row.container;
  row.anchor.remove();
  harness.triggerMutation([{ target: container, addedNodes: [], removedNodes: [row.anchor] }]);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  container.appendChild(row.anchor);
  harness.triggerMutation([{ target: container, addedNodes: [row.anchor], removedNodes: [] }]);
  harness.runFrames();
  assert.equal(harness.renderedText(row), "Virtual canonical");
});

await scenario("sidebar container collapse and expand rolls back then re-adopts", () => {
  const { harness, row } = adoptedSidebar({ displayTitle: "Collapse canonical" });
  const parent = row.container.parentElement;
  row.container.remove();
  harness.triggerMutation([{ target: parent, addedNodes: [], removedNodes: [row.container] }]);
  assert.equal(harness.visual(row), null);
  parent.appendChild(row.container);
  harness.triggerMutation([{ target: parent, addedNodes: [row.container], removedNodes: [] }]);
  harness.runFrames();
  assert.equal(harness.renderedText(row), "Collapse canonical");
});

await scenario("sidebar rollback restores originally absent aria-labelledby", () => {
  const { harness, row } = adoptedSidebar();
  assert.equal(row.anchor.hasAttribute("aria-labelledby"), true);
  harness.emit({ convergence: { enabled: false, mode: "legacy" } });
  assert.equal(row.anchor.hasAttribute("aria-labelledby"), false);
});

await scenario("sidebar rollback restores original aria-labelledby exactly", () => {
  const { harness, row } = adoptedSidebar({ ariaLabelledby: "native-label native-detail" });
  assert.notEqual(row.anchor.getAttribute("aria-labelledby"), "native-label native-detail");
  harness.emit({ convergence: { enabled: false, mode: "legacy" } });
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "native-label native-detail");
});

await scenario("sidebar never writes the anchor aria-label", () => {
  const { harness, row } = adoptedSidebar({ ariaLabel: "Native accessible label" });
  assert.equal(row.anchor.getAttribute("aria-label"), "Native accessible label");
  harness.emit({ displayTitle: "Changed canonical" });
  harness.runFrames();
  assert.equal(row.anchor.getAttribute("aria-label"), "Native accessible label");
});

await scenario("sidebar never writes the anchor title", () => {
  const { harness, row } = adoptedSidebar({ title: "Native hover title" });
  assert.equal(row.anchor.getAttribute("title"), "Native hover title");
  harness.emit({ displayTitle: "Changed canonical" });
  harness.runFrames();
  assert.equal(row.anchor.getAttribute("title"), "Native hover title");
});

await scenario("sidebar writes no native raw-title attributes", () => {
  const { row } = adoptedSidebar();
  for (const element of [row.anchor, row.source, ...row.layout.children]) {
    assert.equal(
      [...element._attributes.keys()].some((name) => /^data-ho-raw-title(?:-|$)/u.test(name)),
      false,
    );
  }
});

await scenario("reader INV-1 returns unchanged clean native base for every clean reader", () => {
  const { harness, row } = adoptedSidebar({
    nativeTitle: "Clean native base",
    displayTitle: "✨ Canonical display",
  });
  const coordinator = createB0Harness({ flag: true });
  const fixture = coordinator.setSidebarReaderFixture(
    "Clean native base",
    "✨ Canonical display contamination sentinel",
  );
  assert.equal(fixture.native.closest("[data-h2o-owner]"), null);
  assert.equal(fixture.visual.closest("[data-h2o-owner]"), fixture.visual);
  assert.equal(coordinator.hook.readSidebarTitle("stage1e-chat-a"), "Clean native base");
  fixture.removeVisualOwnership();
  assert.notEqual(
    coordinator.hook.readSidebarTitle("stage1e-chat-a"),
    "Clean native base",
    "negative control must expose contamination when ownership is absent",
  );
  fixture.restoreVisualOwnership();
  assert.equal(coordinator.hook.readSidebarTitle("stage1e-chat-a"), "Clean native base");
  fixture.replaceNative("Replacement native base");
  assert.equal(
    coordinator.hook.readSidebarTitle("stage1e-chat-a"),
    "Replacement native base",
    "native replacement window must still exclude the old owned visual",
  );
  const readers = runReaderSlices(harness, row);
  assert.equal(readers.f1cNative, "Clean native base");
  assert.equal(readers.f2aNative, "Clean native base");
  assert.equal(readers.f3aNative, "Clean native base");
  assert.equal(readers.f6aTruncateTarget, "Clean native base");
  assert.equal(readers.f6aTruncateMatchedVisual, false);
  assert.equal(readers.f6aVisualAfterTruncateTarget, "✨ Canonical display");
});

await scenario("reader INV-2 intentional rendered readers see canonical display", () => {
  const { harness, row } = adoptedSidebar({
    nativeTitle: "Clean native base",
    displayTitle: "✨ Canonical display",
  });
  const readers = runReaderSlices(harness, row);
  assert.equal(readers.f3aRendered, "✨ Canonical display");
  assert.equal(readers.f6aRendered, "✨ Canonical display");
  assert.equal(readers.d3aRendered, "✨ Canonical display");
});

await scenario("reader INV-2 genuine Library re-entry cannot contaminate base or duplicate emoji", async () => {
  const coordinator = createB0Harness({ flag: true });
  const chatId = coordinator.api.getState().chatId;
  await seedConfirmedUserTitle(coordinator, "✨ Clean native base", "library-reentry-ordinary-seed");
  const sidebar = adoptedSidebar({
    nativeTitle: "Clean native base",
    displayTitle: "✨ Clean native base",
  });
  const rendered = runReaderSlices(sidebar.harness, sidebar.row).f6aRendered;
  const before = currentRecord(coordinator);
  const callsBefore = coordinator.hook.setTitleCallCount();
  coordinator.setLibraryTitle(chatId, rendered);
  assert.equal(coordinator.hook.readLibraryTitle(chatId), rendered);
  coordinator.hook.detectTitles("stage1eb-library-rendered-reentry");
  assert(coordinator.hook.setTitleCallCount() > callsBefore, "detectTitles must execute setTitle");
  assert.deepEqual(currentRecord(coordinator), before);
  assert.equal(coordinator.api.getState().displayTitle, "✨ Clean native base");
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("reader INV-2 repeated four-cycle Library re-entry is idempotent", async () => {
  const coordinator = createB0Harness({ flag: true });
  const chatId = coordinator.api.getState().chatId;
  await seedConfirmedUserTitle(coordinator, "✨ Cycle-safe title", "library-reentry-cycle-seed");
  const before = currentRecord(coordinator);
  for (let cycle = 0; cycle < 4; cycle += 1) {
    coordinator.setLibraryTitle(chatId, coordinator.api.getState().displayTitle);
    coordinator.hook.detectTitles(`stage1eb-library-cycle-${cycle}`);
    assert.equal(coordinator.api.getState().displayTitle, "✨ Cycle-safe title");
  }
  assert.deepEqual(currentRecord(coordinator), before);
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("reader INV-2 multi-code-point emoji Library re-entry remains single", async () => {
  const coordinator = createB0Harness({ flag: true });
  const chatId = coordinator.api.getState().chatId;
  await seedConfirmedUserTitle(coordinator, "👩🏽‍💻 Developer notes", "library-reentry-multi-seed");
  const before = currentRecord(coordinator);
  coordinator.setLibraryTitle(chatId, coordinator.api.getState().displayTitle);
  coordinator.hook.detectTitles("stage1eb-library-multi-reentry");
  assert.deepEqual(currentRecord(coordinator), before);
  assert.equal(coordinator.api.getState().emoji, "👩🏽‍💻");
  assert.equal(coordinator.api.getState().displayTitle, "👩🏽‍💻 Developer notes");
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("reader INV-2 real chooseBetterTitle cannot poison user-tier canonical state", async () => {
  const coordinator = createB0Harness({ flag: true });
  const chatId = coordinator.api.getState().chatId;
  await seedConfirmedUserTitle(coordinator, "✨ User title", "library-reentry-priority-seed");
  const before = currentRecord(coordinator);
  const longerLibraryValue = chooseBetterLibraryTitle(
    "Short cache",
    "✨ User title with a much longer stale Library description",
    chatId,
  );
  assert.equal(longerLibraryValue, "✨ User title with a much longer stale Library description");
  coordinator.setLibraryTitle(chatId, longerLibraryValue);
  coordinator.hook.detectTitles("stage1eb-library-longer-reentry");
  assert.deepEqual(currentRecord(coordinator), before);
  assert.equal(coordinator.api.getState().displayTitle, "✨ User title");
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("reader INV-2 inactive Library row remains non-mutating", async () => {
  const coordinator = createB0Harness({ flag: true });
  const activeChatId = coordinator.api.getState().chatId;
  const inactiveChatId = "stage1e-chat-inactive";
  await seedConfirmedUserTitle(coordinator, "✨ Active title", "library-reentry-inactive-seed");
  const activeBefore = currentRecord(coordinator);
  const inactiveBefore = recordFor(coordinator, inactiveChatId);
  coordinator.setLibraryTitle(inactiveChatId, "🚀 Inactive canonical display");
  coordinator.hook.detectTitles("stage1eb-library-inactive-reentry");
  assert.deepEqual(currentRecord(coordinator), activeBefore);
  assert.deepEqual(recordFor(coordinator, inactiveChatId), inactiveBefore);
  assert.equal(coordinator.api.getState().chatId, activeChatId);
  assert.equal(coordinator.effects.fetches.length, 0);
});

await scenario("sidebar route A to B never leaks A display onto B", () => {
  const harness = createSidebarHarness({ displayTitle: "Chat A canonical" });
  const container = harness.ensureContainer();
  const rowA = harness.createRow({ container, href: "/c/stage1eb-chat-a", nativeTitle: "Chat A native" });
  const rowB = harness.createRow({ container, href: "/c/stage1eb-chat-b", nativeTitle: "Chat B native" });
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.renderedText(rowA), "Chat A canonical");
  harness.setLocation("/c/stage1eb-chat-b");
  harness.emit({
    chatId: "stage1eb-chat-b",
    routeToken: 2,
    baseTitle: "Chat B native",
    displayTitle: "Chat B canonical",
  });
  assert.equal(harness.visual(rowA), null);
  assert.equal(harness.renderedText(rowB), "Chat B native");
  harness.runFrames();
  assert.equal(harness.renderedText(rowB), "Chat B canonical");
});

await scenario("sidebar flag rollback restores exact native state", () => {
  const { harness, row } = adoptedSidebar({
    nativeTitle: "Exact native bytes",
    ariaLabelledby: "native-id",
  });
  harness.emit({ convergence: { enabled: false, mode: "legacy" } });
  assert.equal(row.source.textContent, "Exact native bytes");
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "native-id");
  assert.equal(harness.visual(row), null);
  assert.equal(harness.dom.document.getElementById("h2o-title-sidebar-renderer-style-v1"), null);
});

await scenario("sidebar boot crash recovery removes stale adoption and restores escrow", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow({ nativeTitle: "Crash native" });
  const { visual: stale } = installStaleSidebarAdoption(harness, row, {
    staleId: "stale-visual",
    originalPresent: true,
    originalValue: "native-before-crash",
  });
  harness.evaluate();
  assert.equal(stale.isConnected, false);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "native-before-crash");
});

await scenario("sidebar crash recovery removes stale aria when original was absent", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow();
  installStaleSidebarAdoption(harness, row, { originalPresent: false });
  harness.evaluate();
  assert.equal(row.anchor.hasAttribute("aria-labelledby"), false);
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
});

await scenario("sidebar crash recovery preserves fresh React aria after originally absent state", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow();
  installStaleSidebarAdoption(harness, row, {
    originalPresent: false,
    currentValue: "react-fresh-label",
  });
  harness.evaluate();
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "react-fresh-label");
});

await scenario("sidebar crash recovery preserves fresh React aria over escrowed original", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow();
  installStaleSidebarAdoption(harness, row, {
    originalPresent: true,
    originalValue: "native-before-crash",
    currentValue: "react-fresh-label",
  });
  harness.evaluate();
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "react-fresh-label");
});

await scenario("sidebar crash recovery is idempotent", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const row = harness.createRow();
  installStaleSidebarAdoption(harness, row, {
    originalPresent: true,
    originalValue: "native-before-crash",
    currentValue: "react-fresh-label",
  });
  harness.evaluate();
  const afterFirst = row.anchor.getAttribute("aria-labelledby");
  harness.evaluate();
  assert.equal(row.anchor.getAttribute("aria-labelledby"), afterFirst);
  assert.equal(row.anchor.hasAttribute("data-h2o-title-sidebar-adopted"), false);
});

await scenario("sidebar crash recovery preserves fresh aria when stale visual is already missing", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const container = harness.ensureContainer();
  const row = harness.createRow({ container });
  const danglingRow = harness.createRow({ container });
  installStaleSidebarAdoption(harness, row, {
    includeVisual: false,
    originalPresent: true,
    originalValue: "native-before-crash",
    currentValue: "react-fresh-label",
  });
  installStaleSidebarAdoption(harness, danglingRow, {
    includeVisual: false,
    staleId: "missing-stale-visual",
    originalPresent: false,
  });
  harness.evaluate();
  assert.equal(row.anchor.getAttribute("aria-labelledby"), "react-fresh-label");
  assert.equal(row.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(danglingRow.anchor.hasAttribute("aria-labelledby"), false);
});

await scenario("sidebar crash recovery restores duplicate rows independently", () => {
  const harness = createSidebarHarness({ convergence: { enabled: false, mode: "legacy" } });
  const container = harness.ensureContainer();
  const absentRow = harness.createRow({ container });
  const presentRow = harness.createRow({ container });
  installStaleSidebarAdoption(harness, absentRow, {
    staleId: "stale-duplicate-absent",
    originalPresent: false,
  });
  installStaleSidebarAdoption(harness, presentRow, {
    staleId: "stale-duplicate-present",
    originalPresent: true,
    originalValue: "native-duplicate-original",
  });
  harness.evaluate();
  assert.equal(absentRow.anchor.hasAttribute("aria-labelledby"), false);
  assert.equal(presentRow.anchor.getAttribute("aria-labelledby"), "native-duplicate-original");
  assert.equal(absentRow.source.getAttribute("data-h2o-title-native-hidden"), null);
  assert.equal(presentRow.source.getAttribute("data-h2o-title-native-hidden"), null);
});

await scenario("sidebar destroy and reinstall leaves one runtime subscription observer and visual", () => {
  const harness = createSidebarHarness({ displayTitle: "Reinstall canonical" });
  const row = harness.createRow();
  harness.evaluate();
  harness.runFrames();
  harness.evaluate();
  harness.runFrames();
  assert.equal(harness.subscriptionCount(), 1);
  assert.equal(harness.observerCount(), 1);
  assert.equal(row.anchor.querySelectorAll(
    '[data-h2o-owner="title-sidebar-renderer"][data-h2o-title-role="visual"]',
  ).length, 1);
});

await scenario("sidebar native-source replacement releases synchronously", () => {
  const { harness, row } = adoptedSidebar();
  const oldSource = row.source;
  const replacement = harness.dom.document.createElement("span");
  replacement.className = "truncate";
  replacement.textContent = "Replacement";
  oldSource.remove();
  row.layout.prepend(replacement);
  row.source = replacement;
  harness.triggerMutation([{ target: row.layout, addedNodes: [replacement], removedNodes: [oldSource] }]);
  assert.equal(harness.visual(row), null);
  assert.equal(oldSource.getAttribute("data-h2o-title-native-hidden"), null);
});

await scenario("sidebar ignores renderer-owned mutations without rescan loops", () => {
  const { harness, row } = adoptedSidebar();
  const scans = harness.runtime().diagnose().scans;
  const visual = harness.visual(row);
  harness.triggerMutation([{ target: visual, addedNodes: [visual], removedNodes: [] }]);
  harness.runFrames();
  assert.equal(harness.runtime().diagnose().scans, scans);
});

await scenario("sidebar INV-3 performs zero PATCH or network calls", () => {
  const { harness } = adoptedSidebar({ displayTitle: "No network" });
  assert.equal(harness.mutations.patches, 0);
});

await scenario("sidebar INV-3 performs zero Store boot-cache or localStorage writes", () => {
  const { harness } = adoptedSidebar({ displayTitle: "No persistence" });
  assert.equal(harness.mutations.storeWrites, 0);
  assert.deepEqual(harness.effects.storageOps, []);
});

await scenario("sidebar INV-3 performs zero canonical mutations", () => {
  const { harness } = adoptedSidebar({ displayTitle: "No mutation" });
  assert.equal(harness.mutations.canonical, 0);
});

structuralTest("9B0a alone owns the convergence flag key", () => {
  assert.equal(
  (b0Source.match(new RegExp(FLAG_KEY.replaceAll(".", "\\."), "gu")) || []).length >= 1,
  true,
  "9B0a must own the convergence flag",
  );
  assert.equal(b1Source.includes(FLAG_KEY), false, "9B1a must not resolve the flag independently");
  assert.equal(c1Source.includes(FLAG_KEY), false, "9C1a must not resolve the flag independently");
});
structuralTest("9C1a has no direct canonical setTitle submission", () => {
  assert.equal(/\.setTitle\s*\(/u.test(c1Source), false);
});

structuralTest("9B2a consumes canonical display without formatter authority", () => {
  assert.match(b2Source, /snapshot\.displayTitle/u);
  assert.equal(/\b(?:sanitize|formatNative|composeTitle|splitEmoji)\w*\s*\(/u.test(b2Source), false);
  assert.equal(b2Source.includes(FLAG_KEY), false);
  assert.equal(/ChatTitle\.(?:getState|setTitle|setEmoji|renameNative|refresh|refreshDisplay)\s*\(/u.test(b2Source), false);
});

structuralTest("9B2a contains no network persistence or forbidden native-text writes", () => {
  assert.equal(/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage)\b/u.test(b2Source), false);
  assert.equal(/\bStore\s*\./u.test(b2Source), false);
  assert.equal(
    /\.setAttribute\s*\(\s*['"](?:aria-label|title|data-ho-raw-title(?:-[^'"]*)?)['"]/u.test(b2Source),
    false,
  );
  assert.equal(/className\s*=\s*['"][^'"]*truncate/u.test(b2Source), false);
});

structuralTest("9B2a ownership accessibility escrow and recovery markers are explicit", () => {
  for (const marker of [
    'data-h2o-owner',
    'data-h2o-title-role',
    'data-h2o-title-chat-id',
    'data-h2o-title-route-token',
    'aria-labelledby',
    'WeakMap',
    'recoverStaleDom',
  ]) assert.equal(b2Source.includes(marker), true, `missing 9B2a marker: ${marker}`);
  assert.equal(/setAttribute\s*\(\s*['"]dir['"]\s*,\s*['"]auto['"]/u.test(b2Source), true);
});

structuralTest("loader order registers 9B2a after confirmed consumers and before disabled 9D1a", () => {
  const order = fs.readFileSync(path.join(ROOT, DEV_ORDER_REL), "utf8").split(/\r?\n/u);
  const b0 = order.findIndex((line) => line.includes("9B0a."));
  const b1 = order.findIndex((line) => line.includes("9B1a."));
  const c1 = order.findIndex((line) => line.includes("9C1a."));
  const b2 = order.findIndex((line) => line.includes("9B2a."));
  const d1 = order.findIndex((line) => line.includes("9D1a."));
  assert(b0 < b1 && b1 < c1 && c1 < b2 && b2 < d1);
  assert.match(order[b2], /^🟢\t/u);
  assert.match(order[d1], /^🔴\t/u);
  const deps = JSON.parse(fs.readFileSync(path.join(ROOT, LOADER_DEPS_REL), "utf8"));
  const spec = deps.scripts["9B2a._Sidebar_Title_Renderer_.js"];
  assert.deepEqual(spec.dependsOn, ["9B0a._Chat_Title_State_.js"]);
  assert.deepEqual(spec.after, ["9B1a._Tab_Title_.js", "9C1a._Title_Under_Input_bar_.js"]);
  assert.deepEqual(
    deps.scripts["9D1a._Auto_Emoji_Title_.js"].after,
    ["9C1a._Title_Under_Input_bar_.js"],
    "disabled 9D1a ordering must remain independent of 9B2a",
  );
});

structuralTest("native reader extraction slices remain byte-pinned", () => {
  for (const [key, expected] of Object.entries(EXPECTED_READER_SLICE_SHA256)) {
    assert.equal(sha256(readerSlices[key]), expected, `${key} extraction slice changed`);
  }
  for (const [relative, expectedBlob] of Object.entries(EXPECTED_READER_BLOBS)) {
    assert.equal(run("git", ["rev-parse", `HEAD:${relative}`]).trim(), expectedBlob);
  }
});

structuralTest("native reader harness distinguishes textContent from rendered innerText", () => {
  const effects = makeEffects();
  const dom = createMiniDom(effects);
  const row = dom.document.createElement("a");
  const native = dom.document.createElement("span");
  const visual = dom.document.createElement("span");
  native.textContent = "Native clean";
  native.setAttribute("data-h2o-title-native-hidden", "1");
  visual.textContent = "✨ Canonical";
  row.append(native, visual);
  dom.document.body.appendChild(row);
  assert.equal(row.textContent, "Native clean✨ Canonical");
  assert.equal(row.innerText, "✨ Canonical");
});

structuralTest("Stage 1E-b dirty changes are exactly the authorized five paths", () => {
  const changed = new Set([
    ...splitNul(run("git", ["diff", "--name-only", "-z", "HEAD", "--"])),
    ...splitNul(run("git", ["ls-files", "-z", "--others", "--exclude-standard", "--"])),
  ]);
  assert(sameSet(changed, STAGE1EB_COMMITTED), `unexpected Stage 1E-b path: ${[...changed].sort()}`);
});

structuralTest("protected title coordinator consumers readers and disabled module remain unchanged", () => {
  const protectedPaths = [
    B0_REL,
    B1_REL,
    C1_REL,
    F1C_REL,
    F0D_REL,
    F2A_REL,
    F3A_REL,
    F6A_REL,
    D3A_REL,
    "src-runtime-base/9A1b.🟫🖥️ Chat List Decorator 🎨🖥️.js",
    "src-runtime-base/9A1c.🟫🖥️ Chat Meta Enricher 🧾🖥️.js",
    "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js",
    "packages/title-contract/index.mjs",
    "tools/product/extensions/chatgpt/chrome/title-contract/make-title-contract-bridge.mjs",
    "tools/validation/title-interface/validate-title-contract-bridge-v1.mjs",
    STAGE1C_REL,
  ];
  for (const relative of protectedPaths) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, `missing protected source: ${relative}`);
  }
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", ...protectedPaths]).trim(), "");
});

assert.equal(scopeTests.length, 14, "Stage 1E scope scenario count drifted");
assert.equal(scenarios.length, 97, "Stage 1E runtime scenario count drifted");
assert.equal(structuralAssertions.length, 10, "Stage 1E structural assertion count drifted");

console.log(JSON.stringify({
  ok: true,
  validator: "title-stage1e-convergence-v1",
  scopeMode,
  scopeScenarios: scopeTests.length,
  runtimeScenarios: scenarios.length,
  structuralAssertions: structuralAssertions.length,
  authorizedPaths: [...(requestedMode === "stage1eb-sidebar" ? STAGE1EB_COMMITTED : AUTHORIZED)].sort(),
}));
