# F10.2.0 — Cross-Platform Envelope v1

## Status

F10.2.0 is the shared cross-platform envelope specification. It is a stable
documentation contract for cross-platform messages, not a runtime, not a bridge,
and not an apply path.

No bridge is active from this document. No write behavior changes. No import,
export, sync, cache, WebDAV, mobile, Chrome, Native Extension, or Desktop
runtime behavior changes are introduced here.

F10.2.1 (optional static schema helper) and F10.2.2 (validation script) require
separate authorization and are not started by this document. F10.3 bridge
implementation, F10.6 future transports, and F10.7 remote apply remain
forbidden by F10.1 and are not advanced here.

## Executive Summary

The envelope is the single narrow waist of the cross-platform stack. Above it,
each platform encodes its native artifacts (Desktop's tombstone/review/apply
tables, Chrome's `chrome.storage`, the Native Extension's content-script
observations, mobile's read-only cache) into envelopes. Below it, each
transport (`latest.json`, `chrome.storage`, `chrome.runtime` messaging, file
picker, future cloud) carries envelopes opaquely.

By collapsing diversity into one shape, F10.2 makes safety properties
enforceable in one place. It also makes platform spoofing, payload leakage,
and replay-as-apply categorically detectable.

Key safety properties carried forward from prior phases:

- The envelope is the **shared cross-platform contract**, not a bridge.
- The envelope is **not a command**. Receipt does not imply execution.
- The envelope **does not introduce apply behavior**. Existing apply paths
  (F5G.4 reviewed-tombstone apply, F5H.3b.1a preview token surface, F6
  conflict review decisions, F7 local color apply) remain the only ways state
  changes; none of them are triggered by envelope receipt.
- **Authority is determined by the F10.1 platform capability manifest**,
  validated against the producing platform's declared identity. Transport
  contributes zero authority. Payload contributes zero authority.

## Envelope Base Shape

The canonical v1 shape:

```ts
type CrossPlatformEnvelope = {
  // ── Schema identity ─────────────────────────────────────────────
  schema: "h2o.crossPlatform.envelope.v1";
  envelopeKind: EnvelopeKind;
  envelopeKindVersion: "v1";

  // ── Source attribution (from F10.1 manifest) ────────────────────
  sourcePlatform: {
    platformId: PlatformId;
    surfaceKind: SurfaceKind;
    authorityLevel: AuthorityLevel;
    sourcePeerEnvelope: RedactedPeerEnvelope;
  };

  // ── What this envelope is about ─────────────────────────────────
  capabilityUsed: CapabilityName;
  entityKind: EntityKind;
  operation: OperationName;

  // ── Provenance ──────────────────────────────────────────────────
  createdAt: string;
  sequence: number | null;
  exportSequence: number | null;
  dedupeKeyHash: string;
  eventDigest: string;

  // ── Posture flags ───────────────────────────────────────────────
  redacted: boolean;
  dryRun: boolean | null;
  transactional: boolean | null;

  // ── Body ────────────────────────────────────────────────────────
  payload: KindSpecificPayload;

  // ── Diagnostic ──────────────────────────────────────────────────
  warnings: string[];
  blockers: string[];
};
```

### Field Notes

| Field | Notes |
|---|---|
| `schema` | Literal `"h2o.crossPlatform.envelope.v1"`. Bumped only on a breaking change. Schema bumps must be announced in this document one release before any platform emits the new schema. |
| `envelopeKind` | One of the seven kinds in §3. Determines payload shape and consumer dispatch. |
| `envelopeKindVersion` | Per-kind version. Allows `evidence v1` and `applyEvent v2` to coexist without bumping the overall envelope schema. |
| `sourcePlatform.platformId` | One of: `"desktop-studio"`, `"chrome-studio"`, `"native-extension"`, `"mobile"`. Drives F10.1 manifest lookup. |
| `sourcePlatform.surfaceKind` | One of: `"desktop-tauri"`, `"browser-studio"`, `"browser-runtime"`, `"mobile"`. Cross-checked against `authorityLevel` (§4.3). |
| `sourcePlatform.authorityLevel` | One of the F10.1 authority levels (`"none"`, `"read-only"`, `"evidence-producer"`, `"preview-coordinator"`, `"proposal-source"`, `"strong-local-authority"`, `"audited-apply-authority"`). |
| `sourcePlatform.sourcePeerEnvelope` | F2-shaped peer envelope with redacted IDs. Identity for routing, never trusted for authority. |
| `capabilityUsed` | Must be on the F10.1 manifest entry for `sourcePlatform.platformId`. Validated per §4.2. |
| `entityKind` | The kind of entity the envelope describes (e.g. `"folder.metadata"`, `"folderBinding"`, `"tombstone.review"`, `"chat.evidence"`). Free-form string with platform-specific guards. |
| `operation` | The specific operation, e.g. `"folder-metadata-color-apply"`, `"reviewed-folder-binding-tombstone-apply"`, `"synthetic-cleanup-dry-run"`. Free-form per kind. |
| `createdAt` | ISO seconds UTC. |
| `sequence` | Per-producer-peer monotonic envelope sequence from F3. `null` if the producer is not a sequenced surface. Used for gap detection. |
| `exportSequence` | Optional secondary monotonic sequence within a single bundle, used to preserve order across multiple kinds in one bundle. |
| `dedupeKeyHash` | sha256 of the per-kind canonical dedupe input. Same logical event yields same hash; consumers dedupe by it. See §6. |
| `eventDigest` | sha256 of the entire canonical envelope minus `warnings`, `blockers`, and `eventDigest` itself. Detects literal duplicates in transit and supports forward references. |
| `redacted` | Defaults to `true`. Flipping to `false` requires the gated route described in §5.2. |
| `dryRun` | `true` for `preview` envelopes, `false` for `applyEvent`, `null` for kinds where the field is meaningless (`evidence`, `proposal`, `conflictCandidate`, `bundle`, `cacheMetadata`). |
| `transactional` | `true` for transactional apply / dry-run kinds, `null` otherwise. |
| `payload` | Per-kind shape. Validator rejects unknown fields and forever-no field names (§5.3). |
| `warnings` | Code strings from a fixed allowlist. **Not** a free-text channel (§5.4). |
| `blockers` | Code strings from a fixed allowlist. Empty on a well-formed envelope. |

### Fields Deliberately Absent

The shape deliberately does **not** carry:

| Absent field | Why it is absent |
|---|---|
| `targetPlatform` | Envelopes are broadcast/observed, not addressed. A consumer chooses to attend; a producer never commands. Adding this would invite point-to-point routing logic that turns envelopes into RPCs. |
| `action` / `command` | Adding such a field would invite consumers to dispatch by it. The envelope is a *type*, not an *instruction*. |
| Raw IDs at the top level | All IDs live inside `payload`, where they are redaction-gated and per-kind validated. Top-level IDs would bypass the gates. |
| Content fields | Chat bodies, message text, attachment bytes, snapshot bodies, OS file paths, URLs, and credentials are **never** carried by any envelope at any level (§5.3). |

## Envelope Kinds

Seven kinds. Each has a distinct lifecycle, consumer dispatch, and authority
requirement.

### evidence

| Aspect | Value |
|---|---|
| Meaning | Observation of state. "I saw X." Not a request, not a command, not a proposal. |
| Producers | All four platforms (any authority level at or above `evidence-producer`). Mobile produces only `metadata-only` evidence per F10.1. |
| Consumers | Studio surfaces for diagnostic display; F1 diff analyzer; F7 bidirectional preview comparator (as input). |
| Payload expectations | The observed state — folder list digest, tombstone log digest, peer health snapshot, capture history. Digests over enumerations; per-row evidence requires explicit justification and capping. |
| Required fields | `dryRun: null`, `transactional: null`, `payload.observationKind`, `payload.observedAtIso`. |
| Apply implication | **None.** Receiving evidence — even millions of envelopes — never moves a row. |

### preview

| Aspect | Value |
|---|---|
| Meaning | Counterfactual diagnostic. "If applied, would result in X." Always dry-run. |
| Producers | Platforms at `preview-coordinator` authority or stronger (chrome-studio, desktop-studio). |
| Consumers | Studio surfaces for operator display. |
| Payload expectations | The counterfactual — would-delete IDs (F5H.3b cleanup), would-converge folder digest (F7), would-resolve conflict (F6 dry-run ingest). |
| Required fields | `dryRun: true`, `transactional` typically `true` (transactional dry-run shape), `payload.predicateVersion`, `payload.previewToken` when applicable (F5H.3b.1a-style). |
| Apply implication | **None.** The token may later be echoed back to a separately-gated apply path, but the preview envelope itself never applies anything. |

### proposal

| Aspect | Value |
|---|---|
| Meaning | Explicit request to apply, awaiting operator review. |
| Producers | Platforms at `proposal-source` authority or stronger. Currently only Desktop Studio per F10.1. Chrome Studio gains this capability only when explicitly upgraded by a future F10 phase, and Mobile remains read-first until later. |
| Consumers | Desktop Studio review UI (F5 `sync_tombstone_reviews`, F6 conflict queue). |
| Payload expectations | The proposed change with full provenance — the originating evidence digest(s), the predicate that justifies it, the operator who initiated it (or `null` if surfaced automatically by a diagnostic). |
| Required fields | `payload.justifyingEvidenceDigests: string[]`, `payload.proposedOperation`, `payload.expectedPostState`, `payload.predicateVersion`. |
| Apply implication | **None until reviewed.** A proposal must be turned into an `applyEvent` by a strong-authority platform; the proposal envelope itself does not move rows. |

### conflictCandidate

| Aspect | Value |
|---|---|
| Meaning | Detection of divergence between two evidence streams. Not yet a durable conflict row. |
| Producers | Platforms comparing two evidence streams. Currently only Desktop Studio (the only strong authority that runs the F7 comparator). |
| Consumers | F6 conflict queue **ingest** — one-at-a-time, operator-clicked. **Never auto-enqueue.** |
| Payload expectations | Two divergent states, the common ancestor (if known), the divergence reason. |
| Required fields | `payload.requesterState`, `payload.counterpartState`, `payload.commonAncestorHash`, `payload.divergenceReason`. |
| Apply implication | **None.** Even after F6 ingests it, the resulting conflict row still requires explicit operator resolution before any apply runs. |

### applyEvent

| Aspect | Value |
|---|---|
| Meaning | Past-tense audit record of a change that **already happened** on the producing platform. |
| Producers | Strong-authority platforms only. In F10's current scope this means Desktop Studio. Chrome Studio, Native Extension, and Mobile never produce `applyEvent`. |
| Consumers | Other platforms for read-only display and their own evidence-stream invalidation. Consumers do **not** mirror the apply locally. |
| Payload expectations | What was applied — the operation, the entity ID, the pre/post state hashes, the audit row ID from the local maintenance log, the preview token (if applicable from F5H.3b.1b). |
| Required fields | `dryRun: false`, `transactional: true`, `payload.auditMaintenanceId`, `payload.preState`, `payload.postState`, `payload.predicateVersion`. |
| Apply implication | **None on consumers.** A consumer reading an `applyEvent` learns the producer changed something. The consumer does not mirror; mirroring is a separate decision via the proposal pipeline. |

### bundle

| Aspect | Value |
|---|---|
| Meaning | Container for multiple envelopes shipped together. The `latest.json` shape and any future export packet is a bundle. |
| Producers | Export step on any platform that has `export` capability per F10.1 (currently Desktop Studio). |
| Consumers | Import step on any platform with the corresponding read transport. |
| Payload expectations | An ordered array of `CrossPlatformEnvelope`. No nested bundles in v1. |
| Required fields | `payload.envelopes: Envelope[]`, `payload.bundleSequence`, `payload.bundleHash` (sha256 of canonical concatenation). |
| Apply implication | **None.** Unpacking a bundle is purely structural; each contained envelope keeps its own apply semantics and is validated independently. |

### cacheMetadata

| Aspect | Value |
|---|---|
| Meaning | Read-only mirror state, explicitly non-authoritative. The shape mobile and any future read-only platform uses to surface "what does this surface see right now." |
| Producers | `read-only` authority platforms (mobile). |
| Consumers | Studio surfaces for diagnostic display only. |
| Payload expectations | The mirror snapshot — what the read-only platform believes the current state to be, plus the last ingested bundle sequence. |
| Required fields | `payload.lastIngestedBundleSequence`, `payload.mirrorEntityCount`. Payload field allowlist enforced per §4.4. |
| Apply implication | **None and forever-none.** `cacheMetadata` is the only kind with a hard-coded routing contract: **no consumer code path may ever route from `cacheMetadata` to any write.** This invariant is documented here and is the basis for the future F10.2.2 CI scan. |

### Kind Distinction Summary

| Statement | Why it matters |
|---|---|
| evidence is **not** a command | Evidence records observation. Acting on it requires a proposal and review. |
| preview is **dry-run** | A preview never applies. Its token may later authorize a separately-gated apply, but the preview itself is read-only. |
| proposal **awaits review** | A proposal is a request, not an execution. Only review on a strong-authority platform turns it into an apply. |
| conflictCandidate is **not** a durable conflict until F6 ingest | Detection of divergence ≠ enqueueing. F6 ingest is the explicit, operator-driven step that creates a durable row. |
| applyEvent is a **past-tense receipt**, not a remote command | The apply already happened on the producer. Consumers do not re-apply. |
| bundle is **transport container only** | Bundles carry envelopes; they do not change the envelopes' meaning. |
| cacheMetadata is **forever non-authoritative** | No future phase converts cacheMetadata into a write trigger without an explicit envelope schema bump and a multi-file diff. |

## Platform Validation Rules

Every envelope passes through validation that consults the F10.1 manifest.
Validation is identical across consuming platforms.

### Kind ↔ Authority Matrix

| Platform | Authority level (F10.1) | Allowed kinds (producer) | Forbidden kinds (producer) |
|---|---|---|---|
| `native-extension` | `evidence-producer` | `evidence`, `cacheMetadata` (runtime cache only) | `proposal`, `conflictCandidate`, `applyEvent`, `preview`, `bundle` |
| `chrome-studio` | `preview-coordinator` | `evidence`, `preview` | `proposal`, `conflictCandidate`, `applyEvent` (Desktop runs the comparator), `bundle` (export not allowed per F10.1) |
| `desktop-studio` | `strong-local-authority` | All seven kinds | (none) |
| `mobile` | `read-only` | `evidence` (metadata-only), `cacheMetadata` | `proposal`, `conflictCandidate`, `applyEvent`, `preview`, `bundle` |

Rejection: `blocker: "platform-not-authorized-for-kind"`.

### Capability ↔ Kind Matrix

`capabilityUsed` must be on the F10.1 capability allowlist for
`sourcePlatform.platformId`. Examples:

| `capabilityUsed` | Allowed envelope kinds |
|---|---|
| `produceEvidence` | `evidence`, `cacheMetadata` |
| `preview` | `preview` |
| `propose` | `proposal` |
| `conflictReview` | `conflictCandidate` (production); ingest is internal |
| `apply` (Desktop-only) | `applyEvent` |
| `delete` (Desktop-only, F5-gated) | `applyEvent` for delete operations |
| `export` (Desktop-only) | `bundle` |
| `cache` | `cacheMetadata` |

Rejection: `blocker: "capability-not-on-platform-allowlist"`.

### Surface ↔ Authority Sanity

`sourcePlatform.surfaceKind` and `sourcePlatform.authorityLevel` must be a
valid pair per F10.1. Examples of allowed pairs:

| `surfaceKind` | Allowed `authorityLevel` values |
|---|---|
| `desktop-tauri` | `strong-local-authority` |
| `browser-studio` | `preview-coordinator` |
| `browser-runtime` | `evidence-producer` |
| `mobile` | `read-only` |

Rejection: `blocker: "surface-authority-mismatch"`.

This catches accidental misconfiguration. It does not stop a maliciously
crafted envelope (see §10 R2 — platform spoofing).

### Mobile-Specific Guards

Mobile's contract is the strictest:

- Mobile never appears as `sourcePlatform` on `applyEvent`. Hard-coded
  rejection regardless of any other field state.
- Mobile envelopes carrying `payload` fields outside the `cacheMetadata`
  allowlist are rejected with `blocker: "mobile-payload-outside-allowlist"`.
- Mobile envelopes with `redacted: false` are rejected with
  `blocker: "mobile-must-redact"`. No exception. This remains true even if
  Mobile gains proposal capability in a later phase.

### Native-Extension-Specific Guards

- Native-extension envelopes carrying `entityKind` outside the evidence scope
  (e.g. `"chat.evidence"`, `"session.evidence"`, `"capture.evidence"`) are
  rejected with `blocker: "native-extension-entity-outside-evidence-scope"`.
- Native-extension envelopes that would imply a tombstone (`entityKind`
  beginning with `"tombstone."` or `operation` containing delete semantics)
  are rejected with `blocker: "native-extension-not-authorized-for-tombstones"`.

### Version Skew Behavior

If `schema` or `envelopeKindVersion` is newer than the consumer recognizes,
the envelope is rejected with `blocker: "envelope-schema-too-new"` and
surfaced as a warning in operator diagnostics. The consumer does **not**
attempt partial parsing. If `schema` is older than the consumer's minimum
supported version, the envelope is rejected with
`blocker: "envelope-schema-too-old"`.

## Redaction Rules

`redacted: true` is the default for every envelope on every platform.

### What Is Allowed At Each Redaction Level

| Field family | `redacted: true` (default) | `redacted: false` (gated) |
|---|---|---|
| Peer IDs (`syncPeerId`, `physicalDeviceId`, `installId`) | Redacted F2 shape (`H2O.Studio.identity.diagnose()` output) | Same redacted F2 shape — **raw peer IDs never appear, even when redaction is off**. The flip ungates payload content, not identity. |
| Entity IDs (`folderId`, `chatId`, `tombstoneId`) | Sha256 hash of `(entityKind + entityId + perRunSalt)` | Plain IDs allowed |
| Hashes (`predecessorHash`, `eventDigest`, `dedupeKeyHash`, `previewToken`) | Always present, never redacted (hashes are not sensitive) | Same |
| Display names (folder name, chat title) | Always omitted | Allowed, length-capped (≤ 200 chars) |
| Counts (rows, folders, candidates) | Always allowed | Same |
| Allowlisted snapshot fields (F7 folder-metadata `color`, `archived`, `parentFolderId`) | Allowed | Same |
| ISO timestamps | Allowed | Same |
| Predicate version strings | Always allowed | Same |
| Chat content / message bodies / attachments | **Never** | **Never** |
| URLs, file paths, OS user names | **Never** | **Never** |
| Tokens, API keys, credentials | **Never** (`previewToken` is an explicit exception — see §5.3) | **Never** (same exception) |

### Gated Redaction Flip

`redacted: false` is permitted only when **all** of the following hold:

1. The consumer is Desktop Studio. Desktop is the only surface that ever sees
   unredacted envelopes.
2. The producer is on the same physical device as the consumer
   (`sourcePlatform.sourcePeerEnvelope.physicalDeviceId` matches the local
   device).
3. The operator has explicitly opted in via a future feature flag (default
   off).
4. The envelope kind is `evidence` or `preview`. `proposal`, `applyEvent`,
   `conflictCandidate`, `bundle`, and `cacheMetadata` stay redacted regardless
   of flag because they may travel further than the producing device.

Any other consumer (chrome-studio, native-extension, mobile) treats
`redacted: false` as `redacted: true` for display and emits a warning. The
flip cannot leak content cross-platform.

### Content Forever-No List

The following are **never** carried by any envelope at any redaction level on
any platform:

- Chat content
- Message bodies
- Attachment bytes
- Snapshot bodies
- OS file paths
- URLs
- Credentials
- API keys
- Tokens — with the single explicit exception of `previewToken`
  (deterministic, content-free hash defined by F5H.3b.1a; not a secret)

This is a **structural** property: validation rejects payloads containing
field names that match the forever-no deny list (`content`, `body`, `text`,
`messages`, `attachments`, `url`, `path`, `password`, `token` outside of
`previewToken`, `apiKey`, ...). Producers who need to surface a reference to
forever-no content must surface a **hash** of the reference, never the
reference itself.

### Warnings And Blockers Are Code Strings, Not Content

`warnings[]` and `blockers[]` must be **code strings from a fixed allowlist**,
not free-text content. This prevents producers from using diagnostic fields
as a side-channel to leak content past the payload validator.

Example allowed codes: `"counterpart-digest-unavailable"`,
`"preview-token-skipped"`, `"rollback-verification-failed"`,
`"mobile-payload-outside-allowlist"`.

Unknown warning or blocker codes cause validation to add a meta-warning
`"unknown-warning-code"` and surface the envelope for operator review; they
do not auto-promote the unknown code.

## Dedupe / Replay Model

### Two Hashes, Two Purposes

| Hash | Inputs | Purpose |
|---|---|---|
| `dedupeKeyHash` | sha256 of canonical `(platformId, entityKind, operation, payload.dedupeFields)` where `dedupeFields` is a per-kind allowlisted subset (e.g. for `tombstone.review.proposal`: `{tombstoneId, reviewId, decision}`) | "Same logical event." Two envelopes with the same `dedupeKeyHash` describe the same intent. A consumer's local processor skips the second occurrence. |
| `eventDigest` | sha256 of the entire canonical envelope minus `warnings`, `blockers`, and `eventDigest` itself | "Same byte-for-byte envelope." Used to detect literal duplicates in transit and for forward references (e.g. `applyEvent.payload.justifyingProposalDigest`). |

`dedupeKeyHash` provides intent-level idempotency; `eventDigest` provides
transport-level idempotency.

### Sequence And Export Sequence

| Field | Meaning |
|---|---|
| `sequence` | Per-producer-peer monotonic envelope sequence from F3. "This is the Nth envelope this peer ever produced." Used for gap detection on the consumer. |
| `exportSequence` | Optional secondary monotonic sequence within a single bundle. Used to preserve order across multiple kinds in one bundle when `sequence` alone is insufficient. |

A consumer that sees `sequence: 14` after `sequence: 12` from the same peer
learns: **gap**, request `sequence: 13`. A consumer that sees `sequence: 12`
again learns: **replay**, dedupe.

### Replay Invariant

> **Replaying an envelope must never trigger apply or produce side effects
> beyond the first idempotent diagnostic/mirror update. An `applyEvent`
> envelope received by a non-authority consumer never triggers apply at any
> time, including on first receipt.**

Concretely:

- A consumer processes `evidence`, `preview`, `proposal`, `conflictCandidate`,
  `cacheMetadata` envelopes by updating diagnostic views and local mirrors.
  Replaying re-runs the same update; the update is idempotent because it is
  keyed by `dedupeKeyHash`.
- A consumer processes `applyEvent` envelopes by updating its display of
  "what the authoritative platform reports." It does **not** mirror the apply
  locally. Replay re-displays the same audit record; no row moves.
- The producer of an `applyEvent` does **not** treat its own outgoing envelope
  as a command — the apply already happened locally before the envelope was
  created. The envelope is past-tense receipt only.

### No Automatic Apply From Any Replayed Envelope

There is **no envelope kind** that, on receipt, drives a write on the
consumer. The only write paths in the system are F5G.4 (Desktop, in-process,
transactional), F5H.3b.1b real cleanup (Desktop, in-process, transactional;
not yet implemented), F6 conflict-queue resolution (Desktop, operator-driven),
and F7 exact-gated local color apply (Desktop, in-process, transactional).
None of these are triggered by envelope receipt. They are triggered by
operator action or by F-phase internal code that may produce an `applyEvent`
afterward, never consume one as a trigger.

This is a structural guarantee, not a runtime check. The codebase contains
no path from "envelope received" to "row written," and this document declares
that absence as an invariant for code review and for the future F10.2.2 CI
scan.

## Mapping To F5–F9 Artifacts

Persistent state is platform-local. Envelopes are the wire form crossing
platform boundaries.

| Existing artifact | F10.2 envelope kind | Notes |
|---|---|---|
| **F5** `sync_tombstones` row (Desktop) | Internal SQL only — not an envelope. The decision to create one may be motivated by an incoming `proposal` envelope, but the row itself is local. |
| **F5** `sync_tombstone_reviews` row | Internal SQL only |
| **F5G.4** `applyReviewedFolderBindingTombstone` Tauri return | `applyEvent` with `payload.operation = "reviewed-folder-binding-tombstone-apply"`, `payload.auditMaintenanceId`, `payload.preState`, `payload.postState` |
| **F5H.3b.0d** transactional dry-run result | `preview` with `payload.predicateVersion = "h2o.studio.sync.synthetic-marker.v1"`, `dryRun: true`, `transactional: true` |
| **F5H.3b.1a** `previewToken` + `candidateIds` surface | `preview` (same as above) plus `payload.previewToken`, `payload.candidateIds`, `payload.dbFingerprint`, `payload.expectedCounts` |
| **F5H.3b.1b** (future) real cleanup commit | `applyEvent` with `payload.previewTokenEchoed`, `payload.dbFingerprintEchoed` proving the operator-supplied token matched the server's recomputation. Not yet implemented; documented here for envelope shape continuity. |
| **F6** conflict candidate produced for ingest | `conflictCandidate` envelope. Resulting queue row is internal SQL. Subsequent resolution produces a new `applyEvent`. |
| **F6** conflict queue ingest decision | `applyEvent` with `payload.operation` describing the resolution (e.g. `"f6-conflict-resolved"`). |
| **F7** bidirectional preview (per F7.0 plan) | `preview` envelope with `payload.predicateVersion = "h2o.studio.sync.bidirectional-preview.v0"`, two-sided per-peer state inside `payload`. Divergent entries become `conflictCandidate` envelopes only if explicitly extracted (F7.4+). |
| **F7** local folder color apply | `applyEvent` with `payload.operation = "folder-metadata-color-apply"`, `payload.baseHash`, `payload.targetHash`, `payload.auditMaintenanceId`. |
| **F8** `syncApplyEvents` (Chrome-side mirror of apply audit) | Each Chrome-side row corresponds to one received `applyEvent` envelope. The row is the local mirror; the envelope is the wire form. F8 remains evidence-only on the receiver side; no remote apply is triggered. |
| **F9** mobile cache metadata | `cacheMetadata` envelopes, mobile as producer, Desktop as consumer (for diagnostic display only). Mobile never sees other envelope kinds. |
| **Desktop `latest.json` bundle** | `bundle` envelope wrapping an ordered array of `evidence` and `applyEvent` envelopes. |
| **Mobile diagnostics** (F9) | `cacheMetadata` envelopes only. |
| **F1** multi-peer diff | F1's per-peer state collection is internalized. When externalized for cross-platform display, it surfaces as `evidence` envelopes. F1 itself remains a pure JS analyzer. |
| **F2** peer identity diagnose | `evidence` envelope with `entityKind = "peer.identity"` and a redacted F2 envelope as payload. |
| **F3** envelope stamping | F3 is the source of `sourcePlatform.sourcePeerEnvelope` and `sequence` on every envelope. F3's existing stamping function does not require change to satisfy F10.2. |
| **F4** per-peer transport (deferred) | Will become one of the transports listed in §8. The envelope shape is unchanged by F4's eventual implementation. |

Two artifact families never produce envelopes by themselves:

- F5 tombstone tables — only the F5G.4 apply step produces an envelope.
- F6 conflict queue rows — only `conflictCandidate` envelopes feed ingest; the
  queue rows themselves remain internal.

This boundary keeps persistent state platform-local and reserves envelopes
for crossing platform boundaries.

## Transport Independence

### Allowed Transports

| Transport | Direction | Status | Notes |
|---|---|---|---|
| `latest.json` (Desktop write → Chrome read) | one-way Desktop→Chrome | Live | Already in production. Becomes a `bundle` envelope at the wire level. |
| `chrome.storage` (Chrome internal) | intra-platform | Live | Chrome Studio reads/writes its own state; envelopes used for diagnostics within Chrome. |
| `chrome.runtime` extension messaging (Native Extension ↔ Chrome Studio) | intra-Chrome | Live | Native extension publishes `evidence`; Chrome Studio consumes. |
| File picker (Desktop ↔ operator) | manual | Live | Bundles exported to disk, imported on another device. |
| iCloud Drive / OneDrive / similar local file relay (Desktop → Mobile) | one-way Desktop→Mobile | F9 scope | Mobile reads `bundle` from a local file relay; never writes back. |
| Future cloud / WebDAV | TBD | **Not authorized.** | Out of scope for F10.2 and explicitly forbidden by F10.6 until a separate safety model approves it. |
| Signed envelope transport | TBD | **Not authorized.** | Future enhancement; would authenticate producer identity but not change authority. Documented under §10 R2. |

### Transport-Neutrality Contract

The envelope shape is **identical** across all transports. A `preview`
envelope produced by Desktop and persisted to disk is byte-for-byte identical
to the same envelope sent through `chrome.runtime` messaging.

Consequences:

- Transport changes do not require envelope schema changes.
- Adding a new transport (e.g. F10.6 cloud) does not require any F10.2 update.
- Removing a transport does not break envelope validity.

### Authority Is Independent Of Transport

> **Transport contributes zero authority. The authority of an envelope is
> determined solely by `sourcePlatform.authorityLevel`, validated against the
> F10.1 manifest entry for `sourcePlatform.platformId`.**

Concretely:

- A `chrome-studio` envelope manually saved to disk and imported via the
  Desktop file picker does **not** become a Desktop envelope. It remains
  `chrome-studio`, with `preview-coordinator` authority. Desktop validates
  it; Desktop's own apply logic decides what to do with the proposal (if
  any).
