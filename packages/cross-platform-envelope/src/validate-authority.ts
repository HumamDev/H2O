/**
 * F10.2.1 — validateEnvelopeAuthority.
 *
 * Computes `effectiveAuthority` from the producer's declared authority
 * cross-checked against the F10.1 manifest and the consumer-supplied
 * known-snapshot set. Implements:
 *
 *   §4.1  kind ↔ authority matrix
 *   §4.2  capability ↔ kind matrix
 *   §4.3  surface ↔ authority sanity
 *   §4.4  declared vs effective authority
 *   §4.5  sourcePlatform-alone-is-insufficient
 *   §4.6  mobile-specific guards
 *   §4.7  native-extension-specific guards
 *   §4.8  version skew
 *   §6.6  stale-evidence-not-revalidated
 *
 * Pure function. No I/O. No Date.now(); callers pass `nowIso`.
 */

import {
  AUTHORITY_RANK,
  CAPABILITY_TO_KINDS,
  ENVELOPE_KIND_VERSION,
  ENVELOPE_SCHEMA,
  ENVELOPE_VERSION,
  MOBILE_ALLOWED_REDACTION_CLASSES,
  MOBILE_CACHE_BANNED_FIELDS,
  NATIVE_EXTENSION_SUBJECT_TYPE_ALLOWLIST,
  PLATFORM_ALLOWED_KINDS,
  SURFACE_TO_AUTHORITY,
  WRITE_CAPABLE_KINDS,
} from './constants';
import { isExpired } from './predicates';
import type {
  AuthorityLevel,
  AuthorityResult,
  BlockerCode,
  CrossPlatformEnvelope,
  PlatformCapabilityManifest,
  PlatformId,
} from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function payloadContainsBannedField(payload: unknown): boolean {
  const stack: unknown[] = [payload];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    if (isPlainObject(current)) {
      for (const key of Object.keys(current)) {
        if ((MOBILE_CACHE_BANNED_FIELDS as ReadonlyArray<string>).includes(key)) {
          return true;
        }
        stack.push(current[key]);
      }
    }
  }
  return false;
}

function operationLooksLikeDelete(envelope: CrossPlatformEnvelope): boolean {
  if (envelope.operationIntent === 'delete') return true;
  if (envelope.subjectType.startsWith('tombstone.')) return true;
  const op = envelope.operation.toLowerCase();
  if (op.includes('delete') || op.includes('tombstone')) return true;
  return false;
}

function lowerOf(a: AuthorityLevel, b: AuthorityLevel): AuthorityLevel {
  return AUTHORITY_RANK[a] <= AUTHORITY_RANK[b] ? a : b;
}

export interface ValidateAuthorityOptions {
  /**
   * Caller-supplied current ISO seconds UTC. If omitted, stale-envelope
   * detection is skipped (the validator never reads `Date.now()`).
   */
  nowIso?: string;
  /**
   * Consumer's own platform id. Currently informational; reserved for
   * future per-consumer policy without changing the validator's
   * canonical behavior.
   */
  consumerPlatformId?: PlatformId;
}

/**
 * Validate envelope authority and compute `effectiveAuthority`.
 *
 * @param envelope The envelope under validation. Must have already
 *   passed `validateEnvelopeBase` (structural integrity).
 * @param manifest The F10.1 platform capability manifest, keyed by
 *   `platformId`. The consumer constructs this from its own view of
 *   F10.1.
 * @param knownCapabilitySnapshotHashes Set of sha256-hex
 *   `capabilitySnapshotHash` values the consumer accepts. An envelope
 *   carrying a hash outside this set is either rejected
 *   (write-capable kinds) or downgraded to `read-only` (read-only
 *   kinds), per §4.5.
 * @param options Optional caller settings.
 */
