# Chat Saving Architecture — Phase B Closure Note

Status: Closure evidence (docs only)

Date: 2026-06-23

Lane: Chat Saving Architecture (separate from the Sync Architecture / RC smoke bridge lane)

Related:

- [ADR-0009: Chat Saving Architecture - H2O Studio Archive Model](../../decisions/ADR-0009-chat-saving-architecture.md)
- [Saved Chat Package v1 Schema Spec](saved-chat-package-v1.md)
- Projector: `src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js`
- Validator: `tools/validation/studio/validate-saved-chat-package-v1.mjs`

This note records that Phase A and Phase B of the Chat Saving Architecture lane
are closed, and preserves the exact closure evidence before Phase C planning
begins. It changes no runtime behavior.

## 1. Status

- Phase A: **Closed**
- Phase B: **Closed**
- Next: **Phase C planning, not implementation**

## 2. What Phase A delivered

Phase A defined the architecture contract (docs only):

- **ADR-0009** — the Chat Saving Architecture / H2O Studio archive model.
- **`saved-chat-package-v1` schema spec** — the v1 package shape, `manifest.json`
  / `snapshot.json` field contracts, derived-renderer rules, content-hash
  contract, and validation rules.
- **Source-of-truth rule** — Desktop SQLite / `H2O.Studio.store` adapters are the
  only live mutation source of truth.
- **Package-as-projection rule** — saved chat packages are deterministic,
  hash-bound preservation projections and must never become a second live
  mutable store.

Commits:

- `6814657` docs(studio): add chat saving architecture contract
- `242f258` docs(studio): tighten saved chat package schema

## 3. What Phase B delivered

Phase B delivered a private, Desktop-only, projection-only package projector and
its validator:

- **Private Desktop package projector** — `saved-chat-package-v1.tauri.js`,
  gated on Tauri detection; a no-op on Chrome/MV3 (Chrome stays light).
- **`buildSavedChatPackageV1`** — reads through `H2O.Studio.store` adapters only
  and returns the in-memory package projection (no filesystem writes).
- **`writeSavedChatPackageV1`** — materializes the package to an explicit target
  folder; fails closed when the target exists unless `overwrite: true` is passed,
  and guards the recursive overwrite delete (requires a `*.h2ochat` basename and
  refuses a folder whose readable `manifest.json` declares a foreign schema).
- **`diagnoseSavedChatPackageV1`** — reports Phase B boundaries
  (`desktopOnly`, `projectionOnly`, `uiWired: false`, `syncIntegrated: false`,
  `casImplemented: false`) and store availability.
- **Deterministic `snapshot.json`** — the canonical, content-hashed capture is
  derived only from stored values; environment/wall-clock fallbacks
  (`navigator.language`, `Intl` timezone, `nowIso()`) were removed so the same
  store snapshot hashes identically on any machine.
- **`manifest.json` hash contract** — `contentHash` is the SHA-256 of the
  canonical `snapshot.json` bytes; with no assets `contentHash ===
  files.snapshot.sha256`. Renderer files carry tamper-detection hashes that do
  not define preserved chat identity.
- **`chat.md`** — derived, rebuildable Markdown renderer.
- **`chat.html`** — derived, rebuildable visual renderer; carries a restrictive
  static CSP meta (no script/object/frame; inline style only) as defense-in-depth
  over the interim regex sanitizer.
- **Validator** — `validate-saved-chat-package-v1.mjs`, covering package shape,
  canonical hashing, cross-environment determinism, on-disk readback re-hashing,
  HTML sanitization, fail-closed write, and a no-store-mutation proof.

Commits:

- `d0ed18b` feat(studio): add saved chat package v1 projector
- `2fa78cf` fix(studio): harden saved chat package v1 determinism

Note: an unrelated Sync-lane commit may exist interleaved in `main` history
between these lane commits. It is out of scope for this lane and was neither
modified nor staged as part of Chat Saving Architecture work.

## 4. Validation evidence

Captured 2026-06-23 at closure:

```text
$ node --check src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js
(no output; exit 0)

$ node --check tools/validation/studio/validate-saved-chat-package-v1.mjs
(no output; exit 0)

$ node tools/validation/studio/validate-saved-chat-package-v1.mjs
── Studio saved-chat package v1 validator ───────────────
  ✓ module source exists
  ✓ module stays out of raw SQLite and sync lanes
  ✓ loader and pack list expose the Desktop-only module
  ✓ private Desktop API registers required functions
  ✓ buildSavedChatPackageV1 builds package from explicit snapshotId
  ✓ buildSavedChatPackageV1 chooses latest snapshot via listByChat
  ✓ snapshot.json bytes and contentHash are identical across environments
  ✓ writeSavedChatPackageV1 writes explicit target folder only
  ✓ written snapshot.json bytes re-hash to manifest contentHash
  ✓ writer fails when package exists unless overwrite is explicit
  ✓ Phase B build/write never calls store mutation methods
  ✓ diagnose reports Phase B boundaries

PASS 12
(PASS 12 / FAIL 0)

$ git diff --check
(no output; exit 0)

$ git diff --cached --check
(no output; exit 0)
```

Docs lint: no markdown lint configuration exists in this repo (no
`.markdownlint*` config and no `docs:lint`/`lint:docs` script in `package.json`),
so no docs-lint step was run.

## 5. Explicit preserved non-goals

The following remain out of scope and were not introduced in Phase A/B:

- No CAS (asset content-addressed store).
- No sync integration.
- No UI wiring.
- No import/recovery flow.
- No WebDAV/cloud transport.
- No package as a second live store (packages are projection-only).
- Chrome stays light.
- Desktop remains canonical/professional.

## 6. Phase C open questions

To be resolved during Phase C **planning** (not implementation):

- Asset CAS descriptor shape (`assets/sha256-<hash>.<ext>`, manifest `assets[*]`
  descriptors, message `assetRefs`).
- Asset-inclusive hash contract — how assets fold into `contentHash`, and whether
  it requires a schema or hash-contract version bump.
- Whether the interim regex sanitizer should become a shared DOM/allowlist
  utility before any rendering/import surface lands.
- Desktop archive/index ownership (search/index/rebuild responsibilities).
- Future UI surface for package materialization (Save-to-Folder wiring), kept
  Desktop-owned.

## 7. Final closure verdict

Chat Saving Architecture
Phase A: Closed
Phase B: Closed
Next: Phase C planning — Desktop archive/index + asset CAS design
