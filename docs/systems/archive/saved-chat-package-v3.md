# Saved Chat Package v3 Contract

Status: Normative / M02 T01 contract freeze

Date: 2026-08-24

Lane: 🗃️ L-STORAGE-SAVED-CHATS — Saved Chats Storage

Mission: M02 — Establish Non-Redundant, Encoding-Capable `.h2ochat` v3

Related:

- [Saved Chat Package Format — Versioned Umbrella Spec](saved-chat-package-format.md)
- [Saved Chat Package v1 Schema Spec](saved-chat-package-v1.md)
- [M01 T05 — Saved-Chat Storage Architecture Decision Memo](../../../release-evidence/2026-08-24/saved-chat-storage-m01-t05-decision-memo.md)
- [M01 Closure — Corrected M02/M03 Admission Update](../../../release-evidence/2026-08-24/saved-chat-storage-m01-m02-m03-admission-update.md)

## Authority and scope

This document is the normative `.h2ochat` v3 package contract for M02. It
freezes logical identity, file descriptors, canonical message content,
version-aware required members, coexistence, and write ordering. It does not
implement the contract or change any v1/v2 package.

`.h2ochat` remains a durable, independently verifiable recovery projection. It
is not the canonical live database, an editable secondary authority, or a
disposable cache.

## DP-M02-A: RESOLVED — APPROVED

### Logical member values

For every v3 file descriptor:

```text
logicalSha256 = contentSha256 ?? sha256
logicalByteLength = contentByteLength ?? byteLength
```

### Canonical package identity

The v3 `contentHash` is:

```text
contentHash = sha256(canonicalJson({
  payloadVersion: 3,
  snapshot: logicalSha256(files.snapshot),
  assets: [...asset sha256 values sorted deterministically]
}))
```

Normative details:

- `sha256(...)` produces the repository's lowercase, `sha256-`-prefixed SHA-256
  value over the UTF-8 bytes returned by `canonicalJson`.
- `canonicalJson` recursively sorts object keys lexicographically, preserves
  array order, omits object properties whose value is `undefined`, and emits
  compact JSON without trailing whitespace.
- `payloadVersion: 3` participates explicitly in the descriptor.
- `snapshot` is the logical hash of `files.snapshot`, not necessarily its
  physical stored-byte hash.
- `assets` contains the governed `manifest.assets[*].sha256` identity values,
  sorted ascending by the complete hash string before canonicalization.
- Changing only a member's physical encoding while preserving identical decoded
  logical bytes must not change v3 `contentHash`.
- V1 and v2 `contentHash` constructions and field meanings remain frozen and
  unchanged. No v1/v2 field is reinterpreted by this contract.

The manifest and snapshot use `schemaVersion: 3`; the manifest uses
`payloadVersion: 3`.

## V3 file descriptors

Each governed v3 member descriptor has these semantics:

| Field | Presence | V3 semantics |
| --- | --- | --- |
| `path` | Required | Package-relative member path. |
| `sha256` | Required | SHA-256 of the physical stored member bytes. This preserves the v1/v2 field meaning. |
| `byteLength` | Required | Physical stored member byte length. |
| `encoding` | Required | Physical storage encoding: `identity` or `gzip`. |
| `contentSha256` | Required when `encoding != identity`; otherwise optional | SHA-256 of decoded logical member bytes. |
| `contentByteLength` | Required when `encoding != identity`; otherwise optional | Decoded logical member byte length. |

M02 writers emit `encoding: "identity"` and may omit `contentSha256` and
`contentByteLength`, because logical values then fall back to stored values. M02
does not activate gzip.

### Encoded-member verification contract

V3 readers must support the following order for a later encoded member:

1. Read bounded physical stored member bytes and verify `sha256`.
2. Validate the declared decoded size in `contentByteLength` against the
   applicable safety cap before unbounded decoding.
3. Decode according to `encoding`.
4. Verify the actual decoded byte length against `contentByteLength`.
5. Verify the decoded-byte hash against `contentSha256`.
6. Verify package logical `contentHash` using `logicalSha256`.

For `identity`, there is no decode step and the logical values use the fallback
rules above. Reader implementation must preserve decompression-bomb protections.

## V3 message content

For v3 messages, `content[]` is the single canonical multipart content
representation. A v3 writer does not emit the duplicated scalar fields:

- `contentText`
- `contentHtml`

