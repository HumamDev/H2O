#!/usr/bin/env node
// Lean payload transaction — Batch 2 P3A.
//
// This module owns the production canonical-root pin, the append-only activation
// transaction journal, manifest-driven preparation of activation-specific incoming
// payload trees, the previous-state capture model, and a pure recovery planner.
//
// P3B adds recoverable canonical promotion and whole-release reversal. Live
// mutation is confined to one rename helper operating on internally derived
// operands under re-proved publisher-lock and canonical-lease ownership. The
// promotion interval between the two renames is real and is handled by
// fail-closed detection plus reversal, not removed. This module never publishes
// an activation or rollback receipt, never claims acceptance, and remains
// unreachable from every production CLI: no production entry point imports it.
//
// It imports only Node builtins. It never imports the activator, the publisher, or
// canonical-delivery-lib, so no lease, recursive-deletion, or promotion primitive
// can reach production activation through this module.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PAYLOAD_TRANSACTION_PHASE = "p3a";

// Production authority. A relocated standalone copy is self-consistent under the
// P2.3 module-relative pin; these allow-lists are what reject it.
export const APPROVED_COCKPIT_PRO_ROOTS = Object.freeze([
  "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro",
]);
export const APPROVED_AUTHORITATIVE_REPOSITORIES = Object.freeze([
  "/Users/hobayda/H2OCode/repos/h2o-platforms/cockpit-pro/h2o-cp-source",
]);
export const CANONICAL_ANCHOR_BASENAME = ".h2o-canonical-delivery";
export const ACCEPTED_EXTENSION_VARIANT = "dev-controls-oauth-google";

export const TRANSACTION_SCHEMA_VERSION = 1;
export const TRANSACTION_MODE = "activation-transaction";
export const TRANSACTION_SUBPATH = "transactions";
export const TRANSACTION_RECORD_PATTERN = /^seq-(\d{6})\.json$/u;
export const ACTIVATION_ID_PATTERN = /^\d{8}T\d{9}Z-[a-f0-9]{12}$/u;
export const OWNER_ID_PATTERN = /^[a-f0-9-]{8,64}$/u;

// P3A production helpers may only ever write these three states. Every remaining
// state is declared so the vocabulary is stable across phases, but writing one
// from P3A is rejected by assertP3aWritableState.
export const P3A_TRANSACTION_STATES = Object.freeze([
  "untouched",
  "incoming-preparing",
  "incoming-prepared",
]);
export const DEFERRED_TRANSACTION_STATES = Object.freeze([
  "live-retiring",
  "live-retired",
  "incoming-promoting",
  "incoming-promoted",
  "verified",
  "restoring",
  "restored",
  "accepted",
]);
export const TRANSACTION_STATES = Object.freeze([
  ...P3A_TRANSACTION_STATES,
  ...DEFERRED_TRANSACTION_STATES,
]);

export const RECOVERY_OUTCOMES = Object.freeze([
  "no-transaction",
  "incoming-preparation-not-started",
  "remove-own-partial-incoming",
  "preserve-verified-incoming",
  "incoming-preparation-ambiguous",
  "p3b-recovery-required",
  "contradictory-transaction",
  "foreign-or-unowned-transaction",
]);

// Documented margin: staged output for one release is small relative to a
// developer volume, but a promotion that exhausts the filesystem mid-copy is the
// one preparation failure with no cheap recovery. 256 MiB of headroom is required
// on top of the exact manifest byte total.
export const DISK_SAFETY_MARGIN_BYTES = 256 * 1024 * 1024;

// Logical unit -> receipt manifest family. Live paths are derived internally from
// the pinned repository root; a caller-supplied live or incoming path is never
// trusted anywhere in this module.
export const CANONICAL_UNITS = Object.freeze([
  Object.freeze({ logicalName: "alias", family: "alias", segments: Object.freeze(["apps", "dev-server", "alias"]) }),
  Object.freeze({ logicalName: "dev_output", family: "devOutput", segments: Object.freeze(["apps", "dev-server", "dev_output"]) }),
  Object.freeze({ logicalName: "extension", family: "extension", segments: null }),
]);

export class PayloadTransactionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PayloadTransactionError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new PayloadTransactionError(code, message, details);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function sha256File(filename) {
  return sha256Bytes(fs.readFileSync(filename));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Normalize an existing path to its native realpath; for an absent path, resolve
 * the nearest existing ancestor and re-append the absent suffix. Expected and
 * observed paths must both pass through here so /var and /private/var spellings
 * compare equal.
 */
export function normalizedPath(target) {
  if (!nonEmptyString(target)) fail("path-invalid", "A path must be a non-empty string.", { target });
  let cursor = path.resolve(target);
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

export function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Reject a symlinked authority entry.
 *
 * The entry itself is what must not be a link: a caller that supplies
 * `<parent>/linked-repository -> <parent>/repository` is redirecting authority
 * and is refused. Ancestors are deliberately not walked, because on macOS every
 * path under the system temporary directory legitimately descends through the
 * `/var -> private/var` link; walking ancestors would reject every fixture while
 * proving nothing about the entry under audit.
 */
export function assertNotSymlinkedEntry(target) {
  const resolved = path.resolve(target);
  let stat;
  try {
    stat = fs.lstatSync(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    fail("authority-component-unreadable", "Authority path component could not be inspected.", { target: resolved });
  }
  if (stat.isSymbolicLink()) {
    fail("authority-component-symlink", "Authority paths must not be symlinked entries.", { target: resolved });
  }
  return true;
}

/**
 * The production canonical-root pin. P2.3 proves that module location, executable
 * Git, and deriveSharedAnchor agree with one another; that is a self-relative
 * consistency check which a relocated standalone copy satisfies. This adds the
 * missing absolute identity: the agreed authority must also be an approved
 * production location.
 *
 * Fixture roots are supplied only through the explicit approvedRepositories and
 * approvedCockpitProRoots parameters. No environment value, receipt field, or CLI
 * argument reaches them.
 */
export function assertApprovedCanonicalRoot({
  repository,
  cockpitProRoot,
  anchorRoot,
  executableRepository,
  approvedRepositories = APPROVED_AUTHORITATIVE_REPOSITORIES,
  approvedCockpitProRoots = APPROVED_COCKPIT_PRO_ROOTS,
} = {}) {
  for (const [name, value] of Object.entries({ repository, cockpitProRoot, anchorRoot, executableRepository })) {
    if (!nonEmptyString(value) || !path.isAbsolute(value)) {
      fail("canonical-root-input-invalid", "Canonical authority inputs must be absolute paths.", { name });
    }
  }
  if (!Array.isArray(approvedRepositories) || approvedRepositories.length === 0 ||
      !Array.isArray(approvedCockpitProRoots) || approvedCockpitProRoots.length === 0) {
    fail("canonical-root-allow-list-invalid", "Approved root allow-lists must be non-empty arrays.");
  }
  assertNotSymlinkedEntry(repository);
  assertNotSymlinkedEntry(cockpitProRoot);
  assertNotSymlinkedEntry(anchorRoot);

  const normalizedRepository = normalizedPath(repository);
  const normalizedCockpitProRoot = normalizedPath(cockpitProRoot);
  const normalizedAnchor = normalizedPath(anchorRoot);
  const normalizedExecutable = normalizedPath(executableRepository);

  if (normalizedExecutable !== normalizedRepository) {
    fail("canonical-root-git-mismatch", "Executable Git authority does not match the module repository.", {
      expected: normalizedRepository,
      observed: normalizedExecutable,
    });
  }
  if (path.dirname(normalizedRepository) !== normalizedCockpitProRoot) {
    fail("canonical-root-parent-mismatch", "Cockpit Pro root is not the parent of the authoritative repository.", {
      repository: normalizedRepository,
      cockpitProRoot: normalizedCockpitProRoot,
    });
  }
  if (normalizedAnchor !== path.join(normalizedCockpitProRoot, CANONICAL_ANCHOR_BASENAME)) {
    fail("canonical-root-anchor-mismatch", "Canonical anchor is not the derived external default.", {
      expected: path.join(normalizedCockpitProRoot, CANONICAL_ANCHOR_BASENAME),
      observed: normalizedAnchor,
    });
  }
  if (!approvedRepositories.map((entry) => normalizedPath(entry)).includes(normalizedRepository)) {
    fail("canonical-root-not-approved", "Authoritative repository is not an approved production location.", {
      observed: normalizedRepository,
    });
  }
  if (!approvedCockpitProRoots.map((entry) => normalizedPath(entry)).includes(normalizedCockpitProRoot)) {
    fail("canonical-root-not-approved", "Cockpit Pro root is not an approved production location.", {
      observed: normalizedCockpitProRoot,
    });
  }
  return Object.freeze({
    repository: normalizedRepository,
    cockpitProRoot: normalizedCockpitProRoot,
    anchorRoot: normalizedAnchor,
    approved: true,
  });
}

export function validateActivationId(activationId) {
  if (!nonEmptyString(activationId) || !ACTIVATION_ID_PATTERN.test(activationId)) {
    fail("activation-id-invalid", "Activation id does not match the accepted pattern.", { activationId });
  }
  return activationId;
}

function assertSafeSegment(value, code) {
  if (!nonEmptyString(value) || value.includes(path.sep) || value.includes("/") ||
      value === "." || value === ".." || value.includes("\0")) {
    fail(code, "Path segment is not a single safe name.", { value });
  }
  return value;
}

/**
 * Derive the three canonical units internally. Live, incoming, and retired names
 * are computed from the pinned repository root and the activation id; no caller
 * value contributes a path. The retired name is recorded for later phases; P3A
 * never creates it.
 */
export function canonicalUnitPaths(repository, activationId, {
  extensionVariant = ACCEPTED_EXTENSION_VARIANT,
} = {}) {
  if (!nonEmptyString(repository) || !path.isAbsolute(repository)) {
    fail("repository-invalid", "Repository root must be an absolute path.", { repository });
  }
  validateActivationId(activationId);
  if (extensionVariant !== ACCEPTED_EXTENSION_VARIANT) {
    fail("extension-variant-not-accepted", "Extension variant differs from the independently pinned variant.", {
      expected: ACCEPTED_EXTENSION_VARIANT,
      observed: extensionVariant,
    });
  }
  assertSafeSegment(extensionVariant, "extension-variant-not-accepted");
  return Object.freeze(CANONICAL_UNITS.map((unit) => {
    const livePath = unit.segments
      ? path.join(repository, ...unit.segments)
      : path.join(repository, "apps", "extensions", "chatgpt", "chrome", extensionVariant);
    const base = path.basename(livePath);
    const parent = path.dirname(livePath);
    return Object.freeze({
      logicalName: unit.logicalName,
      family: unit.family,
      livePath,
      parent,
      incomingPath: path.join(parent, `${base}.staging-act-${activationId}`),
      retiredPath: path.join(parent, `${base}.retired-act-${activationId}`),
    });
  }));
}

/**
 * Staging-sibling ownership only. Staging and retired siblings are deliberately
 * NOT interchangeable: treating them as one family would let a cleanup path reach
 * a retired payload, which must never be removed during an activation run. The
 * retired family has its own separate check in assertRetiredPathOwned.
 */
export function ownsIncomingSibling(candidate, liveBasename, activationId) {
  validateActivationId(activationId);
  return path.basename(candidate) === `${liveBasename}.staging-act-${activationId}`;
}

/* ------------------------------------------------------------------------- *
 * Append-only transaction journal
 * ------------------------------------------------------------------------- */

export function transactionDirectory(anchorRoot, activationId) {
  validateActivationId(activationId);
  if (!nonEmptyString(anchorRoot) || !path.isAbsolute(anchorRoot)) {
    fail("transaction-root-invalid", "Anchor root must be an absolute path.", { anchorRoot });
  }
  return path.join(path.resolve(anchorRoot), TRANSACTION_SUBPATH, activationId);
}

export function sequenceBasename(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999_999) {
    fail("transaction-sequence-invalid", "Transaction sequence must be an integer between 1 and 999999.", { sequence });
  }
  return `seq-${String(sequence).padStart(6, "0")}.json`;
}

function assertRealDirectoryOrAbsent(directory) {
  try {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink()) {
      fail("transaction-directory-symlink", "Transaction directory must not be a symlink.", { directory });
    }
    if (!stat.isDirectory()) {
      fail("transaction-directory-invalid", "Transaction path must be a real directory.", { directory });
    }
    return "present";
  } catch (error) {
    if (error instanceof PayloadTransactionError) throw error;
    if (error?.code === "ENOENT") return "absent";
    fail("transaction-directory-invalid", "Transaction directory metadata could not be verified.", { directory });
  }
}

export function flushDirectory(directory) {
  let descriptor = null;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
    return Object.freeze({ attempted: true, succeeded: true, unsupported: false });
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR"].includes(error?.code)) {
      fail("directory-fsync-failed", "Transaction directory fsync failed.", { directory, code: error?.code ?? null });
    }
    return Object.freeze({ attempted: true, succeeded: false, unsupported: true, code: error.code });
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
  }
}

export function ensureTransactionDirectory(anchorRoot, activationId) {
  const directory = transactionDirectory(anchorRoot, activationId);
  const parents = [path.resolve(anchorRoot), path.join(path.resolve(anchorRoot), TRANSACTION_SUBPATH), directory];
  const created = [];
  for (const candidate of parents) {
    if (assertRealDirectoryOrAbsent(candidate) === "absent") {
      try {
        fs.mkdirSync(candidate, { mode: 0o700 });
        created.push(candidate);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      assertRealDirectoryOrAbsent(candidate);
    }
    const mode = fs.statSync(candidate).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      fail("transaction-directory-invalid", "Transaction directories must remain owner-only.", {
        directory: candidate,
        mode: mode.toString(8),
      });
    }
  }
  const parentFlush = created.length ? flushDirectory(path.dirname(directory)) : null;
  return Object.freeze({ directory, created: Object.freeze(created), parentFlush });
}

