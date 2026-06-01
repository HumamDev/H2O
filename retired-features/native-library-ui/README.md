# Native Library UI - Retired Features

**Final status (R4.7.7): COMPLETE.**

All deprecated Native ChatGPT Library UI surfaces have been physically
retired into this directory. Runtime capture, data, extraction, and
Studio replacement paths remain active in their original modules.

## Completed R4.7 Slices

| Slice | Commit | Scope |
|---|---|---|
| R4.7.1 | `7a2980ad74a70643b2ae42d4b1557a7d7a74ed52` | Scaffolding for `retired-features/native-library-ui/` |
| R4.7.2 | `a4a525120fc12e577fd9a8917c452932551fdcdf` | Retired Native Categories sidebar UI |
| R4.7.3 | `5b9db0d734bc3beb77b617088a58d1592bf0f2be` | Retired Native Labels sidebar UI |
| R4.7.4 | `5e32bfb1164102b442ac1f4a3be69e52ca67c671` | Retired Native Projects sidebar UI |
| R4.7.5 | `1ee9021cee94fdb20836eaeee33f5ae867e3b896` | Retired Native Library Workspace UI and all of 0F1d Library Insights |
| R4.7.6 | `4627f2f81cc45acb5180e21ab80b8be77b8a69e1` | Retired Native Folders sidebar UI |
| R4.7.7 | _release-gate documentation + validator consolidation_ | Final release gate; no runtime code movement |

## Retired Modules

| Native module | Retired surface | Archive |
|---|---|---|
| 0F1b Library Workspace | Native Library button, workspace route/page, banner, layout/rendering UI | `0F1b-library-workspace/library-workspace-ui.js` |
| 0F1d Library Insights | Entire Native Explorer + Analytics renderer | `0F1d-library-insights/0F1d-original.js` |
| 0F2a Projects | Native projects sidebar row UI | `0F2a-projects-ui/projects-sidebar-rows.js` |
| 0F3a Folders | Native folders sidebar rows, more button, sidebar active sync, sidebar injection | `0F3a-folders-ui/folders-sidebar-list.js` |
| 0F4a Categories | Native categories sidebar section/list UI | `0F4a-categories-ui/categories-sidebar.js` |
| 0F6a Labels | Native labels sidebar section/list UI | `0F6a-labels-ui/labels-sidebar.js` |

Each module archive folder has:

- `README.md`
- `extracted-from-<module>.md`
- One archived `.js` implementation file

Final documented inventory: 6 module folders, 18 module-level archive
artifacts, 3 top-level files, and 3 notes files.

## Final Replacement Mapping

| Retired Native UI | Replacement |
|---|---|
| 0F1b Native Library workspace/page/button/banner | Desktop Studio Library routes and navigation |
| 0F1d Native Explorer + Analytics | `S0F1d` Studio Library Insights |
| 0F2a Native projects sidebar UI | `S0Z1g` Studio sidebar Projects section |
| 0F3a Native folders sidebar UI | `S0F3b` + `S0F1m` + `S0F1n` + `S0Z1g` |
| 0F4a Native categories sidebar UI | `S0F4b` + `S0F1m` + `S0F1n` + `S0Z1g` |
| 0F6a Native labels sidebar UI | `S0F6b` + `S0F1m` + `S0F1n` + `S0Z1g` |

Tag extraction is not a retired UI surface. Native 0F5a remains the
canonical turn-level tag extraction owner.

## Safety invariants / Kept-active invariants

The following were never retired:

- 0F1j capture actions: `addToLibrary`, `saveToFolder`,
  `openLinkedChat`.
- 0F3a chat-row menu injection:
  `ENGINE_injectAddToLibrary` and `ENGINE_injectAddToFolder`.
- 0F3a folder create/data/store paths:
  `STORE_validateFolderCreate`, `STORE_readData`, `STORE_writeData`,
  folder CRUD/store functions, binding APIs, and metadata operation
  fallback APIs.
- 0F4a category APIs and archiveBoot call sites.
- 0F6a label CRUD APIs.
- 0F5a tag extraction, byte-exact at `273099` bytes.
- 0D3*/3X* capture modules.
- Desktop Studio organization UI.
- 0F1k flags and diagnostics.

## Native Restore Flags

The R4.6 flags still exist for diagnostics:

- `library.nativeWorkspaceUi`
- `library.nativeOrganizationUi`
- `library.nativeCaptureOnlyMode`

After R4.7, setting Native UI restore flags is a no-op for retired UI.
The flags may still be written and diagnosed, but the retired
workspace/sidebar UI code is no longer present in the runtime modules.
Use rollback if Native UI must be restored.

## Rollback Strategy

Rollback remains explicit and bounded:

1. Per-file rollback: use each module's `extracted-from-*.md` record
   and archived `.js` file to restore a specific retired block into
   the original Native source module.
2. Per-slice rollback: `git revert <R4.7.N commit hash>` for the
   relevant retirement slice.
3. Full R4.7 rollback: revert the R4.7 retirement commits in reverse
   order if every retired Native UI surface must be restored.

After any rollback, rerun the native validator, the three Studio
validators, and the runtime import graph scan.

## Validator Matrix

The final release gate is documented in:

`docs/systems/library/r4.7-native-library-ui-retirement-gate.md`

The required validator matrix is:

- `node tools/validation/native/validate-native-library-deprecation.mjs`
- `node tools/validation/studio/validate-studio-library-organization-ui.mjs`
- `node tools/validation/studio/validate-studio-library-actions.mjs`
- `node tools/validation/studio/validate-studio-import-bundle.mjs`
- `node tools/validation/cross-platform/scans/scan-runtime-import-graph.mjs`

Expected final counts:

- Native validator: greater than `223`, with `0` failures.
- Studio organization: `107 / 0`.
- Studio library-actions: `135 / 0`.
- Studio import-bundle: `277 / 0`.
- Import graph: clean.
