#!/usr/bin/env node
// Lean canonical activator — Batch 2 P0/P1 (read-only preflight only).
//
// This module verifies a Batch 1 stage-only publication receipt and independently
// recomputes every staged manifest. It contains no activation, backup, rename,
// rollback, recovery, pruning, browser, network, or push capability.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deriveSharedAnchor } from "./canonical-delivery-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, "..", "..");
export const RECEIPT_SCHEMA_VERSION = 1;
export const RECEIPT_BASENAME = "publication-receipt.json";
export const STAGING_PREFIX = "h2o-publish-stage-";
export const FOUNDATION_COMMITS = Object.freeze([
  "3ce2264ad0e32d9a6fa4d17b4cf89f84d652db2f",
  "b4f5e730a5a39a7b45571138d48aafe4710cb90a",
  "6920f812263ed03d79888f06e5e849fe4dcca43e",
  "86af342f1b1815e12c477673a4f2123b37bede40",
]);
export const OUTPUT_FAMILIES = Object.freeze(["alias", "devOutput", "extension"]);
export const REQUIRED_EXTENSION_FILES = Object.freeze([
  "manifest.json",
  "loader.js",
  "bg.js",
  "title-contract-bridge.js",
  "provider/identity-provider-supabase.js",
]);
export const FUTURE_TREE_STATES = Object.freeze([
  "untouched",
  "incoming-prepared",
  "live-retired",
  "incoming-promoted",
  "verified",
  "restored",
]);
export const FUTURE_COORDINATION_SUBPATHS = Object.freeze([
  "activation-intents",
  "activations",
  "rollbacks",
]);
export const FUTURE_PROMOTION_DESCRIPTION = "transactionally recoverable three-tree promotion";
// The future three-tree release is sequential and recoverable. It is not a
// cross-tree atomic swap, and adjacent renames do not eliminate missing-path
// intervals. No rename or other promotion primitive exists in this P0/P1 file.

const TEXT_OUTPUT_PATTERN = /\.(?:js|json|txt|html|css)$/iu;
const DESTINATION_OVERRIDE_NAMES = Object.freeze([
  "H2O_SRC_DIR",
  "H2O_ORDER_FILE",
  "H2O_SERVER_DIR",
  "H2O_DEV_DIR_NAME",
  "H2O_PROXY_PACK_FILE",
  "H2O_EXT_BUILD_ROOT",
  "H2O_EXT_VARIANT",
  "H2O_CANONICAL_DELIVERY_ROOT",
]);

export class ActivatorError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ActivatorError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new ActivatorError(code, message, details);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(filename) {
  return sha256Bytes(fs.readFileSync(filename));
}

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Resolve the deepest existing ancestor without requiring the target to exist. */
export function realAware(target) {
  let cursor = path.resolve(target);
  const suffix = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }
  let base = cursor;
  if (fs.existsSync(cursor)) {
    try {
      base = fs.realpathSync.native(cursor);
    } catch {
      base = fs.realpathSync(cursor);
    }
  }
  return path.resolve(base, ...suffix);
}

function git(repository, args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", ["-C", repository, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    }).trim();
  } catch (error) {
    if (allowFailure) return null;
    fail("git-command-failed", "Required read-only Git evidence could not be obtained.", {
      args,
      status: error?.status ?? null,
      stderr: String(error?.stderr || "").trim().slice(0, 500),
    });
  }
}

