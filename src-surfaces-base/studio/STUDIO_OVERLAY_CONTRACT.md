# Studio Edit Overlay Contract

Status: Active (Phase 2e)
Audience: Anyone implementing or reviewing edit-overlay code in
`src-surfaces-base/studio/overlay/` or `src-surfaces-base/studio/store/editOverlay.js`.
Companion: `STUDIO_STORAGE_CONTRACT.md`, `STUDIO_DEVELOPMENT_RULES.md`,
`STUDIO_PORTABILITY_CONTRACT.md`.

## Purpose

The Studio Ribbon's Phase 2 format and structure actions (heading, quote,
code block, callout, clean spacing, sections, dividers, TOC) need a place
to live. They cannot be embedded in `snap.messages[].text` because they
are *markup* transformations, not text-content edits. They also cannot
mutate the captured snapshot because saved snapshots must remain
re-exportable and bit-identical to what was captured.

This contract defines the **non-destructive overlay model** that holds
those operations.

## Hard invariants (Phase 2 and forever)

These rules are immutable for the lifetime of the overlay subsystem.
Violating any of them is a P0 bug regardless of which phase the code is
written in.

### Invariant 1 — Never mutate the original saved snapshot

The overlay applier, the overlay store, and any feature code that
interacts with overlays MUST NOT write to:

- `state.currentReaderSnapshot.messages` (in-memory)
- the captured snapshot file on disk (via `callArchive("captureSnapshot")`
  or any other channel)
- `snap.meta` fields that describe the captured turns

The overlay is applied as a render-time transformation pass over a
**read-only** view of the snapshot. If a feature genuinely needs to
change the captured text, it belongs in the legacy per-turn text-edit
flow (`persistEditToExtensionSnapshot`), not in the overlay subsystem.

### Invariant 2 — Overlays are additive, not destructive

`overlay.ops[]` is append-only history. Operations are never deleted,
even on undo. Each forward operation captures its full payload (and may
optionally carry an `inverse` payload as forward-compat metadata, used
by debugging tools but no longer required for undo correctness — see
"Phase 2d — undo / redo model" below).

Undo / redo work via the **reducer-filter active-set model** described
below: undo moves an op id from `undoStack` to `redoStack`; the reducer
simply stops applying that op. No information is lost.

### Invariant 3 — `turnIdx` is stable only within one saved snapshot

`turnIdx` (1-based ordinal across all turns) is the canonical anchor
because it is present on every turn regardless of `messageId` /
`turnId` presence. Operations target turns via `turnIdx` and treat
`messageId` / `turnId` as **best-effort hints** for cross-snapshot
rebase later (Phase 2e+). A `turnIdx` value from one snapshot must
NEVER be reused as a stable anchor across re-captures of the same chat.

### Invariant 4 — `baseDigest` is required and used for drift detection

Every `EditOverlay` record carries a `baseDigest` string computed via
`H2O.Studio.overlay.computeBaseDigest(snapshot.messages)`. At apply
time, the applier MUST recompute the digest from the current snapshot
and MUST refuse to apply when the digests differ. Drift detection is
the only safety mechanism against silently misaligning markup with the
wrong turns after a re-capture.

### Invariant 5 — Overlay rendering must no-op on drift

When drift is detected, `applyOverlay` returns
`{ applied: false, driftDetected: true, mutated: false, ... }` and the
reader renders exactly as it would without any overlay. A future phase
will add a rebase or invalidate UI; Phase 2a only emits
`evt:h2o:studio:overlay:drift-detected` and bails.

### Invariant 6 — Overlay ops are message-level only in Phase 2

Phase 2 op targets are limited to:

- `message` — a single turn identified by `turnIdx` (+ optional `messageId`)
- `section` — an overlay-minted span of turns
- `between-turns` — an insertion point between two turns
- `snapshot` — the entire snapshot (TOC position only)

**Selection-level editing (operating on a text range inside a message)
is explicitly out of scope for Phase 2** and is deferred to a later
phase. The Phase 2 ribbon defaults to message-level selection (clicking
a message in the reader selects it for the next action).

### Invariant 7 — Storage stays Studio-local

