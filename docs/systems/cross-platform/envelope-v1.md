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

## Core Lifecycle

The F10 cross-platform model is a one-way pipeline. Every state change passes
through these stages, in order, and never skips a stage:

```
evidence → preview → proposal → conflict / review → audited apply → export
```

| Stage | What it is | Producer side | What it produces | Downstream gate |
|---|---|---|---|---|
| **evidence** | Observation of state. "I saw X." | Any platform with `evidence-producer` authority or stronger. | `evidence` envelopes. | Does not advance to `preview` on its own; an explicit producer must elect to draft one. |
| **preview** | Counterfactual diagnostic. "If applied, would do X." | Platforms with `preview-coordinator` authority or stronger. Always `dryRun: true`. | `preview` envelopes carrying `previewToken` and predicate version. | Does not advance to `proposal` on its own; an operator (or strong-authority code) must elect to submit one. |
| **proposal** | Explicit request to apply, awaiting review. | Platforms with `proposal-source` authority or stronger. | `proposal` envelopes citing justifying evidence and the predicate. | Does not advance to `applyEvent` on its own; a strong-authority platform must run review/apply gates. |
| **conflict / review** | Divergence between two evidence streams, or operator decision on a queued conflict. | Strong-authority comparator (typically Desktop running F7/F6). | `conflictCandidate` envelopes feeding F6 ingest; F6 review decisions producing follow-on `applyEvent`. | F6 conflict-queue rows are internal SQL; ingest is operator-driven, one-at-a-time. |
| **audited apply** | Actual mutation under transactional, gated, audited rules. | Strong-authority platforms only (currently Desktop). | `applyEvent` envelopes that are **past-tense receipts** — the apply already happened locally before the envelope is emitted. | Never. The pipeline does not loop. Consumers do not re-apply. |
| **export** | Transportable packet of upstream envelopes. | Platforms with `export` capability. | `bundle` envelopes wrapping ordered upstream envelopes. | Bundles travel via transports (§8); transport contributes zero authority. |

Three properties of this pipeline are load-bearing:

1. **It is one-way.** No stage feeds backward. An `applyEvent` does not
   automatically re-emit as evidence (the producer's own evidence stream
   handles that on its next observation cycle, independently).
2. **Each stage is opt-in.** Producing evidence does not auto-produce a
   preview. Producing a preview does not auto-produce a proposal. Producing
   a proposal does not auto-produce an applyEvent. The pipeline is a sequence
   of human or strong-authority gates, not an automation.
3. **`cacheMetadata` is off-pipeline.** It is read-only mirror state for
   diagnostics. It never feeds any other stage, and no consumer code path
   may ever route from it to a write (see §3.7).

The envelope kinds in §3 are the wire form of each pipeline stage:

| Pipeline stage | Envelope kind(s) |
|---|---|
| evidence | `evidence` |
| preview | `preview` |
| proposal | `proposal` |
| conflict / review | `conflictCandidate` (detection), `applyEvent` (review decision result) |
| audited apply | `applyEvent` |
| export | `bundle` |
| off-pipeline diagnostics | `cacheMetadata` |

## Envelope Base Shape

The canonical v1 shape. All field names below are **locked** for F10.2.1 — the
optional static helper must match them byte-for-byte.

```ts
type CrossPlatformEnvelope = {
  // ── Schema identity ─────────────────────────────────────────────
  schema: "h2o.crossPlatform.envelope.v1";
  envelopeVersion: "v1";
  envelopeKindVersion: "v1";
  schemaHash?: string;                       // OPTIONAL — sha256 of the canonical schema definition known to the producer

  // ── Envelope identity ───────────────────────────────────────────
  kind: EnvelopeKind;
  id: string;                                // globally-unique envelope ID (ULID/UUIDv7)
  lineageId: string;                         // shared across an evidence → preview → proposal → applyEvent chain

  // ── Provenance ──────────────────────────────────────────────────
  createdAt: string;                         // ISO seconds UTC
  expiresAt?: string;                        // OPTIONAL — ISO; after this the envelope is stale (§6)
  sequence: number | null;                   // per-producer-peer monotonic envelope sequence from F3
  exportSequence: number | null;             // optional secondary monotonic sequence within a single bundle

  // ── Source attribution ──────────────────────────────────────────
  sourcePlatform: {
    platformId: PlatformId;
    surfaceKind: SurfaceKind;
    sourcePeerEnvelope: RedactedPeerEnvelope;
  };

  // ── Authority (split: declared vs effective) ────────────────────
  declaredAuthority: AuthorityLevel;         // what the producer claims
  effectiveAuthority: AuthorityLevel | "rejected"; // what the validator concluded; "rejected" on validation failure
  capabilityUsed: CapabilityName;
  capabilitySnapshotHash: string;            // sha256 of the producer's F10.1 manifest at envelope creation time

  // ── Subject ─────────────────────────────────────────────────────
  subjectType: SubjectType;                  // e.g. "folder.metadata", "tombstone.review", "chat.evidence"
  subjectId: string;                         // hashed at default redactionClass; see §5
  operation: OperationName;                  // free-form per kind
  operationIntent?: OperationIntent;         // REQUIRED for proposal / conflictCandidate / applyEvent (see §3)

  // ── Posture ─────────────────────────────────────────────────────
  redactionClass: RedactionClass;
  dryRun: boolean | null;
  transactional: boolean | null;

  // ── Idempotency ─────────────────────────────────────────────────
  dedupeKey: string;                         // sha256 of canonical per-kind dedupe inputs (§6)
  payloadHash: string;                       // sha256 of canonical payload alone (§6)
  eventDigest: string;                       // sha256 of the canonical envelope minus warnings/blockers/eventDigest (§6)

  // ── Body ────────────────────────────────────────────────────────
  payload: KindSpecificPayload;

  // ── Diagnostic ──────────────────────────────────────────────────
  warnings: string[];                        // code strings from a fixed allowlist
  blockers: string[];                        // code strings from a fixed allowlist; empty on a well-formed envelope
};

type RedactionClass =
  | "redacted"            // DEFAULT — cross-platform safe; no plain IDs, no display names, no content
  | "device-local"        // GATED — same physical device, evidence/preview only, operator-opt-in
  | "metadata-only";      // for cacheMetadata only — counts and status, no IDs

type OperationIntent =
  | "create"
  | "update"
  | "delete"              // F5-gated; see §3.proposal and §3.applyEvent
  | "review"              // F6 ingest decisions
  | "cleanup";            // F5H.3b synthetic cleanup operations
```

