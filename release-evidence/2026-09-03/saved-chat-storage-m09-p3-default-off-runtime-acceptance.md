# M09 P3 — Default-OFF Full-Chain v3 Desktop Runtime Acceptance

Date: 2026-09-03

Lane: 🗃️ L-SAVED-CHAT-STORAGE

Status: COMPLETE / READY FOR GUARDED ACCEPTANCE CHECKPOINT

Starting checkpoint: `9d990fa3287dfbe76bc487361148b5bb61a9c78c`

Branch: `work/saved-chat-storage`

## Verdict

PASS — M09 P3 DEFAULT-OFF FULL-CHAIN V3 DESKTOP ACCEPTANCE COMPLETE — PRODUCTION LIVE-V3 REMAINS OFF — READY FOR GUARDED ACCEPTANCE CHECKPOINT

The production-reachable v3 gzip path passed in a real disposable
Tauri/WKWebView Desktop runtime. The same identifier-scoped state then passed
restart and rollback inspection under the normal V1V2 build. No product source,
validator, Cargo, capability, package-format, database-schema, or migration file
was changed by this campaign.

## Evidence classes

- **REAL DESKTOP** — actual Tauri/WKWebView application and production command,
  renderer, SQLite, archive, scanner, coverage, M06, M07, and M08 paths.
- **REAL NATIVE FILESYSTEM** — actual immutable generations and exports under
  the disposable identifier-scoped AppLocalData tree.
- **FOCUSED NATIVE / BEHAVIORAL** — checkpointed identity/gzip parity,
  interrupted-publication, and stranded-writing tests. These are not described
  as canonical-materializer Desktop evidence.
- **SOURCE / STATIC** — release guard, capability, and module-registration
  inspection where noted.

## Campaign isolation and build identity

- Isolated application identifier:
  `org.h2o.studio.desktop.m09p3fullchain`.
- External campaign root:
  `/private/tmp/h2o-m09-p33-20260903`.
- External default overlay:
  `/private/tmp/h2o-m09-p33-20260903/default-config.json`.
- External acceptance overlay:
  `/private/tmp/h2o-m09-p33-20260903/acceptance-config.json`.
- AppLocalData root:
  `/Users/hobayda/Library/Application Support/org.h2o.studio.desktop.m09p3fullchain`.
- SQLite path: `<AppLocalData>/studio-v1.db`.
- Archive root: `<AppLocalData>/archive`.
- CAS root: `<AppLocalData>/archive/assets`.
- Acceptance export root: `<AppLocalData>/H2O Studio Exports`.
- Default debug app:
  `/private/tmp/h2o-m09-p33-20260903/default-target/debug/bundle/macos/H2O Studio M09 P3.3 Default.app`.
- Default binary SHA-256:
  `74a73bd55ceb0ab8a8692e604a6e70dfdab353feb547b0aeae039d2b5d535643`.
- Acceptance debug app:
  `/private/tmp/h2o-m09-p33-20260903/acceptance-target/debug/bundle/macos/H2O Studio M09 P3.3 Acceptance.app`.
- Acceptance binary SHA-256:
  `351fb3288545b5eaedd3af0766e6ffaf7a8137168906ddf249de986fa4e6b34d`.
- Toolchain observed: Tauri CLI `2.11.2`, Rust Tauri `2.11.1`,
  `tauri-utils` `2.9.1`.

The external runtime capability was deliberately local-only: SQL access and
AppLocalData archive reads were admitted; Home, Sync, Downloads, and request
inbox scopes were absent. The acceptance overlay additionally admitted only
the identifier-scoped AppLocalData export root. No overlay entered Git and no
production capability file changed.

## Real Home export safety seal

Before and after the campaign,
`/Users/hobayda/H2O Studio Exports` had exactly:

- inode `249694096`;
- mtime `1782816805`;
- ctime `1782816805`;
- directory size `96` bytes;
- mode `drwxr-xr-x`;
- four files, two directories, and `352` KiB allocated.

No default-build folder or ZIP export was invoked. All M08 publication occurred
only under the acceptance artifact's isolated AppLocalData root.

## Phase A — normal V1V2 real Desktop baseline

The normal debug artifact, with no acceptance feature, returned these values
through the real read-only native policy commands and the loaded production JS
facade:

- `liveGenerationFamily = v1v2`;
- saved-chat export-root mode `home`.

The isolated database began with zero chats. A governed synthetic chat and
snapshot were created and materialized through the normal request path:

