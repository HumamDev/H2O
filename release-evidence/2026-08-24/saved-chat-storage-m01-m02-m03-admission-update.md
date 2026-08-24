# M01 Closure — Corrected M02/M03 Admission Update

| Field | Value |
| --- | --- |
| Lane | 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization |
| Product / System | H2O / Cockpit Pro |
| Current Mission | M01 — Measured saved-chat storage baseline and decision basis |
| Mission Plan | M01-PLAN — Rev 1 |
| Authority | `saved-chat-storage-m01-t05-decision-memo.md` |
| Authority SHA-256 | `sha256-fb544ff4687ee9199507166bec787e1748023eea7cf6a5e5029dca7e2f3318f3` |
| Artifact purpose | Post-M01 Lane Roadmap admission state for M02 and M03 |

This is a compact planning-continuity artifact derived from the corrected T05 decision. It is not a new architecture decision, implementation plan, Mission, Checkpoint, or Lane Roadmap replacement. Rolling-Wave detail is intentionally greater for M02 than for its M02-dependent successor, M03.

## Admission summary

Corrected immediate order: **M02 FIRST; M03 SECOND.**

| Order | Mission | Status | Dependency |
| --- | --- | --- | --- |
| First after M01 | **M02 — Establish Non-Redundant, Encoding-Capable `.h2ochat` v3** | `Planned` | `M02 DEPENDS ON M01 Complete` |
| Second | **M03 — Enable Gzip Encoding for Durable `.h2ochat` v3 Payloads** | `Planned` | `M03 DEPENDS ON M02 accepted` |

M02 is not `Ready` because M01 closure remains a prerequisite. M03 does not become `Ready` merely because M01 closes; it requires accepted M02 contract and implementation evidence.

`MS01 — First measured saved-chat storage reduction shipped` attaches to successful M02 acceptance. MS01 is not reached by this admission artifact.

## M02 — Establish Non-Redundant, Encoding-Capable `.h2ochat` v3

**Status:** `Planned`

**Dependency:** `M02 DEPENDS ON M01 Complete`

### Bounded outcome

Establish `.h2ochat` v3 as an additive, backward-compatible, non-redundant, encoding-capable durable recovery package contract while keeping actual stored v3 payload encoding as `identity`.

M02 owns the package-contract work required before M03 can safely encode stored members. M02 must not activate gzip.

### Admitted scope

#### A. Canonical message content

For v3 messages, `content[]` is the single canonical multipart content representation. V3 removes duplicated `contentText` and `contentHtml` scalar bodies. Readers preserve v1/v2 scalar fallback.

The coordinated consumer migration must preserve:

- text fidelity;
- sanitized HTML fidelity;
- typed multipart extensibility;
- asset rewriting and scanning;
- archive diagnostics;
- Markdown rendering;
- HTML rendering;
- import-as-new behavior;
- restore/relink compatibility wherever package content is consumed.

This is a coordinated consumer migration, not a writer-only edit.

#### B. Version-aware required files

V1/v2 retain the existing required-file contract:

- `manifest.json`
- `snapshot.json`
- `chat.md`
- `chat.html`

The v3 app-owned durable archive requires:

- `manifest.json`
- `snapshot.json`

`chat.md` and `chat.html` are not persistently required in the app-owned v3 archive. Explicit export regenerates both human-readable renderers deterministically.

#### C. Encoding-capable v3 file descriptors

M02 defines the v3 descriptor contract with:

- `path`
- `sha256`
- `byteLength`
- `encoding`
- conditional `contentSha256`
- conditional `contentByteLength`

Semantics:

| Field | Meaning |
| --- | --- |
| `sha256` | Hash of physical stored bytes; existing field meaning is preserved. |
| `byteLength` | Physical stored byte length. |
| `encoding` | Stored-representation encoding; initially admitted values are `identity` and `gzip`. |
| `contentSha256` | Hash of decoded logical bytes; required later when `encoding != identity`. |
| `contentByteLength` | Decoded logical byte length; required later when `encoding != identity`. |

M02 writes `encoding = identity`. It does not gzip stored package members.

Normalization is fixed:

```text
logicalSha256 = contentSha256 ?? sha256
logicalByteLength = contentByteLength ?? byteLength
```

#### D. V3 logical identity/contentHash

M02 must explicitly define and validator-prove the exact canonical v3 `contentHash` construction.

The invariant decided by M01 is:

> Changing only the physical encoding of a member while preserving identical decoded logical content must not change v3 logical package identity.

V3 logical identity therefore derives from logical content identity rather than merely the physical encoded-byte hash. M02 must not redefine any v1/v2 `contentHash` rule.

#### E. V1/v2/v3 coexistence

M02 must resolve:

> **M02 DESIGN REQUIREMENT — define safe v1/v2/v3 package coexistence and materialization-path semantics before enabling v3 writes for existing archived chats.**

The current architecture effectively uses `<chatId>.h2ochat`. M02 must define additive, unambiguous behavior that does not:

- silently overwrite an existing v1/v2 package;
- silently change an existing package identity;
- destroy the only older recovery artifact;
- create ambiguous package authority.

M01 intentionally did not choose the path/versioning mechanism. M02 owns that choice.

#### F. Durable recovery role

M02 preserves DP05: `.h2ochat` is a durable, independently verifiable recovery projection. It is not the live canonical database, not editable secondary authority, and not merely a disposable cache.

### Acceptance criteria

**AC-M02-01 — Deterministic contract.** A deterministic, self-describing v3 package contract exists.

**AC-M02-02 — Canonical content.** V3 messages contain canonical typed `content[]` without duplicate `contentText` or `contentHtml` scalar bodies. For governed v3 fixture/package measurements:

```text
duplicate scalar-body bytes = 0
```

This directly eliminates the real M01 v1 baseline where duplicate bodies occupied 46.879% of `snapshot.json`.

**AC-M02-03 — Consumer fidelity.** Every migrated consumer preserves governed text, HTML, and asset semantics through v3 `content[]`; v1/v2 scalar fallback remains functional.

**AC-M02-04 — Frozen legacy semantics.** V1/v2 packages continue to inspect, validate, import, and restore/relink where applicable without reinterpretation of existing hashes or file descriptors.

**AC-M02-05 — Version-aware files.** Required-file validation preserves v1/v2 rules, while v3 app-owned archives do not require persistent `chat.md` or `chat.html`. For app-owned v3 package measurements:

```text
persisted app-owned renderer bytes = 0
```

Explicit export still materializes human-readable renderers.

**AC-M02-06 — Physical and logical descriptor semantics.** V3 preserves:

```text
sha256 = stored-byte hash
byteLength = stored-byte length
logicalSha256 = contentSha256 ?? sha256
logicalByteLength = contentByteLength ?? byteLength
```

**AC-M02-07 — Identity-only write.** M02 writes `encoding = identity`; gzip is not activated.

**AC-M02-08 — Logical contentHash proof.** The exact v3 logical `contentHash` algorithm is documented and validator-proven so later encoding-only changes do not alter logical identity.

**AC-M02-09 — Coexistence proof.** V1/v2/v3 coexistence and materialization-path behavior are explicitly defined and proven before v3 writes are enabled for chats with an older package.

**AC-M02-10 — No destructive rewrite.** No existing v1/v2 package is destructively rewritten as part of v3 admission.

**AC-M02-11 — Measured reduction.** The M01 measurement harness records a positive physical storage reduction for the v3 app-owned representation against its equivalent legacy representation. No arbitrary percentage threshold is added. Acceptance evidence records aggregate byte reduction plus the two direct elimination criteria:

```text
duplicate scalar-body bytes = 0
persisted app-owned renderer bytes = 0
```

**AC-M02-12 — Milestone attachment.** Accepted implementation is sufficient to reach `MS01 — First measured saved-chat storage reduction shipped`. This artifact does not mark MS01 reached.

### Exclusions

M02 excludes:

- gzip activation;
- SQLite compression;
- turn-body CAS;
- structural snapshot sharing;
- destructive HTML/text simplification;
- GC or reclamation;
- WebDAV;
- cloud CAS;
- E2E or key management;
- J.4 ZIP implementation;
- Sync envelope redesign.

## M03 — Enable Gzip Encoding for Durable `.h2ochat` v3 Payloads

**Status:** `Planned`

**Dependency:** `M03 DEPENDS ON M02 accepted`

### Bounded outcome

Activate gzip storage encoding for appropriate app-owned durable `.h2ochat` v3 payload members through the encoding-capable contract accepted in M02, without changing logical package identity or requiring another package-format version.

M03 may not repair an incomplete v3 contract. If M02 encoding semantics prove insufficient, M03 stops and returns the defect to M02 rather than silently minting v4.

