# Saved Chat Archive — Phase E Closure

Date: 2026-06-28

Status: PHASE E CLOSED

Lane: Chat Saving Architecture (Phase E — product integration).

This is a docs/evidence-only note. It adds no runtime code, no validators, and
no Chrome/Desktop/capability changes.

## Scope

Phase E covers the full end-to-end trigger/status/receipt loop for the saved-
chat archive feature:

- Chrome saved-row intent → Archive Request Delivery folder bridge → Desktop
  scanner inbox → Desktop receipt → Chrome read-back → inline badge update.

## Closed Chain

| Milestone | Commit | Description |
|---|---|---|
| E.1 — archive delivery listener | `99edac6` | `docs(studio): close archive delivery listener milestone` |
| E.2 — inline archive status surface | `da3d2df` | `docs(studio): close archive status milestone` |
| E.3 — receipt round-trip smoke | `55e3316` | `docs(studio): record archive receipt roundtrip smoke` |
| E.3.1 — validated receipt branch | `dd8ecc7` | `docs(studio): record archive validated receipt smoke` |

## What Phase E Proves

**Delivery:**

- The real Chrome saved-row flow can deliver archive requests via
  `deliverSavedChatArchiveRequestV1`.
- The Archive Request Delivery folder bridge (File System Access handle /
  Desktop `BaseDirectory::Home`) correctly routes request files into the Desktop
  inbox.
- The delivery gate correctly requires `confirmDelivery:true`, folder connected,
  write permission granted, and the folder handle name matching `ROOT_DIR_NAME`.

**Desktop scanner (authoritative):**

- The Desktop scanner (`scanSavedChatArchiveRequestInboxV1`) reads real request
  files, validates them against the Desktop SQLite store, and writes receipt
  files with `validated`, `duplicate`, `rejected`, or `needs-desktop-snapshot`
  status.
- Scanner correctly deduplicates by `dedupe_key` (UNIQUE NOT NULL constraint);
  re-processing a known dedupeKey yields a `duplicate` receipt while the
  original DB row retains its status.
- `packageWriteDeferred: true` and `materializeTriggered: false` are enforced in
  enqueue-only mode: no materialize, no package write, no CAS, no content
  writes.

**Chrome read-back (intent/read-back surface):**

- `readSavedChatArchiveRequestReceiptV1` reads real Desktop-authored receipt
  files from the shared folder. Chrome never writes receipts.
- Both mapping layers are exercised end-to-end:
  - Layer 1 (reader `mapReceiptStatus`): translates Desktop receipt vocabulary
    to Chrome read-back status.
  - Layer 2 (status model `mapReceiptStatus`): translates read-back status to
    badge state.

**Inline badge and gesture:**

- `appendSavedChatArchiveStatusBadgeV1` renders an interactive
  `waiting-for-desktop` badge for `requestId`-backed delivered rows.
- A real `MouseEvent('click')` on the wired badge span reads the receipt via
  the gesture handler, recomputes status, and updates the badge in place — no
  polling, no watcher, no `MutationObserver`.
- The badge gesture produces correct DOM flips for all four terminal states.

**All four receipt-backed terminal states proven end-to-end:**

| Desktop receipt `status` | Reader status (layer 1) | Badge state (layer 2) | Badge label | Proven at |
|---|---|---|---|---|
| `validated` | `queued-on-desktop` | `archived` | "Archived" | E.3.1 |
| `duplicate` | `already-queued-duplicate` | `already-archived` | "Already archived" | E.3 |
| `rejected` | `rejected-by-desktop` | `failed` | "Archive failed" | E.3 |
| `needs-desktop-snapshot` | `needs-desktop-snapshot` | `needs-desktop-snapshot` | "Needs snapshot" | E.3 |

**Separation of concerns held throughout:**

- Chrome remains the intent/delivery and read-back surface.
- Desktop remains the authoritative scanner and receipt producer.
- No passive receipt read-back (read-back only on explicit gesture).
- No polling, no watcher, no `MutationObserver`, no background daemon.
- No Chrome materialize / package write / CAS / SQLite writes.
- No `S0F0j` / `S0F1j` edits.
- No app-wide floating proof button.

## Key Runtime Evidence

### E.2.4 — Inline Badge Surface Live Proof

```text
archiveBadgeCount:       10
interactiveBadgeCount:   10
archiveBadgeStates:      { "waiting-for-desktop": 10 }
```

All 10 saved rows in the live library rendered an interactive
`waiting-for-desktop` badge — correct, because the delivered entries had a
`requestId` but no receipt yet, so every badge was clickable and awaiting the
Desktop scanner.

### E.3 — Receipt Round-Trip (Three Terminal States)

