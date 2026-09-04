# M09 P4 — Post-Activation V3 Measurement and Rollback Acceptance

Date: 2026-09-04

Lane: 🗃️ L-SAVED-CHAT-STORAGE

Status: COMPLETE / READY FOR GUARDED EVIDENCE CHECKPOINT

Starting activation HEAD: `0b63b127f22f8f73683ac97e8e4022b85e43f786`

Starting direct parent: `1bca348369aee55a5d62e4b6c3a8bbb7d9bd7ab3`

Branch: `work/saved-chat-storage`

## Verdict

PASS — M09 P4 POST-V3 MEASUREMENT AND ROLLBACK ACCEPTANCE COMPLETE — ACTIVATION ACCEPTED — READY FOR FINAL M09 REVIEW

The committed normal/default V3 Desktop implementation materialized a
representative synthetic corpus, published nine immutable V3 generations,
verified every generation structurally, covered every current canonical
projection, left no staging residue, and retained exact M07 physical-byte
transport. A temporary normal-policy-only V1V2 rollback build then kept all
nine pre-existing V3 generations readable and protected while a new write
materialized as V1. The production policy source was restored byte-for-byte to
the committed V3 HEAD before this evidence record was created.

No production data, production archive, Sync, WebDAV, cloud transport, Chrome,
or real Home export was used.

## Evidence classes

- **REAL DESKTOP** — an unfeatured normal Tauri/WKWebView build executed the
  real SQLite store, canonical materializer, native publisher, scanner,
  coverage, M06 Preview, and M07 BEGIN/READ/END paths against isolated
  AppLocalData.
- **EXTERNAL MEASUREMENT** — a one-off Node script under `/private/tmp` read
  only the resulting synthetic SQLite/archive tree after the Desktop run and
  calculated byte distributions and history duplication. It did not implement
  or substitute product verification.
- **HISTORICAL REFERENCE** — accepted M01/M02/M03 measurements are quoted only
  as prior-fixture evidence. They are not relabeled as results from this P4
  corpus.
- **ACCEPTED BEHAVIORAL REUSE** — M08 rollback admission reuses the real P3
  folder/ZIP/import result and family-independent all-family read contract; P4
  did not perform a normal Home export.

## Isolation and build identity

External campaign root:
`/private/tmp/h2o-m09-p4-20260904.vPl0vm`.

Normal measurement identity:
`org.h2o.studio.desktop.m09p4measurement`.

Rollback identity:
`org.h2o.studio.desktop.m09p4rollback`.

Normal build:

- product name: `H2O Studio M09 P4 Measurement`;
- normal/default features; no `saved-chat-v3-acceptance` feature;
- external target: `<campaign>/current-target`;
- executable SHA-256:
  `e85375402d93e433f827701969eea8302ea1aa981df16ee3cb00ad02dbd81fe8`.

Rollback build:

- product name: `H2O Studio M09 P4 Rollback`;
- normal/default features;
- external target: `<campaign>/rollback-target`;
- executable SHA-256:
  `bf6b11c1fc1749ce0a7e5f2a7246bcd11caf05b52580ae9b251e07251fac9071`;
- `tauri build --debug --bundles app` passed.

The external runner deliberately loaded the production Saved-Chat store and
ingestion modules without the normal Library UI bootstrap. That prevented the
host's unrelated existing Library state from being copied into the isolated
database. The runner supplied synthetic canonical records only; all storage,
materialization, scan, coverage, M06, and M07 authority remained the product's
real native/product path.

## Home export safety seal

Before and after the entire campaign,
`/Users/hobayda/H2O Studio Exports` remained exactly:

- inode `249694096`;
- mtime `1782816805`;
- ctime `1782816805`;
- directory size `96` bytes;
- mode `drwxr-xr-x`;
- four files and two directories;
- `352` KiB allocated.

No Home export operation was invoked and no file contents there were read.

## Measurement corpus

The accepted M01/M02/M03 measurement records and their fixtures were inspected
first. None covered, in one real post-activation Desktop corpus, multiple
generation history plus cross-chat assets. P4 therefore used a new corpus and
marks historical fixture comparisons separately.

The final corpus contained six chats, nine snapshots/generations, 138 turns,
four CAS objects, and six asset references:

| Chat | Generations | Turns per generation | UTF-8 synthetic text bytes/turn | Asset references |
| --- | ---: | --- | ---: | --- |
| `p4-small` | 1 | 2 | 64 | 0 |
| `p4-medium` | 1 | 24 | 512 | 0 |
| `p4-large` | 1 | 72 | 4,096 | 0 |
| `p4-history` | 4 | 2, 4, 6, 8 | 640 | 0 |
| `p4-assets-a` | 1 | 12 | 384 | 4 |
| `p4-assets-b` | 1 | 8 | 384 | 2 |

The history fixture retained byte-identical earlier message records across
successive generations. The asset fixture used four deterministic synthetic
PNG byte objects of 4,096, 8,192, 16,384, and 32,768 bytes. Two objects were
referenced again by the second asset-bearing chat.

SQLite row seal after materialization:

| Table fact | Count |
| --- | ---: |
| chats | 6 |
| snapshots | 9 |
| snapshot turns | 138 |
| asset rows | 4 |
| snapshot asset references | 6 |
| archive requests | 9 |

## Real V3 materialization and validation

The native generation policy returned schema
`h2o.studio.saved-chat-generation-policy.v1` and
`liveGenerationFamily = v3`. All nine requests completed as new durable
generations with schema/payload `3/3` and `durabilityComplete = true`.

The canonical builder selected gzip for all nine snapshots naturally. No
identity or gzip representation was forced, and no representation override was
used.

The complete scanner found:

- nine package generations;
- nine structurally valid packages;
- zero blockers;
- zero staging/residue entries;
- three expected `stale-package` freshness warnings for the older
  `p4-history` generations.

The scanner's aggregate status was therefore `partial`, not because of an
integrity failure, but because the three older immutable history generations
were stale relative to the fourth. All six current canonical projections were
covered and fresh; `p4-history` selected its fourth generation.

M07 BEGIN/READ/END on `p4-large` returned:

- construction family V3;
- logical content hash
  `sha256-4bb83c705c6ec169b28493ec8c921f84b0c1bb7c1ed062f2e362f4c4da727c6a`;
- representation hash
  `sha256-f3e8a8341ce04a4d6b09d7b1c5123ae0bbb3a388d839e33f59dc96769c3d4b1f`;
- manifest `1,373` bytes;
- physical gzip snapshot `5,078` bytes;
- logical snapshot `612,387` bytes;
- exact stored/computed SHA match for both objects;
- successful END.

## Storage breakdown

SQLite was cleanly WAL-checkpointed before byte accounting (`0|0|0`). The
32,768-byte SQLite shared-memory sidecar is ephemeral and excluded from
persistent totals; the WAL length was zero. Directory bookkeeping and filesystem
allocation-unit overhead are also excluded. Reported bytes are exact persistent
file lengths, matching the historical package measurement convention.

Exports and build outputs are excluded.

| Persistent component | Bytes | Share |
| --- | ---: | ---: |
| canonical SQLite DB | 1,347,584 | 88.766% |
| immutable `.h2ochat` generations | 109,112 | 7.187% |
| Asset CAS | 61,440 | 4.047% |
| private residue/staging | 0 | 0.000% |
| other Saved-Chat persistent metadata (`.h2o-archive.lock`) | 0 | 0.000% |
| **Total** | **1,518,136** | **100.000%** |

- Total bytes/chat: `253,023` (six chats).
- Immutable generation bytes/generation: `12,124` mean (nine generations).
- APFS allocated footprint for the isolated AppData tree was `2,360` KiB,
  including the SQLite shared-memory sidecar and filesystem allocation units;
  it is not used for component percentages.

## V3 package effectiveness

| Metric | Result |
| --- | ---: |
| V3 generations | 9 |
| gzip / identity generations | 9 / 0 |
| persistent members total | 24 |
| members/generation | 2 for zero-asset packages; 4 and 6 for asset packages |
| manifest bytes | 14,657 |
| physical snapshot bytes | 12,535 |
| logical snapshot bytes | 705,200 |
| embedded package asset bytes | 81,920 |
| total generation bytes | 109,112 |
| gzip snapshot savings | 692,665 bytes / 98.223% |
| snapshot physical/logical ratio | 1.778% |
| whole-package physical/logical ratio | 13.609% |
| p50 generation size | 2,282 bytes |
| p95 generation size | 65,592 bytes |
| p99 | N/A (`n = 9`) |
| min / max generation size | 1,969 / 65,592 bytes |