V3 readers consume canonical typed `content[]`. V1/v2 readers and compatibility
paths retain the existing scalar fallback; v1/v2 package bytes and semantics are
not rewritten.

M02 therefore requires coordinated migration of every package consumer, not a
writer-only change. The migration must preserve:

- plain-text fidelity;
- sanitized HTML fidelity;
- typed multipart extensibility;
- asset scanning and rewriting;
- archive diagnostics;
- Markdown and HTML rendering;
- import-as-new behavior; and
- restore/relink package consumption where applicable.

## Version-aware required members

| Package version / use | Required persistent members | Renderer behavior |
| --- | --- | --- |
| v1/v2 | `manifest.json`, `snapshot.json`, `chat.md`, `chat.html` | Existing rules remain unchanged. |
| v3 app-owned durable archive | `manifest.json`, `snapshot.json` | `chat.md` and `chat.html` are not required persistent members. |
| Explicit export from v3 | Governed export package plus deterministic `chat.md` and `chat.html` materialization | Renderers are regenerated for human-readable portability. |

Required-file validation must branch by package version. This contract does not
redefine existing v1/v2 `REQUIRED_FILES` semantics.

## DP-M02-B: RESOLVED — APPROVED

The canonical app-owned package path remains:

```text
<chatId>.h2ochat
```

M02 preserves the existing at-most-one-package-per-chat model:

- If `<chatId>.h2ochat` does not exist, M02 may create a v3 package there.
- If `<chatId>.h2ochat` exists and contains v1 or v2, M02 must refuse to
  replace, rewrite, rename, delete, or move it.
- M02 does not create a side-by-side v3 package for that chat.

Coverage, refresh, and transition of existing v1/v2 packages are deferred to
M05 — durable archive preservation, freshness, and coverage. M02 introduces no
package-selection index solely for coexistence and admits no new remove/rename
Tauri capability.

> **M05 supersession note (2026-08-26).** The M05 generation contract
> ([saved-chat-generations.md](saved-chat-generations.md)) supersedes this
> section's path behavior for packages newly published **after** M05: new
> packages are immutable generation-named
> (`<chatId>.g<full-64-hex>.h2ochat`), and `<chatId>.h2ochat` names are only
> ever pre-M05 grandfathered legacy artifacts, which remain preserved
> untouched. This note records the deferral being exercised; the historical
> M02 meaning of this section is unchanged.

## Write order and failure atomicity

An app-owned v3 package is written in this order:

1. Create the package directory.
2. Write governed asset members, when applicable.
3. Write `snapshot.json`.
4. Write `manifest.json` last.

The manifest is the integrity and entry contract. A partial directory without a
manifest must not be treated as a complete, verified package. M02 does not add a
rename-based staging mechanism because archive-root rename capability is
intentionally absent.

The current `exists && !overwrite` guard is the approved coexistence refusal
mechanism. A filesystem existence check alone does not prove atomic concurrency
exclusion. T02 must verify the actual materializer and queue serialization
assumptions before treating that guard as concurrency protection.

## Versioning and migration

- V3 support is additive.
- Existing v1/v2 packages are not rewritten merely to introduce v3.
- V1/v2 readers remain supported; v3 reader support is additive.
- M02 performs no bulk or destructive migration.
- M02 writes identity-encoded members and does not activate gzip.
- M03 depends on accepted M02.

## M03 handoff

M03 receives an encoding-capable v3 contract with:

- `identity` as the M02 stored-representation baseline;
- explicit `encoding` semantics;
- distinct physical stored-byte and decoded logical hashes and lengths;
- the exact encoding-independent v3 `contentHash` construction above;
- the encoded-member verification order above;
- `snapshot.json` as the initial gzip-eligible payload member;
- plaintext `manifest.json`;
- governed asset bodies left un-recompressed; and
- plaintext, human-readable folder exports.

M03 must not need a v4 merely to activate gzip through this contract. M03 owns
gzip activation; M02 does not.

## M03 normative gzip addendum

Mission: M03 — Enable Gzip Encoding for Durable `.h2ochat` v3 Payloads

This addendum activates the already-admitted v3 `gzip` representation without
adding descriptor fields, changing logical identity, or introducing package
format v4.

## DP-M03-A: Resolved — Approved

### Whole-package encoding selection