Overlay records live under the `h2o:studio:edit-overlay:` key prefix
exclusively. The prefs store's `isStudioKey` check enforces this. The
overlay subsystem MUST NOT write to:

- native engine keys (`h2o:prm:cgx:*`)
- session storage
- IndexedDB directly
- `chrome.*` APIs
- `localStorage` directly
- the file system via any path other than `H2O.Studio.platform.files` (deferred)

All writes route through `H2O.Studio.platform.storage`.

### Invariant 8 — Schema is versioned and migrations are explicit

Every record carries `schemaVersion: number`. The current version is
**1** (Phase 2a). A version bump requires:

1. A migration function that converts v(N-1) → v(N).
2. Documentation in this contract describing what changed.
3. A regression smoke confirming v(N-1) records round-trip cleanly after migration.

Phase 2a freezes v1 as: `{ id, schemaVersion, snapshotId, chatId,
baseDigest, createdAt, updatedAt, ops, undoStack, redoStack }`.

### Invariant 9 — No feature code touches `chrome.*`, `localStorage`, `indexedDB`, or `fetch`

The same rules as `STUDIO_DEVELOPMENT_RULES.md` apply to overlay code.
Feature files outside `studio/platform/` MUST go through
`H2O.Studio.platform.*` and `H2O.Studio.store.*`.

### Invariant 10 — Never throws

Both `applyOverlay` and the store's public methods catch all internal
errors and either return a benign outcome record (applier) or reject
the returned Promise with a real error (store). Synchronous throws from
feature code are forbidden — they would crash the reader render path.

## Allowed patterns (Phase 2a)

Overlay code may freely use:

- DOM read APIs on `studio.html`'s own document (`document.querySelector`,
  `getElementById`, etc.) — but **never** write to elements that belong
  to `snap.messages` content. The applier is allowed to insert *new*
  wrappers/elements, never modify existing ones.
- `H2O.events.emit` for `evt:h2o:studio:overlay:*` notifications.
- `H2O.Studio.platform.storage.{get,set,remove}` via the editOverlay store.
- `H2O.Studio.store.editOverlay.*`.
- `H2O.Studio.OverlayKeys` / `OverlayEvents` / `OverlayOpTypes` / `OverlayTargets`
  constants.
- Plain JS data manipulation, `Object.assign`, `Array.isArray`,
  `JSON.stringify`/`parse`, `Date.now`, `Promise`.

## Forbidden patterns

Forbidden anywhere in `studio/overlay/` and `studio/store/editOverlay.js`:

- `chrome.*`
- `localStorage`, `sessionStorage`, `indexedDB`, `idb-keyval`, `idb`
- Direct mutation of `snap.messages` or any array reachable from it.
- Direct mutation of DOM elements that belong to captured turn content.
- `MutationObserver` against non-`studio.html` documents.
- New global notification or toast surfaces.
- Imports from `src-surfaces-base/desk/` or content-script modules.
- Storage keys outside the `h2o:studio:` prefix.

## Phase 2a scope (what is and is not built)

### Is built

- `H2O.Studio.OverlayKeys`, `OverlayEvents`, `OverlayOpTypes`,
  `OverlayTargets` (frozen constants)
- `H2O.Studio.overlay.applyOverlay` (passive no-op + drift check)
- `H2O.Studio.overlay.computeBaseDigest`
- `H2O.Studio.overlay.createEmpty`
- `H2O.Studio.overlay.selfCheck`
- `H2O.Studio.store.editOverlay` (get/upsert/remove/list/subscribe/selfCheck)
- `H2O.Studio.RibbonBridge.getOverlay(snapshotId)` accessor
- One call from `studio.js`'s `buildReaderDOM` tail into the no-op applier
- Documentation (this file + `overlay/README.md`)

### Is NOT built

- Any operation that writes to DOM under input (the applier is a no-op
  in Phase 2a)
- Any ribbon action wiring beyond the existing Phase 1 actions
- Undo / redo handlers
- Copy / export integration with overlay
- Section grouping CSS
- Cross-context sync
- Rebase UI for drift

## Phase 2d — undo / redo model

