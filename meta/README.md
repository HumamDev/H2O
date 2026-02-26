# Meta Folder Convention

This folder is a reserved home for repo metadata that is useful for local workflows now and CI/reporting later.

## Subfolders

- `meta/ledger/`: machine-readable ledgers and durable tracking files (future examples: additional CSV/JSON release ledgers, audit indexes).
- `meta/reports/`: generated reports/summaries for humans (future examples: validation reports, migration summaries, release summaries).
- `meta/notes/`: lightweight project notes or operational notes (future examples: rollout notes, maintenance checklists, migration notes).

## What goes where

- Put durable structured logs/ledgers in `meta/ledger/`.
- Put generated diagnostics or review outputs in `meta/reports/`.
- Put short internal notes and process docs in `meta/notes/`.

## `versions.csv` (Important)

Do not move `versions.csv` yet; keep it at repo root until we have multiple ledger files.

Later migration rule:

- Only consider moving `versions.csv` to `meta/ledger/` when there are 2+ ledger files and we want a cleaner repo root.
- If moved later, use `git mv` and update the path constant in `tools/release.mjs`.
