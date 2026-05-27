/**
 * F10.2.1 — Cross-platform envelope constants.
 *
 * Locks the enumerated values declared in
 * docs/systems/cross-platform/envelope-v1.md (commits febd731 + 92d3eb3).
 *
 * Pure module. No I/O. No side effects. No runtime registration.
 */

// ── Schema identity ────────────────────────────────────────────────────

/** Canonical envelope schema literal. */
export const ENVELOPE_SCHEMA = 'h2o.crossPlatform.envelope.v1' as const;

/** Top-level envelope wrapper version. */
export const ENVELOPE_VERSION = 'v1' as const;

/** Per-kind payload version. */
export const ENVELOPE_KIND_VERSION = 'v1' as const;

// ── Enumerations ───────────────────────────────────────────────────────

/** The seven envelope kinds defined by F10.2.0 §3. */
export const ENVELOPE_KINDS = [
  'evidence',
  'preview',
  'proposal',
  'conflictCandidate',
  'applyEvent',
  'bundle',
  'cacheMetadata',
] as const;

/** Four platform identities from F10.1. */
export const PLATFORM_IDS = [
  'desktop-studio',
  'chrome-studio',
  'native-extension',
  'mobile',
] as const;

/** Four surface kinds from F10.1. */
export const SURFACE_KINDS = [
  'desktop-tauri',
  'browser-studio',
  'browser-runtime',
  'mobile',
] as const;

/** Seven authority levels from F10.1. Ordered from weakest to strongest. */
export const AUTHORITY_LEVELS = [
  'none',
  'read-only',
  'evidence-producer',
  'preview-coordinator',
  'proposal-source',
  'strong-local-authority',
  'audited-apply-authority',
] as const;

/** Three redaction classes from F10.2.0 §5. */
export const REDACTION_CLASSES = ['redacted', 'device-local', 'metadata-only'] as const;

/** Five operation intents from F10.2.0 §2. */
export const OPERATION_INTENTS = [
  'create',
  'update',
  'delete',
  'review',
  'cleanup',
] as const;

/**
 * The 18 blocker codes from F10.2.0 readiness checklist (§F10.2.1
 * Readiness Checklist / "Blocker codes are enumerated"). New codes
 * MAY NOT be added by this helper without first extending envelope-v1.md.
 */
export const BLOCKER_CODES = [
  'platform-not-authorized-for-kind',
  'capability-not-on-platform-allowlist',
  'surface-authority-mismatch',
  'mobile-payload-outside-allowlist',
  'mobile-must-redact',
  'native-extension-entity-outside-evidence-scope',
  'native-extension-not-authorized-for-tombstones',
  'envelope-schema-too-new',
  'envelope-schema-too-old',
  'envelope-schema-hash-unknown',
  'capability-snapshot-unknown',
  'operation-intent-wrong-for-kind',
  'delete-intent-on-read-only-kind',
  'delete-proposal-missing-f5-predicate',
  'delete-apply-event-missing-audit-id',
  'local-only-audit-detail-on-mobile-or-cache',
  'payload-contains-forever-no-field',
  'stale-evidence-not-revalidated',
] as const;

// ── Deny lists ─────────────────────────────────────────────────────────

/**
 * Forever-no field-name deny list (F10.2.0 §5.3). Validation rejects
 * payloads containing any of these field names regardless of
 * `redactionClass`. The literal field name `previewToken` is an
 * explicit exception to the `token` deny (handled in payload-scan logic,
 * not by listing it here).
 */
export const FOREVER_NO_FIELD_NAMES = [
  'content',
  'body',
  'text',
  'messages',
  'attachments',
  'url',
  'path',
  'password',
  'apiKey',
] as const;

/**
 * Mobile / cacheMetadata banned field list (F10.2.0 §5.5). Sensitive
 * local-only audit details must not appear in any envelope reaching
 * mobile or in any `cacheMetadata` envelope.
 */
export const MOBILE_CACHE_BANNED_FIELDS = [
  'auditMaintenanceId',
  'previewToken',
  'dbFingerprint',
  'candidateIds',
  'preState',
  'postState',
] as const;

// ── Static lookup tables (derived from envelope-v1.md §3 + §4) ─────────

/**
 * Kind ↔ authority matrix (F10.2.0 §4.1). Maps platform → allowed
 * envelope kinds the platform may PRODUCE.
 */
