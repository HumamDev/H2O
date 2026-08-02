#!/usr/bin/env node
// Lean activator Batch 2 P0/P1 — source-only validator.
// Executes only in isolated fixture repositories and temporary staged trees.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const ACTIVATOR_REL = "tools/publish/lean-activator.mjs";
const VALIDATOR_REL = "tools/validation/publish/validate-lean-activator-v1.mjs";
const PUBLISHER_REL = "tools/publish/lean-publisher.mjs";
const PACKAGE_REL = "package.json";
const AUTHORIZED_PATHS = Object.freeze([PACKAGE_REL, ACTIVATOR_REL, VALIDATOR_REL].sort());
const BASE_HEAD = "86af342f1b1815e12c477673a4f2123b37bede40";
const ACCEPTED_P1_HEAD = "fa0dac4552ce5a1189dee0b1d23975f95bffe751";
const P1_SUBJECT = "feat(publish): add canonical activation preflight";
const VALIDATOR_FIX_SUBJECT = "fix(publish): support integrated P0/P1 validation";
const BATCH11_PUBLISHER_SHA256 = "ef4575bc6855b81a8c16ff874cd679f14e79733163a23d76b4a758a30f513ba4";
const BATCH11_VALIDATOR_SHA256 = "c8a1abd5c21a9328dc13a8bf19aba508ab476095d9e988803cd41e21c55fda92";
const ACCEPTED_ACTIVATOR_SHA256 = "531bb4e9b5d7d61584e013d0d10c8007c78f75498988ba64bac4d24a8d4f2f36";
const REQUIRED_FILES = Object.freeze([
  "manifest.json", "loader.js", "bg.js", "title-contract-bridge.js",
  "provider/identity-provider-supabase.js",
]);
const EXPECTED_SCOPE = 17;
const EXPECTED_RUNTIME = 88;
const EXPECTED_STRUCTURAL = 14;

const temporaryRoots = [];
const scopeResults = [];
const runtimeResults = [];
const structuralResults = [];

function tempRoot(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `h2o-activator-v1-${label}-`));
  temporaryRoots.push(root);
  return root;
}

function disposeTemporaryRoot(root) {
  const stat = fs.lstatSync(root);
  const resolvedRoot = fs.realpathSync(root);
  const resolvedTemporary = fs.realpathSync(os.tmpdir());
  if (stat.isSymbolicLink() || !resolvedRoot.startsWith(resolvedTemporary + path.sep)) {
    throw new Error(`refusing to dispose non-owned fixture root: ${root}`);
  }
  const index = temporaryRoots.lastIndexOf(root);
  if (index >= 0) temporaryRoots.splice(index, 1);
  fs.rmSync(root, { recursive: true, force: true });
}

