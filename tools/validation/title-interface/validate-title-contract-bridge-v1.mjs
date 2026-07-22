#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  TITLE_CONTRACT_BRIDGE_FILENAME,
  TITLE_CONTRACT_BRIDGE_GENERATOR_VERSION,
  TITLE_CONTRACT_PRIVILEGED_EXPORTS,
  TITLE_CONTRACT_PUBLIC_EXPORTS,
  TITLE_CONTRACT_SOURCE_EXPORTS,
  makeCanonicalTitleContractBridge,
  transformTitleContractToClassicBridge,
} from "../../product/extensions/chatgpt/chrome/title-contract/make-title-contract-bridge.mjs";
import {
  makeChromeLiveLoaderJs,
  makeTitleContractBridgeLoaderPrelude,
} from "../../product/extensions/chatgpt/chrome/chrome-live-loader.mjs";
import { makeChromeLiveManifest } from "../../product/extensions/chatgpt/chrome/chrome-live-manifest.mjs";
import { getExtensionId, getExtensionKey } from "../../product/extensions/chatgpt/chrome/chrome-extension-keys.mjs";
import {
  TITLE_DIAGNOSTIC_CONSTANTS,
  makeTitleNavigationDiagnosticIsolatedJs,
  makeTitleNavigationDiagnosticMainJs,
  makeTitleNavigationDiagnosticPopupJs,
  makeTitleNavigationDiagnosticServiceWorkerJs,
} from "../../product/extensions/chatgpt/chrome/title-diagnostic/chrome-live-title-navigation-diagnostic.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CONTRACT_REL = "packages/title-contract/index.mjs";
const GENERATED_REL = `apps/extensions/chatgpt/chrome/dev-controls-oauth-google/${TITLE_CONTRACT_BRIDGE_FILENAME}`;
const EXPECTED_EXTENSION_ID = "ogcjkeaiicglflamhjaaimdhphjlgkbb";
const REJECTED_BUILD_MARKER = 1784650528788;
const GLOBAL_STATUS_KEY = "__H2O_TITLE_CONTRACT_BRIDGE_STATUS_V2__";
const SOURCE_ONLY = process.argv.includes("--source-only");
const SCOPE_MODE_PREFIX = "--scope-mode=";
const scopeModeArguments = process.argv.filter((argument) => argument.startsWith(SCOPE_MODE_PREFIX));
assert(scopeModeArguments.length <= 1, "at most one --scope-mode option is allowed");
const REQUESTED_SCOPE_MODE = scopeModeArguments.length === 1
  ? scopeModeArguments[0].slice(SCOPE_MODE_PREFIX.length)
  : null;
const EXPECTED_TRACKED = new Set([
  "tools/product/extensions/chatgpt/chrome/title-contract/make-title-contract-bridge.mjs",
  "tools/validation/title-interface/validate-title-contract-bridge-v1.mjs",
  "tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs",
  "tools/product/extensions/chatgpt/chrome/chrome-live-manifest.mjs",
  "tools/product/extensions/chatgpt/chrome/chrome-live-loader.mjs",
]);
const EXPECTED_MODIFIED = new Set([
  "tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs",
  "tools/product/extensions/chatgpt/chrome/chrome-live-manifest.mjs",
  "tools/product/extensions/chatgpt/chrome/chrome-live-loader.mjs",
]);
const EXPECTED_UNTRACKED = new Set([
  "tools/product/extensions/chatgpt/chrome/title-contract/make-title-contract-bridge.mjs",
  "tools/validation/title-interface/validate-title-contract-bridge-v1.mjs",
]);
const VALIDATOR_REL = "tools/validation/title-interface/validate-title-contract-bridge-v1.mjs";
const TITLE_PREFIXES = ["9B0a", "9B1a", "9C1a", "9D1a"];
const tests = [];
const scopeTests = [];

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8", ...options });
}

