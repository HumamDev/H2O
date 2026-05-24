# Folder Metadata Authority Contract - P8h

Phase: P8h-d1 / P8h-d2
Status: Contract and preview model only, no metadata mutation enabled

## Purpose

This contract defines the authority model for canonical folder metadata actions across:

- Native ChatGPT with the H2O sidebar
- Chrome Studio
- Desktop Studio

It applies to canonical folder metadata fields and actions:

- Folder ID
- Name or title
- Color, icon color, and icon
- Sort or display order
- Delete or active state

This document does not enable rename, color change, delete, purge, repair, merge, or sync apply behavior. It defines the rules future phases must satisfy before those actions are allowed.

## Current authority map

| Surface | Current read path | Current write path | Authority status |
| --- | --- | --- | --- |
| Native H2O sidebar | `h2o:prm:cgx:fldrs:state:data:v1` and `H2O.folders` | Active H2O folder-state actions for color, rename, and delete | H2O canonical folder-state, not proven official ChatGPT API |
| Chrome Studio | `FolderParity` display model from native broadcast or stored mirror | Canonical menu actions are disabled/read-only | Display and mirror only |
| Desktop Studio | `FolderParity` display model from Desktop mirror | Canonical menu actions are disabled/read-only; cleanup remains Settings-only | Display and mirror only |
| Desktop SQLite `folders` and `folder_bindings` | Local Studio folder and binding store | Guarded local cleanup flows only | Not canonical folder metadata authority |

## Important limitation

No official ChatGPT folder rename, delete, or color API is currently proven.

Existing Native H2O sidebar actions mutate H2O folder-state. They must not be described as official ChatGPT folder metadata mutations until a supported native authority path is proven.

Chrome Studio and Desktop Studio must keep canonical rename, delete, and color mutation disabled until a reviewed cross-surface metadata operation path exists.

## Rename authority

Rename is an ID-preserving metadata operation.

Required rules:

- The folder ID must remain stable.
- Rename must be previewed before it can be applied.
- Same-name or ambiguous-name conflicts block the operation.
- A stale preview hash blocks the operation.
- Chrome Studio and Desktop Studio direct rename remains disabled until the F7 folder metadata operation path exists.
- The operation must record before and after metadata, source surface, source peer, and audit details.

Recommended authority:

- Native H2O canonical folder-state may remain the current local authority.
- Future cross-surface rename should be expressed as a reviewed folder metadata operation, then applied through the F7 folder metadata comparator and apply-check path.

## Color authority

Canonical folder color is resolved as:

```text
iconColor || color
```

Required rules:

- Canonical color lives in canonical folder-state.
- Local row appearance overrides are local-only.
- Local row appearance overrides must not silently override canonical folder rows.
- Color changes must update canonical folder metadata, not `h2o:studio:sidebar:row-appearance:v1`.
- Studio color mutation remains disabled until metadata operation authority exists.
- Native H2O color mutation should be treated as H2O canonical-state mutation only, not official ChatGPT mutation.

Local appearance overrides may remain available for non-canonical or Local Review rows where they are clearly surface-local.

## Delete authority

Delete is destructive and must never be a direct one-click menu action.

Required rules:

- Delete must produce a preview before mutation.
- Delete requires exact confirmation.
- Delete requires audit.
- Empty-folder delete is the first possible future scope.
- Non-empty delete remains blocked until membership policy exists.
- Local Review rows are not canonical delete targets.

Delete preview must include:

- Native memberships
- `known here` counts
- Local Review dependencies
- Desktop SQLite folder and binding references
- Chrome local references
- Before and after hashes or equivalent stale-state protection

Future non-empty delete must explicitly choose and document membership behavior:

- Block while non-empty
- Move chats to Unfiled
- Tombstone or otherwise record the deletion

Until that policy exists, non-empty canonical folder deletion is blocked.

## Propagation matrix

| Direction | Current status |
| --- | --- |
| Native H2O state -> Chrome Studio | Mostly supported through native broadcast and Studio merge |
| Native H2O state -> Desktop Studio | Not automatic; Desktop mirror refresh or import is needed today |
| Chrome Studio -> Native H2O state | Unsafe and not implemented |
| Desktop Studio -> Native H2O state | Unsafe and not implemented |
| Chrome Studio <-> Desktop Studio | Requires export/import or a future operation log |
| Native H2O menu -> all surfaces | Chrome may observe through broadcast; Desktop is not reliable without refresh/import |

This means Native-to-Chrome display propagation exists for many cases, but all-direction metadata sync is not proven.

## Operation log recommendation

Future metadata mutation should use a reviewed operation object:

```js
{
  operationId,
  operationType: "rename-folder" | "change-folder-color" | "delete-folder",
  folderId,
  before,
  after,
  sourceSurface,
  sourcePeerId,
  createdAt,
  previewHash,
  status: "previewed" | "confirmed" | "applied" | "rejected",
  audit
}
```

The operation log overlaps with F7.1b and the broader F7 folder metadata comparator and apply-check path. P8h should define the parity UX and safety contract. F7 should own bidirectional metadata comparison, conflict detection, operation application, and cross-surface propagation.

## Read-only operation preview model

P8h-d2 defines the read-only preview object for future canonical folder metadata operations. This preview model is a contract only. It must not write folder-state, Chrome storage, Desktop SQLite, native state, or generated sync artifacts.

