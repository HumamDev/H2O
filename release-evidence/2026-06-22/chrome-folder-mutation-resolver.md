# Chrome Folder Mutation Resolver

Date: 2026-06-22

## Bug Summary

Chrome Studio could display an imported or Desktop-synced folder in the sidebar, but changing its color could return `Blocked: folder-not-found`.

Observed example: a visible synced/imported folder such as `Sport` opened its action menu, but color mutation failed even though the row was visible and user-mutable.

## Root Cause

Chrome color actions treated every canonical folder row as a native-owner mutation. Imported/Desktop-created Studio folders are visible from the Studio folder-state mirror (`h2o:prm:cgx:fldrs:state:data:v1`), but they are not guaranteed to exist in the live native ChatGPT folder catalog. The native owner bridge therefore could not resolve the visible Studio row and returned `folder-not-found`.

The sidebar also reported `Color updated` after a successful apply result without first confirming that the fresh display model showed the selected color.

## Files Changed

- `src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js`
  - Added a Chrome folder color mutation resolver.
  - Routes native-owned folders to the native owner bridge.
  - Routes imported/Studio-owned folders to local Chrome folder-state mirror mutation.
  - Preserves source provenance and materialized/trusted row flags while normalizing folder-state rows.
  - Adds precise blockers: `folder-identity-missing`, `native-owner-folder-not-found`, `protected-folder`, `local-review-folder-not-editable`, and `folder-not-mutable`.

- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
  - Adds visible row provenance to color mutation requests.
  - Adds rendered data attributes for folder source/sourceKind/trusted/materialized/protected state.
  - Gates `Color updated` on fresh display-model color confirmation after apply.

- `tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
  - Adds a VM proof that a visible imported `Sport` folder color preview/apply resolves locally, writes the folder-state mirror, and does not emit `folder-not-found`.
  - Adds a protected `Unfiled` proof that blocks with `protected-folder`, not `folder-not-found`.

## Validation Commands And Results

- `node --check "src-surfaces-base/studio/S0F1h. 🎬 Library Sync - Studio.js"`: passed
- `node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"`: passed
- `node --check tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`: passed
- `node tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`: passed
- `node tools/validation/studio/validate-studio-library-actions.mjs`: passed
- `node tools/validation/studio/validate-studio-library-organization-ui.mjs`: passed
- `node tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs`: passed
- `node tools/validation/sync/validate-f19-shell-row-ux.mjs`: passed
- `git diff --check`: passed
- `git diff --cached --check`: passed
- `node --check /private/tmp/h2o-staged-s0z1g.js`: passed, staged `S0Z1g` blob check

## Manual Runtime Retest Steps

1. Rebuild/reload assets:
   - `npm run dev:all`
   - `node apps/studio/desktop/build-tools/prepare-dist.mjs`
2. Reload Chrome Studio:
   - `chrome-extension://bpobkkppdlldlkccaehmpfclmkhiemhg/surfaces/studio/studio.html#/saved`
3. Pick a visible synced/imported folder, for example `Sport`.
4. Change its color in Chrome.
5. Confirm:
   - no `Blocked: folder-not-found`
   - Chrome sidebar visually changes color
   - diagnostic/display model shows the selected color
6. Run Chrome export if available:
   ```js
   await H2O.Studio.sync.folder.exportChromeToSyncFolder?.({
     reason: "chrome-folder-mutation-resolver-proof"
   });
   ```
7. Confirm exported Chrome folder metadata contains the selected color if export path is available.

## Remaining Limitations

- Automatic cross-platform sync remains Phase 3.
- This phase fixes Chrome local color mutation identity/resolution for visible mutable Studio/imported folders.
- Full create/delete lifecycle sync remains out of scope.
- Chrome export availability still depends on the existing Chrome-to-Desktop export path and user-granted sync folder handle.
- Manual Chrome runtime retest is still required to prove the live extension UI path end to end.
