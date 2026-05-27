/**
 * F10.2.1 — Worked-example envelope fixtures.
 *
 * One valid envelope per kind. These are the canonical positive cases:
 * each fixture must pass `validateEnvelopeBase`, `validateEnvelopeKind`,
 * and `validateEnvelopeAuthority` with `ok: true` when paired with the
 * `FIXTURE_MANIFEST` and `FIXTURE_KNOWN_SNAPSHOTS` set below.
 *
 * The future F10.2.2 CI scan is expected to reuse these fixtures.
 *
 * No I/O. No mutation. Pure data.
 */

import type {
  CrossPlatformEnvelope,
  PlatformCapabilityManifest,
  RedactedPeerEnvelope,
} from './types';

// 64-char lowercase hex sha256 placeholders. These are not real hashes;
// they pass `isSha256Hex` and let the validator exercise the rest of
// its logic without coupling fixtures to any actual hashing scheme.
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_D = 'd'.repeat(64);
const HASH_E = 'e'.repeat(64);
const HASH_SNAPSHOT = 'f'.repeat(64);

// ULID-shaped envelope id (26 chars, Crockford base32 uppercase).
const FIXTURE_ENVELOPE_ID_DESKTOP = '01HZX0YKJM7P6A0B0C0D0E0F0G';
const FIXTURE_ENVELOPE_ID_CHROME = '01HZX0YKJM7P6A0B0C0D0E0F0H';
const FIXTURE_ENVELOPE_ID_NATIVE = '01HZX0YKJM7P6A0B0C0D0E0F0J';
const FIXTURE_ENVELOPE_ID_MOBILE = '01HZX0YKJM7P6A0B0C0D0E0F0K';
const FIXTURE_ENVELOPE_ID_LINEAGE = '01HZX0YKJM7P6A0B0C0D0E0F0M';

const FIXTURE_NOW_ISO = '2026-05-27T12:00:00Z';

// ── Reusable redacted peer envelopes ───────────────────────────────────

const PEER_DESKTOP: RedactedPeerEnvelope = {
  physicalDeviceIdHash: HASH_A,
  installIdHash: HASH_B,
  syncPeerIdHash: HASH_C,
  surfaceKind: 'desktop-tauri',
  diagnosedAt: FIXTURE_NOW_ISO,
};

const PEER_CHROME: RedactedPeerEnvelope = {
  physicalDeviceIdHash: HASH_A,
  installIdHash: HASH_D,
  syncPeerIdHash: HASH_E,
  surfaceKind: 'browser-studio',
  diagnosedAt: FIXTURE_NOW_ISO,
};

const PEER_NATIVE: RedactedPeerEnvelope = {
  physicalDeviceIdHash: HASH_A,
  installIdHash: HASH_C,
  syncPeerIdHash: HASH_D,
  surfaceKind: 'browser-runtime',
  diagnosedAt: FIXTURE_NOW_ISO,
};

const PEER_MOBILE: RedactedPeerEnvelope = {
  physicalDeviceIdHash: HASH_B,
  installIdHash: HASH_C,
  syncPeerIdHash: HASH_E,
  surfaceKind: 'mobile',
  diagnosedAt: FIXTURE_NOW_ISO,
};

// ── Canonical manifest used by the validator tests ─────────────────────

/**
 * Manifest used by fixture tests. Mirrors the F10.1 platform-capabilities
 * declarations so the validator has a known good lookup target.
 */
