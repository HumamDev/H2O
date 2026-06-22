# Desktop Folder Color Local Correctness

Date: 2026-06-22

## Bug Summary

Desktop Studio could report `Color updated` after changing a folder color while the sidebar kept rendering the old color. The persistence write succeeded in SQLite, but the rendered folder display model could still read the stale folder-state mirror at `h2o:prm:cgx:fldrs:state:data:v1`.

Scope for this phase is Desktop local folder color correctness only.

## Root Cause

Desktop folder color mutations write through `H2O.Studio.actions.folders.update` into SQLite. The sidebar and canonical display model read through `FolderParity.getDisplayModel({ fresh: true })`, which prefers the folder-state mirror when available. Before this fix, local Desktop color edits did not reconcile that mirror, and `mergeCanonicalFolderDisplaySource` only borrowed the SQLite color when no canonical mirror existed.

That split let SQLite contain the new color while the display/export mirror still contained the old color. `S0Z1g.requestCanonicalFolderColor` then showed `Color updated` immediately after the action result, without confirming the display model had moved to the new token.

## Files Changed

- `src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js`
- `src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js`
- `src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js`
- `tools/validation/studio/validate-studio-import-bundle.mjs`
- `release-evidence/2026-06-22/desktop-folder-color-local-correctness.md`

## Fix Summary

- `actions.folders.update` now detects Desktop folder color patches and reconciles the patched `color` / `iconColor` / `updatedAt` into the folder-state mirror for that folder.
- The mirror row preserves existing membership items and marks the reconciled row as stored folder state / Desktop SQLite materialized display data.
- `mergeCanonicalFolderDisplaySource` now keeps `updatedAt` in normalized folder rows and lets a fresher Desktop-owned SQLite color override a stale canonical mirror color.
- Desktop `requestCanonicalFolderColor` now calls `FolderParity.getDisplayModel({ fresh: true })` after the write and only shows `Color updated` / `Color cleared` when the canonical row confirms the expected color. If confirmation fails, it reports `Blocked: display-color-not-confirmed` or the more specific confirmation blocker.
- Export serializer was not changed: Desktop `latest.json` already builds folder state from SQLite first and uses the mirror only as fallback metadata. With SQLite and mirror reconciled, display and export source now agree for local Desktop color edits.

## Validation

Passed:

- `node --check "src-surfaces-base/studio/S0F3b. 🎬 Folders Actions - Studio.js"`
- `node --check "src-surfaces-base/studio/S0F1b. 🎬 Library Workspace - Studio.js"`
- `node --check "src-surfaces-base/studio/S0Z1g. 🎬 Library Sidebar Sections - Studio.js"`
- `node --check tools/validation/studio/validate-studio-import-bundle.mjs`
- `node tools/validation/studio/validate-studio-library-organization-ui.mjs`
- `node tools/validation/studio/validate-studio-library-actions.mjs`
- `node tools/validation/sync/validate-f19-desktop-chrome-propagation.mjs`
- `node tools/validation/sync/validate-f19-chrome-desktop-library-parity.mjs`

Scoped validator assertion added:

- `tools/validation/studio/validate-studio-import-bundle.mjs` now seeds a stale `h2o:prm:cgx:fldrs:state:data:v1` row, runs `actions.folders.update` with a new color, and asserts the mirror row color/iconColor/stateSource and existing folder items are preserved correctly.

Known non-blocking validation limitation:

- `node tools/validation/studio/validate-studio-import-bundle.mjs` still exits nonzero in its Chrome auto-import round-trip block with `chrome-export-source-coverage-unavailable`. The Desktop folders section, including the new mirror reconciliation assertion, passed. This failure is outside the Desktop local folder color scope of this phase.

Final diff hygiene:

- `git diff --check` passed.
- `git diff --cached --check` passed before commit.

## Manual Runtime Retest Steps

1. Rebuild/reload assets:

   ```sh
   npm run dev:all
   node apps/studio/desktop/build-tools/prepare-dist.mjs
   ```

2. Open Desktop Studio:

   ```text
   http://127.0.0.1:1430/studio.html#/saved
   ```

3. Change a folder color, for example `Sport` to green.

4. Confirm the Desktop sidebar color changes visually.

5. Run a diagnostic to confirm the display model color equals the selected color:

   ```js
   await H2O.Library.FolderParity.getDisplayModel({ fresh: true });
   ```

   Expected: the folder row's `iconColor` / `color` equals the selected color token.

6. Run Desktop export:

   ```js
   await H2O.Studio.sync.folder.syncNow({
     direction: "desktop-to-chrome",
     reason: "desktop-folder-color-local-correctness-proof"
   });
   ```

7. Confirm `latest.json` export is fresh and includes the selected color.

## Remaining Limitations

- Chrome `Blocked: folder-not-found` remains a later phase.
- Automatic cross-platform create/color/rename/delete sync remains a later phase.
- Create/delete lifecycle sync and mutability gating are not implemented here.
- Identity UI, Billing, onboarding, signing/notarization, public release packaging, peer-watermarks, retention, purge, and unrelated Desktop UI were not touched.
- Live Desktop runtime proof still requires rebuilding/reloading assets and running the manual retest above.
