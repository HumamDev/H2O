# 0F3a Folders UI — Retirement Record

**Status (R4.7.1): scaffolding only — no code moved yet. UI retires in R4.7.3.**

## What was here pre-R4.7

`src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js` is the most
boundary-sensitive module in R4.7. It owns BOTH the folder sidebar UI
AND the capture menu injection. R4.7.3 retires the UI surgically while
preserving the capture path.

**KEEPS (NEVER retired — hard invariant):**
- `ENGINE_injectAddToLibrary` — chat-row "Add to Library" menu
  injection (CAPTURE)
- `ENGINE_injectAddToFolder` — chat-row "Save to Folder" menu
  injection (CAPTURE)
- `STORE_validateFolderCreate` — Native folder-create code path
  (Studio MV3 fallback dependency)
- The capture menu items' data-cgxui values `flsc-add-to-folder`
  and `flsc-add-to-library`
- All folder DATA structures (vault, store, listeners,
  cross-module state proxy used by 0F2a)
- The R4.6.0 flag-reader helpers + diagnose registration

**RETIRES (R4.7.3):**
- `UI_FSECTION_FOLDER_ROW = 'flsc-folder-row'` — the data-cgxui value
  set on folder rows in the sidebar
- `UI_FSECTION_FOLDER_MORE = 'flsc-folder-more'` — the data-cgxui
  value set on folder "more" buttons
- The folder row renderer (line 4873 area: `row.setAttribute(
  ATTR_CGXUI, UI_FSECTION_FOLDER_ROW)` and surrounding render
  function body)
- The folder "more" button mount logic (lines 5981, 6033 — wrapped
  around `UI_makeNativeLikeMoreButton('Folder actions',
  UI_FSECTION_FOLDER_MORE)`)
- The folder context-menu wiring (rename / color / delete folder
  via the more-button popup — NOT the chat-row capture menu)
- R4.6.3 per-element sync (`R46_ORG_SELECTORS`,
  `syncR46OrgElements`, `installR46OrgCssGate`)
- Folder-create canonical panel UI (the popup shell only;
  `STORE_validateFolderCreate` stays)

## What R4.7.3 will retire (planned)

From `src-runtime-base/0F3a.⬛️🗂️ Folders 🗂️.js`, move into this
folder:

- `folders-sidebar-list.js` — folder row + more-button renderers,
  folder context-menu wiring
- `folder-create-canonical-panel.js` — the popup shell (if separable
  from STORE_validateFolderCreate)
- `r46-per-element-sync.js` — R4.6.3 sync function block

`extracted-from-0F3a.md` (added by R4.7.3) records exact line ranges
+ commit hash with EXPLICIT boundary annotations confirming which
lines stayed vs moved.

## Adversarial review at R4.7.3

This module's retirement runs an adversarial review workflow at
R4.7.3 (parallel critics from capture / folder-create / data-layer
angles). The review confirms:

1. `ENGINE_injectAddToLibrary` + `ENGINE_injectAddToFolder` bodies
   contain no flag-helper calls; their cgxui values continue to ship
2. `STORE_validateFolderCreate` is callable
3. The 0F2a `H2O.FS.fldrs.state` state proxy is intact
4. No retired code path is reachable via runtime API surface

## Replacement

| Native surface | Replacement |
|---|---|
| Folder sidebar list rendering | Desktop Studio's S0Z1g folders section |
| Folder rename/color/delete UI | S0F1m's `openFolderEditor({mode: 'rename' \| 'color' \| 'delete'})` |
| Folder context-menu wiring | S0Z1g sidebar item menu |
| Folder-create canonical panel UI | S0F1m's `openFolderEditor({mode: 'create'})` |
| `STORE_validateFolderCreate` (folder-create LOGIC) | **STAYS in 0F3a** — Studio MV3 fallback path still calls it via S0Z1g `openFolderCreatePanel` |
| `ENGINE_injectAddToLibrary` / `ENGINE_injectAddToFolder` (chat-row menu) | **STAYS in 0F3a** — Native capture path; never retired |

## Safety invariants for this retirement

- **0F5a tag extraction untouched.**
- **Capture path untouched.** Validator Section P re-asserts:
  - `ENGINE_injectAddToLibrary` function body has no flag-helper calls
  - `ENGINE_injectAddToFolder` function body has no flag-helper calls
  - `STORE_validateFolderCreate` is reachable
  - cgxui values `flsc-add-to-folder` and `flsc-add-to-library`
    continue to be set on capture menu items
- **0F4a, 0F6a CRUD APIs untouched.**
- **0F2a fetch interception untouched.** The cross-module state
  proxy `H2O.FS.fldrs.state` that 0F2a shares with 0F3a remains
  intact.
- **Studio R4.5 untouched.**
- **0F1k flag system untouched.**

## Rollback procedure

`git revert <R4.7.3 commit hash>` restores the folder sidebar UI.

Because R4.7.3 is the boundary-sensitive slice, the validator runs
extra checks at every step + an adversarial review workflow before
the commit lands. Per-file rollback also documented in
`extracted-from-0F3a.md` post-R4.7.3.
