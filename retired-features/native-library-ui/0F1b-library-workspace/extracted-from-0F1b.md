# Extracted from 0F1b — R4.7.5

Source:
`src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js`

Destination:
`retired-features/native-library-ui/0F1b-library-workspace/library-workspace-ui.js`

Commit: _<commit hash; populated post-commit>_

## Move Summary

R4.7.5 retired the Native Library Workspace UI. The full pre-retirement
0F1b implementation was archived, and the live source was reduced to a
retired/no-op compatibility stub with diagnostics.

## Extracted Blocks

| Block | Source lines (pre-R4.7.5) | Destination | Disposition |
|---|---:|---|---|
| Block 1 | 108-196 | `library-workspace-ui.js` | R4.6.3 workspace body-attribute + CSS gate retired |
| Block 2 | 198-265 | `library-workspace-ui.js` | R4.6.1 deprecation banner retired |
| Block 3 | 956-2468 | `library-workspace-ui.js` | Library sidebar button + prepaint/layout UI retired |
| Block 4 | 2469-2784 | `library-workspace-ui.js` | Workspace CSS renderer retired |
| Block 5 | 2800-3658 | `library-workspace-ui.js` | `/library` route, native navigation guard, page host, and workspace renderers retired |
| Block 6 | 3666-4881 | `library-workspace-ui.js` | Workspace read-model fallback, route/event bindings, public UI API, and boot wiring retired |

## Live Stub

The live 0F1b source still defines:

- R4.6 flag helpers and `H2O.deprecation.native['0F1b']`
- `H2O.LibraryWorkspace.selfCheck()`
- no-op compatibility methods including `openWorkspace`, `refresh`,
  `ensureTopLibraryButton`, `ensureRailLibraryButton`, and sidebar layout methods
- Library Core owner/service registration only; no page or route registration

The live 0F1b source no longer defines:

- `applyR46BodyAttrs`, `syncR46WorkspaceElements`, or `installR46WorkspaceCssGate`
- `buildR46DeprecationBanner`
- `mountPage`, `makeWorkspacePage`, or `renderWorkspaceBody`
- `ensureTopLibraryButton` / `ensureRailLibraryButton` render implementations
- `renderDashboard`, `renderOverview`, `renderOrganize`, or Insights tab rendering

## Boundaries

R4.7.5 did **not** retire 0F3a Folders, 0F5a Tags extraction, labels, categories, projects data,
capture/save/link, 0D3/3X capture files, 0F1k flags, Studio files, or generated
build outputs.

## Rollback

Use `git revert <R4.7.5 commit hash>` or manually restore the archived
implementation from `library-workspace-ui.js`.
