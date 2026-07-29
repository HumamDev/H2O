#!/usr/bin/env node

import {
  CanonicalDeliveryError,
  DEFAULT_LEASE_TTL_MS,
  EXIT_CODES,
  acquireLease,
  approveCanary,
  deriveSharedAnchor,
  discoverPublisherContext,
  forceReleaseLease,
  loadCanaryApproval,
  releaseLease,
  renewLease,
  statusLease,
  verifyLease,
} from "./canonical-delivery-lib.mjs";

const COMMANDS = Object.freeze({
  acquire: new Set([
    "--allow-root-override",
    "--ack-foundation-real-anchor",
    "--canonical-root",
    "--purpose",
    "--lane",
    "--build-ts",
    "--expected-extension-output",
    "--policy",
    "--approval-ref",
    "--ttl-ms",
  ]),
  status: new Set(["--allow-root-override"]),
  verify: new Set(["--allow-root-override", "--token"]),
  renew: new Set([
    "--allow-root-override",
    "--ack-foundation-real-anchor",
    "--token",
    "--ttl-ms",
  ]),
  release: new Set([
    "--allow-root-override",
    "--ack-foundation-real-anchor",
    "--token",
  ]),
  "force-release": new Set([
    "--allow-root-override",
    "--ack-foundation-real-anchor",
    "--reason",
    "--evidence",
  ]),
  "approve-canary": new Set([
    "--allow-root-override",
    "--ack-foundation-real-anchor",
    "--approval-ref",
    "--head",
    "--worktree-root",
    "--purpose",
    "--lane",
    "--approver",
    "--expires-at",
  ]),
});

const BOOLEAN_FLAGS = new Set([
  "--allow-root-override",
  "--ack-foundation-real-anchor",
]);

function cliFailure(message, details) {
  throw new CanonicalDeliveryError(EXIT_CODES.VERIFICATION_MISMATCH, message, details);
}

function parseCommandLine(argv) {
  if (argv.length === 0) cliFailure("canonical-delivery command is required");
  const [command, ...rest] = argv;
  const allowed = COMMANDS[command];
  if (!allowed) cliFailure(`unknown or unavailable canonical-delivery command: ${command}`);
  const flags = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!flag.startsWith("--") || !allowed.has(flag)) {
      cliFailure(`unknown option for ${command}: ${flag}`);
    }
    if (flags.has(flag)) cliFailure(`duplicate option for ${command}: ${flag}`);
    if (BOOLEAN_FLAGS.has(flag)) {
      flags.set(flag, true);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      cliFailure(`option requires one value: ${flag}`);
    }
    flags.set(flag, value);
    index += 1;
  }
  return { command, flags };
}

function required(flags, name) {
  const value = flags.get(name);
  if (typeof value !== "string" || value.length === 0) {
    cliFailure(`required option is missing: ${name}`);
  }
  return value;
}

function integerOption(flags, name, fallback) {
  if (!flags.has(name)) return fallback;
  const raw = required(flags, name);
  if (!/^\d+$/u.test(raw)) cliFailure(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    cliFailure(`${name} must be a positive safe integer`);
  }
  return value;
}

function redactLease(lease) {
  if (!lease) return null;
  const { ownershipTokenSha256: _redacted, ...safe } = lease;
  return safe;
}

function output(value, exitCode = EXIT_CODES.SUCCESS) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = exitCode;
}

function anchorFor(flags) {
  return deriveSharedAnchor({
    cwd: process.cwd(),
    env: process.env,
    allowOverride: flags.get("--allow-root-override") === true,
  });
}

function requireMutationAcknowledgement(command, flags, anchor) {
  if (!anchor.overrideUsed && flags.get("--ack-foundation-real-anchor") !== true) {
    throw new CanonicalDeliveryError(
      EXIT_CODES.PATH_COUPLING_VIOLATION,
      `${command} requires --ack-foundation-real-anchor during the E1 foundation phase`,
    );
  }
}