For one identical logical package state, the writer must evaluate identity and
gzip candidate representations in memory before writing any package member. It
always constructs the complete identity candidate first and constructs the
complete gzip candidate unless the bounded dominance rule below has already
proved that gzip cannot win:

- The **identity candidate** contains the canonical logical `snapshot.json`
  bytes, an `encoding: "identity"` snapshot descriptor with physical `sha256`
  and `byteLength`, no redundant `contentSha256` or `contentByteLength`, and the
  resulting plaintext `manifest.json`.
- The **gzip candidate** contains gzip-encoded physical `snapshot.json` bytes,
  an `encoding: "gzip"` snapshot descriptor with physical `sha256` and
  `byteLength` plus logical `contentSha256` and `contentByteLength`, and the
  resulting plaintext `manifest.json`.

Both candidates must represent identical logical content and produce the same
logical v3 `contentHash`. Subject also to the persisted-member admission rule
in DP-M03-C, select gzip only when the actual serialized complete candidate
satisfies:

```text
gzipSnapshotBytes + gzipManifestBytes
  <
identitySnapshotBytes + identityManifestBytes
```

Identity wins ties. Governed assets are identical between the candidates and
cancel from the comparison. The writer must not use a size threshold constant,
a modeled manifest-overhead constant, or a snapshot-only comparison. A snapshot
shrinking under gzip is not sufficient by itself; the complete app-owned
representation must shrink.

Selection occurs before any package member is written. The exact selected
candidate bytes and descriptors are the bytes and descriptors subsequently
written.

### Bounded candidate evaluation clarification

This is an approved implementation clarification of DP-M03-A, not a new
Decision Point or storage-policy limit. The writer evaluates a candidate as
follows:

1. Construct the complete identity candidate first and calculate its actual
   serialized total:

   ```text
   identityTotalBytes =
     identitySnapshotByteLength + identityManifestByteLength
   ```

2. Derive the per-package gzip evaluation bound:

   ```text
   candidateCap = identityTotalBytes
   ```

3. Invoke the governed gzip encoder with
   `physicalByteCap = candidateCap`.
4. If gzip completes within that bound, build its exact descriptor, serialize
   its exact plaintext manifest, and calculate:

   ```text
   gzipTotalBytes =
     gzipSnapshotByteLength + gzipManifestByteLength
   ```

   Then apply the unchanged whole-package rule
   `gzipTotalBytes < identityTotalBytes`. Gzip is selected only when strictly
   smaller; identity wins ties.
5. If gzip terminates specifically with
   `saved-chat-member-physical-output-exceeds-cap` against that exact derived
   `candidateCap`, identity may be selected without completing the gzip
   candidate. Emitted gzip stream bytes are monotone non-decreasing, so once
   gzip physical output would exceed the complete identity snapshot-plus-
   manifest total, the finished gzip representation cannot satisfy
   `gzipTotalBytes < identityTotalBytes`.

This cap-exceeded outcome is an early dominance proof, not fallback from a
generic compression failure. Only
`saved-chat-member-physical-output-exceeds-cap` raised against the exact
per-package `candidateCap` above permits early identity selection. Every other
codec, stream, byte-input, hash, serialization, runtime, or
candidate-construction failure remains fail-closed.

`candidateCap` is derived independently for each package from actual serialized
identity-candidate bytes. It is never persisted and is not a package-admission
limit, fixed physical storage cap, threshold heuristic, or modeled overhead
constant. If gzip remains capable of winning within the derived bound, the
original exact snapshot-plus-manifest comparison still runs. Dominance pruning
only avoids completing a candidate already proven unable to win.

This clarification changes no descriptor field, v3 logical identity,
`contentHash`, encoding semantic, or package-format version. It introduces no
v4.

### Logical identity remains frozen

For an encoded v3 member:

- `sha256` is the SHA-256 of the exact physical stored bytes.
- `byteLength` is the exact physical stored-byte length.
- `contentSha256` is the SHA-256 of the decoded logical bytes.
- `contentByteLength` is the decoded logical byte length.

Normalization remains:

```text
logicalSha256 = contentSha256 ?? sha256
logicalByteLength = contentByteLength ?? byteLength
```

Package identity remains exactly:

```text
contentHash = sha256(canonicalJson({
  payloadVersion: 3,
  snapshot: logicalSha256(files.snapshot),
  assets: [...asset sha256 values sorted deterministically]
}))
```

Changing only physical encoding must not change logical `contentHash`.

