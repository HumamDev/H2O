# DP-PRE-M05-ASSET-BOUND — Governed Size Bound for Saved-Chat Asset Blobs

Status: **ACCEPTED — IMPLEMENTED**

Accepted value: **32 MiB = 33,554,432 bytes**, per newly ingested saved-chat
binary asset (decoded bytes).

Lane: L-SAVED-CHAT-STORAGE. Raised by the pre-M05 pre-push tightening batch
(T10) after adversarial review flagged that the custom Rust binary IPC write
surface and the JS CAS put path accepted asset bytes with no governed size
authority. Accepted by the Human Decision Authority; implemented in the same
Lane immediately after acceptance.

## Exact scope

The bound governs **one newly ingested Saved-Chat binary asset**, measured in
**decoded bytes**.

It does **not** govern:

- `snapshot.json` — that is DP-M03-C's separate logical bound
  (`0 < physical < logical ≤ 8 MiB`), deliberately a different authority with a
  different subject;
- total package size;
- total chat size;
- aggregate assets across a package.

## Canonical constants

The value is named once per language and referenced everywhere else; the
numeric literal is never scattered.

| Side | Constant | Home |
|---|---|---|
| Trusted (Rust) | `GOVERNED_ASSET_BLOB_CAP_BYTES: u64 = 33_554_432` | `apps/studio/desktop/src-tauri/src/archive_durable_write.rs` |
| Renderer (JS) | `GOVERNED_ASSET_BLOB_CAP_BYTES = 33554432`, published as `assetCas.assetBlobCapBytes` | `src-surfaces-base/studio/ingestion/asset-cas.tauri.js` |

The two sides are independent by design: the JS value is the *early* refusal,
the Rust value is the *authority*. Other JS surfaces (the data-URI ingest
boundary) read `assetCas.assetBlobCapBytes` rather than repeating the literal,
so they cannot drift from the CAS.

## Enforcement points

1. **Data-URI ingest boundary** — `saved-chat-package-assets.tauri.js`,
   `decodeDataImageUriV2(uri, maxDecodedBytes)`:
   - *pre-decode*: refuses when the base64 encoded length **proves** the result
     cannot fit, using a conservative **lower** bound
     (`floor(len * 3 / 4) - 2`). Because it is a lower bound it can only fire
     when every possible decoding exceeds the cap, so a valid payload at or
     under the cap is never falsely rejected. No decoded buffer is allocated.
   - *post-decode*: authoritative check on the **actual** decoded byte count.
   - `materializeInlineImageAssetsV2` scans **every** inline asset in the whole
     snapshot before ingesting the first one, and turns an oversize result into
     a thrown domain error — distinct from the `null` used for unsupported
     URIs, which are skipped and left inline. Checking per-asset inside the
     materialization loop would be atomic only for single-asset chats: an
     oversized second image would leave the first one's CAS object, registry
     row and turn link already durably written.
2. **CAS put** — `asset-cas.tauri.js`, `putAssetBytes`: enforced on the actual
   `Uint8Array` length **before** hashing, path derivation or any write.
3. **Trusted IPC** — `archive_durable_write.rs`. The authority lives in the two
   inner functions, which every caller must pass through:
   - `durable_write_within_root()` refuses before any traversal, staging or
     write;
   - `cas_repair_write_within_root()` refuses **before hashing**, shard
     creation, the existing-object read, or any replacement.

   The `body_len()` checks in the `#[tauri::command]` wrappers are an
   **optimization, not the enforcement**: they refuse before `body_bytes()`
   clones the body, so an oversized payload is never duplicated in memory.
   Deleting them would cost a copy, not the bound.

A caller-supplied `byteLength` is echoed metadata and is **never** the
enforcement authority at any layer.

## Failure behaviour

An oversized asset fails closed: a clear domain error (JS `throw`; Rust
`Ok(result{ ok:false, blockers:["durable-write-asset-too-large"] })` /
`["cas-repair-asset-too-large"]`). No CAS object is created, no repair is
performed, no registry row or turn link is written, and no private temp
artifact remains. The CAS reports the refusal as `oversizeRejectCount`.

The refusal is atomic for the **whole snapshot**, not just the offending asset:
one oversized image means none of that snapshot's assets are ingested, so a
retry after the user removes it starts from a clean state rather than from a
partially populated one.

That atomicity has one precondition: the pre-scan runs only when the injected
CAS publishes `assetBlobCapBytes`. A CAS object without it makes the pre-scan a
no-op, and refusal then falls back to `putAssetBytes` *inside* the loop — still
fail-closed for the oversized asset, but an earlier valid asset in the same
snapshot would already be committed. In production this is unreachable:
`getAssetStack()` in `saved-chat-package-v1.tauri.js` passes the real CAS module
through by reference, and nothing wraps or re-registers it. It is stated here
because any future injection seam must keep publishing the value.

## Compatibility rule