- An envelope arriving via a "more trusted" transport (e.g. Tauri file
  picker) is **not** given more weight than the same envelope arriving via a
  "less trusted" transport (e.g. clipboard). They are the same envelope.
- Transport-level signing (if/when added in a future phase) augments producer
  authentication but **does not augment authority**. A signed envelope from
  `chrome-studio` is still `preview-coordinator`; signing only proves the
  producer's identity, not its capability.

This rule defends against the most dangerous failure mode: convincing a
consumer that a less-authoritative platform's envelope is somehow more
trustworthy because it arrived through a privileged channel.

## Implementation Split

F10.2 splits as follows. Only F10.2.0 (this document) is authorized.

| Sub-phase | Scope | Output | Authorized by this document? |
|---|---|---|---|
| **F10.2.0** | Shared envelope spec, docs only | This document plus cross-references | Yes |
| **F10.2.1** | Optional static schema helper | Pure module exporting envelope shape constants and a `validateEnvelope(env, manifest)` function. No transport, no I/O, no platform-specific code. | **No.** Requires separate plan and approval. |
| **F10.2.2** | Validation script | Repo-scan tool (grep or Rust binary) under `tools/validation/` that finds envelope literals and validates them against the F10.2.1 helper. Same posture as `f5h3b0c_no_production_writer_binds_is_synthetic_one`. | **No.** Requires F10.2.1 first. |
| **F10.3** | First bridge implementation | Wire one transport to the envelope contract end-to-end. | **No.** Out of scope. |
| **F10.6 / F10.7** | Future transports (cloud, WebDAV, signed envelopes) and remote apply | Future expansions of the cross-platform stack. | **No.** Out of scope and explicitly forbidden until separate safety models authorize them. |

