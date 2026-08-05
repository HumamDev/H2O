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
import { assertDeliveryWritePermitted } from "../../publish/canonical-write-guard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const GUARD_REL = "tools/publish/canonical-write-guard.mjs";
const ALIAS_WRITER_REL = "tools/loader/make-aliases.mjs";
/**
 * The exact production writers that may reach a canonical delivery destination.
 *
 * Each entry is a committed writer that imports `canonical-write-guard.mjs` and
 * calls `assertDeliveryWritePermitted` under its own distinct purpose before
 * writing. The set is EXACT, not a minimum: an unguarded writer, a removed
 * writer, a duplicate, or an alternate spelling all fail closed.
 *
 * Sorted deterministically. Grew from the alias writer alone (3ce2264a) to the
 * full surface across 0e2eb8ed, b51b2108, b4f5e730 and c7321797, all of which
 * descend from the commit that first wrote this pin.
 */
const GUARDED_DELIVERY_WRITERS = Object.freeze([
  ALIAS_WRITER_REL,
  "tools/loader/make-ext-proxy-pack.mjs",
  "tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs",
  "tools/product/extensions/chatgpt/chrome/pack-desk.mjs",
  "tools/product/extensions/chatgpt/chrome/pack-ops-panel.mjs",
  "tools/product/identity/build-identity-provider-bundle.mjs",
].sort());
const GUARDED_WRITER_PURPOSES = Object.freeze({
  "tools/loader/make-aliases.mjs": "make-aliases",
  "tools/loader/make-ext-proxy-pack.mjs": "make-ext-proxy-pack",
  "tools/product/extensions/chatgpt/chrome/build-chrome-live-extension.mjs": "build-chrome-live-extension",
  "tools/product/extensions/chatgpt/chrome/pack-desk.mjs": "pack-desk",
  "tools/product/extensions/chatgpt/chrome/pack-ops-panel.mjs": "pack-ops-panel",
  "tools/product/identity/build-identity-provider-bundle.mjs": "identity-provider-bundle",
});

/**
 * Pure classifier for an observed guarded-writer surface. Fails closed on a
 * missing writer, an unknown writer, a duplicate, and any non-canonical path
 * spelling. Never tolerant, never minimum-based.
 */
function classifyGuardedWriterSet(observed) {
  if (!Array.isArray(observed)) return "writer-set-invalid";
  if (observed.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    return "writer-set-invalid";
  }
  for (const entry of observed) {
    if (entry !== path.normalize(entry) || path.isAbsolute(entry) || entry.includes("./")) {
      return "writer-path-spelling-rejected";
    }
  }
  if (new Set(observed).size !== observed.length) return "writer-duplicate-rejected";
  const accepted = new Set(GUARDED_DELIVERY_WRITERS);
  const unknown = observed.filter((entry) => !accepted.has(entry));
  if (unknown.length) return "writer-not-accepted";
  const missing = GUARDED_DELIVERY_WRITERS.filter((entry) => !observed.includes(entry));
  if (missing.length) return "writer-missing";
  return "writer-set-exact";
}

/**
 * Pure classifier for observed Title identities. Fails closed on a changed
 * digest, a missing identity and an extra identity, so no Title file can be
 * silently added to or dropped from the governed set.
 */
function classifyTitleIdentities(observed) {
  if (!observed || typeof observed !== "object") return "title-identities-invalid";
  const accepted = Object.keys(ACCEPTED_TITLE_IDENTITIES).sort();
  const seen = Object.keys(observed).sort();
  if (seen.length !== accepted.length || seen.some((entry, index) => entry !== accepted[index])) {
    return "title-identity-set-mismatch";
  }
  for (const relative of accepted) {
    if (observed[relative] !== ACCEPTED_TITLE_IDENTITIES[relative]) return "title-identity-changed";
  }
  return "title-identities-exact";
}
const VALIDATOR_REL =
  "tools/validation/publish/validate-canonical-writer-enforcement-v1.mjs";
const ADR_REL =
  "docs/decisions/ADR-0013-canonical-generated-delivery-ownership.md";
const FINAL_PATHS = Object.freeze([
  GUARD_REL,
  ALIAS_WRITER_REL,
  VALIDATOR_REL,
  ADR_REL,
]);
const UNCOMMITTED_MODIFIED = Object.freeze([ALIAS_WRITER_REL, ADR_REL]);
const UNCOMMITTED_UNTRACKED = Object.freeze([GUARD_REL, VALIDATOR_REL]);
const EXPECTED_RUNTIME_SCENARIOS = 56;
const EXPECTED_SCOPE_SCENARIOS = 12;
const ALIAS_WRITER = path.join(ROOT, ALIAS_WRITER_REL);
const E1_VALIDATOR_REL =
  "tools/validation/publish/validate-canonical-delivery-exclusivity-v1.mjs";
// The pre-existing path that forms the fixture's baseline parent commit; the
// remaining snapshot paths are what the accepted E1 commit introduces.
const E1_BASELINE_PATH = ".gitignore";
// The floor is the count accepted when this pin was written; the exact values
// are what the E1 foundation reports today. The foundation may grow, never shrink.
const E1_RUNTIME_FLOOR = 81;
const E1_SCOPE_FLOOR = 12;
const E1_RUNTIME_SCENARIOS = 88;
const E1_SCOPE_SCENARIOS = 16;
const E1_SNAPSHOT_PATHS = Object.freeze([
  E1_BASELINE_PATH,
  "docs/decisions/ADR-0013-canonical-generated-delivery-ownership.md",
  "tools/publish/canonical-delivery-lib.mjs",
  "tools/publish/canonical-delivery.mjs",
  E1_VALIDATOR_REL,
]);
const ACCEPTED_TITLE_IDENTITIES = Object.freeze({
  "packages/title-contract/index.mjs":
    "57f3fe783b5253d07dafcd7ec4c89b75602337b86d83033ed52fbcc104097b0d",
  // Refreshed for accepted Title Stage 1F (102c77c2, "enable three-surface
  // titles by default"); the previous value was correct at Stage 1D (61a7b51a).
  "src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js":
    "8f650b52458b81ff0f7a267b58ab319d571e7516dc6e66f0e7e756b91328bfe7",
  "tools/product/extensions/chatgpt/chrome/title-contract/make-title-contract-bridge.mjs":
    "240b95a7682ad7c26ac1463aba7f74e039ad9e68c9ffd5d3fbd3ff66cb37623f",
  "tools/validation/title-interface/validate-title-contract-bridge-v1.mjs":
    "f81e1f6c209939e6bd036ecc4fb854658c7c5fd0944f36774d8b7126f6fa3469",
  // Refreshed for accepted Title work 5d1bc9dc ("preserve title convergence on
  // rollback"); the previous value was correct at Stage 1D (61a7b51a).
  "tools/validation/title-interface/validate-title-stage1c-formatter-parity.mjs":
    "4c65f6de9aeab6af1fe21b766b6318df358917ec3d3fa8d4b267cbc07beede1f",
});
const GENERATED_PATHS = Object.freeze([
  "apps/extensions/chatgpt/chrome/dev-controls-oauth-google/title-contract-bridge.js",
  "apps/extensions/chatgpt/chrome/dev-controls-oauth-google/loader.js",
  "apps/dev-server/dev_output/proxy/_paste-pack.ext.txt",
  "apps/extensions/chatgpt/chrome/dev-controls-oauth-google/manifest.json",
]);