export const FIXTURE_MANIFEST: PlatformCapabilityManifest = {
  platforms: {
    'desktop-studio': {
      schema: 'h2o.platform.capabilities.v1',
      platformId: 'desktop-studio',
      surfaceKind: 'desktop-tauri',
      authorityLevel: 'strong-local-authority',
      capabilities: {
        read: true,
        produceEvidence: true,
        preview: true,
        propose: true,
        conflictReview: true,
        apply: 'gated',
        delete: 'f5-gated',
        export: true,
        cache: 'non-authoritative',
        transport: ['local-bundle'],
        syncOutward: 'bundle-export',
      },
      forbidden: ['silent-overwrite', 'ungated-delete', 'remote-apply-without-review'],
    },
    'chrome-studio': {
      schema: 'h2o.platform.capabilities.v1',
      platformId: 'chrome-studio',
      surfaceKind: 'browser-studio',
      authorityLevel: 'preview-coordinator',
      capabilities: {
        read: true,
        produceEvidence: true,
        preview: true,
        propose: false,
        conflictReview: 'display-only',
        apply: false,
        delete: false,
        export: 'browser-state-only',
        cache: 'non-authoritative',
      },
      forbidden: ['silent-overwrite', 'desktop-db-apply', 'ungated-delete'],
    },
    'native-extension': {
      schema: 'h2o.platform.capabilities.v1',
      platformId: 'native-extension',
      surfaceKind: 'browser-runtime',
      authorityLevel: 'evidence-producer',
      capabilities: {
        read: true,
        produceEvidence: true,
        preview: 'limited',
        propose: false,
        conflictReview: false,
        apply: false,
        delete: false,
        export: false,
        cache: 'local-runtime-only',
      },
      forbidden: ['direct-desktop-db-mutation', 'direct-apply', 'delete-propagation'],
    },
    mobile: {
      schema: 'h2o.platform.capabilities.v1',
      platformId: 'mobile',
      surfaceKind: 'mobile',
      authorityLevel: 'read-only',
      capabilities: {
        read: true,
        produceEvidence: 'metadata-only',
        preview: true,
        propose: false,
        conflictReview: false,
        apply: false,
        delete: false,
        export: false,
        cache: 'metadata-only-non-authoritative',
      },
      forbidden: ['archive-store-import', 'mobile-write-back', 'direct-apply'],
    },
  },
};

/**
 * Set of capability-snapshot hashes the fixture consumer accepts.
 */
export const FIXTURE_KNOWN_SNAPSHOTS: ReadonlySet<string> = new Set([HASH_SNAPSHOT]);

/** Reference "now" used by fixture-driven stale tests. */
export const FIXTURE_NOW: string = FIXTURE_NOW_ISO;

// ── Per-kind fixtures ──────────────────────────────────────────────────

function baseFields(over: Partial<CrossPlatformEnvelope>): CrossPlatformEnvelope {
  return {
    schema: 'h2o.crossPlatform.envelope.v1',
    envelopeVersion: 'v1',
    envelopeKindVersion: 'v1',
    kind: 'evidence',
    id: FIXTURE_ENVELOPE_ID_DESKTOP,
    lineageId: FIXTURE_ENVELOPE_ID_LINEAGE,
    createdAt: FIXTURE_NOW_ISO,
    sequence: 1,
    exportSequence: null,
    sourcePlatform: {
      platformId: 'desktop-studio',
      surfaceKind: 'desktop-tauri',
      sourcePeerEnvelope: PEER_DESKTOP,
    },
    declaredAuthority: 'strong-local-authority',
    effectiveAuthority: 'strong-local-authority',
    capabilityUsed: 'produceEvidence',
    capabilitySnapshotHash: HASH_SNAPSHOT,
    subjectType: 'folder.metadata',
    subjectId: HASH_A,
    operation: 'folder-metadata-observed',
    redactionClass: 'redacted',
    dryRun: null,
    transactional: null,
    dedupeKey: HASH_A,
    payloadHash: HASH_B,
    eventDigest: HASH_C,
    payload: {
      observationKind: 'folder-list-digest',
      observedAtIso: FIXTURE_NOW_ISO,
    },
    warnings: [],
    blockers: [],
    ...over,
  };
}

export const fixtureEvidence: CrossPlatformEnvelope = baseFields({
  kind: 'evidence',
  operation: 'folder-list-digest-observed',
  payload: {
    observationKind: 'folder-list-digest',
    observedAtIso: FIXTURE_NOW_ISO,
    folderCount: 42,
  },
});

export const fixturePreview: CrossPlatformEnvelope = baseFields({
  kind: 'preview',
  id: '01HZX0YKJM7P6A0B0C0D0E0F0N',
  operation: 'synthetic-cleanup-dry-run',
  capabilityUsed: 'preview',
  dryRun: true,
  transactional: true,
  payload: {
    predicateVersion: 'h2o.studio.sync.synthetic-marker.v1',
    previewToken: 'ptok1:' + 'a'.repeat(64),
    wouldDeleteRows: { tombstones: 3, reviews: 1, total: 4 },
  },
});

export const fixtureProposal: CrossPlatformEnvelope = baseFields({
  kind: 'proposal',
  id: '01HZX0YKJM7P6A0B0C0D0E0F0P',
  operation: 'reviewed-folder-binding-tombstone-proposal',
  operationIntent: 'review',
  capabilityUsed: 'propose',
  dryRun: null,
  transactional: null,
  payload: {
    justifyingEvidenceDigests: [HASH_C],
    proposedOperation: 'review-folder-binding-tombstone',
    expectedPostState: { status: 'reviewed' },
    predicateVersion: 'h2o.studio.sync.f5-review.v1',
  },
});

