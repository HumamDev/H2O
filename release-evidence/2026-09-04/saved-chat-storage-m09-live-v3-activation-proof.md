# M09 — HDA-Authorized Production Live-v3 Activation Candidate Proof

Date: 2026-09-04

Lane: 🗃️ L-SAVED-CHAT-STORAGE

Status: ACTIVATION CANDIDATE COMPLETE / READY FOR GUARDED COMMIT

Starting checkpoint: `1bca348369aee55a5d62e4b6c3a8bbb7d9bd7ab3`

Starting direct parent: `9d990fa3287dfbe76bc487361148b5bb61a9c78c`

Branch: `work/saved-chat-storage`

## Verdict

PASS — M09 HDA-AUTHORIZED LIVE-V3 ACTIVATION CANDIDATE PASSED REAL NORMAL-DESKTOP PROOF — READY FOR GUARDED COMMIT

The Human Decision Authority explicitly authorized `ACTIVATE V3`. The sole
normal-build generation-family selection was changed from
`LiveGenerationFamily::V1V2` to `LiveGenerationFamily::V3`; the guarded
`saved-chat-v3-acceptance` feature was not used as the production activation
mechanism. A real unfeatured Tauri/WKWebView Desktop artifact then passed new
V3 materialization, all-family scanning, logical coverage, M06 Preview, M07
handoff, and same-artifact restart against disposable identifier-scoped state.

This file records an uncommitted activation candidate. Committed HEAD remains
the pre-activation V1V2 checkpoint until a separate guarded commit is
authorized.

## Minimal activation delta

The semantic production change is one constant in
`saved_chat_generation_policy.rs`:

`PRODUCTION_LIVE_GENERATION_FAMILY: V1V2 -> V3`

`LiveGenerationFamily::V1V2` remains supported for rollback and pure injected
tests. Directly affected publisher, scanner, retention, reclamation, handoff,
policy, materializer, coverage, and validator expectations were updated while
retaining explicit V1V2 rollback coverage. Stale current-source comments were
corrected; historical documentation and release evidence were not rewritten.

No second production activation gate was found. The renderer reads the native
policy; native COMMIT and M06 independently consume the same immutable compiled
policy. Durable scanner and M07 admission remain all-family.

## Acceptance-feature and export-root distinction

- normal debug: generation family V3, export root Home;
- normal release: generation family V3, export root Home;
- debug plus `saved-chat-v3-acceptance`: generation family V3, export root
  identifier-scoped AppLocalData;
- release plus `saved-chat-v3-acceptance`: compile-time refusal.

Cargo metadata confirmed `default = []`; normal product scripts do not enable
the acceptance feature. Neither
`saved_chat_export_root_policy.rs` nor
`capabilities/archive-export.json` differs from the starting checkpoint.

## Disposable normal-build environment

- application identifier:
  `org.h2o.studio.desktop.m09ag1activation`;
- external harness root: `/private/tmp/h2o-m09-ag1-20260904`;
- external Tauri config:
  `/private/tmp/h2o-m09-ag1-20260904/normal-config.json`;
- AppLocalData:
  `/Users/hobayda/Library/Application Support/org.h2o.studio.desktop.m09ag1activation`;
- SQLite: `<AppLocalData>/studio-v1.db`;
- archive: `<AppLocalData>/archive`;
- CAS: `<AppLocalData>/archive/assets`;
- app bundle:
  `/private/tmp/h2o-m09-ag1-20260904/target/debug/bundle/macos/H2O Studio M09 AG1 Activation.app`;
- executable SHA-256:
  `15f1d87d10b87ab275a770c38e09147787a8ed4466b434d1d77bc15d1a1b5822`.

The build command supplied no `saved-chat-v3-acceptance` feature. It used an
external config only for the isolated identifier, product name, frontend, and
bundle target. Synthetic data and an accepted repository V1 fixture were the
only archive inputs.

An initial probe pass completed materialization but used an outdated shallow
package-list field when locating the result. That external harness adapter was
corrected, the disposable state was reset, and the entire recorded campaign
was rerun from fresh isolated state. This was not a product failure and no
repository source was changed for it.

## Real normal-build policy proof

The loaded production JS facade and real read-only native commands reported:

- `liveGenerationFamily = v3`;
- saved-chat export-root mode `home`.

This proves the unfeatured normal Desktop artifact—not the acceptance
feature—selected V3 while retaining the production Home export policy.

## Historical V1 compatibility under activated policy