### Field Notes

| Field | Notes |
|---|---|
| `schema` | Literal `"h2o.crossPlatform.envelope.v1"`. Bumped only on a breaking change. Schema bumps must be announced in this document one release before any platform emits the new schema. |
| `envelopeVersion` | Top-level shape version. Distinct from `envelopeKindVersion` (which versions per-kind payloads). Allows tightening the wrapper without bumping `schema`. |
| `envelopeKindVersion` | Per-kind version. Allows `evidence v1` and `applyEvent v2` to coexist without bumping the overall envelope schema. |
| `schemaHash` | Optional. Sha256 of the canonical schema definition the producer was compiled against. Lets a consumer detect "producer knew a different schema than I do" without parsing. |
| `kind` | One of the seven values in §3. Determines payload shape and consumer dispatch. |
| `id` | Globally-unique envelope ID (ULID or UUIDv7). Identifies **this creation event**, distinct from `eventDigest` (which is a content hash and may repeat for byte-identical envelopes). |
| `lineageId` | Shared across the evidence → preview → proposal → applyEvent chain that motivated a single change. Lets F6 / audit code follow a lineage end-to-end without inspecting payload. |
| `createdAt` | ISO seconds UTC. |
| `expiresAt` | Optional. After this ISO time the envelope is **stale**: consumers may still display it (with a stale badge) but must not use it as input to a new `proposal`, `applyEvent`, or F6 ingest without revalidating. See §6. |
| `sequence` | Per-producer-peer monotonic envelope sequence from F3. `null` if the producer is not a sequenced surface. Used for gap detection. |
| `exportSequence` | Optional secondary monotonic sequence within a single bundle, used to preserve order across multiple kinds in one bundle. |
| `sourcePlatform.platformId` | One of: `"desktop-studio"`, `"chrome-studio"`, `"native-extension"`, `"mobile"`. Drives F10.1 manifest lookup. |
| `sourcePlatform.surfaceKind` | One of: `"desktop-tauri"`, `"browser-studio"`, `"browser-runtime"`, `"mobile"`. Cross-checked against `declaredAuthority` (§4.3). |
| `sourcePlatform.sourcePeerEnvelope` | F2-shaped peer envelope with redacted IDs. Identity for routing only — **never** trusted for authority by itself (§4.5). |
| `declaredAuthority` | The authority level the producer claims. Producer-supplied, untrusted until validated. One of: `"none"`, `"read-only"`, `"evidence-producer"`, `"preview-coordinator"`, `"proposal-source"`, `"strong-local-authority"`, `"audited-apply-authority"`. |
| `effectiveAuthority` | The authority level the consumer's validator concluded after checking `sourcePlatform`, `declaredAuthority`, `capabilityUsed`, `capabilitySnapshotHash`, and the F10.1 manifest. May be **lower** than `declaredAuthority` (downgrade) or `"rejected"` (envelope refused). Consumers act only on `effectiveAuthority`. |
| `capabilityUsed` | Must be on the F10.1 manifest entry for `sourcePlatform.platformId`. Validated per §4.2. |
| `capabilitySnapshotHash` | Sha256 of the producer's F10.1 capability manifest at envelope creation. Lets a consumer detect "producer is operating under a manifest different from mine," surface a warning, and downgrade `effectiveAuthority` accordingly. |
| `subjectType` | Kind of entity the envelope describes (e.g. `"folder.metadata"`, `"folderBinding"`, `"tombstone.review"`, `"chat.evidence"`). Free-form string with platform-specific guards (§4.7). |
| `subjectId` | Hash of `(subjectType + raw entity ID + perEnvelopeSalt)` at `redactionClass: "redacted"`. Plain ID allowed only at `redactionClass: "device-local"`. Lets consumers dedupe by subject without parsing payload. Never raw at default class. |
| `operation` | Specific operation string, e.g. `"folder-metadata-color-apply"`, `"reviewed-folder-binding-tombstone-apply"`, `"synthetic-cleanup-dry-run"`. Free-form per kind. |
| `operationIntent` | Categorical intent. **Required** for `proposal`, `conflictCandidate`, and `applyEvent`. Forbidden on `evidence`, `preview`, `bundle`, `cacheMetadata`. Validator rejects mismatches with `blocker: "operation-intent-wrong-for-kind"`. |
| `redactionClass` | Replaces the earlier `redacted: boolean`. Default `"redacted"`. See §5. |
| `dryRun` | `true` for `preview`, `false` for `applyEvent`, `null` for `evidence`, `proposal`, `conflictCandidate`, `bundle`, `cacheMetadata`. Validator rejects non-null `dryRun` on those kinds and rejects `dryRun: false` on `preview`. |
| `transactional` | `true` for transactional apply / dry-run kinds, `null` otherwise. |
| `dedupeKey` | Sha256 of per-kind canonical dedupe inputs. See §6. |
| `payloadHash` | Sha256 of the canonical `payload` alone. Distinct from `eventDigest`. Lets consumers detect "same payload, different envelope wrapper" — useful for upgrading an envelope's metadata without re-counting the underlying event. |
| `eventDigest` | Sha256 of the entire canonical envelope minus `warnings`, `blockers`, and `eventDigest` itself. Detects literal duplicates in transit and supports forward references. |
| `payload` | Per-kind shape. Validator rejects unknown fields and forever-no field names (§5.3). |
| `warnings` | Code strings from a fixed allowlist. **Not** a free-text channel (§5.4). |
| `blockers` | Code strings from a fixed allowlist. Empty on a well-formed envelope. |