function removeOwnTemp(tempPath, directory, expectedBasename, owned) {
  if (!owned) return false;
  if (path.dirname(tempPath) !== path.resolve(directory) || path.basename(tempPath) !== expectedBasename) {
    return false;
  }
  try {
    const stat = fs.lstatSync(tempPath);
    if (!stat.isSymbolicLink() && stat.isFile()) {
      fs.unlinkSync(tempPath);
      return true;
    }
  } catch {
    // Removing this invocation's exact temporary file must not mask the cause.
  }
  return false;
}

/**
 * Durable, append-only record publication. Identical in shape to the accepted P2.1
 * intent writer: exclusive temp, fsync, no-replace hard link, owned-temp unlink,
 * directory fsync, byte read-back, digest verification. A duplicate sequence
 * collides on link(2) and is refused, so one activation can never overwrite
 * another activation's state.
 */
export function publishTransactionRecord(directory, record, { ownerId } = {}) {
  assertRealDirectoryOrAbsent(directory);
  if (!plainObject(record)) fail("transaction-record-invalid", "Transaction record must be an object.");
  const basename = sequenceBasename(record.sequence);
  const finalPath = path.join(path.resolve(directory), basename);
  const safeOwner = nonEmptyString(ownerId) && OWNER_ID_PATTERN.test(ownerId) ? ownerId : crypto.randomUUID();
  const tempBasename = `.${basename}.tmp-${safeOwner}`;
  const tempPath = path.join(path.resolve(directory), tempBasename);
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  let descriptor = null;
  let tempOwned = false;
  try {
    try {
      fs.lstatSync(finalPath);
      fail("transaction-sequence-collision", "Transaction sequence already exists; sequences are never reused.", {
        finalPath,
      });
    } catch (error) {
      if (error instanceof PayloadTransactionError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      descriptor = fs.openSync(tempPath, "wx", 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") {
        fail("transaction-temp-collision", "An invocation-owned transaction temporary already exists.", { tempPath });
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
        fail("transaction-sequence-collision", "Transaction sequence appeared before publication; refusing overwrite.", {
          finalPath,
        });
      }
      fail("transaction-link-failed", "Filesystem could not publish the record through no-replace hard linking.", {
        finalPath,
        code: error?.code ?? null,
      });
    }
    fs.unlinkSync(tempPath);
    tempOwned = false;
    const directoryFsync = flushDirectory(directory);
    const observed = fs.readFileSync(finalPath);
    if (!observed.equals(bytes)) {
      fail("transaction-final-verification", "Durable transaction bytes differ after publication.", { finalPath });
    }
    return Object.freeze({
      path: finalPath,
      sequence: record.sequence,
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
      try { fs.closeSync(descriptor); } catch { /* the original cause must survive */ }
    }
    removeOwnTemp(tempPath, directory, tempBasename, tempOwned);
    throw error;
  }
}

export function assertP3aWritableState(state) {
  if (!P3A_TRANSACTION_STATES.includes(state)) {
    fail("transaction-state-not-p3a", "P3A production helpers may not write this transaction state.", { state });
  }
  return state;
}

const TRANSACTION_REQUIRED_KEYS = Object.freeze([
  "schemaVersion", "mode", "activationId", "sequence", "previousRecordSha256",
  "intentPath", "intentSha256", "stageReceiptPath", "stageReceiptSha256",
  "repositoryRealpath", "authorizedWorktreeRealpath", "branch", "approvedHead",
  "sourceTree", "stableGitIdentity", "acceptedExtensionVariant", "buildMarker",
  "owner", "transactionState", "trees", "durability",
]);

export function buildTransactionRecord(input) {
  if (!plainObject(input)) fail("transaction-record-invalid", "Transaction record input must be an object.");
  const {
    activationId, sequence, previousRecordSha256, intentPath, intentSha256,
    stageReceiptPath, stageReceiptSha256, repositoryRealpath, authorizedWorktreeRealpath,
    branch, approvedHead, sourceTree, stableGitIdentity, acceptedExtensionVariant,
    buildMarker, owner, transactionState, trees, createdAt,
  } = input;
  validateActivationId(activationId);
  sequenceBasename(sequence);
  if (input.allowP3cStates === true) {
    if (!P3C_TRANSACTION_STATES.includes(transactionState)) assertP3bWritableState(transactionState);
  } else if (input.allowP3bStates === true) assertP3bWritableState(transactionState);
  else assertP3aWritableState(transactionState);
  if (sequence === 1) {
    if (previousRecordSha256 !== null) {
      fail("transaction-chain-invalid", "The first transaction record must carry a null previous digest.");
    }
  } else if (!nonEmptyString(previousRecordSha256) || !/^[a-f0-9]{64}$/u.test(previousRecordSha256)) {
    fail("transaction-chain-invalid", "Every record after the first must carry the previous record digest.");
  }
  for (const [name, value] of Object.entries({
    intentPath, intentSha256, stageReceiptPath, stageReceiptSha256, repositoryRealpath,
    authorizedWorktreeRealpath, branch, approvedHead, sourceTree, buildMarker, createdAt,
  })) {
    if (!nonEmptyString(value)) fail("transaction-record-invalid", `Field ${name} must be a non-empty string.`, { name });
  }
  if (acceptedExtensionVariant !== ACCEPTED_EXTENSION_VARIANT) {
    fail("extension-variant-not-accepted", "Transaction records pin the accepted extension variant.", {
      observed: acceptedExtensionVariant,
    });
  }
  if (!plainObject(stableGitIdentity) ||
      !["path", "realpath", "version", "sha256"].every((key) => nonEmptyString(stableGitIdentity[key])) ||
      ["device", "inode", "size", "mtimeMs"].some((key) => Object.hasOwn(stableGitIdentity, key))) {
    fail("transaction-git-identity-invalid",
      "Transaction records carry only the stable Git identity, never process-local metadata.");
  }
  if (!plainObject(owner) || !nonEmptyString(owner.ownerId) || !Number.isSafeInteger(owner.pid)) {
    fail("transaction-owner-invalid", "Transaction records must carry owner evidence.");
  }
  if (!Array.isArray(trees) || trees.length !== 3 ||
      !sameJson(trees.map((tree) => tree?.logicalName).slice().sort(),
        ["alias", "dev_output", "extension"])) {
    fail("transaction-tree-records-invalid", "A transaction record carries exactly the three canonical units.");
  }
  for (const tree of trees) {
    if (!plainObject(tree) || !TRANSACTION_STATES.includes(tree.state) ||
        !nonEmptyString(tree.livePath) || !nonEmptyString(tree.incomingPath) ||
        !nonEmptyString(tree.retiredPath)) {
      fail("transaction-tree-records-invalid", "Each tree record needs a known state and derived paths.");
    }
    if (input.allowP3cStates === true) {
      // Terminal P3C tree states are permitted only through finalization helpers.
    } else if (input.allowP3bStates === true) {
      if (P3C_RESERVED_STATES.includes(tree.state)) {
        fail("transaction-state-reserved-for-p3c", "Acceptance belongs to P3C.", { state: tree.state });
      }
    } else if (DEFERRED_TRANSACTION_STATES.includes(tree.state)) {
      fail("transaction-state-not-p3a", "P3A may not record a live-mutation or promotion tree state.", {
        state: tree.state,
      });
    }
  }
  const record = {
    schemaVersion: TRANSACTION_SCHEMA_VERSION,
    mode: TRANSACTION_MODE,
    phase: PAYLOAD_TRANSACTION_PHASE,
    activationId,
    sequence,
    createdAt,
    previousRecordSha256,
    intentPath,
    intentSha256,
    stageReceiptPath,
    stageReceiptSha256,
    repositoryRealpath,
    authorizedWorktreeRealpath,
    branch,
    approvedHead,
    sourceTree,
    stableGitIdentity,
    acceptedExtensionVariant,
    buildMarker,
    owner,
    transactionState,
    trees,
    livePayloadMutationPerformed: false,
    retiredSiblingCreated: false,
    promotionPerformed: false,
    activationPerformed: false,
    finalActivationReceiptDurable: false,
    reloadPerformed: false,
    canaryPerformed: false,
    pushPerformed: false,
    durability: {
      fileFsync: { attempted: true, succeeded: true },
      directoryFsync: {
        attempted: true,
        succeeded: null,
        unsupported: null,
        actualOutcomeReturnedByPublication: true,
      },
      processCrashAtomicity: true,
      powerLossDurabilityGuaranteed: false,
    },
  };
  for (const key of TRANSACTION_REQUIRED_KEYS) {
    if (!Object.hasOwn(record, key)) fail("transaction-record-invalid", `Record is missing ${key}.`, { key });
  }
  return record;
}

/**
 * Read the append-only chain. Contiguity and the digest chain are both verified;
 * a gap, a duplicate, or a broken link fails closed rather than being repaired.
 */
export function readTransactionChain(directory) {
  if (assertRealDirectoryOrAbsent(directory) === "absent") {
    return Object.freeze({ present: false, records: Object.freeze([]) });
  }
  const names = fs.readdirSync(directory).filter((name) => TRANSACTION_RECORD_PATTERN.test(name)).sort();
  const records = [];
  let previousSha256 = null;
  for (const [index, name] of names.entries()) {
    const filename = path.join(directory, name);
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      fail("transaction-record-not-regular", "Transaction records must be regular files.", { filename });
    }
    const bytes = fs.readFileSync(filename);
    let parsed;
    try {
      parsed = JSON.parse(bytes.toString("utf8"));
    } catch {
      fail("transaction-record-unparsable", "Transaction record is not valid JSON.", { filename });
    }
    const expectedSequence = index + 1;
    if (parsed?.sequence !== expectedSequence || name !== sequenceBasename(expectedSequence)) {
      fail("transaction-sequence-gap", "Transaction records must form a contiguous sequence from one.", {
        filename,
        expectedSequence,
        observed: parsed?.sequence ?? null,
      });
    }
    if (parsed?.previousRecordSha256 !== previousSha256) {
      fail("transaction-chain-broken", "Transaction record does not chain to its predecessor.", {
        filename,
        expected: previousSha256,
        observed: parsed?.previousRecordSha256 ?? null,
      });
    }
    previousSha256 = sha256Bytes(bytes);
    records.push(Object.freeze({ path: filename, sequence: expectedSequence, sha256: previousSha256, record: parsed }));
  }
  return Object.freeze({
    present: true,
    records: Object.freeze(records),
    headSha256: previousSha256,
    head: records.length ? records[records.length - 1].record : null,
  });
}

/* ------------------------------------------------------------------------- *
 * Incoming payload preparation
 * ------------------------------------------------------------------------- */

function manifestEntriesForFamily(verification, unit) {
  const manifest = verification?.stage?.manifests?.[unit.family];
  if (!plainObject(manifest) || !Array.isArray(manifest.entries)) {
    fail("staged-manifest-missing", "Verified stage manifest is missing for a canonical unit.", {
      family: unit.family,
    });
  }
  return manifest;
}

export function requiredDiskBytes(verification) {
  let total = 0;
  for (const unit of CANONICAL_UNITS) {
    for (const entry of manifestEntriesForFamily(verification, unit).entries) {
      if (entry.type === "file") total += Number(entry.bytes) || 0;
    }
  }
  return total;
}

/**
 * Disk preflight. Every canonical parent must be on one filesystem, because the
 * later promotion phase renames incoming siblings into their live names and a
 * cross-device parent would make that impossible.
 */
export function assertDiskPreflight(units, totalBytes, {
  statfs = fs.statfsSync,
  stat = fs.statSync,
  marginBytes = DISK_SAFETY_MARGIN_BYTES,
} = {}) {
  const required = totalBytes + marginBytes;
  const devices = new Set();
  const parents = [...new Set(units.map((unit) => unit.parent))];
  for (const parent of parents) {
    devices.add(String(stat(parent).dev));
    const info = statfs(parent);
    const available = Number(info.bavail) * Number(info.bsize);
    if (!Number.isFinite(available) || available < required) {
      fail("insufficient-disk-space", "Canonical parent does not have enough free space for incoming payload.", {
        parent,
        requiredBytes: required,
        availableBytes: Number.isFinite(available) ? available : null,
      });
    }
  }
  if (devices.size !== 1) {
    fail("canonical-parents-cross-device", "Canonical parents span more than one filesystem.", {
      devices: [...devices],
    });
  }
  return Object.freeze({ requiredBytes: required, totalBytes, marginBytes, device: [...devices][0] });
}

/**
 * Recompute the manifest of a completed incoming tree independently of the
 * publisher's implementation, then require exact equality with the verified
 * staged manifest. Paths are re-based onto the staged family root so the two
 * manifests are directly comparable.
 */
export function recomputeIncomingManifest(incomingRoot, familyRootRelative) {
  const entries = [];
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const filename = path.join(directory, name);
      const stat = fs.lstatSync(filename);
      const relative = path.relative(incomingRoot, filename).split(path.sep).join("/");
      const manifestPath = familyRootRelative ? `${familyRootRelative}/${relative}` : relative;
      if (stat.isSymbolicLink()) {
        entries.push({ path: manifestPath, type: "symlink", target: fs.readlinkSync(filename) });
        continue;
      }
      if (stat.isDirectory()) {
        walk(filename);
        continue;
      }
      if (!stat.isFile()) {
        fail("incoming-entry-type-unsupported", "Incoming trees permit only directories, regular files and symlinks.", {
          filename,
        });
      }
      entries.push({ path: manifestPath, type: "file", bytes: stat.size, sha256: sha256File(filename) });
    }
  };
  walk(incomingRoot);
  entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const treeDigest = sha256Bytes(entries.map((entry) => JSON.stringify(entry)).join("\n"));
  return Object.freeze({ fileCount: entries.length, treeDigest, entries });
}

