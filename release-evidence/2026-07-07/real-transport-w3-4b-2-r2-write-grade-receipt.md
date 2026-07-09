# Real Transport W3.4b-2-R2 Write-Grade Receipt Remint

Verdict: W3.4b-2-R2 REMINTED A WRITE-GRADE RECEIPT AND FRESH PRIVATE TOKENS ONLY. NO LIVE INVOCATION. NO WEBDAV WRITE.

This artifact replaces the locally unusable W3.4b-2 token binding with a fresh
write-grade receipt and fresh private token material for a future explicit
W3.4b live sacrificial invocation. It does not invoke `h2o_rt_first_write`, does
not consume the receipt, and does not perform network or write behavior.

## Prior Receipt Status

- priorW34b2ReceiptCommit: `19b81af406b5d731035f7ec004d1eebbcb8beef3`
- priorReceiptCoreHash: `sha256:267688e94be9359d83cebfbd6ce4d2ecd5259808d15ab5d818973f90973d1fb7`
- priorReceiptLocallyUnusable:true
- priorReceiptUnusableReason: `raw-private-token-material-missing`
- W3.4b-3B fail-closed missing-token commit: `d4171915b30cef69ef53234ef12a533e8ed6e846`
- priorReceiptConsumed:false
- priorReceiptInvoked:false

## New Receipt Core

- receiptCoreArtifact: `release-evidence/2026-07-07/real-transport-w3-4b-2-r2-write-grade-receipt-core.json`
- receiptCoreHash: `sha256:38570bc5ef7e5f8eaabc4092d3878bc1194ae93cf41bf41377912d1fda88203d`
- canonicalization: `json-sorted-keys-v1`
- schema: `h2o.sync.real-transport.write-grade-receipt.v1`
- receiptGrade: `write-grade`
- operationKind: `first-sacrificial-probe-write`
- payloadKind: `capability-probe-object`
- payloadCount:1
- maxInvocations:1
- mintUtc: `2026-07-09T15:01:52Z`
- expiryUtc: `2026-07-10T16:00:00Z`
- approvalExpiryUtc: `2026-07-10T16:00:00Z`
- expiryWithinApproval:true
- expiryWithin72h:true
- receiptConsumed:false
- receiptInvoked:false

## Request Budget

- createOnlyPutMax:2
- readbackGetMax:1
- otherMethods:0
- payloadByteMax:256

## Sacrificial Object

- pathClassRefHash: `sha256:8aedee795f789ede1887eb8e7f9ca909fc7aea6939aa0348313c56777218fc61`
- payloadHash: `sha256:7d9491ac8a547de8e9e7138d8408b8d609359e4f74b690960201d093e1aaf440`
- payloadByteMax:256
- rawPathCommitted:false
- rawPayloadCommitted:false

## Approval And Fresh Token Bindings

- operatorApprovalArtifactHash: `sha256:19261aedee989dc33f2c35ffa98c57b06531be21858049e49c399f753a81d800`
- oneShotTokenHash: `sha256:1b49841cc56e1c6bb663fbf0547134ef6ae2007c1cf93330fd4130104b735e97`
- killSwitchTokenHash: `sha256:8e7fda833d2d0bf85fd64db12e45655436b799ec6a77b846e3faa9f4776ba9dc`
- privateTokenPathClass: `out-of-repo-private-token-file`
- privateTokenMaterialPresent:true
- privateTokenFileMode: `0600`
- tokenPermissionsPrivate:true
- rawOneShotTokenCommitted:false
- rawKillSwitchTokenCommitted:false

## Registry Preflight

- registryPathSource: `app-local`
- writeGradeRegistryEligible:true
- registryOwnerOk:true
- registryPermissionOk:true
- registryFileOwner:true
- registryFilePrivate:true
- registryParentOwner:true
- registryParentPrivate:true
- credentialMaterialPresent:true
- privateContentHashAvailable:true
- writeGradeRegistryRefHash: `sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff`
- writeGradeRegistryHashBoundary: `descriptor-refs-only-excludes-private-material`
- defaultPrivateLegacyWriteGradeEligible:false

## Receipt Bindings

- endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`
- remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`
- credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`
- W3.1 live read-only WebDAV closeout: `7862270237955b86d48d943263fd53947cc71f72`
- W3.1 request-shape alignment: `70e7fcc9669b939b505de96a7bb0ec61509c3370`
- W3.2 mock executor proof: `649849e7e48c7e5bc5924bc811d857f2435866ae`
- W3.3A write-grade receipt / approval gate design: `671fdc1c855b345185e5ea257b206c0a07cdab36`
- W3.3B registry storage hardening: `388a952745ab7a21ba9556531eccf5c7e0ffe1ce`
- W3.3C write-grade registry hash boundary: `aba4c70068d95ee373d157fddea06bfb31b505b0`
- W3.4a refused first-write command proof: `a830ccb6b633a9d6cee35e6db92464e870d5693d`
- W3.4b-0 approval package/checklist: `d196f4b26d904394c435c15dd14d12cd18f03190`
- W3.4b-1 operator approval artifact: `db4cdc5ccbd436913f05aa7b526fc14fec03e5ea`
- W3.4b-3B missing-token blocker: `d4171915b30cef69ef53234ef12a533e8ed6e846`

## Boundary Confirmations

- liveInvocationPerformed:false
- h2oRtFirstWriteInvoked:false
- networkAttempted:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- forbiddenMethodUsed:false
- tokenExportIdSequenceBurn:false
- relayOutboxLedgerStoreMutation:false
- fullBundleV3Started:false
- archiveUserDataWritten:false
- productSyncReady:false
- transportReady:false

## Redaction Rules Observed

- raw endpoint not committed
- raw folder/root not committed
- raw username not committed
- raw credential not committed
- raw auth header not committed
- raw private registry contents not committed
- raw one-shot token not committed
- raw kill-switch token not committed
- raw sacrificial path not committed
- raw sentinel payload not committed
- no listing or response body committed

## Next Phase

W3.4b live invocation remains separate and still requires explicit operator go.
This reminted receipt does not authorize background dispatch, product readiness,
transport readiness, archive/fullBundle writes, cleanup, or any object beyond
the approved single sacrificial probe object budget.
