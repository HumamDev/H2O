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
8. Enforcement: **none — no semantic and no allocation ceiling.** SUPERSEDED
   by Reconciliation R1: `manifest.json` is now a **staged member** like every
   other member, delivered through the same bounded per-chunk append path and
   read back from the staging descriptor at COMMIT. The previously proposed
   64 MiB one-shot COMMIT-body parse bound is **WITHDRAWN**, for three
   independently sufficient reasons recorded in §7 below.

### 4.4.1 Why the 64 MiB manifest ceiling was withdrawn (R1)

1. **It would have created a product boundary that does not exist at HEAD.**
   v1/v2 has no semantic manifest ceiling anywhere — not in the writer, not in
   the verifier. Any fixed refusal value, however generous, converts "no limit"
   into "a limit", which is exactly what the Compatibility Rule and the
   standing escalation rule forbid doing inside an implementation constant.
   The prior justification leaned on the bound being ~4 orders of magnitude
   above observed evidence; distance from evidence is a *risk* argument, not a
   *compatibility* argument, and it does not license inventing the boundary.
2. **It did not deliver the protection it appeared to.** Verified against the
   pinned framework source: an invoke body is fully materialized before any
   command body executes (WebKit `NSData` → `wry` scheme handler →
   `tauri::ipc::protocol`). A command-side length check therefore cannot
   refuse admission of a large body; the existing `body_len()` check prevents
   exactly one subsequent clone, which is what its own doc comment claims.
3. **It gave `manifest.json` a different verification path from every other
   governed member.** As a staged member it is read back through the same
   descriptor-relative, `O_NOFOLLOW`, opened-fd discipline as snapshot,
   markdown and html — one verification path, not two.

Consequence for allocation safety: peak memory is governed by the per-chunk
transport constant plus staging, not by a manifest ceiling. See §5 for what
that constant does and does not do.

### 4.5 Asset descriptor count and copy amplification

**No fixed count limit** (supervisor directive honored). Technical necessity
WAS found for one uniqueness rule, adopted instead of a count:

Adversarial review demonstrated that without it, one 32 MiB CAS object could
be referenced by ~260,000 distinct descriptor paths (same sha, varying `ext`)
inside one manifest, and the trusted copier would attempt to write one full
copy per descriptor — unbounded, since R1 withdrew the manifest ceiling that
the original arithmetic assumed. The amplification factor is simply the
descriptor count: each duplicate reference costs a full object copy while
costing the caller a few hundred manifest bytes. This is an amplification the
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
- therefore classified **non-breaking on evidence**: every chatId in every
  committed fixture, runtime proof and release-evidence artifact is ≤ ~40
  bytes, against a reduced limit of 181 — a margin of more than 4×. The
  standing escalation trigger is stated to match that evidence: if a real
  chatId is ever observed **at or above one quarter of the reduced limit**
  (~45 bytes), `DP-M05-BASENAME-BOUND` (e.g. hashed-chatId fallback naming)
  is raised before any refusal ships. No observed value reaches that trigger
  today, which is why this derivation requires no Decision Point now. The refusal itself is
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
  incrementally; no one-shot body ever defines a member ceiling. **All four
  members, `manifest.json` included, use this path** (R1) — COMMIT carries no
  large body at all, so there is no remaining one-shot admission point and no
  member has a ceiling of any kind.

  What the constant actually does, stated honestly: the framework materializes
  an invoke body *before* the command runs, so a command-side check cannot
  refuse admission. The per-chunk constant bounds the peak of a **cooperative**
  writer and prevents one further copy. It is not admission control against a
  hostile caller, and no WebKit-layer body ceiling was establishable from
  source (carried as an open question).

  Cumulative/session accounting is permitted for **reporting and staging-disk
  observability only**. It must never become a refusal threshold: an aggregate
  cap on members, package or assets would be precisely a new semantic package
  limit hidden inside an implementation constant, requiring
  `DP-M05-<MEMBER>-BOUND` first.
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
| manifest.json | **none** — staged member; ceiling withdrawn (§4.4.1) | **No** |
| per-call member chunk | 8 MiB transport constant | **No** — transport only; members of any size supported via N calls |
| aggregate / cumulative | **none** — tracking permitted, refusal thresholds forbidden | **No** — any aggregate threshold would be a new semantic limit → DP first |
| asset count | none (descriptor `path`/`sha256` uniqueness rule instead — §4.5) | **No** — writer-conformant; refuses nothing the sanctioned writer can produce; reader untouched |
| basename | filesystem fact via `fpathconf`; 74-byte generation-suffix headroom consequence recorded (§4.6) | **No on evidence** — no recorded chatId within 4× of the reduced limit; escalation rule stands |

No Human Decision Point is required by this derivation. Every accepted bound
is either absent (no new limit), a transport constant that cannot restrict
package states, a filesystem fact, or an allocation-safety constant with
recorded evidence, an open in-principle caveat, and a standing escalation
rule that converts any future real approach to it into a DP before refusal.

---

# Addendum — M05 P1 Authority Reconciliation (2026-08-27)