function gitIsAncestor(repository, ancestor, descendant) {
  try {
    execFileSync("git", ["-C", repository, "merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: "ignore",
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

function assertNoDestinationOverrides(environment) {
  const present = DESTINATION_OVERRIDE_NAMES.filter((name) =>
    Object.prototype.hasOwnProperty.call(environment, name) && String(environment[name] || "") !== "");
  if (present.length) {
    fail("destination-override-present", "Inherited H2O destination overrides are forbidden during activation preflight.", {
      names: present,
    });
  }
}

function assertRegularFile(filename, code) {
  let stat;
  try {
    stat = fs.lstatSync(filename);
  } catch {
    fail(code, "Required regular file is missing.", { filename });
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail(code, "Required path must be a regular file and must not be a symlink.", { filename });
  }
  return stat;
}

function assertDirectory(filename, code) {
  let stat;
  try {
    stat = fs.lstatSync(filename);
  } catch {
    fail(code, "Required directory is missing.", { filename });
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail(code, "Required path must be a real directory and must not be a symlink.", { filename });
  }
  return stat;
}

function listUntracked(repository) {
  const value = git(repository, ["ls-files", "--others", "--exclude-standard"]);
  return value ? value.split("\n").filter(Boolean) : [];
}

export function collectSourcePreflight(repository = REPOSITORY_ROOT) {
  const expected = realAware(REPOSITORY_ROOT);
  const top = realAware(git(repository, ["rev-parse", "--show-toplevel"]));
  if (top !== expected || realAware(repository) !== expected) {
    fail("wrong-worktree", "Activator must execute from the worktree containing its own source module.", {
      expected,
      observed: top,
    });
  }
  const branch = git(repository, ["branch", "--show-current"]);
  if (branch !== "main") fail("wrong-branch", "Activation preflight requires branch main.", { branch });
  const approvedHead = git(repository, ["rev-parse", "HEAD"]);
  const sourceTree = git(repository, ["rev-parse", "HEAD^{tree}"]);
  if (git(repository, ["diff", "--cached", "--quiet"], { allowFailure: true }) === null) {
    fail("index-not-empty", "Activation preflight requires an empty index.");
  }
  if (git(repository, ["diff", "--quiet"], { allowFailure: true }) === null) {
    fail("tracked-worktree-dirty", "Activation preflight requires a clean tracked worktree.");
  }
  const untracked = listUntracked(repository);
  if (untracked.length) {
    fail("untracked-source-present", "Activation preflight rejects non-ignored untracked source.", { untracked });
  }
  const missingFoundations = FOUNDATION_COMMITS.filter((commit) =>
    !gitIsAncestor(repository, commit, approvedHead));
  if (missingFoundations.length) {
    fail("foundation-ancestry-missing", "Required publication-safety foundations are not ancestors of HEAD.", {
      missingFoundations,
    });
  }
  return Object.freeze({ repository: top, branch, approvedHead, sourceTree });
}

function parseReceipt(receiptPath) {
  const absolute = path.resolve(receiptPath);
  assertRegularFile(absolute, "receipt-not-regular");
  const bytes = fs.readFileSync(absolute);
  let receipt;
  try {
    receipt = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail("receipt-malformed", "Publication receipt is not valid JSON.", {
      reason: String(error?.message || error).slice(0, 300),
    });
  }
  if (!plainObject(receipt)) fail("receipt-schema-invalid", "Publication receipt must be an object.");
  return { absolute, bytes, sha256: sha256Bytes(bytes), receipt };
}

function requireReceiptShape(receipt) {
  if (receipt.schemaVersion !== RECEIPT_SCHEMA_VERSION) {
    fail("receipt-schema-version", "Unsupported publication receipt schema version.", {
      expected: RECEIPT_SCHEMA_VERSION,
      observed: receipt.schemaVersion,
    });
  }
  if (receipt.mode !== "stage-only") fail("receipt-mode", "Receipt mode must be stage-only.");
  for (const field of ["activationPerformed", "browserReloadPerformed", "browserCanaryPerformed", "pushPerformed"]) {
    if (receipt[field] !== false) {
      fail("receipt-boundary-field", `Receipt field ${field} must be exactly false.`, { field, observed: receipt[field] });
    }
  }
  for (const field of ["repository", "branch", "approvedHead", "buildTimestamp", "stagingRoot"] ) {
    if (typeof receipt[field] !== "string" || !receipt[field]) {
      fail("receipt-schema-invalid", `Receipt field ${field} must be a non-empty string.`, { field });
    }
  }
  for (const field of ["outputPaths", "fileCounts", "treeDigests", "manifests", "validatorResult", "lock"]) {
    if (!plainObject(receipt[field])) fail("receipt-schema-invalid", `Receipt field ${field} must be an object.`, { field });
  }
  if (receipt.validatorResult.ok !== true) {
    fail("receipt-validator-failed", "Publisher receipt does not record a successful staged-output validation.");
  }
  if (typeof receipt.lock.directory !== "string" || !receipt.lock.directory ||
      typeof receipt.lock.ownerId !== "string" || !receipt.lock.ownerId) {
    fail("receipt-schema-invalid", "Receipt lock evidence is incomplete.");
  }
  for (const family of OUTPUT_FAMILIES) {
    if (!plainObject(receipt.manifests[family]) || !Array.isArray(receipt.manifests[family].entries)) {
      fail("receipt-manifest-missing", "Receipt manifest data is missing.", { family });
    }
    if (!Number.isInteger(receipt.fileCounts[family]) || typeof receipt.treeDigests[family] !== "string") {
      fail("receipt-manifest-missing", "Receipt manifest summary is missing.", { family });
    }
  }
}

function expectedStagePaths(stagingRoot) {
  return Object.freeze({
    alias: path.join(stagingRoot, "server", "alias"),
    devOutput: path.join(stagingRoot, "server", "dev_output"),
    proxyPack: path.join(stagingRoot, "server", "dev_output", "proxy", "_paste-pack.ext.txt"),
    extension: path.join(stagingRoot, "extension"),
  });
}

function verifyStagePaths(parsed, receipt) {
  const temporaryRoot = realAware(os.tmpdir());
  assertDirectory(receipt.stagingRoot, "staging-root-missing");
  const stagingRoot = realAware(receipt.stagingRoot);
  if (!isWithin(temporaryRoot, stagingRoot) || path.basename(stagingRoot).startsWith(STAGING_PREFIX) === false) {
    fail("staging-root-untrusted", "Staging root is not an expected Batch 1 temporary staging directory.", {
      stagingRoot,
      temporaryRoot,
    });
  }
  if (realAware(path.dirname(parsed.absolute)) !== stagingRoot || path.basename(parsed.absolute) !== RECEIPT_BASENAME) {
    fail("receipt-outside-staging-root", "Receipt must be the regular publication receipt at the staging root.", {
      receipt: parsed.absolute,
      stagingRoot,
    });
  }
  const expected = expectedStagePaths(stagingRoot);
  for (const [name, expectedPath] of Object.entries(expected)) {
    if (typeof receipt.outputPaths[name] !== "string" || realAware(receipt.outputPaths[name]) !== realAware(expectedPath)) {
      fail("staged-output-path-mismatch", "Receipt output path does not match the fixed Batch 1 staging layout.", {
        name,
        expected: expectedPath,
        observed: receipt.outputPaths[name],
      });
    }
  }
  assertDirectory(expected.alias, "staged-output-missing");
  assertDirectory(expected.devOutput, "staged-output-missing");
  assertRegularFile(expected.proxyPack, "staged-proxy-pack-missing");
  assertDirectory(expected.extension, "staged-output-missing");
  return { stagingRoot, declaredStagingRoot: path.resolve(receipt.stagingRoot), outputPaths: expected };
}

function listFilesRecursive(root) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else found.push(absolute);
    }
  };
  walk(root);
  return found;
}

export function buildIndependentManifest(root, stagingRoot) {
  const entries = listFilesRecursive(root).map((filename) => {
    const relative = path.relative(stagingRoot, filename).split(path.sep).join("/");
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) {
      return { path: relative, type: "symlink", target: fs.readlinkSync(filename) };
    }
    if (!stat.isFile()) fail("staged-entry-type", "Staged manifests permit only regular files and symlinks.", { relative });
    return { path: relative, type: "file", bytes: stat.size, sha256: sha256File(filename) };
  }).sort((a, b) => a.path.localeCompare(b.path, "en"));
  const treeDigest = sha256Bytes(entries.map((entry) => JSON.stringify(entry)).join("\n"));
  return Object.freeze({ fileCount: entries.length, treeDigest, entries });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function verifyManifestFamily(family, root, stagingRoot, receipt) {
  const actual = buildIndependentManifest(root, stagingRoot);
  const declared = receipt.manifests[family];
  if (!sameJson(actual.entries, declared.entries)) {
    fail("staged-manifest-entry-mismatch", "Recomputed staged manifest entries differ from the receipt.", { family });
  }
  if (actual.fileCount !== declared.fileCount || actual.fileCount !== receipt.fileCounts[family]) {
    fail("staged-file-count-drift", "Recomputed staged file count differs from the receipt.", {
      family,
      actual: actual.fileCount,
      manifest: declared.fileCount,
      summary: receipt.fileCounts[family],
    });
  }
  if (actual.treeDigest !== declared.treeDigest || actual.treeDigest !== receipt.treeDigests[family]) {
    fail("staged-tree-digest-mismatch", "Recomputed staged tree digest differs from the receipt.", { family });
  }
  return actual;
}

function discoverWorktreeRoots(repository) {
  const output = git(repository, ["worktree", "list", "--porcelain"]);
  return output.split("\n").filter((line) => line.startsWith("worktree "))
    .map((line) => {
      const declared = path.resolve(line.slice("worktree ".length));
      return Object.freeze({ declared, real: realAware(declared) });
    });
}

function verifyAliases(aliasRoot, manifest, source, worktrees) {
  const aliases = fs.readdirSync(aliasRoot).filter((name) => name !== ".DS_Store").sort();
  if (!aliases.length) fail("staged-alias-empty", "Staged alias family is empty.");
  const foreign = worktrees.filter((root) => root !== source.repository);
  const manifestByName = new Map(manifest.entries.map((entry) => [path.basename(entry.path), entry]));
  const entries = [];
  let regularFileCount = 0;
  let symlinkCount = 0;
  for (const name of aliases) {
    const alias = path.join(aliasRoot, name);
    const stat = fs.lstatSync(alias);
    const manifestEntry = manifestByName.get(name);
    if (stat.isFile()) {
      if (manifestEntry?.type !== "file" || manifestEntry.bytes !== stat.size ||
          manifestEntry.sha256 !== sha256File(alias)) {
        fail("staged-alias-regular-manifest", "Copied staged alias does not match its independently recomputed manifest.", {
          name,
        });
      }
      regularFileCount += 1;
      entries.push({ name, type: "file", bytes: stat.size, sha256: manifestEntry.sha256 });
      continue;
    }
    if (!stat.isSymbolicLink()) {
      fail("staged-alias-entry-type", "Staged aliases permit only regular copied files and symlinks.", { name });
    }
    const linkText = fs.readlinkSync(alias);
    if (manifestEntry?.type !== "symlink" || manifestEntry.target !== linkText) {
      fail("staged-alias-symlink-manifest", "Staged alias link text does not match its independently recomputed manifest.", {
        name,
      });
    }
    let resolved;
    try {
      resolved = realAware(fs.realpathSync(alias));
    } catch {
      fail("staged-alias-broken", "Staged alias is broken.", { name });
    }
    const foreignOwner = foreign.find((root) => isWithin(root, resolved));
    if (foreignOwner) {
      fail("staged-alias-foreign-worktree", "Staged alias resolves into a foreign worktree.", {
        name,
        resolved,
        foreignOwner,
      });
    }
    if (!isWithin(aliasRoot, resolved) && !isWithin(source.repository, resolved)) {
      fail("staged-alias-outside-approved-roots", "Staged alias resolves outside the staged alias and approved source roots.", {
        name,
        resolved,
      });
    }
    if (isWithin(path.join(source.repository, "apps", "dev-server"), resolved) ||
        isWithin(path.join(source.repository, "apps", "extensions"), resolved)) {
      fail("staged-alias-generated-target", "Staged alias resolves into a generated-output tree.", { name, resolved });
    }
    symlinkCount += 1;
    entries.push({ name, type: "symlink", linkText, resolvedTarget: resolved });
  }
  return Object.freeze({ aliasCount: entries.length, regularFileCount, symlinkCount, entries });
}

function verifyNoEmbeddedPaths(stage, source, worktrees) {
  const foreign = worktrees.filter((root) => root.real !== source.repository);
  const foreignSpellings = [...new Set(foreign.flatMap((root) => [root.declared, root.real]))];
  const stagingSpellings = [...new Set([
    stage.declaredStagingRoot,
    stage.stagingRoot,
    realAware(stage.declaredStagingRoot),
  ])];
  const files = [
    ...listFilesRecursive(stage.outputPaths.alias),
    ...listFilesRecursive(stage.outputPaths.devOutput),
    ...listFilesRecursive(stage.outputPaths.extension),
  ];
  for (const filename of files) {
    if (!TEXT_OUTPUT_PATTERN.test(filename) || fs.lstatSync(filename).isSymbolicLink()) continue;
    const text = fs.readFileSync(filename, "utf8");
    const foreignPath = foreignSpellings.find((root) => text.includes(root));
    if (foreignPath) {
      fail("staged-text-foreign-worktree", "Staged text embeds a foreign worktree path.", {
        path: path.relative(stage.stagingRoot, filename),
        foreignPath,
      });
    }
    const leaked = stagingSpellings.find((root) => text.includes(root));
    if (leaked) {
      fail("staged-text-staging-root", "Staged text embeds its temporary staging root.", {
        path: path.relative(stage.stagingRoot, filename),
      });
    }
  }
}

function verifyRequiredOutputs(stage, receipt) {
  for (const relative of REQUIRED_EXTENSION_FILES) {
    const filename = path.join(stage.outputPaths.extension, relative);
    assertRegularFile(filename, "staged-extension-required-file");
    if (fs.statSync(filename).size === 0) {
      fail("staged-extension-required-file", "Required extension file is empty.", { relative });
    }
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(stage.outputPaths.extension, "manifest.json"), "utf8"));
  } catch {
    fail("staged-extension-manifest", "Staged extension manifest is not valid JSON.");
  }
  if (!plainObject(manifest) || !manifest.manifest_version) {
    fail("staged-extension-manifest", "Staged extension manifest lacks manifest_version.");
  }
  const proxyText = fs.readFileSync(stage.outputPaths.proxyPack, "utf8");
  const proxyMarker = (proxyText.match(/^\/\/ buildTs=(\d+)$/mu) || [])[1] || null;
  const loaderText = fs.readFileSync(path.join(stage.outputPaths.extension, "loader.js"), "utf8");
  const loaderHasMarker = loaderText.includes(receipt.buildTimestamp);
  if (proxyMarker !== receipt.buildTimestamp || !loaderHasMarker) {
    fail("staged-build-marker-mismatch", "Available staged build-marker evidence is not coherent.", {
      expected: receipt.buildTimestamp,
      proxyMarker,
      loaderHasMarker,
    });
  }
  return { proxyMarker, loaderMarker: receipt.buildTimestamp, manifestVersion: manifest.manifest_version };
}

