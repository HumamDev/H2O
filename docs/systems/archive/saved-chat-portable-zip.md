# Saved Chat Portable ZIP Contract

Status: Normative / M08 P0 contract freeze; M08 ACTIVE

Date: 2026-09-01

Lane: 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization

Mission: M08 — Portable Saved-Chat ZIP Round Trip

Related:

- [Saved Chat Package v3 Contract](saved-chat-package-v3.md)
- [Saved Chat Archive Generations Contract](saved-chat-generations.md)
- [Saved Chat Storage ↔ Transport Object Handoff Contract](saved-chat-transport-handoff.md)
- [Phase J.4 ZIP decision](../../../release-evidence/2026-06-24/saved-chat-archive-phase-j4-zip-format-decision.md)
- [M01 storage decision memo](../../../release-evidence/2026-08-24/saved-chat-storage-m01-t05-decision-memo.md)

## 1. Bounded outcome

M08 adds a portable, single-file `.h2ochat.zip` wrapper around one existing
verified `.h2ochat` package and a safe path back into the existing governed
import-as-new flow. ZIP export and ZIP import are one round-trip capability;
export-only ZIP is not an accepted outcome.

M08 owns the ZIP container, bounded hostile-input parsing, deterministic entry
assembly, and the adapters between the container and the existing package
export/import authorities. It does not create another saved-chat schema,
content identity, verifier, or persistence path.

## 2. Ownership boundaries

| Concern | Owner | M08 rule |
| --- | --- | --- |
| Package manifest, members and `contentHash` | Existing saved-chat package contract and verifier | Preserved byte-for-byte; ZIP does not reinterpret package identity. |
| Source package admission | Existing archive inspector/diagnostics | Export begins only from a verified governed package. |
| ZIP bytes, CRC-32, entry layout and resource bounds | M08 | Narrow methods 0/8 subset; method 8 is the export method. |
| Import conflict checks and store writes | Existing archive importer | Shared dry-run/import-as-new core; no second mutation implementation. |
| Archive publication, retention and reclamation | M05/M06 | Unchanged; ZIP import never extracts into `archive/packages`. |
| Storage/Transport handoff | M07 | Unchanged; `representationHash` is not ZIP-byte identity. |
| Sync, endpoint, credentials, WebDAV/cloud/relay, outbox and ledger | Transport/Sync | Excluded from M08. |
| Chrome package-body access | None | M08 is Desktop-only and grants Chrome no package-body authority. |

## 3. DP-M08-A — ZIP is a container, not a package version

The file extension is:

```text
.h2ochat.zip
```

The logical archive shape is exactly one package root:

```text
<package-name>.h2ochat/
    manifest.json
    snapshot.json
    [chat.md]
    [chat.html]
    [assets/...]
```

The root is the verified source package basename. No entry exists outside it.
The contained `manifest.json`, governed persistent members, package asset
descriptors and package `contentHash` retain their existing meanings and bytes.
M08 adds no package v4 and no container manifest.

For v1/v2, the wrapper contains the four governed persistent package members
plus every manifest-declared asset. For a v3 package admitted by the shared
trusted verifier, the wrapper contains its governed persistent members and
assets plus the deterministic human-readable companions required by the
existing explicit-export contract. M08 does not activate live v3 publication
and cannot admit a version the shared verifier refuses.

## 4. DP-M08-B — deterministic export semantics

The writer freezes:

- one `.h2ochat/` root and forward-slash UTF-8 names;
- canonical role order: `manifest.json`, `snapshot.json`, `chat.md`,
  `chat.html`, then asset paths in ascending bytewise UTF-8 order;
- fixed DOS timestamp `2020-01-01 00:00:00`;
- no extra fields, comments, directory records or platform path metadata;
- UTF-8 filename flag only;
- ZIP method 8 (raw DEFLATE) for every emitted file entry;
- CRC-32 over uncompressed member bytes and exact 32-bit sizes/offsets in both
  local and central records; and
- read-back container and package verification before success is reported.

