# Reader & Notes A2a.6.0 Rendering Reconciliation (read-only investigation)

Date: 2026-07-01

Baseline commit:

```txt
ad92b1d test(reader-notes): close A2a.5b real-boot reader-root probe gate
```

## Verdict

**A2a.6 visible highlight rendering is BLOCKED pending an S3H1a / A2a ownership decision.**

The saved reader already has an active, incumbent Studio highlight renderer — `S3H1a. 🎬 Highlights Engine - Studio.js` — which wraps captured answer text in `<mark data-highlight-id>` keyed by the **same** `hl_*` highlight ids (from the same `H2O.Studio.store.highlights`) that the A2a resolver resolves. Therefore any A2a-owned visible rendering would duplicate/conflict with S3H1a on the same highlights. This is an investigation gate: no rendering is authorized until an owner decides A2a.6's relationship to S3H1a.

## S3H1a facts (with file evidence)

File: `src-surfaces-base/studio/S3H1a. 🎬 Highlights Engine - Studio.js`

- Identity / purpose (line 2, 9): `@h2o-id s3h1a.highlights.engine.studio`; `@description` = "Inline highlights (XPath + TextPosition + TextQuote) with configurable apply/remove shortcuts, popup trigger, editable palette, robust persistence, MiniMap sync, and Control Hub integration."
- **Active by default:** `const STATE = (MOD.state ||= { installed: false, enabled: true, booted: false })` (line 38); boots via `CORE_boot` (line 2913) → `log('booted')` (line 3055), `CORE_boot()` invoked (line 3079). It is Studio-integrated (`const STUDIO_SEL = W.H2O.Studio.SELECTORS`, line 99).
- **Loaded by loader + pack (active in the Studio surface):**
  - `src-surfaces-base/studio/studio.html:1722` — `<script src="./S3H1a. 🎬 Highlights Engine - Studio.js"></script>`
  - `tools/product/studio/pack-studio.mjs:1127` and `:1523` (both lockstep lists).
- **Renders `<mark>` by wrapping captured text (mutates reader DOM):**
  - `HL_markFactory` (line 1162) → `document.createElement('mark')` (line 1163).
  - `HL_wrapRange` (line 1254) uses `HL_splitText` / `Text.splitText` (lines 1063, 1275, 1277, 1302-1303) to split captured text nodes and insert the `<mark>` around the selected span; `HL_unwrapById` (line 1331) removes them.
- **Mark ownership attributes:** `data-highlight-id` (`ATTR_HL_ID`, line 106; set line 1170), `data-cgxui-owner` (line 1168), `data-answer-id` (line 1171), `data-highlight-color` (line 1172), class `CSS_CLS_HL`.
- **Range usage:** `range.getClientRects()` (line 1094) (positioning / MiniMap).
- **Persistence / store dependency:** `W.H2O.Studio.store.highlights.getAll() / update() / saveNow()` (lines 720-722); see `store/highlights.js` (line 718).
- **Highlight id model:** `const hlId = existingId || 'hl_' + Math.random().toString(36).slice(2, 9)` (line 1258); `data-highlight-id` is set to that id (line 1170).

**Conclusion:** S3H1a is confirmed as the active incumbent visible highlight renderer for the saved reader, and it mutates captured turn DOM by wrapping text in `<mark>`.

## A2a boundary facts

- A2a modules render nothing and use none of S3H1a's markers. The A2a.5 validator asserts the probe module source contains **no** `'mark'` (createElement), **no** `data-overlay-inline`, and **no** `data-highlight-id` (`validate-reader-notes-mvp-a2a_5-reader-root-resolution-probe.mjs:409-411`), and that zero `createElement/appendChild/setAttribute/insertBefore` occur (line 407).
- A2a.5b observed `marksBefore: 2` and `marksAfter: 2` (`reader-notes-a2a5b-real-boot-reader-root-probe.md:77-78`): the probe did not add/remove marks.
- Those 2 pre-existing marks carry S3H1a ownership (`<mark>` + `data-highlight-id` + `data-cgxui-owner`), i.e. they are **S3H1a-owned, not A2a-owned**. The A2a lane has deliberately stayed read-only and clear of S3H1a's rendering surface across A2a.1–A2a.5b.