export const PLATFORM_ALLOWED_KINDS: Readonly<
  Record<(typeof PLATFORM_IDS)[number], ReadonlyArray<(typeof ENVELOPE_KINDS)[number]>>
> = {
  'desktop-studio': [
    'evidence',
    'preview',
    'proposal',
    'conflictCandidate',
    'applyEvent',
    'bundle',
    'cacheMetadata',
  ],
  'chrome-studio': ['evidence', 'preview'],
  'native-extension': ['evidence', 'cacheMetadata'],
  mobile: ['evidence', 'cacheMetadata'],
} as const;

/**
 * Surface ↔ authority sanity pairs (F10.2.0 §4.3). Each surface has
 * exactly one allowed authority level for declared-authority sanity
 * checking.
 */
export const SURFACE_TO_AUTHORITY: Readonly<
  Record<(typeof SURFACE_KINDS)[number], (typeof AUTHORITY_LEVELS)[number]>
> = {
  'desktop-tauri': 'strong-local-authority',
  'browser-studio': 'preview-coordinator',
  'browser-runtime': 'evidence-producer',
  mobile: 'read-only',
} as const;

/**
 * Numeric ranking of authority levels for downgrade computations. Higher
 * means stronger.
 */
export const AUTHORITY_RANK: Readonly<
  Record<(typeof AUTHORITY_LEVELS)[number], number>
> = {
  none: 0,
  'read-only': 1,
  'evidence-producer': 2,
  'preview-coordinator': 3,
  'proposal-source': 4,
  'strong-local-authority': 5,
  'audited-apply-authority': 6,
} as const;

/**
 * Capability ↔ kind matrix (F10.2.0 §4.2). Maps F10.1 capability name to
 * the envelope kinds it may emit.
 */
export const CAPABILITY_TO_KINDS: Readonly<Record<string, ReadonlyArray<(typeof ENVELOPE_KINDS)[number]>>> = {
  produceEvidence: ['evidence', 'cacheMetadata'],
  preview: ['preview'],
  propose: ['proposal'],
  conflictReview: ['conflictCandidate'],
  apply: ['applyEvent'],
  delete: ['applyEvent'],
  export: ['bundle'],
  cache: ['cacheMetadata'],
} as const;

/**
 * Envelope kinds that are "write-capable" — produced by a path that
 * implies or records a mutation. Stricter validation applies (§4.7).
 */
export const WRITE_CAPABLE_KINDS: ReadonlyArray<(typeof ENVELOPE_KINDS)[number]> = [
  'proposal',
  'applyEvent',
] as const;

/**
 * Envelope kinds that are read-only — describe observation or
 * counterfactual; no `operationIntent` is permitted on these.
 */
export const READ_ONLY_KINDS: ReadonlyArray<(typeof ENVELOPE_KINDS)[number]> = [
  'evidence',
  'preview',
  'bundle',
  'cacheMetadata',
] as const;

/**
 * Native-extension subjectType allowlist (F10.2.0 §4.7). The extension
 * may only produce envelopes whose `subjectType` is within the evidence
 * scope.
 */
export const NATIVE_EXTENSION_SUBJECT_TYPE_ALLOWLIST: ReadonlyArray<string> = [
  'chat.evidence',
  'session.evidence',
  'capture.evidence',
  'peer.identity',
] as const;

/**
 * Allowed `operationIntent` values per write-kind (F10.2.0 §3).
 */
export const OPERATION_INTENT_BY_KIND: Readonly<
  Partial<Record<(typeof ENVELOPE_KINDS)[number], ReadonlyArray<(typeof OPERATION_INTENTS)[number]>>>
> = {
  proposal: ['create', 'update', 'delete', 'review', 'cleanup'],
  conflictCandidate: ['create', 'update', 'delete'],
  applyEvent: ['create', 'update', 'delete', 'review', 'cleanup'],
} as const;

/**
 * Mobile-allowed `redactionClass` values (F10.2.0 §4.6).
 */
export const MOBILE_ALLOWED_REDACTION_CLASSES: ReadonlyArray<
  (typeof REDACTION_CLASSES)[number]
> = ['redacted', 'metadata-only'] as const;

/**
 * Expected sha256 hex length (without prefix). Used by predicates.
 */
export const SHA256_HEX_LENGTH = 64 as const;