### Fields Deliberately Absent

The shape deliberately does **not** carry:

| Absent field | Why it is absent |
|---|---|
| `targetPlatform` | Envelopes are broadcast/observed, not addressed. A consumer chooses to attend; a producer never commands. Adding this would invite point-to-point routing logic that turns envelopes into RPCs. |
| `action` / `command` | Adding such a field would invite consumers to dispatch by it. The envelope is a *type*, not an *instruction*. |
| Raw IDs at the top level (other than `id` and the hashed `subjectId`) | `id` identifies the envelope creation event; `subjectId` is hashed at default redactionClass. Plain entity IDs live inside `payload`, where they are redaction-gated and per-kind validated. Top-level plain IDs would bypass the gates. |
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
| Required fields | `operationIntent` ∈ `{"create", "update", "delete", "review", "cleanup"}`; `payload.justifyingEvidenceDigests: string[]`; `payload.proposedOperation`; `payload.expectedPostState`; `payload.predicateVersion`. |
| Apply implication | **None until reviewed.** A proposal must be turned into an `applyEvent` by a strong-authority platform; the proposal envelope itself does not move rows. |

### conflictCandidate

| Aspect | Value |
|---|---|
| Meaning | Detection of divergence between two evidence streams. Not yet a durable conflict row. |
| Producers | Platforms comparing two evidence streams. Currently only Desktop Studio (the only strong authority that runs the F7 comparator). |
| Consumers | F6 conflict queue **ingest** — one-at-a-time, operator-clicked. **Never auto-enqueue.** |
| Payload expectations | Two divergent states, the common ancestor (if known), the divergence reason. |
| Required fields | `operationIntent` ∈ `{"create", "update", "delete"}` (describing what the divergent operations were); `payload.requesterState`; `payload.counterpartState`; `payload.commonAncestorHash`; `payload.divergenceReason`. |
| Apply implication | **None.** Even after F6 ingests it, the resulting conflict row still requires explicit operator resolution before any apply runs. |

### applyEvent

| Aspect | Value |
|---|---|
| Meaning | **Past-tense receipt only.** Audit record of a change that **already happened** on the producing platform before the envelope was created. An `applyEvent` is never a remote command. Consumers must not interpret it as a request to apply locally; replay must not retrigger apply; the very absence of a "remote-apply" code path is a structural invariant of the system. |
| Producers | Strong-authority platforms only. In F10's current scope this means Desktop Studio. Chrome Studio, Native Extension, and Mobile never produce `applyEvent`. |
| Consumers | Other platforms for read-only display and their own evidence-stream invalidation. Consumers do **not** mirror the apply locally, do **not** queue it for local apply, and do **not** translate it into a new `proposal` automatically. |
| Payload expectations | What was applied — the operation, the entity ID, the pre/post state hashes, the audit row ID from the local maintenance log, the preview token (if applicable from F5H.3b.1b). |
| Required fields | `dryRun: false`; `transactional: true`; `operationIntent` ∈ `{"create", "update", "delete", "review", "cleanup"}`; `payload.auditMaintenanceId`; `payload.preState`; `payload.postState`; `payload.predicateVersion`. |
| Apply implication | **None on consumers.** A consumer reading an `applyEvent` learns the producer changed something. The consumer does not mirror; mirroring is a separate decision via the proposal pipeline. There is no envelope shape that would convert an `applyEvent` into a remote-apply command, and this document declares the absence of such a shape as an invariant. |

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
| Required fields | `payload.lastIngestedBundleSequence`, `payload.mirrorEntityCount`. Payload field allowlist enforced per §4.6. |
| Apply implication | **None and forever-none.** `cacheMetadata` is the only kind with a hard-coded routing contract: **no consumer code path may ever route from `cacheMetadata` to any write.** This invariant is documented here and is the basis for the future F10.2.2 CI scan. |

### Kind Distinction Summary

| Statement | Why it matters |
|---|---|
| evidence is **not** a command | Evidence records observation. Acting on it requires a proposal and review. |
| preview is **dry-run** | A preview never applies. Its token may later authorize a separately-gated apply, but the preview itself is read-only. |
| proposal **awaits review** | A proposal is a request, not an execution. Only review on a strong-authority platform turns it into an apply. |
| conflictCandidate is **not** a durable conflict until F6 ingest | Detection of divergence ≠ enqueueing. F6 ingest is the explicit, operator-driven step that creates a durable row. |
| applyEvent is a **past-tense receipt only**, never a remote command | The apply already happened on the producer before the envelope existed. Consumers do not re-apply, do not queue it for apply, and do not translate it into a fresh proposal. No envelope shape converts an `applyEvent` into a remote-apply command; this absence is a load-bearing invariant of F10.2. |
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

