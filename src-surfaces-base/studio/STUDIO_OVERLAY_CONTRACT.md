# Studio Edit Overlay Contract

Status: Active (Phase 2a)
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

Each operation in `overlay.ops[]` captures both its forward effect and
its `inverse` payload. Undo applies the inverse; redo re-applies the
forward effect. No op ever loses information needed to fully reverse
itself.

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
