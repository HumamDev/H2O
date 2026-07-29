#!/usr/bin/env node

import assert from "node:assert/strict";
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
const C1_REL = "src-runtime-base/9C1a.🟤📌 Title Under Input bar 📌.js";
const SELF_REL = "tools/validation/title-interface/validate-title-stage1e-convergence-v1.mjs";
const STAGE1C_REL = "tools/validation/title-interface/validate-title-stage1c-formatter-parity.mjs";
const ADR_REL = "docs/decisions/ADR-0011-title-management-contract.md";
const FLAG_KEY = "title.threeSurfaceConvergenceV1";
const OVERRIDE_KEY = "__H2O_TITLE_THREE_SURFACE_CONVERGENCE_V1__";
const AUTHORIZED = new Set([B0_REL, B1_REL, C1_REL, SELF_REL, STAGE1C_REL, ADR_REL]);
const AUTHORIZED_TRACKED = new Set([B0_REL, B1_REL, C1_REL, STAGE1C_REL, ADR_REL]);
const AUTHORIZED_UNTRACKED = new Set([SELF_REL]);
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

const scopeTests = [];
const scenarios = [];

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

function classifyScope({ modifiedTracked, staged, untracked }) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  assert.equal(stagedPaths.size, 0, `staged paths forbidden: ${[...stagedPaths].sort().join(", ")}`);
  assert(
    sameSet(modified, AUTHORIZED_TRACKED),
    `tracked Stage 1E scope mismatch: ${JSON.stringify([...modified].sort())}`,
  );
  assert(
    sameSet(untrackedPaths, AUTHORIZED_UNTRACKED),
    `untracked Stage 1E scope mismatch: ${JSON.stringify([...untrackedPaths].sort())}`,
  );
  assert(
    sameSet(new Set([...modified, ...untrackedPaths]), AUTHORIZED),
    "combined Stage 1E scope must contain exactly six paths",
  );
  return "stage1e-convergence";
}