Status: **Built**. Implemented across `overlay-applier.studio.js` (pure
helpers + reducer changes), `studio.js` (`RibbonBridge.undo/redo/getHistoryState`),
`ribbon/ribbon-shell.studio.js` (`undoCount`/`redoCount` context fields),
and `S0Y1a. 🎬 Studio Ribbon - Studio.js` (Home → Undo / Redo).

### The reducer-filter active-set model

1. **`overlay.ops` is append-only.** Forward operations are pushed onto
   `ops` by `appendOp` and never removed. Re-running `appendOp` for a
   later forward op grows `ops` monotonically.
2. **`overlay.undoStack` is the ordered active op-id set.** It contains
   the ids of ops that are currently visible. `appendOp` pushes the new
   op's id onto `undoStack` (and clears `redoStack`); `popUndo` pops the
   top id and pushes it onto `redoStack`; `popRedo` does the reverse.
3. **`overlay.redoStack` holds undone op ids.** Each id still references
   an op present in `overlay.ops`, so redo is a pure stack manipulation
   followed by a re-render — no replay, no inverse.
4. **Reducers iterate `overlay.ops` in original order**, but skip any op
   whose id is NOT in the active set. This preserves the "last op of a
   given (type, target) wins" semantics that existed before Phase 2d.

The active set is computed by `getActiveOpIdSet(overlay)`. Renderers
short-circuit ops outside the set via `isOpActive(active, op.id)` in
both `computeMessageState` and `computeStructureState`.

### Required migration rule (active-set legacy behaviour)

Existing overlays persisted before Phase 2d may have `undoStack` either
absent or shaped differently. The renderer MUST honour exactly this
rule:

- **`undoStack` is missing OR is not an array** → treat **all ops as
  active**. This is the legacy migration sentinel and preserves visual
  continuity for any persisted overlay from Phase 2a/2b/2c.
- **`undoStack` exists as an array** → respect it **exactly**, even when
  empty. An empty `undoStack` means "undo everything" — the user
  legitimately undid every op — and the renderer MUST display no ops in
  that case. Do NOT treat empty as all-active when `redoStack` exists.

`getActiveOpIdSet` returns `null` for the legacy all-active case and a
`{ [opId]: true }` lookup object for the explicit case. `isOpActive`
treats a `null` active set as "everything matches".

### Bridge API

`H2O.Studio.RibbonBridge` (declared in `studio.js`) exposes:

| Method | Returns | Behaviour |
|---|---|---|
| `undo()` | `Promise<{ ok, reason?, overlay?, outcome?, undoCount?, redoCount?, label? }>` | Pops `undoStack` top onto `redoStack`, persists, re-renders, republishes counts. Refuses safely on drift / no-undo / no-overlay / no-snapshot. |
| `redo()` | same shape | Mirror of undo: pops `redoStack` top, pushes onto `undoStack`. |
| `getHistoryState()` | `Promise<{ undoCount, redoCount, lastUndoLabel?, lastRedoLabel? }>` | Pure-read accessor. Empty stacks → `0` / `0` with no label fields. |

All three never throw. Drift detection uses the same `computeBaseDigest`
check as `applyOverlayOp`; on drift the stacks are not mutated.

### Ribbon context fields

