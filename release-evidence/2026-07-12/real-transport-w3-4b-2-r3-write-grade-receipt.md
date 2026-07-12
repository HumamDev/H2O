# Real Transport W3.4b-2-R3 Write-Grade Receipt Remint

Verdict: W3.4b-2-R3 MINTED A WRITE-GRADE RECEIPT AND FRESH PRIVATE TOKENS ONLY. NO LIVE INVOCATION. NO WEBDAV WRITE.

This artifact records a new write-grade receipt under the renewed W3.4b-1-R2
approval window. It does not invoke `h2o_rt_first_write`, does not consume the
receipt, and does not perform network or write behavior.

## Prior Window Status

- W3.4b-3B fail-closed missing-token commit: `d4171915b30cef69ef53234ef12a533e8ed6e846`
- oldExpiredApprovalReceiptWindowUtc: `2026-07-10T16:00:00Z`
- oldExpiredApprovalReceiptWindowReused:false
- R2 receipt/readiness expired and must not be used for live invocation.

## Renewed Approval Binding

- renewedApprovalCommit: `714f80a458808550dc8fd59ee937837349f416da`
- renewedApprovalArtifact: `release-evidence/2026-07-12/real-transport-w3-4b-1-r2-renewed-operator-approval.md`
- renewedApprovalArtifactHash: `sha256:e6c7df7a015f06807cb2dba7ae89f6dd085f33843a40a01c53ff2885b214b48b`
- renewedApprovalExpiryUtc: `2026-07-15T20:00:00Z`
- renewedApprovalNotExpiredAtMint:true

## New Receipt Core

- receiptCoreArtifact: `release-evidence/2026-07-12/real-transport-w3-4b-2-r3-write-grade-receipt-core.json`
- receiptCoreHash: `sha256:b34cd56a9d5a16fe3dc5319b174522f2c7634ad17717405310c18cec0188e1cd`
- canonicalization: `json-sorted-keys-v1`
- schema: `h2o.sync.real-transport.write-grade-receipt.v1`
- receiptGrade: `write-grade`
- operationKind: `first-sacrificial-probe-write`
- payloadKind: `capability-probe-object`
- payloadCount:1
- maxInvocations:1
- mintUtc: `2026-07-12T20:31:02Z`
- expiryUtc: `2026-07-15T20:00:00Z`
- expiryWithinRenewedApproval:true
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

## Fresh Token Bindings

- oneShotTokenHash: `sha256:5c5b803c2612b94e0e6ceca999ebd1198eb4d2caff39909591aceaa74b1f3631`
- killSwitchTokenHash: `sha256:5cfb8c26eb9e5c14b05e140c708d1b9ac90df15714f8f51aea5f3307c491847a`
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
- privateFieldsPresent:true
- writeGradeRegistryRefHash: `sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff`
- writeGradeRegistryHashBoundary: `descriptor-refs-only-excludes-private-material`
- writeGradeRegistryRefHashMatchesReceipt:true
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
- W3.4b-1 expired operator approval: `db4cdc5ccbd436913f05aa7b526fc14fec03e5ea`
- W3.4b-1-R2 renewed operator approval: `714f80a458808550dc8fd59ee937837349f416da`
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
