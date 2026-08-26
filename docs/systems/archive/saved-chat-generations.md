# Saved Chat Archive Generations — Immutable Publication, Freshness & Coverage Contract

Status: Normative / M05 T1.1.1 contract freeze

Date: 2026-08-26

Lane: 🗃️ L-SAVED-CHAT-STORAGE — Saved Chat Storage Architecture & Optimization

Mission: M05 — Establish Immutable Saved-Chat Archive Generations, Freshness &
Coverage

Related:

- [Saved Chat Package Format — Versioned Umbrella Spec](saved-chat-package-format.md)
- [Saved Chat Package v1 Schema Spec](saved-chat-package-v1.md)
- [Saved Chat Package v3 Contract](saved-chat-package-v3.md)
- [DP-PRE-M05-ASSET-BOUND](../../decisions/DP-PRE-M05-ASSET-BOUND.md)
- [ADR-0009 — Chat Saving Architecture](../../decisions/ADR-0009-chat-saving-architecture.md)
- [ADR-0010 — Saved Chat Asset CAS](../../decisions/ADR-0010-saved-chat-asset-cas.md)
- [M05 T1.2.3 member-bound evidence](../../../release-evidence/2026-08-26/saved-chat-storage-m05-t123-member-bound-evidence.md)

## A. Mission, authority and scope

This document is the normative M05 contract for immutable saved-chat archive
generations: naming, classification, validity, freshness, coverage, the trusted
staged publication protocol, and its bounds. It freezes authority for the M05
implementation phases; it does not itself implement anything.

Standing constraints it operates under, none of which it modifies:

- D9: this source owns SQLite migrations v1–v17; production carries v18–v21
  owned elsewhere. M05 performs **no migration**, allocates **no v22**, and
  integrates **no v18–v21**. All new queue metadata lives in the existing
  `meta_json` column.
- Live v3 remains OFF. `SERIALIZATION PARTIAL` remains carried.
- PRE-M05 remains authoritative: the CAS-scoped trusted durable write, the CAS
  repair write, and DP-PRE-M05-ASSET-BOUND (32 MiB per newly ingested asset —
  an ingest ceiling, never a read ceiling).
- New UI only. No Chrome architecture changes. No Sync-owned changes.

## B. Generation naming

The canonical immutable generation directory name is:

```text
<chatId>.g<hex64>.h2ochat
```

- `hex64` is the **complete** 64-character lowercase hexadecimal component of
  that package's own `contentHash`, with the `sha256-` prefix dropped in the
  filename only. No truncation. The manifest keeps the full prefixed value.
- `chatId` rules are unchanged from the existing writer
  (`safePackageDirName`): `^[A-Za-z0-9._-]+$`, not `.`, not `..`, no path
  separators. The charset is ASCII-only, so byte length equals character
  length.
- The name is **version-agnostic**: the hex is the contentHash of that package
  under its own payload version's frozen construction (v1 or v2 today; v3 if
  and when live v3 is separately activated).
- Generations live beside legacy packages under
  `$APPLOCALDATA/archive/packages/`.
- Post-M05 invariant: **all** newly published packages — including the first
  package of a previously uncovered chat — are generation-named. New
  legacy-shaped names are never created after M05.

## C. Legacy grandfathering

An existing `<chatId>.h2ochat` package is a grandfathered preservation
artifact. M05 never renames, rewrites, moves, or deletes it — not to adopt
generations, not on refresh, not on corruption. It participates in freshness
and selection exactly like a generation (§E). Legacy names are only ever
pre-M05 artifacts.

## D. Manifest-derived filename classification

A filename is **discovery input only** — never identity authority. Discovery
enumerates `archive/packages/` directories whose basename ends `.h2ochat`,
excluding the reserved staging prefix (§R).

After package verification, identity is derived from the **verified manifest**:

```text
legacyExpected     = manifest.chatId + ".h2ochat"
generationExpected = manifest.chatId + ".g"
                     + lowercase64hex(manifest.contentHash) + ".h2ochat"
```

Classification is exact basename equality:

| Condition | Classification |
| --- | --- |
| `basename == generationExpected` | canonical immutable generation |
| `basename == legacyExpected` | grandfathered legacy package |
| otherwise | `package-name-identity-mismatch` |

- Generation identity is **never parsed from the filename first**. A
  legitimate legacy chatId that literally ends in `.g<64hex>` classifies as
  LEGACY, because its basename equals `legacyExpected` and can never equal
  `generationExpected` (which appends a further `.g<hex64>` suffix).
