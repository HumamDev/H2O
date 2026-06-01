# Native Library UI — Retired Features

This directory archives the source code for the Native ChatGPT Library
organization UI as it is physically removed across the R4.7.x slices.

R4.7.1 (this slice) creates the scaffolding. Code moves happen in
R4.7.2 and R4.7.3.

## Retirement reason

The Native ChatGPT Library organization UI (workspace page, sidebar
sections for folders / categories / labels / projects, and the
deprecation banner that announced the move) was replaced by Desktop
Studio across R4.5.x. After R4.6.0–R4.6.4 introduced flag-based gating
and a default flip that hid the Native UI by default, a soak window
proved zero regressions in capture / save / tag extraction / Chrome →
Desktop mirror. R4.7 physically removes the now-dormant UI code.

## Replacement Studio modules

| Native surface (retiring) | Replacement (Desktop / Chrome Studio) |
|---|---|
| Native Library workspace page (0F1b) | Desktop Studio `/library/dashboard`, `/library/explorer`, `/library/recents`, `/library/saved`, `/library/folders`, `/library/folder/<id>` routes — rendered by studio.js + S0F1d Library Insights |
| Native Library sidebar button (0F1b) | Desktop Studio top-level navigation entry |
| Native Explorer + Analytics tabs (0F1d) | Desktop Studio's `S0F1d. Library Insights - Studio.js` |
| Native folders sidebar/list UI (0F3a) | `S0F3b. Folders Actions` + `S0F1m. Library Organization Modals` (openFolderEditor) + `S0F1n. Library Batch Toolbar` + `S0Z1g. Library Sidebar Sections` |
| Native categories sidebar/list UI (0F4a) | `S0F4b. Categories Actions` + `S0F1m` (openCategoryEditor) + `S0F1n` + `S0Z1g` |
| Native labels sidebar/list UI (0F6a) | `S0F6b. Labels Actions` + `S0F1m` (openLabelEditor) + `S0F1n` + `S0Z1g` |
| Native tag CATALOG organization UI | `S0F5b. Tags Actions` + `S0F1m` (openTagEditor) + `S0F1n` |
| Native projects sidebar UI (0F2a) | Desktop Studio sidebar Projects section rendered by S0Z1g |
| **Native turn-level tag EXTRACTION (0F5a)** | **NOT RETIRED — extraction remains in Native 0F5a forever. Hard invariant from R4.3.** |

## R4.7 slice plan + retirement schedule

| Phase | Modules retired | Status | Commit |
|---|---|---|---|
| R4.7.1 — Scaffolding | (none — this directory created; no code moved) | **THIS SLICE** | _pending_ |
| R4.7.2 — Medium-risk | 0F1b workspace + banner, 0F1d Insights, 0F2a projects sidebar, 0F4a categories sidebar, 0F6a labels sidebar | pending | _tbd_ |
| R4.7.3 — Highest-risk + release gate | 0F3a folders sidebar (capture menu + STORE_validateFolderCreate stay) | pending | _tbd_ |

(R4.7.1 originally planned to also retire 0F4a categories. The user
spec for R4.7.1 narrowed this to scaffolding only; 0F4a is now
retired in R4.7.2 alongside the other medium-risk surfaces.)

## Safety invariants (NEVER violated by any R4.7 slice)

The following are repeated here for visibility and re-asserted by the
native deprecation validator (`tools/validation/native/
validate-native-library-deprecation.mjs`) at every R4.7 commit:

1. **0F5a Tags extraction is never modified.** File size remains
   byte-exact `273099` bytes. The MutationObserver / conversation-turn
   observation patterns stay intact.
2. **0D3* Transcript Archive modules never modified.** Capture and
   save infrastructure stays whole.
3. **3X* Capture modules never modified.**
4. **0F1j capture business logic untouched.** `addToLibrary`,
   `saveToFolder`, `openLinkedChat` function bodies contain no
   deprecation-flag references.
5. **0F3a capture menu injection unconditional.**
   `ENGINE_injectAddToLibrary` and `ENGINE_injectAddToFolder` remain in
   0F3a (NOT moved to retired-features/). Their data-cgxui values
   `flsc-add-to-library` and `flsc-add-to-folder` continue to appear
   in chat-row "..." menus regardless of any deprecation flag.
6. **0F3a Native folder-create code path unconditional.**
   `STORE_validateFolderCreate` stays in 0F3a; Studio's MV3 fallback
   via S0Z1g openFolderCreatePanel continues to work.
7. **0F4a categories CRUD unconditional.**
   `H2O.archiveBoot.renameCategory` / `deleteCategory` /
   `createCategory` call sites remain in 0F4a (the actual function
   definitions live in 0D3a archiveBoot, also untouched).
