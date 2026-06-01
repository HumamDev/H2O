# Rollback Procedures — R4.7 Native Library UI Retirement

Three levels of rollback are supported. Pick the one that matches the
scope of the problem.

## Level 1 — Per-file restore (no git access required)

Use when you need to bring back ONE specific retired surface (e.g.,
just the categories sidebar) without disturbing other R4.7 changes.

1. Identify the surface you want back. The
   `retired-features/native-library-ui/<module-id>-<purpose>/README.md`
   for each module documents what was here pre-retirement.
2. Open the `extracted-from-<module>.md` file in that same folder.
   It records the exact line ranges that were moved out of the
   original Native module.
3. Copy the corresponding `.js` file content out of
   `retired-features/native-library-ui/<module-id>-<purpose>/`.
4. Paste it back into the original Native module at the recorded
   line range. The breadcrumb comment in the original file points
   to the exact insertion site:

   ```js
   /* R4.7.X — <surface name> retired. Code moved to:
    *   retired-features/native-library-ui/<module-id>-<purpose>/<file>.js
    * See that file's header for the original line ranges + rollback. */
   ```

   Replace the breadcrumb with the original code.
5. Re-run:

   ```bash
   npm run dev:rebuild
   npm run dev:all
   ```

   This rebuilds the userscript bundle. The next chatgpt.com tab
   load picks up the restored UI.

This level is non-destructive — the retired-features/ archive remains
intact. If you want to make the change permanent, commit the source
modification.

## Level 2 — Per-slice `git revert`

Use when you want to undo an entire R4.7 slice in one operation
(e.g., back out everything R4.7.2 did).

```bash
git revert <R4.7.N commit hash>
```

Replace `<R4.7.N commit hash>` with one of:

| Slice | Commit | What gets restored |
|---|---|---|
| R4.7.1 | _(this commit's hash, populated post-commit)_ | the retired-features/ folder + validator Section N inventory checks (reverting this slice removes the scaffolding entirely; doesn't affect runtime) |
| R4.7.2 | _(tbd)_ | 0F1b workspace + button + banner, 0F1d Insights, 0F2a projects sidebar UI, 0F4a categories sidebar, 0F6a labels sidebar |
| R4.7.3 | _(tbd)_ | 0F3a folders sidebar + folder-create panel UI |

Slices are intentionally bounded so per-slice revert doesn't drag in
unrelated changes. The validator's Section O size-shrinkage assertions
will fail after a per-slice revert; that's expected — re-run
validators after the revert to confirm the rest of the system is
healthy, then commit the revert.

## Level 3 — Whole-R4.7 emergency revert

Use only when the entire R4.7 retirement needs to be undone (e.g.,
discovering a regression in production that traces to physical code
removal).

```bash
git revert <R4.7.1 commit>..<R4.7.3 commit>
```

This restores every retired UI surface across all three R4.7 phases
in one operation. Brings the Native Library UI back to the R4.6.4
state (default-hidden but code present + restorable via flag).

After a whole-R4.7 revert:
- The R4.6.1 banner button "Restore Native Library UI (temporary)"
  works again.
- DevTools `H2O.flags.set('library.nativeWorkspaceUi', true)` + reload
  restores the workspace UI.
- The retired-features/ folder is empty (gone with the revert).

## Post-R4.7 escape hatch via flag — NO LONGER FUNCTIONAL

After R4.7.2 + R4.7.3 land, the operator-level escape hatch from R4.6
becomes inert:

```js
// These continue to WRITE to localStorage but no longer ENABLE the UI
// because the workspace + sidebar UI code has been physically removed.
H2O.flags.set('library.nativeWorkspaceUi',    true);
H2O.flags.set('library.nativeOrganizationUi', true);
location.reload();
```

The R4.6.1 banner button "Restore Native Library UI (temporary)" is
itself retired in R4.7.2. There is no in-browser path back.

This is a DELIBERATE design decision: R4.7 is the point of no return
for the operator-level escape hatch. The flag system (0F1k
`NATIVE_FLAG_DEFAULTS` + `ensureFlags`) is preserved for diagnostic
continuity (`H2O.flags.diagnose()` still works) but the flags are
advisory post-R4.7. Operators who need the UI back must use Level 1
(per-file restore), Level 2 (per-slice revert), or Level 3 (whole-R4.7
revert).

## Hard invariants — NEVER affected by ANY rollback

Even a whole-R4.7 emergency revert does NOT affect:

1. 0F5a tag extraction (the file is never modified by R4.7; it stays
   at 273099 bytes)
2. 0D3*/3X* capture modules (never modified)
3. 0F1j capture business logic (never modified)
4. 0F3a `ENGINE_injectAddToLibrary` / `ENGINE_injectAddToFolder` /
   `STORE_validateFolderCreate` (these stay in 0F3a across all R4.7
   slices; rollback can only ADD code back, not affect what was
   kept)
5. 0F4a `H2O.archiveBoot.*` category CRUD call sites
6. 0F6a `function renameLabel/deleteLabel/createLabel`
7. Studio R4.5 modules
8. 9A1b/9A1c cosmetic enrichers

Validator Section P re-asserts these every commit. Rollback cannot
accidentally remove these — they were never staged for removal.

## When to NOT roll back

If the runtime issue traces to:

- Capture path → rollback is irrelevant; check 0F1j / 0F3a capture
  injection
- Tag extraction → rollback is irrelevant; check 0F5a (untouched
  by R4.7)
- Save Strip → check 0D3d (untouched by R4.7)
- Chrome → Desktop mirror → check R3 sync paths (untouched by R4.7)
- Studio Desktop organization UI → check Studio R4.5 modules
  (untouched by R4.7)

None of these scenarios warrant an R4.7 rollback. R4.7 only retires
UI code paths that are demonstrably dormant after R4.6.4's default
flip.