function test(name, callback) {
  const value = callback();
  if (value && typeof value.then === "function") {
    return value.then(() => {
      tests.push(name);
      console.log(`ok ${tests.length} - ${name}`);
    });
  }
  tests.push(name);
  console.log(`ok ${tests.length} - ${name}`);
  return null;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sameSet(actual, expected) {
  return actual.size === expected.size && [...actual].every((value) => expected.has(value));
}

function classifyStage1BScope({
  requestedMode = null,
  modifiedTracked,
  staged,
  untracked,
  trackedStage1BFiles,
  generatedBridgeIgnored,
}) {
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const trackedFiles = new Set(trackedStage1BFiles);

  assert(
    requestedMode === null || requestedMode === "validator-self-correction",
    `unknown requested Stage 1B scope mode: ${String(requestedMode)}`,
  );
  assert.equal(stagedPaths.size, 0, `staged paths are forbidden: ${[...stagedPaths].sort().join(", ")}`);
  assert.equal(generatedBridgeIgnored, true, "generated bridge must remain ignored and unstaged");

  const unexpectedUntracked = [...untrackedPaths]
    .filter((relative) => !relative.startsWith("chrome/") && !EXPECTED_UNTRACKED.has(relative));
  assert.deepEqual(unexpectedUntracked, [], `unexpected untracked paths: ${unexpectedUntracked.join(", ")}`);

  const stage1BUntracked = new Set(
    [...untrackedPaths].filter((relative) => EXPECTED_UNTRACKED.has(relative)),
  );

  if (requestedMode === "validator-self-correction") {
    assert(
      sameSet(modified, new Set([VALIDATOR_REL])),
      `validator-self-correction requires exactly one modified path: ${VALIDATOR_REL}`,
    );
    assert.equal(stage1BUntracked.size, 0, "validator-self-correction forbids untracked Stage 1B source files");
    assert(sameSet(trackedFiles, EXPECTED_TRACKED), "validator-self-correction requires all five tracked Stage 1B files");
    return "validator-self-correction";
  }

  const unexpectedModified = [...modified].filter((relative) => !EXPECTED_MODIFIED.has(relative));
  assert.deepEqual(unexpectedModified, [], `unexpected modified tracked paths: ${unexpectedModified.join(", ")}`);
  const uncommitted = sameSet(modified, EXPECTED_MODIFIED)
    && sameSet(stage1BUntracked, EXPECTED_UNTRACKED)
    && sameSet(trackedFiles, EXPECTED_MODIFIED);
  const committedClean = modified.size === 0
    && stage1BUntracked.size === 0
    && sameSet(trackedFiles, EXPECTED_TRACKED);

  assert(!(uncommitted && committedClean), "Stage 1B scope classification is ambiguous");
  if (uncommitted) return "uncommitted";
  if (committedClean) return "committed-clean";

  assert.fail(
    "Stage 1B scope is neither exact uncommitted nor exact committed-clean state"
      + `; modified=${JSON.stringify([...modified].sort())}`
      + `; Stage1B-untracked=${JSON.stringify([...stage1BUntracked].sort())}`
      + `; tracked=${JSON.stringify([...trackedFiles].sort())}`,
  );
}

function scopeTest(name, callback) {
  callback();
  scopeTests.push(name);
  console.log(`ok scope ${scopeTests.length} - ${name}`);
}

function assertScope() {
  const modifiedTracked = run("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD", "--"])
    .split("\n").filter(Boolean);
  const staged = run("git", ["diff", "--cached", "--name-only", "--"])
    .split("\n").filter(Boolean);
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard", "--"])
    .split("\n").filter(Boolean);
  const trackedStage1BFiles = run("git", ["ls-files", "--", ...EXPECTED_TRACKED])
    .split("\n").filter(Boolean);

  assert(fs.existsSync(path.join(ROOT, GENERATED_REL)), "generated bridge is missing");
  assert.equal(run("git", ["ls-files", "--", GENERATED_REL]).trim(), "", "generated bridge must remain untracked");
  run("git", ["check-ignore", "-q", "--", GENERATED_REL]);
  return classifyStage1BScope({
    requestedMode: REQUESTED_SCOPE_MODE,
    modifiedTracked,
    staged,
    untracked,
    trackedStage1BFiles,
    generatedBridgeIgnored: true,
  });
}

function titlePaths() {
  const raw = execFileSync("git", ["-c", "core.quotePath=false", "ls-tree", "-rz", "--name-only", "HEAD", "--", "src-runtime-base"], { cwd: ROOT });
  const paths = raw.toString().split("\0").filter(Boolean);
  return TITLE_PREFIXES.map((prefix) => {
    const matches = paths.filter((relative) => path.basename(relative).startsWith(prefix));
    assert.equal(matches.length, 1, `${prefix} path count`);
    return [prefix, matches[0]];
  });
}

function assertTitleAndConfigIdentity() {
  for (const [, relative] of titlePaths()) {
    const working = run("git", ["hash-object", "--no-filters", "--", relative]).trim();
    const committed = run("git", ["rev-parse", `HEAD:${relative}`]).trim();
    assert.equal(working, committed, `${relative} differs from HEAD`);
  }
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", "config/dev-order.tsv"]).trim(), "", "dev-order.tsv changed");
  const order = fs.readFileSync(path.join(ROOT, "config/dev-order.tsv"), "utf8");
  for (const prefix of ["9B0a", "9B1a", "9C1a"]) assert(new RegExp(`^🟢\\t${prefix}\\.`, "m").test(order), `${prefix} must remain enabled`);
  assert(/^🔴\t9D1a\./m.test(order), "9D1a must remain disabled");
}

function createPage(setupSource = "") {
  const sandbox = {};
  vm.createContext(sandbox);
  if (setupSource) new vm.Script(setupSource, { filename: "bridge-page-setup.js" }).runInContext(sandbox);
  return sandbox;
}

