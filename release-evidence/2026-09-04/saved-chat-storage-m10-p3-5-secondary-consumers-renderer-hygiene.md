# M10 P3.5 — Secondary consumers + renderer hygiene

Lane 🗃️ L-SAVED-CHAT-STORAGE · Mission M10 (Archive Integrity & Observability)
Phase P3.5 · Steps P3.5.2R (a) and P3.5.4 (b)
Date 2026-09-04 · Parent `61994567` · Branch `work/saved-chat-storage`

## What this step closes

P3.5a moved Coverage and the Archive Inspector onto trusted integrity. Renderer
hygiene could not follow: the observation needs the snapshot's LOGICAL bytes,
and the shared codec exposed no way to obtain them without also asserting the
package valid. P3.5.3 reported BLOCKED for that reason rather than duplicating a
decoder. P3.5.4 resolves the blocker by EXPOSING the bounded non-verifying
decoder the codec already owned, then completes hygiene as drift.

## a. The authorized codec change

`src-surfaces-base/studio/ingestion/saved-chat-package-codec.tauri.js`

One line. `decodeGzipBounded` — already present since M03, already bounded,
already non-verifying, previously reachable only through
`verifyPackageMemberBytes` — is now exposed on the public surface.

Option A (direct export) was taken: the surface already exposes positional
functions (`gzipEncodeBytes(logicalInput, options)`, `sha256PrefixedBytes(value)`),
so no options-object wrapper was materially required.

- the decoder body is byte-identical (verified by diff against the pre-state);
- exactly ONE `decodeGzipBounded` implementation remains;
- exactly ONE `new global.DecompressionStream` construction site remains.

### Why exposing it is safe

The decoder returns a plain `Uint8Array` and nothing else. It computes no
digest, compares no digest, and carries no `verified` / `valid` / `hashOk` /
`integrityStatus` / `packageVerified` / `logicalSha256` field, so no consumer
can mistake a successful decode for a validity signal. Its bound is
`min(contentByteLength, logicalByteCap)`, so a decompression bomb is refused
rather than buffered.

### Codec proofs — `validate-saved-chat-package-codec-bounded-decode-v1.mjs`

**9 / 9 pass.**

| | proof |
| --- | --- |
| P1 | exposed on the public codec surface |
| P2 | round-trips gzip-encoded logical bytes |
| P3 | returns raw bytes only — no validity field of any kind |
| P4 | performs no hash comparison; the decoder body contains no digest logic |
| P5 | enforces the cap → `saved-chat-member-decoded-output-exceeds-cap` |
| P6 | the effective cap is `min(contentByteLength, logicalByteCap)`, in both directions |
| P7 | malformed gzip → `saved-chat-member-decompression-failed` |
| P8 | missing `DecompressionStream` → `saved-chat-member-gzip-unavailable` |
| P9 | one decoder implementation, one gzip construction site |

## b. Renderer hygiene

New: `src-surfaces-base/studio/ingestion/saved-chat-archive-renderer-hygiene.js`

Hygiene is **drift, never a verdict**. Trusted Rust integrity remains the sole
authority on validity; hygiene reads the snapshot a second time for a cosmetic
question and can only add warnings beside the trusted classification.

### Family rule

| trusted class | hygiene |
| --- | --- |
| indeterminate (any reason) | **SKIP** — trusted integrity already refused it; a renderer read must not tell a second story |
| reserved-infrastructure | SKIP |
| verified-generation / legacy-package, ANY family incl. **V3**, identity or gzip | **OBSERVE** |

V3 is deliberately in scope, and this is the one place the hygiene rule diverges
from the pre-existing V1/V2 `rendererDetail` seam. That seam skips V3 because V3
forbids persistent renderer MEMBERS. Hygiene looks for residue inside snapshot
CONTENT, which V3 packages still carry — so a valid V3 package with `data:image`
residue is real, and is exactly the case that must surface.

### Absent is not zero

Every failure mode reports itself unavailable **with a reason**, contributing no
warning and no count:

`renderer-hygiene-codec-unavailable` · `-encoding-unsupported` ·
`-logical-length-unavailable` · `-package-unreadable` (a package that vanished
between the trusted scan and this read is a RACE, not a finding) ·
`-transport-unavailable` · `-read-failed` · `-decode-failed` · `-threw`

The gzip bound is taken from the trusted `logicalSnapshotByteLength`. Where that
trusted fact is absent the observation reports unavailable rather than guessing
a cap — the module invents no package fact of its own.

### Code rename

`renderer-data-image-residue` replaces the legacy blocker code
`data-image-residue-v2`, which asserted a v2-only scope and rode in a blocker
bucket. Hygiene is neither.

> Scope note: `data-image-residue-v2` is still emitted by the LEGACY walk, which
> serves only the M08 portable byte-source carveout (`validateSavedChatPackageBytesV1`).
> That carveout is retained until P3.6 by prior direction, so the legacy code was
> left in place rather than renamed underneath it. It is retired from the
> PRODUCTION Archive Health path, which no longer reaches the legacy walk at all.

### Asset-ref model

Drift is measured against the trusted `assetShas` projection — hygiene never
re-reads or re-derives a manifest. Trusted SHAs are bare hex while content
references are `sha256-` prefixed, so both sides are normalized; without that
every package would have read as drifting. Where `assetShas` is absent the
comparison is simply not made (`assetRefsComparable: false`) rather than
reported as zero drift.

## Wiring

