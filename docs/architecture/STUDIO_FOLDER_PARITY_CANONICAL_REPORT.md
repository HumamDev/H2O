# Studio Folder Parity Canonical Report

Phase: Folders-P2

Status: filled with Folders-P1 runtime probe results

Related inventory runbook: `docs/architecture/STUDIO_FOLDER_PARITY_INVENTORY_RUNBOOK.md`

## Purpose

Folders-P2 compares folder catalog and folder membership state across:

1. Native ChatGPT folder state
2. Chrome Studio / Studio Launcher
3. Desktop Studio

This phase is diagnostic/report-only. It does not clean folders, delete folders, merge folders, repair folder bindings, normalize storage, or change source behavior.

Same-name folders with different IDs are treated as conflicts until reviewed. Folder ID is the binding key for chat membership; merging by display name alone can lose bindings, misattribute chats, or discard useful metadata.

## Canonical Assumption

Native ChatGPT folder state is the likely canonical user-facing folder catalog unless runtime probes disprove it.

Canonical target folders from current visual evidence:

| Canonical folder | Expected native count |
| --- | ---: |
| Study | 4 |
| Case | 0 |
| Dev | 0 |
| Code | 1 |
| Tech | 2 |
| English | 1 |

Expected canonical folder count: 6.

## Evidence Summary

This section records both screenshot-derived evidence and the collected Folders-P1 runtime probe summaries.

| Surface | Visual evidence | Runtime probe result | Reading |
| --- | --- | --- | --- |
| Native ChatGPT | Folder page shows 6 folders: Study, Case, Dev, Code, Tech, English with counts 4/0/0/1/2/1. | `folderCount: 6`, `bindingCount: 8`, `duplicateGroups: []`, `testFolderCandidates: []`. | Clean canonical catalog confirmed. |
| Chrome Studio / Studio Launcher | Library header shows about 4 saved, 3 linked, 12 folders, 15 labels, 12 categories, 0 projects. Sidebar includes repeated `Case`, repeated `English`, and test-like folders. | `storedFolderCount: 12`, `storedBindingCount: 8`, `workspaceFolderCount: 12`, duplicate groups `Case` and `English`. | Chrome mirrors native bindings but also carries extra duplicate/test folder rows. |
| Desktop Studio | Sidebar includes duplicate/test folders plus `F5D Test Folder`, `Study`, `Tech`, and virtual `Unfiled`. | `sqliteFolderCount: 15`, `sqliteBindingCount: 0`, `fallbackFolderCount: 0`, `fallbackBindingCount: 0`, duplicate groups `Case` and `English`. | Desktop has canonical folder rows plus extra/test rows, but native memberships are not present in SQLite `folder_bindings`. |

## Runtime Inventory Inputs

The three Folders-P1 probe outputs have been collected and summarized here:

| Probe | Status | Summary |
| --- | --- | --- |
| Native ChatGPT: `window.__folderParityNativeProbe` | Collected | 6 folders, 8 bindings, no duplicates, no test candidates. |
| Chrome Studio: `window.__folderParityChromeStudioProbe` | Collected | 12 stored/workspace folders, 8 stored bindings, duplicate `Case` and `English`, several extra test folders. |
| Desktop Studio: `window.__folderParityDesktopProbe` | Collected | 15 SQLite folders, 0 SQLite bindings, no fallback folder-state, duplicate `Case` and `English`, additional F5D test folders. |

### Canonical Native Folder IDs

| Folder | Native folder ID | Native count |
| --- | --- | ---: |
| Study | `f_7050f49d3f341819dba53d547` | 4 |
| Case | `f_5d9431084707f19dba53d548` | 0 |
| Dev | `f_0606ea698948f19dba53d548` | 0 |
| Code | `f_e301f3506938c19dbac0e304` | 1 |
| Tech | `f_3bf15f43b835d19dbac0fb13` | 2 |
| English | `f_2bb1037f88b2719dbac10c22` | 1 |

## Canonical Comparison Matrix

Use one row per normalized folder name and additional rows for orphan binding groups if needed.