function git(repository, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8", timeout: 60_000, killSignal: "SIGTERM",
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(" ")} failed (${result.status}): ${String(result.stderr).trim()}`);
  }
  return result.status === 0 ? String(result.stdout).trim() : null;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function currentScopeState() {
  const lines = (args) => {
    const value = git(ROOT, args);
    return value ? value.split("\n").filter(Boolean).sort() : [];
  };
  const modifiedTracked = lines(["diff", "--name-only"]);
  const staged = lines(["diff", "--cached", "--name-only"]);
  const untracked = lines(["ls-files", "--others", "--exclude-standard"]);
  const finalPaths = AUTHORIZED_PATHS.filter((relative) => fs.existsSync(path.join(ROOT, relative))).sort();
  const committedPaths = lines(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]);
  return {
    head: git(ROOT, ["rev-parse", "HEAD"]),
    parent: git(ROOT, ["rev-parse", "HEAD^"]),
    branch: git(ROOT, ["branch", "--show-current"]),
    subject: git(ROOT, ["log", "-1", "--format=%s"]),
    acceptedP1Ancestor: git(ROOT, ["merge-base", "--is-ancestor", ACCEPTED_P1_HEAD, "HEAD"],
      { allowFailure: true }) !== null,
    modifiedTracked,
    staged,
    untracked,
    finalPaths,
    committedPaths,
  };
}

function scopeError(message, state) {
  const error = new Error(message);
  error.state = state;
  throw error;
}

function classifyScope(state) {
  const value = Object.fromEntries(Object.entries(state).map(([key, item]) =>
    [key, Array.isArray(item) ? [...item].sort() : item]));
  if (value.staged.length) scopeError("P0/P1 source scope rejects staged paths", value);
  const dirty = JSON.stringify(value.modifiedTracked) === JSON.stringify([PACKAGE_REL]) &&
    JSON.stringify(value.untracked) === JSON.stringify([ACTIVATOR_REL, VALIDATOR_REL].sort()) &&
    JSON.stringify(value.finalPaths) === JSON.stringify(AUTHORIZED_PATHS);
  if (dirty) return "uncommitted";
  const validatorFixDirty = value.head === ACCEPTED_P1_HEAD && value.parent === BASE_HEAD &&
    value.subject === P1_SUBJECT && value.acceptedP1Ancestor === true && value.untracked.length === 0 &&
    JSON.stringify(value.modifiedTracked) === JSON.stringify([VALIDATOR_REL]) &&
    JSON.stringify(value.committedPaths) === JSON.stringify(AUTHORIZED_PATHS) &&
    JSON.stringify(value.finalPaths) === JSON.stringify(AUTHORIZED_PATHS);
  if (validatorFixDirty) return "validator-fix-uncommitted";
  const validatorFixClean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.parent === ACCEPTED_P1_HEAD && value.subject === VALIDATOR_FIX_SUBJECT &&
    value.acceptedP1Ancestor === true &&
    JSON.stringify(value.committedPaths) === JSON.stringify([VALIDATOR_REL]) &&
    JSON.stringify(value.finalPaths) === JSON.stringify(AUTHORIZED_PATHS);
  if (validatorFixClean) return "validator-fix-committed";
  const clean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.head === ACCEPTED_P1_HEAD && value.parent === BASE_HEAD && value.subject === P1_SUBJECT &&
    value.acceptedP1Ancestor === true &&
    JSON.stringify(value.committedPaths) === JSON.stringify(AUTHORIZED_PATHS) &&
    JSON.stringify(value.finalPaths) === JSON.stringify(AUTHORIZED_PATHS);
  if (clean) return "committed-clean";
  scopeError("P0/P1 source scope mismatch", value);
}

function baseDirtyScope(overrides = {}) {
  return {
    head: BASE_HEAD,
    parent: "6920f812263ed03d79888f06e5e849fe4dcca43e",
    branch: "main",
    subject: "fix(publish): make staged aliases promotion-safe",
    acceptedP1Ancestor: false,
    modifiedTracked: [PACKAGE_REL],
    staged: [],
    untracked: [ACTIVATOR_REL, VALIDATOR_REL].sort(),
    finalPaths: [...AUTHORIZED_PATHS],
    committedPaths: ["tools/publish/lean-publisher.mjs", "tools/validation/publish/validate-lean-publisher-v1.mjs"].sort(),
    ...overrides,
  };
}

function scopeTest(name, fn) {
  fn();
  scopeResults.push(name);
  process.stdout.write(`ok scope ${scopeResults.length} - ${name}\n`);
}

function runScopeTests() {
  scopeTest("exact three-path uncommitted P0/P1 scope is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope()), "uncommitted");
  });
  scopeTest("exact three-path committed-clean P0/P1 scope is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P1_HEAD, parent: BASE_HEAD, branch: "publish-batch2-activator-p1",
      subject: P1_SUBJECT, acceptedP1Ancestor: true,
      modifiedTracked: [], untracked: [], committedPaths: [...AUTHORIZED_PATHS],
    })), "committed-clean");
  });
  scopeTest("staged source is rejected", () => {
    assert.throws(() => classifyScope(baseDirtyScope({ staged: [PACKAGE_REL] })), /rejects staged/u);
  });
  scopeTest("missing authorized path is rejected", () => {
    assert.throws(() => classifyScope(baseDirtyScope({ finalPaths: [PACKAGE_REL, VALIDATOR_REL].sort() })), /scope mismatch/u);
  });
  scopeTest("fourth tracked path is rejected", () => {
    assert.throws(() => classifyScope(baseDirtyScope({ modifiedTracked: [PACKAGE_REL, "README.md"].sort() })), /scope mismatch/u);
  });
  scopeTest("fourth untracked path is rejected", () => {
    assert.throws(() => classifyScope(baseDirtyScope({ untracked: [ACTIVATOR_REL, VALIDATOR_REL, "stray.mjs"].sort() })), /scope mismatch/u);
  });
  scopeTest("wrong committed parent is rejected", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P1_HEAD, parent: "wrong", subject: P1_SUBJECT, acceptedP1Ancestor: true,
      modifiedTracked: [], untracked: [], committedPaths: [...AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("committed fourth path is rejected", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P1_HEAD, parent: BASE_HEAD, subject: P1_SUBJECT, acceptedP1Ancestor: true,
      modifiedTracked: [], untracked: [],
      committedPaths: [...AUTHORIZED_PATHS, "extra.txt"].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("exact validator-only uncommitted repair is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P1_HEAD, parent: BASE_HEAD, subject: P1_SUBJECT, acceptedP1Ancestor: true,
      modifiedTracked: [VALIDATOR_REL], untracked: [],
      committedPaths: [...AUTHORIZED_PATHS],
    })), "validator-fix-uncommitted");
  });
  scopeTest("validator repair rejects an activator modification", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P1_HEAD, parent: BASE_HEAD, subject: P1_SUBJECT, acceptedP1Ancestor: true,
      modifiedTracked: [ACTIVATOR_REL, VALIDATOR_REL].sort(), untracked: [], committedPaths: [...AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("validator repair rejects package changes", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P1_HEAD, parent: BASE_HEAD, subject: P1_SUBJECT, acceptedP1Ancestor: true,
      modifiedTracked: [PACKAGE_REL, VALIDATOR_REL].sort(),
      untracked: [], committedPaths: [...AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("validator repair rejects untracked paths", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P1_HEAD, parent: BASE_HEAD, subject: P1_SUBJECT, acceptedP1Ancestor: true,
      modifiedTracked: [VALIDATOR_REL],
      untracked: ["stray.mjs"], committedPaths: [...AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("validator repair rejects the wrong commit subject", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P1_HEAD, parent: BASE_HEAD, subject: "wrong", acceptedP1Ancestor: true,
      modifiedTracked: [VALIDATOR_REL], untracked: [],
      committedPaths: [...AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("exact committed validator follow-up is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: "future-validator-fix", parent: ACCEPTED_P1_HEAD, subject: VALIDATOR_FIX_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [], committedPaths: [VALIDATOR_REL],
    })), "validator-fix-committed");
  });
  scopeTest("committed validator follow-up rejects the wrong parent", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: "future-validator-fix", parent: BASE_HEAD, subject: VALIDATOR_FIX_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [], committedPaths: [VALIDATOR_REL],
    })), /scope mismatch/u);
  });
  scopeTest("committed validator follow-up rejects a second path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: "future-validator-fix", parent: ACCEPTED_P1_HEAD, subject: VALIDATOR_FIX_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [VALIDATOR_REL, "README.md"].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("committed validator follow-up requires accepted P0/P1 ancestry", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: "future-validator-fix", parent: ACCEPTED_P1_HEAD, subject: VALIDATOR_FIX_SUBJECT,
      acceptedP1Ancestor: false, modifiedTracked: [], untracked: [], committedPaths: [VALIDATOR_REL],
    })), /scope mismatch/u);
  });
  assert.equal(scopeResults.length, EXPECTED_SCOPE);
}

function authorityError(code, evidence) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}

function evaluateRegisteredMainAuthority(evidence) {
  if (evidence.mainBranch !== "main") authorityError("registered-main-wrong-branch", evidence);
  if (evidence.mainTrackedClean !== true) authorityError("registered-main-dirty", evidence);
  if (evidence.mainIndexEmpty !== true) authorityError("registered-main-index-not-empty", evidence);
  if (evidence.mainUntrackedClean !== true) authorityError("registered-main-untracked-source", evidence);
  const isolatedCandidate = evidence.mainHead === BASE_HEAD &&
    evidence.executionHead === ACCEPTED_P1_HEAD && evidence.executionScope === "committed-clean" &&
    evidence.executionWorktree !== evidence.mainWorktree;
  if (isolatedCandidate) return "pre-integration-candidate";
  if (evidence.acceptedP1Ancestor !== true) authorityError("registered-main-p1-ancestry-missing", evidence);
  if (!["committed-clean", "validator-fix-uncommitted", "validator-fix-committed"]
    .includes(evidence.executionScope)) {
    authorityError("execution-scope-not-integrated-authority", evidence);
  }
  return "integrated";
}

function authorityEvidence(overrides = {}) {
  return {
    mainHead: ACCEPTED_P1_HEAD,
    mainBranch: "main",
    mainTrackedClean: true,
    mainIndexEmpty: true,
    mainUntrackedClean: true,
    acceptedP1Ancestor: true,
    mainWorktree: "/fixture/main",
    executionHead: ACCEPTED_P1_HEAD,
    executionScope: "committed-clean",
    executionWorktree: "/fixture/main",
    ...overrides,
  };
}

async function test(name, fn) {
  await fn();
  runtimeResults.push(name);
  process.stdout.write(`ok ${runtimeResults.length} - ${name}\n`);
}

function structural(name, fn) {
  fn();
  structuralResults.push(name);
  process.stdout.write(`ok structural ${structuralResults.length} - ${name}\n`);
}

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function authoritativeMainWorktree() {
  const blocks = git(ROOT, ["worktree", "list", "--porcelain"]).split(/\n\n/u);
  const declaredMainWorktrees = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (!lines.includes("branch refs/heads/main")) continue;
    const worktree = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (worktree) declaredMainWorktrees.push(fs.realpathSync(worktree));
  }
  if (declaredMainWorktrees.length !== 1) {
    authorityError("registered-main-worktree-count", { declaredMainWorktrees });
  }
  const mainWorktree = declaredMainWorktrees[0];
  const executionState = currentScopeState();
  const executionScope = classifyScope(executionState);
  const mainHead = git(mainWorktree, ["rev-parse", "HEAD"]);
  evaluateRegisteredMainAuthority({
    mainHead,
    mainBranch: git(mainWorktree, ["branch", "--show-current"]),
    mainTrackedClean: git(mainWorktree, ["diff", "--quiet"], { allowFailure: true }) !== null,
    mainIndexEmpty: git(mainWorktree, ["diff", "--cached", "--quiet"], { allowFailure: true }) !== null,
    mainUntrackedClean: git(mainWorktree,
      ["ls-files", "--others", "--exclude-standard", "--", ".", ":(exclude)chrome"]) === "",
    acceptedP1Ancestor: git(mainWorktree,
      ["merge-base", "--is-ancestor", ACCEPTED_P1_HEAD, mainHead], { allowFailure: true }) !== null,
    mainWorktree,
    executionHead: executionState.head,
    executionScope,
    executionWorktree: fs.realpathSync(ROOT),
  });
  return mainWorktree;
}

function installIgnoredPublisherInputs(repository) {
  const main = authoritativeMainWorktree();
  const dependencies = path.join(main, "node_modules");
  assert.equal(fs.statSync(dependencies).isDirectory(), true, "authoritative dependency runtime is required");
  fs.mkdirSync(path.join(repository, "node_modules"), { recursive: true });
  for (const entry of fs.readdirSync(dependencies)) {
    const destination = path.join(repository, "node_modules", entry);
    if (!fs.existsSync(destination)) fs.symlinkSync(path.join(dependencies, entry), destination);
  }
  for (const relative of [
    "assets/chrome-dev-controls-icons",
    "assets/chrome-dev-lean-icons",
    "assets/internal-dev-controls-icons",
  ]) {
    const source = path.join(main, relative);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(repository, relative);
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source)) {
      const from = path.join(source, name);
      if (fs.statSync(from).isFile()) copyFile(from, path.join(destination, name));
    }
  }
  const localConfig = path.join(main, "config/local/identity-provider.local.json");
  if (fs.existsSync(localConfig)) {
    copyFile(localConfig, path.join(repository, "config/local/identity-provider.local.json"));
  }
}

function createRealPublisherBoundaryFixture(label) {
  const top = tempRoot(label);
  const repository = path.join(top, "publisher boundary with spaces 🧪");
  execFileSync("git", ["clone", "--quiet", "--local", ROOT, repository], {
    cwd: top, encoding: "utf8", timeout: 120_000, killSignal: "SIGTERM",
  });
  git(repository, ["checkout", "--quiet", "-B", "main", "HEAD"]);
  git(repository, ["config", "user.name", "Lean Activator Validator"]);
  git(repository, ["config", "user.email", "lean-activator@example.invalid"]);
  const pinnedPublisher = execFileSync("git", ["show", `${BASE_HEAD}:${PUBLISHER_REL}`], { cwd: ROOT });
  const pinnedPublisherValidator = execFileSync("git", ["show",
    `${BASE_HEAD}:tools/validation/publish/validate-lean-publisher-v1.mjs`], { cwd: ROOT });
  assert.equal(sha256(pinnedPublisher), BATCH11_PUBLISHER_SHA256,
    "Batch 1.1 publisher authority must remain pinned to BASE_HEAD");
  assert.equal(sha256(pinnedPublisherValidator), BATCH11_VALIDATOR_SHA256,
    "Batch 1.1 publisher validator authority must remain pinned to BASE_HEAD");
  assert.equal(sha256(fs.readFileSync(path.join(repository, PUBLISHER_REL))),
    BATCH11_PUBLISHER_SHA256,
    "fixture must execute the exact committed Batch 1.1 publisher");
  copyFile(path.join(ROOT, ACTIVATOR_REL), path.join(repository, ACTIVATOR_REL));
  installIgnoredPublisherInputs(repository);
  git(repository, ["add", ACTIVATOR_REL]);
  if (git(repository, ["diff", "--cached", "--name-only"])) {
    git(repository, ["commit", "-q", "-m", "fixture: current read-only activator"]);
  }
  assert.equal(git(repository, ["status", "--porcelain=v1"]), "");
  return {
    top,
    repository,
    activator: path.join(repository, ACTIVATOR_REL),
    publisher: path.join(repository, PUBLISHER_REL),
  };
}

function runRealPublisher(fixture) {
  const result = spawnSync(process.execPath, [fixture.publisher, "--stage-only"], {
    cwd: fixture.repository,
    env: cleanEnvironment(),
    encoding: "utf8",
    timeout: 300_000,
    killSignal: "SIGTERM",
  });
  const receiptPath = String(result.stdout || "").match(/receipt\s+:\s+(.+)$/mu)?.[1]?.trim() || null;
  const stagingRoot = String(result.stdout || "").match(/staging root\s+:\s+(.+)$/mu)?.[1]?.trim() || null;
  if (stagingRoot) temporaryRoots.push(stagingRoot);
  return { result, receiptPath, stagingRoot };
}

function createRepositoryFixture(label, { withFoundation = true } = {}) {
  const top = tempRoot(label);
  const repository = path.join(top, "repository with spaces 🧪");
  if (withFoundation) {
    execFileSync("git", ["clone", "--quiet", "--local", "--no-checkout", ROOT, repository], {
      cwd: top, encoding: "utf8", timeout: 120_000,
    });
    git(repository, ["sparse-checkout", "set", "--no-cone", "/package.json", "/tools/publish/",
      "/fixture-source/", "/apps/dev-server/generated.js"]);
    git(repository, ["checkout", "--quiet", "-B", "main", "HEAD"]);
  } else {
    fs.mkdirSync(repository, { recursive: true });
    git(repository, ["init", "-q", "-b", "main"]);
    copyFile(path.join(ROOT, "tools/publish/canonical-delivery-lib.mjs"),
      path.join(repository, "tools/publish/canonical-delivery-lib.mjs"));
  }
  git(repository, ["config", "user.name", "Lean Activator Validator"]);
  git(repository, ["config", "user.email", "lean-activator@example.invalid"]);
  copyFile(path.join(ROOT, ACTIVATOR_REL), path.join(repository, ACTIVATOR_REL));
  fs.mkdirSync(path.join(repository, "fixture-source"), { recursive: true });
  fs.writeFileSync(path.join(repository, "fixture-source", "ordinary.js"), "export const ordinary = true;\n");
  fs.writeFileSync(path.join(repository, "fixture-source", "emoji 🧪.js"), "export const emoji = '🧪';\n");
  fs.mkdirSync(path.join(repository, "apps", "dev-server"), { recursive: true });
  fs.writeFileSync(path.join(repository, "apps", "dev-server", "generated.js"), "// generated fixture\n");
  git(repository, ["add", "--sparse", ACTIVATOR_REL, "tools/publish/canonical-delivery-lib.mjs",
    "fixture-source", "apps/dev-server/generated.js"]);
  git(repository, ["commit", "-q", "-m", "fixture: activator source"]);
  assert.equal(git(repository, ["status", "--porcelain=v1"]), "");
  return { top, repository, activator: path.join(repository, ACTIVATOR_REL) };
}

function listFiles(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else found.push(absolute);
    }
  };
  walk(root);
  return found;
}

function fixtureManifest(root, stageRoot) {
  const entries = listFiles(root).map((filename) => {
    const relative = path.relative(stageRoot, filename).split(path.sep).join("/");
    const stat = fs.lstatSync(filename);
    return stat.isSymbolicLink()
      ? { path: relative, type: "symlink", target: fs.readlinkSync(filename) }
      : { path: relative, type: "file", bytes: stat.size, sha256: sha256(fs.readFileSync(filename)) };
  }).sort((a, b) => a.path.localeCompare(b.path, "en"));
  return {
    fileCount: entries.length,
    treeDigest: sha256(entries.map((entry) => JSON.stringify(entry)).join("\n")),
    entries,
  };
}

function createStageFixture(repository, label = "valid") {
  const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), `h2o-publish-stage-${label}-`));
  temporaryRoots.push(stageRoot);
  const alias = path.join(stageRoot, "server", "alias");
  const devOutput = path.join(stageRoot, "server", "dev_output");
  const proxyPack = path.join(devOutput, "proxy", "_paste-pack.ext.txt");
  const extension = path.join(stageRoot, "extension");
  fs.mkdirSync(alias, { recursive: true });
  fs.mkdirSync(path.dirname(proxyPack), { recursive: true });
  fs.mkdirSync(extension, { recursive: true });
  const aliases = [
    ["ordinary.js", path.join(repository, "fixture-source", "ordinary.js")],
    ["emoji 🧪.js", path.join(repository, "fixture-source", "emoji 🧪.js")],
  ];
  for (const [name, target] of aliases) {
    fs.copyFileSync(target, path.join(alias, name));
  }
  fs.symlinkSync("ordinary.js", path.join(alias, "compat ordinary.js"));
  const buildTimestamp = String(Date.now());
  fs.writeFileSync(proxyPack, `// buildTs=${buildTimestamp}\n// proxy fixture\n`);
  fs.writeFileSync(path.join(extension, "manifest.json"), `${JSON.stringify({ manifest_version: 3, name: "fixture", version: "1.0.0" })}\n`);
  fs.writeFileSync(path.join(extension, "loader.js"), `// buildTs=${buildTimestamp}\n`);
  fs.writeFileSync(path.join(extension, "bg.js"), "// background\n");
  fs.writeFileSync(path.join(extension, "title-contract-bridge.js"), "// bridge\n");
  fs.mkdirSync(path.join(extension, "provider"));
  fs.writeFileSync(path.join(extension, "provider", "identity-provider-supabase.js"), "// provider\n");
  const manifests = {
    alias: fixtureManifest(alias, stageRoot),
    devOutput: fixtureManifest(devOutput, stageRoot),
    extension: fixtureManifest(extension, stageRoot),
  };
  const head = git(repository, ["rev-parse", "HEAD"]);
  const receipt = {
    schemaVersion: 1,
    mode: "stage-only",
    repository: fs.realpathSync(repository),
    remote: "fixture",
    branch: "main",
    approvedHead: head,
    stagedExtensionVariant: "dev-controls-oauth-google",
    buildTimestamp,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    stagingRoot: stageRoot,
    outputPaths: { alias, devOutput, proxyPack, extension },
    fileCounts: {
      alias: manifests.alias.fileCount,
      devOutput: manifests.devOutput.fileCount,
      extension: manifests.extension.fileCount,
      total: Object.values(manifests).reduce((sum, item) => sum + item.fileCount, 0),
    },
    treeDigests: Object.fromEntries(Object.entries(manifests).map(([name, item]) => [name, item.treeDigest])),
    manifests,
    validatorResult: { ok: true },
    lock: { directory: path.join(path.dirname(repository), ".h2o-publisher-lock"), ownerId: "fixture-owner" },
    activationPerformed: false,
    browserReloadPerformed: false,
    browserCanaryPerformed: false,
    pushPerformed: false,
  };
  const receiptPath = path.join(stageRoot, "publication-receipt.json");
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return { stageRoot, alias, devOutput, proxyPack, extension, receipt, receiptPath };
}

