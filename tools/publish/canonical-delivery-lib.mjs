import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const LEASE_SCHEMA_VERSION = 1;
export const APPROVAL_SCHEMA_VERSION = 1;
export const DEFAULT_LEASE_TTL_MS = 4 * 60 * 60 * 1000;
export const MIN_TOKEN_BYTES = 32;
export const ACTIVE_LEASE_DIRECTORY = "active-lease";
export const LEASE_METADATA_FILE = "lease.json";
const AUTHORITATIVE_MAIN_REF = "refs/heads/main";
const TRUSTED_GIT_CANDIDATES = Object.freeze([
  "/usr/bin/git",
  "/opt/homebrew/bin/git",
  "/usr/local/bin/git",
]);
const EXACT_READ_ONLY_GIT_COMMANDS = Object.freeze([
  "rev-parse\u0000--show-toplevel",
  "rev-parse\u0000--path-format=absolute\u0000--git-common-dir",
  "rev-parse\u0000HEAD",
  "rev-parse\u0000HEAD^{tree}",
  "rev-parse\u0000refs/heads/main",
  "branch\u0000--show-current",
  "diff\u0000--cached\u0000--quiet",
  "diff\u0000--quiet",
  "ls-files\u0000--others\u0000--exclude-standard",
  "worktree\u0000list\u0000--porcelain",
  "config\u0000--path\u0000--get\u0000core.worktree",
]);
const FULL_COMMIT_PATTERN = /^[a-f0-9]{40}$/u;

export const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  ABSENT_OR_CONTENDED: 10,
  TOKEN_INVALID: 11,
  OWNER_MISMATCH: 12,
  ELIGIBILITY_MISMATCH: 13,
  EXPIRED: 14,
  VERIFICATION_MISMATCH: 15,
  PATH_COUPLING_VIOLATION: 16,
  PERMISSION_FLOOR_BREACH: 17,
  STAGING_INTEGRITY_FAILURE: 18,
  PROMOTION_REVERSED: 19,
});

export const DESTINATION_CLASS = Object.freeze({
  LOCAL: "LOCAL",
  CANONICAL: "CANONICAL",
});

export const PROMOTION_PRIMITIVE = Object.freeze({
  twoRenameAccepted: false,
  reason: "live-to-retired then staging-to-live has a missing-path interval",
  requiredResolution: Object.freeze([
    "atomic-exchange",
    "compatible-pointer-promotion",
    "fail-closed-two-rename-with-proven-takeover-reversal",
  ]),
});

const LEASE_KEYS = Object.freeze([
  "schemaVersion",
  "sessionId",
  "ownershipTokenSha256",
  "tokenCorrelationPrefix",
  "canonicalRoot",
  "publisherRepositoryRoot",
  "publisherWorktreeRoot",
  "branch",
  "approvedHead",
  "headIsAncestorOfMain",
  "approvalRef",
  "purpose",
  "lane",
  "pid",
  "processStartIdentity",
  "hostname",
  "bootIdentity",
  "acquiredAt",
  "heartbeatAt",
  "heartbeatCounter",
  "expiresAt",
  "buildTs",
  "buildIso",
  "stagingDirectoryNames",
  "expectedExtensionOutput",
  "lifecycleState",
].sort());

const STAGING_KEYS = Object.freeze(["alias", "devOutput", "extension"].sort());
const APPROVAL_KEYS = Object.freeze([
  "schemaVersion",
  "approvalRef",
  "approvedHead",
  "approvedWorktreeRoot",
  "purpose",
  "lane",
  "approver",
  "approvedAt",
  "expiresAt",
].sort());

export class CanonicalDeliveryError extends Error {
  constructor(exitCode, message, details = undefined) {
    super(message);
    this.name = "CanonicalDeliveryError";
    this.exitCode = exitCode;
    if (details !== undefined) this.details = details;
  }
}

function fail(exitCode, message, details) {
  throw new CanonicalDeliveryError(exitCode, message, details);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function snapshotExactDataObject(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, `${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key !== "string")) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, `${label} must not contain symbol keys`);
  }
  const observedKeys = ownKeys.map(String).sort();
  if (JSON.stringify(observedKeys) !== JSON.stringify(expectedKeys)) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, `${label} key set mismatch`, {
      expected: expectedKeys,
      observed: observedKeys,
    });
  }
  const snapshot = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      fail(EXIT_CODES.VERIFICATION_MISMATCH, `${label}.${key} must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function requireBoundedString(value, label, { min = 1, max = 1024, pattern = null } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max ||
      (pattern && !pattern.test(value))) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, `${label} is invalid`);
  }
}

function requireAbsolute(value, label) {
  requireBoundedString(value, label, { max: 4096 });
  if (!path.isAbsolute(value)) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, `${label} must be absolute`);
  }
}

function requireIso(value, label) {
  requireBoundedString(value, label, { max: 64 });
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, `${label} must be canonical ISO-8601`);
  }
}

function normalizeBuildIdentity(value) {
  const raw = typeof value === "number" ? String(value) : value;
  requireBoundedString(raw, "buildTs", {
    min: 10,
    max: 20,
    pattern: /^\d+$/u,
  });
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || !Number.isSafeInteger(numeric) || numeric <= 0) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "buildTs must be a positive safe integer");
  }
  let buildIso;
  try {
    buildIso = new Date(numeric).toISOString();
  } catch {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "buildTs is outside the canonical ISO range");
  }
  return deepFreeze({ buildTs: raw, buildIso });
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function safeJsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function sanitizedGitEnvironment(environment = process.env) {
  const safe = Object.create(null);
  for (const name of ["TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE"]) {
    if (typeof environment[name] === "string" && environment[name]) safe[name] = environment[name];
  }
  safe.GIT_CONFIG_NOSYSTEM = "1";
  safe.GIT_CONFIG_GLOBAL = "/dev/null";
  safe.GIT_CONFIG_SYSTEM = "/dev/null";
  safe.GIT_CONFIG_COUNT = "0";
  safe.GIT_TERMINAL_PROMPT = "0";
  return Object.freeze(safe);
}

export function attestGitExecutableCandidate(candidate) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate) ||
      !TRUSTED_GIT_CANDIDATES.includes(candidate)) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "Git executable is not in the production allow-list", { candidate });
  }
  let stat;
  try { stat = fs.lstatSync(candidate); } catch {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "Approved Git executable is unavailable", { candidate });
  }
  if (stat.isSymbolicLink()) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH,
      "Symlinked Git candidates are rejected; production requires an approved regular executable", { candidate });
  }
  if (!stat.isFile() || (stat.mode & 0o111) === 0) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "Approved Git path is not a regular executable", { candidate });
  }
  const realpath = fs.realpathSync.native(candidate);
  if (realpath !== candidate) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "Approved Git executable realpath changed", { candidate, realpath });
  }
  let version;
  try {
    version = execFileSync(realpath, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
      killSignal: "SIGTERM",
      env: sanitizedGitEnvironment(),
    }).trim();
  } catch (error) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "Approved Git executable failed its version attestation", {
      candidate,
      status: error?.status ?? null,
    });
  }
  if (!/^git version \d+(?:\.\d+)+(?:\s.*)?$/u.test(version)) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "Approved Git executable returned an unexpected version", {
      candidate,
      version,
    });
  }
  return deepFreeze({
    path: candidate,
    realpath,
    version,
    sha256: sha256(fs.readFileSync(realpath)),
    device: String(stat.dev),
    inode: String(stat.ino),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  });
}

