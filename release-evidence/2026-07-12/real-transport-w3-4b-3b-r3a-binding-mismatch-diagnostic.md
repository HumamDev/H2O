# Real Transport W3.4b-3B-R3A Receipt Binding Mismatch Diagnostic

Verdict: W3.4b-3B-R3A diagnosed the R3 pre-network blockers. NO LIVE INVOCATION. NO WEBDAV WRITE. NO TOKEN BURN.

This phase inspected the committed R3 receipt core, the Rust pre-network
validation path, and the redacted R3 invocation evidence. It did not retry
`h2o_rt_first_write` in live mode, did not create a consumed marker, and did not
send any WebDAV method.

## Anchors

- W3.4b-3B-R3 fail-closed commit: `ccda0878e21fd95afe1614c15b0b64cc17d510ea`
- W3.4b-2-R3 receipt commit: `8c3422965c1202099c7177d4e63c53cf2b72a422`
- W3.4b-2.5-R3 readiness commit: `bab94bc677f6e38417f4ced98c0bd2b7404fa756`
- W3.4b-3A live executor implementation: `3048ab2dba3f4cbff4ec199dbb36093975659b52`
- renewed operator approval commit: `714f80a458808550dc8fd59ee937837349f416da`
- W3.4b-3B missing-token blocker commit: `d4171915b30cef69ef53234ef12a533e8ed6e846`

## Blockers Diagnosed

- blocker: `real-transport-w3-first-write-payload-hash-mismatch`
- blocker: `real-transport-w3-first-write-commit-binding-mismatch`
- blocker: `real-transport-w3-write-grade-receipt-core-hash-mismatch`

## Receipt Core Diagnosis

- receiptCoreArtifact: `release-evidence/2026-07-12/real-transport-w3-4b-2-r3-write-grade-receipt-core.json`
- expectedReceiptCoreHash: `sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd`
- recomputedReceiptCoreHash: `sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd`
- committedReceiptCoreHashMatches:true

Root cause: the committed R3 receipt core was correct, but Rust recomputed the
receipt hash from a typed receipt shape. That typed shape did not yet understand
the renewed R3 binding fields and reserialized absent optional fields as null
values before hashing. The runtime hash therefore differed from the committed
json-sorted-keys-v1 receipt core hash even though the committed core itself was
valid.

Code fix made: Rust now serializes the typed receipt with null values removed
before hashing, matching the committed evidence-safe receipt-core boundary.
Rust also has a regression test proving the committed R3 receipt core hashes to
`sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd`.

## Commit Binding Diagnosis

Root cause: the R3 receipt binds the expired approval as an explicit historical
anchor and the renewed approval as the active approval anchor. Rust still
required the legacy single active approval field, so it rejected the R3 renewed
approval binding.

Relevant R3 binding fields:

- `w34b1ExpiredOperatorApprovalCommit`
- `w34b1R2RenewedOperatorApprovalCommit`
- `w34b3BlockedMissingTokenCommit`

Code fix made: Rust now accepts either the legacy approval binding or the R3
renewed binding pair:

- expired approval anchor: `db4cdc5ccbd436913f05aa7b526fc14fec03e5ea`
- renewed approval anchor: `714f80a458808550dc8fd59ee937837349f416da`

If the optional missing-token blocker anchor is present, Rust also verifies:

- missing-token blocker anchor: `d4171915b30cef69ef53234ef12a533e8ed6e846`

## Payload Hash Diagnosis

- receiptPayloadHash: `sha256:7d9491ac8a547de8e9e7138d8408b8d609359e4f74b690960201d093e1aaf440`
- invocationPayloadClass: `loopback-sentinel-class`
- invocationPayloadByteLength:36
- invocationPayloadHash: `sha256:67b110e21148b315e5fef1acfb1c2ff39d9acc204ce47578b138a7df33af6829`
- payloadPreimageCommitted:false
- payloadPreimageRecovered:false
- payloadHashMismatchRootCause: `invocation-payload-did-not-match-receipt-bound-payload-hash`

Root cause: the invocation argument used a loopback sentinel-class payload whose
hash did not match the R3 receipt-bound payload hash. The committed R3 evidence
intentionally contains only the payload hash, not the payload preimage. Without
the exact R3 payload preimage, the R3 receipt cannot be retried safely.

## R3 Usability Decision

- r3ReceiptCoreValidAfterCodeFix:true
- r3CommitBindingValidAfterCodeFix:true
- r3PayloadBindingValid:false
- r3ReceiptUnconsumed:true
- r3ReceiptRetryReady:false
- r3ReceiptUsableForLiveRetry:false
- remintR4Required:true

The source fixes make the R3 receipt core and renewed approval binding
understandable to the executor. They do not fix the missing payload preimage.
Because the R3 receipt is payload-bound and the exact payload preimage is not
available in committed evidence, the safe next phase is to remint an R4 receipt
with a deterministic source-aligned payload preimage and hash.

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

- raw endpoint not printed or committed
- raw folder/root not printed or committed
- raw username not printed or committed
- raw credential not printed or committed
- raw auth header not printed or committed
- raw private registry contents not printed or committed
- raw one-shot token not printed or committed
- raw kill-switch token not printed or committed
- raw token material path not committed
- raw sacrificial path not printed or committed
- raw payload bytes not printed or committed
- raw listing not printed or committed
- raw response body not printed or committed

## Next Step

R3 should not be retried as-is. W3.4b should proceed by reminting an R4 receipt
under the active approval window, with a deterministic payload preimage that the
executor can reproduce or receive privately without exposing it in evidence.
W3.5 remains separate and blocked.
