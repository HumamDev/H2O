# Studio Ribbon + Inline Editing — Milestone Closeout

Status: **Complete** · Working tree clean · Final regression green
(872/872 smoke assertions, 31/31 DOCX fixtures valid, 0 blockers)

This document summarizes the completed Studio Ribbon / Overlay / Export /
Inline-editing milestone. It is a closeout reference — the authoritative
behavioral contract remains
[`src-surfaces-base/studio/STUDIO_OVERLAY_CONTRACT.md`](../../../src-surfaces-base/studio/overlay/README.md)
and the per-phase sections therein.

---

## 1. Executive summary

Studio gained a full OneNote/Notion-style editing ribbon over captured
ChatGPT chats, built on a **non-destructive overlay** model: every edit is
an append-only operation against a per-snapshot `EditOverlay` record — the
captured snapshot (`snap.messages`) is **never mutated**. The reader
applies overlay ops at render time as decorative `data-overlay-*`
attributes and injected inline spans; undo/redo is a pure reducer-filter
over an active-op set; and three export paths (Copy/Markdown, DOCX,
PDF/Print) serialize the same overlay state.

The milestone spans the ribbon shell, metadata controls, the overlay
foundation + undo/redo, four export surfaces, message-level rich
formatting (Phases 4-1…4-4), and inline selected-text formatting with
export parity (Phases 5a…5d-A). All work is reader-side and
storage-additive: no snapshot mutation, no new storage keys beyond the
single overlay key, and no contentEditable.

---

## 2. Feature matrix

| Area | Capability | State |
|------|-----------|-------|
| Ribbon shell | Passive tabbed ribbon, chat-type gating, collapse | ✅ Shipped |
| Metadata | Category / Folder controls + system status (read paths) | ✅ Shipped (mutation surfaced where public APIs exist) |
| Overlay foundation | Append-only ops, `baseDigest` drift detection, render pass | ✅ Shipped |
| Undo / Redo | Reducer-filter active-set model (append-only ops + `undoStack`) | ✅ Shipped |
| Copy clean transcript | Overlay-aware Markdown-flavored transcript to clipboard | ✅ Shipped |
| Markdown export | `.md` file via overlay serializer + header block | ✅ Shipped |
| PDF / Print | `window.print()` over live reader DOM + `@media print` | ✅ Shipped |
| DOCX export | In-house OOXML writer (stored-mode ZIP, CRC32) | ✅ Shipped |
| Message-level: character | Bold / Italic / Underline / Strikethrough / Clear | ✅ Shipped (4-1) |
| Message-level: text color | Red/Green/Blue/Orange/Gray + None | ✅ Shipped (4-2) |
| Highlight | Ribbon **bridge** to existing `H2O.IHighlighter` (no parallel store) | ✅ Shipped (4-2) |
| Message-level: paragraph | Bullet / Numbered / Align / Indent / Outdent | ✅ Shipped (4-3) |
| Visual annotations | To Do / Important / Question / Definition / Warning / Idea | ✅ Shipped (4-4) |
| Inline selection anchors | Passive capture/resolve (textQuote → textPos → xpath) | ✅ Shipped (5a) |
| Inline: Bold / Italic | Selected-range, reader render | ✅ Shipped (5b-1) |
| Inline: Underline / Strike / Clear | Selected-range + range-scoped clear | ✅ Shipped (5c-1) |
| Inline: Text color | Cut-then-paint segment model (last-wins) | ✅ Shipped (5c-2) |
| Inline export parity | Markdown / DOCX / PDF-Print | ✅ Shipped (5d-1/5d-2/5d-A) |
| AI Tools | Summarize / Extract tasks / Tags / Rewrite / Study notes | ⏸ Placeholder (UI present, provider unavailable) |

---

## 3. Phase timeline