function resolveTrustedGitExecutable() {
  const failures = [];
  for (const candidate of TRUSTED_GIT_CANDIDATES) {
    try { return attestGitExecutableCandidate(candidate); } catch (error) {
      failures.push({ candidate, message: error.message });
    }
  }
  fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "No approved regular Git executable is available", { failures });
}

export const TRUSTED_GIT_EXECUTABLE_IDENTITY = resolveTrustedGitExecutable();

function observedGitExecutableIdentity() {
  const stat = fs.lstatSync(TRUSTED_GIT_EXECUTABLE_IDENTITY.realpath);
  return {
    realpath: fs.realpathSync.native(TRUSTED_GIT_EXECUTABLE_IDENTITY.realpath),
    sha256: sha256(fs.readFileSync(TRUSTED_GIT_EXECUTABLE_IDENTITY.realpath)),
    device: String(stat.dev),
    inode: String(stat.ino),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

export function assertTrustedGitExecutableIdentity(observed = observedGitExecutableIdentity()) {
  for (const key of ["realpath", "sha256", "device", "inode", "size", "mtimeMs"]) {
    if (observed?.[key] !== TRUSTED_GIT_EXECUTABLE_IDENTITY[key]) {
      fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "Pinned Git executable identity drifted during the process", {
        key,
        expected: TRUSTED_GIT_EXECUTABLE_IDENTITY[key],
        observed: observed?.[key] ?? null,
      });
    }
  }
  return true;
}

export function assertAllowedReadOnlyGitCommand(args) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string" || arg.includes("\0"))) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "Git command arguments must be plain strings", { args });
  }
  const key = args.join("\0");
  const mergeBaseAllowed = args.length === 4 && args[0] === "merge-base" &&
    args[1] === "--is-ancestor" && FULL_COMMIT_PATTERN.test(args[2]) &&
    (args[3] === "HEAD" || FULL_COMMIT_PATTERN.test(args[3]));
  if (!EXACT_READ_ONLY_GIT_COMMANDS.includes(key) && !mergeBaseAllowed) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH,
      "Git execution is restricted to exact shared read-only command shapes", { args });
  }
  return true;
}

export function runPinnedReadOnlyGit(cwd, args, {
  allowFailure = false,
  allowedFailureStatuses = allowFailure ? [1] : [],
} = {}) {
  assertAllowedReadOnlyGitCommand(args);
  assertTrustedGitExecutableIdentity();
  try {
    return execFileSync(TRUSTED_GIT_EXECUTABLE_IDENTITY.realpath, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
      killSignal: "SIGTERM",
      env: sanitizedGitEnvironment(),
    }).trim();
  } catch (error) {
    if (allowedFailureStatuses.includes(error?.status)) return null;
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, `git ${args.join(" ")} failed`, {
      cwd,
      status: error?.status ?? null,
    });
  }
}

function gitIsAncestor(cwd, ancestor, descendant) {
  return runPinnedReadOnlyGit(cwd, ["merge-base", "--is-ancestor", ancestor, descendant],
    { allowFailure: true }) !== null;
}

const runGit = runPinnedReadOnlyGit;

export function normalizeRealAware(inputPath, { cwd = process.cwd() } = {}) {
  requireBoundedString(inputPath, "path", { max: 4096 });
  const absolute = path.resolve(cwd, inputPath);
  let cursor = absolute;
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

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isDirectSiblingVariant(relative, baseName) {
  const first = relative.split(path.sep)[0];
  return first === baseName ||
    first.startsWith(`${baseName}.staging-`) ||
    first.startsWith(`${baseName}.retired-`);
}

function isExtensionVariantName(variant) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*(?:(?:\.staging-|\.retired-)[A-Za-z0-9._-]+)?$/u
    .test(variant) && variant !== "README";
}

export function classifyDeliveryDestination({
  destination,
  authoritativeRepositoryRoot,
}) {
  const normalizedDestination = normalizeRealAware(destination);
  const authoritativeRoot = normalizeRealAware(authoritativeRepositoryRoot);
  const devServer = path.join(authoritativeRoot, "apps", "dev-server");
  const chatgptExtensions = path.join(authoritativeRoot, "apps", "extensions", "chatgpt");
  const chromeExtensions = path.join(chatgptExtensions, "chrome");

  let classification = DESTINATION_CLASS.LOCAL;
  let matchedRule = null;

  if (normalizedDestination === devServer) {
    classification = DESTINATION_CLASS.CANONICAL;
    matchedRule = "authoritative-dev-server-parent";
  } else if (isWithin(devServer, normalizedDestination)) {
    const relative = path.relative(devServer, normalizedDestination);
    if (isDirectSiblingVariant(relative, "alias")) {
      classification = DESTINATION_CLASS.CANONICAL;
      matchedRule = "authoritative-alias";
    } else if (isDirectSiblingVariant(relative, "dev_output")) {
      classification = DESTINATION_CLASS.CANONICAL;
      matchedRule = "authoritative-dev-output";
    }
  }

  if (classification === DESTINATION_CLASS.LOCAL &&
      (normalizedDestination === chatgptExtensions ||
       normalizedDestination === chromeExtensions)) {
    classification = DESTINATION_CLASS.CANONICAL;
    matchedRule = "authoritative-extension-parent";
  } else if (classification === DESTINATION_CLASS.LOCAL &&
             isWithin(chromeExtensions, normalizedDestination)) {
    const relative = path.relative(chromeExtensions, normalizedDestination);
    const variant = relative.split(path.sep)[0];
    if (isExtensionVariantName(variant)) {
      classification = DESTINATION_CLASS.CANONICAL;
      matchedRule = "authoritative-extension-variant";
    }
  }

  return deepFreeze({
    classification,
    leaseRequiredInFutureEnforcement: classification === DESTINATION_CLASS.CANONICAL,
    normalizedDestination,
    authoritativeRepositoryRoot: authoritativeRoot,
    matchedRule,
  });
}

