import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CanonicalDeliveryError,
  DESTINATION_CLASS,
  EXIT_CODES,
  classifyDeliveryDestination,
  currentProcessIdentity,
  deriveSharedAnchor,
  discoverPublisherContext,
  normalizeRealAware,
  statusLease,
  verifyLease,
} from "./canonical-delivery-lib.mjs";

const PURPOSE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;

function guardError(exitCode, code, message, details = undefined) {
  const error = new CanonicalDeliveryError(
    exitCode,
    `${code}: ${message}`,
    details,
  );
  error.code = code;
  return error;
}

function requireEnvironment(environment) {
  if (
    environment === null ||
    typeof environment !== "object" ||
    Array.isArray(environment)
  ) {
    throw guardError(
      EXIT_CODES.VERIFICATION_MISMATCH,
      "invalid-delivery-write-environment",
      "Delivery-write environment must be an object.",
    );
  }
  return environment;
}

function requirePurpose(purpose) {
  if (typeof purpose !== "string" || !PURPOSE_PATTERN.test(purpose)) {
    throw guardError(
      EXIT_CODES.VERIFICATION_MISMATCH,
      "invalid-delivery-write-purpose",
      "Delivery-write purpose must be a bounded machine-readable string.",
    );
  }
  return purpose;
}

function optionalAssertion(environment, name) {
  if (!Object.prototype.hasOwnProperty.call(environment, name)) return null;
  const value = environment[name];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw guardError(
      EXIT_CODES.VERIFICATION_MISMATCH,
      "invalid-delivery-write-assertion",
      `${name} must be a string when supplied.`,
      { assertion: name },
    );
  }
  return value;
}

function assertEqual({
  actual,
  expected,
  exitCode,
  error,
  message,
  assertion,
}) {
  if (actual === null) return;
  if (actual !== expected) {
    throw guardError(exitCode, error, message, {
      assertion,
    });
  }
}

function failClosedContextError(code, message, error, details = undefined) {
  if (error instanceof CanonicalDeliveryError) {
    throw guardError(error.exitCode, code, message, {
      ...details,
      cause: error.message,
    });
  }
  throw guardError(
    EXIT_CODES.PATH_COUPLING_VIOLATION,
    code,
    message,
    details,
  );
}

function trustedWriterContext() {
  let modulePath;
  try {
    const spelledModulePath = fileURLToPath(import.meta.url);
    modulePath =
      typeof fs.realpathSync.native === "function"
        ? fs.realpathSync.native(spelledModulePath)
        : fs.realpathSync(spelledModulePath);
  } catch (error) {
    failClosedContextError(
      "trusted-writer-context-unavailable",
      "The canonical writer module real path could not be established.",
      error,
    );
  }

  try {
    return deriveSharedAnchor({
      cwd: path.dirname(modulePath),
      env: {},
      allowOverride: false,
    });
  } catch (error) {
    failClosedContextError(
      "trusted-writer-context-unavailable",
      "The canonical writer repository context could not be established.",
      error,
      { modulePath },
    );
  }
}

function repositoryDiscoveryError(message, error, details) {
  failClosedContextError(
    "destination-repository-discovery-failed",
    message,
    error,
    details,
  );
}

function nearestExistingDirectory(normalizedDestination) {
  let cursor = normalizedDestination;
  while (true) {
    try {
      const stat = fs.statSync(cursor);
      return stat.isDirectory() ? cursor : path.dirname(cursor);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        repositoryDiscoveryError(
          "The destination ancestor chain could not be inspected.",
          error,
          { cursor },
        );
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw guardError(
        EXIT_CODES.PATH_COUPLING_VIOLATION,
        "destination-repository-discovery-failed",
        "No existing directory was found on the destination ancestor chain.",
        { normalizedDestination },
      );
    }
    cursor = parent;
  }
}

