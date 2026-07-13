# Real Transport W3.4b-3B-R5-R1 Live Sacrificial Invocation After R5A

Verdict: FAIL-CLOSED AFTER DURABLE CONSUMPTION AND BEFORE PUT. NO WEBDAV WRITE. NO CLEANUP.

Explicit operator approval recorded exactly:

`I approve W3.4b-3B-R5 retry live sacrificial invocation after R5A binding fix.`

## Anchors

- renewed operator approval: `714f80a458808550dc8fd59ee937837349f416da`
- W3.5B parent-collection PROPFIND fix: `305ff023ad12f14b6a9b505dab4123cf44c7cfba`
- R5 receipt commit: `ad569f70f33c5610649e7da381045b08b6e32cd7`
- R5 readiness commit: `c3d4d1160cc63c8514dcd6877e9c81e20f1dca2b`
- previous R5 fail-before-network commit: `6f069450c302d251a225cdba16bc305ab61a0936`
- R5A binding fix commit: `a0695eac1b3f11d7617a4a080c54d0b82663d478`
- live executor implementation: `3048ab2dba3f4cbff4ec199dbb36093975659b52`

## Receipt And Local Preflight

- receiptCoreHash: `sha256:b27b6eb6ed238c15d9b687a85d2d8b98e9db4434a7c6b1d30df26e96aaddca57`
- receiptCoreHashMatched:true
- receiptNotExpiredAtInvocation:true
- receiptGrade: `write-grade`
- maxInvocations:1
- createOnlyPutMax:2
- readbackGetMax:1
- otherMethods:0
- oneShotTokenHash: `sha256:4e6056552d5d6afc7ac1bc89624957ef324eb64b353bae6b64942174d74785d4`
- killSwitchTokenHash: `sha256:0ee62ecc6a594c752942702197d79fe49fa35ec5b3363551d7648f0c15aae02e`
- privateTokenMaterialPresent:true
- tokenPermissionsPrivate:true
- tokenHashesMatched:true
- registryPathSource: `app-local`
- writeGradeRegistryEligible:true
- writeGradeRegistryRefHash: `sha256:3222f11719c7bb17047cc3c6b6b01145d0748921792fb84fb5064c19541ee0ff`
- registryOwnerPermissionChecksPassed:true
- credentialMaterialPresent:true
- payloadHash: `sha256:67b110e21148b315e5fef1acfb1c2ff39d9acc204ce47578b138a7df33af6829`
- payloadHashMatchedExecutorSentinel:true
- payloadByteMax:256

All local pre-network gates passed before the durable marker was created.

## Durable Invocation State

- h2oRtFirstWriteInvokeCount:1
- consumedMarkerCreated:true
- consumedMarkerPermissionsPrivate:true
- consumedMarkerReceiptHashMatched:true
- receiptConsumed:true
- receiptInvoked:true
- tokenBurnOccurred:true
- networkAttempted:true
- retryAuthorized:false

R5 is consumed and must never be retried.

## Method And Status Result

| Operation | Attempted | Status | Family |
|---|---:|---:|---|
| PROPFIND parent readiness check | true | 401 | 4xx |
| PUT create-only #1 | false | not attempted | none |
| PUT create-only #2 | false | not attempted | none |
| GET read-back | false | not attempted | none |

- methodsAttempted: `PROPFIND`
- propfindAttemptCount:1
- putAttemptCount:0
- getAttemptCount:0
- networkObjectTargetsAttempted:0
- deterministicObjectTargetClassCount:1
- createOnlyBehavior: `not-attempted`
- readBackHashMatch: `not-attempted`
- primaryBlocker: `real-transport-w3-first-write-auth-refused`
- finalClassification: `fail-closed-consumed-invoked-no-write-pre-write-parent-propfind-401`

The corrected parent collection PROPFIND request returned `401`. The executor
stopped before the first PUT and did not retry credentials or send another
network method.

## Safety State

- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- forbiddenMethodUsed:false
- deleteAttempted:false
- cleanupPerformed:false
- archiveUserDataWritten:false
- fullBundleV3Started:false
- relayOutboxLedgerStoreMutation:false
- productSyncReady:false
- transportReady:false

No raw endpoint, folder/root, object path, username, credential, authorization
header, private registry content, response body, remote listing, private token,
or secret-derived fingerprint was printed or committed.

W3.5 diagnosis remains separate. This evidence does not authorize another
receipt, token ceremony, invocation, cleanup, or readiness transition.