export function validateEnvelopeAuthority(
  envelope: CrossPlatformEnvelope,
  manifest: PlatformCapabilityManifest,
  knownCapabilitySnapshotHashes: ReadonlySet<string>,
  options?: ValidateAuthorityOptions,
): AuthorityResult {
  const blockers: BlockerCode[] = [];
  const warnings: string[] = [];

  // ── 0. Schema skew (§4.8) ───────────────────────────────────────────
  if (envelope.schema !== ENVELOPE_SCHEMA) {
    blockers.push('envelope-schema-too-new');
  }
  if (envelope.envelopeVersion !== ENVELOPE_VERSION) {
    blockers.push('envelope-schema-too-new');
  }
  if (envelope.envelopeKindVersion !== ENVELOPE_KIND_VERSION) {
    blockers.push('envelope-schema-too-new');
  }

  // ── 1. Surface ↔ authority sanity (§4.3) ────────────────────────────
  const requiredAuthority = SURFACE_TO_AUTHORITY[envelope.sourcePlatform.surfaceKind];
  if (requiredAuthority !== envelope.declaredAuthority) {
    blockers.push('surface-authority-mismatch');
  }

  // ── 2. Look up platform entry in manifest (§4.5) ────────────────────
  const platformEntry = manifest.platforms[envelope.sourcePlatform.platformId];

  // ── 3. capabilitySnapshotHash check (§4.5) ─────────────────────────
  const snapshotKnown = knownCapabilitySnapshotHashes.has(envelope.capabilitySnapshotHash);
  let downgradeForSnapshotUnknown: AuthorityLevel | null = null;
  if (!snapshotKnown) {
    const isWriteCapable = (WRITE_CAPABLE_KINDS as ReadonlyArray<string>).includes(envelope.kind);
    if (isWriteCapable) {
      blockers.push('capability-snapshot-unknown');
    } else {
      // Read-only kinds: warning + downgrade to read-only (§4.5).
      warnings.push('capability-snapshot-unknown-downgraded');
      downgradeForSnapshotUnknown = 'read-only';
    }
  }

  // ── 4. Capability ↔ platform allowlist (§4.2 / F10.1 manifest) ─────
  if (platformEntry) {
    const capValue = platformEntry.capabilities[envelope.capabilityUsed];
    const capAllowed = capValue !== undefined && capValue !== false;
    if (!capAllowed) {
      blockers.push('capability-not-on-platform-allowlist');
    } else {
      // ── 5. Capability ↔ kind (§4.2) ───────────────────────────────
      const allowedKinds = CAPABILITY_TO_KINDS[envelope.capabilityUsed];
      if (allowedKinds && !allowedKinds.includes(envelope.kind)) {
        blockers.push('capability-not-on-platform-allowlist');
      }
    }
  } else {
    // No manifest entry for the platform at all.
    blockers.push('capability-not-on-platform-allowlist');
  }

  // ── 6. Kind ↔ platform allowed-kinds (§4.1) ────────────────────────
  const platformAllowedKinds = PLATFORM_ALLOWED_KINDS[envelope.sourcePlatform.platformId];
  if (!platformAllowedKinds.includes(envelope.kind)) {
    blockers.push('platform-not-authorized-for-kind');
  }

  // ── 7. Mobile-specific guards (§4.6) ───────────────────────────────
  if (envelope.sourcePlatform.platformId === 'mobile') {
    // Mobile + applyEvent already caught by step 6, but emitting again
    // is harmless (dedupe at end).
    if (envelope.kind === 'applyEvent') {
      blockers.push('platform-not-authorized-for-kind');
    }
    if (!(MOBILE_ALLOWED_REDACTION_CLASSES as ReadonlyArray<string>).includes(envelope.redactionClass)) {
      blockers.push('mobile-must-redact');
    }
    if (payloadContainsBannedField(envelope.payload)) {
      blockers.push('mobile-payload-outside-allowlist');
    }
  }

  // ── 8. Native-extension guards (§4.7) ──────────────────────────────
  if (envelope.sourcePlatform.platformId === 'native-extension') {
    if (
      !(NATIVE_EXTENSION_SUBJECT_TYPE_ALLOWLIST as ReadonlyArray<string>).includes(envelope.subjectType)
    ) {
      blockers.push('native-extension-entity-outside-evidence-scope');
    }
    if (operationLooksLikeDelete(envelope)) {
      blockers.push('native-extension-not-authorized-for-tombstones');
    }
  }

  // ── 9. Stale-envelope check (§6.6) ─────────────────────────────────
  if (options?.nowIso && isExpired(envelope, options.nowIso)) {
    blockers.push('stale-evidence-not-revalidated');
  }

  // ── 10. Compute effectiveAuthority ─────────────────────────────────
  const dedupedBlockers = Array.from(new Set(blockers)) as BlockerCode[];

  let effectiveAuthority: AuthorityLevel | 'rejected';
  if (dedupedBlockers.length > 0) {
    effectiveAuthority = 'rejected';
  } else {
    // Start from declared, downgrade against manifest's declared
    // authority for the platform (consumer-side stricter manifest wins).
    let computed: AuthorityLevel = envelope.declaredAuthority;
    if (platformEntry) {
      computed = lowerOf(computed, platformEntry.authorityLevel);
    }
    if (downgradeForSnapshotUnknown) {
      computed = lowerOf(computed, downgradeForSnapshotUnknown);
    }
    effectiveAuthority = computed;
  }

  return {
    ok: dedupedBlockers.length === 0,
    blockers: dedupedBlockers,
    warnings,
    effectiveAuthority,
  };
}
