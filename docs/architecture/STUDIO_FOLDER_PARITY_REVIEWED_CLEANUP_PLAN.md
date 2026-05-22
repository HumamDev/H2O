# Studio Folder Parity Reviewed Cleanup Plan

## Purpose

Folders-P7 defines how folder cleanup may happen in a later phase. It does not introduce cleanup, deletion, merge, repair, or normalization behavior.

The current folder parity state is intentionally review-required:

- Native canonical folders: 6
- Native canonical memberships: 8
- Local folders observed by Studio self-check: 15
- Local bindings observed by Studio self-check: 8
- Extra local folders: 9
- Duplicate normalized-name groups: 2
- Test-folder candidates: 7
- Orphan native memberships: 4

P7 starts with a safety plan because folder cleanup can destroy user organization data if same-name folders, bindings, or native-only memberships are merged or deleted automatically.

## Safety Principles

- No automatic deletion.
- No automatic merge.
- No cleanup on boot.
- No cleanup from `H2O.Library.FolderParity.selfCheck()`.
- No hidden mutation from diagnostics, display models, or refresh actions.
- No deleting canonical native `f_*` folders.
- No deleting folders with bindings without explicit reviewed confirmation.
- No modifying native ChatGPT folder-state directly.
- No Chrome write to the sync folder.
- No bidirectional sync.
- No Mobile/WebDAV scope.
- No SQLite schema change.
- Chrome cleanup and Desktop cleanup are separate actions because they mutate different stores.

## Candidate Model

Every cleanup candidate should be represented with a review object before any action is available:

```js
{
  folderId,
  name,
  normalizedName,
  classification,
  surface,
  isCanonical,
  isExtra,
  isTestCandidate,
  isConflict,
  bindingCount,
  bindings,
  knownChatRows,
  nativePresence,
  proposedAction,
  riskLevel,
  requiresApproval,
  reversible,
  warnings
}
```

The review object must include exact folder IDs, exact bindings, and surface-specific source information. Same-name folders with different IDs are conflicts, not duplicates to merge automatically.

## Candidate Classes

### Safe Empty Extra/Test Candidates

These are candidates that may become eligible for deletion in P7b only if all conditions are true:

- `nativePresence === false`
- `bindingCount === 0`
- not canonical
- selected explicitly by the user
- included in a preview and audit record

### Same-Name Conflicts

Examples:

- `fld-case` vs canonical Case `f_5d9431084707f19dba53d548`
- `fld-english` vs canonical English `f_2bb1037f88b2719dbac10c22`

These require conflict review. They must not be merged or deleted automatically, even if currently empty.

### Bound Test Candidates

Any test-looking folder with bindings is review-only. Current known example:

- `f5d1-test-folder-b` if `bindingCount > 0`

Bound candidates require the exact binding list and a separate approval flow before any future delete or move.

### Orphan Memberships

Orphan native memberships are native folder memberships that are not represented by known saved/indexed/linked Studio rows. They are not deletion candidates. They indicate count/projection gaps or missing known chat rows.

### Canonical Folders

Canonical native folders are preserved:

- Study: `f_7050f49d3f341819dba53d547`
- Case: `f_5d9431084707f19dba53d548`
- Dev: `f_0606ea698948f19dba53d548`
- Code: `f_e301f3506938c19dbac0e304`
- Tech: `f_3bf15f43b835d19dbac0fb13`
- English: `f_2bb1037f88b2719dbac10c22`

### Virtual Folders

`Unfiled` is a virtual bucket, not a real folder row. It is never deleted or merged as a folder record.

## Allowed P7a Actions

P7a is review-only:

- Ignore a candidate in UI memory.
- Mark a candidate reviewed in UI memory, or use no persistence.
- Copy cleanup plan JSON.
- Open existing folder detail routes for inspection.
- Refresh diagnostics and self-check.

P7a must not mutate storage.

## Disallowed P7a Actions

P7a must not:

- delete folders
- merge folders
- move bindings
- write Chrome storage
- write SQLite
- mutate native folder-state
- repair, normalize, or dedupe any store
- expose cleanup buttons that perform writes

## P7b Future Mutation Policy

P7b may add deletion only for selected empty local extra/test folders after explicit approval.