- `package-name-identity-mismatch` packages are excluded from automatic
  selection and surfaced as diagnostics; they remain openable by explicit
  path.
- **Reader supersession.** This classification **replaces** the existing
  per-package blocker `package-dirname-chat-id-mismatch`
  (`saved-chat-archive-diagnostics.tauri.js:1242`, which requires
  `basename == chatId + '.h2ochat'` and therefore blocks every generation
  name). That replacement is a governed **reader change**, implemented in
  Phase 2 diagnostics convergence, and it is a sequencing prerequisite: until
  it lands, the pre-M05 verifier cannot classify any generation as VALID, so
  publication wiring (Phase 3) must not precede it.
- An empty or absent `manifest.chatId` makes the package **unclassifiable**
  (never classified via snapshot fallbacks; existing verification blockers
  apply).
- The shallow inventory tier (which already parses each manifest) may emit the
  same classification **provisionally** for display; selection, freshness and
  coverage require the fully verified classification.

## E. Validity, freshness, preservation, coverage

| Term | Definition |
| --- | --- |
| GENERATION | One immutable package at a generation-classified path. |
| VALID | The **M05** governed verification pass fully passes for that package (members, descriptor hashes, contentHash, and the §D manifest-derived name classification — which supersedes the pre-M05 dirname blocker). |
| CURRENT DESKTOP PROJECTION | `{contentHash, snapshotId, assetShas}` computed from the canonical current Desktop snapshot by a pure probe that shares the writer's own projection/identity math and mutates nothing. Requires the SQLite backend to be ready; otherwise INDETERMINATE. |
| FRESH | A VALID package (generation or legacy) whose `contentHash` equals the current projection's `contentHash`. |
| STALE | A VALID package that is not FRESH (see §F for the two kinds). |
| PRESERVED | The chat has ≥ 1 VALID package of any age. |
| COVERED | The chat has ≥ 1 FRESH package. |

Positive freshness requires logical equality of `contentHash` values and
nothing else. **No timestamp — filesystem, manifest, queue, or wall clock —
ever positively establishes freshness.** Timestamps are diagnostics and
context only.

Deterministic selection: a FRESH generation is preferred; else a FRESH legacy;
else there is no fresh package and consumers present the stale set (§G).
Corrupt, partial, mismatched and unclassifiable packages are excluded from
automatic selection and surfaced. When the projection is INDETERMINATE
(store unavailable) or UNDEFINED (no current snapshot), packages remain
PRESERVED, freshness is not asserted either way, and no refresh proceeds.

## F. Content-stale vs format-stale

- **content-stale**: VALID, same contentHash construction version as the live
  writer, hash differs — the archived content genuinely differs from the
  current projection.
- **format-stale**: VALID, but its payload version's contentHash construction
  differs from the live writer's (e.g. v1/v2 packages after a future live v3
  activation). Format-stale is recorded distinctly so a future format
  transition is legible as such and is never treated as content obsolescence
  (in particular by any future GC authority).

## G. BEST-HISTORICAL

Among VALID packages of a chat with no FRESH package, consumers may present a
BEST-HISTORICAL candidate: the highest verified `snapshot.savedAt` — a hashed
content field inside the verified snapshot, not filesystem metadata — with
ties (including empty `savedAt`) presented **as ties** in lexicographic
contentHash-hex display order. BEST-HISTORICAL is presentation only. It is
never freshness authority, never an automatic input to any destructive or
recovery action, and is always labeled as historical.

## H. No mutable current pointer

No `current.json`, no symlink, no `latest` alias, no mutable package pointer,
no second authoritative store of "which package is current". Currentness is
derived per view from verification plus the current projection.

## I. No persistent archive index initially

Discovery remains filesystem scanning plus manifest reads. No
`archive_package_index` table or equivalent persistent mutable index is
introduced for generation discovery. Any future index must be derived and
rebuildable, never preservation authority, and must earn its way in with
measured evidence.

## J. Live v1/v2 required persistent members

A live v1/v2 persistent package requires exactly:

```text
manifest.json
snapshot.json
chat.md
chat.html
```

plus governed `assets/` member copies when the manifest declares assets.
Live v3 remains OFF; M05 publication does not use the v3 two-member durable
form. The staged publication commit gate (§S) admits payload versions 1 and 2
only.

## K. chat.md / chat.html presentation-member status