| Phase | Theme | Notes |
|-------|-------|-------|
| 1 | Ribbon shell + metadata | Passive shell, chat-type gating, metadata actions |
| 2a–2e | Overlay foundation | Edit-overlay keys/applier/store, message + structure passes, undo/redo, copy clean transcript |
| 3a | Markdown export | Overlay-aware serializer + header + `platform.files.exportBlob` |
| 3b | PDF / Print | `window.print()` over live DOM + print CSS |
| 3c-A / 3c-B | DOCX | Pure OOXML writer foundation, then ribbon export wiring (binary-safe Tauri write) |
| 4-1 | Message-level character formatting | B/I/U/S + Clear |
| 4-2 | Text color + highlight | New `text-color` op; highlight **bridge** to existing system |
| 4-3 | Paragraph controls | Bullet/Numbered/Align/Indent/Outdent |
| 4-4 | Visual annotations | Six OneNote-style tags (NOT Library metadata tags) |
| 5a | Inline selection anchors | Passive, three-tier anchor strategy |
| 5b-1 | Inline Bold / Italic | `inline-format` op + interval reducer + render pass |
| 5c-1 | Inline Underline / Strikethrough / Clear | Range-scoped clear |
| 5c-2 | Inline Text color | Cut-then-paint segments |
| 5d-1 / 5d-2 / 5d-A | Inline export | Markdown/Copy → DOCX → PDF/Print |

---

## 4. Export support matrix

| Inline / message style | Reader | Markdown / Copy | DOCX | PDF / Print |
|------------------------|--------|-----------------|------|-------------|
| Bold | ✅ | ✅ `**…**` | ✅ `<w:b/>` | ✅ |
| Italic | ✅ | ✅ `*…*` | ✅ `<w:i/>` | ✅ |
| Underline | ✅ | ✅ `<u>…</u>` | ✅ `<w:u w:val="single"/>` | ✅ |
| Strikethrough | ✅ | ✅ `~~…~~` | ✅ `<w:strike/>` | ✅ |
| Text color | ✅ | ⚠ **lossy by design** (no portable MD) | ✅ `<w:color w:val="HEX"/>` | ✅ (`print-color-adjust: exact`) |
| Headings / Quote / Code / Callout | ✅ | ✅ | ✅ | ✅ |
| Lists / Align / Indent | ✅ | lists ✅, align/indent lossy in MD | ✅ (`pStyle`/`jc`/`ind`) | ✅ |
| Visual annotations | ✅ | ✅ `[tags: …]` prefix | ✅ leading colored run | ✅ |

Shared engine: `H2O.Studio.overlay.buildInlineRuns` segments message-level
+ inline state into flat per-run style tuples, reused by both the Markdown
serializer and the DOCX writer. Hex palette is pinned across DOCX +
screen + print so colors render identically.

---

## 5. Safety invariants

These held across the full milestone and are covered by the regression
suite:

- **No snapshot mutation** — `snap.messages` is byte-identical before/after
  any edit, render, export, or undo/redo barrage.
- **Storage-additive only** — a single overlay key
  (`h2o:studio:edit-overlay:v1:`); no new storage keys introduced by any
  phase; no schema migrations.
- **No metadata/tag-store writes** — visual annotations are overlay-only;
  no `H2O.Studio.store.tags.*` / `H2O.Library.Tags.*` writes.
- **No duplicate highlight state** — the Highlight ribbon group bridges the
  existing `H2O.IHighlighter` engine via its public APIs; no parallel
  highlight store or key.
- **No forbidden APIs in feature code** — overlay modules are pure
  (no `chrome.*` / `localStorage` / `sessionStorage` / `indexedDB` /
  `fetch`); all I/O routes through the platform façade.
- **No contentEditable** — inline editing uses passive selection anchors +
  render-time span injection, never editable DOM.
- **Idempotent render** — the inline render pass unwraps prior spans then
  re-wraps from overlay state, converging regardless of prior renders.
- **Degrade-safe** — drift (`baseDigest` mismatch) no-ops the applier;
  unresolved inline anchors are skipped and counted, never corrupting
  output.

---

## 6. Known limitations

- **Markdown text color is lossy** (intentional — no portable Markdown
  syntax; DOCX + PDF/Print preserve it).
