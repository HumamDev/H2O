# Studio Edit Overlay

Phase 2a is a passive foundation for non-destructive Studio reader overlays.

The overlay system exists so future ribbon/formatting actions can store render-time operations without changing saved snapshot content. This phase does not add visible UI and does not apply any transformations.

## Files

- `overlay-keys.js` publishes frozen `H2O.Studio.OverlayKeys`, `OverlayEvents`, `OverlayOpTypes`, and `OverlayTargets`.
- `overlay-applier.studio.js` publishes `H2O.Studio.overlay` with `computeBaseDigest`, `createEmpty`, `applyOverlay`, and `selfCheck`.
- `../store/editOverlay.js` publishes `H2O.Studio.store.editOverlay` for per-snapshot overlay records.

## Phase 2a behavior

- No visible UI is added.
- `applyOverlay` is a no-op unless future phases add operation dispatch.
- The reader hook may call `applyOverlay`, but reader output remains unchanged.
- Saved snapshots and `snap.messages` are never mutated.
- Overlay records are Studio-local under `h2o:studio:edit-overlay:v1:`.
- Digest drift causes the applier to skip safely and report a benign outcome.

Future phases may add real operations, ribbon actions, and review UI while preserving the no-snapshot-mutation invariant in `STUDIO_OVERLAY_CONTRACT.md`.

## Phase 2d — undo / redo

Undo / redo is now wired via the **reducer-filter active-set model**: `overlay.ops` stays append-only, `overlay.undoStack` is the ordered active op-id set, and renderers iterate `overlay.ops` in original order while skipping ids that are not in the active set. See the "Phase 2d — undo / redo model" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full model including the required legacy-migration rule (`undoStack` missing → all-active; `undoStack` present and empty → none-active).

## Phase 2e — overlay-aware Copy clean transcript

`overlay-serializer.studio.js` (new) turns a snapshot + overlay into a Markdown-flavoured transcript matching what the user sees in the reader. Pure: no DOM, no storage, no I/O. Reuses the Phase 2d-aware reducers, so it inherits the active-set filter automatically. The ribbon's "Copy clean transcript" action now calls the async `H2O.Studio.RibbonBridge.getCleanTranscript({ includeOverlay })` and writes the result to the clipboard. See the "Phase 2e — overlay-aware Copy clean transcript" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full serializer mappings, the bridge return shape, and the drift-fallback behaviour.

## Phase 3a — Markdown export

`H2O.Studio.RibbonBridge.exportMarkdown()` composes the Phase 2e serializer output + a small header block (title, date, optional source URL, chat ID) and writes the result to a `.md` file via `H2O.Studio.platform.files.exportBlob`. MV3 uses Blob + `<a download>`; Tauri tries `plugin:dialog|save` + `plugin:fs|write_text_file` and falls back to the Blob+anchor path when those plugins aren't allow-listed (no new Rust deps or capability changes were added). The ribbon's `Export → Markdown` button invokes the bridge; drift fallback flows through with the status hint. See the "Phase 3a — Markdown export" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full filename format, header layout, bridge return shape, and status canon.

## Phase 3b — PDF / print via window.print()

`H2O.Studio.RibbonBridge.openPrintView()` injects a temporary `<header data-print-header>` (title, captured date, optional source URL, chat ID) before `.cgFrame`, swaps `document.title` for a useful PDF filename, calls `window.print()`, and unwinds in `try/finally`. The browser's print dialog offers "Save as PDF" as a destination on every modern OS (MV3 Chromium, Tauri webview, Firefox, Safari). The new `@media print` block in `studio.css` hides Studio chrome, forces a light/readable theme, keeps every Phase 2 overlay decoration visible, un-hides collapsed-section turns (with the collapsed marker still in the section header), and adds page-break hints. The ribbon's `Export → PDF` and `Export → Print view` both call the same bridge method, distinguished only by status strings. No JS PDF library, no Tauri plugin, no platform.files change. Cannot detect cancellation — `ok:true` means the dialog opened, not that a file was saved. See the "Phase 3b — PDF / print via window.print()" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full bridge return shape, header layout, collapsed-section semantics, and status canon.

## Phase 3c-A — DOCX writer foundation (no ribbon yet)

`H2O.Studio.overlayDocxWriter.build({ snap, overlay, headerMeta, opts })` is the pure in-house DOCX writer for Phase 3c. It emits a minimal valid OOXML/WordprocessingML `.docx` ZIP container with 5 entries (`[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/_rels/document.xml.rels`, `word/styles.xml`) in stored mode (no compression, no deflate code, no vendor library). The writer reuses the same Phase 2d-aware reducers as the Phase 2e Markdown serializer, so it inherits the active-set filter automatically. Op → DOCX mappings cover H1/H2/H3 headings, quote, code (Consolas runs), callout (`IntenseQuote` + `[!kind]` bold prefix), clean-spacing, sections, page dividers, collapsed-section markers, and optional TOC. ISO/IEC 3309 CRC32 self-checks at boot via `selfCheck().crc32Probe`. Phase 3c-A is the writer **foundation only** — no `RibbonBridge.exportDocx`, no ribbon handler, no platform-adapter changes; Phase 3c-B composes the writer with `platform.files.exportBlob` and wires the `Export → DOCX` ribbon action. See the "Phase 3c-A — DOCX writer foundation" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full writer API, DOCX entry layout, op→DOCX mapping table, ZIP encoding details, XML safety rules, and the scope split between 3c-A and 3c-B.