`chat.md` and `chat.html` are **required v1/v2 persistent presentation
members**: deterministic renderings of the snapshot. They carry governed
`manifest.files` descriptors (`markdown`, `html` keys) whose `sha256` and
`byteLength` the trusted commit gate re-verifies against the staged bytes.
They are **not** package identity authority (§L). Their sizes are linear in
snapshot content with small constants (see the T1.2.3 evidence).

## L. v1/v2 contentHash semantics — unchanged, byte-exact

```text
v1: contentHash = files.snapshot.sha256          (physical snapshot.json SHA-256)
v2: contentHash = sha256(canonicalJson({
      snapshot: <files.snapshot.sha256>,
      assets:   [ ...cleaned manifest asset sha256 strings, sorted ]
    }))
```

Byte-exactness requirements frozen for the trusted derivation (each is pinned
by a cross-language test vector in T1.2.2):

- `canonicalJson` sorts object keys lexicographically and emits compact JSON —
  the v2 pre-image is exactly `{"assets":[…],"snapshot":"sha256-…"}`;
- the hash construction does **not** deduplicate asset sha strings (it hashes
  the list it is given; historical duplicate-bearing manifests verify by this
  same math on read — the commit gate separately refuses to *newly publish*
  duplicates, §S);
- the sorted values are the **raw cleaned** `sha256-`-prefixed strings (no
  normalization pass);
- the sort is plain lexicographic order over the full prefixed strings. JS
  `.sort()` compares UTF-16 code units and Rust compares UTF-8 bytes; the two
  coincide exactly because the gate has already validated every value against
  the ASCII sha grammar (`sha256-` + 64 lowercase hex) before hashing — this
  ASCII premise is part of the frozen claim.

`chat.md` / `chat.html` do **not** participate in contentHash under any
version. M05 does not redefine v1/v2 identity in any way.

## M. Create-only publication

- Target generation absent → create.
- Exact target occupied by a VALID package with the same derived contentHash →
  idempotent dedupe success (no write).
- Older valid generations are never touched.
- A corrupt or partial occupant is **never** silently overwritten; publication
  refuses and surfaces it (§P cases C/D).
- There is no overwrite, force, delete, or rename parameter anywhere in the
  publication surface.

## N. Staged trusted publication protocol

Publication is a purpose-bounded, Rust-owned staged protocol (module of its
own; the PRE-M05 CAS-scoped durable-write command is not widened). Exact
command names are implementation detail; the semantic protocol is:

```text
BEGIN {chatId}                    → {token}     (plain-argument command)
WRITE MEMBER {token, member}      + bounded raw body        (repeatable: §Q)
  member ∈ { snapshot, markdown, html }  — enum only, fixed filenames
COMMIT {token, expectedContentHash?} + bounded manifest body
ABORT {token}                                   (plain-argument command)
```

COMMIT, in order: consume the session (§Q) → validate the manifest and
version triple (§V) → cross-check the staged snapshot (§S) → re-hash every
staged member against its `manifest.files` descriptor → validate every asset
descriptor and copy asset bytes from the canonical CAS with streaming
re-verification (§W) → derive `contentHash` internally and require the
manifest to agree (§T) → write `manifest.json` last into staging → durability
fences (F_FULLFSYNC members, staging dir fsync) → derive the final generation
name internally → exclusive promotion (`renameatx_np(RENAME_EXCL)`) → parent
directory fsync (also on the occupied path, before reporting
`generation-destination-occupied`) → honest report
`{ok, committed, durabilityComplete, generationPath, contentHash, blockers[]}`.

COMMIT re-hashes **every member required by the declared version (§J) and
every member actually staged**; a required member that was never staged, or a
staged entry the session did not create, is a refusal — the quantifier is the
version's required set, not merely "what was written".

Within staging, `manifest.json` is still written last, preserving the
manifest-last doctrine; the load-bearing crash-safety mechanism for staged
publication is the atomic exclusive promotion — a final-name directory never
exists without its complete verified manifest. Refusals are returned as
`ok:false` results with blocker codes (they resolve; they do not throw).
Every caller must treat any result without `committed === true` as a
**non-success requiring explicit resolution** — never as silent success. For
`generation-destination-occupied` specifically, the §P case B/C/D/I occupant
verification is that resolution (it may conclude idempotent `deduped`
success); every other blocker resolves as failure.

The non-macOS arm fails closed (`…-unsupported-platform`), consistent with the
existing trusted module.

## O. Renderer authority exclusions

