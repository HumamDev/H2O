#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  getExtensionId,
  getExtensionKey,
} from "../../product/extensions/chatgpt/chrome/chrome-extension-keys.mjs";
import {
  TITLE_CONTRACT_BRIDGE_GENERATOR_VERSION,
  TITLE_CONTRACT_PRIVILEGED_EXPORTS,
  TITLE_CONTRACT_PUBLIC_EXPORTS,
  makeCanonicalTitleContractBridge,
  transformTitleContractToClassicBridge,
} from "../../product/extensions/chatgpt/chrome/title-contract/make-title-contract-bridge.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CONTRACT_REL = "packages/title-contract/index.mjs";
const RUNTIME_REL = "src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js";
const VALIDATOR_REL = "tools/validation/title-interface/validate-title-stage1c-formatter-parity.mjs";
const ALIAS_REL = "apps/dev-server/alias/9B0a._Chat_Title_State_.js";
const BRIDGE_REL = "apps/extensions/chatgpt/chrome/dev-controls-oauth-google/title-contract-bridge.js";
const LOADER_REL = "apps/extensions/chatgpt/chrome/dev-controls-oauth-google/loader.js";
const MANIFEST_REL = "apps/extensions/chatgpt/chrome/dev-controls-oauth-google/manifest.json";
const PROXY_REL = "apps/dev-server/dev_output/proxy/_paste-pack.ext.txt";
const LIVE_PROXY_URL = "http://127.0.0.1:5500/dev_output/proxy/_paste-pack.ext.txt";
const BUILD_TOKEN_MIN_LENGTH = 10;
const BUILD_TOKEN_MAX_LENGTH = 15;
const BEGIN_MARKER = "// H2O_TITLE_STAGE1C_PARITY_BEGIN";
const END_MARKER = "// H2O_TITLE_STAGE1C_PARITY_END";
const BOOT_INVOCATION = "\n  boot();\n";
const TEST_HOOK = "__H2O_STAGE1C_FORMATTER_PARITY_TEST__";
const LIFECYCLE_TEST_HOOK = "__H2O_STAGE1C_DOCUMENT_LIFECYCLE_TEST__";
const EXPECTED_RUNTIME_SHA256 = "ec8ea13b92d2cb4f71f49f08c9d9f957cfdcf551cf17cd263521678e81ed9077";
const EXPECTED_STAGE1C = new Set([RUNTIME_REL, VALIDATOR_REL]);
const EXPECTED_MODIFIED = new Set([RUNTIME_REL]);
const EXPECTED_UNTRACKED = new Set([VALIDATOR_REL]);
const CANARY_EXPECTATION = Object.freeze({
  schema: "h2o.title-stage1c.canary-expectation.v1",
  counterContinuityRequires: Object.freeze([
    "same-in-memory-instance",
    "performance.timeOrigin",
    "trusted-diagnostic-documentId",
  ]),
  evaluateUnknownContinuityPerDocument: true,
  sameRouteSemanticNoopMayKeepCounters: true,
});
const EXPECTED_IDENTITY = Object.freeze({
  schemaVersion: 2,
  bridgeVersion: "2",
  generatorVersion: "2",
  sourceExportCount: 35,
  sourceSha256: "9d795e840d6236cc1b35c8142243e16528e14af6095c55a2dcb7230a219fc551",
  publicSurfaceDigest: "b86b9dcc0d1258e6a5112ceeca19bf207e54a4fc921ddf95dc91b0cc20a3d3eb",
});
const HISTORICAL_STAGE1B_HEAD = "9776f6738c074798de02edd16eb6a2911105af63";
const HISTORICAL_STAGE1B_BRIDGE_SHA256 = "4c11f0b9aca19944fe74e90c953d694ed94ddd33bcc23cf67bd631f6c2cc33f5";
const EXPECTED_EXTENSION_ID = "ogcjkeaiicglflamhjaaimdhphjlgkbb";
const SCOPE_MODE_PREFIX = "--scope-mode=";
const scopeTests = [];
const tests = [];
let bridgeAttestation = null;
let generatedBuildTokenParity = null;

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8", ...options });
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function validateBuildToken(label, rawValue) {
  const value = String(rawValue ?? "");
  assert(value.length > 0, `${label} is missing`);
  assert(/^\d+$/u.test(value), `${label} must contain decimal digits only`);
  assert(
    value.length >= BUILD_TOKEN_MIN_LENGTH && value.length <= BUILD_TOKEN_MAX_LENGTH,
    `${label} length is outside the build contract`,
  );
  assert(!value.startsWith("0"), `${label} must not have a leading zero`);
  return value;
}

function uniqueBuildToken(label, matches) {
  const values = matches.map((match) => String(match[1] ?? "").trim());
  if (values.length === 0) assert.fail(`${label} is missing`);
  if (values.length > 1) {
    if (new Set(values).size > 1) assert.fail(`${label} values conflict`);
    assert.fail(`${label} must appear exactly once`);
  }
  return validateBuildToken(label, values[0]);
}

function validateGeneratedBuildTokenParity({ loaderSource, proxySource }) {
  const loaderToken = uniqueBuildToken(
    "loader build token",
    [...String(loaderSource).matchAll(/^\s*const LOADER_BUILD_TS = ([^;\r\n]*);$/gmu)],
  );
  const loaderIsoMatches = [
    ...String(loaderSource).matchAll(/^\s*const LOADER_BUILD_ISO = "([^"\r\n]*)";$/gmu),
  ];
  assert.equal(loaderIsoMatches.length, 1, "loader build ISO must appear exactly once");
  assert.equal(
    loaderIsoMatches[0][1],
    new Date(Number(loaderToken)).toISOString(),
    "loader build ISO does not match the authoritative build token",
  );
  const loaderProxyUrlMatches = [
    ...String(loaderSource).matchAll(/^\s*const PROXY_PACK_URL = "([^"\r\n]*)";$/gmu),
  ];
  assert.equal(loaderProxyUrlMatches.length, 1, "loader proxy URL must appear exactly once");
  assert.equal(loaderProxyUrlMatches[0][1], LIVE_PROXY_URL, "loader proxy URL drifted");

  const proxyToken = uniqueBuildToken(
    "proxy build token",
    [...String(proxySource).matchAll(/^\/\/ buildTs=([^\r\n]*)$/gmu)],
  );
  assert.equal(proxyToken, loaderToken, "proxy build token mismatch");

  const proxyCountMatches = [...String(proxySource).matchAll(/^\/\/ count=(\d+)$/gmu)];
  assert.equal(proxyCountMatches.length, 1, "proxy entry count must appear exactly once");
  const proxyEntryCount = Number(proxyCountMatches[0][1]);
  assert(Number.isSafeInteger(proxyEntryCount) && proxyEntryCount > 0, "proxy entry count is invalid");

  const stage1CRequireMatches = [
    ...String(proxySource).matchAll(
      /^\/\/ @require\s+http:\/\/127\.0\.0\.1:5500\/alias\/9B0a\._Chat_Title_State_\.js\?v=([^\s]+)$/gmu,
    ),
  ];
  assert.equal(stage1CRequireMatches.length, 1, "9B0a proxy URL must appear exactly once");
  const stage1CProxyToken = validateBuildToken("9B0a proxy token", stage1CRequireMatches[0][1]);
  assert.equal(stage1CProxyToken, loaderToken, "9B0a proxy token mismatch");

  const requireMatches = [
    ...String(proxySource).matchAll(/^\/\/ @require\s+\S+\?v=([^\s]+)$/gmu),
  ];
  assert.equal(requireMatches.length, proxyEntryCount, "proxy @require entry count mismatch");
  const requireTokens = requireMatches.map((match, index) => (
    validateBuildToken(`proxy @require token ${index + 1}`, match[1])
  ));
  assert.equal(new Set(requireTokens).size, 1, "proxy @require build tokens conflict");
  assert.equal(requireTokens[0], loaderToken, "proxy @require build token mismatch");

  const versionMatches = [...String(proxySource).matchAll(/^\/\/ @version\s+([^\s]+)$/gmu)];
  assert.equal(versionMatches.length, proxyEntryCount, "proxy @version entry count mismatch");
  const versionTokens = versionMatches.map((match, index) => (
    validateBuildToken(`proxy @version token ${index + 1}`, match[1])
  ));
  assert.equal(new Set(versionTokens).size, 1, "proxy @version build tokens conflict");
  assert.equal(versionTokens[0], loaderToken, "proxy @version build token mismatch");

  return Object.freeze({
    token: loaderToken,
    proxyEntryCount,
    proxyUrl: loaderProxyUrlMatches[0][1],
  });
}

function sameSet(actual, expected) {
  return actual.size === expected.size && [...actual].every((value) => expected.has(value));
}

function splitNul(value) {
  return value.split("\0").filter(Boolean);
}

function parseRequestedScopeMode(argv) {
  const options = argv.filter((argument) => argument.startsWith(SCOPE_MODE_PREFIX));
  assert(options.length <= 1, "duplicate --scope-mode options are forbidden");
  if (options.length === 0) return null;
  const value = options[0].slice(SCOPE_MODE_PREFIX.length);
  assert.equal(value, "validator-self-correction", `unknown requested Stage 1C scope mode: ${value}`);
  return value;
}

