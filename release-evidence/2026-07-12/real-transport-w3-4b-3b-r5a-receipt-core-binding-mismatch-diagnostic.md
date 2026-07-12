# Real Transport W3.4b-3B-R5A Receipt/Core Binding Diagnostic

Verdict: W3.4b-3B-R5A diagnosed and fixed stale Rust receipt binding expectations. NO LIVE INVOCATION. NO WEBDAV WRITE. NO TOKEN BURN.

This phase inspected the committed R5 receipt core and the Rust pre-network
validator. It did not call `h2o_rt_first_write`, create a consumed marker, or
send any WebDAV method.

## Anchors

- R5 fail-closed invocation commit: `6f069450c302d251a225cdba16bc305ab61a0936`
- R5 receipt commit: `ad569f70f33c5610649e7da381045b08b6e32cd7`
- R5 readiness commit: `c3d4d1160cc63c8514dcd6877e9c81e20f1dca2b`
- renewed approval commit: `714f80a458808550dc8fd59ee937837349f416da`
- R4 no-write closeout commit: `f08f9b0f750e6d863a32c5de8f1edbe97955d0c1`
- W3.5B parent-PROPFIND fix commit: `305ff023ad12f14b6a9b505dab4123cf44c7cfba`

## Blockers Diagnosed

- blocker: `real-transport-w3-first-write-commit-binding-mismatch`
- blocker: `real-transport-w3-write-grade-receipt-core-hash-mismatch`

## Receipt Core Diagnosis

- receiptCoreArtifact: `release-evidence/2026-07-12/real-transport-w3-4b-2-r5-write-grade-receipt-core.json`
- expectedReceiptCoreHash: `sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57`
- recomputedReceiptCoreHash: `sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57`
- canonicalization: `json-sorted-keys-v1`
- committedReceiptCoreHashMatches:true

Root cause: the committed R5 core is valid. Rust deserialized it into a typed
binding structure that did not define `w34b3R4NoWriteCloseoutCommit` or
`w35bParentPropfindFixCommit`. Serde therefore discarded both R5 fields before
the null-elided, sorted typed value was hashed, producing a different runtime
core hash.

Code fix made: both R5 fields are now represented in the typed receipt binding
structure and checked against their expected commits when present. A regression
test parses the committed R5 core and proves the Rust canonical hash equals the
committed receipt core hash.

## Commit Binding Diagnosis

Root cause: R5 binds the renewed approval directly through
`w34b1R2RenewedOperatorApprovalCommit`. Rust still required the historical
expired approval field to be present as part of a pair. R5 intentionally omits
that old field, so the otherwise valid renewed approval binding was rejected.

Code fix made: the renewed approval commit is the required active anchor. The
historical expired approval anchor remains optional; when supplied, it must
match the known expired approval commit. The R4 no-write closeout and W3.5B
parent-PROPFIND fix anchors are also verified when supplied.

## R5 Usability Decision

- r5ReceiptCoreValidAfterCodeFix:true
- r5CommitBindingValidAfterCodeFix:true
- r5PayloadBindingValid:true
- r5ReceiptUnconsumed:true
- r5ReceiptUsableForRetryAfterFreshApproval:true
- remintR6Required:false
- recommendation: `R5 retry after fix and fresh approval`

The R5 receipt remains unconsumed and its private invocation tokens were not
burned by this phase. A future live retry is not authorized here and requires a
new explicit operator approval phase.

## Boundary Confirmations

- liveInvocationPerformed:false
- h2oRtFirstWriteLiveInvoked:false
- networkAttempted:false
- consumedMarkerCreated:false
- receiptConsumed:false
- receiptInvoked:false
- tokenBurnOccurred:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- forbiddenMethodUsed:false
- relayOutboxLedgerStoreMutation:false
- fullBundleV3Started:false
- archiveUserDataWritten:false
- productSyncReady:false
- transportReady:false

## Redaction Rules Observed

- no raw endpoint, remote path, listing, credential, auth header, response body,
  private registry content, token material, or secret-derived fingerprint was
  printed or committed
- evidence contains only committed hash references, commit anchors, field names,
  blockers, and safety booleans