/**
 * Invocation-ownership registry for incoming roots.
 *
 * A handle is minted only by a successful exclusive mkdir. It is an opaque frozen
 * object held in a module-private WeakSet, so a caller cannot forge one and a
 * caller-supplied path is never sufficient evidence of ownership. Cleanup takes
 * the handle, never a path.
 */
const OWNED_INCOMING_ROOTS = new WeakSet();

export function createOwnedIncomingRoot(unit, activationId) {
  validateActivationId(activationId);
  const liveBasename = path.basename(unit.livePath);
  const expectedName = `${liveBasename}.staging-act-${activationId}`;
  if (path.basename(unit.incomingPath) !== expectedName ||
      path.dirname(unit.incomingPath) !== unit.parent ||
      unit.incomingPath === unit.livePath) {
    fail("incoming-path-not-derived", "Incoming root is not the internally derived activation sibling.", {
      incomingPath: unit.incomingPath,
      expectedName,
    });
  }
  // The canonical parent is never created here: P3A prepares a sibling of the
  // live tree, it does not bring canonical structure into existence.
  let parentStat;
  try {
    parentStat = fs.lstatSync(unit.parent);
  } catch {
    fail("canonical-parent-absent", "Canonical parent directory does not exist.", { parent: unit.parent });
  }
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail("canonical-parent-invalid", "Canonical parent must be a real directory.", { parent: unit.parent });
  }
  try {
    // Exclusive: mkdir without recursive fails EEXIST on any pre-existing entry,
    // so a sibling this invocation did not create never yields a handle.
    fs.mkdirSync(unit.incomingPath, { mode: 0o755 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail("incoming-sibling-collision", "An incoming sibling already exists; it is never reused or adopted.", {
        incomingPath: unit.incomingPath,
      });
    }
    throw error;
  }
  const stat = fs.lstatSync(unit.incomingPath);
  const ownership = Object.freeze({
    activationId,
    logicalName: unit.logicalName,
    liveBasename,
    incomingPath: unit.incomingPath,
    parent: unit.parent,
    device: String(stat.dev),
    inode: String(stat.ino),
  });
  OWNED_INCOMING_ROOTS.add(ownership);
  return ownership;
}

function assertIncomingOwnership(ownership, { unit = null, activationId = null } = {}) {
  if (!plainObject(ownership) || !OWNED_INCOMING_ROOTS.has(ownership)) {
    fail("incoming-ownership-invalid", "Cleanup requires an unforged, still-valid invocation ownership handle.");
  }
  if (unit && (ownership.incomingPath !== unit.incomingPath || ownership.logicalName !== unit.logicalName)) {
    fail("incoming-ownership-invalid", "Ownership handle does not describe this canonical unit.", {
      logicalName: unit.logicalName,
    });
  }
  if (activationId && ownership.activationId !== activationId) {
    fail("incoming-ownership-invalid", "Ownership handle belongs to a different activation.", { activationId });
  }
  return ownership;
}

export function releaseIncomingOwnership(ownership) {
  if (!plainObject(ownership)) return false;
  return OWNED_INCOMING_ROOTS.delete(ownership);
}

/**
 * Remove only the incomplete incoming root this invocation exclusively created.
 *
 * Ownership is proved by the handle, not by the path. The staging name is
 * re-derived from the handle, so a retired sibling can never be a target, and
 * device/inode are re-checked so a replaced directory is refused.
 */
export function removeOwnedIncomingRoot(ownership) {
  assertIncomingOwnership(ownership);
  const expectedName = `${ownership.liveBasename}.staging-act-${ownership.activationId}`;
  if (path.basename(ownership.incomingPath) !== expectedName ||
      path.dirname(ownership.incomingPath) !== ownership.parent) {
    fail("incoming-cleanup-not-owned", "Refusing to remove a path outside the derived activation sibling.", {
      incomingPath: ownership.incomingPath,
    });
  }
  let stat;
  try {
    stat = fs.lstatSync(ownership.incomingPath);
  } catch {
    OWNED_INCOMING_ROOTS.delete(ownership);
    return false;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail("incoming-cleanup-not-owned", "Refusing to remove a symlinked or non-directory incoming entry.", {
      incomingPath: ownership.incomingPath,
    });
  }
  if (String(stat.dev) !== ownership.device || String(stat.ino) !== ownership.inode) {
    fail("incoming-cleanup-identity-drift", "Incoming root was replaced since this invocation created it.", {
      incomingPath: ownership.incomingPath,
    });
  }
  fs.rmSync(ownership.incomingPath, { recursive: true, force: false });
  OWNED_INCOMING_ROOTS.delete(ownership);
  return true;
}

const GENERATED_OUTPUT_SEGMENTS = Object.freeze([
  ["apps", "dev-server"],
  ["apps", "extensions"],
]);

/**
 * Apply the accepted Batch 1 alias policy to a resolved symlink target, then
 * derive where that target must live once the tree is relocated.
 *
 * The staged family root and the incoming family root sit at different
 * filesystem depths, so identical raw link text does not preserve meaning.
 * Authority is therefore the resolved target, never the text.
 */
function planSymlinkRelocation({ entry, source, destination, verification, unit, repository, familyRoot }) {
  const linkText = fs.readlinkSync(source);
  if (linkText !== entry.target) {
    fail("incoming-symlink-text-mismatch", "Staged symlink link text differs from the verified manifest.", {
      path: entry.path,
      expected: entry.target,
      observed: linkText,
    });
  }
  let stagedResolvedTarget;
  try {
    stagedResolvedTarget = fs.realpathSync.native(source);
  } catch {
    fail("staged-symlink-broken", "Staged symlink does not resolve.", { path: entry.path, linkText });
  }
  const normalizedRepository = normalizedPath(repository);
  const normalizedFamilyRoot = normalizedPath(familyRoot);
  const stagingRoot = normalizedPath(verification.stage.stagingRoot);

  const insideFamily = isWithin(normalizedFamilyRoot, stagedResolvedTarget);
  const insideRepository = isWithin(normalizedRepository, stagedResolvedTarget);
  if (!insideFamily && isWithin(stagingRoot, stagedResolvedTarget)) {
    fail("incoming-symlink-staging-leak", "Staged symlink resolves into the staging root outside its family.", {
      path: entry.path,
      linkText,
      stagedResolvedTarget,
    });
  }
  if (!insideFamily && !insideRepository) {
    fail("incoming-symlink-foreign-worktree", "Staged symlink resolves outside the approved source roots.", {
      path: entry.path,
      linkText,
      stagedResolvedTarget,
    });
  }
  if (insideRepository && !insideFamily) {
    for (const segments of GENERATED_OUTPUT_SEGMENTS) {
      if (isWithin(path.join(normalizedRepository, ...segments), stagedResolvedTarget)) {
        fail("incoming-symlink-generated-target", "Staged symlink resolves into a generated-output tree.", {
          path: entry.path,
          stagedResolvedTarget,
        });
      }
    }
  }

  // Intra-family targets travel with the tree; authoritative-source targets stay
  // exactly where they are.
  const intendedIncomingTarget = normalizedPath(insideFamily
    ? path.join(unit.incomingPath, path.relative(normalizedFamilyRoot, stagedResolvedTarget))
    : stagedResolvedTarget);
  // Both endpoints must be in the same (realpath) space, otherwise a /var vs
  // /private/var spelling difference would produce escaping link text.
  const incomingLinkText = path.relative(
    normalizedPath(path.dirname(destination)), intendedIncomingTarget);
  if (!incomingLinkText || path.isAbsolute(incomingLinkText)) {
    fail("incoming-symlink-unrepresentable", "Relocated symlink cannot be expressed relatively.", {
      path: entry.path,
      intendedIncomingTarget,
    });
  }
  return Object.freeze({
    manifestPath: entry.path,
    stagedLinkText: linkText,
    incomingLinkText,
    stagedResolvedTarget,
    intendedIncomingTarget,
  });
}

function verifyRelocatedSymlink(plan, destination) {
  let incomingResolvedTarget;
  try {
    incomingResolvedTarget = fs.realpathSync.native(destination);
  } catch {
    fail("incoming-symlink-broken", "Relocated symlink does not resolve.", {
      path: plan.manifestPath,
      incomingLinkText: plan.incomingLinkText,
    });
  }
  if (incomingResolvedTarget !== plan.intendedIncomingTarget) {
    fail("incoming-symlink-redirected", "Relocated symlink does not resolve to its intended target.", {
      path: plan.manifestPath,
      intendedIncomingTarget: plan.intendedIncomingTarget,
      incomingResolvedTarget,
    });
  }
  return Object.freeze({ ...plan, incomingResolvedTarget });
}

/**
 * The staged family root must live outside the canonical generated-output trees.
 * The accepted alias policy classifies a resolved target as generated output when
 * it falls inside apps/dev-server or apps/extensions; that classification is only
 * meaningful while the staging root itself is elsewhere. P3A relied on this
 * implicitly, so P3B asserts it.
 */
export function assertStagedFamilyTopology(familyRoot, repository) {
  const normalizedFamilyRoot = normalizedPath(familyRoot);
  const normalizedRepository = normalizedPath(repository);
  for (const segments of GENERATED_OUTPUT_SEGMENTS) {
    const generated = path.join(normalizedRepository, ...segments);
    if (isWithin(generated, normalizedFamilyRoot)) {
      fail("staged-family-topology-invalid",
        "Staged family root must not live inside a canonical generated-output tree.", {
          familyRoot: normalizedFamilyRoot,
          generated,
        });
    }
  }
  return true;
}

/**
 * Neither the staged manifest nor the recomputed incoming manifest can represent
 * an empty directory, so an empty staged directory would be silently dropped.
 * The accepted stage emits none; if one ever appears it must fail closed rather
 * than disappear.
 */
export function assertNoEmptyStagedDirectories(familyRoot, unit) {
  const walk = (directory) => {
    const names = fs.readdirSync(directory);
    if (names.length === 0) {
      fail("staged-empty-directory-unrepresentable",
        "Staged tree contains an empty directory that the manifest cannot represent.", {
          logicalName: unit?.logicalName ?? null,
          directory,
        });
    }
    for (const name of names) {
      const filename = path.join(directory, name);
      const stat = fs.lstatSync(filename);
      if (!stat.isSymbolicLink() && stat.isDirectory()) walk(filename);
    }
  };
  walk(familyRoot);
  return true;
}

/**
 * Prepare exactly one activation-specific incoming tree from the verified staged
 * manifest. The live path is never read, stat-ed, renamed or modified: only the
 * incoming sibling is written.
 *
 * Regular files are copied byte-for-byte. Symlinks are relocated by resolved
 * target and their link text is deterministically rewritten for the incoming
 * depth, so the expected incoming manifest is a transformation of the staged
 * manifest rather than a copy of it.
 */