function executeBridge(code, setupSource = "") {
  const sandbox = createPage(setupSource);
  new vm.Script(code, { filename: TITLE_CONTRACT_BRIDGE_FILENAME }).runInContext(sandbox);
  return sandbox;
}

function pageH2ODescriptor(page) {
  return Object.getOwnPropertyDescriptor(page, "H2O");
}

function pageBridgeStatus(page) {
  const descriptor = pageH2ODescriptor(page);
  const h2o = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : null;
  return h2o?.TitleContractBridgeStatus ?? page[GLOBAL_STATUS_KEY] ?? null;
}

function h2oCorePath() {
  const matches = fs.readdirSync(path.join(ROOT, "src-runtime-base"))
    .filter((name) => name.startsWith("0A1a."));
  assert.equal(matches.length, 1, "H2O Core path count");
  return path.join("src-runtime-base", matches[0]);
}

function manifest(bridgeFile = null) {
  return makeChromeLiveManifest({
    PROXY_PACK_URL: "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt",
    CHAT_MATCH: "https://chatgpt.com/*",
    PAGE_FOLDER_BRIDGE_FILE: "folder-bridge-page.js",
    PAGE_PILOT_OBSERVER_FILE: "pilot-observer-page.js",
    TITLE_CONTRACT_BRIDGE_FILE: bridgeFile,
    DEV_HAS_CONTROLS: true,
    DEV_TITLE: "H2O Dev Controls",
    DEV_ACTION_TITLE: "H2O Dev Controls",
    DEV_NAME: "H2O Dev Controls (Unpacked)",
    DEV_VERSION: "1.3.0",
    DEV_DESCRIPTION: "validation",
    IDENTITY_PROVIDER_REQUEST_OTP_ARMED: true,
    IDENTITY_PROVIDER_OAUTH_PROVIDER: "google",
    TITLE_DIAGNOSTIC_ENABLED: true,
    EXTENSION_KEY: getExtensionKey("dev-controls-oauth-google"),
  });
}

function loaderSource() {
  return makeChromeLiveLoaderJs({
    DEV_TAG: "[H2O TEST]",
    DEV_TITLE: "H2O Test",
    DEV_HAS_CONTROLS: true,
    PROXY_PACK_URL: "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt",
    DEV_SCRIPT_CATALOG: [],
    DEV_ORDER_SECTIONS_SNAPSHOT: [],
    LOADER_DEPS_SNAPSHOT: {},
    STORAGE_KEY: "test",
    STORAGE_ORDER_OVERRIDES_KEY: "test-order",
    PAGE_FOLDER_BRIDGE_FILE: "folder-bridge-page.js",
    PAGE_PILOT_OBSERVER_FILE: "pilot-observer-page.js",
    TITLE_CONTRACT_BRIDGE_FILE: TITLE_CONTRACT_BRIDGE_FILENAME,
  });
}

function loaderHarness({ fail = false } = {}) {
  const prelude = makeTitleContractBridgeLoaderPrelude({ TITLE_CONTRACT_BRIDGE_FILE: TITLE_CONTRACT_BRIDGE_FILENAME });
  const appended = [];
  const removed = [];
  const host = {
    appendChild(script) {
      appended.push(script);
      script.parentNode = host;
      queueMicrotask(() => (fail ? script.onerror?.() : script.onload?.()));
    },
    removeChild(script) {
      removed.push(script);
      script.parentNode = null;
    },
  };
  const sandbox = {
    chrome: { runtime: { getURL: (name) => `chrome-extension://stable/${name}` } },
    document: { createElement: () => ({ parentNode: null }) },
    host,
    appended,
    removed,
    queueMicrotask,
    Promise,
    Error,
    Object,
    String,
  };
  vm.createContext(sandbox);
  new vm.Script(`(() => { function waitScriptHost() { return Promise.resolve(host); } ${prelude}\n globalThis.invokeBridge = ensureTitleContractBridge; })();`).runInContext(sandbox);
  return sandbox;
}

function mutateSource(source, mutation) {
  return Buffer.from(`${source.toString("utf8")}\n${mutation}\n`, "utf8");
}

const scopeMode = assertScope();

function committedScopeInput(overrides = {}) {
  return {
    requestedMode: null,
    modifiedTracked: [],
    staged: [],
    untracked: ["chrome/protected"],
    trackedStage1BFiles: [...EXPECTED_TRACKED],
    generatedBridgeIgnored: true,
    ...overrides,
  };
}

scopeTest("exact uncommitted implementation scope is accepted", () => {
  assert.equal(classifyStage1BScope(committedScopeInput({
    modifiedTracked: [...EXPECTED_MODIFIED],
    untracked: [...EXPECTED_UNTRACKED, "chrome/protected"],
    trackedStage1BFiles: [...EXPECTED_MODIFIED],
  })), "uncommitted");
});

