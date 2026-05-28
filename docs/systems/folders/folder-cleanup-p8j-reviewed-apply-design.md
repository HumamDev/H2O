# P8j Reviewed Folder Cleanup Apply Design

Phase: P8j-a - reviewed cleanup apply design
Status: Docs/design only; no cleanup apply implementation approved

## Purpose

P8j defines what a future reviewed cleanup apply phase would need to do safely.

The problem it would solve is narrow: reduce Local Review noise by removing or archiving explicitly reviewed imported/test rows that are known to have no bindings, no known references, and no Native ownership.

P8i stopped at apply preview because cleanup is destructive. The P8i stack can identify candidates, generate a dry-run plan, and generate a preview-only apply gate, but it intentionally cannot mutate any folder store.

P8j should not start from mutation code. It should start by making the future target store, row classes, confirmation path, backup/export behavior, and audit receipt contract explicit.

## Allowed Target Scope

Allowed only if a future phase explicitly approves implementation:

- Chrome Studio local review rows only.
- Imported/test rows only by exact `folderId`.
- Rows from an allowed review/test class only.
- Rows with no bindings, no known references, and no Native membership.
- One explicit target surface per apply request.
- One explicit target store per apply request.

Forbidden from this phase:

- Native canonical rows.
- Desktop SQLite direct cleanup.
- Native folder-state cleanup.
- Desktop mirror cleanup unless a separate Desktop design phase approves it.
- Cross-surface cleanup.

Initial implementation target, if approved later:

```text
targetSurface: chrome-studio
targetStore: chrome-folder-mirror-local-review
```

## Forbidden Actions

The future apply phase must still forbid:

- Never merge by name.
- Never delete Native-owned canonical rows.
- Never delete rows with bindings.
- Never delete rows with known counts.
- Never apply with stale diagnostics.
- Never apply based only on test-looking names.
- Never apply across surfaces without explicit target surface.
- Never treat orphan memberships as deletion permission.
- Never apply to Desktop SQLite in this phase.
- Never run cleanup automatically on boot, refresh, diagnostics, or mirror refresh.
- Never delete `Unfiled` or any system row.

Display names are not identity. Exact folder IDs are identity.

## Required Apply Gates

Every future apply request must pass all gates:

| Gate | Requirement |
| --- | --- |
| Fresh diagnostics | Diagnostics must be generated inside the approved freshness window. |
| Dry-run plan | A dry-run plan must exist. |
| Apply preview | An apply preview must exist. |
| Plan identity | Dry-run hash/checksum must match the apply-preview hash/checksum. |
| Exact folder ID | Each selected row must have an exact `folderId`. |
| Explicit selection | Apply request must include an explicit selected IDs list. |
| Backup/export | Backup/export must be completed before apply. |
| Per-row blockers | All per-row blockers must be cleared. |
| Confirmation phrase | User must type the exact required confirmation phrase. |
| Audit receipt | An audit receipt must be generated for preview and result. |
| Target store | Request must name exactly one target store. |
| Target surface | Request must name exactly one target surface. |

Any failed gate blocks apply.

## Proposed Schemas

### Apply Request

```js
{
  schema: "h2o.folder-cleanup-apply-request.v1",
  phase: "P8j",
  requestedAt: "ISO timestamp",
  actorSurface: "chrome-studio",
  targetSurface: "chrome-studio",
  targetStore: "chrome-folder-mirror-local-review",
  action: "archive-review-row" | "remove-imported-test-row",
  dryRunSchema: "h2o.folder-cleanup-dry-run.v1",
  dryRunHash: "string",
  applyPreviewSchema: "h2o.folder-cleanup-apply-preview.v1",
  applyPreviewHash: "string",
  selectedFolderIds: ["exact-folder-id"],
  confirmation: "EXACT CONFIRMATION TEXT",
  noNativeCanonicalRows: true,
  noCrossSurfaceApply: true
}
```

### Apply Result