The trusted side re-validates the renderer-supplied `chatId` against the §B
charset and shape rules at BEGIN, before any path construction; the renderer's
string is an input to validation, never a path fragment taken on trust.

The renderer never supplies:

- the final generation destination or any part of it beyond `chatId`;
- any member path or filename (member enum only; fixed name map);
- any package path;
- any CAS source path (asset bytes are located by the trusted side from
  verified manifest sha identities and never cross IPC);
- an authoritative contentHash (§U).

## P. Complete case model

| Case | Behavior |
| --- | --- |
| A. target absent | Stage, verify, promote; report `created`. |
| B. exact VALID occupant, same derived contentHash | Fence parent, report occupied; caller verifies occupant and reports idempotent `deduped` success. |
| C. corrupt occupant at target | Refuse (`generation-destination-occupied`); caller verification classifies occupant corrupt → surfaced diagnostic; never overwritten. Documented escape hatch: explicit manual operator removal, with diagnostics printing the exact path. |
| D. partial (manifest-less) occupant at target | As C (`generation-partial`). Staged publication cannot create new partial final names. |
| E. two writers race for the same generation | Exclusive promotion admits one; the loser takes the occupied path (parent fenced) and resolves via occupant verification to `deduped` or a corrupt-occupant refusal. |
| F. two writers create different generations for one chat | Both succeed under different names; freshness selects. |
| G. crash before manifest / before promotion | Residue only under the reserved staging prefix; the final namespace is untouched. |
| H. crash after promotion, before the parent fence | The generation may vanish wholly after power loss — never partially. Reported honestly: `durabilityComplete` is true only after the parent fence returns. |
| I. target occupied by a VALID package with a **different** identity | Occupant verification classifies it as a foreign valid package (possible via the `X.g<64hex>`-literal-chatId legacy collision, or manual manipulation). Refused and surfaced as `generation-destination-foreign`; never overwritten; the operator escape hatch of case C applies. |

## Q. Token / session concurrency semantics

- Session state is in-process: token → {chatId, staging directory handle,
  tracked member list}. **Every access happens under one lock**; Tauri async
  commands execute concurrently and the map is shared mutable state.
- Member writes are **append-only ordered sequences**: a member may be
  delivered in one call (the common, KB-scale case) or as multiple bounded
  append calls (§S bounds). Rewrites and seeks are refused; append calls for
  **different** members may interleave freely; the at-most-once invariant
  applies to the member's append stream as a whole, with the open-check and
  append performed under the same lock acquisition. There is no explicit
  seal call: a member is sealed by COMMIT, whose verification re-hash of the
  final staged bytes is the seal. Chunked delivery is the T1.2.3-resolved
  generalization that prevents the transport from defining package semantics
  (Amendment A2).
- **COMMIT atomically consumes the session** — the token is removed from the
  map under the lock **before** any hashing, validation, copying, or
  promotion. A second COMMIT, a concurrent ABORT, or any post-commit call on
  that token finds no session.
- ABORT of an unknown or already-consumed token is a **benign no-op** (a
  `finally { abort }` caller shape must be harmless after a successful
  commit).
- Sessions are bounded in number; when the cap is reached, BEGIN **refuses
  with a blocker** (`generation-staging-sessions-exhausted`) — it never
  implicitly evicts a live session.
- Sessions carry an **idle timeout** measured from the last successful
  command on that token (an implementation-level operational constant, not a
  product value): an evicted session is aborted and its staging cleaned, so
  the cap governs concurrency, not lifetime, and a webview reload cannot
  permanently wedge publication. Eviction takes the same lock as every other
  session access, so it cannot race an in-flight append or commit. A session
  abandoned between BEGIN and COMMIT is cleaned by this eviction path (§X
  governs post-consumption refusals; §Q eviction governs abandonment).

## R. Staging location, prefix, discovery filtering

Staging directories live **inside** `archive/packages/` under the reserved
prefix:

```text
archive/packages/.h2o-genstage-<token>/
```

- Same directory as promotion targets → exclusive promotion needs no
  cross-directory primitive and stays atomic.
- The prefix is a single shared constant: reserved (refused) by the trusted
  path-component validation, and excluded by JS discovery/inventory filtering.
  The existing inventory's `.h2ochat` suffix filter already skips such
  entries; its `archive-entry-not-package` warning is the residue signal.
- Crash residue is bounded per run by the session cap, is honestly unbounded
  across repeated crash cycles, and is reclaimed only by a future explicitly
  authorized janitor — never automatically in M05.

