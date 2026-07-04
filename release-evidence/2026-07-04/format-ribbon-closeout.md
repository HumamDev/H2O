# Format Ribbon Closeout

Status: **CLOSED**
Date: 2026-07-04
Owner surface: `src-surfaces-base/studio` — Studio Format Ribbon (Studio Ribbon shell + `studio.js` RibbonBridge)

## Scope

The Format Ribbon milestone covers the OneNote-style Format tab of the Studio Ribbon shell, built incrementally across Phases 7b–8g:

- **Edit Mode** — in-place message editing with `text-replace` overlay replacement.
- **Clipboard** — Copy message action; rich HTML copy (`ClipboardItem`) with Markdown fallback (`getTurnClean` / `getTurnHtml`).
- **Font Family / Font Size** — dropdown split buttons over curated typeface/size tokens.
- **Subscript / Superscript** — inline (per-range) formatting with mutual exclusion, screen + Markdown/DOCX export.
- **Text Color / Highlight** split tools — dropdown split buttons; Highlight bridges the existing `H2O.IHighlighter` engine (no parallel store).
- **Paragraph tools** — heading, quote, code, callout, list, alignment split button, indent/outdent, clean spacing.
- **Format Painter** — the final and most complex piece of the milestone:
  - message-level one-shot painting
  - inline (per-range) one-shot painting
  - sticky mode (double-click lock, repeated target painting)
  - one-step (grouped) undo/redo for multi-op paints

## Commit list

### Pre-8g Format Ribbon build-up (Phase 7b–8f)

| Phase | Commit | Subject |
|---|---|---|
| 7a | `d438561d` | feat(studio): add Format-tab Edit Mode toggle and premium shadow |
| 7b | `0587d7a6` | feat(studio): add in-place text editor with overlay replacement |
| 8-series (icon pass) | `87fb475c` | feat(studio): iconify wired Format Ribbon actions |
| 8c | `2cd352ca` | feat(studio): add Text Color split button |
| 8c-2 | `b74a9192` | feat(studio): add Highlight split button |
| 8c-3 | `6c488542` | feat(studio): add Alignment split button |
| 8c-4 | `576bd8b7` | feat(studio): render Text Color None swatch in popover |
| 8d-1 | `195a2922` | feat(studio): add Font Family dropdown and font-family overlay op |
| 8d-2 | `7ac858e4` | feat(studio): add Font Size dropdown and font-size overlay op |
| 8e-1 | `6fe8b7b9` | feat(studio): add Subscript/Superscript inline formatting |
| 8e-2 | `24e5fcc3` | feat(studio): export Subscript/Superscript inline formatting |
| 8f-1 | `fd74db02` | feat(studio): add Copy message action to Format clipboard group |
| 8f-2a | `f5c148a4` | feat(studio): add turn-scoped HTML serialization bridge |
| 8f-2b | `ca4fdd6f` | feat(studio): copy message as rich HTML with Markdown fallback |

Phase-letter/number labels above follow the phase tags recorded directly in the corresponding source comments where confirmed (7a/7b, 8c-2/8c-3/8c-4, 8d-1/8d-2, 8e-1/8e-2, 8f-1/8f-2a/8f-2b); the icon pass and base Text Color split button are listed by commit subject without an asserted sub-letter, as that mapping was not independently confirmed in this audit. All 14 commits confirmed ancestors of current HEAD.

### 8g Format Painter (this milestone's final phase)

- `33965a96` — feat(studio): add message-level Format Painter
- `bb44df3c` — fix(studio): reject invalid Format Painter target turns
- `06aa6674` — feat(studio): add inline Format Painter
- `8c1cfde8` — feat(studio): add sticky Format Painter mode
- `7ec68032` — feat(studio): group Format Painter undo steps

All 5 commits confirmed ancestors of current HEAD, touching only `studio.js` and/or `S0Y1a. 🎬 Studio Ribbon - Studio.js`.

## Final audit result

**PASS.** No bugs found.

- All `node --check` parse checks passed (studio.js, S0Y1a, overlay-applier, overlay-serializer, overlay-docx-writer, overlay-keys, editOverlay).
- `git diff --check` clean across the full 8g commit range and the pre-8g build-up commits touched by this review.
- Shared index clean; no stale reversion entries for any Ribbon/overlay file.
- Headless sims: **172/173**, reconstructed against current HEAD content:
  - 8e-1 (subscript/superscript reducer): 20/20
  - 8e-2 (Markdown + DOCX export): 12/12
  - 8f-1 (getTurnClean + copy-message): 17/18
  - 8f-2b (rich copy + fallback): 20/20
  - 8g-1 (message-level Format Painter): 25/25
  - 8g-2a (inline Format Painter): 20/20
  - 8g-3a (sticky Format Painter): 27/27
  - 8g-3b (grouped undo/redo): 31/31
  - The single 8f-1 mismatch is a confirmed stale-harness artifact: that sim predates rich HTML copy (8f-2a/8f-2b) and never mocks `window.ClipboardItem` / `navigator.clipboard.write`, so the current (correct) handler falls back to Markdown and reports "Copied as Markdown" instead of the pre-rich-copy "Copied" the old assertion expects. The underlying write still succeeded, and 8f-2b's sim independently covers and passes the identical scenario.
- Runtime smoke was **not run**: no `.claude/launch.json` configuration targets the Tauri Studio surface (only Vite site + Expo mobile configs exist), and building the real desktop surface requires the production chrome-live build pipeline, which would touch `build-tools/prepare-dist.mjs` — currently part of a concurrent agent's active WIP on the shared worktree. Static + sim coverage was relied on instead.

## Deferred items

- **Highlight capture/apply** — deferred to the S3H1a-owned lane. Highlights are not overlay state (separate `store.highlights` schema, `H2O.IHighlighter` engine, no undo model); Format Painter deliberately does not touch them.
- **Cursor/hover polish** (optional UX refinement for Format Painter — armed-state cursor hint, target hover indication) — not implemented; optional, low priority.
- **Runtime smoke** — deferred until the Tauri Studio launch/build path can be exercised without touching the concurrent agent's in-flight WIP on the shared worktree (notably `build-tools/prepare-dist.mjs`).

## Final decision

**The full Format Ribbon operation can be considered closed.**
