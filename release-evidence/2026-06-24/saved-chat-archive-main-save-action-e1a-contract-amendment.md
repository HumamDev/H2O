# Save-to-Folder Archive Companion — E.1.0a Contract Amendment (Trigger)

Date: 2026-06-24

Status: E.1.0a CONTRACT AMENDMENT - NOT IMPLEMENTED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/contract-only amendment. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes. It supersedes the **trigger** and
**hook-location** parts of the E.1.0 contract and leaves the rest in force.

Predecessors:

```text
5be1e0d docs(studio): plan main saved chat archive action            (E.0)
c8237d35 docs(studio): define saved chat archive save action contract (E.1.0)
```

## Why This Amendment Exists

E.1.0 assumed E.1.1 would hook "after a successful Chrome Studio Save-to-Folder
action" in `S0F0j. 🎬 Library Actions Core - Studio.js`. Code inspection during
E.1.1 prep falsified two of that contract's premises:

1. **`S0F0j` is byte-locked.** Its header requires the IIFE body to remain
   "byte-identical to the shared canonical file and `src-runtime-base/0F0j…`."
   It is a pure plan-builder (`buildSaveToFolderPlan` ->
   `status: 'save-to-folder-plan-ready'`), not an execution surface. It must not
   be edited.

2. **Chrome Studio Save-to-Folder never succeeds — by design.** The facade
   `saveToFolder()` in `S0F1j. 🎬 Library Actions - Studio.js` always returns
   `status: 'native-context-required'`, `ok: false` on MV3/web (its capability
   map literally lists `saveToFolder: 'native-context-required'`). The actual
   save/capture happens on chatgpt.com (Native UI). A "success hook" in Chrome
   Studio would be dead code.

Real saves reach Chrome Studio asynchronously: the Native UI broadcasts a
cross-surface change, `S0F1h` dispatches `evt:h2o:library:cross-surface-sync`,
`S0F1c` refreshes the index and dispatches `evt:h2o:library-index:updated`, and
`H2O.LibraryIndex.getAll()` then reflects the newly-saved row. This matches the
project model that Studio renders its own copy and Save-to-Folder is a native
capture source, not a Studio action.

## Superseded Sections Of E.1.0

This amendment replaces E.1.0 **§3 (Trigger Point)**, the trigger-related parts
of **§4 (Gating Predicate)**, and **§10 (hook in `S0F0j`)**. The following E.1.0
sections remain unchanged and authoritative:

- **§2 Feature flag** — `archive.deliverOnSaveToFolder`, default OFF, via
  `H2O.flags.get("archive.deliverOnSaveToFolder", false)`.
- **§5 Request construction** — same `builderOptions` shape and the same
  forbidden-fields list.
- **§6 Status UX**, **§7 UI placement**, **§8 Boundaries** — unchanged.

## Corrected Trigger (Replaces E.1.0 §3 / §10)

- The companion is **not** a call inserted into a save action and **not** a hook
  in `S0F0j` or `S0F1j` (both are left untouched).
- Instead, a new Chrome-only module self-registers a **flag-gated, debounced,
  event-driven** listener on `evt:h2o:library-index:updated` (and tolerates
  `evt:h2o:library:cross-surface-sync` as a coalesced equivalent).
- The `…:updated` event detail carries only `{ reason, rows(count), dataHash, … }`
  — **not** the changed rows — so on fire the listener reads
  `H2O.LibraryIndex.getAll()` and selects candidate rows itself.
- This is event-driven, not a watcher or poller: no `setInterval`, no
  `MutationObserver`, no background loop. The listener only reacts to an event
  the index already emits, debounced to collapse bursts.

## Candidate Selection And Dedupe (Replaces E.1.0 §4 trigger parts)

On a (flag-ON, folder-connected) event, deliver at most one request per
newly-saved, snapshot-backed row that has not already been delivered:

- Select rows that are **saved** (`isSaved` / `displayView === 'saved'` /
  `badgeKind === 'Saved'`) and **snapshot-backed** (a derivable `snapshotId` /
  `lastSnapshotId` / `latestSnapshotId`). Exclude link-only / Add-to-Library
  rows and archived rows.
- Derive `studioChatId` from `chatId` / `id` / `conversationId` and `snapshotId`
  from the row's snapshot fields. Never invent a `snapshotId`.
- **Persistent Chrome-side dedupe:** maintain an "already-delivered" set in
  `chrome.storage.local` keyed by `chatId|snapshotId` (or the request
  `dedupeKey`). Skip any row already in the set. This prevents re-delivery across
  the frequent index-update bursts and across reloads. (Desktop also dedupes by
  `dedupeKey`; the Chrome set is the first line of defense against spam.)
- If a row is saved but has **no** `snapshotId`: skip with reason
  `missing-snapshot-id` and do **not** mark it delivered, so a later event that
  carries the snapshot can deliver it. Do not create a Desktop snapshot from
  Chrome.
