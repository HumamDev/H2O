# P8i-b Reviewed Folder Cleanup Plan

Phase: P8i-b - reviewed cleanup UX/plan
Status: Docs/design only; no cleanup implementation approved

## Verdict

P8i-b should start with a read-only cleanup review panel. Cleanup apply must remain deferred until a later explicitly approved phase.

P8i-a proved that duplicate, imported, and test-looking rows exist, but it did not prove that any row is safe to delete automatically. Same-name folders are conflicts, not merge targets. Orphan memberships are diagnostic risk, not deletion permission. Desktop SQLite is a real local store and must remain protected unless a separate Desktop cleanup phase is approved.

Recommended next implementation step:

```text
P8i-c2 - Chrome-only read-only cleanup review panel
```

The first implementation should render candidates, blockers, and exportable dry-run JSON only. It should not apply cleanup.

## Cleanup Principles

- Never merge folders by display name.
- Never delete Native-owned canonical rows from Chrome or Desktop.
- Never auto-delete on boot, refresh, diagnostics, mirror refresh, or self-check.
- Require exact `folderId` for every reviewed candidate.
- Use dry-run first for every proposed cleanup action.
- Apply only from a reviewed, still-fresh dry-run result.
- Require exact typed confirmation before any future apply.
- Keep Desktop SQLite protected unless a separate approved Desktop cleanup phase exists.
- Treat Chrome mirror cleanup and Desktop SQLite cleanup as separate actions with separate confirmations.
- Preserve orphan memberships; unresolved memberships are diagnostics, not cleanup authorization.
- Write an audit entry before any future mutation.

## Candidate Classes

| Class | Meaning | Default action |
| --- | --- | --- |
| preserve canonical | Native-owned `f_*` folder rows and dynamic Native-owned canonical rows. | Preserve. Never cleanup from Chrome/Desktop directly. |
| same-name conflict / review only | Same normalized name as a canonical row but different ID, such as `fld-case` or `fld-english`. | Review only. Do not merge by name. |
| empty test cleanup candidate | Test/import/runtime-looking row that is Native-absent, has zero bindings, and has zero known references in the target store. | Candidate only after reviewed dry-run. |
| bound review | Candidate has bindings, historical binding evidence, or unresolved binding status. | Review only. No delete until bindings are separately resolved. |
| orphan risk | Canonical memberships do not resolve to known Studio rows. | Diagnostic only. Preserve. |
| unsafe to delete | Canonical, native-present, bound, referenced, stale, ambiguous, or unsupported source/store. | Block. |

## Proposed UI Flow

Location:

```text
Settings -> Folder Parity -> Folder Cleanup Review
```

Flow:

1. User opens the panel.
2. Studio runs fresh read-only diagnostics:
   - `H2O.Library.FolderParity.diagnose({ fresh: true })`
   - `H2O.Library.FolderParity.selfCheck({ fresh: true })`
3. Panel renders a candidate table.
4. User filters by class, risk, source, surface, duplicate group, or binding status.
5. User selects eligible rows by checkbox.
6. User clicks `Preview cleanup`.
7. Studio creates a dry-run cleanup plan.
8. Panel shows before counts, predicted after counts, blockers, selected exact IDs, target store, and confirmation text.
9. User copies/exports the plan JSON.
10. Future apply phases may require exact typed confirmation and then apply selected cleanup.
11. Result report shows before/after diagnostics and audit status.

First implementation slice must stop after step 9.

## Candidate Table

The table should show:

- selection checkbox
- class
- risk
- surface/store
- folder ID
- folder name
- source/kind
- duplicate group
- Native presence
- native membership count
- local binding count
- known/reference count
- blockers
- recommended action

Rows with class `preserve canonical`, `same-name conflict / review only`, `bound review`, `orphan risk`, or `unsafe to delete` should not be selectable for cleanup apply.

Rows may be selectable for dry-run only when the current diagnostics classify them as empty test cleanup candidates.

## Proposed Data Contract

### Cleanup Plan

```js
{
  schema: "h2o.folder-cleanup-plan.v1",
  phase: "P8i",
  generatedAt: "ISO timestamp",
  diagnosticsGeneratedAt: "ISO timestamp",
  surface: "chrome-studio" | "desktop-studio",
  targetStore: "chrome-folder-mirror" | "desktop-sqlite" | "desktop-mirror",
  mode: "review-only" | "dry-run" | "apply",
  candidates: [],
  selectedFolderIds: [],
  blockers: [],
  warnings: [],
  confirmationText: "DELETE EMPTY TEST FOLDERS",
  noMutation: true
}
```

### Candidate Row

```js
{
  folderId: "string",
  name: "string",
  normalizedName: "string",
  source: "string",
  kind: "string",
  surface: "chrome-studio" | "desktop-studio",
  targetStore: "chrome-folder-mirror" | "desktop-sqlite" | "desktop-mirror",
  class: "preserve-canonical" | "same-name-conflict" | "empty-test-candidate" | "bound-review" | "orphan-risk" | "unsafe-to-delete",
  isNativeCanonical: false,
  nativePresence: false,
  duplicateGroup: null,
  canonicalCounterpartId: "",
  nativeMembershipCount: 0,
  localBindingCount: 0,
  knownCount: 0,
  referenceCount: 0,
  bindings: [],
  blockers: [],
  warnings: [],
  riskLevel: "low" | "medium" | "high",
  recommendedAction: "string"
}
```

