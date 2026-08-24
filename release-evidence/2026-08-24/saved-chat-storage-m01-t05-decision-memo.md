# M01 T05 — Saved-Chat Storage Architecture Decision Memo

| Field | Value |
| --- | --- |
| Lane | 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization |
| Mission | M01 — Measured saved-chat storage baseline and decision basis |
| Mission Plan | M01-PLAN — Rev 1 |
| Decision artifact | M01 T05 — Saved-Chat Storage Architecture Decision Memo |
| Decision status | COMPLETE — CORRECTED |

## Evidence basis

This decision consolidates T01, T02, T03, T04, T06, and the T05-R1 package-contract verification. T05-R1 supersedes conflicting statements from the original T05 memo.

The privacy-filtered T04 evidence is identified by:

| Artifact | SHA-256 |
| --- | --- |
| `real-storage-baseline.json` | `sha256-3092d32c0b3c1b76de664ac538fc4b22b8a265091204f1ebb9f49e340e6a56c8` |
| `real-storage-baseline.md` | `sha256-9bd793bef64b59f76e56e3bd403bd2a8b48332420bb9b7fd4a6ed9b12c995d22` |
| `manifest-compression.json` | `sha256-d656323664c9f7db4fa232c5821fe742c96ccae4cf3e951299fb84f214e46d6c` |

T04 used temporary, authorized copies of Desktop storage. The raw input copies were removed only after measurement, privacy verification, stable-result verification, input-integrity verification, and report hashing passed. No canonical storage was modified.

## Direct architecture verdict

- Current measured package redundancy is the near-term optimization target.
- Snapshot structural duplication is architecturally real, but its present real-data prevalence is low.
- M02 package-v3 work executes before M03 compression activation.
- `.h2ochat` is a durable, independently verifiable recovery projection.
- M04 structural-sharing implementation is Deferred and threshold-monitored.
- Destructive physical reclamation remains behind G02.
- `J.4` depends only on the focused ZIP method-8 capability probe described below.

The evidence, target, and priority are distinct:

| Concern | Present measured prevalence | Long-term architectural target | Implementation priority |
| --- | --- | --- | --- |
| Package body duplication | `content[]` equivalents consume 46.879% of real `snapshot.json` bytes | One canonical multipart representation | M02, first |
| Package compression | Real `snapshot.json` gzip ratio is approximately 9.261× | Encoding-capable, codec-extensible members | Contract in M02; gzip activation in M03 |
| Snapshot history duplication | 0.380% of current real turn-body bytes; nearly all active histories have one snapshot | Immutable content-addressed turn bodies referenced by snapshots | M04 Deferred |
| Package recovery role | Current packages are projections with independently checked members | Durable recovery projection, separate from the live database | Preserve and refine through M02/M05 |

## Verified current package contract

Current v1/v2 semantics are:

1. `manifest.files.<member>.sha256` is SHA-256 of the exact bytes physically stored for that package member.
2. `files.<member>.byteLength` equals stored byte length because package text is stored directly as UTF-8 plaintext.
3. `snapshot.json` is literal plaintext JSON at the literal member name expected by the importer, inspector, and diagnostics.
4. The current manifest/package contract has no encoding negotiation, compression field, or alternate member-name mechanism for a compressed snapshot payload.
5. Current `contentHash` depends on the stored-byte snapshot hash: directly in v1 and through the current canonical aggregate construction in v2.

Therefore, compression cannot be introduced into a v1/v2 member without a versioned package-contract change.

### Verified T05-R1 source citations

- `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:140-172` — `bytesFor`, `byteLength`, `sha256Hex`, and `sha256Prefixed` establish byte encoding and hashing.
- `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:402-450` — `buildManifestJsonV1` carries the file descriptors and current `contentHash` into the v1/v2 manifest without encoding metadata.
- `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:538-543` — `fileDescriptor` contains only `path`, stored-byte `sha256`, and stored `byteLength`.
- `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:648-696` — `buildSavedChatPackageV1` hashes plaintext members and defines v1/v2 `contentHash` construction.
- `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:716-742` — built members retain literal plaintext text, byte length, and stored-byte hashes.
- `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:950-966` — package materialization writes literal `manifest.json`, `snapshot.json`, `chat.md`, and `chat.html` bytes.
- `src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js:161-179` — `readPackageTextFile` and `readPackageSnapshotJson` read the literal bounded `snapshot.json` member as UTF-8 JSON.
- `src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js:956-1052` — `validateSavedChatPackageV1` requires literal members, parses plaintext JSON, hashes stored `snapshot.json` bytes, and verifies current v1/v2 `contentHash`.
- `src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js:37` and `973-981` — current required-file inventory is `manifest.json`, `snapshot.json`, `chat.md`, and `chat.html`.