function acquire(flags) {
  const anchor = anchorFor(flags);
  requireMutationAcknowledgement("acquire", flags, anchor);
  required(flags, "--build-ts");
  const buildTs = integerOption(flags, "--build-ts");
  const context = discoverPublisherContext({ cwd: process.cwd() });
  const policy = flags.get("--policy") || "default";
  let approval = null;
  if (policy === "pre-merge-canary") {
    approval = loadCanaryApproval({
      anchorRoot: anchor.root,
      approvalRef: required(flags, "--approval-ref"),
    });
  } else if (flags.has("--approval-ref")) {
    cliFailure("--approval-ref is valid only with --policy pre-merge-canary");
  }
  const result = acquireLease({
    anchorRoot: anchor.root,
    canonicalRoot: required(flags, "--canonical-root"),
    authoritativeRepositoryRoot: context.authoritativeRepositoryRoot,
    publisherRepositoryRoot: context.publisherRepositoryRoot,
    publisherWorktreeRoot: context.publisherWorktreeRoot,
    branch: context.branch,
    head: context.head,
    approval,
    policy,
    purpose: required(flags, "--purpose"),
    lane: required(flags, "--lane"),
    buildTs,
    expectedExtensionOutput: required(flags, "--expected-extension-output"),
    ttlMs: integerOption(flags, "--ttl-ms", DEFAULT_LEASE_TTL_MS),
  });
  output({
    ok: true,
    command: "acquire",
    exitCode: EXIT_CODES.SUCCESS,
    ownershipToken: result.ownershipToken,
    tokenReturnedOnce: true,
    tokenCorrelationPrefix: result.tokenCorrelationPrefix,
    nonMainApprovedCanary: result.nonMainApprovedCanary,
    lease: redactLease(result.lease),
  });
}

function status(flags) {
  const anchor = anchorFor(flags);
  const result = statusLease({ anchorRoot: anchor.root });
  output({
    ok: result.exitCode === EXIT_CODES.SUCCESS,
    command: "status",
    exitCode: result.exitCode,
    state: result.state,
    expired: result.expired,
    stale: result.stale,
    staleReasons: result.staleReasons,
    lease: redactLease(result.lease),
    corrupt: result.corrupt,
  }, result.exitCode);
}

function verify(flags) {
  const anchor = anchorFor(flags);
  const lease = verifyLease({
    anchorRoot: anchor.root,
    ownershipToken: required(flags, "--token"),
  });
  output({
    ok: true,
    command: "verify",
    exitCode: EXIT_CODES.SUCCESS,
    lease: redactLease(lease),
  });
}

function renew(flags) {
  const anchor = anchorFor(flags);
  requireMutationAcknowledgement("renew", flags, anchor);
  const lease = renewLease({
    anchorRoot: anchor.root,
    ownershipToken: required(flags, "--token"),
    ttlMs: integerOption(flags, "--ttl-ms", DEFAULT_LEASE_TTL_MS),
  });
  output({
    ok: true,
    command: "renew",
    exitCode: EXIT_CODES.SUCCESS,
    lease: redactLease(lease),
  });
}

function release(flags) {
  const anchor = anchorFor(flags);
  requireMutationAcknowledgement("release", flags, anchor);
  const result = releaseLease({
    anchorRoot: anchor.root,
    ownershipToken: required(flags, "--token"),
  });
  output({
    ok: true,
    command: "release",
    exitCode: EXIT_CODES.SUCCESS,
    ...result,
  });
}

function forceRelease(flags) {
  const anchor = anchorFor(flags);
  requireMutationAcknowledgement("force-release", flags, anchor);
  const result = forceReleaseLease({
    anchorRoot: anchor.root,
    reason: required(flags, "--reason"),
    evidence: required(flags, "--evidence"),
  });
  output({
    ok: true,
    command: "force-release",
    exitCode: EXIT_CODES.SUCCESS,
    audit: result,
  });
}

function approve(flags) {
  const anchor = anchorFor(flags);
  requireMutationAcknowledgement("approve-canary", flags, anchor);
  const approval = approveCanary({
    anchorRoot: anchor.root,
    approvalRef: required(flags, "--approval-ref"),
    approvedHead: required(flags, "--head"),
    approvedWorktreeRoot: required(flags, "--worktree-root"),
    purpose: required(flags, "--purpose"),
    lane: required(flags, "--lane"),
    approver: required(flags, "--approver"),
    expiresAt: required(flags, "--expires-at"),
  });
  output({
    ok: true,
    command: "approve-canary",
    exitCode: EXIT_CODES.SUCCESS,
    approval,
  });
}

function main() {
  const { command, flags } = parseCommandLine(process.argv.slice(2));
  if (command === "acquire") return acquire(flags);
  if (command === "status") return status(flags);
  if (command === "verify") return verify(flags);
  if (command === "renew") return renew(flags);
  if (command === "release") return release(flags);
  if (command === "force-release") return forceRelease(flags);
  if (command === "approve-canary") return approve(flags);
  cliFailure(`unreachable command: ${command}`);
}

try {
  main();
} catch (error) {
  const exitCode = error instanceof CanonicalDeliveryError
    ? error.exitCode
    : 1;
  output({
    ok: false,
    command: process.argv[2] || null,
    exitCode,
    error: {
      name: error?.name || "Error",
      message: error?.message || String(error),
      details: error?.details ?? null,
    },
  }, exitCode);
}
