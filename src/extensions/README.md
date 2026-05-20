# src/extensions/ — per-host/per-browser source

Each subdirectory is a self-contained source tree for one extension product:

```
src/extensions/
├── _shared/                ← cross-host/cross-browser incubator
├── chatgpt/firefox/        ← ChatGPT on Firefox
├── claude/chrome/          ← Claude on Chrome
├── claude/firefox/         ← Claude on Firefox
├── gemini/chrome/          ← Gemini on Chrome
└── gemini/firefox/         ← Gemini on Firefox
```

**Note**: `chatgpt/chrome/` is intentionally absent. The chatgpt+chrome
legacy runtime lives at the top of the repo (`src-runtime-base/` — renamed
from `scripts/` in Phase 8K-5 — plus `surfaces/`, `config/`) and is frozen. See
[../docs/architecture/MULTI_HOST_ARCHITECTURE.md](../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
§2.1 for the rationale.

## Per-host/per-browser source-tree shape

Every `src/extensions/<host>/<browser>/` has:

```
<host>/<browser>/
├── scripts/        runtime scripts (loaded into the browser page)
├── surfaces/       HTML+JS UI surfaces packaged inside the extension
├── config/         per-product loader/build config
├── assets/         icons, images, fonts (host+browser-specific)
└── README.md       per-product description
```

## How to add a new host+browser combo

See the mechanical checklist in
[../docs/architecture/MULTI_HOST_ARCHITECTURE.md §12](../../docs/architecture/MULTI_HOST_ARCHITECTURE.md).

## Where outputs land

Each `src/extensions/<host>/<browser>/` is built by a corresponding
`tools/product/extensions/<host>/<browser>/build.mjs` into the gitignored
`apps/extensions/<host>/<browser>/<variant>/` location. The source folder
(here) is what you edit; `apps/extensions/.../` is what the browser loads.