### Dry Run Result

```js
{
  schema: "h2o.folder-cleanup-dry-run-result.v1",
  ok: true,
  noMutation: true,
  generatedAt: "ISO timestamp",
  diagnosticsAgeMs: 0,
  selectedFolderIds: [],
  selectedCandidates: [],
  beforeSummary: {
    folderCount: 0,
    bindingCount: 0,
    knownReferenceCount: 0
  },
  predictedAfterSummary: {
    folderCount: 0,
    bindingCount: 0,
    knownReferenceCount: 0
  },
  blockers: [],
  warnings: [],
  confirmationText: "DELETE EMPTY TEST FOLDERS"
}
```

### Apply Result

```js
{
  schema: "h2o.folder-cleanup-apply-result.v1",
  ok: true,
  applied: true,
  noMutation: false,
  generatedAt: "ISO timestamp",
  targetStore: "chrome-folder-mirror" | "desktop-sqlite" | "desktop-mirror",
  selectedFolderIds: [],
  removedFolderIds: [],
  skippedFolderIds: [],
  beforeSummary: {},
  afterSummary: {},
  auditId: "string",
  blockers: [],
  warnings: []
}
```

### Audit Entry

```js
{
  schema: "h2o.folder-cleanup-audit-entry.v1",
  auditId: "string",
  timestamp: "ISO timestamp",
  actorSurface: "chrome-studio" | "desktop-studio",
  targetStore: "chrome-folder-mirror" | "desktop-sqlite" | "desktop-mirror",
  action: "preview" | "apply",
  selectedFolderIds: [],
  selectedCandidates: [],
  beforeDiagnostics: {},
  dryRunResult: {},
  confirmationMatched: false,
  result: "pending" | "ok" | "failed" | "blocked",
  errors: []
}
```

## Safety Gates

Future apply must require every gate below:

| Gate | Requirement |
| --- | --- |
| Fresh diagnostics | Diagnostics age must be inside a small freshness window, such as 60 seconds. |
| Exact folder ID | Selected ID must still match the dry-run candidate exactly. |
| Target store | Candidate must belong to the store the apply operation will mutate. |
| Not canonical | Candidate must not be Native-owned canonical and must not have canonical `f_*` identity. |
| Native absent | Candidate must be absent from current Native canonical folder-state. |
| Allowed class | Candidate class must be `empty-test-candidate`. |
| Binding count | `bindingCount === 0`. |
| Known references | `knownCount === 0` and `referenceCount === 0`. |
| Duplicate ambiguity | Same-name conflict rows block unless a separate conflict-specific phase approves them. |
| Orphan risk | Orphan memberships block if they target or could be confused with the candidate. |
| Confirmation | Exact confirmation text must match. |
| Audit | Pending audit entry must be written before mutation. |

If any gate fails, apply must return blocked and perform no writes.

## Surface Ownership

| Surface | Allowed P8i role | Disallowed |
| --- | --- | --- |
| Native ChatGPT | Owns Native canonical folders. Provides canonical state for diagnostics. | No cleanup from P8i. No Native canonical deletes. |
| Chrome Studio | Can review Chrome mirror/local rows. Future phase may clean Chrome mirror rows only after reviewed approval. | No local fallback delete of Native canonical folders. No merge by name. |
| Desktop Studio | Can review Desktop mirror/imported rows. Future phase may preview Desktop cleanup. | No Desktop direct delete of Native folders. No SQLite mutation in P8i-b. |

Desktop SQLite cleanup must be a separate approved phase because it mutates a real local database.

## Implementation Options

| Option | Description | Recommendation |
| --- | --- | --- |
| P8i-c1 docs-only deferred cleanup | Keep cleanup as a documented manual review topic. | Acceptable if no cleanup is urgent. |
| P8i-c2 Chrome-only reviewed cleanup UI | Add a read-only UI panel that renders candidates and exports dry-run JSON. | Recommended next step. |
| P8i-c3 Desktop reviewed cleanup preview only | Add Desktop review/preview without mutation. | Useful after Chrome panel shape is proven. |
| P8i-c4 shared cleanup report export/import | Export candidate reports across Chrome/Desktop for offline review. | Useful later if Desktop/Chrome comparison remains manual. |

## Recommended Next Single Task

Implement P8i-c2 as a read-only cleanup review panel.

Strict first-slice requirements:

- No cleanup apply button.
- No storage mutation.
- No SQLite mutation.
- No Native mutation.
- No Desktop mirror mutation.
- Candidate rows grouped by class and risk.
- Copy/export cleanup plan JSON.
- Clear blockers explaining why same-name conflicts, bound rows, orphan risks, and Native canonical rows are not selectable.

Only after that UI is runtime-proven should a later phase consider a narrow Chrome-only dry-run/apply flow for selected empty test rows.
