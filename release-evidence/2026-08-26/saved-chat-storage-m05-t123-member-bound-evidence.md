# M05 T1.2.3 — Governed v1/v2 Package-Member Bound Derivation

Date: 2026-08-26

Lane: 🗃️ L-SAVED-CHAT-STORAGE — Mission M05, Phase 1, Task T1.2.3

Status: Evidence and frozen bound policy for the staged trusted publication
protocol (T1.2.1 prerequisite per Supervisor Amendment A2).

Repo state inspected: `28f1cc53091e402b6c9a9bee1f7501d04f69d6bb` (HEAD = main
= lane = both remotes).

## 1. Method

For each live v1/v2 persistent member (`snapshot.json`, `chat.md`,
`chat.html`, `manifest.json`) this task establishes: existing normative
bounds; existing read bounds and whether they are semantic authority or
implementation safety; measured repository fixture ranges; committed runtime
evidence; expansion behavior; IPC/allocation implications; and the proposed
trusted-side enforcement point. The Compatibility Rule applied throughout: an
implementation bound may be baselined without a Human Decision Point only if
it demonstrably does not reduce currently supported valid v1/v2 package
states.

## 2. Existing authority census (verified at HEAD)

| Authority | Value | Scope | Classification |
| --- | --- | --- | --- |
| DP-M03-C logical snapshot cap (`LOGICAL_SNAPSHOT_CAP_BYTES`, codec:30) | 8 MiB | **v3 only**: enforced at v3 build (`saved-chat-package-v1.tauri.js:1073-1076`) and on v3 read paths | Normative for v3. **Not v1/v2 authority** — `buildSavedChatPackageV1` applies no snapshot cap; v1/v2 read paths are explicitly "historical, unchanged". |
| DP-PRE-M05-ASSET-BOUND | 32 MiB decoded per newly **ingested** asset | CAS ingest (JS + Rust) | Normative; explicitly an ingest ceiling, never a read/packaging ceiling — historical oversized CAS objects must remain packageable. |
| Importer/restore/relink `SNAPSHOT_READ_CAP` (importer:66, restore:39, relink:28) | 8 Mi **UTF-16 code units** (`.slice`, not bytes) | Recovery-flow snapshot reads | **Implementation safety, not semantic authority**: implemented as `String(t).slice(0, CAP)` truncation before `JSON.parse` — a larger snapshot fails parse in these flows, but nothing declares it invalid; writer and diagnostics accept it. |
| Inspector `MARKDOWN_READ_CAP` (inspector:52) | 64 KiB | chat.md preview display | Display truncation only — explicitly a preview cap. |
| Request inbox `DEFAULT_SIZE_CAP_BYTES` (inbox:34) | 128 KiB | Request envelope files | Different artifact class; not package-member authority. |
| Diagnostics / verifier | none | v1/v2 member reads (`fsReadBytes`, full-file) | No size authority; reads whole members unbounded. |
| Writers (`writeSavedChatPackageV1`) | none | v1/v2 member writes | No member size refusal exists today. |
| Filename component | filesystem NAME_MAX | archive parent | Filesystem fact; no repo-defined number exists (correct — none should). |

Conclusion: **no normative size authority exists today for any v1/v2 member at
write time.** The only member-size authorities in the lane are v3-scoped
(snapshot 8 MiB) or CAS-ingest-scoped (32 MiB/asset).

## 3. Measured evidence

### 3.1 Tracked fixtures (all committed `.h2ochat` fixture packages at HEAD)

| Fixture | manifest.json | snapshot.json | chat.md | chat.html | assets |
| --- | --- | --- | --- | --- | --- |
| `tools/validation/fixtures/saved-chat-archive/import-recovery/i-harness-source.h2ochat` (v1-family with renderers) | 1,692 B | 1,706 B | 173 B | 271 B | — |
| `tools/validation/fixtures/saved-chat-archive/v3/t06-canonical-assets.h2ochat` | 1,082 B | 1,143 B | n/a (v3) | n/a (v3) | 1 × 20 B |
| `tools/validation/fixtures/saved-chat-archive/v3/gzip/t06-canonical-assets.h2ochat` | 1,208 B | 497 B (gzip physical) | n/a | n/a | 1 × 20 B |
| `release-evidence/2026-07-15/chat-atlas-cv3-3-s1-v51/manifest.json` (bundle-family manifest) | 2,873 B | — | — | — | — |

