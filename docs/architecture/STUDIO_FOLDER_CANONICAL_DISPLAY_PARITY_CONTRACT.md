# Studio Folder Canonical Display Parity Contract

Phase: Folders-P8a

Status: contract only, docs only. No source code changes. No folder mutation. No SQLite mutation. No Chrome storage mutation. No native folder-state mutation.

Related docs:

- `docs/architecture/STUDIO_FOLDER_PARITY_CANONICAL_REPORT.md`
- `docs/architecture/STUDIO_FOLDER_PARITY_NORMALIZATION_PLAN.md`
- `docs/architecture/STUDIO_FOLDER_PARITY_REVIEWED_CLEANUP_PLAN.md`
- `docs/architecture/STUDIO_FOLDER_PARITY_DESKTOP_CLEANUP_PLAN.md`
- `docs/architecture/STUDIO_FOLDER_PARITY_INVENTORY_RUNBOOK.md`
- `docs/architecture/STUDIO_FOLDER_STATE_MANUAL_BRIDGE_RUNBOOK.md`

## 1. Purpose

This contract defines how Native ChatGPT, Chrome Studio, and Desktop Studio MUST display the same canonical folder catalog. It is the binding agreement between renderer authors and data-source authors across the three surfaces.

Goal: when a user looks at the folder list in any of the three surfaces, they MUST see:

- the same canonical folder names
- the same canonical colors and icon colors
- the same canonical order
- the same canonical folder count
- the same native membership counts as the primary number
- local extras quarantined out of the main list

This document does not authorize source code changes, folder cleanup, deletion, merge, repair, SQLite mutation, Chrome storage mutation, or native folder-state mutation. Later phases (P8b through P8g) implement renderer changes against this contract; P8a only fixes the contract itself.

## 2. Source-of-truth rule

Native ChatGPT folder-state is the sole display authority for the main folder section across all three surfaces.

- Native ChatGPT's own folder catalog renders directly from native folder-state.
- Chrome Studio and Desktop Studio MUST mirror the native catalog through the cross-surface broadcast pipeline.
- Desktop SQLite folder rows MUST NOT override the canonical display. SQLite is a binding store (which chats belong to which folder); it is not a folder identity store for the main UI.
- The Chrome chat-list bridge MUST NOT override the canonical display. It is also a binding store.

A folder is "canonical" if and only if it appears in the native catalog snapshot at read time, identified by its native `folderId` (the `f_*` ID).

## 3. Main folder list rule

The main folder list on every surface MUST show only canonical native folders.

Current canonical native folders (from Folders-P2 runtime evidence):

| Folder  | Native folderId                  |
| ------- | -------------------------------- |
| Study   | `f_7050f49d3f341819dba53d547`    |
| Case    | `f_5d9431084707f19dba53d548`     |
| Dev     | `f_0606ea698948f19dba53d548`     |
| Code    | `f_e301f3506938c19dbac0e304`     |
| Tech    | `f_3bf15f43b835d19dbac0fb13`     |
| English | `f_2bb1037f88b2719dbac10c22`     |

Canonical folder count: 6 at contract write time. The contract does not bind a fixed count; if the user changes the native catalog in ChatGPT, the canonical set tracks it through the broadcast pipeline.

The main folder list MUST NOT include:

- duplicate-name local rows (e.g. `fld-case`, `fld-english`)
- test folders (e.g. `f5d-test-folder-001`, `f5d1-test-folder-a`, `f5d1-test-folder-b`)
- RT/empty-test folders (`fld-rt-*`, `fld-empty-*`)
- virtual buckets (e.g. `__none__`, "Unfiled")
- Desktop-only rows present in SQLite but absent in native catalog
- Chrome-only rows present in chat-list bridge but absent in native catalog
- folders flagged with `isExtra`, `isTestCandidate`, or `isConflict` by `FolderParity`

## 4. Local Review rule

Non-canonical folder rows MUST be routed to a separate Local Review group, not the main list.

Local Review buckets:

| Bucket             | Definition                                                                  |
| ------------------ | --------------------------------------------------------------------------- |
| `extra`            | Local folder with no canonical counterpart.                                 |
| `test`             | Matches test ID/name patterns (e.g. `^f5d`, `^fld-rt-`, `^fld-empty-`).     |
| `conflict`         | Local-only folder whose normalized name collides with a canonical folder.   |
| `desktop-only`     | Present in Desktop SQLite, absent in native catalog.                        |
| `chrome-only`      | Present in Chrome chat-list bridge, absent in native catalog.               |
| `review-required`  | Any row `FolderParity.selfCheck` flags for review.                          |

Local Review is read-only diagnostic surface. It MUST NOT auto-delete, auto-merge, or auto-repair rows. Cleanup remains a user-confirmed Settings action.

## 5. Canonical folder row shape

Each row in the canonical main list MUST conform to:

```js
{
  folderId,                  // native f_* ID
  id,                        // alias of folderId for backward compat
  name,                      // native display name
  normalizedName,            // lowercase, trimmed, dedupe key
  color,                     // hex, from native iconColor || color
  iconColor,                 // hex, explicit alias for icon rendering
  icon,                      // 'folder' default; reserved for future
  sortOrder,                 // native catalog index, ascending
  source: "native-canonical",
  isCanonical: true,
  nativeMembershipCount,     // chats bound in native folder-state items[]
  knownStudioCount,          // chats present in Library Index for this folderId
  localBindingCount,         // Desktop SQLite or Chrome chat-list bindings (diagnostic)
  displayCountLabel          // pre-formatted per Count rule (section 8)
}
```

`source` MUST be the string `"native-canonical"` exactly. No other value is permitted for canonical rows.

## 6. Local review row shape

Each row in Local Review MUST conform to:

```js
{
  folderId,
  id,
  name,
  normalizedName,
  color,
  iconColor,
  icon,
  source,                    // "local-extra" | "desktop-sqlite" | "chrome-only" | "test-candidate" | "conflict"
  isCanonical: false,
  isExtra,                   // boolean
  isTestCandidate,           // boolean
  isConflict,                // boolean
  reviewBucket,              // one of the buckets in section 4
  knownStudioCount,
  localBindingCount,
  badges                     // ['extra' | 'test' | 'conflict' | 'desktop-only' | 'chrome-only' | 'review-required']
}
```

`isCanonical` MUST be `false` for every row in Local Review.

## 7. Display model contract

`H2O.Library.FolderParity.getDisplayModel({ fresh: true })` MUST eventually expose:

```js
{
  // existing top-level fields kept for back-compat:
  readOnly: true,
  surface,
  generatedAt,
  // ...other existing summary fields...

  // partitioned arrays (new in P8b):
  canonicalRows,             // main list source; section 5 shape
  localReviewRows,           // diagnostics/review source; section 6 shape
  rows                       // backward-compatible union: canonicalRows ∪ localReviewRows
}
```

Contract rules:

- `canonicalRows` is the only source any main-list renderer may read.
- `localReviewRows` is the only source any Local Review surface may read.
- `rows` is preserved as a union during migration. New consumers MUST NOT use `rows`. Existing consumers MAY continue to use `rows` until migrated by P8c/P8d.
- The model is read-only. Rendering MUST NOT mutate any row.

## 8. Count rule

Main UI count label format:

```
<nativeMembershipCount> native · <knownStudioCount> known
```

Example: `Study — 4 native · 1 known`.

Collapse rule: when `nativeMembershipCount === knownStudioCount`, the label MAY render the single number (`Study — 4`). Settings diagnostics MUST always render the long form for both counts.

`localBindingCount` MUST NOT drive the main folder count label on any surface. It is diagnostic/review-only and surfaces in:

- Settings diagnostics (always)
- Local Review rows for desktop-only / chrome-only entries
- `FolderParity.selfCheck` output

Aggregation rule (Desktop sidebar specifically): the Desktop renderer MUST NOT compute the main count as `max(rowCount, canonicalCount, knownCount, localBindingCount)`. The primary number is always `nativeMembershipCount`.