## DP01 — Compression

**Decision:** gzip/DEFLATE is the preferred first codec for app-owned cold archive payloads.

Evidence:

- Real `snapshot.json` gzip ratio: approximately 9.261×.
- Real `outer_html` gzip ratio: approximately 7.153×.
- Actual Desktop WebKit supports `CompressionStream`, `DecompressionStream`, `gzip`, `deflate`, and `deflate-raw`, with byte-identical synthetic round trips.
- gzip requires no new runtime dependency.
- The residual byte benefit observed from zstd/brotli does not currently justify an additional dependency.

Compression of `.h2ochat` members is a **versioned package-contract feature**. It cannot precede M02. M02 defines an encoding-capable v3 contract with encoding inactive/identity. M03 later activates gzip inside that already-versioned contract.

Boundaries preserved by this decision:

- Folder exports remain plaintext and human-readable.
- The manifest remains plaintext.
- Live SQLite body compression remains Deferred.
- Sync compression remains cross-Lane work.
- Future immutable-object representation remains codec-extensible.

## V3 file-descriptor semantics

The minimal corrected descriptor model is:

| Field | V3 meaning |
| --- | --- |
| `path` | Package member path. |
| `sha256` | Hash of physical stored bytes; preserves the current field meaning. |
| `byteLength` | Physical stored byte length. For v1/v2 plaintext members this remains numerically identical to current values. |
| `encoding` | V3 encoding declaration, initially `identity` or `gzip`. |
| `contentSha256` | Hash of decoded logical bytes. Required when `encoding != identity`; may be absent for identity. |
| `contentByteLength` | Length of decoded logical bytes. Required when `encoding != identity`; may be absent for identity. |

Normalization is explicit:

```text
logicalSha256 = contentSha256 ?? sha256
logicalByteLength = contentByteLength ?? byteLength
```

V3 package logical identity/contentHash must use `logicalSha256`, not the encoded stored-byte hash. The exact canonical v3 `contentHash` construction is **not** designed in M01; M02 must define and validate it explicitly.

M01 decides only this invariant:

> Changing encoding without changing decoded logical content must not change v3 logical package identity.

### Encoded-member verification order

For an encoded v3 member:

1. Read bounded stored member bytes.
2. Hash stored bytes and compare with `sha256`.
3. Validate the declared logical/decompressed size against the applicable safety cap using `contentByteLength`.
4. Decode according to `encoding`.
5. Verify actual decoded byte length.
6. Hash decoded bytes and compare with `contentSha256`.
7. Use `logicalSha256` in v3 logical-identity/contentHash verification.

For identity encoding there is no decode step:

```text
logicalSha256 = sha256
logicalByteLength = byteLength
```

This model must not weaken the importer's decompression-bomb protection.

## DP02 — Snapshot representation

**Architectural target:** content-addressed immutable turn bodies, with snapshots eventually referencing immutable body identities.

**Near-term status:** Deferred.

Real evidence shows only 0.380% cross-snapshot duplicate-turn bytes, and almost all active histories have one snapshot. Synthetic W04/W11 proves the existing full-copy model scales badly when snapshot histories grow, so the architectural target remains valid even though implementation is not presently justified.

M04 remains Deferred. Its current re-entry signals are:

- duplicate-turn bytes at least 15% of total turn-body bytes; **or**
- mean snapshots per active history at least 3.0.

These are **PROVISIONAL RE-ENTRY TRIGGERS**, not evidence-derived breakeven points. The Lane Owner may revise them from later observed growth without changing DP02's long-term architecture target.

## DP03 — HTML/text representation

**Decision status:** PARTIALLY DECIDED.

Safe now:

- Retain current `outer_html` and text semantics.
- Use non-destructive storage encoding rather than destructive representation simplification.

Deferred:

- raw-to-sanitized HTML replacement;
- dropping stored text as derivable from HTML.

The narrow future proof is a read-only real-DB-copy experiment that calculates:

- sanitized HTML byte size versus raw `outer_html`;
- exact equality rate between stored text and text extracted through the governed sanitization/extraction path.

No new Mission is required now. Attach this experiment to M04 re-entry unless another future Mission genuinely needs it earlier.

## DP04 — V3 package payload

Current v1/v2 messages duplicate scalar `contentText`, scalar `contentHtml`, and equivalent typed entries in `content[]`. Real duplicate-body overhead is 46.879% of `snapshot.json`.