`H2O.Studio.ribbon`'s context gains `undoCount: number` and `redoCount:
number`. Both are coerced to non-negative integers (Number.NaN /
negative / undefined → `0`). They are republished by `studio.js` after:

- initial overlay load in `buildReaderDOM`
- `RibbonBridge.applyOverlayOp` (forward ops)
- `RibbonBridge.undo`
- `RibbonBridge.redo`

The shell's `setContext` includes both fields in its equality short-
circuit so paints only fire on real changes.

### Compliance notes for Phase 2d

- `overlay.ops` MUST NOT be mutated by undo or redo.
- Renderers MUST use `getActiveOpIdSet` + `isOpActive` (or equivalent
  filter) — they MUST NOT iterate `overlay.undoStack` to compute state,
  because doing so would lose the ops original ordering needed for
  last-wins semantics.
- Drift behaviour during undo / redo MUST match `applyOverlayOp` — same
  digest check, same refusal shape, same `evt:h2o:studio:overlay:drift-
  detected` semantics for downstream consumers.
- Status feedback strings exposed at the Home tab MUST exactly match:
  `"Undoing…"`, `"Undone: <label>"`, `"Nothing to undo"`, `"Redoing…"`,
  `"Redone: <label>"`, `"Nothing to redo"`,
  `"Snapshot has changed — overlay disabled until rebase"`.

### Out of scope for Phase 2d

- Keyboard shortcuts (Cmd-Z / Cmd-Shift-Z) — deferred to a future
  phase; would require touching the Studio keyboard router.
- Op coalescing / time-window batching — each ribbon click remains one
  undo step in V1.
- History compaction (dropping ops referenced by neither stack) —
  deferred; `overlay.ops` may grow unboundedly within a single editing
  session and that is accepted for V1.

## Phase 2e — overlay-aware Copy clean transcript

Status: **Built**. Implemented across
`overlay/overlay-serializer.studio.js` (new pure serializer module),
`studio.js` (`RibbonBridge.getCleanTranscript` evolved to async
object-returning shape), `studio.html` (one new script tag), and
`S0Y1a. 🎬 Studio Ribbon - Studio.js` (`copy-clean-transcript` handler
awaits the new shape).

### The serializer

`H2O.Studio.overlaySerializer.serialize(snap, overlay, opts)` is a pure
function: no DOM access, no storage access, no I/O. It produces a
Markdown-flavoured transcript using the existing Phase 2d-aware
reducers (`computeMessageState` + `computeStructureState`), so it
automatically honours `undoStack` membership. It never mutates `snap`
or `overlay`.

Options:

- `includeOverlay` (default `true`) — when `false`, returns text
  byte-identical to Phase 1b's raw format
  (`User:\n<text>\n\nA:\n<text>\n\nSystem:\n<text>`).
- `includeToc` (default `false`) — when `true` and at least one
  section exists, emits `## Contents\n- <title>\n...` at the top.
- `collapsedMode` (default `'include-marked'`) — controls collapsed-
  section output:
  - `'include-marked'`: include turns, append `[collapsed — N turns]`
    suffix to the section header.
  - `'include-silent'`: include turns, no marker.
  - `'omit'`: skip turns of collapsed sections, append
    `[collapsed — N turns hidden]` to the header.

Return shape: `{ text, opsApplied, structureApplied, tocIncluded,
collapsedSections, reason? }`. `opsApplied` counts per-message ops
that produced visible output; `structureApplied` is `true` when any
section header / page divider / TOC was emitted.

### Output mappings (Markdown-flavoured)

| Op | Output |
|---|---|
| `heading` H1 | `# <Role>:\n<body>` |
| `heading` H2 | `## <Role>:\n<body>` |
| `heading` H3 | `### <Role>:\n<body>` |
| `quote` | `<Role>:\n> <body line 1>\n> <body line 2>` (role outside quote, body lines prefixed) |
| `code` / `code-block` | `<Role>:\n` ` ```\n<body>\n``` ` (role outside fence) |
| `callout` (info/note/warning/tip) | `> [!info]\n> <Role>:\n> <body>` (role + body inside callout) |
| `clean-spacing` | text pass on body: 3+ consecutive `\n` collapse to 2 |
| `add-section` / `split-section` | `## <Section title>` inserted between turns |
| `page-divider` | `---` inserted between turns |
| `collapse-section` (default `include-marked`) | section header gets ` [collapsed — N turns]` suffix; turns still emitted |
| `toc` | omitted unless `includeToc: true` — then `## Contents\n- <title>\n...` at top |

Op stacking on a single message (outer → inner):
`callout > heading > code > quote > clean-spacing`. When both `code`
and `quote` are active on the same turn, `code` wins (more specific).
Inside a callout, the heading still decorates the role line that lives
inside the callout body.

### Bridge shape

`H2O.Studio.RibbonBridge.getCleanTranscript(opts?)` — async, returns
`Promise<{ text, overlayIncluded, overlaySkipped, reason? }>`:

| Field | Type | Meaning |
|---|---|---|
| `text` | string | The transcript. `''` on missing snapshot / empty messages. |
| `overlayIncluded` | boolean | True iff overlay decorations actually landed in the output (`opsApplied > 0 \|\| structureApplied \|\| tocIncluded`). |
| `overlaySkipped` | boolean | True iff `includeOverlay` was requested but the overlay path was bypassed for a safe fallback reason. |
| `reason` | string? | When `overlaySkipped`, one of: `'drift-detected'`, `'serializer-unavailable'`, `'store-unavailable'`, `'reducer-unavailable'`, `'serializer-error'`. |