- chat ID: `m09p33_default_baseline_chat`;
- snapshot ID: `snap_m09p33_default_baseline`;
- trusted/intended content hash:
  `sha256-050d1105b93a9605e106d1c96190e344f19d56a65d5fc90e3e7488c2579da51b`;
- schema/payload: `1/1`;
- final generation:
  `m09p33_default_baseline_chat.g050d1105b93a9605e106d1c96190e344f19d56a65d5fc90e3e7488c2579da51b.h2ochat`;
- outcome: written/created, not deduplicated;
- scanner: valid;
- coverage/freshness: satisfied;
- V3 generations created: zero.

This V1 package remained in the disposable archive for forward-transition
compatibility checks.

## Phase B — V3 acceptance policy and historical package compatibility

The debug artifact built with `saved-chat-v3-acceptance` returned through the
real native commands:

- `liveGenerationFamily = v3`;
- saved-chat export-root mode `appLocalData`.

The renderer did not select either value. Native COMMIT and M06 consumed the
same immutable compiled generation policy. AppLocalData export access was
fulfilled; Home export access was rejected.

Before V3 materialization, the historical V1 generation remained scanner-valid
and transportable. M06 Preview under V3 policy kept it protected with
`FormatStale`; it was not a destructive candidate.

## Canonical V3 gzip materialization — REAL DESKTOP

A second synthetic canonical chat was materialized through the actual
production-reachable path:

canonical SQLite state → materialization request → native policy query →
active-family facade → canonical V3 builder → normal whole-package gzip choice
→ trusted native BEGIN/WRITE/COMMIT → immutable final generation.

- chat ID: `m09p33_v3_gzip_chat`;
- snapshot ID: `snap_m09p33_v3_gzip`;
- request ID: `req_m09p33_v3_gzip`;
- canonical messages: two turns with typed `content[]`;
- selected encoding: `gzip`, without forcing or a representation override;
- trusted/intended content hash:
  `sha256-f9dd43686ab9c2ab7af0d72944e1167a6645b893d8232d84318405e4f7101565`;
- final generation:
  `m09p33_v3_gzip_chat.gf9dd43686ab9c2ab7af0d72944e1167a6645b893d8232d84318405e4f7101565.h2ochat`;
- outcome: created;
- `durabilityComplete = true`.

The retired renderer filesystem writer `writeSavedChatPackageV3` was not used.
Generation naming used the trusted recomputed logical identity.

## Trusted generation and scanner seal

The final generation was scanner-valid with construction family V3 and exact
persistent application inventory `manifest.json` plus `snapshot.json`; there
were no persistent `chat.md` or `chat.html` members and this fixture had zero
assets.

- manifest SHA-256:
  `fedfde99dc2a8c4a6a4219d35ae92b7aa37ef186969506a28a49fbfcf032c3eb`;
- manifest length: `1,413` bytes;
- physical snapshot SHA-256:
  `00cb2f646a42eed82e063d4e331a06351c2a110ab69081700e5f9ac5d16c9243`;
- physical snapshot length: `3,885` bytes;
- logical snapshot SHA-256:
  `3151cde115ed13815e77aa49ca6890c4f556c50fdbc4f9931df3348b25c9fb5b`;
- logical snapshot length: `1,027,477` bytes;
- physical length was strictly smaller than logical length;
- decoded `savedAt` and logical package cross-bindings were accepted only after
  descriptor verification.

The zero-asset runtime fixture was sufficient for the production-reachable
chain. Checkpointed focused native tests continue to cover governed
asset-bearing V3 verification, publication, scan, and handoff.

## Coverage and M06 Preview

The real coverage path returned:

- `covered = true`;
- one fresh generation;
- `complete = true`;
- selected construction family V3;
- projection content hash equal to the trusted scanned content hash above.

Freshness therefore used logical identity, not timestamps or physical gzip
identity.

M06 Preview under the acceptance V3 policy was complete with retention floor
`K = 3`, two occupants, two protected generations, and zero candidates. The V3
generation was protected by the normal current/newest/floor rules and did not
receive `FormatStale`, proving V3 was the active writer family. The historical
V1 generation remained valid and protected with `FormatStale`.

## M07 real V3 handoff

M07 BEGIN/READ/END succeeded for the real V3 generation:

- construction family: V3;
- logical `contentHash`:
  `sha256-f9dd43686ab9c2ab7af0d72944e1167a6645b893d8232d84318405e4f7101565`;
- physical `representationHash`:
  `sha256-d3c026577d653c4a6adf26bde535e1f8a8efdbeb793a68402cf999becc2ebc5e`;
