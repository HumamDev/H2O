#!/usr/bin/env node
/* Backend authority profile-gate proof.
 *
 * Exercises the real build-flag parser, generated loader source and real 0A4a
 * module in an offline sandbox. No live browser or network is used.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  makeChromeLiveLoaderJs,
  resolveBackendAuthorityCapability,
} from "../../product/extensions/chatgpt/chrome/chrome-live-loader.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BUILDER_PATH = path.join(
  ROOT,
  "tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs",
);
const LOADER_PATH = path.join(
  ROOT,
  "tools/product/extensions/chatgpt/chrome/chrome-live-loader.mjs",
);
const MANIFEST_PATH = path.join(
  ROOT,
  "tools/product/extensions/chatgpt/chrome/chrome-live-manifest.mjs",
);
const AUTHORITY_PATH = path.join(
  ROOT,
  "src-runtime-base/0A4a.⬛️🌐 Backend Request Authority 🌐.js",
);
const BUILDER_SOURCE = fs.readFileSync(BUILDER_PATH, "utf8");
const LOADER_SOURCE = fs.readFileSync(LOADER_PATH, "utf8");
const MANIFEST_SOURCE = fs.readFileSync(MANIFEST_PATH, "utf8");
const AUTHORITY_SOURCE = fs.readFileSync(AUTHORITY_PATH, "utf8");

const CAPABILITY_CONSTANT = "H2O_BACKEND_AUTHORITY_PROFILE_CAPABILITY_V1";
const CAPABILITY_ATTRIBUTE = "data-h2o-backend-authority-profile-v1";
const AUTHORITY_ALIAS = "0a4a.backend.request.authority";

const results = [];
const mutations = [];
const check = async (name, fn) => {
  await fn();
  results.push(name);
};

function makeLoader(capability) {
  return makeChromeLiveLoaderJs({
    DEV_TAG: "[H2O profile-gate validator]",
    DEV_TITLE: "H2O profile-gate validator",
    DEV_HAS_CONTROLS: false,
    PROXY_PACK_URL: "http://127.0.0.1:1/offline-never-requested",
    DEV_SCRIPT_CATALOG: [],
    DEV_ORDER_SECTIONS_SNAPSHOT: [],
    LOADER_DEPS_SNAPSHOT: {},
    STORAGE_KEY: "h2o:profile-gate-validator",
    STORAGE_ORDER_OVERRIDES_KEY: "h2o:profile-gate-validator:order",
    PAGE_FOLDER_BRIDGE_FILE: "folder-bridge.js",
    PAGE_PILOT_OBSERVER_FILE: "pilot-observer.js",
    TITLE_CONTRACT_BRIDGE_FILE: "title-contract-bridge.js",
    BACKEND_AUTHORITY_CAPABILITY: capability,
  });
}

function count(source, needle) {
  return source.split(needle).length - 1;
}

function assertLoaderDelivery(source, expected) {
  const declaration = `const ${CAPABILITY_CONSTANT} = Object.freeze({`;
  assert.equal(count(source, declaration), 1, "capability constant must be declared exactly once");
  assert.equal(count(source, `\"${CAPABILITY_ATTRIBUTE}\"`), 1,
    "profile capability attribute must be emitted exactly once");
  assert.equal(count(source, `aliasIdRaw === \"${AUTHORITY_ALIAS}\"`), 1,
    "capability delivery must target only the authority module");
  assert.match(
    source,
    new RegExp(`const ${CAPABILITY_CONSTANT} = Object\\.freeze\\(\\{\\s*enabled: ${expected},`),
    "generated loader must carry the requested exact boolean",
  );
  const attributeAt = source.indexOf(`\"${CAPABILITY_ATTRIBUTE}\"`);
  const appendAt = source.indexOf("host.appendChild(s)", attributeAt);
  assert.ok(attributeAt >= 0 && appendAt > attributeAt,
    "capability must be attached before the page-world module executes");
}

function makeResponse({ status = 200, body = {}, headers = {} } = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]),
  );
  const response = {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    json: async () => body,
  };
  response.clone = () => response;
  return response;
}

function bootAuthority({ capability, origin = "https://chatgpt.com", source = AUTHORITY_SOURCE } = {}) {
  const calls = [];
  const storage = {};
  const stats = { lockRequests: 0, storageWrites: 0, storageRemoves: 0 };
  const currentScript = {
    getAttribute(name) {
      if (name !== CAPABILITY_ATTRIBUTE || capability == null) return null;
      return capability ? "true" : "false";
    },
  };
  const localStorage = {
    getItem: (key) => storage[key] ?? null,
    setItem(key, value) {
      stats.storageWrites += 1;
      storage[key] = String(value);
    },
    removeItem(key) {
      stats.storageRemoves += 1;
      delete storage[key];
    },
  };
  const locks = {
    async request(name, options, callback) {
      stats.lockRequests += 1;
      return callback({ name, mode: options?.mode || "exclusive" });
    },
  };
  const W = {
    H2O: {},
    document: { currentScript },
    location: { origin, pathname: "/", href: `${origin}/` },
    navigator: { locks },
    fetch: async (url, init = {}) => {
      calls.push({ url: String(url), method: String(init.method || "GET") });
      if (String(url).includes("/api/auth/session")) {
        return makeResponse({ body: { accessToken: "offline-token" } });
      }
      return makeResponse({ body: { title: "offline-conversation" } });
    },
    setTimeout,
    clearTimeout,
  };
  const sandbox = {
    window: W,
    unsafeWindow: undefined,
    localStorage,
    AbortController,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Promise,
    Error,
    TypeError,
    RegExp,
    Symbol,
    Reflect,
    Proxy,
    isNaN,
    parseInt,
    parseFloat,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    console: { log() {}, warn() {}, error() {}, info() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(source, { filename: "0A4a.js" }).runInContext(sandbox);
  return { api: W.H2O.BackendAuthority, calls, stats };
}

async function assertDenied(harness) {
  const status = harness.api.status();
  assert.equal(status.available, false);
  assert.equal(status.reason, "profile-not-authorized");
  const result = await harness.api.request({ resource: "conversation", chatId: "offline-chat" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "authority-unavailable");
  assert.equal(result.reason, "profile-not-authorized");
  assert.equal(result.authorityUnavailable, true);
  assert.equal(harness.calls.length, 0, "profile denial must occur before fetch");
  assert.equal(harness.stats.lockRequests, 0, "profile denial must occur before Web Locks");
  assert.equal(harness.stats.storageWrites, 0, "profile denial must occur before storage/pacing");
  assert.equal(harness.stats.storageRemoves, 0, "profile denial must occur before storage probes");
}

async function assertGranted(harness) {
  const status = harness.api.status();
  assert.equal(status.available, true);
  assert.equal(status.reason, "");
  const result = await harness.api.request({ resource: "conversation", chatId: "offline-chat" });
  assert.equal(result.ok, true);
  assert.equal(result.status, "ok");
  assert.equal(harness.stats.lockRequests, 1, "granted path must enter the governed Web Lock");
  assert.equal(harness.calls.length, 2, "granted path must exercise mocked session and backend transport");
  assert.ok(harness.calls[0].url.includes("/api/auth/session"));
  assert.ok(harness.calls[1].url.includes("/backend-api/conversation/offline-chat"));
}

async function expectMutationKilled(name, probe) {
  let killed = false;
  try {
    await probe();
  } catch (error) {
    if (error?.name !== "AssertionError") throw error;
    killed = true;
  }
  assert.equal(killed, true, `${name} was not detected`);
  mutations.push(name);
}

await check("R1 builder default and strict boolean contract", () => {
  assert.equal(resolveBackendAuthorityCapability(undefined), false);
  assert.equal(resolveBackendAuthorityCapability("false"), false);
  assert.equal(resolveBackendAuthorityCapability("true"), true);
  for (const invalid of ["", "0", "1", "FALSE", "TRUE", "yes", " true "]) {
    assert.throws(() => resolveBackendAuthorityCapability(invalid), /Invalid H2O_BACKEND_AUTHORITY/);
  }
  assert.match(BUILDER_SOURCE, /process\.env\.H2O_BACKEND_AUTHORITY/,
    "builder must derive the flag from its dedicated environment value");
  assert.match(BUILDER_SOURCE, /resolveBackendAuthorityCapability\(/,
    "builder must use the strict parser");
  assert.match(BUILDER_SOURCE, /BACKEND_AUTHORITY_CAPABILITY,\s*\n\s*}\)\);/,
    "builder must pass the parsed boolean to loader generation");
});

await check("R2 loader delivery is frozen, exact and pre-execution", () => {
  const deniedLoader = makeLoader(false);
  const grantedLoader = makeLoader(true);
  assertLoaderDelivery(deniedLoader, false);
  assertLoaderDelivery(grantedLoader, true);
  assert.throws(() => makeLoader("false"), /must be a boolean/,
    "loader generator must reject non-boolean capabilities");
  assert.ok(LOADER_SOURCE.includes(`const ${CAPABILITY_CONSTANT}`));
  assert.ok(!LOADER_SOURCE.includes(`localStorage.getItem(\"${CAPABILITY_ATTRIBUTE}\")`),
    "capability must not come from localStorage");
  assert.match(MANIFEST_SOURCE, /js:\s*\["loader\.js"\],\s*\n\s*run_at:\s*"document_start"/,
    "the profile-specific loader must execute at document-start");
});

await check("R3 absent and false capability deny authority", async () => {
  await assertDenied(bootAuthority({ capability: undefined }));
  await assertDenied(bootAuthority({ capability: false }));
});

await check("R4 unauthorized profiles reach zero transport", async () => {
  const harness = bootAuthority({ capability: false });
  await assertDenied(harness);
});

await check("R5 denial preserves authority-unavailable surface", async () => {
  const harness = bootAuthority({ capability: false });
  const result = await harness.api.request({ resource: "conversation", chatId: "offline-chat" });
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      ok: false,
      status: "authority-unavailable",
      reason: "profile-not-authorized",
      statusCode: 0,
      authorityUnavailable: true,
    },
  );
  const unsupported = bootAuthority({ capability: false, origin: "https://example.invalid" });
  assert.equal(unsupported.api.status().reason, "unsupported-origin",
    "supported-origin denial must keep precedence");
});

await check("R6 true capability reaches existing governed transport", async () => {
  await assertGranted(bootAuthority({ capability: true }));
});

const gateBlock = `    if (!PROFILE_CAPABILITY.backendAuthority) {\n      return { available: false, reason: 'profile-not-authorized', origin };\n    }\n`;
assert.ok(AUTHORITY_SOURCE.includes(gateBlock), "validator cannot locate the profile gate mutation target");

await expectMutationKilled("M1 profile gate removal", async () => {
  const mutated = AUTHORITY_SOURCE.replace(gateBlock, "");
  await assertDenied(bootAuthority({ capability: false, source: mutated }));
});

await expectMutationKilled("M2 builder absent default changed to true", async () => {
  const mutated = LOADER_SOURCE
    .replace('import { TITLE_CONTRACT_BRIDGE_FILENAME } from "./title-contract/make-title-contract-bridge.mjs";',
      'const TITLE_CONTRACT_BRIDGE_FILENAME = "title-contract-bridge.js";')
    .replace('if (rawValue == null) return false;',
      'if (rawValue == null) return true;');
  assert.notEqual(mutated, LOADER_SOURCE);
  const dataUrl = `data:text/javascript;base64,${Buffer.from(mutated).toString("base64")}`;
  const module = await import(`${dataUrl}#mutation-${Date.now()}`);
  assert.equal(module.resolveBackendAuthorityCapability(undefined), false);
});

await expectMutationKilled("M3 loader false emission changed to true", async () => {
  const loader = makeLoader(false);
  const mutated = loader.replace("enabled: false,", "enabled: true,");
  assert.notEqual(mutated, loader);
  assertLoaderDelivery(mutated, false);
});

await expectMutationKilled("M4 false capability allowed to reach transport", async () => {
  const mutated = AUTHORITY_SOURCE.replace(
    "if (!PROFILE_CAPABILITY.backendAuthority) {",
    "if (false && !PROFILE_CAPABILITY.backendAuthority) {",
  );
  const harness = bootAuthority({ capability: false, source: mutated });
  await harness.api.request({ resource: "conversation", chatId: "offline-chat" });
  assert.equal(harness.calls.length, 0);
});

await expectMutationKilled("M5 true-state grant path broken", async () => {
  const mutated = AUTHORITY_SOURCE.replace(
    "W.document?.currentScript?.getAttribute(PROFILE_CAPABILITY_ATTRIBUTE) === 'true'",
    "false && W.document?.currentScript?.getAttribute(PROFILE_CAPABILITY_ATTRIBUTE) === 'true'",
  );
  assert.notEqual(mutated, AUTHORITY_SOURCE);
  await assertGranted(bootAuthority({ capability: true, source: mutated }));
});

assert.equal(results.length, 6);
assert.equal(mutations.length, 5);
console.log(`Backend authority profile gate: ${results.length}/6 properties PASS; ${mutations.length}/5 mutations killed`);
for (const result of results) console.log(`  PASS ${result}`);
for (const mutation of mutations) console.log(`  PASS ${mutation}`);
console.log("LIVE_BACKEND_REQUESTS=0");