export function validateExpectedExtensionOutput({
  expectedExtensionOutput,
  authoritativeRepositoryRoot,
}) {
  requireAbsolute(expectedExtensionOutput, "expectedExtensionOutput");
  const normalized = normalizeRealAware(expectedExtensionOutput);
  const authoritativeRoot = normalizeRealAware(authoritativeRepositoryRoot);
  const chromeExtensions = path.join(
    authoritativeRoot,
    "apps",
    "extensions",
    "chatgpt",
    "chrome",
  );
  const relative = path.relative(chromeExtensions, normalized);
  const parts = relative.split(path.sep).filter(Boolean);
  const classification = classifyDeliveryDestination({
    destination: normalized,
    authoritativeRepositoryRoot: authoritativeRoot,
  });
  if (classification.classification !== DESTINATION_CLASS.CANONICAL ||
      classification.matchedRule !== "authoritative-extension-variant" ||
      parts.length !== 1 ||
      !isExtensionVariantName(parts[0])) {
    fail(
      EXIT_CODES.PATH_COUPLING_VIOLATION,
      "expectedExtensionOutput must be an accepted canonical extension variant",
      { expectedExtensionOutput: normalized },
    );
  }
  return normalized;
}

export function discoverRegisteredWorktreeRoots({ cwd = process.cwd() } = {}) {
  const output = runGit(cwd, ["worktree", "list", "--porcelain"]);
  const roots = [];
  for (const line of output.split(/\r?\n/u)) {
    if (!line.startsWith("worktree ")) continue;
    const rawRoot = line.slice("worktree ".length);
    if (!rawRoot) {
      fail(EXIT_CODES.PATH_COUPLING_VIOLATION, "Git reported an empty worktree root");
    }
    roots.push(normalizeRealAware(rawRoot));
  }
  if (roots.length === 0) {
    fail(EXIT_CODES.PATH_COUPLING_VIOLATION, "Git reported no registered worktrees");
  }
  const currentWorktree = normalizeRealAware(runGit(cwd, ["rev-parse", "--show-toplevel"]));
  if (!roots.includes(currentWorktree)) roots.push(currentWorktree);
  return deepFreeze([...new Set(roots)]);
}

function discoverAuthoritativeRepositoryRoot({
  cwd,
  gitCommonDirectory,
  registeredWorktreeRoots,
}) {
  if (path.basename(gitCommonDirectory) === ".git") {
    return normalizeRealAware(path.dirname(gitCommonDirectory));
  }
  const configuredWorktree = runGit(cwd, ["config", "--path", "--get", "core.worktree"],
    { allowFailure: true });
  if (configuredWorktree) {
    return validateConfiguredWorktree(configuredWorktree, {
      gitCommonDirectory,
      registeredWorktreeRoots,
    });
  }
  const currentWorktree = normalizeRealAware(runGit(cwd, ["rev-parse", "--show-toplevel"]));
  if (registeredWorktreeRoots.length === 1 ||
      registeredWorktreeRoots[0] === gitCommonDirectory) {
    return currentWorktree;
  }
  return registeredWorktreeRoots[0];
}

export function validateConfiguredWorktree(configuredWorktree, {
  gitCommonDirectory,
  registeredWorktreeRoots,
}) {
  if (typeof configuredWorktree !== "string" || configuredWorktree.includes("\0") ||
      /[\r\n]/u.test(configuredWorktree) || configuredWorktree.length === 0 ||
      configuredWorktree.length > 4096) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "core.worktree returned an unexpected path value");
  }
  const resolved = path.isAbsolute(configuredWorktree)
    ? configuredWorktree
    : path.resolve(gitCommonDirectory, configuredWorktree);
  const normalized = normalizeRealAware(resolved);
  if (!registeredWorktreeRoots.includes(normalized)) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH,
      "core.worktree must resolve to an independently discovered registered worktree", {
        configuredWorktree,
        normalized,
      });
  }
  return normalized;
}

export function deriveSharedAnchor({
  cwd = process.cwd(),
  env = process.env,
  allowOverride = false,
} = {}) {
  const gitCommonDirectory = normalizeRealAware(
    runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]),
  );
  const registeredWorktreeRoots = discoverRegisteredWorktreeRoots({ cwd });
  const authoritativeRepositoryRoot = discoverAuthoritativeRepositoryRoot({
    cwd,
    gitCommonDirectory,
    registeredWorktreeRoots,
  });
  const cockpitProRoot = path.dirname(authoritativeRepositoryRoot);
  const defaultRoot = path.join(cockpitProRoot, ".h2o-canonical-delivery");
  const configured = env.H2O_CANONICAL_DELIVERY_ROOT;
  if (configured && !allowOverride) {
    fail(
      EXIT_CODES.PATH_COUPLING_VIOLATION,
      "H2O_CANONICAL_DELIVERY_ROOT requires explicit allowOverride acknowledgement",
    );
  }
  const root = normalizeRealAware(configured || defaultRoot, { cwd });
  const containingWorktree = registeredWorktreeRoots.find((worktreeRoot) =>
    isWithin(worktreeRoot, root));
  if (containingWorktree) {
    fail(EXIT_CODES.PATH_COUPLING_VIOLATION, "delivery anchor must remain outside every worktree", {
      root,
      authoritativeRepositoryRoot,
      containingWorktree,
    });
  }
  return deepFreeze({
    root,
    source: configured ? "explicit-override" : "git-common-dir",
    gitCommonDirectory,
    authoritativeRepositoryRoot,
    cockpitProRoot,
    registeredWorktreeRoots,
    overrideUsed: Boolean(configured),
    gitExecutable: TRUSTED_GIT_EXECUTABLE_IDENTITY,
  });
}

export function discoverPublisherContext({ cwd = process.cwd() } = {}) {
  const worktreeRoot = normalizeRealAware(runGit(cwd, ["rev-parse", "--show-toplevel"]));
  const anchor = deriveSharedAnchor({ cwd, env: {}, allowOverride: false });
  const head = runGit(cwd, ["rev-parse", "HEAD"]);
  const mainHead = runGit(cwd, ["rev-parse", "refs/heads/main"]);
  const branch = runGit(cwd, ["branch", "--show-current"]) || "(detached)";
  const headIsAncestorOfMain = gitIsAncestor(cwd, head, mainHead);
  return deepFreeze({
    authoritativeRepositoryRoot: anchor.authoritativeRepositoryRoot,
    publisherRepositoryRoot: anchor.authoritativeRepositoryRoot,
    publisherWorktreeRoot: worktreeRoot,
    branch,
    head,
    mainHead,
    headIsAncestorOfMain,
  });
}

