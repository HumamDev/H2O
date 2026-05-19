# src/extensions/_shared/ — cross-host/cross-browser incubator

This is an **incubator** for code that is shared across multiple host/browser
combinations but not yet stable enough to graduate to a workspace package.

## What lives here

| Subdir | Intent |
|---|---|
| `browser/` | Cross-browser WebExtension API wrapper (`chrome.*` vs `browser.*` polyfill, feature detection) |
| `dom/` | Shared MutationObserver helpers, selector utilities, generic chat-thread parsers |
| `overlay/` | Tooltip / overlay / popup primitives (no host-specific styling) |
| `storage/` | Storage abstraction (chrome.storage / browser.storage / fallback) |

## What does NOT live here

- Anything host-specific (lives under `src/extensions/<host>/<browser>/`).
- Anything stable with ≥2 consumers (graduates to `packages/`).
- chatgpt+chrome legacy code (stays in top-level `scripts/`).

## Graduation path (`_shared/` → `packages/`)

Move a module out of `_shared/` and into `packages/<module>/` when ALL these
hold:

1. **Stable API** — public function signatures haven't changed in 4+ weeks.
2. **≥2 real consumers** — at least 2 different `src/extensions/<host>/<browser>/`
   trees depend on it.
3. **Versionable** — the module can be semver'd independently.
4. **No tight coupling** — doesn't import from any specific host or browser.

Until graduation, consumers import via relative path:
```js
import { X } from "../../../_shared/dom/observer.js";
```
After graduation:
```js
import { X } from "@h2o/<module>";
```

See [../../docs/architecture/MULTI_HOST_ARCHITECTURE.md §7](../../../docs/architecture/MULTI_HOST_ARCHITECTURE.md)
for the full graduation strategy.

## Today's state

Phase 8G-2 created the empty `browser/`, `dom/`, `overlay/`, `storage/`
subdirs as future homes. Each is empty except for a `.gitkeep`. Real
code lands here when a second host actually needs it.