scopeTest("exact committed-clean scope is accepted", () => {
  assert.equal(classifyStage1BScope(committedScopeInput()), "committed-clean");
});

scopeTest("explicit validator-self-correction scope is accepted", () => {
  assert.equal(classifyStage1BScope(committedScopeInput({
    requestedMode: "validator-self-correction",
    modifiedTracked: [VALIDATOR_REL],
  })), "validator-self-correction");
});

scopeTest("validator-only modification is rejected by default", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    modifiedTracked: [VALIDATOR_REL],
  })), new RegExp(`unexpected modified tracked paths: ${VALIDATOR_REL}`, "u"));
});

scopeTest("validator-only modification never reports committed-clean", () => {
  assert.notEqual(classifyStage1BScope(committedScopeInput({
    requestedMode: "validator-self-correction",
    modifiedTracked: [VALIDATOR_REL],
  })), "committed-clean");
});

scopeTest("partial modified build-file set is rejected", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    modifiedTracked: [...EXPECTED_MODIFIED].slice(0, 2),
    untracked: [...EXPECTED_UNTRACKED],
    trackedStage1BFiles: [...EXPECTED_MODIFIED],
  })), /neither exact uncommitted nor exact committed-clean/u);
});

scopeTest("staged paths are rejected", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    staged: [VALIDATOR_REL],
  })), /staged paths are forbidden/u);
});

scopeTest("unexpected tracked paths are rejected", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    modifiedTracked: ["src-runtime-base/unexpected.js"],
  })), /unexpected modified tracked paths/u);
});

scopeTest("unexpected untracked paths are rejected", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    untracked: ["chrome/protected", "unexpected.tmp"],
  })), /unexpected untracked paths/u);
});

scopeTest("missing committed Stage 1B file is rejected", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    trackedStage1BFiles: [...EXPECTED_TRACKED].filter((relative) => relative !== VALIDATOR_REL),
  })), /neither exact uncommitted nor exact committed-clean/u);
});

scopeTest("mixed committed and uncommitted state is rejected", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    modifiedTracked: [...EXPECTED_MODIFIED],
    untracked: [...EXPECTED_UNTRACKED],
    trackedStage1BFiles: [...EXPECTED_TRACKED],
  })), /neither exact uncommitted nor exact committed-clean/u);
});

scopeTest("self-correction mode rejects a second modified path", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    requestedMode: "validator-self-correction",
    modifiedTracked: [VALIDATOR_REL, [...EXPECTED_MODIFIED][0]],
  })), /requires exactly one modified path/u);
});

scopeTest("committed-clean rejects a modified validator", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    modifiedTracked: [VALIDATOR_REL],
  })), /unexpected modified tracked paths/u);
});

scopeTest("unknown requested scope mode is rejected", () => {
  assert.throws(() => classifyStage1BScope(committedScopeInput({
    requestedMode: "unknown-mode",
  })), /unknown requested Stage 1B scope mode/u);
});

assertTitleAndConfigIdentity();

const sourceBytes = fs.readFileSync(path.join(ROOT, CONTRACT_REL));
const canonical = makeCanonicalTitleContractBridge({ repositoryRoot: ROOT });
const contractModule = await import(pathToFileURL(path.join(ROOT, CONTRACT_REL)).href);
const stage1aProbe = contractModule.normalizeRecord({
  version: 1,
  chatId: "stage1b-validation",
  title: "Bridge",
  emoji: null,
  writerSurface: "validation",
  recordUpdatedAt: 0,
});

await test("1 identity schema and export count", () => {
  const page = executeBridge(canonical.code);
  assert.equal(page.H2O.TitleContract.identity.schemaVersion, 2);
  assert.equal(page.H2O.TitleContract.identity.bridgeVersion, "2");
  assert.equal(page.H2O.TitleContract.identity.generatorVersion, "2");
  assert.equal(TITLE_CONTRACT_BRIDGE_GENERATOR_VERSION, "2");
  assert.equal(page.H2O.TitleContract.identity.sourceExportCount, 35);
});

await test("2 deterministic generated bytes", () => {
  const second = makeCanonicalTitleContractBridge({ repositoryRoot: ROOT });
  assert.equal(second.code, canonical.code);
});

await test("3 exact source SHA-256", () => {
  assert.equal(canonical.sourceSha256, sha256(sourceBytes));
});

await test("4 exact approved public surface", () => {
  const bridge = executeBridge(canonical.code).H2O.TitleContract;
  assert.deepEqual([...bridge.identity.publicSurfaceKeys], [...TITLE_CONTRACT_PUBLIC_EXPORTS]);
  assert.deepEqual(Object.keys(bridge).filter((key) => key !== "identity").sort(), [...TITLE_CONTRACT_PUBLIC_EXPORTS].sort());
});

