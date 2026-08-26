# DP-PRE-M05-ASSET-BOUND — Governed Size Bound for Saved-Chat Asset Blobs

Status: **DECISION REQUIRED — NO IMPLEMENTATION**

Lane: L-SAVED-CHAT-STORAGE. Raised by the pre-M05 pre-push tightening batch (T10)
after adversarial review flagged that the custom Rust binary IPC write surface
(`h2o_archive_durable_write`, `h2o_archive_cas_repair_write`) and the JS CAS put
path accept asset bytes with no governed size authority.

## Why no bound was implemented in this batch

An exhaustive sweep of the accepted authority corpus found **no existing bound
that governs asset blobs**, and the standing instruction for this Task forbids
inventing one:

| Authority checked | What it bounds | Governs asset blobs? |
|---|---|---|
| DP-M03-C (`saved-chat-package-v3.md` §DP-M03-C, read rules) | **Logical snapshot** member: `0 < physical < logical ≤ 8 MiB` | **No** — explicitly snapshot-scoped; the v3 contract records no cap for assets, manifest, or total package |
| D.3B.1 (`saved-chat-archive-request-inbox-v1.md:173`; `saved-chat-archive-request-inbox.tauri.js:34`, `DEFAULT_SIZE_CAP_BYTES = 128 * 1024`) | Request **transport JSON files** in the inbox | **No** — request metadata, never asset bytes |
| ADR-0010 (asset CAS + capability gate) | Layout, immutability, capability envelope | **No size clause at all** |
| ADR-0006 (library storage tier) | Browser storage quotas (~5–10 MB `chrome.storage`/localStorage) | **No** — extension-side storage, not the Desktop CAS |
| `capture-flow.md`, `contract.md`, `metadata-schema.md`, `validation.md` | — | Placeholder stubs; no content |
| `release-evidence/**` | — | Zero asset-bound decisions recorded |
| `decodeDataImageUriV2` (`saved-chat-package-assets.tauri.js`) | Inline data-URL decoding | **No size guard** (only non-empty check) |
| Tauri/plugin layer | `plugin:fs` and custom-command IPC | No byte limit; bodies are materialized in memory by the runtime |

Conclusion: the snapshot bound and the request-file cap are different authorities
with different subjects. Reusing either for asset blobs would be an invented
governance decision, which belongs to the Human Decision Authority.

## Current observed sizes (test data only — production data was not read)

- Committed package fixtures: asset member **20 B**; snapshot 497–1,143 B;
  manifest 1,082–1,208 B (`tools/validation/fixtures/saved-chat-archive/v3/**`).
- Validator inline fixtures: tens of bytes (`'package-image-bytes'`,
  `'second-package-image-bytes'`).

No production asset was measured for this draft. If the Decision Authority wants
an empirical distribution first, a read-only sweep of the live CAS shard sizes
would need its own authorization.

## Platform constraints relevant to the choice

- **Allocation shape today:** an asset crosses the boundary roughly three times —
  the renderer `Uint8Array`, the Tauri raw invoke body, and the Rust
  `data.clone()` in `body_bytes` — so transient peak memory is ~3× the blob.
  WebCrypto hashing in the renderer also processes the whole buffer.
- **Earliest true gate is JS**, before `invoke`: the Tauri runtime materializes
  the raw body *before* the command runs, so a Rust-side check can prevent the
  clone and downstream work but not the runtime's initial buffer. An honest
  enforcement design is therefore: JS pre-invoke check (primary) + Rust check
  before `clone` (trusted backstop).
- The CAS verified-read path (`readVerifiedAssetBytes`, `verifyBlobAt`) reads
  whole blobs back into the renderer; the bound also caps that read.
- `read_child_bounded` in the Rust repair path is already limit-driven and will
  inherit whatever bound is chosen.

## Candidate bounds

| Candidate | For | Against |
|---|---|---|
| **8 MiB** (numeric parity with DP-M03-C) | One number to remember | Conflates two authorities the v3 contract deliberately separates; likely rejects real retina screenshots/photos pasted into chats |
| **16 MiB** | Covers most screenshots | Still tight for camera photos (commonly 4–12 MB HEIC/JPEG, larger as PNG) |
| **32 MiB** | Covers realistic inline images incl. large PNG screenshots and photos; worst-case transient ≈ 96 MB, acceptable for a desktop app | Larger DoS ceiling per call than 8/16 |
| **64 MiB** | Headroom for future attachment types (PDF/video stills) | Transient ≈ 192 MB; encourages storing content the archive was not designed for |

## Recommendation (advisory only)

**32 MiB per asset blob**, as a new named constant (e.g.
`GOVERNED_ASSET_BLOB_CAP_BYTES`) distinct from `LOGICAL_SNAPSHOT_CAP_BYTES`,
enforced at: (1) `putAssetBytes` before hashing, (2) `decodeDataImageUriV2`
before base64 decode, (3) both Rust commands before the body clone, (4) the
verified-read length precheck. Rationale: it is the smallest candidate that does
not foreseeably reject legitimate inline images, keeps worst-case transient
memory bounded (~96 MB), and preserves the snapshot bound as a separate
authority exactly as DP-M03-C framed it.

## Compatibility impact

- No committed fixture or validator input approaches any candidate (largest is
  1.2 KB), so tests are unaffected at any of the four values.
- Existing live CAS blobs are unaffected: the bound governs **writes and
  verified reads**, not the continued existence of stored objects. If an
  oversized object already exists, the verified read would refuse it — the
  Decision should state whether that refusal is acceptable or whether existing
  objects are grandfathered at read time.
- Boundary tests required on acceptance: `limit-1` accepted, `limit` accepted,
  `limit+1` refused, malformed/overflowing length metadata refused, and (where
  technically feasible) proof that no unbounded allocation precedes the trusted
  check beyond the runtime's own body materialization.

## Decision requested

1. Accept a per-asset-blob byte bound (value from the table above, or another).
2. Confirm the enforcement points and the grandfathering stance for existing
   oversized objects.
3. Confirm the constant's name/home so the snapshot and asset authorities stay
   visibly separate.

Until decided, the surfaces named above remain **unbounded by explicit
governance** — unchanged from the state that predates this batch.
