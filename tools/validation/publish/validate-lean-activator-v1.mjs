#!/usr/bin/env node
// Lean activator Batch 2 P0/P1 — source-only validator.
// Executes only in isolated fixture repositories and temporary staged trees.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
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
const P2_BASE_HEAD = "d3ebe3c8b3c973ee11d15664b09398f388b0b373";
const ACCEPTED_P2_HEAD = "bb8109ca5a5b943a55c0b60046e06f8fa3829f49";
const ACCEPTED_P21_HEAD = "61ff500a048f0b12299ea29adf681a02bec2fa85";
const ACCEPTED_P22_HEAD = "51e21657f216da50e2183bb1e2d3512e946c1ea9";
const P1_SUBJECT = "feat(publish): add canonical activation preflight";
const VALIDATOR_FIX_SUBJECT = "fix(publish): support integrated P0/P1 validation";
const P2_SUBJECT = "feat(publish): add durable activation intent foundation";
const P21_SUBJECT = "fix(publish): harden activation intent preparation";
const P22_SUBJECT = "fix(publish): close pre-promotion trust boundaries";
const P23_SUBJECT = "fix(publish): add final pre-promotion guardrails";
const P2_AUTHORIZED_PATHS = Object.freeze([ACTIVATOR_REL, VALIDATOR_REL].sort());
const CANONICAL_LIB_REL = "tools/publish/canonical-delivery-lib.mjs";
const P22_AUTHORIZED_PATHS = Object.freeze([ACTIVATOR_REL, CANONICAL_LIB_REL, VALIDATOR_REL].sort());
const OWNER_VALIDATOR_REL = "tools/validation/publish/validate-canonical-delivery-exclusivity-v1.mjs";
const P23_AUTHORIZED_PATHS = Object.freeze([
  ACTIVATOR_REL, CANONICAL_LIB_REL, VALIDATOR_REL, OWNER_VALIDATOR_REL,
].sort());
const ACCEPTED_P23_HEAD = "140076112bbdd48763fa5c11145f923ff93f13d1";
const P3A_SUBJECT = "feat(publish): add transaction journal and incoming payload preparation";
const P3A_CANDIDATE_HEAD = "a141abf0049ea7ae18f0eb680139782de625ad67";
const PAYLOAD_MODULE_REL = "tools/publish/lean-payload-transaction.mjs";
const PAYLOAD_VALIDATOR_REL = "tools/validation/publish/validate-lean-payload-transaction-v1.mjs";
const P3A_AUTHORIZED_PATHS = Object.freeze([
  ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL,
].sort());
const BATCH11_PUBLISHER_SHA256 = "ef4575bc6855b81a8c16ff874cd679f14e79733163a23d76b4a758a30f513ba4";
const BATCH11_VALIDATOR_SHA256 = "c8a1abd5c21a9328dc13a8bf19aba508ab476095d9e988803cd41e21c55fda92";
const ACCEPTED_ACTIVATOR_SHA256 = "531bb4e9b5d7d61584e013d0d10c8007c78f75498988ba64bac4d24a8d4f2f36";
const REQUIRED_FILES = Object.freeze([
  "manifest.json", "loader.js", "bg.js", "title-contract-bridge.js",
  "provider/identity-provider-supabase.js",
]);
const EXPECTED_SCOPE = 43;
const EXPECTED_RUNTIME = 173;
const EXPECTED_STRUCTURAL = 43;
const ACCEPTED_CANONICAL_LIBRARY_IMPORTS = Object.freeze([
  "assertAllowedReadOnlyGitCommand",
  "deriveSharedAnchor",
  "runPinnedReadOnlyGit",
  "sanitizedGitEnvironment",
  "TRUSTED_GIT_EXECUTABLE_IDENTITY",
].sort());

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