Fixture maxima: manifest 2,873 B; snapshot 1,706 B; chat.md 173 B;
chat.html 271 B.

### 3.2 Committed runtime evidence

`release-evidence/2026-08-25/saved-chat-storage-m03-t06-desktop-runtime-proof.md`
(real Desktop WebView run): logical `snapshot.json` 1,143 B; gzip physical
497 B (the runtime proof records no manifest byteLength; committed manifests
of the same package family are the 1.0–1.2 KB fixtures). The M02 T07 measured
acceptance records
whole-package app-owned byte totals in the same low-KB class (reductions of
2,869 B were material at that scale).

Largest committed binary in the surveyed evidence set (release-evidence) is
a 227 KB zip — not a package member. **No committed or runtime-recorded member
has ever exceeded 3 KB.** Fixture maxima are explicitly NOT treated as product
limits; they calibrate how far a safety constant sits from reality.

### 3.3 Expansion behavior (renderer relationship, from source)

`renderChatMarkdownV1` (package-v1:524-542): fixed header lines + per-message
`## role N` + raw `contentText`. Size ≈ Σ contentText + ~40 B/message — the
same text the snapshot already carries JSON-escaped alongside `contentHtml`
and metadata, so chat.md is characteristically **smaller** than snapshot
(fixture: 173 B vs 1,706 B).

`renderChatHtmlV1` (package-v1:544-588): ~1.1 KB fixed head/CSP/style + per
message: sanitized `contentHtml` embedded **as-is**, or
`<pre>escapeHtml(contentText)</pre>`. Entity escaping expands only
`& < > " '` (≤ 6 B/char worst-case adversarial text, ~1.0–1.1× typical);
sanitized HTML embeds at 1×. So chat.html = Θ(snapshot content), small
constant, adversarial ceiling ≈ 6× the text portion + fixed overhead
(fixture: 271 B vs 1,706 B — sub-1×).

`manifest.json`: fixed base (~1 KB with generator/source/store/provenance) +
one `files` descriptor per member + ~200–260 B per asset descriptor
(path/sha/byteLength/ext/mimeType). Growth is linear in **asset count** only.

### 3.4 IPC / allocation precedent

The existing trusted commands accept one raw body (`InvokeBody::Raw` |
JSON byte array) plus a percent-encoded JSON options header
(`archive_durable_write.rs` `body_len`/`body_bytes`). DP-PRE-M05's accepted
allocation analysis: a body crosses the boundary ~3× (renderer buffer, IPC
body, Rust clone) — 32 MiB body ⇒ ~96 MB transient peak, accepted for a
desktop app; `body_len` refuses before the clone. This is the calibrated
precedent scale for per-call allocation in the trust domain. No in-repo
authority documents a hard Tauri IPC body ceiling; the governing concern is
per-call allocation, which per-call bounds address.

## 4. Per-member determination

### 4.1 `snapshot.json` (v1/v2 publication)

1. Existing normative bound: **none** (v3's 8 MiB is v3-only; supervisor
   A2 confirms no accepted assumption it governs v1/v2).
2. Existing read bound: 8 MiB truncation in importer/restore/relink.
3. That read bound is **implementation safety**, not semantic authority
   (truncate-then-parse; diagnostics and the writer accept larger).
   Honest compatibility note: a v1/v2 snapshot beyond ~8 Mi code units is
   *mixed-support* today — publishable and verifiable, but not consumable by
   the recovery flows as written (their truncation boundary is measured in
   UTF-16 code units, so the byte boundary varies with content).
4. Fixture range: 497–1,706 B. 5. Runtime: 1,143 B.
6. Expansion: source member (drives the others).
7. IPC: delivered via bounded append calls; hashed streaming; commit-gate
   field extraction (chatId / snapshotId / asset refs) via **streaming**
   partial deserialization — memory ∝ extracted fields, not member size.
8. Enforcement point: **no semantic cap at publication.** Anything the live
   writer can produce today remains publishable. → non-breaking by
   construction; no DP required.

### 4.2 `chat.md`

1. Normative: none. 2. Read bound: 64 KiB inspector preview (display only).
3. Implementation safety only. 4. Fixture: 173 B. 5. Runtime: none recorded.
6. Expansion: ≤ snapshot text content + ~40 B/message.
7. IPC: bounded append calls; streamed + hashed; never parsed.
8. Enforcement: **no semantic cap.** Non-breaking by construction.

### 4.3 `chat.html`

