# Studio Folder Parity Normalization Plan

Phase: Folders-P3

Status: planning only

Related docs:

- `docs/architecture/STUDIO_FOLDER_PARITY_INVENTORY_RUNBOOK.md`
- `docs/architecture/STUDIO_FOLDER_PARITY_CANONICAL_REPORT.md`

## Purpose

Folders-P3 defines a non-destructive normalization strategy for folder parity across:

1. Native ChatGPT
2. Chrome Studio / Studio Launcher
3. Desktop Studio

This plan does not authorize cleanup, deletion, merge, schema changes, bidirectional sync, or folder repair. It defines how later phases should represent canonical native folders, local extras, conflicts, test-folder candidates, and count differences without losing data.

## Current Findings

Runtime probes from Folders-P2 show:

| Surface | Folder catalog | Bindings | Duplicates/extras |
| --- | --- | ---: | --- |
| Native ChatGPT | 6 canonical folders | 8 native bindings | No duplicates; no test folders |
| Chrome Studio | 12 folders | 8 stored folder-state bindings | Duplicate `Case`, duplicate `English`, test folders |
| Desktop Studio | 15 SQLite folders | 0 SQLite folder bindings | Duplicate `Case`, duplicate `English`, F5D/test folders |

Canonical native folder IDs:

| Folder | Canonical ID |
| --- | --- |
| Study | `f_7050f49d3f341819dba53d547` |
| Case | `f_5d9431084707f19dba53d548` |
| Dev | `f_0606ea698948f19dba53d548` |
| Code | `f_e301f3506938c19dbac0e304` |
| Tech | `f_3bf15f43b835d19dbac0fb13` |
| English | `f_2bb1037f88b2719dbac10c22` |

Known non-canonical/test/extra IDs:

- `fld-case` — duplicate Case
- `fld-english` — duplicate English
- `fld-rt-case` — Case-RT
- `fld-empty-1779324991364` — Empty Test Folder
- `fld-rt-empty` — Empty-RT
- `fld-rt-eng` — English-RT
- `f5d-test-folder-001` — F5D Test Folder
- `f5d1-test-folder-a` — F5D.1 Test Folder A
- `f5d1-test-folder-b` — F5D.1 Test Folder B
- `__none__ / Unfiled` — virtual bucket, not a real folder row

## Canonical Model

Native ChatGPT folder state is the canonical source for user-facing folders unless a future probe disproves it.

Canonical folder identity is ID-primary:

- Folder ID is the stable identity.
- Display name is metadata.
- Same display name with a different ID is a conflict, not a duplicate to merge automatically.
- Empty folders are real catalog rows and must be preserved.
- Visual metadata such as `color`, `iconColor`, `icon`, `sortOrder`, `createdAt`, and `updatedAt` should be mirrored when present.

Canonical mirror shape for future phases:

```js
{
  schemaVersion: 1,
  source: "native-chatgpt-folder-state",
  capturedAt: "ISO timestamp",
  folders: [
    {
      id: "f_*",
      name: "Study",
      color: "",
      iconColor: "",
      icon: "",
      sortOrder: 0,
      createdAt: "",
      updatedAt: "",
      canonical: true
    }
  ],
  items: {
    "f_*": ["/c/<chat-id>"]
  },
  counts: {
    byFolderId: { "f_*": 0 },
    bindingCount: 0
  }
}
```

Chrome Studio and Desktop should mirror this canonical state without deleting local extras. The mirror should be read as canonical display/membership metadata, while local stores may still contain extra folders until reviewed.

## Count Model

Folder parity needs separate count labels. One number cannot safely represent all folder states.

| Label | Meaning | Source |
| --- | --- | --- |
| Canonical count | Number of native folder-state memberships for the canonical folder ID. | Native `items[folderId]` mirrored into Chrome/Desktop |
| Known in Studio count | Number of Studio `LibraryIndex` rows that currently resolve to the folder. | Chrome/Desktop `LibraryIndex` facets |
| Saved count | Number of saved/captured Studio rows assigned to the folder. | Studio saved rows / Desktop SQLite chats |
| Linked count | Number of linked-only Studio rows assigned to the folder. | Studio linked rows where folder metadata exists |
| Orphan membership count | Number of canonical memberships that do not resolve to known Studio rows. | Canonical count minus resolved known rows |

