#!/usr/bin/env node
// Lean canonical activator — Batch 2 P0/P1 plus P2 coordination foundation.
//
// This module verifies a Batch 1 stage-only publication receipt and independently
// recomputes every staged manifest. It contains no payload activation, backup,
// promotion, rollback, recovery mutation, pruning, browser, network,
// or push capability. P2/P2.1 may create the inherited Batch 1 publisher-lock
// support directory and lock lifecycle, the independently pinned external
// coordination anchor, activation-intents directory, one no-replace intent
// journal, and only the temporary journal file owned by that invocation.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquireLease,
  assertAllowedReadOnlyGitCommand,
  deriveSharedAnchor,
  releaseLease,
  runPinnedReadOnlyGit,
  sanitizedGitEnvironment,
  TRUSTED_GIT_EXECUTABLE_IDENTITY,
  verifyLease,
} from "./canonical-delivery-lib.mjs";
import { acquireLock, releaseLock } from "./lean-publisher.mjs";
// P3C-1a: the one explicit production import edge to the payload-transaction
// module. Exact named symbols only — no namespace, default, aliased or dynamic
// import. The payload module stays Node-builtins-only and never sees the lease.
import {
  ACTIVATION_RECEIPT_MODE,
  ACTIVATION_RECEIPT_SCHEMA_VERSION,
  activationReceiptPath,
  appendAcceptedRecord,
  buildActivationReceipt,
  canonicalUnitPaths,
  createOwnedIncomingRoot,
  ensureTransactionDirectory,
  prepareIncomingTree,
  promoteReleaseWithJournal,
  publishActivationReceipt,
  planP3cRecovery,
  readTransactionChain,
  recomputeIncomingManifest,
  releaseIncomingOwnership,
  reverseRelease,
  TRANSACTION_MODE,
  transactionDirectory,
  verifyCanonicalAgainstReceipt,
} from "./lean-payload-transaction.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, "..", "..");
// The Batch 1 STAGE publication receipt schema. Not the activation receipt.
export const RECEIPT_SCHEMA_VERSION = 1;
export const RECEIPT_BASENAME = "publication-receipt.json";
export const STAGING_PREFIX = "h2o-publish-stage-";
export const FOUNDATION_COMMITS = Object.freeze([
  "3ce2264ad0e32d9a6fa4d17b4cf89f84d652db2f",
  "b4f5e730a5a39a7b45571138d48aafe4710cb90a",
  "6920f812263ed03d79888f06e5e849fe4dcca43e",
  "86af342f1b1815e12c477673a4f2123b37bede40",
  "fa0dac4552ce5a1189dee0b1d23975f95bffe751",
  "d3ebe3c8b3c973ee11d15664b09398f388b0b373",
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
  // P3A publishes append-only activation transaction records here. Declaring it
  // keeps the coordination surface and the constant from diverging.
  "transactions",
]);
export const FUTURE_PROMOTION_DESCRIPTION = "transactionally recoverable three-tree promotion";
export const ACTIVATION_INTENT_SCHEMA_VERSION = 1;
export const ACTIVATION_INTENT_MODE = "activation-intent";
export const ACTIVATION_INTENT_PURPOSE = "canonical-activation";
// Pinned from the accepted Batch 1/1.1 publisher contract, not from receipt input.
export const ACCEPTED_EXTENSION_VARIANT = "dev-controls-oauth-google";
export const CANONICAL_DELIVERY_LIB_TRUST_BOUNDARY =
  "canonical-delivery-lib and activator share one pinned executable, sanitized environment, and exact read-only argv boundary; activator independently pins every returned authority path";
export { sanitizedGitEnvironment, TRUSTED_GIT_EXECUTABLE_IDENTITY };
export const STABLE_GIT_IDENTITY_KEYS = Object.freeze(["path", "realpath", "version", "sha256"]);
// The fresh revalidation P3 must complete immediately before the first payload
// mutation. The P2 intent is a proposal and never promotion authority, so every
// item is re-established from the filesystem and executable Git at promotion
// time rather than trusted from the recorded journal.
export const P3_REVALIDATION_REQUIREMENTS = Object.freeze([
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
]);
export const ACTIVATION_ID_PATTERN = /^\d{8}T\d{9}Z-[a-f0-9]{12}$/u;
// The future three-tree release is sequential and recoverable. It is not a
// cross-tree atomic swap, and adjacent renames do not eliminate missing-path
// intervals. P2.1 publishes only a journal through a same-directory no-replace
// hard link; no payload-tree rename or other promotion primitive exists here.

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