## 9. Color rule

Canonical `color`, `iconColor`, and icon metadata MUST come from native canonical folder-state first.

Resolution order:

1. Native broadcast `iconColor`, then `color` (already preserved end-to-end through 0F1h capture → broadcast → S0F1h merge → FolderParity row).
2. Stored folder-state (`h2o:prm:cgx:fldrs:state:data:v1`) as secondary.
3. Enriched `KNOWN_NATIVE_CANONICAL_FOLDERS` palette as last-resort fallback (P8b adds palette + sortOrder bake-in).

User-owned local overrides (e.g., sidebar appearance prefs) MAY layer over the canonical base, but only when explicitly user-owned. Local overrides MUST NOT replace the canonical base when no user pref exists.

Legacy localStorage color writes (`h2o:folders:data:v1`, `h2o:folders:v1`) are secondary mirrors only. Reads for main-list display MUST go through `FolderParity.canonicalRows[].iconColor` first.

## 10. Order rule

Canonical rows MUST sort by:

1. `sortOrder` ascending (from native catalog).
2. Native snapshot order as tiebreaker (the index at which a folder appears in the broadcast `folders[]`).
3. `normalizedName` ascending as final tiebreaker.

A single shared sort helper MUST be used across all renderers. No surface may reorder canonical rows by `localBindingCount`, `knownStudioCount`, recency, or alphabetical-only.

Local Review rows MUST sort by:

1. `reviewBucket` (stable bucket order: `conflict`, `test`, `extra`, `desktop-only`, `chrome-only`, `review-required`).
2. `normalizedName` ascending within each bucket.

## 11. Rendering rule by surface

| Surface                            | Main list source                                                                                                              | Local Review destination                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Native ChatGPT folder UI           | Native folder-state (rendered by ChatGPT itself).                                                                              | Not applicable. Native surface has no Local Review concept.                                    |
| Chrome Studio sidebar              | `canonicalRows`.                                                                                                              | Collapsed "Local Review (N)" group at bottom; hidden by default; Settings toggle to reveal.    |
| Chrome Studio `#/library/folders`  | `canonicalRows`.                                                                                                              | Separate "Local Review" section below the canonical grid with explanatory header.              |
| Desktop Studio sidebar             | `canonicalRows`.                                                                                                              | Same collapsed group as Chrome sidebar.                                                        |
| Desktop Studio folder page         | `canonicalRows` via shared S0F1b workspace.                                                                                   | Same as Chrome folder page.                                                                    |
| Settings diagnostics               | `canonicalRows` and `localReviewRows` shown side-by-side with full counts (`nativeMembershipCount`, `knownStudioCount`, `localBindingCount`) and badges. | This is the diagnostic view itself.                                                            |
| Library Insights (S0F1d)           | `canonicalRows`.                                                                                                              | Local Review summary chip with drill-down.                                                     |

No surface MAY introduce its own folder catalog merge logic. All merging happens inside `FolderParity`.

## 12. Fallback rule

If the native broadcast is temporarily unavailable (e.g., fresh boot, race window):

1. Use the enriched `KNOWN_NATIVE_CANONICAL_FOLDERS` fallback (P8b enriches with palette and sortOrder).
2. Mark every row from the fallback with `source: "native-canonical"` and `isCanonical: true`.
3. Show a non-blocking diagnostic banner in Settings ("Using cached canonical fallback") so the state is observable.

The main list MUST NOT fall back to:

- raw `ws.getFolders()` workspace catalog
- Desktop SQLite folder rows
- Chrome chat-list bridge folders
- Library Index derived folder rows

Raw SQLite / workspace / chat-list rows MAY feed Local Review only when they fail to match a canonical row.