```js
{
  schema: "h2o.folder-cleanup-apply-result.v1",
  ok: true,
  applied: true,
  generatedAt: "ISO timestamp",
  actorSurface: "chrome-studio",
  targetSurface: "chrome-studio",
  targetStore: "chrome-folder-mirror-local-review",
  action: "archive-review-row",
  dryRunHash: "string",
  applyPreviewHash: "string",
  selectedFolderIds: [],
  appliedFolderIds: [],
  skippedFolderIds: [],
  blockers: [],
  warnings: [],
  beforeSummary: {
    reviewRowCount: 0,
    bindingCount: 0,
    knownCount: 0
  },
  afterSummary: {
    reviewRowCount: 0,
    bindingCount: 0,
    knownCount: 0
  },
  auditReceiptId: "string"
}
```

### Audit Receipt

```js
{
  schema: "h2o.folder-cleanup-audit-receipt.v1",
  receiptId: "string",
  createdAt: "ISO timestamp",
  actorSurface: "chrome-studio",
  targetSurface: "chrome-studio",
  targetStore: "chrome-folder-mirror-local-review",
  action: "preview" | "apply",
  dryRunHash: "string",
  applyPreviewHash: "string",
  selectedFolderIds: [],
  confirmationMatched: false,
  backupRef: "string",
  beforeDiagnostics: {},
  dryRunPlan: {},
  applyPreview: {},
  applyResult: {},
  errors: []
}
```

## UI Proposal

The UI must keep preview and apply visibly separated.

Recommended layout:

- Keep the existing Cleanup / Review subtabs.
- Keep Dry-run Plan and Preview Gate as no-mutation areas.
- Add apply only behind an explicit hidden-by-default control:
  - `Enable reviewed apply mode`
- Show a selected-row confirmation table before any apply button appears.
- Require users to review exact `folderId`, name, source, class, counts, and blockers.
- Show per-row blockers inline.
- Disable apply until every gate is satisfied.
- Require an exact final confirmation phrase.
- Show backup/export status before enabling apply.
- Show a post-apply receipt view.

Apply must never be enabled by default.

Prohibited UI labels for P8j-a docs/design:

- Delete
- Remove
- Merge
- Repair
- Normalize
- Execute
- Apply now

Those labels may appear only in future implementation design if paired with explicit blockers, confirmation gates, and target store proof.

## Risk Model

### Duplicate-Name Risk

Rows can share names while representing different identities. `Case` and `English` conflicts proved that name is not safe identity.

Mitigation:

- never merge by name
- require exact `folderId`
- display duplicate groups before apply

### Orphan Membership Risk

Orphan memberships indicate diagnostic inconsistency. They do not grant deletion permission.

Mitigation:

- block candidates with overlapping orphan risk
- show orphan counts and IDs in the confirmation table
- require a separate review note if orphan risk is unrelated

### Stale Diagnostics Risk

Folder state can change after dry-run or preview. Applying a stale plan can remove the wrong row or miss a blocker.

Mitigation:

- diagnostics freshness window
- dry-run hash match
- apply-preview hash match
- final pre-apply validation

### Cross-Surface Mismatch Risk

Chrome Studio mirror rows, Native canonical rows, Desktop mirror rows, and Desktop SQLite rows are different stores with different authority.

Mitigation:

- one target surface
- one target store
- no Desktop SQLite cleanup in Chrome phase
- no Native canonical cleanup through cleanup UI

### Rollback and Reversibility Limits

Hard deletion may not be reversible if the backing store has no tombstone or archive.

Mitigation:

- prefer archive/hide/mark-reviewed first
- require backup/export before mutation
- generate audit receipt
- record before/after summaries

## Recommended Implementation Split

Recommended sequence:

| Phase | Scope |
| --- | --- |
| P8j-a | Docs-only reviewed apply design. |
| P8j-b | Apply-preview hardening if needed; still no mutation. |
| P8j-c | Chrome-only local review apply prototype, only if explicitly approved. |
| P8j-d | Desktop cleanup design only, later and separate. |

P8j-c must not start unless the user explicitly approves destructive cleanup implementation.

## Decision

Conservative recommendation:

```text
Pause implementation at P8j-a unless cleanup noise becomes a product blocker.
```

If real apply becomes necessary, start with Chrome-only local review rows, exact IDs, fresh diagnostics, matching dry-run/apply-preview hashes, backup/export, and audit receipt. Do not include Native canonical rows or Desktop SQLite.