The same-corpus whole-package ratio compares stored package bytes with the
decoded snapshot plus the same manifest and embedded-asset bytes. It is a
direct physical/logical descriptor calculation, not a second forced identity
materialization.

Manifest bytes are 13.433% of generation bytes but only 0.966% of total Saved-
Chat persistent bytes. For the four tiny history packages, manifests account
for 5,514 of 8,666 bytes; the overhead is visible at small-package scale but is
not currently a material whole-subsystem cost.

## Historical comparison

### Current same-corpus direct measurement

- natural gzip snapshot: `705,200 -> 12,535` bytes;
- saving: `692,665` bytes (`98.223%`);
- stored whole-generation bytes versus the same logical snapshot/manifest/
  asset byte inventory: `109,112 / 801,777` (`13.609%`).

The P4 corpus is deliberately repetitive and is not claimed to represent a
universal compression ratio.

### Accepted historical references only

The M02/M03 canonical fixture measured:

- legacy v2: `5,114` bytes;
- V3 identity: `2,245` bytes;
- V3 gzip: `1,725` bytes;
- legacy to V3 identity reduction: `56.101%`;
- V3 identity to gzip additional reduction: `23.162584%`;
- legacy to gzip-V3 cumulative reduction: `66.269%`;
- snapshot gzip example: `1,143 -> 497` bytes.

The M01 real-data baseline found cross-snapshot duplicate-turn bytes of about
`0.380%`. Those values are not results from the P4 corpus. P4 did not force a
legacy or identity writer and therefore does not claim an apples-to-apples
legacy total for this new corpus.

## Generation history and duplication

- Mean generations/chat across the corpus: `1.500`.
- `p4-history`: four generations and `34,556` logical snapshot bytes.
- Stored physical generation bytes for that history: `8,666`.
- Repeated manifests in that history: `5,514` bytes.
- Serialized message occurrences across the four snapshots: `31,680` bytes.
- Unique serialized message records: `12,672` bytes.
- Duplicate serialized message occurrences: `19,008` bytes.
- Duplicate fraction of history message bytes: `60.000%`.
- Duplicate fraction of total logical history snapshots: `55.006%`.

This intentionally history-rich chat demonstrates that structural duplication
appears as histories grow. However, gzip reduces the entire four-generation
history to only 8,666 persistent package bytes. Even eliminating the complete
history package footprint would recover only 0.571% of total corpus storage;
turn-body sharing could recover less than that.

### M04 decision

**M04 turn-body CAS: KEEP DEFERRED.**

The old provisional signals (`>= 15%` duplicate-turn bytes or mean history
`>= 3.0`) are not treated as permanent gates. This designed history fixture
does exceed the logical-duplication signal, but the corpus-wide mean remains
1.5 generations/chat and the relevant physical history is only 8,666 bytes.
The measured persistent-byte recovery ceiling does not justify immutable
turn-body CAS complexity now. Continue measuring organic history depth and
physical bytes rather than reopening M04 on the logical ratio alone.

## Asset CAS and I-CAS-01

- CAS objects: 4.
- CAS bytes: 61,440.
- Manifest asset references: 6.
- Logical referenced asset bytes: 81,920.
- Unique referenced digests: 4.
- Observed unreferenced/orphan CAS objects and bytes: 0 / 0.
- Cross-chat repeated reference bytes beyond one unique CAS copy: 20,480.
- Embedded governed-asset members in immutable packages: 81,920 bytes.

CAS therefore deduplicated 20,480 bytes within the canonical CAS object store,
but durable recovery packages still carry governed asset members. The package
member copies are reported separately and are not mislabeled as CAS GC
savings.

**Physical Asset CAS GC: KEEP DEFERRED.** The measured corpus has zero obvious
unreachable CAS bytes, so GC would recover zero bytes. I-CAS-01 remains
unresolved and P4 does not authorize physical CAS deletion. Any future package
asset-representation optimization is distinct from physical CAS GC and needs
its own design/integrity review.

## M06 Preview and reclaimable bytes

M06 Preview was read-only and complete with retention floor `K = 3`:

| Result | Count/bytes |
| --- | ---: |
| valid/structurally valid generations | 9 |
| protected | 8 |
| candidates | 1 |
| excluded | 0 |
| referenced CAS objects | 4 |
| estimated reclaimable generation bytes | 2,047 |
| reclaimable share of generation bytes | 1.876% |
| reclaimable share of total persistent bytes | 0.135% |