export function prepareIncomingTree(verification, unit, { repository, ownership } = {}) {
  const manifest = manifestEntriesForFamily(verification, unit);
  const stagingRoot = verification.stage.stagingRoot;
  const familyRoot = verification.stage.outputPaths[unit.family];
  if (!nonEmptyString(familyRoot)) {
    fail("staged-output-path-missing", "Verified stage output path is missing for a canonical unit.", {
      family: unit.family,
    });
  }
  const familyRootRelative = path.relative(stagingRoot, familyRoot).split(path.sep).join("/");
  // P3B: the ownership handle is mandatory. There is no path-derived fallback, so
  // the orchestrated route is the only route that can create incoming payload.
  const owned = assertIncomingOwnership(ownership, { unit });
  assertStagedFamilyTopology(familyRoot, repository);
  assertNoEmptyStagedDirectories(familyRoot, unit);

  const seen = new Set();
  const entries = manifest.entries;
  for (const entry of entries) {
    if (entry.path !== familyRootRelative && !entry.path.startsWith(`${familyRootRelative}/`)) {
      fail("staged-manifest-family-mismatch", "Staged manifest contains entries outside its own family root.", {
        family: unit.family,
        path: entry.path,
      });
    }
  }

  const resolveDestination = (entry) => {
    if (seen.has(entry.path)) {
      fail("staged-manifest-duplicate-path", "Staged manifest contains a duplicate path.", { path: entry.path });
    }
    seen.add(entry.path);
    const relative = entry.path.slice(familyRootRelative.length + 1);
    if (!relative || relative.split("/").some((segment) => segment === "." || segment === ".." || segment === "")) {
      fail("staged-manifest-path-invalid", "Staged manifest path is not a safe relative path.", { path: entry.path });
    }
    const destination = path.join(unit.incomingPath, ...relative.split("/"));
    if (!isWithin(unit.incomingPath, destination)) {
      fail("staged-manifest-path-invalid", "Staged manifest path escapes the incoming tree.", { path: entry.path });
    }
    return { source: path.join(stagingRoot, entry.path), destination };
  };

  // Pass one: regular files. Symlink targets inside the family must already exist
  // before a relocated link can be resolved and verified.
  const symlinkWork = [];
  for (const entry of entries) {
    const { source, destination } = resolveDestination(entry);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    let sourceStat;
    try {
      sourceStat = fs.lstatSync(source);
    } catch {
      fail("staged-manifest-path-missing", "Staged manifest names a path that is absent from the staging root.", {
        path: entry.path,
      });
    }
    if (entry.type === "symlink") {
      if (!sourceStat.isSymbolicLink()) {
        fail("staged-entry-type-drift", "Staged manifest declares a symlink but the staged entry is not one.", {
          path: entry.path,
        });
      }
      symlinkWork.push({ entry, source, destination });
      continue;
    }
    if (entry.type !== "file") {
      fail("incoming-entry-type-unsupported", "Staged manifests permit only regular files and symlinks.", {
        path: entry.path,
        type: entry.type,
      });
    }
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      fail("staged-entry-type-drift", "Staged manifest declares a regular file but the staged entry is not one.", {
        path: entry.path,
      });
    }
    const bytes = fs.readFileSync(source);
    if (bytes.length !== entry.bytes) {
      fail("incoming-byte-size-mismatch", "Staged byte size changed between verification and copy.", {
        path: entry.path,
        expected: entry.bytes,
        observed: bytes.length,
      });
    }
    const digest = sha256Bytes(bytes);
    if (digest !== entry.sha256) {
      fail("incoming-digest-mismatch", "Staged byte content changed between verification and copy.", {
        path: entry.path,
        expected: entry.sha256,
        observed: digest,
      });
    }
    let descriptor = null;
    try {
      descriptor = fs.openSync(destination, "wx", 0o644);
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      if (descriptor !== null) fs.closeSync(descriptor);
    }
    fs.chmodSync(destination, 0o644);
    const readBack = fs.readFileSync(destination);
    if (readBack.length !== entry.bytes || sha256Bytes(readBack) !== entry.sha256) {
      fail("incoming-readback-mismatch", "Prepared incoming file does not match its verified manifest entry.", {
        path: entry.path,
      });
    }
  }

  // Pass two: relocate symlinks by resolved target.
  const translations = [];
  for (const work of symlinkWork) {
    const plan = planSymlinkRelocation({
      entry: work.entry,
      source: work.source,
      destination: work.destination,
      verification,
      unit,
      repository,
      familyRoot,
    });
    fs.symlinkSync(plan.incomingLinkText, work.destination);
    translations.push(verifyRelocatedSymlink(plan, work.destination));
  }

  // Deterministic directory modes, deepest first.
  const directories = [];
  const collect = (directory) => {
    for (const name of fs.readdirSync(directory)) {
      const filename = path.join(directory, name);
      const stat = fs.lstatSync(filename);
      if (!stat.isSymbolicLink() && stat.isDirectory()) {
        directories.push(filename);
        collect(filename);
      }
    }
  };
  collect(unit.incomingPath);
  for (const directory of directories.sort((a, b) => b.length - a.length)) fs.chmodSync(directory, 0o755);
  fs.chmodSync(unit.incomingPath, 0o755);

  const expected = expectedIncomingManifest(manifest, translations);
  const recomputed = recomputeIncomingManifest(unit.incomingPath, familyRootRelative);
  if (recomputed.fileCount !== expected.fileCount || recomputed.treeDigest !== expected.treeDigest ||
      !sameJson(recomputed.entries, expected.entries)) {
    fail("incoming-manifest-mismatch", "Recomputed incoming manifest differs from the transformed expected manifest.", {
      logicalName: unit.logicalName,
      expectedDigest: expected.treeDigest,
      observedDigest: recomputed.treeDigest,
    });
  }
  return Object.freeze({
    logicalName: unit.logicalName,
    incomingPath: unit.incomingPath,
    fileCount: recomputed.fileCount,
    treeDigest: recomputed.treeDigest,
    manifest: recomputed,
    expectedManifest: expected,
    symlinkTranslations: Object.freeze(translations),
    ownership: owned,
    // Binds this incoming identity to the exact stage that produced it. Canonical
    // verification must never compare a tree against a different stage run.
    stageReceiptPath: verification.receiptPath,
    stageReceiptSha256: verification.receiptSha256,
    // The promoted tree sits at the live name with no family prefix, so promotion
    // compares against this prefix-free identity of the same incoming bytes.
    promotionIdentity: recomputeIncomingManifest(unit.incomingPath, "").treeDigest,
  });
}

/**
 * The incoming manifest is a deterministic transformation of the staged manifest:
 * regular-file entries are byte-identical, and symlink entries carry the rewritten
 * incoming link text.
 */
export function expectedIncomingManifest(stagedManifest, translations) {
  const rewritten = new Map(translations.map((item) => [item.manifestPath, item.incomingLinkText]));
  const entries = stagedManifest.entries.map((entry) => {
    if (entry.type !== "symlink") return { ...entry };
    if (!rewritten.has(entry.path)) {
      fail("incoming-symlink-translation-missing", "A staged symlink was not relocated.", { path: entry.path });
    }
    return { ...entry, target: rewritten.get(entry.path) };
  }).sort((a, b) => a.path.localeCompare(b.path, "en"));
  const treeDigest = sha256Bytes(entries.map((entry) => JSON.stringify(entry)).join("\n"));
  return Object.freeze({ fileCount: entries.length, treeDigest, entries });
}

/* ------------------------------------------------------------------------- *
 * Previous-state capture model (schema and pure validation only in P3A)
 * ------------------------------------------------------------------------- */

export const PREVIOUS_STATE_VALUES = Object.freeze(["present", "absent"]);

export function buildPreviousStateRecord(observation) {
  if (!plainObject(observation)) fail("previous-state-invalid", "Previous-state observation must be an object.");
  const { logicalName, state, entryType, manifest, treeDigest, fileCount, buildMarker,
    filesystemIdentity, retiredPath, livePath } = observation;
  if (!["alias", "dev_output", "extension"].includes(logicalName)) {
    fail("previous-state-invalid", "Unknown canonical unit.", { logicalName });
  }
  if (!PREVIOUS_STATE_VALUES.includes(state)) {
    fail("previous-state-invalid", "Previous state must be present or absent.", { state });
  }
  if (state === "absent") {
    return Object.freeze({
      logicalName, state, entryType: null, manifest: null, treeDigest: null, fileCount: 0,
      buildMarker: null, filesystemIdentity: null, livePath, retiredPath,
      restorationMode: "remove-promoted-to-absent",
    });
  }
  if (entryType === "symlink") {
    fail("previous-state-symlinked-live", "A symlinked live canonical entry is not accepted.", { logicalName });
  }
  if (entryType !== "directory") {
    fail("previous-state-entry-unsupported", "Live canonical entries must be real directories.", {
      logicalName, entryType,
    });
  }
  if (!plainObject(manifest) || !Array.isArray(manifest.entries) ||
      !nonEmptyString(treeDigest) || !Number.isSafeInteger(fileCount)) {
    fail("previous-state-invalid", "A present previous state requires a manifest, digest and file count.", {
      logicalName,
    });
  }
  if (!plainObject(filesystemIdentity) || !nonEmptyString(String(filesystemIdentity.dev ?? "")) ||
      !nonEmptyString(String(filesystemIdentity.ino ?? ""))) {
    fail("previous-state-invalid", "A present previous state requires filesystem identity for recovery.", {
      logicalName,
    });
  }
  return Object.freeze({
    logicalName, state, entryType, manifest, treeDigest, fileCount,
    buildMarker: buildMarker ?? null, filesystemIdentity, livePath, retiredPath,
    restorationMode: "restore-previous",
  });
}

export function assertRetiredPathOwned(retiredPath, livePath, activationId) {
  validateActivationId(activationId);
  const expected = `${path.basename(livePath)}.retired-act-${activationId}`;
  if (path.basename(retiredPath) !== expected || path.dirname(retiredPath) !== path.dirname(livePath)) {
    fail("foreign-retired-sibling", "Retired sibling is not owned by this activation.", { retiredPath, expected });
  }
  return true;
}

/* ------------------------------------------------------------------------- *
 * Pure recovery planner — no fs, no Git, no mutation
 * ------------------------------------------------------------------------- */

function outcome(classification, code = null, details = {}) {
  return Object.freeze({ classification, code, ...details });
}

/**
 * Deterministic P3A recovery planning from an immutable intent, a verified
 * contiguous transaction chain, and caller-supplied filesystem observations.
 * Performs no I/O and never guesses forward.
 */
export function planRecovery({ intent, chain, observations, expected = {} } = {}) {
  if (!plainObject(intent) || !nonEmptyString(intent.activationId)) {
    return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
  }
  if (!plainObject(chain) || chain.present !== true || !Array.isArray(chain.records) || chain.records.length === 0) {
    return outcome("no-transaction");
  }
  for (const key of ["repositoryRealpath", "authorizedWorktreeRealpath"]) {
    if (expected[key] && intent[key] !== expected[key]) {
      return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
    }
  }
  const head = chain.records[chain.records.length - 1]?.record;
  if (!plainObject(head)) return outcome("contradictory-transaction", "contradictory-transaction");
  if (head.schemaVersion !== TRANSACTION_SCHEMA_VERSION || head.mode !== TRANSACTION_MODE) {
    return outcome("contradictory-transaction", "contradictory-transaction");
  }
  if (head.activationId !== intent.activationId) {
    return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
  }
  if (expected.intentSha256 && head.intentSha256 !== expected.intentSha256) {
    return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
  }
  if (expected.stableGitIdentity && !sameJson(head.stableGitIdentity, expected.stableGitIdentity)) {
    return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
  }
  for (const boundary of ["activationPerformed", "promotionPerformed", "livePayloadMutationPerformed",
    "retiredSiblingCreated", "finalActivationReceiptDurable", "reloadPerformed", "canaryPerformed", "pushPerformed"]) {
    if (head[boundary] !== false) return outcome("contradictory-transaction", "contradictory-transaction");
  }
  if (!Array.isArray(head.trees) || head.trees.length !== 3) {
    return outcome("contradictory-transaction", "contradictory-transaction");
  }
  // Any record in the chain that reached a live-mutation or promotion state is
  // outside P3A's competence; P3B owns it and P3A must not act.
  for (const entry of chain.records) {
    const states = [entry.record?.transactionState, ...(entry.record?.trees ?? []).map((tree) => tree?.state)];
    if (states.some((state) => DEFERRED_TRANSACTION_STATES.includes(state))) {
      return outcome("p3b-recovery-required", "p3b-recovery-required");
    }
  }
  if (!plainObject(observations)) {
    return outcome("incoming-preparation-ambiguous", "incoming-preparation-ambiguous");
  }

  const plans = [];
  for (const tree of head.trees) {
    const observed = observations[tree.logicalName];
    if (!plainObject(observed)) {
      return outcome("incoming-preparation-ambiguous", "incoming-preparation-ambiguous", {
        logicalName: tree.logicalName,
      });
    }
    if (observed.livePathMutated === true) {
      return outcome("p3b-recovery-required", "p3b-recovery-required", { logicalName: tree.logicalName });
    }
    if (observed.retiredSiblingPresent === true) {
      return outcome("p3b-recovery-required", "p3b-recovery-required", { logicalName: tree.logicalName });
    }
    if (tree.state === "untouched") {
      if (observed.incomingPresent === true) {
        return outcome("contradictory-transaction", "contradictory-transaction", { logicalName: tree.logicalName });
      }
      plans.push({ logicalName: tree.logicalName, action: "incoming-preparation-not-started" });
      continue;
    }
    if (tree.state === "incoming-preparing") {
      plans.push({
        logicalName: tree.logicalName,
        action: observed.incomingPresent === true ? "remove-own-partial-incoming" : "incoming-preparation-not-started",
      });
      continue;
    }
    if (tree.state === "incoming-prepared") {
      if (observed.incomingPresent !== true) {
        return outcome("incoming-preparation-ambiguous", "incoming-preparation-ambiguous", {
          logicalName: tree.logicalName,
        });
      }
      if (nonEmptyString(tree.incomingTreeDigest) && nonEmptyString(observed.incomingTreeDigest) &&
          tree.incomingTreeDigest !== observed.incomingTreeDigest) {
        return outcome("incoming-preparation-ambiguous", "incoming-preparation-ambiguous", {
          logicalName: tree.logicalName,
        });
      }
      plans.push({ logicalName: tree.logicalName, action: "preserve-verified-incoming" });
      continue;
    }
    return outcome("contradictory-transaction", "contradictory-transaction", { logicalName: tree.logicalName });
  }

  const actions = new Set(plans.map((plan) => plan.action));
  const classification = actions.has("remove-own-partial-incoming")
    ? "remove-own-partial-incoming"
    : actions.has("preserve-verified-incoming")
      ? "preserve-verified-incoming"
      : "incoming-preparation-not-started";
  return Object.freeze({
    classification,
    code: null,
    plans: Object.freeze(plans.map((plan) => Object.freeze(plan))),
    livePayloadMutationRequired: false,
  });
}

/**
 * Executable write-ahead orchestration for one canonical unit.
 *
 * Order is the contract: the incoming-preparing record is durable BEFORE the
 * incoming root exists, and the incoming-prepared record is durable only AFTER
 * the copy has been recomputed and verified. A crash at any boundary therefore
 * leaves journal and filesystem evidence that the pure planner can reconcile
 * without guessing.
 *
 * Failure cleans only the incoming root this invocation exclusively created,
 * through its ownership handle. Previously completed units are left intact, the
 * live path is never inspected or mutated, and no retired sibling is created.
 *
 * The hooks parameter exists solely so fixtures can interrupt at each boundary;
 * no production caller supplies it, and no production CLI reaches this function.
 */