| normalizedName | canonical folder name | native folderId | native count | native bindings | Chrome folder IDs | Chrome counts | Chrome bindings | Desktop folder IDs | Desktop counts | Desktop bindings | classification | recommended action | risk level | notes |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `study` | Study | `f_7050f49d3f341819dba53d547` | 4 | Included in native total of 8. | canonical ID present | Stored mirror count included in Chrome total of 8. | Stored folder-state mirrors native bindings. | canonical ID present | 0 SQLite bindings | 0 | `preserve-canonical` | Preserve native `f_*` ID; later mirror canonical count separately from known-row count. | Low | Canonical row exists in all surfaces; Desktop lacks SQLite bindings. |
| `case` | Case | `f_5d9431084707f19dba53d548` | 0 | Empty canonical folder. | canonical ID present; duplicate `fld-case` also present | 0 canonical count expected. | No canonical binding expected. | canonical ID present; duplicate `fld-case` also present | 0 SQLite bindings | 0 | `preserve-canonical` plus `same-name-id-conflict` | Preserve native `f_*` ID; review duplicate `fld-case` separately. | High for duplicate cleanup | Duplicate visible in Chrome/Desktop, but canonical row is clean. |
| `dev` | Dev | `f_0606ea698948f19dba53d548` | 0 | Empty canonical folder. | canonical ID present | 0 canonical count expected. | No canonical binding expected. | canonical ID present | 0 SQLite bindings | 0 | `preserve-canonical` | Preserve native `f_*` ID. | Low | Canonical row exists in all surfaces. |
| `code` | Code | `f_e301f3506938c19dbac0e304` | 1 | Included in native total of 8. | canonical ID present | Stored mirror count included in Chrome total of 8. | Stored folder-state mirrors native bindings. | canonical ID present | 0 SQLite bindings | 0 | `preserve-canonical` plus `count-mismatch` | Preserve native `f_*` ID; P3 should handle canonical vs SQLite-known count split. | Medium | Desktop saved/indexed rows are not bound to canonical folder in SQLite. |
| `tech` | Tech | `f_3bf15f43b835d19dbac0fb13` | 2 | Included in native total of 8. | canonical ID present | Stored mirror count included in Chrome total of 8. | Stored folder-state mirrors native bindings. | canonical ID present | 0 SQLite bindings | 0 | `preserve-canonical` plus `count-mismatch` | Preserve native `f_*` ID; P3 should handle canonical vs SQLite-known count split. | Medium | Desktop lacks folder bindings for native memberships. |
| `english` | English | `f_2bb1037f88b2719dbac10c22` | 1 | Included in native total of 8. | canonical ID present; duplicate `fld-english` also present | Stored mirror count included in Chrome total of 8. | Stored folder-state mirrors native bindings. | canonical ID present; duplicate `fld-english` also present | 0 SQLite bindings | 0 | `preserve-canonical` plus `same-name-id-conflict` | Preserve native `f_*` ID; review duplicate `fld-english` separately. | High for duplicate cleanup | Duplicate visible in Chrome/Desktop. |

## Duplicate And Test Folder Matrix

| folder ID / bucket | display name | Native presence | Chrome presence | Desktop presence | classification | recommended action | risk level | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `fld-case` | Case | absent | present | present | `same-name-id-conflict` | Review duplicate against canonical Case `f_5d9431084707f19dba53d548`; do not merge automatically. | High | Same display name as canonical `Case`. |
| `fld-english` | English | absent | present | present | `same-name-id-conflict` | Review duplicate against canonical English `f_2bb1037f88b2719dbac10c22`; do not merge automatically. | High | Same display name as canonical `English`. |
| `fld-rt-case` | Case-RT | absent | present | present | `test-folder-candidate` | Candidate for later cleanup only if empty/native-absent after review. | Medium | Runtime test folder. |
| `fld-empty-1779324991364` | Empty Test Folder | absent | present | present | `test-folder-candidate` | Candidate for later cleanup only if empty/native-absent after review. | Medium | Test folder with generated ID. |
| `fld-rt-empty` | Empty-RT | absent | present | present | `test-folder-candidate` | Candidate for later cleanup only if empty/native-absent after review. | Medium | Runtime test folder. |
| `fld-rt-eng` | English-RT | absent | present | present | `test-folder-candidate` | Candidate for later cleanup only if empty/native-absent after review. | Medium | Runtime test folder. |
| `f5d-test-folder-001` | F5D Test Folder | absent | absent in provided Chrome summary | present | `test-folder-candidate` | Candidate for later cleanup only if empty/native-absent after review. | Medium | Desktop-only test folder. |
| `f5d1-test-folder-a` | F5D.1 Test Folder A | absent | absent in provided Chrome summary | present | `test-folder-candidate` | Candidate for later cleanup only if empty/native-absent after review. | Medium | Desktop-only test folder. |
| `f5d1-test-folder-b` | F5D.1 Test Folder B | absent | absent in provided Chrome summary | present | `test-folder-candidate` | Candidate for later cleanup only if empty/native-absent after review. | Medium | Desktop-only test folder. |
| `__none__` / virtual bucket | Unfiled | not a native folder row | virtual or UI-derived | visible as virtual bucket with 4 saved chats | `unfiled-review` | Treat as virtual bucket, not a cleanup target, unless a real folder row is later found. | Low | Explains why Desktop saved chats appear separate from folder rows. |