## Duplicate / overlap analysis

- A2a.5b resolved rows (from the committed evidence):
  - `hl_e9dhnqw` (answerId `3d1782a8-…`) — anchored, `textQuote-exact`.
  - `hl_psflftd` (answerId `addd91a0-…`) — anchored, `textQuote-exact`.
- A2a.5b unresolved (orphaned) rows:
  - `hl_sl6bxtr` (answerId `addd91a0-…`) — `resolver-orphaned` / `textPos quote mismatch`.
  - `hl_l3hh4k4` (answerId `82625f5d-…`) — `resolver-orphaned` / `textPos quote mismatch`.
- So the chat `69de12dc-…` has 4 attributed highlights in `store.highlights`; A2a resolved 2, orphaned 2.
- **Shared id space (confirmed):** S3H1a keys marks by `data-highlight-id = highlight.id`, ids of the form `hl_*` (S3H1a line 1258), read from `H2O.Studio.store.highlights` (line 720) — the **same store and same `hl_*` id space** the A2a facade/consumer use as `source.nativeId` (e.g. `hl_e9dhnqw`). Therefore A2a-resolved highlights and S3H1a-rendered marks are the **same objects by id**.
- **Overlap conclusion:** rendering A2a-resolved rows as visible highlights would **duplicate** the marks S3H1a already renders for the same `hl_*` ids. The *exact* per-id overlap of the currently-rendered set (which two ids S3H1a's 2 marks carry, and whether they equal `{hl_e9dhnqw, hl_psflftd}`) is **strongly inferred but runtime-confirmable** — the two engines anchor independently (S3H1a includes XPath, which A2a defers), so their rendered/resolved sets could differ. See the optional runtime snippet below to confirm exactly.

## CSS Custom Highlight API feasibility

- The CSS Custom Highlight API (`CSS.highlights` + `Highlight` + `::highlight()`) is the ideal non-destructive model (styles Ranges with zero DOM mutation, fully removable) and is supported in modern WebKit/Safari (~17.2+). The Tauri desktop uses the system WKWebView; the captured UA (`AppleWebKit/605.1.15`) is a frozen token and does not reveal the real engine version.
- **Status: NEEDS OPERATOR RUNTIME CHECK — not proven in this task.** Do not assume support. Confirm with the snippet below before any A2a.6.1 that depends on it.

## Ownership options

### Option A — S3H1a remains the sole visible highlight renderer; A2a stays read-only
- **Benefits:** zero duplication risk; no captured-DOM mutation from A2a; preserves the A2a lane's proven read-only/non-destructive discipline; smallest surface; A2a value (resolver/consumer/probe) still feeds non-visual consumers (diagnostics, export, notes) without competing with S3H1a.
- **Risks:** A2a never renders (by design); if S3H1a's anchoring is weaker in the saved reader, resolved-but-unrendered highlights aren't shown by A2a.
- **Required gates:** none beyond documenting that A2a does not render; no A2a.6.1.

### Option B — A2a adds a complementary, non-destructive overlay for a specific purpose only
- **Benefits:** could surface highlights S3H1a fails to render, or provide a distinct read-only view (e.g. a notes/inspection panel or a non-`<mark>` overlay), without touching S3H1a.
- **Risks:** two highlight visual systems risk user confusion; requires robust **dedupe against S3H1a's rendered `data-highlight-id` set** to avoid doubles; needs a concrete product purpose that S3H1a + MiniMap do not already serve; requires CSS Custom Highlight (or positioned overlay) support.
- **Required gates:** owner-defined purpose; non-destructive model proven (CSS Highlight support check); dedupe-against-S3H1a design; new flag + opt-in; validator + real-boot smoke proving no S3H1a-mark disturbance and no captured-DOM mutation.

### Option C — A2a eventually replaces S3H1a's reader rendering
- **Benefits:** single, cleaner, non-destructive rendering path for the saved reader (no `<mark>` wrapping of captured content).
- **Risks:** large, high-risk migration of an active, persistence-backed, palette/shortcut/MiniMap-integrated engine; must preserve S3H1a's apply/remove/persist/MiniMap features or explicitly scope them out; multi-slice; regressions to a shipping feature.
- **Required gates:** a dedicated migration program (well beyond a "first rendering slice"); parity analysis of S3H1a features; staged rollout behind flags; extensive real-boot evidence; explicit owner sign-off.

## Recommendation

- **A2a.6.1 rendering is BLOCKED pending an explicit owner decision** among Options A/B/C.
- **Default recommendation: Option A** (S3H1a remains the sole visible renderer; A2a stays read-only) unless the owner identifies a concrete need A2a rendering would serve that S3H1a does not — in which case **Option B** (narrow, non-destructive, deduped), never Option C without a dedicated migration program.
- **If (and only if) A2a-owned rendering is later authorized**, it must use a non-destructive model only:
  - CSS Custom Highlight API if the runtime check confirms support; else a separate positioned overlay layer.
  - **Never** `<mark>` wrapping; **never** `data-highlight-id` from A2a; **never** captured turn DOM mutation.
  - Render **resolved rows only**; unresolved/orphaned rows are **diagnostic only**.
  - **Dedupe against S3H1a** (skip highlights S3H1a already renders); clear/rollback removes **only** A2a-owned artifacts and never touches S3H1a marks.

## Non-authorization

This investigation authorizes **no** implementation. Specifically:

- No A2a.6 rendering is authorized.
- No automatic invocation is authorized.
- No XPath.
- No A2b.
- No sidecar, enrichment, renderer, native_note, imported_document, converted_note, or saved-chat work.

## Forbidden mutation statement

- A2a must not mutate captured turn DOM (`STUDIO_OVERLAY_CONTRACT.md` Invariant 1).
- A2a must not add `<mark data-highlight-id>` (that surface is owned by S3H1a).
- A2a must not remove or modify S3H1a marks.

## Future A2a.6.1 requirements (if later authorized)

- Render resolved rows only.
- Skip/orphan unresolved rows (diagnostic only, never placed).
- Dedupe against S3H1a's rendered `data-highlight-id` set.
- Clear-before-render (idempotent) with a generation token.
- Explicit `clear()` that removes only A2a-owned artifacts.
- Pre-existing S3H1a marks (`[data-highlight-id]` count) unchanged before/after render and clear.
- Body / captured text unchanged.
- No storage writes.
- Real-boot smoke required (Tauri/WebKit) before committing a rendering gate.

## Optional operator runtime confirmations (not required for this gate; do not fake)

Exact per-id overlap of S3H1a's currently-rendered marks vs A2a-resolved ids (run in Tauri DevTools with the same reader open):

```js
(() => {
  const marks = Array.from(document.querySelectorAll('mark[data-highlight-id]'))
    .map((m) => m.getAttribute('data-highlight-id'));
  const a2aResolved = ['hl_e9dhnqw', 'hl_psflftd'];
  const a2aOrphaned = ['hl_sl6bxtr', 'hl_l3hh4k4'];
  return {
    s3h1aRenderedIds: marks,
    overlapWithA2aResolved: a2aResolved.filter((id) => marks.includes(id)),
    overlapWithA2aOrphaned: a2aOrphaned.filter((id) => marks.includes(id)),
  };
})();
```

CSS Custom Highlight API support in this Tauri WebKit build:

```js
({ cssHighlights: !!(window.CSS && CSS.highlights), Highlight: typeof Highlight === 'function' });
```
