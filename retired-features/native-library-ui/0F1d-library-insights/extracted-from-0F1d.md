# Extracted from 0F1d — R4.7.5

Source:
`src-runtime-base/0F1d.⬛️🗂️ Library Insights 📊🗂️.js`

Destination:
`retired-features/native-library-ui/0F1d-library-insights/0F1d-original.js`

Commit: _<commit hash; populated post-commit>_

## Move Summary

R4.7.5 retired the entire Native 0F1d Library Insights UI renderer. The
full original source was archived, and the live source now contains only a
retired/no-op diagnostic stub.

## Extracted Blocks

| Block | Source lines (pre-R4.7.5) | Destination | Disposition |
|---|---:|---|---|
| Block 1 | 1-1445 | `0F1d-original.js` | Entire Explorer + Analytics render-only module retired |

## Live Stub

The live 0F1d source still defines:

- `H2O.LibraryInsights.meta` with retired status
- `H2O.LibraryInsights.refresh()` as a no-op compatibility method
- `H2O.LibraryInsights.selfCheck()` diagnostics
- optional Library Core owner/service registration for compatibility

The live 0F1d source no longer defines:

- `renderExplorer`
- `renderAnalytics`
- `ensureStyle`
- Insights-specific prefs mutation helpers
- Explorer controls, table rendering, cards, charts, or Native CSS

## Boundaries

R4.7.5 did **not** retire 0F1c Library Index, folders, tags, capture files,
0F1k flags, Studio files, or generated build outputs.

## Rollback

Use `git revert <R4.7.5 commit hash>` or manually restore the archived
implementation from `0F1d-original.js`.