export function deriveCanonicalFoundation(repository = REPOSITORY_ROOT) {
  const anchor = deriveSharedAnchor({ cwd: repository, env: {}, allowOverride: false });
  const expected = path.join(path.dirname(anchor.authoritativeRepositoryRoot), ".h2o-canonical-delivery");
  try {
    if (fs.lstatSync(expected).isSymbolicLink()) {
      fail("canonical-anchor-symlink", "Canonical coordination anchor must not be a symlink.", { expected });
    }
  } catch (error) {
    if (error instanceof ActivatorError) throw error;
    if (error?.code !== "ENOENT") {
      fail("canonical-anchor-unreadable", "Canonical coordination anchor metadata is unreadable.", { expected });
    }
  }
  if (anchor.root !== realAware(expected) || anchor.overrideUsed) {
    fail("canonical-anchor-mismatch", "Canonical coordination anchor is not the derived external default.", {
      expected: realAware(expected),
      observed: anchor.root,
    });
  }
  return Object.freeze({
    root: anchor.root,
    source: anchor.source,
    publisherLock: path.join(anchor.cockpitProRoot, ".h2o-publisher-lock"),
    futureSubpaths: Object.fromEntries(FUTURE_COORDINATION_SUBPATHS.map((name) => [name, path.join(anchor.root, name)])),
    created: false,
  });
}

