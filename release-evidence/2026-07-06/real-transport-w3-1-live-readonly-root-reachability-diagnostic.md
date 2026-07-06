# Real Transport W3.1.7-R2 Root Reachability Diagnostic

Verdict: DIAGNOSIS COMPLETE, REMOTE-ROOT READINESS STILL NOT PROVEN.

This diagnostic follows the W3.1.7 live read-only probe closeout and adds
redacted method status-family detail. It does not mark W3.1.7 as a full
remote-root readiness pass.

## Anchors

- W3.1.7 live read-only WebDAV probe evidence: `39206f4f505c198218570ded66a7da05270fa58c`
- W3.1.5P prepared-registry evidence: `81b5338c6319f5744ed25c9453635ec5fb91864e`
- W3 WebDAV setup UX aligned with native extension: `2ec8a465a4393c31d75536d9cea974d76ff528cf`
- W3 WebDAV setup UI foundation: `523a1978258ad4e5e844984de986a6677440bcc7`
- W3.1 read-only network probe path: `6a5e8bbe5f68148c8eb28456d9922ec8f666a10e`
- W3.1 Rust-only resolver substrate: `979e8a5ba3584d50ab18ae848645e1163d008eae`

## Prepared Registry Hashes

- pathSource: default-private
- descriptorRegistryRefHash: `sha256:587b8681ee910bf3828413e17f949fa52b53a191db72ee4e05c87c0138525167`
- endpointRefHash: `sha256:42bc195455b03a0171597f8b0758c4a450390c829e9c1f653a069db135784100`
- remoteRootRefHash: `sha256:10dea62063f3d07519c48924f6e1d295464839010618361368b47519695a8fca`
- credentialRefHash: `sha256:328562af62cffd7ebedbec742d727e386db3b173e1715750b4a26166f8d385b8`

## Redacted Diagnostic Result

- command-level status: `real-transport-readonly-capability-probe-ready`
- command-level pass: true
- full remote-root readiness pass: false
- blockers: none
- networkAttempted:true
- remoteRootReachable:false
- rootExists:false
- rootEmpty:false
- child404Ok:false
- diagnostic listingHash: `sha256:198b8126e435419fdbbe7f0622404f6c42da0acd0c71ddb81ee1fa555df380b8`
- writesWebDAV:false
- productSyncReady:false
- transportReady:false

Read-only method status families, names only:

- OPTIONS statusFamily: `4xx`
- PROPFIND Depth 0 statusFamily: `4xx`
- HEAD root statusFamily: `4xx`
- HEAD deterministic nonexistent child statusFamily: `4xx`

The diagnostic status details are intentionally limited to method names and
status families. No raw status line, endpoint URL, username, credential,
authorization header, remote path, response body, directory listing, or private
registry content is recorded.

## Diagnosis

The most likely cause is that the configured Folder / remote root is not
accepted as a reachable WebDAV root for the prepared endpoint and credential.
Because every attempted read-only method returned a `4xx` family, the remaining
plausible causes are:

- folder does not exist or is not visible to the credential
- folder normalization mismatch between Desktop setup and provider semantics
- endpoint root mismatch between the configured endpoint and Folder value
- credential authorization accepted enough to respond but not authorized for the configured root
- provider-specific WebDAV behavior for HEAD or PROPFIND at the configured root

The previous W3.1.7 result is therefore a command-level pass only. It is not a
full remote-root readiness pass.

## Native Extension Alignment

Desktop Folder / remote root must align with the native extension Folder mental
model. If the working native extension uses Folder `H2O`, the operator should
update Desktop Folder / remote root to the same conceptual folder through the
Desktop WebDAV setup UI, then Save/Prepare again. That update must remain a
private UI-driven registry update and must not paste or commit raw endpoint,
credential, or listing data.

## Boundaries Held

- no WebDAV/cloud/relay/CAS/file write occurred
- no forbidden WebDAV method was used
- PUT performed: false
- DELETE performed: false
- MKCOL performed: false
- PROPPATCH performed: false
- MOVE performed: false
- COPY performed: false
- LOCK performed: false
- UNLOCK performed: false
- POST performed: false
- request body mutation sent: false
- relay enqueue performed: false
- outbox/ledger/store mutation performed: false
- fullBundleV3Started:false
- mintsExportId:false
- burnsSequence:false
- `h2o_rt_first_write` absent: true
- write command absent: true
- productSyncReady:false
- transportReady:false

## Next Step

Operator should update Desktop Folder / remote root to the native extension
Folder value and Save/Prepare again. After the prepared registry hash changes,
rerun W3.1.7 as a separate explicit live read-only probe phase.
