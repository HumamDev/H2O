# Studio Folder Parity Canonical Report

Phase: Folders-P2

Status: report template with screenshot-derived preliminary evidence

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

This section records screenshot-derived evidence only. It is not a final runtime inventory.

| Surface | Visual evidence | Preliminary reading |
| --- | --- | --- |
| Native ChatGPT | Folder page shows 6 folders: Study, Case, Dev, Code, Tech, English with counts 4/0/0/1/2/1. | Looks like the clean canonical catalog. |
| Chrome Studio / Studio Launcher | Library header shows about 4 saved, 3 linked, 12 folders, 15 labels, 12 categories, 0 projects. Sidebar includes repeated `Case`, repeated `English`, and test-like folders such as `Case-RT`, `Empty Test Folder`, `Empty-RT`, `English-RT`. | Derived mirror appears polluted by preserved test/import history. |
| Desktop Studio | Sidebar includes duplicate/test folders plus `F5D Test Folder`, `Study`, `Tech`, and `Unfiled`. | Desktop SQLite/fallback state appears to contain additional local-only rows. |

## Required Runtime Inventory Inputs

P2 needs the three probe outputs defined in the Folders-P1 runbook:

- Native ChatGPT probe output: `window.__folderParityNativeProbe`
- Chrome Studio probe output: `window.__folderParityChromeStudioProbe`
- Desktop Studio probe output: `window.__folderParityDesktopProbe`

### Pending Data

The runtime probe outputs are not yet available in this report. Before filling the canonical matrix:

1. Run the Native ChatGPT probe from `STUDIO_FOLDER_PARITY_INVENTORY_RUNBOOK.md`.
2. Run the Chrome Studio / Studio Launcher probe from that runbook.
3. Run the Desktop Studio probe from that runbook.
4. Paste the three complete returned objects into the working notes for P2.
5. Fill the comparison matrix below from those objects.

## Comparison Table Template

Use one row per normalized folder name and additional rows for orphan binding groups if needed.

| normalizedName | canonical folder name | native folderId | native count | native bindings | Chrome folder IDs | Chrome counts | Chrome bindings | Desktop folder IDs | Desktop counts | Desktop bindings | classification | recommended action | risk level | notes |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `study` | Study | pending | 4 visual | pending | pending | pending | pending | pending | pending | pending | `preserve-canonical` / pending probe | Preserve native ID; mirror if missing. | Medium until IDs verified | Visual evidence only. |
| `case` | Case | pending | 0 visual | pending | pending | pending | pending | pending | pending | pending | `same-name-id-conflict` if multiple IDs | Review duplicate IDs; do not merge by name. | High | Duplicate visible in Chrome/Desktop. |
| `dev` | Dev | pending | 0 visual | pending | pending | pending | pending | pending | pending | pending | `preserve-canonical` / pending probe | Preserve native ID; mirror if missing. | Medium until IDs verified | Visual evidence only. |
| `code` | Code | pending | 1 visual | pending | pending | pending | pending | pending | pending | pending | `preserve-canonical` / pending probe | Preserve native ID; compare binding format. | Medium until IDs verified | Visual evidence only. |
| `tech` | Tech | pending | 2 visual | pending | pending | pending | pending | pending | pending | pending | `preserve-canonical` / pending probe | Preserve native ID; mirror if missing. | Medium until IDs verified | Visual evidence only. |
| `english` | English | pending | 1 visual | pending | pending | pending | pending | pending | pending | pending | `same-name-id-conflict` if multiple IDs | Review duplicate IDs; do not merge by name. | High | Duplicate visible in Chrome/Desktop. |
| `case-rt` | none | absent visual | 0 visual | pending | pending | pending | pending | pending | pending | pending | `test-folder-candidate` | Review native absence and zero bindings before cleanup proposal. | Medium | Candidate only. |
| `empty test folder` | none | absent visual | 0 visual | pending | pending | pending | pending | pending | pending | pending | `test-folder-candidate` | Review native absence and zero bindings before cleanup proposal. | Medium | Candidate only. |
| `empty-rt` | none | absent visual | 0 visual | pending | pending | pending | pending | pending | pending | pending | `test-folder-candidate` | Review native absence and zero bindings before cleanup proposal. | Medium | Candidate only. |
| `english-rt` | none | absent visual | 0 visual | pending | pending | pending | pending | pending | pending | pending | `test-folder-candidate` | Review native absence and zero bindings before cleanup proposal. | Medium | Candidate only. |
| `f5d test folder` | none | absent visual | 0 visual | pending | pending | pending | pending | pending | pending | pending | `test-folder-candidate` | Review native absence and zero bindings before cleanup proposal. | Medium | Visible in Desktop only. |
| `unfiled` | none | absent visual | 0 visual | pending | pending | pending | pending | pending | pending | pending | `unfiled-review` | Determine whether this is a real synthetic bucket or local UI category. | Medium | Visible in Desktop. |

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

## Initial Expected Classification

Based on screenshots only:

| Folder/name | Preliminary classification | Reason |
| --- | --- | --- |
| Study | `preserve-canonical` | Present in native canonical visual evidence. |
| Case | `preserve-canonical` plus possible `same-name-id-conflict` | Native has one `Case`; Chrome/Desktop show duplicate `Case`. |
| Dev | `preserve-canonical` | Present in native canonical visual evidence. |
| Code | `preserve-canonical` | Present in native canonical visual evidence. |
| Tech | `preserve-canonical` | Present in native canonical visual evidence. |
| English | `preserve-canonical` plus possible `same-name-id-conflict` | Native has one `English`; Chrome/Desktop show duplicate `English`. |
| Case-RT | `test-folder-candidate` | Test-like suffix, not visible in native screenshot. |
| Empty Test Folder | `test-folder-candidate` | Test-like name, not visible in native screenshot. |
| Empty-RT | `test-folder-candidate` | Test-like suffix, not visible in native screenshot. |
| English-RT | `test-folder-candidate` | Test-like suffix, not visible in native screenshot. |
| F5D Test Folder | `test-folder-candidate` | Test-like name, visible in Desktop screenshot only. |
| Unfiled | `unfiled-review` | Likely synthetic/local bucket; not part of native folder catalog. |
| Any folder with bindings but absent from native | `extra-local` plus review status | Could contain real local data; do not delete automatically. |

## Binding And Count Analysis

Likely reasons counts differ:

- Native counts come from native folder-state memberships in `items[folderId]`.
- Chrome Studio sidebar counts currently may reflect `H2O.LibraryIndex.facets().byFolder`, which counts only known Studio rows.
- Desktop counts may reflect SQLite-known chats through `folders.listChats(folderId)`.
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

Count mismatch is not automatically data loss. It becomes a repair candidate only after binding identities are compared and missing chats are classified.

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

## Proposed P3 Input

Folders-P3 should not start until P2 has:

- Complete Native ChatGPT probe output.
- Complete Chrome Studio probe output.
- Complete Desktop Studio probe output.
- Filled comparison table.
- Candidate cleanup list.
- Same-name conflict groups.
- Missing mirror list.
- Extra local-only list.
- Orphan binding list.
- Binding format mismatch list.

## Proposed Next Actions

1. Run the Native ChatGPT probe from the Folders-P1 runbook.
2. Run the Chrome Studio probe from the Folders-P1 runbook.
3. Run the Desktop Studio probe from the Folders-P1 runbook.
4. Paste the three outputs into the P2 working notes.
5. Build the filled parity matrix.
6. Only then plan cleanup or normalization.

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

P2 remains a reporting phase until runtime inventory data is collected and reviewed.
