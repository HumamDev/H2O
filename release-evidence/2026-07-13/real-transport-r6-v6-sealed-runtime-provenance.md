# Real Transport R6-V6 - Sealed Runtime Provenance

V6 records the accepted offline build and local-only provenance proof for the sealed S2 runtime. The
future V6 evidence commit is not the executable target and introduces no runtime-source delta.

## Structured Manifest

<!-- r6-v6-manifest-begin -->
```json
{"approvalTrust":{"a6PrimeApprovalCoreHash":"sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13","a6PrimeCommit":"b2de60b88aa750897948e504e6458d943bf83f3b","a6PrimeExpiryUtc":"2026-07-15T17:10:31Z","a6PrimeMintUtc":"2026-07-13T17:10:31Z","clockSkewSeconds":120,"gateSealed":true,"historicalA6Commit":"892d88769c7897a9efe23e63aa2fb5a091ecaa64","historicalA6Prohibited":true},"build":{"commandStructure":"CARGO_TARGET_DIR=<fresh-target> CARGO_INCREMENTAL=0 CARGO_NET_OFFLINE=true cargo build --offline --bin h2o-studio-desktop --bin h2o-rt-write-grade-read-only-probe","completionObservedUtc":"2026-07-13T18:37:45Z","dependencyDownloadAttempted":false,"executableCompletionUtc":"2026-07-13T18:37:34Z","incremental":false,"offline":true,"profile":"debug","sourceCleanAfter":true,"sourceCleanBefore":true,"startUtc":"2026-07-13T18:35:35Z"},"equivalence":{"e6ToS2ProtectedRegionsByteIdentical":true,"markerBeforeFirstNetworkCall":true,"protectedRegionsCompared":10,"r4R5BurnedDenialUnchanged":true,"s2ToV6RuntimeSourceDelta":false},"evidenceGeneratedUtc":"2026-07-13T18:41:37Z","evidenceParent":"1bff833675fab8e88652697a895555a595bc2a3b","executables":{"desktop":{"sha256":"1675ce96ec1902bdce753ab3e53361ec2ec7fc8982d437edc79a23cfed885d8b","size":57424512},"probe":{"sha256":"8e2e5be03d5a260d91f41e00700651656f28247a2c248114e80e59f02a25db7f","size":15643808}},"foundation":{"e6Commit":"6cb091c75c49191f2e8e751847c347d11b3fa0a6","e6EvidenceSha256":"049f19915ea16c6bee606813de59cfc14ee6396f6ade4c35d802be52ae44a134","e6Propfind207RemainsAuthenticationProof":true,"e6RuntimeOutputSha256":"181e81594a1f31e27c413a17d40ae1475f648f2b18d68516ad4ccfbc6fbca4d6"},"freshTarget":{"group":"wheel","mode":"0700","owner":"hobayda","path":"/private/tmp/h2o-v6-target-20260713T183528Z"},"provenance":{"blockSha256":"sha256:6e94ae5c520e2c3c1e751073908db9a3b240369b1736c710763f0842bd2766a5","blockSize":1283,"buildDirty":false,"buildGitSha":"1bff833675fab8e88652697a895555a595bc2a3b","buildProfile":"debug","methodAttempts":{"DELETE":0,"GET":0,"OPTIONS":0,"PROPFIND":0,"PUT":0,"other":0},"networkAttempted":false,"parentPropfindFixPresent":true,"r5aBindingFixPresent":true,"stopReason":"real-transport-w3-write-grade-registry-missing"},"runtimeTarget":"1bff833675fab8e88652697a895555a595bc2a3b","safety":{"cleanupPerformed":false,"consumedMarkerCreated":false,"invocationCreated":false,"networkRequestPerformed":false,"productSyncReady":false,"receiptMinted":false,"remoteWritePerformed":false,"tokenGenerated":false,"transportReady":false,"v6AuthorizesLiveInvocation":false},"schema":"h2o.studio.transport.r6-v6-sealed-runtime-provenance.v1","staleBuild":{"buildDirty":true,"embeddedGitSha":"6cb091c75c49191f2e8e751847c347d11b3fa0a6","permanentlyRejected":true,"sha256":"4d0cac4cf0fbe918c0ee3d44e27598dda1d67aafb85b9a6acb56fa7d3064dbbc"},"v6EvidenceCommitIsExecutableTarget":false}
```
<!-- r6-v6-manifest-end -->

## Exact Captured Provenance Output

The bytes between the markers are the retained safe stdout bytes captured directly from the single
local-only provenance execution. They are unchanged: no reconstruction, reformatting, filtering, or
whitespace change was applied.