| file | change |
| --- | --- |
| `saved-chat-archive-health-composition.js` | `rendererHygiene` seam + family rule + `hygieneSummary`; findings enter the same presentation bucket every other observation uses, so they can only ever be package drift |
| `saved-chat-archive-diagnostics.tauri.js` | the `{ observed: false, deferredTo: 'P3.5' }` stub is replaced by a real availability block; the legacy `counts.dataImageResidue` stays retired |
| `archive-health-ui.studio.js` | Drift card renders measured hygiene counts, `n/a` when unobserved, and states partial coverage (`hygieneUnobservedPackages`) rather than hiding it |
| `studio.html` | script tag after the codec, before the composition |
| `tools/product/studio/pack-studio.mjs` | registered in BOTH module lists |

### Cause-aware copy — no seventh state

Hygiene introduces a third drift cause beside DB and asset-cache drift, and the
only purely cosmetic one. The existing copy ("Warnings are database or
asset-cache drift") would now be actively misleading. `explanationFor(status, result)`
varies only the explanation text; state, pill and tone are unchanged and hygiene
never moves severity.

## Validation

| validator | result |
| --- | --- |
| **renderer hygiene (new)** | **33 / 33** |
| **bounded decode (new)** | **9 / 9** |
| legacy-integrity reachability | 7 / 7 |
| coverage | 23 |
| inspector trusted | 8 / 8 |
| integrity contract | 14 / 14 |
| health mapping | 15 / 15 |
| trusted composition | 15 / 15 |
| health trusted switch | 15 / 15 |
| archive diagnostics | 70 / 70 |

Two validators asserted the now-removed `deferredTo: 'P3.5'` marker and were
updated to assert the delivered behaviour instead — that an observation which
reached no package still publishes no count.

> Carried, pre-existing: `validate-saved-chat-archive-export-share-v1.mjs` fails
> **15** checks. Verified as a BASELINE failure by temporarily restoring every
> changed file to `61994567` and re-running: 15 failing checks before, 15 after,
> unchanged. Not a regression from this step, and not fixed here.

## Real disposable Desktop acceptance

Disposable identifier **`org.h2o.studio.desktop.m10p354`**, isolated by an
external Tauri `--config` overlay held outside the repository. Built with the
canonical chain (`npm run dev:rebuild` → `H2O_EXT_DEV_VARIANT=production
build-chrome-live-extension.mjs` → `prepare-dist.mjs`).

**Bundle freshness proved before running**: `dist/…/saved-chat-archive-renderer-hygiene.js`
SHA-256 `ecb48b00f66a95f0…` matches the source byte for byte — the stale-bundle
failure mode that invalidated the first P3.4 attempt.

Fixtures were built by reproducing the v3 identity algorithm
(`{"assets":[…],"payloadVersion":3,"snapshot":"…"}` → SHA-256), first verified
against the known `t06-canonical-assets` fixture.

### Case 1 — valid V3 **gzip** package carrying residue

`m10p354-case1-residue.gcd63865d….h2ochat`, `nameClassification: "generation"`,
`contentHashOk: true`, `blockers: []`, **`status: "warning"`**.

Its warning list carries:

> `package snapshot content still contains inline data:image renderer residue`

The snapshot is stored gzip (565 physical / 1224 logical bytes). Compressed
bytes read as UTF-8 cannot contain the literal `data:image/`, so finding the
residue proves the new bounded decoder actually ran on the real Desktop path.

### Case 2 — indeterminate package, hygiene SKIPPED

`m10p354-case2-indeterminate.h2ochat`, blocked by the trusted verifier with
`generation-manifest-json-invalid`.

Its snapshot deliberately contains `data:image/png;base64,` as a **falsifier**:
had hygiene read it, `dataImageResidue` would be 2. It reports **1**.

### Runtime shape

```json
"rendererHygiene": {
  "observed": true, "attempted": true,
  "packagesObserved": 1, "packagesUnavailable": 0, "packagesSkipped": 1,
  "dataImageResidue": 1, "assetRefDrift": 0
}
```

`counts` carries no `brokenPackageAssets`, no `assetRefMismatches`, no
`dataImageResidue`, and the result carries no `deferredTo`. `assetRefDrift: 0`
confirms the trusted-SHA normalization: Case 1's snapshot assetRef matched the
trusted `assetShas` entry despite differing representations.

Aggregate **Mixed** (`status: "partial"`) — Case 2's trusted blocker plus Case 1's
drift. Hygiene contributed drift and never a blocker. The cause-aware copy
rendered live:

> Some packages have integrity problems; others are healthy and portable, though
> some carry cosmetic renderer residue.

### Production safety

The production archive was byte-identical before and after:

| | value |
| --- | --- |
| files | `19` |
| inode | `246337901` |
| mtime / ctime | `1782299170` / `1782299170` |
| digest | `ba8c0100909fc1b97917fe06ec0328237d2e80af34455f2769a5bfe7296ddcfb` |

All fixtures and runtime activity stayed under the disposable
identifier-scoped root. Another Lane's Studio process (PID 64655) ran throughout
and was never terminated, clicked or manipulated; the disposable app carried a
distinct product name and bundle id, so every action was bundle-scoped to it.

The full build chain produced **zero tracked change** — `dist/` and
`apps/extensions/chatgpt/chrome/prod/` are gitignored.

## Not done here

No Rust change. No P3.6 (legacy verifier retirement, M08 carveout). No P4. The
legacy verifier code, the M08 byte-source carveout and its `data-image-residue-v2`
code are all untouched. No repair, delete, quarantine or restore authority was
added, and no persistent observability state was created.
