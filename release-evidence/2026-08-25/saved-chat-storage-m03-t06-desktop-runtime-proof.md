# M03 T06 — Desktop Runtime Proof of the Production Gzip Helper

| Field | Value |
| --- | --- |
| Lane | 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization |
| Mission | M03 — Governed gzip encoding for `.h2ochat` v3 |
| Mission Plan | M03-PLAN — Rev 1 |
| Task | M03 T06 — Desktop runtime proof of the product helper |
| Checkpoint context | CP03 reached (gzip v3 implemented and legacy-compatible) |
| Evidence type | Real WebKit/Tauri operator-driven runtime proof |
| Product source changed | None |

## Isolated runtime identity

The proof ran against the real Tauri/WKWebView runtime under a test-only application
identity, supplied as an ephemeral `--config` overlay outside the repository. The
canonical `tauri.conf.json` was not modified.

| Item | Value |
| --- | --- |
| Pinned CLI | tauri-cli 2.11.2 |
| Canonical identifier | `org.h2o.studio.desktop` |
| Isolated T06 identifier | `org.h2o.studio.desktop.m03t06` |
| Isolated app-data root | `~/Library/Application Support/org.h2o.studio.desktop.m03t06` |
| Overlay fields | `productName`, `identifier` only |
| Build command | `tauri build --debug --no-bundle --config <overlay>` (offline) |

The compiled binary embedded `org.h2o.studio.desktop.m03t06` and did **not** embed the
canonical identifier as its own value, so `$APPLOCALDATA` could only resolve to the
isolated root. The launched runtime created that root, confirming the separation.

## Current-source provenance

| Item | Value |
| --- | --- |
| Worktree | `products/cockpit-pro/worktrees/h2o-cp-saved-chat-storage` |
| Branch / HEAD | `work/saved-chat-storage` @ `93cb3be862071b975332c0502ea1bed663b7eead` |
| Codec (worktree) | `f292859e003d7db5cac4b7bc3527180a7305d81cabef85fcf49feaa4d6edbaba` |
| Codec (built `dist/`) | identical `f292859e…` |
| Runtime codec version | `1.0.0-m03-t03` |
| Load order | codec precedes Diagnostics, Inspector, Importer, Exporter, Restore, Relink |

## Evidence provenance

This runtime proof is operator-driven, following the repository's established pattern for
real WKWebView evidence (generated console harness → operator paste → structured console
output → recorded evidence).

- The harness was generated from the terminal and orchestrated **existing product
  authorities only**; it implemented no gzip codec, no SHA algorithm, no descriptor
  contract and no `contentHash` formula.
- A **human operator pasted the generated harness into the isolated Studio Web
  Inspector** console and executed it.
- The **raw structured console evidence was returned through the supervisor
  conversation**, verbatim, and is preserved below.
- **Subsequent raw Diagnostics outputs were also returned** by the operator as the
  synthetic-manifest identity issues were diagnosed and corrected.
- **Shell-side filesystem evidence independently corroborated** the key physical and
  logical hashes and lengths, computed outside the renderer, before the isolated
  app-data root was deleted.

## Structured operator evidence

Marker: `H2O_M03_T06_RUNTIME_EVIDENCE_V1`. The harness orchestrated **existing product
authorities only** — it implemented no gzip codec, no SHA algorithm, no descriptor
contract and no `contentHash` formula.

| Observation | Result |
| --- | --- |
| Product codec installed | yes (`1.0.0-m03-t03`) |
| `CompressionStream` / `DecompressionStream` | both available |
| `new CompressionStream('gzip')` / `new DecompressionStream('gzip')` | both construct |
| Logical input byteLength | `1143` |
| Logical input SHA-256 | `sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b` |
| Runtime gzip encode ×3 | `497` bytes, `sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b` |
| `byteStableObservedInThisRuntime` | `true` (observation only) |
| DP-M03-C physical bound | `0 < 497 < 1143` ✅ |
| Real Tauri write | success |
| Real `plugin:fs|lstat` | success — `isFile: true`, `isDirectory: false`, `isSymlink: false`, `size: 497` |
| DP-M03-D ACL runtime admission | **PROVEN** |
| `readVerifiedPackageMember(...)` | success; physical SHA/length matched |
| Decoded logical | `1143`, SHA matched source |
| `byteIdenticalRoundTrip` | `true` |
| Negative (wrong physical SHA) | rejected `saved-chat-member-physical-hash-mismatch`; no payload leaked |
| Stored member after negative | unchanged |
| Live materializer invoked | no |
| `v3WritesInFlight` activated | no |