export const fixtureConflictCandidate: CrossPlatformEnvelope = baseFields({
  kind: 'conflictCandidate',
  id: '01HZX0YKJM7P6A0B0C0D0E0F0Q',
  operation: 'folder-metadata-divergence-detected',
  operationIntent: 'update',
  capabilityUsed: 'conflictReview',
  dryRun: null,
  transactional: null,
  payload: {
    requesterState: { hash: HASH_A },
    counterpartState: { hash: HASH_B },
    commonAncestorHash: HASH_C,
    divergenceReason: 'concurrent-mutation',
  },
});

export const fixtureApplyEvent: CrossPlatformEnvelope = baseFields({
  kind: 'applyEvent',
  id: '01HZX0YKJM7P6A0B0C0D0E0F0R',
  operation: 'folder-metadata-color-apply',
  operationIntent: 'update',
  capabilityUsed: 'apply',
  dryRun: false,
  transactional: true,
  payload: {
    auditMaintenanceId: 'audit-' + HASH_D.slice(0, 16),
    preState: { hash: HASH_A },
    postState: { hash: HASH_B },
    predicateVersion: 'h2o.studio.sync.f7-color-apply.v1',
  },
});

export const fixtureBundle: CrossPlatformEnvelope = baseFields({
  kind: 'bundle',
  id: '01HZX0YKJM7P6A0B0C0D0E0F0S',
  operation: 'desktop-latest-json-export',
  capabilityUsed: 'export',
  dryRun: null,
  transactional: null,
  payload: {
    envelopes: [fixtureEvidence, fixtureApplyEvent] as CrossPlatformEnvelope[],
    bundleSequence: 7,
    bundleHash: HASH_E,
  },
});

export const fixtureCacheMetadata: CrossPlatformEnvelope = baseFields({
  kind: 'cacheMetadata',
  id: FIXTURE_ENVELOPE_ID_MOBILE,
  sourcePlatform: {
    platformId: 'mobile',
    surfaceKind: 'mobile',
    sourcePeerEnvelope: PEER_MOBILE,
  },
  declaredAuthority: 'read-only',
  effectiveAuthority: 'read-only',
  capabilityUsed: 'cache',
  capabilitySnapshotHash: HASH_SNAPSHOT,
  subjectType: 'mobile.cache.status',
  operation: 'mobile-metadata-cache-snapshot',
  redactionClass: 'metadata-only',
  dryRun: null,
  transactional: null,
  payload: {
    lastIngestedBundleSequence: 7,
    mirrorEntityCount: 42,
  },
});

// Additional reusable single-purpose fixtures used by tests.

export const fixtureChromeEvidence: CrossPlatformEnvelope = baseFields({
  kind: 'evidence',
  id: FIXTURE_ENVELOPE_ID_CHROME,
  sourcePlatform: {
    platformId: 'chrome-studio',
    surfaceKind: 'browser-studio',
    sourcePeerEnvelope: PEER_CHROME,
  },
  declaredAuthority: 'preview-coordinator',
  effectiveAuthority: 'preview-coordinator',
  capabilityUsed: 'produceEvidence',
  capabilitySnapshotHash: HASH_SNAPSHOT,
  subjectType: 'folder.metadata',
  operation: 'chrome-folder-digest-observed',
  payload: {
    observationKind: 'chrome-folder-digest',
    observedAtIso: FIXTURE_NOW_ISO,
  },
});

export const fixtureNativeEvidence: CrossPlatformEnvelope = baseFields({
  kind: 'evidence',
  id: FIXTURE_ENVELOPE_ID_NATIVE,
  sourcePlatform: {
    platformId: 'native-extension',
    surfaceKind: 'browser-runtime',
    sourcePeerEnvelope: PEER_NATIVE,
  },
  declaredAuthority: 'evidence-producer',
  effectiveAuthority: 'evidence-producer',
  capabilityUsed: 'produceEvidence',
  capabilitySnapshotHash: HASH_SNAPSHOT,
  subjectType: 'chat.evidence',
  operation: 'native-extension-chat-evidence-captured',
  payload: {
    observationKind: 'chat-captured',
    observedAtIso: FIXTURE_NOW_ISO,
  },
});