function trustedGitEligibility({
  authoritativeRepositoryRoot,
  publisherRepositoryRoot,
  publisherWorktreeRoot,
  head,
  branch,
}) {
  const authoritative = normalizeRealAware(authoritativeRepositoryRoot);
  const publisherRepository = normalizeRealAware(publisherRepositoryRoot);
  const publisherWorktree = normalizeRealAware(publisherWorktreeRoot);
  if (publisherRepository !== authoritative) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "publication must use the authoritative repository");
  }
  const observedWorktree = normalizeRealAware(
    runGit(publisherWorktree, ["rev-parse", "--show-toplevel"]),
  );
  if (observedWorktree !== publisherWorktree) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "publisher worktree identity does not match Git");
  }
  const observedAnchor = deriveSharedAnchor({
    cwd: publisherWorktree,
    env: {},
    allowOverride: false,
  });
  if (observedAnchor.authoritativeRepositoryRoot !== authoritative) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "publisher does not belong to the authoritative repository");
  }
  const observedHead = runGit(publisherWorktree, ["rev-parse", "HEAD"]);
  if (observedHead !== head) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "publisher HEAD does not match executable Git state");
  }
  const observedBranch = runGit(publisherWorktree, ["branch", "--show-current"]) || "(detached)";
  if (observedBranch !== branch) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "publisher branch does not match executable Git state");
  }
  const mainHead = runGit(authoritative, ["rev-parse", AUTHORITATIVE_MAIN_REF]);
  return deepFreeze({
    authoritative,
    publisherRepository,
    publisherWorktree,
    head: observedHead,
    branch: observedBranch,
    mainHead,
    headIsAncestorOfMain: gitIsAncestor(authoritative, observedHead, mainHead),
  });
}

function detectBootIdentity(nowMs, hostname) {
  try {
    const linuxBootId = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
    if (/^[0-9a-f-]{32,64}$/iu.test(linuxBootId)) {
      return `${hostname}:linux:${linuxBootId.toLowerCase()}`;
    }
  } catch {}
  try {
    const macBoot = execFileSync("/usr/sbin/sysctl", ["-n", "kern.boottime"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
      killSignal: "SIGTERM",
    }).trim();
    const seconds = macBoot.match(/\bsec\s*=\s*(\d+)/u)?.[1];
    if (seconds) return `${hostname}:macos:${seconds}`;
  } catch {}
  try {
    const bootStartedAt = Math.max(0, Math.floor(nowMs - os.uptime() * 1000));
    return `${hostname}:uptime:${Math.floor(bootStartedAt / 1000)}`;
  } catch {}
  for (const candidate of ["/private/var/run", "/var/run", "/"]) {
    try {
      const stat = fs.statSync(candidate);
      const stableTime = Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0
        ? stat.birthtimeMs
        : stat.ctimeMs;
      if (Number.isFinite(stableTime) && stableTime > 0) {
        return `${hostname}:filesystem-fallback:${Math.floor(stableTime)}`;
      }
    } catch {}
  }
  return `${hostname}:degraded-boot-identity`;
}

export function currentProcessIdentity(nowMs = Date.now()) {
  const processStartedAt = Math.max(0, Math.floor(nowMs - process.uptime() * 1000));
  const hostname = os.hostname();
  return deepFreeze({
    pid: process.pid,
    processStartIdentity: `${process.pid}:${processStartedAt}`,
    hostname,
    bootIdentity: detectBootIdentity(nowMs, hostname),
  });
}

export function validateCanaryApproval(input) {
  const snapshot = snapshotExactDataObject(input, APPROVAL_KEYS, "canary approval");
  if (snapshot.schemaVersion !== APPROVAL_SCHEMA_VERSION) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "unsupported canary approval schema");
  }
  requireBoundedString(snapshot.approvalRef, "approvalRef", {
    max: 160,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
  });
  requireBoundedString(snapshot.approvedHead, "approvedHead", {
    min: 40,
    max: 64,
    pattern: /^[0-9a-f]+$/u,
  });
  requireAbsolute(snapshot.approvedWorktreeRoot, "approvedWorktreeRoot");
  requireBoundedString(snapshot.purpose, "purpose", { max: 240 });
  requireBoundedString(snapshot.lane, "lane", { max: 120 });
  requireBoundedString(snapshot.approver, "approver", { max: 240 });
  requireIso(snapshot.approvedAt, "approvedAt");
  requireIso(snapshot.expiresAt, "expiresAt");
  if (Date.parse(snapshot.expiresAt) <= Date.parse(snapshot.approvedAt)) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "approval expiry must follow approval time");
  }
  return deepFreeze(safeJsonClone(snapshot));
}

export function evaluateEligibility({
  policy = "default",
  authoritativeRepositoryRoot,
  publisherRepositoryRoot,
  publisherWorktreeRoot,
  head,
  branch,
  purpose,
  lane,
  approval = null,
  nowMs = Date.now(),
}) {
  requireBoundedString(head, "head", { min: 40, max: 64, pattern: /^[0-9a-f]+$/u });
  requireBoundedString(branch, "branch", { max: 240 });
  requireBoundedString(purpose, "purpose", { max: 240 });
  requireBoundedString(lane, "lane", { max: 120 });
  const git = trustedGitEligibility({
    authoritativeRepositoryRoot,
    publisherRepositoryRoot,
    publisherWorktreeRoot,
    head,
    branch,
  });

  if (policy === "default") {
    if (git.publisherWorktree !== git.authoritative) {
      fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "default publication requires the authoritative worktree");
    }
    if (!git.headIsAncestorOfMain) {
      fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "publisher HEAD is not main or an ancestor of main");
    }
    return deepFreeze({
      policy,
      approvedHead: git.head,
      headIsAncestorOfMain: true,
      approvalRef: null,
      nonMainApprovedCanary: false,
      mainHead: git.mainHead,
    });
  }

  if (policy !== "pre-merge-canary") {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, `unknown eligibility policy: ${policy}`);
  }
  const normalizedApproval = validateCanaryApproval(approval);
  if (Date.parse(normalizedApproval.expiresAt) <= nowMs) {
    fail(EXIT_CODES.EXPIRED, "canary approval is expired");
  }
  if (normalizedApproval.approvedHead !== git.head ||
      normalizeRealAware(normalizedApproval.approvedWorktreeRoot) !== git.publisherWorktree ||
      normalizedApproval.purpose !== purpose ||
      normalizedApproval.lane !== lane) {
    fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "canary approval does not exactly bind this publication");
  }
  return deepFreeze({
    policy,
    approvedHead: git.head,
    headIsAncestorOfMain: git.headIsAncestorOfMain,
    approvalRef: normalizedApproval.approvalRef,
    nonMainApprovedCanary: git.head !== git.mainHead,
    mainHead: git.mainHead,
  });
}

