# Inline Archive Delivery Status Surface — E.2.0 Contract

Date: 2026-06-24

Status: E.2.0 CONTRACT - NOT IMPLEMENTED

Lane: Chat Saving Architecture (Phase E — product integration). This is a
docs/contract-only note. It adds no runtime code, no validators, and no
Chrome/Desktop/capability changes.

Predecessor:

```text
99edac6 docs(studio): close archive delivery listener milestone   (E.1 closed)
```

## Investigation Summary

- **Row rendering host.** `renderRow(row, …)` lives in `src-surfaces-base/studio/studio.js`
  (around line 5530) and builds a `wbBadges` container of `wbBadge` spans
  (`Archived`, source, tags). `studio.js` is **not** a byte-locked mirror (plain
  versioned userscript, no "byte-identical" header), so it is an editable host —
  but it is a large monolith with pre-existing dirty hunks, so any future edit
  must be a one-line delegation that is carefully hunk-staged.
- **The byte-locked monoliths stay out.** `S0F0j` (Library Actions Core) and
  `S0F1j` (Library Actions facade) remain untouched; the investigation did not
  find a safe non-locked extension point inside them, so the host is `studio.js`
  `renderRow`, not `S0F1j`.
- **Reusable delivery APIs (all on `H2O.Studio.ingestion`):**
  `diagnoseSavedChatArchiveRequestDeliveryV1`, `deliverSavedChatArchiveRequestV1`,
  `readSavedChatArchiveRequestReceiptV1`, `refreshSavedChatArchiveRequestStatusV1`
  (alias of read-back).
- **On-save listener.** `saved-chat-archive-on-save.mv3.js` exposes
  `maybeDeliverSavedChatArchiveOnSaveToFolderV1` and
  `diagnoseSavedChatArchiveOnSaveToFolderV1`, and persists a dedupe set at
  `chrome.storage.local['h2o:studio:archive-on-save:delivered:v1']` keyed by
  `chatId|snapshotId`. **Two gaps for status:** (a) the persisted entry value is a
  timestamp, not the `requestId`, so per-row receipt read-back has no requestId
  to query; (b) the eligibility predicate (saved-wins-over-linked) is
  module-private. E.2.1 must close both (read-only) — see below.

## 1. Status Surface Location

- **Preferred host:** an inline, row-level status indicator rendered inside the
  existing `wbBadges` area of `studio.js` `renderRow()` (a new
  `wbBadge--archive-status` span), with all logic in a new focused module so the
  `studio.js` change is a single delegation call (mirrors the D.3C.2 pattern:
  thin monolith hook + focused module).
- **Fallback host:** if touching `renderRow` is deemed unsafe at implementation
  time, surface per-chat status inside the existing
  Settings -> Diagnostics -> Archive Request Delivery card (a per-chat lookup),
  and/or a quiet status line in the saved-chat reader. Either fallback stays
  inside a feature/Settings surface.
- **Explicitly forbidden:** no app-wide floating button and no app-wide overlay.

## 2. Product-Language States

| State | Meaning / trigger |
|---|---|
| Archive off | flag `archive.deliverOnSaveToFolder` OFF (`diagnose…OnSaveToFolderV1().enabled === false`) |
| Folder not connected | delivery diagnostics `folderConnected === false` |
| Ready | eligible saved snapshot-backed row, flag ON, folder connected, not yet delivered |
| Archive requested | row present in the local delivered map, no Desktop verdict yet |
| Waiting for Desktop | receipt read-back `delivered-awaiting-desktop` |
| Needs Desktop snapshot | receipt `needs-desktop-snapshot`, or row has no derivable snapshotId |
| Archived | receipt `queued-on-desktop` / `validated` |
| Already archived | receipt `already-queued-duplicate` |
| Failed | receipt `rejected-by-desktop`, delivery error, or `inbox-write-failed` |
| Unknown / check status | no local/receipt data yet, or receipt malformed/unreadable |

All copy is product language; no proof/debug labels, no raw `requestId` /
`dedupeKey` in the inline surface.

## 3. Data Sources

- the local dedupe map keyed by `chatId|snapshotId` (from the on-save module).
- `requestId` per row, **once E.2.1 persists it** in the delivered entry.
- the receipt read-back API (`readSavedChatArchiveRequestReceiptV1({ requestId })`).
- delivery diagnostics (`diagnoseSavedChatArchiveRequestDeliveryV1`) for
  folder/permission/flag context.
- library row fields only: `chatId`, `snapshotId` (+ `lastSnapshotId` /
  `latestSnapshotId`), `title`, `isSaved`, `isLinked`, `displayView`, `badgeKind`.
- **Never** transcript / messages / html / assets / `contentHash` / package body.

## 4. Refresh Behavior

- no polling, no watcher, no background daemon, no `MutationObserver`
  delivery/status loop.