Required conditions:

- `nativePresence === false`
- `bindingCount === 0`
- folder is not canonical
- exact folder ID and name are visible in the preview
- user explicitly selects the candidate
- user types confirmation text:

```text
DELETE EMPTY TEST FOLDERS
```

Required execution flow:

1. Run `H2O.Library.FolderParity.selfCheck({ fresh: true })`.
2. Generate the candidate list.
3. Filter to eligible empty local extra/test candidates.
4. Show exact folder IDs, names, surfaces, and before counts.
5. Require typed confirmation.
6. Write an audit record before mutation.
7. Delete only the selected eligible candidates.
8. Rerun self-check.
9. Show before/after diff and any errors.

P7b should start with Chrome mirror cleanup only. Desktop cleanup must wait for a later phase.

## Never-Delete / Review-Only List

Never auto-delete:

- canonical native folders:
  - Study
  - Case
  - Dev
  - Code
  - Tech
  - English
- same-name conflicts:
  - `fld-case`
  - `fld-english`
- any folder with bindings
- `f5d1-test-folder-b` when `bindingCount > 0`
- orphan memberships
- `Unfiled`
- any native-present folder

## Chrome vs Desktop Strategy

Chrome Studio cleanup affects only the Chrome mirror in `chrome.storage.local`, especially:

- `h2o:prm:cgx:fldrs:state:data:v1`

Desktop cleanup affects SQLite:

- `folders`
- `folder_bindings`

These must be separate controls and separate confirmations. A cleanup action must clearly state which surface it mutates.

P7b should start with Chrome mirror cleanup only because Chrome currently lacks a public safe folder-delete API and needs a narrowly scoped, reviewed writer. Desktop already has a powerful `H2O.Studio.store.folders.remove()` API that cascades bindings and writes tombstones, so Desktop deletion should wait for stricter binding review and proof.

## Audit Strategy

Future destructive actions must record an audit entry before mutation.

Audit record fields:

- timestamp
- surface
- selected folder IDs
- selected folder names
- before `selfCheck`
- proposed action
- confirmation text matched
- result
- after `selfCheck`
- errors

Chrome can use a local audit key in a future P7b implementation if mutation is added. Desktop should rely on existing tombstones where available and also record a cleanup audit entry if cleanup is initiated from Studio UI.

## UI Flow

Primary location: Settings -> Folder Parity.

P7a UI:

1. User opens Folder Parity.
2. User clicks `Review cleanup candidates`.
3. Studio runs `FolderParity.selfCheck()` and `FolderParity.getDisplayModel()`.
4. Studio shows grouped candidates:
   - safe empty extra/test candidates
   - same-name conflicts
   - bound test candidates
   - orphan memberships
   - canonical folders for reference
5. Studio allows copy/export of cleanup plan JSON.
6. No mutation controls are enabled.

P7b UI may add checkboxes only for eligible safe candidates and must require typed confirmation before deletion.

## Future Phases

- P7a: Candidate review UI, no mutation.
- P7b: Safe empty Chrome mirror deletion after explicit confirmation and audit.
- P7c: Same-name conflict resolution plan for duplicate Case/English.
- P7d: Desktop cleanup with strict binding review, tombstone verification, and separate confirmation.

## Future Validation

For implementation phases:

```bash
node --check "src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js"
node --check src-surfaces-base/studio/studio.js
node tools/loader/validate-loader-order.mjs
node tools/validation/library/validate-folder-provider-core.mjs
npm run dev:check
git diff --cached --check
npm run dev:all
```

Runtime proof for P7a:

- Candidate list appears.
- Safe vs review-only groups are correct.
- `f5d1-test-folder-b` is not safe-delete if it has any binding.
- No delete, merge, repair, normalize, or cleanup mutation exists.
- Self-check counts do not change after refresh.

Runtime proof for P7b:

- Deletes only explicitly selected empty test/extra folders.
- Requires typed confirmation.
- Writes audit record before mutation.
- Reruns self-check after mutation.
- Canonical `f_*` folders remain unchanged.
- Native ChatGPT folder-state remains unchanged.
- No bindings are lost.
- No cleanup runs on boot, refresh, or self-check.
