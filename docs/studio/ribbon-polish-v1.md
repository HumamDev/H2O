# Studio Ribbon Polish v1

A short milestone snapshot of the Phase 6 Ribbon-only polish workstream and its known follow-ups.

## Scope

UI-only polish of the Studio Format ribbon. No changes to overlay/applier/serializer behavior, no changes to sync/convergence, no changes to the Tauri build pipeline. Three increments shipped to HEAD; this doc freezes a named summary of where things stand.

## Completed slices

- **6a — Ribbon overflow affordance** (`0e97da1`)
  Visible signal that the Format ribbon scrolls horizontally when its groups exceed the available window width.

- **6b — Compact ribbon spacing and rhythm** (`51b8cf5`)
  Tightened group separators, control padding, and vertical rhythm so more of the eight Format groups are reachable on a typical window width.

- **6c — Compact color and highlight swatches** (`209c5d7`)
  Color dots in the TEXT COLOR and HIGHLIGHT groups rendered as compact circular swatches. `None`, `Clear`, and `Hide` remain text pills — the swatch redesign is color-only.

## Runtime verification

Verified against the freshly-built official Desktop runtime promoted to `/Applications/H2O Studio.app` (binary `Contents/MacOS/h2o-studio-desktop`, mtime `2026-05-30 19:11:31`, size `7,680,560 B`, `CFBundleIdentifier=org.h2o.studio.desktop`, version `0.1.0`):

- One canonical H2O Studio window running from `/Applications/H2O Studio.app`; no debug or `target/release` binary in play.
- Ribbon visible; Format tab active.
- TEXT COLOR group renders compact color swatches; `None` remains a text pill.
- HIGHLIGHT group renders compact color swatches; `Clear` and `Hide` remain text pills.
- All 8 Format groups reachable via horizontal ribbon scroll: HEADINGS · FONT · TEXT COLOR · HIGHLIGHT · PARAGRAPH · BLOCKS · ANNOTATE · CLEANUP.
- Export tab present with COPY (`Copy clean transcript`), DOWNLOAD (`Markdown`, `PDF`, `DOCX`), PRINT (`Print view`).
- No error banners, badges, or red-state UI observed across Format and Export views.

## Source of truth

All ribbon source lives under `src-surfaces-base/studio/`. This is the canonical location. The Studio Desktop build pipeline (`npm run dev:all` then `npm run prepare-dist`, invoked automatically by `npm run tauri:dev` and `npm run tauri:build`) copies and filename-sanitizes these files into `apps/studio/desktop/dist/` before each build.

**Do not edit `apps/studio/desktop/dist/` directly.** Those files are overwritten on every `prepare-dist` run; any change made there will silently disappear at the next build. Same applies to anything under `apps/extensions/chatgpt/chrome/prod/` for the extension-side bundle.

## Known deferrals (out of scope for v1)

- **Active / current swatch state.** TEXT COLOR and HIGHLIGHT groups do not yet indicate which color is currently applied to the selection. The dots are visually stateless.
- **Full overflow menu behavior.** The `…` affordance at the top right of the ribbon area does not surface a classic overflow menu listing hidden groups. Discovery of hidden groups is via horizontal scroll only.
- **Deeper icon migration.** Group labels (HEADINGS, FONT, …) remain as text. No icon-only or icon-plus-text variant has been adopted.
- **Further visual polish.** Spacing, color values, and component sizes are at v1 baseline; finer tuning is deferred until real-user feedback identifies specific friction points.

## Recommended next polish slice

Either of the following extends Ribbon polish without disturbing v1:

1. **Active selected color / highlight state.** Mark the currently-applied dot in TEXT COLOR and HIGHLIGHT with a selected ring or outline so the user can see what is applied. Highest UX value of the known deferrals.
2. **Overflow menu improvement.** Repurpose or remove the `…` affordance; either make it a real group-jump menu or replace it with a clearer scroll-hint pattern (chevron buttons, edge fade, etc.).

Either is a small, scoped follow-up.

## Key commits

| SHA | Slice |
|---|---|
| `0e97da1` | 6a — ribbon overflow affordance |
| `51b8cf5` | 6b — compact ribbon spacing and rhythm |
| `209c5d7` | 6c — compact color and highlight swatches |