export function prepareIncomingUnitWithJournal({
  verification,
  unit,
  activationId,
  transactionDirectory: directory,
  repository,
  ownerId,
  baseRecord,
  startSequence = 1,
  previousRecordSha256 = null,
  hooks = {},
} = {}) {
  validateActivationId(activationId);
  if (!plainObject(baseRecord) || !Array.isArray(baseRecord.trees)) {
    fail("transaction-record-invalid", "Orchestration requires a base transaction record.");
  }
  const treesWith = (state, extra = {}) => baseRecord.trees.map((tree) => (
    tree.logicalName === unit.logicalName ? { ...tree, state, ...extra } : { ...tree }));

  const preparingRecord = buildTransactionRecord({
    ...baseRecord,
    sequence: startSequence,
    previousRecordSha256,
    transactionState: "incoming-preparing",
    trees: treesWith("incoming-preparing"),
  });
  const preparingPublished = publishTransactionRecord(directory, preparingRecord, { ownerId });
  if (hooks.afterPreparingRecord) hooks.afterPreparingRecord(preparingPublished);

  let ownership = null;
  try {
    ownership = createOwnedIncomingRoot(unit, activationId);
    if (hooks.afterRootCreated) hooks.afterRootCreated(ownership);
    const prepared = prepareIncomingTree(verification, unit, { repository, ownership });
    if (hooks.afterCopy) hooks.afterCopy(prepared);
    const preparedRecord = buildTransactionRecord({
      ...baseRecord,
      sequence: startSequence + 1,
      previousRecordSha256: preparingPublished.sha256,
      transactionState: "incoming-prepared",
      trees: treesWith("incoming-prepared", {
        incomingTreeDigest: prepared.treeDigest,
        incomingFileCount: prepared.fileCount,
      }),
    });
    const preparedPublished = publishTransactionRecord(directory, preparedRecord, { ownerId });
    if (hooks.afterPreparedRecord) hooks.afterPreparedRecord(preparedPublished);
    releaseIncomingOwnership(ownership);
    return Object.freeze({
      logicalName: unit.logicalName,
      prepared,
      records: Object.freeze([preparingPublished, preparedPublished]),
      ownershipReleased: true,
      livePayloadMutationPerformed: false,
      retiredSiblingCreated: false,
    });
  } catch (error) {
    if (ownership) {
      try {
        removeOwnedIncomingRoot(ownership);
      } catch {
        // Cleanup must never mask the original preparation failure.
      }
    }
    throw error;
  }
}

/**
 * Pure P3B interrupted-state planner.
 *
 * `planRecovery` remains the P3A-competence planner and correctly defers any
 * promotion state with `p3b-recovery-required`. This is the P3B-competence
 * planner: it classifies every promotion boundary from a verified chain plus
 * caller-supplied synthetic observations. It performs no fs, Git, child-process
 * or network access, never guesses forward, and can never accept a release —
 * acceptance and the durable final receipt belong to P3C.
 */
export function planP3bRecovery({ intent, chain, observations, expected = {} } = {}) {
  if (!plainObject(intent) || !nonEmptyString(intent.activationId)) {
    return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
  }
  if (!plainObject(chain) || chain.present !== true || !Array.isArray(chain.records) || chain.records.length === 0) {
    return outcome("no-transaction");
  }
  const head = chain.records[chain.records.length - 1]?.record;
  if (!plainObject(head) || head.schemaVersion !== TRANSACTION_SCHEMA_VERSION ||
      head.mode !== TRANSACTION_MODE || !Array.isArray(head.trees) || head.trees.length !== 3) {
    return outcome("contradictory-transaction", "contradictory-transaction");
  }
  if (head.activationId !== intent.activationId) {
    return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
  }
  for (const key of ["repositoryRealpath", "authorizedWorktreeRealpath"]) {
    if (expected[key] && intent[key] !== expected[key]) {
      return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
    }
  }
  if (expected.intentSha256 && head.intentSha256 !== expected.intentSha256) {
    return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
  }
  if (expected.stableGitIdentity && !sameJson(head.stableGitIdentity, expected.stableGitIdentity)) {
    return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
  }
  // P3B may never claim acceptance or any downstream effect.
  for (const boundary of ["activationPerformed", "finalActivationReceiptDurable",
    "reloadPerformed", "canaryPerformed", "pushPerformed"]) {
    if (head[boundary] !== false) return outcome("contradictory-transaction", "contradictory-transaction");
  }
  for (const entry of chain.records) {
    const states = [entry.record?.transactionState, ...(entry.record?.trees ?? []).map((tree) => tree?.state)];
    if (states.some((state) => P3C_RESERVED_STATES.includes(state))) {
      return outcome("contradictory-transaction", "contradictory-transaction");
    }
  }
  if (!plainObject(observations)) return outcome("contradictory-transaction", "contradictory-transaction");

  const plans = [];
  let anyForeign = false;
  let anyRestoring = false;
  let allVerified = true;
  let allRestored = true;

  for (const tree of head.trees) {
    const observed = observations[tree.logicalName];
    if (!plainObject(observed)) return outcome("contradictory-transaction", "contradictory-transaction");
    const previousAbsent = tree.previousState === "absent";

    if (observed.foreignLivePresent === true) {
      anyForeign = true;
      plans.push({ logicalName: tree.logicalName, action: "preserve-foreign-live-and-require-operator" });
      allVerified = false; allRestored = false;
      continue;
    }
    if (tree.state === "restored") {
      plans.push({ logicalName: tree.logicalName, action: "already-restored" });
      allVerified = false;
      continue;
    }
    if (tree.state === "restoring") {
      anyRestoring = true; allVerified = false; allRestored = false;
      plans.push({ logicalName: tree.logicalName, action: "complete-reversal" });
      continue;
    }
    if (["untouched", "incoming-preparing", "incoming-prepared"].includes(tree.state)) {
      allVerified = false; allRestored = false;
      plans.push({ logicalName: tree.logicalName, action: "restore-backward", detail: "no-live-mutation-yet" });
      continue;
    }
    if (["live-retiring", "live-retired", "incoming-promoting", "incoming-promoted", "verified"]
      .includes(tree.state)) {
      if (tree.state !== "verified") allVerified = false;
      allRestored = false;
      // A promoted-but-unaccepted generation is reversed backward. A previously
      // absent generation is restored by removing only the promoted payload.
      const action = previousAbsent && ["incoming-promoted", "verified"].includes(tree.state)
        ? "first-activation-restore-to-absent"
        : "restore-backward";
      plans.push({ logicalName: tree.logicalName, action, detail: tree.state });
      continue;
    }
    return outcome("contradictory-transaction", "contradictory-transaction");
  }

  if (anyForeign) {
    return Object.freeze({
      classification: "preserve-foreign-live-and-require-operator",
      code: "recovery-required",
      plans: Object.freeze(plans.map((plan) => Object.freeze(plan))),
      acceptedRelease: false,
      cleanupPermitted: false,
    });
  }
  if (allVerified) {
    // Every unit verified but P3B cannot accept: only a durable P3C receipt can.
    return Object.freeze({
      classification: "p3c-finalization-required",
      code: "p3c-finalization-required",
      plans: Object.freeze(plans.map((plan) => Object.freeze(plan))),
      acceptedRelease: false,
    });
  }
  if (allRestored) {
    return Object.freeze({
      classification: "complete-reversal", code: null,
      plans: Object.freeze(plans.map((plan) => Object.freeze(plan))), acceptedRelease: false,
    });
  }
  const classification = anyRestoring
    ? "complete-reversal"
    : plans.some((plan) => plan.action === "first-activation-restore-to-absent")
      ? "first-activation-restore-to-absent"
      : "restore-backward";
  return Object.freeze({
    classification, code: null,
    plans: Object.freeze(plans.map((plan) => Object.freeze(plan))),
    acceptedRelease: false,
    forwardGuessingPerformed: false,
  });
}

/* ------------------------------------------------------------------------- *
 * P3B — recoverable canonical promotion and whole-release reversal
 *
 * Promotion is the approved fail-closed two-rename primitive:
 *     live  -> <live>.retired-act-<activationId>
 *     <live>.staging-act-<activationId> -> live
 *
 * The interval between those two renames is a real missing-path interval. It is
 * NOT removed by adjacency, and this module never claims otherwise. It is handled
 * by three layers: the canonical-delivery lease excludes cooperating writers, the
 * second rename fails closed when a foreign actor occupies the live name, and the
 * transaction reverses every already-promoted unit. The release is transactionally
 * recoverable; it is NOT cross-tree atomic.
 * ------------------------------------------------------------------------- */

export const RELEASE_ORDER = Object.freeze(["alias", "dev_output", "extension"]);
export const REVERSAL_ORDER = Object.freeze([...RELEASE_ORDER].reverse());

export const P3B_TRANSACTION_STATES = Object.freeze([
  "live-retiring",
  "live-retired",
  "incoming-promoting",
  "incoming-promoted",
  "verified",
  "restoring",
  "restored",
]);
// Acceptance and the durable final receipt belong to P3C.
// Both terminal states belong to P3C. Reserving `rollback-complete` alongside
// `accepted` keeps the precise reserved-state code reachable for either one.
export const P3C_RESERVED_STATES = Object.freeze(["accepted", "rollback-complete"]);

export const P3B_RECOVERY_OUTCOMES = Object.freeze([
  "restore-backward",
  "complete-reversal",
  "preserve-foreign-live-and-require-operator",
  "first-activation-restore-to-absent",
  "p3c-finalization-required",
]);

export function assertP3bWritableState(state) {
  // The reserved check comes first so acceptance gets its precise code; the
  // generic check would otherwise shadow it and leave that code unreachable.
  if (P3C_RESERVED_STATES.includes(state)) {
    fail("transaction-state-reserved-for-p3c", "Acceptance belongs to P3C.", { state });
  }
  if (![...P3A_TRANSACTION_STATES, ...P3B_TRANSACTION_STATES].includes(state)) {
    fail("transaction-state-not-p3b", "P3B may not write this transaction state.", { state });
  }
  return state;
}

/* ---------------- previous canonical-state capture ---------------- */

/**
 * Capture the live tree's identity before it is touched. Reads only the unit's
 * own internally derived live path; never a caller-supplied path.
 */
export function capturePreviousCanonicalState(unit, activationId, {
  buildMarker = null,
  requiredFiles = [],
} = {}) {
  validateActivationId(activationId);
  assertRetiredPathOwned(unit.retiredPath, unit.livePath, activationId);
  let retiredStat = null;
  try { retiredStat = fs.lstatSync(unit.retiredPath); } catch { retiredStat = null; }
  if (retiredStat) {
    fail("retired-sibling-collision", "A retired sibling for this activation already exists.", {
      retiredPath: unit.retiredPath,
    });
  }
  let stat;
  try {
    stat = fs.lstatSync(unit.livePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      fail("previous-state-unreadable", "Live canonical entry could not be inspected.", {
        livePath: unit.livePath,
      });
    }
    return buildPreviousStateRecord({
      logicalName: unit.logicalName, state: "absent",
      livePath: unit.livePath, retiredPath: unit.retiredPath,
    });
  }
  if (stat.isSymbolicLink()) {
    fail("previous-state-symlinked-live", "A symlinked live canonical entry is not accepted.", {
      logicalName: unit.logicalName,
    });
  }
  if (!stat.isDirectory()) {
    fail("previous-state-entry-unsupported", "Live canonical entries must be real directories.", {
      logicalName: unit.logicalName,
    });
  }
  const manifest = recomputeIncomingManifest(unit.livePath, "");
  for (const required of requiredFiles) {
    if (!manifest.entries.some((entry) => entry.path === required)) {
      fail("previous-state-required-file-missing", "Live canonical tree is missing a required file.", {
        logicalName: unit.logicalName, required,
      });
    }
  }
  return buildPreviousStateRecord({
    logicalName: unit.logicalName, state: "present", entryType: "directory",
    manifest, treeDigest: manifest.treeDigest, fileCount: manifest.fileCount,
    buildMarker, filesystemIdentity: { dev: String(stat.dev), ino: String(stat.ino) },
    livePath: unit.livePath, retiredPath: unit.retiredPath,
  });
}

/* ---------------- the single rename capability ---------------- */

function assertRegularDirectory(target, code, context) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail(code, "Canonical promotion operands must be real directories.", { target, ...context });
  }
  return stat;
}

/**
 * The ONLY rename capability in the production surface. Every operand is derived
 * internally, both operands share one canonical parent on one device, and lock
 * plus lease ownership are re-proved immediately before the syscall.
 */
function renameCanonicalEntry({ from, to, unit, guard, expectFromDevice = null }) {
  if (path.dirname(from) !== unit.parent || path.dirname(to) !== unit.parent) {
    fail("promotion-path-not-derived", "Promotion operands must share the derived canonical parent.", {
      from, to, parent: unit.parent,
    });
  }
  if (from === to) fail("promotion-path-not-derived", "Promotion operands must differ.", { from });
  const parentStat = fs.lstatSync(unit.parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    fail("canonical-parent-invalid", "Canonical parent must be a real directory.", { parent: unit.parent });
  }
  const fromStat = assertRegularDirectory(from, "promotion-source-invalid", { logicalName: unit.logicalName });
  if (expectFromDevice !== null && String(fromStat.dev) !== String(expectFromDevice)) {
    fail("promotion-identity-drift", "Promotion source identity changed before the rename.", { from });
  }
  if (String(fromStat.dev) !== String(parentStat.dev)) {
    fail("promotion-cross-device", "Promotion operands must share one filesystem.", { from });
  }
  try {
    fs.lstatSync(to);
    fail("promotion-destination-occupied", "Promotion destination already exists; refusing to replace it.", {
      to, logicalName: unit.logicalName,
    });
  } catch (error) {
    if (error instanceof PayloadTransactionError) throw error;
    if (error?.code !== "ENOENT") {
      fail("promotion-destination-unreadable", "Promotion destination could not be inspected.", { to });
    }
  }
  if (typeof guard === "function") guard();
  try {
    fs.renameSync(from, to);
  } catch (error) {
    // A destination-exists errno here means the name was occupied between the
    // pre-check and the syscall: the missing-path interval was taken over.
    const occupied = ["ENOTEMPTY", "EEXIST", "EISDIR", "ENOTDIR"].includes(error?.code);
    fail(occupied ? "promotion-destination-occupied" : "promotion-rename-failed",
      occupied ? "Promotion destination was occupied during the rename." : "Canonical rename failed.", {
        from, to, code: error?.code ?? null, logicalName: unit.logicalName,
      });
  }
  return true;
}

/* ---------------- lease binding ---------------- */

