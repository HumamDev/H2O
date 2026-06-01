# 0F1d Library Insights — Retirement Record

**Status (R4.7.1): scaffolding only — no code moved yet. Entire file retires in R4.7.2.**

## What was here pre-R4.7

`src-runtime-base/0F1d.⬛️🗂️ Library Insights 📊🗂️.js` owned the
Explorer + Analytics tabs rendered INSIDE the 0F1b workspace page:

- Explorer tab — filter controls, grouped known-chat list/table,
  source/date/category/label/folder/project/tag slicing
- Analytics tab — summary cards + lightweight chart/diagram rendering
- UI preferences for Insights-specific filters, grouping, date
  bucket, chart density, table cap
- Diagnostic + stable render API for 0F1b Library Workspace

Per its docstring, 0F1d MUST NOT own normalized data / stats truth
(that lives in 0F1c Library Index) or shared registries / services
(0F1a Library Core). 0F1d is pure rendering — when its host
(0F1b workspace) is retired, 0F1d has nothing to render INTO.

## What R4.7.2 will retire (planned)

The ENTIRE file moves into this folder as `0F1d-original.js`.
`extracted-from-0F1d.md` records the move.

The 0F1d module is removed from the dev-loader / chrome-live build
manifest (R4.7.2 investigates which loader registers 0F1d and removes
the entry).

## What STAYS post-R4.7

Nothing 0F1d-specific. The data + read model (0F1c Library Index) is
NOT retired — Studio's `S0F1c. Library Index` continues to consume it
when appropriate.

## Replacement

| Native surface | Replacement |
|---|---|
| Explorer tab (filter, grouped chat list/table) | Desktop Studio's `S0F1d. 🎬 Library Insights - Studio.js` Explorer surface |
| Analytics tab (cards, charts) | Desktop Studio's `S0F1d` Analytics surface |
| UI preferences (filters, grouping, date bucket, etc.) | Desktop Studio's Library Insights prefs (PREFS_KEY: `h2o:prm:cgx:library-insights:studio:prefs:v2`) |

## Safety invariants for this retirement

- **0F1c Library Index untouched** — the read model 0F1d depended on
  stays alive. Studio S0F1c is the replacement consumer.
- **NO change to capture path, 0F5a, 0F1j, MV3 fallback APIs.**
- **Studio R4.5 modules untouched.**

## Rollback procedure

`git revert <R4.7.2 commit hash>` restores 0F1d in its entirety.
Note: 0F1d only RENDERS — if you restore 0F1d without restoring
0F1b's workspace host, 0F1d will not surface (no mount point). The
typical rollback restores BOTH 0F1d and 0F1b together as a single
R4.7.2 revert.