function readReceipt(stage) {
  return JSON.parse(fs.readFileSync(stage.receiptPath, "utf8"));
}

function writeReceipt(stage, receipt) {
  fs.writeFileSync(stage.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  stage.receipt = receipt;
}

function refreshReceiptManifests(stage) {
  const receipt = readReceipt(stage);
  const manifests = {
    alias: fixtureManifest(stage.alias, stage.stageRoot),
    devOutput: fixtureManifest(stage.devOutput, stage.stageRoot),
    extension: fixtureManifest(stage.extension, stage.stageRoot),
  };
  receipt.manifests = manifests;
  receipt.fileCounts = {
    alias: manifests.alias.fileCount,
    devOutput: manifests.devOutput.fileCount,
    extension: manifests.extension.fileCount,
    total: Object.values(manifests).reduce((sum, item) => sum + item.fileCount, 0),
  };
  receipt.treeDigests = Object.fromEntries(Object.entries(manifests).map(([name, item]) => [name, item.treeDigest]));
  writeReceipt(stage, receipt);
}

function cleanEnvironment(overrides = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (name.startsWith("H2O_")) delete environment[name];
  return { ...environment, ...overrides };
}

function runActivator(fixture, args, { env = {} } = {}) {
  return spawnSync(process.execPath, [fixture.activator, ...args], {
    cwd: fixture.repository,
    env: cleanEnvironment(env),
    encoding: "utf8",
    timeout: 60_000,
    killSignal: "SIGTERM",
  });
}

function codeOf(result) {
  try { return JSON.parse(String(result.stderr).trim()).code; } catch { return null; }
}

function expectFailure(fixture, args, expectedCode, options) {
  const result = runActivator(fixture, args, options);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(codeOf(result), expectedCode, result.stderr);
  return result;
}

function mutateReceipt(stage, mutation) {
  const receipt = readReceipt(stage);
  mutation(receipt);
  writeReceipt(stage, receipt);
}

function cloneStage(repository, label, mutation) {
  const stage = createStageFixture(repository, label);
  if (mutation) mutation(stage);
  return stage;
}

function validTransactionModel() {
  const activationId = "activation-12345678";
  return {
    activationId,
    rollbackScope: "whole-release",
    journalResolved: true,
    finalReceiptDurable: true,
    trees: Object.fromEntries(["alias", "devOutput", "extension"].map((family) => [family, {
      activationId,
      state: "verified",
      incomingPrepared: true,
      liveRetired: true,
      incomingPromoted: true,
      verified: true,
      restored: false,
      previousState: { kind: "tree", recorded: true },
      restoreOnFailure: "previous-tree",
    }])),
  };
}

async function runAuthorityModelTests() {
  await test("isolated accepted candidate may provision from main fixed at Batch 1.1", () => {
    assert.equal(evaluateRegisteredMainAuthority(authorityEvidence({
      mainHead: BASE_HEAD,
      acceptedP1Ancestor: false,
      executionWorktree: "/fixture/candidate",
    })), "pre-integration-candidate");
  });
  await test("integrated main exactly at accepted P0/P1 is authorized", () => {
    assert.equal(evaluateRegisteredMainAuthority(authorityEvidence()), "integrated");
  });
  await test("clean exact validator-only descendant is authorized", () => {
    assert.equal(evaluateRegisteredMainAuthority(authorityEvidence({
      mainHead: "validator-fix-descendant",
      executionHead: "validator-fix-descendant",
      executionScope: "validator-fix-committed",
    })), "integrated");
  });
  await test("fixed-head replacement would become stale at the validator follow-up", () => {
    const descendant = "validator-fix-descendant";
    assert.notEqual(descendant, ACCEPTED_P1_HEAD);
    assert.equal(evaluateRegisteredMainAuthority(authorityEvidence({
      mainHead: descendant,
      executionHead: descendant,
      executionScope: "validator-fix-committed",
    })), "integrated");
  });
  await test("future integrated descendant requires an explicitly accepted validator scope", () => {
    assert.throws(() => evaluateRegisteredMainAuthority(authorityEvidence({
      mainHead: "future-descendant",
      executionHead: "future-descendant",
      executionScope: "unaccepted-future-scope",
    })), (error) => error.code === "execution-scope-not-integrated-authority");
    assert.equal(evaluateRegisteredMainAuthority(authorityEvidence({
      mainHead: "future-descendant",
      executionHead: "future-descendant",
      executionScope: "validator-fix-committed",
    })), "integrated");
  });
  await test("arbitrary Batch 1.1 descendant without accepted P0/P1 rejects", () => {
    assert.throws(() => evaluateRegisteredMainAuthority(authorityEvidence({
      mainHead: "arbitrary-base-descendant",
      acceptedP1Ancestor: false,
      executionScope: "validator-fix-committed",
    })), (error) => error.code === "registered-main-p1-ancestry-missing");
  });
  await test("unrelated registered main history rejects", () => {
    assert.throws(() => evaluateRegisteredMainAuthority(authorityEvidence({
      mainHead: "unrelated-history",
      acceptedP1Ancestor: false,
    })), (error) => error.code === "registered-main-p1-ancestry-missing");
  });
  await test("registered main on the wrong branch rejects", () => {
    assert.throws(() => evaluateRegisteredMainAuthority(authorityEvidence({ mainBranch: "feature" })),
      (error) => error.code === "registered-main-wrong-branch");
  });
  await test("dirty registered main rejects", () => {
    assert.throws(() => evaluateRegisteredMainAuthority(authorityEvidence({ mainTrackedClean: false })),
      (error) => error.code === "registered-main-dirty");
  });
  await test("registered main with a non-empty index rejects", () => {
    assert.throws(() => evaluateRegisteredMainAuthority(authorityEvidence({ mainIndexEmpty: false })),
      (error) => error.code === "registered-main-index-not-empty");
  });
  await test("registered main with untracked source rejects", () => {
    assert.throws(() => evaluateRegisteredMainAuthority(authorityEvidence({ mainUntrackedClean: false })),
      (error) => error.code === "registered-main-untracked-source");
  });
  await test("Batch 1.1 publisher bytes remain pinned to immutable BASE_HEAD", () => {
    assert.equal(sha256(execFileSync("git", ["show", `${BASE_HEAD}:${PUBLISHER_REL}`], { cwd: ROOT })),
      BATCH11_PUBLISHER_SHA256);
    assert.equal(sha256(execFileSync("git", ["show",
      `${BASE_HEAD}:tools/validation/publish/validate-lean-publisher-v1.mjs`], { cwd: ROOT })),
    BATCH11_VALIDATOR_SHA256);
  });
  await test("caller-claimed integration cannot bypass an unaccepted execution scope", () => {
    assert.throws(() => evaluateRegisteredMainAuthority(authorityEvidence({
      mainHead: "claimed-integrated",
      acceptedP1Ancestor: true,
      executionScope: "caller-claimed-integrated",
    })), (error) => error.code === "execution-scope-not-integrated-authority");
  });
}

async function runRuntimeTests(api) {
  const fixture = createRepositoryFixture("baseline");
  const stage = createStageFixture(fixture.repository, "path with spaces 🧪");

  await test("valid stage receipt passes independent read-only verification", () => {
    const before = fs.readFileSync(stage.receiptPath);
    const result = runActivator(fixture, ["--verify-stage-receipt", stage.receiptPath]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.receiptSha256, sha256(before));
    assert.equal(payload.source.sourceTree, git(fixture.repository, ["rev-parse", "HEAD^{tree}"]));
    assert.equal(payload.stage.aliases.regularFileCount, 2);
    assert.equal(payload.stage.aliases.symlinkCount, 1);
    assert.equal(fs.readFileSync(stage.receiptPath).equals(before), true);
  });
  await test("receipt and staged paths with spaces and emoji are supported", () => {
    assert.match(stage.stageRoot, /spaces 🧪/u);
    const result = runActivator(fixture, ["--verify-stage-receipt", stage.receiptPath]);
    assert.equal(result.status, 0, result.stderr);
  });
  await test("real Batch 1.1 publisher output passes the activator boundary", () => {
    const boundary = createRealPublisherBoundaryFixture("real-publisher-boundary");
    let published = null;
    try {
      published = runRealPublisher(boundary);
      assert.equal(published.result.status, 0, published.result.stderr);
      assert.ok(published.receiptPath && fs.existsSync(published.receiptPath), published.result.stdout);
      const receiptBefore = fs.readFileSync(published.receiptPath);
      const publishedReceipt = JSON.parse(receiptBefore);
      const stagedManifestsBefore = JSON.stringify(Object.fromEntries(
        ["alias", "devOutput", "extension"].map((family) => [
          family,
          fixtureManifest(publishedReceipt.outputPaths[family], publishedReceipt.stagingRoot),
        ]),
      ));
      const result = runActivator(boundary, ["--verify-stage-receipt", published.receiptPath]);
      assert.equal(result.status, 0,
        `real publisher receipt rejected: ${codeOf(result)} ${String(result.stderr).trim()}`);
      const payload = JSON.parse(result.stdout);
      assert.deepEqual(publishedReceipt.validatorResult.alias,
        { aliasCount: 155, regularFileCount: 150, symlinkCount: 5 });
      assert.equal(payload.stage.aliases.aliasCount, 155);
      assert.equal(payload.stage.aliases.regularFileCount, 150);
      assert.equal(payload.stage.aliases.symlinkCount, 5);
      assert.equal(fs.readFileSync(published.receiptPath).equals(receiptBefore), true);
      const stagedManifestsAfter = JSON.stringify(Object.fromEntries(
        ["alias", "devOutput", "extension"].map((family) => [
          family,
          fixtureManifest(publishedReceipt.outputPaths[family], publishedReceipt.stagingRoot),
        ]),
      ));
      assert.equal(stagedManifestsAfter, stagedManifestsBefore);
    } finally {
      if (published?.stagingRoot && fs.existsSync(published.stagingRoot)) disposeTemporaryRoot(published.stagingRoot);
      if (fs.existsSync(boundary.top)) disposeTemporaryRoot(boundary.top);
    }
  });
  await test("wrong worktree argument is rejected by executable source derivation", () => {
    assert.throws(() => api.collectSourcePreflight(fixture.repository), (error) => error.code === "wrong-worktree");
  });
  await test("receipt from another repository is rejected", () => {
    const candidate = cloneStage(fixture.repository, "wrong-repo", (value) =>
      mutateReceipt(value, (receipt) => { receipt.repository = path.join(fixture.top, "foreign"); }));
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "receipt-repository-mismatch");
  });
  await test("wrong branch rejects before staged verification", () => {
    const candidate = createStageFixture(fixture.repository, "wrong-branch");
    git(fixture.repository, ["checkout", "-q", "-b", "not-main"]);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "wrong-branch");
    git(fixture.repository, ["checkout", "-q", "main"]);
  });
  await test("receipt HEAD mismatch is rejected", () => {
    const candidate = cloneStage(fixture.repository, "wrong-head", (value) =>
      mutateReceipt(value, (receipt) => { receipt.approvedHead = "0".repeat(40); }));
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "receipt-head-mismatch");
  });
  await test("dirty tracked source is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "dirty");
    fs.appendFileSync(path.join(fixture.repository, "package.json"), "\n");
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "tracked-worktree-dirty");
    git(fixture.repository, ["restore", "package.json"]);
  });
  await test("non-empty index is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "index");
    fs.appendFileSync(path.join(fixture.repository, "package.json"), "\n");
    git(fixture.repository, ["add", "package.json"]);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "index-not-empty");
    git(fixture.repository, ["restore", "--staged", "package.json"]);
    git(fixture.repository, ["restore", "package.json"]);
  });
  await test("non-ignored untracked source is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "untracked");
    const stray = path.join(fixture.repository, "stray-source.tmp");
    fs.writeFileSync(stray, "stray\n");
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "untracked-source-present");
    fs.unlinkSync(stray);
  });
  await test("missing foundation ancestry is rejected", () => {
    const standalone = createRepositoryFixture("no-foundation", { withFoundation: false });
    const candidate = createStageFixture(standalone.repository, "no-foundation");
    expectFailure(standalone, ["--verify-stage-receipt", candidate.receiptPath], "foundation-ancestry-missing");
  });
  await test("inherited destination override is rejected", () => {
    expectFailure(fixture, ["--verify-stage-receipt", stage.receiptPath], "destination-override-present", {
      env: { H2O_SERVER_DIR: path.join(fixture.top, "decoy") },
    });
  });

  await test("missing receipt is rejected", () => {
    expectFailure(fixture, ["--verify-stage-receipt", path.join(fixture.top, "missing.json")], "receipt-not-regular");
  });
  await test("symlink receipt is rejected", () => {
    const link = path.join(fixture.top, "receipt-link.json");
    fs.symlinkSync(stage.receiptPath, link);
    expectFailure(fixture, ["--verify-stage-receipt", link], "receipt-not-regular");
  });
  await test("malformed receipt is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "malformed");
    fs.writeFileSync(candidate.receiptPath, "{ bad json\n");
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "receipt-malformed");
  });
  for (const [name, mutate, code] of [
    ["wrong receipt schema", (receipt) => { receipt.schemaVersion = 2; }, "receipt-schema-version"],
    ["wrong receipt mode", (receipt) => { receipt.mode = "activate"; }, "receipt-mode"],
    ["wrong receipt branch", (receipt) => { receipt.branch = "feature"; }, "receipt-branch-mismatch"],
    ["activation field not false", (receipt) => { receipt.activationPerformed = true; }, "receipt-boundary-field"],
    ["reload field not false", (receipt) => { receipt.browserReloadPerformed = true; }, "receipt-boundary-field"],
    ["canary field not false", (receipt) => { receipt.browserCanaryPerformed = true; }, "receipt-boundary-field"],
    ["push field not false", (receipt) => { receipt.pushPerformed = true; }, "receipt-boundary-field"],
  ]) {
    await test(`${name} is rejected`, () => {
      const candidate = cloneStage(fixture.repository, name.replaceAll(" ", "-"), (value) => mutateReceipt(value, mutate));
      expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], code);
    });
  }
  await test("missing manifest data is rejected", () => {
    const candidate = cloneStage(fixture.repository, "missing-manifest", (value) =>
      mutateReceipt(value, (receipt) => { delete receipt.manifests.alias; }));
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "receipt-manifest-missing");
  });
  await test("publisher validator result must be successful", () => {
    const candidate = cloneStage(fixture.repository, "validator-failed", (value) =>
      mutateReceipt(value, (receipt) => { receipt.validatorResult.ok = false; }));
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "receipt-validator-failed");
  });
  await test("receipt must identify the shared Batch 1 publisher lock", () => {
    const candidate = cloneStage(fixture.repository, "wrong-lock", (value) =>
      mutateReceipt(value, (receipt) => { receipt.lock.directory = path.join(fixture.top, "other-lock"); }));
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "receipt-lock-mismatch");
  });
  await test("unsorted receipt manifest is rejected against independent sorted ordering", () => {
    const candidate = cloneStage(fixture.repository, "unsorted-manifest", (value) =>
      mutateReceipt(value, (receipt) => { receipt.manifests.extension.entries.reverse(); }));
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-manifest-entry-mismatch");
  });
  await test("receipt outside its declared staging root is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "receipt-outside");
    const outside = path.join(fixture.top, "outside-publication-receipt.json");
    fs.copyFileSync(candidate.receiptPath, outside);
    expectFailure(fixture, ["--verify-stage-receipt", outside], "receipt-outside-staging-root");
  });

  for (const [name, mutate, expected] of [
    ["added staged file", (value) => fs.writeFileSync(path.join(value.extension, "added.js"), "// added\n"), "staged-manifest-entry-mismatch"],
    ["removed staged file", (value) => fs.unlinkSync(path.join(value.extension, "bg.js")), "staged-manifest-entry-mismatch"],
    ["changed regular-file bytes", (value) => fs.appendFileSync(path.join(value.extension, "bg.js"), "// changed\n"), "staged-manifest-entry-mismatch"],
    ["changed staged symlink", (value) => {
      const link = path.join(value.alias, "compat ordinary.js");
      fs.unlinkSync(link);
      fs.symlinkSync(path.relative(value.alias, path.join(fixture.repository, "fixture-source", "emoji 🧪.js")), link);
    }, "staged-manifest-entry-mismatch"],
  ]) {
    await test(`${name} after receipt is rejected`, () => {
      const candidate = cloneStage(fixture.repository, name.replaceAll(" ", "-"), mutate);
      expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], expected);
    });
  }
  await test("receipt file-count drift is rejected", () => {
    const candidate = cloneStage(fixture.repository, "count-drift", (value) =>
      mutateReceipt(value, (receipt) => { receipt.fileCounts.alias += 1; }));
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-file-count-drift");
  });
  await test("receipt tree-digest mismatch is rejected", () => {
    const candidate = cloneStage(fixture.repository, "digest-drift", (value) =>
      mutateReceipt(value, (receipt) => { receipt.treeDigests.extension = "0".repeat(64); }));
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-tree-digest-mismatch");
  });
  await test("copied alias byte mutation with unchanged size is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "alias-byte-mutation");
    const filename = path.join(candidate.alias, "ordinary.js");
    const bytes = fs.readFileSync(filename);
    bytes[0] ^= 1;
    fs.writeFileSync(filename, bytes);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-manifest-entry-mismatch");
  });
  await test("copied alias size drift is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "alias-size-drift");
    fs.appendFileSync(path.join(candidate.alias, "ordinary.js"), "x");
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-manifest-entry-mismatch");
  });
  await test("vanished staging root is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "vanished");
    fs.rmSync(candidate.stageRoot, { recursive: true });
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "receipt-not-regular");
  });
  await test("required extension file remains independently mandatory", () => {
    const candidate = createStageFixture(fixture.repository, "required-missing");
    fs.unlinkSync(path.join(candidate.extension, "bg.js"));
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-extension-required-file");
  });
  await test("proxy pack remains independently mandatory", () => {
    const candidate = createStageFixture(fixture.repository, "proxy-missing");
    fs.unlinkSync(candidate.proxyPack);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-proxy-pack-missing");
  });
  await test("missing staged output family is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "family-missing");
    fs.rmSync(candidate.devOutput, { recursive: true });
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-output-missing");
  });
  await test("mixed build markers are rejected after manifest recomputation", () => {
    const candidate = createStageFixture(fixture.repository, "mixed-marker");
    fs.writeFileSync(path.join(candidate.extension, "loader.js"), "// buildTs=9999999999999\n");
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-build-marker-mismatch");
  });
  await test("staging-root path leakage in staged text is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "stage-leak");
    fs.appendFileSync(path.join(candidate.extension, "bg.js"), `// ${candidate.stageRoot}\n`);
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-text-staging-root");
  });
  await test("staging-root path leakage in a copied alias is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "alias-stage-leak");
    fs.appendFileSync(path.join(candidate.alias, "ordinary.js"), `// ${candidate.stageRoot}\n`);
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-text-staging-root");
  });
  await test("safe intra-alias compatibility symlink is accepted", () => {
    const candidate = createStageFixture(fixture.repository, "safe-intra-alias");
    const result = runActivator(fixture, ["--verify-stage-receipt", candidate.receiptPath]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.stage.aliases.symlinkCount, 1);
    assert.equal(payload.stage.aliases.entries.find((entry) => entry.name === "compat ordinary.js").linkText,
      "ordinary.js");
  });
  await test("safe source-worktree compatibility symlink is accepted", () => {
    const candidate = createStageFixture(fixture.repository, "safe-source-alias");
    fs.symlinkSync(path.relative(candidate.alias, path.join(fixture.repository, "fixture-source", "ordinary.js")),
      path.join(candidate.alias, "source compatibility.js"));
    refreshReceiptManifests(candidate);
    const result = runActivator(fixture, ["--verify-stage-receipt", candidate.receiptPath]);
    assert.equal(result.status, 0, result.stderr);
  });
  await test("unsupported alias entry type is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "unsupported-alias-type");
    fs.mkdirSync(path.join(candidate.alias, "directory-entry"));
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-alias-entry-type");
  });
  await test("broken compatibility symlink is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "broken-alias");
    fs.unlinkSync(path.join(candidate.alias, "compat ordinary.js"));
    fs.symlinkSync("missing.js", path.join(candidate.alias, "compat ordinary.js"));
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-alias-broken");
  });
  await test("alias resolving into generated output is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "generated-alias");
    const link = path.join(candidate.alias, "ordinary.js");
    fs.unlinkSync(link);
    fs.symlinkSync(path.relative(candidate.alias, path.join(fixture.repository, "apps", "dev-server", "generated.js")), link);
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-alias-generated-target");
  });
  await test("alias resolving outside approved roots is rejected", () => {
    const candidate = createStageFixture(fixture.repository, "outside-alias");
    const outside = path.join(fixture.top, "outside.js");
    fs.writeFileSync(outside, "// outside\n");
    const link = path.join(candidate.alias, "ordinary.js");
    fs.unlinkSync(link);
    fs.symlinkSync(path.relative(candidate.alias, outside), link);
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-alias-outside-approved-roots");
  });
  await test("alias resolving into a registered foreign worktree is rejected", () => {
    const foreign = path.join(fixture.top, "foreign-worktree");
    git(fixture.repository, ["worktree", "add", "--quiet", "--detach", foreign, "HEAD"]);
    const candidate = createStageFixture(fixture.repository, "foreign-alias");
    const link = path.join(candidate.alias, "ordinary.js");
    fs.unlinkSync(link);
    fs.symlinkSync(path.relative(candidate.alias, path.join(foreign, "fixture-source", "ordinary.js")), link);
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-alias-foreign-worktree");
  });
  await test("absolute foreign-worktree path embedded in staged text is rejected", () => {
    const foreign = path.join(fixture.top, "foreign-worktree");
    const candidate = createStageFixture(fixture.repository, "foreign-text");
    fs.appendFileSync(path.join(candidate.extension, "bg.js"), `// ${fs.realpathSync(foreign)}\n`);
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-text-foreign-worktree");
  });
  await test("absolute foreign-worktree path embedded in a copied alias is rejected", () => {
    const foreign = path.join(fixture.top, "foreign-worktree");
    const candidate = createStageFixture(fixture.repository, "foreign-alias-text");
    fs.appendFileSync(path.join(candidate.alias, "ordinary.js"), `// ${fs.realpathSync(foreign)}\n`);
    refreshReceiptManifests(candidate);
    expectFailure(fixture, ["--verify-stage-receipt", candidate.receiptPath], "staged-text-foreign-worktree");
  });

  await test("canonical foundation derives the external anchor without creating it", () => {
    const expected = path.join(fixture.top, ".h2o-canonical-delivery");
    assert.equal(fs.existsSync(expected), false);
    const result = runActivator(fixture, ["--verify-stage-receipt", stage.receiptPath]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(expected), false);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(payload.canonicalFoundation.futureSubpaths).sort(),
      ["activation-intents", "activations", "rollbacks"]);
    assert.equal(path.basename(payload.canonicalFoundation.publisherLock), ".h2o-publisher-lock");
  });
  await test("symlinked canonical anchor is rejected without following or changing it", () => {
    const symlinkFixture = createRepositoryFixture("symlink-anchor");
    const candidate = createStageFixture(symlinkFixture.repository, "symlink-anchor");
    try {
      const target = path.join(symlinkFixture.top, "anchor-target");
      fs.mkdirSync(target);
      fs.symlinkSync(target, path.join(symlinkFixture.top, ".h2o-canonical-delivery"));
      expectFailure(symlinkFixture, ["--verify-stage-receipt", candidate.receiptPath], "canonical-anchor-symlink");
    } finally {
      if (fs.existsSync(candidate.stageRoot)) disposeTemporaryRoot(candidate.stageRoot);
      if (fs.existsSync(symlinkFixture.top)) disposeTemporaryRoot(symlinkFixture.top);
    }
  });
  await test("broken symlink canonical anchor is also rejected", () => {
    const symlinkFixture = createRepositoryFixture("broken-anchor");
    const candidate = createStageFixture(symlinkFixture.repository, "broken-anchor");
    try {
      fs.symlinkSync(path.join(symlinkFixture.top, "missing-target"),
        path.join(symlinkFixture.top, ".h2o-canonical-delivery"));
      expectFailure(symlinkFixture, ["--verify-stage-receipt", candidate.receiptPath], "canonical-anchor-symlink");
    } finally {
      if (fs.existsSync(candidate.stageRoot)) disposeTemporaryRoot(candidate.stageRoot);
      if (fs.existsSync(symlinkFixture.top)) disposeTemporaryRoot(symlinkFixture.top);
    }
  });
  await test("stage receipt remains byte-identical through repeated verification", () => {
    const before = fs.readFileSync(stage.receiptPath);
    for (let index = 0; index < 3; index += 1) {
      const result = runActivator(fixture, ["--verify-stage-receipt", stage.receiptPath]);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(fs.readFileSync(stage.receiptPath).equals(before), true);
  });
  await test("activate command fails before receipt, lock, anchor or stage mutation", () => {
    const before = fs.readFileSync(stage.receiptPath);
    const anchor = path.join(fixture.top, ".h2o-canonical-delivery");
    const lock = path.join(fixture.top, ".h2o-publisher-lock");
    expectFailure(fixture, ["--activate-receipt", stage.receiptPath], "activation-not-implemented");
    assert.equal(fs.readFileSync(stage.receiptPath).equals(before), true);
    assert.equal(fs.existsSync(anchor), false);
    assert.equal(fs.existsSync(lock), false);
  });
  await test("canonical verification command is fixture-only and fails before inspection", () => {
    expectFailure(fixture, ["--verify-canonical", "--receipt", stage.receiptPath], "canonical-verification-fixture-only");
  });
  await test("rollback, recovery and pruning commands are absent", () => {
    for (const command of ["--rollback", "--recover", "--prune"]) {
      expectFailure(fixture, [command, stage.receiptPath], "mutation-command-not-implemented");
    }
  });
  await test("invalid CLI combinations fail closed", () => {
    for (const args of [[], ["--verify-stage-receipt"], ["--unknown", stage.receiptPath],
      ["--verify-stage-receipt", stage.receiptPath, "extra"]]) {
      expectFailure(fixture, args, "invalid-arguments");
    }
  });

  await test("tree comparison accepts byte-identical files", () => {
    const root = tempRoot("compare-equal");
    const stagedRoot = path.join(root, "staged");
    const canonicalRoot = path.join(root, "canonical");
    fs.mkdirSync(stagedRoot); fs.mkdirSync(canonicalRoot);
    fs.writeFileSync(path.join(stagedRoot, "a.js"), "same\n");
    fs.writeFileSync(path.join(canonicalRoot, "a.js"), "same\n");
    assert.equal(api.compareTrees(stagedRoot, canonicalRoot).equivalent, true);
  });
  await test("tree comparison reports regular-file byte mismatch", () => {
    const root = tempRoot("compare-bytes");
    const stagedRoot = path.join(root, "staged"); const canonicalRoot = path.join(root, "canonical");
    fs.mkdirSync(stagedRoot); fs.mkdirSync(canonicalRoot);
    fs.writeFileSync(path.join(stagedRoot, "a.js"), "new\n");
    fs.writeFileSync(path.join(canonicalRoot, "a.js"), "old\n");
    const result = api.compareTrees(stagedRoot, canonicalRoot);
    assert.equal(result.equivalent, false); assert.equal(result.byteMismatches.length, 1);
  });
  await test("tree comparison separates link-text drift from resolved-target equality", () => {
    const root = tempRoot("compare-links");
    const stagedRoot = path.join(root, "staged"); const canonicalRoot = path.join(root, "canonical");
    const target = path.join(root, "target.js");
    fs.mkdirSync(stagedRoot); fs.mkdirSync(canonicalRoot); fs.writeFileSync(target, "target\n");
    fs.symlinkSync("../target.js", path.join(stagedRoot, "alias.js"));
    fs.symlinkSync(target, path.join(canonicalRoot, "alias.js"));
    const result = api.compareTrees(stagedRoot, canonicalRoot);
    assert.equal(result.equivalent, true); assert.equal(result.exactLinkText, false);
    assert.equal(result.symlinkLinkTextDifferences.length, 1); assert.equal(result.resolvedTargetMismatches.length, 0);
  });
  await test("tree comparison reports resolved symlink target mismatch", () => {
    const root = tempRoot("compare-resolved");
    const stagedRoot = path.join(root, "staged"); const canonicalRoot = path.join(root, "canonical");
    fs.mkdirSync(stagedRoot); fs.mkdirSync(canonicalRoot);
    fs.writeFileSync(path.join(root, "one"), "1"); fs.writeFileSync(path.join(root, "two"), "2");
    fs.symlinkSync("../one", path.join(stagedRoot, "alias")); fs.symlinkSync("../two", path.join(canonicalRoot, "alias"));
    const result = api.compareTrees(stagedRoot, canonicalRoot);
    assert.equal(result.equivalent, false); assert.equal(result.resolvedTargetMismatches.length, 1);
  });
  await test("tree comparison reports missing, extra and file-count drift independently", () => {
    const root = tempRoot("compare-shape");
    const stagedRoot = path.join(root, "staged"); const canonicalRoot = path.join(root, "canonical");
    fs.mkdirSync(stagedRoot); fs.mkdirSync(canonicalRoot);
    fs.writeFileSync(path.join(stagedRoot, "missing"), "m");
    fs.writeFileSync(path.join(stagedRoot, "shared"), "s");
    fs.writeFileSync(path.join(canonicalRoot, "shared"), "s");
    fs.writeFileSync(path.join(canonicalRoot, "extra1"), "e");
    fs.writeFileSync(path.join(canonicalRoot, "extra2"), "e");
    const result = api.compareTrees(stagedRoot, canonicalRoot);
    assert.deepEqual(result.missingPaths, ["missing"]); assert.deepEqual(result.extraPaths, ["extra1", "extra2"]);
    assert.deepEqual(result.fileCountDrift, { staged: 2, canonical: 3 });
  });

  await test("future model accepts only one fully verified durable three-tree release", () => {
    assert.equal(api.evaluateFutureTransaction(validTransactionModel()).acceptable, true);
  });
  await test("only one verified tree cannot be accepted", () => {
    const model = validTransactionModel();
    for (const family of ["devOutput", "extension"]) {
      Object.assign(model.trees[family], {
        state: "untouched", incomingPrepared: false, liveRetired: false, incomingPromoted: false, verified: false,
      });
    }
    assert.equal(api.evaluateFutureTransaction(model).acceptable, false);
  });
  await test("two new trees and one old generation cannot be accepted", () => {
    const model = validTransactionModel();
    model.trees.extension.activationId = "activation-old-1234";
    assert.match(api.evaluateFutureTransaction(model).reasons.join(" "), /generation-mismatch/u);
  });
  await test("promoted tree without previous-state record cannot be accepted", () => {
    const model = validTransactionModel(); delete model.trees.alias.previousState;
    assert.match(api.evaluateFutureTransaction(model).reasons.join(" "), /previous-state-missing/u);
  });
  await test("first activation must model restoration to absent", () => {
    const model = validTransactionModel();
    model.trees.alias.previousState = { kind: "absent", recorded: true };
    model.trees.alias.restoreOnFailure = "previous-tree";
    assert.match(api.evaluateFutureTransaction(model).reasons.join(" "), /restoration-not-absent/u);
  });
  await test("failure to durably write final receipt prevents acceptance", () => {
    const model = validTransactionModel(); model.finalReceiptDurable = false;
    assert.match(api.evaluateFutureTransaction(model).reasons.join(" "), /final-receipt-not-durable/u);
  });
  await test("unresolved durable journal prevents acceptance", () => {
    const model = validTransactionModel(); model.journalResolved = false;
    assert.match(api.evaluateFutureTransaction(model).reasons.join(" "), /journal-unresolved/u);
  });
  await test("contradictory per-tree state prevents acceptance", () => {
    const model = validTransactionModel(); model.trees.devOutput.incomingPromoted = false;
    assert.match(api.evaluateFutureTransaction(model).reasons.join(" "), /state-contradiction/u);
  });
  await test("whole-release rollback is mandatory", () => {
    const model = validTransactionModel(); model.rollbackScope = "single-tree";
    assert.match(api.evaluateFutureTransaction(model).reasons.join(" "), /whole-release-rollback-required/u);
  });
  await test("future namespace uses exact activation-specific incoming and retired names", () => {
    assert.deepEqual(api.futureSiblingNames("alias", "activation-12345678"), {
      incoming: "alias.staging-act-activation-12345678",
      previous: "alias.retired-act-activation-12345678",
    });
  });
  await test("future ownership rejects generic or foreign activation siblings", () => {
    assert.equal(api.ownsFutureSibling("alias.staging-act-activation-12345678", "alias", "activation-12345678"), true);
    assert.equal(api.ownsFutureSibling("alias.staging-act-other-12345678", "alias", "activation-12345678"), false);
    assert.equal(api.ownsFutureSibling("alias.staging-anything", "alias", "activation-12345678"), false);
  });
}

