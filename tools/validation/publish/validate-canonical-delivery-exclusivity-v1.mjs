#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CanonicalDeliveryError,
  DEFAULT_LEASE_TTL_MS,
  DESTINATION_CLASS,
  EXIT_CODES,
  MIN_TOKEN_BYTES,
  PROMOTION_PRIMITIVE,
  acquireLease,
  approveCanary,
  classifyDeliveryDestination,
  currentProcessIdentity,
  deriveSharedAnchor,
  discoverRegisteredWorktreeRoots,
  evaluateEligibility,
  forceReleaseLease,
  inspectDestinationCoupling,
  loadCanaryApproval,
  releaseLease,
  renewLease,
  statusLease,
  validateCanaryApproval,
  validateExpectedExtensionOutput,
  validateLeaseRecord,
  verifyLease,
} from "../../publish/canonical-delivery-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const LIB_REL = "tools/publish/canonical-delivery-lib.mjs";
const CLI_REL = "tools/publish/canonical-delivery.mjs";
const VALIDATOR_REL = "tools/validation/publish/validate-canonical-delivery-exclusivity-v1.mjs";
const ADR_REL = "docs/decisions/ADR-0013-canonical-generated-delivery-ownership.md";
const GITIGNORE_REL = ".gitignore";
const NEW_PATHS = Object.freeze([LIB_REL, CLI_REL, VALIDATOR_REL, ADR_REL]);
const FINAL_PATHS = Object.freeze([GITIGNORE_REL, ...NEW_PATHS]);
const UNCOMMITTED_MODIFIED = Object.freeze([GITIGNORE_REL]);
const UNCOMMITTED_UNTRACKED = Object.freeze([...NEW_PATHS]);
const CLI_PATH = path.join(ROOT, CLI_REL);
const LIB_URL = pathToFileURL(path.join(ROOT, LIB_REL)).href;
const HEAD_A = "a".repeat(40);
const HEAD_B = "b".repeat(40);
const HEAD_C = "c".repeat(40);
const NOW = 1_785_280_000_000;
const EXPECTED_RUNTIME_SCENARIOS = 81;
const scenarioResults = [];
const scopeResults = [];
const temporaryRoots = new Set();
const gitFixtures = new Map();
let promotionGapEvidence = null;
let corruptLeaseRecoveryProven = false;
let writableLiveForeignWrites = 0;
let processTimeoutProof = false;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 8000,
    killSignal: "SIGTERM",
    ...options,
  });
}

function lines(value) {
  return value.trim().split("\n").filter(Boolean);
}

function sorted(values) {
  return [...values].sort();
}

function sameSet(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
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

export function classifyStage1DE1Scope(state) {
  const normalized = {
    modifiedTracked: sorted(state.modifiedTracked ?? []),
    staged: sorted(state.staged ?? []),
    untracked: sorted((state.untracked ?? []).filter((item) => !item.startsWith("chrome/"))),
    trackedFinal: sorted(state.trackedFinal ?? []),
    missingFinal: sorted(state.missingFinal ?? []),
  };
  if (normalized.staged.length) scopeFailure("Stage 1D-E1 scope forbids staged paths", normalized);
  const uncommitted = sameSet(normalized.modifiedTracked, UNCOMMITTED_MODIFIED) &&
    sameSet(normalized.untracked, UNCOMMITTED_UNTRACKED) &&
    normalized.missingFinal.length === 0;
  if (uncommitted) return "uncommitted";
  const committed = normalized.modifiedTracked.length === 0 &&
    normalized.untracked.length === 0 &&
    normalized.missingFinal.length === 0 &&
    sameSet(normalized.trackedFinal, FINAL_PATHS);
  if (committed) return "committed-clean";
  scopeFailure("Stage 1D-E1 scope mismatch", normalized);
}

function currentScopeState() {
  const modifiedTracked = lines(run("git", ["diff", "--name-only", "HEAD", "--"]));
  const staged = lines(run("git", ["diff", "--cached", "--name-only", "--"]));
  const untracked = lines(run("git", ["ls-files", "--others", "--exclude-standard", "--"]));
  const trackedFinal = lines(run("git", ["ls-files", "--", ...FINAL_PATHS]));
  const missingFinal = FINAL_PATHS.filter((relative) => !fs.existsSync(path.join(ROOT, relative)));
  return { modifiedTracked, staged, untracked, trackedFinal, missingFinal };
}

function assertCurrentScope() {
  return classifyStage1DE1Scope(currentScopeState());
}

function scopeTest(name, fn) {
  fn();
  scopeResults.push(name);
  process.stdout.write(`ok scope ${scopeResults.length} - ${name}\n`);
}

function baseScope(overrides = {}) {
  return {
    modifiedTracked: [...UNCOMMITTED_MODIFIED],
    staged: [],
    untracked: [...UNCOMMITTED_UNTRACKED, "chrome/protected"],
    trackedFinal: [GITIGNORE_REL],
    missingFinal: [],
    ...overrides,
  };
}

function runScopeSelfTests() {
  scopeTest("exact uncommitted foundation scope is accepted", () => {
    assert.equal(classifyStage1DE1Scope(baseScope()), "uncommitted");
  });
  scopeTest("exact committed-clean foundation scope is accepted", () => {
    assert.equal(classifyStage1DE1Scope(baseScope({
      modifiedTracked: [],
      untracked: ["chrome/protected"],
      trackedFinal: [...FINAL_PATHS],
    })), "committed-clean");
  });
  scopeTest("missing modified gitignore is rejected", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({ modifiedTracked: [] })), /scope mismatch/u);
  });
  scopeTest("partial new-file set is rejected", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({ untracked: UNCOMMITTED_UNTRACKED.slice(1) })), /scope mismatch/u);
  });
  scopeTest("staged foundation path is rejected", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({ staged: [LIB_REL] })), /forbids staged/u);
  });
  scopeTest("foreign tracked modification is rejected", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({
      modifiedTracked: [...UNCOMMITTED_MODIFIED, "package.json"],
    })), /scope mismatch/u);
  });
  scopeTest("foreign untracked path is rejected", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({
      untracked: [...UNCOMMITTED_UNTRACKED, "foreign.txt"],
    })), /scope mismatch/u);
  });
  scopeTest("missing final file is rejected", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({ missingFinal: [ADR_REL] })), /scope mismatch/u);
  });
  scopeTest("validator self-modification is not committed-clean", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({
      modifiedTracked: [VALIDATOR_REL],
      untracked: [],
      trackedFinal: [...FINAL_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("mixed tracked and untracked post-commit state is rejected", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({
      modifiedTracked: [GITIGNORE_REL],
      untracked: [],
      trackedFinal: [...FINAL_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("duplicate-like extra foundation spelling is rejected", () => {
    assert.throws(() => classifyStage1DE1Scope(baseScope({
      untracked: [...UNCOMMITTED_UNTRACKED, `${ADR_REL}.copy`],
    })), /scope mismatch/u);
  });
  scopeTest("protected chrome state is ignored without broad tolerance", () => {
    assert.equal(classifyStage1DE1Scope(baseScope({
      untracked: [...UNCOMMITTED_UNTRACKED, "chrome/nested/protected"],
    })), "uncommitted");
  });
  assert.equal(scopeResults.length, 12, "scope scenario count drifted");
}

async function test(name, fn) {
  await fn();
  scenarioResults.push(name);
  process.stdout.write(`ok ${scenarioResults.length} - ${name}\n`);
}

function temporaryRoot(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `h2o-stage1de1-${label}-`));
  temporaryRoots.add(root);
  return root;
}

function shaFile(target) {
  return crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
}

function makeWritable(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (!stat.isSymbolicLink()) {
    try { fs.chmodSync(target, stat.isDirectory() ? 0o700 : 0o600); } catch {}
  }
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) makeWritable(path.join(target, name));
  }
}

function cleanup(target) {
  try {
    makeWritable(target);
    fs.rmSync(target, { recursive: true, force: true });
  } catch {}
  gitFixtures.delete(target);
  temporaryRoots.delete(target);
}

process.on("exit", () => {
  for (const root of temporaryRoots) cleanup(root);
});

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert(error instanceof CanonicalDeliveryError);
    assert.equal(error.exitCode, code);
    return true;
  });
}

function git(cwd, args, options = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Stage 1D-E1 Validator",
      GIT_AUTHOR_EMAIL: "stage1de1@example.invalid",
      GIT_COMMITTER_NAME: "Stage 1D-E1 Validator",
      GIT_COMMITTER_EMAIL: "stage1de1@example.invalid",
    },
    timeout: 8000,
    killSignal: "SIGTERM",
    ...options,
  }).trim();
}