`sourcePlatform.surfaceKind` and the producer's `declaredAuthority` must be a
valid pair per F10.1. Examples of allowed pairs:

| `surfaceKind` | Allowed `declaredAuthority` values |
|---|---|
| `desktop-tauri` | `strong-local-authority` |
| `browser-studio` | `preview-coordinator` |
| `browser-runtime` | `evidence-producer` |
| `mobile` | `read-only` |

Rejection: `blocker: "surface-authority-mismatch"`.

This catches accidental misconfiguration. It does not stop a maliciously
crafted envelope (see §10 R2 — platform spoofing).

### Declared vs Effective Authority

Every envelope carries two authority fields. They are deliberately distinct:

| Field | Set by | Trusted? | Used for |
|---|---|---|---|
| `declaredAuthority` | The producer. | **No, never trusted on its own.** | Diagnostics, audit trail, "what did the producer claim." |
| `effectiveAuthority` | The consumer's validator (or the receiver-side gateway in front of one). | Yes, after validation. | Dispatching the envelope into consumer code paths. The only authority field consumer code may act on. |

The validator computes `effectiveAuthority` from:

1. The F10.1 manifest entry for `sourcePlatform.platformId`.
2. The `declaredAuthority` (must be ≤ the manifest's declared maximum for the
   platform; never higher).