## S. Commit gate ⊇ governed verifier

Standing invariant: **the commit gate's refusal set is a superset of the
governed v1/v2 verifier's blocker set for published packages, as that
verifier stands after the §D reader supersession** (the pre-M05 dirname
blocker is replaced by the §D classification; every other blocker remains
and must be unreachable). Nothing the trusted writer publishes may fail the
governed reader. This includes, at minimum:

- manifest envelope validity: parseable JSON, `schema ==
  "h2o.savedChatPackage"`, coherent version triple (§V), required-member
  completeness (§J);
- `manifest.files` descriptor equality (key-matched `snapshot` / `markdown` /
  `html`; re-hashed sha256 + byteLength);
- staged-snapshot cross-checks via bounded streaming field extraction:
  `snapshot.chatId == manifest.chatId == BEGIN chatId`,
  `snapshot.snapshotId == manifest.snapshotId`, and snapshot asset references
  ⊆ manifest assets;
- full reader-contract asset descriptor validation: package path exactly
  `assets/<sha256-…>.<ext>`, non-empty `ext` equal to the path's extension,
  non-empty `mimeType`, finite `byteLength`; descriptor identity verified
  against actual CAS bytes during copy;
- **descriptor uniqueness**: no two descriptors may share a `path` **or** a
  `sha256`. The sanctioned writer already produces unique-by-sha descriptor
  sets by construction (`manifestAssets = Object.keys(manifestBySha)`,
  `saved-chat-package-assets.tauri.js:391`), so this refuses nothing the
  live writer can produce; the reader continues to accept historical
  duplicate-bearing packages (its duplicate check stays a warning). This
  rule is also the technical bound that caps trusted-side copy amplification
  (see the T1.2.3 evidence §4.5);
- **renderer-output scans** (v2): bounded streaming scans — not structured
  parsing — of the staged `chat.html` and of the snapshot's html content
  fields for (i) `data:image` residue and (ii) `assets/sha256-…` references
  not present in the manifest's declared path set. These make the governed
  verifier's `data-image-residue-v2`, `renderer-asset-ref-not-in-manifest`
  and `renderer-asset-ref-missing-file` blockers unreachable (declared
  assets are always staged by §W; undeclared references and residue are
  refused here);
- internally derived contentHash equality (§T);
- the staging directory containing **no entry the session did not create**
  (checked at commit via directory enumeration of the staging handle).

A test enumerates the governed verifier's v1/v2 blocker codes and proves each
is unreachable for a committed generation.

## T. Trusted derivation of contentHash and destination

Rust derives the package `contentHash` itself from the staged bytes and the
manifest's asset list, using the frozen §L constructions. The v2 pre-image
consumes the **raw cleaned descriptor `sha256` strings exactly as written in
the manifest** (per §L) — never a normalized form; normalization exists only
to locate CAS objects, and by §S's grammar validation the raw and normalized
forms coincide for every publishable manifest. The final generation name
derives from Rust's **own** digest. The manifest's `contentHash` must equal
the derived value or commit refuses. The caller can never name a destination,
directly or through a hash parameter.

## U. expectedContentHash is assertion-only

`expectedContentHash`, when supplied at COMMIT, is compared to the derived
value and can only cause a refusal (`generation-expected-hash-mismatch`). It
never selects, overrides, or names anything.

## V. Coherent version triples

| Version | Required triple |
| --- | --- |
| v1 | `schemaVersion: 1`, **no** `payloadVersion` key, `assets` empty |
| v2 | `schemaVersion: 2`, `payloadVersion: 2`, `assets` non-empty |

Anything else — including hybrids such as `schemaVersion: 1` with
`payloadVersion: 2`, and any `schemaVersion: 3` manifest — is refused at
commit. v3 publication is not admitted by M05; admitting it later is a live-v3
activation decision, not a gate relaxation.

## W. Assets copied from canonical CAS by trusted code

Package asset member bytes never cross IPC at publication. For each validated
descriptor, the trusted side locates the canonical CAS object from the sha
identity (`archive/assets/<aa>/sha256-<hex>`), streams it into the staging
`assets/` member with incremental SHA-256, and requires the digest and length
to equal the descriptor's. A missing or mismatched CAS object refuses the
commit. Per DP-PRE-M05-ASSET-BOUND's compatibility rule, no ingest bound is
applied at copy time: a historical oversized CAS object remains packageable.

## X. Cleanup semantics (Supervisor Amendment A1)

