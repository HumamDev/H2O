/**
 * F10.2.1 — Pure format predicates and canonical input formatters.
 *
 * No hashing is performed here. Producers compute hashes themselves
 * using their platform's crypto. This module only verifies that strings
 * LOOK LIKE well-formed hashes and provides canonical input strings
 * the producer can feed to its hasher.
 *
 * Pure module. No I/O. No Date.now(). No globalThis.crypto.
 */

import { SHA256_HEX_LENGTH, ENVELOPE_SCHEMA } from './constants';
import type { CrossPlatformEnvelope } from './types';

// ── Format predicates ──────────────────────────────────────────────────

/**
 * Returns true if the input is a lowercase hex string of sha256 length
 * (64 characters).
 */
export function isSha256Hex(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length !== SHA256_HEX_LENGTH) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    const isDigit = c >= 48 && c <= 57; // 0-9
    const isLowerHex = c >= 97 && c <= 102; // a-f
    if (!isDigit && !isLowerHex) return false;
  }
  return true;
}

/**
 * Returns true if the input looks like a valid envelope id. Accepts
 * either a ULID (26-char Crockford base32 uppercase) or a UUID
 * (36-char hyphenated). Producers may use either format.
 */
export function isValidEnvelopeId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // ULID: 26 chars of Crockford base32 (excludes I, L, O, U).
  if (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(value)) return true;
  // UUID v4 / v7: 36 chars, hyphenated.
  if (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
  ) {
    return true;
  }
  return false;
}

/** Sha256-hex format gate for `eventDigest`. */
export const isValidEventDigest = isSha256Hex;

/** Sha256-hex format gate for `dedupeKey`. */
export const isValidDedupeKey = isSha256Hex;

/** Sha256-hex format gate for `payloadHash`. */
export const isValidPayloadHash = isSha256Hex;

/** Sha256-hex format gate for `capabilitySnapshotHash`. */
export const isValidCapabilitySnapshotHash = isSha256Hex;

/**
 * Returns true if the input is an ISO-8601 timestamp with seconds
 * precision in UTC (e.g. `"2026-05-27T12:34:56Z"`). The spec uses ISO
 * seconds UTC throughout; sub-second precision is not required.
 */
export function isValidIsoSeconds(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value);
}

/**
 * Returns true if the envelope's `expiresAt` is in the past relative to
 * `nowIso`. Returns false when `expiresAt` is absent (no expiry) or when
 * either timestamp is malformed (defensive — malformedness is surfaced
 * by validateEnvelopeBase, not here).
 *
 * Note: this helper never calls `Date.now()`. The caller must pass
 * `nowIso`.
 */
export function isExpired(
  envelope: Pick<CrossPlatformEnvelope, 'expiresAt'>,
  nowIso: string,
): boolean {
  if (!envelope.expiresAt) return false;
  if (!isValidIsoSeconds(envelope.expiresAt)) return false;
  if (!isValidIsoSeconds(nowIso)) return false;
  // Lexicographic comparison works for ISO-8601 seconds in UTC.
  return nowIso > envelope.expiresAt;
}

// ── Canonical input formatters (no hashing) ────────────────────────────

/**
 * Inputs to {@link formatDedupeKeyInput}. The shape mirrors the canonical
 * dedupe input declared in envelope-v1.md §6.1.
 */
export interface DedupeKeyInput {
  platformId: string;
  kind: string;
  subjectType: string;
  operation: string;
  operationIntent?: string;
  /** Per-kind allowlisted dedupe fields, already canonicalized by the caller. */
  dedupeFields: Record<string, unknown>;
}

/**
 * Inputs to {@link formatEventDigestInput}. The caller passes the entire
 * envelope minus `warnings`, `blockers`, and `eventDigest` itself
 * (envelope-v1.md §6.1).
 */
export type EventDigestInput = Omit<CrossPlatformEnvelope, 'warnings' | 'blockers' | 'eventDigest'>;

/**
 * Inputs to {@link formatPayloadHashInput}. Simply the envelope payload
 * after canonicalization (envelope-v1.md §6.1).
 */
export type PayloadHashInput = unknown;

/**
 * JSON.stringify with sorted keys. Used so the canonical input string
 * is deterministic across producers. Recursively sorts object keys but
 * leaves array order intact (arrays are ordered by definition).
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj).sort();
    for (const k of keys) {
      sorted[k] = canonicalize(obj[k]);
    }
    return sorted;
  }
  return value;
}

/**
 * Format the canonical input string for `dedupeKey`. The producer is
 * expected to sha256 this string. This helper does NOT compute the hash.
 */
export function formatDedupeKeyInput(input: DedupeKeyInput): string {
  const canonical = {
    schema: ENVELOPE_SCHEMA,
    purpose: 'dedupeKey',
    platformId: input.platformId,
    kind: input.kind,
    subjectType: input.subjectType,
    operation: input.operation,
    operationIntent: input.operationIntent ?? null,
    dedupeFields: canonicalize(input.dedupeFields),
  };
  return JSON.stringify(canonicalize(canonical));
}

/**
 * Format the canonical input string for `eventDigest`. The caller MUST
 * exclude `warnings`, `blockers`, and `eventDigest` before passing the
 * envelope in (TypeScript prevents the latter via the Omit type).
 */
export function formatEventDigestInput(input: EventDigestInput): string {
  const canonical = {
    schema: ENVELOPE_SCHEMA,
    purpose: 'eventDigest',
    envelope: canonicalize(input as unknown),
  };
  return JSON.stringify(canonical);
}

/**
 * Format the canonical input string for `payloadHash`. Operates on the
 * envelope's `payload` field alone.
 */
export function formatPayloadHashInput(payload: PayloadHashInput): string {
  const canonical = {
    schema: ENVELOPE_SCHEMA,
    purpose: 'payloadHash',
    payload: canonicalize(payload),
  };
  return JSON.stringify(canonical);
}
