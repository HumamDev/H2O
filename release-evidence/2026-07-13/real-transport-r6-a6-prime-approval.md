# Real Transport R6-A6' — Replacement Fresh Bounded Approval Artifact

Verdict: A6' IS THE FRESH REPLACEMENT BOUNDED R6 APPROVAL ARTIFACT. IT SUPERSEDES THE HISTORICAL A6
AND BECOMES THE SOLE APPROVAL THAT A LATER S2 RUNTIME MAY SEAL. IT APPROVES ONLY PREPARATION FOR THE
TIGHTLY CONSTRAINED FOUR-REQUEST SACRIFICIAL WEBDAV CEREMONY. IT DOES NOT CONSTITUTE THE OPERATOR'S
LIVE APPROVAL PHRASE, DOES NOT AUTHORIZE ANY HTTP/WEBDAV REQUEST, DOES NOT MINT A RECEIPT OR TOKEN,
DOES NOT CREATE A CONSUMED MARKER, AND DOES NOT SEAL THE R6 APPROVAL GATE. THE GATE REMAINS UNSEALED
(`R6_APPROVAL_GATE_SEALED = false`, `R6_APPROVAL_COMMIT = ""`, `R6_APPROVAL_ARTIFACT_HASH = ""`) UNTIL
A SEPARATE, REVIEWED S2 COMMIT SEALS EXACTLY THIS ARTIFACT'S COMMIT SHA AND APPROVAL-CORE HASH.

This artifact is evidence and validator only. No runtime Rust source, the TC test/validator, the
historical A6 artifact/validator, or the E6/S1/S1.1/S1.2 evidence/validators are modified.

## Supersession Record

- historicalA6Commit: `892d88769c7897a9efe23e63aa2fb5a091ecaa64`
- historicalA6Hash: `sha256:ead9927bcb249c2efcdff267c922aaa5b2deb1b6e4b6bb717e5524d34669095e`
- historicalA6Status: unsealed, superseded, and permanently prohibited from S2 use
- tcCommit: `8ae6aade5d56d2b012c40e5a35b5183cb331430d`
- replacementReason: the inline unsealed-gate test was made state-independent (TC) before sealing so
  that S2 can remain an exact three-production-constant delta with a fully green test suite
- soleSealableApproval: A6' is the only candidate approval S2 may later seal

The historical A6 was valid when created and integrated. It became unsuitable for sealing only after
the test-scope reconciliation decision (TC), which required a fresh replacement approval minted on the
TC parent. The historical A6 commit and hash must never be copied into the future S2 constants.

## Anchors Respected

- E6 commit: `6cb091c75c49191f2e8e751847c347d11b3fa0a6`
- E6 parent: `cab9bbecaf9612208af6ab33afe446407b7b58d3`
- E6 evidence SHA-256: `049f19915ea16c6bee606813de59cfc14ee6396f6ade4c35d802be52ae44a134`
- E6 embedded runtime-stdout SHA-256: `181e81594a1f31e27c413a17d40ae1475f648f2b18d68516ad4ccfbc6fbca4d6`
- S1 commit: `6031034427194ef4b0f77b72e0632ab88aa645bb`
- S1.1 acceptance commit: `d892be30ea91034f6ff4e0db7004c591d4e2f330`
- S1.2 commit: `b3584b3597f45fdfbf816bea98cff7ff5227ef6d`
- historical A6 commit: `892d88769c7897a9efe23e63aa2fb5a091ecaa64`
- TC commit: `8ae6aade5d56d2b012c40e5a35b5183cb331430d`
- Approved base-lineage anchor: TC (`8ae6aade5d56d2b012c40e5a35b5183cb331430d`)

## Corrected Seven-Field Approval Core (as committed at TC)

The committed `R6ApprovalCore` contains exactly seven typed, non-null, `deny_unknown_fields` camelCase
fields: `schemaVersion`, `approvalArtifactIdentifier`, `mintUtc`, `expiryUtc`,
`constrainedDescendantAuthorizationDescriptor`, `ceremonyPolicyIdentifier`, `e6Commit`. The future
final-runtime commit SHA is absent from this core (it remains required in `R6RuntimeBinding` and the
complete R6 receipt-core hash), which is what resolved the A6/S2/V6 ordering cycle in S1.2.

## Canonical Approval-Core JSON

The following block contains the exact canonical typed JSON bytes hashed to produce the approval-core
hash: sorted keys, no indentation, no leading/trailing whitespace inside the markers, one physical
line, no null, no float, no duplicate or unknown field, pure UTF-8.

