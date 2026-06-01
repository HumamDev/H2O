# 0F1d Library Insights — Retirement Record

**Status (R4.7.5): RETIRED — entire Native Library Insights UI moved out of live runtime.**

## What was here pre-R4.7

`src-runtime-base/0F1d.⬛️🗂️ Library Insights 📊🗂️.js` owned the
Explorer + Analytics tabs rendered inside the 0F1b Native workspace page:

- Explorer tab — filter controls, grouped known-chat list/table,
  source/date/category/label/folder/project/tag slicing
- Analytics tab — summary cards + lightweight chart/diagram rendering
- UI preferences for Insights-specific filters, grouping, date bucket,
  chart density, table cap, and table columns
- Diagnostic + stable render API for 0F1b Library Workspace

0F1d was render-only. Normalized data and stats truth remain in 0F1c
Library Index.

## What R4.7.5 retired

The entire original implementation moved to:

- `0F1d-original.js` — full pre-R4.7.5 0F1d source

The live 0F1d file is now a retired/no-op diagnostic stub. It exposes no
`renderExplorer` or `renderAnalytics` API and installs no Native styles.

## What STAYS post-R4.7.5

- A minimal `H2O.LibraryInsights` namespace for diagnostics and no-op
  `refresh()` compatibility
- `H2O.LibraryInsights.selfCheck()` reporting retired status
- 0F1c Library Index remains untouched
- 0F1b remains as a retired/no-op compatibility stub
- Capture/save/link, 0F5a extraction, 0D3/3X capture files, 0F3a Folders,
  0F1k flags, Studio files, and generated build outputs remain untouched

## Replacement

| Native surface | Replacement |
|---|---|
| Explorer tab | Desktop Studio `S0F1d. 🎬 Library Insights - Studio.js` Explorer surface |
| Analytics tab | Desktop Studio `S0F1d` Analytics surface |
| UI preferences | Desktop Studio Library Insights prefs |
| Native render API for 0F1b | Retired with the Native 0F1b workspace host |

## Safety Invariants

- **0F1c Library Index untouched.** The read model 0F1d depended on stays alive.
- **NO change to capture path, 0F5a, 0F1j, 0D3/3X, or MV3 fallback APIs.**
- **NO change to 0F3a Folders.** Folder retirement is out of scope.
- **NO change to Studio files or generated build outputs.**

## Rollback Procedure

`git revert <R4.7.5 commit hash>` restores 0F1d together with the live
0F1b host when the R4.7.5 changes are reverted. For manual inspection, the
full original 0F1d source is preserved in `0F1d-original.js`.