**Ingest ceiling, never a read ceiling.** Existing CAS objects larger than the
cap remain readable and verifiable: `getAssetBytes`, `readVerifiedAssetBytes`,
`describe` and `verifyBlobAt` never apply it, and the Rust bounded read is
driven by the expected object length rather than this cap. Historical data is
not retroactively invalidated.

No **pre-existing** committed fixture or validator input approaches the cap
(largest inline payload in the repo is 114 base64 chars), so no existing test or
package is affected. The boundary tests added *by* this change do allocate at
the cap — `vec![0u8; 33_554_432]` in the Rust tests and equivalents in the CAS
validator — which is deliberate: the accept-at-exactly-32-MiB case is only
meaningful against the real value. That is why `cargo test --lib` and
`validate-saved-chat-asset-cas.mjs` briefly hold tens of MB; it is not a leak,
and those allocations must not be trimmed away without replacing the proof.

## Rationale

32 MiB is the smallest candidate that does not foreseeably reject legitimate
inline images (retina screenshots and camera photos commonly reach 4–12 MB, and
larger as PNG), while keeping worst-case transient memory bounded.

**Decoded copies.** An asset crosses the boundary roughly three times (renderer
buffer, IPC body, Rust clone), so 32 MiB implies roughly 96 MB of decoded peak —
acceptable for a desktop app. Refusing before the Rust clone removes one of
those copies for oversized input.

**Encoded copies are larger, and are not what this bound sizes.** Before any
decode, a 32 MiB asset exists as ~44.7M base64 characters inside the snapshot
HTML string, and `materializeInlineImageAssetsV2` deep-clones the snapshot
(`JSON.parse(JSON.stringify(...))`) before touching any asset — so on a UTF-16
engine roughly 178 MB of base64 text is resident before the first byte is
decoded. That cost is a property of the snapshot-sized string, not of the
per-asset bound, and it is governed separately by DP-M03-C's logical snapshot
limit. Lowering the asset cap would not remove it. It is recorded here so the
"96 MB peak" figure is not mistaken for total process peak.

Reusing DP-M03-C's 8 MiB was rejected because it conflates two authorities the
v3 contract deliberately separates, and because it would reject ordinary
screenshots.

## Verification

Boundary tests exist on both sides — Rust (`cargo test --lib`, real allocations
at the real cap) and JS (`validate-saved-chat-asset-cas.mjs`,
`validate-saved-chat-package-assets-v2.mjs`):

- `32 MiB - 1` accepted, exactly `32 MiB` accepted, `32 MiB + 1` refused, at
  both the CAS put and both trusted entry points;
- the Rust constant is pinned to `33_554_432` by assertion, and the JS validator
  asserts the two languages still name the same value, so a one-sided edit fails
  the suite rather than silently splitting the authorities;
- oversized-claim/small-bytes accepted (a caller's `byteLength` is not the
  authority) and small-claim/oversized-bytes refused;
- a caller that bypasses the JS module is still refused on the trusted side,
  with the refusal proven to precede durable write and to leave no temp residue.
  Precisely: the tests exercise `durable_write_within_root` and
  `cas_repair_write_within_root`, the inner functions through which both
  `#[tauri::command]` wrappers unconditionally pass. There is no test that
  drives the wrappers themselves (doing so needs an `AppHandle` and an
  `ipc::Request`), so deleting a wrapper's `body_len` early-out leaves the suite
  green — consistent with it being an optimization, but it does mean a future
  refactor that rewired a wrapper past its inner function would not be caught
  here;
- this is a statement about `h2o_archive_durable_write` and
  `h2o_archive_cas_repair_write` only. The pre-existing `fs:allow-write-file`
  grant over `$APPLOCALDATA/archive/**` (Phase C `archive-cas` capability) is a
  separate surface that this bound does not govern. It is live, not merely
  granted: `saved-chat-package-v1.tauri.js` uses it via `fsWriteFile` to write
  package asset copies under `archive/packages/**`. Those bytes come from
  `readVerifiedAssetBytes` — hash-verified against the descriptor — so that path
  copies objects **already** in the CAS rather than ingesting new ones, and it
  must stay unbounded for requirement 6 (a historical over-cap object has to
  remain packageable). Narrowing or retiring the raw grant is its own decision,
  out of scope here;
- a historical oversized object stays readable;
- the whole-snapshot refusal is proven with a valid-asset-then-oversized-asset
  fixture asserting zero CAS puts, zero registry rows and zero turn links —
  a negative control confirms those counters read `1/1/1` without the pre-scan.

The data-URI mechanism is additionally tested with injected small caps, so the
mechanism can be exercised without allocating 32 MiB per case. One of them (98)
is congruent to the real cap (`33554432 % 3 == 2`) so the just-over case takes
the same code path it does at 32 MiB. The at-cap sweep runs at 98, 99 and 100 —
one cap per residue mod 3 — because the `- 2` slack in the pre-decode lower
bound is load-bearing only when the cap is congruent to 1, the case that encodes
with two padding characters. Weakening the bound to `- 1` is caught only by the
cap-100 row.