Incorporates a parallel fixed-SHA reconnaissance against `28f1cc53`, verified
independently against source before adoption. Recorded here because several
findings changed frozen contract text; the contract carries the rules, this
addendum carries the evidence and the classifications.

## A1. Verifier-blocker classification (R11)

Every proposed publication invariant was classified before adoption. Nothing
was imported wholesale.

| Proposed invariant | Class | Disposition |
| --- | --- | --- |
| All enumerated v1/v2 verifier blockers (`package-path-*`, `manifest-*`, `snapshot-*`, `chat-id-mismatch`, `content-hash-mismatch`, the eight `manifest-asset-*`, the five `package-asset-*`, …) | **A** | Gate makes each unreachable; complete enumerated list is the T1.2.2 test input |
| Descriptor `path` + `sha256` uniqueness within one manifest | **B** | Adopted, commit-gate only. Writer builds descriptors keyed by sha (unique by construction); path is a pure function of that key. Reader unchanged — duplicates stay a **warning**, so historical/imported duplicate-bearing packages remain valid |
| `sanitized: true` marker requirement | **B**, value-free | **Not adopted.** No verifier requirement exists; the writer stamps the flag unconditionally, so requiring it proves nothing |
| No `data:image` residue in **chat.md** | **C** | **Rejected.** The verifier never reads chat.md at all, and the renderer emits raw `contentText` — a chat merely *discussing* data URIs would be newly refused |
| Prohibit `https:` / `file:` / `data:` image sources in chat.html | **C** | **Rejected.** Contradicts the writer's own emitted CSP (`img-src data: file: https:`) and the materializer's deliberate leave-remote-inline behavior |
| New total-package byte limit | **C** | **Rejected.** No total-size check exists anywhere |
| New asset-count limit | **C** | **Rejected.** The verifier counts but never compares a threshold |
| New aggregate-asset-byte limit | **C** | **Rejected.** Only per-asset equality is checked |
| Extend the v3 8 MiB snapshot bound to v1/v2 | **C** | **Rejected.** v1/v2 read path is explicitly unbounded and the v1/v2 writer has no snapshot check; an existing >8 MiB package would be newly refused |

### A1.1 The RESIDUAL class — why the superset invariant is scoped

`data-image-residue-v2` and the three `renderer-asset-ref-*` codes are class A
blockers, but they are **not** writer invariants. Two verified
counterexamples, both producible by the sanctioned writer today:

1. the materializer supports only `png|jpe?g|gif|webp` and by design leaves any
   other `data:image/…` URI inline; one such image alongside one PNG (which
   forces v2) yields a package the verifier blocks;
2. a chat **title** containing the literal text `data:image/` reaches
   `chat.html` intact, because entity escaping does not touch it.

Such packages publish successfully today and merely verify as blocked.
Enforcing these at COMMIT would convert an existing reader finding into a
**failed user save on real content** — a class-C change in effect. They are
therefore excluded from the commit gate as the `RESIDUAL` class (contract §S).
M05 neither creates nor repairs this pre-existing condition. Promoting any of
them to a publication refusal requires `DP-M05-RESIDUE-REFUSAL` with
reachability evidence from real captures.

## A2. Renderer write authority over published generations (R3)

Verified: the archive capability grants `fs:allow-write-file` over
`$APPLOCALDATA/archive/**`, and that single entry is the app's **only** grant
of `plugin:fs|write_file`, `|open` and `|write`. A renderer can therefore
rewrite or truncate members of an already-published generation. Immutability is
not achieved by publishing correctly; it requires the capability cutover frozen
as the G1 prerequisites in the contract.