Display rule:

- Sidebar compact rows should prefer canonical count for catalog parity.
- Detail views may show both canonical count and known-in-Studio count when they differ.
- Desktop saved rows in `Unfiled` should not be treated as canonical folder members unless a binding exists.
- Count mismatch should surface as explainable status, not repair by default.

Example display language for a future folder page:

```text
Tech
2 native memberships · 0 known in Studio
```

This avoids hiding native memberships while making clear that Studio has not hydrated those chats as local saved/linked rows.

## Mirror Strategy

Normalization should be non-destructive.

For Chrome Studio:

1. Keep the current native folder-state mirror.
2. Mark rows whose IDs are in the canonical native set as `canonical`.
3. Mark rows absent from native as `extra-local`.
4. Mark same-name/different-ID groups as `same-name-id-conflict`.
5. Mark known test-name IDs as `test-folder-candidate`.
6. Preserve all existing rows and bindings.

For Desktop Studio:

1. Preserve existing SQLite folder rows.
2. Add or refresh a canonical folder-state mirror separate from cleanup state.
3. Do not delete SQLite extra rows.
4. Mark existing canonical `f_*` rows as canonical.
5. Mark local-only rows as extras/conflicts/test candidates.
6. Do not create SQLite `folder_bindings` for native memberships unless P4 explicitly chooses that approach.

Export/import consistency:

- Export should continue to preserve both SQLite folder rows and any fallback/canonical folder-state mirror.
- Import should remain merge-only.
- Later phases should add diagnostics that report canonical/extras/conflicts, not silently collapse them.
- Any future import/export behavior change must be justified separately.

## Binding Strategy

Native memberships may be stored as:

- full ChatGPT URLs
- `/c/<chat-id>`
- bare chat IDs

Future comparison logic must normalize all three to the same chat ID before reporting mismatches.

Desktop currently has:

- canonical folder rows present
- `sqliteBindingCount: 0`
- fallback folder-state empty

Options considered:

| Option | Behavior | Risk |
| --- | --- | --- |
| Store canonical memberships directly in SQLite `folder_bindings` | Makes Desktop folder counts match canonical native counts through existing SQLite API. | Risky because `folder_bindings` may imply the chat exists locally; current store hydrates bindings through saved chats. Unsaved native memberships could become apparent orphan rows or force assumptions into saved-chat workflows. |
| Store canonical memberships only in a separate canonical mirror | Preserves native memberships without pretending Desktop has local saved chats. | Requires UI/count readers to consult mirror counts separately. |
| Store both mirror and SQLite bindings | Gives maximum compatibility but risks duplicate/conflicting semantics. | Highest ambiguity unless schema/meaning is clarified. |

Recommended safest option:

Use a separate canonical folder-state mirror first. Do not write native memberships into Desktop SQLite `folder_bindings` until the UI and store contract explicitly distinguish native membership from local saved-chat binding.

This keeps Desktop honest:

- canonical native count can display from the mirror
- known Desktop count can display from SQLite
- orphan/unresolved memberships can be reported without creating fake saved-chat associations

## Conflict Policy

Same-name/different-ID conflicts:

- Native `Case`: `f_5d9431084707f19dba53d548`
- Duplicate `Case`: `fld-case`
- Native `English`: `f_2bb1037f88b2719dbac10c22`
- Duplicate `English`: `fld-english`

Rules:

1. Never auto-merge same-name/different-ID folders.
2. Show conflict status in diagnostics.
3. Preserve all bindings on all IDs until a user-reviewed resolution is approved.
4. If the duplicate folder has zero bindings and no important metadata, it can become a cleanup candidate.
5. If the duplicate folder has bindings, a future resolution must list every binding and proposed target before approval.
6. Deleting or merging conflicts belongs in a later manual cleanup phase, not normalization.

## Test-Folder Policy

Known test-folder candidates:

- Case-RT
- Empty Test Folder
- Empty-RT
- English-RT
- F5D Test Folder
- F5D.1 Test Folder A
- F5D.1 Test Folder B