The accepted fixture
`tools/validation/fixtures/saved-chat-archive/import-recovery/i-harness-source.h2ochat`
was copied into the disposable archive as the immutable generation:

`i-harness-source.gf17737f9cb491e9bb6139bebf36226ecd2b12ffc5f9591db5f1094595a8eb7ef.h2ochat`

Under the activated normal V3 artifact:

- scanner status: valid/OK;
- construction family: V1;
- logical content hash:
  `sha256-f17737f9cb491e9bb6139bebf36226ecd2b12ffc5f9591db5f1094595a8eb7ef`;
- M06 decision: protected;
- M06 reasons included `format-stale`;
- the total destructive candidate count was zero;
- M07 BEGIN/READ/END succeeded with its exact four-object V1 inventory;
- V1 snapshot READ length: `1,706` bytes;
- V1 snapshot READ SHA-256:
  `sha256-f17737f9cb491e9bb6139bebf36226ecd2b12ffc5f9591db5f1094595a8eb7ef`;
- V1 representation hash:
  `sha256-a1baa946f40b798fc645e6dc92e5b53fd9e4e696bfb6c10e7d9c71a435b69cc9`.

The fixture was not rewritten, renamed, quarantined, reclaimed, or converted.

## Real normal-build V3 materialization

A synthetic canonical chat was seeded through the production Studio store and
materialized through the real request path:

canonical SQLite state -> request validation -> native policy read ->
active-family V3 builder -> natural gzip selection -> trusted native
BEGIN/WRITE/COMMIT -> immutable generation.

- chat ID: `m09ag1_normal_v3_chat`;
- snapshot ID: `snap_m09ag1_normal_v3`;
- request ID: `req_m09ag1_normal_v3`;
- request status: `written`;
- outcome: `created`, durability complete;
- schema/payload: `3/3`;
- selected encoding: `gzip`, with no representation override;
- intended and trusted logical content hash:
  `sha256-73b3fe0ec3ed878a89f1b642d4715774661a795293ce08b908644010f93b1c85`;
- final generation:
  `m09ag1_normal_v3_chat.g73b3fe0ec3ed878a89f1b642d4715774661a795293ce08b908644010f93b1c85.h2ochat`.

The final generation contained exactly `manifest.json` and `snapshot.json`;
there were no persistent `chat.md` or `chat.html` members and the synthetic
fixture had zero assets.

Trusted physical/logical facts:

- manifest length: `1,358` bytes;
- manifest SHA-256:
  `3be21ea468f8623e585f75a4c83cc70d27e1dd5d7803c8ef6e198dfee9ef2096`;
- stored gzip snapshot length: `6,181` bytes;
- stored gzip snapshot SHA-256:
  `bddc3b0ea26f5d1ff6eb30e78653d4f9e236035ac55a78a6efbe721af6e241e3`;
- gzip magic: `1f 8b`;
- logical snapshot length: `1,849,265` bytes;
- logical snapshot SHA-256:
  `a1dd8bc4f13cbb833c611189a7eb227cd0a5048d8598b1526d3854e91116546b`.

The trusted scanner returned valid/OK with matching physical and logical
descriptors. The generation basename equals the trusted recomputed logical
content hash.

## Coverage and M06 activated-policy Preview

The real projection/coverage path returned `covered = true`, one fresh V3
generation, and the same logical content hash as the intended write and trusted
scan. No timestamp or physical representation identity was used as freshness
authority.

M06 Preview was complete with retention floor `K = 3`, two occupants, two
protected generations, and zero candidates:

- the V3 generation had normal `current-projection`, newest, and floor
  protections and no `format-stale` reason, proving V3 is the active writer
  family;
- the historical V1 generation remained valid and protected with
  `format-stale`.

No destructive execution was performed.

## M07 activated-policy compatibility

M07 BEGIN/READ/END succeeded for both durable families.

For the new V3 generation:

- construction family: V3;
- logical content hash:
  `sha256-73b3fe0ec3ed878a89f1b642d4715774661a795293ce08b908644010f93b1c85`;
- physical representation hash:
  `sha256-0a8cd91c08842924338a74a5f416b61205ef061ea5fe0fc63d42a5a8778b52cc`;
- object inventory: manifest and gzip snapshot only;
- snapshot READ returned all `6,181` physical bytes;
- READ SHA-256 matched the archived physical snapshot:
  `sha256-bddc3b0ea26f5d1ff6eb30e78653d4f9e236035ac55a78a6efbe721af6e241e3`;
