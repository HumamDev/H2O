#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  EXIT_CODES,
  acquireLease,
  currentProcessIdentity,
  deriveSharedAnchor,
} from "../../publish/canonical-delivery-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const PROXY_WRITER_REL = "tools/loader/make-ext-proxy-pack.mjs";
const ALIAS_WRITER_REL = "tools/loader/make-aliases.mjs";
const EXTENSION_WRITER_REL =
  "tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs";
const OPS_PANEL_WRITER_REL =
  "tools/product/extensions/chatgpt/chrome/pack-ops-panel.mjs";
const DESK_WRITER_REL =
  "tools/product/extensions/chatgpt/chrome/pack-desk.mjs";
const IDENTITY_PROVIDER_WRITER_REL =
  "tools/product/identity/build-identity-provider-bundle.mjs";
const IDENTITY_RELEASE_GATE_REL =
  "tools/validation/identity/run-identity-release-gate.mjs";
const F17_RELEASE_VALIDATOR_REL =
  "tools/validation/release/validate-f17-build-package.mjs";
const VALIDATOR_REL =
  "tools/validation/publish/validate-e2b-writer-enforcement-v1.mjs";
const PROXY_WRITER = path.join(ROOT, PROXY_WRITER_REL);
const EXTENSION_WRITER = path.join(ROOT, EXTENSION_WRITER_REL);
const OPS_PANEL_WRITER = path.join(ROOT, OPS_PANEL_WRITER_REL);
const DESK_WRITER = path.join(ROOT, DESK_WRITER_REL);
const IDENTITY_PROVIDER_WRITER = path.join(
  ROOT,
  IDENTITY_PROVIDER_WRITER_REL,
);
const IDENTITY_RELEASE_GATE = path.join(ROOT, IDENTITY_RELEASE_GATE_REL);
const F17_RELEASE_VALIDATOR = path.join(ROOT, F17_RELEASE_VALIDATOR_REL);
const CURRENT_BASE = "a102e219da8efa71d95f88b12f489cf63a0339de";
const FINAL_PATHS = Object.freeze([
  PROXY_WRITER_REL,
  EXTENSION_WRITER_REL,
  OPS_PANEL_WRITER_REL,
  DESK_WRITER_REL,
  IDENTITY_PROVIDER_WRITER_REL,
  VALIDATOR_REL,
  IDENTITY_RELEASE_GATE_REL,
  F17_RELEASE_VALIDATOR_REL,
]);
const UNCOMMITTED_MODIFIED = Object.freeze([
  IDENTITY_PROVIDER_WRITER_REL,
  VALIDATOR_REL,
]);
const UNCOMMITTED_UNTRACKED = Object.freeze([]);
const GUARDED_WRITER_SET = Object.freeze([
  ALIAS_WRITER_REL,
  PROXY_WRITER_REL,
  EXTENSION_WRITER_REL,
  OPS_PANEL_WRITER_REL,
  DESK_WRITER_REL,
  IDENTITY_PROVIDER_WRITER_REL,
]);
const EXPECTED_RUNTIME_SCENARIOS = 112;
const EXPECTED_SCOPE_SCENARIOS = 15;
const CANONICAL_PRESERVATION_CHECKS = 40;
const AUTHORITY_ENV_NAMES = Object.freeze([
  "H2O_CANONICAL_DELIVERY_ROOT",
  "H2O_CANONICAL_DELIVERY_TOKEN",
  "H2O_DELIVERY_SESSION_ID",
  "H2O_DELIVERY_APPROVED_HEAD",
  "H2O_BUILD_TS",
]);
const MUTATION_APIS = Object.freeze([
  "fs.mkdirSync(",
  "fs.rmSync(",
  "fs.unlinkSync(",
  "fs.writeFileSync(",
  "fs.renameSync(",
  "fs.copyFileSync(",
  "fs.symlinkSync(",
  "fs.appendFileSync(",
]);
const EXTENSION_MUTATION_INVOCATIONS = Object.freeze([
  "ensureDir(OUT_DIR);",
  "writeExtensionIcons(OUT_DIR,",
  "writeFile(path.join(OUT_DIR, \"manifest.json\")",
  "syncIdentitySurfaceToOut(SRC, OUT_DIR);",
  "syncIdentityProviderPrivateConfigToOut(",
  "buildIdentityProviderBundle(OUT_DIR);",
  "writeFile(backgroundFile, backgroundSource);",
  "copyPanelIconAsset(OUT_DIR);",
  "syncArchiveWorkbenchToOut(SRC, OUT_DIR);",
  "removeArchiveWorkbenchFromOut(OUT_DIR);",
  "fs.rmSync(path.join(OUT_DIR, \"surfaces\", \"studio\")",
  "writeFile(path.join(OUT_DIR, \"README.txt\")",
]);
const OPS_PANEL_MUTATION_INVOCATIONS = Object.freeze([
  "ensureDir(OUT_DIR);",
  "writeExtensionIcons(OUT_DIR, \"panel\");",
  "copyIconPack(OUT_DIR, OPS_ICON_PACK_DIR);",
  "writeFile(path.join(OUT_DIR, \"manifest.json\")",
  "writeFile(path.join(OUT_DIR, \"panel.html\")",
  "writeFile(path.join(OUT_DIR, \"panel.css\")",
  "writeFile(path.join(OUT_DIR, \"panel.js\")",
  "removeArchiveWorkbenchFromOut(OUT_DIR);",
  "removeIfPresent(path.join(OUT_DIR, staleName));",
  "writeFile(path.join(OUT_DIR, \"README.txt\")",
]);
const DESK_MUTATION_INVOCATIONS = Object.freeze([
  "await removeDir(buildDir);",
  "await ensureDir(buildUiDeskDir);",
  "await ensureDir(buildContentDir);",
  "await ensureDir(deskIconBuildDir);",
  "await copyFileSafe(from, to);",
  "await copyFileSafe(contentSourceFile, contentBuildFile);",
  "await copyDeskIcons();",
  "await writeManifest();",
  "await writeServiceWorker();",
]);
const IDENTITY_PROVIDER_MUTATION_INVOCATIONS = Object.freeze([
  "ensureDir(path.dirname(outFile));",
  "fs.rmSync(staleOutFile, { force: true });",
  "await esbuild.build({",
]);

const runtimeResults = [];
const scopeResults = [];
const temporaryRoots = new Set();
const canonicalRejections = [];
const extensionCanonicalRejections = [];
const opsPanelCanonicalRejections = [];
const deskCanonicalRejections = [];
const identityProviderCanonicalRejections = [];
let localOutsideResult = null;
let localForeignResult = null;
let noLeaseResult = null;
let validSessionResult = null;
let extensionLocalOutsideResult = null;
let extensionLocalForeignResult = null;
let extensionNoLeaseResult = null;
let extensionValidSessionResult = null;
let opsPanelLocalOutsideResult = null;
let opsPanelLocalForeignResult = null;
let opsPanelNoLeaseResult = null;
let opsPanelValidSessionResult = null;
let deskLocalOutsideResult = null;
let deskLocalForeignResult = null;
let deskNoLeaseResult = null;
let deskValidSessionResult = null;
let identityProviderLocalOutsideResult = null;
let identityProviderLocalForeignResult = null;
let identityProviderNoLeaseResult = null;
let identityProviderValidSessionResult = null;
let releaseValidatorResults = null;
let tokenRedactionProven = true;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 12_000,
    killSignal: "SIGTERM",
    ...options,
  });
}

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 8_000,
    killSignal: "SIGTERM",
    ...options,
  }).trim();
}

function lines(value) {
  return String(value).trim().split("\n").filter(Boolean);
}

function sorted(values) {
  return [...values].sort();
}

function sameSet(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filename) {
  return sha256Bytes(fs.readFileSync(filename));
}

function temporaryRoot(label) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), `h2o-stage1de2b-b3-${label}-`),
  );
  temporaryRoots.add(root);
  return root;
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSandboxPath(candidate) {
  assert.equal(
    [...temporaryRoots].some((root) => isWithin(root, candidate)),
    true,
    `path escaped E2B sandbox: ${candidate}`,
  );
}

function scopeFailure(message, state) {
  throw new assert.AssertionError({
    message: `${message}: ${JSON.stringify({
      head: state.head,
      modifiedTracked: sorted(state.modifiedTracked),
      staged: sorted(state.staged),
      untracked: sorted(state.untracked),
      trackedFinal: sorted(state.trackedFinal),
      missingFinal: sorted(state.missingFinal),
    })}`,
  });
}

export function classifyStage1DE2BBatch1Scope(state) {
  const normalized = {
    head: String(state.head ?? ""),
    modifiedTracked: sorted(state.modifiedTracked ?? []),
    staged: sorted(state.staged ?? []),
    untracked: sorted(state.untracked ?? []),
    trackedFinal: sorted(state.trackedFinal ?? []),
    missingFinal: sorted(state.missingFinal ?? []),
  };
  if (normalized.staged.length) {
    scopeFailure("Stage 1D-E2B final lean guard forbids staged paths", normalized);
  }
  const currentValidatorOnlyUncommitted =
    normalized.head === CURRENT_BASE &&
    sameSet(normalized.modifiedTracked, [VALIDATOR_REL]) &&
    normalized.untracked.length === 0 &&
    sameSet(normalized.trackedFinal, FINAL_PATHS) &&
    normalized.missingFinal.length === 0;
  if (currentValidatorOnlyUncommitted) {
    return "writer-enforcement-current-baseline-uncommitted";
  }
  const uncommitted =
    sameSet(normalized.modifiedTracked, UNCOMMITTED_MODIFIED) &&
    sameSet(normalized.untracked, UNCOMMITTED_UNTRACKED) &&
    sameSet(normalized.trackedFinal, FINAL_PATHS) &&
    normalized.missingFinal.length === 0;
  if (uncommitted) return "uncommitted";
  const committed =
    normalized.modifiedTracked.length === 0 &&
    normalized.untracked.length === 0 &&
    sameSet(normalized.trackedFinal, FINAL_PATHS) &&
    normalized.missingFinal.length === 0;
  if (committed) return "committed-clean";
  scopeFailure("Stage 1D-E2B final lean guard scope mismatch", normalized);
}

function currentScopeState() {
  return {
    head: run("git", ["rev-parse", "HEAD"]).trim(),
    modifiedTracked: lines(run("git", ["diff", "--name-only", "HEAD", "--"])),
    staged: lines(run("git", ["diff", "--cached", "--name-only", "--"])),
    untracked: lines(
      run("git", ["ls-files", "--others", "--exclude-standard", "--"]),
    ),
    trackedFinal: lines(run("git", ["ls-files", "--", ...FINAL_PATHS])),
    missingFinal: FINAL_PATHS.filter(
      (relative) => !fs.existsSync(path.join(ROOT, relative)),
    ),
  };
}

function baseScope(overrides = {}) {
  return {
    head: "0".repeat(40),
    modifiedTracked: [...UNCOMMITTED_MODIFIED],
    staged: [],
    untracked: [...UNCOMMITTED_UNTRACKED],
    trackedFinal: [...FINAL_PATHS],
    missingFinal: [],
    ...overrides,
  };
}

function scopeTest(name, fn) {
  fn();
  scopeResults.push(name);
  process.stdout.write(`ok scope ${scopeResults.length} - ${name}\n`);
}

