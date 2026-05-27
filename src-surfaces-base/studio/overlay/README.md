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

## Phase 3c-B — DOCX export bridge + ribbon wiring

`H2O.Studio.RibbonBridge.exportDocx()` composes the Phase 3c-A pure writer with the Phase 3a `platform.files.exportBlob` save path. The ribbon's `Export → DOCX` button invokes the bridge; drift fallback flows through with the status hint (mirrors Phase 3a Markdown / Phase 3b PDF). Tauri now detects non-text MIMEs and routes through `plugin:fs|write_file` (binary) instead of `plugin:fs|write_text_file` (which would corrupt ZIP bytes); if `write_file` isn't allow-listed in capabilities, the existing fallback chain catches the rejection and uses the Chromium-style Blob+anchor download — **no new Tauri capability, no new Rust dependency, no new plugin install**. Text MIMEs (Markdown export) still use `write_text_file` byte-for-byte as before. See the "Phase 3c-B — DOCX export bridge + ribbon wiring" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full bridge return shape, Tauri binary-safe write path, status canon, and compliance rules.

## Phase 4-1 — Message-level character formatting

First Phase 4 slice: OneNote-style **Bold / Italic / Underline / Strikethrough / Clear formatting** on the selected message. All five live in a new `Format → Font` ribbon group; all five operate on the entire selected turn (no inline text-range selection). Five new op types (`bold`, `italic`, `underline`, `strikethrough`, `clear-formatting`) extend the Phase 2b reducer with four new boolean fields and a reset marker. The four toggles wrap the body innermost — Markdown (`**bold**`, `*italic*`, `<u>underline</u>`, `~~strike~~`), DOCX (`<w:b/>`, `<w:i/>`, `<w:u w:val="single"/>`, `<w:strike/>` inside `<w:rPr>`), and screen + print CSS (`font-weight: 700` / `font-style: italic` / `text-decoration-line`). `clear-formatting` resets ALL per-message decorations (Phase 2b + Phase 4-1) for the selected turn at its position in op order; subsequent ops apply normally. Composes with the Phase 2d reducer-filter undo/redo for free — undoing a clear-formatting op restores prior decorations automatically. See the "Phase 4-1 — Message-level character formatting" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full op model, reducer behavior, op stacking, export mappings, ribbon enable rule, status canon, and explicit scope split between Phase 4-1 and the deferred inline-selection slice.

## Phase 4-2 — Text Color + Highlight integration

Second Phase 4 slice. Dual-path architecture: **text color** is a new overlay op (`text-color`), **highlight** is a Ribbon control surface for the existing `H2O.IHighlighter` + `H2O.Studio.store.highlights` system (no parallel state). The Format tab gains two new groups: `Text Color` (Red/Green/Blue/Orange/Gray + None) and `Highlight` (8 brush swatches + Clear on selected message + Show/Hide toggle). Text color extends the Phase 4-1 reducer with one new field (`textColor: { kind } | null`); exports to DOCX (`<w:color w:val="HEX"/>`) and screen+print CSS; Markdown is intentionally lossy (color isn't portable). Highlight buttons call the existing public APIs only (`H2O.IHighlighter.setCurrentColor`, `setEnabled`, `getEnabled` + `H2O.Studio.store.highlights.removeForAnswer`) — **no new storage key, no new schema, no duplicate overlay op**. The existing storage key `h2o:prm:cgx:nlnhghlghtr:state:inline_highlights:v3` (schemaVersion 3) is untouched. See the "Phase 4-2 — Text Color + Highlight integration" section in `../STUDIO_OVERLAY_CONTRACT.md` for the full op model, palette + hex map, status canon, the highlight bridge compliance rules, and the explicit scope split between this slice and the deferred Phase 4 features.