- END succeeded.

The historical V1 result above proves activation did not narrow M07 durable
read admission.

## Same-artifact restart durability

After a clean stop, the same normal/default app bundle was relaunched against
the same disposable state. It again reported generation family V3 and export
root Home. The V3 generation retained the same trusted content hash, physical
and logical descriptors, representation hash, valid scan, and fresh coverage.
M06 repeated the same zero-candidate V3-live/V1-format-stale classification,
and M07 repeated successful V1 and V3 handoffs. Scanner residue count remained
zero. No mutable policy state or current-generation pointer was required.

## M08 evidence reuse

No normal-build M08 export was invoked because the activated production export
root correctly remains Home. The checkpointed P3 evidence at
`release-evidence/2026-09-03/saved-chat-storage-m09-p3-default-off-runtime-acceptance.md`
already proves the same V3 implementation through real folder export, portable
ZIP verification, import-as-new, and typed-content recovery under the isolated
acceptance export root. Activation changed only the shared NEW-write family;
M08 source and read admission did not change.

## Home safety seal

Before and after the normal-build runtime campaign,
`/Users/hobayda/H2O Studio Exports` remained exactly:

- inode `249694096`;
- mtime `1782816805`;
- ctime `1782816805`;
- size `96` bytes;
- mode `drwxr-xr-x`;
- the same single prior `.h2ochat` directory and four files with identical
  inode, mtime, ctime, and byte-length inventory.

The activation proof did not mutate the real Home export root.

## Release and acceptance-feature guards

- `cargo check --offline --release --lib` — PASS.
- Release policy test
  `saved_chat_generation_policy::tests::hda_activated_production_policy_is_v3`
  — 1 passed, proving normal release selects V3.
- `cargo check --offline --release --lib --features saved-chat-v3-acceptance`
  — expected compile-time refusal with
  `saved-chat-v3-acceptance is a debug-only validation seam and cannot produce a release artifact`.
- Cargo default features remained empty.
- normal pack/build scripts did not enable the acceptance feature.
- `node tools/product/studio/__smoke__/pack-refcheck.smoke.mjs` — ALL PASS,
  including production-tree references and Saved-Chat source/output mapping.

## Focused assurance

Post-delta focused checks:

- generation policy: 4 passed;
- generation publisher: 87 passed;
- package scanner: 17 passed;
- retention plan: 22 passed;
- reclamation Preview: 14 passed;
- reclaim Execute: 55 passed, 2 existing helper-only tests ignored;
- transport handoff: 20 passed;
- saved-chat builder/projection validators: 32 passed;
- active-family publisher routing: 15 passed;
- coverage: 20 passed;
- materializer/restart reconciliation: 46 passed;
- request intake/dedupe: 34 passed;
- changed JS syntax: passed;
- `cargo check --offline --lib`: passed;
- normal Desktop debug build and bundle: passed;
- normal release library check: passed;
- normal release V3 policy test: passed;
- acceptance-feature release refusal: passed as a negative guard;
- pack/reference smoke: 9 passed;
- `git diff --check`: passed before this record.

The broad focused total before build/runtime checks was 366 passed, 0 failed,
and 2 ignored. Only pre-existing unused-doc-comment and helper-test-variable
warnings were emitted.

## Disposable cleanup and final repository state

After evidence capture, the normal Desktop process was stopped cleanly. The
exact external campaign root and identifier-scoped AppLocalData, cache, and
WebKit roots were removed. No production Studio data or Home export content was
deleted or modified.

Final repository state retains only the coherent activation source/test/truth
delta plus this evidence record. The index is empty and no commit was created.

## Product defect verdict

No production correctness defect was found. Native policy, JS routing, trusted
COMMIT, scanner, logical coverage, M06, M07, restart state, normal export-root
policy, and release policy all agreed on the activated contract.

## Authority seal

The candidate changes only normal NEW-write family truth and directly affected
truth/tests. It does not change V3 schema, V1/V2 semantics, `contentHash`,
`representationHash`, gzip selection, retention K, M06 destructive protocol,
M07 protocol, M08 implementation, Home export location, database schema,
migrations, capabilities, dependencies, Sync, cloud/WebDAV, Chrome, renderer
filesystem authority, or historical packages.

Normal production family in this candidate: V3.

Committed production family at current HEAD: V1V2.

Commit: NO. Push/PR/merge/integration: NO.