- object inventory: manifest and snapshot only;
- snapshot encoding: gzip;
- physical and logical descriptors matched the trusted scan;
- READ returned all `3,885` stored gzip bytes with EOF;
- READ bytes matched the archived file byte-for-byte and by SHA-256;
- END succeeded.

No remote transport was performed.

## M08 real folder and ZIP export

The acceptance artifact published only under
`<AppLocalData>/H2O Studio Exports`.

Folder export:

- destination: `m09p33-v3-gzip-folder.h2ochat`;
- status: exported;
- four files, zero assets;
- durable manifest and gzip snapshot were copied byte-for-byte;
- exported snapshot SHA-256 remained
  `00cb2f646a42eed82e063d4e331a06351c2a110ab69081700e5f9ac5d16c9243`;
- `chat.md` and `chat.html` existed only as decoded, governed export
  companions.

Portable ZIP:

- destination: `m09p33-v3-gzip.h2ochat.zip`;
- ZIP length: `5,904` bytes;
- ZIP SHA-256:
  `f250fb15e421d9bd249d3d7a65b9e697fa635e9593498d289295a2017c470ffe`;
- verifier: pass;
- entries: manifest (`1,413`), snapshot (`3,885`), derived Markdown
  (`342,261`), and derived HTML (`343,268`) bytes;
- logical package content hash remained unchanged.

The durable gzip snapshot remained byte-faithful; the ZIP was only a container
and did not redefine package identity.

## Import-as-new real round trip

The main disposable AppLocalData tree was moved recoverably aside, a fresh
same-identifier state was started with only the synthetic ZIP, and the real
import-as-new path succeeded:

- before import: zero chats;
- imported chat ID:
  `recovered_88c07cb5-08b9-45e1-ae53-5c2661d6dab1`;
- imported snapshot ID:
  `snap_cf2ccf1c-89dd-4e33-9642-ccaeac172382`;
- original chat/snapshot IDs were retained as recovery metadata;
- recovered title: `Recovered: M09 P3.3 Canonical V3 Gzip`;
- recovered message count: two;
- user text length: `38` with typed text and HTML content;
- assistant text length: `341,999` with typed text and HTML content;
- physical gzip and logical descriptors verified before persistence;
- no duplicate legacy scalar-body field was required;
- asset result was exactly the zero-asset fixture inventory.

The recovered state was then moved aside and the original acceptance state was
restored for restart and rollback checks.

## Successful-publication restart

After a clean stop, the same V3 acceptance artifact was relaunched against the
same state. It again reported V3. The generation scanned valid with unchanged
content hash, coverage returned covered/fresh/complete, M06 treated V3 as
active, and M07 BEGIN/END succeeded. The scanner reported two valid packages
and no blockers. No private staging residue was treated as a final generation,
and no mutable current-generation pointer was needed.

## Phase C — normal V1V2 rollback compatibility

The acceptance app was stopped and the normal default artifact was launched
against the same isolated state. The real commands reported:

- `liveGenerationFamily = v1v2`;
- saved-chat export-root mode `home`.

The existing V3 generation remained scanner-valid, construction family V3,
and unchanged at its original logical content hash. The active V1V2 projection
for the same SQLite snapshot legitimately produced a different content hash:
`sha256-9c179c363e738e80514e5e3f4f3596b2bfb1a5369c0d44a2131c1ade3716ec8d`.
Coverage was therefore not falsely claimed.

M06 protected the existing V3 generation with `FormatStale` plus the normal
floor/newest and unavailable/unwitnessed projection protections; it was not a
candidate. M07 still completed BEGIN/READ/END and returned the exact original
`3,885` gzip bytes. No rewrite, downgrade, quarantine, or reclamation occurred.

No M08 export was performed under the default build. Rollback M08 compatibility
is sealed by the successful real acceptance-build folder/ZIP/import round trip,
the scanner's all-family verification of the same V3 package after rollback,
and the checkpointed family-independent M08 durable-read contract.

One new normal materialization then proved default-off new-write behavior:

- request ID: `req_m09p33_rollback_v1`;
- policy: V1V2;
- schema/payload: `1/1`;
- content hash:
  `sha256-9c179c363e738e80514e5e3f4f3596b2bfb1a5369c0d44a2131c1ade3716ec8d`;
- final generation:
  `m09p33_v3_gzip_chat.g9c179c363e738e80514e5e3f4f3596b2bfb1a5369c0d44a2131c1ade3716ec8d.h2ochat`;
- outcome: created and durability-complete;
- scanner: valid V1;
- new V3 generations created by the default runtime: zero;
- original V3 generation remained valid and unchanged.