Census result: after migrating package writes to the trusted protocol, the
**required renderer write set under `archive/` is the empty set** — the CAS
already writes through the two trusted commands, and request receipts are
written under `$HOME`. So the narrowing is *removal* of the entry, not a glob
exception. (A single glob cannot express "`archive/**` except
`packages/**`"; a `deny` list can, and a `deny` on a command-bearing entry was
verified to bind only that entry's own commands — but removal needs neither.)
Must remain, each with a live call site: `mkdir` (CAS shards, narrowable to
`archive/assets/**`), `exists`, `read-file`, `lstat`, and `read-dir` on
`archive/packages` + `archive/packages/**`.

## A3. Republication semantics at HEAD (R9 framing correction)

A prior framing described a library-only re-save as overwriting in place. That
is **false at HEAD**: the writer refuses an existing package and the only
production caller passes `overwrite: false`, so a second publication fails with
`package-already-exists`. Generations therefore change the behavior from
**refuse** to **accumulate** — repeat publication becomes possible at all. The
amplification is the price of a new capability, not a regression from a
previously efficient path.

Also recorded (neither reopened nor fixed): a **pin toggle** bumps the
snapshot's `updated_at`, which feeds `savedAt` inside the hashed bytes, so
pinning can mint a generation; and **label ordering** is projected in
binding-recency order without sorting, so rebinding the same label set in a
different order changes `contentHash`. Normalizing either changes existing
hashes and is a separate product decision.

## A4. Canonicalization boundary (R7)

The JS canonicalizer is not generically portable: JavaScript emits
integer-index-like property names in ascending numeric order first, regardless
of insertion order, and arbitrary keys are reachable in projected snapshot
metadata. M05 therefore ports nothing. v1 hashes the exact staged snapshot
bytes; v2 builds only the two-key ASCII descriptor whose emission order
provably coincides across JS and serde. Boundary tripwires are a T1.2.2
requirement, including an assertion that archive publication does not reuse an
unrelated Rust sorted-JSON transport helper that exists elsewhere in the crate.

## A5. Facts recorded as UNVERIFIED / carried

- Whether unsupported-mime `data:image` residue (or a `data:image`-bearing
  title) occurs in real captures — decides whether any RESIDUAL refusal could
  ever be safe. Blocking for any future `DP-M05-RESIDUE-REFUSAL`.
- Directory promotion via the exclusive-rename primitive: every existing call
  site promotes a regular file and no test covers a directory; the non-macOS
  fallback cannot hard-link a directory at all. T1.2.2 proof obligation.
- Any WebKit-layer ceiling on a single invoke body: not establishable from
  source.
- Multi-instance execution against one archive root is not prevented, which is
  why crash-orphan reclamation stays out of M05 and why enforced
  single-instance is a hard precondition for any future reclamation.

## A6. Reconciliation review outcome

The corrected documents were re-reviewed across four independent adversarial
lenses (new-rules/compatibility, protocol/lifecycle, identity/canonicalization,
capability/sequencing), with every non-green finding then adversarially
verified against source by a separate skeptical pass. 30 findings were raised;
21 were non-green; 12 completed verification (9 refuted, 4 survived) and 9
could not complete. The author adjudicated the unverified remainder directly
against source. Every surviving finding was applied:

| # | Sev | Correction applied |
| --- | --- | --- |
| 1 | RED | §X's "crash/power-loss is the only source of persistent residue" was false: an abandoned session plus an ordinary app quit leaves residue permanently, because eviction is lazy and runs only under a later BEGIN. Now stated plainly, with only a *completed* COMMIT guaranteed residue-free. |
| 2 | RED | The G1 "only grant of `write_file`/`open`/`write`" claim was over-broad — the export capability grants the same permission under `$HOME`. Scoped to "reaching `$APPLOCALDATA/archive`". |
| 3 | RED | Discovery truncates at a default 500 entries with only a warning. Harmless under one-package-per-chat; **first made reachable by accumulating generations**, and silent truncation would corrupt PRESERVED / COVERED / BEST-HISTORICAL and the create-only dedupe check. Phase 2 must make discovery complete or explicitly paginated, with residual truncation a first-class per-chat blocker. |
| 4 | RED | Withdrawing the manifest ceiling leaves an O(staged-manifest-size) trusted-side parse allocation that the per-chunk constant does not bound. Now stated openly and accepted deliberately (it matches HEAD, where the verifier parses whole manifests unbounded) rather than reintroducing a ceiling by another name. |
| 5 | YELLOW | §L asserted `canonicalJson` sorts keys lexicographically, which §T refutes in general. Rewritten as a claim about the two-key v2 descriptor only, with an explicit prohibition on generalizing from it. |
| 6 | YELLOW | §N claimed the manifest "is the last member the caller stages" — unenforceable and undetectable, since §Q permits free interleaving and no per-member seal exists. Recast as a property of the promotion boundary. |
| 7 | YELLOW | §V's `assets` empty/non-empty conditions were commit-gate rules with no verifier blocker behind them and were never classified. Now classified **class B** with the writer proof, reader explicitly untouched. |
| 8 | YELLOW | §D's "unclassifiable without `manifest.chatId`" removed a live reader fallback, stripping PRESERVED/COVERED from packages that classify today. Classification now uses exactly the verifier's own chatId resolution; only the recomputed `contentHash` half admits no fallback. |
| 9 | YELLOW | §E's VALID row could be read as importing the commit gate's re-hash into the reader. Restated: M05 adds no reader-side check. |
| 10 | YELLOW | `fs:allow-mkdir` narrowing was parenthetical; a renderer keeping `mkdir` over `archive/packages/**` could pre-create a generation name and permanently deny publication of that content. Now a normative step-4 requirement. |
| 11 | YELLOW | Validator-pin debt was scoped to live-path pins only; broadened to three classes (live-path, `overwrite: true`, dormant-v3 validator). |
| 12 | YELLOW | Amplification arithmetic still derived from the withdrawn 64 MiB ceiling; restated as descriptor-count amplification. Basename escalation trigger restated to match its own evidence (~45 bytes against a 181-byte reduced limit). |

Refuted and deliberately **not** applied (recorded so they are not re-raised
without new evidence): that §J's admission wording conflicts with §V; that the
non-macOS arm is not fail-closed; that commit-time hashing fails to discharge
the staging threat model; that the missing directory-enumeration primitive
needs its own build requirement beyond those already listed; that
`writeSavedChatPackageV3` is an unmigrated live writer (it has no production
caller); and that the legacy-writer retirement is mis-sequenced.

No surviving finding constituted a Human Decision Point.