/**
 * P3B reuses the accepted canonical-delivery lease. No second publisher lock is
 * introduced. The lease excludes cooperating writers during the promotion window;
 * it does not block non-cooperating readers and it does not remove the
 * missing-path interval.
 */
export function assertPromotionOwnership(guards) {
  if (!plainObject(guards)) fail("promotion-ownership-missing", "Promotion requires lock and lease ownership.");
  const { verifyLock, verifyLease: verifyLeaseFn, leaseSessionId } = guards;
  if (typeof verifyLock !== "function" || typeof verifyLeaseFn !== "function") {
    fail("promotion-ownership-missing", "Promotion requires callable lock and lease verifiers.");
  }
  const lock = verifyLock();
  if (lock !== true) fail("publisher-lock-ownership-lost", "Publisher lock ownership could not be re-proved.");
  const lease = verifyLeaseFn();
  if (!plainObject(lease) || !nonEmptyString(lease.sessionId)) {
    fail("canonical-lease-ownership-lost", "Canonical delivery lease ownership could not be re-proved.");
  }
  if (nonEmptyString(leaseSessionId) && lease.sessionId !== leaseSessionId) {
    fail("canonical-lease-identity-drift", "Canonical lease identity changed during promotion.", {
      expected: leaseSessionId, observed: lease.sessionId,
    });
  }
  return Object.freeze({ leaseSessionId: lease.sessionId });
}

/* ---------------- promotion of one unit ---------------- */

export function retireLiveTree({ unit, previous, activationId, guards }) {
  validateActivationId(activationId);
  assertRetiredPathOwned(unit.retiredPath, unit.livePath, activationId);
  if (previous.state === "absent") return Object.freeze({ retired: false, reason: "previous-absent" });
  renameCanonicalEntry({
    from: unit.livePath, to: unit.retiredPath, unit,
    guard: () => assertPromotionOwnership(guards),
    expectFromDevice: previous.filesystemIdentity?.dev ?? null,
  });
  return Object.freeze({ retired: true, retiredPath: unit.retiredPath });
}

export function promoteIncomingTree({ unit, activationId, guards, expectedTreeDigest }) {
  validateActivationId(activationId);
  if (!ownsIncomingSibling(unit.incomingPath, path.basename(unit.livePath), activationId)) {
    fail("promotion-path-not-derived", "Incoming sibling is not owned by this activation.", {
      incomingPath: unit.incomingPath,
    });
  }
  try {
    renameCanonicalEntry({
      from: unit.incomingPath, to: unit.livePath, unit,
      guard: () => assertPromotionOwnership(guards),
    });
  } catch (error) {
    if (error?.code === "promotion-destination-occupied") {
      // Gap takeover: a foreign actor occupied the live name during the interval
      // between the two renames. The foreign tree is never deleted or replaced.
      fail("promotion-gap-takeover", "Foreign content occupied the live path during the promotion interval.", {
        logicalName: unit.logicalName, livePath: unit.livePath,
      });
    }
    throw error;
  }
  const promoted = recomputeIncomingManifest(unit.livePath, "");
  if (nonEmptyString(expectedTreeDigest) && promoted.treeDigest !== expectedTreeDigest) {
    fail("promoted-verification-mismatch", "Promoted live tree does not match its same-stage incoming identity.", {
      logicalName: unit.logicalName, expected: expectedTreeDigest, observed: promoted.treeDigest,
    });
  }
  return Object.freeze({ promoted: true, treeDigest: promoted.treeDigest, fileCount: promoted.fileCount });
}

/* ---------------- reversal of one unit ---------------- */

export function restoreUnit({ unit, previous, activationId, guards, promotedTreeDigest = null }) {
  validateActivationId(activationId);
  assertRetiredPathOwned(unit.retiredPath, unit.livePath, activationId);
  let liveStat = null;
  try { liveStat = fs.lstatSync(unit.livePath); } catch { liveStat = null; }

  if (previous.state === "absent") {
    // First-ever activation: restoration returns the live path to absent by
    // removing only the payload this transaction promoted.
    if (!liveStat) return Object.freeze({ restored: true, mode: "already-absent" });
    if (liveStat.isSymbolicLink() || !liveStat.isDirectory()) {
      fail("reversal-foreign-live", "Live path is not the payload this transaction promoted.", {
        livePath: unit.livePath,
      });
    }
    fs.rmSync(unit.livePath, { recursive: true, force: false });
    return Object.freeze({ restored: true, mode: "removed-promoted-to-absent" });
  }

  // Previous present: the retired sibling is the only verified copy of the prior
  // generation and must be verified before it is moved back.
  const retired = recomputeIncomingManifest(unit.retiredPath, "");
  if (retired.treeDigest !== previous.treeDigest) {
    fail("reversal-retired-digest-mismatch", "Retired payload does not match its captured identity.", {
      logicalName: unit.logicalName, expected: previous.treeDigest, observed: retired.treeDigest,
    });
  }
  if (liveStat) {
    if (liveStat.isSymbolicLink() || !liveStat.isDirectory()) {
      fail("reversal-foreign-live", "Live path holds an entry this transaction cannot safely replace.", {
        livePath: unit.livePath,
      });
    }
    const occupying = recomputeIncomingManifest(unit.livePath, "");
    const ownsOccupant = nonEmptyString(promotedTreeDigest)
      ? occupying.treeDigest === promotedTreeDigest
      : false;
    if (!ownsOccupant) {
      // Foreign content: never clobbered, never deleted. Ambiguous by design.
      fail("reversal-foreign-live", "Foreign content occupies the live path; refusing to clobber it.", {
        logicalName: unit.logicalName, livePath: unit.livePath,
      });
    }
    fs.rmSync(unit.livePath, { recursive: true, force: false });
  }
  renameCanonicalEntry({
    from: unit.retiredPath, to: unit.livePath, unit,
    guard: () => assertPromotionOwnership(guards),
  });
  const restored = recomputeIncomingManifest(unit.livePath, "");
  if (restored.treeDigest !== previous.treeDigest) {
    fail("reversal-verification-mismatch", "Restored live tree does not match the captured previous identity.", {
      logicalName: unit.logicalName,
    });
  }
  return Object.freeze({ restored: true, mode: "restore-previous", treeDigest: restored.treeDigest });
}

/* ---------------- journalled promotion orchestration ---------------- */

function appendState({ directory, baseRecord, sequence, previousRecordSha256, ownerId, state, trees }) {
  assertP3bWritableState(state);
  const record = buildTransactionRecord({
    ...baseRecord, sequence, previousRecordSha256, transactionState: state, trees,
    allowP3bStates: true,
  });
  return publishTransactionRecord(directory, record, { ownerId });
}

/**
 * Promote exactly one unit through the write-ahead sequence.
 *
 * Ordering is the contract, and every mutation is preceded by a durable record
 * plus a re-proof of publisher-lock and canonical-lease ownership:
 *
 *   previous-state capture -> live-retiring -> [live -> retired] -> live-retired
 *   -> incoming-promoting -> [incoming -> live] -> incoming-promoted
 *   -> same-stage verification -> verified
 *
 * A previous-absent unit skips retirement and stays restorable to absence.
 */
export function promoteUnitWithJournal({
  unit, activationId, directory, baseRecord, ownerId, guards,
  sequence, previousRecordSha256, expectedTreeDigest, previous,
  requiredFiles = [], buildMarker = null, hooks = {},
}) {
  validateActivationId(activationId);
  const captured = previous ?? capturePreviousCanonicalState(unit, activationId, { buildMarker, requiredFiles });
  const treesWith = (state, extra = {}) => baseRecord.trees.map((tree) => (
    tree.logicalName === unit.logicalName
      ? { ...tree, state, previousState: captured.state, previousIdentity: captured.treeDigest ?? null,
        restorationMode: captured.restorationMode, ...extra }
      : { ...tree }));

  let seq = sequence;
  let prev = previousRecordSha256;
  const records = [];
  const publish = (state, extra = {}) => {
    const published = appendState({
      directory, baseRecord, sequence: seq, previousRecordSha256: prev, ownerId, state,
      trees: treesWith(state, extra),
    });
    records.push(published);
    seq += 1;
    prev = published.sha256;
    return published;
  };

  publish("live-retiring");
  if (hooks.afterLiveRetiringRecord) hooks.afterLiveRetiringRecord();
  const retirement = retireLiveTree({ unit, previous: captured, activationId, guards });
  if (hooks.afterRetire) hooks.afterRetire(retirement);
  publish("live-retired", { retired: retirement.retired });

  publish("incoming-promoting");
  if (hooks.afterPromotingRecord) hooks.afterPromotingRecord();
  const promotion = promoteIncomingTree({ unit, activationId, guards, expectedTreeDigest });
  if (hooks.afterPromote) hooks.afterPromote(promotion);
  publish("incoming-promoted", { promotedIdentity: promotion.treeDigest });

  // Same-stage canonical verification: the promoted tree is compared only against
  // the incoming identity produced by this exact stage receipt.
  const observed = recomputeIncomingManifest(unit.livePath, "");
  if (observed.treeDigest !== promotion.treeDigest ||
      (nonEmptyString(expectedTreeDigest) && observed.treeDigest !== expectedTreeDigest)) {
    fail("promoted-verification-mismatch", "Promoted live tree failed same-stage verification.", {
      logicalName: unit.logicalName,
    });
  }
  if (hooks.beforeVerifiedRecord) hooks.beforeVerifiedRecord();
  publish("verified", { promotedIdentity: promotion.treeDigest, verified: true });

  return Object.freeze({
    logicalName: unit.logicalName,
    previous: captured,
    retired: retirement.retired,
    promotedTreeDigest: promotion.treeDigest,
    records: Object.freeze(records),
    sequence: seq,
    previousRecordSha256: prev,
    livePayloadMutationPerformed: true,
    acceptedRelease: false,
  });
}

/* ---------------- whole-release reversal ---------------- */

/**
 * Reverse every already-changed unit in strict reverse mutation order.
 *
 * Never deletes foreign content, never deletes the only verified copy, never
 * passes a retired payload to incoming cleanup, and never introduces a third
 * sibling family. Ambiguity stops the sweep and returns recovery-required with
 * all evidence intact.
 */
export function reverseRelease({
  changed, activationId, directory, baseRecord, ownerId, guards,
  sequence = null, previousRecordSha256 = null, hooks = {},
}) {
  validateActivationId(activationId);
  // Self-position from the durable journal. A unit that failed mid-sequence has
  // already published records, so any sequence the caller was tracking is stale.
  if (sequence === null || previousRecordSha256 === null) {
    const live = readTransactionChain(directory);
    sequence = live.records.length + 1;
    previousRecordSha256 = live.headSha256 ?? null;
  }
  // Entries are { unit, previous, promotedTreeDigest }: the logical name lives on
  // the unit. Reading it from the entry yielded undefined, so indexOf returned -1
  // for every entry and the sort silently preserved promotion order.
  const ordered = [...changed].sort((left, right) =>
    REVERSAL_ORDER.indexOf(left.unit.logicalName) - REVERSAL_ORDER.indexOf(right.unit.logicalName));
  let seq = sequence;
  let prev = previousRecordSha256;
  const restored = [];
  const records = [];
  const publish = (state, unit, extra = {}) => {
    const published = appendState({
      directory, baseRecord, sequence: seq, previousRecordSha256: prev, ownerId, state,
      trees: baseRecord.trees.map((tree) => (tree.logicalName === unit.logicalName
        ? { ...tree, state, ...extra } : { ...tree })),
    });
    records.push(published);
    seq += 1;
    prev = published.sha256;
    return published;
  };

  for (const entry of ordered) {
    const { unit, previous, promotedTreeDigest } = entry;
    try {
      publish("restoring", unit);
      if (hooks.afterRestoringRecord) hooks.afterRestoringRecord(unit);
      const outcome = restoreUnit({ unit, previous, activationId, guards, promotedTreeDigest });
      publish("restored", unit, { restorationOutcome: outcome.mode });
      restored.push({ logicalName: unit.logicalName, mode: outcome.mode });
    } catch (error) {
      // Loud, evidence-preserving, and no cleanup after ambiguity.
      return Object.freeze({
        reversed: false,
        classification: error?.code === "reversal-foreign-live"
          ? "preserve-foreign-live-and-require-operator"
          : "recovery-required",
        code: error?.code ?? "reversal-failed",
        blockedAt: unit.logicalName,
        restored: Object.freeze(restored),
        records: Object.freeze(records),
        sequence: seq,
        previousRecordSha256: prev,
        evidencePreserved: true,
      });
    }
  }
  return Object.freeze({
    reversed: true,
    classification: "complete-reversal",
    code: null,
    restored: Object.freeze(restored),
    records: Object.freeze(records),
    sequence: seq,
    previousRecordSha256: prev,
    acceptedRelease: false,
  });
}

/**
 * Promote all three units in the pinned release order, reversing everything
 * already changed when any unit fails. The release is transactionally
 * recoverable, never cross-tree atomic, and P3B never accepts it: acceptance and
 * the durable final receipt belong to P3C.
 */
