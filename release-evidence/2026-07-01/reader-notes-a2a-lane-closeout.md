# Reader & Notes A2a Lane Closeout

Date: 2026-07-01

Latest baseline:

```txt
c7387c9 docs(reader-notes): record A2a.6 Option A owner decision
```

## Status

**CLOSED.** The Reader & Notes A2a lane is complete as a **read-only** resolver / consumer / probe / diagnostics capability. Visible highlight rendering is owned by the incumbent engine `S3H1a. 🎬 Highlights Engine - Studio.js` per the Option A owner decision. A2a.6.1 visible rendering is blocked; XPath and A2b are deferred.

## Closed chain (verified commits)

Architecture:

- A0 — architecture contract — `fa3df59 docs(reader-notes): add Studio Reader and Notes architecture contract`

A1 — LibraryItem / annotations / highlight attribution:

- A1.1 — captured-chat LibraryItem view — `4614b76`
- A1.2 — read-only notes/bookmarks annotation facade — `bfec8b4`
- A1.3a — read-only unattributed highlight enumeration — `7e8b42d`
- A1.3b — highlight attribution by exact per-item convoId — `d57ad42`

A2a.1 / A2a.2 — resolver core + DOM wrapper:

- A2a.1 — DOM-free highlight anchor resolver core — `779874e` (validator hardening `6b47bdc`)
- A2a.2a — un-wired DOM anchor resolver wrapper — `886c123` (validator hardening `b2b11b0`)

A2a.2b–A2a.2d — engine proofs:

- A2a.2b — Chrome/Blink real-DOM smoke — `7c874c5`
- A2a.2c.1 — Tauri/WebKit smoke template — `b8347dc`
- A2a.2c.2 — Tauri/WebKit proof gate closed — `5c1cd06`
- A2a.2d — flags.get read-purity audit — `8f8198b`

A2a.3 — inert exposure + real-boot:

- A2a.3 — inert loader/pack exposure — `eb1ed84`
- A2a.3b — real-boot namespace-installation gate — `290bcf8`

A2a.4 — consumer:

- A2a.4.1 — consumer-readiness proof — `14b8858`
- A2a.4.2 — read-only highlight-resolution consumer — `c540113`
- A2a.4.2b — real-boot consumer inertness gate — `6c3d9ad`
- A2a.4.2c — explicit-resolution smoke gate — `ae51bf4`

A2a.5 — reader-root probe:

- A2a.5 — reader-root resolution probe — `0edd103`
- A2a.5b — real-boot reader-root probe gate — `ad92b1d`

A2a.6 — rendering decision:

- A2a.6.0 — rendering reconciliation (found S3H1a incumbent) — `d400e50`
- A2a.6 — Option A owner decision (S3H1a sole renderer) — `c7387c9`

## Final product boundary

- **A2a is a read-only layer**: anchor resolver, DOM resolver, annotation-facade / highlight-resolution consumer, reader-root probe, diagnostics, and future non-visual consumers. It returns data-only rows; it never renders.
- **S3H1a owns visible highlight rendering** (`<mark data-highlight-id>` from `H2O.Studio.store.highlights`, same `hl_*` id space A2a resolves).
- **A2a must not render marks or overlays**, and must not mutate captured turn DOM.

## Future allowed A2a work (read-only, non-rendering)

- Diagnostics.
- Export / reporting support.
- Reconciliation / audit tools.
- Resolver hardening.
- Non-visual consumers.

All remain subject to the A2a invariants (read-only, no DOM mutation, no storage/sidecar writes, flag-gated + default-off, fail-closed) and their own reviewed slices.

## Blocked / deferred work

- A2a.6.1 visible rendering.
- XPath.
- A2b sidecar / enrichment.
- native_note / imported_document / converted_note.
- saved-chat downstream work.

## Reopening criteria for rendering

A2a.6.1 rendering may be revisited only if all hold:

- The product owner changes Option A to Option B (complementary non-destructive overlay) or Option C (A2a replaces S3H1a).
- A dedupe strategy against S3H1a's rendered `data-highlight-id` set is approved.
- A non-destructive rendering model is proven (CSS Custom Highlight API — verified supported in the Tauri WebKit build; else a separate positioned overlay layer).
- A real-boot smoke plan (Tauri/WebKit) for the rendering slice is reviewed.

See: `release-evidence/2026-07-01/reader-notes-a2a6-0-rendering-reconciliation.md` and `release-evidence/2026-07-01/reader-notes-a2a6-owner-decision-option-a.md`.

## Rollback / maintenance notes

- A2a modules are loaded inert and **default-off** unless explicitly enabled (flags `studio.readerNotes.{libraryItemView, annotationFacade, annotationHighlights, anchorResolver, highlightResolutionConsumer, highlightResolutionUi}.enabled`; the UI probe additionally requires an operator opt-in and public-release-off).
- No captured DOM mutation is authorized by A2a.
- No source mutation is authorized (A2a modules only call the public APIs of A1/resolver/consumer; they do not modify S3H1a, stores, `studio.js`, or captured content).
- Rollback of any A2a wiring is loader/pack-only (remove the `reader-notes/*.studio.js` entries from `studio.html` and both `pack-studio.mjs` lockstep lists); with all flags default-off, un-rollback state is already inert.
- Validators: `tools/validation/reader-notes/validate-reader-notes-mvp-a2a_5-…` is the canonical umbrella (re-runs the A1/A2a/A0 chain).

## Recommended next project lane

- Return to **Sync / Folder Sync** architecture work (the reopened folder-sync RC lane) or **Chat Saving** architecture — both are active, higher-priority lanes with open work.
- Or, if staying in Reader & Notes, pick a **non-visual A2a consumer** (e.g. a diagnostics/reconciliation/export consumer of the resolved rows) — consistent with Option A, as its own flag-gated, reviewed, read-only slice.

## Scope

- Closeout / status record only. No source, runtime, loader/pack, validator, store, overlay, or S3H1a files were modified.