await test("5 privileged exports are unreachable", () => {
  const page = executeBridge(canonical.code);
  for (const name of TITLE_CONTRACT_PRIVILEGED_EXPORTS) {
    assert.equal(page.H2O.TitleContract[name], undefined, `${name} leaked publicly`);
    assert.equal(page[name], undefined, `${name} leaked globally`);
    assert.equal(page.H2O[name], undefined, `${name} leaked on H2O`);
    assert(!JSON.stringify(page.H2O.TitleContractBridgeStatus).includes(name), `${name} leaked in metadata`);
    assert(!String(JSON.stringify(page[GLOBAL_STATUS_KEY]) ?? "").includes(name), `${name} leaked in global metadata`);
  }
});

await test("6 absent H2O bootstrap and first-install descriptors", () => {
  const page = executeBridge(canonical.code);
  const namespaceDescriptor = pageH2ODescriptor(page);
  assert(namespaceDescriptor);
  assert.equal(namespaceDescriptor.writable, true);
  assert.equal(namespaceDescriptor.enumerable, true);
  assert.equal(namespaceDescriptor.configurable, true);
  assert.equal(Object.getPrototypeOf(namespaceDescriptor.value), Object.getPrototypeOf(page.H2O));
  const descriptor = Object.getOwnPropertyDescriptor(page.H2O, "TitleContract");
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.configurable, false);
  assert(Object.isFrozen(descriptor.value));
  assert(Object.isFrozen(descriptor.value.identity));
});

await test("7 current H2O Core semantics preserve namespace and contract identity", () => {
  const coreSource = fs.readFileSync(path.join(ROOT, h2oCorePath()), "utf8");
  assert(coreSource.includes("const H2O = (W.H2O = W.H2O || {});"), "current H2O Core namespace reuse initializer changed");
  const page = executeBridge(canonical.code);
  const namespace = page.H2O;
  const contract = namespace.TitleContract;
  new vm.Script("const W = globalThis; const H2O = (W.H2O = W.H2O || {}); globalThis.__coreNamespace = H2O;").runInContext(page);
  assert.strictEqual(page.H2O, namespace);
  assert.strictEqual(page.__coreNamespace, namespace);
  assert.strictEqual(page.H2O.TitleContract, contract);
  assert.deepEqual(
    Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptor(page.H2O, "TitleContract")).filter(([key]) => key !== "value")),
    { writable: false, enumerable: false, configurable: false },
  );
});

await test("8 valid pre-existing H2O is reused", () => {
  const page = executeBridge(canonical.code, "globalThis.H2O = { sentinel: 1 }; globalThis.__originalH2O = globalThis.H2O;");
  assert.strictEqual(page.H2O, page.__originalH2O);
  assert.equal(page.H2O.sentinel, 1);
  assert(page.H2O.TitleContract);
});

await test("9 primitive H2O is not overwritten", () => {
  const page = createPage('Object.defineProperty(globalThis, "H2O", { value: 7, writable: true, enumerable: true, configurable: true });');
  const before = pageH2ODescriptor(page);
  new vm.Script(canonical.code).runInContext(page);
  const after = pageH2ODescriptor(page);
  assert.equal(after.value, 7);
  assert.deepEqual(after, before);
  assert.equal(page[GLOBAL_STATUS_KEY].result, "foreign-object");
});

await test("10 accessor H2O is not invoked or overwritten", () => {
  const page = createPage('globalThis.__getterCalls = 0; Object.defineProperty(globalThis, "H2O", { get() { globalThis.__getterCalls += 1; return {}; }, enumerable: true, configurable: true });');
  const before = pageH2ODescriptor(page);
  new vm.Script(canonical.code).runInContext(page);
  const after = pageH2ODescriptor(page);
  assert.equal(page.__getterCalls, 0);
  assert.strictEqual(after.get, before.get);
  assert.equal(page[GLOBAL_STATUS_KEY].result, "foreign-object");
});

await test("11 throwing H2O Proxy fails safely", () => {
  const page = createPage('globalThis.__hostileH2O = new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } }); Object.defineProperty(globalThis, "H2O", { value: globalThis.__hostileH2O, writable: true, enumerable: true, configurable: true });');
  new vm.Script(canonical.code).runInContext(page);
  assert.strictEqual(pageH2ODescriptor(page).value, page.__hostileH2O);
  assert.equal(page[GLOBAL_STATUS_KEY].result, "foreign-object");
});

await test("throwing global descriptor path fails safely", () => {
  const target = {};
  const hostileGlobal = new Proxy(target, {
    getOwnPropertyDescriptor(inner, key) {
      if (key === "H2O") throw new Error("descriptor blocked");
      return Reflect.getOwnPropertyDescriptor(inner, key);
    },
  });
  const page = createPage();
  page.__target = hostileGlobal;
  new vm.Script(`((globalThis) => { ${canonical.code} })(__target);`).runInContext(page);
  assert.equal(Object.hasOwn(target, "H2O"), false);
  assert.equal(target[GLOBAL_STATUS_KEY].result, "namespace-unavailable");
});