export function promoteReleaseWithJournal({
  units, activationId, directory, baseRecord, ownerId, guards,
  sequence = 1, previousRecordSha256 = null, expectedDigests = {}, hooks = {},
}) {
  const ordered = [...units].sort((left, right) =>
    RELEASE_ORDER.indexOf(left.logicalName) - RELEASE_ORDER.indexOf(right.logicalName));
  if (ordered.length !== 3 ||
      !sameJson(ordered.map((unit) => unit.logicalName), [...RELEASE_ORDER])) {
    fail("release-order-invalid", "A release promotes exactly the three canonical units in pinned order.", {
      observed: ordered.map((unit) => unit.logicalName),
    });
  }
  let seq = sequence;
  let prev = previousRecordSha256;
  const changed = [];
  for (const unit of ordered) {
    try {
      const result = promoteUnitWithJournal({
        unit, activationId, directory, baseRecord, ownerId, guards,
        sequence: seq, previousRecordSha256: prev,
        expectedTreeDigest: expectedDigests[unit.logicalName] ?? null,
        hooks,
      });
      seq = result.sequence;
      prev = result.previousRecordSha256;
      changed.push({ unit, previous: result.previous, promotedTreeDigest: result.promotedTreeDigest });
    } catch (error) {
      const reversal = reverseRelease({
        changed, activationId, directory, baseRecord, ownerId, guards, hooks,
      });
      return Object.freeze({
        released: false,
        failedAt: unit.logicalName,
        code: error?.code ?? "promotion-failed",
        gapTakeover: error?.code === "promotion-gap-takeover",
        reversal,
        acceptedRelease: false,
        finalActivationReceiptDurable: false,
      });
    }
  }
  return Object.freeze({
    released: true,
    fixtureVerified: true,
    order: [...RELEASE_ORDER],
    changed: Object.freeze(changed.map((entry) => Object.freeze({
      logicalName: entry.unit.logicalName,
      promotedTreeDigest: entry.promotedTreeDigest,
      previousState: entry.previous.state,
    }))),
    sequence: seq,
    previousRecordSha256: prev,
    // P3B never accepts a release; P3C owns acceptance and the durable receipt.
    acceptedRelease: false,
    activationPerformed: false,
    finalActivationReceiptDurable: false,
    reloadPerformed: false,
    canaryPerformed: false,
    pushPerformed: false,
  });
}

/* ------------------------------------------------------------------------- *
 * P3C — activation finalization, canonical verification, recovery, rollback
 *
 * Terminal states are writable ONLY through the finalization helpers below, and
 * only after their receipt has been durably published and re-read. Nothing here
 * acquires a lease or a lock: the activator owns those lifecycles and injects
 * narrow ownership-verification callbacks, so no broad exclusion capability
 * reaches this module.
 * ------------------------------------------------------------------------- */

export const P3C_TRANSACTION_STATES = Object.freeze(["accepted", "rollback-complete"]);
export const ACTIVATION_RECEIPT_MODE = "activation-receipt";
export const ROLLBACK_RECEIPT_MODE = "rollback-receipt";
// v2: activation receipts now carry complete previous-generation rollback
// evidence. No real receipt exists yet, so this is a deliberate strict
// transition — v1 receipts are not tolerated rather than silently accepted.
export const RECEIPT_SCHEMA_VERSION = 2;
// Distinctly named so the activator cannot confuse it with the Batch 1 STAGE
// publication receipt schema, which is a different document with its own version.
export const ACTIVATION_RECEIPT_SCHEMA_VERSION = 2;
export const ACTIVATIONS_SUBPATH = "activations";
export const ROLLBACKS_SUBPATH = "rollbacks";

export const P3C_RECOVERY_OUTCOMES = Object.freeze([
  "complete-terminal-accepted-record",
  "restore-backward",
  "complete-reversal",
  "first-activation-restore-to-absent",
  "preserve-foreign-live-and-require-operator",
  "recovery-required",
  "contradictory-transaction",
  "foreign-or-unowned-transaction",
]);

export function assertP3cWritableState(state) {
  if (!P3C_TRANSACTION_STATES.includes(state)) {
    fail("transaction-state-not-p3c", "Only terminal P3C states may be written by finalization helpers.", { state });
  }
  return state;
}

/* ---------------- durable receipt publication ---------------- */

/**
 * Durable no-replace receipt publication. Identical in shape to the accepted
 * journal writer: exclusive temp at 0600, write, file fsync, no-replace hard
 * link, owned-temp unlink, directory fsync, byte read-back, digest verification.
 * A collision fails closed and never overwrites an existing receipt.
 */
/**
 * Fixture-only failure injection for the receipt durability sequence. Production
 * callers never pass one; the parameter exists so every step of the no-replace
 * publication can be proven to fail closed without acceptance.
 */
function invokeReceiptFailureInjection(failureInjection, point) {
  if (typeof failureInjection === "function") failureInjection(point);
}

function publishDurableReceipt(directory, basename, receipt,
  { ownerId, collisionCode, failureInjection = null }) {
  assertRealDirectoryOrAbsent(directory, "receipt-directory-symlink", "receipt-directory-invalid");
  const finalPath = path.join(path.resolve(directory), basename);
  const safeOwner = nonEmptyString(ownerId) && OWNER_ID_PATTERN.test(ownerId) ? ownerId : crypto.randomUUID();
  const tempPath = path.join(path.resolve(directory), `.${basename}.tmp-${safeOwner}`);
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  let descriptor = null;
  let tempOwned = false;
  try {
    try {
      fs.lstatSync(finalPath);
      fail(collisionCode, "Receipt already exists; receipts are never overwritten.", { finalPath });
    } catch (error) {
      if (error instanceof PayloadTransactionError) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
    invokeReceiptFailureInjection(failureInjection, "before-temp-open");
    try {
      descriptor = fs.openSync(tempPath, "wx", 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") {
        fail("receipt-temp-collision", "An invocation-owned receipt temporary already exists.", { tempPath });
      }
      throw error;
    }
    tempOwned = true;
    invokeReceiptFailureInjection(failureInjection, "after-temp-open");
    fs.writeFileSync(descriptor, bytes);
    invokeReceiptFailureInjection(failureInjection, "after-write");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    invokeReceiptFailureInjection(failureInjection, "after-fsync");
    try {
      fs.linkSync(tempPath, finalPath);
    } catch (error) {
      if (error?.code === "EEXIST") {
        fail(collisionCode, "Receipt appeared before publication; refusing overwrite.", { finalPath });
      }
      fail("receipt-link-failed", "Filesystem could not publish the receipt through no-replace hard linking.", {
        finalPath, code: error?.code ?? null,
      });
    }
    fs.unlinkSync(tempPath);
    tempOwned = false;
    invokeReceiptFailureInjection(failureInjection, "after-link");
    const directoryFsync = flushDirectory(directory);
    invokeReceiptFailureInjection(failureInjection, "after-directory-fsync");
    const observed = fs.readFileSync(finalPath);
    if (!observed.equals(bytes)) {
      fail("receipt-final-verification", "Durable receipt bytes differ after publication.", { finalPath });
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
      try { fs.closeSync(descriptor); } catch { /* preserve the original cause */ }
    }
    if (tempOwned) {
      try {
        const stat = fs.lstatSync(tempPath);
        if (!stat.isSymbolicLink() && stat.isFile()) fs.unlinkSync(tempPath);
      } catch { /* cleanup must not mask the cause */ }
    }
    throw error;
  }
}

/**
 * Create an owner-only coordination subdirectory under the anchor. Mirrors the
 * accepted transaction-directory logic: symlinks rejected, 0700 enforced, and
 * the parent flushed when a directory is newly created.
 */
function ensureAnchorSubdirectory(anchorRoot, name, symlinkCode, invalidCode) {
  const created = [];
  for (const candidate of [path.resolve(anchorRoot), path.join(path.resolve(anchorRoot), name)]) {
    const state = assertRealDirectoryOrAbsent(candidate);
    if (state === "absent") {
      try {
        fs.mkdirSync(candidate, { mode: 0o700 });
        created.push(candidate);
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
      }
      assertRealDirectoryOrAbsent(candidate);
    }
    const mode = fs.statSync(candidate).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      fail(invalidCode, "Coordination directories must remain owner-only.", {
        directory: candidate, mode: mode.toString(8),
      });
    }
  }
  const directory = path.join(path.resolve(anchorRoot), name);
  if (created.length) flushDirectory(path.dirname(directory));
  return directory;
}

export function activationReceiptPath(anchorRoot, activationId) {
  validateActivationId(activationId);
  return path.join(path.resolve(anchorRoot), ACTIVATIONS_SUBPATH, `${activationId}.json`);
}

export function rollbackReceiptPath(anchorRoot, rollbackId) {
  validateActivationId(rollbackId);
  return path.join(path.resolve(anchorRoot), ROLLBACKS_SUBPATH, `${rollbackId}.json`);
}

export function buildActivationReceipt(input) {
  if (!plainObject(input)) fail("receipt-invalid", "Activation receipt input must be an object.");
  const required = ["activationId", "transactionRecordPath", "transactionRecordSha256", "intentPath",
    "intentSha256", "stageReceiptPath", "stageReceiptSha256", "repositoryRealpath",
    "authorizedWorktreeRealpath", "branch", "approvedHead", "sourceTree", "buildMarker",
    "acceptedExtensionVariant", "promotionPrimitive", "preparedAt", "promotedAt", "verifiedAt", "acceptedAt"];
  for (const key of required) {
    if (!nonEmptyString(input[key])) fail("receipt-invalid", `Activation receipt field ${key} is required.`, { key });
  }
  validateActivationId(input.activationId);
  if (input.acceptedExtensionVariant !== ACCEPTED_EXTENSION_VARIANT) {
    fail("extension-variant-not-accepted", "Activation receipts pin the accepted extension variant.");
  }
  if (!plainObject(input.stableGitIdentity) ||
      !["path", "realpath", "version", "sha256"].every((key) => nonEmptyString(input.stableGitIdentity[key])) ||
      ["device", "inode", "size", "mtimeMs"].some((key) => Object.hasOwn(input.stableGitIdentity, key))) {
    fail("receipt-git-identity-invalid", "Receipts carry only the stable Git identity.");
  }
  for (const key of ["stagedIdentities", "incomingIdentities", "previousCanonicalIdentities",
    "promotedCanonicalIdentities", "canonicalVerification"]) {
    if (!plainObject(input[key])) fail("receipt-invalid", `Activation receipt field ${key} must be an object.`, { key });
  }
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    mode: ACTIVATION_RECEIPT_MODE,
    activationId: input.activationId,
    transactionRecordPath: input.transactionRecordPath,
    transactionRecordSha256: input.transactionRecordSha256,
    intentPath: input.intentPath,
    intentSha256: input.intentSha256,
    stageReceiptPath: input.stageReceiptPath,
    stageReceiptSha256: input.stageReceiptSha256,
    repositoryRealpath: input.repositoryRealpath,
    authorizedWorktreeRealpath: input.authorizedWorktreeRealpath,
    branch: input.branch,
    approvedHead: input.approvedHead,
    sourceTree: input.sourceTree,
    stableGitIdentity: input.stableGitIdentity,
    acceptedExtensionVariant: input.acceptedExtensionVariant,
    buildMarker: input.buildMarker,
    stagedIdentities: input.stagedIdentities,
    incomingIdentities: input.incomingIdentities,
    previousCanonicalIdentities: input.previousCanonicalIdentities,
    promotedCanonicalIdentities: input.promotedCanonicalIdentities,
    canonicalVerification: input.canonicalVerification,
    promotionPrimitive: input.promotionPrimitive,
    preparedAt: input.preparedAt,
    promotedAt: input.promotedAt,
    verifiedAt: input.verifiedAt,
    acceptedAt: input.acceptedAt,
    rollbackAvailable: input.rollbackAvailable === true,
    rollbackCandidates: input.rollbackCandidates ?? null,
    durability: {
      fileFsync: { attempted: true, succeeded: true },
      directoryFsync: { attempted: true, succeeded: null, unsupported: null,
        actualOutcomeReturnedByPublication: true },
      processCrashAtomicity: true,
      powerLossDurabilityGuaranteed: false,
    },
    activationPerformed: true,
    reloadPerformed: false,
    canaryPerformed: false,
    pushPerformed: false,
  };
}

export function publishActivationReceipt(anchorRoot, activationId, receipt,
  { ownerId, failureInjection = null } = {}) {
  validateActivationId(activationId);
  if (receipt?.mode !== ACTIVATION_RECEIPT_MODE || receipt?.activationId !== activationId) {
    fail("receipt-invalid", "Activation receipt does not describe this activation.", { activationId });
  }
  const directory = ensureAnchorSubdirectory(anchorRoot, ACTIVATIONS_SUBPATH,
    "activations-symlink", "activations-invalid");
  return publishDurableReceipt(directory, `${activationId}.json`, receipt, {
    ownerId, collisionCode: "activation-receipt-collision", failureInjection,
  });
}

export function buildRollbackReceipt(input) {
  if (!plainObject(input)) fail("receipt-invalid", "Rollback receipt input must be an object.");
  for (const key of ["rollbackId", "sourceActivationReceiptPath", "sourceActivationReceiptSha256",
    "rollbackTransactionPath", "rollbackTransactionSha256", "repositoryRealpath", "rolledBackFrom",
    "restoredTo", "startedAt", "completedAt"]) {
    if (!nonEmptyString(input[key])) fail("receipt-invalid", `Rollback receipt field ${key} is required.`, { key });
  }
  validateActivationId(input.rollbackId);
  for (const key of ["previousCanonicalIdentities", "resultingCanonicalIdentities", "manifests"]) {
    if (!plainObject(input[key])) fail("receipt-invalid", `Rollback receipt field ${key} must be an object.`, { key });
  }
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    mode: ROLLBACK_RECEIPT_MODE,
    rollbackId: input.rollbackId,
    sourceActivationReceiptPath: input.sourceActivationReceiptPath,
    sourceActivationReceiptSha256: input.sourceActivationReceiptSha256,
    rollbackTransactionPath: input.rollbackTransactionPath,
    rollbackTransactionSha256: input.rollbackTransactionSha256,
    repositoryRealpath: input.repositoryRealpath,
    rolledBackFrom: input.rolledBackFrom,
    restoredTo: input.restoredTo,
    manifests: input.manifests,
    previousCanonicalIdentities: input.previousCanonicalIdentities,
    resultingCanonicalIdentities: input.resultingCanonicalIdentities,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durability: {
      fileFsync: { attempted: true, succeeded: true },
      directoryFsync: { attempted: true, succeeded: null, unsupported: null,
        actualOutcomeReturnedByPublication: true },
      processCrashAtomicity: true,
      powerLossDurabilityGuaranteed: false,
    },
    rollbackPerformed: true,
    reloadPerformed: false,
    canaryPerformed: false,
    pushPerformed: false,
  };
}

