#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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
const VALIDATOR_REL =
  "tools/validation/publish/validate-e2b-writer-enforcement-v1.mjs";
const PROXY_WRITER = path.join(ROOT, PROXY_WRITER_REL);
const FINAL_PATHS = Object.freeze([PROXY_WRITER_REL, VALIDATOR_REL]);
const UNCOMMITTED_MODIFIED = Object.freeze([PROXY_WRITER_REL]);
const UNCOMMITTED_UNTRACKED = Object.freeze([VALIDATOR_REL]);
const GUARDED_WRITER_SET = Object.freeze([
  ALIAS_WRITER_REL,
  PROXY_WRITER_REL,
]);
const EXPECTED_RUNTIME_SCENARIOS = 32;
const EXPECTED_SCOPE_SCENARIOS = 11;
const CANONICAL_PRESERVATION_CHECKS = 8;
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

const runtimeResults = [];
const scopeResults = [];
const temporaryRoots = new Set();
const canonicalRejections = [];
let localOutsideResult = null;
let localForeignResult = null;
let noLeaseResult = null;
let validSessionResult = null;
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
    path.join(os.tmpdir(), `h2o-stage1de2b-b1-${label}-`),
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
    modifiedTracked: sorted(state.modifiedTracked ?? []),
    staged: sorted(state.staged ?? []),
    untracked: sorted(state.untracked ?? []),
    trackedFinal: sorted(state.trackedFinal ?? []),
    missingFinal: sorted(state.missingFinal ?? []),
  };
  if (normalized.staged.length) {
    scopeFailure("Stage 1D-E2B Batch 1 forbids staged paths", normalized);
  }
  const uncommitted =
    sameSet(normalized.modifiedTracked, UNCOMMITTED_MODIFIED) &&
    sameSet(normalized.untracked, UNCOMMITTED_UNTRACKED) &&
    sameSet(normalized.trackedFinal, [PROXY_WRITER_REL]) &&
    normalized.missingFinal.length === 0;
  if (uncommitted) return "uncommitted";
  const committed =
    normalized.modifiedTracked.length === 0 &&
    normalized.untracked.length === 0 &&
    sameSet(normalized.trackedFinal, FINAL_PATHS) &&
    normalized.missingFinal.length === 0;
  if (committed) return "committed-clean";
  scopeFailure("Stage 1D-E2B Batch 1 scope mismatch", normalized);
}

function currentScopeState() {
  return {
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
    modifiedTracked: [...UNCOMMITTED_MODIFIED],
    staged: [],
    untracked: [...UNCOMMITTED_UNTRACKED],
    trackedFinal: [PROXY_WRITER_REL],
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
  scopeTest("exact E2B Batch 1 uncommitted scope is accepted", () => {
    assert.equal(classifyStage1DE2BBatch1Scope(baseScope()), "uncommitted");
  });
  scopeTest("exact E2B Batch 1 committed-clean scope is accepted", () => {
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
  scopeTest("missing writer modification is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(baseScope({ modifiedTracked: [] })),
      /scope mismatch/u,
    );
  });
  scopeTest("missing validator creation is rejected", () => {
    assert.throws(
      () => classifyStage1DE2BBatch1Scope(baseScope({ untracked: [] })),
      /scope mismatch/u,
    );
  });
  scopeTest("a third tracked source path is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({
            modifiedTracked: [PROXY_WRITER_REL, "tools/dev/dev-all.mjs"],
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
            untracked: [VALIDATOR_REL, "tools/validation/publish/extra.mjs"],
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
  scopeTest("swapped tracked and untracked roles are rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2BBatch1Scope(
          baseScope({
            modifiedTracked: [VALIDATOR_REL],
            untracked: [PROXY_WRITER_REL],
          }),
        ),
      /scope mismatch/u,
    );
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

async function runRuntimeScenarios() {
  const writerAnchor = deriveSharedAnchor({
    cwd: ROOT,
    env: {},
    allowOverride: false,
  }).root;
  const writerAnchorAbsent = !fs.existsSync(writerAnchor);

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
    assert.equal(writerAnchorAbsent, true);
    assert.equal(fs.existsSync(writerAnchor), false);
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
    assert.ok(canonicalRejections.length >= 18);
    for (const rejection of canonicalRejections) {
      assert.deepEqual(rejection.after, rejection.before, rejection.label);
    }
    assert.equal(CANONICAL_PRESERVATION_CHECKS, 8);
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

  await test("coverage scaffold recognizes exactly the two guarded writers", () => {
    assert.deepEqual([...GUARDED_WRITER_SET], [
      ALIAS_WRITER_REL,
      PROXY_WRITER_REL,
    ]);
    assert.deepEqual(productionGuardImports(), [...GUARDED_WRITER_SET]);
    assert.equal(
      GUARDED_WRITER_SET.some((relative) =>
        relative.includes("build-chrome-live-extension")),
      false,
    );
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
    const source = fs.readFileSync(PROXY_WRITER, "utf8");
    assert.doesNotMatch(source, /H2O_CANONICAL_DELIVERY_TOKEN/u);
    assert.doesNotMatch(source, /H2O_DELIVERY_SESSION_ID/u);
    assert.doesNotMatch(source, /canonicalSession|verifiedLease/u);
    assert.match(source, /environment:\s*process\.env/u);
  });

  await test("runtime scenario count is exact", () => {
    assert.equal(runtimeResults.length + 1, EXPECTED_RUNTIME_SCENARIOS);
  });

  assert.equal(runtimeResults.length, EXPECTED_RUNTIME_SCENARIOS);
  assert.equal(fs.existsSync(writerAnchor), false);
}

function printScope() {
  process.stdout.write(
    `${JSON.stringify({
      validator: VALIDATOR_REL,
      implementation: [PROXY_WRITER_REL],
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
      canonicalRejectionCases: canonicalRejections.length,
      canonicalPreservationChecks: CANONICAL_PRESERVATION_CHECKS,
      tokenRedactionProven,
      guardedWriterSet: GUARDED_WRITER_SET,
      liveEnforcementComplete: false,
      canonicalLiveWritesPermitted: false,
      stageE3Required: true,
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