### Why Docs-First

The synthetic-marker contract (F5H.3b.0c) proved that a docs-first contract
carrying small examples is enough to gate real code. The same pattern applies
here. The envelope schema is the kind of artifact that looks obvious before
any consumer uses it and turns out to have edge cases per consumer. Writing
it down without code lets the edge cases surface without refactoring costs.

Once the spec stabilizes via use by two or three consuming F-phases, F10.2.1
becomes a one-day implementation. Inverting the order costs weeks.

## Risks

| # | Risk | Why plausible | Mitigation |
|---|---|---|---|
| **R1** | **Envelope treated as command.** A consumer reads an `applyEvent` and writes the apply locally. | Common pattern in CRDT / event-sourced systems where receipt = apply. Easy to slip in by analogy. | §6 replay invariant: no consumer code path reads an envelope and writes a row. Documented here; validated by code review and the future F10.2.2 CI scan. |
| **R2** | **Platform spoofing.** A malicious or compromised producer claims `platformId: "desktop-studio"` from a Chrome surface. | Possible in any system where producers self-declare. | §4.3 surface↔authority sanity catches accidental misconfig. Hard defense (producer identity proof) is future-phase signing; for F10.2/F10.3 the system runs locally and inter-process trust is assumed. This document calls out the limit explicitly. |
| **R3** | **Raw content leakage via payload.** A producer adds a `content: "..."` field hoping it will pass through. | Producers under deadline pressure add convenience fields. | §5.3 forever-no list enforced by validation: payload field names matching the deny list trigger `blocker: "payload-contains-forever-no-field"`. F10.2.2 CI scan catches it before merge. |
| **R4** | **Dedupe collision.** Two different events compute the same `dedupeKeyHash`. | sha256 is fine; the risk is in input definition — if `dedupeFields` is too small, semantically different events collide. | Per-kind `dedupeFields` allowlist is explicit in this document, with worked examples. Each F-phase adding a new kind must propose its `dedupeFields` and have them reviewed. Future tests will assert distinct events yield distinct hashes. |
| **R5** | **Replay confusion.** A replayed `applyEvent` causes a consumer to think the apply happened twice. | Network/transport retries; bundle re-import. | §6 replay invariant + `eventDigest` lets the consumer detect literal duplicates and dedupe on display. `dedupeKeyHash` handles semantic duplicates. The consumer's local mirror is updated idempotently. |
| **R6** | **Authority bypass via transport.** Operator imports a `chrome-studio` envelope via a "trusted" file picker and the consumer treats it as Desktop authority. | The natural mental model is "I picked the file, so it's trusted." | §8 transport-neutrality contract. Validation is done against `sourcePlatform`, not against the transport. This document calls out the failure mode and how validation rejects it. |
| **R7** | **Mixing proposal/apply semantics.** A consumer treats `proposal` as `applyEvent` (or vice versa) because the payloads look similar. | The two kinds share fields. | Separate kinds (§3); separate consumer dispatch (mandated here); future helper exposes separate validators. A `proposal` payload validator rejects fields that only belong on an `applyEvent`. |
| **R8** | **Schema drift across platforms.** Desktop ships v1.1; Chrome stays on v1.0; producers and consumers disagree. | Inevitable across a multi-surface system with independent release cycles. | `schema` and `envelopeKindVersion` explicit. §4.6 hard reject on too-new schema. Schema bumps must be announced in this document one release before any platform produces them. |
| **R9** | **`cacheMetadata` weaponized.** A mobile cache snapshot is read by Desktop and used to drive apply logic. | Tempting if Desktop is "missing" some state mobile has. | §3.7 hard-coded contract: no code path from `cacheMetadata` to write. F10.2.2 CI scan greps for `cacheMetadata` reads in apply paths. Documented here as the only kind with an absolute non-routing rule. |
| **R10** | **`dryRun` misuse.** A producer sets `dryRun: false` on a `preview` envelope and a consumer treats it as authorization to apply. | Inconsistent field semantics across kinds. | §2 field notes: `dryRun` is `null` for kinds where it does not apply (`evidence`, `proposal`, `conflictCandidate`, `bundle`, `cacheMetadata`). Validation rejects non-null `dryRun` on those kinds and rejects `dryRun: false` on `preview` kinds. |
| **R11** | **Envelope explosion.** Producers emit one envelope per row; transports flood. | High-cardinality entities tempt per-row evidence. | This document mandates digests over enumerations as the default evidence shape (folder-metadata-digest, tombstone-log-digest). Per-row evidence requires explicit justification and capping (e.g. F7 `divergences[]` cap of 25). |
| **R12** | **Warnings used as side-channel.** A producer encodes data in `warnings[]` strings to bypass payload allowlists. | Strings are unstructured; rules apply only to known fields. | §5.4: `warnings[]` and `blockers[]` are code strings from a fixed allowlist, not free text. Unknown codes surface a `"unknown-warning-code"` meta-warning and do not auto-promote. |