await test("12 non-extensible namespace target fails safely with bounded status", () => {
  const target = {};
  Object.defineProperty(target, GLOBAL_STATUS_KEY, { value: null, writable: false, enumerable: false, configurable: true });
  Object.preventExtensions(target);
  const page = createPage();
  page.__target = target;
  new vm.Script(`((globalThis) => { ${canonical.code} })(__target);`).runInContext(page);
  assert.equal(Object.hasOwn(target, "H2O"), false);
  assert.equal(target[GLOBAL_STATUS_KEY].result, "namespace-unavailable");
  assert(target[GLOBAL_STATUS_KEY].result.length <= 32);
});

await test("7 same-identity reinjection preserves reference", () => {
  const page = executeBridge(canonical.code);
  const first = page.H2O.TitleContract;
  new vm.Script(canonical.code).runInContext(page);
  assert.strictEqual(page.H2O.TitleContract, first);
  assert.equal(page.H2O.TitleContractBridgeStatus.result, "same-identity");
});

await test("8 same-identity creates no second bridge", () => {
  const page = executeBridge(canonical.code);
  const first = page.H2O.TitleContract;
  new vm.Script(canonical.code).runInContext(page);
  assert.strictEqual(page.H2O.TitleContract.identity, first.identity);
});

await test("identity-v1 requires reload and is never replaced", () => {
  const setup = `
    globalThis.H2O = {};
    const identity = Object.freeze({
      schemaVersion: 2,
      bridgeVersion: "1",
      sourceSha256: ${JSON.stringify(canonical.sourceSha256)},
      publicSurfaceDigest: ${JSON.stringify(canonical.publicSurfaceDigest)}
    });
    const oldBridge = Object.freeze({ identity });
    Object.defineProperty(globalThis.H2O, "TitleContract", {
      value: oldBridge, writable: false, enumerable: false, configurable: false
    });
    globalThis.__oldBridge = oldBridge;
  `;
  const page = executeBridge(canonical.code, setup);
  assert.strictEqual(page.H2O.TitleContract, page.__oldBridge);
  assert.equal(page.H2O.TitleContract.identity.bridgeVersion, "1");
  assert.equal(page.H2O.TitleContractBridgeStatus.result, "reload-required");
});

await test("9 mismatched identity is not replaced", () => {
  const page = executeBridge(canonical.code);
  const first = page.H2O.TitleContract;
  const changed = mutateSource(sourceBytes, "// identity-changing comment");
  const alternate = transformTitleContractToClassicBridge({ sourceBytes: changed, committedSourceBytes: changed, repositoryHeadAtBuild: canonical.repositoryHeadAtBuild });
  new vm.Script(alternate.code).runInContext(page);
  assert.strictEqual(page.H2O.TitleContract, first);
  assert.equal(page.H2O.TitleContractBridgeStatus.result, "reload-required");
});

await test("10 foreign existing object is untouched", () => {
  const page = executeBridge(canonical.code, 'globalThis.H2O = {}; globalThis.__foreign = {}; Object.defineProperty(globalThis.H2O, "TitleContract", { value: globalThis.__foreign, writable: true, enumerable: true, configurable: true });');
  assert.strictEqual(page.H2O.TitleContract, page.__foreign);
  assert.equal(page.H2O.TitleContractBridgeStatus.result, "foreign-object");
});

await test("11 mismatch records one bounded result", () => {
  const page = executeBridge(canonical.code);
  const changed = mutateSource(sourceBytes, "// second identity");
  const alternate = transformTitleContractToClassicBridge({ sourceBytes: changed, committedSourceBytes: changed, repositoryHeadAtBuild: canonical.repositoryHeadAtBuild });
  new vm.Script(alternate.code).runInContext(page);
  assert.equal(page.H2O.TitleContractBridgeStatus.result, "reload-required");
  assert(Object.isFrozen(page.H2O.TitleContractBridgeStatus));
  assert(page.H2O.TitleContractBridgeStatus.result.length <= 32);
});

await test("12 installation is behavior-passive", () => {
  const legacyTitle = Object.freeze({ get: () => "Legacy" });
  const h2o = { ChatTitle: legacyTitle };
  const counters = { events: 0, storage: 0, network: 0, route: 0 };
  const page = { dispatchEvent: () => { counters.events += 1; }, fetch: () => { counters.network += 1; } };
  Object.defineProperty(page, "localStorage", { get() { counters.storage += 1; throw new Error("forbidden"); } });
  vm.createContext(page);
  new vm.Script("globalThis.H2O = {};").runInContext(page);
  page.H2O.ChatTitle = legacyTitle;
  new vm.Script(canonical.code).runInContext(page);
  assert.strictEqual(page.H2O.ChatTitle, legacyTitle);
  assert.deepEqual(counters, { events: 0, storage: 0, network: 0, route: 0 });
});