Only the oldest `p4-history` generation was a candidate. The next three history
generations remained inside the floor/current protections. No reclamation,
quarantine, or deletion was executed, and `FormatStale` was not treated as
automatic deletion authority.

## Runtime timing

Measurements came from the real normal Desktop path on this host. Materialize
samples include SQLite projection, canonical construction, native publication,
sync, and validation. Scanner and history-coverage samples are warm repeated
whole-operation observations. No p99 is reported for materialization because
`n = 9`.

| Operation | n | p50 | p95 | min / max | mean |
| --- | ---: | ---: | ---: | ---: | ---: |
| materialize/publish | 9 | 72 ms | 144 ms | 33 / 144 ms | 79.667 ms |
| complete scan/verify of 9 generations | 20 | 150 ms | 238 ms | 130 / 261 ms | 162.300 ms |
| coverage/freshness for 4-generation history chat | 20 | 108 ms | 255 ms | 96 / 295 ms | 138.300 ms |

M06 Preview completed in 59 ms. These timings are host observations, not a
general benchmark. They show no activation acceptance blocker and do not
justify a new performance framework.

## Storage engineering verdict

1. V3 materially reduces the immutable package layer: the accepted same-fixture
   historical reduction is 66.269% and this real post-activation corpus stored
   its naturally selected snapshots at 1.778% of logical size. The P4 total is
   dominated by SQLite, so P4 does not claim a same-corpus percentage reduction
   for the entire subsystem without a legacy control.
2. Gzip should remain the canonical default selection when governed selection
   wins; all nine real packages chose it and it saved 692,665 snapshot bytes.
3. Manifest overhead is noticeable for tiny packages/history but only 14,657
   bytes (0.966% of total persistent storage), so it is not a near-term target.
4. M04 remains deferred because high logical duplication compressed into a
   very small physical history footprint.
5. Physical Asset CAS GC remains deferred: no orphan bytes were observed and
   I-CAS-01 is unresolved.
6. Scan/verify and materialization costs are acceptable for this representative
   corpus.
7. The architecture remains on the expected long-term path: canonical SQLite,
   immutable independently verifiable V3 recovery generations, governed CAS,
   and family-independent read/recovery paths.

## Rollback method

1. The accepted nine-generation V3 AppLocalData state was cleanly copied to the
   isolated rollback identifier.
2. The SHA-256 of
   `apps/studio/desktop/src-tauri/src/saved_chat_generation_policy.rs` at HEAD
   was captured as
   `203f09f504b40e000264dcdb14585432c9678b6df9a18c0d106e4f769e12d431`.
3. Exactly the normal/default production selection constant in that one file
   was temporarily changed from `LiveGenerationFamily::V3` to
   `LiveGenerationFamily::V1V2`. The guarded acceptance-feature constant
   remained V3.
4. During the temporary rollback diff, that source file was the sole modified
   repository path; the index was empty and `git diff --check` passed.
5. A debug app was built into the external rollback target and executed only
   against the safe copied state.
6. The compatibility checks and one new materialization were run.
7. The app was closed and the one-line source change was reversed.
8. The restored policy SHA matched the captured HEAD SHA; Git diff, index, and
   untracked state were empty before this evidence record was added.

No history rewrite and no permanent rollback commit were created.

## V3 before rollback

Immediately before the copy/build boundary:

- policy: V3;
- nine V3 generations;
- all nine structurally valid with exact logical/physical hashes;
- six current projections covered;
- M06: eight protected, one content-obsolete candidate under the normal V3
  retention rules;
- M07 exact V3 BEGIN/READ/END succeeded;
- scanner residue count: zero.

## V1V2 rollback runtime

The temporary artifact reported `liveGenerationFamily = v1v2`.

For the nine pre-existing generations:

- scanner completed with nine V3 generations and zero integrity blockers;
- every generation retained matching logical content identity and construction
  family V3;
- the expected three older-history freshness warnings remained non-blocking;
- V1V2 projection coverage was false/selected-null, as expected because the
  active writer now projected V1/V2 identities instead of rewriting V3;
- M06 protected all nine generations and returned zero candidates;
- every decision included `format-stale` plus its applicable newest/floor or
  unwitnessed-projection protections;
- no old V3 package was made reclaimable merely by rollback.