### Admitted scope

- Enable gzip at the v3 durable snapshot/payload boundary authorized by DP01.
- Keep `manifest.json` plaintext and directly inspectable.
- Leave governed already-compressed asset bodies un-recompressed.
- Keep explicit folder exports plaintext and human-readable.
- Update v3 readers, inspectors, and importers to follow the accepted encoded-member verification sequence.
- Preserve v1/v2 behavior unchanged.
- Preserve v3 logical `contentHash` when only physical encoding changes.
- Do not compress live SQLite turn bodies.
- Do not change Sync projections.

### Acceptance criteria

**AC-M03-01 — Encoded-member verification.** For a gzip-encoded v3 member:

- stored-byte SHA matches `sha256`;
- stored-byte length matches `byteLength`;
- declared decoded size is checked against the applicable safety limit before unbounded decode;
- decoded byte length matches `contentByteLength`;
- decoded SHA matches `contentSha256`.

**AC-M03-02 — Lossless logical payload.** The decoded payload is byte-identical to the M02 identity-encoded logical payload.

**AC-M03-03 — Encoding-independent identity.** For the same logical v3 package:

```text
contentHash(identity encoding) == contentHash(gzip encoding)
```

Physical stored hashes may differ; logical identity must not.

**AC-M03-04 — Compatibility.** V1/v2 packages and v3 identity packages remain readable and valid.

**AC-M03-05 — Plaintext manifest.** `manifest.json` remains plaintext.

**AC-M03-06 — Asset boundary.** Precompressed governed asset bodies are not recompressed merely to satisfy M03.

**AC-M03-07 — Export boundary.** Explicit folder export remains plaintext and retains human-readable renderer materialization.

**AC-M03-08 — Corpus round trip.** Compression and decompression are lossless across the admitted package fixture/workload corpus.

**AC-M03-09 — Measured benefit and cost.** The M01 harness records actual gzip byte reduction and decode cost. The verified M01 real-data result:

```text
snapshot.json gzip reference = 9.261× raw/compressed
```

is a benchmark/expectation, not a universal Gate or hard ratio threshold. The hard acceptance condition is positive net storage reduction on the admitted representative package corpus while preserving every integrity and recovery invariant above. If a very small member expands, M03 must handle it safely; this admission artifact does not choose the small-member fallback policy.

**AC-M03-10 — No activation-only v4.** No package-format v4 is introduced merely to activate gzip under a correctly implemented M02 v3 contract.

### Exclusions

M03 excludes:

- Brotli adoption;
- zstd adoption;
- SQLite body compression;
- Sync compression;
- turn-body CAS;
- snapshot structural sharing;
- GC;
- remote/cloud encoding;
- encryption;
- J.4 ZIP method-8 implementation.

J.4 retains its own focused ZIP capability probe.

## Dependency, status, and Gates

```text
M02 DEPENDS ON M01 Complete
M03 DEPENDS ON M02 accepted
```

- M02 status: `Planned`; it becomes eligible for `Ready` only after M01 closure and any explicitly admitted prerequisites are satisfied.
- M03 status: `Planned`; it requires M02 acceptance.
- No new Phase is required.
- No new Gate is required for M02/M03 under current decisions.
- G01 remains future and conditional on M04.
- G02 remains future and conditional on M06.

## Roadmap continuity

```text
M01 — current closure work
  ↓
M02 — non-redundant / encoding-capable .h2ochat v3
  ↓
MS01 — first measured storage reduction shipped, only if M02 is accepted
  ↓
M03 — activate gzip under the accepted v3 contract
  ↓
M05 — durable archive preservation / freshness / coverage
  ↓
M08 — J.4 ZIP round trip after the focused ZIP capability probe
```

- M04: Deferred / threshold-monitored.
- M06: Proposed / G02-protected.
- M07: Proposed future cross-Lane transport handoff.

Mission IDs are unchanged. Later Missions are not further planned here.

## J.4 status

`J.4 STATUS: DEPENDS ON ZIP CAPABILITY PROBE`

The probe is not run by this artifact. T06 does not satisfy it.

## Continuity state

- M01 remains in closure work and is not made Complete by this artifact.
- M02 is admitted as the first post-M01 Mission but remains `Planned`.
- M03 is admitted second and remains `Planned` pending M02 acceptance.
- MS01 remains unreached.
- CP01 remains the current Checkpoint.
