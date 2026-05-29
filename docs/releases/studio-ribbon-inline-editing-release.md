# Studio Ribbon + Inline Editing + Export — Release Candidate

Status: **Release-ready (RC)** · Working tree clean · Both packaged runtimes verified
Recommended tag: **`studio-ribbon-inline-editing-v1`**

This is a release-candidate summary for the completed Studio Ribbon / overlay /
export / inline-editing milestone. The authoritative behavioral contract remains
[`STUDIO_OVERLAY_CONTRACT.md`](../../src-surfaces-base/studio/STUDIO_OVERLAY_CONTRACT.md);
the milestone closeout reference is
[`studio-ribbon-inline-editing-milestone.md`](../systems/studio/studio-ribbon-inline-editing-milestone.md).

---

## 1. Release title

**Studio Ribbon + Inline Editing + Export — Milestone Release (v1)**

A OneNote/Notion-style editing ribbon over captured ChatGPT chats, built on a
non-destructive append-only overlay, with reader render + three export paths
(Copy/Markdown, DOCX, PDF/Print).

---

## 2. Scope summary

- **Reader-side and storage-additive only.** Every edit is an append-only op
  against a per-snapshot `EditOverlay`; the captured snapshot (`snap.messages`)
  is never mutated.
- **One storage key** (`h2o:studio:edit-overlay:v1:`); no schema migrations, no
  new keys beyond the single overlay key.
- **No contentEditable.** Inline editing uses passive selection anchors +
  render-time span injection.
- Spans the ribbon shell, metadata controls, overlay foundation + undo/redo,
  four export surfaces, message-level rich formatting (Phases 4-1…4-4), and
  inline selected-text formatting with export parity (Phases 5a…5d-A).

---

## 3. Major feature groups

| Group | Capability |
|-------|-----------|
| Ribbon shell | Passive tabbed ribbon, chat-type gating, collapse |
| Metadata | Category / Folder controls + system status (read paths) |
| Overlay foundation | Append-only ops, `baseDigest` drift detection, render pass |
| Undo / Redo | Reducer-filter active-set model (`ops` + `undoStack`) |
| Message-level: character | Bold / Italic / Underline / Strikethrough / Clear |
| Message-level: text color | Red/Green/Blue/Orange/Gray + None |
| Highlight | Ribbon **bridge** to existing `H2O.IHighlighter` (no parallel store) |
| Message-level: paragraph | Bullet / Numbered / Align / Indent / Outdent |
| Blocks | Quote / Code block / Callout |
| Visual annotations | To Do / Important / Question / Definition / Warning / Idea |
| Cleanup | Clean spacing |
| Inline selection | Passive capture/resolve (textQuote → textPos → xpath) |
| Inline formatting | Bold / Italic / Underline / Strikethrough / Clear / Text color |
| Export | Copy clean transcript, Markdown, DOCX, PDF/Print |
| AI Tools | Summarize / Extract / Tags / Rewrite / Study notes — **placeholder** (provider unavailable) |

Format ribbon groups (8): **Headings · Font · Text Color · Highlight ·
Paragraph · Blocks · Annotate · Cleanup** — all confirmed rendering in both
packaged runtimes.

---

## 4. Export support matrix

| Style | Reader | Markdown / Copy | DOCX | PDF / Print |
|-------|--------|-----------------|------|-------------|
| Bold | ✅ | `**…**` | `<w:b/>` | ✅ |
| Italic | ✅ | `*…*` | `<w:i/>` | ✅ |
| Underline | ✅ | `<u>…</u>` | `<w:u w:val="single"/>` | ✅ |
| Strikethrough | ✅ | `~~…~~` | `<w:strike/>` | ✅ |
| Text color | ✅ | ⚠ lossy by design | `<w:color w:val="HEX"/>` | ✅ (`print-color-adjust: exact`) |
| Headings / Quote / Code / Callout | ✅ | ✅ | ✅ | ✅ |
| Lists / Align / Indent | ✅ | lists ✅, align/indent lossy in MD | ✅ | ✅ |
| Visual annotations | ✅ | `[tags: …]` prefix | leading colored run | ✅ |

Shared engine: `H2O.Studio.overlay.buildInlineRuns` segments message-level +
inline state into flat per-run style tuples, reused by both the Markdown
serializer and the DOCX writer. The hex palette is pinned across DOCX + screen
+ print so colors render identically.

---

## 5. Runtime verification summary

