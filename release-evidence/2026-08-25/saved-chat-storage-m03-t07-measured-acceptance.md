# M03 T07 — Measured Gzip-v3 Storage Acceptance

| Field | Value |
| --- | --- |
| Lane | 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization |
| Mission | M03 — Enable Gzip Encoding for Durable `.h2ochat` v3 Payloads |
| Task | M03 T07 — Measured acceptance (terminal Task) |
| Decision implemented | DP-M03-E — Gzip-v3 Measurement Authority Compatibility |
| Product source changed | None |
| Live v3 | OFF / legacy-only |

## DP-M03-E — decision and blocker

The first T07 execution proved two things with the **unmodified** M01 measurement
authority: it reproduced the accepted M02 identity-v3 baseline byte-for-byte, and it
could not measure a valid gzip-v3 package at all. `measurePackage` parsed
`snapshot.json` unconditionally as UTF-8 JSON without consulting
`manifest.files.snapshot.encoding`, so valid physical gzip bytes were rejected as
malformed JSON. No CLI route bypassed that parse.

Decision Authority approved DP-M03-E: a surgical, measurement-only compatibility
correction. It reopens no product architecture.

## Measurement authority

| Item | Value |
| --- | --- |
| Harness | `tools/analysis/studio/measure-saved-chat-storage.mjs` |
| Pre-change SHA-256 | `0e22114d6dccbf599162b6d502e9e7d6d32d97af48dd7d856f6013d3e4657497` |
| Post-change SHA-256 | `223b6eb067057aa5143d423500bc70596bd1e6d0a9df4a6b867930cd34370748` |

### Exact modification

One helper pair plus four call-site edits inside `measurePackage`:

- `resolveSnapshotContent(snapshotFile, manifest)` — returns physical bytes and logical
  bytes. For v1, v2 and v3-identity it returns the on-disk bytes unchanged. For
  **v3 + `encoding: "gzip"`** only, it verifies and decodes.
- `parseJsonBuffer(buffer, label)` — JSON-parses an in-memory buffer with the same error
  contract as the existing `parseJsonFile`.
- The snapshot parse now consumes `snapshotContent.logicalBytes`.
- The `snapshot.json` compression benchmark consumes the snapshot's **logical** content,
  so the metric keeps its meaning across encodings (byte-identical for identity).
- `packageContentDuplication` receives the logical snapshot length, matching the units of
  its own numerator (identical for identity).
- Four fields are emitted **only when the package is gzip-encoded**
  (`snapshotEncoding`, `snapshotPhysicalSha256`, `snapshotLogicalBytes`,
  `snapshotLogicalSha256`), so accepted identity/legacy reports stay byte-identical.

**Frozen definitions preserved.** Physical byte accounting is untouched: package,
snapshot, manifest, asset and renderer byte totals still come from actual on-disk sizes.
Decoding exists solely for metrics requiring semantic snapshot inspection. Gzip
compatibility did not convert physical accounting into logical accounting — for the gzip
package `snapshotBytes` remains **497** (the stored compressed size), not 1,143.

**Analysis-only decoder.** Node `zlib` is measurement tooling: not product source, not a
second product codec, and not an owner of `.h2ochat` semantics. The governed WebKit codec
remains the sole product gzip authority. The product codec was not imported into Node.

### Bounded decode and descriptor verification

Before any logical acceptance the harness requires: positive descriptor `byteLength`
matching the on-disk size; descriptor `sha256` matching the physical bytes; positive
`contentByteLength` at or below the 8 MiB governed v3 logical cap; **DP-M03-C**
`0 < physicalByteLength < contentByteLength <= 8 MiB`; a bounded `zlib.gunzipSync` with
`maxOutputLength` set to the declared logical length (a hard ceiling enforced by the
pinned Node runtime); decoded length equal to `contentByteLength`; and decoded SHA-256
equal to `contentSha256`. Only then are the logical bytes JSON-parsed. Existing
`sha256Buffer` / `normalizeSha` utilities are reused; no parallel hash representation was
introduced and product `contentHash` was not modified.

## Baseline regression — the anchor holds

Running the corrected harness on the accepted M02 identity-v3 fixture with the same
accepted invocation:

| Metric | Expected | Measured |
| --- | ---: | ---: |
| `stable.packageAggregate.totalBytes` | 2,245 | **2,245** ✅ |
| `snapshot.json` | 1,143 | **1,143** ✅ |
| `manifest.json` | 1,082 | **1,082** ✅ |
| Governed assets | 20 | **20** ✅ |
| Persisted renderers | 0 | **0** ✅ |