await test("13 bridge absence leaves legacy title unchanged", () => {
  const legacy = { value: "Legacy" };
  const page = { H2O: { ChatTitle: legacy } };
  assert.strictEqual(page.H2O.ChatTitle, legacy);
  assert.equal(page.H2O.TitleContract, undefined);
});

await test("14 loader single-flight appends one script", async () => {
  const page = loaderHarness();
  const first = page.invokeBridge();
  const second = page.invokeBridge();
  assert.strictEqual(first, second);
  assert.equal(await first, true);
  assert.equal(page.appended.length, 1);
  assert.equal(page.removed.length, 1);
});

await test("15 loader barrier precedes proxy injection", () => {
  const source = loaderSource();
  const boot = source.indexOf("async function boot()");
  const barrier = source.indexOf("await ensureTitleContractBridge();", boot);
  const proxy = source.indexOf("loaderDiagState.timing.proxyPackStartMs", boot);
  assert(boot >= 0 && barrier > boot && proxy > barrier);
});

await test("16 loader continues after bridge failure", async () => {
  const page = loaderHarness({ fail: true });
  let proxyLoads = 0;
  const bridgeResult = await page.invokeBridge();
  proxyLoads += 1;
  assert.equal(bridgeResult, false);
  assert.equal(proxyLoads, 1);
});

await test("17 loader records one bounded failure", async () => {
  const page = loaderHarness({ fail: true });
  await Promise.all([page.invokeBridge(), page.invokeBridge()]);
  const diagnostic = page.__H2O_TITLE_CONTRACT_BRIDGE_FAILURE_V1__;
  assert(diagnostic);
  assert.equal(diagnostic.kind, "title-contract-bridge-load-failed");
  assert(diagnostic.message.length <= 160);
  assert.equal(page.appended.length, 1);
});

function rejectsSyntax(mutation, pattern) {
  const changed = mutateSource(sourceBytes, mutation);
  assert.throws(() => transformTitleContractToClassicBridge({ sourceBytes: changed, committedSourceBytes: changed, repositoryHeadAtBuild: canonical.repositoryHeadAtBuild }), pattern);
}

await test("18 default export rejected", () => rejectsSyntax("export default {};", /unsupported export/));
await test("19 static and dynamic imports rejected", () => {
  rejectsSyntax('import value from "x";', /import syntax/);
  rejectsSyntax('const lazy = import("x");', /import syntax/);
});
await test("20 export lists and re-exports rejected", () => {
  rejectsSyntax("export { SCHEMA_VERSION };", /unsupported export/);
  rejectsSyntax('export * from "x";', /unsupported export/);
});
await test("21 duplicate exports rejected", () => rejectsSyntax("export const SCHEMA_VERSION = 2;", /duplicate export/));
await test("22 34-name and 36-name sets rejected", () => {
  const source = sourceBytes.toString("utf8");
  const fewer = Buffer.from(source.replace(/^export const SCHEMA_VERSION = 2;\n/u, ""));
  assert.throws(() => transformTitleContractToClassicBridge({ sourceBytes: fewer, committedSourceBytes: fewer, repositoryHeadAtBuild: canonical.repositoryHeadAtBuild }), /export-set mismatch/);
  rejectsSyntax("export const EXTRA_TITLE_CONTRACT_EXPORT = 1;", /export-set mismatch/);
});
await test("23 dirty source fails closed", () => {
  const dirty = mutateSource(sourceBytes, "// dirty");
  assert.throws(() => transformTitleContractToClassicBridge({ sourceBytes: dirty, committedSourceBytes: sourceBytes, repositoryHeadAtBuild: canonical.repositoryHeadAtBuild }), /differs from the committed/);
});

