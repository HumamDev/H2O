/**
 * @h2o/cross-platform-envelope — F10.2.1 static helper.
 *
 * Pure barrel. Re-exports the cross-platform envelope contracts and
 * validators defined by F10.2.0 in
 * docs/systems/cross-platform/envelope-v1.md.
 *
 * No I/O. No bridge. No transport. No registration. No mutation.
 */

// ── Constants ──────────────────────────────────────────────────────────
export {
  ENVELOPE_SCHEMA,
  ENVELOPE_VERSION,
  ENVELOPE_KIND_VERSION,
  ENVELOPE_KINDS,
  PLATFORM_IDS,
  SURFACE_KINDS,
  AUTHORITY_LEVELS,
  REDACTION_CLASSES,
  OPERATION_INTENTS,
  BLOCKER_CODES,
  FOREVER_NO_FIELD_NAMES,
  MOBILE_CACHE_BANNED_FIELDS,
  PLATFORM_ALLOWED_KINDS,
  SURFACE_TO_AUTHORITY,
  AUTHORITY_RANK,
  CAPABILITY_TO_KINDS,
  WRITE_CAPABLE_KINDS,
  READ_ONLY_KINDS,
  NATIVE_EXTENSION_SUBJECT_TYPE_ALLOWLIST,
  OPERATION_INTENT_BY_KIND,
  MOBILE_ALLOWED_REDACTION_CLASSES,
  SHA256_HEX_LENGTH,
} from './src/constants';

// ── Types ──────────────────────────────────────────────────────────────
export type {
  EnvelopeKind,
  PlatformId,
  SurfaceKind,
  AuthorityLevel,
  RedactionClass,
  OperationIntent,
  BlockerCode,
  RedactedPeerEnvelope,
  SourcePlatformBlock,
  CrossPlatformEnvelope,
  EvidencePayload,
  PreviewPayload,
  ProposalPayload,
  ConflictCandidatePayload,
  ApplyEventPayload,
  BundlePayload,
  CacheMetadataPayload,
  PlatformCapabilityEntry,
  PlatformCapabilityManifest,
  ValidationResult,
  AuthorityResult,
} from './src/types';

// ── Predicates ─────────────────────────────────────────────────────────
export {
  isSha256Hex,
  isValidEnvelopeId,
  isValidEventDigest,
  isValidDedupeKey,
  isValidPayloadHash,
  isValidCapabilitySnapshotHash,
  isValidIsoSeconds,
  isExpired,
  formatDedupeKeyInput,
  formatEventDigestInput,
  formatPayloadHashInput,
} from './src/predicates';
export type { DedupeKeyInput, EventDigestInput, PayloadHashInput } from './src/predicates';

// ── Validators (three, exactly) ────────────────────────────────────────
export { validateEnvelopeBase } from './src/validate-base';
export { validateEnvelopeKind } from './src/validate-kind';
export {
  validateEnvelopeAuthority,
} from './src/validate-authority';
export type { ValidateAuthorityOptions } from './src/validate-authority';

// ── Fixtures (re-exported for downstream test reuse / F10.2.2 scan) ───
export {
  FIXTURE_MANIFEST,
  FIXTURE_KNOWN_SNAPSHOTS,
  FIXTURE_NOW,
  fixtureEvidence,
  fixturePreview,
  fixtureProposal,
  fixtureConflictCandidate,
  fixtureApplyEvent,
  fixtureBundle,
  fixtureCacheMetadata,
  fixtureChromeEvidence,
  fixtureNativeEvidence,
} from './src/fixtures';