export function verifyStageReceipt(receiptPath, { environment = process.env } = {}) {
  assertNoDestinationOverrides(environment);
  const parsed = parseReceipt(receiptPath);
  requireReceiptShape(parsed.receipt);
  const source = collectSourcePreflight(REPOSITORY_ROOT);
  const receipt = parsed.receipt;
  if (realAware(receipt.repository) !== source.repository) {
    fail("receipt-repository-mismatch", "Receipt repository does not match the activator worktree.", {
      expected: source.repository,
      observed: receipt.repository,
    });
  }
  if (receipt.branch !== "main" || receipt.branch !== source.branch) {
    fail("receipt-branch-mismatch", "Receipt branch does not match executable Git evidence.", {
      expected: source.branch,
      observed: receipt.branch,
    });
  }
  if (receipt.approvedHead !== source.approvedHead) {
    fail("receipt-head-mismatch", "Receipt approvedHead does not match executable Git evidence.", {
      expected: source.approvedHead,
      observed: receipt.approvedHead,
    });
  }
  const stage = verifyStagePaths(parsed, receipt);
  const worktrees = discoverWorktreeRoots(source.repository);
  const manifests = {
    alias: verifyManifestFamily("alias", stage.outputPaths.alias, stage.stagingRoot, receipt),
    devOutput: verifyManifestFamily("devOutput", stage.outputPaths.devOutput, stage.stagingRoot, receipt),
    extension: verifyManifestFamily("extension", stage.outputPaths.extension, stage.stagingRoot, receipt),
  };
  const actualTotal = Object.values(manifests).reduce((sum, manifest) => sum + manifest.fileCount, 0);
  if (receipt.fileCounts.total !== actualTotal) {
    fail("staged-file-count-drift", "Total staged file count differs from the receipt.", {
      expected: receipt.fileCounts.total,
      actual: actualTotal,
    });
  }
  const aliases = verifyAliases(stage.outputPaths.alias, manifests.alias, source, worktrees.map((item) => item.real));
  verifyNoEmbeddedPaths(stage, source, worktrees);
  const markers = verifyRequiredOutputs(stage, receipt);
  const canonical = deriveCanonicalFoundation(source.repository);
  if (realAware(receipt.lock.directory) !== realAware(canonical.publisherLock)) {
    fail("receipt-lock-mismatch", "Receipt lock path does not match the shared Batch 1 publisher lock.", {
      expected: canonical.publisherLock,
      observed: receipt.lock.directory,
    });
  }
  const after = fs.readFileSync(parsed.absolute);
  if (!after.equals(parsed.bytes)) fail("receipt-mutated", "Read-only verification changed the publication receipt.");
  return Object.freeze({
    ok: true,
    mode: "verify-stage-receipt",
    source,
    receiptPath: parsed.absolute,
    receiptSha256: parsed.sha256,
    receiptBytes: parsed.bytes.length,
    stage: { stagingRoot: stage.stagingRoot, outputPaths: stage.outputPaths, manifests, aliases, markers },
    canonicalFoundation: canonical,
    mutationPerformed: false,
    activationImplemented: false,
    browserActionPerformed: false,
    networkActionPerformed: false,
    pushPerformed: false,
  });
}