## Recommendation And Stop

F10.2.0 is the docs-only envelope spec. The following are explicitly **not**
authorized by this document:

- F10.2.1 static schema helper — requires separate plan and approval.
- F10.2.2 validation script — requires F10.2.1 first.
- F10.3 bridge implementation.
- F10.6 future transports (cloud, WebDAV, signed envelopes).
- F10.7 remote apply.
- Any code change.
- Any CI script change.
- Any package, lockfile, or workspace dependency change.

This document does not modify runtime behavior. It does not change import,
export, sync, cache, apply, or delete paths. It does not enable any new
transport. It does not change F1, F2, F3, F4, F5, F6, F7, F8, F9, F10.0, or
F10.1 behavior.

F10.2.0 stops here. F10.2.1, F10.2.2, F10.3, F10.6, and F10.7 must not start
from this document change.

## Validation Expectations

Future static helpers and validation scripts must:

- Match the field shape declared in §2 byte-for-byte.
- Enforce the kind ↔ authority matrix in §4.1 with the blocker codes listed
  in §4.
- Reject payloads containing forever-no field names (§5.3).
- Reject unknown warning or blocker codes by surfacing a meta-warning rather
  than promoting them.
- Treat `cacheMetadata` as forever non-routable to writes (§3.7).
- Treat transport as authority-neutral (§8).

Until those helpers exist, every cross-platform envelope produced or consumed
in the repository must conform to this document on the basis of code review
alone.
