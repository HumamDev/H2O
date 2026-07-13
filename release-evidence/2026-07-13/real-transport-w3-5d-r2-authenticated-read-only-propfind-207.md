# Real Transport W3.5D-R2 Authenticated Read-Only PROPFIND 207 Proof

Verdict: WRITE-GRADE EXECUTOR-PATH READ-ONLY PROPFIND PASSED WITH 207. NO WRITE.

## Immutable Capture

- capturedUtc: `2026-07-13T12:11:07Z`
- sourceRuntimeCommit: `cab9bbecaf9612208af6ab33afe446407b7b58d3`
- runtimeBuildGitShaMatchesSource:true
- runtimeStdoutByteLength:1396
- runtimeStdoutSha256: `sha256:181e81594a1f31e27c413a17d40ae1475f648f2b18d68516ad4ccfbc6fbca4d6`
- W3.5D diagnostic implementation: `f8905a754d1ac6f3cfc8903b138aa3277706419d`
- W3.5B parent-PROPFIND fix: `305ff023ad12f14b6a9b505dab4123cf44c7cfba`
- R5A binding fix: `a0695eac1b3f11d7617a4a080c54d0b82663d478`
- Desktop default-binary fix: `73d15ec5e46032512e49afb144b249ca4f211593`

The JSON bytes in the exact-runtime block below are the unchanged stdout bytes
captured from the single diagnostic process. They were not reconstructed,
paraphrased, filtered, or selectively edited.

## Proven Result

- buildProfile: `debug`
- buildDirty:false
- parentPropfindFixPresent:true
- r5aBindingFixPresent:true
- normalProbeRegistryPathSource: `app-local`
- writeGradeRegistryPathSource: `app-local`
- registrySelectionEquivalent:true
- endpointMaterialEquivalent:true
- remoteRootMaterialEquivalent:true
- credentialMaterialEquivalent:true
- writeGradeRegistryEligible:true
- credentialMaterialPresent:true
- networkRequestCount:1
- classification: `write-grade-read-only-probe-passed`

| Method | Attempt count | Status | Family |
|---|---:|---:|---|
| PROPFIND | 1 | 207 | 2xx |
| OPTIONS | 0 | not attempted | none |
| PUT | 0 | not attempted | none |
| GET | 0 | not attempted | none |
| DELETE | 0 | not attempted | none |
| other | 0 | not attempted | none |

## Safety State

- receiptUsed:false
- tokenUsed:false
- receiptConsumed:false
- consumedMarkerCreated:false
- writesWebDAV:false
- writesCloud:false
- writesRelay:false
- writesCAS:false
- writesFiles:false
- cleanupPerformed:false
- productSyncReady:false
- transportReady:false

No approval, receipt, one-shot token, kill-switch token, consumed marker, first-write
invocation, readiness transition, remote write, or cleanup was created or used.
No private endpoint, root, object target, identity, credential, authorization
material, registry content, response body, or remote listing is present.

R6 minting remains blocked until this E6 result is reviewed, accepted, and
integrated through a later separately authorized operation.

## Exact Runtime Stdout

<!-- exact-runtime-stdout-begin -->
```json
{
  "schema": "h2o.studio.transport.write-grade-read-only-probe-result.v1",
  "ok": true,
  "status": "real-transport-w3-write-grade-read-only-probe-passed",
  "reason": "real-transport-w3-write-grade-read-only-propfind-207",
  "command": "h2o_rt_write_grade_read_only_probe",
  "buildGitSha": "cab9bbecaf9612208af6ab33afe446407b7b58d3",
  "buildProfile": "debug",
  "buildDirty": false,
  "parentPropfindFixPresent": true,
  "r5aBindingFixPresent": true,
  "normalProbeRegistryPathSource": "app-local",
  "writeGradeRegistryPathSource": "app-local",
  "registrySelectionEquivalent": true,
  "endpointMaterialEquivalent": true,
  "remoteRootMaterialEquivalent": true,
  "credentialMaterialEquivalent": true,
  "writeGradeRegistryEligible": true,
  "credentialMaterialPresent": true,
  "methodStatuses": [
    {
      "operation": "PROPFIND write-grade parent readiness diagnostic",
      "statusCode": 207,
      "statusFamily": "2xx",
      "loopbackOnly": false
    }
  ],
  "networkAttempted": true,
  "writeGradeReadOnlyProbePassed": true,
  "likelyCause": "runtime-provenance-or-prior-stale-binary",
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
  "blockers": []
}
```
<!-- exact-runtime-stdout-end -->