function treeEntryMap(root) {
  if (!fs.existsSync(root)) return new Map();
  const entries = listFilesRecursive(root).map((filename) => {
    const relative = path.relative(root, filename).split(path.sep).join("/");
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) {
      const linkText = fs.readlinkSync(filename);
      return [relative, {
        type: "symlink",
        linkText,
        resolvedTarget: realAware(path.resolve(path.dirname(filename), linkText)),
      }];
    }
    return [relative, { type: "file", bytes: stat.size, sha256: sha256File(filename) }];
  });
  return new Map(entries);
}

/**
 * Read-only fixture comparison foundation for later canonical verification.
 * Symlink equivalence is based on resolved targets; link-text drift is reported
 * separately because promoted alias links may need depth-dependent normalization.
 */
export function compareTrees(stagedRoot, canonicalRoot) {
  const staged = treeEntryMap(stagedRoot);
  const canonical = treeEntryMap(canonicalRoot);
  const report = {
    stagedFileCount: staged.size,
    canonicalFileCount: canonical.size,
    fileCountDrift: staged.size === canonical.size ? null : { staged: staged.size, canonical: canonical.size },
    missingPaths: [],
    extraPaths: [],
    typeMismatches: [],
    byteMismatches: [],
    symlinkLinkTextDifferences: [],
    resolvedTargetMismatches: [],
  };
  for (const [relative, expected] of staged) {
    const observed = canonical.get(relative);
    if (!observed) {
      report.missingPaths.push(relative);
      continue;
    }
    if (expected.type !== observed.type) {
      report.typeMismatches.push({ path: relative, staged: expected.type, canonical: observed.type });
      continue;
    }
    if (expected.type === "file" && expected.sha256 !== observed.sha256) {
      report.byteMismatches.push({ path: relative, stagedSha256: expected.sha256, canonicalSha256: observed.sha256 });
    }
    if (expected.type === "symlink") {
      if (expected.linkText !== observed.linkText) {
        report.symlinkLinkTextDifferences.push({ path: relative, staged: expected.linkText, canonical: observed.linkText });
      }
      if (expected.resolvedTarget !== observed.resolvedTarget) {
        report.resolvedTargetMismatches.push({
          path: relative,
          staged: expected.resolvedTarget,
          canonical: observed.resolvedTarget,
        });
      }
    }
  }
  for (const relative of canonical.keys()) {
    if (!staged.has(relative)) report.extraPaths.push(relative);
  }
  const blocking = [
    report.fileCountDrift,
    ...report.missingPaths,
    ...report.extraPaths,
    ...report.typeMismatches,
    ...report.byteMismatches,
    ...report.resolvedTargetMismatches,
  ];
  return Object.freeze({
    ...report,
    equivalent: blocking.filter(Boolean).length === 0,
    exactLinkText: report.symlinkLinkTextDifferences.length === 0,
  });
}