## DP-M03-B: Resolved — Approved

### Manifest-less interrupted-write retry

A manifest-less interrupted v3 package resumes through bounded logical
equivalence, not by reproducing prior physical gzip bytes. Existing M02 controls
remain mandatory: shallow inventory verification, symlink rejection,
unexpected-member rejection, refusal when a complete manifest already exists,
no deletion, no rename, and `manifest.json` written last.

The retry algorithm is:

1. Rebuild the intended canonical logical snapshot to establish trusted
   expected logical bytes, byte length, and SHA-256.
2. Read the existing manifest-less `snapshot.json` under the governed physical
   stored-byte cap.
3. Select the candidate representation from the stored bytes: gzip magic
   `0x1f 0x8b` selects gzip; canonical identity JSON begins with `0x7b`.
   Magic bytes select only the candidate decode path and are not integrity
   proof.
4. For gzip, stream-decode with a hard decoded-output bound no greater than
   `min(expectedLogicalByteLength, globalLogicalSnapshotCap)`. The global
   logical snapshot cap remains the governed 8 MiB safety boundary unless
   separately revised by authority. Abort or cancel immediately when decoded
   output exceeds the effective cap; never materialize unbounded decoded output
   before enforcing it.
5. For identity, use the bounded physical bytes directly as logical bytes.
6. Require `actualLogicalByteLength == expectedLogicalByteLength`.
7. Require `actualLogicalSha256 == expectedLogicalSha256`.
8. Only after complete bounded logical verification, retain the existing
   physical bytes and derive the final descriptor from the representation
   actually present on disk: `encoding`, physical `sha256`, physical
   `byteLength`, and the required logical descriptor values for an encoded
   representation.
9. Write the matching `manifest.json` last.

Any decode failure, truncated or corrupt stream, bound exceedance,
logical-length mismatch, logical-SHA mismatch, unexpected member, or ambiguous
or unsupported representation fails closed. Retry introduces no deletion or
rename.

### Branch-flip safety

Retry correctness does not depend on reproducing the current encoder's physical
output. Every retained representation must also satisfy DP-M03-C:

- Original gzip remains gzip after bounded logical verification even if the
  current rebuild would select identity.
- Original identity remains identity after bounded logical verification even if
  the current rebuild would select gzip.
- Original gzip remains retained after bounded logical verification even if the
  current encoder would emit different valid gzip bytes.
- Original identity verifies normally when the current rebuild also selects
  identity.

Physical gzip determinism is therefore not a correctness prerequisite for
interrupted-write recovery, and this behavior requires no v4.

## DP-M03-C: Resolved — Approved

### Persisted v3 snapshot physical read-bound rule

Every persisted gzip-v3 `snapshot.json` must satisfy:

```text
0 < physicalByteLength < logicalContentByteLength <= 8 MiB
```

For a fresh package, gzip is admitted only when its physical snapshot length is
positive and strictly smaller than the canonical identity snapshot length **and**
its complete snapshot-plus-manifest representation is strictly smaller than the
complete identity representation. Identity wins when either savings condition
fails. The identity candidate remains governed by the 8 MiB logical snapshot
cap.

Manifest-less interrupted recovery intentionally separates physical read safety
from gzip persisted admission:

1. Rebuild the intended canonical snapshot and require its trusted logical byte
   length to satisfy `0 < trustedLogicalByteLength <= 8 MiB`.
2. Before reading member bytes, use filesystem metadata to require a regular
   non-symlink file and:

   ```text
   0 < physicalByteLength <= trustedLogicalByteLength <= 8 MiB
   ```

   The trusted logical length is therefore an independent finite cap on the
   subsequent whole-file read; no manifest-provided physical length supplies
   this safety authority.
3. After that bounded read, identify identity by the canonical `{` prefix or
   gzip by magic bytes `0x1f 0x8b`; anything else fails closed.
4. Identity may use equality
   `physicalByteLength == trustedLogicalByteLength`, subject to exact canonical
   logical-length and SHA verification.
5. Gzip must additionally satisfy
   `physicalByteLength < trustedLogicalByteLength` before decompression or
   retention. A same-length gzip member is rejected immediately after
   representation detection and is never decoded, retained, or described by a
   published manifest. A member larger than the trusted logical length is
   rejected from metadata before the whole-file read.