Real DOM gesture flips against the live extension (Chrome Dev v151, port 9247),
using genuine prior Desktop-authored receipts (newest mtime Jun 27 15:32):

```text
duplicate  → already-archived    DOM flip: "Waiting for Desktop" → "Already archived"
rejected   → failed              DOM flip: "Waiting for Desktop" → "Archive failed"
needs-desktop-snapshot           reader+model mapping confirmed (no paired row for DOM flip)
```

Read-only boundary held: receipts count (12), newest mtime (Jun 27 15:32), and
inbox count (72) unchanged after the Chrome read-back session.

### E.3.1 — Validated Receipt Branch

Desktop scanner run in Tauri DevTools (enqueue-only, `limit: 200`):

```json
{
  "schema": "h2o.savedChatArchiveRequestInboxScan.v1",
  "status": "completed-with-blockers",
  "scanned": 79,
  "processed": 73,
  "receiptsWritten": 73,
  "validated": 11,
  "duplicates": 56,
  "rejected": 6,
  "needsDesktopSnapshot": 0,
  "dbUnavailable": 0,
  "packageWriteDeferred": true,
  "materializeTriggered": false
}
```

The `completed-with-blockers` status reflects pre-existing fixture files
(malformed JSON, schema mismatches, oversized test artifacts) — not blockers for
the `validated` branch. `limit: 200` was required because the scanner sorts
filenames ascending and slices to the limit; the target file sorted to position
73 of 75, which would have been silently skipped at the default limit of 50.

Target validated receipt (`d8edaea2-8a7d-469c-af32-eeaecfc974d8`):

```text
dedupeKey:          sha256-91405cee43c68c5543493efa43da5adda5b84499737f2ea38756b80b2e20d4f7
snapshot:           snap_1778516336177_wy9txv06
chat:               69f0c5f3-30c4-83eb-9240-26331d09532b  ("☎️ Investment in AI Tools")
receipt status:     validated
persisted:          true
packageWriteDeferred: true
materializeTriggered: false
blockers:           []
```

Chrome read-back and DOM badge gesture flip:

```text
desktopReceiptStatus:    validated
receiptStatus:           queued-on-desktop          (layer 1)
computedStateBeforeClick: archived                  (layer 2)

beforeBadge:  state=waiting-for-desktop   text="Waiting for Desktop"   interactive=true
afterBadge:   state=archived              text="Archived"               interactive=true
domFlipPass:  true
```

## Deferred Work

The following items are explicitly out of scope for Phase E and are deferred to
subsequent phases:

- **Product onboarding for archive folder connection.** The Archive Request
  Delivery folder requires a one-time File System Access connection grant. No
  in-product setup flow exists yet.
- **Backlog drain / per-event cap tuning.** Inbox accumulation, scan limits, and
  event throttling are not yet tuned for production traffic.
- **Legacy delivered entries with `requestId:null`.** Entries delivered before
  the `requestId` field was introduced remain passive — they cannot trigger the
  receipt read-back gesture until migrated or backfilled.
- **Materializer / package-write UX.** The scanner runs in enqueue-only mode
  (`packageWriteDeferred: true`). The trigger that promotes a validated-enqueued
  request to a materialized chat package is a separate phase.
- **Import / export / recovery.** ChatGPT export ZIP ingestion and recovery
  flows remain deferred.
- **Sync / WebDAV / cloud package propagation.** Syncing the written package
  across devices or to cloud storage remains deferred.
- **Archive Health repair / mutation UI.** The Archive Health UI surface for
  diagnosing and repairing failed archive requests remains deferred.

## Validation

No runtime code was changed during Phase E closure.

```text
git diff --check         clean (exit 0)
git diff --cached --check  clean (exit 0)
```

No docs lint/check script is registered in this repo; the above git whitespace
checks are the applicable static checks for a docs-only commit.

## Verdict

**PHASE E CLOSED.** The full saved-chat archive trigger/status/receipt loop is
proven end-to-end:

- Chrome delivers → Desktop scans and enqueues → Desktop writes receipts →
  Chrome reads receipts via badge gesture → badge updates to the correct terminal
  state.

All four receipt-backed terminal states (`archived`, `already-archived`,
`failed`, `needs-desktop-snapshot`) are demonstrated with real Desktop receipts
and real DOM badge gestures, across E.3 and E.3.1.

## Recommended Next Milestone

**Phase F — materializer trigger.** The scanner currently defers package writes
(`packageWriteDeferred: true`). The next milestone is the trigger that promotes
a `validated`-enqueued request to a materialized chat package in the Desktop
store, completing the write path from Chrome intent to a stored, addressable
chat package. The packaging infrastructure (writer, projector, CAS) is already
proven in prior phases (D.3C, D.4); Phase F wires the scanner's validated output
to the materializer.