- the inline state is derived **passively** from already-available local data at
  render time (flag + folder diagnostics + local delivered map).
- receipt read-back happens only on an **explicit user "Check archive status"
  gesture**, or as a single **bounded** refresh immediately after a known archive
  action for that row. No automatic recurring refresh.
- all status read-back is read-only; it never writes receipts or any Desktop
  state.

## 5. User Actions

- show status only (passive indicator).
- optional per-row "Check archive status" action (gesture -> read-back).
- optional "Connect archive folder" handoff that routes to the existing
  Settings -> Diagnostics -> Archive Request Delivery flow (no new connect
  logic, no new folder picker).
- no materialize / package / SQLite / CAS actions from Chrome.

## 6. Boundaries

- Chrome remains intent-only; Desktop remains authoritative.
- no Chrome `enqueueSavedChatArchiveRequestV1`.
- no Chrome `materializeSavedChatArchiveRequestV1`.
- no package writer call from Chrome.
- no CAS / store / SQLite writes from Chrome.
- no native messaging; no localhost relay.
- no sync/WebDAV/cloud.
- no import/recovery.
- no `S0F0j` edit.
- no `S0F1j` edit (investigation found no safe non-locked point inside it;
  default is no).
- no global floating proof/debug button.

## 7. Implementation Phases After This Contract

- **E.2.1 — static status model/helper.** A new focused module
  (e.g. `src-surfaces-base/studio/ingestion/saved-chat-archive-status.studio.js`)
  exposing a **pure** status-model `computeSavedChatArchiveStatusV1({ row, local,
  diagnostics, receipt })` -> one of the §2 states. To avoid the E.1.1 drift bug,
  reuse the on-save eligibility predicate rather than re-implementing it; this
  requires E.2.1 to add **read-only** accessors to the on-save module:
  (a) export the saved-wins eligibility check, and (b) persist + expose the
  per-row `requestId` (enrich the delivered entry to `{ requestId, deliveredAt }`).
  Plus a focused validator.
- **E.2.2 — minimal UI shell** in the safe modular host (render a
  `wbBadge--archive-status` span via a one-line `studio.js` delegation, or the
  Settings fallback). No app-wide overlay.
- **E.2.3 — read-back integration** behind the explicit "Check archive status"
  gesture, mapping receipt verdicts to §2 states.
- **E.2.4 — runtime smoke** (states render correctly for delivered, waiting,
  needs-snapshot, link-only-excluded, archive-off, folder-not-connected).
- **E.2.5 — closure.**

## 8. Acceptance Criteria

- status can distinguish delivered/deduped vs waiting/failed.
- linked saved rows remain supported (saved wins over `isLinked`).
- link-only Add-to-Library rows do not show archived status as if saved.
- the default feature remains quiet and safe (flag OFF -> "Archive off" / no
  noisy surface).
- no duplicate delivery is triggered by status rendering or read-back.
- no background polling.
- no authority drift from Desktop to Chrome (read-back is informational; the
  Desktop queue stays the source of truth).

## Files Likely Touched Later (Not In E.2.0)

- new `src-surfaces-base/studio/ingestion/saved-chat-archive-status.studio.js`.
- additive read-only exports in
  `src-surfaces-base/studio/ingestion/saved-chat-archive-on-save.mv3.js`
  (eligibility predicate + per-row `requestId` in the delivered map).
- new `tools/validation/studio/validate-saved-chat-archive-status-v1.mjs`.
- a one-line delegation in `src-surfaces-base/studio/studio.js` `renderRow`
  (hunk-staged) and/or the Settings fallback, plus `studio.html` /
  `pack-studio.mjs` loader/ship lines (hunk-staged) for the new module.

## Files That Must Not Be Touched

- `S0F0j. 🎬 Library Actions Core - Studio.js`, `S0F1j. 🎬 Library Actions - Studio.js`.
- Desktop runtime, Tauri capabilities, request inbox scanner, queue, materializer,
  package writer/projector, asset CAS, store adapters, Archive Health UI, sync
  files, Chrome service-worker, import/recovery, WebDAV/cloud, user-folder
  export/save-dialog, and the shipped delivery module's behavior (status reuses
  its read-only APIs, does not change them).

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

E.2.0 is CONTRACT - NOT IMPLEMENTED. The inline archive status surface is
contract-locked: a quiet, passive, product-language row-level indicator hosted in
the non-locked `studio.js` `renderRow` (Settings fallback), driven by the local
`chatId|snapshotId` delivered map plus read-only receipt read-back on an explicit
gesture, with saved-wins eligibility, no app-wide overlay, no polling, and Chrome
intent-only / Desktop authoritative. The first build step (E.2.1) adds a pure
status model and two read-only accessors (eligibility + per-row requestId) to the
on-save module.

Recommended next implementation step: E.2.1 — the pure status model/helper module
plus the read-only on-save accessors and a focused validator.

Do not implement yet.