**Corrected v3 direction:** `content[]` becomes the single canonical multipart content representation. V3 drops `contentText` and `contentHtml`. Consumers migrate in M02 to canonical typed parts; v1/v2 readers retain scalar fallback. HTML import fidelity must be preserved.

M02 consumer migration covers:

- package importer;
- package asset helper;
- archive diagnostics;
- Markdown renderer;
- HTML renderer;
- package projection/writer normalization;
- archive request boundary guards and any other scalar/array consumers confirmed by the M02 source audit.

Verified current consumer locations:

- `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:228-259` — `normalizeSavedChatMessageV1` emits scalar and typed-part duplicates.
- `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:458-520` — `renderChatMarkdownV1` and `renderChatHtmlV1` consume scalar bodies.
- `src-surfaces-base/studio/ingestion/saved-chat-package-assets.tauri.js:152-265` — `materializeInlineImageAssetsV2` reads and rewrites both scalar HTML and typed HTML parts.
- `src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js:182-207` — `buildTurnsFromPackageSnapshot` consumes scalar text while preserving content parts in metadata.
- `src-surfaces-base/studio/ingestion/saved-chat-archive-diagnostics.tauri.js:623-635` — `snapshotHtmlTexts` checks scalar and typed HTML.
- `src-surfaces-base/studio/ingestion/saved-chat-archive-request-builder.mv3.js:18-45` and `saved-chat-archive-request-delivery.mv3.js:61-70` — archive-request guards enumerate both representations as forbidden authoritative payload.

### Version-aware required files

V1/v2 continue to govern:

- `manifest.json`
- `snapshot.json`
- `chat.md`
- `chat.html`

For the v3 app-owned archive, required members are:

- `manifest.json`
- `snapshot.json`

Renderers are no longer required in app-owned archive storage. Explicit export materialization regenerates `chat.md` and `chat.html` for human-readable portability.

### V1/v2/v3 coexistence

The current materializer effectively uses one package path per chat: `<chatId>.h2ochat`. Existing v1/v2 packages and identities must not be silently rewritten or changed, while v3 rollout must be additive and safe.

> **M02 DESIGN REQUIREMENT — define safe v1/v2/v3 package coexistence and materialization-path semantics before enabling v3 writes for existing archived chats.**

This memo does not choose version suffixes, contentHash paths, side-by-side directories, replacement rules, or migration rules. That unresolved design work is intentionally scoped to M02 and does not block M01 closure.

Current one-path/overwrite behavior is visible in `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js:523-530` (`safePackageDirName`) and `948-966` (`writeSavedChatPackageV1`).

## DP05 — `.h2ochat` role

`.h2ochat` is a **DURABLE, independently verifiable recovery projection**. It is not the canonical live database, not an editable secondary authority, and not merely a disposable cache.

The app-owned durable package target is:

- `manifest.json`: plaintext durable integrity contract;
- `snapshot.json`: durable recovery payload, v3 encoding-capable, with identity over the logical decoded representation;
- governed assets when applicable: durable package recovery dependencies.

`chat.md` and `chat.html` are not persistently required in the v3 app-owned archive. They are regenerated for explicit export.

M05 later owns coverage policy, freshness, archive index, refresh/materialization lifecycle, stale-package detection, and long-term retention policy subject to G02.

## Corrected target architecture

The following is a decided target, not a claim of completed implementation:

```text
                         canonical mutable authority
                    +--------------------------------+
                    |       Desktop SQLite           |
                    +---------------+----------------+
                                    |
                           M02 v3 projection
                                    v
      canonical immutable    +------+---------------------------+
      asset body authority   | durable .h2ochat recovery         |
   +----------------------+  | projection                        |
   | existing asset CAS   +->| - plaintext manifest              |
   +----------------------+  | - identity/gzip snapshot member   |
                             | - governed package assets          |
                             +------+-----------------------------+
                                    |
                         explicit export materialization
                                    v
                           chat.md + chat.html

Future/Deferred: immutable turn-body CAS and snapshot body references
Future cross-Lane: Sync/transport references, remote layout, E2E envelope
```

### Authority and status

| Surface | Authority/role | Status |
| --- | --- | --- |
| Desktop SQLite | Canonical mutable saved-chat state | Decided/current |
| Existing asset CAS | Canonical immutable asset-body storage | Decided/current |
| `.h2ochat` | Durable independently verifiable recovery projection | Decided; v3 changes not implemented |
| V3 `content[]` | Canonical package message-content representation | Decided for M02; not implemented |
| V3 descriptors | Stored-byte integrity plus logical decoded identity | Decided for M02; not implemented |
| Export renderers | Materialized on demand for explicit export | Decided target; not implemented |
| Live SQLite compression | No current change | Deferred |
| Immutable turn-body CAS | Long-term snapshot target | Deferred/M04 |
| HTML/text simplification | Requires the narrow real-data proof | Deferred |
| Physical reclamation | Destructive action | Deferred behind G02 |
| Archive coverage/freshness | Lifecycle policy | Deferred to M05 |
| Transport objects/remote layout | Movement and remote representation | Future cross-Lane |
| Encryption/E2E envelope | Remote privacy and identity | Future cross-Lane |
| Sync body-reference changes | Sync projection policy | Future cross-Lane |