function canonicalLibraryImports(source) {
  if (/import\s*\(/u.test(source)) throw new Error("dynamic canonical-library import is forbidden");
  const declarations = [...source.matchAll(/import\s+(\{[^}]*\})\s+from\s+["']\.\/canonical-delivery-lib\.mjs["'];/gu)];
  assert.equal(declarations.length, 1, "exactly one static canonical-library import is required");
  const clause = declarations[0][1].trim();
  assert.match(clause, /^\{[\s\S]*\}$/u, "canonical-library import must be named-only");
  const names = clause.slice(1, -1).split(",").map((name) => name.trim()).filter(Boolean);
  assert.equal(names.some((name) => /\s+as\s+/u.test(name)), false, "import aliases are forbidden");
  assert.deepEqual(names.sort(), ACCEPTED_CANONICAL_LIBRARY_IMPORTS);
  return names;
}

function normalizedGuardPath(target) {
  let cursor = path.resolve(String(target));
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  const base = fs.existsSync(cursor) ? fs.realpathSync.native(cursor) : cursor;
  return path.resolve(base, ...suffix);
}

function sameOrWithin(root, candidate) {
  const relative = path.relative(normalizedGuardPath(root), normalizedGuardPath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function guardCanonicalPayloadAccess(roots, candidate, operation) {
  if (roots.some((root) => sameOrWithin(root, candidate))) {
    throw new Error(`canonical-payload-${operation}:${normalizedGuardPath(candidate)}`);
  }
  return true;
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
  const p2Base = value.head === P2_BASE_HEAD && value.parent === ACCEPTED_P1_HEAD &&
    value.subject === VALIDATOR_FIX_SUBJECT && value.acceptedP1Ancestor === true &&
    value.untracked.length === 0 && value.staged.length === 0 &&
    JSON.stringify(value.committedPaths) === JSON.stringify([VALIDATOR_REL]);
  if (p2Base && JSON.stringify(value.modifiedTracked) === JSON.stringify([VALIDATOR_REL])) {
    return "p2-test-first-uncommitted";
  }
  if (p2Base && JSON.stringify(value.modifiedTracked) === JSON.stringify(P2_AUTHORIZED_PATHS)) {
    return "p2-uncommitted";
  }
  const p2Clean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.parent === P2_BASE_HEAD && value.subject === P2_SUBJECT && value.acceptedP1Ancestor === true &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P2_AUTHORIZED_PATHS);
  if (p2Clean) return "p2-committed";
  const p21Base = value.head === ACCEPTED_P2_HEAD && value.parent === P2_BASE_HEAD &&
    value.subject === P2_SUBJECT && value.acceptedP1Ancestor === true &&
    value.untracked.length === 0 && value.staged.length === 0 &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P2_AUTHORIZED_PATHS);
  if (p21Base && JSON.stringify(value.modifiedTracked) === JSON.stringify([VALIDATOR_REL])) {
    return "p21-test-first-uncommitted";
  }
  if (p21Base && JSON.stringify(value.modifiedTracked) === JSON.stringify(P2_AUTHORIZED_PATHS)) {
    return "p21-uncommitted";
  }
  const p21Clean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.parent === ACCEPTED_P2_HEAD && value.subject === P21_SUBJECT &&
    value.acceptedP1Ancestor === true &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P2_AUTHORIZED_PATHS);
  if (p21Clean) return "p21-committed";
  const p22Base = value.head === ACCEPTED_P21_HEAD && value.parent === ACCEPTED_P2_HEAD &&
    value.subject === P21_SUBJECT && value.acceptedP1Ancestor === true &&
    value.untracked.length === 0 && value.staged.length === 0 &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P2_AUTHORIZED_PATHS);
  if (p22Base && JSON.stringify(value.modifiedTracked) === JSON.stringify([VALIDATOR_REL])) {
    return "p22-test-first-uncommitted";
  }
  if (p22Base && JSON.stringify(value.modifiedTracked) === JSON.stringify(P22_AUTHORIZED_PATHS)) {
    return "p22-uncommitted";
  }
  const p22Clean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.parent === ACCEPTED_P21_HEAD && value.subject === P22_SUBJECT &&
    value.acceptedP1Ancestor === true &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P22_AUTHORIZED_PATHS);
  if (p22Clean) return "p22-committed";
  const p23Base = value.head === ACCEPTED_P22_HEAD && value.parent === ACCEPTED_P21_HEAD &&
    value.subject === P22_SUBJECT && value.acceptedP1Ancestor === true && value.untracked.length === 0 &&
    value.staged.length === 0 && JSON.stringify(value.committedPaths) === JSON.stringify(P22_AUTHORIZED_PATHS);
  if (p23Base && JSON.stringify(value.modifiedTracked) ===
      JSON.stringify([OWNER_VALIDATOR_REL, VALIDATOR_REL].sort())) return "p23-test-first-uncommitted";
  if (p23Base && JSON.stringify(value.modifiedTracked) === JSON.stringify(P23_AUTHORIZED_PATHS)) {
    return "p23-uncommitted";
  }
  const p23Clean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.parent === ACCEPTED_P22_HEAD && value.subject === P23_SUBJECT && value.acceptedP1Ancestor === true &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P23_AUTHORIZED_PATHS);
  if (p23Clean) return "p23-committed";
  // P3A adds the payload-transaction module and its validator. The base is the
  // accepted P2.3 commit; the test-first mode carries only the new payload
  // validator so an implementation-absent run is still classifiable.
  const p3aBase = value.head === ACCEPTED_P23_HEAD && value.parent === ACCEPTED_P22_HEAD &&
    value.subject === P23_SUBJECT && value.acceptedP1Ancestor === true && value.staged.length === 0 &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P23_AUTHORIZED_PATHS);
  if (p3aBase && value.modifiedTracked.length === 0 &&
      JSON.stringify(value.untracked) === JSON.stringify([PAYLOAD_VALIDATOR_REL])) {
    return "p3a-test-first-uncommitted";
  }
  if (p3aBase &&
      JSON.stringify(value.modifiedTracked) === JSON.stringify([ACTIVATOR_REL, VALIDATOR_REL].sort()) &&
      JSON.stringify(value.untracked) === JSON.stringify([PAYLOAD_MODULE_REL, PAYLOAD_VALIDATOR_REL].sort())) {
    return "p3a-uncommitted";
  }
  const p3aRepairBase = value.head === P3A_CANDIDATE_HEAD && value.parent === ACCEPTED_P23_HEAD &&
    value.subject === P3A_SUBJECT && value.untracked.length === 0 && value.staged.length === 0 &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P3A_AUTHORIZED_PATHS);
  if (p3aRepairBase && JSON.stringify(value.modifiedTracked) === JSON.stringify(P3A_AUTHORIZED_PATHS)) {
    return "p3a-repair-uncommitted";
  }
  const p3aClean = value.modifiedTracked.length === 0 && value.untracked.length === 0 &&
    value.parent === ACCEPTED_P23_HEAD && value.subject === P3A_SUBJECT &&
    value.acceptedP1Ancestor === true &&
    JSON.stringify(value.committedPaths) === JSON.stringify(P3A_AUTHORIZED_PATHS);
  if (p3aClean) return "p3a-committed";
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
  scopeTest("P2 test-first validator-only state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: P2_BASE_HEAD, parent: ACCEPTED_P1_HEAD, subject: VALIDATOR_FIX_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [VALIDATOR_REL], untracked: [],
      committedPaths: [VALIDATOR_REL],
    })), "p2-test-first-uncommitted");
  });
  scopeTest("exact dirty two-file P2 state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: P2_BASE_HEAD, parent: ACCEPTED_P1_HEAD, subject: VALIDATOR_FIX_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P2_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [VALIDATOR_REL],
    })), "p2-uncommitted");
  });
  scopeTest("P2 dirty scope rejects a third path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: P2_BASE_HEAD, parent: ACCEPTED_P1_HEAD, subject: VALIDATOR_FIX_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P2_AUTHORIZED_PATHS, "README.md"].sort(), untracked: [],
      committedPaths: [VALIDATOR_REL],
    })), /scope mismatch/u);
  });
  scopeTest("exact committed two-file P2 state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: "future-p2", parent: P2_BASE_HEAD, subject: P2_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS],
    })), "p2-committed");
  });
  scopeTest("committed P2 state rejects a wrong parent or extra path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: "future-p2", parent: ACCEPTED_P1_HEAD, subject: P2_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS, "README.md"].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("P2.1 test-first validator-only state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P2_HEAD, parent: P2_BASE_HEAD, subject: P2_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [VALIDATOR_REL], untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS],
    })), "p21-test-first-uncommitted");
  });
  scopeTest("exact dirty two-file P2.1 state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P2_HEAD, parent: P2_BASE_HEAD, subject: P2_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P2_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS],
    })), "p21-uncommitted");
  });
  scopeTest("P2.1 dirty scope rejects a third path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P2_HEAD, parent: P2_BASE_HEAD, subject: P2_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P2_AUTHORIZED_PATHS, "README.md"].sort(), untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("exact committed two-file P2.1 state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: "future-p21", parent: ACCEPTED_P2_HEAD, subject: P21_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS],
    })), "p21-committed");
  });
  scopeTest("committed P2.1 rejects a wrong parent or extra path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: "future-p21", parent: P2_BASE_HEAD, subject: P21_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS, "README.md"].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("P2.2 test-first validator-only state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P21_HEAD, parent: ACCEPTED_P2_HEAD, subject: P21_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [VALIDATOR_REL], untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS],
    })), "p22-test-first-uncommitted");
  });
  scopeTest("exact dirty three-file P2.2 state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P21_HEAD, parent: ACCEPTED_P2_HEAD, subject: P21_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P22_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS],
    })), "p22-uncommitted");
  });
  scopeTest("P2.2 dirty scope rejects a fourth path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P21_HEAD, parent: ACCEPTED_P2_HEAD, subject: P21_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P22_AUTHORIZED_PATHS, "README.md"].sort(), untracked: [],
      committedPaths: [...P2_AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("exact committed three-file P2.2 state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: "future-p22", parent: ACCEPTED_P21_HEAD, subject: P22_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [...P22_AUTHORIZED_PATHS],
    })), "p22-committed");
  });
  scopeTest("committed P2.2 rejects a wrong parent or extra path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: "future-p22", parent: ACCEPTED_P2_HEAD, subject: P22_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [...P22_AUTHORIZED_PATHS, "README.md"].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("P2.3 test-first two-validator state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P22_HEAD, parent: ACCEPTED_P21_HEAD, subject: P22_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [OWNER_VALIDATOR_REL, VALIDATOR_REL].sort(), untracked: [],
      committedPaths: [...P22_AUTHORIZED_PATHS],
    })), "p23-test-first-uncommitted");
  });
  scopeTest("exact dirty four-file P2.3 state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P22_HEAD, parent: ACCEPTED_P21_HEAD, subject: P22_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P23_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P22_AUTHORIZED_PATHS],
    })), "p23-uncommitted");
  });
  scopeTest("P2.3 dirty scope rejects a fifth path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P22_HEAD, parent: ACCEPTED_P21_HEAD, subject: P22_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P23_AUTHORIZED_PATHS, "README.md"].sort(), untracked: [],
      committedPaths: [...P22_AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("exact committed four-file P2.3 state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: "future-p23", parent: ACCEPTED_P22_HEAD, subject: P23_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [], committedPaths: [...P23_AUTHORIZED_PATHS],
    })), "p23-committed");
  });
  scopeTest("committed P2.3 rejects wrong parent or extra path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: "future-p23", parent: ACCEPTED_P21_HEAD, subject: P23_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [...P23_AUTHORIZED_PATHS, "README.md"].sort(),
    })), /scope mismatch/u);
  });
  scopeTest("P3A test-first state carries only the new payload validator", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P23_HEAD, parent: ACCEPTED_P22_HEAD, subject: P23_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [PAYLOAD_VALIDATOR_REL],
      committedPaths: [...P23_AUTHORIZED_PATHS],
    })), "p3a-test-first-uncommitted");
  });
  scopeTest("exact dirty four-path P3A state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: ACCEPTED_P23_HEAD, parent: ACCEPTED_P22_HEAD, subject: P23_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [ACTIVATOR_REL, VALIDATOR_REL].sort(),
      untracked: [PAYLOAD_MODULE_REL, PAYLOAD_VALIDATOR_REL].sort(),
      committedPaths: [...P23_AUTHORIZED_PATHS],
    })), "p3a-uncommitted");
  });
  scopeTest("P3A dirty scope rejects an unauthorized path", () => {
    assert.throws(() => classifyScope(baseDirtyScope({
      head: ACCEPTED_P23_HEAD, parent: ACCEPTED_P22_HEAD, subject: P23_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [ACTIVATOR_REL, VALIDATOR_REL, PUBLISHER_REL].sort(),
      untracked: [PAYLOAD_MODULE_REL, PAYLOAD_VALIDATOR_REL].sort(),
      committedPaths: [...P23_AUTHORIZED_PATHS],
    })), /scope mismatch/u);
  });
  scopeTest("exact committed four-path P3A state is accepted", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: "future-p3a", parent: ACCEPTED_P23_HEAD, subject: P3A_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
      committedPaths: [...P3A_AUTHORIZED_PATHS],
    })), "p3a-committed");
  });
  scopeTest("the P3A repair state modifies exactly the four committed paths", () => {
    assert.equal(classifyScope(baseDirtyScope({
      head: P3A_CANDIDATE_HEAD, parent: ACCEPTED_P23_HEAD, subject: P3A_SUBJECT,
      acceptedP1Ancestor: true, modifiedTracked: [...P3A_AUTHORIZED_PATHS], untracked: [],
      committedPaths: [...P3A_AUTHORIZED_PATHS],
    })), "p3a-repair-uncommitted");
  });
  scopeTest("committed P3A rejects a wrong parent, subject or extra path", () => {
    for (const override of [
      { parent: ACCEPTED_P22_HEAD },
      { subject: P23_SUBJECT },
      { committedPaths: [...P3A_AUTHORIZED_PATHS, PACKAGE_REL].sort() },
    ]) {
      assert.throws(() => classifyScope(baseDirtyScope({
        head: "future-p3a", parent: ACCEPTED_P23_HEAD, subject: P3A_SUBJECT,
        acceptedP1Ancestor: true, modifiedTracked: [], untracked: [],
        committedPaths: [...P3A_AUTHORIZED_PATHS], ...override,
      })), /scope mismatch/u);
    }
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
  if (!["committed-clean", "validator-fix-uncommitted", "validator-fix-committed",
    "p2-test-first-uncommitted", "p2-uncommitted", "p2-committed",
    "p21-test-first-uncommitted", "p21-uncommitted", "p21-committed",
    "p22-test-first-uncommitted", "p22-uncommitted", "p22-committed",
    "p23-test-first-uncommitted", "p23-uncommitted", "p23-committed",
    "p3a-test-first-uncommitted", "p3a-uncommitted", "p3a-repair-uncommitted", "p3a-committed"]
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

function collectChild(child) {
  return new Promise((resolve, reject) => {
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
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
  copyFile(path.join(ROOT, CANONICAL_LIB_REL), path.join(repository, CANONICAL_LIB_REL));
  installIgnoredPublisherInputs(repository);
  git(repository, ["add", ACTIVATOR_REL, CANONICAL_LIB_REL]);
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
    copyFile(path.join(ROOT, PUBLISHER_REL), path.join(repository, PUBLISHER_REL));
  }
  git(repository, ["config", "user.name", "Lean Activator Validator"]);
  git(repository, ["config", "user.email", "lean-activator@example.invalid"]);
  copyFile(path.join(ROOT, ACTIVATOR_REL), path.join(repository, ACTIVATOR_REL));
  copyFile(path.join(ROOT, CANONICAL_LIB_REL), path.join(repository, CANONICAL_LIB_REL));
  fs.mkdirSync(path.join(repository, "fixture-source"), { recursive: true });
  fs.writeFileSync(path.join(repository, "fixture-source", "ordinary.js"), "export const ordinary = true;\n");
  fs.writeFileSync(path.join(repository, "fixture-source", "emoji 🧪.js"), "export const emoji = '🧪';\n");
  fs.mkdirSync(path.join(repository, "apps", "dev-server"), { recursive: true });
  fs.writeFileSync(path.join(repository, "apps", "dev-server", "generated.js"), "// generated fixture\n");
  git(repository, ["add", "--sparse", ACTIVATOR_REL, PUBLISHER_REL, "tools/publish/canonical-delivery-lib.mjs",
    "fixture-source", "apps/dev-server/generated.js"]);
  git(repository, ["commit", "-q", "-m", "fixture: activator source"]);
  assert.equal(git(repository, ["status", "--porcelain=v1"]), "");
  return { top, repository, activator: path.join(repository, ACTIVATOR_REL) };
}

function installAnchorMismatchBoundary(fixture) {
  const library = path.join(fixture.repository, CANONICAL_LIB_REL);
  const realRelative = "tools/publish/canonical-delivery-p22-real.mjs";
  const realLibrary = path.join(fixture.repository, realRelative);
  copyFile(library, realLibrary);
  fs.writeFileSync(library, [
    'import path from "node:path";',
    'import { deriveSharedAnchor as deriveRealSharedAnchor } from "./canonical-delivery-p22-real.mjs";',
    'export * from "./canonical-delivery-p22-real.mjs";',
    'export function deriveSharedAnchor(options) {',
    '  const actual = deriveRealSharedAnchor(options);',
    '  const wrongCockpitProRoot = path.join(actual.cockpitProRoot, "clean-but-wrong-root");',
    '  return Object.freeze({ ...actual, cockpitProRoot: wrongCockpitProRoot,',
    '    root: path.join(wrongCockpitProRoot, ".h2o-canonical-delivery") });',
    '}',
    '',
  ].join("\n"));
  git(fixture.repository, ["add", CANONICAL_LIB_REL, realRelative]);
  git(fixture.repository, ["commit", "-q", "-m", "fixture: clean incorrect anchor derivation"]);
  assert.equal(git(fixture.repository, ["status", "--porcelain=v1"]), "");
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
  const activationId = "20260802T120000000Z-a1b2c3d4e5f6";
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

const FIXED_ACTIVATION_DATE = new Date("2026-08-02T12:00:00.000Z");
const FIXED_ACTIVATION_ID = "20260802T120000000Z-a1b2c3d4e5f6";
const FIXED_RANDOM_BYTES = () => Buffer.from("a1b2c3d4e5f6", "hex");

async function importFixtureActivator(fixture, label) {
  return import(`${pathToFileURL(fixture.activator).href}?p2=${encodeURIComponent(label)}-${Date.now()}`);
}

function expectActivatorError(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `expected ActivatorError ${code}`);
}

function lockEvidence(root) {
  return {
    foundation: { publisherLock: path.join(root, ".h2o-publisher-lock") },
    source: {
      repository: path.join(root, "repository"),
      approvedHead: "a".repeat(40),
    },
  };
}

function writeLock(lockDirectory, value) {
  fs.mkdirSync(lockDirectory, { mode: 0o700 });
  fs.writeFileSync(path.join(lockDirectory, "lock.json"), `${JSON.stringify(value)}\n`, { mode: 0o600 });
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
  const canonicalApi = await import(
    `${pathToFileURL(path.join(ROOT, CANONICAL_LIB_REL)).href}?p22-validator=${Date.now()}`);
  await test("activator imports the exact accepted canonical-library capability set", () => {
    const source = fs.readFileSync(path.join(ROOT, ACTIVATOR_REL), "utf8");
    assert.deepEqual(canonicalLibraryImports(source), ACCEPTED_CANONICAL_LIBRARY_IMPORTS);
  });
  await test("canonical-library capability pin rejects added, removed, aliased, namespace, default, and dynamic imports", () => {
    const source = fs.readFileSync(path.join(ROOT, ACTIVATOR_REL), "utf8");
    const mutations = [
      source.replace("  deriveSharedAnchor,", "  atomicWriteJson,\n  deriveSharedAnchor,"),
      source.replace("  deriveSharedAnchor,\n", ""),
      source.replace("  deriveSharedAnchor,", "  deriveSharedAnchor as deriveAnchor,"),
      source.replace(/import \{[\s\S]*?\} from "\.\/canonical-delivery-lib\.mjs";/u,
        'import * as canonicalDelivery from "./canonical-delivery-lib.mjs";'),
      source.replace(/import \{[\s\S]*?\} from "\.\/canonical-delivery-lib\.mjs";/u,
        'import canonicalDelivery from "./canonical-delivery-lib.mjs";'),
      `${source}\nconst unexpectedDynamic = import("./canonical-delivery-lib.mjs");\n`,
    ];
    for (const mutated of mutations) assert.throws(() => canonicalLibraryImports(mutated));
  });
  await test("durable Git identity excludes process-local filesystem metadata", () => {
    const stable = api.stableGitExecutableIdentity(api.TRUSTED_GIT_EXECUTABLE_IDENTITY);
    assert.deepEqual(Object.keys(stable).sort(), ["path", "realpath", "sha256", "version"]);
    for (const key of ["device", "inode", "size", "mtimeMs"]) assert.equal(Object.hasOwn(stable, key), false);
    const reinstalled = { ...api.TRUSTED_GIT_EXECUTABLE_IDENTITY,
      device: "different-device", inode: "different-inode",
      size: api.TRUSTED_GIT_EXECUTABLE_IDENTITY.size + 1,
      mtimeMs: api.TRUSTED_GIT_EXECUTABLE_IDENTITY.mtimeMs + 1 };
    assert.deepEqual(api.stableGitExecutableIdentity(reinstalled), stable);
  });
  await test("shared read-only Git timeout is fixed at thirty seconds", () => {
    assert.equal(canonicalApi.READ_ONLY_GIT_TIMEOUT_MS, 30_000);
    const source = fs.readFileSync(path.join(ROOT, CANONICAL_LIB_REL), "utf8");
    assert.equal((source.match(/timeout:\s*READ_ONLY_GIT_TIMEOUT_MS/gu) || []).length, 2);
  });
  await test("a hanging fixture process is terminated and typed as a read-only Git timeout", () => {
    let observed = null;
    try {
      execFileSync(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        timeout: 40, killSignal: "SIGTERM", stdio: "ignore",
      });
    } catch (error) {
      observed = error;
    }
    assert(observed);
    assert.equal(canonicalApi.classifyReadOnlyGitExecutionError(observed), "git-read-timeout");
  });
  await test("canonical payload read guard detects equivalent macOS var path spelling", () => {
    if (fs.existsSync("/var") && fs.existsSync("/private/var")) {
      assert.throws(() => guardCanonicalPayloadAccess(
        ["/private/var/tmp/h2o-p23-canonical"], "/var/tmp/h2o-p23-canonical/alias", "read"),
      /canonical-payload-read/u);
    }
  });
  await test("canonical payload write guard detects equivalent normalized spelling", () => {
    const root = tempRoot("p23-guard-write");
    const canonical = path.join(root, "canonical");
    fs.mkdirSync(canonical);
    assert.throws(() => guardCanonicalPayloadAccess([canonical], path.join(canonical, "future"), "write"),
      /canonical-payload-write/u);
  });
  await test("payload guard normalizes a symlink spelling through the same existing parent", () => {
    const root = tempRoot("p23-guard-symlink");
    const real = path.join(root, "real"); const link = path.join(root, "link");
    fs.mkdirSync(real); fs.symlinkSync(real, link);
    assert.equal(normalizedGuardPath(path.join(link, "future", "alias")),
      normalizedGuardPath(path.join(real, "future", "alias")));
  });
  await test("payload guard preserves outside-root rejection", () => {
    const root = tempRoot("p23-guard-outside");
    const canonical = path.join(root, "canonical"); const outside = path.join(root, "outside");
    fs.mkdirSync(canonical); fs.mkdirSync(outside);
    assert.equal(sameOrWithin(canonical, path.join(canonical, "future")), true);
    assert.equal(sameOrWithin(canonical, outside), false);
  });
  await test("coordination paths remain distinct from normalized canonical payload roots", () => {
    const root = tempRoot("p23-guard-coordination");
    const canonical = path.join(root, "repository", "apps", "dev-server", "alias");
    const coordination = path.join(root, ".h2o-canonical-delivery", "activation-intents");
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.mkdirSync(coordination, { recursive: true });
    assert.equal(sameOrWithin(canonical, coordination), false);
  });
  await test("P2.2 resolves one pinned absolute Git executable identity", () => {
    assert.equal(path.isAbsolute(api.TRUSTED_GIT_EXECUTABLE_IDENTITY?.realpath || ""), true);
    assert.equal(fs.lstatSync(api.TRUSTED_GIT_EXECUTABLE_IDENTITY.realpath).isSymbolicLink(), false);
    assert.equal(fs.statSync(api.TRUSTED_GIT_EXECUTABLE_IDENTITY.realpath).isFile(), true);
  });
  await test("pinned Git ignores hostile PATH and never executes a fake git binary", () => {
    const hostile = tempRoot("p22-hostile-path");
    const marker = path.join(hostile, "fake-git-executed");
    const fake = path.join(hostile, "git");
    fs.writeFileSync(fake, `#!/bin/sh\nprintf executed > ${JSON.stringify(marker)}\nexit 99\n`, { mode: 0o700 });
    const expectedHead = git(ROOT, ["rev-parse", "HEAD"]);
    const previous = process.env.PATH;
    process.env.PATH = hostile;
    try {
      assert.equal(canonicalApi.runPinnedReadOnlyGit(ROOT, ["rev-parse", "HEAD"]), expectedHead);
    } finally {
      if (previous === undefined) delete process.env.PATH; else process.env.PATH = previous;
    }
    assert.equal(fs.existsSync(marker), false);
  });
  await test("unapproved and symlinked Git executable candidates fail closed", () => {
    const hostile = tempRoot("p22-unapproved-git");
    const fake = path.join(hostile, "git");
    fs.writeFileSync(fake, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    assert.throws(() => canonicalApi.attestGitExecutableCandidate(fake),
      (error) => error.name === "CanonicalDeliveryError");
    if (fs.existsSync("/opt/homebrew/bin/git") && fs.lstatSync("/opt/homebrew/bin/git").isSymbolicLink()) {
      assert.throws(() => canonicalApi.attestGitExecutableCandidate("/opt/homebrew/bin/git"),
        (error) => error.name === "CanonicalDeliveryError" && /Symlinked Git/u.test(error.message));
    }
  });
  await test("pinned Git executable identity drift is rejected within one process", () => {
    const observed = { ...canonicalApi.TRUSTED_GIT_EXECUTABLE_IDENTITY,
      size: canonicalApi.TRUSTED_GIT_EXECUTABLE_IDENTITY.size + 1 };
    assert.throws(() => canonicalApi.assertTrustedGitExecutableIdentity(observed),
      (error) => error.name === "CanonicalDeliveryError" && /identity drifted/u.test(error.message));
  });
  await test("canonical library rejects unexpected core.worktree output", () => {
    const root = tempRoot("p22-core-worktree");
    const registered = path.join(root, "registered worktree");
    fs.mkdirSync(registered);
    assert.equal(canonicalApi.validateConfiguredWorktree(registered, {
      gitCommonDirectory: path.join(root, "git metadata"),
      registeredWorktreeRoots: [fs.realpathSync(registered)],
    }), fs.realpathSync(registered));
    assert.throws(() => canonicalApi.validateConfiguredWorktree(path.join(root, "unexpected"), {
      gitCommonDirectory: path.join(root, "git metadata"),
      registeredWorktreeRoots: [fs.realpathSync(registered)],
    }), (error) => error.name === "CanonicalDeliveryError" && /independently discovered/u.test(error.message));
  });
  await test("optional read-only Git queries suppress only the documented status-one absence", () => {
    assert.throws(() => canonicalApi.runPinnedReadOnlyGit("/definitely/missing/repository", [
      "config", "--path", "--get", "core.worktree",
    ], { allowFailure: true }), (error) => error.name === "CanonicalDeliveryError");
  });
  await test("P2.1 independently pins the accepted extension variant", () => {
    assert.equal(api.ACCEPTED_EXTENSION_VARIANT, "dev-controls-oauth-google");
  });
  await test("production activator exposes activation-intent preparation", () => {
    assert.equal(typeof api.prepareActivationIntent, "function");
  });
  await test("generic Git execution is guarded by an explicit argv allow-list", () => {
    assert.equal(typeof api.assertAllowedGitCommand, "function");
  });
  await test("durable activation-intent journal writer exists", () => {
    assert.equal(typeof api.writeDurableActivationIntent, "function");
  });
  await test("activation-intent preparation integrates the Batch 1 publisher lock", () => {
    assert.equal(typeof api.withPublisherLock, "function");
  });
  await test("recovery classifier distinguishes untouched and partially promoted states", () => {
    assert.equal(typeof api.classifyRecoveryState, "function");
  });

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
      ["activation-intents", "activations", "rollbacks", "transactions"]);
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
    model.trees.extension.activationId = "20260802T120000000Z-ffffffffffff";
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
    assert.deepEqual(api.futureSiblingNames("alias", "20260802T120000000Z-a1b2c3d4e5f6"), {
      incoming: "alias.staging-act-20260802T120000000Z-a1b2c3d4e5f6",
      previous: "alias.retired-act-20260802T120000000Z-a1b2c3d4e5f6",
    });
  });
  await test("future ownership rejects generic or foreign activation siblings", () => {
    const activationId = "20260802T120000000Z-a1b2c3d4e5f6";
    assert.equal(api.ownsFutureSibling(`alias.staging-act-${activationId}`, "alias", activationId), true);
    assert.equal(api.ownsFutureSibling("alias.staging-act-20260802T120000000Z-ffffffffffff", "alias", activationId), false);
    assert.equal(api.ownsFutureSibling("alias.staging-anything", "alias", activationId), false);
  });

  await test("all exact read-only Git command shapes are accepted", () => {
    for (const args of [
      ["rev-parse", "--show-toplevel"], ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      ["rev-parse", "HEAD"], ["rev-parse", "HEAD^{tree}"], ["rev-parse", "refs/heads/main"],
      ["branch", "--show-current"], ["diff", "--cached", "--quiet"], ["diff", "--quiet"],
      ["ls-files", "--others", "--exclude-standard"], ["worktree", "list", "--porcelain"],
      ["config", "--path", "--get", "core.worktree"],
      ["merge-base", "--is-ancestor", "a".repeat(40), "HEAD"],
      ["merge-base", "--is-ancestor", "a".repeat(40), "b".repeat(40)],
    ]) {
      assert.equal(api.assertAllowedGitCommand(args), true);
      assert.equal(canonicalApi.assertAllowedReadOnlyGitCommand(args), true);
    }
  });
  await test("all named Git mutation and network commands reject before execution", () => {
    for (const command of ["reset", "checkout", "switch", "clean", "add", "commit", "merge", "rebase",
      "push", "fetch", "pull"]) {
      expectActivatorError(() => api.assertAllowedGitCommand([command]), "git-command-not-allowed");
      expectActivatorError(() => api.runReadOnlyGit("/definitely/missing/repository", [command]),
        "git-command-not-allowed");
    }
    for (const args of [["worktree", "add", "/tmp/x"], ["worktree", "remove", "/tmp/x"]]) {
      expectActivatorError(() => api.assertAllowedGitCommand(args), "git-command-not-allowed");
    }
  });
  await test("Git option, alias, extra-argument and shell-shape smuggling rejects", () => {
    for (const args of [
      ["-c", "alias.x=reset", "x"], ["--config=alias.x=reset", "x"], ["alias.x"],
      ["rev-parse", "HEAD", "--verify"], ["rev-parse", "HEAD;reset"],
      ["merge-base", "--is-ancestor", "HEAD", "HEAD"], ["diff", "--quiet", "--", "."],
      ["config", "--global", "alias.x", "reset"], ["config", "--get", "http.proxy"],
      ["rev-parse", "--git-dir"], ["ls-remote", "origin"],
    ]) {
      expectActivatorError(() => api.assertAllowedGitCommand(args), "git-command-not-allowed");
      assert.throws(() => canonicalApi.assertAllowedReadOnlyGitCommand(args),
        (error) => error.name === "CanonicalDeliveryError");
    }
  });
  await test("activation IDs use exact UTC compact timestamp and lowercase hex", () => {
    assert.equal(api.generateActivationId({ now: FIXED_ACTIVATION_DATE, randomBytes: FIXED_RANDOM_BYTES }),
      FIXED_ACTIVATION_ID);
    for (const invalid of ["../x", "x/y", "x\\y", "20260802T120000000Z-ABCDEF123456",
      "20260802T120000000Z-short", `${FIXED_ACTIVATION_ID}.extra`]) {
      expectActivatorError(() => api.validateActivationId(invalid), "activation-id-invalid");
    }
  });
  await test("unsafe staged extension variant rejects before lock or coordination mutation", () => {
    const value = createStageFixture(fixture.repository, "unsafe-extension-variant");
    mutateReceipt(value, (receipt) => { receipt.stagedExtensionVariant = "../foreign"; });
    expectFailure(fixture, ["--verify-stage-receipt", value.receiptPath], "receipt-extension-variant");
    assert.equal(fs.existsSync(path.join(fixture.top, ".h2o-publisher-lock")), false);
    assert.equal(fs.existsSync(path.join(fixture.top, ".h2o-canonical-delivery")), false);
  });
  await test("wrong but filename-safe extension variant rejects before lock or coordination mutation", () => {
    const value = createStageFixture(fixture.repository, "wrong-safe-extension-variant");
    mutateReceipt(value, (receipt) => { receipt.stagedExtensionVariant = "dev-controls-oauth-other"; });
    expectFailure(fixture, ["--prepare-activation-intent", value.receiptPath], "receipt-extension-variant");
    assert.equal(fs.existsSync(path.join(fixture.top, ".h2o-publisher-lock")), false);
    assert.equal(fs.existsSync(path.join(fixture.top, ".h2o-canonical-delivery")), false);
  });
  await test("hostile inherited Git repository and config variables are neutralized", async () => {
    const hostile = {
      GIT_DIR: path.join(fixture.top, "foreign.git"),
      GIT_WORK_TREE: path.join(fixture.top, "foreign-worktree"),
      GIT_INDEX_FILE: path.join(fixture.top, "foreign.index"),
      GIT_OBJECT_DIRECTORY: path.join(fixture.top, "foreign-objects"),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(fixture.top, "foreign-alternates"),
      GIT_CONFIG: path.join(fixture.top, "foreign-repository-config"),
      GIT_CONFIG_GLOBAL: path.join(fixture.top, "foreign-global-config"),
      GIT_CONFIG_SYSTEM: path.join(fixture.top, "foreign-system-config"),
      GIT_COMMON_DIR: path.join(fixture.top, "foreign-common-dir"),
    };
    const previous = Object.fromEntries(Object.keys(hostile).map((name) => [name, process.env[name]]));
    Object.assign(process.env, hostile);
    try {
      const fixtureApi = await importFixtureActivator(fixture, "hostile-git-environment");
      assert.equal(fixtureApi.collectSourcePreflight().repository, fs.realpathSync(fixture.repository));
      const sanitized = fixtureApi.sanitizedGitEnvironment(process.env);
      for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
        "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_COMMON_DIR"]) {
        assert.equal(Object.hasOwn(sanitized, name), false);
      }
      assert.equal(Object.hasOwn(sanitized, "PATH"), false);
      assert.equal(sanitized.GIT_CONFIG_GLOBAL, "/dev/null");
      assert.equal(sanitized.GIT_CONFIG_SYSTEM, "/dev/null");
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
    }
  });
  await test("module-location repository mismatch rejects independent anchor derivation", () => {
    expectActivatorError(() => api.deriveCanonicalFoundation(fixture.repository), "module-repository-mismatch");
  });
  await test("clean incorrect derived anchor reaches canonical-anchor-mismatch before lock or coordination mutation", () => {
    const value = createRepositoryFixture("p22-true-anchor-mismatch");
    installAnchorMismatchBoundary(value);
    const stageValue = createStageFixture(value.repository, "p22-true-anchor-mismatch");
    const result = runActivator(value, ["--prepare-activation-intent", stageValue.receiptPath]);
    assert.notEqual(result.status, 0);
    assert.equal(codeOf(result), "canonical-anchor-mismatch", result.stderr);
    assert.equal(fs.existsSync(path.join(value.top, ".h2o-publisher-lock")), false);
    assert.equal(fs.existsSync(path.join(value.top, ".h2o-canonical-delivery")), false);
    assert.equal(fs.existsSync(path.join(value.top, "clean-but-wrong-root")), false);
  });

  const p2Fixture = createRepositoryFixture("p2-intent-spaces-emoji");
  const p2Stage = createStageFixture(p2Fixture.repository, "p2 intent spaces 🧪");
  const p2Api = await importFixtureActivator(p2Fixture, "prepared");
  let preparedIntent;
  await test("P2 prepares one durable intent while preserving receipt bytes and releasing the lock", () => {
    const receiptBefore = fs.readFileSync(p2Stage.receiptPath);
    preparedIntent = p2Api.prepareActivationIntent(p2Stage.receiptPath, {
      environment: cleanEnvironment(), now: FIXED_ACTIVATION_DATE, randomBytes: FIXED_RANDOM_BYTES,
    });
    assert.equal(preparedIntent.activationId, FIXED_ACTIVATION_ID);
    assert.equal(fs.readFileSync(p2Stage.receiptPath).equals(receiptBefore), true);
    assert.equal(sha256(fs.readFileSync(preparedIntent.intentPath)), preparedIntent.intentSha256);
    assert.equal(fs.statSync(path.dirname(preparedIntent.intentPath)).mode & 0o777, 0o700);
    assert.equal(fs.statSync(preparedIntent.intentPath).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(path.dirname(preparedIntent.intentPath)).some((name) => name.includes(".tmp-")), false);
    assert.equal(fs.existsSync(path.join(p2Fixture.top, ".h2o-publisher-lock")), false);
    assert.deepEqual(preparedIntent.coordinationDirectories.anchor.parentDirectoryFsync,
      { attempted: true, succeeded: true, unsupported: false });
    assert.deepEqual(preparedIntent.coordinationDirectories.activationIntents.parentDirectoryFsync,
      { attempted: true, succeeded: true, unsupported: false });
  });
  await test("P2 journal records exact schema, verified stage evidence, and false boundary fields", () => {
    const journal = JSON.parse(fs.readFileSync(preparedIntent.intentPath, "utf8"));
    assert.equal(journal.schemaVersion, 1);
    assert.equal(journal.mode, "activation-intent");
    assert.equal(journal.purpose, "canonical-activation");
    assert.equal(journal.rollbackScope, "whole-release");
    assert.equal(journal.finalActivationReceiptDurable, false);
    for (const field of ["activationPerformed", "reloadPerformed", "canaryPerformed", "pushPerformed"]) {
      assert.equal(journal[field], false);
    }
    assert.equal(journal.stageReceiptSha256, sha256(fs.readFileSync(p2Stage.receiptPath)));
    assert.deepEqual(journal.stageManifests, p2Stage.receipt.manifests);
    assert.deepEqual(journal.gitExecutable,
      p2Api.stableGitExecutableIdentity(p2Api.TRUSTED_GIT_EXECUTABLE_IDENTITY));
    for (const key of ["device", "inode", "size", "mtimeMs"]) assert.equal(Object.hasOwn(journal.gitExecutable, key), false);
    assert.deepEqual(journal.durability.fileFsync, { attempted: true, succeeded: true });
    assert.deepEqual(journal.durability.directoryFsync, {
      attempted: true,
      succeeded: null,
      unsupported: null,
      actualOutcomeReturnedByPreparation: true,
    });
    assert.equal(journal.durability.processCrashAtomicity, true);
    assert.equal(journal.durability.powerLossDurabilityGuaranteed, false);
    assert.equal(preparedIntent.durability.fileFsync.succeeded, true);
    assert.equal(preparedIntent.durability.powerLossDurabilityGuaranteed, false);
  });
  await test("all three future tree records begin untouched with activation-specific siblings", () => {
    const journal = preparedIntent.journal;
    assert.deepEqual(journal.trees.map((tree) => tree.logicalName), ["alias", "dev_output", "extension"]);
    for (const tree of journal.trees) {
      assert.equal(tree.state, "untouched");
      assert.equal(tree.previousState, "unknown");
      assert.equal(tree.previousIdentity, null);
      assert.equal(tree.restorationMode, "unknown");
      assert.equal(tree.verified, false);
      assert.equal(path.basename(tree.incomingPath).endsWith(`.staging-act-${FIXED_ACTIVATION_ID}`), true);
      assert.equal(path.basename(tree.previousPath).endsWith(`.retired-act-${FIXED_ACTIVATION_ID}`), true);
    }
  });
  await test("intent preparation creates no payload, activation, or rollback tree", () => {
    const anchor = path.join(p2Fixture.top, ".h2o-canonical-delivery");
    assert.deepEqual(fs.readdirSync(anchor).sort(), ["activation-intents"]);
    for (const tree of preparedIntent.journal.trees) {
      assert.equal(fs.existsSync(tree.incomingPath), false);
      assert.equal(fs.existsSync(tree.previousPath), false);
    }
  });
  await test("intent preparation neither inspects nor mutates canonical payload paths", async () => {
    const value = createRepositoryFixture("p21-no-payload-inspection");
    const stageValue = createStageFixture(value.repository, "p21-no-payload-inspection");
    const valueApi = await importFixtureActivator(value, "no-payload-inspection");
    const originalLstat = fs.lstatSync;
    const canonicalRoots = [
      path.join(value.repository, "apps", "dev-server", "alias"),
      path.join(value.repository, "apps", "dev-server", "dev_output"),
      path.join(value.repository, "apps", "extensions", "chatgpt", "chrome", "dev-controls-oauth-google"),
    ];
    fs.lstatSync = (filename, ...args) => {
      const candidate = normalizedGuardPath(String(filename));
      if (canonicalRoots.some((root) => candidate === normalizedGuardPath(root) ||
          candidate.startsWith(`${normalizedGuardPath(root)}.staging-act-`) ||
          candidate.startsWith(`${normalizedGuardPath(root)}.retired-act-`))) {
        throw new Error(`canonical payload inspected: ${candidate}`);
      }
      return originalLstat(filename, ...args);
    };
    let prepared;
    try {
      prepared = valueApi.prepareActivationIntent(stageValue.receiptPath, {
        now: FIXED_ACTIVATION_DATE, randomBytes: FIXED_RANDOM_BYTES,
      });
    } finally { fs.lstatSync = originalLstat; }
    assert.equal(prepared.canonicalPayloadMutationPerformed, false);
    for (const root of canonicalRoots) assert.equal(fs.existsSync(root), false);
  });
  await test("read-only intent inspection validates the durable journal", () => {
    const before = fs.readFileSync(preparedIntent.intentPath);
    const result = runActivator(p2Fixture, ["--inspect-activation-intent", preparedIntent.intentPath]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.recovery.classification, "prepared-no-payload-mutation");
    assert.equal(payload.mutationPerformed, false);
    assert.equal(fs.readFileSync(preparedIntent.intentPath).equals(before), true);
  });
  await test("intent filename and activation ID mismatch rejects", () => {
    const mismatch = path.join(path.dirname(preparedIntent.intentPath),
      "20260802T120000000Z-ffffffffffff.json");
    fs.copyFileSync(preparedIntent.intentPath, mismatch);
    expectFailure(p2Fixture, ["--inspect-activation-intent", mismatch], "activation-intent-id-mismatch");
    fs.unlinkSync(mismatch);
  });
  for (const [field, value] of [
    ["sha256", "f".repeat(64)],
    ["version", "git version 0.0.0-fixture"],
    ["realpath", "/fixture/unapproved/git"],
  ]) {
    await test(`intent inspection rejects stable Git ${field} drift`, () => {
      const original = fs.readFileSync(preparedIntent.intentPath);
      const journal = JSON.parse(original);
      journal.gitExecutable[field] = value;
      fs.writeFileSync(preparedIntent.intentPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
      try {
        expectFailure(p2Fixture, ["--inspect-activation-intent", preparedIntent.intentPath],
          "activation-intent-source-mismatch");
      } finally {
        fs.writeFileSync(preparedIntent.intentPath, original, { mode: 0o600 });
      }
    });
  }
  for (const logicalName of ["alias", "dev_output", "extension"]) {
    await test(`intent inspection rejects ${logicalName} activation-intent tree mismatch`, () => {
      const original = fs.readFileSync(preparedIntent.intentPath);
      const journal = JSON.parse(original);
      const tree = journal.trees.find((entry) => entry.logicalName === logicalName);
      tree.incomingPath = `${tree.incomingPath}-mismatch`;
      fs.writeFileSync(preparedIntent.intentPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
      try {
        expectFailure(p2Fixture, ["--inspect-activation-intent", preparedIntent.intentPath],
          "activation-intent-tree-mismatch");
      } finally {
        fs.writeFileSync(preparedIntent.intentPath, original, { mode: 0o600 });
      }
    });
  }

  await test("publisher lock admits one winner and rejects concurrent intent ownership", () => {
    const root = tempRoot("p2-lock-contention");
    const evidence = lockEvidence(root);
    api.withPublisherLock(evidence.foundation, evidence.source, () => {
      expectActivatorError(() => api.withPublisherLock(evidence.foundation, evidence.source, () => null),
        "publisher-already-running");
    });
    assert.equal(fs.existsSync(evidence.foundation.publisherLock), false);
  });
  await test("stale publisher lock fails closed without deletion", () => {
    const root = tempRoot("p2-lock-stale");
    const evidence = lockEvidence(root);
    writeLock(evidence.foundation.publisherLock, {
      schemaVersion: 1, ownerId: "stale-owner", pid: 2147483647,
      repository: evidence.source.repository, approvedHead: evidence.source.approvedHead,
      startedAt: "2026-08-02T00:00:00.000Z",
    });
    expectActivatorError(() => api.withPublisherLock(evidence.foundation, evidence.source, () => null),
      "publisher-lock-stale");
    assert.equal(fs.existsSync(evidence.foundation.publisherLock), true);
  });
  await test("malformed and incomplete publisher locks fail closed", () => {
    const root = tempRoot("p2-lock-malformed");
    const evidence = lockEvidence(root);
    fs.mkdirSync(evidence.foundation.publisherLock);
    fs.writeFileSync(path.join(evidence.foundation.publisherLock, "lock.json"), "{bad");
    expectActivatorError(() => api.withPublisherLock(evidence.foundation, evidence.source, () => null),
      "publisher-lock-malformed");
    fs.writeFileSync(path.join(evidence.foundation.publisherLock, "lock.json"), "{}\n");
    expectActivatorError(() => api.withPublisherLock(evidence.foundation, evidence.source, () => null),
      "publisher-lock-incomplete");
    assert.equal(fs.existsSync(evidence.foundation.publisherLock), true);
  });
  await test("symlinked publisher lock fails closed", () => {
    const root = tempRoot("p2-lock-symlink");
    const evidence = lockEvidence(root);
    const target = path.join(root, "target");
    fs.mkdirSync(target);
    fs.symlinkSync(target, evidence.foundation.publisherLock);
    expectActivatorError(() => api.withPublisherLock(evidence.foundation, evidence.source, () => null),
      "publisher-lock-symlink");
    assert.equal(fs.lstatSync(evidence.foundation.publisherLock).isSymbolicLink(), true);
  });
  await test("publisher lock is released through success and thrown-callback finally paths", () => {
    const root = tempRoot("p2-lock-finally");
    const evidence = lockEvidence(root);
    assert.equal(api.withPublisherLock(evidence.foundation, evidence.source, () => "ok"), "ok");
    assert.equal(fs.existsSync(evidence.foundation.publisherLock), false);
    assert.throws(() => api.withPublisherLock(evidence.foundation, evidence.source, () => { throw new Error("fixture"); }),
      /fixture/u);
    assert.equal(fs.existsSync(evidence.foundation.publisherLock), false);
  });
  await test("wrong owner identity cannot release the publisher lock", async () => {
    const publisherApi = await import(`${pathToFileURL(path.join(ROOT, PUBLISHER_REL)).href}?lock=${Date.now()}`);
    const root = tempRoot("p2-lock-owner");
    const evidence = lockEvidence(root);
    api.withPublisherLock(evidence.foundation, evidence.source, (lock) => {
      assert.equal(publisherApi.releaseLock(evidence.foundation.publisherLock, process.pid, `${lock.ownerId}-wrong`),
        "not-owned");
      assert.equal(fs.existsSync(evidence.foundation.publisherLock), true);
    });
  });
  await test("two separate OS processes admit exactly one publisher-lock owner", async () => {
    const root = tempRoot("p21-os-lock-contention");
    const lockPath = path.join(root, ".h2o-publisher-lock");
    const marker = path.join(root, "first-owner-ready");
    const helper = path.join(root, "lock-helper.mjs");
    fs.writeFileSync(helper, [
      'import fs from "node:fs";',
      'const api = await import(process.argv[2]);',
      'const foundation = { publisherLock: process.argv[3] };',
      'const source = { repository: process.argv[4], approvedHead: "a".repeat(40) };',
      'try {',
      '  api.withPublisherLock(foundation, source, () => {',
      '    fs.writeFileSync(process.argv[5], String(process.pid));',
      '    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 700);',
      '  });',
      '  process.stdout.write("released\\n");',
      '} catch (error) { process.stderr.write(`${error.code || error.message}\\n`); process.exitCode = 2; }',
      "",
    ].join("\n"));
    const activatorUrl = pathToFileURL(path.join(ROOT, ACTIVATOR_REL)).href;
    const first = spawn(process.execPath, [helper, activatorUrl, lockPath, root, marker], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const deadline = Date.now() + 5_000;
    while (!fs.existsSync(marker) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(fs.existsSync(marker), true, "first OS process did not acquire the lock");
    const second = spawn(process.execPath, [helper, activatorUrl, lockPath, root, `${marker}-second`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const [firstResult, secondResult] = await Promise.all([collectChild(first), collectChild(second)]);
    assert.equal(firstResult.status, 0, firstResult.stderr);
    assert.equal(secondResult.status, 2);
    assert.match(secondResult.stderr, /publisher-already-running/u);
    assert.equal(fs.existsSync(`${marker}-second`), false);
    assert.equal(fs.existsSync(lockPath), false);
  });
  await test("spawned prepare CLI succeeds only inside a disposable fixture and releases its lock", () => {
    const value = createRepositoryFixture("p21 spawned cli success 🧪");
    const stageValue = createStageFixture(value.repository, "p21 spawned cli success 🧪");
    const result = runActivator(value, ["--prepare-activation-intent", stageValue.receiptPath]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.canonicalPayloadMutationPerformed, false);
    assert.equal(fs.existsSync(path.join(value.top, ".h2o-publisher-lock")), false);
    assert.equal(fs.existsSync(payload.intentPath), true);
  });
  await test("spawned prepare CLI rejects a symlinked anchor before lock acquisition", () => {
    const value = createRepositoryFixture("p21-spawned-cli-failure");
    const stageValue = createStageFixture(value.repository, "p21-spawned-cli-failure");
    const foreign = path.join(value.top, "foreign-anchor"); fs.mkdirSync(foreign);
    fs.symlinkSync(foreign, path.join(value.top, ".h2o-canonical-delivery"));
    const result = runActivator(value, ["--prepare-activation-intent", stageValue.receiptPath]);
    assert.notEqual(result.status, 0);
    assert.equal(codeOf(result), "canonical-anchor-symlink");
    assert.equal(fs.existsSync(path.join(value.top, ".h2o-publisher-lock")), false);
    assert.deepEqual(fs.readdirSync(foreign), []);
  });
  await test("genuine post-lock preparation failure releases lock without journal or payload access", async () => {
    const value = createRepositoryFixture("p22-post-lock-failure");
    const stageValue = createStageFixture(value.repository, "p22-post-lock-failure");
    const valueApi = await importFixtureActivator(value, "p22-post-lock-failure");
    const lockPath = path.join(value.top, ".h2o-publisher-lock");
    const anchor = path.join(value.top, ".h2o-canonical-delivery");
    const payloadPaths = new Set([
      path.join(value.repository, "apps", "dev-server", "alias"),
      path.join(value.repository, "apps", "dev-server", "dev_output"),
      path.join(value.repository, "apps", "extensions", "chatgpt", "chrome", "dev-controls-oauth-google"),
    ].map((entry) => normalizedGuardPath(entry)));
    const originalLstat = fs.lstatSync;
    let lockAcquired = false;
    let payloadInspections = 0;
    fs.lstatSync = (filename, ...args) => {
      if (payloadPaths.has(normalizedGuardPath(String(filename)))) payloadInspections += 1;
      return originalLstat(filename, ...args);
    };
    try {
      const verified = valueApi.verifyStageReceipt(stageValue.receiptPath);
      assert.throws(() => valueApi.withPublisherLock(
        verified.canonicalFoundation, verified.source, () => {
          assert.equal(fs.existsSync(lockPath), true);
          lockAcquired = true;
          throw new Error("fixture failure after publisher-lock acquisition");
        }), /fixture failure after publisher-lock acquisition/u);
    } finally {
      fs.lstatSync = originalLstat;
    }
    assert.equal(lockAcquired, true);
    assert.equal(fs.existsSync(lockPath), false);
    assert.equal(fs.existsSync(anchor), false);
    assert.equal(payloadInspections, 0);
  });
  await test("coordination and journal permissions remain owner-only", async () => {
    const value = createRepositoryFixture("p21-permissions-space 🧪");
    const stageValue = createStageFixture(value.repository, "p21-permissions-space 🧪");
    const valueApi = await importFixtureActivator(value, "permissions");
    const prepared = valueApi.prepareActivationIntent(stageValue.receiptPath, {
      now: FIXED_ACTIVATION_DATE, randomBytes: FIXED_RANDOM_BYTES,
    });
    const anchor = path.join(value.top, ".h2o-canonical-delivery");
    const intents = path.join(anchor, "activation-intents");
    assert.equal(fs.statSync(anchor).mode & 0o777, 0o700);
    assert.equal(fs.statSync(intents).mode & 0o777, 0o700);
    assert.equal(fs.statSync(prepared.intentPath).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(intents).some((name) => name.includes(".tmp-")), false);
  });
  await test("unsupported coordination-parent fsync is reported explicitly", async () => {
    const parent = tempRoot("p22-parent-fsync-unsupported");
    const originalOpen = fs.openSync; const originalFsync = fs.fsyncSync;
    let parentDescriptor = null;
    fs.openSync = (filename, ...args) => {
      const descriptor = originalOpen(filename, ...args);
      if (path.resolve(String(filename)) === path.resolve(parent)) parentDescriptor = descriptor;
      return descriptor;
    };
    fs.fsyncSync = (descriptor) => {
      if (descriptor === parentDescriptor) {
        const error = new Error("fixture unsupported parent fsync"); error.code = "EINVAL"; throw error;
      }
      return originalFsync(descriptor);
    };
    let evidence;
    try {
      evidence = api.flushDirectory(parent);
    } finally { fs.openSync = originalOpen; fs.fsyncSync = originalFsync; }
    assert.deepEqual(evidence,
      { attempted: true, succeeded: false, unsupported: true, code: "EINVAL" });
  });
  await test("hard coordination-parent fsync failure remains loud", async () => {
    const parent = tempRoot("p22-parent-fsync-hard");
    const originalOpen = fs.openSync; const originalFsync = fs.fsyncSync;
    let parentDescriptor = null;
    fs.openSync = (filename, ...args) => {
      const descriptor = originalOpen(filename, ...args);
      if (path.resolve(String(filename)) === path.resolve(parent)) parentDescriptor = descriptor;
      return descriptor;
    };
    fs.fsyncSync = (descriptor) => {
      if (descriptor === parentDescriptor) {
        const error = new Error("fixture hard parent fsync failure"); error.code = "EIO"; throw error;
      }
      return originalFsync(descriptor);
    };
    try {
      assert.throws(() => api.flushDirectory(parent),
        (error) => error?.code === "directory-fsync-failed" && error?.details?.code === "EIO");
    } finally { fs.openSync = originalOpen; fs.fsyncSync = originalFsync; }
  });
  await test("EPERM directory fsync is a hard error rather than unsupported evidence", async () => {
    const parent = tempRoot("p22-parent-fsync-eperm");
    const originalOpen = fs.openSync; const originalFsync = fs.fsyncSync;
    let parentDescriptor = null;
    fs.openSync = (filename, ...args) => {
      const descriptor = originalOpen(filename, ...args);
      if (path.resolve(String(filename)) === path.resolve(parent)) parentDescriptor = descriptor;
      return descriptor;
    };
    fs.fsyncSync = (descriptor) => {
      if (descriptor === parentDescriptor) {
        const error = new Error("fixture parent fsync permission failure"); error.code = "EPERM"; throw error;
      }
      return originalFsync(descriptor);
    };
    try {
      assert.throws(() => api.flushDirectory(parent),
        (error) => error?.code === "directory-fsync-failed" && error?.details?.code === "EPERM");
    } finally { fs.openSync = originalOpen; fs.fsyncSync = originalFsync; }
  });

  await test("symlinked activation-intents directory rejects and lock is released", async () => {
    const value = createRepositoryFixture("p2-intents-symlink");
    const stageValue = createStageFixture(value.repository, "p2-intents-symlink");
    const valueApi = await importFixtureActivator(value, "intents-symlink");
    const anchor = path.join(value.top, ".h2o-canonical-delivery");
    const target = path.join(value.top, "foreign-intents");
    fs.mkdirSync(anchor, { mode: 0o700 });
    fs.mkdirSync(target, { mode: 0o700 });
    fs.symlinkSync(target, path.join(anchor, "activation-intents"));
    expectActivatorError(() => valueApi.prepareActivationIntent(stageValue.receiptPath), "activation-intents-symlink");
    assert.equal(fs.existsSync(path.join(value.top, ".h2o-publisher-lock")), false);
  });
  await test("symlinked canonical anchor rejects intent preparation without following it", async () => {
    const value = createRepositoryFixture("p2-anchor-symlink");
    const stageValue = createStageFixture(value.repository, "p2-anchor-symlink");
    const valueApi = await importFixtureActivator(value, "anchor-symlink");
    const target = path.join(value.top, "foreign-anchor"); fs.mkdirSync(target);
    fs.symlinkSync(target, path.join(value.top, ".h2o-canonical-delivery"));
    expectActivatorError(() => valueApi.prepareActivationIntent(stageValue.receiptPath), "canonical-anchor-symlink");
    assert.deepEqual(fs.readdirSync(target), []);
  });
  await test("unresolved foreign intent blocks preparation", async () => {
    const value = createRepositoryFixture("p2-unresolved");
    const stageValue = createStageFixture(value.repository, "p2-unresolved");
    const valueApi = await importFixtureActivator(value, "unresolved");
    const anchor = path.join(value.top, ".h2o-canonical-delivery");
    const intents = path.join(anchor, "activation-intents");
    fs.mkdirSync(anchor, { mode: 0o700 });
    fs.mkdirSync(intents, { mode: 0o700 });
    fs.writeFileSync(path.join(intents, "foreign.json"), "{}\n");
    expectActivatorError(() => valueApi.prepareActivationIntent(stageValue.receiptPath), "activation-intent-unresolved");
    assert.equal(fs.existsSync(path.join(value.top, ".h2o-publisher-lock")), false);
  });
  await test("existing final journal collision rejects without overwrite", () => {
    const directory = tempRoot("p2-journal-collision");
    const existing = path.join(directory, `${FIXED_ACTIVATION_ID}.json`);
    fs.writeFileSync(existing, "original\n");
    expectActivatorError(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
      ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    }), "activation-intent-collision");
    assert.equal(fs.readFileSync(existing, "utf8"), "original\n");
  });
  await test("final no-replace link failure cleans only its own temporary file", () => {
    const directory = tempRoot("p2-journal-temp-failure");
    const sentinel = path.join(directory, "foreign.tmp"); fs.writeFileSync(sentinel, "keep");
    const originalLink = fs.linkSync;
    fs.linkSync = (source, destination) => {
      if (String(source).includes(`${FIXED_ACTIVATION_ID}.json.tmp-`)) {
        const error = new Error("fixture link failure"); error.code = "EIO"; throw error;
      }
      return originalLink(source, destination);
    };
    try {
      assert.throws(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
        ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }), (error) => error.code === "activation-intent-link-failed");
    } finally { fs.linkSync = originalLink; }
    assert.deepEqual(fs.readdirSync(directory), ["foreign.tmp"]);
  });
  await test("failed final journal byte verification is loud and leaves durable evidence", () => {
    const directory = tempRoot("p2-journal-final-verify");
    const finalPath = path.join(directory, `${FIXED_ACTIVATION_ID}.json`);
    const originalRead = fs.readFileSync;
    fs.readFileSync = (filename, ...args) => path.resolve(String(filename)) === finalPath
      ? Buffer.from("corrupt") : originalRead(filename, ...args);
    try {
      expectActivatorError(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
        ownerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }), "activation-intent-final-verification");
    } finally { fs.readFileSync = originalRead; }
    assert.equal(fs.existsSync(finalPath), true);
  });
  await test("temporary journal open failure creates and removes nothing", () => {
    const directory = tempRoot("p21-journal-open-failure");
    const originalOpen = fs.openSync;
    fs.openSync = (filename, ...args) => {
      if (String(filename).includes(".json.tmp-")) {
        const error = new Error("fixture temp open failure"); error.code = "EACCES"; throw error;
      }
      return originalOpen(filename, ...args);
    };
    try {
      assert.throws(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
        ownerId: "11111111-2222-3333-4444-555555555555",
      }), /fixture temp open failure/u);
    } finally { fs.openSync = originalOpen; }
    assert.deepEqual(fs.readdirSync(directory), []);
  });
  await test("temporary journal write failure cleans only the invocation-owned temp", () => {
    const directory = tempRoot("p21-journal-write-failure");
    const originalWrite = fs.writeFileSync;
    fs.writeFileSync = (filename, ...args) => {
      if (typeof filename === "number") {
        const error = new Error("fixture temp write failure"); error.code = "EIO"; throw error;
      }
      return originalWrite(filename, ...args);
    };
    try {
      assert.throws(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
        ownerId: "11111111-2222-3333-4444-555555555555",
      }), /fixture temp write failure/u);
    } finally { fs.writeFileSync = originalWrite; }
    assert.deepEqual(fs.readdirSync(directory), []);
  });
  await test("file fsync failure prevents final publication and cleans the owned temp", () => {
    const directory = tempRoot("p21-journal-file-fsync-failure");
    const originalFsync = fs.fsyncSync;
    let calls = 0;
    fs.fsyncSync = (descriptor) => {
      calls += 1;
      if (calls === 1) { const error = new Error("fixture file fsync failure"); error.code = "EIO"; throw error; }
      return originalFsync(descriptor);
    };
    try {
      assert.throws(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
        ownerId: "11111111-2222-3333-4444-555555555555",
      }), /fixture file fsync failure/u);
    } finally { fs.fsyncSync = originalFsync; }
    assert.deepEqual(fs.readdirSync(directory), []);
  });
  await test("unsupported directory fsync is explicit without overstating power-loss durability", () => {
    const directory = tempRoot("p21-directory-fsync-unsupported");
    const originalOpen = fs.openSync; const originalFsync = fs.fsyncSync;
    let directoryDescriptor = null;
    fs.openSync = (filename, ...args) => {
      const descriptor = originalOpen(filename, ...args);
      if (path.resolve(String(filename)) === path.resolve(directory)) directoryDescriptor = descriptor;
      return descriptor;
    };
    fs.fsyncSync = (descriptor) => {
      if (descriptor === directoryDescriptor) { const error = new Error("unsupported"); error.code = "EINVAL"; throw error; }
      return originalFsync(descriptor);
    };
    let result;
    try {
      result = api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
        ownerId: "11111111-2222-3333-4444-555555555555",
      });
    } finally { fs.openSync = originalOpen; fs.fsyncSync = originalFsync; }
    assert.deepEqual(result.durability.directoryFsync,
      { attempted: true, succeeded: false, unsupported: true, code: "EINVAL" });
    assert.equal(result.durability.powerLossDurabilityGuaranteed, false);
  });
  await test("hard directory fsync failure is loud after no-replace publication", () => {
    const directory = tempRoot("p21-directory-fsync-hard-failure");
    const finalPath = path.join(directory, `${FIXED_ACTIVATION_ID}.json`);
    const originalOpen = fs.openSync; const originalFsync = fs.fsyncSync;
    let directoryDescriptor = null;
    fs.openSync = (filename, ...args) => {
      const descriptor = originalOpen(filename, ...args);
      if (path.resolve(String(filename)) === path.resolve(directory)) directoryDescriptor = descriptor;
      return descriptor;
    };
    fs.fsyncSync = (descriptor) => {
      if (descriptor === directoryDescriptor) { const error = new Error("fixture directory fsync failure"); error.code = "EIO"; throw error; }
      return originalFsync(descriptor);
    };
    try {
      assert.throws(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
        ownerId: "11111111-2222-3333-4444-555555555555",
      }), (error) => error?.code === "directory-fsync-failed" && error?.details?.code === "EIO");
    } finally { fs.openSync = originalOpen; fs.fsyncSync = originalFsync; }
    assert.equal(fs.existsSync(finalPath), true);
  });
  await test("same-owner temporary collision cannot delete another process temp", () => {
    const directory = tempRoot("p21-same-owner-temp-collision");
    const ownerId = "11111111-2222-3333-4444-555555555555";
    const tempPath = path.join(directory, `.${FIXED_ACTIVATION_ID}.json.tmp-${ownerId}`);
    fs.writeFileSync(tempPath, "foreign-owned-temp\n", { mode: 0o600 });
    assert.throws(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, { ownerId }),
      (error) => error.code === "activation-intent-temp-collision");
    assert.equal(fs.readFileSync(tempPath, "utf8"), "foreign-owned-temp\n");
    assert.equal(fs.existsSync(path.join(directory, `${FIXED_ACTIVATION_ID}.json`)), false);
  });
  await test("no-replace publication loses a race without overwriting the winner", () => {
    const directory = tempRoot("p21-link-race");
    const finalPath = path.join(directory, `${FIXED_ACTIVATION_ID}.json`);
    const originalLink = fs.linkSync;
    let temporaryMode = null;
    fs.linkSync = (source, destination) => {
      temporaryMode = fs.statSync(source).mode & 0o777;
      fs.writeFileSync(destination, "winning-process\n", { mode: 0o600 });
      return originalLink(source, destination);
    };
    try {
      expectActivatorError(() => api.writeDurableActivationIntent(directory, FIXED_ACTIVATION_ID, {}, {
        ownerId: "11111111-2222-3333-4444-555555555555",
      }), "activation-intent-collision");
    } finally { fs.linkSync = originalLink; }
    assert.equal(fs.readFileSync(finalPath, "utf8"), "winning-process\n");
    assert.equal(temporaryMode, 0o600);
    assert.deepEqual(fs.readdirSync(directory), [`${FIXED_ACTIVATION_ID}.json`]);
  });

  async function runPostLockMutation(label, mutation, expectedCode) {
    const value = createRepositoryFixture(`p2-revalidate-${label}`);
    const stageValue = createStageFixture(value.repository, `p2-revalidate-${label}`);
    const valueApi = await importFixtureActivator(value, label);
    const originalRename = fs.renameSync;
    let injected = false;
    fs.renameSync = (source, destination) => {
      const result = originalRename(source, destination);
      if (!injected && path.basename(String(destination)) === ".h2o-publisher-lock") {
        injected = true;
        mutation(value, stageValue);
      }
      return result;
    };
    try {
      expectActivatorError(() => valueApi.prepareActivationIntent(stageValue.receiptPath), expectedCode);
    } finally {
      fs.renameSync = originalRename;
    }
    assert.equal(injected, true);
    assert.equal(fs.existsSync(path.join(value.top, ".h2o-publisher-lock")), false);
    assert.equal(fs.existsSync(path.join(value.top, ".h2o-canonical-delivery")), false);
  }
  await test("receipt byte change after P1 verification rejects before journal creation", async () => {
    await runPostLockMutation("receipt", (_value, stageValue) => fs.appendFileSync(stageValue.receiptPath, " "),
      "activation-intent-revalidation-changed");
  });
  await test("source HEAD and tree change after P1 verification rejects before journal creation", async () => {
    await runPostLockMutation("head", (value) => {
      fs.writeFileSync(path.join(value.repository, "fixture-source", "head-change.js"), "export const changed = true;\n");
      git(value.repository, ["add", "fixture-source/head-change.js"]);
      git(value.repository, ["commit", "-q", "-m", "fixture: head changes during lock"]);
    }, "receipt-head-mismatch");
  });
  await test("dirty source after P1 verification rejects before journal creation", async () => {
    await runPostLockMutation("dirty", (value) => fs.appendFileSync(value.activator, "\n// dirty fixture\n"),
      "tracked-worktree-dirty");
  });
  await test("staged bytes changed after P1 verification reject before journal creation", async () => {
    await runPostLockMutation("staged", (_value, stageValue) =>
      fs.appendFileSync(path.join(stageValue.extension, "bg.js"), "// changed\n"),
    "staged-manifest-entry-mismatch");
  });

  await test("changed receipt after intent creation rejects inspection", async () => {
    const value = createRepositoryFixture("p2-inspect-receipt-change");
    const stageValue = createStageFixture(value.repository, "p2-inspect-receipt-change");
    const valueApi = await importFixtureActivator(value, "inspect-receipt-change");
    const prepared = valueApi.prepareActivationIntent(stageValue.receiptPath, {
      now: FIXED_ACTIVATION_DATE, randomBytes: FIXED_RANDOM_BYTES,
    });
    fs.appendFileSync(stageValue.receiptPath, " ");
    expectFailure(value, ["--inspect-activation-intent", prepared.intentPath], "activation-intent-receipt-changed");
  });
  await test("changed staged bytes after intent creation reject inspection", async () => {
    const value = createRepositoryFixture("p2-inspect-stage-change");
    const stageValue = createStageFixture(value.repository, "p2-inspect-stage-change");
    const valueApi = await importFixtureActivator(value, "inspect-stage-change");
    const prepared = valueApi.prepareActivationIntent(stageValue.receiptPath, {
      now: FIXED_ACTIVATION_DATE, randomBytes: FIXED_RANDOM_BYTES,
    });
    fs.appendFileSync(path.join(stageValue.extension, "bg.js"), "// changed\n");
    expectFailure(value, ["--inspect-activation-intent", prepared.intentPath], "staged-manifest-entry-mismatch");
  });
  await test("valid partial promotion state fails closed with P3 recovery required", () => {
    const journal = structuredClone(preparedIntent.journal);
    Object.assign(journal.trees[0], {
      state: "live-retired", previousState: "absent", previousIdentity: null,
      restorationMode: "remove-promoted-to-absent", verified: false,
    });
    assert.equal(api.classifyRecoveryState(journal).classification,
      "promotion-state-requires-p3-recovery");
    assert.equal(api.classifyRecoveryState(journal).code, "p3-recovery-required");
  });
  await test("intent inspection rejects payload-mutated state with P3 recovery required", () => {
    const original = fs.readFileSync(preparedIntent.intentPath);
    const journal = JSON.parse(original);
    Object.assign(journal.trees[0], {
      state: "live-retired", previousState: "absent", previousIdentity: null,
      restorationMode: "remove-promoted-to-absent", verified: false,
    });
    fs.writeFileSync(preparedIntent.intentPath, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
    try {
      expectFailure(p2Fixture, ["--inspect-activation-intent", preparedIntent.intentPath], "p3-recovery-required");
    } finally {
      fs.writeFileSync(preparedIntent.intentPath, original, { mode: 0o600 });
    }
  });
  await test("contradictory journal state is rejected", () => {
    const journal = structuredClone(preparedIntent.journal);
    journal.trees[0].state = "verified";
    assert.equal(api.classifyRecoveryState(journal).classification, "contradictory-journal");
  });
  await test("recovery model distinguishes promotion-not-started", () => {
    const journal = structuredClone(preparedIntent.journal);
    journal.transactionState = "promotion-not-started";
    assert.equal(api.classifyRecoveryState(journal).classification, "promotion-not-started");
  });
  await test("first-ever restoration to absent is representable without guessing recovery", () => {
    const journal = structuredClone(preparedIntent.journal);
    Object.assign(journal.trees[1], {
      state: "incoming-promoted", previousState: "absent", previousIdentity: null,
      restorationMode: "remove-promoted-to-absent", verified: false,
    });
    assert.equal(api.classifyRecoveryState(journal).code, "p3-recovery-required");
  });
  await test("foreign or unowned journal identity is classified separately", () => {
    assert.equal(api.classifyRecoveryState(preparedIntent.journal, {
      repositoryRealpath: "/foreign/repository",
    }).classification, "foreign-or-unowned-journal");
  });
  // Test-first evidence for the P3A canonical-root pin. Every fixture in this
  // suite is a relocated standalone copy, and each one derives a self-consistent
  // module / executable-Git / anchor authority. That is exactly the gap: P2.3
  // proves the three agree with one another, never that they are a production
  // location, so a copy anywhere on disk is accepted.
  await test("integrated P2.3 authority accepts a self-consistent relocated copy", async () => {
    const relocated = createRepositoryFixture("p3a-relocated-copy");
    const relocatedApi = await importFixtureActivator(relocated, "p3a-relocated-copy");
    const foundation = relocatedApi.deriveCanonicalFoundation(relocated.repository);
    assert.equal(normalizedGuardPath(foundation.root),
      normalizedGuardPath(path.join(relocated.top, ".h2o-canonical-delivery")));
    assert.notEqual(normalizedGuardPath(relocated.repository),
      normalizedGuardPath("/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source"));
  });
  await test("the P3A canonical-root pin rejects that same relocated copy", async () => {
    const relocated = createRepositoryFixture("p3a-relocated-pin");
    const relocatedApi = await importFixtureActivator(relocated, "p3a-relocated-pin");
    const payload = await import(
      `${pathToFileURL(path.join(ROOT, PAYLOAD_MODULE_REL)).href}?validator=${Date.now()}`);
    const foundation = relocatedApi.deriveCanonicalFoundation(relocated.repository);
    assert.throws(() => payload.assertApprovedCanonicalRoot({
      repository: relocated.repository,
      cockpitProRoot: path.dirname(relocated.repository),
      anchorRoot: foundation.root,
      executableRepository: relocated.repository,
    }), (error) => error.code === "canonical-root-not-approved");
    // Fixture roots are reachable only through explicit injection.
    assert.equal(payload.assertApprovedCanonicalRoot({
      repository: relocated.repository,
      cockpitProRoot: path.dirname(relocated.repository),
      anchorRoot: foundation.root,
      executableRepository: relocated.repository,
      approvedRepositories: [relocated.repository],
      approvedCockpitProRoots: [path.dirname(relocated.repository)],
    }).approved, true);
  });
}