Report SHA-256 `sha256-5b89b5cf7b88617b4aef73ff7c6903b1ce7d246b6234956cb1e58d779d7cfec2`
— **byte-identical to the accepted M02 evidence**. The whole `stable` section serialises
identically before and after the change, and no gzip-only field appears on the identity
report. M02 was not rebaselined.

## Canonical gzip-v3 measurement

Corpus: the permanent logical-equivalent fixture pair — the exact identity package M02 T07
measured, and its gzip counterpart. No corpus was invented; no live archive was accessed.

```bash
node tools/analysis/studio/measure-saved-chat-storage.mjs --package tools/validation/fixtures/saved-chat-archive/v3/t06-canonical-assets.h2ochat --out <scratch>/t07-identity-after.json
node tools/analysis/studio/measure-saved-chat-storage.mjs --package tools/validation/fixtures/saved-chat-archive/v3/gzip/t06-canonical-assets.h2ochat --out <scratch>/t07-gzip.json
node tools/analysis/studio/measure-saved-chat-storage.mjs --package tools/validation/fixtures/saved-chat-archive/v3/gzip/t06-canonical-assets.h2ochat --baseline <scratch>/t07-identity-after.json --out <scratch>/t07-delta.json
```

| App-owned bytes | Identity-v3 | Gzip-v3 | Δ |
| --- | ---: | ---: | ---: |
| `snapshot.json` (physical) | 1,143 | **497** | −646 |
| `manifest.json` | 1,082 | **1,208** | +126 |
| Governed assets | 20 | 20 | 0 |
| Persisted renderers | 0 | 0 | 0 |
| **Total** | **2,245** | **1,725** | **−520** |

The delta was produced by the harness's own `--baseline` mechanism, not hand arithmetic
(`stable.baselineComparison`, `status: "compatible"`):

- `packageAggregate.totalBytes` — baseline 2,245 → current 1,725, `absoluteDelta: -520`,
  `percentageDelta: -23.162584`
- `packageAggregate.snapshotBytes` — 1,143 → 497, `absoluteDelta: -646`,
  `percentageDelta: -56.517935`
- manifest (`perFileBytes[1].bytes`) — 1,082 → 1,208, `absoluteDelta: 126`
- `snapshotLogicalBytes` — `metric-absent-from-baseline`, confirming the additive field is
  emitted for gzip only

**m03BytesSaved = 520 · m03ReductionPct = 23.162584%** — positive whole-package savings,
which also re-satisfies the T03 selection invariant: the +126 B gzip descriptor cost does
not erase the −646 B snapshot saving.

Gzip-v3 report SHA-256: `sha256-49f7be11a9d6b2de663a958b63a97fdddbc93d2e44dabfc9ec92f142208a2811`.
Baseline-delta report SHA-256: `sha256-236ea0f0005df3a01b24db6e01ba590a2f0623862b458f33f1707dde63db493e`.

## Attribution — M02 vs M03

| Contribution | From | To | Saved | Reduction |
| --- | ---: | ---: | ---: | ---: |
| **M02 — structural/representation** (duplicate scalar bodies removed, persisted renderers removed) | 5,114 | 2,245 | 2,869 | 56.101% |
| **M03 — physical encoding** (gzip `snapshot.json` where governed selection wins) | 2,245 | **1,725** | **520** | **23.162584%** |
| *M02 + M03 cumulative* (context only) | 5,114 | 1,725 | 3,389 | 66.269% |

The cumulative row is context. M03 alone contributes the 520-byte physical-encoding
reduction; it did not produce the structural reduction.

## Decode cost

Recorded under the harness's existing M01 timing semantics (`runMetadata.timings.compression`,
which sits outside `stableSha256` and therefore cannot perturb report determinism).

| Property | Value |
| --- | --- |
| Operation | gzip compress + decompress of the snapshot representation |
| Implementation | Node `zlib` (analysis-only) |
| Input | `snapshot.json` logical content, 1,143 B, for both representations |
| Output | 497 B compressed |
| Warm-up | none |
| Iterations | 1 compress + 1 decompress per codec per run; 3 runs observed |
| Timing source | `process.hrtime.bigint()` |
| Statistic | per-run value, rounded to 3 decimal places |
| Units | milliseconds |

| Run | gzip-package `decompressMs` | identity-package `decompressMs` |
| ---: | ---: | ---: |
| 1 | 0.106 | 0.205 |
| 2 | 0.036 | 0.094 |
| 3 | 0.166 | 0.062 |

