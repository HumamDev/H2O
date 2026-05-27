# P8i-d Folder Cleanup Destructive-Action Gate

Phase: P8i-d - destructive-action design gate
Status: Docs/design only; no cleanup apply approved

## Verdict

Cleanup apply should not be implemented automatically or broadly.

The safest decision is to keep P8i dry-run only unless a later phase explicitly approves a narrow target store, exact row class, exact ID confirmation, backup/export behavior, and audit receipt. If apply is ever added, it should start with an apply-preview-only phase before any mutation.

Recommended next phase:

```text
P8i-e1 - cleanup apply preview only, still no mutation
```

This keeps momentum while preserving the current no-mutation boundary.

## Should Cleanup Apply Exist?

### Benefits

- Removes stale imported/test rows after they are reviewed.
- Reduces Local Review noise.
- Makes duplicate/imported/test row status easier for users to understand.
- Creates a path to retire known test artifacts without manual storage edits.

### Risks

- Folder IDs can overlap display names; deleting by name can remove the wrong row.
- Review rows may still have bindings or references not visible in a stale diagnostic run.
- Desktop SQLite is a real local store and must not be touched accidentally.
- Chrome mirror cleanup and Desktop cleanup are different target stores.
- Orphan memberships are diagnostic risk, not cleanup permission.
- Test-looking names are not sufficient proof of safe deletion.
- A broad cleanup API could become a hidden data-loss path.

### Alternatives

- Keep cleanup dry-run only and leave review rows visible.
- Add a "mark reviewed" display-only classification without deleting data.
- Export a cleanup report for manual/operator review.
- Add apply preview only, still no mutation, to harden contracts and blockers.
- Defer all destructive cleanup until duplicate/test rows become a larger product issue.

### Recommended Decision

Do not implement destructive apply yet.

The next safe step is an apply-preview-only contract that revalidates the dry-run plan, computes blockers, and produces an audit-ready receipt without mutating any store.

## Future Allowed Actions

Allowed only in a later approved apply phase:

- Hide/archive review rows from the Chrome/Studio mirror only, if the target store is explicitly Chrome mirror.
- Mark a review row as reviewed, if the marker is non-destructive and reversible.
- Export a cleanup receipt.
- Remove imported/test local rows only after exact folder ID confirmation.
- Remove only rows with:
  - allowed class
  - allowed source
  - zero bindings
  - zero known references
  - zero/null native membership count
  - fresh diagnostics
  - matching dry-run hash

Any future action must be scoped to one target surface/store at a time.

## Forbidden Actions

Always forbidden:

- Never delete Native-owned canonical rows from Chrome or Desktop.
- Never merge folders by display name.
- Never delete rows with bindings.
- Never delete rows with known references.
- Never touch Desktop SQLite directly in this phase.
- Never apply if diagnostics are stale.
- Never apply based only on test-looking names.
- Never apply across surfaces without an explicit target surface.
- Never treat orphan memberships as deletion permission.
- Never delete `Unfiled` or system rows.
- Never mutate Native folder-state from cleanup UI.
- Never run cleanup automatically on boot, refresh, self-check, or mirror refresh.

## Required Safety Gates

Every future apply must pass all gates:

| Gate | Requirement |
| --- | --- |
| Exact folder ID | The user must confirm exact folder IDs, not names. |
| Allowed row class | Row class must be explicitly allowed for the target action. |
| Allowed source | Source/kind must be approved for the target store. |
| Bindings | `bindingCount === 0`. |
| Known references | `knownCount === 0`. |
| Native membership | `nativeMembershipCount === 0` or `nativeMembershipCount == null` for Native-absent local rows. |
| Fresh diagnostics | Dry-run plan must be generated from fresh diagnostics. |
| Plan identity | Dry-run plan hash/checksum must match the apply request. |
| Confirmation | Exact confirmation phrase is required. |
| Audit | An audit receipt must be generated before and after apply. |
| Backup/export | Backup/export must be available before mutation. |
| Reversibility | Prefer reversible hide/archive/mark-reviewed actions before deletion. |
| Target store | Apply must name one explicit target store. |
| Surface isolation | Chrome and Desktop cleanup must remain separate flows. |