function runScopeSelfTests() {
  scopeTest("exact cumulative E2B final lean guard uncommitted scope is accepted", () => {
    assert.equal(classifyStage1DE2BBatch1Scope(baseScope()), "uncommitted");
  });
  scopeTest("exact cumulative E2B final lean guard committed-clean scope is accepted", () => {
    assert.equal(
      classifyStage1DE2BBatch1Scope(
        baseScope({
          modifiedTracked: [],
          untracked: [],
          trackedFinal: [...FINAL_PATHS],
        }),
      ),
      "committed-clean",
    );
  });
  scopeTest("staging is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({ staged: [PROXY_WRITER_REL] }),
        ),
      /forbids staged/u,
    );
  });
  scopeTest("missing identity-provider writer modification is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(baseScope({
          modifiedTracked: UNCOMMITTED_MODIFIED.filter(
            (relative) => relative !== IDENTITY_PROVIDER_WRITER_REL,
          ),
        })),
      /scope mismatch/u,
    );
  });
  scopeTest("missing cumulative validator modification is rejected", () => {
    assert.throws(
      () => classifyStage1DE2BBatch1Scope(baseScope({
        modifiedTracked: UNCOMMITTED_MODIFIED.filter(
          (relative) => relative !== VALIDATOR_REL,
        ),
      })),
      /scope mismatch/u,
    );
  });
  scopeTest("dirty protected Batch 3 writer is rejected", () => {
    assert.throws(
      () => classifyStage1DE2BBatch1Scope(baseScope({
        modifiedTracked: [...UNCOMMITTED_MODIFIED, DESK_WRITER_REL],
      })),
      /scope mismatch/u,
    );
  });
  scopeTest("dirty committed Batch 2 extension writer is rejected", () => {
    assert.throws(
      () => classifyStage1DE2BBatch1Scope(baseScope({
        modifiedTracked: [...UNCOMMITTED_MODIFIED, EXTENSION_WRITER_REL],
      })),
      /scope mismatch/u,
    );
  });
  scopeTest("a third tracked source path is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({
            modifiedTracked: [...UNCOMMITTED_MODIFIED, "tools/dev/dev-all.mjs"],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("a third untracked source path is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({
            untracked: ["tools/validation/publish/extra.mjs"],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("an unexpected tracked final path is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({
            modifiedTracked: [],
            untracked: [],
            trackedFinal: [...FINAL_PATHS, "tools/dev/dev-all.mjs"],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("a missing final path is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({ missingFinal: [VALIDATOR_REL] }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("mixed post-commit dirty state is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({
            modifiedTracked: [PROXY_WRITER_REL],
            untracked: [],
            trackedFinal: [...FINAL_PATHS],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("tracked identity-provider writer moved to untracked role is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({
            modifiedTracked: UNCOMMITTED_MODIFIED.filter(
              (relative) => relative !== IDENTITY_PROVIDER_WRITER_REL,
            ),
            untracked: [IDENTITY_PROVIDER_WRITER_REL],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("dirty protected Batch 1 writer is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({
            modifiedTracked: [...UNCOMMITTED_MODIFIED, PROXY_WRITER_REL],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("current-main validator-only repair scope is exact and survives commit", () => {
    const repair = {
      head: CURRENT_BASE,
      modifiedTracked: [VALIDATOR_REL],
      staged: [],
      untracked: [],
      trackedFinal: [...FINAL_PATHS],
      missingFinal: [],
    };
    assert.equal(
      classifyStage1DE2BBatch1Scope(repair),
      "writer-enforcement-current-baseline-uncommitted",
    );
    assert.equal(
      classifyStage1DE2BBatch1Scope({
        ...repair,
        head: "f".repeat(40),
        modifiedTracked: [],
      }),
      "committed-clean",
    );
    for (const overrides of [
      { head: "f".repeat(40) },
      { modifiedTracked: [VALIDATOR_REL, PROXY_WRITER_REL] },
      { modifiedTracked: [IDENTITY_PROVIDER_WRITER_REL] },
      { staged: [VALIDATOR_REL] },
      { untracked: ["tools/validation/publish/foreign.mjs"] },
      {
        trackedFinal: FINAL_PATHS.filter(
          (relative) => relative !== IDENTITY_RELEASE_GATE_REL,
        ),
        missingFinal: [IDENTITY_RELEASE_GATE_REL],
      },
      {
        trackedFinal: FINAL_PATHS.filter(
          (relative) => relative !== IDENTITY_RELEASE_GATE_REL,
        ),
        untracked: [IDENTITY_RELEASE_GATE_REL],
      },
    ]) {
      assert.throws(
        () => classifyStage1DE2BBatch1Scope({ ...repair, ...overrides }),
        /scope mismatch|forbids staged/u,
      );
    }
  });
  assert.equal(scopeResults.length, EXPECTED_SCOPE_SCENARIOS);
}

async function test(name, fn) {
  await fn();
  runtimeResults.push(name);
  process.stdout.write(`ok ${runtimeResults.length} - ${name}\n`);
}

function initializeRepository(repository, label = "E2B Validator") {
  fs.mkdirSync(repository, { recursive: true });
  git(repository, ["init", "-b", "main"]);
  git(repository, ["config", "user.name", label]);
  git(repository, ["config", "user.email", "e2b-validator@example.invalid"]);
}

function writeSourceInputs(repository) {
  fs.mkdirSync(path.join(repository, "src-runtime-base"), { recursive: true });
  fs.mkdirSync(path.join(repository, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(repository, "src-runtime-base/9Z9z. Sandbox Probe.js"),
    [
      "// ==H2O Module==",
      "// @name Sandbox Probe",
      "// @run-at document-idle",
      "// ==/H2O Module==",
      "globalThis.__e2bSandboxProbe = true;",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(repository, "config/dev-order.tsv"),
    "ON\t9Z9z. Sandbox Probe.js\n",
  );
  fs.writeFileSync(
    path.join(repository, "config/loader-deps.json"),
    `${JSON.stringify({ groups: {} }, null, 2)}\n`,
  );
}

function createAliasInput(server) {
  const alias = path.join(server, "alias");
  fs.mkdirSync(alias, { recursive: true });
  fs.writeFileSync(
    path.join(alias, "9Z9z._Sandbox_Probe_.js"),
    [
      "// ==H2O Module==",
      "// @name Sandbox Probe",
      "// @run-at document-idle",
      "// ==/H2O Module==",
      "globalThis.__e2bSandboxProbe = true;",
      "",
    ].join("\n"),
  );
}

function seedPreservedDestination(proxy) {
  fs.mkdirSync(path.join(proxy, "nested"), { recursive: true });
  fs.writeFileSync(path.join(proxy, "sentinel.txt"), "unchanged\n");
  fs.writeFileSync(path.join(proxy, "nested/value.bin"), "fixed-bytes\n");
  fs.symlinkSync("sentinel.txt", path.join(proxy, "sentinel-link"));
}

function createFixture(label, { linkedWorktree = false } = {}) {
  const top = temporaryRoot(label);
  const cockpit = path.join(top, "cockpit-pro");
  const repository = path.join(cockpit, "h2o-cp-source");
  initializeRepository(repository);
  writeSourceInputs(repository);
  git(repository, ["add", "--", "src-runtime-base", "config"]);
  git(repository, ["commit", "-m", "sandbox source"]);

  const localServer = path.join(top, "outside-repository-server");
  createAliasInput(localServer);

  const canonicalServer = path.join(repository, "apps/dev-server");
  createAliasInput(canonicalServer);
  const canonicalDevOutput = path.join(canonicalServer, "dev_output");
  const canonicalProxy = path.join(canonicalDevOutput, "proxy");
  seedPreservedDestination(canonicalProxy);
  const canonicalExtensionRoot = path.join(
    repository,
    "apps/extensions/chatgpt/chrome",
  );
  const canonicalExtensionOutput = path.join(
    canonicalExtensionRoot,
    "dev-controls",
  );
  seedPreservedDestination(canonicalExtensionOutput);

  let foreignWorktree = null;
  let foreignServer = null;
  if (linkedWorktree) {
    foreignWorktree = path.join(cockpit, "worktrees", `foreign-${label}`);
    fs.mkdirSync(path.dirname(foreignWorktree), { recursive: true });
    git(repository, [
      "worktree",
      "add",
      "-b",
      `foreign-${label}`,
      foreignWorktree,
      "HEAD",
    ]);
    foreignServer = path.join(foreignWorktree, "apps/dev-server");
    createAliasInput(foreignServer);
  }

  return {
    top,
    cockpit,
    repository,
    localServer,
    canonicalServer,
    canonicalDevOutput,
    canonicalProxy,
    canonicalExtensionRoot,
    canonicalExtensionOutput,
    foreignWorktree,
    foreignServer,
  };
}

function createUnrelatedRepository(fixture, label) {
  const repository = path.join(fixture.top, `unrelated-${label}`);
  initializeRepository(repository, "E2B Unrelated Validator");
  writeSourceInputs(repository);
  git(repository, ["add", "--", "src-runtime-base", "config"]);
  git(repository, ["commit", "-m", "unrelated sandbox source"]);
  return repository;
}

function proxyEnvironment(fixture, {
  sourceRoot = fixture.repository,
  serverDir = fixture.localServer,
  overrides = {},
} = {}) {
  const environment = {
    ...process.env,
    H2O_SRC_DIR: sourceRoot,
    H2O_SERVER_DIR: serverDir,
    H2O_ORDER_FILE: path.join(sourceRoot, "config/dev-order.tsv"),
    H2O_DEPS_FILE: path.join(sourceRoot, "config/loader-deps.json"),
    H2O_DEV_ORIGIN: "http://127.0.0.1:65535",
  };
  for (const name of [...AUTHORITY_ENV_NAMES, "H2O_DEV_DIR_NAME"]) {
    delete environment[name];
  }
  Object.assign(environment, overrides);
  return environment;
}

function managedChild(command, args, {
  cwd,
  env,
  timeoutMs = 10_000,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer = null;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 750);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        argv: [command, ...args],
      });
    });
  });
}

async function runProxyWriter(fixture, options = {}) {
  const sourceRoot = options.sourceRoot ?? fixture.repository;
  const serverDir = options.serverDir ?? fixture.localServer;
  assertSandboxPath(sourceRoot);
  assertSandboxPath(serverDir);
  return managedChild(process.execPath, [PROXY_WRITER], {
    cwd: options.cwd ?? sourceRoot,
    env: proxyEnvironment(fixture, {
      sourceRoot,
      serverDir,
      overrides: options.overrides ?? {},
    }),
  });
}

function extensionEnvironment({
  sourceRoot = ROOT,
  outDir = null,
  buildRoot = null,
  overrides = {},
} = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("H2O_")) delete environment[name];
  }
  Object.assign(environment, {
    H2O_SRC_DIR: sourceRoot,
    H2O_ORDER_FILE: path.join(sourceRoot, "config/dev-order.tsv"),
    H2O_EXT_DEV_VARIANT: "controls",
    H2O_EXT_PROXY_PACK_URL: "http://127.0.0.1:65535/dev_output/proxy/pack",
  });
  if (outDir !== null) environment.H2O_EXT_OUT_DIR = outDir;
  if (buildRoot !== null) environment.H2O_EXT_BUILD_ROOT = buildRoot;
  Object.assign(environment, overrides);
  return environment;
}

async function runExtensionWriter(fixture, options = {}) {
  const sourceRoot = options.sourceRoot ?? ROOT;
  const outDir = Object.hasOwn(options, "outDir")
    ? options.outDir
    : fixture.canonicalExtensionOutput;
  const buildRoot = options.buildRoot ?? null;
  if (outDir !== null) assertSandboxPath(outDir);
  if (buildRoot !== null) assertSandboxPath(buildRoot);
  return managedChild(process.execPath, [EXTENSION_WRITER], {
    cwd: options.cwd ?? sourceRoot,
    env: extensionEnvironment({
      sourceRoot,
      outDir,
      buildRoot,
      overrides: options.overrides ?? {},
    }),
    timeoutMs: options.timeoutMs ?? 30_000,
  });
}

function packWriterEnvironment({
  sourceRoot = ROOT,
  outDir,
  kind,
  overrides = {},
} = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("H2O_")) delete environment[name];
  }
  environment.H2O_SRC_DIR = sourceRoot;
  if (kind === "ops-panel") {
    environment.H2O_PANEL_OUT_DIR = outDir;
  } else if (kind === "desk") {
    assert.equal(path.basename(outDir), "desk");
    environment.H2O_EXT_BUILD_ROOT = path.dirname(outDir);
  } else {
    throw new Error(`unknown pack writer kind: ${kind}`);
  }
  Object.assign(environment, overrides);
  return environment;
}

async function runPackWriter(fixture, kind, options = {}) {
  const writer = options.writer ??
    (kind === "ops-panel" ? OPS_PANEL_WRITER : DESK_WRITER);
  const sourceRoot = options.sourceRoot ?? ROOT;
  const outDir = options.outDir;
  if (path.resolve(sourceRoot) !== path.resolve(ROOT)) {
    assertSandboxPath(sourceRoot);
  }
  assertSandboxPath(outDir);
  return managedChild(process.execPath, [writer], {
    cwd: options.cwd ?? sourceRoot,
    env: packWriterEnvironment({
      sourceRoot,
      outDir,
      kind,
      overrides: options.overrides ?? {},
    }),
    timeoutMs: options.timeoutMs ?? 30_000,
  });
}

function identityProviderEnvironment({
  sourceRoot = ROOT,
  outDir,
  overrides = {},
} = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("H2O_")) delete environment[name];
  }
  environment.H2O_SRC_DIR = sourceRoot;
  environment.H2O_EXT_OUT_DIR = outDir;
  Object.assign(environment, overrides);
  return environment;
}

async function runIdentityProviderWriter(fixture, options = {}) {
  const writer = options.writer ?? IDENTITY_PROVIDER_WRITER;
  const sourceRoot = options.sourceRoot ?? ROOT;
  const outDir = options.outDir;
  if (path.resolve(sourceRoot) !== path.resolve(ROOT)) {
    assertSandboxPath(sourceRoot);
  }
  if (path.resolve(writer) !== path.resolve(IDENTITY_PROVIDER_WRITER)) {
    assertSandboxPath(writer);
  }
  assertSandboxPath(outDir);
  const executableWriter = fs.realpathSync(writer);
  return managedChild(process.execPath, [executableWriter], {
    cwd: options.cwd ?? sourceRoot,
    env: identityProviderEnvironment({
      sourceRoot,
      outDir,
      overrides: options.overrides ?? {},
    }),
    timeoutMs: options.timeoutMs ?? 30_000,
  });
}

async function runImportedIdentityProviderWriter(fixture, options = {}) {
  const sourceRoot = options.sourceRoot ?? ROOT;
  const outDir = options.outDir;
  assertSandboxPath(outDir);
  if (path.resolve(sourceRoot) !== path.resolve(ROOT)) {
    assertSandboxPath(sourceRoot);
  }
  const moduleUrl = pathToFileURL(IDENTITY_PROVIDER_WRITER).href;
  const probe = [
    `import { buildIdentityProviderBundle } from ${JSON.stringify(moduleUrl)};`,
    "try {",
    "  await buildIdentityProviderBundle(process.env.H2O_EXT_OUT_DIR);",
    "  process.stdout.write(JSON.stringify({ ok: true }) + \"\\n\");",
    "} catch (error) {",
    "  const exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;",
    "  const body = {",
    "    ok: false,",
    "    error: typeof error?.code === \"string\" ? error.code : \"identity-provider-bundle-import-failed\",",
    "    message: typeof error?.message === \"string\" ? error.message : \"Identity-provider bundle import failed.\",",
    "    exitCode,",
    "  };",
    "  process.stderr.write(\"[H2O] identity-provider-bundle imported guard rejected: \" + JSON.stringify(body) + \"\\n\");",
    "  process.exit(exitCode);",
    "}",
  ].join("\n");
  return managedChild(
    process.execPath,
    ["--input-type=module", "--eval", probe],
    {
      cwd: options.cwd ?? sourceRoot,
      env: identityProviderEnvironment({
        sourceRoot,
        outDir,
        overrides: options.overrides ?? {},
      }),
      timeoutMs: options.timeoutMs ?? 30_000,
    },
  );
}

function snapshotAnchorIdentity(anchorRoot) {
  const root = path.resolve(anchorRoot);
  let rootStat;
  try {
    rootStat = fs.lstatSync(root);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { root, exists: false, rootIdentity: null, entries: [] };
    }
    throw error;
  }

  function identity(target, relativePath, stat) {
    if (stat.isSymbolicLink()) {
      return { path: relativePath, type: "symlink", target: fs.readlinkSync(target) };
    }
    if (stat.isDirectory()) return { path: relativePath, type: "directory" };
    if (stat.isFile()) {
      return {
        path: relativePath,
        type: "regular-file",
        bytes: stat.size,
        sha256: sha256File(target),
      };
    }
    throw new Error(`anchor-identity-unsupported-entry-type: ${target}`);
  }

  const rootIdentity = identity(root, ".", rootStat);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    return { root, exists: true, rootIdentity, entries: [] };
  }
  const entries = [];
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      const relativePath = path.relative(root, target).split(path.sep).join("/");
      entries.push(identity(target, relativePath, stat));
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(target);
    }
  }
  visit(root);
  return { root, exists: true, rootIdentity, entries };
}

function snapshotPath(target) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return { exists: false };
    }
    throw error;
  }
  const result = {
    exists: true,
    type: stat.isDirectory()
      ? "directory"
      : stat.isSymbolicLink()
        ? "symlink"
        : "file",
    inode: stat.ino,
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
  if (stat.isSymbolicLink()) result.link = fs.readlinkSync(target);
  if (stat.isFile()) result.sha256 = sha256File(target);
  if (stat.isDirectory()) {
    result.entries = fs.readdirSync(target)
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((name) => ({
        name,
        value: snapshotPath(path.join(target, name)),
      }));
  }
  return result;
}

function acquireCanonicalLease(fixture, {
  nowMs = Date.now(),
  ttlMs = 4 * 60 * 60 * 1000,
  purpose = "make-ext-proxy-pack",
  worktree = fixture.repository,
} = {}) {
  const anchor = deriveSharedAnchor({
    cwd: fixture.repository,
    env: {},
    allowOverride: false,
  });
  const head = git(worktree, ["rev-parse", "HEAD"]);
  const branch = git(worktree, ["branch", "--show-current"]) || "(detached)";
  const acquisition = acquireLease({
    anchorRoot: anchor.root,
    canonicalRoot: fixture.repository,
    authoritativeRepositoryRoot: fixture.repository,
    publisherRepositoryRoot: fixture.repository,
    publisherWorktreeRoot: worktree,
    branch,
    head,
    purpose,
    lane: "canonical-delivery",
    buildTs: String(nowMs),
    expectedExtensionOutput: path.join(
      fixture.repository,
      "apps/extensions/chatgpt/chrome/dev-controls-oauth-google",
    ),
    ttlMs,
    nowMs,
    processIdentity: currentProcessIdentity(nowMs),
  });
  return { anchor, acquisition };
}