Cases:

- Missing snapshot / empty `messages` → `{ text: '', overlayIncluded:
  false, overlaySkipped: false }`.
- `includeOverlay: false` → raw text, `overlayIncluded: false`,
  `overlaySkipped: false`.
- `includeOverlay: true` and no overlay record exists → raw text,
  `overlayIncluded: false`, `overlaySkipped: false` (nothing to skip).
- `includeOverlay: true`, overlay present, drift detected → raw text,
  `overlayIncluded: false`, `overlaySkipped: true`,
  `reason: 'drift-detected'`. The drift check uses the same
  `computeBaseDigest` precedent as `applyOverlayOp` / `undo` / `redo`.
- `includeOverlay: true`, overlay present, no drift → overlay-aware
  text, `overlayIncluded` reflects whether any decoration landed.

The bridge **never throws** — every internal branch catches; on
unreachable failures it resolves with the empty floor shape.

### Ribbon status feedback (Export → Copy → Copy clean transcript)

- `"Copying transcript…"` — pending.
- `"Transcript copied"` — success (overlay applied OR no overlay needed).
- `"Transcript copied (overlay skipped — snapshot changed)"` — drift
  fallback. Text on the clipboard is raw.
- `"No transcript content"` — empty snapshot.
- `"Transcript bridge unavailable"` — bridge method missing.
- `"Copy failed: <msg>"` — clipboard write failed.

### Compliance notes for Phase 2e

- The serializer MUST NOT touch `snap.messages` or any overlay field.
- The serializer MUST NOT read or write any storage; the bridge is
  responsible for fetching the overlay record.
- The serializer MUST NOT access the DOM.
- `includeOverlay: false` output MUST remain byte-identical to Phase
  1b's raw format (regression guard for any external consumer that
  pinned to that shape).
- The bridge MUST NOT throw under any input; on drift or any safe
  fallback it MUST return well-formed `{ text, overlayIncluded:false,
  overlaySkipped:true, reason }`.
- Status string `"Transcript copied (overlay skipped — snapshot changed)"`
  is the canonical surface for drift; do not paraphrase.

### Out of scope for Phase 2e

- Markdown file export (download as `.md`).
- PDF / DOCX export.
- AI-tools integration with the serializer output.
- "Copy raw" as a separate ribbon button — the option exists on the
  serializer + bridge as `{ includeOverlay: false }`; the catalogue
  slot can be added later without a contract change.
- "Copy visible only" as a separate ribbon button — the option exists
  on the serializer as `{ collapsedMode: 'omit' }`; no UI in V1.

## Compliance checklist (per-PR; Phase 2a and beyond)

- [ ] No `chrome.*` reference in the diff outside `studio/platform/`.
- [ ] No `localStorage`/`sessionStorage`/`indexedDB`/`idb` reference outside `studio/platform/`.
- [ ] No mutation of `snap.messages` or `state.currentReaderSnapshot.messages` in overlay code.
- [ ] No mutation of captured DOM elements in the applier.
- [ ] Every storage key starts with `h2o:studio:`.
- [ ] Every overlay record passed to `upsert` has `baseDigest` set.
- [ ] `applyOverlay` returns within ≤1 ms on null/empty/drift inputs.
- [ ] `applyOverlay` does not throw — all branches catch.
- [ ] `schemaVersion` matches the current version.

## Cross-document map

- `STUDIO_STORAGE_CONTRACT.md` — overall persistence façade rules; the
  `editOverlay` entity slot is listed there for completeness.
- `STUDIO_DEVELOPMENT_RULES.md` — Studio-wide development rules
  (chrome.*/localStorage/etc bans). Overlay inherits all of those.
- `STUDIO_PORTABILITY_CONTRACT.md` — Tauri-readiness rules. Overlay is
  Tauri-ready: all I/O routes through `platform.storage`.
- `overlay/README.md` — Phase 2a scope and load order.