Identical logical input produces the same entry set, order and uncompressed
member bytes. The accepted method-8 probe also produced byte-identical output
across repeated invocations in the current runtime. Cross-runtime compressed
stream byte equality is not package or container identity authority: a valid
DEFLATE encoder may choose a different physical stream while preserving the
same governed uncompressed bytes and ZIP semantics.

Export uses the existing bounded `$HOME/H2O Studio Exports/` authority and
refuses an existing destination. It does not mutate the source package and does
not replace the existing folder export.

## 5. DP-M08-C — admitted ZIP subset

The reader supports only the subset M08 needs:

- single-disk archives;
- a terminal, comment-free End of Central Directory record;
- 32-bit local and central records;
- methods 0 (stored) and 8 (raw DEFLATE);
- known sizes and CRC in each local and central header; and
- UTF-8 names with no extra fields, entry comments or directory entries.

The reader rejects encryption, data descriptors, ZIP64 sentinels/records,
multi-disk archives, unsupported flags or methods, symlink-like external
attributes, prepended/trailing data, gaps, overlaps, mismatched local/central
names or metadata, duplicate normalized paths, and out-of-range offsets.

Path admission rejects empty names or segments, `.`, `..`, absolute paths,
Windows drive paths, backslashes, NUL, ambiguous separators, multiple package
roots, entries outside the single root, and members outside the exact
version-aware package/export inventory.

## 6. DP-M08-D — hostile-input resource bounds

Portable ZIP admission is independently bounded before any persistent write:

| Resource | Bound |
| --- | --- |
| Physical ZIP input | 128 MiB |
| Entry count | 1,024 |
| UTF-8 filename length | 1,024 bytes |
| Compressed bytes per entry | 64 MiB |
| Decompressed bytes per entry | 64 MiB |
| Cumulative decompressed bytes | 256 MiB |

These are M08 portable-container admission limits, not a redefinition of
general `.h2ochat` package validity. They sit above the current 8 MiB governed
v3 logical snapshot bound and 32 MiB new-asset ingest ceiling while keeping
hostile single-file decode memory finite. Revisions require explicit authority.

Declared sizes never authorize allocation. Checked arithmetic validates every
range and cumulative total. Method-8 output is collected through a streaming
decoder that cancels immediately when the actual output exceeds the declared
or governed cap. No allocation is sized directly from an unchecked archive
field.

## 7. DP-M08-E — package verification and import reuse

Import ordering is:

```text
bounded ZIP read
→ central/local structural verification
→ safe path normalization
→ bounded method-0/method-8 decode
→ CRC and exact-size verification
→ exact package inventory admission
→ shared saved-chat package verification over the decoded byte source
→ existing import dry-run core
→ explicit import-as-new through the existing store-mutation core
```

ZIP integrity is not package integrity. The decoded package must pass the same
manifest/version, member hash/length, encoded/logical v3, asset, contentHash and
name-classification checks as an on-disk package. Diagnostics is factored over
a read-only package-byte source; M08 does not copy its verification rules.

The importer is factored around one verified-candidate decision/mutation core.
The historical archive-path adapter and the ZIP byte-source adapter both feed
that core. Conflict evaluation, fresh recovered IDs, provenance and store
writes remain implemented once. A failed ZIP, failed package, dry run or
conflict causes zero writes.

ZIP bytes are decoded in memory and are never extracted into
`archive/packages`, the CAS, or another live archive namespace. The P0/P1
import API accepts an already-bounded byte input plus a non-authoritative safe
`.h2ochat.zip` display leaf. It does not add filesystem-read authority: a later
P3 file-picker adapter must establish physical size before reading bytes.
Broader file-picker or arbitrary-path authority is not implied. Export remains
bounded to the already-authorized `$HOME/H2O Studio Exports/` root.

## 8. Persistent-state boundary

Production-profile mutation is forbidden for M08 acceptance. Write-path tests
use existing isolated store harnesses or an explicit disposable Studio profile.
Import-as-new creates a fresh chat and fresh snapshot, never overwrites existing
rows, does not alter the source ZIP, and does not mutate canonical archive
packages. Restore/relink remains separate.

