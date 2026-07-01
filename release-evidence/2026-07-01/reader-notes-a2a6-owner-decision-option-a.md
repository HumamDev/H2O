# Reader & Notes A2a.6 Rendering Ownership — Owner Decision: Option A

Date: 2026-07-01

Baseline commit:

```txt
d400e50 docs(reader-notes): add A2a.6.0 rendering reconciliation
```

Supersedes the open question in: `release-evidence/2026-07-01/reader-notes-a2a6-0-rendering-reconciliation.md`.

## Decision

**Option A is selected.** S3H1a remains the sole visible highlight renderer for the saved reader. The A2a lane remains read-only and non-rendering.

## What Option A means

- **S3H1a (`S3H1a. 🎬 Highlights Engine - Studio.js`) remains the sole visible highlight renderer.** It continues to own `<mark data-highlight-id>` rendering in the saved reader from `H2O.Studio.store.highlights`.
- **A2a remains read-only / non-rendering**, covering:
  - anchor resolver core (A2a.1)
  - DOM resolver / wrapper (A2a.2a)
  - annotation facade consumer (A1 façade usage)
  - highlight-resolution consumer (A2a.4.2)
  - reader-root probe (A2a.5)
  - diagnostics
  - future non-visual consumers
- **A2a must not render visible highlights.**
- **A2a must not add marks.**
- **A2a must not add overlays.**
- **A2a must not mutate captured turn DOM.**
- **A2a.6.1 visible rendering remains blocked** unless a future owner decision changes this.

## Explicit authorization scope

- A2a.6.1 visible rendering is **not authorized**.
- No automatic A2a rendering is **authorized**.
- No XPath, A2b, or downstream work (sidecar, enrichment, renderer, native_note, imported_document, converted_note, saved-chat) is **authorized** by this decision.

## Rationale

- S3H1a already renders visible highlights from the same `H2O.Studio.store.highlights`.
- S3H1a keys marks by the same `hl_*` highlight id space that A2a resolves (`source.nativeId`), so the two systems address the same highlight objects by id.
- A2a visible rendering would therefore risk duplicate marks unless dedupe/ownership were re-designed.
- The A2a read-only chain (resolver → DOM resolver → consumer → probe, proven end-to-end through the A2a.5b real-boot smoke) is already valuable and complete on its own.
- Preserving a single visible-rendering owner (S3H1a) reduces risk (no duplicate marks, no captured-DOM mutation from A2a, no two competing highlight visualizations).

## Allowed future A2a work (read-only, non-rendering)

- Diagnostics.
- Non-visual consumers.
- Export / reporting support.
- Reconciliation / audit tools.
- Resolver hardening.

These remain subject to the A2a lane's existing invariants (read-only, no DOM mutation, no storage/sidecar writes, flag-gated, fail-closed) and their own reviewed slices.

## Forbidden until a future owner decision

- A2a visible rendering.
- A2a marks / overlays.
- Captured turn DOM mutation by A2a.
- Removing or modifying S3H1a marks.
- Replacing S3H1a.

## Reopening criteria

This decision may be revisited only if all of the following are satisfied:

- The product owner explicitly changes the decision to Option B (complementary non-destructive overlay) or Option C (A2a replaces S3H1a).
- A dedupe strategy against S3H1a's rendered highlights (`data-highlight-id` set) is approved.
- A non-destructive rendering model (e.g. CSS Custom Highlight API, verified supported in the Tauri WebKit build; else a separate positioned overlay layer) is proven.
- A real-boot smoke plan (Tauri/WebKit) for the rendering slice is reviewed.

## Scope

- Decision/evidence record only. No source, runtime, loader/pack, validator, store, overlay, or S3H1a files were modified by this decision.