<!-- r6-a6-prime-approval-core-begin -->
```json
{"approvalArtifactIdentifier":"h2o.real-transport.r6.a6-prime.approval.20260713T171031Z","ceremonyPolicyIdentifier":"h2o.r6.sacrificial-webdav-four-step.v1","constrainedDescendantAuthorizationDescriptor":"h2o.r6.constrained-descendant-authorization.v1","e6Commit":"6cb091c75c49191f2e8e751847c347d11b3fa0a6","expiryUtc":"2026-07-15T17:10:31Z","mintUtc":"2026-07-13T17:10:31Z","schemaVersion":"h2o.r6.approval.v1"}
```
<!-- r6-a6-prime-approval-core-end -->

- approvalCoreCanonicalization: `json-sorted-keys-v1` (compact, no whitespace, matches
  `serde_json::to_vec` over the sorted, null-stripped typed value)
- approvalCoreHashDomain: `h2o.r6.approval-core.v1\n`
- approvalCoreHash: `sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13`

This hash was computed as `sha256(utf8("h2o.r6.approval-core.v1\n") || canonicalJsonBytes)` over the
exact 412 bytes above, byte-equivalent to the committed Rust `domain_separated_hash` /
`canonical_typed_json_bytes` / `sorted_json_value` implementation for this ASCII-only seven-field
object.

## Identifiers

- approvalSchemaVersion: `h2o.r6.approval.v1` (matches committed `R6_APPROVAL_SCHEMA_VERSION`)
- constrainedDescendantAuthorizationDescriptor: `h2o.r6.constrained-descendant-authorization.v1`
  (matches committed `R6_DESCENDANT_AUTHORIZATION_DESCRIPTOR`)
- ceremonyPolicyIdentifier: `h2o.r6.sacrificial-webdav-four-step.v1` (matches committed
  `R6_CEREMONY_POLICY_IDENTIFIER`)
- approvalArtifactIdentifier: `h2o.real-transport.r6.a6-prime.approval.20260713T171031Z`
  (mint-derived, unique to this replacement mint; distinct from the historical
  `h2o.real-transport.r6.a6.approval.2026-07-13`)

## Expiry Policy

- mintUtc: `2026-07-13T17:10:31Z` (actual live UTC resolved immediately before artifact generation)
- expiryUtc: `2026-07-15T17:10:31Z`
- validitySeconds: `172800` (48 hours)
- maximumValiditySeconds: `259200` (72 hours)
- clockSkewSeconds: `120`

A6' expiry remains enforceable after S2 sealing. Compiling this artifact's commit SHA and
approval-core hash into S2's compiled constants does not revive an expired A6': the R6 runtime gate
checks live UTC against `expiryUtc` (plus the clock-skew allowance) at receipt-validation time,
independent of whether the commit/hash pair is compiled in. If this artifact expires before
S2/V6/R6 preparation completes, a fresh replacement approval must be minted and re-sealed.

## Policy Flags

- noRetry: `true`
- noCleanup: `true`
- readinessFlagsRemainFalse: `true`
- operatorLiveApprovalStillRequired: `true`
- isOperatorLiveApprovalPhrase: `false`
- a6PrimeAuthorizesLiveInvocation: `false`
- receiptMintingAuthorized: `false`
- tokensGenerated: `false`
- consumedMarkerCreated: `false`
- networkRequestPerformed: `false`
- productSyncReady: `false`
- transportReady: `false`

**A6' approves only preparation for the bounded R6 ceremony.
It does not authorize receipt minting, token generation, consumed-marker creation, or any HTTP or
WebDAV request. A separate exact operator phrase remains mandatory immediately before the sole live
invocation.**

## Constrained-Descendant Manifest

The approved descendant chain is exactly: **A6' -> S2 -> V6 -> R6 preparation**. No other descendant
shape is authorized. Each step's permitted delta is machine-verifiable against the rules below.

### A6' (this artifact)

- Allowed changed paths (exact):
  - `release-evidence/2026-07-13/real-transport-r6-a6-prime-approval.md`
  - `tools/validation/sync/validate-real-transport-r6-a6-prime-approval.mjs`
- Rust/runtime source change: prohibited (zero delta to any `.rs`, `.tauri.js`, `Cargo.*`,
  `tauri.conf.json`, `capabilities/**`).
- Approval gate remains unsealed: `R6_APPROVAL_GATE_SEALED = false`,
  `R6_APPROVAL_COMMIT = ""`, `R6_APPROVAL_ARTIFACT_HASH = ""`.