Rules:

1. Mark as `test-folder-candidate` when name/ID matches known test patterns.
2. Delete only if native-absent and empty across all relevant stores.
3. If bindings exist, require full review of binding IDs and target chats.
4. If visual metadata exists, include it in the review report.
5. Even a safe empty test candidate still requires user approval before deletion.

## Future Implementation Phases

| Phase | Goal | Destructive? |
| --- | --- | --- |
| P4a | Add read-only folder parity status/diagnostics to Studio. | No |
| P4b | Add canonical mirror display counts. | No |
| P4c | Add reviewed cleanup tool for empty test folders. | Only after explicit approval |
| P4d | Add reviewed conflict resolution for same-name folders. | Only after explicit approval |
| P5 | Make Folder sidebar `More` open `#/library/folders`. | No |
| P6 | Add continuous parity validator/self-check. | No |

## Likely Files For Future Phases

Chrome Studio folder mirror/count display:

- `src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js`
- `src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js`
- `src-surfaces-base/studio/S0F1c. 🎬 Library Index - Studio.js`
- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `src-surfaces-base/studio/S0F1d. 🎬 Library Insights - Studio.js`

Desktop folder mirror/import:

- `src-surfaces-base/studio/store/folders.tauri.js`
- `src-surfaces-base/studio/ingestion/import-bundle.tauri.js`
- `src-surfaces-base/studio/ingestion/export-bundle.tauri.js`
- optional new Desktop mirror adapter if P4 chooses separate mirror storage

Cleanup tooling:

- new read-only-first tool under `tools/validation/library/`
- future reviewed repair tool under a separate `tools/repair/` path, only after approval
- optional Studio UI later, gated behind explicit review

Folders page:

- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `src-surfaces-base/studio/S0F1d. 🎬 Library Insights - Studio.js`
- `src-surfaces-base/studio/S0F0a. 🎬 Library Surface Host - Studio.js` if route parsing needs an explicit folder-page variant

Validation script:

- `tools/validation/library/validate-folder-provider-core.mjs`
- possible new `tools/validation/library/validate-folder-parity.mjs`

## Runtime Proof Plan For Future Work

For every future implementation phase:

1. Capture before-state:
   - Native folder count
   - Native binding count
   - Chrome folder count
   - Chrome canonical/extras/conflict counts
   - Desktop folder count
   - Desktop canonical/extras/conflict counts
2. Prove native canonical unchanged:
   - 6 canonical `f_*` rows remain
   - 8 native bindings remain
   - no native test folders introduced
3. Prove no deletion without approval:
   - Extra folder IDs still exist after non-destructive phases
   - Conflict IDs still exist after non-destructive phases
4. Prove Chrome parity status:
   - canonical folders marked
   - extras marked
   - conflicts marked
   - canonical count separated from known row count
5. Prove Desktop parity status:
   - canonical folders marked
   - extras marked
   - conflicts marked
   - SQLite count remains distinct from canonical mirror count
6. Prove visible explanation:
   - user can see why native count and known Studio count differ
   - `Unfiled` remains a virtual bucket, not a cleanup candidate

For cleanup phases only:

1. Generate review report.
2. Show exact folder IDs to delete or merge.
3. Show exact bindings affected.
4. Require explicit user approval.
5. Run post-cleanup parity inventory.

## Commit Boundary

P3 is docs-only.

Expected file:

- `docs/architecture/STUDIO_FOLDER_PARITY_NORMALIZATION_PLAN.md`

Suggested commit:

```text
Document folder parity normalization plan
```

## Safety Boundaries

- No automatic deletion.
- No automatic merge.
- No cleanup in P3.
- No repair in P3.
- No folder sync behavior change in P3.
- No import/export bundle change in P3.
- No SQLite schema change.
- No bidirectional sync.
- No Chrome write to sync folder.
- No Mobile/WebDAV.
- No Rust/Tauri/Cargo/capability changes.
- No source behavior changes.
- No generated output.
- No unrelated dirty files.

P3 is complete when this plan is committed and the next phase is ready to start from a non-destructive implementation proposal.