No migration or capability broadening is part of M08 P0/P1.

## 9. Phases and gates

### P0 — Contract + ZIP method-8 capability

- prove native `CompressionStream('deflate-raw')` ZIP method-8 compatibility;
- freeze the format subset, resource bounds, ownership and refusal model;
- **G0:** capability and normative contract pass.

### P1 — ZIP export + safe import core

- implement the bounded ZIP codec;
- add verified source export and read-back verification;
- factor the shared package verifier and importer core over byte sources;
- prove a complete package/store round trip.

### P2 — Hostile input + compatibility

- complete adversarial structural/path/resource coverage;
- preserve v1/v2 and folder export/import behavior;
- keep future-v3 admission tied to trusted verification;
- **G1:** full core round trip and hostile-input assurance pass.

### P3 — Disposable runtime acceptance

- produce a real portable ZIP;
- prove macOS system extraction;
- import through a disposable application profile;
- **G2:** independent final Mission acceptance passes.

## 10. Acceptance criteria

- **AC-M08-01 — Container, not schema.** `.h2ochat.zip` is a deterministic,
  versioned container contract around the existing package, not another
  saved-chat schema.
- **AC-M08-02 — Method 8.** Raw-DEFLATE ZIP writing is standards-compatible
  and preserves correct CRC, sizes, headers and central-directory offsets.
- **AC-M08-03 — Verified export source.** ZIP export begins only from a
  verified governed saved-chat package.
- **AC-M08-04 — Exact root/inventory.** Export contains exactly one safe
  `.h2ochat/` root and only governed version-aware package/export files.
- **AC-M08-05 — Package identity preservation.** Source package bytes and
  `contentHash` are not altered by containerization.
- **AC-M08-06 — Safe names and structure.** Import rejects traversal,
  absolute paths, duplicate normalized paths and unsupported ZIP structures.
- **AC-M08-07 — Resource bounds.** ZIP input, entry count, names, compressed
  sizes, decompressed sizes and cumulative output are bounded.
- **AC-M08-08 — Layered integrity.** ZIP CRC/container integrity and saved-chat
  package integrity are independently verified before import admission.
- **AC-M08-09 — Byte-equivalent recovery.** A valid exported ZIP decodes to
  byte-identical governed persistent package members.
- **AC-M08-10 — One persistence core.** ZIP import reuses the existing governed
  import conflict/persistence core.
- **AC-M08-11 — Zero-write refusal.** Failed ZIP/package validation causes zero
  persistent saved-chat mutation.
- **AC-M08-12 — Import-as-new.** Round-trip import creates fresh IDs and does
  not overwrite existing chat/snapshot state.
- **AC-M08-13 — Folder preservation.** Existing folder `.h2ochat` export/import
  remains functional and semantically unchanged.
- **AC-M08-14 — Version boundary.** Current v1/v2 compatibility is preserved;
  M08 does not independently activate live v3.
- **AC-M08-15 — No cross-Lane authority.** No Sync/WebDAV/cloud/Chrome
  package-body authority is introduced.
- **AC-M08-16 — System compatibility.** macOS `unzip` and system extraction
  accept a produced ZIP and recover byte-identical governed members.
- **AC-M08-17 — Disposable runtime round trip.** A disposable assembled runtime
  proves verified package → ZIP export → safe app import → expected state.

## 11. Definition of Done

M08 is Complete only when the method-8 prerequisite, normative contract,
portable export, safe import, shared authorities, hostile-input assurance,
folder-flow preservation, system extraction, disposable application round
trip, AC-M08-01 through AC-M08-17, independent G2, and final recorded closure
all pass. This P0/P1 contract and core slice does not declare M08 Complete.

## 12. Exclusions

M08 does not implement Sync, WebDAV/cloud/relay, encryption, OS share sheets,
remote layout, library redesign, M07 identity changes, M06 retention/GC,
archive migration, live-v3 activation, restore/relink, arbitrary filesystem
selection, or production-profile acceptance mutation.