### Independent filesystem corroboration

Before the isolated root was deleted, the stored members were hashed from the shell,
independently of the renderer:

| Member | Encoding | Size | SHA-256 |
| --- | --- | --- | --- |
| runtime gzip `snapshot.json` | `gzip` | 497 | `sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b` |
| decoded from that member | — | 1143 | `sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b` |
| identity `snapshot.json` | `identity` | 1143 | `sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b` |

The decoded logical bytes are byte-identical to the T05 permanent fixture's logical
bytes, confirming the returned runtime evidence from a second, independent path.

## Raw operator evidence (verbatim)

The following records are reproduced exactly as returned from the isolated Studio Web
Inspector console.

### Raw WebKit/Tauri runtime evidence

```text
H2O_M03_T06_RUNTIME_EVIDENCE_V1={"marker":"H2O_M03_T06_RUNTIME_EVIDENCE_V1","version":1,"timestamp":"2026-08-25T20:34:21.951Z","codecInstalled":true,"codecVersion":"1.0.0-m03-t03","codecDiagnose":{"installed":true,"version":"1.0.0-m03-t03","encodings":["identity","gzip"],"nativeGzip":true,"memberVerificationOnly":true,"packageContentHashVerified":false,"writerSelectionActive":false,"readerMigrationActive":false},"validateSurfaceAvailable":true,"tauriInvokeAvailable":true,"typeofCompressionStream":"function","typeofDecompressionStream":"function","compressionStreamGzipConstructs":true,"decompressionStreamGzipConstructs":true,"userAgent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)","logicalByteLength":1143,"logicalSha256":"sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b","gzipEncodes":[{"byteLength":497,"sha256":"sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b"},{"byteLength":497,"sha256":"sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b"},{"byteLength":497,"sha256":"sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b"}],"byteStableObserved":true,"selectedPhysicalByteLength":497,"selectedPhysicalSha256":"sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b","physicalLessThanLogical":true,"syntheticGzipPackagePath":"archive/packages/m03t06-mt94i7wy-gzip.h2ochat","syntheticIdentityPackagePath":"archive/packages/m03t06-mt94i7wy-idty.h2ochat","runtimeDescriptor":{"path":"snapshot.json","sha256":"sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b","byteLength":497,"encoding":"gzip","contentSha256":"sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b","contentByteLength":1143},"writeSuccess":true,"lstat":{"isFile":true,"isDirectory":false,"isSymlink":false,"size":497},"lstatAclAdmitted":true,"lstatSizeMatchesGzip":true,"governedReadSuccess":true,"verifiedEncoding":"gzip","verifiedPhysicalSha256":"sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b","verifiedPhysicalByteLength":497,"decodedLogicalByteLength":1143,"decodedLogicalSha256":"sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b","byteIdenticalRoundTrip":true,"gzipExpectedContentHash":"sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433","identityExpectedContentHash":"sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433","gzipContentHashOk":true,"identityContentHashOk":true,"contentHashEqual":true,"contentHashMatchesFixture":true,"contentHashRuntimeProof":"PROVEN_VIA_validateSavedChatPackageV1","gzipDiagStatus":"blocked","identityDiagStatus":"blocked","negativeRejected":true,"negativeErrorCode":"saved-chat-member-physical-hash-mismatch","negativeLeakedPayload":false,"negativeLeftFileUnchanged":true,"liveMaterializerInvoked":false,"v3WritesInFlightActivated":false}
```