function runStructuralTests() {
  const source = fs.readFileSync(path.join(ROOT, ACTIVATOR_REL), "utf8");
  const canonicalSource = fs.readFileSync(path.join(ROOT, CANONICAL_LIB_REL), "utf8");
  const validatorSource = fs.readFileSync(path.join(ROOT, VALIDATOR_REL), "utf8");
  structural("production writes are limited to lock support, coordination directories, one journal, and own-temp cleanup", () => {
    assert.match(source, /function writeDurableActivationIntent/u);
    assert.doesNotMatch(source, /fs\.(?:copyFile|rm|rmdir|symlink|appendFile)(?:Sync)?\s*\(/u);
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
  structural("accepted P0/P1 activator blob remains immutably attested", () => {
    assert.notEqual(sha256(fs.readFileSync(path.join(ROOT, ACTIVATOR_REL))), ACCEPTED_ACTIVATOR_SHA256);
    assert.equal(sha256(execFileSync("git", ["show", `${ACCEPTED_P1_HEAD}:${ACTIVATOR_REL}`], { cwd: ROOT })),
      ACCEPTED_ACTIVATOR_SHA256);
  });
  structural("registered-main authority is internally derived from Git ancestry and exact scope", () => {
    assert.equal(authoritativeMainWorktree.length, 0);
    assert.match(validatorSource, /merge-base["'`],\s*["'`]--is-ancestor/u);
    assert.match(validatorSource, /const executionState = currentScopeState\(\)/u);
    assert.match(validatorSource, /classifyScope\(executionState\)/u);
  });
  structural("every activator Git execution is routed through the explicit read-only allow-list", () => {
    assert.match(source, /export function assertAllowedGitCommand/u);
    assert.match(source, /export function runReadOnlyGit[\s\S]*assertAllowedGitCommand\(args\)/u);
    assert.match(source, /runPinnedReadOnlyGit\(repository, args/u);
    assert.equal((source.match(/execFileSync\(["'`]git["'`]/gu) || []).length, 0);
  });
  structural("P2.1 freezes Git argv authority and sanitizes repository/config redirection", () => {
    assert.match(canonicalSource, /Object\.freeze\(\[\s*"rev-parse\\u0000--show-toplevel"/u);
    assert.match(canonicalSource, /export function sanitizedGitEnvironment/u);
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
      "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) assert.doesNotMatch(canonicalSource, new RegExp(`safe\\.${name}\\s*=`));
    assert.match(canonicalSource, /GIT_CONFIG_GLOBAL = "\/dev\/null"/u);
  });
  structural("repository, cockpit root, anchor, and extension variant are independently pinned", () => {
    assert.match(source, /fs\.realpathSync\.native\(REPOSITORY_ROOT\)/u);
    assert.match(source, /expectedCockpitProRoot/u);
    assert.match(source, /module-repository-mismatch/u);
    assert.match(source, /ACCEPTED_EXTENSION_VARIANT = "dev-controls-oauth-google"/u);
  });
  structural("P2 exposes only intent prepare and inspect coordination commands", () => {
    assert.match(source, /--prepare-activation-intent/u);
    assert.match(source, /--inspect-activation-intent/u);
    assert.match(source, /activation-not-implemented/u);
  });
  structural("journal durability uses exclusive temp creation, fsync, no-replace hard link and byte verification", () => {
    assert.match(source, /openSync\(tempPath, "wx", 0o600\)/u);
    assert.match(source, /fs\.fsyncSync\(descriptor\)/u);
    assert.match(source, /fs\.linkSync\(tempPath, finalPath\)/u);
    assert.doesNotMatch(source, /fs\.renameSync\(tempPath, finalPath\)/u);
    assert.match(source, /observed\.equals\(bytes\)/u);
  });
  structural("temporary journal cleanup is guarded by invocation ownership", () => {
    assert.match(source, /let tempOwned = false/u);
    assert.match(source, /tempOwned = true/u);
    assert.match(source, /removeOwnJournalTemp\(tempPath, intentsDirectory, tempBasename, tempOwned\)/u);
  });
  structural("durability evidence explicitly disclaims full power-loss guarantees", () => {
    assert.match(source, /powerLossDurabilityGuaranteed:\s*false/u);
    assert.doesNotMatch(source, /F_FULLFSYNC|powerLossDurabilityGuaranteed:\s*true/u);
  });
  structural("module documents lock mutations and the canonical-library Git trust boundary", () => {
    assert.match(source, /publisher-lock\s*\n\/\/ support directory and lock lifecycle/u);
    assert.match(source, /CANONICAL_DELIVERY_LIB_TRUST_BOUNDARY/u);
    assert.match(source, /share one pinned executable, sanitized environment, and exact read-only argv boundary/u);
  });
  structural("recovery classifier is pure and requires P3 for payload-mutated states", () => {
    assert.match(source, /export function classifyRecoveryState/u);
    assert.match(source, /promotion-state-requires-p3-recovery/u);
    assert.match(source, /p3-recovery-required/u);
  });
  structural("canonical payload copy, delete and symlink mutation APIs remain absent", () => {
    assert.doesNotMatch(source, /fs\.(?:copyFile|rm|rmdir|symlink)(?:Sync)?\s*\(/u);
    assert.equal((source.match(/fs\.linkSync\(/gu) || []).length, 1);
  });
  structural("P2 creates neither activation nor rollback receipt directories", () => {
    assert.doesNotMatch(source, /ensureCoordinationDirectory\([^\n]*(?:activations|rollbacks)/u);
    assert.doesNotMatch(source, /activation-receipt\.json|rollback-receipt\.json/u);
  });
  structural("P2 imports and reuses the accepted Batch 1 publisher lock primitives", () => {
    assert.match(source, /import \{ acquireLock, releaseLock \} from "\.\/lean-publisher\.mjs"/u);
    assert.match(source, /withPublisherLock/u);
  });
  structural("P2 validator scope remains exactly the two authorized source paths", () => {
    assert.deepEqual(P2_AUTHORIZED_PATHS, [ACTIVATOR_REL, VALIDATOR_REL].sort());
    assert.match(validatorSource, /P2_BASE_HEAD/u);
    assert.match(validatorSource, /P2_SUBJECT/u);
  });
  structural("P2.2 pins a regular absolute Git executable and never falls back to PATH lookup", () => {
    assert.match(canonicalSource, /const TRUSTED_GIT_CANDIDATES = Object\.freeze/u);
    assert.match(canonicalSource, /"\/usr\/bin\/git"/u);
    assert.match(canonicalSource, /stat\.isSymbolicLink\(\)/u);
    assert.match(canonicalSource, /execFileSync\(TRUSTED_GIT_EXECUTABLE_IDENTITY\.realpath/u);
    assert.doesNotMatch(canonicalSource, /execFileSync\(["'`]git["'`]/u);
  });
  structural("canonical-delivery library shares the exact Git gate and validates core.worktree independently", () => {
    assert.match(canonicalSource, /export function assertAllowedReadOnlyGitCommand/u);
    assert.match(canonicalSource, /export function runPinnedReadOnlyGit/u);
    assert.match(canonicalSource, /export function validateConfiguredWorktree/u);
    assert.match(canonicalSource, /registeredWorktreeRoots\.includes\(normalized\)/u);
    assert.equal((canonicalSource.match(/execFileSync\(/gu) || []).length, 3);
  });
  structural("coordination directory creation flushes its parent and treats EPERM as a hard error", () => {
    assert.match(source, /parentDirectoryFsync:\s*created[\s\S]*flushDirectory\(path\.dirname\(directory\)\)/u);
    assert.doesNotMatch(source, /\["EINVAL", "ENOTSUP", "EISDIR", "EPERM"\]/u);
    assert.match(source, /activation-intent-temp-collision/u);
  });
  structural("P2.2 scope remains exactly activator, canonical library, and activator validator", () => {
    assert.deepEqual(P22_AUTHORIZED_PATHS, [ACTIVATOR_REL, CANONICAL_LIB_REL, VALIDATOR_REL].sort());
    assert.match(validatorSource, /ACCEPTED_P21_HEAD/u);
    assert.match(validatorSource, /P22_SUBJECT/u);
  });
  structural("P2.3 pins the activator canonical-library import capability exactly", () => {
    assert.deepEqual(canonicalLibraryImports(source), ACCEPTED_CANONICAL_LIBRARY_IMPORTS);
    for (const forbidden of ["atomicWriteJson", "rmSync", "renameSync", "copyFileSync"]) {
      assert.equal(ACCEPTED_CANONICAL_LIBRARY_IMPORTS.includes(forbidden), false);
    }
  });
  structural("P2.3 separates stable durable Git identity from process-local attestation", () => {
    assert.match(source, /STABLE_GIT_IDENTITY_KEYS/u);
    assert.match(source, /gitExecutableProcessAttestation/u);
    assert.match(source, /gitExecutableStable/u);
  });
  structural("all shared production Git calls use the frozen thirty-second timeout", () => {
    assert.match(canonicalSource, /export const READ_ONLY_GIT_TIMEOUT_MS = 30_000/u);
    assert.equal((canonicalSource.match(/timeout:\s*READ_ONLY_GIT_TIMEOUT_MS/gu) || []).length, 2);
    assert.doesNotMatch(canonicalSource, /timeout:\s*10_000/u);
  });
  structural("payload safety guards normalize existing ancestors before lexical suffixes", () => {
    assert.match(validatorSource, /function normalizedGuardPath/u);
    assert.match(validatorSource, /fs\.realpathSync\.native\(cursor\)/u);
    assert.match(validatorSource, /function sameOrWithin/u);
  });
  structural("P2.3 scope remains exactly the four approved guardrail paths", () => {
    assert.deepEqual(P23_AUTHORIZED_PATHS,
      [ACTIVATOR_REL, CANONICAL_LIB_REL, VALIDATOR_REL, OWNER_VALIDATOR_REL].sort());
    assert.match(validatorSource, /ACCEPTED_P22_HEAD/u);
    assert.match(validatorSource, /P23_SUBJECT/u);
  });
  structural("P3 must revalidate every authority and treat the intent only as a proposal", () => {
    for (const requirement of [
      "verify-stage-receipt-immediately-before-payload-preparation",
      "reverify-stage-receipt-sha256",
      "recompute-all-three-staged-manifests-and-tree-digests",
      "revalidate-source-branch",
      "revalidate-source-head",
      "revalidate-source-tree",
      "revalidate-tracked-worktree-cleanliness",
      "revalidate-empty-index",
      "revalidate-absence-of-non-ignored-untracked-source",
      "reattest-stable-git-executable-identity",
      "rederive-repository-cockpit-root-and-canonical-anchor",
      "pin-approved-production-canonical-root",
      "revalidate-accepted-extension-variant",
      "revalidate-build-marker-coherence",
      "revalidate-staging-root-existence",
      "reject-head-tree-receipt-or-staged-byte-change",
      "prove-publisher-lock-ownership",
      "revalidate-intent-identity-and-state",
      "reject-unresolved-or-foreign-transaction-journal",
      "reject-incoming-or-retired-sibling-owned-by-another-activation",
      "treat-intent-as-proposal-not-promotion-authority",
    ]) assert(source.includes(JSON.stringify(requirement)));
  });
  structural("P3A grants the activator no payload-transaction capability at all", () => {
    // The strongest available boundary: there is no import edge. Any P3B
    // expansion must add one here and therefore change this assertion.
    assert.doesNotMatch(source, /lean-payload-transaction/u);
    assert.doesNotMatch(source, /import\s*\(/u);
    const declarations = [...source.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["'];/gu)].map((match) => match[1]);
    assert.deepEqual(declarations.filter((entry) => entry.startsWith("./")).sort(),
      ["./canonical-delivery-lib.mjs", "./lean-publisher.mjs"]);
  });
  structural("the P3A payload module depends only on Node builtins", () => {
    const payloadSource = fs.readFileSync(path.join(ROOT, PAYLOAD_MODULE_REL), "utf8");
    const declarations = [...payloadSource.matchAll(/import\s+[^;]*?from\s+["']([^"']+)["'];/gu)]
      .map((match) => match[1]).sort();
    assert.deepEqual(declarations, ["node:crypto", "node:fs", "node:path"]);
    assert.doesNotMatch(payloadSource, /import\s*\(/u);
    assert.doesNotMatch(payloadSource,
      /from\s+["'][^"']*(?:canonical-delivery-lib|lean-publisher|lean-activator)/u);
  });
  structural("the P3A payload module exposes no CLI, shell, network or browser capability", () => {
    const payloadSource = fs.readFileSync(path.join(ROOT, PAYLOAD_MODULE_REL), "utf8");
    assert.doesNotMatch(payloadSource, /child_process|\bspawn(?:Sync)?\s*\(|execFileSync|execSync/u);
    assert.doesNotMatch(payloadSource, /node:(?:net|http|https|dns|tls)|fetch\s*\(|XMLHttpRequest/u);
    assert.doesNotMatch(payloadSource, /process\.argv/u);
    assert.doesNotMatch(payloadSource, /runLeanActivator|--activate-receipt|--prepare-activation-intent/u);
  });
  structural("no production module gains a rename primitive in P3A", () => {
    const payloadSource = fs.readFileSync(path.join(ROOT, PAYLOAD_MODULE_REL), "utf8");
    for (const text of [source, payloadSource]) {
      assert.doesNotMatch(text, /fs\.rename(?:Sync)?\s*\(/u);
      assert.doesNotMatch(text, /fs\.promises\.rename\s*\(/u);
    }
  });
  structural("P3A creates no retired sibling and no failed-act family", () => {
    const payloadSource = fs.readFileSync(path.join(ROOT, PAYLOAD_MODULE_REL), "utf8");
    for (const text of [source, payloadSource]) assert.doesNotMatch(text, /failed-act-/u);
    // The retired name is derived for later phases but never created in P3A.
    assert.doesNotMatch(payloadSource, /mkdirSync\([^)]*retiredPath/u);
    assert.doesNotMatch(payloadSource, /linkSync\([^)]*retiredPath|renameSync\([^)]*retiredPath/u);
  });
  structural("P3A adds no package command and keeps the four-path scope", () => {
    const packageSource = fs.readFileSync(path.join(ROOT, PACKAGE_REL), "utf8");
    assert.doesNotMatch(packageSource, /lean-payload-transaction|--activate-receipt|--rollback|--recover|--prune|--verify-canonical|publish:h2o:activate/u);
    assert.deepEqual(P3A_AUTHORIZED_PATHS,
      [ACTIVATOR_REL, PAYLOAD_MODULE_REL, VALIDATOR_REL, PAYLOAD_VALIDATOR_REL].sort());
    assert.match(validatorSource, /ACCEPTED_P23_HEAD/u);
    assert.match(validatorSource, /P3A_SUBJECT/u);
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