### S2 (future, not created by this artifact)

- Runtime source delta permitted only for exactly these three production constant assignments in
  `apps/studio/desktop/src-tauri/src/real_transport_capability_probe.rs`:
  - `R6_APPROVAL_GATE_SEALED`: `false` -> `true`
  - `R6_APPROVAL_COMMIT`: `""` -> exact A6' commit SHA
  - `R6_APPROVAL_ARTIFACT_HASH`: `""` -> exact A6' approval-core hash
    (`sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13`)
- Permitted additional paths: S2 evidence under `release-evidence/**`, S2 point-in-time validator
  under `tools/validation/sync/**`.
- No test-source change in S2; no other Rust byte may change.
- The full test suite must remain green because TC is already integrated.
- Prohibited in S2: use of the historical A6 commit/hash; any R4/R5 denylist change; any protected
  request/network change; any registry, credential, URL, client, timeout, redirect, method, marker,
  or readiness change; any unrelated `#[cfg(test)]` change; arbitrary descendant paths; arbitrary
  approval replacement.
- All ten protected request/network regions (registry selection, credential/Authorization
  construction, endpoint/root resolution, parent/target URL construction, HTTP client construction,
  redirect/timeout policy, PROPFIND/PUT/GET construction, the four-step live network state machine,
  consumed-marker persistence and before-network ordering, readiness implementation) must remain
  byte-identical to TC.

### V6 (future, not created by this artifact)

- Runtime source delta after S2: prohibited.
- Permitted: clean-build provenance evidence, protected-region equivalence evidence, validators.
- The final runtime is S2 itself, or an evidence/validator-only descendant of S2 with a
  validator-proven zero runtime-source delta.

### R6 preparation (future, not created by this artifact)

- Runtime source delta: prohibited.
- Permitted: receipt/readiness evidence and receipt/readiness validators only.
- No live HTTP/WebDAV request occurs during preparation.

No arbitrary descendant or broad source-pattern exception is authorized at any step. A validator at
each step must diff against its exact parent and assert the path allow-list and the byte-identical
protected-region set above.

## Exact Ceremony Authorization

A6' approves preparation for only this future four-request sequence, then permanent stop:

1. **PROPFIND** — target: parent collection; attempt ceiling: 1; expected status: `207`.
2. **PUT** — attempt ceiling: 1; create-only with `If-None-Match: *`; one deterministic sacrificial
   object; expected status: `201` only.
3. **PUT** — attempt ceiling: 1; identical path and create-only condition;
   expected status: `412` only.
4. **GET** — attempt ceiling: 1; same object; accepted status: `2xx`; exact payload-hash match
   required.
5. Stop permanently.

Total request ceiling: `4`.

Explicitly prohibited:

- any automatic or manual retry
- `DELETE`
- cleanup
- `OPTIONS`
- `MKCOL`
- `PROPPATCH`
- `MOVE`
- `COPY`
- `LOCK`
- `UNLOCK`
- `POST`
- redirects
- host change
- scheme change
- port change
- archive writes
- chat writes
- fullBundle writes
- fullBundle.v3 writes
- relay writes
- CAS writes
- outbox writes
- ledger writes
- any user-data write
- any readiness-flag change

Additional ceremony statements:

- The durable consumed marker must be persisted before the first network byte.
- After marker creation the receipt is permanently burned.
- An ambiguous PUT outcome cannot be resolved through another invocation.
- Final transport readiness remains a separate review, decided only after this ceremony's closeout.
- The operator's fresh, exact, live approval phrase remains mandatory immediately before the one live
  invocation. This artifact is not that phrase.

No raw remote path, endpoint, root, username, credential, Authorization value, response body, or
remote listing is recorded anywhere in this artifact.

## Final State

A6' is a fresh, bounded, evidence-only replacement approval artifact, child of the integrated TC
mainline. It binds immutably to E6 and to the accepted S1/S1.1/S1.2/A6/TC lineage, records the
supersession of the historical A6, approves only a precisely constrained future descendant chain
(A6' -> S2 -> V6 -> R6 preparation), and defines the exact bounded four-request ceremony. It expires
at `2026-07-15T17:10:31Z` using live UTC. It contains no receipt or token material, does not claim the
operator has approved the live invocation, and is safely hashable by the committed TC/S1.2 typed
approval-core implementation. S2 needs only two values to seal: this artifact's commit SHA and its
canonical approval-core hash
(`sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13`).