const runtimeResults = [];
const scopeResults = [];
const temporaryRoots = new Set();
let canonicalFailureChecks = 0;
let capturedTokenRedaction = true;
let e1Regression = null;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 12_000,
    killSignal: "SIGTERM",
    ...options,
  });
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
    path.join(os.tmpdir(), `h2o-stage1de2a-${label}-`),
  );
  temporaryRoots.add(root);
  return root;
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

export function classifyStage1DE2AScope(state) {
  const normalized = {
    modifiedTracked: sorted(state.modifiedTracked ?? []),
    staged: sorted(state.staged ?? []),
    untracked: sorted(
      (state.untracked ?? []).filter((item) => !item.startsWith("chrome/")),
    ),
    trackedFinal: sorted(state.trackedFinal ?? []),
    missingFinal: sorted(state.missingFinal ?? []),
  };
  if (normalized.staged.length) {
    scopeFailure("Stage 1D-E2A scope forbids staged paths", normalized);
  }
  const uncommitted =
    sameSet(normalized.modifiedTracked, UNCOMMITTED_MODIFIED) &&
    sameSet(normalized.untracked, UNCOMMITTED_UNTRACKED) &&
    normalized.missingFinal.length === 0;
  if (uncommitted) return "uncommitted";
  const committed =
    normalized.modifiedTracked.length === 0 &&
    normalized.untracked.length === 0 &&
    normalized.missingFinal.length === 0 &&
    sameSet(normalized.trackedFinal, FINAL_PATHS);
  if (committed) return "committed-clean";
  scopeFailure("Stage 1D-E2A scope mismatch", normalized);
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
    untracked: [...UNCOMMITTED_UNTRACKED, "chrome/protected"],
    trackedFinal: [ALIAS_WRITER_REL, ADR_REL],
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
  scopeTest("exact E2A uncommitted scope is accepted", () => {
    assert.equal(classifyStage1DE2AScope(baseScope()), "uncommitted");
  });
  scopeTest("exact E2A committed-clean scope is accepted", () => {
    assert.equal(
      classifyStage1DE2AScope(
        baseScope({
          modifiedTracked: [],
          untracked: ["chrome/protected"],
          trackedFinal: [...FINAL_PATHS],
        }),
      ),
      "committed-clean",
    );
  });
  scopeTest("staging is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({ staged: [ALIAS_WRITER_REL] }),
        ),
      /forbids staged/u,
    );
  });
  scopeTest("missing writer modification is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({ modifiedTracked: [ADR_REL] }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("missing ADR modification is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({ modifiedTracked: [ALIAS_WRITER_REL] }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("partial new-file set is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({ untracked: [GUARD_REL] }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("foreign tracked modification is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({
            modifiedTracked: [...UNCOMMITTED_MODIFIED, "package.json"],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("foreign untracked file is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({
            untracked: [...UNCOMMITTED_UNTRACKED, "scratch.log"],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("missing final path is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({ missingFinal: [GUARD_REL] }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("validator self-exclusion is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({ untracked: [GUARD_REL] }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("mixed post-commit worktree is rejected", () => {
    assert.throws(
      () =>
        classifyStage1DE2AScope(
          baseScope({
            modifiedTracked: [ALIAS_WRITER_REL],
            untracked: [],
            trackedFinal: [...FINAL_PATHS],
          }),
        ),
      /scope mismatch/u,
    );
  });
  scopeTest("protected chrome paths are ignored narrowly", () => {
    assert.equal(
      classifyStage1DE2AScope(
        baseScope({
          untracked: [...UNCOMMITTED_UNTRACKED, "chrome/nested/protected"],
        }),
      ),
      "uncommitted",
    );
  });
  assert.equal(scopeResults.length, EXPECTED_SCOPE_SCENARIOS);
}

async function test(name, fn) {
  await fn();
  runtimeResults.push(name);
  process.stdout.write(`ok ${runtimeResults.length} - ${name}\n`);
}

function createFixture(label, { linkedWorktree = false } = {}) {
  const top = temporaryRoot(label);
  const cockpit = path.join(top, "cockpit-pro");
  const repository = path.join(cockpit, "h2o-cp-source");
  fs.mkdirSync(path.join(repository, "src-runtime-base"), { recursive: true });
  fs.mkdirSync(path.join(repository, "config"), { recursive: true });
  fs.mkdirSync(
    path.join(
      repository,
      "apps/extensions/chatgpt/chrome/dev-controls-oauth-google",
    ),
    { recursive: true },
  );
  fs.writeFileSync(
    path.join(repository, "src-runtime-base/1C1a. Turn Title Bar.js"),
    "globalThis.__turnTitleBar = true;\n",
  );
  fs.writeFileSync(
    path.join(repository, "src-runtime-base/9Z9z. Sandbox Probe.js"),
    "globalThis.__sandboxProbe = true;\n",
  );
  fs.writeFileSync(
    path.join(repository, "config/dev-order.tsv"),
    "ON\t1C1a. Turn Title Bar.js\nON\t9Z9z. Sandbox Probe.js\n",
  );
  git(repository, ["init", "-b", "main"]);
  git(repository, ["config", "user.name", "E2A Validator"]);
  git(repository, ["config", "user.email", "e2a-validator@example.invalid"]);
  git(repository, ["add", "--", "src-runtime-base", "config"]);
  git(repository, ["commit", "-m", "sandbox source"]);
  const localServer = path.join(top, "local-server");
  fs.mkdirSync(localServer, { recursive: true });
  const canonicalServer = path.join(repository, "apps/dev-server");
  const canonicalAlias = path.join(canonicalServer, "alias");
  fs.mkdirSync(canonicalAlias, { recursive: true });
  fs.writeFileSync(path.join(canonicalAlias, "sentinel.txt"), "unchanged\n");
  let foreignWorktree = null;
  if (linkedWorktree) {
    foreignWorktree = path.join(cockpit, "worktrees", `foreign-${label}`);
    fs.mkdirSync(path.dirname(foreignWorktree), { recursive: true });
    git(repository, [
      "worktree",
      "add",
      "--detach",
      foreignWorktree,
      "HEAD",
    ]);
  }
  return {
    top,
    cockpit,
    repository,
    localServer,
    canonicalServer,
    canonicalAlias,
    foreignWorktree,
  };
}

function createUnrelatedRepository(fixture, label) {
  const repository = path.join(fixture.top, `unrelated-${label}`);
  fs.mkdirSync(path.join(repository, "src-runtime-base"), { recursive: true });
  fs.mkdirSync(path.join(repository, "config"), { recursive: true });
  for (const relative of [
    "src-runtime-base/1C1a. Turn Title Bar.js",
    "src-runtime-base/9Z9z. Sandbox Probe.js",
    "config/dev-order.tsv",
  ]) {
    fs.copyFileSync(
      path.join(fixture.repository, relative),
      path.join(repository, relative),
    );
  }
  git(repository, ["init", "-b", "main"]);
  git(repository, ["config", "user.name", "E2A Validator"]);
  git(repository, ["config", "user.email", "e2a-validator@example.invalid"]);
  git(repository, ["add", "--", "src-runtime-base", "config"]);
  git(repository, ["commit", "-m", "unrelated sandbox source"]);
  return repository;
}

function aliasEnvironment(fixture, {
  cwd = fixture.repository,
  serverDir = fixture.localServer,
  overrides = {},
} = {}) {
  const environment = {
    ...process.env,
    H2O_SRC_DIR: cwd,
    H2O_SERVER_DIR: serverDir,
    H2O_ORDER_FILE: path.join(cwd, "config/dev-order.tsv"),
    H2O_ALIAS_MODE: "symlink",
    H2O_ALIAS_SCOPE: "all",
    ...overrides,
  };
  for (const name of [
    "H2O_CANONICAL_DELIVERY_ROOT",
    "H2O_CANONICAL_DELIVERY_TOKEN",
    "H2O_DELIVERY_SESSION_ID",
    "H2O_DELIVERY_APPROVED_HEAD",
    "H2O_BUILD_TS",
  ]) {
    if (overrides[name] === undefined) delete environment[name];
  }
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
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}

async function runAliasWriter(fixture, options = {}) {
  const cwd = options.cwd ?? fixture.repository;
  return managedChild(process.execPath, [ALIAS_WRITER], {
    cwd,
    env: aliasEnvironment(fixture, {
      cwd,
      serverDir: options.serverDir ?? fixture.localServer,
      overrides: options.overrides ?? {},
    }),
  });
}

function snapshotPath(target) {
  if (!fs.existsSync(target) && !fs.lstatSync(path.dirname(target)).isDirectory()) {
    return { exists: false };
  }
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false };
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
    result.entries = fs.readdirSync(target).sort().map((name) => ({
      name,
      value: snapshotPath(path.join(target, name)),
    }));
  }
  return result;
}

function snapshotGenerated(paths = GENERATED_PATHS) {
  const result = {};
  for (const relative of paths) {
    const absolute = path.join(ROOT, relative);
    result[relative] = snapshotPath(absolute);
  }
  return result;
}

function acquireCanonicalLease(fixture, {
  nowMs = Date.now(),
  ttlMs = 4 * 60 * 60 * 1000,
  purpose = "make-aliases",
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

async function rejectedAliasCase(label, {
  prepare,
  cwd,
  serverDir,
  overrides,
  snapshotTarget,
  expectedExit,
  expectedText,
  linkedWorktree = false,
} = {}) {
  const fixture = createFixture(label, { linkedWorktree });
  const prepared = prepare ? await prepare(fixture) : {};
  const effectiveCwd =
    typeof cwd === "function" ? cwd(fixture, prepared) : cwd ?? fixture.repository;
  const effectiveServer =
    typeof serverDir === "function"
      ? serverDir(fixture, prepared)
      : serverDir ?? fixture.canonicalServer;
  const effectiveOverrides =
    typeof overrides === "function"
      ? overrides(fixture, prepared)
      : overrides ?? {};
  const effectiveSnapshotTarget =
    typeof snapshotTarget === "function"
      ? snapshotTarget(fixture, prepared)
      : snapshotTarget ?? fixture.canonicalAlias;
  const before = snapshotPath(effectiveSnapshotTarget);
  const result = await runAliasWriter(fixture, {
    cwd: effectiveCwd,
    serverDir: effectiveServer,
    overrides: effectiveOverrides,
  });
  const after = snapshotPath(effectiveSnapshotTarget);
  assert.equal(result.timedOut, false);
  assert.equal(result.code, expectedExit);
  assert.equal(JSON.stringify(after), JSON.stringify(before));
  if (expectedText) {
    assert.match(`${result.stdout}\n${result.stderr}`, expectedText);
  }
  const token = prepared.acquisition?.ownershipToken;
  if (token) {
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(output.includes(token), false);
    capturedTokenRedaction &&= !output.includes(token);
  }
  canonicalFailureChecks += 1;
  return { fixture, prepared, result, before, after };
}

function structuralGuardOrdering(source) {
  const importIndex = source.indexOf(
    'import { assertDeliveryWritePermitted } from "../publish/canonical-write-guard.mjs";',
  );
  const callIndex = source.indexOf("assertDeliveryWritePermitted({");
  const mkdirIndex = source.indexOf("fs.mkdirSync(ALIAS_DIR");
  return {
    importIndex,
    callIndex,
    mkdirIndex,
    valid:
      importIndex >= 0 &&
      callIndex > importIndex &&
      mkdirIndex > callIndex,
  };
}

function statusSnapshot(repository = ROOT) {
  return {
    head: git(repository, ["rev-parse", "HEAD"]),
    status: git(repository, [
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ])
      .split("\n")
      .filter((line) => line && !line.includes("chrome/"))
      .sort(),
    staged: lines(
      git(repository, ["diff", "--cached", "--name-only", "--"]),
    ),
  };
}

function worktreeSnapshot() {
  const records = [];
  const blocks = git(ROOT, ["worktree", "list", "--porcelain"])
    .split(/\n\n/u)
    .filter(Boolean);
  for (const block of blocks) {
    const worktree = block
      .split("\n")
      .find((line) => line.startsWith("worktree "))
      ?.slice("worktree ".length);
    if (!worktree || worktree === ROOT) continue;
    if (!fs.existsSync(worktree)) {
      records.push({
        worktree,
        missing: true,
        head: null,
        trackedStatus: null,
      });
      continue;
    }
    records.push({
      worktree,
      missing: false,
      head: git(worktree, ["rev-parse", "HEAD"]),
      trackedStatus: git(worktree, [
        "status",
        "--porcelain=v1",
        "--untracked-files=no",
      ]),
    });
  }
  return records;
}

/**
 * Materialize the accepted E1 snapshot as a disposable two-commit repository.
 *
 * The nested Stage 1D-E1 validator reads `HEAD^` while collecting scope state,
 * so a root commit made that collection throw before its enforcement scenarios
 * could run. The fixture therefore reproduces the real E1 shape: a baseline
 * commit carrying only the pre-existing `.gitignore`, then the E1 commit that
 * introduces the four new delivery paths. That is exactly the authority model
 * the nested validator encodes (`UNCOMMITTED_MODIFIED` = the gitignore,
 * `UNCOMMITTED_UNTRACKED` = the new paths), and it still classifies as
 * `committed-clean`. No tolerance for root commits is added anywhere.
 */
function materializeCleanE1Snapshot() {
  const top = temporaryRoot("e1-clean");
  const repository = path.join(top, "cockpit-pro", "h2o-cp-source");
  fs.mkdirSync(repository, { recursive: true });
  const writeSnapshotPath = (relative) => {
    const target = path.join(repository, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const bytes = execFileSync("git", ["show", `HEAD:${relative}`], {
      cwd: ROOT,
      encoding: null,
      timeout: 8_000,
    });
    fs.writeFileSync(target, bytes);
  };
  git(repository, ["init", "-b", "main"]);
  git(repository, ["config", "user.name", "E2A Validator"]);
  git(repository, ["config", "user.email", "e2a-validator@example.invalid"]);
  // Baseline parent: the pre-existing ignore policy, before E1 delivery.
  writeSnapshotPath(E1_BASELINE_PATH);
  git(repository, ["add", "--", E1_BASELINE_PATH]);
  git(repository, ["commit", "-m", "baseline before accepted E1 delivery"]);
  // The intended E1 test commit, applied on top of a real parent.
  for (const relative of E1_SNAPSHOT_PATHS) {
    if (relative === E1_BASELINE_PATH) continue;
    writeSnapshotPath(relative);
  }
  git(repository, ["add", "--", "."]);
  git(repository, ["commit", "-m", "accepted E1 snapshot"]);
  return repository;
}

async function runRuntimeScenarios() {
  const initialRepository = statusSnapshot();
  const initialGenerated = snapshotGenerated();
  const liveAliasPath = path.join(ROOT, "apps/dev-server/alias");
  const initialLiveAliases = snapshotPath(liveAliasPath);
  const initialWorktrees = worktreeSnapshot();
  const realAnchor = deriveSharedAnchor({
    cwd: ROOT,
    env: {},
    allowOverride: false,
  }).root;
  const realAnchorInitiallyAbsent = !fs.existsSync(realAnchor);

  let localFixture;
  let localResult;
  let localGuardResult;

  await test("LOCAL guard permits without token", () => {
    localFixture = createFixture("local");
    localGuardResult = assertDeliveryWritePermitted({
      destination: path.join(localFixture.localServer, "alias"),
      purpose: "make-aliases",
      environment: {},
      cwd: localFixture.repository,
    });
    assert.equal(localGuardResult.classification, "LOCAL");
    assert.equal(localGuardResult.canonicalSession, null);
    assert.equal(localGuardResult.liveWritePermitted, false);
  });
  await test("LOCAL guard result is frozen", () => {
    assert.equal(Object.isFrozen(localGuardResult), true);
  });
  await test("LOCAL guard result exposes no token material", () => {
    const encoded = JSON.stringify(localGuardResult);
    assert.doesNotMatch(encoded, /token|sha256/iu);
  });
  await test("worktree-local alias generation succeeds without token", async () => {
    localResult = await runAliasWriter(localFixture);
    assert.equal(localResult.code, 0, localResult.stderr);
  });
  await test("local alias generation produces direct links", () => {
    const alias = path.join(
      localFixture.localServer,
      "alias/9Z9z._Sandbox_Probe_.js",
    );
    assert.equal(fs.lstatSync(alias).isSymbolicLink(), true);
    assert.equal(
      fs.realpathSync(alias),
      fs.realpathSync(
        path.join(
          localFixture.repository,
          "src-runtime-base/9Z9z. Sandbox Probe.js",
        ),
      ),
    );
  });
  await test("local compatibility alias chains remain valid", () => {
    const aliasRoot = path.join(localFixture.localServer, "alias");
    const current = path.join(aliasRoot, "1C1a._Turn_Title_Bar_.js");
    const legacy = path.join(aliasRoot, "1E1a._Answer_Title_.js");
    assert.equal(fs.lstatSync(current).isSymbolicLink(), true);
    assert.equal(fs.lstatSync(legacy).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(legacy), fs.realpathSync(current));
  });
  await test("LOCAL operation creates no canonical anchor", () => {
    const anchor = deriveSharedAnchor({
      cwd: localFixture.repository,
      env: {},
      allowOverride: false,
    }).root;
    assert.equal(fs.existsSync(anchor), false);
  });
  await test("duplicate trusted-writer and destination-owner observations deduplicate", () => {
    assert.throws(
      () =>
        assertDeliveryWritePermitted({
          destination: liveAliasPath,
          purpose: "make-aliases",
          environment: {},
          cwd: localFixture.repository,
        }),
      (error) =>
        error.exitCode === EXIT_CODES.ABSENT_OR_CONTENDED &&
        /canonical-delivery-lease-absent/u.test(error.message),
    );
  });
  await test("foreign worktree-local output remains LOCAL and succeeds", async () => {
    const fixture = createFixture("foreign-local", { linkedWorktree: true });
    const server = path.join(fixture.foreignWorktree, ".sandbox-server");
    fs.mkdirSync(server);
    const result = await runAliasWriter(fixture, {
      cwd: fixture.foreignWorktree,
      serverDir: server,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      fs.lstatSync(path.join(server, "alias/9Z9z._Sandbox_Probe_.js"))
        .isSymbolicLink(),
      true,
    );
  });
  await test("unrelated repository cwd cannot bypass canonical lease absence", async () => {
    await rejectedAliasCase("unrelated-absent", {
      prepare: (fixture) => ({
        unrelated: createUnrelatedRepository(fixture, "caller"),
      }),
      cwd: (_fixture, prepared) => prepared.unrelated,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /canonical-delivery-lease-absent/u,
    });
  });
  await test("destination-owner lease under unrelated cwd reaches E2 terminal rule", async () => {
    await rejectedAliasCase("unrelated-valid-owner", {
      prepare: (fixture) => ({
        ...acquireCanonicalLease(fixture),
        unrelated: createUnrelatedRepository(fixture, "caller"),
      }),
      cwd: (_fixture, prepared) => prepared.unrelated,
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_SESSION_ID: prepared.acquisition.lease.sessionId,
        H2O_DELIVERY_APPROVED_HEAD: prepared.acquisition.lease.approvedHead,
        H2O_BUILD_TS: prepared.acquisition.lease.buildTs,
      }),
      expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
      expectedText: /canonical-live-write-disabled-until-stage-e3/u,
    });
  });
  await test("unrelated caller lease cannot authorize destination owner", async () => {
    const checked = await rejectedAliasCase("unrelated-wrong-owner-lease", {
      prepare: (fixture) => {
        const unrelated = createUnrelatedRepository(fixture, "caller");
        const callerLease = acquireCanonicalLease({
          repository: unrelated,
        });
        const destinationAnchor = deriveSharedAnchor({
          cwd: fixture.repository,
          env: {},
          allowOverride: false,
        });
        return {
          unrelated,
          anchor: callerLease.anchor,
          acquisition: callerLease.acquisition,
          destinationAnchor,
        };
      },
      cwd: (_fixture, prepared) => prepared.unrelated,
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /canonical-delivery-lease-absent/u,
    });
    assert.notEqual(
      checked.prepared.anchor.root,
      checked.prepared.destinationAnchor.root,
    );
    assert.equal(fs.existsSync(checked.prepared.anchor.root), true);
    assert.equal(fs.existsSync(checked.prepared.destinationAnchor.root), false);
  });
  await test("outside-repository LOCAL output remains token-free under unrelated cwd", async () => {
    const fixture = createFixture("unrelated-outside-local");
    const unrelated = createUnrelatedRepository(fixture, "caller");
    const server = path.join(fixture.top, "outside-local-server");
    fs.mkdirSync(server);
    const callerAnchor = deriveSharedAnchor({
      cwd: unrelated,
      env: {},
      allowOverride: false,
    }).root;
    const destinationOwnerAnchor = deriveSharedAnchor({
      cwd: fixture.repository,
      env: {},
      allowOverride: false,
    }).root;
    const result = await runAliasWriter(fixture, {
      cwd: unrelated,
      serverDir: server,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      fs.lstatSync(path.join(server, "alias/9Z9z._Sandbox_Probe_.js"))
        .isSymbolicLink(),
      true,
    );
    assert.equal(fs.existsSync(callerAnchor), false);
    assert.equal(fs.existsSync(destinationOwnerAnchor), false);
  });
  await test("unrelated cwd symlink redirection to canonical is rejected", async () => {
    await rejectedAliasCase("unrelated-canonical-symlink", {
      prepare: (fixture) => {
        const unrelated = createUnrelatedRepository(fixture, "caller");
        const spelling = path.join(fixture.top, "canonical-server-link");
        fs.symlinkSync(fixture.canonicalServer, spelling);
        return { unrelated, spelling };
      },
      cwd: (_fixture, prepared) => prepared.unrelated,
      serverDir: (_fixture, prepared) => prepared.spelling,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /canonical-delivery-lease-absent/u,
    });
  });
  await test("unrelated cwd missing canonical descendant is rejected", async () => {
    await rejectedAliasCase("unrelated-missing-canonical", {
      prepare: (fixture) => ({
        unrelated: createUnrelatedRepository(fixture, "caller"),
      }),
      cwd: (_fixture, prepared) => prepared.unrelated,
      serverDir: (fixture) =>
        path.join(fixture.canonicalAlias, "missing-server"),
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /canonical-delivery-lease-absent/u,
    });
  });
  await test("nested repository cannot hide outer canonical ownership", async () => {
    await rejectedAliasCase("nested-repository-outer-wins", {
      prepare: (fixture) => {
        git(fixture.canonicalServer, ["init", "-b", "main"]);
        return {
          unrelated: createUnrelatedRepository(fixture, "caller"),
        };
      },
      cwd: (_fixture, prepared) => prepared.unrelated,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /canonical-delivery-lease-absent/u,
    });
  });
  await test("malformed detected repository boundary fails closed", async () => {
    await rejectedAliasCase("malformed-repository-boundary", {
      prepare: (fixture) => {
        const unrelated = createUnrelatedRepository(fixture, "caller");
        const boundary = path.join(fixture.top, "malformed-boundary");
        const server = path.join(boundary, "server");
        fs.mkdirSync(server, { recursive: true });
        fs.writeFileSync(path.join(boundary, ".git"), "not-a-gitdir\n");
        return { unrelated, boundary, server };
      },
      cwd: (_fixture, prepared) => prepared.unrelated,
      serverDir: (_fixture, prepared) => prepared.server,
      snapshotTarget: (_fixture, prepared) => prepared.server,
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /destination-repository-context-invalid/u,
    });
  });
  await test("multiple distinct canonical owners fail closed as ambiguous", async () => {
    await rejectedAliasCase("canonical-owner-ambiguity", {
      prepare: (fixture) => {
        git(fixture.canonicalAlias, ["init", "-b", "main"]);
        return {
          unrelated: createUnrelatedRepository(fixture, "caller"),
          nestedRepository: fixture.canonicalAlias,
        };
      },
      cwd: (_fixture, prepared) => prepared.unrelated,
      serverDir: (_fixture, prepared) =>
        path.join(prepared.nestedRepository, "apps/dev-server"),
      expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
      expectedText: /canonical-delivery-owner-ambiguity/u,
    });
  });
  await test("standalone repository owns its own canonical alias destination", async () => {
    await rejectedAliasCase("standalone-own-canonical", {
      prepare: (fixture) => ({
        unrelated: createUnrelatedRepository(fixture, "owner"),
      }),
      cwd: (_fixture, prepared) => prepared.unrelated,
      serverDir: (_fixture, prepared) =>
        path.join(prepared.unrelated, "apps/dev-server"),
      snapshotTarget: (_fixture, prepared) =>
        path.join(prepared.unrelated, "apps"),
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /canonical-delivery-lease-absent/u,
    });
  });
  await test("canonical alias without lease fails before mutation", async () => {
    await rejectedAliasCase("absent", {
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /canonical-delivery-lease-absent/u,
    });
  });
  await test("direct make-aliases invocation is protected", async () => {
    const checked = await rejectedAliasCase("direct", {
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /alias write guard rejected/u,
    });
    assert.equal(checked.result.stdout, "");
  });
  await test("canonical lease with missing token fails before mutation", async () => {
    await rejectedAliasCase("missing-token", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      expectedExit: EXIT_CODES.TOKEN_INVALID,
      expectedText: /ownership token is missing or invalid/u,
    });
  });
  await test("canonical lease with wrong token fails before mutation", async () => {
    await rejectedAliasCase("wrong-token", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: {
        H2O_CANONICAL_DELIVERY_TOKEN: "x".repeat(43),
      },
      expectedExit: EXIT_CODES.TOKEN_INVALID,
      expectedText: /ownership token is missing or invalid/u,
    });
  });
  await test("expired canonical lease fails before mutation", async () => {
    await rejectedAliasCase("expired", {
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
  await test("changed HEAD fails before mutation", async () => {
    await rejectedAliasCase("changed-head", {
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture);
        fs.writeFileSync(path.join(fixture.repository, "head-drift.txt"), "drift\n");
        git(fixture.repository, ["add", "--", "head-drift.txt"]);
        git(fixture.repository, ["commit", "-m", "head drift"]);
        return prepared;
      },
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /approvedHead/u,
    });
  });
  await test("wrong worktree fails before mutation", async () => {
    await rejectedAliasCase("wrong-worktree", {
      linkedWorktree: true,
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture);
        const metadataPath = path.join(
          prepared.anchor.root,
          "active-lease/lease.json",
        );
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        metadata.publisherWorktreeRoot = fixture.foreignWorktree;
        fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
        return prepared;
      },
      cwd: (fixture) => fixture.foreignWorktree,
      serverDir: (fixture) => fixture.canonicalServer,
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /publisherWorktreeRoot/u,
    });
  });
  await test("wrong repository identity fails before mutation", async () => {
    await rejectedAliasCase("wrong-repository", {
      prepare: (fixture) => {
        const prepared = acquireCanonicalLease(fixture);
        const metadataPath = path.join(
          prepared.anchor.root,
          "active-lease/lease.json",
        );
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        metadata.publisherRepositoryRoot = path.join(
          fixture.top,
          "wrong-repository",
        );
        fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
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
  await test("wrong expected session assertion fails before mutation", async () => {
    await rejectedAliasCase("wrong-session", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_SESSION_ID: "00000000-0000-4000-8000-000000000000",
      }),
      expectedExit: EXIT_CODES.VERIFICATION_MISMATCH,
      expectedText: /session-assertion-mismatch/u,
    });
  });
  await test("wrong approved HEAD assertion fails before mutation", async () => {
    await rejectedAliasCase("wrong-approved-head", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_APPROVED_HEAD: "f".repeat(40),
      }),
      expectedExit: EXIT_CODES.ELIGIBILITY_MISMATCH,
      expectedText: /approved-head-assertion-mismatch/u,
    });
  });
  await test("conflicting caller build marker fails before mutation", async () => {
    await rejectedAliasCase("wrong-build-ts", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_BUILD_TS: String(Number(prepared.acquisition.lease.buildTs) + 1),
      }),
      expectedExit: EXIT_CODES.VERIFICATION_MISMATCH,
      expectedText: /build-marker-mismatch/u,
    });
  });
  await test("wrong writer purpose fails after lease verification", () => {
    const fixture = createFixture("wrong-purpose");
    const prepared = acquireCanonicalLease(fixture);
    assert.throws(
      () =>
        assertDeliveryWritePermitted({
          destination: fixture.canonicalAlias,
          purpose: "different-writer",
          environment: {
            H2O_CANONICAL_DELIVERY_TOKEN:
              prepared.acquisition.ownershipToken,
          },
          cwd: fixture.repository,
        }),
      (error) =>
        error.exitCode === EXIT_CODES.ELIGIBILITY_MISMATCH &&
        /purpose-mismatch/u.test(error.message),
    );
  });
  let validLeaseFailure;
  await test("fully valid lease still cannot write canonical live alias", async () => {
    validLeaseFailure = await rejectedAliasCase("valid-still-disabled", {
      prepare: (fixture) => acquireCanonicalLease(fixture),
      overrides: (_fixture, prepared) => ({
        H2O_CANONICAL_DELIVERY_TOKEN:
          prepared.acquisition.ownershipToken,
        H2O_DELIVERY_SESSION_ID: prepared.acquisition.lease.sessionId,
        H2O_DELIVERY_APPROVED_HEAD: prepared.acquisition.lease.approvedHead,
        H2O_BUILD_TS: prepared.acquisition.lease.buildTs,
      }),
      expectedExit: EXIT_CODES.PATH_COUPLING_VIOLATION,
      expectedText: /canonical-live-write-disabled-until-stage-e3/u,
    });
  });
  await test("valid-lease rejection names E3 staging capability", () => {
    assert.match(
      validLeaseFailure.result.stderr,
      /Stage E3 staging is implemented/u,
    );
  });
  await test("symlink spelling into canonical alias is rejected", async () => {
    await rejectedAliasCase("canonical-symlink-spelling", {
      prepare: (fixture) => {
        const spelling = path.join(fixture.top, "canonical-server-link");
        fs.symlinkSync(fixture.canonicalServer, spelling);
        return { spelling };
      },
      serverDir: (_fixture, prepared) => prepared.spelling,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /lease-absent/u,
    });
  });
  await test("foreign H2O_SERVER_DIR redirection into canonical output is rejected", async () => {
    await rejectedAliasCase("foreign-redirection", {
      linkedWorktree: true,
      cwd: (fixture) => fixture.foreignWorktree,
      serverDir: (fixture) => fixture.canonicalServer,
      expectedExit: EXIT_CODES.ABSENT_OR_CONTENDED,
      expectedText: /lease-absent/u,
    });
  });
  await test("every canonical failure preserved inode digest mtime and entries", () => {
    assert.equal(canonicalFailureChecks, 23);
  });
  await test("plaintext lease tokens never appear in child output", () => {
    assert.equal(capturedTokenRedaction, true);
  });
  await test("guard exposes neither plaintext token nor stored token hash", () => {
    const source = fs.readFileSync(path.join(ROOT, GUARD_REL), "utf8");
    assert.doesNotMatch(source, /ownershipTokenSha256/u);
    assert.doesNotMatch(source, /canonicalSession:\s*lease/u);
  });
  await test("trusted writer authority is derived from the module real path", () => {
    const source = fs.readFileSync(path.join(ROOT, GUARD_REL), "utf8");
    assert.match(source, /fileURLToPath\(import\.meta\.url\)/u);
    assert.match(source, /fs\.realpathSync/u);
    assert.match(source, /cwd:\s*path\.dirname\(modulePath\)/u);
    assert.doesNotMatch(source, /cwd\s*=\s*process\.cwd\(\)/u);
  });
  let writerSource;
  let ordering;
  await test("guard call precedes first top-level alias mkdir", () => {
    writerSource = fs.readFileSync(path.join(ROOT, ALIAS_WRITER_REL), "utf8");
    ordering = structuralGuardOrdering(writerSource);
    assert.equal(ordering.valid, true);
  });
  await test("moving guard after mkdir is detected structurally", () => {
    const moved = writerSource.replace(
      /try \{\n  assertDeliveryWritePermitted\(\{[\s\S]*?\n\}\n\n/u,
      "",
    ).replace(
      "fs.mkdirSync(ALIAS_DIR, { recursive: true });",
      "fs.mkdirSync(ALIAS_DIR, { recursive: true });\nassertDeliveryWritePermitted({ destination: ALIAS_DIR });",
    );
    assert.equal(structuralGuardOrdering(moved).valid, false);
  });
  await test("the E1 disposable fixture is built with a real parent commit", () => {
    const snapshot = materializeCleanE1Snapshot();
    // 33: valid ancestry. The intended E1 commit is not a root commit.
    const head = git(snapshot, ["rev-parse", "HEAD"]);
    const parent = git(snapshot, ["rev-parse", "HEAD^"]);
    assert.match(head, /^[0-9a-f]{40}$/u);
    assert.match(parent, /^[0-9a-f]{40}$/u);
    assert.notEqual(head, parent);
    assert.equal(git(snapshot, ["rev-list", "--count", "HEAD"]), "2");
    assert.equal(git(snapshot, ["log", "-1", "--format=%s"]), "accepted E1 snapshot");
    assert.equal(git(snapshot, ["log", "-1", "--format=%s", "HEAD^"]),
      "baseline before accepted E1 delivery");
    // The baseline carries only the pre-existing ignore policy; the E1 commit
    // introduces the delivery paths. That matches the nested validator's model.
    assert.deepEqual(lines(git(snapshot, ["ls-tree", "-r", "--name-only", "HEAD^"])),
      [E1_BASELINE_PATH]);
    const introduced = lines(git(snapshot, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]));
    for (const relative of E1_SNAPSHOT_PATHS) {
      if (relative === E1_BASELINE_PATH) continue;
      assert.equal(introduced.includes(relative), true, relative);
    }
    // The fixture is clean, so the nested validator sees a committed state.
    assert.equal(git(snapshot, ["status", "--porcelain=v1", "--untracked-files=no"]), "");
  });
  await test("the nested E1 validator reaches its scope classification past HEAD^", async () => {
    const snapshot = materializeCleanE1Snapshot();
    // 34: `git rev-parse HEAD^` is exactly what previously aborted the nested
    // run before any enforcement scenario executed. Prove it now resolves and
    // that the nested validator classifies the fixture rather than dying.
    assert.doesNotThrow(() => git(snapshot, ["rev-parse", "HEAD^"]));
    const result = await managedChild(
      process.execPath,
      [path.join(snapshot, E1_VALIDATOR_REL)],
      { cwd: snapshot, env: process.env, timeoutMs: 45_000 },
    );
    assert.doesNotMatch(String(result.stderr), /ambiguous argument 'HEAD\^'/u);
    const summary = JSON.parse(lines(result.stdout).at(-1));
    assert.equal(summary.ok, true, result.stderr);
    assert.equal(summary.scopeMode, "committed-clean");
    // 34 (non-vacuous): the nested run actually executed enforcement scenarios.
    assert.equal(summary.runtimeScenarios > 0, true);
    assert.equal(summary.scopeScenarios > 0, true);
    // A root-commit fixture would still fail, so no broad tolerance was added.
    const rootOnly = temporaryRoot("e1-root-only");
    fs.writeFileSync(path.join(rootOnly, ".gitignore"), "node_modules/\n");
    git(rootOnly, ["init", "-b", "main"]);
    git(rootOnly, ["config", "user.name", "E2A Validator"]);
    git(rootOnly, ["config", "user.email", "e2a-validator@example.invalid"]);
    git(rootOnly, ["add", "--", "."]);
    git(rootOnly, ["commit", "-m", "root only"]);
    assert.throws(() => git(rootOnly, ["rev-parse", "HEAD^"]));
  });
  await test("E1 foundation remains at or above its accepted scenario floor", async () => {
    // This pin was previously unreachable: the fixture's root commit aborted the
    // nested run before it produced a summary, so the literals below silently
    // went stale as the E1 foundation grew. With the ancestry repaired the pin
    // is live again, so it now records both the historical floor it must never
    // fall below and the exact current counts it must match.
    const snapshot = materializeCleanE1Snapshot();
    const result = await managedChild(
      process.execPath,
      [path.join(snapshot, E1_VALIDATOR_REL)],
      { cwd: snapshot, env: process.env, timeoutMs: 45_000 },
    );
    assert.equal(result.code, 0, result.stderr);
    const summary = JSON.parse(lines(result.stdout).at(-1));
    assert.equal(summary.runtimeScenarios >= E1_RUNTIME_FLOOR, true,
      `E1 runtime scenarios fell below the accepted floor: ${summary.runtimeScenarios}`);
    assert.equal(summary.scopeScenarios >= E1_SCOPE_FLOOR, true,
      `E1 scope scenarios fell below the accepted floor: ${summary.scopeScenarios}`);
    assert.equal(summary.runtimeScenarios, E1_RUNTIME_SCENARIOS);
    assert.equal(summary.scopeScenarios, E1_SCOPE_SCENARIOS);
    e1Regression = {
      runtimeScenarios: summary.runtimeScenarios,
      scopeScenarios: summary.scopeScenarios,
    };
  });
  await test("accepted Title Management source hashes remain exact", () => {
    for (const [relative, expected] of Object.entries(
      ACCEPTED_TITLE_IDENTITIES,
    )) {
      assert.equal(sha256File(path.join(ROOT, relative)), expected, relative);
    }
  });
  await test("every accepted Title identity matches its committed bytes at HEAD", () => {
    const observed = {};
    for (const relative of Object.keys(ACCEPTED_TITLE_IDENTITIES)) {
      // Committed bytes, not the worktree: a governed identity may never be
      // satisfied by a dirty, generated or worktree-local file.
      const committed = execFileSync("git", ["show", `HEAD:${relative}`],
        { cwd: ROOT, encoding: null, timeout: 8_000 });
      observed[relative] = sha256Bytes(committed);
      assert.equal(run("git", ["-c", "core.quotePath=false", "ls-files", "--error-unmatch",
        "--", relative]).trim(), relative);
      assert.equal(run("git", ["status", "--porcelain=v1", "--", relative]).trim(), "");
      assert.equal(sha256File(path.join(ROOT, relative)), observed[relative], relative);
    }
    assert.equal(classifyTitleIdentities(observed), "title-identities-exact");
  });
  await test("changing any accepted Title identity is rejected", () => {
    const baseline = Object.fromEntries(Object.entries(ACCEPTED_TITLE_IDENTITIES));
    for (const relative of Object.keys(ACCEPTED_TITLE_IDENTITIES)) {
      assert.equal(classifyTitleIdentities({ ...baseline, [relative]: "0".repeat(64) }),
        "title-identity-changed", relative);
      // Specifically the two refreshed by this closure: their previous values
      // must no longer be accepted.
      const stale = {
        "src-runtime-base/9B0a.🟤🏷️ Chat Title State 🏷️.js":
          "7fec34f297ee1bbd0ee1a9f533d0186f0810e97ada5186d9ee494780feecb0fa",
        "tools/validation/title-interface/validate-title-stage1c-formatter-parity.mjs":
          "6ecf1213898a75065123341372421806d9cf7fdc75a0f6194c362b629fd500c2",
      }[relative];
      if (stale) {
        assert.equal(classifyTitleIdentities({ ...baseline, [relative]: stale }),
          "title-identity-changed", relative);
      }
    }
    // No Title identity may be silently added to or dropped from the set.
    const extra = { ...baseline, "packages/title-contract/extra.mjs": "a".repeat(64) };
    assert.equal(classifyTitleIdentities(extra), "title-identity-set-mismatch");
    const dropped = { ...baseline };
    delete dropped["packages/title-contract/index.mjs"];
    assert.equal(classifyTitleIdentities(dropped), "title-identity-set-mismatch");
    assert.equal(classifyTitleIdentities(null), "title-identities-invalid");
  });
  await test("live canonical alias directory remains unchanged", () => {
    assert.deepEqual(statusSnapshot(), initialRepository);
    assert.deepEqual(snapshotPath(liveAliasPath), initialLiveAliases);
  });
  await test("real canonical anchor remains absent", () => {
    assert.equal(realAnchorInitiallyAbsent, true);
    assert.equal(fs.existsSync(realAnchor), false);
  });
  await test("generated bridge proxy loader manifest remain unchanged", () => {
    assert.deepEqual(snapshotGenerated(), initialGenerated);
  });
  await test("registered foreign worktrees remain unchanged", () => {
    assert.deepEqual(worktreeSnapshot(), initialWorktrees);
  });
  await test("exactly the accepted production writers import the delivery guard", () => {
    const output = run("rg", [
      "-l",
      "canonical-write-guard\\.mjs",
      "tools",
    ]);
    const matches = lines(output);
    const productionMatches = matches.filter(
      (item) => !item.startsWith("tools/validation/"),
    ).sort();
    // Exact, not minimum: a new unguarded writer or a removed guard both fail.
    assert.deepEqual(productionMatches, [...GUARDED_DELIVERY_WRITERS]);
    assert.equal(classifyGuardedWriterSet(productionMatches), "writer-set-exact");
  });
  await test("every accepted writer is a committed writer guarded under its own purpose", () => {
    for (const relative of GUARDED_DELIVERY_WRITERS) {
      const absolute = path.join(ROOT, relative);
      // A real committed file, not a fixture or a read-only helper.
      assert.equal(run("git", ["-c", "core.quotePath=false", "ls-files", "--error-unmatch",
        "--", relative]).trim(), relative);
      const source = fs.readFileSync(absolute, "utf8");
      assert.equal((source.match(/canonical-write-guard\.mjs/gu) || []).length, 1, relative);
      assert.equal((source.match(/assertDeliveryWritePermitted\s*\(/gu) || []).length, 1, relative);
      // It genuinely writes: sync or promise-based mutation is present.
      assert.match(source,
        /fs\.(?:promises\.)?(?:writeFile|mkdir|cp|copyFile|rm|symlink|rename)(?:Sync)?\s*\(/u, relative);
      // Distinct, declared purpose so one writer cannot borrow another's grant.
      assert.ok(source.includes(`purpose: "${GUARDED_WRITER_PURPOSES[relative]}"`), relative);
    }
    // Purposes are unique across the surface.
    const purposes = Object.values(GUARDED_WRITER_PURPOSES);
    assert.equal(new Set(purposes).size, purposes.length);
    assert.deepEqual(Object.keys(GUARDED_WRITER_PURPOSES).sort(), [...GUARDED_DELIVERY_WRITERS]);
  });
  await test("the guarded writer set is exact rather than minimum-based", () => {
    assert.equal(classifyGuardedWriterSet([...GUARDED_DELIVERY_WRITERS]), "writer-set-exact");
    // Omitting any one of the writers is rejected, including each of the five
    // that the previously vacuous fixture allowed to go unrecorded.
    for (const omitted of GUARDED_DELIVERY_WRITERS) {
      const reduced = GUARDED_DELIVERY_WRITERS.filter((entry) => entry !== omitted);
      assert.equal(classifyGuardedWriterSet(reduced), "writer-missing", omitted);
    }
    // An unrelated writer cannot be tolerated.
    for (const intruder of ["tools/loader/make-something-else.mjs", "tools/publish/lean-publisher.mjs",
      "tools/product/extensions/chatgpt/chrome/pack-studio-launcher.mjs"]) {
      assert.equal(classifyGuardedWriterSet([...GUARDED_DELIVERY_WRITERS, intruder]),
        "writer-not-accepted", intruder);
    }
    // Duplicates and alternate spellings of an accepted path are refused.
    assert.equal(classifyGuardedWriterSet([...GUARDED_DELIVERY_WRITERS, ALIAS_WRITER_REL]),
      "writer-duplicate-rejected");
    for (const spelling of ["./tools/loader/make-aliases.mjs", "tools/loader/../loader/make-aliases.mjs",
      path.join(ROOT, ALIAS_WRITER_REL)]) {
      const swapped = GUARDED_DELIVERY_WRITERS
        .filter((entry) => entry !== ALIAS_WRITER_REL).concat(spelling);
      const verdict = classifyGuardedWriterSet(swapped);
      assert.notEqual(verdict, "writer-set-exact", spelling);
    }
    assert.equal(classifyGuardedWriterSet("not-an-array"), "writer-set-invalid");
  });
  await test("no staging floor promotion or writer bypass is implemented", () => {
    const guardSource = fs.readFileSync(path.join(ROOT, GUARD_REL), "utf8");
    assert.doesNotMatch(
      guardSource,
      /chmodSync|chflags|renameSync|promoteDelivery|stageDelivery|receipt/u,
    );
    assert.match(guardSource, /liveWritePermitted:\s*false/u);
  });
  await test("runtime scenario count is exact", () => {
    assert.equal(runtimeResults.length + 1, EXPECTED_RUNTIME_SCENARIOS);
  });

  assert.equal(runtimeResults.length, EXPECTED_RUNTIME_SCENARIOS);
}

function printScope() {
  process.stdout.write(
    `${JSON.stringify({
      validator: VALIDATOR_REL,
      implementation: [GUARD_REL, ALIAS_WRITER_REL],
      documentation: [ADR_REL],
      finalPaths: FINAL_PATHS,
      uncommittedModified: UNCOMMITTED_MODIFIED,
      uncommittedUntracked: UNCOMMITTED_UNTRACKED,
      runtimeScenarios: EXPECTED_RUNTIME_SCENARIOS,
      scopeScenarios: EXPECTED_SCOPE_SCENARIOS,
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
  const scopeMode = classifyStage1DE2AScope(currentScopeState());
  if (args[0] === "--scope-check") {
    process.stdout.write(`${JSON.stringify({ ok: true, scopeMode })}\n`);
    return;
  }
  runScopeSelfTests();
  await runRuntimeScenarios();
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      scopeMode,
      runtimeScenarios: runtimeResults.length,
      scopeScenarios: scopeResults.length,
      canonicalFailureChecks,
      tokenRedactionProven: capturedTokenRedaction,
      e1Regression,
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