function classifyStage1CScope({
  requestedMode = null,
  modifiedTracked,
  staged,
  untracked,
  trackedStage1CFiles,
  generatedOutputIgnored,
}) {
  assert(
    requestedMode === null || requestedMode === "validator-self-correction",
    `unknown requested Stage 1C scope mode: ${String(requestedMode)}`,
  );
  const modified = new Set(modifiedTracked);
  const stagedPaths = new Set(staged);
  const untrackedPaths = new Set(untracked);
  const trackedFiles = new Set(trackedStage1CFiles);
  assert.equal(stagedPaths.size, 0, `staged paths are forbidden: ${[...stagedPaths].sort().join(", ")}`);
  assert.equal(generatedOutputIgnored, true, "expected generated output must remain ignored and unstaged");

  const unexpectedUntracked = [...untrackedPaths]
    .filter((relative) => !relative.startsWith("chrome/") && !EXPECTED_UNTRACKED.has(relative));
  assert.deepEqual(unexpectedUntracked, [], `unexpected untracked paths: ${unexpectedUntracked.join(", ")}`);
  const stage1CUntracked = new Set(
    [...untrackedPaths].filter((relative) => EXPECTED_UNTRACKED.has(relative)),
  );

  if (requestedMode === "validator-self-correction") {
    assert(
      sameSet(modified, new Set([VALIDATOR_REL])),
      `validator-self-correction requires exactly one modified path: ${VALIDATOR_REL}`,
    );
    assert.equal(stage1CUntracked.size, 0, "validator-self-correction forbids untracked Stage 1C files");
    assert(sameSet(trackedFiles, EXPECTED_STAGE1C), "validator-self-correction requires both tracked Stage 1C files");
    return "validator-self-correction";
  }

  const unexpectedModified = [...modified].filter((relative) => !EXPECTED_MODIFIED.has(relative));
  assert.deepEqual(unexpectedModified, [], `unexpected modified tracked paths: ${unexpectedModified.join(", ")}`);
  const uncommitted = sameSet(modified, EXPECTED_MODIFIED)
    && sameSet(stage1CUntracked, EXPECTED_UNTRACKED)
    && sameSet(trackedFiles, EXPECTED_MODIFIED);
  const committedClean = modified.size === 0
    && stage1CUntracked.size === 0
    && sameSet(trackedFiles, EXPECTED_STAGE1C);
  assert(!(uncommitted && committedClean), "Stage 1C scope classification is ambiguous");
  if (uncommitted) return "uncommitted";
  if (committedClean) return "committed-clean";
  assert.fail(
    "Stage 1C scope is neither exact uncommitted nor exact committed-clean state"
      + `; modified=${JSON.stringify([...modified].sort())}`
      + `; Stage1C-untracked=${JSON.stringify([...stage1CUntracked].sort())}`
      + `; tracked=${JSON.stringify([...trackedFiles].sort())}`,
  );
}

function scopeTest(name, callback) {
  callback();
  scopeTests.push(name);
  console.log(`ok scope ${scopeTests.length} - ${name}`);
}

function test(name, callback) {
  callback();
  tests.push(name);
  console.log(`ok ${tests.length} - ${name}`);
}

async function asyncTest(name, callback) {
  await callback();
  tests.push(name);
  console.log(`ok ${tests.length} - ${name}`);
}

function committedScopeInput(overrides = {}) {
  return {
    requestedMode: null,
    modifiedTracked: [],
    staged: [],
    untracked: ["chrome/protected"],
    trackedStage1CFiles: [...EXPECTED_STAGE1C],
    generatedOutputIgnored: true,
    ...overrides,
  };
}

function assertRepositoryScope(requestedMode) {
  const modifiedTracked = splitNul(
    run("git", ["diff", "--name-only", "-z", "--diff-filter=ACMRTUXB", "HEAD", "--"]),
  );
  const staged = splitNul(run("git", ["diff", "--cached", "--name-only", "-z", "--"]));
  const untracked = splitNul(run("git", ["ls-files", "-z", "--others", "--exclude-standard", "--"]));
  const trackedStage1CFiles = splitNul(run("git", ["ls-files", "-z", "--", ...EXPECTED_STAGE1C]));
  assert(fs.existsSync(path.join(ROOT, BRIDGE_REL)), "generated bridge is missing");
  assert.equal(run("git", ["ls-files", "--", BRIDGE_REL]).trim(), "", "generated bridge must remain untracked");
  run("git", ["check-ignore", "-q", "--", BRIDGE_REL]);
  return classifyStage1CScope({
    requestedMode,
    modifiedTracked,
    staged,
    untracked,
    trackedStage1CFiles,
    generatedOutputIgnored: true,
  });
}

const requestedScopeMode = parseRequestedScopeMode(process.argv.slice(2));
const scopeMode = assertRepositoryScope(requestedScopeMode);

scopeTest("exact uncommitted state accepted", () => {
  assert.equal(classifyStage1CScope(committedScopeInput({
    modifiedTracked: [RUNTIME_REL],
    untracked: [VALIDATOR_REL, "chrome/protected"],
    trackedStage1CFiles: [RUNTIME_REL],
  })), "uncommitted");
});
scopeTest("exact committed-clean state accepted", () => {
  assert.equal(classifyStage1CScope(committedScopeInput()), "committed-clean");
});
scopeTest("explicit validator-self-correction state accepted", () => {
  assert.equal(classifyStage1CScope(committedScopeInput({
    requestedMode: "validator-self-correction",
    modifiedTracked: [VALIDATOR_REL],
  })), "validator-self-correction");
});
scopeTest("validator self-tamper rejected by default", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    modifiedTracked: [VALIDATOR_REL],
  })), /unexpected modified tracked paths/u);
});
scopeTest("validator self-tamper never reports committed-clean", () => {
  assert.notEqual(classifyStage1CScope(committedScopeInput({
    requestedMode: "validator-self-correction",
    modifiedTracked: [VALIDATOR_REL],
  })), "committed-clean");
});
scopeTest("partial uncommitted state rejected", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    modifiedTracked: [RUNTIME_REL],
    trackedStage1CFiles: [RUNTIME_REL],
  })), /neither exact uncommitted nor exact committed-clean/u);
});
scopeTest("staged path rejected", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    staged: [RUNTIME_REL],
  })), /staged paths are forbidden/u);
});
scopeTest("foreign tracked path rejected", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    modifiedTracked: ["src-runtime-base/foreign.js"],
  })), /unexpected modified tracked paths/u);
});
scopeTest("foreign untracked path rejected", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    untracked: ["chrome/protected", "foreign.tmp"],
  })), /unexpected untracked paths/u);
});
scopeTest("missing committed Stage 1C file rejected", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    trackedStage1CFiles: [RUNTIME_REL],
  })), /neither exact uncommitted nor exact committed-clean/u);
});
scopeTest("mixed committed and uncommitted state rejected", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    modifiedTracked: [RUNTIME_REL],
    untracked: [VALIDATOR_REL],
  })), /neither exact uncommitted nor exact committed-clean/u);
});
scopeTest("self-correction with second modification rejected", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    requestedMode: "validator-self-correction",
    modifiedTracked: [VALIDATOR_REL, RUNTIME_REL],
  })), /requires exactly one modified path/u);
});
scopeTest("unknown scope mode rejected", () => {
  assert.throws(() => classifyStage1CScope(committedScopeInput({
    requestedMode: "unknown",
  })), /unknown requested Stage 1C scope mode/u);
});
scopeTest("duplicate scope mode options rejected", () => {
  assert.throws(() => parseRequestedScopeMode([
    "--scope-mode=validator-self-correction",
    "--scope-mode=validator-self-correction",
  ]), /duplicate --scope-mode/u);
});
scopeTest("unknown CLI scope option rejected", () => {
  assert.throws(() => parseRequestedScopeMode(["--scope-mode=unknown"]), /unknown requested Stage 1C scope mode/u);
});