## Classification Rules

Use these statuses in the filled P2 matrix.

| Status | Meaning |
| --- | --- |
| `preserve-canonical` | Folder is part of the native canonical six-folder target or runtime-native probe proves it is canonical. |
| `missing-from-chrome` | Native canonical folder ID is absent from Chrome Studio mirror. |
| `missing-from-desktop` | Native canonical folder ID is absent from Desktop SQLite/fallback state. |
| `extra-local` | Folder ID appears in Chrome or Desktop but not in native canonical state. |
| `test-folder-candidate` | Folder name matches a known test candidate and must be reviewed for native absence and zero bindings. |
| `same-name-id-conflict` | Same normalized display name appears with multiple folder IDs. |
| `orphan-binding-review` | Binding references a folder ID missing from the catalog on that surface. |
| `count-mismatch` | Canonical native membership count differs from Chrome/Desktop known-row count. |
| `binding-format-mismatch` | Same binding appears with incompatible forms, such as `/c/<id>` vs bare `<id>`, and equivalence must be normalized before comparison. |
| `unfiled-review` | Folder/bucket is synthetic or local-only and should not be treated as a native user folder without review. |

## Final P2 Classification From Runtime Probes

Based on the collected probes:

| Folder/name | Classification | Reason |
| --- | --- | --- |
| Study | `preserve-canonical` | Native ID is present in Chrome and Desktop. |
| Case | `preserve-canonical` plus `same-name-id-conflict` | Native canonical ID is present; extra `fld-case` is also present. |
| Dev | `preserve-canonical` | Native ID is present in Chrome and Desktop. |
| Code | `preserve-canonical` plus `count-mismatch` | Native ID is present; Desktop has no SQLite binding for native membership. |
| Tech | `preserve-canonical` plus `count-mismatch` | Native ID is present; Desktop has no SQLite binding for native memberships. |
| English | `preserve-canonical` plus `same-name-id-conflict` | Native canonical ID is present; extra `fld-english` is also present. |
| Case-RT | `test-folder-candidate` | Native-absent runtime/test folder. |
| Empty Test Folder | `test-folder-candidate` | Native-absent runtime/test folder. |
| Empty-RT | `test-folder-candidate` | Native-absent runtime/test folder. |
| English-RT | `test-folder-candidate` | Native-absent runtime/test folder. |
| F5D Test Folder | `test-folder-candidate` | Desktop-only native-absent test folder. |
| F5D.1 Test Folder A | `test-folder-candidate` | Desktop-only native-absent test folder. |
| F5D.1 Test Folder B | `test-folder-candidate` | Desktop-only native-absent test folder. |
| Unfiled | `unfiled-review` | Desktop virtual bucket with 4 saved chats; not a real folder row in the probe summary. |
| Any folder with bindings but absent from native | `extra-local` plus review status | Could contain real local data; do not delete automatically. |

## Binding And Count Analysis

Runtime-proven count split:

- Native binding count is 8.
- Chrome stored binding count is 8 because Chrome mirrors native folder-state.
- Desktop SQLite binding count is 0 because Desktop has folder catalog rows but no `folder_bindings` rows for those native memberships.
- Desktop fallback folder-state is empty: `fallbackFolderCount: 0`, `fallbackBindingCount: 0`.
- Desktop saved rows show in `Unfiled` because those saved chats are not bound in SQLite to the canonical native folder IDs.
- Chrome/Desktop visible folder counts can show 0 when they count known saved/indexed rows instead of canonical native memberships.
- Native bindings may be stored as `/c/<id>` or full ChatGPT hrefs, while Studio/Desktop may use bare chat IDs.
- Orphan bindings can be preserved in fallback state but skipped by UI counts.
- Some native folder members may not exist as saved or linked Studio records yet.

For parity reporting, distinguish:

| Count type | Meaning |
| --- | --- |
| Canonical membership count | Number of bindings in native folder-state `items[folderId]`. |
| Chrome indexed count | Number of known Chrome Studio `LibraryIndex` rows assigned to a folder. |
| Desktop SQLite count | Number of Desktop `folder_bindings` rows that hydrate to known Desktop chats. |
| Fallback binding count | Number of bindings stored in the fallback folder-state key. |

Count mismatch is not automatically data loss. In this probe set, Chrome has the canonical binding total in stored folder-state, while Desktop has the canonical catalog rows without SQLite bindings. P3 should explicitly separate canonical membership count from known-in-Studio row count.

## Canonical Parity Strategy

The non-destructive strategy for future phases:

1. If a native folder ID is present locally, keep it and update mirror metadata/count display as needed.
2. If a native folder ID is missing locally, add a mirror row non-destructively in a later approved phase.
3. If a local folder ID is absent from native, mark it `extra-local`; do not delete.
4. If same normalized name has different IDs, mark `same-name-id-conflict`; do not merge by name.
5. If an empty test folder is native-absent and empty on all surfaces, mark it as a cleanup candidate for user approval.
6. Preserve native bindings separately from known Studio row counts.
7. If needed, expose canonical count and known-in-Studio count separately rather than forcing one count to mean both.
8. Normalize binding comparison across full href, `/c/<id>`, and bare chat ID before declaring a mismatch.

## Cleanup Decision Matrix

Every cleanup candidate needs this evidence before any destructive phase:

| Evidence | Required before cleanup |
| --- | --- |
| Folder ID | Required |
| Folder name and normalized name | Required |
| Surface presence | Native, Chrome, Desktop |
| Native presence | Required |
| Binding count | Required per surface |
| Exact bindings | Required as chat IDs and original href/key forms |
| Binding resolution | Whether each binding resolves to a known chat |
| Visual metadata | Color, icon, iconColor, sort/order |
| Provenance | Source/import/created fields if available |
| Conflict group | Whether same-name/different-ID exists |
| User approval | Required for delete or merge |

Recommended handling:

| Candidate category | Required proof | Later action, only after approval |
| --- | --- | --- |
| Empty test folder | Native-absent, empty everywhere, no useful metadata. | Delete local extra rows. |
| Same-name duplicate | Native canonical ID identified, duplicate ID has no unique bindings or metadata. | Delete or merge after reviewed mapping. |
| Duplicate with bindings | Every binding reviewed and mapped to canonical target. | Migrate binding then delete duplicate, if approved. |
| Extra local folder with bindings | Bindings confirmed local-only or obsolete. | Preserve by default; cleanup only with explicit decision. |
| Unfiled | Confirm synthetic bucket vs persisted folder row. | Usually preserve as UI bucket, not native folder. |
| Orphan binding | Confirm target folder absence and chat existence. | Repair only in a later non-destructive plan. |

## Preliminary Cleanup Recommendation

No deletion, merge, or repair is approved in P2.

Future cleanup buckets for a later reviewed phase:

| Bucket | Folder IDs / names | P2 recommendation |
| --- | --- | --- |
| Preserve canonical | `f_7050f49d3f341819dba53d547` Study; `f_5d9431084707f19dba53d548` Case; `f_0606ea698948f19dba53d548` Dev; `f_e301f3506938c19dbac0e304` Code; `f_3bf15f43b835d19dbac0fb13` Tech; `f_2bb1037f88b2719dbac10c22` English. | Keep all native `f_*` IDs. |
| Conflict review | `fld-case`; `fld-english`. | Review same-name/different-ID conflicts before any merge or delete. |
| Safe deletion candidates if empty/native-absent | `fld-rt-case`; `fld-empty-1779324991364`; `fld-rt-empty`; `fld-rt-eng`; `f5d-test-folder-001`; `f5d1-test-folder-a`; `f5d1-test-folder-b`. | Candidate only; require explicit approval after evidence review. |
| Virtual bucket | `__none__` / Unfiled. | Do not treat as a real folder row. Preserve UI bucket semantics. |

## Proposed P3 Input

Folders-P3 can now use this filled P2 report as input. It should design non-destructive normalization around:

- Canonical native snapshot mirror using the six native `f_*` folder IDs.
- Explicit marking of extra local folders instead of deleting them.
- Separate canonical membership count from known Studio row count.
- Cleanup review list for test folders and duplicate IDs.
- User approval gate before deletion or merge.
- Desktop plan for native memberships that currently exist in Chrome stored folder-state but not in SQLite `folder_bindings`.
- Binding format normalization across full href, `/c/<id>`, and bare chat ID.

## Proposed Next Actions

1. Start Folders-P3 with a non-destructive normalization plan.
2. Use native `f_*` IDs as canonical folder identities.
3. Plan how Chrome and Desktop should display canonical count versus known-row count.
4. Generate a cleanup review list for duplicate/test folders.
5. Require explicit user approval before any cleanup or merge.

## Safety Boundaries

- No automatic deletion.
- No automatic merge.
- No folder cleanup in P2.
- No bidirectional sync.
- No Chrome write to the sync folder.
- No SQLite schema change.
- No Mobile/WebDAV changes.
- No Rust/Tauri/Cargo/capability changes.
- No import/export changes unless a future phase explicitly justifies them.
- No source behavior changes.
- No unrelated dirty files.

P2 remains a reporting phase. Runtime inventory data is collected and summarized here, but no cleanup or repair is authorized by this report.