## 13. Data-flow diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  Native ChatGPT page                                                 │
│    H2O.folders.list()                                                │
│    KEY_FSECTION_STATE_DATA_V1 (localStorage)                         │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ snapshotFolderState() (0F1h.js)
                           │ preserves: id, name, color, iconColor,
                           │            icon, sortOrder, parentId,
                           │            kind, items[]
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Cross-surface broadcast wire                                        │
│    Key (native → studio):                                            │
│      h2o:library:cross-surface:broadcast:native:v1                   │
│    Transport: chrome.storage.local + postMessage bridge              │
│    Coalesce window: 350ms                                            │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Studio launcher storage                                             │
│    FOLDER_STATE_DATA_KEY:                                            │
│      h2o:prm:cgx:fldrs:state:data:v1                                 │
│    Backend: chrome.storage.local                                     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FolderParity.getDisplayModel({ fresh: true })                       │
│    Reads native broadcast first, then stored state, then fallback.   │
│    Partitions: canonicalRows + localReviewRows.                      │
│    Sorts canonicalRows by sortOrder (section 10).                    │
│    Formats displayCountLabel per Count rule (section 8).             │
└─┬─────────────────────────────┬─────────────────────────────┬────────┘
  │ canonicalRows               │ canonicalRows               │ canonicalRows
  ▼                             ▼                             ▼
S0Z1g sidebar              S0F1b #/library/folders       studio.js Desktop sidebar
S0F1d Insights             Settings diagnostics           studio.js Desktop folder page
```

## 14. Migration phase plan

| Phase    | Title                                | Scope                                                                                                                                                                                                          |
| -------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P8a**  | Canonical display parity contract    | This document. Docs only.                                                                                                                                                                                      |
| **P8b**  | FolderParity display model hardening | Add `canonicalRows`, `localReviewRows`, `sortOrder`, `nativeMembershipCount`, `knownStudioCount` to `getDisplayModel`. Enrich `KNOWN_NATIVE_CANONICAL_FOLDERS` with palette + sortOrder. Add shared `formatCanonicalCountLabel(row)` helper. |
| **P8c**  | Chrome Studio renderer parity        | Update S0Z1g sidebar and S0F1b `#/library/folders` to consume `canonicalRows` only. Remove `ws.getFolders()` fallback for the main list.                                                                       |
| **P8d**  | Desktop Studio renderer parity       | Update `collectFolderSidebarItems` / `renderFolderSidebar` (studio.js) to consume `canonicalRows`. Replace `Math.max(...)` count formula with `nativeMembershipCount`.                                         |
| **P8e**  | Local Review quarantine              | Move every `isExtra` / `isTestCandidate` / `isConflict` / `desktop-only` / `chrome-only` row out of the main list. Surface them under Local Review with explanatory copy.                                       |
| **P8f**  | Color and order parity hardening     | Bake canonical palette + sortOrder into enriched fallback. Make appearance prefs layer over canonical base instead of shadowing it.                                                                            |
| **P8g**  | Runtime proof across three surfaces  | Capture parity report from all three surfaces within the same minute. Diff canonical arrays. Assert identical names, colors, sortOrder, and `nativeMembershipCount`.                                           |

Each phase is implemented in a separate commit. P8a is committed first and merged before P8b begins.

## 15. Safety boundaries

This contract authorizes one new docs file at `docs/architecture/STUDIO_FOLDER_CANONICAL_DISPLAY_PARITY_CONTRACT.md` and nothing else for P8a.

This contract does NOT authorize:

- folder deletion (canonical or local)
- folder auto-merge
- SQLite mutations of any kind (no `DELETE`, `UPDATE`, `INSERT` against folder tables; no schema changes; no migrations)
- native ChatGPT folder-state mutations
- Chrome storage writes beyond the existing broadcast pipeline
- Rust / Tauri changes
- packer / build / runtime / userscript changes
- staging or committing unrelated dirty files

Later phases (P8b–P8g) implement renderer changes only. They do not relax these safety boundaries.

## 16. Validation for docs commit

The P8a commit MUST pass:

- `git diff --check` (no whitespace errors in working tree)
- `git diff --cached --check` (no whitespace errors in staged diff)
- only `docs/architecture/STUDIO_FOLDER_CANONICAL_DISPLAY_PARITY_CONTRACT.md` staged
- commit message: `Document canonical folder display parity contract`

No source files staged. No other docs files staged. No build artifacts staged.