<!-- r6-v6-provenance-output-begin -->
{
  "schema": "h2o.studio.transport.write-grade-read-only-probe-result.v1",
  "ok": false,
  "status": "real-transport-w3-write-grade-read-only-probe-blocked",
  "reason": "real-transport-w3-write-grade-registry-missing",
  "command": "h2o_rt_write_grade_read_only_probe",
  "buildGitSha": "1bff833675fab8e88652697a895555a595bc2a3b",
  "buildProfile": "debug",
  "buildDirty": false,
  "parentPropfindFixPresent": true,
  "r5aBindingFixPresent": true,
  "normalProbeRegistryPathSource": "invalid",
  "writeGradeRegistryPathSource": "invalid",
  "registrySelectionEquivalent": false,
  "endpointMaterialEquivalent": false,
  "remoteRootMaterialEquivalent": false,
  "credentialMaterialEquivalent": false,
  "writeGradeRegistryEligible": false,
  "credentialMaterialPresent": false,
  "methodStatuses": [],
  "networkAttempted": false,
  "writeGradeReadOnlyProbePassed": false,
  "likelyCause": "pre-network-registry-resolution-blocked",
  "receiptConsumed": false,
  "consumedMarkerCreated": false,
  "writesWebdav": false,
  "writesCloud": false,
  "writesRelay": false,
  "writesCas": false,
  "writesFiles": false,
  "productSyncReady": false,
  "transportReady": false,
  "rawPrivateFieldsLogged": false,
  "blockers": [
    "real-transport-w3-write-grade-registry-missing"
  ]
}
<!-- r6-v6-provenance-output-end -->

## Runtime And Build Record

- approved executable runtime commit: `1bff833675fab8e88652697a895555a595bc2a3b`
- evidence parent: `1bff833675fab8e88652697a895555a595bc2a3b`
- V6 evidence commit is executable target: `false`
- fresh target: `/private/tmp/h2o-v6-target-20260713T183528Z`
- target owner/group/mode: `hobayda:wheel`, `0700`
- Desktop executable: `57424512` bytes,
  SHA-256 `1675ce96ec1902bdce753ab3e53361ec2ec7fc8982d437edc79a23cfed885d8b`
- probe executable: `15643808` bytes,
  SHA-256 `8e2e5be03d5a260d91f41e00700651656f28247a2c248114e80e59f02a25db7f`
- captured provenance: `1283` bytes,
  SHA-256 `sha256:6e94ae5c520e2c3c1e751073908db9a3b240369b1736c710763f0842bd2766a5`
- rejected stale executable SHA-256:
  `4d0cac4cf0fbe918c0ee3d44e27598dda1d67aafb85b9a6acb56fa7d3064dbbc`
- neither fresh executable equals the rejected stale executable: `true`

The build used Cargo offline mode with network disabled and incremental compilation disabled. It
produced both explicit binaries from a clean S2 worktree. No dependency download was attempted.

## Trust And Equivalence

- replacement A6' commit: `b2de60b88aa750897948e504e6458d943bf83f3b`
- replacement A6' approval-core hash:
  `sha256:1ee20882c449c93536862c6dcd4448ac98e768bb58e50d20074170d32b67da13`
- replacement A6' mint/expiry: `2026-07-13T17:10:31Z` / `2026-07-15T17:10:31Z`
- sealed gate matches replacement A6': `true`
- historical A6 remains permanently prohibited: `true`
- E6 commit: `6cb091c75c49191f2e8e751847c347d11b3fa0a6`
- E6 evidence SHA-256: `049f19915ea16c6bee606813de59cfc14ee6396f6ade4c35d802be52ae44a134`
- E6 runtime-output SHA-256: `181e81594a1f31e27c413a17d40ae1475f648f2b18d68516ad4ccfbc6fbca4d6`
- E6 authenticated PROPFIND 207 remains the authentication proof: `true`
- E6 to S2 protected regions: `10/10` byte-identical
- S2 to V6 runtime-source delta: `zero`
- R4/R5 burned denial: unchanged
- consumed-marker-before-first-network ordering: unchanged

No additional network proof is required because the accepted request and network regions remain
byte-identical. The rejected stale build is recorded separately and is never used for V6 or R6.

## Safety State

- network request performed: `false`
- receipt minted: `false`
- token generated: `false`
- consumed marker created: `false`
- invocation created: `false`
- remote write performed: `false`
- cleanup performed: `false`
- productSyncReady: `false`
- transportReady: `false`
- V6 authorizes live invocation: `false`

Receipt and token preparation remains blocked until V6 is reviewed and integrated. V6 records
provenance only and does not authorize live invocation.
