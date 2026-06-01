# 0F1b Library Workspace — Retirement Record

**Status (R4.7.5): RETIRED — Native Library Workspace UI moved out of live runtime.**

## What was here pre-R4.7

`src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` owned:

- Top-level Library sidebar button (top + rail variants;
  `UI_LIBRARY_TOP_BUTTON`, `UI_LIBRARY_RAIL_BUTTON`)
- The `/library` route registration + Dashboard workspace page mount
  via `mountPage`, `renderWorkspaceBody`, and `UI_LIBRARY_PAGE`
- Read-only Native Library workspace rendering over 0F1c Library Index
- Native sidebar layout/prepaint helpers for the Library workspace entry
- R4.6.1 deprecation banner (`buildR46DeprecationBanner`)
- R4.6.3 body-attribute updater + workspace CSS gate
  (`applyR46BodyAttrs`, `installR46WorkspaceCssGate`,
  `syncR46WorkspaceElements`)
- Insights delegation into 0F1d Explorer + Analytics renderers

## What R4.7.5 retired

The original implementation is archived as:

- `library-workspace-ui.js` — full pre-R4.7.5 0F1b source with block headers

Moved blocks:

- Block 1 — R4.6.3 workspace body-attribute + CSS gate
- Block 2 — R4.6.1 deprecation banner
- Block 3 — Library sidebar button + prepaint/layout UI
- Block 4 — Workspace CSS renderer
- Block 5 — `/library` route, native navigation guard, page host, and workspace renderers
- Block 6 — Workspace read-model fallback, route/event bindings, public UI API, and boot wiring

The live 0F1b file now keeps only diagnostics plus no-op compatibility
methods on `H2O.LibraryWorkspace` so callers that probe the namespace do
not fail. It does not register the Native `/library` page/route and does
not inject Library buttons, page DOM, workspace CSS, or the deprecation
banner.

## What STAYS post-R4.7.5

- The R4.6 flag-reader helpers remain queryable:
  `isNativeWorkspaceUiEnabled`, `isNativeOrganizationUiEnabled`,
  `isNativeCaptureOnlyMode`
- `H2O.deprecation.native['0F1b']` remains queryable and reports
  `R4.7.5-retired`
- `H2O.LibraryWorkspace` remains as a retired/no-op compatibility API
  with `selfCheck()`, `refresh()`, and legacy method names
- 0F1k flags system remains untouched
- Capture/save/link modules remain untouched
- 0F5a tag extraction remains untouched
- 0D3 and 3X capture files remain untouched
- 0F3a Folders remains untouched

## Replacement

| Native surface | Replacement |
|---|---|
| Native Library sidebar button | Desktop Studio top-level navigation |
| `/library` route + Dashboard | Desktop Studio Library Dashboard |
| Native Explorer / Analytics delegation | Desktop Studio `S0F1d. 🎬 Library Insights - Studio.js` |
| Native sidebar layout/prepaint UI | Desktop Studio `S0Z1g` Library sidebar organization UI |
| R4.6.1 deprecation banner | Removed; Native workspace UI is no longer restorable in-place |
| Body-attribute + workspace CSS gate | Removed; no 0F1b UI remains to gate |

## Safety Invariants

- **NO change to 0F3a Folders.** Folder data and UI retirement are out of scope.
- **NO change to 0F5a tag extraction.** The byte-exact 273099-byte canary remains protected by the validator.
- **NO change to capture path.** 0F1j, 0F3a capture menu injection, and 0D3/3X capture files remain untouched.
- **NO change to Studio files or generated build outputs.** Desktop Studio is the replacement, not part of this edit.
- **0F1k flags remain.** Flags are still diagnosable even though the retired Native UI no longer responds to them.

## Rollback Procedure

See `../notes/rollback-procedures.md`. The normal rollback is:

```bash
git revert <R4.7.5 commit hash>
```

For manual investigation, compare the live stub with
`library-workspace-ui.js`, which preserves the full original source.