function runStructuralTests() {
  const source = fs.readFileSync(path.join(ROOT, ACTIVATOR_REL), "utf8");
  const validatorSource = fs.readFileSync(path.join(ROOT, VALIDATOR_REL), "utf8");
  structural("production activator contains no filesystem write call", () => {
    assert.doesNotMatch(source, /fs\.(?:writeFile|appendFile|mkdir|rm|unlink|rename|copyFile|symlink|link|chmod|chown)(?:Sync)?\s*\(/u);
  });
  structural("production activator contains no child-process spawn capability", () => {
    assert.doesNotMatch(source, /\bspawn(?:Sync)?\s*\(/u);
  });
  structural("production activator contains no network module import", () => {
    assert.doesNotMatch(source, /node:(?:http|https|net|tls|dns)|\bfetch\s*\(/u);
  });
  structural("production activator contains no git push invocation", () => {
    assert.doesNotMatch(source, /["'`]push["'`]/u);
  });
  structural("production activator contains no browser launch or reload API", () => {
    assert.doesNotMatch(source, /osascript|playwright|puppeteer|chrome\.runtime\.reload|open\s+-/iu);
  });
  structural("activation CLI returns activation-not-implemented before receipt verification", () => {
    const activation = source.indexOf('argv[0] === "--activate-receipt"');
    const verification = source.indexOf("return verifyStageReceipt");
    assert.ok(activation >= 0 && verification > activation);
  });
  structural("canonical comparison is exported but production canonical verification remains fixture-only", () => {
    assert.match(source, /export function compareTrees/u);
    assert.match(source, /canonical-verification-fixture-only/u);
  });
  structural("future transaction model explicitly requires whole-release rollback and durable receipt", () => {
    assert.match(source, /rollbackScope !== "whole-release"/u);
    assert.match(source, /finalReceiptDurable !== true/u);
  });
  structural("future release is described as recoverable rather than cross-tree atomic", () => {
    assert.match(source, /transactionally recoverable three-tree promotion/u);
    assert.match(source, /It is not a/u);
    assert.match(source, /cross-tree atomic swap/u);
    assert.match(source, /do not eliminate missing-path/u);
  });
  structural("future coordination namespaces are activation-id specific", () => {
    assert.match(source, /\.staging-act-\$\{activationId\}/u);
    assert.match(source, /\.retired-act-\$\{activationId\}/u);
  });
  structural("P1 reuses the Batch 1 publisher lock name without lock-purpose metadata", () => {
    assert.match(source, /\.h2o-publisher-lock/u);
    assert.doesNotMatch(source, /lockPurpose|purpose:\s*["'`]activation/iu);
  });
  structural("package exposes only read-only Stage 2 command", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, PACKAGE_REL), "utf8"));
    assert.equal(packageJson.scripts["publish:h2o:verify-stage"],
      "node tools/publish/lean-activator.mjs --verify-stage-receipt");
    assert.equal(Object.keys(packageJson.scripts).some((name) => /activate|rollback|recover|prune/u.test(name)), false);
  });
  structural("production activator is byte-identical to accepted P0/P1", () => {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, ACTIVATOR_REL))), ACCEPTED_ACTIVATOR_SHA256);
    assert.equal(sha256(execFileSync("git", ["show", `${ACCEPTED_P1_HEAD}:${ACTIVATOR_REL}`], { cwd: ROOT })),
      ACCEPTED_ACTIVATOR_SHA256);
  });
  structural("registered-main authority is internally derived from Git ancestry and exact scope", () => {
    assert.equal(authoritativeMainWorktree.length, 0);
    assert.match(validatorSource, /merge-base["'`],\s*["'`]--is-ancestor/u);
    assert.match(validatorSource, /const executionState = currentScopeState\(\)/u);
    assert.match(validatorSource, /classifyScope\(executionState\)/u);
  });
  assert.equal(structuralResults.length, EXPECTED_STRUCTURAL);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length) throw new Error(`Unknown validator arguments: ${args.join(" ")}`);
  runScopeTests();
  const scopeMode = classifyScope(currentScopeState());
  const api = await import(`${pathToFileURL(path.join(ROOT, ACTIVATOR_REL)).href}?validator=${Date.now()}`);
  await runAuthorityModelTests();
  await runRuntimeTests(api);
  runStructuralTests();
  assert.equal(runtimeResults.length, EXPECTED_RUNTIME);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    validator: VALIDATOR_REL,
    scopeMode,
    scopeScenarios: scopeResults.length,
    runtimeScenarios: runtimeResults.length,
    structuralAssertions: structuralResults.length,
    activationImplemented: false,
    canonicalProductionInspected: false,
    transactionDescription: "transactionally recoverable three-tree promotion",
  })}\n`);
}

try {
  await main();
} finally {
  for (const root of temporaryRoots.reverse()) {
    try {
      const stat = fs.lstatSync(root);
      if (!stat.isSymbolicLink() && path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    } catch {
      // Fixture cleanup must not mask validation evidence.
    }
  }
}