function expectedStateFlags(state) {
  return {
    "untouched": { incomingPrepared: false, liveRetired: false, incomingPromoted: false, verified: false, restored: false },
    "incoming-prepared": { incomingPrepared: true, liveRetired: false, incomingPromoted: false, verified: false, restored: false },
    "live-retired": { incomingPrepared: true, liveRetired: true, incomingPromoted: false, verified: false, restored: false },
    "incoming-promoted": { incomingPrepared: true, liveRetired: true, incomingPromoted: true, verified: false, restored: false },
    "verified": { incomingPrepared: true, liveRetired: true, incomingPromoted: true, verified: true, restored: false },
    "restored": { incomingPrepared: false, liveRetired: false, incomingPromoted: false, verified: false, restored: true },
  }[state];
}

/** Pure state-model guard; it performs no filesystem work. */
export function evaluateFutureTransaction(model) {
  const reasons = [];
  if (!plainObject(model)) return Object.freeze({ acceptable: false, reasons: ["model-invalid"] });
  if (model.rollbackScope !== "whole-release") reasons.push("whole-release-rollback-required");
  if (model.journalResolved !== true) reasons.push("transaction-journal-unresolved");
  if (model.finalReceiptDurable !== true) reasons.push("final-receipt-not-durable");
  if (typeof model.activationId !== "string" || !model.activationId) reasons.push("activation-id-missing");
  if (!plainObject(model.trees)) reasons.push("tree-records-missing");
  const treeRecords = plainObject(model.trees) ? model.trees : {};
  for (const family of OUTPUT_FAMILIES) {
    const tree = treeRecords[family];
    if (!plainObject(tree)) {
      reasons.push(`${family}:record-missing`);
      continue;
    }
    if (!FUTURE_TREE_STATES.includes(tree.state)) {
      reasons.push(`${family}:state-invalid`);
      continue;
    }
    const expected = expectedStateFlags(tree.state);
    for (const [flag, value] of Object.entries(expected)) {
      if (tree[flag] !== value) reasons.push(`${family}:state-contradiction:${flag}`);
    }
    if ((tree.liveRetired || tree.incomingPromoted || tree.verified) &&
        (!plainObject(tree.previousState) || tree.previousState.recorded !== true)) {
      reasons.push(`${family}:previous-state-missing`);
    }
    if (plainObject(tree.previousState) && tree.previousState.kind === "absent" &&
        tree.restoreOnFailure !== "absent") {
      reasons.push(`${family}:first-activation-restoration-not-absent`);
    }
    if (tree.activationId !== model.activationId) reasons.push(`${family}:generation-mismatch`);
  }
  if (!OUTPUT_FAMILIES.every((family) => treeRecords[family]?.state === "verified")) {
    reasons.push("all-three-trees-not-verified");
  }
  return Object.freeze({ acceptable: reasons.length === 0, reasons: Object.freeze([...new Set(reasons)]) });
}