Identical determination to chat.md (fixture 271 B; expansion Θ(snapshot),
adversarial ceiling ≈ 6× text + ~1.1 KB fixed). **No semantic cap.**
Non-breaking by construction.

### 4.4 `manifest.json`

1. Normative: none. 2. Read bound: none (diagnostics parses fully).
3. n/a. 4. Fixture range: 1,082–2,873 B. 5. Runtime: ~1 KB.
6. Growth: linear in asset count (~200–260 B/descriptor) over a ~1 KB base.
7. IPC: the one member the trusted side must **fully parse** (descriptors
   drive verification and CAS copying) — allocation ∝ size, so it needs an
   allocation-safety bound; parse strategy is streaming over the assets array
   (memory ∝ sha list, ~⅓ of body size), with the body itself the dominant
   allocation.
8. Enforcement: **64 MiB allocation-safety parse bound** at COMMIT.

Non-breaking demonstration for 64 MiB:

- ≥ 22,000× the largest tracked manifest (2,873 B) and ≥ 4 orders of
  magnitude above every committed and runtime-recorded manifest;
- at ~250 B/descriptor it admits ≈ 260,000 asset descriptors in one package —
  against evidence of ≤ 2 per package. (Note: the reader does **not** require
  descriptor distinctness — duplicates are only a warning,
  `manifest-asset-duplicate`, diagnostics:996. Distinctness at *publication*
  comes from the commit gate's uniqueness rule, §4.5, which is
  writer-conformant: the sanctioned writer builds its descriptor set as
  `Object.keys(manifestBySha)` — unique by construction —
  `saved-chat-package-assets.tauri.js:391`.);
- scale-calibrated to the accepted DP-PRE-M05 allocation precedent (2× the
  32 MiB single-body authority; same ~3-copy transient model ⇒ ~192 MB
  worst-case commit peak, still desktop-acceptable, reached only by a
  pathological input no real state approaches);
- classified as an **implementation allocation bound, not a product ceiling**:
  it is recorded here with the standing escalation rule — if any real package
  state is ever measured or reported within an order of magnitude of it, or
  any change would convert it into a semantic package limit,
  `DP-M05-MANIFEST-BOUND` is raised before any refusal ships. In-principle
  caveat stated openly: a hypothetical quarter-million-asset chat would be
  refused; no such state exists in any committed fixture, runtime evidence,
  or historical record, and nothing in the product generates one.

### 4.5 Asset descriptor count and copy amplification

**No fixed count limit** (supervisor directive honored). Technical necessity
WAS found for one uniqueness rule, adopted instead of a count:

Adversarial review demonstrated that without it, one 32 MiB CAS object could
be referenced by ~260,000 distinct descriptor paths (same sha, varying `ext`)
inside a single 64 MiB manifest, and the trusted copier would attempt ~8 TB
of staging writes from one COMMIT — a ~130,000× amplification that the
"renderer can already fill the disk" equivalence does not cover (there, the
renderer supplies every byte it writes; here, one byte in the manifest
demands ~32 MiB of trusted-side work). Aggravated by COMMIT consuming the
token first: such a commit would be neither abortable nor evictable.

Adopted rule (contract §S): **within one manifest, descriptor `path` values
must be unique and descriptor `sha256` values must be unique.** Grounds:

- writer-conformant, hence non-breaking under the Compatibility Rule as it
  applies to publication: the only sanctioned producer builds descriptors
  keyed by sha (`Object.keys(manifestBySha)`,
  `saved-chat-package-assets.tauri.js:391`), so no writer-producible state is
  refused; a duplicate-bearing manifest was never *publishable* through any
  sanctioned path, so the publishable-state set is unchanged;
- the **reader is untouched**: historical duplicate-bearing packages remain
  readable and verifiable (duplicate check remains a warning), and §L's
  non-dedupe hash math remains frozen for them;
- with uniqueness enforced, per-commit staged asset bytes ≤ Σ of the distinct
  referenced CAS objects' sizes ≤ total existing CAS bytes — i.e. bounded by
  what is already on disk (≤ ~2× transient disk in the worst case). The
  disk-equivalence argument is valid **under this rule** (and only under it);
  the remaining bounds are the manifest allocation bound, per-descriptor
  validation, and per-asset CAS existence + streamed hash verification.

### 4.6 Generation basename

