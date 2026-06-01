# 0F1b Library Workspace — Retirement Record

**Status (R4.7.1): scaffolding only — no code moved yet. Code retires in R4.7.2.**

## What was here pre-R4.7

`src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js` owned:

- Top-level Library sidebar button (top + rail variants;
  `UI_LIBRARY_TOP_BUTTON`, `UI_LIBRARY_RAIL_BUTTON`)
- The `/library` route registration + Dashboard workspace page mount
  via `mountPage`, `renderWorkspaceBody`, and `UI_LIBRARY_PAGE`
- R4.6.1 deprecation banner (`buildR46DeprecationBanner`,
  `R46_BANNER_*` styles)
- R4.6.3 body-attribute updater + workspace CSS gate
  (`applyR46BodyAttrs`, `installR46WorkspaceCssGate`,
  `syncR46WorkspaceElements`)
- The 1-second setInterval poll loop

## What R4.7.2 will retire (planned)

From `src-runtime-base/0F1b.⬛️🗂️ Library Workspace 🗂️.js`,
move into this folder:

- `workspace-page.js` — `mountPage`, `renderWorkspaceBody`,
  page-host construction (lines ~3100-3600 area pre-R4.7)
- `library-button.js` — top-button + rail-button installers
  (`UI_LIBRARY_TOP_BUTTON`, `UI_LIBRARY_RAIL_BUTTON` builders)
- `deprecation-banner.js` — R4.6.1 banner builder
  (`buildR46DeprecationBanner`)
- `body-attr-and-css-gate.js` — R4.6.3 workspace gate
  (`applyR46BodyAttrs`, `installR46WorkspaceCssGate`,
  `syncR46WorkspaceElements`, plus the 1s setInterval poll)

`extracted-from-0F1b.md` (added by R4.7.2) will record the exact
line ranges + commit hash.

## What STAYS in 0F1b post-R4.7

- The R4.6.0 flag-reader helpers
  (`isNativeWorkspaceUiEnabled`, `isNativeOrganizationUiEnabled`,
  `isNativeCaptureOnlyMode`)
- The `H2O.deprecation.native['0F1b']` diagnose registration
- The IIFE skeleton + module identifiers (TOK / SkID / CID etc.)

These remain so `H2O.flags.diagnose()` and
`H2O.deprecation.native['0F1b']()` continue to be queryable after
R4.7. The deprecation flags themselves become advisory (no UI to
control) — documented in `../notes/rollback-procedures.md`.

## Replacement

| Native surface | Replacement |
|---|---|
| Native Library sidebar button | Desktop Studio top-level navigation |
| `/library` route + Dashboard | Desktop Studio `#/library/dashboard\|explorer\|recents\|saved\|folders\|folder/<id>` |
| R4.6.1 deprecation banner | Removed (banner exists only to announce the deprecation; no UI to wrap) |
| Body-attribute + workspace CSS gate | Removed (no UI to gate) |

## Safety invariants for this retirement

- **NO change to capture path.** 0F1b never owned capture; this
  retirement cannot regress capture.
- **NO change to 0F1j Library Actions** (`addToLibrary`,
  `saveToFolder`, `openLinkedChat`).
- **NO change to 0F5a tag extraction.**
- **NO change to 0F1k flag system.** `NATIVE_FLAG_DEFAULTS` table
  and `ensureFlags()` stay; flags remain queryable via
  `H2O.flags.diagnose()`.
- **Studio R4.5 modules untouched.** Desktop Studio Library is the
  replacement; this retirement does not modify Studio code.

## Rollback procedure

See `../notes/rollback-procedures.md`. The shortest path:

```bash
git revert <R4.7.2 commit hash>
```

This restores `0F1b.⬛️🗂️ Library Workspace 🗂️.js` to its R4.6.4
state (workspace + button + banner code present; default-hidden by
the R4.6.4 flag flip; restorable per-operator via
`H2O.flags.set('library.nativeWorkspaceUi', true) + reload`).