function currentScope() {
  return {
    modifiedTracked: splitNul(run("git", ["diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", "HEAD", "--"])),
    staged: splitNul(run("git", ["diff", "--cached", "--name-only", "-z", "--"])),
    untracked: splitNul(run("git", ["ls-files", "-z", "--others", "--exclude-standard", "--"])),
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

const actualScope = currentScope();
assert.equal(classifyScope(actualScope), "stage1e-convergence");

scopeTest("exact authorized six-file scope is accepted", () => {
  assert.equal(classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [],
    untracked: [...AUTHORIZED_UNTRACKED],
  }), "stage1e-convergence");
});
scopeTest("seventh tracked path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "foreign.js"],
    staged: [],
    untracked: [...AUTHORIZED_UNTRACKED],
  }), /tracked Stage 1E scope mismatch/u);
});
scopeTest("seventh untracked path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [],
    untracked: [...AUTHORIZED_UNTRACKED, "foreign.tmp"],
  }), /untracked Stage 1E scope mismatch/u);
});
scopeTest("staged path is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED],
    staged: [B0_REL],
    untracked: [...AUTHORIZED_UNTRACKED],
  }), /staged paths forbidden/u);
});
scopeTest("config change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "config/dev-order.tsv"],
    staged: [],
    untracked: [...AUTHORIZED_UNTRACKED],
  }), /tracked Stage 1E scope mismatch/u);
});
scopeTest("disabled 9D1a change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "src-runtime-base/9D1a.🟤📱 Auto Emoji Title 📱.js"],
    staged: [],
    untracked: [...AUTHORIZED_UNTRACKED],
  }), /tracked Stage 1E scope mismatch/u);
});
scopeTest("generated output change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "apps/dev-server/alias/9B0a._Chat_Title_State_.js"],
    staged: [],
    untracked: [...AUTHORIZED_UNTRACKED],
  }), /tracked Stage 1E scope mismatch/u);
});
scopeTest("publication-safety change is rejected", () => {
  assert.throws(() => classifyScope({
    modifiedTracked: [...AUTHORIZED_TRACKED, "tools/publish/canonical-write-guard.mjs"],
    staged: [],
    untracked: [...AUTHORIZED_UNTRACKED],
  }), /tracked Stage 1E scope mismatch/u);
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
  assert.equal(source.split(anchor).length - 1, 1, "9B0a boot anchor drifted");
  return source.replace(anchor, `
  W.__H2O_STAGE1E_B0_TEST__ = Object.freeze({
    displayFrom,
    legacyDisplayFrom,
    sanitizeNativeBaseTitle,
    resolveConvergenceStatus,
    currentRecord: () => ({ ...activeRecord }),
    recordFor: (chatId) => {
      const record = records.get(chatId);
      return record ? { ...record } : null;
    },
    currentRouteToken: () => routeToken,
    currentConvergence: () => ({ ...lastConvergenceStatus }),
    destroy,
  });
  boot();
`);
}

function createB0Harness({ flag = false, bridge = "valid", documentTitle = "Initial base - ChatGPT" } = {}) {
  const effects = makeEffects();
  const storage = makeStorage(effects);
  const timers = makeTimers(effects);
  const windowEvents = makeEventHub();
  const documentEvents = makeEventHub();
  const titleNode = {};
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
      return selector === "title" ? titleNode : null;
    },
    querySelectorAll() {
      return [];
    },
    createTreeWalker() {
      return {
        currentNode: null,
        nextNode() {
          return false;
        },
      };
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
  installContractBridge(context, sandbox, bridge);
  new vm.Script(instrumentB0(b0Source), { filename: `${B0_REL}:stage1e-harness` }).runInContext(context);
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
  const document = {
    ...documentEvents,
    title: "Native fallback - ChatGPT",
    readyState: "complete",
    documentElement,
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
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
    location: {
      pathname: "/c/stage1e-chat-a",
      href: "https://chatgpt.com/c/stage1e-chat-a",
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
  stale.api.refresh("validator-route-change");
  stale.effects.resetTransient();
  stalePatch.resolve(response());
  const staleResult = await staleRename;
  assert.equal(staleResult.status, "route-stale");
  assert.deepEqual(recordFor(stale, oldChatId), oldRecord);
  assert.equal(stale.effects.storageOps.length, 0);
});

await scenario("pending editor text remains local and renameNative is awaited", () => {
  const start = c1Source.indexOf("  async function applyRename(");
  const end = c1Source.indexOf("  function attachChatTitle(", start);
  assert(start >= 0 && end > start, "9C1a applyRename block missing");
  const applyBlock = c1Source.slice(start, end);
  assert(!applyBlock.includes(".setTitle"), "9C1a must not call canonical setTitle");
  assert.match(applyBlock, /result = await api\.renameNative\(/u);
  assert.match(c1Source, /input\.value = editValue;/u);
  assert.match(c1Source, /pendingRenameText = nextBase;/u);
  assert.match(c1Source, /if \(!ensureLabel\(\) \|\| !labelEl \|\| isEditing\) return;/u);
});

await scenario("browser-tab canonical path consumes the canonical snapshot without formatting", () => {
  const harness = createTabHarness({
    chatId: "stage1e-chat-a",
    routeKind: "chat",
    routeToken: 4,
    baseTitle: "Wrong - fallback",
    displayTitle: "✨ Canonical - exact",
    documentTitle: "✨ Canonical - exact",
    convergence: { enabled: true, mode: "canonical" },
  });
  harness.evaluate();
  assert.equal(harness.document.title, "✨ Canonical - exact");
  assert(harness.titleWritesMarked() >= 1);
  assert.match(b1Source, /state\?\.convergence\?\.enabled === true && state\?\.routeKind === 'chat'/u);
});

await scenario("flag disable restores legacy rendering immediately", () => {
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

await scenario("false true false flag cycle leaves title records and persistence bytes unchanged", () => {
  const harness = createB0Harness({ flag: false });
  const recordBefore = currentRecord(harness);
  const storageBefore = harness.storage.snapshot();
  harness.effects.resetTransient();
  harness.setSessionOverride(false);
  harness.api.debug.refreshDisplay("flag-false");
  harness.setSessionOverride(true);
  harness.api.debug.refreshDisplay("flag-true");
  harness.setSessionOverride(false);
  harness.api.debug.refreshDisplay("flag-false-again");
  assert.deepEqual(currentRecord(harness), recordBefore);
  assert.equal(harness.storage.snapshot(), storageBefore);
  assert.equal(harness.effects.storageOps.length, 0);
});

await scenario("display-only canonical scenarios issue zero persistent title writes", () => {
  const harness = createB0Harness({ flag: true });
  harness.effects.resetTransient();
  assert.equal(harness.hook.displayFrom("Display only - intact", "✨"), "✨ Display only - intact");
  harness.api.debug.refreshDisplay("display-only");
  assert.equal(harness.effects.storageOps.length, 0);
  assert.equal(harness.effects.fetches.length, 0);
});

await scenario("destroy and reinstall do not duplicate new listeners or subscriptions", () => {
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
  };
  harness.evaluate();
  const second = {
    subscriptions: harness.activeSubscriptions(),
    listeners: harness.listenerCount(),
    timers: harness.activeTimerCount(),
  };
  assert.deepEqual(second, first);
  assert.equal(second.subscriptions, 1);
});

assert.equal(scopeTests.length, 8, "Stage 1E scope scenario count drifted");
assert.equal(scenarios.length, 20, "Stage 1E runtime scenario count drifted");
assert.equal(
  (b0Source.match(new RegExp(FLAG_KEY.replaceAll(".", "\\."), "gu")) || []).length >= 1,
  true,
  "9B0a must own the convergence flag",
);
assert.equal(b1Source.includes(FLAG_KEY), false, "9B1a must not resolve the flag independently");
assert.equal(c1Source.includes(FLAG_KEY), false, "9C1a must not resolve the flag independently");

console.log(JSON.stringify({
  ok: true,
  validator: "title-stage1e-convergence-v1",
  scopeMode: "stage1e-convergence",
  scopeScenarios: scopeTests.length,
  runtimeScenarios: scenarios.length,
  authorizedPaths: [...AUTHORIZED].sort(),
}));
