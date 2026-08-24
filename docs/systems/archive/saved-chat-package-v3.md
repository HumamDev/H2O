# Saved Chat Package v3 Contract

Status: Normative / M02 T01 contract freeze

Date: 2026-08-24

Lane: 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization

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

## Boundaries

This contract does not define a package-selection index, side-by-side v3 paths,
v1/v2 migration machinery, M05 refresh policy, remote transport or object names,
WebDAV, cloud storage, encryption or keys, GC/reclamation, Sync redesign, or J.4
ZIP behavior.