8. **0F6a labels CRUD unconditional.** `function renameLabel`,
   `deleteLabel`, `createLabel` definitions remain in 0F6a.
9. **0F2a projects DATA layer unconditional.**
   `findProjectsH2`, `findProjectsSection`, `PROJECTS_record
   NativeSidebarPayload`, fetch interception hooks remain in 0F2a.
   Only the sidebar UI rendering (`.ho-project-row` injection) moves
   to retired-features/.
10. **Studio R4.5 modules never modified** by R4.7. The R4.5
    `validate-studio-*` validators remain at their R4.6.4 counts
    (107 / 135 / 277).
11. **9A1b chat list decorator + 9A1c chat meta enricher untouched**
    (cosmetic; not Library UI).
12. **0F1k Library Canonical Services + NATIVE_FLAG_DEFAULTS retained.**
    `H2O.flags.diagnose()` continues to report the deprecation flag
    defaults. After R4.7, setting `library.nativeWorkspaceUi` or
    `library.nativeOrganizationUi` back to `true` no longer restores
    the UI (no code to enable). Documented in
    `notes/rollback-procedures.md`.

## Rollback strategy

Three levels of rollback are supported:

### 1. Per-file rollback (no git access required)

Every retired code path has a `extracted-from-<module>.md` file in its
sub-folder recording the exact line ranges that moved and the original
Native module's path. To restore:

1. Open the relevant `extracted-from-*.md`.
2. Copy the corresponding `.js` file content from
   `retired-features/native-library-ui/<module>-ui/`.
3. Paste back into the original Native module at the recorded line
   range.
4. Re-run `npm run dev:rebuild && npm run dev:all` to rebuild the
   userscripts + extension.

### 2. Per-slice git revert

```bash
git revert <R4.7.N commit hash>
```

This restores every code path that the named slice retired. Slices
are intentionally bounded so per-slice revert doesn't drag in
unrelated changes.

### 3. Whole-R4.7 emergency revert

```bash
git revert <R4.7.1 commit>..<R4.7.3 commit>
```

Brings back every retired UI surface across all R4.7 phases in one
operation.

### Post-R4.7 escape hatch via flag — NO LONGER FUNCTIONAL

After R4.7.2 + R4.7.3 land, the R4.6.1 banner button "Restore Native
Library UI (temporary)" and the DevTools commands
```js
H2O.flags.set('library.nativeWorkspaceUi',    true);
H2O.flags.set('library.nativeOrganizationUi', true);
location.reload();
```
continue to **write** to localStorage but no longer **enable** the UI
because the workspace + sidebar UI code is gone from the userscripts.
Operators who need the Native UI back must use rollback path (1), (2),
or (3).

This is a deliberate design decision: R4.7 is the point of no return
for the operator-level escape hatch. The flag system (0F1k
NATIVE_FLAG_DEFAULTS + ensureFlags) is preserved for diagnostic
continuity (`H2O.flags.diagnose()` still works) but the flags are
advisory post-R4.7.

## Directory layout

```
retired-features/native-library-ui/
├── README.md                         (this file)
├── original-path-map.md              cross-module move log (populated by R4.7.2/R4.7.3)
├── migration-map.md                  Native surface → Studio replacement table
├── notes/
│   ├── r4.7-investigation.md         frozen R4.7 plan
│   ├── r4.6-soak-summary.md          R4.6.4 soak telemetry summary
│   └── rollback-procedures.md        detailed restore recipes
├── 0F1b-library-workspace/
│   └── README.md                     (skeleton until R4.7.2 populates with code files)
├── 0F1d-library-insights/
│   └── README.md
├── 0F2a-projects-ui/
│   └── README.md
├── 0F3a-folders-ui/
│   └── README.md
├── 0F4a-categories-ui/
│   └── README.md
└── 0F6a-labels-ui/
    └── README.md
```

## Validator

Inventory checks live in
`tools/validation/native/validate-native-library-deprecation.mjs`,
Section N (R4.7.1 onward). The validator asserts:

- This directory exists with the documented top-level files
- Every module sub-folder exists with its README.md
- `notes/` exists with its 3 expected files
- Top-level files (README.md, original-path-map.md, migration-map.md)
  are present and reference the R4.7 phase plan

Section N is purely a scaffolding check at R4.7.1. R4.7.2 / R4.7.3
will extend Section N with additional assertions for the moved code
files + the corresponding shrinkage in the original Native modules.

R4.7.1 must NOT modify any runtime behavior. The pre-R4.7 validator
counts (native 176 / studio 107 / 135 / 277 / graph clean) remain
the baseline; Section N adds new inventory assertions on top.