- **Screen list rendering** shows one marker per message (whole body = one
  `list-item`); Markdown/DOCX exports split per line. Multi-item-per-message
  lists would need contentEditable / per-line structure.
- **Inline export reconciliation** maps rendered-flattened-text offsets onto
  the trimmed export body; rich-turn renders or transformed bodies degrade
  to message-level output rather than risk corruption.
- **AI Tools** are UI placeholders (provider unavailable); no inference is
  wired.
- **Visual annotations** are render-time decorations only — they do not feed
  Library search / metadata / folder indexes (by design).
- **PDF/Print cancellation** can't be detected — `window.print()` returns
  after the dialog opens, not after a file is saved.

---

## 7. Validation summary

- **Syntax**: `node --check` on all 12 touched JS files — clean.
- **Smoke suites**: 19 phase suites (Phase 2d…5d-2) — **856 assertions, 0
  failures**; cleanup-group stubs B + C — **16 assertions, 0 failures**.
  Total **872/872**.
- **DOCX**: **31/31** generated fixtures pass `zipfile.testzip()` (CRC) +
  `document.xml`/`styles.xml` XML parse + 5-required-entry check.
- **Live browser** (Chrome dev server): inline render, capture/resolve,
  overlap, idempotent re-render, drift skip, and `@media print` CSSOM
  parse — verified with zero console errors.
- **Safety greps**: clean for forbidden APIs, snap mutation, tag-store
  writes, and parallel highlight state.

---

## 8. Key commits

Foundation + exports:

| Commit | Summary |
|--------|---------|
| `883684a` | passive Studio Ribbon shell |
| `578a6ae` | wire ribbon metadata actions |
| `ee34b97` | ribbon message formatting overlays |
| `638c6f7` | ribbon undo/redo via overlay active set |
| `ff2354e` | copy clean transcript renders overlay |
| `5d9eaaa` | Markdown export via overlay-aware ribbon |
| `bd05b91` | PDF and print view via `window.print()` |
| `58df142` | DOCX writer foundation |
| `85723ff` | DOCX export ribbon wiring (binary-safe Tauri write) |
| `50cd9a9` | Appearance view options panel |

Message-level rich formatting (Phase 4):

| Commit | Summary |
|--------|---------|
| `295cfe1` | message-level character formatting (B/I/U/S/Clear) |
| `3229440` | text-color + highlight ribbon controls |
| `f02a446` | message-level paragraph controls |
| `e82594f` | OneNote-style visual annotations |

Inline editing + export parity (Phase 5):

| Commit | Summary |
|--------|---------|
| `9d9466e` | passive inline selection anchors |
| `e962710` | reader-only inline bold / italic |
| `0f36fbf` | inline underline / strikethrough / clear |
| `1e5c340` | inline text color |
| `fc4ca07` | export inline formatting to Markdown |
| `7b9f478` | export inline formatting to DOCX |
| `c3dcc50` | preserve inline formatting in print |

Post-milestone cleanup groups:

| Commit | Summary |
|--------|---------|
| `ad0c635` | rehome appearance trigger into desktop titlebar |
| `d5f8fc4` | MV3 sendMessage timeout |
| `2aef7f9` | Chrome Studio launcher + bridge resilience |
| `eb88fac` | capture evidence bridge proof doc |

---

## 9. Recommended next phases

- **Inline font family / size** — needs the inline-selection foundation
  (already in place) plus new run properties; a natural Phase 5e.
- **Format painter / clipboard of formatted spans** — copy a run's style
  tuple onto another selection.
- **Subscript / superscript** — inline-only run styles.
- **Non-lossy Markdown color** (opt-in `<span style="color:…">` behind a
  flag) — currently intentionally omitted.
- **Multi-item lists on screen** — would require contentEditable or
  per-line structural state.
- **AI Tools activation** — wire the placeholder Summarize / Extract /
  Rewrite actions to a real provider.
- **Inline-tag → Library metadata bridge** — if desired, expose a separate
  ribbon action that maps visual annotations to Library tags via public
  APIs (must not collapse the two storage layers).