export function stableGitExecutableIdentity(identity = TRUSTED_GIT_EXECUTABLE_IDENTITY) {
  const stable = Object.fromEntries(STABLE_GIT_IDENTITY_KEYS.map((key) => [key, identity?.[key]]));
  for (const [key, value] of Object.entries(stable)) {
    if (typeof value !== "string" || !value) {
      fail("git-stable-identity-invalid", "Stable Git executable identity is incomplete.", { key });
    }
  }
  return Object.freeze(stable);
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

export function assertAllowedGitCommand(args) {
  try {
    return assertAllowedReadOnlyGitCommand(args);
  } catch (error) {
    fail("git-command-not-allowed", error.message, { args });
  }
}

export function runReadOnlyGit(repository, args, {
  allowFailure = false,
  allowedFailureStatuses = allowFailure ? [1] : [],
} = {}) {
  assertAllowedGitCommand(args);
  try {
    return runPinnedReadOnlyGit(repository, args, { allowFailure, allowedFailureStatuses });
  } catch (error) {
    if (error?.code === "git-read-timeout" || error?.details?.code === "git-read-timeout") {
      fail("git-read-timeout", "Required read-only Git evidence timed out.", {
        args,
        timeoutMs: error?.details?.timeoutMs ?? 30_000,
      });
    }
    fail("git-command-failed", "Required read-only Git evidence could not be obtained.", {
      args,
      cause: error.message,
    });
  }
}

function gitIsAncestor(repository, ancestor, descendant) {
  return runReadOnlyGit(repository, ["merge-base", "--is-ancestor", ancestor, descendant],
    { allowedFailureStatuses: [1, 128] }) !== null;
}

const git = runReadOnlyGit;

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

/**
 * Canonical comparison authority. Identity, branch and foundation ancestry are proved
 * here for every verification mode; this can never be redirected by a caller because
 * REPOSITORY_ROOT is derived from this module's own location.
 */
export function collectCanonicalIdentity(repository = REPOSITORY_ROOT) {
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
  const missingFoundations = FOUNDATION_COMMITS.filter((commit) =>
    !gitIsAncestor(repository, commit, approvedHead));
  if (missingFoundations.length) {
    fail("foundation-ancestry-missing", "Required publication-safety foundations are not ancestors of HEAD.", {
      missingFoundations,
    });
  }
  return Object.freeze({
    repository: top,
    branch,
    approvedHead,
    sourceTree,
    gitExecutable: stableGitExecutableIdentity(),
    gitExecutableProcessAttestation: TRUSTED_GIT_EXECUTABLE_IDENTITY,
  });
}

/**
 * Canonical working-copy cleanliness. Required for legacy and canonical-mode receipts,
 * whose staged bytes could only have come from this worktree. Explicit-worktree
 * receipts skip it: their artifact source is a separate committed worktree, so
 * unrelated in-flight work here says nothing about the staged bytes.
 */
export function assertCanonicalWorkingCopyClean(repository = REPOSITORY_ROOT) {
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
}

/** Pre-R.2 composite: identity plus unconditional cleanliness. Behaviour unchanged. */
export function collectSourcePreflight(repository = REPOSITORY_ROOT) {
  const identity = collectCanonicalIdentity(repository);
  assertCanonicalWorkingCopyClean(repository);
  return identity;
}

const FULL_OBJECT_PATTERN = /^[a-f0-9]{40}$/u;
const SOURCE_AUTHORITY_MODES = Object.freeze(["canonical", "explicit-worktree"]);

/**
 * Optional additive receipt metadata describing which committed product source the
 * staged bytes were generated from. Absent means a pre-R.2 receipt and legacy
 * semantics. This is COMMITTED PRODUCT-SOURCE AUTHORITY only: gitignored local build
 * inputs also influence generated bytes, so it never claims complete reproducible-build
 * provenance. The staged manifests and tree digests remain the authority for the bytes
 * that actually exist in the stage.
 */
function requireSourceAuthorityShape(receipt) {
  if (!Object.prototype.hasOwnProperty.call(receipt, "sourceAuthority")) return null;
  const authority = receipt.sourceAuthority;
  if (!plainObject(authority)) {
    fail("source-authority-invalid", "Receipt sourceAuthority must be an object when present.");
  }
  if (!SOURCE_AUTHORITY_MODES.includes(authority.mode)) {
    fail("source-authority-mode-unsupported", "Receipt sourceAuthority.mode is not a supported mode.", {
      observed: authority.mode ?? null,
      supported: [...SOURCE_AUTHORITY_MODES],
    });
  }
  for (const field of ["commonDir", "worktreeRoot"]) {
    if (typeof authority[field] !== "string" || !authority[field] || !path.isAbsolute(authority[field])) {
      fail("source-authority-invalid", `Receipt sourceAuthority.${field} must be a non-empty absolute path.`, {
        field,
      });
    }
  }
  for (const field of ["head", "tree"]) {
    if (typeof authority[field] !== "string" || !FULL_OBJECT_PATTERN.test(authority[field])) {
      fail("source-authority-invalid", `Receipt sourceAuthority.${field} must be a full lowercase object id.`, {
        field,
      });
    }
  }
  if (authority.branch !== null && typeof authority.branch !== "string") {
    fail("source-authority-invalid", "Receipt sourceAuthority.branch must be a string or null.");
  }
  return authority;
}

/**
 * Prove the recorded source against canonical Git objects. Trust derives from the
 * shared object store (commonDir), the exact commit, its exact tree, and ancestry to
 * the CURRENT canonical head — never from the recorded worktree path, and never from
 * source working-copy bytes, which are not read at all.
 */
function verifySourceAuthorityAgainstGit(authority, source, canonicalCommonDir) {
  if (realAware(authority.commonDir) !== canonicalCommonDir) {
    fail("source-authority-common-dir-mismatch", "Receipt sourceAuthority belongs to another repository.", {
      expected: canonicalCommonDir,
      observed: authority.commonDir,
    });
  }
  if (authority.mode === "canonical") {
    if (authority.head !== source.approvedHead) {
      fail("source-authority-head-mismatch", "Canonical-mode sourceAuthority.head must equal the approved head.", {
        expected: source.approvedHead,
        observed: authority.head,
      });
    }
    if (realAware(authority.worktreeRoot) !== source.repository) {
      fail("source-authority-worktree-mismatch", "Canonical-mode sourceAuthority must name the canonical repository.", {
        expected: source.repository,
        observed: authority.worktreeRoot,
      });
    }
  } else if (!gitIsAncestor(REPOSITORY_ROOT, authority.head, source.approvedHead)) {
    // Ancestry also proves existence: an unknown commit cannot be an ancestor.
    fail("source-authority-head-not-ancestor",
      "Receipt sourceAuthority.head is not ancestor-or-equal to the current canonical head.", {
        sourceHead: authority.head,
        canonicalHead: source.approvedHead,
      });
  }
  const tree = git(REPOSITORY_ROOT, ["rev-parse", `${authority.head}^{tree}`], { allowFailure: true });
  if (tree === null || tree !== authority.tree) {
    fail("source-authority-tree-mismatch", "Receipt sourceAuthority.tree is not the tree of its recorded commit.", {
      expected: tree,
      observed: authority.tree,
    });
  }
  return Object.freeze({
    mode: authority.mode,
    commonDir: realAware(authority.commonDir),
    head: authority.head,
    tree: authority.tree,
    branch: authority.branch ?? null,
    worktreeRoot: realAware(authority.worktreeRoot),
  });
}

/**
 * The single registered worktree that the verified sourceAuthority names, if it still
 * exists. Absence is not a failure: durable trust is commonDir + head + tree + ancestry,
 * and a worktree that is gone contributes no path to the foreign set anyway. Matching is
 * by discovered-root identity, never by raw receipt text or path prefix.
 */
function authorizedSourceWorktree(verifiedAuthority, worktrees) {
  if (!verifiedAuthority || verifiedAuthority.mode !== "explicit-worktree") return null;
  return worktrees.find((root) => root.real === verifiedAuthority.worktreeRoot) ?? null;
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
  if (!extensionVariantIsSafe(receipt.stagedExtensionVariant) ||
      receipt.stagedExtensionVariant !== ACCEPTED_EXTENSION_VARIANT) {
    fail("receipt-extension-variant", "Receipt extension variant must equal the independently pinned Batch 1 variant.", {
      expected: ACCEPTED_EXTENSION_VARIANT,
      observed: receipt.stagedExtensionVariant,
    });
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

function verifyAliases(aliasRoot, manifest, source, worktrees, authorizedSourceRoot = null) {
  const aliases = fs.readdirSync(aliasRoot).filter((name) => name !== ".DS_Store").sort();
  if (!aliases.length) fail("staged-alias-empty", "Staged alias family is empty.");
  // In explicit-worktree mode the one verified source root is approved provenance; every
  // other registered worktree stays foreign. R.1 aliases are copy-based so this is
  // normally unused, but the rule must not contradict the staged-text policy.
  const approvedRoots = [source.repository, ...(authorizedSourceRoot ? [authorizedSourceRoot.real] : [])];
  const foreign = worktrees.filter((root) => !approvedRoots.includes(root));
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
    if (!isWithin(aliasRoot, resolved) && !approvedRoots.some((root) => isWithin(root, resolved))) {
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

function verifyNoEmbeddedPaths(stage, source, worktrees, authorizedSourceRoot = null) {
  // Explicit-worktree stages legitimately embed their selected source path in generated
  // metadata. Exempt exactly the one worktree the verified sourceAuthority names —
  // matched by discovered-root identity, never by raw receipt text or prefix — and keep
  // every other registered worktree, in both its declared and real spelling, foreign.
  const foreign = worktrees.filter((root) =>
    root.real !== source.repository && root.real !== (authorizedSourceRoot?.real ?? null));
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

function assertUnsymlinkedAuthorityPath(target) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let cursor = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let stat;
    try { stat = fs.lstatSync(cursor); } catch (error) {
      if (error?.code === "ENOENT") break;
      fail("authority-component-unreadable", "Repository authority component could not be inspected.", { cursor });
    }
    if (stat.isSymbolicLink()) {
      fail("authority-component-symlink", "Repository and coordination authority components must not be symlinks.", {
        cursor,
      });
    }
  }
}

export function deriveCanonicalFoundation(repository = REPOSITORY_ROOT) {
  assertUnsymlinkedAuthorityPath(REPOSITORY_ROOT);
  const expectedRepository = fs.realpathSync.native(REPOSITORY_ROOT);
  const executableTop = realAware(runReadOnlyGit(repository, ["rev-parse", "--show-toplevel"]));
  if (realAware(repository) !== expectedRepository || executableTop !== expectedRepository) {
    fail("module-repository-mismatch", "Executable Git authority must match the activator module repository.", {
      expectedRepository,
      executableTop,
    });
  }
  const expectedCockpitProRoot = fs.realpathSync.native(path.dirname(REPOSITORY_ROOT));
  assertUnsymlinkedAuthorityPath(expectedCockpitProRoot);
  const expected = path.join(expectedCockpitProRoot, ".h2o-canonical-delivery");
  const anchor = deriveSharedAnchor({ cwd: repository, env: {}, allowOverride: false });
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
  if (realAware(anchor.authoritativeRepositoryRoot) !== expectedRepository ||
      realAware(anchor.cockpitProRoot) !== expectedCockpitProRoot ||
      anchor.root !== realAware(expected) || anchor.overrideUsed) {
    fail("canonical-anchor-mismatch", "Canonical coordination anchor is not the derived external default.", {
      expected: realAware(expected),
      observed: anchor.root,
    });
  }
  return Object.freeze({
    root: anchor.root,
    source: anchor.source,
    gitExecutable: stableGitExecutableIdentity(),
    gitExecutableProcessAttestation: TRUSTED_GIT_EXECUTABLE_IDENTITY,
    publisherLock: path.join(anchor.cockpitProRoot, ".h2o-publisher-lock"),
    futureSubpaths: Object.fromEntries(FUTURE_COORDINATION_SUBPATHS.map((name) => [name, path.join(anchor.root, name)])),
    created: false,
  });
}

export function verifyStageReceipt(receiptPath, {
  environment = process.env,
  // R.2 boundary, strict by default. Canonical working-copy cleanliness is required
  // unless a caller explicitly opts out, and only ONE caller is approved to do so: the
  // standalone read-only --verify-stage-receipt route, where an explicit-worktree
  // receipt may be verified while canonical carries unrelated in-flight work.
  //
  // The default is strict because of how each choice fails. If a future mutation-capable
  // caller forgets this option, strict-by-default rejects a dirty canonical — a loud,
  // immediately visible failure that is safe while broken. The inverse default would
  // instead let that caller silently inherit the exception and accept work it should
  // have refused, with no error and no failing test. The exception is narrow; the rule
  // is strictness, so the default encodes the rule.
  requireCanonicalClean = true,
} = {}) {
  assertNoDestinationOverrides(environment);
  const parsed = parseReceipt(receiptPath);
  requireReceiptShape(parsed.receipt);
  // Mode must be known before preflight, because canonical working-copy cleanliness is
  // required for legacy and canonical receipts but not for explicit-worktree ones.
  const declaredAuthority = requireSourceAuthorityShape(parsed.receipt);
  const sourceMode = declaredAuthority ? declaredAuthority.mode : "legacy";
  const source = collectCanonicalIdentity(REPOSITORY_ROOT);
  if (requireCanonicalClean || sourceMode !== "explicit-worktree") {
    assertCanonicalWorkingCopyClean(REPOSITORY_ROOT);
  }
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
  if (sourceMode === "explicit-worktree") {
    // Canonical may advance after staging; the approved head must stay reachable from
    // current main. Force-moves, rebase-aways and unrelated branches therefore reject.
    if (!gitIsAncestor(REPOSITORY_ROOT, receipt.approvedHead, source.approvedHead)) {
      fail("approved-head-not-ancestor",
        "Receipt approvedHead is not ancestor-or-equal to the current canonical head.", {
          expected: source.approvedHead,
          observed: receipt.approvedHead,
        });
    }
  } else if (receipt.approvedHead !== source.approvedHead) {
    fail("receipt-head-mismatch", "Receipt approvedHead does not match executable Git evidence.", {
      expected: source.approvedHead,
      observed: receipt.approvedHead,
    });
  }
  const canonicalCommonDir = realAware(
    git(REPOSITORY_ROOT, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const sourceAuthority = declaredAuthority
    ? verifySourceAuthorityAgainstGit(declaredAuthority, source, canonicalCommonDir)
    : null;
  const stage = verifyStagePaths(parsed, receipt);
  const worktrees = discoverWorktreeRoots(source.repository);
  // Only now, after sourceAuthority is structurally verified against canonical Git
  // objects, may its worktree be exempted from foreign-path provenance.
  const authorizedSourceRoot = authorizedSourceWorktree(sourceAuthority, worktrees);
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
  const aliases = verifyAliases(stage.outputPaths.alias, manifests.alias, source,
    worktrees.map((item) => item.real), authorizedSourceRoot);
  verifyNoEmbeddedPaths(stage, source, worktrees, authorizedSourceRoot);
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
    // Committed product-source authority only; the staged manifests and tree digests
    // remain the authority for the artifact bytes themselves.
    sourceMode,
    sourceAuthority,
    receiptPath: parsed.absolute,
    receiptSha256: parsed.sha256,
    receiptBytes: parsed.bytes.length,
    stage: {
      stagingRoot: stage.stagingRoot,
      outputPaths: stage.outputPaths,
      manifests,
      aliases,
      markers,
      extensionVariant: receipt.stagedExtensionVariant,
      buildMarker: receipt.buildTimestamp,
    },
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

// Approved production authority. Duplicated deliberately rather than imported:
// the activator holds no import edge to the P3 payload module, so the capability
// boundary stays provable by import inspection. A structural test asserts both
// allow-lists are identical.
export const APPROVED_COCKPIT_PRO_ROOTS = Object.freeze([
  "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro",
]);
export const APPROVED_AUTHORITATIVE_REPOSITORIES = Object.freeze([
  "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source",
]);

// Fixture roots are supplied only through this explicit injection. No CLI path,
// environment value or receipt field reaches it, and runLeanActivator never calls
// it; a structural assertion pins that.
let fixtureApprovedRoots = null;
export function configureFixtureApprovedRoots(roots = null) {
  if (roots === null) { fixtureApprovedRoots = null; return null; }
  if (!Array.isArray(roots) || roots.length !== 2 ||
      !roots.every((entry) => typeof entry === "string" && path.isAbsolute(entry))) {
    fail("fixture-approved-roots-invalid",
      "Fixture approved roots must be [repository, cockpitProRoot] absolute paths.");
  }
  fixtureApprovedRoots = Object.freeze({
    repositories: Object.freeze([roots[0]]),
    cockpitProRoots: Object.freeze([roots[1]]),
  });
  return fixtureApprovedRoots;
}

/**
 * Mandatory approved-root gate. P2.3 proves module location, executable Git and
 * the shared anchor agree with one another, which a relocated standalone copy
 * also satisfies. This adds the missing absolute identity: the agreed authority
 * must be an approved production location.
 */
export function assertApprovedProductionRoot({ repository, cockpitProRoot, anchorRoot }) {
  const approvedRepositories = fixtureApprovedRoots
    ? fixtureApprovedRoots.repositories : APPROVED_AUTHORITATIVE_REPOSITORIES;
  const approvedCockpitProRoots = fixtureApprovedRoots
    ? fixtureApprovedRoots.cockpitProRoots : APPROVED_COCKPIT_PRO_ROOTS;
  const normalizedRepository = realAware(repository);
  const normalizedCockpitProRoot = realAware(cockpitProRoot);
  if (!approvedRepositories.map((entry) => realAware(entry)).includes(normalizedRepository)) {
    fail("canonical-root-not-approved", "Authoritative repository is not an approved production location.", {
      observed: normalizedRepository,
    });
  }
  if (!approvedCockpitProRoots.map((entry) => realAware(entry)).includes(normalizedCockpitProRoot)) {
    fail("canonical-root-not-approved", "Cockpit Pro root is not an approved production location.", {
      observed: normalizedCockpitProRoot,
    });
  }
  if (realAware(anchorRoot) !== path.join(normalizedCockpitProRoot, ".h2o-canonical-delivery")) {
    fail("canonical-anchor-mismatch", "Canonical anchor is not the approved external default.", {
      observed: realAware(anchorRoot),
    });
  }
  return Object.freeze({ repository: normalizedRepository, cockpitProRoot: normalizedCockpitProRoot });
}

export function validateActivationId(activationId) {
  if (typeof activationId !== "string" || !ACTIVATION_ID_PATTERN.test(activationId) ||
      activationId.includes("..") || activationId.includes("/") || activationId.includes("\\")) {
    fail("activation-id-invalid", "Activation IDs must use the exact bounded UTC-and-hex filename-safe format.");
  }
  return activationId;
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

export function generateActivationId({ now = new Date(), randomBytes = crypto.randomBytes } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    fail("activation-id-invalid", "Activation timestamp must be a valid Date.");
  }
  const compact = now.toISOString().replace(/[-:]/gu, "").replace(".", "");
  const fragment = Buffer.from(randomBytes(6)).toString("hex");
  return validateActivationId(`${compact}-${fragment}`);
}

function assertRealDirectoryOrAbsent(directory, symlinkCode, invalidCode) {
  try {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink()) fail(symlinkCode, "Coordination directory must not be a symlink.", { directory });
    if (!stat.isDirectory()) fail(invalidCode, "Coordination path must be a real directory.", { directory });
    return "present";
  } catch (error) {
    if (error instanceof ActivatorError) throw error;
    if (error?.code === "ENOENT") return "absent";
    fail(invalidCode, "Coordination directory metadata could not be verified.", { directory });
  }
}

function ensureCoordinationDirectory(directory, symlinkCode, invalidCode) {
  const state = assertRealDirectoryOrAbsent(directory, symlinkCode, invalidCode);
  let created = false;
  if (state === "absent") {
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
      created = true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    assertRealDirectoryOrAbsent(directory, symlinkCode, invalidCode);
  }
  const mode = fs.statSync(directory).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    fail(invalidCode, "Coordination directory permissions are broader than owner-only.", {
      directory,
      mode: mode.toString(8),
    });
  }
  return Object.freeze({
    created,
    parentDirectoryFsync: created
      ? flushDirectory(path.dirname(directory))
      : Object.freeze({ attempted: false, succeeded: false, unsupported: false, reason: "already-present" }),
  });
}

export function flushDirectory(directory) {
  let descriptor = null;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
    return Object.freeze({ attempted: true, succeeded: true, unsupported: false });
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(error?.code)) {
      fail("directory-fsync-failed", "Coordination-directory fsync failed.", {
        directory,
        code: error?.code || null,
      });
    }
    return Object.freeze({ attempted: true, succeeded: false, unsupported: true, code: error.code });
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

function removeOwnJournalTemp(tempPath, intentsDirectory, expectedBasename, owned) {
  if (!owned) return false;
  if (path.dirname(tempPath) !== path.resolve(intentsDirectory) || path.basename(tempPath) !== expectedBasename) {
    return false;
  }
  try {
    const stat = fs.lstatSync(tempPath);
    if (!stat.isSymbolicLink() && stat.isFile()) {
      fs.unlinkSync(tempPath);
      return true;
    }
  } catch {
    // Cleanup of this invocation's exact temporary file must not mask the cause.
  }
  return false;
}

export function writeDurableActivationIntent(intentsDirectory, activationId, journal, { ownerId } = {}) {
  validateActivationId(activationId);
  assertRealDirectoryOrAbsent(intentsDirectory, "activation-intents-symlink", "activation-intents-invalid");
  const finalPath = path.join(path.resolve(intentsDirectory), `${activationId}.json`);
  const safeOwner = typeof ownerId === "string" && /^[a-f0-9-]{8,64}$/u.test(ownerId)
    ? ownerId
    : crypto.randomUUID();
  const tempBasename = `.${activationId}.json.tmp-${safeOwner}`;
  const tempPath = path.join(path.resolve(intentsDirectory), tempBasename);
  const bytes = Buffer.from(`${JSON.stringify(journal, null, 2)}\n`, "utf8");
  let descriptor = null;
  let tempOwned = false;
  try {
    try {
      fs.lstatSync(finalPath);
      fail("activation-intent-collision", "Activation intent already exists; IDs are never reused.", { finalPath });
    } catch (error) {
      if (error instanceof ActivatorError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      descriptor = fs.openSync(tempPath, "wx", 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") {
        fail("activation-intent-temp-collision",
          "Invocation-owned activation-intent temporary path already exists; refusing reuse.", { tempPath });
      }
      throw error;
    }
    tempOwned = true;
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    try {
      fs.linkSync(tempPath, finalPath);
    } catch (error) {
      if (error?.code === "EEXIST") {
        fail("activation-intent-collision", "Activation intent appeared before publication; refusing overwrite.", {
          finalPath,
        });
      }
      fail("activation-intent-link-failed", "Filesystem could not publish the intent through no-replace hard linking.", {
        finalPath,
        code: error?.code || null,
      });
    }
    fs.unlinkSync(tempPath);
    tempOwned = false;
    const directoryFsync = flushDirectory(intentsDirectory);
    const observed = fs.readFileSync(finalPath);
    if (!observed.equals(bytes)) {
      fail("activation-intent-final-verification", "Durable intent bytes differ after atomic publication.", {
        finalPath,
      });
    }
    return Object.freeze({
      path: finalPath,
      sha256: sha256Bytes(observed),
      bytes: observed.length,
      durability: Object.freeze({
        fileFsync: Object.freeze({ attempted: true, succeeded: true }),
        directoryFsync,
        processCrashAtomicity: true,
        powerLossDurabilityGuaranteed: false,
      }),
    });
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    removeOwnJournalTemp(tempPath, intentsDirectory, tempBasename, tempOwned);
    throw error;
  }
}

function extensionVariantIsSafe(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value);
}

function canonicalTreeRecords(verification, activationId) {
  const repository = verification.source.repository;
  const extensionVariant = verification.stage.extensionVariant;
  if (!extensionVariantIsSafe(extensionVariant)) {
    fail("receipt-extension-variant", "Verified receipt extension variant is not a safe canonical path segment.");
  }
  if (extensionVariant !== ACCEPTED_EXTENSION_VARIANT) {
    fail("receipt-extension-variant", "Verified receipt extension variant differs from the independent authority.", {
      expected: ACCEPTED_EXTENSION_VARIANT,
      observed: extensionVariant,
    });
  }
  const lives = [
    ["alias", path.join(repository, "apps", "dev-server", "alias")],
    ["dev_output", path.join(repository, "apps", "dev-server", "dev_output")],
    ["extension", path.join(repository, "apps", "extensions", "chatgpt", "chrome", extensionVariant)],
  ];
  return lives.map(([logicalName, livePath]) => {
    const siblings = futureSiblingNames(path.basename(livePath), activationId);
    return {
      logicalName,
      livePath,
      incomingPath: path.join(path.dirname(livePath), siblings.incoming),
      previousPath: path.join(path.dirname(livePath), siblings.previous),
      state: "untouched",
      previousState: "unknown",
      previousIdentity: null,
      restorationMode: "unknown",
      verified: false,
    };
  });
}

function verificationIdentity(verification) {
  return JSON.stringify({
    source: verification.source,
    receiptPath: verification.receiptPath,
    receiptSha256: verification.receiptSha256,
    stagingRoot: verification.stage.stagingRoot,
    manifests: verification.stage.manifests,
    buildMarker: verification.stage.buildMarker,
    markers: verification.stage.markers,
    extensionVariant: verification.stage.extensionVariant,
  });
}

function translatePublisherLockError(error) {
  if (error instanceof ActivatorError) throw error;
  if (typeof error?.code === "string" && error.code.startsWith("publisher-")) {
    fail(error.code, error.message, error.details || {});
  }
  throw error;
}

export function withPublisherLock(foundation, source, callback) {
  let lock;
  let callbackError = null;
  try {
    try {
      lock = acquireLock(foundation.publisherLock, {
        pid: process.pid,
        repository: source.repository,
        approvedHead: source.approvedHead,
        startedAt: new Date().toISOString(),
      });
    } catch (error) {
      translatePublisherLockError(error);
    }
    return callback(lock);
  } catch (error) {
    callbackError = error;
    throw error;
  } finally {
    if (lock) {
      const released = releaseLock(foundation.publisherLock, process.pid, lock.ownerId);
      if (released !== "released" && callbackError === null) {
        fail("publisher-lock-release-failed", "Owned publisher lock was not released after intent preparation.", {
          released,
        });
      }
    }
  }
}

/**
 * Classify one existing activation intent as resolved or not.
 *
 * An intent is RESOLVED only when its own evidence, a durable activation
 * receipt, and an accepted terminal transaction record all independently agree.
 * Nothing is inferred from the intent alone, and the intent file itself is
 * never moved, rewritten or consumed — it stays immutable at its canonical path.
 */
export function classifyExistingIntent(intentPath, foundation, source, { environment = process.env } = {}) {
  const unresolved = (code, detail = {}) =>
    Object.freeze({ resolved: false, code, intentPath, ...detail });
  let bytes;
  try { bytes = fs.readFileSync(intentPath); } catch {
    return unresolved("intent-unreadable");
  }
  let journal;
  try { journal = JSON.parse(bytes.toString("utf8")); } catch {
    return unresolved("intent-malformed");
  }
  const activationId = journal?.activationId;
  try { validateActivationId(activationId); } catch {
    return unresolved("intent-activation-id-invalid");
  }
  if (path.basename(intentPath) !== `${activationId}.json`) {
    return unresolved("intent-id-filename-mismatch");
  }
  try {
    requireIntentBoundaryFields(journal);
  } catch {
    return unresolved("intent-malformed");
  }
  // 1: the intent must belong to this canonical repository and branch. Its
  // generation identity is historical evidence, however, so HEAD, tree and Git
  // executable are compared to the receipt and transaction below rather than
  // to today's executable checkout.
  if (realAware(journal.repositoryRealpath ?? "") !== source.repository ||
      realAware(journal.authorizedWorktreeRealpath ?? "") !== source.repository ||
      journal.branch !== source.branch) {
    return unresolved("intent-foreign-source");
  }
  if (journal.acceptedExtensionVariant !== undefined &&
      journal.acceptedExtensionVariant !== ACCEPTED_EXTENSION_VARIANT) {
    return unresolved("intent-variant-mismatch");
  }
  // 2-3: a durable activation receipt must exist at the derived path and verify.
  const receiptPath = activationReceiptPath(foundation.root, activationId);
  let receiptBytes;
  try {
    const stat = fs.lstatSync(receiptPath);
    if (stat.isSymbolicLink() || !stat.isFile()) return unresolved("receipt-not-regular");
    receiptBytes = fs.readFileSync(receiptPath);
  } catch {
    return unresolved("receipt-absent");
  }
  let receipt;
  try { receipt = JSON.parse(receiptBytes.toString("utf8")); } catch {
    return unresolved("receipt-malformed");
  }
  const receiptSha256 = sha256Bytes(receiptBytes);
  if (receipt?.schemaVersion !== ACTIVATION_RECEIPT_SCHEMA_VERSION ||
      receipt?.mode !== ACTIVATION_RECEIPT_MODE || receipt?.activationId !== activationId ||
      receipt.activationPerformed !== true || receipt.reloadPerformed !== false ||
      receipt.canaryPerformed !== false || receipt.pushPerformed !== false) {
    return unresolved("receipt-identity-mismatch");
  }
  // 4: the receipt must bind this exact intent path and digest.
  if (realAware(receipt.intentPath ?? "") !== realAware(intentPath) ||
      receipt.intentSha256 !== sha256Bytes(bytes)) {
    return unresolved("receipt-intent-binding-mismatch");
  }
  // 5: and the same historical source, stage and variant identity as the
  // immutable intent. Later advancement of main cannot invalidate this chain.
  if (realAware(receipt.repositoryRealpath ?? "") !== realAware(journal.repositoryRealpath ?? "") ||
      realAware(receipt.authorizedWorktreeRealpath ?? "") !==
        realAware(journal.authorizedWorktreeRealpath ?? "") ||
      receipt.branch !== journal.branch || receipt.approvedHead !== journal.approvedHead ||
      receipt.sourceTree !== journal.sourceTree ||
      !sameJson(receipt.stableGitIdentity, journal.gitExecutable) ||
      receipt.acceptedExtensionVariant !== ACCEPTED_EXTENSION_VARIANT ||
      realAware(receipt.stageReceiptPath ?? "") !== realAware(journal.stageReceiptPath ?? "") ||
      receipt.stageReceiptSha256 !== journal.stageReceiptSha256 ||
      receipt.buildMarker !== journal.buildMarker) {
    return unresolved("receipt-source-mismatch");
  }
  // 6-8: a contiguous chain whose terminal record is accepted and binds this receipt.
  let chain;
  try {
    chain = readTransactionChain(transactionDirectory(foundation.root, activationId));
  } catch {
    return unresolved("transaction-chain-unreadable");
  }
  if (chain.present !== true || chain.records.length === 0) return unresolved("transaction-absent");
  const terminal = chain.records[chain.records.length - 1]?.record;
  if (!terminal || terminal.mode !== TRANSACTION_MODE || terminal.activationId !== activationId) {
    return unresolved("transaction-foreign");
  }
  if (realAware(terminal.repositoryRealpath ?? "") !== realAware(journal.repositoryRealpath ?? "") ||
      realAware(terminal.authorizedWorktreeRealpath ?? "") !==
        realAware(journal.authorizedWorktreeRealpath ?? "") ||
      terminal.branch !== journal.branch || terminal.approvedHead !== journal.approvedHead ||
      terminal.sourceTree !== journal.sourceTree ||
      !sameJson(terminal.stableGitIdentity, journal.gitExecutable) ||
      realAware(terminal.intentPath ?? "") !== realAware(intentPath) ||
      terminal.intentSha256 !== sha256Bytes(bytes) ||
      realAware(terminal.stageReceiptPath ?? "") !== realAware(journal.stageReceiptPath ?? "") ||
      terminal.stageReceiptSha256 !== journal.stageReceiptSha256 ||
      terminal.acceptedExtensionVariant !== ACCEPTED_EXTENSION_VARIANT ||
      terminal.buildMarker !== journal.buildMarker) {
    return unresolved("transaction-foreign");
  }
  if (terminal.transactionState !== "accepted") return unresolved("transaction-not-accepted");
  if (realAware(terminal.activationReceiptPath ?? "") !== realAware(receiptPath) ||
      terminal.activationReceiptSha256 !== receiptSha256) {
    return unresolved("accepted-receipt-binding-mismatch");
  }
  return Object.freeze({
    resolved: true, code: null, intentPath, activationId,
    intentSha256: sha256Bytes(bytes), receiptPath, receiptSha256,
  });
}

/**
 * Preparation may proceed only when EVERY existing intent is independently
 * proven resolved. Directory non-emptiness is never authority on its own, and
 * no intent is ever deleted, renamed or rewritten to make room for a new one.
 */
function assertEveryIntentResolved(intentsDirectory, foundation, source, { environment = process.env } = {}) {
  const entries = fs.readdirSync(intentsDirectory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
  const seen = new Set();
  const classifications = [];
  for (const entry of entries) {
    const absolute = path.join(intentsDirectory, entry.name);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      fail("activation-intent-entry-invalid", "Only regular intent files may occupy activation-intents.", {
        entry: entry.name,
      });
    }
    if (!/^[0-9]{8}T[0-9]{9}Z-[0-9a-f]{12}\.json$/u.test(entry.name)) {
      fail("activation-intent-entry-unknown", "An unrecognized file occupies activation-intents.", {
        entry: entry.name,
      });
    }
    const activationId = entry.name.slice(0, -".json".length);
    if (seen.has(activationId)) {
      fail("activation-intent-duplicate", "Duplicate activation identity in activation-intents.", { activationId });
    }
    seen.add(activationId);
    const classification = classifyExistingIntent(absolute, foundation, source, { environment });
    classifications.push(classification);
    if (classification.resolved !== true) {
      fail("activation-intent-unresolved", "An unresolved or foreign activation intent already exists.", {
        intentPath: absolute, reason: classification.code,
      });
    }
  }
  return Object.freeze({ resolved: classifications.length, classifications: Object.freeze(classifications) });
}

function buildActivationIntent(verification, activationId, createdAt) {
  return {
    schemaVersion: ACTIVATION_INTENT_SCHEMA_VERSION,
    mode: ACTIVATION_INTENT_MODE,
    purpose: ACTIVATION_INTENT_PURPOSE,
    activationId,
    createdAt,
    repositoryRealpath: verification.source.repository,
    authorizedWorktreeRealpath: verification.source.repository,
    branch: verification.source.branch,
    approvedHead: verification.source.approvedHead,
    sourceTree: verification.source.sourceTree,
    gitExecutable: verification.source.gitExecutable,
    foundationCommits: [...FOUNDATION_COMMITS],
    stageReceiptPath: verification.receiptPath,
    stageReceiptSha256: verification.receiptSha256,
    stagingRoot: verification.stage.stagingRoot,
    buildMarker: verification.stage.buildMarker,
    stageManifests: verification.stage.manifests,
    rollbackScope: "whole-release",
    finalActivationReceiptDurable: false,
    activationPerformed: false,
    reloadPerformed: false,
    canaryPerformed: false,
    pushPerformed: false,
    transactionState: "prepared",
    durability: {
      fileFsync: { attempted: true, succeeded: true },
      // The post-link directory fsync happens after these immutable bytes are
      // published, so its actual outcome is returned by preparation rather than
      // retroactively rewriting this no-replace journal.
      directoryFsync: {
        attempted: true,
        succeeded: null,
        unsupported: null,
        actualOutcomeReturnedByPreparation: true,
      },
      processCrashAtomicity: true,
      powerLossDurabilityGuaranteed: false,
    },
    trees: canonicalTreeRecords(verification, activationId),
  };
}

export function classifyRecoveryState(journal, expected = {}) {
  if (!plainObject(journal) || journal.schemaVersion !== ACTIVATION_INTENT_SCHEMA_VERSION ||
      journal.mode !== ACTIVATION_INTENT_MODE || journal.purpose !== ACTIVATION_INTENT_PURPOSE ||
      typeof journal.activationId !== "string" || !ACTIVATION_ID_PATTERN.test(journal.activationId)) {
    return Object.freeze({ classification: "foreign-or-unowned-journal", code: "foreign-or-unowned-journal" });
  }
  if ((expected.repositoryRealpath && journal.repositoryRealpath !== expected.repositoryRealpath) ||
      (expected.authorizedWorktreeRealpath && journal.authorizedWorktreeRealpath !== expected.authorizedWorktreeRealpath)) {
    return Object.freeze({ classification: "foreign-or-unowned-journal", code: "foreign-or-unowned-journal" });
  }
  if (journal.rollbackScope !== "whole-release" || journal.finalActivationReceiptDurable !== false ||
      journal.activationPerformed !== false || journal.reloadPerformed !== false ||
      journal.canaryPerformed !== false || journal.pushPerformed !== false) {
    return Object.freeze({ classification: "contradictory-journal", code: "contradictory-journal" });
  }
  if (!Array.isArray(journal.trees) || journal.trees.length !== 3 ||
      JSON.stringify(journal.trees.map((tree) => tree?.logicalName).sort()) !==
        JSON.stringify(["alias", "dev_output", "extension"])) {
    return Object.freeze({ classification: "contradictory-journal", code: "contradictory-journal" });
  }
  const allowedPrevious = new Set(["unknown", "absent", "present"]);
  const allowedRestoration = new Set(["unknown", "restore-previous", "remove-promoted-to-absent"]);
  for (const tree of journal.trees) {
    if (!plainObject(tree) || !FUTURE_TREE_STATES.includes(tree.state) ||
        !allowedPrevious.has(tree.previousState) || !allowedRestoration.has(tree.restorationMode) ||
        typeof tree.livePath !== "string" || typeof tree.incomingPath !== "string" ||
        typeof tree.previousPath !== "string" || tree.verified !== (tree.state === "verified")) {
      return Object.freeze({ classification: "contradictory-journal", code: "contradictory-journal" });
    }
    const siblings = futureSiblingNames(path.basename(tree.livePath), journal.activationId);
    if (tree.incomingPath !== path.join(path.dirname(tree.livePath), siblings.incoming) ||
        tree.previousPath !== path.join(path.dirname(tree.livePath), siblings.previous)) {
      return Object.freeze({ classification: "contradictory-journal", code: "contradictory-journal" });
    }
    if (tree.state === "untouched" && (tree.previousState !== "unknown" || tree.previousIdentity !== null ||
        tree.restorationMode !== "unknown")) {
      return Object.freeze({ classification: "contradictory-journal", code: "contradictory-journal" });
    }
    if (["live-retired", "incoming-promoted", "verified", "restored"].includes(tree.state)) {
      const absent = tree.previousState === "absent" && tree.previousIdentity === null &&
        tree.restorationMode === "remove-promoted-to-absent";
      const present = tree.previousState === "present" && typeof tree.previousIdentity === "string" &&
        tree.previousIdentity.length > 0 && tree.restorationMode === "restore-previous";
      if (!absent && !present) {
        return Object.freeze({ classification: "contradictory-journal", code: "contradictory-journal" });
      }
    }
  }
  const allUntouched = journal.trees.every((tree) => tree.state === "untouched");
  if (allUntouched && journal.transactionState === "prepared") {
    return Object.freeze({ classification: "prepared-no-payload-mutation", code: null });
  }
  if (allUntouched && journal.transactionState === "promotion-not-started") {
    return Object.freeze({ classification: "promotion-not-started", code: null });
  }
  if (journal.trees.some((tree) => tree.state !== "untouched")) {
    return Object.freeze({ classification: "promotion-state-requires-p3-recovery", code: "p3-recovery-required" });
  }
  return Object.freeze({ classification: "contradictory-journal", code: "contradictory-journal" });
}

function requireIntentBoundaryFields(journal) {
  if (journal.rollbackScope !== "whole-release" || journal.finalActivationReceiptDurable !== false ||
      journal.activationPerformed !== false || journal.reloadPerformed !== false ||
      journal.canaryPerformed !== false || journal.pushPerformed !== false) {
    fail("activation-intent-boundary", "P2 intent cannot claim activation, durable acceptance, reload, canary, or push.");
  }
  if (journal.durability?.fileFsync?.attempted !== true ||
      journal.durability?.fileFsync?.succeeded !== true ||
      journal.durability?.directoryFsync?.attempted !== true ||
      journal.durability?.directoryFsync?.succeeded !== null ||
      journal.durability?.directoryFsync?.unsupported !== null ||
      journal.durability?.directoryFsync?.actualOutcomeReturnedByPreparation !== true ||
      journal.durability?.processCrashAtomicity !== true ||
      journal.durability?.powerLossDurabilityGuaranteed !== false) {
    fail("activation-intent-durability-evidence", "Intent durability evidence is incomplete or overstated.");
  }
}

export function inspectActivationIntent(intentPath, { environment = process.env } = {}) {
  assertNoDestinationOverrides(environment);
  const absolute = path.resolve(intentPath);
  assertRegularFile(absolute, "activation-intent-not-regular");
  const source = collectSourcePreflight(REPOSITORY_ROOT);
  const foundation = deriveCanonicalFoundation(source.repository);
  const intentsDirectory = foundation.futureSubpaths["activation-intents"];
  assertRealDirectoryOrAbsent(foundation.root, "canonical-anchor-symlink", "canonical-anchor-unreadable");
  assertRealDirectoryOrAbsent(intentsDirectory, "activation-intents-symlink", "activation-intents-invalid");
  if (realAware(path.dirname(absolute)) !== realAware(intentsDirectory)) {
    fail("activation-intent-location", "Intent must be directly beneath the derived activation-intents directory.");
  }
  const bytes = fs.readFileSync(absolute);
  let journal;
  try { journal = JSON.parse(bytes.toString("utf8")); } catch {
    fail("activation-intent-malformed", "Activation intent is not valid JSON.");
  }
  validateActivationId(journal?.activationId);
  if (path.basename(absolute) !== `${journal.activationId}.json`) {
    fail("activation-intent-id-mismatch", "Activation intent ID does not match its filename.");
  }
  if (journal.repositoryRealpath !== source.repository || journal.authorizedWorktreeRealpath !== source.repository ||
      journal.branch !== source.branch || journal.approvedHead !== source.approvedHead ||
      journal.sourceTree !== source.sourceTree || !sameJson(journal.gitExecutable, source.gitExecutable)) {
    fail("activation-intent-source-mismatch", "Activation intent no longer matches executable source authority.");
  }
  if (!Array.isArray(journal.foundationCommits) || !sameJson(journal.foundationCommits, FOUNDATION_COMMITS)) {
    fail("activation-intent-foundation-mismatch", "Activation intent foundation identities are incomplete or changed.");
  }
  let canonicalCreatedAt = null;
  try { canonicalCreatedAt = new Date(journal.createdAt).toISOString(); } catch {}
  if (typeof journal.createdAt !== "string" || canonicalCreatedAt !== journal.createdAt) {
    fail("activation-intent-created-at", "Activation intent creation time is not canonical ISO-8601.");
  }
  requireIntentBoundaryFields(journal);
  assertRegularFile(journal.stageReceiptPath, "activation-intent-receipt-missing");
  if (sha256File(journal.stageReceiptPath) !== journal.stageReceiptSha256) {
    fail("activation-intent-receipt-changed", "Stage receipt bytes no longer match the intent.");
  }
  const verified = verifyStageReceipt(journal.stageReceiptPath, { environment });
  if (journal.stageReceiptPath !== verified.receiptPath || journal.stagingRoot !== verified.stage.stagingRoot ||
      journal.buildMarker !== verified.stage.buildMarker ||
      !sameJson(journal.stageManifests, verified.stage.manifests)) {
    fail("activation-intent-stage-changed", "Staged evidence no longer matches the durable intent.");
  }
  const expectedTrees = canonicalTreeRecords(verified, journal.activationId);
  for (const expectedTree of expectedTrees) {
    const actual = journal.trees?.find((tree) => tree.logicalName === expectedTree.logicalName);
    if (!actual || actual.livePath !== expectedTree.livePath || actual.incomingPath !== expectedTree.incomingPath ||
        actual.previousPath !== expectedTree.previousPath) {
      fail("activation-intent-tree-mismatch", "Intent tree names or activation-specific paths are invalid.", {
        logicalName: expectedTree.logicalName,
      });
    }
  }
  const recovery = classifyRecoveryState(journal, {
    repositoryRealpath: source.repository,
    authorizedWorktreeRealpath: source.repository,
  });
  if (recovery.code === "p3-recovery-required") {
    fail("p3-recovery-required", "Journal records payload mutation and requires P3 recovery.", { recovery });
  }
  if (recovery.code) fail(recovery.code, "Activation intent is contradictory or foreign.", { recovery });
  return Object.freeze({
    ok: true,
    mode: "inspect-activation-intent",
    intentPath: absolute,
    intentSha256: sha256Bytes(bytes),
    journal,
    recovery,
    mutationPerformed: false,
  });
}

export function prepareActivationIntent(receiptPath, {
  environment = process.env,
  now = new Date(),
  randomBytes = crypto.randomBytes,
} = {}) {
  // Mutation-capable: acquires the publisher lock and writes a durable intent journal.
  const first = verifyStageReceipt(receiptPath, { environment, requireCanonicalClean: true });
  // Mandatory approved-root gate before any coordination or payload mutation.
  assertApprovedProductionRoot({
    repository: first.source.repository,
    cockpitProRoot: path.dirname(first.source.repository),
    anchorRoot: first.canonicalFoundation.root,
  });
  const activationId = generateActivationId({ now, randomBytes });
  return withPublisherLock(first.canonicalFoundation, first.source, (lock) => {
    const second = verifyStageReceipt(receiptPath, { environment, requireCanonicalClean: true });
    if (verificationIdentity(first) !== verificationIdentity(second)) {
      fail("activation-intent-revalidation-changed", "Verified source or stage evidence changed after lock acquisition.");
    }
    const foundation = second.canonicalFoundation;
    const anchorDirectory = ensureCoordinationDirectory(
      foundation.root, "canonical-anchor-symlink", "canonical-anchor-invalid");
    const intentsDirectory = foundation.futureSubpaths["activation-intents"];
    const intentsDirectoryEvidence = ensureCoordinationDirectory(
      intentsDirectory, "activation-intents-symlink", "activation-intents-invalid");
    const finalVerification = verifyStageReceipt(receiptPath, { environment, requireCanonicalClean: true });
    if (verificationIdentity(second) !== verificationIdentity(finalVerification)) {
      fail("activation-intent-revalidation-changed", "Verified source or stage evidence changed immediately before journal creation.");
    }
    const resolvedIntents = assertEveryIntentResolved(intentsDirectory, foundation, second.source,
      { environment });
    const journal = buildActivationIntent(finalVerification, activationId, now.toISOString());
    const durable = writeDurableActivationIntent(intentsDirectory, activationId, journal, {
      ownerId: lock.ownerId,
    });
    return Object.freeze({
      ok: true,
      mode: "prepare-activation-intent",
      activationId,
      intentPath: durable.path,
      intentSha256: durable.sha256,
      durability: durable.durability,
      coordinationDirectories: Object.freeze({
        anchor: anchorDirectory,
        activationIntents: intentsDirectoryEvidence,
      }),
      // Every pre-existing intent was independently proven resolved; none was
      // moved, rewritten or deleted to make room for this one.
      resolvedIntentsObserved: resolvedIntents.resolved,
      priorIntentsMutated: false,
      gitExecutableStable: finalVerification.source.gitExecutable,
      gitExecutableProcessAttestation: finalVerification.source.gitExecutableProcessAttestation,
      journal,
      lockReleased: true,
      activationPerformed: false,
      canonicalPayloadMutationPerformed: false,
      browserActionPerformed: false,
      networkActionPerformed: false,
      pushPerformed: false,
    });
  });
}

/* ------------------------------------------------------------------------- *
 * P3C — production activation, canonical verification, recovery, rollback
 *
 * The activator owns every exclusion lifecycle: the shared publisher lock and the
 * real canonical-delivery lease. The payload module receives only narrow injected
 * ownership-verification callbacks, so no broad lease or lock capability leaks
 * into it.
 * ------------------------------------------------------------------------- */

export const ACTIVATION_LEASE_PURPOSE = "canonical-activation";
export const ACTIVATION_LEASE_LANE = "activation";

/**
 * Acquire the real canonical-delivery lease for one activation and return narrow
 * verification callbacks plus a release function. The ownership token never
 * leaves this closure.
 */
export function withCanonicalLease({
  foundation, source, activationId, leaseApi = null, buildTs = null,
}, callback) {
  validateActivationId(activationId);
  const api = leaseApi ?? { acquireLease, verifyLease, releaseLease };
  // The lease binds the exact canonical extension variant this activation may
  // publish, derived from the same pinned unit table the promotion uses.
  const extensionUnit = canonicalUnitPaths(source.repository, activationId)
    .find((unit) => unit.logicalName === "extension");
  let held = null;
  try {
    held = api.acquireLease({
      anchorRoot: foundation.root,
      canonicalRoot: path.dirname(source.repository),
      authoritativeRepositoryRoot: source.repository,
      publisherRepositoryRoot: source.repository,
      publisherWorktreeRoot: source.repository,
      branch: source.branch,
      head: source.approvedHead,
      purpose: ACTIVATION_LEASE_PURPOSE,
      lane: ACTIVATION_LEASE_LANE,
      buildTs: buildTs ?? new Date(0).toISOString(),
      expectedExtensionOutput: extensionUnit.livePath,
    });
  } catch (error) {
    fail("canonical-lease-unavailable", "Canonical delivery lease could not be acquired.", {
      code: error?.code ?? null, message: String(error?.message || "").slice(0, 200),
    });
  }
  const token = held.ownershipToken;
  const sessionId = held.lease?.sessionId ?? held.sessionId;
  const verify = () => {
    const observed = api.verifyLease({ anchorRoot: foundation.root, ownershipToken: token });
    // Bind the lease to this repository, approved HEAD and activation.
    if (observed.publisherRepositoryRoot && realAware(observed.publisherRepositoryRoot) !== source.repository) {
      fail("canonical-lease-identity-drift", "Lease repository binding drifted.", {});
    }
    if (observed.approvedHead && observed.approvedHead !== source.approvedHead) {
      fail("canonical-lease-identity-drift", "Lease approved HEAD binding drifted.", {});
    }
    if (observed.sessionId !== sessionId) {
      fail("canonical-lease-identity-drift", "Lease session identity drifted.", {});
    }
    return { sessionId: observed.sessionId, activationId };
  };
  let released = false;
  const release = () => {
    if (released) return true;
    released = true;
    try {
      api.releaseLease({ anchorRoot: foundation.root, ownershipToken: token });
      return true;
    } catch { return false; }
  };
  try {
    return callback({ sessionId, verify, release });
  } finally {
    release();
  }
}

/**
 * The complete fresh revalidation P3C must perform immediately before the first
 * production payload mutation. Nothing recorded by P2 or P3 is trusted: every
 * item is re-established from the filesystem and executable Git.
 */
export function freshActivationRevalidation(receiptPath, intentPath, {
  environment = process.env, approvedRoots = null,
} = {}) {
  // Mutation-capable: this is the gate immediately before production payload mutation.
  // inspectActivationIntent below also enforces cleanliness, but that is transitive;
  // stating it here keeps the guarantee local and independent of that call order.
  const verification = verifyStageReceipt(receiptPath, {
    environment, requireCanonicalClean: true,
  });
  assertApprovedProductionRoot({
    repository: verification.source.repository,
    cockpitProRoot: path.dirname(verification.source.repository),
    anchorRoot: verification.canonicalFoundation.root,
  });
  const intentBytes = fs.readFileSync(intentPath);
  const intentSha256 = sha256Bytes(intentBytes);
  const inspected = inspectActivationIntent(intentPath, { environment });
  if (inspected.recovery?.classification !== "prepared-no-payload-mutation") {
    fail("activation-intent-not-a-proposal", "Only a prepared, unmutated intent may authorize activation.", {
      classification: inspected.recovery?.classification ?? null,
    });
  }
  const journal = JSON.parse(intentBytes.toString("utf8"));
  if (journal.stageReceiptSha256 !== verification.receiptSha256) {
    fail("activation-intent-stage-mismatch", "Intent does not bind this exact stage receipt.");
  }
  if (journal.buildMarker !== verification.stage.buildMarker) {
    fail("activation-intent-build-marker", "Intent build marker differs from the verified stage.");
  }
  if (!sameJson(journal.gitExecutable, verification.source.gitExecutable)) {
    fail("activation-intent-git-identity", "Intent stable Git identity differs from the current attestation.");
  }
  if (journal.repositoryRealpath !== verification.source.repository ||
      journal.branch !== verification.source.branch ||
      journal.approvedHead !== verification.source.approvedHead ||
      journal.sourceTree !== verification.source.sourceTree) {
    fail("activation-intent-source-mismatch", "Intent source authority differs from the fresh verification.");
  }
  return Object.freeze({
    verification, journal, intentPath: realAware(intentPath), intentSha256,
    activationId: journal.activationId,
  });
}

/**
 * Production activation. Explicit receipt AND intent are required; an intent is
 * never created here. No browser reload, canary, push or network access occurs.
 */
/**
 * Re-prove publisher-lock ownership immediately before a payload mutation. The
 * lock directory must still exist and still record this process and this owner
 * id; anything else means the lock was lost, replaced or taken over.
 */
export function assertPublisherLockStillOwned(lockDirectory, lock) {
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(path.join(lockDirectory, "lock.json"), "utf8"));
  } catch {
    fail("publisher-lock-ownership-lost", "Publisher lock metadata is unreadable or absent.", { lockDirectory });
  }
  if (metadata?.ownerId !== lock.ownerId || metadata?.pid !== process.pid) {
    fail("publisher-lock-ownership-lost", "Publisher lock is no longer owned by this invocation.", {
      expectedOwnerId: lock.ownerId, observedOwnerId: metadata?.ownerId ?? null,
    });
  }
  return true;
}

export function activateReceipt(receiptPath, intentPath, {
  environment = process.env, leaseApi = null, now = new Date(), hooks = {},
} = {}) {
  const fresh = freshActivationRevalidation(receiptPath, intentPath, { environment });
  const { verification, journal, activationId } = fresh;
  const foundation = verification.canonicalFoundation;
  const source = verification.source;

  return withPublisherLock(foundation, source, (lock) => withCanonicalLease(
    { foundation, source, activationId, leaseApi, buildTs: verification.stage.buildMarker },
    (lease) => {
      // Re-establish everything under both exclusions before any mutation.
      const revalidated = freshActivationRevalidation(receiptPath, intentPath, { environment });
      if (revalidated.intentSha256 !== fresh.intentSha256 ||
          revalidated.verification.receiptSha256 !== verification.receiptSha256) {
        fail("activation-revalidation-changed", "Receipt or intent changed after exclusion was acquired.");
      }
      lease.verify();

      const units = canonicalUnitPaths(source.repository, activationId);
      const { directory } = ensureTransactionDirectory(foundation.root, activationId);
      const guards = {
        verifyLock: () => assertPublisherLockStillOwned(foundation.publisherLock, lock),
        verifyLease: () => lease.verify(),
        leaseSessionId: lease.sessionId,
      };
      const baseRecord = buildActivationBaseRecord({
        journal, verification, fresh, units, lockOwnerId: lock.ownerId,
      });

      // P3A route: prepare incoming payload for all three units.
      const prepared = {};
      for (const unit of units) {
        const ownership = createOwnedIncomingRoot(unit, activationId);
        prepared[unit.logicalName] = prepareIncomingTree(verification, unit,
          { repository: source.repository, ownership });
        releaseIncomingOwnership(ownership);
      }
      if (hooks.afterPrepare) hooks.afterPrepare(prepared);

      // P3B route: promote the three-tree release.
      const expectedDigests = Object.fromEntries(
        Object.entries(prepared).map(([name, value]) => [name, value.promotionIdentity]));
      const release = promoteReleaseWithJournal({
        units, activationId, directory, baseRecord, ownerId: lock.ownerId, guards, expectedDigests,
        // Fixture-only interruption points; production callers pass no hooks.
        hooks,
      });
      if (!release.released) {
        fail("activation-release-failed", "Three-tree promotion did not complete; the release was reversed.", {
          failedAt: release.failedAt, code: release.code, gapTakeover: release.gapTakeover === true,
        });
      }
      if (hooks.afterPromote) hooks.afterPromote(release);

      // Finalize: durable receipt first, terminal record only afterwards.
      const chain = readTransactionChain(directory);
      // Verify all three live trees against the identities this exact stage
      // prepared, before any receipt exists and before acceptance is possible.
      const promotedIdentities = {};
      const canonicalVerification = {};
      for (const unit of units) {
        const observed = recomputeIncomingManifest(unit.livePath, "");
        const expected = expectedDigests[unit.logicalName];
        if (observed.treeDigest !== expected) {
          fail("activation-canonical-verification-failed",
            "A promoted canonical tree does not match the prepared incoming identity.", {
              logicalName: unit.logicalName,
            });
        }
        promotedIdentities[unit.logicalName] = observed;
        canonicalVerification[unit.logicalName] = Object.freeze({
          verified: true, treeDigest: observed.treeDigest, fileCount: observed.fileCount,
          comparedAgainst: "prepared-incoming-identity",
        });
      }
      const receipt = buildActivationReceipt({
        activationId,
        transactionRecordPath: chain.records[chain.records.length - 1].path,
        transactionRecordSha256: chain.headSha256,
        intentPath: fresh.intentPath, intentSha256: fresh.intentSha256,
        stageReceiptPath: verification.receiptPath, stageReceiptSha256: verification.receiptSha256,
        repositoryRealpath: source.repository, authorizedWorktreeRealpath: source.repository,
        branch: source.branch, approvedHead: source.approvedHead, sourceTree: source.sourceTree,
        stableGitIdentity: source.gitExecutable,
        acceptedExtensionVariant: verification.stage.extensionVariant,
        buildMarker: verification.stage.buildMarker,
        stagedIdentities: verification.stage.manifests,
        incomingIdentities: Object.fromEntries(Object.entries(prepared)
          .map(([name, value]) => [name, { treeDigest: value.treeDigest, fileCount: value.fileCount }])),
        previousCanonicalIdentities: buildPreviousGenerationEvidence({
          units, chain, promotedIdentities, expectedDigests,
          buildMarker: verification.stage.buildMarker,
        }),
        promotedCanonicalIdentities: promotedIdentities,
        canonicalVerification,
        promotionPrimitive: "fail-closed-two-rename",
        preparedAt: now.toISOString(), promotedAt: now.toISOString(),
        verifiedAt: now.toISOString(), acceptedAt: now.toISOString(),
        rollbackAvailable: true,
        rollbackCandidates: Object.fromEntries(units.map((unit) => [unit.logicalName, unit.retiredPath])),
      });
      if (hooks.beforeReceipt) hooks.beforeReceipt();

      let published;
      try {
        published = publishActivationReceipt(foundation.root, activationId, receipt,
          { ownerId: lock.ownerId, failureInjection: hooks.receiptFailureInjection ?? null });
      } catch (error) {
        // A verified but unreceipted generation must never be accepted.
        const reversal = reverseRelease({
          changed: release.changed.map((entry) => ({
            unit: units.find((unit) => unit.logicalName === entry.logicalName),
            previous: { state: entry.previousState, treeDigest: entry.previousTreeDigest ?? null,
              restorationMode: entry.previousState === "absent"
                ? "remove-promoted-to-absent" : "restore-previous" },
            promotedTreeDigest: entry.promotedTreeDigest,
          })),
          activationId, directory, baseRecord, ownerId: lock.ownerId, guards,
        });
        fail("activation-receipt-publication-failed",
          "Final activation receipt could not be published; the release was reversed and is not accepted.", {
            code: error?.code ?? null, reversed: reversal.reversed === true,
          });
      }

      const accepted = appendAcceptedRecord({
        directory, baseRecord, sequence: readTransactionChain(directory).records.length + 1,
        previousRecordSha256: readTransactionChain(directory).headSha256,
        ownerId: lock.ownerId, receipt: published,
        trees: baseRecord.trees.map((tree) => ({ ...tree, state: "accepted" })),
      });
      return Object.freeze({
        ok: true, mode: "activate-receipt", activationId,
        activationReceiptPath: published.path, activationReceiptSha256: published.sha256,
        terminalRecordPath: accepted.path,
        activationPerformed: true, reloadPerformed: false, canaryPerformed: false, pushPerformed: false,
        networkActionPerformed: false, browserActionPerformed: false,
      });
    }));
}

/**
 * Complete previous-generation evidence for every canonical unit, derived from
 * the folded transaction chain — never from a caller-supplied identity.
 *
 * `rollbackCandidateAvailable` is computed, not asserted: it is true only when
 * a previous generation actually existed AND its internally derived retired
 * sibling is present on disk AND its recomputed digest matches what this
 * transaction captured. A first activation therefore never claims rollback
 * bytes exist, and a missing or drifted candidate can never be marked
 * available.
 */
export function buildPreviousGenerationEvidence({
  units, chain, promotedIdentities, expectedDigests, buildMarker,
}) {
  const folded = foldChainTreeStates(chain);
  return Object.fromEntries(units.map((unit) => {
    const tree = folded[unit.logicalName] ?? {};
    const previousState = tree.previousState === "present" || tree.previousState === "absent"
      ? tree.previousState
      : (tree.previousIdentity ? "present" : "absent");
    const present = previousState !== "absent";
    let previousManifest = null;
    let candidateVerified = false;
    if (present) {
      try {
        const observed = recomputeIncomingManifest(unit.retiredPath, "");
        previousManifest = observed;
        candidateVerified = typeof tree.previousIdentity === "string" &&
          observed.treeDigest === tree.previousIdentity;
      } catch {
        candidateVerified = false;
      }
    }
    const requiredPresent = previousManifest === null ? null : REQUIRED_EXTENSION_FILES
      .filter((required) => previousManifest.entries.some((entry) => entry.path === required));
    return [unit.logicalName, Object.freeze({
      logicalName: unit.logicalName,
      livePath: unit.livePath,
      previousState,
      previousEntryType: present ? "directory" : "absent",
      previousTreeDigest: present ? (tree.previousIdentity ?? null) : null,
      previousFileCount: previousManifest?.fileCount ?? null,
      previousManifest: previousManifest?.entries ?? null,
      // The previous generation's own build marker belongs to its own
      // activation and is not part of this transaction's evidence; it is
      // recorded as unknown rather than fabricated. Rollback verifies the
      // candidate by recomputed tree digest, which is stronger.
      previousBuildMarker: null,
      previousRequiredFiles: unit.logicalName === "extension" ? requiredPresent : null,
      retiredCandidatePath: present ? unit.retiredPath : null,
      promotedTreeDigest: promotedIdentities[unit.logicalName]?.treeDigest ?? null,
      promotedFileCount: promotedIdentities[unit.logicalName]?.fileCount ?? null,
      promotedBuildMarker: buildMarker,
      sameStageIdentity: expectedDigests[unit.logicalName] ?? null,
      rollbackCandidateAvailable: present && candidateVerified,
    })];
  }));
}

function buildActivationBaseRecord({ journal, verification, fresh, units, lockOwnerId }) {
  return {
    activationId: journal.activationId, sequence: 1, previousRecordSha256: null,
    createdAt: journal.createdAt,
    intentPath: fresh.intentPath, intentSha256: fresh.intentSha256,
    stageReceiptPath: verification.receiptPath, stageReceiptSha256: verification.receiptSha256,
    repositoryRealpath: verification.source.repository,
    authorizedWorktreeRealpath: verification.source.repository,
    branch: verification.source.branch, approvedHead: verification.source.approvedHead,
    sourceTree: verification.source.sourceTree,
    stableGitIdentity: verification.source.gitExecutable,
    acceptedExtensionVariant: verification.stage.extensionVariant,
    buildMarker: verification.stage.buildMarker,
    owner: { ownerId: lockOwnerId, pid: process.pid },
    transactionState: "untouched",
    trees: units.map((unit) => ({
      logicalName: unit.logicalName, state: "untouched",
      livePath: unit.livePath, incomingPath: unit.incomingPath, retiredPath: unit.retiredPath,
    })),
  };
}

/**
 * P3C-A2 — operational production canonical verification.
 *
 * Strictly read-only: no lock, no lease, no journal append, no receipt
 * publication, and no filesystem mutation of any kind. Every authority is
 * re-established from the filesystem and executable Git; nothing recorded by an
 * earlier phase is trusted.
 */
export function verifyCanonicalFromReceipt(receiptPath, {
  environment = process.env,
} = {}) {
  assertNoDestinationOverrides(environment);
  // 2-9: module, executable-Git and worktree agreement, branch main, approved
  // HEAD and source tree, empty index, clean tracked source, no untracked
  // source, stable Git executable identity.
  const source = collectSourcePreflight(REPOSITORY_ROOT);
  const foundation = deriveCanonicalFoundation(source.repository);
  // 1: approved canonical repository and cockpit-pro roots.
  assertApprovedProductionRoot({
    repository: source.repository, cockpitProRoot: path.dirname(source.repository),
    anchorRoot: foundation.root,
  });

  // 10: the receipt is a regular, non-symlink file.
  assertRegularFile(receiptPath, "activation-receipt-not-regular");
  const absolute = path.resolve(receiptPath);
  const bytes = fs.readFileSync(absolute);
  // 12: bytes and digest are recomputed here, never taken from the receipt.
  const receiptSha256 = sha256Bytes(bytes);
  let receipt;
  try { receipt = JSON.parse(bytes.toString("utf8")); } catch {
    fail("activation-receipt-malformed", "Activation receipt is not valid JSON.");
  }
  // 11: schema and mode are exact.
  if (receipt?.schemaVersion !== ACTIVATION_RECEIPT_SCHEMA_VERSION ||
      receipt?.mode !== ACTIVATION_RECEIPT_MODE) {
    fail("activation-receipt-mode-invalid", "Activation receipt schema or mode is not exact.", {
      schemaVersion: receipt?.schemaVersion ?? null, mode: receipt?.mode ?? null,
    });
  }
  validateActivationId(receipt.activationId);
  // 10 (continued): the receipt occupies its canonical no-replace location.
  if (realAware(absolute) !== realAware(activationReceiptPath(foundation.root, receipt.activationId))) {
    fail("activation-receipt-location", "Activation receipt is not in its canonical no-replace location.");
  }

  // 18/19 source binding: repository, worktree, branch, HEAD, tree, Git identity.
  if (realAware(receipt.repositoryRealpath ?? "") !== source.repository ||
      realAware(receipt.authorizedWorktreeRealpath ?? "") !== source.repository) {
    fail("activation-receipt-repository-mismatch", "Receipt repository differs from the executing authority.");
  }
  if (receipt.branch !== source.branch || receipt.approvedHead !== source.approvedHead ||
      receipt.sourceTree !== source.sourceTree) {
    fail("activation-receipt-source-mismatch", "Receipt source authority differs from the fresh verification.", {
      branch: receipt.branch ?? null, approvedHead: receipt.approvedHead ?? null,
    });
  }
  if (!sameJson(receipt.stableGitIdentity, source.gitExecutable)) {
    fail("activation-receipt-git-identity", "Receipt stable Git identity differs from the current attestation.");
  }
  // 9: accepted extension variant.
  if (receipt.acceptedExtensionVariant !== ACCEPTED_EXTENSION_VARIANT) {
    fail("activation-receipt-extension-variant", "Receipt variant is not the independently pinned variant.", {
      expected: ACCEPTED_EXTENSION_VARIANT, observed: receipt.acceptedExtensionVariant ?? null,
    });
  }

  // 14: intent and stage-receipt identities remain valid.
  for (const [pathKey, digestKey, code] of [
    ["intentPath", "intentSha256", "activation-receipt-intent-invalid"],
    ["stageReceiptPath", "stageReceiptSha256", "activation-receipt-stage-invalid"],
  ]) {
    assertRegularFile(receipt[pathKey], code);
    if (sha256File(receipt[pathKey]) !== receipt[digestKey]) {
      fail(code, "Bound evidence bytes no longer match the receipt.", { pathKey });
    }
  }

  // 13/15/20: the transaction chain is present, well formed, owned by this
  // repository, terminal in `accepted`, and binds these exact receipt bytes.
  const chain = readTransactionChain(transactionDirectory(foundation.root, receipt.activationId));
  if (chain.present !== true || chain.records.length === 0) {
    fail("activation-receipt-transaction-missing", "No transaction evidence exists for this activation.");
  }
  const terminal = chain.records[chain.records.length - 1]?.record;
  if (!terminal || terminal.activationId !== receipt.activationId ||
      terminal.mode !== TRANSACTION_MODE) {
    fail("activation-receipt-transaction-foreign", "Transaction evidence is foreign to this activation.");
  }
  if (realAware(terminal.repositoryRealpath ?? "") !== source.repository) {
    fail("activation-receipt-transaction-foreign", "Transaction evidence belongs to another repository.");
  }
  if (terminal.transactionState !== "accepted") {
    fail("activation-not-durably-accepted", "The receipt does not represent a durably accepted release.", {
      transactionState: terminal.transactionState ?? null,
    });
  }
  const boundReceiptSha256 = terminal.activationReceiptSha256 ?? terminal.receiptSha256 ?? null;
  if (boundReceiptSha256 !== receiptSha256) {
    fail("activation-receipt-transaction-mismatch", "Terminal record does not bind these receipt bytes.");
  }

  // 16-19: units are internally derived, never taken from the receipt, and every
  // live tree is independently manifested and compared against this stage.
  const units = canonicalUnitPaths(source.repository, receipt.activationId);
  const result = verifyCanonicalAgainstReceipt(units, receipt, {
    expectedBuildMarker: receipt.buildMarker,
    repository: source.repository,
    requiredFiles: REQUIRED_EXTENSION_FILES,
    extensionVariant: ACCEPTED_EXTENSION_VARIANT,
  });
  return Object.freeze({
    ok: true,
    mode: "verify-canonical",
    verified: true,
    mutationPerformed: false,
    activationId: receipt.activationId,
    activationReceiptPath: absolute,
    activationReceiptSha256: receiptSha256,
    manifests: result.results,
    treeDigests: Object.freeze(Object.fromEntries(Object.entries(result.results)
      .map(([name, value]) => [name, value.treeDigest]))),
    buildMarker: receipt.buildMarker,
    sameStageVerified: result.sameStageVerified === true,
    mixedGenerationDetected: false,
    acceptedExtensionVariant: receipt.acceptedExtensionVariant,
    lockAcquired: false,
    leaseAcquired: false,
    transactionAppended: false,
    receiptPublished: false,
    activationPerformed: false,
    reloadPerformed: false,
    canaryPerformed: false,
    pushPerformed: false,
    networkActionPerformed: false,
    browserActionPerformed: false,
  });
}

/* ------------------------------------------------------------------------- *
 * P3C-B1 — deterministic recovery of an interrupted activation
 *
 * Recovery never guesses forward. It completes forward in exactly one case: a
 * durable activation receipt already proves acceptance AND the live canonical
 * payload independently verifies against it. Everything else either restores
 * backward or stops and preserves evidence.
 * ------------------------------------------------------------------------- */

/** Read-only lstat that reports absence rather than throwing. */
function safeLstat(target) {
  try { return fs.lstatSync(target); } catch { return null; }
}

/**
 * Observe one unit's live, incoming and retired state without mutating.
 *
 * `foreignLivePresent` is decided against the identities this transaction
 * itself recorded: a live tree that matches neither what this transaction
 * promoted nor what it captured as previous is not ours to touch.
 */
export function observeUnitRecoveryState(unit, tree) {
  const live = safeLstat(unit.livePath);
  const observation = {
    logicalName: unit.logicalName,
    livePresent: Boolean(live),
    incomingPresent: Boolean(safeLstat(unit.incomingPath)),
    retiredPresent: Boolean(safeLstat(unit.retiredPath)),
    liveTreeDigest: null,
    foreignLivePresent: false,
  };
  if (!live) return Object.freeze(observation);
  if (live.isSymbolicLink() || !live.isDirectory()) {
    // A live entry that is not a real directory is never something recovery
    // may replace on its own authority.
    observation.foreignLivePresent = true;
    return Object.freeze(observation);
  }
  observation.liveTreeDigest = recomputeIncomingManifest(unit.livePath, "").treeDigest;
  const known = [tree?.promotedIdentity ?? null, tree?.previousIdentity ?? null].filter(Boolean);
  observation.foreignLivePresent = known.length > 0 && !known.includes(observation.liveTreeDigest);
  return Object.freeze(observation);
}

/**
 * Fold the whole journal into the true per-unit state.
 *
 * Each promotion record decorates only the unit it acted on and re-emits the
 * other two from the untouched base, so the head record alone under-reports
 * what happened. Recovery must read the entire chain or it would mistake a
 * promoted tree for an untouched one — and therefore miss foreign content.
 */
export function foldChainTreeStates(chain) {
  const latest = {};
  for (const entry of chain?.records ?? []) {
    for (const tree of entry?.record?.trees ?? []) {
      if (!tree?.logicalName) continue;
      const merged = { ...(latest[tree.logicalName] ?? {}), logicalName: tree.logicalName };
      if (tree.state && tree.state !== "untouched") merged.state = tree.state;
      for (const key of ["previousState", "previousIdentity", "restorationMode",
        "promotedIdentity", "retired", "verified", "restorationOutcome"]) {
        if (tree[key] !== undefined) merged[key] = tree[key];
      }
      latest[tree.logicalName] = merged;
    }
  }
  return latest;
}

/** Full read-only observation set for one transaction. */
export function observeRecoveryState(units, treeStates) {
  const observations = {};
  for (const unit of units) {
    observations[unit.logicalName] = observeUnitRecoveryState(unit, treeStates[unit.logicalName]);
  }
  return Object.freeze(observations);
}

/**
 * Reconstruct the reversal input from disk evidence rather than from journal
 * state alone: a unit is reversible only when this transaction demonstrably
 * moved it (its retired sibling exists, or the live tree is what it promoted).
 */
function reconstructChangedUnits(units, treeStates, observations) {
  const changed = [];
  for (const unit of units) {
    const tree = treeStates[unit.logicalName];
    const observation = observations[unit.logicalName];
    if (!tree || !observation) continue;
    const promotedHere = typeof tree.promotedIdentity === "string" &&
      tree.promotedIdentity.length > 0 &&
      observation.liveTreeDigest === tree.promotedIdentity;
    if (!observation.retiredPresent && !promotedHere) continue;
    changed.push({
      unit,
      previous: {
        state: tree.previousState ?? "absent",
        treeDigest: tree.previousIdentity ?? null,
        restorationMode: tree.previousState === "absent"
          ? "remove-promoted-to-absent" : "restore-previous",
      },
      promotedTreeDigest: tree.promotedIdentity ?? null,
    });
  }
  return changed;
}

/**
 * Fresh recovery authority. Re-establishes every source, coordination and
 * transaction identity from the filesystem and executable Git, and resolves the
 * activation only through internally derived canonical coordination paths.
 */
export function freshRecoveryAuthority(activationId, { environment = process.env } = {}) {
  assertNoDestinationOverrides(environment);
  // The argument is an activation identity, never a filesystem path.
  validateActivationId(activationId);
  const source = collectSourcePreflight(REPOSITORY_ROOT);
  const foundation = deriveCanonicalFoundation(source.repository);
  assertApprovedProductionRoot({
    repository: source.repository, cockpitProRoot: path.dirname(source.repository),
    anchorRoot: foundation.root,
  });
  const directory = transactionDirectory(foundation.root, activationId);
  const chain = readTransactionChain(directory);
  if (chain.present !== true || chain.records.length === 0) {
    fail("recovery-transaction-absent", "No transaction evidence exists for this activation.", {
      activationId,
    });
  }
  const head = chain.records[chain.records.length - 1]?.record;
  if (!head || head.mode !== TRANSACTION_MODE || head.activationId !== activationId) {
    fail("recovery-transaction-foreign", "Transaction evidence is foreign to this activation.");
  }
  if (realAware(head.repositoryRealpath ?? "") !== source.repository ||
      realAware(head.authorizedWorktreeRealpath ?? "") !== source.repository) {
    fail("recovery-transaction-foreign", "Transaction evidence belongs to another repository.");
  }
  if (head.branch !== source.branch || head.approvedHead !== source.approvedHead ||
      head.sourceTree !== source.sourceTree) {
    fail("recovery-source-mismatch", "Transaction source authority differs from the fresh verification.");
  }
  if (!sameJson(head.stableGitIdentity, source.gitExecutable)) {
    fail("recovery-git-identity", "Transaction Git identity differs from the current attestation.");
  }
  if (head.acceptedExtensionVariant !== ACCEPTED_EXTENSION_VARIANT) {
    fail("recovery-extension-variant", "Transaction variant is not the independently pinned variant.");
  }
  // The immutable intent and the stage receipt must still be exactly what this
  // transaction bound. The intent remains a proposal and authorizes nothing.
  for (const [pathKey, digestKey, code] of [
    ["intentPath", "intentSha256", "recovery-intent-invalid"],
    ["stageReceiptPath", "stageReceiptSha256", "recovery-stage-invalid"],
  ]) {
    assertRegularFile(head[pathKey], code);
    if (sha256File(head[pathKey]) !== head[digestKey]) {
      fail(code, "Bound evidence bytes no longer match the transaction.", { pathKey });
    }
  }
  // An activation receipt is optional at recovery time, but when present it must
  // be exactly the receipt this activation would have published.
  const receiptPath = activationReceiptPath(foundation.root, activationId);
  let receipt = null;
  const receiptStat = safeLstat(receiptPath);
  if (receiptStat) {
    if (receiptStat.isSymbolicLink() || !receiptStat.isFile()) {
      fail("recovery-receipt-not-regular", "An activation receipt must be a regular file.");
    }
    const bytes = fs.readFileSync(receiptPath);
    let parsed;
    try { parsed = JSON.parse(bytes.toString("utf8")); } catch {
      fail("recovery-receipt-malformed", "Activation receipt is not valid JSON.");
    }
    if (parsed?.mode !== ACTIVATION_RECEIPT_MODE || parsed?.activationId !== activationId) {
      fail("recovery-receipt-mismatch", "Activation receipt does not describe this activation.");
    }
    const sha256 = sha256Bytes(bytes);
    if (typeof head.activationReceiptSha256 === "string" && head.activationReceiptSha256.length > 0 &&
        head.activationReceiptSha256 !== sha256) {
      fail("recovery-receipt-mismatch", "Terminal record does not bind these receipt bytes.");
    }
    receipt = Object.freeze({ path: receiptPath, sha256, receipt: parsed, durable: true });
  }
  return Object.freeze({
    activationId, source, foundation, directory, chain, head, receipt,
    units: canonicalUnitPaths(source.repository, activationId),
  });
}

/** Production deterministic recovery for one interrupted activation. */
export function recoverActivation(activationId, {
  environment = process.env, leaseApi = null, hooks = {},
} = {}) {
  const authority = freshRecoveryAuthority(activationId, { environment });
  const { source, foundation, directory, units } = authority;

  return withPublisherLock(foundation, source, (lock) => withCanonicalLease(
    { foundation, source, activationId, leaseApi, buildTs: authority.head.buildMarker },
    (lease) => {
      // Re-establish everything under both exclusions before deciding anything.
      const revalidated = freshRecoveryAuthority(activationId, { environment });
      if (revalidated.chain.headSha256 !== authority.chain.headSha256 ||
          (revalidated.receipt?.sha256 ?? null) !== (authority.receipt?.sha256 ?? null)) {
        fail("recovery-revalidation-changed", "Transaction or receipt changed after exclusion was acquired.");
      }
      lease.verify();
      const head = revalidated.head;
      const receipt = revalidated.receipt;
      const guards = {
        verifyLock: () => assertPublisherLockStillOwned(foundation.publisherLock, lock),
        verifyLease: () => lease.verify(),
        leaseSessionId: lease.sessionId,
      };
      // The true per-unit state comes from the whole chain, not the head record.
      const treeStates = foldChainTreeStates(revalidated.chain);
      // Overlay the folded state on the head record's tree entries so the
      // schema-required derived paths are preserved.
      const foldedTrees = (head.trees ?? []).map((tree) => ({
        ...tree, ...(treeStates[tree.logicalName] ?? {}),
      }));
      const observations = observeRecoveryState(units, treeStates);
      if (hooks.afterObserve) hooks.afterObserve(observations);

      // Canonical verification is attempted only when a durable receipt exists.
      let canonicalVerified = false;
      let canonicalVerification = null;
      if (receipt) {
        try {
          canonicalVerification = verifyCanonicalAgainstReceipt(units, receipt.receipt, {
            expectedBuildMarker: receipt.receipt.buildMarker,
            repository: source.repository,
            requiredFiles: REQUIRED_EXTENSION_FILES,
            extensionVariant: ACCEPTED_EXTENSION_VARIANT,
          });
          canonicalVerified = canonicalVerification.ok === true;
        } catch (error) {
          canonicalVerification = Object.freeze({ ok: false, code: error?.code ?? null });
        }
      }
      // Hand the planner a chain whose head reflects the folded per-unit state,
      // so its restoring/restored/previous-absent logic sees the real picture.
      const foldedChain = Object.freeze({
        ...revalidated.chain,
        records: [
          ...revalidated.chain.records.slice(0, -1),
          {
            ...revalidated.chain.records[revalidated.chain.records.length - 1],
            record: { ...head, trees: foldedTrees },
          },
        ],
      });
      const plan = planP3cRecovery({
        chain: foldedChain,
        observations: { ...observations, canonicalVerified },
        receipt,
        expected: {
          repositoryRealpath: source.repository,
          authorizedWorktreeRealpath: source.repository,
        },
      });
      if (hooks.afterPlan) hooks.afterPlan(plan);

      const base = Object.freeze({
        ok: true, mode: "recover", activationId,
        transactionDirectory: directory,
        transactionHeadSha256: revalidated.chain.headSha256,
        transactionState: head.transactionState,
        classification: plan.classification,
        receiptPresent: Boolean(receipt),
        receiptVerified: Boolean(receipt),
        activationReceiptPath: receipt?.path ?? null,
        activationReceiptSha256: receipt?.sha256 ?? null,
        canonicalVerified,
        canonicalVerification,
        units: Object.fromEntries(units.map((unit) => [unit.logicalName, observations[unit.logicalName]])),
        activationReceiptCreated: false,
        reloadPerformed: false, canaryPerformed: false, pushPerformed: false,
        networkActionPerformed: false, browserActionPerformed: false,
        pruningPerformed: false,
      });

      // Fail-closed classifications: no mutation, all evidence preserved.
      if (["preserve-foreign-live-and-require-operator", "recovery-required"].includes(plan.classification)) {
        return Object.freeze({
          ...base, ok: false, acceptedRecordAppended: false, reversalCompleted: false,
          operatorActionRequired: true, mutationPerformed: false, evidencePreserved: true,
          code: plan.code ?? "recovery-required",
        });
      }
      if (["no-transaction", "contradictory-transaction", "foreign-or-unowned-transaction"]
        .includes(plan.classification)) {
        fail(plan.code ?? plan.classification, "Recovery cannot proceed from this transaction evidence.", {
          classification: plan.classification,
        });
      }

      // The single forward-completion case: already proven accepted and verified.
      if (plan.classification === "complete-terminal-accepted-record") {
        if (plan.alreadyTerminal === true) {
          return Object.freeze({
            ...base, acceptedRecordAppended: false, reversalCompleted: false,
            operatorActionRequired: false, mutationPerformed: false, alreadyTerminal: true,
            acceptedRelease: true,
          });
        }
        if (!receipt || !canonicalVerified) {
          fail("recovery-forward-completion-unproven",
            "Forward completion requires a durable receipt and verified canonical payload.");
        }
        guards.verifyLock();
        guards.verifyLease();
        // Derive the terminal sequence from a fresh chain read, never a stale one.
        const current = readTransactionChain(directory);
        const accepted = appendAcceptedRecord({
          directory,
          baseRecord: recoveryBaseRecord(head, lock.ownerId),
          sequence: current.records.length + 1,
          previousRecordSha256: current.headSha256,
          ownerId: lock.ownerId,
          receipt: { path: receipt.path, sha256: receipt.sha256 },
          trees: foldedTrees.map((tree) => ({ ...tree, state: "accepted" })),
        });
        return Object.freeze({
          ...base, acceptedRecordAppended: true, terminalRecordPath: accepted.path,
          reversalCompleted: false, operatorActionRequired: false,
          mutationPerformed: true, livePayloadMutationPerformed: false, acceptedRelease: true,
        });
      }

      // Everything else restores backward. Never synthesize a receipt.
      const changed = reconstructChangedUnits(units, treeStates, observations);
      if (changed.length === 0) {
        return Object.freeze({
          ...base, acceptedRecordAppended: false, reversalCompleted: true,
          operatorActionRequired: false, mutationPerformed: false,
          nothingToRestore: true,
        });
      }
      const current = readTransactionChain(directory);
      const reversal = reverseRelease({
        changed, activationId, directory,
        baseRecord: recoveryBaseRecord(head, lock.ownerId),
        ownerId: lock.ownerId, guards,
        sequence: current.records.length + 1,
        previousRecordSha256: current.headSha256,
        hooks,
      });
      return Object.freeze({
        ...base,
        ok: reversal.reversed === true,
        acceptedRecordAppended: false,
        reversalCompleted: reversal.reversed === true,
        reversalClassification: reversal.classification,
        restored: reversal.restored,
        operatorActionRequired: reversal.reversed !== true,
        mutationPerformed: true,
        livePayloadMutationPerformed: true,
        evidencePreserved: true,
        code: reversal.code ?? null,
      });
    }));
}

/** The journal base record recovery continues from, re-owned by this lock. */
function recoveryBaseRecord(head, lockOwnerId) {
  return {
    activationId: head.activationId, sequence: 1, previousRecordSha256: null,
    createdAt: head.createdAt,
    intentPath: head.intentPath, intentSha256: head.intentSha256,
    stageReceiptPath: head.stageReceiptPath, stageReceiptSha256: head.stageReceiptSha256,
    repositoryRealpath: head.repositoryRealpath,
    authorizedWorktreeRealpath: head.authorizedWorktreeRealpath,
    branch: head.branch, approvedHead: head.approvedHead, sourceTree: head.sourceTree,
    stableGitIdentity: head.stableGitIdentity,
    acceptedExtensionVariant: head.acceptedExtensionVariant,
    buildMarker: head.buildMarker,
    owner: { ownerId: lockOwnerId, pid: process.pid },
    transactionState: head.transactionState,
    trees: (head.trees ?? []).map((tree) => ({ ...tree })),
  };
}

export async function runLeanActivator({ argv = process.argv.slice(2), environment = process.env } = {}) {
  if (argv.length === 4 && argv[0] === "--activate-receipt" && argv[2] === "--activation-intent") {
    return activateReceipt(argv[1], argv[3], { environment });
  }
  if (argv.length === 2 && argv[0] === "--activate-receipt") {
    fail("activation-intent-required",
      "Activation requires explicit stage-receipt and activation-intent evidence.");
  }
  // P3C-B1: recovery resolves an activation IDENTITY only, never a path.
  if (argv.length === 2 && argv[0] === "--recover") {
    return recoverActivation(argv[1], { environment });
  }
  if (argv.length >= 1 && ["--rollback", "--recover", "--prune"].includes(argv[0])) {
    fail("mutation-command-not-implemented", "Rollback and pruning remain intentionally absent.");
  }
  if (argv.length === 3 && argv[0] === "--verify-canonical" && argv[1] === "--activation-receipt") {
    return verifyCanonicalFromReceipt(argv[2], { environment });
  }
  if (argv.length >= 1 && argv[0] === "--verify-canonical") {
    fail("canonical-verification-fixture-only", "Canonical comparison requires the explicit --activation-receipt form.");
  }
  if (argv.length === 2 && argv[0] === "--prepare-activation-intent") {
    return prepareActivationIntent(argv[1], { environment });
  }
  if (argv.length === 2 && argv[0] === "--inspect-activation-intent") {
    return inspectActivationIntent(argv[1], { environment });
  }
  if (argv.length === 2 && argv[0] === "--verify-stage-receipt") {
    // The one approved read-only exception: standalone verification performs no
    // mutation, so an explicit-worktree receipt may be verified on a dirty canonical.
    return verifyStageReceipt(argv[1], { environment, requireCanonicalClean: false });
  }
  fail("invalid-arguments", "P2 accepts only stage verification or activation-intent prepare/inspect commands.", { argv });
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