Observed gzip decode range **0.036–0.166 ms**. Both packages benchmark the *same* 1,143-byte
logical content, so these are repeated measurements of the same operation and the spread is
run-to-run noise, not a difference between representations. At this sub-millisecond scale
with one iteration per run the variance exceeds any signal; no precision beyond the ranges
above is claimed. **Observational only** — the active Plan defines no performance threshold
and none was invented. AC-M03-09's `9.261×` real-data gzip reference is a benchmark
expectation, not a gate.

## Negative measurement-harness assurance

Seven mutations of temporary fixture copies, all rejected fail-closed; an unmutated control
was accepted; every temporary copy was removed.

| Negative | Result |
| --- | --- |
| physical SHA mismatch | ✅ `gzip snapshot physical sha256 does not match its descriptor` |
| physical byteLength mismatch | ✅ `physical byteLength mismatch: descriptor 496, on-disk 497` |
| logical SHA mismatch | ✅ `decoded gzip snapshot sha256 does not match contentSha256` |
| logical length mismatch | ✅ caught by the bounded-decode ceiling (`Cannot create a Buffer larger than 1142 bytes`) |
| truncated/corrupt gzip | ✅ `physical byteLength mismatch: descriptor 497, on-disk 300` |
| DP-M03-C invalid (physical ≥ logical) | ✅ `violates DP-M03-C: expected 0 < 497 < 400` |
| unsupported snapshot encoding | ✅ `unsupported v3 snapshot encoding: brotli` |

No broad validation framework was added; the repository has no pre-existing test surface
for this harness, so the assurance was kept local and minimal.

## Logical identity

Both measured packages report the same manifest `contentHash`
`sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433`, confirming the
measured pair is the same fixture pair whose encoding-independent identity T06 already
proved through the real product authority. The harness independently verified the gzip
package's physical SHA `sha256-508c62358abd7ddc250139da224a353e41af8672a13142b905008193d8ad9959`
(497 B) and decoded logical SHA `sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b`
(1,143 B), which equals the identity package's snapshot SHA. The product `contentHash`
algorithm was not duplicated in the measurement authority.

## M03 acceptance matrix

| # | Condition | Result | Evidence |
| ---: | --- | --- | --- |
| 1 | Physical/logical integrity | PASS | T03/T05/T06; re-verified by DP-M03-E descriptor checks |
| 2 | DP-M03-C bounds | PASS | `0 < 497 < 1143 <= 8 MiB`; harness enforces and rejects violations |
| 3 | Lossless round trip | PASS | T06 `byteIdenticalRoundTrip: true` |
| 4 | Encoding-independent `contentHash` | PASS | T06 `contentHashEqual: true`; both fixtures `sha256-f8d91c31…` |
| 5 | v1/v2/v3-identity compatibility | PASS | T05 332/12 green; baseline anchor byte-identical; v1 fixture measured |
| 6 | Bounded decode / corruption negatives | PASS | T05 + T06 negative + 7/7 harness negatives |
| 7 | Importer zero-mutation negatives | PASS | T04 |
| 8 | Restore zero-mutation negatives | PASS | T04 |
| 9 | Relink zero-mutation negatives | PASS | T04 |
| 10 | Export durable gzip preservation | PASS | T04/T05 |
| 11 | Human-readable companions | PASS | T04/T05 |
| 12 | `manifest.json` plaintext | PASS | measured at 1,208 B plaintext; harness parses it directly |
| 13 | Assets identity/uncompressed | PASS | 20 B in both representations, unchanged |
| 14 | One governed product gzip codec | PASS | codec SHA unchanged; harness decoder is analysis-only tooling |
| 15 | Real WebKit/Tauri runtime | PASS | T06 |
| 16 | Real DP-M03-D `lstat` ACL | PASS | T06 |
| 17 | **Positive canonical M03 storage reduction** | **PASS** | **−520 B / −23.162584%** |
| 18 | **Decode cost recorded** | **PASS** | `runMetadata.timings.compression`, 0.036–0.166 ms |
| 19 | Live v3 remains inactive | PASS | no activation performed |
| 20 | `SERIALIZATION PARTIAL` carried | PASS | untouched |

## Scope and boundaries

No product source changed; all ten product authority hashes unchanged. No capability added
or broadened, no SQLite/CAS/Sync/transport/queue/materializer change, no package v4, no
asset compression, no manifest encoding, no ZIP/J.4, no live-v3 activation,
`SERIALIZATION PARTIAL` carried forward, no later Mission begun. Raw measurement reports
were written outside the repository. T05's 332 assertions and the T06 runtime proof were
not re-run: no product source changed and no contradiction appeared.
