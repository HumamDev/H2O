# 0F6a Labels UI — Retirement Record

**Status (R4.7.1): scaffolding only — no code moved yet. UI retires in R4.7.2.**

## What was here pre-R4.7

`src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js` owns the Native labels
catalog + sidebar UI + per-turn chip-color UI. R4.7.2 retires only
the sidebar UI; the catalog API and chip-color stay.

**KEEPS (NEVER retired — Studio MV3 fallback + turn-level UI):**
- `function createLabel(typeRaw, labelRaw, opts = {})` (line ~870
  pre-R4.6)
- `function renameLabel(typeRaw, labelIdRaw, nextLabelRaw)`
  (line ~895)
- `function deleteLabel(typeRaw, labelIdRaw, opts = {})` (line ~914)
- Per-turn `lbsc-chip-color` chip-color UI on chat titles
  (this is part of turn-level UI; companions with 0F5a tag pills)
- Label catalog data layer
- The R4.6.0 flag-reader helpers + diagnose registration

**RETIRES (R4.7.2):**
- `UI_LABELS_ROOT = 'lbsc-root'` — data-cgxui value set on the labels
  section element (line ~1789 pre-R4.6)
- `UI_LABELS_ROW = 'lbsc-row'` — per-label row marker
- `UI_LABELS_MORE = 'lbsc-more'` — label "more" button marker
- The section render function (`mountPage`, line ~2211 pre-R4.6)
- `UI_LABELS_PAGE`, `UI_LABELS_PAGE_HOST`, `UI_LABELS_VIEWER`,
  `UI_LABELS_MODAL`, `UI_LABELS_POP`, `UI_LABELS_MENU_ITEM`,
  `UI_LABELS_ICON_SLOT` — page + menu + modal UI constants
- Section render + row render + more-button mount logic
- Sidebar observer (`ensureSidebarObserver`)
- R4.6.3 per-element sync (`R46_ORG_SELECTORS`,
  `syncR46OrgElements`, `installR46OrgCssGate`)

## What R4.7.2 will retire (planned)

From `src-runtime-base/0F6a.⬛️🏷️ Labels 🏷️.js`, move into this
folder:

- `labels-sidebar.js` — section root mount, row + more-button
  renderers, "New label" action row, context-menu wiring
- `labels-workspace-page.js` — page-mount + viewer + modal UI
  (if these surface only via 0F1b workspace; rendering inside the
  now-retired host)
- `r46-per-element-sync.js` — R4.6.3 sync block

`extracted-from-0F6a.md` records exact line ranges + commit hash.

## What STAYS in 0F6a post-R4.7

- `function createLabel`, `function renameLabel`, `function deleteLabel`
  — Studio MV3 fallback dependency (S0Z1g calls
  `H2O.Labels.renameLabel(...)` etc.)
- `H2O.Labels` namespace exports + label catalog data layer
- Per-turn chip-color UI (`lbsc-chip-color` element creation — this
  is a DIFFERENT subtree from the sidebar `lbsc-root` and ships with
  turn-level UI)
- Label binding + per-chat label state
- R4.6.0 flag-reader helpers
- `H2O.deprecation.native['0F6a']` diagnose registration

## Replacement

| Native surface | Replacement |
|---|---|
| Labels sidebar section root (`lbsc-root`) | Desktop Studio's S0Z1g labels section |
| Label rename/delete UI | S0F1m's `openLabelEditor({mode: 'rename' \| 'color' \| 'delete'})` |
| Label-create UI | S0F1m's `openLabelEditor({mode: 'create'})` |
| Label rows + label "more" buttons | S0Z1g sidebar item menu + S0F1m modals |
| `function renameLabel` / `deleteLabel` / `createLabel` | **STAY in 0F6a** — Studio MV3 fallback dependency |
| Per-turn `lbsc-chip-color` chip UI | **STAYS in 0F6a** — turn-level UI; companions with 0F5a tag pills |

## Safety invariants for this retirement

- **0F5a tag extraction untouched.**
- **Capture path untouched.**
- **H2O.Labels CRUD preserved.** Validator Section P re-asserts
  `function renameLabel`, `function deleteLabel`, `function createLabel`
  bodies still exist in 0F6a and contain no deprecation-flag references.
- **Turn-level chip-color UI preserved.** The `lbsc-chip-color`
  selector is NOT in any R4.7.2 retirement scope (it lives in a
  different DOM subtree from `lbsc-root`).
- **NO change to Studio R4.5.**
- **NO change to 0F1k flag system.**

## Rollback procedure

`git revert <R4.7.2 commit hash>` restores the labels sidebar UI.

Per-file rollback: copy `labels-sidebar.js` contents back into
0F6a at the recorded line ranges (see `extracted-from-0F6a.md`),
then run `npm run dev:rebuild && npm run dev:all`.