function validateActivationId(activationId) {
  if (typeof activationId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/u.test(activationId)) {
    fail("activation-id-invalid", "Future activation IDs must be bounded filename-safe identifiers.");
  }
}

export function futureSiblingNames(name, activationId) {
  validateActivationId(activationId);
  if (typeof name !== "string" || !name || name.includes(path.sep) || name === "." || name === "..") {
    fail("activation-tree-name-invalid", "Future activation tree name must be one path segment.");
  }
  return Object.freeze({
    incoming: `${name}.staging-act-${activationId}`,
    previous: `${name}.retired-act-${activationId}`,
  });
}

export function ownsFutureSibling(candidate, name, activationId) {
  const expected = futureSiblingNames(name, activationId);
  return candidate === expected.incoming || candidate === expected.previous;
}

export async function runLeanActivator({ argv = process.argv.slice(2), environment = process.env } = {}) {
  if (argv.length === 2 && argv[0] === "--activate-receipt") {
    fail("activation-not-implemented", "Activation is intentionally not implemented in Batch 2 P0/P1.");
  }
  if (argv.length >= 1 && ["--rollback", "--recover", "--prune"].includes(argv[0])) {
    fail("mutation-command-not-implemented", "Mutation commands are intentionally absent in Batch 2 P0/P1.");
  }
  if (argv.length === 3 && argv[0] === "--verify-canonical" && argv[1] === "--receipt") {
    fail("canonical-verification-fixture-only", "P1 exposes canonical comparison only as a fixture-tested read-only library foundation.");
  }
  if (argv.length !== 2 || argv[0] !== "--verify-stage-receipt") {
    fail("invalid-arguments", "P1 accepts exactly --verify-stage-receipt <publication-receipt-path>.", { argv });
  }
  return verifyStageReceipt(argv[1], { environment });
}

const invokedDirectly = process.argv[1] && realAware(process.argv[1]) === realAware(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  runLeanActivator()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      const payload = error instanceof ActivatorError
        ? { ok: false, code: error.code, message: error.message, details: error.details }
        : { ok: false, code: "unexpected-error", message: String(error?.stack || error) };
      process.stderr.write(`${JSON.stringify(payload)}\n`);
      process.exitCode = 1;
    });
}