Rule: once COMMIT has consumed the session, **every path that returns without
a successful promotion cleans its own staging before returning** — tracked
member files, the staged `assets/` contents it created, and the staging
directory itself. Successful promotion is the only outcome that transfers the
staged tree out of cleanup scope (it becomes the published generation). The
rule therefore covers, without needing enumeration: invalid manifest, missing
member, member hash mismatch, incoherent version triple, asset descriptor
refusal, descriptor-uniqueness refusal, renderer-scan refusal, CAS
mismatch/missing, contentHash mismatch, expectedContentHash refusal,
undeclared staging entries, name-length refusal, member/staging fsync
failures, **and any promotion failure other than success** — including the
occupied path: the losing writer cleans its own staging immediately upon the
occupied refusal (occupant verification is the caller's subsequent step and
never delays cleanup). ABORT cannot run on a consumed token, so this rule is
the sole cleanup authority after consumption. Normal rejected commits do not
accumulate residue. (Sessions abandoned before COMMIT are cleaned by §Q idle
eviction, not by this rule.)

If cleanup itself fails, the result reports the original refusal **and** the
cleanup failure honestly (`blockers` carries both; `committed`/`durabilityComplete`
truth is never altered by cleanup outcomes), and the residue is surfaced by
diagnostics. Crash/power-loss remains the only legitimate source of persistent
staging residue.

## Y. Exclusions

M05 performs no SQLite migration and allocates no v22; adds no capability
scope; changes nothing Sync-owned; does not activate live v3; does not touch
`$HOME/H2O Studio Sync`; does not modify Chrome surfaces beyond none.

## Z. Mission boundaries

- **M06** owns GC/reclamation: stale-generation pruning, staging-residue
  reclamation, CAS garbage collection, and any delete authority. M06 must
  honor §F's content-stale vs format-stale distinction and §C's grandfathering.
- **M07** owns storage ↔ sync transport.
- **M08** owns ZIP/export container work.
- Broad DB schema work requires separate cross-lane migration authority (D9).

## Member bounds (frozen by T1.2.3)

Authority and full evidence: the
[T1.2.3 evidence document](../../../release-evidence/2026-08-26/saved-chat-storage-m05-t123-member-bound-evidence.md).
Summary of the frozen policy:

| Concern | Bound | Class |
| --- | --- | --- |
| `snapshot.json` (v1/v2 publication) | **No new semantic cap.** Existing governed caps continue to govern exactly where they already apply (the 8 MiB logical cap is v3 write authority and is *not* extended to v1/v2). | — |
| `chat.md`, `chat.html` | **No semantic cap.** Streamed and hashed — never parsed as structured documents; commit additionally performs the bounded streaming residue/reference **scans** over `chat.html` that the §S superset invariant requires (memory O(scan window), not O(member)). | — |
| WRITE MEMBER per-call body | 8 MiB per append call (members of any size arrive as N calls) | Transport/allocation constant — not product semantics; revisable without compatibility impact |
| COMMIT manifest body | 64 MiB allocation-safety parse bound | Implementation safety, ≥ 4 orders of magnitude above all committed/runtime evidence; escalation rule below |
| Asset descriptor count | **No fixed count limit.** Bounded by the manifest allocation bound, per-descriptor validation, and CAS existence verification. | — |
| Generation basename | The real filesystem component limit, read at the opened archive parent via descriptor-relative platform authority (`fpathconf(_PC_NAME_MAX)`); fail closed if unavailable. No hardcoded 240/255. **Honest headroom note**: the 74-byte generation suffix (`.g` + 64 hex + `.h2ochat`) versus legacy's 8 bytes means a chatId longer than `NAME_MAX − 74` bytes (181 on a 255-byte filesystem) cannot receive a generation even though the same chatId up to `NAME_MAX − 8` could receive a legacy name pre-M05 — see the T1.2.3 evidence §4.6 for why no real state approaches this and the standing escalation that fires before any real one is refused. | Filesystem fact + evidence-classified headroom consequence |
| Snapshot commit-gate parse | Bounded **streaming** field extraction (memory ∝ extracted fields, not member size) | Implementation technique, no size cap |

Standing escalation rule: if any measured or reported real package state ever
approaches a transport/allocation constant, or a proposed change would turn
one into a semantic package limit, a Human Decision Point
(`DP-M05-<MEMBER>-BOUND`) is raised **before** any refusal ships. No new
product-size boundary is ever hidden inside an implementation constant.