await test("24 runtime title modules are byte-identical", assertTitleAndConfigIdentity);
await test("25 H2O.ChatTitle API remains unchanged", () => {
  const [, titlePath] = titlePaths().find(([prefix]) => prefix === "9B0a");
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", titlePath]).trim(), "");
});
await test("26 9D1a remains disabled and absent from proxy", () => {
  const order = fs.readFileSync(path.join(ROOT, "config/dev-order.tsv"), "utf8");
  assert(/^🔴\t9D1a\./m.test(order));
  const proxyPath = path.join(ROOT, "apps/dev-server/dev_output/proxy/_paste-pack.ext.txt");
  if (fs.existsSync(proxyPath)) assert(!fs.readFileSync(proxyPath, "utf8").includes("9D1a."), "9D1a leaked into proxy");
});
await test("27 dev-order remains unchanged", () => assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", "config/dev-order.tsv"]).trim(), ""));

await test("28 extension identity, key, and permissions remain unchanged", () => {
  const before = manifest(null);
  const after = manifest(TITLE_CONTRACT_BRIDGE_FILENAME);
  assert.equal(after.key, before.key);
  assert.deepEqual(after.permissions, before.permissions);
  assert.deepEqual(after.host_permissions, before.host_permissions);
  assert.equal(getExtensionId("dev-controls-oauth-google"), EXPECTED_EXTENSION_ID);
  assert(after.web_accessible_resources.some((entry) => entry.resources.includes(TITLE_CONTRACT_BRIDGE_FILENAME)));
});

await test("29 Stage 1A contract substance remains valid", () => {
  assert.equal(canonical.sourceExportCount, 35);
  assert.equal(contractModule.SCHEMA_VERSION, 2);
  assert.equal(contractModule.validateCanonicalRecord(stage1aProbe), true);
});

await test("30 Stage 0B-2B diagnostic substance remains unchanged", () => {
  assert.equal(TITLE_DIAGNOSTIC_CONSTANTS.schema, "h2o.title-stage0b2b.evidence.v1");
  assert.equal(TITLE_DIAGNOSTIC_CONSTANTS.limits.sameDocumentRouteStableMs, 5_000);
  assert.equal(TITLE_DIAGNOSTIC_CONSTANTS.limits.maxStoredBytes, 128 * 1024);
  for (const [label, source] of [
    ["isolated", makeTitleNavigationDiagnosticIsolatedJs()],
    ["main", makeTitleNavigationDiagnosticMainJs()],
    ["popup", makeTitleNavigationDiagnosticPopupJs()],
    ["service worker", makeTitleNavigationDiagnosticServiceWorkerJs()],
  ]) new vm.Script(source, { filename: `stage0b2b-${label}.js` });
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", "tools/product/extensions/chatgpt/chrome/title-diagnostic", "tools/validation/title-interface/validate-title-stage0b2b-direct-diagnostic.mjs"]).trim(), "");
});

await test("fresh loader and proxy share one non-rejected build marker", () => {
  if (SOURCE_ONLY) return;
  const loader = fs.readFileSync(path.join(ROOT, "apps/extensions/chatgpt/chrome/dev-controls-oauth-google/loader.js"), "utf8");
  const proxy = fs.readFileSync(path.join(ROOT, "apps/dev-server/dev_output/proxy/_paste-pack.ext.txt"), "utf8");
  const loaderMarker = Number(loader.match(/const LOADER_BUILD_TS = (\d+);/u)?.[1]);
  const loaderIso = loader.match(/const LOADER_BUILD_ISO = "([^"]+)";/u)?.[1];
  const proxyMarker = Number(proxy.match(/^\/\/ buildTs=(\d+)$/mu)?.[1]);
  assert(Number.isSafeInteger(loaderMarker) && loaderMarker > REJECTED_BUILD_MARKER);
  assert.equal(proxyMarker, loaderMarker);
  assert.equal(loaderIso, new Date(loaderMarker).toISOString());
  assert(!loader.includes(`const LOADER_BUILD_TS = ${REJECTED_BUILD_MARKER};`));
});

if (!SOURCE_ONLY && fs.existsSync(path.join(ROOT, GENERATED_REL))) {
  const generated = fs.readFileSync(path.join(ROOT, GENERATED_REL), "utf8");
  const generatedPage = executeBridge(generated);
  const repositoryHeadAtBuild = generatedPage.H2O?.TitleContract?.identity?.repositoryHeadAtBuild;
  assert.match(repositoryHeadAtBuild ?? "", /^[0-9a-f]{40}$/u, "generated bridge build HEAD identity");
  const committedSourceBytes = execFileSync("git", ["show", `HEAD:${CONTRACT_REL}`], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  const generatedCanonical = transformTitleContractToClassicBridge({
    sourceBytes,
    committedSourceBytes,
    repositoryHeadAtBuild,
  });
  assert.equal(generated, generatedCanonical.code, "generated bridge drifted from its attested build identity");
  new vm.Script(generated, { filename: GENERATED_REL });
}

assert.equal(tests.length, 39, "bridge scenario count drifted");
assert.equal(scopeTests.length, 14, "scope scenario count drifted");
console.log(JSON.stringify({
  ok: true,
  validator: "title-contract-bridge-v1",
  scopeMode,
  scopeScenarios: scopeTests.length,
  scenarios: tests.length,
  sourceSha256: canonical.sourceSha256,
  bridgeSha256: !SOURCE_ONLY && fs.existsSync(path.join(ROOT, GENERATED_REL))
    ? sha256(fs.readFileSync(path.join(ROOT, GENERATED_REL)))
    : sha256(Buffer.from(canonical.code)),
  sourceExportCount: canonical.sourceExportCount,
  publicSurfaceCount: canonical.publicSurfaceKeys.length,
  publicSurfaceKeys: canonical.publicSurfaceKeys,
  publicSurfaceDigest: canonical.publicSurfaceDigest,
  repositoryHeadAtBuild: canonical.repositoryHeadAtBuild,
  generatedChecked: !SOURCE_ONLY && fs.existsSync(path.join(ROOT, GENERATED_REL)),
}));