No number is adopted. The trusted publisher reads the real component
constraint at the opened archive parent via descriptor-relative platform
authority (`fpathconf(_PC_NAME_MAX)`; fail closed if unanswerable) at BEGIN
and re-checks at COMMIT. chatId is ASCII-only (`safePackageDirName`), so byte
and character counts coincide. The Export lane's temp-suffix derivation is an
Export-lane concern and does not lower archive naming capability (advisory
diagnostic only; the Export lane receives its own governed refusal in P4).

**Headroom reduction, stated honestly.** The generation suffix costs 74 bytes
(`.g` + 64 hex + `.h2ochat`) where legacy naming cost 8. On a 255-byte
component filesystem (APFS), a chatId of 182–247 bytes was legacy-namable
pre-M05 but cannot receive a generation; post-M05 a NEW chat with such an id
could not receive its first package at all. Compatibility classification:

- no length bound exists in `safePackageDirName` (charset only), so the
  reduction is real *in principle*;
- the actual chatId domain is platform conversation identifiers: every
  committed fixture, runtime-evidence and release-evidence chatId is ≤ ~40
  bytes (UUID/`imported-`/`m03t06-…` class); nothing within 4× of 181 bytes
  exists in any recorded state;
- therefore classified **non-breaking on evidence**, with the standing
  escalation rule: if a real chatId within an order of magnitude of the
  limit is ever observed, `DP-M05-BASENAME-BOUND` (e.g. hashed-chatId
  fallback naming) is raised before any refusal ships. The refusal itself is
  a first-class blocker (`generation-name-exceeds-filesystem-limit`) plus the
  coverage state "legacy preserved, cannot refresh" / "not coverable" — never
  a silent failure.

**Fail-closed classification.** `fpathconf` returning no answer refuses
publication rather than guessing a limit. On the supported platform
(macOS/APFS) `_PC_NAME_MAX` on an open directory descriptor answers; the
fail-closed arm is a safety posture consistent with the module family's
existing unsupported-platform behavior, not a reachable reduction of any
currently-working state.

## 5. Transport/allocation vs semantic bounds (the A2 resolution)

The staged protocol separates the two cleanly:

- **Transport/allocation (B-class)** — per-call constants protecting memory,
  never member semantics: WRITE MEMBER accepts each member as an **append-only
  ordered sequence of bounded calls** (8 MiB per call — equal to the largest
  existing governed member authority in the lane, and comfortably inside the
  accepted ~3-copy allocation precedent). A member of any size crosses IPC as
  N calls; per-call allocation stays O(8 MiB); hashes are computed
  incrementally; no one-shot body ever defines a member ceiling. The COMMIT
  manifest body remains one-shot under §4.4's allocation bound (evidence
  places every real manifest 4+ orders of magnitude below it); if that margin
  ever narrows, the same chunked mechanism extends to the manifest before any
  product limit appears.
- **Semantic (A-class)** — package acceptance rules: the version triples,
  required members, descriptor equality, CAS verification, derived
  contentHash. **M05 adds no new semantic size limit to any v1/v2 member.**

This is the exact inversion the supervisor required: IPC convenience does not
define package semantics; the one place semantics could have leaked in
(one-shot member bodies) is removed by the append-sequence design, at the
cost of one repeatable command instead of a strict at-most-once write — the
generalization recorded in contract §Q.

## 6. Compatibility verdict

| Member / concern | Proposed bound | DP required? |
| --- | --- | --- |
| snapshot.json (v1/v2) | none (semantic); streaming parse technique | **No** — nothing publishable today becomes unpublishable |
| chat.md | none | **No** |
| chat.html | none | **No** |
| manifest.json | 64 MiB allocation-safety parse bound | **No** — implementation-safety classification demonstrated (§4.4), escalation rule standing |
| per-call member body | 8 MiB transport constant | **No** — transport only; members of any size supported via N calls |
| asset count | none (descriptor `path`/`sha256` uniqueness rule instead — §4.5) | **No** — writer-conformant; refuses nothing the sanctioned writer can produce; reader untouched |
| basename | filesystem fact via `fpathconf`; 74-byte generation-suffix headroom consequence recorded (§4.6) | **No on evidence** — no recorded chatId within 4× of the reduced limit; escalation rule stands |

No Human Decision Point is required by this derivation. Every accepted bound
is either absent (no new limit), a transport constant that cannot restrict
package states, a filesystem fact, or an allocation-safety constant with
recorded evidence, an open in-principle caveat, and a standing escalation
rule that converts any future real approach to it into a DP before refusal.
