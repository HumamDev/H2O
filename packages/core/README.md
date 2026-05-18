# packages/core — FUTURE PLACEHOLDER

Future shared "core" package — language-agnostic primitives reused across
all H2O surfaces (extensions, Studio desktop, Studio mobile, future web
Studio).

Not yet implemented. The existing seed packages today are:

  - `packages/identity-core` — identity / auth primitives
  - `packages/studio-core`   — Studio-specific shared logic
  - `packages/studio-ui`     — Studio shared UI tokens
  - `packages/studio-types`  — Studio shared TypeScript types

If a NON-Studio, NON-identity core layer is ever extracted (event bus
contracts, common runtime helpers, shared error types, etc.), it would
live here. Until then this README is the only tracked content; no
package.json, no source, no workspace entry.