```js
{
  schema: "h2o.folder-metadata-operation-preview.v1",
  readOnly: true,
  noMutation: true,
  operationId,
  operationType: "rename-folder" | "change-folder-color" | "delete-folder",
  folderId,
  sourceSurface,
  generatedAt,
  before,
  proposed,
  affectedSurfaces,
  dependencySummary,
  staleGuard: {
    sourceHash,
    folderHash,
    membershipHash,
    dependencyHash,
    previewHash
  },
  blockers,
  warnings,
  requiredAuthority,
  canApply: false
}
```

`canApply` is always `false` for P8h-d2. Later apply planning must be owned by the reviewed F7 folder metadata comparator and apply-check path.

### Required preview snapshots

A complete preview needs read-only evidence from:

- Native canonical folder-state:
  - folder row
  - `items[folderId]`
  - sort or display order
  - `color`, `iconColor`, and `icon`
- Chrome Studio `FolderParity` snapshot.
- Desktop Studio `FolderParity` snapshot.
- Local `known here` counts per surface.
- Local Review references.
- Desktop SQLite folder and binding references for delete previews.
- Chrome local references for delete previews.
- F7 metadata comparator output when available.

### Rename preview validation

Rename previews must verify:

- Folder ID remains stable.
- New name is non-empty after normalization.
- Same-name conflicts block the preview.
- Stale source or folder hash blocks the preview.
- Local Review rows are invalid targets.
- Official ChatGPT folder mutation authority remains unproven.

### Color preview validation

Color previews must verify:

- Proposed color is a valid approved token or hex value.
- Target field is canonical `iconColor` or `color`.
- Local row appearance is never the mutation target.
- Local override data is ignored for canonical preview.
- Folder ID and name remain unchanged.
- Apply remains blocked until F7 authority exists.

### Delete preview validation

Delete previews must verify:

- The operation is preview-only.
- Empty-folder delete is the first possible future scope.
- Non-empty delete blocks.
- Preview includes native memberships, `known here` counts, Local Review references, Desktop references, and Chrome references.
- Membership behavior is defined before any real delete.
- Local Review rows are not canonical delete targets.

## Preview blocker model

Folder metadata previews use explicit blocker codes:

- `operation-preview-only`
- `metadata-authority-not-proven`
- `official-chatgpt-folder-api-unproven`
- `stale-source-hash`
- `stale-folder-hash`
- `target-not-canonical`
- `local-review-target-blocked`
- `same-name-conflict`
- `invalid-folder-name`
- `invalid-color`
- `delete-non-empty-folder-blocked`
- `delete-membership-policy-missing`
- `desktop-reference-check-required`
- `chrome-reference-check-required`
- `f7-operation-log-required`

Additional blockers may be added later, but they must remain explicit and redacted by default.

## Stale guard and hash model

Future apply planning must recompute the stale guard and reject mismatches. Hash inputs are normalized and redacted in preview output.

| Hash | Required input |
| --- | --- |
| `folderHash` | Folder ID, name/title, `color`, `iconColor`, `icon`, sort order, parent, and metadata presence |
| `membershipHash` | Canonical `items[folderId]` membership IDs and count; raw IDs are redacted in output |
| `sourceHash` | Relevant canonical folder-state boundary |
| `dependencyHash` | Local Review, `known here`, Desktop reference, and Chrome reference summaries |
| `previewHash` | Operation type, folder ID, before/proposed metadata, and stale guard hashes |

## F7 relationship

P8h owns the folder parity UX contract and action parity. F7 owns bidirectional metadata comparison, conflict detection, operation logging, and apply checks.

Implementation rules:

- Use existing F7 preview and apply-planning modules where possible.
- Do not create a second folder metadata mutation path.
- Extend F7 from color-only planning to rename and delete only after authority review.
- Keep P8h renderers and menus read-only until F7 reports a safe reviewed operation path.

Future source work, if approved, should extend:

- `src-surfaces-base/studio/sync/bidirectional-folder-preview.js`
- `src-surfaces-base/studio/sync/folder-metadata-apply-plan.js`
- `src-surfaces-base/studio/sync/folder-metadata-apply-checks.tauri.js`

Future source work should avoid:

- P8 renderers unless adding preview UI.
- Sync/tombstone lifecycle files.
- Generated dist output.
- Native mutation handlers outside a reviewed authority phase.

## Safety rules

- Studio surfaces cannot silently mutate canonical folder metadata.
- Local Review rows are never canonical mutation targets.
- Rename, delete, and color change require authority proof.
- Delete requires preview, exact confirmation, and audit.
- Non-empty delete is blocked until membership policy exists.
- Official ChatGPT folder metadata mutation remains unproven.
- Local appearance overrides cannot silently replace canonical colors.
- Cross-surface mutation must be auditable.
- Rename and color change should be reversible where practical.
- Stale previews and conflicting metadata block mutation.

## Recommended future phases

| Phase | Scope |
| --- | --- |
| P8h-d1 | Docs-only folder metadata authority model |
| P8h-d2 | Read-only folder metadata operation preview model |
| F7.1b | Folder metadata comparator and operation log coordination |
| P8h-e | Reviewed canonical color change |
| P8h-f | Reviewed canonical rename |
| P8h-g | Empty-folder delete preview |
| P8h-h | Final action parity proof |

## Implementation boundary

This contract does not authorize source changes by itself. Any future source implementation must prove:

- No unintended native, Chrome, Desktop, or SQLite mutation.
- Before and after metadata hashes match the preview.
- Conflict and stale-preview blockers work.
- Local Review rows remain protected.
- Chrome Studio and Desktop Studio do not bypass the reviewed operation path.
