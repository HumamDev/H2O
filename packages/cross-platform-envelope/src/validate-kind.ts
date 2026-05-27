/**
 * F10.2.1 — validateEnvelopeKind.
 *
 * Verifies per-kind required payload, operationIntent ↔ kind rules,
 * delete-intent leakage rules, the forever-no field-name scan, and the
 * mobile/cache local-only audit-detail scan. Assumes
 * validateEnvelopeBase has already passed (or at least returned without
 * structural blockers); fields whose types or presence are wrong are
 * defensively skipped here rather than re-reporting.
 *
 * Pure function. No I/O. No mutation.
 */

import {
  FOREVER_NO_FIELD_NAMES,
  MOBILE_CACHE_BANNED_FIELDS,
  OPERATION_INTENT_BY_KIND,
  READ_ONLY_KINDS,
} from './constants';
import type {
  BlockerCode,
  CrossPlatformEnvelope,
  ValidationResult,
} from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Walk an arbitrary payload value looking for forever-no field names.
 * `previewToken` is an explicit exception to the `token` family deny
 * (envelope-v1.md §5.3). Returns the first matching field name if any.
 */
function findForeverNoFieldName(value: unknown): string | null {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    if (isPlainObject(current)) {
      for (const key of Object.keys(current)) {
        if ((FOREVER_NO_FIELD_NAMES as ReadonlyArray<string>).includes(key)) {
          return key;
        }
        // `token` family deny with `previewToken` exception.
        if (key !== 'previewToken' && /token$/i.test(key) && key !== 'previewToken') {
          // Only deny a key literally named `token` (case-insensitive)
          // or ending in `Token` other than `previewToken`. Other names
          // ending in `Token` (e.g. `accessToken`, `refreshToken`,
          // `idToken`, `bearerToken`) match.
          if (key.toLowerCase() === 'token' || key !== 'previewToken') {
            // Allow `previewToken` explicitly. Reject anything else
            // whose name ends in `Token` or is exactly `token`.
            const lower = key.toLowerCase();
            const endsInToken = lower.endsWith('token');
            if (endsInToken && key !== 'previewToken') {
              return key;
            }
          }
        }
        stack.push((current as Record<string, unknown>)[key]);
      }
    }
  }
  return null;
}

/**
 * Walk payload for any of the mobile/cache banned field names.
 */
function findBannedMobileCacheField(value: unknown): string | null {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    if (isPlainObject(current)) {
      for (const key of Object.keys(current)) {
        if ((MOBILE_CACHE_BANNED_FIELDS as ReadonlyArray<string>).includes(key)) {
          return key;
        }
        stack.push((current as Record<string, unknown>)[key]);
      }
    }
  }
  return null;
}

function hasField(payload: unknown, key: string): boolean {
  return isPlainObject(payload) && key in payload;
}

function getField<T = unknown>(payload: unknown, key: string): T | undefined {
  if (!isPlainObject(payload)) return undefined;
  return payload[key] as T | undefined;
}

/**
 * Validate per-kind requirements + posture flags + payload-content
 * scans.
 */
