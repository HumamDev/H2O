/**
 * F10.2.1 — validateEnvelopeBase.
 *
 * Verifies envelope shape, presence of required top-level fields, and
 * posture-flag consistency per envelope-v1.md §2. Does NOT cross-check
 * payload requirements (that is `validateEnvelopeKind`) or authority
 * (that is `validateEnvelopeAuthority`).
 *
 * Pure function. No I/O. No mutation.
 */

import {
  ENVELOPE_SCHEMA,
  ENVELOPE_VERSION,
  ENVELOPE_KIND_VERSION,
  ENVELOPE_KINDS,
  PLATFORM_IDS,
  SURFACE_KINDS,
  AUTHORITY_LEVELS,
  REDACTION_CLASSES,
  OPERATION_INTENTS,
} from './constants';
import {
  isSha256Hex,
  isValidEnvelopeId,
  isValidIsoSeconds,
} from './predicates';
import type { BlockerCode, ValidationResult } from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function arrayIncludes<T extends string>(arr: ReadonlyArray<T>, value: unknown): value is T {
  return typeof value === 'string' && (arr as ReadonlyArray<string>).includes(value);
}

/**
 * Validate envelope base shape and posture flags. Does not check
 * payload-specific or authority rules.
 */
export function validateEnvelopeBase(envelope: unknown): ValidationResult {
  const blockers: BlockerCode[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(envelope)) {
    // Without a usable object we cannot inspect further. Surface as a
    // schema-too-new since the consumer cannot interpret the input.
    blockers.push('envelope-schema-too-new');
    return { ok: false, blockers, warnings };
  }

  const env = envelope;

  // ── Schema identity ─────────────────────────────────────────────────
  if (env.schema !== ENVELOPE_SCHEMA) {
    blockers.push('envelope-schema-too-new');
  }
  if (env.envelopeVersion !== ENVELOPE_VERSION) {
    blockers.push('envelope-schema-too-new');
  }
  if (env.envelopeKindVersion !== ENVELOPE_KIND_VERSION) {
    blockers.push('envelope-schema-too-new');
  }
  if (env.schemaHash !== undefined) {
    if (!isSha256Hex(env.schemaHash)) {
      blockers.push('envelope-schema-hash-unknown');
    }
  }

  // ── Envelope identity ───────────────────────────────────────────────
  if (!arrayIncludes(ENVELOPE_KINDS, env.kind)) {
    blockers.push('envelope-schema-too-new');
  }
  if (!isValidEnvelopeId(env.id)) {
    blockers.push('envelope-schema-too-new');
  }
  if (typeof env.lineageId !== 'string' || env.lineageId.length === 0) {
    blockers.push('envelope-schema-too-new');
  }

  // ── Provenance ──────────────────────────────────────────────────────
  if (!isValidIsoSeconds(env.createdAt)) {
    blockers.push('envelope-schema-too-new');
  }
  if (env.expiresAt !== undefined && !isValidIsoSeconds(env.expiresAt)) {
    blockers.push('envelope-schema-too-new');
  }
  if (!('sequence' in env)) {
    blockers.push('envelope-schema-too-new');
  } else if (env.sequence !== null && typeof env.sequence !== 'number') {
    blockers.push('envelope-schema-too-new');
  }
  if (!('exportSequence' in env)) {
    blockers.push('envelope-schema-too-new');
  } else if (env.exportSequence !== null && typeof env.exportSequence !== 'number') {
    blockers.push('envelope-schema-too-new');
  }

  // ── Source attribution ──────────────────────────────────────────────
  if (!isPlainObject(env.sourcePlatform)) {
    blockers.push('envelope-schema-too-new');
  } else {
    const sp = env.sourcePlatform;
    if (!arrayIncludes(PLATFORM_IDS, sp.platformId)) {
      blockers.push('envelope-schema-too-new');
    }
    if (!arrayIncludes(SURFACE_KINDS, sp.surfaceKind)) {
      blockers.push('envelope-schema-too-new');
    }
    if (!isPlainObject(sp.sourcePeerEnvelope)) {
      blockers.push('envelope-schema-too-new');
    } else {
      const peer = sp.sourcePeerEnvelope;
      const peerOk =
        isSha256Hex(peer.physicalDeviceIdHash) &&
        isSha256Hex(peer.installIdHash) &&
        isSha256Hex(peer.syncPeerIdHash) &&
        arrayIncludes(SURFACE_KINDS, peer.surfaceKind);
      if (!peerOk) {
        blockers.push('envelope-schema-too-new');
      }
    }
  }

  // ── Authority (split) ───────────────────────────────────────────────
  if (!arrayIncludes(AUTHORITY_LEVELS, env.declaredAuthority)) {
    blockers.push('envelope-schema-too-new');
  }
  // effectiveAuthority is producer-set initially; validator may downgrade.
  // Allow any AuthorityLevel value OR the literal "rejected".
  const effOk =
    env.effectiveAuthority === 'rejected' || arrayIncludes(AUTHORITY_LEVELS, env.effectiveAuthority);
  if (!effOk) {
    blockers.push('envelope-schema-too-new');
  }
  if (typeof env.capabilityUsed !== 'string' || env.capabilityUsed.length === 0) {
    blockers.push('envelope-schema-too-new');
  }
  if (!isSha256Hex(env.capabilitySnapshotHash)) {
    blockers.push('envelope-schema-too-new');
  }

  // ── Subject ─────────────────────────────────────────────────────────
  if (typeof env.subjectType !== 'string' || env.subjectType.length === 0) {
    blockers.push('envelope-schema-too-new');
  }
  if (typeof env.subjectId !== 'string' || env.subjectId.length === 0) {
    blockers.push('envelope-schema-too-new');
  }
  if (typeof env.operation !== 'string' || env.operation.length === 0) {
    blockers.push('envelope-schema-too-new');
  }
  if (env.operationIntent !== undefined && !arrayIncludes(OPERATION_INTENTS, env.operationIntent)) {
    blockers.push('envelope-schema-too-new');
  }

  // ── Posture ─────────────────────────────────────────────────────────
  if (!arrayIncludes(REDACTION_CLASSES, env.redactionClass)) {
    blockers.push('envelope-schema-too-new');
  }
  if (!('dryRun' in env)) {
    blockers.push('envelope-schema-too-new');
  } else if (env.dryRun !== null && typeof env.dryRun !== 'boolean') {
    blockers.push('envelope-schema-too-new');
  }
  if (!('transactional' in env)) {
    blockers.push('envelope-schema-too-new');
  } else if (env.transactional !== null && typeof env.transactional !== 'boolean') {
    blockers.push('envelope-schema-too-new');
  }

  // ── Idempotency ─────────────────────────────────────────────────────
  if (!isSha256Hex(env.dedupeKey)) {
    blockers.push('envelope-schema-too-new');
  }
  if (!isSha256Hex(env.payloadHash)) {
    blockers.push('envelope-schema-too-new');
  }
  if (!isSha256Hex(env.eventDigest)) {
    blockers.push('envelope-schema-too-new');
  }

  // ── Body ────────────────────────────────────────────────────────────
  if (!isPlainObject(env.payload)) {
    blockers.push('envelope-schema-too-new');
  }

  // ── Diagnostic ──────────────────────────────────────────────────────
  if (!Array.isArray(env.warnings)) {
    blockers.push('envelope-schema-too-new');
  } else if (!env.warnings.every((w) => typeof w === 'string')) {
    blockers.push('envelope-schema-too-new');
  }
  if (!Array.isArray(env.blockers)) {
    blockers.push('envelope-schema-too-new');
  } else if (!env.blockers.every((b) => typeof b === 'string')) {
    blockers.push('envelope-schema-too-new');
  }

  // Dedupe blocker codes (e.g. multiple schema-too-new triggers should
  // surface once).
  const dedupedBlockers = Array.from(new Set(blockers)) as BlockerCode[];
  return {
    ok: dedupedBlockers.length === 0,
    blockers: dedupedBlockers,
    warnings,
  };
}
