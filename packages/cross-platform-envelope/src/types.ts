/**
 * F10.2.1 — Cross-platform envelope types.
 *
 * Encodes the canonical v1 shape from envelope-v1.md §2 byte-for-byte.
 *
 * Pure type module. No runtime exports.
 */

import type {
  ENVELOPE_KINDS,
  PLATFORM_IDS,
  SURFACE_KINDS,
  AUTHORITY_LEVELS,
  REDACTION_CLASSES,
  OPERATION_INTENTS,
  BLOCKER_CODES,
} from './constants';

// ── Enumerated string-literal unions ───────────────────────────────────

export type EnvelopeKind = (typeof ENVELOPE_KINDS)[number];
export type PlatformId = (typeof PLATFORM_IDS)[number];
export type SurfaceKind = (typeof SURFACE_KINDS)[number];
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];
export type RedactionClass = (typeof REDACTION_CLASSES)[number];
export type OperationIntent = (typeof OPERATION_INTENTS)[number];
export type BlockerCode = (typeof BLOCKER_CODES)[number];

// ── F2-shaped redacted peer envelope (identity, not authority) ─────────

/**
 * Identity envelope from F2 with redacted IDs. Used for routing only,
 * never trusted for authority (envelope-v1.md §4.5).
 */
export interface RedactedPeerEnvelope {
  /** Sha256-redacted physical device ID. */
  physicalDeviceIdHash: string;
  /** Sha256-redacted install ID. */
  installIdHash: string;
  /** Sha256-redacted sync peer ID. */
  syncPeerIdHash: string;
  /** Surface kind for this peer. */
  surfaceKind: SurfaceKind;
  /** Optional ISO seconds UTC of when this identity was diagnosed. */
  diagnosedAt?: string;
}

// ── Source attribution block ───────────────────────────────────────────

export interface SourcePlatformBlock {
  platformId: PlatformId;
  surfaceKind: SurfaceKind;
  sourcePeerEnvelope: RedactedPeerEnvelope;
}

// ── Per-kind payload types ─────────────────────────────────────────────

/**
 * `evidence` payload — observation. Required fields per §3.evidence.
 */
export interface EvidencePayload {
  observationKind: string;
  observedAtIso: string;
  // Any number of additional, kind-specific fields. Forever-no names are
  // rejected by validateEnvelopeKind regardless of any per-payload extra
  // fields a producer may add.
  [extraField: string]: unknown;
}

/**
 * `preview` payload — counterfactual diagnostic. Required fields per
 * §3.preview.
 */
export interface PreviewPayload {
  predicateVersion: string;
  /** Optional preview token (F5H.3b.1a). */
  previewToken?: string;
  [extraField: string]: unknown;
}

/**
 * `proposal` payload — explicit request to apply, awaiting review.
 * Required fields per §3.proposal.
 */
export interface ProposalPayload {
  justifyingEvidenceDigests: string[];
  proposedOperation: string;
  expectedPostState: unknown;
  predicateVersion: string;
  [extraField: string]: unknown;
}

/**
 * `conflictCandidate` payload — detected divergence between two evidence
 * streams. Required fields per §3.conflictCandidate.
 */
export interface ConflictCandidatePayload {
  requesterState: unknown;
  counterpartState: unknown;
  commonAncestorHash: string | null;
  divergenceReason: string;
  [extraField: string]: unknown;
}

/**
 * `applyEvent` payload — past-tense receipt of a change already
 * committed on the producing platform. Never a remote command.
 * Required fields per §3.applyEvent.
 */
export interface ApplyEventPayload {
  auditMaintenanceId: string;
  preState: unknown;
  postState: unknown;
  predicateVersion: string;
  [extraField: string]: unknown;
}

/**
 * `bundle` payload — ordered container of upstream envelopes.
 * Required fields per §3.bundle.
 */
export interface BundlePayload {
  envelopes: CrossPlatformEnvelope[];
  bundleSequence: number;
  bundleHash: string;
  [extraField: string]: unknown;
}

/**
 * `cacheMetadata` payload — read-only mirror state, forever
 * non-authoritative. Required fields per §3.cacheMetadata.
 */
export interface CacheMetadataPayload {
  lastIngestedBundleSequence: number;
  mirrorEntityCount: number;
  [extraField: string]: unknown;
}

// ── Canonical envelope shape ───────────────────────────────────────────

/**
 * The canonical v1 cross-platform envelope.
 *
 * This shape is locked by F10.2.0 (envelope-v1.md §2). Any change must
 * bump the envelope schema literal and be announced one release before
 * any platform emits the new shape.
 */
export interface CrossPlatformEnvelope {
  // Schema identity
  schema: 'h2o.crossPlatform.envelope.v1';
  envelopeVersion: 'v1';
  envelopeKindVersion: 'v1';
  schemaHash?: string;

  // Envelope identity
  kind: EnvelopeKind;
  id: string;
  lineageId: string;

  // Provenance
  createdAt: string;
  expiresAt?: string;
  sequence: number | null;
  exportSequence: number | null;

  // Source attribution
  sourcePlatform: SourcePlatformBlock;

  // Authority (declared vs effective)
  declaredAuthority: AuthorityLevel;
  effectiveAuthority: AuthorityLevel | 'rejected';
  capabilityUsed: string;
  capabilitySnapshotHash: string;

  // Subject
  subjectType: string;
  subjectId: string;
  operation: string;
  operationIntent?: OperationIntent;

  // Posture
  redactionClass: RedactionClass;
  dryRun: boolean | null;
  transactional: boolean | null;

  // Idempotency
  dedupeKey: string;
  payloadHash: string;
  eventDigest: string;

  // Body
  payload: unknown;

  // Diagnostic
  warnings: string[];
  blockers: string[];
}

// ── F10.1 platform capability manifest shape ───────────────────────────

/**
 * Per-platform entry in the F10.1 platform capability manifest.
 * Mirrors the shape documented in
 * docs/systems/sync/platform-capabilities-f10.md "Manifest Shape".
 *
 * `capabilities` is a free-form record where boolean `true` means
 * allowed, `false` means denied, and string values such as `"gated"`,
 * `"f5-gated"`, `"metadata-only"` express constrained allow. The
 * validator treats any non-`false` value as the capability being
 * declared (subject to further per-capability rules in F10.1).
 */
export interface PlatformCapabilityEntry {
  schema: 'h2o.platform.capabilities.v1';
  platformId: PlatformId;
  surfaceKind: SurfaceKind;
  authorityLevel: AuthorityLevel;
  capabilities: Record<string, boolean | string | string[]>;
  forbidden: string[];
}

/**
 * F10.1 platform capability manifest as a lookup-by-platformId map.
 * Callers construct this from individual platform entries.
 */
export interface PlatformCapabilityManifest {
  platforms: Partial<Record<PlatformId, PlatformCapabilityEntry>>;
}

// ── Validator result shapes ────────────────────────────────────────────

/**
 * Result of a single validator pass. `ok` is `true` iff `blockers` is
 * empty. `warnings` may be populated independently and do not prevent
 * `ok: true`.
 */
export interface ValidationResult {
  ok: boolean;
  blockers: BlockerCode[];
  warnings: string[];
}

/**
 * Result of `validateEnvelopeAuthority`. Adds `effectiveAuthority` which
 * is the only authority field consumers may act on. `"rejected"` means
 * the envelope must not be dispatched to any consumer code path.
 */
export interface AuthorityResult extends ValidationResult {
  effectiveAuthority: AuthorityLevel | 'rejected';
}