## I-CAS-01 — Asset refcount/join drift after cleanup

**Classification:** genuine non-destructive integrity Issue.

The cleanup path can delete `snapshot_turn_assets` rows without recomputing `assets.refcount`. `tools/cleanup/cleanup-saved-chat-smoke-rows.mjs:389-420` performs the join deletion in `deleteCandidates`; `src-surfaces-base/studio/store/assets.tauri.js:267-278` defines authoritative `recountRefs`, and `305-325` shows normal unlink behavior recomputing the count.

Future non-destructive fix candidate: recompute affected `assets.refcount` values after join deletion.

This Issue is not GC authorization, safe-to-delete evidence, or a blocker for M02/M03. No repair was performed in M01.

For future G02, join-only reachability is insufficient. Destructive GC reachability must consider at minimum:

- snapshot joins;
- package manifest references;
- export references where relevant;
- quarantine;
- remote/peer references when applicable.

## Sync cross-Lane evidence handoff

T04 measured:

- 420 Sync-root files;
- 8,609,161 total bytes;
- seven recognized `h2o.studio.fullBundle.v2` projections;
- 5,002,446 recognized bundle bytes;
- 2,232,385 full-body-carrier bytes;
- full-body carriers equal 44.626% of recognized bundle bytes.

Storage-Lane implication: future object architecture should permit stable content references where Sync currently repeats full bodies.

Sync Metadata owns whether and when `fullBundle` changes, projection retention policy, and envelope semantics. This finding is not a current blocker for L-SAVED-CHAT-STORAGE, and this memo does not redesign Sync.

## Corrected roadmap delta

### M02 — FIRST

**Status:** Planned / next after M01 closure.

M02 delivers a non-duplicating, encoding-capable package payload v3. Its scope includes:

- canonical `content[]`;
- scalar removal;
- consumer migration;
- version-aware `REQUIRED_FILES`;
- encoding-capable v3 file descriptors;
- v3 logical identity/contentHash contract;
- safe v1/v2/v3 coexistence and materialization-path design.

**MS01 — First measured storage reduction shipped** now attaches to M02 acceptance.

### M03 — SECOND

M03 enables gzip inside the v3 contract already defined by M02. If M02 designs that contract correctly, activating gzip does not require another package-format version.

### Later Missions

- M05: durable archive preservation, freshness, and coverage.
- M08: J.4 ZIP round trip after the ZIP capability probe.
- M04: Deferred / threshold-monitored.
- M06: Proposed; G02 preserved.
- M07: Proposed future cross-Lane handoff.

Mission IDs are not renumbered.

## J.4

`J.4 STATUS: DEPENDS ON ZIP CAPABILITY PROBE`

The existing dependency-free ZIP writer currently emits stored-mode method 0. The remaining focused probe must prove that the existing ZIP-writer pattern can emit valid method-8 entries using raw DEFLATE from `CompressionStream('deflate-raw')` while correctly preserving:

- CRC-32 over uncompressed bytes;
- compressed size;
- uncompressed size;
- compression method 8 in both local header and central directory;
- correct central-directory offsets/order;
- deterministic entry order;
- successful byte-identical extraction through macOS Archive Utility;
- successful byte-identical extraction through `unzip`;
- safe accommodation of asynchronous compression in the currently synchronous assembly flow.

ZIP archive-byte determinism is not required. Per-member logical/plaintext integrity remains authoritative. The probe is not executed by this memo.

## M01 status and closure

`M01 T05: COMPLETE — CORRECTED`

`M01: READY FOR CLOSURE WORK`

`M01 is NOT yet Complete.`

Outstanding after this artifact:

1. Update M02 scope/acceptance from corrected DP04/DP01 decisions.
2. Update M03 scope/acceptance from corrected encoding sequencing.
3. Perform proportionate final M01 diff/assurance.
4. Create the coherent M01 commit containing the measurement harness, workload generator/README, durable decision memo, and any explicit closure-plan updates admitted next.

Commit is not Checkpoint. CP01 remains the current Checkpoint. No additional Checkpoint is created by this artifact.