### Raw diagnosis of the initial package-identity blockers

```text
H2O_M03_T06_DIAG_BLOCKERS_V1={"gzip":{"status":"blocked","blockers":[{"code":"chat-id-mismatch","message":"manifest.chatId does not match snapshot.chatId"},{"code":"snapshot-id-mismatch","message":"manifest.snapshotId does not match snapshot.snapshotId"}],"warnings":[]},"identity":{"status":"blocked","blockers":[{"code":"chat-id-mismatch","message":"manifest.chatId does not match snapshot.chatId"},{"code":"snapshot-id-mismatch","message":"manifest.snapshotId does not match snapshot.snapshotId"}],"warnings":[]}}
```

### Raw evidence after manifest identity correction

```text
H2O_M03_T06_DIAG_CORRECTED_V1={"gzip":{"status":"blocked","blockers":[{"code":"package-dirname-chat-id-mismatch","message":"package folder basename must match chatId"}],"contentHashOk":true,"expectedContentHash":"sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433"},"identity":{"status":"blocked","blockers":[{"code":"package-dirname-chat-id-mismatch","message":"package folder basename must match chatId"}],"contentHashOk":true,"expectedContentHash":"sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433"},"contentHashEqual":true}
```

### Raw final canonical-package Diagnostics evidence

```text
H2O_M03_T06_DIAG_CANONICAL_PATH_V1={"canonicalPackagePath":"archive/packages/t06-canonical-assets.h2ochat","gzip":{"status":"ok","blockers":[],"contentHashOk":true,"expectedContentHash":"sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433","snapshotEncoding":"gzip"},"identity":{"status":"ok","blockers":[],"contentHashOk":true,"expectedContentHash":"sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433","snapshotEncoding":"identity"},"contentHashEqual":true}
```

## Canonical-path Diagnostics proof

Validated through the sanctioned product surface
`H2O.Studio.ingestion.validateSavedChatPackageV1`, at the canonical package path
`archive/packages/t06-canonical-assets.h2ochat`, for both physical representations
of the same logical snapshot:

| Representation | Status | Blockers | `contentHashOk` | Expected `contentHash` |
| --- | --- | --- | --- | --- |
| `gzip` | `ok` | `[]` | `true` | `sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433` |
| `identity` | `ok` | `[]` | `true` | `sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433` |

`contentHashEqual: true`. Encoding-independent logical identity is proven at package
level by the product's own contentHash authority, not by a harness reimplementation.

## Interpretation — the correction chain (not product defects)

The three raw Diagnostics records above form a single chain. Read in order they show that
every blocker originated in the synthetic harness manifests, never in gzip or product
behaviour.

**1. The first runtime record already proved the entire engineering claim.** Before any
Diagnostics correction, `H2O_M03_T06_RUNTIME_EVIDENCE_V1` established:

| Claim | Field |
| --- | --- |
| Native WebKit gzip available | `typeofCompressionStream: "function"`, `compressionStreamGzipConstructs: true` |
| Actual runtime encode | `gzipEncodes` ×3 at `497` bytes |
| Actual Tauri write | `writeSuccess: true` |
| Actual DP-M03-D `lstat` | `lstatAclAdmitted: true`, `lstat.isFile: true`, `isSymlink: false`, `size: 497` |
| Governed round trip | `governedReadSuccess: true`, `verifiedEncoding: "gzip"` |
| Byte-identical logical result | `byteIdenticalRoundTrip: true` |
| contentHash equality | `contentHashEqual: true`, `contentHashMatchesFixture: true` |
| Physical-hash negative rejected | `negativeRejected: true`, `negativeErrorCode: "saved-chat-member-physical-hash-mismatch"`, `negativeLeakedPayload: false` |

**2. Its package-level Diagnostics statuses were blocked for one reason only.** That same
record carries `gzipDiagStatus: "blocked"` and `identityDiagStatus: "blocked"` — yet
`contentHashEqual` was already `true` in the very same run. The block was purely a
package-identity mismatch: the first synthetic manifests used generated `chatId` /
`snapshotId` values while the embedded logical `snapshot.json` retained the fixture's own
ids, so the manifest and snapshot disagreed.