## V3 identity and parity — FOCUSED NATIVE / BEHAVIORAL

Identity was not forced through the canonical materializer. Checkpointed shared
verifier, native publisher, scanner, and M07 real-filesystem tests cover V3
identity, gzip, zero-asset and asset-bearing packages, and immutable
same-content dedupe.

The permanent paired fixture proves one logical V3 package has:

- content hash:
  `sha256-f8d91c31d938ca650cab78223716d055d9968fcbedd9c11406c94985dc9f9433`
  for both representations;
- logical snapshot SHA-256:
  `275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b`;
- logical length: `1,143` bytes;
- identity physical SHA/length equal to that logical identity;
- gzip physical SHA-256:
  `508c62358abd7ddc250139da224a353e41af8672a13142b905008193d8ad9959`;
- gzip physical length: `497` bytes;
- different M07 `representationHash` values.

This is focused native/behavioral parity evidence, not canonical-materializer
Desktop identity-selection evidence.

## Interrupted staging and stranded writing — evidence classification

- **NATIVE BEHAVIORAL EVIDENCE:** the checkpointed generation-publisher
  cut-point/failure tests prove an interrupted private stage never becomes a
  valid final generation, residue is reclaimable, and a later deterministic
  attempt can rebuild/publish it. No new Desktop crash instrumentation was
  added.
- **BEHAVIORAL RECONCILIATION EVIDENCE:** the checkpointed P2.3 regression
  proves persisted `meta_json.materialization.intendedContentHash` lets a
  default V1V2 restart adopt a matching already-published V3 generation without
  recomputing the target from the new family. No family field or migration was
  added.

## Acceptance-feature and release guard

Reused checkpointed P3.2 assurance because HEAD did not change:

- default features exclude `saved-chat-v3-acceptance`;
- normal debug and normal release select V1V2;
- debug plus the acceptance feature selects V3;
- release plus the acceptance feature fails closed at compilation;
- normal pack/build scripts do not enable the feature;
- ordinary `archive-export.json` remains Home-scoped and unchanged;
- no runtime/JS setter or environment, database, config, localStorage, or
  per-chat activation path exists.

The acceptance feature is validation-only and is not the production activation
mechanism.

## Commands and focused assurance

- `npm run prepare-dist` — PASS (`329` files, `56` rewritten references).
- From `apps/studio/desktop`, the default Desktop build used
  `CARGO_TARGET_DIR=/private/tmp/h2o-m09-p33-20260903/default-target node ../../../node_modules/@tauri-apps/cli/tauri.js build --debug --bundles app --config /private/tmp/h2o-m09-p33-20260903/default-config.json`.
- From `apps/studio/desktop`, the acceptance Desktop build used
  `CARGO_TARGET_DIR=/private/tmp/h2o-m09-p33-20260903/acceptance-target node ../../../node_modules/@tauri-apps/cli/tauri.js build --debug --bundles app --features saved-chat-v3-acceptance --config /private/tmp/h2o-m09-p33-20260903/acceptance-config.json`.
- Each Desktop phase was launched as the actual macOS app bundle and exercised
  through the real runtime command/renderer surfaces.
- `node tools/product/studio/__smoke__/pack-refcheck.smoke.mjs` — ALL PASS,
  including the real-tree reference check and Saved-Chat source/output mapping.
- Direct SHA-256/stat comparisons — PASS for archive, M07 READ, folder export,
  ZIP, and Home safety seals.
- `git diff --check` and an untracked-file `git diff --no-index --check` — PASS
  after this evidence record.

## Disposable cleanup and final repository state

After evidence capture, all campaign processes were stopped. The exact external
campaign root, identifier-scoped AppLocalData, cache, and WebKit roots were
removed. The user's production database/archive/export locations were not
deleted or modified.

Final repository state:

- HEAD remains `9d990fa3287dfbe76bc487361148b5bb61a9c78c`;
- exactly this evidence record differs from HEAD;
- unrelated paths: zero;
- index: empty;
- commit: NO;
- push/PR/merge/integration: NO.

## Authority seal

Normal production remains V1V2 with the Home export root. The disposable debug
acceptance artifact alone selected V3 plus identifier-scoped AppLocalData.
There was no change to package formats, `contentHash`, `representationHash`,
retention K, M06 destructive authority, M07 protocol, M08 semantics, SQLite
schema, migrations, capabilities, dependencies, Sync, cloud/WebDAV, Chrome, or
renderer arbitrary-filesystem authority.

M09 PRODUCTION LIVE-V3 — NOT ACTIVATED.