function mutateLease(prepared, transform) {
  const metadataPath = path.join(
    prepared.anchor.root,
    "active-lease/lease.json",
  );
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  transform(metadata);
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

function guardDiagnostic(result) {
  const diagnosticLines = lines(result.stderr);
  assert.equal(diagnosticLines.length, 1, result.stderr);
  const prefix = "[H2O] proxy-pack write guard rejected: ";
  assert.equal(diagnosticLines[0].startsWith(prefix), true);
  return JSON.parse(diagnosticLines[0].slice(prefix.length));
}

function extensionGuardDiagnostic(result) {
  const diagnosticLines = lines(result.stderr);
  assert.equal(diagnosticLines.length, 1, result.stderr);
  const prefix = "[H2O] extension write guard rejected: ";
  assert.equal(diagnosticLines[0].startsWith(prefix), true);
  return JSON.parse(diagnosticLines[0].slice(prefix.length));
}

function packGuardDiagnostic(result, kind) {
  const diagnosticLines = lines(result.stderr);
  assert.equal(diagnosticLines.length, 1, result.stderr);
  const prefix = kind === "ops-panel"
    ? "[H2O] ops-panel write guard rejected: "
    : "[H2O] desk write guard rejected: ";
  assert.equal(diagnosticLines[0].startsWith(prefix), true);
  return JSON.parse(diagnosticLines[0].slice(prefix.length));
}

function identityProviderGuardDiagnostic(result, { imported = false } = {}) {
  const diagnosticLines = lines(result.stderr);
  assert.equal(diagnosticLines.length, 1, result.stderr);
  const prefix = imported
    ? "[H2O] identity-provider-bundle imported guard rejected: "
    : "[H2O] identity-provider-bundle write guard rejected: ";
  assert.equal(diagnosticLines[0].startsWith(prefix), true);
  return JSON.parse(diagnosticLines[0].slice(prefix.length));
}

async function rejectedProxyCase(label, {
  prepare,
  sourceRoot,
  serverDir,
  overrides,
  snapshotTarget,
  expectedExit,
  expectedCode,
  expectedText,
  linkedWorktree = false,
} = {}) {
  const fixture = createFixture(label, { linkedWorktree });
  const prepared = prepare ? await prepare(fixture) : {};
  const effectiveSource =
    typeof sourceRoot === "function"
      ? sourceRoot(fixture, prepared)
      : sourceRoot ?? fixture.repository;
  const effectiveServer =
    typeof serverDir === "function"
      ? serverDir(fixture, prepared)
      : serverDir ?? fixture.canonicalServer;
  const effectiveOverrides =
    typeof overrides === "function"
      ? overrides(fixture, prepared)
      : overrides ?? {};
  const effectiveSnapshot =
    typeof snapshotTarget === "function"
      ? snapshotTarget(fixture, prepared)
      : snapshotTarget ?? fixture.canonicalDevOutput;
  assertSandboxPath(effectiveSnapshot);
  const before = snapshotPath(effectiveSnapshot);
  const result = await runProxyWriter(fixture, {
    sourceRoot: effectiveSource,
    serverDir: effectiveServer,
    cwd: effectiveSource,
    overrides: effectiveOverrides,
  });
  const after = snapshotPath(effectiveSnapshot);
  assert.equal(result.timedOut, false);
  assert.equal(result.code, expectedExit, result.stderr);
  assert.deepEqual(after, before);
  assert.equal(result.stdout, "");
  const diagnostic = guardDiagnostic(result);
  assert.equal(diagnostic.exitCode, expectedExit);
  if (expectedCode) assert.equal(diagnostic.error, expectedCode);
  if (expectedText) {
    assert.match(`${result.stdout}\n${result.stderr}`, expectedText);
  }
  const token = prepared.acquisition?.ownershipToken ??
    effectiveOverrides.H2O_CANONICAL_DELIVERY_TOKEN;
  const tokenDigest = token ? sha256Bytes(token) : null;
  const exposed = JSON.stringify({ result, diagnostic });
  if (token) {
    assert.equal(exposed.includes(token), false);
    assert.equal(exposed.includes(tokenDigest), false);
    assert.equal(result.argv.includes(token), false);
    tokenRedactionProven &&= !exposed.includes(token) &&
      !exposed.includes(tokenDigest) &&
      !result.argv.includes(token);
  }
  canonicalRejections.push({
    label,
    before,
    after,
    result,
    diagnostic,
    token,
    tokenDigest,
  });
  return { fixture, prepared, result, diagnostic, before, after };
}

async function rejectedExtensionCase(label, {
  prepare,
  sourceRoot,
  outDir,
  buildRoot,
  overrides,
  snapshotTarget,
  expectedExit,
  expectedCode,
  expectedText,
  linkedWorktree = false,
} = {}) {
  const fixture = createFixture(`extension-${label}`, { linkedWorktree });
  const prepared = prepare ? await prepare(fixture) : {};
  const effectiveSource =
    typeof sourceRoot === "function"
      ? sourceRoot(fixture, prepared)
      : sourceRoot ?? ROOT;
  const effectiveOut =
    typeof outDir === "function"
      ? outDir(fixture, prepared)
      : outDir === undefined
        ? fixture.canonicalExtensionOutput
        : outDir;
  const effectiveBuildRoot =
    typeof buildRoot === "function"
      ? buildRoot(fixture, prepared)
      : buildRoot ?? null;
  const effectiveOverrides =
    typeof overrides === "function"
      ? overrides(fixture, prepared)
      : overrides ?? {};
  const effectiveSnapshot =
    typeof snapshotTarget === "function"
      ? snapshotTarget(fixture, prepared)
      : snapshotTarget ?? fixture.canonicalExtensionOutput;
  assertSandboxPath(effectiveSnapshot);
  const before = snapshotPath(effectiveSnapshot);
  const result = await runExtensionWriter(fixture, {
    sourceRoot: effectiveSource,
    outDir: effectiveOut,
    buildRoot: effectiveBuildRoot,
    cwd: effectiveSource,
    overrides: effectiveOverrides,
  });
  const after = snapshotPath(effectiveSnapshot);
  assert.equal(result.timedOut, false);
  assert.equal(result.code, expectedExit, result.stderr);
  assert.deepEqual(after, before, label);
  assert.equal(result.stdout, "");
  const diagnostic = extensionGuardDiagnostic(result);
  assert.equal(diagnostic.exitCode, expectedExit);
  if (expectedCode) assert.equal(diagnostic.error, expectedCode);
  if (expectedText) {
    assert.match(`${result.stdout}\n${result.stderr}`, expectedText);
  }
  const token = prepared.acquisition?.ownershipToken ??
    effectiveOverrides.H2O_CANONICAL_DELIVERY_TOKEN;
  const tokenDigest = token ? sha256Bytes(token) : null;
  const exposed = JSON.stringify({ result, diagnostic });
  if (token) {
    assert.equal(exposed.includes(token), false);
    assert.equal(exposed.includes(tokenDigest), false);
    assert.equal(result.argv.includes(token), false);
    tokenRedactionProven &&= !exposed.includes(token) &&
      !exposed.includes(tokenDigest) &&
      !result.argv.includes(token);
  }
  extensionCanonicalRejections.push({
    label,
    before,
    after,
    result,
    diagnostic,
    token,
    tokenDigest,
  });
  return { fixture, prepared, result, diagnostic, before, after };
}

async function rejectedPackCase(kind, label, {
  prepare,
  sourceRoot,
  outDir,
  overrides,
  snapshotTarget,
  expectedExit,
  expectedCode,
  expectedText,
  linkedWorktree = false,
} = {}) {
  const fixture = createFixture(`${kind}-${label}`, { linkedWorktree });
  const prepared = prepare ? await prepare(fixture) : {};
  const variant = kind === "ops-panel" ? "ops-panel" : "desk";
  const defaultOutput = path.join(
    fixture.repository,
    "apps/extensions/chatgpt/chrome",
    variant,
  );
  if (!fs.existsSync(defaultOutput)) seedPreservedDestination(defaultOutput);
  const effectiveSource =
    typeof sourceRoot === "function"
      ? sourceRoot(fixture, prepared)
      : sourceRoot ?? ROOT;
  const effectiveOut =
    typeof outDir === "function"
      ? outDir(fixture, prepared)
      : outDir ?? defaultOutput;
  const effectiveOverrides =
    typeof overrides === "function"
      ? overrides(fixture, prepared)
      : overrides ?? {};
  const effectiveSnapshot =
    typeof snapshotTarget === "function"
      ? snapshotTarget(fixture, prepared)
      : snapshotTarget ?? effectiveOut;
  const snapshotTargets = Array.isArray(effectiveSnapshot)
    ? effectiveSnapshot
    : [effectiveSnapshot];
  snapshotTargets.forEach(assertSandboxPath);
  const before = snapshotTargets.map(snapshotPath);
  const result = await runPackWriter(fixture, kind, {
    sourceRoot: effectiveSource,
    outDir: effectiveOut,
    cwd: effectiveSource,
    overrides: effectiveOverrides,
  });
  const after = snapshotTargets.map(snapshotPath);
  assert.equal(result.timedOut, false);
  assert.equal(result.code, expectedExit, result.stderr);
  assert.deepEqual(after, before, `${kind}-${label}`);
  assert.equal(result.stdout, "");
  const diagnostic = packGuardDiagnostic(result, kind);
  assert.equal(diagnostic.exitCode, expectedExit);
  if (expectedCode) assert.equal(diagnostic.error, expectedCode);
  if (expectedText) {
    assert.match(`${result.stdout}\n${result.stderr}`, expectedText);
  }
  const token = prepared.acquisition?.ownershipToken ??
    effectiveOverrides.H2O_CANONICAL_DELIVERY_TOKEN;
  const tokenDigest = token ? sha256Bytes(token) : null;
  const exposed = JSON.stringify({ result, diagnostic });
  if (token) {
    assert.equal(exposed.includes(token), false);
    assert.equal(exposed.includes(tokenDigest), false);
    assert.equal(result.argv.includes(token), false);
    tokenRedactionProven &&= !exposed.includes(token) &&
      !exposed.includes(tokenDigest) &&
      !result.argv.includes(token);
  }
  const rejection = {
    label,
    before,
    after,
    result,
    diagnostic,
    token,
    tokenDigest,
  };
  if (kind === "ops-panel") {
    opsPanelCanonicalRejections.push(rejection);
  } else {
    deskCanonicalRejections.push(rejection);
  }
  return { fixture, prepared, result, diagnostic, before, after };
}

async function rejectedIdentityProviderCase(label, {
  prepare,
  sourceRoot,
  outDir,
  overrides,
  snapshotTarget,
  expectedExit,
  expectedCode,
  expectedText,
  imported = false,
  linkedWorktree = false,
} = {}) {
  const fixture = createFixture(`identity-provider-${label}`, {
    linkedWorktree,
  });
  const prepared = prepare ? await prepare(fixture) : {};
  const effectiveSource =
    typeof sourceRoot === "function"
      ? sourceRoot(fixture, prepared)
      : sourceRoot ?? ROOT;
  const effectiveOut =
    typeof outDir === "function"
      ? outDir(fixture, prepared)
      : outDir ?? fixture.canonicalExtensionOutput;
  const effectiveOverrides =
    typeof overrides === "function"
      ? overrides(fixture, prepared)
      : overrides ?? {};
  const effectiveSnapshot =
    typeof snapshotTarget === "function"
      ? snapshotTarget(fixture, prepared)
      : snapshotTarget ?? effectiveOut;
  const snapshotTargets = Array.isArray(effectiveSnapshot)
    ? effectiveSnapshot
    : [effectiveSnapshot];
  snapshotTargets.forEach(assertSandboxPath);
  const before = snapshotTargets.map(snapshotPath);
  const result = imported
    ? await runImportedIdentityProviderWriter(fixture, {
        sourceRoot: effectiveSource,
        outDir: effectiveOut,
        cwd: effectiveSource,
        overrides: effectiveOverrides,
      })
    : await runIdentityProviderWriter(fixture, {
        sourceRoot: effectiveSource,
        outDir: effectiveOut,
        cwd: effectiveSource,
        overrides: effectiveOverrides,
      });
  const after = snapshotTargets.map(snapshotPath);
  assert.equal(result.timedOut, false);
  assert.equal(result.code, expectedExit, result.stderr);
  assert.deepEqual(after, before, `identity-provider-${label}`);
  assert.equal(result.stdout, "");
  const diagnostic = identityProviderGuardDiagnostic(result, { imported });
  assert.equal(diagnostic.exitCode, expectedExit);
  if (expectedCode) assert.equal(diagnostic.error, expectedCode);
  if (expectedText) {
    assert.match(`${result.stdout}\n${result.stderr}`, expectedText);
  }
  const token = prepared.acquisition?.ownershipToken ??
    effectiveOverrides.H2O_CANONICAL_DELIVERY_TOKEN;
  const tokenDigest = token ? sha256Bytes(token) : null;
  const exposed = JSON.stringify({ result, diagnostic });
  if (token) {
    assert.equal(exposed.includes(token), false);
    assert.equal(exposed.includes(tokenDigest), false);
    assert.equal(result.argv.includes(token), false);
    tokenRedactionProven &&= !exposed.includes(token) &&
      !exposed.includes(tokenDigest) &&
      !result.argv.includes(token);
  }
  identityProviderCanonicalRejections.push({
    label,
    before,
    after,
    result,
    diagnostic,
    token,
    tokenDigest,
    imported,
  });
  return { fixture, prepared, result, diagnostic, before, after };
}

function initializeNestedRepository(repository, label) {
  initializeRepository(repository, label);
  fs.writeFileSync(path.join(repository, "nested-owner.txt"), "owner\n");
  git(repository, ["add", "--", "nested-owner.txt"]);
  git(repository, ["commit", "-m", "nested owner"]);
}

function structuralGuardOrdering(source) {
  const importIndex = source.indexOf(
    'import { assertDeliveryWritePermitted } from "../publish/canonical-write-guard.mjs";',
  );
  const destinationIndex = source.indexOf(
    "const PROXY_DIR = path.join(SERVER, DEV_DIR_NAME, \"proxy\");",
  );
  const guardIndex = source.indexOf("assertDeliveryWritePermitted({");
  const cleanupIndex = source.indexOf(
    "const removedProxyArtifacts = cleanProxyDirKeepPack();",
  );
  const mutationIndexes = MUTATION_APIS.flatMap((token) => {
    const indexes = [];
    let cursor = source.indexOf(token);
    while (cursor >= 0) {
      indexes.push({ token, index: cursor });
      cursor = source.indexOf(token, cursor + token.length);
    }
    return indexes;
  });
  return {
    importIndex,
    destinationIndex,
    guardIndex,
    cleanupIndex,
    mutationIndexes,
    valid:
      importIndex >= 0 &&
      destinationIndex > importIndex &&
      guardIndex > destinationIndex &&
      cleanupIndex > guardIndex &&
      mutationIndexes.length > 0 &&
      mutationIndexes.every(({ index }) => index > guardIndex),
  };
}

function moveGuardAfterCleanup(source) {
  const blockPattern =
    /try \{\n  assertDeliveryWritePermitted\(\{[\s\S]*?\n  process\.exit\(exitCode\);\n\}\n\n/u;
  const match = source.match(blockPattern);
  assert.ok(match, "guard block fixture not found");
  const without = source.replace(blockPattern, "");
  return without.replace(
    "const removedProxyArtifacts = cleanProxyDirKeepPack();",
    `const removedProxyArtifacts = cleanProxyDirKeepPack();\n${match[0]}`,
  );
}

function structuralExtensionGuardOrdering(source) {
  const importIndex = source.indexOf(
    'import { assertDeliveryWritePermitted } from "../../../../publish/canonical-write-guard.mjs";',
  );
  const destinationIndex = source.indexOf(
    "} = createChromeLiveBuildContext();",
  );
  const mainIndex = source.indexOf("async function main() {");
  const guardIndex = source.indexOf(
    "assertDeliveryWritePermitted({",
    mainIndex,
  );
  const ensureIndex = source.indexOf("ensureDir(OUT_DIR);", mainIndex);
  const mainOpenBrace = source.indexOf("{", mainIndex);
  const prefixBeforeGuard = source.slice(
    mainOpenBrace + 1,
    source.lastIndexOf("try {", guardIndex),
  ).trim();
  const mutationIndexes = EXTENSION_MUTATION_INVOCATIONS.map((token) => ({
    token,
    index: source.indexOf(token, mainIndex),
  }));
  return {
    importIndex,
    destinationIndex,
    mainIndex,
    guardIndex,
    ensureIndex,
    prefixBeforeGuard,
    mutationIndexes,
    valid:
      importIndex >= 0 &&
      destinationIndex > importIndex &&
      mainIndex > destinationIndex &&
      guardIndex > mainIndex &&
      prefixBeforeGuard === "" &&
      ensureIndex > guardIndex &&
      mutationIndexes.every(({ index }) => index > guardIndex),
  };
}

function moveExtensionGuardAfterEnsure(source) {
  const blockPattern =
    /  try \{\n    assertDeliveryWritePermitted\(\{[\s\S]*?\n    process\.exit\(exitCode\);\n  \}\n\n/u;
  const match = source.match(blockPattern);
  assert.ok(match, "extension guard block fixture not found");
  const without = source.replace(blockPattern, "");
  return without.replace(
    "  ensureDir(OUT_DIR);",
    `  ensureDir(OUT_DIR);\n${match[0]}`,
  );
}

function removeExtensionGuard(source) {
  const blockPattern =
    /  try \{\n    assertDeliveryWritePermitted\(\{[\s\S]*?\n    process\.exit\(exitCode\);\n  \}\n\n/u;
  assert.match(source, blockPattern);
  return source.replace(blockPattern, "");
}

function structuralPackGuardOrdering(source, kind) {
  const importIndex = source.indexOf(
    'import { assertDeliveryWritePermitted } from "../../../../publish/canonical-write-guard.mjs";',
  );
  const entryToken = kind === "ops-panel"
    ? "async function main() {"
    : "async function build() {";
  const destinationToken = kind === "ops-panel"
    ? "const OUT_DIR ="
    : 'const buildDir = extensionBuildDir("desk");';
  const destinationIndex = source.indexOf(destinationToken);
  const entryIndex = source.indexOf(entryToken);
  const guardIndex = source.indexOf("assertDeliveryWritePermitted({", entryIndex);
  const tryIndex = source.lastIndexOf("try {", guardIndex);
  const prefixBeforeGuard = source.slice(
    source.indexOf("{", entryIndex) + 1,
    tryIndex,
  ).trim();
  const mutationTokens = kind === "ops-panel"
    ? OPS_PANEL_MUTATION_INVOCATIONS
    : DESK_MUTATION_INVOCATIONS;
  const mutationIndexes = mutationTokens.map((token) => ({
    token,
    index: source.indexOf(token, entryIndex),
  }));
  const firstMutationIndex = Math.min(
    ...mutationIndexes.map(({ index }) => index),
  );
  return {
    importIndex,
    destinationIndex,
    entryIndex,
    guardIndex,
    prefixBeforeGuard,
    mutationIndexes,
    firstMutationIndex,
    valid:
      importIndex >= 0 &&
      destinationIndex > importIndex &&
      entryIndex > destinationIndex &&
      guardIndex > entryIndex &&
      prefixBeforeGuard === "" &&
      mutationIndexes.every(({ index }) => index > guardIndex),
  };
}

function movePackGuardAfterFirstMutation(source, kind) {
  const blockPattern =
    /  try \{\n    assertDeliveryWritePermitted\(\{[\s\S]*?\n    process\.exit\(exitCode\);\n  \}\n\n/u;
  const match = source.match(blockPattern);
  assert.ok(match, `${kind} guard block fixture not found`);
  const without = source.replace(blockPattern, "");
  const firstMutation = kind === "ops-panel"
    ? "  ensureDir(OUT_DIR);"
    : "  await removeDir(buildDir);";
  return without.replace(
    firstMutation,
    `${firstMutation}\n${match[0]}`,
  );
}

function structuralIdentityProviderGuardOrdering(source) {
  const importIndex = source.indexOf(
    'import { assertDeliveryWritePermitted } from "../../publish/canonical-write-guard.mjs";',
  );
  const functionIndex = source.indexOf(
    "export async function buildIdentityProviderBundle(outDir) {",
  );
  const destinationIndex = source.indexOf(
    'const outRoot = path.resolve(outDir || extensionBuildDir("dev-controls"));',
    functionIndex,
  );
  const guardIndex = source.indexOf(
    "assertDeliveryWritePermitted({",
    destinationIndex,
  );
  const outFileIndex = source.indexOf(
    "const outFile = path.join(outRoot, IDENTITY_PROVIDER_BUNDLE_RELATIVE_PATH);",
    guardIndex,
  );
  const mutationIndexes = IDENTITY_PROVIDER_MUTATION_INVOCATIONS.map(
    (token) => ({
      token,
      index: source.indexOf(token, functionIndex),
    }),
  );
  return {
    importIndex,
    functionIndex,
    destinationIndex,
    guardIndex,
    outFileIndex,
    mutationIndexes,
    valid:
      importIndex >= 0 &&
      functionIndex > importIndex &&
      destinationIndex > functionIndex &&
      guardIndex > destinationIndex &&
      outFileIndex > guardIndex &&
      mutationIndexes.every(({ index }) => index > guardIndex),
  };
}

function moveIdentityProviderGuardAfterEnsure(source) {
  const guardBlock =
    /  assertDeliveryWritePermitted\(\{\n    destination: outRoot,\n    purpose: "identity-provider-bundle",\n    environment: process\.env,\n  \}\);\n/u;
  const match = source.match(guardBlock);
  assert.ok(match, "identity-provider guard block fixture not found");
  return source.replace(guardBlock, "").replace(
    "  ensureDir(path.dirname(outFile));",
    `  ensureDir(path.dirname(outFile));\n${match[0]}`,
  );
}

function contentIdentity(target) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    return {
      type: "symlink",
      mode: stat.mode,
      target: fs.readlinkSync(target),
    };
  }
  if (stat.isFile()) {
    return {
      type: "file",
      mode: stat.mode,
      size: stat.size,
      sha256: sha256File(target),
    };
  }
  assert.equal(stat.isDirectory(), true);
  return {
    type: "directory",
    mode: stat.mode,
    entries: fs.readdirSync(target)
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((name) => ({
        name,
        value: contentIdentity(path.join(target, name)),
      })),
  };
}

function committedHeadBytes(relative) {
  return execFileSync("git", ["show", `HEAD:${relative}`], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 10_000,
    killSignal: "SIGTERM",
  });
}

function unpatchedCommittedWriterBytes(kind) {
  const relative = kind === "ops-panel"
    ? OPS_PANEL_WRITER_REL
    : DESK_WRITER_REL;
  const source = committedHeadBytes(relative);
  const guardImport =
    'import { assertDeliveryWritePermitted } from "../../../../publish/canonical-write-guard.mjs";\n';
  const guardBlock =
    /  try \{\n    assertDeliveryWritePermitted\(\{[\s\S]*?\n    process\.exit\(exitCode\);\n  \}\n\n/u;
  const hasGuardImport = source.includes(guardImport);
  const hasGuardBlock = guardBlock.test(source);
  assert.equal(
    hasGuardImport,
    hasGuardBlock,
    `${kind} committed HEAD contains a partial guard`,
  );
  if (!hasGuardImport) return source;
  const unpatched = source
    .replace(guardImport, "")
    .replace(guardBlock, "");
  assert.doesNotMatch(unpatched, /assertDeliveryWritePermitted/u);
  return unpatched;
}

function materializeCommittedHeadClone(label) {
  const top = temporaryRoot(`baseline-${label}`);
  const clone = path.join(top, "committed-head");
  const sourceHead = git(ROOT, ["rev-parse", "HEAD"]);
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", ROOT, clone], {
    cwd: top,
    encoding: "utf8",
    timeout: 30_000,
    killSignal: "SIGTERM",
  });
  assert.equal(git(clone, ["rev-parse", "HEAD"]), sourceHead);
  return clone;
}

function prepareDeskFixtureAssets(repository) {
  const icons = path.join(
    repository,
    "assets/surface-chrome-desk-icons",
  );
  fs.mkdirSync(icons, { recursive: true });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  for (const size of [16, 32, 48, 128, 256, 512, 1024]) {
    fs.writeFileSync(path.join(icons, `icon${size}.png`), png);
  }
}

function materializePatchedPackClone(kind, label) {
  const clone = materializeCommittedHeadClone(`patched-${label}`);
  const relative = kind === "ops-panel"
    ? OPS_PANEL_WRITER_REL
    : DESK_WRITER_REL;
  fs.copyFileSync(path.join(ROOT, relative), path.join(clone, relative));
  if (kind === "desk") prepareDeskFixtureAssets(clone);
  return clone;
}

async function proveLocalByteEquivalence(kind) {
  const top = temporaryRoot(`${kind}-equivalence`);
  const output = path.join(top, "output", kind === "ops-panel" ? "ops-panel" : "desk");
  const baseline = materializeCommittedHeadClone(kind);
  const baselineRelative = kind === "ops-panel"
    ? OPS_PANEL_WRITER_REL
    : DESK_WRITER_REL;
  fs.writeFileSync(
    path.join(baseline, baselineRelative),
    unpatchedCommittedWriterBytes(kind),
  );
  if (kind === "desk") prepareDeskFixtureAssets(baseline);
  const baselineWriter = path.join(
    baseline,
    baselineRelative,
  );
  const baselineEnvironment = packWriterEnvironment({
    sourceRoot: baseline,
    outDir: output,
    kind,
  });
  baselineEnvironment.NODE_PATH = path.join(ROOT, "node_modules");
  const baselineResult = await managedChild(process.execPath, [baselineWriter], {
    cwd: baseline,
    env: baselineEnvironment,
    timeoutMs: 30_000,
  });
  assert.equal(baselineResult.code, 0, baselineResult.stderr);
  assert.equal(baselineResult.timedOut, false);
  const before = contentIdentity(output);
  fs.rmSync(output, { recursive: true, force: true });
  const fixture = { top };
  const patchedClone = materializePatchedPackClone(
    kind,
    `${kind}-equivalence`,
  );
  const patchedRelative = kind === "ops-panel"
    ? OPS_PANEL_WRITER_REL
    : DESK_WRITER_REL;
  const patchedResult = await runPackWriter(fixture, kind, {
    sourceRoot: patchedClone,
    outDir: output,
    writer: path.join(patchedClone, patchedRelative),
    overrides: { NODE_PATH: path.join(ROOT, "node_modules") },
  });
  assert.equal(patchedResult.code, 0, patchedResult.stderr);
  assert.equal(patchedResult.timedOut, false);
  const after = contentIdentity(output);
  assert.deepEqual(after, before);
  return { output, before, after, baselineResult, patchedResult };
}

function unpatchedIdentityProviderWriterBytes() {
  const source = committedHeadBytes(IDENTITY_PROVIDER_WRITER_REL);
  const guardImport =
    'import { assertDeliveryWritePermitted } from "../../publish/canonical-write-guard.mjs";\n';
  const guardBlock =
    /  assertDeliveryWritePermitted\(\{\n    destination: outRoot,\n    purpose: "identity-provider-bundle",\n    environment: process\.env,\n  \}\);\n/u;
  const cliGuardBlock =
    /      if \(Number\.isInteger\(error\?\.exitCode\)\) \{[\s\S]*?        return;\n      \}\n(?=      console\.error)/u;
  const hasGuardImport = source.includes(guardImport);
  const hasGuardBlock = guardBlock.test(source);
  const hasCliGuardBlock = cliGuardBlock.test(source);
  assert.equal(
    hasGuardImport,
    hasGuardBlock && hasCliGuardBlock,
    "committed identity-provider writer contains a partial guard",
  );
  if (!hasGuardImport) return source;
  const unpatched = source
    .replace(guardImport, "")
    .replace(guardBlock, "")
    .replace(cliGuardBlock, "");
  assert.doesNotMatch(unpatched, /assertDeliveryWritePermitted/u);
  assert.doesNotMatch(
    unpatched,
    /identity-provider-bundle write guard rejected/u,
  );
  return unpatched;
}

function provisionCloneDependencies(clone) {
  const dependencySource = path.join(ROOT, "node_modules");
  assert.equal(fs.statSync(dependencySource).isDirectory(), true);
  const dependencyTarget = path.join(clone, "node_modules");
  fs.symlinkSync(dependencySource, dependencyTarget, "dir");
  assert.equal(fs.statSync(dependencyTarget).isDirectory(), true);
}

async function proveIdentityProviderLocalByteEquivalence() {
  const top = temporaryRoot("identity-provider-equivalence");
  const output = path.join(top, "output", "dev-controls");
  const baseline = materializeCommittedHeadClone("identity-provider-unpatched");
  const patched = materializeCommittedHeadClone("identity-provider-patched");
  provisionCloneDependencies(baseline);
  provisionCloneDependencies(patched);
  fs.writeFileSync(
    path.join(baseline, IDENTITY_PROVIDER_WRITER_REL),
    unpatchedIdentityProviderWriterBytes(),
  );
  fs.copyFileSync(
    IDENTITY_PROVIDER_WRITER,
    path.join(patched, IDENTITY_PROVIDER_WRITER_REL),
  );
  const fixture = { top };
  const baselineResult = await runIdentityProviderWriter(fixture, {
    writer: path.join(baseline, IDENTITY_PROVIDER_WRITER_REL),
    sourceRoot: baseline,
    outDir: output,
  });
  assert.equal(baselineResult.code, 0, baselineResult.stderr);
  assert.equal(baselineResult.timedOut, false);
  const before = contentIdentity(output);
  fs.rmSync(output, { recursive: true, force: true });
  const patchedResult = await runIdentityProviderWriter(fixture, {
    writer: path.join(patched, IDENTITY_PROVIDER_WRITER_REL),
    sourceRoot: patched,
    outDir: output,
  });
  assert.equal(patchedResult.code, 0, patchedResult.stderr);
  assert.equal(patchedResult.timedOut, false);
  const after = contentIdentity(output);
  assert.deepEqual(after, before);
  assert.equal(patchedResult.stdout, baselineResult.stdout);
  assert.equal(patchedResult.stderr, baselineResult.stderr);
  return {
    output,
    before,
    after,
    baselineResult,
    patchedResult,
  };
}

function releaseValidatorStructuralContract(source, kind) {
  const browserControlAbsent =
    !/\b(?:playwright|puppeteer|osascript|chrome-debug|remote-debugging)\b/iu
      .test(source);
  const common = {
    mkdtemp: source.includes("fs.mkdtempSync("),
    tempOverride: source.includes("H2O_EXT_OUT_DIR"),
    realBuilder: source.includes(
      "tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs",
    ),
    cleanup: source.includes("fs.rmSync(SOURCE_SAFE_TEMP_ROOT"),
    containment: /path\.relative\(\s*SOURCE_SAFE_TEMP_ROOT/u.test(source),
    liveWritesProhibited: source.includes(
      "releaseValidatorLiveWritesProhibited: true",
    ),
    publicationIncomplete: source.includes(
      "publicationValidationComplete: false",
    ),
    browserControlAbsent,
  };
  if (kind === "identity") {
    return {
      ...common,
      distinctOverrides:
        (source.match(/H2O_EXT_OUT_DIR:\s*extBuildRel\(/gu) || []).length === 5,
      validatesBytes: source.includes("requireBuiltFile(") &&
        source.includes("validateSourceSafeExtensionOutputs()"),
      valid:
        Object.values(common).every(Boolean) &&
        (source.match(/H2O_EXT_OUT_DIR:\s*extBuildRel\(/gu) || []).length === 5 &&
        source.includes("requireBuiltFile(") &&
        source.includes("validateSourceSafeExtensionOutputs()"),
    };
  }
  return {
    ...common,
    exactEnvironment: source.includes("replaceEnv: true"),
    validatesBytes: source.includes("sourceSafeValidatedFileCount") &&
      source.includes("'manifest.json'") &&
      source.includes("'provider/identity-provider-supabase.js'"),
    valid:
      Object.values(common).every(Boolean) &&
      source.includes("replaceEnv: true") &&
      source.includes("sourceSafeValidatedFileCount") &&
      source.includes("'manifest.json'") &&
      source.includes("'provider/identity-provider-supabase.js'"),
  };
}

function sourceSafeChildEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("H2O_")) delete environment[name];
  }
  return environment;
}

async function runReleaseValidators() {
  const identityResult = await managedChild(
    process.execPath,
    [IDENTITY_RELEASE_GATE, "--source-safe"],
    {
      cwd: ROOT,
      env: sourceSafeChildEnvironment(),
      timeoutMs: 240_000,
    },
  );
  assert.equal(identityResult.timedOut, false);
  assert.equal(identityResult.code, 0, identityResult.stderr);
  const identityLines = lines(identityResult.stdout);
  const identitySummary = JSON.parse(identityLines.at(-1));

  const f17Result = await managedChild(
    process.execPath,
    [F17_RELEASE_VALIDATOR, "--json", "--source-safe"],
    {
      cwd: ROOT,
      env: sourceSafeChildEnvironment(),
      timeoutMs: 90_000,
    },
  );
  assert.equal(f17Result.timedOut, false);
  assert.equal(f17Result.code, 0, f17Result.stderr);
  const f17Summary = JSON.parse(f17Result.stdout);
  return {
    identityResult,
    identitySummary,
    f17Result,
    f17Summary,
  };
}

function productionGuardImports() {
  const output = run("rg", [
    "-l",
    'canonical-write-guard\\.mjs',
    "tools",
  ]);
  return lines(output)
    .filter((relative) => !relative.startsWith("tools/validation/"))
    .sort();
}

function canonicalPackOutput(fixture, kind) {
  return path.join(
    fixture.repository,
    "apps/extensions/chatgpt/chrome",
    kind === "ops-panel" ? "ops-panel" : "desk",
  );
}

async function runLeanPackWriterScenarios(kind) {
  const label = kind === "ops-panel" ? "Ops Panel" : "Desk";
  const writer = kind === "ops-panel" ? OPS_PANEL_WRITER : DESK_WRITER;
  const purpose = kind === "ops-panel" ? "pack-ops-panel" : "pack-desk";
  const outputName = kind === "ops-panel" ? "ops-panel" : "desk";
  const rejectionSet = kind === "ops-panel"
    ? opsPanelCanonicalRejections
    : deskCanonicalRejections;

  await test(`${label} outside-repository LOCAL output succeeds token-free`, async () => {
    const fixture = createFixture(`${kind}-outside-local`);
    const output = path.join(
      fixture.top,
      "outside-extension-output",
      outputName,
    );
    const executionClone = materializePatchedPackClone(
      kind,
      `${kind}-outside-local`,
    );
    const executionRelative = kind === "ops-panel"
      ? OPS_PANEL_WRITER_REL
      : DESK_WRITER_REL;
    const result = await runPackWriter(fixture, kind, {
      sourceRoot: executionClone,
      outDir: output,
      writer: path.join(executionClone, executionRelative),
      overrides: { NODE_PATH: path.join(ROOT, "node_modules") },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.timedOut, false);
    assert.equal(result.stderr, "");
    assert.equal(fs.existsSync(path.join(output, "manifest.json")), true);
    assertSandboxPath(output);
    const anchor = deriveSharedAnchor({
      cwd: fixture.repository,
      env: {},
      allowOverride: false,
    }).root;
    assert.equal(fs.existsSync(anchor), false);
    const executionAnchor = deriveSharedAnchor({
      cwd: executionClone,
      env: {},
      allowOverride: false,
    }).root;
    assert.equal(fs.existsSync(executionAnchor), false);
    const checked = { fixture, output, result };
    if (kind === "ops-panel") opsPanelLocalOutsideResult = checked;
    else deskLocalOutsideResult = checked;
  });

  await test(`${label} linked foreign-worktree LOCAL output succeeds token-free`, async () => {
    const fixture = createFixture(`${kind}-foreign-local`, {
      linkedWorktree: true,
    });
    const output = path.join(
      fixture.foreignWorktree,
      "apps/extensions/chatgpt/chrome",
      outputName,
    );
    const executionClone = materializePatchedPackClone(
      kind,
      `${kind}-foreign-local`,
    );
    const executionRelative = kind === "ops-panel"
      ? OPS_PANEL_WRITER_REL
      : DESK_WRITER_REL;
    const result = await runPackWriter(fixture, kind, {
      sourceRoot: executionClone,
      outDir: output,
      writer: path.join(executionClone, executionRelative),
      overrides: { NODE_PATH: path.join(ROOT, "node_modules") },
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.timedOut, false);
    assert.equal(result.stderr, "");
    assert.equal(fs.existsSync(path.join(output, "manifest.json")), true);
    assertSandboxPath(output);
    const anchor = deriveSharedAnchor({
      cwd: fixture.repository,
      env: {},
      allowOverride: false,
    }).root;
    assert.equal(fs.existsSync(anchor), false);
    const executionAnchor = deriveSharedAnchor({
      cwd: executionClone,
      env: {},
      allowOverride: false,
    }).root;
    assert.equal(fs.existsSync(executionAnchor), false);
    const checked = { fixture, output, result };
    if (kind === "ops-panel") opsPanelLocalForeignResult = checked;
    else deskLocalForeignResult = checked;
  });

  await test(`${label} patched and unpatched LOCAL outputs are byte-identical`, async () => {
    const equivalence = await proveLocalByteEquivalence(kind);
    assert.deepEqual(equivalence.after, equivalence.before);
    assertSandboxPath(equivalence.output);
  });

  await test(`${label} canonical output without a lease rejects before mutation`, async () => {
    const checked = await rejectedPackCase(kind, "no-lease", {
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
    if (kind === "ops-panel") opsPanelNoLeaseResult = checked;
    else deskNoLeaseResult = checked;
  });

  await test(`${label} wrong ownership token rejects without disclosure`, async () => {
    await rejectedPackCase(kind, "wrong-token", {
      prepare: (fixture) => acquireCanonicalLease(fixture, { purpose }),
      overrides: {
        H2O_CANONICAL_DELIVERY_TOKEN:
          kind === "ops-panel" ? "o".repeat(43) : "d".repeat(43),
      },
      expectedExit: EXIT_CODES.TOKEN_INVALID,
      expectedText: /ownership token is missing or invalid/u,
    });
  });

  await test(`${label} fully valid canonical session still exits 16`, async () => {
    const checked = await rejectedPackCase(kind, "valid-still-disabled", {
      prepare: (fixture) => acquireCanonicalLease(fixture, { purpose }),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_SESSION_ID: prepared.acquisition.lease.sessionId,
        H2O_DELIVERY_APPROVED_HEAD:
          prepared.acquisition.lease.approvedHead,
        H2O_BUILD_TS: prepared.acquisition.lease.buildTs,
      }),
      expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
      expectedCode: "canonical-live-write-disabled-until-stage-e3",
    });
    assert.equal(checked.result.code, 16);
    assert.equal(
      checked.diagnostic.error,
      "canonical-live-write-disabled-until-stage-e3",
    );
    if (kind === "ops-panel") opsPanelValidSessionResult = checked;
    else deskValidSessionResult = checked;
  });

  await test(`${label} unrelated source cwd cannot downgrade canonical output`, async () => {
    await rejectedPackCase(kind, "unrelated-source", {
      prepare: (fixture) => {
        const unrelated = createUnrelatedRepository(
          fixture,
          `${kind}-caller`,
        );
        if (kind === "desk") {
          fs.copyFileSync(
            path.join(ROOT, "config/extension-keys.json"),
            path.join(unrelated, "config/extension-keys.json"),
          );
        }
        return { unrelated };
      },
      sourceRoot: (_fixture, prepared) => prepared.unrelated,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test(`${label} symlink redirection into canonical output rejects`, async () => {
    await rejectedPackCase(kind, "symlink-redirect", {
      prepare: (fixture) => {
        const target = canonicalPackOutput(fixture, kind);
        seedPreservedDestination(target);
        const spelling = path.join(fixture.top, outputName);
        fs.symlinkSync(target, spelling);
        return { spelling, target };
      },
      outDir: (_fixture, prepared) => prepared.spelling,
      snapshotTarget: (_fixture, prepared) => [
        prepared.spelling,
        prepared.target,
      ],
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test(`${label} missing descendant beneath canonical output rejects`, async () => {
    await rejectedPackCase(kind, "missing-descendant", {
      outDir: (fixture) => path.join(
        canonicalPackOutput(fixture, kind),
        "missing",
        outputName,
      ),
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test(`${label} nested repository cannot hide the outer canonical owner`, async () => {
    await rejectedPackCase(kind, "nested-repository", {
      prepare: (fixture) => {
        initializeNestedRepository(
          fixture.canonicalExtensionRoot,
          `E2B ${label} Nested`,
        );
        return {};
      },
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test(`${label} malformed .git boundary fails closed`, async () => {
    await rejectedPackCase(kind, "malformed-boundary", {
      prepare: (fixture) => {
        const boundary = path.join(
          fixture.top,
          `${kind}-malformed-boundary`,
        );
        const output = path.join(
          boundary,
          "apps/extensions/chatgpt/chrome",
          outputName,
        );
        seedPreservedDestination(output);
        fs.writeFileSync(path.join(boundary, ".git"), "not-a-gitdir\n");
        return { output };
      },
      outDir: (_fixture, prepared) => prepared.output,
      snapshotTarget: (_fixture, prepared) => prepared.output,
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedCode: "destination-repository-context-invalid",
    });
  });

  await test(`${label} multiple canonical owners fail closed`, async () => {
    await rejectedPackCase(kind, "multiple-owners", {
      prepare: (fixture) => {
        const owner = canonicalPackOutput(fixture, kind);
        initializeNestedRepository(owner, `E2B ${label} Inner Owner`);
        const output = path.join(
          owner,
          "apps/extensions/chatgpt/chrome",
          outputName,
        );
        seedPreservedDestination(output);
        return { output };
      },
      outDir: (_fixture, prepared) => prepared.output,
      snapshotTarget: (_fixture, prepared) => prepared.output,
      expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
      expectedCode: "canonical-delivery-owner-ambiguity",
    });
  });

  await test(`${label} direct invocation and first-mutation ordering are guarded`, () => {
    const noLease = kind === "ops-panel"
      ? opsPanelNoLeaseResult
      : deskNoLeaseResult;
    assert.ok(noLease);
    assert.deepEqual(noLease.result.argv, [process.execPath, writer]);
    const source = fs.readFileSync(writer, "utf8");
    const ordering = structuralPackGuardOrdering(source, kind);
    assert.equal(ordering.valid, true);
    assert.ok(ordering.firstMutationIndex > ordering.guardIndex);
    assert.match(
      source,
      new RegExp(`purpose: "${purpose}"`, "u"),
    );
    const moved = movePackGuardAfterFirstMutation(source, kind);
    assert.equal(structuralPackGuardOrdering(moved, kind).valid, false);
    const removed = source.replace(
      /  try \{\n    assertDeliveryWritePermitted\(\{[\s\S]*?\n    process\.exit\(exitCode\);\n  \}\n\n/u,
      "",
    );
    assert.equal(structuralPackGuardOrdering(removed, kind).valid, false);
  });

  await test(`${label} canonical failures preserve all eight identity dimensions`, () => {
    assert.equal(rejectionSet.length, 9);
    for (const rejection of rejectionSet) {
      assert.deepEqual(rejection.after, rejection.before, rejection.label);
    }
  });

  await test(`${label} token material and authority envelopes never propagate`, () => {
    const localResults = kind === "ops-panel"
      ? [opsPanelLocalOutsideResult, opsPanelLocalForeignResult]
      : [deskLocalOutsideResult, deskLocalForeignResult];
    for (const checked of localResults) {
      assert.ok(checked);
      assert.equal(
        checked.result.argv.some((value) => value.includes("H2O_")),
        false,
      );
    }
    for (const rejection of rejectionSet) {
      if (!rejection.token) continue;
      const observable = JSON.stringify({
        result: rejection.result,
        diagnostic: rejection.diagnostic,
      });
      assert.equal(observable.includes(rejection.token), false);
      assert.equal(observable.includes(rejection.tokenDigest), false);
      assert.equal(rejection.result.argv.includes(rejection.token), false);
    }
    const source = fs.readFileSync(writer, "utf8");
    assert.doesNotMatch(
      source,
      /canonicalSession|verifiedLease|sessionEnvelope|ownershipCapability/u,
    );
    assert.equal(tokenRedactionProven, true);
  });
}

async function runIdentityProviderWriterScenarios() {
  const purpose = "identity-provider-bundle";

  await test("identity-provider outside-repository LOCAL output succeeds token-free", async () => {
    const fixture = createFixture("identity-provider-outside-local");
    const output = path.join(
      fixture.top,
      "outside-extension-output",
      "dev-controls",
    );
    const result = await runIdentityProviderWriter(fixture, {
      outDir: output,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.timedOut, false);
    assert.equal(result.stderr, "");
    assert.equal(
      fs.existsSync(
        path.join(output, "provider/identity-provider-supabase.js"),
      ),
      true,
    );
    assertSandboxPath(output);
    const anchor = deriveSharedAnchor({
      cwd: fixture.repository,
      env: {},
      allowOverride: false,
    }).root;
    assert.equal(fs.existsSync(anchor), false);
    identityProviderLocalOutsideResult = { fixture, output, result };
  });

  await test("identity-provider linked foreign-worktree LOCAL output succeeds token-free", async () => {
    const fixture = createFixture("identity-provider-foreign-local", {
      linkedWorktree: true,
    });
    const output = path.join(
      fixture.foreignWorktree,
      "apps/extensions/chatgpt/chrome/dev-controls",
    );
    const result = await runIdentityProviderWriter(fixture, {
      sourceRoot: fixture.foreignWorktree,
      outDir: output,
      cwd: fixture.foreignWorktree,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.timedOut, false);
    assert.equal(result.stderr, "");
    assert.equal(
      fs.existsSync(
        path.join(output, "provider/identity-provider-supabase.js"),
      ),
      true,
    );
    assertSandboxPath(output);
    const anchor = deriveSharedAnchor({
      cwd: fixture.repository,
      env: {},
      allowOverride: false,
    }).root;
    assert.equal(fs.existsSync(anchor), false);
    identityProviderLocalForeignResult = { fixture, output, result };
  });

  await test("identity-provider patched and unpatched LOCAL outputs are byte-identical", async () => {
    const equivalence = await proveIdentityProviderLocalByteEquivalence();
    assert.deepEqual(equivalence.after, equivalence.before);
    assertSandboxPath(equivalence.output);
  });

  await test("identity-provider canonical destination without a lease rejects before mutation", async () => {
    identityProviderNoLeaseResult = await rejectedIdentityProviderCase(
      "no-lease",
      {
        expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
        expectedCode: "canonical-delivery-lease-absent",
      },
    );
  });

  await test("identity-provider direct CLI invocation is guarded", () => {
    assert.ok(identityProviderNoLeaseResult);
    assert.deepEqual(identityProviderNoLeaseResult.result.argv, [
      process.execPath,
      IDENTITY_PROVIDER_WRITER,
    ]);
    assert.equal(identityProviderNoLeaseResult.result.stdout, "");
    assert.match(
      identityProviderNoLeaseResult.result.stderr,
      /^\[H2O\] identity-provider-bundle write guard rejected: \{.*\}\n$/u,
    );
  });

  await test("identity-provider direct imported-function invocation is guarded", async () => {
    const checked = await rejectedIdentityProviderCase(
      "imported-no-lease",
      {
        imported: true,
        expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
        expectedCode: "canonical-delivery-lease-absent",
      },
    );
    assert.equal(checked.result.argv.includes("--eval"), true);
    assert.match(
      checked.result.stderr,
      /^\[H2O\] identity-provider-bundle imported guard rejected: \{.*\}\n$/u,
    );
  });

  await test("identity-provider wrong ownership token rejects without leakage", async () => {
    await rejectedIdentityProviderCase("wrong-token", {
      prepare: (fixture) => acquireCanonicalLease(fixture, { purpose }),
      overrides: {
        H2O_CANONICAL_DELIVERY_TOKEN: "i".repeat(43),
      },
      expectedExit: EXIT_CODES.TOKEN_INVALID,
      expectedText: /ownership token is missing or invalid/u,
    });
  });

  await test("identity-provider fully valid session still exits 16", async () => {
    identityProviderValidSessionResult = await rejectedIdentityProviderCase(
      "valid-still-disabled",
      {
        prepare: (fixture) => acquireCanonicalLease(fixture, { purpose }),
        overrides: (_fixture, prepared) => ({
          H2O_CANONICAL_DELIVERY_TOKEN:
            prepared.acquisition.ownershipToken,
          H2O_DELIVERY_SESSION_ID:
            prepared.acquisition.lease.sessionId,
          H2O_DELIVERY_APPROVED_HEAD:
            prepared.acquisition.lease.approvedHead,
          H2O_BUILD_TS: prepared.acquisition.lease.buildTs,
        }),
        expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
        expectedCode: "canonical-live-write-disabled-until-stage-e3",
      },
    );
    assert.equal(identityProviderValidSessionResult.result.code, 16);
    assert.equal(
      identityProviderValidSessionResult.diagnostic.error,
      "canonical-live-write-disabled-until-stage-e3",
    );
  });

  await test("identity-provider unrelated source cwd cannot downgrade canonical output", async () => {
    await rejectedIdentityProviderCase("unrelated-source", {
      prepare: (fixture) => ({
        unrelated: createUnrelatedRepository(
          fixture,
          "identity-provider-caller",
        ),
      }),
      sourceRoot: (_fixture, prepared) => prepared.unrelated,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("identity-provider symlink redirection into canonical output rejects", async () => {
    await rejectedIdentityProviderCase("symlink-redirect", {
      prepare: (fixture) => {
        const target = fixture.canonicalExtensionOutput;
        const spelling = path.join(
          fixture.top,
          "identity-provider-output-link",
        );
        fs.symlinkSync(target, spelling);
        return { spelling, target };
      },
      outDir: (_fixture, prepared) => prepared.spelling,
      snapshotTarget: (_fixture, prepared) => [
        prepared.spelling,
        prepared.target,
      ],
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("identity-provider malformed .git boundary fails closed", async () => {
    await rejectedIdentityProviderCase("malformed-boundary", {
      prepare: (fixture) => {
        const boundary = path.join(
          fixture.top,
          "identity-provider-malformed-boundary",
        );
        const output = path.join(
          boundary,
          "apps/extensions/chatgpt/chrome/dev-controls",
        );
        seedPreservedDestination(output);
        fs.writeFileSync(path.join(boundary, ".git"), "not-a-gitdir\n");
        return { output };
      },
      outDir: (_fixture, prepared) => prepared.output,
      snapshotTarget: (_fixture, prepared) => prepared.output,
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedCode: "destination-repository-context-invalid",
    });
  });

  await test("identity-provider guard structurally precedes every mutation", () => {
    const source = fs.readFileSync(IDENTITY_PROVIDER_WRITER, "utf8");
    const ordering = structuralIdentityProviderGuardOrdering(source);
    assert.equal(ordering.valid, true);
    assert.match(
      source,
      /purpose: "identity-provider-bundle"/u,
    );
    assert.match(
      source,
      /export async function buildIdentityProviderBundle\(outDir\)/u,
    );
    for (const mutation of ordering.mutationIndexes) {
      assert.ok(
        mutation.index > ordering.guardIndex,
        `${mutation.token} precedes identity-provider guard`,
      );
    }
    assert.equal(
      structuralIdentityProviderGuardOrdering(
        moveIdentityProviderGuardAfterEnsure(source),
      ).valid,
      false,
    );
    assert.equal(identityProviderCanonicalRejections.length, 7);
    for (const rejection of identityProviderCanonicalRejections) {
      assert.deepEqual(rejection.after, rejection.before, rejection.label);
      if (!rejection.token) continue;
      const observable = JSON.stringify({
        result: rejection.result,
        diagnostic: rejection.diagnostic,
      });
      assert.equal(observable.includes(rejection.token), false);
      assert.equal(observable.includes(rejection.tokenDigest), false);
    }
    for (const checked of [
      identityProviderLocalOutsideResult,
      identityProviderLocalForeignResult,
    ]) {
      assert.ok(checked);
      assert.equal(
        checked.result.argv.some((value) => value.includes("H2O_")),
        false,
      );
    }
    assert.doesNotMatch(
      source,
      /canonicalSession|verifiedLease|sessionEnvelope|ownershipCapability/u,
    );
    assert.equal(tokenRedactionProven, true);
    assert.equal(CANONICAL_PRESERVATION_CHECKS, 40);
  });
}

async function runRuntimeScenarios() {
  const writerAnchor = deriveSharedAnchor({
    cwd: ROOT,
    env: {},
    allowOverride: false,
  }).root;
  const writerAnchorIdentity = snapshotAnchorIdentity(writerAnchor);

  await test("anchor identity detects lifecycle, bytes, links, markers, and failures", () => {
    const root = temporaryRoot("anchor-identity");
    const anchor = path.join(root, "anchor");
    const firstTarget = path.join(root, "first-target");
    const secondTarget = path.join(root, "second-target");
    try {
      const absent = snapshotAnchorIdentity(anchor);
      assert.equal(absent.exists, false);
      assert.deepEqual(snapshotAnchorIdentity(anchor), absent);

      fs.mkdirSync(anchor);
      const present = snapshotAnchorIdentity(anchor);
      assert.notDeepEqual(present, absent);
      assert.deepEqual(snapshotAnchorIdentity(anchor), present);

      const payload = path.join(anchor, "payload.txt");
      fs.writeFileSync(payload, "alpha");
      const added = snapshotAnchorIdentity(anchor);
      assert.notDeepEqual(added, present);

      fs.writeFileSync(payload, "bravo");
      const changed = snapshotAnchorIdentity(anchor);
      assert.notDeepEqual(changed, added);

      fs.unlinkSync(payload);
      const removed = snapshotAnchorIdentity(anchor);
      assert.notDeepEqual(removed, changed);
      assert.deepEqual(removed, present);

      fs.writeFileSync(firstTarget, "first");
      fs.writeFileSync(secondTarget, "second");
      const link = path.join(anchor, "current");
      fs.symlinkSync(firstTarget, link);
      const firstLink = snapshotAnchorIdentity(anchor);
      fs.unlinkSync(link);
      fs.symlinkSync(secondTarget, link);
      const secondLink = snapshotAnchorIdentity(anchor);
      assert.notDeepEqual(secondLink, firstLink);

      const activeLease = path.join(anchor, "active-lease");
      fs.mkdirSync(activeLease);
      fs.writeFileSync(path.join(activeLease, "lease.json"), "{}\n");
      const markerAdded = snapshotAnchorIdentity(anchor);
      assert.notDeepEqual(markerAdded, secondLink);

      const unreadable = path.join(anchor, "unreadable.txt");
      fs.writeFileSync(unreadable, "opaque");
      const originalReadFileSync = fs.readFileSync;
      fs.readFileSync = function injectedReadFailure(target, ...args) {
        if (path.resolve(String(target)) === path.resolve(unreadable)) {
          const error = new Error("synthetic anchor read failure");
          error.code = "EACCES";
          throw error;
        }
        return originalReadFileSync.call(fs, target, ...args);
      };
      try {
        assert.throws(
          () => snapshotAnchorIdentity(anchor),
          (error) => error?.code === "EACCES",
        );
      } finally {
        fs.readFileSync = originalReadFileSync;
      }

      if (process.platform !== "win32") {
        const unsupported = path.join(anchor, "unsupported-fifo");
        execFileSync("mkfifo", [unsupported], {
          cwd: root,
          encoding: "utf8",
          timeout: 5_000,
          killSignal: "SIGTERM",
        });
        assert.throws(
          () => snapshotAnchorIdentity(anchor),
          /anchor-identity-unsupported-entry-type/u,
        );
      }
    } finally {
      assertSandboxPath(root);
      fs.rmSync(root, { recursive: true, force: true });
      temporaryRoots.delete(root);
    }
  });

  await test("outside-repository LOCAL proxy output succeeds without a token", async () => {
    const fixture = createFixture("outside-local");
    const result = await runProxyWriter(fixture);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.timedOut, false);
    assert.equal(result.stderr, "");
    const output = path.join(
      fixture.localServer,
      "dev_output/proxy/_paste-pack.ext.txt",
    );
    assert.equal(fs.existsSync(output), true);
    assert.match(fs.readFileSync(output, "utf8"), /Sandbox Probe/u);
    localOutsideResult = { fixture, result, output };
  });

  await test("linked foreign-worktree-local proxy output succeeds without a token", async () => {
    const fixture = createFixture("foreign-local", { linkedWorktree: true });
    const result = await runProxyWriter(fixture, {
      sourceRoot: fixture.foreignWorktree,
      serverDir: fixture.foreignServer,
      cwd: fixture.foreignWorktree,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    const output = path.join(
      fixture.foreignServer,
      "dev_output/proxy/_paste-pack.ext.txt",
    );
    assert.equal(fs.existsSync(output), true);
    localForeignResult = { fixture, result, output };
  });

  await test("LOCAL proxy output is created only inside validator sandboxes", () => {
    for (const checked of [localOutsideResult, localForeignResult]) {
      assert.ok(checked);
      assertSandboxPath(checked.output);
      assert.equal(isWithin(ROOT, checked.output), false);
      assert.match(checked.result.stdout, new RegExp(checked.output.replace(
        /[.*+?^${}()|[\]\\]/gu,
        "\\$&",
      ), "u"));
    }
  });

  await test("LOCAL proxy execution creates or requires no canonical anchor", () => {
    for (const checked of [localOutsideResult, localForeignResult]) {
      const fixtureAnchor = deriveSharedAnchor({
        cwd: checked.fixture.repository,
        env: {},
        allowOverride: false,
      }).root;
      assert.equal(fs.existsSync(fixtureAnchor), false);
    }
    assert.deepEqual(
      snapshotAnchorIdentity(writerAnchor),
      writerAnchorIdentity,
      "LOCAL proxy scenarios changed the real canonical delivery anchor",
    );
  });

  await test("canonical proxy destination without a lease rejects before mutation", async () => {
    noLeaseResult = await rejectedProxyCase("no-lease", {
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("wrong canonical ownership token rejects before mutation", async () => {
    await rejectedProxyCase("wrong-token", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: {
        H2O_CANONICAL_DELIVERY_TOKEN: "x".repeat(43),
      },
      expectedExit: EXIT_CODES.TOKEN_INVALID,
      expectedText: /ownership token is missing or invalid/u,
    });
  });

  await test("expired canonical lease rejects before mutation", async () => {
    await rejectedProxyCase("expired", {
      prepare: (fixture) =>
        acquireCanonicalLease(fixture, {
          nowMs: Date.now() - 60_000,
          ttlMs: 1_000,
        }),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.EXPIRED,
      expectedText: /lease is expired/u,
    });
  });

  await test("wrong canonical repository identity rejects before mutation", async () => {
    await rejectedProxyCase("wrong-repository", {
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture);
        mutateLease(prepared, (metadata) => {
          metadata.publisherRepositoryRoot = path.join(
            fixture.top,
            "wrong-repository",
          );
        });
        return prepared;
      },
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /publisherRepositoryRoot/u,
    });
  });

  await test("wrong canonical worktree identity rejects before mutation", async () => {
    await rejectedProxyCase("wrong-worktree", {
      linkedWorktree: true,
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture);
        mutateLease(prepared, (metadata) => {
          metadata.publisherWorktreeRoot = fixture.foreignWorktree;
        });
        return prepared;
      },
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /publisherWorktreeRoot/u,
    });
  });

  await test("wrong canonical branch identity rejects before mutation", async () => {
    await rejectedProxyCase("wrong-branch", {
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture);
        mutateLease(prepared, (metadata) => {
          metadata.branch = "wrong-branch";
        });
        return prepared;
      },
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /branch/u,
    });
  });

  await test("wrong approved HEAD assertion rejects before mutation", async () => {
    await rejectedProxyCase("wrong-approved-head", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_APPROVED_HEAD: "f".repeat(40),
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedCode: "canonical-delivery-approved-head-assertion-mismatch",
    });
  });

  await test("wrong delivery-session assertion rejects before mutation", async () => {
    await rejectedProxyCase("wrong-session", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_SESSION_ID: "00000000-0000-4000-8000-000000000000",
      }),
      expectedExit: EXIT_CODES.VERIFICATION_MISMATCH,
      expectedCode: "canonical-delivery-session-assertion-mismatch",
    });
  });

  await test("wrong generated-build marker assertion rejects before mutation", async () => {
    await rejectedProxyCase("wrong-build-marker", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_BUILD_TS: String(Number(prepared.acquisition.lease.buildTs) + 1),
      }),
      expectedExit: EXIT_CODES.VERIFICATION_MISMATCH,
      expectedCode: "canonical-delivery-build-marker-mismatch",
    });
  });

  await test("wrong canonical writer purpose rejects after lease verification", async () => {
    await rejectedProxyCase("wrong-purpose", {
      prepare: (fixture) =>
        acquireCanonicalLease(fixture, { purpose: "different-writer" }),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedCode: "canonical-delivery-purpose-mismatch",
    });
  });

  await test("fully valid session still exits 16 with the E3 terminal code", async () => {
    validSessionResult = await rejectedProxyCase("valid-still-disabled", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_SESSION_ID: prepared.acquisition.lease.sessionId,
        H2O_DELIVERY_APPROVED_HEAD: prepared.acquisition.lease.approvedHead,
        H2O_BUILD_TS: prepared.acquisition.lease.buildTs,
      }),
      expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
      expectedCode: "canonical-live-write-disabled-until-stage-e3",
    });
    assert.equal(validSessionResult.result.code, 16);
    assert.equal(
      validSessionResult.diagnostic.error,
      "canonical-live-write-disabled-until-stage-e3",
    );
  });

  await test("unrelated H2O_SRC_DIR cannot downgrade canonical H2O_SERVER_DIR", async () => {
    await rejectedProxyCase("unrelated-source", {
      prepare: (fixture) => ({
        unrelated: createUnrelatedRepository(fixture, "caller"),
      }),
      sourceRoot: (_fixture, prepared) => prepared.unrelated,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("custom H2O_DEV_DIR_NAME cannot bypass canonical classification", async () => {
    await rejectedProxyCase("custom-dev-name", {
      prepare: (fixture) => {
        const destination = path.join(
          fixture.canonicalDevOutput,
          "custom-e2b/proxy",
        );
        seedPreservedDestination(destination);
        return { destination };
      },
      overrides: {
        H2O_DEV_DIR_NAME: "dev_output/custom-e2b",
      },
      snapshotTarget: (_fixture, prepared) => prepared.destination,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("symlink redirection into canonical dev_output rejects", async () => {
    await rejectedProxyCase("symlink-redirect", {
      prepare: (fixture) => {
        const spelling = path.join(fixture.top, "canonical-server-link");
        fs.symlinkSync(fixture.canonicalServer, spelling);
        return { spelling };
      },
      serverDir: (_fixture, prepared) => prepared.spelling,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("missing canonical dev_output descendant rejects", async () => {
    await rejectedProxyCase("missing-descendant", {
      overrides: {
        H2O_DEV_DIR_NAME: "dev_output/missing/descendant",
      },
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("nested repository cannot hide the outer canonical owner", async () => {
    await rejectedProxyCase("nested-repository", {
      prepare: (fixture) => {
        initializeNestedRepository(fixture.canonicalServer, "E2B Nested");
        return {};
      },
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("malformed .git boundary fails closed", async () => {
    await rejectedProxyCase("malformed-boundary", {
      prepare: (fixture) => {
        const boundary = path.join(fixture.top, "malformed-boundary");
        const server = path.join(boundary, "server");
        fs.mkdirSync(server, { recursive: true });
        fs.writeFileSync(path.join(boundary, ".git"), "not-a-gitdir\n");
        return { boundary, server };
      },
      serverDir: (_fixture, prepared) => prepared.server,
      snapshotTarget: (_fixture, prepared) => prepared.server,
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedCode: "destination-repository-context-invalid",
    });
  });

  await test("multiple canonical owners fail closed as ambiguous", async () => {
    await rejectedProxyCase("multiple-owners", {
      prepare: (fixture) => {
        initializeNestedRepository(fixture.canonicalProxy, "E2B Inner Owner");
        const server = path.join(
          fixture.canonicalProxy,
          "apps/dev-server",
        );
        return { server };
      },
      serverDir: (_fixture, prepared) => prepared.server,
      expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
      expectedCode: "canonical-delivery-owner-ambiguity",
    });
  });

  await test("direct writer invocation is guarded without dev-rebuild", () => {
    assert.ok(noLeaseResult);
    assert.equal(noLeaseResult.result.argv.length, 2);
    assert.equal(noLeaseResult.result.argv[1], PROXY_WRITER);
    assert.equal(noLeaseResult.result.stdout, "");
    assert.match(
      noLeaseResult.result.stderr,
      /^\[H2O\] proxy-pack write guard rejected: \{.*\}\n$/u,
    );
  });

  let writerSource;
  let ordering;
  await test("guard structurally precedes cleanProxyDirKeepPack invocation", () => {
    writerSource = fs.readFileSync(PROXY_WRITER, "utf8");
    ordering = structuralGuardOrdering(writerSource);
    assert.equal(ordering.valid, true);
    assert.ok(ordering.cleanupIndex > ordering.guardIndex);
  });

  await test("guard structurally precedes every mutation API", () => {
    assert.ok(ordering);
    assert.ok(ordering.mutationIndexes.length >= 5);
    for (const mutation of ordering.mutationIndexes) {
      assert.ok(
        mutation.index > ordering.guardIndex,
        `${mutation.token} precedes guard`,
      );
    }
  });

  await test("moving the guard after cleanup fails the structural contract", () => {
    const moved = moveGuardAfterCleanup(writerSource);
    assert.equal(structuralGuardOrdering(moved).valid, false);
  });

  await test("every canonical rejection preserves the complete destination identity", () => {
    assert.equal(canonicalRejections.length, 18);
    for (const rejection of canonicalRejections) {
      assert.deepEqual(rejection.after, rejection.before, rejection.label);
    }
  });

  await test("plaintext token material is redacted from all observable child data", () => {
    assert.equal(tokenRedactionProven, true);
    for (const rejection of canonicalRejections) {
      if (!rejection.token) continue;
      const observable = JSON.stringify({
        result: rejection.result,
        diagnostic: rejection.diagnostic,
      });
      assert.equal(observable.includes(rejection.token), false);
      assert.equal(observable.includes(rejection.tokenDigest), false);
      assert.equal(rejection.result.argv.includes(rejection.token), false);
    }
  });

  await test("coverage scaffold recognizes exactly the six guarded writers", () => {
    assert.deepEqual([...GUARDED_WRITER_SET], [
      ALIAS_WRITER_REL,
      PROXY_WRITER_REL,
      EXTENSION_WRITER_REL,
      OPS_PANEL_WRITER_REL,
      DESK_WRITER_REL,
      IDENTITY_PROVIDER_WRITER_REL,
    ]);
    assert.deepEqual(
      productionGuardImports(),
      sorted([...GUARDED_WRITER_SET]),
    );
    for (const unprotected of [
      "write-extension-icons.mjs",
      "pack-identity.mjs",
      "pack-studio.mjs",
      "build-extension-stub.mjs",
    ]) {
      assert.equal(
        GUARDED_WRITER_SET.some((relative) => relative.includes(unprotected)),
        false,
      );
    }
  });

  await test("H2O_BUILD_TS remains the ordinary generated-build timestamp", () => {
    const source = fs.readFileSync(PROXY_WRITER, "utf8");
    assert.match(
      source,
      /const BUILD_TS = String\(process\.env\.H2O_BUILD_TS \|\| Date\.now\(\)\);/u,
    );
    assert.match(source, /`\/\/ buildTs=\$\{BUILD_TS\}`/u);
    assert.match(source, /line\("version", BUILD_TS\)/u);
  });

  await test("writer propagates no explicit E2 session capability", () => {
    for (const writer of [
      PROXY_WRITER,
      EXTENSION_WRITER,
      OPS_PANEL_WRITER,
      DESK_WRITER,
      IDENTITY_PROVIDER_WRITER,
    ]) {
      const source = fs.readFileSync(writer, "utf8");
      assert.doesNotMatch(source, /H2O_CANONICAL_DELIVERY_TOKEN/u);
      assert.doesNotMatch(source, /H2O_DELIVERY_SESSION_ID/u);
      assert.doesNotMatch(source, /canonicalSession|verifiedLease/u);
      assert.match(source, /environment:\s*process\.env/u);
    }
  });

  await test("outside-repository LOCAL extension output succeeds without a token", async () => {
    const fixture = createFixture("extension-outside-local");
    const output = path.join(fixture.top, "outside-extension", "dev-controls");
    const result = await runExtensionWriter(fixture, {
      outDir: output,
      overrides: { H2O_EXT_DEV_VARIANT: "production" },
    });
    assert.equal(result.timedOut, false);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    extensionLocalOutsideResult = { fixture, output, result };
  });

  await test("linked foreign-worktree-local extension output succeeds without a token", async () => {
    const fixture = createFixture("extension-foreign-local", {
      linkedWorktree: true,
    });
    const output = path.join(
      fixture.foreignWorktree,
      "apps/extensions/chatgpt/chrome/dev-controls",
    );
    const result = await runExtensionWriter(fixture, {
      outDir: output,
      cwd: ROOT,
      overrides: { H2O_EXT_DEV_VARIANT: "production" },
    });
    assert.equal(result.timedOut, false);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    extensionLocalForeignResult = { fixture, output, result };
  });

  await test("LOCAL extension output path set and key files exist only in sandboxes", () => {
    for (const checked of [
      extensionLocalOutsideResult,
      extensionLocalForeignResult,
    ]) {
      assert.ok(checked);
      assertSandboxPath(checked.output);
      assert.equal(isWithin(ROOT, checked.output), false);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(checked.output, "manifest.json"), "utf8"),
      );
      assert.equal(manifest.manifest_version, 3);
      for (const relative of [
        "manifest.json",
        "bg.js",
        "loader.js",
        "README.txt",
        "provider/identity-provider-supabase.js",
      ]) {
        const filename = path.join(checked.output, relative);
        assert.equal(fs.statSync(filename).isFile(), true, filename);
        assert.ok(fs.statSync(filename).size > 0, filename);
      }
    }
  });

  await test("LOCAL extension invocation creates no canonical anchor", () => {
    for (const checked of [
      extensionLocalOutsideResult,
      extensionLocalForeignResult,
    ]) {
      const fixtureAnchor = deriveSharedAnchor({
        cwd: checked.fixture.repository,
        env: {},
        allowOverride: false,
      }).root;
      assert.equal(fs.existsSync(fixtureAnchor), false);
    }
    assert.deepEqual(
      snapshotAnchorIdentity(writerAnchor),
      writerAnchorIdentity,
      "LOCAL extension scenarios changed the real canonical delivery anchor",
    );
  });

  await test("canonical extension destination without a lease rejects before mutation", async () => {
    extensionNoLeaseResult = await rejectedExtensionCase("no-lease", {
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("wrong extension ownership token rejects before mutation", async () => {
    await rejectedExtensionCase("wrong-token", {
      prepare: (fixture) => acquireCanonicalLease(fixture, {
        purpose: "build-chrome-live-extension",
      }),
      overrides: {
        H2O_CANONICAL_DELIVERY_TOKEN: "y".repeat(43),
      },
      expectedExit: EXIT_CODES.TOKEN_INVALID,
      expectedText: /ownership token is missing or invalid/u,
    });
  });

  await test("expired extension lease rejects before mutation", async () => {
    await rejectedExtensionCase("expired", {
      prepare: (fixture) => acquireCanonicalLease(fixture, {
        nowMs: Date.now() - 60_000,
        ttlMs: 1_000,
        purpose: "build-chrome-live-extension",
      }),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.EXPIRED,
      expectedText: /lease is expired/u,
    });
  });

  await test("wrong extension repository identity rejects before mutation", async () => {
    await rejectedExtensionCase("wrong-repository", {
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture, {
          purpose: "build-chrome-live-extension",
        });
        mutateLease(prepared, (metadata) => {
          metadata.publisherRepositoryRoot = path.join(
            fixture.top,
            "wrong-repository",
          );
        });
        return prepared;
      },
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /publisherRepositoryRoot/u,
    });
  });

  await test("wrong extension worktree identity rejects before mutation", async () => {
    await rejectedExtensionCase("wrong-worktree", {
      linkedWorktree: true,
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture, {
          purpose: "build-chrome-live-extension",
        });
        mutateLease(prepared, (metadata) => {
          metadata.publisherWorktreeRoot = fixture.foreignWorktree;
        });
        return prepared;
      },
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /publisherWorktreeRoot/u,
    });
  });

  await test("wrong extension branch identity rejects before mutation", async () => {
    await rejectedExtensionCase("wrong-branch", {
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture, {
          purpose: "build-chrome-live-extension",
        });
        mutateLease(prepared, (metadata) => {
          metadata.branch = "wrong-branch";
        });
        return prepared;
      },
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /branch/u,
    });
  });

  await test("wrong extension approved HEAD rejects before mutation", async () => {
    await rejectedExtensionCase("wrong-approved-head", {
      prepare: (fixture) => acquireCanonicalLease(fixture, {
        purpose: "build-chrome-live-extension",
      }),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_APPROVED_HEAD: "e".repeat(40),
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedCode: "canonical-delivery-approved-head-assertion-mismatch",
    });
  });

  await test("wrong extension session assertion rejects before mutation", async () => {
    await rejectedExtensionCase("wrong-session", {
      prepare: (fixture) => acquireCanonicalLease(fixture, {
        purpose: "build-chrome-live-extension",
      }),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_SESSION_ID: "00000000-0000-4000-8000-000000000000",
      }),
      expectedExit: EXIT_CODES.VERIFICATION_MISMATCH,
      expectedCode: "canonical-delivery-session-assertion-mismatch",
    });
  });

  await test("wrong extension build marker rejects before mutation", async () => {
    await rejectedExtensionCase("wrong-build-marker", {
      prepare: (fixture) => acquireCanonicalLease(fixture, {
        purpose: "build-chrome-live-extension",
      }),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_BUILD_TS: String(Number(prepared.acquisition.lease.buildTs) + 1),
      }),
      expectedExit: EXIT_CODES.VERIFICATION_MISMATCH,
      expectedCode: "canonical-delivery-build-marker-mismatch",
    });
  });

  await test("wrong extension writer purpose rejects after lease verification", async () => {
    await rejectedExtensionCase("wrong-purpose", {
      prepare: (fixture) => acquireCanonicalLease(fixture, {
        purpose: "different-extension-writer",
      }),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedCode: "canonical-delivery-purpose-mismatch",
    });
  });

  await test("fully valid extension session still exits 16 with the E3 terminal code", async () => {
    extensionValidSessionResult = await rejectedExtensionCase(
      "valid-still-disabled",
      {
        prepare: (fixture) => acquireCanonicalLease(fixture, {
          purpose: "build-chrome-live-extension",
        }),
        overrides: (_fixture, prepared) => ({
          H2O_CANONICAL_DELIVERY_TOKEN:
            prepared.acquisition.ownershipToken,
          H2O_DELIVERY_SESSION_ID: prepared.acquisition.lease.sessionId,
          H2O_DELIVERY_APPROVED_HEAD:
            prepared.acquisition.lease.approvedHead,
          H2O_BUILD_TS: prepared.acquisition.lease.buildTs,
        }),
        expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
        expectedCode: "canonical-live-write-disabled-until-stage-e3",
      },
    );
    assert.equal(extensionValidSessionResult.result.code, 16);
    assert.equal(
      extensionValidSessionResult.diagnostic.error,
      "canonical-live-write-disabled-until-stage-e3",
    );
  });

  await test("unrelated H2O_SRC_DIR cannot downgrade canonical extension output", async () => {
    await rejectedExtensionCase("unrelated-source", {
      prepare: (fixture) => ({
        unrelated: createUnrelatedRepository(fixture, "extension-caller"),
      }),
      sourceRoot: (_fixture, prepared) => prepared.unrelated,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("H2O_EXT_BUILD_ROOT redirection cannot bypass canonical classification", async () => {
    await rejectedExtensionCase("custom-build-root", {
      outDir: null,
      buildRoot: (fixture) => fixture.canonicalExtensionRoot,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("symlink redirection into canonical extension output rejects", async () => {
    await rejectedExtensionCase("symlink-redirect", {
      prepare: (fixture) => {
        const spelling = path.join(fixture.top, "canonical-extension-link");
        fs.symlinkSync(fixture.canonicalExtensionOutput, spelling);
        return { spelling };
      },
      outDir: (_fixture, prepared) => prepared.spelling,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("missing canonical extension descendant rejects", async () => {
    await rejectedExtensionCase("missing-descendant", {
      outDir: (fixture) => path.join(
        fixture.canonicalExtensionOutput,
        "missing/descendant",
      ),
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("nested repository cannot hide the outer extension owner", async () => {
    await rejectedExtensionCase("nested-repository", {
      prepare: (fixture) => {
        initializeNestedRepository(
          fixture.canonicalExtensionRoot,
          "E2B Extension Nested",
        );
        return {};
      },
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedCode: "canonical-delivery-lease-absent",
    });
  });

  await test("malformed extension .git boundary fails closed", async () => {
    await rejectedExtensionCase("malformed-boundary", {
      prepare: (fixture) => {
        const boundary = path.join(fixture.top, "malformed-extension-boundary");
        const output = path.join(
          boundary,
          "apps/extensions/chatgpt/chrome/dev-controls",
        );
        seedPreservedDestination(output);
        fs.writeFileSync(path.join(boundary, ".git"), "not-a-gitdir\n");
        return { boundary, output };
      },
      outDir: (_fixture, prepared) => prepared.output,
      snapshotTarget: (_fixture, prepared) => prepared.output,
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedCode: "destination-repository-context-invalid",
    });
  });

  await test("multiple extension canonical owners fail closed as ambiguous", async () => {
    await rejectedExtensionCase("multiple-owners", {
      prepare: (fixture) => {
        initializeNestedRepository(
          fixture.canonicalExtensionOutput,
          "E2B Extension Inner Owner",
        );
        const output = path.join(
          fixture.canonicalExtensionOutput,
          "apps/extensions/chatgpt/chrome/dev-controls",
        );
        seedPreservedDestination(output);
        return { output };
      },
      outDir: (_fixture, prepared) => prepared.output,
      snapshotTarget: (_fixture, prepared) => prepared.output,
      expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
      expectedCode: "canonical-delivery-owner-ambiguity",
    });
  });

  await test("direct extension writer invocation is independently guarded", () => {
    assert.ok(extensionNoLeaseResult);
    assert.equal(extensionNoLeaseResult.result.argv.length, 2);
    assert.equal(extensionNoLeaseResult.result.argv[1], EXTENSION_WRITER);
    assert.equal(extensionNoLeaseResult.result.stdout, "");
    assert.match(
      extensionNoLeaseResult.result.stderr,
      /^\[H2O\] extension write guard rejected: \{.*\}\n$/u,
    );
  });

  let extensionSource;
  let extensionOrdering;
  await test("extension guard structurally precedes ensureDir(OUT_DIR)", () => {
    extensionSource = fs.readFileSync(EXTENSION_WRITER, "utf8");
    extensionOrdering = structuralExtensionGuardOrdering(extensionSource);
    assert.equal(extensionOrdering.valid, true);
    assert.ok(extensionOrdering.ensureIndex > extensionOrdering.guardIndex);
  });

  await test("extension guard precedes every reachable mutation and sub-writer call", () => {
    assert.ok(extensionOrdering);
    for (const mutation of extensionOrdering.mutationIndexes) {
      assert.ok(mutation.index > extensionOrdering.guardIndex, mutation.token);
    }
  });

  await test("moving or deleting the extension guard fails structural validation", () => {
    assert.equal(
      structuralExtensionGuardOrdering(
        moveExtensionGuardAfterEnsure(extensionSource),
      ).valid,
      false,
    );
    assert.equal(
      structuralExtensionGuardOrdering(
        removeExtensionGuard(extensionSource),
      ).valid,
      false,
    );
  });

  await test("every extension canonical rejection preserves all eight identity dimensions", () => {
    assert.equal(extensionCanonicalRejections.length, 18);
    for (const rejection of extensionCanonicalRejections) {
      assert.deepEqual(rejection.after, rejection.before, rejection.label);
    }
    assert.equal(CANONICAL_PRESERVATION_CHECKS, 40);
  });

  await test("extension token and digest are absent from every observable value", () => {
    assert.equal(tokenRedactionProven, true);
    for (const rejection of extensionCanonicalRejections) {
      if (!rejection.token) continue;
      const observable = JSON.stringify({
        result: rejection.result,
        diagnostic: rejection.diagnostic,
      });
      assert.equal(observable.includes(rejection.token), false);
      assert.equal(observable.includes(rejection.tokenDigest), false);
      assert.equal(rejection.result.argv.includes(rejection.token), false);
    }
  });

  await test("both release validators execute real source-safe extension builds", async () => {
    releaseValidatorResults = await runReleaseValidators();
    assert.equal(releaseValidatorResults.identitySummary.ok, true);
    assert.equal(releaseValidatorResults.f17Summary.ok, true);
  });

  await test("every release extension destination is beneath its recorded mkdtemp root", () => {
    const { identitySummary, f17Summary } = releaseValidatorResults;
    for (const destination of identitySummary.extensionBuildDestinations) {
      assert.equal(isWithin(identitySummary.temporaryRoot, destination), true);
    }
    assert.equal(
      isWithin(
        f17Summary.sourceSafeValidation.temporaryRoot,
        f17Summary.sourceSafeValidation.extensionBuildDestination,
      ),
      true,
    );
  });

  await test("release validators prohibit writes to real canonical variants", () => {
    const identityContract = releaseValidatorStructuralContract(
      fs.readFileSync(IDENTITY_RELEASE_GATE, "utf8"),
      "identity",
    );
    const f17Contract = releaseValidatorStructuralContract(
      fs.readFileSync(F17_RELEASE_VALIDATOR, "utf8"),
      "f17",
    );
    assert.equal(identityContract.valid, true);
    assert.equal(f17Contract.valid, true);
    assert.equal(
      releaseValidatorResults.identitySummary.releaseValidatorLiveWritesProhibited,
      true,
    );
    assert.equal(
      releaseValidatorResults.f17Summary.sourceSafeValidation
        .releaseValidatorLiveWritesProhibited,
      true,
    );
  });

  await test("release validator extension variants use distinct temporary destinations", () => {
    const summary = releaseValidatorResults.identitySummary;
    assert.equal(summary.extensionBuildDestinationCount, 5);
    assert.equal(summary.distinctVariantDestinations, true);
    assert.equal(new Set(summary.extensionBuildDestinations).size, 5);
  });

  await test("release validators report real primary builder execution", () => {
    assert.equal(
      releaseValidatorResults.identitySummary.realBuilderExecutions,
      5,
    );
    assert.equal(
      releaseValidatorResults.f17Summary.sourceSafeValidation
        .realBuilderExecutions,
      1,
    );
  });

  await test("release validators validate produced bytes and required structure", () => {
    assert.ok(
      releaseValidatorResults.identitySummary.validatedFileCount >= 26,
    );
    const sourceSafe =
      releaseValidatorResults.f17Summary.sourceSafeValidation;
    assert.equal(sourceSafe.validatedFileCount, 5);
    const buildCheck = releaseValidatorResults.f17Summary.checks.find(
      (entry) => entry.name === "source-safe-chrome-extension-build",
    );
    assert.equal(buildCheck.ok, true);
    assert.equal(buildCheck.detail.requiredFiles.length, 5);
  });

  await test("release cleanup is confined to and removes each temporary root", () => {
    const { identitySummary, f17Summary } = releaseValidatorResults;
    assert.equal(identitySummary.cleanupCompleted, true);
    assert.equal(
      f17Summary.sourceSafeValidation.cleanupCompleted,
      true,
    );
    assert.equal(fs.existsSync(identitySummary.temporaryRoot), false);
    assert.equal(
      fs.existsSync(f17Summary.sourceSafeValidation.temporaryRoot),
      false,
    );
  });

  await test("release validation creates no anchor and contains no browser control", () => {
    const { identitySummary, f17Summary } = releaseValidatorResults;
    assert.equal(identitySummary.canonicalAnchorCreated, false);
    assert.equal(
      f17Summary.sourceSafeValidation.canonicalAnchorCreated,
      false,
    );
    assert.deepEqual(
      snapshotAnchorIdentity(writerAnchor),
      writerAnchorIdentity,
      "release validation changed the real canonical delivery anchor",
    );
    for (const [filename, kind] of [
      [IDENTITY_RELEASE_GATE, "identity"],
      [F17_RELEASE_VALIDATOR, "f17"],
    ]) {
      assert.equal(
        releaseValidatorStructuralContract(
          fs.readFileSync(filename, "utf8"),
          kind,
        ).browserControlAbsent,
        true,
      );
    }
  });

  await test("removing temporary destination overrides fails release structural validation", () => {
    const identitySource = fs.readFileSync(IDENTITY_RELEASE_GATE, "utf8");
    const f17Source = fs.readFileSync(F17_RELEASE_VALIDATOR, "utf8");
    const brokenIdentity = identitySource.replace(
      /H2O_EXT_OUT_DIR:\s*extBuildRel\([^)]+\),?/gu,
      "",
    );
    const brokenF17 = f17Source.replace(
      "H2O_EXT_OUT_DIR: SOURCE_SAFE_EXTENSION_OUT,",
      "",
    );
    assert.equal(
      releaseValidatorStructuralContract(brokenIdentity, "identity").valid,
      false,
    );
    assert.equal(
      releaseValidatorStructuralContract(brokenF17, "f17").valid,
      false,
    );
  });

  await runLeanPackWriterScenarios("ops-panel");
  await runLeanPackWriterScenarios("desk");
  await runIdentityProviderWriterScenarios();

  await test("runtime scenario count is exact", () => {
    assert.equal(runtimeResults.length + 1, EXPECTED_RUNTIME_SCENARIOS);
  });

  assert.equal(runtimeResults.length, EXPECTED_RUNTIME_SCENARIOS);
  assert.deepEqual(
    snapshotAnchorIdentity(writerAnchor),
    writerAnchorIdentity,
    "E2B runtime scenarios changed the real canonical delivery anchor",
  );
}

function printScope() {
  process.stdout.write(
    `${JSON.stringify({
      validator: VALIDATOR_REL,
      implementation: [
        PROXY_WRITER_REL,
        EXTENSION_WRITER_REL,
        OPS_PANEL_WRITER_REL,
        DESK_WRITER_REL,
        IDENTITY_PROVIDER_WRITER_REL,
        IDENTITY_RELEASE_GATE_REL,
        F17_RELEASE_VALIDATOR_REL,
      ],
      finalPaths: FINAL_PATHS,
      uncommittedModified: UNCOMMITTED_MODIFIED,
      uncommittedUntracked: UNCOMMITTED_UNTRACKED,
      guardedWriterSet: GUARDED_WRITER_SET,
      runtimeScenarios: EXPECTED_RUNTIME_SCENARIOS,
      scopeScenarios: EXPECTED_SCOPE_SCENARIOS,
      canonicalPreservationChecks: CANONICAL_PRESERVATION_CHECKS,
    })}\n`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set([
    "--scope-check",
    "--print-scope",
    "--self-test-scope",
  ]);
  if (args.length > 1 || args.some((arg) => !allowed.has(arg))) {
    throw new Error(`unknown or duplicate arguments: ${args.join(" ")}`);
  }
  if (args[0] === "--print-scope") {
    printScope();
    return;
  }
  if (args[0] === "--self-test-scope") {
    runScopeSelfTests();
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        scopeScenarios: scopeResults.length,
      })}\n`,
    );
    return;
  }
  const scopeMode = classifyStage1DE2BBatch1Scope(currentScopeState());
  if (args[0] === "--scope-check") {
    process.stdout.write(`${JSON.stringify({ ok: true, scopeMode })}\n`);
    return;
  }
  runScopeSelfTests();
  await runRuntimeScenarios();
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      validator: VALIDATOR_REL,
      scopeMode,
      runtimeScenarios: runtimeResults.length,
      scopeScenarios: scopeResults.length,
      canonicalRejectionCases:
        canonicalRejections.length +
        extensionCanonicalRejections.length +
        opsPanelCanonicalRejections.length +
        deskCanonicalRejections.length +
        identityProviderCanonicalRejections.length,
      canonicalPreservationChecks: CANONICAL_PRESERVATION_CHECKS,
      tokenRedactionProven,
      guardedWriterSet: GUARDED_WRITER_SET,
      liveEnforcementComplete: false,
      canonicalLiveWritesPermitted: false,
      stageE3Required: true,
      exportedHelperEnforcementComplete: false,
      releaseValidatorLiveWritesProhibited: true,
      publicationValidationComplete: false,
    })}\n`,
  );
}

try {
  await main();
} finally {
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