export function validateLeaseRecord(input) {
  const snapshot = snapshotExactDataObject(input, LEASE_KEYS, "lease");
  if (snapshot.schemaVersion !== LEASE_SCHEMA_VERSION) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "unsupported lease schema");
  }
  requireBoundedString(snapshot.sessionId, "sessionId", {
    max: 80,
    pattern: /^[0-9a-f-]+$/u,
  });
  requireBoundedString(snapshot.ownershipTokenSha256, "ownershipTokenSha256", {
    min: 64,
    max: 64,
    pattern: /^[0-9a-f]{64}$/u,
  });
  requireBoundedString(snapshot.tokenCorrelationPrefix, "tokenCorrelationPrefix", {
    min: 8,
    max: 16,
    pattern: /^[0-9a-f]+$/u,
  });
  if (!snapshot.ownershipTokenSha256.startsWith(snapshot.tokenCorrelationPrefix)) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "token correlation prefix does not match token hash");
  }
  for (const key of [
    "canonicalRoot",
    "publisherRepositoryRoot",
    "publisherWorktreeRoot",
    "expectedExtensionOutput",
  ]) requireAbsolute(snapshot[key], key);
  requireBoundedString(snapshot.branch, "branch", { max: 240 });
  requireBoundedString(snapshot.approvedHead, "approvedHead", {
    min: 40,
    max: 64,
    pattern: /^[0-9a-f]+$/u,
  });
  if (typeof snapshot.headIsAncestorOfMain !== "boolean") {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "headIsAncestorOfMain must be boolean");
  }
  if (snapshot.approvalRef !== null) {
    requireBoundedString(snapshot.approvalRef, "approvalRef", {
      max: 160,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
    });
  }
  requireBoundedString(snapshot.purpose, "purpose", { max: 240 });
  requireBoundedString(snapshot.lane, "lane", { max: 120 });
  if (!Number.isSafeInteger(snapshot.pid) || snapshot.pid <= 0) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "pid must be a positive safe integer");
  }
  requireBoundedString(snapshot.processStartIdentity, "processStartIdentity", { max: 240 });
  requireBoundedString(snapshot.hostname, "hostname", { max: 240 });
  requireBoundedString(snapshot.bootIdentity, "bootIdentity", { max: 240 });
  requireIso(snapshot.acquiredAt, "acquiredAt");
  requireIso(snapshot.heartbeatAt, "heartbeatAt");
  requireIso(snapshot.expiresAt, "expiresAt");
  if (!Number.isSafeInteger(snapshot.heartbeatCounter) || snapshot.heartbeatCounter < 0) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "heartbeatCounter must be a nonnegative safe integer");
  }
  if (Date.parse(snapshot.heartbeatAt) < Date.parse(snapshot.acquiredAt) ||
      Date.parse(snapshot.expiresAt) <= Date.parse(snapshot.heartbeatAt)) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "lease timestamps are inconsistent");
  }
  const buildIdentity = normalizeBuildIdentity(snapshot.buildTs);
  requireIso(snapshot.buildIso, "buildIso");
  if (buildIdentity.buildIso !== snapshot.buildIso) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "buildIso does not correspond to buildTs");
  }
  const staging = snapshotExactDataObject(
    snapshot.stagingDirectoryNames,
    STAGING_KEYS,
    "stagingDirectoryNames",
  );
  for (const value of Object.values(staging)) {
    requireBoundedString(value, "staging directory name", {
      max: 240,
      pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
    });
    if (path.basename(value) !== value) {
      fail(EXIT_CODES.VERIFICATION_MISMATCH, "staging directory names must be basenames");
    }
  }
  if (!["held", "renewed"].includes(snapshot.lifecycleState)) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "unsupported lifecycleState");
  }
  snapshot.stagingDirectoryNames = staging;
  return deepFreeze(safeJsonClone(snapshot));
}

function leaseDirectory(anchorRoot) {
  return path.join(normalizeRealAware(anchorRoot), ACTIVE_LEASE_DIRECTORY);
}

function leaseMetadataPath(anchorRoot) {
  return path.join(leaseDirectory(anchorRoot), LEASE_METADATA_FILE);
}

function ensureAnchorRoot(anchorRoot) {
  const normalized = path.resolve(anchorRoot);
  fs.mkdirSync(normalized, { recursive: true, mode: 0o700 });
  return normalizeRealAware(normalized);
}