export function validateEnvelopeKind(envelope: CrossPlatformEnvelope): ValidationResult {
  const blockers: BlockerCode[] = [];
  const warnings: string[] = [];

  const { kind, payload, operationIntent, dryRun, transactional } = envelope;

  // ── operationIntent ↔ kind ──────────────────────────────────────────
  if ((READ_ONLY_KINDS as ReadonlyArray<string>).includes(kind)) {
    if (operationIntent !== undefined) {
      blockers.push('operation-intent-wrong-for-kind');
      if (operationIntent === 'delete') {
        // Also surfaces the dedicated leakage code.
        blockers.push('delete-intent-on-read-only-kind');
      }
    }
  } else {
    // Write-leaning kinds (proposal, conflictCandidate, applyEvent).
    if (operationIntent === undefined) {
      blockers.push('operation-intent-wrong-for-kind');
    } else {
      const allowed = OPERATION_INTENT_BY_KIND[kind];
      if (!allowed || !(allowed as ReadonlyArray<string>).includes(operationIntent)) {
        blockers.push('operation-intent-wrong-for-kind');
      }
    }
  }

  // ── Per-kind posture + required payload ─────────────────────────────
  switch (kind) {
    case 'evidence': {
      if (dryRun !== null) blockers.push('operation-intent-wrong-for-kind');
      if (transactional !== null) blockers.push('operation-intent-wrong-for-kind');
      if (!hasField(payload, 'observationKind')) {
        blockers.push('envelope-schema-too-new');
      }
      if (!hasField(payload, 'observedAtIso')) {
        blockers.push('envelope-schema-too-new');
      }
      break;
    }
    case 'preview': {
      if (dryRun !== true) blockers.push('operation-intent-wrong-for-kind');
      // `transactional` may be true OR null per §3.preview.
      if (transactional !== true && transactional !== null) {
        blockers.push('operation-intent-wrong-for-kind');
      }
      if (!hasField(payload, 'predicateVersion')) {
        blockers.push('envelope-schema-too-new');
      }
      break;
    }
    case 'proposal': {
      // dryRun and transactional may be null for proposal (no fixed
      // requirement in §3.proposal beyond their being absent/null on
      // read-only kinds; proposal is not read-only but also not an
      // apply, so we accept null).
      const justifying = getField<unknown[]>(payload, 'justifyingEvidenceDigests');
      if (!Array.isArray(justifying)) {
        blockers.push('envelope-schema-too-new');
      }
      if (!hasField(payload, 'proposedOperation')) {
        blockers.push('envelope-schema-too-new');
      }
      if (!hasField(payload, 'expectedPostState')) {
        blockers.push('envelope-schema-too-new');
      }
      if (!hasField(payload, 'predicateVersion')) {
        blockers.push('envelope-schema-too-new');
      }
      // Delete-proposal F5-predicate gate (§5.4).
      if (operationIntent === 'delete') {
        const predicateVersion = getField<unknown>(payload, 'predicateVersion');
        const justifyingArr = Array.isArray(justifying) ? justifying : [];
        if (
          typeof predicateVersion !== 'string' ||
          predicateVersion.length === 0 ||
          justifyingArr.length === 0
        ) {
          blockers.push('delete-proposal-missing-f5-predicate');
        }
      }
      break;
    }
    case 'conflictCandidate': {
      if (!hasField(payload, 'requesterState')) {
        blockers.push('envelope-schema-too-new');
      }
      if (!hasField(payload, 'counterpartState')) {
        blockers.push('envelope-schema-too-new');
      }
      if (!hasField(payload, 'commonAncestorHash')) {
        blockers.push('envelope-schema-too-new');
      }
      if (!hasField(payload, 'divergenceReason')) {
        blockers.push('envelope-schema-too-new');
      }
      break;
    }
    case 'applyEvent': {
      if (dryRun !== false) blockers.push('operation-intent-wrong-for-kind');
      if (transactional !== true) blockers.push('operation-intent-wrong-for-kind');
      const auditId = getField<unknown>(payload, 'auditMaintenanceId');
      if (typeof auditId !== 'string' || auditId.length === 0) {
        blockers.push('envelope-schema-too-new');
      }
      if (!hasField(payload, 'preState')) blockers.push('envelope-schema-too-new');
      if (!hasField(payload, 'postState')) blockers.push('envelope-schema-too-new');
      if (!hasField(payload, 'predicateVersion')) blockers.push('envelope-schema-too-new');
      if (operationIntent === 'delete') {
        if (typeof auditId !== 'string' || auditId.length === 0) {
          blockers.push('delete-apply-event-missing-audit-id');
        }
      }
      break;
    }
    case 'bundle': {
      const envs = getField<unknown[]>(payload, 'envelopes');
      if (!Array.isArray(envs)) blockers.push('envelope-schema-too-new');
      const bundleSeq = getField<unknown>(payload, 'bundleSequence');
      if (typeof bundleSeq !== 'number') blockers.push('envelope-schema-too-new');
      const bundleHash = getField<unknown>(payload, 'bundleHash');
      if (typeof bundleHash !== 'string') blockers.push('envelope-schema-too-new');
      break;
    }
    case 'cacheMetadata': {
      const lastSeq = getField<unknown>(payload, 'lastIngestedBundleSequence');
      if (typeof lastSeq !== 'number') blockers.push('envelope-schema-too-new');
      const mirrorCount = getField<unknown>(payload, 'mirrorEntityCount');
      if (typeof mirrorCount !== 'number') blockers.push('envelope-schema-too-new');
      break;
    }
    default: {
      blockers.push('envelope-schema-too-new');
    }
  }

  // ── Forever-no payload field-name scan (§5.3) ──────────────────────
  const foreverNoHit = findForeverNoFieldName(payload);
  if (foreverNoHit) {
    blockers.push('payload-contains-forever-no-field');
  }

  // ── Mobile / cacheMetadata local-only audit-detail scan (§5.5) ─────
  const isMobile = envelope.sourcePlatform?.platformId === 'mobile';
  const isCacheMetadata = kind === 'cacheMetadata';
  if (isMobile || isCacheMetadata) {
    const bannedHit = findBannedMobileCacheField(payload);
    if (bannedHit) {
      blockers.push('local-only-audit-detail-on-mobile-or-cache');
    }
  }

  const dedupedBlockers = Array.from(new Set(blockers)) as BlockerCode[];
  return {
    ok: dedupedBlockers.length === 0,
    blockers: dedupedBlockers,
    warnings,
  };
}