- Best-effort and isolated: any delivery error is swallowed; it never blocks,
  delays, or alters index rendering.
- Optional safety cap: deliver at most N newly-saved rows per event (e.g. a small
  bound) to avoid a burst on first-ever enable; remaining rows deliver on
  subsequent events.

## Helper Shape (Unchanged Intent)

The new module still exposes the deliver-one-row helper named in E.1.0:

```text
H2O.Studio.ingestion.maybeDeliverSavedChatArchiveOnSaveToFolderV1(context)
```

The listener calls it once per selected, not-yet-delivered row. `context` carries
the row-derived `{ studioChatId, snapshotId, href, title, nativeConversationId,
messageCount, target hints }`. The helper performs the flag/surface/folder gate,
builds `builderOptions` per E.1.0 §5, calls
`deliverSavedChatArchiveRequestV1({ confirmDelivery: true, builderOptions })`,
records the dedupe key on success, and returns a product-language status. It calls
no enqueue/materialize/package/CAS/store APIs and includes no transcript/content.

## UI Placement (Unchanged From E.1.0 §7)

- No app-wide floating buttons / overlays.
- Quiet inline product status only (the cross-surface refresh already re-renders
  rows; any status surfacing must be low-risk and product-language).
- Raw ids / Connect folder / Send test / Check receipt stay in
  Settings -> Diagnostics -> Archive Request Delivery.

## Boundaries (Unchanged From E.1.0 §8)

Chrome intent-only; Desktop authoritative; no enqueue/materialize/package/CAS/
SQLite/contentHash; no auto-materialization; no sync/WebDAV/cloud; no native
messaging; no localhost; no import/recovery; no Archive Health mutation; no
user-folder export/save-dialog. Add: no polling/watcher/background loop — the
trigger is a debounced reaction to an existing event.

## Revised Implementation Slices

- **E.1.0 / E.1.0a (done / this note):** contract + trigger amendment.
- **E.1.1 (revised):** new Chrome-only module
  `src-surfaces-base/studio/ingestion/saved-chat-archive-on-save.mv3.js` that
  (a) exposes `maybeDeliverSavedChatArchiveOnSaveToFolderV1(context)` and
  (b) self-registers the flag-gated, debounced `library-index:updated` listener
  with persistent dedupe — deliver-only, default OFF, never blocking. Loader in
  `studio.html` + `pack-studio.mjs` (hunk-staged). **No edit to `S0F0j` or
  `S0F1j`.**
- **E.1.2:** focused validator.
- **E.1.3:** manual runtime smoke (enable flag, observe one request per newly
  saved snapshot-backed row, no re-delivery on refresh).
- **E.1.4:** evidence / closure.

## Files Likely Touched Later (Not In E.1.0a)

- `src-surfaces-base/studio/ingestion/saved-chat-archive-on-save.mv3.js` (new).
- `tools/validation/studio/validate-saved-chat-archive-on-save-v1.mjs` (new).
- `src-surfaces-base/studio/studio.html` and
  `tools/product/studio/pack-studio.mjs` (loader/ship, hunk-staged).
- Feature-flag registration for `archive.deliverOnSaveToFolder` if required.

## Files That Must Not Be Touched

- `S0F0j. 🎬 Library Actions Core - Studio.js` (byte-locked canonical mirror).
- `S0F1j. 🎬 Library Actions - Studio.js` (save facade; unsupported in Chrome).
- Desktop runtime, Tauri capabilities, request inbox scanner, queue, materializer,
  package writer/projector, asset CAS, store adapters, Archive Health UI, sync
  files, Chrome service-worker, import/recovery, WebDAV/cloud, user-folder
  export/save-dialog, and the shipped delivery module + its Diagnostics UI.

## Validation

```text
git diff --check
git diff --cached --check
```

Results:

- `git diff --check`: clean.
- `git diff --cached --check`: clean.

No docs/markdown lint/check script exists in `package.json` (confirmed); none was
run.

## Outcome

E.1.0a is CONTRACT AMENDMENT - NOT IMPLEMENTED. The Save-to-Folder archive
companion's trigger is retargeted from the (byte-locked, never-succeeding) Chrome
Save-to-Folder action to a flag-gated, debounced reaction to the existing
`library-index:updated` / `cross-surface-sync` signal, selecting newly-saved
snapshot-backed rows from `H2O.LibraryIndex.getAll()` with persistent once-per-row
dedupe — deliver-only, default OFF, Chrome intent-only, Desktop authoritative,
with `S0F0j` and `S0F1j` left untouched.

Recommended next implementation step: E.1.1 (revised) — the new
`saved-chat-archive-on-save.mv3.js` module with the flag-gated, debounced,
deduped `library-index:updated` listener, deliver-only, default OFF.

Do not implement yet.