| Surface | Method | Result |
|---------|--------|--------|
| Regression suite | 19 phase smokes + cleanup stubs | **872/872 assertions, 0 failures** |
| DOCX fixtures | `zipfile.testzip()` (CRC) + XML parse + required-entry check | **31/31 valid** |
| Chrome Studio | Live `chrome-extension://` page; DevTools globals probe | MV3 true; `overlaySerializer` / `overlayDocxWriter` / `inlineSelection` / `RibbonBridge` present; **8/8 Format groups**; Markdown/DOCX/PDF actions visible; **0 missing globals** |
| Desktop / Tauri | Live native app (`org.h2o.studio.desktop`) visual smoke | Studio shell + saved reader render; **8/8 Format groups**; Export actions (Markdown / PDF / DOCX / Print / Copy) present; no error banners |
| Packaged dist | Headless module smoke over Tauri `dist/overlay/*` | Both export globals register; DOCX builds with inline color marker `C53030`; Markdown emits inline `**…**`; snapshot byte-identical |

WKWebView has no CDP, so Desktop globals were verified indirectly (static dist
markers in the exact loaded files + headless functional smoke + the Chrome live
pass on the same `studio.js`).

---

## 6. Packaging fixes included

The build packs Studio via a curated allowlist in
`tools/product/studio/pack-studio.mjs` (two parallel arrays:
`ARCHIVE_WORKBENCH_SOURCE_FILES` / `ARCHIVE_WORKBENCH_OUT_FILES`). The
release-gate check found `studio.html` referenced modules that were never added
to the allowlist; these fixes close the gap:

| Commit | Fix |
|--------|-----|
| `f221990` | Pack overlay export modules (`overlay-serializer.studio.js`, `overlay-docx-writer.studio.js`) — Markdown/Copy + DOCX export now load at runtime |
| `d1e1e88` | Pack the 8 `dock/tabs/*.tab.studio.js` modules |

**Result:** the packaged `studio.html` script-ref sweep now reports **0 missing
local refs** across both Chrome prod and Desktop/Tauri dist.

---

## 7. Safety guarantees

- **No snapshot mutation** — `snap.messages` byte-identical before/after any
  edit, render, export, or undo/redo barrage.
- **Storage-additive only** — single overlay key; no new keys, no migrations.
- **No metadata/tag-store writes** — visual annotations are overlay-only.
- **No duplicate highlight state** — Highlight ribbon group bridges the existing
  `H2O.IHighlighter` via public APIs.
- **No forbidden APIs in feature code** — overlay modules are pure (no
  `chrome.*` / `localStorage` / `sessionStorage` / `indexedDB` / `fetch`); all
  I/O routes through the platform façade.
- **No contentEditable** — passive selection anchors + render-time spans.
- **Idempotent render** — inline render pass unwraps then re-wraps from overlay
  state, converging regardless of prior renders.
- **Degrade-safe** — `baseDigest` drift no-ops the applier; unresolved inline
  anchors are skipped and counted, never corrupting output.

---

## 8. Known limitations

- **Markdown text color is lossy** (intentional — no portable Markdown syntax;
  DOCX + PDF/Print preserve it).
- **Screen list rendering** shows one marker per message; Markdown/DOCX split
  per line. Multi-item-per-message lists would need per-line structure.
- **Inline export reconciliation** maps rendered-flattened offsets onto the
  trimmed export body; transformed/rich-turn bodies degrade to message-level
  output rather than risk corruption.
- **AI Tools** are UI placeholders (no inference wired).
- **Visual annotations** are render-time decorations only — they do not feed
  Library search / metadata / folder indexes (by design).
- **PDF/Print cancellation** can't be detected — `window.print()` returns after
  the dialog opens, not after a file is saved.

---

## 9. Recommended git tag name

**`studio-ribbon-inline-editing-v1`** (primary recommendation — matches the doc
+ release-file naming).

Alternative (shorter): `studio-ribbon-inline-v1`.

Suggested annotated-tag subject: `Studio Ribbon + inline editing + export v1`.
Suggested tag target: the milestone closeout + both packaging fixes are in
history (`110e4f7`, `f221990`, `d1e1e88`); tag the current release commit once
approved. **Tag creation is deferred until explicitly approved.**

---

## 10. Next recommended lanes

- **Inline font family / size** — builds on the inline-selection foundation;
  new run properties (natural Phase 5e).
- **Format painter** — copy a run's style tuple onto another selection.
- **Subscript / superscript** — inline-only run styles.
- **Non-lossy Markdown color** — opt-in `<span style="color:…">` behind a flag.
- **Multi-item lists on screen** — would require per-line structural state.
- **AI Tools activation** — wire the placeholder actions to a real provider.
- **Inline-tag → Library metadata bridge** — optional, via public APIs only
  (must not collapse the two storage layers).
- **Packaging guard** — add a `dev:check` rule that diffs `studio.html`
  `<script src>` refs against the pack allowlist, so future drift fails the
  release gate automatically (this milestone's two packaging gaps would have
  been caught pre-merge).