function gitFixture(root) {
  if (gitFixtures.has(root)) return gitFixtures.get(root);
  const authoritative = path.join(root, "cockpit-pro", "h2o-cp-source");
  const canaryWorktree = path.join(root, "cockpit-pro", "worktrees", "canary");
  fs.mkdirSync(authoritative, { recursive: true });
  git(root, ["init", "-b", "main", authoritative]);
  fs.writeFileSync(path.join(authoritative, "fixture.txt"), "base\n");
  git(authoritative, ["add", "fixture.txt"]);
  git(authoritative, ["commit", "-m", "base"]);
  const ancestorHead = git(authoritative, ["rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(authoritative, "fixture.txt"), "main\n");
  git(authoritative, ["commit", "-am", "main"]);
  const mainHead = git(authoritative, ["rev-parse", "HEAD"]);
  fs.mkdirSync(path.dirname(canaryWorktree), { recursive: true });
  git(authoritative, ["worktree", "add", "-b", "canary", canaryWorktree, ancestorHead]);
  fs.writeFileSync(path.join(canaryWorktree, "canary.txt"), "canary\n");
  git(canaryWorktree, ["add", "canary.txt"]);
  git(canaryWorktree, ["commit", "-m", "canary"]);
  const canaryHead = git(canaryWorktree, ["rev-parse", "HEAD"]);
  const extension = path.join(
    authoritative,
    "apps",
    "extensions",
    "chatgpt",
    "chrome",
    "dev-controls-oauth-google",
  );
  fs.mkdirSync(extension, { recursive: true });
  fs.mkdirSync(path.join(authoritative, "apps", "dev-server", "alias"), { recursive: true });
  fs.mkdirSync(
    path.join(authoritative, "apps", "dev-server", "dev_output", "proxy"),
    { recursive: true },
  );
  const fixture = {
    root,
    authoritative,
    canaryWorktree,
    ancestorHead,
    mainHead,
    canaryHead,
    extension,
  };
  gitFixtures.set(root, fixture);
  return fixture;
}

function sandboxPaths(label) {
  const root = temporaryRoot(label);
  const authoritative = path.join(root, "cockpit-pro", "h2o-cp-source");
  const local = path.join(root, "worktrees", "foreign");
  const canonical = path.join(authoritative, "apps", "dev-server");
  const extension = path.join(
    authoritative,
    "apps",
    "extensions",
    "chatgpt",
    "chrome",
    "dev-controls-oauth-google",
  );
  fs.mkdirSync(extension, { recursive: true });
  fs.mkdirSync(path.join(canonical, "alias"), { recursive: true });
  fs.mkdirSync(path.join(canonical, "dev_output", "proxy"), { recursive: true });
  fs.mkdirSync(path.join(local, "apps", "dev-server", "alias"), { recursive: true });
  fs.mkdirSync(path.join(local, "apps", "dev-server", "dev_output"), { recursive: true });
  fs.mkdirSync(
    path.join(local, "apps", "extensions", "chatgpt", "chrome", "local-variant"),
    { recursive: true },
  );
  return { root, authoritative, local, canonical, extension };
}

function leaseInput(root, overrides = {}) {
  const fixture = gitFixture(root);
  return {
    anchorRoot: path.join(root, "anchor"),
    canonicalRoot: fixture.authoritative,
    authoritativeRepositoryRoot: fixture.authoritative,
    publisherRepositoryRoot: fixture.authoritative,
    publisherWorktreeRoot: fixture.authoritative,
    branch: "main",
    head: fixture.mainHead,
    policy: "default",
    purpose: "Stage 1D-E1 sandbox",
    lane: "title-management",
    buildTs: String(NOW),
    expectedExtensionOutput: fixture.extension,
    ttlMs: DEFAULT_LEASE_TTL_MS,
    nowMs: NOW,
    processIdentity: currentProcessIdentity(NOW),
    ...overrides,
  };
}

async function cli(args, anchorRoot, cwd = ROOT, { useOverride = true } = {}) {
  const env = { ...process.env };
  if (useOverride) env.H2O_CANONICAL_DELIVERY_ROOT = anchorRoot;
  else delete env.H2O_CANONICAL_DELIVERY_ROOT;
  return runManagedChild({
    args: [CLI_PATH, ...args],
    cwd,
    env,
    timeoutMs: 8000,
  });
}

function parseCli(result) {
  assert(result.stdout.trim(), `CLI produced no JSON; stderr=${result.stderr}`);
  return JSON.parse(result.stdout.trim().split("\n").at(-1));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startManagedChild({
  code = null,
  args = null,
  env = {},
  cwd = ROOT,
  timeoutMs = 5000,
  terminationGraceMs = 250,
}) {
  const childArguments = args ?? ["--input-type=module", "-e", code];
  const child = spawn(process.execPath, childArguments, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let closed = false;
  let timedOut = false;
  let closeResult = null;
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closePromise = new Promise((resolve) => {
    child.on("close", (status, signal) => {
      closed = true;
      closeResult = {
        status,
        signal,
        stdout,
        stderr,
        timedOut,
        pid: child.pid,
      };
      resolve(closeResult);
    });
  });
  async function terminate() {
    if (closed) return closeResult;
    child.kill("SIGTERM");
    const graceful = await Promise.race([
      closePromise.then(() => true),
      delay(terminationGraceMs).then(() => false),
    ]);
    if (!graceful && !closed) child.kill("SIGKILL");
    return closePromise;
  }
  const overallTimeout = setTimeout(() => {
    timedOut = true;
    void terminate();
  }, timeoutMs);
  closePromise.finally(() => clearTimeout(overallTimeout));
  async function waitForStdout(text, readyTimeoutMs = timeoutMs) {
    if (stdout.includes(text)) return;
    await new Promise((resolve, reject) => {
      const onData = () => {
        if (!stdout.includes(text)) return;
        clearTimeout(timer);
        child.stdout.off("data", onData);
        resolve();
      };
      const timer = setTimeout(() => {
        child.stdout.off("data", onData);
        void terminate();
        reject(new Error(`child did not emit ${JSON.stringify(text)}`));
      }, readyTimeoutMs);
      child.stdout.on("data", onData);
      closePromise.then(() => {
        if (!stdout.includes(text)) {
          clearTimeout(timer);
          child.stdout.off("data", onData);
          reject(new Error(`child closed before ${JSON.stringify(text)}; stderr=${stderr}`));
        }
      });
    });
  }
  return {
    child,
    pid: child.pid,
    waitForStdout,
    waitForClose: () => closePromise,
    terminate,
    output: () => ({ stdout, stderr, closed, timedOut }),
  };
}

async function runManagedChild(options) {
  const managed = startManagedChild(options);
  try {
    return await managed.waitForClose();
  } finally {
    await managed.terminate();
  }
}

async function simultaneousAcquirers(root) {
  const input = leaseInput(root);
  const code = `
    import { acquireLease } from ${JSON.stringify(LIB_URL)};
    const input = JSON.parse(process.env.H2O_TEST_INPUT);
    try {
      acquireLease(input);
      process.stdout.write(JSON.stringify({ ok: true }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, exitCode: error.exitCode ?? 1 }));
    }
  `;
  const children = Array.from({ length: 8 }, (_, index) => {
    const childInput = {
      ...input,
      processIdentity: {
        pid: 5000 + index,
        processStartIdentity: `${5000 + index}:sandbox-start`,
        hostname: "validator-host",
        bootIdentity: "validator-boot",
      },
    };
    return runManagedChild({
      code,
      env: { H2O_TEST_INPUT: JSON.stringify(childInput) },
      timeoutMs: 8000,
    });
  });
  return Promise.all(children);
}

function lockedFixture(label) {
  const root = temporaryRoot(label);
  const live = path.join(root, "live");
  const alias = path.join(live, "alias");
  const proxy = path.join(live, "dev_output", "proxy");
  const extension = path.join(live, "extension");
  const nested = path.join(live, "nested");
  fs.mkdirSync(alias, { recursive: true });
  fs.mkdirSync(proxy, { recursive: true });
  fs.mkdirSync(extension, { recursive: true });
  fs.mkdirSync(path.join(nested, "child"), { recursive: true });
  fs.writeFileSync(path.join(alias, "existing.js"), "canonical");
  fs.writeFileSync(path.join(proxy, "pack.txt"), "canonical");
  fs.writeFileSync(path.join(extension, "loader.js"), "canonical");
  for (const directory of [alias, proxy, extension, nested]) fs.chmodSync(directory, 0o500);
  for (const file of [
    path.join(alias, "existing.js"),
    path.join(proxy, "pack.txt"),
    path.join(extension, "loader.js"),
  ]) fs.chmodSync(file, 0o400);
  return { root, live, alias, proxy, extension, nested };
}

function assertFsDenied(fn) {
  assert.throws(fn, (error) => ["EACCES", "EPERM", "EROFS"].includes(error?.code));
}

async function promotionGapHammer() {
  const root = temporaryRoot("promotion-gap");
  const live = path.join(root, "live");
  const staging = path.join(root, "staging");
  const retired = path.join(root, "retired");
  fs.mkdirSync(live);
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(live, "identity.txt"), "old");
  fs.writeFileSync(path.join(staging, "identity.txt"), "new");
  const code = `
    import fs from "node:fs";
    import path from "node:path";
    const live = process.env.H2O_TEST_LIVE;
    process.stdout.write("READY\\n");
    const deadline = Date.now() + 5000;
    const hammer = () => {
      if (!fs.existsSync(live)) {
        try {
          fs.mkdirSync(live, { recursive: true });
          fs.writeFileSync(path.join(live, "foreign-takeover.txt"), "claimed");
          process.stdout.write("CLAIMED\\n");
          process.exit(0);
        } catch {}
      }
      if (Date.now() >= deadline) {
        process.stdout.write("NO_CLAIM\\n");
        process.exit(2);
      }
      setImmediate(hammer);
    };
    hammer();
  `;
  const managed = startManagedChild({
    code,
    env: { H2O_TEST_LIVE: live },
    timeoutMs: 8000,
  });
  try {
    await managed.waitForStdout("READY");
    fs.renameSync(live, retired);
    const childResult = await managed.waitForClose();
    const claimed = childResult.status === 0 &&
      childResult.stdout.includes("CLAIMED") &&
      fs.existsSync(path.join(live, "foreign-takeover.txt"));
    let secondRenameSucceeded = true;
    let secondRenameError = null;
    try {
      fs.renameSync(staging, live);
    } catch (error) {
      secondRenameSucceeded = false;
      secondRenameError = error?.code || error?.message || "unknown";
    }
    return {
      claimed,
      secondRenameSucceeded,
      secondRenameError,
      childStatus: childResult.status,
      childSignal: childResult.signal,
      childStdout: childResult.stdout.trim(),
      childStderr: childResult.stderr.trim(),
      childTimedOut: childResult.timedOut,
    };
  } finally {
    await managed.terminate();
    cleanup(root);
  }
}

async function concurrentWritableLiveReproduction() {
  const root = temporaryRoot("writable-live");
  const live = path.join(root, "live");
  const gate = path.join(root, "publish-window.open");
  fs.mkdirSync(live);
  fs.writeFileSync(path.join(live, "canonical.txt"), "protected");
  fs.chmodSync(path.join(live, "canonical.txt"), 0o400);
  fs.chmodSync(live, 0o500);
  const writerCode = `
    import fs from "node:fs";
    import path from "node:path";
    const gate = process.env.H2O_TEST_GATE;
    const live = process.env.H2O_TEST_LIVE;
    const name = process.env.H2O_TEST_NAME;
    const value = process.env.H2O_TEST_VALUE;
    process.stdout.write("READY\\n");
    const wait = () => {
      if (!fs.existsSync(gate)) return setImmediate(wait);
      try {
        const temporary = path.join(live, "." + name + ".tmp-" + process.pid);
        fs.writeFileSync(temporary, value);
        fs.renameSync(temporary, path.join(live, name));
        process.stdout.write("LANDED\\n");
        process.exit(0);
      } catch (error) {
        process.stderr.write(String(error?.code || error) + "\\n");
        process.exit(2);
      }
    };
    wait();
  `;
  const publisher = startManagedChild({
    code: writerCode,
    env: {
      H2O_TEST_GATE: gate,
      H2O_TEST_LIVE: live,
      H2O_TEST_NAME: "publisher-output.txt",
      H2O_TEST_VALUE: "publisher",
    },
    timeoutMs: 8000,
  });
  const foreign = startManagedChild({
    code: writerCode,
    env: {
      H2O_TEST_GATE: gate,
      H2O_TEST_LIVE: live,
      H2O_TEST_NAME: "foreign-output.txt",
      H2O_TEST_VALUE: "foreign",
    },
    timeoutMs: 8000,
  });
  try {
    await Promise.all([
      publisher.waitForStdout("READY"),
      foreign.waitForStdout("READY"),
    ]);
    fs.chmodSync(live, 0o700);
    fs.writeFileSync(gate, "open");
    const [publisherResult, foreignResult] = await Promise.all([
      publisher.waitForClose(),
      foreign.waitForClose(),
    ]);
    for (const name of fs.readdirSync(live)) {
      fs.chmodSync(path.join(live, name), 0o400);
    }
    fs.chmodSync(live, 0o500);
    const foreignTarget = path.join(live, "foreign-output.txt");
    const writes = foreignResult.status === 0 &&
      foreignResult.stdout.includes("LANDED") &&
      fs.existsSync(foreignTarget) &&
      fs.readFileSync(foreignTarget, "utf8") === "foreign"
      ? 1
      : 0;
    assert.equal(publisherResult.status, 0, publisherResult.stderr);
    assert(writes > 0, JSON.stringify({ publisherResult, foreignResult }));
    return writes;
  } finally {
    await publisher.terminate();
    await foreign.terminate();
    cleanup(root);
  }
}

async function runProductionScenarios() {
  await test("shared anchor derives from the absolute Git common directory", () => {
    const anchor = deriveSharedAnchor({ cwd: ROOT, env: {} });
    const common = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
    assert.equal(anchor.gitCommonDirectory, fs.realpathSync(common));
    assert.equal(anchor.root, path.join(path.dirname(ROOT), ".h2o-canonical-delivery"));
    assert(!anchor.root.startsWith(`${ROOT}${path.sep}`));
    assert.equal(anchor.authoritativeRepositoryRoot, ROOT);
    assert(discoverRegisteredWorktreeRoots({ cwd: ROOT }).includes(ROOT));
  });

  await test("root override is rejected without explicit acknowledgement", () => {
    const temp = temporaryRoot("override-reject");
    expectCode(() => deriveSharedAnchor({
      cwd: ROOT,
      env: { H2O_CANONICAL_DELIVERY_ROOT: temp },
    }), EXIT_CODES.PATH_COUPLING_VIOLATION);
    cleanup(temp);
  });

  await test("explicit sandbox root override is accepted and reported", () => {
    const temp = temporaryRoot("override-accept");
    const anchor = deriveSharedAnchor({
      cwd: ROOT,
      env: { H2O_CANONICAL_DELIVERY_ROOT: temp },
      allowOverride: true,
    });
    assert.equal(anchor.root, fs.realpathSync(temp));
    assert.equal(anchor.source, "explicit-override");
    assert.equal(anchor.overrideUsed, true);
    cleanup(temp);
  });

  await test("override inside authoritative repository is rejected", () => {
    const root = temporaryRoot("override-authoritative");
    const fixture = gitFixture(root);
    expectCode(() => deriveSharedAnchor({
      cwd: fixture.authoritative,
      env: {
        H2O_CANONICAL_DELIVERY_ROOT: path.join(fixture.authoritative, ".delivery"),
      },
      allowOverride: true,
    }), EXIT_CODES.PATH_COUPLING_VIOLATION);
    cleanup(root);
  });

  await test("override inside registered linked worktree is rejected", () => {
    const root = temporaryRoot("override-linked");
    const fixture = gitFixture(root);
    expectCode(() => deriveSharedAnchor({
      cwd: fixture.authoritative,
      env: {
        H2O_CANONICAL_DELIVERY_ROOT: path.join(fixture.canaryWorktree, ".delivery"),
      },
      allowOverride: true,
    }), EXIT_CODES.PATH_COUPLING_VIOLATION);
    cleanup(root);
  });

  await test("symlink spelling into a registered worktree is rejected", () => {
    const root = temporaryRoot("override-symlink");
    const fixture = gitFixture(root);
    const spelling = path.join(root, "linked-spelling");
    fs.symlinkSync(fixture.canaryWorktree, spelling);
    expectCode(() => deriveSharedAnchor({
      cwd: fixture.authoritative,
      env: { H2O_CANONICAL_DELIVERY_ROOT: path.join(spelling, ".delivery") },
      allowOverride: true,
    }), EXIT_CODES.PATH_COUPLING_VIOLATION);
    cleanup(root);
  });

  await test("nonstandard absolute Git common directory derives authority from worktree discovery", () => {
    const root = temporaryRoot("separate-git-dir");
    const worktree = path.join(root, "worktree");
    const gitDirectory = path.join(root, "git-metadata", "repository.git");
    fs.mkdirSync(path.dirname(gitDirectory), { recursive: true });
    git(root, ["init", "--separate-git-dir", gitDirectory, worktree]);
    fs.writeFileSync(path.join(worktree, "fixture.txt"), "separate\n");
    git(worktree, ["add", "fixture.txt"]);
    git(worktree, ["commit", "-m", "separate"]);
    git(worktree, ["branch", "-M", "main"]);
    const anchor = deriveSharedAnchor({ cwd: worktree, env: {} });
    assert.equal(anchor.gitCommonDirectory, fs.realpathSync(gitDirectory));
    assert.equal(anchor.authoritativeRepositoryRoot, fs.realpathSync(worktree));
    assert.equal(anchor.root, path.join(fs.realpathSync(root), ".h2o-canonical-delivery"));
    cleanup(root);
  });

  const matrix = sandboxPaths("classify");
  try {
    await test("local worktree alias path is LOCAL", () => {
      assert.equal(classifyDeliveryDestination({
        destination: path.join(matrix.local, "apps/dev-server/alias/module.js"),
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.LOCAL);
    });
    await test("local worktree proxy path is LOCAL", () => {
      assert.equal(classifyDeliveryDestination({
        destination: path.join(matrix.local, "apps/dev-server/dev_output/proxy/pack.txt"),
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.LOCAL);
    });
    await test("local worktree extension output is LOCAL", () => {
      assert.equal(classifyDeliveryDestination({
        destination: path.join(matrix.local, "apps/extensions/chatgpt/chrome/local-variant"),
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.LOCAL);
    });
    await test("authoritative alias path is CANONICAL", () => {
      assert.equal(classifyDeliveryDestination({
        destination: path.join(matrix.canonical, "alias/module.js"),
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.CANONICAL);
    });
    await test("authoritative dev_output descendant is CANONICAL", () => {
      assert.equal(classifyDeliveryDestination({
        destination: path.join(matrix.canonical, "dev_output/proxy/pack.txt"),
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.CANONICAL);
    });
    await test("dev_output staging and retired siblings are CANONICAL", () => {
      for (const suffix of [".staging-session", ".retired-session"]) {
        assert.equal(classifyDeliveryDestination({
          destination: path.join(matrix.canonical, `dev_output${suffix}`),
          authoritativeRepositoryRoot: matrix.authoritative,
        }).classification, DESTINATION_CLASS.CANONICAL);
      }
    });
    await test("canonical parent replacement paths are CANONICAL", () => {
      for (const destination of [
        matrix.canonical,
        path.join(matrix.authoritative, "apps", "extensions", "chatgpt"),
        path.join(matrix.authoritative, "apps", "extensions", "chatgpt", "chrome"),
      ]) {
        assert.equal(classifyDeliveryDestination({
          destination,
          authoritativeRepositoryRoot: matrix.authoritative,
        }).classification, DESTINATION_CLASS.CANONICAL);
      }
    });
    await test("unrelated descendants of canonical parents remain LOCAL", () => {
      for (const destination of [
        path.join(matrix.canonical, "serve.py"),
        path.join(matrix.canonical, "unrelated-source"),
        path.join(matrix.authoritative, "apps", "extensions", "chatgpt", "README.md"),
      ]) {
        assert.equal(classifyDeliveryDestination({
          destination,
          authoritativeRepositoryRoot: matrix.authoritative,
        }).classification, DESTINATION_CLASS.LOCAL);
      }
    });
    await test("authoritative extension variant is CANONICAL", () => {
      assert.equal(classifyDeliveryDestination({
        destination: matrix.extension,
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.CANONICAL);
    });
    await test("canonical alias staging sibling is CANONICAL", () => {
      assert.equal(classifyDeliveryDestination({
        destination: path.join(matrix.canonical, "alias.staging-session"),
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.CANONICAL);
    });
    await test("canonical alias retired sibling is CANONICAL", () => {
      assert.equal(classifyDeliveryDestination({
        destination: path.join(matrix.canonical, "alias.retired-session"),
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.CANONICAL);
    });
    await test("canonical extension staging and retired siblings are CANONICAL", () => {
      for (const suffix of [".staging-session", ".retired-session"]) {
        assert.equal(classifyDeliveryDestination({
          destination: `${matrix.extension}${suffix}`,
          authoritativeRepositoryRoot: matrix.authoritative,
        }).classification, DESTINATION_CLASS.CANONICAL);
      }
    });
    await test("symlinked spelling cannot evade canonical classification", () => {
      const escape = path.join(matrix.root, "alias-escape");
      fs.symlinkSync(path.join(matrix.canonical, "alias"), escape);
      assert.equal(classifyDeliveryDestination({
        destination: path.join(escape, "module.js"),
        authoritativeRepositoryRoot: matrix.authoritative,
      }).classification, DESTINATION_CLASS.CANONICAL);
    });
    await test("unrelated authoritative source path is not delivery", () => {
      const result = classifyDeliveryDestination({
        destination: path.join(matrix.authoritative, "packages/title-contract/index.mjs"),
        authoritativeRepositoryRoot: matrix.authoritative,
      });
      assert.equal(result.classification, DESTINATION_CLASS.LOCAL);
      assert.equal(result.leaseRequiredInFutureEnforcement, false);
    });
    await test("classification reports future coupling without enabling enforcement", () => {
      const result = inspectDestinationCoupling({
        destination: path.join(matrix.canonical, "alias"),
        authoritativeRepositoryRoot: matrix.authoritative,
      });
      assert.equal(result.classification, DESTINATION_CLASS.CANONICAL);
      assert.equal(result.enforcementEnabled, false);
      assert.equal(result.sessionPresent, false);
    });
    await test("expected extension output accepts only an exact canonical variant root", () => {
      assert.equal(validateExpectedExtensionOutput({
        expectedExtensionOutput: matrix.extension,
        authoritativeRepositoryRoot: matrix.authoritative,
      }), fs.realpathSync(matrix.extension));
      for (const rejected of [
        path.join(matrix.authoritative, "unrelated"),
        path.join(matrix.extension, "loader.js"),
        path.join(matrix.canonical, "dev_output"),
      ]) {
        expectCode(() => validateExpectedExtensionOutput({
          expectedExtensionOutput: rejected,
          authoritativeRepositoryRoot: matrix.authoritative,
        }), EXIT_CODES.PATH_COUPLING_VIOLATION);
      }
    });
  } finally {
    cleanup(matrix.root);
  }

  await test("strict lease schema accepts the complete versioned record", () => {
    const root = temporaryRoot("schema-valid");
    const result = acquireLease(leaseInput(root));
    const validated = validateLeaseRecord(result.lease);
    assert.equal(validated.schemaVersion, 1);
    assert.equal(validated.heartbeatCounter, 0);
    cleanup(root);
  });

  await test("strict lease schema rejects unknown keys", () => {
    const root = temporaryRoot("schema-unknown");
    const result = acquireLease(leaseInput(root));
    expectCode(() => validateLeaseRecord({ ...result.lease, unexpected: true }),
      EXIT_CODES.VERIFICATION_MISMATCH);
    cleanup(root);
  });

  await test("descriptor-safe schema rejects accessors without invoking getters", () => {
    const root = temporaryRoot("schema-accessor");
    const result = acquireLease(leaseInput(root));
    const source = JSON.parse(JSON.stringify(result.lease));
    let getterCalls = 0;
    const hostile = {};
    for (const [key, value] of Object.entries(source)) {
      Object.defineProperty(hostile, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    }
    Object.defineProperty(hostile, "branch", {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        return getterCalls === 1 ? "main" : "changed";
      },
    });
    expectCode(() => validateLeaseRecord(hostile), EXIT_CODES.VERIFICATION_MISMATCH);
    assert.equal(getterCalls, 0);
    cleanup(root);
  });

  await test("strict schema rejects inherited-property containers", () => {
    const root = temporaryRoot("schema-inherited");
    const result = acquireLease(leaseInput(root));
    const inherited = Object.assign(
      Object.create({ inheritedAuthority: true }),
      JSON.parse(JSON.stringify(result.lease)),
    );
    expectCode(() => validateLeaseRecord(inherited), EXIT_CODES.VERIFICATION_MISMATCH);
    cleanup(root);
  });

  await test("schema normalization does not mutate caller and deeply freezes its snapshot", () => {
    const root = temporaryRoot("schema-freeze");
    const result = acquireLease(leaseInput(root));
    const caller = JSON.parse(JSON.stringify(result.lease));
    const before = JSON.stringify(caller);
    const normalized = validateLeaseRecord(caller);
    assert.equal(JSON.stringify(caller), before);
    assert(Object.isFrozen(normalized));
    assert(Object.isFrozen(normalized.stagingDirectoryNames));
    caller.stagingDirectoryNames.alias = "changed-after-validation";
    assert.notEqual(normalized.stagingDirectoryNames.alias, caller.stagingDirectoryNames.alias);
    cleanup(root);
  });

  await test("invalid build timestamp fails before acquisition and leaves status absent", () => {
    const root = temporaryRoot("invalid-build");
    const input = leaseInput(root, { buildTs: "not-a-timestamp" });
    expectCode(() => acquireLease(input), EXIT_CODES.VERIFICATION_MISMATCH);
    assert.equal(statusLease({ anchorRoot: input.anchorRoot }).state, "absent");
    const acquired = acquireLease({ ...input, buildTs: String(NOW) });
    assert.equal(acquired.lease.buildTs, String(NOW));
    cleanup(root);
  });

  await test("invalid TTL fails before acquisition and leaves status absent", () => {
    const root = temporaryRoot("invalid-ttl");
    const input = leaseInput(root, { ttlMs: 0 });
    expectCode(() => acquireLease(input), EXIT_CODES.VERIFICATION_MISMATCH);
    assert.equal(statusLease({ anchorRoot: input.anchorRoot }).state, "absent");
    cleanup(root);
  });

  await test("unrelated expected extension output fails before acquisition", () => {
    const root = temporaryRoot("invalid-extension-output");
    const fixture = gitFixture(root);
    const input = leaseInput(root, {
      expectedExtensionOutput: path.join(fixture.authoritative, "unrelated-output"),
    });
    expectCode(() => acquireLease(input), EXIT_CODES.PATH_COUPLING_VIOLATION);
    assert.equal(statusLease({ anchorRoot: input.anchorRoot }).state, "absent");
    cleanup(root);
  });

  for (const failurePoint of [
    "after-directory-creation",
    "after-temporary-metadata",
    "after-metadata-publication",
    "after-final-validation",
  ]) {
    await test(`initialization failure ${failurePoint} cleans only its lease and is reacquirable`, () => {
      const root = temporaryRoot(`inject-${failurePoint}`);
      const input = leaseInput(root, {
        failureInjection(point) {
          if (point === failurePoint) throw new Error(`injected ${failurePoint}`);
        },
      });
      expectCode(() => acquireLease(input), EXIT_CODES.VERIFICATION_MISMATCH);
      assert.equal(statusLease({ anchorRoot: input.anchorRoot }).state, "absent");
      const reacquired = acquireLease({ ...input, failureInjection: null });
      assert.equal(statusLease({
        anchorRoot: input.anchorRoot,
        nowMs: NOW + 1,
        currentBootIdentity: reacquired.lease.bootIdentity,
      }).state, "held");
      cleanup(root);
    });
  }

  await test("default lease TTL is exactly four hours", () => {
    const root = temporaryRoot("ttl");
    const result = acquireLease(leaseInput(root));
    assert.equal(
      Date.parse(result.lease.expiresAt) - Date.parse(result.lease.acquiredAt),
      4 * 60 * 60 * 1000,
    );
    cleanup(root);
  });

  await test("ownership token uses at least 32 random bytes and metadata stores only SHA-256", () => {
    const root = temporaryRoot("token");
    const result = acquireLease(leaseInput(root));
    const metadata = fs.readFileSync(
      path.join(root, "anchor", "active-lease", "lease.json"),
      "utf8",
    );
    assert(Buffer.from(result.ownershipToken, "base64url").length >= MIN_TOKEN_BYTES);
    assert(!metadata.includes(result.ownershipToken));
    assert(metadata.includes(crypto.createHash("sha256").update(result.ownershipToken).digest("hex")));
    cleanup(root);
  });

  await test("eight simultaneous acquirers produce exactly one lease owner", async () => {
    const root = temporaryRoot("concurrent");
    const results = await simultaneousAcquirers(root);
    const outputs = results.map((result) => JSON.parse(result.stdout));
    assert.equal(outputs.filter((item) => item.ok).length, 1);
    assert.equal(outputs.filter((item) => item.exitCode === EXIT_CODES.ABSENT_OR_CONTENDED).length, 7);
    assert(fs.existsSync(path.join(root, "anchor", "active-lease", "lease.json")));
    cleanup(root);
  });

  await test("lease survives the acquiring child process exit", async () => {
    const root = temporaryRoot("survive");
    const results = await simultaneousAcquirers(root);
    assert(results.every((result) => result.status === 0));
    const record = JSON.parse(fs.readFileSync(
      path.join(root, "anchor", "active-lease", "lease.json"),
      "utf8",
    ));
    const status = statusLease({
      anchorRoot: path.join(root, "anchor"),
      currentBootIdentity: record.bootIdentity,
      nowMs: NOW + 1,
    });
    assert.equal(status.state, "held");
    cleanup(root);
  });

  await test("correct ownership token verifies", () => {
    const root = temporaryRoot("verify-good");
    const result = acquireLease(leaseInput(root));
    assert.equal(verifyLease({
      anchorRoot: path.join(root, "anchor"),
      ownershipToken: result.ownershipToken,
      nowMs: NOW + 1,
    }).sessionId, result.lease.sessionId);
    cleanup(root);
  });

  await test("wrong ownership token fails closed", () => {
    const root = temporaryRoot("verify-wrong");
    acquireLease(leaseInput(root));
    expectCode(() => verifyLease({
      anchorRoot: path.join(root, "anchor"),
      ownershipToken: "x".repeat(48),
      nowMs: NOW + 1,
    }), EXIT_CODES.TOKEN_INVALID);
    cleanup(root);
  });

  await test("absent ownership token fails closed", () => {
    const root = temporaryRoot("verify-absent");
    acquireLease(leaseInput(root));
    expectCode(() => verifyLease({
      anchorRoot: path.join(root, "anchor"),
      ownershipToken: "",
      nowMs: NOW + 1,
    }), EXIT_CODES.TOKEN_INVALID);
    cleanup(root);
  });

  await test("owner identity mismatch fails closed", () => {
    const root = temporaryRoot("owner-mismatch");
    const result = acquireLease(leaseInput(root));
    expectCode(() => verifyLease({
      anchorRoot: path.join(root, "anchor"),
      ownershipToken: result.ownershipToken,
      nowMs: NOW + 1,
      expected: { pid: 9999 },
    }), EXIT_CODES.OWNER_MISMATCH);
    cleanup(root);
  });

  await test("changed approved HEAD fails closed", () => {
    const root = temporaryRoot("head-mismatch");
    const result = acquireLease(leaseInput(root));
    expectCode(() => verifyLease({
      anchorRoot: path.join(root, "anchor"),
      ownershipToken: result.ownershipToken,
      nowMs: NOW + 1,
      expected: { approvedHead: HEAD_B },
    }), EXIT_CODES.ELIGIBILITY_MISMATCH);
    cleanup(root);
  });

  await test("expired lease fails closed without deletion", () => {
    const root = temporaryRoot("expired");
    const input = leaseInput(root, { ttlMs: 1000 });
    const result = acquireLease(input);
    expectCode(() => verifyLease({
      anchorRoot: input.anchorRoot,
      ownershipToken: result.ownershipToken,
      nowMs: NOW + 1001,
    }), EXIT_CODES.EXPIRED);
    assert(fs.existsSync(path.join(input.anchorRoot, "active-lease")));
    cleanup(root);
  });

  await test("renew extends heartbeat, counter, and expiry", () => {
    const root = temporaryRoot("renew");
    const input = leaseInput(root);
    const result = acquireLease(input);
    const renewed = renewLease({
      anchorRoot: input.anchorRoot,
      ownershipToken: result.ownershipToken,
      nowMs: NOW + 5000,
      ttlMs: 10_000,
    });
    assert.equal(renewed.heartbeatCounter, 1);
    assert.equal(renewed.heartbeatAt, new Date(NOW + 5000).toISOString());
    assert.equal(renewed.expiresAt, new Date(NOW + 15_000).toISOString());
    cleanup(root);
  });

  await test("explicit token-authenticated release succeeds", () => {
    const root = temporaryRoot("release");
    const input = leaseInput(root);
    const result = acquireLease(input);
    assert.equal(releaseLease({
      anchorRoot: input.anchorRoot,
      ownershipToken: result.ownershipToken,
      nowMs: NOW + 1,
    }).released, true);
    assert.equal(statusLease({ anchorRoot: input.anchorRoot }).state, "absent");
    cleanup(root);
  });

  await test("force release requires bounded reason and evidence", () => {
    const root = temporaryRoot("force-input");
    const input = leaseInput(root, { ttlMs: 1000 });
    acquireLease(input);
    expectCode(() => forceReleaseLease({
      anchorRoot: input.anchorRoot,
      reason: "short",
      evidence: "also short",
      nowMs: NOW + 1001,
    }), EXIT_CODES.VERIFICATION_MISMATCH);
    cleanup(root);
  });

  await test("expired lease becomes force-recovery eligible and records evidence", () => {
    const root = temporaryRoot("force-expired");
    const input = leaseInput(root, { ttlMs: 1000 });
    const result = acquireLease(input);
    const audit = forceReleaseLease({
      anchorRoot: input.anchorRoot,
      reason: "operator-confirmed-expiry",
      evidence: "lease expiry verified against sandbox clock",
      nowMs: NOW + 1001,
    });
    assert.equal(audit.sessionId, result.lease.sessionId);
    assert.equal(audit.priorState, "stale");
    assert.equal(audit.priorLease.approvedHead, result.lease.approvedHead);
    assert.equal(audit.priorLease.publisherRepositoryRoot, result.lease.publisherRepositoryRoot);
    assert.equal(audit.priorLease.stagingDirectoryNames.alias,
      result.lease.stagingDirectoryNames.alias);
    assert.equal(
      audit.evidenceSha256,
      crypto.createHash("sha256").update("lease expiry verified against sandbox clock").digest("hex"),
    );
    assert(!JSON.stringify(audit).includes(result.ownershipToken));
    assert(!Object.hasOwn(audit.priorLease, "ownershipTokenSha256"));
    assert.equal(statusLease({ anchorRoot: input.anchorRoot }).state, "absent");
    cleanup(root);
  });

  await test("active lease cannot be force-released", () => {
    const root = temporaryRoot("force-active");
    const input = leaseInput(root);
    acquireLease(input);
    expectCode(() => forceReleaseLease({
      anchorRoot: input.anchorRoot,
      reason: "operator-requested-active-release",
      evidence: "no stale or expired evidence exists",
      nowMs: NOW + 1,
      currentBootIdentity: "forged-boot-mismatch",
    }), EXIT_CODES.OWNER_MISMATCH);
    cleanup(root);
  });

  await test("corrupt state distinguishes missing metadata, malformed JSON, and residue", () => {
    for (const kind of ["missing", "malformed", "residue"]) {
      const root = temporaryRoot(`corrupt-${kind}`);
      const input = leaseInput(root);
      const active = path.join(input.anchorRoot, "active-lease");
      fs.mkdirSync(active, { recursive: true });
      if (kind === "malformed") {
        fs.writeFileSync(path.join(active, "lease.json"), "{not-json");
      } else if (kind === "residue") {
        fs.writeFileSync(path.join(active, ".lease.tmp-residue"), "partial");
      }
      const status = statusLease({ anchorRoot: input.anchorRoot });
      assert.equal(status.state, "corrupt");
      assert.equal(status.exitCode, EXIT_CODES.VERIFICATION_MISMATCH);
      assert(status.corrupt.inventory.entries.length >= (kind === "missing" ? 0 : 1));
      cleanup(root);
    }
  });

  await test("corrupt lease requires evidence-gated audit recovery and becomes reacquirable", () => {
    const root = temporaryRoot("corrupt-recovery");
    const input = leaseInput(root);
    const active = path.join(input.anchorRoot, "active-lease");
    fs.mkdirSync(active, { recursive: true });
    const malformed = Buffer.from("{malformed-lease");
    fs.writeFileSync(path.join(active, "lease.json"), malformed);
    expectCode(() => forceReleaseLease({
      anchorRoot: input.anchorRoot,
      reason: "short",
      evidence: "short",
      nowMs: NOW + 1,
    }), EXIT_CODES.VERIFICATION_MISMATCH);
    const audit = forceReleaseLease({
      anchorRoot: input.anchorRoot,
      reason: "operator-confirmed-corrupt-state",
      evidence: "directory inventory and malformed metadata captured",
      nowMs: NOW + 1,
      actorProcessIdentity: input.processIdentity,
    });
    assert.equal(audit.priorState, "corrupt");
    assert.equal(
      audit.corrupt.metadataSha256,
      crypto.createHash("sha256").update(malformed).digest("hex"),
    );
    assert.equal(audit.corrupt.reason, "lease-metadata-malformed-json");
    assert(audit.corrupt.inventory.entries.some((entry) => entry.name === "lease.json"));
    assert.equal(audit.actor.pid, input.processIdentity.pid);
    assert.equal(statusLease({ anchorRoot: input.anchorRoot }).state, "absent");
    const reacquired = acquireLease(input);
    assert.equal(reacquired.lease.lifecycleState, "held");
    corruptLeaseRecoveryProven = true;
    cleanup(root);
  });

  await test("audit publication failure leaves stale lease in place", () => {
    const root = temporaryRoot("audit-failure");
    const input = leaseInput(root, { ttlMs: 1000 });
    acquireLease(input);
    expectCode(() => forceReleaseLease({
      anchorRoot: input.anchorRoot,
      reason: "operator-confirmed-audit-failure",
      evidence: "injected audit failure must preserve lease",
      nowMs: NOW + 1001,
      actorProcessIdentity: input.processIdentity,
      auditFailureInjection() {
        throw new Error("injected audit write failure");
      },
    }), EXIT_CODES.VERIFICATION_MISMATCH);
    assert.equal(statusLease({
      anchorRoot: input.anchorRoot,
      nowMs: NOW + 1001,
      currentBootIdentity: input.processIdentity.bootIdentity,
    }).state, "stale");
    assert(fs.existsSync(path.join(input.anchorRoot, "active-lease", "lease.json")));
    cleanup(root);
  });

  await test("boot mismatch marks lease stale without auto-release", () => {
    const root = temporaryRoot("boot-mismatch");
    const input = leaseInput(root);
    acquireLease(input);
    const status = statusLease({
      anchorRoot: input.anchorRoot,
      nowMs: NOW + 1,
      currentBootIdentity: "different-boot",
    });
    assert.equal(status.state, "stale");
    assert.deepEqual(status.staleReasons, ["boot-mismatch"]);
    assert(fs.existsSync(path.join(input.anchorRoot, "active-lease")));
    cleanup(root);
  });

  await test("CLI status reports absent lease as JSON with exit 10", async () => {
    const root = temporaryRoot("cli-status");
    const result = await cli(["status", "--allow-root-override"], root);
    const json = parseCli(result);
    assert.equal(result.status, EXIT_CODES.ABSENT_OR_CONTENDED);
    assert.equal(json.state, "absent");
    cleanup(root);
  });

  await test("CLI rejects duplicate flags and unavailable promotion commands", async () => {
    const root = temporaryRoot("cli-strict");
    const duplicate = await cli(
      ["status", "--allow-root-override", "--allow-root-override"],
      root,
    );
    const promote = await cli(["promote", "--allow-root-override"], root);
    assert.equal(duplicate.status, EXIT_CODES.VERIFICATION_MISMATCH);
    assert.equal(promote.status, EXIT_CODES.VERIFICATION_MISMATCH);
    cleanup(root);
  });

  await test("CLI acquire returns token once while later status output is redacted", async () => {
    const root = temporaryRoot("cli-lifecycle");
    const fixture = gitFixture(root);
    const anchor = path.join(root, "anchor");
    const acquired = await cli([
      "acquire",
      "--allow-root-override",
      "--canonical-root", fixture.authoritative,
      "--purpose", "Stage 1D-E1 CLI sandbox",
      "--lane", "title-management",
      "--build-ts", String(NOW),
      "--expected-extension-output", fixture.extension,
    ], anchor, fixture.authoritative);
    assert.equal(acquired.status, 0, acquired.stderr);
    const acquireJson = parseCli(acquired);
    assert.equal(typeof acquireJson.ownershipToken, "string");
    const status = await cli(
      ["status", "--allow-root-override"],
      anchor,
      fixture.authoritative,
    );
    const statusJson = parseCli(status);
    assert.equal(status.status, 0);
    assert(!status.stdout.includes(acquireJson.ownershipToken));
    assert.equal(statusJson.lease.tokenCorrelationPrefix, acquireJson.tokenCorrelationPrefix);
    const released = await cli([
      "release",
      "--allow-root-override",
      "--token", acquireJson.ownershipToken,
    ], anchor, fixture.authoritative);
    assert.equal(released.status, 0, released.stderr);
    cleanup(root);
  });

  await test("CLI build timestamp typo leaves no orphan and valid acquire immediately succeeds", async () => {
    const root = temporaryRoot("cli-build-typo");
    const fixture = gitFixture(root);
    const anchor = path.join(root, "anchor");
    const baseArgs = [
      "acquire",
      "--allow-root-override",
      "--canonical-root", fixture.authoritative,
      "--purpose", "Stage 1D-E1 CLI typo regression",
      "--lane", "title-management",
      "--expected-extension-output", fixture.extension,
    ];
    const invalid = await cli(
      [...baseArgs, "--build-ts", "1785OOPS"],
      anchor,
      fixture.authoritative,
    );
    assert.equal(invalid.status, EXIT_CODES.VERIFICATION_MISMATCH);
    assert.equal(invalid.stderr, "");
    assert.equal(parseCli(invalid).exitCode, EXIT_CODES.VERIFICATION_MISMATCH);
    const absent = await cli(
      ["status", "--allow-root-override"],
      anchor,
      fixture.authoritative,
    );
    assert.equal(parseCli(absent).state, "absent");
    const valid = await cli(
      [...baseArgs, "--build-ts", String(NOW)],
      anchor,
      fixture.authoritative,
    );
    assert.equal(valid.status, 0, valid.stderr);
    cleanup(root);
  });

  await test("CLI corrupt status and evidence-gated force recovery are end-to-end", async () => {
    const root = temporaryRoot("cli-corrupt");
    const fixture = gitFixture(root);
    const anchor = path.join(root, "anchor");
    const active = path.join(anchor, "active-lease");
    fs.mkdirSync(active, { recursive: true });
    fs.writeFileSync(path.join(active, "unexpected.tmp"), "residue");
    const status = await cli(
      ["status", "--allow-root-override"],
      anchor,
      fixture.authoritative,
    );
    assert.equal(status.status, EXIT_CODES.VERIFICATION_MISMATCH);
    assert.equal(parseCli(status).state, "corrupt");
    const noEvidence = await cli([
      "force-release",
      "--allow-root-override",
      "--reason", "operator-confirmed-corrupt",
    ], anchor, fixture.authoritative);
    assert.equal(noEvidence.status, EXIT_CODES.VERIFICATION_MISMATCH);
    assert(fs.existsSync(active));
    const recovered = await cli([
      "force-release",
      "--allow-root-override",
      "--reason", "operator-confirmed-corrupt",
      "--evidence", "manual sandbox inventory proves corrupt initialization",
    ], anchor, fixture.authoritative);
    assert.equal(recovered.status, 0, recovered.stderr);
    const acquired = await cli([
      "acquire",
      "--allow-root-override",
      "--canonical-root", fixture.authoritative,
      "--purpose", "Stage 1D-E1 corrupt recovery",
      "--lane", "title-management",
      "--build-ts", String(NOW),
      "--expected-extension-output", fixture.extension,
    ], anchor, fixture.authoritative);
    assert.equal(acquired.status, 0, acquired.stderr);
    cleanup(root);
  });

  await test("E1 default-anchor mutation guard blocks all mutating commands before writes", async () => {
    const anchor = deriveSharedAnchor({ cwd: ROOT, env: {} });
    assert.equal(fs.existsSync(anchor.root), false);
    const commands = [
      ["acquire"],
      ["renew"],
      ["release"],
      ["force-release"],
      ["approve-canary"],
    ];
    for (const command of commands) {
      const result = await cli(command, null, ROOT, { useOverride: false });
      assert.equal(result.status, EXIT_CODES.PATH_COUPLING_VIOLATION, result.stdout);
      assert.equal(parseCli(result).exitCode, EXIT_CODES.PATH_COUPLING_VIOLATION);
      assert.equal(fs.existsSync(anchor.root), false);
    }
    const readOnly = await cli(["status"], null, ROOT, { useOverride: false });
    assert.equal(readOnly.status, EXIT_CODES.ABSENT_OR_CONTENDED);
    assert.equal(parseCli(readOnly).state, "absent");
    assert.equal(fs.existsSync(anchor.root), false);
  });

  const approvalRoot = temporaryRoot("eligibility");
  const eligibilityFixture = gitFixture(approvalRoot);
  const approval = validateCanaryApproval({
    schemaVersion: 1,
    approvalRef: "canary-1",
    approvedHead: eligibilityFixture.canaryHead,
    approvedWorktreeRoot: eligibilityFixture.canaryWorktree,
    purpose: "pre-merge title canary",
    lane: "title-management",
    approver: "independent-reviewer",
    approvedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 60_000).toISOString(),
  });
  try {
    await test("default eligibility accepts authoritative main HEAD from executable Git", () => {
      const result = evaluateEligibility({
        policy: "default",
        authoritativeRepositoryRoot: eligibilityFixture.authoritative,
        publisherRepositoryRoot: eligibilityFixture.authoritative,
        publisherWorktreeRoot: eligibilityFixture.authoritative,
        head: eligibilityFixture.mainHead,
        branch: "main",
        purpose: "main",
        lane: "title",
      });
      assert.equal(result.approvalRef, null);
      assert.equal(result.mainHead, eligibilityFixture.mainHead);
    });
    await test("default eligibility accepts a real ancestor of main", () => {
      git(eligibilityFixture.authoritative, [
        "checkout",
        "--detach",
        eligibilityFixture.ancestorHead,
      ]);
      try {
        const result = evaluateEligibility({
          policy: "default",
          authoritativeRepositoryRoot: eligibilityFixture.authoritative,
          publisherRepositoryRoot: eligibilityFixture.authoritative,
          publisherWorktreeRoot: eligibilityFixture.authoritative,
          head: eligibilityFixture.ancestorHead,
          branch: "(detached)",
          purpose: "ancestor",
          lane: "title",
        });
        assert.equal(result.headIsAncestorOfMain, true);
      } finally {
        git(eligibilityFixture.authoritative, ["checkout", "main"]);
      }
    });
    await test("forged ancestry boolean cannot authorize a real non-ancestor", () => {
      git(eligibilityFixture.authoritative, [
        "checkout",
        "--detach",
        eligibilityFixture.canaryHead,
      ]);
      try {
        expectCode(() => evaluateEligibility({
          policy: "default",
          authoritativeRepositoryRoot: eligibilityFixture.authoritative,
          publisherRepositoryRoot: eligibilityFixture.authoritative,
          publisherWorktreeRoot: eligibilityFixture.authoritative,
          head: eligibilityFixture.canaryHead,
          headIsAncestorOfMain: true,
          branch: "(detached)",
          purpose: "forged",
          lane: "title",
        }), EXIT_CODES.ELIGIBILITY_MISMATCH);
      } finally {
        git(eligibilityFixture.authoritative, ["checkout", "main"]);
      }
    });
    await test("exact approved non-ancestor publication is accepted", () => {
      const result = evaluateEligibility({
        policy: "pre-merge-canary",
        authoritativeRepositoryRoot: eligibilityFixture.authoritative,
        publisherRepositoryRoot: eligibilityFixture.authoritative,
        publisherWorktreeRoot: eligibilityFixture.canaryWorktree,
        head: eligibilityFixture.canaryHead,
        branch: "canary",
        purpose: "pre-merge title canary",
        lane: "title-management",
        approval,
        nowMs: NOW + 1,
      });
      assert.equal(result.nonMainApprovedCanary, true);
      assert.equal(result.approvalRef, "canary-1");
    });
    await test("approved canary worktree mismatch is rejected", () => {
      const otherWorktree = path.join(approvalRoot, "cockpit-pro", "worktrees", "other");
      git(eligibilityFixture.authoritative, [
        "worktree",
        "add",
        "--detach",
        otherWorktree,
        eligibilityFixture.canaryHead,
      ]);
      expectCode(() => evaluateEligibility({
        policy: "pre-merge-canary",
        authoritativeRepositoryRoot: eligibilityFixture.authoritative,
        publisherRepositoryRoot: eligibilityFixture.authoritative,
        publisherWorktreeRoot: otherWorktree,
        head: eligibilityFixture.canaryHead,
        branch: "(detached)",
        purpose: "pre-merge title canary",
        lane: "title-management",
        approval,
        nowMs: NOW + 1,
      }), EXIT_CODES.ELIGIBILITY_MISMATCH);
    });
    await test("approved canary HEAD drift is rejected", () => {
      expectCode(() => evaluateEligibility({
        policy: "pre-merge-canary",
        authoritativeRepositoryRoot: eligibilityFixture.authoritative,
        publisherRepositoryRoot: eligibilityFixture.authoritative,
        publisherWorktreeRoot: eligibilityFixture.canaryWorktree,
        head: eligibilityFixture.mainHead,
        branch: "canary",
        purpose: "pre-merge title canary",
        lane: "title-management",
        approval,
        nowMs: NOW + 1,
      }), EXIT_CODES.ELIGIBILITY_MISMATCH);
    });
    await test("expired canary approval is rejected", () => {
      expectCode(() => evaluateEligibility({
        policy: "pre-merge-canary",
        authoritativeRepositoryRoot: eligibilityFixture.authoritative,
        publisherRepositoryRoot: eligibilityFixture.authoritative,
        publisherWorktreeRoot: eligibilityFixture.canaryWorktree,
        head: eligibilityFixture.canaryHead,
        branch: "canary",
        purpose: "pre-merge title canary",
        lane: "title-management",
        approval,
        nowMs: NOW + 60_001,
      }), EXIT_CODES.EXPIRED);
    });
    await test("canary approval persists outside worktree and reloads exactly", () => {
      const anchor = path.join(approvalRoot, "anchor");
      const written = approveCanary({
        anchorRoot: anchor,
        approvalRef: "persisted-canary",
        approvedHead: eligibilityFixture.canaryHead,
        approvedWorktreeRoot: eligibilityFixture.canaryWorktree,
        purpose: "pre-merge title canary",
        lane: "title-management",
        approver: "independent-reviewer",
        approvedAt: new Date(NOW).toISOString(),
        expiresAt: new Date(NOW + 60_000).toISOString(),
      });
      assert.deepEqual(loadCanaryApproval({
        anchorRoot: anchor,
        approvalRef: "persisted-canary",
      }), written);
      assert(!path.join(anchor, "approvals").startsWith(
        `${eligibilityFixture.canaryWorktree}${path.sep}`,
      ));
    });
  } finally {
    cleanup(approvalRoot);
  }

  await test("coordinated temporary-unlock window admits historical temp-plus-rename writer", async () => {
    writableLiveForeignWrites = await concurrentWritableLiveReproduction();
    assert(writableLiveForeignWrites > 0);
  });

  await test("permission floor blocks alias cleanup, symlink, and copy operation shapes", () => {
    const fixture = lockedFixture("alias-writer");
    const source = path.join(fixture.root, "source.js");
    fs.writeFileSync(source, "foreign");
    try {
      assertFsDenied(() => fs.unlinkSync(path.join(fixture.alias, "existing.js")));
      assertFsDenied(() => fs.symlinkSync(source, path.join(fixture.alias, "new.js")));
      assertFsDenied(() => fs.copyFileSync(source, path.join(fixture.alias, "copied.js")));
      assert.equal(fs.readFileSync(path.join(fixture.alias, "existing.js"), "utf8"), "canonical");
    } finally {
      cleanup(fixture.root);
    }
  });

  await test("permission floor blocks proxy temp-file plus rename operation shape", () => {
    const fixture = lockedFixture("proxy-writer");
    try {
      assertFsDenied(() => {
        const temp = path.join(fixture.proxy, ".pack.tmp");
        fs.writeFileSync(temp, "foreign");
        fs.renameSync(temp, path.join(fixture.proxy, "pack.txt"));
      });
      assert.equal(fs.readFileSync(path.join(fixture.proxy, "pack.txt"), "utf8"), "canonical");
    } finally {
      cleanup(fixture.root);
    }
  });

  await test("permission floor blocks extension temp-file plus rename operation shape", () => {
    const fixture = lockedFixture("extension-writer");
    try {
      assertFsDenied(() => {
        const temp = path.join(fixture.extension, ".loader.tmp");
        fs.writeFileSync(temp, "foreign");
        fs.renameSync(temp, path.join(fixture.extension, "loader.js"));
      });
      assert.equal(fs.readFileSync(path.join(fixture.extension, "loader.js"), "utf8"), "canonical");
    } finally {
      cleanup(fixture.root);
    }
  });

  await test("permission floor blocks nested directory deletion operation shape", () => {
    const fixture = lockedFixture("nested-delete");
    try {
      assertFsDenied(() => fs.rmSync(path.join(fixture.nested, "child"), {
        recursive: true,
      }));
      assert(fs.existsSync(path.join(fixture.nested, "child")));
    } finally {
      cleanup(fixture.root);
    }
  });

  await test("permission floor blocks whole-directory rename-aside operation shape", () => {
    const fixture = lockedFixture("rename-aside");
    fs.chmodSync(fixture.root, 0o500);
    try {
      assertFsDenied(() => fs.renameSync(fixture.live, path.join(fixture.root, "retired")));
      assert(fs.existsSync(fixture.live));
    } finally {
      cleanup(fixture.root);
    }
  });

  await test("historical writer without new preflight cannot alter locked live content", () => {
    const fixture = lockedFixture("historical");
    const before = shaFile(path.join(fixture.alias, "existing.js"));
    try {
      for (const operation of [
        () => fs.unlinkSync(path.join(fixture.alias, "existing.js")),
        () => fs.writeFileSync(path.join(fixture.proxy, "pack.txt"), "foreign"),
        () => fs.writeFileSync(path.join(fixture.extension, "loader.js"), "foreign"),
      ]) assertFsDenied(operation);
      assert.equal(shaFile(path.join(fixture.alias, "existing.js")), before);
    } finally {
      cleanup(fixture.root);
    }
  });

  await test("staging activity leaves locked live delivery unchanged", () => {
    const root = temporaryRoot("staging");
    const live = path.join(root, "live");
    const staging = path.join(root, "staging");
    fs.mkdirSync(live);
    fs.mkdirSync(staging);
    const liveFile = path.join(live, "identity.txt");
    fs.writeFileSync(liveFile, "canonical");
    fs.chmodSync(liveFile, 0o400);
    fs.chmodSync(live, 0o500);
    const before = shaFile(liveFile);
    fs.writeFileSync(path.join(staging, "identity.txt"), "candidate");
    assert.equal(shaFile(liveFile), before);
    cleanup(root);
  });

  await test("exact two-rename promotion gap is claimed by mkdir-plus-write hammer", async () => {
    promotionGapEvidence = await promotionGapHammer();
    assert.equal(promotionGapEvidence.claimed, true, JSON.stringify(promotionGapEvidence));
    assert.equal(promotionGapEvidence.secondRenameSucceeded, false);
  });

  await test("two-rename primitive remains rejected after reproduced takeover", () => {
    assert.equal(PROMOTION_PRIMITIVE.twoRenameAccepted, false);
    assert.equal(promotionGapEvidence.claimed, true);
    assert.match(PROMOTION_PRIMITIVE.reason, /missing-path interval/u);
  });

  await test("managed-process timeout terminates and reaps a deliberately hanging child", async () => {
    const managed = startManagedChild({
      code: `process.stdout.write("READY\\n"); setInterval(() => {}, 1000);`,
      timeoutMs: 150,
      terminationGraceMs: 100,
    });
    const pid = managed.pid;
    try {
      await managed.waitForStdout("READY");
      const result = await managed.waitForClose();
      assert.equal(result.timedOut, true);
      assert(["SIGTERM", "SIGKILL"].includes(result.signal));
      assert.throws(() => process.kill(pid, 0), (error) => error?.code === "ESRCH");
      processTimeoutProof = true;
    } finally {
      await managed.terminate();
    }
  });

  await test("lease state remains outside sandbox repository and status fixture is unchanged", () => {
    const root = temporaryRoot("no-source-mutation");
    const fixture = gitFixture(root);
    const repository = fixture.authoritative;
    const anchor = path.join(root, "shared-anchor");
    const statusFixture = path.join(repository, "git-status.txt");
    fs.writeFileSync(statusFixture, "clean\n");
    const beforeStatus = git(repository, ["status", "--porcelain"]);
    const input = leaseInput(root, {
      anchorRoot: anchor,
    });
    acquireLease(input);
    assert.equal(fs.readFileSync(statusFixture, "utf8"), "clean\n");
    assert(!path.join(anchor, "active-lease").startsWith(`${repository}${path.sep}`));
    assert.equal(git(repository, ["status", "--porcelain"]), beforeStatus);
    cleanup(root);
  });

  await test("plaintext token never appears in lease, audit, status, or history-like output", () => {
    const root = temporaryRoot("redaction");
    const input = leaseInput(root, { ttlMs: 1000 });
    const result = acquireLease(input);
    forceReleaseLease({
      anchorRoot: input.anchorRoot,
      reason: "operator-confirmed-expiry",
      evidence: "sandbox evidence confirms expiration",
      nowMs: NOW + 1001,
    });
    const serialized = [];
    const visit = (target) => {
      for (const name of fs.readdirSync(target)) {
        const child = path.join(target, name);
        const stat = fs.statSync(child);
        if (stat.isDirectory()) visit(child);
        else serialized.push(fs.readFileSync(child, "utf8"));
      }
    };
    visit(input.anchorRoot);
    assert(!serialized.join("\n").includes(result.ownershipToken));
    cleanup(root);
  });

  assert.equal(
    scenarioResults.length,
    EXPECTED_RUNTIME_SCENARIOS,
    "runtime scenario count drifted",
  );
}

function printScope() {
  process.stdout.write(`${JSON.stringify({
    finalPaths: FINAL_PATHS,
    uncommittedModified: UNCOMMITTED_MODIFIED,
    uncommittedUntracked: UNCOMMITTED_UNTRACKED,
    protectedUntrackedPrefix: "chrome/",
    liveEnforcementEnabled: false,
  }, null, 2)}\n`);
}

const args = process.argv.slice(2);
const allowedArgs = new Set(["--scope-check", "--print-scope", "--self-test-scope"]);
if (args.length > 1 || args.some((arg) => !allowedArgs.has(arg))) {
  throw new Error(`unknown or duplicate Stage 1D-E1 validator option: ${args.join(" ")}`);
}

if (args[0] === "--print-scope") {
  printScope();
} else if (args[0] === "--self-test-scope") {
  runScopeSelfTests();
  console.log(`PASS Stage 1D-E1 scope self-tests: ${scopeResults.length}/${scopeResults.length}`);
} else if (args[0] === "--scope-check") {
  const scopeMode = assertCurrentScope();
  console.log(JSON.stringify({
    ok: true,
    validator: "canonical-delivery-exclusivity-v1",
    scopeMode,
  }));
} else {
  const scopeMode = assertCurrentScope();
  runScopeSelfTests();
  await runProductionScenarios();
  console.log(JSON.stringify({
    ok: true,
    validator: "canonical-delivery-exclusivity-v1",
    scopeMode,
    runtimeScenarios: scenarioResults.length,
    scopeScenarios: scopeResults.length,
    simultaneousAcquirers: 8,
    simultaneousWinners: 1,
    corruptLeaseRecoveryProven,
    writableLiveForeignWrites,
    processTimeoutProof,
    liveEnforcementEnabled: false,
    promotionGapTakeoverObserved: promotionGapEvidence?.claimed === true,
    twoRenamePromotionAccepted: PROMOTION_PRIMITIVE.twoRenameAccepted,
  }));
}