function discoverDestinationRepositoryContexts(normalizedDestination) {
  const boundaries = [];
  let cursor = nearestExistingDirectory(normalizedDestination);

  while (true) {
    const marker = path.join(cursor, ".git");
    try {
      const stat = fs.lstatSync(marker);
      if (!stat.isDirectory() && !stat.isFile()) {
        throw guardError(
          EXIT_CODES.PATH_COUPLING_VIOLATION,
          "destination-repository-marker-invalid",
          "A destination ancestor has a .git marker that is neither a directory nor a file.",
          { repositoryBoundary: cursor },
        );
      }
      boundaries.push(cursor);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        if (error instanceof CanonicalDeliveryError) throw error;
        repositoryDiscoveryError(
          "A destination repository marker could not be inspected.",
          error,
          { repositoryBoundary: cursor },
        );
      }
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  const contexts = new Map();
  for (const repositoryBoundary of boundaries) {
    let anchor;
    try {
      anchor = deriveSharedAnchor({
        cwd: repositoryBoundary,
        env: {},
        allowOverride: false,
      });
    } catch (error) {
      failClosedContextError(
        "destination-repository-context-invalid",
        "A detected destination repository boundary could not be resolved by E1.",
        error,
        { repositoryBoundary },
      );
    }
    const key = JSON.stringify([
      anchor.authoritativeRepositoryRoot,
      anchor.root,
    ]);
    if (!contexts.has(key)) contexts.set(key, anchor);
  }
  return [...contexts.values()];
}

function classifyAgainstContexts(normalizedDestination, contexts) {
  const canonicalOwners = new Map();
  for (const context of contexts) {
    const result = classifyDeliveryDestination({
      destination: normalizedDestination,
      authoritativeRepositoryRoot: context.authoritativeRepositoryRoot,
    });
    if (result.classification !== DESTINATION_CLASS.CANONICAL) continue;
    const key = JSON.stringify([
      context.authoritativeRepositoryRoot,
      context.root,
    ]);
    if (!canonicalOwners.has(key)) {
      canonicalOwners.set(key, { anchor: context, result });
    }
  }
  return [...canonicalOwners.values()];
}

/**
 * Assert whether a generated-delivery destination may be mutated.
 *
 * Stage E2A permits LOCAL destinations immediately. CANONICAL destinations
 * are fully diagnosed against the committed lease/session contract and then
 * rejected until Stage E3 supplies a staging publication surface.
 */
export function assertDeliveryWritePermitted({
  destination,
  purpose,
  environment = process.env,
} = {}) {
  const checkedEnvironment = requireEnvironment(environment);
  const checkedPurpose = requirePurpose(purpose);
  const normalizedDestination = normalizeRealAware(destination);
  const writerAnchor = trustedWriterContext();
  const destinationAnchors =
    discoverDestinationRepositoryContexts(normalizedDestination);
  const contexts = new Map();
  for (const anchor of [writerAnchor, ...destinationAnchors]) {
    const key = JSON.stringify([
      anchor.authoritativeRepositoryRoot,
      anchor.root,
    ]);
    if (!contexts.has(key)) contexts.set(key, anchor);
  }
  const canonicalOwners = classifyAgainstContexts(
    normalizedDestination,
    contexts.values(),
  );

  if (canonicalOwners.length === 0) {
    return Object.freeze({
      classification: DESTINATION_CLASS.LOCAL,
      canonicalSession: null,
      liveWritePermitted: false,
    });
  }

  if (canonicalOwners.length > 1) {
    throw guardError(
      EXIT_CODES.PATH_COUPLING_VIOLATION,
      "canonical-delivery-owner-ambiguity",
      "The destination is canonical for more than one distinct repository owner.",
      {
        normalizedDestination,
        ownerCount: canonicalOwners.length,
        owners: canonicalOwners.map(({ anchor }) => ({
          authoritativeRepositoryRoot: anchor.authoritativeRepositoryRoot,
          anchorRoot: anchor.root,
        })),
      },
    );
  }

  const owner = canonicalOwners[0].anchor;
  const leaseStatus = statusLease({
    anchorRoot: owner.root,
    nowMs: Date.now(),
  });
  if (leaseStatus.state === "absent") {
    throw guardError(
      EXIT_CODES.ABSENT_OR_CONTENDED,
      "canonical-delivery-lease-absent",
      "Canonical delivery lease is absent.",
    );
  }
  if (leaseStatus.state === "corrupt") {
    throw guardError(
      EXIT_CODES.VERIFICATION_MISMATCH,
      "canonical-delivery-lease-corrupt",
      "Canonical delivery lease is corrupt.",
      { state: "corrupt" },
    );
  }

  const publisher = discoverPublisherContext({
    cwd: owner.authoritativeRepositoryRoot,
  });
  const ownershipToken = checkedEnvironment.H2O_CANONICAL_DELIVERY_TOKEN;
  const lease = verifyLease({
    anchorRoot: owner.root,
    ownershipToken,
    nowMs: Date.now(),
    currentBootIdentity: currentProcessIdentity().bootIdentity,
    expected: {
      canonicalRoot: owner.authoritativeRepositoryRoot,
      publisherRepositoryRoot: publisher.publisherRepositoryRoot,
      publisherWorktreeRoot: publisher.publisherWorktreeRoot,
      branch: publisher.branch,
      approvedHead: publisher.head,
    },
  });

  assertEqual({
    actual: optionalAssertion(
      checkedEnvironment,
      "H2O_DELIVERY_SESSION_ID",
    ),
    expected: lease.sessionId,
    exitCode: EXIT_CODES.VERIFICATION_MISMATCH,
    error: "canonical-delivery-session-assertion-mismatch",
    message: "Caller delivery-session assertion does not match the lease.",
    assertion: "H2O_DELIVERY_SESSION_ID",
  });
  assertEqual({
    actual: optionalAssertion(
      checkedEnvironment,
      "H2O_DELIVERY_APPROVED_HEAD",
    ),
    expected: lease.approvedHead,
    exitCode: EXIT_CODES.ELIGIBILITY_MISMATCH,
    error: "canonical-delivery-approved-head-assertion-mismatch",
    message: "Caller approved-HEAD assertion does not match the lease.",
    assertion: "H2O_DELIVERY_APPROVED_HEAD",
  });
  assertEqual({
    actual: optionalAssertion(checkedEnvironment, "H2O_BUILD_TS"),
    expected: lease.buildTs,
    exitCode: EXIT_CODES.VERIFICATION_MISMATCH,
    error: "canonical-delivery-build-marker-mismatch",
    message: "Caller build marker does not match the verified lease.",
    assertion: "H2O_BUILD_TS",
  });

  if (lease.purpose !== checkedPurpose) {
    throw guardError(
      EXIT_CODES.ELIGIBILITY_MISMATCH,
      "canonical-delivery-purpose-mismatch",
      "Writer purpose does not match the verified canonical session.",
      { purpose: checkedPurpose },
    );
  }

  throw guardError(
    EXIT_CODES.PATH_COUPLING_VIOLATION,
    "canonical-live-write-disabled-until-stage-e3",
    "Canonical live writes are disabled until Stage E3 staging is implemented.",
    {
      classification: DESTINATION_CLASS.CANONICAL,
      purpose: checkedPurpose,
      sessionId: lease.sessionId,
      liveWritePermitted: false,
    },
  );
}