M07 again read the exact `p4-large` V3 generation with the same logical content
hash, representation hash, object lengths, physical hashes, construction family
V3, and successful END recorded before rollback.

M08 compatibility was not rerun through Home. The checkpointed P3 real
V3 folder/ZIP/import-as-new acceptance plus unchanged family-independent M08
read admission remains the governing evidence.

## New write under rollback

One synthetic chat was materialized through the same real request path:

- chat: `p4-rollback-new`;
- snapshot: `p4-snap-rollback-new-1`;
- request: `p4-rollback-req-01`;
- duration: 128 ms;
- outcome: written/created, durability complete;
- generation schema/payload: `1/1`;
- content hash:
  `sha256-b09531d9d2de9a8f5846d024b935403e4a5cfea176c9f2021f3d8c77b036f04c`;
- trusted diagnostic: valid, content hash matched, zero blockers.

The post-write scan contained ten packages, of which exactly the original nine
were V3. Rollback therefore stopped new V3 publication without rewriting,
downgrading, deleting, or quarantining existing V3 state.

## Return to committed V3 and integrity seal

After the rollback process exited:

- policy file SHA-256 returned to
  `203f09f504b40e000264dcdb14585432c9678b6df9a18c0d106e4f769e12d431`;
- `git diff` was empty;
- index was empty;
- untracked repository paths were zero;
- branch remained `work/saved-chat-storage` at
  `0b63b127f22f8f73683ac97e8e4022b85e43f786`;
- no merge/rebase/cherry-pick/revert/sequencer state existed.

The rollback used a state copy. No archive migration, mutable persistent policy,
V3 downgrade, deletion, quarantine, or production-data mutation occurred.

## Activation acceptance

**ACCEPT.**

The exact committed normal V3 architecture produced valid durable state with
material package reduction, acceptable observed runtime costs, complete
coverage, safe M06 classification, and exact M07 transport. The exact
one-selection rollback stopped new V3 writes while preserving and protecting
existing V3 state. No correctness reason to reject or recommend rollback was
observed.

## Post-V3 roadmap decisions

| Boundary | Decision | Measurement basis |
| --- | --- | --- |
| M04 turn-body CAS | DEFER | 55.006% designed logical history duplication compressed into only 8,666 physical history bytes; mean generations/chat 1.5 |
| Physical Asset CAS GC | DEFER | zero orphan CAS bytes; I-CAS-01 unresolved |
| Archive integrity/observability M10 | NEXT | V3 is active; operational visibility now has higher value than another representation optimization |
| Recovery/Data Safety Center M11 | NEXT | sequence after/with M10 using the proven all-family recovery path |
| Scheduled backup M12 | LATER | no P4 correctness or recovery-read gap requires advancing it ahead of M10/M11 |
| Large-chat segmentation seam | MONITOR | 612,387 logical-byte large snapshot became 5,078 bytes; full scan p95 238 ms and no observed acceptance blocker |
| Cross-platform filesystem certification | NEXT | activation is accepted on the current macOS authority; broader target certification remains intentionally separate |

## Assurance and cleanup

- normal/default V3 real Desktop materialization: 9/9 durable publications;
- trusted structural scanner: 9/9 valid, zero blockers, zero residue;
- current projection coverage: 6/6;
- M06 Preview: complete; no destructive execution;
- M07 real V3 physical-byte handoff: pass;
- byte/storage/history/CAS analysis: pass on the isolated synthetic tree;
- temporary rollback Tauri debug app build: pass;
- rollback V3 scan/read/protection: pass;
- rollback new V1 write: pass;
- policy restoration SHA/diff/index seal: pass;
- Home metadata/count/allocation seal: unchanged;
- `git diff --check` after evidence creation: pass.

All P4-only AppLocalData identities and the external campaign root were removed
after the measurements, hashes, and rollback results were captured. No
production user database/archive was inspected or mutated.

## Authority seal

P4 makes no permanent product semantic change. The committed production family
remains V3 and the normal export root remains Home. There is no package-format,
`contentHash`, `representationHash`, M06 destructive-authority, retention-K,
M07, M08, database-schema/migration, capability, dependency, Sync, cloud,
WebDAV, or Chrome change. Production live-v3 is not reverted. `origin/main`
remained `f4dbd327a5ecd22317640cfd3357d0da7adf06b6`; no fetch, push, merge, PR,
or integration occurred.

Final authorized repository candidate: this evidence record only. Index empty;
commit not created.