function atomicWriteJson(target, value, { exclusive = false } = {}) {
  const directory = path.dirname(target);
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`,
  );
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    if (exclusive) {
      try {
        fs.linkSync(temporary, target);
      } catch (error) {
        if (error?.code === "EEXIST") {
          fail(EXIT_CODES.ABSENT_OR_CONTENDED, "target already exists");
        }
        throw error;
      }
      fs.unlinkSync(temporary);
      return;
    }
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function removeLeaseDirectory(anchorRoot) {
  fs.rmSync(leaseDirectory(anchorRoot), { recursive: true, force: false });
}

function boundedErrorMessage(error) {
  const message = error?.message || String(error);
  return message.slice(0, 500);
}

function leaseDirectoryInventory(directory) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    return deepFreeze({
      readable: false,
      error: boundedErrorMessage(error),
      entries: [],
      truncated: false,
    });
  }
  const limited = entries
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 128)
    .map((entry) => {
      const target = path.join(directory, entry.name);
      let stat = null;
      try { stat = fs.lstatSync(target); } catch {}
      return {
        name: entry.name.slice(0, 240),
        type: entry.isFile()
          ? "file"
          : entry.isDirectory()
            ? "directory"
            : entry.isSymbolicLink()
              ? "symlink"
              : "other",
        size: stat?.size ?? null,
        mtimeMs: stat ? Math.floor(stat.mtimeMs) : null,
      };
    });
  return deepFreeze({
    readable: true,
    error: null,
    entries: limited,
    truncated: entries.length > limited.length,
  });
}

function redactedLeaseSnapshot(lease) {
  return deepFreeze({
    sessionId: lease.sessionId,
    canonicalRoot: lease.canonicalRoot,
    publisherRepositoryRoot: lease.publisherRepositoryRoot,
    publisherWorktreeRoot: lease.publisherWorktreeRoot,
    branch: lease.branch,
    approvedHead: lease.approvedHead,
    headIsAncestorOfMain: lease.headIsAncestorOfMain,
    approvalRef: lease.approvalRef,
    purpose: lease.purpose,
    lane: lease.lane,
    acquiredAt: lease.acquiredAt,
    heartbeatAt: lease.heartbeatAt,
    heartbeatCounter: lease.heartbeatCounter,
    expiresAt: lease.expiresAt,
    buildTs: lease.buildTs,
    buildIso: lease.buildIso,
    lifecycleState: lease.lifecycleState,
    stagingDirectoryNames: safeJsonClone(lease.stagingDirectoryNames),
    expectedExtensionOutput: lease.expectedExtensionOutput,
  });
}

function inspectLeaseDirectory(anchorRoot) {
  const directory = leaseDirectory(anchorRoot);
  let directoryStat;
  try {
    directoryStat = fs.lstatSync(directory);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      return deepFreeze({
        kind: "corrupt",
        lease: null,
        corrupt: {
          reason: "lease-directory-unreadable",
          inventory: deepFreeze({
            readable: false,
            error: boundedErrorMessage(error),
            entries: [],
            truncated: false,
          }),
          metadataSha256: null,
          parseError: boundedErrorMessage(error),
          recoverableLease: null,
        },
      });
    }
    return deepFreeze({ kind: "absent", lease: null, corrupt: null });
  }
  if (!directoryStat.isDirectory()) {
    return deepFreeze({
      kind: "corrupt",
      lease: null,
      corrupt: {
        reason: "active-lease-not-directory",
        inventory: deepFreeze({
          readable: true,
          error: null,
          entries: [{
            name: path.basename(directory),
            type: directoryStat.isSymbolicLink() ? "symlink" : "other",
            size: directoryStat.size,
            mtimeMs: Math.floor(directoryStat.mtimeMs),
          }],
          truncated: false,
        }),
        metadataSha256: null,
        parseError: null,
        recoverableLease: null,
      },
    });
  }
  const inventory = leaseDirectoryInventory(directory);
  const metadataPath = leaseMetadataPath(anchorRoot);
  const metadataInventory = inventory.entries.find((entry) =>
    entry.name === LEASE_METADATA_FILE);
  if (!metadataInventory || metadataInventory.type !== "file") {
    return deepFreeze({
      kind: "corrupt",
      lease: null,
      corrupt: {
        reason: metadataInventory
          ? "lease-metadata-not-regular-file"
          : "lease-metadata-missing",
        inventory,
        metadataSha256: null,
        parseError: null,
        recoverableLease: null,
      },
    });
  }
  let metadataBytes = null;
  try {
    metadataBytes = fs.readFileSync(metadataPath);
  } catch (error) {
    return deepFreeze({
      kind: "corrupt",
      lease: null,
      corrupt: {
        reason: error?.code === "ENOENT"
          ? "lease-metadata-missing"
          : "lease-metadata-unreadable",
        inventory,
        metadataSha256: null,
        parseError: boundedErrorMessage(error),
        recoverableLease: null,
      },
    });
  }
  const metadataSha256 = sha256(metadataBytes);
  let parsed;
  try {
    parsed = JSON.parse(metadataBytes.toString("utf8"));
  } catch (error) {
    return deepFreeze({
      kind: "corrupt",
      lease: null,
      corrupt: {
        reason: "lease-metadata-malformed-json",
        inventory,
        metadataSha256,
        parseError: boundedErrorMessage(error),
        recoverableLease: null,
      },
    });
  }
  let lease;
  try {
    lease = validateLeaseRecord(parsed);
  } catch (error) {
    return deepFreeze({
      kind: "corrupt",
      lease: null,
      corrupt: {
        reason: "lease-metadata-invalid-schema",
        inventory,
        metadataSha256,
        parseError: boundedErrorMessage(error),
        recoverableLease: null,
      },
    });
  }
  const expectedInventory = inventory.readable &&
    inventory.entries.length === 1 &&
    inventory.entries[0].name === LEASE_METADATA_FILE &&
    inventory.entries[0].type === "file";
  if (!expectedInventory) {
    return deepFreeze({
      kind: "corrupt",
      lease: null,
      corrupt: {
        reason: "unexpected-initialization-residue",
        inventory,
        metadataSha256,
        parseError: null,
        recoverableLease: redactedLeaseSnapshot(lease),
      },
    });
  }
  return deepFreeze({ kind: "valid", lease, corrupt: null });
}

function readLease(anchorRoot) {
  const inspection = inspectLeaseDirectory(anchorRoot);
  if (inspection.kind === "absent") {
    fail(EXIT_CODES.ABSENT_OR_CONTENDED, "canonical delivery lease is absent");
  }
  if (inspection.kind === "corrupt") {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "canonical delivery lease is corrupt", {
      corrupt: inspection.corrupt,
    });
  }
  return inspection.lease;
}

const PROCESS_IDENTITY_KEYS = Object.freeze([
  "pid",
  "processStartIdentity",
  "hostname",
  "bootIdentity",
].sort());

function normalizeProcessIdentity(input) {
  const snapshot = snapshotExactDataObject(
    input,
    PROCESS_IDENTITY_KEYS,
    "processIdentity",
  );
  if (!Number.isSafeInteger(snapshot.pid) || snapshot.pid <= 0) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "processIdentity.pid must be positive");
  }
  for (const key of ["processStartIdentity", "hostname", "bootIdentity"]) {
    requireBoundedString(snapshot[key], `processIdentity.${key}`, { max: 240 });
  }
  return deepFreeze(safeJsonClone(snapshot));
}

function invokeFailureInjection(failureInjection, point) {
  if (failureInjection) failureInjection(point);
}

function cleanupFailedInitialization({
  directory,
  metadataPath,
  temporaryPath,
  expectedBytesSha256,
}) {
  for (const target of [temporaryPath, metadataPath]) {
    if (!target) continue;
    try {
      const bytes = fs.readFileSync(target);
      if (sha256(bytes) === expectedBytesSha256) fs.unlinkSync(target);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        // Leave unexpected residue for explicit corrupt-state recovery.
      }
    }
  }
  try {
    fs.rmdirSync(directory);
  } catch (error) {
    // Unexpected residue remains visible as corrupt state for evidence-gated recovery.
  }
}

export function acquireLease({
  anchorRoot,
  canonicalRoot,
  authoritativeRepositoryRoot,
  publisherRepositoryRoot,
  publisherWorktreeRoot,
  branch,
  head,
  approval = null,
  policy = "default",
  purpose,
  lane,
  buildTs,
  expectedExtensionOutput,
  ttlMs = DEFAULT_LEASE_TTL_MS,
  nowMs = Date.now(),
  processIdentity = currentProcessIdentity(nowMs),
  failureInjection = null,
}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "ttlMs must be a positive safe integer");
  }
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "nowMs must be a positive safe integer");
  }
  if (failureInjection !== null && typeof failureInjection !== "function") {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "failureInjection must be a function or null");
  }
  requireAbsolute(anchorRoot, "anchorRoot");
  requireAbsolute(canonicalRoot, "canonicalRoot");
  requireAbsolute(authoritativeRepositoryRoot, "authoritativeRepositoryRoot");
  requireAbsolute(publisherRepositoryRoot, "publisherRepositoryRoot");
  requireAbsolute(publisherWorktreeRoot, "publisherWorktreeRoot");
  requireBoundedString(branch, "branch", { max: 240 });
  requireBoundedString(purpose, "purpose", { max: 240 });
  requireBoundedString(lane, "lane", { max: 120 });
  const buildIdentity = normalizeBuildIdentity(buildTs);
  const normalizedProcessIdentity = normalizeProcessIdentity(processIdentity);
  const normalizedAuthoritativeRoot = normalizeRealAware(authoritativeRepositoryRoot);
  const normalizedExpectedExtensionOutput = validateExpectedExtensionOutput({
    expectedExtensionOutput,
    authoritativeRepositoryRoot: normalizedAuthoritativeRoot,
  });
  const eligibility = evaluateEligibility({
    policy,
    authoritativeRepositoryRoot: normalizedAuthoritativeRoot,
    publisherRepositoryRoot,
    publisherWorktreeRoot,
    head,
    branch,
    purpose,
    lane,
    approval,
    nowMs,
  });
  let acquiredAt;
  let expiresAt;
  try {
    acquiredAt = new Date(nowMs).toISOString();
    expiresAt = new Date(nowMs + ttlMs).toISOString();
  } catch {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "lease time range is invalid");
  }
  const token = crypto.randomBytes(MIN_TOKEN_BYTES).toString("base64url");
  const tokenHash = sha256(token);
  const sessionId = crypto.randomUUID();
  const record = validateLeaseRecord({
    schemaVersion: LEASE_SCHEMA_VERSION,
    sessionId,
    ownershipTokenSha256: tokenHash,
    tokenCorrelationPrefix: tokenHash.slice(0, 12),
    canonicalRoot: normalizeRealAware(canonicalRoot),
    publisherRepositoryRoot: normalizeRealAware(publisherRepositoryRoot),
    publisherWorktreeRoot: normalizeRealAware(publisherWorktreeRoot),
    branch,
    approvedHead: eligibility.approvedHead,
    headIsAncestorOfMain: eligibility.headIsAncestorOfMain,
    approvalRef: eligibility.approvalRef,
    purpose,
    lane,
    pid: normalizedProcessIdentity.pid,
    processStartIdentity: normalizedProcessIdentity.processStartIdentity,
    hostname: normalizedProcessIdentity.hostname,
    bootIdentity: normalizedProcessIdentity.bootIdentity,
    acquiredAt,
    heartbeatAt: acquiredAt,
    heartbeatCounter: 0,
    expiresAt,
    buildTs: buildIdentity.buildTs,
    buildIso: buildIdentity.buildIso,
    stagingDirectoryNames: {
      alias: `alias.staging-${sessionId}`,
      devOutput: `dev_output.staging-${sessionId}`,
      extension: `${path.basename(normalizedExpectedExtensionOutput)}.staging-${sessionId}`,
    },
    expectedExtensionOutput: normalizedExpectedExtensionOutput,
    lifecycleState: "held",
  });
  const metadataBytes = `${JSON.stringify(record, null, 2)}\n`;
  const metadataBytesSha256 = sha256(metadataBytes);
  const root = ensureAnchorRoot(anchorRoot);
  const directory = path.join(root, ACTIVE_LEASE_DIRECTORY);
  try {
    fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      fail(EXIT_CODES.ABSENT_OR_CONTENDED, "canonical delivery lease is already held");
    }
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "canonical delivery lease directory creation failed", {
      cause: boundedErrorMessage(error),
    });
  }

  const metadataPath = path.join(directory, LEASE_METADATA_FILE);
  const temporaryPath = path.join(directory, `.lease.tmp-${sessionId}`);
  try {
    invokeFailureInjection(failureInjection, "after-directory-creation");
    fs.writeFileSync(temporaryPath, metadataBytes, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    invokeFailureInjection(failureInjection, "after-temporary-metadata");
    fs.linkSync(temporaryPath, metadataPath);
    invokeFailureInjection(failureInjection, "after-metadata-publication");
    const published = validateLeaseRecord(JSON.parse(fs.readFileSync(metadataPath, "utf8")));
    if (published.sessionId !== record.sessionId ||
        sha256(fs.readFileSync(metadataPath)) !== metadataBytesSha256) {
      fail(EXIT_CODES.VERIFICATION_MISMATCH, "published lease metadata does not match acquisition");
    }
    invokeFailureInjection(failureInjection, "after-final-validation");
    fs.unlinkSync(temporaryPath);
    return deepFreeze({
      ownershipToken: token,
      tokenCorrelationPrefix: record.tokenCorrelationPrefix,
      lease: record,
      nonMainApprovedCanary: eligibility.nonMainApprovedCanary,
    });
  } catch (error) {
    cleanupFailedInitialization({
      directory,
      metadataPath,
      temporaryPath,
      expectedBytesSha256: metadataBytesSha256,
    });
    if (error instanceof CanonicalDeliveryError) throw error;
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "lease initialization failed", {
      cause: error?.message || String(error),
    });
  }
}

export function statusLease({
  anchorRoot,
  nowMs = Date.now(),
  currentBootIdentity = currentProcessIdentity(nowMs).bootIdentity,
} = {}) {
  const inspection = inspectLeaseDirectory(anchorRoot);
  if (inspection.kind === "absent") {
    return deepFreeze({
      state: "absent",
      exitCode: EXIT_CODES.ABSENT_OR_CONTENDED,
      expired: false,
      stale: false,
      staleReasons: [],
      lease: null,
      corrupt: null,
    });
  }
  if (inspection.kind === "corrupt") {
    return deepFreeze({
      state: "corrupt",
      exitCode: EXIT_CODES.VERIFICATION_MISMATCH,
      expired: false,
      stale: false,
      staleReasons: [],
      lease: null,
      corrupt: inspection.corrupt,
    });
  }
  const lease = inspection.lease;
  const staleReasons = [];
  if (Date.parse(lease.expiresAt) <= nowMs) staleReasons.push("expired");
  if (lease.bootIdentity !== currentBootIdentity) staleReasons.push("boot-mismatch");
  return deepFreeze({
    state: staleReasons.length ? "stale" : "held",
    exitCode: EXIT_CODES.SUCCESS,
    expired: staleReasons.includes("expired"),
    stale: staleReasons.length > 0,
    staleReasons,
    lease,
    corrupt: null,
  });
}

function requireToken(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) {
    fail(EXIT_CODES.TOKEN_INVALID, "ownership token is missing or invalid");
  }
}

export function verifyLease({
  anchorRoot,
  ownershipToken,
  nowMs = Date.now(),
  expected = {},
  currentBootIdentity = null,
}) {
  requireToken(ownershipToken);
  const lease = readLease(anchorRoot);
  const observedHash = sha256(ownershipToken);
  const expectedHash = Buffer.from(lease.ownershipTokenSha256, "hex");
  const actualHash = Buffer.from(observedHash, "hex");
  if (expectedHash.length !== actualHash.length ||
      !crypto.timingSafeEqual(expectedHash, actualHash)) {
    fail(EXIT_CODES.TOKEN_INVALID, "ownership token is missing or invalid");
  }
  if (Date.parse(lease.expiresAt) <= nowMs) {
    fail(EXIT_CODES.EXPIRED, "canonical delivery lease is expired");
  }
  if (currentBootIdentity !== null && lease.bootIdentity !== currentBootIdentity) {
    fail(EXIT_CODES.OWNER_MISMATCH, "lease boot identity no longer matches");
  }
  for (const key of ["pid", "processStartIdentity", "hostname", "bootIdentity"]) {
    if (expected[key] !== undefined && lease[key] !== expected[key]) {
      fail(EXIT_CODES.OWNER_MISMATCH, `lease owner mismatch: ${key}`);
    }
  }
  for (const key of [
    "publisherRepositoryRoot",
    "publisherWorktreeRoot",
    "approvedHead",
    "branch",
    "approvalRef",
  ]) {
    if (expected[key] !== undefined) {
      const actual = key.endsWith("Root") ? normalizeRealAware(lease[key]) : lease[key];
      const wanted = key.endsWith("Root") ? normalizeRealAware(expected[key]) : expected[key];
      if (actual !== wanted) {
        fail(EXIT_CODES.ELIGIBILITY_MISMATCH, `lease eligibility mismatch: ${key}`);
      }
    }
  }
  for (const key of ["sessionId", "buildTs", "expectedExtensionOutput", "canonicalRoot"]) {
    if (expected[key] !== undefined) {
      const actual = key.endsWith("Root") || key.endsWith("Output")
        ? normalizeRealAware(lease[key])
        : lease[key];
      const wanted = key.endsWith("Root") || key.endsWith("Output")
        ? normalizeRealAware(expected[key])
        : expected[key];
      if (actual !== wanted) {
        fail(EXIT_CODES.VERIFICATION_MISMATCH, `lease verification mismatch: ${key}`);
      }
    }
  }
  return lease;
}

export function renewLease({
  anchorRoot,
  ownershipToken,
  ttlMs = DEFAULT_LEASE_TTL_MS,
  nowMs = Date.now(),
}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "ttlMs must be a positive safe integer");
  }
  const lease = verifyLease({ anchorRoot, ownershipToken, nowMs });
  const renewed = validateLeaseRecord({
    ...safeJsonClone(lease),
    heartbeatAt: new Date(nowMs).toISOString(),
    heartbeatCounter: lease.heartbeatCounter + 1,
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    lifecycleState: "renewed",
  });
  atomicWriteJson(leaseMetadataPath(anchorRoot), renewed);
  return renewed;
}

export function releaseLease({
  anchorRoot,
  ownershipToken,
  nowMs = Date.now(),
}) {
  const lease = verifyLease({ anchorRoot, ownershipToken, nowMs });
  removeLeaseDirectory(anchorRoot);
  return deepFreeze({
    released: true,
    sessionId: lease.sessionId,
    tokenCorrelationPrefix: lease.tokenCorrelationPrefix,
  });
}

export function forceReleaseLease({
  anchorRoot,
  reason,
  evidence,
  nowMs = Date.now(),
  actorProcessIdentity = currentProcessIdentity(nowMs),
  auditFailureInjection = null,
}) {
  requireBoundedString(reason, "force-release reason", { min: 8, max: 500 });
  requireBoundedString(evidence, "force-release evidence", { min: 8, max: 2000 });
  if (auditFailureInjection !== null && typeof auditFailureInjection !== "function") {
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "auditFailureInjection must be a function or null");
  }
  const actor = normalizeProcessIdentity(actorProcessIdentity);
  const currentBootIdentity = currentProcessIdentity(nowMs).bootIdentity;
  const status = statusLease({ anchorRoot, nowMs, currentBootIdentity });
  if (status.state === "absent") {
    fail(EXIT_CODES.ABSENT_OR_CONTENDED, "canonical delivery lease is absent");
  }
  if (status.state === "held") {
    fail(EXIT_CODES.OWNER_MISMATCH, "active lease is not eligible for force release");
  }
  const stateFingerprint = sha256(JSON.stringify({
    state: status.state,
    lease: status.lease,
    corrupt: status.corrupt,
  }));
  const auditDirectory = path.join(ensureAnchorRoot(anchorRoot), "audit");
  fs.mkdirSync(auditDirectory, { recursive: true, mode: 0o700 });
  const audit = deepFreeze({
    schemaVersion: 1,
    event: "force-release",
    priorState: status.state,
    sessionId: status.lease?.sessionId ?? status.corrupt?.recoverableLease?.sessionId ?? null,
    reason,
    evidenceSha256: sha256(evidence),
    staleReasons: status.staleReasons,
    priorLease: status.lease ? redactedLeaseSnapshot(status.lease) : null,
    corrupt: status.corrupt
      ? {
          reason: status.corrupt.reason,
          inventory: status.corrupt.inventory,
          metadataSha256: status.corrupt.metadataSha256,
          parseError: status.corrupt.parseError,
          recoverableLease: status.corrupt.recoverableLease,
        }
      : null,
    actor,
    occurredAt: new Date(nowMs).toISOString(),
  });
  const auditIdentity = status.lease?.sessionId ||
    status.corrupt?.recoverableLease?.sessionId ||
    `corrupt-${crypto.randomUUID()}`;
  try {
    if (auditFailureInjection) auditFailureInjection("before-audit-write");
    atomicWriteJson(
      path.join(auditDirectory, `force-release-${auditIdentity}.json`),
      audit,
      { exclusive: true },
    );
  } catch (error) {
    if (error instanceof CanonicalDeliveryError) throw error;
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "force-release audit publication failed", {
      cause: boundedErrorMessage(error),
    });
  }
  const confirmed = statusLease({ anchorRoot, nowMs, currentBootIdentity });
  const confirmedFingerprint = sha256(JSON.stringify({
    state: confirmed.state,
    lease: confirmed.lease,
    corrupt: confirmed.corrupt,
  }));
  if (confirmedFingerprint !== stateFingerprint) {
    fail(EXIT_CODES.OWNER_MISMATCH, "lease changed during force-release audit");
  }
  removeLeaseDirectory(anchorRoot);
  return audit;
}

export function approveCanary({
  anchorRoot,
  approvalRef,
  approvedHead,
  approvedWorktreeRoot,
  purpose,
  lane,
  approver,
  approvedAt = new Date().toISOString(),
  expiresAt,
}) {
  const approval = validateCanaryApproval({
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvalRef,
    approvedHead,
    approvedWorktreeRoot: normalizeRealAware(approvedWorktreeRoot),
    purpose,
    lane,
    approver,
    approvedAt,
    expiresAt,
  });
  const directory = path.join(ensureAnchorRoot(anchorRoot), "approvals");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  atomicWriteJson(path.join(directory, `${approvalRef}.json`), approval, { exclusive: true });
  return approval;
}

export function loadCanaryApproval({ anchorRoot, approvalRef }) {
  requireBoundedString(approvalRef, "approvalRef", {
    max: 160,
    pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/u,
  });
  const target = path.join(normalizeRealAware(anchorRoot), "approvals", `${approvalRef}.json`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(EXIT_CODES.ELIGIBILITY_MISMATCH, "canary approval is absent");
    }
    fail(EXIT_CODES.VERIFICATION_MISMATCH, "canary approval is unreadable");
  }
  return validateCanaryApproval(parsed);
}

export function inspectDestinationCoupling({
  destination,
  authoritativeRepositoryRoot,
  lease = null,
}) {
  const classification = classifyDeliveryDestination({
    destination,
    authoritativeRepositoryRoot,
  });
  const sessionMatches = lease
    ? classification.classification === DESTINATION_CLASS.LOCAL ||
      isWithin(normalizeRealAware(lease.canonicalRoot), classification.normalizedDestination)
    : null;
  return deepFreeze({
    ...classification,
    enforcementEnabled: false,
    sessionPresent: Boolean(lease),
    sessionMatches,
  });
}