Any failed gate blocks apply.

## Future Data Contracts

### Cleanup Apply Request

```js
{
  schema: "h2o.folder-cleanup-apply-request.v1",
  phase: "P8i",
  requestedAt: "ISO timestamp",
  actorSurface: "chrome-studio",
  targetSurface: "chrome-studio",
  targetStore: "chrome-folder-mirror",
  action: "hide-review-row" | "mark-reviewed" | "remove-imported-test-row",
  dryRunSchema: "h2o.folder-cleanup-dry-run.v1",
  dryRunHash: "string",
  selectedFolderIds: ["exact-folder-id"],
  confirmation: "EXACT CONFIRMATION TEXT",
  noCrossSurfaceApply: true
}
```

### Cleanup Apply Preview

```js
{
  schema: "h2o.folder-cleanup-apply-preview.v1",
  ok: true,
  noMutation: true,
  generatedAt: "ISO timestamp",
  targetStore: "chrome-folder-mirror",
  dryRunHash: "string",
  selectedCount: 0,
  allowedCount: 0,
  blockedCount: 0,
  blockers: [],
  warnings: [],
  beforeSummary: {
    folderCount: 0,
    bindingCount: 0,
    knownCount: 0
  },
  predictedAfterSummary: {
    folderCount: 0,
    bindingCount: 0,
    knownCount: 0
  },
  requiredConfirmation: "EXACT CONFIRMATION TEXT"
}
```

### Cleanup Apply Result

```js
{
  schema: "h2o.folder-cleanup-apply-result.v1",
  ok: true,
  applied: true,
  noMutation: false,
  generatedAt: "ISO timestamp",
  targetStore: "chrome-folder-mirror",
  action: "remove-imported-test-row",
  dryRunHash: "string",
  selectedFolderIds: [],
  appliedFolderIds: [],
  skippedFolderIds: [],
  beforeSummary: {},
  afterSummary: {},
  auditReceiptId: "string",
  blockers: [],
  warnings: []
}
```

### Cleanup Audit Receipt

```js
{
  schema: "h2o.folder-cleanup-audit-receipt.v1",
  receiptId: "string",
  createdAt: "ISO timestamp",
  actorSurface: "chrome-studio",
  targetSurface: "chrome-studio",
  targetStore: "chrome-folder-mirror",
  action: "preview" | "apply",
  dryRunHash: "string",
  selectedFolderIds: [],
  confirmationMatched: false,
  beforeDiagnostics: {},
  applyPreview: {},
  applyResult: {},
  backupRef: "string",
  errors: []
}
```

## UI Proposal

The UI must keep dry-run and apply separated.

Recommended layout:

- Keep current `Dry-run Plan` subtab.
- Add future `Apply Preview` subtab only if P8i-e1 is approved.
- Hide any apply button behind explicit `Enable reviewed apply mode`.
- Require selected rows to show exact folder IDs before apply can be previewed.
- Show per-row blockers inline.
- Disable apply until all blockers clear.
- Require exact typed confirmation.
- Show a pre-apply backup/export reminder.
- Show a post-apply receipt with before/after summaries.

The default Cleanup / Review experience should remain read-only and no-mutation.

## Recommended Next Phase

Choose:

```text
P8i-e1 - cleanup apply preview only, still no mutation
```

Do not proceed directly to destructive apply.

P8i-e1 should prove:

- dry-run hash/checksum behavior
- target-store selection
- blocker computation
- exact-ID confirmation preview
- audit receipt shape
- no mutation

Only after P8i-e1 passes should the project decide whether `P8i-e2` is worth implementing for Chrome local review rows only.