export function publishRollbackReceipt(anchorRoot, rollbackId, receipt, { ownerId } = {}) {
  validateActivationId(rollbackId);
  if (receipt?.mode !== ROLLBACK_RECEIPT_MODE || receipt?.rollbackId !== rollbackId) {
    fail("receipt-invalid", "Rollback receipt does not describe this rollback.", { rollbackId });
  }
  const directory = ensureAnchorSubdirectory(anchorRoot, ROLLBACKS_SUBPATH,
    "rollbacks-symlink", "rollbacks-invalid");
  return publishDurableReceipt(directory, `${rollbackId}.json`, receipt, {
    ownerId, collisionCode: "rollback-receipt-collision",
  });
}

/* ---------------- terminal state writers ---------------- */

/**
 * The ONLY writer of the terminal `accepted` state. Acceptance is legal solely
 * after the activation receipt has been durably published AND its bytes re-read
 * and digest-verified. A verified-but-unreceipted generation can never be
 * accepted.
 */
export function appendAcceptedRecord({
  directory, baseRecord, sequence, previousRecordSha256, ownerId, receipt, trees,
}) {
  assertP3cWritableState("accepted");
  if (!plainObject(receipt) || !nonEmptyString(receipt.path) || !nonEmptyString(receipt.sha256)) {
    fail("acceptance-requires-durable-receipt", "Acceptance requires a durably published activation receipt.");
  }
  const observed = fs.readFileSync(receipt.path);
  if (sha256Bytes(observed) !== receipt.sha256) {
    fail("acceptance-receipt-unverified", "Activation receipt bytes do not match the published digest.", {
      receiptPath: receipt.path,
    });
  }
  const record = buildTransactionRecord({
    ...baseRecord, sequence, previousRecordSha256,
    transactionState: "accepted", trees, allowP3bStates: true, allowP3cStates: true,
  });
  record.finalActivationReceiptDurable = true;
  record.activationPerformed = true;
  record.activationReceiptPath = receipt.path;
  record.activationReceiptSha256 = receipt.sha256;
  return publishTransactionRecord(directory, record, { ownerId });
}

/** The ONLY writer of the terminal `rollback-complete` state. */
export function appendRollbackCompleteRecord({
  directory, baseRecord, sequence, previousRecordSha256, ownerId, receipt, trees,
}) {
  assertP3cWritableState("rollback-complete");
  if (!plainObject(receipt) || !nonEmptyString(receipt.path) || !nonEmptyString(receipt.sha256)) {
    fail("rollback-requires-durable-receipt", "Rollback completion requires a durably published receipt.");
  }
  const observed = fs.readFileSync(receipt.path);
  if (sha256Bytes(observed) !== receipt.sha256) {
    fail("rollback-receipt-unverified", "Rollback receipt bytes do not match the published digest.", {
      receiptPath: receipt.path,
    });
  }
  const record = buildTransactionRecord({
    ...baseRecord, sequence, previousRecordSha256,
    transactionState: "rollback-complete", trees, allowP3bStates: true, allowP3cStates: true,
  });
  record.rollbackReceiptPath = receipt.path;
  record.rollbackReceiptSha256 = receipt.sha256;
  return publishTransactionRecord(directory, record, { ownerId });
}

/* ---------------- production canonical verification ---------------- */

/**
 * Recompute all three live canonical trees and compare them to the promoted
 * identities recorded by one activation receipt. Read-only: performs no mutation.
 * Comparison is always same-stage, because the promoted identities come from the
 * receipt that bound this exact stage.
 */
/**
 * Read-only symlink policy for a promoted live tree.
 *
 * The tree digest already pins link *text*; this proves the resolved *target*
 * still satisfies the same policy the incoming preparation enforced. Uses only
 * lstat, readlink and realpath — never a mutation.
 */
function verifyLiveSymlinkPolicy(unit, repository) {
  const findings = [];
  const familyRoot = normalizedPath(unit.livePath);
  const normalizedRepository = repository === null ? null : normalizedPath(repository);
  const walk = (directory) => {
    for (const name of fs.readdirSync(directory).sort()) {
      const filename = path.join(directory, name);
      const stat = fs.lstatSync(filename);
      const relative = path.relative(unit.livePath, filename).split(path.sep).join("/");
      if (stat.isDirectory()) {
        walk(filename);
        continue;
      }
      if (!stat.isSymbolicLink()) continue;
      const linkText = fs.readlinkSync(filename);
      let resolved;
      try {
        resolved = fs.realpathSync.native(filename);
      } catch {
        fail("canonical-verification-symlink-broken", "A live canonical symlink does not resolve.", {
          logicalName: unit.logicalName, path: relative, linkText,
        });
      }
      const insideFamily = isWithin(familyRoot, resolved);
      const insideRepository = normalizedRepository !== null && isWithin(normalizedRepository, resolved);
      if (!insideFamily && !insideRepository) {
        fail("canonical-verification-symlink-foreign", "A live canonical symlink resolves outside the approved roots.", {
          logicalName: unit.logicalName, path: relative, linkText, resolved,
        });
      }
      if (insideRepository && !insideFamily) {
        for (const segments of GENERATED_OUTPUT_SEGMENTS) {
          if (isWithin(path.join(normalizedRepository, ...segments), resolved)) {
            fail("canonical-verification-symlink-generated-target",
              "A live canonical symlink resolves into a generated-output tree.", {
                logicalName: unit.logicalName, path: relative, resolved,
              });
          }
        }
      }
      findings.push(Object.freeze({ path: relative, linkText, resolved, insideFamily }));
    }
  };
  walk(unit.livePath);
  return Object.freeze(findings);
}

/**
 * Independently verify all three live canonical trees against one activation
 * receipt. Strictly read-only.
 *
 * Comparison is exhaustive by construction: the recomputed manifest pins the
 * path set, file count, regular-file byte size and SHA-256, and symlink link
 * text, and the tree digest binds them together. On top of that this adds the
 * resolved-target policy, required extension files, the accepted extension
 * variant, the exact build marker, and mixed-generation detection.
 *
 * Units are compared without failing fast so a partially drifted release is
 * reported as a mixed generation rather than as a single unit's digest error.
 */
export function verifyCanonicalAgainstReceipt(units, receipt, {
  expectedBuildMarker = null, repository = null, requiredFiles = [],
  extensionVariant = null,
} = {}) {
  if (!plainObject(receipt) || receipt.mode !== ACTIVATION_RECEIPT_MODE) {
    fail("canonical-verification-receipt-invalid", "Canonical verification requires an activation receipt.");
  }
  if (nonEmptyString(expectedBuildMarker) && receipt.buildMarker !== expectedBuildMarker) {
    fail("canonical-verification-build-marker", "Receipt build marker differs from the verified stage.", {
      expected: expectedBuildMarker, observed: receipt.buildMarker,
    });
  }
  if (nonEmptyString(extensionVariant) && receipt.acceptedExtensionVariant !== extensionVariant) {
    fail("canonical-verification-extension-variant", "Receipt extension variant is not the accepted variant.", {
      expected: extensionVariant, observed: receipt.acceptedExtensionVariant ?? null,
    });
  }
  if (units.length !== 3) {
    fail("canonical-verification-incomplete", "Canonical verification requires all three units.");
  }
  const comparisons = [];
  for (const unit of units) {
    const expected = receipt.promotedCanonicalIdentities?.[unit.logicalName];
    if (!plainObject(expected) || !nonEmptyString(expected.treeDigest)) {
      fail("canonical-verification-identity-missing", "Receipt does not record a promoted identity for a unit.", {
        logicalName: unit.logicalName,
      });
    }
    let stat;
    try {
      stat = fs.lstatSync(unit.livePath);
    } catch {
      fail("canonical-verification-live-missing", "A live canonical tree is absent.", {
        logicalName: unit.logicalName,
      });
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      fail("canonical-verification-live-invalid", "A live canonical entry is not a real directory.", {
        logicalName: unit.logicalName,
      });
    }
    const observed = recomputeIncomingManifest(unit.livePath, "");
    comparisons.push({
      unit,
      expected,
      observed,
      countMatches: observed.fileCount === expected.fileCount,
      digestMatches: observed.treeDigest === expected.treeDigest,
    });
  }
  // A release is one generation: either every unit matches this receipt or none
  // does. A partial match means the three live trees are not from one stage.
  const matched = comparisons.filter((entry) => entry.digestMatches);
  if (matched.length > 0 && matched.length < comparisons.length) {
    fail("canonical-verification-mixed-generation",
      "Live canonical trees are not all from the generation this receipt accepted.", {
        matching: matched.map((entry) => entry.unit.logicalName),
        drifted: comparisons.filter((entry) => !entry.digestMatches)
          .map((entry) => entry.unit.logicalName),
      });
  }
  const results = {};
  for (const entry of comparisons) {
    if (!entry.countMatches) {
      fail("canonical-verification-file-count", "Live canonical file count differs from the receipt.", {
        logicalName: entry.unit.logicalName,
        expected: entry.expected.fileCount, observed: entry.observed.fileCount,
      });
    }
    if (!entry.digestMatches) {
      fail("canonical-verification-digest", "Live canonical tree digest differs from the receipt.", {
        logicalName: entry.unit.logicalName,
        expected: entry.expected.treeDigest, observed: entry.observed.treeDigest,
      });
    }
    const symlinks = verifyLiveSymlinkPolicy(entry.unit, repository);
    if (entry.unit.logicalName === "extension" && requiredFiles.length > 0) {
      const present = new Set(entry.observed.entries.map((item) => item.path));
      for (const required of requiredFiles) {
        if (!present.has(required)) {
          fail("canonical-verification-required-file", "A required canonical extension file is absent.", {
            logicalName: entry.unit.logicalName, required,
          });
        }
      }
    }
    results[entry.unit.logicalName] = Object.freeze({
      logicalName: entry.unit.logicalName, verified: true,
      fileCount: entry.observed.fileCount, treeDigest: entry.observed.treeDigest,
      symlinkCount: symlinks.length,
      symlinks,
    });
  }
  if (Object.keys(results).length !== 3) {
    fail("canonical-verification-incomplete", "Canonical verification requires all three units.");
  }
  return Object.freeze({
    ok: true, mode: "verify-canonical", activationId: receipt.activationId,
    results: Object.freeze(results), mutationPerformed: false,
    mixedGenerationDetected: false,
    buildMarker: receipt.buildMarker,
    sameStageVerified: true,
  });
}

/* ---------------- pure P3C recovery policy ---------------- */

/**
 * Deterministic recovery policy. Pure: no fs, Git, child process or mutation.
 * Never guesses forward, and never manufactures acceptance for a release that
 * was not already fully verified and durably receipted.
 */
export function planP3cRecovery({ chain, observations, receipt = null, expected = {} } = {}) {
  if (!plainObject(chain) || chain.present !== true || !Array.isArray(chain.records) || chain.records.length === 0) {
    return outcome("no-transaction");
  }
  const head = chain.records[chain.records.length - 1]?.record;
  if (!plainObject(head) || head.schemaVersion !== TRANSACTION_SCHEMA_VERSION || head.mode !== TRANSACTION_MODE) {
    return outcome("contradictory-transaction", "contradictory-transaction");
  }
  for (const key of ["repositoryRealpath", "authorizedWorktreeRealpath"]) {
    if (expected[key] && head[key] !== expected[key]) {
      return outcome("foreign-or-unowned-transaction", "foreign-or-unowned-transaction");
    }
  }
  if (!plainObject(observations)) return outcome("contradictory-transaction", "contradictory-transaction");

  const receiptDurable = plainObject(receipt) && receipt.durable === true;
  const canonicalVerified = observations.canonicalVerified === true;
  const alreadyAccepted = head.transactionState === "accepted";
  const anyForeign = ["alias", "dev_output", "extension"]
    .some((name) => observations[name]?.foreignLivePresent === true);

  if (anyForeign) {
    return outcome("preserve-foreign-live-and-require-operator", "recovery-required", { cleanupPermitted: false });
  }
  if (alreadyAccepted) {
    // Terminal already recorded; nothing to complete.
    return outcome("complete-terminal-accepted-record", null, { alreadyTerminal: true, acceptedRelease: true });
  }
  if (receiptDurable && canonicalVerified) {
    // The generation was fully verified and durably receipted: the only missing
    // step is the terminal record. This is the single forward-completion case.
    return outcome("complete-terminal-accepted-record", null, { acceptedRelease: false, forwardCompletionOnly: true });
  }
  if (receiptDurable && !canonicalVerified) {
    // A receipt exists but canonical payload does not verify. Never guess.
    return outcome("recovery-required", "recovery-required", { cleanupPermitted: false });
  }
  // No durable receipt: prefer backward restoration.
  const states = head.trees?.map((tree) => tree?.state) ?? [];
  if (states.some((state) => state === "restoring")) {
    return outcome("complete-reversal", null, { acceptedRelease: false });
  }
  if (states.length === 3 && states.every((state) => state === "restored")) {
    return outcome("complete-reversal", null, { acceptedRelease: false });
  }
  const previousAbsent = head.trees?.every((tree) => tree?.previousState === "absent") === true;
  if (previousAbsent && states.some((state) => ["incoming-promoted", "verified"].includes(state))) {
    return outcome("first-activation-restore-to-absent", null, { acceptedRelease: false });
  }
  return outcome("restore-backward", null, { acceptedRelease: false, forwardGuessingPerformed: false });
}

// P3A exposes no CLI. Importing this module performs no work and the file is not
// an executable entry point; production activation cannot reach payload mutation.