const runtimePath = path.join(ROOT, RUNTIME_REL);
const runtimeSource = fs.readFileSync(runtimePath, "utf8");
const baselineSource = execFileSync("git", ["show", `HEAD:${RUNTIME_REL}`], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
const bridgeSource = fs.readFileSync(path.join(ROOT, BRIDGE_REL), "utf8");

function countLiteral(source, needle) {
  return source.split(needle).length - 1;
}

assert.equal(countLiteral(runtimeSource, BEGIN_MARKER), 1, "parity BEGIN marker count");
assert.equal(countLiteral(runtimeSource, END_MARKER), 1, "parity END marker count");
assert.equal(countLiteral(runtimeSource, BOOT_INVOCATION), 1, "production boot invocation count");
assert.equal((runtimeSource.match(/^\s*boot\(\);\s*$/gmu) || []).length, 1, "unique boot line");

function instrumentCurrentSource(source) {
  assert.equal(countLiteral(source, BOOT_INVOCATION), 1, "instrumentation boot anchor count");
  return source.replace(BOOT_INVOCATION, `
  W.${TEST_HOOK} = Object.freeze({
    displayFrom,
    cleanTitle,
    norm,
    getEdgeEmoji,
    isRTL,
    compare: titleContractParity.compare,
    paritySnapshot: titleContractParity.snapshot,
    selfCheck,
    apiKeys: Object.freeze(Object.keys(api).sort()),
  });
`);
}

function instrumentBaselineSource(source) {
  assert.equal(countLiteral(source, BOOT_INVOCATION), 1, "baseline boot anchor count");
  return source.replace(BOOT_INVOCATION, `
  W.${TEST_HOOK} = Object.freeze({
    displayFrom,
    cleanTitle,
    norm,
    getEdgeEmoji,
    isRTL,
    selfCheck,
    apiKeys: Object.freeze(Object.keys(api).sort()),
  });
`);
}

function instrumentLifecycleSource(source) {
  assert.equal(countLiteral(source, BOOT_INVOCATION), 1, "lifecycle boot anchor count");
  for (const name of [
    "displayFrom",
    "setTitle",
    "setEmoji",
    "hydrateFromStore",
    "attachStore",
    "refresh",
    "renameNative",
    "applyCrossSurfaceTitlePayload",
    "boot",
  ]) {
    const declarations = source.match(new RegExp(`^  (?:async )?function ${name}\\(`, "gmu")) || [];
    assert.equal(declarations.length, 1, `lifecycle ${name} declaration count`);
  }
  assert.equal(countLiteral(source, "  const api = {\n"), 1, "lifecycle API declaration count");
  return source.replace(BOOT_INVOCATION, `
  W.${LIFECYCLE_TEST_HOOK} = Object.freeze({
    api,
    refresh,
    setTitle,
    setEmoji,
    hydrateFromStore,
    attachStore,
    applyCrossSurfaceTitlePayload,
    renameNative,
    displayFrom,
    paritySnapshot: titleContractParity.snapshot,
    currentState: () => ({
      ...state,
      durability: { ...state.durability },
    }),
    currentRecord: () => snapshotRecord(activeRecord),
    currentRouteToken: () => routeToken,
  });
  boot();
`);
}

const instrumentedSource = instrumentCurrentSource(runtimeSource);
const instrumentedBaseline = instrumentBaselineSource(baselineSource);
const instrumentedLifecycle = instrumentLifecycleSource(runtimeSource);
new vm.Script(bridgeSource, { filename: BRIDGE_REL });
new vm.Script(instrumentedSource, { filename: `${RUNTIME_REL}:instrumented` });
new vm.Script(instrumentedLifecycle, { filename: `${RUNTIME_REL}:lifecycle-instrumented` });

function createStorage() {
  const values = new Map();
  let mutations = 0;
  return {
    api: {
      get length() { return values.size; },
      key(index) { return [...values.keys()][index] ?? null; },
      getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
      setItem(key, value) { mutations += 1; values.set(String(key), String(value)); },
      removeItem(key) { mutations += 1; values.delete(String(key)); },
    },
    seed(key, value) { values.set(String(key), String(value)); },
    reset() { mutations = 0; },
    get mutations() { return mutations; },
  };
}

function realmObject(context, values = {}) {
  const value = vm.runInContext("({})", context);
  Object.assign(value, values);
  return value;
}

function installFakeContract(context, {
  formatter = () => Object.freeze({ text: "", dir: "ltr" }),
  rtl = () => false,
  identityOverrides = {},
  omitFormatter = false,
  descriptor = {},
} = {}) {
  const identity = realmObject(context, { ...EXPECTED_IDENTITY, ...identityOverrides });
  Object.freeze(identity);
  const contract = realmObject(context, { identity, isRTL: rtl });
  if (!omitFormatter) contract.formatDisplayTitle = formatter;
  Object.freeze(contract);
  const h2o = realmObject(context);
  Object.defineProperty(h2o, "TitleContract", {
    value: contract,
    writable: descriptor.writable ?? false,
    enumerable: descriptor.enumerable ?? false,
    configurable: descriptor.configurable ?? false,
  });
  Object.defineProperty(context, "H2O", {
    value: h2o,
    writable: true,
    enumerable: true,
    configurable: true,
  });
  return { h2o, contract };
}

function baseSandbox() {
  const storage = createStorage();
  const mutation = {
    dispatched: 0,
    listeners: 0,
    timers: 0,
    observers: 0,
    fetches: 0,
  };
  const sandbox = {
    document: {
      title: "Unchanged document title",
      body: null,
      hidden: false,
      querySelector() { return null; },
      addEventListener() { mutation.listeners += 1; },
    },
    location: { pathname: "/c/stage1c-test-chat" },
    history: {
      pushState() {},
      replaceState() {},
    },
    localStorage: storage.api,
    console: { warn() {}, log() {}, error() {} },
    Intl,
    CustomEvent: class CustomEvent {},
    MutationObserver: class MutationObserver {
      constructor() { mutation.observers += 1; }
    },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    setTimeout() { mutation.timers += 1; return 1; },
    clearTimeout() {},
    setInterval() { mutation.timers += 1; return 1; },
    clearInterval() {},
    queueMicrotask() { mutation.timers += 1; },
    fetch() { mutation.fetches += 1; throw new Error("fetch forbidden"); },
    dispatchEvent() { mutation.dispatched += 1; return true; },
    addEventListener() { mutation.listeners += 1; },
  };
  sandbox.window = sandbox;
  return { sandbox, storage, mutation };
}

function createHarness({
  bridge = "real",
  formatter,
  rtl,
  identityOverrides,
  omitFormatter,
  descriptor,
  windowProxy = null,
  source = instrumentedSource,
} = {}) {
  const env = baseSandbox();
  const { sandbox } = env;
  vm.createContext(sandbox);
  const callState = { count: 0 };
  if (bridge === "real") {
    new vm.Script(bridgeSource, { filename: BRIDGE_REL }).runInContext(sandbox);
  } else if (bridge === "fake") {
    installFakeContract(sandbox, {
      formatter: (...args) => {
        callState.count += 1;
        return formatter ? formatter(...args) : Object.freeze({ text: "", dir: "ltr" });
      },
      rtl,
      identityOverrides,
      omitFormatter,
      descriptor,
    });
  }
  let windowTarget = sandbox;
  if (typeof windowProxy === "function") {
    const result = windowProxy();
    sandbox.window = result.proxy;
    windowTarget = result.target;
    env.proxyState = result.state;
  }
  new vm.Script(source, { filename: `${RUNTIME_REL}:vm` }).runInContext(sandbox);
  env.storage.reset();
  const hook = windowTarget[TEST_HOOK];
  assert(hook, "instrumented production hook missing");
  return {
    ...env,
    hook,
    callState,
    resetCalls() { callState.count = 0; },
  };
}

function createFakeClock(start = 1_786_000_000_000) {
  let current = start;
  let nextId = 1;
  const tasks = new Map();

  function schedule(callback, delay, interval) {
    const id = nextId;
    nextId += 1;
    const duration = Math.max(0, Number(delay) || 0);
    tasks.set(id, {
      callback,
      dueAt: current + duration,
      interval: interval ? Math.max(1, duration) : 0,
    });
    return id;
  }

  function clear(id) {
    tasks.delete(id);
  }

  function advance(duration) {
    const target = current + Math.max(0, Number(duration) || 0);
    for (;;) {
      const pending = [...tasks.entries()]
        .filter(([, task]) => task.dueAt <= target)
        .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
      if (!pending) break;
      const [id, task] = pending;
      current = task.dueAt;
      if (!task.interval) tasks.delete(id);
      task.callback();
      if (task.interval && tasks.has(id)) {
        task.dueAt = current + task.interval;
        tasks.set(id, task);
      }
    }
    current = target;
  }

  return {
    advance,
    clear,
    setInterval(callback, delay) { return schedule(callback, delay, true); },
    setTimeout(callback, delay) { return schedule(callback, delay, false); },
    get now() { return current; },
    get pending() { return tasks.size; },
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createLifecycleHarness({
  pathname = "/c/stage1c-chat-a",
  titleByChat = {},
  timeOrigin = 1_785_000_000_000,
  clockStart = 1_786_000_000_000,
  storageSeed = [],
} = {}) {
  const clock = createFakeClock(clockStart);
  const storage = createStorage();
  for (const [key, value] of storageSeed) storage.seed(key, value);
  const effects = {
    dispatched: [],
    documentListeners: new Map(),
    windowListeners: new Map(),
    fetches: [],
    observers: 0,
    timerCalls: 0,
  };
  const titleNode = {};
  const bodyNode = {};
  let fetchImplementation = async () => {
    throw new Error("unexpected fetch");
  };
  const sandbox = {
    location: { pathname },
    localStorage: storage.api,
    performance: { timeOrigin },
    console: { warn() {}, log() {}, error() {} },
    Intl,
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    MutationObserver: class MutationObserver {
      constructor(callback) {
        this.callback = callback;
        effects.observers += 1;
      }
      observe() {}
      disconnect() {}
    },
    setTimeout(callback, delay) {
      effects.timerCalls += 1;
      return clock.setTimeout(callback, delay);
    },
    clearTimeout(id) { clock.clear(id); },
    setInterval(callback, delay) {
      effects.timerCalls += 1;
      return clock.setInterval(callback, delay);
    },
    clearInterval(id) { clock.clear(id); },
    queueMicrotask(callback) { Promise.resolve().then(callback); },
    dispatchEvent(event) {
      effects.dispatched.push({ type: event?.type || "", detail: cloneJson(event?.detail ?? null) });
      for (const callback of effects.windowListeners.get(event?.type) || []) callback(event);
      return true;
    },
    addEventListener(type, callback) {
      const callbacks = effects.windowListeners.get(type) || [];
      callbacks.push(callback);
      effects.windowListeners.set(type, callbacks);
    },
    async fetch(...args) {
      effects.fetches.push(args);
      return fetchImplementation(...args);
    },
  };
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(clock.now);
    }
    static now() { return clock.now; }
  }
  sandbox.Date = FakeDate;
  sandbox.document = {
    title: "ChatGPT",
    body: bodyNode,
    hidden: false,
    querySelector(selector) {
      if (selector === "title") return titleNode;
      const match = String(selector).match(/\/c\/([a-z0-9_-]+)/iu);
      const chatId = match?.[1] || "";
      const rawTitle = titleByChat[chatId];
      if (!rawTitle) return null;
      return {
        dataset: { hoRawTitle: rawTitle, hoRawTitleFull: rawTitle },
        getAttribute(name) { return name === "data-ho-raw-title" ? rawTitle : null; },
      };
    },
    createTreeWalker() {
      return {
        currentNode: null,
        nextNode() { return false; },
      };
    },
    addEventListener(type, callback) {
      const callbacks = effects.documentListeners.get(type) || [];
      callbacks.push(callback);
      effects.documentListeners.set(type, callbacks);
    },
  };
  sandbox.history = {
    pushState(_state, _title, url) {
      if (typeof url === "string") sandbox.location.pathname = new URL(url, "https://chatgpt.com").pathname;
    },
    replaceState(_state, _title, url) {
      if (typeof url === "string") sandbox.location.pathname = new URL(url, "https://chatgpt.com").pathname;
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  new vm.Script(bridgeSource, { filename: BRIDGE_REL }).runInContext(sandbox);
  new vm.Script(instrumentedLifecycle, { filename: `${RUNTIME_REL}:lifecycle-vm` }).runInContext(sandbox);
  const hook = sandbox[LIFECYCLE_TEST_HOOK];
  assert(hook, "lifecycle production hook missing");

  return {
    sandbox,
    hook,
    clock,
    storage,
    effects,
    timeOrigin,
    setFetch(callback) { fetchImplementation = callback; },
    setStore(store) {
      sandbox.H2O.Library = { Store: store };
    },
    resetEffects() {
      effects.dispatched.length = 0;
      effects.fetches.length = 0;
      effects.timerCalls = 0;
      storage.reset();
    },
  };
}

function lifecycleSnapshot(harness) {
  const state = cloneJson(harness.hook.currentState());
  const parity = cloneJson(harness.hook.paritySnapshot());
  assert.equal(parity.comparisons, parity.matches + parity.mismatches + parity.errors);
  return {
    state,
    parity,
    routeToken: harness.hook.currentRouteToken(),
  };
}

function parityActivityChanged(before, after) {
  return after.comparisons !== before.comparisons || after.suppressed !== before.suppressed;
}

function assertLegacyAuthority(harness, current) {
  assert.equal(
    current.state.displayTitle,
    harness.hook.displayFrom(current.state.baseTitle, current.state.emoji),
    "legacy displayFrom output must remain authoritative",
  );
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function accessorWindowProxy({ throwDescriptor = false } = {}) {
  const target = {};
  const h2o = {};
  const state = { getterCalls: 0, descriptorCalls: 0 };
  const proxy = new Proxy(target, {
    get(object, key, receiver) {
      if (key === "H2O") return h2o;
      return Reflect.get(object, key, receiver);
    },
    set(object, key, value, receiver) {
      if (key === "H2O") return true;
      return Reflect.set(object, key, value, receiver);
    },
    getOwnPropertyDescriptor(object, key) {
      if (key === "H2O") {
        state.descriptorCalls += 1;
        if (throwDescriptor) throw new Error("descriptor blocked");
        return {
          get() { state.getterCalls += 1; return h2o; },
          enumerable: true,
          configurable: true,
        };
      }
      return Reflect.getOwnPropertyDescriptor(object, key);
    },
  });
  return { proxy, target, state };
}

function snapshot(harness) {
  const value = harness.hook.selfCheck().titleContractParity;
  assert(Object.isFrozen(value), "parity snapshot must be frozen");
  assert(Object.isFrozen(value.byClass), "parity byClass must be frozen");
  if (value.lastMismatch) assert(Object.isFrozen(value.lastMismatch), "lastMismatch must be frozen");
  assert.equal(value.comparisons, value.matches + value.mismatches + value.errors, "counter invariant");
  return value;
}

function compare(harness, baseTitle, emoji, token) {
  const legacy = harness.hook.displayFrom(baseTitle, emoji);
  const returned = harness.hook.compare(baseTitle, emoji, legacy, token);
  assert.equal(returned, undefined, "shadow comparison must not return an authoritative title");
  return { legacy, parity: snapshot(harness) };
}

function fakeMismatch({ baseTitle, emoji, contractText, contractDir = "ltr", token = 1 }) {
  const harness = createHarness({
    bridge: "fake",
    formatter(base, mark) {
      if (base === "" && mark === "") return Object.freeze({ text: "", dir: "ltr" });
      return Object.freeze({ text: contractText, dir: contractDir });
    },
  });
  harness.resetCalls();
  const result = compare(harness, baseTitle, emoji, token);
  return { harness, ...result };
}

test("real bridge identity enables formatter comparisons", () => {
  const harness = createHarness();
  const before = snapshot(harness);
  const { legacy, parity } = compare(harness, "Hello", "✨", 1);
  assert.equal(legacy, "✨ Hello");
  assert.equal(parity.gate, "ok");
  assert.equal(parity.comparisons, before.comparisons + 1);
  assert.equal(parity.matches, before.matches + 1);
});

test("bridge absent disables parity without changing legacy output", () => {
  const harness = createHarness({ bridge: "absent" });
  const { legacy, parity } = compare(harness, "Hello", "✨", 1);
  assert.equal(legacy, "✨ Hello");
  assert.equal(parity.gate, "absent");
  assert.equal(parity.comparisons, 0);
});

test("accessor H2O descriptor is rejected without invoking its getter", () => {
  const harness = createHarness({
    bridge: "absent",
    windowProxy: () => accessorWindowProxy(),
  });
  assert.equal(snapshot(harness).gate, "descriptor-mismatch");
  assert.equal(harness.proxyState.getterCalls, 0);
  assert(harness.proxyState.descriptorCalls >= 1);
  compare(harness, "Hello", "✨", 1);
  assert.equal(harness.callState.count, 0);
});

test("throwing H2O descriptor is caught as gate-error", () => {
  const harness = createHarness({
    bridge: "absent",
    windowProxy: () => accessorWindowProxy({ throwDescriptor: true }),
  });
  assert.equal(snapshot(harness).gate, "gate-error");
  assert.equal(compare(harness, "Hello", "✨", 1).legacy, "✨ Hello");
});

test("wrong TitleContract descriptor disables parity", () => {
  const harness = createHarness({ bridge: "fake", descriptor: { writable: true } });
  assert.equal(snapshot(harness).gate, "descriptor-mismatch");
  compare(harness, "Hello", "✨", 1);
  assert.equal(harness.callState.count, 0);
});

test("wrong contract source identity disables parity", () => {
  const harness = createHarness({
    bridge: "fake",
    identityOverrides: { sourceSha256: "0".repeat(64) },
  });
  assert.equal(snapshot(harness).gate, "identity-mismatch");
  compare(harness, "Hello", "✨", 1);
  assert.equal(harness.callState.count, 0);
});

test("missing formatter disables parity", () => {
  const harness = createHarness({ bridge: "fake", omitFormatter: true });
  assert.equal(snapshot(harness).gate, "helper-missing");
  compare(harness, "Hello", "✨", 1);
  assert.equal(harness.callState.count, 0);
});

test("throwing formatter counts one error and preserves legacy", () => {
  const harness = createHarness({
    bridge: "fake",
    formatter(base, emoji) {
      if (!base && !emoji) return Object.freeze({ text: "", dir: "ltr" });
      throw new Error("formatter failed");
    },
  });
  const before = snapshot(harness);
  const { legacy, parity } = compare(harness, "Hello", "✨", 1);
  assert.equal(legacy, "✨ Hello");
  assert.equal(parity.errors, before.errors + 1);
});

test("malformed formatter result counts one error", () => {
  const harness = createHarness({
    bridge: "fake",
    formatter(base, emoji) {
      if (!base && !emoji) return Object.freeze({ text: "", dir: "ltr" });
      return { text: "not frozen", dir: "ltr" };
    },
  });
  const before = snapshot(harness);
  const { parity } = compare(harness, "Hello", "✨", 1);
  assert.equal(parity.errors, before.errors + 1);
});

test("oversized formatter output is rejected", () => {
  const harness = createHarness({
    bridge: "fake",
    formatter(base, emoji) {
      if (!base && !emoji) return Object.freeze({ text: "", dir: "ltr" });
      return Object.freeze({ text: "x".repeat(1025), dir: "ltr" });
    },
  });
  const before = snapshot(harness);
  const { parity } = compare(harness, "Hello", "✨", 1);
  assert.equal(parity.errors, before.errors + 1);
});

test("Hebrew and Arabic parity match the real bridge", () => {
  for (const [index, title] of ["שלום", "مرحبا"].entries()) {
    const harness = createHarness();
    const before = snapshot(harness);
    const result = compare(harness, title, "✨", index + 1);
    assert.equal(result.parity.matches, before.matches + 1);
    assert(result.legacy.endsWith(" ✨"));
  }
});

test("real bridge exposes the presentation-form RTL parity difference", () => {
  const harness = createHarness();
  const result = compare(harness, "\uFB1D", "✨", 1);
  assert.equal(result.legacy, "✨ \uFB1D");
  assert.equal(result.parity.lastMismatch.class, "rtl-range");
  assert.equal(result.parity.lastMismatch.contractDir, "rtl");
});

test("ChatGPT suffix mismatch is classified despite an empty emoji", () => {
  const result = fakeMismatch({
    baseTitle: "Actual title - ChatGPT",
    emoji: "",
    contractText: "Actual title - ChatGPT",
  });
  assert.equal(result.legacy, "Actual title");
  assert.equal(result.parity.lastMismatch.class, "chatgpt-suffix");
});

test("edge emoji dedupe has precedence over direction mismatch", () => {
  const result = fakeMismatch({
    baseTitle: "✨ Hello",
    emoji: "✨",
    contractText: "✨ ✨ Hello",
    contractDir: "rtl",
  });
  assert.equal(result.parity.lastMismatch.class, "edge-emoji-dedupe");
});

test("NBSP-equivalent mismatch is classified as whitespace", () => {
  const result = fakeMismatch({
    baseTitle: "Hello",
    emoji: "✨",
    contractText: "✨\u00A0Hello",
  });
  assert.equal(result.parity.lastMismatch.class, "whitespace");
});

test("empty-value classification covers missing cleaned input", () => {
  const result = fakeMismatch({
    baseTitle: "",
    emoji: "✨",
    contractText: "different",
  });
  assert.equal(result.parity.lastMismatch.class, "empty-value");
});

test("fallback mismatch class is other", () => {
  const result = fakeMismatch({
    baseTitle: "Hello",
    emoji: "✨",
    contractText: "unrelated",
  });
  assert.equal(result.parity.lastMismatch.class, "other");
});

test("empty, emoji-only, and both-empty values preserve legacy output", () => {
  for (const [index, [base, emoji, expected]] of [
    ["", "", ""],
    ["", "✨", "✨"],
    ["Hello", "", "Hello"],
  ].entries()) {
    const harness = createHarness();
    const before = snapshot(harness);
    const result = compare(harness, base, emoji, index + 5);
    assert.equal(result.legacy, expected);
    assert.equal(result.parity.matches, before.matches + 1);
  }
});

test("all six mismatch classes are reachable with one-class accounting", () => {
  const cases = [
    ["empty-value", { baseTitle: "", emoji: "✨", contractText: "x" }],
    ["chatgpt-suffix", { baseTitle: "X - ChatGPT", emoji: "", contractText: "X - ChatGPT" }],
    ["edge-emoji-dedupe", { baseTitle: "✨ X", emoji: "✨", contractText: "✨ ✨ X" }],
    ["rtl-range", { baseTitle: "\uFB1D", emoji: "✨", contractText: "\uFB1D ✨", contractDir: "rtl" }],
    ["whitespace", { baseTitle: "X", emoji: "✨", contractText: "✨  X" }],
    ["other", { baseTitle: "X", emoji: "✨", contractText: "Y" }],
  ];
  for (const [expected, input] of cases) {
    const { parity } = fakeMismatch(input);
    assert.equal(parity.lastMismatch.class, expected);
    assert.equal(parity.byClass[expected], 1);
    assert.equal(Object.values(parity.byClass).reduce((sum, value) => sum + value, 0), 1);
  }
});

test("privacy snapshot omits raw inputs and private signatures", () => {
  const secretTitle = "private-title-never-expose";
  const secretEmoji = "🔐";
  const { harness, parity } = fakeMismatch({
    baseTitle: secretTitle,
    emoji: secretEmoji,
    contractText: "different",
  });
  const encoded = JSON.stringify(parity);
  assert(!encoded.includes(secretTitle));
  assert(!encoded.includes(secretEmoji));
  assert(!/h1|h2|signature|checksum/iu.test(encoded));
  const second = harness.hook.selfCheck().titleContractParity;
  assert.notEqual(second, parity);
  assert.notEqual(second.byClass, parity.byClass);
  assert(Object.isFrozen(second));
  assert(Object.isFrozen(second.byClass));
});

test("mismatch lengths clamp to 1024 and directions stay bounded", () => {
  const base = "A".repeat(5000);
  const result = fakeMismatch({
    baseTitle: base,
    emoji: "✨".repeat(100),
    contractText: "different",
  });
  assert.equal(result.parity.lastMismatch.baseLen, 1024);
  assert.equal(result.parity.lastMismatch.emojiLen, 64);
  assert.equal(result.parity.lastMismatch.legacyLen, 1024);
  assert(["ltr", "rtl", "unknown"].includes(result.parity.lastMismatch.legacyDir));
  assert(["ltr", "rtl", "unknown"].includes(result.parity.lastMismatch.contractDir));
});

test("repeated signatures suppress formatter calls", () => {
  let resolver = () => Object.freeze({ text: "", dir: "ltr" });
  const harness = createHarness({ bridge: "fake", formatter: (...args) => resolver(...args) });
  resolver = (base, emoji) => Object.freeze({
    text: harness.hook.displayFrom(base, emoji),
    dir: harness.hook.isRTL(harness.hook.cleanTitle(base)) ? "rtl" : "ltr",
  });
  harness.resetCalls();
  compare(harness, "Repeat", "✨", 1);
  const afterFirst = snapshot(harness);
  compare(harness, "Repeat", "✨", 1);
  const afterSecond = snapshot(harness);
  assert.equal(harness.callState.count, 1);
  assert.equal(afterSecond.comparisons, afterFirst.comparisons);
  assert.equal(afterSecond.suppressed, afterFirst.suppressed + 1);
});

test("route token changes permit a fresh comparison", () => {
  let resolver = () => Object.freeze({ text: "", dir: "ltr" });
  const harness = createHarness({ bridge: "fake", formatter: (...args) => resolver(...args) });
  resolver = (base, emoji) => Object.freeze({
    text: harness.hook.displayFrom(base, emoji),
    dir: harness.hook.isRTL(harness.hook.cleanTitle(base)) ? "rtl" : "ltr",
  });
  harness.resetCalls();
  compare(harness, "Route", "✨", 1);
  compare(harness, "Route", "✨", 2);
  assert.equal(harness.callState.count, 2);
});

test("comparison and suppression caps saturate at 200", () => {
  let resolver = () => Object.freeze({ text: "", dir: "ltr" });
  const harness = createHarness({ bridge: "fake", formatter: (...args) => resolver(...args) });
  resolver = (base, emoji) => Object.freeze({
    text: harness.hook.displayFrom(base, emoji),
    dir: harness.hook.isRTL(harness.hook.cleanTitle(base)) ? "rtl" : "ltr",
  });
  harness.resetCalls();
  for (let index = 1; index <= 450; index += 1) compare(harness, `Unique ${index}`, "✨", index);
  const result = snapshot(harness);
  assert.equal(result.comparisons, 200);
  assert.equal(result.suppressed, 200);
  assert.equal(harness.callState.count, 199);
  for (const value of [
    result.matches,
    result.mismatches,
    result.errors,
    result.suppressed,
    ...Object.values(result.byClass),
  ]) assert(value >= 0 && value <= 200);
});

test("disabled gate performs zero formatter calls and changes no counters", () => {
  const harness = createHarness({ bridge: "absent" });
  const before = snapshot(harness);
  for (let index = 0; index < 20; index += 1) compare(harness, `Disabled ${index}`, "✨", index);
  assert.deepEqual(snapshot(harness), before);
  assert.equal(harness.callState.count, 0);
});

test("hash input work is bounded to named edge slices", () => {
  const begin = runtimeSource.indexOf(BEGIN_MARKER);
  const end = runtimeSource.indexOf(END_MARKER);
  const block = runtimeSource.slice(begin, end);
  assert(block.includes("PARITY_MAX_LENGTH = 1024"));
  assert(block.includes("PARITY_MAX_EMOJI_LENGTH = 64"));
  assert(block.includes("value.slice(0, half)"));
  assert(block.includes("value.slice(value.length - half)"));
  const result = fakeMismatch({
    baseTitle: "A".repeat(200_000),
    emoji: "✨".repeat(20_000),
    contractText: "different",
  });
  assert.equal(result.parity.lastMismatch.baseLen, 1024);
  assert.equal(result.parity.lastMismatch.emojiLen, 64);
});

test("parity block adds no asynchronous or mutating primitives", () => {
  const begin = runtimeSource.indexOf(BEGIN_MARKER);
  const end = runtimeSource.indexOf(END_MARKER) + END_MARKER.length;
  const block = runtimeSource.slice(begin, end);
  for (const forbidden of [
    "setTimeout",
    "setInterval",
    "queueMicrotask",
    "addEventListener",
    "MutationObserver",
    "dispatchEvent",
    "localStorage",
    "sessionStorage",
    "fetch(",
    "console.",
    "history.",
    "document.title",
  ]) assert(!block.includes(forbidden), `parity block contains forbidden primitive: ${forbidden}`);
});

test("shadow comparison performs no observable mutation", () => {
  const harness = createHarness();
  const beforeTitle = harness.sandbox.document.title;
  const beforeH2O = harness.sandbox.H2O;
  compare(harness, "Passive", "✨", 7);
  assert.equal(harness.sandbox.document.title, beforeTitle);
  assert.equal(harness.sandbox.H2O, beforeH2O);
  assert.equal(harness.storage.mutations, 0);
  assert.equal(harness.mutation.dispatched, 0);
  assert.equal(harness.mutation.listeners, 0);
  assert.equal(harness.mutation.timers, 0);
  assert.equal(harness.mutation.observers, 0);
  assert.equal(harness.mutation.fetches, 0);
});

test("legacy display output remains the composeState authority", () => {
  assert.match(
    runtimeSource,
    /const displayTitle = displayFrom\(rec\.baseTitle, rec\.emoji\);\s+titleContractParity\.compare\(rec\.baseTitle, rec\.emoji, displayTitle, routeToken\);\s+return \{/u,
  );
  assert.equal(countLiteral(runtimeSource, "const displayTitle = displayFrom(rec.baseTitle, rec.emoji);"), 1);
  assert.equal(countLiteral(runtimeSource, "titleContractParity.compare(rec.baseTitle, rec.emoji, displayTitle, routeToken);"), 1);
});

test("selfCheck exposes only a fresh frozen bounded parity snapshot", () => {
  const harness = createHarness();
  const first = harness.hook.selfCheck().titleContractParity;
  const second = harness.hook.selfCheck().titleContractParity;
  assert.notEqual(first, second);
  assert.notEqual(first.byClass, second.byClass);
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.byClass));
  assert.deepEqual(Object.keys(first).sort(), [
    "byClass",
    "comparisons",
    "errors",
    "gate",
    "lastMismatch",
    "matches",
    "mismatches",
    "suppressed",
  ]);
});

test("H2O.ChatTitle public API keys remain compatible with HEAD", () => {
  const current = createHarness();
  const baseline = createHarness({ bridge: "absent", source: instrumentedBaseline });
  assert.deepEqual([...current.hook.apiKeys], [...baseline.hook.apiKeys]);
  assert.equal(countLiteral(runtimeSource, "H2O.ChatTitle = api;"), 1);
});

function createRouteLifecycleHarness(pathname = "/c/stage1c-chat-a", timeOrigin) {
  return createLifecycleHarness({
    pathname,
    timeOrigin,
    titleByChat: {
      "stage1c-chat-a": "Lifecycle title A",
      "stage1c-chat-b": "Lifecycle title B",
    },
  });
}

function transitionLifecycleToB(harness) {
  harness.sandbox.history.pushState({}, "", "/c/stage1c-chat-b");
  harness.clock.advance(60);
  return lifecycleSnapshot(harness);
}

test("continuous same-document route transition reaches production composition and parity", () => {
  const harness = createRouteLifecycleHarness();
  const source = lifecycleSnapshot(harness);
  assert.equal(source.state.chatId, "stage1c-chat-a");
  assert.equal(source.routeToken, 1);
  assertLegacyAuthority(harness, source);

  const destination = transitionLifecycleToB(harness);
  assert.equal(harness.sandbox.location.pathname, "/c/stage1c-chat-b");
  assert.equal(destination.state.chatId, "stage1c-chat-b");
  assert.equal(destination.state.baseTitle, "Lifecycle title B");
  assert.equal(destination.routeToken, 2);
  assert(parityActivityChanged(source.parity, destination.parity), "destination composition did not reach parity");
  assertLegacyAuthority(harness, destination);
});

test("same-route public refresh may remain a semantic and parity no-op", () => {
  const harness = createRouteLifecycleHarness();
  transitionLifecycleToB(harness);
  const before = lifecycleSnapshot(harness);
  const beforePublicTitle = harness.sandbox.H2O_fullOriginalTitle;
  const beforeDocumentTitle = harness.sandbox.document.title;
  harness.resetEffects();

  const returned = cloneJson(harness.hook.api.refresh("explicit-same-route-noop"));
  const after = lifecycleSnapshot(harness);
  assert.deepEqual(after.state, before.state);
  assert.equal(after.routeToken, 2);
  assert.deepEqual(after.parity, before.parity);
  assert.deepEqual(returned, before.state);
  assert.equal(harness.sandbox.H2O_fullOriginalTitle, beforePublicTitle);
  assert.equal(harness.sandbox.document.title, beforeDocumentTitle);
  assert.equal(harness.effects.dispatched.length, 0);
  assert.equal(harness.storage.mutations, 0);
  assert.equal(harness.effects.fetches.length, 0);
  assertLegacyAuthority(harness, after);
});

test("fresh document starts independent route and parity counters", () => {
  const first = createRouteLifecycleHarness("/c/stage1c-chat-b", 1_785_000_000_001);
  const second = createRouteLifecycleHarness("/c/stage1c-chat-b", 1_785_000_000_777);
  const firstSnapshot = lifecycleSnapshot(first);
  const secondSnapshot = lifecycleSnapshot(second);
  const parityTuple = ({ comparisons, matches, mismatches, errors, suppressed }) => (
    [comparisons, matches, mismatches, errors, suppressed]
  );

  assert.equal(firstSnapshot.routeToken, 1);
  assert.equal(secondSnapshot.routeToken, 1);
  assert(firstSnapshot.parity.comparisons > 0);
  assert(secondSnapshot.parity.comparisons > 0);
  assert.notEqual(first.sandbox, second.sandbox);
  assert.notEqual(first.hook, second.hook);
  assert.notEqual(first.timeOrigin, second.timeOrigin);
  assert.deepEqual(parityTuple(firstSnapshot.parity), parityTuple(secondSnapshot.parity));
  assertLegacyAuthority(first, firstSnapshot);
  assertLegacyAuthority(second, secondSnapshot);
});

test("boot-cache provenance timestamp may remain old after equal native detection", () => {
  const chatId = "stage1c-cache-chat";
  const oldUpdatedAt = 1_784_634_141_828;
  const cacheKey = `h2o:prm:cgx:library:chat-title:boot-cache:v1:${chatId}`;
  const cacheValue = JSON.stringify({
    version: 1,
    chatId,
    state: {
      version: 1,
      chatId,
      baseTitle: "Restored native title",
      source: "native",
      priority: 95,
      confidence: 0.95,
      emoji: "",
      emojiSource: "none",
      emojiPriority: 0,
      emojiConfidence: 0,
      updatedAt: oldUpdatedAt,
      emojiUpdatedAt: 0,
    },
    updatedAt: oldUpdatedAt,
    expiresAt: 1_786_100_000_000,
  });
  const harness = createLifecycleHarness({
    pathname: `/c/${chatId}`,
    titleByChat: { [chatId]: "Restored native title" },
    storageSeed: [[cacheKey, cacheValue]],
  });
  const before = lifecycleSnapshot(harness);
  assert.equal(before.state.chatId, chatId);
  assert.equal(before.state.baseTitle, "Restored native title");
  assert.equal(before.state.source, "native");
  assert.equal(before.state.lastUpdateAt, oldUpdatedAt);
  harness.hook.api.refresh("equal-native-noop");
  const after = lifecycleSnapshot(harness);
  assert.equal(after.state.lastUpdateAt, oldUpdatedAt);
  assert.deepEqual(after.parity, before.parity);
  assertLegacyAuthority(harness, after);
});

await asyncTest("state-producer matrix reaches parity only for accepted semantic state", async () => {
  const titleHarness = createRouteLifecycleHarness();
  const initial = lifecycleSnapshot(titleHarness);
  assert.equal(titleHarness.hook.setTitle({
    chatId: "stage1c-chat-a",
    baseTitle: "Accepted user title",
    source: "user",
    priority: 100,
  }, { reason: "matrix-set-title" }), true);
  const acceptedTitle = lifecycleSnapshot(titleHarness);
  assert.equal(acceptedTitle.state.baseTitle, "Accepted user title");
  assert(parityActivityChanged(initial.parity, acceptedTitle.parity));
  assert.equal(titleHarness.hook.setTitle({
    chatId: "stage1c-chat-a",
    baseTitle: "Rejected document title",
    source: "document",
    priority: 60,
  }, { reason: "matrix-stale-title" }), false);
  const rejectedTitle = lifecycleSnapshot(titleHarness);
  assert.deepEqual(rejectedTitle, acceptedTitle);
  assertLegacyAuthority(titleHarness, rejectedTitle);

  assert.equal(titleHarness.hook.setEmoji({
    chatId: "stage1c-chat-a",
    emoji: "🟣",
    source: "user",
    priority: 100,
  }, { reason: "matrix-set-emoji" }), true);
  const acceptedEmoji = lifecycleSnapshot(titleHarness);
  assert.equal(acceptedEmoji.state.emoji, "🟣");
  assert(parityActivityChanged(rejectedTitle.parity, acceptedEmoji.parity));
  assert.equal(titleHarness.hook.setEmoji({
    chatId: "stage1c-chat-a",
    emoji: "🟣",
    source: "user",
    priority: 100,
  }, { reason: "matrix-noop-emoji" }), false);
  const rejectedEmoji = lifecycleSnapshot(titleHarness);
  assert.deepEqual(rejectedEmoji, acceptedEmoji);
  assert.equal(rejectedEmoji.routeToken, 1);
  assertLegacyAuthority(titleHarness, rejectedEmoji);

  let storePayload = null;
  const storeHarness = createRouteLifecycleHarness();
  storeHarness.setStore({
    caps() { return { ready: true, durable: true, health: "ok" }; },
    backend() { return "validator-store"; },
    async get() { return storePayload; },
    async set() { return true; },
  });
  await storeHarness.hook.attachStore("matrix-attach");
  await flushMicrotasks();
  const beforeStore = lifecycleSnapshot(storeHarness);
  storePayload = {
    baseTitle: "Accepted Store title",
    source: "user",
    priority: 100,
    confidence: 1,
    updatedAt: 1_786_000_000_050,
  };
  assert.equal(await storeHarness.hook.hydrateFromStore("stage1c-chat-a", "matrix-store"), true);
  const acceptedStore = lifecycleSnapshot(storeHarness);
  assert.equal(acceptedStore.state.baseTitle, "Accepted Store title");
  assert.equal(acceptedStore.routeToken, 1);
  assert(parityActivityChanged(beforeStore.parity, acceptedStore.parity));
  storePayload = {
    baseTitle: "Stale Store title",
    source: "library",
    priority: 80,
    updatedAt: 1_786_000_000_060,
  };
  assert.equal(await storeHarness.hook.hydrateFromStore("stage1c-chat-a", "matrix-stale-store"), false);
  const staleStore = lifecycleSnapshot(storeHarness);
  assert.deepEqual(staleStore, acceptedStore);
  assert.equal(staleStore.routeToken, 1);
  assertLegacyAuthority(storeHarness, staleStore);

  const crossHarness = createRouteLifecycleHarness();
  const beforeCross = lifecycleSnapshot(crossHarness);
  assert.equal(crossHarness.hook.applyCrossSurfaceTitlePayload({
    chatId: "stage1c-chat-a",
    titleState: {
      chatId: "stage1c-chat-a",
      baseTitle: "Accepted cross surface title",
      source: "user",
      priority: 100,
      updatedAt: 1_786_000_000_070,
    },
  }), true);
  const acceptedCross = lifecycleSnapshot(crossHarness);
  assert.equal(acceptedCross.state.baseTitle, "Accepted cross surface title");
  assert.equal(acceptedCross.routeToken, 1);
  assert(parityActivityChanged(beforeCross.parity, acceptedCross.parity));
  assert.equal(crossHarness.hook.applyCrossSurfaceTitlePayload({
    chatId: "stage1c-inactive",
    titleState: { chatId: "stage1c-inactive" },
  }), false);
  const inactiveCross = lifecycleSnapshot(crossHarness);
  assert.deepEqual(inactiveCross, acceptedCross);
  assert.equal(inactiveCross.routeToken, 1);
  assertLegacyAuthority(crossHarness, inactiveCross);

  const renameHarness = createRouteLifecycleHarness();
  renameHarness.setFetch(async (url) => {
    if (url === "/api/auth/session") {
      return { ok: true, async json() { return { accessToken: "validator-token" }; } };
    }
    return {
      ok: true,
      status: 200,
      clone() { return { async json() { return {}; } }; },
    };
  });
  const beforeRename = lifecycleSnapshot(renameHarness);
  const renameResult = await renameHarness.hook.renameNative("Accepted native completion", {
    userInitiated: true,
    source: "matrix-native",
  });
  const acceptedRename = lifecycleSnapshot(renameHarness);
  assert.equal(renameResult.ok, true);
  assert.equal(acceptedRename.state.baseTitle, "Accepted native completion");
  assert(parityActivityChanged(beforeRename.parity, acceptedRename.parity));
  assert.equal(acceptedRename.routeToken, 1);
  assertLegacyAuthority(renameHarness, acceptedRename);

  const failedRenameHarness = createRouteLifecycleHarness();
  failedRenameHarness.setFetch(async (url) => {
    if (url === "/api/auth/session") {
      return { ok: true, async json() { return {}; } };
    }
    return {
      ok: false,
      status: 500,
      clone() { return { async json() { return { error: "expected" }; } }; },
    };
  });
  const beforeFailedRename = lifecycleSnapshot(failedRenameHarness);
  const failedRename = await failedRenameHarness.hook.renameNative("Rejected native completion", {
    userInitiated: true,
    source: "matrix-native-failure",
  });
  const afterFailedRename = lifecycleSnapshot(failedRenameHarness);
  assert.equal(failedRename.ok, false);
  assert.deepEqual(afterFailedRename, beforeFailedRename);
  assert.equal(afterFailedRename.routeToken, 1);
  assertLegacyAuthority(failedRenameHarness, afterFailedRename);
});

function syntheticLoaderForToken(token) {
  return [
    `  const LOADER_BUILD_TS = ${token};`,
    `  const LOADER_BUILD_ISO = ${JSON.stringify(new Date(Number(token)).toISOString())};`,
    `  const PROXY_PACK_URL = ${JSON.stringify(LIVE_PROXY_URL)};`,
  ].join("\n");
}

function syntheticProxyForTokens({ headerToken, requireToken = headerToken, versionToken = headerToken }) {
  return [
    `// buildTs=${headerToken}`,
    "// count=1",
    "// ==H2O Module==",
    `// @version      ${versionToken}`,
    `// @require      http://127.0.0.1:5500/alias/9B0a._Chat_Title_State_.js?v=${requireToken}`,
    "// ==/H2O Module==",
  ].join("\n");
}

test("generated build-token parity accepts one independently matching token", () => {
  const token = "7".repeat(13);
  const result = validateGeneratedBuildTokenParity({
    loaderSource: syntheticLoaderForToken(token),
    proxySource: syntheticProxyForTokens({ headerToken: token }),
  });
  assert.equal(result.token, token);
  assert.equal(result.proxyEntryCount, 1);
  assert.equal(result.proxyUrl, LIVE_PROXY_URL);
});

test("generated build-token parity rejects a changed 9B0a proxy token", () => {
  const token = "7".repeat(13);
  assert.throws(() => validateGeneratedBuildTokenParity({
    loaderSource: syntheticLoaderForToken(token),
    proxySource: syntheticProxyForTokens({
      headerToken: token,
      requireToken: "8".repeat(13),
    }),
  }), /9B0a proxy token mismatch/u);
});

test("generated build-token parity rejects missing and malformed authority", () => {
  const token = "7".repeat(13);
  const proxySource = syntheticProxyForTokens({ headerToken: token });
  assert.throws(() => validateGeneratedBuildTokenParity({
    loaderSource: "",
    proxySource,
  }), /loader build token is missing/u);
  assert.throws(() => validateGeneratedBuildTokenParity({
    loaderSource: syntheticLoaderForToken(token).replace(token, "not-a-token"),
    proxySource,
  }), /loader build token must contain decimal digits only/u);
});

test("generated build-token parity rejects conflicting authoritative tokens", () => {
  const token = "7".repeat(13);
  const conflictingToken = "8".repeat(13);
  assert.throws(() => validateGeneratedBuildTokenParity({
    loaderSource: [
      syntheticLoaderForToken(token),
      `const LOADER_BUILD_TS = ${conflictingToken};`,
    ].join("\n"),
    proxySource: syntheticProxyForTokens({ headerToken: token }),
  }), /loader build token values conflict/u);
});

test("delivered proxy references the exact committed Stage 1C alias bytes and shared build token", () => {
  const aliasPath = path.join(ROOT, ALIAS_REL);
  assert.equal(fs.lstatSync(aliasPath).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(aliasPath), fs.realpathSync(runtimePath));
  const committedBytes = execFileSync("git", ["show", `HEAD:${RUNTIME_REL}`], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  const aliasBytes = fs.readFileSync(aliasPath);
  assert(aliasBytes.equals(committedBytes), "delivered alias differs from committed Stage 1C runtime");
  assert.equal(sha256(aliasBytes), EXPECTED_RUNTIME_SHA256);
  const proxy = fs.readFileSync(path.join(ROOT, PROXY_REL), "utf8");
  const loader = fs.readFileSync(path.join(ROOT, LOADER_REL), "utf8");
  const parity = validateGeneratedBuildTokenParity({
    loaderSource: loader,
    proxySource: proxy,
  });
  assert.equal(parity.proxyUrl, LIVE_PROXY_URL);
  generatedBuildTokenParity = parity;
});

test("canary expectation requires document continuity and permits no-op refresh", () => {
  assert(Object.isFrozen(CANARY_EXPECTATION));
  assert(Object.isFrozen(CANARY_EXPECTATION.counterContinuityRequires));
  assert.equal(CANARY_EXPECTATION.evaluateUnknownContinuityPerDocument, true);
  assert.equal(CANARY_EXPECTATION.sameRouteSemanticNoopMayKeepCounters, true);
  assert.deepEqual([...CANARY_EXPECTATION.counterContinuityRequires], [
    "same-in-memory-instance",
    "performance.timeOrigin",
    "trusted-diagnostic-documentId",
  ]);
});

function assertProtectedRuntimeIdentity() {
  const raw = execFileSync("git", [
    "-c", "core.quotePath=false", "ls-tree", "-rz", "--name-only", "HEAD", "--", "src-runtime-base",
  ], { cwd: ROOT });
  const paths = raw.toString().split("\0").filter(Boolean);
  for (const prefix of ["0A1a", "9B1a", "9C1a", "9D1a"]) {
    const matches = paths.filter((relative) => path.basename(relative).startsWith(prefix));
    assert.equal(matches.length, 1, `${prefix} path count`);
    const relative = matches[0];
    assert.equal(
      run("git", ["hash-object", "--no-filters", "--", relative]).trim(),
      run("git", ["rev-parse", `HEAD:${relative}`]).trim(),
      `${prefix} changed`,
    );
  }
}

test("protected title runtimes, H2O Core, and dev-order remain unchanged", () => {
  assertProtectedRuntimeIdentity();
  assert.equal(run("git", ["diff", "--name-only", "HEAD", "--", "config/dev-order.tsv"]).trim(), "");
  const order = fs.readFileSync(path.join(ROOT, "config/dev-order.tsv"), "utf8");
  for (const prefix of ["9B0a", "9B1a", "9C1a"]) assert(new RegExp(`^🟢\\t${prefix}\\.`, "mu").test(order));
  assert(/^🔴\t9D1a\./mu.test(order));
  assert(!fs.readFileSync(path.join(ROOT, PROXY_REL), "utf8").includes("9D1a."));
});

test("bridge regeneration and generated identities remain coherent", () => {
  const currentHead = run("git", ["rev-parse", "HEAD"]).trim();
  assert.equal(TITLE_CONTRACT_BRIDGE_GENERATOR_VERSION, "2");

  const contractPath = path.join(ROOT, CONTRACT_REL);
  const sourceBytes = fs.readFileSync(contractPath);
  const committedSourceBytes = execFileSync("git", ["show", `HEAD:${CONTRACT_REL}`], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert(sourceBytes.equals(committedSourceBytes), "working contract source must equal committed HEAD");

  const bridgeBytes = fs.readFileSync(path.join(ROOT, BRIDGE_REL));
  const generatedSandbox = {};
  vm.createContext(generatedSandbox);
  new vm.Script(bridgeBytes.toString("utf8"), { filename: BRIDGE_REL }).runInContext(generatedSandbox);
  const generatedContract = generatedSandbox.H2O?.TitleContract;
  assert(generatedContract && typeof generatedContract === "object", "generated public bridge missing");
  const generatedBuildHead = String(generatedContract.identity?.repositoryHeadAtBuild || "");
  assert.match(generatedBuildHead, /^[0-9a-f]{40}$/u, "generated bridge build HEAD identity");
  execFileSync("git", ["cat-file", "-e", `${generatedBuildHead}^{commit}`], { cwd: ROOT });
  execFileSync("git", ["merge-base", "--is-ancestor", generatedBuildHead, currentHead], { cwd: ROOT });

  const buildHeadSourceBytes = execFileSync("git", ["show", `${generatedBuildHead}:${CONTRACT_REL}`], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert(sourceBytes.equals(buildHeadSourceBytes), "contract source changed since bridge generation");

  const current = transformTitleContractToClassicBridge({
    sourceBytes,
    committedSourceBytes,
    repositoryHeadAtBuild: generatedBuildHead,
  });
  if (currentHead === generatedBuildHead) {
    const canonical = makeCanonicalTitleContractBridge({ repositoryRoot: ROOT });
    assert.equal(canonical.code, current.code, "canonical current-HEAD regeneration mismatch");
  }
  assert.equal(current.repositoryHeadAtBuild, generatedBuildHead);
  assert(Buffer.from(current.code, "utf8").equals(bridgeBytes), "current bridge differs from in-memory regeneration");
  const currentBridgeSha256 = sha256(bridgeBytes);

  const historical = transformTitleContractToClassicBridge({
    sourceBytes,
    committedSourceBytes,
    repositoryHeadAtBuild: HISTORICAL_STAGE1B_HEAD,
  });
  assert.equal(sha256(Buffer.from(historical.code, "utf8")), HISTORICAL_STAGE1B_BRIDGE_SHA256);
  assert.equal(current.code.split(generatedBuildHead).length - 1, 1);
  assert.equal(historical.code.split(HISTORICAL_STAGE1B_HEAD).length - 1, 1);
  assert.equal(
    current.code.replace(generatedBuildHead, "<REPOSITORY_HEAD>"),
    historical.code.replace(HISTORICAL_STAGE1B_HEAD, "<REPOSITORY_HEAD>"),
    "bridge generations differ beyond repositoryHeadAtBuild",
  );

  const contract = generatedContract;
  assert(contract && typeof contract === "object", "generated public bridge missing");
  const identity = contract.identity;
  for (const [key, expected] of Object.entries(EXPECTED_IDENTITY)) {
    assert.equal(identity?.[key], expected, `bridge identity ${key}`);
  }
  assert.equal(identity.repositoryHeadAtBuild, generatedBuildHead);
  assert.deepEqual([...identity.publicSurfaceKeys], [...TITLE_CONTRACT_PUBLIC_EXPORTS]);
  assert.equal(identity.publicSurfaceKeys.length, 27);
  assert.deepEqual(
    Object.keys(contract).filter((key) => key !== "identity").sort(),
    [...TITLE_CONTRACT_PUBLIC_EXPORTS],
  );
  for (const name of TITLE_CONTRACT_PRIVILEGED_EXPORTS) {
    assert.equal(Object.prototype.hasOwnProperty.call(contract, name), false, `${name} exposed`);
  }

  bridgeAttestation = Object.freeze({
    currentSha256: currentBridgeSha256,
    currentRepositoryHeadAtBuild: current.repositoryHeadAtBuild,
    repositoryHeadAtReview: currentHead,
    deterministicCurrentMatch: true,
    stableCompatibilityIdentity: true,
    publicSurfaceCount: identity.publicSurfaceKeys.length,
    privilegedExportsExposed: 0,
    historicalSha256: HISTORICAL_STAGE1B_BRIDGE_SHA256,
    historicalReconstructionMatch: true,
    normalizedDifferenceOnly: "repositoryHeadAtBuild",
  });

  assert(generatedBuildTokenParity, "generated build-token parity was not established");
  new vm.Script(fs.readFileSync(path.join(ROOT, LOADER_REL), "utf8"), { filename: LOADER_REL });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, MANIFEST_REL), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.3.0");
  assert.equal(manifest.key, getExtensionKey("dev-controls-oauth-google"));
  assert.equal(getExtensionId("dev-controls-oauth-google"), EXPECTED_EXTENSION_ID);
  assert.deepEqual(manifest.permissions, ["storage", "tabs", "contextMenus", "identity"]);
});

test("all 154 canonical aliases remain valid symlinks", () => {
  const script = `
    import fs from "node:fs";
    import path from "node:path";
    import { listAliasArtifacts } from "./tools/script-registry.mjs";
    const artifacts = listAliasArtifacts(path.resolve("apps/dev-server/alias"));
    if (artifacts.length !== 154) process.exit(2);
    for (const artifact of artifacts) {
      if (!fs.lstatSync(artifact.fullPath).isSymbolicLink()) process.exit(3);
      fs.realpathSync(artifact.fullPath);
    }
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: ROOT });
});

assert.equal(scopeTests.length, 15, "scope test count drifted");
assert.equal(tests.length, 45, "runtime scenario count drifted");

console.log(JSON.stringify({
  ok: true,
  validator: "title-stage1c-formatter-parity",
  scopeMode,
  scopeScenarios: scopeTests.length,
  runtimeScenarios: tests.length,
  runtimeSha256: sha256(fs.readFileSync(runtimePath)),
  validatorSha256: sha256(fs.readFileSync(path.join(ROOT, VALIDATOR_REL))),
  bridgeSha256: bridgeAttestation?.currentSha256 || null,
  bridgeAttestation,
  generatedBuildTokenParity,
  canaryExpectation: CANARY_EXPECTATION,
}));
