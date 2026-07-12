# Real Transport W3.5B PROPFIND 401 Diagnostic

Verdict: W3.5B DIAGNOSED THE W3.4b-R4 PRE-WRITE `PROPFIND` 401 AS A LIVE
EXECUTOR TARGET-SHAPE MISMATCH. NO LIVE INVOCATION. NO WEBDAV WRITE.

This phase compared the W3.1 successful read-only `PROPFIND` request shape with
the W3.4b live executor pre-write `PROPFIND` shape. It did not invoke
`h2o_rt_first_write`, remint a receipt, generate tokens, consume a receipt,
create a consumed marker, or perform any WebDAV/cloud/relay/CAS/file write.

## Anchors

- W3.5A fail-closed no-write closeout: `f08f9b0f750e6d863a32c5de8f1edbe97955d0c1`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.1 read-only closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.4b-3B-R4 consumed/no-write invocation: `bf6122f8670eb273a2c93cf81d41fe95ea818d38`
- R4 receiptCoreHash: `sha256:b18da77e97eb2ab339ea974db93b5fb51bd1a5b4a478d69fa2bc5d18084fd183`

## Symptom

- w31PropfindStatus: `207 / 2xx`
- w31RemoteRootReachable:true
- w31RootExists:true
- w34bR4PropfindStatus: `401 / 4xx`
- w34bR4FailureClass: `pre-write-propfind-401`
- w34bR4PutAttempted:false
- w34bR4GetAttempted:false
- writesWebDAV:false

## Redacted Request-Shape Comparison

| Field | W3.1 successful read-only `PROPFIND` | W3.4b-R4 pre-fix live executor `PROPFIND` | W3.5B correction |
| --- | --- | --- | --- |
| targetShapeClass | `endpoint-plus-folder` | `endpoint-plus-folder-plus-sacrificial-object` | `endpoint-plus-folder-parent-collection` |
| registryPathSourceClass | `default-private` | `app-local` | `app-local` |
| authSourceClass | `private-descriptor-auth-header` | `private-descriptor-auth-header` | `private-descriptor-auth-header` |
| credentialMaterialPresent | true | true | true |
| trailingSlash | true | false | true |
| doubleSlash | false | false | false |
| propfindDepthHeaderPresent | true | true | true |
| propfindXmlBodyPresent | true | true | true |
| contentTypeClass | `xml` | `xml` | `xml` |
| acceptHeaderClass | `xml` | `xml` | `xml` |
| redirectPolicyClass | `do-not-follow` | `do-not-follow` | `do-not-follow` |
| credentialForwardingOnRedirectDisabled | true | true | true |

## Diagnosis

- rootCause: `live-executor-propfind-targeted-sacrificial-object-path`
- requestShapeParityMissed:true
- credentialSourceMismatchSuspected:false
- tokenCeremonyCredentialConfusionSuspected:false
- basicAuthBuilderMismatchSuspected:false
- propfindXmlHeaderMismatchSuspected:false
- redirectPolicyMismatchSuspected:false

The W3.1 path proved provider readiness by sending `PROPFIND Depth 0` with the
read-only XML metadata body to the prepared folder/root collection with a
trailing slash. The W3.4b live executor used the same WebDAV credential source,
same XML body/header class, and same redirect refusal policy, but it sent the
pre-write `PROPFIND` to the final deterministic sacrificial object path. That
object target had no trailing slash and differed from the W3.1-proven collection
shape.

Because the R4 attempt returned `401` before any `PUT`, the safest
classification is provider-specific object-path `PROPFIND` auth/readiness
rejection. The future live executor should check the parent/root collection
readiness using the W3.1-compatible collection shape, then rely on create-only
`PUT` with `If-None-Match: *` to refuse overwrite of the object path.

## Code Change

- codeChanged:true
- liveExecutorFix: `PROPFIND pre-write parent readiness check`
- livePropfindTargetAfterFix: `parent collection`
- livePutTargetAfterFix: `single deterministic sacrificial object`
- liveGetTargetAfterFix: `single deterministic sacrificial object`
- objectOverwriteGuardAfterFix: `PUT If-None-Match create-only`
- noWriteMethodsAdded:true
- deleteCleanupPathAdded:false

The Rust live executor now builds a parent collection URL for the pre-write
`PROPFIND` and keeps object-level URLs for the approved `PUT`, second `PUT`, and
read-back `GET`. A unit test verifies that the parent collection target and
object target are distinct without touching a real endpoint.

## Remint And Review Decision

- r4ReceiptReusable:false
- futureRemintRequired:true
- freshReadinessRequired:true
- freshExplicitApprovalRequired:true
- fableClaudeReviewRecommendedBeforeRemint:false

The R4 receipt was consumed by the approved W3.4b-3B-R4 invocation attempt and
cannot be retried. A future attempt requires a new receipt/token ceremony and
fresh explicit approval after this code fix is committed. Because the cause is a
localized request-target mismatch and the fix is covered by a no-network unit
test, an external Fable/Claude review is optional rather than required before
remint.

## Boundary Confirmations

- liveInvocationPerformed:false
- h2oRtFirstWriteInvoked:false
- receiptMinted:false
- tokenGenerated:false
- tokenBurnOccurred:false
- consumedMarkerCreated:false
- networkAttempted:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- putAttempted:false
- deleteCleanupPerformed:false
- cleanupPerformed:false
- forbiddenMethodUsed:false
- relayOutboxLedgerStoreMutation:false
- fullBundleV3Started:false
- productSyncReady:false
- transportReady:false

## Next Step

W3.5C or a later explicitly approved phase should validate the corrected
request shape in a no-write/read-only way first, then perform a renewed
receipt/token/readiness ceremony only if the read-only diagnosis remains clean.

## Redaction Rules Observed

- raw endpoint not printed or committed
- raw path not printed or committed
- raw listing not printed or committed
- raw credential not printed or committed
- raw auth header not printed or committed
- raw response body not printed or committed
- raw private registry contents not printed or committed
- raw token material not printed or committed
- secret-derived fingerprint not printed or committed