6. An admitted gzip member then uses the single governed streaming decoder with
   decoded output bounded by
   `min(trustedLogicalByteLength, 8 MiB)`, followed by exact logical-length and
   logical-SHA verification. Only then may its existing physical bytes be
   retained and described, with `manifest.json` still written last.

This rule narrows gzip admission in DP-M03-B but does not require byte-identical
gzip reproduction. It changes no descriptor field, logical `contentHash`,
encoding-independent identity, asset encoding, plaintext-manifest rule, or
package version. No v4 is introduced.

### Governed gzip read safety

For a manifest-governed gzip member, a reader must:

1. Read stored bytes under the physical stored-byte cap.
2. Verify physical `byteLength`.
3. Verify physical `sha256`.
4. Require a valid `contentByteLength`.
5. Reject before decoding when the declared logical size exceeds the global
   logical snapshot cap.
6. Begin streaming decompression and continuously track decoded byte count.
7. Abort or cancel immediately when decoded bytes exceed either declared
   `contentByteLength` or the global logical snapshot cap.
8. At normal completion, require
   `actualDecodedByteLength == contentByteLength`.
9. Verify decoded `contentSha256`.
10. Verify logical package `contentHash`.
11. Only then parse or consume JSON.

Checking declared size before decompression is necessary but not sufficient;
the decoder must enforce the bound during streaming decompression.

### V3 determinism scope

Determination: **LOGICAL DETERMINISM REQUIRED**.

For v3, the same governed logical package state must preserve canonical logical
snapshot content, logical snapshot SHA and length, governed asset identities,
and logical package `contentHash`.

Physical representation may vary when encoding varies, including stored
`snapshot.json` bytes, `files.snapshot.encoding`, physical
`files.snapshot.sha256`, physical `files.snapshot.byteLength`, resulting
plaintext `manifest.json` bytes, and any externally measured manifest hash. A
compliant recovery path must not depend on reproducing byte-identical gzip
bytes.

For v3, the general ADR-0009 package-reproducibility rule is governed at the
canonical logical package level, with recorded member `encoding` as an explicit
representation input. This v3-specific clarification does not change historical
v1/v2 byte-determinism claims.

### M03 continuity and boundaries

The manifest remains plaintext; governed assets remain uncompressed by M03;
canonical v3 `content[]` and renderer-free app-owned package semantics remain
unchanged. Live v3 materializer activation remains outside M03, and
`SERIALIZATION PARTIAL` remains a prerequisite for any future live activation.
M03 member gzip encoding remains separate from J.4 ZIP method-8 behavior.

## DP-M03-D: Resolved — Approved

### Governed archive metadata read capability

The governed saved-chat package reader establishes its trusted pre-read physical
size bound by reading filesystem metadata through `plugin:fs|lstat` before any
whole-file read. That metadata operation is load-bearing for DP-M03-C: it is what
establishes a positive regular non-symlink physical length `P` independently of
manifest-controlled values, so `P > L` can be rejected before the bounded read.

The archive capability that scopes `$APPLOCALDATA/archive/**` did not grant the
permission required to invoke that command. DP-M03-D authorizes the minimum
permission that closes this admission gap:

- permission added: `fs:allow-lstat`;
- scope: the already-authorized `$APPLOCALDATA/archive/**`, unchanged;
- no new filesystem path scope;
- no `open`, no arbitrary bounded `read`, no seek;
- no `remove`, no `rename`, no broader read/write authority.

The pinned `tauri-plugin-fs` 2.5.1 permission definition declares
`identifier = "allow-lstat"` with `commands.allow = ["lstat"]`, so the grant
admits exactly one command and carries no pre-configured scope of its own.

### DP-M03-D boundaries

DP-M03-D changes no descriptor field, no `contentHash` construction, no package
format or version, and no codec or writer logic. DP-M03-C physical read-bound
semantics remain exactly as approved. This decision closes a capability-admission
gap only; it does not itself migrate any T04 consumer, does not activate the live
v3 materializer, and does not alter SQLite, CAS, Sync, transport, or queue
serialization. `SERIALIZATION PARTIAL` remains carried forward.

## Boundaries

This contract does not define a package-selection index, side-by-side v3 paths,
v1/v2 migration machinery, M05 refresh policy, remote transport or object names,
WebDAV, cloud storage, encryption or keys, GC/reclamation, Sync redesign, or J.4
ZIP behavior.