3. The `capabilityUsed` (must be on the platform's capability allowlist).
4. The `capabilitySnapshotHash` (must match the consumer's known F10.1
   manifest hash, or surface a warning and downgrade).
5. The kind ↔ authority matrix (§4.1) and capability ↔ kind matrix (§4.2).

If any check fails, `effectiveAuthority` is set to `"rejected"` and the
envelope is dropped before any consumer-side code path runs. Rejection
records the offending blocker code(s) in `blockers[]`.

If checks pass but the consumer's F10.1 manifest is **stricter** than the
producer's (e.g. producer's snapshot allows `proposal` from Chrome Studio,
consumer's manifest does not), the validator may set `effectiveAuthority`
**below** `declaredAuthority`. This is a downgrade, not a rejection.

> **Consumers must never read `declaredAuthority` directly. All authority
> dispatch must go through `effectiveAuthority` after validation.**

### sourcePlatform Alone Is Insufficient

`sourcePlatform` answers "who claims to have produced this." It is **not**
enough to grant authority. Specifically:

1. A matching `sourcePlatform.platformId` does **not** by itself grant any
   capability. The producer must also list a permitted `capabilityUsed` and
   pass the kind ↔ authority + capability ↔ kind matrices.
2. A matching `sourcePlatform.surfaceKind` does **not** by itself grant any
   capability. Surface kind only sanity-checks declared authority (§4.3); it
   does not authorize behavior.
3. A valid `sourcePlatform.sourcePeerEnvelope` (F2-shaped, redacted) does
   **not** by itself grant any capability. Identity is for routing, not for
   authority.
4. Every **write-capable** envelope (`proposal`, `applyEvent`, and any future
   write-implying kind) must additionally validate against the producer's
   declared capability manifest at the time the consumer validates. This is
   what `capabilitySnapshotHash` is for: it lets the consumer cross-check
   the producer's view of F10.1 against the consumer's view.
5. If the consumer cannot verify `capabilitySnapshotHash` against any known
   F10.1 manifest revision, the validator rejects the envelope with
   `blocker: "capability-snapshot-unknown"`. Write-capable kinds are rejected
   outright; read-only kinds (`evidence`, `cacheMetadata`) may be admitted
   with a warning and `effectiveAuthority` downgrade to `read-only`.

The above is the **authority insufficiency rule**: producer self-attestation
alone never authorizes anything.

### Mobile-Specific Guards

Mobile's contract is the strictest:

- Mobile never appears as `sourcePlatform` on `applyEvent`. Hard-coded
  rejection regardless of any other field state.
- Mobile envelopes carrying `payload` fields outside the `cacheMetadata`
  allowlist are rejected with `blocker: "mobile-payload-outside-allowlist"`.
- Mobile envelopes with `redactionClass` not in `{"redacted", "metadata-only"}`
  are rejected with `blocker: "mobile-must-redact"`. No exception. This
  remains true even if Mobile gains proposal capability in a later phase.

### Native-Extension-Specific Guards

- Native-extension envelopes carrying `subjectType` outside the evidence
  scope (e.g. `"chat.evidence"`, `"session.evidence"`, `"capture.evidence"`)
  are rejected with `blocker: "native-extension-entity-outside-evidence-scope"`.
- Native-extension envelopes that would imply a tombstone (`subjectType`
  beginning with `"tombstone."`, `operationIntent: "delete"`, or `operation`
  containing delete semantics) are rejected with
  `blocker: "native-extension-not-authorized-for-tombstones"`.

### Version Skew Behavior

If `schema`, `envelopeVersion`, or `envelopeKindVersion` is newer than the
consumer recognizes, the envelope is rejected with
`blocker: "envelope-schema-too-new"` and surfaced as a warning in operator
diagnostics. The consumer does **not** attempt partial parsing. If `schema`
is older than the consumer's minimum supported version, the envelope is
rejected with `blocker: "envelope-schema-too-old"`. If `schemaHash` is
provided and does not match any schema version the consumer knows, the
envelope is rejected with `blocker: "envelope-schema-hash-unknown"`.

## Redaction Rules

`redactionClass: "redacted"` is the default for every envelope on every
platform.

### Redaction Classes

| Class | When used | What plain fields are allowed | What is hashed | What is forbidden |
|---|---|---|---|---|
| `"redacted"` (default) | Any envelope crossing a platform boundary or persisted beyond the producing device. | Hashes (`predecessorHash`, `eventDigest`, `dedupeKey`, `payloadHash`, `previewToken`); counts; ISO timestamps; predicate version strings; allowlisted snapshot fields (F7 folder-metadata `color`, `archived`, `parentFolderId`). | All entity IDs (sha256 of `subjectType + raw + perEnvelopeSalt`); peer IDs flow through F2 redacted shape only. | Display names; chat content; message bodies; attachment bytes; snapshot bodies; URLs; file paths; credentials. |
| `"device-local"` (gated) | Evidence / preview envelopes whose producer and consumer are on the same physical device, with operator opt-in. | All of the `"redacted"` allowlist, plus plain entity IDs and plain display names (length-capped ≤ 200 chars). | (Hashes still present; raw IDs now plain.) | Chat content; message bodies; attachment bytes; snapshot bodies; URLs; file paths; credentials. **The forever-no list (§5.3) still applies.** |
| `"metadata-only"` | `cacheMetadata` envelopes only. | Counts; status codes; warning codes; ISO timestamps; `lastIngestedBundleSequence`. | Nothing — there are no IDs in a metadata-only payload. | Everything else, including entity IDs (even hashed), display names, allowlisted snapshot fields, audit IDs, and any forever-no field. |

### Gated `"device-local"` Flip

`redactionClass: "device-local"` is permitted only when **all** of the
following hold:

1. The consumer is Desktop Studio. Desktop is the only surface that ever
   sees `"device-local"` envelopes.
2. The producer is on the same physical device as the consumer
   (`sourcePlatform.sourcePeerEnvelope.physicalDeviceId` matches the local
   device).
3. The operator has explicitly opted in via a future feature flag (default
   off).
4. The envelope kind is `evidence` or `preview`. `proposal`, `applyEvent`,
   `conflictCandidate`, `bundle`, and `cacheMetadata` stay at `"redacted"`
   (or `"metadata-only"` for `cacheMetadata`) regardless of flag, because
   they may travel further than the producing device.

Any other consumer (chrome-studio, native-extension, mobile) treats a
`"device-local"` envelope as `"redacted"` for display and emits a warning.
The flip cannot leak plain IDs or display names cross-platform.

### No Forever-No Leakage

The following are **never** carried by any envelope at any `redactionClass`
on any platform:

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

Forever-no enforcement is **independent of `redactionClass`**. Even
`"device-local"` envelopes cannot carry chat content; the flip ungates IDs
and display names, never content.

### No Irreversible Delete-Intent Leakage

Delete intents are irreversible by F5 design. To prevent them from leaking
into read/proposal surfaces where they could be acted on without the full
F5 review pipeline:

- `operationIntent: "delete"` is permitted **only** on `proposal`,
  `conflictCandidate`, and `applyEvent` envelopes. Validation rejects
  `operationIntent: "delete"` on `evidence`, `preview`, `bundle`, and
  `cacheMetadata` with `blocker: "delete-intent-on-read-only-kind"`.
- A `preview` envelope describing a counterfactual deletion (e.g. F5H.3b
  synthetic cleanup dry-run) sets `dryRun: true` and uses the synthetic
  cleanup predicate in `payload.predicateVersion`; it does **not** set
  `operationIntent: "delete"`. The preview describes what *would* happen, not
  an intent to perform.
- A `proposal` envelope carrying `operationIntent: "delete"` must additionally
  cite an F5-eligible predicate (`payload.predicateVersion`) and the
  justifying evidence digests (`payload.justifyingEvidenceDigests`). A
  proposal without these is rejected with
  `blocker: "delete-proposal-missing-f5-predicate"`.
- An `applyEvent` carrying `operationIntent: "delete"` must include the audit
  maintenance ID from the F5G.4 / F5H.3b apply path
  (`payload.auditMaintenanceId`). Without it, rejected with
  `blocker: "delete-apply-event-missing-audit-id"`.

These rules ensure delete intents always travel through the F5 review/apply
gates and never appear on a read surface as a self-executing instruction.

### No Sensitive Local-Only Audit Details in Mobile / Cache Bundles

`cacheMetadata` envelopes (mobile producer) and any envelope reaching a
read-only consumer must **not** carry sensitive local-only audit details
that belong to the producing platform's internal records:

| Field family | May appear in `cacheMetadata`? | May appear in any envelope reaching mobile? |
|---|---|---|
| `payload.auditMaintenanceId` | **No.** | No. |
| `payload.previewToken` | **No.** | No. |
| `payload.dbFingerprint` (schema/migration versions) | **No.** | No. |
| `payload.candidateIds` (synthetic cleanup) | **No.** | No. |
| `payload.preState` / `payload.postState` (apply audit) | **No.** | No. |
| Per-row entity IDs (hashed or plain) | **No.** | No (mobile is metadata-only). |
| Per-row counts | Yes, capped | Yes |
| Status codes, warning codes | Yes | Yes |
| ISO timestamps | Yes | Yes |

Rejection: `blocker: "local-only-audit-detail-on-mobile-or-cache"`. This
prevents an operator's local audit trail from leaking through a sync bundle
into a non-authoritative cache mirror.

### Warnings And Blockers Are Code Strings, Not Content

`warnings[]` and `blockers[]` must be **code strings from a fixed allowlist**,
not free-text content. This prevents producers from using diagnostic fields
as a side-channel to leak content past the payload validator.

Example allowed codes: `"counterpart-digest-unavailable"`,
`"preview-token-skipped"`, `"rollback-verification-failed"`,
`"mobile-payload-outside-allowlist"`, `"delete-intent-on-read-only-kind"`,
`"local-only-audit-detail-on-mobile-or-cache"`,
`"capability-snapshot-unknown"`.

Unknown warning or blocker codes cause validation to add a meta-warning
`"unknown-warning-code"` and surface the envelope for operator review; they
do not auto-promote the unknown code.

## Dedupe / Replay Model

### Three Hashes, Three Purposes

| Hash | Inputs | Purpose |
|---|---|---|
| `dedupeKey` | sha256 of canonical `(sourcePlatform.platformId, kind, subjectType, operation, operationIntent, payload.dedupeFields)` where `dedupeFields` is a per-kind allowlisted subset (e.g. for `tombstone.review.proposal`: `{tombstoneId, reviewId, decision}`) | "Same logical event." Two envelopes with the same `dedupeKey` describe the same intent. A consumer's local processor skips the second occurrence. |
| `payloadHash` | sha256 of canonical `payload` alone | "Same content, possibly different wrapper." Lets a consumer detect a republished payload (e.g. an envelope re-emitted with a fresher `expiresAt`) without re-counting the underlying event. |
| `eventDigest` | sha256 of the entire canonical envelope minus `warnings`, `blockers`, and `eventDigest` itself | "Same byte-for-byte envelope." Used to detect literal duplicates in transit and for forward references (e.g. `applyEvent.payload.justifyingProposalDigest`). |

`dedupeKey` provides intent-level idempotency. `payloadHash` provides
content-level idempotency. `eventDigest` provides transport-level idempotency.

### `dedupeKey` Is Not Authority

`dedupeKey` is an **idempotency key**, not an authority assertion. Receiving
an envelope with a familiar `dedupeKey` does **not**:

- Grant the producer any authority the producer did not already have.
- Convert a `preview` envelope into a `proposal` or `applyEvent`.
- Reopen a closed conflict decision (see below).
- Bypass any §4 validation rule.

Two envelopes with the same `dedupeKey` from different `sourcePlatform`
values are independent events for authority purposes; they just collide on
the dedupe key. The validator processes each through the full §4 matrix
independently.

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
  keyed by `dedupeKey`.
- A consumer processes `applyEvent` envelopes by updating its display of
  "what the authoritative platform reports." It does **not** mirror the apply
  locally. Replay re-displays the same audit record; no row moves.
- The producer of an `applyEvent` does **not** treat its own outgoing envelope
  as a command — the apply already happened locally before the envelope was
  created. The envelope is past-tense receipt only.

### Replayed Evidence Must Not Auto-Reopen Closed Conflict Decisions

If an `evidence` envelope is replayed and matches the `lineageId` of a
conflict that F6 already resolved (status terminal: `"resolved"`,
`"applied"`, `"rejected"`, etc.), the consumer must:

1. Update its diagnostic view of the lineage with the replayed observation.
2. **Not** reopen, re-ingest, or re-queue the resolved F6 row.
3. Surface a warning `"replayed-evidence-against-closed-conflict"` if the
   replayed evidence contradicts the resolution.

This rule prevents a stale evidence packet (re-imported from disk, replayed
from cache, or arriving late through a delayed transport) from undoing a
human conflict-review decision. Reopening a closed F6 row requires an
explicit operator action in the Desktop conflict-queue UI, never an
envelope.

### Stale Evidence Stays Preview-Only Until Revalidated

If an envelope's `expiresAt` is set and has passed at validation time:

- The envelope is admitted only as a **stale** diagnostic. Consumers may
  display it with a stale badge.
- The envelope **may not** be used as input to a new `proposal`, used as a
  `justifyingEvidenceDigests[]` entry, used to advance a lineage stage, or
  ingested into F6.
- A producer that needs to act on a stale observation must first emit a
  fresh `evidence` envelope (new `id`, new `createdAt`, fresh `expiresAt`),
  and the fresh envelope must pass full §4 validation including
  `capabilitySnapshotHash` check.

Rejection of stale-as-input: `blocker: "stale-evidence-not-revalidated"`.

This rule means a long-stored bundle cannot be used to retroactively justify
a write decision without the producer re-observing current state.

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
| **F2** peer identity diagnose | `evidence` envelope with `subjectType = "peer.identity"` and a redacted F2 envelope as payload. |
| **F3** envelope stamping | F3 is the source of `sourcePlatform.sourcePeerEnvelope` and `sequence` on every envelope. The new envelope-identity fields (`id`, `lineageId`), authority fields (`declaredAuthority`, `effectiveAuthority`, `capabilitySnapshotHash`), and idempotency fields (`dedupeKey`, `payloadHash`, `eventDigest`) are populated by the envelope-construction helper (F10.2.1), not F3 itself. F3's existing stamping function remains untouched. |
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
| **R2** | **Platform spoofing.** A malicious or compromised producer claims `platformId: "desktop-studio"` and `declaredAuthority: "strong-local-authority"` from a Chrome surface. | Possible in any system where producers self-declare. | §4.3 surface↔authority sanity catches accidental misconfig. §4.4 declared-vs-effective authority means consumers act only on `effectiveAuthority`, computed from the F10.1 manifest plus `capabilitySnapshotHash` cross-check. §4.5 authority-insufficiency rule says producer self-attestation alone never authorizes anything. Hard defense (producer identity proof) is future-phase signing; for F10.2/F10.3 the system runs locally and inter-process trust is assumed. This document calls out the limit explicitly. |
| **R3** | **Raw content leakage via payload.** A producer adds a `content: "..."` field hoping it will pass through. | Producers under deadline pressure add convenience fields. | §5.3 forever-no list enforced by validation regardless of `redactionClass`: payload field names matching the deny list trigger `blocker: "payload-contains-forever-no-field"`. F10.2.2 CI scan catches it before merge. |
| **R4** | **Dedupe collision.** Two different events compute the same `dedupeKey`. | sha256 is fine; the risk is in input definition — if `dedupeFields` is too small, semantically different events collide. | Per-kind `dedupeFields` allowlist is explicit in this document, with worked examples. Each F-phase adding a new kind must propose its `dedupeFields` and have them reviewed. Future tests will assert distinct events yield distinct hashes. §6 also clarifies that `dedupeKey` is **not** an authority assertion — collision does not transfer authority. |
| **R5** | **Replay confusion.** A replayed `applyEvent` causes a consumer to think the apply happened twice, or a replayed `evidence` reopens a closed F6 conflict. | Network/transport retries; bundle re-import; late-arriving evidence after a conflict was resolved. | §6 replay invariant + `eventDigest` lets the consumer detect literal duplicates. `dedupeKey` handles semantic duplicates. `payloadHash` distinguishes "same payload, different wrapper." Replayed evidence against a closed F6 lineage is admitted only as diagnostic and never auto-reopens the row. Stale envelopes (past `expiresAt`) are admitted as preview-only and cannot justify new writes. |
| **R6** | **Authority bypass via transport.** Operator imports a `chrome-studio` envelope via a "trusted" file picker and the consumer treats it as Desktop authority. | The natural mental model is "I picked the file, so it's trusted." | §8 transport-neutrality contract. Validation is done against `sourcePlatform`, not against the transport. This document calls out the failure mode and how validation rejects it. |
| **R7** | **Mixing proposal/apply semantics.** A consumer treats `proposal` as `applyEvent` (or vice versa) because the payloads look similar. | The two kinds share fields. | Separate kinds (§3); separate consumer dispatch (mandated here); future helper exposes separate validators. A `proposal` payload validator rejects fields that only belong on an `applyEvent`. |
| **R8** | **Schema drift across platforms.** Desktop ships envelopeVersion v1.1; Chrome stays on v1.0; producers and consumers disagree. | Inevitable across a multi-surface system with independent release cycles. | `schema`, `envelopeVersion`, `envelopeKindVersion`, and optional `schemaHash` explicit. §4.8 hard reject on too-new schema, too-old schema, and unknown `schemaHash`. `capabilitySnapshotHash` adds a manifest-drift detector: producer and consumer can be on different F10.1 revisions and the validator will downgrade `effectiveAuthority` accordingly rather than silently mis-route. Schema bumps must be announced in this document one release before any platform produces them. |
| **R9** | **`cacheMetadata` weaponized.** A mobile cache snapshot is read by Desktop and used to drive apply logic. | Tempting if Desktop is "missing" some state mobile has. | §3.7 hard-coded contract: no code path from `cacheMetadata` to write. F10.2.2 CI scan greps for `cacheMetadata` reads in apply paths. Documented here as the only kind with an absolute non-routing rule. |
| **R10** | **`dryRun` misuse.** A producer sets `dryRun: false` on a `preview` envelope and a consumer treats it as authorization to apply. | Inconsistent field semantics across kinds. | §2 field notes: `dryRun` is `null` for kinds where it does not apply (`evidence`, `proposal`, `conflictCandidate`, `bundle`, `cacheMetadata`). Validation rejects non-null `dryRun` on those kinds and rejects `dryRun: false` on `preview` kinds. |
| **R11** | **Envelope explosion.** Producers emit one envelope per row; transports flood. | High-cardinality entities tempt per-row evidence. | This document mandates digests over enumerations as the default evidence shape (folder-metadata-digest, tombstone-log-digest). Per-row evidence requires explicit justification and capping (e.g. F7 `divergences[]` cap of 25). |
| **R12** | **Warnings used as side-channel.** A producer encodes data in `warnings[]` strings to bypass payload allowlists. | Strings are unstructured; rules apply only to known fields. | §5.4: `warnings[]` and `blockers[]` are code strings from a fixed allowlist, not free text. Unknown codes surface a `"unknown-warning-code"` meta-warning and do not auto-promote. |

## F10.2.1 Readiness Checklist

F10.2.1 (optional static schema helper) is **not** authorized by this
document. It requires its own plan-and-approve cycle. Before that cycle
begins, the following must be true:

### Spec is locked

- [x] Base shape locked: every field name in §2 is final. Renames during
      F10.2.1 implementation would invalidate every cross-reference and are
      out of scope.
- [x] Seven envelope kinds are sufficient (§3). No eighth kind has been
      required by any consuming F-phase as of this revision.
- [x] `RedactionClass` enumerated values are locked: `"redacted"`,
      `"device-local"`, `"metadata-only"`.
- [x] `OperationIntent` enumerated values are locked: `"create"`,
      `"update"`, `"delete"`, `"review"`, `"cleanup"`.
- [x] Authority levels are inherited from F10.1 unchanged; no new level is
      introduced by F10.2.

### Validation contract is documented

- [x] Kind ↔ authority matrix (§4.1) is complete for all four platforms and
      all seven kinds.
- [x] Capability ↔ kind matrix (§4.2) covers every capability declared in
      F10.1 manifests.
- [x] Surface ↔ authority pairs (§4.3) are enumerated.
- [x] Declared vs effective authority semantics (§4.4) are unambiguous.
- [x] sourcePlatform-insufficiency rule (§4.5) is documented with five
      sub-conditions.
- [x] Mobile-specific guards (§4.6) and native-extension-specific guards
      (§4.7) reference the renamed fields (`redactionClass`, `subjectType`,
      `operationIntent`).
- [x] Version-skew behavior (§4.8) covers `schema`, `envelopeVersion`,
      `envelopeKindVersion`, and `schemaHash`.

### Blocker codes are enumerated

The full blocker code set that F10.2.1 must implement:

- `platform-not-authorized-for-kind`
- `capability-not-on-platform-allowlist`
- `surface-authority-mismatch`
- `mobile-payload-outside-allowlist`
- `mobile-must-redact`
- `native-extension-entity-outside-evidence-scope`
- `native-extension-not-authorized-for-tombstones`
- `envelope-schema-too-new`
- `envelope-schema-too-old`
- `envelope-schema-hash-unknown`
- `capability-snapshot-unknown`
- `operation-intent-wrong-for-kind`
- `delete-intent-on-read-only-kind`
- `delete-proposal-missing-f5-predicate`
- `delete-apply-event-missing-audit-id`
- `local-only-audit-detail-on-mobile-or-cache`
- `payload-contains-forever-no-field`
- `stale-evidence-not-revalidated`

No new blocker code may be added by F10.2.1 without first extending this
document.

### Redaction rules are encodable

- [x] Three `RedactionClass` values exhaust the redaction space (§5.1).
- [x] Forever-no field-name deny list (§5.3) is enumerated.
- [x] Delete-intent leakage rules (§5.4) name the four allowed kinds and
      the rejection codes for the disallowed kinds.
- [x] Mobile / cache local-only audit-detail deny list (§5.5) is a fixed
      table.

### Dedupe / replay invariants are encodable

- [x] Three hashes (`dedupeKey`, `payloadHash`, `eventDigest`) have explicit
      canonical input specs (§6.1).
- [x] `dedupeKey`-is-not-authority rule (§6.2) is explicit.
- [x] Closed-conflict non-reopen rule (§6.5) is explicit.
- [x] Stale-evidence preview-only rule (§6.6) is explicit.

### F10.2.1 must NOT do

When F10.2.1 is later authorized, the helper must:

- Be pure (no I/O, no `fetch`, no file system, no platform-specific runtime
  imports).
- Take the F10.1 manifest as a **parameter** to its validation function,
  never reach into a global or import a hardcoded snapshot.
- **Not** mutate envelopes. Validation produces a result object describing
  `effectiveAuthority` and any blockers; the envelope itself stays
  immutable.
- **Not** open transports, perform handshakes, or do anything bridge-like.
- **Not** introduce a "remote-apply" code path or any path that, on
  receiving any kind of envelope, writes a row.
- **Not** add tests that import the helper from runtime code paths in a way
  that would make it part of any apply / sync / cache / delete pipeline.
- **Not** ship with platform-specific shims (separate Desktop / Chrome /
  mobile builds). It is a single module.

### Anti-goals for F10.2.1

- Validation does not promote `effectiveAuthority` above `declaredAuthority`
  under any circumstance.
- Validation does not infer a sender's identity from transport metadata.
- Validation does not silently accept unknown blocker / warning codes.
- The helper does not provide an "apply" or "dispatch" function. It only
  validates.

### Items deliberately deferred to F10.2.2 (CI scan)

The following are out of scope for F10.2.1 and belong to F10.2.2:

- Repo-wide scan for envelope literals.
- Forever-no field-name grep across runtime code.
- `cacheMetadata`-to-write path scan.
- Validation against the live F10.1 manifest in CI.

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

- Match the field shape declared in §2 byte-for-byte, including renames
  (`kind`, `subjectType`, `dedupeKey`, `redactionClass`) and the
  declared-vs-effective authority split.
- Enforce the kind ↔ authority matrix in §4.1 with the blocker codes
  enumerated in the F10.2.1 Readiness Checklist.
- Compute `effectiveAuthority` from `declaredAuthority` + F10.1 manifest +
  `capabilityUsed` + `capabilitySnapshotHash`; never echo `declaredAuthority`
  directly to consumer code.
- Treat `sourcePlatform` alone as insufficient (§4.7).
- Reject payloads containing forever-no field names (§5.3), independent of
  `redactionClass`.
- Reject `operationIntent: "delete"` on read-only kinds (§5.4).
- Reject sensitive local-only audit details on mobile / cache envelopes
  (§5.5).
- Reject unknown warning or blocker codes by surfacing a meta-warning rather
  than promoting them.
- Treat `cacheMetadata` as forever non-routable to writes (§3.7).
- Treat transport as authority-neutral (§8).
- Treat replayed evidence against closed F6 lineages as diagnostic-only
  (§6.5).
- Treat stale envelopes (past `expiresAt`) as preview-only (§6.6).

Until those helpers exist, every cross-platform envelope produced or consumed
in the repository must conform to this document on the basis of code review
alone.