**3. The second raw record identified those exact blockers** — `chat-id-mismatch` and
`snapshot-id-mismatch`, on both representations, with no warnings.

**4. After correcting the manifest ids, Diagnostics correctly exposed the remaining
package-directory invariant** — `package-dirname-chat-id-mismatch` ("package folder
basename must match chatId"). This is Diagnostics working as designed: the uniquified
directory names could no longer satisfy the `<chatId>.h2ochat` rule once the ids were
aligned. `contentHashOk: true` and `contentHashEqual: true` already held at this stage.

**5. The final canonical-path record proved both representations clean.** At
`archive/packages/t06-canonical-assets.h2ochat`, gzip returned `status: "ok"` with zero
blockers and identity returned `status: "ok"` with zero blockers, both with
`contentHashOk: true` and the identical encoding-independent expected `contentHash`
`sha256-f8d91c31…dc9f9433`, giving `contentHashEqual: true`.

**6. None of these corrections modified product source or changed gzip behaviour.** They
were manifest-identity and package-naming fixes in test orchestration only. The encode,
write, `lstat`, governed read, decode, verification and `contentHash` results were
identical before and after.

## Physical determinism observation

| Producer | Physical SHA-256 | Physical length | Decodes to |
| --- | --- | --- | --- |
| Node `zlib` (T05 permanent fixture) | `sha256-508c62358abd7ddc250139da224a353e41af8672a13142b905008193d8ad9959` | `497` | `1143` bytes, `sha256-275b305b…14b4fa3b` |
| WebKit `CompressionStream` (T06 runtime) | `sha256-c86c585753a4d2b86a6baca26b2079a235a91bcd564ce7ba49e22722b403294b` | `497` | `1143` bytes, `sha256-275b305b…14b4fa3b` |

Stated explicitly: **the physical producer bytes differed; the logical identity did not.**
Two independent gzip producers emitted different physical byte sequences of the same
length, and both decoded to byte-identical logical content with the same logical SHA-256.

This is a direct validation of **DP-M03-B's physical-nondeterminism tolerance**. Readers
verify stored bytes against `sha256` / `byteLength` and decoded bytes against
`contentSha256` / `contentByteLength`; because `contentHash` is derived from the logical
hash, package identity is unaffected by which producer wrote the bytes.

Within the observed runtime the three encodes were byte-identical to each other
(`byteStableObserved: true`), recorded as
`byteStableObservedInThisRuntime = true` — **observation only**. No acceptance criterion
depends on it, and neither DP-M03-B nor writer behaviour was altered by it.

## Cleanup evidence

| Step | Result |
| --- | --- |
| Isolated runtime stopped | PID 63146 terminated; no `h2o-studio-desktop` process remains |
| Isolated root removed | `rm -rf ~/Library/Application Support/org.h2o.studio.desktop.m03t06` via external shell |
| Isolated root verified gone | ✅ no `*m03t06*` path under Application Support |
| App remove/rename permission | not added — cleanup used shell authority after shutdown |

## Production state unchanged

| Metric | Recorded pre-runtime | After cleanup |
| --- | --- | --- |
| LIVE entry count | 49 | 49 |
| LIVE root mtime | 2026-08-24 16:00:56 | unchanged |
| LIVE `archive/` mtime | 2026-06-24 13:06:10 | unchanged |
| `m03t06` artifacts in LIVE archive | 0 | 0 |
| LIVE entries modified in last 3h | — | 0 |

Metadata-only verification; no saved-chat contents were inspected.

## Boundaries held

No product source changed. No capability broadened; DP-M03-D remains exactly
`fs:allow-lstat` at `$APPLOCALDATA/archive/**`. No SQLite schema, CAS, Sync, transport
or queue/materializer change. No live-v3 activation. No network requirement for the
runtime proof. `SERIALIZATION PARTIAL` remains carried forward and untouched.
