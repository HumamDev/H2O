# src/ — NEW per-host/per-browser source root

Established in Phase 8G-2 (2026-05-19).

This directory holds source code for **new** (post-legacy) extension products.
Each host+browser combination has a self-contained source tree under
`src/extensions/<host>/<browser>/`.

## What's here

| Path | Purpose |
|---|---|
| `src/extensions/_shared/` | Incubator for cross-host/cross-browser code (graduates to `packages/` when stable + multi-consumer) |
| `src/extensions/<host>/<browser>/` | Source for one extension product (host = chatgpt/claude/gemini, browser = chrome/firefox) |

## What's NOT here

- **The chatgpt+chrome legacy runtime** lives at the **top level** of the repo
  (`src-runtime-base/` — renamed from `scripts/` in Phase 8K-5 — plus
  `surfaces/`, `config/`). It is frozen and intentionally not duplicated here.
  See `docs/architecture/MULTI_HOST_ARCHITECTURE.md` §2.1 for the rationale.
- **Generated outputs** never live here — those land at
  `apps/extensions/<host>/<browser>/<variant>/` (gitignored).
- **Workspace libraries** live in `packages/`, not here.

## Where to read more

- [docs/architecture/MULTI_HOST_ARCHITECTURE.md](../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
  — the canonical multi-host/multi-browser architecture reference.
- [docs/architecture/PRODUCTS.md](../docs/architecture/PRODUCTS.md) — the
  current product map.
